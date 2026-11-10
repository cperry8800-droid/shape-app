// The chat page's header above the Wall, in the Wall's magazine look (owner, 2026-10-24, on a screenshot
// of the lens, the online rail, the Feed / Team / Channels pill and the Wall / Client / Community tabs:
// "also need to design this to match the new feed wall look"). The rail keeps its faceted shape in a
// flat, magazine cut ("keep the same facet shape but … go with the new design"). Since 2026-10-26 (the
// owner's B, "go with B") there is no section strip and no role tabs: the page's title names the place
// and opens the places (BSChatPlaces.jsx, tests/chat-places.test.mjs). Team's Coaches / Friends row is
// still an index, ink against grey with no underline ("look too busy"), centred ("center these on page").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync, readdirSync } from 'node:fs';
import { ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const React = require_('react');
const STORY = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWallStory.jsx'), { registry: new Map([['react', React]]) });
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const WALL_TOP = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSWallTop.jsx'), 'utf8');

test('the magazine teal is the Wall\'s, on both papers', () => {
  // Shape's teal, not the magazine's red it was (owner, 2026-10-27: "Those should be shape colors"): the
  // deeper teal on light paper, which small text needs (4.6:1 on cream), the bright one on dark.
  assert.equal(STORY.bsWsAccent({ isLight: true }), '#0a7a72');
  assert.equal(STORY.bsWsAccent({ isLight: false }), '#34d6c5');
  // And no copy of the red, or its over-photo tint, is left anywhere in the app.
  const dir = join(ROOT, 'mobile-app/src');
  const left = readdirSync(dir, { recursive: true })
    .filter((f) => /\.(jsx|mjs|js)$/.test(f))
    .filter((f) => /#(?:b23a1f|ff7a5c|ffb39f)\b/i.test(readFileSync(join(dir, f), 'utf8')));
  assert.deepEqual(left, [], 'the magazine red is back in: ' + left.join(', '));
  // The headline face is the app's own, as on every other page (owner: "Font needs to be same on whole app").
  assert.equal(STORY.bsWsHead({ HEADLINE: 'Oswald', DISPLAY: 'Saira' }), 'Saira');
});

// The lit chip (the owner's C for the top of the Wall, 2026-11-04; the look picker's tags since the Wall's top
// became the owner's B). On dark paper the one lit is framed and lettered in the bright teal and glows in a
// dark slot; on light paper it takes the deeper teal, in a faint ink wash, with no glow.
test('the Wall\'s lit chip, on both papers', () => {
  const dark = { isLight: false, INK: '#f1ece1', INK70: 'ink70' };
  const light = { isLight: true, INK: '#14110e', INK70: 'ink70' };
  const on = STORY.bsWsLed(dark, true), off = STORY.bsWsLed(dark, false);
  assert.equal(on.color, '#34d6c5');
  assert.equal(on.border, '1px solid #34d6c5');
  assert.equal(on.textShadow, '0 0 8px rgba(52, 214, 197, 0.8)');
  assert.equal(on.background, 'rgba(0,0,0,0.45)');
  assert.equal(off.color, 'ink70');
  assert.equal(off.border, '1px solid rgba(241, 236, 225, 0.12)');
  assert.equal(off.textShadow, 'none');
  const lon = STORY.bsWsLed(light, true);
  assert.equal(lon.color, '#0a7a72', 'small teal text on cream takes the deeper teal');
  assert.equal(lon.textShadow, 'none', 'no glow on light paper');
  assert.equal(lon.background, 'rgba(20, 17, 14, 0.05)');
});

test('the rail and the Wall\'s faces keep the faceted shape in the magazine\'s flat cut', () => {
  // The rail is BSWallTop's (tests/wall-top.test.mjs); it asks the client for each face, so the facet and the
  // ringed circle stay with BSFacetAvatar and BSRailCoachFace.
  const rail = CLIENT.slice(CLIENT.indexOf('const railFace = (p, o = {}) =>'), CLIENT.indexOf('const openRailPerson = '));
  assert.ok(rail.length > 0, 'the client draws no rail face');
  assert.match(CLIENT, /<BSWallTop [^>]*face=\{railFace\}/, 'the rail does not draw its faces with the client\'s railFace');
  // A member keeps the facet; a coach is a circle in the coach's colour (owner, 2026-11-04: "keep the facet
  // avatars for clients and circle avatar for coaches").
  assert.match(rail, /\(p\.role === 'trainer' \|\| p\.role === 'nutritionist'\s*\? <BSRailCoachFace size=\{o\.size \|\| 46\} box=\{o\.box \|\| 40\} ring=\{p\.role === 'nutritionist' \? '#a07a2e' : '#c0533b'\}/);
  // A coach's photo that fails to load gives way to their initials, as a facet's does (Codex on #2602).
  const coachFace = CLIENT.slice(CLIENT.indexOf('function BSRailCoachFace('), CLIENT.indexOf('function BSFacetAvatar('));
  assert.match(coachFace, /const \[failed, setFailed\] = useStateBSC\(null\);\s*const src = valid && failed !== valid \? valid : null;/);
  assert.match(coachFace, /<img src=\{src\} alt="" onError=\{\(\) => setFailed\(src\)\}/);
  assert.match(coachFace, /: <span[^>]*>\{initial \|\| '•'\}<\/span>\}/, 'no photo, the initials');
  assert.match(rail, /: <BSFacetAvatar flat size=\{o\.box \|\| 40\} c=\{t\.INK\} dotC=\{p\.activity === 'cooking' \? \(t\.AMBER \|\| '#d8a23a'\) : magAccent\} initial=\{bsInitials\(p\.name\)\} photo=\{railPhotoOf\(p\)\} showRank=\{false\} live=\{!!p\.live\} activity=\{p\.activity\} BG=\{t\.PAPER\} \/>\);/);
  assert.doesNotMatch(rail, /railTierColor/, 'no tier colour in the rail');
  // The live story's byline face is the same flat cut, and so are a Wall story's: its byline, the
  // faces of who reacted, and the comments under it (the classic card keeps its tier gems).
  assert.match(CLIENT, /avatar=\{\(p\) => <BSFacetAvatar flat size=\{24\} c=\{t\.INK\}/);
  assert.match(CLIENT, /avatar=\{hideAuthor \? null : <BSFacetAvatar flat size=\{24\} c=\{t\.INK\} initial=\{bsInitials\(a\.who\)\}/);
  assert.match(CLIENT, /<BSFacetAvatar key=\{i\} flat=\{isMag\} size=\{22\} c=\{isMag \? t\.INK : bsTierColor\(/);
  assert.match(CLIENT, /<BSFeedComment key=\{i\} c=\{c\}[^>]*size=\{24\} flat=\{isMag\} \/>/);
  assert.match(CLIENT, /<BSFacetAvatar flat=\{flat\} size=\{size\} c=\{flat \? t\.INK : col\}/);
  // The flat cut: the same rotated, rounded square, with no gradient, glow, sheen or pulse.
  const facet = CLIENT.slice(CLIENT.indexOf('function BSFacetAvatar('), CLIENT.indexOf('function bsPickProfilePhoto('));
  assert.match(facet, /\{live && !flat && <div className="bs-av-pulse"/);
  assert.match(facet, /transform: 'rotate\(45deg\)', borderRadius: '27%', background: flat \? c : `linear-gradient/);
  assert.match(facet, /boxShadow: flat \? 'none' : `0 5px 16px/);
  assert.match(facet, /\{!flat && <div style=\{\{ position: 'absolute', inset: 0, borderRadius: '27%', background: 'linear-gradient\(135deg, rgba\(255,255,255,0\.28\)/);
  // The flat cut's dot defaults to the magazine's teal (amber at the stove); the gem keeps its teal.
  assert.match(facet, /const dotColor = dotC \|\| \(activity === 'cooking' \? COOK : flat \? bsWsAccent\(t\) : '#34d6c5'\);/);
});

test('no section strip and no role tabs: the title is the switch, on the Wall\'s 12px edge', () => {
  // The Wall's type chips keep the cards' 12px gutter (BSWallTop draws them; tests/wall-top.test.mjs).
  assert.match(WALL_TOP, /<nav data-bs-wall-types="" data-bswt-scroll="" aria-label=\{typesLabel\}/);
  assert.match(WALL_TOP, /margin: '0 12px'/);
  // Owner, 2026-10-26: "go with B". The Feed / Team / Channels strip and the Wall / Client / Community
  // tabs are gone; where the strip stood is the gap under the rail and the auto-hide's anchor.
  assert.doesNotMatch(CLIENT, /data-bs-chat-sections|const SectionTab = /, 'the section strip is back');
  assert.doesNotMatch(CLIENT, /CHIP_KEYS\.map\(k => bsSubTab\(/, 'the role tabs are back');
  assert.match(CLIENT, /<div ref=\{bsSubAnchorRef\} aria-hidden style=\{\{ height: tab === 'feed' \? 14 : 4 \}\} \/>/);
  assert.match(CLIENT, /<BSChatPlaceTitle label=\{placeLabel\} open=\{placesOpen\}/);
  assert.doesNotMatch(CLIENT, /<Pill key=\{k\}/, 'the teal pill is gone');
});

test('Team\'s Coaches / Friends is one raised track, the list shown a teal pill (owner, 2026-11-08, idea A)', () => {
  const tabs = between(CLIENT, '<div data-bs-team-tabs=""', '<div aria-hidden style={{ height: 16 }} />');
  // One raised track (the Wall's type chips' bsWallRaised), its two halves the width of the list.
  assert.match(tabs, /style=\{\{ \.\.\.bsWallRaised\(t, 999\), display: 'grid', gridTemplateColumns: '1fr 1fr'/);
  assert.match(tabs, /\{selectors\.map\(\(sec\) => \{/);
  // Each half keeps a 44px target and says which list is shown.
  assert.match(tabs, /aria-pressed=\{on\} onClick=\{\(\) => setTeamsSel\(sec\.key\)\}/);
  assert.match(tabs, /minHeight: 44, padding: 0/, 'the 44px target stays');
  // The list shown is the Wall's lit pill; the other quiet ink.
  assert.match(tabs, /\.\.\.\(on \? bsWallLit\(t\) : \{ background: 'transparent', color: bsTHexA\(t\.INK, 0\.62\) \}\)/);
  // A list's unread is a small count beside its name, capped at 9+.
  assert.match(tabs, /\{sec\.badge > 0 && <span [^>]*>\{sec\.badge > 9 \? '9\+' : sec\.badge\}<\/span>\}/);
  assert.match(CLIENT, /^import \{ BSWallTop, bsWallRaised, bsWallLit \} from '\.\/BSWallTop\.jsx';$/m);
  // The old mono index is gone, with its helper.
  assert.doesNotMatch(CLIENT, /const bsSubTab = |bsSubTab\(/, 'the mono index is back');
  // The Wall's lens is BSWallTop's (the owner's B, 2026-11-04; tests/wall-top.test.mjs), the switch the client's.
  assert.match(CLIENT, /<BSWallTop [^>]*lenses=\{wallLenses\} mode=\{feedMode\} onMode=\{switchFeedMode\}/);
  assert.doesNotMatch(CLIENT, /BSWallLensChips|bsWsLed/, 'the lit chips are back in the title row');
});

// Owner, 2026-10-24: "make the team list match the new design too". The Team list (Coaches and Friends)
// gets THE WALL's masthead grammar and the magazine's rows, on the Wall's 12px edge.
test('the Team list is in the magazine look: a masthead, flat faces, teal unread, hairlines', () => {
  const team = CLIENT.slice(CLIENT.indexOf("          const Row = (f, i, arr) => {"), CLIENT.indexOf('          // Friends — now a sub-tab INSIDE Team'));
  // The rows.
  assert.match(team, /<BSFacetAvatar flat size=\{BS_CHAT_SIZES\.rowFace\} c=\{t\.INK\} initial=\{bsInitials\(f\.n\) \|\| f\.i\}[^>]*online=\{online\} dotC=\{magAccent\} BG=\{t\.PAPER\} \/>/);
  assert.match(team, /fontFamily: bsWsHead\(t\), fontWeight: 500, fontSize: BS_CHAT_SIZES\.rowName[^}]*\}\}>\{f\.n\}<\/span>/, 'the name in the headline face');
  assert.match(team, /\{count > 0 && <span style=\{\{ fontFamily: t\.MONO, fontSize: 10, fontWeight: 800, color: magAccent/, 'a bare teal count');
  assert.match(team, /border: 0, borderBottom: isLast \? 0 : `1px solid \$\{t\.HAIR\}`/, 'a hairline between rows, after the border reset');
  assert.doesNotMatch(team, /background: TEAL|teal\} 62%|bsSdPrBreath|bsTierColor/, 'no teal pill, gradient rule, breathing dot or tier gem');
  // The register alone: the big COACHES / FRIENDS head went (owner, 2026-11-04: "get rid of the large
  // coaches header and Friends header").
  assert.match(team, /<header data-bs-team-head="" style=\{\{ marginTop: -8 \}\}>/);
  assert.doesNotMatch(team, /<header data-bs-team-head=""[^>]*>[\s\S]{0,400}<h2 /, 'no big head over the list');
  assert.match(team, /color: magAccent, padding: 0 \}\}>\{tr\('feed:team\.new'/, 'New in teal');
  // The Team tab's column sits on the Wall's 12px edge, the track 10px under the rail's cards (owner,
  // 2026-11-04: "reduce gap here"; 2026-11-08: "reduce the gap here"): it rises 8px into the rail's 14px
  // foot, and the room under it is inside the row that hides on scroll, so it goes with the row.
  assert.match(CLIENT, /<div style=\{\{ padding: '0 12px 90px', display: 'flex', flexDirection: 'column', gap: 0 \}\}>\s*\{\/\*[^]*?\*\/\}\s*<div inert=\{subHidden\} style=\{\{ \.\.\.bsSubStyle\(0\), marginTop: -8 \}\}>\s*<div data-bs-team-tabs=""/);
  assert.match(CLIENT, /<\/div>\s*<div aria-hidden style=\{\{ height: 16 \}\} \/>\s*<\/div>\s*\{active\.key === 'friends' \?/, 'the room under the track hides with it');
  assert.match(CLIENT, /<div ref=\{bsSubAnchorRef\} aria-hidden style=\{\{ height: tab === 'feed' \? 14 : 4 \}\} \/>/, 'the gap under the rail on Chat');
});

// Owner, 2026-10-24: "everything on chat page should match new feed wall design". The page's title, the
// Client / Community posts, Channels, the thread screen and the composer follow the Wall.
const between = (src, a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)); };

test('the chat page\'s title is in the Wall\'s face, with no kicker over it (owner, 2026-11-08)', () => {
  const feed = between(CLIENT, 'function BSClientFeed(', 'function BSNoraSheet(');
  assert.doesNotMatch(feed, /feed:masthead\.eyebrow/, 'the CHAT kicker is back');
  // The title is the places' button now (BSChatPlaces.jsx), in the same face and size.
  const places = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSChatPlaces.jsx'), 'utf8');
  assert.match(places, /<h1 style=\{\{ margin: '4px 0 0', lineHeight: 1 \}\}>\s*<button ref=\{buttonRef\}/);
  assert.match(places, /fontFamily: bsWsHead\(t\), fontWeight: 500, fontSize: 36/);
});

test('a Client or Community post is a square note under a flat face, not a tinted bubble', () => {
  const post = between(CLIENT, '  const renderPost = (p, i) => {', '  // Bundle every closure dep');
  assert.match(post, /<BSFacetAvatar flat size=\{38\} c=\{t\.INK\}/);
  assert.match(post, /<div style=\{\{ borderRadius: 0, [^}]*border: p\.official \? 'none' : `1px solid \$\{bsTHexA\(t\.INK, 0\.18\)\}`/);
  assert.doesNotMatch(post, /TEALB|t\.ACCENT|border: `1px solid \$\{rc\}66`/, 'no teal, no coloured role chip');
});

test('Channels: the masthead, the magazine\'s teal, the names in the Wall\'s face, still dots, ink buttons', () => {
  const ch = between(CLIENT, '          const tealSig = ', '                {channels && chList.length === 0 && newChannel === null && (');
  assert.match(ch, /const tealSig = magAccent;/);
  // The register alone: THE CHANNELS head went (owner, 2026-11-04: "remove this channels").
  assert.match(ch, /<header data-bs-channels-head="">/);
  assert.doesNotMatch(ch, /<header data-bs-channels-head="">[\s\S]{0,300}<h2 /, 'no big head over the channels');
  assert.match(ch, /fontFamily: bsWsHead\(t\), fontWeight: 500, fontSize: BS_CHAT_SIZES\.rowName[^}]*\}\}>#\{ch\.name\}/);
  assert.doesNotMatch(ch, /bsSdPrBreath|background: TEAL|linear-gradient\(90deg, \$\{t\.INK\}, \$\{tealSig\}/, 'no breathing dot, teal button or gradient rule');
  assert.match(CLIENT, /<div style=\{\{ padding: '7px 12px 90px', display: 'flex', flexDirection: 'column', gap: 12 \}\}>/, 'on the Wall\'s 12px edge, as close under the tabs as Team');
});

// One size for a face and a name wherever Chat shows a person (owner, 2026-11-10: "make the name and avatars
// smaller on the coaches and friends page … the sizes on the chats need to remain consistent and the same
// across all"). The list rows came down from a 44px face and a 20px name; the threads keep theirs. Every
// site reads the one table, so a coach's thread, a friend's and a channel's can't drift apart.
test('Chat: one size for faces and names, the list rows smaller, every thread alike', () => {
  const table = between(CLIENT, 'const BS_CHAT_SIZES = Object.freeze({', '});');
  assert.match(table, /rowFace: 36, rowName: 16,/, 'a list row: Coaches, Friends and a channel');
  assert.match(table, /senderFace: 24, senderName: 8\.5,/, 'a message\'s sender and the typing row');
  assert.match(table, /headFace: 48, headName: 25,/, 'the open thread\'s head');
  const team = CLIENT.slice(CLIENT.indexOf("          const Row = (f, i, arr) => {"), CLIENT.indexOf('          // Friends — now a sub-tab INSIDE Team'));
  // Coaches and Friends draw every row with the one Row, so a coach's row and a friend's are the same size.
  assert.match(CLIENT, /\{friends\.map\(Row\)\}/);
  assert.match(CLIENT, /\{coaches\.map\(Row\)\}/);
  assert.doesNotMatch(team, /size=\{\d+\}|fontSize: 20\b/, 'a row sized on its own');
  const th = between(CLIENT, 'function BSChatThread({', '\n}\n');
  assert.equal((th.match(/roundFace\(BS_CHAT_SIZES\.senderFace,/g) || []).length, 2, 'the sender and the typing row');
  assert.equal((th.match(/roundFace\(BS_CHAT_SIZES\.headFace,/g) || []).length, 1, 'the head');
  assert.doesNotMatch(th, /roundFace\(\d/, 'a face sized on its own');
  assert.match(th, /width: BS_CHAT_SIZES\.headFace, height: BS_CHAT_SIZES\.headFace, borderRadius: '50%'/, 'a channel\'s # at the head\'s size');
  assert.match(th, /<span data-thread-name="" style=\{\{ display: 'block', fontFamily: t\.DISPLAY, fontSize: BS_CHAT_SIZES\.headName,/);
  assert.match(th, /fontSize: BS_CHAT_SIZES\.senderName, fontWeight: 800, letterSpacing: '0\.16em', textTransform: 'uppercase', color: teal \}\}>\{senderName\}/);
});

// The thread screen left the magazine look for Nora's sheet's design (owner, 2026-11-01: "also use this
// chat design for the rest of messaging on chat page"): tests/chat-thread-nora-design.test.mjs drives it.
// The desk is on the page's own paper since 2026-11-09 ("remove the white color from the top part of chat
// screen. Make it all same color").
test('the thread screen: the magazine teal on the paper, the desk on the same paper, Nora\'s tray', () => {
  const th = between(CLIENT, 'function BSChatThread({', '\n}\n');
  assert.match(th, /const teal = bsWsAccent\(t\);/);
  assert.match(th, /const DESK = t\.PAPER, DESK_INK = t\.INK;/);
  assert.match(th, /<window\.BSMastRow ink=\{DESK_INK\} trailing=\{<BSMeCorner ink=\{DESK_INK\} \/>\} \/>/);
  assert.doesNotMatch(th, /<BSFacetAvatar/, 'faces are round photos, as hers are');
  // onType sets the words and sends the typing signal (2026-11-02).
  // ...and the voice-note recorder (2026-11-02).
  assert.match(th, /<BSMessageComposer value=\{text\} onChange=\{onType\} onSend=\{send\} pinned tray above=\{quoteBar\} voiceNote=\{voiceNote\} \/>/);
});

test('the composer is square with an ink send button on the chat page; Nora\'s sheet has its own tray', () => {
  const comp = between(CLIENT, 'function BSMessageComposer({', '\n}\n');
  assert.match(comp, /onVoiceComplete, mag = false, tray = false, above = null, voiceNote = null \}\) \{/);
  assert.match(comp, /background: canSend \? \(mag \? t\.INK : t\.ACCENT\) : t\.SURFACE_BORDER/);
  assert.match(comp, /\{\(mag \|\| tray\) \? null : <span aria-hidden>🔒<\/span>\}/);
  assert.equal((comp.match(/borderRadius: 17,/g) || []).length, 0, 'every rounded control asks mag');
  assert.match(CLIENT, /<BSMessageComposer mag value=\{draft\}/, 'the chat page asks for it');
  // Nora's sheet has its own look again (owner, 2026-10-31: "dont use a previously used one"): the tray,
  // tests/nora-desk.test.mjs.
  assert.match(CLIENT, /<BSMessageComposer tray value=\{supportDraft\}/, 'Nora\'s asks for the tray');
  assert.doesNotMatch(CLIENT, /<BSMessageComposer mag value=\{supportDraft\}/);
});
