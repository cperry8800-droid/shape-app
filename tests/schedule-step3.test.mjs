// Coach Schedule, step 3 (owner-approved 2026-10-07): the coach's own hours, time off and booking
// rules. What this file holds:
//   1. the member slot lists (bookingSlots.js) offer exactly what the routes accept
//      (bookingRules.checkSlot), over randomised calendars;
//   2. /api/availability hands the member pages the coach's busy time and rules, and fails
//      closed when it cannot read them;
//   3. the page: hours edited on the week grid in half hours, copied between days and saved in
//      one write; time off listed, hatched on the grid, added and removed; the rules form.
// The routes' own refusals (time off, buffer, daily limit, notice) are in schedule-step2.test.mjs
// beside the request and consult tests they extend.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fakeSupabase } from './helpers/fake-supabase.mjs';
import { mountSchedule, json } from './helpers/schedule-page.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const B = require(join(ROOT, 'public/newdesign/bookingSlots.js'));
const BR = await import(pathToFileURL(join(ROOT, 'public/newdesign/bookingRules.mjs')).href);
const NY = 'America/New_York';
const iso = (ms) => new Date(ms).toISOString();

// ── 1 · the slot lists offer what the routes accept ─────────────────────────────

test('buildSlots with busy time and rules offers exactly the starts checkSlot accepts, every start, two zones', () => {
  // ⚠ TWO IMPLEMENTATIONS, ONE ANSWER. bookingSlots.js is a plain <script> and cannot import the
  // ES module the routes refuse a booking with, so it restates the rules; this holds them equal.
  const pattern = [
    { weekday: 1, start_minute: 360, duration_min: 240 }, { weekday: 2, start_minute: 540, duration_min: 480 },
    { weekday: 3, start_minute: 1020, duration_min: 30 }, { weekday: 4, start_minute: 480, duration_min: 600 },
    { weekday: 5, start_minute: 540, duration_min: 90 }, { weekday: 6, start_minute: 600, duration_min: 240 },
  ];
  // Oct 20 to Nov 17 crosses New York's fall-back night.
  const now = Date.parse('2026-10-20T12:00:00Z');
  let seed = 7;
  const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
  let checked = 0;
  const reasons = new Set();
  for (const zone of [NY, 'Australia/Sydney']) {
    for (let k = 0; k < 6; k++) {
      const busy = [];
      for (let i = 0; i < 30; i++) {
        const s = now + Math.floor(rnd() * 28 * 96) * 15 * 60000;
        busy.push({ start: iso(s), end: iso(s + (2 + Math.floor(rnd() * 5)) * 15 * 60000), kind: 'session' });
      }
      for (let i = 0; i < 2; i++) {
        const s = now + Math.floor(rnd() * 28 * 24) * 3600000;
        busy.push({ start: iso(s), end: iso(s + (2 + Math.floor(rnd() * 30)) * 3600000), kind: 'time_off' });
      }
      const rules = BR.normalizeRules({ bufferMin: [0, 15, 30][k % 3], maxPerDay: [null, 2, 3][k % 3], minNoticeHours: [0, 12, 48][k % 3] });
      for (const sessionMin of [15, 60]) {
        const base = { slots: pattern, booked: [], zone, now: new Date(now), days: 28, sessionMin };
        const all = B.buildSlots(base);
        const kept = new Set(B.buildSlots({ ...base, busy, rules }).map((s) => s.ms));
        for (const s of all) {
          const v = BR.checkSlot({ start: s.ms, durationMin: sessionMin }, { now, zone, availability: pattern, busy, rules, audience: 'member', skip: ['closed'] });
          assert.equal(kept.has(s.ms), v.ok, `${zone} ${s.iso} (${sessionMin} min): offered ${kept.has(s.ms)}, route says ${v.ok ? 'ok' : v.reason}`);
          checked++;
          if (!v.ok) reasons.add(v.reason);
        }
      }
    }
  }
  assert.ok(checked > 1000, 'the sweep checked too little: ' + checked);
  assert.deepEqual([...reasons].sort(), ['buffer', 'daily_limit', 'notice', 'overlap', 'time_off'], 'every rule was exercised');
});

