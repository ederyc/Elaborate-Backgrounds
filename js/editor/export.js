/*
  Getting scenes in and out:

    Scene file   save and open .json scene files (pictures embedded)
    Still        a PNG of the current beat at a wallpaper size
    Video loop   records one 6-second loop from the live canvas with
                 MediaRecorder: MP4 where the browser can, WebM otherwise.
                 It records in real time, so the tab has to stay visible.
                 Measured in Chrome: files come out 5.94-5.96 s long, so
                 the last beat is about 50 ms short when the file loops.
                 Frame-exact loops need WebCodecs and a muxer (docs/PLAN.md).

  For a still or a video, the canvas is drawn at the export size and then
  put back. Layer textures were baked for the screen (up to 1200 px per
  scene height), so 4K stills are upscaled from that.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const $ = (s) => document.querySelector(s);
  const say = (msg, tone) => ED.emit("status", { msg, tone });

  const STILL_SIZES = [
    ["1920x1080", "Desktop, 1920 × 1080"], ["2560x1440", "Desktop, 2560 × 1440"], ["3840x2160", "Desktop 4K, 3840 × 2160"],
    ["1080x1920", "Phone, 1080 × 1920"], ["1170x2532", "Phone, 1170 × 2532"],
  ];
  const VIDEO_SIZES = [["1920x1080", "Desktop, 1920 × 1080"], ["1280x720", "Desktop, 1280 × 720"], ["1080x1920", "Phone, 1080 × 1920"]];

  const slug = (s) => (s || "scene").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "scene";

  function download(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  // ---------- scene files ----------
  function saveFile() {
    const text = LB.DOC.serialize(ED.doc);
    download(new Blob([text], { type: "application/json" }), `${slug(ED.doc.title)}.json`);
    const kb = Math.round(text.length / 1024);
    say(`Saved ${slug(ED.doc.title)}.json (${kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB"}).`);
  }

  async function openFile(file) {
    try {
      const text = await file.text();
      let raw;
      try { raw = JSON.parse(text); } catch { throw new Error(`${file.name} isn't valid JSON.`); }
      const { doc, warnings } = LB.DOC.normalize(raw);
      ED.load(doc, "Open");
      say(warnings.length ? `Opened ${file.name}. ${warnings.join(" ")}` : `Opened ${file.name}.`, warnings.length ? "warn" : undefined);
    } catch (err) {
      say(`Couldn't open that file: ${err.message}`, "error");
    }
  }

  // ---------- stills ----------
  async function exportStill(size) {
    const [w, h] = size.split("x").map(Number);
    const r = ED.renderer;
    const prev = r.size;
    ED.recording = true;
    try {
      r.resize(w, h);
      r.invalidate();
      r.draw(ED.clock);
      const img = r.readPixels();
      const c = document.createElement("canvas");
      c.width = w;
      c.height = h;
      c.getContext("2d").putImageData(img, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, "image/png"));
      download(blob, `${slug(ED.doc.title)}-${w}x${h}.png`);
      say(`Saved a ${w} × ${h} still of beat ${ED.clock.beat + 1}.`);
    } catch (err) {
      say(`The still didn't render: ${err.message}`, "error");
    } finally {
      r.resize(prev[0], prev[1]);
      ED.recording = false;
      LB.CANVAS.fit();
    }
  }

  // ---------- video ----------
  function videoType() {
    const options = ["video/mp4;codecs=avc1.640028", "video/mp4", "video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    return options.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
  }

  async function exportVideo(size, progress) {
    const type = videoType();
    if (!type) return say("This browser can't record video from a canvas. Try a current Chrome, Edge or Firefox.", "error");
    const [w, h] = size.split("x").map(Number);
    const r = ED.renderer;
    const prev = r.size;
    const wasPlaying = ED.playing;
    ED.recording = true;
    document.body.classList.add("is-recording");
    try {
      ED.setPlaying(false);
      r.resize(w, h);
      ED.clock.set(0);
      r.invalidate();
      r.draw(ED.clock);
      // Frames are pushed by hand, one per drawn beat, so nothing from before the recording starts gets in.
      const stream = document.getElementById("scene").captureStream(0);
      const track = stream.getVideoTracks()[0];
      const rec = new MediaRecorder(stream, { mimeType: type, videoBitsPerSecond: w * h > 2e6 ? 16e6 : 10e6 });
      const chunks = [];
      rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const stopped = new Promise((res) => (rec.onstop = res));
      // The file's timeline starts when start() is called, even though the encoder may take a second to
      // report that it's running, and frames pushed meanwhile are kept. So playback starts in the same
      // moment, the clock follows real time, and recording stops exactly one loop later.
      await new Promise((resolve) => {
        ED.onLoopEnd = () => { ED.onFrame = null; rec.stop(); resolve(); };
        ED.onFrame = () => track.requestFrame();
        ED.onProgress = progress;
        rec.start();
        ED.recordStart = performance.now();
        // The first frame of the file is beat 0, drawn fresh on the first tick.
        r.invalidate();
        ED.setPlaying(true, true);
      });
      ED.onLoopEnd = null;
      ED.onFrame = null;
      ED.onProgress = null;
      ED.setPlaying(false, true);
      await stopped;
      stream.getTracks().forEach((t) => t.stop());
      const ext = type.startsWith("video/mp4") ? "mp4" : "webm";
      const blob = new Blob(chunks, { type: type.split(";")[0] });
      download(blob, `${slug(ED.doc.title)}-loop-${w}x${h}.${ext}`);
      say(`Saved a ${LB.LOOP}-second ${ext.toUpperCase()} loop at ${w} × ${h} (${(blob.size / 1e6).toFixed(1)} MB).`);
    } catch (err) {
      say(`The recording failed: ${err.message}`, "error");
    } finally {
      ED.recording = false;
      document.body.classList.remove("is-recording");
      r.resize(prev[0], prev[1]);
      LB.CANVAS.fit();
      ED.setPlaying(wasPlaying);
    }
  }

  // ---------- dialogs ----------
  function fillSelect(sel, list) {
    sel.innerHTML = "";
    for (const [v, t] of list) {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = t;
      sel.append(o);
    }
  }

  function init() {
    $("#btn-save").addEventListener("click", saveFile);
    $("#btn-open").addEventListener("click", () => $("#file-open").click());
    $("#file-open").addEventListener("change", (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ""; });

    const dlgNew = $("#dlg-new");
    $("#btn-new").addEventListener("click", () => dlgNew.showModal());
    dlgNew.addEventListener("click", (e) => {
      const t = e.target.closest("[data-template]");
      if (!t) return;
      const kind = t.dataset.template;
      const doc = kind === "study" ? LB.DOC.fromStudy() : kind === "beach" ? LB.DOC.fromBeach() : LB.DOC.blankDoc();
      dlgNew.close();
      ED.load(doc, "New scene");
      say({ study: "Opened the garden study. Every piece of it can be moved, changed or deleted.",
        beach: "Opened the Beach day sample. Every piece is an editor shape; click one to see how it's made.",
        blank: "New scene. Draw with the shape tools or add pieces from the store." }[kind]);
    });

    const dlg = $("#dlg-export");
    fillSelect($("#still-size"), STILL_SIZES);
    fillSelect($("#video-size"), VIDEO_SIZES);
    const type = videoType();
    $("#video-format").textContent = type ? `Records as ${type.startsWith("video/mp4") ? "MP4" : "WebM"}, in real time: keep this tab visible for ${LB.LOOP} seconds.` : "This browser can't record video from a canvas.";
    $("#btn-export").addEventListener("click", () => dlg.showModal());
    $("#do-still").addEventListener("click", async () => { dlg.close(); await exportStill($("#still-size").value); });
    $("#do-json").addEventListener("click", () => { dlg.close(); saveFile(); });
    $("#do-video").addEventListener("click", async () => {
      const btn = $("#do-video");
      btn.disabled = true;
      const out = $("#video-progress");
      out.hidden = false;
      await exportVideo($("#video-size").value, (f) => { out.value = f; out.textContent = `${Math.round(f * 100)}%`; });
      out.hidden = true;
      btn.disabled = false;
      dlg.close();
    });
    document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  }

  LB.EXPORT = { init, saveFile, openFile, exportStill, exportVideo };
})();
