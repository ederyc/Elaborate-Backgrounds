/*
  Pencil: graphite strokes on paper, drawn with the editor's Pencil tool or
  written into a scene file by hand.

    pencil  one stroke through up to 64 points, each with a pressure. The
            line thickens and darkens with pressure, catches only the tops
            of the paper's tooth where it's light, and shows faint streaks
            along its length, the way graphite does. A sketchy second line
            can shadow it, a little off, the way a quick drawing is gone
            over twice. "smudge" strokes are wide, soft and grey instead:
            a thumb-rubbed shadow or an eraser's ghost.

  Boil: in a layer with a pose cycle, every pose is the stroke redrawn.
  The points shift a little along the line, the second line wanders, and
  the pressure changes, so the drawing crawls like real stop-motion pencil
  instead of wobbling as one sheet. Without a pose cycle the stroke holds
  still apart from the layer's own boil.

  Points are in scene units (like the study's elements), so the stroke's
  origin is the middle of its own box and the item transform moves it.
  The redraws are seeded from the stroke's own points, so the same stroke
  always redraws the same way, on any machine.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const rgb = (h) => LB.gl.rgb(h);
  const MAX = 64;

  const GLSL = `
uniform vec3 uPts[${MAX}];  // x, y, pressure 0..1
uniform int uPtCount;
uniform vec4 uPen;          // half width at full pressure, darkness 0..1, paper tooth 0..1, kind (0 line, 1 smudge)
uniform vec3 uCol;
uniform vec2 uGhost;        // where the second line sits, relative to the first
uniform vec2 uGhostSpan;    // how much of the stroke the second line covers: start, end (0..1 of its length)
uniform float uGhostAmt;    // 0 = no second line
uniform float uLen;         // the stroke's length

// Distance to the stroke, its pressure there and how far along it the nearest point is.
float stroke(vec2 p, float widen, out float press, out float along, out float dc) {
  float best = 1e9, acc = 0.0;
  press = 0.0; along = 0.0; dc = 1e9;
  for (int i = 1; i < uPtCount; i++) {
    vec3 a = uPts[i - 1], b = uPts[i];
    vec2 pa = p - a.xy, ba = b.xy - a.xy;
    float l2 = max(dot(ba, ba), 1e-12), l = sqrt(l2);
    float h = clamp(dot(pa, ba) / l2, 0.0, 1.0);
    float pr = mix(a.z, b.z, h);
    float c = length(pa - ba * h);
    float d = c - uPen.x * widen * (0.4 + 0.6 * pr);
    if (d < best) { best = d; press = pr; along = acc + h * l; dc = c; }
    acc += l;
  }
  return best;
}

void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  // The paper's tooth, about two pixels a grain, and a coarser unevenness in how it takes graphite.
  vec2 q = p / uPx;
  float tooth = 0.65 * vnoise(q * 0.55) + 0.35 * vnoise(q * 0.21 + 11.0);
  float press, along, dc;
  float d = stroke(p, 1.0, press, along, dc);
  if (uPen.w > 0.5) {
    // A smudge: graphite rubbed into the paper, soft-edged, mottled, streaked along the rub.
    float r = uPen.x * (0.4 + 0.6 * press);
    float soft = 1.0 - smoothstep(-r * 0.6, r * 0.35, d);
    float mott = 0.65 + 0.5 * fbm3(p * 180.0 + uSeed) + 0.15 * vnoise(vec2(along * 260.0, dc / max(r, 1e-5) * 3.0));
    float a = soft * uPen.y * (0.35 + 0.65 * press) * mott * mix(1.0, 0.75 + 0.5 * tooth, uPen.z);
    over(acc, uCol, clamp(a, 0.0, 1.0));
    outColor = acc;
    return;
  }
  // Graphite streaks run along the line.
  float streak = vnoise(vec2(along / uPx * 0.12, dc / uPx * 0.9) + uSeed);
  float t = tooth * 0.75 + streak * 0.35;
  // Light pressure only marks the tops of the tooth; hard pressure fills it in.
  float bite = smoothstep(0.78 - 0.62 * press, 1.02 - 0.55 * press, t);
  float cov = clamp(0.5 - d / (1.3 * uPx), 0.0, 1.0);
  float a1 = cov * uPen.y * (0.3 + 0.7 * press) * mix(1.0, bite, uPen.z);
  float a2 = 0.0;
  if (uGhostAmt > 0.0) {
    float press2, along2, dc2;
    float d2 = stroke(p - uGhost, 0.75, press2, along2, dc2);
    float u = along2 / max(uLen, 1e-5);
    float span = smoothstep(uGhostSpan.x, uGhostSpan.x + 0.06, u) * (1.0 - smoothstep(uGhostSpan.y - 0.06, uGhostSpan.y, u));
    float bite2 = smoothstep(0.86 - 0.5 * press2, 1.05 - 0.45 * press2, t);
    a2 = clamp(0.5 - d2 / (1.3 * uPx), 0.0, 1.0) * span * uPen.y * (0.25 + 0.5 * press2) * mix(1.0, bite2, uPen.z) * uGhostAmt;
  }
  float a = 1.0 - (1.0 - a1) * (1.0 - a2);
  over(acc, uCol, clamp(a, 0.0, 1.0));
  outColor = acc;
}`;

  // ---------- deterministic randomness ----------
  function hashStr(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0 || 1;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // A stroke's own seed, from its points: the same stroke always redraws the same way.
  const seedOf = (el) => {
    const ps = el.points || [];
    return hashStr(ps.length + ":" + ps.slice(0, 3).map((q) => q.map((v) => Math.round(v * 1e5)).join(",")).join(";") + ":" + (ps.length ? ps[ps.length - 1].join(",") : ""));
  };

  const ptsOf = (el) => (Array.isArray(el.points) ? el.points.filter((q) => Array.isArray(q) && q.length >= 2).slice(0, MAX) : []);
  const press = (q) => (typeof q[2] === "number" ? Math.max(0, Math.min(1, q[2])) : 0.7);
  const size = (el) => Math.max(0.0004, el.size ?? 0.0025);
  // How far a redraw can push the line, in scene units.
  const reach = (el) => (el.redraw ?? 0.5) * 0.0035;

  function lengthOf(ps) {
    let s = 0;
    for (let i = 1; i < ps.length; i++) s += Math.hypot(ps[i][0] - ps[i - 1][0], ps[i][1] - ps[i - 1][1]);
    return s;
  }

  // The stroke as it's drawn in pose f: every point nudged along a slow wave, so the line is redrawn,
  // not shaken. Pose 0 is redrawn too, so no pose looks more finished than the others.
  function redrawn(el, f) {
    const ps = ptsOf(el);
    const amp = reach(el);
    const r = rng(seedOf(el) + Math.imul(f + 1, 2654435761));
    const fx = 0.6 + r() * 1.2, fy = 0.6 + r() * 1.2, px = r() * 6.283, py = r() * 6.283;
    const sx = (r() - 0.5) * amp, sy = (r() - 0.5) * amp;
    const pk = 0.88 + r() * 0.24;
    const total = Math.max(lengthOf(ps), 1e-6);
    let run = 0;
    const out = ps.map((q, i) => {
      if (i) run += Math.hypot(q[0] - ps[i - 1][0], q[1] - ps[i - 1][1]);
      const u = run / total;
      return [q[0] + sx + amp * 0.5 * Math.sin(6.283 * fx * u + px), q[1] + sy + amp * 0.5 * Math.sin(6.283 * fy * u + py), Math.min(1, press(q) * pk)];
    });
    // The second line: off to one side of the stroke's general direction, starting late and stopping early.
    const a = ps[0] || [0, 0], b = ps[ps.length - 1] || [0, 0];
    let dx = b[0] - a[0], dy = b[1] - a[1];
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl; dy /= dl;
    const side = r() < 0.5 ? -1 : 1, off = size(el) * (1.1 + r() * 1.4), slide = (r() - 0.5) * size(el) * 2;
    const ghost = [-dy * off * side + dx * slide, dx * off * side + dy * slide];
    const span = [0.04 + r() * 0.2, 0.7 + r() * 0.26];
    return { pts: out, ghost, span, length: total };
  }

  function bounds(el) {
    const ps = ptsOf(el);
    if (!ps.length) return [-0.01, -0.01, 0.01, 0.01];
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const q of ps) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    return [x0, y0, x1, y1];
  }

  // Distance from a point to the stroke (for picking it on the canvas).
  function distance(el, p) {
    const ps = ptsOf(el);
    let best = Infinity;
    for (let i = 1; i < ps.length; i++) {
      const a = ps[i - 1], b = ps[i];
      const bx = b[0] - a[0], by = b[1] - a[1], l2 = bx * bx + by * by || 1e-12;
      const h = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * by) / l2));
      best = Math.min(best, Math.hypot(p[0] - a[0] - bx * h, p[1] - a[1] - by * h));
    }
    if (ps.length === 1) best = Math.hypot(p[0] - ps[0][0], p[1] - ps[0][1]);
    return best;
  }

  // ---------- making strokes ----------
  // Ramer-Douglas-Peucker, loosened until the stroke fits in MAX points.
  function simplify(ps, tol) {
    if (ps.length <= 2) return ps.slice();
    const keep = new Uint8Array(ps.length);
    keep[0] = keep[ps.length - 1] = 1;
    const stack = [[0, ps.length - 1]];
    while (stack.length) {
      const [i0, i1] = stack.pop();
      const a = ps[i0], b = ps[i1];
      const bx = b[0] - a[0], by = b[1] - a[1], l = Math.hypot(bx, by) || 1e-12;
      let far = -1, fd = tol;
      for (let i = i0 + 1; i < i1; i++) {
        const d = Math.abs((ps[i][0] - a[0]) * by - (ps[i][1] - a[1]) * bx) / l;
        // Pressure changes count too, so a swell in the line isn't flattened away.
        const pd = Math.abs(press(ps[i]) - (press(a) + (press(b) - press(a)) * ((i - i0) / (i1 - i0)))) * tol * 4;
        if (d + pd > fd) { fd = d + pd; far = i; }
      }
      if (far > 0) { keep[far] = 1; stack.push([i0, far], [far, i1]); }
    }
    return ps.filter((_, i) => keep[i]);
  }
  function fit(ps, tol = 0.0004) {
    let out = simplify(ps, tol);
    while (out.length > MAX) { tol *= 1.5; out = simplify(ps, tol); }
    return out;
  }

  LB.ELEMENTS.pencil = {
    glsl: GLSL,
    MAX,
    bounds,
    distance,
    fit,
    redrawn,
    length: (el) => lengthOf(ptsOf(el)),
    bbox(el) {
      const b = bounds(el);
      const m = size(el) * (el.kind === "smudge" ? 0.8 : 3.2) + reach(el) * 1.1 + 0.003;
      return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    },
    set(gl, u, el, xf, frame = 0) {
      const { pts, ghost, span, length } = redrawn(el, frame);
      const flat = new Float32Array(MAX * 3);
      pts.forEach((q, i) => flat.set(q, i * 3));
      gl.uniform3fv(u.uPts, flat);
      gl.uniform1i(u.uPtCount, pts.length);
      const smudge = el.kind === "smudge";
      gl.uniform4f(u.uPen, size(el) / 2, el.dark ?? 0.8, el.grain ?? 0.7, smudge ? 1 : 0);
      gl.uniform3f(u.uCol, ...rgb(el.color || "#3A3530"));
      gl.uniform2f(u.uGhost, ghost[0], ghost[1]);
      gl.uniform2f(u.uGhostSpan, span[0], span[1]);
      gl.uniform1f(u.uGhostAmt, smudge ? 0 : el.double ?? 0.3);
      gl.uniform1f(u.uLen, length);
    },
  };
})();
