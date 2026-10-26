// The LED wall's show (wallShow.mjs), photographed: wall-shot.cjs <url> <out-prefix> <w> <h> <shot> <looks> [frames]
//   <looks>  comma list of dawn|tunnel|chase|plate|show; each loads <url>&wall=<look> (show: no pin)
//   [frames] screenshots per look, about 2.5 s apart (the headline builds, holds and clears on the beat)
// Prints, per screenshot, the beat position and the wall's look as club.wallShow reports it.
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, w, h, shot, looks, frames] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  for (const look of (looks || 'show').split(',')) {
    const p = await b.newPage({ viewport: { width: +w || 1280, height: +h || 720 } });
    const errs = [];
    p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e)));
    p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
    const u = url + (url.includes('?') ? '&' : '?') + (look === 'show' ? '' : 'wall=' + look) + '&mode=' + (shot || 'club');
    await p.goto(u, { timeout: 180000, waitUntil: 'domcontentloaded' });
    await p.waitForFunction(() => window.__booth && window.__frames > 3, null, { timeout: 240000 });
    await p.waitForTimeout(4000);
    // a plate shows only once its loop has loaded (the pin falls back to the dawn until then)
    if (look === 'plate') await p.waitForFunction(() => !!window.__booth.club.wallShow.plateTo, null, { timeout: 300000, polling: 250 });
    // AT=1,4.3,27 photographs the first phrase's beat positions instead (the frame lands a little after)
    const at = (process.env.AT || '').split(',').filter(Boolean).map(Number);
    for (let i = 0; i < (at.length || +frames || 1); i++) {
      if (at.length) await p.waitForFunction((b) => window.__booth.club.wallShow.beat >= b, at[i], { timeout: 900000, polling: 50 });
      else if (i) await p.waitForTimeout(2500);
      const info = await p.evaluate(() => { const s = window.__booth.club.wallShow; return { beat: +s.beat.toFixed(2), from: s.from, to: s.to, mix: +s.mix.toFixed(2), plate: !!s.plateTo, loops: window.__booth.club.wallLoops.map((l) => l.state) }; });
      await p.screenshot({ path: `${out}-${look}-${i}.png`, timeout: 240000 });
      console.log(JSON.stringify({ look, i, ...info }));
    }
    if (errs.length) console.log(JSON.stringify({ look, errs: errs.filter((e) => !/favicon|404/.test(e)).slice(0, 8) }));
    await p.close();
  }
  await b.close();
})();
