/*
  Post-processing shaders, in the order the recipe applies them:

    depth softness  blur the far layers before the near ones are drawn
    bloom           a downsample/upsample chain (dual filter) at half
                    resolution and below. Two uses: "glow" adds back what's
                    above a threshold, "mist" screens the whole wide blur
                    over the frame. Mist is the fuzz: blacks lift and every
                    edge gets a soft halo, like a Pro-Mist filter.
    halation        a warm fringe just outside bright areas
    grade           exposure, white balance, contrast, saturation, split
                    toning, then the output range (lifted floor, capped white)
    chromatic ab.   red and blue sampled slightly apart, growing to the edges
    vignette        tinted, not black
    grain           per rendered frame or per beat

  The last five run in one full-screen shader, but each stage has its own
  switch, so the panel and the screenshots can add them one at a time.
  Everything works on display-referred (sRGB) values, the way a colorist's
  grade works on the image it sees.
*/
(function () {
  const LB = (window.LB = window.LB || {});

  const COPY = `
in vec2 vUv;
uniform sampler2D uTex;
out vec4 outColor;
void main() { outColor = texture(uTex, vUv); }`;

  // Separable Gaussian, 9 taps folded into 5 linear samples.
  const BLUR = `
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uDir;
out vec4 outColor;
void main() {
  vec4 c = texture(uTex, vUv) * 0.2270270270;
  c += (texture(uTex, vUv + uDir * 1.3846153846) + texture(uTex, vUv - uDir * 1.3846153846)) * 0.3162162162;
  c += (texture(uTex, vUv + uDir * 3.2307692308) + texture(uTex, vUv - uDir * 3.2307692308)) * 0.0702702703;
  outColor = c;
}`;

  const DOWN = `
in vec2 vUv;
uniform sampler2D uTex;
uniform vec2 uTexel;
out vec4 outColor;
void main() {
  vec2 h = uTexel * 0.5;
  vec4 s = texture(uTex, vUv) * 4.0;
  s += texture(uTex, vUv - h) + texture(uTex, vUv + h);
  s += texture(uTex, vUv + vec2(h.x, -h.y)) + texture(uTex, vUv + vec2(-h.x, h.y));
  outColor = s / 8.0;
}`;

  // Upsample the smaller level and add it, weighted, onto this level's downsample.
  const UP = `
in vec2 vUv;
uniform sampler2D uTex;
uniform sampler2D uBase;
uniform vec2 uTexel;
uniform float uWeight;
out vec4 outColor;
void main() {
  vec2 h = uTexel * 0.5;
  vec4 s = texture(uTex, vUv + vec2(-h.x * 2.0, 0.0)) + texture(uTex, vUv + vec2(h.x * 2.0, 0.0));
  s += texture(uTex, vUv + vec2(0.0, h.y * 2.0)) + texture(uTex, vUv + vec2(0.0, -h.y * 2.0));
  s += (texture(uTex, vUv + vec2(-h.x, h.y)) + texture(uTex, vUv + vec2(h.x, h.y))) * 2.0;
  s += (texture(uTex, vUv + vec2(h.x, -h.y)) + texture(uTex, vUv + vec2(-h.x, -h.y))) * 2.0;
  outColor = texture(uBase, vUv) + uWeight * s / 12.0;
}`;

  const FINAL = `
in vec2 vUv;
uniform sampler2D uScene, uBloom, uHal;
uniform float uBloomNorm;
uniform vec4 uOn;    // bloom, halation, grade, chromatic aberration
uniform vec2 uOn2;   // vignette, grain
uniform float uGlow, uThreshold, uMist;
uniform float uHalAmount, uHalThreshold;
uniform vec3 uHalColor;
uniform float uExposure, uTemp, uTint, uContrast, uSat, uWhiteCap, uRedCap, uSplit;
uniform vec3 uFloor, uShadowTint, uHighTint;
uniform float uCa, uVig, uGrain, uGrainSeed;
uniform vec3 uVigColor;
uniform vec2 uRes;
out vec4 outColor;

float luma(vec3 c) { return dot(c, vec3(0.2126, 0.7152, 0.0722)); }
float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  vec2 uv = vUv;
  vec2 fromC = uv - 0.5;
  vec3 col, bl;
  if (uOn.w > 0.5) {
    vec2 off = fromC * length(fromC) * uCa * 8.0;
    col = vec3(texture(uScene, uv + off).r, texture(uScene, uv).g, texture(uScene, uv - off).b);
    bl = vec3(texture(uBloom, uv + off).r, texture(uBloom, uv).g, texture(uBloom, uv - off).b);
  } else {
    col = texture(uScene, uv).rgb;
    bl = texture(uBloom, uv).rgb;
  }
  bl /= uBloomNorm;

  if (uOn.x > 0.5) {
    col += uGlow * max(bl - uThreshold, 0.0) / max(1.0 - uThreshold, 0.01);
    col = 1.0 - (1.0 - clamp(col, 0.0, 1.0)) * (1.0 - bl * uMist);
  }

  if (uOn.y > 0.5) {
    float h = smoothstep(uHalThreshold, 1.0, luma(texture(uHal, uv).rgb));
    float fringe = h * (1.0 - smoothstep(0.35, 0.85, luma(col)));
    col += uHalColor * fringe * uHalAmount;
  }

  if (uOn.z > 0.5) {
    col *= exp2(uExposure);
    col *= vec3(1.0 + 0.12 * uTemp, 1.0 + 0.015 * uTemp, 1.0 - 0.15 * uTemp);
    col *= vec3(1.0 + 0.04 * uTint, 1.0 - 0.07 * uTint, 1.0 + 0.04 * uTint);
    col = (col - 0.5) * uContrast + 0.5;
    col = mix(vec3(luma(col)), col, uSat);
    float l = clamp(luma(col), 0.0, 1.0);
    col = mix(col, col * uHighTint, smoothstep(0.3, 1.0, l) * uSplit * 1.6);
    col = mix(col, uShadowTint, (1.0 - smoothstep(0.0, 0.55, l)) * uSplit * 0.6);
    // Soft shoulder above 0.8 so bright areas roll off instead of clipping.
    col = max(col, 0.0);
    vec3 sh = 1.0 - 0.2 * exp(-(col - 0.8) / 0.2);
    col = mix(col, sh, step(0.8, col));
    col = uFloor + col * (vec3(uWhiteCap) - uFloor);
    col.r = min(col.r, uRedCap);
  }

  if (uOn2.x > 0.5) {
    vec2 q = fromC * vec2(uRes.x / uRes.y, 1.0);
    float v = smoothstep(0.35, 1.05, length(q)) * uVig;
    col = mix(col, col * uVigColor, v);
  }

  if (uOn2.y > 0.5) {
    float n = hash(gl_FragCoord.xy + uGrainSeed * 61.7) + hash(gl_FragCoord.xy * 1.37 + uGrainSeed * 13.1) - 1.0;
    float l = luma(col);
    col += n * uGrain * (0.6 + 0.4 * (1.0 - abs(l * 2.0 - 1.0)));
  }

  col += (hash(gl_FragCoord.xy + 0.5) - 0.5) / 255.0; // dither, so gradients don't band
  outColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

  LB.POST_GLSL = { COPY, BLUR, DOWN, UP, FINAL };
  // The order the stages switch on in, for "?upto=" and the screenshots.
  LB.PASSES = ["depth", "bloom", "halation", "grade", "ca", "vignette", "grain"];
})();
