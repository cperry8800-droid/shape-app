// Sample Nora's hips / head / hands per update and report the largest per-step jumps: node motion-sample.cjs <url> <steps>
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, steps] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(url); await p.waitForTimeout(12000);
  const r = await p.evaluate((N) => new Promise((res) => {
    const n = window.__booth.nora; const vrm = n.vrm; const orig = n.update.bind(n);
    const names = ['hips', 'head', 'leftHand', 'rightHand'];
    const S = []; let sdt = [];
    n.update = (dt, f) => {
      orig(dt, f);
      const row = [];
      for (const nm of names) { const o = vrm.humanoid.getNormalizedBoneNode(nm); const v = new (o.position.constructor)(); o.getWorldPosition(v); row.push([v.x, v.y, v.z]); }
      S.push(row); sdt.push(Math.min(dt, 0.05));
      if (S.length >= N) {
        n.update = orig;
        const out = {};
        names.forEach((nm, k) => {
          let maxV = 0, maxA = 0, sumV = 0; let pv = null;
          for (let i = 1; i < S.length; i++) {
            const d = Math.hypot(S[i][k][0]-S[i-1][k][0], S[i][k][1]-S[i-1][k][1], S[i][k][2]-S[i-1][k][2]);
            const v = d / sdt[i]; sumV += v; maxV = Math.max(maxV, v);
            if (pv != null) maxA = Math.max(maxA, Math.abs(v - pv) / sdt[i]); pv = v;
          }
          out[nm] = { maxSpeed: +maxV.toFixed(3), meanSpeed: +(sumV / (S.length - 1)).toFixed(3), maxAccel: +maxA.toFixed(2) };
        });
        out.steps = S.length; out.simSeconds = +sdt.reduce((a, b) => a + b, 0).toFixed(2); out.groove = n._groove && { amp: n._groove.amp, energy: n._groove.energy };
        res(out);
      }
    };
  }), +steps || 80);
  console.log(JSON.stringify(r)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
