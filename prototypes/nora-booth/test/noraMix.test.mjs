// noraMix — the mix choreography. Pins the curves at key bars, the one-beat bass swap, that
// no hand ever teleports, that every control change happens under an arrived hand, that the
// room is never silent mid-transition, and determinism.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import * as M from '../src/noraMix.mjs';

const SRC = readFileSync(new URL('../src/noraMix.mjs', import.meta.url), 'utf8');
const STEP = 1 / 512;                       // sampling step in bars (exact binary fraction)
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

// Walk bars [a, b] and hand each consecutive pair of states to `fn`.
function walk(stateAt, a, b, fn) {
  let prev = stateAt(a), prevBar = a;
  for (let i = 1, n = Math.round((b - a) / STEP); i <= n; i++) {
    const bar = a + i * STEP, cur = stateAt(bar);
    fn(prev, cur, prevBar, bar);
    prev = cur; prevBar = bar;
  }
}

// What main.mjs shows: idle of the live deck, then the plan (mixState returns idle before
// loadBar and the new deck's idle from endBar on), then the next plan.
function setTimeline(plans) {
  return (bar) => {
    for (const p of plans) if (bar < p.endBar) return M.mixState(p, bar);
    const last = plans[plans.length - 1];
    return M.mixState(last, bar);
  };
}

const CONFIGS = [
  { fromDeck: 0, toDeck: 1, startBar: 64 },
  { fromDeck: 1, toDeck: 0, startBar: 64 },
  { fromDeck: 0, toDeck: 1, startBar: 8 },
  { fromDeck: 1, toDeck: 0, startBar: 128, seed: 99 },
  { fromDeck: 0, toDeck: 1, startBar: 48, lengthBars: 8 },
  { fromDeck: 1, toDeck: 0, startBar: 40, lengthBars: 12 },
  { fromDeck: 0, toDeck: 1, startBar: 96, lengthBars: 24, seed: 7 },
  { fromDeck: 1, toDeck: 0, startBar: 64, lengthBars: 32 },
  { fromDeck: 0, toDeck: 1, startBar: 64, lengthBars: 64, seed: 3 },
];

// Which control a value of the state belongs to (the hand must be arrived on it to move it).
function controlChanges(prev, cur) {
  const out = [];
  for (const d of [0, 1]) {
    const ch = M.deckChannel(d) + 1;
    for (const k of ['fader', 'low', 'mid', 'hi', 'color']) {
      if (!near(prev.ch[d][k], cur.ch[d][k], 1e-12)) out.push(k + ch);
    }
    if (prev.cueOn[d] !== cur.cueOn[d]) out.push('cue' + ch);
    if (prev.playing[d] !== cur.playing[d]) out.push('play' + (d + 1));
    if (cur.nudge[d] !== 0) out.push('jog' + (d + 1));
  }
  if (!near(prev.xfader, cur.xfader, 1e-12)) out.push('xfader');
  return out;
}
const handOn = (st, id) => ['left', 'right'].some((s) => st.hands[s].to === id && st.hands[s].k === 1);

// ── API surface ──────────────────────────────────────────────────────────────
test('exports the contract surface and a stable, frozen list of target ids', () => {
  for (const fn of ['beatClock', 'planTransition', 'mixState', 'idleState', 'idleHands', 'phraseBoundary', 'phraseOf', 'mixStartAfter', 'parseTarget', 'planTimeline', 'deckChannel', 'handSideForDeck']) {
    assert.equal(typeof M[fn], 'function', fn);
  }
  assert.deepEqual(M.TARGET_IDS.slice(0, 12), ['rest', 'air', 'ear', 'xfader', 'jog1', 'jog2', 'play1', 'play2', 'browse1', 'browse2', 'pad1', 'pad2']);
  assert.equal(M.TARGET_IDS.length, 12 + 4 * 6);
  assert.equal(new Set(M.TARGET_IDS).size, M.TARGET_IDS.length);
  assert.ok(Object.isFrozen(M.TARGET_IDS) && Object.isFrozen(M.PHASES) && Object.isFrozen(M.CAM_HINTS));
  // The contract's hand ids all exist.
  for (const id of ['jog1', 'jog2', 'fader2', 'fader3', 'low2', 'low3', 'hi2', 'hi3', 'xfader', 'ear', 'browse1', 'browse2', 'play1', 'play2', 'rest', 'air']) {
    assert.ok(M.TARGET_IDS.includes(id), id);
  }
  // Every id parses, and parses to the right unit/deck/channel.
  for (const id of M.TARGET_IDS) assert.ok(M.parseTarget(id), id);
  assert.deepEqual(M.parseTarget('fader2'), { id: 'fader2', kind: 'fader', unit: 'mixer', deck: 0, ch: 1, anchor: 'fader' });
  assert.deepEqual(M.parseTarget('jog2'), { id: 'jog2', kind: 'jog', unit: 'deck', deck: 1, ch: 2, anchor: 'jogEdge' });
  assert.equal(M.parseTarget('pad1').pad, 0);
  assert.equal(M.parseTarget('fader1').deck, null);
  assert.equal(M.parseTarget('nope'), null);
  assert.equal(M.deckChannel(0), 1);
  assert.equal(M.deckChannel(1), 2);
});

