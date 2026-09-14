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
import * as babelParser from '@babel/parser';
import { stripComments } from './helpers/strip-comments.mjs';
import { bpmGap, inSync } from '../mobile-app/src/services/radioSignalField.mjs';

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

// One declaration line out of a body, asserted unique so a rename cannot make an
// assertion below vacuous by matching nothing.
function lineOf(body, needle) {
  const hits = body.split('\n').filter((l) => l.includes(needle));
  assert.equal(hits.length, 1, `expected exactly one line containing ${needle}, got ${hits.length}`);
  return hits[0].trim();
}

// The identifier `fieldK` is called with as its KICK argument, plus the source of
// that identifier's own initializer. Parsed rather than matched, so any rewrite
// that keeps the rule keeps passing and only losing the rule fails.
// The expression `BSChannelMeter` uses as its bar COUNT, read off the AST.
//
// ⚠ A TEXT MATCH ON `RAIL_BARS` CANNOT SEE THIS, AND THE MUTATION ROUND PROVED
// IT: the component clamps with `Math.min(RAIL_BARS, …)` as well as rendering
// `Array.from({ length: RAIL_BARS })`, so swapping the render's length for a
// literal 7 left the identifier in the body and a `match(/RAIL_BARS/)` passed
// while the meter drew seven bars beside a five-bar rail. This asks the array
// itself what it was given.
function meterBarCount(src) {
  const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  let fn = null;
  const findFn = (n) => {
    if (!n || typeof n.type !== 'string' || fn) return;
    if (n.type === 'FunctionDeclaration' && n.id && n.id.name === 'BSChannelMeter') { fn = n; return; }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(findFn); else if (v && typeof v.type === 'string') findFn(v);
    }
  };
  findFn(ast.program);
  if (!fn) return null;
  let len = null;
  const findLen = (n) => {
    if (!n || typeof n.type !== 'string' || len) return;
    if (n.type === 'CallExpression' && n.callee.type === 'MemberExpression'
      && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Array'
      && n.callee.property.name === 'from' && n.arguments[0] && n.arguments[0].type === 'ObjectExpression') {
      const prop = n.arguments[0].properties.find((q) => q.key && (q.key.name === 'length' || q.key.value === 'length'));
      if (prop) { len = prop.value; return; }
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(findLen); else if (v && typeof v.type === 'string') findLen(v);
    }
  };
  findLen(fn.body);
  return len;
}

