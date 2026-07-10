// Nora's member-tool pure logic. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matchHabit, waterLiters, REMINDER_KINDS, validReminderTime } from '../src/lib/ai/memberTools.mjs';

const HABITS = [
  { id: 'h1', name: 'Drink 3 glasses of water' },
  { id: 'h2', name: 'Morning walk' },
  { id: 'h3', name: 'Walk the dog' },
];

test('matchHabit: one clear hit proceeds; exact beats substring; ambiguity and misses fail closed', () => {
  assert.equal(matchHabit(HABITS, 'morning walk').habit.id, 'h2'); // exact (case-insensitive)
  assert.equal(matchHabit(HABITS, 'water').habit.id, 'h1');        // single substring hit
  const amb = matchHabit(HABITS, 'walk');                           // h2 + h3
  assert.equal(amb.error, 'ambiguous');
  assert.deepEqual(amb.candidates.map(c => c.id).sort(), ['h2', 'h3']);
  const miss = matchHabit(HABITS, 'meditate');
  assert.equal(miss.error, 'not_found');
  assert.ok(miss.names.includes('Morning walk'));
  assert.equal(matchHabit([], 'anything').error, 'not_found');
  assert.equal(matchHabit(HABITS, '  ').error, 'not_found'); // blank query never matches everything
});

test('waterLiters converts honestly and never guesses', () => {
  assert.equal(waterLiters(500, 'ml'), 0.5);
  assert.equal(waterLiters(16, 'oz'), 0.473);
  assert.equal(waterLiters(0, 'ml'), null);
  assert.equal(waterLiters(-2, 'oz'), null);
  assert.equal(waterLiters(500, 'cups'), null);
  assert.equal(waterLiters('x', 'ml'), null);
});

test('reminder kinds + time mirror the route contract', () => {
  assert.deepEqual(REMINDER_KINDS, ['weigh_in', 'checkin', 'water', 'photo', 'custom']);
  assert.ok(validReminderTime('07:30') && validReminderTime('23:59'));
  assert.ok(!validReminderTime('7:30') && !validReminderTime('24:00') && !validReminderTime('') && !validReminderTime('07:30pm'));
});
