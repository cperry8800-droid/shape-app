// Station-mode run: autostart, no forced mix; log phase + HUD every 2 s, screenshot on phase change.
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, total] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs = []; p.on('pageerror', e => errs.push('PAGEERROR ' + String(e).slice(0, 300)));
  p.on('console', m => { if (/error|warn/.test(m.type())) errs.push(m.type() + ': ' + m.text().slice(0, 300)); });
  p.on('response', r => { if (r.status() >= 400) errs.push('HTTP ' + r.status() + ' ' + r.url()); });
  await p.goto(url);
  const t0 = Date.now(); let last = '';
  while (Date.now() - t0 < +total) {
    await p.waitForTimeout(2000);
    const st = await p.evaluate(() => ({ station: document.body.classList.contains('station'), live: document.body.classList.contains('live'),
      np: document.getElementById('np').textContent, npa: document.getElementById('npa').textContent, bpm: document.getElementById('bpm').textContent,
      bar: document.getElementById('bar').textContent, phase: window.__booth && window.__booth.ms ? window.__booth.ms.phase : null }));
    const key = st.phase + '|' + st.np;
    if (key !== last) { console.log(JSON.stringify({ t: ((Date.now() - t0) / 1000).toFixed(0), ...st })); await p.screenshot({ path: `${out}-${st.phase}-${((Date.now() - t0) / 1000).toFixed(0)}.png` }); last = key; }
  }
  console.log(JSON.stringify({ errs: errs.slice(0, 15) }));
  await b.close();
})();
