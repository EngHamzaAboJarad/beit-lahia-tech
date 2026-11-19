import re, sys, os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from mark import cells, outline, W, H, INK
PUB = "D:/bitlahia/public/"; DES = "D:/bitlahia/design/logo/"
SYMBOL = f'<symbol id="logo" viewBox="0 0 {W} {H}" shape-rendering="crispEdges">' + cells() + '</symbol>'
for p in ["index.html", "join.html", "survey.html", "trainer.html", "workshop.html"]:
    s = open(PUB + p, encoding="utf-8").read()
    n = re.sub(r'<symbol id="logo" viewBox="0 0 [0-9]+ [0-9]+"[^>]*>.*?</symbol>', SYMBOL, s, flags=re.S)
    assert n != s or SYMBOL in s, p
    open(PUB + p, "w", encoding="utf-8", newline="").write(n)
S = 120; ox, oy = (S - W) / 2, (S - H) / 2
fav = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {S} {S}" shape-rendering="crispEdges">'
       f'<rect width="{S}" height="{S}" rx="26" fill="{INK}" shape-rendering="auto"/>' + cells(5, ox, oy) + '</svg>\n')
open(PUB + "favicon.svg", "w", encoding="utf-8").write(fav)
open(DES + "strawberry-icon.svg", "w", encoding="utf-8").write(fav)
pad = 2.5
open(DES + "strawberry.svg", "w", encoding="utf-8").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{-pad} {-pad} {W + 2 * pad} {H + 2 * pad}" width="256" height="{256 * (H + 5) / (W + 5):.0f}" shape-rendering="crispEdges">'
    '<title>Beit Lahia Tech</title>' + outline() + cells() + '</svg>\n')
# on-dark version: no outline (the night is the outline)
open(DES + "strawberry-on-dark.svg", "w", encoding="utf-8").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="256" height="{256 * H / W:.0f}" shape-rendering="crispEdges">'
    '<title>Beit Lahia Tech</title>' + cells() + '</svg>\n')
LW, LH = 380, 100; mx, my = 8, (LH - H) / 2; tx = mx + W + 24
open(DES + "logo-lockup.svg", "w", encoding="utf-8").write(
    f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {LW} {LH}">'
    '<style>@import url("https://fonts.googleapis.com/css2?family=Montserrat:wght@800&amp;display=swap");</style>'
    f'<g shape-rendering="crispEdges">{outline(dx=mx, dy=my)}{cells(dx=mx, dy=my)}</g>'
    f'<g fill="{INK}" font-family="Montserrat, Arial, sans-serif" font-weight="800" font-size="33">'
    f'<text x="{tx}" y="{my + 36}">BEIT LAHIA</text><text x="{tx}" y="{my + H - 4}">TECH</text></g></svg>\n')
open(DES + "strawberry-symbol.txt", "w", encoding="utf-8").write(SYMBOL + "\n")
print("ok", W, H)
