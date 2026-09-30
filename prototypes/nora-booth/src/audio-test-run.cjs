const { chromium } = require('playwright-core');
(async () => {
  const [,, url, outPrefix, timeout] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1230, height: 900 } });
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/favicon|404/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  const t = Date.now();
  await p.goto(url);
  await p.waitForFunction(() => window.__done === true, null, { timeout: +timeout || 180000 });
  const rep = await p.evaluate(() => window.__report);
  if (outPrefix) {
    await p.screenshot({ path: `${outPrefix}-full.png`, fullPage: true });
    const cvs = await p.$$('canvas');
    for (let i = 0; i < cvs.length; i += 1) await cvs[i].screenshot({ path: `${outPrefix}-c${i}.png` });
  }
  console.log(JSON.stringify({ secs: (Date.now() - t) / 1000, errs, rep }, null, 1));
  await b.close();
})();
