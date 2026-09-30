// node cdj-shot.cjs URL OUTPREFIX W H WAIT view1,view2,...
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, w, h, wait, views] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: +w||900, height: +h||600 } });
  const errs=[]; p.on('pageerror', e => errs.push(String(e))); p.on('console', m => { if (m.type()==='error'||m.type()==='warning') errs.push(m.type()+': '+m.text()); });
  await p.goto(url); await p.waitForTimeout(+wait||2500);
  const res = {};
  for (const v of (views||'player').split(',')) {
    await p.evaluate((v) => window.__setView(v), v);
    await p.waitForTimeout(600);
    await p.screenshot({ path: `${out}-${v}.png` });
    res[v] = await p.evaluate(() => window.__info);
  }
  const extra = await p.evaluate(() => ({ ok: window.__ok, deck: window.__deckStats, anchors: window.__anchors }));
  console.log(JSON.stringify({ ...extra, views: res, errs }, null, 0));
  await b.close();
})();
