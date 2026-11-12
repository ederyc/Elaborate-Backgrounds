/*
  Desk by the Window (a placeholder name): Eder's desk by a window in the
  evening, made for the hero of his portfolio. Concept, characters and art
  direction by Eder Yepez Cuevas; every picture is drawn by code.

  A wooden desk on the left, its front edge running up from the bottom-left
  corner to the middle of the frame. On it, front to back: an open
  sketchbook with a pencil drawing of the kid hero (a blanket for a cape, a
  cardboard sword), a pencil lying on it, a game controller, and a laptop
  turned toward the window, showing the same kid as a pixel sprite in a
  tiny level. Through the window, a Lodi vineyard at sunset. An acoustic
  guitar leans under the window and a soccer ball sits on the floor.

  The upper left is kept for the portfolio's photo card and headline: a
  plain, light, still wall. Nothing there moves, boils or glows.

  Motion: the pencil lines are redrawn pose by pose (pencil boil), the
  paper boils, vine leaves rustle, one cloud drifts, a bird crosses, and the
  laptop's screen flickers gently.

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
  // Every object is built around (0, 0) in its own units, then placed: moved, scaled and turned.
  const at = (g, x, y) => {
    const c = Math.cos(g.r || 0), s = Math.sin(g.r || 0), k = g.s ?? 1;
    return [g.x + k * (c * x - s * y), g.y + k * (s * x + c * y)];
  };
  function place(items, g) {
    return items.map((it0) => {
      const it = clone(it0);
      if (it.el === "pencil") {
        it.points = it.points.map((q) => { const [x, y] = at(g, q[0], q[1]); return [r5(x), r5(y), q[2]]; });
        if (it.size) it.size = r5(it.size * (g.s ?? 1));
        return it;
      }
      const t = it.xf || { x: 0, y: 0, s: 1, r: 0 };
      const [x, y] = at(g, t.x, t.y);
      it.xf = { x: r4(x), y: r4(y), s: r4((t.s ?? 1) * (g.s ?? 1)), r: r4((t.r || 0) + (g.r || 0)) };
      return it;
    });
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

  // ---------- the game controller (about 0.12 x 0.075) ----------
  function controller() {
    const plastic = { puff: 0.75, rough: 0.05, fuzz: 0, material: "paper" };
    return [
      shape({ shape: "blob", material: "paper", colors: ["#6A5466", "#6A5466"], puff: 0.8, shadow: 0.6, rough: 0.05, fuzz: 0, merge: 0.02, name: "Body",
        lobes: [[-0.038, 0.014, 0.029], [0.038, 0.014, 0.029], [0, -0.006, 0.03], [-0.022, -0.012, 0.026], [0.022, -0.012, 0.026]], xf: { x: 0, y: 0, s: 1, r: 0 } }),
      rect(-0.031, -0.008, 0.017, 0.0052, "#2E2530", { ...plastic, puff: 0.3, corner: 0.2, name: "D-pad" }),
      rect(-0.031, -0.008, 0.0052, 0.017, "#2E2530", { ...plastic, puff: 0.3, corner: 0.2, name: "D-pad" }),
      oval(0.031, -0.016, 0.0072, 0.0072, "#C9973F", { ...plastic, name: "Button" }),
      oval(0.038, -0.009, 0.0072, 0.0072, "#C07A8C", { ...plastic, name: "Button" }),
      oval(0.024, -0.009, 0.0072, 0.0072, "#6F9A7E", { ...plastic, name: "Button" }),
      oval(0.031, -0.002, 0.0072, 0.0072, "#E5D8BC", { ...plastic, name: "Button" }),
      oval(-0.013, 0.012, 0.014, 0.014, "#2E2530", { ...plastic, name: "Stick" }),
      oval(0.013, 0.012, 0.014, 0.014, "#2E2530", { ...plastic, name: "Stick" }),
      oval(-0.0138, 0.0108, 0.008, 0.008, "#4A3E48", { ...plastic, name: "Stick top" }),
      oval(0.0122, 0.0108, 0.008, 0.008, "#4A3E48", { ...plastic, name: "Stick top" }),
      rect(0, -0.011, 0.012, 0.003, "#3E3340", { ...plastic, puff: 0.2, corner: 1, name: "Start" }),
    ];
  }

  // ---------- the laptop: lid around (0, 0), 0.125 square; the base reaches toward you and the window ----------
  function laptop() {
    const W = 0.125, Hh = 0.125, base = [0.042, 0.052];
    const hingeL = [-W / 2, Hh / 2], hingeR = [W / 2, Hh / 2];
    const add = (p, v) => [p[0] + v[0], p[1] + v[1]];
    const fl = add(hingeL, base), fr = add(hingeR, base);
    const deck = (u, v) => [hingeL[0] + (hingeR[0] - hingeL[0]) * u + base[0] * v, hingeL[1] + (hingeR[1] - hingeL[1]) * u + base[1] * v];
    const quadPts = (u0, v0, u1, v1) => [deck(u0, v0), deck(u1, v0), deck(u1, v1), deck(u0, v1)];
    const out = [
      path([add(fl, [0, 0.006]), add(fr, [0, 0.006]), fr, fl], "#8E867E", { puff: 0.2, rough: 0.05, fuzz: 0, shadow: 0.55, name: "Base edge" }),
      path([hingeL, hingeR, fr, fl], "#C2BAAE", { puff: 0.25, rough: 0.05, fuzz: 0, name: "Base" }),
      path(quadPts(0.08, 0.1, 0.92, 0.55), "#4A4450", { puff: 0.1, rough: 0.02, fuzz: 0, name: "Keyboard" }),
    ];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 10; c++) {
      const u0 = 0.1 + c * 0.081, v0 = 0.13 + r * 0.103;
      out.push(path(quadPts(u0, v0, u0 + 0.066, v0 + 0.08), "#625B66", { puff: 0, rough: 0, fuzz: 0, round: 0.0003, name: "Key" }));
    }
    out.push(path(quadPts(0.36, 0.64, 0.64, 0.92), "#B3AB9F", { puff: 0.1, rough: 0.02, fuzz: 0, name: "Trackpad" }));
    out.push(rect(-W / 2 - 0.002, 0, 0.005, Hh, "#A49C92", { material: "clay", colors: ["#A49C92", "#A49C92"], puff: 0.4, corner: 0.5, rough: 0, fuzz: 0, name: "Lid edge" }));
    out.push(rect(0, 0, W, Hh, "#2B2630", { corner: 0.06, puff: 0.3, rough: 0.03, fuzz: 0, shadow: 0.35, name: "Lid" }));
    out.push(rect(0, Hh / 2 - 0.003, W * 0.32, 0.004, "#1E1A22", { corner: 1, puff: 0.2, rough: 0, fuzz: 0, name: "Hinge" }));
    return out;
  }

  // ---------- the laptop's screen: a tiny level with the kid as a pixel sprite ----------
  // The screen's own layer, so its picture can be swapped. Pixels are 31 x 25 on a 0.112 x 0.1 screen.
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
    const cols = 31, rows = 25;
    const grid = Array.from({ length: rows }, () => Array(cols).fill("."));
    const fill = (r, c0, c1, ch) => { for (let c = c0; c <= c1; c++) if (c >= 0 && c < cols) grid[r][c] = ch; };
    fill(3, 7, 10, "w"); fill(4, 5, 12, "w");
    fill(15, 4, 7, "h"); fill(15, 21, 25, "h"); fill(16, 2, 9, "h"); fill(16, 18, 27, "h");
    for (let r = 17; r <= 18; r++) fill(r, 0, 30, "h");
    fill(19, 0, 30, "g");
    for (let r = 20; r <= 24; r++) fill(r, 0, 30, "d");
    for (const [r, c] of [[21, 3], [22, 12], [21, 19], [23, 25], [22, 28], [23, 7]]) grid[r][c] = "D";
    fill(12, 19, 25, "b"); fill(13, 19, 25, "m");
    grid[9][21] = grid[10][21] = "c"; grid[9][23] = grid[10][23] = "c";
    for (let r = 11; r <= 18; r++) grid[r][28] = "p";
    grid[10][28] = "c"; fill(11, 29, 30, "f"); fill(12, 29, 29, "f");
    SPRITE.forEach((row, r) => [...row].forEach((ch, c) => { if (ch !== ".") grid[7 + r][7 + c] = ch; }));
    return { grid, cols, rows };
  }
  function screen() {
    const SW = 0.112, SH = 0.1;
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
    out.push({ el: "light", shape: "glow", w: 0.2, h: 0.18, soft: 0.8, color: "#BFDCCB", strength: 0.16, flicker: 0.4, name: "Screen glow", xf: { x: 0, y: 0, s: 1, r: 0 } });
    return out;
  }

  // ---------- the window frame (painted sage), the sill and the glass, around the opening's middle ----------
  function windowFrame(w, h) {
    const t = 0.024, bar = 0.013, rail = 0.017;
    const paint = { material: "paper", colors: ["#5C8770", "#5C8770"], puff: 0.45, shadow: 0.35, rough: 0.12, fuzz: 0.05, corner: 0.04 };
    const lit = { ...paint, colors: ["#6E9A81", "#6E9A81"] };
    const meet = -h * 0.04;
    return [
      rect(0, meet, w, rail, "", { ...paint, name: "Meeting rail" }),
      rect(0, 0, bar, h, "", { ...paint, name: "Mullion" }),
      rect(-w / 2 - t / 2, 0, t, h + 2 * t, "", { ...paint, name: "Left side" }),
      rect(w / 2 + t / 2, 0, t, h + 2 * t, "", { ...paint, name: "Right side" }),
      rect(0, -h / 2 - t / 2, w + 2 * t, t, "", { ...lit, name: "Top" }),
      rect(0, h / 2 + t / 2, w + 2 * t, t, "", { ...paint, name: "Bottom" }),
      rect(0, h / 2 + t + 0.011, w + 2 * t + 0.07, 0.024, "", { ...lit, colors: ["#7AA48A", "#7AA48A"], shadow: 0.6, puff: 0.5, name: "Sill" }),
    ].map((it) => (it.el === "shape" && it.colors[0] === "" ? { ...it, colors: paint.colors } : it));
  }

  // ---------- the bird: wings up in one pose, out in the other ----------
  function bird() {
    const ink = { material: "paper", colors: ["#3A2E3A", "#3A2E3A"], puff: 0, rough: 0.1, fuzz: 0, shadow: 0, round: 0.0008 };
    return [
      { ...path([[-0.017, -0.009], [-0.007, -0.0015], [0, 0.001], [0.007, -0.0015], [0.017, -0.009], [0.007, 0.002], [0, 0.0035], [-0.007, 0.002]], "#3A2E3A", ink), name: "Wings up", poses: [{}, { hide: true }] },
      { ...path([[-0.018, 0.004], [-0.007, -0.0008], [0, 0.0006], [0.007, -0.0008], [0.018, 0.004], [0.007, 0.002], [0, 0.003], [-0.007, 0.002]], "#3A2E3A", ink), name: "Wings out", poses: [{ hide: true }, {}] },
    ];
  }

  // ---------- the acoustic guitar, upright around its body (0.44 tall) ----------
  function guitar() {
    const wood = { material: "paper", rough: 0.1, fuzz: 0.05 };
    const lobes = (k) => [[0, 0.03, 0.062 * k], [0, -0.055, 0.047 * k]];
    const out = [
      shape({ shape: "blob", ...wood, colors: ["#6A3E2C", "#6A3E2C"], puff: 0.4, shadow: 0.55, merge: 0.03, lobes: lobes(1.09), name: "Sides", xf: { x: 0, y: 0, s: 1, r: 0 } }),
      shape({ shape: "blob", ...wood, colors: ["#D3A266", "#D3A266"], puff: 0.5, merge: 0.03, lobes: lobes(1), grain: 1.4, name: "Top", xf: { x: 0, y: 0, s: 1, r: 0 } }),
      path([[0.004, -0.008], [0.034, 0.006], [0.042, 0.03], [0.026, 0.044], [0.008, 0.026]], "#5A3424", { ...wood, smooth: true, puff: 0.2, name: "Pickguard" }),
      oval(0, -0.024, 0.044, 0.044, "#8A5A36", { ...wood, puff: 0.2, name: "Rosette" }),
      oval(0, -0.024, 0.034, 0.034, "#2A1E1A", { ...wood, puff: 0, name: "Sound hole" }),
      rect(0, 0.052, 0.042, 0.009, "#3A2620", { ...wood, puff: 0.4, corner: 0.4, name: "Bridge" }),
      rect(0, -0.19, 0.018, 0.2, "#5A3A2A", { ...wood, puff: 0.4, corner: 0.2, name: "Neck" }),
      rect(0, -0.19, 0.0135, 0.2, "#33251E", { ...wood, puff: 0.2, corner: 0.1, name: "Fretboard" }),
      path([[-0.012, -0.288], [0.012, -0.288], [0.015, -0.345], [-0.015, -0.338]], "#4A3022", { ...wood, puff: 0.35, name: "Headstock" }),
    ];
    for (let i = 0; i < 6; i++) out.push(rect(0, -0.11 - i * 0.026, 0.0135, 0.0012, "#B9AE98", { ...wood, puff: 0, rough: 0, fuzz: 0, name: "Fret" }));
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) out.push(oval(s * 0.019, -0.3 - i * 0.014, 0.008, 0.006, "#D9CFB8", { ...wood, puff: 0.6, name: "Tuning peg" }));
    for (let i = 0; i < 4; i++) out.push(rect(-0.0045 + i * 0.003, -0.118, 0.0006, 0.34, "#A3967D", { ...wood, puff: 0, rough: 0, fuzz: 0, name: "String" }));
    return out;
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
  // Where each object goes. The art pack's wall and desk read the same layout from "n".
  const LAYOUTS = {
    wide: {
      n: 0, A: 16 / 9,
      win: [0.99, 0.10, 1.68, 0.69],
      sketchbook: { x: 0.60, y: 0.835, s: 1, r: -0.28 },
      pencil: { x: -0.085, y: 0.045, s: 1, r: -0.42 },
      controller: { x: 0.9, y: 0.722, s: 1, r: -0.3 },
      laptop: { x: 0.878, y: 0.508, s: 1, r: -0.1 },
      guitar: { x: 1.15, y: 0.785, s: 0.8, r: 0.1 },
      ball: { x: 1.6, y: 0.838, s: 1, r: 0 },
      bird: { y: 0.27, from: 0.7, to: 2.0 },
      sun: [
        { el: "light", w: 0.2, h: 0.085, skew: -0.8, panes: [2, 2], bar: 0.34, soft: 0.14, color: "#FFB868", strength: 0.22, fade: 0.35, name: "Window light on the desk", xf: { x: 0.748, y: 0.682, s: 1, r: -0.33 } },
        { el: "light", w: 0.28, h: 0.05, skew: -1.6, panes: [2, 2], bar: 0.2, soft: 0.3, color: "#FFB868", strength: 0.22, fade: 0.2, name: "Window light on the floor", xf: { x: 1.38, y: 0.862, s: 1, r: 0 } },
      ],
      glow: { x: 1.335, y: 0.775, w: 0.86, h: 0.14 },
      focus: [0.889, 0.5],
    },
    tall: {
      n: 1, A: 9 / 19.5,
      win: [0.066, 0.064, 0.396, 0.388],
      sketchbook: { x: 0.215, y: 0.815, s: 0.7, r: -0.58 },
      pencil: { x: -0.085, y: 0.045, s: 1, r: -0.42 },
      controller: { x: 0.375, y: 0.775, s: 0.7, r: -0.75 },
      laptop: { x: 0.322, y: 0.598, s: 0.66, r: -0.14 },
      guitar: { x: 0.425, y: 0.64, s: 0.6, r: 0.05 },
      ball: null, // no floor left for it in the tall frame
      bird: { y: 0.17, from: -0.25, to: 0.75 },
      sun: [
        { el: "light", w: 0.13, h: 0.06, skew: -0.8, panes: [2, 2], bar: 0.34, soft: 0.14, color: "#FFB868", strength: 0.22, fade: 0.35, name: "Window light on the desk", xf: { x: 0.13, y: 0.83, s: 1, r: -0.62 } },
      ],
      glow: { x: 0.231, y: 0.47, w: 0.42, h: 0.1 },
      focus: [0.231, 0.5],
    },
  };

  function build(opts = {}) {
    const L = LAYOUTS[opts.tall ? "tall" : "wide"];
    const A = L.A, M = 0.06;
    strokeSeed = 1;
    const [wx0, wy0, wx1, wy1] = L.win;
    const wcx = (wx0 + wx1) / 2, wcy = (wy0 + wy1) / 2, ww = wx1 - wx0, wh = wy1 - wy0;
    const view = [wx0 - 0.01, wy0 - 0.01, wx1 + 0.01, wy1 + 0.01];

    // The sketchbook, the drawing on it and the pencil share one layer and one boil, as one object would.
    const sb = L.sketchbook;
    const drawing = { x: 0.098, y: 0.007, s: 0.14, r: 0 };
    const sketchLayer = {
      id: "sketchbook", name: "Sketchbook", depth: 0.36, boil: 0.9, cycle: { frames: 3, rate: 6 },
      groups: { "group-book": { name: "Sketchbook" }, "group-hero": { name: "Kid hero sketch" }, "group-notes": { name: "Notes" }, "group-pencil": { name: "Pencil" } },
      paint: [
        ...grouped(place(sketchbook(), sb), "group-book"),
        ...grouped(place(place(heroSketch(), drawing), sb), "group-hero"),
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
      { id: "window", name: "Window frame", depth: 0.03, boil: 0.5, paint: place(windowFrame(ww, wh), { x: wcx, y: wcy, s: 1, r: 0 }) },
      { id: "guitar", name: "Acoustic guitar", depth: 0.08, boil: 0.8, paint: place(guitar(), L.guitar) },
      L.ball ? { id: "ball", name: "Soccer ball", depth: 0.12, boil: 0.9, paint: place(ball(), L.ball) } : null,

      { id: "desk", name: "Desk", rect: [-M, 0.3, A + M, 1 + M], depth: 0.3, boil: 0.5, paint: [{ shader: "ddesk", n: L.n }] },
      sketchLayer,
      { id: "sunlight", name: "Window light", depth: 0.36, boil: 0.3, paint: L.sun.map((it) => ({ ...it })) },
      { id: "controller", name: "Game controller", depth: 0.38, boil: 0.8, groups: { "group-pad": { name: "Controller" } }, paint: grouped(place(controller(), L.controller), "group-pad") },
      { id: "laptop", name: "Laptop", depth: 0.38, boil: 0.6, groups: { "group-laptop": { name: "Laptop" } }, paint: grouped(place(laptop(), L.laptop), "group-laptop") },
      { id: "screen", name: "Laptop screen", depth: 0.38, boil: 0.4, cycle: { frames: 4, rate: 4 }, groups: { "group-screen": { name: "Pixel level" } },
        paint: grouped(place(place(screen(), { x: 0, y: -0.002, s: 1, r: 0 }), L.laptop), "group-screen") },
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
