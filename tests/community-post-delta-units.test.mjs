// The PR delta `createCommunityPost` stamps on a workout post.
//
// ⚠ WHAT THIS EXISTS FOR. `pr_wall_posts` keeps a unit PER ROW, and this
// function compared and subtracted the raw digits — so against a 100 kg record,
// a 230 lb lift stamped "+130 lb" on a gain that is really about 9.5, and a
// 100 kg lift after 200 lb stamped nothing at all because 100 is not greater
// than 200. The Wall card PRINTS this stored `metrics.delta`, so it is a wrong
// number on the member's own record rather than a missing one. It became
// reachable when the Post-a-PR sheet started routing through here, which is why
// it is fixed rather than registered.
//
// The function cannot be imported (shapeBackend.js is a classic browser script
// and pulls in the whole data layer), so the delta block is lifted out of the
// shipped source and evaluated against stubs — the radio-ask-gate method.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url);
const src = readFileSync(SRC, 'utf8');

function lift(name, kind = 'function') {
  const at = src.indexOf(`${kind} ${name}(`);
  assert.ok(at > 0, `${name} not found`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') { depth -= 1; if (!depth) return src.slice(at, i + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}

// The delta block verbatim out of `createCommunityPost`, with its two
// dependencies lifted rather than restated — a local copy of either would make
// this suite agree with itself instead of with what ships.
const DELTA = (() => {
  const a = src.indexOf('  const _lift = (mergedMetrics.lift');
  const b = src.indexOf('  const payload = {', a);
  assert.ok(a > 0 && b > a, 'the delta block moved');
  return src.slice(a, b);
})();

const CONST = src.match(/const LB_TO_KG_BACKEND = [\d.]+;/)[0];

function stampDelta({ load, prev }) {
  const body = `
    ${CONST}
    ${lift('_liftToLb')}
    // ⚠ THE STUB HONOURS THE SELECT, because the select is half of the fix.
    // A stub that returns the whole row whatever was asked for makes dropping
    // \`unit\` from the query invisible — measured: that mutation SURVIVED this
    // suite until the projection below existed.
    const supabase = { from: () => ({ select: (cols) => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => {
      if (PREV == null) return { data: null };
      const want = String(cols).split(',').map((c) => c.trim());
      const row = {};
      for (const c of want) if (c in PREV) row[c] = PREV[c];
      return { data: row };
    } }) }) }) }) };
    const state = { user: { id: 'me' } };
    const mergedMetrics = { lift: 'Back squat', load: LOAD };
    ${DELTA}
    return mergedMetrics.delta;
  `;
  // eslint-disable-next-line no-new-func
  return new Function('LOAD', 'PREV', `return (async () => { ${body} })();`)(load, prev);
}

test('a gain is computed in one unit, and expressed in the post’s own', async () => {
  // 100 kg is 220.46 lb, so 230 lb beats it by about 9.5 — not by 130.
  const d = await stampDelta({ load: '230 lb', prev: { best_value: 100, unit: 'kg', posted_at: null } });
  assert.match(d, /^\+9\.5 lb$/);
});

test('a kg lift that beats a lb record is stamped, not silently dropped', async () => {
  // Raw digits say 100 is not greater than 200, so this stamped nothing at all.
  const d = await stampDelta({ load: '100 kg', prev: { best_value: 200, unit: 'lb', posted_at: null } });
  assert.ok(d, 'a real 220.5 lb against 200 lb is a gain');
  assert.match(d, /kg$/, 'and it is quoted in the unit the member lifted in');
  assert.equal(d, '+9.3 kg');
});

test('same units are unchanged, so the fix is not a rewrite of the common case', async () => {
  assert.equal(await stampDelta({ load: '245 lb', prev: { best_value: 225, unit: 'lb', posted_at: null } }), '+20 lb');
  assert.equal(await stampDelta({ load: '110 kg', prev: { best_value: 100, unit: 'kg', posted_at: null } }), '+10 kg');
});

test('a row with no unit is read as pounds, the column default', async () => {
  assert.equal(await stampDelta({ load: '245 lb', prev: { best_value: 225, posted_at: null } }), '+20 lb');
});

test('no previous best is no delta, and a regression is no delta', async () => {
  assert.equal(await stampDelta({ load: '245 lb', prev: null }), undefined);
  assert.equal(await stampDelta({ load: '200 lb', prev: { best_value: 225, unit: 'lb', posted_at: null } }), undefined);
  // ⚠ AND A REAL GAIN THAT ROUNDS AWAY IS NOT STAMPED AS "+0", which claims a
  // direction the figure beside it cannot support.
  assert.equal(await stampDelta({ load: '225.01 lb', prev: { best_value: 225, unit: 'lb', posted_at: null } }), undefined);
});

test('an unreadable previous value never becomes a gain', async () => {
  assert.equal(await stampDelta({ load: '245 lb', prev: { best_value: null, unit: 'lb', posted_at: null } }), undefined);
  assert.equal(await stampDelta({ load: '245 lb', prev: { best_value: 'heavy', unit: 'lb', posted_at: null } }), undefined);
});
