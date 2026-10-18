// Apple HealthKit bridge (iOS only).
//
// HealthKit data — including everything an Apple Watch records — is only
// reachable from the native iOS app via the HealthKit entitlement; there is no
// web/OAuth API. We read recent samples on-device with our thin in-app plugin
// (ios/App/App/ShapeHealthPlugin.swift), aggregate them per day, and POST the
// daily roll-ups to /api/integrations/apple-health/sync, which writes the same
// daily_health_snapshot rows the WHOOP / Oura syncs use.
//
// registerPlugin('ShapeHealth') bridges to the native plugin on device and is a
// harmless no-op in the browser (calls reject, which we guard).

import { Capacitor, registerPlugin } from '@capacitor/core';

const ShapeHealth = registerPlugin('ShapeHealth');

// Sample-type ids understood by ShapeHealthPlugin.querySamples.
const SAMPLE = {
  steps: 'stepCount',
  heartRate: 'heartRate',
  restingHeartRate: 'restingHeartRate',
  hrv: 'heartRateVariabilitySDNN',
  activeEnergy: 'activeEnergyBurned',
  distance: 'distanceWalkingRunning',
  sleep: 'sleepAnalysis',
  workout: 'workoutType',
  water: 'dietaryWater',
};
const LOOKBACK_DAYS = 14;

export function isHealthKitPlatform() {
  try {
    return Capacitor?.isNativePlatform?.() && Capacitor.getPlatform?.() === 'ios';
  } catch {
    return false;
  }
}

