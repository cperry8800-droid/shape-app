// tests/funnel.test.mjs
// Pure funnel shaping: raw per-step counts -> rows with drop-off % + biggest-drop flag.
// Run: node --test
import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFunnel, isAnalyticsEvent, FUNNEL_STEPS, ANALYTICS_EVENTS } from '../src/lib/funnel.mjs';

test('7 ordered steps, signup first', () => {
  assert.equal(FUNNEL_STEPS.length, 7);
  assert.equal(FUNNEL_STEPS[0].key, 'signup');
  assert.deepEqual(FUNNEL_STEPS.map(s => s.key),
    ['signup', 'onboarding', 'first_workout', 'first_nutrition', 'paid', 'day30', 'day90']);
});

test('computes pctOfSignup and pctDrop, flags the biggest drop', () => {
  const rows = buildFunnel({
    signup: 1000, onboarding: 850, first_workout: 700,
    first_nutrition: 600, paid: 200, day30: 120, day90: 60,
  });
  assert.equal(rows[0].pctOfSignup, 100);
  assert.equal(rows[0].pctDrop, 0);
  assert.equal(rows[1].pctOfSignup, 85);
  assert.equal(rows[1].pctDrop, 15);              // 1000 -> 850
  assert.equal(rows[2].pctDrop, 18);              // 850 -> 700 (17.6 -> 18)
  // biggest single drop is paid: 600 -> 200 = 67%
  const biggest = rows.find(r => r.isBiggestDrop);
  assert.equal(biggest.key, 'paid');
  assert.equal(rows.filter(r => r.isBiggestDrop).length, 1);
});

test('zero signups -> all zero, no biggest drop, never divides by zero', () => {
  const rows = buildFunnel({});
  assert.equal(rows.length, 7);
  assert.equal(rows[0].pctOfSignup, 0);
  assert.equal(rows.every(r => r.pctDrop === 0), true);
  assert.equal(rows.some(r => r.isBiggestDrop), false);
});

test('event whitelist is exactly the 5 names', () => {
  assert.deepEqual([...ANALYTICS_EVENTS].sort(),
    ['app_opened', 'checkout_started', 'onboarding_started', 'paywall_viewed', 'workout_started']);
  assert.equal(isAnalyticsEvent('app_opened'), true);
  assert.equal(isAnalyticsEvent('drop_table'), false);
  assert.equal(isAnalyticsEvent(''), false);
  assert.equal(isAnalyticsEvent(null), false);
});
