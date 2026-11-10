// Every Back goes where the member was, down to the place on the page (owner, 2026-11-10: "Make sure back
// buttons are going back to previous page and location user was on", then, of the gaps #2683 left: "fix
// all of these"). Chat's place (the Wall, Community, Team's Coaches or Friends, Channels) and a profile
// opened inside it; a coach's library kind or Music (Programs, a nutritionist's Plans); the Score page's
// Record; a Goals station, under Home and under Settings; Home's check-in page and its session preview.
// Each page announces where it is under its own key, the shell's push records it, and a Back replays it
// onto the page's start props (services/navPlaces.mjs says what is recorded).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bsLibraryPlace, bsLibraryPlaceSub, bsChatPlaceLoc, bsChatPlaceOf, bsProfileLoc, bsGoalsSub, bsGoalsView } from '../mobile-app/src/services/navPlaces.mjs';
import { bsNavAnnounce, bsNavCompose, bsNavPush, bsNavPop, bsNavClear, bsNavSize, bsGuardOnFirstUse, bsGuardAfterPush } from '../mobile-app/src/services/navHistory.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const PROS = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const GOALS = read('mobile-app/src/broadsheet/BSGoals.jsx');
const SHELL = read('mobile-app/src/broadsheet/bsNavShell.js');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `missing: ${a}`); return src.slice(i, src.indexOf(b, i)); };

// ── The rules (pure) ──────────────────────────────────────────────────────────────────────────────

test('a library opens on the kind or Music it recorded, else on its first kind', () => {
  const T = ['plans', 'workouts', 'programs'];
  assert.deepEqual(bsLibraryPlace('workouts', T), { tab: 'library', libTab: 'workouts' });
  assert.deepEqual(bsLibraryPlace('programs', T), { tab: 'library', libTab: 'programs' });
  assert.deepEqual(bsLibraryPlace('soundtracks', T), { tab: 'soundtracks', libTab: 'plans' });
  assert.deepEqual(bsLibraryPlace('playlists', T), { tab: 'soundtracks', libTab: 'plans' }, 'the Playlists shortcut opens Music');
  assert.deepEqual(bsLibraryPlace('', T), { tab: 'library', libTab: 'plans' }, 'the tab bar: the first kind');
  assert.deepEqual(bsLibraryPlace('diet', T), { tab: 'library', libTab: 'plans' }, 'another library\'s kind is not this one\'s');
  assert.deepEqual(bsLibraryPlace('diet', ['plans', 'programs', 'diet']), { tab: 'library', libTab: 'diet' });
  // What a page records reads back as the same place.
  for (const [tab, libTab] of [['library', 'workouts'], ['soundtracks', 'plans'], ['library', 'plans']]) {
    assert.deepEqual(bsLibraryPlace(bsLibraryPlaceSub(tab, libTab), T), { tab, libTab }, tab + '/' + libTab);
  }
});

test('Chat records its place, and reads back only a place it has', () => {
  assert.deepEqual(bsChatPlaceLoc('feed', 'SHAPE', 'coaches'), { tab: 'feed', filter: 'SHAPE' });
  assert.deepEqual(bsChatPlaceLoc('feed', '', 'coaches'), { tab: 'feed', filter: 'COMMUNITY' }, 'the Wall');
  assert.deepEqual(bsChatPlaceLoc('teams', 'SHAPE', 'friends'), { tab: 'teams', teams: 'friends' });
  assert.deepEqual(bsChatPlaceLoc('teams', 'SHAPE', 'x'), { tab: 'teams', teams: 'coaches' });
  assert.deepEqual(bsChatPlaceLoc('channels', 'SHAPE', 'friends'), { tab: 'channels' });
  assert.equal(bsChatPlaceLoc('support', 'SHAPE', 'coaches'), null, 'no place it can open again');
  assert.deepEqual(bsChatPlaceOf({ tab: 'teams', teams: 'friends' }), { tab: 'teams', teams: 'friends' });
  assert.deepEqual(bsChatPlaceOf({ tab: 'feed', filter: 'TRAINER' }), { tab: 'feed', filter: 'TRAINER' });
  assert.equal(bsChatPlaceOf({ tab: 'wall' }), null);
  assert.equal(bsChatPlaceOf(null), null);
  assert.equal(bsChatPlaceOf('teams'), null);
});

