// tests/radio-ask-gate.test.mjs
//
// The Shape Radio opt-in prompt is asked ONCE PER ACCOUNT — on any device, after
// any reinstall — and Settings → Shape Radio owns every later change. This pins
// the gate that makes that true, by EVALUATING the shipped helpers rather than
// grepping for their spelling: a spelling pin survives any equivalent rewrite,
// and the whole point of these functions is what they ANSWER for a given
// (account, storage) pair.
//
// The module is a browser JSX file with React imports, so it cannot be
// imported. The house instrument for that is brace-matching the real functions
// out of the shipped source and running them against stubs — the same technique
// tests/primary-goal-token.test.mjs and the weekly-readout guard use.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = new URL('../mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', import.meta.url);
const src = readFileSync(SRC, 'utf8');

function extractFn(marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `marker not found in the shipped source: ${marker}`);
  assert.equal(src.indexOf(marker, at + 1), -1, `marker is ambiguous: ${marker}`);
  const open = src.indexOf('{', at + marker.length - 1);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) return src.slice(at, i + 1);
  }
  throw new Error(`unbalanced braces after ${marker}`);
}

// Build a live copy of the four gate helpers over an injected `window`.
function gate({ uid = null, store = null } = {}) {
  const win = {
    ShapeAuth: { getCachedState: () => ({ user: uid ? { id: uid } : null }) },
    localStorage: store,
  };
  const body = [
    "const BS_RADIO_ASKED_LS = 'shape.radio.asked';",
    extractFn('function bsRadioUid()'),
    extractFn('function bsRadioAskedKey(uid)'),
    extractFn('function bsRadioAskedMirrorRead()'),
    extractFn('function bsRadioAskedMirrorWrite()'),
    'return { bsRadioUid, bsRadioAskedKey, bsRadioAskedMirrorRead, bsRadioAskedMirrorWrite };',
  ].join('\n');
  // eslint-disable-next-line no-new-func
  return new Function('window', body)(win);
}

function memStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    _dump: () => Object.fromEntries(m),
  };
}

test('signed-out reads ALREADY-ASKED, so the prompt never fires without an account', () => {
  // Not politeness: playback is gated to a signed-in account (licensing), so a
  // preview visitor answering "yes" gets silence — and under the old
  // device-level gate that unanswerable prompt CONSUMED the ask, leaving the
  // real account they went on to create never asked at all.
  const g = gate({ uid: null, store: memStore() });
  assert.equal(g.bsRadioAskedMirrorRead(), true);
});

test('a signed-in account with no record has not been asked', () => {
  const g = gate({ uid: 'user-a', store: memStore() });
  assert.equal(g.bsRadioAskedMirrorRead(), false);
});

test('answering marks the account, and it stays marked', () => {
  const store = memStore();
  const g = gate({ uid: 'user-a', store });
  g.bsRadioAskedMirrorWrite();
  assert.equal(g.bsRadioAskedMirrorRead(), true);
  assert.equal(Object.keys(store._dump()).length, 1, 'exactly one per-account record');
});

test('the record is PER ACCOUNT — B does not inherit A\'s answer on a shared device', () => {
  const store = memStore();
  gate({ uid: 'user-a', store }).bsRadioAskedMirrorWrite();
  assert.equal(gate({ uid: 'user-a', store }).bsRadioAskedMirrorRead(), true, 'A stays asked');
  assert.equal(gate({ uid: 'user-b', store }).bsRadioAskedMirrorRead(), false, 'B is still owed the ask');
});

test('a record carrying a different uid is not trusted', () => {
  // Defense in depth against a copied/edited value: the key is uid-scoped AND
  // the record restates its uid, so a value moved between keys reads as absent.
  const store = memStore({ 'shape.radio.asked.user-b': JSON.stringify({ uid: 'user-a', asked: true }) });
  assert.equal(gate({ uid: 'user-b', store }).bsRadioAskedMirrorRead(), false);
});

test('unreadable or malformed storage fails CLOSED — never nag on a guess', () => {
  const throwing = { getItem() { throw new Error('blocked'); }, setItem() {}, removeItem() {} };
  assert.equal(gate({ uid: 'user-a', store: throwing }).bsRadioAskedMirrorRead(), true);
  const junk = memStore({ 'shape.radio.asked.user-a': 'not json' });
  assert.equal(gate({ uid: 'user-a', store: junk }).bsRadioAskedMirrorRead(), true);
  // A write with no account is a no-op rather than a stray unattributable key.
  const store = memStore();
  gate({ uid: null, store }).bsRadioAskedMirrorWrite();
  assert.deepEqual(store._dump(), {});
});

test('the gate is STICKY-TRUE — nothing in the module ever writes it false', () => {
  // A flag that could go back to false would re-open a prompt the member has
  // already answered. The mirror writer takes no argument for exactly that
  // reason, and the cloud write only ever sets true.
  const body = stripComments(src);
  assert.match(body, /function bsRadioAskedMirrorWrite\(\) \{/, 'the mirror writer takes no value to write');
  assert.doesNotMatch(body, /asked:\s*false/, 'no writer records "not asked"');
  assert.doesNotMatch(body, /radioAsked:\s*false/, 'no cloud write records "not asked"');
  assert.match(body, /radioAsked: true/, 'the cloud record is set true');
});

test('the auto-prompt requires a resolved account and re-runs when identity lands', () => {
  const body = stripComments(src);
  const effect = body.slice(body.indexOf('if (askedPrompt) return undefined;'));
  assert.ok(effect.length > 0, 'the auto-prompt effect is in the source');
  assert.match(
    effect.slice(0, 400),
    /if \(!bsRadioUid\(\)\) return undefined;/,
    'no resolved account ⇒ no prompt',
  );
  // This provider mounts ABOVE the async auth gate, so the first evaluation on a
  // cold launch has no uid and must fail closed. Without authTick in the deps it
  // would never re-run, and a signed-in member would never be asked at all.
  assert.match(effect.slice(0, 700), /\}, \[askedPrompt, authTick\]\);/, 'the effect re-runs on identity change');
});

test('both answer paths mark the account, not just the device', () => {
  const body = stripComments(src);
  for (const fn of ['function answerPrompt(yes) {', 'function setRadioPreference(enabled) {']) {
    const at = body.indexOf(fn);
    assert.notEqual(at, -1, `${fn} is in the source`);
    const open = body.indexOf('{', at + fn.length - 1);
    let depth = 0, end = -1;
    for (let i = open; i < body.length; i++) {
      if (body[i] === '{') depth++;
      else if (body[i] === '}' && --depth === 0) { end = i; break; }
    }
    const b = body.slice(at, end + 1);
    assert.match(b, /markRadioAsked\(\);/, `${fn} records the answer against the account`);
    assert.match(b, /persistRadioPref\(true, /, `${fn} still records the device-level on/off`);
  }
});