test('the module is pure: no imports, no DOM, no Math.random / Date.now / performance', () => {
  const code = SRC.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(code, /^\s*import\b/m);
  assert.doesNotMatch(code, /\bMath\.random\b|\bDate\.now\b|\bperformance\b|\bwindow\b|\bdocument\b|\bTHREE\b/);
});

// ── Beat clock ───────────────────────────────────────────────────────────────
test('beatClock: beats, bars, phase and a kick envelope that fires on every beat', () => {
  const c = M.beatClock({ bpm: 120, t0: 10 });
  assert.equal(c.secPerBeat, 0.5);
  assert.equal(c.secPerBar, 2);
  assert.equal(c.beatAt(10), 0);
  assert.equal(c.beatAt(11), 2);
  assert.equal(c.barAt(14), 2);
  assert.equal(c.timeAtBar(3), 16);
  assert.equal(c.timeAtBeat(5), 12.5);
  assert.ok(near(c.phase(10.25), 0.5));
  // An exact-beat time computed from the grid lands ON the beat (no floating-point miss).
  const odd = M.beatClock({ bpm: 124, t0: 3.7 });
  for (let n = 0; n < 64; n++) {
    const t = odd.timeAtBeat(n);
    assert.ok(odd.kick(t) > 0.999, `kick at beat ${n}`);
    assert.equal(odd.beatInBar(t), n % 4);
    assert.ok(odd.phase(t) < 1e-6);
    assert.ok(odd.kick(odd.timeAtBeat(n + 0.5)) < 0.05, 'decays well before the next beat');
  }
  // A decaying envelope in 0..1, monotone inside a beat.
  let prev = 2;
  for (let u = 0; u < 1; u += 1 / 64) {
    const k = c.kick(c.timeAtBeat(7 + u));
    assert.ok(k >= 0 && k <= 1 && k < prev);
    prev = k;
  }
  assert.equal(c.kick(9.9), 0, 'no kick before the grid starts');
  assert.throws(() => M.beatClock({ bpm: 0 }), RangeError);
  assert.throws(() => M.beatClock({ bpm: NaN }), RangeError);
  assert.throws(() => M.beatClock({}), RangeError);
});

test('phrase helpers: boundary, phraseOf and the mix start main.mjs schedules', () => {
  assert.equal(M.phraseBoundary(0, 8), 0);
  assert.equal(M.phraseBoundary(0.01, 8), 8);
  assert.equal(M.phraseBoundary(8, 8), 8);
  assert.equal(M.phraseBoundary(15.9, 16), 16);
  assert.equal(M.phraseBoundary(-3, 8), 0);
  assert.equal(M.phraseBoundary(-9, 8), -8);
  assert.deepEqual(M.phraseOf(20, 8), { index: 2, start: 16, end: 24, progress: 0.5 });
  assert.equal(M.phraseOf(15.999999, 16).index, 0);
  for (let b = 0; b < 200; b += 0.37) {
    assert.equal(M.mixStartAfter(b), Math.ceil((b + M.PREP_BARS) / 8) * 8, `bar ${b}`);
    assert.ok(M.mixStartAfter(b) - M.PREP_BARS >= b - 1e-9, 'there is always a full prep window');
  }
  assert.throws(() => M.phraseBoundary(1, 0), RangeError);
});

