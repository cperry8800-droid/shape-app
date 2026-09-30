# Cinematic intro video assets

Only `beat-5.mp4` (and its poster, `beat-5-poster.jpg`) is loaded: `src/app/intro-preview/IntroScroll.tsx`
names it (`SCENE_1`) and `public/app.js` names it (`introVideo`).

**Nothing discovers files in this directory.** A clip dropped here is not picked up
automatically; reference it from the page or component that plays it. The guard in
`tests/heavy-assets-referenced.test.mjs` fails on any tracked binary over 200 KB that no
tracked file names.

(An earlier version of this file said the scroll container at `/intro-preview` picks clips up
by name and listed `beat-0.mp4` to `beat-4.mp4`. Neither was ever true of the code, and none
of those files exist. `beat-6.mp4` to `beat-9.mp4`, which nothing referenced, were removed on
2026-09-30; they are in git history.)
