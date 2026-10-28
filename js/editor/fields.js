/*
  Labeled form controls for the side panels, built from small definitions:

    { key: "boil", label: "Boil", type: "range", min: 0, max: 3, step: 0.1 }

  Types: range, color, select, toggle, text. Every control has a visible
  label, and every slider shows its value next to it. "deg" shows radians
  as degrees; "when" hides a control that doesn't apply; "get"/"set"
  replace the plain path lookup when a value needs converting.

  While a control is being dragged or typed in, onInput previews the
  change; when it settles, onCommit records it (one undo step per settle).
*/
(function () {
  const LB = (window.LB = window.LB || {});
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

  const decimals = (step) => (step >= 1 ? 0 : Math.min(4, Math.ceil(-Math.log10(step))));
  const DEG = 180 / Math.PI;

  function readValue(def, target) {
    let v = def.get ? def.get(target) : get(target, def.key);
    if (def.type === "range") {
      v = typeof v === "number" ? v : def.fallback ?? def.min;
      if (def.deg) v *= DEG;
    }
    if (def.type === "color") v = typeof v === "string" ? v.toUpperCase() : "#000000";
    if (def.type === "toggle") v = !!v;
    if (def.type === "select" || def.type === "text") v = v == null ? def.fallback ?? "" : String(v);
    return v;
  }
  function writeValue(def, target, v) {
    if (def.type === "range") {
      v = parseFloat(v);
      if (def.deg) v /= DEG;
    }
    if (def.type === "select" && def.numeric) v = parseFloat(v);
    if (def.set) def.set(target, v);
    else set(target, def.key, v);
  }
  const show = (def, v) => {
    if (def.format) return def.format(v);
    const t = Number(v).toFixed(decimals(def.step || 0.01));
    return def.unit ? `${t}${def.unit}` : t;
  };

  // Builds the controls into "root". ctx: { target() -> object, onInput(), onCommit(label) }.
  // Returns { refresh() } to update values in place without rebuilding (keeps focus).
  function build(root, defs, ctx) {
    const rows = [];
    for (const def of defs) {
      const target = ctx.target();
      if (!target) continue;
      if (def.when && !def.when(target)) continue;
      if (def.type === "heading") {
        const h = document.createElement("h3");
        h.className = "field-heading";
        h.textContent = def.label;
        root.appendChild(h);
        continue;
      }
      if (def.type === "note") {
        const p = document.createElement("p");
        p.className = "field-note";
        p.textContent = typeof def.label === "function" ? def.label(target) : def.label;
        root.appendChild(p);
        continue;
      }
      const id = `f${++counter}`;
      const row = document.createElement("div");
      row.className = `field field-${def.type}`;
      const label = document.createElement("label");
      label.htmlFor = id;
      label.textContent = typeof def.label === "function" ? def.label(target) : def.label;
      let input, out;
      const value = readValue(def, target);
      if (def.type === "range") {
        input = document.createElement("input");
        input.type = "range";
        input.min = def.min;
        input.max = def.max;
        input.step = def.step || 0.01;
        input.value = value;
        out = document.createElement("output");
        out.htmlFor = id;
        out.textContent = show(def, value);
        row.append(label, out, input);
      } else if (def.type === "color") {
        input = document.createElement("input");
        input.type = "color";
        input.value = value;
        out = document.createElement("output");
        out.htmlFor = id;
        out.textContent = value;
        row.append(label, input, out);
      } else if (def.type === "select") {
        input = document.createElement("select");
        for (const [v, text] of def.options(target)) {
          const o = document.createElement("option");
          o.value = v;
          o.textContent = text;
          input.appendChild(o);
        }
        input.value = value;
        row.append(label, input);
      } else if (def.type === "toggle") {
        input = document.createElement("input");
        input.type = "checkbox";
        input.checked = value;
        label.prepend(input);
        label.htmlFor = "";
        row.append(label);
      } else {
        input = document.createElement("input");
        input.type = "text";
        input.value = value;
        input.maxLength = def.maxLength || 60;
        row.append(label, input);
      }
      input.id = id;
      if (def.key) input.dataset.key = def.key;
      if (def.hint) {
        const hint = document.createElement("p");
        hint.className = "field-hint";
        hint.id = id + "-hint";
        hint.textContent = def.hint;
        input.setAttribute("aria-describedby", hint.id);
        row.append(hint);
      }

      const current = () => (def.type === "toggle" ? input.checked : input.value);
      const apply = () => {
        const t = ctx.target();
        if (t) writeValue(def, t, current());
        if (out) out.textContent = def.type === "color" ? input.value.toUpperCase() : show(def, input.value);
      };
      const label0 = typeof def.label === "function" ? def.label(target) : def.label;
      if (def.type === "range" || def.type === "color" || def.type === "text") {
        input.addEventListener("input", () => { apply(); ctx.onInput(def); });
        input.addEventListener("change", () => { apply(); ctx.onCommit(label0, def); });
      } else {
        input.addEventListener("change", () => { apply(); ctx.onInput(def); ctx.onCommit(label0, def); });
      }
      root.appendChild(row);
      rows.push({ def, input, out });
    }
    return {
      refresh() {
        const t = ctx.target();
        if (!t) return;
        for (const { def, input, out } of rows) {
          if (document.activeElement === input) continue;
          const v = readValue(def, t);
          if (def.type === "toggle") input.checked = v;
          else if (String(input.value) !== String(v)) input.value = v;
          if (out) out.textContent = def.type === "color" ? String(v) : show(def, v);
        }
      },
    };
  }

  LB.FIELDS = { get, set, build };
})();
