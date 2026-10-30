/*
  The editor's document: a scene file plus the editing state around it.

  A scene file is plain JSON (docs/SCENE-FORMAT.md). It's the same shape the
  study's js/scenes/garden.js uses, plus a few fields the editor adds:
  layer names, hidden/locked flags, offsets, opacity, seeds, item ids and
  item transforms, and an "images" table for pictures the user imported.

  Everything that changes the document goes through ED.change() or
  ED.preview(), so the canvas, the panels, undo and autosave all hear
  about it the same way.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const FORMAT = "elaborate-backgrounds/scene";
  const VERSION = 1;
  const A = 16 / 9;
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // ---------- look presets ----------
  const BASE_POST = {
    depth: { radius: 1.2 },
    bloom: { glow: 0.7, threshold: 0.5, mist: 0.3, radius: 0.85 },
    halation: { amount: 0.4, threshold: 0.55, color: "#FF7340" },
    ca: { amount: 0.0004 },
    vignette: { amount: 0.3, color: "#E0A890" },
    grain: { amount: 0.028, perFrame: false },
  };
  const ALL_ON = { depth: true, bloom: true, halation: true, grade: true, ca: true, vignette: true, grain: true };

  const PRESETS = {
    warm: {
      name: "Warm dream",
      note: "The garden study's look: gold highlights, rose blacks, plenty of mist.",
      grade: { exposure: 0.2, temperature: 0.6, tint: 0.12, contrast: 1.03, saturation: 1.45, floor: "#2E1A30", whiteCap: 0.98, redCap: 1.0, shadowTint: "#8A4E7E", highlightTint: "#FFE0B0", split: 0.3 },
      post: BASE_POST,
    },
    measured: {
      name: "Measured",
      note: "Matched to the numbers measured from the reference frames: cool, contrasty, little haze.",
      grade: { exposure: -0.22, temperature: -0.15, tint: 0.0, contrast: 1.4, saturation: 1.0, floor: "#13181D", whiteCap: 1.0, redCap: 0.85, shadowTint: "#1C2430", highlightTint: "#FFFFFF", split: 0.1 },
      post: { ...BASE_POST, bloom: { ...BASE_POST.bloom, glow: 0.35, mist: 0.14 }, halation: { ...BASE_POST.halation, amount: 0 }, vignette: { amount: 0.12, color: "#888888" } },
    },
    clean: {
      name: "Clean",
      note: "Almost no grade: the colors you pick, with a little glow and grain.",
      grade: { exposure: 0, temperature: 0, tint: 0, contrast: 1, saturation: 1, floor: "#000000", whiteCap: 1, redCap: 1, shadowTint: "#808080", highlightTint: "#FFFFFF", split: 0 },
      post: { ...BASE_POST, bloom: { ...BASE_POST.bloom, glow: 0.3, mist: 0.08 }, halation: { ...BASE_POST.halation, amount: 0 }, ca: { amount: 0 }, vignette: { amount: 0.12, color: "#555555" }, grain: { amount: 0.02, perFrame: false } },
    },
    sunny: {
      name: "Sunny day",
      note: "Bright and warm: golden highlights, lilac shadows, a soft haze and a little grain.",
      grade: { exposure: 0.1, temperature: 0.3, tint: 0.03, contrast: 1.08, saturation: 1.25, floor: "#382630", whiteCap: 0.985, redCap: 1, shadowTint: "#6E5C96", highlightTint: "#FFE6B8", split: 0.26 },
      post: { depth: { radius: 1.0 }, bloom: { glow: 0.55, threshold: 0.62, mist: 0.24, radius: 0.85 }, halation: { amount: 0.3, threshold: 0.6, color: "#FF8A50" },
        ca: { amount: 0.0004 }, vignette: { amount: 0.26, color: "#E8B088" }, grain: { amount: 0.032, perFrame: false } },
    },
    moonlit: {
      name: "Moonlit",
      note: "A night grade: blue shadows, pale highlights, a cold glow.",
      grade: { exposure: -0.15, temperature: -0.7, tint: 0.06, contrast: 1.12, saturation: 0.85, floor: "#0E1428", whiteCap: 0.94, redCap: 0.9, shadowTint: "#2A3A6A", highlightTint: "#D6E4FF", split: 0.35 },
      post: { ...BASE_POST, bloom: { glow: 0.8, threshold: 0.42, mist: 0.24, radius: 0.85 }, halation: { amount: 0.25, threshold: 0.5, color: "#7FA0FF" }, vignette: { amount: 0.4, color: "#1C2440" } },
    },
  };

  // ---------- ids and names ----------
  const rand36 = () => Math.random().toString(36).slice(2, 7);
  function uid(prefix, taken) {
    let id;
    do id = `${prefix}-${rand36()}`; while (taken && taken.has(id));
    return id;
  }
  const titleCase = (id) => String(id).replace(/[-_]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

  const ITEM_NAMES = { canopy: "Foliage clump", florets: "Flower cluster", trunk: "Trunk", branch: "Branch", turf: "Grass bank", fuzz: "Felt ball", clay: "3D piece" };
  const SHAPE_NAMES = { rect: "rectangle", ellipse: "ellipse", polygon: "polygon", blob: "blob", path: "cut-out" };
  function itemName(item, doc) {
    if (item.name) return item.name;
    if (item.shader) return `${titleCase(item.shader)} (study art)`;
    if (item.el === "shape" && item.shape === "mask") {
      const im = doc && doc.images[item.image];
      return `Cut-out of ${im ? im.name : "a picture"}`;
    }
    if (item.el === "shape") {
      const kind = item.shape === "polygon" && item.star > 0.05 ? "star" : item.shape === "polygon" && item.sides === 3 ? "triangle" : SHAPE_NAMES[item.shape] || "shape";
      if (item.material === "stripes") return `Striped ${kind}`;
      return `${titleCase(item.material || "paper")} ${kind}`;
    }
    if (item.el === "image") return (doc && doc.images[item.image] && doc.images[item.image].name) || "Image";
    return ITEM_NAMES[item.el] || titleCase(item.el);
  }
  function layerKind(L) {
    if (L.type === "sprite") return L.flower ? titleCase(L.flower) : "Leaf";
    if (L.type === "sparkles") return "Sparkles";
    return "Layer";
  }

  // ---------- creating and checking documents ----------
  // Screen shapes a scene can be made in. Scene units are always 1 tall, so x runs 0 to the aspect.
  const ASPECTS = [
    [16 / 9, "Desktop, 16:9"], [21 / 9, "Ultrawide, 21:9"], [16 / 10, "Laptop, 16:10"], [1, "Square, 1:1"], [9 / 19.5, "Phone, tall"],
  ];
  function blankDoc(aspect = A) {
    const preset = PRESETS.warm;
    return normalize({
      format: FORMAT, version: VERSION,
      title: "Untitled scene",
      aspect, focus: [aspect / 2, 0.5],
      horizon: "#CDB8F5", background: "#1A1420",
      camera: { drift: [0.008, 0.003] },
      fps: 12, boil: 1,
      layers: [
        { id: "backdrop", name: "Backdrop", depth: 0, far: true, boil: 0.4, seed: 1, paint: [
          { el: "shape", shape: "rect", w: aspect + 0.45, h: 1.4, material: "gradient", colors: ["#B9D3EE", "#E6C3E4"], rough: 0, fuzz: 0, puff: 0, shadow: 0, corner: 0, xf: { x: aspect / 2, y: 0.5, s: 1, r: 0 } },
        ] },
      ],
      post: clone(preset.post),
      grades: { warm: clone(preset.grade) },
      grade: "warm",
      images: {},
    }).doc;
  }

  function fromBeach() {
    return normalize(LB.scenes.beach()).doc;
  }

  // Lilac Falls, the project's own scene (the landing page).
  function fromLilac() {
    return normalize(LB.scenes.lilac()).doc;
  }

  function fromStudy() {
    const g = clone(LB.scenes.garden);
    g.title = "Garden study";
    g.note = "The study of the reference backdrop, by Tamara. Procedural art, code by Claude.";
    g.fps = 12;
    g.boil = 1;
    // The measured grade carries its own post settings; keep the default (warm) post on the scene.
    return normalize(g).doc;
  }

  const num = (v, d, lo = -Infinity, hi = Infinity) => (typeof v === "number" && isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
  const isHex = (s) => typeof s === "string" && /^#[0-9a-f]{6}$/i.test(s);

  // Checks a scene from a file (or a template), fills in defaults and drops what can't be drawn.
  // Returns { doc, warnings }; throws when the file isn't a scene at all.
  function normalize(raw) {
    if (!raw || typeof raw !== "object" || !Array.isArray(raw.layers)) throw new Error("This file isn't a scene: it has no list of layers.");
    if (raw.version && raw.version > VERSION) throw new Error(`This scene was saved by a newer version of the editor (format ${raw.version}).`);
    const warnings = [];
    const d = clone(raw);
    d.format = FORMAT;
    d.version = VERSION;
    d.title = typeof d.title === "string" && d.title.trim() ? d.title.trim().slice(0, 80) : "Untitled scene";
    d.aspect = num(d.aspect, A, 0.4, 2.6);
    d.focus = Array.isArray(d.focus) ? [num(d.focus[0], d.aspect / 2, 0, d.aspect), num(d.focus[1], 0.5, 0, 1)] : [d.aspect / 2, 0.5];
    d.horizon = isHex(d.horizon) ? d.horizon : "#CDB8F5";
    d.background = isHex(d.background) ? d.background : "#000000";
    d.camera = { drift: Array.isArray(d.camera && d.camera.drift) ? [num(d.camera.drift[0], 0.008, 0, 0.1), num(d.camera.drift[1], 0.003, 0, 0.1)] : [0.008, 0.003] };
    d.fps = [12, 8, 6].includes(d.fps) ? d.fps : 12;
    d.boil = num(d.boil, 1, 0, 3);
    d.images = d.images && typeof d.images === "object" ? d.images : {};
    for (const [k, v] of Object.entries(d.images)) {
      if (!v || typeof v.src !== "string" || !v.src.startsWith("data:image/")) { delete d.images[k]; warnings.push(`Image "${k}" was left out: it isn't an embedded picture.`); }
    }

    // Look: post settings and grades, with every pass present.
    const post = clone(BASE_POST);
    for (const k of Object.keys(post)) if (d.post && d.post[k]) Object.assign(post[k], d.post[k]);
    post.on = { ...ALL_ON, ...((d.post && d.post.on) || {}) };
    d.post = post;
    if (!d.grades || typeof d.grades !== "object" || !Object.keys(d.grades).length) d.grades = { warm: clone(PRESETS.warm.grade) };
    for (const k of Object.keys(d.grades)) d.grades[k] = { ...PRESETS.clean.grade, ...d.grades[k] };
    if (!d.grades[d.grade]) d.grade = Object.keys(d.grades)[0];

    const art = d.art && LB.art && LB.art[d.art];
    if (d.art && !art) warnings.push(`This scene uses the "${d.art}" art pack, which isn't loaded. Its bespoke pieces were left out.`);
    const layerIds = new Set();
    d.layers = d.layers.filter((L, i) => {
      if (!L || typeof L !== "object") return false;
      if (!L.id || layerIds.has(L.id)) L.id = uid("layer", layerIds);
      layerIds.add(L.id);
      L.name = typeof L.name === "string" && L.name.trim() ? L.name.trim().slice(0, 60) : titleCase(L.id);
      L.depth = num(L.depth, 0.5, 0, 1);
      L.boil = num(L.boil, 1, 0, 4);
      L.seed = num(L.seed, i, 0, 1e6);
      if (L.anim && L.anim.type === "travel" && !(Array.isArray(L.anim.from) && Array.isArray(L.anim.to))) {
        warnings.push(`"${L.name}" lost its travel motion: it needs a start and an end.`);
        delete L.anim;
      }
      if (L.cycle) {
        // A pose cycle has to fit the 6-second loop a whole number of times, or the loop would jump.
        const f = Math.round(num(L.cycle.frames, 0, 0, 48)), r = num(L.cycle.rate, 0, 0, 24);
        if (f < 1 || !(r > 0) || Math.abs(((LB.LOOP * r) / f) - Math.round((LB.LOOP * r) / f)) > 1e-6) {
          warnings.push(`"${L.name}" lost its pose cycle: ${f} poses at ${r} per second doesn't fit the 6-second loop evenly.`);
          delete L.cycle;
        } else L.cycle = { frames: f, rate: r };
      }
      if (L.type === "sprite") {
        if (![L.a, L.b, L.c].every((p) => Array.isArray(p) && p.length === 2) || !Array.isArray(L.colors)) { warnings.push(`Layer "${L.name}" was left out: its flower is missing its stem points or colors.`); return false; }
        if (L.flower && !["daisy", "tulip", "orchid", "bloom"].includes(L.flower)) L.flower = "bloom";
        L.size = num(L.size, 0.03, 0.004, 0.3);
        return true;
      }
      if (L.type === "sparkles") {
        L.area = Array.isArray(L.area) && L.area.length === 4 ? L.area : [0.4, 0.1, 1.4, 0.4];
        L.count = Math.round(num(L.count, 18, 1, 200));
        L.size = num(L.size, 0.0045, 0.001, 0.05);
        L.color = isHex(L.color) ? L.color : "#FFF8E6";
        return true;
      }
      delete L.type;
      const itemIds = new Set();
      L.paint = (Array.isArray(L.paint) ? L.paint : []).filter((item) => {
        if (!item || typeof item !== "object") return false;
        if (item.shader ? !(art && art.bakes[item.shader]) : !(item.el && LB.ELEMENTS[item.el])) {
          warnings.push(`A piece in "${L.name}" was left out: nothing draws "${item.shader || item.el}".`);
          return false;
        }
        if ((item.el === "image" || (item.el === "shape" && (item.material === "photo" || item.shape === "mask"))) && !d.images[item.image]) {
          if (item.el === "image" || item.shape === "mask") { warnings.push(`A picture piece in "${L.name}" was left out: its picture is missing.`); return false; }
          item.material = "paper";
        }
        if (item.boilImages) {
          item.boilImages = item.boilImages.filter((id) => d.images[id]).slice(0, 2);
          if (!item.boilImages.length) delete item.boilImages;
        }
        if (item.el === "clay") {
          const v3 = (v) => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === "number" && isFinite(x));
          item.parts = (Array.isArray(item.parts) ? item.parts : []).filter((pt) => pt && LB.CLAY.KINDS.includes(pt.kind) && v3(pt.at) && (pt.kind !== "capsule" || v3(pt.to))).slice(0, LB.CLAY.MAX);
          if (!item.parts.length) { warnings.push(`A 3D piece in "${L.name}" was left out: it has no parts that can be drawn.`); return false; }
        }
        if (!item.id || itemIds.has(item.id)) item.id = uid("item", itemIds);
        itemIds.add(item.id);
        return true;
      });
      // Groups: named sets of pieces inside the layer, moved and selected as one object.
      const groups = L.groups && typeof L.groups === "object" ? L.groups : {};
      for (const item of L.paint) {
        if (item.group == null) continue;
        if (typeof item.group !== "string") { delete item.group; continue; }
        if (!groups[item.group] || typeof groups[item.group] !== "object") groups[item.group] = { name: "Group" };
      }
      for (const [gid, g] of Object.entries(groups)) {
        if (!L.paint.some((it) => it.group === gid)) { delete groups[gid]; continue; }
        g.name = typeof g.name === "string" && g.name.trim() ? g.name.trim().slice(0, 60) : "Group";
      }
      if (Object.keys(groups).length) L.groups = groups; else delete L.groups;
      return true;
    });
    return { doc: d, warnings };
  }

  function serialize(doc) {
    // Drop images nothing uses, so a saved file only carries what it needs.
    const used = new Set();
    for (const L of doc.layers) for (const item of L.paint || []) LB.ITEMS.images(item).forEach((id) => used.add(id));
    const out = clone({ ...doc, images: {} });
    for (const id of used) if (doc.images[id]) out.images[id] = doc.images[id];
    return JSON.stringify(out, null, 1);
  }

  // ---------- the editor state ----------
  const ED = (LB.ED = {
    doc: null,
    sel: { layer: null, item: null },
    listeners: {},
    on(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    emit(ev, data) { (this.listeners[ev] || []).forEach((fn) => fn(data)); },

    layer(id) { return this.doc.layers.find((L) => L.id === id) || null; },
    item(layerId, itemId) {
      const L = this.layer(layerId);
      return (L && L.paint && L.paint.find((i) => i.id === itemId)) || null;
    },
    selLayer() { return this.sel.layer ? this.layer(this.sel.layer) : null; },
    selItem() { return this.sel.item ? this.item(this.sel.layer, this.sel.item) : null; },
    layerIds() { return new Set(this.doc.layers.map((L) => L.id)); },

    // A selection is a layer, plus at most one of: a piece, a group of pieces, or several pieces.
    select(layer, item = null) {
      this.sel = { layer: layer || null, item: (layer && item) || null, group: null, multi: null };
      this.emit("select", this.sel);
    },
    selectGroup(layer, group) {
      this.sel = { layer, item: null, group, multi: null };
      this.emit("select", this.sel);
    },
    selectMany(layer, ids) {
      if (ids.length === 1) return this.select(layer, ids[0]);
      if (!ids.length) return this.select(layer);
      this.sel = { layer, item: null, group: null, multi: ids.slice() };
      this.emit("select", this.sel);
    },
    selGroup() {
      const L = this.selLayer();
      const g = L && this.sel.group && L.groups && L.groups[this.sel.group];
      return g ? { id: this.sel.group, ...g } : null;
    },
    // The pieces the selection covers: one, a group's, or several.
    selMembers() {
      const L = this.selLayer();
      if (!L || !L.paint) return [];
      if (this.sel.item) { const it = this.selItem(); return it ? [it] : []; }
      if (this.sel.group) return L.paint.filter((it) => it.group === this.sel.group);
      if (this.sel.multi) return L.paint.filter((it) => this.sel.multi.includes(it.id));
      return [];
    },
    // True when the selection is pieces rather than a whole layer.
    hasPieces() { return !!(this.sel.item || this.sel.group || this.sel.multi); },

    // A change that's done: apply it, redraw, and record it for undo.
    change(fn, label) {
      fn(this.doc);
      this.emit("doc", { label });
      history.commit(label);
    },
    // A change still in progress (a drag, a slider being moved): redraw, but don't record it yet.
    preview(fn) {
      fn(this.doc);
      this.emit("doc", { preview: true });
    },
    // Records whatever previews happened since the last record.
    commit(label) { history.commit(label); },

    load(doc, label) {
      this.doc = doc;
      history.reset();
      this.sel = { layer: null, item: null, group: null, multi: null };
      this.emit("load", { label });
      this.emit("select", this.sel);
      this.emit("doc", { label });
    },
  });

  // ---------- undo ----------
  // Snapshots of the document without its images (those are only ever added during a session).
  const history = {
    stack: [], index: -1, limit: 120,
    snap() { return JSON.stringify({ ...ED.doc, images: undefined }); },
    reset() { this.stack = [{ s: this.snap(), label: "Open" }]; this.index = 0; ED.emit("history"); },
    commit(label) {
      const s = this.snap();
      if (this.stack[this.index] && this.stack[this.index].s === s) return;
      this.stack.length = this.index + 1;
      this.stack.push({ s, label: label || "Edit" });
      if (this.stack.length > this.limit) this.stack.shift();
      this.index = this.stack.length - 1;
      ED.emit("history");
      ED.emit("saved-state", "dirty");
    },
    go(step) {
      const j = this.index + step;
      if (j < 0 || j >= this.stack.length) return null;
      const label = step < 0 ? this.stack[this.index].label : this.stack[j].label;
      this.index = j;
      ED.doc = { ...JSON.parse(this.stack[j].s), images: ED.doc.images };
      // Keep the selection if it still exists.
      if (ED.sel.layer && !ED.selLayer()) ED.sel = { layer: null, item: null, group: null, multi: null };
      if (ED.sel.item && !ED.selItem()) ED.sel.item = null;
      if (ED.sel.group && !ED.selGroup()) ED.sel.group = null;
      if (ED.sel.multi) { const ids = new Set(((ED.selLayer() || {}).paint || []).map((it) => it.id)); ED.sel.multi = ED.sel.multi.filter((id) => ids.has(id)); if (ED.sel.multi.length < 2) ED.sel.multi = null; }
      ED.emit("doc", { label });
      ED.emit("select", ED.sel);
      ED.emit("restore");
      ED.emit("history");
      ED.emit("saved-state", "dirty");
      return label;
    },
    get canUndo() { return this.index > 0; },
    get canRedo() { return this.index < this.stack.length - 1; },
    get undoLabel() { return this.canUndo ? this.stack[this.index].label : ""; },
    get redoLabel() { return this.canRedo ? this.stack[this.index + 1].label : ""; },
  };
  ED.history = history;

  // ---------- autosave (IndexedDB; a scene with photos can be several MB) ----------
  const DB = "elaborate-backgrounds", STORE = "scenes", KEY = "current";
  // Version 2 adds "pieces" (My pieces) and "packs" (installed pack files).
  function idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, 2);
      req.onupgradeneeded = () => {
        for (const name of [STORE, "pieces", "packs"]) if (!req.result.objectStoreNames.contains(name)) req.result.createObjectStore(name);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  // "key" is "current" for the autosave, or "previous" for the scene kept aside when a sample is opened from the landing page.
  async function saveLocal(doc, key = KEY) {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(serialize(doc), key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }
  async function loadLocal(key = KEY) {
    const db = await idb();
    const text = await new Promise((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return text ? normalize(JSON.parse(text)) : null;
  }

  // Simple key/value access to the other stores.
  async function dbAll(store) {
    const db = await idb();
    const out = await new Promise((resolve, reject) => {
      const tx = db.transaction(store);
      const req = tx.objectStore(store).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return out;
  }
  async function dbPut(store, key, value) {
    const db = await idb();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(store, "readwrite");
      if (value === undefined) tx.objectStore(store).delete(key);
      else tx.objectStore(store).put(value, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  }

  // ---------- pieces and packs ----------
  // A piece is { id, name, kind: "item" | "layer", data, images, thumb, credit }. A pack file is
  // { format: PACK_FORMAT, version: 1, name, author, license, pieces: [...] } (docs/SCENE-FORMAT.md).
  const PACK_FORMAT = "elaborate-backgrounds/pack";

  // Runs a piece through the same checks as a scene file. Returns the cleaned piece, or null.
  function normalizePiece(piece, warnings = []) {
    if (!piece || typeof piece !== "object" || !piece.data || !["item", "layer"].includes(piece.kind)) return null;
    const layer = piece.kind === "item" ? { id: "p", name: "piece", paint: [piece.data] } : { ...piece.data, id: "p" };
    try {
      const { doc, warnings: w } = normalize({ layers: [layer], images: piece.images || {} });
      warnings.push(...w);
      const L = doc.layers[0];
      if (!L) return null;
      if (piece.kind === "item" && !(L.paint && L.paint.length)) return null;
      const data = piece.kind === "item" ? L.paint[0] : L;
      delete data.id;
      return {
        id: String(piece.id || uid("piece")), name: String(piece.name || "Piece").slice(0, 60), kind: piece.kind, data,
        images: doc.images, thumb: typeof piece.thumb === "string" && piece.thumb.startsWith("data:image/") ? piece.thumb : null,
        credit: piece.credit ? String(piece.credit).slice(0, 120) : "",
      };
    } catch {
      return null;
    }
  }
  function normalizePack(raw) {
    if (!raw || raw.format !== PACK_FORMAT || !Array.isArray(raw.pieces)) throw new Error("This file isn't a pack: it needs a format line and a list of pieces.");
    const warnings = [];
    const name = String(raw.name || "Untitled pack").slice(0, 60);
    const author = raw.author ? String(raw.author).slice(0, 60) : "";
    const pieces = raw.pieces.map((pc) => normalizePiece({ ...pc, credit: pc.credit || (author ? `From ${name}, by ${author}` : `From ${name}`) }, warnings)).filter(Boolean);
    if (!pieces.length) throw new Error("None of the pieces in this pack could be drawn.");
    return { pack: { id: String(raw.id || uid("pack")), name, author, license: raw.license ? String(raw.license).slice(0, 200) : "", pieces }, warnings };
  }

  // ---------- groups and merging layers ----------
  // In this editor a layer is a plane at one depth, with one pose timing and one motion. Pieces that
  // share all three can share a layer; inside it, groups keep each object selectable as one thing.
  function cycleText(c) { return c ? `${c.frames} poses at ${c.rate} a second` : "no poses"; }
  // Why a layer can't merge into another one, or null when it can.
  function mergeProblem(src, dst) {
    if (!src || !dst || src === dst) return "Pick a different layer.";
    for (const L of [src, dst]) {
      if (L.type) return `${L.name} is a ${layerKind(L).toLowerCase()}, which keeps a layer of its own.`;
      if ((L.paint || []).some((it) => it.shader) || L.rect) return `${L.name} is part of the garden study's art, which keeps its own layers.`;
      if (L.anim && L.anim.type === "cycle") return `${L.name} plays baked frames, so it keeps its own layer.`;
    }
    if (src.anim) return `${src.name} ${src.anim.type === "sway" ? "sways" : src.anim.type === "drift" ? "drifts" : "travels across"} on its own, so it needs its own layer.`;
    if (src.cycle && dst.cycle && (src.cycle.frames !== dst.cycle.frames || src.cycle.rate !== dst.cycle.rate))
      return `Their poses run on different timings (${cycleText(src.cycle)} and ${cycleText(dst.cycle)}), and a layer has one timing.`;
    return null;
  }
  function groupId(L) {
    const taken = new Set(Object.keys(L.groups || {}));
    return uid("group", taken);
  }
  // Moves every piece of src into dst, keeping where they are on screen. A layer of several loose
  // pieces becomes one group named after it; its own groups come along as they are. "front" puts
  // them on top of dst's pieces (src was in front of dst), otherwise underneath.
  function mergeLayers(dst, src, { front = true, name } = {}) {
    const so = src.offset || [0, 0], dof = dst.offset || [0, 0];
    const dx = so[0] - dof[0], dy = so[1] - dof[1];
    if (src.cycle && !dst.cycle) dst.cycle = { ...src.cycle };
    dst.groups = dst.groups || {};
    const ids = new Set(dst.paint.map((it) => it.id));
    const map = {};
    for (const [gid, g] of Object.entries(src.groups || {})) { map[gid] = groupId(dst); dst.groups[map[gid]] = { ...g }; }
    const loose = src.paint.filter((it) => !it.group);
    const wrap = loose.length > 1 ? groupId(dst) : null;
    if (wrap) dst.groups[wrap] = { name: name || src.name };
    const moved = src.paint.map((it) => {
      const c = clone(it);
      const t = LB.ITEMS.xfOf(c);
      c.xf = { ...t, x: t.x + dx, y: t.y + dy };
      c.group = c.group ? map[c.group] : wrap || undefined;
      if (!c.group) delete c.group;
      if (ids.has(c.id)) c.id = uid("item", ids);
      ids.add(c.id);
      // A single loose piece takes the layer's name, if it had none of its own.
      if (!wrap && !it.group && !c.name && src.name) c.name = name || src.name;
      return c;
    });
    if (front) dst.paint.push(...moved); else dst.paint.unshift(...moved);
    if (!Object.keys(dst.groups).length) delete dst.groups;
    return moved;
  }

  LB.DOC = { mergeProblem, mergeLayers, groupId, cycleText, FORMAT, VERSION, A, ASPECTS, PRESETS, BASE_POST, ALL_ON, clone, uid, titleCase, itemName, layerKind, blankDoc, fromStudy, fromBeach, fromLilac, normalize, serialize, saveLocal, loadLocal,
    dbAll, dbPut, PACK_FORMAT, normalizePiece, normalizePack };
})();
