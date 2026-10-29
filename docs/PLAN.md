# Plan: from the study to an editor

*Status: phase 4 is built. Phases 5 to 9 are proposals for review, with the decisions that need you listed at the end.*

## The idea

The study answered "how is this look made?" The next step turns the answer into a tool: a website where anyone can make their own looping stop-motion wallpaper or background. They work in layers, use ready-made pieces from a store, or make their own from shapes and their own photos. Later, they may also make 3D pieces.

This changes the brief's plan. The old phase 4 was a scene file format plus a tuning panel. The editor needs both, so they became part of it. The original scenes (old phase 5) now get made *in* the editor, which is the best proof that it works.

## What phase 4 built

[editor.html](../editor.html) runs in the browser with no build step, like the study.

- **Layers.** Each layer is a flat plane at a depth, like a multiplane camera. It has depth (parallax), boil, haze, depth blur, opacity, an offset and a motion (still, drift or sway). Layers can be shown or hidden, locked, renamed, duplicated, deleted and reordered by dragging or with buttons.
- **Pieces inside layers.** Every piece can be moved, scaled and rotated on the canvas with handles, or set exactly in the Properties panel. Moving a piece rebakes only its layer, in about 1 ms on this laptop (numbers in the README).
- **Shapes and the customizer.** Five shape tools (rectangle, ellipse, triangle, star, cloud) draw by dragging. Any shape can become a rectangle, ellipse, polygon or star, or a blob of round lobes. It can be filled with painted paper, felt, clay, clumped foliage, a two-color wash, or a photo the user imported. Five controls give the handmade feel: rough cut edge, fiber fuzz, puff (the piece rounds over and catches the top-left light), cast shadow, and beads.
- **The store.** Ready-made pieces in four groups: shapes, plants, flowers that sway, and sky. Each shows who made it. Click to add one in the middle, or drag it to a spot. "Your images" holds the user's imported pictures.
- **The look.** The tuning panel from the brief: four presets (Warm dream, Measured, Clean, Moonlit), the beat rate, boil, every grade control, and an on/off switch for each post pass. "Copy settings as JSON" is there too.
- **Files and export.** Autosave in the browser. Scene files (.json) to save and open. PNG stills at desktop and phone sizes. A recorded 6-second video loop (MP4 in Chrome, WebM elsewhere).
- **The study is a template.** New → Garden study opens every piece of the study for editing. The study page itself renders exactly as before; a pixel comparison against the last commit differs only where the new "Make your own" link sits.

What it doesn't do yet: multi-select, grouping, editing the points of an outline, touch-sized handles, and frame-exact video. Scenes are 16:9; phone exports show a slice of the frame, chosen with the "phone crop" control.

## The first sample: Beach day

Built after phase 4, at your request, as a showcase of what the editor can already do. It's in [js/scenes/beach.js](../js/scenes/beach.js) and opens by default. Everything in it is an editor shape, so a person can click any piece and see how it's made.

It needed four additions to the editor, all general, all in the scene format and the Properties panel:

- **Custom outlines.** A shape can be a cut-out through up to 32 points: the shoreline, the palm fronds, the crowd's shoulders. The points can't be dragged yet; that's the outline editor in phase 5.
- **New materials.** Painted water, sand, stripes (straight bands or a fan, for umbrellas and towels), and cardboard.
- **Pose cycles.** A layer can step through a set of poses on the beat, and each piece moves, turns or hides from pose to pose. This is how the girl digs (12 poses), the waves roll in, the fronds sway and the gulls flap. It's replacement animation, the way stop motion is shot. Making poses by hand in the editor (a pose timeline) belongs in phase 5.
- **Travel.** A layer can cross the frame and loop, for the gulls.

Open question: **a name for the things people make.** Options, with my recommendation first:

1. **Sets.** The stop-motion word for the built world a scene is shot in, and it fits "make a set, dress it, shoot it." It can be confused with "a set of things."
2. **Backdrops.** Clear and matches the editor's name, but sounds static.
3. **Dioramas.** Captures the layered, handmade look, but is longer and less familiar as a word for a wallpaper.
4. **Loops.** Says what the output is (a seamless loop), but not what it looks like.

## The phases from here

Each phase ends with a stop for your review, as before.

### 5. The customizer and the store, properly (built)

The goal: a person can make a piece once and reuse it, and the store can grow without code changes.

