// THE RADIO PAGE AT REST IS AN INSTRUMENT, NOT A VOID — AND ITS KEY READS THE
// MEASURED STATE.
//
// WHY THIS FILE EXISTS: on 2026-09-15 the owner opened the Radio page and said
// "seeing this on shape radio page not the design". What they saw was an empty
// ~270px band between the rail and the Now block, and a key reading "❚❚ PAUSE"
// beside a rail reading "Paused". The page WAS the Signal Field — with no
// signal. Signed out, playback is licensing-gated; and in production today
// `play()` resolves false for every member (no `radio_station` row — the mock
// provider — and on the web an autoplay refusal on top), so the analyser never
// carries a frame. In that state the first build drew the field at 2.3% alpha
// (#2066's own measured void, alpha 6 of 255) and drew the spectrum's baseline
// and counter ONLY over a live frame. The one state everybody can reach was the
// one state the design was not drawn in.
//
// Two rules, each pinned here by driving the shipped code rather than reading
// it, each proven by mutation:
//   1. The grid keeps a REST that `fieldK` does not scale; the instrument's
//      fixed parts (baseline, counter) are drawn in the listening half whatever
//      the air carries; only the BARS wait for data.
//   2. The transport key reads `playingSince` (what is happening), never
//      `paused` (what was asked for) — on the deck and on Home — and a signed-out
//      deck is disabled with the sign-in line under it, never a dead tap.
//
// Spec: docs/BUILD-2026-09-14-radio-signal-field.md §4 and §7, both corrected
// at the source on 2026-09-15.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import {
  fieldAlpha, fieldRadius, fieldK, FIELD_REST_ALPHA, FIELD_REST_RADIUS,
} from '../public/newdesign/radioSignalField.mjs';

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';
const raw = readFileSync(SRC, 'utf8');
// Comments legitimately NAME the shapes this file forbids while explaining why;
// every assertion runs on a comment-stripped copy.
const code = stripComments(raw);

function slice(src, from, to, floor) {
  const i = src.indexOf(from);
  assert.ok(i > 0, `${from} is gone — this guard no longer names anything`);
  const j = src.indexOf(to, i);
  assert.ok(j > i, `could not find the end of ${from}`);
  const body = src.slice(i, j);
  assert.ok(body.length > floor, `the ${from} slice is ${body.length} chars — this guard is reading the wrong thing`);
  return body;
}

// The text from `open` (which must end in the block's own opening brace) to its
// matching close, inclusive. Asserted to exist and to close, so a rename cannot
// hand back a fragment that satisfies every assertion below vacuously.
function braceBlock(src, open) {
  const i = src.indexOf(open);
  assert.ok(i >= 0, `${open} is gone — this guard no longer names anything`);
  assert.equal(open[open.length - 1], '{', 'braceBlock needs an anchor ending in the block\'s brace');
  let depth = 0;
  let j = i + open.length - 1;
  for (; j < src.length; j += 1) {
    const ch = src[j];
    if (ch === '{') depth += 1;
    else if (ch === '}') { depth -= 1; if (depth === 0) break; }
  }
  assert.equal(depth, 0, `${open} never closes`);
  return src.slice(i, j + 1);
}

const fieldBody = () => slice(code, 'function BSRadioSignalField(', 'function BSRadioScreen(', 4000);
const screenBody = () => slice(code, 'function BSRadioScreen(', 'function DarkSection(', 8000);

// ---------------------------------------------------------------------------
// 1. The rest.
// ---------------------------------------------------------------------------