function fieldKKickArg(src) {
  const ast = babelParser.parse(src, { sourceType: 'module', plugins: ['jsx'] });
  let call = null;
  const walk = (n) => {
    if (!n || typeof n.type !== 'string' || call) return;
    if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && n.callee.name === 'fieldK') { call = n; return; }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => walk(c));
      else if (v && typeof v.type === 'string') walk(v);
    }
  };
  walk(ast.program);
  if (!call || call.arguments.length < 2 || call.arguments[1].type !== 'Identifier') return null;
  const name = call.arguments[1].name;
  let init = null;
  const find = (n) => {
    if (!n || typeof n.type !== 'string' || init) return;
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' && n.id.name === name && n.init) {
      init = src.slice(n.init.start, n.init.end);
      return;
    }
    for (const k of Object.keys(n)) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach((c) => find(c));
      else if (v && typeof v.type === 'string') find(v);
    }
  };
  find(ast.program);
  return init == null ? null : { name, init };
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
  // ⚠ THIS WAS SCOPED TO THE SCREEN AND IS NOW FILE-WIDE, WHICH IS THE WHOLE
  // POINT OF THE CHANGE THAT WIDENED IT. The keyframes used to survive in
  // `BSBeatRing`, the HOME card's ring, which beat to a typed-in `LIVE.bpm` —
  // so a file-wide assertion failed on correct code and this guard deliberately
  // named the component that still owned it. Home stopped claiming a tempo, the
  // ring lost its last caller, and both are gone: there is no surface left that
  // may animate against a tempo nobody measured.
  assert.doesNotMatch(code, /bs-beat-ring/, 'a ring animates against a tempo nobody measured');
  assert.doesNotMatch(code, /BSBeatRing/, 'the ring is back — its whole job is to render a tempo');
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
  // ⚠ `signedDelta` is null until BOTH ends are measured, and the slot that draws
  // it used to multiply it to place a marker and interpolate it into a label — so
  // it drew the marker at dead centre (null coerces to 0) under the words
  // "null BPM": a gap presented as measured when neither the arithmetic nor the
  // reading existed.
  //
  // ⚠ AND THIS ASSERTION USED TO PIN THE CARD'S OWN BRANCH SPELLING
  // (`hrStage === 'off' || signedDelta == null ? (`), so the D · Signal Field
  // layout — which deletes that card and moves the gap onto the rail — failed a
  // test about something else entirely. It DRIVES the two derivations now: a
  // guard that pins a spelling pins whatever that spelling is wrong about.
  const deriv = new Function(
    'liveHr', 'stationBpm', 'hrmConnected', 'bpmGap', 'inSync',
    `${lineOf(body, 'const signedDelta =')}\n${lineOf(body, 'const isSynced =')}\nreturn { signedDelta, isSynced };`,
  );
  for (const [liveHr, stationBpm] of [[null, 128], [142, null], [null, null], [0, 128], [142, 0]]) {
    const out = deriv(liveHr, stationBpm, true, bpmGap, inSync);
    assert.equal(out.signedDelta, null, `a gap was computed from ${liveHr} against ${stationBpm}`);
    assert.equal(out.isSynced, false, `sync was claimed from ${liveHr} against ${stationBpm}`);
  }
  // The control: with both ends measured it IS a number, or the assertions above
  // would pass on a page that never computes a gap at all.
  const real = deriv(142, 128, true, bpmGap, inSync);
  assert.equal(real.signedDelta, 14, 'a gap with both ends measured is no longer computed');
  assert.equal(real.isSynced, false, '14 BPM apart is not in sync');
  assert.equal(deriv(130, 128, true, bpmGap, inSync).isSynced, true, '2 BPM apart is inside the tolerance');
  // And nothing renders it while it is null.
  assert.match(body, /\{signedDelta != null && \(/, 'the gap is rendered without a null check');
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
  // ⚠ STRUCTURAL, NOT A SPELLING. This read `fieldK(0, (reduced || !read) ? 0 :
  // read.kick)` — one literal that happened to carry both the reduced-motion rule
  // AND the listening-state constant, so giving the field its crossfade argument
  // broke a test about reduced motion. What matters is that the value handed to
  // `fieldK` as the kick is one whose own derivation is gated on `reduced`; the
  // parse below asks exactly that and nothing about how either is written.
  const kickArg = fieldKKickArg(raw);
  assert.ok(kickArg, 'fieldK is no longer called with a named kick — this guard cannot see the rule');
  assert.match(kickArg.init, /reduced/, `the kick handed to the field (${kickArg.name}) is not gated on reduced motion`);
  assert.match(kickArg.init, /read/, `the kick handed to the field (${kickArg.name}) is not derived from the reading`);
  // ⚠ AND THE THROTTLE MUST SIT BELOW THE READING. Starving the analyser read
  // and the detector to 4fps would leave the ring with a quarter of its samples
  // and the tempo would take four times as long to settle, or refuse entirely.
  // A member asking for less motion is not asking for a worse reading.
  //
  // ⚠ ANCHORED ON THE BINDING, NOT ON ITS INITIALIZER — this read
  // `body.indexOf('const read = det.read(t)')` and so failed the day the reading
  // learned to answer null for a paused station (Codex P2 on #2072): a correct
  // fix broke a test about reduced motion. What this cares about is where the
  // reading HAPPENS relative to the throttle, and a rename of the right-hand
  // side does not move that. Fourth time this file has paid for a spelling pin.
  const iDet = body.indexOf('det.push(t, e)');
  const iRead = body.search(/const read = /);
  const iThrottle = body.indexOf('lastDrawRef.current < 1 / REDUCED_FPS');
  assert.ok(iDet > 0 && iRead > iDet, 'could not locate the reading in the frame body');
  assert.match(body.slice(iRead, iRead + 120), /det\.read\(t\)/, 'the reading no longer comes from the detector');
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

// ---------------------------------------------------------------------------
// The typed-in station constants, retired at their last readers.
// ---------------------------------------------------------------------------

test('the station constant carries no tempo and no listener count', () => {
  // ⚠ 132 AND 3,472 WERE BOTH PRESENTED AS READINGS. The first beat a ring on
  // Home and printed itself inside it; the second read "3,472 listening" on the
  // Home card AND on the muted bar. A station that is not broadcasting has no
  // tempo to report and nobody counting its audience.
  const i = code.indexOf('const BS_LIVE_STATION = {');
  assert.ok(i > 0, 'the station constant is gone — this guard no longer names anything');
  const decl = code.slice(i, code.indexOf('\n};', i));
  assert.ok(decl.length > 60, `the constant slice is ${decl.length} chars — this guard is reading the wrong thing`);
  assert.doesNotMatch(decl, /^\s*bpm:/m, 'the station declares a tempo again');
  assert.doesNotMatch(decl, /listeners:/, 'the station declares a listener count again');
  // A vacuity check: the constant still exists and still carries what IS true
  // about it, so the two assertions above are not passing on an empty object.
  assert.match(decl, /show:/, 'the constant lost the fields that are facts about us, not claims about a signal');
});

test('no surface reads a tempo or an audience off the constant', () => {
  // The readers, not the declaration — a field can be deleted and a reader left
  // behind, which renders `undefined` rather than failing.
  // ⚠ SWEPT OVER THE WHOLE APP SOURCE, NOT THIS MODULE. `LIVE` is the radio
  // CONTEXT, so any component under the provider can read it — and the first
  // version of this guard asked only `code`, the radio module, while two live
  // consumers in `iosAppBroadsheetClient.jsx` went on interpolating `LIVE.bpm`
  // into a light-effects island chip and a Settings preview. With the field
  // gone they rendered "· undefined BPM" over the member's screen, and the
  // suite was green. (Codex, P2 on #2076.) A guard scoped to the file that
  // DECLARES a value cannot see the files that READ it.
  // ⚠ THE SHARED STRIPPER, NOT THIS FILE'S INLINE ONE. The regex at the top of
  // this file opens a lazy block-comment span on any `/*` it meets — and the
  // client module carries `accept="image/*"`, which is the exact input this
  // repo has post-mortemed for deleting thousands of characters before the
  // assertions ever read them. A sweep cannot report on source it silently
  // removed.
  const roots = ['mobile-app/src/broadsheet', 'mobile-app/src/services'];
  const files = [];
  const walk = (dir) => {
    for (const e of readdirSync(new URL(`../${dir}/`, import.meta.url), { withFileTypes: true })) {
      if (e.name.startsWith('.')) continue;
      if (e.isDirectory()) walk(`${dir}/${e.name}`);
      else if (/\.(jsx|js|mjs)$/.test(e.name)) files.push(`${dir}/${e.name}`);
    }
  };
  roots.forEach(walk);
  assert.ok(files.length >= 8, `only ${files.length} modules swept — this guard is reading the wrong tree`);
  let sawProvider = false;
  for (const f of files) {
    const src = stripComments(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8'));
    if (/BS_LIVE_STATION/.test(src)) sawProvider = true;
    assert.doesNotMatch(src, /LIVE\.bpm/, `${f} reads the station tempo off the constant again`);
    assert.doesNotMatch(src, /LIVE\.listeners/, `${f} reads a listener count off the constant again`);
  }
  // Vacuity: the sweep really did reach the module that declares the constant.
  assert.ok(sawProvider, 'the sweep never reached the module declaring BS_LIVE_STATION');
  // And the key those two call sites rendered is retired from every catalog,
  // because a key nothing reads is thirteen values a translator must maintain.
  const locales = readdirSync(CATALOGS).filter((d) => !d.startsWith('.'));
  assert.ok(locales.length >= 13, `only ${locales.length} catalogs found — this guard is reading the wrong directory`);
  for (const L of locales) {
    const cat = JSON.parse(readFileSync(new URL(`${L}/radio.json`, CATALOGS), 'utf8'));
    assert.ok(!('nowPlaying.listening' in cat), `${L} still carries the retired listener-count key`);
  }
});

test('the channel row draws the measured signal, never a keyframe loop', () => {
  const body = screenBody(code);
  // ⚠ IT WAS `<BSEQ bars={5}>` — five bars on a CSS @keyframes loop, animating
  // whether or not a frame of audio had been sampled, three inches from a
  // spectrum drawn off the real analyser. A picture of a signal is a claim.
  const row = body.slice(body.indexOf('<DarkChannelRow'), body.indexOf('/>', body.indexOf('<DarkChannelRow')));
  assert.ok(row.length > 80, `the channel row slice is ${row.length} chars — this guard is reading the wrong thing`);
  assert.doesNotMatch(row, /BSEQ/, 'the channel row animates a sine again');
  assert.match(row, /BSChannelMeter/, 'the channel row no longer draws a meter');
  assert.match(row, /lit=\{railLit\}/, 'the meter is not fed the count the rail measured');
  // The meter must not be able to invent a bar: it clamps to the rail's own
  // width and refuses anything that is not a number.
  // ⚠ ANCHORED ON THE NEXT FUNCTION, NOT ON A COMMENT. The first version ended
  // this slice at `// Halftone aurora` — and `code` is comment-STRIPPED, so
  // indexOf returned -1, the slice ran to the end of the file, and the guard
  // failed on correct code because something else in the module animates. The
  // upper bound below is what makes a runaway slice fail loudly instead of
  // quietly asserting about the whole file.
  const mi = code.indexOf('function BSChannelMeter');
  assert.ok(mi > 0, 'the meter is gone — this guard no longer names anything');
  const mj = code.indexOf('function BSHalftoneAurora', mi);
  assert.ok(mj > mi, 'could not find the end of the meter');
  const meter = code.slice(mi, mj);
  assert.ok(meter.length > 150 && meter.length < 2000, `the meter slice is ${meter.length} chars — this guard is reading the wrong thing`);
  assert.match(meter, /Number\.isFinite/, 'an unreadable count lights bars');
  const len = meterBarCount(raw);
  assert.ok(len, 'the meter no longer builds its bars from an array — this guard cannot see its width');
  assert.equal(len.type, 'Identifier', `the meter renders a literal bar count (${raw.slice(len.start, len.end)}) instead of the rail's`);
  assert.equal(len.name, 'RAIL_BARS', `the meter renders ${len.name} bars instead of the rail's RAIL_BARS`);
  assert.doesNotMatch(meter, /animation/, 'the meter animates — it is a reading, not a picture of one');
});
