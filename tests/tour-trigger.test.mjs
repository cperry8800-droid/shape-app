import test from 'node:test';
import assert from 'node:assert/strict';
import { shouldAutoShowTour } from '../public/newdesign/tourTrigger.mjs';

const now = Date.UTC(2026, 5, 20, 12, 0, 0); // 2026-06-20T12:00:00Z
const hoursAgo = (h) => new Date(now - h * 3600e3).toISOString();

test('shows for a fresh account that has not seen it', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(2), false, now), true);
});

test('does not show once seen', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(2), true, now), false);
});

test('does not show for an account older than 24h', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(30), false, now), false);
});

test('does not show with no createdAt (signed out / unknown)', () => {
  assert.equal(shouldAutoShowTour(null, false, now), false);
  assert.equal(shouldAutoShowTour('', false, now), false);
});

test('honors a custom maxAgeHours', () => {
  assert.equal(shouldAutoShowTour(hoursAgo(2), false, now, 1), false); // 2h > 1h
  assert.equal(shouldAutoShowTour(hoursAgo(0.5), false, now, 1), true);
});

test('does not throw on a garbage date (treats as no-show)', () => {
  assert.equal(shouldAutoShowTour('not-a-date', false, now), false);
});
