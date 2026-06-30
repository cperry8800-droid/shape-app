import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergePostPatch } from '../mobile-app/src/services/communityPostPatch.mjs';

test('preserves existing keys not named in the patch', () => {
  const existing = { kind: 'workout', workoutStats: [{ l: 'Load', v: '245 lb' }], coach: 'Maya', mentions: [{ name: 'A' }] };
  const out = mergePostPatch(existing, { video_url: 'https://x/v.mp4' });
  assert.equal(out.coach, 'Maya');
  assert.deepEqual(out.workoutStats, [{ l: 'Load', v: '245 lb' }]);
  assert.equal(out.video_url, 'https://x/v.mp4');
  assert.deepEqual(out.mentions, [{ name: 'A' }]);
});

test('clears video when patch sets video_url to empty string', () => {
  const out = mergePostPatch({ kind: 'video', video_url: 'https://x/v.mp4' }, { video_url: '' });
  assert.equal('video_url' in out, false);
});

test('stamps editedAt and overwrites changed keys', () => {
  const out = mergePostPatch({ kind: 'note' }, { kind: 'photo', editedAt: '2026-06-22T00:00:00Z' });
  assert.equal(out.kind, 'photo');
  assert.equal(out.editedAt, '2026-06-22T00:00:00Z');
});

test('never returns the same reference (no mutation of the input)', () => {
  const existing = { kind: 'note' };
  const out = mergePostPatch(existing, { note_touched: true });
  assert.notEqual(out, existing);
  assert.equal('note_touched' in existing, false);
});
