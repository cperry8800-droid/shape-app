// THE RADIO SCREEN MAY NOT RENDER A FIGURE NOBODY MEASURED.
//
// WHY THIS FILE EXISTS: `BS_LIVE_STATION` types in `bpm: 132` and
// `listeners: 3472`, and the Radio page rendered them as live readings — the
// BPM ring, the heart-rate sync card and the channel row all showed the 132; the
// on-air line and the channel meta both showed the 3,472. Nobody has counted
// anybody, and the station is not broadcasting. The page reads the analyser now,
// or it reads "—".
//
// ⚠ THE GUARD IS SCOPED TO `BSRadioScreen`, NOT TO THE FILE. The Home card and
// the muted bar still read `LIVE.listeners`, deliberately: they are PR 4's, and a
// guard that failed on them today would either block this change or have to be
// written to pass on the very thing it is about. PR 4 widens this to zero readers
// anywhere and deletes the two fields.
//
// Spec: docs/BUILD-2026-09-14-radio-signal-field.md §2 and §12 ruling 2.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const SRC = new URL('../mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', import.meta.url);
const CATALOGS = new URL('../mobile-app/src/i18n/catalogs/', import.meta.url);

const raw = readFileSync(SRC, 'utf8');
// Comments legitimately NAME the retired reads while explaining why they are
// gone, so every assertion below runs on a comment-stripped copy. A guard that
// tripped on its own explanation would push the next reader to delete the
// explanation.
const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

// The canvas component sits ABOVE BSRadioScreen, so `screenBody` does not
// contain it — two guards below were duly reading the wrong function until this
// existed. Each slice asserts it found something, because a brace-matching slip
// that returns a signature passes every assertion made against it.
function fieldBody(src) {
  const i = src.indexOf('function BSRadioSignalField(');
  assert.ok(i > 0, 'BSRadioSignalField is gone — this guard no longer names anything');
  const j = src.indexOf('function BSRadioScreen(', i);
  assert.ok(j > i, 'could not find the end of BSRadioSignalField');
  const body = src.slice(i, j);
  assert.ok(body.length > 3000, `the field slice is ${body.length} chars — this guard is reading the wrong thing`);
  return body;
}

function screenBody(src) {
  const i = src.indexOf('function BSRadioScreen(');
  assert.ok(i > 0, 'BSRadioScreen is gone — this guard no longer names anything');
  const j = src.indexOf('function BSShapeSetsScreen(', i);
  assert.ok(j > i, 'could not find the end of BSRadioScreen');
  return src.slice(i, j);
}

test('the Radio screen renders neither typed-in figure', () => {
  const body = screenBody(code);
  assert.doesNotMatch(body, /LIVE\s*\.\s*bpm/, 'the screen reads the typed-in station BPM again');
  assert.doesNotMatch(body, /LIVE\s*\.\s*listeners/, 'the screen reads the typed-in listener count again');
  // The vacuity line: the slice must actually BE the screen. A brace-matching
  // slip that returned a signature would pass both assertions above on nothing.
  assert.ok(body.length > 5000, `the screen slice is ${body.length} chars — this guard is reading the wrong thing`);
  // And the station's NAME is not a measurement, so it stays. Asserting its
  // presence stops anyone "fixing" this guard by deleting the whole read.
  assert.match(body, /LIVE\s*\.\s*show/, 'the station name went with the figures — a name is not a reading');
});

test('the scrubber is gone, and so is the ring it beat against', () => {
  const body = screenBody(code);
  // `elapsed = total * 0.46` over a length the now-playing payload does not
  // carry rendered `0:00 / -0:00` in every state — and a scrubber on a
  // non-interactive stream promises a seek the licence forbids.
  assert.doesNotMatch(body, /\*\s*0\.46/, 'the fabricated scrubber position is back');
  // ⚠ SCOPED TO THE SCREEN, FOR THE SAME REASON AS THE READS ABOVE. The
  // keyframes survive in `BSBeatRing`, which is the HOME card's ring and still
  // beats to `LIVE.bpm` — PR 4's to retire. A file-wide assertion here fails on
  // correct code today, which the first version of this guard duly did.
  assert.doesNotMatch(body, /bs-beat-ring/, 'the screen animates a ring against a tempo nobody measured');
  // And the animation the screen deleted is proven to have been the screen's:
  // the component that still owns it is named, so nobody deletes the wrong one.
  assert.match(code, /function BSBeatRing/, 'BSBeatRing went early — PR 4 owns it, and its retirement is a separate change');
});

test('the retired keys are gone from every locale, and the new one is in all of them', () => {
  const locales = readdirSync(CATALOGS).filter((d) => !d.startsWith('.'));
  assert.ok(locales.length >= 13, `only ${locales.length} locales found — the sweep lost its corpus`);
  for (const L of locales) {
    const cat = JSON.parse(readFileSync(new URL(`${L}/radio.json`, CATALOGS), 'utf8'));
    // Each of these carried a fabricated figure in its own placeholders.
    assert.ok(!('screen.stationBpm' in cat), `${L} still carries screen.stationBpm`);
    assert.ok(!('screen.onAir' in cat), `${L} still carries screen.onAir and its listener count`);
    assert.ok(!('screen.liveStationMeta' in cat), `${L} still carries screen.liveStationMeta`);
    // And the honest replacements are present everywhere, or a locale renders
    // the English fallback while twelve others read their own.
    assert.ok(cat['rail.onAir'], `${L} is missing rail.onAir`);
    assert.ok(cat['screen.noSignalData'], `${L} is missing screen.noSignalData`);
  }
});