Built, following recommendation 1 below (a free library that reads pack files): the pen tool and point editing, smooth outlines, pose cycles you can make and edit pose by pose (with onion skin), cut-outs from photos, boil photos, My pieces, and pack export and install. Not done: the built-in starter pieces are still code rather than a pack file (they're credited the same way), and the "Handmade materials" pack waits on your photos.

- **Draw your own outline.** Click points to make a closed shape, with smooth or sharp corners. It's stored as points, so it stays editable.
- **Masks from pictures.** Photograph a paper cut-out on white, import it, and use it as a shape's outline, filled with any material. This is the hybrid from [ASSETS.md](ASSETS.md) (hand-made masks plus photographed materials) inside the editor.
- **Real boil.** A piece can hold two or three photos of the same object nudged slightly, cycled on the beat.
- **My pieces.** Save a selection of pieces as a reusable piece of your own.
- **Packs.** A pack is a file of pieces with names, credits and a license line. The store reads packs, so new content is a file, not code. The built-in pieces become the first pack.
- **Your own materials.** Once you've shot the material library (felt, foliage, clay; the shot list in ASSETS.md), those photos become a "Handmade materials" pack credited to you. That's what makes the store's content yours.

### 6. 3D clay pieces (built)

Built the recommended way, with no library: sculpts of up to 16 rounded parts (balls, tapered tubes, rounded boxes, eggs, and parts that cut away), raymarched once per pose when the layer bakes. They're lit by the scene's key and fill, with a soft key shadow, ambient occlusion and a cast shadow, in clay, felt or shiny plastic. Properties edits the piece and each part, the canvas can pick and drag parts, and Turntable, Bounce and Wobble animate in one click. The store has six starter sculpts, and Beach day gained a floating rubber duck and a scuttling crab. Model import from Blender wasn't built; it still needs a library and your OK.

**Recommendation: sculpt from rounded primitives, raymarched in the bake shader, and baked into a few stop-motion frames.**

A 3D piece would be built from spheres, capsules and boxes that blend smoothly into each other, like clay pressed together. The bake shader raymarches it once per frame, lit by the same top-left key light, with the same materials (felt, clay, foliage). A turntable, a bob or a squash comes out as 3 to 12 baked frames, which the existing cycle animation already plays on the beat.

Why this route:

- It looks like the rest of the scene, because it uses the same light, materials and boil.
- It's real replacement animation, the way physical stop motion swaps sculpted poses.
- It needs no library, and the runtime cost is the same as any other layer: one textured quad.

The other route is importing models (glTF or OBJ) made in Blender. That needs a model loader (three.js or a small parser), which per the brief needs your OK. Imported models would also need a toon or clay shader to match the scene. It's worth doing later if people want their own models; it shouldn't come first.

### 7. Wallpaper output

- **Frame-exact video.** The current export records the canvas in real time. Measured in Chrome, files came out 5.94 to 5.96 seconds long in six runs, so the last beat is about 50 ms short when the file loops. Rendering each beat offline and encoding it with WebCodecs gives exact, seamless loops, faster than real time. It needs a small MP4 or WebM muxer: a library (your call) or about 200 lines written for this project.
- **Live wallpaper player.** A small page that plays a scene file. This could serve as a desktop live wallpaper (tools like Lively and Wallpaper Engine can show a web page) or as an embeddable UI background, the idea you raised earlier. It needs research on what each tool accepts before promising anything.
- **More sizes and shapes.** Ultrawide, 16:10, and true tall scenes for phones, not just a crop.

### 8. Original scenes, made in the editor

Your 2 or 3 original scenes (vineyard at golden hour, redwoods in fog, tidepool, mushroom grove at night), built in the editor with your own materials. Building them is also the first real usability test, and anything awkward goes back into the editor.

### 9. Portfolio packaging

README, CASE-STUDY, Lighthouse numbers, recorded loops, and a short usability test with 3 to 5 people making a wallpaper from scratch.

## Decisions that need you

1. **What "store" means.** A store that sells pieces needs accounts, payments, uploads and moderation, which means a backend, and GitHub Pages can't run one. My recommendation for the portfolio: a free library that reads pack files, designed so a paid store could sit on top later. The case study would show that design without pretending it exists.
2. **Who makes the store's content.** Right now every store piece is procedural code Claude wrote (labeled in the store). For the portfolio piece, the store's content should become yours: your photographed materials, your masks, your scenes. Should Claude's procedural pieces stay as a "starter" pack, clearly credited, or go once yours exist?
3. **3D route.** Raymarched clay primitives (recommended, no library) or model import (needs a library).
4. **Video encoding.** A muxer library for frame-exact video, or a hand-written one.
5. **Name.** The editor is called "Backdrop Editor" for now. The repo name is Elaborate Backgrounds.
