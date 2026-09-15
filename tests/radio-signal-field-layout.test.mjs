// THE RADIO PAGE IS THE SIGNAL FIELD, AND ITS GEOMETRY IS MEASURED.
//
// WHY THIS FILE EXISTS: the owner picked D · The Signal Field on 2026-09-14 and
// the first build shipped the page's CLAIMS (the typed-in 132 and the invented
// 3,472 gone, the detector wired) while deferring its LAYOUT — so what landed was
// the old page with its BPM ring, its CSS-sine EQ and its scrubber removed and an
// invisible canvas behind it. Measured on the shipped page at 390px: the field's
// brightest pixel was alpha 6 of 255 over 480,888 fully transparent ones. The
// page was emptier than before, not newer.
//
// The brief's §8 names the layout and says, in as many words, to use the app's
// own metrics rather than the board's 375px literals. So the drawing reads the
// figure block's real box and every position below is a fraction of it — and this
// file DRIVES those fractions over a range of boxes rather than reading them.
//
// Spec: docs/BUILD-2026-09-14-radio-signal-field.md §0, §4, §7, §8.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import { penSpeed, ROW_WINDOW_S, GAP_PX, BANDS, bandsFromBins } from '../mobile-app/src/services/radioSignalField.mjs';

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';
const raw = readFileSync(SRC, 'utf8');
// Comments legitimately NAME what the layout replaced while explaining why, so
// every assertion runs on a comment-stripped copy. A guard that tripped on its
// own explanation would push the next reader to delete the explanation.
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

const fieldBody = () => slice(code, 'function BSRadioSignalField(', 'function BSRadioScreen(', 4000);
const screenBody = () => slice(code, 'function BSRadioScreen(', 'function DarkSection(', 8000);

// One declaration line, asserted unique — a rename cannot make an assertion below
// vacuous by matching nothing.
function lineOf(body, needle) {
  const hits = body.split('\n').filter((l) => l.includes(needle));
  assert.equal(hits.length, 1, `expected exactly one line containing ${needle}, got ${hits.length}`);
  return hits[0].trim();
}

// ---------------------------------------------------------------------------
// The geometry, DRIVEN.
// ---------------------------------------------------------------------------

// Every figure box a phone can plausibly hand the drawing: narrow to wide, short
// to tall, and offset down the page by the masthead and whatever is above it.
const BOXES = [];
for (const w of [280, 320, 331, 386, 420, 560]) {
  for (const h of [180, 220, 268, 300, 360]) {
    for (const y of [0, 210, 340]) BOXES.push({ x: 22, y, w, h });
  }
}

// The screen a box implies. The figure block sits inside the page's own
// `padding: … ${t.padX}px`, so a screen carrying a figure of width `w` at `x` is
// `x * 2 + w` across — derived from each box rather than typed, so a box added
// later brings its own screen.
const screenW = (fig) => fig.x * 2 + fig.w;

