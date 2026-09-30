// Per-step trace of the right hand: bone speed vs the wrist spring's own speed, and what the hand was doing.
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, steps] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(url); await p.waitForTimeout(12000);
  const r = await p.evaluate((N) => new Promise((res) => {
    const n = window.__booth.nora; const vrm = n.vrm; const orig = n.update.bind(n);
    const rows = []; let prev = null;
    n.update = (dt, f) => {
      orig(dt, f);
      const o = vrm.humanoid.getNormalizedBoneNode('rightHand'); const v = new (o.position.constructor)(); o.getWorldPosition(v);
      const sdt = Math.min(dt, 0.05);
      const A = n.arm && n.arm.R; const st = A && A.state;
      const hands = window.__booth.ms && window.__booth.ms.hands; const hr = hands && (hands.R || hands.right);
      const row = { i: rows.length, bone: prev ? +(v.distanceTo(prev) / sdt).toFixed(2) : 0, spring: st ? +st.vel.length().toFixed(2) : null, palm: A && A.palm, to: hr && hr.to, k: hr && hr.k != null ? +hr.k.toFixed(2) : null, pos: [+v.x.toFixed(3), +v.y.toFixed(3), +v.z.toFixed(3)] };
      rows.push(row); prev = v;
      if (rows.length >= N) { n.update = orig; res({ hot: rows.filter((r) => r.bone > 1.0), keys: Object.keys(A || {}), msKeys: Object.keys(window.__booth.ms || {}) }); }
    };
  }), +steps || 90);
  console.log(JSON.stringify(r)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
