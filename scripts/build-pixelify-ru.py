"""Builds assets/fonts/PixelifySans-Ru.ttf, the Russian face of the game, from PixelifySans-Variable.ttf.

Pixelify Sans reads poorly in Russian at small sizes, so this static Regular cut changes it a little:
  * ь, ъ, ы: the stem stopped at capital height, so they read as "b" and "bl". The stem now ends at x-height and the
    bowl is the one of б (lower, with a one-pixel hole).
  * д: a shrunken Д sitting on the baseline, read as "A". The bar now sits on the baseline and two feet hang below it,
    as on ц.
  * every glyph is 5% of an em wider (air between letters), and lines are a little taller (ascent and descent +5%).
The font is under the SIL OFL 1.1 and declares no Reserved Font Name (see assets/fonts/FONT_LICENSES.txt).

Run: python -P scripts/build-pixelify-ru.py   (needs fonttools)
"""
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC = "assets/fonts/PixelifySans-Variable.ttf"
DST = "assets/fonts/PixelifySans-Ru.ttf"
LETTER_SPACING_EM = 0.05
LINE_EXTRA = 0.05

font = instancer.instantiateVariableFont(TTFont(SRC), {"wght": 400})
glyf = font["glyf"]
hmtx = font["hmtx"]
cmap = font.getBestCmap()


def remap_y(glyph_name, mapping, keep_contour=None):
    """Moves points to new heights; points of the contour `keep_contour` (an index) stay where they are."""
    glyph = glyf[glyph_name]
    coords, ends, _ = glyph.getCoordinates(glyf)
    start = 0
    for index, end in enumerate(ends):
        for i in range(start, end + 1):
            x, y = coords[i]
            if index != keep_contour and y in mapping:
                coords[i] = (x, mapping[y])
        start = end + 1
    glyph.coordinates = coords
    glyph.recalcBounds(glyf)


# soft sign family: stem to x-height (631 -> 450), bowl as on б (outer 450 -> 359, corner 359 -> 270, hole 350 -> 260)
SOFT = {631: 450, 450: 359, 359: 270, 350: 260}
remap_y(cmap[0x044C], SOFT)  # ь
remap_y(cmap[0x044A], {**SOFT, 530: 359})  # ъ: its little flag ends where the bowl starts
remap_y(cmap[0x044B], SOFT)  # ы: the bar (third contour) follows the stem: 631 -> 450
# д: feet below the baseline, the bar on it, a taller hole
remap_y(cmap[0x0434], {-12: -102, 79: -12, 180: 79})


def contours_above(glyph_name, min_y):
    """The outlines of a glyph that lie wholly above min_y (the dots of ё), as point lists."""
    glyph = glyf[glyph_name]
    coords, ends, _ = glyph.getCoordinates(glyf)
    out, start = [], 0
    for end in ends:
        points = [(int(x), int(y)) for x, y in coords[start:end + 1]]
        if min(y for _, y in points) >= min_y:
            out.append(points)
        start = end + 1
    return out


def draw_rects(glyph_name, rects, keep=()):
    """Replaces a glyph by pixel rectangles (x0, y0, x1, y1), each drawn clockwise; overlaps fill (non-zero).
    `keep` adds outlines taken from the old glyph (point lists)."""
    from fontTools.pens.ttGlyphPen import TTGlyphPen

    pen = TTGlyphPen(None)
    for points in keep:
        pen.moveTo(points[0])
        for point in points[1:]:
            pen.lineTo(point)
        pen.closePath()
    for x0, y0, x1, y1 in rects:
        pen.moveTo((x0, y0))
        pen.lineTo((x0, y1))
        pen.lineTo((x1, y1))
        pen.lineTo((x1, y0))
        pen.closePath()
    glyf[glyph_name] = pen.glyph()
    glyf[glyph_name].recalcBounds(glyf)
    advance, _ = hmtx[glyph_name]
    hmtx[glyph_name] = (advance, glyf[glyph_name].xMin)


# в: drawn like "e" (one round bowl). Now a small В on the grid of п: a stem and two stacked bowls with pixel corners.
draw_rects(cmap[0x0432], [
    (60, -12, 161, 450),   # stem
    (161, 359, 423, 450),  # top bar
    (161, 180, 423, 271),  # middle bar
    (161, -12, 423, 78),   # bottom bar
    (423, 271, 525, 359),  # upper bowl, right side
    (423, 78, 525, 180),   # lower bowl, right side
])

# е: read as a mirrored э. Now the pixel "e": a round top, a full middle bar, an open right side and a foot.
E_RECTS = [
    (161, 359, 423, 450),  # top
    (60, 78, 161, 359),    # left side
    (423, 271, 525, 359),  # right side, upper half only
    (60, 180, 525, 271),   # middle bar
    (161, -12, 525, 78),   # bottom with its foot to the right
]
dots = contours_above(cmap[0x0451], 451)  # ё keeps its own dots
draw_rects(cmap[0x0435], E_RECTS)
draw_rects(cmap[0x0451], E_RECTS, keep=dots)

# Э: the same outline as З in the original font. Now a solid right side and a short middle bar, as on э.
draw_rects(cmap[0x042D], [
    (151, 540, 433, 631),  # top
    (60, 440, 161, 540),   # upper left end
    (433, 78, 525, 540),   # right side
    (241, 270, 433, 359),  # middle bar
    (60, 78, 161, 179),    # lower left end
    (151, -12, 433, 78),   # bottom
])

# з: the same outline as э. Now a small 3: the right side is broken where the middle bar comes in.
draw_rects(cmap[0x0437], [
    (151, 359, 433, 450),  # top
    (60, 260, 161, 359),   # upper left end
    (433, 270, 525, 359),  # right side, upper bowl
    (241, 169, 433, 270),  # middle bar
    (433, 78, 525, 169),   # right side, lower bowl
    (60, 79, 161, 180),    # lower left end
    (151, -12, 433, 78),   # bottom
])

# т: looked like an arrow. Now a plain small Т: a bar on top and a stem in the middle.
draw_rects(cmap[0x0442], [
    (60, 359, 525, 450),   # bar
    (242, -12, 343, 359),  # stem
])

upm = font["head"].unitsPerEm
add = round(upm * LETTER_SPACING_EM)
for name, (advance, lsb) in list(hmtx.metrics.items()):
    if advance > 0:
        hmtx.metrics[name] = (advance + add, lsb)
font["hhea"].advanceWidthMax += add

extra = round(upm * LINE_EXTRA)
hhea, os2 = font["hhea"], font["OS/2"]
hhea.ascent += extra
hhea.descent -= extra
os2.sTypoAscender += extra
os2.sTypoDescender -= extra
os2.usWinAscent += extra
os2.usWinDescent += extra

font.save(DST)
print(f"wrote {DST}: +{add} units per letter, +{extra} above and below")