// ── Plan ─────────────────────────────────────────────────────────────────────
test('planTransition: validation, anchors, and a plan callers may annotate', () => {
  assert.throws(() => M.planTransition({ fromDeck: 0, toDeck: 0, startBar: 8 }), RangeError);
  assert.throws(() => M.planTransition({ fromDeck: 2, toDeck: 1, startBar: 8 }), RangeError);
  assert.throws(() => M.planTransition({ fromDeck: 0, toDeck: 1, startBar: NaN }), RangeError);
  const p = M.planTransition({ fromDeck: 0, toDeck: 1, startBar: 64 });
  assert.equal(p.lengthBars, 16);
  assert.deepEqual(
    [p.loadBar, p.cueBar, p.playBar, p.fadeInEndBar, p.swapBar, p.outStartBar, p.outEndBar, p.stopBar, p.endBar],
    [56, 60, 64, 68, 72, 76, 80, 80.25, 81]);
  assert.equal(p.inHand, 'right');
  assert.equal(p.outHand, 'left');
  assert.equal(M.planTransition({ fromDeck: 1, toDeck: 0, startBar: 64 }).inHand, 'left');
  assert.equal(M.planTransition({ fromDeck: 0, toDeck: 1, startBar: 0, lengthBars: 2 }).lengthBars, M.MIN_LENGTH_BARS);
  assert.equal(M.planTransition({ fromDeck: 0, toDeck: 1, startBar: 0, lengthBars: 999 }).lengthBars, M.MAX_LENGTH_BARS);
  // main.mjs writes its own flags onto the plan; the timelines themselves are frozen.
  assert.ok(Object.isExtensible(p));
  p._loaded = false; p._played = false; p._stopped = false;
  assert.ok(Object.isFrozen(p.lanes) && Object.isFrozen(p.hands.left) && Object.isFrozen(p.hands.left[0]));
  assert.deepEqual(M.planTimeline(p).map((x) => x.phase), ['load', 'cue', 'blend', 'swap', 'out']);
});

test('phases and camera hints follow the craft: screen → jog → mixer → wide', () => {
  const p = M.planTransition({ fromDeck: 0, toDeck: 1, startBar: 64 });
  const at = (b) => M.mixState(p, b);
  const expect = [
    [40, 'idle', null], [55.99, 'idle', null], [56, 'load', 'screen'], [59.9, 'load', 'screen'],
    [60, 'cue', 'jog'], [63.9, 'cue', 'jog'], [64, 'blend', 'mixer'], [70, 'blend', 'mixer'],
    [71.5, 'swap', 'mixer'], [72, 'swap', 'mixer'], [72.5, 'swap', 'wide'], [75.9, 'swap', 'wide'],
    [76, 'out', 'mixer'], [79.9, 'out', 'mixer'], [80.5, 'out', null], [81, 'done', null], [120, 'done', null],
  ];
  for (const [bar, phase, hint] of expect) {
    const st = at(bar);
    assert.equal(st.phase, phase, `phase @${bar}`);
    assert.equal(st.camHint, hint, `camHint @${bar}`);
    assert.ok(M.PHASES.includes(st.phase));
    assert.ok(st.camHint === null || M.CAM_HINTS.includes(st.camHint));
  }
  // Phases are ordered and never go backwards over the plan.
  let last = 0;
  walk(at, 40, 90, (_, cur) => {
    const i = M.PHASES.indexOf(cur.phase);
    assert.ok(i >= last, `phase went back to ${cur.phase}`);
    last = i;
  });
});

