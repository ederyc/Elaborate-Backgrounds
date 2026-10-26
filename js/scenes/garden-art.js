/*
  The garden study's bespoke art: the pieces too specific to be reusable
  elements (sky, clouds, the hill rows, the central mound and cliffs, the
  waterfall). Trees, bushes, flower clusters, grass and the swaying
  flowers are generic elements (js/elements.js) placed by garden.js.

  The layout comes from measuring the reference frames on a scene-unit
  grid; docs/RECIPE.md has the breakdown and the palette these colors
  start from. Everything is procedural.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  const SKY = `
void main() {
  vec2 p = scenePos();
  float t = p.y + (fbm(p * vec2(2.0, 6.0)) - 0.5) * 0.07;
  vec3 mint = vec3(0.64, 0.85, 0.86);
  vec3 peri = vec3(0.72, 0.78, 0.97);
  vec3 lav  = vec3(0.80, 0.75, 0.98);
  vec3 vio  = vec3(0.86, 0.72, 0.95);
  vec3 c = mix(mint, peri, smoothstep(0.10, 0.28, t));
  c = mix(c, lav, smoothstep(0.26, 0.40, t));
  c = mix(c, vio, smoothstep(0.38, 0.56, t));
  // The glow behind the clouds, top center.
  vec2 g = (p - vec2(0.95, 0.12)) * vec2(0.9, 2.2);
  c = mix(c, vec3(0.86, 0.95, 0.84), exp(-dot(g, g) * 5.0) * 0.55);
  c *= 0.96 + 0.07 * brush(p, 5.0);
  c *= 0.985 + 0.03 * paper(p);
  outColor = vec4(c, 1.0);
}`;

  const CLOUDS = `
float band(float y, float a, float b, float soft) { return smoothstep(a - soft, a, y) * (1.0 - smoothstep(b, b + soft, y)); }
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  float stroke = 0.8 + 0.2 * brush(p, 7.0);

  // Big periwinkle cloud banks, lit on top, shadowed underneath.
  vec2 q1 = vec2(p.x * 1.3, p.y * 5.0) + vec2(3.0, 0.0);
  float n1 = fbm(q1);
  float n1up = fbm(q1 - vec2(0.0, 0.09));
  float a1 = smoothstep(0.46, 0.6, n1) * band(p.y, 0.18, 0.34, 0.05);
  vec3 c1 = mix(vec3(0.56, 0.58, 0.88), vec3(0.86, 0.87, 1.0), smoothstep(-0.04, 0.07, n1 - n1up));
  over(acc, c1, a1 * 0.95 * stroke);

  // Mint and cream streaks catching the glow.
  vec2 q2 = vec2(p.x * 2.4, p.y * 9.0) + vec2(7.0, 1.0);
  float n2 = fbm(q2);
  float a2 = smoothstep(0.54, 0.66, n2) * band(p.y, 0.09, 0.27, 0.05);
  vec3 c2 = mix(vec3(0.78, 0.93, 0.88), vec3(0.96, 0.98, 0.88), smoothstep(0.6, 0.75, n2));
  over(acc, c2, a2 * 0.9 * stroke);

  // Pink-violet wisps low near the horizon.
  float n3 = vnoise(vec2(p.x * 3.0, p.y * 22.0) + 11.0) * 0.6 + vnoise(vec2(p.x * 7.0, p.y * 40.0)) * 0.4;
  float a3 = smoothstep(0.55, 0.75, n3) * band(p.y, 0.35, 0.45, 0.04);
  over(acc, vec3(0.92, 0.76, 0.93), a3 * 0.6 * stroke);

  outColor = acc;
}`;

  // The horizon: a distant tree line and a pale flower field.
  const HORIZON = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  float horizon = 0.476 + 0.006 * sin(p.x * 7.0);

  // Distant tree line: small round canopies along the horizon, hazy blue-green.
  if (p.x > 0.38 && p.x < 1.40) {
    // Trees stand in loose groups, each sitting on the horizon line.
    float cell = 0.016;
    float i0 = floor(p.x / cell);
    for (int k = -uOne; k <= uOne; k++) {
      float i = i0 + float(k);
      vec2 rnd = hash22(vec2(i, 3.0));
      if (vnoise(vec2(i * 0.18, 4.0)) < 0.42) continue;
      float r = 0.007 + 0.011 * rnd.y;
      vec2 c = vec2((i + 0.5 + 0.3 * (rnd.x - 0.5)) * cell, horizon + 0.003 - r * (0.6 + 0.5 * rnd.x));
      float d = length(p - c) - r + wobble(p, 160.0, 0.004);
      vec3 col = mix(vec3(0.42, 0.58, 0.66), vec3(0.58, 0.54, 0.82), rnd.y) * (0.9 + 0.2 * fuzz(p));
      over(acc, lit(col, vec3((p - c) / r * 0.7, 0.7), 1.0), fill(d));
    }
  }

  // Pale flower field right at the horizon.
  vec3 field = specks(p, vec3(0.82, 0.75, 0.94) * (0.95 + 0.1 * paper(p)), 260.0, 0.6,
                      vec3(0.99, 0.95, 0.99), vec3(0.97, 0.76, 0.88), 0.3);
  over(acc, field, fill(horizon - p.y + wobble(p, 60.0, 0.004)));
  outColor = acc;
}`;

  // Rows of rolling mounds covered in flowers, each closer, darker and more speckled. uN rows.
  const HILLS = `
const vec4 ROW[3] = vec4[3](vec4(0.492, 0.016, 6.3, 1.0), vec4(0.535, 0.026, 4.1, 0.3), vec4(0.60, 0.03, 3.3, 2.0));
const vec3 ROW_DARK[3] = vec3[3](vec3(0.40, 0.36, 0.68), vec3(0.27, 0.25, 0.52), vec3(0.20, 0.20, 0.40));
const vec3 ROW_LIGHT[3] = vec3[3](vec3(0.64, 0.58, 0.90), vec3(0.48, 0.44, 0.80), vec3(0.36, 0.36, 0.68));
const vec3 ROW_SPECK[3] = vec3[3](vec3(0.82, 0.74, 0.99), vec3(0.74, 0.62, 0.96), vec3(0.70, 0.58, 0.95));
const float ROW_SCALE[3] = float[3](46.0, 36.0, 28.0);
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  for (int r = 0; r < uN; r++) {
    vec4 row = ROW[r];
    float top = row.x + row.y * sin(p.x * row.z + row.w) + row.y * 0.45 * sin(p.x * row.z * 2.7 + row.w * 1.7);
    float d = top - p.y + wobble(p, 35.0, 0.006);
    if (d > 0.01) continue;
    vec3 c = carpet(p, ROW_DARK[r], ROW_LIGHT[r], top, ROW_SCALE[r], ROW_SPECK[r], vec3(0.98, 0.88, 0.96), 0.42 + 0.06 * float(r));
    float a = clamp(0.5 - (d + (fuzz(p) - 0.5) * 3.0 * uPx) / (1.4 * uPx), 0.0, 1.0);
    over(acc, c, a);
  }
  outColor = acc;
}`;

  // The center of the scene, as four paint steps (separate shaders compile in parallel):
  // nearer hills, the rock the water pours over, the mossy mound, the pool.
  const NEAR_HILLS = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  // Nearer indigo hills running in from the left.
  float top = 0.655 + 0.03 * sin(p.x * 4.2 + 0.6) + 0.012 * sin(p.x * 12.0);
  vec3 hill = carpet(p, vec3(0.20, 0.23, 0.46), vec3(0.38, 0.42, 0.76), top, 24.0, vec3(0.70, 0.62, 0.98), vec3(0.99, 0.86, 0.94), 0.5);
  over(acc, hill, fill(top - p.y + wobble(p, 30.0, 0.006)));
  outColor = acc;
}`;

  const ROCK = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  // Rock: behind the waterfall, the cliff to its right, and the rounded rock the small orchid grows from.
  float dR = max(max(1.18 - p.x, p.x - 1.40), 0.531 - p.y);
  dR = smin(dR, max(max(1.372 - p.x, p.x - 1.53), 0.528 - p.y), 0.02);
  dR = smin(dR, sdEllipse(p, vec2(1.49, 0.565), vec2(0.105, 0.06), 0.1), 0.03) + wobble(p, 28.0, 0.007);
  if (dR < 0.01) {
    vec3 rock = clay(p, vec3(0.22, 0.19, 0.36), vec3(0.38, 0.33, 0.55), 1.0 - 0.5 * smoothstep(0.55, 0.85, p.y));
    // Vertical runs and cracks, the way water stains a cliff.
    float run = vnoise(vec2(p.x * 160.0, p.y * 6.0));
    rock *= 0.8 + 0.3 * run;
    rock *= 1.0 - 0.35 * smoothstep(0.7, 0.9, vnoise(vec2(p.x * 70.0 + 5.0, p.y * 3.0)));
    // Moss clinging along the top edge.
    float th;
    vec3 moss = foliage(p, vec3(0.06, 0.12, 0.12), vec3(0.18, 0.34, 0.28), vec3(0.30, 0.50, 0.38), vec3(0.50, 0.70, 0.46), 90.0, th);
    float mossy = (1.0 - smoothstep(0.0, 0.03 + 0.03 * fbm3(p * 20.0), p.y - 0.528)) * smoothstep(0.3, 0.6, th);
    over(acc, mix(rock, moss, mossy), fill(dR));
  }
  outColor = acc;
}`;

  const MOUND = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  // The mound: a big rounded hill of dark, flowered moss, highest at the right where the water starts.
  // Painted after the rock so its rounded right side overlaps it.
  float k = smoothstep(1.25, 0.55, p.x);
  float mTop = 0.535 + 0.085 * k * k + 0.007 * sin(p.x * 26.0) + 0.004 * sin(p.x * 61.0);
  float mRight = p.x - (1.245 + 0.04 * smoothstep(0.55, 0.9, p.y) - 0.03 * (1.0 - smoothstep(0.53, 0.6, p.y)));
  float dM = max(mTop - p.y, mRight) + wobble(p, 30.0, 0.008);
  if (dM < 0.02) {
    float th;
    vec3 moss = foliage(p, vec3(0.05, 0.08, 0.13), vec3(0.15, 0.26, 0.30), vec3(0.27, 0.41, 0.42), vec3(0.48, 0.62, 0.52), 85.0, th);
    // Big soft swells, lit from the top left, so it reads as a hill and not a wall.
    float sw = fbm3(p * vec2(5.0, 7.0));
    float swUp = fbm3((p - vec2(0.012, 0.014)) * vec2(5.0, 7.0));
    moss *= 0.75 + 0.5 * sw + (swUp - sw) * 4.0;
    moss *= mix(vec3(1.0), vec3(0.70, 0.66, 1.0), smoothstep(0.62, 0.92, p.y));
    moss *= 1.0 + 0.25 * (1.0 - smoothstep(0.0, 0.05, p.y - mTop));
    moss = specks(p, moss, 150.0, 0.06, vec3(0.99, 0.90, 0.95), vec3(0.96, 0.66, 0.84), 0.34);
    over(acc, moss, fill(dM - (th - 0.45) * 0.01));
  }
  outColor = acc;
}`;

  const POOL = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  // The pool at the waterfall's foot.
  vec2 pq = (p - vec2(1.165, 0.868)) / vec2(0.18, 0.036);
  float dPool = (length(pq) - 1.0) * 0.036 + wobble(p, 40.0, 0.006);
  vec3 water = mix(vec3(0.32, 0.84, 0.99), vec3(0.10, 0.52, 0.88), smoothstep(0.3, 1.0, length(pq)));
  water *= 0.94 + 0.12 * brush(p, 18.0);
  over(acc, water, fill(dPool));
  outColor = acc;
}`;

  // Baked six times with uFrame 0..5; the frames cycle on the beat.
  const WATERFALL = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  float v = (p.y - 0.53) / 0.31;
  float vc = clamp(v, 0.0, 1.2);
  float xl = 1.272 - 0.135 * pow(vc, 1.5);
  float xr = 1.382 - 0.075 * pow(vc, 1.3);
  float u = (p.x - xl) / (xr - xl);
  float d = max(max(xl - p.x, p.x - xr), max(0.531 - p.y, p.y - 0.862));
  d += wobble(p, 30.0, 0.004);
  float a = fill(d);

  // Streaks travel down one full noise period over the six frames, so the cycle loops.
  float s1 = vnoiseP(vec2(u * 14.0, vc * 3.0 - uFrame * 0.5), vec2(64.0, 3.0));
  float s2 = vnoiseP(vec2(u * 7.0 + 3.0, vc * 2.0 - uFrame / 3.0), vec2(64.0, 2.0));
  vec3 body = mix(vec3(0.10, 0.60, 0.95), vec3(0.22, 0.75, 0.99), sin(clamp(u, 0.0, 1.0) * PI));
  vec3 c = mix(body, vec3(0.50, 0.90, 1.0), smoothstep(0.55, 0.85, s1) * 0.8);
  c = mix(c, vec3(0.72, 0.96, 1.0), smoothstep(0.7, 0.9, s2) * 0.6);
  c = mix(c, vec3(0.78, 0.97, 1.0), (1.0 - smoothstep(0.0, 0.06, v)) * 0.7); // the lip catches the light
  c *= 0.95 + 0.08 * brush(p, 20.0);
  over(acc, c, a);

  // Foam churning where the water lands: a new pattern each frame, like replacement pieces.
  float fy = (p.y - 0.848) / 0.018;
  float foamBand = exp(-fy * fy) * smoothstep(1.06, 1.12, p.x) * (1.0 - smoothstep(1.27, 1.33, p.x));
  float f = fbm3(p * vec2(60.0, 80.0) + vec2(uFrame * 3.7, uFrame * 1.3));
  float fa = smoothstep(0.45, 0.65, f * foamBand + foamBand * 0.25);
  over(acc, lit(vec3(0.90, 0.98, 1.0), vec3((f - 0.5) * 1.5, -0.5, 1.0), 1.0), fa);
  float my = (p.y - 0.83) / 0.03;
  float mist = exp(-my * my) * smoothstep(1.05, 1.12, p.x) * (1.0 - smoothstep(1.28, 1.34, p.x));
  over(acc, vec3(0.94, 0.99, 1.0), mist * (0.18 + 0.12 * fbm3(p * 30.0 + uFrame)));

  // Rings spreading across the pool, one period over the six frames.
  vec2 pq = (p - vec2(1.17, 0.868)) / vec2(0.18, 0.036);
  float inPool = 1.0 - smoothstep(0.85, 1.0, length(pq));
  float ring = sin(length((p - vec2(1.19, 0.85)) * vec2(1.0, 4.0)) * 110.0 - uFrame / 6.0 * 6.2832);
  over(acc, vec3(0.78, 0.96, 1.0), smoothstep(0.75, 1.0, ring) * inPool * 0.45 * step(0.855, p.y));

  outColor = acc;
}`;

  LB.art = LB.art || {};
  LB.art.garden = {
    bakes: { sky: SKY, clouds: CLOUDS, horizon: HORIZON, hills: HILLS, nearHills: NEAR_HILLS, rock: ROCK, mound: MOUND, pool: POOL, waterfall: WATERFALL },
  };
})();
