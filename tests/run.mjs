#!/usr/bin/env node
/*
  The project's checks. Drives a real browser over the DevTools protocol, with nothing to install.

    node tests/run.mjs                 every suite
    node tests/run.mjs saves export    only these suites
    node tests/run.mjs --edge          use Edge instead of Chrome

  Every test gets a fresh browser profile. Downloads are denied and exports are read back from
  memory, so a run leaves no files behind.
*/
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const useEdge = args.includes("--edge");
const wanted = args.filter((a) => !a.startsWith("--"));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const SAMPLES = ["lilac", "reef", "beach", "study"];

// ---------- a small static server ----------
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".jpg": "image/jpeg", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml" };
const memory = new Map();
const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split("?")[0]);
  if (memory.has(url)) { res.writeHead(200, { "content-type": "text/html" }); return res.end(memory.get(url)); }
  const file = path.join(ROOT, url === "/" ? "index.html" : url);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end("not found"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(file)] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const BASE = `http://127.0.0.1:${server.address().port}`;

// ---------- the browser ----------
const exe = process.env.CHROME || (useEdge
  ? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"
  : ["C:/Program Files/Google/Chrome/Application/chrome.exe", "/usr/bin/google-chrome", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"].find((p) => fs.existsSync(p)));
const profile = fs.mkdtempSync(path.join(os.tmpdir(), "eb-tests-"));
const chrome = spawn(exe, ["--headless=new", "--enable-automation", "--use-angle=d3d11", "--ignore-gpu-blocklist", "--hide-scrollbars", "--no-first-run", "--no-default-browser-check", "--disable-extensions",
  "--autoplay-policy=no-user-gesture-required", "--remote-debugging-port=0", `--user-data-dir=${profile}`, "about:blank"], { stdio: "ignore" });
let wsUrl = null;
for (let i = 0; i < 100 && !wsUrl; i++) {
  await sleep(150);
  try { const [port, p] = fs.readFileSync(path.join(profile, "DevToolsActivePort"), "utf8").trim().split("\n"); wsUrl = `ws://127.0.0.1:${port}${p}`; } catch {}
}
if (!wsUrl) { console.error("The browser didn't start."); process.exit(2); }
const ws = new WebSocket(wsUrl);
await new Promise((r, x) => { ws.onopen = r; ws.onerror = x; });
let nextId = 0;
const pending = new Map(), sessions = new Map();
ws.onmessage = (m) => {
  const d = JSON.parse(m.data);
  if (d.id && pending.has(d.id)) { const { res, rej, method } = pending.get(d.id); pending.delete(d.id); d.error ? rej(new Error(`${method}: ${d.error.message}`)) : res(d.result); return; }
  if (d.sessionId && sessions.has(d.sessionId)) sessions.get(d.sessionId)(d.method, d.params);
};
const cdp = (method, params = {}, sessionId) => new Promise((res, rej) => {
  const id = ++nextId;
  pending.set(id, { res, rej, method });
  ws.send(JSON.stringify({ id, method, params, sessionId }));
});

// Runs in every page: exports land in memory, and WebGL objects are counted for the leak check.
const INIT = `(() => {
  window.__dl = [];
  const click = HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click = function () {
    if (this.download) { const e = { name: this.download, href: this.href }; window.__dl.push(e); fetch(this.href).then(r => r.blob()).then(b => { e.blob = b; }); return; }
    return click.call(this);
  };
  window.__gl = { texture: 0, framebuffer: 0, program: 0, buffer: 0 };
  if (window.WebGL2RenderingContext) for (const k of ["Texture", "Framebuffer", "Program", "Buffer"]) {
    const P = WebGL2RenderingContext.prototype, c = P["create" + k], d = P["delete" + k], n = k.toLowerCase();
    P["create" + k] = function (...a) { window.__gl[n]++; return c.apply(this, a); };
    P["delete" + k] = function (o) { if (o) window.__gl[n]--; return d.call(this, o); };
  }
})();`;

const VK = { Escape: 27, Enter: 13, Delete: 46, Backspace: 8, Tab: 9, F2: 113, ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, " ": 32, Home: 36, End: 35 };
const CODE = { " ": "Space" };

async function openTab({ width = 1600, height = 900, init = "", media = null, context = null } = {}) {
  const { browserContextId } = context ? { browserContextId: context } : await cdp("Target.createBrowserContext");
  const { targetId } = await cdp("Target.createTarget", { url: "about:blank", browserContextId, ...(context ? {} : { width, height }) });
  const { sessionId: sid } = await cdp("Target.attachToTarget", { targetId, flatten: true });
  const t = { errors: [], warnings: [], context: browserContextId };
  sessions.set(sid, (method, p) => {
    if (method === "Runtime.exceptionThrown") t.errors.push(`Exception: ${p.exceptionDetails.exception?.description?.split("\n")[0] || p.exceptionDetails.text}`);
    if (method === "Runtime.consoleAPICalled" && p.type === "error") t.errors.push(`console.error: ${p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200)}`);
    if (method === "Runtime.consoleAPICalled" && p.type === "warning") t.warnings.push(p.args.map((a) => a.value ?? a.description).join(" ").slice(0, 200));
    if (method === "Network.responseReceived" && p.response.status >= 400) t.errors.push(`HTTP ${p.response.status}: ${p.response.url}`);
  });
  for (const d of ["Page", "Runtime", "Log", "Network"]) await cdp(`${d}.enable`, {}, sid);
  await cdp("Browser.setDownloadBehavior", { behavior: "deny", browserContextId });
  await cdp("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: false }, sid);
  await cdp("Page.addScriptToEvaluateOnNewDocument", { source: INIT + init }, sid);
  if (media) await cdp("Emulation.setEmulatedMedia", { features: media }, sid);
  Object.assign(t, {
    send: (m, p) => cdp(m, p, sid),
    async eval(expression) {
      const r = await cdp("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true }, sid);
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split("\n")[0] || r.exceptionDetails.text);
      return r.result.value;
    },
    async goto(url, { ready = true, timeout = 30000 } = {}) {
      const t0 = Date.now();
      await cdp("Page.navigate", { url: BASE + url }, sid);
      if (ready) { await sleep(50); await t.until(`document.documentElement.dataset.ready === "true"`, timeout); }
      else await sleep(600);
      return Date.now() - t0;
    },
    async until(expr, timeout = 15000) {
      const end = Date.now() + timeout;
      for (;;) {
        let v = false;
        try { v = await t.eval(expr); } catch {}
        if (v) return v;
        if (Date.now() > end) throw new Error(`Timed out waiting for: ${expr.slice(0, 120)}`);
        await sleep(60);
      }
    },
    async key(key, { ctrl, shift, alt } = {}) {
      const single = key.length === 1;
      const vk = VK[key] ?? key.toUpperCase().charCodeAt(0);
      const modifiers = (alt ? 1 : 0) | (ctrl ? 2 : 0) | (shift ? 8 : 0);
      const code = CODE[key] || (single ? (/[a-z]/i.test(key) ? `Key${key.toUpperCase()}` : `Digit${key}`) : key);
      const base = { key, code, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk, modifiers };
      const text = single && !ctrl && !alt;
      const typed = key === "Enter" ? "\r" : text ? key : null;
      await cdp("Input.dispatchKeyEvent", { type: typed ? "keyDown" : "rawKeyDown", ...base, ...(typed ? { text: typed } : {}) }, sid);
      await cdp("Input.dispatchKeyEvent", { type: "keyUp", ...base }, sid);
    },
    async mouse(type, x, y, extra = {}) { await cdp("Input.dispatchMouseEvent", { type, x, y, button: "none", ...extra }, sid); },
    async click(x, y, { button = "left", modifiers = 0, count = 1 } = {}) {
      await t.mouse("mouseMoved", x, y);
      await t.mouse("mousePressed", x, y, { button, buttons: button === "left" ? 1 : 2, clickCount: count, modifiers });
      await t.mouse("mouseReleased", x, y, { button, clickCount: count, modifiers });
    },
    async drag(x1, y1, x2, y2, steps = 6) {
      await t.mouse("mouseMoved", x1, y1);
      await t.mouse("mousePressed", x1, y1, { button: "left", buttons: 1, clickCount: 1 });
      for (let i = 1; i <= steps; i++) await t.mouse("mouseMoved", x1 + ((x2 - x1) * i) / steps, y1 + ((y2 - y1) * i) / steps, { button: "left", buttons: 1 });
      await t.mouse("mouseReleased", x2, y2, { button: "left", clickCount: 1 });
    },
    // A point in the canvas area, as fractions of its size.
    async at(fx, fy) {
      return t.eval(`(() => { const r = document.querySelector("#viewport").getBoundingClientRect(); return [r.x + r.width * ${fx}, r.y + r.height * ${fy}]; })()`);
    },
    async shot(file) { const r = await cdp("Page.captureScreenshot", { format: "png" }, sid); fs.writeFileSync(file, Buffer.from(r.data, "base64")); },
    async close() { sessions.delete(sid); await (context ? cdp("Target.closeTarget", { targetId }) : cdp("Target.disposeBrowserContext", { browserContextId })).catch(() => {}); },
  });
  return t;
}

// ---------- the runner ----------
const results = [], metrics = [];
const suites = [];
const suite = (name, fn) => suites.push({ name, fn });
const metric = (s, k, v) => { metrics.push([s, k, v]); };
function assert(ok, msg) { if (!ok) throw new Error(msg); }
const clean = (t) => assert(t.errors.length === 0, `Page errors: ${[...new Set(t.errors)].slice(0, 4).join(" | ")}`);
function record(s, name, ok, detail = "", ms = 0) {
  results.push({ s, name, ok, detail });
  console.log(`${ok === null ? "SKIP" : ok ? "ok  " : "FAIL"}  [${s}] ${name}${ms ? ` (${(ms / 1000).toFixed(1)} s)` : ""}${detail ? `\n        ${detail}` : ""}`);
}
function bind(s) {
  return async (name, fn, opts) => {
    const t = await openTab(opts);
    const t0 = Date.now();
    try { await fn(t); record(s, name, true, "", Date.now() - t0); }
    catch (err) { record(s, name, false, err.message, Date.now() - t0); }
    await t.close();
  };
}

// Shared page snippets.
const E = `LB.editor`;
const pause = `(() => { const b = document.querySelector("#btn-play"); if (${E}.ED.playing) b.click(); })()`;
const counts = `(() => { const d = ${E}.ED.doc; return { layers: d.layers.length, items: d.layers.reduce((n, L) => n + (L.paint ? L.paint.length : 0), 0) }; })()`;
const settled = `(!${E}.renderer.busy && !document.querySelector("#viewport").classList.contains("is-loading"))`;
const openBlank = async (t) => {
  await t.goto("/editor.html");
  await t.eval(`document.querySelector("#dlg-new").showModal(); document.querySelector('[data-template="blank"]').click();`);
  await sleep(100);
  await t.until(settled);
  await t.eval(pause);
};
// Does any stored scene hold this text? Reads every store, so it doesn't care how saving is built.
const stored = (marker) => `new Promise((res) => {
  const q = indexedDB.open("elaborate-backgrounds");
  q.onsuccess = () => {
    const db = q.result, names = [...db.objectStoreNames].filter((n) => n !== "pieces" && n !== "packs");
    const tx = db.transaction(names); let found = false, left = names.length;
    if (!left) return res(false);
    for (const n of names) { const a = tx.objectStore(n).getAll(); a.onsuccess = () => { if (JSON.stringify(a.result).includes(${JSON.stringify(marker)})) found = true; if (!--left) { db.close(); res(found); } }; }
  };
})`;
const makeWork = async (t, marker) => {
  await t.eval(`${E}.ED.change((d) => { d.title = ${JSON.stringify(marker)}; }, "Rename scene")`);
  await sleep(1500);
  assert(await t.eval(stored(marker)), "The edit never reached storage");
};
// How different two RGBA buffers are, from 0 to 255, sampling every 4th pixel in x and y.
const DIFF = `window.__diff = (a, b, w) => { let s = 0, n = 0; const h = a.length / 4 / w; for (let y = 0; y < h; y += 4) for (let x = 0; x < w; x += 4) { const i = (y * w + x) * 4; s += Math.abs(a[i] - b[i]) + Math.abs(a[i+1] - b[i+1]) + Math.abs(a[i+2] - b[i+2]); n += 3; } return s / n; };`;
const percentile = (a, p) => [...a].sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))];
const frames = (n) => `(() => { const R = ${E}.renderer, c = ${E}.clock, gl = R.gl, px = new Uint8Array(4), out = []; for (let b = 0; b < ${n}; b++) { c.set(b / 12 + 1e-4); const t = performance.now(); R.invalidate(); R.draw(c); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); out.push(performance.now() - t); } return out; })()`;