test('a profile is recorded as its plain fields, and only when it names someone', () => {
  const post = { who: 'Priya Shah', userId: 'u-9', kind: 'CLIENT', tier: 'peak', photo: 'https://x/p.jpg', public: true, comments: [{ t: 'nice' }], reactions: { fire: 2 }, at: null };
  assert.deepEqual(bsProfileLoc(post), { who: 'Priya Shah', userId: 'u-9', kind: 'CLIENT', tier: 'peak', photo: 'https://x/p.jpg', public: true, at: null });
  assert.deepEqual(bsProfileLoc({ who: 'Drew' }), { who: 'Drew' }, 'a sample member, by name');
  assert.equal(bsProfileLoc({ kind: 'CLIENT' }), null);
  assert.equal(bsProfileLoc(null), null);
});

test('Goals is recorded with its station, and every station reads back', () => {
  for (const v of ['training', 'nutrition', 'work', 'week', 'terms']) {
    assert.equal(bsGoalsSub(v), 'goals:' + v);
    assert.equal(bsGoalsView(bsGoalsSub(v)), v);
  }
  assert.equal(bsGoalsSub('cover'), 'goals');
  assert.equal(bsGoalsSub('nope'), 'goals');
  assert.equal(bsGoalsView('goals'), 'cover');
  assert.equal(bsGoalsView('goals:nope'), 'cover');
  assert.equal(bsGoalsView('goalsx'), null, 'not Goals');
  assert.equal(bsGoalsView('mornings'), null);
  assert.equal(bsGoalsView(''), null);
});

test('the register: a page\'s place rides a push under an overlay, and a Back brings it back', () => {
  bsNavClear();
  // Programs on Music, then Settings opened over it (the corner).
  bsNavAnnounce({ libPlace: 'soundtracks' }, 'library');
  bsNavAnnounce({ sub: 'pricing' }, 'settings');
  bsNavPush(bsNavCompose({ tab: 'programs', overlay: 'settings', sub: '' }));
  // Settings closes: its own entry only; the page's stays.
  bsNavAnnounce(null, 'settings');
  bsNavPush(bsNavCompose({ tab: 'programs', libPlace: '' }));
  assert.deepEqual(bsNavPop(), { tab: 'programs', libPlace: 'soundtracks' });
  const under = bsNavPop();
  assert.equal(under.sub, 'pricing', 'Settings\' page');
  assert.equal(under.libPlace, 'soundtracks', 'and the page under it, on its own key');
  // Chat on Team's Friends with a profile open, then a jump.
  bsNavClear();
  bsNavAnnounce({ detail: { place: { tab: 'teams', teams: 'friends' }, profile: { who: 'Drew' } } }, 'chat');
  bsNavPush(bsNavCompose({ tab: 'chat' }));
  assert.deepEqual(bsNavPop(), { tab: 'chat', detail: { place: { tab: 'teams', teams: 'friends' }, profile: { who: 'Drew' } } });
  bsNavClear();
});

// ── Chat ────────────────────────────────────────────────────────────────────────────────────────

