// tests/session-hr.test.mjs
//
// Heart rate on every activity (owner, 2026-10-26, on a deadlift PR's tiles: "this should say HR no
// BPM, make sure that is showing correctly for all activities"; on a bench PR's details: "there is
// not HR or other stats on this post"; then "show HR during PR if it is one, and always show AVG HR,
// and then show HR during different stages of activity depending on activity").
//
// - A heart rate reads as a bare number wherever the page draws one; its label says HR.
// - Every activity carries its Avg HR; a PR carries the HR through its PR set.
// - Each stage carries its own HR: a lift's sets, a ride's intervals, a run's or a swim's splits.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, SRC } from './helpers/broadsheet-mount.mjs';
import { bsSdSplitUnit, bsSdFigure, bsSdFigureText } from '../mobile-app/src/services/sessionLedger.mjs';
import { bsIbSetRow, bsIbSetTable } from '../mobile-app/src/services/instrumentBoard.mjs';

const { COMMUNITY_ACTIVITIES, bsDemoCoachActivity } = await loadBroadsheet(['COMMUNITY_ACTIVITIES', 'bsDemoCoachActivity']);
const CLIENT = readFileSync(SRC, 'utf8');
const STORY = readFileSync(new URL('../mobile-app/src/broadsheet/BSWallStory.jsx', import.meta.url), 'utf8');

test('a heart rate is drawn as a bare number, and every other unit keeps its place', () => {
  assert.deepEqual(bsSdFigure('138 bpm'), { num: '138', unit: '' });
  assert.deepEqual(bsSdFigure('138 BPM'), { num: '138', unit: '' });
  assert.deepEqual(bsSdFigure('8,150 lb'), { num: '8,150', unit: 'lb' });
  assert.deepEqual(bsSdFigure('7:58/mi'), { num: '7:58', unit: '/mi' });
  assert.equal(bsSdFigureText('162 bpm'), '162');
  assert.equal(bsSdFigureText('245 lb'), '245 lb');
  assert.equal(bsSdFigureText('2.4 · M0'), '2.4 · M0');
  assert.equal(bsSdFigureText(null), '');
  // The stored value keeps its unit: it is how every reader tells a heart rate from another number.
  assert.deepEqual(bsSdSplitUnit('138 bpm'), { num: '138', unit: 'bpm' });
});

test('a swim pace splits off its pool length, so it no longer runs into the next tile', () => {
  assert.deepEqual(bsSdSplitUnit('1:33/100yd'), { num: '1:33', unit: '/100yd' });
  assert.deepEqual(bsSdSplitUnit('1:42/100m'), { num: '1:42', unit: '/100m' });
  // The contract is unchanged otherwise: a composite and a time stay whole.
  assert.deepEqual(bsSdSplitUnit('2.4 · M0'), { num: '2.4 · M0', unit: '' });
  assert.deepEqual(bsSdSplitUnit('25:31'), { num: '25:31', unit: '' });
  // The website's copy is the same rule (communityFeed.jsx, "verbatim").
  const feed = readFileSync(new URL('../public/newdesign/communityFeed.jsx', import.meta.url), 'utf8');
  const ledger = readFileSync(new URL('../mobile-app/src/services/sessionLedger.mjs', import.meta.url), 'utf8');
  const re = (src) => (src.match(/const m = s\.match\((\/\^.*\$\/)\);/) || [])[1];
  assert.ok(re(ledger));
  assert.equal(re(feed), re(ledger), 'the website\'s cfSplitUnit drifted from bsSdSplitUnit');
});

test('every place the session page and the Wall draw a figure goes through the HR rule', () => {
  for (const sig of [
    "function BSIbTile({ label, value, kind, ghostPath, needle, heat, t, onOpen, openLabel }) {\n  const u = bsSdFigure(value);",
    'const u = bsSdFigure(detail.value);',
    'bsSdFigure(r[1]).unit.length',
    'const u = bsSdFigure(d.heroStat[1]);',
    'const u = bsSdFigure(heroStat[1]);',
    '{bsSdFigureText(v)}</div>',
    'out.push([st[0], bsSdFigureText(st[1])]);',
  ]) assert.ok(CLIENT.includes(sig), sig);
  assert.ok(STORY.includes('const u = bsSdFigure(value);'));
  assert.ok(STORY.includes('{bsSdFigureText(v)}</div>'));
  // The heart-rate chart's peak and scrub read a bare number under its "Heart rate" head.
  assert.doesNotMatch(CLIENT, /idKey="hr"[^\n]*unit="bpm"/);
});

