/*
  Reusable art elements. A layer's "paint" list is drawn into its texture
  in order, one draw per element, blended over what's already there. Any
  scene can use these; only the numbers change.

    canopy    round lobes covered in clumped foliage, optional beads
    florets   round lobes covered in tiny four-petal flowers (hydrangea)
    trunk     a sculpted, painted trunk with a flared base
    branch    a straight limb
    turf      ground under a line through up to 8 points: grass or a flowered carpet
    fuzz      a fuzzy felt ball

  Sprites (flowers and leaves that sway) have their own shader at the bottom:
  petals are a list the shader loops over, so one shader covers daisies,
  tulips, orchids and open blooms.

  Each element has a GLSL body, a function that sets its uniforms, and a
  bounding box so its draw only touches the pixels it can cover.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const rgb = (h) => LB.gl.rgb(h);

  const LOBES = `
uniform vec3 uLobes[8];
uniform int uLobeCount;
uniform float uMerge;
// Smooth union of the lobes; "big" and "bigN" describe the lobe the point sits deepest in.
float lobes(vec2 p, out float big, out vec2 bigN) {
  float d = 1e9;
  big = 0.0;
  bigN = vec2(0.0, -1.0);
  for (int i = 0; i < uLobeCount; i++) {
    vec3 l = uLobes[i];
    float r = length(p - l.xy);
    d = smin(d, r - l.z, uMerge);
    float h = sqrt(max(1.0 - (r * r) / (l.z * l.z), 0.0));
    if (h > big) { big = h; bigN = (p - l.xy) / l.z; }
  }
  return d;
}
// A silhouette edge broken up by fibers over a few px.
float fuzzyEdge(float d, vec2 p, float amount) {
  return clamp(0.5 - (d + (fuzz(p) - 0.5) * amount * uPx) / (1.6 * uPx), 0.0, 1.0);
}`;

  const CANOPY = LOBES + `
uniform vec3 uShadow, uMid, uLight, uTip, uTip2;
uniform float uScale;
uniform vec2 uTipBand;   // above y = x the tips shift toward uTip2, over a fade of y (0 = off)
uniform vec4 uSpeck;     // scale, density, size, on
uniform vec3 uSpeckA, uSpeckB;
void main() {
  vec2 p = scenePos();
  float big;
  vec2 bigN;
  float d = lobes(p, big, bigN);
  if (d > 0.04) { outColor = vec4(0.0); return; }
  vec3 tip = uTipBand.y > 0.0 ? mix(uTip, uTip2, smoothstep(uTipBand.x + uTipBand.y, uTipBand.x, p.y)) : uTip;
  float th;
  vec3 c = foliage(p, uShadow, uMid, uLight, tip, uScale, th);
  if (uSpeck.w > 0.5) c = specks(p, c, uSpeck.x, uSpeck.y, uSpeckA, uSpeckB, uSpeck.z);
  d -= (th - 0.45) * 1.2 / uScale + wobble(p, 16.0, 0.014);
  float a = fuzzyEdge(d, p, 4.0);
  vec3 nBig = normalize(vec3(bigN * 1.1, max(big, 0.25)));
  float shade = clamp(dot(nBig, normalize(KEY_DIR)) * 0.85 + 0.42, 0.32, 1.25);
  outColor = vec4(c * shade * a, a);
}`;

  const FLORETS = LOBES + `
uniform vec3 uC1, uC2, uGap;
uniform float uScale;
void main() {
  vec2 p = scenePos();
  float big;
  vec2 bigN;
  float d = lobes(p, big, bigN);
  if (d > 0.03) { outColor = vec4(0.0); return; }
  vec2 tc, id;
  vec2 q = p * uScale + uSeed * 5.0;
  q += (vec2(vnoise(q * 0.5), vnoise(q * 0.5 + 3.0)) - 0.5) * 0.6;
  float v = voronoi(q, tc, id);
  float ang = atan(tc.y, tc.x);
  float petals = 0.62 + 0.38 * cos(ang * 4.0 + id.y * 6.283);
  float h = smoothstep(0.78 * petals, 0.2 * petals, v);
  vec3 alb = mix(uC1, uC2, id.x) * (0.9 + 0.2 * fuzz(p));
  vec3 c = lit(alb, vec3(-tc * 0.7, 1.0), 0.65 + 0.35 * h);
  c *= 1.0 - 0.3 * smoothstep(0.12, 0.0, v); // tiny eye in each floret
  c = mix(uGap, c, h);
  d -= (h - 0.5) * 0.6 / uScale + wobble(p, 22.0, 0.016);
  float a = fuzzyEdge(d, p, 2.5);
  vec3 nBig = normalize(vec3(bigN, max(big, 0.3)));
  float shade = clamp(dot(nBig, normalize(KEY_DIR)) * 0.3 + 0.8, 0.6, 1.1);
  outColor = vec4(c * shade * a, a);
}`;

  const TRUNK = `
uniform vec4 uTrunk;   // center x, bend, half width, flare at the base
uniform vec2 uSpan;    // top y, bottom y
uniform vec3 uColor;
void main() {
  vec2 p = scenePos();
  float t = clamp((p.y - uSpan.x) / (uSpan.y - uSpan.x), 0.0, 1.0);
  float c = uTrunk.x + uTrunk.y * sin(t * 2.4);
  float w = uTrunk.z * (1.0 + 0.12 * sin(t * 7.0 + uTrunk.x * 10.0)) + uTrunk.w * pow(t, 4.0);
  float u = (p.x - c) / w * 0.5 + 0.5;
  float d = max(abs(p.x - c) - w, uSpan.x - p.y) + wobble(p, 40.0, 0.004);
  outColor = vec4(0.0);
  over(outColor, bark(p, uColor, u), fill(d));
}`;

  const BRANCH = `
uniform vec2 uA, uB;
uniform float uR;
uniform vec3 uColor;
void main() {
  vec2 p = scenePos();
  vec2 ba = uB - uA;
  float h = clamp(dot(p - uA, ba) / dot(ba, ba), 0.0, 1.0);
  vec2 side = normalize(vec2(-ba.y, ba.x));
  float r = uR * (1.0 - 0.35 * h);
  float across = dot(p - uA - ba * h, side) / r;
  float d = length(p - uA - ba * h) - r + wobble(p, 40.0, 0.003);
  outColor = vec4(0.0);
  over(outColor, bark(p, uColor, across * 0.5 + 0.5), fill(d));
}`;

  const TURF = `
uniform vec2 uPts[8];
uniform int uPtCount;
uniform vec3 uTop, uBottom;
uniform float uFade, uStyle, uScale;   // style 0: grass, 1: flowered carpet
uniform vec4 uSpeck;                   // scale, density, size, on
uniform vec3 uSpeckA, uSpeckB;
void main() {
  vec2 p = scenePos();
  vec2 first = uPts[0], last = uPts[uPtCount - 1];
  float top = first.y;
  for (int i = 0; i < uPtCount - 1; i++) {
    vec2 a = uPts[i], b = uPts[i + 1];
    if (p.x >= a.x && p.x <= b.x) {
      float t = (p.x - a.x) / (b.x - a.x);
      top = mix(a.y, b.y, t * t * (3.0 - 2.0 * t));
    }
  }
  if (p.x > last.x) top = last.y;
  top += 0.005 * sin(p.x * 31.0 + uSeed) + wobble(p, 45.0, 0.008);
  float side = smoothstep(first.x - 0.015, first.x + 0.015, p.x) * (1.0 - smoothstep(last.x - 0.015, last.x + 0.015, p.x));
  vec3 c;
  if (uStyle > 0.5) {
    c = carpet(p, uBottom, uTop, top, uScale, uSpeckA, uSpeckB, uSpeck.y);
  } else {
    c = mix(uTop, uBottom, smoothstep(0.0, uFade, p.y - top));
    c *= 0.8 + 0.32 * fuzz(p) + 0.08 * vnoise(p * 90.0);
    c = mix(c, uTop * 1.18, (1.0 - smoothstep(0.0, 0.012, p.y - top)) * 0.5); // light catching the top edge
    if (uSpeck.w > 0.5) c = specks(p, c, uSpeck.x, uSpeck.y, uSpeckA, uSpeckB, uSpeck.z);
  }
  float a = clamp(0.5 - (top - p.y + (fuzz(p) - 0.5) * 3.0 * uPx) / (1.4 * uPx), 0.0, 1.0) * side;
  outColor = vec4(c * a, a);
}`;

  const FUZZ = `
uniform vec2 uCenter, uRadii;
uniform vec3 uColor;
void main() {
  vec2 p = scenePos();
  vec2 q = (p - uCenter) / uRadii;
  float d = (length(q) - 1.0) * min(uRadii.x, uRadii.y) + wobble(p, 120.0, 0.006);
  float z = sqrt(max(1.0 - dot(q, q), 0.05));
  vec3 c = lit(uColor * (0.75 + 0.4 * fuzz(p)), vec3(q * 0.8, z), 1.0);
  float a = clamp(0.5 - (d + (fuzz(p) - 0.5) * 4.0 * uPx) / (1.6 * uPx), 0.0, 1.0);
  outColor = vec4(c * a, a);
}`;

  // ---- sprites ----
  const SPRITE = `
uniform int uKind;          // 0 flower (petal list), 1 leaf
uniform vec2 uA, uB, uC;    // stem base, stem bend, flower center (leaf tip for leaves)
uniform float uSize;        // leaf width
uniform vec3 uCol1, uCol2, uCol3;
uniform int uPetalCount;
uniform vec4 uPetal[16];    // angle, length, width, fuzz
uniform vec3 uPetalPos[16]; // offset from center (x, y), tone
uniform float uSquash;      // >1 flattens the flower toward the viewer
uniform vec4 uCenter;       // radius, style (0 none, 1 felt disc, 2 orchid column, 3 dark eye), 0, 0

// A teardrop petal from c out along ang. k is the normalized distance (0 at the edge).
float petalShape(vec2 p, vec2 c, float ang, float len, float wid, out float k, out vec2 lp, out float w) {
  vec2 dir = vec2(cos(ang), sin(ang));
  vec2 q = p - c;
  lp = vec2(dot(q, dir), dot(q, vec2(-dir.y, dir.x)));
  float t = clamp(lp.x / len, 0.0, 1.0);
  w = wid * (0.3 + 0.7 * sin(t * PI * 0.92 + 0.12)) * (1.0 - 0.25 * smoothstep(0.7, 1.0, t));
  vec2 e = vec2((lp.x - len * 0.5) / (len * 0.5), lp.y / max(w, 1e-4));
  k = length(e) - 1.0;
  return k * min(len * 0.5, w);
}

void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  float t;
  float dc = sdBezier(p, uA, uB, uC, t);
  vec2 q = bez(uA, uB, uC, t);

  if (uKind == 1) {
    // Leaf: a tapered blade along the curve, bright and a little see-through, like resin.
    float w = uSize * pow(sin(t * PI * 0.96 + 0.04), 0.7) * (1.0 - 0.3 * t);
    float d = dc - w + wobble(p, 90.0, 0.0012);
    vec2 tang = normalize(bez(uA, uB, uC, min(t + 0.02, 1.0)) - bez(uA, uB, uC, max(t - 0.02, 0.0)) + 1e-6);
    vec2 side = vec2(-tang.y, tang.x);
    float across = dot(p - q, side) / max(w, 1e-4);
    vec3 c = mix(uCol2, uCol1, smoothstep(0.1, 1.0, abs(across)));
    c = mix(c, uCol3, (1.0 - smoothstep(0.0, 0.12, abs(across))) * 0.6);
    c = lit(c, vec3(side * across * 0.6, 1.0), 1.0);
    c += vec3(0.25, 0.3, 0.2) * smoothstep(0.5, 0.8, -across) * smoothstep(0.2, 0.6, t) * 0.6;
    over(acc, c, fill(d) * 0.92);
    outColor = acc;
    return;
  }

  // Stem: a rounded green cylinder, thicker at the base.
  float r = mix(0.0048, 0.0028, t);
  vec2 off = p - q;
  float x = clamp(length(off) / r, 0.0, 1.0);
  vec3 sn = vec3(normalize(off + 1e-6) * x, sqrt(1.0 - x * x));
  over(acc, lit(mix(vec3(0.18, 0.40, 0.22), vec3(0.32, 0.60, 0.30), t), sn, 1.0), fill(dc - r + wobble(p, 80.0, 0.001)));

  vec2 c = uC;
  vec2 pf = c + (p - c) * vec2(1.0, uSquash);
  for (int i = 0; i < uPetalCount; i++) {
    vec4 pt = uPetal[i];
    vec3 pp = uPetalPos[i];
    float k, w;
    vec2 lp;
    float d = petalShape(pf, c + pp.xy, pt.x, pt.y, pt.z, k, lp, w) + wobble(p, 220.0, pt.y * 0.06);
    float a = fill(d);
    if (a <= 0.0) continue;
    float tt = clamp(lp.x / pt.y, 0.0, 1.0);
    float across = clamp(lp.y / max(w, 1e-4), -1.0, 1.0);
    vec3 col = mix(uCol1, uCol2, smoothstep(0.15, 1.0, tt)) * pp.z;
    col *= 0.82 + 0.3 * vnoise(vec2(tt * 5.0 + float(i) * 3.1, across * 7.0));   // veins and streaks
    col *= mix(1.0, 0.82 + 0.34 * fuzz(p), pt.w);                                 // felt or silk
    col = mix(col, uCol3, smoothstep(-0.22, 0.0, k) * 0.5);                       // pale, see-through rim
    vec2 dir = vec2(cos(pt.x), sin(pt.x));
    col = lit(col, vec3(vec2(-dir.y, dir.x) * across * 0.75 + dir * (tt - 0.4) * 0.5, 1.0), 1.0);
    over(acc, col, a);
  }

  if (uCenter.y > 0.5) {
    float rr = uCenter.x;
    float dd = length(pf - c) - rr + wobble(p, 300.0, rr * 0.15);
    vec3 n = vec3((pf - c) / rr * 0.7, 0.7);
    vec3 cc = uCenter.y < 1.5 ? uCol3 * (0.8 + 0.35 * fuzz(p))
            : uCenter.y < 2.5 ? mix(uCol3, uCol2, 0.35)
            : uCol1 * 0.4;
    over(acc, lit(cc, n, 1.0), fill(dd));
  }
  outColor = acc;
}`;

  // Petal lists per flower kind: [angle, length, width, fuzz], [x, y, tone] (in units of size).
  function petals(kind, S, tilt, seed) {
    const out = [];
    const jitter = (i) => (Math.sin(i * 12.9898 + seed * 78.233) * 43758.5453) % 1;
    const add = (ang, len, wid, fz, x = 0, y = 0, tone = 1) => out.push([ang + tilt, len * S, wid * S, fz, x * S, y * S, tone]);
    const up = -Math.PI / 2;
    if (kind === "daisy") {
      for (let i = 0; i < 11; i++) add((i / 11) * Math.PI * 2 + jitter(i) * 0.2, 1, 0.36, 0.9);
    } else if (kind === "tulip") {
      add(up, 1.45, 0.55, 0.3, 0, 0.25, 0.72);
      add(up - 0.32, 1.35, 0.5, 0.3, -0.08, 0.25, 1.0);
      add(up + 0.32, 1.35, 0.5, 0.3, 0.08, 0.25, 1.04);
    } else if (kind === "orchid") {
      add(up - 0.15, 0.95, 0.4, 0.15, 0, 0, 0.82);               // dorsal sepal
      add(Math.PI / 2 - 0.45, 1.3, 0.36, 0.15, 0, 0, 0.88);      // lower sepals, drooping
      add(Math.PI / 2 + 0.75, 0.95, 0.32, 0.15, 0, 0, 0.82);
      add(up - 1.05, 1.35, 0.56, 0.15, 0, 0, 1.0);               // the two big petals in a V
      add(up + 0.8, 1.3, 0.54, 0.15, 0, 0, 1.05);
      add(Math.PI / 2 + 0.1, 0.55, 0.3, 0.1, 0, 0.08, 0.55);     // dark lip
    } else if (kind === "bloom") {
      for (let i = 0; i < 8; i++) add((i / 8) * Math.PI * 2 + jitter(i) * 0.3, 1, 0.62, 0.25, 0, 0, 0.88);
      for (let i = 0; i < 5; i++) add((i / 5) * Math.PI * 2 + 0.6, 0.6, 0.5, 0.25, 0, 0, 1.0);
    }
    return out;
  }
  const FLOWER = {
    daisy: { squash: 1.15, center: [0.34, 1] },
    tulip: { squash: 1.0, center: [0, 0] },
    orchid: { squash: 1.0, center: [0.11, 2] },
    bloom: { squash: 1.35, center: [0.14, 3] },
  };

  function setLobes(gl, u, el) {
    const flat = new Float32Array(24);
    el.lobes.forEach((l, i) => flat.set(l, i * 3));
    gl.uniform3fv(u.uLobes, flat);
    gl.uniform1i(u.uLobeCount, el.lobes.length);
    gl.uniform1f(u.uMerge, el.merge ?? 0.03);
  }
  function setSpeck(gl, u, s) {
    if (s) {
      gl.uniform4f(u.uSpeck, s.scale, s.density, s.size ?? 0.3, 1);
      gl.uniform3f(u.uSpeckA, ...rgb(s.colors[0]));
      gl.uniform3f(u.uSpeckB, ...rgb(s.colors[1]));
    } else {
      gl.uniform4f(u.uSpeck, 1, 0, 0, 0);
    }
  }
  const lobeBox = (el, m) => {
    const xs = el.lobes.flatMap((l) => [l[0] - l[2], l[0] + l[2]]);
    const ys = el.lobes.flatMap((l) => [l[1] - l[2], l[1] + l[2]]);
    return [Math.min(...xs) - m, Math.min(...ys) - m, Math.max(...xs) + m, Math.max(...ys) + m];
  };

  LB.ELEMENTS = {
    canopy: {
      glsl: CANOPY,
      bbox: (el) => lobeBox(el, 0.05),
      set(gl, u, el) {
        setLobes(gl, u, el);
        const [shadow, mid, light, tip, tip2] = el.colors;
        gl.uniform3f(u.uShadow, ...rgb(shadow));
        gl.uniform3f(u.uMid, ...rgb(mid));
        gl.uniform3f(u.uLight, ...rgb(light));
        gl.uniform3f(u.uTip, ...rgb(tip));
        gl.uniform3f(u.uTip2, ...rgb(tip2 || tip));
        gl.uniform2f(u.uTipBand, ...(el.tipBand || [0, 0]));
        gl.uniform1f(u.uScale, el.scale);
        setSpeck(gl, u, el.specks);
      },
    },
    florets: {
      glsl: FLORETS,
      bbox: (el) => lobeBox(el, 0.035),
      set(gl, u, el) {
        setLobes(gl, u, { merge: 0.015, ...el });
        gl.uniform3f(u.uC1, ...rgb(el.colors[0]));
        gl.uniform3f(u.uC2, ...rgb(el.colors[1]));
        gl.uniform3f(u.uGap, ...rgb(el.colors[2]));
        gl.uniform1f(u.uScale, el.scale);
      },
    },
    trunk: {
      glsl: TRUNK,
      bbox: (el) => [el.x - el.width - el.flare - Math.abs(el.bend) - 0.02, el.top - 0.01, el.x + el.width + el.flare + Math.abs(el.bend) + 0.02, el.bottom + 0.01],
      set(gl, u, el) {
        gl.uniform4f(u.uTrunk, el.x, el.bend, el.width, el.flare);
        gl.uniform2f(u.uSpan, el.top, el.bottom);
        gl.uniform3f(u.uColor, ...rgb(el.color));
      },
    },
    branch: {
      glsl: BRANCH,
      bbox: (el) => [Math.min(el.a[0], el.b[0]) - el.r - 0.01, Math.min(el.a[1], el.b[1]) - el.r - 0.01, Math.max(el.a[0], el.b[0]) + el.r + 0.01, Math.max(el.a[1], el.b[1]) + el.r + 0.01],
      set(gl, u, el) {
        gl.uniform2f(u.uA, ...el.a);
        gl.uniform2f(u.uB, ...el.b);
        gl.uniform1f(u.uR, el.r);
        gl.uniform3f(u.uColor, ...rgb(el.color));
      },
    },
    turf: {
      glsl: TURF,
      bbox: (el) => [el.points[0][0] - 0.02, Math.min(...el.points.map((p) => p[1])) - 0.02, el.points[el.points.length - 1][0] + 0.02, 2],
      set(gl, u, el) {
        const flat = new Float32Array(16);
        el.points.forEach((pt, i) => flat.set(pt, i * 2));
        gl.uniform2fv(u.uPts, flat);
        gl.uniform1i(u.uPtCount, el.points.length);
        gl.uniform3f(u.uTop, ...rgb(el.colors[0]));
        gl.uniform3f(u.uBottom, ...rgb(el.colors[1]));
        gl.uniform1f(u.uFade, el.fade ?? 0.08);
        gl.uniform1f(u.uStyle, el.style === "carpet" ? 1 : 0);
        gl.uniform1f(u.uScale, el.scale ?? 30);
        setSpeck(gl, u, el.specks);
      },
    },
    fuzz: {
      glsl: FUZZ,
      bbox: (el) => [el.center[0] - el.radii[0] - 0.01, el.center[1] - el.radii[1] - 0.01, el.center[0] + el.radii[0] + 0.01, el.center[1] + el.radii[1] + 0.01],
      set(gl, u, el) {
        gl.uniform2f(u.uCenter, ...el.center);
        gl.uniform2f(u.uRadii, ...el.radii);
        gl.uniform3f(u.uColor, ...rgb(el.color));
      },
    },
  };

  LB.SPRITE = {
    glsl: SPRITE,
    bbox(L) {
      const pts = [L.a, L.b, L.c];
      const reach = L.flower ? L.size * 1.75 : L.size * 1.3;
      const m = 0.012;
      const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
      return [Math.min(...xs) - reach - m, Math.min(...ys) - reach - m, Math.max(...xs) + reach + m, Math.max(...ys) + reach + m];
    },
    set(gl, u, L) {
      gl.uniform2f(u.uA, ...L.a);
      gl.uniform2f(u.uB, ...L.b);
      gl.uniform2f(u.uC, ...L.c);
      gl.uniform3f(u.uCol1, ...rgb(L.colors[0]));
      gl.uniform3f(u.uCol2, ...rgb(L.colors[1]));
      gl.uniform3f(u.uCol3, ...rgb(L.colors[2]));
      if (!L.flower) {
        gl.uniform1i(u.uKind, 1);
        gl.uniform1f(u.uSize, L.size);
        gl.uniform1i(u.uPetalCount, 0);
        return;
      }
      gl.uniform1i(u.uKind, 0);
      const list = petals(L.flower, L.size, L.tilt || 0, L.index || 0);
      const a = new Float32Array(64), b = new Float32Array(48);
      list.forEach((pt, i) => { a.set(pt.slice(0, 4), i * 4); b.set(pt.slice(4, 7), i * 3); });
      gl.uniform4fv(u.uPetal, a);
      gl.uniform3fv(u.uPetalPos, b);
      gl.uniform1i(u.uPetalCount, list.length);
      const f = FLOWER[L.flower];
      gl.uniform1f(u.uSquash, f.squash);
      gl.uniform4f(u.uCenter, f.center[0] * L.size, f.center[1], 0, 0);
    },
  };
})();
