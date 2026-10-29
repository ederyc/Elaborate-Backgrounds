# Elaborate Backgrounds (work in progress)

Looping stop-motion backgrounds in the browser, in two parts:

- **The garden study** ([index.html](index.html)). A real-time WebGL2 recreation of the feel of a looping stop-motion backdrop: a handmade-looking fantasy garden with a waterfall, swaying flowers and a soft, warm, fuzzy filter. It's built as layered parallax quads on a stepped stop-motion clock, with a post stack on top.
- **The editor** ([editor.html](editor.html)). The study's recipe, turned into a tool for making your own wallpapers: layers at depths, ready-made pieces from a store, shapes you cut and texture yourself, and the whole look as switches and sliders. It exports PNG stills, video loops and scene files.
- **Beach day**, the editor's sample scene ([js/scenes/beach.js](js/scenes/beach.js)). A girl in a sun hat scoops sand into her bucket while waves roll in, palms sway, gulls fly past and a boardwalk crowd chatters in cardboard quote marks. Every piece is an ordinary editor shape, so all of it can be opened and changed.

![Beach day, one frame of the 6-second loop](docs/images/beach-day.jpg)

**The study is a study.** The original backdrop was made by Tamara for a podcast set. The show isn't named here, and I'm not affiliated with it. The study's art is entirely procedural (shader code, no images), written by Claude at my direction. So are the editor's starter pieces, which say so in the store, and the Beach day sample, which Claude built from the editor's own pieces. My own scenes and materials, photographed and drawn by me, come next and are the actual portfolio piece.

Status: phases 1 to 5 are done: the analysis, the rendering skeleton, the study, the first version of the editor, and the customizer and store (drawing and editing outlines, animating pose by pose, cut-outs from photos, real boil, My pieces and packs). The plan for the rest, including the store and 3D pieces, is in [docs/PLAN.md](docs/PLAN.md). The write-up of the look is in [docs/RECIPE.md](docs/RECIPE.md).

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

The first time, it opens the Beach day sample. **New** starts from a blank backdrop, the sample, or the garden study, each with every piece editable.

- **Select and move.** Click a piece to select it, then drag it. Drag the square handle to scale and the round one to rotate (Shift snaps to 15°). Select a layer in the list and drag inside its dashed box to move the whole layer.
- **Draw.** Pick a shape tool (R rectangle, E ellipse, T triangle, S star, C cloud) and drag on the canvas. New pieces go into the selected layer, or into a new layer if none can take them.
- **Your own outlines.** The pen tool (P) places points: click the first point, double-click or press Enter to close the shape. Double-click a custom outline, or press Enter with the canvas focused, to edit its points. Drag a point to move it, drag a + to add one, and Alt-click a point to remove it. From the keyboard, [ and ] pick a point, the arrows move it, + adds one after it and Delete removes it. "Smooth curves" in Properties rounds the outline.
- **Animate.** Give a layer poses in Properties (2 to 12, at a rate that fits the loop). Pose buttons appear under the canvas, and , and . step through them. With **This pose only** on, moving, scaling or rotating a piece changes just the pose on screen. **Onion skin** shows the previous pose faintly, **Copy previous pose** starts a new pose from the last one, and a piece can be hidden in single poses.
- **Cut-outs from photos.** Import a photo of a paper shape, select it, and use **Turn into a cut-out**. The editor guesses whether the shape is dark on light, light on dark, or a see-through PNG. You can change that, and move where the edge falls, with the Cut out settings under Shape. It then gets a handmade edge, puff and shadow like any shape.
- **Real boil.** On a picture or cut-out, pick a second and third photo of the same object under Boil photos. They swap on the beat.
- **Store.** Click a piece to add it in the middle of the frame, or drag it to a spot. **Import picture**, or dropping image files on the canvas, adds your own pictures. A shape's material can also be **Photo**, which fills it with one of them.
- **My pieces and packs.** **Save to My pieces** (for a piece) or **Save layer to My pieces** keeps it in this browser, under My pieces in the store. **Save as a pack** writes them all to one file with your name and a license line. **Install a pack** adds someone else's pack as its own store group.
- **Properties** has everything about the selected piece and its layer. **Look** has the beat rate, boil, grade and each post pass.
- **Keys.** Ctrl+Z and Ctrl+Shift+Z undo and redo. Ctrl+S saves the scene file, Ctrl+D duplicates and Space plays or pauses. On the canvas, the arrows move the selection (add Shift to move further), Delete removes it and Escape deselects. [ and ] move it backward or forward. , and . step through poses.
- **Saving.** The scene autosaves in this browser. **Save file** downloads a .json scene file (format in [docs/SCENE-FORMAT.md](docs/SCENE-FORMAT.md)), with your pictures embedded. **Export** saves a PNG at desktop or phone sizes, or records a 6-second video loop.

