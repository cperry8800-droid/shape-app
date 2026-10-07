// "Protect your time" — the booking rules every surface checks (coach Schedule upgrade, step 3;
// owner-approved 2026-10-07). Drives public/newdesign/bookingRules.mjs, the shipped module, with
// explicit clocks and zones: nothing here reads the machine's clock, and the runtime is pinned to
// a zone none of the fixtures use, so an answer that leaned on the runtime's zone would show.
process.env.TZ = 'Asia/Kathmandu'; // +05:45 — no fixture's zone, and not a whole hour

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as R from '../public/newdesign/bookingRules.mjs';
import { instantInZone, wallClockInZone } from '../src/lib/time.ts';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NY = 'America/New_York';
const Z = (iso) => Date.parse(iso);
const wall = (t, zone) => { const w = wallClockInZone(t, zone); return w && `${w.date} ${w.time}`; };

// Weekly hours, as provider_availability rows: weekday 0=Sun, minutes in the coach's day.
const hours = (days, start, end) => days.map((weekday) => ({ weekday, start_minute: start * 60, duration_min: (end - start) * 60 }));
const WEEKDAYS = [1, 2, 3, 4, 5];
const session = (id, at, durationMin = 60, extra = {}) => ({ id, scheduled_at: at, duration_min: durationMin, status: 'confirmed', ...extra });
// A Monday morning in October, well before the slots below.
const NOW = '2026-10-05T12:00:00Z';
const base = (extra = {}) => ({ now: NOW, zone: NY, availability: hours(WEEKDAYS, 9, 17), busy: [], timeOff: [], rules: {}, ...extra });
const check = (start, durationMin, ctx) => R.checkSlot({ start, durationMin }, ctx);
const reason = (start, durationMin, ctx) => check(start, durationMin, ctx).reason ?? 'ok';

// ── 1 · the zone arithmetic ───────────────────────────────────────────────────────────────

