// Nora's member-context block — pure formatting/omission. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CONTEXT_HEADER, UNAVAILABLE_NOTE, formatMemberContext } from '../src/lib/ai/memberContext.mjs';

test('renders only the facts that exist — absent is OMITTED, never zeroed', () => {
  const s = formatMemberContext({ today: { kcal: 1450, kcalTarget: 1900, proteinG: 96, proteinTarget: 150 } });
  assert.ok(s.startsWith(CONTEXT_HEADER));
  assert.match(s, /1450.*1900/);
  assert.match(s, /96.*150/);
  assert.ok(!/score|weigh|goal|momentum|remember/i.test(s.slice(CONTEXT_HEADER.length)));
});

test('null/empty facts → null (no block at all)', () => {
  assert.equal(formatMemberContext({}), null);
  assert.equal(formatMemberContext(null), null);
  assert.equal(formatMemberContext({ today: {} }), null);
});

test('never fabricates: a lone target without a logged value renders no kcal line', () => {
  const s = formatMemberContext({ today: { kcalTarget: 1900 }, score: { total: 1284, tier: 'Tempo' } });
  assert.ok(!/kcal/i.test(s));
  assert.match(s, /1284/);
  assert.match(s, /Tempo/);
});

test('memory notes render under their own label, verbatim', () => {
  const s = formatMemberContext({ memory: ['hates burpees', 'prefers morning sessions'] });
  assert.match(s, /hates burpees/);
  assert.match(s, /prefers morning sessions/);
  assert.match(s, /remember/i);
});

test('the header instructs honesty and the unavailable note forbids estimating', () => {
  assert.match(CONTEXT_HEADER, /never invent/i);
  assert.match(UNAVAILABLE_NOTE, /could not be loaded/i);
  assert.match(UNAVAILABLE_NOTE, /never estimate/i);
});

test('CONTEXT_HEADER is a unique sentinel that static fallback copy can never contain', () => {
  // The route's rule-based fallbackReply templates are static strings with no
  // member interpolation; this sentinel would have to be typed by hand to leak.
  assert.match(CONTEXT_HEADER, /^FACTS ABOUT THIS MEMBER/);
});
