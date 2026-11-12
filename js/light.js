/*
  Light: light and shade laid over what's already in a scene.

    light   "window": the shape a window's light throws onto a wall or a
            desk, a soft-edged box that can lean (skew) the way a low sun
            slants it, split into panes by the window bars. "glow": a soft
            round pool of light, for a lamp, a screen or a sunset's bounce.

  Two modes:
    light   adds its color onto whatever is under it, like light does: a
            warm patch over a wall, a glow over a screen. It's baked with
            no coverage, so the layer adds rather than covers.
    shade   lays its color over what's under it, see-through: a shadow, a
            dim corner.

  Light through old glass is never perfectly even, so a faint unevenness
  runs through it. "fade" dims it toward its bottom edge (or its top, when
  negative); turn the piece to point the fade. "flicker" changes its
  strength a little from pose to pose, in a layer with a pose cycle.

  Drawn around (0, 0) and placed by the item transform, like shapes.
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const rgb = (h) => LB.gl.rgb(h);

  const GLSL = `
uniform vec4 uBox;   // half width, half height, skew (x shift per unit of y), softness (scene units)
uniform vec4 uPane;  // columns, rows, bar width (scene units), shape (0 window, 1 glow)
uniform vec3 uCol;
uniform vec4 uAmt;   // strength, mode (0 light, 1 shade), fade -1..1, flicker 0..1
void main() {
  vec2 p = scenePos();
  vec2 q = vec2(p.x - uBox.z * p.y, p.y);
  float s = uBox.w + uPx;
  float m;
  if (uPane.w > 0.5) {
    float r = length(q / uBox.xy);
    m = exp(-r * r * mix(4.5, 1.6, clamp(uBox.w / max(min(uBox.x, uBox.y), 1e-5), 0.0, 1.0))) * (1.0 - smoothstep(0.7, 1.0, r));
  } else {
    vec2 e = abs(q) - uBox.xy;
    m = (1.0 - smoothstep(-s, s, e.x)) * (1.0 - smoothstep(-s, s, e.y));
    // The window bars: the lines between panes, softened a little less than the edge.
    vec2 cells = max(uPane.xy, vec2(1.0));
    vec2 u = (q / uBox.xy * 0.5 + 0.5) * cells;
    vec2 f = abs(fract(u + 0.5) - 0.5) * (2.0 * uBox.xy / cells);
    float sb = s * 0.6;
    if (uPane.x > 1.5) m *= smoothstep(uPane.z * 0.5 - sb, uPane.z * 0.5 + sb, f.x);
    if (uPane.y > 1.5) m *= smoothstep(uPane.z * 0.5 - sb, uPane.z * 0.5 + sb, f.y);
  }
  float v = clamp(q.y / max(uBox.y, 1e-5) * 0.5 + 0.5, 0.0, 1.0);
  m *= uAmt.z >= 0.0 ? 1.0 - uAmt.z * v : 1.0 + uAmt.z * (1.0 - v);
  m *= 0.93 + 0.14 * fbm3(p * 38.0 + uSeed);
  m *= 1.0 + uAmt.w * 0.3 * (hash12(vec2(uFrame + 1.0, 4.7)) - 0.5);
  float a = clamp(m * uAmt.x, 0.0, 1.0);
  if (uAmt.y > 0.5) { vec4 acc = vec4(0.0); over(acc, uCol, a); outColor = acc; }
  else outColor = vec4(uCol * a, 0.0);
}`;

  const half = (el) => [Math.max(el.w ?? 0.3, 0.004) / 2, Math.max(el.h ?? 0.3, 0.004) / 2];
  const softOf = (el) => Math.max(0, Math.min(1, el.soft ?? 0.3)) * Math.min(...half(el));

  // The light's own outline box (before softness), around (0, 0).
  function outline(el) {
    const [hx, hy] = half(el);
    const k = el.shape === "glow" ? 0 : Math.abs(el.skew || 0) * hy;
    return [-hx - k, -hy, hx + k, hy];
  }

  // Is a point (in the light's own coordinates) inside it?
  function inside(el, q) {
    const [hx, hy] = half(el);
    const x = q[0] - (el.shape === "glow" ? 0 : el.skew || 0) * q[1];
    if (el.shape === "glow") return (x / hx) ** 2 + (q[1] / hy) ** 2 <= 1;
    return Math.abs(x) <= hx && Math.abs(q[1]) <= hy;
  }

  LB.ELEMENTS.light = {
    glsl: GLSL,
    outline,
    inside,
    bbox(el) {
      const b = outline(el), m = softOf(el) + 0.006;
      return [b[0] - m, b[1] - m, b[2] + m, b[3] + m];
    },
    set(gl, u, el) {
      const [hx, hy] = half(el);
      const glow = el.shape === "glow";
      gl.uniform4f(u.uBox, hx, hy, glow ? 0 : el.skew || 0, softOf(el));
      const panes = Array.isArray(el.panes) ? el.panes : [2, 2];
      gl.uniform4f(u.uPane, Math.round(panes[0] || 1), Math.round(panes[1] || 1), Math.max(0, el.bar ?? 0.1) * Math.min(hx, hy) * 0.5, glow ? 1 : 0);
      gl.uniform3f(u.uCol, ...rgb(el.color || "#FFC27A"));
      gl.uniform4f(u.uAmt, el.strength ?? 0.4, el.mode === "shade" ? 1 : 0, Math.max(-1, Math.min(1, el.fade || 0)), el.flicker || 0);
    },
  };
})();
