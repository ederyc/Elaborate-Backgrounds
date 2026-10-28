# Elaborate Backgrounds (work in progress)

Looping stop-motion backgrounds in the browser, in two parts:

- **The garden study** ([index.html](index.html)). A real-time WebGL2 recreation of the feel of a looping stop-motion backdrop: a handmade-looking fantasy garden with a waterfall, swaying flowers and a soft, warm, fuzzy filter. It's built as layered parallax quads on a stepped stop-motion clock, with a post stack on top.
- **The editor** ([editor.html](editor.html)). The study's recipe, turned into a tool for making your own wallpapers: layers at depths, ready-made pieces from a store, shapes you cut and texture yourself, and the whole look as switches and sliders. It exports PNG stills, video loops and scene files.

**The study is a study.** The original backdrop was made by Tamara for a podcast set. The show isn't named here, and I'm not affiliated with it. The study's art is entirely procedural (shader code, no images), written by Claude at my direction. So are the editor's starter pieces, which say so in the store. My own scenes and materials, photographed and drawn by me, come next and are the actual portfolio piece.

Status: phases 1 to 4 are done (analysis, rendering skeleton, the study, and the first version of the editor). The plan for the rest, including the store and 3D pieces, is in [docs/PLAN.md](docs/PLAN.md). The write-up of the look is in [docs/RECIPE.md](docs/RECIPE.md).

## Running it

There's no build step and no dependencies. Serve the folder with any static server:

```sh
python -m http.server
# then open http://localhost:8000 for the study, or http://localhost:8000/editor.html for the editor
```

The study's URL switches, mostly for comparing ingredients:

| Switch | Does |
| --- | --- |
| `?grade=measured` | The grade matched to the reference's measured numbers, instead of the warm default |
| `?upto=base` (or `depth`, `bloom`, `halation`, `grade`, `ca`, `vignette`) | Turns the post passes on in order, up to and including that one |
| `?fps=8` (or `12`, `6`) | Stop-motion rate |
| `?boil=0`, `?motion=0` | No boil, or no animation |
| `?grain=frame` | Grain changes every rendered frame instead of once per beat |
| `?t=2.5` | Freeze at that point in the 6-second loop |
| `?stats=1` | Live frame times |

## Using the editor

The first time, it opens the garden study with every piece editable. **New** starts from a blank backdrop.

- **Select and move.** Click a piece to select it, then drag it. Drag the square handle to scale and the round one to rotate (Shift snaps to 15°). Select a layer in the list and drag inside its dashed box to move the whole layer.
- **Draw.** Pick a shape tool (R rectangle, E ellipse, T triangle, S star, C cloud) and drag on the canvas. New pieces go into the selected layer, or into a new layer if none can take them.
- **Store.** Click a piece to add it in the middle of the frame, or drag it to a spot. **Import picture**, or dropping image files on the canvas, adds your own pictures. A shape's material can also be **Photo**, which fills it with one of them.
- **Properties** has everything about the selected piece and its layer. **Look** has the beat rate, boil, grade and each post pass.
- **Keys.** Ctrl+Z and Ctrl+Shift+Z undo and redo. Ctrl+S saves the scene file, Ctrl+D duplicates and Space plays or pauses. On the canvas, the arrows move the selection (add Shift to move further), Delete removes it and Escape deselects. [ and ] move it backward or forward.
- **Saving.** The scene autosaves in this browser. **Save file** downloads a .json scene file (format in [docs/SCENE-FORMAT.md](docs/SCENE-FORMAT.md)), with your pictures embedded. **Export** saves a PNG at desktop or phone sizes, or records a 6-second video loop.

## Quality checks

Measured in Chrome 156 on this laptop (Intel Iris Xe, integrated graphics), driven by scripts through the DevTools protocol.

| Check | Result |
| --- | --- |
| The study, before and after the editor's engine changes | Same pixels at `?t=2.5`: largest difference 1 of 255, except where the new "Make your own" link sits in the caption |
| Editor ready, study scene loaded | 1.1 to 1.3 s (three runs) |
| Rebake after moving one piece, in the study's busiest layers | Median 0.6 to 1.2 ms, worst 6.8 ms (8 moves per layer, three runs) |
| Rebake after moving one of 25 shapes in one layer | 0.5 to 1.7 ms |
| Scene file round trip (save, open, save) | Identical text |
| Video loop, 1280×720 | MP4, 5.94 to 5.96 s long (six runs): the last beat is about 50 ms short, so a looping player shows a tiny hitch. Frame-exact export is planned (PLAN.md, phase 7). |
| axe-core 4.10 scan, editor | No violations with nothing selected, a piece selected, the Look tab, and the Export dialog |
| axe-core 4.10 scan, study page | No violations |
| Reduced motion | The editor doesn't autoplay; the play button reads "Play" |
| Width 420 px | No sideways scrolling; canvas first, then the panels |

Keyboard: every control in the panels is a native button, input or select with a visible label, and the canvas takes the arrow keys when focused. Moving pieces precisely without a mouse goes through the Placement sliders. The handles themselves need a mouse or touch.

Not measured yet: Lighthouse, frame times on a phone, and touch use. Handles are 12 px, which is small for fingers.

## Code tour

```
index.html                 The study page, caption and play/pause control
editor.html                The editor
css/tokens.css             The portfolio's tokens (copied from Resume/css/style.css)
css/site.css               The study page's chrome
css/editor.css             The editor's layout and controls
js/gl.js                   WebGL2 helpers, including parallel shader compiling
js/clock.js                The stepped clock and the 6-second loop
js/materials.js            Procedural material library: noise, fibers, foliage, paper, clay, beads, light
js/elements.js             Reusable art elements (canopy, florets, trunk, turf...) and the flower/leaf sprite shader
js/shapes.js               Shapes people make (outline, material, rough edge, puff, shadow) and imported images
js/items.js                Piece geometry: move/scale/rotate transforms, bounds, hit testing
js/post.js                 Post-processing shaders
js/renderer.js             Baking (only what changed), compositing, parallax, boil, the post stack
js/scenes/garden.js        The study as data: layers, depth, motion, grades
js/scenes/garden-art.js    The study's bespoke shaders (sky, clouds, hills, waterfall...)
js/app.js                  The study page: boot, reduced motion, pause when hidden, fallbacks
js/editor/doc.js           The scene document: checking files, look presets, undo, autosave
js/editor/library.js       The store's pieces and their credits
js/editor/actions.js       Editing actions shared by panels, canvas and keys
js/editor/fields.js        Labeled controls built from small definitions
js/editor/panels.js        Layers, store, Properties and Look panels
js/editor/canvas.js        Canvas fitting, selection overlay, handles, drawing, drops
js/editor/export.js        Scene files, PNG stills, video loops
js/editor/main.js          Editor boot, frame loop, shortcuts
tools/sample_palette.py    Samples colors and tone stats from reference frames or renders
```
