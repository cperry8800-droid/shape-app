const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, w, h, wait] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w||400, height: +h||300 } });
  const errs=[]; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); });
  await p.goto(url); await p.waitForTimeout(+wait||1500);
  await p.screenshot({ path: out });
  console.log(JSON.stringify({ ok: await p.evaluate(()=>window.__ok), errs }));
  await b.close();
})();
