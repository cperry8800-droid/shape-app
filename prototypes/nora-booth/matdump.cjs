const { chromium } = require('playwright-core');
(async () => {
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--autoplay-policy=no-user-gesture-required'] });
  const p = await b.newPage({ viewport: { width: 640, height: 360 } });
  await p.goto(process.argv[2]); await p.waitForTimeout(12000);
  const r = await p.evaluate(() => {
    const out = []; const seen = new Set();
    window.__booth.nora.vrm.scene.traverse((o) => { if (!o.isMesh) return; const ms = Array.isArray(o.material) ? o.material : [o.material]; for (const m of ms) { if (seen.has(m.uuid)) continue; seen.add(m.uuid); out.push({ name: m.name, type: m.type, color: m.color && m.color.getHexString(), emissive: m.emissive && m.emissive.getHexString(), ei: m.emissiveIntensity, map: !!m.map, key: m.customProgramCacheKey ? m.customProgramCacheKey() : '', rough: m.roughness, metal: m.metalness, env: m.envMapIntensity, tone: m.toneMapped }); } });
    const lights = []; window.__booth.renderer; document.querySelector('canvas');
    const sc = window.__booth.nora.vrm.scene; let root = sc; while (root.parent) root = root.parent;
    root.traverse((o) => { if (o.isLight) lights.push({ t: o.type, i: +o.intensity.toFixed(2), vis: o.visible, pos: o.position.toArray().map((x) => +x.toFixed(2)), d: o.distance }); });
    return { mats: out, lights };
  });
  console.log(JSON.stringify(r, null, 0)); await b.close();
})();
