"""Generates the Rich Presence art (1024x1024 PNG, pixel style) into docs/discord/assets/.
Run: python docs/discord/make_assets.py   (needs Pillow). The file names are the Discord asset keys."""
import os
import random
from PIL import Image

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "assets")
N = 64           # logical pixels per side
SCALE = 1024 // N

PIECE = {
    "orange": (227, 143, 16), "red": (186, 19, 38), "green": (16, 158, 40),
    "blue": (20, 56, 184), "purple": (101, 19, 148), "cyan": (31, 165, 222),
}
GOLD = (240, 175, 12)
WHITE = (240, 240, 240)
DARK = (14, 8, 24)


def shade(c, f):
    return tuple(max(0, min(255, int(v * f))) for v in c)


class Canvas:
    def __init__(self, seed, tint):
        self.img = Image.new("RGB", (N, N), DARK)
        self.px = self.img.load()
        rnd = random.Random(seed)
        # dark gradient with a little dithering and a few stars
        for y in range(N):
            for x in range(N):
                t = y / N
                base = (int(18 + 30 * t + tint[0] * 0.10), int(8 + 14 * t + tint[1] * 0.10), int(34 + 30 * t + tint[2] * 0.10))
                if (x + y) % 2 == 0 and rnd.random() < 0.18:
                    base = shade(base, 1.25)
                self.px[x, y] = base
        for _ in range(26):
            self.px[rnd.randrange(N), rnd.randrange(N)] = shade(tint, 1.1)
        # gold frame
        for i in range(N):
            for k in range(2):
                for (x, y) in ((i, k), (i, N - 1 - k), (k, i), (N - 1 - k, i)):
                    self.px[x, y] = GOLD if k == 0 else shade(GOLD, 0.55)

    def dot(self, x, y, c):
        if 0 <= x < N and 0 <= y < N:
            self.px[x, y] = c

    def rect(self, x, y, w, h, c):
        for yy in range(y, y + h):
            for xx in range(x, x + w):
                self.dot(xx, yy, c)

    def block(self, x, y, color, size=6):
        """A game block: light top-left edge, dark bottom-right edge."""
        self.rect(x, y, size, size, color)
        self.rect(x, y, size, 1, shade(color, 1.45))
        self.rect(x, y, 1, size, shade(color, 1.45))
        self.rect(x, y + size - 1, size, 1, shade(color, 0.55))
        self.rect(x + size - 1, y, 1, size, shade(color, 0.55))

    def bitmap(self, x, y, rows, palette, scale=1):
        for j, row in enumerate(rows):
            for i, ch in enumerate(row):
                if ch in palette:
                    self.rect(x + i * scale, y + j * scale, scale, scale, palette[ch])

    def board(self, x, y, cells, cell, cells_map, border=GOLD):
        """cells x cells grid, cells_map: {(cx, cy): color}"""
        side = cells * cell
        self.rect(x - 1, y - 1, side + 2, side + 2, border)
        self.rect(x, y, side, side, (6, 4, 12))
        for cy in range(cells):
            for cx in range(cells):
                if (cx + cy) % 2 == 0:
                    self.rect(x + cx * cell, y + cy * cell, cell, cell, (12, 9, 22))
        for (cx, cy), color in cells_map.items():
            self.block(x + cx * cell, y + cy * cell, color, cell)

    def save(self, name):
        os.makedirs(OUT, exist_ok=True)
        self.img.resize((1024, 1024), Image.NEAREST).save(os.path.join(OUT, name + ".png"))


def classic():
    c = Canvas(1, PIECE["orange"])
    m = {}
    cols = [PIECE["orange"], PIECE["green"], PIECE["blue"], PIECE["purple"], PIECE["cyan"], PIECE["red"]]
    rnd = random.Random(7)
    for cy in range(8):
        for cx in range(8):
            if cy >= 5 and rnd.random() < 0.7:
                m[(cx, cy)] = rnd.choice(cols)
    for cx in range(8):  # a full row about to clear
        m[(cx, 7)] = PIECE["orange"]
    for (cx, cy) in [(1, 1), (1, 2), (1, 3), (2, 3)]:  # an L piece
        m[(cx, cy)] = PIECE["cyan"]
    for (cx, cy) in [(5, 2), (6, 2), (6, 3), (7, 3)]:  # a falling Z
        m[(cx, cy)] = PIECE["purple"]
    c.board(8, 8, 8, 6, m)
    c.rect(8, 60, 48, 1, GOLD)
    return c


def chaos():
    c = Canvas(2, PIECE["red"])
    rnd = random.Random(11)
    cols = list(PIECE.values())
    m = {}
    for cy in range(10):
        for cx in range(10):
            if rnd.random() < 0.58:
                m[(cx, cy)] = rnd.choice(cols)
    c.board(7, 7, 10, 5, m, border=PIECE["red"])
    bolt = ["..XX", ".XX.", "XXXX", "..XX", ".XX.", "XX.."]
    c.rect(22, 16, 20, 28, (6, 4, 12))
    c.bitmap(24, 18, bolt, {"X": GOLD}, 4)
    return c


