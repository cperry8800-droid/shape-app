// Sample the rendered colour of Nora's skin in a shot: node handprobe.cjs <url> <out-prefix> [modes]
// For each region (left hand, right hand, face) it projects the region's bones to the screen, then
// searches a small pixel spiral for pixels whose camera ray FIRST hits one of her SKIN meshes (so a
// sample can never land on the gear, a gap or her hair), screenshots, and averages the PNG there.
// The canvas has no preserveDrawingBuffer, so a GL read-back would be zeros.
const { chromium } = require('playwright-core');
(async () => {
  const [,, url, out, modes] = process.argv;
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
  await p.goto(url); await p.waitForFunction(() => window.__booth && window.__booth.nora, null, { timeout: 240000 }); await p.waitForTimeout(6000);
  const res = {};
  for (const m of (modes || 'jog,mixer,face').split(',')) {
    await p.evaluate((m) => window.__booth.setMode(m), m); await p.waitForTimeout(2500);
    const pts = await p.evaluate(() => {
      const B = window.__booth, vrm = B.nora.vrm, cam = B.camera, V = cam.position.constructor;
      const T = V.prototype.constructor; // THREE.Vector3
      const skins = []; vrm.scene.traverse((o) => { if (o.isMesh && /SKIN/i.test((o.material && o.material.name) || '')) skins.push(o); });
      const all = []; B.scene.traverse((o) => { if (o.isMesh && o.visible) all.push(o); });
      const rc = new (window.__booth.raycasterCtor || Object)();
      const wp = (n) => { const v = new V(); vrm.humanoid.getNormalizedBoneNode(n).getWorldPosition(v); return v; };
      const toScr = (v) => { const q = v.clone().project(cam); return [(q.x * 0.5 + 0.5) * innerWidth, (0.5 - q.y * 0.5) * innerHeight, q.z]; };
      const hits = (px, py) => {
        if (!window.__booth.raycast) return true;
        const h = window.__booth.raycast(px / innerWidth * 2 - 1, 1 - py / innerHeight * 2);
        return h && skins.includes(h);
      };
      const find = (v) => {
        const [x, y, z] = toScr(v); if (!(z < 1)) return null;
        for (let r = 0; r <= 24; r += 3) for (let a = 0; a < 6.283; a += r ? 0.5 : 7) {
          const px = Math.round(x + r * Math.cos(a)), py = Math.round(y + r * Math.sin(a));
          if (px < 5 || py < 140 || px > innerWidth - 5 || py > 560) continue; // clear of the HUD scrims
          if (hits(px, py)) return [px, py];
        }
        return null;
      };
      const handAt = (s) => wp(s + 'Hand').lerp(wp(s + 'MiddleProximal'), 0.5);
      const face = wp('head').lerp(wp('leftEye').add(wp('rightEye')).multiplyScalar(0.5), 0.6);
      return { L: find(handAt('left')), R: find(handAt('right')), face: find(face) };
    });
    const buf = await p.screenshot({ path: `${out}-${m}.png`, timeout: 240000 });
    res[m] = await p.evaluate(async ({ b64, pts }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const o = {};
      for (const [k, pt] of Object.entries(pts)) {
        if (!pt) { o[k] = 'not visible'; continue; }
        const d = g.getImageData(pt[0] - 2, pt[1] - 2, 5, 5).data; let r = 0, gg = 0, bb = 0;
        for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; bb += d[i + 2]; }
        const n = d.length / 4; r /= n; gg /= n; bb /= n;
        const mx = Math.max(r, gg, bb), mn = Math.min(r, gg, bb);
        o[k] = { at: pt, rgb: [Math.round(r), Math.round(gg), Math.round(bb)], luma: Math.round(0.2126 * r + 0.7152 * gg + 0.0722 * bb), sat: +(mx ? (mx - mn) / mx : 0).toFixed(2) };
      }
      return o;
    }, { b64: buf.toString('base64'), pts });
  }
  console.log(JSON.stringify(res)); await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
