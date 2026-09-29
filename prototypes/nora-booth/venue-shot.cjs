// usage: node venue-shot.cjs <port> <outprefix> <w> <h> view1[,view2...] [extra query]
const { chromium } = require('playwright-core');
(async () => {
  const [,, port, out, w, h, views, extra] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  for (const view of views.split(',')) {
    const p = await b.newPage({ viewport: { width: +w, height: +h } });
    const errs = [];
    p.on('pageerror', (e) => errs.push('PAGEERROR ' + String(e).slice(0, 400)));
    p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
    const t0 = Date.now();
    await p.goto(`http://127.0.0.1:${port}/venue-test.html?view=${view}${extra ? '&' + extra : ''}`);
    try { await p.waitForFunction(() => window.__ok === true, null, { timeout: 180000 }); } catch (e) { errs.push('TIMEOUT'); }
    await p.waitForTimeout(300);
    const info = await p.evaluate(() => window.__info);
    await p.screenshot({ path: `${out}-${view}.png` });
    console.log(view, JSON.stringify(info), ((Date.now() - t0) / 1000).toFixed(1) + 's', errs.slice(0, 6).join(' | '));
    await p.close();
  }
  await b.close();
})();
