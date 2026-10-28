/*
  The side panels:

    Layers      front to back, with show/hide, lock, the pieces in each
                layer, drag to reorder, and buttons for the same things
    Store       ready-made pieces and the user's own pictures; click to add
                in the middle of the frame, or drag onto the canvas
    Properties  the selected piece and its layer
    Look        the recipe: beat rate, boil, grade, each post pass, scene
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const D = () => LB.DOC;
  const ACT = () => LB.ACT;
  const $ = (s) => document.querySelector(s);
  const h = (tag, attrs = {}, ...kids) => {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (v !== false && v != null) el.setAttribute(k, v === true ? "" : v);
    }
    el.append(...kids.filter(Boolean));
    return el;
  };
  const ICON = {
    eye: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg>',
    eyeOff: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 3l18 18M10.6 5.1A10 10 0 0 1 12 5c6.4 0 10 7 10 7a17 17 0 0 1-3.2 4M6.1 6.1A17 17 0 0 0 2 12s3.6 7 10 7a9.6 9.6 0 0 0 4.4-1"/></svg>',
    lock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>',
    unlock: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 7.5-2"/></svg>',
    caret: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6l6 6-6 6"/></svg>',
  };

  // ======================= Layers =======================
  const expanded = new Set();
  let dragId = null;

  function renderLayers() {
    const list = $("#layer-list");
    const doc = ED.doc;
    if (ED.sel.layer) expanded.add(ED.sel.layer);
    list.innerHTML = "";
    if (!doc.layers.length) {
      list.append(h("li", { class: "empty", text: "No layers yet. Add one, or pick something from the store." }));
    }
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const L = doc.layers[i];
      const selected = ED.sel.layer === L.id;
      const paint = !L.type;
      const open = paint && L.paint.length > 0 && expanded.has(L.id);
      const row = h("li", { class: `layer-row${selected && !ED.sel.item ? " is-selected" : ""}${selected ? " has-selection" : ""}${L.hidden ? " is-hidden" : ""}`, "data-id": L.id, draggable: "true" });
      const vis = h("button", { class: "icon-btn small", type: "button", "aria-pressed": String(!L.hidden), "aria-label": `${L.hidden ? "Show" : "Hide"} ${L.name}`, title: L.hidden ? "Show layer" : "Hide layer", html: L.hidden ? ICON.eyeOff : ICON.eye,
        onclick: () => ACT().toggle(L.id, "hidden") });
      const caret = paint && L.paint.length
        ? h("button", { class: "icon-btn small caret", type: "button", "aria-expanded": String(open), "aria-label": `${open ? "Collapse" : "Expand"} ${L.name}`, html: ICON.caret,
          onclick: () => { open ? expanded.delete(L.id) : expanded.add(L.id); renderLayers(); } })
        : h("span", { class: "caret-space", "aria-hidden": "true" });
      const name = h("button", { class: "layer-name", type: "button", "aria-current": selected && !ED.sel.item ? "true" : false,
        onclick: () => ED.select(L.id), ondblclick: () => { ED.select(L.id); ED.emit("focus-field", "name"); } },
        h("span", { class: "nm", text: L.name }),
        h("span", { class: "meta", text: `${D().layerKind(L)} · depth ${(L.depth || 0).toFixed(2)}${paint ? ` · ${L.paint.length} piece${L.paint.length === 1 ? "" : "s"}` : ""}` }));
      const lock = h("button", { class: "icon-btn small", type: "button", "aria-pressed": String(!!L.locked), "aria-label": `${L.locked ? "Unlock" : "Lock"} ${L.name}`, title: L.locked ? "Unlock layer" : "Lock layer", html: L.locked ? ICON.lock : ICON.unlock,
        onclick: () => ACT().toggle(L.id, "locked") });
      row.append(caret, vis, name, lock);

      row.addEventListener("dragstart", (e) => { dragId = L.id; e.dataTransfer.setData("text/x-layer", L.id); e.dataTransfer.effectAllowed = "move"; });
      row.addEventListener("dragend", () => { dragId = null; list.querySelectorAll(".drop-above,.drop-below").forEach((r) => r.classList.remove("drop-above", "drop-below")); });
      row.addEventListener("dragover", (e) => {
        if (!dragId) return;
        e.preventDefault();
        const r = row.getBoundingClientRect();
        const above = e.clientY < r.top + r.height / 2;
        row.classList.toggle("drop-above", above);
        row.classList.toggle("drop-below", !above);
      });
      row.addEventListener("dragleave", () => row.classList.remove("drop-above", "drop-below"));
      row.addEventListener("drop", (e) => {
        e.preventDefault();
        if (!dragId || dragId === L.id) return;
        // The list runs front to back, so "above" in the list means later in the layer array.
        const above = row.classList.contains("drop-above");
        ACT().moveLayerTo(dragId, above ? i + 1 : i);
      });
      list.append(row);

      if (open) {
        const sub = h("ul", { class: "item-list", "aria-label": `Pieces in ${L.name}` });
        for (let k = L.paint.length - 1; k >= 0; k--) {
          const item = L.paint[k];
          const on = ED.sel.layer === L.id && ED.sel.item === item.id;
          sub.append(h("li", { class: `item-row${on ? " is-selected" : ""}` },
            h("button", { class: "item-name", type: "button", "aria-current": on ? "true" : false, text: D().itemName(item, ED.doc), onclick: () => ED.select(L.id, item.id) })));
        }
        list.append(h("li", { class: "item-wrap" }, sub));
      }
    }
    const sel = !!ED.sel.layer;
    ["#btn-dup", "#btn-del", "#btn-fwd", "#btn-back"].forEach((s) => ($(s).disabled = !sel));
  }

  // ======================= Store =======================
  let storeCat = "Shapes";
  LB.THUMBS = LB.THUMBS || new Map();

  function storeEntries() {
    return [...LB.LIBRARY.ENTRIES, ...LB.LIBRARY.imageEntries(ED.doc)];
  }
  function renderStore() {
    const cats = $("#store-cats");
    cats.innerHTML = "";
    for (const c of LB.LIBRARY.CATEGORIES) {
      cats.append(h("button", { type: "button", class: "chip", "aria-pressed": String(c === storeCat), text: c, onclick: () => { storeCat = c; renderStore(); } }));
    }
    const grid = $("#store-grid");
    grid.innerHTML = "";
    const list = storeEntries().filter((e) => e.cat === storeCat);
    if (storeCat === "Your images") {
      grid.append(h("p", { class: "store-note", text: "Pictures you import live in the scene file. Photos of your own materials can also fill a shape: pick Photo as its material." }));
      if (!list.length) grid.append(h("p", { class: "store-note", text: "Nothing yet. Use Import picture, or drop image files onto the canvas." }));
    }
    for (const e of list) {
      const thumb = e.image ? ED.doc.images[e.image].src : LB.THUMBS.get(e.id);
      const btn = h("button", { type: "button", class: "store-item", draggable: "true", "data-entry": e.id, title: `${e.name}: ${e.credit}. Click to add it in the middle, or drag it onto the canvas.`,
        onclick: () => ACT().addFromEntry(e, e.fixed ? null : ED.viewCenter()) },
        thumb ? h("img", { src: thumb, alt: "", loading: "lazy" }) : h("span", { class: `thumb-placeholder${e.id === "sparkles" ? " sparkle" : ""}`, "aria-hidden": "true" }),
        h("span", { class: "store-name", text: e.name }),
        h("span", { class: "store-credit", text: e.credit === "Your image" ? "Yours" : "Free" }));
      btn.addEventListener("dragstart", (ev) => { ev.dataTransfer.setData("text/x-entry", e.id); ev.dataTransfer.effectAllowed = "copy"; });
      grid.append(btn);
    }
  }
  LB.findEntry = (id) => storeEntries().find((e) => e.id === id);

  // Renders thumbnails for the store's built-in pieces, one at a time, after the scene is up.
  async function makeThumbs() {
    for (const e of LB.LIBRARY.ENTRIES) {
      if (LB.THUMBS.has(e.id)) continue;
      const made = LB.LIBRARY.make(e, [0.4, 0.4]);
      const layer = made.item ? { id: "thumb", seed: 3, paint: [made.item] } : { id: "thumb", seed: 3, ...made.layer };
      try {
        const img = await ED.renderer.thumbnail(layer, 144, 96, { ...ED.doc, art: null, images: ED.doc.images });
        if (!img) continue;
        const c = document.createElement("canvas");
        c.width = img.width;
        c.height = img.height;
        c.getContext("2d").putImageData(img, 0, 0);
        LB.THUMBS.set(e.id, c.toDataURL("image/png"));
        const slot = document.querySelector(`.store-item[data-entry="${e.id}"] .thumb-placeholder`);
        if (slot) slot.replaceWith(h("img", { src: LB.THUMBS.get(e.id), alt: "" }));
      } catch (err) {
        console.warn("thumbnail", e.id, err);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ======================= Properties =======================
  const DEG = { deg: true, min: -180, max: 180, step: 1, unit: "°" };
  const pct = { min: 0, max: 1, step: 0.01, format: (v) => `${Math.round(v * 100)}%` };
  const opts = (pairs) => () => pairs;
  const imageOptions = () => Object.entries(ED.doc.images).map(([id, im]) => [id, im.name]);

  const XF_FIELDS = (L) => [
    { type: "heading", label: "Placement" },
    { key: "x", label: "Left to right", type: "range", min: -0.3, max: 2.08, step: 0.001,
      get: (it) => LB.ITEMS.position(it, L)[0], set: (it, v) => { const t = LB.ITEMS.xfOf(it); it.xf = { ...t, x: t.x + v - LB.ITEMS.position(it, L)[0] }; } },
    { key: "y", label: "Top to bottom", type: "range", min: -0.3, max: 1.3, step: 0.001,
      get: (it) => LB.ITEMS.position(it, L)[1], set: (it, v) => { const t = LB.ITEMS.xfOf(it); it.xf = { ...t, y: t.y + v - LB.ITEMS.position(it, L)[1] }; } },
    { key: "xf.s", label: "Scale", type: "range", min: 0.1, max: 4, step: 0.01, fallback: 1, format: (v) => `${Math.round(v * 100)}%` },
    { key: "xf.r", label: "Rotation", type: "range", fallback: 0, ...DEG },
  ];

  const SPECK_FIELDS = (defaults) => [
    { key: "specks", label: "Beads or tiny flowers", type: "toggle", get: (it) => !!it.specks, set: (it, v) => { if (v) it.specks = it.specks || D().clone(defaults); else delete it.specks; } },
    { key: "specks.colors.0", label: "Bead color", type: "color", when: (it) => !!it.specks },
    { key: "specks.colors.1", label: "Second bead color", type: "color", when: (it) => !!it.specks },
    { key: "specks.density", label: "How many", type: "range", min: 0.02, max: 0.6, step: 0.01, when: (it) => !!it.specks, ...{ format: (v) => `${Math.round(v * 100)}%` } },
    { key: "specks.scale", label: "Bead size", type: "range", min: 40, max: 300, step: 1, when: (it) => !!it.specks,
      get: (it) => 340 - (it.specks.scale ?? 150), set: (it, v) => (it.specks.scale = 340 - v), format: (v) => Math.round(v) },
  ];
  const BEAD_DEFAULT = { scale: 140, density: 0.2, size: 0.3, colors: ["#F5F2CC", "#FAF8F0"] };

  function itemFields(item, L) {
    const isShape = item.el === "shape";
    const f = [{ key: "name", label: "Name", type: "text", get: (it) => D().itemName(it, ED.doc), set: (it, v) => { if (v.trim()) it.name = v.trim(); else delete it.name; } }, ...XF_FIELDS(L)];
    if (item.poses) f.push({ type: "note", label: `This piece has ${item.poses.length} poses. Moving, scaling or rotating it changes every pose together.` });
    if (isShape) {
      f.push(
        { type: "heading", label: "Shape" },
        { key: "shape", label: "Outline", type: "select", options: opts([["rect", "Rectangle"], ["ellipse", "Ellipse"], ["polygon", "Polygon or star"], ["blob", "Blob (round lobes)"], ["path", "Custom outline (points)"]]),
          set: (it, v) => {
            if (v === "path" && !it.points) {
              const b = LB.ELEMENTS.shape.outline(it);
              it.points = [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]];
            }
            if (v === "blob" && !it.lobes) {
              const w = it.w || 0.3, hh = it.h || 0.2;
              it.lobes = [[-w * 0.25, 0, hh * 0.45], [0, -hh * 0.12, hh * 0.55], [w * 0.25, 0, hh * 0.45]];
            }
            if (v !== "blob" && !it.w) { const b = LB.ELEMENTS.shape.outline(it); it.w = b[2] - b[0]; it.h = b[3] - b[1]; }
            it.shape = v;
          } },
        { key: "w", label: "Width", type: "range", min: 0.01, max: 2.4, step: 0.005, when: (it) => it.shape !== "blob" && it.shape !== "path" },
        { key: "h", label: "Height", type: "range", min: 0.01, max: 1.6, step: 0.005, when: (it) => it.shape !== "blob" && it.shape !== "path" },
        { type: "note", label: (it) => `A cut-out through ${it.points.length} points. Scale and rotate it under Placement. Editing the points themselves comes in a later version.`, when: (it) => it.shape === "path" },
        { key: "round", label: "Round the corners", type: "range", min: 0, max: 0.03, step: 0.0005, fallback: 0, when: (it) => it.shape === "path" },
        { key: "corner", label: "Corner roundness", type: "range", ...pct, when: (it) => it.shape === "rect", fallback: 0.15 },
        { key: "sides", label: "Points", type: "range", min: 3, max: 12, step: 1, when: (it) => it.shape === "polygon", fallback: 5 },
        { key: "star", label: "Star depth", type: "range", ...pct, when: (it) => it.shape === "polygon", fallback: 0 },
        { key: "merge", label: "Lobe blending", type: "range", min: 0, max: 0.08, step: 0.002, when: (it) => it.shape === "blob", fallback: 0.03 },
        { type: "heading", label: "Material" },
        { key: "material", label: "Material", type: "select", options: (it) => [["paper", "Painted paper"], ["felt", "Felt"], ["clay", "Clay"], ["foliage", "Clumped foliage"], ["cardboard", "Cardboard"], ["stripes", "Painted stripes"], ["gradient", "Two-color wash"], ["water", "Painted water"], ["sand", "Sand"], ...(imageOptions().length ? [["photo", "Photo (your picture)"]] : [])],
          set: (it, v) => { it.material = v; if (v === "photo" && !ED.doc.images[it.image]) it.image = imageOptions()[0][0]; } },
        { key: "image", label: "Picture", type: "select", options: imageOptions, when: (it) => it.material === "photo" },
        { key: "tile", label: "Picture tile size", type: "range", min: 0.05, max: 1.5, step: 0.01, when: (it) => it.material === "photo", fallback: 0.4 },
        { key: "tint", label: "Tint toward color", type: "range", ...pct, when: (it) => it.material === "photo", fallback: 0 },
        { key: "colors.0", label: (it) => ({ gradient: "Top color", photo: "Tint color", water: "Far water", sand: "Dry sand, at the top", stripes: "First stripe" }[it.material] || "Color"), type: "color" },
        { key: "colors.1", label: (it) => ({ gradient: "Bottom color", water: "Near water", sand: "Wet sand, at the bottom", stripes: "Second stripe", cardboard: "Flecks" }[it.material] || "Tip color"), type: "color",
          when: (it) => ["gradient", "foliage", "water", "sand", "stripes", "cardboard"].includes(it.material) },
        { key: "stripes.fan", label: "Stripes", type: "select", options: opts([["", "Straight bands"], ["fan", "Fan from a point (umbrellas)"]]), when: (it) => it.material === "stripes",
          get: (it) => (it.stripes && it.stripes.fan ? "fan" : ""), set: (it, v) => {
            const b = LB.ELEMENTS.shape.outline(it);
            it.stripes = v ? { fan: true, count: (it.stripes && it.stripes.count) || 10, center: [(b[0] + b[2]) / 2, b[1]] } : { width: (it.stripes && it.stripes.width) || 0.03 };
          } },
        { key: "stripes.width", label: "Stripe width", type: "range", min: 0.003, max: 0.12, step: 0.001, fallback: 0.03, when: (it) => it.material === "stripes" && !(it.stripes && it.stripes.fan) },
        { key: "stripes.count", label: "Number of stripes", type: "range", min: 2, max: 24, step: 2, fallback: 10, when: (it) => it.material === "stripes" && !!(it.stripes && it.stripes.fan) },
        { key: "grain", label: "Pattern size", type: "range", min: 0.3, max: 3, step: 0.05, fallback: 1, when: (it) => it.material !== "photo",
          hint: "Bigger numbers make the felt, clay and foliage texture finer." },
        { type: "heading", label: "Handmade feel" },
        { key: "rough", label: "Rough cut edge", type: "range", ...pct, fallback: 0.4 },
        { key: "fuzz", label: "Fiber fuzz on the edge", type: "range", ...pct, fallback: 0.3 },
        { key: "puff", label: "Puff (rounded, lit from top left)", type: "range", ...pct, fallback: 0.3 },
        { key: "shadow", label: "Cast shadow", type: "range", ...pct, fallback: 0 },
        ...SPECK_FIELDS(BEAD_DEFAULT),
      );
    } else if (item.el === "image") {
      f.push(
        { type: "heading", label: "Picture" },
        { key: "image", label: "Picture", type: "select", options: imageOptions,
          set: (it, v) => { it.image = v; const im = ED.doc.images[v]; it.h = (it.w * im.h) / im.w; } },
        { key: "w", label: "Width", type: "range", min: 0.02, max: 2.4, step: 0.005,
          set: (it, v) => { const im = ED.doc.images[it.image]; it.w = v; it.h = (v * im.h) / im.w; } },
        { key: "tint", label: "Tint toward color", type: "range", ...pct, fallback: 0 },
        { key: "tintColor", label: "Tint color", type: "color", fallback: "#FFFFFF" },
      );
    } else if (item.el === "canopy") {
      f.push({ type: "heading", label: "Foliage" },
        { key: "colors.0", label: "Shadow", type: "color" }, { key: "colors.1", label: "Middle", type: "color" },
        { key: "colors.2", label: "Light", type: "color" }, { key: "colors.3", label: "Tips", type: "color" },
        { key: "scale", label: "Tuft size", type: "range", min: 20, max: 160, step: 1, get: (it) => 180 - it.scale, set: (it, v) => (it.scale = 180 - v), format: (v) => Math.round(v) },
        ...SPECK_FIELDS({ scale: 120, density: 0.25, size: 0.3, colors: ["#F7F2DA", "#F2DE8A"] }));
    } else if (item.el === "florets") {
      f.push({ type: "heading", label: "Flowers" },
        { key: "colors.0", label: "Petals", type: "color" }, { key: "colors.1", label: "Petal highlights", type: "color" }, { key: "colors.2", label: "Gaps", type: "color" },
        { key: "scale", label: "Flower size", type: "range", min: 60, max: 320, step: 1, get: (it) => 380 - it.scale, set: (it, v) => (it.scale = 380 - v), format: (v) => Math.round(v) });
    } else if (item.el === "trunk") {
      f.push({ type: "heading", label: "Trunk" }, { key: "color", label: "Bark", type: "color" },
        { key: "width", label: "Width", type: "range", min: 0.004, max: 0.12, step: 0.001 },
        { key: "flare", label: "Base flare", type: "range", min: 0, max: 0.1, step: 0.001 },
        { key: "bend", label: "Bend", type: "range", min: -0.05, max: 0.05, step: 0.001 });
    } else if (item.el === "branch") {
      f.push({ type: "heading", label: "Branch" }, { key: "color", label: "Bark", type: "color" },
        { key: "r", label: "Thickness", type: "range", min: 0.003, max: 0.05, step: 0.001 });
    } else if (item.el === "turf") {
      f.push({ type: "heading", label: "Grass" }, { key: "colors.0", label: "Top", type: "color" }, { key: "colors.1", label: "Bottom", type: "color" },
        { key: "style", label: "Surface", type: "select", options: opts([["grass", "Grass"], ["carpet", "Flowered carpet"]]), fallback: "grass" },
        ...SPECK_FIELDS({ scale: 140, density: 0.08, size: 0.3, colors: ["#F8F2D8", "#F2D97A"] }));
    } else if (item.el === "fuzz") {
      f.push({ type: "heading", label: "Felt ball" }, { key: "color", label: "Color", type: "color" },
        { key: "radii.0", label: "Width", type: "range", min: 0.005, max: 0.2, step: 0.001 },
        { key: "radii.1", label: "Height", type: "range", min: 0.005, max: 0.2, step: 0.001 });
    } else if (item.shader) {
      f.push({ type: "note", label: "A bespoke shader from the garden study. You can move, scale and rotate it; its colors live in the study's code." });
    }
    return f;
  }

  const MOTIONS = [["none", "Still"], ["drift", "Drift side to side"], ["sway", "Sway"], ["travel", "Travel across (and loop)"]];
  function layerFields(L) {
    const sprite = L.type === "sprite", sparkles = L.type === "sparkles";
    const f = [
      { key: "name", label: "Layer name", type: "text" },
      { type: "heading", label: "Depth and texture" },
      { key: "depth", label: "Depth (0 far, 1 near)", type: "range", min: 0, max: 1, step: 0.01, hint: "Nearer layers move more when the camera drifts." },
      { key: "far", label: "Soften with distance (depth blur)", type: "toggle" },
      { key: "haze", label: "Haze toward the horizon color", type: "range", min: 0, max: 0.5, step: 0.01, fallback: 0 },
      { key: "boil", label: "Boil (handmade jitter)", type: "range", min: 0, max: 4, step: 0.1, fallback: 1, hint: "How many pixels the layer wobbles each beat, at 1080p." },
      { key: "opacity", label: "Opacity", type: "range", ...pct, fallback: 1 },
      { type: "heading", label: "Motion" },
    ];
    if (L.cycle) {
      const secs = Math.round((L.cycle.frames / L.cycle.rate) * 100) / 100;
      f.push({ type: "note", label: `Pose cycle: ${L.cycle.frames} poses at ${L.cycle.rate} a second, ${secs} seconds round, so it plays ${Math.round((LB.LOOP * L.cycle.rate) / L.cycle.frames)} times a loop. Pieces with poses step between them.` });
    }
    if (L.anim && L.anim.type === "cycle") {
      f.push({ type: "note", label: `Cycles ${L.anim.frames} baked frames at ${L.anim.rate} per second.` });
    } else {
      f.push(
        { key: "anim.type", label: "Motion", type: "select", options: opts(MOTIONS), get: (l) => (l.anim ? l.anim.type : "none"),
          set: (l, v) => {
            if (v === "none") delete l.anim;
            else if (v === "drift") l.anim = { type: "drift", amp: [0.012, 0.002] };
            else if (v === "travel") l.anim = { type: "travel", from: [-2.2, 0], to: [0.4, 0], speed: 1, phase: 0, bob: 0.01, bobs: 3 };
            else l.anim = { type: "sway", amp: 0.04, phase: 0, speed: 1 };
          } },
        { key: "anim.amp.0", label: "Drift distance", type: "range", min: 0, max: 0.06, step: 0.001, when: (l) => l.anim && l.anim.type === "drift" },
        { key: "anim.amp.1", label: "Bob up and down", type: "range", min: 0, max: 0.02, step: 0.0005, when: (l) => l.anim && l.anim.type === "drift" },
        { key: "anim.amp", label: "Sway angle", type: "range", deg: true, min: 0, max: 12, step: 0.1, unit: "°", when: (l) => l.anim && l.anim.type === "sway" },
        { key: "anim.speed", label: "Sways per loop", type: "range", min: 1, max: 4, step: 1, fallback: 1, when: (l) => l.anim && l.anim.type === "sway",
          hint: "Whole numbers, so the motion lands back where it started when the 6-second loop repeats." },
        { key: "anim.phase", label: "Timing offset", type: "range", min: 0, max: 6.28, step: 0.01, when: (l) => l.anim && l.anim.type === "sway", format: (v) => `${Math.round((v / 6.2832) * 100)}%` },
        { key: "anim.speed", label: "Crossings per loop", type: "range", min: 1, max: 4, step: 1, fallback: 1, when: (l) => l.anim && l.anim.type === "travel",
          hint: "It enters at the start point and leaves at the end, then starts over. Keep both ends off screen so the jump back is never seen." },
        { key: "anim.phase", label: "Head start", type: "range", min: 0, max: 0.99, step: 0.01, fallback: 0, when: (l) => l.anim && l.anim.type === "travel", format: (v) => `${Math.round(v * 100)}%` },
        { key: "anim.to.0", label: "How far it travels", type: "range", min: -2.6, max: 2.6, step: 0.01, when: (l) => l.anim && l.anim.type === "travel",
          get: (l) => l.anim.to[0] - l.anim.from[0], set: (l, v) => (l.anim.to[0] = l.anim.from[0] + v) },
        { key: "anim.bob", label: "Bob up and down", type: "range", min: 0, max: 0.04, step: 0.001, fallback: 0, when: (l) => l.anim && l.anim.type === "travel" },
        { key: "pivot", label: "Sway from", type: "select", options: opts([["base", "The bottom edge"], ["center", "The middle"]]), fallback: "base", when: (l) => !sprite && l.anim && l.anim.type === "sway" },
      );
    }
    f.push(
      { type: "heading", label: "Position" },
      { key: "offset.0", label: "Shift left or right", type: "range", min: -1, max: 1, step: 0.001, fallback: 0 },
      { key: "offset.1", label: "Shift up or down", type: "range", min: -0.6, max: 0.6, step: 0.001, fallback: 0 },
    );
    if (sprite) {
      f.push({ type: "heading", label: "Flower" },
        { key: "flower", label: "Kind", type: "select", options: opts([["daisy", "Daisy"], ["tulip", "Tulip"], ["orchid", "Orchid"], ["bloom", "Open bloom"], ["", "Leaf"]]),
          get: (l) => l.flower || "", set: (l, v) => { if (v) l.flower = v; else delete l.flower; } },
        { key: "colors.0", label: (l) => (l.flower ? "Petal shadow" : "Leaf shadow"), type: "color" },
        { key: "colors.1", label: (l) => (l.flower ? "Petal" : "Leaf"), type: "color" },
        { key: "colors.2", label: (l) => (l.flower ? "Petal light" : "Leaf light"), type: "color" },
        { key: "size", label: "Size", type: "range", min: 0.006, max: 0.14, step: 0.001 },
        { key: "tilt", label: "Head turn", type: "range", min: -1.5, max: 1.5, step: 0.01, fallback: 0 },
        { key: "c.0", label: "Stem lean", type: "range", min: -0.25, max: 0.25, step: 0.001,
          get: (l) => l.c[0] - l.a[0], set: (l, v) => { l.c[0] = l.a[0] + v; l.b[0] = l.a[0] + v * 0.35; } },
        { key: "c.1", label: "Stem height", type: "range", min: 0.04, max: 0.6, step: 0.001,
          get: (l) => l.a[1] - l.c[1], set: (l, v) => { l.c[1] = l.a[1] - v; l.b[1] = l.a[1] - v * 0.6; } });
    }
    if (sparkles) {
      f.push({ type: "heading", label: "Sparkles" },
        { key: "count", label: "How many", type: "range", min: 1, max: 80, step: 1 },
        { key: "size", label: "Size", type: "range", min: 0.001, max: 0.02, step: 0.0005 },
        { key: "color", label: "Color", type: "color" });
    }
    return f;
  }

  let propsView = null;
  function renderProps(focusKey) {
    const pane = $("#pane-props");
    pane.innerHTML = "";
    propsView = null;
    const L = ED.selLayer();
    if (!L) {
      pane.append(
        h("h2", { class: "pane-title", text: "Nothing selected" }),
        h("p", { class: "pane-note", text: "Click a piece on the canvas or a layer in the list. To make something, draw with a shape tool in the toolbar, or add a piece from the store." }),
        h("h3", { class: "field-heading", text: "How depth works" }),
        h("p", { class: "pane-note", text: "Each layer is a flat plane at a depth, like a multiplane camera. The camera drifts a little every loop, so near layers slide further than far ones. Everything steps on the stop-motion beat and wobbles slightly (boil)." }),
      );
      return;
    }
    const item = ED.selItem();
    const views = [];
    const ctx = (target, kind) => ({
      target,
      onInput: (def) => { ED.preview(() => {}); if (def.key === "name") ED.emit("names"); if (kind === "item" && ED.selItem() && ED.selItem().el === "shape") rememberStyle(); },
      onCommit: (label, def) => { ED.commit(`${label}`); if (def.type === "select" || def.type === "toggle") renderProps(def.key); },
    });
    if (item) {
      const sec = h("section", { class: "prop-section", "aria-labelledby": "item-h" });
      sec.append(
        h("h2", { class: "pane-title", id: "item-h", text: D().itemName(item, ED.doc) }),
        h("p", { class: "pane-sub", text: `In layer ${L.name}` }));
      const actions = h("div", { class: "prop-actions" },
        h("button", { type: "button", class: "btn-small", text: "Duplicate", onclick: () => ACT().duplicate() }),
        h("button", { type: "button", class: "btn-small", text: "Forward", title: "Bring forward within the layer", onclick: () => ACT().restack(1) }),
        h("button", { type: "button", class: "btn-small", text: "Backward", title: "Send backward within the layer", onclick: () => ACT().restack(-1) }),
        h("button", { type: "button", class: "btn-small danger", text: "Delete", onclick: () => ACT().remove() }));
      sec.append(actions);
      const others = ED.doc.layers.filter((l) => !l.type && l.id !== L.id);
      if (others.length) {
        const id = "move-to";
        const sel = h("select", { id }, h("option", { value: "", text: "Choose a layer…" }), ...[...others].reverse().map((l) => h("option", { value: l.id, text: l.name })));
        sel.addEventListener("change", () => sel.value && ACT().moveItemToLayer(sel.value));
        sec.append(h("div", { class: "field field-select" }, h("label", { for: id, text: "Move to layer" }), sel));
      }
      const body = h("div");
      sec.append(body);
      pane.append(sec);
      views.push(LB.FIELDS.build(body, itemFields(item, L), ctx(() => ED.selItem(), "item")));
    }
    const lsec = h("section", { class: `prop-section${item ? " is-secondary" : ""}`, "aria-labelledby": "layer-h" });
    lsec.append(h("h2", { class: "pane-title", id: "layer-h", text: item ? `Layer: ${L.name}` : L.name }));
    if (L.locked) lsec.append(h("p", { class: "pane-note", text: "This layer is locked, so it can't be moved on the canvas. Its settings still work here." }));
    const lbody = h("div");
    lsec.append(lbody);
    pane.append(lsec);
    views.push(LB.FIELDS.build(lbody, layerFields(L), ctx(() => ED.selLayer(), "layer")));
    propsView = { refresh: () => views.forEach((v) => v.refresh()) };
    // A rebuild (a control that shows or hides others) keeps keyboard focus where it was.
    if (focusKey) { const el = pane.querySelector(`[data-key="${focusKey}"]`); if (el) el.focus(); }
  }

  function rememberStyle() {
    const it = ED.selItem();
    if (!it || it.el !== "shape") return;
    const { material, colors, rough, fuzz, puff, shadow, grain, specks } = it;
    ED.shapeStyle = D().clone({ material, colors, rough, fuzz, puff, shadow, grain, ...(specks ? { specks } : {}) });
  }

  // ======================= Look =======================
  const grade = (key) => ({ get: (d) => d.grades[d.grade][key], set: (d, v) => (d.grades[d.grade][key] = v) });
  const passToggle = (name, label) => ({ key: `post.on.${name}`, label, type: "toggle" });
  function lookFields() {
    return [
      { type: "heading", label: "Preset" },
      { key: "preset", label: "Start from a look", type: "select",
        options: () => [["", "Choose a preset…"], ...Object.entries(D().PRESETS).map(([k, p]) => [k, p.name])],
        get: () => "", set: (d, v) => {
          if (!v) return;
          const p = D().PRESETS[v];
          d.grades[v] = D().clone(p.grade);
          d.grade = v;
          const on = d.post.on;
          d.post = { ...D().clone(p.post), on };
          ED.emit("status", { msg: `Applied the ${p.name} look. ${p.note}` });
        } },
      { type: "heading", label: "Stop motion" },
      { key: "fps", label: "Beat rate", type: "select", numeric: true, options: opts([["12", "12 per second (on 2s)"], ["8", "8 per second (on 3s)"], ["6", "6 per second (on 4s)"]]),
        hint: "How often poses change. Everything still loops every 6 seconds." },
      { key: "boil", label: "Boil, whole scene", type: "range", min: 0, max: 2, step: 0.05, format: (v) => `${Math.round(v * 100)}%` },
      { type: "heading", label: "Grade" },
      passToggle("grade", "Color grade on"),
      { key: "g.exposure", label: "Exposure", type: "range", min: -1, max: 1, step: 0.01, ...grade("exposure") },
      { key: "g.temperature", label: "Warmth", type: "range", min: -1, max: 1, step: 0.01, ...grade("temperature") },
      { key: "g.tint", label: "Tint (green to magenta)", type: "range", min: -0.5, max: 0.5, step: 0.01, ...grade("tint") },
      { key: "g.contrast", label: "Contrast", type: "range", min: 0.5, max: 1.8, step: 0.01, ...grade("contrast") },
      { key: "g.saturation", label: "Saturation", type: "range", min: 0, max: 2, step: 0.01, ...grade("saturation") },
      { key: "g.floor", label: "Darkest color (lifted blacks)", type: "color", ...grade("floor") },
      { key: "g.split", label: "Split toning", type: "range", min: 0, max: 1, step: 0.01, ...grade("split") },
      { key: "g.shadowTint", label: "Shadow tint", type: "color", ...grade("shadowTint") },
      { key: "g.highlightTint", label: "Highlight tint", type: "color", ...grade("highlightTint") },
      { type: "heading", label: "Haze and glow" },
      passToggle("depth", "Depth softness on far layers"),
      { key: "post.depth.radius", label: "Depth blur", type: "range", min: 0, max: 4, step: 0.05 },
      passToggle("bloom", "Bloom and mist"),
      { key: "post.bloom.glow", label: "Glow on highlights", type: "range", min: 0, max: 1.6, step: 0.01 },
      { key: "post.bloom.threshold", label: "Glow starts at", type: "range", min: 0, max: 1, step: 0.01 },
      { key: "post.bloom.mist", label: "Mist over everything", type: "range", min: 0, max: 0.8, step: 0.01 },
      passToggle("halation", "Halation (warm fringe)"),
      { key: "post.halation.amount", label: "Halation", type: "range", min: 0, max: 1.5, step: 0.01 },
      { key: "post.halation.color", label: "Halation color", type: "color" },
      { type: "heading", label: "Lens and film" },
      passToggle("ca", "Chromatic aberration"),
      { key: "post.ca.amount", label: "Color fringing", type: "range", min: 0, max: 0.003, step: 0.0001, format: (v) => (v * 1000).toFixed(1) },
      passToggle("vignette", "Vignette"),
      { key: "post.vignette.amount", label: "Vignette", type: "range", min: 0, max: 1, step: 0.01 },
      { key: "post.vignette.color", label: "Vignette color", type: "color" },
      passToggle("grain", "Grain"),
      { key: "post.grain.amount", label: "Grain", type: "range", min: 0, max: 0.12, step: 0.002 },
      { key: "post.grain.perFrame", label: "Grain changes every frame, not every beat", type: "toggle" },
      { type: "heading", label: "Scene" },
      { key: "background", label: "Behind everything", type: "color" },
      { key: "horizon", label: "Horizon haze color", type: "color" },
      { key: "camera.drift.0", label: "Camera drift, side to side", type: "range", min: 0, max: 0.03, step: 0.0005 },
      { key: "camera.drift.1", label: "Camera drift, up and down", type: "range", min: 0, max: 0.015, step: 0.0005 },
      { key: "focus.0", label: "Phone crop centers on", type: "range", min: 0, max: 16 / 9, step: 0.01, format: (v) => `${Math.round((v / (16 / 9)) * 100)}% across`,
        hint: "Tall screens show a slice of the 16:9 scene. Switch the preview to Phone to see it." },
    ];
  }

  let lookView = null;
  function renderLook() {
    const pane = $("#pane-look");
    pane.innerHTML = "";
    pane.append(h("h2", { class: "pane-title", text: "Look" }),
      h("p", { class: "pane-note", text: "The recipe behind the handmade feel. Turn passes off one at a time to see what each one adds." }));
    const body = h("div");
    pane.append(body);
    lookView = LB.FIELDS.build(body, lookFields(), {
      target: () => ED.doc,
      onInput: () => ED.preview(() => {}),
      onCommit: (label, def) => { ED.commit(`Look: ${label}`); if (def.key === "preset") { renderLook(); const el = document.querySelector('#pane-look [data-key="preset"]'); if (el) el.focus(); } },
    });
    pane.append(h("div", { class: "prop-actions" }, h("button", { type: "button", class: "btn-small", text: "Copy settings as JSON", onclick: copyLook })));
  }
  async function copyLook() {
    const d = ED.doc;
    const text = JSON.stringify({ fps: d.fps, boil: d.boil, grade: d.grades[d.grade], post: d.post }, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      ED.emit("status", { msg: "Copied the look settings to the clipboard." });
    } catch {
      ED.emit("status", { msg: "The browser blocked the clipboard. Save the scene file instead; the look is in it.", tone: "error" });
    }
  }

  // ======================= Tabs =======================
  function initTabs() {
    const tabs = [...document.querySelectorAll('[role="tab"]')];
    const show = (tab) => {
      tabs.forEach((t) => {
        const on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    };
    tabs.forEach((t, i) => {
      t.addEventListener("click", () => show(t));
      t.addEventListener("keydown", (e) => {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
        const n = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
        show(n);
        n.focus();
      });
    });
    ED.showTab = (name) => show(document.getElementById(`tab-${name}`));
  }

  function init() {
    initTabs();
    $("#btn-add-layer").addEventListener("click", () => ACT().addLayer());
    $("#btn-dup").addEventListener("click", () => ACT().duplicate());
    $("#btn-del").addEventListener("click", () => ACT().remove());
    $("#btn-fwd").addEventListener("click", () => ACT().restack(1));
    $("#btn-back").addEventListener("click", () => ACT().restack(-1));

    ED.on("load", () => { expanded.clear(); renderLook(); renderStore(); });
    ED.on("select", () => { renderLayers(); renderProps(); });
    ED.on("doc", (e) => {
      if (e && e.preview) { if (propsView) propsView.refresh(); if (lookView) lookView.refresh(); return; }
      renderLayers();
      if (propsView) propsView.refresh();
      if (lookView) lookView.refresh();
    });
    ED.on("names", renderLayers);
    ED.on("images", renderStore);
    ED.on("restore", () => { renderLook(); renderProps(); });
    ED.on("focus-field", () => { ED.showTab("props"); const f = document.querySelector("#pane-props input[type=text]"); if (f) { f.focus(); f.select(); } });
    ED.on("select", () => { if (ED.sel.layer) ED.showTab("props"); });
  }

  LB.PANELS = { init, makeThumbs, renderStore, renderLayers };
})();
