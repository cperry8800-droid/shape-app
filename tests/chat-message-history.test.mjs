// The chat bubble reads the member's REAL conversations.
//
// ⚠ IT SHIPPED WITH NONE. `clientChatThreads.jsx` types Maya Okafor, Marcus J.
// and the rest into the file, and a thread only became DB-backed when something
// handed `__openChat({ conversationId })` an explicit id — so the thread LIST was
// invented and no thread carried an id the poll could read. A member who
// messaged their coach in the app opened the bubble on the web and saw invented
// messages from people who do not exist.
//
// ⚠ AN EARLIER DRAFT OF THIS HEADER ALSO SAID "and even then the poll only
// fetched messages NEWER than `since`", WHICH IS FALSE and is corrected here
// rather than deleted, because it is the claim that made a bulk `messages` read
// look necessary. `fetchOnce` runs with NO `since` the first time a conversation
// is opened, which is the route's own cold-load path, and that arm REPLACES the
// thread's messages.
//
// Every assertion here guards a way that can silently regress to the demo cast
// or to a WRONG claim about a member's inbox.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const RAW = readFileSync('public/newdesign/chatWidget.jsx', 'utf8');
const WIDGET = stripComments(RAW);
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
  // conversations" — a claim, not an absence. The hard leg bails instead.
  assert.match(BLOCK, /if \(convRes && convRes\.error\) \{ setThreadsLive\(false\); return; \}/,
    'a failed conversations read no longer bails');
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
  // ⚠ THIS IS WHY SEND, THE COLD LOAD AND THE POLL WORK AT ALL. All three are
  // already keyed on `activeThread.conversationId`; without it a real thread is
  // read-only, has no history, and is silently so.
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

// ── The review round's three findings, each replayed ──────────────────────────

test('the Supabase client is LOADED, not assumed — on the 25 pages that lack it', () => {
  // ⚠ CODEX P1. `window.shapeDb` exists only where a page loads /supabase.js, and
  // most chat hosts do not — chatPopout.html and every marketing page among them.
  // A bare `if (!db) return;` in an empty-dependency effect is therefore
  // PERMANENT: the pop-out opened from a signed-in dashboard showed the sample
  // cast forever. The loader is pageShell's, reused rather than copied, because a
  // second copy of the vendor bundle's SRI hash is the thing worth avoiding.
  assert.match(BLOCK, /window\.shapeEnsureDb \? await window\.shapeEnsureDb\(\) : null\) \|\| window\.shapeDb/,
    'the history read no longer goes through the shared loader');
  const shell = stripComments(readFileSync('public/newdesign/pageShell.jsx', 'utf8'));
  assert.match(shell, /shapeEnsureDb: ssEnsureDb/, 'pageShell no longer exports the loader');
  assert.match(shell, /function ssEnsureDb\(\)/, 'pageShell no longer defines the loader');

  // …and the measurement the fix rests on, re-derived rather than remembered: if
  // every host DID carry /supabase.js this would be a no-op and the guard above
  // would be guarding nothing.
  const hosts = readdirSync('public/newdesign')
    .filter(f => f.endsWith('.html'))
    .filter(f => readFileSync(`public/newdesign/${f}`, 'utf8').includes('chatWidget.jsx'));
  assert.ok(hosts.length >= 30, `only ${hosts.length} chat hosts found — the sweep stopped matching`);
  const without = hosts.filter(f => !readFileSync(`public/newdesign/${f}`, 'utf8').includes('supabase.js'));
  assert.ok(without.length > 0,
    'every chat host now loads supabase.js — if that is deliberate, this guard and the loader hop can go');
});

test('pageShell loads BEFORE chatWidget on every host and in both boot lists', () => {
  // The loader is a window global, so the file that defines it has to run first.
  // Both of globalChatButton.js's lists are checked because updating one and not
  // the other gives half the site a feature — this file has paid for that once.
  const hosts = readdirSync('public/newdesign')
    .filter(f => f.endsWith('.html'))
    .map(f => [f, readFileSync(`public/newdesign/${f}`, 'utf8')])
    .filter(([, html]) => html.includes('chatWidget.jsx'));
  assert.ok(hosts.length >= 30, `only ${hosts.length} chat hosts found — the sweep stopped matching`);
  for (const [f, html] of hosts) {
    const a = html.indexOf('pageShell.jsx');
    const b = html.indexOf('chatWidget.jsx');
    assert.ok(a >= 0, `${f} loads chatWidget.jsx without pageShell.jsx`);
    assert.ok(a < b, `${f} loads chatWidget.jsx before pageShell.jsx`);
  }
  const boot = readFileSync('public/newdesign/globalChatButton.js', 'utf8');
  const lists = [...boot.matchAll(/\[[^\]]*chatWidget\.jsx[^\]]*\]/g)].map(m => m[0]);
  assert.equal(lists.length, 2, `expected both boot lists, found ${lists.length}`);
  for (const l of lists) {
    assert.ok(l.indexOf('pageShell.jsx') < l.indexOf('chatWidget.jsx'), `boot list loads chatWidget first: ${l}`);
  }
});