test('a set or an interval carries its own HR, in its own column', () => {
  const pr = bsIbSetRow(['Set 3', '245 lb × 3', 'RPE 9 · PR · 157 bpm']);
  assert.equal(pr.hr, 157);
  assert.equal(pr.rpe, 9);
  assert.equal(pr.note, 'PR', 'the HR is read once, in its column, and not again in the note');
  assert.equal(bsIbSetRow(['Set 1', '225 lb', '', { rpe: 8, hr: 148 }]).hr, 148);
  assert.equal(bsIbSetRow(['Set 1', '225 lb × 3', 'RPE 7']).hr, null);
  // `Number(null)` and `Number('')` are 0 and finite: neither is a heart rate.
  assert.equal(bsIbSetRow(['Set 1', '225 lb', '', { hr: null }]).hr, null);
  assert.equal(bsIbSetRow(['Set 1', '225 lb', '', { hr: '' }]).hr, null);
  const climb = bsIbSetRow(['Climb 1', '6:24', '298 W · 163 bpm']);
  assert.equal(climb.hr, 163);
  assert.equal(climb.note, '298 W');
  // A live set's duration and rest still find their places beside it.
  const live = bsIbSetRow(['Set 1', '100 × 5', 'RPE 8 · 42s · rest 2:30']);
  assert.deepEqual([live.rpe, live.hr, live.note, live.rest], [8, null, '42s', '2:30']);
});

test('the value column says what it holds: what was lifted, or how long an interval took', () => {
  assert.equal(bsIbSetTable([['Climb 1', '6:24', '298 W'], ['Climb 2', '6:02', '312 W']]).valueKind, 'time');
  assert.equal(bsIbSetTable([['Set 1', '225 lb × 3', 'RPE 7']]).valueKind, 'load');
  assert.equal(bsIbSetTable([['Back squat', '5 × 5 @ 185', '']]).valueKind, 'load');
  assert.equal(bsIbSetTable([]).valueKind, 'load');
  assert.match(CLIENT, /tbl\.valueKind === 'time'\n\s*\? \{ label: tr\('session:board\.colTime', \{ defaultValue: 'Time' \}\)/);
  assert.match(CLIENT, /if \(tbl\.cols\.hr\) head\.push\(\{ label: tr\('session:board\.colHr', \{ defaultValue: 'HR' \}\)/);
});

const isActivity = (a) => a.kind !== 'milestone';
const statOf = (a, re) => (a.stats || []).find(([k]) => re.test(String(k)));
const bpmOf = (v) => Number((String(v).match(/(\d{2,3})\s*bpm/i) || [])[1]);

test('every activity on the Wall carries its Avg HR, and a PR the HR through its PR set', () => {
  const acts = COMMUNITY_ACTIVITIES.filter(isActivity);
  assert.ok(acts.length >= 12, 'the demo corpus shrank');
  for (const a of acts) {
    const avg = statOf(a, /^avg hr$/i);
    assert.ok(avg && bpmOf(avg[1]) > 0, `${a.who} · ${a.title || a.lift}: no Avg HR`);
    const max = statOf(a, /^max hr$/i);
    if (max) assert.ok(bpmOf(max[1]) >= bpmOf(avg[1]), `${a.who}: Max HR under Avg HR`);
  }
  const prs = acts.filter((a) => a.kind === 'pr');
  assert.ok(prs.length >= 3);
  for (const a of prs) {
    const prHr = statOf(a, /^pr set hr$/i);
    assert.ok(prHr, `${a.who} · ${a.lift}: no PR set HR`);
    // The PR set in the table reads the same HR as the tile, and no more than the session's max.
    const row = a.breakdown.rows.find((r) => /\bPR\b/.test(String(r[2])));
    assert.ok(row, `${a.who}: no PR row`);
    assert.equal(bsIbSetRow(row).hr, bpmOf(prHr[1]), `${a.who}: the PR row and the tile disagree`);
    assert.ok(bpmOf(prHr[1]) <= bpmOf(statOf(a, /^max hr$/i)[1]), `${a.who}: PR set HR over Max HR`);
    // Avg HR sits before PR set HR, so the board's HR register is the session's average.
    assert.ok(a.stats.indexOf(statOf(a, /^avg hr$/i)) < a.stats.indexOf(prHr), `${a.who}: PR set HR leads Avg HR`);
  }
});

test('every stage carries its HR: sets, intervals and splits, on the Wall and a coach\'s own posts', () => {
  const coach = bsDemoCoachActivity('Maya Okafor', false, 'LEGEND');
  const withStages = [...COMMUNITY_ACTIVITIES, ...coach].filter((a) => a.breakdown && Array.isArray(a.breakdown.rows));
  assert.ok(withStages.length >= 10);
  for (const a of withStages) {
    const max = statOf(a, /^max hr$/i);
    for (const r of a.breakdown.rows) {
      const hr = bpmOf(r[2]);
      assert.ok(hr > 0, `${a.who} · ${a.breakdown.label} · ${r[0]}: no HR`);
      if (max) assert.ok(hr <= bpmOf(max[1]), `${a.who} · ${r[0]}: ${hr} over Max HR ${max[1]}`);
    }
  }
  // Each of the three coach variants a profile can draw, not only the one this name picks.
  for (const name of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    for (const a of bsDemoCoachActivity(name, false, 'BASE')) {
      for (const r of a.breakdown.rows) assert.ok(bpmOf(r[2]) > 0 && bpmOf(r[2]) <= bpmOf(statOf(a, /^max hr$/i)[1]), `${name} · ${a.title} · ${r[0]}`);
    }
  }
});