test('buildSlots without busy time or rules is the list it always was', () => {
  const slots = [{ weekday: 4, start_minute: 540, duration_min: 180 }];
  const base = { slots, booked: [], zone: NY, now: new Date('2026-10-07T15:00:00Z'), days: 14, sessionMin: 60 };
  const plain = B.buildSlots(base).map((s) => s.iso);
  assert.ok(plain.length >= 6);
  assert.deepEqual(B.buildSlots({ ...base, busy: [], rules: BR.DEFAULT_RULES }).map((s) => s.iso), plain, 'nothing busy and no rules drops nothing');
  // A session that only overlaps (9:30, not the 9:00 start) is now dropped, which `booked` never caught.
  const busy = [{ start: '2026-10-08T13:30:00Z', end: '2026-10-08T14:30:00Z', kind: 'session' }];
  const withBusy = B.buildSlots({ ...base, busy }).map((s) => s.iso);
  assert.ok(!withBusy.includes('2026-10-08T13:00:00.000Z') && !withBusy.includes('2026-10-08T14:00:00.000Z'), 'an overlapping hour is offered');
  assert.ok(withBusy.includes('2026-10-08T15:00:00.000Z'));
});

// ── 2 · /api/availability ───────────────────────────────────────────────────────

async function availability({ tables = {}, rpc, fail = [] } = {}) {
  const { loadRealModule } = await import('./helpers/load-real-module.mjs');
  const nextServer = require('next/server');
  const lib = (f, reg = []) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true, registry: new Map([['next/server', nextServer], ...reg]) });
  const time = await lib('time.ts');
  const owned = await lib('owned-provider.ts', [['@/lib/time', time], ['@supabase/supabase-js', {}]]);
  const client = fakeSupabase({ tables, fail, rpcs: { provider_busy_blocks: rpc || (() => []) } });
  const route = await loadRealModule(join(ROOT, 'src/app/api/availability/route.ts'), {
    typescript: true,
    registry: new Map([['next/server', nextServer], ['@/lib/time', time], ['@/lib/owned-provider', owned], ['@/lib/supabase/server', { createClient: async () => client }]]),
  });
  const res = await route.GET(new Request('https://shape.test/api/availability?role=trainer&id=7'));
  return { status: res.status, body: await res.json(), calls: client._calls };
}