test('the field keeps a rest that no strength can scale away', () => {
  // ⚠ THE SHIPPED REST WAS 0.0227. Alpha `(0.07 + 0.6·v)·fieldK` with v = 0 and
  // fieldK at its floor (0.324) — measured on the page as the brightest pixel
  // being alpha 6 of 255. At the shipped 0.16, measured the same way (Chromium,
  // 375px at 2×, the figure's top third where only grid dots exist), a dot's
  // centre reads alpha 41 of 255 and the grid resolves as 144 distinct dots —
  // the 24 × 6 the 14px pitch predicts. The floor here is HALF that constant:
  // a retune stays free, a "tidy" halving that walks it back toward the void
  // does not.
  const rest = fieldAlpha(0, fieldK(0, 0));
  assert.equal(rest, FIELD_REST_ALPHA, 'the rest is not the named constant');
  assert.ok(FIELD_REST_ALPHA >= 0.08, `the rest is ${FIELD_REST_ALPHA} — the void was 0.0227, and this is on its way back`);
  assert.ok(FIELD_REST_ALPHA <= 0.3, `the rest is ${FIELD_REST_ALPHA} — the ground is competing with the figure`);
  // The rest is a constant: the field's strength (state, kick) lights the grid;
  // it does not dim it. Otherwise the listening state, at 0.45 of full, would
  // fade the ground the rows stand on the moment the crossfade starts.
  for (const k of [0, 0.1, fieldK(0, 0), fieldK(1, 0), 0.7, 1]) {
    assert.equal(fieldAlpha(0, k), FIELD_REST_ALPHA, `an unlit dot changes with the field's strength (k=${k})`);
    assert.equal(fieldRadius(0, k), FIELD_REST_RADIUS, `an unlit dot resizes with the field's strength (k=${k})`);
  }
  // A dot the 2× canvas can draw as a dot. At 0.8px the shipped radius was a
  // smear of antialiasing that read as nothing at all.
  assert.ok(FIELD_REST_RADIUS >= 1, `the resting dot is ${FIELD_REST_RADIUS}px — sub-pixel, it reads as nothing`);
  // The light on the grid is still the light: brighter and bigger than the
  // rest, and still breathing with the kick through `fieldK`.
  assert.ok(fieldAlpha(1, 1) > FIELD_REST_ALPHA + 0.3, 'a lit dot is barely brighter than the ground');
  assert.ok(fieldAlpha(1, 1) <= 1, 'a lit dot overshoots opaque');
  assert.ok(fieldRadius(1, 1) > FIELD_REST_RADIUS + 1, 'a lit dot is barely bigger than the ground');
  assert.ok(fieldAlpha(1, fieldK(0, 1)) > fieldAlpha(1, fieldK(0, 0)), 'the light no longer breathes on the kick');
  assert.ok(fieldAlpha(1, fieldK(1, 0)) > fieldAlpha(1, fieldK(0, 0)), 'the light is no longer fuller behind the rows');
});

