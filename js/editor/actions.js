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
          const t = I().xfOf(item);
          item.xf = { ...t, x: t.x + dx, y: t.y + dy };
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

  LB.ACT = ACT;
})();
