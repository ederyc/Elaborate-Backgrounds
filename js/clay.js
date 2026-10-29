/*
  3D clay pieces: a sculpt made of up to 16 rounded parts that blend into
  each other like pressed clay, raymarched once per pose when the layer
  bakes. Then it's a flat texture like everything else, so a 3D piece costs
  the same to show as a paper one.

    parts     { kind: "sphere", at: [x, y, z], r }
              { kind: "capsule", at, to, r, r2 }        a tapered tube from at to to
              { kind: "box", at, size: [hx, hy, hz], r } a rounded box
              { kind: "ellipsoid", at, size: [rx, ry, rz] }
              each with a color, and carve: true to cut it away instead
    blend     how softly parts merge, in scene units (0 is a hard join)
    yaw       turn around the vertical axis (radians); a turntable steps this
    pitch     tilt toward or away from the viewer
    squash    squash and stretch: under 1 squashes, over 1 stretches (volume kept)
    material  "clay" (thumb dents), "felt" (fibers, fuzzy edge) or "plastic" (a highlight)

  Units are scene units. x runs right, y down (as in the scene), z toward
  the viewer. The camera looks straight down -z, so a piece is drawn the
  way a stop-motion camera sees a model on the set. The light is the
  scene's key from the top left plus the cool fill, with a soft shadow from
  the key and a little ambient occlusion, and the piece casts a shadow onto
  whatever is behind it, like the flat shapes do.

  Poses can add yaw and pitch and multiply squash, as well as move, turn
  and scale (js/items.js).

  Compile cost: the Windows shader compiler inlines every call site, so the
  whole raymarch (the march, the normal, the key-light shadow, the ambient
  occlusion and the cast shadow) is one loop with one call to map().
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const rgb = (h) => LB.gl.rgb(h);
  const MAX = 16;
  const KINDS = ["sphere", "capsule", "box", "ellipsoid"];
  const MATS = ["clay", "felt", "plastic"];

  const CLAY = `
uniform int uCount;
uniform vec4 uPart[16];        // kind, carve (0 or 1), radius, end radius (capsules)
uniform vec3 uPA[16];          // center, or a capsule's start
uniform vec3 uPB[16];          // a capsule's end, or a box's or ellipsoid's half size
uniform vec3 uPCol[16];
uniform float uBlend;
uniform vec3 uTurn;            // yaw, pitch, squash
uniform float uBound;          // bounding radius in scene units: rays start and stop there
uniform int uMat3;             // 0 clay, 1 felt, 2 plastic
uniform float uDent, uFuzz3, uShadowAmt;
uniform vec2 uShadowOff;
uniform int uSteps;

float part(int i, vec3 q) {
  vec4 P = uPart[i];
  vec3 a = uPA[i], b = uPB[i];
  if (P.x < 0.5) return length(q - a) - P.z;
  if (P.x < 1.5) {
    vec3 pa = q - a, ba = b - a;
    float h = clamp(dot(pa, ba) / max(dot(ba, ba), 1e-9), 0.0, 1.0);
    return length(pa - ba * h) - mix(P.z, P.w, h);
  }
  if (P.x < 2.5) {
    vec3 d = abs(q - a) - b + P.z;
    return length(max(d, 0.0)) + min(max(d.x, max(d.y, d.z)), 0.0) - P.z;
  }
  vec3 r = max(b, vec3(1e-4));
  float k0 = length((q - a) / r), k1 = length((q - a) / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 1e-6);
}

// The whole sculpt at q (its own coordinates), and the blended color there.
float map(vec3 q, out vec3 col) {
  float d = 1e9;
  col = uPCol[0];
  float k = max(uBlend, 1e-4);
  for (int i = 0; i < uCount; i++) {
    float di = part(i, q);
    if (uPart[i].y > 0.5) {
      float h = clamp(0.5 - 0.5 * (d + di) / k, 0.0, 1.0);
      d = mix(d, -di, h) + k * h * (1.0 - h);
    } else {
      float h = clamp(0.5 + 0.5 * (di - d) / k, 0.0, 1.0);
      d = mix(di, d, h) - k * h * (1.0 - h);
      col = mix(uPCol[i], col, h);
    }
  }
  // Thumb-pressed dents in clay; felt and plastic stay smooth (felt gets its fibers in the color).
  if (uMat3 == 0) d += (vnoise(q.xy * 90.0 + q.z * 47.0 + uSeed) - 0.5) * uDent;
  return d;
}

mat3 turnMatrix(float yaw, float pitch) {
  float cy = cos(yaw), sy = sin(yaw), cp = cos(pitch), sp = sin(pitch);
  mat3 ry = mat3(cy, 0.0, -sy, 0.0, 1.0, 0.0, sy, 0.0, cy);
  mat3 rx = mat3(1.0, 0.0, 0.0, 0.0, cp, sp, 0.0, -sp, cp);
  return ry * rx;
}

void main() {
  vec2 p = scenePos();
  // World = S R q, so q = R^T S^-1 world. Squash keeps volume: y by s, x and z by 1/sqrt(s).
  float sq = max(uTurn.z, 0.2);
  vec3 sInv = vec3(sqrt(sq), 1.0 / sq, sqrt(sq));
  float lip = min(1.0 / sqrt(sq), sq);   // distances shrink by at most this under the squash
  mat3 Rt = transpose(turnMatrix(uTurn.x, uTurn.y));
  vec3 L = normalize(KEY_DIR);

  vec3 ro = vec3(p, uBound), ro2 = vec3(p - uShadowOff, uBound);
  float t = 0.0, ts = 0.0, minD = 1e9, minS = 1e9, st = 0.004, sh = 1.0, ao = 1.0;
  int mode = 0, sub = 0;
  bool hit = false;
  vec3 hitW = vec3(0.0), nAcc = vec3(0.0), nW = vec3(0.0, 0.0, 1.0), colHit = vec3(0.0), colNear = uPCol[0];
  float eps = max(uPx * 0.5, 0.0004);

  for (int it = 0; it < uSteps; it++) {
    vec3 pw, e = vec3(0.0);
    if (mode == 0) pw = ro - vec3(0.0, 0.0, t);
    else if (mode == 1) {
      e = sub == 0 ? vec3(1.0, -1.0, -1.0) : sub == 1 ? vec3(-1.0, -1.0, 1.0) : sub == 2 ? vec3(-1.0, 1.0, -1.0) : vec3(1.0, 1.0, 1.0);
      pw = hitW + e * 0.0012;
    }
    else if (mode == 2) pw = hitW + nW * 0.003 + L * st;
    else if (mode == 3) pw = hitW + nW * (0.005 + 0.012 * float(sub));
    else if (mode == 4) pw = ro2 - vec3(0.0, 0.0, ts);
    else break;

    vec3 c;
    float d = map(Rt * (sInv * pw), c) * lip;

    if (mode == 0) {
      if (d < minD) { minD = d; colNear = c; }
      if (d < eps * 0.5) { hit = true; hitW = pw; colHit = c; mode = 1; sub = 0; }
      else { t += max(d * 0.9, eps * 0.5); if (t > 2.0 * uBound) mode = uShadowAmt > 0.0 ? 4 : 5; }
    } else if (mode == 1) {
      nAcc += e * d;
      sub++;
      if (sub == 4) { nW = normalize(nAcc); mode = 2; }
    } else if (mode == 2) {
      // Soft shadow from the key light: how close the ray toward the light passes to the sculpt.
      sh = min(sh, 10.0 * d / st);
      st += clamp(d, 0.002, 0.03);
      if (sh < 0.02 || st > 2.0 * uBound) { mode = 3; sub = 0; }
    } else if (mode == 3) {
      float hh = 0.005 + 0.012 * float(sub);
      ao -= max(hh - d, 0.0) * (sub == 0 ? 18.0 : 9.0);
      sub++;
      if (sub == 3) mode = uShadowAmt > 0.0 ? 4 : 5;
    } else {
      // The shadow the piece throws onto whatever is behind it, down and away from the light.
      minS = min(minS, d);
      if (d < eps || ts > 2.0 * uBound) mode = 5;
      else ts += max(d * 0.9, eps);
    }
  }

  vec4 acc = vec4(0.0);
  float blur = 0.004 + 0.012 * uShadowAmt;
  float sa = uShadowAmt > 0.0 ? smoothstep(blur, -blur, minS) * 0.5 * min(uShadowAmt * 1.5, 1.0) : 0.0;
  over(acc, vec3(0.07, 0.04, 0.1), sa);

  float fz = fuzz(p);
  float edge = minD + (uMat3 == 1 ? (fz - 0.5) * uFuzz3 * 5.0 * uPx : 0.0);
  float a = hit ? 1.0 : clamp(0.5 - edge / (1.2 * uPx), 0.0, 1.0);
  if (a > 0.0) {
    vec3 n = hit ? nW : vec3(0.0, 0.0, 1.0);
    vec3 alb = hit ? colHit : colNear;
    if (uMat3 == 1) alb *= 0.8 + 0.36 * fz;
    if (uMat3 == 0) alb *= 0.96 + 0.08 * vnoise(p / uPx * 0.5);
    float aoC = clamp(ao, 0.35, 1.0);
    float key = max(dot(n, L), 0.0) * mix(0.45, 1.0, clamp(sh, 0.0, 1.0));
    float fill = max(dot(n, normalize(FILL_DIR)), 0.0);
    vec3 light = vec3(0.36) * aoC + key * vec3(1.0, 0.93, 0.82) * 0.86 + fill * vec3(0.72, 0.76, 1.0) * 0.26;
    vec3 col = alb * light;
    // Clay lets a little light through at the edges; plastic shines.
    if (uMat3 == 0) col += alb * 0.12 * pow(1.0 - max(n.z, 0.0), 2.0);
    if (uMat3 == 2) col += vec3(1.0, 0.97, 0.9) * 0.55 * pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0) * clamp(sh, 0.0, 1.0);
    over(acc, col, a);
  }
  outColor = acc;
}`;

  // ---------- the same geometry in JS, for bounds, handles and clicks ----------
  const turnOf = (el) => ({ yaw: el.yaw || 0, pitch: el.pitch || 0, squash: el.squash ?? 1 });
  function reach(part) {
    const len = (v) => Math.hypot(v[0], v[1], v[2]);
    const r = part.r ?? 0.03;
    if (part.kind === "capsule") return Math.max(len(part.at) + r, len(part.to || part.at) + (part.r2 ?? r));
    if (part.kind === "box" || part.kind === "ellipsoid") return len(part.at) + len(part.size || [r, r, r]);
    return len(part.at) + r;
  }
  // Bounding radius around the sculpt's origin, in scene units (squash included).
  function bound(el) {
    const parts = (el.parts || []).filter((pt) => !pt.carve);
    const R = Math.max(0.01, ...parts.map(reach)) + (el.blend || 0) + 0.004;
    const sq = Math.max(0.2, turnOf(el).squash);
    return R * Math.max(1 / Math.sqrt(sq), sq);
  }
  // Sculpt coordinates to the piece's own 2D coordinates (before the item transform).
  function project(el, q) {
    const { yaw, pitch, squash } = turnOf(el);
    const cp = Math.cos(pitch), sp = Math.sin(pitch), cy = Math.cos(yaw), sy = Math.sin(yaw);
    // R = Ry(yaw) * Rx(pitch), as in the shader (column-major there).
    const x1 = q[0], y1 = cp * q[1] - sp * q[2], z1 = sp * q[1] + cp * q[2];
    const x2 = cy * x1 + sy * z1, z2 = -sy * x1 + cy * z1;
    const sq = Math.max(0.2, squash);
    return [x2 / Math.sqrt(sq), y1 * sq, z2 / Math.sqrt(sq)];
  }
  // A move in the view plane (2D, the piece's own coordinates) back into sculpt coordinates.
  function unproject(el, d2) {
    const { yaw, pitch, squash } = turnOf(el);
    const sq = Math.max(0.2, squash);
    const w = [d2[0] * Math.sqrt(sq), d2[1] / sq, 0];
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const x1 = cy * w[0] - sy * w[2], z1 = sy * w[0] + cy * w[2];
    return [x1, cp * w[1] + sp * z1, -sp * w[1] + cp * z1];
  }
  // Is a 2D point (the piece's own coordinates) on the sculpt? Each part's outline, seen from the front.
  function hit(el, p) {
    for (const pt of el.parts || []) {
      if (pt.carve) continue;
      const a = project(el, pt.at);
      const r = pt.kind === "box" || pt.kind === "ellipsoid" ? Math.max(...(pt.size || [0.03, 0.03, 0.03])) : pt.r ?? 0.03;
      if (pt.kind === "capsule") {
        const b = project(el, pt.to || pt.at);
        const bx = b[0] - a[0], by = b[1] - a[1];
        const h = Math.max(0, Math.min(1, ((p[0] - a[0]) * bx + (p[1] - a[1]) * by) / Math.max(bx * bx + by * by, 1e-9)));
        if (Math.hypot(p[0] - a[0] - bx * h, p[1] - a[1] - by * h) <= (pt.r ?? 0.03) + ((pt.r2 ?? pt.r ?? 0.03) - (pt.r ?? 0.03)) * h) return true;
      } else if (Math.hypot(p[0] - a[0], p[1] - a[1]) <= r) return true;
    }
    return false;
  }

  LB.ELEMENTS.clay = {
    glsl: CLAY,
    project, unproject, hit, bound,
    bbox(el) {
      const R = bound(el), s = el.shadow || 0;
      return [-R, -R, R + 0.032 * s, R + 0.038 * s];
    },
    set(gl, u, el, xf) {
      const parts = (el.parts || []).slice(0, MAX);
      const P = new Float32Array(MAX * 4), A = new Float32Array(MAX * 3), B = new Float32Array(MAX * 3), Cc = new Float32Array(MAX * 3);
      parts.forEach((pt, i) => {
        const k = Math.max(0, KINDS.indexOf(pt.kind));
        const r = pt.r ?? 0.03;
        P.set([k, pt.carve ? 1 : 0, k === 2 ? Math.min(r, ...(pt.size || [r, r, r])) : r, pt.r2 ?? r], i * 4);
        A.set(pt.at || [0, 0, 0], i * 3);
        B.set(k === 1 ? pt.to || pt.at || [0, 0, 0] : pt.size || [r, r, r], i * 3);
        Cc.set(rgb(pt.color || "#C9785A"), i * 3);
      });
      gl.uniform1i(u.uCount, parts.length);
      gl.uniform4fv(u.uPart, P);
      gl.uniform3fv(u.uPA, A);
      gl.uniform3fv(u.uPB, B);
      gl.uniform3fv(u.uPCol, Cc);
      gl.uniform1f(u.uBlend, el.blend ?? 0.012);
      const t = turnOf(el);
      gl.uniform3f(u.uTurn, t.yaw, t.pitch, t.squash);
      gl.uniform1f(u.uBound, bound(el));
      gl.uniform1i(u.uMat3, Math.max(0, MATS.indexOf(el.material)));
      gl.uniform1f(u.uDent, (el.dents ?? 0.5) * 0.004);
      gl.uniform1f(u.uFuzz3, el.fuzz ?? 0.6);
      const s = el.shadow || 0;
      gl.uniform1f(u.uShadowAmt, s);
      const r = (xf && xf.r) || 0, k = (xf && xf.s) || 1, ox = 0.012 * s, oy = 0.018 * s;
      gl.uniform2f(u.uShadowOff, (Math.cos(r) * ox + Math.sin(r) * oy) / k, (-Math.sin(r) * ox + Math.cos(r) * oy) / k);
      gl.uniform1i(u.uSteps, 240);
    },
  };

  LB.CLAY = { KINDS, MATS, MAX, project, unproject, hit, bound };
})();
