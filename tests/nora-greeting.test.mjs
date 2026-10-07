// Nora's greeting and four suggestions per kind of account (the Ask Nora plan, step 2).
// One source, GET /api/support/chat, so every panel greets the same account the same way.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { greetingKind, greetingFor, GREETING_KINDS } from '../src/lib/ai/noraGreeting.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

test('the kind comes from the session and membership: visitor, account, member, trainer, nutritionist, admin', () => {
  assert.equal(greetingKind(false, { isMember: true, isAdmin: true }, ['trainer']), 'visitor', 'signed out is a visitor whatever else is claimed');
  assert.equal(greetingKind(true, { isMember: false }, ['client']), 'account');
  assert.equal(greetingKind(true, null, []), 'account', 'a failed membership read promises the least a signed-in account gets');
  assert.equal(greetingKind(true, { isMember: true }, ['client']), 'member');
  assert.equal(greetingKind(true, { isMember: true, isCoach: true }, ['trainer']), 'trainer');
  assert.equal(greetingKind(true, { isMember: true, isCoach: true }, ['client', 'trainer']), 'trainer', 'a client who also trains');
  assert.equal(greetingKind(true, { isMember: true, isCoach: true }, ['nutritionist']), 'nutritionist');
  assert.equal(greetingKind(true, { isMember: true, isCoach: true, isAdmin: true }, ['trainer']), 'admin');
});

test('every kind has a greeting and exactly four suggestions, each distinct', () => {
  assert.deepEqual(GREETING_KINDS.sort(), ['account', 'admin', 'member', 'nutritionist', 'trainer', 'visitor']);
  for (const k of GREETING_KINDS) for (const plain of [false, true]) {
    const g = greetingFor(k, { plain });
    assert.equal(g.kind, k);
    assert.ok(g.text.length > 40);
    assert.equal(g.quick.length, 4, `${k}${plain ? ' plain' : ''}`);
    assert.equal(new Set(g.quick).size, 4);
  }
  assert.equal(greetingFor('nonsense').kind, 'visitor');
});

test('⚠ no greeting promises a hand-off, and each gives the address a person reads', () => {
  for (const k of GREETING_KINDS) for (const plain of [false, true]) {
    const { text } = greetingFor(k, { plain });
    assert.doesNotMatch(text, /bring in|pass (it|this) on|follow up|teammate|I'll get the team/i);
    assert.match(text, /info@theshapecommunity\.com/);
  }
});

test('⚠ a plain panel (no confirm cards) is never offered a suggestion that drafts or writes', () => {
  const WRITE = /^(Log|Draft|Assign|Move|Set|Add|Check off|Remind)\b/i;
  for (const k of GREETING_KINDS) {
    for (const q of greetingFor(k, { plain: true }).quick) assert.doesNotMatch(q, WRITE, `${k}: "${q}"`);
  }
  // …while the full panel does offer them to the accounts that have them.
  assert.ok(greetingFor('member').quick.some((q) => /^Log/.test(q)));
  assert.ok(greetingFor('trainer').quick.some((q) => /^Draft/.test(q)));
  assert.ok(greetingFor('nutritionist').quick.some((q) => /^Assign|^Set/.test(q)));
  // A visitor and a signed-in account without a plan are never offered a member's tools.
  for (const k of ['visitor', 'account']) assert.doesNotMatch(greetingFor(k).quick.join('|'), /today|my week|Log|Draft|client/i);
});

test('the three website panels ask for the greeting; the plain ones ask for the plain set', () => {
  const widget = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');
  assert.match(widget, /fetch\("\/api\/support\/chat", \{ credentials: "same-origin" \}\)/);
  assert.match(widget, /msgs\.length !== 1 \|\| msgs\[0\]\.me/, 'only an untouched thread is rewritten');
  // Applied after the saved threads hydrate, or a late hydrate restores the old seed (Codex, #2247).
  assert.match(widget, /if \(!noraGreeting \|\| !hydrated\) return;/);
  assert.match(widget, /\}, \[noraGreeting, hydrated\]\);/);
  assert.ok(widget.indexOf('}, [noraGreeting, hydrated]);') > widget.indexOf('setHydrated(true);'), 'declared after the hydrate');
  const fallback = readFileSync(join(ROOT, 'public/newdesign/globalChatButton.js'), 'utf8');
  assert.match(fallback, /\/api\/support\/chat\?plain=1/);
  const next = readFileSync(join(ROOT, 'src/components/GlobalChatButton.tsx'), 'utf8');
  assert.match(next, /\/api\/support\/chat\?plain=1/);
  const seed = readFileSync(join(ROOT, 'public/newdesign/clientChatThreads.jsx'), 'utf8');
  assert.doesNotMatch(seed, /bring in the Shape team/);
});
