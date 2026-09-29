// Runs dist/trackAnalysis-real.html in headless Chromium: render, then analyse at 1× and under
// DevTools CPU throttling (4× = the "mid-tier mobile" preset; 6× = "low-end mobile").
const { chromium } = require('playwright-core');
(async () => {
  const url = process.argv[2];
  const b = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', args: ['--autoplay-policy=no-user-gesture-required', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage();
  const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(url);
  await p.waitForFunction(() => window.__ready === true, null, { timeout: 60000 });
  const prep = await p.evaluate(() => window.__prepare());
  const out = { prep, track: await p.evaluate(() => window.__track), errs };
  out.x1 = await p.evaluate(() => window.__analyze(5));
  const cdp = await p.context().newCDPSession(p);
  for (const rate of [4, 6]) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate });
    const r = await p.evaluate(() => window.__analyze(3));
    out['x' + rate] = { full_ms: r.full.analyzeMsMedian, sixty_ms: r.sixty.analyzeMsMedian, wave_cold60_ms: r.waveform.msCold60s, bpm: r.full.bpm, downbeatErrMs: r.full.downbeatErrMs };
  }
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
