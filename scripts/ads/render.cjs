// node render.cjs <member|coach> <music.mp3> <music start, s> <out.mp4>
// Steps ad.html one frame at a time (30 fps, 1080x1920) into ffmpeg, under 30 s of the track.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const [ad, music, start, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await p.goto(`file://${__dirname}/ad.html?ad=${ad}`);
  await p.waitForFunction(() => window.READY === true, null, { timeout: 30000 });
  await p.waitForTimeout(800);
  const N = await p.evaluate(() => window.FRAMES);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
    '-ss', String(start), '-i', music, '-t', (N / 30).toFixed(3),
    '-af', `afade=t=in:st=0:d=0.04,afade=t=out:st=${(N / 30 - 1.3).toFixed(2)}:d=1.3`,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', '-r', '30', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let n = 0; n < N; n++) {
    await p.evaluate((k) => window.setFrame(k), n);
    const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (n % 150 === 0) console.log('frame', n, 'of', N, Math.round((Date.now() - t0) / 1000) + 's');
  }
  ff.stdin.end();
  await new Promise((r) => ff.on('close', r));
  await b.close();
  console.log('done', out, Math.round((Date.now() - t0) / 1000) + 's');
})().catch((e) => { console.error(e); process.exit(1); });