test('fader and EQ curves at key bars', () => {
  for (const [from, to] of [[0, 1], [1, 0]]) {
    const p = M.planTransition({ fromDeck: from, toDeck: to, startBar: 64 });
    const ch = (b) => M.mixState(p, b).ch;
    // Before and through the load: outgoing live and flat, incoming parked (fader 0, LOW killed).
    for (const b of [50, 56, 59, 63.99]) {
      assert.equal(ch(b)[from].fader, 1); assert.equal(ch(b)[from].low, 0);
      assert.equal(ch(b)[to].fader, 0); assert.equal(ch(b)[to].low, -1);
    }
    // Incoming fader 0 → 1 over bars 0–4 (eased), LOW still killed, MID a touch cut.
    const fin = [[64, 0], [65, 0.15625], [66, 0.5], [67, 0.84375], [68, 1], [70, 1], [79, 1]];
    for (const [b, v] of fin) assert.ok(near(ch(b)[to].fader, v, 1e-12), `incoming fader @${b}: ${ch(b)[to].fader}`);
    for (const b of [60, 64, 66, 68, 71.99]) { assert.equal(ch(b)[to].low, -1); assert.ok(near(ch(b)[to].mid, -0.2)); }
    assert.equal(ch(56)[to].mid, 0, 'MID is flat before the DJ dips it');
    // After the swap: incoming LOW flat, MID restored; outgoing LOW killed.
    for (const b of [72.25, 74, 78]) { assert.equal(ch(b)[to].low, 0); assert.equal(ch(b)[from].low, -1); }
    assert.ok(near(ch(74)[to].mid, 0));
    // Outgoing fader 1 → 0 over bars 12–16.
    const fout = [[75.99, 1], [76, 1], [77, 0.84375], [78, 0.5], [79, 0.15625], [80, 0], [80.5, 0]];
    for (const [b, v] of fout) assert.ok(near(ch(b)[from].fader, v, 1e-12), `outgoing fader @${b}`);
    // HI / COLOR untouched by the transition itself.
    for (let b = 56; b < 81; b += 0.25) for (const d of [0, 1]) { assert.equal(ch(b)[d].hi, 0); assert.equal(ch(b)[d].color, 0); }
  }
});

test('the bass is swapped in exactly one beat, on the downbeat of the swap bar', () => {
  for (const cfg of CONFIGS) {
    const p = M.planTransition(cfg);
    const { fromDeck: f, toDeck: t } = p;
    const st = (b) => M.mixState(p, b);
    assert.equal(p.swapBar % 1, 0, 'the swap lands on a downbeat');
    assert.equal(st(p.swapBar).ch[t].low, -1);
    assert.equal(st(p.swapBar).ch[f].low, 0);
    assert.ok(near(st(p.swapBar + M.BEAT_BARS / 2).ch[t].low, -0.5));
    assert.ok(near(st(p.swapBar + M.BEAT_BARS / 2).ch[f].low, -0.5));
    assert.equal(st(p.swapBar + M.BEAT_BARS).ch[t].low, 0);
    assert.equal(st(p.swapBar + M.BEAT_BARS).ch[f].low, -1);
    // Measure: the window where either LOW is between its end stops is exactly one beat, and
    // at every instant the louder bass is at least half way (never two killed lows).
    let a = null, b = null;
    walk(st, p.loadBar, p.endBar, (_, cur, __, bar) => {
      const lt = cur.ch[t].low, lf = cur.ch[f].low;
      const moving = (lt > -1 && lt < 0) || (lf > -1 && lf < 0);
      if (moving) { if (a === null) a = bar; b = bar; }
      assert.ok(Math.max(lt, lf) >= -0.5 - 1e-12, `bass hole @${bar}`);
    });
    assert.equal(a, p.swapBar + STEP);
    assert.equal(b + STEP, p.swapBar + M.BEAT_BARS);
    // Both hands are on the two LOW knobs for the swap.
    const at = st(p.swapBar + 0.1);
    const lows = new Set([at.hands.left.to, at.hands.right.to]);
    assert.deepEqual(lows, new Set(['low' + (M.deckChannel(t) + 1), 'low' + (M.deckChannel(f) + 1)]));
    assert.equal(at.hands.left.k, 1); assert.equal(at.hands.right.k, 1);
    assert.equal(at.hands.left.act, 'turn');
  }
});

test('the crossfader stays centred', () => {
  for (const cfg of CONFIGS) {
    const p = M.planTransition(cfg);
    assert.equal(p.xfader, 0);
    walk((b) => M.mixState(p, b), p.loadBar - 4, p.endBar + 4, (_, cur) => assert.equal(cur.xfader, 0));
  }
});

