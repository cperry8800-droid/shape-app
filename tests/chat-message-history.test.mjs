// The chat bubble reads the member's REAL conversations.
//
// ⚠ IT SHIPPED WITH NONE. `clientChatThreads.jsx` types Maya Okafor, Marcus J.
// and the rest into the file; a thread only became DB-backed when something
// handed `__openChat({ conversationId })` an explicit id, and even then the poll
// only fetched messages NEWER than `since` — so nothing ever loaded a thread's
// back-history. A member who messaged their coach in the app opened the bubble
// on the web and saw invented messages from people who do not exist.
//
// Every assertion here guards a way that can silently regress to the demo cast
// or to a WRONG claim about a member's inbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const WIDGET = stripComments(readFileSync('public/newdesign/chatWidget.jsx', 'utf8'));
// The block under test, so a match elsewhere in a 2,000-line file cannot satisfy
// an assertion about it.
const BLOCK = (() => {
  const i = WIDGET.indexOf('const [threadsLive, setThreadsLive]');
  assert.ok(i > 0, 'the live-threads block is gone — re-anchor this file');
  const j = WIDGET.indexOf('}, [threadsLive, tabs, hydrated]);', i);
  assert.ok(j > i, 'the install effect no longer closes where this reads');
  return WIDGET.slice(i, j);
})();

test('the cookie session is bridged BEFORE any read', () => {
  // ⚠ A session living only in the Next.js HTTP cookies leaves this supabase
  // client ANON, so every read returns nothing and a signed-in member is shown
  // an EMPTY INBOX. This file has paid for that twice already.
  const bridge = BLOCK.indexOf('sdb.getSession()');
  const firstRead = Math.min(
    ...['db.auth.getUser()', 'db.from("conversations")', 'db.rpc("list_member_dm_threads")']
      .map(s => { const k = BLOCK.indexOf(s); return k < 0 ? Number.MAX_SAFE_INTEGER : k; }));
  assert.ok(bridge > 0, 'the session bridge is gone');
  assert.ok(bridge < firstRead, 'a read happens before the session is bridged');
});

test('a FAILED read is never presented as an empty inbox', () => {
  // ⚠ Falling through to [] replaces a member's real threads with "you have no
  // conversations" — a claim, not an absence. Both hard legs bail instead.
  assert.match(BLOCK, /if \(convRes && convRes\.error\) \{ setThreadsLive\(false\); return; \}/,
    'a failed conversations read no longer bails');
  assert.match(BLOCK, /if \(msgRes && msgRes\.error\) \{ setThreadsLive\(false\); return; \}/,
    'a failed messages read no longer bails');
  assert.match(BLOCK, /catch \(e\) \{\s*if \(!cancelled\) setThreadsLive\(false\);/,
    'a thrown read no longer bails');
});

test('signed out keeps the sample threads', () => {
  // There is nothing of theirs to read, and the samples are what a visitor
  // previewing the site is meant to see.
  assert.match(BLOCK, /if \(!me\) \{ setThreadsLive\(false\); return; \}/,
    'a signed-out visitor no longer keeps the sample threads');
});

test('coach threads and member DMs are read on their own paths', () => {
  // The other member's NAME is not on the conversation row, which is why DMs go
  // through the RPC the app uses rather than a raw read.
  assert.match(BLOCK, /\.eq\("kind", "direct"\)\.is\("dm_key", null\)/,
    'coach threads no longer exclude the member-DM rows');
  assert.match(BLOCK, /db\.rpc\("list_member_dm_threads"\)/, 'member DMs no longer use the RPC');
  // The DM leg failing is survivable alone — the coach threads are still real.
  assert.match(BLOCK, /\(dmRes && !dmRes\.error && dmRes\.data\) \|\| \[\]/,
    'a failed DM read no longer degrades to "no DMs"');
});

test('every real thread carries its conversationId', () => {
  // ⚠ THIS IS WHY SEND AND POLL WORK AT ALL. Both are already keyed on
  // `activeThread.conversationId`; without it a real thread is read-only and
  // silently so.
  assert.match(BLOCK, /conversationId: c\.id/, 'coach threads lost their conversationId');
  assert.match(BLOCK, /conversationId: r\.conversation_id/, 'DM threads lost their conversationId');
});

test('the install is BY TAB ID, waits for the hydrate, and never clobbers a draft', () => {
  // By id, not index: the two files that supply `tabs` do not agree on order, so
  // a positional write lands on whichever tab happens to sit there.
  assert.match(BLOCK, /const id = tabs\[i\] && tabs\[i\]\.id;/, 'the install is no longer keyed on tab id');
  assert.doesNotMatch(BLOCK, /threadsLive\[i\]/, 'the install indexes threadsLive positionally');
  // ⚠ Both the hydrate and this read are async and neither is ordered against
  // the other. Without the gate, the run where the hydrate lands SECOND restores
  // the sample threads over the real ones.
  assert.match(BLOCK, /if \(!hydrated\) return;/, 'the install no longer waits for the localStorage hydrate');
  assert.match(BLOCK, /if \(dirtyRef\.current\) return;/, 'a real read can clobber what the member typed');
});

test('the hydrate publishes its completion as STATE, not only a ref', () => {
  // A ref triggers no re-render, so an effect gated on `hydratedRef.current`
  // would never re-run when it flips — the gate above would be permanent.
  assert.match(WIDGET, /setHydrated\(true\)/, 'the hydrate no longer publishes completion as state');
  assert.match(WIDGET, /\}, \[threadsLive, tabs, hydrated\]\);/, 'the install does not depend on `hydrated`');
});
