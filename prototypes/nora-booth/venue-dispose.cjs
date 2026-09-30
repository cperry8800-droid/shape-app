const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('http://127.0.0.1:8861/venue-test.html?view=club&post=0&rm=1&novenue=' + (process.argv[2]||0) + '');
  await p.waitForFunction(() => window.__ok === true, null, { timeout: 120000 });
  const before = await p.evaluate(() => window.__info);
  const after = await p.evaluate(() => window.__dispose());
  console.log(JSON.stringify({ before, after, errs: errs.filter((e) => !/404/.test(e)) }));
  await b.close();
})();