test('CUE, PLAY and STOP happen at the right moments', () => {
  const p = M.planTransition({ fromDeck: 0, toDeck: 1, startBar: 64 });
  const st = (b) => M.mixState(p, b);
  assert.equal(st(59.99).cueOn[1], false);
  assert.equal(st(60).cueOn[1], true, 'CUE pressed at the start of the cue phase');
  assert.equal(st(68.2).cueOn[1], true);
  assert.equal(st(68.25).cueOn[1], false, 'CUE off once the fader is all the way up');
  for (let b = 40; b < 90; b += 0.5) assert.equal(st(b).cueOn[0], false);
  assert.equal(st(63.999).playing[1], false);
  assert.equal(st(64).playing[1], true, 'PLAY on the downbeat of bar 0');
  assert.equal(st(64).hands.right.to, 'play2');
  assert.equal(st(64).hands.right.act, 'press');
  assert.equal(st(80.2).playing[0], true);
  assert.equal(st(80.25).playing[0], false, 'the outgoing deck stops after its fader is down');
  assert.equal(st(80.25).hands.left.to, 'play1');
  assert.equal(st(80.25).hands.left.act, 'press');
  assert.equal(st(80.25).ch[0].fader, 0);
});

test('the choreography reads as real technique', () => {
  const p = M.planTransition({ fromDeck: 0, toDeck: 1, startBar: 64 });
  const H = (b, side) => M.mixState(p, b).hands[side];
  // load: browse knob of the incoming deck, pushed to load, then its hot cue pad, then its MID.
  assert.equal(H(56.5, 'right').to, 'browse2');
  assert.equal(H(57.25, 'right').act, 'press');
  assert.equal(p.loadPressBar, 57.25);
  assert.equal(H(57.8, 'right').to, 'pad2');
  assert.equal(H(57.76, 'right').act, 'press');
  assert.equal(H(58.8, 'right').to, 'mid3');
  // cue: one hand at the ear cup, the other nudging the incoming jog, then hovering PLAY.
  assert.equal(H(61.5, 'left').to, 'ear');
  assert.equal(H(61.5, 'left').act, 'listen');
  assert.equal(H(61.5, 'right').to, 'jog2');
  assert.equal(H(61.5, 'right').act, 'nudge');
  assert.ok(Math.abs(M.mixState(p, 61.1).nudge[1]) > 0.05, 'the incoming jog is being nudged');
  assert.equal(H(63.7, 'right').to, 'play2');
  // blend: the ear hand rides the incoming fader; the other rests on the incoming jog edge.
  assert.equal(H(64, 'left').to, 'fader3');
  assert.equal(H(66, 'left').act, 'ride');
  assert.equal(H(66, 'right').to, 'jog2');
  assert.equal(H(70, 'left').to, 'jog1', 'the outgoing hand rests on the playing jog edge');
  // after the swap a hand goes up on the drop, then rides the outgoing fader down.
  assert.equal(H(73.5, 'left').to, 'air');
  assert.equal(H(73.2, 'right').to, 'mid3');
  assert.equal(H(78, 'left').to, 'fader2');
  // mirrored for a blend into the left deck.
  const q = M.planTransition({ fromDeck: 1, toDeck: 0, startBar: 64 });
  assert.equal(M.mixState(q, 56.5).hands.left.to, 'browse1');
  assert.equal(M.mixState(q, 61.5).hands.right.to, 'ear');
  assert.equal(M.mixState(q, 66).hands.right.to, 'fader2');
  assert.equal(M.mixState(q, 78).hands.right.to, 'fader3');
  // Every emitted target is a listed id and every act a listed act.
  for (const pl of [p, q]) {
    walk((b) => M.mixState(pl, b), pl.loadBar - 8, pl.endBar + 16, (_, cur) => {
      for (const s of ['left', 'right']) {
        assert.ok(M.TARGET_IDS.includes(cur.hands[s].to), cur.hands[s].to);
        assert.ok(M.TARGET_IDS.includes(cur.hands[s].from), cur.hands[s].from);
        assert.ok(M.HAND_ACTS.includes(cur.hands[s].act), cur.hands[s].act);
        assert.ok(cur.hands[s].grip >= 0 && cur.hands[s].grip <= 1);
        assert.equal(cur.hands[s].target, cur.hands[s].to);
      }
    });
  }
});

