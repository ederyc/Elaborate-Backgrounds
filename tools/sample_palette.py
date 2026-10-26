"""Sample the study palette from the reference frames.

Dev-only tool, not part of the site. Needs Pillow and NumPy:

    python -m pip install pillow numpy
    python tools/sample_palette.py reference docs/images/palette.png

The reference frames (reference/2.png and reference/3.png) are screenshots of
the podcast set and are kept out of git. Regions are given in "display"
coordinates, the frame scaled to 2000px wide, so they survive re-captures at a
different size as long as the framing matches.

Each swatch is either a region's dominant color (k-means, largest cluster) or
the mean of pixels picked by a hue mask, so the host, edges and stray specks
don't pull the color. "lit" means the brightest 15-20% of the masked pixels.
"""

import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFont


def hexcolor(c):
    if np.isnan(c).any():
        return "n/a"  # the mask matched no pixels
    return "#%02X%02X%02X" % tuple(int(round(v)) for v in c)


def dominant(px, k=3, iters=12):
    rng = np.random.default_rng(1)
    centers = px[rng.choice(len(px), k, replace=False)]
    for _ in range(iters):
        labels = ((px[:, None, :] - centers[None]) ** 2).sum(-1).argmin(1)
        centers = np.array([px[labels == j].mean(0) if (labels == j).any() else centers[j] for j in range(k)])
    counts = np.bincount(labels, minlength=k)
    return centers[counts.argmax()]


def masked(px, mask, lit=None):
    sel = px[mask(px)]
    if len(sel) == 0:
        return np.full(3, np.nan)
    if lit is None:
        return sel.mean(0)
    s = sel.sum(1)
    return sel[s >= np.percentile(s, 100 - lit)].mean(0)


R, G, B = 0, 1, 2
# group, name, frame, box (x0, y0, x1, y1), method, the brief's guess
SAMPLES = [
    ("Sky", "Top glow", "2", (840, 20, 1000, 50), ("dom",), "#D8EFA0"),
    ("Sky", "Glow, most yellow", "2", (600, 5, 1600, 140),
     ("mask", lambda p: (p[:, G] - p[:, B] > 25) & (p[:, G] > 190), None), None),
    ("Sky", "Upper cloud", "2", (1210, 100, 1310, 135), ("dom",), "#D9A9D6"),
    ("Sky", "Lavender", "2", (1300, 205, 1410, 255), ("dom",), "#B9A6E0"),
    ("Sky", "Horizon violet", "2", (1260, 290, 1390, 312), ("dom",), None),
    ("Sky", "Behind back trees", "2", (215, 230, 250, 280), ("dom",), None),
    ("Land", "Far hills", "2", (440, 305, 515, 335), ("dom",), None),
    ("Land", "Far hills, flower specks", "2", (440, 305, 515, 335),
     ("mask", lambda p: p.sum(1) > 420, None), None),
    ("Land", "Mid hills", "2", (760, 520, 850, 600), ("dom",), "#5B4A8C"),
    ("Land", "Cliff", "2", (1535, 455, 1585, 515), ("dom",), None),
    ("Land", "Grass slope", "2", (1380, 640, 1560, 780),
     ("mask", lambda p: (p[:, G] > p[:, R] + 30) & (p[:, G] > p[:, B]), None), None),
    ("Land", "Grass slope, lit", "2", (1380, 640, 1560, 780),
     ("mask", lambda p: (p[:, G] > p[:, R] + 30) & (p[:, G] > p[:, B]), 15), None),
    ("Water", "Waterfall, shadow", "2", (1280, 400, 1520, 700),
     ("mask", lambda p: (p[:, B] > 200) & (p[:, R] < 150), -15), "#3FD0F0"),
    ("Water", "Waterfall, body", "2", (1280, 400, 1520, 700),
     ("mask", lambda p: (p[:, B] > 200) & (p[:, R] < 150), None), None),
    ("Water", "Waterfall, streaks", "2", (1280, 400, 1520, 700),
     ("mask", lambda p: (p[:, B] > 200) & (p[:, R] < 150), 15), "#8FE8F6"),
    ("Trees", "Trunk", "2", (145, 320, 185, 580), ("dom",), "#4A3F4E"),
    ("Trees", "Trunk, lit side", "2", (1815, 320, 1875, 580), ("dom",), None),
    ("Trees", "Canopy, shadow", "2", (320, 50, 470, 130), ("dom",), None),
    ("Trees", "Canopy", "2", (1560, 10, 1950, 250),
     ("mask", lambda p: (p[:, G] > p[:, R] + 30) & (p[:, G] > p[:, B] + 15), None), "#2F4A2E"),
    ("Trees", "Canopy, lit tufts", "2", (1560, 10, 1950, 250),
     ("mask", lambda p: (p[:, G] > p[:, R] + 30) & (p[:, G] > p[:, B] + 15), 10), "#5A9A3A"),
    ("Flowers", "Orchid", "2", (600, 220, 780, 470),
     ("mask", lambda p: (p[:, R] > p[:, G] + 40) & (p[:, R] > p[:, B] - 10), None), "#B03A6A"),
    ("Flowers", "Orchid, lit", "2", (600, 220, 780, 470),
     ("mask", lambda p: (p[:, R] > p[:, G] + 40) & (p[:, R] > p[:, B] - 10), 20), None),
    ("Flowers", "Far orchid (right)", "2", (1455, 225, 1495, 265), ("dom",), None),
    ("Flowers", "Coral tulip", "2", (450, 600, 720, 730),
     ("mask", lambda p: p[:, R] > p[:, G] + 50, None), "#E07060"),
    ("Flowers", "Coral tulip, lit", "2", (450, 600, 720, 730),
     ("mask", lambda p: p[:, R] > p[:, G] + 50, 20), None),
    ("Flowers", "Red bloom", "2", (150, 500, 280, 600),
     ("mask", lambda p: p[:, R] > p[:, G] + 60, None), None),
    ("Flowers", "Pink cluster, lit", "2", (370, 550, 480, 630), ("lit", 15), None),
    ("Frame", "Darkest 1% of the scene", "2", None, ("floor",), None),
    ("Frame", "Studio wall around the screen", "2", (30, 300, 90, 700), ("dom",), None),
]


