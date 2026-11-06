/*
  The home page's "Pick up where you left off": the scenes saved in this browser, newest first.
  With nothing saved, or with storage blocked, the page simply stays as it is.
*/
(function () {
  const SHOWN = 6;
  const $ = (id) => document.getElementById(id);
  const section = $("recent"), list = $("recent-list"), more = $("recent-more"), notice = $("recent-notice");
  const navLink = $("nav-recent"), cta = $("cta-open");
  const ctaText = cta.textContent, ctaHref = cta.getAttribute("href");
  let showAll = false, lastRemoved = null;

  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function card(r) {
    const li = el("li", "scene-card recent-card");
    const a = el("a");
    a.href = `editor.html?scene=${encodeURIComponent(r.id)}`;
    if (r.thumb && r.thumb.startsWith("data:image/")) {
      const img = el("img");
      img.src = r.thumb;
      img.alt = "";
      a.append(img);
    } else a.append(el("span", "recent-ph"));
    a.append(el("span", "scene-name", r.title));
    a.append(el("span", "scene-note", `Edited ${LB.SAVES.ago(r.updated)}, ${r.layers} ${r.layers === 1 ? "layer" : "layers"}`));
    const x = el("button", "recent-remove", "Remove");
    x.type = "button";
    x.setAttribute("aria-label", `Remove ${r.title}`);
    x.addEventListener("click", () => remove(r));
    li.append(a, x);
    return li;
  }

  async function render() {
    let records = [];
    try { records = await LB.SAVES.list(); } catch { records = []; }
    const has = records.length > 0;
    section.hidden = !has && !lastRemoved;
    navLink.hidden = !has;
    if (has) {
      const title = records[0].title.length > 26 ? `${records[0].title.slice(0, 25)}…` : records[0].title;
      cta.textContent = `Continue ${title}`;
      cta.href = `editor.html?scene=${encodeURIComponent(records[0].id)}`;
    } else {
      cta.textContent = ctaText;
      cta.href = ctaHref;
    }
    list.replaceChildren(...records.slice(0, showAll ? records.length : SHOWN).map(card));
    more.hidden = showAll || records.length <= SHOWN;
    more.textContent = `Show all ${records.length} scenes`;
  }

  async function remove(r) {
    try {
      lastRemoved = await LB.SAVES.remove(r.id);
    } catch {
      notice.replaceChildren(`${r.title} couldn't be removed.`);
      return;
    }
    const undo = el("button", "recent-undo", "Undo");
    undo.type = "button";
    undo.addEventListener("click", async () => {
      await LB.SAVES.write(lastRemoved.record, lastRemoved.text);
      lastRemoved = null;
      notice.replaceChildren();
      render();
      section.scrollIntoView({ block: "nearest" });
    });
    notice.replaceChildren(`Removed ${r.title}. `, undo);
    render();
  }

  more.addEventListener("click", () => { showAll = true; render(); });
  // Coming back with the Back button, or from another tab, the list may have changed.
  window.addEventListener("pageshow", (e) => { if (e.persisted) render(); });
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  render();
})();
