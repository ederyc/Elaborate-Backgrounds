/*
  Boot: check for WebGL2, bake the scene, run the loop, and handle the
  things a moving background owes its viewers:

  - prefers-reduced-motion: render one still frame and show Play. Never autoplay.
  - A Pause button for everyone (anything that moves for more than 5s needs one).
  - Stop rendering while the tab is hidden or the canvas is off screen.
  - No WebGL2, or a shader that won't compile: show the still image instead.

  URL switches, mostly for the write-up screenshots:
    ?fps=12|8|6       stop-motion rate (default 12)
    ?grade=warm|measured
    ?upto=base|depth|bloom|halation|grade|ca|vignette|grain   switch passes on in order, up to this one
    ?t=2.5            freeze at this many seconds into the loop
    ?boil=0           no boil   ?motion=0  no animation (boil stays)
    ?grain=frame|beat grain changes every rendered frame, or only on the beat (default)
    ?quality=low      lower resolution and fewer blur levels (phones get this automatically)
    ?stats=1          frame time readout
    ?timebake=1       log shader compile and bake times to the console
    ?capture=1        keep the drawing buffer so screenshots can read it
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const params = new URLSearchParams(location.search);
  const num = (k, d) => (params.has(k) && !isNaN(parseFloat(params.get(k))) ? parseFloat(params.get(k)) : d);

  const stage = document.getElementById("stage");
  const canvas = document.getElementById("scene");
  const still = document.getElementById("still");
  const playBtn = document.getElementById("play");
  const status = document.getElementById("status");
  const statsEl = document.getElementById("stats");

  // The page says which scene it shows (<body data-scene="lilac">); a scene can be data or a function that builds it.
  const sceneDef = LB.scenes[document.body.dataset.scene || "garden"];
  const scene = typeof sceneDef === "function" ? sceneDef() : sceneDef;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const small = window.matchMedia("(max-width: 760px), (pointer: coarse)").matches;
  const quality = params.get("quality") || (small ? "low" : "high");

  function postSettings() {
    const p = JSON.parse(JSON.stringify(scene.post));
    const upto = params.get("upto");
    const idx = upto === "base" ? -1 : upto ? LB.PASSES.indexOf(upto) : LB.PASSES.length - 1;
    p.on = {};
    LB.PASSES.forEach((name, i) => (p.on[name] = i <= idx));
    p.motion = num("motion", 1) !== 0;
    p.boil = num("boil", 1);
    p.haze = num("haze", 1);
    if (params.get("grain") === "frame") p.grain.perFrame = true;
    if (params.get("grain") === "beat") p.grain.perFrame = false;
    p.hidden = {};
    return p;
  }

  function showStill(reason) {
    stage.classList.add("is-still");
    canvas.hidden = true;
    still.hidden = false;
    playBtn.hidden = true;
    if (reason) console.warn(reason);
  }

  // Everything below waits for the first paint, so the poster (and the page around it) shows at once,
  // before the shaders compile.
  requestAnimationFrame(() => setTimeout(start, 0));
  function start() {
    let renderer, clock;
    try {
      renderer = LB.createRenderer(canvas, scene, {
        quality,
        bakeHeight: Math.min(Math.max(screen.height, window.innerHeight), 1440) * Math.min(window.devicePixelRatio || 1, 2),
        preserve: params.has("capture"),
        timeBake: params.has("timebake"),
      });
    } catch (err) {
      showStill(err.message);
      return;
    }

    const fps = [12, 8, 6].includes(num("fps", 12)) ? num("fps", 12) : 12;
    clock = LB.createClock(fps);
    if (params.has("t")) clock.set(num("t", 0));
    const frozen = params.has("t");
    const gradeName = scene.grades[params.get("grade")] ? params.get("grade") : scene.grade;
    let grade = JSON.parse(JSON.stringify(scene.grades[gradeName]));
    let post = postSettings();
    // A grade can bring its own post settings (the measured grade turns the haze down).
    const merge = (t, s) => { for (const k in s) { if (s[k] && typeof s[k] === "object") merge(t[k], s[k]); else t[k] = s[k]; } };
    if (grade.post) merge(post, grade.post);
    renderer.setGrade(grade);
    renderer.setPost(post);

    // Internal resolution: CSS size times device pixels, capped so phones and 4K screens stay smooth.
    function fit() {
      const r = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      let w = r.width * dpr, h = r.height * dpr;
      const cap = quality === "low" ? 1280 * 720 : 1920 * 1080;
      const k = Math.min(1, Math.sqrt(cap / (w * h)));
      renderer.resize(w * k, h * k);
      matchPictures();
    }
    // The poster (shown while the shaders compile) and the fallback still are cropped exactly as the renderer crops the scene.
    const poster = document.getElementById("poster");
    function matchPictures() {
      const v = renderer.view, A = scene.aspect || 16 / 9;
      const px = A - v[2] > 1e-6 ? (v[0] / (A - v[2])) * 100 : 50;
      const py = 1 - v[3] > 1e-6 ? (v[1] / (1 - v[3])) * 100 : 50;
      for (const img of [poster, still]) if (img) img.style.objectPosition = `${px.toFixed(1)}% ${py.toFixed(1)}%`;
    }

    let playing = false, visible = true, onScreen = true, raf = 0, last = 0;
    const times = [];

    function setPlaying(p) {
      playing = p;
      playBtn.dataset.playing = String(p);
      playBtn.querySelector(".label").textContent = p ? "Pause animation" : "Play animation";
      schedule();
    }

    function schedule() {
      const run = playing && visible && onScreen;
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
      const dt = Math.min((now - last) / 1000, 0.1);
      last = now;
      if (!frozen) clock.advance(dt);
      const t0 = performance.now();
      renderer.draw(clock);
      const work = performance.now() - t0;
      record(dt * 1000, work);
      schedule();
    }

    function record(frameMs, workMs) {
      times.push([frameMs, workMs]);
      if (times.length > 240) times.shift();
      if (!statsEl.hidden && times.length % 30 === 0) {
        const f = times.map((x) => x[0]).sort((a, b) => a - b);
        const w = times.map((x) => x[1]).sort((a, b) => a - b);
        const pct = (arr, p) => arr[Math.min(arr.length - 1, Math.floor(arr.length * p))].toFixed(1);
        const [W, H] = renderer.size;
        statsEl.textContent = `${W}×${H} · ${clock.fps} fps beat · frame p50 ${pct(f, 0.5)} / p95 ${pct(f, 0.95)} ms · JS ${pct(w, 0.5)} ms`;
      }
    }

    function redraw() {
      renderer.invalidate();
      renderer.draw(clock);
    }

    playBtn.addEventListener("click", () => setPlaying(!playing));
    document.addEventListener("visibilitychange", () => { visible = !document.hidden; schedule(); });
    new IntersectionObserver((entries) => { onScreen = entries[0].isIntersecting; schedule(); }).observe(canvas);
    new ResizeObserver(() => { fit(); if (!raf) redraw(); }).observe(canvas);
    reduceMotion.addEventListener("change", (e) => { if (e.matches) setPlaying(false); });
    if (params.has("stats")) statsEl.hidden = false;

    status.textContent = "Building the scene…";
    stage.classList.add("is-loading");
    fit();
    // A lost GPU context (driver reset, GPU switch) falls back to the still rather than a blank canvas.
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); setPlaying(false); showStill("WebGL context lost"); });
    renderer.bake()
      .then(() => {
        stage.classList.remove("is-loading");
        // The live scene has faded in over the poster; it can go.
        if (poster) setTimeout(() => (poster.hidden = true), 700);
        status.textContent = "";
        redraw();
        setPlaying(!reduceMotion.matches && !frozen);
        document.documentElement.dataset.ready = "true";
      })
      .catch((err) => showStill(err.message));

    // For scripted screenshots and measurements.
    LB.app = {
      renderer, clock,
      get post() { return post; },
      get grade() { return grade; },
      // Change settings in place, then redraw: LB.app.update((post, grade) => { grade.saturation = 1.2; })
      update(fn) { fn(post, grade); renderer.setPost(post); renderer.setGrade(grade); redraw(); },
      setTime(t) { clock.set(t); redraw(); },
      get playing() { return playing; },
      times,
    };
  }
})();
