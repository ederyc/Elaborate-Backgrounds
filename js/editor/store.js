/*
  The store: a drawer of ready-made pieces that slides out from the + button
  (or the A key) over the layers panel.

    Groups    colored chips with icons; typing in the search box looks
              through every group at once
    Cards     a rendered thumbnail of each piece; hover and it hops. Click a
              card and the piece flies into the middle of the view; or drag it
              onto the canvas and it lands where you let go
    Yours     pictures you import, My pieces (saved from your scenes) and
              installed packs, each with their own notes and buttons

  Arrow keys move between cards; Escape closes the drawer.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const ED = LB.ED;
  const { h, icon, bump, prefs, flyTo, pop } = LB.UI;
  const D = () => LB.DOC;
  const ACT = () => LB.ACT;
  const $ = (s) => document.querySelector(s);

  const CAT_LOOK = {
    Shapes: ["shapes", "var(--sun)"], Plants: ["plant", "var(--teal)"], Flowers: ["flower", "var(--pink)"], Beach: ["beach", "var(--sky)"],
    "3D": ["cube", "var(--lilac)"], Sky: ["sky", "var(--sky)"], "Your images": ["image", "var(--coral)"], "My pieces": ["heart", "var(--pink)"],
  };
  const lookOf = (cat) => CAT_LOOK[cat] || ["box", "var(--lilac)"];

  let cat = prefs.get("storeCat", "Shapes");
  let query = "";
  LB.THUMBS = LB.THUMBS || new Map();
  const TAGS = new Map();

  // My pieces and installed packs live in the browser (IndexedDB); this is the copy in memory.
  let myPieces = [], packs = [];
  async function loadPieces() {
    try {
      myPieces = (await D().dbAll("pieces")).sort((a, b) => (a.created || 0) - (b.created || 0));
      packs = await D().dbAll("packs");
    } catch {
      myPieces = [];
      packs = [];
    }
  }
  const pieceEntry = (pc, c) => ({ id: "piece:" + pc.id, cat: c, name: pc.name, credit: pc.credit || "Yours", piece: pc, thumb: pc.thumb });
  function entries() {
    return [...LB.LIBRARY.ENTRIES, ...LB.LIBRARY.imageEntries(ED.doc),
      ...myPieces.map((pc) => pieceEntry(pc, "My pieces")),
      ...packs.flatMap((pk) => pk.pieces.map((pc) => pieceEntry(pc, "pack:" + pk.id)))];
  }
  function categories() {
    return [...LB.LIBRARY.CATEGORIES.map((c) => [c, c]), ["My pieces", "My pieces"], ...packs.map((pk) => ["pack:" + pk.id, pk.name])];
  }
  LB.findEntry = (id) => entries().find((e) => e.id === id);

  // ---------- opening and closing ----------
  const isOpen = () => !$("#store").hidden && !$("#store").classList.contains("is-leaving");
  function open() {
    const s = $("#store");
    s.classList.remove("is-leaving");
    s.hidden = false;
    $("#btn-add").setAttribute("aria-expanded", "true");
    render();
    requestAnimationFrame(() => $("#store-search").focus({ preventScroll: true }));
  }
  function close(returnFocus = true) {
    const s = $("#store");
    if (s.hidden) return;
    $("#btn-add").setAttribute("aria-expanded", "false");
    const done = () => { s.hidden = true; s.classList.remove("is-leaving"); };
    if (LB.UI.reduce()) done();
    else { s.classList.add("is-leaving"); setTimeout(done, 180); }
    if (returnFocus && s.contains(document.activeElement)) $("#btn-add").focus({ preventScroll: true });
  }
  const toggle = () => (isOpen() ? close() : open());

  // ---------- drawing the drawer ----------
  function renderCats() {
    const box = $("#store-cats");
    box.replaceChildren();
    if (!categories().some(([c]) => c === cat)) cat = "Shapes";
    for (const [c, label] of categories()) {
      const [ic, color] = lookOf(c.startsWith("pack:") ? "pack" : c);
      const on = !query && c === cat;
      const chip = h("button", { type: "button", class: "chip", "aria-pressed": String(on), style: { "--c": color } }, icon(ic), h("span", { text: label }));
      chip.style.setProperty("--c", color);
      chip.addEventListener("click", () => {
        cat = c;
        prefs.set("storeCat", c);
        if (query) { query = ""; $("#store-search").value = ""; }
        render();
        bump(chip);
      });
      box.append(chip);
    }
  }

  function card(e) {
    const thumb = e.thumb || (e.image && ED.doc.images[e.image] ? ED.doc.images[e.image].src : LB.THUMBS.get(e.id));
    const tag = e.piece ? null : TAGS.get(e.id) || (e.cat === "3D" ? "3D" : null);
    const btn = h("button", { type: "button", class: "card-item", draggable: "true", "data-entry": e.id, "aria-label": `Add ${e.name}`,
      "data-tip": e.piece ? (e.cat === "My pieces" ? "Yours, saved in this browser" : "From a pack") : e.credit },
      h("span", { class: "card-pic", "aria-hidden": "true" },
        thumb ? h("img", { src: thumb, alt: "", draggable: "false", loading: "lazy" }) : h("span", { class: `card-ph${e.id === "sparkles" ? " sparkle" : ""}` })),
      h("span", { class: "card-name", text: e.name }),
      tag ? h("span", { class: "card-tag", "aria-hidden": "true", text: tag }) : null);
    btn.addEventListener("click", () => add(e, btn));
    btn.addEventListener("dragstart", (ev) => {
      ev.dataTransfer.setData("text/x-entry", e.id);
      ev.dataTransfer.effectAllowed = "copy";
      const img = btn.querySelector(".card-pic img");
      if (img) ev.dataTransfer.setDragImage(img, img.clientWidth / 2, img.clientHeight / 2);
      btn.classList.add("is-dragging");
      document.body.classList.add("is-placing");
    });
    btn.addEventListener("dragend", () => { btn.classList.remove("is-dragging"); document.body.classList.remove("is-placing"); });
    return btn;
  }

  function render() {
    renderCats();
    const grid = $("#store-grid");
    grid.replaceChildren();
    const all = entries();
    const q = query.trim().toLowerCase();
    let list;
    if (q) {
      list = all.filter((e) => e.name.toLowerCase().includes(q) || String(e.cat).toLowerCase().includes(q));
      grid.append(h("p", { class: "store-note", role: "status", text: list.length ? `${list.length} piece${list.length === 1 ? "" : "s"} match “${query.trim()}”.` : `Nothing matches “${query.trim()}”.` }));
    } else {
      list = all.filter((e) => e.cat === cat);
      if (cat === "Your images") {
        grid.append(h("p", { class: "store-note", text: "Pictures you import live in the scene file. A photo of your own material can also fill a shape: pick Photo as its material." }),
          h("div", { class: "store-actions" }, h("button", { type: "button", class: "btn btn-sm", onclick: () => $("#file-image").click() }, icon("upload"), h("span", { text: "Import pictures" }))));
        if (!list.length) grid.append(empty("image", "Nothing yet. Import pictures, or drop image files onto the canvas."));
      }
      if (cat === "My pieces") {
        grid.append(h("p", { class: "store-note", text: "Pieces you've saved, kept in this browser. Right-click a piece or a layer and choose Save to My pieces. Share them as a pack file." }),
          h("div", { class: "store-actions" },
            h("button", { type: "button", class: "btn btn-sm", disabled: !myPieces.length, onclick: () => $("#dlg-pack").showModal() }, icon("download"), h("span", { text: "Save as a pack" })),
            h("button", { type: "button", class: "btn btn-sm", onclick: () => $("#file-pack").click() }, icon("upload"), h("span", { text: "Install a pack" }))));
        if (!myPieces.length) grid.append(empty("heart", "Nothing saved yet."));
      }
      const pack = cat.startsWith("pack:") && packs.find((pk) => "pack:" + pk.id === cat);
      if (pack) {
        grid.append(h("p", { class: "store-note", text: `${pack.name}${pack.author ? `, by ${pack.author}` : ""}. ${pack.license ? `License: ${pack.license}.` : "No license given."}` }),
          h("div", { class: "store-actions" }, h("button", { type: "button", class: "btn btn-sm btn-danger", onclick: () => ACT().removePack(pack) }, icon("trash"), h("span", { text: "Remove this pack" }))));
      }
    }
    for (const e of list) {
      const btn = card(e);
      if (e.cat === "My pieces") {
        grid.append(h("div", { class: "card-wrap" }, btn,
          h("button", { type: "button", class: "ibtn card-remove", "aria-label": `Remove ${e.name} from My pieces`, "data-tip": "Remove from My pieces", html: LB.UI.ICONS.close,
            onclick: () => ACT().deletePiece(e.piece) })));
      } else grid.append(btn);
    }
  }
  const empty = (ic, text) => h("div", { class: "store-empty" }, icon(ic), h("p", { text }));

  // ---------- adding ----------
  function add(e, btn) {
    const at = e.fixed ? null : ED.viewCenter();
    ACT().addFromEntry(e, at);
    const vp = $("#viewport").getBoundingClientRect();
    const to = at && LB.CANVAS ? LB.CANVAS.toClient(at) : [vp.left + vp.width / 2, vp.top + vp.height / 2];
    const img = btn && btn.querySelector(".card-pic img");
    if (img) flyTo(img.src, img.getBoundingClientRect(), to);
    setTimeout(() => pop(to[0], to[1]), img && !LB.UI.reduce() ? 430 : 0);
    if (btn) bump(btn);
  }

  // ---------- thumbnails for the built-in pieces ----------
  // Rendered one at a time, after the scene is up.
  async function makeThumbs() {
    for (const e of LB.LIBRARY.ENTRIES) {
      if (LB.THUMBS.has(e.id)) continue;
      const made = LB.LIBRARY.make(e, [0.4, 0.4]);
      if (made.layer && (made.layer.anim || made.layer.cycle)) TAGS.set(e.id, "Moves");
      const layer = made.item ? { id: "thumb", seed: 3, paint: [made.item] } : { id: "thumb", seed: 3, ...made.layer };
      try {
        const img = await LB.LAYERS.renderThumb(layer, 200, 132, { ...ED.doc, art: null, images: ED.doc.images });
        if (!img) continue;
        LB.THUMBS.set(e.id, LB.LAYERS.toURL(img));
        const slot = document.querySelector(`.card-item[data-entry="${e.id}"] .card-ph`);
        if (slot) slot.replaceWith(h("img", { src: LB.THUMBS.get(e.id), alt: "", draggable: "false" }));
        const tagSlot = document.querySelector(`.card-item[data-entry="${e.id}"]`);
        if (tagSlot && TAGS.has(e.id) && !tagSlot.querySelector(".card-tag")) tagSlot.append(h("span", { class: "card-tag", "aria-hidden": "true", text: TAGS.get(e.id) }));
      } catch (err) {
        console.warn("thumbnail", e.id, err);
      }
      await new Promise((r) => setTimeout(r, 0));
    }
  }

  // ---------- keyboard ----------
  function onGridKey(e) {
    const cards = [...$("#store-grid").querySelectorAll(".card-item")];
    const i = cards.indexOf(document.activeElement);
    if (i < 0) return;
    const cols = getComputedStyle($("#store-grid")).gridTemplateColumns.split(" ").length || 1;
    const step = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: cols, ArrowUp: -cols }[e.key];
    if (step) {
      e.preventDefault();
      const n = cards[Math.max(0, Math.min(cards.length - 1, i + step))];
      n.focus();
    }
  }

  function init() {
    $("#btn-add").addEventListener("click", () => { toggle(); bump($("#btn-add")); });
    $("#btn-store-close").addEventListener("click", () => close());
    $("#store").addEventListener("keydown", (e) => { if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); close(); } });
    $("#store-grid").addEventListener("keydown", onGridKey);
    const search = $("#store-search");
    search.addEventListener("input", () => { query = search.value; render(); });
    search.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { const c = $("#store-grid .card-item"); if (c) { e.preventDefault(); c.focus(); } }
      if (e.key === "Enter") { const c = $("#store-grid .card-item"); if (c) { e.preventDefault(); c.click(); } }
    });
    $("#btn-import").addEventListener("click", () => $("#file-image").click());
    $("#file-image").addEventListener("change", async (e) => {
      const files = e.target.files;
      if (files && files.length) { await ACT().importImages(files); cat = "Your images"; prefs.set("storeCat", cat); if (isOpen()) render(); }
      e.target.value = "";
    });
    $("#file-pack").addEventListener("change", (e) => { if (e.target.files[0]) ACT().importPack(e.target.files[0]); e.target.value = ""; });
    $("#pack-form").addEventListener("submit", (e) => {
      e.preventDefault();
      $("#dlg-pack").close();
      ACT().exportPack({ name: $("#pack-name").value.trim(), author: $("#pack-author").value.trim(), license: $("#pack-license").value });
    });
    ED.on("load", () => { if (isOpen()) render(); });
    ED.on("images", () => { if (isOpen()) render(); });
    ED.on("pieces", async (e) => {
      await loadPieces();
      if (e && e.open) { cat = "pack:" + e.open; open(); }
      else if (isOpen()) render();
    });
    loadPieces();
  }

  LB.STORE = { init, open, close, toggle, isOpen, render, makeThumbs };
})();
