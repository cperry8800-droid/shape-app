// Coach availability projection — the pure engine behind the Listing's OPEN
// THIS WEEK station and the full scheduling calendar (spec 2026-07-09 §3).
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsProjectAvailability, bsSlotsByDay } from '../mobile-app/src/services/coachAvailability.mjs';

// Fixed clock: Wed 2026-07-08 12:00 local.
const NOW = new Date(2026, 6, 8, 12, 0, 0);

test('weekly pattern projects onto real dates across the window', () => {
  const open = bsProjectAvailability({
    slots: [{ weekday: 4, start_minute: 6 * 60 + 30, duration_min: 60 }], // Thu 06:30
    booked: [], weeks: 2, now: NOW,
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
    booked: [], weeks: 1, now: NOW,
  });
  assert.deepEqual(open.map((s) => `${s.iso} ${s.time}`), ['2026-07-08 17:00']);
});

test('a booked session suppresses exactly its slot instance', () => {
  const open = bsProjectAvailability({
    slots: [{ weekday: 4, start_minute: 6 * 60 + 30, duration_min: 60 }],
    booked: [{ scheduled_at: new Date(2026, 6, 9, 6, 30).toISOString(), status: 'confirmed' }],
    weeks: 2, now: NOW,
  });
  assert.deepEqual(open.map((s) => s.iso), ['2026-07-16']); // next week's stays open
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
    weeks: 1, now: NOW,
  });
  assert.deepEqual(open.map((s) => `${s.iso} ${s.time}`), ['2026-07-09 06:30', '2026-07-10 14:00']);
  assert.equal(open[1].durationMin, 60);
});

test('empty inputs → empty projection; bsSlotsByDay groups by iso', () => {
  assert.deepEqual(bsProjectAvailability({ now: NOW }), []);
  const m = bsSlotsByDay([
    { iso: '2026-07-09', time: '06:30' },
    { iso: '2026-07-09', time: '18:00' },
    { iso: '2026-07-10', time: '09:00' },
  ]);
  assert.equal(m.get('2026-07-09').length, 2);
  assert.equal(m.get('2026-07-10').length, 1);
});
