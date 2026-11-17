# prep.py <name> [<name> ...]
# Lifts a drawing's lines off its background: out/<name>.png is the same picture with a transparent
# background (alpha from how bright the line is), so the ad can lay it over its own backdrop and any
# uneven tone or banding in the generated background is gone. Nothing is redrawn.
import sys, numpy as np
from PIL import Image, ImageFilter
import os
os.makedirs('out', exist_ok=True)
for n in sys.argv[1:]:
    im = Image.open(n + '.png').convert('RGB')
    W, H = im.size
    small = im.resize((W // 16, H // 16), Image.BOX).filter(ImageFilter.MedianFilter(15))
    bg = np.asarray(small.resize((W, H), Image.BICUBIC)).astype(np.float32)
    a = np.asarray(im).astype(np.float32)
    # the background is dark everywhere: never let the estimate climb into a lit, solid shape (the phone)
    bg = np.minimum(bg, np.median(a.reshape(-1, 3), axis=0) + 10.0)
    lines = np.clip(a - bg - 3.0, 0, 255)
    mx = lines.max(axis=2)
    alpha = np.clip(mx / 255.0 * 1.18, 0, 1)
    col = np.where(mx[..., None] > 0, lines / np.maximum(mx[..., None], 1e-3) * 255.0, 0)
    out = np.dstack([np.clip(col, 0, 255), alpha * 255.0]).astype(np.uint8)
    Image.fromarray(out, 'RGBA').save('out/' + n + '.png', optimize=True)
    # a check picture: the lines over the ad's ink
    ink = Image.new('RGBA', (W, H), (6, 9, 10, 255))
    chk = Image.alpha_composite(ink, Image.fromarray(out, 'RGBA')).convert('RGB')
    chk.resize((900, round(H * 900 / W)), Image.LANCZOS).save('out/v-' + n + '.jpg', quality=88)
    print(n, 'bg mean', bg.mean(axis=(0, 1)).round(1), 'alpha>0.5 px', int((alpha > 0.5).sum()), os.path.getsize('out/' + n + '.png'))
