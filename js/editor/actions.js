/*
  Editing actions shared by the panels, the canvas and the keyboard
  shortcuts. Each one is a single undo step with a readable label, and
  reports what it did in the status line.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const D = () => LB.DOC;
  const I = () => LB.ITEMS;

  const PALETTE = ["#E8B7C6", "#8E7FA6", "#6FA37A", "#F2C94C", "#5E7FA8", "#C85A6E", "#E59A6B", "#7FB8B0"];
  let paletteIndex = 0;
  // The look of the last shape someone edited, so new shapes match the scene they're building.
  ED.shapeStyle = null;

  const say = (msg, tone) => ED.emit("status", { msg, tone });
  const newSeed = () => Math.floor(Math.random() * 1000);
  const layerIndex = (id) => ED.doc.layers.findIndex((L) => L.id === id);
  const isPaint = (L) => L && !L.type;

  function nextLayerName() {
    let n = ED.doc.layers.length + 1;
    const names = new Set(ED.doc.layers.map((L) => L.name));
    while (names.has(`Layer ${n}`)) n++;
    return `Layer ${n}`;
  }

  // A new empty layer just in front of the selected one (or at the front).
  function makeLayer(props = {}) {
    const sel = ED.selLayer();
    return {
      id: D().uid("layer", ED.layerIds()), name: nextLayerName(),
      depth: sel ? sel.depth : 0.5, boil: 1.2, haze: 0, seed: newSeed(), paint: [], ...props,
    };
  }
  function insertLayer(doc, L) {
    const i = ED.sel.layer ? layerIndex(ED.sel.layer) : -1;
    if (i >= 0) doc.layers.splice(i + 1, 0, L);
    else doc.layers.push(L);
  }

  // Where a new item goes: the selected layer if it can take one, otherwise a new layer.
  function targetLayer(doc) {
    const L = ED.selLayer();
    // Layers that cycle baked frames (the study's waterfall) would bake every new piece once per frame.
    if (isPaint(L) && !L.locked && !(L.anim && L.anim.type === "cycle")) return L;
    const nl = makeLayer();
    insertLayer(doc, nl);
    return nl;
  }

  const ACT = {
    addLayer() {
      const L = makeLayer();
      ED.change((doc) => insertLayer(doc, L), "Add layer");
      ED.select(L.id);
      say(`Added ${L.name}.`);
    },

    addItem(item, label) {
      item.id = D().uid("item");
      let host;
      ED.change((doc) => {
        host = targetLayer(doc);
        host.paint.push(item);
      }, label || "Add piece");
      ED.select(host.id, item.id);
      say(`Added ${D().itemName(item, ED.doc)} to ${host.name}.`);
    },

    addLayerObject(layer, label) {
      const L = { id: D().uid("layer", ED.layerIds()), seed: newSeed(), boil: 1.2, ...layer };
      L.name = L.name || D().titleCase(D().layerKind(L));
      ED.change((doc) => insertLayer(doc, L), label || "Add layer");
      ED.select(L.id);
      say(`Added ${L.name}.`);
    },

    addFromEntry(entry, at) {
      if (entry.piece) return ACT.addPiece(entry.piece, at || ED.viewCenter());
      const made = LB.LIBRARY.make(entry, at);
      if (made.item) ACT.addItem(made.item, `Add ${entry.name}`);
      else {
        // Backdrops go to the very back; everything else in front of the selection.
        if (entry.fixed) {
          const L = { id: D().uid("layer", ED.layerIds()), seed: newSeed(), ...made.layer };
          ED.change((doc) => doc.layers.unshift(L), `Add ${entry.name}`);
          ED.select(L.id);
          say(`Added ${L.name} at the back.`);
        } else ACT.addLayerObject({ name: entry.name, ...made.layer }, `Add ${entry.name}`);
      }
    },

    // A shape drawn with one of the shape tools, filling the scene box [x0, y0, x1, y1].
    drawShape(tool, box) {
      const [x0, y0, x1, y1] = box;
      const w = Math.max(0.01, x1 - x0), h = Math.max(0.01, y1 - y0);
      const style = ED.shapeStyle || { material: "paper", rough: 0.5, fuzz: 0.3, puff: 0.3, shadow: 0.4, grain: 1 };
      const color = PALETTE[paletteIndex++ % PALETTE.length];
      const item = { el: "shape", ...D().clone(style), colors: [color, style.colors ? style.colors[1] : "#FFFFFF"], w, h };
      if (item.material === "photo") item.material = "paper";
      delete item.image;
      if (tool === "rect") Object.assign(item, { shape: "rect", corner: 0.1 });
      else if (tool === "ellipse") item.shape = "ellipse";
      else if (tool === "triangle") Object.assign(item, { shape: "polygon", sides: 3, star: 0 });
      else if (tool === "star") Object.assign(item, { shape: "polygon", sides: 5, star: 0.6 });
      else if (tool === "cloud") {
        // The cloud's lobes fill a 0.4 x 0.2 box; scale them to the drawn box.
        const k = Math.min(w / 0.4, h / 0.2);
        Object.assign(item, { shape: "blob", fuzz: 0.9, puff: 0.5,
          lobes: [[-0.13, 0.02, 0.07], [-0.04, -0.03, 0.09], [0.07, -0.02, 0.08], [0.15, 0.02, 0.06], [0.01, 0.03, 0.07]].map(([x, y, r]) => [x * k, y * k, r * k]) });
        delete item.w; delete item.h;
      }
      item.xf = { x: (x0 + x1) / 2, y: (y0 + y1) / 2, s: 1, r: 0 };
      ACT.addItem(item, `Draw ${tool}`);
    },

    duplicate() {
      const L = ED.selLayer();
      if (!L) return;
      const item = ED.selItem();
      if (item) {
        const copy = D().clone(item);
        copy.id = D().uid("item");
        const t = I().xfOf(copy);
        copy.xf = { ...t, x: t.x + 0.03, y: t.y + 0.03 };
        ED.change(() => L.paint.splice(L.paint.indexOf(item) + 1, 0, copy), "Duplicate piece");
        ED.select(L.id, copy.id);
        say(`Duplicated ${D().itemName(item, ED.doc)}.`);
      } else {
        const copy = D().clone(L);
        copy.id = D().uid("layer", ED.layerIds());
        copy.name = `${L.name} copy`;
        copy.seed = newSeed();
        (copy.paint || []).forEach((it) => (it.id = D().uid("item")));
        ED.change((doc) => doc.layers.splice(layerIndex(L.id) + 1, 0, copy), "Duplicate layer");
        ED.select(copy.id);
        say(`Duplicated ${L.name}.`);
      }
    },

    remove() {
      const L = ED.selLayer();
      if (!L) return;
      const item = ED.selItem();
      if (item) {
        const name = D().itemName(item, ED.doc);
        ED.change(() => L.paint.splice(L.paint.indexOf(item), 1), `Delete ${name}`);
        ED.select(L.id);
        say(`Deleted ${name}. Ctrl+Z brings it back.`);
      } else {
        ED.change((doc) => doc.layers.splice(layerIndex(L.id), 1), `Delete ${L.name}`);
        ED.select(null);
        say(`Deleted ${L.name}. Ctrl+Z brings it back.`);
      }
    },

    // Forward = toward the viewer: later in the list, drawn on top.
    restack(step) {
      const L = ED.selLayer();
      if (!L) return;
      const item = ED.selItem();
      if (item) {
        const i = L.paint.indexOf(item), j = i + step;
        if (j < 0 || j >= L.paint.length) return say(step > 0 ? "Already at the front of its layer." : "Already at the back of its layer.");
        ED.change(() => { L.paint.splice(i, 1); L.paint.splice(j, 0, item); }, step > 0 ? "Bring forward" : "Send backward");
      } else {
        const i = layerIndex(L.id), j = i + step;
        if (j < 0 || j >= ED.doc.layers.length) return say(step > 0 ? "Already the front layer." : "Already the back layer.");
        ED.change((doc) => { doc.layers.splice(i, 1); doc.layers.splice(j, 0, L); }, step > 0 ? "Layer forward" : "Layer backward");
      }
      ED.emit("select", ED.sel);
    },

    moveLayerTo(id, index) {
      const i = layerIndex(id);
      if (i < 0) return;
      ED.change((doc) => {
        const [L] = doc.layers.splice(i, 1);
        doc.layers.splice(index > i ? index - 1 : index, 0, L);
      }, "Reorder layers");
    },

    moveItemToLayer(targetId) {
      const from = ED.selLayer(), item = ED.selItem(), to = ED.layer(targetId);
      if (!from || !item || !isPaint(to) || to === from) return;
      ED.change(() => { from.paint.splice(from.paint.indexOf(item), 1); to.paint.push(item); }, `Move to ${to.name}`);
      ED.select(to.id, item.id);
      say(`Moved ${D().itemName(item, ED.doc)} to ${to.name}.`);
    },

    toggle(id, key) {
      const L = ED.layer(id);
      if (!L) return;
      const on = !L[key];
      const label = key === "hidden" ? (on ? "Hide" : "Show") : on ? "Lock" : "Unlock";
      ED.change(() => { if (on) L[key] = true; else delete L[key]; }, `${label} ${L.name}`);
      say(`${L.name} is ${key === "hidden" ? (on ? "hidden" : "visible") : on ? "locked" : "unlocked"}.`);
    },

    // Moves the selection by (dx, dy) scene units: the item, or the whole layer when no item is selected.
    nudge(dx, dy, commit = true) {
      const L = ED.selLayer();
      if (!L || L.locked) return;
      const item = ED.selItem();
      const fn = () => {
        if (item) {
          const f = ED.renderer.frameOf(L.id, ED.clock);
          const t = I().atPose(item, f).xf;
          ACT.setPosedXf(item, L, { ...t, x: t.x + dx, y: t.y + dy }, f);
        } else {
          const o = L.offset || [0, 0];
          L.offset = [o[0] + dx, o[1] + dy];
        }
      };
      if (commit) ED.change(fn, "Move");
      else ED.preview(fn);
    },

    // Reads picture files, shrinks them to at most 2048 px, and adds each to the scene.
    async importImages(files, at) {
      const list = [...files].filter((f) => /^image\/(png|jpeg|webp|gif)$/.test(f.type));
      if (!list.length) return say("Those files aren't PNG, JPEG, WebP or GIF pictures.", "error");
      for (const file of list) {
        try {
          const img = await new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const im = new Image();
            im.onload = () => { URL.revokeObjectURL(url); resolve(im); };
            im.onerror = () => { URL.revokeObjectURL(url); reject(new Error("unreadable")); };
            im.src = url;
          });
          const k = Math.min(1, 2048 / Math.max(img.naturalWidth, img.naturalHeight));
          const c = document.createElement("canvas");
          c.width = Math.round(img.naturalWidth * k);
          c.height = Math.round(img.naturalHeight * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          // JPEG keeps photos small; anything that may have transparency stays PNG.
          const src = file.type === "image/jpeg" ? c.toDataURL("image/jpeg", 0.9) : c.toDataURL("image/png");
          const id = D().uid("img", new Set(Object.keys(ED.doc.images)));
          ED.doc.images[id] = { name: file.name.replace(/\.[^.]+$/, "").slice(0, 40) || "Image", src, w: c.width, h: c.height };
          ED.emit("images");
          const entry = LB.LIBRARY.imageEntries(ED.doc).find((e) => e.image === id);
          ACT.addFromEntry(entry, at || ED.viewCenter());
        } catch {
          say(`${file.name} couldn't be read as a picture.`, "error");
        }
      }
    },
  };

  // ======================= poses =======================
  // "all": moving a piece moves every pose. "pose": it changes only the pose on screen.
  ED.poseMode = "all";
  const r5 = (v) => Math.round(v * 1e5) / 1e5;
  const validRates = (frames) => [1, 2, 3, 4, 6, 8, 12].filter((r) => Math.abs((LB.LOOP * r) / frames - Math.round((LB.LOOP * r) / frames)) < 1e-9);
  const DEFAULT_RATE = { 2: 2, 3: 3, 4: 4, 6: 6, 8: 4, 12: 6 };
  const padPoses = (poses, n) => {
    const out = (poses || []).slice(0, n);
    while (out.length < n) out.push({});
    return out;
  };
  const tidyPoses = (item) => {
    if (item.poses && item.poses.every((p) => !Object.keys(p).length)) delete item.poses;
  };

  Object.assign(ACT, {
    validRates,

    // Puts an item where "nx" says, as seen in pose f: in its own transform, or only in that pose.
    setPosedXf(item, L, nx, f) {
      const base = I().xfOf(item);
      if (ED.poseMode === "pose" && L.cycle) {
        item.poses = padPoses(item.poses, L.cycle.frames);
        const p = { ...item.poses[f] };
        delete p.x; delete p.y; delete p.r; delete p.s;
        const dx = r5(nx.x - base.x), dy = r5(nx.y - base.y), dr = r5(nx.r - base.r), ds = r5(nx.s / base.s);
        if (dx) p.x = dx;
        if (dy) p.y = dy;
        if (dr) p.r = dr;
        if (ds !== 1) p.s = ds;
        item.poses[f] = p;
        tidyPoses(item);
      } else {
        const cur = I().atPose(item, f).xf;
        item.xf = { x: base.x + (nx.x - cur.x), y: base.y + (nx.y - cur.y), s: base.s * (nx.s / cur.s), r: base.r + (nx.r - cur.r) };
      }
    },

    // Gives a layer a pose cycle (or removes it with frames = 0), keeping each piece's poses that still fit.
    applyCycle(L, frames, rate) {
      if (!frames) {
        delete L.cycle;
        (L.paint || []).forEach((it) => delete it.poses);
        return;
      }
      const rates = validRates(frames);
      L.cycle = { frames, rate: rates.includes(rate) ? rate : DEFAULT_RATE[frames] || rates[0] };
      (L.paint || []).forEach((it) => { if (it.poses) { it.poses = padPoses(it.poses, frames); tidyPoses(it); } });
    },

    setCycle(L, frames, rate) {
      ED.change(() => ACT.applyCycle(L, frames, rate), frames ? `${frames} poses` : "Remove poses");
      say(frames ? `${L.name} now has ${frames} poses at ${L.cycle.rate} a second. Pick a pose under the canvas, set "This pose only", and move pieces to animate.` : `Removed the poses from ${L.name}.`);
    },

    // Copies every piece's pose from the previous pose onto pose f.
    copyPreviousPose(L, f) {
      if (!L.cycle) return;
      const n = L.cycle.frames, prev = (f - 1 + n) % n;
      ED.change(() => (L.paint || []).forEach((it) => {
        it.poses = padPoses(it.poses, n);
        it.poses[f] = D().clone(it.poses[prev]);
        tidyPoses(it);
      }), "Copy previous pose");
      say(`Pose ${f + 1} now matches pose ${prev + 1}.`);
    },

    setHiddenInPose(item, L, f, hide) {
      ED.change(() => {
        item.poses = padPoses(item.poses, L.cycle.frames);
        if (hide) item.poses[f] = { ...item.poses[f], hide: true };
        else { const p = { ...item.poses[f] }; delete p.hide; item.poses[f] = p; }
        tidyPoses(item);
      }, hide ? "Hide in pose" : "Show in pose");
    },

    // Boil photos: 1 or 2 more photos of the same thing, swapped pose by pose.
    setBoil(item, L, list) {
      const extra = list.filter(Boolean).slice(0, 2);
      ED.change(() => {
        if (extra.length) item.boilImages = extra;
        else delete item.boilImages;
        if (extra.length && !L.cycle) L.cycle = { frames: extra.length + 1, rate: 6 };
      }, "Boil photos");
      if (extra.length) say(`${extra.length + 1} photos now swap on the beat in ${L.name}.`);
    },
  });

  // ======================= drawing your own outline =======================
  ACT.penShape = function (points) {
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const c = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    const style = ED.shapeStyle || { material: "paper", rough: 0.5, fuzz: 0.3, puff: 0.3, shadow: 0.4, grain: 1 };
    const item = { el: "shape", ...D().clone(style), shape: "path", smooth: false, round: 0.002,
      points: points.slice(0, 32).map((p) => [r5(p[0] - c[0]), r5(p[1] - c[1])]),
      colors: [PALETTE[paletteIndex++ % PALETTE.length], style.colors ? style.colors[1] : "#FFFFFF"], xf: { x: c[0], y: c[1], s: 1, r: 0 } };
    if (item.material === "photo") item.material = "paper";
    delete item.image;
    ACT.addItem(item, "Draw an outline");
  };

  // ======================= cut-outs from pictures =======================
  // Looks at a picture to guess what the cut-out is: see-through parts, or a dark shape on a light
  // background (paper on white), or a light shape on a dark one.
  async function guessMask(src) {
    const img = await new Promise((resolve, reject) => { const im = new Image(); im.onload = () => resolve(im); im.onerror = reject; im.src = src; });
    const c = document.createElement("canvas");
    c.width = 64; c.height = 64;
    const x = c.getContext("2d", { willReadFrequently: true });
    x.drawImage(img, 0, 0, 64, 64);
    const px = x.getImageData(0, 0, 64, 64).data;
    let clear = 0, edge = 0, edgeN = 0;
    for (let i = 0; i < 64 * 64; i++) {
      if (px[i * 4 + 3] < 200) clear++;
      const xx = i % 64, yy = Math.floor(i / 64);
      if (xx < 3 || yy < 3 || xx > 60 || yy > 60) { edge += (0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]) / 255; edgeN++; }
    }
    if (clear > 64 * 64 * 0.05) return "alpha";
    return edge / edgeN > 0.5 ? "dark" : "light";
  }
  ACT.toCutout = async function () {
    const L = ED.selLayer(), item = ED.selItem();
    if (!item || item.el !== "image") return;
    const def = ED.doc.images[item.image];
    let from = "alpha";
    try { from = await guessMask(def.src); } catch {}
    ED.change(() => {
      const keep = { id: item.id, image: item.image, w: item.w, h: item.h, xf: item.xf, poses: item.poses, boilImages: item.boilImages, name: item.name };
      for (const k of Object.keys(item)) delete item[k];
      Object.assign(item, {
        el: "shape", shape: "mask", mask: { from, threshold: 0.5 }, material: "photo", tint: 0, colors: ["#FFFFFF", "#FFFFFF"],
        rough: 0.2, fuzz: 0.25, puff: 0.35, shadow: 0.45, grain: 1,
      });
      Object.keys(keep).forEach((k) => keep[k] !== undefined && (item[k] = keep[k]));
    }, "Turn into a cut-out");
    say(`It's a cut-out now, from the ${from === "alpha" ? "see-through parts" : from === "dark" ? "dark parts (paper on a light background)" : "light parts"} of the picture. If it guessed wrong, change Cut out under Shape.`);
  };

  // ======================= My pieces and packs =======================
  // The pictures a piece uses, so it can travel on its own.
  function picturesIn(data) {
    const ids = new Set();
    const visit = (it) => { if (it.image) ids.add(it.image); (it.boilImages || []).forEach((id) => ids.add(id)); };
    if (data.paint) data.paint.forEach(visit); else visit(data);
    return ids;
  }
  // Adds a piece's pictures to the scene, renaming any that clash, and returns the renaming.
  function mergePictures(images) {
    const map = {};
    for (const [id, def] of Object.entries(images || {})) {
      const have = ED.doc.images[id];
      if (have && have.src === def.src) { map[id] = id; continue; }
      const nid = have ? D().uid("img", new Set(Object.keys(ED.doc.images))) : id;
      ED.doc.images[nid] = D().clone(def);
      map[id] = nid;
    }
    return map;
  }
  function renamePictures(data, map) {
    const fix = (it) => {
      if (it.image && map[it.image]) it.image = map[it.image];
      if (it.boilImages) it.boilImages = it.boilImages.map((id) => map[id] || id);
    };
    if (data.paint) data.paint.forEach(fix); else fix(data);
  }

  ACT.savePiece = async function (kind) {
    const L = ED.selLayer(), item = ED.selItem();
    if (!L || (kind === "item" && !item)) return;
    const data = D().clone(kind === "item" ? item : L);
    delete data.id;
    if (data.paint) data.paint.forEach((it) => delete it.id);
    const name = kind === "item" ? D().itemName(item, ED.doc) : L.name;
    const images = {};
    for (const id of picturesIn(data)) if (ED.doc.images[id]) images[id] = ED.doc.images[id];
    let thumb = null;
    try {
      const layer = kind === "item" ? { id: "thumb", seed: 3, paint: [data] } : { ...data, id: "thumb", offset: [0, 0] };
      const img = await ED.renderer.thumbnail(layer, 144, 96, { ...ED.doc });
      if (img) {
        const c = document.createElement("canvas");
        c.width = img.width; c.height = img.height;
        c.getContext("2d").putImageData(img, 0, 0);
        thumb = c.toDataURL("image/png");
      }
    } catch {}
    const piece = { id: D().uid("piece"), name, kind, data, images, thumb, credit: "Yours", created: Date.now() };
    try {
      await D().dbPut("pieces", piece.id, piece);
      ED.emit("pieces");
      say(`Saved ${name} to My pieces in the store.`);
    } catch {
      say("This browser blocked storage, so My pieces can't be saved here.", "error");
    }
  };

  ACT.addPiece = function (piece, at) {
    const data = D().clone(piece.data);
    const map = mergePictures(piece.images);
    renamePictures(data, map);
    ED.emit("images");
    if (piece.kind === "item") {
      const t = I().xfOf(data);
      const o = I().origin(data, null);
      data.xf = { ...t, x: at[0] - o[0], y: at[1] - o[1] };
      ACT.addItem(data, `Add ${piece.name}`);
    } else {
      // Center the layer's contents on "at".
      let box = null;
      if (data.type === "sprite") box = LB.SPRITE.bbox({ ...data, index: 0 });
      else if (data.type === "sparkles") box = data.area;
      else for (const it of data.paint || []) box = I().union(box, I().worldBox(I().atPose(it, 0), data));
      const off = data.offset || [0, 0];
      if (box) data.offset = [off[0] + at[0] - (box[0] + box[2]) / 2, off[1] + at[1] - (box[1] + box[3]) / 2];
      (data.paint || []).forEach((it) => (it.id = D().uid("item")));
      ACT.addLayerObject({ ...data, name: piece.name }, `Add ${piece.name}`);
    }
  };

  ACT.deletePiece = async function (piece) {
    await D().dbPut("pieces", piece.id, undefined);
    ED.emit("pieces");
    say(`Removed ${piece.name} from My pieces.`);
  };

  ACT.exportPack = async function (meta) {
    const pieces = await D().dbAll("pieces");
    if (!pieces.length) return say("My pieces is empty. Save a piece first: select it and use Save to My pieces.", "error");
    const pack = { format: D().PACK_FORMAT, version: 1, id: D().uid("pack"), name: meta.name || "My pack", author: meta.author || "", license: meta.license || "",
      pieces: pieces.map(({ id, name, kind, data, images, thumb }) => ({ id, name, kind, data, images, thumb })) };
    const text = JSON.stringify(pack);
    const slug = (pack.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "pack");
    const url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${slug}.pack.json`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
    say(`Saved ${pieces.length} piece${pieces.length === 1 ? "" : "s"} as ${slug}.pack.json.`);
  };

  ACT.importPack = async function (file) {
    try {
      let raw;
      try { raw = JSON.parse(await file.text()); } catch { throw new Error(`${file.name} isn't valid JSON.`); }
      const { pack, warnings } = D().normalizePack(raw);
      await D().dbPut("packs", pack.id, pack);
      ED.emit("pieces", { open: pack.id });
      say(`Installed ${pack.name}: ${pack.pieces.length} piece${pack.pieces.length === 1 ? "" : "s"}.${warnings.length ? " " + warnings.join(" ") : ""}`, warnings.length ? "warn" : undefined);
    } catch (err) {
      say(`Couldn't install that pack: ${err.message}`, "error");
    }
  };

  ACT.removePack = async function (pack) {
    await D().dbPut("packs", pack.id, undefined);
    ED.emit("pieces");
    say(`Removed the ${pack.name} pack. Scenes that use its pieces keep them.`);
  };

  LB.ACT = ACT;
})();
