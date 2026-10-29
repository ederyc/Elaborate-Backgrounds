/*
  Elements for pieces people make themselves, in the editor or by hand in a
  scene file:

    shape   a cut-out: rectangle, ellipse, polygon or star, or a blob of
            round lobes. Filled with a material (paper, felt, clay,
            foliage, a two-color gradient, or a photo the user imported),
            with a rough cut edge, a fiber fuzz, a "puff" that shades it
            like a stuffed or sculpted piece, beads, and a soft shadow cast
            down and to the right, away from the scene's top-left light.
    image   an imported picture (a photographed cut-out, a drawing), with
            an optional color tint.

  Two more outlines come from the editor's customizer: "path", a cut-out
  through up to 32 points (optionally smoothed), and "mask", a cut-out
  taken from a picture: a photographed paper shape, say. The renderer turns
  the picture into a distance field once (renderer.js, buildMask), so a
  mask gets the same rough edge, puff and shadow as any other shape.

  "Boil photos": an image or mask can list boilImages, two or three photos
  of the same object nudged slightly. In a layer with a pose cycle they
  swap pose by pose, which is real boil, from real material.

  Both are drawn in their own coordinates, centered on (0, 0), and placed
  by the item transform (see js/items.js), so moving, scaling or rotating
  one never changes its shader inputs.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const rgb = (h) => LB.gl.rgb(h);

  const SHAPE = `
uniform int uShape;       // 0 rectangle, 1 ellipse, 2 polygon or star, 3 blob, 4 custom outline (points), 5 cut-out from a picture
uniform vec2 uHalf;       // half width, half height
uniform vec2 uMid;        // center of the outline box (blobs and custom outlines needn't be centered on 0, 0)
uniform sampler2D uMask;  // a picture's distance field, for cut-outs
uniform float uMaskPx;    // scene units per distance-field pixel
uniform vec4 uForm;       // corner roundness 0..1, sides, star depth 0..1, 0
uniform int uMat;         // 0 paper, 1 felt, 2 clay, 3 foliage, 4 gradient, 5 photo, 6 water, 7 sand, 8 stripes, 9 cardboard
uniform vec3 uCol1, uCol2;
uniform float uGrain;     // pattern size multiplier
uniform vec4 uLook;       // edge roughness (scene units), puff 0..1, shadow 0..1, fuzz 0..1
uniform float uPuffW;     // how far in from the edge the puff rounds over
uniform vec2 uShadowOff;  // shadow offset in the shape's own coordinates
uniform vec4 uSpeck;      // scale, density, size, on
uniform vec3 uSpeckA, uSpeckB;
uniform sampler2D uImage;
uniform vec4 uPhoto;      // tile width, tile height, tint amount, 0
uniform vec3 uLobes[8];
uniform int uLobeCount;
uniform float uMerge;
uniform vec2 uPts[32];    // custom outline, in the shape's own coordinates
uniform int uPtCount;
uniform vec4 uStripe;     // mode (0 bands across, 1 fan from a point), stripe width or count, fan center x, y

// Signed distance to a closed outline through uPts (negative inside).
float sdPath(vec2 p) {
  float d = dot(p - uPts[0], p - uPts[0]);
  float s = 1.0;
  int j = uPtCount - 1;
  for (int i = 0; i < uPtCount; i++) {
    vec2 e = uPts[j] - uPts[i], w = p - uPts[i];
    vec2 b = w - e * clamp(dot(w, e) / max(dot(e, e), 1e-9), 0.0, 1.0);
    d = min(d, dot(b, b));
    bool c1 = p.y >= uPts[i].y, c2 = p.y < uPts[j].y, c3 = e.x * w.y > e.y * w.x;
    if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) s = -s;
    j = i;
  }
  return s * sqrt(d);
}

float sdShape(vec2 p) {
  if (uShape == 0) {
    float r = uForm.x * min(uHalf.x, uHalf.y);
    vec2 q = abs(p) - uHalf + r;
    return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r;
  }
  if (uShape == 1) {
    vec2 r = max(uHalf, vec2(1e-4));
    float k0 = length(p / r), k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / max(k1, 1e-6);
  }
  if (uShape == 2) {
    // A regular polygon in unit space, squashed to the box. Star depth pulls the edge midpoints in.
    vec2 u = p / max(uHalf, vec2(1e-4));
    float an = PI / max(uForm.y, 3.0);
    float a = atan(u.x, -u.y);
    float bn = mod(a + an, 2.0 * an) - an;
    vec2 q = length(u) * vec2(cos(bn), abs(sin(bn)));
    vec2 A = vec2(1.0, 0.0), B = cos(an) * (1.0 - uForm.z * 0.75) * vec2(cos(an), sin(an));
    vec2 e = B - A, w = q - A;
    vec2 h = w - e * clamp(dot(w, e) / dot(e, e), 0.0, 1.0);
    float side = sign(e.x * w.y - e.y * w.x);
    return -side * length(h) * min(uHalf.x, uHalf.y);
  }
  if (uShape == 4) return sdPath(p) - uForm.x;
  if (uShape == 5) {
    // Distance field texels hold 128 + 4 x the distance in texels, so +-32 texels around the edge.
    vec2 uv = p / (2.0 * uHalf) + 0.5;
    float m = (texture(uMask, clamp(uv, 0.0, 1.0)).r * 255.0 - 128.0) / 4.0 * uMaskPx;
    vec2 q = abs(p) - uHalf;
    return max(m, length(max(q, 0.0)) + min(max(q.x, q.y), 0.0));
  }
  float d = 1e9;
  for (int i = 0; i < uLobeCount; i++) d = smin(d, length(p - uLobes[i].xy) - uLobes[i].z, uMerge);
  return d;
}

void main() {
  vec2 p = scenePos();
  float d = 1e9, ds = 1e9;
  int passes = uLook.z > 0.0 ? 2 : 1;
  for (int i = 0; i < passes; i++) {
    vec2 q = i == 0 ? p : p - uShadowOff;
    float v = sdShape(q) + wobble(q, 18.0, uLook.x);
    if (i == 0) d = v; else ds = v;
  }

  vec2 pp = p * uGrain + uSeed * 1.7;
  float tY = smoothstep(uMid.y - uHalf.y, uMid.y + uHalf.y, p.y);

  // Shared noise, each computed exactly once. The Windows shader compiler inlines every call site,
  // so one call per noise (with a scale picked by material) keeps this shader quick to compile.
  float pap = paper(p);
  float fz = fuzz(p);
  float br = brush(pp, uMat == 4 ? 6.0 : uMat == 6 ? 9.0 : uMat == 8 ? 25.0 : 30.0);
  float m1 = fbm3(pp * (uMat == 1 ? 24.0 : uMat == 2 ? 20.0 : uMat == 6 ? 3.0 : uMat == 7 ? 8.0 : 14.0));
  // Clay's dents are lit from their slope, taken from the screen-space change in m1.
  vec2 mSlope = vec2(dFdx(m1), dFdy(m1)) / max(20.0 * uGrain * uPx, 1e-6) * 0.39;
  vec2 nq = uMat == 6 ? vec2(pp.x * 7.0 + m1 * 2.0, pp.y * mix(170.0, 55.0, tY)) : uMat == 7 ? p / uPx * 0.8 : pp * (uMat == 2 ? 140.0 : 90.0);
  float n1 = vnoise(nq);

  float th = 0.5;
  vec3 c;
  if (uMat == 0) {
    c = uCol1 * (0.9 + 0.16 * pap) * (0.95 + 0.08 * br);
  } else if (uMat == 1) {
    c = uCol1 * (0.78 + 0.38 * fz) * (0.9 + 0.18 * m1);
  } else if (uMat == 2) {
    // Thumb-pressed clay: soft dents lit from the key light, and a slight mottle in the paint.
    vec3 cn = normalize(vec3(mSlope, 1.0));
    c = lit(uCol1 * (0.94 + 0.1 * m1), cn, 1.0) / lit(vec3(1.0), vec3(0.0, 0.0, 1.0), 1.0);
    c *= 0.98 + 0.04 * n1;
  } else if (uMat == 3) {
    c = foliage(p, uCol1 * 0.35, uCol1, min(uCol1 * 1.35 + 0.04, vec3(1.0)), uCol2, 90.0 * uGrain, th);
    d -= (th - 0.45) * 0.8 / (90.0 * uGrain);
  } else if (uMat == 4) {
    c = mix(uCol1, uCol2, tY) * (0.95 + 0.08 * pap) * (0.97 + 0.05 * br);
  } else if (uMat == 5) {
    vec3 ph = texture(uImage, p / uPhoto.xy + 0.5).rgb;
    float lum = dot(ph, vec3(0.299, 0.587, 0.114));
    c = mix(ph, clamp(uCol1 * lum * 2.0, 0.0, 1.0), uPhoto.z);
  } else if (uMat == 6) {
    // Painted water: far color to near color, with ripple strokes that crowd together toward the top (the distance).
    c = mix(uCol1, uCol2, tY);
    c = mix(c, min(c * 1.25 + 0.1, vec3(1.0)), smoothstep(0.62, 0.92, n1) * 0.7);
    c *= 0.9 + 0.1 * smoothstep(0.15, 0.45, n1);
    c *= 0.95 + 0.08 * br;
  } else if (uMat == 7) {
    // Sand: dry color to wet color down the piece, grains about a pixel each, soft ripples, a few darker grains.
    c = mix(uCol1, uCol2, tY);
    c *= 0.9 + 0.17 * (0.6 * n1 + 0.4 * pap);
    c *= 0.96 + 0.06 * sin(pp.y * 160.0 + m1 * 6.0);
    c *= 0.94 + 0.1 * m1;
    c = mix(c, c * 0.62, step(0.985, hash12(floor(p / uPx * 0.56))));
  } else if (uMat == 8) {
    // Stripes, painted by hand: bands across the piece, or a fan from a point (beach umbrellas).
    float u = uStripe.x < 0.5 ? p.y / max(uStripe.y, 1e-4) : atan(p.x - uStripe.z, p.y - uStripe.w) / (2.0 * PI) * uStripe.y;
    u += (m1 - 0.5) * 0.12;
    float band = smoothstep(0.47, 0.53, abs(fract(u) - 0.5) * 2.0);
    c = mix(uCol1, uCol2, band) * (0.92 + 0.12 * pap) * (0.96 + 0.06 * br);
  } else {
    // Cardboard: kraft fibers, faint corrugation showing through, a few darker flecks.
    c = uCol1 * (0.86 + 0.16 * fz) * (0.95 + 0.08 * m1);
    c *= 0.97 + 0.04 * sin(pp.x * 420.0);
    c = mix(c, uCol2, smoothstep(0.86, 0.95, n1) * 0.5);
  }
  if (uSpeck.w > 0.5) c = specks(p, c, uSpeck.x, uSpeck.y, uSpeckA, uSpeckB, uSpeck.z);

  // Puff: shade the piece as if its edges round over, lit by the scene's key light.
  // Screen-space derivatives give the outward direction of the edge in scene space, rotation included.
  vec2 g = vec2(dFdx(d), dFdy(d));
  float gLen = length(g);
  g = gLen > 0.0 ? g / gLen : vec2(0.0);
  float h = clamp(-d / uPuffW, 0.0, 1.0);
  vec3 n = vec3(g * uLook.y * pow(1.0 - h, 1.5) * 2.2, 1.0);
  c *= lit(vec3(1.0), n, 1.0) / lit(vec3(1.0), vec3(0.0, 0.0, 1.0), 1.0) * mix(1.0, 0.82 + 0.18 * h, uLook.y);

  float a = clamp(0.5 - (d + (fz - 0.5) * uLook.w * 5.0 * uPx) / (1.4 * uPx), 0.0, 1.0);
  float blur = 0.004 + 0.012 * uLook.z;
  float sa = uLook.z > 0.0 ? smoothstep(blur, -blur, ds) * 0.5 * min(uLook.z * 1.5, 1.0) : 0.0;
  vec4 acc = vec4(0.0);
  over(acc, vec3(0.07, 0.04, 0.1), sa);
  over(acc, c, a);
  outColor = acc;
}`;

  const IMAGE = `
uniform sampler2D uImage;
uniform vec2 uHalf;
uniform vec4 uTint;   // color, amount
void main() {
  vec2 uv = scenePos() / (2.0 * uHalf) + 0.5;
  if (uv.x < 0.0 || uv.y < 0.0 || uv.x > 1.0 || uv.y > 1.0) { outColor = vec4(0.0); return; }
  vec4 c = texture(uImage, uv);
  float lum = dot(c.rgb, vec3(0.299, 0.587, 0.114));
  c.rgb = mix(c.rgb, clamp(uTint.rgb * lum * 2.0, 0.0, 1.0), uTint.a);
  outColor = vec4(c.rgb * c.a, c.a);
}`;

  const SHAPES = ["rect", "ellipse", "polygon", "blob", "path", "mask"];
  const MATERIALS = ["paper", "felt", "clay", "foliage", "gradient", "photo", "water", "sand", "stripes", "cardboard"];

  const half = (el) => [Math.max(el.w || 0.2, 0.002) / 2, Math.max(el.h || 0.2, 0.002) / 2];
  function lobeBounds(el) {
    const ls = el.lobes && el.lobes.length ? el.lobes : [[0, 0, 0.1]];
    return [
      Math.min(...ls.map((l) => l[0] - l[2])), Math.min(...ls.map((l) => l[1] - l[2])),
      Math.max(...ls.map((l) => l[0] + l[2])), Math.max(...ls.map((l) => l[1] + l[2])),
    ];
  }
  // The points the shader draws: the control points, or with "smooth", a curve cut from them
  // (Chaikin corner cutting, as many passes as fit in 32 points).
  const DEFAULT_PTS = [[-0.1, -0.1], [0.1, -0.1], [0, 0.1]];
  function pathPoints(el) {
    let ps = el.points && el.points.length >= 3 ? el.points.slice(0, 32) : DEFAULT_PTS;
    if (el.smooth) {
      while (ps.length * 2 <= 32) {
        const out = [];
        for (let i = 0; i < ps.length; i++) {
          const a = ps[i], b = ps[(i + 1) % ps.length];
          out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        ps = out;
      }
    }
    return ps;
  }
  function pathBounds(el) {
    const ps = pathPoints(el);
    const r = el.round || 0;
    return [Math.min(...ps.map((p) => p[0])) - r, Math.min(...ps.map((p) => p[1])) - r, Math.max(...ps.map((p) => p[0])) + r, Math.max(...ps.map((p) => p[1])) + r];
  }
  // The shape's outline box, before roughness, fuzz and shadow.
  function outline(el) {
    if (el.shape === "blob") return lobeBounds(el);
    if (el.shape === "path") return pathBounds(el);
    const [hx, hy] = half(el);
    return [-hx, -hy, hx, hy];
  }
  // Rough edges are capped for small pieces, so a tiny shape keeps its outline.
  const roughAmp = (el) => {
    const b = outline(el);
    return (el.rough ?? 0.4) * Math.min(0.012, 0.12 * Math.min(b[2] - b[0], b[3] - b[1]) / 2);
  };
  const SHADOW_OFF = [0.012, 0.018]; // at shadow 1, in scene units: down and right, away from the key light

  // Every picture a shape may sample: its own, and its boil photos.
  const pictures = (el) => (el.image ? [el.image, ...(el.boilImages || [])] : []);
  const maskKey = (el, image = el.image) => `${image}|${(el.mask && el.mask.from) || "alpha"}|${(el.mask && el.mask.threshold) ?? 0.5}`;

  LB.ELEMENTS.shape = {
    glsl: SHAPE,
    images: (el) => (el.material === "photo" || el.shape === "mask" ? pictures(el) : []),
    masks: (el) => (el.shape === "mask" ? pictures(el).map((im) => ({ key: maskKey(el, im), image: im, from: (el.mask && el.mask.from) || "alpha", threshold: (el.mask && el.mask.threshold) ?? 0.5 })) : []),
    maskKey,
    pathPoints,
    outline,
    bbox(el) {
      const b = outline(el);
      const s = el.shadow || 0;
      const m = roughAmp(el) + 0.01 + (el.material === "foliage" ? 0.02 : 0);
      return [b[0] - m, b[1] - m, b[2] + m + (SHADOW_OFF[0] + 0.02) * s, b[3] + m + (SHADOW_OFF[1] + 0.02) * s];
    },
    set(gl, u, el, xf) {
      const b = outline(el);
      const hx = (b[2] - b[0]) / 2, hy = (b[3] - b[1]) / 2;
      gl.uniform1i(u.uShape, Math.max(0, SHAPES.indexOf(el.shape)));
      const boxed = el.shape === "blob" || el.shape === "path";
      gl.uniform2f(u.uHalf, ...(boxed ? [hx, hy] : half(el)));
      gl.uniform2f(u.uMid, ...(boxed ? [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2] : [0, 0]));
      const mask = el.shape === "mask" && LB.maskInfo ? LB.maskInfo(maskKey(el)) : null;
      gl.uniform1f(u.uMaskPx, mask ? (el.w || 0.2) / mask.w : 0.001);
      gl.uniform4f(u.uForm, el.shape === "path" ? el.round || 0 : el.corner ?? 0.15, el.sides ?? 5, el.shape === "polygon" ? el.star ?? 0 : 0, 0);
      if (el.shape === "path") {
        const pts = pathPoints(el);
        const flatP = new Float32Array(64);
        // Outline points are relative to the shape's center, so the box center has to be (0, 0) for them too.
        pts.forEach((pt, i) => flatP.set(pt, i * 2));
        gl.uniform2fv(u.uPts, flatP);
        gl.uniform1i(u.uPtCount, pts.length);
      } else gl.uniform1i(u.uPtCount, 0);
      const st = el.stripes || {};
      gl.uniform4f(u.uStripe, st.fan ? 1 : 0, st.fan ? st.count ?? 12 : st.width ?? 0.03, ...(st.center || [0, b[1]]));
      gl.uniform1i(u.uMat, Math.max(0, MATERIALS.indexOf(el.material)));
      const [c1, c2] = el.colors || ["#8A6FB8", "#E9C6E2"];
      gl.uniform3f(u.uCol1, ...rgb(c1));
      gl.uniform3f(u.uCol2, ...rgb(c2 || c1));
      gl.uniform1f(u.uGrain, el.grain ?? 1);
      const s = el.shadow || 0;
      gl.uniform4f(u.uLook, roughAmp(el), el.puff ?? 0.3, s, el.fuzz ?? 0.3);
      gl.uniform1f(u.uPuffW, Math.max(0.004, Math.min(hx, hy) * 0.6));
      // The shadow falls the same way in the scene whatever the shape's rotation, so undo the rotation here.
      const r = (xf && xf.r) || 0, k = (xf && xf.s) || 1;
      const ox = SHADOW_OFF[0] * s, oy = SHADOW_OFF[1] * s;
      gl.uniform2f(u.uShadowOff, (Math.cos(r) * ox + Math.sin(r) * oy) / k, (-Math.sin(r) * ox + Math.cos(r) * oy) / k);
      const sp = el.specks;
      if (sp && sp.on !== false) {
        gl.uniform4f(u.uSpeck, sp.scale ?? 150, sp.density ?? 0.2, sp.size ?? 0.3, 1);
        gl.uniform3f(u.uSpeckA, ...rgb(sp.colors[0]));
        gl.uniform3f(u.uSpeckB, ...rgb(sp.colors[1] || sp.colors[0]));
      } else gl.uniform4f(u.uSpeck, 1, 0, 0, 0);
      const tile = el.tile || 0.4;
      const img = el.material === "photo" && LB.imageInfo ? LB.imageInfo(el.image) : null;
      const aspect = img ? img.h / img.w : 1;
      // A cut-out filled with its own picture shows that picture once, edge to edge, not tiled.
      if (el.shape === "mask" && el.material === "photo") gl.uniform4f(u.uPhoto, ...half(el).map((v) => v * 2), el.tint ?? 0, 0);
      else gl.uniform4f(u.uPhoto, tile, tile * aspect, el.tint ?? 0, 0);
      const flat = new Float32Array(24);
      (el.lobes || []).slice(0, 8).forEach((l, i) => flat.set(l, i * 3));
      gl.uniform3fv(u.uLobes, flat);
      gl.uniform1i(u.uLobeCount, Math.min(8, (el.lobes || []).length));
      gl.uniform1f(u.uMerge, el.merge ?? 0.03);
    },
  };

  LB.ELEMENTS.image = {
    glsl: IMAGE,
    images: pictures,
    bbox(el) {
      const [hx, hy] = half(el);
      return [-hx, -hy, hx, hy];
    },
    set(gl, u, el) {
      gl.uniform2f(u.uHalf, ...half(el));
      gl.uniform4f(u.uTint, ...rgb(el.tintColor || "#FFFFFF"), el.tint ?? 0);
    },
  };

  LB.SHAPE_KINDS = SHAPES;
  LB.SHAPE_MATERIALS = MATERIALS;
})();