## Quality checks

Measured in Chrome 156 on this laptop (Intel Iris Xe, integrated graphics), driven by scripts through the DevTools protocol.

| Check | Result |
| --- | --- |
| The study, before and after the editor's engine changes | Same pixels at `?t=2.5`: largest difference 1 of 255, except where the new "Make your own" link sits in the caption |
| Editor ready, study scene loaded | 1.1 to 1.3 s (three runs, before Beach day) |
| Editor ready, Beach day loaded | 2.8 s (two runs): 1.8 s compiling the shape shader, 70 to 80 ms baking 125 textures. It was 2.4 to 2.6 s before cut-outs and smooth outlines. |
| Phase 5, scripted end to end | Pen outline of 5 points; point drag, Alt-click removal, keyboard add and move; smoothing; 4 poses with a move in pose 2 only, copy previous pose and onion skin; a photographed paper star turned into a cut-out (guessed "dark on light"); boil photos; save to My pieces, export a pack, delete, reinstall and add from it. All behaved as described. A file that isn't a pack was refused with a message. |
| Cut-out click testing | A red disc of radius 0.12: hit at 0.11 from its center, missed at 0.14 and in the empty corner |
| Beach day texture memory | About 78 MB at a 900 px tall bake (this test window). A 1080p screen bakes denser, so expect about 1.8 times that. |
| Beach day, a new beat | 0.2 ms median, 0.3 ms p95 to draw (30 beats, 976×549 canvas) |
| Beach day file round trip | Identical text, no warnings, 436 KB |
| Rebake after moving one piece, in the study's busiest layers | Median 0.6 to 1.2 ms, worst 6.8 ms (8 moves per layer, three runs) |
| Rebake after moving one of 25 shapes in one layer | 0.5 to 1.7 ms |
| Scene file round trip (save, open, save) | Identical text |
| Video loop, 1280×720 | MP4, 5.94 to 5.96 s long (six runs): the last beat is about 50 ms short, so a looping player shows a tiny hitch. Frame-exact export is planned (PLAN.md, phase 7). |
| axe-core 4.10 scan, editor | No violations with nothing selected, a piece selected, the Look tab, and the Export dialog; again in Beach day with a gull layer and one of the girl's pieces selected; and with an installed pack open, and with the pose strip showing |
| axe-core 4.10 scan, study page | No violations |
| Reduced motion | The editor doesn't autoplay; the play button reads "Play" |
| Width 420 px | No sideways scrolling; canvas first, then the panels |

Keyboard: every control in the panels is a native button, input or select with a visible label, and the canvas takes the arrow keys when focused. Moving pieces precisely without a mouse goes through the Placement sliders. The handles themselves need a mouse or touch.

Not measured yet: Lighthouse, frame times on a phone, and touch use. Handles are 12 px and outline points 10 px, which is small for fingers.

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
js/scenes/beach.js         The Beach day sample, built from editor shapes in a one-point perspective
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