// ---------- pages ----------
suite("pages", async (s, it) => {
  for (const [url, ready] of [["/index.html", false], ["/study.html", false], ["/editor.html", true], ...SAMPLES.map((k) => [`/editor.html?open=${k}`, true]), ...["lilac", "reef", "beach", "garden"].map((k) => [`/player.html?sample=${k}`, false])]) {
    await it(`${url} loads with no errors`, async (t) => {
      const ms = await t.goto(url, { ready });
      if (!ready) await sleep(2500);
      clean(t);
      if (ready) metric(s, `Ready: ${url}`, `${ms} ms`);
      assert((await t.eval(`document.title`)).length > 0, "No title");
    });
  }
  await it("every sample draws a real picture", async (t) => {
    for (const k of SAMPLES) {
      await t.goto(`/editor.html?open=${k}`);
      await t.eval(pause);
      const sd = await t.eval(`(() => { const r = ${E}.renderer; r.invalidate(); r.draw(${E}.clock); const p = r.readPixels().data; let n = 0, m = 0, v = 0; for (let i = 0; i < p.length; i += 400) { m += p[i]; n++; } m /= n; for (let i = 0; i < p.length; i += 400) v += (p[i] - m) ** 2; return Math.sqrt(v / n); })()`);
      assert(sd > 8, `${k} looks blank (spread ${sd.toFixed(1)})`);
    }
    clean(t);
  });
  await it("links on the landing page all resolve", async (t) => {
    await t.goto("/index.html", { ready: false });
    const hrefs = await t.eval(`[...new Set([...document.querySelectorAll("a[href], img[src]")].map((a) => a.getAttribute("href") || a.getAttribute("src")))].filter((h) => h && !h.startsWith("#") && !h.startsWith("http"))`);
    for (const h of hrefs) { const r = await fetch(`${BASE}/${h}`); assert(r.ok, `${h} gave ${r.status}`); }
  });
});

