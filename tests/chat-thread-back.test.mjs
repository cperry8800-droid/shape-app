// Back goes where the member came from (owner, 2026-11-10: "when i click on messages from the coaches
// page, it brings up message which is good, but when i hit back, it bring me to teams page. Make sure back
// buttons are going back to previous page and location user was on").
//
// A thread another page opened (Coaches' Message, Home's coach card, a search result, a notification, a
// coach's client) comes with `back: 'nav'`, because that jump pushed where the member was; its ← (and the
// swipe, which calls it) steps the nav history back there, at the scroll it left. A thread opened from
// Chat's own lists closes to the list. Coaches announces the coach whose profile is open, so a Back from
// that coach's thread reopens the profile. Entering Chat from another tab, or a Back to its list, drops
// the request an earlier jump left, which the remounting page would otherwise open again.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bsThreadKey, bsThreadNavKey, bsThreadViaNav } from '../mobile-app/src/services/chatThreadBack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const PROS = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const MARKET = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `missing: ${a}`); return src.slice(i, src.indexOf(b, i)); };

test('a thread\'s key is its conversation, its channel, or its name', () => {
  assert.equal(bsThreadKey({ conversation_id: 'c-1', n: 'Rae' }), 'c-1');
  assert.equal(bsThreadKey({ conversation_id: 42 }), '42', 'one form, so a listed row and a request agree');
  assert.equal(bsThreadKey({ channelId: 7, n: 'run club' }), 'ch:7');
  assert.equal(bsThreadKey({ channelId: 0 }), 'ch:0', 'channel 0 is a channel');
  assert.equal(bsThreadKey({ n: 'Jordan Chen' }), 'n:Jordan Chen');
  assert.equal(bsThreadKey(null), null);
});

test('only the thread a nav jump opened goes back through the nav history', () => {
  const jump = { coach: 'Jordan Chen', back: 'nav', nonce: 1 };
  const opened = { n: 'Jordan Chen', conversation_id: null };
  const key = bsThreadNavKey(jump, opened);
  assert.equal(key, 'n:Jordan Chen');
  assert.equal(bsThreadViaNav(opened, key), true, 'Coaches\' Message → its thread → ← goes back to Coaches');
  // A request with no jump behind it (a restore of a list-opened thread) holds nothing.
  assert.equal(bsThreadNavKey({ coach: 'Jordan Chen', nonce: 2 }, opened), null);
  assert.equal(bsThreadViaNav(opened, null), false, 'a thread opened from the list closes to the list');
  // Another thread opened in its place (a profile's Message inside Chat) goes back to the list.
  assert.equal(bsThreadViaNav({ n: 'Rae Lindqvist' }, key), false);
  assert.equal(bsThreadViaNav(null, key), false, 'no thread open, nothing to go back from');
  // A conversation the request named by id matches the listed row that carries it.
  const idKey = bsThreadNavKey({ conversationId: 99, back: 'nav' }, { conversation_id: 99 });
  assert.equal(bsThreadViaNav({ conversation_id: 99, n: 'Coach', messages: [1] }, idKey), true);
  const chKey = bsThreadNavKey({ channel: { id: 5 }, back: 'nav' }, { channelId: 5 });
  assert.equal(bsThreadViaNav({ channelId: 5, n: 'run club' }, chKey), true);
});

test('every jump that pushes before opening a chat says so on its request', () => {
  // The member app: goChat (Coaches, Home, Me) and a conversation from search or a notification.
  assert.match(CLIENT, /const goChat = \(coach, role\) => \{ navPush\(\); setChatRequest\(\{ coach: coach \|\| null, role: role \|\| null, back: 'nav', nonce: Date\.now\(\) \}\); setTab\('chat'\); \};/);
  const openConv = between(CLIENT, '      if (d.support) { setShowSearch(false); setShowSettings(false); setShowNoraSheet(true); return; }', "      setTab('chat');");
  assert.match(openConv, /navJumpRef\.current\.navPush\(\);[\s\S]*setChatRequest\(\{ conversationId: d\.conversationId \|\| null, channel: d\.channel \|\| null, support: !!d\.support, coach: d\.name \|\| null, back: 'nav', nonce: Date\.now\(\) \}\);/);
  // The coach apps (trainer and nutritionist): a conversation, a client's Message, the care team.
  assert.equal((PROS.match(/coach: d\.name \|\| null, back: 'nav', nonce: Date\.now\(\) \}\);/g) || []).length, 2);
  assert.equal((PROS.match(/setChatRequest\(\{ coach: name, role: 'Client', conversationId: cid, back: 'nav', nonce: Date\.now\(\) \}\);/g) || []).length, 2);
  assert.equal((PROS.match(/setChatRequest\(\{ coach: d\.name \|\| 'Coach', role: d\.role \|\| 'Care team', conversationId: cid, back: 'nav', nonce: Date\.now\(\) \}\);/g) || []).length, 2);
  // Each of those pushes first, in its own handler.
  assert.equal((PROS.match(/const on(?:Msg|Coach) = async \(e\) => \{\n\s+navJumpRef\.current\.navPush\(\);/g) || []).length, 4);
  // No request without a push carries the mark (the live-watch Message opens over no history).
  assert.doesNotMatch(PROS, /setChatRequest\(\{coach:liveWatch\.client[^}]*back/);
});