function geometry() {
  const body = fieldBody();
  // ⚠ VERTICAL FROM THE FIGURE, HORIZONTAL FROM THE BAND — AND CONFLATING THE
  // TWO IS WHAT DREW THE SPECTRUM IN A PADDED COLUMN. The figure is measured
  // because the drawing must follow the type; but it lives inside the page's
  // own horizontal padding, so taking its WIDTH left the bars 18px short of
  // each edge at 390px while the field's dots and both scrims ran edge to edge.
  // The owner's words: "its not filling the width of screen".
  const vertical = ['const maxH =', 'const baseY =', 'const counterY =', 'const yS =', 'const aS =', 'const yH =', 'const aH =']
    .map((n) => lineOf(body, n));
  const horizontal = ['const bw =', 'const x1 ='].map((n) => lineOf(body, n));
  // ⚠ EVERY ONE OF THESE MUST BE A FRACTION OF A MEASURED BOX. A literal here is
  // exactly the defect the brief warns against: it is right on one phone at one
  // text size and silently wrong everywhere else.
  for (const l of vertical) {
    assert.match(l, /\bfig\.[yh]\b/, `this position is not derived from the measured figure: ${l}`);
  }
  for (const l of horizontal) {
    assert.match(l, /\bband\.[xw]\b/, `this position is not derived from the canvas the instrument is drawn on: ${l}`);
  }
  // ⚠ AND `x0` IS THE ONE HORIZONTAL POSITION THAT STAYS THE FIGURE'S, ON
  // PURPOSE. The station and heart readings are positioned `left: 0` INSIDE the
  // figure block, so the rows' left inset is a fact about where those readings
  // are — not about how wide the instrument is.
  assert.match(lineOf(body, 'const x0 ='), /\bfig\.[xw]\b/, 'the rows no longer clear the readings they are drawn beside');
  // `BANDS` is the shipped constant the band count comes from, injected rather
  // than restated — a local copy would drift the day it changed.
  // ⚠ THE BAR'S OWN x EXPRESSION IS LIFTED TOO, NOT RESTATED. A first version of
  // the mirror guard below computed `fig.x + i * bw` in the TEST — so putting the
  // second mirror back in the page changed nothing the guard could see, and the
  // mutation survived. A guard that reimplements the code is measuring the guard.
  const decls = [lineOf(body, 'const maxH ='), lineOf(body, 'const baseY ='), lineOf(body, 'const BAR_GAP ='),
    lineOf(body, 'const bw ='), lineOf(body, 'const wBar ='), lineOf(body, 'const counterY ='),
    ...['const x0 =', 'const x1 =', 'const yS =', 'const aS =', 'const yH =', 'const aH ='].map((n) => lineOf(body, n))];
  const barX = lineOf(body, 'const x = band.x + i * bw');
  // ⚠ THE BAND IS LIFTED AND RUN, NOT PATTERN-MATCHED, because the whole finding
  // is which of `W` and `fig.w` it takes — and a regex over the declaration
  // cannot tell `{ x: 0, w: W }` from `{ x: 0, w: W - 44 }`, i.e. the padded
  // column coming back by a different door.
  const bandFn = new Function('W', 'fig', `${lineOf(body, 'const band =')}\nreturn band;`);
  const bandFor = (fig) => bandFn(screenW(fig), fig);
  const fn = new Function('fig', 'band', 'BANDS', `${decls.join('\n')}\nreturn { maxH, baseY, BAR_GAP, bw, wBar, counterY, x0, x1, yS, aS, yH, aH };`);
  const xf = new Function('fig', 'band', 'BANDS', 'i', `${lineOf(body, 'const BAR_GAP =')}\n${lineOf(body, 'const bw =')}\n${barX}\nreturn x;`);
  return Object.assign((fig) => ({ ...fn(fig, bandFor(fig), BANDS), band: bandFor(fig) }), { barX: (fig, i) => xf(fig, bandFor(fig), BANDS, i), band: bandFor });
}

test('the spectrum is drawn inside the figure the page measured', () => {
  const g = geometry();
  for (const fig of BOXES) {
    const { maxH, baseY } = g(fig);
    const top = fig.y;
    const bottom = fig.y + fig.h;
    assert.ok(maxH > 0, `the spectrum has no height at ${JSON.stringify(fig)}`);
    assert.ok(baseY - maxH >= top, `a full-height bar leaves the figure at ${JSON.stringify(fig)}`);
    assert.ok(baseY <= bottom, `the baseline is below the figure at ${JSON.stringify(fig)}`);
    // The reflection and the four-beat counter hang BELOW the baseline; they need
    // room inside the box or the counter draws over the Now block. The counter's
    // own offset is `fig.h * 0.24` and the reflection reaches `maxH * 0.42`, so
    // this checks the two against each other rather than against a constant.
    const { counterY } = g(fig);
    assert.ok(counterY + 6 <= bottom, `the beat counter falls out of the figure at ${JSON.stringify(fig)}`);
    assert.ok(counterY > baseY + maxH * 0.42, `the beat counter sits inside the reflection at ${JSON.stringify(fig)}`);
  }
});

