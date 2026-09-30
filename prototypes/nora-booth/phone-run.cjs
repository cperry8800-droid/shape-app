const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 300)));
  p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url().slice(-60)); });
  await p.goto(url); await p.waitForTimeout(20000);
  await p.screenshot({ path: out + '-pre.png' });
  await p.tap('#start'); await p.waitForTimeout(25000);
  await p.screenshot({ path: out + '-live.png' });
  const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, live: document.body.classList.contains('live'), station: document.body.classList.contains('station'), np: document.getElementById('np').textContent, bpm: document.getElementById('bpm').textContent }));
  console.log(JSON.stringify({ m, errs }));
  await b.close();
})();
