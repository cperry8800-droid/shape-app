const { chromium } = require('playwright-core');
(async () => {
  const [,, url, timeout] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if ((m.type() === 'error' || m.type() === 'warning') && !/favicon/.test(m.text())) errs.push(m.type() + ': ' + m.text()); });
  const t = Date.now();
  await p.goto(url);
  await p.waitForFunction(() => window.__done === true, null, { timeout: +timeout || 600000 });
  const rep = await p.evaluate(() => window.__report);
  console.log(JSON.stringify({ secs: (Date.now() - t) / 1000, errs, rep }, null, 1));
  await b.close();
})();
