// A clipped screenshot of one shot, for side-by-side detail: node cropshot.cjs <url> <out.png> <mode> <x> <y> <w> <h>
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, mode, x, y, w, h] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url); await p.waitForFunction(() => window.__booth && window.__booth.nora, null, { timeout: 240000 });
  await p.evaluate((m) => window.__booth.setMode(m), mode); await p.waitForTimeout(3000);
  await p.screenshot({ path: out, clip: { x: +x, y: +y, width: +w, height: +h }, timeout: 240000 });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
