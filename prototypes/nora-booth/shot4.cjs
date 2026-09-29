// Mix test: autostart, schedule a transition, sample phase/hands/channels and screenshot on each phase change.
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, total] = process.argv;
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 900, height: 560 } });
  const errs=[]; p.on('pageerror', e => errs.push('PAGEERROR '+String(e).slice(0,300))); p.on('console', m => { if (m.type()==='error') errs.push('error: '+m.text().slice(0,300)); });
  await p.goto(url); await p.waitForTimeout(7000);
  await p.evaluate(()=>window.__booth.scheduleMix());
  let last = ''; const t0 = Date.now(); const log = [];
  while (Date.now() - t0 < (+total||70000)) {
    const st = await p.evaluate(() => { const m = window.__booth.ms; if (!m) return null; const h = (x)=>x?`${x.to}${x.k<1?'~':''}`:'-';
      return { bar: +window.__booth.bar.toFixed(2), phase: m.phase, hint: m.camHint, L: h(m.hands.left), R: h(m.hands.right),
        ch: [0,1].map(d=>m.ch[d]?`f${m.ch[d].fader.toFixed(2)} l${m.ch[d].low.toFixed(2)}`:''), cue: JSON.stringify(m.cueOn), shot: window.__booth.director.shot }; });
    if (st) { log.push(st); if (st.phase !== last) { last = st.phase; await p.screenshot({ path: `${out}-${st.phase}.png` }); } }
    await p.waitForTimeout(2500);
  }
  for (const r of log) console.log(JSON.stringify(r));
  console.log(JSON.stringify({ errs: errs.slice(0,10) }));
  await b.close();
})();
