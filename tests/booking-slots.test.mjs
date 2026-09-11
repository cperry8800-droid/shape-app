// Booking slots — the member's side of R20 (review 2026-09-09).
//
// ⚠ "BOOK SESSION" ON THE CLIENT TEAM PAGE USED TO OPEN THE CHAT. Not a dead control but
// a MISLABELLED one: a member tapped a button that named an outcome and got a different
// one, with nothing saying the booking had not happened.
//
// Everything here DRIVES the shipped module rather than matching its source, because the
// interesting rules are all arithmetic about instants — the one thing a regex cannot see.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const B = require_('../public/newdesign/bookingSlots.js');
const TEAM = readFileSync(new URL('../public/newdesign/clientTeam.jsx', import.meta.url), 'utf8');

const MON = new Date('2026-09-14T12:00:00Z');   // a Monday, midday UTC
const THU = 4;

// ⚠ RUN IN A CHILD PROCESS PER ZONE. V8 caches the timezone, so re-assigning
// `process.env.TZ` mid-run does not reliably move it — a guard that thinks it changed
// zone and did not is a guard that tested UTC four times. This is not a hypothetical
// here: the FIRST version of the UTC assertion below passed with the construction
// changed to LOCAL time, because the test process (and CI) run in UTC, where the two are
// identical. The single most load-bearing rule in this module had a vacuous guard.
const MOD = fileURLToPath(new URL('../public/newdesign/bookingSlots.js', import.meta.url));
function inZone(tz, expr) {
  const out = execFileSync(process.execPath, ['-e',
    'const B=require(' + JSON.stringify(MOD) + ');process.stdout.write(JSON.stringify(' + expr + '))'],
    { env: { ...process.env, TZ: tz }, encoding: 'utf8' });
  return JSON.parse(out);
}