def sample(frames, frame, box, method):
    im = frames[frame]
    a = np.asarray(im).astype(float)
    s = im.width / 2000
    if method[0] == "floor":
        # The visible scene minus the host: a left and a right strip.
        strips = [a[int(10 * s):int(860 * s), int(x0 * s):int(x1 * s)].reshape(-1, 3)
                  for x0, x1 in ((115, 840), (1270, 1940))]
        px = np.concatenate(strips)
        luma = px @ [0.2126, 0.7152, 0.0722]
        return px[luma <= np.percentile(luma, 1)].mean(0)
    x0, y0, x1, y1 = box
    px = a[int(y0 * s):int(y1 * s), int(x0 * s):int(x1 * s)].reshape(-1, 3)
    if method[0] == "dom":
        return dominant(px)
    if method[0] == "lit":
        tot = px.sum(1)
        return px[tot >= np.percentile(tot, 100 - method[1])].mean(0)
    _, mask, lit = method
    if lit is not None and lit < 0:  # darkest share instead of brightest
        sel = px[mask(px)]
        if len(sel) == 0:
            return np.full(3, np.nan)
        tot = sel.sum(1)
        return sel[tot <= np.percentile(tot, -lit)].mean(0)
    return masked(px, mask, lit)


def tonal_stats(frames):
    for key in ("2", "3"):
        im = frames[key]
        a = np.asarray(im).astype(float)
        s = im.width / 2000
        strips = np.concatenate([a[int(10 * s):int(860 * s), int(x0 * s):int(x1 * s)].reshape(-1, 3)
                                 for x0, x1 in ((115, 840), (1270, 1940))])
        luma = strips @ [0.2126, 0.7152, 0.0722]
        pct = [round(float(np.percentile(luma, p))) for p in (1, 50, 99, 99.9)]
        mx, mn = strips.max(1), strips.min(1)
        sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0)
        sky = a[int(205 * s):int(255 * s), int(1300 * s):int(1410 * s)].reshape(-1, 3)
        print(f"frame {key}: luma p1/p50/p99/p99.9 = {pct}, channel max R/G/B = {strips.max(0).astype(int)}, "
              f"saturation median = {np.median(sat):.2f}, flat-sky std R/G/B = {sky.std(0).round(1)}")


def draw_sheet(rows, out_path):
    try:
        font = ImageFont.truetype("segoeui.ttf", 18)
        small = ImageFont.truetype("segoeui.ttf", 15)
        bold = ImageFont.truetype("segoeuib.ttf", 20)
    except OSError:
        font = small = bold = ImageFont.load_default()
    groups = []
    for r in rows:
        if not groups or groups[-1][0] != r[0]:
            groups.append((r[0], []))
        groups[-1][1].append(r)
    col_w, sw, row_h, pad = 420, 64, 52, 24
    cols = 2
    # Lay groups out in two columns, balancing height.
    heights = [40 + len(g[1]) * row_h for g in groups]
    left, right, hl, hr = [], [], 0, 0
    for g, h in zip(groups, heights):
        if hl <= hr:
            left.append(g); hl += h + 16
        else:
            right.append(g); hr += h + 16
    W = pad * 2 + col_w * cols + 24
    H = pad * 2 + max(hl, hr)
    img = Image.new("RGB", (W, H), "#FFFFFF")
    d = ImageDraw.Draw(img)
    for ci, col in enumerate((left, right)):
        x = pad + ci * (col_w + 24)
        y = pad
        for name, items in col:
            d.text((x, y), name, fill="#1A1A1A", font=bold)
            y += 40
            for _, label, color, guess in items:
                d.rectangle([x, y, x + sw, y + row_h - 10], fill=color if color != "n/a" else "#FFFFFF", outline="#CCCCCC")
                if guess:
                    # The brief's guess as a strip on the right edge of the swatch, for comparison.
                    d.rectangle([x + sw - 16, y, x + sw, y + row_h - 10], fill=guess)
                d.text((x + sw + 14, y + 1), label, fill="#1A1A1A", font=font)
                note = color + (f"   (brief guessed {guess})" if guess else "")
                d.text((x + sw + 14, y + 23), note, fill="#4D4D4D", font=small)
                y += row_h
            y += 16
    img.save(out_path)


def main():
    ref_dir = sys.argv[1] if len(sys.argv) > 1 else "reference"
    out = sys.argv[2] if len(sys.argv) > 2 else "docs/images/palette.png"
    frames = {k: Image.open(f"{ref_dir}/{k}.png").convert("RGB") for k in ("2", "3")}
    rows = []
    for group, name, frame, box, method, guess in SAMPLES:
        c2 = hexcolor(sample(frames, frame, box, method))
        c3 = hexcolor(sample(frames, "3", box, method))
        print(f"{group:8s} {name:30s} {c2}  (frame 3: {c3})" + (f"  guess {guess}" if guess else ""))
        rows.append((group, name, c2, guess))
    tonal_stats(frames)
    draw_sheet(rows, out)
    print("wrote", out)


if __name__ == "__main__":
    main()
