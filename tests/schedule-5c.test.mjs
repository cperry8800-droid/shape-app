// tests/schedule-5c.test.mjs
//
// Coach dashboard step 5c, the Schedule page (public/newdesign/dashSchedule.jsx), mounted in JSDOM
// through tests/helpers/schedule-page.mjs: blocks tinted and edged by their KIND and said in words,
// with the client as a tier mark (the per-client palette is retired, #2630); today's column lifted
// with a now-line on the account's clock; the first waiting request as the page's highest card with
// Accept, Decline and ⋯, the rest folded; open hours, time off and booking rules in a modal Hours &
// rules slide-over whose editors still save; the client panel handed this page's own bookings and
// the joint list; and sample data only in the signed-out preview, under the band.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { mountSchedule, json, SCHEDULE_SRC } from './helpers/schedule-page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CC = await import(pathToFileURL(join(ROOT, 'public/newdesign/clientColors.mjs')).href);
// dashRoster.jsx's panel helpers, lifted from the shipped file (the page reads them as window
// globals at call time, as TrainerApp.html's load order provides them).
const ROSTER_SRC = readFileSync(join(ROOT, 'public/newdesign/dashRoster.jsx'), 'utf8');
const PEEK = new Function(ROSTER_SRC.slice(ROSTER_SRC.indexOf('const DASH_PEEK_OPEN_STATUSES'), ROSTER_SRC.indexOf('// A booking\'s day and time on the account\'s clock'))
  + '\nreturn { dashNextSessionFor, dashPeekSessions };')();

const NY = 'America/New_York';
// The helper pins now to Wed 2026-10-07 15:00Z: 11:00 AM in New York.
const ev = (id, date, time, extra = {}) => ({
  id: 'session:' + id, sessionId: id, source: 'session', kind: 'SESSION', title: 'Strength', sub: 'video',
  date, time, durationMin: 60, with: 'Priya S.', clientId: 'member-1', status: 'confirmed', reschedulable: true, editable: false, ...extra,
});
const WEEK = () => [
  ev('s-thu', '2026-10-08', '09:00', { title: 'Upper A' }),
  ev('s-fri', '2026-10-09', '10:00', { with: 'Marcus T.', clientId: 'member-2' }),
  ev('c-tue', '2026-10-06', '14:00', { kind: 'CONSULT', title: 'Plan review', durationMin: 30, with: 'Aisha K.', clientId: 'member-3' }),
  { id: 'event:ck1', source: 'event', kind: 'CHECKIN', title: 'Weekly check-in', date: '2026-10-09', time: '15:00', durationMin: 30, with: '', status: 'planned', editable: true },
  { id: 'plan:w1', source: 'plan', kind: 'WORKOUT', title: 'Lower A', sub: 'Assigned workout', date: '2026-10-06', time: null, durationMin: null, with: '', status: 'planned', editable: false },
  ev('r-sat', '2026-10-10', '09:00', { status: 'requested', with: 'Sam R.', clientId: 'member-4', title: 'Strength check' }),
  ev('r-fri', '2026-10-09', '14:00', { status: 'requested', with: 'Jordan M.', clientId: 'member-5', title: 'Intro session' }),
  ev('r-thu', '2026-10-08', '16:00', { status: 'requested', with: 'Priya S.', title: 'Extra session' }),
  // A request already past (Mon): never on the card.
  ev('r-old', '2026-10-05', '09:00', { status: 'requested', with: 'Nadia P.', clientId: 'member-6' }),
  // The coach's own booking with another coach: never their request to answer.
  ev('s-own', '2026-10-08', '18:00', { status: 'requested', asClient: true, with: 'Coach', clientId: 'coach-1', title: 'Coaching session' }),
];
const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_minute: 480, duration_min: 240 }));
const rec = (id, name, rankPoints, extra = {}) => ({ client: { profile: { id, name }, rankPoints, payments: {}, ...extra } });
const ROSTER = [
  rec('member-1', 'Priya S.', 2400),            // Form
  rec('member-2', 'Marcus T.', null),            // a tier nobody could read: hollow, never Raw
  rec('member-3', 'Aisha K.', 800),              // Tempo, whose colour is consult's gold
  rec('member-4', 'Sam R.', 6000),               // Peak
  rec('member-7', 'Dana K.', 100),               // Raw, booked nowhere on screen
];