// ---------- editing, with real mouse and keyboard input ----------
suite("editing", async (s, it) => {
  await it("draw, move, undo, redo, duplicate and delete on the canvas", async (t) => {
    await openBlank(t);
    const c0 = await t.eval(counts);
    await t.key("r");
    const [ax, ay] = await t.at(0.35, 0.35), [bx, by] = await t.at(0.6, 0.65);
    await t.drag(ax, ay, bx, by);
    await sleep(200);
    const c1 = await t.eval(counts);
    assert(c1.items === c0.items + 1, `Drawing added ${c1.items - c0.items} pieces`);
    const xf = `JSON.stringify(${E}.ED.selItem() && ${E}.ED.selItem().xf)`;
    const before = await t.eval(xf);
    await t.drag((ax + bx) / 2, (ay + by) / 2, (ax + bx) / 2 + 60, (ay + by) / 2 + 30);
    await sleep(200);
    const after = await t.eval(xf);
    assert(before !== after, "Dragging didn't move the piece");
    await t.key("z", { ctrl: true });
    assert((await t.eval(xf)) === before, "Undo didn't put the piece back");
    await t.key("z", { ctrl: true, shift: true });
    assert((await t.eval(xf)) === after, "Redo didn't move it again");
    await t.eval(`document.querySelector("#viewport").focus()`);
    await t.key("d", { ctrl: true });
    await sleep(150);
    const c2 = await t.eval(counts);
    assert(c2.items === c1.items + 1, "Ctrl+D didn't duplicate");
    await t.eval(`document.querySelector("#viewport").focus()`);
    await t.key("Delete");
    await sleep(150);
    assert((await t.eval(counts)).items === c1.items, "Delete didn't remove the piece");
    clean(t);
  });
  await it("every shape tool and the pen draw a piece", async (t) => {
    await openBlank(t);
    let n = (await t.eval(counts)).items;
    for (const tool of ["rect", "ellipse", "triangle", "star", "cloud"]) {
      await t.eval(`document.querySelector('[data-tool="${tool}"]').click()`);
      const [ax, ay] = await t.at(0.3, 0.3), [bx, by] = await t.at(0.5, 0.6);
      await t.drag(ax, ay, bx, by);
      await sleep(120);
      const m = (await t.eval(counts)).items;
      assert(m === n + 1, `${tool} added ${m - n} pieces`);
      n = m;
    }
    await t.key("p");
    for (const [x, y] of [[0.6, 0.3], [0.8, 0.3], [0.7, 0.6]]) { const [px, py] = await t.at(x, y); await t.click(px, py); await sleep(60); }
    await t.key("Enter");
    await sleep(150);
    assert((await t.eval(counts)).items === n + 1, "The pen didn't make a piece");
    clean(t);
  });
  await it("the store adds a piece by clicking its card", async (t) => {
    await openBlank(t);
    const c0 = await t.eval(counts);
    await t.key("a");
    const card = `document.querySelector(".store button[class*=card], .store .card")`;
    await t.until(`!!${card}`);
    await t.eval(`${card}.click()`);
    await sleep(800);
    assert((await t.eval(counts)).items > c0.items, "The card added nothing");
    clean(t);
  });
  await it("groups, ungroups and restacks", async (t) => {
    await t.goto("/editor.html?open=beach");
    await t.eval(pause);
    const r = await t.eval(`(() => {
      const { ED } = ${E}, A = LB.ACT, L = ED.doc.layers.find((l) => l.paint && l.paint.length >= 2 && !l.type);
      ED.selectMany(L.id, L.paint.slice(0, 2).map((i) => i.id)); A.group();
      const grouped = Object.keys(ED.selLayer().groups || {}).length;
      if (ED.sel.group) A.ungroup();
      return { grouped };
    })()`);
    assert(r.grouped > 0, "Group made nothing");
    const order = `${E}.ED.doc.layers.map((l) => l.id).join()`;
    const before = await t.eval(order);
    await t.eval(`${E}.ED.select(${E}.ED.doc.layers[2].id)`);
    await t.key("]");
    assert((await t.eval(order)) !== before, "] didn't restack");
    clean(t);
  });
  await it("every piece of every sample opens in the inspector, on every tab", async (t) => {
    for (const k of SAMPLES) {
      await t.goto(`/editor.html?open=${k}`);
      await t.eval(pause);
      await t.eval(`(() => { const { ED } = ${E}; for (const L of ED.doc.layers) { ED.select(L.id); for (const tab of ["layer", "look", "piece"]) LB.PANELS.showTab(tab); for (const it of (L.paint || [])) ED.select(L.id, it.id); for (const g of Object.keys(L.groups || {})) ED.selectGroup(L.id, g); } ED.select(null); })()`);
      await sleep(300);
    }
    clean(t);
  });
  await it("every menu opens, and every dialog opens and closes", async (t) => {
    await t.goto("/editor.html?open=lilac");
    const n = await t.eval(`document.querySelectorAll("[data-menu]").length`);
    assert(n >= 4, "Menus are missing");
    for (let i = 0; i < n; i++) {
      await t.eval(`document.querySelectorAll("[data-menu]")[${i}].click()`);
      await sleep(80);
      assert(await t.eval(`document.querySelectorAll('[role^="menuitem"]').length > 0`), `Menu ${i} is empty`);
      await t.key("Escape");
    }
    for (const id of ["dlg-recent", "dlg-new", "dlg-export", "dlg-pack", "dlg-keys"]) {
      await t.eval(`document.querySelector("#${id}").showModal()`);
      await t.key("Escape");
      await sleep(80);
      assert(!(await t.eval(`document.querySelector("#${id}").open`)), `${id} stayed open on Escape`);
    }
    clean(t);
  });
  await it("present mode, the tour, theme and zoom all run", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(`${E}.present(true)`); await sleep(200); await t.eval(`${E}.present(false)`);
    await t.eval(`${E}.tour(0)`); await sleep(200); await t.eval(`${E}.tour(-1)`);
    await t.eval(`document.querySelector("#btn-theme").click()`); await sleep(100);
    assert((await t.eval(`document.documentElement.dataset.theme`)) === "paper", "Theme didn't switch");
    await t.key("=", { ctrl: true }); await sleep(100); await t.key("0", { ctrl: true }); await sleep(100);
    clean(t);
  });
  for (const seed of [1, 2, 3]) {
    await it(`random-input stress test, seed ${seed}: 600 actions`, async (t) => {
      await t.goto("/editor.html?open=beach");
      await t.eval(pause);
      const NEVER = `/^(Back to the landing page|Open the garden study|Open a scene file|Import pictures|Install a pack|Export)/`;
      await t.eval(`window.__rnd = (() => { let a = ${seed * 7919}; return () => ((a = (a * 48271) % 2147483647) / 2147483647); })();
        window.__pick = () => {
          const els = [...document.querySelectorAll('.rail button, .panel button, .panel input[type=range], .panel select, .panel [role=radio], .timeline button, [role=menu] button, dialog[open] button')]
            .filter((e) => !e.disabled && e.offsetParent && e.type !== "file" && !${NEVER}.test((e.textContent || "").trim()) && !e.closest("#dlg-pack") && !["do-video", "do-still", "do-live", "do-json"].includes(e.id));
          return els[Math.floor(__rnd() * els.length)];
        };`);
      const keys = ["z", "y", "d", "g", "Delete", "Escape", "[", "]", ",", ".", "r", "e", "t", "v", "a", "ArrowLeft", "ArrowUp", "Enter", "?"];
      let rnd = seed * 104729;
      const R = (n) => { rnd = (rnd * 48271) % 2147483647; return rnd % n; };
      for (let i = 0; i < 600; i++) {
        const kind = R(10);
        if (kind < 5) {
          await t.eval(`(() => { const e = __pick(); if (!e) return; if (e.type === "range") { e.value = +e.min + __rnd() * (+e.max - +e.min); e.dispatchEvent(new Event("input", { bubbles: true })); e.dispatchEvent(new Event("change", { bubbles: true })); } else if (e.tagName === "SELECT") { e.selectedIndex = Math.floor(__rnd() * e.options.length); e.dispatchEvent(new Event("change", { bubbles: true })); } else e.click(); })()`);
        } else if (kind < 8) {
          const [x, y] = await t.at(0.1 + R(80) / 100, 0.1 + R(80) / 100);
          const [x2, y2] = [x + R(160) - 80, y + R(160) - 80];
          if (R(2)) await t.drag(x, y, x2, y2, 3); else await t.click(x, y, { button: R(4) ? "left" : "right" });
        } else {
          const k = keys[R(keys.length)];
          await t.key(k, { ctrl: ["z", "y", "d", "g"].includes(k) });
        }
        if (i % 40 === 0) await t.eval(`document.querySelectorAll("dialog[open]").forEach((d) => d.close())`);
      }
      await t.eval(`document.querySelectorAll("dialog[open]").forEach((d) => d.close())`);
      await t.key("Escape");
      await t.until(settled, 30000);
      const out = await t.eval(`(() => { const { ED } = ${E}, H = ED.history; const end = H.index, text = H.stack[end].s; while (H.canUndo) H.go(-1); while (H.canRedo) H.go(1); const same = H.stack[H.index].s === text; const n = LB.DOC.normalize(JSON.parse(LB.DOC.serialize(ED.doc))); return { same, warnings: n.warnings, layers: n.doc.layers.length, steps: end }; })()`);
      assert(out.same, "Undoing everything and redoing it gave a different scene");
      metric(s, `Stress seed ${seed}: undo steps reached`, out.steps);
      clean(t);
    });
  }
});

