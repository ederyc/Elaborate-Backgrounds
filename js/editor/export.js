/*
  Getting scenes in and out:

    Scene file   save and open .json scene files (pictures embedded)
    Still        a PNG of the current beat at a wallpaper size
    Video loop   exact: every beat is rendered offline at the export size,
                 encoded with WebCodecs (H.264) with its own timestamp, and
                 packed into an MP4 by js/editor/mp4.js. A loop is exactly 6 s
                 (72 frames at 12 beats a second), so it repeats seamlessly.
                 Where WebCodecs or H.264 encoding isn't available, it falls
                 back to recording the canvas in real time with MediaRecorder
                 (measured 5.94-5.96 s, so the last beat runs short).
    Live wallpaper  one self-contained HTML file: the player (js/player.js),
                 the engine and the scene, plus a still to show while it
                 starts. For tools that show a web page as a wallpaper, or
                 for embedding as a page background.

  For a still or a video, the canvas is drawn at the export size and then
  put back. Layer textures were baked for the screen (up to 1200 px per
  scene height), so 4K stills are upscaled from that.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const $ = (s) => document.querySelector(s);
  const say = (msg, tone) => ED.emit("status", { msg, tone });

  // Common wallpaper sizes. The ones that match the scene's own shape are listed first; the rest show a crop.
  const SIZES = [
    [1920, 1080, "Desktop"], [2560, 1440, "Desktop"], [3840, 2160, "Desktop 4K"], [1280, 720, "Desktop, small"],
    [2560, 1080, "Ultrawide"], [3440, 1440, "Ultrawide"], [1920, 1200, "Laptop 16:10"], [2560, 1600, "Laptop 16:10"],
    [1080, 1080, "Square"], [2048, 2048, "Square"], [1080, 1920, "Phone"], [1080, 2340, "Phone, tall"], [1170, 2532, "Phone, tall"],
  ];
  function sizeOptions(forVideo) {
    const A = ED.doc.aspect;
    const fits = ([w, h]) => Math.abs(w / h / A - 1) < 0.04;
    const list = SIZES.filter(([w, h]) => !forVideo || w * h <= 3840 * 2160);
    return [...list.filter(fits), ...list.filter((sz) => !fits(sz))].map(([w, h, name]) => [`${w}x${h}`, `${name}, ${w} × ${h}${fits([w, h]) ? " (the whole scene)" : " (cropped)"}`]);
  }

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
    say(`Saved ${slug(ED.doc.title)}.json (${kb >= 1024 ? (kb / 1024).toFixed(1) + " MB" : kb + " KB"}).`, "ok");
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
      // The editor's zoom is a view of its own; exports use the scene's real crop.
      r.setView(null);
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

  // ---------- exact video (WebCodecs + js/editor/mp4.js) ----------
  // H.264 levels by frame size: 4.0 up to 1080p, 5.1 up to 4K.
  function avcConfig(w, h, fps) {
    const codecs = w * h > 1920 * 1088 ? ["avc1.640033", "avc1.4d0033", "avc1.420033"] : ["avc1.640028", "avc1.4d0028", "avc1.42002a"];
    return codecs.map((codec) => ({ codec, width: w, height: h, framerate: fps, bitrate: Math.round(w * h * fps * 0.25), avc: { format: "avc" } }));
  }
  async function exactConfig(w, h, fps) {
    if (!window.VideoEncoder || !window.VideoFrame) return null;
    for (const cfg of avcConfig(w, h, fps)) {
      try { if ((await VideoEncoder.isConfigSupported(cfg)).supported) return cfg; } catch {}
    }
    return null;
  }

  async function exportVideoExact(size, loops, progress) {
    const [w, h] = size.split("x").map(Number);
    const fps = ED.clock.fps;
    const cfg = await exactConfig(w, h, fps);
    if (!cfg) return exportVideo(size, progress);
    const r = ED.renderer, prev = r.size, wasPlaying = ED.playing, t0 = ED.clock.seconds;
    const canvas = document.getElementById("scene");
    const samples = [];
    let avcC = null, failed = null;
    ED.recording = true;
    document.body.classList.add("is-recording");
    try {
      ED.setPlaying(false);
      r.setView(null);
      r.resize(w, h);
      const enc = new VideoEncoder({
        output: (chunk, meta) => {
          if (meta && meta.decoderConfig && meta.decoderConfig.description) avcC = new Uint8Array(meta.decoderConfig.description.buffer ? meta.decoderConfig.description.buffer : meta.decoderConfig.description);
          const data = new Uint8Array(chunk.byteLength);
          chunk.copyTo(data);
          samples.push({ data, key: chunk.type === "key" });
        },
        error: (e) => (failed = e),
      });
      enc.configure(cfg);
      const perLoop = Math.round(LB.LOOP * fps), total = perLoop * loops, us = 1e6 / fps;
      for (let b = 0; b < total; b++) {
        if (failed) throw failed;
        ED.clock.set((b % perLoop) / fps + 1e-4);
        r.invalidate();
        r.draw(ED.clock);
        const frame = new VideoFrame(canvas, { timestamp: Math.round(b * us), duration: Math.round(us) });
        // A keyframe every 2 seconds, and on the first frame of every loop, so a player can jump in anywhere.
        enc.encode(frame, { keyFrame: b % perLoop === 0 || b % (fps * 2) === 0 });
        frame.close();
        if (progress) progress((b + 1) / total);
        if (enc.encodeQueueSize > 6) await new Promise((res) => enc.addEventListener("dequeue", res, { once: true }));
        else if (b % 6 === 5) await new Promise((res) => setTimeout(res, 0));
      }
      await enc.flush();
      enc.close();
      if (failed) throw failed;
      if (!avcC) throw new Error("the encoder didn't describe its stream");
      const blob = LB.MP4.mux({ width: w, height: h, timescale: fps * 1000, delta: 1000, avcC, samples });
      const name = `${slug(ED.doc.title)}-loop-${w}x${h}${loops > 1 ? `-x${loops}` : ""}.mp4`;
      download(blob, name);
      ED.lastVideo = blob;
      say(`Saved ${name}: exactly ${LB.LOOP * loops} s, ${total} frames at ${fps} a second, ${(blob.size / 1e6).toFixed(1)} MB. It loops without a seam.`);
    } catch (err) {
      say(`The video didn't render: ${err.message || err}`, "error");
    } finally {
      ED.recording = false;
      document.body.classList.remove("is-recording");
      r.resize(prev[0], prev[1]);
      ED.clock.set(t0);
      LB.CANVAS.fit();
      ED.setPlaying(wasPlaying);
    }
  }

  // ---------- live wallpaper ----------
  // The same scripts player.html loads, in order. They're read from this site and written inline.
  const PLAYER_SCRIPTS = ["js/gl.js", "js/clock.js", "js/materials.js", "js/elements.js", "js/shapes.js", "js/clay.js", "js/items.js", "js/post.js", "js/renderer.js",
    "js/scenes/garden-art.js", "js/scenes/lilac-art.js", "js/editor/doc.js", "js/player.js"];
  const esc = (t) => t.replace(/<\/(script)/gi, "<\\/$1");
  async function exportLiveWallpaper() {
    try {
      const sources = await Promise.all(PLAYER_SCRIPTS.map(async (src) => {
        const res = await fetch(src, { cache: "no-cache" });
        if (!res.ok) throw new Error(`couldn't read ${src}`);
        return [src, await res.text()];
      }));
      // A still for the first moment, and for a computer without WebGL2.
      const r = ED.renderer, prev = r.size;
      const pw = ED.doc.aspect >= 1 ? 1280 : Math.round(1280 * ED.doc.aspect), ph = ED.doc.aspect >= 1 ? Math.round(1280 / ED.doc.aspect) : 1280;
      r.setView(null);
      r.resize(pw - (pw % 2), ph - (ph % 2));
      r.invalidate();
      r.draw(ED.clock);
      const c = document.createElement("canvas");
      const img = r.readPixels();
      c.width = img.width; c.height = img.height;
      c.getContext("2d").putImageData(img, 0, 0);
      const poster = c.toDataURL("image/jpeg", 0.82);
      r.resize(prev[0], prev[1]);
      LB.CANVAS.fit();
      const scene = LB.DOC.serialize(ED.doc).replace(/</g, "\\u003c");
      const title = ED.doc.title.replace(/[<&"]/g, "");
      const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%23000000'/%3E%3Ctext x='16' y='23' font-family='Georgia, serif' font-size='19' font-weight='700' fill='%23D9A441' text-anchor='middle'%3EE%3C/text%3E%3C/svg%3E">
<!-- A live wallpaper made with the Backdrop Editor (Elaborate Backgrounds). Options: add ?controls=1 for a pause button, ?fps=8, ?quality=low. -->
<style>
html, body { margin: 0; height: 100%; overflow: hidden; background: ${ED.doc.background}; }
canvas, #poster { position: fixed; inset: 0; width: 100%; height: 100%; display: block; object-fit: cover; }
#poster { object-position: ${Math.round((ED.doc.focus[0] / ED.doc.aspect) * 100)}% ${Math.round(ED.doc.focus[1] * 100)}%; }
.pb { position: fixed; right: 16px; bottom: 16px; min-width: 44px; min-height: 44px; padding: 0 14px; border: 1px solid #D9A441; border-radius: 999px;
  background: rgba(19, 19, 19, 0.85); color: #F3EEDD; font: 500 15px/1 system-ui, sans-serif; cursor: pointer; }
.pb:focus-visible { outline: 2px solid #F3EEDD; outline-offset: 3px; }
</style>
</head>
<body>
<main>
<img id="poster" src="${poster}" alt="${title}">
<canvas id="scene" aria-hidden="true"></canvas>
</main>
<script type="application/json" id="scene-data">${scene}</script>
${sources.map(([src, text]) => `<script data-src="${src}">\n${esc(text)}\n</script>`).join("\n")}
</body>
</html>`;
      const blob = new Blob([html], { type: "text/html" });
      const name = `${slug(ED.doc.title)}-live-wallpaper.html`;
      download(blob, name);
      ED.lastWallpaper = html;
      say(`Saved ${name} (${(blob.size / 1e6).toFixed(1)} MB). Open it in a browser to try it, or point a web-wallpaper app at it.`);
    } catch (err) {
      say(`The live wallpaper didn't build: ${err.message}`, "error");
    }
  }

  // ---------- real-time recording (the fallback) ----------
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
      r.setView(null);
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

  function openNew() { $("#dlg-new").showModal(); }
  async function openExport() {
    if (ED.recording) return;
    const dlg = $("#dlg-export");
    fillSelect($("#still-size"), sizeOptions(false));
    fillSelect($("#video-size"), sizeOptions(true));
    const exact = await exactConfig(1920, 1080, ED.clock.fps);
    const type = videoType();
    $("#video-format").textContent = exact
      ? `An MP4 that loops exactly: every beat is rendered on its own, so it doesn't matter how fast this computer is.`
      : type ? `This browser can't encode frame by frame, so it records in real time as ${type.startsWith("video/mp4") ? "MP4" : "WebM"}. Keep this tab visible for ${LB.LOOP} seconds; the last beat may run a little short.` : "This browser can't make video.";
    $("#video-loops").disabled = !exact;
    if (!dlg.open) dlg.showModal();
  }

  function init() {
    $("#file-open").addEventListener("change", (e) => { if (e.target.files[0]) openFile(e.target.files[0]); e.target.value = ""; });

    const dlgNew = $("#dlg-new");
    dlgNew.addEventListener("click", (e) => {
      const t = e.target.closest("[data-template]");
      if (!t) return;
      const kind = t.dataset.template;
      const doc = kind === "study" ? LB.DOC.fromStudy() : kind === "beach" ? LB.DOC.fromBeach() : kind === "lilac" ? LB.DOC.fromLilac() : LB.DOC.blankDoc(+t.dataset.aspect || LB.DOC.A);
      dlgNew.close();
      ED.load(doc, "New scene");
      say({ study: "Opened the garden study. Every piece of it can be moved, changed or deleted.",
        beach: "Opened the Beach day sample. Every piece is an editor shape; click one to see how it's made.",
        lilac: "Opened Lilac Falls. The water, cliff, sky and hills are bespoke art; everything else is the editor's own pieces.",
        blank: "New scene. Draw with the shape tools or add pieces from the store." }[kind]);
    });

    const dlg = $("#dlg-export");
    $("#btn-export").addEventListener("click", openExport);
    $("#do-live").addEventListener("click", async () => { dlg.close(); await exportLiveWallpaper(); });
    $("#do-still").addEventListener("click", async () => { dlg.close(); await exportStill($("#still-size").value); });
    $("#do-json").addEventListener("click", () => { dlg.close(); saveFile(); });
    $("#do-video").addEventListener("click", async () => {
      const btn = $("#do-video");
      btn.disabled = true;
      const out = $("#video-progress");
      out.hidden = false;
      await exportVideoExact($("#video-size").value, +$("#video-loops").value || 1, (f) => { out.value = f; out.textContent = `${Math.round(f * 100)}%`; });
      out.hidden = true;
      btn.disabled = false;
      dlg.close();
    });
    document.querySelectorAll("dialog [data-close]").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));
  }

  LB.EXPORT = { init, openNew, openExport, saveFile, openFile, exportStill, exportVideo, exportVideoExact, exportLiveWallpaper, exactConfig };
})();
