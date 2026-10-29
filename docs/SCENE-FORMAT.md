# Scene file format (version 1)

A scene is one JSON file. The editor saves and opens it, and the renderer draws it. It's the same shape as the study's [js/scenes/garden.js](../js/scenes/garden.js), plus the fields the editor adds. [js/editor/doc.js](../js/editor/doc.js) checks every file on open: it fills in missing values, clamps numbers to their ranges, and leaves out anything it can't draw, with a message saying what and why.

## Units

Everything is in **scene units**. The frame is 16:9: x runs from 0 (left) to 1.778 (right), and y from 0 (top) to 1 (bottom). Pieces can sit past the edges; parallax and dragging can bring them into view.

## The file

```json
{
  "format": "elaborate-backgrounds/scene",
  "version": 1,
  "title": "Tidepool at dusk",
  "aspect": 1.7778,
  "focus": [0.89, 0.5],
  "background": "#1A1420",
  "horizon": "#CDB8F5",
  "camera": { "drift": [0.008, 0.003] },
  "fps": 12,
  "boil": 1,
  "layers": [ ... ],
  "post": { ... },
  "grades": { "warm": { ... } },
  "grade": "warm",
  "images": { ... }
}
```

| Field | Meaning |
| --- | --- |
| `focus` | The point a tall (phone) crop keeps centered |
| `background` | The color behind every layer |
| `horizon` | The color layers fade toward with `haze` (aerial perspective) |
| `camera.drift` | How far the camera sways over one loop, at depth 1 |
| `fps` | Beat rate: 12, 8 or 6. Every scene loops in 6 seconds at any rate. |
| `boil` | Boil for the whole scene, multiplying each layer's own |
| `art` | Optional. A bespoke art pack (the study uses `"garden"`) |

## Layers

Layers are listed back to front. Three kinds:

**Paint layers** (no `type`) hold a `paint` list of pieces, baked into one texture.

```json
{ "id": "hills", "name": "Hills", "depth": 0.1, "far": true, "haze": 0.15, "boil": 1, "seed": 4,
  "offset": [0, 0], "opacity": 1, "anim": { "type": "drift", "amp": [0.012, 0.002] },
  "paint": [ ... ] }
```

**Flowers and leaves** (`"type": "sprite"`) sway from the base of their stem: `a` is the stem base, `b` the bend, `c` the flower head (or the leaf tip). `flower` is `daisy`, `tulip`, `orchid` or `bloom`; leave it out for a leaf. `colors` holds shadow, mid and light.

**Sparkles** (`"type": "sparkles"`) twinkle inside `area` ([x0, y0, x1, y1]), with `count`, `size` and `color`.

| Layer field | Meaning |
| --- | --- |
| `depth` | 0 is the sky, 1 touches the lens. Drives parallax. |
| `far` | Drawn before the depth-softness blur, so it can be blurred |
| `haze` | 0 to 0.5: how far toward the horizon color |
| `boil` | Per-beat wobble in pixels at 1080p |
| `seed` | Pins the layer's noise, so reordering layers never changes how one looks |
| `offset` | Moves the whole layer without rebaking it |
| `opacity` | 0 to 1 |
| `anim` | `drift` (`amp: [x, y]`), `sway` (`amp` in radians, `speed` in whole sways per loop, `phase`), `travel` (below), or `cycle` (`frames`, `rate`; bespoke art only) |
| `cycle` | A pose cycle: `{ "frames": 12, "rate": 6 }` bakes 12 textures and steps through them 6 times a second. `frames / rate` has to divide the 6-second loop evenly, or the file is rejected with a message. Pieces with `poses` move between them. |
| `pivot` | Where a paint layer sways from: `"base"` (default) or `"center"` |

**Travel** moves a whole layer from `from` to `to` (offsets in scene units) `speed` whole times per loop, starting `phase` (0 to 1) of the way along, then jumps back to the start. Put both ends off screen so the jump is never seen. `bob` and `bobs` add an up-and-down bob a whole number of times per crossing. The Beach day gulls fly this way while their wings flap through a pose cycle:

