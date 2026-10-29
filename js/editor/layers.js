/*
  The Layers panel.

    Rows      front at the top. Each row has a number sticker (1 is the front),
              a colored bar for its depth (cool far, warm near, like haze), a
              live thumbnail, the name, a depth gauge and badges for poses and
              motion, and eye and lock buttons.
    Pieces    a paint layer's pieces fold out under it, each with its own
              icon and color dot.
    Depth     a small multiplane diagram above the list: every layer is a
              card standing at its depth, the camera on the right. Click a
              card to select its layer.
    Moving    drag a row up or down (a ghost follows the pointer and a glowing
              line shows where it lands), or use ] and [, or Alt+Up and Alt+Down.
    Naming    double-click a name, or press F2, to rename in place.
    Menu      right-click a row for everything else.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const { h, icon, menu, flip, bump, depthColor, prefs } = LB.UI;
  const D = () => LB.DOC;
  const ACT = () => LB.ACT;
  const $ = (s) => document.querySelector(s);
  const SVG = "http://www.w3.org/2000/svg";
  const isPaint = (L) => L && !L.type;
  const esc = (s) => (window.CSS && CSS.escape ? CSS.escape(s) : String(s).replace(/"/g, '\\"'));

  // ---------- what a layer or piece is ----------
  function layerIcon(L) {
    if (L.type === "sprite") return L.flower ? "flower" : "leaf";
    if (L.type === "sparkles") return "sparkle";
    const paint = L.paint || [];
    if (paint.some((it) => it.el === "clay")) return "cube";
    if (paint.some((it) => it.shader)) return "wand";
    if (paint.some((it) => it.el === "canopy" || it.el === "turf" || it.el === "trunk")) return "plant";
    if (paint.some((it) => it.el === "image")) return "image";
    return "layers";
  }
  function itemIcon(it) {
    if (it.shader) return "wand";
    if (it.el === "shape") {
      if (it.shape === "rect") return "rect";
      if (it.shape === "ellipse") return "ellipse";
      if (it.shape === "blob") return "cloud";
      if (it.shape === "path") return "pen";
      if (it.shape === "mask") return "scissors";
      if (it.shape === "polygon") return it.star > 0.05 ? "star" : it.sides === 3 ? "triangle" : "shapes";
      return "shapes";
    }
    return { image: "image", canopy: "plant", florets: "flower", trunk: "plant", branch: "leaf", turf: "plant", fuzz: "ellipse", clay: "cube" }[it.el] || "shapes";
  }
  function itemColor(it) {
    if (it.material === "photo") return null;
    return (it.colors && it.colors[0]) || it.color || (it.parts && it.parts[0] && it.parts[0].color) || null;
  }
  const MOTION_ICON = { drift: "drift", sway: "sway", travel: "travel", cycle: "film" };
  const MOTION_NAME = { drift: "drifts", sway: "sways", travel: "travels across", cycle: "plays baked frames" };
  function kindText(L) {
    if (L.type) return D().layerKind(L);
    const n = L.paint.length;
    const g = groupCount(L);
    return n ? `${g ? `${g} group${g === 1 ? "" : "s"}, ` : ""}${n} piece${n === 1 ? "" : "s"}` : "Empty";
  }
  const groupCount = (L) => Object.keys(L.groups || {}).length;
  const depthWord = (d) => (d < 0.2 ? "far back" : d < 0.45 ? "back" : d < 0.65 ? "middle" : d < 0.85 ? "near" : "front");

  // ---------- thumbnails ----------
  // Rendered by the scene's own renderer, one at a time, when it isn't busy baking.
  const thumbs = new Map();     // layer id -> { sig, url }
  const itemThumbs = new Map(); // signature -> data URL
  let thumbTimer = 0, working = false;
  const idle = () => new Promise((res) => { const t = () => (!ED.renderer || ED.renderer.busy || ED.recording ? setTimeout(t, 150) : res()); t(); });
  function toURL(img) {
    if (!img) return null;
    const c = document.createElement("canvas");
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d").putImageData(img, 0, 0);
    return c.toDataURL("image/png");
  }
  // Every thumbnail goes through one queue: the renderer swaps its scene while it draws one,
  // so two at once could leave it holding the wrong scene.
  let chain = Promise.resolve();
  function renderThumb(layer, w, hgt, scene) {
    const run = chain.then(async () => { await idle(); return ED.renderer.thumbnail(layer, w, hgt, scene || ED.doc); });
    chain = run.catch(() => {});
    return run;
  }
  const sigOf = (L) => { const { name, hidden, locked, ...rest } = L; return JSON.stringify(rest); };
  const thumbOf = (id) => { const t = thumbs.get(id); return t ? t.url : null; };

  function scheduleThumbs(delay = 400) {
    clearTimeout(thumbTimer);
    thumbTimer = setTimeout(runThumbs, delay);
  }
  async function runThumbs() {
    if (working || !ED.renderer || ED.renderer.busy || ED.recording) return scheduleThumbs(300);
    working = true;
    try {
      const layers = ED.doc.layers.slice().reverse();
      for (const L of layers) {
        const sig = sigOf(L);
        const have = thumbs.get(L.id);
        if (have && have.sig === sig) continue;
        let url = null;
        if (L.type !== "sparkles") {
          try {
            const copy = JSON.parse(JSON.stringify(L));
            copy.offset = [0, 0];
            url = toURL(await renderThumb(copy, 100, 64));
          } catch (err) { console.warn("layer thumbnail", L.id, err); }
        }
        thumbs.set(L.id, { sig, url });
        paintThumb(L.id);
        await new Promise((r) => setTimeout(r, 0));
        if (ED.renderer.busy || ED.recording) { scheduleThumbs(300); break; }
      }
    } finally {
      working = false;
    }
  }
  function fillThumb(el, L) {
    el.dataset.thumbLayer = L.id;
    const url = thumbOf(L.id);
    el.replaceChildren(url ? h("img", { src: url, alt: "" }) : icon(layerIcon(L)));
  }
  let dvQueued = false;
  function paintThumb(id) {
    const L = ED.layer(id);
    if (!L) return;
    document.querySelectorAll(`[data-thumb-layer="${esc(id)}"]`).forEach((el) => fillThumb(el, L));
    if (!dvQueued) { dvQueued = true; requestAnimationFrame(() => { dvQueued = false; renderDepth(); }); }
  }
  // A picture of one piece as it stands now, for the inspector.
  async function itemThumb(L, item, size = 128) {
    if (!ED.renderer) return null;
    const posed = LB.ITEMS.atPose(item, ED.renderer.frameOf(L.id, ED.clock));
    const it = JSON.parse(JSON.stringify(posed));
    delete it.hide;
    const sig = JSON.stringify(it) + "|" + size + "|" + (L.rect || "");
    if (itemThumbs.has(sig)) return itemThumbs.get(sig);
    let url = null;
    try { url = toURL(await renderThumb({ id: "thumb", seed: L.seed ?? 3, paint: [it], ...(L.rect ? { rect: L.rect } : {}) }, size, size)); }
    catch (err) { console.warn("piece thumbnail", err); }
    itemThumbs.set(sig, url);
    if (itemThumbs.size > 80) itemThumbs.delete(itemThumbs.keys().next().value);
    return url;
  }

  // ---------- the list ----------
  const expanded = new Set();
  let suppressClick = false;

  function render() {
    const list = $("#layer-list");
    const doc = ED.doc;
    if (!list || !doc) return;
    const after = flip(list, (el) => el.dataset.key);
    list.replaceChildren();
    const n = doc.layers.length;
    if (!n) {
      list.append(h("li", { class: "layers-empty", "data-key": "empty" },
        h("span", { class: "stack-art", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
        h("p", { text: "No layers yet. Draw a shape, or add a piece from the store, and it gets a layer of its own." }),
        h("button", { type: "button", class: "btn btn-sm", onclick: () => LB.STORE && LB.STORE.open() }, icon("add"), h("span", { text: "Add pieces" }))));
    }
    for (let i = n - 1; i >= 0; i--) {
      const L = doc.layers[i];
      const num = n - i;
      const selected = ED.sel.layer === L.id;
      const items = isPaint(L) ? L.paint : [];
      const open = items.length > 0 && expanded.has(L.id);
      const motion = L.anim && MOTION_ICON[L.anim.type];
      const row = h("li", {
        class: `layer-row${selected && !ED.hasPieces() ? " is-selected" : ""}${selected && ED.hasPieces() ? " has-selection" : ""}${L.hidden ? " is-hidden" : ""}`,
        "data-id": L.id, "data-key": "L:" + L.id,
      });
      row.style.setProperty("--dc", depthColor(L.depth));
      const thumb = h("span", { class: "lr-thumb", "aria-hidden": "true" });
      fillThumb(thumb, L);
      const label = `Layer ${num} of ${n}: ${L.name}. ${kindText(L)}, ${depthWord(L.depth)} (depth ${Math.round((L.depth || 0) * 100)}%)${L.cycle ? `, ${L.cycle.frames} poses` : ""}${motion ? `, ${MOTION_NAME[L.anim.type]}` : ""}${L.hidden ? ", hidden" : ""}${L.locked ? ", locked" : ""}`;
      const text = h("button", { type: "button", class: "lr-text", "aria-current": selected && !ED.hasPieces() ? "true" : null, "aria-label": label, "data-layer": L.id },
        h("span", { class: "lr-name", text: L.name }),
        h("span", { class: "lr-meta", "aria-hidden": "true" },
          h("span", { class: "lr-kind", text: L.type ? kindText(L) : L.paint.length ? `${L.paint.length} piece${L.paint.length === 1 ? "" : "s"}` : "Empty" }),
          groupCount(L) ? h("span", { class: "badge badge-groups" }, icon("box"), String(groupCount(L))) : null,
          L.cycle ? h("span", { class: "badge badge-poses" }, icon("film"), String(L.cycle.frames)) : null,
          motion ? h("span", { class: "badge badge-motion" }, icon(motion)) : null));
      text.addEventListener("click", () => { if (suppressClick) return; ED.select(L.id); });
      text.addEventListener("dblclick", () => startRename(L.id));
      const eye = h("button", { type: "button", class: `ibtn lr-eye${L.hidden ? " is-on" : ""}`, "aria-pressed": String(!!L.hidden), "aria-label": `Hide ${L.name}`,
        "data-tip": L.hidden ? "Show" : "Hide", "data-quiet": L.hidden ? null : "", html: LB.UI.ICONS[L.hidden ? "eyeOff" : "eye"],
        onclick: () => { ACT().toggle(L.id, "hidden"); bumpAfter(L.id, ".lr-eye", "blink"); } });
      const lock = h("button", { type: "button", class: `ibtn lr-lock${L.locked ? " is-on" : ""}`, "aria-pressed": String(!!L.locked), "aria-label": `Lock ${L.name}`,
        "data-tip": L.locked ? "Unlock" : "Lock", "data-quiet": L.locked ? null : "", html: LB.UI.ICONS[L.locked ? "lock" : "unlock"],
        onclick: () => { ACT().toggle(L.id, "locked"); bumpAfter(L.id, ".lr-lock"); } });
      row.append(h("span", { class: "lr-num", "aria-hidden": "true", text: String(num) }), thumb, text, h("span", { class: "lr-tools" }, eye, lock));
      if (items.length) {
        row.append(h("button", { type: "button", class: "lr-caret", "aria-expanded": String(open), "aria-label": `${open ? "Fold away" : "Show"} the pieces in ${L.name}`,
          "data-tip": open ? "Fold away the pieces" : "Show the pieces", html: LB.UI.ICONS.chevron,
          onclick: () => { open ? expanded.delete(L.id) : expanded.add(L.id); render(); } }));
      }
      row.addEventListener("pointerdown", (e) => onRowDown(e, L, row));
      row.addEventListener("pointerenter", () => { if (!drag) focusOn(L.id); });
      row.addEventListener("focusin", () => focusOn(L.id));
      row.addEventListener("contextmenu", (e) => { e.preventDefault(); if (ED.sel.layer !== L.id || ED.hasPieces()) ED.select(L.id); layerMenu(L, { x: e.clientX, y: e.clientY }); });
      list.append(row);

      if (open) {
        const sub = h("ul", { class: "item-list", "aria-label": `Pieces in ${L.name}, front first` });
        const members = selected ? new Set(ED.selMembers().map((it) => it.id)) : new Set();
        // Front first: a group's run of pieces is one folder row, with its pieces inside.
        const units = LB.ACT.unitsOf(items).reverse();
        for (const unit of units) {
          const gid = unit[0].group;
          if (gid && L.groups && L.groups[gid]) {
            const gOn = selected && ED.sel.group === gid;
            const gOpen = openGroups.has(L.id + "/" + gid) || (selected && ED.sel.item && unit.some((it) => it.id === ED.sel.item));
            const gname = L.groups[gid].name;
            const gb = h("button", { type: "button", class: "item-btn is-group", "aria-current": gOn ? "true" : null, "data-layer": L.id, "data-group": gid,
              "aria-label": `Group ${gname}, ${unit.length} pieces`, onclick: (e) => pickUnit(e, L, unit, gid) },
              icon("box"), h("span", { class: "item-name", text: gname }), h("span", { class: "item-count", text: String(unit.length) }));
            gb.addEventListener("dblclick", () => startGroupRename(L.id, gid));
            gb.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!gOn) ED.selectGroup(L.id, gid); if (LB.CANVAS) LB.CANVAS.pieceMenu({ x: e.clientX, y: e.clientY }); });
            const caret = h("button", { type: "button", class: "item-caret", "aria-expanded": String(!!gOpen), "aria-label": `${gOpen ? "Fold away" : "Show"} the pieces in ${gname}`, html: LB.UI.ICONS.chevron,
              onclick: () => { const k = L.id + "/" + gid; gOpen ? openGroups.delete(k) : openGroups.add(k); render(); } });
            const li = h("li", { class: `item-row group-row${gOn ? " is-selected" : ""}` }, h("div", { class: "group-head" }, caret, gb));
            if (gOpen) {
              const inner = h("ul", { class: "item-list is-inner", "aria-label": `Pieces in ${gname}` });
              for (const it of unit.slice().reverse()) inner.append(itemRow(L, it, selected, members, doc, true));
              li.append(inner);
            }
            sub.append(li);
          } else for (const it of unit.slice().reverse()) sub.append(itemRow(L, it, selected, members, doc, false));
        }
        list.append(h("li", { class: "item-wrap", "data-key": "I:" + L.id }, sub));
      }
    }
    after();
    const sel = !!ED.sel.layer;
    ["#btn-dup", "#btn-del", "#btn-fwd", "#btn-back"].forEach((s) => { const b = $(s); if (b) b.disabled = !sel; });
    renderDepth();
    scheduleThumbs();
  }
  const openGroups = new Set();
  function itemRow(L, it, selected, members, doc, inGroup) {
    const on = selected && (ED.sel.item === it.id || (!!ED.sel.multi && members.has(it.id)));
    const color = itemColor(it);
    const name = D().itemName(it, doc);
    const b = h("button", { type: "button", class: "item-btn", "aria-current": on ? "true" : null, "data-layer": L.id, "data-item": it.id,
      onclick: (e) => pickUnit(e, L, [it], null) },
      icon(itemIcon(it)),
      color ? h("span", { class: "item-dot", style: { background: color }, "aria-hidden": "true" }) : null,
      h("span", { class: "item-name", text: name }));
    b.addEventListener("contextmenu", (e) => { e.preventDefault(); if (!on) ED.select(L.id, it.id); if (LB.CANVAS) LB.CANVAS.pieceMenu({ x: e.clientX, y: e.clientY }); });
    return h("li", { class: `item-row${on ? " is-selected" : ""}${inGroup ? " in-group" : ""}` }, b);
  }
  // A click picks one piece or one group; Shift adds it to (or takes it out of) the selection.
  function pickUnit(e, L, unit, gid) {
    if (e.shiftKey && ED.sel.layer === L.id) {
      let ids = ED.selMembers().map((it) => it.id);
      const add = unit.map((it) => it.id);
      ids = add.every((id) => ids.includes(id)) ? ids.filter((id) => !add.includes(id)) : [...new Set([...ids, ...add])];
      ED.selectMany(L.id, ids);
    } else if (gid) ED.selectGroup(L.id, gid);
    else ED.select(L.id, unit[0].id);
  }
  function startGroupRename(layerId, gid) {
    const L = ED.layer(layerId);
    const btn = document.querySelector(`#layer-list .item-btn[data-group="${esc(gid)}"]`);
    if (!L || !btn || !L.groups || !L.groups[gid]) return;
    if (ED.sel.layer !== layerId || ED.sel.group !== gid) ED.selectGroup(layerId, gid);
    const b2 = document.querySelector(`#layer-list .item-btn[data-group="${esc(gid)}"]`);
    const inp = h("input", { type: "text", class: "lr-rename", value: L.groups[gid].name, maxlength: "60", "aria-label": "Group name", spellcheck: "false" });
    b2.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      if (save && v && v !== L.groups[gid].name) LB.ACT.renameGroup(gid, v); else render();
    };
    inp.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Enter") { e.preventDefault(); finish(true); } else if (e.key === "Escape") { e.preventDefault(); finish(false); } });
    inp.addEventListener("blur", () => finish(true));
  }

  function bumpAfter(id, sel, kind) {
    requestAnimationFrame(() => bump(document.querySelector(`#layer-list [data-id="${esc(id)}"] ${sel}`), kind));
  }

  // A slider moving (depth, say) updates the row's color without rebuilding the list.
  let lastDepths = "";
  function lightUpdate() {
    const L = ED.selLayer();
    if (!L) return;
    const row = document.querySelector(`#layer-list [data-id="${esc(L.id)}"]`);
    if (!row) return;
    row.style.setProperty("--dc", depthColor(L.depth));
    const nm = row.querySelector(".lr-name");
    if (nm && nm.textContent !== L.name) nm.textContent = L.name;
    // The diagram only changes when a depth does (not on every frame of a drag).
    const depths = ED.doc.layers.map((l) => l.depth).join();
    if (depths !== lastDepths) { lastDepths = depths; renderDepth(); }
  }

  // ---------- rename in place ----------
  function startRename(id) {
    const L = ED.layer(id);
    const btn = document.querySelector(`#layer-list .lr-text[data-layer="${esc(id)}"]`);
    if (!L || !btn) return;
    const inp = h("input", { type: "text", class: "lr-rename", value: L.name, maxlength: "60", "aria-label": "Layer name", spellcheck: "false" });
    btn.replaceWith(inp);
    inp.focus();
    inp.select();
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const v = inp.value.trim();
      if (save && v && v !== L.name) ED.change(() => (L.name = v), "Rename layer");
      else render();
      ED.emit("names");
      requestAnimationFrame(() => { const b = document.querySelector(`#layer-list .lr-text[data-layer="${esc(id)}"]`); if (b) b.focus(); });
    };
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); finish(false); }
    });
    inp.addEventListener("blur", () => finish(true));
  }

  // ---------- right-click menu ----------
  function layerMenu(L, at) {
    const paint = isPaint(L);
    menu([
      { heading: L.name },
      { label: "Rename", icon: "pen", keys: "F2", run: () => startRename(L.id) },
      { label: "Duplicate", icon: "copy", keys: "Ctrl D", run: () => ACT().duplicate() },
      { label: L.hidden ? "Show" : "Hide", icon: L.hidden ? "eye" : "eyeOff", run: () => ACT().toggle(L.id, "hidden") },
      { label: L.locked ? "Unlock" : "Lock", icon: L.locked ? "unlock" : "lock", run: () => ACT().toggle(L.id, "locked") },
      "-",
      { label: "Bring forward", icon: "up", keys: "]", run: () => ACT().restack(1) },
      { label: "Send backward", icon: "down", keys: "[", run: () => ACT().restack(-1) },
      "-",
      { label: "Merge into another layer…", icon: "box", disabled: !paint, run: () => mergeMenu(L, at) },
      { label: "Layer settings", icon: "layers", run: () => ED.showTab && ED.showTab("layer", true) },
      { label: "Save to My pieces", icon: "heart", disabled: paint && L.paint.some((it) => it.shader), run: () => ACT().savePiece("layer") },
      "-",
      { label: "Delete layer", icon: "trash", keys: "Del", danger: true, run: () => ACT().remove() },
    ], { ...at, label: `${L.name} menu` });
  }

  // The layers this one can merge into, nearest in depth first.
  function mergeMenu(L, at) {
    const ok = ED.doc.layers.filter((x) => x !== L && !D().mergeProblem(L, x)).sort((a, b) => Math.abs(a.depth - L.depth) - Math.abs(b.depth - L.depth));
    if (!ok.length) {
      const any = ED.doc.layers.find((x) => x !== L && x.paint && !x.type);
      return ED.emit("status", { msg: `${L.name} can't merge into another layer here. ${any ? D().mergeProblem(L, any) : ""}`, tone: "warn" });
    }
    menu([{ heading: `Merge ${L.name} into` }, ...ok.slice(0, 12).map((x) => ({ label: `${x.name} (depth ${Math.round(x.depth * 100)}%)`, icon: "layers", run: () => LB.ACT.mergeLayer(L.id, x.id) }))], { ...at, label: "Merge into" });
  }

  // ---------- drag to reorder ----------
  let drag = null;
  function onRowDown(e, L, row) {
    if (e.button !== 0 || e.target.closest(".lr-tools, .lr-caret, .lr-rename")) return;
    const start = [e.clientX, e.clientY];
    const move = (ev) => {
      if (!drag) {
        if (Math.hypot(ev.clientX - start[0], ev.clientY - start[1]) < 5) return;
        beginDrag(L, row, start);
      }
      updateDrag(ev);
    };
    const up = (ev) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      if (drag) endDrag(ev.type === "pointercancel");
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  }
  function beginDrag(L, row, start) {
    const list = $("#layer-list");
    const r = row.getBoundingClientRect();
    const ghost = row.cloneNode(true);
    ghost.classList.add("layer-ghost");
    ghost.classList.remove("is-selected", "has-selection", "is-dragging");
    ghost.removeAttribute("data-key");
    ghost.setAttribute("aria-hidden", "true");
    ghost.style.setProperty("--dc", depthColor(L.depth));
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
    document.body.append(ghost);
    row.classList.add("is-dragging");
    const line = h("div", { class: "drop-line", "aria-hidden": "true" });
    list.append(line);
    drag = { L, row, ghost, line, list, offY: start[1] - r.top, before: undefined, scroll: 0 };
    document.body.classList.add("is-sorting");
  }
  function updateDrag(ev) {
    const { ghost, list, row, line } = drag;
    ghost.style.top = `${ev.clientY - drag.offY}px`;
    const rows = [...list.querySelectorAll(".layer-row")].filter((r) => r !== row);
    let before = null;
    for (const r of rows) {
      const b = r.getBoundingClientRect();
      if (ev.clientY < b.top + b.height / 2) { before = r; break; }
    }
    drag.before = before;
    const lr = list.getBoundingClientRect();
    let y;
    if (before) y = before.getBoundingClientRect().top - lr.top + list.scrollTop - 2;
    else {
      const last = rows[rows.length - 1];
      const tail = last ? (last.nextElementSibling && last.nextElementSibling.classList.contains("item-wrap") ? last.nextElementSibling : last) : null;
      y = tail ? tail.getBoundingClientRect().bottom - lr.top + list.scrollTop + 2 : 8;
    }
    line.style.top = `${y}px`;
    // Scroll the list when the pointer nears its top or bottom.
    const edge = 28;
    const dir = ev.clientY < lr.top + edge ? -1 : ev.clientY > lr.bottom - edge ? 1 : 0;
    cancelAnimationFrame(drag.scroll);
    if (dir) {
      const step = () => { if (!drag) return; list.scrollTop += dir * 8; drag.scroll = requestAnimationFrame(step); };
      drag.scroll = requestAnimationFrame(step);
    }
  }
  function endDrag(cancel) {
    const { L, row, ghost, line, before } = drag;
    cancelAnimationFrame(drag.scroll);
    drag = null;
    document.body.classList.remove("is-sorting");
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    const lineTop = line.getBoundingClientRect().top;
    line.remove();
    row.classList.remove("is-dragging");
    const finish = () => ghost.remove();
    if (!LB.UI.reduce()) {
      ghost.animate([{ top: ghost.style.top, transform: "rotate(-2deg) scale(1.03)" }, { top: `${lineTop - 4}px`, transform: "none", opacity: 0.4 }], { duration: 160, easing: "ease-out" }).onfinish = finish;
    } else finish();
    if (cancel) return;
    const layers = ED.doc.layers;
    const from = layers.indexOf(L);
    const target = before ? layers.findIndex((x) => x.id === before.dataset.id) + 1 : 0;
    if (from < 0 || target === from || target === from + 1) return;
    ED.select(L.id);
    ACT().moveLayerTo(L.id, target);
    requestAnimationFrame(() => bump(document.querySelector(`#layer-list [data-id="${esc(L.id)}"] .lr-num`)));
  }

  // ---------- keyboard ----------
  function onListKey(e) {
    if (e.target.classList.contains("lr-rename")) return;
    const focusables = [...$("#layer-list").querySelectorAll(".lr-text, .item-btn")];
    const groupId = e.target.dataset.group || null;
    const i = focusables.indexOf(document.activeElement);
    if (i < 0) return;
    const id = e.target.dataset.layer;
    const itemId = e.target.dataset.item || null;
    if (e.altKey && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      if (groupId) { if (ED.sel.group !== groupId) ED.selectGroup(id, groupId); }
      else if (ED.sel.layer !== id || ED.sel.item !== itemId) ED.select(id, itemId);
      ACT().restack(e.key === "ArrowUp" ? 1 : -1);
      requestAnimationFrame(() => {
        const b = document.querySelector(groupId ? `#layer-list .item-btn[data-group="${esc(groupId)}"]` : itemId ? `#layer-list .item-btn[data-item="${esc(itemId)}"]` : `#layer-list .lr-text[data-layer="${esc(id)}"]`);
        if (b) b.focus();
      });
      return;
    }
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      focusables[Math.max(0, Math.min(focusables.length - 1, i + (e.key === "ArrowDown" ? 1 : -1)))].focus();
    } else if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      focusables[e.key === "Home" ? 0 : focusables.length - 1].focus();
    } else if (e.key === "F2" && groupId) {
      e.preventDefault();
      startGroupRename(id, groupId);
    } else if (e.key === "F2" && !itemId) {
      e.preventDefault();
      startRename(id);
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      if (groupId) { if (ED.sel.group !== groupId) ED.selectGroup(id, groupId); }
      else if (ED.sel.layer !== id || ED.sel.item !== itemId) ED.select(id, itemId);
      ACT().remove();
      requestAnimationFrame(() => {
        const all = [...$("#layer-list").querySelectorAll(".lr-text, .item-btn")];
        (all[Math.min(i, all.length - 1)] || $("#btn-add-layer")).focus();
      });
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = e.target.getBoundingClientRect();
      if (groupId) { ED.selectGroup(id, groupId); LB.CANVAS.pieceMenu({ x: r.left + 20, y: r.bottom }); }
      else if (itemId) { ED.select(id, itemId); LB.CANVAS.pieceMenu({ x: r.left + 20, y: r.bottom }); }
      else { ED.select(id); layerMenu(ED.layer(id), { x: r.left + 20, y: r.bottom }); }
    }
  }

  // ---------- the depth diagram ----------
  const svgEl = (tag, attrs = {}) => {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) if (attrs[k] != null) e.setAttribute(k, attrs[k]);
    return e;
  };
  // ---------- the depth diagram, magnified where you point ----------
  // Every layer is a card standing at its place in depth. Pointing at the diagram magnifies it
  // around the pointer, the way a dock does: the cards nearest the pointer spread apart and the far
  // ones squeeze together, so the layers on either side stay within reach. The card under the
  // pointer turns to face you, larger, so you can see what's in it. Hovering a row in the list
  // does the same for that row's layer.
  const DV = { W: 260, H: 118, floor: 102, x0: 14, x1: 224 };
  const MAG = { A: 40, sigma: 1.2 };
  const geo = new Map();   // layer id -> { rank, w, hh, s, col, url, name, el, c }
  let order = [];          // layer ids, far to near
  let hot = null;          // the layer whose card faces you
  let focus = null;        // where the magnification centers, in diagram units (null: none)

  // Card centers: even slots, or, with a focus, slots that grow near it.
  function slots() {
    const n = order.length;
    if (!n) return [];
    const span = DV.x1 - DV.x0, step = span / n;
    const base = order.map((_, i) => DV.x0 + step * (i + 0.5));
    if (focus == null) return base;
    const w = base.map((c) => 1 + MAG.A * Math.exp(-((((c - focus) / step) / MAG.sigma) ** 2)));
    const sum = w.reduce((x, y) => x + y, 0);
    let acc = 0;
    return w.map((wi) => { const c = DV.x0 + (span * (acc + wi / 2)) / sum; acc += wi; return c; });
  }
  const baseCenter = (id) => { const i = order.indexOf(id), step = (DV.x1 - DV.x0) / order.length; return DV.x0 + step * (i + 0.5); };
  // The layer whose card is nearest x, in the magnified layout.
  function idAt(x) {
    const c = slots();
    if (!c.length || x < DV.x0 - 10 || x > DV.x1 + 10) return null;
    let best = 0;
    for (let i = 1; i < c.length; i++) if (Math.abs(c[i] - x) < Math.abs(c[best] - x)) best = i;
    return order[best];
  }

  function cardFace(card, w, hh, col, url) {
    card.append(svgEl("rect", { class: "dv-fill", width: w.toFixed(1), height: hh.toFixed(1), rx: 3, fill: col, "fill-opacity": ".22" }));
    if (url) card.append(svgEl("image", { href: url, width: w.toFixed(1), height: hh.toFixed(1), preserveAspectRatio: "xMidYMid meet" }));
    card.append(svgEl("rect", { class: "dv-edge", width: w.toFixed(1), height: hh.toFixed(1), rx: 3, stroke: col }));
  }
  // The angled card and the card facing you, as transforms CSS can ease between: a skew and a squash
  // that undo themselves as the card turns.
  const leftOf = (m, c) => c - 0.21 * m.w;
  const angled = (m, c) => `translate(${leftOf(m, c).toFixed(1)}px, ${(DV.floor - m.hh).toFixed(1)}px) skewY(-25.46deg) scale(0.42, 1)`;
  function straight(m, c) {
    const H = 60, k = H / m.hh, w = m.w * k;
    const x = Math.max(4, Math.min(DV.W - 4 - w, c - w / 2)), y = DV.floor - H - 8;
    return { t: `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) skewY(0deg) scale(${k.toFixed(3)}, ${k.toFixed(3)})`, x, y, w };
  }

  // Puts every card in its slot, and the facing card over its own slot.
  function layout() {
    const svg = document.querySelector("#depthview svg");
    if (!svg) return;
    const c = slots();
    order.forEach((id, i) => { const m = geo.get(id); m.c = c[i]; m.el.style.transform = `translate(${leftOf(m, c[i]).toFixed(1)}px, 0px)`; });
    const up = svg.querySelector(".dv-hot.is-up");
    if (up) {
      const m = geo.get(up.dataset.id);
      if (m) {
        const st = straight(m, m.c);
        up.querySelector(".dv-hot-card").style.transform = st.t;
        const label = up.querySelector(".dv-hot-label");
        label.setAttribute("x", (st.x + st.w / 2).toFixed(1));
        label.setAttribute("y", (st.y - 5).toFixed(1));
      }
    }
  }

  function drawHot(svg, id, animate) {
    const m = geo.get(id);
    if (!m) return;
    m.el.classList.add("is-hot");
    const st = straight(m, m.c);
    const g = svgEl("g", { class: "dv-hot", "data-id": id });
    const card = svgEl("g", { class: "dv-hot-card" });
    cardFace(card, m.w, m.hh, m.col, m.url);
    const label = svgEl("text", { class: "dv-hot-label", x: (st.x + st.w / 2).toFixed(1), y: (st.y - 5).toFixed(1), "text-anchor": "middle" });
    label.textContent = m.name;
    g.append(card, label);
    svg.append(g);
    if (animate && !LB.UI.reduce()) {
      card.style.transform = angled(m, m.c);
      card.getBoundingClientRect();
      requestAnimationFrame(() => { if (!g.isConnected) return; card.style.transform = straight(m, m.c).t; g.classList.add("is-up"); });
    } else { card.style.transform = st.t; g.classList.add("is-up"); }
  }
  function setHot(id) {
    if (hot === id) return;
    hot = id;
    const svg = document.querySelector("#depthview svg");
    if (!svg) return;
    // The card that faced you turns back to its angle, then its plane shows again.
    for (const old of svg.querySelectorAll(".dv-hot")) {
      const m = geo.get(old.dataset.id);
      const back = () => { old.remove(); if (hot !== old.dataset.id && m) m.el.classList.remove("is-hot"); };
      old.classList.remove("is-up");
      if (m && !LB.UI.reduce()) { old.querySelector(".dv-hot-card").style.transform = angled(m, m.c); setTimeout(back, 260); } else back();
    }
    if (id) drawHot(svg, id, true);
  }
  // Magnify around a layer's card (hovering its row in the list), or stop (null).
  function focusOn(id) {
    const ok = id && order.includes(id);
    focus = ok ? baseCenter(id) : null;
    layout();
    setHot(ok ? id : null);
  }
  // A pointer position in diagram units.
  function toDV(svg, e) {
    const r = svg.getBoundingClientRect();
    const k = Math.min(r.width / DV.W, r.height / DV.H);
    return (e.clientX - r.left - (r.width - DV.W * k) / 2) / k;
  }

  function renderDepth() {
    const box = $("#depthview");
    if (!box || box.hidden || !ED.doc) return;
    const { W, H, floor } = DV;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, "aria-hidden": "true", preserveAspectRatio: "xMidYMid meet" });
    // The floor and the two ends of the depth axis.
    svg.append(svgEl("line", { x1: 10, y1: floor, x2: W - 34, y2: floor, class: "dv-floor" }));
    const far = svgEl("text", { x: 10, y: H - 4, class: "dv-label" });
    far.textContent = "far";
    const near = svgEl("text", { x: W - 34, y: H - 4, class: "dv-label", "text-anchor": "end" });
    near.textContent = "near";
    svg.append(far, near);
    // The camera, on the right, looking at the planes.
    const cam = svgEl("svg", { x: W - 29, y: floor - 26, width: 26, height: 26, viewBox: "0 0 24 24", class: "dv-cam" });
    cam.innerHTML = LB.UI.ICONS.camera.replace(/^<svg[^>]*>|<\/svg>$/g, "");
    svg.append(cam);
    // Far layers first, so near ones stand in front of them.
    const layers = ED.doc.layers.map((L, i) => ({ L, i })).sort((a, b) => (a.L.depth || 0) - (b.L.depth || 0) || a.i - b.i);
    geo.clear();
    order = layers.map(({ L }) => L.id);
    if (hot && !order.includes(hot)) hot = null;
    const c = slots();
    layers.forEach(({ L }, rank) => {
      const d = Math.max(0, Math.min(1, L.depth || 0));
      // Sized by the depth: near layers stand taller.
      const s = 0.78 + d * 0.42;
      const w = 92 * s, hh = 52 * s;
      const col = depthColor(d);
      const url = thumbOf(L.id);
      const g = svgEl("g", { class: `dv-plane${ED.sel.layer === L.id ? " is-sel" : ""}${L.hidden ? " is-hidden" : ""}${hot === L.id ? " is-hot" : ""}`, "data-id": L.id });
      const lift = svgEl("g", { class: "dv-lift" });
      // A card turned toward the camera; its group slides along the floor as the slots change.
      const card = svgEl("g", { transform: `matrix(0.42 -0.2 0 1 0 ${(floor - hh).toFixed(1)})` });
      cardFace(card, w, hh, col, url);
      lift.append(card);
      g.append(svgEl("ellipse", { cx: (w * 0.21).toFixed(1), cy: floor + 1, rx: (10 * s).toFixed(1), ry: 2, fill: col, "fill-opacity": ".45" }), lift);
      const m = { rank, w, hh, s, col, url, name: L.name, el: g, c: c[rank] };
      geo.set(L.id, m);
      g.style.transform = `translate(${leftOf(m, c[rank]).toFixed(1)}px, 0px)`;
      svg.append(g);
    });
    svg.addEventListener("pointermove", (e) => { focus = toDV(svg, e); layout(); setHot(idAt(focus)); });
    svg.addEventListener("pointerleave", () => { focus = null; layout(); setHot(null); });
    svg.addEventListener("click", (e) => { const id = idAt(toDV(svg, e)); if (id) ED.select(id); });
    box.replaceChildren(svg);
    // A layer that was facing you stays that way when the diagram redraws.
    if (hot && geo.has(hot)) drawHot(svg, hot, false);
  }

  // Brings a row into view inside the list only, never scrolling the page (which on a phone would jump away from the canvas).
  function scrollWithin(list, el) {
    const lr = list.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (list.scrollHeight <= list.clientHeight + 1) return;
    if (r.top < lr.top) list.scrollTop -= lr.top - r.top + 6;
    else if (r.bottom > lr.bottom) list.scrollTop += r.bottom - lr.bottom + 6;
  }

  // ---------- wiring ----------
  function init() {
    $("#layer-list").addEventListener("keydown", onListKey);
    $("#layer-list").addEventListener("pointerleave", () => focusOn(null));
    $("#layer-list").addEventListener("focusout", (e) => { if (!$("#layer-list").contains(e.relatedTarget)) focusOn(null); });
    $("#btn-add-layer").addEventListener("click", () => ACT().addLayer());
    $("#btn-dup").addEventListener("click", () => ACT().duplicate());
    $("#btn-del").addEventListener("click", () => ACT().remove());
    $("#btn-fwd").addEventListener("click", () => ACT().restack(1));
    $("#btn-back").addEventListener("click", () => ACT().restack(-1));
    const dvBtn = $("#btn-depthview"), dv = $("#depthview");
    const setDV = (on) => {
      dv.hidden = !on;
      dvBtn.setAttribute("aria-pressed", String(on));
      prefs.set("depthview", on);
      if (on) renderDepth();
    };
    setDV(prefs.get("depthview", true));
    dvBtn.addEventListener("click", () => { setDV(dv.hidden); bump(dvBtn); });
    ED.toggleDepthView = () => setDV(dv.hidden);
    ED.depthViewOn = () => !dv.hidden;

    ED.on("load", () => { expanded.clear(); thumbs.clear(); });
    ED.on("select", () => {
      if (ED.sel.layer && ED.hasPieces()) expanded.add(ED.sel.layer);
      render();
      const row = ED.sel.layer && document.querySelector(`#layer-list [data-id="${esc(ED.sel.layer)}"]`);
      if (row && !drag) {
        const target = (ED.sel.item && document.querySelector(`#layer-list .item-btn[data-item="${esc(ED.sel.item)}"]`))
          || (ED.sel.group && document.querySelector(`#layer-list .item-btn[data-group="${esc(ED.sel.group)}"]`)) || row;
        scrollWithin($("#layer-list"), target);
      }
    });
    ED.on("doc", (e) => { if (e && e.preview) lightUpdate(); else render(); });
    ED.on("names", render);
    ED.on("synced", () => scheduleThumbs(200));
  }

  LB.LAYERS = { setHot, focusOn, get hot() { return hot; }, get focus() { return focus; }, slots, mergeMenu, startGroupRename, init, render, thumbOf, fillThumb, itemThumb, renderThumb, toURL, layerIcon, itemIcon, itemColor, kindText, depthWord, scheduleThumbs, layerMenu, startRename };
})();