test('the bass lands in the MIDDLE of the spectrum, not at the quarters', () => {
  const g = geometry();
  // ⚠ THE MIRROR IS IN THE BAND TABLE, AND DOING IT TWICE IS INVISIBLE TO EVERY
  // OTHER CHECK. `bandBin` reads `|i − (BANDS/2 − 0.5)|`, so `bandsFromBins`
  // already returns an array with bin 0 at its CENTRE indices — the mirror, built
  // in. The first build then drew that array outwards from the centre, mirroring
  // it again: a kick showed up as two humps a quarter of the way in from each
  // edge, with a trough where the bass belongs. It rendered, it animated, it
  // passed every assertion in this file, and it was wrong. Only the render said
  // so, so this drives the real band table through the real x mapping.
  const kick = new Uint8Array(64);
  for (let i = 0; i < 6; i += 1) kick[i] = 255 - i * 20;   // energy in the lowest bins only
  const raw = bandsFromBins(kick, BANDS);
  let top = 0;
  for (let i = 1; i < BANDS; i += 1) if (raw[i] > raw[top]) top = i;
  for (const fig of BOXES) {
    const { bw } = g(fig);
    const x = g.barX(fig, top) + bw / 2;
    const { band } = g(fig);
    const centre = band.x + band.w / 2;
    assert.ok(
      Math.abs(x - centre) <= bw,
      `a pure kick draws its tallest bar ${Math.round(x - centre)}px from the centre at ${JSON.stringify(fig)} — the spectrum is mirrored twice`,
    );
  }
  // The control: the array really is mirrored, or the assertion above would hold
  // for a flat table that puts everything everywhere.
  assert.ok(raw[0] < raw[BANDS / 2] * 0.5, 'bandsFromBins no longer puts the bass at its centre — this guard is measuring nothing');
});

test('the instrument fills the screen, not the page\'s padded column', () => {
  // ⚠ THE OWNER REPORTED THIS ON THE SHIPPED BUILD: "its not filling the width of
  // screen". Measured in Chromium at 390px before the fix — the teal spectrum ran
  // 18 → 371.5, i.e. 354 of 390 with 18px of dead paper each side, against a
  // field of dots and two scrims that both reached the edges. The bars took their
  // width from the FIGURE block, which sits inside the page's own
  // `padding: 12px ${t.padX}px 16px`; the fix takes it from the canvas.
  const g = geometry();
  for (const fig of BOXES) {
    const { bw, wBar, BAR_GAP, band } = g(fig);
    // The cells tile the band exactly — no cell is spare and none overruns.
    assert.ok(Math.abs(bw * BANDS - band.w) < 1e-9, `the ${BANDS} cells span ${(bw * BANDS).toFixed(1)}px of a ${band.w}px band at ${JSON.stringify(fig)}`);
    const left = g.barX(fig, 0);
    const right = g.barX(fig, BANDS - 1) + wBar;
    assert.ok(left >= band.x - 1e-9, `the first bar starts off the canvas at ${JSON.stringify(fig)}`);
    assert.ok(right <= band.x + band.w + 1e-9, `the last bar runs off the canvas at ${JSON.stringify(fig)}`);
    assert.ok(left - band.x <= BAR_GAP, `the spectrum leaves ${(left - band.x).toFixed(1)}px of dead paper on the left at ${JSON.stringify(fig)}`);
    assert.ok((band.x + band.w) - right <= BAR_GAP, `the spectrum leaves ${((band.x + band.w) - right).toFixed(1)}px of dead paper on the right at ${JSON.stringify(fig)}`);
    // ⚠ THE CONTROL, WITHOUT WHICH EVERY ASSERTION ABOVE PASSES ON THE DEFECT.
    // A band that equalled the figure would satisfy all four while the bars sat
    // in exactly the padded column the owner reported. These boxes are inset, so
    // the band is genuinely wider — and the spectrum genuinely starts left of it.
    assert.ok(band.w > fig.w, `this box has no padding to be wrong about at ${JSON.stringify(fig)}`);
    assert.ok(left < fig.x, `the spectrum still starts inside the padded column at ${JSON.stringify(fig)}`);
    assert.ok(right > fig.x + fig.w, `the spectrum still ends inside the padded column at ${JSON.stringify(fig)}`);
    // ⚠ AND THE GAP IS SPLIT, NOT TAKEN OFF THE RIGHT. At full bleed a
    // right-only gap leaves the first bar flush against the screen and the last
    // 1.6px short of it — an asymmetry a MIRRORED spectrum is the wrong drawing
    // to carry.
    assert.ok(Math.abs((left - band.x) - ((band.x + band.w) - right)) < 1e-9,
      `the spectrum's two edges are not symmetric at ${JSON.stringify(fig)}`);
  }
  // ⚠ AND THE STATION'S BASELINE RUNS THE WHOLE BAND, or the bars stand on a
  // line shorter than they are. It is the instrument's own axis — the thing
  // that is there before a trace is — so it cannot be the padded column's
  // width while the bars are the screen's. (Its DASHED twin, drawn when the
  // frame carries nothing, is pinned by radio-rest-state.test.mjs.)
  const body = fieldBody();
  assert.match(body, /ctx\.fillRect\(band\.x, baseY, band\.w, 1\)/, 'the station baseline no longer spans the band the bars stand in');
});

