/*
  Desk by the Window (placeholder name): the bespoke art.

    dwall     the room: a calm cream wall, warmer near the window where the
              sunset bounces, a baseboard and a wooden floor, with the
              window's opening left empty so the view shows through
    ddesk     the wooden desk: planks running along its front edge, a lit
              bevel on that edge, the end of the desk and a leg
    dsky      the sunset through the window: gold at the horizon, peach,
              then dusky plum, and a low sun
    dclouds   one long sunset cloud drifting across, baked 24 times. Each
              bake is the cloud a step further along, blended toward a copy
              one loop behind it, so the drift loops without a jump
    dhills    low golden hills, a hazier range behind, dark oaks
    dvines    vineyard rows running to the horizon, baked 4 times so the
              near leaves rustle

  The view shaders work in the window's own units (the opening's height is
  1), measured from the rect their layer covers, so the same art fits the
  wide window and the tall one. The wall and the desk pick their layout
  with "n": 0 for 16:9, 1 for a tall phone.

  Everything is procedural: shader code, no images.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  // ---------- the room ----------
  const WALL = `
// Window opening (x0, y0, x1, y1), and the floor line (y) plus the frame's aspect, per layout.
const vec4 WIN[2] = vec4[2](vec4(0.99, 0.10, 1.68, 0.69), vec4(0.066, 0.064, 0.396, 0.388));
const vec2 FLR[2] = vec2[2](vec2(0.80, 1.7778), vec2(0.705, 0.4615));
void main() {
  vec2 p = scenePos();
  int n = uN;
  vec4 w = WIN[n];
  float fy = FLR[n].x;
  if (p.x > w.x && p.x < w.z && p.y > w.y && p.y < w.w) { outColor = vec4(0.0); return; }
  vec2 wc = (w.xy + w.zw) * 0.5;
  float wh = w.w - w.y;
  // Cream paint, a touch deeper toward the floor.
  vec3 c = vec3(0.975, 0.866, 0.738) * (1.0 - 0.045 * smoothstep(0.35, 0.95, p.y));
  // The sunset bounces off the wall around the window: peach close to it, gone well before the left side.
  vec2 dq = (p - wc) / wh * vec2(0.9, 1.0);
  float near = exp(-max(length(dq) - 0.45, 0.0) * 4.2);
  c = mix(c, vec3(0.985, 0.76, 0.58), 0.30 * near);
  // Under the sill the wall is in its own shade.
  float under = smoothstep(w.w + 0.03, w.w + 0.005, p.y) * step(w.w, p.y) * smoothstep(w.x - 0.04, w.x, p.x) * smoothstep(w.z + 0.04, w.z, p.x);
  c *= 1.0 - 0.10 * under;
  // Plaster, barely there.
  c *= 0.993 + 0.012 * paper(p) + 0.012 * (fbm3(p * 7.0 + 3.0) - 0.5);
  vec4 acc = vec4(c, 1.0);
  // The baseboard: painted wood with a lit lip and a shadow line where it meets the floor.
  float bt = fy - 0.024;
  if (p.y > bt - 0.004) {
    vec3 bb = vec3(0.93, 0.87, 0.77) * (0.985 + 0.02 * brush(p, 30.0));
    bb = mix(bb, vec3(0.99, 0.95, 0.88), smoothstep(bt + 0.004, bt, p.y) * 0.8);
    bb *= 1.0 - 0.18 * smoothstep(fy - 0.008, fy, p.y);
    over(acc, bb, fill(bt - p.y + wobble(p, 60.0, 0.0012)));
    // A soft shadow the baseboard's lip throws on the wall just above it.
    acc.rgb *= 1.0 - 0.05 * smoothstep(bt - 0.012, bt, p.y) * step(p.y, bt);
  }
  // The floor: warm boards, wider toward you, darker against the wall.
  if (p.y > fy - 0.004) {
    float t = clamp((p.y - fy) / 0.3, 0.0, 1.0);
    float rows = pow(t, 0.62) * 9.0;
    float seam = smoothstep(0.06, 0.0, abs(fract(rows) - 0.5) - 0.44);
    float board = floor(rows);
    float stag = hash12(vec2(board, 3.0));
    float joint = smoothstep(0.012, 0.0, abs(fract(p.x * 1.6 + stag * 7.0) - 0.5) - 0.49);
    vec3 wood = mix(vec3(0.56, 0.38, 0.27), vec3(0.66, 0.47, 0.33), stag);
    wood *= 0.9 + 0.16 * vnoise(vec2(p.x * 40.0, rows * 3.0 + stag * 9.0));
    wood *= 1.0 - 0.35 * max(seam, joint);
    wood *= 0.78 + 0.22 * smoothstep(0.0, 0.25, t);
    over(acc, wood, fill(fy - p.y));
  }
  outColor = acc;
}`;

  // ---------- the desk ----------
  const DESK = `
// Per layout: the back edge along the wall (E0 to E1, the long diagonal), the back right corner B,
// the near right corner N (the front edge runs from N parallel to the diagonal), the front face's
// thickness, and the front right leg's width.
const vec4 EDGE[2] = vec4[2](vec4(-0.02, 1.0112, 0.889, 0.50), vec4(-0.02, 0.865, 0.30, 0.62));
const vec4 BN[2] = vec4[2](vec4(0.965, 0.515, 1.05, 0.78), vec4(0.385, 0.636, 0.5, 0.9));
const vec2 THICK[2] = vec2[2](vec2(0.032, 0.024), vec2(0.024, 0.018));
float side(vec2 p, vec2 a, vec2 b) { vec2 e = normalize(b - a); return (p.x - a.x) * e.y - (p.y - a.y) * e.x; }
void main() {
  vec2 p = scenePos();
  int n = uN;
  vec2 e0 = EDGE[n].xy, e1 = EDGE[n].zw, b = BN[n].xy, nc = BN[n].zw;
  float t = THICK[n].x, lw = THICK[n].y;
  vec2 dir = normalize(e1 - e0);
  vec2 q0 = nc - dir * 3.0;              // far along the front edge, off the bottom left
  vec2 down = vec2(0.0, t);
  vec4 acc = vec4(0.0);
  // Under the desk: the wall and floor in its shade.
  float under = max(side(p, q0 + down, nc + down), p.x - nc.x + 0.004);
  if (under < 0.0) over(acc, vec3(0.16, 0.10, 0.09), 0.5 * smoothstep(0.0, -0.05, under));
  // The front right leg, in front of that shade.
  float legX = nc.x - lw * 0.75;
  float dl = max(abs(p.x - legX) - lw * 0.5, nc.y + t * 0.5 - p.y);
  if (dl < 0.01) {
    vec3 lc = vec3(0.47, 0.31, 0.20) * (0.8 + 0.3 * smoothstep(legX + lw * 0.5, legX - lw * 0.5, p.x));
    lc *= 0.92 + 0.1 * vnoise(vec2(p.x * 300.0, p.y * 12.0));
    over(acc, lc, fill(dl + wobble(p, 50.0, 0.001)));
  }
  // The front face: the edge of the desk top, hanging below the front edge.
  float dFace = max(max(side(p, q0, nc), -side(p, q0 + down, nc + down)), p.x - nc.x);
  if (dFace < 0.01) {
    float u = clamp((p.y - (nc.y + (p.x - nc.x) * dir.y / dir.x)) / t, 0.0, 1.0);
    vec3 fc = vec3(0.50, 0.32, 0.20) * (0.95 + 0.08 * vnoise(vec2(dot(p, dir) * 90.0, u * 4.0)));
    fc = mix(fc * 1.25, fc * 0.8, u);
    over(acc, fc, fill(dFace + wobble(p, 40.0, 0.001)));
  }
  // The top: below the long back edge, left of the right edge, above the front edge.
  float dTop = max(max(side(p, e0, e1), side(p, b, nc)), max(side(p, e1, b), -side(p, q0, nc)));
  if (dTop > 0.03) { outColor = acc; return; }
  vec2 nrm = vec2(-dir.y, dir.x);
  float along = dot(p - e0, dir), across = dot(p - e0, nrm);
  // Planks run along the desk and widen toward you.
  float plankW = 0.06 + across * 0.22;
  float pk = across / plankW;
  float plank = floor(pk);
  float r = hash12(vec2(plank, 7.0));
  vec3 lo = vec3(0.45, 0.28, 0.16), hi = vec3(0.63, 0.42, 0.26);
  vec3 wood = mix(lo, hi, 0.35 + 0.45 * r);
  float fig = fbm3(vec2(along * 7.0 + r * 30.0, pk * 4.0));
  float grain = vnoise(vec2(along * 90.0 + fig * 14.0, pk * 9.0 + r * 50.0));
  float rings = smoothstep(0.55, 0.95, sin((pk * 6.0 + fig * 5.0 + along * 2.0) * 3.14159) * 0.5 + 0.5);
  wood *= 0.84 + 0.24 * grain;
  wood *= 1.0 - 0.1 * rings;
  wood *= 0.97 + 0.05 * vnoise(vec2(along * 400.0, pk * 120.0));
  // Seams between the planks.
  wood *= 1.0 - 0.32 * smoothstep(0.03, 0.0, abs(fract(pk) - 0.5) - 0.47);
  // Warmer and lighter toward the window end, a little dimmer toward you.
  wood *= 0.82 + 0.24 * smoothstep(-0.2, 1.0, along / length(e1 - e0));
  // The edges: a lit bevel along the back edge, a rounded lit front edge.
  wood = mix(wood, vec3(0.90, 0.72, 0.50), smoothstep(0.006, 0.0, across) * 0.55);
  float front = -side(p, q0, nc);
  wood = mix(wood, vec3(0.92, 0.74, 0.52), smoothstep(0.007, 0.0, front) * 0.6);
  wood = mix(wood, wood * 1.08, smoothstep(0.008, 0.0, -side(p, b, nc)));
  // A shadow on the wall where the desk meets it, just above the back edge.
  if (dTop > 0.0 && across < 0.0 && along > 0.0 && along < length(e1 - e0)) over(acc, vec3(0.25, 0.15, 0.12), smoothstep(-0.009, 0.0, across) * 0.12);
  over(acc, wood, fill(dTop + wobble(p, 30.0, 0.0012)));
  outColor = acc;
}`;

  // ---------- the view: shared window units ----------
  const VIEW = `
// Window units: the opening's middle is (0, 0), its height is 1, y runs down. The horizon sits at HZ.
const float HZ = 0.12;
const vec2 SUN = vec2(0.20, 0.075);
float winH() { return uRect.w - uRect.y - 0.02; }
float winFill(float d) { return fill(d * winH()); }
vec2 winPos(vec2 p) {
  vec2 c = (uRect.xy + uRect.zw) * 0.5;
  return (p - c) / winH();
}
`;

  const SKY = VIEW + `
void main() {
  vec2 q = winPos(scenePos());
  float t = clamp((q.y + 0.5) / (HZ + 0.5), 0.0, 1.0);
  t += (fbm(q * vec2(2.0, 7.0) + 3.0) - 0.5) * 0.08;
  vec3 plum = vec3(0.42, 0.28, 0.40), mauve = vec3(0.67, 0.44, 0.52), peach = vec3(0.92, 0.62, 0.49), gold = vec3(0.96, 0.78, 0.50);
  vec3 c = mix(plum, mauve, smoothstep(0.0, 0.42, t));
  c = mix(c, peach, smoothstep(0.35, 0.75, t));
  c = mix(c, gold, smoothstep(0.7, 1.0, t));
  // The sun's glow: wide and soft, warmest along the horizon.
  vec2 s = (q - SUN) * vec2(0.8, 1.4);
  c = mix(c, vec3(1.0, 0.86, 0.6), exp(-dot(s, s) * 9.0) * 0.55);
  c *= 0.975 + 0.04 * brush(q, 4.0);
  c *= 0.99 + 0.02 * paper(scenePos());
  vec4 acc = vec4(c, 1.0);
  // The sun: a cut paper disc, sinking behind the hills.
  float ds = length(q - SUN) - 0.052 + wobble(q, 40.0, 0.004);
  over(acc, vec3(1.0, 0.92, 0.70) * (0.97 + 0.04 * paper(scenePos())), winFill(ds));
  outColor = acc;
}`;

  // One long cloud, drifting a little each frame. Two copies a loop apart are blended by how far
  // through the loop the frame is, so the last frame leads straight back into the first.
  const CLOUDS = VIEW + `
float cloudAt(vec2 q, float shift) {
  vec2 c = q - vec2(shift, 0.0);
  // A long streak with a fuller head, and a thinner wisp below it.
  float body = exp(-pow((c.y + 0.21 + 0.03 * sin(c.x * 3.0)) / 0.055, 2.0)) * smoothstep(-0.55, -0.15, c.x) * smoothstep(0.5, 0.05, c.x);
  float wisp = exp(-pow((c.y + 0.09 + 0.02 * sin(c.x * 4.0 + 1.0)) / 0.025, 2.0)) * smoothstep(-0.2, 0.15, c.x) * smoothstep(0.7, 0.3, c.x) * 0.8;
  float n = fbm(c * vec2(3.0, 11.0) + 4.0);
  return clamp((body + wisp) * (0.35 + 0.95 * n) - 0.18, 0.0, 1.0);
}
void main() {
  vec2 q = winPos(scenePos());
  float u = uFrame / 24.0;
  float drift = 0.16;
  float dens = mix(cloudAt(q, u * drift), cloudAt(q, (u - 1.0) * drift), u);
  float a = smoothstep(0.02, 0.4, dens);
  // Lit from below by the low sun: gold underneath, mauve on top.
  float under = smoothstep(-0.27, -0.17, q.y);
  vec3 col = mix(vec3(0.62, 0.42, 0.52), vec3(0.98, 0.72, 0.52), under);
  col = mix(col, vec3(1.0, 0.86, 0.62), exp(-pow(length((q - SUN) * vec2(0.6, 1.0)) / 0.35, 2.0)) * 0.4);
  col *= 0.95 + 0.08 * fbm3(q * 30.0);
  outColor = vec4(col * a * 0.92, a * 0.92);
}`;

  const HILLS = VIEW + `
// Oaks on the near hills: x, size.
const vec2 OAK[6] = vec2[6](vec2(-0.43, 0.034), vec2(-0.36, 0.026), vec2(-0.12, 0.03), vec2(0.36, 0.038), vec2(0.43, 0.028), vec2(0.06, 0.022));
float ridge(float x, float base, float a, float f, float ph) { return base - a * (0.6 * sin(x * f + ph) + 0.4 * sin(x * f * 2.3 + ph * 1.7)); }
void main() {
  vec2 q = winPos(scenePos());
  vec4 acc = vec4(0.0);
  // The far range: hazy, almost the sky's color.
  float far = ridge(q.x, HZ - 0.03, 0.04, 4.2, 1.0) + wobble(q, 20.0, 0.004);
  if (q.y > far - 0.01) over(acc, mix(vec3(0.80, 0.55, 0.50), vec3(0.90, 0.66, 0.52), 0.3 + 0.4 * fbm3(q * 8.0)), winFill(far - q.y));
  // The near hills: dry gold grass, the slopes away from the sun in shade.
  float near = ridge(q.x, HZ + 0.012, 0.045, 2.6, 4.0) + wobble(q, 16.0, 0.004);
  if (q.y > near - 0.01) {
    float slope = ridge(q.x + 0.01, HZ + 0.012, 0.045, 2.6, 4.0) - ridge(q.x - 0.01, HZ + 0.012, 0.045, 2.6, 4.0);
    vec3 grass = mix(vec3(0.83, 0.62, 0.36), vec3(0.62, 0.44, 0.30), smoothstep(-0.002, 0.004, -slope));
    grass *= 0.9 + 0.15 * fbm3(vec2(q.x * 40.0, q.y * 90.0));
    // The flat land in front, where the vines stand: deeper gold toward you.
    grass = mix(grass, vec3(0.80, 0.60, 0.36), smoothstep(HZ + 0.02, HZ + 0.1, q.y));
    grass *= 1.0 - 0.18 * smoothstep(HZ + 0.1, 0.5, q.y);
    over(acc, grass, winFill(near - q.y));
  }
  // Oaks: dark round crowns on short trunks, a warm rim on the sun's side.
  for (int k = 0; k < 6 * uOne; k++) {
    vec2 o = OAK[k];
    float gy = ridge(o.x, HZ + 0.012, 0.045, 2.6, 4.0) + 0.004;
    vec2 cc = vec2(o.x, gy - o.y * 1.25);
    vec2 d = (q - cc) / o.y;
    float crown = length(d * vec2(0.85, 1.0)) - 1.0 + (fbm3(q * 140.0 + float(k)) - 0.5) * 0.55;
    float trunk = max(abs(q.x - o.x) - o.y * 0.12, max(cc.y - q.y, q.y - gy));
    float dd = min(crown * o.y, trunk);
    if (dd < 0.01) {
      vec3 tc = vec3(0.20, 0.21, 0.15) * (0.85 + 0.3 * fbm3(q * 200.0));
      tc = mix(tc, vec3(0.62, 0.48, 0.28), smoothstep(-0.2, 0.9, dot(normalize(d + 1e-4), normalize(SUN - cc))) * smoothstep(-0.35, 0.0, crown) * 0.5);
      over(acc, tc, winFill(dd));
    }
  }
  outColor = acc;
}`;

  // Vineyard rows running to the horizon. Seen from here, a row is a wedge from the vanishing point:
  // its foliage stands on the ground line and rises a share of the distance to the horizon.
  const VINES = VIEW + `
const float VPX = -0.04;   // where the rows meet, on the horizon
const float SP = 0.62;     // row spacing, in ground units
const float RW = 0.16;     // a row's width
const float RH = 0.28;     // how tall the foliage stands, as a share of its distance below the horizon
void main() {
  vec2 q = winPos(scenePos());
  float Y = q.y - HZ;
  if (Y < 0.004) { outColor = vec4(0.0); return; }
  float x = q.x - VPX;
  float k0 = floor(x / Y / SP + 0.5);
  float near = Y / (1.0 - RH);
  // The nearest row covering this pixel wins: the one whose foliage here stands closest to you.
  float best = -1.0, bk = 0.0, bh = 0.0, bleaf = 0.0, bfrac = 0.0;
  for (int i = -2; i <= 2 * uOne; i++) {
    float k = k0 + float(i);
    float lo = k * SP - RW * 0.5, hi = k * SP + RW * 0.5;
    // Ground distances where the row's footprint lines up with this x.
    float g0, g1;
    if (lo > 0.0) { if (x <= 0.0) continue; g0 = x / hi; g1 = x / lo; }
    else if (hi < 0.0) { if (x >= 0.0) continue; g0 = x / lo; g1 = x / hi; }
    else { g0 = x > 0.0 ? x / hi : x < 0.0 ? x / lo : 0.0; g1 = 1e3; }
    // Foliage standing at ground distance yg covers screen heights yg * (1 - RH) to yg.
    float yg = min(g1, near);
    if (yg < max(g0, Y) || yg <= best) continue;
    float h = clamp((yg - Y) / (yg * RH), 0.0, 1.0);
    // Leaves: clumps that grow with nearness, and a ragged top. Near rows rustle from frame to frame.
    vec2 lq = vec2(x / yg, Y / yg) * vec2(14.0, 30.0) + vec2(k * 7.3, 0.0);
    lq += smoothstep(0.1, 0.35, yg) * 0.5 * vec2(sin(uFrame * 2.1 + k), cos(uFrame * 1.7 + k * 0.5));
    float leaf = fbm3(lq);
    float plant = 0.5 + 0.5 * sin(6.2832 * (1.0 / yg) * 0.9 + k * 1.3);
    leaf += (plant - 0.5) * 0.5 * smoothstep(0.06, 0.2, yg);
    if (1.0 - h - (leaf - 0.5) * 0.5 < 0.0) continue;
    best = yg; bk = k; bh = h; bleaf = leaf; bfrac = clamp((x / yg - lo) / RW, 0.0, 1.0);
  }
  if (best < 0.0) { outColor = vec4(0.0); return; }
  vec3 dark = vec3(0.17, 0.27, 0.20), mid = vec3(0.29, 0.40, 0.28), tip = vec3(0.80, 0.66, 0.38);
  vec3 c = mix(dark, mid, smoothstep(0.3, 0.75, bleaf));
  // Sunlit tops, and the sun's side of each row, catch gold.
  c = mix(c, tip, smoothstep(0.55, 1.0, bh + bleaf * 0.35) * 0.55 + smoothstep(0.4, 1.0, bfrac) * 0.12);
  c *= 0.85 + 0.25 * vnoise(vec2(x / best * 42.0, Y / best * 90.0) + bk);
  // Far rows fade into the evening haze.
  c = mix(c, vec3(0.78, 0.58, 0.45), smoothstep(0.12, 0.0, best) * 0.75);
  float edge = 1.0 - bh - (bleaf - 0.5) * 0.5;
  float a = clamp(edge * best * RH * winH() / uPx * 0.6, 0.0, 1.0);
  outColor = vec4(c * a, a);
}`;

  LB.art = LB.art || {};
  LB.art.desk = { bakes: { dwall: WALL, ddesk: DESK, dsky: SKY, dclouds: CLOUDS, dhills: HILLS, dvines: VINES } };
})();
