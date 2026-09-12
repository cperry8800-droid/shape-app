// Coach availability projection — the pure engine behind the Listing's OPEN
// THIS WEEK station and the full scheduling calendar (spec 2026-07-09 §3).
//
// ⚠ EVERY CASE BELOW NOW NAMES A COACH ZONE, because start_minute is meaningless
// without one: this module used to read it as the MEMBER's local time, which was the
// app's half of the 2026-09-11 booking-timezone defect (the website read the same row as
// UTC). The cases that predate the fix pass the RUNNER's own zone, which is what they
// were always implicitly asserting — coach and member on one clock — so their
// expectations are unchanged and still hold in any runner timezone. The genuinely
// cross-zone behaviour is covered by its own tests at the bottom.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsProjectAvailability, bsSlotsByDay, bsIsZone } from '../mobile-app/src/services/coachAvailability.mjs';

// Fixed clock: Wed 2026-07-08 12:00 local. July is deliberately mid-season — no zone
// this suite uses transitions between 2026-07-08 and the end of the widest window here.
const NOW = new Date(2026, 6, 8, 12, 0, 0);
// The coach shares the runner's clock, so the local display fields these cases assert on
// (`iso`, `time`) are the same numbers in any runner timezone.
const HERE = Intl.DateTimeFormat().resolvedOptions().timeZone;

test('weekly pattern projects onto real dates across the window', () => {
  const open = bsProjectAvailability({
    slots: [{ weekday: 4, start_minute: 6 * 60 + 30, duration_min: 60 }], // Thu 06:30
    booked: [], weeks: 2, now: NOW, zone: HERE,
  });
  assert.equal(open.length, 2); // two Thursdays in 14 days
  assert.deepEqual(open.map((s) => s.iso), ['2026-07-09', '2026-07-16']);
  assert.ok(open.every((s) => s.time === '06:30' && s.weekday === 4));
});

test('past slots never emit (same-day earlier time is dropped)', () => {
  const open = bsProjectAvailability({
    slots: [
      { weekday: 3, start_minute: 9 * 60, duration_min: 60 },  // Wed 09:00 — already past at noon
      { weekday: 3, start_minute: 17 * 60, duration_min: 60 }, // Wed 17:00 — still ahead
    ],
    booked: [], weeks: 1, now: NOW, zone: HERE,
  });
  assert.deepEqual(open.map((s) => `${s.iso} ${s.time}`), ['2026-07-08 17:00']);
});

test('a booked session suppresses exactly its slot instance (route serializes ISO strings)', () => {
  const open = bsProjectAvailability({
    slots: [{ weekday: 4, start_minute: 6 * 60 + 30, duration_min: 60 }],
    booked: [new Date(2026, 6, 9, 6, 30).toISOString()], // GET /api/availability shape
    weeks: 2, now: NOW, zone: HERE,
  });
  assert.deepEqual(open.map((s) => s.iso), ['2026-07-16']); // next week's stays open
});

test('object-shaped booked rows ({ scheduled_at }) suppress too', () => {
  const open = bsProjectAvailability({
    slots: [{ weekday: 4, start_minute: 6 * 60 + 30, duration_min: 60 }],
    booked: [{ scheduled_at: new Date(2026, 6, 16, 6, 30).toISOString(), status: 'confirmed' }],
    weeks: 2, now: NOW, zone: HERE,
  });
  assert.deepEqual(open.map((s) => s.iso), ['2026-07-09']);
});

test('junk rows are ignored, results sort chronologically', () => {
  const open = bsProjectAvailability({
    slots: [
      { weekday: 5, start_minute: 14 * 60 },            // Fri 14:00, default 60min
      { weekday: 4, start_minute: -10 },                 // invalid minute
      { weekday: 'x', start_minute: 60 },                // invalid weekday
      { weekday: 4, start_minute: 6 * 60 + 30 },         // Thu 06:30
    ],
    booked: [{ scheduled_at: 'not-a-date' }],
    weeks: 1, now: NOW, zone: HERE,
  });
  assert.deepEqual(open.map((s) => `${s.iso} ${s.time}`), ['2026-07-09 06:30', '2026-07-10 14:00']);
  assert.equal(open[1].durationMin, 60);
});

