// Train's full plan (BSTrainPlan.jsx; owner, 2026-11-10: "the full plan and on deck just brings you to the
// monthly calendar page … a pop up of the actual full plan should pop up with a better display showing the
// actual plan"), MOUNTED in jsdom with the shipping module and real React and react-dom: the sheet lands on
// the phone surface; every day of the week in full, today framed; the moves as the page hands them (swaps
// applied); a rest day and its playlist; who wrote each day; the day strip; Close, the scrim, Escape and
// Month view; no button in a button; every target 44px. And the matcher Playlists words
// (bsTrainPlaylists.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><head></head><body><div id="bs-phone-surface"></div></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOM = require_('react-dom');
const ReactDOMClient = require_('react-dom/client');

const cats = Object.fromEntries(['session', 'home', 'common'].map((ns) => [ns, JSON.parse(readFileSync(join(ROOT, `mobile-app/src/i18n/catalogs/en/${ns}.json`), 'utf8'))]));
W.ShapeI18n = {
  t: (key, opts = {}) => { const [ns, k] = key.split(':'); const msg = cats[ns] ? cats[ns][k] : undefined; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
const THEME = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', HEAD: 'head', PAPER: '#141210', INK: '#f2ede4', INK70: 'rgba(242,237,228,0.7)', INK50: 'rgba(242,237,228,0.5)', HAIR: 'rgba(242,237,228,0.1)', RULE: 'rgba(242,237,228,0.2)', ACCENT: '#34d6c5', padX: 22, isLight: false, RUST: '#c0533b', GREEN: '#4fae5a' };
W.useBS = () => THEME;

const P = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainPlan.jsx'), { registry: new Map([['react', React], ['react-dom', ReactDOM]]) });
const { bsTrainPlaylistCards, bsPlaylistUses, bsPlaylistKey } = await import(pathToFileURL(join(ROOT, 'mobile-app/src/broadsheet/bsTrainPlaylists.mjs')).href);

const TODAY = (new Date().getDay() + 6) % 7;
const moves = [
  { n: '01', m: 'Pull-up', s: '4 × 6-8 · 3 min rest', l: '42 lb', cue: 'Dead hang.' },
  { n: '02', m: 'Barbell row', s: '4 × 8 · 2 min rest', l: '155 lb' },
];
const session = (title, extra = {}) => ({ d: 'x', tag: 'FEATURE', title, headline: title, meta: '52 min · RPE 8', timeLabel: '8:00 AM', copy: `${title} brief.`, moves, ...extra });
function week() {
  const w = Array.from({ length: 7 }, (_, i) => session(`Session ${i}`));
  w[TODAY] = session('Upper Pull — Peak', { playlist: { name: 'Pull day tempo', meta: '14 tracks' }, coach: 'Sam Ortiz' });
  w[(TODAY + 3) % 7] = { d: 'x', tag: 'REST', title: 'Rest\nday.', headline: 'Coach-set rest.', meta: 'No session · 0 min', copy: 'Your coach scheduled recovery today.', moves: [], coachAdjust: true, playlist: { name: 'Sunday stretch' } };
  w[(TODAY + 5) % 7] = session('Your own day', { selfAuthored: true, program: { name: 'Hypertrophy block', week: 2 } });
  return w;
}

async function mount(props) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const calls = { close: 0, month: 0 };
  await React.act(async () => {
    root.render(React.createElement(P.BSTrainPlanSheet, { program: week(), focusIdx: TODAY, weekLabel: 'Build · Week 32', coach: 'Jordan Chen', onClose: () => { calls.close += 1; }, onMonth: () => { calls.month += 1; }, ...props }));
  });
  const surface = document.getElementById('bs-phone-surface');
  const q = (sel) => surface.querySelector(sel);
  const qa = (sel) => [...surface.querySelectorAll(sel)];
  const click = (el) => React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); });
  return { calls, q, qa, click, surface, close: () => React.act(async () => { root.unmount(); host.remove(); }) };
}

