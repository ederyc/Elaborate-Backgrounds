# Garden study (work in progress)

A real-time WebGL2 recreation of the feel of a looping stop-motion backdrop: a handmade-looking fantasy garden with a waterfall, swaying flowers and a soft, warm, fuzzy filter. It's built as layered parallax quads on a stepped stop-motion clock, with a post stack on top.

**This is a study.** The original backdrop was made by Tamara for a podcast set. The show isn't named here, and I'm not affiliated with it. The study's art is entirely procedural (shader code, no images), written by Claude at my direction. My own scenes, with my own photographed and drawn materials, come next and are the actual portfolio piece.

Status: phases 1–3 of 6 are done (analysis, rendering skeleton, the study with its post stack). The full write-up is in [docs/RECIPE.md](docs/RECIPE.md).

## Running it

There's no build step and no dependencies. Serve the folder with any static server:

```sh
python -m http.server
# then open http://localhost:8000
```

URL switches, mostly for comparing ingredients:

| Switch | Does |
| --- | --- |
| `?grade=measured` | The grade matched to the reference's measured numbers, instead of the warm default |
| `?upto=base` (or `depth`, `bloom`, `halation`, `grade`, `ca`, `vignette`) | Turns the post passes on in order, up to and including that one |
| `?fps=8` (or `12`, `6`) | Stop-motion rate |
| `?boil=0`, `?motion=0` | No boil, or no animation |
| `?grain=frame` | Grain changes every rendered frame instead of once per beat |
| `?t=2.5` | Freeze at that point in the 6-second loop |
| `?stats=1` | Live frame times |

## Code tour

```
index.html                 The page, caption and play/pause control
css/tokens.css             The portfolio's tokens (copied from Resume/css/style.css)
css/site.css               Page chrome around the canvas
js/gl.js                   WebGL2 helpers, including parallel shader compiling
js/clock.js                The stepped clock and the 6-second loop
js/materials.js            Procedural material library: noise, fibers, foliage, paper, clay, beads, light
js/elements.js             Reusable art elements (canopy, florets, trunk, turf...) and the flower/leaf sprite shader
js/post.js                 Post-processing shaders
js/renderer.js             Baking, compositing, parallax, boil, the post stack
js/scenes/garden.js        The study as data: layers, depth, motion, grades
js/scenes/garden-art.js    The study's bespoke shaders (sky, clouds, hills, waterfall...)
js/app.js                  Boot, reduced motion, pause when hidden, fallbacks
tools/sample_palette.py    Samples colors and tone stats from reference frames or renders
```
