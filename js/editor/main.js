/*
  Editor boot, the frame loop, and the chrome around the panels.

  - Opens the scene saved in this browser, or Beach day the first time.
  - Every document change syncs the renderer (only changed layers rebake),
    updates the look, and autosaves a second after the last edit.
  - The same courtesy as the study page: no autoplay with
    prefers-reduced-motion, and nothing renders while the tab is hidden.
  - Messages appear as toasts over the canvas; a delete carries an Undo.
  - The menubar (File, Edit, View, Help), the timeline (beat ticks, pose
    ticks, beat rate), the save chip, the light and dark themes, the
    shortcut sheet (?), present mode (F) and a short first-run tour.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const { h, ICONS, icon, toast, menu, closeMenu, prefs, bump } = LB.UI;
  const $ = (s) => document.querySelector(s);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let renderer, clock;
  let raf = 0, last = 0;
  ED.playing = false;

  // ---------- icons ----------
  function hydrateIcons(root = document) {
    root.querySelectorAll("[data-icon]").forEach((el) => {
      const svg = ICONS[el.dataset.icon];
      if (!svg || el.dataset.hydrated) return;
      el.dataset.hydrated = "1";
      if (el.classList.contains("ic")) el.innerHTML = svg;
      else el.insertAdjacentHTML("afterbegin", svg);
    });
  }

  // ---------- messages ----------
  let lastMsg = "", lastAt = 0;
  ED.on("status", ({ msg, tone, action, timeout }) => {
    if (!msg) return;
    const now = performance.now();
    if (msg === lastMsg && now - lastAt < 1200) return;
    lastMsg = msg;
    lastAt = now;
    toast(msg, { tone, action, timeout });
  });

  function fail(message) {
    $("#viewport").classList.add("is-broken");
    const box = $("#loading");
    box.hidden = false;
    box.querySelector("p").textContent = message;
  }

  // ---------- render settings from the document ----------
  function postFor(doc) {
    const p = LB.DOC.clone(doc.post);
    p.motion = true;
    // Onion skin: the selected layer's previous pose, faint, under the current one.
    p.onion = ED.onion && ED.sel.layer ? ED.sel.layer : null;
    p.boil = doc.boil;
    p.haze = 1;
    p.hidden = {};
    return p;
  }
  ED.postFor = postFor;
  // The renderer gets its own copy of the layers, so edits during a bake can't change it halfway.
  const sceneFor = (doc) => ({ ...doc, layers: JSON.parse(JSON.stringify(doc.layers)) });

  let syncQueued = false;
  function scheduleSync() {
    if (syncQueued) return;
    syncQueued = true;
    requestAnimationFrame(() => {
      syncQueued = false;
      const doc = ED.doc;
      clock.fps = doc.fps;
      renderer.setGrade(doc.grades[doc.grade]);
      renderer.setPost(postFor(doc));
      renderer.sync(sceneFor(doc))
        .then(() => { $("#viewport").classList.remove("is-loading"); LB.CANVAS.applyView(); redraw(); ED.emit("synced"); })
        .catch((err) => { console.error(err); ED.emit("status", { msg: `Part of the scene couldn't be drawn: ${err.message.split("\n")[0]}`, tone: "error" }); });
      LB.CANVAS.applyView();
      redraw();
    });
  }

  function redraw() {
    if (!renderer) return;
    renderer.invalidate();
    renderer.draw(clock);
    updateTransport();
    if (ED.drawOverlay) ED.drawOverlay();
  }
  ED.redraw = redraw;

  // ---------- playback ----------
  function setPlaying(p, force) {
    ED.playing = p;
    const btn = $("#btn-play");
    btn.dataset.playing = String(p);
    btn.setAttribute("aria-label", p ? "Pause" : "Play");
    btn.dataset.tip = p ? "Pause" : "Play";
    schedule(force);
  }
  ED.setPlaying = setPlaying;

  function schedule() {
    const run = ED.playing && !document.hidden;
    if (run && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(tick);
    } else if (!run && raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  }

  function tick(now) {
    raf = 0;
    // A frame's timestamp can be a little earlier than the moment playback started; never step backward.
    const dt = Math.max(0, Math.min((now - last) / 1000, 0.1));
    last = now;
    if (ED.recordStart != null) {
      // Recording: the clock follows real time exactly (no catch-up cap), so the video is one loop long
      // even if some frames take longer to draw. It stops before beat 0 comes round again.
      const elapsed = Math.max(0, (now - ED.recordStart) / 1000);
      if (ED.onProgress) ED.onProgress(Math.min(1, elapsed / LB.LOOP));
      if (elapsed >= LB.LOOP) {
        const done = ED.onLoopEnd;
        ED.onLoopEnd = null;
        ED.recordStart = null;
        if (done) done();
        return;
      }
      clock.set(elapsed);
    } else clock.advance(dt);
    const drew = renderer.draw(clock);
    if (drew && ED.onFrame) ED.onFrame();
    if (drew === "scene") { updateTransport(); if (ED.drawOverlay) ED.drawOverlay(); }
    schedule();
  }

  // ---------- the timeline ----------
  ED.onion = false;
  let poseKey = "", tickKey = "";
  // The first beat of the loop on which a layer shows pose f.
  function beatOfPose(L, f) {
    const beats = Math.round(LB.LOOP * clock.fps);
    for (let b = 0; b < beats; b++) if (Math.floor((b / clock.fps) * L.cycle.rate + 1e-6) % L.cycle.frames === f) return b;
    return 0;
  }
  function goToPose(L, f) {
    setPlaying(false);
    clock.set(beatOfPose(L, f) / clock.fps + 1e-4);
    redraw();
    ED.emit("pose");
  }
  ED.stepPose = (step) => {
    const L = ED.selLayer();
    if (!L || !L.cycle) return false;
    goToPose(L, (renderer.frameOf(L.id, clock) + step + L.cycle.frames) % L.cycle.frames);
    return true;
  };
  function updatePoseStrip() {
    const L = ED.selLayer();
    const strip = $("#pose-strip");
    const on = !!(L && L.cycle);
    strip.hidden = !on;
    if (!on) { poseKey = ""; return; }
    const f = renderer.frameOf(L.id, clock);
    const key = `${L.id}/${L.cycle.frames}/${L.name}`;
    if (key !== poseKey) {
      poseKey = key;
      $("#pose-label .poses-name").textContent = `Poses of ${L.name}`;
      const box = $("#pose-buttons");
      box.replaceChildren();
      for (let i = 0; i < L.cycle.frames; i++) {
        box.append(h("button", { type: "button", text: String(i + 1), "aria-label": `Pose ${i + 1}`, onclick: () => goToPose(ED.selLayer(), i) }));
      }
    }
    [...$("#pose-buttons").children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === f)));
  }
  function buildTicks() {
    const fps = clock.fps, beats = Math.round(LB.LOOP * fps);
    const L = ED.selLayer();
    const cyc = L && L.cycle;
    const key = `${beats}|${cyc ? `${L.id}/${cyc.frames}/${cyc.rate}` : ""}`;
    if (key === tickKey) return;
    tickKey = key;
    const poseBeats = new Set();
    if (cyc) {
      let prev = -1;
      for (let b = 0; b < beats; b++) {
        const f = Math.floor((b / fps) * cyc.rate + 1e-6) % cyc.frames;
        if (f !== prev) poseBeats.add(b);
        prev = f;
      }
    }
    const box = $("#track-ticks");
    box.replaceChildren();
    for (let b = 0; b < beats; b++) {
      const cls = poseBeats.has(b) ? "is-pose" : b % fps === 0 ? "is-sec" : "";
      box.append(h("i", { class: cls || null, style: { left: `${(b / (beats - 1)) * 100}%` } }));
    }
  }
  function updateTransport() {
    if (!clock) return;
    updatePoseStrip();
    buildTicks();
    const beats = Math.round(LB.LOOP * clock.fps);
    const scrub = $("#scrub");
    scrub.max = beats - 1;
    if (document.activeElement !== scrub) scrub.value = clock.beat;
    const t = clock.beat / Math.max(1, beats - 1);
    $("#track-fill").style.width = `calc(11px + ${t} * (100% - 22px))`;
    $("#beat-readout").textContent = `Beat ${clock.beat + 1} of ${beats} · ${(clock.beat / clock.fps).toFixed(2)} s`;
    scrub.setAttribute("aria-valuetext", `Beat ${clock.beat + 1} of ${beats}`);
  }
  function updateFps() {
    document.querySelectorAll("#fps-seg [data-fps]").forEach((b) => {
      const on = +b.dataset.fps === ED.doc.fps;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
    });
  }
  function toggleOnion() {
    ED.onion = !ED.onion;
    const b = $("#onion");
    b.setAttribute("aria-pressed", String(ED.onion));
    bump(b);
    renderer.setPost(postFor(ED.doc));
    redraw();
  }
  function setPoseMode(mode) {
    ED.poseMode = mode;
    document.querySelectorAll("[data-pose-mode]").forEach((x) => { const on = x.dataset.poseMode === mode; x.setAttribute("aria-checked", String(on)); x.tabIndex = on ? 0 : -1; });
    ED.emit("status", { msg: mode === "pose" ? "Moving, sizing or turning a piece now changes only the pose on screen." : "Moving a piece now moves it in every pose." });
  }
  // Arrow keys inside the small radio groups under the canvas.
  function radioKeys(group, pick) {
    group.addEventListener("keydown", (e) => {
      const btns = [...group.querySelectorAll('[role="radio"]')];
      const i = btns.indexOf(document.activeElement);
      const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
      if (i < 0 || !step) return;
      e.preventDefault();
      const n = btns[(i + step + btns.length) % btns.length];
      n.focus();
      pick(n);
    });
  }

  // ---------- autosave and the save chip ----------
  function setSave(state, text) {
    const chip = $("#save-state");
    chip.dataset.state = state;
    chip.querySelector(".save-text").textContent = text;
  }
  let saveTimer = 0;
  ED.on("history", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await LB.DOC.saveLocal(ED.doc);
        setSave("saved", "Saved in this browser");
      } catch (err) {
        setSave("error", "Not saved: storage is blocked");
        ED.emit("status", { msg: "This browser blocked storage, so the scene isn't saved here. Use File, Save the scene file.", tone: "error" });
      }
    }, 1000);
  });
  ED.on("saved-state", () => setSave("dirty", "Saving…"));

  // ---------- undo ----------
  function updateHistory() {
    const H = ED.history;
    const u = $("#btn-undo"), r = $("#btn-redo");
    u.disabled = !H.canUndo;
    r.disabled = !H.canRedo;
    u.dataset.tip = H.canUndo ? `Undo ${H.undoLabel}` : "Nothing to undo";
    r.dataset.tip = H.canRedo ? `Redo ${H.redoLabel}` : "Nothing to redo";
    u.setAttribute("aria-label", H.canUndo ? `Undo ${H.undoLabel}` : "Undo");
    r.setAttribute("aria-label", H.canRedo ? `Redo ${H.redoLabel}` : "Redo");
  }
  function undo(step) {
    const label = ED.history.go(step);
    if (label) {
      ED.emit("status", { msg: `${step < 0 ? "Undid" : "Redid"}: ${label}.`, timeout: 2200 });
      bump(step < 0 ? $("#btn-undo") : $("#btn-redo"));
    }
  }
  ED.undo = () => undo(-1);

  // ---------- theme ----------
  function setTheme(t, animate) {
    const html = document.documentElement;
    if (animate && !reduceMotion.matches) {
      html.classList.add("theme-anim");
      setTimeout(() => html.classList.remove("theme-anim"), 450);
    }
    html.dataset.theme = t;
    prefs.set("theme", t);
    const b = $("#btn-theme");
    b.innerHTML = ICONS[t === "studio" ? "sun" : "moon"];
    b.setAttribute("aria-label", t === "studio" ? "Switch to the light theme" : "Switch to the dark theme");
    b.dataset.tip = t === "studio" ? "Light theme" : "Dark theme";
  }
  const toggleTheme = () => { setTheme(document.documentElement.dataset.theme === "studio" ? "paper" : "studio", true); bump($("#btn-theme")); };

  // ---------- menubar ----------
  const MENUS = {
    file: () => [
      { label: "New scene…", icon: "file", run: () => LB.EXPORT.openNew() },
      { label: "Open a scene file…", icon: "open", keys: "Ctrl O", run: () => $("#file-open").click() },
      { label: "Save the scene file", icon: "save", keys: "Ctrl S", run: () => LB.EXPORT.saveFile() },
      "-",
      { label: "Export…", icon: "export", keys: "Ctrl E", run: () => LB.EXPORT.openExport() },
      "-",
      { label: "Import pictures…", icon: "image", run: () => $("#file-image").click() },
      { label: "Install a pack…", icon: "box", run: () => $("#file-pack").click() },
      { label: "Save My pieces as a pack…", icon: "heart", run: () => $("#dlg-pack").showModal() },
    ],
    edit: () => {
      const H = ED.history, sel = !!ED.sel.layer;
      return [
        { label: H.canUndo ? `Undo ${H.undoLabel}` : "Undo", icon: "undo", keys: "Ctrl Z", disabled: !H.canUndo, run: () => undo(-1) },
        { label: H.canRedo ? `Redo ${H.redoLabel}` : "Redo", icon: "redo", keys: "Ctrl Shift Z", disabled: !H.canRedo, run: () => undo(1) },
        "-",
        { label: "Duplicate", icon: "copy", keys: "Ctrl D", disabled: !sel, run: () => LB.ACT.duplicate() },
        { label: "Bring forward", icon: "up", keys: "]", disabled: !sel, run: () => LB.ACT.restack(1) },
        { label: "Send backward", icon: "down", keys: "[", disabled: !sel, run: () => LB.ACT.restack(-1) },
        { label: "Rename", icon: "pen", keys: "F2", disabled: !sel, run: () => ED.emit("focus-field") },
        "-",
        { label: "Group", icon: "box", keys: "Ctrl G", disabled: !ED.sel.multi, run: () => LB.ACT.group() },
        { label: "Ungroup", icon: "box", keys: "Ctrl Shift G", disabled: !ED.sel.group, run: () => LB.ACT.ungroup() },
        { label: "Merge this layer into…", icon: "layers", disabled: !sel || !!ED.hasPieces(), run: () => { const b = document.querySelector('[data-menu="edit"]').getBoundingClientRect(); LB.LAYERS.mergeMenu(ED.selLayer(), { x: b.left, y: b.bottom + 6 }); } },
        { label: "Give the selection its own layer", icon: "layers", disabled: !(ED.sel.group || ED.sel.multi), run: () => LB.ACT.splitToLayer() },
        { label: "Delete", icon: "trash", keys: "Del", disabled: !sel, danger: true, run: () => LB.ACT.remove() },
        "-",
        { label: "Add pieces", icon: "add", keys: "A", run: () => LB.STORE.open() },
        { label: "New layer", icon: "layers", run: () => LB.ACT.addLayer() },
        { label: "Deselect", keys: "Esc", disabled: !sel, run: () => ED.select(null) },
      ];
    },
    view: () => {
      const C = LB.CANVAS;
      return [
        { label: "Zoom in", icon: "zoomIn", keys: "Ctrl +", run: C.zoomIn },
        { label: "Zoom out", icon: "zoomOut", keys: "Ctrl −", run: C.zoomOut },
        { label: "Fit the scene", icon: "fit", keys: "Ctrl 0", run: C.zoomFit },
        { label: "Actual size (100%)", icon: "search", keys: "Ctrl 1", run: () => C.zoomTo(100) },
        { label: "Zoom to the selection", keys: "Shift 2", disabled: !ED.sel.layer, run: C.zoomToSelection },
        "-",
        { label: "Screen guides", keys: "G", checked: ED.guides, run: () => C.setGuides(!ED.guides) },
        { label: "Snapping", checked: ED.snap, run: () => C.setSnap(!ED.snap) },
        { label: "Depth view", checked: ED.depthViewOn(), run: ED.toggleDepthView },
        { label: "Onion skin", checked: ED.onion, run: toggleOnion },
        "-",
        { label: document.documentElement.dataset.theme === "studio" ? "Light theme" : "Dark theme", icon: document.documentElement.dataset.theme === "studio" ? "sun" : "moon", run: toggleTheme },
        { label: "Present", icon: "present", keys: "F", run: () => present(true) },
      ];
    },
    help: () => [
      { label: "Keyboard shortcuts", icon: "keyboard", keys: "?", run: openKeys },
      { label: "Take the tour", icon: "help", run: () => tour(0) },
      "-",
      { label: "Open the garden study", icon: "sky", run: () => (location.href = "index.html") },
    ],
  };
  let openMenuKey = null;
  function openMenuFor(btn) {
    const key = btn.dataset.menu;
    openMenuKey = key;
    const el = menu(MENUS[key](), { anchor: btn, label: `${btn.textContent} menu` });
    // Left and right move to the next menu, the way a desktop menubar does.
    el.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      const btns = [...document.querySelectorAll(".menu-btn")];
      const n = btns[(btns.indexOf(btn) + (e.key === "ArrowRight" ? 1 : btns.length - 1)) % btns.length];
      openMenuFor(n);
    });
    const watch = setInterval(() => { if (!document.contains(el)) { clearInterval(watch); if (openMenuKey === key) openMenuKey = null; } }, 150);
  }
  function initMenubar() {
    document.querySelectorAll(".menu-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (openMenuKey === btn.dataset.menu && document.querySelector(".menu")) { closeMenu(); openMenuKey = null; return; }
        openMenuFor(btn);
      });
      btn.addEventListener("pointerenter", () => { if (openMenuKey && openMenuKey !== btn.dataset.menu && document.querySelector(".menu")) openMenuFor(btn); });
      btn.addEventListener("keydown", (e) => { if (e.key === "ArrowDown") { e.preventDefault(); openMenuFor(btn); } });
    });
  }

  // ---------- the shortcut sheet ----------
  const KEYS = [
    ["Tools", [["V", "Select and move"], ["H", "Pan"], ["R", "Rectangle"], ["E", "Ellipse"], ["T", "Triangle"], ["S", "Star"], ["C", "Cloud"], ["P", "Your own outline"], ["A", "Add pieces"]]],
    ["Editing", [["Ctrl Z", "Undo"], ["Ctrl Shift Z", "Redo"], ["Ctrl D", "Duplicate"], ["Del", "Delete"], ["]", "Bring forward"], ["[", "Send backward"], ["Arrows", "Move (Shift: further)"], ["Shift click", "Select several pieces"], ["Ctrl G", "Group them"], ["Ctrl Shift G", "Ungroup"], ["Double-click", "Reach a piece inside a group"], ["Alt drag", "Move without snapping"], ["Shift", "Turn in 15° steps"], ["Esc", "Deselect"]]],
    ["Layers list", [["↑ ↓", "Move between rows"], ["Alt ↑ ↓", "Restack"], ["F2", "Rename"], ["Del", "Delete"]]],
    ["View", [["Ctrl wheel", "Zoom"], ["Wheel", "Pan"], ["Space drag", "Pan"], ["Ctrl 0", "Fit"], ["Ctrl 1", "100%"], ["Ctrl + −", "Zoom in, out"], ["Shift 2", "Zoom to the selection"], ["G", "Screen guides"], ["F", "Present"]]],
    ["Playing", [["Space", "Play or pause"], [", .", "Previous or next pose"]]],
    ["Files", [["Ctrl S", "Save the scene file"], ["Ctrl O", "Open a scene file"], ["Ctrl E", "Export"], ["?", "This sheet"]]],
  ];
  function openKeys() {
    const box = $("#keys-list");
    if (!box.children.length) {
      for (const [group, rows] of KEYS) {
        box.append(h("section", {}, h("h3", { text: group }),
          ...rows.map(([k, what]) => h("div", { class: "key-row" }, h("span", { text: what }), h("span", {}, ...k.split(" ").map((p) => h("kbd", { class: "keycap", text: p })))))));
      }
    }
    $("#dlg-keys").showModal();
  }

  // ---------- present ----------
  let presenting = false;
  function present(on) {
    if (on === presenting) return;
    presenting = on;
    document.body.classList.toggle("is-presenting", on);
    closeMenu();
    if (LB.STORE.isOpen()) LB.STORE.close(false);
    LB.CANVAS.setPresenting(on);
    const bar = $("#present-bar");
    bar.hidden = !on;
    if (on) {
      bar.style.animation = "none";
      void bar.offsetWidth;
      bar.style.animation = "";
      if (!reduceMotion.matches) setPlaying(true);
      if (document.documentElement.requestFullscreen && !document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
      $("#viewport").focus({ preventScroll: true });
    } else {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      $("#btn-present").focus({ preventScroll: true });
    }
  }
  ED.present = present;

  // ---------- the tour ----------
  const STEPS = [
    ["#btn-add", "Add pieces", "Shapes, plants, beach things, 3D sculpts and your own pictures. Click one, or drag it onto the canvas."],
    [".rail-tools", "Draw", "Draw shapes straight onto the canvas, or your own outline point by point. Each tool has a one-letter key."],
    [".panel-layers", "Layers, front to back", "Every layer stands at a depth. The colors run from cool (far) to warm (near), and the number is its place from the front. Drag rows to restack them."],
    [".panel-inspector", "Change anything", "Pick a piece and its settings show here. Drag a label sideways to scrub its number; double-click it to reset."],
    [".timeline", "The loop", "Every scene is a 6-second loop on a stop-motion beat. Play it, or drag along the beats."],
    ["#btn-export", "Take it with you", "Save a still, an exact video loop or a live wallpaper file."],
  ];
  let tourStep = -1;
  function tour(i) {
    const box = $("#tour");
    if (i < 0 || i >= STEPS.length) {
      tourStep = -1;
      box.hidden = true;
      box.replaceChildren();
      prefs.set("toured", true);
      return;
    }
    tourStep = i;
    const [sel, title, text] = STEPS[i];
    const target = $(sel);
    if (!target) return tour(i + 1);
    box.hidden = false;
    let spot = box.querySelector(".tour-spot"), card = box.querySelector(".tour-card");
    if (!spot) {
      spot = h("div", { class: "tour-spot", "aria-hidden": "true" });
      card = h("div", { class: "tour-card", role: "dialog", "aria-labelledby": "tour-h", "aria-describedby": "tour-p" });
      box.append(spot, card);
    }
    const r = target.getBoundingClientRect(), pad = 6;
    Object.assign(spot.style, { left: `${r.left - pad}px`, top: `${r.top - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const next = h("button", { type: "button", class: "btn btn-primary btn-sm", text: i === STEPS.length - 1 ? "Start making" : "Next", onclick: () => tour(i + 1) });
    card.replaceChildren(
      h("h3", { id: "tour-h", text: title }),
      h("p", { id: "tour-p", text }),
      h("div", { class: "tour-foot" },
        h("span", { class: "tour-dots", "aria-label": `Step ${i + 1} of ${STEPS.length}` }, ...STEPS.map((_, k) => h("i", { class: k === i ? "is-on" : null }))),
        h("button", { type: "button", class: "btn btn-ghost btn-sm", text: "Skip", onclick: () => tour(-1) }), next));
    // Beside the target where there's room, otherwise below or above it.
    const cw = 290, ch = card.offsetHeight || 170;
    let left = r.right + 16, top = r.top;
    if (left + cw > innerWidth - 12) left = r.left - cw - 16;
    if (left < 12) { left = Math.min(Math.max(12, r.left), innerWidth - cw - 12); top = r.bottom + 16; if (top + ch > innerHeight - 12) top = r.top - ch - 16; }
    top = Math.max(12, Math.min(top, innerHeight - ch - 12));
    Object.assign(card.style, { left: `${left}px`, top: `${top}px` });
    next.focus({ preventScroll: true });
  }

  // ---------- shortcuts ----------
  const TOOLS = { v: "select", h: "hand", r: "rect", e: "ellipse", t: "triangle", s: "star", c: "cloud", p: "pen" };
  function typing(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t.type === "range" || t.type === "checkbox" || t.type === "color");
  }
  function onKey(e) {
    if (document.querySelector("dialog[open]")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (tourStep >= 0 && e.key === "Escape") { tour(-1); return; }
    if (mod && k === "z") { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
    if (mod && k === "y") { e.preventDefault(); undo(1); return; }
    if (mod && k === "s") { e.preventDefault(); LB.EXPORT.saveFile(); return; }
    if (mod && k === "o") { e.preventDefault(); $("#file-open").click(); return; }
    if (mod && k === "e") { e.preventDefault(); LB.EXPORT.openExport(); return; }
    if (mod && (k === "=" || k === "+")) { e.preventDefault(); LB.CANVAS.zoomIn(); return; }
    if (mod && (k === "-" || k === "_")) { e.preventDefault(); LB.CANVAS.zoomOut(); return; }
    if (mod && k === "0") { e.preventDefault(); LB.CANVAS.zoomFit(); return; }
    if (mod && k === "1") { e.preventDefault(); LB.CANVAS.zoomTo(100); return; }
    if (typing(e.target) || e.target.type === "range") return;
    if (mod && k === "d") { e.preventDefault(); LB.ACT.duplicate(); return; }
    if (mod && k === "g") { e.preventDefault(); if (e.shiftKey) LB.ACT.ungroup(); else LB.ACT.group(); return; }
    if (mod || e.altKey) return;
    if (e.key === " ") {
      if (/^(BUTTON|A)$/.test(e.target.tagName) || e.target.getAttribute("role") === "radio") return;
      e.preventDefault();
      if (!e.repeat && !ED.space.down) { ED.space.down = true; ED.space.used = false; }
      return;
    }
    if (e.key === "Escape") {
      if (presenting) present(false);
      else if (LB.STORE.isOpen()) LB.STORE.close();
      else if (ED.tool !== "select") ED.setTool("select");
      else ED.select(null);
      return;
    }
    if (presenting) { if (k === "f") present(false); return; }
    if (e.key === "?") { e.preventDefault(); openKeys(); return; }
    if (e.key === "[" || e.key === "]") { LB.ACT.restack(e.key === "]" ? 1 : -1); return; }
    // , and . step through the selected layer's poses, like frame-by-frame in an animation program.
    if ((e.key === "," || e.key === ".") && ED.stepPose(e.key === "." ? 1 : -1)) { e.preventDefault(); return; }
    if (e.shiftKey && e.code === "Digit2") { e.preventDefault(); LB.CANVAS.zoomToSelection(); return; }
    if (e.shiftKey) return;
    if (k === "a") { e.preventDefault(); LB.STORE.toggle(); return; }
    if (k === "g") { LB.CANVAS.setGuides(!ED.guides); bump($("#btn-guides")); return; }
    if (k === "f") { present(true); return; }
    if (TOOLS[k]) ED.setTool(TOOLS[k]);
  }
  function onKeyUp(e) {
    if (e.key !== " " || !ED.space.down) return;
    const used = ED.space.used;
    ED.space.down = false;
    ED.space.used = false;
    $("#viewport").style.cursor = "";
    // A tap of Space plays or pauses; Space held while dragging pans instead.
    if (!used && !typing(e.target)) { setPlaying(!ED.playing, true); bump($("#btn-play")); }
  }

  // ---------- boot ----------
  async function boot() {
    // The renderer comes first, so its shaders can start compiling while the panels are built.
    // It starts with a blank scene; the real one replaces it on the first sync.
    const canvas = $("#scene");
    const small = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
    try {
      renderer = LB.createRenderer(canvas, LB.DOC.blankDoc(), {
        quality: small ? "low" : "high",
        bakeHeight: Math.min(Math.max(screen.height, window.innerHeight), 1440) * Math.min(window.devicePixelRatio || 1, 2),
        // ?timebake=1 logs shader compile and bake times to the console, like the study page.
        timeBake: new URLSearchParams(location.search).has("timebake"),
      });
    } catch (err) {
      hydrateIcons();
      fail("This editor needs WebGL2, which this browser or device doesn't have turned on. The study page has a still image instead.");
      return;
    }
    hydrateIcons();
    setTheme(document.documentElement.dataset.theme === "paper" ? "paper" : "studio");
    LB.LAYERS.init();
    LB.STORE.init();
    LB.PANELS.init();
    LB.EXPORT.init();
    initMenubar();
    let first = null, warnings = [];
    try {
      const saved = await LB.DOC.loadLocal();
      if (saved) { first = saved.doc; warnings = saved.warnings; }
    } catch (err) {
      console.warn("No saved scene", err);
    }
    const restored = !!first;
    if (!first) first = LB.DOC.fromBeach();
    clock = LB.createClock(first.fps || 12);
    ED.renderer = renderer;
    ED.clock = clock;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setPlaying(false); fail("The graphics card reset and the canvas was lost. Reload the page; your scene is saved in this browser."); });

    LB.CANVAS.init();
    ED.on("doc", scheduleSync);
    ED.on("doc", (e) => { if (!e || !e.preview) updateFps(); });
    ED.on("history", updateHistory);
    ED.on("load", () => { $("#doc-title").value = ED.doc.title; $("#viewport").classList.add("is-loading"); tickKey = ""; });

    $("#doc-title").addEventListener("input", (e) => ED.preview((d) => (d.title = e.target.value.slice(0, 80) || "Untitled scene")));
    $("#doc-title").addEventListener("change", () => ED.commit("Rename scene"));
    $("#doc-title").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === "Escape") e.target.blur(); });
    $("#btn-undo").addEventListener("click", () => undo(-1));
    $("#btn-redo").addEventListener("click", () => undo(1));
    $("#btn-theme").addEventListener("click", toggleTheme);
    $("#btn-help").addEventListener("click", openKeys);
    $("#btn-present").addEventListener("click", () => present(true));
    $("#btn-play").addEventListener("click", () => { setPlaying(!ED.playing, true); bump($("#btn-play")); });
    $("#scrub").addEventListener("input", (e) => { setPlaying(false); clock.set(+e.target.value / clock.fps + 1e-4); redraw(); ED.emit("pose"); });
    document.querySelectorAll("#fps-seg [data-fps]").forEach((b) => b.addEventListener("click", () => {
      const v = +b.dataset.fps;
      if (v !== ED.doc.fps) ED.change((d) => (d.fps = v), `${v} beats a second`);
      bump(b);
    }));
    radioKeys($("#fps-seg"), (b) => b.click());
    document.querySelectorAll("[data-pose-mode]").forEach((b) => b.addEventListener("click", () => { setPoseMode(b.dataset.poseMode); bump(b); }));
    radioKeys(document.querySelector("[data-pose-mode]").parentElement, (b) => b.click());
    $("#onion").addEventListener("click", toggleOnion);
    $("#btn-copy-pose").addEventListener("click", () => { const L = ED.selLayer(); if (L && L.cycle) LB.ACT.copyPreviousPose(L, renderer.frameOf(L.id, clock)); });
    document.addEventListener("keydown", onKey);
    document.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", () => { ED.space.down = false; ED.space.used = false; });
    document.addEventListener("fullscreenchange", () => { if (!document.fullscreenElement && presenting) present(false); });
    ED.on("select", () => { renderer.setPost(postFor(ED.doc)); updatePoseStrip(); buildTicks(); redraw(); });
    document.addEventListener("visibilitychange", schedule);
    reduceMotion.addEventListener("change", (e) => { if (e.matches) setPlaying(false); });

    ED.load(first, "Open");
    LB.CANVAS.fit();
    updateFps();
    if (warnings.length) ED.emit("status", { msg: warnings.join(" "), tone: "warn" });
    else ED.emit("status", { msg: restored ? "Opened your last scene from this browser." : "This is Beach day, the sample scene. Click any piece to see how it's made, or start fresh with File, New scene." });
    setSave(restored ? "saved" : "dirty", restored ? "Saved in this browser" : "Not saved yet");

    await renderer.sync(sceneFor(ED.doc));
    $("#viewport").classList.remove("is-loading");
    $("#loading").hidden = true;
    LB.CANVAS.applyView();
    redraw();
    ED.emit("synced");
    setPlaying(!reduceMotion.matches);
    document.documentElement.dataset.ready = "true";
    LB.STORE.makeThumbs();
    if (!prefs.get("toured", false) && !navigator.webdriver && !new URLSearchParams(location.search).has("notour")) setTimeout(() => tour(0), 900);
  }

  // For scripted checks.
  LB.editor = { get renderer() { return renderer; }, get clock() { return clock; }, ED, tour, present, openKeys, hydrateIcons };

  boot().catch((err) => { console.error(err); fail(`The editor didn't start: ${err.message}`); });
})();
