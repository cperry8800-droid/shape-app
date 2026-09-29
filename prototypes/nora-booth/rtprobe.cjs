// Record every render-target texture the page allocates (texStorage2D / renderbufferStorageMultisample),
// so bloom and composer sizes are measured, not read off the source: node rtprobe.cjs <url> <w> <h>
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, w, h] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: +w || 1280, height: +h || 720 } });
  await p.addInitScript(() => {
    const log = (window.__rt = []);
    const P = WebGL2RenderingContext.prototype;
    const ts = P.texStorage2D; P.texStorage2D = function (t, l, f, W, H) { log.push({ k: 'tex', f, W, H }); return ts.apply(this, arguments); };
    const ti = P.texImage2D; P.texImage2D = function (t, l, f, W, H, bd, fm, ty, px) { if (arguments.length >= 9 && px == null) log.push({ k: 'rt', f, W, H }); return ti.apply(this, arguments); };
    const rb = P.renderbufferStorageMultisample; P.renderbufferStorageMultisample = function (t, s, f, W, H) { log.push({ k: 'msaa', s, f, W, H }); return rb.apply(this, arguments); };
  });
  await p.goto(url); await p.waitForTimeout(14000);
  const r = await p.evaluate(() => {
    const c = document.getElementById('stage');
    const HALF = 0x881A; // RGBA16F
    const sizes = {};
    for (const e of window.__rt) { if (e.k === 'tex') continue; const key = `${e.k}:0x${(e.f||0).toString(16)}:${e.k}${e.s ? 'x' + e.s : ''}:${e.W}x${e.H}`; sizes[key] = (sizes[key] || 0) + 1; }
    return { canvas: [c.width, c.height], dpr: devicePixelRatio, rgba16f_and_msaa: sizes };
  });
  console.log(JSON.stringify(r)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
