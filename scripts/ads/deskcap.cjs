// node deskcap.cjs   the coach's desktop dashboard as the site draws it in its own example mode
// (TrainerApp.html?example=1: sample clients, this tab signed out), one picture a page -> work/desk/d-<page>.jpg
// The pages come from a server of public/ (node serve.cjs, port 8850; PAGES=<origin> for another).
// ⚠ Exits 1 before saving a page that did not load or is not showing the example (its band, "Sample clients"):
// without the example a signed-out dashboard is every card saying it could not be read, and that would be a
// good picture of the wrong thing.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const out = path.join(__dirname, 'work', 'desk');
  const base = process.env.PAGES || 'http://127.0.0.1:8850';
  const b = await chromium.launch();
  const fail = async (why) => { console.error('not captured, ' + why); await b.close(); process.exit(1); };
  const p = await b.newPage({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 });
  await p.mouse.move(640, 36);   // off the side rail (it opens under the pointer) and off every card
  const shots = [];
  for (const t of ['today', 'clients', 'programs', 'week']) {
    const url = base + '/newdesign/TrainerApp.html?example=1#' + t;
    const resp = await p.goto(url, { waitUntil: 'load' });
    // (moving to the next page is a change of #tab on the same document: no response comes with it)
    if (resp && !resp.ok()) await fail(`${url} answered ${resp.status()}`);
    await p.waitForTimeout(t === 'today' ? 9000 : 5000);
    await p.mouse.move(640, 36);
    await p.waitForTimeout(700);
    const example = await p.evaluate(() => /sample clients/i.test(document.body.innerText));
    if (!example) await fail(`${url} is not showing the dashboard's example`);
    shots.push([t, await p.screenshot({ type: 'jpeg', quality: 93 })]);
    console.log(t, await p.evaluate(() => document.title));
  }
  // all four or none: a failed run leaves the pictures that were there
  fs.mkdirSync(out, { recursive: true });
  for (const [t, buf] of shots) fs.writeFileSync(path.join(out, `d-${t}.jpg`), buf);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
