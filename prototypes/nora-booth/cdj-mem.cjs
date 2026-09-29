const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 600, height: 400 } });
  const errs=[]; p.on('pageerror', e => errs.push(String(e)));
  await p.goto(process.argv[2]); await p.waitForTimeout(3000);
  const before = await p.evaluate(() => { return null; });
  const r = await p.evaluate(async () => {
    // memory with decks live (the test scene itself holds 4 geometries: table, trim, floor + pmrem)
    const r0 = window.__mem ? window.__mem() : null;
    const after = window.__dispose();
    await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
    return { live: r0, afterDispose: after };
  });
  console.log(JSON.stringify({ r, errs }));
  await b.close();
})();