function server({ events = WEEK(), zone = NY, calendar = 'ok', answers = {}, plans = null, timeOff = [], hours = HOURS } = {}) {
  const posts = [];
  let release = null;
  const held = calendar === 'held' ? new Promise((r) => { release = r; }) : null;
  const handler = async (u, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    if (method !== 'GET') posts.push({ path: u.pathname, body });
    if (u.pathname === '/api/my-availability') {
      if (calendar === 'signedout') return json(401, { error: 'unauthorized' });
      if (method === 'POST') return json(200, { ok: true, count: body.slots.length, timezone: NY });
      return json(200, { slots: hours, timezone: NY });
    }
    if (u.pathname === '/api/coach/to-schedule') return json(200, { items: [] });
    if (u.pathname === '/api/my-time-off') return calendar === 'fail' ? json(503, {}) : json(200, { timeOff, ready: true });
    if (u.pathname === '/api/my-booking-rules') {
      if (method === 'POST') return json(200, { ok: true, rules: { bufferMin: 0, maxPerDay: null, minNoticeHours: 0, consultMin: 15, ...body } });
      return json(200, { rules: { bufferMin: 0, maxPerDay: null, minNoticeHours: 0, consultMin: 15 }, ready: true });
    }
    if (u.pathname === '/api/calendar') {
      if (calendar === 'fail') return json(503, { error: 'down' });
      if (calendar === 'signedout') return json(401, { error: 'unauthorized' });
      if (held) await held;
      const from = u.searchParams.get('from'), to = u.searchParams.get('to');
      return json(200, { events: events.filter((e) => e.date >= from && e.date <= to), zone,
        ...(plans ? { clientPlans: plans.filter((p) => p.date >= from && p.date <= to), clientPlansReadable: true } : {}) });
    }
    if (u.pathname === '/api/sessions/manage') {
      const a = answers[body.action];
      if (a) return typeof a === 'function' ? a(body) : a;
      return json(200, { ok: true });
    }
    return json(404, {});
  };
  return { handler, posts, release: () => release && release() };
}
async function open(opts = {}) {
  const srv = server(opts);
  const page = await mountSchedule({
    fetch: srv.handler, triage: opts.triage ?? ROSTER, role: opts.role, narrow: opts.narrow, drawer: opts.drawer,
    live: opts.live ?? true, joint: opts.joint, today: opts.today, source: opts.source, params: opts.params,
    globals: { ShapeClientColors: CC, ...PEEK, ...(opts.globals || {}) },
  });
  return { page, srv };
}
const block = (page, id) => page.doc.querySelector('[data-dsc-block="' + id + '"]');
// A computed colour to compare with: what the browser makes of a CSS colour.
function colourOf(page, css) {
  const el = page.doc.createElement('span');
  el.style.color = css;
  return el.style.color;
}
// A key pressed where focus is, as a browser sends it: to the focused element, bubbling.
async function keyOn(page, key, opts = {}) {
  const el = page.doc.activeElement || page.doc.body;
  await page.act(async () => el.dispatchEvent(new page.dom.window.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...opts })));
  await page.settle();
}

// ── 1 · blocks by kind, said in words; the client is a tier mark ────────────────────────────────

test('a block is tinted and edged by its kind and says it in words; the per-client palette is gone', async () => {
  const { page } = await open();
  try {
    const kinds = { 'session:s-thu': 'session', 'session:s-fri': 'session', 'session:c-tue': 'consult', 'event:ck1': 'checkin' };
    for (const [id, kind] of Object.entries(kinds)) {
      const b = block(page, id);
      assert.ok(b, id + ' is not on the grid');
      assert.equal(b.getAttribute('data-kind'), kind, id);
      const word = b.querySelector('[data-kind-word]');
      assert.ok(word, id + ' does not say its kind in words');
      assert.equal(word.textContent, { session: 'Session', consult: 'Consult', checkin: 'Check-in' }[kind]);
      assert.match(b.getAttribute('aria-label'), new RegExp({ session: 'Session', consult: 'Consult', checkin: 'Check-in' }[kind]));
    }
    // Two clients' sessions are one colour: the kind's, never the client's.
    assert.equal(block(page, 'session:s-thu').style.borderLeft, block(page, 'session:s-fri').style.borderLeft, 'two clients\' sessions are told apart by colour');
    assert.equal(block(page, 'session:s-thu').style.background, block(page, 'session:s-fri').style.background);
    // A consult and a check-in take clientColors.mjs's kind colours on this paper (White).
    assert.match(block(page, 'session:c-tue').style.borderLeft, new RegExp(colourOf(page, CC.calendarKindColor('consult', 'white').color).replace(/[()]/g, '\\$&')));
    assert.match(block(page, 'event:ck1').style.borderLeft, new RegExp(colourOf(page, CC.calendarKindColor('checkin', 'white').color).replace(/[()]/g, '\\$&')));
    assert.notEqual(block(page, 'session:c-tue').style.borderLeft, block(page, 'session:s-thu').style.borderLeft, 'a consult reads as a session');
    // The untimed workout says its kind on the all-day row.
    const wk = page.doc.querySelector('[data-kind="workout"]');
    assert.ok(wk && /Workout/.test(wk.textContent), 'the pushed workout does not say its kind');
    // A request is still dashed, in its kind's colour.
    assert.match(block(page, 'session:r-sat').style.borderTop, /dashed/);
    // And the palette is gone from the source, with its hex-alpha appends.
    for (const gone of ['DSC_PALETTE = ', 'function dscClientColor(', 'function dscColorMap(', 'colorOf']) assert.ok(!SCHEDULE_SRC.includes(gone), gone + ' is back');
    assert.doesNotMatch(SCHEDULE_SRC, /\+ "(22|29)"/, 'a hex-alpha append is back');
  } finally { await page.unmount(); }
});

test('the client is their tier mark beside the name, never the fill; an unknown tier is hollow', async () => {
  const { page } = await open();
  try {
    const priya = block(page, 'session:s-thu');
    const mark = priya.querySelector('.sh-tier-mark');
    assert.ok(mark, 'Priya\'s session has no tier mark');
    assert.equal(mark.getAttribute('data-tier'), 'form');
    assert.equal(mark.style.getPropertyValue('--tier-mark'), CC.clientTier(2400).color);
    assert.match(priya.getAttribute('aria-label'), /^Priya S\., Form tier, Session/);
    assert.ok(!priya.style.background.includes(colourOf(page, CC.clientTier(2400).color)), 'the tier is the block\'s fill');
    // Marcus's tier could not be read: a hollow mark, never Raw, and the words say so.
    const marcus = block(page, 'session:s-fri');
    assert.ok(!marcus.querySelector('.sh-tier-mark'), 'an unknown tier drew a colour');
    assert.ok(marcus.querySelector('[data-tier-unknown]'), 'an unknown tier drew no hollow mark');
    assert.match(marcus.getAttribute('aria-label'), /Marcus T\., tier not known, Session/);
    assert.doesNotMatch(marcus.getAttribute('aria-label'), /Raw/);
    // Aisha is Tempo, whose colour is consult's gold: her consult says "Consult" in words, and her
    // tier is the mark.
    const aisha = block(page, 'session:c-tue');
    assert.equal(aisha.querySelector('.sh-tier-mark').getAttribute('data-tier'), 'tempo');
    assert.match(aisha.textContent, /Consult/);
    // A check-in note has no client, so no mark at all.
    assert.ok(!block(page, 'event:ck1').querySelector('.sh-tier-mark, [data-tier-unknown]'));
    // The client chips carry the same marks.
    const chips = page.doc.querySelector('[aria-label="Show clients"]');
    const chip = [...chips.querySelectorAll('button')].find((b) => /Priya S\./.test(b.textContent));
    assert.equal(chip.querySelector('.sh-tier-mark').getAttribute('data-tier'), 'form');
    // A client sharing an hour is their initials: Priya's 16:00 request beside nothing stays a name.
    assert.match(block(page, 'session:s-thu').textContent, /Priya S\./);
  } finally { await page.unmount(); }
});

