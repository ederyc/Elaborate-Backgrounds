/*
  Reef Rave: an octopus party in an underwater cave.

  A laser rig fans its beams across a dark cave, under a red wash from the
  upper right and a blue one from the left. Neon corals glow on the rock. A
  crowd of felt octopuses bounces on the sand at 120 beats a minute, each
  one its own group (a mantle, two eyes and six tentacles that wiggle from
  their roots), and in front stands the star: a clay octopus in white
  sunglasses. Sponges sit up close in the foreground.

  It's seen from inside the party, a little tipsy: the room's lights change
  color every frame, a strobe goes off, partygoers and a string of bulbs
  right by the lens are out of focus, and the camera leans and sees double.

  The cave, the sand, the lasers and the lights are bespoke (reef-art.js);
  everything else is the editor's own pieces, so all of it opens in the editor.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const A = 16 / 9;
  const M = 0.06;
  const r4 = (v) => Math.round(v * 1e4) / 1e4;

  // ---------- corals ----------
  const coral = (lobes, colors, scale = 170) => ({ el: "florets", lobes: lobes.map((l) => l.map(r4)), colors, scale, merge: 0.012 });
  const UV = ["#9A4DFF", "#E2A8FF", "#2A0E52"];
  const UV2 = ["#5D5BFF", "#B8B4FF", "#1A1450"];
  const RED = ["#FF3D3A", "#FFA28A", "#4A0812"];
  const ORANGE = ["#FF6A3A", "#FFC0A0", "#4A1608"];

  // ---------- a felt octopus, as one group: mantle, eyes, six tentacles ----------
  // (x, y) is where the tentacles meet the mantle. The tentacles' outlines start at their roots,
  // so turning one in a pose wiggles it from the root.
  function octopus(x, y, k, body, eye, phase = 0) {
    const shift = (arr) => arr.map((_, i) => arr[(i + phase) % arr.length]);
    const bob = shift([0.004, -0.008, -0.014, -0.006].map((v) => r4(v * k)));
    const squash = shift([0.97, 1.02, 1.04, 1.0]);
    const felt = { material: "felt", colors: body, puff: 0.65, fuzz: 0.6, shadow: 0.35, rough: 0.4 };
    const items = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1) * 2 - 1;
      const ang = Math.PI / 2 - t * 0.8;
      const len = (0.08 + 0.025 * (1 - Math.abs(t))) * k;
      const curl = -t * 0.7 + (i % 2 ? 0.15 : -0.15);
      const pts = [], side = [];
      const steps = 7;
      for (let s = 0; s <= steps; s++) {
        const u = s / steps;
        const a = ang + curl * u * u;
        const cx = Math.cos(a) * len * u + Math.cos(ang) * 0, cy = Math.sin(a) * len * u;
        const w = (0.014 * (1 - u) + 0.0026) * k;
        const nx = -Math.sin(a), ny = Math.cos(a);
        pts.push([r4(cx + nx * w), r4(cy + ny * w)]);
        side.push([r4(cx - nx * w), r4(cy - ny * w)]);
      }
      const sway = shift([0, 1, 0, -1].map((v) => r4(v * 0.13 * (i % 2 ? 1 : -1))));
      items.push({ el: "shape", shape: "path", points: [...pts, ...side.reverse()], smooth: true, ...felt,
        xf: { x: r4(x + t * 0.016 * k), y: r4(y - 0.004 * k), s: 1, r: 0 },
        poses: sway.map((r, f) => ({ r, y: bob[f] })) });
    }
    items.push({ el: "shape", shape: "ellipse", w: r4(0.056 * k), h: r4(0.08 * k), ...felt, puff: 0.8,
      xf: { x: r4(x), y: r4(y - 0.04 * k), s: 1, r: 0 }, poses: squash.map((s, f) => ({ s, y: bob[f] })) });
    for (const sx of [-1, 1]) {
      items.push({ el: "shape", shape: "ellipse", w: r4(0.012 * k), h: r4(0.014 * k), material: "felt", colors: eye, puff: 0.6, shadow: 0.2, fuzz: 0.3,
        xf: { x: r4(x + sx * 0.012 * k), y: r4(y - 0.012 * k), s: 1, r: 0 }, poses: bob.map((y) => ({ y })) });
    }
    return items;
  }
  // The crowd of one layer, each octopus its own group.
  function crowd(list, body, eye) {
    const paint = [], groups = {};
    list.forEach(([x, y, k, phase], i) => {
      const gid = `group-octo${body[0].slice(1, 4)}${i}`;
      groups[gid] = { name: `Dancer ${i + 1}` };
      for (const it of octopus(x, y, k, body, eye, phase)) paint.push({ ...it, group: gid });
    });
    return { paint, groups };
  }

  // ---------- the star: a clay octopus in white sunglasses ----------
  function star() {
    const skin = "#EBB9A6", skin2 = "#D9A08E", white = "#F6F4F0", black = "#16151C";
    const sph = (at, r, color, o = {}) => ({ kind: "sphere", at, r, color, ...o });
    const cap = (at, to, r, r2, color) => ({ kind: "capsule", at, to, r, r2, color });
    const ell = (at, size, color) => ({ kind: "ellipsoid", at, size, color });
    const box = (at, size, r, color) => ({ kind: "box", at, size, r, color });
    const parts = [
      ell([0, -0.075, -0.004], [0.042, 0.066, 0.038], skin),
      ell([0, -0.012, 0.004], [0.04, 0.03, 0.036], skin),
    ];
    // Seven tentacles in two segments each: out from the body, then curling outward at the tips.
    const arms = [[[-0.055, 0.04, 0.0], [-0.085, 0.015, 0.0]], [[-0.03, 0.085, 0.02], [-0.058, 0.115, 0.02]], [[-0.01, 0.1, 0.03], [-0.022, 0.145, 0.035]],
      [[0.01, 0.1, 0.03], [0.026, 0.14, 0.035]], [[0.03, 0.085, 0.02], [0.06, 0.112, 0.02]], [[0.055, 0.04, 0.0], [0.088, 0.02, 0.0]], [[0.0, 0.09, -0.02], [0.004, 0.13, -0.025]]];
    arms.forEach(([mid, tip], i) => {
      const col = i % 2 ? skin : skin2;
      parts.push(cap([mid[0] * 0.2, 0.012, mid[2] * 0.5], mid, 0.012, 0.0075, col));
      parts.push(cap(mid, tip, 0.0075, 0.003, col));
    });
    return {
      el: "clay", name: "The star", material: "clay", blend: 0.012, dents: 0.35, shadow: 0.5, pitch: -0.08,
      parts, xf: { x: 1.24, y: 0.70, s: 1.9, r: 0.03 },
      // Bouncing on the beat.
      poses: BOUNCE.map(([squash, y, r]) => ({ squash, y, r })),
    };
  }
  const BOUNCE = [[0.95, 0.006, 0.03], [1.03, -0.01, -0.03], [1.06, -0.018, 0.0], [1.0, -0.008, 0.04]];
  // White-framed sunglasses, flat and crisp, bouncing with the star's head.
  function sunglasses() {
    const cx = 1.24, cy = 0.662;
    const ride = BOUNCE.map(([, y, r]) => ({ y: r4(y - 0.004), r }));
    const frame = (x) => ({ el: "shape", shape: "rect", w: 0.066, h: 0.04, corner: 0.45, material: "clay", colors: ["#F7F5F0", "#FFFFFF"], puff: 0.6, shadow: 0.35, rough: 0.15, xf: { x, y: cy, s: 1, r: 0 }, poses: ride });
    const lens = (x) => ({ el: "shape", shape: "rect", w: 0.05, h: 0.027, corner: 0.5, material: "paper", colors: ["#121118", "#2A2838"], puff: 0.4, shadow: 0, rough: 0.1, xf: { x, y: cy + 0.001, s: 1, r: 0 }, poses: ride });
    const glint = (x) => ({ el: "shape", shape: "ellipse", w: 0.012, h: 0.005, material: "paper", colors: ["#FFFFFF", "#FFFFFF"], puff: 0, shadow: 0, rough: 0.1, xf: { x: x - 0.012, y: cy - 0.006, s: 1, r: -0.3 }, poses: ride });
    return [frame(cx - 0.038), frame(cx + 0.038), { el: "shape", shape: "rect", w: 0.02, h: 0.008, corner: 0.5, material: "clay", colors: ["#F7F5F0", "#FFFFFF"], puff: 0.5, shadow: 0.2, xf: { x: cx, y: cy - 0.008, s: 1, r: 0 }, poses: ride },
      lens(cx - 0.038), lens(cx + 0.038), glint(cx - 0.038), glint(cx + 0.038)];
  }

  // ---------- up close: a partygoer's arm, raising a red cup ----------
  // The arm turns from its root, so the cup is carried around the root with it.
  function cheers() {
    const root = [1.86, 1.14], tip = [1.55, 0.6];
    const pts = [], side = [];
    for (let s = 0; s <= 8; s++) {
      const u = s / 8;
      const cx = (1 - u) * (1 - u) * 0 + 2 * u * (1 - u) * -0.13 + u * u * (tip[0] - root[0]);
      const cy = 2 * u * (1 - u) * -0.32 + u * u * (tip[1] - root[1]);
      const tx = 2 * (1 - u) * -0.13 + 2 * u * (tip[0] - root[0] + 0.13), ty = 2 * (1 - u) * -0.32 + 2 * u * (tip[1] - root[1] + 0.32);
      const l = Math.hypot(tx, ty), nx = -ty / l, ny = tx / l;
      const w = 0.06 * (1 - u) + 0.026;
      pts.push([r4(cx + nx * w), r4(cy + ny * w)]);
      side.push([r4(cx - nx * w), r4(cy - ny * w)]);
    }
    const lift = [[0, 0], [-0.018, -0.05], [-0.03, -0.03], [-0.012, 0.03]];
    const carry = (at) => lift.map(([y, r]) => {
      const dx = at[0] - root[0], dy = at[1] - root[1];
      return { x: r4(Math.cos(r) * dx - Math.sin(r) * dy - dx), y: r4(Math.sin(r) * dx + Math.cos(r) * dy - dy + y), r };
    });
    const felt = { material: "felt", colors: ["#8A4E9E", "#E08AD0"], puff: 0.7, fuzz: 0.6, shadow: 0.2, rough: 0.4 };
    const cup = [1.545, 0.53];
    return [
      { el: "shape", shape: "path", name: "Arm", points: [...pts, ...side.reverse()], smooth: true, ...felt, xf: { x: root[0], y: root[1], s: 1, r: 0 }, poses: lift.map(([y, r]) => ({ y, r })) },
      { el: "shape", shape: "path", name: "Red cup", points: [[-0.072, -0.085], [0.072, -0.085], [0.052, 0.085], [-0.052, 0.085]], material: "clay", colors: ["#E8202E", "#FF8A80"], puff: 0.5, shadow: 0.2, rough: 0.2,
        xf: { x: cup[0], y: cup[1], s: 1, r: 0 }, poses: carry(cup) },
      { el: "shape", shape: "rect", name: "Cup rim", w: 0.15, h: 0.016, corner: 0.5, material: "clay", colors: ["#F4F0EA", "#FFFFFF"], puff: 0.4, shadow: 0,
        xf: { x: cup[0], y: r4(cup[1] - 0.088), s: 1, r: 0 }, poses: carry([cup[0], cup[1] - 0.088]) },
      // The tip wraps twice round the cup.
      ...[[0.035, -0.12], [0.068, 0.1]].map(([dy, r], i) => ({ el: "shape", shape: "rect", name: `Arm, wrapped round the cup ${i + 1}`, w: 0.16, h: 0.026, corner: 0.5, ...felt,
        xf: { x: cup[0], y: r4(cup[1] + dy), s: 1, r }, poses: carry([cup[0], cup[1] + dy]).map((p) => ({ ...p })) })),
    ];
  }

  // A soft sponge, up close.
  const sponge = (x, y, lobes, colors, k = 1) => ({
    el: "shape", shape: "blob", material: "felt", colors, puff: 0.7, fuzz: 0.8, shadow: 0.3, rough: 0.6, merge: 0.03,
    lobes: lobes.map(([a, b, r]) => [r4(a * k), r4(b * k), r4(r * k)]), xf: { x, y, s: 1, r: 0 },
    specks: { scale: 150, density: 0.35, size: 0.35, colors: [colors[0], "#2A1A22"] },
  });

  function build() {
    const back = crowd([[0.30, 0.66, 0.85, 1], [0.44, 0.64, 0.8, 3], [0.57, 0.655, 0.78, 0], [0.70, 0.64, 0.75, 2], [0.86, 0.645, 0.78, 1],
      [1.0, 0.655, 0.8, 3], [1.46, 0.65, 0.82, 0], [1.58, 0.66, 0.85, 2]], ["#46506A", "#7A86A2"], ["#0E111C", "#22283A"]);
    const far = crowd([[0.22, 0.628, 0.5, 2], [0.36, 0.624, 0.48, 0], [0.5, 0.63, 0.5, 3], [0.64, 0.622, 0.46, 1], [0.78, 0.628, 0.5, 0],
      [0.93, 0.624, 0.48, 2], [1.1, 0.63, 0.5, 1], [1.34, 0.626, 0.5, 3], [1.66, 0.63, 0.5, 0]], ["#343C58", "#5A6688"], ["#0A0C16", "#1A1E2C"]);
    const close = crowd([[0.1, 1.07, 4.4, 1], [0.98, 1.2, 4.2, 3]], ["#5A3C80", "#C070C8"], ["#0A0812", "#1A1424"]);
    const front = crowd([[0.17, 0.80, 1.25, 2], [0.38, 0.77, 1.15, 0], [0.62, 0.78, 1.2, 3], [0.88, 0.77, 1.12, 1], [1.06, 0.79, 1.18, 2], [1.52, 0.80, 1.3, 3]],
      ["#6C6280", "#A496B8"], ["#100E1A", "#262034"]);

    const layers = [
      { id: "cave", name: "Cave and water", rect: [-M, -M, A + M, 1 + M], res: 0.5, depth: 0, far: true, boil: 0.5, paint: [{ shader: "rcave" }] },
      { id: "corals-far", name: "Glowing corals", rect: [-M, -M, A + M, 0.7], depth: 0.06, far: true, boil: 1.0, paint: [
        coral([[0.28, 0.10, 0.04], [0.32, 0.12, 0.035], [0.25, 0.135, 0.03], [0.30, 0.155, 0.025]], UV),
        coral([[0.13, 0.34, 0.03], [0.16, 0.36, 0.025], [0.12, 0.37, 0.02]], RED, 190),
        coral([[0.20, 0.48, 0.032], [0.24, 0.50, 0.03], [0.18, 0.515, 0.024], [0.22, 0.53, 0.02]], UV2),
        coral([[0.31, 0.44, 0.014], [0.33, 0.45, 0.012]], RED, 220),
        coral([[0.96, 0.36, 0.03], [1.0, 0.38, 0.03], [0.97, 0.40, 0.024], [1.02, 0.41, 0.02]], RED),
        coral([[1.13, 0.24, 0.035], [1.18, 0.25, 0.04], [1.22, 0.235, 0.03], [1.16, 0.28, 0.03]], ORANGE),
        coral([[1.70, 0.44, 0.03], [1.73, 0.46, 0.026]], RED),
        coral([[1.62, 0.16, 0.03], [1.66, 0.18, 0.025]], UV2, 190),
      ] },
      { id: "lasers", name: "Laser rig", rect: [-M, -M, A + M, 0.78], depth: 0.1, boil: 0.4, anim: { type: "cycle", frames: 6, rate: 12 }, paint: [{ shader: "lasers" }] },
      { id: "sand", name: "Sea floor", rect: [-M, 0.55, A + M, 1 + M], depth: 0.25, boil: 0.8, paint: [{ shader: "rsand" }] },
      { id: "bubbles", name: "Bubbles", type: "sparkles", depth: 0.3, count: 26, area: [0.2, 0.12, 1.6, 0.62], size: 0.0032, color: "#BFE6FF" },
      { id: "crowd-far", name: "The crowd, far off", depth: 0.3, haze: 0.22, boil: 0.9, cycle: { frames: 4, rate: 8 }, ...far },
      { id: "crowd-back", name: "The crowd, at the back", depth: 0.34, haze: 0.12, boil: 1.1, cycle: { frames: 4, rate: 8 }, ...back },
      { id: "crowd-front", name: "The crowd, in front", depth: 0.46, haze: 0.03, boil: 1.3, cycle: { frames: 4, rate: 8 }, ...front },
      { id: "star", name: "The star", depth: 0.6, boil: 1.4, cycle: { frames: 4, rate: 8 }, groups: { "group-star": { name: "The star, in sunglasses" } },
        paint: [star(), ...sunglasses()].map((it) => ({ ...it, group: "group-star" })) },
      { id: "confetti", name: "Glitter", type: "sparkles", depth: 0.7, count: 46, area: [0.0, 0.05, 1.78, 0.95], size: 0.0042, color: "#FFB8E8" },
      { id: "party-lights", name: "Party lights", rect: [-M, -M, A + M, 1 + M], res: 0.5, depth: 0.62, boil: 0.3, anim: { type: "cycle", frames: 8, rate: 4 }, paint: [{ shader: "party" }] },
      { id: "sponges", name: "Sponges up close", depth: 0.92, near: true, boil: 1.6, paint: [
        sponge(0.78, 1.04, [[-0.16, 0.02, 0.09], [-0.05, -0.03, 0.11], [0.08, -0.02, 0.1], [0.18, 0.03, 0.08]], ["#7A5048", "#A0706A"]),
        sponge(1.70, 0.98, [[-0.06, 0.0, 0.1], [0.05, -0.06, 0.09], [0.1, 0.04, 0.1]], ["#A8705E", "#D49A86"]),
        sponge(-0.02, 0.86, [[0.0, 0.0, 0.07], [0.04, 0.08, 0.08], [-0.02, 0.15, 0.09]], ["#9A5470", "#C67C98"]),
      ] },
      { id: "up-close", name: "Partygoers up close", depth: 0.95, near: true, boil: 1.6, cycle: { frames: 4, rate: 8 },
        groups: { ...close.groups, "group-cheers": { name: "A red cup, raised" } },
        paint: [...close.paint, ...cheers().map((it) => ({ ...it, group: "group-cheers" }))] },
      { id: "bulbs", name: "String lights, by the lens", rect: [-M, -M, A + M, 0.4], res: 0.5, depth: 1.0, near: true, boil: 0.5, anim: { type: "cycle", frames: 4, rate: 4 }, paint: [{ shader: "bulbs" }] },
    ];

    return {
      format: "elaborate-backgrounds/scene", version: 1,
      title: "Reef Rave",
      note: "A sample scene by Eder Yepez Cuevas: an octopus party in an underwater cave. Procedural: every piece is drawn by code.",
      art: "reef",
      aspect: A, focus: [1.0, 0.5],
      background: "#05060F", horizon: "#1A2A5A",
      camera: { drift: [0.02, 0.008] },
      fps: 12, boil: 1,
      layers,
      post: {
        depth: { radius: 1.6, near: 13 },
        bloom: { glow: 1.35, threshold: 0.36, mist: 0.1, radius: 0.9 },
        halation: { amount: 0.6, threshold: 0.5, color: "#FF3A6A" },
        ca: { amount: 0.0016 },
        vignette: { amount: 0.55, color: "#05061A" },
        grain: { amount: 0.045, perFrame: false },
        sway: { amount: 0.55, ghost: 0.35, edges: 0.55 },
      },
      grades: {
        neon: {
          exposure: -0.12, temperature: -0.1, tint: 0.08, contrast: 1.32, saturation: 1.45,
          floor: "#020309", whiteCap: 0.99, redCap: 1.0, shadowTint: "#0E1638", highlightTint: "#FFD6E6", split: 0.22,
        },
      },
      grade: "neon",
      images: {},
    };
  }

  LB.scenes = LB.scenes || {};
  LB.scenes.reef = build;
})();