test('empty inputs → empty projection; bsSlotsByDay groups by iso', () => {
  assert.deepEqual(bsProjectAvailability({ now: NOW, zone: HERE }), []);
  const m = bsSlotsByDay([
    { iso: '2026-07-09', time: '06:30' },
    { iso: '2026-07-09', time: '18:00' },
    { iso: '2026-07-10', time: '09:00' },
  ]);
  assert.equal(m.get('2026-07-09').length, 2);
  assert.equal(m.get('2026-07-10').length, 1);
});

// ── The zone is the fix (2026-09-11) ────────────────────────────────────────

test('a coach zone is REQUIRED — no zone projects nothing rather than guessing', () => {
  const slots = [{ weekday: 4, start_minute: 9 * 60, duration_min: 60 }];
  // ⚠ `undefined` IS THE DANGEROUS ONE: `Intl` treats `timeZone: undefined` as "use the
  // system zone" rather than as an error, so an unguarded build would silently fall back
  // to the MEMBER's clock — which is the exact defect this module was rewritten to remove.
  for (const zone of [null, undefined, '', 'Not/AZone', 'Area/Nowhere', 42, {}]) {
    assert.deepEqual(
      bsProjectAvailability({ slots, booked: [], weeks: 2, now: NOW, zone }), [],
      `projected slots for an unusable zone: ${JSON.stringify(zone)}`
    );
    assert.equal(bsIsZone(zone), false, `bsIsZone accepted ${JSON.stringify(zone)}`);
  }
  // …and the control: the same pattern DOES project once a real zone is named, so the
  // assertions above cannot be passing because the fixture is simply empty.
  assert.equal(bsProjectAvailability({ slots, booked: [], weeks: 2, now: NOW, zone: 'UTC' }).length, 2);
});

test('the stored minute is the COACH\'s wall clock, wherever the member is', () => {
  // A New York coach opens Thursday 09:00. That is 13:00Z in July (EDT, -04:00) — NOT
  // 09:00Z, which is what this chain used to book, and NOT 09:00 in the member's zone,
  // which is what this module used to book.
  const open = bsProjectAvailability({
    slots: [{ weekday: 4, start_minute: 9 * 60, duration_min: 60 }],
    booked: [], weeks: 1, now: new Date('2026-07-08T12:00:00Z'), zone: 'America/New_York',
  });
  assert.equal(open.length, 1);
  assert.equal(new Date(open[0].at).toISOString(), '2026-07-09T13:00:00.000Z');
  // And the coach really reads 09:00 on their own clock at that instant.
  assert.equal(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', hour: '2-digit', minute: '2-digit' })
      .format(new Date(open[0].at)),
    '09:00'
  );
});

test('the window walks the COACH\'s calendar, so a Monday is their Monday', () => {
  // Sydney is +10 in July, so a Monday 09:00 there is Sunday 23:00Z. Walking the
  // member's (or UTC's) dates files it under Sunday and picks the wrong weekday rows.
  const open = bsProjectAvailability({
    slots: [{ weekday: 1, start_minute: 9 * 60, duration_min: 60 }],
    booked: [], weeks: 2, now: new Date('2026-07-08T12:00:00Z'), zone: 'Australia/Sydney',
  });
  assert.ok(open.length >= 2, 'no Mondays projected at all');
  for (const s of open) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: 'Australia/Sydney', weekday: 'short' }).format(new Date(s.at));
    assert.equal(wd, 'Mon', `projected a ${wd} for a Monday pattern`);
    assert.ok(new Date(s.at).toISOString().endsWith('T23:00:00.000Z'), `not 23:00Z: ${new Date(s.at).toISOString()}`);
  }
});