test('month view chips follow the same rule: kind in words, tier mark, no client colour', async () => {
  const { page } = await open();
  try {
    await page.click(page.button('Month'));
    const chips = [...page.doc.querySelectorAll('[data-date] [data-kind]')];
    assert.ok(chips.length >= 4, 'the month has no chips');
    const priya = chips.find((c) => /Priya S\./.test(c.textContent) && c.getAttribute('data-kind') === 'session');
    const aisha = chips.find((c) => /Aisha K\./.test(c.textContent));
    assert.equal(aisha.getAttribute('data-kind'), 'consult');
    assert.match(aisha.querySelector('[data-kind-word]').textContent, /^Consult$/);
    assert.equal(priya.querySelector('.sh-tier-mark').getAttribute('data-tier'), 'form');
    const marcus = chips.find((c) => /Marcus T\./.test(c.textContent));
    assert.ok(marcus.querySelector('[data-tier-unknown]') && !marcus.querySelector('.sh-tier-mark'));
    assert.equal(priya.style.borderLeft, marcus.style.borderLeft, 'two clients\' chips are told apart by colour');
  } finally { await page.unmount(); }
});

// ── 2 · today lifted, and the now-line on the account's clock ───────────────────────────────────

test('today\'s column is lifted, and the now-line sits on it at the account\'s time, moving with the clock', async () => {
  mock.timers.enable({ apis: ['setInterval'] });
  const { page } = await open();
  try {
    const today = page.doc.querySelector('[data-col-date][data-today]');
    assert.equal(today.getAttribute('data-col-date'), '2026-10-07', 'today is not the zone\'s Wednesday');
    assert.equal(page.doc.querySelectorAll('[data-col-date][data-today]').length, 1);
    assert.match(today.style.boxShadow, /var\(--lift-1/, 'today\'s column is not lifted');
    assert.equal(today.style.zIndex, '1');
    assert.ok(!page.doc.querySelector('[data-col-date="2026-10-08"]').style.boxShadow, 'another day is lifted');
    const head = page.doc.querySelector('[data-day-head][data-today]');
    assert.equal(head.getAttribute('data-day-head'), '2026-10-07');
    assert.match(head.textContent, /Today/);
    // 15:00Z is 11:00 AM in New York, the zone the calendar answered in.
    const line = () => page.doc.querySelector('[data-now-line]');
    assert.equal(line().closest('[data-col-date]').getAttribute('data-col-date'), '2026-10-07');
    assert.equal(line().getAttribute('data-now-min'), '660');
    assert.equal(Number(line().style.top.replace('px', '')), ((660 - 6 * 60) / 60) * 44);
    assert.match(line().textContent, /Now 11:00a/);
    // An hour later the line has moved with the clock, on the page's minute tick.
    const Pinned = globalThis.Date;
    globalThis.Date = class extends Pinned { constructor(...a) { if (a.length) super(...a); else super(Pinned.now() + 3600000); } static now() { return Pinned.now() + 3600000; } };
    try {
      await page.act(async () => mock.timers.tick(60000));
      await page.settle();
      assert.equal(line().getAttribute('data-now-min'), '720', 'the now-line did not move with the clock');
    } finally { globalThis.Date = Pinned; }
  } finally { await page.unmount(); mock.timers.reset(); }
  // London is 16:00 at the same instant: the line follows the account's zone, not this machine's.
  const london = await open({ zone: 'Europe/London' });
  try {
    assert.equal(london.page.doc.querySelector('[data-now-line]').getAttribute('data-now-min'), '960');
  } finally { await london.page.unmount(); }
});

test('open hours are a light teal wash under the blocks, with no edge of their own', async () => {
  const { page } = await open();
  try {
    const band = page.doc.querySelector('[data-col-date="2026-10-08"] [data-open-band]');
    assert.ok(band);
    assert.match(band.style.background, /rgba\(var\(--sh-accent-rgb, 46,224,196\),\s*0\.08\)/);
    assert.equal(band.style.borderLeft, '', 'the wash has an edge again');
    assert.equal(band.style.pointerEvents, 'none');
  } finally { await page.unmount(); }
});

// ── 3 · the request: the page's highest card ────────────────────────────────────────────────────

test('the first waiting request is the page\'s highest card, soonest first, the rest folded', async () => {
  const { page } = await open();
  try {
    const card = page.doc.querySelector('[aria-label="Requests to confirm"]');
    assert.ok(card);
    assert.equal(card.getAttribute('data-requests'), '3', 'a past request, or the coach\'s own, is on the card');
    assert.match(card.style.boxShadow, /var\(--lift-2/, 'the request card is not Lift 2');
    const plate = page.doc.querySelector('[data-schedule-plate]');
    assert.ok(card.compareDocumentPosition(plate) & page.dom.window.Node.DOCUMENT_POSITION_FOLLOWING, 'the week stands above the request');
    const rows = () => [...card.querySelectorAll('[data-request]')];
    assert.equal(rows().length, 1, 'the other requests are not folded');
    assert.match(rows()[0].querySelector('[data-request-line]').textContent, /^Priya S\. wants Thu 4:00 PM$/, 'the soonest request does not lead');
    assert.match(rows()[0].textContent, /Session/);
    const fold = card.querySelector('[data-requests-fold]');
    assert.equal(fold.textContent.replace(/\s+[▾▴]$/, ''), '2 more');
    assert.equal(fold.getAttribute('aria-expanded'), 'false');
    await page.click(fold);
    assert.equal(fold.getAttribute('aria-expanded'), 'true');
    assert.deepEqual(rows().map((r) => r.querySelector('[data-request-line]').textContent), ['Priya S. wants Thu 4:00 PM', 'Jordan M. wants Fri 2:00 PM', 'Sam R. wants Sat 9:00 AM']);
    assert.ok(!/Coach wants|Nadia/.test(card.textContent));
    assert.match(fold.textContent, /Fold the other 2/);
    await page.click(fold);
    assert.equal(rows().length, 1);
  } finally { await page.unmount(); }
});

test('Accept and Decline answer the request; an answer in flight is busy, a failed one says so and stays', async () => {
  let let_go;
  const held = new Promise((r) => { let_go = r; });
  let refuse = true;
  const { page, srv } = await open({ answers: {
    confirm: async () => { await held; return refuse ? json(409, { error: 'That time is taken now.' }) : json(200, { ok: true }); },
  } });
  try {
    const lead = () => page.doc.querySelector('[aria-label="Requests to confirm"] [data-request]');
    await page.click(page.buttonMatching(/^Accept$/, lead()));
    assert.equal(lead().getAttribute('data-request-state'), 'busy');
    assert.ok([...lead().querySelectorAll('button')].filter((b) => /Accept|Decline|⋯/.test(b.textContent)).every((b) => b.disabled), 'a request\'s answers stay live while one is in flight');
    assert.match(lead().textContent, /Answering…/);
    let_go();
    await page.settle();
    assert.equal(lead().getAttribute('data-request-state'), 'failed');
    assert.equal(lead().querySelector('[data-request-failed]').textContent, 'That time is taken now.');
    assert.equal(lead().getAttribute('data-request'), 'r-thu', 'the refused request left the card');
    assert.deepEqual(srv.posts.filter((p) => p.path === '/api/sessions/manage').map((p) => p.body), [{ action: 'confirm', sessionId: 'r-thu' }]);
    // Decline goes through and the next request leads.
    await page.click(page.buttonMatching(/^Decline$/, lead()));
    assert.deepEqual(srv.posts.at(-1).body, { action: 'decline', sessionId: 'r-thu' });
    assert.equal(lead().getAttribute('data-request'), 'r-fri');
    assert.equal(lead().getAttribute('data-request-state'), 'waiting');
    assert.ok(!block(page, 'session:r-thu'), 'a declined request is still on the grid');
  } finally { await page.unmount(); }
});

test('⋯ offers another time or the booking; Esc closes it back to ⋯; the name opens the client panel', async () => {
  const opened = [];
  const Drawer = (props) => { opened.push(props); return null; };
  const { page } = await open({ drawer: Drawer });
  try {
    const card = page.doc.querySelector('[aria-label="Requests to confirm"]');
    const more = card.querySelector('[data-request-more]');
    assert.equal(more.getAttribute('aria-haspopup'), 'menu');
    assert.equal(more.textContent, '⋯');
    await page.click(more);
    const menu = card.querySelector('[role="menu"]');
    assert.ok(menu);
    assert.deepEqual([...menu.querySelectorAll('[role="menuitem"]')].map((b) => b.textContent), ['Offer another time', 'Open the booking']);
    assert.ok(page.doc.activeElement === menu.querySelector('[role="menuitem"]'), 'focus did not go into the menu');
    await keyOn(page, 'Escape');
    assert.ok(!card.querySelector('[role="menu"]'), 'Esc left the menu open');
    assert.ok(page.doc.activeElement === more, 'focus did not come back to ⋯');
    await page.click(more);
    await page.click(page.buttonMatching(/^Offer another time$/, card));
    assert.match(page.doc.querySelector('[role=dialog]').textContent, /Offer another time/);
    await page.click(page.button('Close'));
    await page.click(card.querySelector('[data-request-more]'));
    await page.click(page.buttonMatching(/^Open the booking$/, card));
    assert.match(page.doc.querySelector('[role=dialog]').textContent, /Requested · waiting on you/);
    await page.click(page.button('Close'));
    // The name sits beside the buttons, never inside one, and opens the client's panel.
    const name = card.querySelector('[data-request-name]');
    assert.equal(name.textContent, 'Priya S.');
    assert.ok(!name.parentElement.closest('button'), 'the name is inside a button');
    await page.click(name);
    assert.equal(opened.at(-1).row.client.profile.id, 'member-1');
  } finally { await page.unmount(); }
});

// ── 4 · Hours & rules: the settings slide-over ──────────────────────────────────────────────────

test('the settings are behind one tab on the edge, in a modal sheet: focus held, the page inert, Esc closes', async () => {
  const { page } = await open();
  try {
    assert.ok(!page.doc.querySelector('[data-hours-summary], [data-rules-plate], [data-time-off-list]'), 'the settings are still on the page');
    const tab = page.doc.querySelector('[data-settings-tab]');
    assert.equal(tab.getAttribute('data-settings-tab'), 'edge');
    assert.match(tab.textContent, /Hours & rules/);
    assert.equal(tab.getAttribute('aria-expanded'), 'false');
    assert.equal(tab.style.position, 'fixed');
    tab.focus();
    await page.click(tab);
    const sheet = page.doc.querySelector('[data-settings-sheet]');
    assert.equal(sheet.getAttribute('role'), 'dialog');
    assert.equal(sheet.getAttribute('aria-modal'), 'true');
    assert.equal(page.doc.getElementById(sheet.getAttribute('aria-labelledby')).textContent, 'Hours & rules');
    for (const k of ['[data-hours-summary]', '[data-time-off-list]', '[data-rules-plate]']) assert.ok(sheet.querySelector(k), k + ' is not in the sheet');
    assert.match(sheet.querySelector('[data-settings-help]').textContent, /^\?/);
    // The page behind is inert and hidden from assistive tech.
    const root = page.doc.getElementById('root');
    assert.equal(root.getAttribute('aria-hidden'), 'true');
    assert.equal(root.inert, true);
    assert.equal(page.doc.body.style.overflow, 'hidden');
    // Focus is held: it starts in the sheet, Tab from the last control wraps to the first, and focus
    // that lands outside is brought back.
    assert.ok(sheet.contains(page.doc.activeElement), 'focus is not in the sheet');
    const focusable = [...sheet.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled])')];
    focusable.at(-1).focus();
    await keyOn(page, 'Tab');
    assert.ok(page.doc.activeElement === focusable[0], 'Tab escaped the sheet');
    focusable[0].focus();
    await keyOn(page, 'Tab', { shiftKey: true });
    assert.ok(page.doc.activeElement === focusable.at(-1), 'Shift-Tab escaped the sheet');
    await page.act(async () => page.doc.querySelector('[data-schedule-plate] button').focus());
    await page.settle();
    assert.ok(sheet.contains(page.doc.activeElement), 'focus left the sheet');
    // Esc closes it, the page comes back, and focus returns to the tab.
    await keyOn(page, 'Escape');
    assert.ok(!page.doc.querySelector('[data-settings-sheet]'), 'Esc did not close the sheet');
    assert.equal(root.getAttribute('aria-hidden'), null);
    assert.notEqual(root.inert, true);
    assert.equal(page.doc.body.style.overflow, '');
    assert.ok(page.doc.activeElement === page.doc.querySelector('[data-settings-tab]'), 'focus did not return to the tab');
  } finally { await page.unmount(); }
});

test('an editor inside the sheet still saves, and the save is read out over the inert page', async () => {
  const { page, srv } = await open();
  try {
    // A word already on screen when the sheet opens (an answered request's) is still read out.
    await page.click(page.buttonMatching(/^Accept$/, page.doc.querySelector('[aria-label="Requests to confirm"]')));
    assert.match(page.toast(), /Accepted/);
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    assert.ok(!page.doc.querySelector('[data-toast]').closest('[aria-hidden="true"]'), 'a word on screen was hidden with the page');
    await page.click(page.doc.querySelector('[data-edit-hours]'));
    const sheet = page.doc.querySelector('[data-settings-sheet]');
    assert.ok(sheet.querySelector('[data-hours-editor]'), 'the hours editor did not open in the sheet');
    // Saturday 9:00 (col 5, row 18), by keyboard: a click with detail 0 toggles the cell.
    const cell = sheet.querySelector('[data-hcell="5:18"]');
    await page.act(async () => cell.dispatchEvent(new page.dom.window.MouseEvent('click', { bubbles: true, detail: 0 })));
    await page.settle();
    assert.equal(cell.getAttribute('aria-pressed'), 'true');
    await page.click(sheet.querySelector('[data-save-hours]'));
    const post = srv.posts.find((p) => p.path === '/api/my-availability');
    assert.ok(post, 'the hours were not saved');
    assert.deepEqual(post.body.slots.filter((s) => s.weekday === 6), [{ weekday: 6, start_minute: 540, duration_min: 30 }]);
    assert.ok(page.doc.querySelector('[data-settings-sheet] [data-hours-summary]'), 'the sheet did not go back to the summary');
    const toast = page.doc.querySelector('[data-toast]');
    assert.match(toast.textContent, /Hours saved/);
    assert.ok(!toast.closest('[aria-hidden="true"]'), 'the save\'s word is hidden with the page');
    // The rules save from the sheet too.
    const plate = sheet.querySelector('[data-rules-plate]');
    const buffer = plate.querySelector('select[aria-label="Buffer between sessions"]');
    Object.getOwnPropertyDescriptor(page.dom.window.HTMLSelectElement.prototype, 'value').set.call(buffer, '15');
    await page.act(async () => buffer.dispatchEvent(new page.dom.window.Event('change', { bubbles: true })));
    await page.settle();
    await page.click(plate.querySelector('[data-save-rules]'));
    assert.deepEqual(srv.posts.find((p) => p.path === '/api/my-booking-rules').body, { role: 'trainer', bufferMin: 15, maxPerDay: null, minNoticeHours: 0 });
  } finally { await page.unmount(); }
});

test('closing over an unsaved edit asks first: Keep editing keeps it, Leave without saving drops it', async () => {
  const { page, srv } = await open();
  try {
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    await page.click(page.doc.querySelector('[data-edit-hours]'));
    const cell = page.doc.querySelector('[data-hcell="5:18"]');
    await page.act(async () => cell.dispatchEvent(new page.dom.window.MouseEvent('click', { bubbles: true, detail: 0 })));
    await page.settle();
    await keyOn(page, 'Escape');
    const ask = page.doc.querySelector('[data-settings-unsaved]');
    assert.ok(ask, 'Esc dropped an unsaved edit without asking');
    assert.equal(ask.getAttribute('role'), 'alertdialog');
    assert.match(ask.textContent, /Your changes to your open hours aren't saved\./);
    assert.ok(page.doc.activeElement === ask.querySelector('[data-keep-editing]'), 'focus is not on Keep editing');
    // Esc again keeps editing; so does Keep editing.
    await keyOn(page, 'Escape');
    assert.ok(!page.doc.querySelector('[data-settings-unsaved]'));
    assert.ok(page.doc.querySelector('[data-settings-sheet] [data-hours-editor]'), 'Esc on the ask closed the sheet');
    assert.equal(page.doc.querySelector('[data-hcell="5:18"]').getAttribute('aria-pressed'), 'true', 'the edit was lost');
    // × asks too, and Leave without saving closes with nothing written.
    await page.click(page.doc.querySelector('[data-settings-sheet] button[aria-label="Close"]'));
    await page.click(page.doc.querySelector('[data-leave-unsaved]'));
    assert.ok(!page.doc.querySelector('[data-settings-sheet]'));
    assert.ok(!srv.posts.some((p) => p.path === '/api/my-availability'), 'leaving saved the hours');
    // Reopened, the editor is closed and the hours are the stored ones.
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    assert.match(page.doc.querySelector('[data-hours-summary]').textContent, /SatClosed/);
    // With nothing changed, Esc closes at once.
    await keyOn(page, 'Escape');
    assert.ok(!page.doc.querySelector('[data-settings-sheet]'));
    // A rules draft and an open time-off form with a note are unsaved edits too.
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    await page.click(page.doc.querySelector('[data-add-time-off]'));
    const note = page.doc.querySelector('[data-time-off-form] input[type="text"]');
    Object.getOwnPropertyDescriptor(page.dom.window.HTMLInputElement.prototype, 'value').set.call(note, 'Holiday');
    await page.act(async () => note.dispatchEvent(new page.dom.window.Event('input', { bubbles: true })));
    await page.settle();
    await keyOn(page, 'Escape');
    assert.match(page.doc.querySelector('[data-settings-unsaved]').textContent, /your time off/);
  } finally { await page.unmount(); }
});

test('under 760px the way in is a toolbar button, and the sheet is the same', async () => {
  const { page } = await open({ narrow: true });
  try {
    const tab = page.doc.querySelector('[data-settings-tab]');
    assert.equal(tab.getAttribute('data-settings-tab'), 'toolbar');
    assert.ok(page.doc.querySelector('[data-schedule-plate]').contains(tab));
    assert.notEqual(tab.style.position, 'fixed');
    await page.click(tab);
    assert.equal(page.doc.querySelector('[data-settings-sheet]').getAttribute('aria-modal'), 'true');
    assert.ok(page.doc.querySelector('[data-day-strip]'), 'the narrow day strip is gone');
  } finally { await page.unmount(); }
});

// ── 5 · the client panel gets this page's bookings and the joint list ───────────────────────────

test('the client panel is handed this page\'s own bookings and the joint list', async () => {
  const opened = [];
  const Drawer = (props) => { opened.push(props); return null; };
  const joint = [{ client: { profile: { id: 'member-1' } }, coCoach: { role: 'nutritionist', name: 'Rae', userId: 'u-rae' }, trainingFlags: [], nutritionFlags: [] }];
  // The role dashboard's calendar: one booking past the months on screen, and a copy of one inside
  // them (which this page's own row answers for, once).
  const today = { calendar: [
    { at: '2026-12-02T15:00:00.000Z', kind: 'SESSION', clientId: 'member-1', title: 'Priya S.', status: 'confirmed', sub: 'video' },
    { at: '2026-10-08T13:00:00.000Z', kind: 'SESSION', clientId: 'member-1', title: 'Priya S.', status: 'confirmed', sub: 'video' },
  ] };
  const plans = [{ id: 'cplan:d1', date: '2026-10-08', clientId: 'member-7', with: 'Dana K.', title: 'Tempo' }];
  const { page } = await open({ drawer: Drawer, joint, today, plans });
  try {
    await page.click(block(page, 'session:s-thu'));
    await page.click(page.button('Open client file →'));
    const p = opened.at(-1);
    assert.equal(p.row.client.profile.id, 'member-1');
    assert.equal(p.joint, joint, 'the panel has no joint list');
    assert.equal(p.sessions.state, 'read');
    const at = (iso) => p.sessions.rows.filter((r) => r.at === Date.parse(iso));
    // Thu 9:00 AM in New York, from this page's calendar, with its id and status.
    assert.equal(at('2026-10-08T13:00:00.000Z').length, 1, 'a booking inside the page\'s months is counted twice, or not at all');
    assert.deepEqual(at('2026-10-08T13:00:00.000Z')[0], { at: Date.parse('2026-10-08T13:00:00.000Z'), clientId: 'member-1', who: 'Priya S.', status: 'confirmed', sub: 'Upper A' });
    assert.equal(at('2026-12-02T15:00:00.000Z').length, 1, 'a booking past the page\'s months is missing');
    assert.ok(!p.sessions.rows.some((r) => r.clientId === 'coach-1'), 'the coach\'s own booking as a client is a session');
    assert.deepEqual(PEEK.dashNextSessionFor(p.row.client, p.sessions, Date.parse('2026-10-07T15:00:00Z')).session.at, Date.parse('2026-10-08T13:00:00.000Z'));
    // A client booked nowhere: with the dashboard's calendar read, "none" is a fact.
    await page.click(page.doc.querySelector('[data-plan="cplan:d1"]'));
    const dana = opened.at(-1);
    assert.equal(dana.row.client.profile.id, 'member-7');
    assert.equal(PEEK.dashNextSessionFor(dana.row.client, dana.sessions, Date.parse('2026-10-07T15:00:00Z')).state, 'none');
  } finally { await page.unmount(); }
  // Without the dashboard's calendar, the page answers only for a booking inside its own months:
  // Marcus's Friday is real, and Dana's "nothing booked" can't be claimed.
  const second = await open({ drawer: Drawer, plans });
  try {
    await second.page.click(block(second.page, 'session:s-fri'));
    await second.page.click(second.page.button('Open client file →'));
    assert.equal(opened.at(-1).sessions.state, 'read');
    assert.equal(PEEK.dashNextSessionFor(opened.at(-1).row.client, opened.at(-1).sessions, Date.parse('2026-10-07T15:00:00Z')).session.at, Date.parse('2026-10-09T14:00:00.000Z'));
    await second.page.click(second.page.doc.querySelector('[data-plan="cplan:d1"]'));
    assert.equal(opened.at(-1).sessions.state, 'unread', 'a client with nothing in the months read reads as "none booked"');
  } finally { await second.page.unmount(); }
});

test('the panel\'s schedule says loading and unread for a calendar not read, and the preview\'s meets its people by name', async () => {
  const { page } = await open();
  try {
    const P = page.dom.window.dscPanelSessions;
    const rec = { profile: { id: 'member-1', name: 'Priya S.' } };
    assert.deepEqual(P({ rec, cal: null, events: [], preview: false, calState: 'loading' }), { state: 'loading' });
    assert.deepEqual(P({ rec, cal: null, events: [], preview: false, calState: 'failed' }), { state: 'unread' });
    const demo = P({ rec, cal: null, events: [ev('d1', '2026-10-09', '07:00', { clientId: 'demo-priya' })], preview: true, calState: 'loading' });
    assert.equal(demo.state, 'read');
    assert.equal(demo.rows[0].clientId, null, 'the preview\'s bookings meet its people by id, which never match');
    assert.equal(demo.rows[0].who, 'Priya S.');
  } finally { await page.unmount(); }
});

// ── 6 · sample data only under the band ─────────────────────────────────────────────────────────

test('the signed-out preview shows its example week under the band', async () => {
  const { page } = await open({ live: false, calendar: 'signedout' });
  try {
    assert.ok(page.doc.querySelector('[data-demo-band]'), 'the preview has no band');
    assert.ok(page.doc.querySelectorAll('[data-dsc-block]').length > 5, 'the preview has no example week');
    const card = page.doc.querySelector('[aria-label="Requests to confirm"]');
    const fold = card.querySelector('[data-requests-fold]');
    if (fold) await page.click(fold);
    assert.match(card.textContent, /Sam R\. wants Sat 9:00 AM/);
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    assert.match(page.doc.querySelector('[data-time-off-list]').textContent, /Dentist/);
  } finally { await page.unmount(); }
});

test('a signed-in coach whose calendar could not be read is told so, never shown the preview\'s week', async () => {
  const { page } = await open({ calendar: 'fail' });
  try {
    assert.ok(!page.doc.querySelector('[data-demo-band]'));
    assert.equal(page.doc.querySelectorAll('[data-dsc-block]').length, 0, 'sample bookings for a signed-in coach');
    assert.ok(!page.doc.querySelector('[data-plans-row]'), 'the preview\'s plans for a signed-in coach');
    assert.ok(!page.doc.querySelector('[aria-label="Requests to confirm"]'));
    assert.doesNotMatch(page.text(), /Priya S\.|Deandre K\.|Sam R\./);
    const note = page.doc.querySelector('[data-calendar-note]');
    assert.match(note.textContent, /Your calendar couldn't be read just now\./);
    assert.ok(note.querySelector('button') && /Retry/.test(note.textContent));
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    assert.doesNotMatch(page.doc.querySelector('[data-time-off-list]').textContent, /Dentist/, 'the preview\'s time off for a signed-in coach');
    assert.match(page.doc.querySelector('[data-settings-sheet]').textContent, /Your time off couldn't load/);
  } finally { await page.unmount(); }
});

test('while a signed-in coach\'s calendar loads, and before the page knows who is looking, no sample shows', async () => {
  const { page, srv } = await open({ calendar: 'held' });
  try {
    assert.equal(page.doc.querySelectorAll('[data-dsc-block]').length, 0, 'sample bookings while the calendar loads');
    assert.match(page.doc.querySelector('[data-calendar-note]').textContent, /Reading your calendar…/);
    srv.release();
    await page.settle();
    assert.ok(block(page, 'session:s-thu'), 'the calendar did not arrive');
  } finally { await page.unmount(); }
  const unknown = await open({ live: false, source: null, calendar: 'signedout' });
  try {
    assert.ok(!unknown.page.doc.querySelector('[data-demo-band]'));
    assert.equal(unknown.page.doc.querySelectorAll('[data-dsc-block]').length, 0, 'the preview\'s week before the page knew it was the preview');
    assert.equal(unknown.page.doc.querySelectorAll('[data-open-band]').length, 0, 'the preview\'s hours before the page knew it was the preview');
    assert.ok(!unknown.page.doc.querySelector('[data-time-off]'), 'the preview\'s time off before the page knew it was the preview');
    assert.ok(!unknown.page.doc.querySelector('[data-plans-row]'), 'the preview\'s plans before the page knew it was the preview');
  } finally { await unknown.page.unmount(); }
});

// ── 5 · the sheet fills the screen, and the hours editor says how it works ───────────────────────
// Owner, 2026-11-10: "This pop up should fill more of screen, its very small and constrained. Also how
// does this work? How do I choose when im available".

test('the sheet is wide, time off sits beside the rules, and an empty week says what that means', async () => {
  const { page } = await open({ hours: [] });
  try {
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    const sheet = page.doc.querySelector('[data-settings-sheet]');
    // JSDOM drops a CSS min(), so the width is read from the source the page runs.
    assert.match(SCHEDULE_SRC, /data-settings-sheet=""\n\s+style=\{\{ position: "absolute", top: 0, right: 0, bottom: 0, boxSizing: "border-box", width: "min\(1120px, 100vw\)"/, 'the sheet is still a 560px strip');
    const pair = sheet.querySelector('[data-settings-pair]');
    assert.ok(pair.querySelector('[data-time-off-list]') && pair.querySelector('[data-rules-plate]'), 'time off and the rules are not side by side');
    assert.equal(pair.style.flexWrap, 'wrap', 'the pair cannot stack where the sheet is narrow');
    assert.match(sheet.querySelector('[data-hours-empty]').textContent, /^No open hours yet, so members can't book you\./);
  } finally { await page.unmount(); }
  // A coach with hours is not told they have none.
  const withHours = await open();
  try {
    await withHours.page.click(withHours.page.doc.querySelector('[data-settings-tab]'));
    assert.ok(!withHours.page.doc.querySelector('[data-hours-empty]'), 'a coach with hours is told they have none');
  } finally { await withHours.page.unmount(); }
});

test('the hours editor says how it works: the steps, the drag read out, each day\'s hours, the week in words, Mon–Fri 9–5 in one press', async () => {
  const { page, srv } = await open({ hours: [] });
  try {
    await page.click(page.doc.querySelector('[data-settings-tab]'));
    await page.click(page.doc.querySelector('[data-edit-hours]'));
    const ed = page.doc.querySelector('[data-hours-editor]');
    const q = (k) => ed.querySelector(k);
    const cell = (c, r) => ed.querySelector('[data-hcell="' + c + ':' + r + '"]');
    const words = () => [...q('[data-hours-words]').children].map((n) => n.textContent).join('|');
    const dayHours = () => [1, 2, 3, 4, 5, 6, 0].map((wd) => q('[data-day-hours="' + wd + '"]').textContent);
    assert.match(q('[data-hours-howto]').textContent, /Press on the time you start and drag down to the time you stop\./);
    assert.match(q('[data-hours-howto]').textContent, /Save hours\. They repeat every week/);
    assert.equal(q('[data-hours-readout]').textContent, 'Your week is empty: press on a start time and drag down to open it.');
    assert.deepEqual(dayHours(), ['closed', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
    assert.equal(q('[data-clear-week]').disabled, true, 'nothing to clear');
    // The cells answer the pointer before they are pressed.
    assert.match(q('style').textContent, /\[data-hcell\]\[aria-pressed="false"\]:hover/);

    // Monday 9:00 dragged to Friday 4:30, read out while the pointer is down.
    page.doc.elementFromPoint = (x, y) => cell(x, y);
    await page.drag(cell(0, 18), [[0, 18], [2, 25], [4, 33]], { release: false });
    assert.equal(q('[data-hours-readout]').textContent, 'Opening Mon–Fri · 9:00 AM–5:00 PM');
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    await page.settle();
    assert.equal(q('[data-hours-readout]').textContent, 'Shaded is open. Drag over shaded time to close it.', 'the readout outlived the drag');
    // Never a colour's name: the accent is teal on one paper and amber on another.
    assert.doesNotMatch(ed.textContent, /\bteal\b/i);
    assert.deepEqual(dayHours(), ['8h', '8h', '8h', '8h', '8h', 'closed', 'closed']);
    assert.match(words(), /^Mon\|9:00 AM–5:00 PM\|Tue\|9:00 AM–5:00 PM/);
    assert.match(words(), /Sat\|Closed\|Sun\|Closed$/);
    // Closing reads out as closing.
    await page.drag(cell(2, 24), [[2, 24], [2, 25]], { release: false });
    assert.equal(q('[data-hours-readout]').textContent, 'Closing Wed · 12:00 PM–1:00 PM');
    await page.act(async () => page.dom.window.dispatchEvent(Object.assign(new page.dom.window.MouseEvent('pointerup', { bubbles: true }), { pointerId: 1 })));
    await page.settle();
    assert.match(words(), /Wed\|9:00 AM–12:00 PM, 1:00 PM–5:00 PM/);

    // Clear week empties it; Mon–Fri 9–5 fills the working week and leaves the weekend as it was.
    await page.click(cell(5, 20));
    await page.act(async () => cell(5, 20).dispatchEvent(new page.dom.window.MouseEvent('click', { bubbles: true, detail: 0 })));
    await page.settle();
    await page.click(q('[data-clear-week]'));
    assert.deepEqual(dayHours(), ['closed', 'closed', 'closed', 'closed', 'closed', 'closed', 'closed']);
    await page.act(async () => cell(5, 20).dispatchEvent(new page.dom.window.MouseEvent('click', { bubbles: true, detail: 0 })));
    await page.settle();
    await page.click(q('[data-fill-workweek]'));
    assert.deepEqual(dayHours(), ['8h', '8h', '8h', '8h', '8h', '0.5h', 'closed'], 'the weekend was not left as it was');
    assert.equal(cell(0, 17).getAttribute('aria-pressed'), 'false', '8:30 opened');
    assert.equal(cell(0, 18).getAttribute('aria-pressed'), 'true', '9:00 not opened');
    assert.equal(cell(4, 33).getAttribute('aria-pressed'), 'true', '4:30 not opened');
    assert.equal(cell(4, 34).getAttribute('aria-pressed'), 'false', '5:00 opened');

    // Nothing was written until Save, and Save writes the week in one go.
    assert.ok(!srv.posts.some((p) => p.path === '/api/my-availability'), 'a quick start saved on its own');
    await page.click(q('[data-save-hours]'));
    const post = srv.posts.find((p) => p.path === '/api/my-availability');
    assert.deepEqual(post.body.slots, [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_minute: 540, duration_min: 480 })).concat([{ weekday: 6, start_minute: 600, duration_min: 30 }]));
  } finally { await page.unmount(); }
});
