# Assets: where the handmade look comes from

*Status: proposal. The route isn't decided yet.*

No AI-generated imagery anywhere in this project. Every texture is a photo I took, every shape is drawn or cut by hand, and the procedural parts are code I wrote. The README will say which is which, layer by layer.

## The options

| | A. Fully procedural | B. Drawn by me | C. Real craft, photographed in poses | D. Hybrid (recommended) |
| --- | --- | --- | --- | --- |
| How | Shapes as SDFs or noise, a fiber-noise "felt" shader | Paint every layer in Krita, with material photos as texture | Build small set pieces, photograph each pose | Hand-made shape masks + photographed material textures + code for motion and light |
| New scene costs | A day of shader work | Several days of painting | A week or more of building and shooting | Draw or cut a few masks, maybe one new material shoot, write a scene file |
| Reads as handmade | Weakest. Procedural fibers look procedural up close. | Good, if the painting is good | Best, it *is* handmade | Strong where it counts: the textures are real |
| Motion | Free and unlimited | Code-driven sway and boil on painted layers | Every pose is a photo. Changing motion means reshooting. | Code-driven, so motion can change without reshooting |
| Shows | Shader skill | Illustration skill | Craft and patience | Shader skill, art direction and a reusable system |

## Recommendation: D

Your hybrid, with two refinements.

**What makes each layer:**

- **Shape: a hand-made mask.** A grayscale silhouette for each piece: a trunk, a hill, a petal, a leaf. Either draw it in Krita with deliberately uneven edges, or cut it from black paper with scissors and photograph it on white. Cut paper gives real scissor edges for free, and it's faster than it sounds.
- **Surface: a photographed material.** The shader fills the mask with a tileable texture photo (felt, foliage, clay, painted paper), tinted toward the layer's palette color. One photo of green felt can serve every leaf in every scene.
- **Light: baked consistently, finished in code.** Every photo is shot with the light from the same side (top left), so all the layers agree. Rim light, aerial tint and the grade are shader work.
- **Motion: code.** Sway, flutter, waterfall streaks, sparkles and boil are all driven by the stepped clock.

**Refinement 1: a few "hero" objects photographed whole.** A mask plus a flat texture can't capture a 3D clump of foliage or a silk tulip. For 2–4 hero pieces per scene, photograph the real object on a plain background and cut it out. Shoot three frames with the object nudged 1–2 mm between them: cycling those is *real* boil, from real material, which nothing procedural matches.

**Refinement 2: procedural only where the reference itself looks least handmade.** The sky gradient and the waterfall streaks are smooth and airbrushed in the reference, so they can be mostly code, with a painted-paper texture over the top to keep them from looking digital. The sparkles are fully procedural.

**Why D:** one or two afternoons of shooting builds a material library that every later scene reuses. That's what makes step 2 work: a new scene becomes new masks plus a scene file, not new code and not a new photo shoot each time. And the parts a viewer looks at most closely (the canopy and the flowers) are the parts that are real.

## Shot list

Ordered by how much each one matters to the study. If you only buy one thing, get the clump foliage: the canopy is the most recognizable material in the reference. Everything in the first five rows is a craft or hobby store item.

| # | Material | Colors | Used for | How to shoot it |
| --- | --- | --- | --- | --- |
| 1 | Model-railroad clump foliage, or lichen / reindeer moss | Dark, mid and light green | Canopy, hedges, moss | Flat swatch: pack it tight on a board, fill the frame. Plus 3 loose clumps on black as hero pieces, 3 nudged poses each. |
| 2 | Wool roving (needle-felting wool) | Green, lavender, white | Canopy alternative, moss, mist | Teased into clumps for one swatch, pulled thin for another |
| 3 | Craft felt sheets | Plum, coral, red, green, purple | Petals, leaves, hill base | Flat swatch with raking light so the fibers show |
| 4 | Fine turf or flocking, glued onto dark paper | Green, purple | Far hills, grass slope | Flat swatch |
| 5 | Seed beads or micro beads scattered on dark felt | White, lavender, pale yellow | Flower specks on the hills and hedges | Flat swatch. One extra shot slightly out of focus, as a reference for bokeh. |
| 6 | Paper washes you paint yourself (watercolor or gouache) | Lavender, periwinkle, mint, violet, cyan | Sky, water, cliff | Flat, soft light. Paint large, about 30×30 cm, with visible brush strokes. |
| 7 | Cotton balls or polyester fiberfill, pulled thin | White | Clouds, waterfall foam, mist | On black. Once lit from the front, once lit from behind. |
| 8 | Tissue paper, cellophane, or plastic leaves from silk flowers | Green, cyan | See-through leaves, water streaks | Backlit, taped to a window |
| 9 | Air-dry or polymer clay, smoothed with fingers, then painted | Gray-purple, dark brown | Trunks, cliff, rock | A flat slab with raking light, so fingerprints and tool marks show |
| 10 | Silk flowers: a tulip, an orchid-like flower, a daisy | As bought | Hero pieces, petal texture | On a plain background in a color the flower doesn't contain. 3 nudged poses each. |
| 11 | Fuzzy yarn (mohair or similar) | Brown-gray, green | Bark streaks, stems | Laid in parallel lines, flat swatch |

## How to shoot

**Gear:** your phone is enough. Also a tripod or a stack of books to hold the phone flat, a sheet of white printer paper, black and white poster board, painter's tape, and a white card or a second sheet of paper to bounce light.

**Light**

- Soft and diffuse. Daylight from a window on an overcast day, or a lamp bounced off a white wall. No direct sun and no bare bulbs.
- Put the main light on the **top left**, about 45° above the surface, so it rakes across the material and shows the fibers. Hold a white card on the opposite side so the shadows aren't black.
- Use the same setup for every shot in every session. The scene's lighting comes from these photos, so if one is lit from the right, it'll look wrong next to the rest.

**Camera settings**

- Turn off HDR, night mode, portrait mode, beauty filters and any "scene optimizer." They invent detail and shift colors.
- Lock focus and exposure before each shot (on most phones, press and hold on the subject).
- Shoot RAW (DNG) if your phone offers it. Otherwise use the highest quality JPEG.
- Use the 1× or 2× lens, never the ultrawide, because it bends straight lines.
- Hold the phone parallel to the surface, about 30–40 cm away.
- Start every session with one shot of the white paper in the same light. That's the white balance reference.

**Resolution and framing**

- Shoot at full resolution (12 MP or more).
- Flat swatches: cover a patch at least 15×15 cm and fill the frame. I'll crop and make it tileable at 2048×2048, then ship it at 1024×1024 for desktop and 512×512 for phones.
- Hero objects: the object fills about two thirds of the frame, with a little space around it. They ship at 2048 px or less on the long edge.
- Take three frames of each swatch with the material shifted a little between them. These become the boil variants.

**Files**

- Name them `material_color_variant`, for example `felt_green_a.jpg`, `felt_green_b.jpg`.
- Put the originals in `source-photos/` in this folder. It's in `.gitignore`, so the large originals stay off GitHub. Only the processed textures get committed.

## What happens after the shoot

I'll handle the processing: correct each photo to its white reference, crop it, make it tileable, and export the sizes. The steps get written down as part of the recipe, so they're repeatable for the original scenes.