// ---------- saving ----------
suite("saves", async (s, it) => {
  await it("a change survives a reload", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await makeWork(t, "Survives reload");
    await t.goto("/editor.html");
    assert((await t.eval(`${E}.ED.doc.title`)) === "Survives reload", "The title came back different");
    clean(t);
  });
  await it("a change made just before leaving the page survives", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(`${E}.ED.change((d) => { d.title = "Quick close"; }, "Rename scene")`);
    await t.goto("/editor.html");
    assert(await t.eval(stored("Quick close")), "The last second of work was lost");
  });
  await it("your scene survives opening two samples in a row", async (t) => {
    await t.goto("/editor.html?open=beach");
    await makeWork(t, "My own scene");
    await t.goto("/editor.html?open=lilac");
    await sleep(1500);
    await t.goto("/editor.html?open=reef");
    await sleep(1500);
    assert(await t.eval(stored("My own scene")), "Your scene is gone from storage");
  });
  await it("your scene survives choosing New scene", async (t) => {
    await t.goto("/editor.html?open=beach");
    await makeWork(t, "Before New");
    await t.eval(`document.querySelector("#dlg-new").showModal(); document.querySelector('[data-template="blank"]').click();`);
    await sleep(1800);
    assert(await t.eval(stored("Before New")), "Your scene is gone from storage");
  });
  await it("your scene survives opening a scene file", async (t) => {
    await t.goto("/editor.html?open=beach");
    await makeWork(t, "Before Open");
    await t.eval(`LB.EXPORT.openFile(new File([LB.DOC.serialize(LB.DOC.blankDoc())], "other.json"))`);
    await sleep(1800);
    assert(await t.eval(stored("Before Open")), "Your scene is gone from storage");
  });
  await it("scene files round-trip exactly, for every sample and scene shape", async (t) => {
    await t.goto("/editor.html");
    const r = await t.eval(`(() => { const D = LB.DOC, out = []; const docs = { lilac: D.fromLilac(), reef: D.fromReef(), beach: D.fromBeach(), study: D.fromStudy() }; for (const a of [1.7778, 2.3333, 1.6, 1, 0.4615]) docs["blank" + a] = D.blankDoc(a); for (const [k, d] of Object.entries(docs)) { const a = D.serialize(d), n = D.normalize(JSON.parse(a)), b = D.serialize(n.doc); if (a !== b) { let i = 0; while (a[i] === b[i]) i++; out.push(k + ": differs near " + a.slice(Math.max(0, i - 40), i + 40)); } if (n.warnings.length) out.push(k + ": warned " + n.warnings[0]); } return out; })()`);
    assert(r.length === 0, r.slice(0, 3).join(" | "));
  });
  const BAD = {
    "not JSON": "{oops", "empty file": "", "a bare number": "7", "null": "null", "an array": "[]", "no layers": `{"format":"elaborate-backgrounds/scene"}`,
    "layers is text": `{"layers":"nope"}`, "a layer is null": `{"layers":[null]}`, "unknown element": `{"layers":[{"id":"a","paint":[{"el":"zzz"}]}]}`,
    "huge numbers": `{"fps":1e308,"aspect":1e308,"layers":[{"id":"a","depth":1e308,"opacity":-1e308,"paint":[{"el":"shape","shape":"rect","xf":{"x":1e308,"y":-1e308,"s":0,"r":1e308}}]}]}`,
    "wrong types": `{"title":5,"fps":"fast","post":7,"grades":[],"layers":[{"id":5,"name":{},"paint":"x","groups":3,"anim":4,"cycle":"y"}]}`,
    "proto pollution": `{"__proto__":{"polluted":1},"layers":[{"__proto__":{"polluted":1},"id":"a","paint":[]}]}`,
    "deep nesting": "[".repeat(5000) + "]".repeat(5000),
    "duplicate ids": `{"layers":[{"id":"a","paint":[{"id":"x","el":"shape","shape":"rect"},{"id":"x","el":"shape","shape":"rect"}]},{"id":"a","paint":[]}]}`,
  };
  await it(`${Object.keys(BAD).length} damaged scene files are refused or repaired without breaking anything`, async (t) => {
    await t.goto("/editor.html?open=beach");
    await t.eval(pause);
    const fails = [];
    for (const [name, text] of Object.entries(BAD)) {
      await t.eval(`LB.EXPORT.openFile(new File([${JSON.stringify(text)}], "bad.json"))`);
      await sleep(120);
      await t.until(settled, 20000).catch(() => fails.push(`${name}: never settled`));
      const ok = await t.eval(`(() => { try { const { ED } = ${E}, r = ${E}.renderer; r.invalidate(); r.draw(${E}.clock); LB.DOC.serialize(ED.doc); return !({}).polluted; } catch (e) { return false; } })()`);
      if (!ok) fails.push(`${name}: broke the editor`);
      if (t.errors.length) { fails.push(`${name}: ${t.errors[0]}`); t.errors.length = 0; }
    }
    assert(!fails.length, fails.slice(0, 5).join(" | "));
  });
  await it("HTML in names is shown as text, never run", async (t) => {
    await t.goto("/editor.html?open=beach");
    const evil = `<img src=x onerror="window.__xss=1">`;
    await t.eval(`LB.EXPORT.openFile(new File([JSON.stringify({ title: ${JSON.stringify(evil)}, layers: [{ id: "a", name: ${JSON.stringify(evil)}, groups: { g: { name: ${JSON.stringify(evil)} } }, paint: [{ id: "i", name: ${JSON.stringify(evil)}, group: "g", el: "shape", shape: "rect", xf: { x: 0.5, y: 0.5, s: 0.2, r: 0 } }] }] })], "x.json"))`);
    await sleep(800);
    await t.eval(`${E}.ED.select("a", "i"); LB.PANELS.showTab("layer"); LB.PANELS.showTab("piece");`);
    await sleep(400);
    assert(!(await t.eval(`window.__xss`)), "A name ran as code");
  });
});