```json
"anim": { "type": "travel", "from": [-0.12, 0], "to": [2.08, -0.04], "speed": 1, "phase": 0.15, "bob": 0.012, "bobs": 3 },
"cycle": { "frames": 4, "rate": 8 }
```
| `hidden`, `locked` | Editor flags. Hidden layers don't render. |
| `rect` | Optional. The area a bespoke shader paints. Paint layers work it out from their pieces otherwise. |
| `res` | Optional bake resolution, relative to the screen (0.5 for soft layers) |

## Pieces

Every piece can carry `xf: { "x", "y", "s", "r" }`: move, scale and rotate (radians). Shapes and images are drawn around (0, 0), so for them `x` and `y` are simply where the piece sits. Every piece also gets an `id`, and can have a `name`.

In a layer with a pose cycle, a piece can list `poses`, one per frame. Each pose adds to the piece's own transform (`x`, `y` and `r` are added, `s` multiplies), or hides the piece for that frame with `"hide": true`. An empty pose `{}` means "as placed". Moving the piece moves every pose with it.

```json
{ "el": "shape", "shape": "rect", "w": 0.04, "h": 0.03, "material": "clay", "colors": ["#2BB3B1"],
  "xf": { "x": 1.2, "y": 0.86, "s": 1, "r": 1.15 },
  "poses": [{}, { "r": 0.07 }, { "x": 0.01, "y": -0.05, "r": -1.45 }, { "hide": true }] }
```

**Shapes**

```json
{ "el": "shape", "shape": "polygon", "sides": 5, "star": 0.6, "w": 0.14, "h": 0.14,
  "material": "felt", "colors": ["#F2C94C", "#FFE9A8"], "grain": 1,
  "rough": 0.5, "fuzz": 0.8, "puff": 0.7, "shadow": 0.4,
  "specks": { "scale": 140, "density": 0.2, "size": 0.3, "colors": ["#F5F2CC", "#FAF8F0"] },
  "xf": { "x": 0.9, "y": 0.3, "s": 1, "r": 0 } }
```

| Field | Meaning |
| --- | --- |
| `shape` | `rect` (with `corner`, 0 to 1), `ellipse`, `polygon` (with `sides`, and `star` 0 to 1), `blob` (with `lobes`: [x, y, radius] circles blended together, and `merge`), `path`: a custom outline through up to 32 `points`, with `round` to soften its corners and `smooth: true` to draw a curve through them, or `mask`: a cut-out taken from a picture (below) |
| `w`, `h` | Size, for everything but blobs |
| `material` | `paper`, `felt`, `clay`, `foliage` (second color = tips), `cardboard` (second color = flecks), `gradient` (top and bottom colors), `water` (far and near colors, with ripple strokes), `sand` (dry and wet colors), `stripes` (below), or `photo` (with `image`, `tile` and `tint`) |
| `stripes` | For the stripes material: `{ "width": 0.03 }` for straight bands, or `{ "fan": true, "count": 10, "center": [x, y] }` for stripes fanning out from a point, like a beach umbrella |
| `grain` | Pattern size multiplier for the material |
| `rough` | Rough cut edge, 0 to 1 |
| `fuzz` | Fibers breaking up the edge, 0 to 1 |
| `puff` | How much the piece rounds over and catches the light, 0 to 1 |
| `shadow` | A soft shadow cast down and right, away from the top-left light, 0 to 1 |
| `specks` | Optional beads or tiny flowers |
| `boilImages` | For a cut-out or a photo-filled shape: one or two more pictures, swapped pose by pose (the layer needs a pose cycle; the editor adds one) |

**Cut-outs** use a picture as the outline:

```json
{ "el": "shape", "shape": "mask", "image": "img-x1y2z", "w": 0.4, "h": 0.4,
  "mask": { "from": "dark", "threshold": 0.5 }, "material": "photo", "puff": 0.35, "shadow": 0.45 }
```

