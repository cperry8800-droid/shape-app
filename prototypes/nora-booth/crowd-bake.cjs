// Run the crowd bake page and write the packed figures: node crowd-bake.cjs <url> <out.txt>
const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const [,, url, out] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url);
  const b64 = await p.evaluate(() => window.__bake, { timeout: 0 });
  const stats = await p.evaluate(() => window.__bakeStats);
  fs.writeFileSync(out, b64);
  console.log(stats); console.log('base64 chars', b64.length); if (errs.length) console.log('errs', errs);
  await b.close();
})().catch((e) => { console.error('BAKE FAILED', e); process.exit(1); });
