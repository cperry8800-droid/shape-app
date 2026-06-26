import test from 'node:test';
import assert from 'node:assert/strict';
import { computeRecoveryReadiness, readinessBand, recoveryReadinessFromSeries } from '../mobile-app/src/services/recoveryReadiness.mjs';

test('no scoreable input → null (never a fabricated 0)', () => {
  assert.equal(computeRecoveryReadiness({}), null);
  assert.equal(computeRecoveryReadiness({ target: 7.5 }), null);          // target alone is not a component
  assert.equal(computeRecoveryReadiness({ sleepHours: 0 }), null);        // non-positive hours = no reading
  assert.equal(computeRecoveryReadiness({ restingHr: 50 }), null);        // RHR with no baseline = no component
  assert.equal(computeRecoveryReadiness({ hrv: 60 }), null);             // HRV with no baseline = no component
});

test('duration component: hours vs 7.5h target', () => {
  assert.equal(computeRecoveryReadiness({ sleepHours: 7.5 }), 100);
  assert.equal(computeRecoveryReadiness({ sleepHours: 3.75 }), 50);
  assert.equal(computeRecoveryReadiness({ sleepHours: 9 }), 100);         // capped, oversleep not > 100
  assert.equal(computeRecoveryReadiness({ sleepHours: 6, target: 8 }), 75);
});

test('efficiency component: 60% = 0, 90%+ = 100', () => {
  assert.equal(computeRecoveryReadiness({ efficiency: 90 }), 100);
  assert.equal(computeRecoveryReadiness({ efficiency: 60 }), 0);
  assert.equal(computeRecoveryReadiness({ efficiency: 75 }), 50);
  assert.equal(computeRecoveryReadiness({ efficiency: 40 }), 0);          // clamped
});

test('RHR component: at/below baseline = 100, -10 per bpm above', () => {
  assert.equal(computeRecoveryReadiness({ restingHr: 50, rhrBaseline: 50 }), 100);
  assert.equal(computeRecoveryReadiness({ restingHr: 45, rhrBaseline: 50 }), 100);  // below baseline = good
  assert.equal(computeRecoveryReadiness({ restingHr: 55, rhrBaseline: 50 }), 50);   // +5 bpm
  assert.equal(computeRecoveryReadiness({ restingHr: 62, rhrBaseline: 50 }), 0);    // +12 bpm clamps to 0
});

test('HRV component: baseline = 80, +/-40% = +/-20', () => {
  assert.equal(computeRecoveryReadiness({ hrv: 60, hrvBaseline: 60 }), 80);
  assert.equal(computeRecoveryReadiness({ hrv: 84, hrvBaseline: 60 }), 100);  // +40%
  assert.equal(computeRecoveryReadiness({ hrv: 36, hrvBaseline: 60 }), 60);   // -40%
});

test('device score passes through (clamped)', () => {
  assert.equal(computeRecoveryReadiness({ deviceScore: 75 }), 75);
  assert.equal(computeRecoveryReadiness({ deviceScore: 120 }), 100);
  assert.equal(computeRecoveryReadiness({ deviceScore: 0 }), 0);             // a real 0 device score is valid
});

test('weighted blend over present components only', () => {
  // dur(100,.30) + eff(100,.15) + device(80,.25), wsum .70 → (30+15+20)/.70 = 92.857 → 93
  assert.equal(computeRecoveryReadiness({ sleepHours: 7.5, efficiency: 90, deviceScore: 80 }), 93);
  // all five present (weights sum to 1.0): dur100 eff80 rhr80 hrv80 dev70 → 83.5 → 84
  assert.equal(
    computeRecoveryReadiness({ sleepHours: 7.5, efficiency: 84, restingHr: 52, rhrBaseline: 50, hrv: 60, hrvBaseline: 60, deviceScore: 70 }),
    84
  );
});

test('readinessBand thresholds', () => {
  assert.equal(readinessBand(null), null);
  assert.equal(readinessBand(85).label, 'Primed');
  assert.equal(readinessBand(70).label, 'Ready');
  assert.equal(readinessBand(50).label, 'Run down');
  assert.equal(readinessBand(20).label, 'Depleted');
});

test('recoveryReadinessFromSeries: null when no sleep history', () => {
  assert.equal(recoveryReadinessFromSeries({}), null);
  assert.equal(recoveryReadinessFromSeries({ sleep: [] }), null);
});

test('recoveryReadinessFromSeries: tonight vs trailing baseline', () => {
  // 5 nights of RHR; baseline = mean of the first 4 (50,50,50,50)=50, tonight 55 → rhr score 50
  const series = {
    sleep: [{ date: 'a', value: 7.5 }],                 // dur 100
    sleepEfficiency: [{ date: 'a', value: 90 }],        // eff 100
    restingHr: [50, 50, 50, 50, 55].map((v, i) => ({ date: `d${i}`, value: v })),  // rhr 50 (tonight 55 vs base 50)
  };
  const r = recoveryReadinessFromSeries(series);
  // dur100(.30) eff100(.15) rhr50(.12), wsum .57 → (30+15+6)/.57 = 89.47 → 89
  assert.equal(r.score, 89);
  assert.equal(r.band.label, 'Primed');
});

test('recoveryReadinessFromSeries: needs >= 4 prior nights to baseline RHR/HRV', () => {
  // only 3 RHR points → no baseline → RHR drops out; sleep+eff still score
  const r = recoveryReadinessFromSeries({
    sleep: [{ date: 'a', value: 7.5 }],
    sleepEfficiency: [{ date: 'a', value: 90 }],
    restingHr: [50, 50, 55].map((v, i) => ({ date: `d${i}`, value: v })),
  });
  // dur100(.30) eff100(.15) only → 100
  assert.equal(r.score, 100);
});
