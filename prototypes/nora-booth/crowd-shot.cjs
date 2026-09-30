// node crowd-shot.cjs <url> <out.png> [w] [h]
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, w = '1280', h = '720'] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.text()); });
  await p.goto(url);
  await p.waitForFunction(() => window.__ready || window.__err, null, { timeout: 120000 });
  const info = await p.evaluate(() => ({ info: window.__info, err: window.__err }));
  await p.screenshot({ path: out });
  console.log(JSON.stringify(info)); if (errs.length) console.log('errs', errs.slice(0, 8));
  await b.close();
})().catch((e) => { console.error('SHOT FAILED', e); process.exit(1); });
