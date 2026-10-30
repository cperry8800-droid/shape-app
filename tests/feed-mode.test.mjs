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

test('following: adds the followers and friends tiers and scopes to follows + self', () => {
  // A friend is someone the viewer follows, so their friends-tier posts are inside
  // this author scope; RLS decides whether the follow is mutual.
  assert.deepEqual(bsFeedQuerySpec('following', 'me', ['a', 'b']),
    { privacyIn: ['public', 'community', 'followers', 'friends'], authorIn: ['a', 'b', 'me'] });
});

test('universal never asks for a followers or friends post', () => {
  const { privacyIn } = bsFeedQuerySpec('universal', 'me', ['a']);
  assert.ok(!privacyIn.includes('followers') && !privacyIn.includes('friends'));
});

test('following: dedupes and tolerates falsy uid / non-array ids', () => {
  assert.deepEqual(bsFeedQuerySpec('following', 'a', ['a', 'b']).authorIn, ['a', 'b']);
  assert.deepEqual(bsFeedQuerySpec('following', null, null).authorIn, []);
});