function dayKey(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// A query that failed is null, not an empty list: a type the member never allowed reads as empty,
// with no error, so only null says the read itself did not happen.
async function query(sampleName, startISO, endISO) {
  try {
    const res = await ShapeHealth.querySamples({ sampleName, startDate: startISO, endDate: endISO, limit: 0 });
    return Array.isArray(res?.samples) ? res.samples : [];
  } catch {
    return null;
  }
}

// Ask the user for read access. Returns true if the prompt completed (HealthKit
// never reports which types were granted — that's by Apple's design).
export async function requestHealthKitAuth() {
  if (!isHealthKitPlatform()) throw new Error('Apple Health is only available in the iOS app.');
  const res = await ShapeHealth.requestAuthorization();
  return !!res?.granted;
}

// The asleep time in a set of { start, end } intervals (ms), counting overlaps once. Two
// sources writing the same night to Apple Health (a watch and a ring, or AutoSleep) used to
// count it twice, and a night's hours now earn Shape Score points.
export function asleepSeconds(intervals) {
  const xs = intervals.filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let cur = null;
  for (const x of xs) {
    if (cur && x.start <= cur.end) { cur.end = Math.max(cur.end, x.end); continue; }
    if (cur) total += cur.end - cur.start;
    cur = { start: x.start, end: x.end };
  }
  if (cur) total += cur.end - cur.start;
  return total / 1000;
}

// ⚠ A NIGHT IS ONE SESSION, FILED UNDER THE DAY IT ENDS (Codex on #2404). Apple Watch writes each
// sleep stage as its own sample, so the stages that ended before midnight landed on the day before
// and split one night across two days. Asleep samples less than three hours apart are one session,
// filed under the local day its last sample ends; a day's night is its longest session, counted
// once where samples overlap, so an afternoon nap is not added to it. `dayOf(ms)` is the local day.
const SESSION_GAP_MS = 3 * 3_600_000;
export function nightsByDay(intervals, dayOf) {
  const xs = intervals.filter((x) => Number.isFinite(x.start) && Number.isFinite(x.end) && x.end > x.start).sort((a, b) => a.start - b.start);
  const sessions = [];
  for (const x of xs) {
    const cur = sessions[sessions.length - 1];
    if (cur && x.start - cur.end < SESSION_GAP_MS) { cur.end = Math.max(cur.end, x.end); cur.items.push(x); continue; }
    sessions.push({ end: x.end, items: [x] });
  }
  const out = new Map();
  for (const s of sessions) {
    const day = dayOf(s.end);
    const secs = asleepSeconds(s.items);
    if (day && secs > (out.get(day) || 0)) out.set(day, secs);
  }
  return out;
}

// Read recent samples and roll them up into per-day snapshot patches plus a flat
// list of workouts (for optional import). Returns { days, workouts, waterSamples }.
// ⚠ EVERY DAY SENT IS A WHOLE DAY: `days` local days ending today, each from its own midnight,
// read from the evening before the first so its night is whole too. A sync overwrites each day it
// sends, so a day cut off at the start of the window would replace that day's full steps and
// night with part of them.
export async function collectHealthKitSnapshots({ days = LOOKBACK_DAYS } = {}) {
  if (!isHealthKitPlatform()) throw new Error('Apple Health is only available in the iOS app.');
  const end = new Date();
  const first = new Date(end.getFullYear(), end.getMonth(), end.getDate() - (Math.max(1, days) - 1));
  const firstKey = dayKey(first);
  const start = new Date(first.getTime() - 12 * 3_600_000);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const read = await Promise.all([
    query(SAMPLE.steps, startISO, endISO),
    query(SAMPLE.heartRate, startISO, endISO),
    query(SAMPLE.restingHeartRate, startISO, endISO),
    query(SAMPLE.hrv, startISO, endISO),
    query(SAMPLE.activeEnergy, startISO, endISO),
    query(SAMPLE.distance, startISO, endISO),
    query(SAMPLE.sleep, startISO, endISO),
    query(SAMPLE.workout, startISO, endISO),
    query(SAMPLE.water, startISO, endISO),
  ]);
  // ⚠ A READ THAT FAILED IS AN ERROR, NOT AN EMPTY DAY (Codex on #2404). The check-in card's sync
  // took an empty answer as a sync that worked and waited 30 minutes before trying again.
  if (read.every((r) => r === null)) throw new Error('Apple Health could not be read.');
  const [steps, heart, resting, hrv, energy, dist, sleep, workouts, water] = read.map((r) => r || []);
  // ⚠ WATER IS SENT ONLY WHEN THE WINDOW HOLDS SOME. Each day's reading replaces Apple Health's
  // share of that day's total (set_apple_health_water), and HealthKit reads a type it was never
  // allowed as empty, with no error. So a phone never asked for water, or a failed read, would send
  // 0 and take water another phone recorded off the total. With water in the window, every day in
  // it is sent, 0 included, so water deleted in Apple Health leaves the total too.
  const waterInWindow = read[8] === null ? null : water.filter((s) => (dayKey(s.startDate) || '') >= firstKey).length;
  const waterSeen = waterInWindow > 0;

  const acc = new Map();
  const bucket = (key) => {
    if (!acc.has(key)) acc.set(key, { steps: 0, energy: 0, distanceM: 0, hr: [], resting: [], hrv: [], workoutMin: 0, waterL: 0 });
    return acc.get(key);
  };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));

  for (const s of steps) { const k = dayKey(s.startDate); if (k) bucket(k).steps += num(s.value) || 0; }
  for (const s of energy) { const k = dayKey(s.startDate); if (k) bucket(k).energy += num(s.value) || 0; }
  for (const s of dist) { const k = dayKey(s.startDate); if (k) bucket(k).distanceM += num(s.value) || 0; }
  if (waterSeen) {
    for (let d = new Date(first); dayKey(d) <= dayKey(end); d.setDate(d.getDate() + 1)) bucket(dayKey(d));
    for (const s of water) { const k = dayKey(s.startDate); if (k) bucket(k).waterL += num(s.value) || 0; }
  }
  for (const s of heart) { const k = dayKey(s.startDate); const v = num(s.value); if (k && Number.isFinite(v)) bucket(k).hr.push(v); }
  for (const s of resting) { const k = dayKey(s.startDate); const v = num(s.value); if (k && Number.isFinite(v)) bucket(k).resting.push(v); }
  for (const s of hrv) { const k = dayKey(s.startDate); const v = num(s.value); if (k && Number.isFinite(v)) bucket(k).hrv.push(v); }
  // Only "asleep" states count toward sleep hours (not inBed / awake); each night is one session
  // filed under the day it ends (nightsByDay, above).
  const asleep = [];
  for (const s of sleep) {
    const state = String(s.sleepState ?? '').toLowerCase();
    if (!state.startsWith('asleep')) continue;
    const endMs = Date.parse(s.endDate);
    const startMs = Number.isFinite(Date.parse(s.startDate)) ? Date.parse(s.startDate) : endMs - num(s.duration) * 1000;
    if (Number.isFinite(startMs) && Number.isFinite(endMs)) asleep.push({ start: startMs, end: endMs });
  }
  const nights = nightsByDay(asleep, dayKey);
  for (const k of nights.keys()) bucket(k);

  const flatWorkouts = [];
  for (const w of workouts) {
    const k = dayKey(w.startDate);
    const mins = Number.isFinite(num(w.duration)) ? Math.round(num(w.duration) / 60) : null;
    if (k && mins) bucket(k).workoutMin += mins;
    flatWorkouts.push({
      externalId: String(w.uuid || `${w.startDate}-${w.activityName || 'workout'}`),
      activity: String(w.activityName || 'workout').toLowerCase(),
      startedAt: w.startDate || null,
      endedAt: w.endDate || null,
      durationMin: mins,
      calories: Number.isFinite(num(w.totalEnergyBurned)) ? Math.round(num(w.totalEnergyBurned)) : null,
      distanceM: Number.isFinite(num(w.totalDistance)) ? Math.round(num(w.totalDistance)) : null,
    });
  }

  const avg = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  const max = (arr) => (arr.length ? Math.max(...arr) : null);

  const daysOut = [];
  for (const [date, b] of acc) {
    if (date < firstKey) continue; // the evening before the window: read for its night only
    const sleepSec = nights.get(date) || 0;
    daysOut.push({
      date,
      patch: {
        steps: b.steps ? Math.round(b.steps) : null,
        calories: b.energy ? Math.round(b.energy) : null,
        avg_heart_rate: b.hr.length ? Math.round(avg(b.hr)) : null,
        max_heart_rate: b.hr.length ? Math.round(max(b.hr)) : null,
        resting_hr: b.resting.length ? Math.round(avg(b.resting)) : null,
        hrv_ms: b.hrv.length ? Number(avg(b.hrv).toFixed(1)) : null,
        sleep_hours: sleepSec ? Number((sleepSec / 3600).toFixed(2)) : null,
        workout_minutes: b.workoutMin || null,
        // Added to the glasses logged in Shape by the route (set_apple_health_water).
        hydration_l: waterSeen ? Math.round(b.waterL * 100) / 100 : null,
      },
    });
  }

  // waterSamples: the water samples in the window, or null when the water read failed.
  return { days: daysOut, workouts: flatWorkouts, waterSamples: waterInWindow };
}