test('the two rows cannot collide, and the station is always the upper one', () => {
  const g = geometry();
  for (const fig of BOXES) {
    const { yS, aS, yH, aH } = g(fig);
    // ⚠ IDENTITY IS POSITION AS WELL AS COLOUR. The whole matching state rests on
    // telling the two sources apart at a glance: the station is teal and ABOVE,
    // the heart is rust and BELOW. A layout that let them swap — or overlap —
    // would make one drawing out of two readings.
    assert.ok(yS < yH, `the station row is not above the heart row at ${JSON.stringify(fig)}`);
    assert.ok(yS + 2 < yH - aH, `a full-height heart glyph reaches the station's baseline at ${JSON.stringify(fig)}`);
    assert.ok(yS - aS >= fig.y, `a full-height station beat leaves the figure at ${JSON.stringify(fig)}`);
    assert.ok(yH <= fig.y + fig.h, `the heart row's baseline is below the figure at ${JSON.stringify(fig)}`);
  }
});

test("the rows leave room for their own readings, and the pen can actually sweep", () => {
  const g = geometry();
  for (const fig of BOXES) {
    const { x0, x1, bw, BAR_GAP, band } = g(fig);
    assert.ok(x0 > fig.x, `the rows start at the figure's left edge — nowhere for the readings at ${JSON.stringify(fig)}`);
    assert.ok(x1 <= band.x + band.w + 0.001, `the rows run off the canvas at ${JSON.stringify(fig)}`);
    // ⚠ AND THEY END WHERE THE SPECTRUM ENDS. Both halves are drawn while `kx`
    // crosses, so a right edge that disagreed with the spectrum's would make the
    // instrument visibly change width the moment a member taps Match my BPM.
    const specRight = band.x + bw * BANDS;
    assert.ok(Math.abs(x1 - specRight) <= BAR_GAP, `the rows and the spectrum end ${Math.round(x1 - specRight)}px apart at ${JSON.stringify(fig)}`);
    const RW = x1 - x0;
    // ⚠ THE ERASE GAP IS A FIXED NUMBER OF PIXELS, so a row narrower than it has
    // no visible trace at all — every column would be inside the gap. Driven
    // rather than reasoned about, because it is a property of the two together.
    assert.ok(RW > GAP_PX * 3, `the row is ${RW.toFixed(1)}px — the ${GAP_PX}px erase gap swallows it at ${JSON.stringify(fig)}`);
    assert.ok(penSpeed(RW) > 0, `the pen does not move at ${JSON.stringify(fig)}`);
    // Three seconds of history across the row, by construction.
    assert.ok(Math.abs(RW / penSpeed(RW) - ROW_WINDOW_S) < 1e-9, 'the row no longer holds ROW_WINDOW_S of history');
  }
});

