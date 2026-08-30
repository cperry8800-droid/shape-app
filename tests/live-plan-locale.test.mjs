// The live Train week and the live Eat menu are DERIVED, never stored.
//
// bsBuildTrainProgram / buildMealProgram bake tr() output — kicker, titles,
// tags, headline, meta, rest-day copy — into every day of the week they return.
// Both loaders run ONCE, in a []-dep effect. So holding a built week in React
// state pins it to whatever language was active at mount: a member who switches
// language in-app keeps reading the old one on their primary tabs.
//
// On Train that showed as a HALF-translated screen, which is why it is the
// louder of the two: the adjust layer (bsApplyTrainAdjust) re-runs on [t, tr],
// so its copy moved to the new language while the week underneath did not.
//
// This is the record-shape defect one layer in. A saved grocery list that
// stores a rendered sentence freezes a language into the member's own data; a
// built week held in state freezes one into the session. Same rule either way:
// keep the RAW data, make the sentence at render.
//
// Source guard by necessity — both components are ~5k-line screens that need a
// dozen window globals to mount, so there is no seam to drive. Mutation-tested
// against the shipped file instead.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const PATH = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';
const raw = fs.readFileSync(PATH, 'utf8');

// Strip line comments before asserting — the rationale written at each site
// quotes the very calls these tests ban, and an assertion that fires on its own
// explanation is a guard that proves nothing. This repo has paid for that once.
const src = raw.replace(/\/\/[^\n]*/g, '');

const SITES = [
  {
    tab: 'Train',
    state: 'liveWorkouts',
    setter: 'setLiveWorkouts',
    builder: 'bsBuildTrainProgram',
    rawStore: 'setLiveWorkouts(p.training.workouts)',
  },
  {
    tab: 'Eat',
    state: 'liveMealDays',
    setter: 'setLiveMealDays',
    builder: 'buildMealProgram',
    rawStore: 'setLiveMealDays(p.meals.days)',
  },
];

test('guard-the-guard: both derived-program memos are present', () => {
  // If either site is renamed or removed, every assertion below would pass
  // vacuously. Fail here instead.
  const memos = src.match(/const liveProgram = React\.useMemo\(/g) || [];
  assert.equal(memos.length, 2, `expected a derived liveProgram on Train and Eat, found ${memos.length}`);
  for (const s of SITES) {
    assert.ok(src.includes(`const [${s.state}, ${s.setter}] = useStateBSC(null);`),
      `${s.tab}: expected state to hold raw data as ${s.state}`);
  }
});

for (const s of SITES) {
  test(`${s.tab}: the loader stores RAW plan data, never a built week`, () => {
    assert.ok(src.includes(s.rawStore), `${s.tab}: expected the loader to store raw data (${s.rawStore})`);
    // The defect, exactly: building inside the setter.
    assert.doesNotMatch(
      src,
      new RegExp(`${s.setter}\\(\\s*${s.builder}\\(`),
      `${s.tab}: the loader must not store a built (translated) program`,
    );
  });

  test(`${s.tab}: the built week is a memo keyed on the translator`, () => {
    const at = src.indexOf(`() => (${s.state} ? ${s.builder}(`);
    assert.ok(at > 0, `${s.tab}: expected liveProgram to be derived from ${s.state} via ${s.builder}`);

    // Read the memo's dep array — the whole point is that it re-runs on a
    // language change, so `tr` (and the theme `t` it also closes over) must be
    // in it. A memo keyed on the raw data alone would freeze exactly as badly.
    const tail = src.slice(at, at + 400);
    const deps = tail.match(/\[([^\]]*)\]\s*\)/);
    assert.ok(deps, `${s.tab}: could not read the memo's dependency array`);
    const names = deps[1].split(',').map(d => d.trim()).filter(Boolean);
    assert.ok(names.includes('tr'), `${s.tab}: the memo must depend on tr — got [${names.join(', ')}]`);
    assert.ok(names.includes('t'), `${s.tab}: the memo must depend on t — got [${names.join(', ')}]`);
    assert.ok(names.includes(s.state), `${s.tab}: the memo must depend on ${s.state} — got [${names.join(', ')}]`);
  });
}

test('Train: the plan loader no longer claims a translator it does not use', () => {
  // It stores raw data now, so t/tr in its useCallback deps would be a stale
  // signal that it still translates — the exact thing the next reader checks.
  const at = src.indexOf('const loadPlan = React.useCallback(');
  assert.ok(at > 0, 'expected the Train plan loader');
  const body = src.slice(at, src.indexOf('React.useEffect', at));
  assert.doesNotMatch(body, /\}, \[t, tr\]\);/, 'the raw loader must not declare t/tr deps');
  assert.match(body, /\}, \[\]\);/, 'the raw loader has no reactive dependencies');
});
