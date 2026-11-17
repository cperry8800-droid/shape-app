// node deskcap.cjs [page,page,...]   the coach's desktop dashboard as the site draws it in its own example mode
// (TrainerApp.html?example=1: sample clients, this tab signed out), one picture a page -> work/desk/d-<page>.jpg
// The pages are today, clients, programs and week unless others are named. They come from a server of public/
// (node serve.cjs, port 8850; PAGES=<origin> for another).
// ⚠ Exits 1, saving nothing, when a page did not load, is not showing the example (its band, "Sample clients":
// without it a signed-out dashboard is every card saying it could not be read), or is not the page asked for.
// The dashboard opens Today for any #name it does not know, so a page renamed in the site would be a good
// picture of Today under another page's name: the side rail's current link has to be the one asked for.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const out = path.join(__dirname, 'work', 'desk');
  const base = process.env.PAGES || 'http://127.0.0.1:8850';
  const b = await chromium.launch();
  const fail = async (why) => { console.error('not captured, ' + why); await b.close(); process.exit(1); };
  const p = await b.newPage({ viewport: { width: 1360, height: 1000 }, deviceScaleFactor: 1 });
  await p.mouse.move(640, 36);   // off the side rail (it opens under the pointer) and off every card
  const shots = [];
  for (const t of (process.argv[2] || 'today,clients,programs,week').split(',')) {
    const url = base + '/newdesign/TrainerApp.html?example=1#' + t;
    const resp = await p.goto(url, { waitUntil: 'load' });
    // (moving to the next page is a change of #tab on the same document: no response comes with it)
    if (resp && !resp.ok()) await fail(`${url} answered ${resp.status()}`);
    await p.waitForTimeout(t === 'today' ? 9000 : 5000);
    await p.mouse.move(640, 36);
    await p.waitForTimeout(700);
    const example = await p.evaluate(() => /sample clients/i.test(document.body.innerText));
    if (!example) await fail(`${url} is not showing the dashboard's example`);
    const showing = await p.evaluate(() => { const a = document.querySelector('[aria-current="page"]'); return a ? (a.getAttribute('href') || '').split('#')[1] || '' : ''; });
    if (showing !== t) await fail(`asked for the dashboard's "${t}" page, and it is showing "${showing || 'no page it marks as current'}"`);
    shots.push([t, await p.screenshot({ type: 'jpeg', quality: 93 })]);
    console.log(t, await p.evaluate(() => document.title));
  }
  // all four or none: a failed run leaves the pictures that were there
  fs.mkdirSync(out, { recursive: true });
  for (const [t, buf] of shots) fs.writeFileSync(path.join(out, `d-${t}.jpg`), buf);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
