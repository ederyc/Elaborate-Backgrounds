# Testing and saved scenes

*Measured 2026-11-05 and 06 on my laptop (Intel Iris Xe, integrated graphics) in Chrome, with the page tests repeated in Edge. Concept, creative direction, art direction and design by Eder Yepez Cuevas. The code was written with help from Claude, Anthropic's AI coding assistant.*

## Why I did this

I wanted the editor checked properly before building more on it, and I wanted my recent work to show up on the home page. I also decided to keep the editor's look rather than move it toward Adobe's. I like its plum and cream themes and its handmade feel, so this round was about whether it works, not how it looks.

## How it was tested

[tests/run.mjs](../tests/run.mjs) drives a real browser through the DevTools protocol and needs nothing installed. Every test starts with a fresh profile, real mouse and keyboard input where it matters, and downloads denied, so a run leaves no files behind. Exports are read back from memory and checked: a PNG is decoded to measure it, and an MP4 is played back and compared frame by frame.

| Suite | What it checks |
| --- | --- |
| Pages | Every page and sample loads with no errors, draws a real picture, and every link works |
| Editing | Drawing, moving, undo and redo, every tool, the store, groups, every menu and dialog, and every piece of every sample in the inspector |
| Random input | 600 random clicks, drags and keys, three times over. Undoing everything and redoing it must give back the same scene |
| Saves | Work survives reloads, closing the page, new scenes and opened files. 14 damaged files are refused or repaired. HTML in a name stays text |
| Recent scenes | The home page list, pictures, switching scenes, remove and Undo, moving old saves across, two tabs at once |
| Export | 13 still sizes, the MP4, the live wallpaper, and a seam check that renders every beat of all four sample scenes |
| Performance | Time per frame, memory and graphics leaks over repeated opens, and a 200-layer scene |
| Layout | Six screen sizes in both themes, plus the home page |
| Accessibility | axe-core in every panel, dialog and theme, the Tab key through the interface, and focus returning after dialogs |
| Failure | No WebGL2, a graphics card reset, reduced motion, blocked storage and full storage |

## Results

| Run | Passed | Failed |
| --- | --- | --- |
| Before the changes | 62 of 77 | 15 |
| After the changes | 87 of 92 | 5, all one bug |
| Page tests in Edge | 13 of 13 | 0 |

The 15 failures in the first run came down to three things:

| Count | What it was | Outcome |
| --- | --- | --- |
| 4 | Real data loss | Fixed |
| 5 | One real bug: small buttons | Still open |
| 6 | Mistakes in the tests themselves | Tests corrected |

**The data loss was the important find.** The browser kept only one autosave and one scene set aside, and loading a scene counted as a change. Opening two samples, choosing New scene or opening a file could erase my work with no warning. The last second of work could also be lost when the page closed.

**The open bug.** The buttons that expand a layer's pieces are 18 px wide, and WCAG 2.2 asks for 24 px. On Lilac Falls, 13 of them fail, and 15 controls fall short on a phone. This is the only accessibility problem: with that one rule switched off, every axe scan and keyboard check passes. Earlier scans of this editor found no violations, so it most likely arrived with groups, which added these buttons.

**The test mistakes.** These were cases where the first draft of a test was wrong, and each one was checked before it was changed:

- Two focus checks looked only for an outline, and these controls show focus another way. A third never pressed Enter properly.
- The live wallpaper check matched labels on code already built into the file. The file plays with no errors.
- The phone tool row was flagged as cut off, but it scrolls sideways. The pen sits past the edge with no hint that it's there, which is worth improving.
- The MP4 check had a limit I'd guessed at. I measured it and raised the limit, as explained below.

## Numbers worth keeping

| Measure | Result |
| --- | --- |
| Time to open a sample | 0.5 to 0.9 s, or 1.1 s from a cold start |
| Time per frame, Lilac Falls | 4.3 ms typical, 7.5 ms at the 95th percentile |
| Time per frame, Reef Rave | 4.4 ms typical, 10.1 ms at the 95th percentile, 28.5 ms worst |
| Time per frame, Beach day | 4.6 ms typical, 10.2 ms at the 95th percentile |
| 200-layer scene | 15.5 ms typical per frame, 0.6 s to bake |
| Memory while reopening all three scenes, five more rounds | Steady: 4 MB of JavaScript heap, 137 textures, 14 framebuffers |
| Live wallpaper file | 0.43 MB |
| Exporting an MP4 | 2 loops at 1280 x 720 in 1.6 s |
| One save, as felt on the page | 14 ms alone, 57 ms during the busy full run |
| Random input | About 1,800 actions with no errors |

The frame times are for the editor's canvas in a 1600 x 900 window, not a full screen, in a browser running without a visible window.

**Do the loops really repeat?** Rendering beat 0 and the same beat a loop later gives identical pixels, with a difference of exactly 0. At the seam, the jump is no bigger than the largest jump between other beats in any sample. Inside a compressed MP4 of Lilac Falls, the second loop differs from the first by up to 3.4 out of 255 while the encoder settles, and by a later loop some frames match exactly. So the picture is exact and the small remaining difference is video compression.

## What I built

- **Every scene is its own save.** A scene joins the list at its first edit, so looking around a sample leaves nothing behind.
- **Pick up where you left off.** The home page lists my saved scenes, newest first, each with a picture and when I last edited it. The main button becomes *Continue* and the scene's name.
- **Recent scenes.** The same list is in the editor's File menu.
- **Remove with Undo.** Removing a scene can be undone, and it comes back whole.
- **Old saves move across.** Scenes saved before this change appear in the list by themselves.

The hardest part was the last second of work. The browser tears a closing page down before a slow save can begin, so the storage connection now stays open and the final save commits straight away.

## What this doesn't prove

- **Firefox and Safari are untested.** Neither was available here.
- **Lively and Wallpaper Engine are untested.** The live wallpaper has only been run in a browser.
- **Nobody else has used it yet.** These checks show that it works, not that it's easy to learn. The usability test in phase 11 still needs to happen.
- **Saved scenes stay in one browser.** Clearing its site data removes them, so scene files are the way to keep something for good. The same scene open in two tabs keeps whichever saved last.