test('wallInstant agrees with src/lib/time.ts on every wall time that happens once, and answers the two it refuses', () => {
  // The parity matrix tests/booking-timezone-parity.test.mjs drives the other three copies over.
  const ZONES = ['UTC', NY, 'America/Los_Angeles', 'America/Sao_Paulo', 'Europe/London', 'Europe/Berlin',
    'Asia/Kolkata', 'Asia/Tokyo', 'Australia/Sydney', 'Australia/Lord_Howe', 'Pacific/Kiritimati',
    'Pacific/Midway', 'Africa/Lagos', 'America/St_Johns'];
  const DATES = ['2026-01-15', '2026-03-08', '2026-03-29', '2026-04-05', '2026-06-21',
    '2026-09-17', '2026-10-04', '2026-10-25', '2026-11-01', '2026-12-31'];
  const MINUTES = [0, 1, 30, 60, 90, 120, 150, 180, 330, 540, 720, 1020, 1410, 1439];
  let same = 0, gaps = 0, repeats = 0;
  for (const zone of ZONES) for (const date of DATES) for (const m of MINUTES) {
    const [y, mo, d] = date.split('-').map(Number);
    const want = `${date} ${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const server = instantInZone(y, mo, d, Math.floor(m / 60), m % 60, zone);
    const mine = R.wallInstant(y, mo, d, m, zone);
    const where = `${zone} ${want}`;
    assert.ok(Number.isFinite(mine), `no answer for ${where}`);
    if (Number.isNaN(server)) {
      // Skipped by the clocks: the answer is the jump — it reads later than asked, a second before it reads earlier.
      assert.ok(wall(mine, zone) > want, `${where}: ${wall(mine, zone)}`);
      assert.ok(wall(mine - 1000, zone) < want, `${where}: not the first moment after the gap`);
      gaps++;
    } else if (mine === server) {
      same++;
    } else {
      // Only a time that happens twice may differ, and then this copy has the FIRST of the two.
      assert.equal(wall(mine, zone), want, where);
      assert.equal(wall(server, zone), want, where);
      assert.ok(mine < server, `${where}: not the first occurrence`);
      repeats++;
    }
  }
  assert.equal(same + gaps + repeats, ZONES.length * DATES.length * MINUTES.length);
  // A sweep that never reached either edge would pass by agreeing on ordinary hours only.
  assert.ok(gaps > 0, 'the matrix never reached a skipped wall time');
  assert.ok(repeats > 0, 'the matrix never reached a repeated wall time');
  assert.ok(same > 1800, `only ${same} ordinary agreements`);
});

test('wallInstant: the jump for a skipped time, the first of a repeated one, and minutes that run into tomorrow', () => {
  // New York, Mar 8 2026: 02:00 EST jumps to 03:00 EDT at 07:00Z.
  assert.equal(R.wallInstant(2026, 3, 8, 150, NY), Z('2026-03-08T07:00:00Z'));
  assert.equal(R.wallInstant(2026, 3, 8, 120, NY), Z('2026-03-08T07:00:00Z'));
  assert.equal(R.wallInstant(2026, 3, 8, 180, NY), Z('2026-03-08T07:00:00Z'), '03:00 EDT is the jump itself');
  // Lord Howe skips half an hour.
  assert.equal(wall(R.wallInstant(2026, 10, 4, 135, 'Australia/Lord_Howe'), 'Australia/Lord_Howe'), '2026-10-04 02:30');
  // 01:30 happens twice in New York on Nov 1, and twice in Berlin's 02:30 on Oct 25: the first, both hemispheres.
  assert.equal(R.wallInstant(2026, 11, 1, 90, NY), Z('2026-11-01T05:30:00Z'));
  assert.equal(R.wallInstant(2026, 10, 25, 150, 'Europe/Berlin'), Z('2026-10-25T00:30:00Z'));
  assert.equal(instantInZone(2026, 10, 25, 2, 30, 'Europe/Berlin'), Z('2026-10-25T01:30:00Z'), 'the two-pass copy lands on the second here — why this copy is not that one');
  // 1440 minutes is the next day's first moment, 1500 its 01:00.
  assert.equal(R.wallInstant(2026, 10, 7, 1440, NY), Z('2026-10-08T04:00:00Z'));
  assert.equal(R.wallInstant(2026, 10, 31, 1500, NY), Z('2026-11-01T05:00:00Z'));
  for (const bad of ['Mars/Olympus', '', null, undefined, 42]) assert.ok(Number.isNaN(R.wallInstant(2026, 10, 7, 540, bad)), String(bad));
  assert.equal(R.isZone(NY), true);
  assert.equal(R.isZone('Area/Nowhere'), false);
  assert.equal(R.localDate(Z('2026-10-08T03:30:00Z'), NY), '2026-10-07', 'the date the coach is on, not UTC\'s');
});

test('toMs reads an instant only when it names its offset', () => {
  assert.equal(R.toMs('2026-10-07T13:00:00Z'), Z('2026-10-07T13:00:00Z'));
  assert.equal(R.toMs('2026-10-07T13:00:00+00:00'), Z('2026-10-07T13:00:00Z'), 'PostgREST\'s spelling');
  assert.equal(R.toMs('2026-10-07 13:00:00+00'), Z('2026-10-07T13:00:00Z'), 'Postgres\'s short offset and space');
  assert.equal(R.toMs('2026-10-07T09:00:00-04:00'), Z('2026-10-07T13:00:00Z'));
  assert.equal(R.toMs('2026-10-07T09:00:00.123456-0400'), Z('2026-10-07T13:00:00.123Z'));
  assert.equal(R.toMs(new Date('2026-10-07T13:00:00Z')), Z('2026-10-07T13:00:00Z'));
  assert.equal(R.toMs(1_800_000_000_000), 1_800_000_000_000);
  // A wall clock with no offset would be read in the RUNTIME's zone (Kathmandu here): refused.
  for (const bad of ['2026-10-07T09:00', '2026-10-07T09:00:00', '2026-10-07', 'soon', '', null, undefined, NaN, {}, true]) {
    assert.ok(Number.isNaN(R.toMs(bad)), JSON.stringify(bad));
  }
});

// ── 2 · open hours ────────────────────────────────────────────────────────────────────────

test('open hours: the whole session must sit inside them', () => {
  const ctx = base({ availability: hours(WEEKDAYS, 9, 12) });
  const rows = [
    ['2026-10-07T13:00:00Z', 60, 'ok', '9:00–10:00 New York'],
    ['2026-10-07T15:00:00Z', 60, 'ok', '11:00–12:00 ends exactly at close'],
    ['2026-10-07T15:30:00Z', 60, 'closed', '11:30–12:30 crosses the window\'s end'],
    ['2026-10-07T12:30:00Z', 60, 'closed', '8:30 starts before opening'],
    ['2026-10-07T07:00:00Z', 30, 'closed', '3:00 AM, the crafted request'],
    ['2026-10-10T13:00:00Z', 60, 'closed', 'Saturday has no hours'],
    ['2026-10-07T09:00:00Z', 60, 'closed', '09:00 UTC is 5:00 AM in New York'],
  ];
  for (const [start, dur, want, why] of rows) assert.equal(reason(start, dur, ctx), want, why);
  assert.equal(check('2026-10-07T15:30:00Z', 60, ctx).message, 'That runs past the end of your open hours at 12:00 PM.');
  assert.equal(check('2026-10-07T07:00:00Z', 30, ctx).message, "That's outside your open hours.");
  assert.equal(check('2026-10-07T07:00:00Z', 30, { ...ctx, audience: 'member' }).message, "That's outside this coach's open hours.");
  assert.equal(check('2026-10-07T13:00:00Z', 60, { ...ctx, availability: [] }).message, "You haven't opened any hours yet.");
});

test('open hours: a session may span two adjacent windows, and blocks that touch at midnight are one evening', () => {
  const ctx = base({ availability: [
    { weekday: 2, start_minute: 540, duration_min: 60 }, // Tue 9–10
    { weekday: 2, start_minute: 600, duration_min: 60 }, // Tue 10–11
    { weekday: 3, start_minute: 540, duration_min: 60 }, // Wed 9–10 alone
    { weekday: 5, start_minute: 1320, duration_min: 120 }, // Fri 22–24
    { weekday: 6, start_minute: 0, duration_min: 60 }, // Sat 0–1
  ] });
  assert.equal(reason('2026-10-06T13:30:00Z', 60, ctx), 'ok', 'Tue 9:30–10:30 spans the seam');
  assert.equal(reason('2026-10-06T14:30:00Z', 60, ctx), 'closed', 'Tue 10:30–11:30 runs past 11');
  assert.equal(reason('2026-10-07T13:30:00Z', 60, ctx), 'closed', 'Wed 9:30–10:30: one window, and it ends at 10');
  assert.equal(reason('2026-10-10T03:30:00Z', 60, ctx), 'ok', 'Fri 11:30 PM – Sat 12:30 AM crosses midnight inside open time');
  assert.equal(reason('2026-10-10T04:30:00Z', 60, ctx), 'closed', 'Sat 12:30–1:30 runs past 1');
  const w = R.openWindows(ctx.availability, NY, Z('2026-10-06T00:00:00Z'), Z('2026-10-07T00:00:00Z'));
  assert.deepEqual(w, [{ start: Z('2026-10-06T13:00:00Z'), end: Z('2026-10-06T15:00:00Z') }], 'the two Tuesday blocks merge');
  // A row with no usable length opens nothing (the column is NOT NULL; this is a corrupt row).
  assert.deepEqual(R.openWindows([{ weekday: 2, start_minute: 540, duration_min: null }, { weekday: 2, start_minute: null, duration_min: 60 }], NY, Z('2026-10-06T00:00:00Z'), Z('2026-10-07T00:00:00Z')), []);
});

test('open hours across the New York fall-back (Nov 1 2026): each end resolved on its own date', () => {
  const ctx = base({ availability: [...hours(WEEKDAYS, 9, 12), { weekday: 0, start_minute: 0, duration_min: 240 }] });
  // 9:00 on the Friday before is 13:00Z; on the Monday after it is 14:00Z.
  assert.equal(reason('2026-10-30T13:00:00Z', 60, ctx), 'ok');
  assert.equal(reason('2026-11-02T13:00:00Z', 60, ctx), 'closed', '13:00Z is 8:00 AM EST');
  assert.equal(reason('2026-11-02T14:00:00Z', 60, ctx), 'ok');
  assert.equal(reason('2026-11-02T16:00:00Z', 60, ctx), 'ok', '11:00–12:00 EST');
  assert.equal(reason('2026-11-02T17:00:00Z', 60, ctx), 'closed');
  // Sunday 00:00–04:00 on the change night is FIVE real hours, 04:00Z → 09:00Z.
  assert.equal(reason('2026-11-01T08:00:00Z', 60, ctx), 'ok', '3:00–4:00 EST is inside; start + 240 min would have closed at 08:00Z');
  assert.equal(reason('2026-11-01T09:00:00Z', 60, ctx), 'closed');
  const slots = R.openSlots({ from: '2026-11-01T00:00:00Z', to: '2026-11-01T12:00:00Z', durationMin: 60, step: 60 }, ctx);
  assert.deepEqual(slots, ['04:00', '05:00', '06:00', '07:00', '08:00'].map((h) => `2026-11-01T${h}:00.000Z`), 'midnight, 1 EDT, 1 EST, 2 and 3');
});

test('open hours across the New York spring-forward (Mar 8 2026): the skipped hour is not open time', () => {
  const ctx = base({ now: '2026-03-01T00:00:00Z', availability: [
    { weekday: 0, start_minute: 60, duration_min: 180 }, // Sun 1:00–4:00 — two real hours that night
  ] });
  assert.equal(reason('2026-03-08T06:00:00Z', 120, ctx), 'ok', '1:00 EST – 4:00 EDT');
  assert.equal(reason('2026-03-08T06:00:00Z', 150, ctx), 'closed', 'a third hour does not exist');
  assert.equal(reason('2026-03-15T05:00:00Z', 180, ctx), 'ok', 'the next Sunday has all three hours, 1:00–4:00 EDT');
  // A window that STARTS in the skipped hour opens at the jump.
  const gapStart = base({ now: '2026-03-01T00:00:00Z', availability: [{ weekday: 0, start_minute: 150, duration_min: 150 }] });
  assert.deepEqual(R.openWindows(gapStart.availability, NY, Z('2026-03-08T00:00:00Z'), Z('2026-03-09T00:00:00Z')),
    [{ start: Z('2026-03-08T07:00:00Z'), end: Z('2026-03-08T09:00:00Z') }], '2:30–5:00 that night is 3:00–5:00 EDT');
});

test('a coach with no stored zone has no bookable time, and the message says why', () => {
  for (const zone of [null, undefined, '', 'Mars/Olympus']) {
    const ctx = base({ zone });
    const r = check('2026-10-07T13:00:00Z', 60, ctx);
    assert.equal(r.reason, 'closed', String(zone));
    assert.match(r.message, /time zone/);
    assert.equal(check('2026-10-07T13:00:00Z', 60, { ...ctx, audience: 'member' }).message, "This coach's calendar isn't ready for bookings yet.");
    assert.deepEqual(R.openSlots({ from: '2026-10-06T00:00:00Z', to: '2026-10-09T00:00:00Z', durationMin: 60 }, ctx), []);
  }
});

// ── 3 · past and notice ───────────────────────────────────────────────────────────────────

test('past and minimum notice', () => {
  const ctx = base({ now: '2026-10-07T13:00:00Z', rules: { minNoticeHours: 12 } });
  assert.equal(reason('2026-10-07T13:00:00Z', 60, ctx), 'past', 'now itself has passed');
  assert.equal(reason('2026-10-07T12:00:00Z', 60, ctx), 'past');
  assert.equal(reason('2026-10-08T00:45:00Z', 60, ctx), 'notice', '11h45 ahead');
  assert.equal(reason('2026-10-08T13:00:00Z', 60, ctx), 'ok', '24 h ahead, inside hours');
  // Notice is measured from now, to the minute — and snake_case rules (a stored row) read too.
  const tight = base({ now: '2026-10-07T02:00:00Z', rules: { min_notice_hours: 12 } });
  assert.equal(reason('2026-10-07T13:30:00Z', 60, tight), 'notice', '11.5 h ahead');
  assert.equal(reason('2026-10-07T14:00:00Z', 60, tight), 'ok', 'exactly 12 h ahead');
  assert.equal(check('2026-10-07T13:30:00Z', 60, tight).message, "That's less than your 12 hours' minimum notice.");
  assert.equal(check('2026-10-07T13:30:00Z', 60, { ...tight, audience: 'member' }).message, "This coach needs at least 12 hours' notice. Pick a later time.");
  assert.equal(reason('2026-10-07T13:30:00Z', 60, { ...tight, rules: { minNoticeHours: 1 } }), 'ok', 'an hour\'s notice is met');
  assert.equal(check('2026-10-08T13:00:00Z', 60, { ...tight, rules: { minNoticeHours: 48 } }).message, "That's less than your 2 days' minimum notice.");
  assert.equal(check('2026-10-07T13:30:00Z', 60, { ...tight, now: '2026-10-07T13:00:00Z', rules: { minNoticeHours: 1 } }).message, "That's less than your 1 hour's minimum notice.");
  // No `now` given: neither rule can be judged, so neither refuses (the caller supplies the clock).
  assert.equal(reason('2026-10-07T13:00:00Z', 60, base({ now: undefined, rules: { minNoticeHours: 12 } })), 'ok');
});

// ── 4 · time off, overlap, buffer ─────────────────────────────────────────────────────────

test('time off closes any slot it touches, partially or wholly', () => {
  const off = { starts_at: '2026-10-07T15:00:00+00:00', ends_at: '2026-10-07T17:00:00+00:00', note: 'Dentist' }; // 11:00–1:00 NY
  const ctx = base({ timeOff: [off] });
  assert.equal(reason('2026-10-07T14:30:00Z', 60, ctx), 'time_off', '10:30–11:30 runs into it');
  assert.equal(reason('2026-10-07T16:30:00Z', 60, ctx), 'time_off', '12:30–1:30 starts inside it');
  assert.equal(reason('2026-10-07T15:00:00Z', 30, ctx), 'time_off');
  assert.equal(reason('2026-10-07T14:00:00Z', 60, ctx), 'ok', '10:00–11:00 ends as it starts');
  assert.equal(reason('2026-10-07T17:00:00Z', 60, ctx), 'ok', '1:00–2:00 starts as it ends');
  assert.equal(check('2026-10-07T15:00:00Z', 30, ctx).message, "That's during your time off, which runs until Wed, Oct 7 at 1:00 PM.");
  const member = check('2026-10-07T15:00:00Z', 30, { ...ctx, audience: 'member' }).message;
  assert.equal(member, 'This coach is away then.');
  assert.ok(!member.includes('Dentist'), 'the note is never in a message');
  // A provider_busy_blocks row carries the same block as kind 'time_off'.
  const viaRpc = base({ busy: [{ starts_at: off.starts_at, ends_at: off.ends_at, kind: 'time_off' }] });
  assert.equal(reason('2026-10-07T14:30:00Z', 60, viaRpc), 'time_off');
  // A whole week off.
  const week = base({ timeOff: [{ startsAt: '2026-10-12T04:00:00Z', endsAt: '2026-10-19T04:00:00Z' }] });
  assert.equal(reason('2026-10-14T13:00:00Z', 60, week), 'time_off');
  assert.equal(reason('2026-10-19T13:00:00Z', 60, week), 'ok');
});

test('overlap with an active session, the session being moved excepted', () => {
  const ctx = base({ busy: [
    session('s-1', '2026-10-07T14:00:00+00:00', 60), // 10:00–11:00
    session('s-2', '2026-10-07T18:00:00+00:00', 60, { status: 'cancelled' }),
    session('s-3', '2026-10-07T19:00:00+00:00', 60, { status: 'requested' }),
  ] });
  assert.equal(reason('2026-10-07T14:30:00Z', 60, ctx), 'overlap');
  assert.equal(reason('2026-10-07T13:30:00Z', 45, ctx), 'overlap', '9:30–10:15 runs into it');
  assert.equal(reason('2026-10-07T14:15:00Z', 15, ctx), 'overlap', 'a 15-minute consult inside an hour — the start-instant index lets this through today');
  assert.equal(reason('2026-10-07T18:00:00Z', 60, ctx), 'ok', 'a cancelled session holds no time');
  assert.equal(reason('2026-10-07T19:30:00Z', 30, ctx), 'overlap', 'a request holds its time');
  assert.equal(check('2026-10-07T14:30:00Z', 60, ctx).message, 'That overlaps your 10:00 AM session.');
  assert.equal(check('2026-10-07T14:30:00Z', 60, { ...ctx, audience: 'member' }).message, 'That time is already booked.');
  // Reschedule: moving s-1 half an hour later is not a clash with itself.
  assert.equal(reason('2026-10-07T14:30:00Z', 60, { ...ctx, ignoreId: 's-1' }), 'ok');
  assert.equal(reason('2026-10-07T19:00:00Z', 60, { ...ctx, ignoreId: 's-1' }), 'overlap', 'but it still clashes with others');
  // A busy row with no length blocks an hour rather than nothing.
  assert.equal(reason('2026-10-07T14:45:00Z', 15, base({ busy: [{ scheduled_at: '2026-10-07T14:00:00Z' }] })), 'overlap');
});

test('buffer before and after a session', () => {
  const ctx = base({ busy: [session('s-1', '2026-10-07T14:00:00Z', 60)], rules: { bufferMin: 15 } }); // 10:00–11:00
  const rows = [
    ['2026-10-07T15:00:00Z', 30, 'buffer', 'back to back after'],
    ['2026-10-07T15:10:00Z', 30, 'buffer', '10 minutes after'],
    ['2026-10-07T15:15:00Z', 30, 'ok', 'exactly the buffer after'],
    ['2026-10-07T13:30:00Z', 30, 'buffer', 'back to back before (9:30–10:00)'],
    ['2026-10-07T13:15:00Z', 35, 'buffer', '10 minutes before'],
    ['2026-10-07T13:15:00Z', 30, 'ok', 'exactly the buffer before'],
  ];
  for (const [start, dur, want, why] of rows) assert.equal(reason(start, dur, ctx), want, why);
  assert.equal(check('2026-10-07T15:10:00Z', 30, ctx).message, "That's inside your 15-minute buffer after the 10:00 AM session.");
  assert.equal(check('2026-10-07T13:30:00Z', 30, ctx).message, "That's inside your 15-minute buffer before the 10:00 AM session.");
  assert.equal(check('2026-10-07T13:30:00Z', 30, { ...ctx, audience: 'member' }).message, "That's too close to another of this coach's sessions.");
  assert.equal(reason('2026-10-07T15:00:00Z', 30, { ...ctx, rules: {} }), 'ok', 'no buffer, back to back is fine');
  assert.equal(reason('2026-10-07T14:15:00Z', 60, { ...ctx, ignoreId: 's-1' }), 'ok', 'the moved session is not its own neighbour');
});

// ── 5 · the daily limit, by the coach's local date ───────────────────────────────────────

test('the daily limit counts sessions on the slot\'s LOCAL date: an 11:30 PM session is that day\'s', () => {
  // 23:30 New York on Wed Oct 7 is 03:30Z on Thu Oct 8.
  const late = session('late', '2026-10-08T03:30:00Z', 30);
  const ctx = base({ availability: hours([3, 4], 9, 24), busy: [late], rules: { maxPerDay: 1 } });
  assert.equal(reason('2026-10-07T13:00:00Z', 60, ctx), 'daily_limit', 'Wed 9:00 — Wednesday already has its one');
  assert.equal(reason('2026-10-08T13:00:00Z', 60, ctx), 'ok', 'Thu 9:00 — Thursday has none, whatever the UTC date of the late one');
  assert.equal(check('2026-10-07T13:00:00Z', 60, ctx).message, 'You already have 1 session on Wed, Oct 7, your daily limit.');
  assert.equal(check('2026-10-07T13:00:00Z', 60, { ...ctx, audience: 'member' }).message, 'This coach is fully booked that day.');
  // A slot at 11:00 PM is on its own date too.
  const two = base({ availability: hours([3, 4], 9, 24), busy: [session('a', '2026-10-08T13:00:00Z', 30), session('b', '2026-10-08T15:00:00Z', 30)], rules: { maxPerDay: 2 } });
  assert.equal(reason('2026-10-08T03:00:00Z', 30, two), 'ok', 'Wed 11:00 PM is Wednesday, which has none');
  assert.equal(reason('2026-10-08T17:00:00Z', 30, two), 'daily_limit', 'Thursday is full');
  assert.equal(check('2026-10-08T17:00:00Z', 30, two).message, 'You already have 2 sessions on Thu, Oct 8, your daily limit.');
  // Rescheduling within a full day frees its own place; cancelled sessions do not count.
  assert.equal(reason('2026-10-08T17:00:00Z', 30, { ...two, ignoreId: 'a' }), 'ok');
  assert.equal(reason('2026-10-08T17:00:00Z', 30, { ...two, busy: [...two.busy.slice(0, 1), { ...two.busy[1], status: 'cancelled' }] }), 'ok');
  assert.equal(reason('2026-10-08T17:00:00Z', 30, { ...two, rules: {} }), 'ok', 'no limit');
});

test('precedence: one refusal, the first that applies; slotProblems lists them all; skip drops a rule', () => {
  const ctx = base({
    now: '2026-10-07T00:00:00Z', // 8:00 PM the evening before
    busy: [session('s-1', '2026-10-07T14:00:00Z', 60)],
    timeOff: [{ starts_at: '2026-10-07T07:00:00Z', ends_at: '2026-10-07T08:00:00Z' }],
    rules: { bufferMin: 15, maxPerDay: 1, minNoticeHours: 12 },
  });
  // 3:30–4:00 AM: notice, closed, time off and the day's limit all apply.
  const start = '2026-10-07T07:30:00Z';
  assert.equal(reason(start, 30, ctx), 'notice');
  assert.deepEqual(R.slotProblems({ start, durationMin: 30 }, ctx).map((p) => p.reason), ['notice', 'closed', 'time_off', 'daily_limit']);
  assert.deepEqual(R.slotProblems({ start: '2026-10-07T14:30:00Z', durationMin: 60 }, { ...ctx, now: NOW }).map((p) => p.reason), ['overlap', 'daily_limit']);
  // A coach moving their own booking may waive notice and keep the rest.
  assert.equal(reason(start, 30, { ...ctx, skip: ['notice'] }), 'closed');
  assert.deepEqual(R.slotProblems({ start: '2026-10-07T13:30:00Z', durationMin: 20 }, { ...ctx, now: NOW }).map((p) => p.reason), ['buffer', 'daily_limit']);
  assert.deepEqual(R.slotProblems({ start: '2026-10-07T13:30:00Z', durationMin: 20 }, { ...ctx, now: NOW, ignoreId: 's-1' }), []);
  assert.deepEqual(R.REASONS, ['invalid', 'past', 'notice', 'closed', 'time_off', 'overlap', 'buffer', 'daily_limit']);
});

test('an unusable slot is `invalid`, never bookable', () => {
  const ctx = base();
  for (const [start, dur] of [['2026-10-07T13:00', 60], ['nonsense', 60], ['2026-10-07T13:00:00Z', 0], ['2026-10-07T13:00:00Z', -30], ['2026-10-07T13:00:00Z', 1441], ['2026-10-07T13:00:00Z', null], [null, 60]]) {
    const r = check(start, dur, ctx);
    assert.equal(r.ok, false, `${start} ${dur}`);
    assert.equal(r.reason, 'invalid', `${start} ${dur}`);
    assert.deepEqual(R.slotProblems({ start, durationMin: dur }, ctx).map((p) => p.reason), ['invalid']);
  }
  assert.equal(check('2026-10-07T13:00:00Z', 60, ctx).ok, true);
});

// ── 6 · open slots ────────────────────────────────────────────────────────────────────────

test('openSlots offers exactly the starts checkSlot accepts, soonest first', () => {
  const ctx = base({
    now: '2026-10-06T20:00:00Z',
    availability: [...hours(WEEKDAYS, 9, 12), ...hours([2, 4], 13, 15)],
    busy: [session('s-1', '2026-10-07T14:00:00Z', 60), session('s-2', '2026-10-08T03:30:00Z', 30)],
    timeOff: [{ starts_at: '2026-10-08T17:00:00Z', ends_at: '2026-10-08T23:00:00Z' }],
    rules: { bufferMin: 15, maxPerDay: 3, minNoticeHours: 12 },
  });
  const from = '2026-10-06T00:00:00Z', to = '2026-10-10T00:00:00Z';
  const got = R.openSlots({ from, to, durationMin: 45 }, ctx);
  assert.ok(got.length > 10, `${got.length}`);
  assert.deepEqual(got, [...got].sort(), 'soonest first');
  // Brute force over every 15-minute start in the range: the two must agree exactly.
  const want = [];
  for (let t = Z(from); t < Z(to); t += 15 * 60_000) if (check(new Date(t).toISOString(), 45, ctx).ok) want.push(new Date(t).toISOString());
  assert.deepEqual(got, want);
  // Wednesday around the 10:00 session, with a 15-minute buffer: 9:00–9:45 leaves exactly the
  // buffer and is offered, 9:15 is not, 11:00 is not, 11:15 is. Thursday afternoon is time off.
  assert.ok(got.includes('2026-10-07T13:00:00.000Z'));
  assert.ok(!got.includes('2026-10-07T13:15:00.000Z'));
  assert.ok(!got.includes('2026-10-07T15:00:00.000Z'));
  assert.ok(got.includes('2026-10-07T15:15:00.000Z'));
  assert.ok(!got.some((s) => s >= '2026-10-08T17:00:00.000Z' && s < '2026-10-08T23:00:00.000Z'));
  assert.ok(!got.some((s) => s < '2026-10-07T08:00:00.000Z'), '12 hours\' notice from Tuesday 4:00 PM closes Tuesday');
});

test('openSlots is bounded: a step, a limit, a 62-day window, and nonsense refused', () => {
  const ctx = base({ now: '2026-01-01T00:00:00Z', availability: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_minute: 0, duration_min: 1440 })) });
  const day = R.openSlots({ from: '2026-01-05T05:00:00Z', to: '2026-01-06T05:00:00Z', durationMin: 30, step: 30 }, ctx);
  assert.equal(day.length, 48, 'a 24-hour day at 30-minute steps');
  assert.equal(R.openSlots({ from: '2026-01-05T05:00:00Z', to: '2026-01-06T05:00:00Z', durationMin: 30 }, ctx).length, 96, 'step defaults to 15');
  assert.equal(R.openSlots({ from: '2026-01-05T05:00:00Z', to: '2026-01-06T05:00:00Z', durationMin: 30, limit: 7 }, ctx).length, 7);
  const year = R.openSlots({ from: '2026-01-01T05:00:00Z', to: '2027-01-01T05:00:00Z', durationMin: 60, step: 240, limit: 2000 }, ctx);
  assert.ok(year.length > 0 && Z(year[year.length - 1]) < Z('2026-01-01T05:00:00Z') + R.MAX_WINDOW_DAYS * 86_400_000, 'cut at 62 days');
  assert.ok(R.openSlots({ from: '2026-01-01T05:00:00Z', to: '2027-01-01T05:00:00Z', durationMin: 15, step: 5, limit: 99999 }, ctx).length <= R.MAX_SLOTS);
  for (const bad of [
    { from: '2026-01-06T05:00:00Z', to: '2026-01-05T05:00:00Z', durationMin: 30 },
    { from: '2026-01-05T05:00', to: '2026-01-06T05:00:00Z', durationMin: 30 },
    { from: '2026-01-05T05:00:00Z', to: '2026-01-06T05:00:00Z', durationMin: 0 },
    { from: '2026-01-05T05:00:00Z', to: '2026-01-06T05:00:00Z', durationMin: 2.5 },
    null,
  ]) assert.deepEqual(R.openSlots(bad, ctx), [], JSON.stringify(bad));
});

// ── 7 · rules and time off as the routes store them ───────────────────────────────────────

test('rules: the read side clamps, the write side refuses, and both match the database CHECKs', () => {
  assert.deepEqual(R.normalizeRules(null), { bufferMin: 0, maxPerDay: null, minNoticeHours: 0 });
  assert.deepEqual(R.normalizeRules({ buffer_min: 15, max_per_day: 6, min_notice_hours: 12 }), { bufferMin: 15, maxPerDay: 6, minNoticeHours: 12 });
  assert.deepEqual(R.normalizeRules({ buffer_min: 500, max_per_day: 99, min_notice_hours: -4 }), { bufferMin: 120, maxPerDay: 24, minNoticeHours: 0 });
  assert.equal(R.normalizeRules({ max_per_day: 0 }).maxPerDay, null, 'a stored 0 is no limit, not a closed calendar');
  assert.equal(R.normalizeRules({ maxPerDay: '' }).maxPerDay, null);
  const ok = R.validateRules({ bufferMin: 15, maxPerDay: '6', minNoticeHours: 0 });
  assert.deepEqual(ok, { ok: true, rules: { bufferMin: 15, maxPerDay: 6, minNoticeHours: 0 } });
  assert.deepEqual(R.validateRules({ maxPerDay: null }, { max_per_day: 4, buffer_min: 10 }), { ok: true, rules: { bufferMin: 10, maxPerDay: null, minNoticeHours: 0 } }, 'merged over the stored row');
  for (const [input, field] of [
    [{ bufferMin: 121 }, 'bufferMin'], [{ bufferMin: -1 }, 'bufferMin'], [{ bufferMin: 7.5 }, 'bufferMin'], [{ bufferMin: 'ten' }, 'bufferMin'],
    [{ maxPerDay: 0 }, 'maxPerDay'], [{ maxPerDay: 25 }, 'maxPerDay'], [{ maxPerDay: true }, 'maxPerDay'],
    [{ minNoticeHours: 337 }, 'minNoticeHours'], [{ minNoticeHours: null }, 'minNoticeHours'],
  ]) {
    const r = R.validateRules(input);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.equal(r.field, field, JSON.stringify(input));
    assert.ok(r.error.length > 20);
  }
  // The migration's CHECK constraints state the same ranges.
  const sql = readFileSync(join(ROOT, 'supabase-migrations/2026-10-07-booking-rules-time-off.sql'), 'utf8');
  const L = R.RULE_LIMITS;
  assert.match(sql, new RegExp(`check \\(buffer_min between ${L.bufferMin.min} and ${L.bufferMin.max}\\)`));
  assert.match(sql, new RegExp(`check \\(max_per_day is null or max_per_day between ${L.maxPerDay.min} and ${L.maxPerDay.max}\\)`));
  assert.match(sql, new RegExp(`check \\(min_notice_hours between ${L.minNoticeHours.min} and ${L.minNoticeHours.max}\\)`));
  assert.match(sql, new RegExp(`char_length\\(note\\) <= ${R.TIME_OFF_NOTE_MAX}\\)`));
});

test('parseTimeOff: instants with offsets, whole days in the coach\'s zone, and the limits', () => {
  const now = '2026-10-07T12:00:00Z';
  const opts = { zone: NY, now };
  assert.deepEqual(R.parseTimeOff({ startsAt: '2026-10-09T17:00:00Z', endsAt: '2026-10-09T21:00:00-04:00', note: '  Recital  ' }, opts),
    { ok: true, startsAt: Z('2026-10-09T17:00:00Z'), endsAt: Z('2026-10-10T01:00:00Z'), note: 'Recital' });
  // One whole day — Nov 1 in New York is 25 hours long.
  const fall = R.parseTimeOff({ date: '2026-11-01', allDay: true }, opts);
  assert.deepEqual([fall.startsAt, fall.endsAt], [Z('2026-11-01T04:00:00Z'), Z('2026-11-02T05:00:00Z')]);
  assert.equal((fall.endsAt - fall.startsAt) / 3_600_000, 25);
  // A range, both ends inclusive.
  const week = R.parseTimeOff({ fromDate: '2026-10-12', toDate: '2026-10-18' }, opts);
  assert.deepEqual([week.startsAt, week.endsAt], [Z('2026-10-12T04:00:00Z'), Z('2026-10-19T04:00:00Z')]);
  assert.deepEqual(R.localDayRange('2026-10-12', '2026-10-18', NY), { startsAt: week.startsAt, endsAt: week.endsAt });
  // 90 days is allowed across a DST change; 91 is not.
  assert.equal(R.parseTimeOff({ fromDate: '2026-10-12', toDate: '2027-01-09' }, opts).ok, true, '90 days, across November');
  assert.match(R.parseTimeOff({ fromDate: '2026-10-12', toDate: '2027-01-10' }, opts).detail, /at most 90 days/);
  assert.equal(R.parseTimeOff({ startsAt: '2026-10-12T00:00:00Z', endsAt: '2027-01-10T00:00:00Z' }, opts).ok, true, '90 × 24 h exactly');
  assert.equal(R.parseTimeOff({ startsAt: '2026-10-12T00:00:00Z', endsAt: '2027-01-10T00:00:01Z' }, opts).ok, false);
  const refused = [
    [{ startsAt: '2026-10-09T17:00:00Z', endsAt: '2026-10-09T17:00:00Z' }, 'invalid_time_off', /end after it starts/],
    [{ startsAt: '2026-10-09T17:00:00Z', endsAt: '2026-10-09T16:00:00Z' }, 'invalid_time_off', /end after it starts/],
    [{ startsAt: '2026-10-09T09:00', endsAt: '2026-10-09T17:00' }, 'invalid_time_off', /time zone/],
    [{ startsAt: Z('2026-10-09T17:00:00Z'), endsAt: Z('2026-10-09T18:00:00Z') }, 'invalid_time_off', /time zone/],
    [{ fromDate: '2026-10-18', toDate: '2026-10-12' }, 'invalid_time_off', /end after it starts/],
    [{ date: '2026-02-30', allDay: true }, 'invalid_time_off', /real date/],
    [{ startsAt: '2026-10-01T00:00:00Z', endsAt: '2026-10-02T00:00:00Z' }, 'invalid_time_off', /already ended/],
    [{ startsAt: '2026-10-09T17:00:00Z', endsAt: '2026-10-09T18:00:00Z', note: 'x'.repeat(501) }, 'invalid_time_off', /under 500/],
    [{ startsAt: '2026-10-09T17:00:00Z', endsAt: '2026-10-09T18:00:00Z', note: 42 }, 'invalid_time_off', /text/],
    [{}, 'invalid_time_off', /start and an end/],
  ];
  for (const [input, error, detail] of refused) {
    const r = R.parseTimeOff(input, opts);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.equal(r.error, error, JSON.stringify(input));
    assert.match(r.detail, detail, JSON.stringify(input));
  }
  // Whole days need the coach's zone; instants do not.
  const noZone = R.parseTimeOff({ date: '2026-10-12', allDay: true }, { zone: null, now });
  assert.equal(noZone.error, 'timezone_required');
  assert.equal(R.parseTimeOff({ startsAt: '2026-10-09T17:00:00Z', endsAt: '2026-10-09T18:00:00Z' }, { zone: null, now }).ok, true);
  assert.equal(R.parseTimeOff({ startsAt: '2026-10-09T17:00:00Z', endsAt: '2026-10-09T18:00:00Z', note: '   ' }, opts).note, null);
});