test('the bundle is loaded only for a session, and "cannot tell" TRIES', () => {
  // ⚠ Three states, not two. /api/me answers 200 {user:null} for a MEASURED
  // signed-out visitor and 503 for a read that did not complete. Only the first
  // is evidence, so only the first skips the load: showing a signed-in member the
  // demo cast is a wrong claim, where loading a bundle for a visitor is a
  // download, and `getUser()` settles the truth either way.
  assert.match(WIDGET, /React\.useState\("pending"\)/, 'the auth probe is no longer three-state');
  assert.match(WIDGET, /probe = uid === "anon" \? "out" : "in";/,
    'the probe no longer distinguishes a measured signed-out visitor from a failed read');
  assert.match(BLOCK, /if \(authProbe === "pending"\) return undefined;/, 'the read no longer waits for the probe');
  assert.match(BLOCK, /if \(authProbe === "out"\) \{ setThreadsLive\(false\); return undefined; \}/,
    'a measured signed-out visitor no longer short-circuits the load');
  assert.doesNotMatch(BLOCK, /authProbe === "unknown"/,
    'an unreadable /api/me now skips the load — it must try, or a blip costs a member their inbox');
  assert.match(BLOCK, /\}, \[authProbe\]\);/, 'the read does not re-run when the probe resolves');
});

test('a COACH viewer never sees their own name on every thread', () => {
  // ⚠ CODEX P1. RLS returns every conversation the viewer participates in, and a
  // coach participates in all of THEIR CLIENTS' threads — rows whose `title` is
  // the PROVIDER's name, set at creation. Without this filter a trainer opening
  // the bubble saw N identical threads labelled with their own name under a tab
  // that reads "Your coaches". Asking for the rows where the viewer IS the client
  // is what that tab means, and it stays right for a dual-role account.
  assert.match(BLOCK, /\.eq\("client_id", me\)/, 'coach threads are no longer scoped to the viewer as CLIENT');
  const mig = readFileSync('supabase-migrations/2026-05-02-conversations-messages.sql', 'utf8');
  assert.match(mig, /insert into public\.conversations \(kind, title, provider_role, provider_id, client_id\)\s*\n\s*values \('direct', v_provider_name,/,
    'the premise moved: `title` is no longer the provider name, so re-derive this guard');
  // The DM leg needs no such filter — the RPC is scoped to `dm_key is not null`,
  // which coach threads never carry, and it resolves the COUNTERPART's name.
  const dm = readFileSync('supabase-migrations/2026-06-03-member-direct-conversations.sql', 'utf8');
  assert.match(dm, /where c\.kind = 'direct' and c\.dm_key is not null/,
    'the DM RPC no longer excludes coach threads');
});

test('the coaches\u2019 private "Care team" thread is not one of the member\u2019s coaches', () => {
  // ⚠ FOUND IN MY OWN READ OF THE FIX, not by the review. There is a THIRD
  // writer of `kind='direct'` rows with no `dm_key`: a coach↔coach thread with NO
  // provider, titled 'Care team', whose `client_id` is the client it is ABOUT.
  // The member is not a participant — but `can_access_conversation` grants on
  // `client_id = auth.uid()`, so the row comes back to them anyway, and this
  // widget is what would have rendered it under "Your coaches" as if it were one
  // of their own coach threads. Requiring a provider is what that tab means.
  assert.match(BLOCK, /\.not\("provider_role", "is", null\)/,
    'a coach\u2194coach thread can render as one of the member\u2019s own coaches');
  const shared = readFileSync('supabase-migrations/2026-05-26-shared-clients.sql', 'utf8');
  assert.match(shared, /insert into public\.conversations \(kind, client_id, title\)\s*\n\s*values \('direct', p_client_id, 'Care team'\)/,
    'the premise moved: the coach\u2194coach row no longer looks like this, so re-derive this guard');
  const conv = readFileSync('supabase-migrations/2026-05-02-conversations-messages.sql', 'utf8');
  assert.match(conv, /c\.client_id = auth\.uid\(\)/,
    'the premise moved: RLS no longer grants a member access by `client_id`');
});

test('history comes from the route that gets the cap right — not a bulk read', () => {
  // ⚠ CODEX P2. One combined `.in(conversation_id, [...])` ordered ASCENDING
  // shares PostgREST's row ceiling across every conversation, so a long thread
  // opened on its OLDEST messages while its own preview advertised a newer one,
  // and a busy thread starved the quiet ones.
  assert.doesNotMatch(BLOCK, /db\.from\("messages"\)/, 'the bulk messages read is back');
  assert.doesNotMatch(BLOCK, /ascending: true/, 'an ascending capped read is back in the history block');
  // …and the claim that replaces it is checked rather than asserted: the poll's
  // FIRST call carries no `since`, and the route answers that arm newest-first,
  // capped, re-reversed. If either half stops being true, the threads this block
  // hands over with `messages: []` never fill in.
  assert.match(WIDGET, /const merged = since \? \[\.\.\.t\.messages, \.\.\.mapped\] : mapped;/,
    'the cold-load arm no longer REPLACES a thread’s messages');
  assert.match(WIDGET, /const since = lastSeenRef\.current\[convId\];/,
    'the poll no longer derives `since` per conversation, so there is no cold load');
  const route = readFileSync('src/app/api/conversations/[id]/messages/route.ts', 'utf8');
  assert.match(route, /\.order\('created_at', \{ ascending: incremental \}\)/,
    'the route no longer reads newest-first on a cold load');
  assert.match(route, /incremental \? \(data \?\? \[\]\) : \(data \?\? \[\]\)\.slice\(\)\.reverse\(\)/,
    'the route no longer re-reverses its cold load');
  // The LIST is what this block is for, and its previews come from the row.
  assert.match(BLOCK, /last: c\.last_message \|\| "New conversation"/, 'coach previews no longer read the row');
  assert.match(BLOCK, /last: r\.last_message \|\| "New conversation"/, 'DM previews no longer read the RPC');
  const mig = readFileSync('supabase-migrations/2026-05-02-conversations-messages.sql', 'utf8');
  assert.match(mig, /set last_message = new\.body/, 'nothing maintains `last_message` — the previews are stale');
});