test('the figure is measured from the page, never assumed', () => {
  const body = fieldBody();
  // The drawing reads the block's real box against its own, so the baselines
  // follow the layout: a longer mode label, the no-signal line appearing, a
  // larger text setting all move the figure and the drawing with it.
  assert.match(body, /getBoundingClientRect\(\)/, 'the figure block is no longer measured');
  assert.match(body, /figureRef/, 'the field is no longer handed the figure block');
  // And nothing is drawn at all until there IS a box, or the first frames would
  // paint the spectrum at wherever `undefined` lands.
  assert.match(body, /if \(!fig\) return;/, 'the drawing runs without a measured figure');
  // ⚠ AND THE BAND **IS** THE CANVAS, NEVER THE FIGURE, DRIVEN RATHER THAN READ.
  // `W` is set from the wrap's own rect and the wrap is `position:absolute;
  // inset:0`, so it IS the screen. Run against a known screen and a figure inset
  // inside it, the band must come back as the whole screen — which a `fig`-derived
  // band, or a `W` with padding subtracted back off it, both fail.
  const g = geometry();
  assert.deepEqual(g.band({ x: 22, y: 0, w: 280, h: 268 }), { x: 0, w: 324 },
    'the instrument\'s band is no longer the canvas the page draws on');
  // The board's phone literals must not come back as geometry.
  for (const lit of ['812', '375']) {
    assert.doesNotMatch(body, new RegExp(`(fig|band)\\.[xywh][^\\n]*\\b${lit}\\b`), `a ${lit}px literal is back in the geometry`);
  }
});

// ---------------------------------------------------------------------------
// Two states of one instrument.
// ---------------------------------------------------------------------------