// ---------- recent scenes ----------
suite("recents", async (s, it) => {
  const records = `LB.SAVES.list()`;
  const rename = (t, title) => t.eval(`${E}.ED.change((d) => { d.title = ${JSON.stringify(title)}; }, "Rename scene")`);
  const saved = (t) => t.eval(`${E}.ED.saveNow()`);
  const home = async (t) => { await t.goto("/index.html", { ready: false }); await t.until(`!document.querySelector("#recent").hidden`); };

  await it("looking at a sample without changing it saves nothing", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await sleep(1600);
    assert((await t.eval(records)).length === 0, "A scene was saved");
    await home(t).then(() => assert(false, "The home page showed a section"), () => {});
    assert(await t.eval(`document.querySelector("#recent").hidden`), "The section should stay hidden");
    assert((await t.eval(`document.querySelector("#cta-open").textContent`)) === "Open the editor", "The button changed");
  });
  await it("an edited scene appears on the home page, with its picture, and opens again", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    await rename(t, "My falls");
    await sleep(1500);
    assert(/[?]scene=/.test(await t.eval(`location.search`)), "The address didn't follow the scene");
    await home(t);
    const c = await t.eval(`(() => { const a = document.querySelector("#recent-list a"); return { name: a.querySelector(".scene-name").textContent, note: a.querySelector(".scene-note").textContent, href: a.getAttribute("href"), img: !!a.querySelector("img"), cta: document.querySelector("#cta-open").textContent }; })()`);
    assert(c.name === "My falls", `Card says ${c.name}`);
    assert(c.img, "No picture");
    assert(/^Edited just now/.test(c.note), `Note says ${c.note}`);
    assert(c.cta === "Continue My falls", `Button says ${c.cta}`);
    await t.goto(`/${c.href}`);
    assert((await t.eval(`${E}.ED.doc.title`)) === "My falls", "It opened the wrong scene");
    clean(t);
  });
  await it("the picture shows the scene, at the scene's own shape", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    await rename(t, "Wide");
    await saved(t);
    const r = await t.eval(`(async () => { const [rec] = await LB.SAVES.list(), i = new Image(); i.src = rec.thumb; await i.decode(); const c = document.createElement("canvas"); c.width = i.width; c.height = i.height; const x = c.getContext("2d"); x.drawImage(i, 0, 0); const p = x.getImageData(0, 0, i.width, i.height).data; let m = 0, n = 0, v = 0; for (let k = 0; k < p.length; k += 40) { m += p[k]; n++; } m /= n; for (let k = 0; k < p.length; k += 40) v += (p[k] - m) ** 2; return { w: i.width, h: i.height, spread: Math.sqrt(v / n), kb: rec.thumb.length / 1024 }; })()`);
    assert(r.spread > 8, `The picture looks blank (spread ${r.spread.toFixed(1)})`);
    assert(Math.abs(r.w / r.h - 16 / 9) < 0.03, `Shape is ${r.w} x ${r.h}`);
    metric(s, "Card picture size", `${r.w} x ${r.h}, ${r.kb.toFixed(0)} KB`);
    const ms = await t.eval(`(async () => { const a = []; for (let i = 0; i < 6; i++) { const t = performance.now(); ${E}.ED.saveNow(); a.push(performance.now() - t); await new Promise((r) => setTimeout(r, 50)); } return a.sort((x, y) => x - y)[3]; })()`);
    metric(s, "Time one save holds up the page", `${ms.toFixed(0)} ms`);
    assert(ms < 100, `A save freezes the page for ${ms.toFixed(0)} ms`);
    clean(t);
  });
  await it("a tall phone scene gets a tall picture", async (t) => {
    await t.goto("/editor.html");
    await t.eval(pause);
    await t.eval(`document.querySelector("#dlg-new").showModal(); document.querySelector('[data-aspect="0.4615"]').click();`);
    await sleep(100);
    await t.until(settled);
    await rename(t, "Tall");
    await saved(t);
    const r = await t.eval(`(async () => { const [rec] = await LB.SAVES.list(), i = new Image(); i.src = rec.thumb; await i.decode(); return i.width / i.height; })()`);
    assert(Math.abs(r - 0.4615) < 0.03, `Shape is ${r.toFixed(2)}`);
  });
  await it("several scenes stay separate, newest first, and switching keeps both", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    await rename(t, "First");
    await saved(t);
    await t.goto("/editor.html?open=reef");
    await t.eval(pause);
    await rename(t, "Second");
    await saved(t);
    const list = await t.eval(records);
    assert(list.map((r) => r.title).join() === "Second,First", `List is ${list.map((r) => r.title).join()}`);
    await t.eval(`document.querySelector('[data-menu="file"]').click()`);
    await sleep(100);
    await t.eval(`[...document.querySelectorAll('[role^="menuitem"]')].find((b) => /Recent scenes/.test(b.textContent)).click()`);
    await t.until(`document.querySelector("#dlg-recent").open`);
    const names = await t.eval(`[...document.querySelectorAll("#recent-list .tcard-name")].map((e) => e.textContent).join()`);
    assert(names === "Second,First", `Dialog shows ${names}`);
    assert(/Open now/.test(await t.eval(`document.querySelector("#recent-list li").textContent`)), "The open scene isn't marked");
    await t.eval(`document.querySelectorAll("#recent-list .tcard")[1].click()`);
    await t.until(`${E}.ED.doc.title === "First"`);
    await sleep(100);
    await t.until(settled);
    await rename(t, "First, edited");
    await saved(t);
    const after = await t.eval(records);
    assert(after.map((r) => r.title).join() === "First, edited,Second", `List is ${after.map((r) => r.title).join()}`);
    const second = await t.eval(`LB.SAVES.read(${JSON.stringify(after[1].id)})`);
    assert(JSON.parse(second).title === "Second", "Editing one scene changed the other");
    await t.goto("/editor.html");
    assert((await t.eval(`${E}.ED.doc.title`)) === "First, edited", "The plain address didn't open the latest scene");
    clean(t);
  });
  await it("New scene and opening a file each keep working after a save", async (t) => {
    await t.goto("/editor.html?open=beach");
    await t.eval(pause);
    await rename(t, "Keep me");
    await saved(t);
    await t.eval(`LB.EXPORT.openFile(new File([LB.DOC.serialize({ ...LB.DOC.blankDoc(), title: "From a file" })], "f.json"))`);
    await sleep(1800);
    assert((await t.eval(records)).map((r) => r.title).join() === "From a file,Keep me", "An opened file should join the list");
    await t.eval(`document.querySelector("#dlg-new").showModal(); document.querySelector('[data-template="blank"]').click();`);
    await sleep(1500);
    assert((await t.eval(records)).length === 2, "An untouched blank scene shouldn't be saved");
    await t.until(`document.querySelector("#save-state").textContent.includes("Not saved yet")`, 3000);
    clean(t);
  });
  await it("Ctrl+S puts an unedited sample on the list", async (t) => {
    await t.goto("/editor.html?open=reef");
    await t.key("s", { ctrl: true });
    await sleep(500);
    assert((await t.eval(records)).length === 1, "Saving on purpose didn't list the scene");
    clean(t);
  });
  await it("the home page removes a scene, and Undo brings it back whole", async (t) => {
    await t.goto("/editor.html?open=reef");
    await t.eval(pause);
    await rename(t, "Remove me");
    await saved(t);
    const before = await t.eval(`(async () => { const [r] = await LB.SAVES.list(); return LB.SAVES.read(r.id); })()`);
    await home(t);
    await t.eval(`document.querySelector("#recent-list .recent-remove").click()`);
    await t.until(`document.querySelector("#recent-list").children.length === 0`);
    assert((await t.eval(records)).length === 0, "It's still stored");
    await t.eval(`document.querySelector(".recent-undo").click()`);
    await t.until(`document.querySelector("#recent-list").children.length === 1`);
    const after = await t.eval(`(async () => { const [r] = await LB.SAVES.list(); return LB.SAVES.read(r.id); })()`);
    assert(before === after, "The scene came back different");
    clean(t);
  });
  await it("the home page shows six scenes, then all of them on request", async (t) => {
    await t.goto("/index.html", { ready: false });
    await t.eval(`(async () => { for (let i = 0; i < 9; i++) await LB.SAVES.write({ id: "s" + i, title: "Scene " + i, updated: Date.now() - i * 3600000, aspect: 1.78, layers: 3, thumb: null }, "{}"); })()`);
    await home(t);
    assert((await t.eval(`document.querySelectorAll("#recent-list li").length`)) === 6, "Should show six");
    await t.eval(`document.querySelector("#recent-more").click()`);
    await t.until(`document.querySelectorAll("#recent-list li").length === 9`);
    assert(await t.eval(`document.querySelector("#recent-more").hidden`), "The button should go");
    assert(/hours? ago/.test(await t.eval(`document.querySelectorAll("#recent-list .scene-note")[2].textContent`)), "Dates read wrong");
    clean(t);
  });
  await it("HTML in a scene's name stays text on the home page and in the dialog", async (t) => {
    const evil = `<img src=x onerror="window.__xss=1">`;
    await t.goto("/editor.html?open=beach");
    await t.eval(pause);
    await rename(t, evil);
    await saved(t);
    await t.eval(`document.querySelector('[data-menu="file"]').click()`);
    await sleep(100);
    await t.eval(`[...document.querySelectorAll('[role^="menuitem"]')].find((b) => /Recent scenes/.test(b.textContent)).click()`);
    await t.until(`document.querySelector("#dlg-recent").open`);
    await sleep(300);
    assert(!(await t.eval(`window.__xss`)), "It ran in the dialog");
    await home(t);
    await sleep(300);
    assert(!(await t.eval(`window.__xss`)), "It ran on the home page");
  });
  await it("an address for a scene that's gone opens the latest one and says so", async (t) => {
    await t.goto("/editor.html?open=beach");
    await t.eval(pause);
    await rename(t, "Still here");
    await saved(t);
    await t.goto("/editor.html?scene=nothing-here");
    assert((await t.eval(`${E}.ED.doc.title`)) === "Still here", "It didn't fall back");
    assert(/isn't saved/.test(await t.eval(`document.querySelector("#toasts").textContent`)), "No message");
    clean(t);
  });
  await it("a damaged saved scene doesn't stop the editor from opening", async (t) => {
    await t.goto("/index.html", { ready: false });
    await t.eval(`LB.SAVES.write({ id: "bad", title: "Bad", updated: Date.now(), aspect: 1.78, layers: 1, thumb: null }, "{oops")`);
    await t.goto("/editor.html");
    assert(/couldn't be read/.test(await t.eval(`document.querySelector("#toasts").textContent`)), "No message");
    assert((await t.eval(records)).length === 1, "The damaged scene should stay listed");
  });
  await it("saves from before this feature move across, with nothing lost", async (t) => {
    await t.goto("/study.html", { ready: false });
    await t.eval(`new Promise((res, rej) => { const q = indexedDB.open("elaborate-backgrounds", 2); q.onupgradeneeded = () => { for (const n of ["scenes", "pieces", "packs"]) q.result.createObjectStore(n); }; q.onerror = () => rej(q.error); q.onsuccess = () => { const db = q.result, tx = db.transaction(["scenes", "pieces"], "readwrite"), st = tx.objectStore("scenes"); st.put(JSON.stringify({ title: "Old autosave", layers: [{ id: "a", paint: [] }] }), "current"); st.put(JSON.stringify({ title: "Old set aside", layers: [] }), "previous"); tx.objectStore("pieces").put({ id: "p", name: "Mine" }, "p"); tx.oncomplete = () => { db.close(); res(); }; }; })`);
    await home(t);
    const names = await t.eval(`[...document.querySelectorAll("#recent-list .scene-name")].map((e) => e.textContent).join()`);
    assert(names === "Old autosave,Old set aside", `Listed ${names}`);
    await t.goto("/editor.html");
    assert((await t.eval(`${E}.ED.doc.title`)) === "Old autosave", "The editor didn't open the old autosave");
    assert((await t.eval(`LB.SAVES.all("pieces")`)).length === 1, "My pieces were lost");
    await t.until(`LB.SAVES.list().then((l) => !!l[0].thumb)`, 6000);
    clean(t);
  });
  await it("two tabs on two scenes don't overwrite each other", async (t) => {
    const other = await openTab({ context: t.context });
    try {
      await t.goto("/editor.html?open=lilac");
      await other.goto("/editor.html?open=reef");
      await rename(t, "Tab one");
      await rename(other, "Tab two");
      await saved(t);
      await saved(other);
      await rename(t, "Tab one again");
      await saved(t);
      const names = (await t.eval(records)).map((r) => r.title).sort().join();
      assert(names === "Tab one again,Tab two", `Stored ${names}`);
    } finally { await other.close(); }
  });
});

