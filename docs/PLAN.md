# Plan: from the study to an editor

*Status: phases 4 to 9 are built, plus saved scenes and a test suite. Phases 10 and 11 are next, and the decisions still open are listed at the end.*

## The idea

The study answered "how is this look made?" The next step turns the answer into a tool: a website where anyone can make their own looping stop-motion wallpaper or background. They work in layers, use ready-made pieces from a store, or make their own from shapes and their own photos. They can also sculpt 3D pieces.

This changed my original plan. The old phase 4 was a scene file format plus a tuning panel. The editor needs both, so they became part of it. The original scenes (the old phase 5) now get made *in* the editor, which is the best proof that it works.

## What phase 4 built

[editor.html](../editor.html) runs in the browser with no build step, like the study.

- **Layers.** Each layer is a flat plane at a depth, like a multiplane camera. It has depth (parallax), boil, haze, depth blur, opacity, an offset and a motion (still, drift or sway). Layers can be shown or hidden, locked, renamed, duplicated, deleted and reordered by dragging or with buttons.
- **Pieces inside layers.** Every piece can be moved, scaled and rotated on the canvas with handles, or set exactly in the Properties panel. Moving a piece rebakes only its layer, in about 1 ms on this laptop (numbers in the README).
- **Shapes and the customizer.** Five shape tools (rectangle, ellipse, triangle, star, cloud) draw by dragging. Any shape can become a rectangle, ellipse, polygon or star, or a blob of round lobes. It can be filled with painted paper, felt, clay, clumped foliage, a two-color wash, or a photo the user imported. Five controls give the handmade feel: rough cut edge, fiber fuzz, puff (the piece rounds over and catches the top-left light), cast shadow, and beads.
- **The store.** Ready-made pieces in four groups: shapes, plants, flowers that sway, and sky. Each shows where it comes from. Click to add one in the middle, or drag it to a spot. "Your images" holds the user's imported pictures.
- **The look.** The tuning panel: four presets (Warm dream, Measured, Clean, Moonlit), the beat rate, boil, every grade control, and an on/off switch for each post pass. "Copy settings as JSON" is there too.
- **Files and export.** Autosave in the browser. Scene files (.json) to save and open. PNG stills at desktop and phone sizes. A recorded 6-second video loop (MP4 in Chrome, WebM elsewhere).
- **The study is a template.** New → Garden study opens every piece of the study for editing. The study page itself renders exactly as before; a pixel comparison against the last commit differs only where the new "Make your own" link sits.

What it didn't do yet: multi-select, grouping, editing the points of an outline, touch-sized handles, and frame-exact video. Scenes were 16:9; phone exports showed a slice of the frame, chosen with the "phone crop" control.

## The first sample: Beach day

Built after phase 4 as a showcase of what the editor can already do. It's in [js/scenes/beach.js](../js/scenes/beach.js). Everything in it is an editor shape, so a person can click any piece and see how it's made. I set the brief: water coming in on the bottom left with the beach running diagonally to the right of it, a girl digging sand into her bucket, umbrellas, towels and people, palms and gulls on repeat, a crowd shown as one stylized shape with cardboard quote marks for its chatter, and a warm sunny filter with some fuzz.

It needed four additions to the editor, all general, all in the scene format and the Properties panel:

- **Custom outlines.** A shape can be a cut-out through up to 32 points: the shoreline, the palm fronds, the crowd's shoulders.
- **New materials.** Painted water, sand, stripes (straight bands or a fan, for umbrellas and towels), and cardboard.
- **Pose cycles.** A layer can step through a set of poses on the beat, and each piece moves, turns or hides from pose to pose. This is how the girl digs (12 poses), the waves roll in, the fronds sway and the gulls flap. It's replacement animation, the way stop motion is shot.
- **Travel.** A layer can cross the frame and loop, for the gulls.

Open question: **a name for the things people make.** The options I'm weighing:

1. **Sets.** The stop-motion word for the built world a scene is shot in, and it fits "make a set, dress it, shoot it." It can be confused with "a set of things."
2. **Backdrops.** Clear and matches the editor's name, but sounds static.
3. **Dioramas.** Captures the layered, handmade look, but is longer and less familiar as a word for a wallpaper.
4. **Loops.** Says what the output is (a seamless loop), but not what it looks like.

## The phases

Each phase ends with a review before the next one starts.

### 5. The customizer and the store, properly (built)

The goal: a person can make a piece once and reuse it, and the store can grow without code changes.

