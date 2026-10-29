/*
  The editor's UI kit: small building blocks shared by every panel.

    h()          make an element: h("button", { class, text, onclick }, ...children)
    ICONS        one stroke-icon set, 24 x 24, drawn to the same 1.8 px line
    toast()      a message that slides up over the canvas; can carry an action (Undo)
    menu()       a dropdown or right-click menu, keyboard-friendly (arrows, Enter, Escape)
    tip          tooltips with a keyboard hint, after a short hover (or on focus)
    flip()       animate a list from its old layout to its new one (rows sliding into place)
    flyTo()      a picture flying from a store card onto the canvas
    depthColor() cool for far layers, warm for near ones, like aerial haze

  Motion is part of the design here ("juice"), but everything checks
  prefers-reduced-motion and skips the animation when it's set.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const reduce = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k === "html") el.innerHTML = v;
      else if (k === "style" && typeof v === "object") {
        // Custom properties (--card) need setProperty; Object.assign drops them silently.
        for (const [p, pv] of Object.entries(v)) if (pv != null) (p.startsWith("--") ? el.style.setProperty(p, pv) : (el.style[p] = pv));
      }
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    return el;
  }

  // ---------- icons ----------
  const P = (d) => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${d}</svg>`;
  const ICONS = {
    add: P('<path d="M12 5v14M5 12h14"/>'),
    select: P('<path d="M6 3.5l12.5 7.2-5.6 1.6-2.6 5.4z" stroke-linejoin="round"/>'),
    hand: P('<path d="M8 12V6.5a1.5 1.5 0 0 1 3 0V11m0-5.5V4.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v6.5c0 4-2.6 7-6.5 7S5 17 4 14.5L3 12a1.5 1.5 0 0 1 2.6-1.4L8 13"/>'),
    rect: P('<rect x="4" y="6" width="16" height="12" rx="2.5"/>'),
    ellipse: P('<ellipse cx="12" cy="12" rx="8.5" ry="6.5"/>'),
    triangle: P('<path d="M12 4.5l8.5 14.5h-17z" stroke-linejoin="round"/>'),
    star: P('<path d="M12 3.6l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" stroke-linejoin="round"/>'),
    cloud: P('<path d="M7 18.5a4 4 0 0 1-.4-8 5.5 5.5 0 0 1 10.6-1.2 4.6 4.6 0 0 1 .3 9.2z" stroke-linejoin="round"/>'),
    pen: P('<path d="M4.5 19.5l2.5-8 6.5-6.5 5.5 5.5-6.5 6.5z" stroke-linejoin="round"/><circle cx="12.5" cy="11.5" r="1.4"/><path d="M4.5 19.5l6.6-6.6"/>'),
    cube: P('<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z M12 12l8-4.5M12 12L4 7.5M12 12v9" stroke-linejoin="round"/>'),
    undo: P('<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
    redo: P('<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
    play: P('<path d="M8 5.5l11 6.5-11 6.5z" fill="currentColor" stroke-linejoin="round"/>'),
    pause: P('<path d="M8.5 5.5v13M15.5 5.5v13" stroke-width="3"/>'),
    eye: P('<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>'),
    eyeOff: P('<path d="M4 4l16 16M10.4 5.7A9.6 9.6 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a16.6 16.6 0 0 1-3.2 3.8M6.3 7.1A16 16 0 0 0 2.5 12s3.5 6.5 9.5 6.5a9.3 9.3 0 0 0 3.9-.9"/>'),
    lock: P('<rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
    unlock: P('<rect x="5" y="11" width="14" height="9.5" rx="2.2"/><path d="M8 11V8a4 4 0 0 1 7.6-1.8"/>'),
    copy: P('<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8"/>'),
    trash: P('<path d="M4.5 7h15M9.5 7V4.8h5V7M6.5 7l1 12.2a1.8 1.8 0 0 0 1.8 1.6h5.4a1.8 1.8 0 0 0 1.8-1.6l1-12.2"/>'),
    up: P('<path d="M12 19V5M6 11l6-6 6 6"/>'),
    down: P('<path d="M12 5v14M6 13l6 6 6-6"/>'),
    chevron: P('<path d="M9 6l6 6-6 6"/>'),
    chevronDown: P('<path d="M6 9l6 6 6-6"/>'),
    search: P('<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>'),
    close: P('<path d="M6 6l12 12M18 6L6 18"/>'),
    image: P('<rect x="3.5" y="5" width="17" height="14" rx="2.5"/><circle cx="9" cy="10" r="1.8"/><path d="M20.5 16l-5-5-8 8"/>'),
    upload: P('<path d="M12 16V4M7 9l5-5 5 5M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>'),
    download: P('<path d="M12 4v12M7 11l5 5 5-5M4.5 15v3.5A1.5 1.5 0 0 0 6 20h12a1.5 1.5 0 0 0 1.5-1.5V15"/>'),
    export: P('<path d="M14 4h6v6M20 4l-8.5 8.5M18 14v4.5A1.5 1.5 0 0 1 16.5 20h-11A1.5 1.5 0 0 1 4 18.5v-11A1.5 1.5 0 0 1 5.5 6H10"/>'),
    sun: P('<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8"/>'),
    moon: P('<path d="M19.5 14.5A8 8 0 0 1 9.5 4.5a8 8 0 1 0 10 10z" stroke-linejoin="round"/>'),
    help: P('<circle cx="12" cy="12" r="9"/><path d="M9.5 9.3a2.6 2.6 0 0 1 5 .9c0 1.8-2.5 2.2-2.5 3.8M12 17.2v.3"/>'),
    keyboard: P('<rect x="2.5" y="6" width="19" height="12" rx="2.5"/><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M6.5 14h11"/>'),
    present: P('<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M10 8.5l5 2.5-5 2.5zM8 20.5h8M12 16.5v4"/>'),
    zoomIn: P('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M10.5 7.5v6M7.5 10.5h6"/>'),
    zoomOut: P('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L20 20M7.5 10.5h6"/>'),
    fit: P('<path d="M4 9V5.5A1.5 1.5 0 0 1 5.5 4H9M15 4h3.5A1.5 1.5 0 0 1 20 5.5V9M20 15v3.5a1.5 1.5 0 0 1-1.5 1.5H15M9 20H5.5A1.5 1.5 0 0 1 4 18.5V15"/>'),
    layers: P('<path d="M12 3.5l9 4.8-9 4.8-9-4.8z M3 12.2l9 4.8 9-4.8M3 16.1l9 4.8 9-4.8" stroke-linejoin="round"/>'),
    sparkle: P('<path d="M12 3c.7 4.6 2.4 6.3 7 7-4.6.7-6.3 2.4-7 7-.7-4.6-2.4-6.3-7-7 4.6-.7 6.3-2.4 7-7zM19 16c.3 1.8.9 2.4 2.5 2.7-1.6.3-2.2.9-2.5 2.7-.3-1.8-.9-2.4-2.5-2.7 1.6-.3 2.2-.9 2.5-2.7z" stroke-linejoin="round"/>'),
    flower: P('<circle cx="12" cy="9" r="2.2"/><path d="M12 6.8c0-2.6 3.6-2.6 3.6 0 2.5-.8 3.6 2.6 1.1 3.5 1.6 2.1-1.3 4.2-2.9 2.1-.6 2.5-4.2 2.5-4.6 0-1.6 2.1-4.5 0-2.9-2.1-2.5-.9-1.4-4.3 1.1-3.5 0-2.6 3.6-2.6 3.6 0M12 13v8M12 17c2-2 4-2 5-1.5"/>'),
    leaf: P('<path d="M5 19c0-8 5-14 14-14 0 9-6 14-14 14zM5 19l7-7"/>'),
    sway: P('<path d="M12 21V13M12 13c-2-3-5.5-4.5-7-3 1 3 4 4.5 7 3zM12 13c2-3.5 5.5-5 7.5-3.8-1 3.3-4.5 4.8-7.5 3.8z" stroke-linejoin="round"/><path d="M3 5.5c1.5-1.2 3-1.2 4.5 0M16.5 5.5c1.5-1.2 3-1.2 4.5 0" opacity=".7"/>'),
    drift: P('<path d="M3 12h18M7 8l-4 4 4 4M17 8l4 4-4 4"/>'),
    travel: P('<path d="M3 15.5c3.5-4 8-6 12-6.5M14 6.5l4 2.7-3.5 3.2"/><circle cx="5" cy="17.5" r="1.3"/><path d="M19 18.5h2M15.5 18.5h1.5" opacity=".7"/>'),
    still: P('<rect x="5" y="5" width="14" height="14" rx="3"/><path d="M9.5 9.5v5M14.5 9.5v5"/>'),
    film: P('<rect x="3.5" y="5" width="17" height="14" rx="2"/><path d="M7.5 5v14M16.5 5v14M3.5 9h4M3.5 13h4M3.5 17h4M16.5 9h4M16.5 13h4M16.5 17h4" stroke-width="1.4"/>'),
    onion: P('<rect x="3.5" y="6" width="11" height="11" rx="2.5" opacity=".45"/><rect x="9.5" y="7" width="11" height="11" rx="2.5"/>'),
    magnet: P('<path d="M6 4v8a6 6 0 0 0 12 0V4M6 8h4M14 8h4"/>'),
    guides: P('<rect x="3" y="5.5" width="18" height="13" rx="2" stroke-dasharray="2.6 2.4"/><rect x="9" y="4" width="6" height="16" rx="1.5"/>'),
    check: P('<path d="M5 12.5l4.5 4.5L19 7.5"/>'),
    warning: P('<path d="M12 4l9 16H3z" stroke-linejoin="round"/><path d="M12 10v4.5M12 17.5v.3"/>'),
    info: P('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.3"/>'),
    palette: P('<path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.4 0 2-1 2-2 0-1.5-1.3-1.8-1.3-3 0-1 .9-1.7 2-1.7h2a3.8 3.8 0 0 0 3.8-3.8C20.5 6.6 16.6 3.5 12 3.5z"/><circle cx="7.5" cy="11" r="1.1"/><circle cx="10" cy="7.3" r="1.1"/><circle cx="14.5" cy="7.3" r="1.1"/>'),
    wand: P('<path d="M4 20L15 9M13 7l2-2 4 4-2 2zM6 4v3M4.5 5.5h3M18.5 14v3M17 15.5h3" stroke-linejoin="round"/>'),
    camera: P('<path d="M4 8.5h3.2L9 6h6l1.8 2.5H20v10.5H4z" stroke-linejoin="round"/><circle cx="12" cy="13.5" r="3.4"/>'),
    depth: P('<path d="M4 7l7-3v13l-7 3zM13 6l7-2v13l-7 2z" stroke-linejoin="round" opacity=".9"/>'),
    grip: P('<circle cx="9" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.3" fill="currentColor" stroke="none"/>'),
    shapes: P('<circle cx="8" cy="8" r="4"/><rect x="12.5" y="12.5" width="8" height="8" rx="1.8"/><path d="M5 20.5l3.5-6 3.5 6z" stroke-linejoin="round"/>'),
    plant: P('<path d="M12 21v-8M12 13C8 13 5 10 5 5c4.5 0 7 3 7 8zM12 13c4 0 7-3 7-8-4.5 0-7 3-7 8z" stroke-linejoin="round"/>'),
    beach: P('<path d="M4 20c2.5-1.3 5.5-1.3 8 0s5.5 1.3 8 0M7 15.5L15.5 6M12.8 3.5a8.5 8.5 0 0 1 7.7 7.7L12.8 3.5zM12.8 3.5L9 5.2l11.5 6z" stroke-linejoin="round"/>'),
    sky: P('<circle cx="16.5" cy="7.5" r="3"/><path d="M6.5 18a3.5 3.5 0 0 1-.3-7 4.7 4.7 0 0 1 9-1 4 4 0 0 1 .3 8z" stroke-linejoin="round"/>'),
    heart: P('<path d="M12 20s-7.5-4.6-7.5-10A4.3 4.3 0 0 1 12 7.4 4.3 4.3 0 0 1 19.5 10c0 5.4-7.5 10-7.5 10z" stroke-linejoin="round"/>'),
    box: P('<path d="M4 8l8-4 8 4v8.5l-8 4-8-4zM4 8l8 4 8-4M12 12v8.5" stroke-linejoin="round"/>'),
    more: P('<circle cx="6" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none"/><circle cx="18" cy="12" r="1.6" fill="currentColor" stroke="none"/>'),
    reset: P('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3M4.5 4.5v4h4"/>'),
    points: P('<path d="M5 18L9 6l6 4 4 9z" stroke-dasharray="2.5 2" stroke-linejoin="round"/><rect x="3.5" y="16.5" width="3" height="3" rx=".6"/><rect x="7.5" y="4.5" width="3" height="3" rx=".6"/><rect x="13.5" y="8.5" width="3" height="3" rx=".6"/><rect x="17.5" y="17.5" width="3" height="3" rx=".6"/>'),
    scissors: P('<circle cx="6.5" cy="7" r="2.6"/><circle cx="6.5" cy="17" r="2.6"/><path d="M8.6 8.6L20 18M8.6 15.4L20 6"/>'),
    turntable: P('<ellipse cx="12" cy="17" rx="8" ry="2.8"/><path d="M12 14V5.5M8.5 8.5L12 5.5l3.5 3"/><path d="M18.5 9.5a7 7 0 0 1 1.2 3" opacity=".7"/>'),
    bounce: P('<circle cx="12" cy="6.5" r="3"/><path d="M5 20.5h14M8.5 17.5c1-.5 2.2-.8 3.5-.8s2.5.3 3.5.8" /><path d="M12 10.5v2M12 14v.5" opacity=".7"/>'),
    wobble: P('<path d="M12 20.5V6M8 6.5c2-1.6 6-1.6 8 0M6 11c3.5-2.4 8.5-2.4 12 0" /><path d="M4 16c1.3-1 2.7-1 4 0M16 16c1.3-1 2.7-1 4 0" opacity=".7"/>'),
    save: P('<path d="M5 4h11l3 3v13H5z" stroke-linejoin="round"/><path d="M8 4v5h7V4M8 20v-6h8v6"/>'),
    open: P('<path d="M3.5 7.5V18a1.5 1.5 0 0 0 1.5 1.5h14a1.5 1.5 0 0 0 1.5-1.5V9.5A1.5 1.5 0 0 0 19 8h-7l-2-2.5H5A1.5 1.5 0 0 0 3.5 7z" stroke-linejoin="round"/>'),
    file: P('<path d="M6 3.5h8l4 4V20.5H6z" stroke-linejoin="round"/><path d="M14 3.5V8h4"/>'),
    pin: P('<path d="M9.5 4h5l-.8 5.2 3.3 3.3H7l3.3-3.3z M12 12.5v8" stroke-linejoin="round"/>'),
  };
  const icon = (name, cls = "") => h("span", { class: `ic ${cls}`, html: ICONS[name] || "" });

  // ---------- depth colors ----------
  // Far layers are cool, near ones warm, the way haze cools distant hills.
  const STOPS = [[0, [124, 140, 255]], [0.3, [80, 196, 230]], [0.55, [60, 199, 168]], [0.78, [255, 201, 74]], [1, [255, 122, 89]]];
  function depthColor(d, alpha = 1) {
    d = Math.max(0, Math.min(1, d || 0));
    let i = 0;
    while (i < STOPS.length - 2 && d > STOPS[i + 1][0]) i++;
    const [d0, c0] = STOPS[i], [d1, c1] = STOPS[i + 1];
    const t = (d - d0) / (d1 - d0);
    const c = c0.map((v, k) => Math.round(v + (c1[k] - v) * t));
    return alpha === 1 ? `rgb(${c.join(",")})` : `rgba(${c.join(",")},${alpha})`;
  }

  // ---------- toasts ----------
  function toast(msg, { tone = "info", action, timeout } = {}) {
    const box = document.getElementById("toasts");
    if (!box || !msg) return;
    const t = h("div", { class: `toast toast-${tone}`, role: tone === "error" ? "alert" : null },
      icon(tone === "error" ? "warning" : tone === "warn" ? "warning" : tone === "ok" ? "check" : "info", "toast-ic"),
      h("span", { class: "toast-msg", text: msg }));
    if (action) t.append(h("button", { type: "button", class: "toast-act", text: action.label, onclick: () => { action.run(); close(); } }));
    t.append(h("button", { type: "button", class: "toast-x", "aria-label": "Dismiss", html: ICONS.close, onclick: () => close() }));
    box.append(t);
    // Keep the stack short: the oldest go first.
    while (box.children.length > 3) box.firstElementChild.remove();
    let gone = false;
    function close() {
      if (gone) return;
      gone = true;
      if (reduce()) return t.remove();
      t.classList.add("is-leaving");
      setTimeout(() => t.remove(), 220);
    }
    const ms = timeout ?? (tone === "error" ? 9000 : action ? 6500 : 4200);
    let timer = setTimeout(close, ms);
    t.addEventListener("mouseenter", () => clearTimeout(timer));
    t.addEventListener("mouseleave", () => (timer = setTimeout(close, 2200)));
    return close;
  }

  // ---------- menus ----------
  // items: [{ label, icon, keys, run, disabled, checked, danger }, "-" for a separator]
  let openMenu = null;
  function closeMenu() {
    if (!openMenu) return;
    const m = openMenu;
    openMenu = null;
    m.el.remove();
    if (m.anchor) m.anchor.setAttribute("aria-expanded", "false");
    if (m.returnFocus && document.contains(m.returnFocus)) m.returnFocus.focus({ preventScroll: true });
  }
  function menu(items, { x, y, anchor, label = "Menu" } = {}) {
    closeMenu();
    const el = h("div", { class: "menu", role: "menu", "aria-label": label, tabindex: "-1" });
    const buttons = [];
    for (const it of items) {
      if (it === "-") { el.append(h("div", { class: "menu-sep", role: "separator" })); continue; }
      if (it.heading) { el.append(h("div", { class: "menu-head", text: it.heading })); continue; }
      const b = h("button", { type: "button", class: `menu-item${it.danger ? " is-danger" : ""}`, role: it.checked != null ? "menuitemcheckbox" : "menuitem",
        "aria-checked": it.checked != null ? String(!!it.checked) : null, disabled: it.disabled ? true : null },
        it.checked != null ? icon(it.checked ? "check" : "", "menu-check") : icon(it.icon || "", "menu-ic"),
        h("span", { class: "menu-label", text: it.label }),
        it.keys ? h("kbd", { class: "menu-keys", text: it.keys }) : null);
      b.addEventListener("click", () => { closeMenu(); it.run && it.run(); });
      buttons.push(b);
      el.append(b);
    }
    document.body.append(el);
    const r = el.getBoundingClientRect();
    let left = x, top = y;
    if (anchor) { const a = anchor.getBoundingClientRect(); left = a.left; top = a.bottom + 6; anchor.setAttribute("aria-expanded", "true"); }
    left = Math.max(8, Math.min(left, innerWidth - r.width - 8));
    top = Math.max(8, Math.min(top, innerHeight - r.height - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
    openMenu = { el, anchor, returnFocus: anchor || document.activeElement };
    const enabled = buttons.filter((b) => !b.disabled);
    (enabled[0] || el).focus({ preventScroll: true });
    el.addEventListener("keydown", (e) => {
      const i = enabled.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); enabled[(i + 1) % enabled.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); enabled[(i - 1 + enabled.length) % enabled.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); enabled[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); enabled[enabled.length - 1].focus(); }
      else if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); closeMenu(); }
      e.stopPropagation();
    });
    return el;
  }
  document.addEventListener("pointerdown", (e) => { if (openMenu && !openMenu.el.contains(e.target) && e.target !== openMenu.anchor && !(openMenu.anchor && openMenu.anchor.contains(e.target))) closeMenu(); }, true);
  window.addEventListener("blur", closeMenu);
  window.addEventListener("resize", closeMenu);

  // ---------- tooltips ----------
  // Any element with data-tip="Label" (and optionally data-keys="V") gets a tooltip after a short hover.
  let tipEl = null, tipTimer = 0, tipFor = null;
  function showTip(target) {
    hideTip();
    tipFor = target;
    const text = target.dataset.tip;
    if (!text) return;
    tipEl = h("div", { class: "tip", role: "tooltip" }, h("span", { text }), target.dataset.keys ? h("kbd", { text: target.dataset.keys }) : null);
    document.body.append(tipEl);
    const a = target.getBoundingClientRect(), r = tipEl.getBoundingClientRect();
    const side = target.dataset.tipSide || "bottom";
    let left = a.left + a.width / 2 - r.width / 2, top = a.bottom + 8;
    if (side === "right") { left = a.right + 10; top = a.top + a.height / 2 - r.height / 2; }
    if (side === "top") top = a.top - r.height - 8;
    tipEl.style.left = `${Math.max(6, Math.min(left, innerWidth - r.width - 6))}px`;
    tipEl.style.top = `${Math.max(6, Math.min(top, innerHeight - r.height - 6))}px`;
    tipEl.dataset.side = side;
  }
  function hideTip() {
    clearTimeout(tipTimer);
    if (tipEl) tipEl.remove();
    tipEl = null;
    tipFor = null;
  }
  document.addEventListener("pointerover", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (!t) return;
    if (t === tipFor) return;
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => showTip(t), tipEl ? 60 : 450);
  });
  document.addEventListener("pointerout", (e) => {
    const t = e.target.closest && e.target.closest("[data-tip]");
    if (t && (!e.relatedTarget || !t.contains(e.relatedTarget))) hideTip();
  });
  document.addEventListener("focusin", (e) => { const t = e.target.closest && e.target.closest("[data-tip]"); if (t && t.matches(":focus-visible")) showTip(t); });
  document.addEventListener("focusout", hideTip);
  document.addEventListener("pointerdown", hideTip, true);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hideTip(); });

  // ---------- motion helpers ----------
  // FLIP: give it a container and a key per child; call before changing the DOM, then call the result after.
  function flip(container, keyOf) {
    if (reduce()) return () => {};
    const before = new Map();
    for (const el of container.children) { const k = keyOf(el); if (k) before.set(k, el.getBoundingClientRect().top); }
    return () => {
      for (const el of container.children) {
        const k = keyOf(el);
        if (!k) continue;
        const top = before.get(k);
        if (top == null) { el.animate([{ opacity: 0, transform: "translateX(-10px) scale(.98)" }, { opacity: 1, transform: "none" }], { duration: 260, easing: "cubic-bezier(.2,.9,.3,1.2)" }); continue; }
        const dy = top - el.getBoundingClientRect().top;
        if (Math.abs(dy) > 1) el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 280, easing: "cubic-bezier(.2,.9,.25,1.15)" });
      }
    };
  }

  // A picture flying from one place to another (a store card to the canvas), with a little spin.
  function flyTo(src, fromRect, to) {
    if (reduce() || !src || !fromRect) return;
    const img = h("img", { src, alt: "", class: "fly" });
    document.body.append(img);
    const w = fromRect.width, hh = fromRect.height;
    Object.assign(img.style, { left: `${fromRect.left}px`, top: `${fromRect.top}px`, width: `${w}px`, height: `${hh}px` });
    const dx = to[0] - (fromRect.left + w / 2), dy = to[1] - (fromRect.top + hh / 2);
    const a = img.animate([
      { transform: "translate(0,0) scale(1) rotate(0deg)", opacity: 1 },
      { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.15) rotate(-8deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, ${dy}px) scale(.55) rotate(6deg)`, opacity: 0 },
    ], { duration: 520, easing: "cubic-bezier(.3,.7,.4,1)" });
    a.onfinish = () => img.remove();
  }

  // A ring that pops at a point on screen (a dropped piece landing).
  function pop(x, y, color) {
    if (reduce()) return;
    const ring = h("div", { class: "pop", style: { left: `${x}px`, top: `${y}px`, borderColor: color || "" } });
    document.body.append(ring);
    ring.animate([{ transform: "translate(-50%,-50%) scale(.2)", opacity: 0.9 }, { transform: "translate(-50%,-50%) scale(1.6)", opacity: 0 }], { duration: 480, easing: "cubic-bezier(.2,.8,.3,1)" }).onfinish = () => ring.remove();
  }

  // A quick springy nudge on an element (a toggle that just flipped, a row that just appeared).
  function bump(el, kind = "bump") {
    if (reduce() || !el) return;
    const frames = kind === "blink"
      ? [{ transform: "scaleY(1)" }, { transform: "scaleY(.1)" }, { transform: "scaleY(1)" }]
      : [{ transform: "scale(1)" }, { transform: "scale(1.18)" }, { transform: "scale(.94)" }, { transform: "scale(1)" }];
    el.animate(frames, { duration: kind === "blink" ? 260 : 340, easing: "cubic-bezier(.3,1.5,.5,1)" });
  }

  // ---------- small persistent preferences ----------
  const prefs = {
    get(k, d) { try { const v = localStorage.getItem("eb:" + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem("eb:" + k, JSON.stringify(v)); } catch {} },
  };

  LB.UI = { h, ICONS, icon, toast, menu, closeMenu, flip, flyTo, pop, bump, depthColor, prefs, reduce };
})();
