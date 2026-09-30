const { chromium } = require('playwright-core');
(async () => {
  const [,, mode, out] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = []; p.on('pageerror', (e) => errs.push(String(e).slice(0, 300))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 300)); });
  await p.goto(`http://127.0.0.1:8861/venue-booth.html?mode=${mode}&q=high`);
  await p.waitForTimeout(25000);
  await p.screenshot({ path: out, timeout: 120000 });
  console.log(mode, JSON.stringify(errs.filter((e) => !/favicon|404/.test(e)).slice(0, 5)));
  await b.close();
})();
