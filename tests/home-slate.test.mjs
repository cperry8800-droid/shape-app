import test from 'node:test';
import assert from 'node:assert/strict';
import { bsHomeTimeMinutes, bsHomeSlateSort } from '../mobile-app/src/services/homeSlate.mjs';

test('timeMinutes: AM parsing', () => {
  assert.equal(bsHomeTimeMinutes('7:00 AM'), 420);
  assert.equal(bsHomeTimeMinutes('9:05 AM'), 545);
  assert.equal(bsHomeTimeMinutes('12:00 AM'), 0);
  assert.equal(bsHomeTimeMinutes('12:01 AM'), 1);
});

test('timeMinutes: PM parsing', () => {
  assert.equal(bsHomeTimeMinutes('12:30 PM'), 750);
  assert.equal(bsHomeTimeMinutes('12:00 PM'), 720);
  assert.equal(bsHomeTimeMinutes('7:00 PM'), 1140);
  assert.equal(bsHomeTimeMinutes('11:59 PM'), 1439);
});

test('timeMinutes: null/empty/unparseable → null', () => {
  assert.equal(bsHomeTimeMinutes(null), null);
  assert.equal(bsHomeTimeMinutes(undefined), null);
  assert.equal(bsHomeTimeMinutes(''), null);
  assert.equal(bsHomeTimeMinutes('—'), null);
  assert.equal(bsHomeTimeMinutes('TBD'), null);
  assert.equal(bsHomeTimeMinutes('08:30'), null); // 24h form is not the display format
  assert.equal(bsHomeTimeMinutes('13:00 PM'), null); // out-of-range hour
});

test('slateSort: orders timed rows ascending by time', () => {
  const rows = [
    { time: '12:30 PM', k: 'lunch' },
    { time: '7:00 AM', k: 'breakfast' },
    { time: '6:00 PM', k: 'dinner' },
  ];
  const sorted = bsHomeSlateSort(rows);
  assert.deepEqual(sorted.map((r) => r.k), ['breakfast', 'lunch', 'dinner']);
});

test('slateSort: is stable — ties keep original relative order', () => {
  const rows = [
    { time: '7:00 AM', k: 'a' },
    { time: '7:00 AM', k: 'b' },
    { time: '7:00 AM', k: 'c' },
  ];
  const sorted = bsHomeSlateSort(rows);
  assert.deepEqual(sorted.map((r) => r.k), ['a', 'b', 'c']);
});

test('slateSort: untimed rows land after all timed rows, in original order', () => {
  const rows = [
    { time: null, k: 'habit1' },
    { time: '12:30 PM', k: 'lunch' },
    { time: '', k: 'habit2' },
    { time: '7:00 AM', k: 'breakfast' },
    { time: 'TBD', k: 'coachnote' },
  ];
  const sorted = bsHomeSlateSort(rows);
  assert.deepEqual(sorted.map((r) => r.k), ['breakfast', 'lunch', 'habit1', 'habit2', 'coachnote']);
});

test('slateSort: all untimed preserves original order; empty/null input is safe', () => {
  const rows = [{ k: 'x' }, { k: 'y' }, { k: 'z' }];
  assert.deepEqual(bsHomeSlateSort(rows).map((r) => r.k), ['x', 'y', 'z']);
  assert.deepEqual(bsHomeSlateSort([]), []);
  assert.deepEqual(bsHomeSlateSort(null), []);
});