test('the thread\'s ← steps the nav history only for the thread a jump opened', () => {
  const feed = between(CLIENT, 'function BSClientFeed({', '\n}\n');
  assert.match(feed, /const \[navBackKey, setNavBackKey\] = useStateBSC\(null\);\n\s+const backViaNav = bsThreadViaNav\(openChat, navBackKey\);/);
  assert.match(feed, /const closeThread = \(\) => \{\n\s+setOpenChat\(null\);\n\s+setNavBackKey\(null\);\n\s+if \(backViaNav && window\.ShapeNav\?\.canPop\?\.\(\)\) window\.ShapeNav\.back\(\);\n\s+\};/);
  assert.match(feed, /<BSChatThread[\s\S]{0,1500}onBack=\{closeThread\}/, 'the thread\'s ← (and the swipe, which calls it)');
  assert.doesNotMatch(feed, /onBack=\{\(\) => setOpenChat\(null\)\}/, 'a thread closing straight to the list again');
  // The request effect: any request clears the hold, and each branch that opens a thread notes its own.
  const eff = between(feed, '    if (!openRequest || !openRequest.nonce) return;', '}, [openRequest && openRequest.nonce]);');
  assert.match(eff, /^    if \(!openRequest \|\| !openRequest\.nonce\) return;\n    const name = openRequest\.coach;\n[^\n]*\n    setNavBackKey\(null\);/);
  assert.match(eff, /setNavBackKey\(bsThreadNavKey\(openRequest, \{ conversation_id: openRequest\.conversationId \}\)\);/);
  assert.match(eff, /setNavBackKey\(bsThreadNavKey\(openRequest, \{ channelId: openRequest\.channel\.id \}\)\);/);
  assert.match(eff, /setOpenChat\(pick\);\n\s+setNavBackKey\(bsThreadNavKey\(openRequest, pick\)\);/);
  // A thread restored by a Back keeps its own way back: the announce carries it.
  assert.equal((feed.match(/\.\.\.\(backViaNav \? \{ back: 'nav' \} : null\)/g) || []).length, 2, 'a conversation and a channel');
});

test('a Back reopens Coaches on the coach whose profile was open', () => {
  assert.match(CLIENT, /if \(loc\.tab === 'market'\) \{ setMarketRole\(\(loc\.detail && loc\.detail\.role\) \|\| null\); setMarketCoach\(\(loc\.detail && loc\.detail\.coach\) \|\| null\); \}/);
  const mk = between(MARKET, 'function BSMarketplaceScreen({', '\n}\n');
  assert.match(mk, /const openCoachLoc = open && open\.provider_id != null && \(open\.provider_role === 'trainer' \|\| open\.provider_role === 'nutritionist'\)\n\s+\? \{ role: open\.provider_role, providerId: open\.provider_id, \.\.\.\(openListing \? \{ listing: true \} : null\) \} : null;/);
  assert.match(mk, /window\.ShapeNav\?\.announce\?\.\(openCoachLoc \? \{ detail: \{ \.\.\.\(initialRole \? \{ role: initialRole \} : null\), coach: openCoachLoc \} \} : null\);\n\s+return \(\) => window\.ShapeNav\?\.announce\?\.\(null\);/);
  // The deep-open it rides back on reopens the listing when that was what was open.
  assert.match(mk, /if \(hit\) \{ setOpen\(hit\); setOpenNo\(null\); setOpenIntro\(false\); setOpenListing\(!!initialCoach\.listing\); setDeepMiss\(false\); \}/);
  // The announce sits above the screen's early returns, so it runs whatever the screen draws.
  assert.ok(mk.indexOf('const openCoachLoc') < mk.indexOf('  if (open) {'));
});

test('Chat from another tab, or a Back to its list, opens the list, not an earlier jump\'s thread', () => {
  assert.match(CLIENT, /if \(k === 'chat' && tab !== 'chat'\) setChatRequest\(null\);\n\s+setTab\(k\);/);
  assert.match(CLIENT, /if \(loc\.tab === 'chat'\) setChatRequest\(loc\.detail \? \{ \.\.\.loc\.detail, nonce: Date\.now\(\) \} : null\);/);
  assert.doesNotMatch(CLIENT, /if \(loc\.tab === 'chat' && loc\.detail\) setChatRequest/);
  // The coach apps: the same in both shells, on the tab bar and the swipe.
  assert.equal((PROS.match(/if \(loc\.tab === 'chat'\) setChatRequest\(loc\.detail \? \{ \.\.\.loc\.detail, nonce: Date\.now\(\) \} : null\);/g) || []).length, 2);
  assert.equal((PROS.match(/const enterTab = \(k\) => \{ if \(k === 'chat' && tab !== 'chat'\) setChatRequest\(null\); setTab\(k\); \};/g) || []).length, 2);
  assert.match(PROS, /<BSTabBar active=\{tab\} onChange=\{enterTab\} tabs=\{\[/);
  assert.match(PROS, /<BSTabBar active=\{tab\} onChange=\{\(k\) => \{ mayLeave\(window\)\.then\(\(ok\) => \{ if \(ok\) enterTab\(k\); \}\); \}\} tabs=\{\[/);
  assert.equal((PROS.match(/navSlide\(intent === 'next-tab' \? 'l' : 'r'\);\n\s+enterTab\(next\);/g) || []).length, 2);
});
