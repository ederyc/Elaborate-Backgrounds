/*
  Controls for the side panels, built from small definitions:

    { key: "boil", label: "Boil", type: "range", min: 0, max: 3, step: 0.1 }

  Types
    section   a card with an icon and a title; the fields after it go inside,
              until the next section. It folds open and shut (remembered), and
              can carry a switch in its header ({ toggle: def }) that dims the body.
    range     a slider with a value you can type, and a label you can drag
              sideways to scrub the value (Shift for big steps, Alt for fine).
              Double-click the label to reset it.
    number    the same without the slider; "half: true" puts two side by side
    color     a round swatch and its hex code (type a code, or pick)
    toggle    a switch
    select    a styled dropdown
    choice    a row of icon buttons, one of which is on (a radio group)
    tiles     a grid of picture tiles (thumbnails rendered by the caller)
    buttons   a row of action buttons
    text      a text field
    heading, note, custom (def.render)

  Shared fields: label (text or a function of the target), when (hide unless
  true), get / set (instead of the plain path), scale + suffix (show 0.5 as
  "50%"), deg (radians shown as degrees), format (custom display), hint,
  reset (the value a double-click goes back to; defaults to fallback).

  While a control moves, onInput previews; when it settles, onCommit records
  one undo step.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const { h, icon, ICONS, prefs } = LB.UI;
  let counter = 0;

  function get(obj, path) {
    return path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), obj);
  }
  function set(obj, path, value) {
    const keys = path.split(".");
    let o = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (o[keys[i]] == null) o[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      o = o[keys[i]];
    }
    o[keys[keys.length - 1]] = value;
  }
  const lab = (def, t) => (typeof def.label === "function" ? def.label(t) : def.label);
  const decimals = (step) => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step))));
  const scaleOf = (def) => (def.deg ? 180 / Math.PI : def.scale || 1);
  const suffixOf = (def) => (def.deg ? "°" : def.suffix != null ? def.suffix : def.unit || "");

  function readRaw(def, target) {
    let v = def.get ? def.get(target) : get(target, def.key);
    if (def.type === "range" || def.type === "number") v = typeof v === "number" && isFinite(v) ? v : def.fallback ?? def.min ?? 0;
    if (def.type === "color") v = typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : def.fallback || "#000000";
    if (def.type === "toggle") v = !!v;
    if (["select", "text", "choice", "tiles"].includes(def.type)) v = v == null ? def.fallback ?? "" : String(v);
    return v;
  }
  function write(def, target, v) {
    if ((def.type === "select" || def.type === "choice" || def.type === "tiles") && def.numeric) v = parseFloat(v);
    if (def.set) def.set(target, v);
    else set(target, def.key, v);
  }
  // Display a value: raw scene numbers become friendly ones (50%, 30°).
  function shown(def, v) {
    if (def.format) return def.format(v);
    const s = scaleOf(def);
    const step = (def.step || 0.01) * s;
    return `${(v * s).toFixed(decimals(step))}${suffixOf(def)}`;
  }
  function editable(def, v) {
    const s = scaleOf(def);
    return String(+(v * s).toFixed(decimals((def.step || 0.01) * s)));
  }

  function build(root, defs, ctx) {
    const rows = [];
    let host = root;
    for (const def of defs) {
      const target = ctx.target();
      if (!target) break;
      if (def.when && !def.when(target)) continue;

      if (def.type === "section") {
        host = section(root, def, target, ctx, rows);
        continue;
      }
      if (def.type === "heading") { host.append(h("h4", { class: "f-sub", text: lab(def, target) })); continue; }
      if (def.type === "note") { host.append(h("p", { class: "f-note", text: lab(def, target) })); continue; }
      if (def.type === "custom") { const box = h("div", { class: "f-custom" }); host.append(box); def.render(box, target); continue; }
      if (def.type === "buttons") {
        const row = h("div", { class: "f-buttons", role: "group", "aria-label": def.label || null });
        for (const b of def.items(target)) {
          row.append(h("button", { type: "button", class: `btn btn-sm${b.kind ? " btn-" + b.kind : ""}`, "aria-pressed": b.pressed != null ? String(!!b.pressed) : null,
            "data-tip": b.tip || null, onclick: b.run }, b.icon ? icon(b.icon) : null, h("span", { text: b.label })));
        }
        host.append(row);
        continue;
      }
      const made = control(def, target, ctx);
      if (!made) continue;
      // Two "half" fields in a row share one line.
      if (def.half) {
        let pair = host.lastElementChild;
        if (!pair || !pair.classList.contains("f-pair") || pair.children.length >= 2) { pair = h("div", { class: "f-pair" }); host.append(pair); }
        pair.append(made.row);
      } else host.append(made.row);
      rows.push(made);
    }
    return {
      refresh() {
        const t = ctx.target();
        if (!t) return;
        for (const r of rows) r.refresh(t);
      },
    };
  }

  // ---------- section cards ----------
  function section(root, def, target, ctx, rows) {
    const key = "sec:" + (def.id || def.label);
    const open = prefs.get(key, def.collapsed ? false : true);
    const id = `s${++counter}`;
    const card = h("section", { class: `card${open ? "" : " is-closed"}`, style: def.color ? { "--card": def.color } : null, "data-sec": def.id || null });
    const head = h("div", { class: "card-head" });
    const fold = h("button", { type: "button", class: "card-fold", "aria-expanded": String(open), "aria-controls": id },
      h("span", { class: "card-ic" }, icon(def.icon || "sparkle")),
      h("span", { class: "card-title", text: lab(def, target) }),
      icon("chevronDown", "card-chev"));
    // The title is a heading holding the fold button, so screen readers can jump card to card.
    head.append(h("h3", { class: "card-h" }, fold));
    const body = h("div", { class: "card-body", id });
    if (def.toggle) {
      const made = control({ ...def.toggle, type: "toggle", label: `${lab(def, target)} on`, bare: true }, target, ctx, (on) => card.classList.toggle("is-off", !on));
      head.append(made.row);
      rows.push(made);
      card.classList.toggle("is-off", !readRaw({ ...def.toggle, type: "toggle" }, target));
    }
    fold.addEventListener("click", () => {
      const now = card.classList.toggle("is-closed");
      fold.setAttribute("aria-expanded", String(!now));
      prefs.set(key, !now);
    });
    card.append(head, body);
    root.append(card);
    return body;
  }

  // ---------- one control ----------
  function control(def, target, ctx, onToggle) {
    const id = `f${++counter}`;
    const label = lab(def, target);
    const t0 = readRaw(def, target);
    const tgt = () => ctx.target();
    const commit = () => ctx.onCommit(label, def);
    const preview = () => ctx.onInput(def);
    let row, refresh;

    if (def.type === "range" || def.type === "number") {
      row = h("div", { class: `f f-${def.type}${def.half ? " is-half" : ""}` });
      const lb = h("label", { for: id, class: "f-label scrub", text: label, "data-tip": def.hint || null });
      const num = h("input", { type: "text", inputmode: "decimal", class: "f-num", id: def.type === "number" ? id : null, "aria-label": def.type === "range" ? `${label}, exact value` : null, spellcheck: "false", autocomplete: "off" });
      const fill = (v) => { if (slider) slider.style.setProperty("--fill", `${((v - def.min) / (def.max - def.min)) * 100}%`); };
      let slider = null;
      if (def.type === "range") {
        slider = h("input", { type: "range", id, class: "f-slider", min: def.min, max: def.max, step: def.step || 0.01, value: t0 });
        slider.addEventListener("input", () => { write(def, tgt(), parseFloat(slider.value)); num.value = shown(def, parseFloat(slider.value)); fill(+slider.value); preview(); });
        slider.addEventListener("change", commit);
        if (def.key) slider.dataset.key = def.key;
      } else if (def.key) num.dataset.key = def.key;
      num.value = shown(def, t0);
      fill(t0);
      num.addEventListener("focus", () => { num.value = editable(def, readRaw(def, tgt())); num.select(); });
      const apply = () => {
        const n = parseFloat(num.value.replace(",", "."));
        if (!isFinite(n)) { num.value = shown(def, readRaw(def, tgt())); return; }
        let v = n / scaleOf(def);
        if (def.min != null && def.clamp !== false) v = Math.max(def.min, Math.min(def.max ?? Infinity, v));
        write(def, tgt(), v);
        if (slider) { slider.value = v; fill(v); }
        preview();
        commit();
        num.value = editable(def, v);
      };
      num.addEventListener("change", apply);
      num.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); apply(); num.blur(); }
        else if (e.key === "Escape") { num.value = shown(def, readRaw(def, tgt())); num.blur(); }
        else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
          e.preventDefault();
          const step = (def.step || 0.01) * (e.shiftKey ? 10 : e.altKey ? 0.1 : 1) * (e.key === "ArrowUp" ? 1 : -1);
          let v = readRaw(def, tgt()) + step;
          if (def.min != null) v = Math.max(def.min, Math.min(def.max, v));
          write(def, tgt(), v);
          num.value = editable(def, v);
          if (slider) { slider.value = v; fill(v); }
          preview();
          clearTimeout(num._t);
          num._t = setTimeout(commit, 400);
        }
      });
      num.addEventListener("blur", () => (num.value = shown(def, readRaw(def, tgt()))));
      // Scrub: drag the label sideways to change the value; a click without a drag focuses the field.
      lb.addEventListener("pointerdown", (e) => {
        if (e.button !== 0) return;
        e.preventDefault();
        const x0 = e.clientX, v0 = readRaw(def, tgt());
        let moved = false;
        lb.setPointerCapture(e.pointerId);
        const range = (def.max ?? v0 + 1) - (def.min ?? v0 - 1);
        const move = (ev) => {
          const dx = ev.clientX - x0;
          if (!moved && Math.abs(dx) < 3) return;
          moved = true;
          document.body.classList.add("is-scrubbing");
          const k = ev.shiftKey ? 4 : ev.altKey ? 0.1 : 1;
          let v = v0 + (dx / 240) * range * k;
          const st = def.step || 0.01;
          v = Math.round(v / st) * st;
          if (def.min != null) v = Math.max(def.min, Math.min(def.max, v));
          write(def, tgt(), v);
          num.value = shown(def, v);
          if (slider) { slider.value = v; fill(v); }
          preview();
        };
        const up = () => {
          lb.removeEventListener("pointermove", move);
          lb.removeEventListener("pointerup", up);
          document.body.classList.remove("is-scrubbing");
          if (moved) commit();
          else (slider || num).focus();
        };
        lb.addEventListener("pointermove", move);
        lb.addEventListener("pointerup", up);
      });
      const resetTo = def.reset ?? def.fallback;
      if (resetTo != null) {
        lb.addEventListener("dblclick", () => {
          write(def, tgt(), resetTo);
          num.value = shown(def, resetTo);
          if (slider) { slider.value = resetTo; fill(resetTo); }
          preview();
          commit();
          LB.UI.bump(num);
        });
      }
      row.append(lb);
      if (slider) row.append(slider);
      row.append(num);
      refresh = (t) => {
        const v = readRaw(def, t);
        if (slider && document.activeElement !== slider) { slider.value = v; fill(v); }
        if (document.activeElement !== num) num.value = shown(def, v);
      };
    } else if (def.type === "color") {
      row = h("div", { class: "f f-color" });
      const lb = h("label", { for: id, class: "f-label", text: label });
      const sw = h("input", { type: "color", id, class: "f-swatch", value: t0 });
      const hex = h("input", { type: "text", class: "f-hex", value: t0, maxlength: "7", spellcheck: "false", "aria-label": `${label}, hex code` });
      if (def.key) sw.dataset.key = def.key;
      sw.addEventListener("input", () => { write(def, tgt(), sw.value.toUpperCase()); hex.value = sw.value.toUpperCase(); preview(); });
      sw.addEventListener("change", commit);
      hex.addEventListener("change", () => {
        let v = hex.value.trim();
        if (!v.startsWith("#")) v = "#" + v;
        if (/^#[0-9a-f]{3}$/i.test(v)) v = "#" + [...v.slice(1)].map((c) => c + c).join("");
        if (!/^#[0-9a-f]{6}$/i.test(v)) { hex.value = readRaw(def, tgt()); return; }
        v = v.toUpperCase();
        write(def, tgt(), v);
        sw.value = v;
        hex.value = v;
        preview();
        commit();
      });
      row.append(lb, h("span", { class: "f-swatch-wrap" }, sw), hex);
      refresh = (t) => { const v = readRaw(def, t); if (document.activeElement !== sw) sw.value = v; if (document.activeElement !== hex) hex.value = v; };
    } else if (def.type === "toggle") {
      row = h("div", { class: `f f-toggle${def.bare ? " is-bare" : ""}` });
      const lid = id + "-l";
      const sw = h("button", { type: "button", role: "switch", id, class: "switch", "aria-checked": String(t0), "aria-labelledby": def.bare ? null : lid, "aria-label": def.bare ? label : null },
        h("span", { class: "switch-knob" }));
      if (def.key) sw.dataset.key = def.key;
      sw.addEventListener("click", () => {
        const v = sw.getAttribute("aria-checked") !== "true";
        sw.setAttribute("aria-checked", String(v));
        write(def, tgt(), v);
        if (onToggle) onToggle(v);
        preview();
        commit();
      });
      if (!def.bare) row.append(h("span", { class: "f-label", id: lid, text: label, onclick: () => sw.click() }));
      row.append(sw);
      if (def.hint) row.append(h("p", { class: "f-hint", text: def.hint }));
      refresh = (t) => { const v = readRaw(def, t); sw.setAttribute("aria-checked", String(v)); if (onToggle) onToggle(v); };
    } else if (def.type === "select") {
      row = h("div", { class: "f f-select" });
      const sel = h("select", { id, class: "f-sel" }, ...def.options(target).map(([v, text]) => h("option", { value: v, text })));
      sel.value = t0;
      if (def.key) sel.dataset.key = def.key;
      sel.addEventListener("change", () => { write(def, tgt(), sel.value); preview(); commit(); });
      row.append(h("label", { for: id, class: "f-label", text: label }), h("span", { class: "f-sel-wrap" }, sel, icon("chevronDown", "f-sel-chev")));
      if (def.hint) row.append(h("p", { class: "f-hint", text: def.hint }));
      refresh = (t) => { if (document.activeElement !== sel) sel.value = readRaw(def, t); };
    } else if (def.type === "choice" || def.type === "tiles") {
      const tiles = def.type === "tiles";
      row = h("div", { class: `f f-${def.type}` });
      const lid = id + "-l";
      const group = h("div", { class: tiles ? "tiles" : "seg", role: "radiogroup", "aria-labelledby": lid });
      const opts = def.options(target);
      const btns = opts.map((o) => {
        const b = h("button", { type: "button", role: "radio", class: tiles ? "tile" : "seg-btn", "aria-checked": String(String(o.value) === t0), "data-value": o.value,
          "data-tip": tiles || !o.icon ? null : o.label, tabindex: String(o.value) === t0 ? "0" : "-1" },
          tiles ? h("span", { class: "tile-pic" }, o.thumb ? h("img", { src: o.thumb, alt: "" }) : h("span", { class: "tile-ph", style: o.swatch ? { background: o.swatch } : null })) : o.icon ? icon(o.icon) : null,
          h("span", { class: tiles ? "tile-name" : o.icon ? "sr" : "seg-text", text: o.label }));
        b.addEventListener("click", () => pick(o.value, b));
        if (tiles && o.lazyThumb) o.lazyThumb().then((src) => { if (src) b.querySelector(".tile-pic").replaceChildren(h("img", { src, alt: "" })); });
        return b;
      });
      group.append(...btns);
      // A group with no option on still needs one stop for the keyboard.
      if (btns.length && !btns.some((b) => b.tabIndex === 0)) btns[0].tabIndex = 0;
      function pick(v, b) {
        btns.forEach((x) => { const on = x === b; x.setAttribute("aria-checked", String(on)); x.tabIndex = on ? 0 : -1; });
        LB.UI.bump(b);
        write(def, tgt(), v);
        preview();
        commit();
      }
      group.addEventListener("keydown", (e) => {
        const i = btns.indexOf(document.activeElement);
        if (i < 0) return;
        const dir = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key];
        if (!dir) return;
        e.preventDefault();
        const n = btns[(i + dir + btns.length) % btns.length];
        n.focus();
        n.click();
      });
      if (def.key) group.dataset.key = def.key;
      row.append(h("span", { class: "f-label", id: lid, text: label }), group);
      if (def.hint) row.append(h("p", { class: "f-hint", text: def.hint }));
      refresh = (t) => { const v = readRaw(def, t); btns.forEach((b) => b.setAttribute("aria-checked", String(b.dataset.value === v))); };
    } else {
      row = h("div", { class: "f f-text" });
      const inp = h("input", { type: "text", id, class: "f-textin", value: t0, maxlength: String(def.maxLength || 60) });
      if (def.key) inp.dataset.key = def.key;
      inp.addEventListener("input", () => { write(def, tgt(), inp.value); preview(); });
      inp.addEventListener("change", commit);
      row.append(h("label", { for: id, class: "f-label", text: label }), inp);
      refresh = (t) => { if (document.activeElement !== inp) inp.value = readRaw(def, t); };
    }
    if (def.hint && (def.type === "range" || def.type === "color")) row.append(h("p", { class: "f-hint", text: def.hint }));
    return { row, refresh, def };
  }

  LB.FIELDS = { get, set, build, shown };
})();
