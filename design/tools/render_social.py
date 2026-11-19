import subprocess, os
from PIL import Image
EDGE = r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe"
D = r"D:\bitlahia\design\social"
SP = os.path.dirname(os.path.abspath(__file__))
SIZES = {"post-square": (1080, 1080), "event-poster": (1080, 1350), "story-join": (1080, 1920),
         "cover": (1640, 624), "announcement": (1080, 1080), "profile": (1080, 1080)}
for n, (w, h) in SIZES.items():
    png = os.path.join(D, n + ".png")
    subprocess.run([EDGE, "--headless=new", "--disable-gpu", "--hide-scrollbars", f"--window-size={w},{h}",
                    "--virtual-time-budget=6000", f"--screenshot={png}", "file:///" + os.path.join(D, n + ".svg").replace("\\", "/")],
                   stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, stdin=subprocess.DEVNULL, timeout=60)
    im = Image.open(png)
    assert im.size == (w, h), (n, im.size)
    im.convert("RGB").save(png, optimize=True)
    print(n, im.size, os.path.getsize(png) // 1024, "KB")
ims = {n: Image.open(os.path.join(D, n + ".png")) for n in SIZES}
H = 600
row = [ims[n].resize((int(ims[n].width * H / ims[n].height), H)) for n in ["post-square", "event-poster", "story-join", "announcement", "profile"]]
cw = sum(i.width for i in row) + 15 * 4
sheet = Image.new("RGB", (cw, H + 20 + 330), (244, 241, 237))
x = 0
for i in row:
    sheet.paste(i, (x, 0)); x += i.width + 15
sheet.paste(ims["cover"].resize((int(1640 * 330 / 624), 330)), (0, H + 20))
sheet.save(os.path.join(SP, "sheet.png"))
