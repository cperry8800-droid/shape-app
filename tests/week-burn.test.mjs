// Calories burned this week on the Train tab (services/weekBurn.mjs): a day counted once, from its
// device snapshot when it has one and its logged activities otherwise; nothing tracked is not zero.
import test from 'node:test';
import assert from 'node:assert/strict';
import { bsBurnWeek } from '../mobile-app/src/services/weekBurn.mjs';

const MON = '2026-10-19';
const TODAY = '2026-10-24'; // Saturday
const at = (day, hh = 9) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hh, 30).toISOString();

test('a day with a device snapshot takes it, never added to its activities', () => {
  const w = bsBurnWeek({
    monday: MON, todayIso: TODAY,
    snaps: [{ snapshot_date: '2026-10-19', calories: 512, sources: { calories: 'apple_health' } }],
    acts: [{ started_at: at('2026-10-19'), calories: 300, source: 'strava' }],
  });
  assert.equal(w.days[0].kcal, 512);
  assert.equal(w.total, 512);
  assert.deepEqual(w.sources, ['Apple Health'], 'only the figure used is credited');
});

test('a day without one adds up its activities, by the member’s local day', () => {
  const w = bsBurnWeek({
    monday: MON, todayIso: TODAY,
    snaps: [{ snapshot_date: '2026-10-20', calories: null, sources: {} }, { snapshot_date: '2026-10-21', calories: 0 }],
    acts: [
      { started_at: at('2026-10-20', 7), calories: 410, source: 'strava' },
      { started_at: at('2026-10-20', 18), calories: 220.4, source: 'whoop' },
      { started_at: at('2026-10-21', 6), calories: 300, source: 'manual' },
      { started_at: at('2026-10-21', 7), calories: null, source: 'strava' },
    ],
  });
  assert.equal(w.days[1].kcal, 630);
  assert.equal(w.days[2].kcal, 300, 'a snapshot of 0 is no reading, so the logged workout counts');
  assert.equal(w.total, 930);
  assert.deepEqual(w.sources.sort(), ['Strava', 'WHOOP', 'manual'].sort());
  assert.equal(w.daysCounted, 2);
  assert.equal(w.avg, 465);
  assert.equal(w.max, 630);
});

test('nothing tracked is null, days ahead are never counted, and other weeks stay out', () => {
  const none = bsBurnWeek({ monday: MON, todayIso: TODAY });
  assert.equal(none.total, null);
  assert.equal(none.avg, null);
  assert.deepEqual(none.days.map((d) => d.kcal), [null, null, null, null, null, null, null]);
  const w = bsBurnWeek({
    monday: MON, todayIso: TODAY,
    snaps: [{ snapshot_date: '2026-10-25', calories: 900 }, { snapshot_date: '2026-10-18', calories: 700 }],
    acts: [{ started_at: at('2026-10-26'), calories: 500, source: 'strava' }],
  });
  assert.equal(w.total, null);
  assert.deepEqual(w.days.map((d) => d.future), [false, false, false, false, false, true, true].map((_, i) => i === 6));
  assert.ok(w.days[5].isToday);
});

// Codex P2 on #2437: a WHOOP strap and Strava on the same run each keep their row; the week counts
// that run once, at the larger reading. Two workouts from one source are still two.
test('one workout two providers recorded counts once; one provider’s two workouts count twice', () => {
  const t = (day, hh, mm) => new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), hh, mm).toISOString();
  const w = bsBurnWeek({
    monday: MON, todayIso: TODAY,
    acts: [
      { started_at: t('2026-10-20', 7, 0), calories: 480, source: 'whoop' },
      { started_at: t('2026-10-20', 7, 12), calories: 530, source: 'strava' },
      { started_at: t('2026-10-20', 7, 25), calories: 200, source: 'whoop' },
      { started_at: t('2026-10-21', 18, 0), calories: 300, source: 'strava' },
      { started_at: t('2026-10-21', 18, 45), calories: 310, source: 'whoop' },
    ],
  });
  assert.equal(w.days[1].kcal, 730, 'the 7:00 run once at 530, and the 7:25 WHOOP workout on its own');
  assert.equal(w.days[2].kcal, 610, '45 minutes apart: two workouts');
  assert.equal(w.total, 1340);
  assert.deepEqual(w.sources.sort(), ['Strava', 'WHOOP']);
});