test('every dot of the grid is drawn — nothing is skipped for being unlit', () => {
  const body = fieldBody();
  const loop = braceBlock(body, 'for (let y = 7; y < H; y += 14) {');
  assert.match(loop, /fieldAlpha\(/, 'the grid no longer reads its alpha from the pure module');
  assert.match(loop, /fieldRadius\(/, 'the grid no longer reads its radius from the pure module');
  assert.match(loop, /ctx\.arc\(/, 'the grid draws no dots');
  // ⚠ THE SHIPPED LOOP SKIPPED ANY DOT UNDER 0.2% ALPHA — a dead shortcut once
  // the rest is a constant, and the exact mechanism by which a scaled-away rest
  // became an empty canvas. A skip on the alpha is how the void comes back.
  assert.doesNotMatch(loop, /continue/, 'the grid skips dots again — a rest that can be skipped is a rest that can vanish');
});

test('the listening instrument is drawn at rest; only its bars wait for data', () => {
  const body = fieldBody();
  // The OUTER gate is the crossfade alone. Reading `live` here is the shipped
  // defect: the whole block — baseline and counter included — vanished with the
  // signal, and the figure was a void for everyone whose station is silent.
  const gate = body.match(/if \(([^)]*)\) \{\n\s*const maxH = fig\.h/);
  assert.ok(gate, 'the listening block is gone — this guard no longer names anything');
  assert.doesNotMatch(gate[1], /live|signal/, `the listening instrument is gated on the signal again (${gate[1]})`);
  assert.match(gate[1], /kx/, 'the listening instrument is no longer gated on the crossfade');

  const block = braceBlock(body, 'if (kx < 1) {');
  const iLive = block.indexOf('if (live) {');
  assert.ok(iLive > 0, 'the bars are no longer gated on a frame carrying data');
  const liveArm = braceBlock(block.slice(iLive), 'if (live) {');
  const after = block.slice(iLive + liveArm.length);
  assert.ok(after.trimStart().startsWith('else {'), 'a frame carrying nothing draws nothing where the bars stand');
  const elseArm = braceBlock(after, 'else {');
  const tail = after.slice(after.indexOf(elseArm) + elseArm.length);

  // The BARS, and only the bars, wait for data.
  assert.match(liveArm, /barHeight\(/, 'the bars are no longer drawn over a live frame');
  assert.match(liveArm, /bandsFromBins\(/, 'the bars no longer read the analyser');
  assert.doesNotMatch(elseArm + tail, /barHeight\(|bandsFromBins\(|fillRect\(x, baseY - h/, 'bars are drawn over a frame carrying nothing');
  // A frame carrying nothing draws the baseline DASHED — the rows' own "no
  // source" grammar — where the bars will stand.
  assert.match(elseArm, /setLineDash\(\[3, 5\]\)/, 'a silent baseline is no longer dashed — it reads as a measured flat line');
  // ⚠ ANCHORED ON THE BAND, NOT THE FIGURE. The bars span the canvas since the
  // owner reported the spectrum sitting in the page's padded column, so a silent
  // baseline drawn across `fig` would be shorter than the bars it stands in for —
  // which is a different claim about the instrument's width, not a shorter line.
  assert.match(elseArm, /moveTo\(band\.x, baseY/, 'the silent baseline is not drawn where the bars stand');
  assert.match(elseArm, /lineTo\(band\.x \+ band\.w/, 'the silent baseline stops short of where the bars end');
  assert.match(elseArm, /\.stroke\(\)/, 'the silent baseline is not drawn at all');
  // The counter is part of the instrument: drawn after BOTH arms, whatever the
  // air carries — and stepping only over data, or it would count beats nobody
  // measured over a flat line.
  assert.match(tail, /tempoBarStep\(/, 'the counter is no longer drawn at rest');
  assert.match(tail, /ctx\.arc\(band\.x \+ band\.w \/ 2 - 21/, 'the four dots are no longer drawn at rest');
  assert.doesNotMatch(liveArm, /tempoBarStep\(|band\.w \/ 2 - 21/, 'the counter moved back inside the live gate');
  const step = tail.match(/const step4 = ([^;]+);/);
  assert.ok(step, 'the counter no longer reads a step');
  assert.match(step[1], /live/, 'the counter steps over a frame carrying nothing');
});

test('a still picture is drawn at the still cadence', () => {
  const body = fieldBody();
  // With nothing on the air and the crossfade settled on listening nothing on
  // the canvas moves, and a still picture redrawn sixty times a second is a
  // battery cost on the one state a member can leave open all day.
  const still = body.match(/const still = ([^;]+);/);
  assert.ok(still, 'the rest cadence is gone');
  assert.match(still[1], /live/, 'the rest cadence does not ask whether anything is on the air');
  assert.match(still[1], /kx === 0/, 'the rest cadence does not ask whether the crossfade has settled');
  const lines = body.split('\n').filter((l) => l.includes('REDUCED_FPS) return;'));
  assert.equal(lines.length, 1, 'expected exactly one draw throttle');
  assert.match(lines[0], /reduced/, 'reduced motion no longer throttles the draw');
  assert.match(lines[0], /still/, 'a still picture is redrawn at full rate');
});

// ---------------------------------------------------------------------------
// 2. The key.
// ---------------------------------------------------------------------------

function transportKey() {
  const block = braceBlock(code, 'function bsRadioTransportKey({ signedIn, playing, paused }) {');
  // eslint-disable-next-line no-new-func
  return new Function(`return ${block.replace(/^function bsRadioTransportKey/, 'function')}`)();
}

test('the transport key reads the measured state, in the right order', () => {
  const fn = transportKey();
  // No account → the deck is off, whatever was asked for and whatever is
  // happening. Playback is licensing-gated (bsRadioSignedIn).
  for (const playing of [false, true]) {
    for (const paused of [false, true]) {
      assert.equal(fn({ signedIn: false, playing, paused }), 'signIn', `signed out read as something other than signIn (${playing}/${paused})`);
    }
  }
  // Playing outranks asked-for: the clock is stamped only once play() started,
  // so this is the one state where "Pause" is an honest offer.
  assert.equal(fn({ signedIn: true, playing: true, paused: false }), 'pause');
  assert.equal(fn({ signedIn: true, playing: true, paused: true }), 'pause', 'a running stream is not offered a pause');
  // Asked to stop, and stopped → resume.
  assert.equal(fn({ signedIn: true, playing: false, paused: true }), 'resume');
  // ⚠ THE SHIPPED DEFECT: asked for and NOT running — a refused play(). The old
  // key read `paused` alone and offered "❚❚ Pause" over silence.
  assert.equal(fn({ signedIn: true, playing: false, paused: false }), 'tune', 'a refused play is offered a pause instead of another try');
});

test('both keys read it, and neither derives a label from what was asked for', () => {
  // The CALLS, not the declaration — a lookbehind keeps the function's own
  // parameter list out of the set.
  const calls = [...code.matchAll(/(?<!function )bsRadioTransportKey\(\{([^}]*)\}\)/g)].map((m) => m[1]);
  assert.ok(calls.length >= 2, `expected the deck's key and Home's key to go through bsRadioTransportKey, found ${calls.length} call(s)`);
  for (const args of calls) {
    assert.match(args, /playing: r\.playingSince != null/, `a key derives "playing" from something other than the stamped clock (${args.trim()})`);
    assert.match(args, /paused: r\.paused/, `a key no longer passes what was asked for (${args.trim()})`);
    assert.match(args, /signedIn/, `a key no longer asks whether there is an account (${args.trim()})`);
  }
  // Nothing on the module renders a glyph or a label off `r.paused` directly —
  // that is the shape of the shipped defect, on both surfaces.
  assert.doesNotMatch(code, /r\.paused\s*\?/, 'a control reads its label from what was asked for again');
  // And a tap does what the key says: driven, not read. Each site's `act`
  // mapping is lifted and run against a recording provider.
  const acts = [...code.matchAll(/const act = (key === 'pause'[\s\S]*?: null);/g)].map((m) => m[1]);
  assert.equal(acts.length, calls.length, 'a key decides its label without deciding its action');
  for (const expr of acts) {
    // eslint-disable-next-line no-new-func
    const act = new Function('key', 'r', `return ${expr};`);
    const rec = () => { const log = []; return { log, setPaused: (v) => log.push(['setPaused', v]), retryPlay: () => log.push(['retryPlay']) }; };
    let r = rec(); assert.equal(act('signIn', r), null, 'a signed-out key still has an action — a dead tap');
    r = rec(); act('pause', r)(); assert.deepEqual(r.log, [['setPaused', true]], 'Pause does not pause');
    r = rec(); act('resume', r)(); assert.deepEqual(r.log, [['setPaused', false]], 'Resume does not resume');
    r = rec(); act('tune', r)(); assert.deepEqual(r.log, [['retryPlay']], 'Tune in does not ask play() again');
  }
  // A key with no action is disabled, on both surfaces.
  const disabled = code.match(/<button disabled=\{!act\}/g) || [];
  assert.equal(disabled.length, calls.length, 'a key with nothing to do is still enabled somewhere');
});

test('a signed-out deck says why it is off, in the catalog\'s own words', () => {
  const screen = screenBody();
  // The nudge renders only when there is no account, and it is keyed.
  assert.match(screen, /\{!signedIn && \(\s*<div[^>]*>\s*\{tr\('radio:screen\.signInToListen'/, 'the signed-out deck has no line saying why it is off');
  const dirs = readdirSync('mobile-app/src/i18n/catalogs').filter((d) => !d.startsWith('.'));
  assert.ok(dirs.length >= 13, `expected 13 locales, found ${dirs.length}`);
  for (const loc of dirs) {
    const cat = JSON.parse(readFileSync(`mobile-app/src/i18n/catalogs/${loc}/radio.json`, 'utf8'));
    assert.ok(typeof cat['screen.signInToListen'] === 'string' && cat['screen.signInToListen'].trim(), `${loc} has no screen.signInToListen`);
  }
  const en = JSON.parse(readFileSync('mobile-app/src/i18n/catalogs/en/radio.json', 'utf8'));
  assert.equal(en['screen.signInToListen'], 'Sign in to listen');
});

test('a refused play is asked again FROM THE TAP, synchronously, and every attempt is cancellable', async () => {
  // ⚠ CODEX P1 ON #2088. A first cut bumped a nonce the playback effect ran on:
  // that asks play() a task later, outside the gesture's transient activation,
  // so a browser that binds media playback to a gesture refused the retry
  // exactly as it had refused the first attempt. The retry has to call play()
  // inside the tap's own call stack.
  assert.doesNotMatch(code, /playNonce|setPlayNonce/, 'the retry goes through a state update again');
  const m = code.match(/const retryPlay = \(\) => \{([^\n]*)\};/);
  assert.ok(m, 'retryPlay is gone — this guard no longer names anything');
  // eslint-disable-next-line no-new-func
  const retry = new Function('radioOn', 'paused', 'startPlay', m[1]);
  let asked = 0;
  retry(true, false, () => { asked += 1; });
  assert.equal(asked, 1, 'Tune in does not ask play() inside the tap');
  retry(true, true, () => { asked += 1; });
  retry(false, false, () => { asked += 1; });
  assert.equal(asked, 1, 'a paused or switched-off radio is asked to play by the retry');
  assert.match(code, /^\s*retryPlay,$/m, 'the provider no longer offers the retry');

  // startPlay: lifted from the provider and RUN. play() must be CALLED before
  // anything is awaited — that is the whole finding — and a newer attempt or a
  // cancel must leave an older resolution unable to stamp the clock.
  const i = code.indexOf('const startPlay = () => {');
  const j = code.indexOf('const cancelPlay = () => {', i);
  assert.ok(i > 0 && j > i, 'startPlay/cancelPlay are gone');
  const src = code.slice(i, code.indexOf('\n', j));
  const resolvers = [];
  const win = { ShapeRadioLive: { play: () => new Promise((r) => { resolvers.push(r); }) } };
  const stamped = [];
  const setPlayingSince = (v) => { stamped.push(typeof v === 'function' ? v(null) : v); };
  // eslint-disable-next-line no-new-func
  const { startPlay, cancelPlay } = new Function('attemptRef', 'setPlayingSince', 'window', `${src}\nreturn { startPlay, cancelPlay };`)({ current: null }, setPlayingSince, win);
  const tick = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
  startPlay();
  assert.equal(resolvers.length, 1, 'play() was not called inside startPlay\'s own call stack');
  startPlay();
  assert.equal(resolvers.length, 2);
  resolvers[0](true); await tick();
  assert.deepEqual(stamped, [], 'a superseded attempt stamped the clock');
  resolvers[1](true); await tick();
  assert.equal(stamped.length, 1, 'the live attempt did not start the clock');
  startPlay(); cancelPlay(); resolvers[2](true); await tick();
  assert.equal(stamped.length, 1, 'a cancelled attempt stamped the clock');
  startPlay(); resolvers[3](false); await tick();
  assert.equal(stamped.length, 1, 'a refused play started the clock');
});

test('a cached station read lets a retry reach audio.play() with no await in front of it', async () => {
  // shapeBackend's play(), lifted and RUN against a scripted station and a
  // recording audio element. The first play has to await the station; the
  // retry must not.
  const src = stripComments(readFileSync('mobile-app/src/services/shapeBackend.js', 'utf8'));
  const decl = 'let stationCache = null;';
  assert.ok(src.includes(decl), 'the station cache is gone — a retry awaits the station again, outside the gesture');
  const fnSrc = braceBlock(src, 'async function play() {');
  const make = (cfg) => {
    const log = [];
    const playbackGate = { begin: () => { const live = () => true; live.mustStop = () => false; return live; } };
    let reads = 0;
    const station = () => new Promise((r) => { reads += 1; setTimeout(() => r(cfg), 0); });
    const a = { src: '', play: () => { log.push('play'); return Promise.resolve(); }, pause() {} };
    // eslint-disable-next-line no-new-func
    const f = new Function('playbackGate', 'station', 'audio', `${decl}\n${fnSrc}\nreturn { play, cache: () => stationCache };`)(playbackGate, station, () => a);
    return { play: f.play, cache: f.cache, log, reads: () => reads, a };
  };
  const good = make({ configured: true, streamUrl: 'https://stream.example/live' });
  const p1 = good.play();
  assert.deepEqual(good.log, [], 'the first play reached audio.play() before the station was known');
  assert.equal(await p1, true);
  assert.deepEqual(good.log, ['play']);
  assert.ok(good.cache(), 'a good station read was not kept for the retry');
  const p2 = good.play();
  assert.deepEqual(good.log, ['play', 'play'], 'the retry awaited the station before audio.play() — outside the tap');
  assert.equal(await p2, true);
  assert.equal(good.a.src, 'https://stream.example/live');
  // An unconfigured station (production's mock provider today) is never cached.
  const mock = make({ configured: false });
  assert.equal(await mock.play(), false);
  assert.equal(mock.cache(), null, 'an unconfigured station was cached as an answer');
  assert.equal(await mock.play(), false);
  assert.equal(mock.reads(), 2, 'an unconfigured station is not re-asked');
  // A refused read (401 signed out → null) is never cached either.
  const refused = make(null);
  assert.equal(await refused.play(), false);
  assert.equal(refused.cache(), null);
});

test('the figure is re-measured on the frame cadence, and a moved box forces a draw', () => {
  // ⚠ CODEX P2 ON #2088. With the measure counted AFTER the throttle it ran
  // every 12 DRAWS — ~3 s at rest — so a reflow that moved the figure without
  // resizing either observed element left the baseline and the scrims at the
  // old coordinates for seconds.
  const body = fieldBody();
  const lines = body.split('\n').filter((l) => l.includes('REDUCED_FPS) return;'));
  assert.equal(lines.length, 1);
  const iMeasure = body.indexOf('sinceMeasure += 1;');
  assert.ok(iMeasure > 0, 'the measure cadence is gone');
  assert.ok(iMeasure < body.indexOf(lines[0]), 'the figure is measured after the draw throttle — every 12 DRAWS, ~3 s at rest');
  assert.match(lines[0], /!moved &&/, 'a measurement that moved the box no longer forces a draw through the throttle');
  assert.match(body, /moved = measureFigure\(\)/, 'the measurement\'s answer is not read');
  const mf = braceBlock(body, 'const measureFigure = () => {');
  assert.match(mf, /return !prev \|\| prev\.x !== fig\.x \|\| prev\.y !== fig\.y \|\| prev\.w !== fig\.w \|\| prev\.h !== fig\.h;/, 'measureFigure no longer reports whether the box moved');
  assert.match(mf, /fig = null; return prev != null;/, 'a figure that disappeared does not count as a move');
});