// ---------- exports ----------
suite("export", async (s, it) => {
  const lastDl = `(async () => { for (let i = 0; i < 400 && !(__dl.at(-1) && __dl.at(-1).blob); i++) await new Promise((r) => setTimeout(r, 50)); return __dl.at(-1).name; })()`;
  await it("stills come out at the size asked for, at every size offered", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    await t.eval(`LB.EXPORT.openExport()`);
    const sizes = await t.eval(`[...document.querySelectorAll("#still-size option")].map((o) => o.value)`);
    await t.eval(`document.querySelector("#dlg-export").close()`);
    for (const size of sizes) {
      await t.eval(`LB.EXPORT.exportStill("${size}")`);
      await t.eval(lastDl);
      const got = await t.eval(`(async () => { const b = await createImageBitmap(__dl.at(-1).blob); return b.width + "x" + b.height; })()`);
      assert(got === size, `Asked for ${size}, got ${got}`);
    }
    metric(s, "Still sizes checked", sizes.length);
    clean(t);
  });
  await it("the MP4 is valid, lasts the loop, and its second pass matches its first", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    await t.eval(DIFF);
    const t0 = Date.now();
    await t.eval(`LB.EXPORT.exportVideoExact("1280x720", 2, () => {})`);
    await t.eval(lastDl);
    metric(s, "MP4 export, 2 loops at 1280 x 720", `${((Date.now() - t0) / 1000).toFixed(1)} s`);
    const r = await t.eval(`(async () => {
      const blob = __dl.at(-1).blob, head = new TextDecoder().decode(await blob.slice(4, 8).arrayBuffer());
      const v = document.createElement("video"); v.muted = true; v.src = URL.createObjectURL(blob);
      await new Promise((res, rej) => { v.onloadeddata = res; v.onerror = () => rej(new Error("The browser couldn't decode the MP4")); });
      const c = document.createElement("canvas"); c.width = v.videoWidth; c.height = v.videoHeight; const x = c.getContext("2d", { willReadFrequently: true });
      const at = async (s) => { v.currentTime = s; await new Promise((r) => (v.onseeked = r)); x.drawImage(v, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; };
      const a = await at(0.04), b = await at(6.04);
      return { head, name: __dl.at(-1).name, size: blob.size, duration: v.duration, w: v.videoWidth, h: v.videoHeight, diff: __diff(a, b, c.width) };
    })()`);
    assert(r.head === "ftyp", "Not an MP4");
    assert(r.w === 1280 && r.h === 720, `Size is ${r.w}x${r.h}`);
    assert(Math.abs(r.duration - 12) < 0.1, `Lasts ${r.duration} s`);
    // The rendered beats are identical (the seam tests prove it). This is only the encoder settling in.
    assert(r.diff < 4, `Second loop differs from the first by ${r.diff.toFixed(2)} of 255`);
    metric(s, "MP4 file size, 2 loops", `${(r.size / 1048576).toFixed(1)} MB`);
    metric(s, "MP4 loop 1 vs loop 2 (of 255)", r.diff.toFixed(2));
    clean(t);
  });
  for (const k of SAMPLES) {
    await it(`${k}: the seam is no bigger a jump than any other beat`, async (t) => {
      await t.goto(`/editor.html?open=${k}`);
      await t.eval(pause);
      await t.eval(DIFF);
      const r = await t.eval(`(() => {
        const R = ${E}.renderer, c = ${E}.clock, n = 6 * c.fps, frame = (b) => { c.set(b / c.fps + 1e-4); R.invalidate(); R.draw(c); return R.readPixels().data; };
        const w = R.size[0], first = frame(0).slice(); let prev = first, sum = 0, max = 0;
        for (let b = 1; b < n; b++) { const f = frame(b).slice(); const d = __diff(prev, f, w); sum += d; if (d > max) max = d; prev = f; }
        const seam = __diff(prev, first, w), again = __diff(first, frame(0), w);
        return { seam, mean: sum / (n - 1), max, again };
      })()`);
      metric(s, `Seam ${k}: seam / usual / largest beat`, `${r.seam.toFixed(2)} / ${r.mean.toFixed(2)} / ${r.max.toFixed(2)}`);
      assert(r.again < 0.01, `The same beat rendered twice differs by ${r.again.toFixed(3)}`);
      assert(r.seam <= r.max * 1.15, `Seam jump ${r.seam.toFixed(2)}, largest other beat ${r.max.toFixed(2)}`);
    });
  }
  await it("the live wallpaper is one file that plays on its own", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    await t.eval(`LB.EXPORT.exportLiveWallpaper()`);
    await t.eval(lastDl);
    const html = await t.eval(`__dl.at(-1).blob.text()`);
    metric(s, "Live wallpaper file size", `${(html.length / 1048576).toFixed(2)} MB`);
    assert(!/\ssrc="js\/|\shref="css\//.test(html), "It still points at project files");
    memory.set("/__live.html", html);
    await t.goto("/__live.html", { ready: false });
    await sleep(3000);
    clean(t);
    assert(await t.eval(`!!document.querySelector("canvas") && document.querySelector("canvas").width > 0`), "No canvas");
  });
  await it("a saved scene file opens back to the same scene", async (t) => {
    await t.goto("/editor.html?open=reef");
    await t.eval(`LB.EXPORT.saveFile()`);
    await t.eval(lastDl);
    const same = await t.eval(`(async () => { const text = await __dl.at(-1).blob.text(); const before = LB.DOC.serialize(${E}.ED.doc); await LB.EXPORT.openFile(new File([text], "s.json")); return before === LB.DOC.serialize(${E}.ED.doc); })()`);
    assert(same, "The reopened scene is different");
    clean(t);
  });
});