test('Chat announces its place and a profile opened inside it, and a Back reopens both', () => {
  const feed = between(CLIENT, 'function BSClientFeed({', '\n}\n');
  assert.match(CLIENT, /^import \{ bsGoalsSub, bsGoalsView, bsChatPlaceLoc, bsChatPlaceOf, bsProfileLoc \} from '\.\.\/services\/navPlaces\.mjs';/m);
  assert.match(feed, /const chatAnnounce = \{\n\s+\.\.\.\(chatNavDetail \|\| null\),\n\s+place: bsChatPlaceLoc\(tab, filter, teamsSel\),\n\s+\.\.\.\(bsProfileLoc\(openProfile\) \? \{ profile: bsProfileLoc\(openProfile\) \} : null\),\n\s+\};/);
  assert.match(feed, /window\.ShapeNav\?\.announce\?\.\(Object\.keys\(chatAnnounce\)\.length \? \{ detail: chatAnnounce \} : null, 'chat'\);/);
  assert.match(feed, /\}, \[JSON\.stringify\(chatAnnounce\)\]\);/);
  // Read and write sit above the early returns that draw a profile or a thread.
  for (const s of ['const [tab, setTab]', 'const [filter, setFilter]', 'const [teamsSel, setTeamsSel]', 'const [openProfile, setOpenProfile]']) {
    assert.ok(feed.indexOf(s) >= 0 && feed.indexOf(s) < feed.indexOf('const chatAnnounce'), s);
  }
  assert.ok(feed.indexOf('const chatAnnounce') < feed.indexOf('  if (openProfile) {'));
  // The replay: the place and the profile first, so the thread a request brings opens under the profile.
  const effect = between(feed, '// External "Message <coach>" requests', '}, [openRequest && openRequest.nonce]);');
  assert.match(effect, /const place = bsChatPlaceOf\(openRequest\.place\);\n\s+if \(place\) \{ setTab\(place\.tab\); if \(place\.filter\) setFilter\(place\.filter\); if \(place\.teams\) setTeamsSel\(place\.teams\); \}\n\s+setOpenProfile\(openRequest\.profile && typeof openRequest\.profile === 'object' \? openRequest\.profile : null\);/);
  assert.ok(effect.indexOf('setOpenProfile(openRequest.profile') < effect.indexOf('if (openRequest.conversationId)'), 'before the thread\'s branch returns');
  // A Back to the list (a place, no thread) opens no thread and does not fall to Team's Coaches.
  assert.match(effect, /if \(openRequest\.support\) return;\n\s+\/\/[^\n]*\n\s+if \(place && !name\) \{ setOpenChat\(null\); return; \}\n\s+setTab\('teams'\);/);
  // The coach apps run this page (BSClientChat), and their shells replay its detail the same way.
  assert.match(CLIENT, /function BSClientChat\(\{ onProfile, role = 'client', openRequest \}\) \{\n\s+return <BSClientFeed onProfile=\{onProfile\} role=\{role\} openRequest=\{openRequest\} \/>;/);
  assert.equal((PROS.match(/chat:\s+<BSClientChat onProfile=\{goSettings\} sheet=\{sheet\} role="(?:trainer|nutritionist)" openRequest=\{chatRequest\} \/>/g) || []).length, 2);
});

// ── A coach's library ─────────────────────────────────────────────────────────────────────────────

