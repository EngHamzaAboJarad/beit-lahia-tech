"""Beit Lahia Tech — social media templates (SVG, then PNG via headless Edge)."""
import base64, os, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mark import cells, W as MW, H as MH

OUT = "D:/bitlahia/design/social/"
os.makedirs(OUT, exist_ok=True)
NIGHT, NIGHT2, NIGHT3, MINT, BERRY, SAND = "#0B1020", "#151C2D", "#1E2A44", "#35E69B", "#F22964", "#F4F1ED"
FONTS = ('<style>@import url("https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&amp;'
         'family=Montserrat:wght@600;700;800&amp;display=swap");'
         '.ar{font-family:Cairo,Tahoma,sans-serif}.en{font-family:Montserrat,Arial,sans-serif}</style>')


def b64(path):
    return "data:image/jpeg;base64," + base64.b64encode(open(path, "rb").read()).decode()


NIGHT_IMG = b64("D:/bitlahia/public/img/beit-lahia-night.jpg")
FIELD_IMG = b64("D:/bitlahia/public/img/beit-lahia-fields.jpg")


def mark(x, y, size):
    """strawberry, `size` = width in px"""
    s = size / MW
    return f'<g transform="translate({x:g} {y:g}) scale({s:g})" shape-rendering="crispEdges">{cells()}</g>'


def lockup(x, y, h, color="#FFFFFF"):
    """strawberry + BEIT LAHIA / TECH, left-aligned at x, top at y, mark height h"""
    w = h * MW / MH
    fs = h * .36
    tx = x + w + h * .28
    return (mark(x, y, w) +
            f'<g class="en" fill="{color}" font-weight="800" font-size="{fs:g}">'
            f'<text x="{tx:g}" y="{y + h * .45:g}">BEIT LAHIA</text>'
            f'<text x="{tx:g}" y="{y + h * .9:g}">TECH</text></g>')


def mosaic(pattern, x, y, c, anchor="tl"):
    cols = {"m": MINT, "b": BERRY, "n": NIGHT2, "d": NIGHT3, "w": "#FFFFFF"}
    rows = pattern.split("|")
    out = []
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch == ".":
                continue
            xi = x + i * c if anchor in ("tl", "bl") else x - (len(row) - i) * c
            yj = y + j * c if anchor in ("tl", "tr") else y - (len(rows) - j) * c
            out.append(f'<rect x="{xi:g}" y="{yj:g}" width="{c}" height="{c}" fill="{cols[ch]}"/>')
    return '<g shape-rendering="crispEdges">' + "".join(out) + "</g>"


def grid(w, h, step=36, op=.05):
    return (f'<defs><pattern id="g{step}" width="{step}" height="{step}" patternUnits="userSpaceOnUse">'
            f'<path d="M{step} 0H0V{step}" fill="none" stroke="#FFFFFF" stroke-opacity="{op}" stroke-width="1.5"/></pattern></defs>'
            f'<rect width="{w}" height="{h}" fill="url(#g{step})"/>')


def photo(img, x, y, w, h, fade, op=.5, gray=True, pid="p"):
    """fade: 'up' (solid at bottom), 'down', 'left' (solid at left), 'right'"""
    v = {"up": ("0", "1", "0", "0"), "down": ("0", "0", "0", "1"), "left": ("1", "0", "0", "0"), "right": ("0", "0", "1", "0")}[fade]
    x1, y1, x2, y2 = (("0", "1", "0", "0") if fade == "up" else ("0", "0", "0", "1") if fade == "down"
                      else ("0", "0", "1", "0") if fade == "left" else ("1", "0", "0", "0"))
    flt = (f'<filter id="{pid}f"><feColorMatrix type="saturate" values="0"/>'
           f'<feComponentTransfer><feFuncR type="linear" slope="1.15" intercept="-.05"/><feFuncG type="linear" slope="1.15" intercept="-.05"/>'
           f'<feFuncB type="linear" slope="1.15" intercept="-.05"/></feComponentTransfer></filter>') if gray else ""
    return (f'<defs>{flt}<linearGradient id="{pid}g" x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}">'
            f'<stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>'
            f'<mask id="{pid}m"><rect x="{x}" y="{y}" width="{w}" height="{h}" fill="url(#{pid}g)"/></mask></defs>'
            f'<g mask="url(#{pid}m)" opacity="{op}"><image href="{img}" x="{x}" y="{y}" width="{w}" height="{h}" '
            f'preserveAspectRatio="xMidYMid slice"{f" filter=\"url(#{pid}f)\"" if gray else ""}/></g>')


def svg(w, h, body, bg=NIGHT):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">{FONTS}'
            f'<rect width="{w}" height="{h}" fill="{bg}"/>{body}</svg>\n')


