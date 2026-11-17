# stills.py   the finished drawings as standalone 1080 x 1920 pictures (no words): the lifted lines over
# the ad's backdrop; the desk picture carries the real dashboard (the site's example mode) on its monitor.
import numpy as np, os
from PIL import Image
os.makedirs('stills', exist_ok=True)
W, H = 1080, 1920
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
def glow(cx, cy, r, a):
    d = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / r
    return np.clip(1 - d, 0, 1) ** 2 * a
g = glow(120, 300, 1100, 0.20) + glow(1000, 1750, 1200, 0.16)
back = np.dstack([6 + 52 * g * 0.9, 9 + 214 * g * 0.9, 10 + 197 * g * 0.9]).clip(0, 255).astype(np.uint8)
BACK = Image.fromarray(back, 'RGB').convert('RGBA')
def coeffs(dst, src):
    A = []
    for (x, y), (u, v) in zip(dst, src):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y]); A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
    B = np.array(src, dtype=np.float64).reshape(8)
    return np.linalg.solve(np.array(A, dtype=np.float64), B).tolist()
NAMES = {'squat-1': 'coaching-squat', 'plank-1': 'coaching-plank', 'nutri-2': 'nutritionist-and-client', 'nutri-1': 'nutritionist-and-client-b',
         'deskphone-2': 'coach-at-desk-phone', 'deskphone-1': 'coach-at-desk-phone-b', 'desktop-1': 'coach-at-desk-dashboard', 'fistbump-1': 'after-the-session'}
for n, nice in NAMES.items():
    ln = Image.open('out/' + n + '.png')
    k = W / ln.size[0]
    ln = ln.resize((W, round(ln.size[1] * k)), Image.LANCZOS)
    top = (ln.size[1] - H) // 2
    ln = ln.crop((0, top, W, top + H))
    im = BACK.copy()
    if n == 'desktop-1':
        quad = [(845 * k, 1040 * k - top), (1430 * k, 1080 * k - top), (1388 * k, 1552 * k - top), (816 * k, 1441 * k - top)]
        shot = Image.open('../desk/d-today.jpg').convert('RGBA'); sw, sh = shot.size
        warped = shot.transform((W, H), Image.PERSPECTIVE, coeffs(quad, [(0, 0), (sw, 0), (sw, sh), (0, sh)]), Image.BICUBIC)
        from PIL import ImageDraw
        mask = Image.new('L', (W * 2, H * 2), 0); ImageDraw.Draw(mask).polygon([(x * 2, y * 2) for x, y in quad], fill=255)
        mask = mask.resize((W, H), Image.LANCZOS)
        im.paste(warped, (0, 0), mask)
    im = Image.alpha_composite(im, ln).convert('RGB')
    im.save('stills/shape-coach-outline-' + nice + '.png', optimize=True)
    print(nice, os.path.getsize('stills/shape-coach-outline-' + nice + '.png'))
order = ['coaching-squat', 'coaching-plank', 'nutritionist-and-client', 'after-the-session', 'coach-at-desk-phone', 'coach-at-desk-dashboard', 'coach-at-desk-phone-b', 'nutritionist-and-client-b']
tw, th, gap = 540, 960, 16
sheet = Image.new('RGB', (tw * 4 + gap * 5, th * 2 + gap * 3), (18, 22, 22))
for i, nice in enumerate(order):
    t = Image.open('stills/shape-coach-outline-' + nice + '.png').resize((tw, th), Image.LANCZOS)
    sheet.paste(t, (gap + (i % 4) * (tw + gap), gap + (i // 4) * (th + gap)))
sheet.save('stills/shape-coach-outline-drawings.jpg', quality=90)
print(sheet.size)