test('the instant is UTC in every zone, not the runner\u2019s local time', () => {
  // consultation.html builds `new Date(Date.UTC(y, mo-1, d, h, mi))` and /api/availability
  // answers `booked` with the raw scheduled_at. Spell the instant any other way and this
  // surface cannot see what that one booked.
  for (const tz of ['UTC', 'America/New_York', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Kolkata']) {
    assert.equal(inZone(tz, 'B.isoForSlot("2026-09-17", 540)'), '2026-09-17T09:00:00.000Z',
      'isoForSlot drifted with the runner timezone (' + tz + ')');
    // and the whole projection with it — a local-time build shifts every slot AND its
    // weekday, so the window silently offers different days east and west of UTC
    assert.deepEqual(
      inZone(tz, 'B.buildSlots({slots:[{weekday:4,start_minute:360,duration_min:120}],booked:[],now:new Date("2026-09-14T12:00:00Z"),days:7,sessionMin:60}).map(s=>s.iso)'),
      ['2026-09-17T06:00:00.000Z', '2026-09-17T07:00:00.000Z'],
      'the projection drifted with the runner timezone (' + tz + ')');
  }

  // ⚠ AND A `now` THAT STRADDLES UTC MIDNIGHT, because the first version of this guard
  // used midday UTC — where the local and UTC calendar dates agree in every zone tested,
  // so swapping `getUTCDay` for `getDay`, or the UTC date parts for local ones, SURVIVED.
  // At 23:00Z it is already tomorrow in Sydney and still today in Los Angeles, which is
  // the only shape that separates the two. The window must not depend on the viewer's
  // zone AT ALL: the same coach pattern is the same set of instants everywhere.
  const boundary = 'B.buildSlots({slots:[{weekday:1,start_minute:60,duration_min:60},{weekday:2,start_minute:60,duration_min:60}],booked:[],now:new Date("2026-09-14T23:00:00Z"),days:3,sessionMin:60}).map(s=>s.iso)';
  for (const tz of ['UTC', 'America/Los_Angeles', 'Australia/Sydney', 'Asia/Kolkata', 'Pacific/Kiritimati']) {
    assert.deepEqual(inZone(tz, boundary), ['2026-09-15T01:00:00.000Z'],
      'the window changed shape in ' + tz + ' — it is reading local calendar days');
  }
});

test('the instant is built the way the rest of the booking chain builds it', () => {
  // ⚠ THIS IS THE LOAD-BEARING ONE. consultation.html's isoForSlot is
  // `new Date(Date.UTC(y, mo-1, d, h, mi)).toISOString()`, and /api/availability answers
  // `booked` with the raw scheduled_at of every requested/confirmed row. Build the
  // instant any other way and this surface cannot see what that one booked.
  assert.equal(B.isoForSlot('2026-09-17', 540), '2026-09-17T09:00:00.000Z');
  assert.equal(B.isoForSlot('2026-09-17', 0), '2026-09-17T00:00:00.000Z');
  assert.equal(B.isoForSlot('2026-09-17', 1439), '2026-09-17T23:59:00.000Z');
  // refused rather than guessed at
  assert.equal(B.isoForSlot('2026-09-17', 1440), null);
  assert.equal(B.isoForSlot('2026-09-17', -1), null);
  assert.equal(B.isoForSlot('not-a-date', 540), null);
  assert.equal(B.isoForSlot('2026-09-17', null), null);
});

test('a collapsed block becomes every whole hour that fits inside it', () => {
  // The coach's editor collapses contiguous hour cells into ONE row: 6a·7a·8a·9a is
  // stored as {start 360, duration 240}. consultation.html offers only `start_minute`,
  // so three quarters of the coach's declared hours were unbookable.
  const out = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 240 }],
    booked: [], now: MON, days: 7, sessionMin: 60,
  });
  assert.deepEqual(out.map((s) => s.iso), [
    '2026-09-17T06:00:00.000Z', '2026-09-17T07:00:00.000Z',
    '2026-09-17T08:00:00.000Z', '2026-09-17T09:00:00.000Z',
  ]);
  // ⚠ AND IT NEVER RUNS PAST THE HOURS THE COACH SET. A 90-minute block at 6a holds one
  // 60-minute session, not two — offering 7:00 would book half an hour the coach never
  // opened.
  const tight = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 90 }],
    booked: [], now: MON, days: 7, sessionMin: 60,
  });
  assert.deepEqual(tight.map((s) => s.iso), ['2026-09-17T06:00:00.000Z']);
  // A block SHORTER than a session still offers its own start: the coach declared it,
  // and dropping it silently would lose every 15- and 30-minute slot in the table.
  const short = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 15 }],
    booked: [], now: MON, days: 7, sessionMin: 60,
  });
  assert.deepEqual(short.map((s) => s.iso), ['2026-09-17T06:00:00.000Z']);
});

test('a taken slot is matched on the INSTANT, not on the spelling', () => {
  // ⚠ Postgres hands back `+00:00` where this builds `.000Z` — the same moment, two
  // spellings. A Set of raw strings misses it and the slot is offered to a second member,
  // after which the database's own partial unique index is the first thing that notices.
  const out = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 240 }],
    booked: ['2026-09-17T08:00:00+00:00'], now: MON, days: 7, sessionMin: 60,
  });
  assert.ok(!out.some((s) => s.ms === Date.parse('2026-09-17T08:00:00Z')), 'a booked slot was offered');
  assert.equal(out.length, 3);
  // an unparseable entry in `booked` must not take an unrelated slot with it
  const noisy = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 240 }],
    booked: [null, '', 'whenever', undefined], now: MON, days: 7, sessionMin: 60,
  });
  assert.equal(noisy.length, 4);
});

test('a slot in the past is not open, and the window is honoured', () => {
  const noon = new Date('2026-09-17T12:00:00Z');   // a Thursday
  const out = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 240 },   // 6a–10a, all past
            { weekday: THU, start_minute: 1020, duration_min: 60 }],  // 5p, still ahead
    booked: [], now: noon, days: 1, sessionMin: 60,
  });
  assert.deepEqual(out.map((s) => s.iso), ['2026-09-17T17:00:00.000Z']);
  // days=1 means today only — next Thursday is outside it
  assert.ok(out.every((s) => s.ms < noon.getTime() + 86400000));
});