// ---------- speed and leaks ----------
suite("performance", async (s, it) => {
  for (const k of ["lilac", "reef", "beach"]) {
    await it(`${k}: drawing time per frame`, async (t) => {
      await t.goto(`/editor.html?open=${k}`);
      await t.eval(pause);
      const a = await t.eval(frames(72));
      metric(s, `Frame ${k}: p50 / p95 / max`, `${percentile(a, 0.5).toFixed(1)} / ${percentile(a, 0.95).toFixed(1)} / ${Math.max(...a).toFixed(1)} ms`);
      assert(percentile(a, 0.95) < 33, `5% of frames take over ${percentile(a, 0.95).toFixed(0)} ms, too slow for 30 fps`);
    });
  }
  await it("opening scenes over and over doesn't leak memory", async (t) => {
    await t.goto("/editor.html?open=beach");
    await t.eval(pause);
    await t.send("Performance.enable");
    const cycle = async () => {
      for (const k of ["Lilac", "Reef", "Beach"]) {
        await t.eval(`${E}.ED.load(LB.DOC.from${k}(), "Open"); 0`);
        await sleep(100);
        await t.until(settled, 30000);
      }
      await sleep(400);
      await t.send("HeapProfiler.collectGarbage");
      const m = await t.send("Performance.getMetrics");
      return { gl: await t.eval(`({ ...__gl })`), heap: m.metrics.find((x) => x.name === "JSHeapUsedSize").value / 1048576 };
    };
    await cycle();
    const a = await cycle();
    for (let i = 0; i < 4; i++) await cycle();
    const b = await cycle();
    metric(s, "Leak check over 5 cycles: JS heap", `${a.heap.toFixed(0)} to ${b.heap.toFixed(0)} MB`);
    metric(s, "Leak check over 5 cycles: live textures", `${a.gl.texture} to ${b.gl.texture}`);
    metric(s, "Leak check over 5 cycles: live framebuffers", `${a.gl.framebuffer} to ${b.gl.framebuffer}`);
    assert(b.gl.texture - a.gl.texture < 10, `Textures grew from ${a.gl.texture} to ${b.gl.texture}`);
    assert(b.gl.framebuffer - a.gl.framebuffer < 10, `Framebuffers grew from ${a.gl.framebuffer} to ${b.gl.framebuffer}`);
    assert(b.heap - a.heap < 30, `Heap grew from ${a.heap.toFixed(0)} to ${b.heap.toFixed(0)} MB`);
    clean(t);
  });
  await it("a very large scene of 200 layers stays usable", async (t) => {
    await t.goto("/editor.html");
    await t.eval(pause);
    await t.eval(`(() => { const D = LB.DOC, d = D.blankDoc(); const proto = D.fromBeach().layers.find((l) => l.paint && l.paint.length && !l.type && !l.anim); d.layers = Array.from({ length: 200 }, (_, i) => ({ ...D.clone(proto), id: "s" + i, name: "Layer " + i, depth: i / 200 })); ${E}.ED.load(d, "Open"); })()`);
    const t0 = Date.now();
    await sleep(100);
    await t.until(settled, 60000);
    metric(s, "200 layers: time to bake", `${Date.now() - t0} ms`);
    const a = await t.eval(frames(24));
    metric(s, "200 layers: frame p50 / max", `${percentile(a, 0.5).toFixed(1)} / ${Math.max(...a).toFixed(1)} ms`);
    const edit = await t.eval(`(() => { const { ED } = ${E}, t = performance.now(); ED.change((d) => { d.layers[5].opacity = 0.5; }, "Test"); return performance.now() - t; })()`);
    metric(s, "200 layers: one recorded edit", `${edit.toFixed(1)} ms`);
    clean(t);
  });
});

// ---------- layout ----------
suite("layout", async (s, it) => {
  for (const [w, h] of [[2560, 1440], [1920, 1080], [1366, 768], [1024, 768], [820, 1180], [390, 844]]) {
    for (const theme of ["studio", "paper"]) {
      await it(`editor at ${w} x ${h}, ${theme}: nothing spills or gets cut off`, async (t) => {
        await t.goto("/editor.html?open=lilac");
        await t.eval(`if (document.documentElement.dataset.theme !== "${theme}") document.querySelector("#btn-theme").click();`);
        await t.eval(`${E}.ED.select(${E}.ED.doc.layers[3].id, (${E}.ED.doc.layers[3].paint[0] || {}).id)`);
        await sleep(600);
        const r = await t.eval(`(() => {
          const W = innerWidth, out = [], de = document.documentElement;
          if (de.scrollWidth > W + 1) out.push("page scrolls sideways by " + (de.scrollWidth - W) + " px");
          for (const e of document.querySelectorAll(".topbar button, .rail button, .timeline button")) {
            const b = e.getBoundingClientRect(), st = getComputedStyle(e);
            if (!e.offsetParent || st.visibility === "hidden" || !b.width) continue;
            const scrolls = /auto|scroll/.test(getComputedStyle(e.parentElement).overflowX) || /auto|scroll/.test(getComputedStyle(e.closest(".rail, .timeline, .topbar") || e).overflowX);
            if (!scrolls && (b.right > W + 1 || b.left < -1)) out.push("off screen: " + (e.getAttribute("aria-label") || e.textContent.trim() || e.id) + " at x " + Math.round(b.left));
          }
          for (const e of document.querySelectorAll(".btn, .menu-btn, .panel-title")) {
            if (e.offsetParent && e.scrollWidth > e.clientWidth + 2) out.push("clipped text: " + (e.textContent.trim().slice(0, 24) || e.id));
          }
          return out;
        })()`);
        assert(!r.length, [...new Set(r)].slice(0, 5).join(" | "));
        clean(t);
      }, { width: w, height: h });
    }
  }
  for (const [w, h] of [[1920, 1080], [1024, 768], [390, 844]]) {
    await it(`landing page at ${w} x ${h}: fits, with text on the screen`, async (t) => {
      await t.goto("/index.html", { ready: false });
      await sleep(1500);
      const r = await t.eval(`(() => { const o = [], W = innerWidth; if (document.documentElement.scrollWidth > W + 1) o.push("scrolls sideways"); const h = document.querySelector("h1").getBoundingClientRect(); if (h.left < 0 || h.right > W) o.push("headline runs off"); return o; })()`);
      assert(!r.length, r.join(" | "));
      clean(t);
    }, { width: w, height: h });
  }
  await it("phone: controls are big enough to tap (at least 24 px)", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await sleep(500);
    const r = await t.eval(`[...document.querySelectorAll("button, select, a, input:not([type=file])")].filter((e) => e.offsetParent && !e.closest("dialog")).map((e) => { const b = e.getBoundingClientRect(); return [e.getAttribute("aria-label") || e.textContent.trim().slice(0, 18) || e.id || e.className, Math.round(b.width), Math.round(b.height)]; }).filter(([, w, h]) => w > 0 && (w < 24 || h < 24))`);
    metric(s, "Phone: controls under 24 px", r.length);
    assert(r.length === 0, `${r.length} too small, e.g. ${r.slice(0, 4).map((x) => `${x[0]} ${x[1]}x${x[2]}`).join(", ")}`);
  }, { width: 390, height: 844 });
});

