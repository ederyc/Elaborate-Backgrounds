/*
  The canvas: the view, the selection overlay, and direct manipulation.

    View         the canvas fills the stage. The scene sits on a pasteboard
                 (dimmed outside the frame). Ctrl + wheel (or a pinch) zooms
                 at the pointer, the wheel pans, and so do Space + drag, the
                 hand tool (H) and the middle button. 100% is the scene at
                 1080 pixels tall, the size of a 1080p wallpaper.
    Guides       G shows the slice a phone and a desktop screen would show.
    Select tool  click a piece to select it, drag to move it. Any corner
                 handle scales, the round handle on top rotates (Shift: 15°
                 steps). Moving snaps to the frame's edges and middle and to
                 other pieces (pink lines); hold Alt to move freely.
    Shape tools  drag out a box to draw a shape into the selected layer.
    Pen          click to place points; click the first point, double-click
                 or press Enter to close the outline.
    Points       double-click a cut-out (or press Enter) to edit its points:
                 drag a point, drag a + between two points to add one,
                 Alt-click a point to remove it. Keys: [ and ] pick a point,
                 arrows move it, + adds one after it, Delete removes it.
    Poses        with "This pose" on (under the canvas), moving, scaling or
                 rotating a piece changes only the pose on screen.
    Drops        store pieces and picture files can be dropped in place.
    Menu         right-click a piece, or the empty canvas.
    Keys         arrows move (Shift: further), Delete removes, Escape
                 deselects. The rest are in main.js.

  Positions on screen come from the renderer's current view and each
  layer's current pose (parallax offset and drift), so the overlay lines up
  with what's drawn, even while it plays. Sway rotation isn't followed.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const I = () => LB.ITEMS;
  const ACT = () => LB.ACT;
  const D = () => LB.DOC;
  const { menu, pop, prefs, bump } = LB.UI;
  const SVG = "http://www.w3.org/2000/svg";
  const A = () => (ED.doc && ED.doc.aspect) || 16 / 9;

  let viewport, overlay;
  let drag = null;
  let hover = null;
  let pen = null;           // { pts: [scene points], at: last pointer position }
  let pan = null;           // { x, y, c0 }
  let presenting = false;
  ED.tool = "select";
  ED.pointEdit = false;     // editing the points of the selected custom outline
  ED.pointSel = null;
  ED.guides = prefs.get("guides", false);
  ED.snap = prefs.get("snap", true);
  ED.space = { down: false, used: false };

  // ---------- the view ----------
  // z is CSS pixels per scene unit; c is the scene point at the middle of the stage.
  const view = { fit: true, z: 400, c: [16 / 9 / 2, 0.5] };
  const ACTUAL = 1080; // 100%: the scene's height at 1080 px
  const size = () => [viewport.clientWidth, viewport.clientHeight];
  function fitZoom() {
    const [W, H] = size();
    const pad = W < 640 ? 14 : 40;
    return Math.max(10, Math.min((W - pad * 2) / A(), (H - pad * 2) / 1));
  }
  const clampZ = (z) => Math.max(fitZoom() * 0.3, Math.min(z, ACTUAL * 8));
  function applyView() {
    if (!ED.renderer) return;
    if (presenting) { ED.renderer.setView(null); updateZoomUI(); return; }
    const [W, H] = size();
    if (view.fit) { view.z = fitZoom(); view.c = [A() / 2, 0.5]; }
    view.c = [Math.max(0, Math.min(A(), view.c[0])), Math.max(0, Math.min(1, view.c[1]))];
    const vw = W / view.z, vh = H / view.z;
    ED.renderer.setView([view.c[0] - vw / 2, view.c[1] - vh / 2, vw, vh]);
    updateZoomUI();
  }
  function fit() {
    if (!viewport || !ED.renderer) return;
    const [W, H] = size();
    if (W < 8 || H < 8) return;
    overlay.setAttribute("viewBox", `0 0 ${W} ${H}`);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const k = Math.min(dpr, Math.sqrt((1920 * 1200) / (W * H)));
    ED.renderer.resize(W * k, H * k);
    applyView();
    ED.redraw();
  }
  let anim = 0;
  function animateTo(z, c, fitAfter = false) {
    cancelAnimationFrame(anim);
    const z0 = view.z, c0 = view.c.slice(), t0 = performance.now(), dur = LB.UI.reduce() ? 0 : 220;
    view.fit = false;
    const step = (now) => {
      const t = dur ? Math.min(1, (now - t0) / dur) : 1;
      const e = 1 - Math.pow(1 - t, 3);
      // Zoom in log space, so it feels even.
      view.z = Math.exp(Math.log(z0) + (Math.log(z) - Math.log(z0)) * e);
      view.c = [c0[0] + (c[0] - c0[0]) * e, c0[1] + (c[1] - c0[1]) * e];
      if (t >= 1 && fitAfter) view.fit = true;
      applyView();
      ED.redraw();
      if (t < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }
  function zoomAt(f, cx, cy) {
    const r = viewport.getBoundingClientRect();
    if (cx == null) { cx = r.left + r.width / 2; cy = r.top + r.height / 2; }
    const p = toScene(cx, cy);
    const z = clampZ(view.z * f);
    view.fit = false;
    view.z = z;
    view.c = [p[0] - (cx - r.left - r.width / 2) / z, p[1] - (cy - r.top - r.height / 2) / z];
    applyView();
    ED.redraw();
  }
  const zoomBy = (f) => { const z = clampZ(view.z * f); animateTo(z, view.c); };
  const zoomFit = () => animateTo(fitZoom(), [A() / 2, 0.5], true);
  const zoomTo = (pct) => animateTo(clampZ((ACTUAL * pct) / 100), view.c);
  function zoomFill() {
    const [W, H] = size();
    animateTo(Math.max(W / A(), H), [A() / 2, 0.5]);
  }
  function zoomToSelection() {
    const pts = selOutline();
    if (!pts) return zoomFit();
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    const [W, H] = size();
    const w = Math.max(0.02, Math.max(...xs) - Math.min(...xs)), hh = Math.max(0.02, Math.max(...ys) - Math.min(...ys));
    animateTo(clampZ(Math.min((W * 0.6) / w, (H * 0.6) / hh)), [(Math.max(...xs) + Math.min(...xs)) / 2, (Math.max(...ys) + Math.min(...ys)) / 2]);
  }
  function updateZoomUI() {
    const b = document.getElementById("btn-zoom-pct");
    if (!b) return;
    b.textContent = presenting ? "" : view.fit ? "Fit" : `${Math.round((view.z / ACTUAL) * 100)}%`;
    b.setAttribute("aria-label", `Zoom: ${view.fit ? "fit to the stage" : b.textContent}. Zoom presets.`);
  }
  function zoomMenu(anchor) {
    menu([
      { label: "Fit the scene", icon: "fit", keys: "Ctrl 0", run: zoomFit },
      { label: "Fill the stage", icon: "fit", run: zoomFill },
      { label: "Zoom to the selection", icon: "search", keys: "Shift 2", disabled: !ED.sel.layer, run: zoomToSelection },
      "-",
      ...[25, 50, 100, 200, 400].map((p) => ({ label: `${p}%`, keys: p === 100 ? "Ctrl 1" : null, checked: !view.fit && Math.round((view.z / ACTUAL) * 100) === p, run: () => zoomTo(p) })),
    ], { anchor, label: "Zoom" });
  }

  // ---------- coordinates ----------
  function toScene(clientX, clientY) {
    const r = viewport.getBoundingClientRect();
    const v = ED.renderer.view;
    return [v[0] + ((clientX - r.left) / r.width) * v[2], v[1] + ((clientY - r.top) / r.height) * v[3]];
  }
  function toScreen(p) {
    const [w, h] = size();
    const v = ED.renderer.view;
    return [((p[0] - v[0]) / v[2]) * w, ((p[1] - v[1]) / v[3]) * h];
  }
  function toClient(p) {
    const r = viewport.getBoundingClientRect();
    const s = toScreen(p);
    return [r.left + s[0], r.top + s[1]];
  }
  const pxToScene = (px) => (px / size()[0]) * ED.renderer.view[2];
  // Where new pieces go: the middle of what's on screen, kept inside the frame.
  ED.viewCenter = () => {
    const v = ED.renderer.view;
    return [Math.max(0.08, Math.min(A() - 0.08, v[0] + v[2] / 2)), Math.max(0.08, Math.min(0.92, v[1] + v[3] / 2))];
  };

  function poseOffset(L) {
    const p = ED.renderer.poseOf(L.id, ED.clock);
    return p ? [p.ox, p.oy] : L.offset || [0, 0];
  }
  // A piece as it stands in the layer's current pose.
  const posedItem = (L, item) => I().atPose(item, ED.renderer.frameOf(L.id, ED.clock));
  const layerRef = (L) => (L.rect ? { rect: L.rect } : L);

  // Scene-space outline of a selected thing: 4 corners (an item) or a box (a layer).
  function outlineOf(L, item) {
    const off = poseOffset(L);
    if (item) {
      const it = posedItem(L, item);
      return I().corners(it, L, I().outlineBox(it, L)).map((p) => [p[0] + off[0], p[1] + off[1]]);
    }
    let b;
    if (L.type === "sparkles") b = L.area;
    else {
      const rendered = ED.renderer.layers.find((l) => l.id === L.id);
      if (!rendered || !rendered.rect) return null;
      b = rendered.rect;
      if (!L.type && L.paint.length) {
        // A paint layer's box is the union of its pieces, not its whole texture.
        b = null;
        for (const it of L.paint) b = I().union(b, I().worldBox(posedItem(L, it), layerRef(L)));
      }
    }
    if (!b) return null;
    return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map((p) => [p[0] + off[0], p[1] + off[1]]);
  }

  // Several pieces (a group, or a Shift-click selection): the box around all of them.
  function membersOutline(L, members) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of members) {
      if (posedItem(L, it).hide) continue;
      for (const q of outlineOf(L, it)) { x0 = Math.min(x0, q[0]); y0 = Math.min(y0, q[1]); x1 = Math.max(x1, q[0]); y1 = Math.max(y1, q[1]); }
    }
    if (!isFinite(x0)) return null;
    return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  }
  const isMany = () => !!(ED.sel.group || ED.sel.multi);
  // The outline of whatever is selected: a piece, several pieces, or the layer.
  function selOutline() {
    const L = ED.selLayer();
    if (!L) return null;
    if (isMany()) return membersOutline(L, ED.selMembers());
    return outlineOf(L, ED.selItem());
  }
  // The group a click on this piece should pick, unless we're already working inside that group.
  function groupFor(L, item) {
    if (!item || !item.group || !L.groups || !L.groups[item.group]) return null;
    const cur = ED.selItem();
    if (ED.sel.layer === L.id && cur && cur.group === item.group) return null;
    return item.group;
  }

  // ---------- hit testing ----------
  function hitTest(p) {
    const layers = ED.doc.layers;
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (L.hidden || L.locked) continue;
      const off = poseOffset(L);
      const q = [p[0] - off[0], p[1] - off[1]];
      if (L.type === "sprite") {
        const b = LB.SPRITE.bbox({ ...L, index: 0 });
        // A flower's box is mostly air; only count the head and the stem.
        const head = Math.hypot(q[0] - L.c[0], q[1] - L.c[1]) < L.size * 1.6;
        const stem = q[0] > b[0] && q[0] < b[2] && q[1] > Math.min(L.c[1], L.a[1]) && q[1] < Math.max(L.c[1], L.a[1]) && Math.abs(q[0] - (L.a[0] + L.c[0]) / 2) < 0.02;
        if (head || stem) return { layer: L.id };
        continue;
      }
      if (L.type === "sparkles") continue;
      for (let k = L.paint.length - 1; k >= 0; k--) {
        const item = L.paint[k];
        // Full-frame study shaders (the sky) would catch every click; only pick them when nothing else is there.
        if (item.shader) continue;
        const it = posedItem(L, item);
        if (it.hide) continue;
        if (I().hit(it, layerRef(L), q)) return { layer: L.id, item: item.id };
      }
    }
    // Only inside the frame for the study's full-frame art.
    if (p[0] < 0 || p[0] > A() || p[1] < 0 || p[1] > 1) return null;
    for (let i = layers.length - 1; i >= 0; i--) {
      const L = layers[i];
      if (L.hidden || L.locked || L.type) continue;
      const sh = L.paint.find((it) => it.shader);
      if (sh) return { layer: L.id, item: sh.id };
    }
    return null;
  }

  // ---------- editing points ----------
  const isPath = (it) => it && it.el === "shape" && it.shape === "path" && Array.isArray(it.points);
  function pointScene(L, item, q) {
    const off = poseOffset(L);
    const w = I().toScene(posedItem(L, item), L, q);
    return [w[0] + off[0], w[1] + off[1]];
  }
  function sceneToLocal(L, item, p) {
    const off = poseOffset(L);
    return I().toLocal(posedItem(L, item), L, [p[0] - off[0], p[1] - off[1]]);
  }
  function setPointEdit(on) {
    const item = ED.selItem();
    on = !!on && isPath(item) && !ED.selLayer().locked;
    if (on === ED.pointEdit) return;
    ED.pointEdit = on;
    ED.pointSel = on ? 0 : null;
    if (on) ED.emit("status", { msg: "Editing points. Drag a point to move it, drag a + to add one, Alt-click to remove one. Enter when you're done." });
    ED.emit("point-edit", on);
    drawOverlay();
  }
  ED.setPointEdit = setPointEdit;

  // ---------- editing a 3D piece's parts ----------
  const isClay = (it) => it && it.el === "clay";
  function partScreen(L, item, i) {
    const posed = posedItem(L, item);
    const q = LB.CLAY.project(posed, item.parts[i].at);
    const off = poseOffset(L);
    const w = I().toScene(posed, L, [q[0], q[1]]);
    return toScreen([w[0] + off[0], w[1] + off[1]]);
  }
  function setPartEdit(on) {
    on = !!on && isClay(ED.selItem()) && !ED.selLayer().locked;
    if (on === ED.partEdit) return;
    ED.partEdit = on;
    if (on) ED.emit("status", { msg: "Editing parts. Click a dot to pick a part, drag it to move it. Depth and size are in the inspector. Enter when you're done." });
    ED.emit("point-edit", on);
    drawOverlay();
  }

  // ---------- overlay ----------
  const el = (tag, attrs) => {
    const e = document.createElementNS(SVG, tag);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    return e;
  };
  const poly = (pts) => pts.map((p) => toScreen(p).map((v) => v.toFixed(1)).join(",")).join(" ");

  // Handles sit a little outside the piece, so on a small piece grabbing its body moves it instead of scaling it.
  function handlesFor(pts) {
    const raw = pts.map(toScreen);
    const center = [(raw[0][0] + raw[2][0]) / 2, (raw[0][1] + raw[2][1]) / 2];
    const s = raw.map((c) => {
      const d = [c[0] - center[0], c[1] - center[1]], l = Math.hypot(d[0], d[1]) || 1;
      return [c[0] + (d[0] / l) * 9, c[1] + (d[1] / l) * 9];
    });
    const top = [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2];
    const dir = [top[0] - center[0], top[1] - center[1]];
    const len = Math.hypot(...dir) || 1;
    const rot = [top[0] + (dir[0] / len) * 28, top[1] + (dir[1] / len) * 28];
    return { corners: s, rotate: rot, top, center };
  }

  // Which crop a screen of aspect a shows of the scene (the same rule as the renderer's).
  function cropOf(a) {
    const S = A(), f = (ED.doc && ED.doc.focus) || [S / 2, 0.5];
    if (a >= S) { const vh = S / a; return [0, Math.min(Math.max(f[1] - vh / 2, 0), 1 - vh), S, Math.min(Math.max(f[1] - vh / 2, 0), 1 - vh) + vh]; }
    const vw = a;
    const x0 = Math.min(Math.max(f[0] - vw / 2, 0), S - vw);
    return [x0, 0, x0 + vw, 1];
  }

  let selKey = "", hoverKey = "", badge = null, snaps = [];
  function drawOverlay() {
    if (!overlay || ED.recording || !ED.renderer) return;
    overlay.replaceChildren();
    if (presenting) return;
    const [W, H] = size();
    // The pasteboard: everything outside the frame is dimmed.
    const a = toScreen([0, 0]), b = toScreen([A(), 1]);
    overlay.append(el("rect", { class: "ov-frame-sh", x: a[0] - 4, y: a[1] - 4, width: b[0] - a[0] + 8, height: b[1] - a[1] + 8, rx: 3 }),
      el("path", { class: "ov-dim", "fill-rule": "evenodd", d: `M0 0H${W}V${H}H0Z M${a[0]} ${a[1]}H${b[0]}V${b[1]}H${a[0]}Z` }),
      el("rect", { class: "ov-frame", x: a[0] - 0.5, y: a[1] - 0.5, width: b[0] - a[0] + 1, height: b[1] - a[1] + 1 }));
    if (ED.guides) {
      for (const [ar, name] of [[16 / 9, "Desktop 16:9"], [21 / 9, "Ultrawide"], [9 / 19.5, "Phone"]]) {
        if (Math.abs(ar / A() - 1) < 0.04) continue;
        const c = cropOf(ar);
        const p = toScreen([c[0], c[1]]), q = toScreen([c[2], c[3]]);
        overlay.append(el("rect", { class: "ov-guide", x: p[0], y: p[1], width: q[0] - p[0], height: q[1] - p[1], rx: 4 }));
        const t = el("text", { class: "ov-guide-label", x: p[0] + 8, y: p[1] + 16 });
        t.textContent = name;
        overlay.append(t);
      }
    }
    for (const s of snaps) {
      if (s.x != null) { const x = toScreen([s.x, 0])[0]; overlay.append(el("line", { class: "ov-snap", x1: x, y1: 0, x2: x, y2: H })); }
      else { const y = toScreen([0, s.y])[1]; overlay.append(el("line", { class: "ov-snap", x1: 0, y1: y, x2: W, y2: y })); }
    }
    if (pen && pen.pts.length) {
      const pts = [...pen.pts, ...(pen.at ? [pen.at] : [])].map(toScreen);
      overlay.append(el("polyline", { class: "ov-draw", points: pts.map((q) => q.join(",")).join(" "), fill: "none" }));
      pen.pts.forEach((q, i) => {
        const sp = toScreen(q);
        overlay.append(el("rect", { class: `ov-point${i === 0 && pen.pts.length >= 3 ? " is-first" : ""}`, x: sp[0] - 4, y: sp[1] - 4, width: 8, height: 8 }));
      });
      return;
    }
    if (drag && drag.kind === "draw") {
      const [p, q] = [toScreen(drag.p0), toScreen(drag.p1)];
      overlay.append(el("rect", { class: "ov-draw", x: Math.min(p[0], q[0]), y: Math.min(p[1], q[1]), width: Math.abs(q[0] - p[0]), height: Math.abs(q[1] - p[1]), rx: 3 }));
      drawBadge();
      return;
    }
    if (hover && !(hover.layer === ED.sel.layer && hover.item === ED.sel.item)) {
      const L = ED.layer(hover.layer);
      const item = hover.item ? ED.item(hover.layer, hover.item) : null;
      const hg = L && groupFor(L, item);
      const inSel = L && item && ED.sel.layer === L.id && ED.selMembers().includes(item) && isMany();
      const pts = inSel ? null : hg ? membersOutline(L, L.paint.filter((it) => it.group === hg)) : L && outlineOf(L, item);
      const key = hover.layer + "/" + hover.item;
      if (pts) overlay.append(el("polygon", { class: `ov-hover${key !== hoverKey ? " is-new" : ""}`, points: poly(pts) }));
      hoverKey = key;
    } else hoverKey = "";
    const L = ED.selLayer();
    if (!L) { selKey = ""; drawBadge(); return; }
    const many = isMany();
    const item = many ? null : ED.selItem();
    const members = many ? ED.selMembers() : [];
    const pts = many ? membersOutline(L, members) : outlineOf(L, item);
    if (!pts) { drawBadge(); return; }
    const key = `${L.id}/${item ? item.id : ED.sel.group || (ED.sel.multi || []).join(",")}`;
    const g = el("g", { class: `ov-group${key !== selKey ? " is-new" : ""}` });
    selKey = key;
    overlay.append(g);
    // A piece's box is padded out a little, to match its handles; a layer's box is its exact bounds.
    const piece = item || many;
    const selPts = piece ? handlesFor(pts).corners.map((c) => c.map((v) => v.toFixed(1)).join(",")).join(" ") : poly(pts);
    // A group shows each of its pieces faintly inside its box.
    for (const it of members) { const o = posedItem(L, it).hide ? null : outlineOf(L, it); if (o) g.append(el("polygon", { class: "ov-member", points: poly(o) })); }
    g.append(el("polygon", { class: "ov-sel-glow", points: selPts }), el("polygon", { class: `ov-sel${piece ? "" : " is-layer"}${ED.sel.group ? " is-group" : ""}`, points: selPts }));
    if (ED.partEdit && isClay(item)) {
      item.parts.forEach((pt, i) => {
        const q = partScreen(L, item, i);
        g.append(el("circle", { class: `ov-part${i === ED.partSel ? " is-selected" : ""}${pt.carve ? " is-carve" : ""}`, cx: q[0], cy: q[1], r: i === ED.partSel ? 7 : 5 }));
      });
      return;
    }
    if (ED.pointEdit && isPath(item)) {
      const cps = item.points.map((q) => pointScene(L, item, q));
      g.append(el("polygon", { class: "ov-ctrl", points: poly(cps) }));
      cps.forEach((q, i) => {
        const p = toScreen(q), r = toScreen(cps[(i + 1) % cps.length]);
        if (item.points.length < 32) g.append(el("circle", { class: "ov-mid", cx: (p[0] + r[0]) / 2, cy: (p[1] + r[1]) / 2, r: 4 }));
      });
      cps.forEach((q, i) => {
        const p = toScreen(q);
        g.append(el("rect", { class: `ov-point${i === ED.pointSel ? " is-selected" : ""}`, x: p[0] - 5, y: p[1] - 5, width: 10, height: 10, rx: 2 }));
      });
      return;
    }
    if ((item || many) && !L.locked) {
      const hd = handlesFor(pts);
      g.append(el("line", { class: "ov-stalk", x1: hd.top[0], y1: hd.top[1], x2: hd.rotate[0], y2: hd.rotate[1] }),
        el("circle", { class: "ov-rot", cx: hd.rotate[0], cy: hd.rotate[1], r: 6.5 }));
      for (const c of hd.corners) g.append(el("rect", { class: "ov-handle", x: c[0] - 5.5, y: c[1] - 5.5, width: 11, height: 11, rx: 3 }));
    }
    drawBadge();
  }
  // A small readout by the pointer while scaling, turning or drawing.
  function drawBadge() {
    if (!badge) return;
    const t = el("text", { class: "ov-badge", x: badge.x + 18, y: badge.y + 30 });
    t.textContent = badge.text;
    overlay.append(t);
    const w = badge.text.length * 7.2 + 12;
    const bg = el("rect", { class: "ov-badge-bg", x: badge.x + 12, y: badge.y + 16, width: w, height: 20, rx: 6 });
    overlay.insertBefore(bg, t);
  }
  ED.drawOverlay = drawOverlay;

  // ---------- snapping ----------
  function snapTargets(skip) {
    const skipped = (it) => (skip instanceof Set ? skip.has(it) : it === skip);
    const S = A();
    const xs = [0, S / 2, S], ys = [0, 0.5, 1];
    let n = 0;
    for (const L of ED.doc.layers) {
      if (L.hidden || L.type) continue;
      const off = poseOffset(L);
      for (const it of L.paint) {
        if (skipped(it) || it.shader || n > 400) continue;
        const b = I().worldBox(posedItem(L, it), layerRef(L));
        if (!b) continue;
        n++;
        xs.push(b[0] + off[0], (b[0] + b[2]) / 2 + off[0], b[2] + off[0]);
        ys.push(b[1] + off[1], (b[1] + b[3]) / 2 + off[1], b[3] + off[1]);
      }
    }
    return { xs, ys };
  }
  // Moves the box by (dx, dy), nudged onto the nearest guide within a few pixels.
  function snapMove(box, dx, dy, targets) {
    snaps = [];
    const thr = pxToScene(7);
    const best = (vals, list) => {
      let m = null;
      for (const v of vals) for (const t of list) { const d = t - v; if (Math.abs(d) < thr && (!m || Math.abs(d) < Math.abs(m.d))) m = { d, t }; }
      return m;
    };
    const bx = best([box[0] + dx, (box[0] + box[2]) / 2 + dx, box[2] + dx], targets.xs);
    const by = best([box[1] + dy, (box[1] + box[3]) / 2 + dy, box[3] + dy], targets.ys);
    if (bx) { dx += bx.d; snaps.push({ x: bx.t }); }
    if (by) { dy += by.d; snaps.push({ y: by.t }); }
    return [dx, dy];
  }

  // ---------- pointer ----------
  const near = (a, b, r = 14) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= r;
  function localPoint(e) {
    const r = viewport.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function inside(pts, p) {
    // Point in a convex quad (scene space).
    let sign = 0;
    for (let i = 0; i < 4; i++) {
      const a = pts[i], b = pts[(i + 1) % 4];
      const c = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
      if (c !== 0) { if (sign && Math.sign(c) !== sign) return false; sign = Math.sign(c); }
    }
    return true;
  }
  const panning = () => ED.tool === "hand" || ED.space.down;

  function onDown(e) {
    if (ED.recording || presenting) return;
    if (e.button === 1 || (e.button === 0 && panning())) {
      e.preventDefault();
      cancelAnimationFrame(anim);
      viewport.setPointerCapture(e.pointerId);
      pan = { x: e.clientX, y: e.clientY, c0: view.c.slice() };
      if (ED.space.down) ED.space.used = true;
      viewport.classList.add("is-panning");
      return;
    }
    if (e.button !== 0) return;
    const p = toScene(e.clientX, e.clientY);
    const lp = localPoint(e);
    viewport.setPointerCapture(e.pointerId);

    if (ED.tool === "pen") {
      pen = pen || { pts: [] };
      if (pen.pts.length >= 3 && near(lp, toScreen(pen.pts[0]), 10)) return finishPen();
      pen.pts.push(p);
      if (pen.pts.length >= 32) return finishPen();
      drawOverlay();
      return;
    }
    if (ED.tool !== "select") {
      drag = { kind: "draw", p0: p, p1: p, start: lp };
      drawOverlay();
      return;
    }
    const L = ED.selLayer();
    const item = ED.selItem();
    if (ED.partEdit && isClay(item)) {
      // Pick the nearest dot (selected part first, so stacked parts stay reachable).
      const order = [ED.partSel, ...item.parts.map((_, i) => i).filter((i) => i !== ED.partSel)];
      const hitPart = order.find((i) => near(lp, partScreen(L, item, i), 9));
      if (hitPart !== undefined) {
        if (hitPart !== ED.partSel) { ED.partSel = hitPart; ED.emit("part-select"); }
        const pt = item.parts[hitPart];
        drag = { kind: "part", item, L, i: hitPart, p0: sceneToLocal(L, item, p), base: { at: pt.at.slice(), to: pt.to && pt.to.slice() }, moved: false };
        drawOverlay();
        return;
      }
      setPartEdit(false);
    }
    if (ED.pointEdit && isPath(item)) {
      const cps = item.points.map((q) => toScreen(pointScene(L, item, q)));
      const hitPt = cps.findIndex((q) => near(lp, q, 9));
      if (hitPt >= 0) {
        if (e.altKey) {
          if (item.points.length > 3) {
            ED.change(() => item.points.splice(hitPt, 1), "Remove point");
            ED.pointSel = Math.min(hitPt, item.points.length - 1);
          } else ED.emit("status", { msg: "An outline needs at least 3 points." });
          drawOverlay();
          return;
        }
        ED.pointSel = hitPt;
        drag = { kind: "point", item, L, i: hitPt, moved: false };
        drawOverlay();
        return;
      }
      if (item.points.length < 32) {
        const mid = cps.findIndex((q, i) => { const b = cps[(i + 1) % cps.length]; return near(lp, [(q[0] + b[0]) / 2, (q[1] + b[1]) / 2], 8); });
        if (mid >= 0) {
          const a = item.points[mid], b = item.points[(mid + 1) % item.points.length];
          ED.preview(() => item.points.splice(mid + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]));
          ED.pointSel = mid + 1;
          drag = { kind: "point", item, L, i: mid + 1, moved: true, added: true };
          return;
        }
      }
      setPointEdit(false);
    }
    // A group or several pieces: one box, moved, scaled and turned around its middle.
    if (L && isMany() && !L.locked && !e.shiftKey) {
      const pts = membersOutline(L, ED.selMembers());
      if (pts) {
        const hd = handlesFor(pts);
        const f0 = ED.renderer.frameOf(L.id, ED.clock);
        const off = poseOffset(L);
        const cScene = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2];
        const c = [cScene[0] - off[0], cScene[1] - off[1]];
        const base = ACT().membersBase(L, ED.selMembers(), f0);
        const common = { L, f0, c, cScene, base, moved: false, box: [pts[0][0], pts[0][1], pts[2][0], pts[2][1]] };
        if (near(lp, hd.rotate, 11)) { drag = { kind: "grotate", ...common, a0: Math.atan2(p[1] - cScene[1], p[0] - cScene[0]) }; return; }
        if (hd.corners.some((q) => near(lp, q, 9))) { drag = { kind: "gscale", ...common, d0: Math.hypot(p[0] - cScene[0], p[1] - cScene[1]) || 1e-3 }; return; }
        const hit0 = hitTest(p);
        if (hit0 && hit0.layer === L.id && ED.selMembers().some((it) => it.id === hit0.item)) { drag = { kind: "gmove", ...common, p0: p }; return; }
      }
    }
    if (L && item && !L.locked) {
      const pts = outlineOf(L, item);
      const hd = handlesFor(pts);
      const f0 = ED.renderer.frameOf(L.id, ED.clock);
      const t = I().atPose(item, f0).xf;
      const pos = I().position(posedItem(L, item), layerRef(L));
      const off = poseOffset(L);
      const centerScene = [pos[0] + off[0], pos[1] + off[1]];
      if (near(lp, hd.rotate, 11)) {
        drag = { kind: "rotate", item, L, f0, t0: t, a0: Math.atan2(p[1] - centerScene[1], p[0] - centerScene[0]), c: centerScene, moved: false };
        return;
      }
      if (hd.corners.some((c) => near(lp, c, 9))) {
        drag = { kind: "scale", item, L, f0, t0: t, d0: Math.hypot(p[0] - centerScene[0], p[1] - centerScene[1]) || 1e-3, c: centerScene, moved: false };
        return;
      }
    }
    // A whole layer selected from the list: drag inside its box to move the layer.
    if (L && !item && !L.locked) {
      const pts = outlineOf(L, null);
      if (pts && inside(pts, p)) {
        drag = { kind: "layer", L, p0: p, o0: (L.offset || [0, 0]).slice(), moved: false };
        return;
      }
    }
    const hit = hitTest(p);
    if (!hit) {
      if (!e.shiftKey) ED.select(null);
      drag = null;
      return;
    }
    const HL = ED.layer(hit.layer);
    const hitItem = hit.item ? ED.item(hit.layer, hit.item) : null;
    // Shift-click adds a piece (or its whole group) to the selection, or takes it out. One layer at a time.
    if (e.shiftKey && hitItem) {
      const unit = (it) => { const g = groupFor(HL, it); return g ? HL.paint.filter((x) => x.group === g) : [it]; };
      let ids = ED.sel.layer === HL.id ? ED.selMembers().map((it) => it.id) : [];
      const add = unit(hitItem).map((it) => it.id);
      ids = add.every((id) => ids.includes(id)) ? ids.filter((id) => !add.includes(id)) : [...new Set([...ids, ...add])];
      ED.selectMany(HL.id, ids);
      drag = null;
      return;
    }
    // A click on a grouped piece picks its group (double-click reaches the piece inside).
    const hg = HL && groupFor(HL, hitItem);
    if (hg) {
      if (ED.sel.layer !== HL.id || ED.sel.group !== hg) ED.selectGroup(HL.id, hg);
      const f0 = ED.renderer.frameOf(HL.id, ED.clock);
      const pts = membersOutline(HL, ED.selMembers());
      const off = poseOffset(HL);
      const cScene = [(pts[0][0] + pts[2][0]) / 2, (pts[0][1] + pts[2][1]) / 2];
      if (!HL.locked) drag = { kind: "gmove", L: HL, f0, p0: p, c: [cScene[0] - off[0], cScene[1] - off[1]], cScene, base: ACT().membersBase(HL, ED.selMembers(), f0), moved: false, box: [pts[0][0], pts[0][1], pts[2][0], pts[2][1]] };
      return;
    }
    if (hit.layer !== ED.sel.layer || hit.item !== ED.sel.item) ED.select(hit.layer, hit.item || null);
    if (hit.item) {
      const it = ED.item(hit.layer, hit.item);
      const f0 = ED.renderer.frameOf(HL.id, ED.clock);
      const posed = posedItem(HL, it);
      const off = poseOffset(HL);
      const wb = I().worldBox(posed, layerRef(HL));
      drag = { kind: "move", item: it, L: HL, f0, p0: p, t0: I().atPose(it, f0).xf, moved: false,
        box: wb && [wb[0] + off[0], wb[1] + off[1], wb[2] + off[0], wb[3] + off[1]], targets: null };
    } else {
      drag = { kind: "layer", L: HL, p0: p, o0: (HL.offset || [0, 0]).slice(), moved: false };
    }
  }

  function onMove(e) {
    if (pan) {
      view.fit = false;
      view.c = [pan.c0[0] - (e.clientX - pan.x) / view.z, pan.c0[1] - (e.clientY - pan.y) / view.z];
      applyView();
      ED.redraw();
      return;
    }
    const p = toScene(e.clientX, e.clientY);
    if (pen) { pen.at = p; drawOverlay(); return; }
    if (!drag) {
      if (panning()) { viewport.style.cursor = "grab"; return; }
      if (ED.tool === "select" && e.pointerType === "mouse" && !ED.pointEdit) {
        const hv = hitTest(p);
        const key = hv ? hv.layer + "/" + (hv.item || "") : "";
        const was = hover ? hover.layer + "/" + (hover.item || "") : "";
        if (key !== was) { hover = hv; drawOverlay(); }
        viewport.style.cursor = hv ? "move" : "default";
        const L = ED.selLayer(), item = ED.selItem();
        const selPts = L && (item || isMany()) && !L.locked ? selOutline() : null;
        if (selPts) {
          const hd = handlesFor(selPts);
          const lp = localPoint(e);
          if (near(lp, hd.rotate)) viewport.style.cursor = "grab";
          else {
            const ci = hd.corners.findIndex((c) => near(lp, c, 9));
            if (ci >= 0) viewport.style.cursor = ci % 2 === 0 ? "nwse-resize" : "nesw-resize";
          }
        }
      }
      return;
    }
    const lp = localPoint(e);
    if (drag.kind === "draw") {
      let p1 = p;
      if (e.shiftKey) {
        const dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        p1 = [drag.p0[0] + Math.sign(dx || 1) * m, drag.p0[1] + Math.sign(dy || 1) * m];
      }
      drag.p1 = p1;
      badge = { x: lp[0], y: lp[1], text: `${Math.round(Math.abs(p1[0] - drag.p0[0]) * ACTUAL)} × ${Math.round(Math.abs(p1[1] - drag.p0[1]) * ACTUAL)}` };
      drawOverlay();
      return;
    }
    drag.moved = true;
    const setXf = (nx) => ED.preview(() => ACT().setPosedXf(drag.item, drag.L, nx, drag.f0));
    if (drag.kind === "part") {
      const q = sceneToLocal(drag.L, drag.item, p);
      ED.preview(() => ACT().movePart(drag.item, drag.i, [q[0] - drag.p0[0], q[1] - drag.p0[1]], drag.base));
    } else if (drag.kind === "point") {
      const q = sceneToLocal(drag.L, drag.item, p);
      ED.preview(() => (drag.item.points[drag.i] = [Math.round(q[0] * 1e5) / 1e5, Math.round(q[1] * 1e5) / 1e5]));
    } else if (drag.kind === "move") {
      let dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
      if (ED.snap && !e.altKey && drag.box) {
        drag.targets = drag.targets || snapTargets(drag.item);
        [dx, dy] = snapMove(drag.box, dx, dy, drag.targets);
      } else snaps = [];
      setXf({ ...drag.t0, x: drag.t0.x + dx, y: drag.t0.y + dy });
    } else if (drag.kind === "gmove") {
      let dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
      if (ED.snap && !e.altKey) {
        drag.targets = drag.targets || snapTargets(new Set(drag.base.map((b) => b.item)));
        [dx, dy] = snapMove(drag.box, dx, dy, drag.targets);
      } else snaps = [];
      ED.preview(() => ACT().transformMembers(drag.L, drag.base, drag.f0, drag.c, { dx, dy }));
    } else if (drag.kind === "gscale") {
      const s = Math.min(8, Math.max(0.05, Math.hypot(p[0] - drag.cScene[0], p[1] - drag.cScene[1]) / drag.d0));
      badge = { x: lp[0], y: lp[1], text: `${Math.round(s * 100)}%` };
      ED.preview(() => ACT().transformMembers(drag.L, drag.base, drag.f0, drag.c, { s }));
    } else if (drag.kind === "grotate") {
      let r = Math.atan2(p[1] - drag.cScene[1], p[0] - drag.cScene[0]) - drag.a0;
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
      badge = { x: lp[0], y: lp[1], text: `${Math.round(((((r * 180) / Math.PI) % 360) + 540) % 360 - 180)}°` };
      ED.preview(() => ACT().transformMembers(drag.L, drag.base, drag.f0, drag.c, { r }));
    } else if (drag.kind === "layer") {
      const dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
      ED.preview(() => (drag.L.offset = [drag.o0[0] + dx, drag.o0[1] + dy]));
    } else if (drag.kind === "scale") {
      const d = Math.hypot(p[0] - drag.c[0], p[1] - drag.c[1]);
      const s = Math.min(8, Math.max(0.05, drag.t0.s * (d / drag.d0)));
      badge = { x: lp[0], y: lp[1], text: `${Math.round(s * 100)}%` };
      setXf({ ...drag.t0, s: Math.round(s * 100) / 100 });
    } else if (drag.kind === "rotate") {
      let r = drag.t0.r + Math.atan2(p[1] - drag.c[1], p[0] - drag.c[0]) - drag.a0;
      // Shift snaps to 15° steps.
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
      const deg = Math.round(((((r * 180) / Math.PI) % 360) + 540) % 360 - 180);
      badge = { x: lp[0], y: lp[1], text: `${deg}°` };
      setXf({ ...drag.t0, r });
    }
  }

  function onUp(e) {
    if (pan) {
      pan = null;
      viewport.classList.remove("is-panning");
      if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
      return;
    }
    if (!drag) return;
    const d = drag;
    drag = null;
    badge = null;
    snaps = [];
    if (viewport.hasPointerCapture(e.pointerId)) viewport.releasePointerCapture(e.pointerId);
    if (d.kind === "draw") {
      const a = toScreen(d.p0), b = toScreen(d.p1);
      let box;
      if (Math.abs(b[0] - a[0]) < 6 && Math.abs(b[1] - a[1]) < 6) {
        // A click instead of a drag: a medium shape centered there.
        const s = 0.1;
        box = [d.p0[0] - s, d.p0[1] - s * (ED.tool === "cloud" ? 0.5 : 0.75), d.p0[0] + s, d.p0[1] + s * (ED.tool === "cloud" ? 0.5 : 0.75)];
      } else box = [Math.min(d.p0[0], d.p1[0]), Math.min(d.p0[1], d.p1[1]), Math.max(d.p0[0], d.p1[0]), Math.max(d.p0[1], d.p1[1])];
      const tool = ED.tool;
      setTool("select");
      ACT().drawShape(tool, box);
      const c = toClient([(box[0] + box[2]) / 2, (box[1] + box[3]) / 2]);
      pop(c[0], c[1]);
      return;
    }
    if (d.moved) ED.commit(d.added ? "Add point" : { move: "Move", layer: "Move layer", scale: "Scale", rotate: "Rotate", point: "Move point", part: "Move part", gmove: "Move group", gscale: "Scale group", grotate: "Rotate group" }[d.kind] + (ED.poseMode === "pose" && d.L && d.L.cycle && d.kind !== "point" ? " (this pose)" : ""));
    drawOverlay();
  }

  // ---------- menus ----------
  function pieceMenu(at) {
    const L = ED.selLayer(), item = ED.selItem(), g = ED.selGroup(), members = ED.selMembers();
    if (!members.length) return L ? LB.LAYERS.layerMenu(L, at) : stageMenu(at);
    const others = ED.doc.layers.filter((l) => !l.type && l.id !== L.id);
    const title = g ? g.name : members.length > 1 ? `${members.length} pieces` : D().itemName(item, ED.doc);
    menu([
      { heading: title },
      { label: "Duplicate", icon: "copy", keys: "Ctrl D", run: () => ACT().duplicate() },
      { label: "Bring forward", icon: "up", keys: "]", run: () => ACT().restack(1) },
      { label: "Send backward", icon: "down", keys: "[", run: () => ACT().restack(-1) },
      ED.sel.multi ? { label: "Group", icon: "box", keys: "Ctrl G", run: () => ACT().group() } : null,
      g ? { label: "Ungroup", icon: "box", keys: "Ctrl Shift G", run: () => ACT().ungroup() } : null,
      item && item.group ? { label: `Take out of ${L.groups[item.group].name}`, icon: "box", run: () => ACT().takeOutOfGroup() } : null,
      item && isPath(item) ? { label: "Edit the points", icon: "points", keys: "Enter", run: () => setPointEdit(true) } : null,
      item && isClay(item) ? { label: "Edit the parts", icon: "points", keys: "Enter", run: () => setPartEdit(true) } : null,
      item && item.el === "image" ? { label: "Turn into a cut-out", icon: "scissors", run: () => ACT().toCutout() } : null,
      "-",
      { label: `Select its layer (${L.name})`, icon: "layers", run: () => ED.select(L.id) },
      others.length ? { label: "Move to the layer in front", icon: "up", disabled: !nextPaint(L, 1), run: () => ACT().moveItemToLayer(nextPaint(L, 1).id) } : null,
      others.length ? { label: "Move to the layer behind", icon: "down", disabled: !nextPaint(L, -1), run: () => ACT().moveItemToLayer(nextPaint(L, -1).id) } : null,
      (g || members.length > 1) && L.paint.length > members.length ? { label: "Give it a layer of its own", icon: "layers", run: () => ACT().splitToLayer() } : null,
      !members.some((it) => it.shader) ? { label: "Save to My pieces", icon: "heart", run: () => ACT().savePiece("item") } : null,
      { label: "Zoom to it", icon: "search", keys: "Shift 2", run: zoomToSelection },
      "-",
      { label: "Delete", icon: "trash", keys: "Del", danger: true, run: () => ACT().remove() },
    ].filter(Boolean), { ...at, label: `${title} menu` });
  }
  function nextPaint(L, dir) {
    const ls = ED.doc.layers;
    for (let i = ls.indexOf(L) + dir; i >= 0 && i < ls.length; i += dir) if (!ls[i].type && !ls[i].locked) return ls[i];
    return null;
  }
  function stageMenu(at) {
    menu([
      { label: "Add pieces", icon: "add", keys: "A", run: () => LB.STORE.open() },
      { label: "New layer", icon: "layers", run: () => ACT().addLayer() },
      "-",
      { label: "Fit the scene", icon: "fit", keys: "Ctrl 0", run: zoomFit },
      { label: "Actual size (100%)", icon: "search", keys: "Ctrl 1", run: () => zoomTo(100) },
      { label: "Screen guides", keys: "G", checked: ED.guides, run: () => setGuides(!ED.guides) },
      { label: "Snapping", checked: ED.snap, run: () => setSnap(!ED.snap) },
      "-",
      { label: "Present", icon: "present", keys: "F", run: () => ED.present && ED.present(true) },
    ], { ...at, label: "Canvas menu" });
  }
  function onContext(e) {
    e.preventDefault();
    if (ED.recording || presenting) return;
    if (ED.tool !== "select") setTool("select");
    const hit = hitTest(toScene(e.clientX, e.clientY));
    if (hit) {
      const HL = ED.layer(hit.layer), it = hit.item ? ED.item(hit.layer, hit.item) : null;
      const kept = ED.sel.layer === hit.layer && isMany() && it && ED.selMembers().includes(it);
      const hg = HL && groupFor(HL, it);
      if (!kept) { if (hg) ED.selectGroup(HL.id, hg); else if (hit.layer !== ED.sel.layer || hit.item !== ED.sel.item) ED.select(hit.layer, hit.item || null); }
      pieceMenu({ x: e.clientX, y: e.clientY });
    }
    else stageMenu({ x: e.clientX, y: e.clientY });
  }

  // ---------- tools ----------
  const TOOL_TIPS = {
    rect: "Rectangle: drag on the canvas to draw it. Shift keeps the sides equal.",
    ellipse: "Ellipse: drag on the canvas to draw it. Shift makes a circle.",
    triangle: "Triangle: drag on the canvas to draw it.",
    star: "Star: drag on the canvas to draw it.",
    cloud: "Cloud: drag on the canvas to draw it.",
    pen: "Your own outline: click to place points. Click the first point, double-click or press Enter to close it. Backspace takes back the last point.",
    hand: "Pan: drag the canvas around. Space and drag does the same with any tool.",
  };
  const told = new Set();
  function finishPen() {
    const pts = pen ? pen.pts.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 0.003) : [];
    pen = null;
    setTool("select");
    if (pts.length >= 3) ACT().penShape(pts);
    else ED.emit("status", { msg: "An outline needs at least 3 points." });
    drawOverlay();
  }
  function movePill() {
    const btn = document.querySelector(`[data-tool="${ED.tool}"]`), pill = document.querySelector(".rail-pill");
    if (!btn || !pill) return;
    const row = window.matchMedia("(max-width: 920px)").matches;
    pill.style.transform = row ? `translateX(${btn.offsetLeft}px)` : `translateY(${btn.offsetTop}px)`;
  }
  function setTool(t) {
    if (t !== "pen") pen = null;
    if (t !== "select") setPointEdit(false);
    const changed = ED.tool !== t;
    ED.tool = t;
    document.querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
    movePill();
    viewport.classList.toggle("is-drawing", t !== "select" && t !== "hand");
    viewport.classList.toggle("tool-hand", t === "hand");
    viewport.style.cursor = t === "select" ? "default" : t === "hand" ? "grab" : "crosshair";
    if (changed && TOOL_TIPS[t] && !told.has(t)) { told.add(t); ED.emit("status", { msg: TOOL_TIPS[t] }); }
    if (changed) bump(document.querySelector(`[data-tool="${t}"] .ic`));
    drawOverlay();
  }
  ED.setTool = setTool;

  function setGuides(on) {
    ED.guides = on;
    prefs.set("guides", on);
    const b = document.getElementById("btn-guides");
    b.setAttribute("aria-pressed", String(on));
    drawOverlay();
  }
  function setSnap(on) {
    ED.snap = on;
    prefs.set("snap", on);
    document.getElementById("btn-snap").setAttribute("aria-pressed", String(on));
  }
  function setPresenting(on) {
    presenting = on;
    hover = null;
    requestAnimationFrame(fit);
  }

  // A still of the scene at w x h with each of a few looks, for the Look tab's preset cards.
  function snapshot(w, h, looks) {
    const r = ED.renderer;
    if (!r || r.busy || ED.recording) return null;
    const prev = r.size;
    const out = {};
    try {
      r.setView(null);
      r.resize(w, h);
      for (const look of looks) {
        const post = ED.postFor(ED.doc);
        Object.assign(post, D().clone(look.post), { on: post.on, motion: post.motion, boil: post.boil, haze: post.haze, hidden: post.hidden, onion: null });
        r.setGrade(look.grade);
        r.setPost(post);
        r.invalidate();
        r.draw(ED.clock);
        out[look.k] = LB.LAYERS.toURL(r.readPixels());
      }
    } finally {
      r.setGrade(ED.doc.grades[ED.doc.grade]);
      r.setPost(ED.postFor(ED.doc));
      r.resize(prev[0], prev[1]);
      applyView();
      ED.redraw();
    }
    return out;
  }

  // ---------- keyboard on the canvas ----------
  let nudged = false;
  function onKey(e) {
    if (e.target !== viewport) return;
    const step = e.shiftKey ? 0.02 : 0.002;
    if (ED.tool === "pen" && pen) {
      if (e.key === "Enter") { e.preventDefault(); finishPen(); }
      else if (e.key === "Backspace" || e.key === "Delete") { e.preventDefault(); e.stopPropagation(); pen.pts.pop(); if (!pen.pts.length) pen = null; drawOverlay(); }
      else if (e.key === "Escape") { e.stopPropagation(); setTool("select"); }
      return;
    }
    const item = ED.selItem(), L = ED.selLayer();
    if (!ED.pointEdit && e.key === "Enter" && isPath(item)) { e.preventDefault(); setPointEdit(true); return; }
    if (!ED.partEdit && e.key === "Enter" && isClay(item)) { e.preventDefault(); setPartEdit(true); return; }
    if (ED.partEdit && isClay(item)) {
      const n = item.parts.length, i = Math.min(ED.partSel, n - 1);
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      let handled = true;
      if (e.key === "Enter" || e.key === "Escape") setPartEdit(false);
      else if (e.key === "[" || e.key === "]") { ED.partSel = (i + (e.key === "]" ? 1 : n - 1)) % n; ED.emit("part-select"); }
      else if (arrows[e.key]) {
        // The step is in scene units; the piece's own units are smaller or larger by its scale.
        const s = (item.xf && item.xf.s) || 1, r = (item.xf && item.xf.r) || 0, [dx, dy] = arrows[e.key];
        ED.preview(() => ACT().movePart(item, i, [(Math.cos(r) * dx + Math.sin(r) * dy) / s, (-Math.sin(r) * dx + Math.cos(r) * dy) / s]));
        nudged = "Move part";
      } else if (e.key === "Delete" || e.key === "Backspace") ACT().removePart();
      else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); drawOverlay(); return; }
    }
    if (ED.pointEdit && isPath(item)) {
      const n = item.points.length, i = ED.pointSel ?? 0;
      const arrows = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
      let handled = true;
      if (e.key === "Enter" || e.key === "Escape") setPointEdit(false);
      else if (e.key === "[" || e.key === "]") ED.pointSel = (i + (e.key === "]" ? 1 : n - 1)) % n;
      else if (arrows[e.key]) {
        const a = pointScene(L, item, item.points[i]);
        const q = sceneToLocal(L, item, [a[0] + arrows[e.key][0], a[1] + arrows[e.key][1]]);
        ED.preview(() => (item.points[i] = q));
        nudged = "Move point";
      } else if ((e.key === "+" || e.key === "=" || e.key === "Insert") && n < 32) {
        const a = item.points[i], b = item.points[(i + 1) % n];
        ED.change(() => item.points.splice(i + 1, 0, [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]), "Add point");
        ED.pointSel = i + 1;
      } else if ((e.key === "Delete" || e.key === "Backspace") && n > 3) {
        ED.change(() => item.points.splice(i, 1), "Remove point");
        ED.pointSel = Math.min(i, n - 2);
      } else handled = false;
      if (handled) { e.preventDefault(); e.stopPropagation(); drawOverlay(); return; }
    }
    const moves = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    if (moves[e.key] && ED.sel.layer) {
      e.preventDefault();
      // Repeated presses fold into one undo step once the key is released.
      ACT().nudge(...moves[e.key], false);
      nudged = "Move";
    } else if (e.key === "Delete" || e.key === "Backspace") {
      if (ED.sel.layer) { e.preventDefault(); ACT().remove(); }
    } else if (e.key === "ContextMenu" || (e.shiftKey && e.key === "F10")) {
      e.preventDefault();
      const r = viewport.getBoundingClientRect();
      const pts = selOutline();
      const at = pts ? toClient(pts[2]) : [r.left + r.width / 2, r.top + r.height / 2];
      pieceMenu({ x: at[0], y: at[1] });
    }
  }
  function onKeyUp(e) {
    if (nudged && /^Arrow/.test(e.key)) { ED.commit(nudged); nudged = false; }
  }

  // ---------- drops ----------
  function onDragOver(e) {
    const types = [...e.dataTransfer.types];
    if (types.includes("text/x-entry") || types.includes("Files")) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
      viewport.classList.add("is-drop");
    }
  }
  function onDrop(e) {
    viewport.classList.remove("is-drop");
    const at = toScene(e.clientX, e.clientY);
    const id = e.dataTransfer.getData("text/x-entry");
    if (id) {
      e.preventDefault();
      const entry = LB.findEntry(id);
      if (entry) { ACT().addFromEntry(entry, at); pop(e.clientX, e.clientY); }
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      ACT().importImages(e.dataTransfer.files, at);
      pop(e.clientX, e.clientY);
    }
  }

  function init() {
    viewport = document.getElementById("viewport");
    overlay = document.getElementById("overlay");
    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    viewport.addEventListener("pointerleave", () => { if (!drag && hover) { hover = null; drawOverlay(); } });
    viewport.addEventListener("contextmenu", onContext);
    viewport.addEventListener("auxclick", (e) => { if (e.button === 1) e.preventDefault(); });
    viewport.addEventListener("keydown", onKey);
    viewport.addEventListener("keyup", onKeyUp);
    viewport.addEventListener("dblclick", (e) => {
      if (ED.tool === "pen") { finishPen(); return; }
      // Inside a group: double-click picks the piece under the pointer.
      if (ED.tool === "select" && isMany()) {
        const hit = hitTest(toScene(e.clientX, e.clientY));
        if (hit && hit.item && hit.layer === ED.sel.layer && ED.selMembers().some((it) => it.id === hit.item)) { ED.select(hit.layer, hit.item); return; }
      }
      if (ED.tool === "select" && isPath(ED.selItem())) setPointEdit(true);
      if (ED.tool === "select" && isClay(ED.selItem())) setPartEdit(true);
    });
    viewport.addEventListener("wheel", (e) => {
      if (presenting) return;
      const narrow = window.matchMedia("(max-width: 920px)").matches;
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        cancelAnimationFrame(anim);
        zoomAt(Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0025)), e.clientX, e.clientY);
      } else if (!narrow) {
        e.preventDefault();
        cancelAnimationFrame(anim);
        const k = e.deltaMode ? 30 : 1;
        view.fit = false;
        view.c = [view.c[0] + ((e.shiftKey ? e.deltaY : e.deltaX) * k) / view.z, view.c[1] + (e.shiftKey ? 0 : e.deltaY * k) / view.z];
        applyView();
        ED.redraw();
      }
    }, { passive: false });
    viewport.addEventListener("dragover", onDragOver);
    viewport.addEventListener("dragleave", () => viewport.classList.remove("is-drop"));
    viewport.addEventListener("drop", onDrop);
    document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
    document.getElementById("btn-zoom-in").addEventListener("click", () => zoomBy(1.25));
    document.getElementById("btn-zoom-out").addEventListener("click", () => zoomBy(0.8));
    document.getElementById("btn-zoom-fit").addEventListener("click", zoomFit);
    document.getElementById("btn-zoom-pct").addEventListener("click", (e) => zoomMenu(e.currentTarget));
    document.getElementById("btn-guides").addEventListener("click", (e) => { setGuides(!ED.guides); bump(e.currentTarget); });
    document.getElementById("btn-snap").addEventListener("click", (e) => { setSnap(!ED.snap); bump(e.currentTarget); });
    setGuides(ED.guides);
    setSnap(ED.snap);
    new ResizeObserver(() => fit()).observe(viewport);
    window.addEventListener("resize", movePill);
    requestAnimationFrame(movePill);
    ED.on("select", () => { hover = null; if (!isPath(ED.selItem())) setPointEdit(false); if (!isClay(ED.selItem())) setPartEdit(false); drawOverlay(); });
    ED.on("edit-parts", () => setPartEdit(!ED.partEdit));
    ED.on("part-select", drawOverlay);
    ED.on("edit-points", () => setPointEdit(!ED.pointEdit));
    ED.on("doc", () => requestAnimationFrame(drawOverlay));
    ED.on("synced", drawOverlay);
    ED.on("load", () => { view.fit = true; requestAnimationFrame(fit); });
  }

  LB.CANVAS = {
    init, fit, applyView, setTool, toScene, toScreen, toClient, hitTest, pieceMenu, stageMenu, snapshot, setPresenting, setGuides, setSnap,
    zoomIn: () => zoomBy(1.25), zoomOut: () => zoomBy(0.8), zoomFit, zoomTo, zoomToSelection, zoomMenu,
    get zoom() { return { ...view, pct: Math.round((view.z / ACTUAL) * 100) }; },
  };
})();
