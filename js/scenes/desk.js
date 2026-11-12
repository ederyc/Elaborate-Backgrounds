/*
  Desk by the Window (a placeholder name): Eder's desk by a window in the
  evening, made for the hero of his portfolio. Concept, characters and art
  direction by Eder Yepez Cuevas; every picture is drawn by code.

  The camera sits on the left end of a wooden desk and looks across it
  toward the desk's far right corner, so the top runs away from you in
  perspective: its back edge along the wall, its front edge coming toward
  you at the bottom left, the far right corner standing on its legs. A big
  window fills the right of the wall and runs off the top and right of the
  frame. On the desk: a laptop in the middle, showing the kid hero as a
  pixel sprite in a tiny level; beside it, smaller, an open sketchbook with
  a pencil drawing of the same kid (a blanket for a cape, a cardboard sword)
  and a pencil lying on it; and an open handheld console. Through the
  window, a Lodi vineyard at sunset. A steel-string acoustic guitar stands
  on a stand past the end of the desk, a soccer ball sits under the desk,
  and soft shafts of evening light come in through the window.

  The upper left is kept for the portfolio's photo card and headline: a
  plain, light, still wall. Nothing there moves, boils or glows.

  Motion: the pencil lines are redrawn pose by pose (pencil boil), the
  paper boils, vine leaves rustle, one cloud drifts, a bird crosses, the
  laptop's screen flickers gently, the shafts of light shimmer and dust drifts
  in them.

  The bespoke art (wall, desk, sky, cloud, hills, vines) is in desk-art.js.
  Everything else is the editor's own pieces: shapes, pencil lines and
  light, so the whole scene opens in the editor and every piece can be
  changed. The laptop's screen is its own layer, so its picture can be
  swapped. The pencil drawing is a group of pencil strokes, the same kind
  the Pencil tool draws.

  LB.scenes.desk() builds the 16:9 scene; LB.scenes.desk({ tall: true })
  the tall phone version, with the window and sunset above and the desk and
  sketchbook below. Units are scene units: y 0..1 top to bottom.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- placing things ----------
  // Every object is built around (0, 0) in its own units, then placed: turned by r, scaled by s, and
  // moved. "k" also squashes it top to bottom after turning, the way a flat thing lying on the desk is
  // seen from a low camera; squashed shapes become outlines, since a turned, squashed box is no longer a box.
  const at = (g, x, y) => {
    const c = Math.cos(g.r || 0), s = Math.sin(g.r || 0), K = g.s ?? 1, k = g.k ?? 1;
    return [g.x + K * (c * x - s * y), g.y + k * K * (s * x + c * y)];
  };
  const inner = (t, x, y) => at({ x: t.x || 0, y: t.y || 0, s: t.s ?? 1, r: t.r || 0 }, x, y);
  // A shape's outline in its own units, for squashing.
  function outlineOf(it) {
    if (it.shape === "rect") return [[-it.w / 2, -it.h / 2], [it.w / 2, -it.h / 2], [it.w / 2, it.h / 2], [-it.w / 2, it.h / 2]];
    if (it.shape === "ellipse") { const n = it.w > 0.01 ? 20 : 8; return Array.from({ length: n }, (_, i) => { const t = (i / n) * Math.PI * 2; return [(it.w / 2) * Math.cos(t), (it.h / 2) * Math.sin(t)]; }); }
    if (it.shape === "path") return it.points;
    return null;
  }
  function place(items, g) {
    const k = g.k ?? 1;
    return items.map((it0) => {
      const it = clone(it0);
      if (it.el === "pencil") {
        it.points = it.points.map((q) => { const [x, y] = at(g, q[0], q[1]); return [r5(x), r5(y), q[2]]; });
        if (it.size) it.size = r5(it.size * (g.s ?? 1) * (0.5 + 0.5 * k));
        return it;
      }
      const t = it.xf || { x: 0, y: 0, s: 1, r: 0 };
      const ol = k !== 1 && it.el === "shape" ? outlineOf(it) : null;
      if (ol) {
        // Through the shape's own transform, then the placement; the outline is kept around its middle.
        const pts = ol.map(([x, y]) => at(g, ...inner(t, x, y)));
        const cx = pts.reduce((a, p) => a + p[0], 0) / pts.length, cy = pts.reduce((a, p) => a + p[1], 0) / pts.length;
        const was = it.shape;
        it.shape = "path";
        it.points = pts.map(([x, y]) => [r5(x - cx), r5(y - cy)]);
        if (was === "rect") it.round = r5(Math.min(0.004, (it.corner ?? 0.15) * Math.min(it.w, it.h) * 0.5 * (g.s ?? 1) * k));
        else if (was === "ellipse") it.round = 0;
        delete it.w; delete it.h; delete it.corner;
        it.xf = { x: r4(cx), y: r4(cy), s: 1, r: 0 };
        return it;
      }
      const [x, y] = at(g, t.x, t.y);
      it.xf = { x: r4(x), y: r4(y), s: r4((t.s ?? 1) * (g.s ?? 1)), r: r4((t.r || 0) + (g.r || 0)) };
      if (k !== 1 && it.el === "light" && it.h) it.h = r4(it.h * k);
      return it;
    });
  }
  // An outline from points in scene units, kept around its middle so it moves like any other piece.
  function poly(pts, color, o = {}) {
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    return shape({ shape: "path", points: pts.map(([x, y]) => [r5(x - cx), r5(y - cy)]), material: "paper", colors: [color, color], round: 0.0006, xf: { x: r4(cx), y: r4(cy), s: 1, r: 0 }, ...o });
  }
  const grouped = (items, gid) => items.map((it) => ({ ...it, group: gid }));

  // ---------- shapes ----------
  const shape = (o) => ({ el: "shape", rough: 0.25, fuzz: 0.15, puff: 0.3, shadow: 0, grain: 1, ...o });
  const rect = (x, y, w, h, color, o = {}) => shape({ shape: "rect", w: r4(w), h: r4(h), corner: 0.1, material: "paper", colors: [color, color], xf: { x: r4(x), y: r4(y), s: 1, r: o.r || 0 }, ...o, r: undefined });
  const oval = (x, y, w, h, color, o = {}) => shape({ shape: "ellipse", w: r4(w), h: r4(h), material: "paper", colors: [color, color], xf: { x: r4(x), y: r4(y), s: 1, r: o.r || 0 }, ...o, r: undefined });
  const path = (pts, color, o = {}) => shape({ shape: "path", points: pts.map(([x, y]) => [r4(x), r4(y)]), material: "paper", colors: [color, color], round: 0.0006, xf: { x: 0, y: 0, s: 1, r: 0 }, ...o });
  const tidy = (o) => { for (const k of Object.keys(o)) if (o[k] === undefined) delete o[k]; return o; };

  // ---------- pencil ----------
  // A stroke through a path of [x, y] points, with a pressure that swells in the middle and tapers
  // at the ends. "wob" adds the small unevenness of a hand.
  let strokeSeed = 1;
  function pencil(pts, o = {}) {
    const n = pts.length, p = o.press ?? 0.75, wob = o.wob ?? 0.0018;
    const ph = strokeSeed++ * 1.7;
    const out = pts.map(([x, y], i) => {
      const u = n > 1 ? i / (n - 1) : 0;
      const taper = Math.min(1, (u + 0.04) / (o.in ?? 0.18), (1.04 - u) / (o.out ?? 0.22));
      return [x + wob * Math.sin(u * 9 + ph), y + wob * Math.cos(u * 7 + ph * 1.3), Math.round(Math.max(0.12, p * (0.45 + 0.55 * Math.max(0, taper))) * 1000) / 1000];
    });
    return tidy({ el: "pencil", name: o.name, kind: o.kind, size: o.size ?? 0.0016, dark: o.dark ?? 0.8, double: o.double ?? 0.3, grain: o.grain, redraw: o.redraw ?? 0.5, points: out });
  }
  // Path makers, in drawing units.
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const line = (a, b, n = 8) => Array.from({ length: n }, (_, i) => lerp(a, b, i / (n - 1)));
  const quad = (a, c, b, n = 12) => Array.from({ length: n }, (_, i) => { const t = i / (n - 1); return lerp(lerp(a, c, t), lerp(c, b, t), t); });
  const arc = (cx, cy, r, a0, a1, n = 20, sy = 1) => Array.from({ length: n }, (_, i) => { const a = a0 + (a1 - a0) * (i / (n - 1)); return [cx + r * Math.cos(a), cy + r * sy * Math.sin(a)]; });
  // A smooth curve through points (Catmull-Rom), sampled k times per span.
  function curve(ps, k = 5) {
    const out = [];
    for (let i = 0; i < ps.length - 1; i++) {
      const p0 = ps[Math.max(0, i - 1)], p1 = ps[i], p2 = ps[i + 1], p3 = ps[Math.min(ps.length - 1, i + 2)];
      for (let j = 0; j < k; j++) {
        const t = j / k, t2 = t * t, t3 = t2 * t;
        out.push([0, 1].map((d) => 0.5 * (2 * p1[d] + (-p0[d] + p2[d]) * t + (2 * p0[d] - 5 * p1[d] + 4 * p2[d] - p3[d]) * t2 + (-p0[d] + 3 * p1[d] - 3 * p2[d] + p3[d]) * t3)));
      }
    }
    out.push(ps[ps.length - 1]);
    return out;
  }

  // ---------- the sketch: the kid hero, in drawing units (1 = the figure's height, feet at y 0.5) ----------
  function heroSketch() {
    const C = { size: 0.0075, dark: 0.32, double: 0, press: 0.4, redraw: 0.45, wob: 0.006 };    // construction lines
    const F = { size: 0.012, dark: 0.82, double: 0.35, press: 0.8, wob: 0.004 };                  // the drawing
    const Fm = { ...F, size: 0.0095, press: 0.7 };
    const H = { size: 0.008, dark: 0.55, double: 0, press: 0.55, in: 0.3, out: 0.3, wob: 0.002 };  // hatching
    const out = [];
    const add = (pts, o, name) => out.push(pencil(pts, { ...o, name }));

    // Construction first: head circle and guides, the line of action, the torso box, the ground.
    add(arc(0.0, -0.37, 0.122, -0.4, Math.PI * 2 + 0.1, 30), C, "Head circle");
    add(quad([0.035, -0.49], [0.08, -0.37], [0.045, -0.25]), C, "Face guide");
    add(quad([-0.115, -0.372], [0.0, -0.352], [0.12, -0.37]), C, "Eye line");
    add(quad([0.035, -0.25], [-0.02, 0.06], [-0.18, 0.49]), { ...C, dark: 0.26 }, "Line of action");
    add([[-0.09, -0.222], [0.09, -0.215], [0.08, 0.026], [-0.072, 0.02], [-0.092, -0.218]], C, "Torso box");
    add(curve([[0.08, -0.21], [0.19, -0.27], [0.23, -0.39]]), C, "Arm guide");
    add(curve([[0.04, 0.03], [0.14, 0.255], [0.115, 0.44]]), C, "Leg guide");
    add(curve([[-0.04, 0.03], [-0.12, 0.26], [-0.21, 0.44]]), C, "Leg guide");
    add(line([-0.4, 0.5], [0.34, 0.497], 10), { ...C, dark: 0.4 }, "Ground line");

    // The cape: a blanket, flowing back from the shoulders, with a wavy hem, a stripe and a patch.
    add(curve([[-0.07, -0.225], [-0.19, -0.205], [-0.32, -0.11], [-0.395, 0.06], [-0.43, 0.225]], 6), F, "Cape");
    add(curve([[-0.43, 0.225], [-0.37, 0.19], [-0.32, 0.27], [-0.25, 0.205], [-0.185, 0.3], [-0.12, 0.215]], 5), F, "Cape hem");
    add(curve([[-0.05, -0.17], [-0.14, -0.02], [-0.18, 0.12], [-0.12, 0.215]], 5), Fm, "Cape edge");
    add(curve([[-0.17, -0.16], [-0.27, 0.04], [-0.3, 0.22]], 5), { ...Fm, dark: 0.6 }, "Fold");
    add(curve([[-0.24, -0.06], [-0.33, 0.1], [-0.36, 0.2]], 5), { ...Fm, dark: 0.55, press: 0.55 }, "Fold");
    add(curve([[-0.41, 0.15], [-0.33, 0.135], [-0.24, 0.15], [-0.17, 0.13]], 4), { ...Fm, dark: 0.6 }, "Blanket stripe");
    add(curve([[-0.415, 0.18], [-0.33, 0.165], [-0.25, 0.18], [-0.175, 0.16]], 4), { ...Fm, dark: 0.55 }, "Blanket stripe");
    add([[-0.31, -0.04], [-0.24, -0.06], [-0.225, 0.01], [-0.295, 0.03], [-0.312, -0.035]], { ...Fm, double: 0.2 }, "Patch");
    for (let i = 0; i < 5; i++) add(line([-0.3 + i * 0.014, -0.034 - i * 0.004], [-0.296 + i * 0.014, -0.027 - i * 0.004], 2), { ...H, dark: 0.7, size: 0.007 }, "Stitch");
    for (let i = 0; i < 7; i++) {
      const x = -0.215 + i * 0.022, y = 0.04 + i * 0.012;
      add(line([x, y + 0.07], [x + 0.035, y], 4), H, "Shading");
    }
    // A knot at the neck.
    add(arc(0.012, -0.226, 0.02, 0, Math.PI * 2, 14), { ...Fm, size: 0.009 }, "Knot");
    add(quad([0.02, -0.21], [0.05, -0.19], [0.045, -0.155]), Fm, "Knot tail");

    // Head, hair and face.
    add(arc(0.0, -0.372, 0.116, -0.55, Math.PI + 0.62, 26), F, "Head");
    add(curve([[-0.122, -0.385], [-0.135, -0.44], [-0.105, -0.485], [-0.07, -0.47], [-0.045, -0.515], [-0.005, -0.495], [0.025, -0.52], [0.065, -0.5], [0.095, -0.49], [0.118, -0.455], [0.125, -0.415]], 4), F, "Hair");
    add(curve([[-0.005, -0.5], [0.012, -0.565], [0.045, -0.545]], 4), Fm, "Cowlick");
    add(quad([0.0, -0.45], [0.03, -0.43], [0.05, -0.415]), Fm, "Fringe");
    add(line([0.026, -0.38], [0.028, -0.354], 3), { ...F, size: 0.017, double: 0, press: 0.95 }, "Eye");
    add(line([0.078, -0.376], [0.08, -0.352], 3), { ...F, size: 0.017, double: 0, press: 0.95 }, "Eye");
    add(line([0.005, -0.405], [0.045, -0.395], 4), Fm, "Brow");
    add(line([0.062, -0.398], [0.1, -0.407], 4), Fm, "Brow");
    add(quad([0.032, -0.322], [0.062, -0.296], [0.09, -0.324]), Fm, "Grin");
    add([[0.108, -0.372], [0.124, -0.35], [0.11, -0.343]], { ...Fm, size: 0.008 }, "Nose");
    add(arc(-0.06, -0.362, 0.022, Math.PI * 0.55, Math.PI * 1.5, 10), Fm, "Ear");
    add(line([-0.018, -0.262], [-0.022, -0.228], 3), Fm, "Neck");
    add(line([0.038, -0.262], [0.044, -0.228], 3), Fm, "Neck");

    // Body: the T-shirt with a star on it, shorts, the back arm with its fist on the hip.
    add(curve([[-0.078, -0.212], [-0.08, -0.08], [-0.07, 0.03]]), F, "Shirt");
    add(curve([[0.085, -0.17], [0.082, -0.06], [0.076, 0.03]]), F, "Shirt");
    add(curve([[-0.072, 0.03], [0.0, 0.04], [0.078, 0.032]]), Fm, "Hem");
    const star = [];
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 0.014 : 0.034; star.push([0.005 + r * Math.cos(a), -0.11 + r * Math.sin(a)]); }
    add(star, { ...Fm, size: 0.0085, double: 0.15 }, "Star");
    add(curve([[-0.078, -0.2], [-0.14, -0.13], [-0.13, -0.06], [-0.082, -0.03]]), F, "Arm");
    add(curve([[-0.07, -0.16], [-0.105, -0.12], [-0.1, -0.07], [-0.075, -0.055]]), Fm, "Arm");
    add(arc(-0.078, -0.035, 0.024, 0, Math.PI * 2, 12), Fm, "Fist");
    add(curve([[-0.072, 0.03], [-0.1, 0.14]]), F, "Shorts");
    add(curve([[0.078, 0.032], [0.12, 0.13]]), F, "Shorts");
    add(line([-0.1, 0.14], [-0.02, 0.152], 4), Fm, "Shorts");
    add(line([0.035, 0.145], [0.12, 0.13], 4), Fm, "Shorts");
    add(line([0.0, 0.06], [0.006, 0.145], 4), Fm, "Shorts");

    // The sword arm, raised.
    add(curve([[0.085, -0.205], [0.15, -0.25], [0.19, -0.268], [0.215, -0.33], [0.232, -0.38]]), F, "Arm");
    add(curve([[0.084, -0.168], [0.15, -0.215], [0.176, -0.236], [0.196, -0.31], [0.204, -0.372]]), F, "Arm");
    add(arc(0.222, -0.405, 0.031, 0, Math.PI * 2, 14), F, "Fist");

    // The cardboard sword: a blade with a bend in it, a crossguard taped on, a rounded tip.
    const h0 = [0.238, -0.44], d = [0.685, -0.729], nn = [0.729, 0.685];
    const P = (u, v) => [h0[0] + d[0] * u + nn[0] * v, h0[1] + d[1] * u + nn[1] * v];
    add([P(0.02, 0.024), P(0.18, 0.026), P(0.2, 0.019), P(0.33, 0.022)], F, "Blade");
    add([P(0.02, -0.024), P(0.18, -0.022), P(0.2, -0.029), P(0.33, -0.024)], F, "Blade");
    add(curve([P(0.33, 0.022), P(0.36, 0.008), P(0.365, -0.008), P(0.33, -0.024)], 4), F, "Tip");
    add(line(P(0.19, 0.024), P(0.205, -0.026), 4), { ...Fm, dark: 0.6 }, "Bend");
    add([P(-0.005, 0.07), P(0.02, 0.07), P(0.02, -0.07), P(-0.005, -0.07), P(-0.005, 0.07)], F, "Crossguard");
    add(line(P(0.0, 0.035), P(0.016, 0.02), 2), { ...H, dark: 0.7 }, "Tape");
    add(line(P(0.0, -0.02), P(0.016, -0.035), 2), { ...H, dark: 0.7 }, "Tape");
    // An earlier try at the sword, half rubbed out.
    add(line([0.24, -0.43], [0.43, -0.5], 6), { ...F, dark: 0.16, double: 0, press: 0.5 }, "Rubbed-out sword");
    add(line([0.28, -0.44], [0.42, -0.48], 4), { kind: "smudge", size: 0.07, dark: 0.08, double: 0, press: 0.7, wob: 0.004 }, "Eraser smudge");
    // A swoosh behind the swing.
    add(arc(0.2, -0.36, 0.24, -1.45, -0.6, 10), { ...H, dark: 0.45 }, "Swoosh");
    add(arc(0.2, -0.36, 0.27, -1.3, -0.75, 8), { ...H, dark: 0.35 }, "Swoosh");

    // Legs in an action stance, sneakers, a shadow under them.
    add(curve([[0.12, 0.13], [0.158, 0.26], [0.132, 0.42]]), F, "Leg");
    add(curve([[0.04, 0.148], [0.112, 0.272], [0.097, 0.42]]), F, "Leg");
    add(curve([[-0.1, 0.14], [-0.152, 0.28], [-0.222, 0.418]]), F, "Leg");
    add(curve([[-0.03, 0.152], [-0.082, 0.282], [-0.162, 0.42]]), F, "Leg");
    add(curve([[0.092, 0.42], [0.14, 0.412], [0.2, 0.447], [0.212, 0.48], [0.09, 0.488], [0.086, 0.43]], 3), F, "Sneaker");
    add(curve([[-0.165, 0.418], [-0.228, 0.412], [-0.282, 0.455], [-0.288, 0.49], [-0.158, 0.492], [-0.156, 0.43]], 3), F, "Sneaker");
    add(line([0.09, 0.47], [0.21, 0.468], 4), { ...Fm, dark: 0.5 }, "Sole");
    add(line([-0.285, 0.474], [-0.16, 0.476], 4), { ...Fm, dark: 0.5 }, "Sole");
    add(line([-0.32, 0.5], [0.24, 0.5], 6), { kind: "smudge", size: 0.05, dark: 0.18, double: 0, press: 0.8, wob: 0.003, in: 0.4, out: 0.4 }, "Shadow");
    return out;
  }

  // A scribbled note on the left page and an arrow to the cape: squiggles that read as handwriting.
  function notes() {
    const out = [];
    const N = { size: 0.0011, dark: 0.7, double: 0, press: 0.7, wob: 0.0004, redraw: 0.4, in: 0.08, out: 0.12 };
    const word = (x0, y, len, seed) => {
      const pts = [];
      const n = Math.round(len / 0.0035);
      for (let i = 0; i <= n; i++) {
        const t = i / n, x = x0 + len * t;
        const loop = Math.sin(i * 1.9 + seed) * 0.0032 + Math.sin(i * 0.7 + seed * 2) * 0.0012;
        pts.push([x, y + loop - (i % 5 === 2 ? 0.003 : 0)]);
      }
      return pts;
    };
    const lines = [[-0.172, -0.068, 0.05, 1], [-0.112, -0.068, 0.04, 2], [-0.172, -0.052, 0.034, 3], [-0.131, -0.052, 0.06, 4], [-0.172, -0.036, 0.07, 5], [-0.096, -0.036, 0.03, 6]];
    for (const [x, y, len, sd] of lines) out.push(pencil(word(x, y, len, sd), { ...N, name: "Note" }));
    out.push(pencil(line([-0.174, -0.06], [-0.064, -0.061], 6), { ...N, dark: 0.55, name: "Underline" }));
    out.push(pencil(curve([[-0.07, -0.02], [-0.03, -0.012], [0.0, 0.0], [0.03, 0.022]], 5), { ...N, size: 0.0012, name: "Arrow" }));
    out.push(pencil([[0.016, 0.019], [0.031, 0.023], [0.026, 0.008]], { ...N, size: 0.0012, name: "Arrowhead" }));
    // A little sword study in the corner of the page, and a circled number.
    out.push(pencil([[-0.17, -0.004], [-0.115, -0.022], [-0.112, -0.014], [-0.167, 0.004], [-0.17, -0.004]], { ...N, dark: 0.5, name: "Sword study" }));
    out.push(pencil(line([-0.172, -0.012], [-0.162, 0.008], 3), { ...N, dark: 0.5, name: "Sword study" }));
    out.push(pencil(arc(-0.035, 0.07, 0.009, 0, Math.PI * 2.2, 12), { ...N, dark: 0.5, name: "Circle" }));
    out.push(pencil(line([-0.035, 0.064], [-0.035, 0.076], 3), { ...N, dark: 0.6, name: "1" }));
    return out;
  }

  // ---------- the sketchbook (open, spiral-bound, 0.4 x 0.2 around its middle) ----------
  function sketchbook() {
    const paper = { material: "paper", puff: 0.1, shadow: 0, rough: 0.12, fuzz: 0.08, corner: 0.03 };
    const out = [
      rect(0, 0.004, 0.418, 0.214, "#5A4552", { material: "cardboard", colors: ["#5A4552", "#3E2F38"], corner: 0.06, puff: 0.35, shadow: 0.55, rough: 0.2, name: "Cover" }),
      rect(0, 0.003, 0.406, 0.206, "#E2D5BB", { ...paper, name: "Pages" }),
      rect(-0.101, 0, 0.198, 0.2, "#F6EEDC", { ...paper, name: "Left page" }),
      rect(0.101, 0, 0.198, 0.2, "#F7EFDE", { ...paper, name: "Right page" }),
      { el: "light", shape: "glow", mode: "shade", w: 0.05, h: 0.21, soft: 1, color: "#6B5848", strength: 0.22, name: "Gutter shadow", xf: { x: 0, y: 0, s: 1, r: 0 } },
    ];
    for (let i = 0; i < 13; i++) {
      const y = -0.088 + i * 0.0147;
      out.push(oval(-0.011, y, 0.0042, 0.0042, "#4A3E44", { puff: 0, rough: 0, fuzz: 0, name: "Hole" }));
      out.push(oval(0.011, y, 0.0042, 0.0042, "#4A3E44", { puff: 0, rough: 0, fuzz: 0, name: "Hole" }));
      out.push(rect(0, y - 0.0012, 0.026, 0.0042, "#9A969C", { material: "clay", colors: ["#9A969C", "#9A969C"], corner: 1, puff: 0.9, rough: 0, fuzz: 0, shadow: 0.25, name: "Spiral" }));
    }
    return out;
  }

  // ---------- the pencil lying on the page (along x, 0.19 long) ----------
  function pencilProp() {
    const body = { material: "paper", puff: 0.55, rough: 0.05, fuzz: 0.05, corner: 0.2 };
    return [
      rect(-0.004, 0.0015, 0.158, 0.0104, "#C99440", { ...body, shadow: 0.45, name: "Shadow side" }),
      rect(-0.004, -0.0015, 0.158, 0.0072, "#DDAA52", { ...body, name: "Barrel" }),
      rect(-0.004, -0.0035, 0.158, 0.0022, "#EDCB86", { ...body, puff: 0.2, corner: 1, name: "Facet" }),
      path([[0.075, -0.0052], [0.098, -0.0009], [0.098, 0.0009], [0.075, 0.0052]], "#E6C9A0", { material: "paper", puff: 0.3, rough: 0.1, name: "Sharpened wood" }),
      path([[0.0915, -0.0021], [0.1015, -0.0003], [0.1015, 0.0003], [0.0915, 0.0021]], "#3A3530", { material: "clay", puff: 0.5, rough: 0, name: "Lead" }),
      rect(-0.089, 0, 0.012, 0.0108, "#B9B2A4", { material: "clay", colors: ["#B9B2A4", "#B9B2A4"], puff: 0.7, corner: 0.15, name: "Ferrule" }),
      rect(-0.101, 0, 0.013, 0.0098, "#D08C7C", { material: "felt", colors: ["#D08C7C", "#D08C7C"], puff: 0.7, corner: 0.45, fuzz: 0.1, name: "Eraser" }),
    ];
  }

  // ---------- the handheld console, open like a DS: the hinge at (0, 0), 0.14 wide ----------
  // The top half stands up facing you; the bottom half lies on the desk, squashed by the low view.
  const DS_W = 0.14, DS_TOP = 0.08, DS_BASE = 0.044;
  function handheld() {
    const W = DS_W, TH = DS_TOP, BD = DS_BASE, flare = 0.007;
    const shell = { material: "paper", puff: 0.6, rough: 0.04, fuzz: 0, shadow: 0 };
    const flat = { material: "paper", puff: 0.2, rough: 0.02, fuzz: 0, shadow: 0 };
    // A point on the bottom half: u across (0 to 1), v from the hinge (0) to the front edge (1).
    const deck = (u, v) => [(-W / 2 - flare * v) + (W + 2 * flare * v) * u, BD * v];
    const quadPts = (u0, v0, u1, v1) => [deck(u0, v0), deck(u1, v0), deck(u1, v1), deck(u0, v1)];
    const dot = (u, v, w, color, name, o = {}) => { const [x, y] = deck(u, v); return oval(x, y, w, w * 0.55, color, { ...flat, puff: 0.6, ...o, name }); };
    const out = [
      { el: "light", shape: "glow", mode: "shade", w: W * 1.3, h: BD * 1.4, soft: 1, color: "#4A3428", strength: 0.32, name: "Shadow on the desk", xf: { x: 0.004, y: BD * 0.7, s: 1, r: 0 } },
      path([deck(0, 1), deck(1, 1), [deck(1, 1)[0], BD + 0.007], [deck(0, 1)[0], BD + 0.007]], "#5E3A4C", { ...flat, puff: 0.3, name: "Front edge" }),
      path(quadPts(0, 0, 1, 1), "#8E5670", { ...shell, colors: ["#7E4C63", "#9A6079"], round: 0.004, name: "Bottom half" }),
      path(quadPts(0.27, 0.16, 0.73, 0.86), "#2B2228", { ...flat, round: 0.001, name: "Bottom screen bezel" }),
    ];
    // The bottom screen: a little map, three rooms and the path between them.
    out.push(path(quadPts(0.3, 0.24, 0.7, 0.78), "#B9D3C4", { ...flat, material: "screen", colors: ["#C5DCCD", "#A9C9C0"], round: 0, name: "Bottom screen" }));
    for (const [u, v, c] of [[0.37, 0.38, "#E6BE55"], [0.5, 0.62, "#C0566E"], [0.63, 0.38, "#5F9161"]]) out.push(path(quadPts(u - 0.04, v - 0.1, u + 0.04, v + 0.1), c, { ...flat, material: "screen", round: 0, name: "Map room" }));
    out.push(path(quadPts(0.41, 0.36, 0.59, 0.41), "#7A6A5E", { ...flat, material: "screen", round: 0, name: "Map path" }));
    // D-pad on the left, four buttons on the right, start and select below them.
    const [px, py] = deck(0.13, 0.42);
    out.push(rect(px, py, 0.021, 0.0042, "#2B2228", { ...flat, puff: 0.4, corner: 0.2, name: "D-pad" }));
    out.push(rect(px, py, 0.0068, 0.0115, "#2B2228", { ...flat, puff: 0.4, corner: 0.2, name: "D-pad" }));
    out.push(dot(0.87, 0.24, 0.0072, "#E5D8BC", "Button"), dot(0.87, 0.6, 0.0072, "#E6BE55", "Button"), dot(0.82, 0.42, 0.0072, "#6F9A7E", "Button"), dot(0.92, 0.42, 0.0072, "#C0566E", "Button"));
    out.push(dot(0.85, 0.84, 0.004, "#5E3A4C", "Start"), dot(0.9, 0.84, 0.004, "#5E3A4C", "Select"));
    out.push(dot(0.06, 0.86, 0.0035, "#9BD39A", "Power light", { material: "screen" }));
    // The hinge, then the top half, standing.
    out.push(rect(0, -0.001, W * 0.97, 0.009, "#6E4258", { material: "clay", colors: ["#6E4258", "#6E4258"], puff: 0.8, corner: 1, rough: 0, fuzz: 0, name: "Hinge" }));
    out.push(rect(0, -TH / 2 - 0.004, W, TH, "#8E5670", { ...shell, colors: ["#A06A84", "#8E5670"], corner: 0.14, shadow: 0.35, name: "Top half" }));
    out.push(rect(0, -TH / 2 - 0.004, W * 0.7, TH * 0.8, "#2B2228", { ...flat, puff: 0.15, corner: 0.08, name: "Top screen bezel" }));
    for (const s of [-1, 1]) for (let i = 0; i < 3; i++) for (let j = 0; j < 2; j++) out.push(oval(s * (W * 0.42 + j * 0.006), -TH / 2 - 0.016 + i * 0.008, 0.0028, 0.0028, "#5E3A4C", { ...flat, puff: 0, name: "Speaker" }));
    return out;
  }
  // The top screen: the kid again, small, standing on a hill under a sunset, 20 x 15 pixels.
  function handheldScreen() {
    const SW = 0.088, SH = 0.066, cols = 20, rows = 15, pw = SW / cols, ph = SH / rows;
    const pix = { material: "screen", rough: 0, fuzz: 0, puff: 0, shadow: 0, corner: 0 };
    const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
    const fill = (r, c0, c1, ch) => { for (let c = c0; c <= c1; c++) if (c >= 0 && c < cols) grid[r][c] = ch; };
    fill(3, 13, 15, "c"); fill(4, 12, 16, "c"); fill(5, 13, 15, "c");
    fill(2, 2, 5, "w"); fill(3, 1, 7, "w");
    fill(10, 0, 4, "h"); fill(10, 14, 19, "h"); fill(9, 1, 3, "h"); fill(9, 16, 18, "h");
    fill(11, 0, 19, "g");
    for (let r = 12; r < rows; r++) fill(r, 0, 19, "d");
    const kid = ["..HH.", ".HSS.", "CSSE.", "CTTTW", "CTTT.", ".B.B."];
    kid.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== ".") grid[5 + r][7 + c] = ch; }));
    const out = [rect(0, 0, SW, SH, "#E8B48A", { ...pix, colors: ["#C98AA0", "#F0C48E"], name: "Sky" })];
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        const ch = grid[r][c];
        if (ch === ".") { c++; continue; }
        let e = c;
        while (e + 1 < cols && grid[r][e + 1] === ch) e++;
        out.push(rect(-SW / 2 + ((c + e + 1) / 2) * pw, -SH / 2 + (r + 0.5) * ph, (e - c + 1) * pw + 0.0002, ph + 0.0002, PAL[ch], { ...pix, name: "Pixel" }));
        c = e + 1;
      }
    }
    out.push({ el: "light", shape: "glow", w: 0.13, h: 0.1, soft: 0.8, color: "#F4C9A0", strength: 0.12, flicker: 0.3, name: "Screen glow", xf: { x: 0, y: 0, s: 1, r: 0 } });
    return out;
  }

  // ---------- the laptop, facing you: the hinge's middle at (0, 0) ----------
  // The lid stands up behind the hinge; the base lies on the desk in front of it, wider toward you.
  const LAP_W = 0.34, LAP_H = 0.215, LAP_D = 0.085;
  function laptop() {
    const W = LAP_W, LH = LAP_H, D = LAP_D, FW = W * 1.1;
    const deck = (u, v) => [(-W / 2) * (1 - v) + (-FW / 2) * v + (W * (1 - v) + FW * v) * u, D * v];
    const quadPts = (u0, v0, u1, v1) => [deck(u0, v0), deck(u1, v0), deck(u1, v1), deck(u0, v1)];
    const flat = { puff: 0.15, rough: 0.03, fuzz: 0 };
    const out = [
      { el: "light", shape: "glow", mode: "shade", w: FW * 1.15, h: D * 1.1, soft: 1, color: "#4A3428", strength: 0.3, name: "Shadow on the desk", xf: { x: 0.01, y: D * 0.62, s: 1, r: 0 } },
      path([deck(0, 1), deck(1, 1), [FW / 2, D + 0.009], [-FW / 2, D + 0.009]], "#8E867E", { ...flat, puff: 0.3, shadow: 0.4, name: "Base edge" }),
      path(quadPts(0, 0, 1, 1), "#C2BAAE", { ...flat, colors: ["#B5ADA1", "#CCC4B8"], puff: 0.25, round: 0.003, name: "Base" }),
      path(quadPts(0.07, 0.08, 0.93, 0.5), "#4A4450", { ...flat, puff: 0.1, round: 0.001, name: "Keyboard" }),
    ];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 12; c++) {
      const u0 = 0.085 + c * 0.0705, v0 = 0.1 + r * 0.098;
      out.push(path(quadPts(u0, v0, u0 + 0.058, v0 + 0.078), "#635C67", { puff: 0, rough: 0, fuzz: 0, round: 0.0004, name: "Key" }));
    }
    out.push(path(quadPts(0.37, 0.6, 0.63, 0.92), "#B0A89C", { ...flat, round: 0.002, name: "Trackpad" }));
    out.push(rect(0, -LH / 2, W + 0.006, LH + 0.004, "#8E867E", { material: "clay", colors: ["#A49C92", "#8E867E"], puff: 0.4, corner: 0.05, rough: 0, fuzz: 0, shadow: 0.35, name: "Lid edge" }));
    out.push(rect(0, -LH / 2, W, LH, "#2B2630", { corner: 0.04, puff: 0.25, rough: 0.03, fuzz: 0, name: "Lid" }));
    out.push(rect(0, -0.004, W * 0.3, 0.007, "#1E1A22", { corner: 1, puff: 0.2, rough: 0, fuzz: 0, name: "Hinge" }));
    return out;
  }

  // ---------- the laptop's screen: a tiny level with the kid as a pixel sprite ----------
  // The screen's own layer, so its picture can be swapped. Pixels are 40 x 24 on a 0.3 x 0.18 screen.
  const SPRITE = [
    "........W.",
    "...HHH..W.",
    "..HHHHH.W.",
    "..HSSSE.W.",
    ".CSSSSS.W.",
    "CC.SSS.GGG",
    "CCTTTTTTS.",
    "CCTTTTT...",
    "CC.TTTT...",
    "C..BBBB...",
    "...B..B...",
    "..KK..KK..",
  ];
  const PAL = { H: "#4A3428", S: "#E8B992", E: "#2B2228", T: "#EDE3CC", C: "#8E5670", B: "#3F6B55", K: "#2B2228", W: "#D6B47A", G: "#7A5A3E",
    g: "#5F9161", d: "#8A6446", D: "#6E4E36", b: "#B9804F", m: "#8E5E3A", c: "#E6BE55", w: "#F6F0E2", h: "#86A98D", p: "#EDE5D2", f: "#C0566E" };
  function level() {
    const cols = 40, rows = 24;
    const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
    const fill = (r, c0, c1, ch) => { for (let c = c0; c <= c1; c++) if (c >= 0 && c < cols) grid[r][c] = ch; };
    fill(3, 8, 11, "w"); fill(4, 6, 13, "w");
    fill(2, 28, 30, "w"); fill(3, 26, 32, "w");
    fill(14, 3, 6, "h"); fill(14, 21, 25, "h"); fill(15, 1, 8, "h"); fill(15, 18, 28, "h"); fill(15, 33, 36, "h");
    for (let r = 16; r <= 17; r++) fill(r, 0, cols - 1, "h");
    fill(18, 0, cols - 1, "g");
    for (let r = 19; r < rows; r++) fill(r, 0, cols - 1, "d");
    for (const [r, c] of [[20, 3], [21, 12], [20, 19], [22, 25], [21, 31], [22, 7], [20, 36], [22, 16]]) grid[r][c] = "D";
    fill(11, 20, 26, "b"); fill(12, 20, 26, "m");
    grid[8][22] = grid[9][22] = "c"; grid[8][24] = grid[9][24] = "c";
    grid[14][30] = grid[15][30] = "c";
    for (let r = 10; r <= 17; r++) grid[r][35] = "p";
    grid[9][35] = "c"; fill(10, 36, 37, "f"); fill(11, 36, 36, "f");
    SPRITE.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== ".") grid[6 + r][8 + c] = ch; }));
    return { grid, cols, rows };
  }
  const SCREEN_W = 0.3, SCREEN_H = 0.18;
  function screen() {
    const SW = SCREEN_W, SH = SCREEN_H;
    const { grid, cols, rows } = level();
    const pw = SW / cols, ph = SH / rows;
    const pix = { material: "screen", rough: 0, fuzz: 0, puff: 0, shadow: 0, corner: 0 };
    const out = [
      rect(0, 0, SW, SH, "#9CC2B6", { ...pix, colors: ["#A9C9C0", "#EAD3A8"], name: "Sky" }),
    ];
    for (let r = 0; r < rows; r++) {
      let c = 0;
      while (c < cols) {
        const ch = grid[r][c];
        if (ch === ".") { c++; continue; }
        let e = c;
        while (e + 1 < cols && grid[r][e + 1] === ch) e++;
        const n = e - c + 1;
        out.push(rect(-SW / 2 + (c + n / 2) * pw, -SH / 2 + (r + 0.5) * ph, n * pw + 0.0002, ph + 0.0002, PAL[ch], { ...pix, name: "Pixel" }));
        c = e + 1;
      }
    }
    out.push({ el: "light", shape: "glow", w: 0.5, h: 0.34, soft: 0.8, color: "#BFDCCB", strength: 0.16, flicker: 0.4, name: "Screen glow", xf: { x: 0, y: 0, s: 1, r: 0 } });
    return out;
  }

  // ---------- the window frame (painted sage) and the sill, in the wall's perspective ----------
  // The wall runs away to the right, so its level lines (the top, the rail, the bottom, the sill) all
  // meet at the vanishing point L.vp; the sides and the mullion stand straight up. Pieces stop just
  // past the frame's edges, since the window runs off them.
  function windowFrame(L) {
    const [x0, x1, yt, yb] = L.win, [vx, vy] = L.vp;
    const lev = (x, py) => vy + (py - vy) * (vx - x) / (vx - x0);    // the level line through (x0, py), at x
    const xr = Math.min(x1, L.A + 0.06);
    const t = 0.028, bar = 0.016, rail = 0.02;
    const paint = { material: "paper", colors: ["#5C8770", "#5C8770"], puff: 0.45, shadow: 0.35, rough: 0.12, fuzz: 0.05, round: 0.001 };
    const lit = { ...paint, colors: ["#6E9A81", "#6E9A81"] };
    const band = (xa, xb, p0, p1, o, name) => poly([[xa, lev(xa, p0)], [xb, lev(xb, p0)], [xb, lev(xb, p1)], [xa, lev(xa, p1)]], "", { ...o, name });
    const post = (xa, xb, p0, p1, o, name) => poly([[xa, Math.max(-0.06, lev(xa, p0))], [xb, Math.max(-0.06, lev(xb, p0))], [xb, lev(xb, p1)], [xa, lev(xa, p1)]], "", { ...o, name });
    const out = [
      band(x0, xr, L.rail - rail / 2, L.rail + rail / 2, paint, "Meeting rail"),
      post(L.mullion - bar / 2, L.mullion + bar / 2, yt, yb, paint, "Mullion"),
      post(x0 - t, x0, yt - t, yb + t, lit, "Left side"),
      x1 < L.A + 0.06 ? post(x1, x1 + t, yt - t, yb + t, paint, "Right side") : null,
      lev(xr, yt) > -0.01 ? band(x0 - t, xr, yt - t, yt, lit, "Top") : null,
      band(x0 - t, xr, yb, yb + t, paint, "Bottom"),
      band(x0 - t - 0.03, xr, yb + t, yb + t + 0.026, { ...lit, colors: ["#7AA48A", "#7AA48A"], shadow: 0.6, puff: 0.5 }, "Sill"),
    ].filter(Boolean);
    return out.map((it) => (it.colors[0] === "" ? { ...it, colors: paint.colors } : it));
  }

  // ---------- the bird: wings up in one pose, out in the other ----------
  function bird() {
    const ink = { material: "paper", colors: ["#3A2E3A", "#3A2E3A"], puff: 0, rough: 0.1, fuzz: 0, shadow: 0, round: 0.0008 };
    return [
      { ...path([[-0.017, -0.009], [-0.007, -0.0015], [0, 0.001], [0.007, -0.0015], [0.017, -0.009], [0.007, 0.002], [0, 0.0035], [-0.007, 0.002]], "#3A2E3A", ink), name: "Wings up", poses: [{}, { hide: true }] },
      { ...path([[-0.018, 0.004], [-0.007, -0.0008], [0, 0.0006], [0.007, -0.0008], [0.018, 0.004], [0.007, 0.002], [0, 0.003], [-0.007, 0.002]], "#3A2E3A", ink), name: "Wings out", poses: [{ hide: true }, {}] },
    ];
  }

  // ---------- the acoustic guitar: a steel-string dreadnought, standing, around its body (0.59 tall) ----------
  // Broad square shoulders and a shallow waist, a sunburst top with cream binding, a black teardrop
  // pickguard, a pin bridge, a long neck that meets the body at the 14th fret, and a solid headstock
  // with three tuners a side.
  function guitar() {
    const wood = { material: "paper", rough: 0.08, fuzz: 0.04 };
    const fine = { material: "paper", rough: 0, fuzz: 0, puff: 0 };
    // The body's outline, the right half from the neck down, mirrored for the left.
    const half = [[0.04, -0.124], [0.078, -0.106], [0.088, -0.068], [0.076, -0.022], [0.09, 0.028], [0.106, 0.074], [0.09, 0.118]];
    const body = [...half, [0, 0.138], ...half.slice().reverse().map(([x, y]) => [-x, y])];
    const scaled = (k, cy = 0.008, dx = 0, dy = 0) => body.map(([x, y]) => [x * k + dx, cy + (y - cy) * k + dy]);
    const out = [
      path(scaled(1, 0.008, 0.008, 0.006), "#3E2318", { ...wood, smooth: true, puff: 0.4, shadow: 0.55, name: "Sides" }),
      path(scaled(1), "#E9DCC2", { ...wood, smooth: true, puff: 0.5, name: "Binding" }),
      path(scaled(0.965), "#6E3A1E", { ...wood, smooth: true, puff: 0.4, name: "Sunburst edge" }),
      path(scaled(0.9), "#A9652E", { ...wood, smooth: true, puff: 0.2, fuzz: 0.12, name: "Sunburst" }),
      path(scaled(0.8), "#DDA85E", { ...wood, smooth: true, colors: ["#D69D52", "#E4B36C"], puff: 0.3, grain: 1.4, fuzz: 0.12, name: "Spruce top" }),
      path([[0.026, -0.058], [0.052, -0.054], [0.068, -0.026], [0.066, 0.006], [0.046, 0.026], [0.024, 0.02], [0.03, -0.004], [0.034, -0.03]], "#221815", { ...wood, smooth: true, puff: 0.15, name: "Pickguard" }),
      oval(0, -0.035, 0.074, 0.074, "#3A2A20", { ...wood, puff: 0.1, name: "Rosette" }),
      oval(0, -0.035, 0.069, 0.069, "#E3D3B4", { ...wood, puff: 0, name: "Rosette" }),
      oval(0, -0.035, 0.063, 0.063, "#1C1412", { ...wood, puff: 0, name: "Sound hole" }),
      rect(0, 0.07, 0.084, 0.017, "#2A1D18", { ...wood, puff: 0.45, corner: 0.6, name: "Bridge" }),
      rect(0, 0.064, 0.05, 0.0032, "#EFE6D2", { ...fine, puff: 0.3, corner: 1, name: "Saddle" }),
      oval(0, 0.139, 0.008, 0.006, "#CFC7B6", { ...fine, puff: 0.6, material: "clay", name: "Strap button" }),
    ];
    for (let i = 0; i < 6; i++) out.push(oval(-0.0125 + i * 0.005, 0.072, 0.0042, 0.0042, "#EFE6D2", { ...fine, puff: 0.6, name: "Bridge pin" }));
    // The neck: the scale runs from the nut to the saddle, frets placed the way real ones are.
    const nut = -0.372, scale = 0.064 - nut, joint = nut + scale * (1 - 2 ** (-14 / 12));
    const neckW = (y, k) => k * (0.026 + 0.006 * (y - nut) / (joint - nut));
    out.push(path([[-neckW(nut, 0.6), nut], [neckW(nut, 0.6), nut], [neckW(joint, 0.62), joint + 0.006], [-neckW(joint, 0.62), joint + 0.006]], "#7A4A2C", { ...wood, puff: 0.4, name: "Neck" }));
    out.push(path([[-neckW(nut, 0.5), nut], [neckW(nut, 0.5), nut], [neckW(joint, 0.5), joint + 0.004], [-neckW(joint, 0.5), joint + 0.004]], "#2E211B", { ...wood, puff: 0.2, name: "Fretboard" }));
    const fretY = (n) => nut + scale * (1 - 2 ** (-n / 12));
    for (let n = 1; n <= 14; n++) { const y = fretY(n); out.push(rect(0, y, neckW(y, 1), 0.0014, "#C9C1B2", { ...fine, name: "Fret" })); }
    for (const n of [3, 5, 7, 9]) out.push(oval(0, (fretY(n - 1) + fretY(n)) / 2, 0.0042, 0.0042, "#EFE6D2", { ...fine, name: "Inlay" }));
    for (const s of [-1, 1]) { const y = (fretY(11) + fretY(12)) / 2; out.push(oval(s * 0.0055, y, 0.0038, 0.0038, "#EFE6D2", { ...fine, name: "Inlay" })); }
    out.push(rect(0, nut, 0.028, 0.0045, "#EFE6D2", { ...fine, puff: 0.3, name: "Nut" }));
    // The headstock: solid, a little flared, three tuners a side with metal buttons.
    out.push(path([[-0.014, nut], [0.014, nut], [0.025, nut - 0.074], [0.02, nut - 0.082], [-0.02, nut - 0.082], [-0.025, nut - 0.074]], "#2A1D18", { ...wood, puff: 0.4, shadow: 0.4, name: "Headstock" }));
    out.push(path([[-0.004, nut - 0.004], [0.004, nut - 0.004], [0.006, nut - 0.016], [-0.006, nut - 0.016]], "#EFE6D2", { ...fine, round: 0.001, name: "Truss rod cover" }));
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) {
      const y = nut - 0.026 - i * 0.02, edge = 0.017 + i * 0.0035;
      out.push(rect(s * (edge + 0.006), y, 0.012, 0.003, "#B9B2A4", { ...fine, material: "clay", colors: ["#B9B2A4", "#B9B2A4"], puff: 0.4, name: "Tuner shaft" }));
      out.push(oval(s * (edge + 0.014), y, 0.009, 0.0125, "#D8D0C0", { ...fine, material: "clay", colors: ["#E2DACA", "#B9B2A4"], puff: 0.7, name: "Tuner" }));
      out.push(oval(s * (edge - 0.006), y, 0.005, 0.005, "#D8D0C0", { ...fine, material: "clay", colors: ["#D8D0C0", "#D8D0C0"], puff: 0.6, name: "String post" }));
    }
    // Six strings, nut to saddle; the three wound ones a little thicker and bronze.
    for (let i = 0; i < 6; i++) {
      const a = -0.0105 + i * 0.0042, b = -0.0125 + i * 0.005, w = i < 3 ? 0.0009 : 0.0006;
      out.push(path([[a - w / 2, nut], [a + w / 2, nut], [b + w / 2, 0.064], [b - w / 2, 0.064]], i < 3 ? "#C2A472" : "#D6D0C4", { ...fine, round: 0, name: "String" }));
    }
    return out;
  }

  // ---------- the guitar stand: an A-frame in black tube, in the guitar's units ----------
  // The guitar sits in a padded cradle a little off the floor, its neck held by a yoke. The parts
  // behind the guitar come first, then the guitar, then the parts in front of it.
  const STAND_FLOOR = 0.178;
  function guitarStand() {
    const metal = { material: "clay", colors: ["#2E2A2C", "#2E2A2C"], puff: 0.6, rough: 0.02, fuzz: 0, shadow: 0 };
    const rubber = { material: "felt", colors: ["#1E1A1C", "#1E1A1C"], puff: 0.6, rough: 0.05, fuzz: 0.05, shadow: 0 };
    const tube = (a, b, w, o, name) => {
      const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy), nx = (-dy / L) * w / 2, ny = (dx / L) * w / 2;
      return path([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]], o.colors[0], { ...o, round: w * 0.3, name });
    };
    const hub = [0, 0.15], yokeY = -0.29, F = STAND_FLOOR;
    const behind = [
      tube([0, F - 0.004], hub, 0.008, metal, "Back leg"),
      tube(hub, [0, yokeY + 0.01], 0.008, metal, "Post"),
      rect(0, yokeY + 0.004, 0.05, 0.007, "#2E2A2C", { ...metal, corner: 1, name: "Yoke" }),
    ];
    const front = [
      tube(hub, [-0.1, F], 0.009, metal, "Leg"),
      tube(hub, [0.1, F], 0.009, metal, "Leg"),
      oval(-0.1, F, 0.018, 0.008, "", { ...rubber, name: "Foot" }),
      oval(0.1, F, 0.018, 0.008, "", { ...rubber, name: "Foot" }),
      oval(0, F, 0.014, 0.006, "", { ...rubber, name: "Foot" }),
      tube(hub, [-0.062, 0.118], 0.008, metal, "Cradle arm"),
      tube(hub, [0.062, 0.118], 0.008, metal, "Cradle arm"),
      rect(-0.064, 0.118, 0.026, 0.011, "", { ...rubber, corner: 1, name: "Cradle pad" }),
      rect(0.064, 0.118, 0.026, 0.011, "", { ...rubber, corner: 1, name: "Cradle pad" }),
      oval(0, hub[1], 0.016, 0.016, "", { ...metal, name: "Hub" }),
      tube([-0.024, yokeY + 0.006], [-0.022, yokeY - 0.016], 0.008, rubber, "Yoke arm"),
      tube([0.024, yokeY + 0.006], [0.022, yokeY - 0.016], 0.008, rubber, "Yoke arm"),
    ];
    const fix = (it) => (it.colors && it.colors[0] === "" ? { ...it, colors: [...(it.material === "felt" ? rubber : metal).colors] } : it);
    return { behind: behind.map(fix), front: front.map(fix) };
  }

  // ---------- the soccer ball, radius 0.05 ----------
  function ball() {
    const R = 0.05;
    const patch = { material: "felt", colors: ["#2E2830", "#2E2830"], puff: 0.3, rough: 0.15, fuzz: 0.1 };
    const out = [
      oval(0, 0, 2 * R, 2 * R, "#EDE4D2", { material: "felt", colors: ["#EDE4D2", "#EDE4D2"], puff: 0.85, shadow: 0.6, fuzz: 0.2, rough: 0.1, name: "Ball" }),
      shape({ shape: "polygon", sides: 5, star: 0, w: 0.03, h: 0.03, ...patch, name: "Patch", xf: { x: -0.004, y: -0.006, s: 1, r: 0.15 } }),
    ];
    for (let i = 0; i < 5; i++) {
      const a = 0.15 - Math.PI / 2 + (i * 2 * Math.PI) / 5 + Math.PI / 5;
      const d = R * 0.78;
      out.push(shape({ shape: "polygon", sides: 5, star: 0, w: 0.026, h: 0.014, ...patch, name: "Patch", xf: { x: r4(-0.004 + d * Math.cos(a)), y: r4(-0.006 + d * Math.sin(a)), s: 1, r: r4(a + Math.PI / 2) } }));
    }
    return out;
  }

  // ---------- the two layouts ----------
  // Where each object goes. The art pack's wall and desk shaders hold the same numbers (WIN, VPW,
  // QB, QF and the rest in desk-art.js) and pick their layout from "n"; change them together.
  //   vp       where the wall's level lines meet, on the horizon (eye level)
  //   win      the window opening: left and right x, then its top and bottom y at the left side
  //   rail     the meeting rail's y at the left side; mullion: its x
  //   view     the rect the view through the window is painted over, set so its horizon sits at eye level
  //   k        how much a flat thing on the desk is squashed by the low view
  const LAYOUTS = {
    wide: {
      n: 0, A: 16 / 9,
      vp: [4.2, 0.44],
      win: [1.0, 2.3, -0.2, 0.545], rail: 0.17, mullion: 1.6,
      view: [0.7, -0.078, 2.0, 0.762],
      laptop: { x: 1.0, y: 0.655, s: 1, r: 0 },
      sketchbook: { x: 0.58, y: 0.782, s: 0.86, r: -0.03, k: 0.8 },
      pencil: { x: -0.085, y: 0.045, s: 1, r: -0.42 },
      handheld: { x: 1.33, y: 0.712, s: 0.9, r: -0.08 },
      guitar: { x: 1.69, y: 0.716, s: 0.85, r: 0 },   // its stand's feet on the floor at the wall
      ball: { x: 1.39, y: 0.886, s: 0.85, r: 0 },
      bird: { y: 0.27, from: 0.95, to: 2.0 },
      sun: [
        { el: "light", w: 0.36, h: 0.06, skew: -1.0, panes: [2, 2], bar: 0.3, soft: 0.14, color: "#FFB868", strength: 0.22, fade: 0.3, name: "Window light on the desk", xf: { x: 0.7, y: 0.69, s: 1, r: -0.04 } },
        { el: "light", w: 0.2, h: 0.035, skew: -1.6, panes: [2, 1], bar: 0.2, soft: 0.3, color: "#FFB868", strength: 0.2, fade: 0.2, name: "Window light on the floor", xf: { x: 1.66, y: 0.885, s: 1, r: -0.02 } },
      ],
      glow: { x: 1.67, y: 0.7, w: 0.42, h: 0.28 },
      focus: [0.889, 0.5],
    },
    tall: {
      n: 1, A: 9 / 19.5,
      vp: [2.2, 0.33],
      win: [0.05, 0.8, 0.03, 0.4], rail: 0.2, mullion: 0.385,
      view: [-0.15, -0.01, 0.55, 0.54],
      laptop: { x: 0.25, y: 0.535, s: 0.55, r: 0 },
      sketchbook: { x: 0.13, y: 0.69, s: 0.5, r: -0.05, k: 0.8 },
      pencil: { x: -0.085, y: 0.045, s: 1, r: -0.42 },
      handheld: { x: 0.375, y: 0.648, s: 0.55, r: -0.1 },
      guitar: { x: 0.415, y: 0.44, s: 0.62, r: 0 },
      ball: null, // no floor in the tall frame
      bird: { y: 0.15, from: -0.25, to: 0.75 },
      sun: [
        { el: "light", w: 0.16, h: 0.045, skew: -1.0, panes: [2, 2], bar: 0.3, soft: 0.14, color: "#FFB868", strength: 0.22, fade: 0.3, name: "Window light on the desk", xf: { x: 0.12, y: 0.52, s: 1, r: -0.06 } },
      ],
      glow: { x: 0.3, y: 0.44, w: 0.3, h: 0.08 },
      focus: [0.231, 0.5],
    },
  };

  function build(opts = {}) {
    const L = LAYOUTS[opts.tall ? "tall" : "wide"];
    const A = L.A, M = 0.06;
    strokeSeed = 1;
    const view = L.view;

    // The sketchbook, the drawing on it and the pencil share one layer and one boil, as one object would.
    const sb = L.sketchbook;
    // The kid fills most of his page, and his lines are drawn a little darker and bolder than a
    // page seen up close would need, so they still read from across the desk.
    const drawing = { x: 0.1, y: 0.008, s: 0.162, r: 0 };
    const bold = (it) => ({ ...it, size: r5(it.size * 1.4), dark: Math.min(1, Math.round(it.dark * 1.18 * 100) / 100) });
    const sketchLayer = {
      id: "sketchbook", name: "Sketchbook", depth: 0.36, boil: 0.9, cycle: { frames: 3, rate: 6 },
      groups: { "group-book": { name: "Sketchbook" }, "group-hero": { name: "Kid hero sketch" }, "group-notes": { name: "Notes" }, "group-pencil": { name: "Pencil" } },
      paint: [
        ...grouped(place(sketchbook(), sb), "group-book"),
        ...grouped(place(place(heroSketch().map(bold), drawing), sb), "group-hero"),
        ...grouped(place(notes(), sb), "group-notes"),
        ...grouped(place(place(pencilProp(), L.pencil), sb), "group-pencil"),
      ],
    };

    const layers = [
      // Through the window: sky, a drifting cloud, hills, vines, a bird. The wall in front frames them.
      { id: "sky", name: "Sunset sky", rect: view, res: 0.5, depth: 0, far: true, boil: 0, paint: [{ shader: "dsky" }] },
      { id: "cloud", name: "Drifting cloud", rect: view, res: 0.5, depth: 0.005, far: true, boil: 0.4, anim: { type: "cycle", frames: 24, rate: 4 }, paint: [{ shader: "dclouds" }] },
      { id: "hills", name: "Golden hills and oaks", rect: view, res: 0.75, depth: 0.01, far: true, boil: 0.5, paint: [{ shader: "dhills" }] },
      { id: "vines", name: "Vineyard rows", rect: view, depth: 0.015, far: true, boil: 0.6, anim: { type: "cycle", frames: 4, rate: 4 }, paint: [{ shader: "dvines" }] },
      { id: "bird", name: "Bird", depth: 0.01, far: true, boil: 0.5, cycle: { frames: 2, rate: 4 },
        anim: { type: "travel", from: [L.bird.from, 0], to: [L.bird.to, -0.03], speed: 1, phase: 0.1, bob: 0.005, bobs: 3 }, paint: place(bird(), { x: 0, y: L.bird.y, s: opts.tall ? 0.8 : 1, r: 0 }) },

      // The room. The wall is kept still: no boil, no motion, nothing on it in the upper left.
      { id: "wall", name: "Wall and floor", rect: [-M, -M, A + M, 1 + M], depth: 0.02, boil: 0, paint: [{ shader: "dwall", n: L.n }] },
      { id: "wall-glow", name: "Sunset on the wall", depth: 0.02, boil: 0, paint: [
        { el: "light", shape: "glow", w: L.glow.w, h: L.glow.h, soft: 1, color: "#FFB070", strength: 0.12, name: "Glow under the window", xf: { x: L.glow.x, y: L.glow.y, s: 1, r: 0 } },
      ] },
      { id: "window", name: "Window frame", depth: 0.03, boil: 0.5, paint: windowFrame(L) },
      { id: "guitar", name: "Acoustic guitar", depth: 0.08, boil: 0.8, groups: { "group-guitar": { name: "Guitar" }, "group-stand": { name: "Guitar stand" }, "group-stand-front": { name: "Stand, in front" } },
        paint: (({ behind, front }) => [...grouped(place(behind, L.guitar), "group-stand"), ...grouped(place(guitar(), L.guitar), "group-guitar"), ...grouped(place(front, L.guitar), "group-stand-front")])(guitarStand()) },
      L.ball ? { id: "ball", name: "Soccer ball", depth: 0.12, boil: 0.9, paint: place(ball(), L.ball) } : null,

      { id: "desk", name: "Desk", rect: [-M, 0.3, A + M, 1 + M], depth: 0.3, boil: 0.5, paint: [{ shader: "ddesk", n: L.n }] },
      { id: "sunlight", name: "Window light", depth: 0.33, boil: 0.3, paint: L.sun.map((it) => ({ ...it })) },
      sketchLayer,
      { id: "laptop", name: "Laptop", depth: 0.36, boil: 0.6, groups: { "group-laptop": { name: "Laptop" } }, paint: grouped(place(laptop(), L.laptop), "group-laptop") },
      { id: "screen", name: "Laptop screen", depth: 0.36, boil: 0.4, cycle: { frames: 4, rate: 4 }, groups: { "group-screen": { name: "Pixel level" } },
        paint: grouped(place(place(screen(), { x: 0, y: -LAP_H / 2 - 0.004, s: 1, r: 0 }), L.laptop), "group-screen") },
      { id: "handheld", name: "Handheld console", depth: 0.38, boil: 0.8, groups: { "group-handheld": { name: "Handheld console" }, "group-handheld-screen": { name: "Handheld screen" } },
        paint: [...grouped(place(handheld(), L.handheld), "group-handheld"), ...grouped(place(place(handheldScreen(), { x: 0, y: -DS_TOP / 2 - 0.004, s: 1, r: 0 }), L.handheld), "group-handheld-screen")] },
      // In front of everything: the shafts of light in the air, and the dust in them.
      { id: "rays", name: "Light rays", rect: [-M, -M, A + M, 1 + M], res: 0.5, depth: 0.4, boil: 0.2, anim: { type: "cycle", frames: 24, rate: 4 }, paint: [{ shader: "drays", n: L.n }] },
    ];

    return {
      format: "elaborate-backgrounds/scene", version: 1,
      title: opts.tall ? "Desk by the Window, tall" : "Desk by the Window",
      note: "Eder's desk by a window at sunset, for his portfolio's hero. Concept, characters and art direction by Eder Yepez Cuevas. Procedural: every piece is drawn by code. The name is a placeholder.",
      art: "desk",
      aspect: r4(A), focus: L.focus,
      background: "#F3E6CF", horizon: "#E9B98F",
      camera: { drift: [0.002, 0.0008] },
      fps: 12, boil: 1,
      layers: layers.filter(Boolean).map(tidyLayer),
      post: {
        depth: { radius: 0.45, near: 0 },
        bloom: { glow: 0.3, threshold: 0.78, mist: 0.06, radius: 0.85 },
        halation: { amount: 0.12, threshold: 0.8, color: "#FF9A60" },
        ca: { amount: 0.0002 },
        vignette: { amount: 0.08, color: "#E8C9A0" },
        grain: { amount: 0.016, perFrame: false },
        sway: { amount: 0, ghost: 0, edges: 0 },
        on: { depth: true, bloom: true, halation: true, grade: true, ca: true, vignette: true, grain: true, sway: false },
      },
      grades: {
        evening: {
          exposure: 0.16, temperature: 0.12, tint: 0.02, contrast: 1.02, saturation: 1.0,
          floor: "#1E1A15", whiteCap: 1.0, redCap: 1.0, shadowTint: "#8E5670", highlightTint: "#FFF2DE", split: 0.12,
        },
      },
      grade: "evening",
      images: {},
    };
  }
  function tidyLayer(Lr) {
    if (Lr.paint) Lr.paint = Lr.paint.map((it) => tidy(it));
    return Lr;
  }

  LB.scenes = LB.scenes || {};
  LB.scenes.desk = build;
})();
