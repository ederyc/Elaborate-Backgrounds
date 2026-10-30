/*
  Lilac Falls: the bespoke art of the project's own scene (the landing page).

  The garden study recreated the feel of a stop-motion backdrop by Tamara.
  This scene keeps that palette and mood but is laid out from scratch: a
  stepped clay cliff with a two-tier waterfall on the left, a pool that
  runs out into a stream toward the viewer, a blossom tree on the right.

  The water is made the way stop-motion water is made, then animated by
  replacement: every one of the six frames is a new piece, swapped on 2s.
    falls    crinkled cellophane sheets: strips of slightly different blues,
             streaks that step down a notch each frame, and glints that land
             somewhere new each frame; cotton-wool foam and glass-bead spray
             at the foot
    pools    poured resin: deep in the middle, pale at the rim, clear plastic
             ripple rings that grow one step a frame, painted gloss strokes,
             pebbles round the edge
    stream   the same resin, with streaks that step along the current

  Everything is procedural: shader code, no images.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  // ---------- sky: a butter-and-mint glow at the top, periwinkle, lilac, rose at the horizon, a paper moon ----------
  const SKY = `
void main() {
  vec2 p = scenePos();
  float t = p.y + (fbm(p * vec2(2.2, 5.0)) - 0.5) * 0.06;
  vec3 butter = vec3(0.95, 0.94, 0.80);
  vec3 mint = vec3(0.76, 0.90, 0.86);
  vec3 peri = vec3(0.74, 0.77, 0.97);
  vec3 lilac = vec3(0.82, 0.74, 0.97);
  vec3 rose = vec3(0.95, 0.76, 0.90);
  vec3 c = mix(butter, mint, smoothstep(0.0, 0.12, t));
  c = mix(c, peri, smoothstep(0.10, 0.26, t));
  c = mix(c, lilac, smoothstep(0.24, 0.38, t));
  c = mix(c, rose, smoothstep(0.36, 0.52, t));
  // The moon's glow.
  vec2 m = vec2(1.27, 0.22);
  float r = length((p - m) * vec2(1.0, 1.15));
  c = mix(c, vec3(1.0, 0.97, 0.86), exp(-r * r * 22.0) * 0.55);
  c *= 0.965 + 0.06 * brush(p, 5.0);
  c *= 0.985 + 0.03 * paper(p);
  vec4 acc = vec4(c, 1.0);
  // A paper moon: a cream disc, felt-soft at the edge, with a few pressed dimples.
  float dm = r - 0.052 + wobble(p, 90.0, 0.003);
  if (dm < 0.01) {
    vec2 q = (p - m) / 0.052;
    vec3 n = vec3(-q * 0.55, 1.0);
    float dimple = smoothstep(0.55, 0.75, vnoise(p * 70.0)) * 0.12;
    vec3 moon = lit(vec3(1.0, 0.95, 0.80) * (0.96 + 0.06 * fibers(p / uPx * 0.25)) * (1.0 - dimple), n, 1.0);
    over(acc, moon * 1.08, clamp(0.5 - (dm + (fuzz(p) - 0.5) * 2.5 * uPx) / (1.4 * uPx), 0.0, 1.0));
  }
  outColor = acc;
}`;

  // ---------- hills: rows of flowered mounds and a few distant poplars on the horizon ----------
  const HILLS = `
const vec4 ROW[3] = vec4[3](vec4(0.505, 0.014, 5.1, 0.4), vec4(0.548, 0.022, 3.7, 2.2), vec4(0.605, 0.028, 2.9, 4.1));
const vec3 ROW_DARK[3] = vec3[3](vec3(0.44, 0.38, 0.70), vec3(0.31, 0.27, 0.56), vec3(0.22, 0.21, 0.44));
const vec3 ROW_LIGHT[3] = vec3[3](vec3(0.70, 0.62, 0.93), vec3(0.54, 0.47, 0.84), vec3(0.40, 0.38, 0.72));
const vec3 ROW_SPECK[3] = vec3[3](vec3(0.92, 0.80, 0.99), vec3(0.96, 0.74, 0.90), vec3(0.78, 0.64, 0.98));
const float ROW_SCALE[3] = float[3](48.0, 36.0, 27.0);
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  // Cypresses standing on the farthest row: slim, pointed, a deep hazy blue-violet.
  float horizon = ROW[0].x + ROW[0].y * sin(p.x * ROW[0].z + ROW[0].w);
  float cell = 0.06;
  float i0 = floor(p.x / cell);
  for (int k = -uOne; k <= uOne; k++) {
    float i = i0 + float(k);
    vec2 rnd = hash22(vec2(i, 5.0));
    if (rnd.x < 0.5 || i * cell < 0.75 || i * cell > 1.45) continue;
    float h = 0.03 + 0.03 * rnd.y, w = 0.0065 + 0.003 * rnd.x;
    vec2 base = vec2((i + 0.5) * cell + (rnd.y - 0.5) * 0.02, horizon + 0.006);
    float v = clamp((base.y - p.y) / h, 0.0, 1.0);
    float hwid = w * sqrt(max(1.0 - v, 0.0)) * (0.6 + 0.4 * smoothstep(0.0, 0.25, v));
    float d = max(abs(p.x - base.x) - hwid, max(p.y - base.y, base.y - h - p.y)) + wobble(p, 180.0, 0.002);
    vec3 col = mix(vec3(0.24, 0.30, 0.50), vec3(0.40, 0.46, 0.68), smoothstep(-1.0, 1.0, (base.x - p.x) / max(hwid, 1e-4)));
    col *= 0.9 + 0.2 * fuzz(p);
    over(acc, col, fill(d));
  }
  for (int r = 0; r < 3 * uOne; r++) {
    vec4 row = ROW[r];
    float top = row.x + row.y * sin(p.x * row.z + row.w) + row.y * 0.4 * sin(p.x * row.z * 2.6 + row.w * 1.3);
    float d = top - p.y + wobble(p, 35.0, 0.006);
    if (d > 0.01) continue;
    vec3 c = carpet(p, ROW_DARK[r], ROW_LIGHT[r], top, ROW_SCALE[r], ROW_SPECK[r], vec3(0.99, 0.90, 0.95), 0.40 + 0.06 * float(r));
    float a = clamp(0.5 - (d + (fuzz(p) - 0.5) * 3.0 * uPx) / (1.4 * uPx), 0.0, 1.0);
    over(acc, c, a);
  }
  outColor = acc;
}`;

  // ---------- the cliff: two tiers of painted clay with moss along the top of each ----------
  const CLIFF = `
// The two tiers' outlines, as distances (negative inside). topY is the top edge of the tier the point is on.
float tiers(vec2 p, out float topY) {
  float t1 = 0.300 + 0.006 * sin(p.x * 23.0) + 0.004 * sin(p.x * 57.0);
  float t2 = 0.505 + 0.005 * sin(p.x * 19.0 + 1.0) + 0.003 * sin(p.x * 61.0);
  float r1 = 0.470 + (p.y - 0.30) * 0.16;
  float r2 = 0.715 + (p.y - 0.505) * 0.30;
  float d1 = max(t1 - p.y, p.x - r1);
  float d2 = max(t2 - p.y, p.x - r2);
  topY = p.x < r1 + 0.02 ? t1 : t2;
  return max(smin(d1, d2, 0.012), p.y - 0.815);
}
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  float topY;
  float d = tiers(p, topY) + wobble(p, 26.0, 0.008);
  if (d > 0.01) { outColor = acc; return; }
  // Stacked clay stones: flat lumps, each pressed by hand, with dark joints between them.
  vec2 tc, id;
  float vd = voronoi(vec2(p.x * 17.0, p.y * 30.0) + uSeed, tc, id);
  float joint = smoothstep(0.42, 0.62, vd);
  vec3 n = normalize(vec3(-tc * vec2(1.1, 1.9), 0.9));
  vec3 alb = mix(vec3(0.27, 0.21, 0.44), vec3(0.54, 0.43, 0.72), 0.15 + 0.7 * id.x);
  alb = mix(alb, vec3(0.50, 0.38, 0.58), step(0.82, id.y) * 0.6); // a few rosier stones
  alb *= 0.88 + 0.24 * fbm3(p * 120.0);
  float under = smoothstep(0.0, 0.07, p.y - topY);
  vec3 rock = lit(alb, n, 0.62 + 0.38 * (1.0 - under * 0.6));
  rock = mix(rock, vec3(0.11, 0.08, 0.18), joint * 0.85);
  rock *= mix(vec3(1.0), vec3(0.74, 0.72, 0.98), smoothstep(0.6, 1.0, p.y));
  // Wet stones where the water runs.
  float w1 = (p.x - 0.40) / 0.065, w2 = (p.x - 0.56) / 0.09;
  float wet = exp(-w1 * w1) * step(p.y, 0.52) + exp(-w2 * w2) * step(0.52, p.y);
  rock = mix(rock, rock * vec3(0.60, 0.76, 0.98) + vec3(0.03, 0.05, 0.08), wet * 0.65);
  // Moss: thick along the top of each tier, and tucked into some of the joints lower down.
  float th;
  vec3 moss = foliage(p, vec3(0.06, 0.12, 0.12), vec3(0.20, 0.38, 0.30), vec3(0.34, 0.56, 0.40), vec3(0.58, 0.78, 0.50), 80.0, th);
  moss = specks(p, moss, 140.0, 0.10, vec3(0.99, 0.84, 0.92), vec3(0.98, 0.95, 0.80), 0.32);
  float band = 0.022 + 0.02 * fbm3(p * vec2(18.0, 6.0));
  float topMoss = (1.0 - smoothstep(band * 0.6, band, p.y - topY)) * smoothstep(0.25, 0.55, th + 0.15);
  float jointMoss = joint * step(0.62, fbm3(p * 9.0 + 4.0)) * smoothstep(0.3, 0.5, th) * (1.0 - wet);
  float mossy = max(topMoss, jointMoss);
  over(acc, mix(rock, moss, mossy), fill(d - topMoss * (th - 0.5) * 0.008));
  outColor = acc;
}`;

  // ---------- the falls: cellophane sheets, cotton foam, bead spray. uN 0 is the upper fall, 1 the lower ----------
  const FALL = `
// Distances to the nearest and second-nearest cell points (for creases between facets), and the nearest cell's id.
vec2 cells(vec2 p, out vec2 id) {
  vec2 n = floor(p), f = fract(p);
  float d1 = 8.0, d2 = 8.0;
  id = vec2(0.0);
  for (int j = -uOne; j <= uOne; j++)
  for (int i = -uOne; i <= uOne; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + hash22(n + g) - f;
    float d = dot(r, r);
    if (d < d1) { d2 = d1; d1 = d; id = hash22(n + g + 17.0); }
    else if (d < d2) d2 = d;
  }
  return vec2(sqrt(d1), sqrt(d2));
}
const vec4 FA[2] = vec4[2](vec4(0.400, 0.300, 0.052, 0.512), vec4(0.560, 0.505, 0.078, 0.775)); // center x at the lip, lip y, half width at the lip, foot y
const vec2 FB[2] = vec2[2](vec2(0.066, -0.008), vec2(0.104, 0.02));                               // half width at the foot, lean
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  vec4 a = FA[uN];
  vec2 b = FB[uN];
  float v = (p.y - a.y) / (a.w - a.y);
  float vc = clamp(v, 0.0, 1.0);
  float cx = a.x + b.y * vc * vc;
  float hw = mix(a.z, b.x, pow(vc, 1.3));
  float u = (p.x - cx) / hw;
  float edgeN = fbm3(vec2(p.y * 40.0, uFrame * 3.1 + float(uN) * 9.0)) - 0.5;
  // The back sheet: a darker layer of cellophane, a little wider, showing at the edges.
  float db = max(abs(p.x - cx) - hw * 1.07, max(a.y - 0.002 - p.y, p.y - a.w)) + edgeN * 0.008;
  over(acc, vec3(0.05, 0.30, 0.60), fill(db) * 0.55);
  // The front sheet, cut a little differently in each replacement frame.
  float d = max(abs(p.x - cx) - hw, max(a.y - 0.004 - p.y, p.y - a.w)) + edgeN * 0.006;
  float fa = fill(d);
  if (fa > 0.0) {
    // Strips of slightly different blues, overlapping like layered sheets.
    float strip = floor((u * 0.5 + 0.5) * 6.0 + (vnoise(vec2(v * 2.5, uFrame + 3.0)) - 0.5) * 0.8);
    float tone = hash12(vec2(strip, float(uN) * 7.0 + 1.0));
    vec3 deep = vec3(0.07, 0.42, 0.78), bright = vec3(0.30, 0.82, 0.98);
    vec3 c = mix(deep, bright, (1.0 - u * u) * (0.7 + 0.3 * tone));
    // Streaks: long and thin, a notch further down each frame (one full period over the six frames).
    float s1 = vnoiseP(vec2(u * 11.0 + strip * 1.7, v * 5.0 - uFrame * (5.0 / 6.0)), vec2(64.0, 5.0));
    float s2 = vnoiseP(vec2(u * 23.0 + 4.0, v * 3.0 - uFrame * 0.5), vec2(64.0, 3.0));
    c = mix(c, vec3(0.56, 0.92, 1.0), smoothstep(0.58, 0.86, s1) * 0.7);
    c = mix(c, vec3(0.86, 0.98, 1.0), smoothstep(0.74, 0.92, s2) * 0.5);
    // Crinkles: stretched facets that catch the light, with pale creases between them. A new crinkle every frame.
    // Each facet is flat, a touch lighter or darker; the creases between them catch the light.
    vec2 id;
    vec2 dd = cells(vec2(u * 2.6, v * 6.0) + hash22(vec2(uFrame, float(uN))) * 40.0, id);
    c *= 0.94 + 0.13 * id.x;
    c = mix(c, vec3(0.84, 0.98, 1.0), (1.0 - smoothstep(0.0, 0.05, dd.y - dd.x)) * 0.28 * (0.5 + id.y));
    c *= 1.06;
    // Glints: short bright slivers running with the water, somewhere new each frame.
    float gl = vnoise(vec2(u * 16.0 + hash12(vec2(uFrame, 9.0)) * 40.0, v * 2.2 + uFrame * 5.0));
    c = mix(c, vec3(1.0), smoothstep(0.86, 0.95, gl) * 0.8);
    // The lip: water curling over the edge, rounded and bright, with a thin shadow under the curl.
    float lip = 1.0 - smoothstep(0.0, 0.09, v);
    c = mix(c, vec3(0.86, 0.99, 1.0) * (0.92 + 0.12 * (1.0 - u * u)), lip * 0.8);
    float curl = exp(-pow((v - 0.10) / 0.025, 2.0));
    c *= 1.0 - 0.18 * curl;
    c *= 0.96 + 0.06 * brush(p, 22.0);
    over(acc, c, fa * (0.88 + 0.1 * (1.0 - u * u)));
  }

  // At the foot: pulled cotton wool, a new arrangement of tufts each frame. The tufts add up into one
  // soft mass (a sum of bumps), shaded as a single surface, so it reads as fluff, not as separate balls.
  float footW = b.x * 1.08;
  vec2 foot = vec2(a.x + b.y, a.w);
  float H = 0.0;
  vec2 G = vec2(0.0);
  for (int k = 0; k < 20 * uOne; k++) {
    float fk = float(k);
    vec2 rnd = hash22(vec2(fk + float(uN) * 13.0, uFrame));
    vec2 rnd2 = hash22(vec2(fk * 1.7 + 3.0, uFrame + float(uN) * 5.0));
    float sx = (fk + rnd.x) / 10.0 - 1.0;
    vec2 c = foot + vec2(sx * footW * 0.95, 0.002 - rnd2.x * footW * 0.30 * (1.0 - 0.7 * abs(sx)));
    float r = footW * (0.10 + 0.09 * rnd.y) * (1.0 - 0.35 * abs(sx));
    vec2 q = (p - c) / vec2(1.35, 0.9);
    float ek = exp(-dot(q, q) / (r * r));
    H += ek;
    G += -2.0 * q / (r * r) * ek / vec2(1.35, 0.9);
  }
  H += (fbm3(p * 150.0 + uFrame * 5.0) - 0.5) * 0.35;
  float foamD = (0.55 - H) * footW * 0.12;
  float foamA = clamp(0.5 - (foamD + (fuzz(p) - 0.5) * 5.0 * uPx) / (1.8 * uPx), 0.0, 1.0);
  if (foamA > 0.0) {
    float fib = fibers(p / uPx * 0.3);
    vec3 n = normalize(vec3(-G * footW * 0.05, 1.0));
    vec3 cotton = lit(vec3(0.95, 0.97, 1.0) * (0.9 + 0.12 * fib), n, 0.75 + 0.25 * clamp(H, 0.0, 1.0));
    cotton = mix(cotton, vec3(0.64, 0.72, 0.95), smoothstep(0.1, 0.8, n.y) * 0.35);
    over(acc, cotton * 1.06, foamA * 0.95);
  }
  // A soft mist over the foam.
  float my = (p.y - (a.w - 0.024)) / 0.03;
  float mist = exp(-my * my) * (1.0 - smoothstep(footW * 0.8, footW * 1.5, abs(p.x - foot.x)));
  over(acc, vec3(0.96, 0.98, 1.0), mist * (0.14 + 0.1 * fbm3(p * 40.0 + uFrame)));
  // Glass-bead spray: a few clear beads in the air, somewhere else each frame.
  for (int k = 0; k < 7 * uOne; k++) {
    vec2 rnd = hash22(vec2(float(k) * 3.1 + float(uN), uFrame * 1.7 + 4.0));
    vec2 c = foot + vec2((rnd.x - 0.5) * footW * 2.2, -0.016 - rnd.y * 0.045);
    float r = 0.0026 + 0.0018 * rnd.y;
    vec2 q = (p - c) / r;
    float bd = (length(q) - 1.0) * r;
    vec3 bead = lit(vec3(0.74, 0.92, 1.0), vec3(-q * 0.8, 0.6), 1.0) + vec3(0.4) * smoothstep(0.45, 0.0, length(q - vec2(-0.35, -0.4)));
    over(acc, bead, fill(bd) * 0.9);
  }
  outColor = acc;
}`;

  // ---------- pools and the stream: poured resin. uN 0 is the ledge pool, 1 the big pool and the stream ----------
  const WATER = `
float body(vec2 p, int n, out float t, out float side) {
  t = 0.0; side = 0.0;
  if (n == 0) return sdEllipse(p, vec2(0.455, 0.511), vec2(0.165, 0.015), 0.0);
  float dp = sdEllipse(p, vec2(0.585, 0.782), vec2(0.235, 0.040), 0.0);
  // The stream leaves the pool's right side and widens toward you.
  vec2 A = vec2(0.74, 0.792), B = vec2(0.88, 0.860), C = vec2(0.99, 1.08);
  float ds = sdBezier(p, A, B, C, t);
  float hw = mix(0.024, 0.105, t * t);
  vec2 q = bez(A, B, C, clamp(t, 0.0, 1.0));
  vec2 q2 = bez(A, B, C, clamp(t + 0.01, 0.0, 1.0));
  vec2 tang = normalize(q2 - q + 1e-6);
  side = dot(p - q, vec2(-tang.y, tang.x)) / hw;
  return smin(dp, ds - hw, 0.03);
}
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  float t, side;
  float d = body(p, uN, t, side) + wobble(p, 45.0, 0.005);
  if (d > 0.016) { outColor = acc; return; }
  // A dark wet rim, and a few grey pebbles just outside the water.
  vec2 tc, id;
  float pv = voronoi(p * 95.0 + 3.0, tc, id);
  float outside = step(0.0, d);
  float rim = (1.0 - smoothstep(0.0, 0.008, d)) * outside;
  float pebble = step(0.72, id.y) * (1.0 - smoothstep(0.32, 0.44, pv)) * (1.0 - smoothstep(0.006, 0.013, d)) * outside;
  over(acc, vec3(0.14, 0.18, 0.28), rim * 0.6);
  over(acc, lit(mix(vec3(0.52, 0.50, 0.62), vec3(0.78, 0.76, 0.86), id.x), vec3(-tc * 1.6, 0.8), 1.0), pebble);
  float wa = fill(d);
  if (wa <= 0.0) { outColor = acc; return; }
  // Poured resin: pale at the rim, deep in the middle.
  float deep = smoothstep(0.0, uN == 0 ? 0.010 : 0.020, -d);
  vec3 c = mix(vec3(0.50, 0.90, 0.95), vec3(0.08, 0.40, 0.80), deep);
  // The sky's lilac caught along the far edge, the way a glossy surface takes the light.
  vec2 cen = uN == 0 ? vec2(0.455, 0.511) : vec2(0.585, 0.782);
  float farEdge = smoothstep(0.012, 0.0, -d) * step(p.y, cen.y) * (uN == 1 && t > 0.05 ? 0.0 : 1.0);
  c = mix(c, vec3(0.86, 0.82, 1.0), farEdge * 0.55);
  // Under each fall, its light carried into the water.
  vec2 hit = uN == 0 ? vec2(0.398, 0.509) : vec2(0.578, 0.775);
  float under = exp(-pow((p.x - hit.x) / (uN == 0 ? 0.05 : 0.08), 2.0)) * smoothstep(hit.y - 0.004, hit.y + 0.03, p.y) * (1.0 - smoothstep(hit.y + 0.02, hit.y + 0.06, p.y));
  c = mix(c, vec3(0.62, 0.94, 1.0), under * 0.45);
  if (uN == 1 && t > 0.02) {
    // The current: soft streaks along the stream, a step further downstream each frame.
    float s = vnoiseP(vec2(t * 18.0 - uFrame * 0.5, side * 3.0 + 9.0), vec2(3.0, 64.0));
    float s2 = vnoiseP(vec2(t * 30.0 - uFrame * (5.0 / 6.0), side * 7.0), vec2(5.0, 64.0));
    float inStream = smoothstep(0.02, 0.08, t);
    c = mix(c, vec3(0.62, 0.94, 1.0), smoothstep(0.60, 0.88, s) * 0.5 * inStream);
    c = mix(c, vec3(0.92, 1.0, 1.0), smoothstep(0.80, 0.95, s2) * 0.5 * inStream * (1.0 - smoothstep(0.55, 0.95, abs(side))));
    // Foam gathering softly along the banks.
    float bankFoam = smoothstep(0.72, 1.0, abs(side)) * smoothstep(0.45, 0.7, fbm3(vec2(t * 40.0 - uFrame * 0.8, side * 4.0)));
    c = mix(c, vec3(0.93, 0.97, 1.0), bankFoam * 0.7 * inStream);
  }
  // Ripple rings of clear plastic, one step wider each frame, spreading from where the fall lands.
  float e = length((p - hit) / vec2(1.0, uN == 0 ? 0.10 : 0.17));
  float spacing = uN == 0 ? 0.03 : 0.045;
  float ph = e / spacing - uFrame / 6.0;
  float k = floor(ph);
  float ring = 1.0 - smoothstep(0.035, 0.10, abs(fract(ph) - 0.5));
  float ang = atan((p.y - hit.y) / (uN == 0 ? 0.10 : 0.17), p.x - hit.x);
  float broken = smoothstep(0.28, 0.45, vnoise(vec2(ang * 1.6 + k * 2.3, k * 4.1 + 1.0)));
  float ringFade = (1.0 - smoothstep(1.0, uN == 0 ? 4.5 : 5.0, k + uFrame / 6.0)) * step(0.0, k) * (uN == 1 && t > 0.06 ? 0.0 : 1.0);
  c = mix(c, vec3(0.84, 0.98, 1.0), ring * broken * ringFade * 0.6);
  // Gloss: a handful of short painted dashes, in new places each frame.
  for (int g = 0; g < 4 * uOne; g++) {
    vec2 rnd = hash22(vec2(float(g) + float(uN) * 5.0, uFrame + 11.0));
    vec2 gc = cen + (rnd - 0.5) * (uN == 0 ? vec2(0.22, 0.012) : vec2(0.32, 0.05));
    vec2 gq = (p - gc) / vec2(0.012 + 0.01 * rnd.y, 0.0016);
    c = mix(c, vec3(1.0), (1.0 - smoothstep(0.6, 1.0, length(gq))) * 0.8);
  }
  c *= 0.97 + 0.05 * brush(p, 26.0);
  over(acc, c, wa * 0.97);
  outColor = acc;
}`;

  LB.art = LB.art || {};
  LB.art.lilac = { bakes: { lsky: SKY, lhills: HILLS, cliff: CLIFF, fall: FALL, water: WATER } };
})();
