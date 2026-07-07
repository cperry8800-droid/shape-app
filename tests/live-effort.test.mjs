import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bsLiveEffort, BS_EFFORT_RAMP, BS_EFFORT_HRMAX } from '../mobile-app/src/services/liveEffort.mjs';

test('bpm band edges (HRmax 190: 60/70/80/90% = 114/133/152/171)', () => {
  assert.equal(bsLiveEffort({ bpm: 113 }).zone, 1);
  assert.equal(bsLiveEffort({ bpm: 114 }).zone, 2);
  assert.equal(bsLiveEffort({ bpm: 133 }).zone, 3);
  assert.equal(bsLiveEffort({ bpm: 152 }).zone, 4);
  assert.equal(bsLiveEffort({ bpm: 171 }).zone, 5);
  assert.equal(bsLiveEffort({ bpm: 152 }).label, 'Z4');
  assert.equal(bsLiveEffort({ bpm: 152 }).source, 'hr');
});

test('bpm wins over rpe', () => {
  assert.equal(bsLiveEffort({ bpm: 120, rpe: 9 }).zone, 2);
});

test('rpe fallback bands', () => {
  assert.equal(bsLiveEffort({ rpe: 4 }).zone, 1);
  assert.equal(bsLiveEffort({ rpe: 5 }).zone, 2);
  assert.equal(bsLiveEffort({ rpe: 7 }).zone, 3);
  assert.equal(bsLiveEffort({ rpe: 8 }).zone, 4);
  assert.equal(bsLiveEffort({ rpe: 9 }).zone, 5);
  assert.equal(bsLiveEffort({ rpe: 8 }).source, 'rpe');
});

test('junk / nothing → null', () => {
  assert.equal(bsLiveEffort({}), null);
  assert.equal(bsLiveEffort({ bpm: 0 }), null);
  assert.equal(bsLiveEffort({ bpm: -5, rpe: 'x' }), null);
  assert.equal(bsLiveEffort({ rpe: 0 }), null);
});

test('ramp covers all five zones with the Session Details stops', () => {
  assert.equal(BS_EFFORT_RAMP[1], '#34d6c5');
  assert.equal(BS_EFFORT_RAMP[2], '#34d6c5');
  assert.equal(BS_EFFORT_RAMP[3], '#d8b25a');
  assert.equal(BS_EFFORT_RAMP[4], '#e8843c');
  assert.equal(BS_EFFORT_RAMP[5], '#e0463c');
  assert.equal(BS_EFFORT_HRMAX, 190);
});
