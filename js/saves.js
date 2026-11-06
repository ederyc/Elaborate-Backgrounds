/*
  The scenes saved in this browser, shared by the editor and the home page.

  Everything lives in one IndexedDB database, because a scene with photos can be several MB:

    scenes   the full text of each saved scene, by its id
    recents  a small record for each one, so a list doesn't have to read whole scenes:
             { id, title, updated, aspect, layers, thumb }
    pieces   My pieces
    packs    installed pack files

  A scene and its record are always written in one transaction, so they can't disagree.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const DB = "elaborate-backgrounds", VERSION = 3;
  const SCENES = "scenes", RECENTS = "recents";

  function titleOf(text) {
    try { return String(JSON.parse(text).title || "Untitled scene").slice(0, 80); } catch { return "Untitled scene"; }
  }
  function layersOf(text) {
    try { const n = JSON.parse(text).layers.length; return Number.isFinite(n) ? n : 0; } catch { return 0; }
  }

  // Before version 3 the browser held one autosave ("current") and one scene set aside ("previous").
  // They become ordinary saved scenes, the autosave first in the list.
  function migrate(scenes, recents) {
    const now = Date.now();
    const texts = {};
    const move = (key, text, age) => {
      const id = `saved-${key}-${now.toString(36)}`;
      scenes.put(text, id);
      recents.put({ id, title: titleOf(text), updated: now - age, aspect: null, layers: layersOf(text), thumb: null }, id);
    };
    for (const key of ["current", "previous"]) {
      scenes.get(key).onsuccess = (e) => {
        const text = e.target.result;
        if (typeof text !== "string") return;
        texts[key] = text;
        scenes.delete(key);
        if (key === "current") move(key, text, 0);
        else if (text !== texts.current) move(key, text, 1000);
      };
    }
  }

  // One connection stays open. A save made as the page closes has to start at once: waiting to
  // connect would hand control back to the browser, which is already tearing the page down.
  let connection = null;
  function open() {
    if (connection) return connection;
    connection = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB, VERSION);
      req.onupgradeneeded = (e) => {
        const db = req.result, tx = req.transaction;
        for (const name of [SCENES, RECENTS, "pieces", "packs"]) if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        if (e.oldVersion > 0 && e.oldVersion < 3) migrate(tx.objectStore(SCENES), tx.objectStore(RECENTS));
      };
      req.onsuccess = () => {
        const db = req.result;
        const drop = () => { db.close(); connection = null; };
        // A newer version of the site in another tab needs this connection out of its way.
        db.onversionchange = drop;
        db.onclose = () => { connection = null; };
        resolve(db);
      };
      req.onerror = () => { connection = null; reject(req.error); };
      req.onblocked = () => { connection = null; reject(new Error("Another tab is holding the saved scenes open.")); };
    });
    return connection;
  }

  // Runs fn inside one transaction, and resolves with what it returned once that has committed.
  async function run(stores, mode, fn) {
    const db = await open();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(stores, mode);
      let out;
      tx.oncomplete = () => resolve(out);
      tx.onerror = () => reject(tx.error);
      // A full disk shows up here, at commit, with no error on any one request.
      tx.onabort = () => reject(tx.error || new Error("The save was cancelled."));
      fn(tx, (v) => { out = v; });
    });
  }

  // Every saved scene, newest first.
  async function list() {
    const all = await run(RECENTS, "readonly", (tx, set) => { tx.objectStore(RECENTS).getAll().onsuccess = (e) => set(e.target.result || []); });
    return all.sort((a, b) => b.updated - a.updated);
  }
  function read(id) {
    return run(SCENES, "readonly", (tx, set) => { tx.objectStore(SCENES).get(id).onsuccess = (e) => set(e.target.result); });
  }
  function write(record, text) {
    return run([SCENES, RECENTS], "readwrite", (tx) => {
      tx.objectStore(SCENES).put(text, record.id);
      tx.objectStore(RECENTS).put(record, record.id);
      // Sent now, so it still lands if the page is gone before the browser would commit by itself.
      if (tx.commit) tx.commit();
    });
  }
  // Changes a record without touching its scene or its place in the list.
  function patch(id, fields) {
    return run(RECENTS, "readwrite", (tx) => {
      const store = tx.objectStore(RECENTS);
      store.get(id).onsuccess = (e) => { if (e.target.result) store.put({ ...e.target.result, ...fields }, id); };
    });
  }
  // Removes a scene and hands it back, so the caller can offer Undo.
  async function remove(id) {
    const kept = await run([SCENES, RECENTS], "readwrite", (tx, set) => {
      const scenes = tx.objectStore(SCENES), recents = tx.objectStore(RECENTS);
      const got = {};
      scenes.get(id).onsuccess = (e) => { got.text = e.target.result; };
      recents.get(id).onsuccess = (e) => { got.record = e.target.result; set(got); };
      scenes.delete(id);
      recents.delete(id);
    });
    return kept;
  }

  // The other stores: simple key/value access.
  function all(store) {
    return run(store, "readonly", (tx, set) => { tx.objectStore(store).getAll().onsuccess = (e) => set(e.target.result || []); });
  }
  function put(store, key, value) {
    return run(store, "readwrite", (tx) => {
      if (value === undefined) tx.objectStore(store).delete(key);
      else tx.objectStore(store).put(value, key);
    });
  }

  // "5 minutes ago", "yesterday", "3 weeks ago".
  const words = typeof Intl !== "undefined" && Intl.RelativeTimeFormat ? new Intl.RelativeTimeFormat("en", { numeric: "auto" }) : null;
  function ago(when, now = Date.now()) {
    const seconds = Math.round((when - now) / 1000);
    if (Math.abs(seconds) < 45) return "just now";
    for (const [unit, size] of [["year", 31536000], ["month", 2592000], ["week", 604800], ["day", 86400], ["hour", 3600], ["minute", 60]]) {
      if (Math.abs(seconds) >= size || unit === "minute") {
        const n = Math.round(seconds / size);
        return words ? words.format(n, unit) : `${Math.abs(n)} ${unit}${Math.abs(n) === 1 ? "" : "s"} ago`;
      }
    }
    return "";
  }

  LB.SAVES = { list, read, write, patch, remove, all, put, ago, titleOf, layersOf };
})();
