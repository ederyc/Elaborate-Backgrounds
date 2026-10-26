/*
  The renderer: bakes a scene's layers into textures once, then composites
  them every beat and runs the post stack.

  Baking: every bake program is compiled up front, in parallel where the
  browser supports it. Then each layer's paint list (bespoke art shaders and
  generic elements) is drawn into its texture, each item only over its own
  bounding box. Cycle animations bake one texture per frame.

  Per beat: every layer is one textured quad, drawn back to front with
  premultiplied alpha. Its position comes from camera drift times its depth
  (parallax) plus its own animation (drift, sway or a cycle of baked
  frames). Boil wobbles each layer's texture lookup with a smooth noise that
  changes seed on the beat.

  Work is only done when something changes: the scene and the bloom chain
  re-render on a new beat or a new setting, and the final pass re-runs every
  display frame only when grain is set to change per frame.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const G = () => LB.gl;
  const TAU = Math.PI * 2;

  const LAYER_VERT = `
in vec2 aPos;
uniform vec4 uRect;
uniform vec2 uPivot;
uniform float uAngle;
uniform vec2 uOffset;
uniform vec4 uView;
out vec2 vUv;
void main() {
  vUv = aPos;
  vec2 p = mix(uRect.xy, uRect.zw, aPos);
  vec2 d = p - uPivot;
  float c = cos(uAngle), s = sin(uAngle);
  p = uPivot + vec2(c * d.x - s * d.y, s * d.x + c * d.y) + uOffset;
  vec2 n = (p - uView.xy) / uView.zw;
  gl_Position = vec4(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);
}`;

  const LAYER_FRAG = `
in vec2 vUv;
uniform sampler2D uTex, uNoise;
uniform vec2 uBoilScale, uBoilSeed, uBoilAmp;
uniform vec3 uHaze;
uniform float uHazeAmt;
out vec4 outColor;
void main() {
  vec2 n = texture(uNoise, vUv * uBoilScale + uBoilSeed).rg - 0.5;
  vec4 c = texture(uTex, vUv + n * uBoilAmp);
  c.rgb = mix(c.rgb, uHaze * c.a, uHazeAmt);
  outColor = c;
}`;

  // Sparkles: one instanced draw. Each twinkles 1-3 times per loop, so the loop stays seamless.
  const SPARKLE_VERT = `
in vec2 aPos;
uniform vec4 uArea, uView;
uniform vec2 uOffset;
uniform float uSize, uTime, uLoop, uJitter;
out vec2 vUv;
out float vBright;
float h1(float n) { return fract(sin(n * 127.1) * 43758.5453); }
void main() {
  float i = float(gl_InstanceID);
  vec2 c = mix(uArea.xy, uArea.zw, vec2(h1(i + 1.3), h1(i + 7.9)));
  float k = floor(1.0 + h1(i + 3.1) * 3.0);
  float tw = sin(6.2831853 * (uTime / uLoop * k + h1(i + 5.7)));
  vBright = pow(max(tw, 0.0), 5.0);
  float s = uSize * (0.6 + 0.8 * h1(i + 9.2)) * (0.6 + 0.4 * vBright);
  vec2 jit = (vec2(h1(i + uJitter * 3.3), h1(i + uJitter * 5.1 + 2.0)) - 0.5) * uSize * 0.3;
  vec2 p = c + jit + (aPos - 0.5) * s * 2.0 + uOffset;
  vUv = aPos * 2.0 - 1.0;
  vec2 n = (p - uView.xy) / uView.zw;
  gl_Position = vec4(n.x * 2.0 - 1.0, 1.0 - n.y * 2.0, 0.0, 1.0);
}`;
  const SPARKLE_FRAG = `
in vec2 vUv;
in float vBright;
uniform vec3 uColor;
out vec4 outColor;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 9.0);
  float star = exp(-abs(vUv.x) * 16.0) * exp(-abs(vUv.y) * 2.6) + exp(-abs(vUv.y) * 16.0) * exp(-abs(vUv.x) * 2.6);
  float a = clamp((core + star * 0.55) * vBright, 0.0, 1.0);
  outColor = vec4(uColor * a, a * 0.85);
}`;

  // Deterministic per-beat randomness for boil.
  function rand(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function createRenderer(canvas, scene, opts = {}) {
    const gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available");
    const { program, target, freeTarget, quad, bindTarget, bindTex, rgb, texture, FULLSCREEN_VERT } = G();
    const art = LB.art[scene.art];
    const P = LB.POST_GLSL;
    const maxTex = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    const vao = quad(gl);

    const progs = {
      layer: program(gl, LAYER_VERT, LAYER_FRAG, "layer"),
      sparkle: program(gl, SPARKLE_VERT, SPARKLE_FRAG, "sparkle"),
      copy: program(gl, FULLSCREEN_VERT, P.COPY, "copy"),
      blur: program(gl, FULLSCREEN_VERT, P.BLUR, "blur"),
      down: program(gl, FULLSCREEN_VERT, P.DOWN, "down"),
      up: program(gl, FULLSCREEN_VERT, P.UP, "up"),
      final: program(gl, FULLSCREEN_VERT, P.FINAL, "final"),
    };

    // Boil noise: 64x64 random values, smoothed by linear filtering. One texel = one boil wavelength.
    const noiseData = new Uint8Array(64 * 64 * 4);
    for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.floor(rand(i * 1.618 + 3) * 256);
    const noiseTex = texture(gl, 64, 64, { data: noiseData, repeat: true });

    const quality = opts.quality || "high";
    const bloomLevels = quality === "low" ? 3 : 5;
    // Bake density, in texture px per scene unit. Fixed at load, from the screen, so resizing never re-bakes.
    const density = Math.min(quality === "low" ? 720 : 1200, Math.max(540, Math.round(opts.bakeHeight || 1080)));

    const layers = scene.layers.map((L, index) => {
      const l = { ...L, index };
      if (L.type === "sprite") l.rect = LB.SPRITE.bbox(l);
      return l;
    });

    let W = 0, H = 0;
    let view = [0, 0, 1, 1];
    let rt = {};
    let post = null;
    let lastBeat = -1, dirty = true, baked = false;
    let grade = scene.grades[scene.grade];

    // ---------- baking ----------
    // What draws each layer: a sprite, or a paint list of bespoke shaders and generic elements.
    const paintOf = (L) => (L.type === "sprite" ? [{ sprite: true }] : L.paint);
    const progKey = (item) => (item.sprite ? "sprite" : item.shader ? "art:" + item.shader : "el:" + item.el);
    const progSource = (key) => {
      const [kind, name] = key.split(":");
      const body = kind === "sprite" ? LB.SPRITE.glsl : kind === "art" ? art.bakes[name] : LB.ELEMENTS[name].glsl;
      return LB.MATERIALS_GLSL + body;
    };

    async function bake(onProgress) {
      // Compile every bake program first, all at once.
      const keys = [...new Set(layers.filter((L) => L.type !== "sparkles").flatMap((L) => paintOf(L).map(progKey)))];
      const t0 = performance.now();
      const compiled = await LB.gl.programs(gl, keys.map((k) => [FULLSCREEN_VERT, progSource(k), "bake " + k]));
      const bakeProgs = Object.fromEntries(keys.map((k, i) => [k, compiled[i]]));
      if (opts.timeBake) { gl.finish(); console.log(`compile ${keys.length} bake programs: ${(performance.now() - t0).toFixed(0)}ms`); }
      if (onProgress) onProgress(0.5);

      const t1 = performance.now();
      const jobs = [];
      for (const L of layers) {
        if (L.type === "sparkles") continue;
        const frames = L.anim && L.anim.type === "cycle" ? L.anim.frames : 1;
        const res = L.res || 1;
        let w = (L.rect[2] - L.rect[0]) * density * res;
        let h = (L.rect[3] - L.rect[1]) * density * res;
        const shrink = Math.min(1, maxTex / Math.max(w, h));
        w = Math.round(w * shrink);
        h = Math.round(h * shrink);
        L.texSize = [w, h];
        L.textures = [];
        for (let f = 0; f < frames; f++) jobs.push({ L, f, w, h });
      }
      const TILE = 512;
      let lastYield = performance.now();
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      gl.bindVertexArray(vao);
      for (let ji = 0; ji < jobs.length; ji++) {
        const { L, f, w, h } = jobs[ji];
        const t = target(gl, w, h);
        bindTarget(gl, t);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        const [rx0, ry0, rx1, ry1] = L.rect;
        paintOf(L).forEach((item, pi) => {
          const pr = bakeProgs[progKey(item)];
          gl.useProgram(pr.prog);
          gl.uniform4f(pr.u.uRect, rx0, ry0, rx1, ry1);
          gl.uniform2f(pr.u.uRes, w, h);
          gl.uniform1f(pr.u.uPx, (ry1 - ry0) / h);
          gl.uniform1f(pr.u.uSeed, L.index * 1.37 + pi * 0.71);
          gl.uniform1f(pr.u.uFrame, f);
          gl.uniform1i(pr.u.uN, item.n || 0);
          gl.uniform1i(pr.u.uOne, 1);
          let box = [rx0, ry0, rx1, ry1];
          if (item.sprite) LB.SPRITE.set(gl, pr.u, L);
          else if (item.el) {
            const E = LB.ELEMENTS[item.el];
            E.set(gl, pr.u, item);
            box = E.bbox(item);
          }
          // Only touch the pixels this item can cover, in tiles so no single draw runs long.
          const px0 = Math.max(0, Math.floor(((box[0] - rx0) / (rx1 - rx0)) * w));
          const px1 = Math.min(w, Math.ceil(((box[2] - rx0) / (rx1 - rx0)) * w));
          const py0 = Math.max(0, Math.floor(((box[1] - ry0) / (ry1 - ry0)) * h));
          const py1 = Math.min(h, Math.ceil(((box[3] - ry0) / (ry1 - ry0)) * h));
          gl.enable(gl.SCISSOR_TEST);
          for (let y = py0; y < py1; y += TILE) {
            for (let x = px0; x < px1; x += TILE) {
              gl.scissor(x, y, Math.min(TILE, px1 - x), Math.min(TILE, py1 - y));
              gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            }
          }
          gl.disable(gl.SCISSOR_TEST);
        });
        gl.flush();
        L.textures.push(t.tex);
        gl.deleteFramebuffer(t.fb);
        if (performance.now() - lastYield > 30) {
          if (onProgress) onProgress(0.5 + 0.5 * (ji / jobs.length));
          await new Promise((r) => setTimeout(r, 0));
          lastYield = performance.now();
        }
      }
      gl.disable(gl.BLEND);
      if (opts.timeBake) { gl.finish(); console.log(`bake ${jobs.length} textures: ${(performance.now() - t1).toFixed(0)}ms`); }
      if (onProgress) onProgress(1);
      baked = true;
      dirty = true;
    }

    // ---------- sizing ----------
    function resize(w, h) {
      w = Math.max(2, Math.round(w));
      h = Math.max(2, Math.round(h));
      if (w === W && h === H) return;
      W = w; H = h;
      canvas.width = W;
      canvas.height = H;
      // Cover-fit the 16:9 scene; on narrower screens keep the focus point in view.
      const a = W / H, A = scene.aspect;
      if (a >= A) {
        const vh = A / a;
        view = [0, (1 - vh) * 0.5, A, vh];
      } else {
        const vw = a;
        const x0 = Math.min(Math.max(scene.focus[0] - vw / 2, 0), A - vw);
        view = [x0, 0, vw, 1];
      }
      for (const k in rt) {
        if (Array.isArray(rt[k])) rt[k].forEach((t) => freeTarget(gl, t));
        else freeTarget(gl, rt[k]);
      }
      rt.scene = target(gl, W, H);
      rt.halfA = target(gl, W / 2, H / 2);
      rt.halfB = target(gl, W / 2, H / 2);
      rt.down = [];
      rt.up = [];
      for (let i = 0; i < bloomLevels; i++) {
        const s = Math.pow(2, i + 1);
        rt.down.push(target(gl, W / s, H / s));
        if (i < bloomLevels - 1) rt.up.push(target(gl, W / s, H / s));
      }
      dirty = true;
    }

    // ---------- settings ----------
    function setPost(p) { post = p; dirty = true; }
    function setGrade(g) { grade = g; dirty = true; }
    function invalidate() { dirty = true; }

    // ---------- drawing ----------
    function fullscreen(pr) {
      gl.useProgram(pr.prog);
      gl.bindVertexArray(vao);
      return pr.u;
    }
    function drawQuad() { gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); }

    function layerPose(L, t, seed, cam) {
      const loop = LB.LOOP;
      let ox = cam[0] * L.depth, oy = cam[1] * L.depth, angle = 0, frame = 0;
      const a = L.anim;
      if (a && post.motion) {
        if (a.type === "drift") {
          ox += a.amp[0] * Math.sin(TAU * t / loop);
          oy += a.amp[1] * Math.sin(2 * TAU * t / loop);
        } else if (a.type === "sway") {
          const k = a.speed || 1;
          angle = a.amp * Math.sin(TAU * k * t / loop + a.phase) + a.amp * 0.25 * Math.sin(3 * TAU * k * t / loop + a.phase * 1.7);
        } else if (a.type === "cycle") {
          frame = Math.floor(t * a.rate + 1e-6) % a.frames;
        }
      }
      // Sprites also get a tiny per-beat nudge, like a puppet that never sits in exactly the same spot.
      if (L.type === "sprite" && post.boil > 0) {
        const k = post.boil * view[3] / 1080;
        angle += (rand(L.index * 31 + seed * 7) - 0.5) * 0.008 * post.boil;
        ox += (rand(L.index * 17 + seed * 3) - 0.5) * k;
        oy += (rand(L.index * 13 + seed * 5) - 0.5) * k;
      }
      return { ox, oy, angle, frame };
    }

    function drawLayers(list, t, seed, cam) {
      const u = progs.layer.u;
      gl.useProgram(progs.layer.prog);
      gl.bindVertexArray(vao);
      gl.uniform4f(u.uView, ...view);
      gl.uniform1i(u.uTex, 0);
      gl.uniform1i(u.uNoise, 1);
      bindTex(gl, 1, noiseTex);
      const haze = rgb(scene.horizon);
      gl.uniform3f(u.uHaze, ...haze);
      for (const L of list) {
        if (post.hidden && post.hidden[L.id]) continue;
        if (L.type === "sparkles") {
          drawSparkles(L, t, seed, cam);
          gl.useProgram(progs.layer.prog);
          gl.bindVertexArray(vao);
          continue;
        }
        const pose = layerPose(L, t, seed, cam);
        const [x0, y0, x1, y1] = L.rect;
        const pivot = L.type === "sprite" ? L.a : [(x0 + x1) / 2, (y0 + y1) / 2];
        gl.uniform4f(u.uRect, x0, y0, x1, y1);
        gl.uniform2f(u.uPivot, pivot[0], pivot[1]);
        gl.uniform1f(u.uAngle, pose.angle);
        gl.uniform2f(u.uOffset, pose.ox, pose.oy);
        // Boil: wavelength ~40px and amplitude in px, both measured at 1080p.
        const wl = 40 / 1080, amp = (L.boil || 0) * post.boil / 1080;
        gl.uniform2f(u.uBoilScale, (x1 - x0) / wl, (y1 - y0) / wl);
        gl.uniform2f(u.uBoilSeed, rand(seed * 3 + L.index) * 64, rand(seed * 5 + L.index + 0.5) * 64);
        gl.uniform2f(u.uBoilAmp, (amp * 2) / (x1 - x0), (amp * 2) / (y1 - y0));
        gl.uniform1f(u.uHazeAmt, (L.haze || 0) * post.haze);
        bindTex(gl, 0, L.textures[pose.frame]);
        drawQuad();
      }
    }

    function drawSparkles(L, t, seed, cam) {
      const u = progs.sparkle.u;
      gl.useProgram(progs.sparkle.prog);
      gl.bindVertexArray(vao);
      gl.uniform4f(u.uArea, ...L.area);
      gl.uniform4f(u.uView, ...view);
      gl.uniform2f(u.uOffset, cam[0] * L.depth, cam[1] * L.depth);
      gl.uniform1f(u.uSize, L.size);
      gl.uniform1f(u.uTime, post.motion ? t : 0.4);
      gl.uniform1f(u.uLoop, LB.LOOP);
      gl.uniform1f(u.uJitter, post.boil > 0 ? seed + 1 : 0);
      gl.uniform3f(u.uColor, ...rgb(L.color));
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, L.count);
    }

    function renderScene(clock) {
      const t = clock.beatTime, seed = clock.boilSeed;
      const d = scene.camera.drift;
      const cam = post.motion ? [d[0] * Math.sin(TAU * t / LB.LOOP), d[1] * Math.sin(2 * TAU * t / LB.LOOP)] : [0, 0];
      bindTarget(gl, rt.scene);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawLayers(layers.filter((L) => L.far), t, seed, cam);
      gl.disable(gl.BLEND);

      if (post.on.depth && post.depth.radius > 0) {
        // Downsample the far layers, blur them both ways, and put them back.
        bindTarget(gl, rt.halfA);
        let u = fullscreen(progs.copy);
        bindTex(gl, 0, rt.scene.tex);
        gl.uniform1i(u.uTex, 0);
        drawQuad();
        const r = post.depth.radius / 2;
        u = fullscreen(progs.blur);
        gl.uniform1i(u.uTex, 0);
        bindTarget(gl, rt.halfB);
        bindTex(gl, 0, rt.halfA.tex);
        gl.uniform2f(u.uDir, r / rt.halfA.w, 0);
        drawQuad();
        bindTarget(gl, rt.halfA);
        bindTex(gl, 0, rt.halfB.tex);
        gl.uniform2f(u.uDir, 0, r / rt.halfA.h);
        drawQuad();
        bindTarget(gl, rt.scene);
        u = fullscreen(progs.copy);
        bindTex(gl, 0, rt.halfA.tex);
        drawQuad();
      }

      bindTarget(gl, rt.scene);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
      drawLayers(layers.filter((L) => !L.far), t, seed, cam);
      gl.disable(gl.BLEND);
    }

    function renderBloom() {
      // Down the chain from the scene, then back up, adding each level onto the next.
      let u = fullscreen(progs.down);
      gl.uniform1i(u.uTex, 0);
      let src = rt.scene;
      for (const d of rt.down) {
        bindTarget(gl, d);
        bindTex(gl, 0, src.tex);
        gl.uniform2f(u.uTexel, 1 / src.w, 1 / src.h);
        drawQuad();
        src = d;
      }
      u = fullscreen(progs.up);
      gl.uniform1i(u.uTex, 0);
      gl.uniform1i(u.uBase, 1);
      gl.uniform1f(u.uWeight, post.bloom.radius);
      src = rt.down[rt.down.length - 1];
      for (let i = rt.up.length - 1; i >= 0; i--) {
        bindTarget(gl, rt.up[i]);
        bindTex(gl, 0, src.tex);
        bindTex(gl, 1, rt.down[i].tex);
        gl.uniform2f(u.uTexel, 1 / src.w, 1 / src.h);
        drawQuad();
        src = rt.up[i];
      }
    }

    function renderFinal(clock, frameCount) {
      bindTarget(gl, null);
      const u = fullscreen(progs.final);
      const on = post.on;
      bindTex(gl, 0, rt.scene.tex);
      bindTex(gl, 1, rt.up.length ? rt.up[0].tex : rt.down[0].tex);
      bindTex(gl, 2, rt.down[Math.min(2, rt.down.length - 1)].tex);
      gl.uniform1i(u.uScene, 0);
      gl.uniform1i(u.uBloom, 1);
      gl.uniform1i(u.uHal, 2);
      let norm = 0;
      for (let i = 0; i < bloomLevels; i++) norm += Math.pow(post.bloom.radius, i);
      gl.uniform1f(u.uBloomNorm, norm);
      gl.uniform4f(u.uOn, +on.bloom, +on.halation, +on.grade, +on.ca);
      gl.uniform2f(u.uOn2, +on.vignette, +on.grain);
      gl.uniform1f(u.uGlow, post.bloom.glow);
      gl.uniform1f(u.uThreshold, post.bloom.threshold);
      gl.uniform1f(u.uMist, post.bloom.mist);
      gl.uniform1f(u.uHalAmount, post.halation.amount);
      gl.uniform1f(u.uHalThreshold, post.halation.threshold);
      gl.uniform3f(u.uHalColor, ...rgb(post.halation.color));
      const g = grade;
      gl.uniform1f(u.uExposure, g.exposure);
      gl.uniform1f(u.uTemp, g.temperature);
      gl.uniform1f(u.uTint, g.tint);
      gl.uniform1f(u.uContrast, g.contrast);
      gl.uniform1f(u.uSat, g.saturation);
      gl.uniform1f(u.uWhiteCap, g.whiteCap);
      gl.uniform1f(u.uRedCap, g.redCap);
      gl.uniform1f(u.uSplit, g.split);
      gl.uniform3f(u.uFloor, ...rgb(g.floor));
      gl.uniform3f(u.uShadowTint, ...rgb(g.shadowTint));
      gl.uniform3f(u.uHighTint, ...rgb(g.highlightTint));
      gl.uniform1f(u.uCa, post.ca.amount);
      gl.uniform1f(u.uVig, post.vignette.amount);
      gl.uniform3f(u.uVigColor, ...rgb(post.vignette.color));
      gl.uniform1f(u.uGrain, post.grain.amount);
      gl.uniform1f(u.uGrainSeed, post.grain.perFrame ? frameCount % 997 : clock.beat);
      gl.uniform2f(u.uRes, W, H);
      drawQuad();
    }

    let frameCount = 0;
    // Returns what was drawn this frame: "scene", "final" or "" (nothing changed).
    function draw(clock) {
      if (!baked) return "";
      frameCount++;
      const beat = clock.beat;
      let drew = "";
      if (dirty || beat !== lastBeat) {
        renderScene(clock);
        if (post.on.bloom || post.on.halation) renderBloom();
        lastBeat = beat;
        drew = "scene";
      }
      if (drew || dirty || (post.on.grain && post.grain.perFrame)) {
        renderFinal(clock, frameCount);
        drew = drew || "final";
      }
      dirty = false;
      return drew;
    }

    return {
      gl, bake, resize, setPost, setGrade, invalidate, draw,
      get size() { return [W, H]; },
      get density() { return density; },
      get layers() { return layers; },
    };
  }

  LB.createRenderer = createRenderer;
})();
