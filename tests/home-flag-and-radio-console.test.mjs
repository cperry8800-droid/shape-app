// tests/home-flag-and-radio-console.test.mjs
//
// Member Home and coach Today, owner 2026-11-04.
//
// The masthead: "give me some new design options for this masthead. Dont change club shape font
// though. just layout or design"; of three, "i like masthead b but remove the bubble around icons",
// then "actually leave the bubble just make it more condensed, not as thick. tighter around icons".
// So: the newspaper flag (the mark and Vol·No at the left, the tools in a slim pill at the right, the
// wordmark centred between double hairlines, the dateline centred under it with the clock), the same
// wordmark SVG.
//
// Shape Radio's box: "lets make this shape radio box look way cooler and fit the home page better";
// of three, "go with b for radio box and make it go a little further across screen. almost full width
// of screen but not fully", and "we dont need the volume button since the phone will control that"
// ("the pause and play button is fine"). So: a dark console with the station's level behind the
// words, a round ▶ / ❚❚, 8px from each edge.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const read = (f) => stripComments(readFileSync(new URL(`../mobile-app/src/broadsheet/${f}`, import.meta.url), 'utf8'));
const CHROME = read('iosAppBroadsheet.jsx');
const CLIENT = read('iosAppBroadsheetClient.jsx');
const PROS = read('iosAppBroadsheetPros.jsx');
const RADIO = read('iosAppBroadsheetRadio.jsx');
const body = (src, marker) => {
  const at = src.indexOf(marker);
  assert.ok(at >= 0, `${marker} is gone`);
  const next = src.indexOf('\nfunction ', at + marker.length);
  return src.slice(at, next < 0 ? undefined : next);
};

