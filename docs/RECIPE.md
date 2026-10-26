# Recipe: the garden backdrop study

*This is a study of a looping backdrop from a podcast set: [show name and artists, to be filled in]. I'm not affiliated with the show or the people who made the backdrop. The study is the learning step. The original scenes I make afterwards are the actual project.*

This document is the look-dev analysis: what's in the scene, what colors it actually uses, how it moves and which ingredients make it look the way it does. Everything in it comes from three screenshots, so each claim is marked with how sure I can be about it.

## What the screenshots can and can't tell us

The evidence is three frames from a video episode. The reference frames live in `reference/`, which isn't committed.

| Frame | What it shows | Size |
| --- | --- | --- |
| 1 | A wide shot of the screen at an angle, from a different camera. Nobody is in front of it, so the center of the scene is visible. | 523×355, very soft |
| 2 | The main camera, straight on. The host covers the middle third. | 2289×1126 |
| 3 | Same camera and framing as 2, a different moment. | 2290×1056 |

Four limits shape everything below:

- **They're stills, so no motion can be measured.** The motion section is a hypothesis until I can step through real footage (see [Open questions](#open-questions)).
- **It's a screen filmed by a studio camera.** The colors are the camera's view of a TV, after that camera's exposure, white balance and contrast. Frame 1 is the same scene through a different camera, and it looks much grayer and flatter. So the palette below is a target for *the final frame*, not the colors of the original art.
- **Video compression smears fine detail.** Grain, chromatic aberration and halation can't be measured; compression would have erased them if they were subtle.
- **The host hides the center.** Frame 1 fills in the composition but is too small and soft for color sampling, so colors come from frames 2 and 3 only.

## Layer breakdown, back to front

The scene reads as a multiplane setup: flat layers at different depths with the camera locked off. Frame 1 shows something the brief didn't list: the middle of the scene is a **dark, flat-topped plateau**, and the waterfall pours off its right edge into a pool at the bottom right.

| # | Layer | What's in it | Material it reads as | Likely motion |
| --- | --- | --- | --- | --- |
| 0 | Sky | Vertical gradient: pale mint glow at the top, periwinkle clouds, lavender, a more violet band at the horizon. Soft, brushy clouds. A few small soft white specks in the upper sky (I can see 2–3 in frame 3). | Painted backdrop, airbrush or gouache | Slow cloud drift (maybe), specks twinkle |
| 1 | Horizon | A pale band of distant flower fields and a low tree line (frame 1 only). | Painted | None |
| 2 | Far hills | Rolling dark indigo mounds covered in tiny lavender specks. | Flocking with tiny beads or flowers | Boil only |
| 3 | Plateau and cliff | The dark central mass, and the purple cliff face beside the waterfall. | Sculpted, painted clay or foam | Boil only |
| 4 | Back trees | Trees behind the framing trees, on the left. Their canopy is noticeably bluer and paler than the front trees. | Same as the front trees, pushed back by haze | Boil only |
| 5 | Waterfall and pool | A cyan sheet with soft lighter vertical streaks, falling into a pool. | Airbrushed paint or a digital element. It's the least handmade-looking thing in the scene. | Cycle of streak frames, foam at the base |
| 6 | Mid ground | The big orchid on the left and a smaller, farther one on the right. Dark hedges dotted with small white and yellow flowers. A bright green slope and a rounded rock on the right. | Orchids: silk flower or painted paper. Hedges: flocked bush with bead flowers. | Orchids sway on their stems, hedges boil |
| 7 | Framing trees | Chunky trunks on the left and right edges with vertical bark streaks. Deep green canopies made of many small lit tufts with dark gaps. | Canopy: model-railroad clump foliage or lichen more than flat felt. Trunks: sculpted and painted. | Canopy tufts flutter, trunks still |
| 8 | Foreground beds | Coral tulips with streaky color and paler edges, a red daisy with a pale center, pink and lilac hydrangea-like clusters, white blooms. Saturated green leaves that look glossy and slightly see-through. | Silk flowers, felt, plastic leaves and stems | Sway and leaf flutter, biggest amplitude |
| 9 | Particles | The sky specks. Possibly more that compression hid. | n/a | Twinkle |

**Correction to the brief:** I'd call the canopy "clumped foliage" rather than felt. In the zoomed crops it's made of many separate rounded tufts with deep shadow between them, like the foliage clumps sold for model railroads, or lichen. Felt and wool roving can get close if they're teased into clumps. The asset plan photographs both.

