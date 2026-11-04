// The coach's view of a client's live workout, as the owner picked it (2026-11-04: "use option B for coaches
// view, but use this section from C in bottom part"). B's top: the monogram head and the glass elapsed pill, the
// move on a raised card (its set lights, the latest set as a pair board, the workout's progress), the recorded
// sets as glass rows with the set in progress outlined. C's foot: Send a cue (the quick cues two by two, the
// composer, the focus note) in the coach's colour, the Queue as lit rows in teal, Stop watching.
// Mounted with real React in jsdom, on a stubbed live payload and on the demo. The behaviours under it (the
// watch subscription, the auth and generation guards, the cue's states) are pinned in live-watch-mounted.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join, basename } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
const require = createRequire(import.meta.url);
const { JSDOM } = require('jsdom');
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' });
globalThis.window = dom.window; globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// The page builds its event as the browser's CustomEvent; Node has its own, which jsdom's window refuses.
globalThis.CustomEvent = window.CustomEvent;
const React = require('react');
const { createRoot } = require('react-dom/client');
const SRC = fileURLToPath(new URL('../mobile-app/src/broadsheet/BSLiveWorkoutWatch.jsx', import.meta.url));
const SOURCE = readFileSync(SRC, 'utf8');
const { default: Watch } = await loadRealModule(SRC, { registry: new Map([['react', React]]) });

const PAPERS = {
  dark: { isLight: false, INK: '#f5f0e6', INK70: 'rgba(245,240,230,0.7)', INK50: 'rgba(245,240,230,0.5)', HAIR: 'rgba(245,240,230,0.1)', RULE: 'rgba(245,240,230,0.2)', PAPER: '#0f0e0c', PAPER2: '#181612', DISPLAY: 'Saira', MONO: 'monospace', padX: 18 },
  light: { isLight: true, INK: '#0f0e0c', INK70: 'rgba(15,14,12,0.7)', INK50: 'rgba(15,14,12,0.5)', HAIR: 'rgba(15,14,12,0.1)', RULE: 'rgba(15,14,12,0.2)', PAPER: '#f5f0e6', PAPER2: '#ede6d6', DISPLAY: 'Saira', MONO: 'monospace', padX: 18 },
};
const tr = (_key, opts) => String(opts.defaultValue).replace(/\{(\w+)\}/g, (_, k) => opts[k] ?? k);
const done = (load, reps, rpe) => ({ done: true, load, reps, rpe });
const open = () => ({ done: false, load: '', reps: '', rpe: '' });
// A live coach payload: the squat finished, the deadlift in hand with its third set logged before its second.
const payload = () => ({ v: 1, title: 'Lower — Strength', loadUnit: 'kg', curIdx: 1, resting: true, setsTotal: 10, setsDone: 6, exercises: [
  { n: 'Back squat', total: 4, done: 4, sets: [done('100', '5', '7'), done('105', '5', '8'), done('105', '5', '8.5'), done('105', '4', '9')] },
  { n: 'Romanian deadlift', total: 3, done: 2, sets: [done('80', '10', '7.5'), open(), done('85', '8', '8')] },
  { n: 'Walking lunge', total: 3, done: 0, sets: [open(), open(), open()] },
] });
const snapshot = () => ({ status: 'live', lastSyncedAt: Date.now(), publicRow: null, coachRow: {
  expires_at: new Date(Date.now() + 60000).toISOString(), started_at: new Date(Date.now() - 1312000).toISOString(), payload: payload() } });

