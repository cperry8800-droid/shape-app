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

// ── Second review round (2026-09-11) ────────────────────────────────────────

test('the member-zone read goes through RLS, not the service role', async () => {
  const { readFileSync } = await import('node:fs');
  const src = stripComments(readFileSync(new URL('../src/app/api/sessions/manage/route.ts', import.meta.url), 'utf8'));
  // ⚠ THE ADMIN CLIENT MAY STILL WRITE THE NOTIFICATION (a different user than the actor,
  // pre-existing and legitimate) but it may not READ another user's profile: this route uses
  // the request client for everything else, so that was the one place RLS stopped being
  // authoritative. Flagged by a security review on #2053.
  assert.doesNotMatch(src, /createAdminClient\(\)\s*\n?\s*\.from\('client_profiles'\)/,
    'the member zone is read with the service role, bypassing RLS');
  assert.match(src, /await supabase\s*\n?\s*\.from\('client_profiles'\)\s*\n?\s*\.select\('timezone'\)/,
    'the member zone is no longer read through the request-scoped client');
  // The notification write stays on the admin client — asserted so a later "tidy-up" does not
  // break the one cross-user write that is supposed to be privileged.
  assert.match(src, /createNotification\(createAdminClient\(\)/,
    'the notification write no longer uses the service role');
  // A refused read must not stop the notice: the zone falls back and the zone is NAMED.
  assert.match(src, /timeZone: memberZone \|\| 'UTC'/, 'the fallback zone is gone');
  assert.match(src, /timeZoneName: 'short' as const/, 'the fallback no longer names its zone');
});

test('the availability write is ordered so that no failure needs undoing', async () => {
  const { readFileSync } = await import('node:fs');
  const src = stripComments(readFileSync(new URL('../src/app/api/my-availability/route.ts', import.meta.url), 'utf8'));
  // \u26a0 TWO TABLES, ONE MEANING, NO TRANSACTION \u2014 so the ORDER is the whole guarantee.
  // delete \u2192 stamp \u2192 insert makes every single-step failure self-consistent:
  //   delete fails \u2192 nothing stamped; the old hours keep the old zone.
  //   stamp fails  \u2192 the hours are gone, the old zone stands; no hours to misread.
  //   insert fails \u2192 the hours are gone, the new zone stands; no hours to misread.
  // "No hours" is always safe; hours read in the wrong zone is the defect this change removes.
  const del = src.indexOf('.delete()');
  const stamp = src.indexOf('.update({ timezone: sentZone })');
  const ins = src.indexOf('.insert(rows)');
  assert.ok(del > 0 && stamp > 0 && ins > 0, 'one of the three write steps moved or was renamed');
  assert.ok(del < stamp, 'the zone is stamped before the old hours are deleted');
  assert.ok(stamp < ins, 'the new hours are inserted before the zone is stamped');

  // \u26a0 AND THERE IS NO COMPENSATING ROLLBACK, BY DESIGN. An earlier cut stamped first and
  // restored the prior zone on failure \u2014 which was itself a wrong-time bug (CodeRabbit's P1 on
  // #2053): the restore filtered on `id` alone, so A's rollback could overwrite B's successful
  // save and B's just-stored hours would be read hours out. The editor POSTs on every cell
  // toggle with no debounce, so concurrent saves from one coach are ordinary. Asserted as an
  // ABSENCE because re-introducing it is the regression, not the fix.
  assert.doesNotMatch(src, /unstamp/, 'a compensating rollback is back');
  assert.doesNotMatch(src, /priorZone/, 'the write restores a prior zone again');

  // Every step FAILS THE SAVE rather than pressing on \u2014 a step that continues after a failed
  // stamp writes hours under a zone we could not commit to, which is hours nothing can place.
  for (const marker of ['delete availability failed', 'stamp availability timezone failed', 'insert availability failed']) {
    const at = src.indexOf(marker);
    assert.ok(at > 0, `the ${marker} branch moved`);
    const window = src.slice(at, at + 220);
    assert.match(window, /return NextResponse\.json\(\{ error: 'save_failed' \}, \{ status: 500 \}\)/,
      `the "${marker}" path does not fail the save`);
  }
});

test('the marketplace profile hides hours it cannot place, and the CTA with them', async () => {
  const { readFileSync } = await import('node:fs');
  const src = stripComments(readFileSync(new URL('../public/newdesign/livingDesktop.jsx', import.meta.url), 'utf8'));
  // With a live read and no stored zone this drew unqualified wall-clock ranges AND a booking
  // CTA — and /api/consultation now REFUSES that booking, so the control was a dead end.
  assert.match(src, /const zoneOk = state === "demo" \|\| \(typeof zone === "string" && zone\.length > 0\)/,
    'the zone check is gone');
  assert.match(src, /const useSlots = state === "demo" \? demoSlots : \(zoneOk \? liveSlots : \[\]\)/,
    'unplaceable hours are still rendered');
  // ⚠ AND THE SUMMARY MUST NOT SAY "No open hours set" — the coach HAS hours; we cannot place
  // them. Collapsing the two would blame the coach for a missing column of ours.
  assert.match(src, /const unplaceable = state !== "demo" && !zoneOk && liveSlots\.length > 0/,
    'the two empty states are collapsed');
  assert.match(src, /unplaceable\s*\n?\s*\? "Open hours set/, 'the unplaceable summary is not rendered');
  // The demo preview keeps its example hours — it is labelled and claims nothing about a coach.
  // Asserted on the WORD, not the punctuation: the source carries a literal middot and an
  // escape-sequence pin failed the correct file. A guard that pins a spelling pins whatever
  // that spelling is wrong about — this file's own lesson, paid for a third time.
  assert.match(src, /state === "demo" \? "[^"]*example"/, 'the demo preview no longer labels itself an example');
});

test('the editor adopts the zone the route actually stored', async () => {
  const { readFileSync } = await import('node:fs');
  const src = stripComments(readFileSync(new URL('../public/newdesign/dashSchedule.jsx', import.meta.url), 'utf8'));
  // The label is a claim about what members are booked in, so it must come from the write's
  // own answer rather than from the value we happened to send.
  assert.match(src, /if \(res\.ok && onZone\)/, 'the stored zone is never adopted');
  assert.match(src, /onZone\(j\.timezone\)/, 'the response timezone is not applied');
  // ⚠ ONLY ON SUCCESS: a failed save stored nothing, so the old label is still the true one.
  const at = src.indexOf('if (res.ok && onZone)');
  assert.ok(at > 0);
  assert.doesNotMatch(src.slice(0, at), /onZone\(/, 'the zone is adopted before the save is known to have landed');
  assert.match(src, /onZone=\{setAvailZone\}/, 'the callback is never wired from the page');
});
