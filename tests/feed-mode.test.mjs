import test from 'node:test';
import assert from 'node:assert/strict';
import { bsFeedQuerySpec } from '../mobile-app/src/services/feedMode.mjs';

test('universal: public+community, no author scoping', () => {
  assert.deepEqual(bsFeedQuerySpec('universal', 'me', ['a', 'b']),
    { privacyIn: ['public', 'community'], authorIn: null });
});

test('unknown/absent mode falls back to universal', () => {
  assert.deepEqual(bsFeedQuerySpec('', 'me', ['a']),
    { privacyIn: ['public', 'community'], authorIn: null });
  assert.deepEqual(bsFeedQuerySpec(undefined, null, null),
    { privacyIn: ['public', 'community'], authorIn: null });
});

test('following: adds followers tier and scopes to follows + self', () => {
  assert.deepEqual(bsFeedQuerySpec('following', 'me', ['a', 'b']),
    { privacyIn: ['public', 'community', 'followers'], authorIn: ['a', 'b', 'me'] });
});

test('following: dedupes and tolerates falsy uid / non-array ids', () => {
  assert.deepEqual(bsFeedQuerySpec('following', 'a', ['a', 'b']).authorIn, ['a', 'b']);
  assert.deepEqual(bsFeedQuerySpec('following', null, null).authorIn, []);
});