**Unknown:** whether the original is physical stop motion, a 3D render made to look handmade, or a painting animated in layers. For this project it doesn't matter. The recipe is about how it reads, and that's the same either way.

## Palette

Sampled with [tools/sample_palette.py](../tools/sample_palette.py). Each swatch is either the dominant color of a small region (k-means) or the mean of pixels picked by a hue mask, so edges, the host and stray specks don't pull the value. "Lit" means the brightest 15–20% of those pixels. Frames 2 and 3 agree within a few levels on everything except one cloud sample, where the clouds themselves differ.

![Sampled palette with the brief's guesses shown as a strip on the right edge of each swatch](images/palette.png)

| Group | Swatch | Sampled | Brief's guess |
| --- | --- | --- | --- |
| Sky | Top glow | `#B7E7DD` | `#D8EFA0` |
| | Glow, most yellow pixels | `#BBE6C9` | |
| | Upper cloud | `#BBD4F5` | `#D9A9D6` (pink) |
| | Lavender | `#C7C1FB` | `#B9A6E0` |
| | Horizon violet | `#C8B7F8` | |
| | Sky behind the back trees | `#9B82B3` | |
| Land | Far hills | `#2B2543` | |
| | Far hills, flower specks | `#9884E7` | |
| | Mid hills | `#36447C` | `#5B4A8C` |
| | Cliff | `#4A426D` | |
| | Grass slope / lit | `#477658` / `#568C6B` | |
| Water | Waterfall shadow / body / streaks | `#1BA0F4` / `#35BAFA` / `#5CD5FD` | `#3FD0F0` to `#8FE8F6` |
| Trees | Trunk / lit side | `#303040` / `#3F424F` | `#4A3F4E` |
| | Canopy shadow | `#111D23` | |
| | Canopy | `#2B513B` | `#2F4A2E` |
| | Canopy, lit tufts | `#467055` | `#5A9A3A` (moss) |
| Flowers | Orchid / lit | `#763767` / `#8F587E` | `#B03A6A` |
| | Far orchid (right) | `#8B5FA4` | |
| | Coral tulip / lit | `#8A474F` / `#A56267` | `#E07060` |
| | Red bloom | `#581636` | |
| | Pink cluster, lit | `#8469A0` | |
| Frame | Darkest 1% of the visible scene | `#13181D` | |
| | Studio wall around the screen | `#938475` | |

What the numbers say:

1. **The guesses run lighter and warmer than the pixels, almost everywhere.** The orchid is plum (`#763767`), not magenta. The coral is a dusty rose (`#8A474F`, lit `#A56267`), not `#E07060`. The swatches look duller on their own than they do in the scene, because in the scene every color sits next to its complement and the eye pushes them apart. That's useful for the build: the art can be more muted than it feels, as long as the contrast between neighbors stays.
2. **There's no pink in the sky.** In the upper right sky, 0.1% of pixels have red clearly above green. What reads as pink is the violet near the horizon (`#C8B7F8`) next to the green trees.
3. **The glow isn't yellow-green, it's mint.** The most yellow 3.6% of the top band averages `#BBE6C9`. The pull toward yellow is again the lavender next to it.
4. **The water is more saturated and bluer than guessed,** and it never gets as pale as `#8FE8F6`. The blue channel clips at 255 in the waterfall and sky.
5. **Things farther away shift toward the sky color.** The far orchid (`#8B5FA4`) is lighter and bluer than the near one (`#763767`), and the back trees' canopy is visibly blue-violet next to the front trees' green. That's aerial perspective, and it's missing from the brief's ingredient list.

## The look, measured

Measured over the visible scene in frames 2 and 3, a left and a right strip that leave out the host. Luma uses Rec. 709 weights on 0–255 values.

| Measure | Frame 2 | Frame 3 | What it means |
| --- | --- | --- | --- |
| Luma, 1st percentile | 25 | 25 | Blacks are lifted to about 10%. Nothing big is truly black. |
| Luma, 99.9th percentile | 221 | 220 | Highlights stop around 86%. Even the brightest sky isn't white. |
| Max value per channel R / G / B | 215 / 255 / 255 | 224 / 252 / 255 | Red never reaches the top. The whole frame leans cool. |
| Color of the darkest 1% | `#13181D` | `#13181D` | Shadows are a cool blue-gray, not lavender. |
| Median saturation (HSV) | 0.38 | 0.38 | Moderate. The darks are rich; only the sky is truly pastel. |
| Noise in a flat sky patch (std, R / G / B) | 2.3 / 3.7 / 1.8 | 2.4 / 2.9 / 1.6 | Very little visible grain, but compression removes grain, so this is a floor, not the real amount. |

**Correction to the brief: the frame is cool, not warm.** The red cap, cool shadows and lavender-blue sky all point the same way. The warmth I'd felt watching it comes from two places: the coral and red flowers in the foreground, and the beige studio wall around the screen (`#938475`). On the portfolio page, a warm surround around the canvas might do the same job. That's worth testing in phase 3.

## Post-stack hypothesis

The brief's order holds, with one ingredient added (aerial tint) and the confidence of each one stated. Starting values come from the measurements where there are any. Everything else gets tuned by eye against the reference in phase 3.

| Order | Pass | Evidence | Confidence | Starting point |
| --- | --- | --- | --- | --- |
| 1 | **Aerial tint** (new). Each layer blends toward the sky's horizon color by its depth. Applied per layer while compositing, before any post. | Far orchid vs near orchid, back trees vs front trees | High | Far layers 30–40% toward `#C8B7F8`, mid layers 10–15%, foreground 0% |
| 2 | **Depth softness** on far layers | Far hills and back trees are softer than the foreground, but compression softens everything, so the difference is hard to separate | Medium | Small blur on layers 0–4 only |
| 3 | **Bloom / diffusion** | A light haze where the canopy meets the sky, and the overall low contrast. It could also be the studio camera's lens. | Medium | Half-resolution blur, low strength, threshold low enough that the sky contributes |
| 4 | **Halation** | No warm fringe at any bright edge I checked (waterfall against cliff, canopy against sky, orchid against sky) | Low | Built and toggleable, off by default |
| 5 | **Color grade** | The strongest evidence of anything here | High | Lift the floor to about 0.10 tinted toward `#13181D`. Cap white at about 0.86. Cap red at about 0.85–0.88. Leave saturation near the art's own and adjust from there. |
| 6 | **Chromatic aberration** | Can't be seen at this compression | Low | Built, off by default |
| 7 | **Vignette** | Can't separate it from the content and the camera | Low | Built, very light |
| 8 | **Grain** | Can't be measured (see above) | Low | Very fine, decided by eye. Try per frame and per beat. |

The big takeaway: **the grade and the aerial tint do most of the work**, and the soft glow is a supporting player. That's the reverse of what I expected going in, and it's the kind of thing the tuning panel should make visible: turning off the grade should change the scene the most.

## Motion inventory (hypothesis)

Nothing here is measured yet. This is what the scene's contents suggest, ordered by how much of the frame each element covers.

| Element | Motion | Type | Notes |
| --- | --- | --- | --- |
| Foreground flowers and leaves | Sway on stems, leaves flutter | Rotation around a pivot at the stem base, stepped on the beat | Biggest amplitude, closest to camera |
| Orchids | Slow sway | Same, smaller amplitude, longer period | The right one is far away, so it moves less on screen |
| Waterfall | Streaks travel down, foam churns at the base | A short cycle of swapped frames (or a stepped UV scroll that looks like one) | Probably 4–8 frames in the cycle |
| Canopy tufts | Flutter | Small per-tuft offsets on the beat | Might be boil only |
| Sky | Cloud drift | Very slow stepped scroll | Frames 2 and 3 differ around the upper cloud, but the framing also shifts by a few pixels between them, so I can't call it drift |
| Sky specks | Twinkle | Per-speck brightness on the beat | |
| Everything | Boil | Small seeded per-beat offset to UVs, edges and rotation | So nothing ever sits perfectly still |

**Stop-motion rate:** the brief's guess of 2s or 3s (8–12 fps) is plausible but unmeasured. With a short clip, I can measure it: count how often each region of the frame actually changes (ffmpeg frame differencing), which gives the real animation rate per element and the loop length.

## Open questions

1. **A short clip.** 10–30 seconds of the backdrop, recorded from an episode, kept in `reference/` and never committed. It would turn the motion section from a guess into measurements: animation rate, loop length, sway amplitudes, waterfall cycle length.
2. **Credit.** The show's name and, if it's known, who made the backdrop, for the attribution line at the top of this file and in the README.
3. **The asset route.** See [ASSETS.md](ASSETS.md). That decision sets how phase 2 builds layers.
