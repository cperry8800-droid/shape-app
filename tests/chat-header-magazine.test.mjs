// The chat page's header above the Wall, in the Wall's magazine look (owner, 2026-10-24, on a screenshot
// of the lens, the online rail, the Feed / Team / Channels pill and the Wall / Client / Community tabs:
// "also need to design this to match the new feed wall look"). The rail keeps its faceted shape in a
// flat, magazine cut ("keep the same facet shape but … go with the new design"); the sections are a
// strip in the Wall's headline face over a hairline, ink over the magazine's red under the word; the
// tab rows under it are an index, ink against grey with no underline ("look too busy"), centred
// ("center these on page"); the strip sits on the Wall's 12px edge ("need to clean it up").
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const React = require_('react');
const STORY = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWallStory.jsx'), { registry: new Map([['react', React]]) });
const CLIENT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const WALL_STORY = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSWallStory.jsx'), 'utf8');

test('the magazine red is the Wall\'s, on both papers', () => {
  assert.equal(STORY.bsWsRed({ isLight: true }), '#b23a1f');
  assert.equal(STORY.bsWsRed({ isLight: false }), '#ff7a5c');
  assert.equal(STORY.bsWsHead({ HEADLINE: 'Oswald', DISPLAY: 'Saira' }), 'Oswald');
});

test('the rail and the Wall\'s faces keep the faceted shape in the magazine\'s flat cut', () => {
  const rail = CLIENT.slice(CLIENT.indexOf('{railPeople.map((p, i) => {'), CLIENT.indexOf('{/* The way BACK, in place'));
  assert.match(rail, /<BSFacetAvatar flat size=\{40\} c=\{t\.INK\} dotC=\{p\.activity === 'cooking' \? \(t\.AMBER \|\| '#d8a23a'\) : magRed\} initial=\{bsInitials\(p\.name\)\} photo=\{pPhoto\} showRank=\{false\} live=\{!!p\.live\} activity=\{p\.activity\} BG=\{t\.PAPER\} \/>/);
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
  assert.match(facet, /const dotColor = dotC \|\| \(activity === 'cooking' \? COOK : '#34d6c5'\);/);
  // The online line's dot is still and red.
  assert.match(CLIENT, /<span aria-hidden style=\{\{ width: 6, height: 6, borderRadius: 3, background: magRed \}\} \/>/);
});

test('the sections are a strip on the Wall\'s 12px edge, the red under the word', () => {
  // The masthead below sits 12px in; the strip's rules start and end with its rules.
  assert.match(WALL_STORY, /<header data-bs-wall-masthead="" style=\{\{ margin: '0 12px' \}\}>/);
  // Over a hairline only (owner, 2026-10-24: "look too busy"): THE WALL's rule is the one heavy rule.
  assert.match(CLIENT, /<div ref=\{bsSubAnchorRef\} style=\{\{ padding: '14px 12px 0' \}\}>\s*<div data-bs-chat-sections="" style=\{\{ display: 'grid', gridTemplateColumns: 'repeat\(3, 1fr\)', borderBottom: `1px solid \$\{t\.HAIR\}` \}\}>/);
  const sec = CLIENT.slice(CLIENT.indexOf('const SectionTab = '), CLIENT.indexOf('// Real "active now" roster'));
  // The button fills its third (the target); the word's own span carries the red, down on the hairline.
  assert.match(sec, /<button onClick=\{onClick\} aria-pressed=\{!!on\} style=\{\{ display: 'flex', alignItems: 'stretch', justifyContent: 'center', minHeight: 44, padding: 0, border: 0, background: 'transparent'/);
  assert.match(sec, /<span style=\{\{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '0 2px', boxShadow: on \? `inset 0 -2px 0 \$\{magRed\}` : 'none', color: on \? t\.INK : t\.INK50, fontFamily: bsWsHead\(t\)/);
  assert.doesNotMatch(CLIENT, /<Pill key=\{k\}/, 'the teal pill is gone');
});

test('the tab rows under the strip are an index, ink against grey, centred on the page', () => {
  const sub = CLIENT.slice(CLIENT.indexOf('const bsSubTab = '), CLIENT.indexOf('const ROLE = {'));
  assert.match(sub, /minHeight: 44, padding: 0/, 'the 44px target stays');
  // No underline of their own ("look too busy"): the strip above carries the one red underline.
  assert.match(sub, /color: on \? t\.INK : bsTHexA\(t\.INK, 0\.38\)/);
  assert.doesNotMatch(sub, /borderBottom|position: 'absolute'|magRed \}/, 'no underline');
  // The Feed's role tabs and Team's Coaches / Friends sit centred on the page ("center these on page").
  assert.match(CLIENT, /justifyContent: 'center', alignItems: 'center', gap: 22, padding: '2px 12px' \}\}>\s*\{CHIP_KEYS\.map\(k => bsSubTab\(/);
  assert.match(CLIENT, /<div style=\{\{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center', gap: 22 \}\}>\s*\{selectors\.map\(sec => bsSubTab\(/);
  assert.match(CLIENT, /onClick=\{\(\) => switchFeedMode\(k\)\} aria-pressed=\{on\}[\s\S]{0,400}color: on \? t\.INK : t\.INK50[\s\S]{0,200}background: magRed \}\} \/>\}/);
});
