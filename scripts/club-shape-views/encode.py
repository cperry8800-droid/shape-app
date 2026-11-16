# Encode Club Shape's stills (public/club/): each view's wide and tall 2K source into four WebP cuts.
#
#   python3 -I scripts/club-shape-views/encode.py public/club
#
# Run it from a folder that holds the sources under gen/. They are the 2K PNGs Runway made, which
# are not in the repository: marketing/club-shape/views-sources.md lists each one's task id, and
# SRC below says which file name this script expects for which view.
#
# ⚠ PILLOW, NOT IMAGEMAGICK. `convert -quality N` is ignored for WebP by the ImageMagick in the cloud
# container (measured: quality 50 and 78 wrote the same 206,488 bytes), so the first encode of these
# could not be brought under its caps. Each cut takes the best quality in its ladder that fits the
# cap tests/booth-clubViews.test.mjs holds it to.
import sys, os
from PIL import Image
OUT = sys.argv[1]
SRC = {  # view: (wide source, tall source)
 'arrival': ('gen/street-l.png', 'gen/street-p.png'),
 'atrium': ('gen/atrium-2.png', 'gen/atrium-p.png'),
 'floor': ('gen/floor-4.png', 'gen/floor-p.png'),
 'decks': ('gen/nora-wide-1.png', 'gen/decks-p.png'),
 'booth': ('gen/booth-2.png', 'gen/booth-p.png'),
 'tables': ('gen/tables-1.png', 'gen/tables-p.png'),
 'balcony': ('gen/balcony-1.png', 'gen/balcony-p.png'),
 'suite': ('gen/suite-1.png', 'gen/suite-p.png'),
 'lounge': ('gen/lounge-1.png', 'gen/lounge-p.png'),
 'bar': ('gen/bar-1.png', 'gen/bar-p.png'),
 'grounds': ('gen/plan-c.png', 'gen/grounds-p.png'),
 'pool': ('gen/pool-l.png', 'gen/pool-p.png'),
 'courts': ('gen/courts-l.png', 'gen/courts-p.png'),
 'track': ('gen/track-l.png', 'gen/track-p.png'),
 'sunset': ('gen/sunset-l.png', 'gen/sunset-p.png'),
}
CUTS = [('l', 0, 1920, 1080, 400_000), ('l-sm', 0, 1280, 720, 190_000), ('p', 1, 1080, 1920, 400_000), ('p-sm', 1, 720, 1280, 190_000)]
def cover(im, w, h):
    r = max(w / im.width, h / im.height)
    im = im.resize((round(im.width * r), round(im.height * r)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))
for view, srcs in SRC.items():
    for cut, which, w, h, cap in CUTS:
        im = cover(Image.open(srcs[which]).convert('RGB'), w, h)
        path = os.path.join(OUT, f'{view}-{cut}.webp')
        for q in ((78, 74, 70, 66, 62, 58) if cut in ('l', 'p') else (74, 70, 66, 62, 58)):   # the best quality that fits the cap
            im.save(path, 'WEBP', quality=q, method=6)
            if os.path.getsize(path) <= cap: break
        print(f'{view}-{cut}.webp q{q} {os.path.getsize(path)}')