test('an unreadable stream is a different claim from a quiet one', () => {
  const body = screenBody(code);
  // Three states, not two: null is "nobody is reading the analyser", false is
  // "we read it and it carried nothing". Only the second is a fact about the
  // channel, and only the second may draw the line.
  assert.match(body, /hasSig\s*===\s*false/, 'the no-signal line no longer distinguishes false from null');
  assert.doesNotMatch(body, /!\s*hasSig\s*&&/, 'the no-signal line fires on null — a page nobody is looking at is not a broken stream');
  // ⚠ AND IT MAY ONLY FIRE WHERE PLAYBACK IS PERMITTED. Playback is gated on a
  // signed-in account, so a signed-out visitor's analyser reads all-zero for a
  // reason that has nothing to do with the channel — the page would be blaming
  // the broadcaster for our own gate. Found by driving the page, not by reading.
  assert.match(
    body, /hasSig === false && !r\.paused && bsRadioSignedIn\(\)/,
    'the no-signal line no longer requires that playback is actually permitted',
  );
});

test('a gap with only one measured end is not drawn as a gap', () => {
  const body = screenBody(code);
  // ⚠ `signedDelta` is null until the detector settles, and the connected branch
  // multiplies it to place the marker and interpolates it into the label — so it
  // drew the marker at dead centre (null coerces to 0) under the words
  // "null BPM". A strap with no station tempo takes the awaiting branch.
  assert.match(
    body, /hrStage === 'off' \|\| signedDelta == null \? \(/,
    'the connected card renders again without a measured station tempo',
  );
  // And the two derived values stay null rather than collapsing to 0.
  assert.match(body, /const signedDelta = stationBpm == null \? null :/, 'the gap is computed against an unmeasured tempo');
  assert.match(body, /const isSynced = hrmConnected && syncDelta != null/, 'sync is claimed without a measured gap');
});

test('an unstarted player is not reported as a broken stream', () => {
  const body = fieldBody(code);
  // On entry `play()` is still awaiting the station request when this loop first
  // reads the freshly created analyser, so a zero-filled buffer would say the
  // channel sends nothing before one frame of it had been sampled.
  assert.match(
    body, /const verdict = signal \? true : \(\(startedRef\.current \|\| t >= SIGNAL_GRACE_S\) \? false : null\)/,
    'the signal verdict no longer waits for playback to have started',
  );
  // The three-state contract: `false` is only ever reached through that gate.
  assert.doesNotMatch(body, /cfg\.onSignal\(signal\)/, 'the raw per-frame signal is reported again, skipping the grace');
});

test('reduced motion throttles the DRAWING and never the reading', () => {
  const body = fieldBody(code);
  // §7: the spectrum redraws at ~4 fps and the field does not breathe.
  assert.match(body, /prefers-reduced-motion: reduce/, 'the field ignores the reduced-motion preference');
  assert.match(body, /t - lastDrawRef\.current < 1 \/ REDUCED_FPS/, 'the reduced-motion throttle is gone');
  assert.match(body, /fieldK\(0, \(reduced \|\| !read\) \? 0 : read\.kick\)/, 'the field still breathes under reduced motion');
  // ⚠ AND THE THROTTLE MUST SIT BELOW THE READING. Starving the analyser read
  // and the detector to 4fps would leave the ring with a quarter of its samples
  // and the tempo would take four times as long to settle, or refuse entirely.
  // A member asking for less motion is not asking for a worse reading.
  const iDet = body.indexOf('det.push(t, e)');
  const iRead = body.indexOf('const read = det.read(t)');
  const iThrottle = body.indexOf('lastDrawRef.current < 1 / REDUCED_FPS');
  assert.ok(iDet > 0 && iRead > iDet, 'could not locate the reading in the frame body');
  assert.ok(iThrottle > iRead, 'the reduced-motion throttle sits ABOVE the reading — it would starve the detector');
});

test('the Doto readings face is asked for its roundness axis', () => {
  // ⚠ THE AXIS DEFAULTS TO 0 — the square-dot form the Radio review measured as
  // unreadable at display size — and an unset `font-variation-settings` is not
  // an error in any browser, linter or build. PR 1 shipped the face and wrote
  // the rule at it, noting a guard over zero consumers passes vacuously. This is
  // the first consumer, so this is where the guard lands.
  const uses = code.match(/BS_DOTO/g) || [];
  // one declaration + at least one consumer
  assert.ok(uses.length >= 2, 'the Doto face has no consumer — this guard is vacuous');
  const rond = code.match(/'ROND'\s*100/g) || [];
  assert.equal(
    rond.length, uses.length - 1,
    `${uses.length - 1} Doto consumers but ${rond.length} set 'ROND' 100 — an unset axis renders the square-dot form silently`,
  );
});
