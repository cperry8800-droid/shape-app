// node render.cjs <member|coach> <music.mp3> <music start, s> <out.mp4>
// Steps ad.html one frame at a time (30 fps, 1080x1920) into ffmpeg, under 30 s of the track.
// FRAMES=<n> renders only the first n frames (a quick check). Exits 1, saying why, if the page is missing
// something it needs, if a recording's frame is missing, or if ffmpeg fails: <out.mp4> is then not a render.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
(async () => {
  const [ad, music, start, out] = process.argv.slice(2);
  const b = await chromium.launch({ args: ['--allow-file-access-from-files'] });
  const p = await b.newPage({ viewport: { width: 1080, height: 1920 }, deviceScaleFactor: 1 });
  p.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await p.goto(`file://${__dirname}/ad.html?ad=${ad}`);
  await p.waitForFunction(() => window.READY, null, { timeout: 30000 });
  const ready = await p.evaluate(() => window.READY);
  if (ready !== true) { await b.close(); console.error('not rendered, ' + ready); process.exit(1); }
  await p.waitForTimeout(800);
  const N = Math.min(await p.evaluate(() => window.FRAMES), Number(process.env.FRAMES) || Infinity);
  const ff = spawn('ffmpeg', ['-y', '-v', 'error', '-f', 'image2pipe', '-framerate', '30', '-c:v', 'mjpeg', '-i', '-',
    '-ss', String(start), '-i', music, '-t', (N / 30).toFixed(3),
    '-af', `afade=t=in:st=0:d=0.04,afade=t=out:st=${Math.max(0, N / 30 - 1.3).toFixed(2)}:d=1.3`,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '17', '-preset', 'medium', '-r', '30', '-movflags', '+faststart',
    '-c:a', 'aac', '-b:a', '192k', '-shortest', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  // ffmpeg can fail to start, die part way (its pipe then refuses the next frame) or fail to finish the
  // file: each is caught here and ends the run with exit 1
  let ffError = null;
  ff.on('error', (e) => { ffError = ffError || e; });
  ff.stdin.on('error', (e) => { ffError = ffError || e; });
  const closed = new Promise((r) => { ff.on('close', (code) => r(code)); ff.on('error', () => r(-1)); });
  const t0 = Date.now();
  let pageError = null;
  for (let n = 0; n < N; n++) {
    if (ffError || ff.exitCode !== null) break;
    try { await p.evaluate((k) => window.setFrame(k), n); } catch (e) { pageError = String(e.message || e).split('\n')[0]; break; }
    const buf = await p.screenshot({ type: 'jpeg', quality: 94 });
    if (ffError || ff.exitCode !== null) break;
    if (!ff.stdin.write(buf)) await Promise.race([new Promise((r) => ff.stdin.once('drain', r)), closed]);
    if (n % 150 === 0) console.log('frame', n, 'of', N, Math.round((Date.now() - t0) / 1000) + 's');
  }
  if (pageError) ff.kill('SIGKILL'); else if (!ff.stdin.destroyed) ff.stdin.end();
  const code = await closed;
  await b.close();
  if (pageError) { console.error(`not rendered, frame failed: ${pageError}`); process.exit(1); }
  if (ffError || code !== 0) { console.error(`not rendered, ffmpeg failed (${ffError ? ffError.message : 'exit ' + code}): ${out} is not a finished video`); process.exit(1); }
  console.log('done', out, Math.round((Date.now() - t0) / 1000) + 's');
})().catch((e) => { console.error(e); process.exit(1); });
