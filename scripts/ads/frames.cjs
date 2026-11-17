// node frames.cjs <member|coach> <out prefix> <second,second,...>   stills of the ad at the given times
const { chromium } = require('playwright');
(async () => {
  const [ad, prefix, list] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await p.goto(`file://${__dirname}/ad.html?ad=${ad}`);
  await p.waitForFunction(() => window.READY, null, { timeout: 30000 });
  const ready = await p.evaluate(() => window.READY);
  if (ready !== true) { await b.close(); console.error('no frames, ' + ready); process.exit(1); }
  await p.waitForTimeout(600);
  for (const s of list.split(',')) {
    await p.evaluate((n) => window.setFrame(n), Math.round(Number(s) * 30));
    await p.waitForTimeout(120);
    await p.screenshot({ path: `${prefix}-${String(s).replace('.', '_')}.png` });
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
