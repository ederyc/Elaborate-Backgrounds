/*
  "Beach day": the editor's first sample scene, built only from the
  editor's own pieces (shapes, materials, pose cycles and motions), so
  every part of it can be opened, changed or copied in the editor.
  Procedural, written by Claude. No photos and no AI-generated images.

  The layout is a simple one-point perspective along the coast. The
  viewer stands on the sand looking up the beach: the water comes in on
  the bottom left, the shoreline runs off toward a vanishing point on the
  horizon (VP), and the boardwalk, the crowd, the palms and the shops run
  toward the same point on the right. Ground positions are (gx, gz):
  gx across (negative is the ocean side), gz away from the viewer.

  Motion, all fitting the 6-second loop: the girl digs (12 poses at 6 a
  second, three scoops a loop), waves roll in and the shore wash comes and
  goes, palm fronds sway, gulls fly across and one pecks, the crowd bobs
  along with its cardboard chatter marks, a sunbather kicks her feet, and
  a swimmer waves.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const A = 16 / 9, TAU = Math.PI * 2, DEG = Math.PI / 180;
  const HZ = 0.4;              // horizon
  const VP = [0.96, 0.405];    // where the shore and the boardwalk meet the horizon
  const F = 0.7;               // perspective: ground at gz = 1 sits at y = HZ + 0.7

  // ---------- small helpers ----------
  const r4 = (v) => Math.round(v * 1e4) / 1e4;
  const lerp = (a, b, t) => a + (b - a) * t;
  const P = (gx, gz) => [VP[0] + (gx * F) / gz, HZ + F / gz];   // ground point to screen
  const K = (gz) => F / gz;                                       // screen units per ground unit
  const up = (p, h) => [p[0], p[1] - h];
  const add = (p, q) => [p[0] + q[0], p[1] + q[1]];
  const rot = (v, a) => [v[0] * Math.cos(a) - v[1] * Math.sin(a), v[0] * Math.sin(a) + v[1] * Math.cos(a)];
  const dir = (a, l = 1) => [Math.cos(a) * l, Math.sin(a) * l];
  // A tiny seeded random, so the scene comes out the same every time.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

  const LOOK = { rough: 0.35, fuzz: 0.25, puff: 0.35, shadow: 0.3, grain: 1 };
  const shape = (o) => ({ el: "shape", ...LOOK, ...o });
  const place = (x, y, r = 0) => ({ x: r4(x), y: r4(y), s: 1, r: r4(r) });
  const oval = (c, w, h, o = {}, r = 0) => shape({ shape: "ellipse", w: r4(w), h: r4(h), ...o, xf: place(c[0], c[1], r) });
  const box = (c, w, h, o = {}, r = 0) => shape({ shape: "rect", w: r4(w), h: r4(h), corner: 0.25, ...o, xf: place(c[0], c[1], r) });
  // A rounded bar from a to b: limbs, poles, handles.
  function bar(a, b, width, o = {}) {
    const dx = b[0] - a[0], dy = b[1] - a[1];
    return shape({ shape: "rect", w: r4(Math.hypot(dx, dy) + width), h: r4(width), corner: 1, ...o, xf: place((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, Math.atan2(dy, dx)) });
  }
  // A cut-out through scene points, stored around its own center so gradients and stripes line up.
  function cut(points, o = {}) {
    if (points.length > 32) throw new Error(`cut-out with ${points.length} points (max 32)`);
    const xs = points.map((p) => p[0]), ys = points.map((p) => p[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const out = shape({ shape: "path", points: points.map(([x, y]) => [r4(x - cx), r4(y - cy)]), ...o, xf: place(cx, cy) });
    if (o.fanAt) {
      out.stripes = { ...(o.stripes || {}), fan: true, center: [r4(o.fanAt[0] - cx), r4(o.fanAt[1] - cy)] };
      delete out.fanAt;
    }
    return out;
  }
  // Turns a placed item about a scene point (for limbs, fronds and waves that pivot somewhere other than their center).
  function turnAbout(item, pivot, a) {
    const t = item.xf;
    const c = add(pivot, rot([t.x - pivot[0], t.y - pivot[1]], a));
    return { ...item, xf: place(c[0], c[1], t.r + a) };
  }
  // Items that change pose: make(f) returns the same list each frame, placed for that frame.
  // Frame 0 becomes each item's own placement; the others become its poses.
  function posed(frames, make) {
    const per = [];
    for (let f = 0; f < frames; f++) per.push(make(f));
    return per[0].map((base, i) => {
      const poses = per.map((list) => {
        const it = list[i], a = base.xf, b = it.xf;
        let dr = b.r - a.r;
        dr = Math.atan2(Math.sin(dr), Math.cos(dr));
        const p = {};
        if (Math.abs(b.x - a.x) > 1e-5) p.x = r4(b.x - a.x);
        if (Math.abs(b.y - a.y) > 1e-5) p.y = r4(b.y - a.y);
        if (Math.abs(dr) > 1e-5) p.r = r4(dr);
        if (it.hide) p.hide = true;
        return p;
      });
      const out = { ...base };
      delete out.hide;
      if (poses.some((p) => Object.keys(p).length)) out.poses = poses;
      return out;
    });
  }
  // A ground strip between gx = a(gz) and gx = b(gz), from gz0 to gz1, as a cut-out.
  function strip(a, b, gz0, gz1, n, o) {
    const zs = [];
    for (let i = 0; i < n; i++) zs.push(1 / lerp(1 / gz0, 1 / gz1, i / (n - 1)));
    return cut([...zs.map((z) => P(a(z), z)), ...zs.slice().reverse().map((z) => P(b(z), z))], o);
  }
  // A flat ground quad (towels, shade): gx0..gx1 across, gz0..gz1 deep.
  const quad = (gx0, gx1, gz0, gz1, o) => cut([P(gx0, gz0), P(gx1, gz0), P(gx1, gz1), P(gx0, gz1)], o);

  // Where the water meets the sand, across (gx) at each distance (gz): a long gentle curve with small bays.
  const SHORE = (z) => -0.95 + 0.16 * Math.sin(z * 0.5 + 0.4) - 0.1 + 0.045 * Math.sin(z * 2.1 + 1);

  const layer = (id, name, depth, paint, o = {}) => ({ id, name, depth, boil: 1, seed: Math.floor(rnd() * 900) + 10, paint, ...o });

  // ---------- palette ----------
  const C = {
    skyTop: "#6DB6E8", skyLow: "#FCE6C6",
    sea: "#2C7DB8", seaNear: "#3CC1C6", shallow: "#7FDCD3", foam: "#FFFBF2",
    sand: "#F5DFB4", sandNear: "#EBC488", wet: "#C99D66", wetNear: "#B8894F",
    skin: "#EBB792", skinShade: "#D49E7B", skin2: "#C98D66", skin2Shade: "#B37A56", skin3: "#8E5B3F",
    hair: "#4A2E22", hair2: "#1F1A1C",
    palm: ["#3E8E4B", "#2F7341", "#56A653"], trunk: ["#8E6D4F", "#6E5340"],
    card: "#C99B63", cardDark: "#8A6440",
  };
  const PASTELS = ["#F29C86", "#7FCBBE", "#F6D879", "#B79AE0", "#F5A9C8", "#86B8EC", "#F4B46E", "#9ED68A"];

  // ======================= the sky =======================
  function sky() {
    const flat = { rough: 0, fuzz: 0, puff: 0, shadow: 0, corner: 0 };
    return [
      layer("sky", "Sky", 0, [
        box([A / 2, 0.125], 2.3, 0.35, { material: "gradient", colors: ["#4FA3E3", "#A8D3EE"], ...flat }),
        box([A / 2, 0.37], 2.3, 0.15, { material: "gradient", colors: ["#A8D3EE", "#FCE8CC"], ...flat }),
      ], { far: true, boil: 0.4, res: 0.5 }),
      sun(),
    ];
  }

  // A paper-cut sun: a disc and a ring of rays that swap long and short twice a second.
  function sun() {
    const c = [0.38, 0.13];
    const rays = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU;
      const long = i % 2 === 0;
      const ray = (len) => shape({ shape: "polygon", sides: 3, star: 0, w: 0.022, h: r4(len), material: "paper", colors: ["#FFE89A"], rough: 0.4, fuzz: 0.6, puff: 0.15, shadow: 0,
        xf: place(c[0] + Math.cos(a) * (0.078 + len / 2), c[1] + Math.sin(a) * (0.078 + len / 2), a + Math.PI / 2) });
      rays.push({ long, it: ray(0.04) });
    }
    const raysPosed = posed(2, (f) => rays.map(({ long, it }) => {
      // Long rays reach out on one pose and pull in on the other.
      const ext = (long ? 1 : -1) * (f === 0 ? 0.008 : -0.008);
      const a = it.xf.r - Math.PI / 2;
      return { ...it, xf: { ...it.xf, x: r4(it.xf.x + Math.cos(a) * ext), y: r4(it.xf.y + Math.sin(a) * ext) } };
    }));
    return layer("sun", "Sun", 0.01, [
      ...raysPosed,
      oval(c, 0.13, 0.13, { material: "paper", colors: ["#FFF4C2"], rough: 0.35, fuzz: 1, puff: 0.15, shadow: 0 }),
    ], { far: true, boil: 0.6, cycle: { frames: 2, rate: 2 } });
  }

  function clouds() {
    const cloud = (c, k, tone = "#FFFFFF") => shape({ shape: "blob", material: "paper", colors: [tone, "#FFFFFF"], puff: 0.18, fuzz: 1, shadow: 0.05, rough: 0.7, merge: 0.035,
      lobes: [[-0.13, 0.02, 0.06], [-0.05, -0.03, 0.08], [0.06, -0.025, 0.075], [0.15, 0.015, 0.055], [0.02, 0.025, 0.065]].map(([x, y, r]) => [r4(x * k), r4(y * k), r4(r * k)]),
      xf: place(c[0], c[1]) });
    return layer("clouds", "Clouds", 0.03, [
      cloud([0.92, 0.09], 0.62), cloud([1.36, 0.06], 0.75, "#FFFCF7"), cloud([0.1, 0.22], 0.45, "#FFFBF5"), cloud([1.12, 0.25], 0.38, "#FFFCF8"),
    ], { far: true, boil: 0.8, anim: { type: "drift", amp: [0.025, 0.002] } });
  }

  // ======================= far coast and ocean =======================
  function farCoast() {
    const ridge = (pts, col) => cut(pts, { material: "paper", colors: [col], puff: 0.25, shadow: 0, rough: 0.5, fuzz: 0.3 });
    const back = [[-0.25, 0.402], [-0.25, 0.33], [-0.08, 0.3], [0.08, 0.325], [0.2, 0.31], [0.34, 0.345], [0.48, 0.355], [0.62, 0.38], [0.76, 0.392], [0.84, 0.402]];
    const front = [[-0.25, 0.402], [-0.25, 0.36], [-0.12, 0.355], [0.02, 0.37], [0.16, 0.362], [0.3, 0.383], [0.44, 0.39], [0.56, 0.402]];
    const town = cut([[-0.25, 0.403], [-0.25, 0.388], [0.1, 0.392], [0.42, 0.397], [0.62, 0.403]], { material: "sand", colors: ["#F3DCC0", "#EBCFAF"], puff: 0, shadow: 0, rough: 0.2,
      specks: { scale: 520, density: 0.5, size: 0.35, colors: ["#FFFFFF", "#F2C9B8"] } });
    return layer("far-coast", "Far coast", 0.05, [
      ridge(back, "#A3A9DA"),
      { ...ridge(front, "#8F96CC"), specks: { scale: 420, density: 0.18, size: 0.3, colors: ["#F4F0FF", "#E8E2F8"] } },
      town,
    ], { far: true, haze: 0.22, boil: 0.6 });
  }

  function ocean() {
    const sea = cut([[-0.3, 0.398], [0.975, 0.398], [1.05, 0.6], [1.0, 1.4], [-0.3, 1.4]],
      { material: "water", colors: [C.sea, C.seaNear], rough: 0.1, fuzz: 0.1, puff: 0, shadow: 0, grain: 1.2 });
    const boat = (c, k, sail) => [
      shape({ shape: "polygon", sides: 3, star: 0, w: r4(0.018 * k), h: r4(0.026 * k), material: "paper", colors: [sail], puff: 0.2, shadow: 0, rough: 0.2, xf: place(c[0], c[1] - 0.016 * k) }),
      box([c[0], c[1] - 0.002 * k], 0.024 * k, 0.005 * k, { material: "paper", colors: ["#3D4A6E"], puff: 0, shadow: 0, rough: 0.2, corner: 0.8 }),
    ];
    return [
      layer("ocean", "Ocean", 0.12, [sea], { boil: 0.6, haze: 0.04 }),
      sunGlitter(),
      layer("glints", "Glints", 0.12, [], { type: "sparkles", count: 46, size: 0.0042, color: "#FFF8DE", area: [0.08, 0.41, 0.8, 0.62], far: false }),
      layer("sailboats", "Sailboats", 0.06, [...boat([0.18, 0.413], 1, "#FFFFFF"), ...boat([0.58, 0.409], 0.7, "#FCE9D6")],
        { far: true, boil: 0.5, anim: { type: "drift", amp: [0.006, 0.0005] } }),
    ];
  }

  // Sun glitter: short painted streaks under the sun that switch on and off, two poses at a time.
  function sunGlitter() {
    const streaks = [];
    for (let i = 0; i < 22; i++) {
      const t = rnd();
      const y = lerp(0.412, 0.6, t * t);
      const spread = lerp(0.07, 0.3, t);
      const x = 0.38 + (rnd() - 0.5) * 2 * spread;
      const w = lerp(0.012, 0.07, t) * (0.6 + rnd() * 0.6), h = lerp(0.0016, 0.006, t);
      streaks.push({ on: Math.floor(rnd() * 4), it: oval([x, y], w, h, { material: "paper", colors: ["#FFF6D6"], rough: 0.6, fuzz: 0.8, puff: 0, shadow: 0 }) });
    }
    const items = posed(4, (f) => streaks.map(({ on, it }) => ({ ...it, hide: f !== on && f !== (on + 1) % 4 })));
    return layer("glitter", "Sun glitter", 0.12, items, { boil: 1, cycle: { frames: 4, rate: 4 }, opacity: 0.85 });
  }

  // Wave crests: lines parallel to the shore, which in perspective all point at VP. They roll in by
  // turning about VP; each pose moves them a sixth of the gap, so the next crest takes over seamlessly.
  function waves() {
    const shoreAngle = Math.atan2(1, -1.1);
    const gap = 4.6 * DEG;
    const crest = (k, d0, d1, ph) => {
      const top = [], bot = [];
      for (let i = 0; i < 9; i++) {
        const d = lerp(d0, d1, i / 8);
        const w = (0.002 + 0.007 * d) * (0.6 + 0.6 * Math.sin((i / 8) * Math.PI));
        const wob = (0.004 + 0.004 * d) * Math.sin(i * 1.3 + ph);
        top.push([d, -w / 2 + wob]);
        bot.push([d, w / 2 + wob * 0.7]);
      }
      const a = shoreAngle + gap * k;
      const pts = [...top, ...bot.reverse()].map((p) => add(VP, rot(p, a)));
      return cut(pts, { material: "felt", colors: [C.foam], puff: 0.25, fuzz: 1, rough: 0.9, shadow: 0.1 });
    };
    const base = [];
    [[1, 0.0], [2, 1.7], [3, 3.1], [4, 4.4]].forEach(([k, ph]) => {
      let d = 0.08 + rnd() * 0.08;
      while (d < 1.3) {
        const len = (0.1 + rnd() * 0.16) * (0.4 + d);
        base.push({ k, it: crest(k + (rnd() - 0.5) * 0.25, d, d + len, ph + d * 3) });
        d += len + (0.05 + rnd() * 0.12) * (0.4 + d);
      }
    });
    const items = posed(6, (f) => base.map(({ k, it }) => {
      const moved = turnAbout(it, VP, -gap * (f / 6));
      // The crests nearest the shore melt into the wash on the last pose.
      return k === 1 && f === 5 ? { ...moved, hide: true } : moved;
    }));
    return layer("waves", "Waves", 0.16, items, { boil: 1, cycle: { frames: 6, rate: 6 }, opacity: 0.9, res: 0.7 });
  }

  // ======================= the beach =======================
  function buildings() {
    const items = [];
    let gz = 3.2, n = 0;
    while (gz < 45) {
      const len = 1.3 + rnd() * 1.1, h = 2.4 + rnd() * 1.6, gz1 = gz + len;
      const col = PASTELS[n % PASTELS.length];
      const pts = [P(6.3, gz), up(P(6.3, gz), h * K(gz)), up(P(6.3, gz1), h * K(gz1)), P(6.3, gz1)];
      items.push(cut(pts, { material: "paper", colors: [col], puff: 0.15, shadow: 0.25, rough: 0.3 }));
      // Two windows and a door-height stripe, also in perspective.
      for (const [t0, t1, h0, h1] of [[0.15, 0.4, 0.5, 0.78], [0.55, 0.85, 0.5, 0.78]]) {
        const za = lerp(gz, gz1, t0), zb = lerp(gz, gz1, t1);
        items.push(cut([up(P(6.3, za), h * h0 * K(za)), up(P(6.3, za), h * h1 * K(za)), up(P(6.3, zb), h * h1 * K(zb)), up(P(6.3, zb), h * h0 * K(zb))],
          { material: "paper", colors: ["#5F86AE"], puff: 0.1, shadow: 0.2, rough: 0.2 }));
      }
      if (n % 3 === 1) {
        const za = lerp(gz, gz1, 0.1), zb = lerp(gz, gz1, 0.9);
        items.push(cut([up(P(6.25, za), h * 0.42 * K(za)), up(P(6.25, za), h * 0.3 * K(za)), up(P(6.25, zb), h * 0.3 * K(zb)), up(P(6.25, zb), h * 0.42 * K(zb))],
          { material: "stripes", colors: ["#FFFFFF", PASTELS[(n + 3) % 8]], stripes: { width: 0.006 }, puff: 0.3, shadow: 0.35 }));
      }
      gz = gz1 + 0.05;
      n++;
    }
    return layer("shops", "Shops", 0.1, items, { far: true, haze: 0.05, boil: 0.8 });
  }

  function sand() {
    const shore = SHORE;
    const shorePts = [];
    for (let i = 0; i < 16; i++) { const z = 1 / lerp(1 / 0.62, 1 / 70, i / 15); shorePts.push(P(shore(z), z)); }
    const walkPts = [];
    for (let i = 0; i < 9; i++) { const z = 1 / lerp(1 / 70, 1 / 2.9, i / 8); walkPts.push(P(4.7, z)); }
    const beach = cut([...shorePts, ...walkPts, [2.1, 1.4], [0.05, 1.4]], { material: "sand", colors: [C.sand, C.sandNear], puff: 0, shadow: 0, rough: 0.3, fuzz: 0.4, grain: 1 });
    const wet = strip(shore, (z) => shore(z) + 0.3 + 0.06 * Math.sin(z * 2.7), 0.62, 40, 14, { material: "sand", colors: ["#DDB680", "#D2A86F"], puff: 0, shadow: 0, rough: 1, fuzz: 1 });
    // Bits left by the tide: a starfish and some seaweed.
    const star = shape({ shape: "polygon", sides: 5, star: 0.55, w: 0.045, h: 0.045, material: "clay", colors: ["#F08A4B"], puff: 0.8, shadow: 0.5, rough: 0.3, xf: place(...P(SHORE(1.9) + 0.22, 1.9), 0.3) });
    const weed = shape({ shape: "blob", material: "felt", colors: ["#4E6B3A"], puff: 0.4, fuzz: 1, shadow: 0.3, rough: 1, merge: 0.01,
      lobes: [[-0.03, 0, 0.012], [-0.012, -0.004, 0.01], [0.008, 0.002, 0.012], [0.028, -0.002, 0.009]], xf: place(...P(SHORE(2.6) + 0.42, 2.6), -0.3) });
    const walk = strip(() => 4.7, () => 6.35, 2.9, 70, 8, { material: "paper", colors: ["#EDE4D4"], puff: 0.1, shadow: 0, rough: 0.3 });
    const curb = strip(() => 4.6, () => 4.72, 2.9, 70, 8, { material: "paper", colors: ["#D7CAB4"], puff: 0.3, shadow: 0.3, rough: 0.3 });
    const items = [beach, wet, walk, curb, star, weed];
    // Footprints wandering down to the water, and a few shells.
    for (let i = 0; i < 14; i++) {
      const z = 1.9 + i * 0.32, gx = 0.9 - i * 0.12 + (i % 2 ? 0.07 : -0.07);
      items.push(oval(P(gx, z), 0.05 * K(z), 0.018 * K(z), { material: "sand", colors: ["#DDB57E", "#D9AE76"], puff: 0.4, shadow: 0, rough: 0.5, fuzz: 0.3 }, -0.5));
    }
    for (const [gx, z, col] of [[0.2, 1.7, "#F7C9C0"], [-0.4, 2.4, "#FFF0E0"], [1.3, 2.0, "#F4D6E6"]]) {
      items.push(shape({ shape: "polygon", sides: 7, star: 0.25, w: r4(0.06 * K(z)), h: r4(0.045 * K(z)), material: "clay", colors: [col], puff: 0.8, shadow: 0.5, rough: 0.3, xf: place(...P(gx, z)) }));
    }
    return layer("sand", "Sand", 0.32, items, { boil: 0.8 });
  }

  // The shallows: a light strip over the ocean along the shore, see-through so it melts into the deep water.
  function shallows() {
    const sheet = strip((z) => SHORE(z) - 0.75 + 0.12 * Math.sin(z * 4.1), (z) => SHORE(z) - 0.03, 0.62, 45, 15,
      { material: "water", colors: ["#5FD0CB", "#8FE3D8"], puff: 0, shadow: 0, rough: 1, fuzz: 1, grain: 1.6 });
    return layer("shallows", "Shallows", 0.3, [sheet], { boil: 0.8, opacity: 0.6 });
  }

  // The wash: a thin sheet of water and its line of foam, sliding up the sand and back.
  function shoreWash() {
    const sheet = strip((z) => SHORE(z) - 0.12, (z) => SHORE(z) + 0.08 + 0.05 * Math.sin(z * 3.1), 0.62, 45, 14,
      { material: "water", colors: [C.shallow, "#B4EFE4"], puff: 0, shadow: 0, rough: 0.9, fuzz: 1, grain: 2 });
    const foam = strip((z) => SHORE(z) + 0.06 + 0.04 * Math.sin(z * 3.1), (z) => SHORE(z) + 0.13 + 0.06 * Math.sin(z * 4.3 + 1), 0.62, 45, 14,
      { material: "felt", colors: [C.foam], puff: 0.5, shadow: 0, rough: 1, fuzz: 1 });
    const reach = [0, -0.5, -1.0, -1.35, -1.1, -0.55].map((d) => d * DEG);
    const items = posed(6, (f) => [turnAbout(sheet, VP, reach[f]), turnAbout(foam, VP, reach[f])]);
    return layer("shore-wash", "Shore wash", 0.32, items, { boil: 1.2, cycle: { frames: 6, rate: 6 }, opacity: 0.92, res: 0.7 });
  }

  // ======================= the boardwalk crowd =======================
  // Each row is a few cut-outs of shoulders, a dip between each person, plus a round head and
  // (mostly) a cap of hair per person, shrinking toward VP.
  const SKINS = ["#EBB792", "#C98D66", "#8E5B3F", "#F2C9A8", "#A86F4E"];
  const HAIRS = ["#2A1E1C", "#5A3A26", "#C89B5A", "#1F1A1C", "#7A4A2E"];
  function crowdRow(gx, z0, z1, n, tall, col) {
    const people = [];
    for (let i = 0; i < n; i++) people.push(z0 * Math.pow(z1 / z0, i / (n - 1)));
    const items = [], heads = [];
    for (let s0 = 0; s0 < n; s0 += 10) {
      const group = people.slice(s0, s0 + 10);
      const top = [];
      group.forEach((z) => {
        const h = tall * (0.86 + rnd() * 0.28), k = K(z), p = P(gx, z);
        top.push([p[0] + 0.2 * k, p[1] - h * 0.66 * k]);
        top.push([p[0] - 0.1 * k, p[1] - h * 0.7 * k]);
        top.push([p[0] - 0.19 * k, p[1] - h * 0.5 * k]);
        const hc = [p[0] + 0.04 * k, p[1] - h * 0.86 * k];
        heads.push(oval(hc, 0.2 * k, 0.23 * k, { material: "paper", colors: [SKINS[Math.floor(rnd() * SKINS.length)]], puff: 0.45, shadow: 0.2, rough: 0.3 }));
        if (rnd() < 0.75) heads.push(oval([hc[0] - 0.01 * k, hc[1] - 0.06 * k], 0.21 * k, 0.12 * k, { material: "felt", colors: [HAIRS[Math.floor(rnd() * HAIRS.length)]], puff: 0.4, shadow: 0.1, fuzz: 0.8 }));
      });
      const zA = group[0], zB = group[group.length - 1] * 1.03;
      items.push(cut([P(gx, zA), ...top, P(gx, zB)], { material: "paper", colors: [col], round: 0.002, puff: 0.35, shadow: 0.3, rough: 0.5, fuzz: 0.3 }));
    }
    return [...items, ...heads];
  }
  function crowd() {
    const rows = [
      crowdRow(5.55, 4.4, 14, 20, 1.0, "#9C8BC0"),
      crowdRow(5.55, 14, 60, 20, 1.0, "#A595C6"),
      crowdRow(5.05, 4.1, 13, 20, 0.95, "#5D4E86"),
      crowdRow(5.05, 13, 55, 20, 0.95, "#6A5B91"),
    ];
    // Back and front rows bob out of step, like people walking.
    const flat = rows.flatMap((r, i) => r.map((it) => ({ it, i })));
    const items = posed(4, (f) => flat.map(({ it, i }) => {
      const bob = (f % 2 === (i < 2 ? 0 : 1) ? -1 : 0) * (i % 2 ? 0.0012 : 0.003);
      return { ...it, xf: { ...it.xf, y: r4(it.xf.y + bob) } };
    }));
    return layer("crowd", "Boardwalk crowd", 0.2, items, { boil: 1, cycle: { frames: 4, rate: 4 } });
  }

  // Crowd noise: little cardboard quote marks, " ' ", jiggling above the heads.
  function chatter() {
    const groups = [[6.6, 0.0], [9.6, 1.3], [13.8, 2.6], [20.5, 3.9]];
    const items = [];
    groups.forEach(([z, ph], g) => {
      const k = K(z), p = up(P(5.3, z), 1.6 * k);
      const ticks = [[-0.55, 1], [-0.32, 1], [0, 0.8], [0.32, 1], [0.55, 1]];
      ticks.forEach(([dx, s], i) => {
        const c = [p[0] + dx * k, p[1] - (i === 2 ? 0.02 : 0) * k];
        // A quote-mark tick: wide and round at the top, narrow at the bottom, leaning a little.
        const w = 0.22 * k * s, h = 0.58 * k * s, lean = i === 2 ? 0.1 : 0.22;
        const pts = [[-w / 2, -h / 2], [w / 2, -h / 2], [w * 0.14, h / 2], [-w * 0.14, h / 2]].map((q) => add(c, rot(q, lean)));
        items.push({ g, ph, i, it: cut(pts, { material: "cardboard", colors: ["#E6C48E", "#B98E5A"], round: 0.25 * w, puff: 0.6, shadow: 0.8, rough: 0.4, fuzz: 0.5 }) });
      });
    });
    const list = posed(4, (f) => items.map(({ g, i, it }) => {
      const k = (Math.max(...it.points.map((q) => q[1])) - Math.min(...it.points.map((q) => q[1]))) / 0.58;
      const wig = Math.sin((f / 4) * TAU + g * 1.3 + (i > 2 ? 1.5 : 0));
      return { ...it, xf: { ...it.xf, y: r4(it.xf.y + wig * 0.012 * k), r: r4(it.xf.r + wig * 0.18) } };
    }));
    return layer("chatter", "Crowd chatter", 0.2, list, { boil: 1.4, cycle: { frames: 4, rate: 4 } });
  }

  // ======================= palms =======================
  function frond(K0, ang, len, wid, col, droop) {
    const n = 8, top = [], bot = [];
    for (let i = 0; i < n; i++) {
      const t = (i + 1) / n;
      const c = add(add(K0, dir(ang, len * t)), [0, droop * len * t * t]);
      const tan = Math.atan2(Math.sin(ang) * len + 2 * droop * len * t, Math.cos(ang) * len);
      const nrm = dir(tan - Math.PI / 2);
      const w = wid * Math.pow(Math.sin(Math.PI * Math.min(t, 0.97)), 0.7);
      top.push(add(c, [nrm[0] * w * 0.35, nrm[1] * w * 0.35]));
      // The lower edge is a row of leaflets: deep, shallow, deep...
      bot.push(add(c, [-nrm[0] * w, -nrm[1] * w]));
      if (i < n - 1) bot.push(add(c, [-nrm[0] * w * 0.35, -nrm[1] * w * 0.35]));
    }
    return cut([K0, ...top, ...bot.reverse()], { material: "felt", colors: [col], puff: 0.45, shadow: 0.35, rough: 0.7, fuzz: 0.8 });
  }
  function palm(base, H, lean, ph, id) {
    const crown = [base[0] + lean * H, base[1] - H];
    const tl = [], tr = [];
    for (let i = 0; i <= 7; i++) {
      const t = i / 7;
      const c = [lerp(base[0], crown[0], t) + Math.sin(t * Math.PI) * 0.06 * H * Math.sign(lean || 1), lerp(base[1], crown[1], t)];
      const w = lerp(0.045, 0.026, t) * H;
      tl.push([c[0] - w / 2, c[1]]);
      tr.push([c[0] + w / 2, c[1]]);
    }
    const trunk = cut([...tl, ...tr.reverse()], { material: "stripes", colors: C.trunk, stripes: { width: 0.022 * H }, puff: 0.7, shadow: 0.3, rough: 0.5, fuzz: 0.4 });
    const fronds = [];
    const angles = [-172, -150, -128, -100, -72, -48, -24, -6, -160, -40].map((a) => a * DEG);
    angles.forEach((a, i) => {
      const back = i >= 8;
      fronds.push({ f: frond(crown, a, H * (back ? 0.42 : 0.5 + 0.08 * Math.cos(i)), H * 0.085, back ? C.palm[1] : C.palm[i % 3 === 1 ? 2 : 0], 0.75 + 0.35 * Math.abs(Math.cos(a))), i, back });
    });
    const nuts = [[-0.03, 0.035], [0.012, 0.04], [0.035, 0.028]].map(([dx, dy]) => oval([crown[0] + dx * H * 0.5, crown[1] + dy * H * 0.5], 0.045 * H, 0.045 * H, { material: "clay", colors: ["#7A5434"], puff: 0.8, shadow: 0.4 }));
    // Fronds sway about the crown, each a little out of step, 8 poses at 4 a second (a 2-second sway).
    const backF = fronds.filter((x) => x.back), frontF = fronds.filter((x) => !x.back);
    const sway = (list, f) => list.map(({ f: it, i }) => turnAbout(it, crown, (3.2 + (i % 3)) * DEG * Math.sin((f / 8) * TAU + ph + i * 0.35)));
    const items = posed(8, (f) => [...sway(backF, f), trunk, ...sway(frontF, f), ...nuts]);
    return { id, items, crown };
  }
  function palms() {
    const spots = [[3.6, 2.5, -0.05], [5.2, 2.4, 0.06], [7.6, 2.5, -0.04], [11, 2.4, 0.05], [16, 2.5, -0.03], [24, 2.4, 0.04]];
    return spots.map(([z, h, lean], i) => {
      const p = palm(P(4.25, z), h * K(z), lean, i * 1.7, `palm-${i + 1}`);
      return layer(p.id, `Palm ${i + 1}`, r4(0.36 - i * 0.04), p.items,
        { boil: 1.2, cycle: { frames: 8, rate: 4 }, anim: { type: "sway", amp: 0.012, phase: i, speed: 1 }, res: i > 2 ? 0.7 : 1 });
    }).reverse();
  }

  // ======================= umbrellas, towels, people =======================
  function umbrella(G, k, colors, tilt = -0.18) {
    const top = add(G, rot([0, -1.3 * k], tilt * 0.4));
    const pole = bar(G, top, 0.035 * k, { material: "paper", colors: ["#F4F1EA"], puff: 0.5, shadow: 0.4 });
    // A shallow dome with a scalloped hem, tipped toward the sun.
    const W = 0.85 * k, Hh = 0.38 * k;
    const local = [];
    for (let i = 0; i <= 10; i++) { const t = i / 10, x = lerp(-W, W, t); local.push([x, -Hh * Math.sqrt(1 - (x / W) ** 2) * 0.9 + 0.02 * k]); }
    for (let i = 0; i < 6; i++) { const x0 = lerp(W, -W, i / 6), x1 = lerp(W, -W, (i + 0.5) / 6); local.push([x0, 0.04 * k]); local.push([x1, 0.12 * k]); }
    local.push([-W, 0.04 * k]);
    const world = local.map((p) => add(top, rot([p[0], p[1] + 0.18 * k], tilt)));
    const fan = add(top, rot([0, -0.18 * k], tilt));
    const canopy = cut(world, { material: "stripes", colors, stripes: { count: 10 }, fanAt: fan, puff: 0.55, shadow: 0.55, rough: 0.4 });
    const tip = oval(add(top, rot([0, -0.16 * k], tilt)), 0.06 * k, 0.06 * k, { material: "clay", colors: [colors[1]], puff: 0.8, shadow: 0.3 });
    return [pole, canopy, tip];
  }
  const shade = (gx0, gx1, gz0, gz1) => quad(gx0, gx1, gz0, gz1, { material: "sand", colors: ["#DDB47F", "#D8AC76"], puff: 0, shadow: 0, rough: 0.9, fuzz: 1, round: 0.004 });

  // A sunbather lying on her front, reading, kicking her feet (4 poses).
  function sunbather(gz, gxHead, colors) {
    const k = K(gz);
    const g = (gx, h) => up(P(gx, gz), h * k);
    const hip = g(gxHead + 0.62, 0.16), sh = g(gxHead + 0.2, 0.2), head = g(gxHead + 0.02, 0.33), knee = g(gxHead + 1.0, 0.1);
    const base = [
      bar(sh, g(gxHead - 0.12, 0.08), 0.1 * k, { material: "paper", colors: [C.skin2Shade], puff: 0.5 }),
      bar(hip, knee, 0.15 * k, { material: "paper", colors: [C.skin2], puff: 0.6 }),
      bar(sh, hip, 0.22 * k, { material: "stripes", colors: colors, stripes: { width: 0.012 * k * 4 }, puff: 0.6, shadow: 0.4 }),
      oval(head, 0.2 * k, 0.2 * k, { material: "paper", colors: [C.skin2], puff: 0.6 }),
      oval(add(head, [0.03 * k, -0.04 * k]), 0.22 * k, 0.16 * k, { material: "felt", colors: [C.hair2], puff: 0.5, fuzz: 0.8 }),
      box(g(gxHead - 0.16, 0.1), 0.16 * k, 0.1 * k, { material: "paper", colors: ["#F0E6D2"], puff: 0.3, shadow: 0.5, corner: 0.1 }, -0.2),
      bar(knee, g(gxHead + 1.12, 0.36), 0.12 * k, { material: "paper", colors: [C.skin2], puff: 0.6 }),
      oval(g(gxHead + 1.16, 0.4), 0.1 * k, 0.16 * k, { material: "paper", colors: [C.skin2Shade], puff: 0.5 }, 0.4),
    ];
    return posed(4, (f) => base.map((it, i) => (i >= 6 ? turnAbout(it, knee, [0, 0.3, 0.12, -0.18][f]) : it)));
  }

  // A small seated figure, knees up, arms around them.
  function sitter(G, k, suit, skin, hair) {
    const hip = up(G, 0.12 * k), sh = up(G, 0.5 * k), head = up(G, 0.68 * k), knee = add(G, [0.2 * k, -0.26 * k]), foot = add(G, [0.3 * k, -0.02 * k]);
    return [
      bar(hip, knee, 0.13 * k, { material: "paper", colors: [skin], puff: 0.5, shadow: 0.2 }),
      bar(knee, foot, 0.11 * k, { material: "paper", colors: [skin], puff: 0.5, shadow: 0.2 }),
      box(add(hip, [0, -0.17 * k]), 0.24 * k, 0.4 * k, { material: "paper", colors: [suit], puff: 0.5, shadow: 0.35, corner: 0.5 }, 0.12),
      bar(add(sh, [0.04 * k, 0.02 * k]), add(knee, [-0.02 * k, 0.02 * k]), 0.08 * k, { material: "paper", colors: [skin], puff: 0.5 }),
      oval(head, 0.24 * k, 0.25 * k, { material: "paper", colors: [skin], puff: 0.5, shadow: 0.25 }),
      oval(add(head, [-0.03 * k, -0.06 * k]), 0.26 * k, 0.15 * k, { material: "felt", colors: [hair], puff: 0.5, fuzz: 0.8 }),
    ];
  }

  // A swimmer out in the water, waist deep, waving (4 poses).
  function swimmer() {
    const z = 6.2, gx = -2.3, k = K(z);
    const G = P(gx, z);                       // where the water surface meets her
    const sh = up(G, 0.34 * k), head = up(G, 0.52 * k);
    const shoulderR = add(sh, [0.09 * k, 0]);
    const parts = (a) => [
      box(up(G, 0.14 * k), 0.26 * k, 0.32 * k, { material: "paper", colors: ["#F0675A"], puff: 0.5, shadow: 0.3, corner: 0.45 }),
      bar(add(sh, [-0.09 * k, 0]), add(sh, [-0.14 * k, 0.24 * k]), 0.08 * k, { material: "paper", colors: [C.skin2], puff: 0.5 }),
      oval(head, 0.2 * k, 0.21 * k, { material: "paper", colors: [C.skin2], puff: 0.6 }),
      oval(add(head, [0, -0.055 * k]), 0.22 * k, 0.12 * k, { material: "clay", colors: ["#F6C445"], puff: 0.6 }),
      bar(shoulderR, add(shoulderR, dir(a, 0.36 * k)), 0.08 * k, { material: "paper", colors: [C.skin2], puff: 0.5 }),
      oval(add(G, [0, 0.004 * k]), 0.6 * k, 0.09 * k, { material: "water", colors: ["#9BE6DC", "#C7F4EC"], puff: 0.1, fuzz: 1, rough: 0.9, shadow: 0 }),
      oval(add(G, [0, 0.012 * k]), 0.75 * k, 0.05 * k, { material: "felt", colors: ["#F2FFFB"], puff: 0.2, fuzz: 1, rough: 1, shadow: 0 }),
    ];
    const angles = [-2.0, -1.5, -2.0, -1.5];
    return posed(4, (f) => parts(angles[f]));
  }

  function lifeguardTower() {
    const z = 6, gx = -0.3, k = K(z), G = P(gx, z);
    const hut = up(G, 1.35 * k);
    return [
      bar(add(G, [-0.42 * k, 0]), add(hut, [-0.42 * k, 0.3 * k]), 0.06 * k, { material: "paper", colors: ["#F2F0EA"], puff: 0.3 }),
      bar(add(G, [0.42 * k, 0]), add(hut, [0.42 * k, 0.3 * k]), 0.06 * k, { material: "paper", colors: ["#F2F0EA"], puff: 0.3 }),
      bar(add(G, [1.15 * k, 0]), add(hut, [0.5 * k, 0.32 * k]), 0.16 * k, { material: "paper", colors: ["#E4DACB"], puff: 0.3, shadow: 0.4, corner: 0.2 }),
      box(hut, 1.1 * k, 0.62 * k, { material: "stripes", colors: ["#7CC6E8", "#F7E08A"], stripes: { width: 0.1 * k }, puff: 0.4, shadow: 0.5, corner: 0.08 }),
      box(add(hut, [0.12 * k, -0.04 * k]), 0.5 * k, 0.22 * k, { material: "paper", colors: ["#3F6386"], puff: 0.1, shadow: 0.2, corner: 0.1 }),
      shape({ shape: "polygon", sides: 3, star: 0, w: r4(1.4 * k), h: r4(0.34 * k), material: "paper", colors: ["#F6F3EC"], puff: 0.3, shadow: 0.4, xf: place(hut[0], hut[1] - 0.44 * k) }),
    ];
  }

  // ======================= gulls =======================
  function gullWings(c, k, a) {
    // Wings as a stylized "M", turning about the shoulders: a > 0 lifts them.
    const wing = (side) => {
      const s = side;
      const pts = [[0, -0.004], [s * 0.016, -0.014], [s * 0.034, -0.012], [s * 0.052, -0.001], [s * 0.04, 0.0], [s * 0.024, -0.003], [s * 0.012, 0.0], [0, 0.005]]
        .map(([x, y]) => add(c, [x * k, y * k]));
      const tipPts = [[s * 0.04, -0.008], [s * 0.052, -0.001], [s * 0.04, 0.0]].map(([x, y]) => add(c, [x * k, y * k]));
      const w = cut(pts, { material: "felt", colors: ["#FBFBF8"], puff: 0.4, fuzz: 0.6, shadow: 0.25, rough: 0.3 });
      const tip = cut(tipPts, { material: "felt", colors: ["#4C4F5E"], puff: 0.2, fuzz: 0.6, shadow: 0, rough: 0.3 });
      const ang = -s * a;
      return [turnAbout(w, c, ang), turnAbout(tip, c, ang)];
    };
    return [...wing(-1), ...wing(1)];
  }
  function flyingGull(c, k) {
    const body = [
      oval(c, 0.026 * k, 0.012 * k, { material: "felt", colors: ["#FFFFFF"], puff: 0.6, fuzz: 0.6, shadow: 0.3 }),
      oval(add(c, [0.013 * k, -0.003 * k]), 0.011 * k, 0.01 * k, { material: "felt", colors: ["#FFFFFF"], puff: 0.6, fuzz: 0.5, shadow: 0.2 }),
      shape({ shape: "polygon", sides: 3, star: 0, w: r4(0.007 * k), h: r4(0.006 * k), material: "paper", colors: ["#F2A53A"], puff: 0.2, shadow: 0, rough: 0.1, xf: place(c[0] + 0.021 * k, c[1] - 0.002 * k, Math.PI / 2) }),
    ];
    const flap = [32, 8, -20, 8].map((d) => d * DEG);
    return posed(4, (f) => [...gullWings(c, k, flap[f]).slice(0, 2), ...body, ...gullWings(c, k, flap[f]).slice(2)]);
  }
  function gulls() {
    const make = (id, name, y, k, depth, speed, phase, rise) => layer(id, name, depth, flyingGull([0, y], k),
      { boil: 1.2, cycle: { frames: 4, rate: 8 }, anim: { type: "travel", from: [-0.12, 0], to: [A + 0.3, rise], speed, phase, bob: 0.012, bobs: 3 } });
    return [
      make("gull-far", "Gull, far", 0.22, 0.8, 0.06, 1, 0.15, -0.04),
      make("gull-mid", "Gull, middle", 0.15, 1.1, 0.1, 1, 0.55, 0.03),
      make("gull-near", "Gull, near", 0.3, 1.8, 0.45, 1, 0.82, -0.06),
    ];
  }

  // A gull on the wet sand, pecking (4 poses).
  function standingGull() {
    const c = [0.74, 0.79], k = 1.15;
    const neck = add(c, [0.016 * k, -0.006 * k]);
    const head = [
      oval(add(c, [0.024 * k, -0.014 * k]), 0.016 * k, 0.015 * k, { material: "felt", colors: ["#FFFFFF"], puff: 0.6, fuzz: 0.5, shadow: 0.3 }),
      shape({ shape: "polygon", sides: 3, star: 0, w: r4(0.007 * k), h: r4(0.012 * k), material: "paper", colors: ["#F2A53A"], puff: 0.2, shadow: 0.2, rough: 0.1, xf: place(c[0] + 0.036 * k, c[1] - 0.013 * k, Math.PI / 2) }),
      oval(add(c, [0.027 * k, -0.017 * k]), 0.0035 * k, 0.0035 * k, { material: "paper", colors: ["#1C1C22"], puff: 0, shadow: 0, rough: 0, fuzz: 0 }),
    ];
    const body = [
      bar(add(c, [-0.004 * k, 0.008 * k]), add(c, [-0.006 * k, 0.026 * k]), 0.0025 * k, { material: "paper", colors: ["#E9A24A"], puff: 0.2, shadow: 0.3 }),
      bar(add(c, [0.004 * k, 0.008 * k]), add(c, [0.006 * k, 0.026 * k]), 0.0025 * k, { material: "paper", colors: ["#E9A24A"], puff: 0.2, shadow: 0.3 }),
      cut([add(c, [-0.02 * k, -0.004 * k]), add(c, [-0.036 * k, -0.01 * k]), add(c, [-0.034 * k, 0.0]), add(c, [-0.018 * k, 0.006 * k])], { material: "felt", colors: ["#3F4250"], puff: 0.3, fuzz: 0.5, shadow: 0.3 }),
      oval(c, 0.04 * k, 0.02 * k, { material: "felt", colors: ["#FFFFFF"], puff: 0.6, fuzz: 0.5, shadow: 0.45 }),
      oval(add(c, [-0.004 * k, -0.002 * k]), 0.03 * k, 0.012 * k, { material: "felt", colors: ["#9AA0AE"], puff: 0.5, fuzz: 0.5, shadow: 0.2 }, -0.1),
    ];
    const peck = [0, 0, 0.75, 0.25];
    return posed(4, (f) => [...body, ...head.map((it) => turnAbout(it, neck, peck[f]))]);
  }

  // ======================= the girl =======================
  // A kneeling girl in a sun hat, scooping sand into her bucket: 12 poses at 6 a second, so three scoops a loop.
  // Her parts are placed in her own units around her hip, then scaled into the scene.
  const HIP = [1.08, 0.8], GK = 1.3;
  const gp = (p) => [HIP[0] + p[0] * GK, HIP[1] + p[1] * GK];
  function ik(S, T, l1, l2) {
    const dx = T[0] - S[0], dy = T[1] - S[1];
    const d = Math.min(Math.hypot(dx, dy), l1 + l2 - 1e-4);
    const a = Math.atan2(dy, dx);
    const bend = Math.acos(Math.max(-1, Math.min(1, (l1 * l1 + d * d - l2 * l2) / (2 * l1 * d))));
    const E = add(S, dir(a + bend, l1));
    const Hd = add(S, dir(a, d));
    return { E, H: Hd };
  }
  const GIRL_KEYS = [
    // hand target (her units), shovel angle, lean, sand on the shovel, falling sand
    [[0.07, 0.012], 1.15, 0.32, 0, 0], [[0.072, 0.016], 1.22, 0.34, 0, 0],
    [[0.068, -0.028], -0.3, 0.27, 1, 0], [[0.086, -0.042], -0.1, 0.21, 1, 0],
    [[0.104, -0.044], 0.0, 0.16, 1, 0], [[0.11, -0.046], 0.0, 0.14, 1, 0],
    [[0.106, -0.066], 0.7, 0.14, 0, 1], [[0.106, -0.063], 0.9, 0.15, 0, 2],
    [[0.09, -0.045], 1.2, 0.2, 0, 0], [[0.082, -0.02], 1.1, 0.26, 0, 0],
    [[0.078, 0.003], 1.05, 0.3, 0, 0], [[0.072, 0.01], 1.12, 0.31, 0, 0],
  ];
  function girlFrame(f) {
    const [hand, shovelA, lean, carry, fall] = GIRL_KEYS[f];
    const up_ = [Math.sin(lean), -Math.cos(lean)];
    const along = (l) => [up_[0] * l, up_[1] * l];
    const R = (v) => rot(v, lean);
    const S = along(0.072), Hd = along(0.12);
    const skin = { material: "paper", colors: [C.skin], puff: 0.6, shadow: 0.3 };
    const skinFar = { material: "paper", colors: [C.skinShade], puff: 0.5, shadow: 0.2 };
    const W = (p) => gp(p), L = (l) => l * GK;
    const arm = ik(S, hand, 0.052, 0.05);
    const farArm = ik(add(S, [-0.006, 0.003]), [0.044, 0.02], 0.052, 0.05);
    const blade = add(arm.H, dir(shovelA, 0.056));
    const bladeUp = rot([0, -1], shovelA);
    const swing = Math.sin((f / 12) * TAU * 1) * 0.25;
    const items = [
      // far side
      bar(W(add(S, [-0.006, 0.003])), W(farArm.E), L(0.019), skinFar),
      bar(W(farArm.E), W(farArm.H), L(0.017), skinFar),
      bar(W([-0.008, -0.004]), W([0.044, 0.031]), L(0.028), skinFar),
      bar(W([0.044, 0.031]), W([-0.042, 0.046]), L(0.023), skinFar),
      // near leg, kneeling
      bar(W([0, 0]), W([0.052, 0.035]), L(0.03), skin),
      bar(W([0.052, 0.035]), W([-0.034, 0.05]), L(0.025), skin),
      oval(W([-0.047, 0.049]), L(0.032), L(0.015), skin, -0.1),
      // body and head
      box(W(along(0.044)), L(0.054), L(0.1), { material: "stripes", colors: ["#F0675A", "#FFF1DC"], stripes: { width: L(0.011) }, puff: 0.6, shadow: 0.45, corner: 0.45 }, lean),
      oval(W(add(Hd, R([-0.036, 0.014]))), L(0.022), L(0.042), { material: "felt", colors: [C.hair], puff: 0.5, fuzz: 0.9, shadow: 0.3 }, lean + swing),
      oval(W(add(Hd, R([-0.008, -0.004]))), L(0.07), L(0.056), { material: "felt", colors: [C.hair], puff: 0.5, fuzz: 0.9, shadow: 0.3 }, lean),
      oval(W(Hd), L(0.062), L(0.058), skin, lean * 0.6),
      oval(W(add(Hd, R([0.031, 0.004]))), L(0.012), L(0.01), skin),
      oval(W(add(Hd, R([0.014, 0.0]))), L(0.0065), L(0.009), { material: "paper", colors: ["#2E2226"], puff: 0, shadow: 0, rough: 0, fuzz: 0 }),
      oval(W(add(Hd, R([0.011, 0.014]))), L(0.013), L(0.008), { material: "paper", colors: ["#F39A8E"], puff: 0, shadow: 0, rough: 0, fuzz: 0.6 }),
      // sun hat
      oval(W(add(Hd, R([-0.003, -0.027]))), L(0.054), L(0.034), { material: "cardboard", colors: ["#F2D58C", "#D6B062"], puff: 0.6, shadow: 0.3 }, lean),
      box(W(add(Hd, R([-0.003, -0.017]))), L(0.052), L(0.008), { material: "paper", colors: ["#E5484D"], puff: 0.3, shadow: 0.2, corner: 0.5 }, lean),
      oval(W(add(Hd, R([0.004, -0.012]))), L(0.112), L(0.017), { material: "cardboard", colors: ["#F5DC98", "#D6B062"], puff: 0.5, shadow: 0.55 }, lean * 0.6 - 0.08),
      // shovel, sand, near arm
      bar(W(arm.H), W(add(arm.H, dir(shovelA, 0.042))), L(0.008), { material: "clay", colors: ["#F6C445"], puff: 0.6, shadow: 0.3 }),
      box(W(blade), L(0.03), L(0.024), { material: "clay", colors: ["#2BB3B1"], puff: 0.7, shadow: 0.45, corner: 0.55 }, shovelA),
      { ...oval(W(add(blade, [bladeUp[0] * 0.009, bladeUp[1] * 0.009])), L(0.026), L(0.013), { material: "sand", colors: ["#EFCB91", "#E4B878"], puff: 0.6, shadow: 0.3, rough: 0.8, fuzz: 0.8 }, shovelA), hide: !carry },
      ...[[0.15, -0.03], [0.158, -0.024], [0.146, -0.018], [0.162, -0.014]].map(([x, y], i) => ({
        ...oval(W([x, y + (fall === 2 ? 0.01 : 0)]), L(0.007 - i * 0.0007), L(0.007 - i * 0.0007), { material: "sand", colors: ["#EFCB91", "#E4B878"], puff: 0.5, shadow: 0.2, rough: 0.5 }),
        hide: !fall,
      })),
      bar(W(S), W(arm.E), L(0.02), skin),
      bar(W(arm.E), W(arm.H), L(0.018), skin),
      oval(W(arm.H), L(0.02), L(0.018), skin),
    ];
    return items;
  }
  // ======================= 3D pieces =======================
  // A rubber duck afloat in the shallows, bobbing and rocking (4 poses), its underside hidden by
  // a patch of water and a ring of foam, and a clay crab scuttling near the water's edge (12 poses).
  function rubberDuck() {
    const c = [0.36, 0.875], k = 1.35;
    const duck = { ...LB.SCULPTS.duck(), name: "Rubber duck", yaw: -0.75, pitch: -0.3, shadow: 0, xf: place(c[0], c[1] - 0.012, 0) };
    duck.xf.s = k;
    duck.poses = [{}, { y: -0.004, r: 0.05 }, { y: -0.006 }, { y: -0.003, r: -0.05 }];
    const water = oval([c[0], c[1] + 0.034 * k], 0.2 * k, 0.05 * k, { material: "water", colors: ["#7FD9D0", "#A6EBE0"], puff: 0, shadow: 0, rough: 0.8, fuzz: 1, grain: 2 });
    const ring = oval([c[0] + 0.004, c[1] + 0.02 * k], 0.15 * k, 0.014 * k, { material: "felt", colors: ["#DDF7F1"], puff: 0.2, shadow: 0, rough: 1, fuzz: 1 });
    const ringPosed = { ...ring, poses: [{}, { y: -0.002 }, { y: -0.003 }, { y: -0.001 }] };
    return layer("rubber-duck", "Rubber duck (3D)", 0.72, [duck, water, ringPosed], { boil: 1.3, cycle: { frames: 4, rate: 4 } });
  }
  function crab() {
    const c = [0.71, 0.912], k = 1.1;
    const it = { ...LB.SCULPTS.crab(), name: "Clay crab", shadow: 0.55, xf: { ...place(c[0], c[1]), s: k } };
    it.poses = Array.from({ length: 12 }, (_, f) => {
      const x = r4(0.035 * Math.sin((f / 12) * TAU)), wig = f % 2 ? 0.14 : -0.14;
      return f ? { x, yaw: wig, y: f % 2 ? -0.002 : 0 } : { yaw: wig };
    });
    return layer("crab", "Clay crab (3D)", 0.85, [it], { boil: 1.4, cycle: { frames: 12, rate: 6 } });
  }

  function girl() {
    return layer("girl", "Girl digging", 0.82, posed(12, girlFrame), { boil: 1.6, cycle: { frames: 12, rate: 6 } });
  }
  function bucketAndCastle() {
    const W = gp, L = (l) => l * GK;
    const sandMat = (c1 = "#EFCF98", c2 = "#E2B67A") => ({ material: "sand", colors: [c1, c2], puff: 0.7, shadow: 0.5, rough: 0.6, fuzz: 0.5 });
    const handle = [];
    for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI; handle.push(W([0.17 + Math.cos(a) * 0.034, -0.012 + Math.sin(a) * 0.03])); }
    for (let i = 8; i >= 0; i--) { const a = Math.PI + (i / 8) * Math.PI; handle.push(W([0.17 + Math.cos(a) * 0.029, -0.012 + Math.sin(a) * 0.025])); }
    return layer("bucket", "Bucket and sandcastle", 0.8, [
      // the hole she's digging, and the pile beside it
      oval(W([0.1, 0.064]), L(0.06), L(0.018), { material: "sand", colors: ["#B4875A", "#A57A4E"], puff: 0.3, shadow: 0, rough: 0.8, fuzz: 0.6 }),
      shape({ shape: "blob", ...sandMat(), lobes: [[-0.012, 0.004, 0.012], [0.004, -0.002, 0.014], [0.018, 0.005, 0.01]].map(([x, y, r]) => [r4(L(x)), r4(L(y)), r4(L(r))]), xf: place(...W([0.128, 0.079])) }),
      // the bucket
      cut(handle, { material: "clay", colors: ["#F6C445"], puff: 0.5, shadow: 0.4, rough: 0.2 }),
      cut([W([0.135, -0.012]), W([0.205, -0.012]), W([0.196, 0.058]), W([0.144, 0.058])], { material: "clay", colors: ["#F05A4F"], puff: 0.75, shadow: 0.6, rough: 0.25 }),
      oval(W([0.17, -0.012]), L(0.07), L(0.018), { material: "clay", colors: ["#B83A38"], puff: 0.3, shadow: 0, rough: 0.2 }),
      oval(W([0.17, -0.015]), L(0.058), L(0.013), sandMat()),
      bar(W([0.137, -0.008]), W([0.203, -0.008]), L(0.008), { material: "clay", colors: ["#F57F72"], puff: 0.6, shadow: 0.2 }),
      // a sandcastle she built earlier
      box(W([-0.13, 0.042]), L(0.09), L(0.04), sandMat(), 0),
      box(W([-0.16, 0.012]), L(0.026), L(0.06), sandMat("#F2D49F"), 0),
      box(W([-0.1, 0.016]), L(0.026), L(0.052), sandMat("#F2D49F"), 0),
      shape({ shape: "polygon", sides: 3, star: 0, w: r4(L(0.032)), h: r4(L(0.026)), ...sandMat("#F4D9A8"), xf: place(...W([-0.16, -0.028])) }),
      shape({ shape: "polygon", sides: 3, star: 0, w: r4(L(0.032)), h: r4(L(0.026)), ...sandMat("#F4D9A8"), xf: place(...W([-0.1, -0.019])) }),
      bar(W([-0.16, -0.04]), W([-0.16, -0.068]), L(0.003), { material: "paper", colors: ["#6E5340"], puff: 0, shadow: 0.2 }),
      cut([W([-0.16, -0.068]), W([-0.136, -0.062]), W([-0.16, -0.056])], { material: "paper", colors: ["#E5484D"], puff: 0.2, shadow: 0.3, rough: 0.2 }),
      shape({ shape: "polygon", sides: 7, star: 0.3, w: r4(L(0.02)), h: r4(L(0.016)), material: "clay", colors: ["#F8CFC4"], puff: 0.8, shadow: 0.4, xf: place(...W([-0.13, 0.05])) }),
    ], { boil: 1.5 });
  }

  // ======================= the near umbrella, towels and ball =======================
  function nearCamp() {
    const z = 1.95, k = K(z), G = P(2.55, z);
    return layer("near-camp", "Near umbrella", 0.62, [
      shade(1.9, 3.6, 1.85, 2.4),
      quad(1.35, 2.45, 1.9, 2.4, { material: "stripes", colors: ["#F48FB1", "#FFF4EA"], stripes: { width: 0.022 }, puff: 0.25, shadow: 0.35, rough: 0.4 }),
      box(add(P(2.75, 2.15), [0, -0.035]), 0.11, 0.07, { material: "clay", colors: ["#3D8FD1"], puff: 0.6, shadow: 0.6, corner: 0.2 }),
      box(add(P(2.75, 2.15), [0, -0.072]), 0.115, 0.016, { material: "clay", colors: ["#F7F7F2"], puff: 0.6, shadow: 0.3, corner: 0.4 }),
      ...umbrella(G, k, ["#2FA56B", "#FFF8EC"], -0.22),
      oval(add(P(-0.15, 2.9), [0, -0.03]), 0.06, 0.06, { material: "stripes", colors: ["#F04E4E", "#FFF7E8"], stripes: { count: 6 }, puff: 0.9, shadow: 0.7 }),
    ], { boil: 1.3 });
  }
  function midCamps() {
    const zA = 4.2, kA = K(zA), GA = P(1.4, zA);
    const zB = 9, kB = K(zB), GB = P(0.6, zB);
    const towelA = quad(0.85, 2.0, 3.95, 4.35, { material: "stripes", colors: ["#3F7FD0", "#FFFFFF"], stripes: { width: 0.012 }, puff: 0.2, shadow: 0.3, rough: 0.4 });
    const farUmbrellas = [[12, 2.2, ["#F6C445", "#E5484D"]], [15, 3.4, ["#7CC6E8", "#FFFFFF"]], [19, 1.6, ["#F48FB1", "#FFFFFF"]], [26, 2.8, ["#9AD27E", "#FFFFFF"]]]
      .flatMap(([z, gx, cols]) => [shade(gx - 0.3, gx + 0.9, z - 0.3, z + 0.5), ...umbrella(P(gx, z), K(z), cols, -0.2)]);
    return [
      layer("far-umbrellas", "Far umbrellas", 0.24, farUmbrellas, { boil: 0.9, haze: 0.06 }),
      layer("camp-b", "Umbrella and friends", 0.24, [
        shade(0.1, 1.7, 8.7, 9.6),
        quad(0.05, 1.1, 8.8, 9.5, { material: "stripes", colors: ["#F6C445", "#FFFFFF"], stripes: { width: 0.004 }, puff: 0.2, shadow: 0.2 }),
        ...sitter(P(0.25, 9.25), kB, "#E5484D", C.skin, C.hair),
        ...sitter(P(0.75, 9.2), kB, "#2FA56B", C.skin3, C.hair2),
        ...umbrella(GB, kB, ["#7CC6E8", "#FFF8EC"], -0.15),
      ], { boil: 1.1 }),
      layer("lifeguard", "Lifeguard tower", 0.28, lifeguardTower(), { boil: 1 }),
      layer("camp-a-shade", "Umbrella shade", 0.42, [shade(0.8, 2.4, 3.9, 4.7), towelA], { boil: 1.1 }),
      layer("sunbather", "Sunbather reading", 0.42, sunbather(4.15, 0.95, ["#9C5FC0", "#F6C9E6"]), { boil: 1.2, cycle: { frames: 4, rate: 4 } }),
      layer("camp-a", "Red umbrella", 0.42, umbrella(GA, kA, ["#E5484D", "#FFF6EA"], -0.2), { boil: 1.2 }),
    ];
  }

  // Several layers become one, back to front, each keeping its pieces together as a group.
  function combine(layers, ids, into) {
    const parts = ids.map((id) => layers.find((l) => l.id === id));
    const at = layers.indexOf(parts[0]);
    const dst = { ...into, paint: [] };
    for (const src of parts) LB.DOC.mergeLayers(dst, src, { front: true });
    for (const src of parts) layers.splice(layers.indexOf(src), 1);
    layers.splice(at, 0, dst);
  }

  // ======================= the scene =======================
  function build() {
    seed = 7;
    const layers = [
      ...sky(), clouds(), farCoast(), ...ocean(), waves(), buildings(), sand(), shallows(), shoreWash(),
      crowd(), chatter(), ...palms(), ...midCamps(),
      layer("swimmer", "Swimmer waving", 0.4, swimmer(), { boil: 1.3, cycle: { frames: 4, rate: 4 } }),
      ...gulls(), nearCamp(),
      layer("gull-standing", "Gull pecking", 0.66, standingGull(), { boil: 1.4, cycle: { frames: 4, rate: 4 } }),
      rubberDuck(), crab(),
      bucketAndCastle(), girl(),
    ];
    // Objects that share a depth and a pose timing share a layer, each as its own group, the way
    // they would in a drawing program. Palms, gulls and clouds keep their own layers: each one
    // sways, drifts or flies on its own, and motion belongs to a layer.
    combine(layers, ["crab", "bucket", "girl"], { id: "girl", name: "Girl at her sandcastle", depth: 0.82, boil: 1.5, seed: 403, cycle: { frames: 12, rate: 6 } });
    combine(layers, ["crowd", "chatter"], { id: "crowd", name: "Boardwalk crowd", depth: 0.2, boil: 1.2, seed: 116, cycle: { frames: 4, rate: 4 } });
    combine(layers, ["camp-a-shade", "sunbather", "camp-a"], { id: "camp-a", name: "Red umbrella camp", depth: 0.42, boil: 1.2, seed: 92, cycle: { frames: 4, rate: 4 } });
    combine(layers, ["far-umbrellas", "camp-b"], { id: "camp-b", name: "Umbrellas up the beach", depth: 0.24, boil: 1, haze: 0.03, seed: 149 });
    return {
      format: "elaborate-backgrounds/scene", version: 1,
      title: "Beach day",
      note: "Sample scene built from the editor's own pieces. Procedural, written by Claude.",
      aspect: A, focus: [1.12, 0.5],
      background: "#F7E3C4", horizon: "#F6E2CC",
      camera: { drift: [0.006, 0.002] },
      fps: 12, boil: 1,
      layers,
      post: LB.DOC.clone(LB.DOC.PRESETS.sunny.post),
      grades: { sunny: LB.DOC.clone(LB.DOC.PRESETS.sunny.grade) },
      grade: "sunny",
      images: {},
    };
  }

  LB.scenes = LB.scenes || {};
  LB.scenes.beach = build;
  // Pieces for the store: each returns a whole layer, centered on "at".
  LB.BEACH = {
    palm(at) {
      const p = palm([at[0], at[1] + 0.2], 0.4, -0.04, 0, "palm");
      return { name: "Palm tree", depth: 0.3, cycle: { frames: 8, rate: 4 }, anim: { type: "sway", amp: 0.012, phase: 0, speed: 1 }, paint: p.items };
    },
    umbrella(at) {
      const k = 0.24, G = [at[0], at[1] + 0.15];
      return { name: "Beach umbrella", depth: 0.5, paint: umbrella(G, k, ["#E5484D", "#FFF6EA"], -0.2) };
    },
    gull(at) {
      return { name: "Seagull", depth: 0.1, cycle: { frames: 4, rate: 8 }, paint: flyingGull([0, at[1]], 1.3),
        anim: { type: "travel", from: [-0.12, 0], to: [A + 0.3, -0.03], speed: 1, phase: 0, bob: 0.012, bobs: 3 } };
    },
    towel(at) {
      return { el: "shape", shape: "rect", w: 0.3, h: 0.12, corner: 0.08, material: "stripes", colors: ["#3F7FD0", "#FFFFFF"], stripes: { width: 0.02 },
        rough: 0.4, fuzz: 0.3, puff: 0.2, shadow: 0.3, grain: 1, xf: { x: at[0], y: at[1], s: 1, r: 0 } };
    },
  };
})();
