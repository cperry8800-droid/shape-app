// Count the venue's instanced meshes and their triangles: node venueprobe.cjs <url>
const { chromium } = require('playwright-core');
(async () => {
  const [,, url] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(url); await p.waitForTimeout(12000);
  const r = await p.evaluate(() => {
    const sc = window.__booth.club.group.parent; const out = [];
    sc.traverse((o) => { if (!o.isMesh || !o.visible) return; const g = o.geometry; const tri = (g.index ? g.index.count : g.attributes.position.count) / 3; const n = o.isInstancedMesh ? o.count : 1; if (tri * n > 20000 || o.isInstancedMesh) out.push([o.name || o.type, n, Math.round(tri), Math.round(tri * n)]); });
    return out.sort((a, b) => b[3] - a[3]);
  });
  console.log(JSON.stringify(r)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
