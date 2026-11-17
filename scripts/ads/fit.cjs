// node fit.cjs : every headline line of both ads must fit the frame (1080 wide, 60 px right margin)
const { chromium } = require('playwright');
(async () => {
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 } });
  for (const ad of ['member', 'coach']) {
    await p.goto(`file://${__dirname}/ad.html?ad=${ad}`);
    await p.waitForFunction(() => window.READY === true);
    const over = await p.evaluate(() => { const out = []; document.querySelectorAll('.scene').forEach((sc) => { sc.style.opacity = 1; sc.querySelectorAll('.ln b').forEach((x) => { x.style.transform = 'none'; const r = x.getBoundingClientRect(); if (r.right > 1040) out.push(x.textContent + ' → ' + Math.round(r.right)); }); sc.style.opacity = 0; }); return out; });
    console.log(ad, over.length ? over : 'all lines fit');
  }
  await b.close();
})();
