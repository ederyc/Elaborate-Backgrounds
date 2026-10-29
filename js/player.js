/*
  The player: plays one scene full screen with nothing else on the page.
  It's what an exported live wallpaper runs, and player.html uses it to
  embed a scene as a page background.

  Where the scene comes from, first match wins:
    an embedded <script type="application/json" id="scene-data">   (exported wallpapers)
    ?scene=path/to/scene.json                                        (any scene file on the same site)
    ?sample=beach | garden                                           (the built-in scenes)

  Options: ?controls=1 shows a pause button (use it when the page is a
  background behind other content), ?fps=12|8|6, ?quality=low, ?motion=1
  plays even with prefers-reduced-motion (a wallpaper app's own setting
  can stand in for the system one).

  Running all day is the point, so it only wakes up when there's work:
  a timer sleeps until the next beat, then one frame draws it. Between
  beats nothing runs. It stops entirely while the page is hidden.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const params = new URLSearchParams(location.search);
  const canvas = document.getElementById("scene");
  const poster = document.getElementById("poster");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  async function loadScene() {
    const embedded = document.getElementById("scene-data");
    if (embedded) return JSON.parse(embedded.textContent);
    if (params.get("scene")) {
      const res = await fetch(params.get("scene"));
      if (!res.ok) throw new Error(`couldn't load ${params.get("scene")}`);
      return res.json();
    }
    if (params.get("sample") === "garden" && LB.scenes && LB.scenes.garden) return LB.scenes.garden;
    if (LB.scenes && LB.scenes.beach) return LB.scenes.beach();
    throw new Error("no scene to play");
  }

  function showPoster(reason) {
    if (reason) console.warn(reason);
    canvas.hidden = true;
    if (poster) poster.hidden = false;
  }

  async function boot() {
    let doc;
    try {
      doc = LB.DOC.normalize(await loadScene()).doc;
    } catch (err) {
      return showPoster(err.message);
    }
    document.body.style.background = doc.background;
    const small = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
    let renderer;
    try {
      renderer = LB.createRenderer(canvas, doc, {
        quality: params.get("quality") || (small ? "low" : "high"),
        bakeHeight: Math.min(Math.max(screen.height, window.innerHeight), 1440) * Math.min(window.devicePixelRatio || 1, 2),
      });
    } catch (err) {
      return showPoster(err.message);
    }
    const fpsParam = +params.get("fps");
    const clock = LB.createClock([12, 8, 6].includes(fpsParam) ? fpsParam : doc.fps);
    const post = LB.DOC.clone(doc.post);
    Object.assign(post, { motion: true, boil: doc.boil, haze: 1, hidden: {} });
    renderer.setPost(post);
    renderer.setGrade(doc.grades[doc.grade]);

    function fit() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = window.innerWidth * dpr, h = window.innerHeight * dpr;
      const cap = (params.get("quality") || (small ? "low" : "high")) === "low" ? 1280 * 720 : 1920 * 1080;
      const k = Math.min(1, Math.sqrt(cap / (w * h)));
      renderer.resize(w * k, h * k);
      renderer.invalidate();
      renderer.draw(clock);
    }
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); showPoster("WebGL context lost"); });

    // ---------- the loop: sleep until the next beat ----------
    let playing = false, timer = 0, raf = 0, last = 0;
    LB.player = { renderer, clock, frames: 0, get playing() { return playing; } };
    function frame(now) {
      raf = 0;
      const dt = Math.max(0, Math.min((now - last) / 1000, 0.25));
      last = now;
      clock.advance(dt);
      if (renderer.draw(clock)) LB.player.frames++;
      if (!playing) return;
      const toNext = ((clock.beat + 1) / clock.fps - clock.seconds) * 1000;
      timer = setTimeout(() => { timer = 0; raf = requestAnimationFrame(frame); }, Math.max(0, toNext - 2));
    }
    function start() {
      if (playing || document.hidden) return;
      playing = true;
      last = performance.now();
      raf = requestAnimationFrame(frame);
      if (button) { button.textContent = "Pause"; button.setAttribute("aria-label", "Pause the background animation"); }
    }
    function stop() {
      playing = false;
      clearTimeout(timer); cancelAnimationFrame(raf);
      timer = raf = 0;
      if (button) { button.textContent = "Play"; button.setAttribute("aria-label", "Play the background animation"); }
    }

    let button = null;
    if (params.get("controls") === "1") {
      button = document.createElement("button");
      button.type = "button";
      button.className = "pb";
      button.addEventListener("click", () => (playing ? stop() : start()));
      (document.querySelector("main") || document.body).append(button);
    }
    let wanted = !reduceMotion.matches || params.get("motion") === "1";
    if (button) button.addEventListener("click", () => (wanted = playing));
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : wanted && start()));
    reduceMotion.addEventListener("change", (e) => { if (e.matches && params.get("motion") !== "1") { wanted = false; stop(); } });
    window.addEventListener("resize", fit);

    await renderer.sync(doc);
    fit();
    if (poster) poster.hidden = true;
    document.documentElement.dataset.ready = "true";
    if (wanted) start();
    else stop();
  }

  boot();
})();
