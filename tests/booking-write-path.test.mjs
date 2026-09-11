// The booking WRITE paths, after the CodeRabbit round on #2053 found the 2026-09-11 timezone
// fix correct at the display and still wrong at the write.
//
// ⚠ THE PROJECTION BEING RIGHT SAYS NOTHING ABOUT WHAT GETS STORED. Both defects below were
// live on a tree whose whole slot-projection suite was green: the app carried the resolved
// instant as far as the confirm sheet and then rebuilt a ZONE-LESS one from the member's own
// display fields, and the website's route accepted whatever instant the caller sent. A member
// saw the right time and a different moment was written.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { instantInZone } from '../src/lib/time.ts';
import { stripComments } from './helpers/strip-comments.mjs';

const require_ = createRequire(import.meta.url);
const B = require_('../public/newdesign/bookingSlots.js');
const HTML = readFileSync(new URL('../public/newdesign/consultation.html', import.meta.url), 'utf8');
const BACKEND = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
const LISTING = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx', import.meta.url), 'utf8');
const ROUTE = readFileSync(new URL('../src/app/api/consultation/route.ts', import.meta.url), 'utf8');

// The page's own helper, lifted from the shipped file rather than restated — a restatement
// here would test the restatement, which is the trap this repo keeps paying for.
function liftCoachWallClock() {
  const i = HTML.indexOf('function coachWallClock');
  assert.ok(i > 0, 'coachWallClock is gone from the booking page');
  const j = HTML.indexOf('\n    // The member', i);
  assert.ok(j > i, 'could not delimit coachWallClock');
  return new Function('return ' + HTML.slice(i, j).trim())();
}

// The route's own accepted time format (its parseTime contract: "9:00 AM" / "2:30 PM").
function parseTime(s) {
  const m = /^(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(String(s).trim());
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/pm/i.test(m[3])) h += 12;
  return { hour: h, minute: Number(m[2]) };
}

test('what the booking page sends resolves, on the server, to the instant it showed', () => {
  // ⚠ THIS IS THE GUARD THAT KEEPS THE CROSS-CHECK FROM REFUSING EVERY REAL BOOKING. The
  // route derives the appointment by resolving date+time in the COACH's zone and refuses a
  // mismatched `scheduledAt`, so the page must send the COACH's wall clock. Sending the
  // member's — which an earlier cut did — makes the two disagree for every member outside
  // the coach's zone and 409s a booking that was perfectly valid.
  const coachWallClock = liftCoachWallClock();
  let checked = 0, skippedGap = 0;
  for (const zone of ['America/New_York', 'Australia/Sydney', 'Asia/Kolkata', 'Europe/London', 'UTC', 'America/St_Johns']) {
    for (const date of ['2026-01-15', '2026-03-08', '2026-06-21', '2026-09-17', '2026-11-01']) {
      // ⚠ 120 AND 150 ARE HERE ON PURPOSE: they are the 02:00/02:30 the North American
      // zones skip over on 2026-03-08, which is the only way this sweep reaches the
      // nonexistent-wall-time branch. Without them the vacuity assertion below fails —
      // which is how it was found.
      for (const min of [0, 30, 120, 150, 540, 720, 1020, 1410]) {
        const iso = B.isoForSlot(date, min, zone);
        if (!iso) { skippedGap++; continue; }        // a wall time the zone skips over
        const wc = coachWallClock(iso, zone);
        assert.ok(wc && wc.date && wc.time, `no wall clock for ${zone} ${date} +${min}`);
        assert.match(wc.date, /^\d{4}-\d{2}-\d{2}$/, `the route's isISODate would reject ${wc.date}`);
        const p = parseTime(wc.time);
        assert.ok(p, `the route's parseTime would reject ${JSON.stringify(wc.time)}`);
        const [y, mo, d] = wc.date.split('-').map(Number);
        assert.equal(
          instantInZone(y, mo, d, p.hour, p.minute, zone), new Date(iso).getTime(),
          `page and server disagree for ${zone} ${date} +${min} (sent ${wc.date} ${wc.time})`
        );
        checked++;
      }
    }
  }
  assert.ok(checked > 100, `the sweep only compared ${checked} combinations`);
  assert.ok(skippedGap > 0, 'the sweep never reached a nonexistent wall time');
});

test('the booking page SENDS the coach wall clock, not the member\u2019s', () => {
  // ⚠ TESTING THE HELPER IS NOT TESTING THE CALLER. The round-trip sweep above lifts
  // `coachWallClock` and proves it agrees with the server — and a mutation that reverted the
  // POST body to the member-local `selectedDate`/`timeStr` SURVIVED it, because nothing
  // asserted the request actually uses the helper. That reversion 409s every booking made
  // from outside the coach's zone, which is most of them.
  const h = stripComments(HTML);
  assert.match(h, /date: coachClock\.date, time: coachClock\.time,/,
    'the POST no longer sends the coach wall clock');
  // ⚠ SCOPED TO THE REQUEST BODY, because the member-local pair is CORRECT elsewhere: the
  // localStorage copy is the member's own record of their own booking and should read in
  // their own clock. A file-wide ban matched that line and failed the correct tree — a guard
  // pinning a spelling, wrong about what the spelling meant.
  const bodyStart = h.indexOf("fetch('/api/consultation'");
  assert.ok(bodyStart > 0, 'the consultation POST is gone');
  const body = h.slice(bodyStart, h.indexOf('})', h.indexOf('JSON.stringify(', bodyStart)));
  assert.doesNotMatch(body, /date: selectedDate/,
    'the POST sends the member-local date, which the route resolves in the coach zone');
  assert.doesNotMatch(body, /time: timeStr/,
    'the POST sends the member-local time, which the route resolves in the coach zone');
  // It is derived before the request and refused locally when it cannot be built.
  assert.match(h, /const coachClock = coachWallClock\(selectedIso, coachZone\)/,
    'the coach wall clock is not derived from the selected instant and the coach zone');
  assert.match(h, /if \(!coachClock\)/, 'a missing coach wall clock is no longer refused');
  // The instant still rides along as the cross-check the route compares against.
  assert.match(h, /scheduledAt: selectedIso, timezone: coachZone,/,
    'the POST no longer carries the instant for the server to cross-check');
});

