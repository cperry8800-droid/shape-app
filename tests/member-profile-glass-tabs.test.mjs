// tests/member-profile-glass-tabs.test.mjs
//
// The member profile's Signals, Climb and Music tabs as glass instruments (option B). Owner, 2026-11-04:
// "these sections need updated designs/looks", of every design "creative futuristic and unique", then of
// three built in the app "ok go with B".
//
// The same readings from the same sources, drawn as instruments: the week a dial around the streak, the
// trajectory a lit line, the disciplines a radar beside their figures, the lifts readouts, the climb over a
// floor to a horizon, an empty library a record. Motion only where the reader allows it; the coach profile
// keeps its own look.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const CLIENT = stripComments(readFileSync(SRC, 'utf8'));
const BENTO = readFileSync(new URL('../mobile-app/src/broadsheet/BSMemberBento.jsx', import.meta.url), 'utf8');
const TRAINER = readFileSync(new URL('../mobile-app/src/broadsheet/BSTrainerProfile.jsx', import.meta.url), 'utf8');
const fnBody = (src, marker) => { const at = src.indexOf(marker); assert.ok(at >= 0, `${marker} is gone`); return src.slice(at, src.indexOf('\nfunction ', at + marker.length)); };
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `${a} is gone`); const j = src.indexOf(b, i + a.length); assert.ok(j > i, `${b} is gone`); return src.slice(i, j); };

const PROFILE = fnBody(CLIENT, 'function BSTerrainProfile(');
const SIGNALS = between(PROFILE, "{tab === 'signals' && (() => {", "{tab === 'activity' && (");
const CLIMB = between(PROFILE, "{tab === 'climb' && (() => {", "{tab === 'signals' && (() => {");

test('only the member profile asks for the glass library; the coach page keeps its cards', () => {
  assert.match(PROFILE, /<BSProfilePlaylists [^>]*look="glass" \/>/);
  assert.equal((CLIENT.match(/look="glass"/g) || []).length, 1, 'another page took the glass library');
  assert.doesNotMatch(TRAINER, /look="glass"/);
  const lists = fnBody(CLIENT, 'function BSProfilePlaylists(');
  assert.match(lists, /if \(look === 'glass'\) \{/);
  // Every control in it is a real 44px target.
  const glass = between(lists, "if (look === 'glass') {", 'if (ledger) {');
  assert.match(glass, /width: 44, height: 44, flexShrink: 0, borderRadius: 99/);
  assert.match(glass, /onClick=\{\(\) => setAdding\(true\)\}[^>]*minHeight: 44/);
});

test('the empty library\'s record turns only when the reader allows motion', () => {
  const lists = fnBody(CLIENT, 'function BSProfilePlaylists(');
  assert.match(lists, /<BSMpVinyl c=\{accent\} onC=\{onC\} t=\{t\} size=\{118\} spin=\{!bsSdReduced\(\)\} \/>/);
  assert.match(BENTO, /\.\.\.\(spin \? \{ animation: 'bsspin 7s linear infinite' \} : null\)/);
});

test('Signals: the week a dial of the real minutes, today lit; the disciplines a radar to each one\'s 100', () => {
  // A wedge a day, as long as that day's minutes against the week's most; an empty week says so.
  assert.match(SIGNALS, /d=\{wedge\(i, v \/ \(maxWk \|\| 1\)\)\}/);
  assert.match(SIGNALS, /const today = i === weekEff\.length - 1;/);
  assert.match(SIGNALS, /\{hasWeek \? \(/);
  assert.match(SIGNALS, /profile:terrain\.noSessionsWeek/);
  // The radar: an axis a discipline, each point its own figure over 100, drawn only with three or more.
  assert.match(SIGNALS, /const shape = discPerf\.map\(\(p, i\) => axAt\(i, Math\.max\(0\.02, Math\.min\(1, \(Number\(p\) \|\| 0\) \/ 100\)\)\)/);
  assert.match(SIGNALS, /\{nAx >= 3 \? \(/);
  // ⚠ The radar glows by its OWN filter. The dial's is drawn only when the week has sessions, and a
  // filter reference with nothing behind it hides the shape that points at it.
  const radar = between(SIGNALS, '<linearGradient id={`${gid}-rad`}', '</svg>');
  assert.match(radar, /<filter id=\{`\$\{gid\}-rglow`\}/);
  assert.doesNotMatch(radar, /url\(#\$\{gid\}-glow\)/);
  // The readings are the page's own: no number is written into the instruments.
  assert.match(SIGNALS, /\{streakEff\}/);
  assert.match(SIGNALS, /\{trajDelta > 0 \? '\+' : '−'\}\{Math\.abs\(trajDelta\)\}/);
});

test('Climb: the route over a floor to the horizon, Now pulsing only when motion is allowed, ✎ a visible glass key', () => {
  assert.match(CLIMB, /const reduced = bsSdReduced\(\) \|\| !tabFresh;/);
  assert.match(CLIMB, /\{reduced \? null : <animate attributeName="r"/);
  assert.match(CLIMB, /\{reduced \? null : <animate attributeName="opacity"/);
  // ✎ keeps its label and state, and draws its pencil (the glass sets a clear fill under its sheen; a
  // <button> otherwise keeps the browser's white fill, and the pencil drew white on white).
  assert.match(CLIMB, /aria-label=\{tr\('profile:terrain\.customizeClimb'/);
  assert.match(CLIMB, /aria-expanded=\{climbCustomizing\}/);
  assert.match(BENTO, /borderRadius: radius, backgroundColor: 'transparent',/);
  // The three readings stay the arc's own.
  assert.match(CLIMB, /\{arc\.map\(\(a, i\) => \{ const now = a\[2\] === 'now';/);
  // Member since stays on the Climb tab: the only place most profiles show it.
  assert.match(CLIMB, /data-climb-since=""/);
});

test('every weight is one the clean type keeps, and the dial gives way at a narrow width', () => {
  // The app's "regular" weight setting keeps only the weights bsCleanType.jsx lists; any other steps
  // down to 400 there, so a 550 label would lose its weight.
  const KEPT = [300, 400, 500, 600, 650, 700, 750, 800, 900];
  const lists = fnBody(CLIENT, 'function BSProfilePlaylists(');
  const glass = between(lists, "if (look === 'glass') {", 'if (ledger) {');
  for (const [name, src] of [['Signals', SIGNALS], ['Climb', CLIMB], ['Music', glass]]) {
    const weights = [...src.matchAll(/fontWeight[:=]\s*"?([^,}\s"]+(?:\s*\?\s*\d+\s*:\s*\d+)?)/g)].flatMap((m) => (m[1].match(/\d{3}/g) || []).map(Number));
    for (const w of weights) assert.ok(KEPT.includes(w), `${name} sets font-weight ${w}, which the regular weight setting drops`);
  }
  // At 320px a fixed 168px dial left "Day streak" a sliver; it takes at most half the pane.
  assert.match(SIGNALS, /gridTemplateColumns: 'minmax\(0, 1fr\) minmax\(0, min\(168px, 50%\)\)'/);
});

test('the glass pieces live in BSMemberBento.jsx and take props only', () => {
  for (const name of ['bsMpGlass', 'bsMpGradText', 'BSMpPaneLabel', 'BSMpVinyl']) assert.match(BENTO, new RegExp(`export (function|const) ${name}\\b`));
  assert.doesNotMatch(BENTO, /from '\.\/iosAppBroadsheetClient/);
});