Built as a free library that reads pack files: the pen tool and point editing, smooth outlines, pose cycles made and edited pose by pose (with onion skin), cut-outs from photos, boil photos, My pieces, and pack export and install. Not done: the built-in starter pieces are still code rather than a pack file (they're labeled the same way), and the "Handmade materials" pack waits on my photos.

- **Draw your own outline.** Click points to make a closed shape, with smooth or sharp corners. It's stored as points, so it stays editable.
- **Masks from pictures.** Photograph a paper cut-out on white, import it, and use it as a shape's outline, filled with any material. This is the hybrid from [ASSETS.md](ASSETS.md) (hand-made masks plus photographed materials) inside the editor.
- **Real boil.** A piece can hold two or three photos of the same object nudged slightly, cycled on the beat.
- **My pieces.** Save a selection of pieces as a reusable piece of your own.
- **Packs.** A pack is a file of pieces with names, credits and a license line. The store reads packs, so new content is a file, not code.
- **My own materials.** Once I've shot the material library (felt, foliage, clay; the shot list in ASSETS.md), those photos become a "Handmade materials" pack. That's what makes the store's content mine.

### 6. 3D clay pieces (built)

Built without a library: sculpts of up to 16 rounded parts (balls, tapered tubes, rounded boxes, eggs, and parts that cut away), raymarched once per pose when the layer bakes. They're lit by the scene's key and fill, with a soft key shadow, ambient occlusion and a cast shadow, in clay, felt or shiny plastic. Properties edits the piece and each part, the canvas can pick and drag parts, and Turntable, Bounce and Wobble animate in one click. The store has six starter sculpts, and Beach day gained a floating rubber duck and a scuttling crab.

Why I chose sculpting from rounded primitives, raymarched in the bake shader and baked into a few stop-motion frames:

- It looks like the rest of the scene, because it uses the same light, materials and boil.
- It's real replacement animation, the way physical stop motion swaps sculpted poses.
- It needs no library, and the runtime cost is the same as any other layer: one textured quad.

The other route is importing models (glTF or OBJ) made in Blender. That needs a model loader (three.js or a small parser), and imported models would also need a toon or clay shader to match the scene. It's worth doing later if people want their own models; it shouldn't come first.

### 7. Wallpaper output (built)

Built with a hand-written MP4 writer, since I keep the project free of libraries unless one is clearly worth it. In summary:

- Exact loops come from WebCodecs. Every beat is rendered offline and gets its own timestamp, so files are exactly 6.000 s per loop at any size, and faster to make than real time. Measured results are in the README.
- The real-time recorder stays as a fallback for browsers without frame-by-frame encoding. Measured in Chrome, its files came out 5.94 to 5.96 seconds long in six runs, so its last beat runs about 50 ms short.
- A live wallpaper is one self-contained HTML file, and player.html embeds a scene as a page background. Using a scene as an embeddable UI background was one of my goals from the start.
- Scenes can be made in five screen shapes: desktop 16:9, ultrawide 21:9, laptop 16:10, square, and a tall phone.

Not tested yet: the live wallpaper file inside Lively Wallpaper or Wallpaper Engine themselves. Both can show a web page.

### 8. The interface and layout (built)

A new layout and look for the whole editor. My goals: as easy to use as an Adobe tool without copying Adobe's layout, understandable at a glance, and full of juice. The full design is in [UI.md](UI.md). In summary:

- **Layout.** A tool rail with a store drawer, Layers on the left, a full-stage canvas with zoom and pan, a timeline, and a Piece / Layer / Look inspector that follows the selection. There is a menubar and right-click menus.
- **Depth you can see.** Layers are numbered from the front and colored by depth (cool far, warm near), with a multiplane diagram above the list.
- **Visual controls.** Outlines and motions are picked by icon. Materials are swatches rendered in the piece's own colors, and looks are small renders of your scene. Number labels scrub.
- **Juice.**
  - Buttons lift and squish, tools wiggle, and store cards hop.
  - Pieces fly from the store onto the canvas and pop where they land.
  - Layer rows drag with a ghost and slide into place, and selections spring in.
  - All of it stops under reduced motion.
- **Quality of life.**
  - Toasts with Undo, snapping with guide lines, and crop guides for phone and desktop.
  - A shortcut sheet, present mode, a first-run tour, and two themes.
- **Palette.** A warm plum Studio theme and a cream Paper theme, with five accents that each mean one thing.

Added after reviewing it:

- **Groups inside layers.** Several objects can share a layer and stay selectable as wholes, the way Adobe tools group shapes. There's also merging a layer into another, and store pieces join the selected layer as a group. Beach day went from 37 layers to 31.
- **A depth view you can explore.** Hovering a layer turns its card to face you, and the diagram magnifies around the pointer like a dock, so the neighbors on both sides stay within reach.

Not done: touch-sized handles, sharper zoom past 100% (layers are baked for the screen's height), groups inside groups, and per-group motion (motion and pose timing still belong to a layer).

### 9. Our own scene, and a landing page (built)

**Lilac Falls** keeps the garden study's colors and mood but drops the study's layout, which followed the reference backdrop. In its place:
- a stepped clay cliff with a two-tier waterfall on the left;
- a pool running into a stream toward the viewer, under a footbridge;
- one blossom tree hung with wisteria on the right;
- felt clouds, a paper moon, butterflies and clay mushrooms.

The water is made like stop-motion water and animated by replacement, six frames on 2s:
- **Falls.** Each fall is two sheets of crinkled cellophane in strips of different blues. The streaks step down each frame, and creases and glints land somewhere new.
- **Foam.** Pulled cotton wool, re-tufted each frame, with glass-bead spray above it.
- **Pools and stream.** Poured resin, with clear ripple rings that grow one step a frame, painted gloss dashes, and streaks that step along the current.

It's the landing page now (index.html). The study moved to study.html, unchanged. The sky leaves room for the title, and a still shows at once while the shaders compile.

Not done: the shape shader's compile time. It's why the landing goes live about 1.5 s later than the study did.

### 10. Original scenes, made in the editor

My 2 or 3 original scenes (vineyard at golden hour, redwoods in fog, tidepool, mushroom grove at night), built in the editor with my own materials. Building them is also the first real usability test, and anything awkward goes back into the editor.

Started: **Reef Rave**, an octopus party in an underwater cave. I sketched the idea first as a concept image made with an image generator; that image isn't part of the project. The scene itself is drawn by code, like the others:
- **The cave.** Pitted rock frames an arched opening, lit warm at the top left, with a red wash from one side and a blue one from the other.
- **Light.** Each coral throws its own glow into the water. A laser rig re-aims its beams every frame, the way a laser show steps, and some beams cut out.
- **The crowd.** Three rows of felt octopuses bounce at 120 beats a minute, eight poses a second. Each dancer is its own group, so one can be moved without the rest.
- **The star.** A clay octopus in white sunglasses at the front. The glasses are flat shapes riding the head's bounce, because clay parts blend into each other.

The first version looked at the party from outside. I wanted it to feel like being in it: a packed party under cheap colored lights, a little tipsy, with things going on all around you. The second pass:
- **Party lighting.** LED bars wash the room a new color every quarter second, a strobe goes off every two seconds, and a party light's projected dots turn across everything a step at a time. These are light, not paint: they add onto what's under them.
- **Things too close to focus on.** The backs of two partygoers' heads, an arm raising a red cup, and a string of bulbs hang right in front of the lens, blurred into bokeh. That needed a new layer setting, *Out of focus, right by the lens*, and a new blur pass for it.
- **A tipsy camera.** A new Look section: the frame leans and breathes a step on each beat, sees double, and goes soft at the edges. The camera also drifts more, so the near layers slide past the far ones.

### Saved scenes and the test suite (built)

I first wanted my recent work to show up on the home page. Looking into it, the browser only kept one autosave and one scene set aside, and testing showed that wasn't safe: opening two samples, choosing New scene or opening a file could erase what I'd been working on, with no warning.

- **Every scene is its own save.** A scene joins the saved list at its first edit, so looking around a sample leaves nothing behind. The address follows the open scene, so a reload comes back to it. Older saves move across on their own.
- **Pick up where you left off.** The home page shows my saved scenes, newest first, each with a picture and when I last edited it. Its main button becomes *Continue* and the scene's name. The editor has the same list in File, Recent scenes.
- **The last second of work is kept.** Changes save a second after the last edit, and straight away when the scene changes or the page closes.
- **A test suite.** [tests/run.mjs](../tests/run.mjs) checks pages, editing, random input, saving, damaged files, exports, loop seams, speed, leaks, layouts, accessibility and failures such as a lost graphics card or blocked storage.

Limits: saves live in one browser on one computer, and clearing its site data removes them, so scene files are still the way to keep something for good. The same scene open in two tabs keeps whichever saved last.

### 11. Portfolio packaging

README, CASE-STUDY, Lighthouse numbers, recorded loops, and a short usability test with 3 to 5 people making a wallpaper from scratch.

## Decisions

1. **What "store" means.** Chosen for now: a free library that reads pack files, designed so a paid store could sit on top later. A store that sells pieces needs accounts, payments, uploads and moderation, which means a backend, and GitHub Pages can't run one. The case study will show that design without pretending it exists.
2. **Who makes the store's content.** Right now every store piece is procedural (labeled in the store). For the portfolio, the store's content should become mine: my photographed materials, my masks, my scenes. Still open: whether the procedural pieces stay as a "starter" pack once mine exist.
3. **3D route.** Decided: raymarched clay primitives, no library (phase 6).
4. **Video encoding.** Decided: a hand-written MP4 writer (phase 7).
5. **Name.** Still open. The editor is called "Backdrop Editor" for now; the project is Elaborate Backgrounds.
