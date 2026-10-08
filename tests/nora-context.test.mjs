// Where the person is when they ask Nora (the Ask Nora plan, step 4): what each surface
// sends, and what the server's cleaner keeps. The route's checks (an id named only after
// the roster or the caller's own client confirms it) are in support-chat-route.test.mjs.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeContext, cleanLabel, validZone, localClock, dayIn, formatContextNote } from '../src/lib/ai/noraContext.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const between = (src, a, b) => src.slice(src.indexOf(a), src.indexOf(b, src.indexOf(a)));
const ID = '11111111-2222-4333-8444-555555555555';

test('labels: titles pass, markup and long text do not', () => {
  for (const ok of ['Pricing', 'Trainer · Schedule', 'Client', 'Übersicht', 'Ma semaine', 'Shape Radio', "Priya's plan — week 2"]) assert.equal(cleanLabel(ok), ok, ok);
  for (const bad of ['<script>', 'a\nb'.replace('\n', '{'), 'x'.repeat(61), '', null, 42, '"quoted"']) assert.equal(cleanLabel(bad), null, String(bad));
  assert.equal(cleanLabel('  Trainer   ·  Schedule '), 'Trainer · Schedule', 'whitespace is folded');
});

test('the claim is reduced to known shapes', () => {
  const c = normalizeContext({ page: 'Eat', timezone: 'Asia/Kolkata', clientId: ID.toUpperCase(), sessionId: 'demo-s-1', item: { kind: 'meal', title: 'Chicken grain bowl' }, extra: 'dropped' });
  assert.deepEqual(c, { page: 'Eat', timezone: 'Asia/Kolkata', clientId: ID, sessionId: null, item: { kind: 'meal', title: 'Chicken grain bowl' } });
  assert.deepEqual(normalizeContext({ item: { kind: 'payment', title: 'Card' } }).item, null, 'an unknown kind is dropped');
  assert.deepEqual(normalizeContext('nonsense'), { page: null, timezone: null, clientId: null, sessionId: null, item: null });
  assert.equal(validZone('Mars/Base'), null);
  assert.equal(validZone('UTC'), 'UTC');
});

test('the clock is the zone\'s: day, weekday and time', () => {
  const at = new Date('2026-10-09T02:30:00Z');
  assert.deepEqual(localClock(at, 'America/Los_Angeles'), { zone: 'America/Los_Angeles', day: '2026-10-08', weekday: 'Thursday', time: '7:30 PM' });
  assert.equal(dayIn(at, 'Asia/Tokyo'), '2026-10-09');
  assert.equal(dayIn(at, 'bad zone'), '2026-10-09', 'a bad zone is UTC');
});

test('the note: checked facts are system; the page\'s own labels are data, and absent when there are none', () => {
  const n = formatContextNote({ surface: 'app', page: 'Eat', now: new Date('2026-10-08T12:00:00Z'), zone: 'UTC', item: { kind: 'meal', title: 'Oats' } });
  assert.doesNotMatch(n.system, /Eat|Oats/);
  assert.equal(n.data, '[Screen labels] Page: "Eat" · Open meal: "Oats" ("this meal" means it)');
  const bare = formatContextNote({ surface: 'web', now: new Date(), zone: 'UTC' });
  assert.equal(bare.data, null);
  assert.doesNotMatch(bare.system, /next message/, 'no promise of a labels message that does not come');
  const coach = formatContextNote({ surface: 'web', now: new Date(), zone: 'UTC', session: { id: ID, at: '2026-10-09T22:00:00Z', status: 'confirmed', who: 'Priya' }, coachTools: true });
  assert.match(coach.system, /reschedule_session/);
  assert.doesNotMatch(formatContextNote({ surface: 'web', now: new Date(), zone: 'UTC', session: { id: ID, at: '2026-10-09T22:00:00Z' } }).system, /reschedule_session/, 'only a coach is pointed at the tool');
});

// ── The website ──────────────────────────────────────────────────────────────────
const GCB = read('public/newdesign/globalChatButton.js');
function gcbContext(location, title) {
  const win = {};
  const src = between(GCB, '  var noraOpen = {};', '  window.__shapeNoraSolve = function () {');
  new Function('window', 'location', 'document', src)(win, location, { title });
  return win;
}

