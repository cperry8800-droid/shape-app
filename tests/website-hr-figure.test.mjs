// The website's feed draws a heart rate as the app does: a bare number, its label saying HR.
//
// Owner, 2026-10-26, on the app: "this should say HR no BPM, make sure that is showing correctly for
// all activities". The app draws every figure through bsSdFigure / bsSdFigureText
// (sessionLedger.mjs, tests/session-hr.test.mjs); the website's feed (communityFeed.jsx) printed the
// stored "156 bpm" in Session details, on the Wall plate and in the split table. It now draws them
// through cfFigure / cfFigureText, the app's two verbatim, and the stored value keeps its "bpm".
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import { bsSdFigure, bsSdFigureText } from '../mobile-app/src/services/sessionLedger.mjs';
import { bsShareFigureText, bsShareCardModel } from '../public/newdesign/shareCard.mjs';

const FEED = readFileSync(new URL('../public/newdesign/communityFeed.jsx', import.meta.url), 'utf8');
const CLEAN = stripComments(FEED);

function lift(name) {
  const at = FEED.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone from communityFeed.jsx`);
  const open = FEED.indexOf('{', FEED.indexOf(')', at));
  let depth = 0, i = open;
  for (; i < FEED.length; i++) {
    if (FEED[i] === '{') depth++;
    else if (FEED[i] === '}' && --depth === 0) break;
  }
  const body = FEED.slice(at, i + 1);
  assert.ok(/\breturn\b/.test(body), `${name} lifted without its body`);
  return body;
}
const { cfFigure, cfFigureText } = new Function(`${lift('cfSplitUnit')}\n${lift('cfFigure')}\n${lift('cfFigureText')}\nreturn { cfFigure, cfFigureText };`)();

const CASES = ['156 bpm', '174 BPM', '141bpm', ' 98 bpm ', '8,150 lb', '7:42/mi', '1:33/100yd', '8.4 mi', '1:04:42', '176 spm', '412 ft', '1,020', '2.4 · M0', '', null, undefined, 'RPE 9 · PR · 157 bpm'];

test('the feed draws a figure exactly as the app does', () => {
  for (const v of CASES) {
    assert.deepEqual(cfFigure(v), bsSdFigure(v), `cfFigure(${JSON.stringify(v)})`);
    assert.equal(cfFigureText(v), bsSdFigureText(v), `cfFigureText(${JSON.stringify(v)})`);
  }
  // What the rule says, in the website's own words.
  assert.equal(cfFigureText('156 bpm'), '156');
  assert.deepEqual(cfFigure('174 bpm'), { num: '174', unit: '' });
  assert.equal(cfFigureText('8,150 lb'), '8,150 lb', 'a unit that is not a heart rate stays');
  assert.deepEqual(cfFigure('8.4 mi'), { num: '8.4', unit: 'mi' });
});

test('every place the feed draws a stat value draws it through the rule', () => {
  // Session details: the hero, the summary and output tiles, and the split table's third column (its HR).
  assert.match(CLEAN, />\{cfFigureText\(heroStat\[1\]\)\}</);
  assert.equal((CLEAN.match(/>\{cfFigureText\(st\[1\]\)\}</g) || []).length, 2, 'the summary and the output tiles');
  assert.match(CLEAN, />\{cfFigureText\(r\[2\]\)\}</);
  // The Wall plate: its hero is split by the rule, and its facts and preview grid drawn by it, and
  // its pill too (Codex on #2524: an Avg HR hero read "AVG HR · 156 bpm" over a bare "156").
  assert.match(CLEAN, /: `\$\{measure\}\$\{heroStat\[1\] \? ` · \$\{cfFigureText\(heroStat\[1\]\)\}` : ""\}\$\{tail\}`;/);
  assert.match(CLEAN, /const u = heroStat \? cfFigure\(heroStat\[1\]\) : null;/);
  assert.equal((CLEAN.match(/>\{cfFigureText\(v\)\}</g) || []).length, 2, 'the facts and the preview grid');
  // And none of them is drawn raw any more.
  for (const raw of [/>\{heroStat\[1\]\}</, />\{st\[1\]\}</, />\{r\[2\]\}</]) assert.doesNotMatch(CLEAN, raw);
  assert.doesNotMatch(CLEAN, /cfSplitUnit\(heroStat\[1\]\)/);
});

test('the stored value keeps its "bpm": it is how a reader tells a heart rate from another number', () => {
  // The split table cut from a trace stores its HR with the unit, and the demo run's stats do too.
  assert.match(CLEAN, /x\.hr != null \? x\.hr \+ " bpm" : ""/);
  assert.match(CLEAN, /\["Avg HR", "156 bpm"\]/);
});

test('the app\'s pill and the share card say a heart rate the same way', () => {
  // The app's own pill had the same raw value (iosAppBroadsheetClient.jsx wallPill).
  const app = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  assert.match(app, /return `\$\{measure\}\$\{heroStat\[1\] \? ` · \$\{bsSdFigureText\(heroStat\[1\]\)\}` : ''\}\$\{tail\}`;/);
  assert.doesNotMatch(app, /\$\{heroStat\[1\] \? ` · \$\{heroStat\[1\]\}`/);
  // The share card (an image shared off the app) keeps a copy of the rule; it is the app's.
  for (const v of CASES) assert.equal(bsShareFigureText(v), bsSdFigureText(v), `bsShareFigureText(${JSON.stringify(v)})`);
  const card = bsShareCardModel({ heroStat: ['Avg HR', '156 bpm'], stats: [['Distance', '8.4 mi'], ['Max HR', '174 BPM'], ['Avg HR', '156 bpm']] });
  assert.deepEqual(card.heroStat, ['Avg HR', '156']);
  assert.deepEqual(card.stats, [['Distance', '8.4 mi'], ['Max HR', '174']], 'the hero still never repeats in the rows');
});