test('the sheet lands on the phone surface as a dialog: the phase and week, Full plan, and the whole week in order', async () => {
  const m = await mount();
  try {
    const dlg = m.q('[data-train-plan]');
    assert.ok(dlg && dlg.closest('#bs-phone-surface'), 'not on the phone surface');
    assert.equal(dlg.getAttribute('role'), 'dialog');
    assert.equal(dlg.getAttribute('aria-modal'), 'true');
    assert.equal(dlg.getAttribute('aria-label'), 'Full plan');
    assert.match(dlg.textContent, /Build · Week 32/);
    assert.ok(dlg.closest('[data-bs-clean]'), 'it keeps the clean type out of the clean area');
    assert.deepEqual(m.qa('[data-train-plan-day]').map((s) => s.getAttribute('data-train-plan-day')), ['0', '1', '2', '3', '4', '5', '6']);
    assert.ok(document.activeElement === dlg, 'focus moves into the sheet');
  } finally { await m.close(); }
});

test('a session in full: when, its time, length and effort, who wrote it, the brief, the playlist and every move with its cue', async () => {
  const m = await mount();
  try {
    const today = m.q(`[data-train-plan-day="${TODAY}"]`);
    assert.match(today.textContent, /Today/);
    assert.match(today.style.borderLeft, /3px solid/, 'today is framed');
    for (const s of ['Upper Pull — Peak', '8:00 AM', '52 min · RPE 8', 'Sam Ortiz · Coach · Trainer', 'Upper Pull — Peak brief.', 'Dead hang.']) assert.ok(today.textContent.includes(s), `missing ${s}`);
    assert.match(today.querySelector('[data-train-plan-playlist]').textContent, /♪ Pull day tempo · 14 tracks/);
    const rows = [...today.querySelectorAll('[data-train-plan-move]')];
    assert.equal(rows.length, 2);
    assert.match(rows[0].textContent, /^01Pull-upDead hang\.4 × 6-8 · 3m42 lb$/, 'N, move, cue, scheme (abbreviated as the page does), load');
    // A day that names no coach takes the plan's; a day the member wrote says so.
    assert.match(m.q(`[data-train-plan-day="${(TODAY + 1) % 7}"]`).textContent, /Jordan Chen · Coach · Trainer/);
    const own = m.q(`[data-train-plan-day="${(TODAY + 5) % 7}"]`);
    assert.match(own.textContent, /Hypertrophy block/);
    assert.doesNotMatch(own.textContent, /Jordan Chen/, 'a day the member wrote credited to the coach');
    if (TODAY < 6) assert.match(m.q(`[data-train-plan-day="${TODAY + 1}"]`).textContent, /Tomorrow/);
  } finally { await m.close(); }
});

test('a rest day: its own words, no moves, no playlist though a coach-set rest keeps one, and no coach', async () => {
  const m = await mount();
  try {
    const rest = m.q(`[data-train-plan-day="${(TODAY + 3) % 7}"]`);
    assert.match(rest.textContent, /Coach-set rest\./);
    assert.match(rest.textContent, /Your coach scheduled recovery today\./);
    assert.ok(!rest.querySelector('[data-train-plan-moves]') && !rest.querySelector('[data-train-plan-playlist]'));
    assert.doesNotMatch(rest.textContent, /Coach · Trainer|\n/);
    assert.equal(m.q(`[data-train-plan-jump="${(TODAY + 3) % 7}"]`).lastElementChild.style.background, 'transparent', 'no session dot on a rest day');
  } finally { await m.close(); }
});

test('the moves are the page\'s, with the member\'s swaps', async () => {
  const swapped = (i) => (i === TODAY ? [{ n: '01', m: 'Lat pulldown', s: '4 × 8-10 · 3:00', l: '120 lb' }] : week()[i].moves);
  const m = await mount({ movesOf: swapped });
  try {
    const today = m.q(`[data-train-plan-day="${TODAY}"]`);
    assert.match(today.textContent, /Lat pulldown/);
    assert.doesNotMatch(today.textContent, /Pull-up/);
  } finally { await m.close(); }
});

