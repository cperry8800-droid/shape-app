// node deskcap.cjs   the coach's desktop dashboard as the site draws it in its own example mode
// (TrainerApp.html?example=1: sample clients, this tab signed out), one picture a page -> work/desk/d-<page>.jpg
// The pages come from a server of public/ (node serve.cjs, port 8850; PAGES=<origin> for another).
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const out = path.join(__dirname, 'work', 'desk'); fs.mkdirSync(out, { recursive: true });
  const base = process.env.PAGES || 'http://127.0.0.1:8850';
  const b = await chromium.launch();
  const p = await b.newPage({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 });
  await p.mouse.move(640, 36);   // off the side rail (it opens under the pointer) and off every card
  for (const t of ['today', 'clients', 'programs', 'week']) {
    await p.goto(base + '/newdesign/TrainerApp.html?example=1#' + t, { waitUntil: 'load' });
    await p.waitForTimeout(t === 'today' ? 9000 : 5000);
    await p.mouse.move(640, 36);
    await p.waitForTimeout(700);
    await p.screenshot({ path: path.join(out, `d-${t}.jpg`), type: 'jpeg', quality: 93 });
    console.log(t, await p.evaluate(() => document.title));
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
