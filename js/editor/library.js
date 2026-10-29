/*
  The store: ready-made pieces a person can drop into a scene, plus the
  pictures they've imported themselves.

  Each entry says who made it and makes either an item (painted into a
  layer) or a whole layer (swaying flowers, sparkles, a backdrop). Entries
  are built around (0, 0) and placed by moving them, so the same entry
  works anywhere in the frame.

  Credits are honest: the starter pieces are procedural code (the study's
  elements, and the shape element), written by Claude. Nothing here is a
  photo or an AI-generated image. A person's own pictures are marked as theirs.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const A = 16 / 9;
  const STUDY = "Procedural, from the garden study (code by Claude)";
  const SHAPE = "Procedural shape (code by Claude)";
  const CLAY3D = "Procedural 3D sculpt (code by Claude)";

  // ---- 3D sculpts: parts in scene units around the piece's center (x right, y down, z toward you) ----
  const sph = (at, r, color, o = {}) => ({ kind: "sphere", at, r, color, ...o });
  const cap = (at, to, r, r2, color, o = {}) => ({ kind: "capsule", at, to, r, r2, color, ...o });
  const ell = (at, size, color, o = {}) => ({ kind: "ellipsoid", at, size, color, ...o });
  const box3 = (at, size, r, color, o = {}) => ({ kind: "box", at, size, r, color, ...o });
  const SCULPTS = {
    duck: () => ({ el: "clay", material: "plastic", blend: 0.008, yaw: -0.5, pitch: -0.15, shadow: 0.5, parts: [
      ell([0, 0.02, 0], [0.075, 0.048, 0.055], "#F7CE3E"),
      ell([-0.062, -0.004, 0], [0.03, 0.026, 0.03], "#F7CE3E"),
      sph([0.034, -0.052, 0], 0.037, "#F7CE3E"),
      ell([0.074, -0.047, 0], [0.024, 0.009, 0.017], "#F28C28"),
      sph([0.05, -0.066, 0.024], 0.0065, "#1E1A1C"),
      sph([0.05, -0.066, -0.024], 0.0065, "#1E1A1C"),
    ] }),
    mushroom: () => ({ el: "clay", material: "clay", blend: 0.006, pitch: -0.35, shadow: 0.5, dents: 0.6, parts: [
      cap([0, 0.065, 0], [0, -0.02, 0], 0.022, 0.017, "#F7F0E2"),
      ell([0, -0.03, 0], [0.07, 0.034, 0.07], "#D9473F"),
      ell([0, 0.0, 0], [0.058, 0.018, 0.058], "#EFE3C8", { carve: true }),
      sph([0.03, -0.055, 0.03], 0.009, "#FBF5EA"), sph([-0.034, -0.05, 0.028], 0.008, "#FBF5EA"),
      sph([0.0, -0.063, 0.0], 0.01, "#FBF5EA"), sph([0.046, -0.04, -0.022], 0.008, "#FBF5EA"), sph([-0.012, -0.05, 0.052], 0.008, "#FBF5EA"),
    ] }),
    crab: () => {
      const parts = [ell([0, 0, 0], [0.055, 0.024, 0.04], "#E2603F")];
      for (const s of [-1, 1]) {
        parts.push(cap([s * 0.014, -0.016, 0.022], [s * 0.019, -0.042, 0.026], 0.004, 0.0035, "#E2603F"));
        parts.push(sph([s * 0.019, -0.046, 0.026], 0.0075, "#241C1E"));
        parts.push(cap([s * 0.048, -0.004, 0.02], [s * 0.074, -0.02, 0.034], 0.008, 0.009, "#E2603F"));
        parts.push(ell([s * 0.084, -0.026, 0.038], [0.019, 0.013, 0.012], "#E86B47"));
        for (const z of [-0.022, 0.004]) parts.push(cap([s * 0.04, 0.008, z], [s * 0.07, 0.034, z * 1.4], 0.005, 0.0035, "#D4553A"));
      }
      return { el: "clay", material: "clay", blend: 0.006, pitch: -0.55, shadow: 0.55, dents: 0.5, parts };
    },
    pebbles: () => ({ el: "clay", material: "clay", blend: 0.004, pitch: -0.2, shadow: 0.55, dents: 0.9, parts: [
      ell([0, 0.035, 0], [0.06, 0.022, 0.045], "#8F8A92"),
      ell([0.004, -0.004, 0], [0.044, 0.018, 0.035], "#A8A2A8"),
      ell([-0.002, -0.034, 0], [0.03, 0.014, 0.024], "#7D7884"),
    ] }),
    bird: () => ({ el: "clay", material: "felt", blend: 0.012, yaw: -0.35, shadow: 0.5, fuzz: 0.8, parts: [
      sph([0, 0, 0], 0.045, "#4F8FCF"),
      ell([0.006, 0.014, 0.02], [0.03, 0.022, 0.02], "#F2E4C8"),
      ell([-0.016, -0.004, 0.034], [0.028, 0.014, 0.01], "#3C70A8", { }),
      cap([-0.04, -0.01, 0], [-0.07, -0.03, 0], 0.012, 0.004, "#3C70A8"),
      ell([0.047, -0.008, 0], [0.014, 0.006, 0.008], "#F2A53A"),
      sph([0.03, -0.018, 0.03], 0.0055, "#1E1A1C"),
    ] }),
  };
  LB.SCULPTS = SCULPTS;

  const TREE = ["#0B1A1C", "#244A36", "#3F7350", "#73A85A", "#9CCB5C"];
  const HEDGE = ["#0E2020", "#26493A", "#3E6C4E", "#6A9A5E"];
  const BEADS = { scale: 125, density: 0.26, colors: ["#F5F2CC", "#FAF8F0"] };

  const shape = (o) => ({ el: "shape", rough: 0.5, fuzz: 0.3, puff: 0.3, shadow: 0.4, grain: 1, ...o });
  const lobes = (list) => list.map(([x, y, r]) => [x, y, r]);

  const sprite = (flower, colors, o = {}) => (at) => ({
    type: "sprite", flower, colors,
    a: [at[0] + 0.01, at[1] + 0.13], b: [at[0] - 0.005, at[1] + 0.03], c: [at[0] - 0.012, at[1] - 0.06],
    size: 0.036, tilt: 0.2, depth: 0.85, boil: 1.6,
    anim: { type: "sway", amp: 0.045, phase: Math.round(Math.random() * 60) / 10 }, ...o,
  });

  const ENTRIES = [
    // ---- shapes ----
    { id: "paper-rect", cat: "Shapes", name: "Paper card", credit: SHAPE,
      item: () => shape({ shape: "rect", w: 0.36, h: 0.24, corner: 0.12, material: "paper", colors: ["#E8B7C6", "#F6E2E8"], puff: 0.15 }) },
    { id: "felt-circle", cat: "Shapes", name: "Felt circle", credit: SHAPE,
      item: () => shape({ shape: "ellipse", w: 0.2, h: 0.2, material: "felt", colors: ["#C85A6E", "#F0A0A8"], puff: 0.6, fuzz: 0.9 }) },
    { id: "clay-pebble", cat: "Shapes", name: "Clay pebble", credit: SHAPE,
      item: () => shape({ shape: "ellipse", w: 0.26, h: 0.15, material: "clay", colors: ["#8E7FA6", "#C9BEDC"], puff: 0.9, rough: 0.7, shadow: 0.6 }) },
    { id: "paper-hill", cat: "Shapes", name: "Paper hill", credit: SHAPE,
      item: () => shape({ shape: "ellipse", w: 1.3, h: 0.46, material: "paper", colors: ["#7E62B0", "#A890D8"], puff: 0.35, shadow: 0.3,
        specks: { scale: 160, density: 0.12, size: 0.3, colors: ["#F2E6FF", "#F7D9EC"] } }) },
    { id: "paper-mountain", cat: "Shapes", name: "Paper mountain", credit: SHAPE,
      item: () => shape({ shape: "polygon", sides: 3, star: 0, w: 0.6, h: 0.42, material: "paper", colors: ["#5E7FA8", "#9DB6D6"], puff: 0.2 }) },
    { id: "felt-star", cat: "Shapes", name: "Felt star", credit: SHAPE,
      item: () => shape({ shape: "polygon", sides: 5, star: 0.6, w: 0.14, h: 0.14, material: "felt", colors: ["#F2C94C", "#FFE9A8"], puff: 0.7, fuzz: 0.8 }) },
    { id: "cotton-cloud", cat: "Shapes", name: "Cotton cloud", credit: SHAPE,
      item: () => shape({ shape: "blob", material: "felt", colors: ["#F7F1FA", "#FFFFFF"], puff: 0.55, fuzz: 1, shadow: 0.15, rough: 0.6,
        lobes: lobes([[-0.13, 0.02, 0.07], [-0.04, -0.03, 0.09], [0.07, -0.02, 0.08], [0.15, 0.02, 0.06], [0.01, 0.03, 0.07]]) }) },
    { id: "felt-bush", cat: "Shapes", name: "Foliage bush", credit: SHAPE,
      item: () => shape({ shape: "blob", material: "foliage", colors: ["#3E6C4E", "#9CCB5C"], puff: 0.5, fuzz: 0.6, shadow: 0.35,
        lobes: lobes([[-0.08, 0.02, 0.07], [0, -0.03, 0.085], [0.08, 0.01, 0.07], [0.0, 0.04, 0.07]]), specks: BEADS }) },
    { id: "gradient-backdrop", cat: "Shapes", name: "Painted backdrop", credit: SHAPE, layer: () => ({
      name: "Backdrop", depth: 0, far: true, boil: 0.4, res: 0.5,
      paint: [shape({ shape: "rect", w: 2.2, h: 1.4, corner: 0, material: "gradient", colors: ["#B9D3EE", "#E6C3E4"], rough: 0, fuzz: 0, puff: 0, shadow: 0, xf: { x: A / 2, y: 0.5, s: 1, r: 0 } })],
    }), fixed: true },

    // ---- plants (the study's elements) ----
    { id: "tree-canopy", cat: "Plants", name: "Tree canopy", credit: STUDY,
      item: () => ({ el: "canopy", colors: TREE, scale: 55, lobes: lobes([[-0.12, 0.02, 0.1], [0.0, -0.05, 0.12], [0.13, 0.0, 0.1], [0.04, 0.07, 0.08], [-0.07, 0.08, 0.07]]) }) },
    { id: "hedge", cat: "Plants", name: "Hedge with beads", credit: STUDY,
      item: () => ({ el: "canopy", colors: HEDGE, scale: 70, specks: BEADS, lobes: lobes([[-0.09, 0.01, 0.06], [0.0, -0.02, 0.07], [0.09, 0.01, 0.06], [0.03, 0.04, 0.05]]) }) },
    { id: "hydrangea", cat: "Plants", name: "Hydrangea cluster", credit: STUDY,
      item: () => ({ el: "florets", colors: ["#9A80D6", "#C7B2F0", "#3E3266"], scale: 150, lobes: lobes([[-0.03, 0, 0.03], [0.01, -0.02, 0.032], [0.04, 0.01, 0.03], [0, 0.03, 0.026]]) }) },
    { id: "trunk", cat: "Plants", name: "Tree trunk", credit: STUDY,
      item: () => ({ el: "trunk", x: 0, bend: 0.01, width: 0.03, flare: 0.035, top: -0.3, bottom: 0.3, color: "#3E3A4C" }) },
    { id: "branch", cat: "Plants", name: "Branch", credit: STUDY,
      item: () => ({ el: "branch", a: [-0.08, 0.05], b: [0.08, -0.06], r: 0.012, color: "#3E3A4C" }) },
    { id: "grass-bank", cat: "Plants", name: "Grass bank", credit: STUDY, anchor: "line",
      item: () => ({ el: "turf", points: [[-0.45, 0.05], [-0.22, 0.0], [0.0, -0.03], [0.22, 0.0], [0.45, 0.06]], colors: ["#64A35E", "#2C5A38"],
        specks: { scale: 140, density: 0.08, colors: ["#F8F2D8", "#F2D97A"] } }) },
    { id: "felt-ball", cat: "Plants", name: "Felt ball", credit: STUDY,
      item: () => ({ el: "fuzz", center: [0, 0], radii: [0.03, 0.025], color: "#5672B8" }) },

    // ---- flowers (each is its own swaying layer) ----
    { id: "daisy", cat: "Flowers", name: "Daisy", credit: STUDY, layer: sprite("daisy", ["#B5163E", "#DE4C66", "#F3E8D0"], { size: 0.03 }) },
    { id: "tulip", cat: "Flowers", name: "Tulip", credit: STUDY, layer: sprite("tulip", ["#D65A4C", "#F4A088", "#FFE0CC"], { size: 0.04, tilt: -0.1 }) },
    { id: "orchid", cat: "Flowers", name: "Orchid", credit: STUDY, layer: sprite("orchid", ["#6A2152", "#9E4A7C", "#DDA8C4"], { size: 0.06, tilt: 0.05 }) },
    { id: "bloom", cat: "Flowers", name: "Open bloom", credit: STUDY, layer: sprite("bloom", ["#D45852", "#F09484", "#FFE2D4"], { size: 0.045, tilt: 0.3 }) },
    { id: "leaf", cat: "Flowers", name: "Leaf", credit: STUDY, layer: sprite(null, ["#2E8F45", "#73D67A", "#B8F0A8"], { size: 0.017, anim: { type: "sway", amp: 0.06, phase: 1, speed: 2 } }) },

    // ---- beach (from the Beach day sample) ----
    { id: "palm", cat: "Beach", name: "Palm tree", credit: "Procedural, from Beach day (code by Claude)", layer: (at) => LB.BEACH.palm(at) },
    { id: "umbrella", cat: "Beach", name: "Beach umbrella", credit: "Procedural, from Beach day (code by Claude)", layer: (at) => LB.BEACH.umbrella(at) },
    { id: "seagull", cat: "Beach", name: "Seagull flying by", credit: "Procedural, from Beach day (code by Claude)", layer: (at) => LB.BEACH.gull(at) },
    { id: "towel", cat: "Beach", name: "Striped towel", credit: SHAPE, item: () => LB.BEACH.towel([0, 0]) },

    // ---- 3D (clay, felt and plastic sculpts) ----
    { id: "clay-duck", cat: "3D", name: "Rubber duck", credit: CLAY3D, item: SCULPTS.duck },
    { id: "clay-mushroom", cat: "3D", name: "Clay mushroom", credit: CLAY3D, item: SCULPTS.mushroom },
    { id: "clay-crab", cat: "3D", name: "Clay crab", credit: CLAY3D, item: SCULPTS.crab },
    { id: "clay-pebbles", cat: "3D", name: "Pebble stack", credit: CLAY3D, item: SCULPTS.pebbles },
    { id: "felt-bird", cat: "3D", name: "Felt bird", credit: CLAY3D, item: SCULPTS.bird },
    { id: "clay-duck-spin", cat: "3D", name: "Spinning duck", credit: CLAY3D, layer: (at) => {
      const it = SCULPTS.duck();
      it.yaw = 0;
      it.xf = { x: at[0], y: at[1], s: 1.4, r: 0 };
      it.poses = Array.from({ length: 12 }, (_, i) => (i ? { yaw: Math.round(((i / 12) * Math.PI * 2) * 1e5) / 1e5 } : {}));
      return { name: "Spinning duck", depth: 0.5, boil: 1.2, cycle: { frames: 12, rate: 6 }, paint: [it] };
    } },

    // ---- sky ----
    { id: "sparkles", cat: "Sky", name: "Sparkles", credit: STUDY, layer: (at) => ({
      type: "sparkles", name: "Sparkles", depth: 0.02, far: true, count: 18, size: 0.0045, color: "#FFF8E6",
      area: [at[0] - 0.45, at[1] - 0.16, at[0] + 0.45, at[1] + 0.16],
    }) },
  ];

  // The user's imported pictures, as store entries.
  function imageEntries(doc) {
    return Object.entries(doc.images).map(([id, img]) => ({
      id: "img:" + id, cat: "Your images", name: img.name, credit: "Your image", image: id,
      item: () => {
        const w = 0.4 * Math.min(1, img.w / img.h);
        return { el: "image", image: id, w, h: (w * img.h) / img.w };
      },
    }));
  }

  // Where an entry's "center" is, before it's moved into place.
  function anchorOf(entry, item) {
    if (entry.anchor === "line") {
      const pts = item.points;
      return [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
    }
    return LB.ITEMS.origin(item, null);
  }

  // Makes the thing an entry adds, centered on "at" (scene units).
  function make(entry, at) {
    if (entry.item) {
      const item = entry.item();
      // A sculpt keeps the store's name; flat shapes name themselves from their material.
      if (item.el === "clay" && !item.name) item.name = entry.name;
      // Unscaled and unrotated, the transform is a plain move, so moving the anchor onto "at" is enough.
      const o = anchorOf(entry, item);
      item.xf = { x: at[0] - o[0], y: at[1] - o[1], s: 1, r: 0 };
      return { item };
    }
    const layer = entry.layer(at);
    return { layer };
  }

  LB.LIBRARY = { ENTRIES, CATEGORIES: ["Shapes", "Plants", "Flowers", "Beach", "3D", "Sky", "Your images"], imageEntries, make };
})();
