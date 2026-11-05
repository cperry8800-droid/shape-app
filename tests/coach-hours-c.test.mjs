// The coach's Your hours page as the owner picked it (2026-11-04, of three designs: "I like option C
// but make it so you can tell more specifically what times certain bars sit on, that can be unclear
// here. And use the bottom part of B in C"): BSCoachHours.jsx, MOUNTED in jsdom with real React.
//   · C's top: the week's total in an LED slot with a lamp per open day; the lit grid, a row a day,
//     each open half hour lit; the chosen day's times in LED slots, ＋ Add hours, its switch, Copy.
//   · Its times read: the grid spans the coach's own hours, an hour scale labels them closely with a
//     tick and a faint line through every row at each hour, and each row says its ranges in words.
//   · B's bottom: the rules on glass rows, each value in a pill that opens to its choices; time off
//     on a glass card; See your calendar.
// The sample (signed out) and the live routes (signed in) are the page's own paths; every target is
// 44px or more.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { bsHoursScale } from '../mobile-app/src/services/coachHours.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app/src/broadsheet/BSCoachHours.jsx');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const { IntlMessageFormat } = require_('intl-messageformat');

const coach = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs/en/coach.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => { const msg = coach[key.replace(/^coach:/, '')]; return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts); },
  intlLocale: () => 'en-US',
};
const paper = (light) => (light
  ? { PAPER: '#f4efe4', PAPER2: '#ede6d6', INK: '#14120f', inkRGB: '20,18,15', INK50: 'rgba(20,18,15,0.5)', INK70: 'rgba(20,18,15,0.7)', INK30: 'rgba(20,18,15,0.28)', RULE: 'rgba(20,18,15,0.2)', HAIR: 'rgba(20,18,15,0.1)', isLight: true }
  : { PAPER: '#0f0e0c', PAPER2: '#181612', INK: '#f5f0e6', inkRGB: '245,240,230', INK50: 'rgba(245,240,230,0.5)', INK70: 'rgba(245,240,230,0.7)', INK30: 'rgba(245,240,230,0.28)', RULE: 'rgba(245,240,230,0.2)', HAIR: 'rgba(245,240,230,0.1)', isLight: false });
let theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', RUST: '#c0533b', padX: 22, ...paper(false) };
W.useBS = () => theme;
W.BSPage = ({ children }) => React.createElement('div', { 'data-chrome': 'BSPage' }, children);
W.BSFooter = () => null;
W.BSDetailHeader = ({ onBack, title, noCorner }) => React.createElement('header', { 'data-chrome': 'BSDetailHeader', 'data-no-corner': noCorner ? '1' : '0' },
  React.createElement('button', { type: 'button', 'data-back': '', onClick: onBack }, '← Back'), title);

const M = await loadRealModule(SRC, { registry: new Map([['react', React]]) });
const flush = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });

// A signed-in coach: what the routes answer, and what they were asked.
const MON = 1, SAT = 6, SUN = 0;
const WEEK = [1, 2, 3, 4, 5].flatMap((wd) => [{ weekday: wd, start_minute: 540, duration_min: 180 }, { weekday: wd, start_minute: 840, duration_min: 240 }]);
function liveCoach({ timeOff = [] } = {}) {
  const calls = { save: [], saveRules: [], addTimeOff: [], removeTimeOff: [] };
  let rules = { bufferMin: 0, maxPerDay: null, minNoticeHours: 0, consultMin: 15, introsAtCapacity: false };
  W.ShapeAuth = { getCachedState: () => ({ user: { id: 'coach-1' } }) };
  W.ShapeCoachHours = {
    zone: () => 'America/New_York',
    get: async () => ({ providerId: 'p1', slots: WEEK, timezone: 'America/New_York' }),
    save: async (role, rows) => { calls.save.push([role, rows]); return { timezone: 'America/New_York' }; },
    rules: async () => ({ providerId: 'p1', rules }),
    saveRules: async (role, patch) => { calls.saveRules.push(patch); rules = { ...rules, ...patch }; return { rules }; },
    timeOff: async () => ({ providerId: 'p1', timezone: 'America/New_York', timeOff }),
    addTimeOff: async (role, body) => { calls.addTimeOff.push(body); return { timeOff: { id: 'new', startsAt: '2099-03-02T05:00:00.000Z', endsAt: '2099-03-04T05:00:00.000Z' }, overlapping: 0 }; },
    removeTimeOff: async (role, id) => { calls.removeTimeOff.push(id); return true; },
  };
  return calls;
}
function signedOut() { delete W.ShapeAuth; delete W.ShapeCoachHours; }

