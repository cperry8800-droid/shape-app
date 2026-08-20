// The shared mount harness is now infrastructure for more than one suite, so its own
// contracts get a guard. These use trivial local components rather than the broadsheet:
// the subject is the harness, and a real component would drag in reasons to fail that
// have nothing to do with it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { drive, SHIM } from './helpers/broadsheet-mount.mjs';

// A counter whose value lives entirely in hook state.
const Counter = ({ label }) => {
  const [n, setN] = SHIM.useState(0);
  return {
    props: {
      children: [
        `${label}:${n}`,
        { type: 'button', key: 'inc', props: { onClick: () => setN(n + 1), children: `bump ${label}` } },
      ],
    },
  };
};

// TWO independent cells, so the cell LAYOUT differs from Counter's single cell. That
// difference is what makes shared state observable: a click handler carries its own
// value, so two identically-shaped components can share one cell array and still look
// correct. Only a component whose OTHER cells get clobbered shows the damage.
const Pair = () => {
  const [n, setN] = SHIM.useState(0);
  const [m, setM] = SHIM.useState(0);
  return {
    props: {
      children: [
        `n=${n} m=${m}`,
        { type: 'button', key: 'n', props: { onClick: () => setN(n + 1), children: 'bump n' } },
        { type: 'button', key: 'm', props: { onClick: () => setM(m + 1), children: 'bump m' } },
      ],
    },
  };
};

test('harness: two live drivers do not share hook state', () => {
  // ⚠ The cells used to be module state that `drive` reset at mount. With two drivers
  // alive, mounting B reset A's cells, and the next `a.click(...)` re-rendered A against
  // B's array. Nothing threw — the reads succeeded and returned the wrong values.
  //
  // ⚠ AND THE FIRST VERSION OF THIS TEST DID NOT CATCH IT. Two identical Counters share
  // a cell array quite happily, because each handler closes over its own value and only
  // ever writes cell 0. Reverting the fix left it green. The fixture below has a second
  // cell that a shared array would silently drop.
  const a = drive(Pair, {});
  a.click('bump m');
  a.click('bump m');
  assert.match(a.text, /n=0 m=2/, `setup: ${a.text}`);

  const b = drive(Counter, { label: 'B' });   // one cell — mounting this used to wipe A's second
  b.click('bump B');

  a.click('bump n');   // re-renders A; its `m` must survive
  assert.match(a.text, /n=1 m=2/,
    `A's second cell was clobbered by another driver: ${a.text}`);
  assert.match(b.text, /B:1/, `driver B read someone else's state: ${b.text}`);
});

test('harness: interleaved clicks stay on their own driver', () => {
  const a = drive(Pair, {});
  const b = drive(Pair, {});
  a.click('bump n');
  b.click('bump m');
  a.click('bump n');
  b.click('bump m');
  b.click('bump m');
  assert.match(a.text, /n=2 m=0/, `A should hold only its own clicks: ${a.text}`);
  assert.match(b.text, /n=0 m=3/, `B should hold only its own clicks: ${b.text}`);
});

test('harness: clickKey selects by identity, not by label', () => {
  const Two = () => ({
    props: {
      children: [
        { type: 'button', key: 'first', props: { onClick() { picked = 'first'; }, children: 'Same words' } },
        { type: 'button', key: 'second', props: { onClick() { picked = 'second'; }, children: 'Same words' } },
      ],
    },
  });
  let picked = null;
  // Both controls render identical text, so a label match cannot tell them apart — which
  // is the whole reason `clickKey` exists.
  drive(Two, {}).clickKey('second');
  assert.equal(picked, 'second', 'clickKey chose the wrong control');
});

test('harness: an unknown key fails with the keys that DO exist', () => {
  const One = () => ({ props: { children: [{ type: 'button', key: 'only', props: { onClick() {}, children: 'x' } }] } });
  assert.throws(() => drive(One, {}).clickKey('missing'), /no control keyed "missing".*"only"/s,
    'the failure must name what was available, or a rename is a mystery');
});