test('/api/availability answers with the coach\'s busy time and rules, and `booked` from the busy read', async (t) => {
  // ⚠ THE ROUTE KEEPS A SESSION IN `booked` ONLY UNTIL IT ENDS (Date.now()), so the fixture's
  // own morning is pinned: on the real clock this test failed for every run after 14:00 UTC
  // on 2026-10-08, the day its session was dated.
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-08T10:00:00Z') });
  const busy = [
    { starts_at: '2026-10-08T13:00:00+00:00', ends_at: '2026-10-08T14:00:00+00:00', kind: 'session' },
    { starts_at: '2026-10-09T13:00:00+00:00', ends_at: '2026-10-10T04:00:00+00:00', kind: 'time_off' },
  ];
  let asked = null;
  const r = await availability({
    tables: {
      trainers: [{ id: 7, timezone: NY }],
      provider_availability: [{ provider_role: 'trainer', provider_id: 7, weekday: 4, start_minute: 540, duration_min: 180 }],
      provider_booking_rules: [{ provider_role: 'trainer', provider_id: 7, buffer_min: 15, max_per_day: 4, min_notice_hours: 12 }],
    },
    rpc: (args) => { asked = args; return busy; },
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.busy, busy.map((b) => ({ start: b.starts_at, end: b.ends_at, kind: b.kind })));
  assert.deepEqual(r.body.booked, ['2026-10-08T13:00:00+00:00'], 'a session start, never a time-off one');
  assert.deepEqual(r.body.rules, { bufferMin: 15, maxPerDay: 4, minNoticeHours: 12 });
  assert.equal(r.body.timezone, NY);
  // ⚠ THE WINDOW IS INSIDE WHAT THE FUNCTION ALLOWS: a longer one is refused outright.
  const days = (Date.parse(asked.p_to) - Date.parse(asked.p_from)) / 86400000;
  assert.ok(days <= BR.BUSY_READ_MAX_DAYS && days >= 28, 'window of ' + days + ' days');
  assert.deepEqual([asked.p_role, asked.p_provider_id], ['trainer', 7]);
});

test('/api/availability fails closed on an unreadable busy read or rules; a coach with neither answers nothing busy and the defaults', async () => {
  const base = { trainers: [{ id: 7, timezone: NY }], provider_availability: [] };
  for (const fail of [['rpc:provider_busy_blocks'], ['provider_booking_rules']]) {
    const r = await availability({ tables: base, fail });
    assert.equal(r.status, 503, fail.join() + ' read as a free calendar');
  }
  const r = await availability({ tables: base });
  assert.equal(r.status, 200);
  assert.deepEqual([r.body.busy, r.body.booked, r.body.rules], [[], [], { ...BR.DEFAULT_RULES }]);
});

// ── 3 · the page ────────────────────────────────────────────────────────────────
// Week of Mon Oct 5 – Sun Oct 11 2026; the clock reads Wed Oct 7, 11:00 AM New York.

const HOURS = [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start_minute: 480, duration_min: 240 }));
const THU = { id: 'session:s-thu', sessionId: 's-thu', source: 'session', kind: 'SESSION', title: 'Strength', sub: 'video', date: '2026-10-08', time: '09:00', durationMin: 60, with: 'Priya S.', clientId: 'member-1', status: 'confirmed', reschedulable: true, editable: false };
const DENTIST = { id: 't1', startsAt: '2026-10-08T17:00:00.000Z', endsAt: '2026-10-08T22:00:00.000Z', note: 'Dentist' };

function server({ timeOff = [DENTIST], rules = { bufferMin: 15, maxPerDay: null, minNoticeHours: 12 }, answers = {} } = {}) {
  const sent = [];
  const handler = async (u, init = {}) => {
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : null;
    if (method !== 'GET') sent.push({ path: u.pathname, search: u.search, method, body });
    if (u.pathname === '/api/my-availability') {
      if (method === 'POST') return answers.hours || json(200, { ok: true, count: body.slots.length, timezone: NY });
      return json(200, { slots: HOURS, timezone: NY });
    }
    if (u.pathname === '/api/calendar') return json(200, { events: [THU], zone: NY });
    if (u.pathname === '/api/my-time-off') {
      if (method === 'POST') return answers.timeOff || json(200, { ok: true, timeOff: { id: 't2', startsAt: '2026-10-12T04:00:00.000Z', endsAt: '2026-10-14T04:00:00.000Z', note: null }, overlapping: 1 });
      if (method === 'DELETE') return json(200, { ok: true });
      return json(200, { timeOff, ready: true });
    }
    if (u.pathname === '/api/my-booking-rules') {
      if (method === 'POST') return json(200, { ok: true, rules: { ...rules, ...Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'role')) } });
      return json(200, { rules, ready: true });
    }
    return json(404, {});
  };
  return { handler, sent };
}
async function open(opts = {}) {
  const srv = server(opts);
  const page = await mountSchedule({ fetch: srv.handler, live: opts.live ?? true });
  return { page, sent: srv.sent };
}
// React tracks a control's value; set it through the native setter, then fire the event React reads.
async function setValue(page, el, value) {
  const proto = el.tagName === 'SELECT' ? page.dom.window.HTMLSelectElement.prototype : page.dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  await page.act(async () => el.dispatchEvent(new page.dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })));
  await page.settle();
}
const cell = (page, col, row) => page.doc.querySelector('[data-hcell="' + col + ':' + row + '"]');
const pressed = (page, col, row) => cell(page, col, row).getAttribute('aria-pressed') === 'true';

