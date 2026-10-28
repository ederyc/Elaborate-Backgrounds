/*
  Geometry for the things painted into a layer ("items"), shared by the
  renderer and the editor.

  Every item can carry a transform, xf = { x, y, s, r }: move by (x, y),
  scale by s and rotate by r radians, around the item's origin. The origin
  is (0, 0) for shapes and images, which are drawn around it, and the
  center of the item's own bounding box for everything else. The bake
  shaders undo the transform in scenePos(), so no element needs to know it.

  Poses: a layer with a pose cycle (layer.cycle = { frames, rate }) bakes one
  texture per pose. Its items can list "poses", one per frame: changes added
  on top of the item's own transform ({ x, y, r } added, { s } multiplied),
  or { hide: true }. Moving an item moves all its poses with it.

  Item kinds:
    { el: "canopy" | "shape" | ... }   a reusable element (js/elements.js, js/shapes.js)
    { shader: "sky" }                  a bespoke shader from a scene's art pack; it covers the layer's rect
*/
(function () {
  const LB = (window.LB = window.LB || {});
  const IDENTITY = { x: 0, y: 0, s: 1, r: 0 };

  const xfOf = (item) => ({ ...IDENTITY, ...(item.xf || {}) });
  const isIdentity = (item) => {
    const t = xfOf(item);
    return t.x === 0 && t.y === 0 && t.s === 1 && t.r === 0;
  };

  // The item's box before its transform. Bespoke shaders cover the layer's own rect.
  function rawBox(item, layer) {
    if (item.el) return LB.ELEMENTS[item.el].bbox(item);
    return (layer && layer.rect) || [0, 0, 16 / 9, 1];
  }

  function origin(item, layer) {
    if (item.el === "shape" || item.el === "image") return [0, 0];
    const b = rawBox(item, layer);
    return [(b[0] + b[2]) / 2, (b[1] + b[3]) / 2];
  }

  // Item coordinates to scene coordinates.
  function toScene(item, layer, p, o = origin(item, layer), t = xfOf(item)) {
    const dx = (p[0] - o[0]) * t.s, dy = (p[1] - o[1]) * t.s;
    const c = Math.cos(t.r), s = Math.sin(t.r);
    return [o[0] + t.x + c * dx - s * dy, o[1] + t.y + s * dx + c * dy];
  }

  // Scene coordinates to item coordinates (the same math as scenePos() in the shaders).
  function toLocal(item, layer, p) {
    const o = origin(item, layer), t = xfOf(item);
    const dx = p[0] - o[0] - t.x, dy = p[1] - o[1] - t.y;
    const c = Math.cos(t.r), s = Math.sin(t.r);
    return [o[0] + (c * dx + s * dy) / t.s, o[1] + (-s * dx + c * dy) / t.s];
  }

  // The four corners of a box, carried through the transform.
  function corners(item, layer, box = rawBox(item, layer)) {
    const o = origin(item, layer), t = xfOf(item);
    return [[box[0], box[1]], [box[2], box[1]], [box[2], box[3]], [box[0], box[3]]].map((p) => toScene(item, layer, p, o, t));
  }

  function worldBox(item, layer) {
    const pts = corners(item, layer);
    const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
    return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
  }

  // The box a person thinks of as the item: a shape's outline without its shadow.
  function outlineBox(item, layer) {
    if (item.el === "shape") return LB.ELEMENTS.shape.outline(item);
    return rawBox(item, layer);
  }

  // Where the item's center is in the scene: what the editor shows as its position.
  function position(item, layer) {
    const o = origin(item, layer), t = xfOf(item);
    return [o[0] + t.x, o[1] + t.y];
  }

  // Is a scene point on this item? Exact for shapes and lobes, the outline box for everything else.
  function hit(item, layer, p) {
    const q = toLocal(item, layer, p);
    const b = outlineBox(item, layer);
    if (q[0] < b[0] || q[0] > b[2] || q[1] < b[1] || q[1] > b[3]) return false;
    if (item.el === "shape" && item.shape === "path" && item.points) {
      // Even-odd test against the outline.
      let inside = false;
      const ps = item.points;
      for (let i = 0, j = ps.length - 1; i < ps.length; j = i++) {
        if ((ps[i][1] > q[1]) !== (ps[j][1] > q[1]) && q[0] < ((ps[j][0] - ps[i][0]) * (q[1] - ps[i][1])) / (ps[j][1] - ps[i][1]) + ps[i][0]) inside = !inside;
      }
      return inside;
    }
    const lobes = item.lobes;
    if (lobes && (item.el !== "shape" || item.shape === "blob")) return lobes.some((l) => Math.hypot(q[0] - l[0], q[1] - l[1]) <= l[2] * 1.05);
    if (item.el === "shape" && item.shape === "ellipse") {
      const hx = (b[2] - b[0]) / 2, hy = (b[3] - b[1]) / 2;
      return (q[0] / hx) ** 2 + (q[1] / hy) ** 2 <= 1.05;
    }
    return true;
  }

  // The images an item samples, so they can be loaded before it bakes.
  function images(item) {
    const E = item.el && LB.ELEMENTS[item.el];
    return E && E.images ? E.images(item) : [];
  }

  // The item as it stands in pose f (unchanged when it has no poses).
  function atPose(item, f) {
    if (!item.poses || !item.poses.length) return item;
    const p = item.poses[((f % item.poses.length) + item.poses.length) % item.poses.length] || {};
    const t = xfOf(item);
    return { ...item, xf: { x: t.x + (p.x || 0), y: t.y + (p.y || 0), s: t.s * (p.s ?? 1), r: t.r + (p.r || 0) }, hide: !!p.hide };
  }

  // Bounds over every pose, so a layer's texture fits all of them.
  function allPosesBox(item, layer) {
    if (!item.poses || !item.poses.length) return worldBox(item, layer);
    let b = null;
    for (let f = 0; f < item.poses.length; f++) b = union(b, worldBox(atPose(item, f), layer));
    return b;
  }

  const union = (a, b) => (a ? [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[2], b[2]), Math.max(a[3], b[3])] : b.slice());

  LB.ITEMS = { atPose, allPosesBox, IDENTITY, xfOf, isIdentity, rawBox, origin, toScene, toLocal, corners, worldBox, outlineBox, position, hit, images, union };
})();
