# photo_warp.py — a face photo warped onto a front render of the 3D head, for photo_face.py.
#
#   <python with mediapipe + scikit-image> photo_warp.py <photo> <render> <face_landmarker.task> <out-dir>
#
# MediaPipe finds the same 468 face landmarks on the photo and on the render (the 3D head drawn
# flat, front-on, by photo_face.py). A piecewise-affine warp over those points moves every pixel of
# the photo to where that part of the face is on the 3D head, so the photo's skin, brows and lips
# land on the head's own features even where the two faces differ in shape. Writes, at the render's
# size: warped.png (the photo, warped) and mask.png (the face inside the landmarks' outline, feathered,
# 0 outside), plus the landmarks found. Runs in its own Python (MediaPipe and Blender's module want
# different numpy builds).
import json
import os
import sys

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python as mp_python
from mediapipe.tasks.python import vision
from PIL import Image, ImageDraw, ImageFilter
from skimage.transform import PiecewiseAffineTransform, warp

photo_path, render_path, model_path, out = sys.argv[1:5]
os.makedirs(out, exist_ok=True)
opts = vision.FaceLandmarkerOptions(base_options=mp_python.BaseOptions(model_asset_path=model_path), num_faces=1)
# the face's outline in MediaPipe's mesh, in order (its FACE_OVAL connections)
OVAL = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148, 176,
        149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109]


def landmarks(path):
    with vision.FaceLandmarker.create_from_options(opts) as lm:
        img = mp.Image.create_from_file(path)
        res = lm.detect(img)
    if not res.face_landmarks:
        raise SystemExit('no face found in ' + path)
    return np.array([[p.x * img.width, p.y * img.height] for p in res.face_landmarks[0][:468]]), (img.width, img.height)


src, _ = landmarks(photo_path)
dst, (W, H) = landmarks(render_path)
json.dump({'photo': src.tolist(), 'render': dst.tolist()}, open(os.path.join(out, 'landmarks.json'), 'w'))

# warp(): for each output (render) pixel, where to read in the photo
t = PiecewiseAffineTransform()
if not t.estimate(dst, src):
    raise SystemExit('the warp could not be fitted')
photo = np.asarray(Image.open(photo_path).convert('RGB'), dtype=np.float64) / 255.0
warped = warp(photo, t, output_shape=(H, W), order=1, mode='edge')
Image.fromarray((np.clip(warped, 0, 1) * 255).astype(np.uint8)).save(os.path.join(out, 'warped.png'))

# the mask: the face's outline, shrunk a little and feathered, so the photo fades into the skin
m = Image.new('L', (W, H), 0)
ImageDraw.Draw(m).polygon([tuple(dst[i]) for i in OVAL], fill=255)
shrink = max(3, int(0.02 * W))
m = m.filter(ImageFilter.MinFilter(2 * shrink + 1)).filter(ImageFilter.GaussianBlur(shrink * 1.5))
m.save(os.path.join(out, 'mask.png'))
print('warped', W, 'x', H, 'from', photo_path)
