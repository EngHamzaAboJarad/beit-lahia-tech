# The Beit Lahia Tech strawberry, sampled from the approved social designs (half-cell grid, 14 x 16).
# "." = background (the night shows through: seeds, leaf notches, the V under the stem)
GRID = [
    "......MM......",
    "......MM......",
    "..GGL....LGG..",
    "..GGLL..LLGD..",
    "....GGTTDD....",
    "RRRR..TT..RRQQ",
    "RRRR..TT..RRQQ",
    "RRSSPP..PPSSQQ",
    "RR..PP..PP..QQ",
    "RR..PPSSPP..QQ",
    "..RRSSRRSSQQ..",
    "..RRSSRRSSQQ..",
    "....RR..QQ....",
    "....RR..QQ....",
    "......RQ......",
    "......RQ......",
]
PAL = {
    "M": "#35F0B4", "G": "#1AC08E", "L": "#A0F6D9", "D": "#0E8A70", "T": "#E45C7E",
    "R": "#F22865", "Q": "#DE1D5A", "P": "#FF5A8A", "S": "#C3134C",
}
INK = "#0B1020"
C = 5  # one half-cell; the whole mark is 70 x 80


def cells(c=C, dx=0, dy=0, skip="", notch=True):
    by = {}
    for y, row in enumerate(GRID):
        for x, ch in enumerate(row):
            if ch != "." and ch not in skip:
                by.setdefault(ch, []).append((x, y))
    return "".join(f'<g fill="{PAL[ch]}">' + "".join(
        f'<rect x="{dx + x * c:g}" y="{dy + y * c:g}" width="{c}" height="{c}"/>' for x, y in cs) + "</g>"
        for ch, cs in by.items())


def interior_holes():
    """empty cells enclosed by the shape (seeds, the V) — not reachable from the edge"""
    h, w = len(GRID), len(GRID[0])
    seen = set(); stack = [(x, y) for x in range(w) for y in (0, h - 1)] + [(x, y) for y in range(h) for x in (0, w - 1)]
    while stack:
        x, y = stack.pop()
        if not (0 <= x < w and 0 <= y < h) or (x, y) in seen or GRID[y][x] != ".":
            continue
        seen.add((x, y)); stack += [(x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)]
    out = [(x, y) for y in range(h) for x in range(w) if GRID[y][x] == "." and (x, y) not in seen]
    # also the gap boxed in on all four sides (under the stem, between the leaves)
    fill = lambda xs, ys: any(GRID[yy][xx] != "." for xx, yy in zip(xs, ys))
    for y in range(h):
        for x in range(w):
            if GRID[y][x] == "." and (x, y) not in out and                fill(range(x), [y] * x) and fill(range(x + 1, w), [y] * w) and                fill([x] * y, range(y)) and fill([x] * h, range(y + 1, h)):
                out.append((x, y))
    return out


def outline(c=C, o=2.5, dx=0, dy=0):
    rs = [f'<rect x="{dx + x * c - o:g}" y="{dy + y * c - o:g}" width="{c + 2 * o:g}" height="{c + 2 * o:g}" rx="1.5"/>'
          for y, row in enumerate(GRID) for x, ch in enumerate(row) if ch != "."]
    rs += [f'<rect x="{dx + x * c:g}" y="{dy + y * c:g}" width="{c}" height="{c}"/>' for x, y in interior_holes()]
    return f'<g fill="{INK}">' + "".join(rs) + "</g>"


W, H = len(GRID[0]) * C, len(GRID) * C