test('Programs and Plans open where they were, and the Playlists shortcut opens Music', () => {
  assert.match(PROS, /^import \{ bsLibraryPlace, bsLibraryPlaceSub \} from '\.\.\/services\/navPlaces\.mjs';/m);
  const programs = between(PROS, 'function BSTrainerPrograms({', '\n}\n');
  const plans = between(PROS, 'function BSNutriPlans({', '\n}\n');
  for (const [name, page, kinds] of [['Programs', programs, "\\['plans', 'workouts', 'programs'\\]"], ['Plans', plans, "\\['plans', 'programs', 'diet'\\]"]]) {
    assert.match(page, new RegExp(`const libStart = bsLibraryPlace\\(initialTab, ${kinds}\\);\\n\\s+const \\[tab, setTab\\] = useStateBSP\\(libStart\\.tab\\);`), name);
    assert.match(page, /const \[libTab, setLibTab\] = useStateBSP\(libStart\.libTab\);\n\s+const libPlace = bsLibraryPlaceSub\(tab, libTab\);\n\s+React\.useEffect\(\(\) => \{\n\s+window\.ShapeNav\?\.announce\?\.\(\{ libPlace \}, 'library'\);\n\s+return \(\) => window\.ShapeNav\?\.announce\?\.\(null, 'library'\);\n\s+\}, \[libPlace\]\);/, name);
    assert.doesNotMatch(page, /useStateBSP\('library'\)/, name + ' no longer opens on a fixed tab');
  }
  assert.match(programs, /^function BSTrainerPrograms\(\{ initialTab = '', /);
  assert.match(plans, /^function BSNutriPlans\(\{ initialTab = '', /);
  const trainer = between(PROS, 'function BSTrainerAppInner(', '\nfunction ');
  assert.match(trainer, /const \[programInitialTab, setProgramInitialTab\] = useStateBSP\(''\);/);
  // A field of its own: Settings, open over the page, announces `sub`.
  assert.match(trainer, /if \(tab === 'programs'\) return \{ tab: 'programs', libPlace: programInitialTab \};/);
  assert.match(trainer, /if \(loc\.tab === 'programs'\) setProgramInitialTab\(loc\.libPlace \|\| ''\);/);
  assert.match(trainer, /setProgramInitialTab\(action === 'playlists' \? 'soundtracks' : ''\);/);
  assert.doesNotMatch(trainer, /setProgramInitialTab\('programs'\)/);
  assert.match(trainer, /initialTab=\{programInitialTab\}/);
  const nutri = between(PROS, 'function BSNutritionistAppInner(', '\nfunction ');
  assert.match(nutri, /const \[plansStart, setPlansStart\] = useStateBSP\(''\);/);
  assert.match(nutri, /if \(tab === 'plans'\) return \{ tab: 'plans', libPlace: plansStart \};/);
  assert.match(nutri, /if \(loc\.tab === 'plans'\) setPlansStart\(loc\.libPlace \|\| ''\);/);
  assert.match(nutri, /if \(action === 'plans'\) \{ setPlansStart\(''\); setTab\('plans'\); return; \}/);
  assert.match(nutri, /<BSNutriPlans sheet=\{sheet\} initialTab=\{plansStart\} /);
});

// ── The Score page's Record ──────────────────────────────────────────────────────────────────────

test('the Score page\'s Record opens again on a Back, from Me and from the Store tab', () => {
  const score = between(CLIENT, 'function BSShapeScorePage({', '\n}\n');
  assert.match(score, /^function BSShapeScorePage\(\{ onBack, onOpenStore, profile = SHAPE_SCORE_PROFILES\.client, initialRecord = false, onRecord = null \}\) \{/);
  assert.match(score, /const \[showRecord, setShowRecord\] = useStateBSC\(!!initialRecord && !isCoach\);/);
  assert.ok(score.indexOf('const isCoach') < score.indexOf('const [showRecord'), 'a coach\'s page has no Record');
  assert.match(score, /React\.useEffect\(\(\) => \{ if \(onRecordRef\.current\) onRecordRef\.current\(showRecord\); \}, \[showRecord\]\);/);
  const me = between(CLIENT, 'function BSClientMe(', '\n}\n');
  assert.match(me, /const \[showScore, setShowScore\] = useStateBSC\(initialPage === 'score' \|\| initialPage === 'record'\);/);
  assert.match(me, /const \[scoreRecord, setScoreRecord\] = useStateBSC\(initialPage === 'record'\);/);
  assert.match(me, /const meNavSub = showScore \? \(scoreRecord \? 'record' : 'score'\) : showStore \? 'store' : '';/);
  assert.match(me, /<BSShapeScorePage profile=\{scoreProfile\} initialRecord=\{scoreRecord\} onRecord=\{setScoreRecord\} /);
  assert.ok(me.indexOf('const [scoreRecord') < me.indexOf('const meNavSub'));
  // The member Store tab: its Record is storeView 'record', recorded as the tab's sub.
  assert.match(CLIENT, /if \(loc\.tab === 'store'\) setStoreView\(loc\.sub === 'score' \|\| loc\.sub === 'record' \? loc\.sub : 'store'\);/);
  assert.match(CLIENT, /store:   storeView === 'score' \|\| storeView === 'record'\n/);
  assert.match(CLIENT, /initialRecord=\{storeView === 'record'\} onRecord=\{\(open\) => setStoreView\(\(v\) => \(v === 'score' \|\| v === 'record' \? \(open \? 'record' : 'score'\) : v\)\)\}/);
});

// ── Goals ───────────────────────────────────────────────────────────────────────────────────────

test('a Goals station opens again on a Back, under Home and under Settings', () => {
  assert.match(GOALS, /export function BSClientGoals\(\{ onBack, onOpenProgress = \(\) => \{\}, initialView = 'cover', onView = null \}\) \{/);
  assert.match(GOALS, /const \[goalView, setGoalView\] = useState\(initialView \|\| 'cover'\);/);
  assert.match(GOALS, /React\.useEffect\(\(\) => \{ if \(onViewRef\.current\) onViewRef\.current\(goalView\); \}, \[goalView\]\);/);
  // Opened onto a station, the page does not take the focus on mount.
  assert.match(GOALS, /const prevGoalViewRef = React\.useRef\(initialView \|\| 'cover'\);/);
  assert.doesNotMatch(GOALS, /window\.ShapeNav/, 'the parents announce it, never the page');
  // Home: the station rides Home's 'goals' sub, and clears when the page closes.
  const home = between(CLIENT, 'function BSClientHome({', '\n}\n');
  assert.match(home, /const \[goalsView, setGoalsView\] = useStateBSC\(bsGoalsView\(initialPage\) \|\| 'cover'\);\n\s+React\.useEffect\(\(\) => \{ if \(!goalsPage\) setGoalsView\('cover'\); \}, \[goalsPage\]\);/);
  assert.match(home, /if \(bsGoalsView\(initialPage\) != null\) \{ setGoalsView\(bsGoalsView\(initialPage\)\); setGoalsPage\(true\); \}/);
  // Settings: More → Goals, reopened over More.
  const settings = between(CLIENT, 'function BSSettings({', '\n}\n');
  assert.match(settings, /const \[showGoals, setShowGoals\] = useStateBSC\(bsGoalsView\(initialPage\) != null\);\n\s+const \[goalsView, setGoalsView\] = useStateBSC\(bsGoalsView\(initialPage\) \|\| 'cover'\);\n\s+React\.useEffect\(\(\) => \{ if \(!showGoals\) setGoalsView\('cover'\); \}, \[showGoals\]\);/);
  assert.ok(settings.indexOf('const [goalsView') < settings.indexOf('const navSub'));
  for (const src of [home, settings]) assert.match(src, /<BSClientGoals initialView=\{goalsView\} onView=\{setGoalsView\} onBack=/);
});

test('Home\'s check-in page and its session preview open again on a Back', () => {
  const home = between(CLIENT, 'function BSClientHome({', '\n}\n');
  assert.match(home, /else if \(initialPage === 'today'\) setShowWorkoutPreview\(initialPreview \|\| true\);\n\s+else if \(initialPage === 'checkin'\) setCheckinPage\(true\);/);
  // Team's preview of a picked day rides along; today's session is `true`, which needs nothing more.
  assert.match(home, /const homePreview = homeSub === 'today' && showWorkoutPreview && typeof showWorkoutPreview === 'object' \? showWorkoutPreview : null;/);
  assert.equal((home.match(/const \[checkinPage, setCheckinPage\]/g) || []).length, 1, 'one declaration, moved above the announce');
  const shell = between(CLIENT, 'function BSClientAppInner(', '\nfunction ');
  assert.match(shell, /const \[homeStartPreview, setHomeStartPreview\] = useStateBSC\(null\);/);
});

// ── Another app's history ──────────────────────────────────────────────────────────────────────────
// Found walking these: the member app → Settings → profile type Trainer left the member app's stack, so
// the trainer app's first push was not empty→non-empty, it never armed, ignored every popstate, and the
// phone's second Back walked off the app (the same on main).

test('a shell drops a stack another shell left, and adopts that shell\'s guard entry', () => {
  bsNavClear();
  bsNavPush({ tab: 'home' }); // the member app's Settings push, before the switch
  assert.equal(bsGuardOnFirstUse(bsNavSize()), 'adopt');
  bsNavClear(); // the coach app's first touch
  // Adopted, so its first push (empty → non-empty) asks to arm, which the shell skips: already armed.
  const prev = bsNavSize();
  bsNavPush({ tab: 'programs' });
  assert.equal(bsGuardAfterPush(prev, bsNavSize()), 'arm');
  assert.equal(bsGuardOnFirstUse(0), null, 'a shell that starts clean adopts nothing');
  bsNavClear();
});

test('every way into the history takes the shell\'s first touch first', () => {
  assert.match(SHELL, /const own = React\.useCallback\(\(\) => \{\n\s+if \(owned\.current\) return;\n\s+owned\.current = true;\n\s+if \(bsGuardOnFirstUse\(bsNavSize\(\)\) === 'adopt'\) \{ bsNavClear\(\); armed\.current = true; \}\n\s+\}, \[\]\);/);
  assert.match(SHELL, /const navPush = React\.useCallback\(\(\) => \{\n\s+own\(\);\n\s+const prev = bsNavSize\(\);/);
  assert.match(SHELL, /const navBack = React\.useCallback\(\(fromPopstate = false\) => \{\n\s+own\(\);\n\s+if \(!bsNavCanPop\(\)\) return false;/);
  assert.match(SHELL, /const onPop = \(\) => \{\n\s+own\(\);\n\s+if \(!armed\.current\) return;/);
  assert.match(SHELL, /const navClear = React\.useCallback\(\(\) => \{\n\s+own\(\);\n\s+bsNavClear\(\);/);
  assert.match(SHELL, /const canPop = \(\) => \{ own\(\); return bsNavCanPop\(\); \};\n\s+window\.ShapeNav = \{ push: navPush, back: navBack, canPop, announce: bsNavAnnounce, clear: navClear \};/);
});