def ar(x, y, txt, size, color="#FFFFFF", weight=800, anchor="end", extra=""):
    return (f'<text class="ar" x="{x:g}" y="{y:g}" font-size="{size}" font-weight="{weight}" fill="{color}" '
            f'text-anchor="{ {"end": "start", "start": "end"}.get(anchor, anchor)}" direction="rtl"{extra}>{txt}</text>')


def en(x, y, txt, size, color="#FFFFFF", weight=700, anchor="start", ls=0):
    return (f'<text class="en" x="{x:g}" y="{y:g}" font-size="{size}" font-weight="{weight}" fill="{color}" '
            f'text-anchor="{anchor}" letter-spacing="{ls}">{txt}</text>')


def code_art(cx, cy, c):
    """the </> pixel glyph from the identity, centred"""
    rows = ["..m...b..m..", ".m....b...m.", "m....b.....m", ".m..b.....m.", "..m.b....m.."]
    w, h = 12 * c, 5 * c
    x0, y0 = cx - w / 2, cy - h / 2
    out = []
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != ".":
                out.append(f'<rect x="{x0 + i * c:g}" y="{y0 + j * c:g}" width="{c * .9:g}" height="{c * .9:g}" fill="{MINT if ch == "m" else BERRY}"/>')
    return '<g shape-rendering="crispEdges">' + "".join(out) + "</g>"


T = {}

# 1) post 1080 — "من بيت لاهيا إلى العالم الرقمي"
w = h = 1080
T["post-square"] = (w, h, svg(w, h,
    photo(NIGHT_IMG, 0, 380, w, 700, "up", .5, pid="a") +
    f'<defs><linearGradient id="bot" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="{NIGHT}" stop-opacity="0"/><stop offset="1" stop-color="{NIGHT}" stop-opacity=".92"/></linearGradient></defs><rect y="780" width="{w}" height="300" fill="url(#bot)"/>' + grid(w, h) +
    mosaic("m.n.|bd..|n.m.|d...", 0, 0, 40) + mosaic("..dn|.m.b|n.d.|.bnm", w, h, 40, "br") +
    lockup(80, 84, 92) +
    ar(1000, 450, "من بيت لاهيا", 104) +
    ar(1000, 590, "إلى العالم الرقمي", 104, MINT) +
    f'<rect x="{1000 - 120}" y="668" width="40" height="12" fill="{BERRY}"/><rect x="{1000 - 72}" y="668" width="32" height="12" fill="{MINT}"/><rect x="{1000 - 32}" y="668" width="32" height="12" fill="{MINT}"/>' +
    ar(1000, 750, "مجتمع تقني لأبناء بيت لاهيا: نتعلّم سوا، نشتغل سوا، ونكبر سوا.", 34, "#C3CCDA", 600) +
    en(80, 1000, "ROOTED HERE. BUILT FOR TOMORROW.", 22, "#9AA6BC", 700, ls=6) +
    en(80, 950, "beitlahia.tech", 30, MINT, 700)))

# 2) workshop / event poster 1080x1350
w, h = 1080, 1350
T["event-poster"] = (w, h, svg(w, h,
    grid(w, h) + f'<circle cx="540" cy="430" r="380" fill="{MINT}" opacity=".06"/>' +
    mosaic("m.n..|bdn.m|.n.d.|d....", 0, 0, 40) + mosaic("...dm|..b.n|.nmd.|n.d.b", w, h, 40, "br") +
    lockup(80, 80, 84) +
    f'<rect x="{1000 - 210}" y="96" width="210" height="58" rx="29" fill="{MINT}" fill-opacity=".12" stroke="{MINT}" stroke-opacity=".5" stroke-width="2"/>' +
    ar(1000 - 105, 136, "ورشة عمل", 30, MINT, 700, "middle") +
    code_art(540, 420, 44) +
    ar(1000, 720, "عنوان الورشة هنا", 92) +
    ar(1000, 800, "سطر قصير بيوصف شو رح نتعلم بالورشة", 40, MINT, 700) +
    "".join(
        f'<rect x="{x}" y="880" width="290" height="150" rx="22" fill="{NIGHT2}" stroke="#26324A" stroke-width="2"/>'
        f'<rect x="{x + 290 - 52}" y="906" width="26" height="26" fill="{c}"/>'
        + ar(x + 290 - 26, 984, lab, 28, "#9AA6BC", 600) + ar(x + 290 - 26, 1012, val, 30, "#FFFFFF", 800).replace('y="1012"', 'y="1016"')
        for x, lab, val, c in [(710, "التاريخ", "الخميس 25 ديسمبر", MINT), (395, "الوقت", "4:00 مساءً", BERRY), (80, "المكان", "بيت لاهيا", MINT)]) +
    f'<rect x="80" y="1110" width="920" height="110" rx="24" fill="{MINT}"/>' +
    ar(960, 1180, "سجّل الآن", 40, NIGHT, 800) +
    en(120, 1179, "beitlahia.tech/workshop", 34, NIGHT, 800) +
    en(540, 1290, "ROOTED HERE. BUILT FOR TOMORROW.", 20, "#9AA6BC", 700, "middle", 6)))