test('hours are edited on the grid in half hours: paint a rectangle, copy a day, close a cell, and save the week in one write', async () => {
  const { page, sent } = await open();
  try {
    const summary = () => page.doc.querySelector('[data-hours-summary]').textContent;
    assert.match(summary(), /Mon8:00 AM–12:00 PM/);
    assert.match(summary(), /SatClosed/);
    await page.click(page.doc.querySelector('[data-edit-hours]'));
    assert.ok(!!page.doc.querySelector('[data-hours-editor]'), 'the editor did not open');
    assert.ok(!page.doc.querySelector('[data-dsc-cols]'), 'the bookings grid is still under the editor');
    const save = () => page.doc.querySelector('[data-save-hours]');
    assert.equal(save().disabled, true, 'nothing changed, nothing to save');
    // Mon 8:00 (col 0, row 16) is open; Sat (col 5) is closed; the rows run 5 AM (10) to 10 PM.
    assert.equal(pressed(page, 0, 16), true);
    assert.equal(pressed(page, 5, 16), false);
    assert.ok(!!cell(page, 0, 10) && !!cell(page, 0, 43) && !cell(page, 0, 44), 'the rows run 5:00 AM to 10:00 PM');

    // Copy Monday to the weekend.
    await setValue(page, page.doc.querySelector('select[aria-label="Copy to"]'), 'weekend');
    await page.click(page.doc.querySelector('[data-copy-day]'));
    assert.equal(pressed(page, 5, 16), true, 'Saturday got Monday\'s 8:00');
    assert.equal(pressed(page, 6, 23), true, 'Sunday got Monday\'s 11:30');
    // Sunday 1:00 PM to 2:30 PM, painted as a rectangle: the pointer is mapped to cells by
    // position (JSDOM has no layout, so the test names the cell at each point).
    page.doc.elementFromPoint = (x, y) => cell(page, x, y);
    await page.drag(cell(page, 6, 26), [[6, 26], [6, 27], [6, 28]]);
    assert.ok([26, 27, 28].every((r) => pressed(page, 6, r)), 'the drag opened 1:00–2:30');
    assert.equal(pressed(page, 6, 29), false);
    // Starting on an open cell closes: Saturday 9:00.
    await page.drag(cell(page, 5, 18), [[5, 18]]);
    assert.equal(pressed(page, 5, 18), false, 'starting on an open cell closes it');
    assert.equal(save().disabled, false);

    await page.click(save());
    const post = sent.find((c) => c.path === '/api/my-availability');
    assert.ok(post, 'nothing was saved');
    assert.equal(sent.filter((c) => c.path === '/api/my-availability').length, 1, 'one save for the whole edit');
    assert.equal(post.body.role, 'trainer');
    assert.equal(typeof post.body.timezone, 'string');
    const rows = (wd) => post.body.slots.filter((s) => s.weekday === wd).map((s) => [s.start_minute, s.duration_min]);
    assert.deepEqual(rows(1), [[480, 240]]);
    assert.deepEqual(rows(6), [[480, 60], [570, 150]], 'Saturday: 8:00–9:00 and 9:30–12:00');
    assert.deepEqual(rows(0), [[480, 240], [780, 90]], 'Sunday: the copy and the painted 1:00–2:30');
    assert.ok(!page.doc.querySelector('[data-hours-editor]'), 'the editor stayed open after saving');
    assert.match(summary(), /Sat8:00 AM–9:00 AM, 9:30 AM–12:00 PM/);
    assert.match(page.toast(), /Hours saved/);
  } finally { await page.unmount(); }
});

