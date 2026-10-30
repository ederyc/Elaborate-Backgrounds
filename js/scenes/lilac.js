/*
  Lilac Falls: the project's own scene, and its landing page.

  It keeps the garden study's palette and mood (lilac sky, flowered purple
  hills, deep green beaded foliage, turquoise water, a warm dreamy grade)
  but the layout is new: a stepped clay cliff with a two-tier waterfall on
  the left, a pool that runs out into a stream toward you under a little
  footbridge, one big blossom tree hung with wisteria on the right, felt
  clouds and a paper moon in the sky, butterflies crossing.

  The bespoke pieces (sky, hills, cliff, falls, water) are in
  lilac-art.js. Everything else is the editor's own elements and shapes,
  so the whole scene opens in the editor and every piece can be changed.

  Units are scene units: y 0..1 top to bottom, x 0..16/9.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const A = 16 / 9;
  const M = 0.06;

  const TREE = ["#0B1A1C", "#244A36", "#3F7350", "#73A85A", "#9CCB5C"];
  const HEDGE = ["#0E2020", "#26493A", "#3E6C4E", "#6A9A5E"];
  const DARK = ["#0C1C1F", "#1E3A38", "#2E5650", "#4C7A62"];
  const BLOSSOM = { scale: 120, density: 0.34, size: 0.34, colors: ["#F7C6DA", "#FFE8F2"] };
  const BEADS = { scale: 125, density: 0.26, colors: ["#F5F2CC", "#FAF8F0"] };
  const WISTERIA = ["#B39AE8", "#E2D6FA", "#3E3266"];
  const WISTERIA_DEEP = ["#9A7AD8", "#CDB8F2", "#352A5C"];

  const sprite = (o) => ({ type: "sprite", ...o });
  const leaf = (o) => sprite({ colors: ["#2E8F45", "#73D67A", "#B8F0A8"], ...o });
  const sway = (amp, phase, speed = 1) => ({ type: "sway", amp, phase, speed });
  const r4 = (v) => Math.round(v * 1e4) / 1e4;

  // A hanging wisteria chain: lobes that taper as they hang.
  const drip = (x, y, len = 1, colors = WISTERIA) => ({
    el: "florets", colors, scale: 230, merge: 0.012,
    lobes: [[x, y, 0.020], [x + 0.003, y + 0.03 * len, 0.017], [x - 0.002, y + 0.057 * len, 0.013], [x + 0.002, y + 0.08 * len, 0.009]].map((l) => l.map(r4)),
  });

  // A felt cloud: a blob of round lobes, placed by its transform.
  const cloud = (x, y, k, lobes) => ({
    el: "shape", shape: "blob", material: "felt", colors: ["#E2DAFA", "#FFFFFF"], puff: 0.6, fuzz: 1, shadow: 0.12, rough: 0.6, merge: 0.03,
    lobes: lobes.map(([a, b, r]) => [r4(a * k), r4(b * k), r4(r * k)]), xf: { x, y, s: 1, r: 0 },
  });

  // An arched footbridge: the deck, its rail and posts, and stones at each end.
  function bridge() {
    const x0 = 0.725, x1 = 0.965, base = 0.884, rise = 0.040, n = 10;
    const arc = (off, h) => Array.from({ length: n + 1 }, (_, i) => { const u = i / n; return [r4(x0 + (x1 - x0) * u), r4(base - h * Math.sin(Math.PI * u) + off)]; });
    const deckTop = arc(0, rise), deckBot = arc(0.017, rise * 0.82).reverse();
    const railTop = arc(-0.034, rise), railBot = arc(-0.026, rise).reverse();
    const wood = { material: "cardboard", colors: ["#D9946A", "#B9724C"], puff: 0.45, shadow: 0.45, rough: 0.35, fuzz: 0.2 };
    const rail = { material: "cardboard", colors: ["#E8AE84", "#C47F58"], puff: 0.4, shadow: 0.3, rough: 0.3, fuzz: 0.2 };
    const posts = [0, 0.25, 0.5, 0.75, 1].map((u) => {
      const x = x0 + (x1 - x0) * u, y = base - rise * Math.sin(Math.PI * u);
      return { el: "shape", shape: "rect", w: 0.007, h: 0.036, corner: 0.3, ...rail, xf: { x: r4(x), y: r4(y - 0.017), s: 1, r: 0 } };
    });
    return [
      { el: "shape", shape: "ellipse", w: 0.07, h: 0.03, material: "clay", colors: ["#8E7FA6", "#C9BEDC"], puff: 0.8, shadow: 0.5, rough: 0.7, xf: { x: x0 + 0.005, y: base + 0.012, s: 1, r: 0 } },
      { el: "shape", shape: "ellipse", w: 0.07, h: 0.03, material: "clay", colors: ["#8E7FA6", "#C9BEDC"], puff: 0.8, shadow: 0.5, rough: 0.7, xf: { x: x1 - 0.005, y: base + 0.012, s: 1, r: 0 } },
      { el: "shape", shape: "path", points: [...railTop, ...railBot], smooth: true, ...rail },
      ...posts,
      { el: "shape", shape: "path", points: [...deckTop, ...deckBot], smooth: true, ...wood },
    ];
  }

  // A lily pad (a disc with a notch) and its flower.
  function pad(x, y, w, ang, color = "#4E9A55") {
    const pts = [];
    for (let i = 0; i <= 14; i++) {
      const a = ang + 0.32 + (i / 14) * (Math.PI * 2 - 0.64);
      pts.push([r4(x + Math.cos(a) * w), r4(y + Math.sin(a) * w * 0.34)]);
    }
    pts.push([r4(x), r4(y)]);
    return { el: "shape", shape: "path", points: pts, smooth: true, material: "felt", colors: [color, "#9ACB6A"], puff: 0.5, shadow: 0.35, fuzz: 0.4, rough: 0.4 };
  }

  // A butterfly flapping as it crosses: wings open in two poses, folded in the other two.
  function butterfly(y, colors, k = 1) {
    const [a, b] = colors;
    const open = (dx, dy, w, h, r, col) => ({ el: "shape", shape: "ellipse", w: r4(w * k), h: r4(h * k), material: "felt", colors: [col, "#FFFFFF"], puff: 0.6, fuzz: 0.5, shadow: 0.2,
      xf: { x: r4(dx * k), y: r4(y + dy * k), s: 1, r }, poses: [{}, {}, { hide: true }, { hide: true }] });
    const shut = (dx, dy, w, h, r, col) => ({ el: "shape", shape: "ellipse", w: r4(w * k), h: r4(h * k), material: "felt", colors: [col, "#FFFFFF"], puff: 0.6, fuzz: 0.5, shadow: 0.2,
      xf: { x: r4(dx * k), y: r4(y + dy * k), s: 1, r }, poses: [{ hide: true }, { hide: true }, {}, {}] });
    return [
      open(-0.012, -0.008, 0.026, 0.02, -0.5, a), open(0.012, -0.008, 0.026, 0.02, 0.5, a),
      open(-0.009, 0.007, 0.017, 0.013, 0.5, b), open(0.009, 0.007, 0.017, 0.013, -0.5, b),
      shut(-0.004, -0.009, 0.008, 0.024, -0.15, a), shut(0.004, -0.009, 0.008, 0.024, 0.15, a),
      { el: "shape", shape: "ellipse", w: r4(0.005 * k), h: r4(0.026 * k), material: "felt", colors: ["#3E2E4A", "#5A4868"], puff: 0.5, shadow: 0.2, fuzz: 0.4, xf: { x: 0, y: r4(y), s: 1, r: 0 } },
    ];
  }

  function build() {
    const mush = LB.SCULPTS && LB.SCULPTS.mushroom;
    const mushroom = (x, y, s) => mush ? { ...mush(), name: "Clay mushroom", shadow: 0.5, xf: { x, y, s, r: 0 } } : null;

    const layers = [
      { id: "sky", name: "Sky and moon", rect: [-M, -M, A + M, 0.66], res: 0.5, depth: 0, far: true, boil: 0, paint: [{ shader: "lsky" }] },
      { id: "stars", name: "Twinkles", type: "sparkles", depth: 0.02, far: true, count: 14, area: [0.5, 0.04, 1.4, 0.36], size: 0.004, color: "#FFF6DE" },
      { id: "clouds", name: "Felt clouds", depth: 0.03, far: true, boil: 0.8, anim: { type: "drift", amp: [0.016, 0.002] }, paint: [
        // Kept off the top middle of the sky, where the landing page's title sits.
        cloud(0.17, 0.11, 0.62, [[-0.13, 0.02, 0.06], [-0.05, -0.02, 0.075], [0.05, -0.015, 0.07], [0.14, 0.02, 0.05], [0.0, 0.03, 0.06]]),
        cloud(1.50, 0.07, 1.1, [[-0.12, 0.02, 0.055], [-0.03, -0.025, 0.075], [0.07, -0.01, 0.065], [0.15, 0.025, 0.045]]),
        cloud(1.08, 0.385, 0.62, [[-0.08, 0.01, 0.04], [0.0, -0.015, 0.05], [0.08, 0.01, 0.04]]),
        cloud(0.66, 0.40, 0.5, [[-0.07, 0.01, 0.035], [0.0, -0.012, 0.045], [0.07, 0.01, 0.035]]),
      ] },
      { id: "hills", name: "Flowered hills", rect: [-M, 0.42, A + M, 0.78], depth: 0.08, far: true, haze: 0.16, boil: 0.8, paint: [{ shader: "lhills" }] },

      // The meadow behind the water: low on the left under the cliff, rising gently to the right.
      { id: "meadow", name: "Meadow", rect: [-M, 0.58, A + M, 1 + M], depth: 0.2, haze: 0.04, boil: 1.0, paint: [
        { el: "turf", points: [[-0.08, 0.79], [0.4, 0.785], [0.78, 0.76], [1.0, 0.70], [1.22, 0.665], [1.5, 0.655], [1.86, 0.672]], colors: ["#6CAE62", "#2E5A3A"],
          specks: { scale: 150, density: 0.09, colors: ["#F8F2D8", "#E9A0C4"] } },
        { el: "canopy", lobes: [[0.02, 0.80, 0.05], [0.10, 0.795, 0.045], [0.18, 0.805, 0.04], [0.26, 0.80, 0.03]], colors: HEDGE, scale: 70, specks: BLOSSOM },
        { el: "florets", lobes: [[0.15, 0.835, 0.03], [0.19, 0.85, 0.024]], colors: ["#CDBDF0", "#F0E8FA", "#4A4066"], scale: 180 },
        { el: "canopy", lobes: [[1.04, 0.70, 0.035], [1.10, 0.685, 0.045], [1.17, 0.69, 0.035]], colors: DARK, scale: 80, specks: { scale: 120, density: 0.3, size: 0.34, colors: ["#B81E42", "#E8505E"] } },
        { el: "florets", lobes: [[1.29, 0.665, 0.026], [1.325, 0.672, 0.02]], colors: ["#E8B4D4", "#F6DCEA", "#4A2A44"], scale: 210 },
        { el: "florets", lobes: [[0.50, 0.875, 0.028], [0.535, 0.885, 0.022]], colors: ["#F2DCE6", "#E6A0C0", "#5A3A50"], scale: 210 },
        { el: "florets", lobes: [[0.62, 0.90, 0.026], [0.655, 0.91, 0.02], [0.60, 0.92, 0.018]], colors: ["#B9A2EA", "#DDD0F6", "#3E3266"], scale: 200 },
        { el: "canopy", lobes: [[1.08, 0.88, 0.035], [1.13, 0.87, 0.03]], colors: HEDGE, scale: 80, specks: BEADS },
        { el: "shape", shape: "ellipse", w: 0.03, h: 0.016, material: "clay", colors: ["#8E7FA6", "#C9BEDC"], puff: 0.9, shadow: 0.5, rough: 0.7, xf: { x: 0.70, y: 0.925, s: 1, r: 0.2 } },
        { el: "shape", shape: "ellipse", w: 0.022, h: 0.012, material: "clay", colors: ["#9C8DB2", "#D2C8E2"], puff: 0.9, shadow: 0.5, rough: 0.7, xf: { x: 0.725, y: 0.935, s: 1, r: -0.3 } },
        { el: "shape", shape: "ellipse", w: 0.026, h: 0.014, material: "clay", colors: ["#8E7FA6", "#C9BEDC"], puff: 0.9, shadow: 0.5, rough: 0.7, xf: { x: 1.03, y: 0.905, s: 1, r: 0.1 } },
      ] },
      leaf({ id: "grass-1", name: "Grass", a: [0.58, 0.93], b: [0.575, 0.895], c: [0.585, 0.86], size: 0.009, depth: 0.3, boil: 1.1, anim: sway(0.06, 1.1, 2) }),
      leaf({ id: "grass-2", name: "Grass", a: [1.10, 0.90], b: [1.105, 0.87], c: [1.095, 0.84], size: 0.008, depth: 0.3, boil: 1.1, anim: sway(0.06, 3.7, 2) }),

      { id: "cliff", name: "Clay cliff", rect: [-M, 0.19, 0.92, 1 + M], depth: 0.24, haze: 0.03, boil: 1.0, paint: [
        { shader: "cliff" },
        // Shrubs and flowers along the top of the upper tier.
        { el: "canopy", lobes: [[0.02, 0.29, 0.06], [0.11, 0.275, 0.07], [0.21, 0.285, 0.055], [0.29, 0.296, 0.04]], colors: HEDGE, scale: 70, specks: BLOSSOM },
        { el: "florets", lobes: [[0.24, 0.27, 0.026], [0.27, 0.28, 0.02]], colors: ["#CC75B8", "#EBA5D6", "#5A2D4E"], scale: 200 },
        // Wisteria hanging over the upper face.
        drip(0.04, 0.315, 1.2), drip(0.09, 0.31, 0.9, WISTERIA_DEEP), drip(0.14, 0.318, 1.3), drip(0.19, 0.312, 0.8, WISTERIA_DEEP), drip(0.24, 0.316, 1.1), drip(0.30, 0.31, 0.7),
        // Moss and flowers on the lower tier, left of the ledge pool.
        { el: "canopy", lobes: [[0.03, 0.505, 0.05], [0.12, 0.51, 0.045], [0.2, 0.515, 0.03]], colors: HEDGE, scale: 75, specks: BEADS },
        { el: "florets", lobes: [[0.66, 0.515, 0.022], [0.69, 0.522, 0.016]], colors: ["#F2DCE6", "#E6A0C0", "#5A3A50"], scale: 220 },
        drip(0.61, 0.53, 0.8), drip(0.665, 0.535, 0.6, WISTERIA_DEEP),
        // Ferny clumps and flowers at the foot of the cliff, on the pool's left.
        { el: "canopy", lobes: [[0.30, 0.79, 0.04], [0.36, 0.775, 0.035], [0.25, 0.80, 0.03]], colors: HEDGE, scale: 80, specks: BLOSSOM },
        { el: "florets", lobes: [[0.05, 0.70, 0.03], [0.085, 0.715, 0.024], [0.03, 0.73, 0.022]], colors: ["#E8B4D4", "#F6DCEA", "#4A2A44"], scale: 210 },
        { el: "canopy", lobes: [[0.12, 0.62, 0.035], [0.17, 0.63, 0.028]], colors: DARK, scale: 85, specks: { scale: 120, density: 0.3, size: 0.34, colors: ["#B81E42", "#E8505E"] } },
      ] },

      { id: "pool", name: "Pool and stream", rect: [0.30, 0.72, 1.20, 1 + M], depth: 0.28, boil: 0.8, anim: { type: "cycle", frames: 6, rate: 6 }, paint: [
        { shader: "water", n: 1 },
      ] },
      { id: "falls", name: "Waterfalls", rect: [0.24, 0.27, 0.74, 0.83], depth: 0.25, haze: 0.02, boil: 0.7, anim: { type: "cycle", frames: 6, rate: 6 }, paint: [
        { shader: "water", n: 0 }, { shader: "fall", n: 0 }, { shader: "fall", n: 1 },
      ] },
      { id: "fireflies", name: "Fireflies", type: "sparkles", depth: 0.3, count: 16, area: [0.25, 0.48, 1.25, 0.86], size: 0.0035, color: "#FFE9A8" },

      // The far bank: hedges, hydrangeas, a felt ball and two clay mushrooms.
      { id: "bank", name: "Far bank", rect: [0.9, 0.55, A + M, 1 + M], depth: 0.34, haze: 0.02, boil: 1.2, paint: [
        { el: "canopy", lobes: [[1.13, 0.75, 0.05], [1.22, 0.73, 0.06], [1.31, 0.75, 0.045]], colors: HEDGE, scale: 70, specks: BEADS },
        { el: "florets", lobes: [[1.06, 0.775, 0.03], [1.095, 0.79, 0.024], [1.04, 0.80, 0.02]], colors: ["#9A80D6", "#C7B2F0", "#3E3266"], scale: 170 },
        { el: "florets", lobes: [[1.40, 0.735, 0.028], [1.435, 0.745, 0.022]], colors: ["#E07A8E", "#F6B0B8", "#4C1A2A"], scale: 190 },
        { el: "fuzz", center: [1.245, 0.80], radii: [0.022, 0.018], color: "#5672B8" },
        mushroom(1.31, 0.805, 0.95), mushroom(1.36, 0.818, 0.62),
      ].filter(Boolean) },
      { id: "bridge", name: "Footbridge", depth: 0.42, boil: 1.3, paint: bridge() },
      { id: "lilies", name: "Lily pads", depth: 0.5, boil: 1.3, paint: [
        pad(0.95, 0.965, 0.034, 0.4), pad(1.01, 1.0, 0.028, 2.1, "#3F8A4E"), pad(0.905, 1.01, 0.024, 4.2, "#5AA45E"),
      ] },
      sprite({ id: "lotus", name: "Water lily", flower: "bloom", a: [0.952, 0.968], b: [0.952, 0.962], c: [0.952, 0.952], size: 0.018, tilt: 0.0,
               colors: ["#E07AA8", "#F6B6D2", "#FFF2F6"], depth: 0.5, boil: 1.3, anim: sway(0.03, 2.0) }),

      { id: "tree", name: "Blossom tree", rect: [1.18, -M, A + M, 1 + M], depth: 0.55, boil: 1.4, paint: [
        { el: "branch", a: [1.59, 0.42], b: [1.47, 0.27], r: 0.012, color: "#4A3F5C" },
        { el: "trunk", x: 1.62, bend: 0.012, width: 0.05, flare: 0.05, top: 0.16, bottom: 1.06, color: "#4A3F5C" },
        { el: "canopy", lobes: [[1.44, 0.085, 0.08], [1.53, 0.045, 0.12], [1.66, 0.03, 0.14], [1.80, 0.10, 0.13], [1.49, 0.19, 0.065], [1.59, 0.20, 0.10], [1.73, 0.24, 0.10]],
          colors: TREE, scale: 55, specks: BLOSSOM },
        drip(1.43, 0.215, 1.1, WISTERIA_DEEP), drip(1.50, 0.26, 1.1), drip(1.56, 0.285, 0.9, WISTERIA_DEEP), drip(1.65, 0.31, 1.2), drip(1.72, 0.32, 0.8, WISTERIA_DEEP), drip(1.79, 0.31, 1.0),
      ] },

      { id: "butterfly-1", name: "Peach butterfly", depth: 0.45, boil: 1.2, cycle: { frames: 4, rate: 8 },
        anim: { type: "travel", from: [-0.25, 0], to: [2.05, -0.06], speed: 1, phase: 0.2, bob: 0.02, bobs: 4 }, paint: butterfly(0.46, ["#F4A47E", "#FFD9B8"]) },
      { id: "butterfly-2", name: "Lilac butterfly", depth: 0.6, boil: 1.3, cycle: { frames: 4, rate: 8 },
        anim: { type: "travel", from: [2.05, 0], to: [-0.25, 0.04], speed: 1, phase: 0.65, bob: 0.025, bobs: 3 }, paint: butterfly(0.62, ["#B58AE6", "#E8D8FF"], 1.2) },

      // The beds in front: the near bank on either side of the stream.
      { id: "beds", name: "Flower beds", rect: [-M, 0.7, A + M, 1 + M], depth: 0.8, boil: 1.5, paint: [
        { el: "turf", points: [[-0.08, 0.955], [0.3, 0.945], [0.62, 0.95], [0.80, 0.985], [0.86, 1.08]], colors: ["#64A35E", "#2C5A38"], fade: 0.05 },
        { el: "turf", points: [[1.06, 1.08], [1.10, 0.975], [1.3, 0.95], [1.6, 0.94], [1.86, 0.945]], colors: ["#64A35E", "#2C5A38"], fade: 0.05 },
        { el: "canopy", lobes: [[0.04, 0.93, 0.07], [0.14, 0.95, 0.06], [-0.02, 0.86, 0.06]], colors: HEDGE, scale: 70, specks: { scale: 120, density: 0.25, colors: ["#F7F2DA", "#F2DE8A"] } },
        { el: "florets", lobes: [[0.22, 0.90, 0.04], [0.26, 0.925, 0.03], [0.19, 0.935, 0.03]], colors: ["#CDBDF0", "#F0E8FA", "#4A4066"], scale: 170 },
        { el: "florets", lobes: [[0.62, 0.925, 0.03], [0.66, 0.94, 0.024]], colors: ["#CC75B8", "#EBA5D6", "#5A2D4E"], scale: 190 },
        { el: "canopy", lobes: [[1.60, 0.93, 0.06], [1.72, 0.90, 0.07], [1.83, 0.93, 0.07], [1.50, 0.97, 0.05]], colors: HEDGE, scale: 70, specks: BLOSSOM },
        { el: "florets", lobes: [[1.25, 0.935, 0.03], [1.29, 0.95, 0.025]], colors: ["#9A2E70", "#C2559A", "#3A0E2A"], scale: 170 },
        { el: "florets", lobes: [[1.42, 0.945, 0.024]], colors: ["#F2DCE6", "#E6A0C0", "#5A3A50"], scale: 210 },
      ] },
      sprite({ id: "tulip-1", name: "Coral tulip", flower: "tulip", a: [0.36, 1.03], b: [0.35, 0.90], c: [0.34, 0.80], size: 0.036, tilt: -0.1,
               colors: ["#D65A4C", "#F4A088", "#FFE0CC"], depth: 0.85, boil: 1.6, anim: sway(0.05, 1.7) }),
      sprite({ id: "tulip-2", name: "Coral tulip", flower: "tulip", a: [0.42, 1.03], b: [0.425, 0.92], c: [0.43, 0.84], size: 0.03, tilt: 0.2,
               colors: ["#E06A50", "#F7B092", "#FFE6D2"], depth: 0.85, boil: 1.6, anim: sway(0.06, 3.1) }),
      sprite({ id: "daisy-1", name: "Magenta daisy", flower: "daisy", a: [0.09, 1.03], b: [0.085, 0.87], c: [0.095, 0.76], size: 0.03, tilt: 0.3,
               colors: ["#B5163E", "#DE4C66", "#F3E8D0"], depth: 0.85, boil: 1.6, anim: sway(0.045, 0.9) }),
      sprite({ id: "bloom-1", name: "White bloom", flower: "bloom", a: [0.52, 1.03], b: [0.51, 0.93], c: [0.515, 0.84], size: 0.04, tilt: 0.4,
               colors: ["#E8C6D6", "#FAEEF2", "#FFFFFF"], depth: 0.85, boil: 1.6, anim: sway(0.04, 4.2) }),
      sprite({ id: "bloom-2", name: "Peach bloom", flower: "bloom", a: [1.22, 1.03], b: [1.23, 0.93], c: [1.245, 0.845], size: 0.042, tilt: -0.3,
               colors: ["#E08A6C", "#F6BFA0", "#FFEBDC"], depth: 0.85, boil: 1.6, anim: sway(0.04, 2.4) }),
      sprite({ id: "orchid-1", name: "Purple orchid", flower: "orchid", a: [1.36, 1.03], b: [1.35, 0.88], c: [1.40, 0.79], size: 0.05, tilt: 0.1,
               colors: ["#7A4AA0", "#A97BC8", "#E2CCF0"], depth: 0.85, boil: 1.6, anim: sway(0.035, 5.0) }),
      leaf({ id: "leaf-1", name: "Leaf", a: [0.30, 1.03], b: [0.285, 0.94], c: [0.295, 0.85], size: 0.016, depth: 0.9, boil: 1.6, anim: sway(0.06, 0.4, 2) }),
      leaf({ id: "leaf-2", name: "Leaf", a: [0.47, 1.03], b: [0.485, 0.94], c: [0.5, 0.86], size: 0.017, depth: 0.9, boil: 1.6, anim: sway(0.06, 2.6, 2) }),
      leaf({ id: "leaf-3", name: "Leaf", a: [1.29, 1.03], b: [1.30, 0.95], c: [1.285, 0.87], size: 0.015, depth: 0.9, boil: 1.6, anim: sway(0.07, 4.4, 2) }),
    ];

    return {
      format: "elaborate-backgrounds/scene", version: 1,
      title: "Lilac Falls",
      note: "The project's own scene, after the feel of a stop-motion backdrop by Tamara. Procedural, written by Claude.",
      art: "lilac",
      aspect: A, focus: [0.56, 0.5],
      background: "#2A1C33", horizon: "#CDB8F5",
      camera: { drift: [0.008, 0.003] },
      fps: 12, boil: 1,
      layers,
      post: {
        depth: { radius: 1.2 },
        bloom: { glow: 0.7, threshold: 0.5, mist: 0.3, radius: 0.85 },
        halation: { amount: 0.4, threshold: 0.55, color: "#FF7340" },
        ca: { amount: 0.0004 },
        vignette: { amount: 0.3, color: "#E0A890" },
        grain: { amount: 0.028, perFrame: false },
      },
      grades: {
        warm: {
          exposure: 0.2, temperature: 0.6, tint: 0.12, contrast: 1.03, saturation: 1.45,
          floor: "#2E1A30", whiteCap: 0.98, redCap: 1.0, shadowTint: "#8A4E7E", highlightTint: "#FFE0B0", split: 0.3,
        },
      },
      grade: "warm",
      images: {},
    };
  }

  LB.scenes = LB.scenes || {};
  LB.scenes.lilac = build;
})();