test('the strip opens on the day asked for and jumps between days; Close, the scrim, Escape and Month view', async () => {
  const at = (TODAY + 2) % 7;
  const m = await mount({ focusIdx: at });
  try {
    assert.equal(m.q(`[data-train-plan-jump="${at}"]`).getAttribute('aria-current'), 'true', 'it opens on the day asked for');
    const other = (TODAY + 4) % 7;
    await m.click(m.q(`[data-train-plan-jump="${other}"]`));
    assert.equal(m.q(`[data-train-plan-jump="${other}"]`).getAttribute('aria-current'), 'true');
    assert.equal(m.q(`[data-train-plan-jump="${at}"]`).getAttribute('aria-current'), null);
    await m.click(m.q('[data-train-plan-close]'));
    assert.equal(m.calls.close, 1);
    await m.click(m.q('[data-train-plan]'));
    assert.equal(m.calls.close, 1, 'a tap inside the sheet does not close it');
    await m.click(m.q('[data-train-plan-scrim]'));
    assert.equal(m.calls.close, 2);
    await React.act(async () => { document.dispatchEvent(new W.KeyboardEvent('keydown', { key: 'Escape' })); });
    assert.equal(m.calls.close, 3);
    await m.click(m.q('[data-train-plan-month]'));
    assert.equal(m.calls.month, 1);
  } finally { await m.close(); }
  const bare = await mount({ onMonth: null });
  try { assert.ok(!bare.q('[data-train-plan-month]'), 'no Month view without its door'); } finally { await bare.close(); }
});

test('no button inside a button, and every button a 44px target', async () => {
  const m = await mount();
  try {
    const buttons = m.qa('button');
    assert.ok(buttons.length >= 10);
    for (const b of buttons) {
      assert.ok(!b.parentElement.closest('button'), 'a button inside a button');
      const h = parseFloat(b.style.minHeight || b.style.height || '0');
      assert.ok(h >= 44, `${b.textContent || b.getAttribute('aria-label')} is ${h}px`);
    }
  } finally { await m.close(); }
});

test('the module stands alone: no import of the client, globals read at call time', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainPlan.jsx'), 'utf8');
  assert.doesNotMatch(src, /from '\.\/iosAppBroadsheetClient/);
  assert.doesNotMatch(src.split('export function')[0], /window\.useBS\(\)/, 'useBS read at module top');
});

// ── The matcher (bsTrainPlaylists.mjs) ──
test('a playlist matches its days by name, case and spacing aside; rest days play nothing; soonest first from today', () => {
  assert.equal(bsPlaylistKey('  Pull   DAY tempo '), 'pull day tempo');
  assert.equal(bsPlaylistKey(null), '');
  const w = week();
  w[(TODAY + 6) % 7] = session('Late pull', { playlist: { name: 'pull day TEMPO' } });
  const uses = bsPlaylistUses(w, TODAY);
  assert.deepEqual(uses.get('pull day tempo').days, [{ idx: TODAY, title: 'Upper Pull — Peak' }, { idx: (TODAY + 6) % 7, title: 'Late pull' }]);
  assert.ok(!uses.has('sunday stretch'), 'a coach-set rest keeps its playlist but plays nothing');
  assert.equal(uses.get('pull day tempo').coach, 'Sam Ortiz');
});

test('cards: the carried ones take their days, a day\'s own playlist gets a card, and this week\'s lead', () => {
  const w = week();
  w[(TODAY + 1) % 7] = session('Engine', { playlist: { name: 'Engine room', meta: '12 tracks' } });
  const cards = bsTrainPlaylistCards([{ title: 'Unused', k: 'a' }, { title: 'Pull Day Tempo', k: 'b', url: 'u' }], w, TODAY);
  assert.deepEqual(cards.map((c) => [c.title, c.uses.map((u) => u.idx), !!c.onlyOnDay]), [
    ['Pull Day Tempo', [TODAY], false],
    ['Engine room', [(TODAY + 1) % 7], true],
    ['Unused', [], false],
  ]);
  assert.equal(cards[0].url, 'u', 'a carried card keeps what it carried');
  assert.equal(cards[1].meta, '12 tracks');
  assert.deepEqual(bsTrainPlaylistCards([], null, TODAY), [], 'no week, no cards');
  assert.deepEqual(bsTrainPlaylistCards([{ title: 'A' }], [], TODAY).map((c) => c.uses), [[]]);
});
