/*
  Small WebGL2 helpers: compile programs, make render targets, draw quads.
  Nothing scene-specific lives here.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  const HEADER = "#version 300 es\nprecision highp float;\nprecision highp int;\n";

  // Starts compiling and linking without waiting for the result.
  function start(gl, vert, frag, label) {
    const p = gl.createProgram();
    const vs = gl.createShader(gl.VERTEX_SHADER);
    const fs = gl.createShader(gl.FRAGMENT_SHADER);
    gl.shaderSource(vs, HEADER + vert);
    gl.shaderSource(fs, HEADER + frag);
    gl.compileShader(vs);
    gl.compileShader(fs);
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.bindAttribLocation(p, 0, "aPos");
    gl.linkProgram(p);
    return { p, vs, fs, label };
  }

  // Checks a started program and returns { prog, u } where u maps uniform names to locations (looked up lazily).
  function finish(gl, job) {
    const { p, vs, fs, label } = job;
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      const log = [vs, fs].map((s) => gl.getShaderInfoLog(s)).filter(Boolean).join("\n") || gl.getProgramInfoLog(p);
      throw new Error(`Program "${label}" failed:\n${log}`);
    }
    gl.deleteShader(vs);
    gl.deleteShader(fs);
    const cache = {};
    const u = new Proxy(cache, {
      get(target, name) {
        if (!(name in target)) target[name] = gl.getUniformLocation(p, name);
        return target[name];
      },
    });
    return { prog: p, u };
  }

  function program(gl, vert, frag, label) {
    return finish(gl, start(gl, vert, frag, label));
  }

  // Compiles several programs at once. With KHR_parallel_shader_compile the
  // driver works on them in parallel while the page stays responsive.
  async function programs(gl, list) {
    const ext = gl.getExtension("KHR_parallel_shader_compile");
    const jobs = list.map(([vert, frag, label]) => start(gl, vert, frag, label));
    if (ext) {
      while (!jobs.every((j) => gl.getProgramParameter(j.p, ext.COMPLETION_STATUS_KHR))) {
        await new Promise((r) => setTimeout(r, 16));
      }
    }
    return jobs.map((j) => finish(gl, j));
  }

  function texture(gl, w, h, opts = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, opts.data || null);
    const filter = opts.nearest ? gl.NEAREST : gl.LINEAR;
    const wrap = opts.repeat ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
    return t;
  }

  // A texture plus a framebuffer that renders into it.
  function target(gl, w, h, opts) {
    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));
    const tex = texture(gl, w, h, opts);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return { tex, fb, w, h };
  }

  function freeTarget(gl, t) {
    if (!t) return;
    gl.deleteFramebuffer(t.fb);
    gl.deleteTexture(t.tex);
  }

  // One unit quad (0..1) shared by every draw. Vertex shaders map it where it needs to go.
  function quad(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return vao;
  }

  function bindTarget(gl, t) {
    if (t) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb);
      gl.viewport(0, 0, t.w, t.h);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    }
  }

  function bindTex(gl, unit, tex) {
    gl.activeTexture(gl.TEXTURE0 + unit);
    gl.bindTexture(gl.TEXTURE_2D, tex);
  }

  // "#7a4b9c" -> [r, g, b] in 0..1
  function rgb(hex) {
    const n = parseInt(hex.replace("#", ""), 16);
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  }

  // Full-screen pass vertex shader: the unit quad covers the target, vUv is 0..1.
  const FULLSCREEN_VERT = `
in vec2 aPos;
out vec2 vUv;
void main() { vUv = aPos; gl_Position = vec4(aPos * 2.0 - 1.0, 0.0, 1.0); }`;

  LB.gl = { program, programs, texture, target, freeTarget, quad, bindTarget, bindTex, rgb, FULLSCREEN_VERT };
})();