async function mount({ role = 'trainer', light = false, onOpenCalendar = () => {} } = {}) {
  theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', RUST: '#c0533b', padX: 22, ...paper(light) };
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  const left = [];
  await React.act(async () => { root.render(React.createElement(M.BSCoachHoursPage, { role, onBack: () => left.push('back'), onOpenCalendar: () => { left.push('calendar'); onOpenCalendar(); } })); });
  await flush(); await flush();
  const q = (s) => host.querySelector(s);
  const qa = (s) => [...host.querySelectorAll(s)];
  const row = (wd) => q(`button[data-hours-day="${wd}"]`);
  return {
    host, left, q, qa, row,
    lit: (wd) => [...row(wd).querySelectorAll('[data-hours-cell][data-lit="1"]')].map((c) => Number(c.getAttribute('data-hours-cell'))),
    cells: (wd) => [...row(wd).querySelectorAll('[data-hours-cell]')].map((c) => Number(c.getAttribute('data-hours-cell'))),
    words: (wd) => row(wd).querySelector('[data-hours-words]').textContent,
    click: async (el) => { await React.act(async () => { el.click(); }); await flush(); },
    type: async (el, value) => {
      const proto = el.tagName === 'SELECT' ? W.HTMLSelectElement.prototype : W.HTMLInputElement.prototype;
      await React.act(async () => {
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
        el.dispatchEvent(new W.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
      });
      await flush();
    },
    close: () => React.act(async () => { root.unmount(); host.remove(); }),
  };
}
// Half hours from a to b (minutes): what a lit range covers.
const halves = (a, b) => { const out = []; for (let m = a; m < b; m += 30) out.push(m); return out; };
const SAMPLE_LIT = [...halves(540, 720), ...halves(840, 1080)];

test('the grid: a lit cell for each open half hour, none outside the ranges, and the week\'s total lit above', async () => {
  signedOut();
  const m = await mount();
  try {
    assert.ok(m.q('[data-coach-hours]'));
    assert.equal(m.qa('button[data-hours-day]').length, 7, 'a row a day');
    assert.deepEqual(m.qa('button[data-hours-day]').map((b) => Number(b.getAttribute('data-hours-day'))), [1, 2, 3, 4, 5, 6, 0], 'Monday first');
    for (const wd of [1, 2, 3, 4, 5]) {
      assert.deepEqual(m.lit(wd), SAMPLE_LIT, `day ${wd}: 9 to 12 and 2 to 6 lit, nothing else`);
      assert.equal(m.cells(wd).length, 18, 'a cell for every half hour of the scale');
    }
    for (const wd of [SAT, SUN]) assert.deepEqual(m.lit(wd), [], 'a closed day lights nothing');
    // The readout: "35 hours a week" in its LED slot, a lamp per open day.
    assert.match(m.q('[data-hours-total]').textContent, /^35\s*hours a week$/i);
    assert.deepEqual(m.qa('[data-hours-lamp]').map((l) => l.getAttribute('data-hours-lamp')), ['on', 'on', 'on', 'on', 'on', 'off', 'off']);
    // The trainer's rust lights the cells.
    const cell = m.row(MON).querySelector('[data-hours-cell="540"] > span');
    assert.match(cell.style.background, /#c0533b|rgb\(192, 83, 59\)/);
    // The preview says it is one, and nothing in it is a save.
    assert.match(m.host.textContent, /A preview with sample hours/);
    assert.equal(m.q('[data-hours-savebar]'), null);
  } finally { await m.close(); }
});

test('the scale fits the coach\'s hours: every hour labelled and ticked, and an hour line through every row', async () => {
  signedOut();
  const m = await mount();
  try {
    const scale = m.q('[data-hours-scale]');
    assert.equal(scale.getAttribute('data-hours-scale'), '540-1080', '9 AM to 6 PM: the sample\'s earliest start to its latest end');
    assert.equal(scale.getAttribute('data-hours-step'), '1', 'nine hours label every hour at 390 wide');
    assert.deepEqual(m.qa('[data-hours-mark]').map((s) => s.textContent), ['9 AM', '10', '11', '12 PM', '1', '2', '3', '4', '5', '6']);
    assert.equal(m.qa('[data-hours-tick]').length, 10, 'a tick for every hour');
    for (const wd of [1, 2, 3, 4, 5, 6, 0]) {
      const lines = [...m.row(wd).querySelectorAll('[data-hour-line]')].map((l) => Number(l.getAttribute('data-hour-line')));
      assert.deepEqual(lines, [540, 600, 660, 720, 780, 840, 900, 960, 1020, 1080], `an hour line per hour through day ${wd}`);
    }
    // Each line sits where its label does: the same share of the width.
    const at = (el) => el.style.left;
    assert.equal(at(m.q('[data-hours-mark="720"]')), at(m.row(MON).querySelector('[data-hour-line="720"]')));
    assert.equal(at(m.q('[data-hours-mark="720"]')), `${(180 / 540) * 100}%`);
    // An earlier start widens the scale to it, and the bars follow.
    await m.click(m.row(MON));
    await m.type(m.q('input[aria-label="Mon, from"]'), '07:30');
    assert.equal(m.q('[data-hours-scale]').getAttribute('data-hours-scale'), '420-1080', '7:30 rounds out to 7');
    assert.deepEqual(m.lit(MON), [...halves(450, 720), ...halves(840, 1080)], 'the half hour from 7:30 lit, 7:00 not');
    await m.type(m.q('input[aria-label="Mon, from"]'), '07:00');
    assert.equal(m.row(SAT).querySelectorAll('[data-hour-line]').length, 12, 'twelve hour marks, 7 to 6, through every row');
    assert.equal(m.q('[data-hours-scale]').getAttribute('data-hours-step'), '1', 'eleven hours still label every hour at 390 wide');
    assert.deepEqual(m.qa('[data-hours-mark]').map((s) => s.textContent), ['7 AM', '8', '9', '10', '11', '12 PM', '1', '2', '3', '4', '5', '6']);
    // Twelve hours don't: every other hour is labelled, on even hours so noon is, and every hour ticked.
    await m.type(m.q('input[aria-label="Mon, from"]'), '06:00');
    assert.equal(m.q('[data-hours-scale]').getAttribute('data-hours-scale'), '360-1080');
    assert.equal(m.q('[data-hours-scale]').getAttribute('data-hours-step'), '2');
    assert.deepEqual(m.qa('[data-hours-mark]').map((s) => s.textContent), ['6 AM', '8', '10', '12 PM', '2', '4', '6']);
    assert.equal(m.qa('[data-hours-tick]').length, 13, 'every hour keeps its tick');
    assert.equal(m.row(SUN).querySelectorAll('[data-hour-line]').length, 13, 'and its line through every row');
  } finally { await m.close(); }
});

// jsdom measures nothing: these hand the scale a width, change it with no React render (as turning a
// phone does), and check the labels follow (Codex P2 on #2616).
function stubWidth(start) {
  const proto = W.HTMLElement.prototype;
  const real = proto.getBoundingClientRect;
  const box = { width: start };
  proto.getBoundingClientRect = function () { return { width: box.width, height: 19, top: 0, left: 0, right: box.width, bottom: 19, x: 0, y: 0 }; };
  return { box, restore: () => { proto.getBoundingClientRect = real; } };
}
const NARROW = 110;
const narrowStep = String(bsHoursScale([540, 1080], { width: NARROW, locale: 'en-US' }).step);

test('the scale re-reads its width when it resizes with no render (a phone turned), and lets go on close', async () => {
  signedOut();
  assert.notEqual(narrowStep, '1', `the case means something: ${NARROW}px can't label nine hours one by one`);
  const w = stubWidth(260);
  const observers = [];
  W.ResizeObserver = class { constructor(cb) { this.cb = cb; this.els = []; this.off = false; observers.push(this); } observe(el) { this.els.push(el); } disconnect() { this.off = true; } };
  let m = null;
  try {
    m = await mount();
    const step = () => m.q('[data-hours-scale]').getAttribute('data-hours-step');
    assert.equal(step(), '1', '260 wide: every hour labelled');
    const ro = observers.find((o) => o.els.some((el) => m.q('[data-hours-scale]').contains(el)));
    assert.ok(ro, 'the scale is observed');
    w.box.width = NARROW;
    await React.act(async () => { ro.cb([]); });
    assert.equal(step(), narrowStep, 'narrower, the labels step out at once');
    w.box.width = 260;
    await React.act(async () => { ro.cb([]); });
    assert.equal(step(), '1', 'and back when it widens');
    await m.close(); m = null;
    assert.equal(ro.off, true, 'the observer is let go when the page closes');
  } finally {
    if (m) await m.close();
    w.restore(); delete W.ResizeObserver;
  }
});

test('with no ResizeObserver, a window resize re-reads the scale, and the listener goes on close', async () => {
  signedOut();
  delete W.ResizeObserver;
  const w = stubWidth(260);
  const live = new Set();
  const add = W.addEventListener, remove = W.removeEventListener;
  W.addEventListener = function (type, fn, o) { if (type === 'resize') live.add(fn); return add.call(this, type, fn, o); };
  W.removeEventListener = function (type, fn, o) { if (type === 'resize') live.delete(fn); return remove.call(this, type, fn, o); };
  let m = null;
  try {
    m = await mount();
    const step = () => m.q('[data-hours-scale]').getAttribute('data-hours-step');
    assert.equal(step(), '1');
    assert.ok(live.size >= 1, 'the page listens for resizes');
    w.box.width = NARROW;
    await React.act(async () => { W.dispatchEvent(new W.Event('resize')); });
    assert.equal(step(), narrowStep, 'the labels step out after the resize');
    await m.close(); m = null;
    assert.equal(live.size, 0, 'no resize listener left behind');
  } finally {
    if (m) await m.close();
    W.addEventListener = add; W.removeEventListener = remove; w.restore();
  }
});

test('a long day figure widens every day slot alike, so it reads whole and the bars stay under the scale', async () => {
  signedOut();
  const m = await mount();
  try {
    const widths = () => m.qa('[data-hours-slot]').map((s) => s.style.width);
    assert.deepEqual(widths(), Array(7).fill('54px'), '"MON 7" fits the least slot');
    assert.equal(m.q('[data-hours-scale]').style.margin, '12px 0px 2px 62px', 'the scale starts where the bars do');
    // Monday open 6:30 AM to 6 PM: "11.5" beside "MON" needs a wider slot, and every row takes it.
    await m.click(m.row(MON));
    await m.type(m.q('input[aria-label="Mon, from"]'), '06:30');
    await m.type(m.qa('input[aria-label="Mon, until"]')[1], '20:00');
    assert.equal(m.row(MON).querySelector('[data-hours-slot]').textContent, 'Mon11.5');
    const w = widths();
    assert.ok(parseFloat(w[0]) >= 69, `the slot holds "MON" and "11.5": ${w[0]}`);
    assert.deepEqual(w, Array(7).fill(w[0]), 'one width for every row');
    assert.equal(m.q('[data-hours-scale]').style.margin, `12px 0px 2px ${parseFloat(w[0]) + 8}px`);
  } finally { await m.close(); }
});

test('each row says its ranges in words, on the reader\'s clock', async () => {
  signedOut();
  const m = await mount();
  try {
    for (const wd of [1, 2, 3, 4, 5]) assert.equal(m.words(wd), '9–12 · 2–6');
    assert.equal(m.words(SAT), 'Closed');
    assert.equal(m.words(SUN), 'Closed');
    // The row's name for a screen reader carries the whole times.
    assert.equal(m.row(MON).getAttribute('aria-label'), 'Mon, 7 hours: 9:00 AM – 12:00 PM, 2:00 PM – 6:00 PM');
    assert.equal(m.row(SAT).getAttribute('aria-label'), 'Sat, Closed');
    // Minutes show where they are.
    await m.click(m.row(MON));
    await m.type(m.q('input[aria-label="Mon, until"]'), '12:30');
    assert.equal(m.words(MON), '9–12:30 · 2–6');
  } finally { await m.close(); }
  // A 24-hour clock reads 24-hour ranges.
  W.ShapeI18n.intlLocale = () => 'de';
  const de = await mount();
  try { assert.equal(de.words(MON), '9–12 · 14–18'); } finally { await de.close(); W.ShapeI18n.intlLocale = () => 'en-US'; }
});

test('a row chooses its day: its times under the grid, its switch, and the switch remembers its times', async () => {
  signedOut();
  const m = await mount();
  try {
    await m.click(m.row(SAT));
    assert.equal(m.row(SAT).getAttribute('aria-pressed'), 'true');
    assert.equal(m.qa('button[data-hours-day][aria-pressed="true"]').length, 1, 'one day chosen');
    assert.equal(m.q('[data-hours-chosen]').textContent, 'Saturday');
    assert.equal(m.q('[role="switch"][aria-label="Open on Sat"]').getAttribute('aria-checked'), 'false');
    assert.equal(m.qa('[data-hours-range]').length, 0, 'a closed day has no times to edit');
    // Opened, a day starts at 9 to 5.
    await m.click(m.q('[role="switch"][aria-label="Open on Sat"]'));
    assert.deepEqual(m.lit(SAT), halves(540, 1020));
    assert.equal(m.words(SAT), '9–5');
    // Monday: off, then on again, keeps its two ranges.
    await m.click(m.row(MON));
    assert.equal(m.q('[data-hours-chosen]').textContent, 'Monday');
    assert.equal(m.qa('[data-hours-range]').length, 2);
    await m.click(m.q('[role="switch"][aria-label="Open on Mon"]'));
    assert.deepEqual(m.lit(MON), []);
    assert.equal(m.words(MON), 'Closed');
    await m.click(m.q('[role="switch"][aria-label="Open on Mon"]'));
    assert.deepEqual(m.lit(MON), SAMPLE_LIT, 'its times came back');
  } finally { await m.close(); }
});

test('editing a range: a time, ＋ Add hours, ×, and a time that ends before it starts', async () => {
  signedOut();
  const m = await mount();
  try {
    await m.click(m.row(MON));
    await m.type(m.q('input[aria-label="Mon, from"]'), '10:00');
    assert.equal(m.words(MON), '10–12 · 2–6');
    assert.deepEqual(m.lit(MON), [...halves(600, 720), ...halves(840, 1080)]);
    assert.match(m.q('[data-hours-total]').textContent, /^34\s*hours a week$/i);
    // ＋ Add hours puts two hours an hour after the last block.
    await m.click(m.q('[data-hours-add]'));
    assert.equal(m.qa('[data-hours-range]').length, 3);
    assert.equal(m.words(MON), '10–12 · 2–6 · 7–9');
    assert.equal(m.q('[data-hours-scale]').getAttribute('data-hours-scale'), '540-1260', 'the scale reaches the new end');
    // × takes a range off.
    await m.click(m.q('button[aria-label="Remove 7:00 PM to 9:00 PM"]'));
    assert.equal(m.words(MON), '10–12 · 2–6');
    // An end before its start is marked and says why.
    const until = m.qa('input[aria-label="Mon, until"]')[0];
    await m.type(until, '09:00');
    assert.match(until.style.border, /#c0533b|rgb\(192, 83, 59\)/);
    assert.match(m.host.textContent, /Ends before it starts\./);
  } finally { await m.close(); }
});

test('Copy: from the chosen day to Weekdays, Weekend or Every day, the three targets on a line of their own', async () => {
  signedOut();
  const m = await mount();
  try {
    await m.click(m.row(MON));
    assert.equal(m.q('select[aria-label="Copy from"]').value, '1', 'the copy starts from the day in view');
    await m.click(m.q('[data-hours-copy="weekend"]'));
    assert.deepEqual(m.lit(SAT), SAMPLE_LIT);
    assert.deepEqual(m.lit(SUN), SAMPLE_LIT);
    assert.match(m.q('[data-hours-total]').textContent, /^49\s*hours a week$/i);
    // Its picker takes any day: Sunday's (now Monday's) hours onto every day.
    await m.click(m.row(SAT));
    await m.click(m.q('[role="switch"][aria-label="Open on Sat"]'));
    await m.type(m.q('select[aria-label="Copy from"]'), '6');
    await m.click(m.q('[data-hours-copy="all"]'));
    for (const wd of [0, 1, 2, 3, 4, 5]) assert.deepEqual(m.lit(wd), [], `Saturday, closed, copied onto day ${wd}`);
    // The three targets: their own full-width line, each word free to wrap inside its target.
    const btns = m.qa('[data-hours-copy]');
    assert.deepEqual(btns.map((b) => b.textContent), ['Weekdays', 'Weekend', 'Every day']);
    assert.equal(btns[0].parentElement.style.flex, '1 1 100%');
    for (const b of btns) { assert.equal(b.style.whiteSpace, 'normal'); assert.equal(b.style.minWidth, '0px'); }
  } finally { await m.close(); }
});

test('a rule row opens to its choices, and a pick saves that one rule', async () => {
  const calls = liveCoach();
  const m = await mount();
  try {
    const row = m.q('[data-hours-rule="consultMin"]');
    const head = row.querySelector('button[aria-expanded]');
    assert.equal(head.getAttribute('aria-expanded'), 'false');
    assert.equal(row.querySelector('[data-hours-rule-value]').textContent, '15 min', 'the value in its pill');
    assert.ok(!row.querySelector('[role="group"]'), 'closed, no choices');
    await m.click(head);
    assert.equal(head.getAttribute('aria-expanded'), 'true');
    const opts = [...row.querySelectorAll('[role="group"] button')];
    assert.deepEqual(opts.map((b) => b.textContent), ['10 min', '15 min', '20 min', '30 min', '45 min', '60 min']);
    assert.equal(opts[1].getAttribute('aria-pressed'), 'true');
    await m.click(opts[3]);
    assert.deepEqual(calls.saveRules, [{ consultMin: 30 }]);
    assert.equal(row.querySelector('[data-hours-rule-value]').textContent, '30 min');
    assert.match(m.host.textContent, /Saved\./);
    // One row open at a time.
    await m.click(m.q('[data-hours-rule="maxPerDay"] button[aria-expanded]'));
    assert.equal(head.getAttribute('aria-expanded'), 'false');
    assert.equal(m.q('[data-hours-rule="maxPerDay"] [data-hours-rule-value]').textContent, 'No limit');
    // Every rule is a row: the four with choices, and intro calls while full on its switch.
    assert.deepEqual(m.qa('[data-hours-rule]').map((r) => r.getAttribute('data-hours-rule')), ['consultMin', 'minNoticeHours', 'bufferMin', 'maxPerDay', 'introsAtCapacity']);
    await m.click(m.q('[data-hours-rule="introsAtCapacity"] [role="switch"]'));
    assert.deepEqual(calls.saveRules.at(-1), { introsAtCapacity: true });
    assert.equal(m.q('[data-hours-rule="introsAtCapacity"] [role="switch"]').getAttribute('aria-checked'), 'true');
  } finally { await m.close(); signedOut(); }
});

test('time off: the glass card, its list, the form, adding and removing', async () => {
  signedOut();
  const preview = await mount();
  try {
    assert.equal(preview.q('[data-hours-off-empty]').textContent, 'No time off coming up.');
    assert.equal(preview.q('[data-hours-off-add]').disabled, true, 'the preview has nothing to save to');
  } finally { await preview.close(); }

  const calls = liveCoach({ timeOff: [{ id: 'v1', startsAt: '2099-01-05T05:00:00.000Z', endsAt: '2099-01-08T05:00:00.000Z', note: 'Vacation' }] });
  const m = await mount();
  try {
    assert.equal(m.qa('[data-hours-off]').length, 1);
    assert.match(m.q('[data-hours-off]').textContent, /Jan 5 – .*Jan 7.*Vacation/);
    assert.equal(m.q('[data-hours-off-empty]'), null);
    await m.click(m.q('[data-hours-off-add]'));
    assert.ok(m.q('[data-hours-off-form]'), 'the form opens');
    assert.equal(m.q('[data-hours-off-add]'), null, 'its ＋ steps aside while it is open');
    const [from, to] = m.qa('[data-hours-off-form] input[type="date"]');
    await m.type(from, '2099-03-02');
    await m.type(to, '2099-03-03');
    await m.click(m.q('[data-hours-off-save]'));
    assert.deepEqual(calls.addTimeOff, [{ fromDate: '2099-03-02', toDate: '2099-03-03' }]);
    assert.equal(m.q('[data-hours-off-form]'), null);
    assert.equal(m.qa('[data-hours-off]').length, 2);
    assert.match(m.host.textContent, /Added\. Members can’t book you in that time\./);
    await m.click(m.q('[data-hours-off] button[aria-label^="Remove time off"]'));
    assert.deepEqual(calls.removeTimeOff, ['v1']);
    assert.equal(m.qa('[data-hours-off]').length, 1);
  } finally { await m.close(); signedOut(); }
});

test('live: the save bar, the leave-without-saving ask, and See your calendar', async () => {
  const calls = liveCoach();
  const m = await mount();
  try {
    assert.deepEqual(m.lit(MON), SAMPLE_LIT, 'the stored week, drawn');
    assert.equal(m.q('[data-hours-savebar]'), null);
    await m.click(m.row(MON));
    // Undo puts the stored week back.
    await m.type(m.q('input[aria-label="Mon, until"]'), '13:00');
    assert.equal(m.words(MON), '9–1 · 2–6');
    assert.equal(m.q('[data-hours-undo]').textContent, 'Undo changes');
    await m.click(m.q('[data-hours-undo]'));
    assert.equal(m.words(MON), '9–12 · 2–6');
    assert.equal(m.q('[data-hours-savebar]'), null);
    // See your calendar, with nothing unsaved, goes at once.
    await m.click(m.q('[data-hours-calendar]'));
    assert.deepEqual(m.left, ['calendar']);
    m.left.length = 0;
    await m.type(m.q('input[aria-label="Mon, from"]'), '10:00');
    assert.ok(m.q('[data-hours-savebar]'), 'an edit raises the save bar');
    assert.equal(m.q('[data-chrome="BSDetailHeader"]').getAttribute('data-no-corner'), '1', 'no corner that would drop it');
    // Back asks first.
    await m.click(m.q('[data-back]'));
    assert.deepEqual(m.left, []);
    assert.match(m.q('[data-hours-savebar]').textContent, /You haven't saved these hours\./);
    assert.equal(m.q('[data-hours-undo]').textContent, 'Leave without saving');
    // Saving goes, then leaves.
    await m.click(m.q('[data-save-hours]'));
    assert.equal(calls.save.length, 1);
    assert.deepEqual(calls.save[0][1].filter((r) => r.weekday === 1), [{ weekday: 1, start_minute: 600, duration_min: 120 }, { weekday: 1, start_minute: 840, duration_min: 240 }]);
    assert.deepEqual(m.left, ['back']);
    assert.equal(m.q('[data-hours-savebar]'), null);
    assert.equal(m.words(MON), '10–12 · 2–6', 'what was saved is the week now');
  } finally { await m.close(); signedOut(); }
});

test('both papers, both coaches: rust for trainers, gold for nutritionists, the switches teal', async () => {
  for (const [role, accent, rgb] of [['trainer', '#c0533b', 'rgb(192, 83, 59)'], ['nutritionist', '#a07a2e', 'rgb(160, 122, 46)']]) {
    for (const light of [false, true]) {
      signedOut();
      const m = await mount({ role, light });
      try {
        const cell = m.row(MON).querySelector('[data-hours-cell="540"] > span');
        assert.ok(cell.style.background.includes(accent) || cell.style.background.includes(rgb), `${role} on ${light ? 'light' : 'dark'}: ${cell.style.background}`);
        assert.ok([...m.qa('[data-hours-mark]')].length > 0);
        const on = m.q('[role="switch"][aria-checked="true"] > span');
        if (on) assert.match(on.style.background, light ? /#0a8f87|rgb\(10, 143, 135\)/ : /#34d6c5|rgb\(52, 214, 197\)/);
        assert.doesNotMatch(m.host.textContent, /\p{Emoji_Presentation}/u, 'no colored emoji');
      } finally { await m.close(); }
    }
  }
});

test('every target is 44px or more, the rules and the time-off form open', async () => {
  liveCoach();
  const m = await mount();
  try {
    await m.click(m.q('[data-hours-rule="minNoticeHours"] button[aria-expanded]'));
    await m.click(m.q('[data-hours-off-add]'));
    await m.click(m.row(MON));
    await m.type(m.q('input[aria-label="Mon, from"]'), '10:00'); // the save bar up too
    const targets = m.qa('button, input, select').filter((el) => !el.closest('[data-chrome="BSDetailHeader"]'));
    assert.ok(targets.length > 30, `${targets.length} targets`);
    for (const el of targets) {
      const h = Math.max(parseFloat(el.style.minHeight) || 0, parseFloat(el.style.height) || 0);
      assert.ok(h >= 44, `${el.tagName} ${el.getAttribute('aria-label') || el.textContent} is ${h}px tall`);
    }
    // A day row is a 44px target that chooses its day.
    for (const r of m.qa('button[data-hours-day]')) assert.equal(r.style.minHeight, '44px');
  } finally { await m.close(); signedOut(); }
});

test('its own module: window globals read at call time, no import back into the client, no options left', () => {
  const src = readFileSync(SRC, 'utf8');
  const imports = [...src.matchAll(/^import[^'"]*['"]([^'"]+)['"]/gm)].map((x) => x[1]);
  // shapeZone.mjs (P9): the hours and the preview are named and printed on the account's zone.
  assert.deepEqual(imports, ['react', '../services/coachHours.mjs', '../services/coachAvailability.mjs', '../services/shapeZone.mjs', './BSProInstrument.jsx', './BSMemberBento.jsx']);
  assert.doesNotMatch(src, /iosAppBroadsheetClient/, 'a feature module never imports the client');
  assert.match(src, /export function BSCoachHoursPage\(\{ role = 'trainer', onBack, onOpenCalendar \}\) \{\n\s+const \{ useBS, BSPage, BSDetailHeader, BSFooter \} = window;/, 'the chrome is read when the page renders');
  // The options are gone: no switch, no other looks, no old week editor.
  assert.doesNotMatch(src, /__hoursLook|hoursLook\(|function WeekA|function WeekB|function WeekC|function WeekEditor|function RulesLook|function TimeOffLook|function Eyebrow/);
  assert.doesNotMatch(src, /\p{Emoji_Presentation}/u, 'no colored emoji');
  // The client and the profile still open it.
  assert.match(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8'), /import \{ BSCoachHoursPage \} from '\.\/BSCoachHours\.jsx';/);
  assert.match(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), 'utf8'), /import \{ BSCoachHoursPage \} from '\.\/BSCoachHours\.jsx';/);
});