// ── Invariants over whole sets ───────────────────────────────────────────────
function assertNoTeleport(stateAt, a, b, label) {
  walk(stateAt, a, b, (prev, cur, _, bar) => {
    for (const side of ['left', 'right']) {
      const p = prev.hands[side], c = cur.hands[side];
      if (c.to !== p.to) {
        assert.equal(p.k, 1, `${label} ${side} @${bar}: left ${p.to} before arriving`);
        assert.equal(c.from, p.to, `${label} ${side} @${bar}: travel starts from ${c.from}, hand was on ${p.to}`);
        assert.ok(c.travel >= M.MIN_TRAVEL_BARS - 1e-12, `${label} ${side} @${bar}: travel ${c.travel} < ¼ beat`);
        assert.ok(c.k < 0.2, `${label} ${side} @${bar}: jumped to k=${c.k}`);
      } else if (p.k === 1) {
        assert.equal(c.k, 1, `${label} ${side} @${bar}: restarted a travel to ${c.to}`);
      } else {
        assert.ok(c.k >= p.k, `${label} ${side} @${bar}: travel went backwards`);
      }
    }
  });
}

test('no teleport: a hand only changes target through a travel window ≥ ¼ beat', () => {
  for (const cfg of CONFIGS) {
    const p = M.planTransition(cfg);
    assertNoTeleport((b) => M.mixState(p, b), p.loadBar - 12, p.endBar + 12, JSON.stringify(cfg));
  }
  // Back to back like main.mjs: 64 bars on deck 0, blend to 1, 64 bars, blend back to 0.
  const a = M.planTransition({ fromDeck: 0, toDeck: 1, startBar: M.mixStartAfter(40) });
  const b = M.planTransition({ fromDeck: 1, toDeck: 0, startBar: M.mixStartAfter(a.endBar + 40) });
  assertNoTeleport(setTimeline([a, b]), 0, b.endBar + 20, 'set');
  // Pure idle over a long stretch, both decks, two seeds.
  for (const seed of [M.DEFAULT_SEED, 1234]) for (const d of [0, 1]) {
    assertNoTeleport((bar) => M.idleState(bar, d, { seed }), -8, 200, `idle d${d} s${seed}`);
  }
});

test('every control moves only under a hand that has arrived on it', () => {
  const check = (stateAt, a, b, label) => walk(stateAt, a, b, (prev, cur, _, bar) => {
    for (const id of controlChanges(prev, cur)) {
      assert.ok(handOn(prev, id) && handOn(cur, id), `${label} @${bar}: ${id} moved with no hand on it`);
    }
  });
  for (const cfg of CONFIGS) {
    const p = M.planTransition(cfg);
    check((b) => M.mixState(p, b), p.loadBar - 12, p.endBar + 12, JSON.stringify(cfg));
  }
  for (const d of [0, 1]) check((bar) => M.idleState(bar, d), 0, 160, `idle d${d}`);
});

test('both decks are never silent at once during a transition', () => {
  for (const cfg of CONFIGS) {
    const p = M.planTransition(cfg);
    walk((b) => M.mixState(p, b), p.loadBar, p.endBar, (_, cur, __, bar) => {
      const loud = [0, 1].filter((d) => cur.playing[d]).map((d) => cur.ch[d].fader);
      assert.ok(loud.length > 0 && Math.max(...loud) >= 0.99, `silence @${bar}`);
    });
  }
});

