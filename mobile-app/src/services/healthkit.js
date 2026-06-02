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

async function query(sampleName, startISO, endISO) {
  try {
    const res = await ShapeHealth.querySamples({ sampleName, startDate: startISO, endDate: endISO, limit: 0 });
    return Array.isArray(res?.samples) ? res.samples : [];
  } catch {
    return [];
  }
}

// Ask the user for read access. Returns true if the prompt completed (HealthKit
// never reports which types were granted — that's by Apple's design).
export async function requestHealthKitAuth() {
  if (!isHealthKitPlatform()) throw new Error('Apple Health is only available in the iOS app.');
  const res = await ShapeHealth.requestAuthorization();
  return !!res?.granted;
}

// Read recent samples and roll them up into per-day snapshot patches plus a flat
// list of workouts (for optional import). Returns { days, workouts }.
export async function collectHealthKitSnapshots({ days = LOOKBACK_DAYS } = {}) {
  if (!isHealthKitPlatform()) throw new Error('Apple Health is only available in the iOS app.');
  const end = new Date();
  const start = new Date(end.getTime() - days * 86_400_000);
  const startISO = start.toISOString();
  const endISO = end.toISOString();

  const [steps, heart, resting, hrv, energy, dist, sleep, workouts] = await Promise.all([
    query(SAMPLE.steps, startISO, endISO),
    query(SAMPLE.heartRate, startISO, endISO),
    query(SAMPLE.restingHeartRate, startISO, endISO),
    query(SAMPLE.hrv, startISO, endISO),
    query(SAMPLE.activeEnergy, startISO, endISO),
    query(SAMPLE.distance, startISO, endISO),
    query(SAMPLE.sleep, startISO, endISO),
    query(SAMPLE.workout, startISO, endISO),
  ]);

  const acc = new Map();
  const bucket = (key) => {
    if (!acc.has(key)) acc.set(key, { steps: 0, energy: 0, distanceM: 0, hr: [], resting: [], hrv: [], sleepSec: 0, workoutMin: 0 });
    return acc.get(key);
  };
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : Number(v));

  for (const s of steps) { const k = dayKey(s.startDate); if (k) bucket(k).steps += num(s.value) || 0; }
  for (const s of energy) { const k = dayKey(s.startDate); if (k) bucket(k).energy += num(s.value) || 0; }
  for (const s of dist) { const k = dayKey(s.startDate); if (k) bucket(k).distanceM += num(s.value) || 0; }
  for (const s of heart) { const k = dayKey(s.startDate); const v = num(s.value); if (k && Number.isFinite(v)) bucket(k).hr.push(v); }
  for (const s of resting) { const k = dayKey(s.startDate); const v = num(s.value); if (k && Number.isFinite(v)) bucket(k).resting.push(v); }
  for (const s of hrv) { const k = dayKey(s.startDate); const v = num(s.value); if (k && Number.isFinite(v)) bucket(k).hrv.push(v); }
  for (const s of sleep) {
    // Only "asleep" states count toward sleep hours (not inBed / awake).
    const state = String(s.sleepState ?? '').toLowerCase();
    if (!state.startsWith('asleep')) continue;
    const k = dayKey(s.endDate || s.startDate);
    const secs = num(s.duration);
    if (k && Number.isFinite(secs)) bucket(k).sleepSec += Math.max(0, secs);
  }

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
    daysOut.push({
      date,
      patch: {
        steps: b.steps ? Math.round(b.steps) : null,
        calories: b.energy ? Math.round(b.energy) : null,
        avg_heart_rate: b.hr.length ? Math.round(avg(b.hr)) : null,
        max_heart_rate: b.hr.length ? Math.round(max(b.hr)) : null,
        resting_hr: b.resting.length ? Math.round(avg(b.resting)) : null,
        hrv_ms: b.hrv.length ? Number(avg(b.hrv).toFixed(1)) : null,
        sleep_hours: b.sleepSec ? Number((b.sleepSec / 3600).toFixed(2)) : null,
        workout_minutes: b.workoutMin || null,
      },
    });
  }

  return { days: daysOut, workouts: flatWorkouts };
}