# 3) story 1080x1920 — join
w, h = 1080, 1920
T["story-join"] = (w, h, svg(w, h,
    photo(FIELD_IMG, 0, 0, w, 1100, "down", .75, gray=False, pid="s") +
    f'<rect width="{w}" height="1100" fill="{NIGHT}" opacity=".35"/>' + grid(w, h, 40, .04) +
    mosaic("m.n.d|bd.m.|n.b..|d....", 0, 0, 44) + mosaic("..n.m|.dmb.|n.d.n|.b.dm", w, h, 44, "br") +
    f'<rect x="{540 - 200}" y="560" width="400" height="460" rx="40" fill="{NIGHT}" opacity=".55"/>' +
    mark(540 - 140, 610, 280) +
    ar(540, 1180, "إنت من بيت لاهيا", 88, "#FFFFFF", 800, "middle") +
    ar(540, 1290, "وبتدرس أو بتشتغل بالتقنية؟", 64, MINT, 800, "middle") +
    ar(540, 1380, "سجّل اليوم وكون من الأعضاء المؤسسين.", 40, "#C3CCDA", 600, "middle") +
    f'<rect x="190" y="1470" width="700" height="120" rx="60" fill="{MINT}"/>' +
    en(540, 1548, "beitlahia.tech/join", 44, NIGHT, 800, "middle") +
    lockup(540 - 190, 1680, 90) +
    en(540, 1860, "ROOTED HERE. BUILT FOR TOMORROW.", 22, "#9AA6BC", 700, "middle", 6)))

# 4) cover 1640x624 (Facebook / LinkedIn page)
w, h = 1640, 624
T["cover"] = (w, h, svg(w, h,
    photo(NIGHT_IMG, 0, 0, 1000, h, "left", .55, pid="c") + grid(w, h, 32, .045) +
    mosaic("m.n|bd.|n..", 0, 0, 34) + mosaic("..dm|.b.n|n.m.|.d.b", w, h, 34, "br") +
    lockup(1000, 120, 92) +
    ar(1540, 350, "من بيت لاهيا", 92) +
    ar(1540, 470, "إلى العالم الرقمي", 92, MINT) +
    en(1540, 540, "ROOTED HERE. BUILT FOR TOMORROW.", 20, "#9AA6BC", 700, "end", 6)))

# 5) announcement / news (light) 1080
w = h = 1080
T["announcement"] = (w, h, svg(w, h,
    f'<rect x="60" y="60" width="960" height="800" rx="36" fill="#FFFFFF"/>' +
    mosaic("..nm|.b.d|m...", 1020, 60, 30, "tr").replace(f'fill="{NIGHT2}"', f'fill="{NIGHT}"') +
    f'<rect x="{940 - 150}" y="140" width="150" height="56" rx="28" fill="#E3FBF0"/>' +
    ar(940 - 75, 178, "إعلان", 30, "#047857", 800, "middle") +
    ar(940, 340, "عنوان الإعلان هنا", 84, NIGHT) +
    f'<rect x="{940 - 34}" y="380" width="34" height="12" fill="{MINT}"/><rect x="{940 - 74}" y="380" width="34" height="12" fill="{MINT}"/><rect x="{940 - 104}" y="380" width="24" height="12" fill="{BERRY}"/>' +
    ar(940, 470, "هون بتكتب تفاصيل الإعلان بسطرين أو ثلاثة.", 40, "#4A5468", 600) +
    ar(940, 532, "خلي الكلام قصير وواضح، والتفاصيل كاملة", 40, "#4A5468", 600) +
    ar(940, 594, "بتكون على الموقع.", 40, "#4A5468", 600) +
    f'<rect x="140" y="700" width="380" height="96" rx="22" fill="{NIGHT}"/>' +
    en(330, 760, "beitlahia.tech", 34, MINT, 800, "middle") +
    f'<rect x="0" y="920" width="{w}" height="160" fill="{NIGHT}"/>' +
    lockup(80, 955, 90) +
    en(1000, 1012, "ROOTED HERE.", 22, "#9AA6BC", 700, "end", 6) +
    en(1000, 1048, "BUILT FOR TOMORROW.", 22, MINT, 700, "end", 6), bg=SAND))

# 6) profile picture 1080 (safe inside a circle crop)
w = h = 1080
T["profile"] = (w, h, svg(w, h, grid(w, h, 54, .05) + mark(540 - 230, 540 - 263, 460)))

for name, (w, h, s) in T.items():
    open(OUT + name + ".svg", "w", encoding="utf-8").write(s)
print("\n".join(f"{n} {w}x{h}" for n, (w, h, _) in T.items()))