test('the consultation route derives the instant and never trusts a sent one', () => {
  const r = stripComments(ROUTE);
  // The instant comes from instantInZone over the submitted wall clock…
  assert.match(r, /const resolved = instantInZone\(/, 'the route no longer derives the instant');
  assert.match(r, /const scheduled = new Date\(resolved\)/, 'the appointment is not the resolved instant');
  // …and a sent instant may only ever be compared against it, never assigned.
  assert.doesNotMatch(r, /scheduled\s*=\s*new Date\(sentAt\)/, 'the route assigns a client-sent instant');
  assert.match(r, /t !== resolved/, 'a mismatched scheduledAt is no longer refused');
  // ⚠ THE NO-ZONE REFUSAL MUST PRECEDE THE INSTANT, or a sent instant walks past it — which
  // is exactly how the first cut of this fix let a caller book a coach whose hours cannot be
  // placed at all.
  const iZone = r.indexOf('if (!providerZone)');
  const iResolved = r.indexOf('const resolved = instantInZone(');
  assert.ok(iZone > 0 && iResolved > iZone, 'the no-zone refusal no longer guards every path');
  // The email must not append a literal zone: niceDate carries its own timeZoneName, so a
  // suffix produced "9:00 AM EDT UTC".
  assert.doesNotMatch(r, /\$\{niceDate\} UTC/, 'the mail re-labels a coach-local time as UTC');
  assert.match(r, /timeZoneName: 'short'/, 'the mail no longer names the zone at all');
});

test('the app books the RESOLVED instant, never one rebuilt from display fields', () => {
  const b = stripComments(BACKEND);
  // `at` is preferred and emitted as a real ISO instant…
  assert.match(b, /const at = Number\(slot\.at\)/, 'scheduledAtFromSlot ignores the resolved instant');
  assert.match(b, /return new Date\(at\)\.toISOString\(\)/, 'the resolved instant is not sent as an ISO instant');
  // …and it is preferred BEFORE the display-field reconstruction, or it can never be reached.
  const iAt = b.indexOf('Number(slot.at)');
  const iRebuild = b.indexOf('toBookingDate(slot.date');
  assert.ok(iAt > 0 && iRebuild > iAt, 'the display-field rebuild still wins over the resolved instant');

  // And the Listing has to actually carry it: a preference for a field nobody forwards is
  // the shape of this bug, not its fix.
  const l = stripComments(LISTING);
  assert.match(l, /month: BSM_MONTHS3\[d\.getMonth\(\)\], at: s\.at/, 'projSlotRow drops the resolved instant');
  assert.match(l, /slot: \{ day, date, time, month, iso, at \}/, 'the confirm payload drops the resolved instant');
  assert.match(l, /const selectSlot = \(day, date, time, iso, month, at\)/, 'selectSlot does not take the instant');
  // both call sites forward it
  assert.match(l, /selectSlot\(BSM_DAYS3\[d\.getDay\(\)\], String\(d\.getDate\(\)\), s\.time, s\.iso, BSM_MONTHS3\[d\.getMonth\(\)\], s\.at\)/,
    'the calendar does not forward the instant');
  assert.match(l, /selectSlot\(s\.day, s\.date, s\.time, s\.iso, s\.month, s\.at\)/,
    'the slot row does not forward the instant');
});

test('a rebuilt fallback instant is only reachable for rows that have no instant', () => {
  // The demo/preview rows legitimately carry no `at`, so the fallback stays — but it must be
  // unreachable whenever a real projected slot is in hand. Driven, not read: the lifted
  // function is executed over both shapes.
  const i = BACKEND.indexOf('function scheduledAtFromSlot');
  const j = BACKEND.indexOf('\nasync function createSessionRequest', i);
  assert.ok(i > 0 && j > i, 'could not lift scheduledAtFromSlot');
  const body = BACKEND.slice(i, j);
  const fn = new Function(
    'MONTHS', 'toBookingDate',
    body + '\nreturn scheduledAtFromSlot;'
  )({}, () => '2026-09-17');

  const at = Date.UTC(2026, 8, 17, 13, 0);   // a New York 09:00, resolved
  assert.equal(fn({ at, date: '17', month: 'Sep', time: '06:00' }), new Date(at).toISOString(),
    'a slot carrying a resolved instant was rebuilt from its display fields');
  // …and with no instant it still falls back rather than refusing (the preview path).
  assert.equal(fn({ date: '17', month: 'Sep', time: '09:00' }), '2026-09-17T09:00:00');
  // 0 and NaN are not instants — `Number(null)` is 0 and finite, the trap this repo records.
  assert.equal(fn({ at: 0, date: '17', month: 'Sep', time: '09:00' }), '2026-09-17T09:00:00');
  assert.equal(fn({ at: 'nope', date: '17', month: 'Sep', time: '09:00' }), '2026-09-17T09:00:00');
});
