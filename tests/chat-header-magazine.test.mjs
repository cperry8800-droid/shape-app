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
const WALL_STORY = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSWallStory.jsx'), 'utf8');

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

test('the rail and the Wall\'s faces keep the faceted shape in the magazine\'s flat cut', () => {
  const rail = CLIENT.slice(CLIENT.indexOf('{railPeople.map((p, i) => {'), CLIENT.indexOf('{/* The way BACK, in place'));
  assert.match(rail, /<BSFacetAvatar flat size=\{40\} c=\{t\.INK\} dotC=\{p\.activity === 'cooking' \? \(t\.AMBER \|\| '#d8a23a'\) : magAccent\} initial=\{bsInitials\(p\.name\)\} photo=\{pPhoto\} showRank=\{false\} live=\{!!p\.live\} activity=\{p\.activity\} BG=\{t\.PAPER\} \/>/);
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
  // The online line's dot is still and teal.
  assert.match(CLIENT, /<span aria-hidden style=\{\{ width: 6, height: 6, borderRadius: 3, background: magAccent \}\} \/>/);
});

test('no section strip and no role tabs: the title is the switch, on the Wall\'s 12px edge', () => {
  // The Wall's type chips keep the cards' 12px gutter.
  assert.match(WALL_STORY, /<nav data-bs-wall-types="" className="bs-hide-scroll" aria-label=\{typesLabel\} style=\{\{ margin: '0 12px',/);
  // Owner, 2026-10-26: "go with B". The Feed / Team / Channels strip and the Wall / Client / Community
  // tabs are gone; where the strip stood is the gap under the rail and the auto-hide's anchor.
  assert.doesNotMatch(CLIENT, /data-bs-chat-sections|const SectionTab = /, 'the section strip is back');
  assert.doesNotMatch(CLIENT, /CHIP_KEYS\.map\(k => bsSubTab\(/, 'the role tabs are back');
  assert.match(CLIENT, /<div ref=\{bsSubAnchorRef\} aria-hidden style=\{\{ height: 14 \}\} \/>/);
  assert.match(CLIENT, /<BSChatPlaceTitle label=\{placeLabel\} open=\{placesOpen\}/);
  assert.doesNotMatch(CLIENT, /<Pill key=\{k\}/, 'the teal pill is gone');
});

test('Team\'s Coaches / Friends row is an index, ink against grey, centred on the page', () => {
  const sub = CLIENT.slice(CLIENT.indexOf('const bsSubTab = '), CLIENT.indexOf('const ROLE = {'));
  assert.match(sub, /minHeight: 44, padding: 0/, 'the 44px target stays');
  // No underline of their own ("look too busy").
  assert.match(sub, /color: on \? t\.INK : bsTHexA\(t\.INK, 0\.38\)/);
  assert.doesNotMatch(sub, /borderBottom|position: 'absolute'|magAccent \}/, 'no underline');
  // Team's Coaches / Friends sits centred on the page ("center these on page").
  assert.match(CLIENT, /<div style=\{\{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center', gap: 22 \}\}>\s*\{selectors\.map\(sec => bsSubTab\(/);
  assert.match(CLIENT, /onClick=\{\(\) => switchFeedMode\(k\)\} aria-pressed=\{on\}[\s\S]{0,400}color: on \? t\.INK : t\.INK50[\s\S]{0,200}background: magAccent \}\} \/>\}/);
});

// Owner, 2026-10-24: "make the team list match the new design too". The Team list (Coaches and Friends)
// gets THE WALL's masthead grammar and the magazine's rows, on the Wall's 12px edge.
test('the Team list is in the magazine look: a masthead, flat faces, teal unread, hairlines', () => {
  const team = CLIENT.slice(CLIENT.indexOf("          const Row = (f, i, arr) => {"), CLIENT.indexOf('          // Friends — now a sub-tab INSIDE Team'));
  // The rows.
  assert.match(team, /<BSFacetAvatar flat size=\{44\} c=\{t\.INK\} initial=\{bsInitials\(f\.n\) \|\| f\.i\}[^>]*online=\{online\} dotC=\{magAccent\} BG=\{t\.PAPER\} \/>/);
  assert.match(team, /fontFamily: bsWsHead\(t\), fontWeight: 500, fontSize: 20[^}]*\}\}>\{f\.n\}<\/span>/, 'the name in the headline face');
  assert.match(team, /\{count > 0 && <span style=\{\{ fontFamily: t\.MONO, fontSize: 10, fontWeight: 800, color: magAccent/, 'a bare teal count');
  assert.match(team, /border: 0, borderBottom: isLast \? 0 : `1px solid \$\{t\.HAIR\}`/, 'a hairline between rows, after the border reset');
  assert.doesNotMatch(team, /background: TEAL|teal\} 62%|bsSdPrBreath|bsTierColor/, 'no teal pill, gradient rule, breathing dot or tier gem');
  // The masthead.
  assert.match(team, /<header data-bs-team-head="">\s*<h2 style=\{\{ margin: 0, padding: '6px 0 8px', borderBottom: `3px solid \$\{t\.INK\}`, fontFamily: bsWsHead\(t\), fontSize: 30/);
  assert.match(team, /color: magAccent, padding: 0 \}\}>\{tr\('feed:team\.new'/, 'New in teal');
  // The Team tab's column sits on the Wall's 12px edge.
  assert.match(CLIENT, /<div style=\{\{ padding: '7px 12px 90px', display: 'flex', flexDirection: 'column', gap: 16 \}\}>\s*<div inert=\{subHidden\} style=\{bsSubStyle\(16\)\}>/);
});

// Owner, 2026-10-24: "everything on chat page should match new feed wall design". The page's title, the
// Client / Community posts, Channels, the thread screen and the composer follow the Wall.
const between = (src, a, b) => { const i = src.indexOf(a); return src.slice(i, src.indexOf(b, i)); };

test('the chat page\'s title is in the Wall\'s face under a teal kicker', () => {
  const feed = between(CLIENT, 'function BSClientFeed(', 'function BSNoraSheet(');
  assert.match(feed, /color: magAccent, fontWeight: 700 \}\}>\s*\{tr\('feed:masthead\.eyebrow'/);
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
  assert.match(ch, /<header data-bs-channels-head="">\s*<h2 style=\{\{ margin: 0, padding: '6px 0 8px', borderBottom: `3px solid \$\{t\.INK\}`, fontFamily: bsWsHead\(t\)/);
  assert.match(ch, /fontFamily: bsWsHead\(t\), fontWeight: 500, fontSize: 20[^}]*\}\}>#\{ch\.name\}/);
  assert.doesNotMatch(ch, /bsSdPrBreath|background: TEAL|linear-gradient\(90deg, \$\{t\.INK\}, \$\{tealSig\}/, 'no breathing dot, teal button or gradient rule');
  assert.match(CLIENT, /<div style=\{\{ padding: '16px 12px 90px', display: 'flex', flexDirection: 'column', gap: 12 \}\}>/, 'on the Wall\'s 12px edge');
});

test('the thread screen: the teal accent, flat faces, the name in the Wall\'s face, square boxes', () => {
  const th = between(CLIENT, 'function BSChatThread({', '\n}\n');
  assert.match(th, /const teal = bsWsAccent\(t\);/);
  assert.equal((th.match(/<BSFacetAvatar flat /g) || []).length, 3, 'the header face and both message faces');
  assert.doesNotMatch(th, /<BSFacetAvatar (?!flat)/, 'a glowing gem in the thread');
  assert.match(th, /fontFamily: bsWsHead\(t\), fontSize: 26, fontWeight: 500, lineHeight: 1\.05, color: t\.INK \}\}>\{thread\.who\}/);
  assert.match(th, /borderRadius: 0,\s*fontFamily: t\.BODY, fontSize: 14\.5/);
  assert.match(th, /<BSMessageComposer value=\{text\} onChange=\{setText\} onSend=\{send\} pinned mag \/>/);
});

test('the composer is square with an ink send button on the chat page; Nora\'s keeps its own', () => {
  const comp = between(CLIENT, 'function BSMessageComposer({', '\n}\n');
  assert.match(comp, /onVoiceComplete, mag = false \}\) \{/);
  assert.match(comp, /background: canSend \? \(mag \? t\.INK : t\.ACCENT\) : t\.SURFACE_BORDER/);
  assert.match(comp, /\{mag \? null : <span aria-hidden>🔒<\/span>\}/);
  assert.equal((comp.match(/borderRadius: 17,/g) || []).length, 0, 'every rounded control asks mag');
  assert.match(CLIENT, /<BSMessageComposer mag value=\{draft\}/, 'the chat page asks for it');
  assert.match(CLIENT, /<BSMessageComposer value=\{supportDraft\}/, 'Nora\'s does not');
});
