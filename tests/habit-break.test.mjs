// A member's break quiets the habit reminders their own device schedules (Codex on #2705):
// mobile-app/src/services/habitBreak.mjs, and how shapeBackend.js runs it.
//
// A habit reminder's server half already goes quiet on a break (notify-core memberPaused); the half the
// device schedules fires from the OS. While the break holds the device keeps none, and once it no longer
// holds it puts back the ones it took down, from habit_reminders.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { syncHabitsToBreak } from '../mobile-app/src/services/habitBreak.mjs';

const NOW = new Date('2026-11-15T12:00:00Z');
const AWAY = { until_on: '2026-11-20', set_by_role: 'member', set_at: '2026-11-14T09:00:00Z', set_by_me: true, back_at: '2026-11-21T08:00:00Z' };
const OVER = { ...AWAY, until_on: '2026-11-14', back_at: '2026-11-15T08:00:00Z' };
const KEY = 'shape.habits.awayFor:m1';
const db = (answer) => ({ rpc: async (name, args) => { assert.equal(name, 'get_client_pause'); assert.deepEqual(args, { p_client_id: 'm1' }); return answer; } });
const store = () => { const m = new Map(); return { m, getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const ROWS = [{ habit_id: 'h1', enabled: true, at_time: '07:30', days: [1] }, { habit_id: 'h2', enabled: false }, { habit_id: 'h3', enabled: true, at_time: '20:00', days: [2] }, { habit_id: 'h4', enabled: true, at_time: '06:00', days: [3] }];
// A device with `on` scheduled (h4 was set on another phone, so it isn't here).
function device({ rows = ROWS, on = ['h1', 'h3'] } = {}) {
  const log = [];
  return {
    log, on,
    pendingIds: async () => (on === null ? null : [...on]),
    cancelAll: async () => { log.push('cancelAll'); if (on) on.length = 0; },
    readRows: async () => { log.push('readRows'); return rows; },
    schedule: async (r) => { log.push('schedule:' + r.habit_id); if (r.at_time === 'bad') throw new Error('Invalid reminder time.'); if (on) on.push(r.habit_id); },
  };
}
const run = (answer, d, storage, extra = {}) => syncHabitsToBreak({ db: db(answer), uid: 'm1', storage, now: () => NOW, ...d, ...extra });

test('away: the device takes its habit reminders down; back: it puts up the ones it took down, and only those', async () => {
  const s = store();
  const d = device();
  assert.equal(await run({ data: [AWAY], error: null }, d, s), 'away');
  assert.deepEqual(d.log, ['cancelAll']);
  assert.deepEqual(JSON.parse(s.getItem(KEY)).sort(), ['h1', 'h3']);
  // One saved on this phone while away is taken down too, and the first two are still remembered.
  d.on.push('h5');
  assert.equal(await run({ data: [AWAY], error: null }, d, s), 'away');
  assert.deepEqual(JSON.parse(s.getItem(KEY)).sort(), ['h1', 'h3', 'h5']);
  // Back since 08:00 UTC: h1 and h3 go back up; h2 is switched off, h4 was never on this phone, and h5's
  // row is gone. The mark is cleared.
  d.log.length = 0;
  assert.equal(await run({ data: [OVER], error: null }, d, s), 'restored');
  assert.deepEqual(d.log, ['readRows', 'schedule:h1', 'schedule:h3']);
  assert.equal(s.getItem(KEY), null);
  // And then nothing to do.
  d.log.length = 0;
  assert.equal(await run({ data: [OVER], error: null }, d, s), 'present');
  assert.deepEqual(d.log, []);
});

test('a device that can\'t tell which are on it puts every one switched on back', async () => {
  const s = store();
  const d = device({ on: null });
  assert.equal(await run({ data: [AWAY], error: null }, d, s), 'away');
  assert.deepEqual(JSON.parse(s.getItem(KEY)), ['*']);
  d.log.length = 0;
  assert.equal(await run({ data: [OVER], error: null }, d, s), 'restored');
  assert.deepEqual(d.log, ['readRows', 'schedule:h1', 'schedule:h3', 'schedule:h4']);
});

test('no break, and none taken down: the device is left as it is', async () => {
  for (const data of [[], null]) {
    const d = device();
    assert.equal(await run({ data, error: null }, d, store()), 'present');
    assert.deepEqual(d.log, [], 'not even a read of the reminders');
  }
});

test('a break that can\'t be read, or isn\'t there yet, takes nothing down and puts nothing up', async () => {
  for (const answer of [{ data: null, error: { code: '500', message: 'down' } }, { data: null, error: { code: 'PGRST202' } }]) {
    const s = store();
    s.setItem(KEY, JSON.stringify(['h1']));
    const d = device();
    assert.equal(await run(answer, d, s), 'unread');
    assert.deepEqual(d.log, []);
    assert.deepEqual(JSON.parse(s.getItem(KEY)), ['h1'], 'still marked, for the next run');
  }
  const d = device();
  assert.equal(await syncHabitsToBreak({ db: { rpc: async () => { throw new Error('offline'); } }, uid: 'm1', storage: store(), ...d }), 'unread');
  assert.deepEqual(d.log, []);
});

test('back, but the reminders can\'t be read: still marked, so the next run puts them back', async () => {
  const s = store();
  s.setItem(KEY, JSON.stringify(['h1']));
  const d = { ...device(), readRows: async () => null };
  assert.equal(await run({ data: [OVER], error: null }, d, s), 'unread');
  assert.deepEqual(JSON.parse(s.getItem(KEY)), ['h1']);
});

test('one reminder the device refuses doesn\'t keep the rest down', async () => {
  const s = store();
  s.setItem(KEY, JSON.stringify(['h1', 'h3']));
  const d = device({ rows: [{ habit_id: 'h1', enabled: true, at_time: 'bad', days: [1] }, { habit_id: 'h3', enabled: true, at_time: '20:00', days: [2] }] });
  assert.equal(await run({ data: [OVER], error: null }, d, s), 'restored');
  assert.deepEqual(d.log, ['readRows', 'schedule:h1', 'schedule:h3']);
});

test('an account that changed under the run touches nothing', async () => {
  const s = store();
  const d = device();
  assert.equal(await run({ data: [AWAY], error: null }, d, s, { isCurrent: () => false }), 'skipped');
  assert.deepEqual(d.log, []);
  assert.equal(s.getItem(KEY), null);
  assert.equal(await syncHabitsToBreak({ db: db({ data: [AWAY] }), uid: null, ...d }), 'skipped', 'signed out');
});

// ── how the app runs it ───────────────────────────────────────────────────────
test('the app runs it at sign-in, when it comes to the front, and after a break or a reminder is saved', () => {
  const be = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  assert.match(be, /import \{ syncHabitsToBreak \} from '\.\/habitBreak\.mjs';/);
  // At sign-in, once the module has loaded.
  assert.match(be, /if \(uid && uid !== prevUid\) \{ try \{ setTimeout\(\(\) => \{ void syncHabitBreak\(true\); \}, 0\); \} catch \(e\) \{\} \}/);
  // When the app comes to the front, at most every 10 minutes.
  assert.match(be, /document\.addEventListener\('visibilitychange', \(\) => \{ if \(document\.visibilityState !== 'hidden'\) void syncHabitBreak\(\); \}\);/);
  assert.match(be, /if \(!force && Date\.now\(\) - _habitBreakAt < HABIT_BREAK_EVERY_MS\) return Promise\.resolve\('skipped'\);/);
  // A forced run after a save waits for the one under way, then reads afresh.
  assert.match(be, /if \(_habitBreakRun\) return force \? _habitBreakRun\.then\(\(\) => syncHabitBreak\(true\)\) : _habitBreakRun;/);
  // Never throws into its caller: a reminder's save or a sign-in goes on whatever it meets.
  assert.match(be, /const run = Promise\.resolve\(\)\.then\(\(\) => syncHabitsToBreak\(\{/);
  assert.match(be, /\}\)\)\.catch\(\(\) => 'skipped'\);/);
  assert.match(be, /  \} catch \(e\) \{ return Promise\.resolve\('skipped'\); \}\n\}/);
  // The device's own reminders, the account's own break, the account still the one that started it.
  assert.match(be, /isCurrent: \(\) => state\.user\?\.id === uid && signOutGen\(\) === gen,/);
  assert.match(be, /cancelAll: cancelAllLocalHabits,/);
  // Which reminders are on the device, from the OS, by the tag every one this app schedules carries.
  assert.match(be, /filter\(\(n\) => n && n\.extra && n\.extra\.route === 'habits' && n\.extra\.habitId != null\)\.map\(\(n\) => String\(n\.extra\.habitId\)\)/);
  assert.match(be, /schedule: scheduleLocalHabit,/);
  // A reminder saved while away is taken down with the rest.
  assert.match(be, /window\.dispatchEvent\(new CustomEvent\('shape:reminderSet'\)\); \} catch \(e\) \{\} \}\n\s+\/\/ Saved while away[^\n]*\n\s+void syncHabitBreak\(true\);\n\s+return row;/);
  assert.match(be, /syncBreak: \(force\) => syncHabitBreak\(force === true\) \};/);
});
