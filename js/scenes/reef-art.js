/*
  Reef Rave: the bespoke art of an underwater octopus party in a cave.

    cave     deep night water glowing toward the cave mouth, a red wash from
             the upper right and a blue one from the left, and the cave's
             pitted rock framing the top and the left side
    sand     the sea floor, pale where the light pools, with ripples and grit
    lasers   a laser rig: thin beams fanning out from one bright point,
             re-aimed every frame like replacement pieces, some beams
             cutting out, with dust lit up along them
    party    the party's own lights: LED bars washing the room a new color
             every frame, a strobe, and a party light's projected dots
             turning a step at a time
    bulbs    a string of bulbs hanging right in front of the lens, blinking

  The party lights and the bulbs are light, not paint: they're baked with
  no coverage, so they add onto whatever is under them.

  Everything is procedural: shader code, no images.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  // Where the corals glow (x, y, radius) and in which color, so the cave's water carries their light.
  const CAVE = `
const vec3 GLOW_AT[7] = vec3[7](vec3(0.30, 0.15, 0.09), vec3(0.15, 0.35, 0.06), vec3(0.21, 0.50, 0.08), vec3(0.99, 0.39, 0.08),
                                vec3(1.18, 0.25, 0.10), vec3(1.70, 0.45, 0.07), vec3(1.64, 0.17, 0.06));
const vec3 GLOW_COL[7] = vec3[7](vec3(0.30, 0.10, 0.60), vec3(0.50, 0.06, 0.06), vec3(0.14, 0.14, 0.60), vec3(0.50, 0.07, 0.07),
                                 vec3(0.55, 0.16, 0.06), vec3(0.50, 0.06, 0.06), vec3(0.14, 0.14, 0.55));
void main() {
  vec2 p = scenePos();
  // The back of the cave: dim rocky lumps, almost black, far behind the dancers.
  vec2 tc, id;
  float vd = voronoi(p * vec2(16.0, 20.0) + uSeed + 7.0, tc, id);
  vec3 c = vec3(0.020, 0.022, 0.058) * (0.45 + 0.9 * (1.0 - smoothstep(0.15, 0.62, vd))) * (0.75 + 0.5 * id.x);
  // A blue glow around the laser rig, where the cave opens up.
  vec2 g = (p - vec2(0.765, 0.46)) * vec2(0.8, 1.2);
  c += vec3(0.03, 0.07, 0.28) * exp(-dot(g, g) * 9.0);
  // Club light: a red wash from the upper right, a blue one from the left.
  vec2 r = (p - vec2(1.45, 0.30)) * vec2(0.9, 1.2);
  c += vec3(0.22, 0.02, 0.04) * exp(-dot(r, r) * 5.0);
  vec2 bl = (p - vec2(0.40, 0.42)) * vec2(1.0, 1.2);
  c += vec3(0.03, 0.03, 0.16) * exp(-dot(bl, bl) * 8.0);
  // Each coral's own light, soft in the water around it.
  for (int k = 0; k < 7 * uOne; k++) {
    vec3 q = GLOW_AT[k];
    vec2 dq = (p - q.xy) / q.z;
    c += GLOW_COL[k] * exp(-dot(dq, dq) * 2.2) * 0.55;
  }
  c *= 0.9 + 0.16 * fbm(p * vec2(3.0, 5.0) + 2.0);
  vec4 acc = vec4(c, 1.0);
  // The near rock: everything outside the cave's arched opening.
  vec2 o = (p - vec2(0.86, 0.46)) / vec2(0.74, 0.44);
  float d = (1.0 - length(o)) * 0.32 + (fbm3(p * 7.0) - 0.5) * 0.06 + wobble(p, 30.0, 0.01);
  if (d < 0.02) {
    vec2 tc2, id2;
    float v2 = voronoi(p * vec2(22.0, 26.0) + uSeed, tc2, id2);
    float pit = smoothstep(0.38, 0.64, v2);
    vec3 n = normalize(vec3(-tc2 * 0.9, 1.0));
    vec3 alb = mix(vec3(0.17, 0.10, 0.10), vec3(0.40, 0.25, 0.21), id2.x);
    alb = mix(alb, vec3(0.38, 0.20, 0.30), step(0.82, id2.y) * 0.6);
    alb *= 0.8 + 0.35 * fbm3(p * 160.0);
    // Warm light on the rock at the top left, the rest falling into shadow.
    float warm = smoothstep(0.75, 0.0, length(p * vec2(1.0, 1.5)));
    vec3 rock = lit(alb, n, 0.6) * (0.08 + 1.15 * warm);
    rock = mix(rock, vec3(0.012, 0.01, 0.02), pit * 0.8);
    rock += vec3(0.24, 0.02, 0.04) * exp(-dot(r, r) * 3.0) * 0.6 + vec3(0.04, 0.04, 0.20) * exp(-dot(bl, bl) * 5.0) * 0.6;
    for (int k = 0; k < 7 * uOne; k++) {
      vec3 q = GLOW_AT[k];
      vec2 dq = (p - q.xy) / q.z;
      rock += GLOW_COL[k] * exp(-dot(dq, dq) * 2.5) * 0.5;
    }
    // A thin rim of light along the opening's edge.
    rock += vec3(0.08, 0.10, 0.30) * (1.0 - smoothstep(0.0, 0.025, -d)) * 0.5;
    over(acc, rock, fill(d));
  }
  outColor = acc;
}`;

  const SAND = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  float top = 0.615 + 0.012 * sin(p.x * 5.0 + 1.0) + 0.006 * sin(p.x * 17.0);
  float d = top - p.y + wobble(p, 30.0, 0.008);
  if (d > 0.01) { outColor = acc; return; }
  // Pale where the light pools in the middle, sinking into the dark at the back and the sides.
  vec2 q = (p - vec2(0.82, 0.92)) * vec2(0.75, 1.5);
  float pool = exp(-dot(q, q) * 3.6);
  float back = smoothstep(top, top + 0.16, p.y);
  vec3 c = mix(vec3(0.03, 0.04, 0.08), vec3(0.42, 0.52, 0.54), pool * (0.2 + 0.8 * back));
  // Ripples in the sand, and grit.
  float rip = sin((p.y * 90.0 + fbm3(p * 6.0) * 6.0 + p.x * 8.0));
  c *= 0.9 + 0.1 * rip;
  c *= 0.86 + 0.28 * paper(p) * fbm3(p * 200.0);
  c = specks(p, c, 230.0, 0.08 * (0.3 + 0.7 * pool), vec3(0.75, 0.80, 0.82), vec3(0.42, 0.40, 0.48), 0.3);
  // A faint blue from the lasers on the lit sand; the far edge sinks into the dark.
  c += vec3(0.01, 0.02, 0.07) * back;
  c *= 0.25 + 0.75 * smoothstep(top, top + 0.09, p.y);
  vec2 r = (p - vec2(1.55, 0.6)) * vec2(1.0, 1.6);
  c += vec3(0.18, 0.02, 0.04) * exp(-dot(r, r) * 3.0);
  over(acc, c, fill(d));
  outColor = acc;
}`;

  // Baked six times; the rig re-aims its beams every frame, the way a laser show steps.
  const LASERS = `
void main() {
  vec2 p = scenePos();
  vec4 acc = vec4(0.0);
  vec2 E = vec2(0.765, 0.458);
  vec2 v = p - E;
  float dist = length(v);
  for (int k = 0; k < 7 * uOne; k++) {
    float fk = float(k);
    vec2 rnd = hash22(vec2(fk, 3.0));
    // Each beam swings back and forth through the six frames; a few cut out on some frames.
    float base = -2.75 + fk * 0.62 + (rnd.x - 0.5) * 0.3;
    float ang = base + 0.32 * sin(6.2832 * (uFrame / 6.0 + rnd.y));
    float on = step(0.22, hash12(vec2(fk * 7.0, uFrame + 1.0)));
    vec2 dir = vec2(cos(ang), sin(ang));
    float along = dot(v, dir);
    if (along < 0.0 || on < 0.5) continue;
    float across = abs(dot(v, vec2(-dir.y, dir.x)));
    float fade = exp(-along * 0.9);
    vec3 col = mix(vec3(0.25, 0.55, 1.0), vec3(0.35, 0.95, 1.0), rnd.y);
    float core = exp(-across * across / (2.0e-6)) * 1.2;
    float halo = exp(-across * across / (6.0e-5)) * 0.35;
    float a = clamp((core + halo) * fade, 0.0, 1.0);
    over(acc, mix(col, vec3(1.0), core * 0.6), a);
  }
  // The rig itself: a bright point with a soft halo and a little horizontal flare.
  float star = exp(-dist * dist / 1.5e-5) + 0.35 * exp(-dist * dist / 4.0e-4);
  float flare = exp(-abs(v.y) / 0.0015) * exp(-abs(v.x) / 0.05) * 0.5;
  over(acc, vec3(0.78, 0.92, 1.0), clamp(star + flare, 0.0, 1.0));
  // Dust and tiny bubbles lit up in the beams, somewhere new each frame.
  for (int k = 0; k < 10 * uOne; k++) {
    vec2 rnd = hash22(vec2(float(k) * 1.3, uFrame * 2.1 + 5.0));
    vec2 c = E + vec2((rnd.x - 0.5) * 0.5, (rnd.y - 0.3) * 0.25);
    float dd = length(p - c);
    over(acc, vec3(0.6, 0.85, 1.0), exp(-dd * dd / 6.0e-6) * 0.9);
  }
  outColor = acc;
}`;

  // Baked eight times, one color pair per frame; the last frame is the strobe.
  const PARTY = `
const vec3 WASH[8] = vec3[8](vec3(1.0, 0.08, 0.2), vec3(0.8, 0.1, 0.95), vec3(0.15, 0.25, 1.0), vec3(1.0, 0.1, 0.55),
                             vec3(0.55, 0.12, 1.0), vec3(0.1, 0.75, 1.0), vec3(1.0, 0.2, 0.12), vec3(0.85, 0.9, 1.0));
void main() {
  vec2 p = scenePos();
  int f = int(uFrame + 0.5) % 8;
  vec3 a = WASH[f], b = WASH[(f + 3) % 8];
  // LED bars just out of frame at the top corners, each washing its own side of the room.
  vec2 la = (p - vec2(0.0, -0.12)) * vec2(0.75, 1.0);
  vec2 lb = (p - vec2(1.78, -0.12)) * vec2(0.75, 1.0);
  vec3 c = a * exp(-dot(la, la) * 2.0) * 0.34 + b * exp(-dot(lb, lb) * 2.0) * 0.34;
  // Their light pooling on the floor.
  vec2 fl = (p - vec2(0.9, 0.9)) * vec2(0.6, 2.4);
  c += mix(a, b, smoothstep(0.2, 1.6, p.x)) * exp(-dot(fl, fl) * 2.0) * 0.14;
  // A party light's projected dots, turned a step each frame.
  vec2 q = (p - vec2(0.88, 0.5)) * vec2(1.0, 1.5);
  float ang = uFrame * 0.23;
  q = mat2(cos(ang), sin(ang), -sin(ang), cos(ang)) * q;
  vec2 cell = floor(q / 0.07);
  vec2 h = hash22(cell + 3.0);
  vec2 g = fract(q / 0.07) - 0.5 + (h - 0.5) * 0.3;
  float spot = smoothstep(0.2, 0.12, length(g)) * step(0.68, h.x) * exp(-dot(q, q) * 2.2) * smoothstep(0.05, 0.45, p.y);
  vec3 dc = h.y < 0.33 ? vec3(1.0, 0.15, 0.35) : h.y < 0.66 ? vec3(0.25, 1.0, 0.55) : vec3(0.35, 0.45, 1.0);
  c += dc * spot * 0.32;
  if (f == 7) c += vec3(0.2, 0.22, 0.28);
  outColor = vec4(c, 0.0);
}`;

  // Two strings of bulbs, close enough to touch, so they'll be out of focus. Baked four times, blinking.
  const BULBS = `
const vec3 BULB[5] = vec3[5](vec3(1.0, 0.78, 0.45), vec3(1.0, 0.3, 0.6), vec3(0.35, 0.55, 1.0), vec3(1.0, 0.55, 0.15), vec3(0.4, 1.0, 0.55));
void main() {
  vec2 p = scenePos();
  vec3 c = vec3(0.0);
  for (int k = 0; k < 16 * uOne; k++) {
    float fk = float(k);
    // Bulbs 0 to 9 sag across the top left; 10 to 15 hang in from the top right.
    float u = k < 10 ? fk / 9.0 : (fk - 10.0) / 5.0;
    vec2 b = k < 10 ? vec2(-0.08 + u * 1.0, 0.04 + 0.3 * u * (1.0 - u) * 1.4 - 0.04 * u)
                    : vec2(1.38 + u * 0.5, 0.04 + 0.24 * u * (1.0 - u) + 0.06 * u);
    float rad = k < 10 ? 0.042 - 0.01 * u : 0.032 + 0.012 * u;
    float on = hash12(vec2(fk * 3.1, uFrame + 2.0)) > 0.25 ? 1.0 : 0.25;
    float d = length(p - b);
    c += BULB[k % 5] * smoothstep(rad, rad * 0.7, d) * on * 1.5;
  }
  outColor = vec4(c, 0.0);
}`;

  LB.art = LB.art || {};
  LB.art.reef = { bakes: { rcave: CAVE, rsand: SAND, lasers: LASERS, party: PARTY, bulbs: BULBS } };
})();
