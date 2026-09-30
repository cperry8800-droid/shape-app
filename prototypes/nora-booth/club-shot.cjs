// Render club-test views: node club-shot.cjs <baseUrl> <outPrefix> <view[,view…]> [extraQuery] [w] [h] [waitMs]
const { chromium } = require('playwright-core');
(async () => {
  const [,, base, out, views, extra = '', w = '1280', h = '720', wait = '6000'] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w, height: +h } });
  const errs = []; p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 400))); p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 400)); });
  for (const v of views.split(',')) {
    await p.goto(`${base}?view=${v}${extra ? '&' + extra : ''}`);
    await p.waitForFunction(() => window.__ok, null, { timeout: 120000 });
    await p.waitForTimeout(+wait);
    const info = await p.evaluate(() => window.__info || null);
    if (info) console.log(v, JSON.stringify(info), JSON.stringify(await p.evaluate(() => window.__afterDispose)));
    else { await p.screenshot({ path: `${out}-${v}.png` }); console.log('shot', `${out}-${v}.png`); }
  }
  console.log(JSON.stringify({ errs: errs.slice(0, 12) }));
  await b.close();
})();
