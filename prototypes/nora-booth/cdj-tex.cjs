const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 400, height: 300 } });
  await p.goto('http://127.0.0.1:8821/cdj-test.html'); await p.waitForTimeout(2500);
  console.log(JSON.stringify(await p.evaluate(() => {
    const d = window.__deckA; const out = {};
    d.group.traverse((o) => { if (o.isMesh) { for (const k of ['map', 'emissiveMap']) { const t = o.material[k]; if (t && t.image) out[o.name + '.' + k] = [t.image.width, t.image.height]; } } });
    return out;
  })));
  await b.close();
})();
