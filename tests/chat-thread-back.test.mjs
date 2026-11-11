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
const CLIENT = (read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx') + '\n' + read('mobile-app/src/broadsheet/BSClientTrain.jsx'));
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
  // The trainer's live watch: its Message pushes first now, so the thread's ← returns to Today.
  assert.match(PROS, /onMessage=\{conversationId=>\{navPush\(\);setChatRequest\(\{coach:liveWatch\.client,role:'Client',conversationId,back:'nav',nonce:Date\.now\(\)\}\);/);
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
  assert.match(mk, /const openCoachLoc = open && open\.provider_id != null && \(open\.provider_role === 'trainer' \|\| open\.provider_role === 'nutritionist'\)\n\s+\? \{ role: open\.provider_role, providerId: open\.provider_id, \.\.\.\(openListing \? \{ listing: true \} : null\), \.\.\.\(openViaNav \? \{ back: 'nav' \} : null\) \} : null;/);
  assert.match(mk, /window\.ShapeNav\?\.announce\?\.\(openCoachLoc \? \{ detail: \{ \.\.\.\(initialRole \? \{ role: initialRole \} : null\), coach: openCoachLoc \} \} : null, 'coaches'\);\n\s+return \(\) => window\.ShapeNav\?\.announce\?\.\(null, 'coaches'\);/);
  // The deep-open it rides back on reopens the listing when that was what was open.
  assert.match(mk, /if \(hit\) \{ setOpen\(hit\); setOpenNo\(null\); setOpenIntro\(false\); setOpenListing\(!!initialCoach\.listing\); setOpenViaNav\(initialCoach\.back === 'nav'\); setDeepMiss\(false\); \}/);
  // The announce sits above the screen's early returns, so it runs whatever the screen draws.
  assert.ok(mk.indexOf('const openCoachLoc') < mk.indexOf('  if (open) {'));
});

test('Chat from another tab, or a Back to its list, opens the list, not an earlier jump\'s thread', () => {
  assert.match(CLIENT, /if \(k === 'chat' && tab !== 'chat'\) setChatRequest\(null\);\n\s+setTab\(k\);/);
  assert.match(CLIENT, /if \(loc\.tab === 'chat'\) setChatRequest\(loc\.detail \? \{ \.\.\.loc\.detail, nonce: Date\.now\(\) \} : null\);/);
  assert.doesNotMatch(CLIENT, /if \(loc\.tab === 'chat' && loc\.detail\) setChatRequest/);
  // The coach apps: the same in both shells, on the tab bar and the swipe.
  assert.equal((PROS.match(/if \(loc\.tab === 'chat'\) setChatRequest\(loc\.detail \? \{ \.\.\.loc\.detail, nonce: Date\.now\(\) \} : null\);/g) || []).length, 2);
  // (Each shell's tab bar also opens its library fresh: Programs, Plans; 2026-11-10.)
  assert.match(PROS, /const enterTab = \(k\) => \{ if \(k === 'chat' && tab !== 'chat'\) setChatRequest\(null\); if \(k === 'programs' && tab !== 'programs'\) setProgramInitialTab\(''\); setTab\(k\); \};/);
  assert.match(PROS, /const enterTab = \(k\) => \{ if \(k === 'chat' && tab !== 'chat'\) setChatRequest\(null\); if \(k === 'plans' && tab !== 'plans'\) setPlansStart\(''\); setTab\(k\); \};/);
  assert.match(PROS, /<BSTabBar active=\{tab\} onChange=\{enterTab\} tabs=\{\[/);
  assert.match(PROS, /<BSTabBar active=\{tab\} onChange=\{\(k\) => \{ mayLeave\(window\)\.then\(\(ok\) => \{ if \(ok\) enterTab\(k\); \}\); \}\} tabs=\{\[/);
  assert.equal((PROS.match(/navSlide\(intent === 'next-tab' \? 'l' : 'r'\);\n\s+enterTab\(next\);/g) || []).length, 2);
});

// The audit that followed (2026-11-10): Search's results, Settings' pages opened from elsewhere, a coach
// opened straight from a chat card or a notification.
test('a Search result that opens another page leaves Search without a Back, and a Back returns to it', () => {
  const search = between(CLIENT, 'function BSUniversalSearch({', '\n}\n');
  assert.match(CLIENT, /function BSUniversalSearch\(\{ onClose, onLeave = onClose, initialQuery = '', onQuery = null \}\) \{/);
  // The four jumps close it with onLeave: a workout's Start, a channel (two lists), Browse coaches.
  assert.equal((search.match(/onLeave\(\); try \{ window\.dispatchEvent/g) || []).length, 4);
  assert.doesNotMatch(search, /onClose\(\); try \{ window\.dispatchEvent\(new (?:Custom)?Event\('shape:(?:startWorkout|openMarket)'/, 'a jump that pops the history under itself again');
  assert.doesNotMatch(search, /onClose\(\); try \{ window\.dispatchEvent\(new CustomEvent\('shape:openConversation', \{ detail: \{ channel: c \} \}\)\)/);
  // It reopens on the query it showed.
  assert.match(search, /const \[q, setQ\] = useStateBSC\(initialQuery \|\| ''\);\n\s+React\.useEffect\(\(\) => \{ if \(onQuery\) onQuery\(q\.trim\(\)\); \}, \[q\]\);/);
  for (const [name, src, n] of [['member', CLIENT, 1], ['coach', PROS, 2]]) {
    assert.equal((src.match(/if \(showSearch\) return \{ tab, overlay: 'search', \.\.\.\(searchQueryRef\.current \? \{ query: searchQueryRef\.current \} : null\) \};/g) || []).length, n, name);
    assert.equal((src.match(/setSearchStart\(loc\.overlay === 'search' \? \(loc\.query \|\| ''\) : ''\);/g) || []).length, n, name);
    assert.equal((src.match(/const open = \(\) => \{ navJumpRef\.current\.navPush\(\); searchQueryRef\.current = ''; setSearchStart\(''\); setShowSearch\(true\); \};/g) || []).length, n, name);
  }
  assert.match(CLIENT, /<BSUniversalSearch initialQuery=\{searchStart\} onQuery=\{\(v\) => \{ searchQueryRef\.current = v; \}\} onClose=\{\(\) => \{ if \(!navBack\(\)\) setShowSearch\(false\); \}\} onLeave=\{\(\) => setShowSearch\(false\)\} \/>/);
  assert.equal((PROS.match(/initialQuery: searchStart, onQuery: \(v\) => \{ searchQueryRef\.current = v; \}, onClose: \(\) => \{ if \(!navBack\(\)\) setShowSearch\(false\); \}, onLeave: \(\) => setShowSearch\(false\)/g) || []).length, 2);
  // The member app's jumps close Search themselves, after their push records it.
  assert.match(CLIENT, /navJumpRef\.current\.navPush\(\); setShowSettings\(false\); setSettingsStart\(''\); setShowSearch\(false\);\n\s+setMarketRole\(/);
  assert.match(CLIENT, /const onStart = \(event\) => \{ navJumpRef\.current\.navPush\(\); setShowCalendar\(false\); setShowSearch\(false\); setTab\('train'\);/);
  // A notified person's Message leaves the profile to the jump (BS_NAV_EVENTS closes it), not to a Back.
  assert.match(CLIENT, /onMessage=\{me && person\.userId !== me \? \(p\) => bsOpenMemberConversation\(p, null\) : null\} \/>/);
});

test('a Settings page opened straight from elsewhere goes back there; reached inside Settings, back to Settings', () => {
  const settings = between(CLIENT, 'function BSSettings({', '\n}\n');
  assert.match(settings, /const landedOn = landed \? initialPage : '';\n\s+const backFrom = \(page, close\) => \(\) => \{ if \(landedOn && landedOn === page\) onBack\(\); else close\(\); \};/);
  for (const page of ['pricing', 'sessions', 'notifications', 'integrations', 'habits', 'business', 'edit-profile', 'practice']) {
    assert.match(settings, new RegExp(`onBack=\\{backFrom\\('${page}', `), page);
  }
  // Every page it can open on is announced, with whether it was landed on.
  assert.match(settings, /const navSub = editing \? 'edit-profile' : showIntegrations \? 'integrations' : showPricing \? 'pricing'\n\s+: showNotifications \? 'notifications' : showSessions \? 'sessions' : showHabits \? 'habits'\n(?:\s*\/\/[^\n]*\n)*\s+: showBusiness \? 'business' : showLibrary \? 'library' : showHours \? 'hours'\n(?:\s*\/\/[^\n]*\n)*\s+: showGoals \? bsGoalsSub\(goalsView\)\n\s+: detail === 'practice' \? 'practice' : '';/);
  assert.match(settings, /window\.ShapeNav\?\.announce\?\.\(navLanded \? \{ sub: navSub, landed: true \} : \{ sub: navSub \}, 'settings'\);/);
  // The shells: a jump onto a page lands; the gear and a Back to Settings' own page do not.
  assert.match(CLIENT, /const goSettings = \(\) => \{ if \(!showSettings\) navPush\(\); setSettingsStart\(''\); setSettingsLanded\(false\); setShowSettings\(true\); \};/);
  assert.match(CLIENT, /const goEditProfile = \(\) => \{ navPush\(\); setSettingsStart\('edit-profile'\); setSettingsLanded\(true\); setShowSettings\(true\); \};/);
  assert.match(CLIENT, /const goIntegrations = \(\) => \{ navPush\(\); setSettingsStart\('integrations'\); setSettingsLanded\(true\); setShowSettings\(true\); \};/);
  assert.match(CLIENT, /const toSettings = \(page\) => \{ clear\(\); setSettingsStart\(page\); setSettingsLanded\(!!page\); setShowSettings\(true\); \};/);
  assert.match(CLIENT, /key=\{'settings:' \+ settingsStart \+ \(settingsLanded \? ':landed' : ''\)\}\n\s+initialPage=\{settingsStart\}\n\s+landed=\{settingsLanded\}/);
  for (const [name, src, n] of [['member', CLIENT, 1], ['coach', PROS, 2]]) {
    assert.equal((src.match(/if \(loc\.overlay === 'settings'\) \{ setSettingsStart\(loc\.sub \|\| ''\); setSettingsLanded\(!!loc\.landed\); setShowSettings\(true\); \}/g) || []).length, n, name);
  }
  assert.equal((PROS.match(/clear\(\); setSettingsStart\('(?:practice|business)'\); setSettingsLanded\(true\); setShowSettings\(true\); return;/g) || []).length, 6);
  assert.equal((PROS.match(/const goSettings = \(\) => \{ if \(!showSettings\) navPush\(\); setSettingsLanded\(false\); setShowSettings\(true\); \};/g) || []).length, 2);
  assert.equal((PROS.match(/<BSSettings key=\{'settings:' \+ settingsStart \+ \(settingsLanded \? ':landed' : ''\)\} initialPage=\{settingsStart\} landed=\{settingsLanded\}/g) || []).length, 2);
});

test('a coach opened straight from a chat card or a notification goes back there, not to the list', () => {
  assert.match(CLIENT, /\? \{ role: e\.detail\.role, providerId: Number\(e\.detail\.coachId\), back: 'nav' \}/);
  const mk = between(MARKET, 'function BSMarketplaceScreen({', '\n}\n');
  assert.match(mk, /setOpenListing\(!!initialCoach\.listing\); setOpenViaNav\(initialCoach\.back === 'nav'\);/);
  assert.match(mk, /const closeOpen = \(\) => \{\n\s+const viaNav = openViaNav;\n\s+setOpen\(null\); setOpenNo\(null\); setOpenIntro\(false\); setOpenListing\(false\); setOpenViaNav\(false\);\n\s+if \(viaNav && window\.ShapeNav\?\.canPop\?\.\(\)\) window\.ShapeNav\.back\(\);\n\s+\};/);
  // A Back to it keeps the way back.
  assert.match(mk, /\.\.\.\(openViaNav \? \{ back: 'nav' \} : null\) \} : null;/);
});

// The audit's rest (2026-11-10, the second PR): a coach's client page, the cook and workout screens a jump
// opens, Home's own pages, and Settings' Library and Your hours.
test('a coach\'s client page opened by a jump goes back there, and a Back from its thread reopens it', () => {
  assert.equal((PROS.match(/setOpenClientReq\(\{ clientId: clientId \|\| null, clientName, back: 'nav', nonce: Date\.now\(\) \}\); setTab\('clients'\);/g) || []).length, 2, 'both coach apps');
  assert.equal((PROS.match(/if \(loc\.tab === 'clients' && loc\.detail && \(loc\.detail\.clientId \|\| loc\.detail\.clientName\)\) setOpenClientReq\(\{ clientId: loc\.detail\.clientId \|\| null, clientName: loc\.detail\.clientName \|\| '', back: loc\.detail\.back, nonce: Date\.now\(\) \}\);/g) || []).length, 2);
  for (const name of ['function BSTrainerClients(', 'function BSNutriClients(']) {
    const screen = between(PROS, name, '\n}\n');
    assert.match(screen, /if \(hit\) \{ setPreviewClient\(null\); setFullClient\(hit\); setFullViaNav\(openRequest\.back === 'nav'\); \}/, name);
    // By account, or a sample client (none) by name, as a notification finds one.
    assert.match(screen, /const fullAnnounce = fullClient && \(fullClient\.userId \|\| fullClient\.n\)\n\s+\? \{ \.\.\.\(fullClient\.userId \? \{ clientId: fullClient\.userId \} : \{ clientName: fullClient\.n \}\), \.\.\.\(fullViaNav \? \{ back: 'nav' \} : null\) \} : null;/, name);
    assert.match(screen, /window\.ShapeNav\?\.announce\?\.\(fullAnnounce \? \{ detail: fullAnnounce \} : null, 'clients'\);/, name);
    assert.match(screen, /const closeFull = \(\) => \{\n\s+const viaNav = fullViaNav;\n\s+setFullClient\(null\); setFullViaNav\(false\);\n\s+if \(viaNav && window\.ShapeNav\?\.canPop\?\.\(\)\) window\.ShapeNav\.back\(\);\n\s+\};/, name);
    assert.match(screen, /<BSProClientFullProfilePage client=\{fullClient\} onBack=\{closeFull\}/, name);
    assert.ok(screen.indexOf('const closeFull') < screen.indexOf('if (fullClient) {'), `${name}: the announce sits above the early returns`);
  }
});

test('a cook or workout screen another page opened goes back there when it closes', () => {
  const train = between(CLIENT, 'function BSClientTrain({', '\n}\n');
  assert.match(train, /setSession\(true\); setSessionViaNav\(true\); onAutoStartConsumed\(\);/, 'an auto-start (Calendar, Home, Search) is a jump\'s');
  assert.match(train, /const leaveSession = \(\) => \{\n\s+const viaNav = sessionViaNav;[\s\S]{0,260}setSessionViaNav\(false\);\n\s+if \(viaNav && window\.ShapeNav\?\.canPop\?\.\(\)\) window\.ShapeNav\.back\(\);\n\s+\};/);
  const eat = between(CLIENT, 'function BSClientEat({', '\n}\n');
  assert.match(eat, /const openPrep = React\.useCallback\(\(s = null\) => \{ setPrepSeed\(s\); setPrepOpen\(true\); \}, \[\]\);/, 'Eat\'s own door leaves the flag, which every close resets');
  assert.match(eat, /openPrep\(\{ cookable: cookWith\.cookable, mine: !!cookWith\.mine \}\);\n\s+setPrepViaNav\(true\);/, 'cook-with from Home');
  assert.match(eat, /setPrepCook\(\{ slug: prepTonight\.slug, group: null \}\);\n\s+setCookViaNav\(true\);/, 'a prep reminder');
  assert.match(eat, /onClose=\{\(\) => \{ const v = cookViaNav; setPrepCook\(null\); setCookViaNav\(false\); leaveViaNav\(v\); \}\}/);
  assert.match(eat, /onClose=\{\(\) => \{ const v = prepViaNav; setPrepOpen\(false\); setPrepSeed\(null\); setPrepViaNav\(false\); leaveViaNav\(v\); \}\}/);
  // Tonight's card and Eat's own doors leave the flags alone: each close resets them, so they are false then.
  assert.match(eat, /onStart=\{g\.catalog === false \? null : \(\) => setPrepCook\(\{ slug: g\.slug, group: g \}\)\}/);
  assert.match(eat, /const leaveViaNav = \(viaNav\) => \{ if \(viaNav && window\.ShapeNav\?\.canPop\?\.\(\)\) window\.ShapeNav\.back\(\); \};/);
});

test('Home\'s own pages are announced and reopen on a Back; a reminder\'s Your mornings goes back where it came from', () => {
  const home = between(CLIENT, 'function BSClientHome({', '\n}\n');
  assert.match(CLIENT, /function BSClientHome\(\{.*initialPage = '', initialViaNav = false, initialPreview = null, onStartConsumed = \(\) => \{\} \}\) \{/);
  for (const [state, page] of [['habitsPage', 'habits'], ['morningsPage', 'mornings'], ['homeProgressPage', 'progress'], ['checkinPage', 'checkin']]) {
    assert.match(home, new RegExp(`const \\[${state}, set[A-Za-z]+\\] = useStateBSC\\(initialPage === '${page}'\\);`), state);
  }
  // Goals opens on its station ('goals:<station>', services/navPlaces.mjs), and today's session (or Team's
  // picked day) on its preview (2026-11-10, "fix all of these").
  assert.match(home, /const \[goalsPage, setGoalsPage\] = useStateBSC\(bsGoalsView\(initialPage\) != null\);/);
  assert.match(home, /const \[showWorkoutPreview, setShowWorkoutPreview\] = useStateBSC\(initialPage === 'today' \? \(initialPreview \|\| true\) : false\);/);
  // Named in the order Home draws them.
  assert.match(home, /const homeSub = showWorkoutPreview \? 'today' : habitsPage \? 'habits' : checkinPage \? 'checkin' : homeProgressPage \? 'progress'\n\s+: goalsPage \? bsGoalsSub\(goalsView\) : morningsPage \? 'mornings' : '';/);
  const order = ['  if (showWorkoutPreview) {', '  if (habitsPage) {', '  if (checkinPage) {', '  if (homeProgressPage) {', '  if (goalsPage) {', '  if (morningsPage) {'].map((k) => home.indexOf(k));
  assert.ok(order.every((at, i) => at > 0 && (i === 0 || at > order[i - 1])), 'the sub names the page Home draws');
  // A reminder's Your mornings keeps its way back through a jump from it and the Back that returns (Codex P2 on #2683).
  assert.match(home, /const \[morningsViaNav, setMorningsViaNav\] = useStateBSC\(initialPage === 'mornings' && !!initialViaNav\);/);
  assert.match(home, /const homeBackViaNav = homeSub === 'mornings' && morningsViaNav;/);
  assert.match(home, /window\.ShapeNav\?\.announce\?\.\(\{ sub: homeSub, \.\.\.\(homeBackViaNav \? \{ back: 'nav' \} : null\), \.\.\.\(homePreview \? \{ preview: homePreview \} : null\) \}, 'home'\);/);
  assert.match(home, /else if \(initialPage === 'mornings'\) \{ setMorningsPage\(true\); setMorningsViaNav\(!!initialViaNav\); \}/);
  assert.ok(home.indexOf('const [morningsViaNav') < home.indexOf('const homeBackViaNav'), 'declared before the announce reads it');
  for (const s of ['const [checkinPage', 'const [showWorkoutPreview', 'const [goalsView']) assert.ok(home.indexOf(s) > 0 && home.indexOf(s) < home.indexOf('const homeSub'), s + ' declared before the announce reads it');
  assert.ok(home.indexOf('const homeSub') < home.indexOf('  if (habitsPage) {'), 'the announce sits above the early returns');
  assert.match(home, /setMorningsPage\(true\);\n\s+setMorningsViaNav\(true\);/);
  assert.match(home, /<BSYourMornings onBack=\{\(\) => \{ const v = morningsViaNav; setMorningsPage\(false\); setMorningsViaNav\(false\); if \(v && window\.ShapeNav\?\.canPop\?\.\(\)\) window\.ShapeNav\.back\(\); \}\}/);
  assert.match(CLIENT, /if \(loc\.tab === 'home'\) \{ setHomeStart\(loc\.sub \|\| ''\); setHomeStartViaNav\(loc\.back === 'nav'\); setHomeStartPreview\(loc\.sub === 'today' && loc\.preview \? loc\.preview : null\); \}/);
  assert.match(CLIENT, /initialPage=\{homeStart\} initialViaNav=\{homeStartViaNav\} initialPreview=\{homeStartPreview\} onStartConsumed=\{\(\) => \{ setHomeStart\(''\); setHomeStartViaNav\(false\); setHomeStartPreview\(null\); \}\} \/>,/);
});

test('Settings\' Library and Your hours come back to themselves after their jumps', () => {
  const settings = between(CLIENT, 'function BSSettings({', '\n}\n');
  assert.match(settings, /const \[showHours, setShowHours\] = useStateBSC\(initialPage === 'hours'\);/);
  assert.match(settings, /const \[showLibrary, setShowLibrary\] = useStateBSC\(initialPage === 'library'\);/);
  // Named before the pane it sits in: Your hours is open over Your practice (Codex P2 on #2683).
  assert.match(settings, /: showBusiness \? 'business' : showLibrary \? 'library' : showHours \? 'hours'\n(?:\s*\/\/[^\n]*\n)*\s+: showGoals \? bsGoalsSub\(goalsView\)\n\s+: detail === 'practice' \? 'practice' : '';/);
  // Each reopens over the pane it sits in, so its ← lands there: Library in More, Your hours in Your practice.
  assert.match(settings, /useStateBSC\(initialPage === 'practice' \|\| initialPage === 'hours' \? 'practice' : initialPage === 'library' \|\| bsGoalsView\(initialPage\) != null \? 'more' : ''\);/);
  // Their jumps push first, so the announced page is what comes back.
  assert.match(CLIENT, /navJumpRef\.current\.navPush\(\); setShowSettings\(false\); setSettingsStart\(''\); setShowSearch\(false\);\n\s+setMarketRole\(/, 'Browse coaches (shape:openMarket)');
  assert.equal((PROS.match(/const onAvail = \(\) => \{ navJumpRef\.current\.navPush\(\); setShowSettings\(false\); setShowCalendar\(true\); \};/g) || []).length, 2, 'Open calendar (shape:proAvailability)');
});
