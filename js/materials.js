/*
  The procedural material library, shared by every bake shader.

  A "bake" renders one layer or sprite of a scene into a texture, once, at
  load. These functions are what make the baked art read as handmade: noise
  for uneven edges, fibers for felt, domed tufts for clumped foliage, grain
  for paper, dents for clay, beads, and one consistent light from the top left.

  Coordinates are scene units: y runs 0 (top) to 1 (bottom), x runs 0 to
  16/9. uPx is the size of one texture pixel in scene units, so anything
  "one pixel wide" stays one pixel wide at any bake resolution.

  Note for anyone editing: the Windows shader compiler inlines every call,
  so a function called in five places is compiled five times. Shaders that
  draw many things loop over them with a uniform count and call each
  function once.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  LB.MATERIALS_GLSL = `
#define PI 3.14159265
uniform vec4 uRect;   // scene rect this texture covers: x0, y0, x1, y1
uniform vec2 uRes;    // texture size in px
uniform float uPx;    // scene units per texture px
uniform float uSeed;  // varies per bake so repeated elements differ
uniform float uFrame; // frame index for cycle animations
uniform int uN;       // a count for shaders that loop over several things (a uniform, so the loop isn't unrolled)
uniform int uOne;     // always 1; used as a loop bound so the compiler keeps small loops as loops
uniform vec4 uXf;     // the item's own transform: move x, move y, scale, rotation (radians)
uniform vec2 uXfOrigin; // the point the item scales and rotates around (its center before moving)
out vec4 outColor;

// Texture row 0 holds the top of the rect, so the compositor samples without flips.
// The result is in the item's own coordinates: the item's transform is undone here, so every
// shader can be moved, scaled and rotated without knowing about it.
vec2 scenePos() {
  vec2 d = mix(uRect.xy, uRect.zw, gl_FragCoord.xy / uRes) - uXfOrigin - uXf.xy;
  float c = cos(uXf.w), s = sin(uXf.w);
  return uXfOrigin + vec2(c * d.x + s * d.y, -s * d.x + c * d.y) / uXf.z;
}

// ---- noise ----
float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}
vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), u.x),
             mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), u.x), u.y);
}
// Value noise that repeats every "period" lattice cells, for seamless cycles.
float vnoiseP(vec2 p, vec2 period) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  vec2 a = mod(i, period), b = mod(i + 1.0, period);
  return mix(mix(hash12(a), hash12(vec2(b.x, a.y)), u.x),
             mix(hash12(vec2(a.x, b.y)), hash12(b), u.x), u.y);
}
const mat2 ROT = mat2(1.6, 1.2, -1.2, 1.6);
float fbm(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = ROT * p; a *= 0.5; }
  return s / 0.97;
}
float fbm3(vec2 p) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) { s += a * vnoise(p); p = ROT * p; a *= 0.5; }
  return s / 0.875;
}
// Nearest feature point: returns distance; toCenter points from p to the cell's center; id is a per-cell random pair.
float voronoi(vec2 p, out vec2 toCenter, out vec2 id) {
  vec2 n = floor(p), f = fract(p);
  float md = 8.0;
  toCenter = vec2(0.0);
  id = vec2(0.0);
  for (int j = -uOne; j <= uOne; j++)
  for (int i = -uOne; i <= uOne; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 o = hash22(n + g);
    vec2 r = g + o - f;
    float d = dot(r, r);
    if (d < md) { md = d; toCenter = r; id = hash22(n + g + 17.0); }
  }
  return sqrt(md);
}

// ---- shape helpers (signed distances in scene units, negative inside) ----
float sdEllipse(vec2 p, vec2 c, vec2 r, float ang) {
  vec2 d = p - c;
  float cs = cos(ang), sn = sin(ang);
  d = vec2(cs * d.x + sn * d.y, -sn * d.x + cs * d.y);
  return (length(d / r) - 1.0) * min(r.x, r.y);
}
float sdSegment(vec2 p, vec2 a, vec2 b, float r) {
  vec2 pa = p - a, ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}
float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}
vec2 bez(vec2 a, vec2 b, vec2 c, float t) { return mix(mix(a, b, t), mix(b, c, t), t); }
// Distance to a quadratic bezier, as 16 straight segments; tOut is where the closest point sits.
float sdBezier(vec2 p, vec2 a, vec2 b, vec2 c, out float tOut) {
  float best = 1e9;
  tOut = 0.0;
  vec2 prev = a;
  for (int i = 1; i <= 16 * uOne; i++) {
    float t = float(i) / 16.0;
    vec2 q = bez(a, b, c, t);
    vec2 pa = p - prev, ba = q - prev;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
    float d = length(pa - ba * h);
    if (d < best) { best = d; tOut = t - (1.0 - h) / 16.0; }
    prev = q;
  }
  return best;
}

// Coverage from a signed distance, with a soft one-pixel edge.
float fill(float d) { return clamp(0.5 - d / (1.2 * uPx), 0.0, 1.0); }
// Handmade edge: wobble the distance with noise so nothing is a clean curve.
float wobble(vec2 p, float scale, float amount) { return (fbm3(p * scale + uSeed * 7.1) - 0.5) * amount; }

// Paint "c" with coverage "a" over what's been painted so far (premultiplied).
void over(inout vec4 acc, vec3 c, float a) { acc = vec4(c * a, a) + acc * (1.0 - a); }

// ---- materials ----
// Felt and wool: short fibers lying in three directions.
float fibers(vec2 p) {
  float s = 0.0;
  for (int i = 0; i < 3 * uOne; i++) {
    float a = float(i) * 2.1 + 0.4;
    vec2 q = mat2(cos(a), sin(a), -sin(a), cos(a)) * p;
    s += smoothstep(0.55, 0.95, vnoise(q * vec2(1.0, 7.0) + float(i) * 13.0));
  }
  return s / 3.0;
}
// Fiber noise at a fixed size on screen (about 1.5 px per fiber).
float fuzz(vec2 p) { return fibers(p / uPx * 0.35); }
// Paper grain, about two px per grain whatever the bake size.
float paper(vec2 p) {
  vec2 q = p / uPx;
  return 0.6 * vnoise(q * 0.5) + 0.4 * vnoise(q * 0.17 + 9.0);
}
// Brush strokes running mostly sideways.
float brush(vec2 p, float scale) {
  return vnoise(vec2(p.x * scale, p.y * scale * 14.0) + fbm3(p * scale * 0.5) * 3.0);
}

// ---- light ----
// One warm key from the top left, a cool fill from the right, soft ambient.
// A flat surface comes out close to its albedo.
const vec3 KEY_DIR = vec3(-0.53, -0.62, 0.58);
const vec3 FILL_DIR = vec3(0.72, 0.36, 0.6);
vec3 lit(vec3 albedo, vec3 n, float ao) {
  n = normalize(n);
  float k = max(dot(n, normalize(KEY_DIR)), 0.0);
  float f = max(dot(n, normalize(FILL_DIR)), 0.0);
  vec3 light = vec3(0.36) * ao + k * vec3(1.0, 0.93, 0.82) * 0.86 + f * vec3(0.72, 0.76, 1.0) * 0.26;
  return albedo * light;
}

// Clumped foliage (model-railroad clumps, lichen, teased wool): irregular
// tufts with fuzzy fibers and dark gaps. "height" (0..1) lets callers bump
// the silhouette with the tufts.
vec3 foliage(vec2 p, vec3 shadow, vec3 mid, vec3 light, vec3 tip, float scale, out float height) {
  vec2 q = p * scale + uSeed * 3.0;
  q += vec2(fbm3(q * 0.35), fbm3(q * 0.35 + 7.0)) * 0.9; // warp so the tufts don't line up in cells
  vec2 tc, id;
  float d = voronoi(q, tc, id);
  float r = 0.5 + 0.3 * id.x;
  float h = pow(max(1.0 - (d * d) / (r * r), 0.0), 0.6);
  vec2 tc2, id2;
  float d2 = voronoi(q * 2.6 + 5.0, tc2, id2);
  float h2 = pow(max(1.0 - d2 * d2 / 0.3, 0.0), 0.6);
  float fib = fibers(q * 4.0);
  height = clamp(h * 0.7 + h2 * 0.35 * h + (fib - 0.5) * 0.3, 0.0, 1.0);
  vec3 n = normalize(vec3(-tc * 1.3 - tc2 * 0.5 + (fib - 0.5) * 0.6, max(h, 0.2)));
  vec3 alb = mix(mid, light, clamp(id.y * 0.7 + fib * 0.5 - 0.1, 0.0, 1.0));
  alb *= 0.9 + 0.2 * id2.x;
  alb = mix(alb, tip, smoothstep(0.55, 1.0, h2 * h) * (0.25 + 0.55 * id.x));
  vec3 c = lit(alb, n, 0.35 + 0.65 * h);
  return mix(shadow, c, smoothstep(0.05, 0.4, height));
}

// Beads or tiny flowers scattered over a surface; "size" is in cell units.
vec3 specks(vec2 p, vec3 base, float scale, float density, vec3 c1, vec3 c2, float size) {
  vec2 tc, id;
  float d = voronoi(p * scale + 31.0 + uSeed, tc, id);
  float r = size * (0.7 + 0.6 * id.x);
  float on = step(id.y, density) * (1.0 - smoothstep(r * 0.6, r, d));
  vec3 col = mix(c1, c2, step(0.5, fract(id.x * 7.0)));
  col = lit(col, vec3(-tc / max(r, 0.01) * 0.9, 0.7), 1.0);
  return mix(base, col, on);
}

// A flowered carpet (flocking with beads): mottled base, soft clumps, two sizes of specks.
vec3 carpet(vec2 p, vec3 dark, vec3 light, float topY, float scale, vec3 c1, vec3 c2, float density) {
  vec2 tc, id;
  float d = voronoi(p * scale * vec2(1.0, 1.3), tc, id);
  float h = smoothstep(0.9, 0.1, d);
  vec3 alb = mix(light, dark, smoothstep(0.0, 0.1, p.y - topY));
  alb *= 0.85 + 0.25 * fbm3(p * scale * 0.4) + 0.1 * id.x;
  vec3 c = lit(alb, vec3(-tc * 0.5, 1.0), 0.75 + 0.25 * h);
  c *= 0.9 + 0.2 * fuzz(p);
  c = specks(p, c, scale * 4.0, density, c1, c2, 0.33);
  return specks(p + 0.37, c, scale * 7.0, density * 0.7, c2, c1 * 0.9 + 0.1, 0.3);
}

// Sculpted and painted bark: vertical streaks, grooves, knots, fingerprint dents.
// u runs 0..1 across the trunk for the round shading.
vec3 bark(vec2 p, vec3 base, float u) {
  float uc = clamp(u, 0.0, 1.0);
  vec3 n = normalize(vec3((uc - 0.5) * 3.0, 0.0, 1.0));
  float streak = vnoise(vec2(p.x * 220.0, p.y * 7.0));
  float streak2 = vnoise(vec2(p.x * 90.0 + 4.0, p.y * 3.0));
  float groove = smoothstep(0.62, 0.85, vnoise(vec2(p.x * 120.0 + 3.0, p.y * 4.0)));
  vec3 alb = base * (0.72 + 0.5 * streak * streak2) * (1.0 - 0.45 * groove);
  alb = mix(alb, base * vec3(1.25, 1.15, 1.35), smoothstep(0.7, 0.9, streak) * 0.5); // pale painted highlights
  alb *= 0.92 + 0.14 * fbm3(p * 80.0);
  float edge = 1.0 - pow(abs(uc - 0.5) * 2.0, 3.0);
  return lit(alb, n, 0.5 + 0.5 * edge);
}

// Painted clay: soft horizontal strata and thumb-smoothed dents.
vec3 clay(vec2 p, vec3 dark, vec3 light, float ao) {
  float s = vnoise(vec2(p.x * 7.0, p.y * 55.0));
  float s2 = vnoise(vec2(p.x * 7.0, (p.y + 0.004) * 55.0));
  float dent = fbm3(p * 45.0);
  float dentX = fbm3(p * 45.0 + vec2(0.01, 0.0));
  vec3 n = normalize(vec3((dentX - dent) * 6.0, (s2 - s) * 3.0 - 0.15, 1.0));
  vec3 alb = mix(dark, light, s * 0.6 + dent * 0.4);
  return lit(alb, n, ao);
}
`;
})();
