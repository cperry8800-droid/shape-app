# Encode Club Shape's stills (public/club/): each view's wide and tall 2K source into four WebP cuts.
#
#   python3 -I scripts/club-shape-views/encode.py public/club            (every view)
#   python3 -I scripts/club-shape-views/encode.py public/club floor tables  (only the views named)
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
from PIL import Image, ImageFilter
OUT = sys.argv[1]
ONLY = set(sys.argv[2:])   # views to encode; none named means all of them
SRC = {  # view: (wide source, tall source)
 'arrival': ('gen/street-l.png', 'gen/street-p.png'),
 'atrium': ('gen/atrium-3.png', 'gen/atrium-p2.png'),
 'floor': ('gen/floor-5.png', 'gen/floor-p2.png'),
 'decks': ('gen/nora-wide-1.png', 'gen/decks-p.png'),
 'booth': ('gen/booth-3.png', 'gen/booth-p2.png'),
 'tables': ('gen/tables-2.png', 'gen/tables-p2.png'),
 'balcony': ('gen/balcony-2.png', 'gen/balcony-p2.png'),
 'suite': ('gen/suite-2.png', 'gen/suite-p2.png'),
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
if ONLY - set(SRC): sys.exit(f'no such view: {sorted(ONLY - set(SRC))}')
for view, srcs in SRC.items():
    if ONLY and view not in ONLY: continue
    for cut, which, w, h, cap in CUTS:
        im = cover(Image.open(srcs[which]).convert('RGB'), w, h)
        path = os.path.join(OUT, f'{view}-{cut}.webp')
        ladder = (78, 74, 70, 66, 62, 58) if cut in ('l', 'p') else (74, 70, 66, 62, 58)
        soft = ''
        for q in ladder:   # the best quality that fits the cap
            im.save(path, 'WEBP', quality=q, method=6)
            if os.path.getsize(path) <= cap: break
        else:
            # Still over at the bottom of the ladder: the main floor's roof of lit triangle edges over a
            # screen of dots is the one that was (465 KB at quality 58). Going lower blocks up the dots;
            # taking the film grain off first (a 0.45 px blur: a touch softer beside the source, the
            # dots and the lettering hold) fits it at 70.
            im, soft = im.filter(ImageFilter.GaussianBlur(0.45)), ' soft'
            for q in ladder:
                im.save(path, 'WEBP', quality=q, method=6)
                if os.path.getsize(path) <= cap: break
        print(f'{view}-{cut}.webp q{q}{soft} {os.path.getsize(path)}')
