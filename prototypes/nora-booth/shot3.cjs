// Render the booth page: shot3.cjs <url> <out-prefix> <w> <h> <waitMs> [modes comma list]
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, w, h, wait, modes] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: +w||900, height: +h||560 } });
  const errs=[]; p.on('pageerror', e => errs.push('PAGEERROR '+String(e))); p.on('console', m => { if (m.type()==='error' || m.type()==='warning') errs.push(m.type()+': '+m.text().slice(0,300)); });
  await p.goto(url); await p.waitForTimeout(+wait||8000);
  const list = (modes||'').split(',').filter(Boolean);
  if (!list.length) { await p.screenshot({ path: out + '.png', timeout: 240000 }); }
  for (const m of list) { await p.evaluate((m)=>window.__booth && window.__booth.setMode(m), m); await p.waitForTimeout(1800); await p.screenshot({ path: `${out}-${m}.png`, timeout: 240000 }); }
  const info = await p.evaluate(()=>({ frames: window.__frames, bar: window.__booth && window.__booth.bar, shot: window.__booth && window.__booth.director.shot, gl: window.__booth && window.__booth.renderer && { calls: window.__booth.renderer.info.render.calls, tris: window.__booth.renderer.info.render.triangles, geos: window.__booth.renderer.info.memory.geometries }, crowd: window.__booth && window.__booth.club && window.__booth.club.crowdCount }));
  console.log(JSON.stringify({ info, errs: errs.filter(e=>!/favicon|404/.test(e)).slice(0,12) }));
  await b.close();
})();
