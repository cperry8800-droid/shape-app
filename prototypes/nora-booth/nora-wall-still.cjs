// A still of Club Shape with NORA on the LED wall and the decks empty: the Radio page's Nora box
// header, public/nora-stage.webp (owner, 2026-10-15: "remove noras avatar from snapshot"; the
// placeholder model is pinned invisible, since the opening fly-in sets the room visible again).
//   [SCALE=2] [BURST=1] nora-wall-still.cjs <url> <out-prefix> <cams-json>
//   cams: [{ "id": "b", "pos": [x,y,z], "target": [x,y,z], "fov": 34 }]
//   writes <out-prefix>-<id>-<k>.png for k < BURST, 1.5 s apart
// The shipped still, with dist/ built and served as the README's Setup and Build describe:
//   SCALE=2 BURST=4 node nora-wall-still.cjs "http://127.0.0.1:8861/index.html?vrm=nora.vrm&q=high&mode=wide" /tmp/still \
//     '[{"id":"b","pos":[0,3.4,-15],"target":[0,4.4,5.44],"fov":34}]'
// then crop the 2.39:1 letterbox (its first lit row, 231 at SCALE=2) and keep the wall's top 1120
// rows (3200x1120), and downscale with Lanczos to 1720x602, WebP q88 method 6 (PIL:
// `im.crop((0, 231, 3200, 1351)).resize((1720, 602), Image.LANCZOS).save(out, quality=88, method=6)`).
// ⚠ SCALE=2 IS THE POINT (owner, 2026-10-15: "looks very pixelated"). The first still was rendered
// at 1x: the wall's 75 mm dots fell on a 5.4 px pitch the pixel grid could not hold evenly, and a
// 2x screen upscaled it. tests/nora-stage-header.test.mjs fails a still under 2x the box's width.
// ⚠ The moving heads follow the clock, so frames differ. BURST takes several, and the shipped one
// is the frame whose light matches the still the owner picked (no beam across the letters).
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, camsJson] = process.argv;
  const cams = JSON.parse(camsJson);
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: Number(process.env.SCALE) || 2 });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 200)));
  await p.addInitScript(() => { window.__hideNora = true; });
  await p.goto(url);
  await p.addStyleTag({ content: 'body > *:not(#stage){visibility:hidden!important}' });
  await p.waitForFunction(() => window.__booth && window.__booth.scene, null, { timeout: 120000 });
  // Nora's model stays out of the frame: the opening fly-in hides the room and then sets everything
  // visible again, so a one-off hide does not hold. Pin the VRM root's `visible` to false.
  await p.waitForFunction(() => { let n = 0; window.__booth.scene.traverse((o) => { if (o.isSkinnedMesh) n++; }); return n > 0; }, null, { timeout: 180000 });
  const hidden = await p.evaluate(() => {
    const scene = window.__booth.scene; const roots = new Set();
    scene.traverse((o) => { if (!o.isSkinnedMesh) return; let r = o; while (r.parent && r.parent !== scene) r = r.parent; roots.add(r); });
    for (const r of roots) Object.defineProperty(r, 'visible', { get: () => false, set: () => {}, configurable: true });
    return [...roots].map((r) => r.name || r.type);
  });
  console.log('hidden', JSON.stringify(hidden));
  // The wall runs CLUB SHAPE -> NORA -> SHAPE RADIO -> NORA, a phrase (32 beats) each, counting a
  // beat each time the room's beat index changes. A software renderer manages 1-3 fps, so step the
  // count straight to beat 35 (NORA, its wipe finished) and pin that artwork on the wall.
  await p.evaluate(() => {
    let wall = null; window.__booth.scene.traverse((o) => { if (o.name === 'ledWall') wall = o; });
    window.__wall = wall;
    const club = window.__booth.club;
    for (let i = 1; i <= 36; i++) { club.set({ beat: i % 4 }); club.update(0.5, 1000 + i * 0.5); }
  });
  await p.waitForTimeout(3000);
  const art = await p.evaluate(() => { const u = window.__wall.material.uniforms; const nora = u.uMaskB.value; window.__wall.onBeforeRender = () => { u.uMask.value = nora; u.uMaskB.value = nora; u.uMix.value = 1; }; return { beat: +u.uBeat.value.toFixed(1), frames: window.__frames }; });
  console.log('pinned at', JSON.stringify(art));
  for (const c of cams) {
    await p.evaluate((c) => {
      const d = window.__booth.director;
      d.update = () => ({ pos: { x: c.pos[0], y: c.pos[1], z: c.pos[2] }, target: { x: c.target[0], y: c.target[1], z: c.target[2] }, fov: c.fov });
    }, c);
    await p.waitForTimeout(6000);
    for (let k = 0; k < (Number(process.env.BURST) || 1); k++) {
      await p.screenshot({ path: `${out}-${c.id}-${k}.png`, timeout: 240000 });
      console.log('shot', c.id, k);
      await p.waitForTimeout(1500);
    }
  }
  console.log(JSON.stringify(errs.slice(0, 5)));
  await b.close();
})();
