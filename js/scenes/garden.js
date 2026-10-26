/*
  The garden study, as data: which layers exist, what paints them, how
  deep they are, how they move and how the frame is graded. The renderer
  knows nothing about gardens; everything specific to this scene is here or
  in garden-art.js. (Phase 4 turns this into a JSON scene file.)

  Units are scene units: y 0..1 top to bottom, x 0..16/9.
  depth: 0 is the sky, 1 would touch the lens. Drives parallax.
  far: drawn before the depth-softness pass, so it can be blurred.
  haze: how far the layer is pulled toward the horizon color (aerial perspective).
  boil: per-beat wobble, in screen px at 1080p.
  res: bake resolution relative to the screen (soft layers don't need full).
  paint: drawn in order into the layer's texture. {shader} is bespoke art
         from garden-art.js; {el} is a reusable element from js/elements.js.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const A = 16 / 9;
  const M = 0.06; // overscan so parallax and boil never show an edge

  // Palettes: shadow, mid, light, tip (and optional second tip) for foliage.
  const TREE = ["#0B1A1C", "#244A36", "#3F7350", "#73A85A", "#9CCB5C"];
  const BACK_TREE = ["#26405A", "#3C6278", "#568296", "#7FA6B2"];
  const HEDGE = ["#0E2020", "#26493A", "#3E6C4E", "#6A9A5E"];
  const DARK_HEDGE = ["#0C1C1F", "#1E3A38", "#2E5650", "#4C7A62"];
  const BARK = "#3E3A4C";
  const BEADS = { scale: 125, density: 0.26, colors: ["#F5F2CC", "#FAF8F0"] };

  const sprite = (o) => ({ type: "sprite", ...o });
  const leaf = (o) => sprite({ colors: ["#2E8F45", "#73D67A", "#B8F0A8"], ...o });
  const orchid = (o) => sprite({ flower: "orchid", ...o });
  const tulip = (o) => sprite({ flower: "tulip", colors: ["#D65A4C", "#F4A088", "#FFE0CC"], ...o });
  const bloom = (o) => sprite({ flower: "bloom", colors: ["#D45852", "#F09484", "#FFE2D4"], ...o });

  LB.scenes = LB.scenes || {};
  LB.scenes.garden = {
    title: "Garden study",
    art: "garden",
    aspect: A,
    // Where to keep the camera centered when the screen is narrower than 16:9.
    focus: [1.2, 0.5],
    horizon: "#CDB8F5",
    camera: { drift: [0.008, 0.003] }, // scene units of sway at depth 1, over one loop

    layers: [
      { id: "sky", rect: [-M, -M, A + M, 0.75], res: 0.5, depth: 0, far: true, boil: 0, paint: [{ shader: "sky" }] },
      { id: "sparkles", type: "sparkles", depth: 0.02, far: true, count: 18, area: [0.5, 0.04, 1.5, 0.36], size: 0.0045, color: "#FFF8E6" },
      { id: "clouds", rect: [-M, -M, A + M, 0.52], res: 0.5, depth: 0.03, far: true, boil: 0.8, paint: [{ shader: "clouds" }],
        anim: { type: "drift", amp: [0.016, 0.002] } },
      { id: "hills", rect: [-M, 0.40, A + M, 1 + M], depth: 0.08, far: true, haze: 0.18, boil: 0.8, paint: [{ shader: "horizon" }, { shader: "hills", n: 3 }] },
      { id: "back-trees", rect: [0.04, 0.04, 1.66, 0.72], depth: 0.14, far: true, haze: 0.12, boil: 1.0, paint: [
        { el: "trunk", x: 0.40, bend: 0.006, width: 0.014, flare: 0.01, top: 0.16, bottom: 0.66, color: "#6A6190" },
        { el: "trunk", x: 1.495, bend: -0.005, width: 0.012, flare: 0.01, top: 0.18, bottom: 0.56, color: "#6E6594" },
        { el: "trunk", x: 0.125, bend: 0.004, width: 0.012, flare: 0.01, top: 0.20, bottom: 0.70, color: "#625A88" },
        { el: "canopy", lobes: [[0.47, 0.20, 0.08], [0.55, 0.25, 0.06], [0.42, 0.27, 0.06], [0.52, 0.14, 0.06]], colors: BACK_TREE, scale: 50 },
        { el: "canopy", lobes: [[1.50, 0.22, 0.07], [1.44, 0.27, 0.05], [1.56, 0.28, 0.05]], colors: BACK_TREE, scale: 50 },
      ] },

      { id: "plateau", rect: [0.2, 0.48, 1.62, 1.0], depth: 0.2, haze: 0.06, boil: 1.0, paint: [
        { shader: "nearHills" }, { shader: "rock" }, { shader: "mound" }, { shader: "pool" },
      ] },
      { id: "waterfall", rect: [1.04, 0.5, 1.42, 0.93], depth: 0.2, haze: 0.03, boil: 0.8, paint: [{ shader: "waterfall" }],
        anim: { type: "cycle", frames: 6, rate: 12 } },
      orchid({ id: "orchid-right", a: [1.47, 0.53], b: [1.455, 0.45], c: [1.383, 0.398], size: 0.044, tilt: 0.15,
               colors: ["#7A4AA0", "#A97BC8", "#E2CCF0"], depth: 0.3, haze: 0.1, boil: 1.0,
               anim: { type: "sway", amp: 0.035, phase: 0.6 } }),
      leaf({ id: "spike-right", a: [1.47, 0.53], b: [1.485, 0.46], c: [1.432, 0.39], size: 0.0085, depth: 0.3, haze: 0.1, boil: 1.0,
             anim: { type: "sway", amp: 0.04, phase: 1.4 } }),

      { id: "midground", rect: [0.2, 0.40, A + M, 1 + M], depth: 0.35, haze: 0.03, boil: 1.2, paint: [
        { el: "turf", points: [[0.28, 0.70], [0.42, 0.712], [0.56, 0.735], [0.68, 0.775], [0.78, 0.84]], colors: ["#5A9658", "#2C5438"],
          specks: { scale: 150, density: 0.1, colors: ["#F8F2D8", "#E9A0C4"] } },
        { el: "florets", lobes: [[0.655, 0.465, 0.03], [0.69, 0.48, 0.032], [0.725, 0.50, 0.03], [0.635, 0.505, 0.028], [0.70, 0.52, 0.026], [0.66, 0.535, 0.025]],
          merge: 0.03, colors: ["#9A80D6", "#C7B2F0", "#3E3266"], scale: 150 },
        // Flower patches on the mound, so it reads as a garden hill and not a hedge wall.
        { el: "florets", lobes: [[0.86, 0.615, 0.022], [0.885, 0.625, 0.018]], colors: ["#E8B4D4", "#F6DCEA", "#4A2A44"], scale: 210 },
        { el: "florets", lobes: [[1.04, 0.66, 0.026], [1.07, 0.672, 0.02]], colors: ["#B9A2EA", "#DDD0F6", "#3E3266"], scale: 210 },
        { el: "florets", lobes: [[0.95, 0.76, 0.03], [0.985, 0.775, 0.022]], colors: ["#E07A8E", "#F6B0B8", "#4C1A2A"], scale: 200 },
        { el: "florets", lobes: [[1.13, 0.58, 0.018]], colors: ["#F2DCE6", "#E6A0C0", "#5A3A50"], scale: 220 },
        { el: "canopy", lobes: [[0.33, 0.645, 0.055], [0.42, 0.625, 0.065], [0.52, 0.655, 0.055], [0.47, 0.70, 0.05], [0.37, 0.70, 0.045]],
          colors: HEDGE, scale: 70, specks: { scale: 130, density: 0.22, colors: ["#F7F4E6", "#F2DE8A"] } },
        { el: "canopy", lobes: [[1.40, 0.62, 0.045], [1.48, 0.595, 0.055], [1.565, 0.615, 0.05], [1.62, 0.66, 0.045]],
          colors: DARK_HEDGE, scale: 75, specks: { scale: 110, density: 0.35, size: 0.36, colors: ["#B81E42", "#E8505E"] } },
        { el: "turf", points: [[1.13, 1.02], [1.28, 0.93], [1.43, 0.83], [1.56, 0.755], [1.68, 0.725], [1.86, 0.72]],
          colors: ["#6CB060", "#3A6E44"], specks: { scale: 140, density: 0.08, colors: ["#F8F2D8", "#F2D97A"] } },
        { el: "fuzz", center: [1.475, 0.79], radii: [0.026, 0.021], color: "#5672B8" },
        { el: "canopy", lobes: [[1.55, 0.745, 0.075], [1.665, 0.70, 0.085], [1.72, 0.85, 0.10], [1.60, 0.885, 0.085], [1.50, 0.95, 0.07]],
          colors: HEDGE, scale: 65, specks: BEADS },
      ] },
      leaf({ id: "leaf-left", a: [0.36, 0.64], b: [0.375, 0.56], c: [0.335, 0.485], size: 0.017, depth: 0.42, boil: 1.2,
             anim: { type: "sway", amp: 0.05, phase: 2.1 } }),
      orchid({ id: "orchid-left", a: [0.40, 0.80], b: [0.395, 0.60], c: [0.555, 0.48], size: 0.092, tilt: 0.05,
               colors: ["#6A2152", "#9E4A7C", "#DDA8C4"], depth: 0.42, boil: 1.2,
               anim: { type: "sway", amp: 0.03, phase: 0.0 } }),

      { id: "trees-left", rect: [-M, -M, 0.70, 1 + M], depth: 0.6, boil: 1.4, paint: [
        { el: "trunk", x: 0.215, bend: -0.012, width: 0.034, flare: 0.04, top: 0.12, bottom: 0.86, color: BARK },
        { el: "branch", a: [0.225, 0.30], b: [0.31, 0.17], r: 0.013, color: BARK },
        { el: "trunk", x: 0.022, bend: 0.012, width: 0.056, flare: 0.03, top: -0.1, bottom: 1.1, color: "#363244" },
        { el: "canopy", lobes: [[0.02, 0.05, 0.16], [0.17, 0.035, 0.15], [0.32, 0.07, 0.13], [0.44, 0.10, 0.09],
                                [0.09, 0.20, 0.10], [0.25, 0.21, 0.09], [0.37, 0.19, 0.07], [0.53, 0.14, 0.05]], colors: TREE, scale: 55 },
      ] },
      { id: "trees-right", rect: [1.30, -M, A + M, 1 + M], depth: 0.6, boil: 1.4, paint: [
        { el: "trunk", x: 1.725, bend: 0.014, width: 0.062, flare: 0.05, top: 0.18, bottom: 1.1, color: BARK },
        { el: "canopy", lobes: [[1.52, 0.12, 0.10], [1.64, 0.06, 0.14], [1.79, 0.10, 0.14], [1.58, 0.25, 0.085],
                                [1.70, 0.26, 0.10], [1.46, 0.21, 0.06], [1.80, 0.30, 0.08]], colors: TREE, tipBand: [0.08, 0.12], scale: 55 },
      ] },

      { id: "beds", rect: [-M, 0.58, A + M, 1 + M], depth: 0.8, boil: 1.5, paint: [
        { el: "turf", points: [[-0.07, 0.965], [0.4, 0.958], [0.9, 0.972], [1.3, 0.962], [1.85, 0.96]], colors: ["#64A35E", "#2C5A38"], fade: 0.05 },
        { el: "florets", lobes: [[0.135, 0.64, 0.028], [0.155, 0.665, 0.022]], colors: ["#F2DCE6", "#E6A0C0", "#5A3A50"], scale: 210 },
        { el: "florets", lobes: [[0.165, 0.80, 0.045], [0.215, 0.825, 0.035], [0.13, 0.84, 0.035]], colors: ["#CDBDF0", "#F0E8FA", "#4A4066"], scale: 170 },
        { el: "florets", lobes: [[0.29, 0.735, 0.04], [0.265, 0.76, 0.03]], colors: ["#CC75B8", "#EBA5D6", "#5A2D4E"], scale: 190 },
        { el: "canopy", lobes: [[0.19, 0.91, 0.07], [0.29, 0.925, 0.07], [0.37, 0.965, 0.06], [0.24, 1.0, 0.07]],
          colors: HEDGE, scale: 70, specks: { scale: 120, density: 0.25, colors: ["#F7F2DA", "#F2DE8A"] } },
        { el: "florets", lobes: [[0.10, 0.955, 0.065], [0.02, 0.92, 0.06]], colors: ["#9A2E70", "#C2559A", "#3A0E2A"], scale: 160 },
        // The middle, hidden by the host in the reference: low bushes and a few clusters so it isn't empty.
        { el: "canopy", lobes: [[0.72, 0.985, 0.06], [0.84, 1.0, 0.07], [0.98, 0.995, 0.06]], colors: HEDGE, scale: 70, specks: BEADS },
        { el: "florets", lobes: [[0.78, 0.94, 0.028], [0.80, 0.955, 0.022]], colors: ["#F2DCE6", "#E6A0C0", "#5A3A50"], scale: 200 },
        { el: "florets", lobes: [[0.93, 0.95, 0.026]], colors: ["#B9A2EA", "#DDD0F6", "#3E3266"], scale: 200 },
        { el: "canopy", lobes: [[1.64, 1.0, 0.07], [1.79, 0.965, 0.08], [1.52, 1.02, 0.05]], colors: HEDGE, scale: 70, specks: BEADS },
        { el: "florets", lobes: [[1.575, 0.985, 0.024], [1.71, 0.99, 0.026], [1.65, 1.0, 0.018]], colors: ["#C6243F", "#F06A74", "#4C0A1E"], scale: 200 },
      ] },

      sprite({ id: "daisy", flower: "daisy", a: [0.12, 0.99], b: [0.105, 0.82], c: [0.10, 0.705], size: 0.03, tilt: 0.2,
               colors: ["#B5163E", "#DE4C66", "#F3E8D0"], depth: 0.85, boil: 1.6, anim: { type: "sway", amp: 0.045, phase: 0.9 } }),
      sprite({ id: "daisy-2", flower: "daisy", a: [0.075, 0.99], b: [0.065, 0.86], c: [0.058, 0.775], size: 0.024, tilt: 0.7,
               colors: ["#C42048", "#E8687E", "#F6EEDC"], depth: 0.85, boil: 1.6, anim: { type: "sway", amp: 0.05, phase: 2.4 } }),
      bloom({ id: "bloom-white", a: [0.20, 1.03], b: [0.19, 0.90], c: [0.185, 0.78], size: 0.032, tilt: 0.5,
              colors: ["#E8C6D6", "#FAEEF2", "#FFFFFF"], depth: 0.85, boil: 1.6, anim: { type: "sway", amp: 0.045, phase: 3.6 } }),
      tulip({ id: "tulip-1", a: [0.43, 1.03], b: [0.41, 0.88], c: [0.395, 0.772], size: 0.04, tilt: -0.1, depth: 0.85, boil: 1.6,
              anim: { type: "sway", amp: 0.05, phase: 1.7 } }),
      tulip({ id: "tulip-2", a: [0.37, 1.03], b: [0.36, 0.90], c: [0.352, 0.815], size: 0.034, tilt: 0.15, depth: 0.85, boil: 1.6,
              anim: { type: "sway", amp: 0.06, phase: 3.0 } }),
      bloom({ id: "bloom-1", a: [0.56, 1.03], b: [0.55, 0.92], c: [0.556, 0.812], size: 0.048, tilt: 0.3, depth: 0.85, boil: 1.6,
              anim: { type: "sway", amp: 0.04, phase: 4.2 } }),
      bloom({ id: "bloom-2", a: [0.47, 1.03], b: [0.48, 0.93], c: [0.49, 0.862], size: 0.036, tilt: 1.1, depth: 0.85, boil: 1.6,
              anim: { type: "sway", amp: 0.05, phase: 5.0 } }),
      leaf({ id: "leaf-1", a: [0.345, 1.03], b: [0.325, 0.93], c: [0.335, 0.83], size: 0.016, depth: 0.9, boil: 1.6,
             anim: { type: "sway", amp: 0.06, phase: 0.4, speed: 2 } }),
      leaf({ id: "leaf-2", a: [0.425, 1.03], b: [0.44, 0.93], c: [0.458, 0.84], size: 0.018, depth: 0.9, boil: 1.6,
             anim: { type: "sway", amp: 0.06, phase: 2.6, speed: 2 } }),
      leaf({ id: "leaf-3", a: [0.50, 1.03], b: [0.52, 0.96], c: [0.545, 0.885], size: 0.014, depth: 0.9, boil: 1.6,
             anim: { type: "sway", amp: 0.07, phase: 4.4, speed: 2 } }),
    ],

    post: {
      depth: { radius: 1.2 },
      // "glow" lights up the highlights; "mist" is the fuzz: a wide, soft haze over everything, like a Pro-Mist filter.
      bloom: { glow: 0.7, threshold: 0.5, mist: 0.3, radius: 0.85 },
      halation: { amount: 0.4, threshold: 0.55, color: "#FF7340" },
      ca: { amount: 0.0004 },
      vignette: { amount: 0.3, color: "#E0A890" },
      // Per beat by default: a stop-motion frame held for two beats is one photo, so its grain holds too.
      grain: { amount: 0.028, perFrame: false },
    },

    // Two grades. "warm" is the look this study is going for: bright, warm and dreamy.
    // "measured" matches the numbers in docs/RECIPE.md (lifted cool blacks, capped whites, capped red).
    grades: {
      warm: {
        exposure: 0.2, temperature: 0.6, tint: 0.12, contrast: 1.03, saturation: 1.45,
        floor: "#2E1A30", whiteCap: 0.98, redCap: 1.0,
        shadowTint: "#8A4E7E", highlightTint: "#FFE0B0", split: 0.3,
      },
      // Tuned until tools/sample_palette.py, run on a render placed in the reference's framing, read
      // luma p1/p50/p99 = 20/69/207 against the reference's 25/69/207.
      measured: {
        exposure: -0.22, temperature: -0.15, tint: 0.0, contrast: 1.4, saturation: 1.0,
        floor: "#13181D", whiteCap: 1.0, redCap: 0.85,
        shadowTint: "#1C2430", highlightTint: "#FFFFFF", split: 0.1,
        // The reference shows no halation and little haze, so this grade turns those down.
        post: { bloom: { glow: 0.35, mist: 0.14 }, halation: { amount: 0 }, vignette: { amount: 0.12, color: "#888888" } },
      },
    },
    grade: "warm",
  };
})();