test('the hours editor opens only on hours that have arrived (Codex, the review of #2229)', async () => {
  // ⚠ THE SAVE REWRITES THE WHOLE WEEK: an editor seeded before the read answered would save one
  // painted cell over every hour the coach has.
  let release;
  const held = new Promise((r) => { release = r; });
  const srv = server();
  const page = await mountSchedule({ fetch: async (u, init) => (u.pathname === '/api/my-availability' && (!init || !init.method) ? (await held, json(200, { slots: HOURS, timezone: NY })) : srv.handler(u, init)) });
  try {
    const edit = () => page.doc.querySelector('[data-edit-hours]');
    assert.equal(edit().disabled, true, 'the editor can open before the hours arrive');
    assert.match(edit().textContent, /Loading your hours/);
    release();
    await page.settle();
    assert.equal(edit().disabled, false);
    await page.click(edit());
    assert.equal(cell(page, 0, 16).getAttribute('aria-pressed'), 'true', 'the editor opened without the stored hours');
  } finally { await page.unmount(); }
  const failed = await mountSchedule({ fetch: async (u, init) => (u.pathname === '/api/my-availability' ? json(503, { error: 'x' }) : server().handler(u, init)) });
  try {
    assert.equal(failed.doc.querySelector('[data-edit-hours]').disabled, true, 'an unread week can be overwritten');
    assert.match(failed.text(), /Your hours couldn't load/);
  } finally { await failed.unmount(); }
});

test('a refused hours save keeps the editor open and says why; Cancel discards the edit', async () => {
  const { page } = await open({ answers: { hours: json(400, { error: 'timezone_required', detail: 'We need your timezone before saving them.' }) } });
  try {
    await page.click(page.doc.querySelector('[data-edit-hours]'));
    page.doc.elementFromPoint = (x, y) => cell(page, x, y);
    await page.drag(cell(page, 5, 20), [[5, 20]]);
    await page.click(page.doc.querySelector('[data-save-hours]'));
    assert.ok(!!page.doc.querySelector('[data-hours-editor]'));
    assert.match(page.doc.querySelector('[data-hours-editor] [role="alert"]').textContent, /timezone/);
    await page.click(page.button('Cancel'));
    assert.ok(!page.doc.querySelector('[data-hours-editor]'));
    assert.match(page.doc.querySelector('[data-hours-summary]').textContent, /SatClosed/, 'a cancelled edit changed the hours');
  } finally { await page.unmount(); }
});

test('time off is listed, hatched on its day in the grid, and a move into it asks first', async () => {
  const { page } = await open();
  try {
    assert.match(page.doc.querySelector('[data-time-off-list]').textContent, /Thu, Oct 8 · 1:00 PM–6:00 PM · Dentist/);
    const hatch = [...page.doc.querySelectorAll('[data-time-off]')];
    assert.equal(hatch.length, 1);
    assert.equal(hatch[0].closest('[data-col-date]').getAttribute('data-col-date'), '2026-10-08');
    // 1:00 PM on a grid that starts at 6 AM, at 44 px an hour; five hours tall.
    assert.deepEqual([Number(hatch[0].style.top.replace('px', '')), Number(hatch[0].style.height.replace('px', ''))], [7 * 44, 5 * 44]);
    // Drag Thursday's 9:00 to 2:00 PM: inside the time off, so the coach is asked.
    const { left, colWidth } = page.layout();
    const block = page.doc.querySelector('[data-dsc-block="session:s-thu"]');
    const x = left + 3 * colWidth + 10, y = 3 * 44 + 10;
    await page.drag(block, [[x, y], [x, y + 5 * 44]]);
    assert.match(page.text(), /During your time off/);
    assert.match(page.text(), /is in your time off/);
  } finally { await page.unmount(); }
});

test('time off is added as whole days in the coach\'s days, and removed', async () => {
  const { page, sent } = await open();
  try {
    await page.click(page.doc.querySelector('[data-add-time-off]'));
    const form = page.doc.querySelector('[data-time-off-form]');
    await setValue(page, form.querySelector('input[aria-label="From date"]'), '2026-10-12');
    await setValue(page, form.querySelector('input[aria-label="To date"]'), '2026-10-13');
    await page.act(async () => form.dispatchEvent(new page.dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await page.settle();
    const post = sent.find((c) => c.path === '/api/my-time-off' && c.method === 'POST');
    assert.deepEqual(post.body, { role: 'trainer', allDay: true, fromDate: '2026-10-12', toDate: '2026-10-13' });
    assert.match(page.toast(), /Time off added · 1 booking is still inside it/);
    assert.match(page.doc.querySelector('[data-time-off-list]').textContent, /Mon, Oct 12 – Tue, Oct 13/);
    assert.ok(!page.doc.querySelector('[data-time-off-form]'), 'the form stayed open');

    await page.click(page.button('Remove time off Thu, Oct 8 · 1:00 PM–6:00 PM'));
    const del = sent.find((c) => c.method === 'DELETE');
    assert.equal(del.path, '/api/my-time-off');
    assert.match(del.search, /role=trainer/);
    assert.match(del.search, /id=t1/);
    assert.ok(!page.doc.querySelector('[data-time-off-item="t1"]'), 'removed time off is still listed');
    assert.ok(!page.doc.querySelector('[data-time-off]'), 'removed time off is still hatched');
  } finally { await page.unmount(); }
});

test('part of a day is sent as two instants on the coach\'s clock', async () => {
  const { page, sent } = await open({ timeOff: [] });
  try {
    await page.click(page.doc.querySelector('[data-add-time-off]'));
    const form = page.doc.querySelector('[data-time-off-form]');
    const whole = form.querySelector('input[type="checkbox"]');
    await page.act(async () => whole.click());
    await page.settle();
    await setValue(page, form.querySelector('input[aria-label="From date"]'), '2026-10-09');
    await setValue(page, form.querySelector('input[aria-label="To date"]'), '2026-10-09');
    await setValue(page, form.querySelector('select[aria-label="From time"]'), String(13 * 60));
    await setValue(page, form.querySelector('select[aria-label="To time"]'), String(15 * 60 + 30));
    await page.act(async () => form.dispatchEvent(new page.dom.window.Event('submit', { bubbles: true, cancelable: true })));
    await page.settle();
    const post = sent.find((c) => c.path === '/api/my-time-off' && c.method === 'POST');
    // 1:00–3:30 PM in New York (EDT) is 17:00Z–19:30Z.
    assert.deepEqual(post.body, { role: 'trainer', startsAt: '2026-10-09T17:00:00.000Z', endsAt: '2026-10-09T19:30:00.000Z' });
  } finally { await page.unmount(); }
});

test('the booking rules load, save only when changed, and say they bind members', async () => {
  const { page, sent } = await open();
  try {
    const plate = page.doc.querySelector('[data-rules-plate]');
    const buffer = plate.querySelector('select[aria-label="Buffer between sessions"]');
    assert.equal(buffer.value, '15');
    assert.equal(plate.querySelector('select[aria-label="Notice before a booking"]').value, '12');
    assert.equal(plate.querySelector('select[aria-label="Most sessions a day"]').value, '');
    assert.match(plate.textContent, /Members can't book inside your buffer/);
    const save = plate.querySelector('[data-save-rules]');
    assert.equal(save.disabled, true);
    await setValue(page, buffer, '30');
    await setValue(page, plate.querySelector('select[aria-label="Most sessions a day"]'), '6');
    assert.equal(save.disabled, false);
    await page.click(save);
    const post = sent.find((c) => c.path === '/api/my-booking-rules');
    assert.deepEqual(post.body, { role: 'trainer', bufferMin: 30, maxPerDay: 6, minNoticeHours: 12 });
    assert.match(page.toast(), /Booking rules saved/);
    assert.equal(plate.querySelector('[data-save-rules]').disabled, true, 'saved rules still read as changed');
  } finally { await page.unmount(); }
});

test('the demo shows example time off and saves nothing', async () => {
  const { page, sent } = await open({ live: false });
  try {
    assert.match(page.doc.querySelector('[data-time-off-list]').textContent, /Dentist/);
    await page.click(page.doc.querySelector('[data-edit-hours]'));
    await page.drag(cell(page, 6, 20), [[6, 20]]);
    await page.click(page.doc.querySelector('[data-save-hours]'));
    assert.match(page.toast(), /Demo ·/);
    assert.equal(sent.length, 0, 'the demo wrote to the server');
  } finally { await page.unmount(); }
});

// ── 4 · the database keeps the rules too (2026-10-07-booking-rules-enforced.sql) ────────────────

test('the booking-rules trigger: member requests only, one coach at a time, the four rules in order', async () => {
  // ⚠ CHECKED AGAINST POSTGRES 16 WHEN WRITTEN: each rule refused what it should and let its edge
  // through (a buffer's exact end, a local midnight), a coach's confirmed booking passed, and of two
  // requests sent together against a one-a-day limit or a 30-minute buffer the second waited and
  // was refused. Pinned here by what the file says, because the suite has no database.
  const { readFileSync } = await import('node:fs');
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-07-booking-rules-enforced.sql'), 'utf8');
  const body = sql.replace(/--.*$/gm, '');
  assert.match(body, /create trigger sessions_enforce_booking_rules\s+before insert on public\.sessions\s+for each row execute function public\.enforce_booking_rules\(\)/);
  assert.match(body, /drop trigger if exists sessions_enforce_booking_rules on public\.sessions;/, 'not safe to re-run');
  assert.match(body, /if new\.status is distinct from 'requested' then\s+return new;/, 'a coach\'s own booking is held to the member rules');
  assert.match(body, /security definer\s+set search_path = public, pg_temp/);
  assert.match(body, /revoke all on function public\.enforce_booking_rules\(\) from public, anon, authenticated;/);
  const lock = body.indexOf('pg_advisory_xact_lock(');
  const order = ['booking_rule:notice', 'booking_rule:time_off', 'booking_rule:buffer', 'booking_rule:daily_limit'].map((r) => body.indexOf("'" + r + "'"));
  assert.ok(lock > 0 && order.every((i) => i > lock), 'a rule is read before the per-coach lock is held');
  assert.deepEqual(order.slice().sort((a, b) => a - b), order, 'the rules are checked out of bookingRules.mjs\'s order');
  assert.match(body, /\(s\.scheduled_at at time zone v_zone\)::date = \(new\.scheduled_at at time zone v_zone\)::date/, 'the daily limit counts UTC days, not the coach\'s');
  assert.match(body, /s\.status in \('requested', 'confirmed'\)/);
});

test('bookingRuleRefusal reads the trigger\'s refusal into the member\'s own sentence, and nothing else', () => {
  assert.deepEqual(BR.bookingRuleRefusal({ code: 'P0001', message: 'booking_rule:notice', details: '48' }),
    { reason: 'notice', message: "This coach needs at least 2 days' notice. Pick a later time." });
  assert.deepEqual(BR.bookingRuleRefusal({ code: 'P0001', message: 'booking_rule:time_off' }), { reason: 'time_off', message: 'This coach is away then.' });
  assert.equal(BR.bookingRuleRefusal({ code: 'P0001', message: 'booking_rule:buffer' }).reason, 'buffer');
  assert.equal(BR.bookingRuleRefusal({ code: 'P0001', message: 'booking_rule:daily_limit' }).message, 'This coach is fully booked that day.');
  // The same sentence checkSlot gives a member for the same rule.
  const v = BR.checkSlot({ start: '2026-10-08T13:00:00Z', durationMin: 60 }, { now: '2026-10-07T15:00:00Z', zone: NY, availability: HOURS, timeOff: [{ starts_at: '2026-10-08T12:00:00Z', ends_at: '2026-10-08T18:00:00Z' }], audience: 'member', skip: ['closed'] });
  assert.equal(v.message, BR.bookingRuleRefusal({ message: 'booking_rule:time_off' }).message);
  for (const e of [null, undefined, {}, { message: 'booking_rule:closed' }, { code: '23P01', message: 'conflicting key' }, { message: 'xbooking_rule:buffer' }]) {
    assert.equal(BR.bookingRuleRefusal(e), null, JSON.stringify(e));
  }
});

test('the app books an intro THROUGH /api/consultation, on the coach\'s own clock, and says why it was refused', async () => {
  // Step 4: the app used to insert the `requested` row itself, so its intros skipped the open
  // hours, never told the coach and sent no invites. Lifted from the shipped shapeBackend.js
  // and driven with its collaborators stood in.
  const { readFileSync } = await import('node:fs');
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  assert.doesNotMatch(src, /from\('sessions'\)\s*\.insert/, 'the app still writes a session row itself');
  const i = src.indexOf('function bookingTime12h');
  const j = src.indexOf('\nasync function listProviderAvailability', i);
  assert.ok(i > 0 && j > i, 'could not lift submitConsultationBooking');
  const make = ({ token = 'tok-1', reply = { status: 200, body: { ok: true, session_id: 's-1' } } } = {}) => {
    const calls = [];
    const fetch = async (url, init) => { calls.push({ url, init, body: JSON.parse(init.body) }); return { ok: reply.status < 300, status: reply.status, json: async () => reply.body }; };
    const api = new Function('normalizeRole', 'state', 'liveAccessToken', 'apiBaseUrl', 'fetch',
      src.slice(i, j) + '\nreturn { submitConsultationBooking, bookingTime12h };')(
      (r) => r, { user: { id: 'member-1', email: 'm@shape.test' }, profile: {} }, async () => token, 'https://api.shape.test', fetch);
    return { ...api, calls };
  };
  const coach = { name: 'Coach', provider_id: 7, provider_role: 'trainer' };
  // A New York 09:00, shown to a Los Angeles member as 06:00.
  const slot = { at: Date.parse('2026-10-08T13:00:00Z'), iso: '2026-10-08', time: '06:00', coachDate: '2026-10-08', coachTime: '09:00' };

  const ok = make();
  const r = await ok.submitConsultationBooking({ coach, role: 'trainer', slot, topic: 'Free intro call' });
  assert.equal(r.stored, 'supabase');
  assert.equal(r.data.id, 's-1');
  assert.equal(ok.calls.length, 1);
  assert.equal(ok.calls[0].url, 'https://api.shape.test/api/consultation');
  assert.equal(ok.calls[0].init.headers.Authorization, 'Bearer tok-1', 'the app signs the booking with its own token');
  assert.deepEqual(
    { providerId: ok.calls[0].body.providerId, professionalType: ok.calls[0].body.professionalType, date: ok.calls[0].body.date, time: ok.calls[0].body.time, scheduledAt: ok.calls[0].body.scheduledAt },
    { providerId: 7, professionalType: 'trainer', date: '2026-10-08', time: '9:00 AM', scheduledAt: '2026-10-08T13:00:00.000Z' },
    'the route gets the COACH\'s wall clock and the instant to cross-check, never the member\'s 06:00');

  // The route's own sentence, nothing kept locally.
  const away = make({ reply: { status: 409, body: { error: 'This coach is away then. Please pick another time.', code: 'time_off' } } });
  await assert.rejects(away.submitConsultationBooking({ coach, role: 'trainer', slot }), /This coach is away then\. Please pick another time\./);
  const down = make({ reply: { status: 500, body: {} } });
  await assert.rejects(down.submitConsultationBooking({ coach, role: 'trainer', slot }), /Could not book this consultation/);

  // A preview row (no instant, no coach clock) and a signed-out member send nothing.
  for (const bad of [{ iso: '2026-10-08', time: '09:00' }, { ...slot, coachTime: null }, { ...slot, at: 0 }, { ...slot, coachDate: '10/08/2026' }]) {
    const m = make();
    await assert.rejects(m.submitConsultationBooking({ coach, role: 'trainer', slot: bad }), /Choose a valid consultation time/);
    assert.equal(m.calls.length, 0, JSON.stringify(bad));
  }
  const out = make({ token: null });
  await assert.rejects(out.submitConsultationBooking({ coach, role: 'trainer', slot }), /Sign in/);
  assert.equal(out.calls.length, 0);

  // The 12-hour clock the route parses.
  for (const [hhmm, want] of [['00:00', '12:00 AM'], ['09:05', '9:05 AM'], ['12:00', '12:00 PM'], ['12:30', '12:30 PM'], ['13:00', '1:00 PM'], ['23:59', '11:59 PM'], ['24:00', ''], ['9', ''], [null, '']]) {
    assert.equal(ok.bookingTime12h(hhmm), want, String(hhmm));
  }
});
