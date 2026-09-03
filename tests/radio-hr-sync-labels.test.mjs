// tests/radio-hr-sync-labels.test.mjs
//
// The HEART-RATE SYNC card has THREE surfaces, and each answers a different
// question: the status CHIP says what stage the sync is in, the DELTA SLOT says
// how far apart the two tempos are, and the PILL is a toggle that says whether
// beat-matching is on. Until 2026-09-03 all three resolved to the SAME word —
// "In sync" — at the same instant, so the card said one thing three times and
// the measurement (the actual BPM delta) was hidden exactly when a viewer would
// want to read it. The film's own v6 cut reproduced the triple, which is how it
// was found: the film was the symptom, the card was the defect.
//
// This drives the SHIPPED expressions rather than pinning their spelling: the
// three are lifted out of the module, evaluated under a translator that returns
// the key it was handed, and asserted PAIRWISE DISTINCT at every reachable
// state. An equivalent rewrite passes; a collapse back to one word fails.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const SRC = 'mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx';
const src = stripComments(readFileSync(SRC, 'utf8'));

function lineWith(needle) {
  const hits = src.split('\n').filter(l => l.includes(needle));
  assert.equal(hits.length, 1, `expected exactly one line containing ${needle}, got ${hits.length}`);
  return hits[0].trim();
}

// A JSX child expression is written `{ … }` on its own line; unwrap to the expression.
function unwrapJsx(line) {
  assert.ok(line.startsWith('{') && line.endsWith('}'), `not a lone JSX expression: ${line}`);
  return line.slice(1, -1);
}

const stageLine  = lineWith('const hrStage =');
const statusLine = lineWith('const hrStatus =');
const deltaExpr  = unwrapJsx(lineWith("radio:hr.deltaBpm"));
const pillExpr   = unwrapJsx(lineWith("radio:hr.matchMyBpm"));

// Guard the guard: an empty extraction would make every assertion below vacuous.
for (const [name, s] of [['stage', stageLine], ['status', statusLine], ['delta', deltaExpr], ['pill', pillExpr]]) {
  assert.ok(s.length > 20, `${name} expression looks truncated: ${s}`);
}

const resolve = new Function(
  'hrmConnected', 'matching', 'isSynced', 'liveHr', 'signedDelta', 'tr',
  `${stageLine}\n${statusLine}\nreturn { hrStage, chip: hrStatus, delta: (${deltaExpr}), pill: (${pillExpr}) };`
);

// The translator answers with the key it was asked for, so two surfaces reading
// one key are indistinguishable here — which is the whole point.
const trKey = (k) => k;

const STATES = [];
for (const hrmConnected of [true, false])
  for (const matching of [true, false])
    for (const isSynced of [true, false])
      for (const liveHr of [72, null])
        for (const signedDelta of [-7, 0, 3])
          STATES.push({ hrmConnected, matching, isSynced, liveHr, signedDelta });

test('the three HR sync surfaces never resolve to one word', () => {
  let checked = 0;
  for (const s of STATES) {
    const r = resolve(s.hrmConnected, s.matching, s.isSynced, s.liveHr, s.signedDelta, trKey);
    // The meter + pill only render once a monitor is connected.
    if (r.hrStage === 'off') continue;
    checked++;
    const seen = [r.chip, r.delta, r.pill];
    assert.equal(new Set(seen).size, 3,
      `two surfaces share a label at ${JSON.stringify(s)} → ${JSON.stringify(seen)}`);
  }
  assert.ok(checked >= 12, `state matrix never reached a rendered meter (checked ${checked})`);
});

test('the synced verdict is spoken exactly once, by the status chip', () => {
  const uses = src.split('radio:hr.inSync').length - 1;
  assert.equal(uses, 1, `radio:hr.inSync referenced ${uses}× — it belongs to the status chip alone`);
  assert.ok(statusLine.includes('radio:hr.inSync'), 'the one use is not on the status line');
});

test('the delta slot always states the measured delta', () => {
  // "0 BPM" in teal is a stronger reading than the word "In sync": it carries
  // the tolerance the sync test actually allows (|delta| <= 4).
  const r = resolve(true, true, true, 72, 0, trKey);
  assert.equal(r.delta, 'radio:hr.deltaBpm');
  assert.ok(!/isSynced/.test(deltaExpr), 'the delta slot must not branch its TEXT on the sync verdict');
});
