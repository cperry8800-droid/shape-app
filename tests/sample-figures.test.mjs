// tests/sample-figures.test.mjs
//
// The website's sample figures are a labelled example for a visitor and the account's own for a
// member (owner, 2026-11-11: "fix the store sample numbers too, and community page, and rewards
// page. Look at every page on website"). The Rewards page has its own render tests
// (tests/score-page-examples.test.mjs); this holds the Store's hero strip and the Community page.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const STORE = readFileSync('public/newdesign/store.jsx', 'utf8');
// The code, without its comments: a note quoting an old heading is not the page claiming it.
const COMMUNITY = readFileSync('public/newdesign/community.jsx', 'utf8')
  .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '');

/** A top-level function's source, by name, up to the next top-level function. */
function fnSource(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone from the source`);
  const next = src.indexOf('\nfunction ', at + 10);
  return src.slice(at, next < 0 ? undefined : next);
}

const consts = ['BALANCE', 'LIFETIME', 'REDEEMED_COUNT'].map((n) => {
  const m = new RegExp(`^const ${n} = (\\d+);`, 'm').exec(STORE);
  assert.ok(m, `store.jsx no longer declares ${n}`);
  return `const ${n} = ${m[1]};`;
}).join('\n');
const storeHeroFigures = new Function(`${consts}\n${fnSource(STORE, 'storeHeroFigures')}\nreturn storeHeroFigures;`)();

const NOW = new Date('2026-11-11T15:00:00Z');
const STANDING = {
  points_total: 2340,
  current_tier: { name: 'Form', threshold: 2000 },
  next_tier: { name: 'Peak', threshold: 5000 },
  points_to_next: 2660,
};
const ROWS = [
  { created_at: '2026-11-02T10:00:00Z' }, { created_at: '2026-10-05T10:00:00Z' }, { created_at: '2026-09-29T10:00:00Z' },
];

test("the Store's example member is one person, the Rewards page's, and says it is an example", () => {
  const f = storeHeroFigures({ signedIn: false, score: null, redemptions: null, now: NOW });
  assert.equal(f.example, true);
  assert.equal(f.lifetime, '1,284', "the example's Shape Score is not the Rewards page's 1,284");
  assert.equal(f.tier, 'Tempo');
  // 1,284 sits in Tempo (750) and is 716 short of Form (2,000). "216 to Peak" could be no score.
  assert.equal(f.tierSub, '716 to Form');
  assert.match(STORE, /\{fig\.example && \(\s*<div data-store-example=""/, 'the example strip lost its label');
  assert.match(STORE, /Example member · sign in to see your own/);
  assert.match(STORE, /live \? "Your locker" : "Example locker · sign in to see yours"/, "the example locker's codes are unlabelled");
});

test("a signed-in member's strip is their own Shape Score, redemptions and tier, never the example's", () => {
  const f = storeHeroFigures({ signedIn: true, score: STANDING, redemptions: ROWS, now: NOW });
  assert.equal(f.example, false);
  assert.equal(f.lifetime, '2,340');
  assert.equal(f.redeemed, '3');
  assert.equal(f.redeemedSub, '2 this quarter', 'October and November are this quarter, September is not');
  assert.equal(f.tier, 'Form');
  assert.equal(f.tierSub, '2,660 to Peak');

  const top = storeHeroFigures({ signedIn: true, score: { points_total: 16000, current_tier: { name: 'Legend' }, next_tier: null, points_to_next: 0 }, redemptions: [], now: NOW });
  assert.equal(top.tierSub, 'the top tier');
  assert.equal(top.redeemed, '0');

  const fifty = storeHeroFigures({ signedIn: true, score: STANDING, redemptions: Array(50).fill({ created_at: '2026-01-01T00:00:00Z' }), now: NOW });
  assert.equal(fifty.redeemed, '50+', 'the locker reads only the newest 50');
});

test('a member whose reads are out sees dashes, not the example', () => {
  const f = storeHeroFigures({ signedIn: true, score: null, redemptions: null, now: NOW });
  assert.equal(f.example, false);
  assert.deepEqual([f.lifetime, f.redeemed, f.tier], ['—', '—', '—']);
  for (const v of Object.values(f)) {
    assert.ok(!/1,284|Tempo|716|4 this quarter/.test(String(v)), 'a member waiting on a read is shown the example\'s ' + v);
  }
  // The hero reads the Standing from the Rewards page's own route.
  assert.match(STORE, /fetch\("\/api\/client\/score"/, "the Store no longer reads the member's Shape Score");
  assert.match(STORE, /<StoreHero [^>]*signedIn=\{!!gate\.signedIn\} score=\{scoreSummary\} redemptions=\{store\.redemptions\}/);
});

test('every sample section on the Community page says it is an example, and none claims to be live', () => {
  const labels = [...COMMUNITY.matchAll(/<CmExample[^>]*>([^<]+)<\/CmExample>/g)].map((m) => m[1]);
  for (const want of [/Example posts/, /Example rooms/, /Example events/, /Example challenges/]) {
    assert.ok(labels.some((l) => want.test(l)), 'the Community page lost its label: ' + want);
  }
  for (const claim of ['Live · across the network', 'Rooms · live', 'Events · this month', 'Your challenges · from your team']) {
    assert.ok(!COMMUNITY.includes(claim), `the Community page claims "${claim}" of its samples again`);
  }
  // A dead RSVP link on an event that is not scheduled.
  assert.doesNotMatch(COMMUNITY, />RSVP →</, 'an example event offers an RSVP that does nothing');
});

test("a signed-in member's feed section is the Wall itself, and a visitor's sample is labelled", () => {
  assert.match(COMMUNITY, /window\.CommunityFeed/, 'the Community page no longer reaches for the Wall');
  assert.match(COMMUNITY, /\{Wall \? \(\s*<div data-cm-wall=""[^]*?React\.createElement\(Wall, \{ place: "wall" \}\)/, "a member's feed section is not the Wall");
  assert.match(COMMUNITY, /\{Wall \? null : <CmExample[^>]*>Example posts/, "the visitor's sample feed is unlabelled");
});