// ---------- accessibility ----------
suite("a11y", async (s, it) => {
  let axe = null;
  try { axe = await (await fetch("https://cdnjs.cloudflare.com/ajax/libs/axe-core/4.10.2/axe.min.js")).text(); } catch {}
  if (!axe || !axe.includes("axe")) return record(s, "axe-core", null, "Couldn't download axe-core, so the automatic audit didn't run");
  const audit = async (t, label) => {
    const v = await t.eval(`(async () => { ${axe}; const r = await axe.run(document, { resultTypes: ["violations"], runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] }); return r.violations.map((x) => x.id + " (" + x.impact + ", " + x.nodes.length + "): " + x.nodes[0].target[0]); })()`);
    assert(!v.length, `${label}: ${v.slice(0, 4).join(" | ")}`);
  };
  for (const theme of ["studio", "paper"]) {
    const set = `if (document.documentElement.dataset.theme !== "${theme}") document.querySelector("#btn-theme").click();`;
    await it(`axe, editor with a piece selected, ${theme}`, async (t) => {
      await t.goto("/editor.html?open=lilac");
      await t.eval(pause); await t.eval(set);
      await t.eval(`${E}.ED.select(${E}.ED.doc.layers[3].id, ${E}.ED.doc.layers[3].paint[0].id)`);
      await sleep(600);
      await audit(t, "Piece tab");
      for (const tab of ["layer", "look"]) { await t.eval(`LB.PANELS.showTab("${tab}")`); await sleep(500); await audit(t, `${tab} tab`); }
    });
    await it(`axe, dialogs and the store, ${theme}`, async (t) => {
      await t.goto("/editor.html?open=lilac");
      await t.eval(pause); await t.eval(set);
      await t.eval(`LB.STORE.open()`); await sleep(700); await audit(t, "Store"); await t.eval(`LB.STORE.close()`); await sleep(300);
      for (const id of ["dlg-new", "dlg-export", "dlg-pack", "dlg-keys"]) { await t.eval(`document.querySelector("#${id}").showModal()`); await sleep(250); await audit(t, id); await t.eval(`document.querySelector("#${id}").close()`); }
    });
  }
  await it("axe, landing page", async (t) => { await t.goto("/index.html", { ready: false }); await sleep(1500); await audit(t, "Landing"); });
  await it("axe, landing page with saved scenes, and the Recent scenes dialog in both themes", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    await t.eval(`${E}.ED.change((d) => { d.title = "A saved scene"; }, "Rename scene")`);
    await t.eval(`${E}.ED.saveNow()`);
    await t.eval(`LB.SAVES.write({ id: "x", title: "Another", updated: Date.now() - 9e6, aspect: 1.78, layers: 1, thumb: null }, "{}")`);
    for (const theme of ["studio", "paper"]) {
      await t.eval(`if (document.documentElement.dataset.theme !== "${theme}") document.querySelector("#btn-theme").click();`);
      await t.eval(`document.querySelector('[data-menu="file"]').click()`);
      await sleep(100);
      await t.eval(`[...document.querySelectorAll('[role^="menuitem"]')].find((b) => /Recent scenes/.test(b.textContent)).click()`);
      await t.until(`document.querySelector("#dlg-recent").open`);
      await sleep(300);
      await audit(t, `Recent dialog, ${theme}`);
      await t.eval(`document.querySelector("#dlg-recent").close()`);
    }
    await t.goto("/index.html", { ready: false });
    await t.until(`!document.querySelector("#recent").hidden`);
    await audit(t, "Landing with saves");
  });
  await it("axe, study page", async (t) => { await t.goto("/study.html", { ready: false }); await sleep(1500); await audit(t, "Study"); });
  await it("Tab reaches the controls, always with a visible focus ring, and no trap", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(pause);
    const seen = new Set(), bad = new Set();
    for (let i = 0; i < 140; i++) {
      await t.key("Tab");
      const f = await t.eval(`(() => { const e = document.activeElement; if (!e || e === document.body) return null; const b = e.getBoundingClientRect(), st = getComputedStyle(e); return { id: e.id || e.getAttribute("aria-label") || e.textContent.trim().slice(0, 20) || e.tagName, ring: st.outlineStyle !== "none" && parseFloat(st.outlineWidth) > 0, on: b.width > 0 && b.bottom > 0 && b.top < innerHeight }; })()`);
      if (!f) continue;
      seen.add(f.id);
      // Some controls show focus with a border or an inset ring, a moment later because they ease in.
      if (!f.ring) await sleep(260);
      const shown = f.ring || (await t.eval(`(() => { const st = getComputedStyle(document.activeElement); return st.boxShadow !== "none" || st.borderTopColor !== "rgba(0, 0, 0, 0)"; })()`));
      if (!shown) bad.add(`no ring: ${f.id}`);
      if (!f.on) bad.add(`off screen: ${f.id}`);
    }
    metric(s, "Keyboard: distinct stops in 140 Tabs", seen.size);
    assert(seen.size > 30, `Only ${seen.size} stops`);
    assert(!bad.size, [...bad].slice(0, 5).join(" | "));
  });
  await it("focus goes back where it was when a dialog closes", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(`document.querySelector("#btn-export").focus()`);
    await t.key("Enter");
    await t.until(`document.querySelector("#dlg-export").open`);
    await t.key("Escape");
    await sleep(150);
    assert((await t.eval(`document.activeElement.id`)) === "btn-export", "Focus was lost");
  });
});

// ---------- when things go wrong ----------
suite("failure", async (s, it) => {
  const NO_GL = `(() => { const g = HTMLCanvasElement.prototype.getContext; HTMLCanvasElement.prototype.getContext = function (k, ...a) { return /webgl/.test(k) ? null : g.call(this, k, ...a); }; })();`;
  await it("no WebGL2: the editor says so plainly", async (t) => {
    await t.goto("/editor.html", { ready: false }); await sleep(600);
    assert(/WebGL2/.test(await t.eval(`document.querySelector("#loading").textContent`)), "No message");
  }, { init: NO_GL });
  await it("no WebGL2: the landing page falls back to a still", async (t) => {
    await t.goto("/index.html", { ready: false }); await sleep(800);
    assert(await t.eval(`!document.querySelector("#still").hidden`), "No still shown");
  }, { init: NO_GL });
  await it("no WebGL2: the player doesn't crash", async (t) => {
    await t.goto("/player.html?sample=lilac", { ready: false }); await sleep(800);
    assert(!t.errors.some((e) => e.startsWith("Exception")), t.errors[0] || "");
  }, { init: NO_GL });
  await it("the graphics card resets: the editor explains and the work is safe", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await makeWork(t, "Before reset");
    await t.eval(`${E}.renderer.gl.getExtension("WEBGL_lose_context").loseContext()`);
    await sleep(500);
    assert(/Reload/.test(await t.eval(`document.querySelector("#loading").textContent`)), "No message");
    assert(await t.eval(stored("Before reset")), "The scene wasn't saved");
  });
  await it("reduced motion: nothing plays by itself", async (t) => {
    await t.goto("/editor.html?open=lilac");
    assert(!(await t.eval(`${E}.ED.playing`)), "It autoplayed");
  }, { media: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  await it("reduced motion: the landing page holds still", async (t) => {
    await t.goto("/index.html", { ready: false }); await sleep(1500);
    assert((await t.eval(`document.querySelector("#play").dataset.playing`)) === "false", "It autoplayed");
  }, { media: [{ name: "prefers-reduced-motion", value: "reduce" }] });
  const BLOCK = `(() => { Object.defineProperty(window, "indexedDB", { get() { throw new DOMException("blocked", "SecurityError"); } }); for (const k of ["getItem", "setItem", "removeItem"]) Storage.prototype[k] = () => { throw new DOMException("blocked", "SecurityError"); }; })();`;
  await it("storage blocked: the editor still works, and says it can't save", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(`${E}.ED.change((d) => { d.title = "X"; }, "Rename scene")`);
    await sleep(1600);
    assert(/Not saved/.test(await t.eval(`document.querySelector("#save-state").textContent`)), "The save chip didn't say so");
    assert(!t.errors.some((e) => e.startsWith("Exception")), t.errors[0] || "");
  }, { init: BLOCK });
  await it("storage blocked: the landing page still works", async (t) => {
    await t.goto("/index.html", { ready: false }); await sleep(1500);
    clean(t);
  }, { init: BLOCK });
  await it("storage full: the editor says it can't save", async (t) => {
    await t.goto("/editor.html?open=lilac");
    await t.eval(`IDBObjectStore.prototype.put = function () { throw new DOMException("full", "QuotaExceededError"); }`);
    await t.eval(`${E}.ED.change((d) => { d.title = "X"; }, "Rename scene")`);
    await sleep(1600);
    assert(/Not saved/.test(await t.eval(`document.querySelector("#save-state").textContent`)), "The save chip didn't say so");
  });
});

// ---------- run ----------
const started = Date.now();
for (const { name, fn } of suites) {
  if (wanted.length && !wanted.includes(name)) continue;
  console.log(`\n== ${name} ==`);
  try { await fn(name, bind(name)); } catch (err) { record(name, "suite", false, err.message); }
}
if (metrics.length) {
  console.log("\n== measurements ==");
  for (const [s, k, v] of metrics) console.log(`  [${s}] ${k}: ${v}`);
}
const pass = results.filter((r) => r.ok === true).length, fail = results.filter((r) => r.ok === false), skip = results.filter((r) => r.ok === null).length;
console.log(`\n${pass} passed, ${fail.length} failed, ${skip} skipped, in ${Math.round((Date.now() - started) / 1000)} s`);
for (const f of fail) console.log(`  FAIL [${f.s}] ${f.name}: ${f.detail}`);

ws.close();
// The profile can only be removed once the browser has really gone.
const gone = new Promise((r) => { chrome.once("exit", r); setTimeout(r, 5000); });
chrome.kill();
await gone;
server.close();
await sleep(500);
try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 300 }); } catch {}
process.exit(fail.length ? 1 : 0);
