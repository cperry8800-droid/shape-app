// Apple Health's daily roll-ups (mobile-app/src/services/healthkit.js). A night's hours now earn
// Shape Score points and stand over typed hours, so two things the roll-up got wrong matter:
// overlapping "asleep" samples from two sources (a watch and a ring, or AutoSleep) were added
// together, and the first day of the window was cut at the time the window began, then sent and
// written over that day's full steps and night. The check-in card's sync reads Apple Health
// without asking for permission. Run as written: the real module on a stub plugin.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
let samples = {};
let asked = null;
const HK = await loadRealModule(join(ROOT, 'mobile-app/src/services/healthkit.js'), {
  registry: new Map([['@capacitor/core', {
    Capacitor: { isNativePlatform: () => true, getPlatform: () => 'ios' },
    registerPlugin: () => ({
      querySamples: async ({ sampleName, startDate }) => { if (sampleName === 'stepCount') asked = startDate; return { samples: samples[sampleName] || [] }; },
      requestAuthorization: async () => ({ granted: true }),
    }),
  }]]),
});

const local = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi);
const iso = (d) => d.toISOString();
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

test('overlapping asleep time counts once', () => {
  const h = 3_600_000;
  assert.equal(HK.asleepSeconds([{ start: 0, end: 7 * h }, { start: 1 * h, end: 6 * h }, { start: 6.5 * h, end: 7.5 * h }]), 7.5 * 3600);
  assert.equal(HK.asleepSeconds([{ start: 0, end: 2 * h }, { start: 3 * h, end: 4 * h }]), 3 * 3600, 'two separate stretches are both counted');
  assert.equal(HK.asleepSeconds([{ start: 5, end: 1 }, { start: NaN, end: 4 }]), 0);
  assert.equal(HK.asleepSeconds([]), 0);
});

test("a night's stages either side of midnight are one night, filed under the day it ends, and a nap is not added", () => {
  // Apple Watch writes each stage as its own sample (Codex on #2404).
  const h = 3_600_000;
  const day = (ms) => (ms < 24 * h ? 'D1' : 'D2');
  const m = HK.nightsByDay([
    { start: 22 * h, end: 23.5 * h },          // core, before midnight
    { start: 23.5 * h, end: 24.5 * h },        // deep, across it
    { start: 24.75 * h, end: 30 * h },         // after a 15-minute wake
    { start: 38 * h, end: 38.5 * h },          // a nap that afternoon
  ], day);
  assert.equal(m.get('D2'), (1.5 + 1 + 5.25) * 3600, 'the stages before midnight were split off, or the nap was added');
  assert.equal(m.has('D1'), false, 'part of the night was filed under the day before');
  // Three hours apart are two sessions; the longer is the night.
  const two = HK.nightsByDay([{ start: 0, end: 1 * h }, { start: 4 * h, end: 10 * h }], () => 'D');
  assert.equal(two.get('D'), 6 * 3600);
  const near = HK.nightsByDay([{ start: 0, end: 1 * h }, { start: 3.9 * h, end: 10 * h }], () => 'D');
  assert.equal(near.get('D'), 7.1 * 3600, 'a wake under three hours split the night');
});

test('a night two sources wrote is its own hours, and only whole days are sent', async () => {
  const now = new Date();
  const today = local(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const before = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 2);
  const at = (d, h, mi = 0) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), h, mi);
  samples = {
    sleepAnalysis: [
      // Last night, from a watch and a ring: 23:00-06:00 and 23:30-06:30, so 7h 30 asleep.
      { sleepState: 'asleepCore', startDate: iso(at(y, 23)), endDate: iso(at(today, 6)), duration: 7 * 3600 },
      { sleepState: 'asleepUnspecified', startDate: iso(at(y, 23, 30)), endDate: iso(at(today, 6, 30)), duration: 7 * 3600 },
      { sleepState: 'inBed', startDate: iso(at(y, 22)), endDate: iso(at(today, 7)), duration: 9 * 3600 },
      // The night before the window's first day ended on a day not sent.
      { sleepState: 'asleepCore', startDate: iso(at(before, 1)), endDate: iso(at(before, 8)), duration: 7 * 3600 },
    ],
    stepCount: [{ value: 4000, startDate: iso(at(before, 20)), endDate: iso(at(before, 21)) }, { value: 9000, startDate: iso(at(y, 12)), endDate: iso(at(y, 13)) }],
  };
  const { days } = await HK.collectHealthKitSnapshots({ days: 2 });
  const byDay = Object.fromEntries(days.map((d) => [d.date, d.patch]));
  assert.deepEqual(Object.keys(byDay).sort(), [key(y), key(today)], 'a day cut off at the start of the window was sent');
  assert.equal(byDay[key(today)].sleep_hours, 7.5, 'a night two sources wrote was counted twice');
  assert.equal(byDay[key(y)].steps, 9000);
  // The read starts the evening before the first day, so that day's night is whole.
  assert.ok(Date.parse(asked) <= at(before, 12).getTime() && Date.parse(asked) < y.getTime(), `the read began at ${asked}`);
});

test("the check-in card's sync never asks for permission, and posts nothing when it reads nothing", () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/services/shapeBackend.js'), 'utf8');
  const fn = src.slice(src.indexOf('async function syncAppleHealth('), src.indexOf('\n}\n', src.indexOf('async function syncAppleHealth(')));
  assert.match(fn, /\{ importWorkouts = true, prompt = true, days \} = \{\}/);
  assert.match(fn, /\n  if \(prompt\) await requestHealthKitAuth\(\);\n/);
  assert.match(fn, /if \(!prompt && !rollups\.length\) return \{ ok: true, days: 0 \};/);
  assert.match(fn, /body: JSON\.stringify\(\{ days: rollups, workouts: importWorkouts \? workouts : \[\] \}\)/);
});