test('website: the page names itself, and a page sets and clears what it has open', () => {
  const w = gcbContext({ pathname: '/newdesign/TrainerApp.html', hash: '#schedule' }, 'Shape · Trainer');
  assert.equal(w.__shapeNoraContext().page, 'Trainer · Schedule');
  assert.equal(gcbContext({ pathname: '/', hash: '' }, 'Shape — Real coaches').__shapeNoraContext().page, 'Home');
  const close = w.shapeNoraOpen({ clientId: ID, sessionId: null });
  assert.equal(w.__shapeNoraContext().clientId, ID);
  assert.ok(!('sessionId' in w.__shapeNoraContext()), 'a null part is not set');
  const other = w.shapeNoraOpen({ clientId: 'other' });
  close();
  assert.equal(w.__shapeNoraContext().clientId, 'other', 'closing one view never clears what another opened since');
  other();
  assert.ok(!('clientId' in w.__shapeNoraContext()));
  const off = w.__shapeNoraContext(false);
  assert.deepEqual(Object.keys(off), ['timezone'], 'with the chip taken off, only the zone goes');
});

test('website: both panels send it, and the chip takes it off', () => {
  assert.match(GCB, /var body = \{ messages: history, surface: "web", confirmCards: false, context: window\.__shapeNoraContext\(\) \};/);
  const W = read('public/newdesign/chatWidget.jsx');
  assert.match(W, /surface: "web", locale: cwLocale\(\), context: cwNoraContext\(\), \.\.\.extra/);
  assert.match(W, /window\.__shapeNoraContext\(!noraScreenOffRef\.current\)/);
  assert.match(W, /onClick=\{\(\) => setNoraScreenOff\(true\)\} aria-label="Don't tell Nora which page you're on"/);
  // What pages have open: the client file, the Schedule's booking, a recipe.
  assert.match(read('public/newdesign/coachClientDetail.jsx'), /window\.shapeNoraOpen\(\{ clientId \}\)/);
  assert.match(read('public/newdesign/dashSchedule.jsx'), /window\.shapeNoraOpen\(\{ sessionId: noraSession, \.\.\.\(noraClient \? \{ clientId: noraClient \} : \{\}\) \}\)/);
  assert.match(read('public/newdesign/recipeDetailPage.jsx'), /window\.shapeNoraOpen\(\{ item: \{ kind: "recipe", title: recipe\.title \} \}\)/);
});

// ── The app ──────────────────────────────────────────────────────────────────────
const APP = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const PROS = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');

test('app: the store sets, clears and builds the context the same way', () => {
  const src = between(APP, 'const _bsNoraOpen = {};', 'let _bsNoraThread = null;');
  const api = new Function(`${src}; return { bsNoraOpen, bsNoraContext, bsNoraPage };`)();
  const close = api.bsNoraOpen({ page: 'Eat', label: 'Essen', clientId: null });
  api.bsNoraOpen({ item: { kind: 'meal', title: 'Oats' } });
  const c = api.bsNoraContext();
  assert.equal(c.page, 'Eat');
  assert.deepEqual(c.item, { kind: 'meal', title: 'Oats' });
  assert.ok(!('label' in c), 'the translated label is for the chip, never sent');
  assert.deepEqual(Object.keys(api.bsNoraContext(false)), ['timezone']);
  close();
  assert.ok(!('page' in api.bsNoraContext()));
  assert.equal(api.bsNoraPage('programs'), 'Plans');
  assert.equal(api.bsNoraPage('cycle-log'), 'Cycle log');
});

test('app: the sheet sends it through the backend; shells, the client profile, a meal and a recipe name themselves', () => {
  const be = read('mobile-app/src/services/shapeBackend.js');
  assert.match(between(be, 'async function askSupportBot(', '\n}\n'), /if \(extra\.context && typeof extra\.context === 'object'\) body\.context = extra\.context;/);
  const sheet = between(APP, 'function BSNoraSheet(', '// Chat tab for ALL roles');
  assert.match(sheet, /context: bsNoraContext\(!screenOffRef\.current\)/);
  assert.match(sheet, /onClick=\{\(\) => setScreenOff\(true\)\} aria-label=\{tr\('feed:support\.screenOff'/);
  assert.match(APP, /React\.useEffect\(\(\) => bsNoraOpen\(\{ page: bsNoraPage\(tab\), label: noraTabLabel \}\), \[tab, noraTabLabel\]\);/);
  assert.equal((PROS.match(/window\.bsNoraOpen\(\{ page: window\.bsNoraPage\(tab\), label: noraTabLabel \}\)/g) || []).length, 2, 'trainer and nutritionist');
  assert.match(between(PROS, 'function BSProClientFullProfilePage(', '\n}\n'), /window\.bsNoraOpen\(\{ clientId: clientUid \}\)/);
  assert.match(between(APP, 'function BSMealPreview(', '\n}\n'), /bsNoraOpen\(\{ item: \{ kind: 'meal', title: meal\.title \} \}\)/);
  assert.match(between(APP, 'function BSRecipePreview(', '\n}\n'), /bsNoraOpen\(\{ item: \{ kind: 'recipe', title: r\.title \} \}\)/);
});
