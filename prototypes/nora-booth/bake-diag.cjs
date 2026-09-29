// Dump the bake page's ?diag=1 report (materials, bones, extents): node bake-diag.cjs <url> <out.json>
const { chromium } = require('playwright-core');
const fs = require('fs');
(async () => {
  const [,, url, out] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage();
  await p.goto(url);
  const r = await p.evaluate(() => window.__bake, { timeout: 0 });
  fs.writeFileSync(out, typeof r === 'string' ? r : JSON.stringify(r));
  console.log('wrote', out);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