test('the field is scrimmed back where the page has words over it', () => {
  const body = fieldBody();
  // ⚠ FOUND BY LOOKING AT THE RENDER, NOT BY READING IT. The field is full-bleed,
  // so 8px mono at 0.18em sat over a grid of dots — a legibility problem the
  // brief names in its own §8 risk note.
  assert.match(body, /const scrim = \(/, 'the field is no longer faded back behind the page\'s words');
  assert.match(body, /scrim\(0, fig\.y,/, 'nothing fades the field behind the rail');
  assert.match(body, /scrim\(fig\.y \+ fig\.h, H,/, 'nothing fades the field behind the Now block and the deck');
  // ⚠ AND THE ALPHA COMES FROM `globalAlpha`, NEVER A HEX SUFFIX ON THE COLOUR.
  // This repo has already voided two page backgrounds with `${token}33` on an
  // rgba() string; stepping the alpha keeps the scrim right whatever spelling a
  // paper's colour takes.
  const fn = slice(body, 'const scrim = (', 'scrim(0, fig.y,', 200);
  assert.match(fn, /ctx\.globalAlpha = aA \+ \(aB - aA\)/, 'the scrim no longer steps its own alpha');
  assert.doesNotMatch(fn, /cfg\.paper\s*\+|\$\{cfg\.paper\}/, 'the scrim concatenates an alpha onto the paper colour');
  // It is painted UNDER the readings: the figure keeps its ground.
  const iScrim = body.indexOf('scrim(0, fig.y,');
  const iSpec = body.indexOf('if (kx < 1) {');
  const iRows = body.indexOf('if (kx > 0) {');
  assert.ok(iScrim > 0 && iSpec > iScrim, 'the scrim is painted over the spectrum');
  assert.ok(iRows > iScrim, 'the scrim is painted over the rows');
});

test('both states exist, and each draws only in its own half of the crossfade', () => {
  const body = fieldBody();
  // The instrument belongs to listening and its BARS are drawn only over a
  // frame that carries data (the resting shape is pinned by
  // radio-rest-state.test.mjs); the rows belong to matching. `kx` is the eased
  // crossfade, so both are visible mid-transition and neither is visible in the
  // other's state.
  assert.match(body, /if \(kx < 1\) \{/, 'the listening instrument is no longer gated on the listening half of the crossfade');
  assert.match(body, /if \(kx > 0\) \{/, 'the rows are no longer gated on the matching half of the crossfade');
  assert.match(body, /kxRef\.current/, 'the crossfade is no longer eased');
  // And the field is the ground under BOTH, which is what `fieldK`'s first
  // argument is for: quiet under the spectrum, full behind the rows.
  assert.match(body, /fieldK\(kx,/, 'the field no longer responds to which state the page is in');
});

test('the station row waits rather than ticking to a guess', () => {
  const body = fieldBody();
  // §7: with the analyser readable but no settled tempo, the station row is flat
  // and its reading is "—". A beat train drawn from an unsettled search would be
  // the typed-in 132 wearing a different coat.
  const rows = slice(body, 'if (kx > 0) {', 'raf = window.requestAnimationFrame(frame);', 1500);
  assert.match(rows, /if \(read\) \{/, 'the station row is drawn without checking that a tempo settled');
  assert.match(rows, /setLineDash/, 'there is no flat state for a row with no source');
});

test('no strap means a dashed row and a sentence, never a number', () => {
  const body = fieldBody();
  const screen = screenBody();
  // ⚠ THE SHIPPED PAGE FABRICATED 114 BPM FOR A MEMBER WITH NOTHING ON THEIR
  // CHEST and then eased that invention toward the station's tempo until it
  // "locked" — flagged in the marketing recipe on 2026-09-02 and live until now.
  assert.doesNotMatch(screen, /demoHr/, 'the fabricated demo heart rate is back');
  assert.doesNotMatch(screen, /\b114\b/, 'a seeded heart rate is back on the page');
  assert.match(body, /if \(hrBpm == null\) \{/, 'the heart row draws without a measured rate');
  assert.match(screen, /radio:hr\.noPulse/, 'the no-strap row no longer says why it is empty');
  // The rate that drives the glyph is the strap's own, and refused unless positive.
  assert.match(body, /Number\.isFinite\(cfg\.heartBpm\) && cfg\.heartBpm > 0/, 'the heart row accepts a rate it has not checked');
});

// ---------------------------------------------------------------------------
// The chrome the layout adds, and the licence it sits under.
// ---------------------------------------------------------------------------

test('the session clock is a session clock, never a track position', () => {
  const screen = screenBody();
  // ⚠ THE SCRUBBER THIS REPLACES COMPUTED `elapsed = total * 0.46` over a length
  // the now-playing payload does not carry, so it rendered `0:00 / -0:00` in
  // every state — and a scrubber on a non-interactive stream promises a seek the
  // licence forbids (prohibition 4 in the module's own header).
  assert.doesNotMatch(screen, /\*\s*0\.46/, 'the fabricated scrubber position is back');
  assert.match(screen, /r\.playingSince/, 'the clock no longer reads when playback began');
  assert.match(screen, /radio:screen\.paused/, 'a stopped clock no longer says it is stopped');
  // It counts from a fact we hold about OURSELVES; nothing about the track.
  assert.doesNotMatch(screen, /sessionClock[^\n]*duration|duration[^\n]*sessionClock/, 'the session clock reads a track length');
});

test('the strip is a channel row, not a track list', () => {
  const screen = screenBody();
  // Channels may be chosen; tracks never — prohibition 4 again. Three entries,
  // each a destination the app already has.
  for (const k of ['radio:strip.live', 'radio:strip.sets', 'radio:strip.nora']) {
    assert.match(screen, new RegExp(k.replace('.', '\\.')), `the strip lost ${k}`);
  }
  assert.doesNotMatch(screen, /r\.PLAYLISTS/, 'the page reads a playlist map the context never provides');
});

test('the rail carries a measured signal and no listener count', () => {
  const screen = screenBody();
  const body = fieldBody();
  assert.match(screen, /radio:rail\.signal/, 'the rail lost its signal reading');
  assert.match(body, /railBarsLit\(railRms\(bins\), RAIL_BARS\)/, 'the rail bars are no longer the analyser\'s own RMS');
  // ⚠ REPORTED UP ONLY WHEN THE COUNT MOVES. This loop runs at 60Hz and `onRail`
  // is a setState; the page draws a COUNT, so a count is the only granularity
  // worth a render.
  assert.match(body, /if \(litNow !== railRef\.current\)/, 'the rail reports every frame — that is 60 renders a second');
  // Nobody has counted anybody (brief §12, ruling 2).
  assert.doesNotMatch(screen, /LIVE\s*\.\s*listeners/, 'the screen reads the typed-in listener count again');
});

test('the mode label names which of the two states the page is in', () => {
  const screen = screenBody();
  assert.match(screen, /radio:screen\.listening/, 'the listening state is unnamed');
  assert.match(screen, /radio:screen\.matching/, 'the matching state is unnamed');
});

test('leaving the matching state releases the strap', () => {
  const screen = screenBody();
  // ⚠ THE CARD THIS LAYOUT REPLACES CARRIED A SEPARATE ✕ THAT DISCONNECTED THE
  // MONITOR. Collapsing the card without moving that job would have left a member
  // able to OPEN a Bluetooth connection with no way to close it — a radio holding
  // a strap awake for the rest of the session.
  const fn = slice(screen, 'const listenOnly = () => {', 'const toggleMatch', 80);
  assert.match(fn, /ShapeHRM\?\.disconnect\?\.\(\)/, 'Listen only no longer releases the strap');
  assert.match(fn, /setHrmConnected\(false\)/, 'Listen only leaves the page claiming a monitor is connected');
  assert.match(fn, /setLiveHr\(null\)/, 'Listen only leaves the last reading on screen');
  assert.match(screen, /onClick=\{listenOnly\}/, 'nothing calls listenOnly — the strap can be opened and never closed');
});

// ---------------------------------------------------------------------------
// The Codex round on b38f34f.
// ---------------------------------------------------------------------------

// The provider's playback effect, lifted and RUN rather than read. A source scan
// cannot tell `play().then(stamp)` from `play(); stamp()` in any way that
// survives a rewrite, and the whole finding is about which of the two it is.
function playbackEffect() {
  // The effect is found from the line that CLOSES it, walking back to its own
  // opener: its first statement has changed twice (a local cancel, then none),
  // and its dependency list may grow; neither is what this lift is about.
  const end = /\}, \[radioOn, paused, authTick[^\]]*\]\);/.exec(code);
  assert.ok(end, 'the playback effect is gone — this guard no longer names anything');
  const i = code.lastIndexOf('useEffectBR(() => {', end.index);
  assert.ok(i > 0, 'could not find the start of the playback effect');
  const body = code.slice(code.indexOf('{', i) + 1, code.lastIndexOf('}', end.index));
  assert.ok(body.length > 400, `the effect slice is ${body.length} chars — this guard is reading the wrong thing`);
  // eslint-disable-next-line no-new-func
  return new Function('radioOn', 'paused', 'authTick', 'window', 'setNowPlaying', 'setPlayingSince', 'startPlay', 'cancelPlay', body);
}

// The provider's own attempt — `startPlay` and `cancelPlay` — lifted and RUN.
// A cancel restated in the test would prove nothing about the shipped one.
function liftAttempt(win, setPlayingSince) {
  const i = code.indexOf('const startPlay = () => {');
  assert.ok(i > 0, 'startPlay is gone — this guard no longer names anything');
  const j = code.indexOf('const cancelPlay = () => {', i);
  assert.ok(j > i, 'cancelPlay is gone — an attempt in flight can no longer be cancelled');
  const src = code.slice(i, code.indexOf('\n', j));
  const attemptRef = { current: null };
  // eslint-disable-next-line no-new-func
  return new Function('attemptRef', 'setPlayingSince', 'window', `${src}\nreturn { startPlay, cancelPlay, attemptRef };`)(attemptRef, setPlayingSince, win);
}

async function runPlayback({ playResolves, pauseMidFlight = false }) {
  const fn = playbackEffect();
  const stamped = [];
  let resolve;
  const pending = new Promise((r) => { resolve = r; });
  const win = {
    ShapeAuth: { getCachedState: () => ({ user: { id: 'u1' } }) },
    ShapeRadioLive: {
      play: () => pending,
      pause() {},
      startPolling() {},
      stopPolling() {},
    },
  };
  const setPlayingSince = (v) => { stamped.push(typeof v === 'function' ? v(null) : v); };
  const { startPlay, cancelPlay } = liftAttempt(win, setPlayingSince);
  const cleanup = fn(true, false, 0, win, () => {}, setPlayingSince, startPlay, cancelPlay);
  if (pauseMidFlight) cleanup();
  resolve(playResolves);
  await pending;
  await Promise.resolve();
  await Promise.resolve();
  return stamped;
}

test('the session clock starts when playback starts, not when it is requested', async () => {
  // ⚠ CODEX P1 ON #2072. `ShapeRadioLive.play()` resolves FALSE for every way
  // playback can fail — no provider, an unreachable or unconfigured station, an
  // autoplay rejection, or a pause landing while it starts. Stamping beside the
  // call rendered the rail counting "On air · 0:07" upward for a member hearing
  // nothing at all, which is the exact fabrication this page exists to remove.
  assert.equal((await runPlayback({ playResolves: true })).length, 1, 'a successful play did not start the clock');
  assert.deepEqual(await runPlayback({ playResolves: false }), [], 'a failed play started the session clock anyway');
  assert.deepEqual(await runPlayback({ playResolves: undefined }), [], 'an absent provider started the session clock');
  // The stale-attempt guard: a pause or sign-out re-runs the effect, whose
  // cleanup must cancel an attempt still in flight.
  assert.deepEqual(await runPlayback({ playResolves: true, pauseMidFlight: true }),
    [], 'a play that resolved after the member paused still stamped a clock');
});

test('a paused station has no beat, and the hold does not outlive the playback', () => {
  const body = fieldBody();
  // ⚠ CODEX P2 ON #2072. The detector holds a settled reading through a dropout
  // on purpose, and a PAUSE is not a dropout — for the length of that hold the
  // station row went on pulsing a kick for audio nobody was playing.
  const read = body.match(/const read = ([^;]+);/);
  assert.ok(read, 'the station reading is gone — this guard no longer names anything');
  assert.match(read[1], /paused/, 'the station reading no longer asks whether playback is paused');
  assert.match(read[1], /\?\s*null/, 'a paused station yields something other than no reading');
  // Resetting rather than only gating also drops the ring, so a resume rebuilds
  // from frames that are actually contiguous instead of splicing across the gap.
  // ⚠ THE CONDITION, NOT THE CALL. A first cut matched `det.reset()` alone and a
  // mutation to `if (false) det.reset()` walked straight through it: the string
  // was present and unreachable, which is this repo's own recurring defect.
  const reset = body.match(/if \(([^)]*)\) det\.reset\(\);/);
  assert.ok(reset, 'the detector is no longer reset behind a condition when playback stops');
  assert.match(reset[1], /paused/, 'the detector reset no longer fires on the pause');
  assert.match(reset[1], /pausedRef/, 'the reset is no longer edge-detected — it would fire every frame while paused');
  // ⚠ AND THE HEART HALF KEEPS RUNNING, DELIBERATELY. Pausing the radio does not
  // take the strap off. Freezing this row would hold a flatline under a live
  // reading, which is the same class of lie pointed the other way.
  // ⚠ ASKED OF THE ENCLOSING CONDITION, NOT OF A LINE. A first cut matched
  // `paused` and `advanceHeart` within one line, and the mutation that adds
  // `&& !cfg.paused` to the guard puts them on ADJACENT lines — so the regression
  // it was written for was exactly the shape it could not see.
  const hrGuard = body.match(/if \(([^)]*)\) \{\s*const adv = advanceHeart/);
  assert.ok(hrGuard, 'the heart clock is no longer guarded — this guard cannot see the rule');
  assert.doesNotMatch(hrGuard[1], /paused/,
    'the heart row was frozen on pause — a beating heart drawn as a flatline');
});

test('a heart beat is recorded when it arrives and never re-derived', () => {
  const body = fieldBody();
  // ⚠ CODEX P2 ON #2072. Rebuilding the visible window from the LATEST rate
  // redrew beats that genuinely landed 500ms apart as though they had landed
  // 600ms apart the instant a 120 → 100 reading arrived. The row holds three
  // seconds and a strap re-reports inside that window constantly.
  assert.doesNotMatch(body, /heartBeatsBetween/, 'the window is being extrapolated from the current rate again');
  const hb = body.match(/const hb = ([^;]+);/);
  assert.ok(hb, 'the heart row no longer reads a beat list');
  assert.match(hb[1], /hrBeatsRef/, 'the heart row derives its beats instead of reading the recorded ones');
  assert.doesNotMatch(hb[1], /hrBpm/, 'the heart row is deriving beats from the current rate again');
  // The list is appended to as beats arrive and trimmed at the old end only.
  assert.match(body, /advanceHeart\(hrPhaseRef\.current, hrBpm, t, dt\)/, 'the heart clock no longer records its crossings');
  assert.match(body, /hrBeatsRef\.current\.push\(/, 'crossings are no longer recorded');
  assert.match(body, /trimBeats\(hrBeatsRef\.current/, 'the recorded list is never trimmed — it grows for the life of the page');
});
