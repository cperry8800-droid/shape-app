import test from 'node:test';
import assert from 'node:assert/strict';
import { bsMealDirty, bsMealCtaLabel } from '../mobile-app/src/services/mealLoggerState.mjs';

const base = [
  { name: 'Greek yogurt + almonds', qty: '1 serving', kcal: 280, p: 22, c: 26, f: 10, on: true },
];

test('bsMealDirty: pristine when portion 1 and ings match initial', () => {
  assert.equal(bsMealDirty(1, base, base), false);
  assert.equal(bsMealDirty(1, base.map(x => ({ ...x })), base), false); // fresh copies, same values
});

test('bsMealDirty: portion change makes it dirty', () => {
  assert.equal(bsMealDirty(0.75, base, base), true);
  assert.equal(bsMealDirty(1.5, base, base), true);
});

test('bsMealDirty: toggling, editing, adding, removing an ingredient is dirty', () => {
  assert.equal(bsMealDirty(1, [{ ...base[0], on: false }], base), true);          // toggled off
  assert.equal(bsMealDirty(1, [{ ...base[0], kcal: 210 }], base), true);          // edited
  assert.equal(bsMealDirty(1, [...base, { ...base[0], name: 'Banana' }], base), true); // added
  assert.equal(bsMealDirty(1, [], base), true);                                    // removed
});

test('bsMealCtaLabel: pristine planned meal reads "as planned"', () => {
  assert.equal(bsMealCtaLabel({ dirty: false, portion: 1, kcal: 280, hasPlanned: true }), 'Log as planned →');
});

test('bsMealCtaLabel: free log (no planned) never says "as planned"', () => {
  assert.equal(bsMealCtaLabel({ dirty: false, portion: 1, kcal: 340, hasPlanned: false }), 'Log · 340 kcal →');
});

test('bsMealCtaLabel: adjusted reprices; portion suffix only when != 1', () => {
  assert.equal(bsMealCtaLabel({ dirty: true, portion: 0.75, kcal: 210, hasPlanned: true }), 'Log · 210 kcal · 0.75× →');
  assert.equal(bsMealCtaLabel({ dirty: true, portion: 1, kcal: 300, hasPlanned: true }), 'Log · 300 kcal →');
  assert.equal(bsMealCtaLabel({ dirty: true, portion: 1.5, kcal: 450, hasPlanned: true }), 'Log · 450 kcal · 1.5× →');
});
