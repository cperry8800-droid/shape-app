// node lighttest.cjs <url> <which: none|key|top|wash|hemi> — zero one light, shoot the JOG shot, report the hand's mean colour
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, which] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url); await p.waitForTimeout(12000);
  await p.evaluate((which) => {
    let root = window.__booth.nora.vrm.scene; while (root.parent) root = root.parent;
    root.traverse((o) => {
      if (!o.isLight) return;
      const y = o.position.y, x = o.position.x;
      const isKey = o.type === 'SpotLight' && y < 6, isTop = o.type === 'SpotLight' && y > 6 && Math.abs(x) < 0.5, isWash = o.type === 'SpotLight' && y > 6 && Math.abs(x) > 0.5, isHemi = o.type === 'HemisphereLight';
      if ((which === 'key' && isKey) || (which === 'top' && isTop) || (which === 'wash' && isWash) || (which === 'hemi' && isHemi)) { o.__off = true; o.intensity = 0; o.visible = false; }
    });
    window.__booth.setMode('jog');
  }, which);
  await p.waitForTimeout(2500);
  const png = await p.screenshot({ path: `shots-v2/light-${which}.png` });
  // read the hand region back from the PNG itself (a WebGL canvas without preserveDrawingBuffer reads as black)
  const m = await p.evaluate((b64) => new Promise((res) => { const im = new Image(); im.onload = () => { const g = document.createElement('canvas'); g.width = im.width; g.height = im.height; const ctx = g.getContext('2d'); ctx.drawImage(im, 0, 0); const sx = Math.round(im.width * 0.58), sy = Math.round(im.height * 0.28), sw = Math.round(im.width * 0.14), sh = Math.round(im.height * 0.16); const d = ctx.getImageData(sx, sy, sw, sh).data; let r = 0, gg = 0, bb = 0, n = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; n++; } res({ r: Math.round(r / n), g: Math.round(gg / n), b: Math.round(bb / n), box: [sx, sy, sw, sh] }); }; im.src = 'data:image/png;base64,' + b64; }), png.toString('base64'));
  console.log(which, JSON.stringify(m)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