test('booked is matched on the INSTANT, not on a wall-clock string', () => {
  const slots = [{ weekday: 4, start_minute: 9 * 60, duration_min: 60 }];
  const now = new Date('2026-07-08T12:00:00Z');
  const all = bsProjectAvailability({ slots, booked: [], weeks: 2, now, zone: 'America/New_York' });
  assert.equal(all.length, 2);
  // Postgres hands back `+00:00` where a client builds `.000Z` — one moment, two
  // spellings. The old local-HH:MM key could not see it; epoch ms cannot be fooled.
  const pg = new Date(all[0].at).toISOString().replace('.000Z', '+00:00');
  const after = bsProjectAvailability({ slots, booked: [pg], weeks: 2, now, zone: 'America/New_York' });
  assert.equal(after.length, 1, 'the +00:00 spelling did not suppress its slot');
  assert.equal(after[0].at, all[1].at);
});

test('a wall time the coach\'s zone skips over is refused, not shifted an hour', () => {
  // 02:30 never happens in New York on 2026-03-08 (02:00 → 03:00). Emitting it would
  // book an hour the coach never declared; the old setHours version normalized it to
  // 03:30 deliberately, to keep its wall-clock booked key matching.
  const open = bsProjectAvailability({
    slots: [{ weekday: 0, start_minute: 2 * 60 + 30, duration_min: 60 }], // Sunday 02:30
    booked: [], weeks: 1, now: new Date('2026-03-07T12:00:00Z'), zone: 'America/New_York',
  });
  assert.deepEqual(open, [], 'projected a wall time that does not exist');
  // Control: the hour before it does exist and IS projected, so the refusal above is
  // about the gap and not about Sundays, the window, or the fixture.
  const ok = bsProjectAvailability({
    slots: [{ weekday: 0, start_minute: 60, duration_min: 60 }], // Sunday 01:00
    booked: [], weeks: 1, now: new Date('2026-03-07T12:00:00Z'), zone: 'America/New_York',
  });
  assert.equal(ok.length, 1);
  assert.equal(new Date(ok[0].at).toISOString(), '2026-03-08T06:00:00.000Z');
});

// ── The Listing must actually forward the zone ───────────────────────────────
// ⚠ NOTHING DROVE THIS UNTIL THE MUTATION ROUND: deleting `zone: d.timezone` from the
// Listing's fetch left the whole suite green while every real coach's hours went
// unplaceable in the app, because the pure module above is tested in isolation and the
// call site is JSX this suite cannot mount. A fetched field nobody forwards is the shape
// of this bug, not its fix.
test('the marketplace Listing hands the coach zone to the projection', async () => {
  const { readFileSync } = await import('node:fs');
  const { stripComments } = await import('./helpers/strip-comments.mjs');
  const src = stripComments(
    readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx', import.meta.url), 'utf8'));

  assert.match(src, /bsProjectAvailability\(\{[^}]*zone:\s*d\.timezone/,
    'bsProjectAvailability is not handed the coach zone');
  // And the two empties stay apart, as on the website: declared hours we cannot place is a
  // claim about our data, while an empty pattern is a fact about the coach.
  assert.match(src, /setNoZone\(\s*d\.slots\.length > 0 && !bsIsZone\(d\.timezone\)\s*\)/,
    'the unplaceable-hours state is not derived from slots + zone');
  assert.match(src, /noZone\s*\n?\s*\?\s*tr\('marketplace:listing\.noTimezone'/,
    'the noTimezone copy is never rendered');
  // The import has to be real, or the guard above passes on a ReferenceError at runtime.
  assert.match(src, /import \{[^}]*\bbsIsZone\b[^}]*\} from '\.\.\/services\/coachAvailability\.mjs'/,
    'bsIsZone is used but not imported');
});
