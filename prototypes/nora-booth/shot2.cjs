const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, w, h] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w||640, height: +h||480 } });
  const errs=[]; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  await p.goto(url); await p.waitForFunction(()=>window.__ready||window.__err, null, {timeout: 60000}).catch(()=>{});
  await p.screenshot({ path: out });
  console.log(JSON.stringify({ info: await p.evaluate(()=>window.__info||window.__err||null), errs }));
  await b.close();
})();
