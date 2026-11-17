// node seqcap.cjs <name> "<step>|<step>|..." <frames> <scroll px> [hold frames]
// Walks the app's own preview to a screen (steps: visible text, or css:<selector>, or wait:<ms>; a step that
// starts with ? is taken only if it is there), then scrolls that screen as a person would and saves one
// picture a frame to work/seq/<name>/f000.jpg ...
// Nothing is composed: every frame is the running app in its signed-out preview (sample data). The app is
// the dev server: cd mobile-app && npx vite --port 5199 --strictPort --host 127.0.0.1 (APP=<url> for another).
// TYPE="some words" TYPE_INTO=<selector> types them into that field, a letter every other frame, in place of
// a scroll. EXPECT="some words" must be on the screen once the steps are done (any letter case): a tap can find
// its button and still land somewhere else.
// ⚠ A step that finds nothing, an EXPECT that is not on the screen, a field to type into that is not there, or
// a scroll asked of a screen that does not scroll ends the run with exit 1 before a frame is saved: the app's labels change, and a recording of the
// wrong screen is still a folder of good pictures that nothing downstream can tell from the right one.
const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const [name, stepStr, framesStr, distStr, holdStr] = process.argv.slice(2);
  const steps = (stepStr || '').split('|').filter(Boolean), N = Number(framesStr || 118), DIST = Number(distStr || 500), HOLD = Number(holdStr || 16);
  const dir = path.join(__dirname, 'work', 'seq', name);
  const b = await chromium.launch();
  const fail = async (why) => { console.error(`${name}: not recorded, ${why}`); await b.close(); process.exit(1); };
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  await p.goto(process.env.APP || 'http://127.0.0.1:5199/', { waitUntil: 'load' });
  await p.waitForTimeout(6000);
  for (const raw of steps) {
    if (raw.startsWith('wait:')) { await p.waitForTimeout(Number(raw.slice(5))); continue; }
    const optional = raw.startsWith('?'), s = optional ? raw.slice(1) : raw;
    let found;
    if (s.startsWith('css:')) {
      const el = await p.$(s.slice(4));
      found = !!el;
      if (el) await el.evaluate((n) => { n.scrollIntoView({ block: 'center', inline: 'center' }); n.click(); });
    } else {
      found = await p.evaluate((s) => { const els = [...document.querySelectorAll('button, a, [role=button], [role=tab]')].filter((e) => e.offsetParent !== null); const el = els.find((e) => ((e.getAttribute('aria-label') || e.innerText || '').trim().replace(/\s+/g, ' ')).startsWith(s)); if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return true; } return false; }, s);
    }
    if (!found && !optional) await fail(`the step "${s}" found nothing on the screen`);
    if (!found) console.log(name, 'optional step not there:', s);
    await p.waitForTimeout(2200);
  }
  const EXPECT = process.env.EXPECT || '';
  if (EXPECT && !(await p.evaluate((want) => document.body.innerText.toLowerCase().includes(want.toLowerCase()), EXPECT))) await fail(`"${EXPECT}" is not on the screen the steps reached`);
  // the screen's own scroller: the tallest visible .bs-scroll that can scroll
  const max = await p.evaluate(() => { const c = [...document.querySelectorAll('.bs-scroll')].filter((n) => n.offsetParent !== null && n.scrollHeight > n.clientHeight + 4).sort((a, b) => b.clientHeight - a.clientHeight)[0]; if (!c) return -1; c.scrollTop = 0; window.__sc = c; return c.scrollHeight - c.clientHeight; });
  const TYPE = process.env.TYPE || '';
  if (TYPE) {
    const f = process.env.TYPE_INTO ? await p.$(process.env.TYPE_INTO) : null;
    if (!f) await fail(`the field to type into (TYPE_INTO=${process.env.TYPE_INTO || ''}) is not on the screen`);
    await f.focus();
  } else if (DIST > 0 && max <= 0) await fail(`asked to scroll ${DIST} px, and this screen does not scroll`);
  const dist = Math.max(0, Math.min(DIST, max));
  console.log(name, 'scroll room', max, 'using', dist);
  fs.mkdirSync(dir, { recursive: true });
  await p.waitForTimeout(700);
  const ease = (k) => (k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2);
  let typed = 0;
  for (let i = 0; i < N; i++) {
    const k = Math.max(0, Math.min(1, (i - HOLD) / (N - HOLD - 14)));
    if (TYPE) { const want = Math.max(0, Math.min(TYPE.length, Math.floor((i - HOLD) / 2))); while (typed < want) { await p.keyboard.type(TYPE[typed]); typed++; } }
    else if (max > 0) await p.evaluate((y) => { window.__sc.scrollTop = y; }, Math.round(ease(k) * dist));
    await p.waitForTimeout(30);
    await p.screenshot({ path: path.join(dir, `f${String(i).padStart(3, '0')}.jpg`), type: 'jpeg', quality: 92 });
  }
  await b.close();
  console.log(name, 'done', N);
})().catch((e) => { console.error(e); process.exit(1); });
