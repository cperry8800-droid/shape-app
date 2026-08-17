// bsCaseVitals — the mobile case file's sanitizer over the shared-overview
// `vitals` leg. The load-bearing property: a leg the server did not send (or
// sent junk for) is NULL — the station shows only the metrics the client has
// really logged, never a fabricated 0/10 gauge.

import test from 'node:test';
import assert from 'node:assert/strict';
import { bsCaseVitals } from '../mobile-app/src/services/caseVitals.mjs';

test('hydration-only payload renders exactly one leg', () => {
  const out = bsCaseVitals({ vitals: { hydration: { avg7L: 2.5, n: 4, series7: [] } } });
  assert.ok(out);
  assert.equal(out.energy, null, 'energy honestly absent');
  assert.equal(out.hunger, null, 'hunger honestly absent');
  assert.deepEqual(out.hydration, { avg: 2.5, n: 4 });
});

test('absent / null / empty vitals ⇒ null (station redacts)', () => {
  assert.equal(bsCaseVitals(null), null);
  assert.equal(bsCaseVitals({}), null);
  assert.equal(bsCaseVitals({ vitals: null }), null);
  assert.equal(bsCaseVitals({ vitals: {} }), null);
  assert.equal(bsCaseVitals({ vitals: 'junk' }), null);
});

test('Number(null)/Number("") fabrication class is refused per leg', () => {
  const out = bsCaseVitals({
    vitals: {
      energy: { avg7: null, n: 3 },
      hunger: { avg7: '', n: 2 },
      hydration: { avg7L: 'abc', n: 1 },
    },
  });
  assert.equal(out, null, 'no leg carries a real average ⇒ the whole read is null');
});

test('numeric strings pass (PostgREST shape); a real 0 average is kept', () => {
  const out = bsCaseVitals({
    vitals: { energy: { avg7: '6.5', n: '7' }, hunger: { avg7: 0, n: 5 } },
  });
  assert.deepEqual(out.energy, { avg: 6.5, n: 7 });
  assert.deepEqual(out.hunger, { avg: 0, n: 5 }, 'a genuine 0 average is a real value');
  assert.equal(out.hydration, null);
});

test('hydration reads avg7L only — an avg7 key on hydration is not honored', () => {
  const out = bsCaseVitals({ vitals: { hydration: { avg7: 3, n: 2 } } });
  assert.equal(out, null, 'wrong key shape does not fabricate a liters figure');
});

test('junk n degrades to 0, never NaN', () => {
  const out = bsCaseVitals({ vitals: { energy: { avg7: 7, n: 'x' } } });
  assert.deepEqual(out.energy, { avg: 7, n: 0 });
});