def duel():
    c = Canvas(3, PIECE["blue"])
    rnd = random.Random(5)
    left = {(x, y): rnd.choice([PIECE["green"], PIECE["cyan"], PIECE["purple"]]) for y in range(2, 5) for x in range(5) if rnd.random() < 0.75}
    right = {(x, y): rnd.choice([PIECE["red"], PIECE["orange"], PIECE["purple"]]) for y in range(2, 5) for x in range(5) if rnd.random() < 0.75}
    c.board(6, 6, 5, 5, left, border=PIECE["cyan"])
    c.board(33, 6, 5, 5, right, border=PIECE["red"])
    v = ["X...X", "X...X", ".X.X.", ".X.X.", "..X.."]
    s = [".XXX.", "X....", ".XXX.", "....X", ".XXX."]
    c.bitmap(8, 40, v, {"X": WHITE}, 3)
    c.bitmap(34, 40, s, {"X": WHITE}, 3)
    bolt = ["..X", ".X.", "XX.", ".X.", "X.."]
    c.bitmap(30, 34, bolt, {"X": GOLD}, 2)
    c.rect(8, 58, 22, 2, PIECE["cyan"])
    c.rect(34, 58, 22, 2, PIECE["red"])
    return c


def daily():
    c = Canvas(4, PIECE["cyan"])
    c.rect(10, 10, 44, 44, WHITE)
    c.rect(10, 10, 44, 9, PIECE["red"])
    c.rect(18, 7, 3, 7, GOLD)
    c.rect(43, 7, 3, 7, GOLD)
    rnd = random.Random(3)
    cols = [PIECE["orange"], PIECE["green"], PIECE["blue"], PIECE["purple"], PIECE["cyan"]]
    for cy in range(4):
        for cx in range(6):
            if rnd.random() < 0.7:
                c.block(14 + cx * 6, 22 + cy * 7, rnd.choice(cols), 5)
            else:
                c.rect(14 + cx * 6, 22 + cy * 7, 5, 5, (225, 225, 225))
    star = [".X.", "XXX", ".X."]
    c.bitmap(46, 44, star, {"X": GOLD}, 4)
    return c


def speed():
    c = Canvas(5, GOLD)
    disc = [
        "....XXXXXXXX....",
        "..XXXXXXXXXXXX..",
        ".XXXXXXXXXXXXXX.",
        ".XXXXXXXXXXXXXX.",
        "XXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXX",
        "XXXXXXXXXXXXXXXX",
        ".XXXXXXXXXXXXXX.",
        ".XXXXXXXXXXXXXX.",
        "..XXXXXXXXXXXX..",
        "....XXXXXXXX....",
    ]
    c.bitmap(8, 8, disc, {"X": GOLD}, 3)
    inner = [r[2:-2] for r in disc[2:-2]]
    c.bitmap(8 + 6, 8 + 6, inner, {"X": (10, 6, 20)}, 3)
    c.rect(30, 14, 3, 17, WHITE)
    c.rect(30, 29, 13, 3, WHITE)
    c.rect(28, 27, 7, 7, PIECE["red"])
    for i in range(4):
        c.rect(2 + i * 2, 26 + i * 5, 6 - i, 2, shade(GOLD, 0.8))
    c.block(52, 6, PIECE["cyan"], 5)
    c.block(56, 12, PIECE["green"], 4)
    return c


def move_limit():
    c = Canvas(6, PIECE["purple"])
    for i in range(8):
        x = 6 + i * 7
        if i < 5:
            c.block(x, 42, PIECE["purple"], 6)
        else:
            c.rect(x, 42, 6, 6, (30, 20, 50))
            c.rect(x, 42, 6, 1, (60, 45, 90))
            c.rect(x, 47, 6, 1, (60, 45, 90))
    c.bitmap(12, 10, ["..X.", ".XX.", "..X.", "..X.", "..X.", "..X.", ".XXX"], {"X": WHITE}, 4)
    c.bitmap(32, 10, ["XXX.", "...X", "...X", ".XX.", "X...", "X...", "XXXX"], {"X": WHITE}, 4)
    c.bitmap(50, 14, ["X.X", ".X.", "X.X"], {"X": PIECE["red"]}, 3)
    c.rect(6, 54, 52, 2, GOLD)
    return c


def rescue():
    c = Canvas(7, PIECE["red"])
    heart = [
        ".XX..XX.",
        "XXXXXXXX",
        "XXXXXXXX",
        "XXXXXXXX",
        ".XXXXXX.",
        "..XXXX..",
        "...XX...",
    ]
    c.bitmap(12, 6, heart, {"X": PIECE["red"]}, 5)
    c.bitmap(16, 11, ["XX"], {"X": (255, 140, 150)}, 3)
    cols = [PIECE["orange"], PIECE["green"], PIECE["blue"], PIECE["purple"], PIECE["cyan"]]
    for i in range(8):
        c.block(8 + i * 6, 52, cols[i % 5], 6)
    for i in range(5):
        c.block(14 + i * 6, 46, cols[(i + 2) % 5], 6)
    c.block(26, 40, GOLD, 6)
    return c


def combo():
    c = Canvas(8, PIECE["orange"])
    flame = [
        "....X....",
        "...XX....",
        "..XXXX.X.",
        "..XXXXXX.",
        ".XXXXXXXX",
        ".XXXXXXXX",
        "XXXXXXXXX",
        "XXXXXXXXX",
        ".XXXXXXX.",
        "..XXXXX..",
    ]
    c.bitmap(8, 6, flame, {"X": PIECE["orange"]}, 5)
    c.bitmap(8 + 8, 6 + 16, [r[1:-1] for r in flame[4:]], {"X": GOLD}, 4)
    c.bitmap(8 + 14, 6 + 28, [r[2:-2] for r in flame[6:]], {"X": (255, 235, 160)}, 3)
    x = ["X...X", ".X.X.", "..X..", ".X.X.", "X...X"]
    c.bitmap(46, 44, x, {"X": GOLD}, 3)
    return c


if __name__ == "__main__":
    for name, fn in [("classic", classic), ("chaos", chaos), ("duel", duel), ("daily", daily),
                     ("speed", speed), ("move_limit", move_limit), ("rescue", rescue), ("combo", combo)]:
        fn().save(name)
        print("wrote", name)