test('the flag masthead: only member Home and coach Today ask for it, and both hand it their dateline', () => {
  // Each call runs to its own closing line (a title's <img /> closes inside it).
  const callers = (src) => [...src.matchAll(/<BSMasthead\b[\s\S]*?\n\s*\/>/g)].map((m) => m[0]);
  const flagged = [CLIENT, PROS].flatMap(callers).filter((m) => /layout="flag"/.test(m));
  assert.equal(flagged.length, 2, 'member Home and coach Today are not both on the flag');
  for (const m of flagged) {
    assert.match(m, /club-shape-wordmark\.svg/, 'the flag lost the Club Shape wordmark');
    assert.match(m, /dateline=\{\{/, 'a flag page draws its own dateline band again');
    assert.doesNotMatch(m, /\bcompact\b|thinRule|showDotTexture/, 'a flag page still passes the old masthead\'s switches');
  }
  // No other page changes: every other BSMasthead takes no layout.
  const others = [CLIENT, PROS].flatMap(callers).filter((m) => !/layout="flag"/.test(m));
  for (const m of others) assert.doesNotMatch(m, /\blayout=/);
  // The old dateline bands are gone from both pages, so the date is not drawn twice.
  assert.doesNotMatch(body(CLIENT, 'function BSClientHome('), /<span style=\{\{ color: t\.ACCENT \}\}>\{tr\('home:dateline\.edition'/);
  assert.doesNotMatch(body(PROS, 'function BSProToday('), /<span style=\{\{ color: heatText \}\}>\{isNutri \? tr\('coach:today\.editionNutri'/);
});

test('the flag keeps the wordmark\'s letters and draws its tools in the shared pill', () => {
  const flag = body(CHROME, 'function BSMastLayout(');
  // The page's own wordmark element, sized and placed, never redrawn in a font.
  assert.match(flag, /React\.cloneElement\(title, \{ style: \{ \.\.\.\(title\.props\.style \|\| \{\}\), margin: 0, width: '100%' \} \}\)/);
  assert.doesNotMatch(flag, /Club Shape|CLUB SHAPE/, 'the flag sets the name in type');
  // The tools ride in the shared slim pill.
  assert.match(flag, /const tools = trailing \? <BSMastToolPill>\{trailing\}<\/BSMastToolPill> : null;/);
  // The dateline centred, the clock folded in.
  assert.match(flag, /\{dl\.clock \? <>/);
  // BSMasthead turns to the layout only when asked, after the one hook every masthead calls.
  assert.match(body(CHROME, 'function BSMasthead('), /useBSReportBareMast\(trailing == null\);\n\s+if \(layout\) return <BSMastLayout /);
});

test('the radio box runs almost the full width: 8px from each edge, live and muted', () => {
  for (const [name, marker] of [['live', 'function BSNowPlaying({ onOpen }) {'], ['muted', 'function BSNowPlayingMuted({ onTurnOn, onOpen }) {']]) {
    const bar = body(RADIO, marker);
    assert.match(bar, /margin: '12px 8px 4px', borderRadius: 14,/, `the ${name} bar is not 8px from the edges`);
    assert.doesNotMatch(bar, /margin: `[^`]*\$\{t\.padX\}px/, `the ${name} bar sits on the page gutter again`);
  }
});

test('the radio console: no speaker, a round play control, and a level that is a reading, still under Reduce Motion', () => {
  const live = body(RADIO, 'function BSNowPlaying({ onOpen }) {');
  assert.doesNotMatch(RADIO, /BSSpeakerGlyph/, 'the volume button is back');
  assert.match(live, /<BSPlayGlyph playing=\{key === 'pause'\} size=\{16\} \/>/);
  // The ON AIR ring only while sound is actually playing.
  assert.match(live, /\{playing && <span aria-hidden data-bs-np-onair=""/);
  assert.match(live, /@media \(prefers-reduced-motion: reduce\) \{ \[data-bs-np-onair\], \[data-bs-np-lamp\] \{ animation: none; \} \}/);
  // The level reads the analyser only while playing, the labelled example on the preview, and rests
  // flat otherwise or under Reduce Motion.
  const level = body(RADIO, 'function useBSRadioLevel(');
  assert.match(level, /still = !!window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches;/);
  assert.match(level, /if \(still \|\| \(!playing && !preview\)\) \{ rest\(\); return undefined; \}/);
  // It peeks and never builds the analyser: built outside a tap, iOS can keep its context suspended and
  // the stream goes quiet (Codex P2 on #2585). The tap that starts sound builds it.
  assert.match(level, /const an = playing && window\.ShapeRadioLive\?\.peekAnalyser \? window\.ShapeRadioLive\.peekAnalyser\(\) : null;/);
  assert.doesNotMatch(level, /ShapeRadioLive\.analyser\(/, 'the meter builds the analyser from an animation frame');
  assert.match(live, /onClick=\{\(e\) => \{ e\.stopPropagation\(\); if \(!act\) return; if \(key !== 'pause'\) bsRadioWakeMeter\(\); act\(\); \}\}/, 'the play tap does not build the analyser');
  const muted = body(RADIO, 'function BSNowPlayingMuted({ onTurnOn, onOpen }) {');
  assert.equal((muted.match(/bsRadioWakeMeter\(\); onTurnOn && onTurnOn\(\);/g) || []).length, 2, 'a muted bar\'s turn-on does not build the analyser in its tap');
  const BACKEND = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
  assert.match(BACKEND, /function peekAnalyser\(\) \{\n\s+return \(_analyser && _srcWired && _ac && _ac\.state === 'running'\) \? _analyser : null;\n\s+\}/);
  assert.match(BACKEND, /stopPolling, analyser, peekAnalyser \}\);/);
  assert.match(level, /if \(document\.hidden\) return;/, 'the level draws while the app is in the background');
  // Every sized control on both bars is 44 to tap.
  for (const bar of [live, body(RADIO, 'function BSNowPlayingMuted({ onTurnOn, onOpen }) {')]) {
    for (const m of bar.matchAll(/<button[\s\S]*?style=\{\{([\s\S]*?)\}\}/g)) {
      if (/minWidth|width:/.test(m[1])) assert.match(m[1], /(?:minWidth|width): 44\b/);
      if (/minHeight|height:/.test(m[1])) assert.match(m[1], /(?:minHeight|height): 44\b/);
    }
  }
});

test('the slim tool pill is on every page\'s top row and the pinned bar, the profiles included', () => {
  // Owner, 2026-11-04: "make sure this part of the masthead stays present on every page and stays visible
  // as you scroll down page", "the club shape part of masthead should only be on home page", and "make
  // sure this new masthead applies to both coaches and members profile".
  const pill = body(CHROME, 'function BSMastToolPill(');
  assert.match(pill, /height: 30, borderRadius: 999,/);
  assert.match(pill, /<span data-bs-mast-tools="" style=\{\{ display: 'flex', alignItems: 'center', margin: '0 -6px' \}\}>\{children\}<\/span>/);
  assert.match(CHROME, /const BS_MAST_PILL_CSS = '\[data-bs-mast-tools\] button\{min-width:44px;min-height:44px;margin:0!important\}\[data-bs-mast-tools\]>\*\{gap:0!important\}';/);
  // The shared rows: BSMastRow (and so the pinned bar and BSDetailHeader), the old masthead and
  // BSPageHeader, and the pinned detail bar.
  assert.match(body(CHROME, 'function BSMastRow('), /<BSMastToolPill ink=\{ink\}>\{trailing\}<\/BSMastToolPill>/);
  assert.match(body(CHROME, 'function BSPageHeader('), /<BSMastToolPill>\{trailing\}<\/BSMastToolPill>/);
  assert.match(body(CHROME, 'function BSMasthead('), /<BSMastToolPill>\{trailing\}<\/BSMastToolPill>/);
  assert.match(CHROME, /\(MastCorner && !bareMast\) \? <BSMastToolPill><MastCorner \/><\/BSMastToolPill> : null/);
  assert.match(CHROME, /BSWordmark, BSPlate, BSMastToolPill,/, 'the pill is not on window for the feature modules');
  // The hand-built rows: the member profile on its cover (white), both coach profiles, Nora, the marketplace.
  const member = CLIENT.slice(CLIENT.indexOf('<div data-member-cover=""'), CLIENT.indexOf('{/* The avatar over the cover'));
  assert.match(member, /<BSMastToolPill ink=\{WHITE\}>/);
  assert.match(member, /aria-label=\{tr\('profile:terrain\.editProfileAria'/, 'the member profile lost its ✎');
  assert.equal((CLIENT.match(/<BSMastToolPill ink=\{INK\}><div style=\{\{ display: 'flex', alignItems: 'center', gap: BS_CORNER_GAP \}\}>/g) || []).length, 3);
  assert.match(read('BSTrainerProfile.jsx'), /const Pill = W\.BSMastToolPill;/);
  assert.match(read('BSNoraProfile.jsx'), /const Pill = window\.BSMastToolPill;/);
  assert.match(read('iosAppBroadsheetMarketplace.jsx'), /window\.BSMastToolPill \? React\.createElement\(window\.BSMastToolPill, null, tools\) : tools/);
  // The wordmark stays on Home alone: only the two flag pages hand the masthead club-shape-wordmark.svg.
  const files = ['iosAppBroadsheetClient.jsx', 'iosAppBroadsheetPros.jsx', 'BSTrainerProfile.jsx', 'BSNoraProfile.jsx', 'iosAppBroadsheetMarketplace.jsx'];
  const wordmarks = files.reduce((n, f) => n + (read(f).match(/club-shape-wordmark\.svg/g) || []).length, 0);
  assert.equal(wordmarks, 2, 'the Club Shape wordmark shows beyond member Home and coach Today');
});