let root, props, sends, backs;
async function mount(options = {}, paper = 'dark') {
  sends = []; backs = 0;
  window.ShapeAuth = { getCachedState: () => ({ user: { id: 'coach-a' } }), client: { auth: { onAuthStateChange() { return { data: { subscription: { unsubscribe() {} } } }; } } } };
  window.ShapeLiveProgress = { watch(id, cb) { cb(snapshot()); return () => {}; } };
  window.ShapeCoachFeed = { async sendCue(args) { sends.push(args); return { ok: true }; } };
  // The chrome's shared Back row (its geometry and 44px are pinned in back-placement): a stand-in that draws ← and the trailing.
  window.BSBackRow = ({ onBack, trailing }) => React.createElement('div', { 'data-bs-back-row': '' },
    React.createElement('button', { type: 'button', 'data-bs-back': '', onClick: onBack, style: { minHeight: 44 } }, 'Back'), trailing);
  props = { client: 'Test client', clientId: 'client-a', t: PAPERS[paper], tr, onBack: () => { backs++; }, ...options };
  root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Watch, props)));
}
async function unmount() { if (!root) return; const r = root; root = null; await React.act(async () => r.unmount()); delete window.BSBackRow; }
// A failed assertion still unmounts: the page's one-second clock would otherwise hold the run open.
test.afterEach(unmount);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const button = (label) => $$('button').find((b) => b.textContent === label);
const heading = (label) => $$('h2').find((h) => h.textContent === label);
// An element's words, a space between elements (textContent runs them together); React's adjacent text nodes
// ("2", "/", "3") stay one word.
const text = (el) => {
  const w = document.createTreeWalker(el, 4); let out = '';
  while (w.nextNode()) { const n = w.currentNode; out += (n.previousSibling?.nodeType === 3 ? '' : ' ') + n.nodeValue; }
  return out.replace(/\s+/g, ' ').trim();
};
async function type(value) {
  await React.act(async () => {
    const el = $('input');
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, value);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
}
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255})`; };
const isColor = (value, hex) => value === hex || value === rgb(hex);

test('the head: the monogram, the workout and the elapsed clock on glass', async () => {
  await mount();
  assert.equal($('h1').textContent, 'Test client');
  assert.match(document.body.textContent, /Workout monitor/);
  assert.match(document.body.textContent, /Lower — Strength/);
  const monogram = $$('span[aria-hidden]').find((s) => s.textContent === 'TC');
  assert.ok(monogram, 'the client\'s initials');
  assert.match(text($('[data-lw-elapsed]')), /^Elapsed 21:5[1-3]$/, 'the elapsed clock from the row\'s start');
  assert.match(document.body.textContent, /Last checked/);
  await unmount();
});

test('the hero card reads the live payload: the move, its set lights, the latest set as a pair board, the progress', async () => {
  await mount();
  const hero = $('[data-lw-hero]');
  assert.ok(hero, 'the raised card');
  assert.match(text(hero), /^Exercise 2 of 3 Resting Romanian deadlift/);
  assert.equal(hero.querySelector('h2').textContent, 'Romanian deadlift');
  // Each light is its set's own done flag (set 3 logged before set 2), the first open one is the set in progress.
  assert.deepEqual([...hero.querySelectorAll('[data-lw-light]')].map((l) => l.dataset.lwLight), ['done', 'now', 'done']);
  assert.match(text(hero), /2\/3/);
  assert.match(text(hero), /Set 03 ✓/, 'the latest set is the last one logged');
  const pair = Object.fromEntries([...hero.querySelectorAll('[data-lw-pair]')].map((p) => [p.dataset.lwPair, text(p)]));
  assert.deepEqual(pair, { load: 'Weight (kg) 85', reps: 'Reps 8', rpe: 'RPE 8' });
  const bar = hero.querySelector('[role="progressbar"]');
  assert.equal(bar.getAttribute('aria-valuenow'), '6');
  assert.equal(bar.getAttribute('aria-valuemax'), '10');
  assert.match(text(hero), /Sets 6\/10 60%$/);
  await unmount();
});

test('the hero card reads the demo: Barbell row, two of four sets, Sets 6/20 · 30%', async () => {
  await mount({ clientId: null, client: 'Alex Rivera', workout: 'Upper Pull — Peak' });
  assert.match(text($('[data-lw-elapsed]')), /^Elapsed 30:5[4-6]$/);
  assert.match(document.body.textContent, /Upper Pull — Peak/);
  const hero = $('[data-lw-hero]');
  assert.match(text(hero), /^Exercise 2 of 6 Barbell row/);
  assert.doesNotMatch(text(hero), /Resting|Working/, 'the demo has no live state to report');
  assert.deepEqual([...hero.querySelectorAll('[data-lw-light]')].map((l) => l.dataset.lwLight), ['done', 'done', 'now', 'open']);
  assert.match(text(hero), /Set 02 ✓/);
  const pair = Object.fromEntries([...hero.querySelectorAll('[data-lw-pair]')].map((p) => [p.dataset.lwPair, text(p)]));
  assert.deepEqual(pair, { load: 'Weight (lb) 155', reps: 'Reps 8', rpe: 'RPE 8.0' });
  assert.match(text(hero), /Sets 6\/20 30%$/);
  assert.equal($('[role="status"]').textContent, 'Preview');
  await unmount();
});

test('the recorded sets are glass rows, read only, the set in progress outlined', async () => {
  await mount();
  const table = $('[role="table"]');
  assert.equal(document.getElementById(table.getAttribute('aria-labelledby')).textContent, 'Client’s recorded sets · read only');
  assert.deepEqual([...table.querySelectorAll('[role="columnheader"]')].map((c) => c.textContent), ['Set', 'Weight (kg)', 'Reps', 'RPE']);
  const rows = [...table.querySelectorAll('[role="row"][data-completed]')];
  assert.deepEqual(rows.map((r) => r.dataset.completed), ['true', 'false', 'true']);
  assert.deepEqual(rows.map((r) => r.getAttribute('aria-current')), [null, 'step', null], 'the first open set is the one in progress');
  assert.equal(text(rows[0]), '01 ✓ 80 10 7.5');
  assert.equal(text(rows[1]), '02 — — —');
  assert.match(rows[1].style.border, /1px solid/, 'the set in progress is outlined');
  assert.equal(table.querySelectorAll('button, input, textarea, select').length, 0, 'read only');
  await unmount();

  await mount({ clientId: null });
  const demo = [...document.querySelectorAll('[role="table"] [role="row"][data-completed]')];
  assert.deepEqual(demo.map((r) => r.dataset.completed), ['true', 'true', 'false', 'false']);
  assert.deepEqual(demo.map((r) => r.getAttribute('aria-current')), [null, null, 'step', null]);
  await unmount();
});

test('a quick cue sends: the four as a 2×2 grid, the cue reaches the backend, Sent to reads back', async () => {
  await mount();
  const cue = $('[data-lw-cue]');
  const grid = cue.querySelector('div');
  assert.equal(grid.style.gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.deepEqual([...grid.querySelectorAll('button')].map((b) => b.textContent), ['Slow the eccentric', 'Hold this weight', 'One more set', 'Lengthen your rest']);
  assert.match(text(cue), /Your latest cue also updates your coaching focus note\.$/);
  await React.act(async () => button('One more set').click());
  assert.deepEqual(sends, [{ clientId: 'client-a', text: 'One more set', role: 'trainer' }]);
  assert.match(text(cue), /Sent to Test client: “One more set”/);
  await unmount();
});

test('a typed cue: Send waits for words, then sends them and clears the field', async () => {
  await mount({ role: 'nutritionist' });
  const send = button('Send');
  assert.equal($('input').placeholder, 'Type a quick cue…');
  assert.equal(send.disabled, true, 'nothing typed, nothing to send');
  await type('   ');
  assert.equal(button('Send').disabled, true, 'blank space is not a cue');
  await type('Drive through the heels');
  assert.equal(button('Send').disabled, false);
  assert.match($('input').style.border, /1px solid/, 'the field lights once there are words');
  await React.act(async () => button('Send').click());
  assert.deepEqual(sends, [{ clientId: 'client-a', text: 'Drive through the heels', role: 'nutritionist' }]);
  assert.equal($('input').value, '');
  assert.match(document.body.textContent, /Sent to Test client: “Drive through the heels”/);
  await unmount();
});

test('Send a cue in the coach\'s colour, the Queue in teal, on both papers', async () => {
  const want = {
    dark: { trainer: '#e0654b', nutritionist: '#d8b25a', queue: '#34d6c5' },
    light: { trainer: '#c0533b', nutritionist: '#a07a2e', queue: '#07706a' },
  };
  for (const paper of ['dark', 'light']) for (const role of ['trainer', 'nutritionist']) {
    await mount({ role }, paper);
    assert.ok(isColor(heading('Send a cue').style.color, want[paper][role]), `${paper} ${role}: Send a cue reads ${heading('Send a cue').style.color}`);
    assert.ok(isColor(heading('Queue').style.color, want[paper].queue), `${paper}: Queue reads ${heading('Queue').style.color}`);
    await unmount();
  }
});

test('the queue: lit rows led by their number slot, NOW on the move in hand, ✓ on a finished one', async () => {
  await mount();
  const items = $$('[role="list"] [role="listitem"]');
  assert.deepEqual(items.map((r) => r.querySelector('[data-lw-slot]').textContent), ['02', '03', '✓']);
  assert.deepEqual(items.map((r) => text(r)), ['02 Romanian deadlift NOW 2/3', '03 Walking lunge 0/3', '✓ Back squat 4/4']);
  assert.deepEqual(items.map((r) => r.getAttribute('aria-current')), ['step', null, null]);
  assert.match(items[0].style.border, /1px solid/, 'the move in hand is framed');
  assert.equal(items.filter((r) => /NOW/.test(r.textContent)).length, 1);
  assert.equal(items[0].querySelectorAll('span[aria-hidden] > span').length, 3, 'a tick per planned set');
  await unmount();

  await mount({ clientId: null });
  const demo = $$('[role="list"] [role="listitem"]');
  assert.equal(demo.length, 6);
  assert.match(text(demo[0]), /^02 Barbell row NOW 2\/4$/);
  assert.match(text(demo.at(-1)), /^✓ Pull-up 4\/4$/);
  await unmount();
});

test('no active workout shared: the empty card, no hero, no sets, no queue, the cue held', async () => {
  await mount();
  window.ShapeLiveProgress.watch = (id, cb) => { cb({ status: 'idle', publicRow: null, coachRow: null }); return () => {}; };
  await React.act(async () => root.render(React.createElement(Watch, { ...props, clientId: 'client-b' })));
  assert.equal($$('[role="status"]').filter((s) => s.textContent === 'No active workout shared').length, 2, 'the Back row\'s pill and the empty card');
  assert.equal($('[data-lw-hero]'), null);
  assert.equal($('[role="table"]'), null);
  assert.equal(heading('Queue'), undefined);
  assert.equal(text($('[data-lw-elapsed]')), 'Elapsed —');
  assert.equal(button('Slow the eccentric').disabled, true);
  assert.equal($('input').disabled, true);
  await unmount();
});

// The private thread the discussion's Message opens, as the app's db answers it.
function stubDb(role) {
  const db = window.ShapeAuth.client;
  db.auth.getUser = async () => ({ data: { user: { id: 'coach-a' } } });
  db.from = (table) => {
    const q = { select() { return q; }, eq() { return q; }, in() { return q; }, order() { return q; }, limit() { return q; },
      maybeSingle: async () => ({ data: { id: table === 'conversations' ? role + '-private-thread' : 'provider' } }),
      then(resolve, reject) { return Promise.resolve({ data: [{ id: 'provider' }] }).then(resolve, reject); } };
    return q;
  };
}

test('Message calls onMessage with the conversation id', async () => {
  const opened = [];
  await mount({ onMessage: (id) => opened.push(id) });
  stubDb('trainer');
  await React.act(async () => button('Message client').click());
  assert.deepEqual(opened, ['trainer-private-thread']);
  assert.equal(backs, 0, 'the host closes the watch itself');
  await unmount();
});

test('with no onMessage, Message closes the watch and asks the coach app for that client\'s thread', async () => {
  await mount({ role: 'nutritionist' });
  stubDb('nutritionist');
  const events = [];
  const listen = (e) => events.push(e.detail);
  window.addEventListener('shape:proMessageClient', listen);
  await React.act(async () => button('Message client').click());
  window.removeEventListener('shape:proMessageClient', listen);
  assert.equal(backs, 1);
  assert.deepEqual(events, [{ client: { userId: 'client-a', n: 'Test client' }, conversationId: 'nutritionist-private-thread' }]);
  assert.match(SOURCE, /onOpenChat=\{conversationId=>\{if\(onMessage\)onMessage\(conversationId\);else \{onBack\(\);window\.dispatchEvent\(new CustomEvent\('shape:proMessageClient',\{detail:\{client:\{userId:clientId,n:client\},conversationId\}\}\)\);\}\}\}/,
    'the Message handler, byte for byte');
  await unmount();
});

test('every target is at least 44px, Back is the shared row and Stop watching is one button', async () => {
  for (const options of [{}, { clientId: null }]) {
    await mount(options);
    const targets = $$('button, input, textarea, select, a[href], [role="button"]').filter((el) => !el.closest('[data-bs-back-row]'));
    assert.ok(targets.length >= (options.clientId === null ? 7 : 9), `saw only ${targets.length} targets`);
    for (const el of targets) {
      const h = parseFloat(el.style.minHeight || el.style.height);
      assert.ok(h >= 44, `${el.tagName} "${el.textContent || el.getAttribute('aria-label')}" is ${h || 'unset'}px tall`);
    }
    assert.ok(parseFloat(button('Send').style.minWidth) >= 44);
    const stops = $$('button').filter((b) => b.textContent === 'Stop watching');
    assert.equal(stops.length, 1);
    assert.equal($$('[data-bs-back]').filter((b) => !b.closest('[data-bs-back-row]')).length, 1, 'Stop watching is the only Back the page draws');
    await React.act(async () => stops[0].click());
    await React.act(async () => $('[data-bs-back-row] button').click());
    assert.equal(backs, 2, 'Stop watching and ← both go back');
    assert.match(text($('[data-bs-back-row]')), /Back (Live|Preview)$/, 'the live status rides on the Back row');
    await unmount();
  }
});

test('the timer ticks every second: no SVG filter, and the lamp pulses on opacity, still under reduced motion', async () => {
  assert.doesNotMatch(SOURCE, /<filter|<fe[A-Z]|url\(#|\bfilter\s*:|backdropFilter|WebkitBackdropFilter/);
  const keyframes = SOURCE.match(/@keyframes bsLwPulse\{([^']*?\})\}/);
  assert.ok(keyframes, 'the lamp\'s keyframes');
  assert.deepEqual([...keyframes[1].matchAll(/\{([^}]*)\}/g)].map((m) => m[1].split(':')[0]), ['opacity', 'opacity'], 'opacity alone');
  await mount();
  const css = $('style').textContent;
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)\{\[data-lw-lamp\]\{animation:none!important\}\}/);
  assert.match($('[data-lw-lamp]').style.animation, /bsLwPulse/);
  await unmount();
});

test('the page is its own module: window globals at call time, no import back into the coach app or the client', () => {
  const BACK = /^iosAppBroadsheet(Pros|Client|Main)?\.jsx$/;
  const seen = new Set();
  const walk = (file) => {
    if (seen.has(file)) return;
    seen.add(file);
    const src = readFileSync(file, 'utf8');
    for (const [, spec] of src.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)) {
      if (!spec.startsWith('.')) continue;
      const next = join(dirname(file), spec);
      assert.doesNotMatch(basename(next), BACK, `${basename(file)} imports ${spec}`);
      walk(next);
    }
  };
  walk(SRC);
  assert.ok(seen.size >= 5, 'the walk saw the helpers');
  const body = SOURCE.slice(SOURCE.indexOf('export default function BSLiveWorkoutWatch('));
  const head = SOURCE.slice(0, SOURCE.indexOf('export default function BSLiveWorkoutWatch('));
  for (const name of ['BSPage', 'BSBackRow', 'ShapeLiveProgress', 'ShapeCoachFeed', 'ShapeAuth']) {
    assert.ok(body.includes(`window.${name}`), `reads window.${name} in the component`);
    assert.ok(!head.includes(`window.${name}`), `window.${name} read at module scope`);
  }
  assert.doesNotMatch(SOURCE, /__liveWatchLook/, 'the options switch is gone');
  assert.doesNotMatch(SOURCE, /<table|<tbody/, 'today\'s table is gone');
});
