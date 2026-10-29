/*
  Editor boot and the frame loop.

  - Opens the scene saved in this browser, or the garden study the first time.
  - Every document change syncs the renderer (only changed layers rebake),
    updates the look, and autosaves a second after the last edit.
  - The same courtesy as the study page: no autoplay with
    prefers-reduced-motion, and nothing renders while the tab is hidden.
  - Shortcuts: Ctrl+Z / Ctrl+Shift+Z / Ctrl+Y undo and redo, Ctrl+S saves
    the file, Ctrl+D duplicates, Space plays and pauses, V R E T S C pick
    tools, [ and ] restack, Escape deselects or cancels a tool.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const $ = (s) => document.querySelector(s);
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  let renderer, clock;
  let raf = 0, last = 0;
  ED.playing = false;

  // ---------- status line ----------
  let statusTimer = 0;
  ED.on("status", ({ msg, tone }) => {
    const el = $("#status");
    el.textContent = msg;
    el.dataset.tone = tone || "";
    clearTimeout(statusTimer);
    if (tone !== "error") statusTimer = setTimeout(() => { if (el.textContent === msg) el.textContent = ""; }, 9000);
  });

  function fail(message) {
    $("#viewport").classList.add("is-broken");
    $("#loading").hidden = false;
    $("#loading").textContent = message;
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
        .then(() => { $("#viewport").classList.remove("is-loading"); redraw(); ED.emit("synced"); })
        .catch((err) => { console.error(err); ED.emit("status", { msg: `Part of the scene couldn't be drawn: ${err.message.split("\n")[0]}`, tone: "error" }); });
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
    btn.title = p ? "Pause (Space)" : "Play (Space)";
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

  // ---------- poses under the canvas ----------
  ED.onion = false;
  let poseKey = "";
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
      $("#pose-label").textContent = `Poses of ${L.name}`;
      const box = $("#pose-buttons");
      box.innerHTML = "";
      for (let i = 0; i < L.cycle.frames; i++) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = String(i + 1);
        b.setAttribute("aria-label", `Pose ${i + 1}`);
        b.addEventListener("click", () => goToPose(ED.selLayer(), i));
        box.append(b);
      }
    }
    [...$("#pose-buttons").children].forEach((b, i) => b.setAttribute("aria-pressed", String(i === f)));
  }

  function updateTransport() {
    updatePoseStrip();
    const beats = Math.round(LB.LOOP * clock.fps);
    const scrub = $("#scrub");
    scrub.max = beats - 1;
    if (document.activeElement !== scrub) scrub.value = clock.beat;
    $("#beat-readout").textContent = `Beat ${clock.beat + 1} of ${beats}`;
  }

  // ---------- autosave ----------
  let saveTimer = 0;
  ED.on("history", () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        await LB.DOC.saveLocal(ED.doc);
        $("#save-state").textContent = "Saved in this browser";
      } catch (err) {
        $("#save-state").textContent = "Not saved: this browser blocked storage. Use Save file.";
      }
    }, 1000);
  });
  ED.on("saved-state", () => ($("#save-state").textContent = "Unsaved changes"));

  // ---------- history buttons and title ----------
  function updateHistory() {
    const H = ED.history;
    const u = $("#btn-undo"), r = $("#btn-redo");
    u.disabled = !H.canUndo;
    r.disabled = !H.canRedo;
    u.title = H.canUndo ? `Undo ${H.undoLabel} (Ctrl+Z)` : "Nothing to undo";
    r.title = H.canRedo ? `Redo ${H.redoLabel} (Ctrl+Shift+Z)` : "Nothing to redo";
    u.setAttribute("aria-label", H.canUndo ? `Undo ${H.undoLabel}` : "Undo");
    r.setAttribute("aria-label", H.canRedo ? `Redo ${H.redoLabel}` : "Redo");
  }
  function undo(step) {
    const label = ED.history.go(step);
    if (label) ED.emit("status", { msg: `${step < 0 ? "Undid" : "Redid"}: ${label}.` });
  }

  // ---------- shortcuts ----------
  const TOOLS = { v: "select", r: "rect", e: "ellipse", t: "triangle", s: "star", c: "cloud", p: "pen" };
  function typing(t) {
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) && !(t.type === "range" || t.type === "checkbox" || t.type === "color");
  }
  function onKey(e) {
    if (document.querySelector("dialog[open]")) return;
    const mod = e.ctrlKey || e.metaKey;
    const k = e.key.toLowerCase();
    if (mod && k === "z") { e.preventDefault(); undo(e.shiftKey ? 1 : -1); return; }
    if (mod && k === "y") { e.preventDefault(); undo(1); return; }
    if (mod && k === "s") { e.preventDefault(); LB.EXPORT.saveFile(); return; }
    if (typing(e.target) || e.target.type === "range") return;
    if (mod && k === "d") { e.preventDefault(); LB.ACT.duplicate(); return; }
    if (mod || e.altKey) return;
    if (e.key === " " && !/^(BUTTON|A)$/.test(e.target.tagName)) { e.preventDefault(); setPlaying(!ED.playing, true); return; }
    if (e.key === "Escape") {
      if (ED.tool !== "select") ED.setTool("select");
      else ED.select(null);
      return;
    }
    if (e.key === "[" || e.key === "]") { LB.ACT.restack(e.key === "]" ? 1 : -1); return; }
    // , and . step through the selected layer's poses, like frame-by-frame in an animation program.
    if ((e.key === "," || e.key === ".") && ED.stepPose(e.key === "." ? 1 : -1)) { e.preventDefault(); return; }
    if (TOOLS[k] && !e.shiftKey) ED.setTool(TOOLS[k]);
  }

  // ---------- boot ----------
  async function boot() {
    LB.PANELS.init();
    LB.EXPORT.init();
    const canvas = $("#scene");
    let first = null, warnings = [];
    try {
      const saved = await LB.DOC.loadLocal();
      if (saved) { first = saved.doc; warnings = saved.warnings; }
    } catch (err) {
      console.warn("No saved scene", err);
    }
    const restored = !!first;
    if (!first) first = LB.DOC.fromBeach();

    const small = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
    try {
      renderer = LB.createRenderer(canvas, first, {
        quality: small ? "low" : "high",
        bakeHeight: Math.min(Math.max(screen.height, window.innerHeight), 1440) * Math.min(window.devicePixelRatio || 1, 2),
        // ?timebake=1 logs shader compile and bake times to the console, like the study page.
        timeBake: new URLSearchParams(location.search).has("timebake"),
      });
    } catch (err) {
      fail("This editor needs WebGL2, which this browser or device doesn't have turned on. The study page has a still image instead.");
      return;
    }
    clock = LB.createClock(first.fps || 12);
    ED.renderer = renderer;
    ED.clock = clock;
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setPlaying(false); fail("The graphics card reset and the canvas was lost. Reload the page; your scene is saved in this browser."); });

    LB.CANVAS.init();
    ED.on("doc", scheduleSync);
    ED.on("history", updateHistory);
    ED.on("load", () => { $("#doc-title").value = ED.doc.title; $("#viewport").classList.add("is-loading"); });

    $("#doc-title").addEventListener("input", (e) => ED.preview((d) => (d.title = e.target.value.slice(0, 80) || "Untitled scene")));
    $("#doc-title").addEventListener("change", () => ED.commit("Rename scene"));
    $("#btn-undo").addEventListener("click", () => undo(-1));
    $("#btn-redo").addEventListener("click", () => undo(1));
    $("#btn-play").addEventListener("click", () => setPlaying(!ED.playing, true));
    $("#scrub").addEventListener("input", (e) => { setPlaying(false); clock.set(+e.target.value / clock.fps + 1e-4); redraw(); ED.emit("pose"); });
    $("#btn-import").addEventListener("click", () => $("#file-image").click());
    $("#file-image").addEventListener("change", (e) => { LB.ACT.importImages(e.target.files); e.target.value = ""; });
    document.addEventListener("keydown", onKey);
    document.querySelectorAll("[data-pose-mode]").forEach((b) => b.addEventListener("click", () => {
      ED.poseMode = b.dataset.poseMode;
      document.querySelectorAll("[data-pose-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      ED.emit("status", { msg: ED.poseMode === "pose" ? "Moving, scaling or rotating a piece now changes only the pose on screen." : "Moving a piece now moves it in every pose." });
    }));
    $("#onion").addEventListener("change", (e) => { ED.onion = e.target.checked; renderer.setPost(postFor(ED.doc)); redraw(); });
    $("#btn-copy-pose").addEventListener("click", () => { const L = ED.selLayer(); if (L && L.cycle) LB.ACT.copyPreviousPose(L, renderer.frameOf(L.id, clock)); });
    ED.on("select", () => { renderer.setPost(postFor(ED.doc)); updatePoseStrip(); redraw(); });
    document.addEventListener("visibilitychange", schedule);
    reduceMotion.addEventListener("change", (e) => { if (e.matches) setPlaying(false); });

    ED.load(first, "Open");
    LB.CANVAS.fit();
    if (warnings.length) ED.emit("status", { msg: warnings.join(" "), tone: "warn" });
    else ED.emit("status", { msg: restored ? "Opened your last scene from this browser." : "This is Beach day, the sample scene. Click any piece to see how it's made, or start fresh with New." });
    $("#save-state").textContent = restored ? "Saved in this browser" : "Not saved yet";

    await renderer.sync(sceneFor(ED.doc));
    $("#viewport").classList.remove("is-loading");
    $("#loading").hidden = true;
    redraw();
    setPlaying(!reduceMotion.matches);
    document.documentElement.dataset.ready = "true";
    LB.PANELS.makeThumbs();
  }

  // For scripted checks.
  LB.editor = { get renderer() { return renderer; }, get clock() { return clock; }, ED };

  boot().catch((err) => { console.error(err); fail(`The editor didn't start: ${err.message}`); });
})();
