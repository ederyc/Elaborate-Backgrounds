# The editor's interface

How the Backdrop Editor looks and behaves, and the rules behind it. The styles are in [css/editor.css](../css/editor.css); the shared pieces (icons, toasts, menus, tooltips, motion helpers) are in [js/editor/ui.js](../js/editor/ui.js).

## The idea: an animator's craft table

The editor borrows from the scenes it makes instead of from Photoshop or Illustrator. The scenes are paper, felt and clay lit from the top left, so the interface is too:

- Panels are trays with a faint paper grain.
- Buttons are small raised chips: a highlight on the top-left edge, a shade below. They lift on hover and squish when pressed.
- The scene sits on a pasteboard with a dot grid, like a cutting mat.

## Layout

| Area | What's there |
| --- | --- |
| Top bar | Scene name, the save chip, File / Edit / View / Help menus, undo and redo, the theme switch, shortcuts, Present and Export |
| Rail (left edge) | The + button that opens the store, then the tools: select, pan, five shapes, the pen |
| Store drawer | Slides out over the layers from the + button: search, group chips, piece cards |
| Layers | The depth diagram, then the rows, front at the top, with buttons for new, duplicate, forward, backward and delete |
| Stage | The canvas, the zoom bar and the toasts |
| Timeline | Play, the beat track with ticks, the beat rate, and the pose strip when a layer has poses |
| Inspector (right) | Piece, Layer and Look tabs. The tab follows the selection |

Below 920 px wide everything stacks: the canvas first, then the inspector, then the layers. The rail becomes a row.

## Themes

Two themes, switched from the top bar and remembered in the browser:

- **Studio**: a warm dark plum.
- **Paper**: a light cream.

Every color is a token on `html[data-theme]`, so a component never names a raw color for its chrome.

| Token | Studio | Paper | Used for |
| --- | --- | --- | --- |
| `--desk` | #191523 | #E7DCC7 | The pasteboard behind the scene |
| `--tray` | #241E33 | #F7F0E3 | Panels |
| `--raise` | #352D4B | #FFFFFF | Raised chips and cards |
| `--ink` | #FBF3E6 | #2A2030 | Main text |
| `--ink-3` | #ABA0C2 | #6E5F77 | Quiet text, hints |
| `--sun` | #FFC94A | #E6A100 | Selection, focus, the active tool |
| `--coral` | #FF7A59 | #F06A47 | The main action (Add, Play, Export) |
| `--teal` | #3CC7B8 | #16A394 | "On": switches, playing |
| `--lilac` | #A98BFF | #7F5FE8 | Animation: poses, onion skin |
| `--pink` | #FF8FB8 | #E8679A | Your own things: My pieces, boil photos |
| `--sky` | #6DB6E8 | #3E93CF | Information, guides |

Each accent has one meaning everywhere. A card in the inspector takes the accent of its subject: Place is sky, Material coral, Handmade feel teal, Poses lilac.

### Depth colors

Layers are colored by depth the way haze cools distant hills: blue-violet for far, through cyan and green, to yellow and coral for near. The color appears in five places:

- the bar on the row's left edge;
- the number sticker;
- the card in the depth diagram;
- the layer chip in a piece's header;
- the Depth card, which changes color as its slider moves.

The function is `depthColor()` in ui.js.

## Type

| Font | Used for |
| --- | --- |
| Fraunces (soft, slightly wonky) | Panel titles, names and headings |
| IBM Plex Sans | Everything else |
| IBM Plex Mono | Numbers and keys |

## Components

- **Layer row.** A number sticker (1 is the front), the depth bar, a live thumbnail, the name, and a line with the piece count and badges (poses in lilac, motion in teal). Eye and lock float in on hover, and stay when they're on. Double-click or F2 renames in place. Drag to restack: a ghost follows the pointer and a glowing line shows where it lands.
- **Depth diagram.** Every layer is a card standing on a floor, far on the left, the camera on the right. Cards are spaced by their order in depth and sized by the depth itself. Pointing at the diagram magnifies it around the pointer, like a dock: the cards nearest it spread apart and the far ones fold together, so the layers on either side stay within reach. The card under the pointer turns from its angle to straight on, larger, with its name above and its pieces on a see-through background. Hovering a row in the list does the same for that layer. Click to select the layer facing you.
- **Groups.** Inside a layer, a group is a folder row with a count, foldable and renamable. On the canvas a group has one box with handles, and its pieces show as faint dashed outlines inside it. A piece inside a group carries both chips in its header: its layer and its group.
- **Store card.** A rendered thumbnail on a checkerboard. It hops on hover. A click flies the piece into the view and pops a ring where it lands. Dragging places it where you let go.
- **Section card.** An icon in the subject's accent color, a title, and a fold chevron (remembered per card). Some cards have a switch in the header, for the post passes: off dims the body.
- **Number field.** A slider plus an exact value. The label scrubs: drag it sideways to change the value (Shift is faster, Alt finer), and double-click it to reset. Arrow keys step the value in the box.
- **Pickers.** Outlines and motions are icon segments. Materials are tiles rendered with the piece's own colors. Look presets are small renders of your scene in each look.
- **Toasts** replace the old status line. They slide up over the canvas, and a delete carries an Undo button.
- **Menus** on the menubar, and on right-click over pieces, rows and the empty canvas. All of them work with the arrow keys, Enter and Escape.
- **Tooltips** show after a short hover, or on keyboard focus, with the shortcut beside the label.

## Motion

- Springy and quick: `cubic-bezier(.34, 1.56, .64, 1)`, 200 to 400 ms.
- Tools wiggle on hover, cards and tiles hop, toggles bump, and new selections spring in.
- The rail's highlight slides to the active tool, and rows slide into their new places when the order changes.
- Under `prefers-reduced-motion`, all of it stops: CSS animations, the scripted flights and pops, zoom easing and list sliding.

## Accessibility

- Every control is a native button, input or select with a name.
- Pickers are radio groups that work with the arrow keys.
- Card titles are headings, so a screen reader can jump card to card.
- The canvas takes the keyboard when focused, and every edit the mouse can make has a field in the inspector.
- Focus is a sun-colored ring.
- Text meets WCAG AA contrast in both themes; axe-core found no violations in either.

## Known limits

- Zoomed past 100% on a 1080p screen, the scene looks soft. Layers are baked for the screen's height (up to 1440 px), and zooming enlarges those textures. Exports aren't affected.
- When zoomed in, the vignette and grain apply to what's on screen, not to the scene's frame.
- Touch works, but the handles are sized for a mouse.