`from` is `dark` (a dark shape on a light background, like paper on white), `light`, or `alpha` (the opaque parts of a PNG). `threshold` (0 to 1) moves where the edge falls. When the material is `photo`, the cut-out shows its own picture edge to edge. The renderer turns the picture into a distance field when it loads (at most 256 px across), so the edge can be roughened, puffed and shadowed like any outline.

**Images**: `{ "el": "image", "image": "img-x1y2z", "w": 0.4, "h": 0.3, "tint": 0, "tintColor": "#FFFFFF" }`.

**3D pieces** are sculpts of up to 16 parts, in scene units around the piece's center: x to the right, y down, z toward the viewer.

```json
{ "el": "clay", "name": "Rubber duck", "material": "plastic", "blend": 0.008, "yaw": -0.5, "pitch": -0.15, "squash": 1, "shadow": 0.5,
  "parts": [
    { "kind": "ellipsoid", "at": [0, 0.02, 0], "size": [0.075, 0.048, 0.055], "color": "#F7CE3E" },
    { "kind": "sphere", "at": [0.034, -0.052, 0], "r": 0.037, "color": "#F7CE3E" },
    { "kind": "capsule", "at": [0, 0.06, 0], "to": [0, -0.02, 0], "r": 0.02, "r2": 0.016, "color": "#F7F0E2" },
    { "kind": "box", "at": [0, 0, 0], "size": [0.03, 0.03, 0.03], "r": 0.008, "color": "#8F8A92", "carve": true }
  ] }
```

| Field | Meaning |
| --- | --- |
| `parts` | `sphere` (`r`), `capsule` (a tube from `at` to `to`, `r` to `r2` thick), `box` (half `size`, corners rounded by `r`) or `ellipsoid` (half `size`). `carve: true` cuts a part away. |
| `blend` | How softly parts merge, in scene units |
| `yaw`, `pitch` | Turn around the vertical axis, and tilt toward the viewer (radians) |
| `squash` | Below 1 squashes, above 1 stretches; the volume stays the same |
| `material` | `clay` (with `dents`, 0 to 1), `felt` (with `fuzz`) or `plastic` |
| `shadow` | A soft shadow onto whatever is behind it, 0 to 1 |

In a layer with a pose cycle, a 3D piece's poses can also carry `yaw` and `pitch` (added) and `squash` (multiplied), which is how turntables and bounces are stored.

**The study's elements**: `canopy`, `florets`, `trunk`, `branch`, `turf` and `fuzz`, with the fields described at the top of [js/elements.js](../js/elements.js).

**Bespoke shaders**: `{ "shader": "waterfall" }` draws a shader from the scene's art pack over the layer's `rect`.

## Images

Imported pictures are embedded, so a scene file works on its own:

```json
"images": { "img-x1y2z": { "name": "green felt", "src": "data:image/jpeg;base64,...", "w": 2048, "h": 1536 } }
```

Pictures are shrunk to at most 2048 px on the long side when imported. Photos stay JPEG, and anything that might have transparency stays PNG. Saving drops pictures nothing uses.

## Packs

A pack is a file of pieces that the store can install (**Install a pack** under My pieces):

```json
{
  "format": "elaborate-backgrounds/pack", "version": 1,
  "name": "Handmade materials", "author": "Your name", "license": "CC BY 4.0 (use and change, with credit)",
  "pieces": [
    { "id": "piece-ab12c", "name": "Felt leaf", "kind": "item", "data": { "el": "shape", "...": "..." },
      "images": { "img-x1y2z": { "name": "green felt", "src": "data:image/jpeg;base64,...", "w": 1024, "h": 1024 } },
      "thumb": "data:image/png;base64,..." }
  ]
}
```

`kind` is `item` (one piece, placed so its center lands where it's dropped) or `layer` (a whole layer, moved with its offset). Each piece carries the pictures it uses. On install, every piece goes through the same checks as a scene file, and pieces that can't be drawn are left out with a message. When a piece is added to a scene, its pictures are added too, and a picture whose id is taken by a different picture gets a new id.

## Look

`post` holds each pass's settings and `post.on` its switches. `grades` holds named grades, and `grade` names the one in use. The fields match the Look panel, and [js/post.js](../js/post.js) documents each pass.
