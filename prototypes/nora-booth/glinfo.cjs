// Per-frame draw calls / triangles, accumulated over N frames: node glinfo.cjs <url> <w> <h> <mode>
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, w, h, mode] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  // Measured 2026-10-03: with the cinematic chain on, the high tier's page load runs past
  // Playwright's 30 s default in SwiftShader even with nothing else running, so wait up to 3 minutes.
  await p.goto(url, { timeout: 180000 }); await p.waitForTimeout(12000);
  if (mode) await p.evaluate((m) => window.__booth.setMode(m), mode);
  await p.waitForTimeout(2000);
  const r = await p.evaluate(() => new Promise((res) => {
    const R = window.__booth.renderer; R.info.autoReset = false; R.info.reset();
    const f0 = window.__frames; const t0 = performance.now();
    const tick = () => { if (window.__frames - f0 >= 6) { const n = window.__frames - f0; res({ frames: n, ms: (performance.now() - t0) / n, calls: R.info.render.calls / n, tris: R.info.render.triangles / n, geos: R.info.memory.geometries, tex: R.info.memory.textures, progs: R.info.programs.length, crowd: window.__booth.club.crowdCount, avatarsLoaded: !!window.__booth.club.group.getObjectByName('crowdAvatars') }); } else requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
  }));
  console.log(JSON.stringify(r)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
