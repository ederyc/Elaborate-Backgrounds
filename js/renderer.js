/*
  The renderer: bakes a scene's layers into textures, then composites them
  every beat and runs the post stack.

  Baking: each layer's paint list (bespoke art shaders, reusable elements,
  shapes and images) is drawn into its texture, each item only over its own
  bounding box. Cycle animations bake one texture per frame. Bake programs
  compile once, in parallel where the browser supports it, and are cached.

  Syncing: sync(scene) takes a new version of the scene and rebakes only
  the layers whose look changed. Moving a whole layer, changing its depth,
  boil, haze, motion or opacity, or hiding it needs no rebake at all. That
  is what lets the editor change one thing and see it on the next frame.

  Per beat: every layer is one textured quad, drawn back to front with
  premultiplied alpha. Its position comes from camera drift times its depth
  (parallax), plus its own offset and animation (drift, sway or a cycle of
  baked frames). Boil wobbles each layer's texture lookup with a smooth
  noise that changes seed on the beat.

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
uniform float uHazeAmt, uAlpha;
out vec4 outColor;
void main() {
  vec2 n = texture(uNoise, vUv * uBoilScale + uBoilSeed).rg - 0.5;
  vec4 c = texture(uTex, vUv + n * uBoilAmp);
  c.rgb = mix(c.rgb, uHaze * c.a, uHazeAmt);
  outColor = c * uAlpha;
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
uniform float uAlpha;
out vec4 outColor;
void main() {
  float r = length(vUv);
  float core = exp(-r * r * 9.0);
  float star = exp(-abs(vUv.x) * 16.0) * exp(-abs(vUv.y) * 2.6) + exp(-abs(vUv.y) * 16.0) * exp(-abs(vUv.x) * 2.6);
  float a = clamp((core + star * 0.55) * vBright, 0.0, 1.0) * uAlpha;
  outColor = vec4(uColor * a, a * 0.85);
}`;

  // Layer fields that only change how a baked layer is placed and blended, never what's in it.
  const COMPOSITE_KEYS = new Set(["baseRect", "order", "sig", "id", "name", "depth", "boil", "haze", "far", "offset", "opacity", "hidden", "locked", "pivot", "anim", "index", "note"]);
  // Scene bounds a layer's texture may cover (the frame plus room for parallax and dragging past the edge).
  const LIMIT = [-0.35, -0.35, 16 / 9 + 0.35, 1.35];

  // Deterministic per-beat randomness for boil.
  function rand(n) {
    const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
  }

  function createRenderer(canvas, initialScene, opts = {}) {
    const gl = canvas.getContext("webgl2", {
      alpha: false, antialias: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: !!opts.preserve, powerPreference: "high-performance",
    });
    if (!gl) throw new Error("WebGL2 is not available");
    const { program, target, freeTarget, quad, bindTarget, bindTex, rgb, texture, FULLSCREEN_VERT } = G();
    const I = LB.ITEMS;
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
    // Bound wherever a bake shader has a sampler but no image to read.
    const whiteTex = texture(gl, 1, 1, { data: new Uint8Array([255, 255, 255, 255]) });

    const quality = opts.quality || "high";
    const bloomLevels = quality === "low" ? 3 : 5;
    // Bake density, in texture px per scene unit. Fixed at load, from the screen, so resizing never re-bakes.
    const density = Math.min(quality === "low" ? 720 : 1200, Math.max(540, Math.round(opts.bakeHeight || 1080)));

    let scene = initialScene;
    let layers = [];
    let W = 0, H = 0;
    let view = [0, 0, 1, 1];
    let rt = {};
    let post = null;
    let lastBeat = -1, dirty = true, baked = false;
    let grade = scene.grades ? scene.grades[scene.grade] : null;

    const progCache = new Map();  // bake program key -> compiled program
    const layerCache = new Map(); // layer id -> { sig, textures, texSize }
    const imageCache = new Map(); // image id -> { tex, w, h, img }
    const maskCache = new Map();  // mask key -> { tex, w, h, bin }
    LB.imageInfo = (id) => imageCache.get(id);
    LB.maskInfo = (key) => maskCache.get(key);

    // ---------- what each layer needs ----------
    const art = () => (scene.art && LB.art ? LB.art[scene.art] : null);
    const paintOf = (L) => (L.type === "sprite" ? [{ sprite: true }] : L.paint || []);
    const progKey = (item) => (item.sprite ? "sprite" : item.shader ? "art:" + item.shader : "el:" + item.el);
    function progSource(key) {
      const [kind, name] = key.split(":");
      let body;
      if (kind === "sprite") body = LB.SPRITE.glsl;
      else if (kind === "art") body = art() && art().bakes[name];
      else body = LB.ELEMENTS[name] && LB.ELEMENTS[name].glsl;
      if (!body) throw new Error(`Nothing draws "${key}"`);
      return LB.MATERIALS_GLSL + body;
    }

    // The scene rect a layer's texture covers. Scene files can give one; otherwise it's the
    // union of what the layer paints. Items moved out of a given rect stretch it to follow.
    function layerRect(L) {
      if (L.type === "sprite") return LB.SPRITE.bbox(L);
      let r = L.rect ? L.rect.slice() : null;
      for (const item of L.paint || []) {
        if (item.shader && !L.rect) r = I.union(r, LIMIT);
        else if (!L.rect || !I.isIdentity(item) || item.poses) r = I.union(r, I.allPosesBox(item, L));
      }
      r = r || [0, 0, 0.01, 0.01];
      return [Math.max(r[0], LIMIT[0]), Math.max(r[1], LIMIT[1]), Math.min(r[2], LIMIT[2]), Math.min(r[3], LIMIT[3])];
    }

    // How many textures a layer bakes: one per pose in a pose cycle, or per frame of a cycle animation.
    const bakeFrames = (L) => (L.cycle ? L.cycle.frames : L.anim && L.anim.type === "cycle" ? L.anim.frames : 1);

    function signature(L) {
      const frames = bakeFrames(L);
      return JSON.stringify(L, (k, v) => (COMPOSITE_KEYS.has(k) ? undefined : v)) + "|" + frames + "|" + L.index + "|" + scene.art;
    }

    function prepare(L, i) {
      // "index" seeds the boil and the bake noise. A layer can pin it with "seed" so reordering layers never changes how one looks.
      const l = { ...L, index: L.seed ?? i, order: i, baseRect: L.rect };
      if (l.type !== "sparkles") {
        l.rect = layerRect(L);
        l.sig = signature(l);
        const cached = layerCache.get(l.id);
        if (cached && cached.sig === l.sig) {
          l.textures = cached.textures;
          l.texSize = cached.texSize;
        }
      }
      return l;
    }

    // ---------- images ----------
    function loadImage(id, src) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          const tex = texture(gl, 1, 1, { repeat: true });
          gl.bindTexture(gl.TEXTURE_2D, tex);
          gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
          imageCache.set(id, { tex, w: img.naturalWidth, h: img.naturalHeight, src, img });
          // A changed picture means its cut-outs have to be rebuilt.
          for (const k of [...maskCache.keys()]) if (k.startsWith(id + "|")) { gl.deleteTexture(maskCache.get(k).tex); maskCache.delete(k); }
          resolve();
        };
        img.onerror = () => reject(new Error(`Image "${id}" didn't load`));
        img.src = src;
      });
    }
    async function ensureImages(list) {
      const want = new Set();
      for (const L of list) for (const item of L.paint || []) I.images(item).forEach((id) => want.add(id));
      const jobs = [];
      for (const id of want) {
        const def = scene.images && scene.images[id];
        if (!def) continue;
        const have = imageCache.get(id);
        if (have && have.src === def.src) continue;
        if (have) gl.deleteTexture(have.tex);
        jobs.push(loadImage(id, def.src));
      }
      await Promise.all(jobs);
    }

    // ---------- cut-outs from pictures ----------
    // A picture becomes a signed distance field: which pixels count as "inside" (the dark parts, the
    // light parts, or the opaque parts), then how far each pixel is from the edge, in pixels.
    // Exact Euclidean distances, by Felzenszwalb and Huttenlocher's two-pass method.
    function edt1(f, n, d, v, z) {
      let k = 0;
      v[0] = 0; z[0] = -Infinity; z[1] = Infinity;
      for (let q = 1; q < n; q++) {
        let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
        while (s <= z[k]) { k--; s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]); }
        k++; v[k] = q; z[k] = s; z[k + 1] = Infinity;
      }
      k = 0;
      for (let q = 0; q < n; q++) { while (z[k + 1] < q) k++; d[q] = (q - v[k]) * (q - v[k]) + f[v[k]]; }
    }
    function edt(grid, w, h) {
      const n = Math.max(w, h), f = new Float64Array(n), d = new Float64Array(n), v = new Int32Array(n), z = new Float64Array(n + 1);
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < h; y++) f[y] = grid[y * w + x];
        edt1(f, h, d, v, z);
        for (let y = 0; y < h; y++) grid[y * w + x] = d[y];
      }
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) f[x] = grid[y * w + x];
        edt1(f, w, d, v, z);
        for (let x = 0; x < w; x++) grid[y * w + x] = d[x];
      }
    }
    function buildMask(def) {
      const info = imageCache.get(def.image);
      if (!info) return;
      const k = Math.min(1, 256 / Math.max(info.w, info.h));
      const w = Math.max(2, Math.round(info.w * k)), h = Math.max(2, Math.round(info.h * k));
      const c = document.createElement("canvas");
      c.width = w; c.height = h;
      const x = c.getContext("2d", { willReadFrequently: true });
      x.drawImage(info.img, 0, 0, w, h);
      const px = x.getImageData(0, 0, w, h).data;
      const bin = new Uint8Array(w * h);
      for (let i = 0; i < w * h; i++) {
        const a = px[i * 4 + 3] / 255;
        const lum = (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255;
        const m = def.from === "dark" ? (1 - lum) * a : def.from === "light" ? lum * a : a;
        bin[i] = m > def.threshold ? 1 : 0;
      }
      const BIG = 1e12;
      const toIn = new Float64Array(w * h), toOut = new Float64Array(w * h);
      for (let i = 0; i < w * h; i++) { toIn[i] = bin[i] ? 0 : BIG; toOut[i] = bin[i] ? BIG : 0; }
      edt(toIn, w, h);
      edt(toOut, w, h);
      const data = new Uint8Array(w * h * 4);
      for (let i = 0; i < w * h; i++) {
        // Positive outside, negative inside, the edge halfway between pixels.
        const dist = bin[i] ? -(Math.sqrt(toOut[i]) - 0.5) : Math.sqrt(toIn[i]) - 0.5;
        const val = Math.max(0, Math.min(255, Math.round(128 + dist * 4)));
        data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = val;
        data[i * 4 + 3] = 255;
      }
      const tex = texture(gl, w, h, { data });
      maskCache.set(def.key, { tex, w, h, bin });
    }
    function ensureMasks(list) {
      for (const L of list) for (const item of L.paint || []) {
        const E = item.el && LB.ELEMENTS[item.el];
        if (!E || !E.masks) continue;
        for (const def of E.masks(item)) if (!maskCache.has(def.key)) buildMask(def);
      }
    }

    // ---------- programs ----------
    async function ensurePrograms(keys) {
      const missing = [...new Set(keys)].filter((k) => !progCache.has(k));
      if (!missing.length) return;
      const t0 = performance.now();
      const compiled = await LB.gl.programs(gl, missing.map((k) => [FULLSCREEN_VERT, progSource(k), "bake " + k]));
      missing.forEach((k, i) => progCache.set(k, compiled[i]));
      if (opts.timeBake) { gl.finish(); console.log(`compile ${missing.length} bake programs: ${(performance.now() - t0).toFixed(0)}ms`); }
    }

    // ---------- baking ----------
    // Paints a layer's items into the currently bound target, which covers "rect" at w x h px.
    function paintLayer(L, rect, w, h, frame) {
      const [rx0, ry0, rx1, ry1] = rect;
      const TILE = 512;
      // Bespoke shaders cover the rect the scene file gave, even when moved items have stretched the texture.
      const host = L.type === "sprite" ? L : { rect: L.baseRect || L.rect };
      paintOf(L).forEach((item0, pi) => {
        const item = item0.sprite ? item0 : I.atPose(item0, frame);
        if (item.hide) return;
        const pr = progCache.get(progKey(item));
        gl.useProgram(pr.prog);
        const t = item.sprite ? I.IDENTITY : I.xfOf(item);
        const o = item.sprite ? [0, 0] : I.origin(item, host);
        gl.uniform4f(pr.u.uRect, rx0, ry0, rx1, ry1);
        gl.uniform2f(pr.u.uRes, w, h);
        gl.uniform1f(pr.u.uPx, (ry1 - ry0) / h / t.s);
        gl.uniform1f(pr.u.uSeed, L.index * 1.37 + pi * 0.71);
        gl.uniform1f(pr.u.uFrame, frame);
        gl.uniform1i(pr.u.uN, item.n || 0);
        gl.uniform1i(pr.u.uOne, 1);
        gl.uniform4f(pr.u.uXf, t.x, t.y, t.s, t.r);
        gl.uniform2f(pr.u.uXfOrigin, o[0], o[1]);
        const imgs = item.sprite ? [] : I.images(item);
        const img = imgs.length && imageCache.get(imgs[0]);
        bindTex(gl, 0, img ? img.tex : whiteTex);
        gl.uniform1i(pr.u.uImage, 0);
        const mask = item.el === "shape" && item.shape === "mask" ? maskCache.get(LB.ELEMENTS.shape.maskKey(item)) : null;
        bindTex(gl, 1, mask ? mask.tex : whiteTex);
        gl.uniform1i(pr.u.uMask, 1);
        let box = rect;
        if (item.sprite) LB.SPRITE.set(gl, pr.u, L);
        else if (item.el) {
          LB.ELEMENTS[item.el].set(gl, pr.u, item, t);
          box = I.worldBox(item, host);
        } else if (!I.isIdentity(item)) box = I.worldBox(item, host);
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
    }

    async function bakeLayers(list, onProgress) {
      const t1 = performance.now();
      const jobs = [];
      for (const L of list) {
        const frames = bakeFrames(L);
        const res = L.res || 1;
        let w = (L.rect[2] - L.rect[0]) * density * res;
        let h = (L.rect[3] - L.rect[1]) * density * res;
        const shrink = Math.min(1, maxTex / Math.max(w, h));
        w = Math.max(1, Math.round(w * shrink));
        h = Math.max(1, Math.round(h * shrink));
        L.texSize = [w, h];
        L.textures = [];
        for (let f = 0; f < frames; f++) jobs.push({ L, f, w, h });
      }
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
        paintLayer(L, L.rect, w, h, f);
        gl.flush();
        L.textures.push(t.tex);
        gl.deleteFramebuffer(t.fb);
        if (performance.now() - lastYield > 30) {
          gl.disable(gl.BLEND);
          if (onProgress) onProgress(0.5 + 0.5 * (ji / jobs.length));
          await new Promise((r) => setTimeout(r, 0));
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
          gl.bindVertexArray(vao);
          lastYield = performance.now();
        }
      }
      gl.disable(gl.BLEND);
      if (opts.timeBake && jobs.length) { gl.finish(); console.log(`bake ${jobs.length} textures: ${(performance.now() - t1).toFixed(0)}ms`); }
    }

    async function applyScene(next, onProgress) {
      scene = next;
      const list = next.layers.map(prepare);
      const stale = list.filter((L) => L.type !== "sparkles" && !L.textures);
      if (stale.length) {
        await ensureImages(stale);
        ensureMasks(stale);
        await ensurePrograms(stale.flatMap((L) => paintOf(L).map(progKey)));
        if (onProgress) onProgress(0.5);
        await bakeLayers(stale, onProgress);
      }
      // Swap in the new list, then free textures nothing uses any more.
      const keep = new Set(list.flatMap((L) => L.textures || []));
      for (const c of layerCache.values()) for (const tex of c.textures) if (!keep.has(tex)) gl.deleteTexture(tex);
      layerCache.clear();
      for (const L of list) if (L.textures) layerCache.set(L.id, { sig: L.sig, textures: L.textures, texSize: L.texSize });
      layers = list;
      if (onProgress) onProgress(1);
      baked = true;
      dirty = true;
    }

    // Coalesces rapid edits: while one sync runs, only the newest scene waits behind it.
    let running = null, pending = null;
    function sync(next, onProgress) {
      pending = next;
      if (!running) {
        running = (async () => {
          try {
            while (pending) {
              const s = pending;
              pending = null;
              await applyScene(s, onProgress);
            }
          } finally {
            running = null;
          }
        })();
      }
      return running;
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

    function cameraAt(t) {
      const d = scene.camera.drift;
      return post.motion ? [d[0] * Math.sin(TAU * t / LB.LOOP), d[1] * Math.sin(2 * TAU * t / LB.LOOP)] : [0, 0];
    }

    function pivotOf(L) {
      if (L.type === "sprite") return L.a;
      const [x0, y0, x1, y1] = L.rect;
      return L.pivot === "center" ? [(x0 + x1) / 2, (y0 + y1) / 2] : [(x0 + x1) / 2, y1];
    }

    function layerPose(L, t, seed, cam, jitter = true) {
      const loop = LB.LOOP;
      const off = L.offset || [0, 0];
      let ox = cam[0] * (L.depth || 0) + off[0], oy = cam[1] * (L.depth || 0) + off[1], angle = 0, frame = 0;
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
        } else if (a.type === "travel") {
          // Crosses from "from" to "to" a whole number of times per loop, bobbing a whole number of times per crossing.
          const f = (((t / loop) * (a.speed || 1) + (a.phase || 0)) % 1 + 1) % 1;
          ox += a.from[0] + (a.to[0] - a.from[0]) * f;
          oy += a.from[1] + (a.to[1] - a.from[1]) * f + (a.bob || 0) * Math.sin(TAU * f * (a.bobs || 4));
        }
      }
      if (L.cycle && post.motion) frame = Math.floor(t * L.cycle.rate + 1e-6) % L.cycle.frames;
      // Sprites also get a tiny per-beat nudge, like a puppet that never sits in exactly the same spot.
      if (jitter && L.type === "sprite" && post.boil > 0) {
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
        if (L.hidden || (post.hidden && post.hidden[L.id])) continue;
        if (L.type === "sparkles") {
          drawSparkles(L, t, seed, cam);
          gl.useProgram(progs.layer.prog);
          gl.bindVertexArray(vao);
          continue;
        }
        if (!L.textures || !L.textures.length) continue;
        const pose = layerPose(L, t, seed, cam);
        const [x0, y0, x1, y1] = L.rect;
        const pivot = pivotOf(L);
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
        const n = L.textures.length;
        if (post.onion === L.id && n > 1) {
          gl.uniform1f(u.uAlpha, (L.opacity ?? 1) * 0.35);
          bindTex(gl, 0, L.textures[(pose.frame - 1 + n) % n]);
          drawQuad();
        }
        gl.uniform1f(u.uAlpha, L.opacity ?? 1);
        bindTex(gl, 0, L.textures[Math.min(pose.frame, n - 1)]);
        drawQuad();
      }
    }

    function drawSparkles(L, t, seed, cam) {
      const u = progs.sparkle.u;
      const off = L.offset || [0, 0];
      gl.useProgram(progs.sparkle.prog);
      gl.bindVertexArray(vao);
      gl.uniform4f(u.uArea, ...L.area);
      gl.uniform4f(u.uView, ...view);
      gl.uniform2f(u.uOffset, cam[0] * L.depth + off[0], cam[1] * L.depth + off[1]);
      gl.uniform1f(u.uSize, L.size);
      gl.uniform1f(u.uTime, post.motion ? t : 0.4);
      gl.uniform1f(u.uLoop, LB.LOOP);
      gl.uniform1f(u.uJitter, post.boil > 0 ? seed + 1 : 0);
      gl.uniform3f(u.uColor, ...rgb(L.color));
      gl.uniform1f(u.uAlpha, L.opacity ?? 1);
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, L.count);
    }

    function renderScene(clock) {
      const t = clock.beatTime, seed = clock.boilSeed;
      const cam = cameraAt(t);
      bindTarget(gl, rt.scene);
      const bg = rgb(scene.background || "#000000");
      gl.clearColor(bg[0], bg[1], bg[2], 1);
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

    // ---------- reading back ----------
    // The last drawn frame, top row first. Call it right after draw(), in the same task.
    function readPixels() {
      const px = new Uint8Array(W * H * 4);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
      const out = new Uint8ClampedArray(W * H * 4);
      const row = W * 4;
      for (let y = 0; y < H; y++) out.set(px.subarray((H - 1 - y) * row, (H - y) * row), y * row);
      return new ImageData(out, W, H);
    }

    // Bakes one layer on its own into a small image, for library thumbnails. Straight alpha.
    async function thumbnail(layerDef, w, h, sceneOverride) {
      const prevScene = scene;
      if (sceneOverride) scene = sceneOverride;
      try {
        const L = { ...layerDef, index: layerDef.seed ?? 0 };
        if (L.type === "sparkles") return null;
        await ensureImages([L]);
        ensureMasks([L]);
        await ensurePrograms(paintOf(L).map(progKey));
        // Fit the layer's rect into w x h, centered.
        const r = layerRect(L);
        const rw = r[2] - r[0], rh = r[3] - r[1];
        const k = Math.max(rw / w, rh / h) * 1.08;
        const cx = (r[0] + r[2]) / 2, cy = (r[1] + r[3]) / 2;
        const rect = [cx - (w * k) / 2, cy - (h * k) / 2, cx + (w * k) / 2, cy + (h * k) / 2];
        const t = target(gl, w, h);
        bindTarget(gl, t);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.bindVertexArray(vao);
        paintLayer(L, rect, w, h, 0);
        gl.disable(gl.BLEND);
        const px = new Uint8Array(w * h * 4);
        gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        freeTarget(gl, t);
        dirty = true;
        // The bake writes row 0 at the top of the rect, so rows are already top first. Undo premultiplication.
        const out = new Uint8ClampedArray(px.length);
        for (let i = 0; i < px.length; i += 4) {
          const a = px[i + 3];
          const m = a ? 255 / a : 0;
          out[i] = px[i] * m; out[i + 1] = px[i + 1] * m; out[i + 2] = px[i + 2] * m; out[i + 3] = a;
        }
        return new ImageData(out, w, h);
      } finally {
        scene = prevScene;
      }
    }

    // Where a layer sits on screen right now, without the per-beat boil nudge (for the editor's overlay).
    function poseOf(id, clock) {
      const L = layers.find((l) => l.id === id);
      if (!L || !post) return null;
      const t = clock.beatTime;
      const p = layerPose(L, t, clock.boilSeed, cameraAt(t), false);
      return { ...p, rect: L.rect, pivot: L.type === "sparkles" ? null : pivotOf(L) };
    }

    // The pose a layer shows at this moment (0 for layers without a pose cycle).
    function frameOf(id, clock) {
      const L = layers.find((l) => l.id === id);
      if (!L || !L.cycle || !post || !post.motion) return 0;
      return Math.floor(clock.beatTime * L.cycle.rate + 1e-6) % L.cycle.frames;
    }

    return {
      gl, resize, setPost, setGrade, invalidate, draw, sync, readPixels, thumbnail, poseOf, frameOf,
      bake: (onProgress) => sync(scene, onProgress),
      get size() { return [W, H]; },
      get view() { return view; },
      get density() { return density; },
      get layers() { return layers; },
      get busy() { return !!running; },
    };
  }

  LB.createRenderer = createRenderer;
})();
