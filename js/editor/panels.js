/*
  The inspector, on the right. Three tabs:

    Piece   the selected piece: a header with its picture, name, layer and
            quick actions, then cards for where it sits, its outline, its
            material (picked from rendered swatches), its handmade feel, and
            whatever else that kind of piece has
    Layer   the selected layer: depth (the card takes the depth's color),
            poses, motion (picked by icon), position
    Look    the recipe for the whole scene: presets shown as small renders
            of your scene, then the beat, the grade and every post pass,
            each with a switch in its card header

  The tab follows the selection: pick a piece and Piece opens, pick a layer
  and Layer opens. Numbers are shown the way people think about them:
  percent of the frame, pixels on a 1080-pixel-tall screen, degrees.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const { h, icon, ICONS, menu, bump, depthColor, prefs } = LB.UI;
  const D = () => LB.DOC;
  const ACT = () => LB.ACT;
  const $ = (s) => document.querySelector(s);
  const A = () => (ED.doc ? ED.doc.aspect : 16 / 9);

  // ---------- how numbers are shown ----------
  const PCT = { min: 0, max: 1, step: 0.01, scale: 100, suffix: "%" };
  const DEG = { deg: true, min: -Math.PI, max: Math.PI, step: Math.PI / 180 };
  const PX = { scale: 1080, suffix: " px" };
  const opts = (pairs) => () => pairs;
  const imageOptions = () => Object.entries(ED.doc.images).map(([id, im]) => [id, im.name]);

  const MATERIALS = [["paper", "Paper"], ["felt", "Felt"], ["clay", "Clay"], ["foliage", "Foliage"], ["cardboard", "Cardboard"], ["stripes", "Stripes"],
    ["gradient", "Wash"], ["water", "Water"], ["sand", "Sand"], ["photo", "Photo"]];
  const MATERIAL_NAME = Object.fromEntries(MATERIALS);
  const OUTLINES = [["rect", "Rectangle", "rect"], ["ellipse", "Ellipse", "ellipse"], ["polygon", "Polygon or star", "star"], ["blob", "Blob of round lobes", "cloud"], ["path", "Your own outline, point by point", "pen"]];

  // ---------- material swatches ----------
  const swatches = new Map();
  function materialThumb(m, item) {
    const colors = [(item.colors && item.colors[0]) || "#E8B7C6", (item.colors && item.colors[1]) || "#FFFFFF"];
    const key = `${m}|${colors.join()}|${m === "photo" ? item.image : ""}`;
    if (swatches.has(key)) return swatches.get(key);
    const it = { el: "shape", shape: "rect", w: 0.3, h: 0.3, corner: 0.22, material: m, colors, rough: 0.35, fuzz: m === "felt" ? 0.5 : 0.15, puff: 0.45, shadow: 0, grain: 1,
      xf: { x: 0.3, y: 0.3, s: 1, r: 0 }, ...(m === "stripes" ? { stripes: { width: 0.04 } } : {}), ...(m === "photo" ? { image: item.image || imageOptions()[0][0], tile: 0.4 } : {}) };
    const p = LB.LAYERS.renderThumb({ id: "thumb", seed: 5, paint: [it] }, 92, 92).then(LB.LAYERS.toURL).catch(() => null);
    swatches.set(key, p);
    return p;
  }

  // ---------- piece fields ----------
  const XF_FIELDS = (L) => [
    { type: "section", id: "place", label: "Place", icon: "fit", color: "var(--sky)" },
    { key: "x", label: "Across", type: "number", half: true, min: -0.6, max: A() + 0.6, step: 0.001, clamp: false, scale: 100 / A(), suffix: "%",
      format: (v) => `${((v / A()) * 100).toFixed(1)}%`, hint: "Drag the label sideways to scrub",
      get: (it) => LB.ITEMS.position(it, L)[0], set: (it, v) => { const t = LB.ITEMS.xfOf(it); it.xf = { ...t, x: t.x + v - LB.ITEMS.position(it, L)[0] }; } },
    { key: "y", label: "Down", type: "number", half: true, min: -0.6, max: 1.6, step: 0.001, clamp: false, scale: 100, suffix: "%",
      format: (v) => `${(v * 100).toFixed(1)}%`,
      get: (it) => LB.ITEMS.position(it, L)[1], set: (it, v) => { const t = LB.ITEMS.xfOf(it); it.xf = { ...t, y: t.y + v - LB.ITEMS.position(it, L)[1] }; } },
    { key: "xf.s", label: "Size", type: "range", min: 0.1, max: 4, step: 0.01, fallback: 1, reset: 1, scale: 100, suffix: "%" },
    { key: "xf.r", label: "Turn", type: "range", fallback: 0, reset: 0, ...DEG },
  ];

  const SPECK_FIELDS = (defaults) => [
    { key: "specks", label: "Beads or tiny flowers", type: "toggle", get: (it) => !!it.specks, set: (it, v) => { if (v) it.specks = it.specks || D().clone(defaults); else delete it.specks; } },
    { key: "specks.colors.0", label: "Bead color", type: "color", when: (it) => !!it.specks },
    { key: "specks.colors.1", label: "Second bead color", type: "color", when: (it) => !!it.specks },
    { key: "specks.density", label: "How many", type: "range", min: 0.02, max: 0.6, step: 0.01, scale: 100, suffix: "%", when: (it) => !!it.specks },
    { key: "specks.scale", label: "Bead size", type: "range", min: 40, max: 300, step: 1, when: (it) => !!it.specks,
      get: (it) => 340 - (it.specks.scale ?? 150), set: (it, v) => (it.specks.scale = 340 - v), format: (v) => Math.round(v) },
  ];
  const BEAD_DEFAULT = { scale: 140, density: 0.2, size: 0.3, colors: ["#F5F2CC", "#FAF8F0"] };

  // Boil photos: one or two more photos of the same object, swapped pose by pose.
  const BOIL_FIELDS = (L, when) => [
    { type: "section", id: "boil-photos", label: "Boil photos", icon: "camera", color: "var(--pink)", collapsed: true, when },
    { type: "note", when, label: "Photograph the same piece two or three times, nudged a millimeter between shots. Swapping them on the beat is real boil, from real material." },
    ...[0, 1].map((i) => ({
      key: `boilImages.${i}`, label: i === 0 ? "Second photo" : "Third photo", type: "select",
      when: (it) => when(it) && (i === 0 || (it.boilImages && it.boilImages.length >= 1)),
      options: () => [["", "None"], ...imageOptions()],
      get: (it) => (it.boilImages && it.boilImages[i]) || "",
      set: (it, v) => {
        const list = (it.boilImages || []).slice();
        list[i] = v;
        const clean = list.filter(Boolean).slice(0, 2);
        if (clean.length) it.boilImages = clean; else delete it.boilImages;
        if (clean.length && !L.cycle) L.cycle = { frames: clean.length + 1, rate: 6 };
      },
    })),
  ];

  function setOutline(it, v) {
    if (v === "path" && !it.points) {
      // Start the outline from the shape it was, so nothing jumps.
      const b = LB.ELEMENTS.shape.outline(it);
      const cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, rx = (b[2] - b[0]) / 2, ry = (b[3] - b[1]) / 2;
      if (it.shape === "ellipse" || it.shape === "blob") {
        it.points = Array.from({ length: 12 }, (_, i) => [cx + rx * Math.cos((i / 12) * Math.PI * 2), cy + ry * Math.sin((i / 12) * Math.PI * 2)]);
        it.smooth = true;
      } else if (it.shape === "polygon") {
        const n = Math.max(3, it.sides || 5), inner = Math.cos(Math.PI / n) * (1 - (it.star || 0) * 0.75);
        it.points = [];
        for (let i = 0; i < n * (it.star ? 2 : 1); i++) {
          const a = -Math.PI / 2 + (i * Math.PI * (it.star ? 1 : 2)) / n, k = it.star && i % 2 ? inner : 1;
          it.points.push([cx + rx * k * Math.cos(a), cy + ry * k * Math.sin(a)]);
        }
      } else it.points = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
    }
    if (v === "blob" && !it.lobes) {
      const w = it.w || 0.3, hh = it.h || 0.2;
      it.lobes = [[-w * 0.25, 0, hh * 0.45], [0, -hh * 0.12, hh * 0.55], [w * 0.25, 0, hh * 0.45]];
    }
    if (v !== "blob" && !it.w) { const b = LB.ELEMENTS.shape.outline(it); it.w = b[2] - b[0]; it.h = b[3] - b[1]; }
    it.shape = v;
  }

  function itemFields(item, L) {
    const f = [...XF_FIELDS(L)];
    if (L.cycle) {
      const pf = () => ED.renderer.frameOf(L.id, ED.clock);
      f.push({ type: "section", id: "poses", label: () => `Pose ${pf() + 1} of ${L.cycle.frames}`, icon: "film", color: "var(--lilac)" },
        { type: "note", label: () => `${item.poses ? "This piece moves between poses." : "This piece holds still in every pose."} Pick a pose under the canvas. With “This pose” on, moving the piece changes only that pose.` },
        { key: "poseHide", label: () => `Hidden in pose ${pf() + 1}`, type: "toggle",
          get: (it) => !!(it.poses && it.poses[pf()] && it.poses[pf()].hide),
          set: (it, v) => {
            const f0 = pf();
            it.poses = (it.poses || []).slice(0, L.cycle.frames);
            while (it.poses.length < L.cycle.frames) it.poses.push({});
            const pz = { ...it.poses[f0] };
            if (v) pz.hide = true; else delete pz.hide;
            it.poses[f0] = pz;
            if (it.poses.every((q) => !Object.keys(q).length)) delete it.poses;
          } });
    }
    if (item.el === "shape") {
      f.push(
        { type: "section", id: "outline", label: "Outline", icon: "shapes", color: "var(--sun)" },
        { key: "shape", label: "Outline", type: "choice",
          options: (it) => [...OUTLINES.map(([value, label, ic]) => ({ value, label, icon: ic })), ...(it.shape === "mask" ? [{ value: "mask", label: "Cut-out from a picture", icon: "scissors" }] : [])],
          set: setOutline },
        { key: "w", label: "Width", type: "range", min: 0.01, max: 2.4, step: 0.005, ...PX, when: (it) => !["blob", "path", "mask"].includes(it.shape) },
        { key: "h", label: "Height", type: "range", min: 0.01, max: 1.6, step: 0.005, ...PX, when: (it) => !["blob", "path", "mask"].includes(it.shape) },
        { key: "w", label: "Width", type: "range", min: 0.02, max: 2.4, step: 0.005, ...PX, when: (it) => it.shape === "mask",
          set: (it, v) => { const im = ED.doc.images[it.image]; it.w = v; if (im) it.h = (v * im.h) / im.w; } },
        { type: "note", label: (it) => `A cut-out through ${it.points.length} points. Double-click it on the canvas, or use the points button above, to move them.`, when: (it) => it.shape === "path" },
        { key: "smooth", label: "Smooth curves between points", type: "toggle", when: (it) => it.shape === "path" },
        { key: "mask.from", label: "Cut out", type: "select", when: (it) => it.shape === "mask",
          options: opts([["dark", "The dark parts (paper on light)"], ["light", "The light parts (paper on dark)"], ["alpha", "The see-through parts of a PNG"]]) },
        { key: "mask.threshold", label: "Edge falls at", type: "range", ...PCT, min: 0.05, max: 0.95, fallback: 0.5, reset: 0.5, when: (it) => it.shape === "mask",
          hint: "Move it if the cut-out picks up shadows or misses thin parts." },
        { key: "round", label: "Round corners", type: "range", min: 0, max: 0.03, step: 0.0005, fallback: 0, reset: 0, ...PX, when: (it) => it.shape === "path" },
        { key: "corner", label: "Corner roundness", type: "range", ...PCT, when: (it) => it.shape === "rect", fallback: 0.15, reset: 0.15 },
        { key: "sides", label: "Points", type: "range", min: 3, max: 12, step: 1, when: (it) => it.shape === "polygon", fallback: 5, reset: 5 },
        { key: "star", label: "Star depth", type: "range", ...PCT, when: (it) => it.shape === "polygon", fallback: 0, reset: 0 },
        { key: "merge", label: "Lobe blending", type: "range", min: 0, max: 0.08, step: 0.002, ...PX, when: (it) => it.shape === "blob", fallback: 0.03, reset: 0.03 },

        { type: "section", id: "material", label: "Material", icon: "palette", color: "var(--coral)" },
        { key: "material", label: "Material", type: "tiles",
          options: (it) => MATERIALS.filter(([m]) => m !== "photo" || imageOptions().length).map(([value, label]) => ({ value, label, lazyThumb: () => materialThumb(value, it) })),
          set: (it, v) => { it.material = v; if (v === "photo" && !ED.doc.images[it.image]) it.image = imageOptions()[0][0]; } },
        { key: "image", label: "Picture", type: "select", options: imageOptions, when: (it) => it.material === "photo" || it.shape === "mask" },
        { key: "tile", label: "Picture tile size", type: "range", min: 0.05, max: 1.5, step: 0.01, ...PX, when: (it) => it.material === "photo" && it.shape !== "mask", fallback: 0.4, reset: 0.4 },
        { key: "tint", label: "Tint toward color", type: "range", ...PCT, when: (it) => it.material === "photo", fallback: 0, reset: 0 },
        { key: "colors.0", label: (it) => ({ gradient: "Top color", photo: "Tint color", water: "Far water", sand: "Dry sand", stripes: "First stripe" }[it.material] || "Color"), type: "color" },
        { key: "colors.1", label: (it) => ({ gradient: "Bottom color", water: "Near water", sand: "Wet sand", stripes: "Second stripe", cardboard: "Flecks" }[it.material] || "Tip color"), type: "color",
          when: (it) => ["gradient", "foliage", "water", "sand", "stripes", "cardboard"].includes(it.material) },
        { key: "stripes.fan", label: "Stripes", type: "choice", options: opts([{ value: "", label: "Straight bands" }, { value: "fan", label: "Fan from a point" }]), when: (it) => it.material === "stripes",
          get: (it) => (it.stripes && it.stripes.fan ? "fan" : ""), set: (it, v) => {
            const b = LB.ELEMENTS.shape.outline(it);
            it.stripes = v ? { fan: true, count: (it.stripes && it.stripes.count) || 10, center: [(b[0] + b[2]) / 2, b[1]] } : { width: (it.stripes && it.stripes.width) || 0.03 };
          } },
        { key: "stripes.width", label: "Stripe width", type: "range", min: 0.003, max: 0.12, step: 0.001, ...PX, fallback: 0.03, when: (it) => it.material === "stripes" && !(it.stripes && it.stripes.fan) },
        { key: "stripes.count", label: "Stripes", type: "range", min: 2, max: 24, step: 2, fallback: 10, when: (it) => it.material === "stripes" && !!(it.stripes && it.stripes.fan) },
        { key: "grain", label: "Pattern size", type: "range", min: 0.3, max: 3, step: 0.05, fallback: 1, reset: 1, when: (it) => it.material !== "photo",
          format: (v) => `${v.toFixed(2)}×`, hint: "Higher makes felt, clay and foliage finer." },

        { type: "section", id: "feel", label: "Handmade feel", icon: "sparkle", color: "var(--teal)" },
        { key: "rough", label: "Rough edge", type: "range", ...PCT, fallback: 0.4, reset: 0.4 },
        { key: "fuzz", label: "Fiber fuzz", type: "range", ...PCT, fallback: 0.3, reset: 0.3 },
        { key: "puff", label: "Puff", type: "range", ...PCT, fallback: 0.3, reset: 0.3, hint: "Rounds it up, lit from the top left." },
        { key: "shadow", label: "Cast shadow", type: "range", ...PCT, fallback: 0, reset: 0 },
        ...SPECK_FIELDS(BEAD_DEFAULT),
        ...BOIL_FIELDS(L, (it) => it.shape === "mask" || it.material === "photo"),
      );
    } else if (item.el === "image") {
      f.push(
        { type: "section", id: "picture", label: "Picture", icon: "image", color: "var(--coral)" },
        { key: "image", label: "Picture", type: "select", options: imageOptions,
          set: (it, v) => { it.image = v; const im = ED.doc.images[v]; it.h = (it.w * im.h) / im.w; } },
        { key: "w", label: "Width", type: "range", min: 0.02, max: 2.4, step: 0.005, ...PX,
          set: (it, v) => { const im = ED.doc.images[it.image]; it.w = v; it.h = (v * im.h) / im.w; } },
        { key: "tint", label: "Tint toward color", type: "range", ...PCT, fallback: 0, reset: 0 },
        { key: "tintColor", label: "Tint color", type: "color", fallback: "#FFFFFF" },
        ...BOIL_FIELDS(L, () => true),
      );
    } else if (item.el === "canopy") {
      f.push({ type: "section", id: "foliage", label: "Foliage", icon: "plant", color: "var(--teal)" },
        { key: "colors.0", label: "Shadow", type: "color" }, { key: "colors.1", label: "Middle", type: "color" },
        { key: "colors.2", label: "Light", type: "color" }, { key: "colors.3", label: "Tips", type: "color" },
        { key: "scale", label: "Tuft size", type: "range", min: 20, max: 160, step: 1, get: (it) => 180 - it.scale, set: (it, v) => (it.scale = 180 - v), format: (v) => Math.round(v) },
        ...SPECK_FIELDS({ scale: 120, density: 0.25, size: 0.3, colors: ["#F7F2DA", "#F2DE8A"] }));
    } else if (item.el === "florets") {
      f.push({ type: "section", id: "florets", label: "Flowers", icon: "flower", color: "var(--pink)" },
        { key: "colors.0", label: "Petals", type: "color" }, { key: "colors.1", label: "Petal highlights", type: "color" }, { key: "colors.2", label: "Gaps", type: "color" },
        { key: "scale", label: "Flower size", type: "range", min: 60, max: 320, step: 1, get: (it) => 380 - it.scale, set: (it, v) => (it.scale = 380 - v), format: (v) => Math.round(v) });
    } else if (item.el === "trunk") {
      f.push({ type: "section", id: "trunk", label: "Trunk", icon: "plant", color: "var(--coral)" }, { key: "color", label: "Bark", type: "color" },
        { key: "width", label: "Width", type: "range", min: 0.004, max: 0.12, step: 0.001, ...PX },
        { key: "flare", label: "Base flare", type: "range", min: 0, max: 0.1, step: 0.001, ...PX },
        { key: "bend", label: "Bend", type: "range", min: -0.05, max: 0.05, step: 0.001, ...PX, reset: 0 });
    } else if (item.el === "branch") {
      f.push({ type: "section", id: "branch", label: "Branch", icon: "leaf", color: "var(--coral)" }, { key: "color", label: "Bark", type: "color" },
        { key: "r", label: "Thickness", type: "range", min: 0.003, max: 0.05, step: 0.001, ...PX });
    } else if (item.el === "turf") {
      f.push({ type: "section", id: "turf", label: "Grass", icon: "plant", color: "var(--teal)" }, { key: "colors.0", label: "Top", type: "color" }, { key: "colors.1", label: "Bottom", type: "color" },
        { key: "style", label: "Surface", type: "choice", options: opts([{ value: "grass", label: "Grass" }, { value: "carpet", label: "Flowered carpet" }]), fallback: "grass" },
        ...SPECK_FIELDS({ scale: 140, density: 0.08, size: 0.3, colors: ["#F8F2D8", "#F2D97A"] }));
    } else if (item.el === "fuzz") {
      f.push({ type: "section", id: "fuzz", label: "Felt ball", icon: "ellipse", color: "var(--pink)" }, { key: "color", label: "Color", type: "color" },
        { key: "radii.0", label: "Width", type: "range", min: 0.005, max: 0.2, step: 0.001, ...PX },
        { key: "radii.1", label: "Height", type: "range", min: 0.005, max: 0.2, step: 0.001, ...PX });
    } else if (item.el === "clay") {
      f.push(...clayFields(item));
    } else if (item.shader) {
      f.push({ type: "section", id: "art", label: "Study art", icon: "wand", color: "var(--lilac)" },
        { type: "note", label: "A bespoke shader from the garden study. You can move, size and turn it; its colors live in the study's code." });
    }
    return f;
  }

  function clayFields(item) {
    const i = () => Math.min(ED.partSel, item.parts.length - 1);
    const pk = (k) => `parts.${i()}.${k}`;
    const part = () => item.parts[i()];
    const is = (...kinds) => () => kinds.includes(part().kind);
    const pos = (key, label, k3, when) => ({ key: `${key}.${k3}`, label, type: "range", min: -0.3, max: 0.3, step: 0.001, ...PX, when,
      get: (it) => it.parts[i()][key][k3], set: (it, v) => (it.parts[i()][key][k3] = v) });
    const PART_NAMES = { sphere: "Ball", capsule: "Tube", box: "Box", ellipsoid: "Egg" };
    return [
      { type: "section", id: "clay", label: "3D", icon: "cube", color: "var(--lilac)" },
      { key: "yaw", label: "Turn around", type: "range", fallback: 0, reset: 0, ...DEG },
      { key: "pitch", label: "Tilt toward you", type: "range", deg: true, min: -Math.PI / 2, max: Math.PI / 2, step: Math.PI / 180, fallback: 0, reset: 0 },
      { key: "squash", label: "Squash", type: "range", min: 0.5, max: 1.6, step: 0.01, fallback: 1, reset: 1, scale: 100, suffix: "%" },
      { key: "material", label: "Material", type: "choice", options: opts([{ value: "clay", label: "Clay" }, { value: "felt", label: "Felt" }, { value: "plastic", label: "Shiny plastic" }]), fallback: "clay" },
      { key: "dents", label: "Thumb dents", type: "range", ...PCT, fallback: 0.5, reset: 0.5, when: (it) => (it.material || "clay") === "clay" },
      { key: "fuzz", label: "Fiber fuzz", type: "range", ...PCT, fallback: 0.6, reset: 0.6, when: (it) => it.material === "felt" },
      { key: "blend", label: "Soft joins", type: "range", min: 0, max: 0.04, step: 0.0005, ...PX, fallback: 0.012, reset: 0.012 },
      { key: "shadow", label: "Cast shadow", type: "range", ...PCT, fallback: 0, reset: 0 },

      { type: "section", id: "clay-anim", label: "Animate in one click", icon: "wand", color: "var(--sun)" },
      { type: "buttons", label: "Animate in one click", items: () => [
        { label: "Turntable", icon: "turntable", tip: "Turns all the way round in 12 poses", run: () => ACT().animate3D("turntable12") },
        { label: "Bounce", icon: "bounce", tip: "Squashes as it lands", run: () => ACT().animate3D("bounce") },
        { label: "Wobble", icon: "wobble", tip: "Rocks from side to side", run: () => ACT().animate3D("wobble") },
      ] },

      { type: "section", id: "clay-parts", label: () => `Parts (${item.parts.length})`, icon: "box", color: "var(--teal)" },
      { type: "buttons", label: "Add a part", items: () => [
        ...["sphere", "capsule", "box", "ellipsoid"].map((k) => ({ label: PART_NAMES[k], icon: "add", tip: `Add a ${PART_NAMES[k].toLowerCase()}`, run: () => ACT().addPart(k) })),
      ] },
      { key: "partSel", label: "Editing part", type: "select", get: () => String(i()), set: (it, v) => (ED.partSel = +v),
        options: (it) => it.parts.map((pt, n) => [String(n), `${n + 1}. ${PART_NAMES[pt.kind] || D().titleCase(pt.kind)}${pt.carve ? " (cut away)" : ""}`]),
        hint: "Double-click the piece on the canvas to pick and drag its parts." },
      { key: pk("kind"), label: "Part shape", type: "choice", get: () => part().kind,
        options: opts([{ value: "sphere", label: "Ball" }, { value: "capsule", label: "Tube" }, { value: "box", label: "Box" }, { value: "ellipsoid", label: "Egg" }]),
        set: (it, v) => {
          const old = it.parts[i()], fresh = ACT().NEW_PART[v]();
          it.parts[i()] = { ...fresh, at: old.at, color: old.color, ...(old.carve ? { carve: true } : {}), ...(v === "capsule" ? { to: [old.at[0] + 0.06, old.at[1], old.at[2]] } : {}) };
        } },
      { key: pk("color"), label: "Color", type: "color", get: () => part().color || "#C9785A", set: (it, v) => (it.parts[i()].color = v) },
      { type: "heading", label: "Where it sits" },
      pos("at", "Left, right", 0), pos("at", "Up, down", 1), pos("at", "Toward you", 2),
      { key: pk("r"), label: "Size", type: "range", min: 0.002, max: 0.15, step: 0.001, ...PX, when: is("sphere"), get: () => part().r, set: (it, v) => (it.parts[i()].r = v) },
      { type: "heading", label: "Tube end", when: is("capsule") },
      pos("to", "Left, right", 0, is("capsule")), pos("to", "Up, down", 1, is("capsule")), pos("to", "Toward you", 2, is("capsule")),
      { key: pk("r"), label: "Start thickness", type: "range", min: 0.002, max: 0.1, step: 0.001, ...PX, when: is("capsule"), get: () => part().r, set: (it, v) => (it.parts[i()].r = v) },
      { key: pk("r2"), label: "End thickness", type: "range", min: 0.002, max: 0.1, step: 0.001, ...PX, when: is("capsule"), get: () => part().r2 ?? part().r, set: (it, v) => (it.parts[i()].r2 = v) },
      ...[0, 1, 2].map((k3) => ({ key: pk(`size.${k3}`), label: ["Width", "Height", "Depth"][k3], type: "range", min: 0.003, max: 0.2, step: 0.001, ...PX, when: is("box", "ellipsoid"),
        get: () => part().size[k3], set: (it, v) => (it.parts[i()].size[k3] = v) })),
      { key: pk("r"), label: "Corner rounding", type: "range", min: 0, max: 0.05, step: 0.0005, ...PX, when: is("box"), get: () => part().r ?? 0.008, set: (it, v) => (it.parts[i()].r = v) },
      { key: pk("carve"), label: "Cut this part away", type: "toggle", hint: "Makes hollows: eye sockets, a bowl.", get: () => !!part().carve, set: (it, v) => { if (v) it.parts[i()].carve = true; else delete it.parts[i()].carve; } },
      { type: "buttons", label: "Part actions", items: () => [
        { label: "Duplicate part", icon: "copy", run: () => ACT().duplicatePart() },
        { label: "Remove part", icon: "trash", kind: "danger", run: () => ACT().removePart() },
      ] },
    ];
  }

  // ---------- layer fields ----------
  function layerFields(L) {
    const sprite = L.type === "sprite", sparkles = L.type === "sparkles";
    const f = [
      { type: "section", id: "depth", label: "Depth", icon: "depth", color: depthColor(L.depth) },
      { key: "depth", label: "Depth", type: "range", min: 0, max: 1, step: 0.01, scale: 100, suffix: "%", hint: "0 is far away, 100 is right by the camera. Nearer layers slide more when the camera drifts." },
      { key: "far", label: "Soften with distance", type: "toggle" },
      { key: "haze", label: "Haze toward the horizon", type: "range", ...PCT, max: 0.5, fallback: 0, reset: 0 },
      { key: "boil", label: "Boil", type: "range", min: 0, max: 4, step: 0.1, fallback: 1, reset: 1, suffix: " px", hint: "How far the layer wobbles each beat, on a 1080-pixel-tall screen." },
      { key: "opacity", label: "Opacity", type: "range", ...PCT, fallback: 1, reset: 1 },
    ];
    if (!L.type && !(L.anim && L.anim.type === "cycle")) {
      f.push(
        { type: "section", id: "layer-poses", label: "Poses", icon: "film", color: "var(--lilac)" },
        { key: "cycle.frames", label: "Poses", type: "choice", numeric: true,
          options: opts([["0", "None"], ["2", "2"], ["3", "3"], ["4", "4"], ["6", "6"], ["8", "8"], ["12", "12"]].map(([value, label]) => ({ value, label }))),
          get: (l) => String(l.cycle ? l.cycle.frames : 0), set: (l, v) => ACT().applyCycle(l, v, l.cycle && l.cycle.rate),
          hint: "Each pose is a separate arrangement of the layer's pieces, swapped on the beat, the way stop motion is shot." },
        { key: "cycle.rate", label: "Poses a second", type: "select", numeric: true, when: (l) => !!l.cycle,
          options: (l) => ACT().validRates(l.cycle.frames).map((r) => [String(r), `${r} a second (${Math.round((l.cycle.frames / r) * 100) / 100} s round)`]),
          get: (l) => String(l.cycle.rate), set: (l, v) => (l.cycle.rate = v),
          hint: "Only rates that fit the 6-second loop a whole number of times are offered." },
      );
    }
    f.push({ type: "section", id: "motion", label: "Motion", icon: "sway", color: "var(--teal)" });
    if (L.anim && L.anim.type === "cycle") {
      f.push({ type: "note", label: `Plays ${L.anim.frames} baked frames, ${L.anim.rate} a second.` });
    } else {
      f.push(
        { key: "anim.type", label: "Motion", type: "choice",
          options: opts([{ value: "none", label: "Still", icon: "still" }, { value: "drift", label: "Drift side to side", icon: "drift" }, { value: "sway", label: "Sway", icon: "sway" }, { value: "travel", label: "Travel across, and loop", icon: "travel" }]),
          get: (l) => (l.anim ? l.anim.type : "none"),
          set: (l, v) => {
            if (v === "none") delete l.anim;
            else if (v === "drift") l.anim = { type: "drift", amp: [0.012, 0.002] };
            else if (v === "travel") l.anim = { type: "travel", from: [-2.2, 0], to: [0.4, 0], speed: 1, phase: 0, bob: 0.01, bobs: 3 };
            else l.anim = { type: "sway", amp: 0.04, phase: 0, speed: 1 };
          } },
        { key: "anim.amp.0", label: "Drift distance", type: "range", min: 0, max: 0.06, step: 0.001, ...PX, when: (l) => l.anim && l.anim.type === "drift" },
        { key: "anim.amp.1", label: "Bob up and down", type: "range", min: 0, max: 0.02, step: 0.0005, ...PX, when: (l) => l.anim && l.anim.type === "drift" },
        { key: "anim.amp", label: "Sway angle", type: "range", deg: true, min: 0, max: 0.21, step: 0.0017, when: (l) => l.anim && l.anim.type === "sway", format: (v) => `${((v * 180) / Math.PI).toFixed(1)}°` },
        { key: "anim.speed", label: "Sways a loop", type: "range", min: 1, max: 4, step: 1, fallback: 1, when: (l) => l.anim && l.anim.type === "sway",
          hint: "Whole numbers, so the motion lands back where it started when the loop repeats." },
        { key: "anim.phase", label: "Timing offset", type: "range", min: 0, max: 6.28, step: 0.01, when: (l) => l.anim && l.anim.type === "sway", format: (v) => `${Math.round((v / 6.2832) * 100)}%` },
        { key: "pivot", label: "Sway from", type: "choice", options: opts([{ value: "base", label: "The bottom" }, { value: "center", label: "The middle" }]), fallback: "base", when: (l) => !sprite && l.anim && l.anim.type === "sway" },
        { key: "anim.speed", label: "Crossings a loop", type: "range", min: 1, max: 4, step: 1, fallback: 1, when: (l) => l.anim && l.anim.type === "travel",
          hint: "It enters at one end and leaves at the other, then starts over. Keep both ends off screen so the jump back is never seen." },
        { key: "anim.phase", label: "Head start", type: "range", ...PCT, max: 0.99, fallback: 0, reset: 0, when: (l) => l.anim && l.anim.type === "travel" },
        { key: "anim.to.0", label: "Distance", type: "range", min: -2.6, max: 2.6, step: 0.01, when: (l) => l.anim && l.anim.type === "travel", scale: 100 / A(), suffix: "%",
          get: (l) => l.anim.to[0] - l.anim.from[0], set: (l, v) => (l.anim.to[0] = l.anim.from[0] + v), format: (v) => `${Math.round((v / A()) * 100)}% of the width` },
        { key: "anim.bob", label: "Bob up and down", type: "range", min: 0, max: 0.04, step: 0.001, ...PX, fallback: 0, when: (l) => l.anim && l.anim.type === "travel" },
      );
    }
    f.push(
      { type: "section", id: "shift", label: "Shift", icon: "drift", color: "var(--sky)", collapsed: true },
      { key: "offset.0", label: "Across", type: "number", half: true, min: -1, max: 1, step: 0.001, fallback: 0, reset: 0, format: (v) => `${((v / A()) * 100).toFixed(1)}%`, scale: 100 / A(), suffix: "%" },
      { key: "offset.1", label: "Down", type: "number", half: true, min: -0.6, max: 0.6, step: 0.001, fallback: 0, reset: 0, format: (v) => `${(v * 100).toFixed(1)}%`, scale: 100, suffix: "%" },
    );
    if (sprite) {
      f.push({ type: "section", id: "flower", label: (l) => (l.flower ? "Flower" : "Leaf"), icon: "flower", color: "var(--pink)" },
        { key: "flower", label: "Kind", type: "select", options: opts([["daisy", "Daisy"], ["tulip", "Tulip"], ["orchid", "Orchid"], ["bloom", "Open bloom"], ["", "Leaf"]]),
          get: (l) => l.flower || "", set: (l, v) => { if (v) l.flower = v; else delete l.flower; } },
        { key: "colors.0", label: (l) => (l.flower ? "Petal shadow" : "Leaf shadow"), type: "color" },
        { key: "colors.1", label: (l) => (l.flower ? "Petal" : "Leaf"), type: "color" },
        { key: "colors.2", label: (l) => (l.flower ? "Petal light" : "Leaf light"), type: "color" },
        { key: "size", label: "Size", type: "range", min: 0.006, max: 0.14, step: 0.001, ...PX },
        { key: "tilt", label: "Head turn", type: "range", min: -1.5, max: 1.5, step: 0.01, fallback: 0, reset: 0, deg: true },
        { key: "c.0", label: "Stem lean", type: "range", min: -0.25, max: 0.25, step: 0.001, ...PX,
          get: (l) => l.c[0] - l.a[0], set: (l, v) => { l.c[0] = l.a[0] + v; l.b[0] = l.a[0] + v * 0.35; } },
        { key: "c.1", label: "Stem height", type: "range", min: 0.04, max: 0.6, step: 0.001, ...PX,
          get: (l) => l.a[1] - l.c[1], set: (l, v) => { l.c[1] = l.a[1] - v; l.b[1] = l.a[1] - v * 0.6; } });
    }
    if (sparkles) {
      f.push({ type: "section", id: "sparkles", label: "Sparkles", icon: "sparkle", color: "var(--sun)" },
        { key: "count", label: "How many", type: "range", min: 1, max: 80, step: 1 },
        { key: "size", label: "Size", type: "range", min: 0.001, max: 0.02, step: 0.0005, ...PX },
        { key: "color", label: "Color", type: "color" });
    }
    return f;
  }

  // ---------- look fields ----------
  const grade = (key) => ({ get: (d) => d.grades[d.grade][key], set: (d, v) => (d.grades[d.grade][key] = v) });
  const pass = (name) => ({ key: `post.on.${name}` });
  function lookFields() {
    return [
      { type: "section", id: "look-stop", label: "Stop motion", icon: "film", color: "var(--coral)" },
      { key: "fps", label: "Beats a second", type: "choice", numeric: true, options: opts([{ value: "12", label: "12, on 2s" }, { value: "8", label: "8, on 3s" }, { value: "6", label: "6, on 4s" }]),
        hint: "How often poses change. Everything still loops every 6 seconds." },
      { key: "boil", label: "Boil, whole scene", type: "range", min: 0, max: 2, step: 0.05, scale: 100, suffix: "%", reset: 1 },

      { type: "section", id: "look-grade", label: "Color grade", icon: "palette", color: "var(--sun)", toggle: pass("grade") },
      { key: "g.exposure", label: "Exposure", type: "range", min: -1, max: 1, step: 0.01, reset: 0, ...grade("exposure") },
      { key: "g.temperature", label: "Warmth", type: "range", min: -1, max: 1, step: 0.01, reset: 0, ...grade("temperature") },
      { key: "g.tint", label: "Green to magenta", type: "range", min: -0.5, max: 0.5, step: 0.01, reset: 0, ...grade("tint") },
      { key: "g.contrast", label: "Contrast", type: "range", min: 0.5, max: 1.8, step: 0.01, reset: 1, ...grade("contrast") },
      { key: "g.saturation", label: "Saturation", type: "range", min: 0, max: 2, step: 0.01, reset: 1, ...grade("saturation") },
      { key: "g.floor", label: "Darkest color", type: "color", ...grade("floor"), hint: "Lifted blacks: the shadows never go darker than this." },
      { key: "g.split", label: "Split toning", type: "range", ...PCT, reset: 0, ...grade("split") },
      { key: "g.shadowTint", label: "Shadow tint", type: "color", ...grade("shadowTint") },
      { key: "g.highlightTint", label: "Highlight tint", type: "color", ...grade("highlightTint") },

      { type: "section", id: "look-bloom", label: "Bloom and mist", icon: "sun", color: "var(--sun)", toggle: pass("bloom") },
      { key: "post.bloom.glow", label: "Glow", type: "range", min: 0, max: 1.6, step: 0.01, scale: 100, suffix: "%" },
      { key: "post.bloom.threshold", label: "Glow starts at", type: "range", ...PCT },
      { key: "post.bloom.mist", label: "Mist", type: "range", min: 0, max: 0.8, step: 0.01, scale: 100, suffix: "%" },

      { type: "section", id: "look-depth", label: "Depth softness", icon: "depth", color: "var(--sky)", toggle: pass("depth"), collapsed: true },
      { key: "post.depth.radius", label: "Blur on far layers", type: "range", min: 0, max: 4, step: 0.05, suffix: " px" },

      { type: "section", id: "look-halation", label: "Halation", icon: "sparkle", color: "var(--coral)", toggle: pass("halation"), collapsed: true },
      { key: "post.halation.amount", label: "Warm fringe", type: "range", min: 0, max: 1.5, step: 0.01, scale: 100, suffix: "%" },
      { key: "post.halation.color", label: "Fringe color", type: "color" },

      { type: "section", id: "look-ca", label: "Lens fringing", icon: "eye", color: "var(--lilac)", toggle: pass("ca"), collapsed: true },
      { key: "post.ca.amount", label: "Color fringing", type: "range", min: 0, max: 0.003, step: 0.0001, format: (v) => (v * 1000).toFixed(1) },

      { type: "section", id: "look-vignette", label: "Vignette", icon: "fit", color: "var(--lilac)", toggle: pass("vignette"), collapsed: true },
      { key: "post.vignette.amount", label: "Darkening", type: "range", ...PCT },
      { key: "post.vignette.color", label: "Color", type: "color" },

      { type: "section", id: "look-grain", label: "Grain", icon: "film", color: "var(--pink)", toggle: pass("grain"), collapsed: true },
      { key: "post.grain.amount", label: "Grain", type: "range", min: 0, max: 0.12, step: 0.002, scale: 1000, format: (v) => (v * 100).toFixed(1) },
      { key: "post.grain.perFrame", label: "Changes every frame, not every beat", type: "toggle" },

      { type: "section", id: "look-scene", label: "Scene", icon: "sky", color: "var(--teal)" },
      { key: "background", label: "Behind everything", type: "color" },
      { key: "horizon", label: "Horizon haze", type: "color" },
      { key: "camera.drift.0", label: "Camera drift, across", type: "range", min: 0, max: 0.03, step: 0.0005, ...PX },
      { key: "camera.drift.1", label: "Camera drift, up and down", type: "range", min: 0, max: 0.015, step: 0.0005, ...PX },
      { key: "focus.0", label: "Narrow screens center on", type: "range", min: 0, max: A(), step: 0.01, format: (v) => `${Math.round((v / A()) * 100)}%`,
        hint: "A screen narrower than the scene shows a slice of it. Press G to see the phone and desktop crops." },
      { key: "focus.1", label: "Wide screens center on", type: "range", min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%`,
        hint: "A screen wider than the scene shows a band of it, top to bottom." },
    ];
  }

  // ---------- shared pane helpers ----------
  const views = { piece: null, layer: null, look: null };
  let lastSel = "";
  function rememberFocus(pane) {
    const a = document.activeElement;
    if (!a || !pane.contains(a)) return null;
    const holder = a.closest("[data-key],[data-act]");
    if (!holder) return null;
    return holder.dataset.act ? `[data-act="${holder.dataset.act}"]` : `[data-key="${holder.dataset.key}"]`;
  }
  function restoreFocus(pane, sel) {
    if (!sel) return;
    let el = pane.querySelector(sel);
    if (!el) return;
    if (el.getAttribute("role") === "radiogroup") el = el.querySelector('[aria-checked="true"]') || el.firstElementChild;
    if (el) el.focus({ preventScroll: true });
  }
  // Rebuilds a pane in place: keeps its scroll and the focused control.
  function rebuild(pane, build, { fresh = false, focusKey = null } = {}) {
    const st = pane.scrollTop;
    const focus = focusKey ? `[data-key="${focusKey}"]` : rememberFocus(pane);
    pane.classList.toggle("no-anim", !fresh);
    pane.replaceChildren();
    build(pane);
    if (!fresh) pane.scrollTop = st;
    else pane.scrollTop = 0;
    restoreFocus(pane, focus);
  }
  function ctxFor(target, rerender, kind) {
    return {
      target,
      onInput: (def) => {
        ED.preview(() => {});
        if (def.key === "name") ED.emit("names");
        if (kind === "item") rememberStyle();
        if (def.key === "depth") { const c = document.querySelector('#pane-layer [data-sec="depth"]'); const L = ED.selLayer(); if (c && L) c.style.setProperty("--card", depthColor(L.depth)); }
      },
      onCommit: (label, def) => {
        if (def.key !== "partSel") ED.commit(label);
        if (["select", "toggle", "choice", "tiles"].includes(def.type)) rerender(def.key);
        if (def.key === "partSel") ED.emit("part-select");
      },
    };
  }
  const actBtn = (act, ic, tip, run, extra = {}) => h("button", { type: "button", class: `ibtn${extra.danger ? " ibtn-danger" : ""}`, "data-act": act, "aria-label": extra.label || tip, "data-tip": tip, "data-keys": extra.keys || null,
    "aria-pressed": extra.pressed != null ? String(!!extra.pressed) : null, disabled: extra.disabled ? true : null, html: ICONS[ic], onclick: run });
  const tipRow = (keys, text) => h("div", { class: "tip-row" }, ...keys.map((k) => h("kbd", { text: k })), h("span", { text }));

  function kindOf(item) {
    if (item.shader) return "Study art";
    if (item.el === "shape") {
      const outline = item.shape === "mask" ? "Cut-out" : item.shape === "path" ? "Own outline" : item.shape === "blob" ? "Blob" : item.shape === "polygon" ? (item.star > 0.05 ? "Star" : item.sides === 3 ? "Triangle" : "Polygon") : D().titleCase(item.shape);
      return `${outline} · ${MATERIAL_NAME[item.material] || "Paper"}`;
    }
    if (item.el === "clay") return `3D · ${D().titleCase(item.material || "clay")} · ${item.parts.length} part${item.parts.length === 1 ? "" : "s"}`;
    return { image: "Picture", canopy: "Foliage", florets: "Flowers", trunk: "Trunk", branch: "Branch", turf: "Grass", fuzz: "Felt ball" }[item.el] || D().titleCase(item.el);
  }

  // ---------- Piece ----------
  function renderPiece(opts = {}) {
    const pane = $("#pane-piece");
    views.piece = null;
    rebuild(pane, (pane) => {
      const L = ED.selLayer(), item = ED.selItem();
      if (L && (ED.sel.group || ED.sel.multi) && ED.selMembers().length) {
        pane.append(groupHero(L));
        const body = h("div", { class: "pane-body" });
        pane.append(body);
        views.piece = LB.FIELDS.build(body, groupFields(L), groupCtx());
        return;
      }
      if (!item) { pane.append(L ? layerChosen(L) : startHere()); return; }
      pane.append(pieceHero(L, item));
      const body = h("div", { class: "pane-body" });
      pane.append(body);
      views.piece = LB.FIELDS.build(body, itemFields(item, L), ctxFor(() => ED.selItem(), (k) => renderPiece({ focusKey: k }), "item"));
    }, opts);
  }
  function startHere() {
    return h("div", { class: "empty" },
      h("span", { class: "empty-art", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("h2", { text: "Pick something to change" }),
      h("p", { text: "Click a piece on the canvas or in Layers, and its settings show up here." }),
      h("div", { class: "tips" },
        tipRow(["A"], "Add pieces from the store"),
        tipRow(["R", "E", "T"], "Draw a rectangle, ellipse or triangle"),
        tipRow(["P"], "Draw your own outline"),
        tipRow(["Space"], "Play or pause"),
        tipRow(["?"], "Every shortcut")));
  }
  function layerChosen(L) {
    const n = (L.paint || []).length;
    return h("div", { class: "empty" },
      h("span", { class: "empty-art", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
      h("h2", { text: `${L.name} is selected` }),
      h("p", { text: n ? "Click one of its pieces on the canvas, or in the list under it, to change that piece." : "This layer has no pieces of its own to pick." }),
      h("button", { type: "button", class: "btn btn-sm", onclick: () => showTab("layer", true) }, icon("layers"), h("span", { text: "Layer settings" })));
  }
  function pieceHero(L, item) {
    const pic = h("span", { class: "hero-pic", "aria-hidden": "true" }, icon(LB.LAYERS.itemIcon(item)));
    LB.LAYERS.itemThumb(L, item).then((url) => { if (url && pic.isConnected) pic.replaceChildren(h("img", { src: url, alt: "" })); });
    const name = h("input", { class: "hero-name", type: "text", value: D().itemName(item, ED.doc), "aria-label": "Piece name", maxlength: "60", spellcheck: "false", "data-key": "name" });
    name.addEventListener("input", () => ED.preview(() => { const it = ED.selItem(); if (!it) return; const v = name.value.trim(); if (v) it.name = v; else delete it.name; }));
    name.addEventListener("change", () => { ED.commit("Rename piece"); ED.emit("names"); });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); name.blur(); } });
    const chip = h("button", { type: "button", class: "layer-chip", "data-tip": "Go to its layer", "aria-label": `In layer ${L.name}. Go to the layer.`, onclick: () => ED.select(L.id) },
      h("i", { style: { background: depthColor(L.depth) } }), h("span", { text: L.name }));
    const isPath = item.el === "shape" && item.shape === "path";
    const others = ED.doc.layers.filter((l) => !l.type && l.id !== L.id);
    const actions = h("div", { class: "hero-actions", role: "toolbar", "aria-label": "Piece actions" },
      actBtn("dup", "copy", "Duplicate", () => ACT().duplicate(), { keys: "Ctrl D" }),
      actBtn("fwd", "up", "Bring forward in its layer", () => ACT().restack(1), { keys: "]" }),
      actBtn("back", "down", "Send backward in its layer", () => ACT().restack(-1), { keys: "[" }),
      isPath ? actBtn("points", "points", ED.pointEdit ? "Done editing points" : "Edit the points", () => ED.emit("edit-points"), { pressed: !!ED.pointEdit, keys: "Enter" }) : null,
      item.el === "image" ? actBtn("cutout", "scissors", "Turn into a cut-out, with a handmade edge", () => ACT().toCutout()) : null,
      item.el === "clay" ? actBtn("parts", "points", ED.partEdit ? "Done editing parts" : "Edit the parts on the canvas", () => ED.emit("edit-parts"), { pressed: !!ED.partEdit, keys: "Enter" }) : null,
      !item.shader ? actBtn("save", "heart", "Save to My pieces", () => ACT().savePiece("item")) : null,
      others.length ? actBtn("move", "layers", "Move to another layer", (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        menu([{ heading: "Move to layer" }, ...[...others].reverse().map((l) => ({ label: l.name, icon: "layers", run: () => ACT().moveItemToLayer(l.id) }))], { x: r.left, y: r.bottom + 4, label: "Move to layer" });
      }) : null,
      item.group ? actBtn("ungroup1", "box", "Take it out of its group", () => ACT().takeOutOfGroup()) : null,
      h("span", { class: "bar-spacer" }),
      actBtn("del", "trash", "Delete", () => ACT().remove(), { danger: true, keys: "Del" }));
    const inGroup = item.group && L.groups && L.groups[item.group];
    const groupChip = inGroup ? h("button", { type: "button", class: "layer-chip is-group", "data-tip": "Select the whole group", "aria-label": `In group ${inGroup.name}. Select the group.`,
      onclick: () => ED.selectGroup(L.id, item.group) }, icon("box"), h("span", { text: inGroup.name })) : null;
    return h("div", { class: "hero" }, pic, h("div", { class: "hero-text" }, name, h("div", { class: "hero-sub" }, chip, groupChip, h("span", { text: kindOf(item) }))), actions);
  }

  // ---------- a group, or several pieces ----------
  // Size and Turn act on the whole group from where it stood when it was selected, so 100% is "as it is".
  let gEdit = null, ownCommit = false;
  function groupState(L) {
    const key = `${L.id}/${ED.sel.group || (ED.sel.multi || []).join(",")}`;
    if (!gEdit || gEdit.key !== key) {
      const f = ED.renderer.frameOf(L.id, ED.clock);
      const members = ED.selMembers();
      const base = LB.ACT.membersBase(L, members, f);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const it of members) {
        const b = LB.ITEMS.worldBox(LB.ITEMS.atPose(it, f), L.rect ? { rect: L.rect } : L);
        x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]);
      }
      gEdit = { key, f, base, c: [(x0 + x1) / 2, (y0 + y1) / 2], dx: 0, dy: 0, s: 1, r: 0 };
    }
    return gEdit;
  }
  function applyGroup(L) {
    const g = gEdit;
    LB.ACT.transformMembers(L, g.base, g.f, g.c, { dx: g.dx, dy: g.dy, s: g.s, r: g.r });
  }
  function groupFields(L) {
    const st = () => groupState(L);
    const set = (k) => (_, v) => { st()[k] = v; applyGroup(L); };
    return [
      { type: "section", id: "group-place", label: "Place", icon: "fit", color: "var(--sky)" },
      { key: "g-x", label: "Across", type: "number", half: true, min: -0.6, max: A() + 0.6, step: 0.001, clamp: false, format: (v) => `${((v / A()) * 100).toFixed(1)}%`, scale: 100 / A(), suffix: "%",
        get: () => st().c[0] + st().dx, set: (_, v) => { st().dx = v - st().c[0]; applyGroup(L); } },
      { key: "g-y", label: "Down", type: "number", half: true, min: -0.6, max: 1.6, step: 0.001, clamp: false, format: (v) => `${(v * 100).toFixed(1)}%`, scale: 100, suffix: "%",
        get: () => st().c[1] + st().dy, set: (_, v) => { st().dy = v - st().c[1]; applyGroup(L); } },
      { key: "g-s", label: "Size", type: "range", min: 0.1, max: 4, step: 0.01, scale: 100, suffix: "%", reset: 1, get: () => st().s, set: set("s"),
        hint: "Sizes every piece together, around the group's middle. 100% is the size it had when you picked it." },
      { key: "g-r", label: "Turn", type: "range", ...DEG, reset: 0, get: () => st().r, set: set("r") },
      ...(L.cycle ? [{ type: "note", label: `${L.name} has ${L.cycle.frames} poses. With “This pose” on under the canvas, moving the group changes only the pose on screen.` }] : []),
      { type: "section", id: "group-pieces", label: () => `Pieces (${ED.selMembers().length})`, icon: "box", color: "var(--teal)" },
      { type: "custom", render: (box) => {
        const list = h("div", { class: "member-list" });
        for (const it of ED.selMembers().slice().reverse()) {
          const color = LB.LAYERS.itemColor(it);
          list.append(h("button", { type: "button", class: "member", "data-tip": "Select just this piece", onclick: () => ED.select(L.id, it.id) },
            icon(LB.LAYERS.itemIcon(it)), color ? h("span", { class: "item-dot", style: { background: color } }) : null, h("span", { class: "item-name", text: D().itemName(it, ED.doc) })));
        }
        box.append(list, h("p", { class: "f-hint", text: "Double-click a piece on the canvas to reach it inside the group." }));
      } },
    ];
  }
  function groupCtx() {
    return {
      target: () => (ED.selMembers().length ? ED.doc : null),
      onInput: () => ED.preview(() => {}),
      onCommit: (label) => { ownCommit = true; ED.commit(`Group ${label.toLowerCase()}`); },
    };
  }
  const groupThumbs = new Map();
  function groupHero(L) {
    const g = ED.selGroup(), members = ED.selMembers();
    const pic = h("span", { class: "hero-pic", "aria-hidden": "true" }, icon("box"));
    const f = ED.renderer.frameOf(L.id, ED.clock);
    const paint = members.map((it) => { const q = JSON.parse(JSON.stringify(LB.ITEMS.atPose(it, f))); delete q.hide; delete q.group; return q; });
    const sig = JSON.stringify(paint);
    const show = (url) => { if (url && pic.isConnected) pic.replaceChildren(h("img", { src: url, alt: "" })); };
    if (groupThumbs.has(sig)) requestAnimationFrame(() => show(groupThumbs.get(sig)));
    else LB.LAYERS.renderThumb({ id: "thumb", seed: L.seed ?? 3, paint }, 128, 128).then(LB.LAYERS.toURL).then((url) => { groupThumbs.set(sig, url); if (groupThumbs.size > 30) groupThumbs.delete(groupThumbs.keys().next().value); show(url); }).catch(() => {});
    let name;
    if (g) {
      name = h("input", { class: "hero-name", type: "text", value: g.name, "aria-label": "Group name", maxlength: "60", spellcheck: "false", "data-key": "group-name" });
      name.addEventListener("change", () => LB.ACT.renameGroup(g.id, name.value));
      name.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); name.blur(); } });
    } else name = h("p", { class: "hero-name is-static", text: `${members.length} pieces` });
    const chip = h("button", { type: "button", class: "layer-chip", "data-tip": "Go to its layer", "aria-label": `In layer ${L.name}. Go to the layer.`, onclick: () => ED.select(L.id) },
      h("i", { style: { background: depthColor(L.depth) } }), h("span", { text: L.name }));
    const others = ED.doc.layers.filter((l) => !l.type && l.id !== L.id);
    const actions = h("div", { class: "hero-actions", role: "toolbar", "aria-label": g ? "Group actions" : "Selection actions" },
      actBtn("dup", "copy", "Duplicate", () => ACT().duplicate(), { keys: "Ctrl D" }),
      actBtn("fwd", "up", "Bring forward in its layer", () => ACT().restack(1), { keys: "]" }),
      actBtn("back", "down", "Send backward in its layer", () => ACT().restack(-1), { keys: "[" }),
      g ? actBtn("ungroup", "box", "Ungroup", () => ACT().ungroup(), { keys: "Ctrl Shift G" }) : actBtn("group", "box", "Group these pieces", () => ACT().group(), { keys: "Ctrl G" }),
      L.paint.length > members.length ? actBtn("split", "layers", "Give it a layer of its own", () => ACT().splitToLayer()) : null,
      actBtn("save", "heart", "Save to My pieces", () => ACT().savePiece("item")),
      others.length ? actBtn("move", "drift", "Move to another layer", (e) => {
        const r = e.currentTarget.getBoundingClientRect();
        menu([{ heading: "Move to layer" }, ...[...others].reverse().map((l) => ({ label: l.name, icon: "layers", run: () => ACT().moveItemToLayer(l.id) }))], { x: r.left, y: r.bottom + 4, label: "Move to layer" });
      }) : null,
      h("span", { class: "bar-spacer" }),
      actBtn("del", "trash", "Delete", () => ACT().remove(), { danger: true, keys: "Del" }));
    return h("div", { class: "hero" }, pic, h("div", { class: "hero-text" }, name, h("div", { class: "hero-sub" }, chip, h("span", { text: g ? `Group · ${members.length} pieces` : "Selected together" }))), actions);
  }

  // ---------- Layer ----------
  function renderLayer(opts = {}) {
    const pane = $("#pane-layer");
    views.layer = null;
    rebuild(pane, (pane) => {
      const L = ED.selLayer();
      if (!L) {
        pane.append(h("div", { class: "empty" },
          h("span", { class: "stack-art", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
          h("h2", { text: "No layer selected" }),
          h("p", { text: "Click a row in Layers, or a card in the depth view. Every piece sits in a layer, and each layer has a depth." })));
        return;
      }
      pane.append(layerHero(L));
      if (L.locked) pane.append(h("p", { class: "f-note" }, "Locked: it can't be moved on the canvas. Its settings still work here."));
      const body = h("div", { class: "pane-body" });
      pane.append(body);
      views.layer = LB.FIELDS.build(body, layerFields(L), ctxFor(() => ED.selLayer(), (k) => renderLayer({ focusKey: k }), "layer"));
    }, opts);
  }
  function layerHero(L) {
    const n = ED.doc.layers.length, num = n - ED.doc.layers.indexOf(L);
    const pic = h("span", { class: "hero-pic", "aria-hidden": "true" });
    LB.LAYERS.fillThumb(pic, L);
    const name = h("input", { class: "hero-name", type: "text", value: L.name, "aria-label": "Layer name", maxlength: "60", spellcheck: "false", "data-key": "layer-name" });
    name.addEventListener("input", () => ED.preview(() => { const l = ED.selLayer(); if (l && name.value.trim()) l.name = name.value.trim(); }));
    name.addEventListener("change", () => { ED.commit("Rename layer"); ED.emit("names"); });
    name.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); name.blur(); } });
    const sticker = h("span", { class: "num-chip", style: { background: depthColor(L.depth) }, text: String(num) });
    const sub = h("div", { class: "hero-sub" }, sticker, h("span", { text: `${num === 1 ? "Front layer" : num === n ? "Back layer" : `${num} of ${n} from the front`} · ${LB.LAYERS.kindText(L)}` }));
    const actions = h("div", { class: "hero-actions", role: "toolbar", "aria-label": "Layer actions" },
      actBtn("hide", L.hidden ? "eyeOff" : "eye", L.hidden ? "Show" : "Hide", () => ACT().toggle(L.id, "hidden"), { pressed: !!L.hidden, label: "Hide" }),
      actBtn("lock", L.locked ? "lock" : "unlock", L.locked ? "Unlock" : "Lock", () => ACT().toggle(L.id, "locked"), { pressed: !!L.locked, label: "Lock" }),
      actBtn("dup", "copy", "Duplicate", () => ACT().duplicate(), { keys: "Ctrl D" }),
      actBtn("fwd", "up", "Bring forward", () => ACT().restack(1), { keys: "]" }),
      actBtn("back", "down", "Send backward", () => ACT().restack(-1), { keys: "[" }),
      actBtn("save", "heart", "Save to My pieces", () => ACT().savePiece("layer"), { disabled: (L.paint || []).some((it) => it.shader) }),
      h("span", { class: "bar-spacer" }),
      actBtn("del", "trash", "Delete layer", () => ACT().remove(), { danger: true, keys: "Del" }));
    return h("div", { class: "hero" }, pic, h("div", { class: "hero-text" }, name, sub), actions);
  }

  // ---------- Look ----------
  let presetShots = { key: "", urls: {} };
  function renderLook(opts = {}) {
    const pane = $("#pane-look");
    views.look = null;
    rebuild(pane, (pane) => {
      pane.append(h("div", { class: "pane-intro" },
        h("h2", { class: "pane-h", text: "Look" }),
        h("p", { text: "The recipe behind the handmade feel. Switch a card off to see what it adds." })));
      const presets = h("div", { class: "presets", role: "group", "aria-label": "Start from a look" });
      for (const [k, p] of Object.entries(D().PRESETS)) {
        const b = h("button", { type: "button", class: "preset", "data-preset": k, "aria-pressed": String(ED.doc.grade === k), "data-tip": p.note },
          h("span", { class: "preset-pic", "aria-hidden": "true" }, presetShots.urls[k] ? h("img", { src: presetShots.urls[k], alt: "" }) : null),
          h("span", { text: p.name }));
        b.addEventListener("click", () => applyPreset(k));
        presets.append(b);
      }
      pane.append(presets);
      const body = h("div", { class: "pane-body" });
      pane.append(body);
      views.look = LB.FIELDS.build(body, lookFields(), {
        target: () => ED.doc,
        onInput: () => ED.preview(() => {}),
        onCommit: (label, def) => { ED.commit(`Look: ${label}`); if (["select", "toggle", "choice"].includes(def.type)) renderLook({ focusKey: def.key }); },
      });
      pane.append(h("div", { class: "f-buttons" }, h("button", { type: "button", class: "btn btn-sm", onclick: copyLook }, icon("copy"), h("span", { text: "Copy the look as JSON" }))));
      schedulePresetShots();
    }, opts);
  }
  function applyPreset(k) {
    const p = D().PRESETS[k];
    ED.change((d) => {
      d.grades[k] = D().clone(p.grade);
      d.grade = k;
      const on = d.post.on;
      d.post = { ...D().clone(p.post), on };
    }, `Look: ${p.name}`);
    ED.emit("status", { msg: `Applied the ${p.name} look. ${p.note}`, tone: "ok" });
    renderLook();
    const b = document.querySelector(`#pane-look [data-preset="${k}"]`);
    if (b) { b.focus({ preventScroll: true }); bump(b); }
  }
  // Small renders of the scene in each preset, made when the Look tab is open.
  let shotTimer = 0;
  function schedulePresetShots() {
    clearTimeout(shotTimer);
    shotTimer = setTimeout(async () => {
      if ($("#pane-look").hidden || !LB.CANVAS || !LB.CANVAS.snapshot) return;
      const key = `${ED.history.index}|${ED.history.stack.length}|${ED.doc.title}`;
      if (presetShots.key === key && Object.keys(presetShots.urls).length) return;
      if (ED.renderer.busy || ED.recording) return schedulePresetShots();
      const urls = LB.CANVAS.snapshot(240, 136, Object.entries(D().PRESETS).map(([k, p]) => ({ k, grade: p.grade, post: p.post })));
      if (!urls) return;
      presetShots = { key, urls };
      document.querySelectorAll("#pane-look [data-preset]").forEach((b) => {
        const u = urls[b.dataset.preset];
        if (u) b.querySelector(".preset-pic").replaceChildren(h("img", { src: u, alt: "" }));
      });
    }, 500);
  }
  async function copyLook() {
    const d = ED.doc;
    const text = JSON.stringify({ fps: d.fps, boil: d.boil, grade: d.grades[d.grade], post: d.post }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      ED.emit("status", { msg: "Copied the look settings to the clipboard.", tone: "ok" });
    } catch {
      ED.emit("status", { msg: "The browser blocked the clipboard. Save the scene file instead; the look is in it.", tone: "error" });
    }
  }

  function rememberStyle() {
    const it = ED.selItem();
    if (!it || it.el !== "shape") return;
    const { material, colors, rough, fuzz, puff, shadow, grain, specks } = it;
    ED.shapeStyle = D().clone({ material, colors, rough, fuzz, puff, shadow, grain, ...(specks ? { specks } : {}) });
  }

  // ---------- tabs ----------
  const TABS = ["piece", "layer", "look"];
  let current = "piece";
  function moveInk() {
    const tab = document.getElementById(`tab-${current}`), ink = document.querySelector(".tab-ink");
    if (!tab || !ink) return;
    ink.style.width = `${tab.offsetWidth - 16}px`;
    ink.style.transform = `translateX(${tab.offsetLeft + 8}px)`;
  }
  function renderCurrent(opts) {
    if (!ED.doc) return;
    if (current === "piece") renderPiece(opts);
    else if (current === "layer") renderLayer(opts);
    else renderLook(opts);
  }
  function showTab(name, focus) {
    if (!TABS.includes(name)) name = "piece";
    const changed = name !== current;
    current = name;
    for (const t of TABS) {
      const tab = document.getElementById(`tab-${t}`);
      const on = t === name;
      tab.setAttribute("aria-selected", String(on));
      tab.tabIndex = on ? 0 : -1;
      document.getElementById(`pane-${t}`).hidden = !on;
    }
    moveInk();
    if (changed) renderCurrent({ fresh: true });
    if (focus) document.getElementById(`tab-${name}`).focus();
  }
  ED.showTab = showTab;
  function initTabs() {
    TABS.forEach((t, i) => {
      const tab = document.getElementById(`tab-${t}`);
      tab.addEventListener("click", () => showTab(t));
      tab.addEventListener("keydown", (e) => {
        const step = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
        if (e.key === "Home" || e.key === "End") { e.preventDefault(); showTab(TABS[e.key === "Home" ? 0 : 2], true); return; }
        if (!step) return;
        e.preventDefault();
        showTab(TABS[(i + step + TABS.length) % TABS.length], true);
      });
    });
    new ResizeObserver(moveInk).observe(document.querySelector(".tabs"));
    document.fonts && document.fonts.ready.then(moveInk);
  }

  function init() {
    initTabs();
    ED.on("load", () => { lastSel = ""; presetShots = { key: "", urls: {} }; renderCurrent({ fresh: true }); });
    ED.on("select", () => {
      const key = `${ED.sel.layer}/${ED.sel.item}/${ED.sel.group}/${(ED.sel.multi || []).join(",")}`;
      const fresh = key !== lastSel;
      lastSel = key;
      if (fresh) {
        if (ED.hasPieces()) showTab("piece");
        else if (ED.sel.layer) showTab("layer");
      }
      renderCurrent({ fresh });
    });
    ED.on("doc", (e) => {
      if (e && e.preview) { const v = views[current]; if (v) v.refresh(); return; }
      renderCurrent();
    });
    ED.on("restore", () => renderCurrent());
    ED.on("point-edit", () => { if (current === "piece" && ED.selItem()) renderPiece(); });
    ED.on("part-select", () => { if (current === "piece" && ED.selItem()) renderPiece(); });
    ED.on("pose", () => { const L = ED.selLayer(); if (current === "piece" && L && L.cycle && ED.selItem()) renderPiece(); });
    ED.on("history", () => { if (ownCommit) ownCommit = false; else { gEdit = null; if (current === "piece" && views.piece && ED.sel.layer && (ED.sel.group || ED.sel.multi)) views.piece.refresh(); } if (current === "look") schedulePresetShots(); });
    ED.on("synced", () => { if (current === "look") schedulePresetShots(); });
    ED.on("focus-field", () => {
      showTab(ED.hasPieces() ? "piece" : "layer");
      const f = document.querySelector(`#pane-${current} .hero-name`);
      if (f) { f.focus(); f.select(); }
    });
    showTab(prefs.get("tab", "piece"));
    window.addEventListener("beforeunload", () => prefs.set("tab", current));
  }

  // Compatibility for older code paths.
  function makeThumbs() { return LB.STORE.makeThumbs(); }
  LB.PANELS = { init, makeThumbs, showTab, renderPiece, renderLayer, renderLook, kindOf, get tab() { return current; } };
})();