test('overlapping blocks never offer the same instant twice', () => {
  const out = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 240 },
            { weekday: THU, start_minute: 420, duration_min: 120 }],
    booked: [], now: MON, days: 7, sessionMin: 60,
  });
  assert.equal(new Set(out.map((s) => s.ms)).size, out.length, 'a duplicate instant was offered');
  assert.deepEqual(out.map((s) => s.ms), out.map((s) => s.ms).slice().sort((a, b) => a - b), 'not in time order');
});

test('a coach with no pattern, or an unusable one, yields nothing rather than a day of slots', () => {
  assert.deepEqual(B.buildSlots({ slots: [], booked: [], now: MON, days: 7 }), []);
  assert.deepEqual(B.buildSlots({ slots: null, booked: [], now: MON, days: 7 }), []);
  assert.deepEqual(B.buildSlots({ now: MON }), []);
  // a weekday outside 0–6 is not a day
  assert.deepEqual(B.buildSlots({ slots: [{ weekday: 9, start_minute: 360, duration_min: 60 }], now: MON, days: 7 }), []);
  assert.deepEqual(B.buildSlots({ slots: [{ weekday: null, start_minute: 360, duration_min: 60 }], now: MON, days: 7 }), []);
  // and an unreadable clock produces no claims at all.
  // ⚠ THE EARLY RETURN FOR THIS IS A FAST PATH, NOT THE GUARD — measured, not assumed:
  // deleting it still yields [], because `now + i*DAY_MS` is then NaN, `utcDateStr` hands
  // back null and every day is skipped. Recorded because a mutation that survives is only
  // acceptable when it is PROVEN to be a no-op; the behaviour below is what is pinned.
  assert.deepEqual(B.buildSlots({ slots: [{ weekday: THU, start_minute: 360, duration_min: 60 }], now: NaN, days: 7 }), []);
  assert.deepEqual(B.buildSlots({ slots: [{ weekday: THU, start_minute: 360, duration_min: 60 }], now: 'whenever', days: 7 }), []);
});

test('the label is the REAL instant in the viewer’s zone, never the stored minute', () => {
  // ⚠ THE WHOLE POINT. `start_minute` is a bare wall clock with no timezone — the coach
  // toggles "9a" and 540 is stored — and the chain reads it as 09:00Z. So the string
  // "9:00 AM" is the coach's intent, not an instant: in New York that session is at 5am.
  // A member must be shown the time they will actually be on the call.
  const iso = '2026-09-17T09:00:00.000Z';
  assert.equal(B.slotLabel(iso, 'en-US', 'UTC'), '9:00 AM');
  assert.equal(B.slotLabel(iso, 'en-US', 'America/New_York'), '5:00 AM');
  assert.equal(B.slotLabel(iso, 'en-US', 'America/Los_Angeles'), '2:00 AM');
  assert.equal(B.slotLabel(iso, 'en-US', 'Australia/Sydney'), '7:00 PM');
  assert.equal(B.slotLabel('nope', 'en-US', 'UTC'), null);
});

test('slots are grouped by the MEMBER’s calendar day, not the UTC one', () => {
  // A 06:00Z slot is the previous evening in Los Angeles. Filing it under the UTC date
  // would put "11:00 PM" under tomorrow's heading on the member's own screen.
  const out = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 360, duration_min: 120 }],
    booked: [], now: MON, days: 7, sessionMin: 60,
  });
  const la = B.groupByDay(out, 'en-US', 'America/Los_Angeles');
  assert.equal(la.length, 2, 'the two slots did not split across the local midnight');
  assert.match(la[0].day, /Sep 16/);
  assert.equal(B.slotLabel(la[0].slots[0].iso, 'en-US', 'America/Los_Angeles'), '11:00 PM');
  assert.match(la[1].day, /Sep 17/);
  // in UTC they are one day
  assert.equal(B.groupByDay(out, 'en-US', 'UTC').length, 1);
});

