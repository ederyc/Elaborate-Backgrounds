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
      // Unscaled and unrotated, the transform is a plain move, so moving the anchor onto "at" is enough.
      const o = anchorOf(entry, item);
      item.xf = { x: at[0] - o[0], y: at[1] - o[1], s: 1, r: 0 };
      return { item };
    }
    const layer = entry.layer(at);
    return { layer };
  }

  LB.LIBRARY = { ENTRIES, CATEGORIES: ["Shapes", "Plants", "Flowers", "Sky", "Your images"], imageEntries, make };
})();
