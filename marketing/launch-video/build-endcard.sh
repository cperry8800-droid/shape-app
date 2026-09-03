#!/bin/bash
# Shot 12 — END CARD. Globe plate + the SHAPE wordmark, 9:16 and 1:1.
#
# Run from anywhere; writes into the directory holding this script.
#   bash marketing/launch-video/build-endcard.sh
#
# ⚠ ffmpeg is NOT installed in the Claude Code container. `npm i ffmpeg-static` supplies a
#   static 7.0.2 build (npm is reachable where most hosts are not); set FFMPEG to point at it.
# ⚠ The cloudfront prefix is BLOCKED by the container's egress proxy (403 on CONNECT), so
#   GLOBE_SRC cannot be fetched here — run this in the Higgsfield sandbox, or hand the clip
#   in by hand and set GLOBE_SRC to a local path.
set -e
cd "$(dirname "$0")"

FFMPEG=${FFMPEG:-ffmpeg}
GLOBE_SRC=${GLOBE_SRC:-https://d8j0ntlcm91z4.cloudfront.net/user_3E30hta4RMpS2cDML3JnB5dGPnY/hf_20260903_210937_d05c9a59-8b96-4b5b-a059-c7cc20bb6bc5.mp4}
WM_SRC=${WM_SRC:-../../mobile-app/public/shape-wordmark.png}

[ -f globe.mp4 ] || { case "$GLOBE_SRC" in http*) curl -sL -o globe.mp4 "$GLOBE_SRC";; *) cp "$GLOBE_SRC" globe.mp4;; esac; }
cp -f "$WM_SRC" wm.png 2>/dev/null || curl -sL -o wm.png "$WM_SRC"

# ── The wordmark ────────────────────────────────────────────────────────────────────────
# mobile-app/public/shape-wordmark.png is 3626x882, PNG colour type 6 (RGBA), and the alpha
# is genuinely used: 94.0% fully transparent, 5.2% solid ink, 0.8% antialiased edge. No
# keying required, and none is done here.
#
# ⚠ THE CANVAS IS MOSTLY PADDING, AND SCALING IT NAIVELY BREAKS THE "55% OF FRAME" SPEC.
#   Ink bbox is x 270-3351, y 270-611 => 3082x342, i.e. 270 px of dead margin on every side.
#   Scaling the CANVAS to 55% of 1080 (594 px) would render the visible mark at
#   594 x 3082/3626 = 505 px — only 46.8% of frame. So crop to the ink first; then 55% is 55%.
#
# ⚠ mobile-app/SHAPE-wordmark-white.png is NOT a fallback: it is byte-identical to this file
#   (md5 8d2b5e35d6e76d7add21a33ade8c83b1). And public-runtime/assets/shape-logo-new-white.png
#   is only 187x100 — it would upscale ~3x to reach 594 px. Neither is usable as an alternate.
$FFMPEG -y -v error -i wm.png -vf "crop=3082:342:270:270" wm_ink.png

# ── Geometry ────────────────────────────────────────────────────────────────────────────
# Source is 720x1280 @ 24 fps, 8.042 s. 720x1280 -> 1080x1920 is exactly 1.5x and the aspect
# already matches, so a plain scale — no crop, no pillarbox, no resampling of the framing.
# Wordmark: 594 px wide (55% of 1080) x 66 px tall, horizontally centred.
#   9:16 — top third is y 0-640, centred at 320  => y = 320 - 33 = 287
#   1:1  — top third is y 0-360, centred at 180  => y = 180 - 33 = 147
# Measured on the clean plate at t=3.0 s: behind the 9:16 wordmark box (x 243-837, y 287-353)
# the frame is essentially black — mean luma 6.32, only 4 px above 60 out of 39,204 — and the
# globe/beam content does not begin until y 603, leaving 250 px of clearance. It is clear.
#
# ⚠ The source carries its own generated audio stream. -an strips it; these are silent plates.
# ⚠ Each output is ONE encode straight from the source. The 1:1 is NOT transcoded from the
#   9:16 — it is cropped from the same source, so neither generation is stacked on the other.

$FFMPEG -y -v error -i globe.mp4 -loop 1 -i wm_ink.png -filter_complex \
"[0:v]scale=1080:1920,setsar=1[bg];\
 [1:v]scale=594:66,format=rgba,fade=t=in:st=5.5:d=0.6:alpha=1,setpts=PTS-STARTPTS[wm];\
 [bg][wm]overlay=(W-w)/2:287:shortest=1:format=auto[v]" \
 -map "[v]" -an -c:v libx264 -crf 18 -pix_fmt yuv420p -preset slow shape-endcard-1080x1920.mp4

$FFMPEG -y -v error -i globe.mp4 -loop 1 -i wm_ink.png -filter_complex \
"[0:v]scale=1080:1920,crop=1080:1080:0:420,setsar=1[bg];\
 [1:v]scale=594:66,format=rgba,fade=t=in:st=5.5:d=0.6:alpha=1,setpts=PTS-STARTPTS[wm];\
 [bg][wm]overlay=(W-w)/2:147:shortest=1:format=auto[v]" \
 -map "[v]" -an -c:v libx264 -crf 18 -pix_fmt yuv420p -preset slow shape-endcard-1080x1080.mp4

# Final-frame stills, so logo placement can be checked without scrubbing.
$FFMPEG -y -v error -sseof -0.1 -i shape-endcard-1080x1920.mp4 -update 1 -frames:v 1 shape-endcard-final-1080x1920.png
$FFMPEG -y -v error -sseof -0.1 -i shape-endcard-1080x1080.mp4 -update 1 -frames:v 1 shape-endcard-final-1080x1080.png

for f in shape-endcard-*.mp4 shape-endcard-final-*.png; do
  echo "$f  $(stat -c%s "$f") B  $(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$f")"
done
