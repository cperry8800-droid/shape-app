// node src/mixer-shot.cjs <baseUrl> <outPrefix> <w> <h> <views,comma> [extraQuery]
const { chromium } = require('playwright-core');
(async () => {
  const [,, base, out, w, h, viewsArg, extra] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  for (const view of viewsArg.split(',')) {
    const p = await b.newPage({ viewport: { width: +w, height: +h } });
    const errs = [];
    p.on('pageerror', e => errs.push(String(e)));
    p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); });
    await p.goto(`${base}?view=${view}${extra ? '&' + extra : ''}`);
    await p.waitForFunction(() => window.__ok === true, null, { timeout: 60000 }).catch(() => errs.push('timeout waiting for __ok'));
    await p.waitForTimeout(400);
    await p.screenshot({ path: `${out}-${view}.png` });
    console.log(view, JSON.stringify({ info: await p.evaluate(() => window.__info), errs }));
    await p.close();
  }
  await b.close();
})();
