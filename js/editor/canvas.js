/*
  The canvas: fitting the preview, the selection overlay, and direct
  manipulation.

    Select tool  click a piece to select it; drag to move it. Drag the
                 corner handle to scale, the round handle to rotate. With a
                 whole layer selected (from the list), dragging inside its
                 box moves the layer.
    Shape tools  drag out a box to draw a shape into the selected layer.
    Pen          click to place points; click the first point, double-click
                 or press Enter to close the outline.
    Points       double-click a cut-out (or press Enter) to edit its points:
                 drag a point, drag a + between two points to add one,
                 Alt-click a point to remove it. Keys: [ and ] pick a point,
                 arrows move it, + adds one after it, Delete removes it.
    Poses        with "This pose only" on (under the canvas), moving,
                 scaling or rotating a piece changes only the pose on screen.
    Drops        store pieces and picture files can be dropped in place.
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
  const SVG = "http://www.w3.org/2000/svg";
  const A = 16 / 9;

  let viewport, canvas, overlay;
  let preview = "desktop";
  let drag = null;
  let hover = null;
  let pen = null;           // { pts: [scene points], at: last pointer position }
  ED.tool = "select";
  ED.pointEdit = false;     // editing the points of the selected custom outline
  ED.pointSel = null;

  // ---------- fitting ----------
  function fit() {
    // The space inside the stage's padding.
    const parent = viewport.parentElement;
    const cs = getComputedStyle(parent);
    const aw = parent.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    const ah = parent.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const aspect = preview === "phone" ? 9 / 19.5 : A;
    let w = aw, h = aw / aspect;
    if (h > ah) { h = ah; w = h * aspect; }
    w = Math.max(80, Math.floor(w));
    h = Math.max(45, Math.floor(h));
    viewport.style.width = `${w}px`;
    viewport.style.height = `${h}px`;
    overlay.setAttribute("viewBox", `0 0 ${w} ${h}`);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const cap = 1920 * 1080;
    const k = Math.min(dpr, Math.sqrt(cap / (w * h)));
    ED.renderer.resize(w * k, h * k);
    ED.redraw();
  }

  // ---------- coordinates ----------
  const cssSize = () => [viewport.clientWidth, viewport.clientHeight];
  function toScene(clientX, clientY) {
    const r = viewport.getBoundingClientRect();
    const v = ED.renderer.view;
    return [v[0] + ((clientX - r.left) / r.width) * v[2], v[1] + ((clientY - r.top) / r.height) * v[3]];
  }
  function toScreen(p) {
    const [w, h] = cssSize();
    const v = ED.renderer.view;
    return [((p[0] - v[0]) / v[2]) * w, ((p[1] - v[1]) / v[3]) * h];
  }
  const pxToScene = (px) => (px / cssSize()[0]) * ED.renderer.view[2];
  ED.viewCenter = () => {
    const v = ED.renderer.view;
    return [v[0] + v[2] / 2, v[1] + v[3] / 2];
  };

  function poseOffset(L) {
    const p = ED.renderer.poseOf(L.id, ED.clock);
    return p ? [p.ox, p.oy] : L.offset || [0, 0];
  }

  // Scene-space outline of a selected thing: 4 corners (an item) or a box (a layer).
  // A piece as it stands in the layer's current pose.
  const posedItem = (L, item) => I().atPose(item, ED.renderer.frameOf(L.id, ED.clock));

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
        for (const it of L.paint) b = I().union(b, I().worldBox(posedItem(L, it), L.rect ? { rect: L.rect } : L));
      }
    }
    return [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]].map((p) => [p[0] + off[0], p[1] + off[1]]);
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
        if (I().hit(it, L.rect ? { rect: L.rect } : L, q)) return { layer: L.id, item: item.id };
      }
    }
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
  // A control point of the selected outline, in scene and screen space.
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
    if (on) ED.emit("status", { msg: "Editing points: drag a point to move it, drag a + to add one, Alt-click a point to remove it. Keys: [ and ] pick a point, arrows move it, + adds, Delete removes. Enter or Escape when you're done." });
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
    if (on) ED.emit("status", { msg: "Editing parts: click a dot to pick a part, drag it to move it across the view. Keys: [ and ] pick a part, arrows move it, Delete removes it. Depth and size are in Properties. Enter or Escape when you're done." });
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

  function handlesFor(pts) {
    const s = pts.map(toScreen);
    const top = [(s[0][0] + s[1][0]) / 2, (s[0][1] + s[1][1]) / 2];
    const center = [(s[0][0] + s[2][0]) / 2, (s[0][1] + s[2][1]) / 2];
    const dir = [top[0] - center[0], top[1] - center[1]];
    const len = Math.hypot(...dir) || 1;
    const rot = [top[0] + (dir[0] / len) * 26, top[1] + (dir[1] / len) * 26];
    return { scale: s[2], rotate: rot, top, center };
  }

  function drawOverlay() {
    if (!overlay || ED.recording) return;
    overlay.innerHTML = "";
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
      const [a, b] = [toScreen(drag.p0), toScreen(drag.p1)];
      overlay.append(el("rect", { class: "ov-draw", x: Math.min(a[0], b[0]), y: Math.min(a[1], b[1]), width: Math.abs(b[0] - a[0]), height: Math.abs(b[1] - a[1]) }));
      return;
    }
    if (hover && !(hover.layer === ED.sel.layer && hover.item === ED.sel.item)) {
      const L = ED.layer(hover.layer);
      const item = hover.item ? ED.item(hover.layer, hover.item) : null;
      const pts = L && outlineOf(L, item);
      if (pts) overlay.append(el("polygon", { class: "ov-hover", points: poly(pts) }));
    }
    const L = ED.selLayer();
    if (!L) return;
    const item = ED.selItem();
    const pts = outlineOf(L, item);
    if (!pts) return;
    overlay.append(el("polygon", { class: "ov-sel-shadow", points: poly(pts) }), el("polygon", { class: `ov-sel${item ? "" : " is-layer"}`, points: poly(pts) }));
    if (ED.partEdit && isClay(item)) {
      item.parts.forEach((pt, i) => {
        const a = partScreen(L, item, i);
        overlay.append(el("circle", { class: `ov-part${i === ED.partSel ? " is-selected" : ""}${pt.carve ? " is-carve" : ""}`, cx: a[0], cy: a[1], r: i === ED.partSel ? 7 : 5 }));
      });
      return;
    }
    if (ED.pointEdit && isPath(item)) {
      const cps = item.points.map((q) => pointScene(L, item, q));
      overlay.append(el("polygon", { class: "ov-ctrl", points: poly(cps) }));
      cps.forEach((q, i) => {
        const a = toScreen(q), b = toScreen(cps[(i + 1) % cps.length]);
        if (item.points.length < 32) overlay.append(el("circle", { class: "ov-mid", cx: (a[0] + b[0]) / 2, cy: (a[1] + b[1]) / 2, r: 4 }));
      });
      cps.forEach((q, i) => {
        const a = toScreen(q);
        overlay.append(el("rect", { class: `ov-point${i === ED.pointSel ? " is-selected" : ""}`, x: a[0] - 5, y: a[1] - 5, width: 10, height: 10 }));
      });
      return;
    }
    if (item && !L.locked) {
      const hd = handlesFor(pts);
      overlay.append(
        el("line", { class: "ov-stalk", x1: hd.top[0], y1: hd.top[1], x2: hd.rotate[0], y2: hd.rotate[1] }),
        el("circle", { class: "ov-handle", cx: hd.rotate[0], cy: hd.rotate[1], r: 6 }),
        el("rect", { class: "ov-handle", x: hd.scale[0] - 6, y: hd.scale[1] - 6, width: 12, height: 12 }));
    }
  }
  ED.drawOverlay = drawOverlay;

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

  function onDown(e) {
    if (e.button !== 0 || ED.recording) return;
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
    if (L && item && !L.locked) {
      const pts = outlineOf(L, item);
      const hd = handlesFor(pts);
      const f0 = ED.renderer.frameOf(L.id, ED.clock);
      const t = I().atPose(item, f0).xf;
      const pos = I().position(posedItem(L, item), L.rect ? { rect: L.rect } : L);
      const off = poseOffset(L);
      const centerScene = [pos[0] + off[0], pos[1] + off[1]];
      if (near(lp, hd.rotate)) {
        drag = { kind: "rotate", item, L, f0, t0: t, a0: Math.atan2(p[1] - centerScene[1], p[0] - centerScene[0]), c: centerScene, moved: false };
        return;
      }
      if (near(lp, hd.scale)) {
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
      ED.select(null);
      drag = null;
      return;
    }
    if (hit.layer !== ED.sel.layer || hit.item !== ED.sel.item) ED.select(hit.layer, hit.item || null);
    const HL = ED.layer(hit.layer);
    if (hit.item) {
      const it = ED.item(hit.layer, hit.item);
      const f0 = ED.renderer.frameOf(HL.id, ED.clock);
      drag = { kind: "move", item: it, L: HL, f0, p0: p, t0: I().atPose(it, f0).xf, moved: false };
    } else {
      drag = { kind: "layer", L: HL, p0: p, o0: (HL.offset || [0, 0]).slice(), moved: false };
    }
  }

  function onMove(e) {
    const p = toScene(e.clientX, e.clientY);
    if (pen) { pen.at = p; drawOverlay(); return; }
    if (!drag) {
      if (ED.tool === "select" && e.pointerType === "mouse" && !ED.pointEdit) {
        const hv = hitTest(p);
        const key = hv ? hv.layer + "/" + (hv.item || "") : "";
        const was = hover ? hover.layer + "/" + (hover.item || "") : "";
        if (key !== was) { hover = hv; drawOverlay(); }
        viewport.style.cursor = hv ? "move" : "default";
        const L = ED.selLayer(), item = ED.selItem();
        if (L && item && !L.locked) {
          const hd = handlesFor(outlineOf(L, item));
          const lp = localPoint(e);
          if (near(lp, hd.rotate)) viewport.style.cursor = "grab";
          else if (near(lp, hd.scale)) viewport.style.cursor = "nwse-resize";
        }
      }
      return;
    }
    if (drag.kind === "draw") {
      let p1 = p;
      if (e.shiftKey) {
        const dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
        const m = Math.max(Math.abs(dx), Math.abs(dy));
        p1 = [drag.p0[0] + Math.sign(dx || 1) * m, drag.p0[1] + Math.sign(dy || 1) * m];
      }
      drag.p1 = p1;
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
      const dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
      setXf({ ...drag.t0, x: drag.t0.x + dx, y: drag.t0.y + dy });
    } else if (drag.kind === "layer") {
      const dx = p[0] - drag.p0[0], dy = p[1] - drag.p0[1];
      ED.preview(() => (drag.L.offset = [drag.o0[0] + dx, drag.o0[1] + dy]));
    } else if (drag.kind === "scale") {
      const d = Math.hypot(p[0] - drag.c[0], p[1] - drag.c[1]);
      const s = Math.min(8, Math.max(0.05, drag.t0.s * (d / drag.d0)));
      setXf({ ...drag.t0, s: Math.round(s * 100) / 100 });
    } else if (drag.kind === "rotate") {
      let r = drag.t0.r + Math.atan2(p[1] - drag.c[1], p[0] - drag.c[0]) - drag.a0;
      // Shift snaps to 15° steps.
      if (e.shiftKey) r = Math.round(r / (Math.PI / 12)) * (Math.PI / 12);
      setXf({ ...drag.t0, r });
    }
  }

  function onUp(e) {
    if (!drag) return;
    const d = drag;
    drag = null;
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
      return;
    }
    if (d.moved) ED.commit(d.added ? "Add point" : { move: "Move", layer: "Move layer", scale: "Scale", rotate: "Rotate", point: "Move point", part: "Move part" }[d.kind] + (ED.poseMode === "pose" && d.L && d.L.cycle && d.kind !== "point" ? " (this pose)" : ""));
    drawOverlay();
  }

  // ---------- tools ----------
  const TOOL_NAMES = { select: "Select", rect: "Rectangle", ellipse: "Ellipse", triangle: "Triangle", star: "Star", cloud: "Cloud", pen: "Your own outline" };
  function finishPen() {
    const pts = pen ? pen.pts.filter((q, i, a) => i === 0 || Math.hypot(q[0] - a[i - 1][0], q[1] - a[i - 1][1]) > 0.003) : [];
    pen = null;
    setTool("select");
    if (pts.length >= 3) ACT().penShape(pts);
    else ED.emit("status", { msg: "An outline needs at least 3 points." });
    drawOverlay();
  }
  function setTool(t) {
    if (t !== "pen") pen = null;
    if (t !== "select") setPointEdit(false);
    ED.tool = t;
    document.querySelectorAll("[data-tool]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.tool === t)));
    viewport.classList.toggle("is-drawing", t !== "select");
    viewport.style.cursor = t === "select" ? "default" : "crosshair";
    if (t === "pen") ED.emit("status", { msg: "Your own outline: click to place points. Click the first point, double-click or press Enter to close it. Backspace removes the last point, Escape cancels." });
    else if (t !== "select") ED.emit("status", { msg: `${TOOL_NAMES[t]}: drag on the canvas to draw it. Hold Shift for equal sides. Escape cancels.` });
    drawOverlay();
  }
  ED.setTool = setTool;

  function setPreview(p) {
    preview = p;
    document.querySelectorAll("[data-preview]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.preview === p)));
    fit();
  }

  // ---------- keyboard on the canvas ----------
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
        // The step is in scene units on screen; turn it into the outline's own units.
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
    }
  }
  let nudged = false;
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
      if (entry) ACT().addFromEntry(entry, at);
      return;
    }
    if (e.dataTransfer.files && e.dataTransfer.files.length) {
      e.preventDefault();
      ACT().importImages(e.dataTransfer.files, at);
    }
  }

  function init() {
    viewport = document.getElementById("viewport");
    canvas = document.getElementById("scene");
    overlay = document.getElementById("overlay");
    viewport.addEventListener("pointerdown", onDown);
    viewport.addEventListener("pointermove", onMove);
    viewport.addEventListener("pointerup", onUp);
    viewport.addEventListener("pointercancel", onUp);
    viewport.addEventListener("pointerleave", () => { if (!drag && hover) { hover = null; drawOverlay(); } });
    viewport.addEventListener("keydown", onKey);
    viewport.addEventListener("dblclick", (e) => {
      if (ED.tool === "pen") { finishPen(); return; }
      if (ED.tool === "select" && isPath(ED.selItem())) setPointEdit(true);
      if (ED.tool === "select" && isClay(ED.selItem())) setPartEdit(true);
    });
    viewport.addEventListener("keyup", onKeyUp);
    viewport.addEventListener("dragover", onDragOver);
    viewport.addEventListener("dragleave", () => viewport.classList.remove("is-drop"));
    viewport.addEventListener("drop", onDrop);
    document.querySelectorAll("[data-tool]").forEach((b) => b.addEventListener("click", () => setTool(b.dataset.tool)));
    document.querySelectorAll("[data-preview]").forEach((b) => b.addEventListener("click", () => setPreview(b.dataset.preview)));
    new ResizeObserver(() => fit()).observe(viewport.parentElement);
    ED.on("select", () => { hover = null; if (!isPath(ED.selItem())) setPointEdit(false); if (!isClay(ED.selItem())) setPartEdit(false); drawOverlay(); });
    ED.on("edit-parts", () => setPartEdit(!ED.partEdit));
    ED.on("part-select", drawOverlay);
    ED.on("edit-points", () => setPointEdit(!ED.pointEdit));
    ED.on("doc", () => requestAnimationFrame(drawOverlay));
    ED.on("synced", drawOverlay);
  }

  LB.CANVAS = { init, fit, setTool, setPreview, toScene, toScreen, hitTest };
})();