test('hand-overs with the idle performance are seamless at both ends', () => {
  for (const cfg of CONFIGS.slice(0, 4)) {
    const p = M.planTransition(cfg);
    const before = M.idleState(p.loadBar - 1 / 1024, p.fromDeck, { seed: p.seed });
    const first = M.mixState(p, p.loadBar);
    const lastPlan = M.mixState(p, p.endBar - 1 / 1024);
    const after = M.idleState(p.endBar, p.toDeck, { seed: p.seed });
    for (const side of ['left', 'right']) {
      assert.equal(first.hands[side].from, before.hands[side].to, `start ${side}`);
      assert.equal(lastPlan.hands[side].to, after.hands[side].to, `end ${side}`);
      assert.equal(lastPlan.hands[side].k, 1);
      assert.equal(after.hands[side].k, 1);
    }
    for (const d of [0, 1]) {
      assert.deepEqual(M.mixState(p, p.loadBar).ch[d], before.ch[d], `channel ${d} at load`);
      assert.deepEqual(lastPlan.ch[d], after.ch[d], `channel ${d} at end`);
    }
    assert.equal(M.mixState(p, p.endBar).phase, 'done');
  }
});

// ── Idle ─────────────────────────────────────────────────────────────────────
test('idle still performs: jog rest, HI/filter moves and a hand up on some drops', () => {
  for (const d of [0, 1]) {
    const nearSide = M.handSideForDeck(d), far = nearSide === 'left' ? 'right' : 'left';
    const seen = new Set();
    let airs = 0, prevAir = false;
    for (let bar = 0; bar < 256; bar += 1 / 64) {
      const st = M.idleState(bar, d);
      assert.equal(st.hands[nearSide].to, 'jog' + (d + 1), 'the near hand rests on the playing jog');
      seen.add(st.hands[far].to);
      const inAir = st.hands[far].to === 'air';
      if (inAir && !prevAir) {
        airs++;
        assert.ok(near(bar % 16, 0, 1e-9), `air raise starts on a phrase downbeat, not ${bar}`);
      }
      prevAir = inAir;
      assert.equal(st.playing[d], true); assert.equal(st.playing[1 - d], false);
      assert.deepEqual(st.ch[1 - d], { ...M.CHANNEL_REST });
      assert.equal(st.ch[d].fader, 1); assert.equal(st.ch[d].low, 0);
      assert.ok(st.ch[d].hi <= 0 && st.ch[d].hi >= -0.5);
      assert.ok(Math.abs(st.ch[d].color) <= 0.5);
      assert.equal(st.camHint, null);
    }
    const ch = M.deckChannel(d) + 1;
    assert.ok(seen.has('hi' + ch), 'a HI tweak happens');
    assert.ok(seen.has('color' + ch), 'a filter sweep happens');
    assert.ok(seen.has('rest'));
    assert.ok(airs >= 3 && airs <= 14, `hand up on some (not all) drops: ${airs}/16`);
    // Hands are home at the hand-over windows (block +0 .. +1).
    for (let blk = 0; blk < 64; blk++) for (const o of [0, 0.5, 1]) {
      const st = M.idleState(blk * 4 + o - (o === 0 ? 1e-6 : 0), d);
      const h = st.hands[far];
      if (o === 0 || o === 1) assert.ok(h.to === 'rest' && h.k === 1, `not home at ${blk * 4 + o}`);
    }
  }
  assert.deepEqual(M.idleHands(33.3, 1), M.idleState(33.3, 1).hands);
});

// ── Determinism ──────────────────────────────────────────────────────────────
test('deterministic: same inputs, same plan, same state; mixState never mutates the plan', () => {
  for (const cfg of CONFIGS) {
    const a = M.planTransition(cfg), b = M.planTransition(cfg);
    assert.ok(isDeepStrictEqual(a, b));
    const snapshot = structuredClone(a);
    for (let bar = a.loadBar - 10; bar < a.endBar + 10; bar += 0.0371) {
      assert.deepEqual(M.mixState(a, bar), M.mixState(b, bar));
    }
    assert.ok(isDeepStrictEqual(a, snapshot), 'mixState mutated the plan');
  }
  const run = (seed) => Array.from({ length: 400 }, (_, i) => M.idleState(i * 0.3, 0, { seed }));
  assert.deepEqual(run(5), run(5));
  assert.notDeepEqual(run(5), run(6), 'the seed changes the idle choreography');
  assert.throws(() => M.mixState(null, 1), TypeError);
  assert.throws(() => M.mixState(M.planTransition(CONFIGS[0]), NaN), RangeError);
  assert.throws(() => M.idleState(1, 3), RangeError);
});