test('the projection survives a DST transition in the viewer’s zone', () => {
  // The window walks UTC days, where every day is exactly 24h by construction, so a
  // 25-hour local day cannot drop or duplicate one. Anchored on the US fall-back.
  const before = new Date('2026-10-29T12:00:00Z');  // a Thursday, before Nov 1
  const out = B.buildSlots({
    slots: [{ weekday: THU, start_minute: 720, duration_min: 60 }],
    booked: [], now: before, days: 28, sessionMin: 60,
  });
  assert.deepEqual(out.map((s) => s.iso), [
    '2026-11-05T12:00:00.000Z', '2026-11-12T12:00:00.000Z', '2026-11-19T12:00:00.000Z',
  ], 'a weekly slot was lost or duplicated across the transition');
  // every one is still a Thursday in UTC
  for (const s of out) assert.equal(new Date(s.iso).getUTCDay(), THU);
});

test('the Team page books with the account, and the preview cannot book at all', () => {
  const t = stripComments(TEAM);
  // identity comes from the account, never from anything on screen
  assert.match(t, /await c\.auth\.getUser\(\)/);
  assert.match(t, /client_id: user\.id/);
  // RLS pins it too, but sending anything else would be a request to self-confirm
  assert.match(t, /status: "requested"/);
  assert.doesNotMatch(t, /status: "confirmed"/);
  // the control is gated on a LIVE page AND a real provider row — a demo coach has
  // neither an availability pattern nor a row a booking could be written against
  assert.match(t, /canBook=\{state === "live" && !!c\.provider_id\}/);
  // and provider_id has to survive the live mapping or the sheet has nobody to ask about
  assert.match(t, /provider_id: c\.provider_id/);
  // the double-book index deserves its own sentence, not a generic failure
  assert.match(t, /23505/);
  // ⚠ AND THE OLD MISLABEL MUST NOT COME BACK: "Book session" may never call the chat.
  // ⚠ ANCHORED ON THE BUTTON, NOT ON A CHARACTER WINDOW. The first version sliced 600
  // characters back from the label and caught the MESSAGE button, which calls the chat
  // entirely legitimately — so it failed the correct code and would have passed a
  // rewrite that moved the two further apart. The element is what the claim is about.
  const at = t.indexOf('Book session');
  assert.ok(at > 0, 'the Book session control moved');
  const open = t.lastIndexOf('<button', at);
  assert.ok(open > 0 && open < at, 'the Book session label is not inside a button');
  const btn = t.slice(open, at);
  assert.doesNotMatch(btn, /ctOpenChat/, '"Book session" opens the chat again');
  assert.match(btn, /onBook\(c\)/, '"Book session" no longer opens the booking sheet');
});

test('every page that loads clientTeam.jsx loads bookingSlots.js first', () => {
  // ⚠ THE SHEET READS `window.BookingSlots`, AND THESE ARE CLASSIC SCRIPTS — a bare global
  // exists only if an earlier tag defined it. A host added later without the module would
  // render the Team page perfectly and throw the moment somebody taps Book session, which
  // is the window-globals load-order class this repo already post-mortems as React #130.
  //
  // The corpus is DERIVED from the pages that actually load the page module, so a new host
  // is covered with nobody remembering this test exists — and it asserts it FOUND one,
  // because a sweep over an empty list passes without checking anything.
  const dir = new URL('../public/newdesign/', import.meta.url);
  const hosts = readdirSync(dir).filter((f) => f.endsWith('.html'))
    .map((f) => [f, readFileSync(new URL(f, dir), 'utf8')])
    .filter(([, html]) => /src="clientTeam\.jsx/.test(html));
  assert.ok(hosts.length >= 1, 'nothing loads clientTeam.jsx — the corpus vanished');
  for (const [f, html] of hosts) {
    const mod = html.search(/src="bookingSlots\.js/);
    const page = html.search(/src="clientTeam\.jsx/);
    assert.ok(mod >= 0, f + ' loads clientTeam.jsx without bookingSlots.js');
    assert.ok(mod < page, f + ' loads bookingSlots.js AFTER clientTeam.jsx');
  }
});
