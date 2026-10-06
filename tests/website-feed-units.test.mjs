// tests/website-feed-units.test.mjs
//
// THE WEBSITE FEED, IN THE MEMBER'S UNITS.
//
// ⚠ IT DREW EVERY FIGURE EXACTLY AS STORED. Importers write miles, feet and
// mph, so a metric member read "8.4 mi", "7:42/mi" and "+412 ft" on the website
// while the app showed them kilometres and metres (#2205 fixed the app). The
// website now converts through the SAME module the app imports
// (`public/newdesign/unitText.mjs`), against `client_settings.units`.
//
// These lift the website's pure `cfUnitizePost` out of the real source and drive
// it with the real module over the website's own demo posts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as U from '../public/newdesign/unitText.mjs';
import * as S from '../public/newdesign/paceSplits.mjs';
import * as Ledger from '../mobile-app/src/services/sessionLedger.mjs';

const FEED = readFileSync('public/newdesign/communityFeed.jsx', 'utf8');

// Lift a top-level function out of the source (braces counted from the body,
// never from a destructured parameter list).
function lift(name) {
  const at = FEED.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone — re-anchor this test`);
  const open = FEED.indexOf('{', FEED.indexOf(')', at));
  let depth = 0, i = open;
  for (; i < FEED.length; i++) {
    if (FEED[i] === '{') depth++;
    else if (FEED[i] === '}' && --depth === 0) break;
  }
  const body = FEED.slice(at, i + 1);
  assert.ok(body.length > 60, `${name} lifted only ${body.length} chars`);
  return body;
}
// eslint-disable-next-line no-new-func
const cfUnitizePost = new Function(`${lift('cfDistanceOf')}\n${lift('cfUnitizePost')}\nreturn cfUnitizePost;`)();
// eslint-disable-next-line no-new-func
const cfUnitPrefs = new Function(`${lift('cfUnitPrefs')}\nreturn cfUnitPrefs;`)();
// eslint-disable-next-line no-new-func
const cfDistanceOf = new Function(`${lift('cfDistanceOf')}\nreturn cfDistanceOf;`)();
// What the page's loader hands the feed: the converter and the splits model.
const UF = { ...U, ...S };

// The website's demo posts, read out of the source as data.
function demoFeed() {
  const at = FEED.indexOf('const DEMO_FEED = [');
  assert.ok(at >= 0, 'DEMO_FEED is gone — re-anchor this test');
  const open = FEED.indexOf('[', at);
  let depth = 0, i = open;
  for (; i < FEED.length; i++) {
    if (FEED[i] === '[') depth++;
    else if (FEED[i] === ']' && --depth === 0) break;
  }
  // eslint-disable-next-line no-new-func
  const rows = new Function(`return ${FEED.slice(open, i + 1)}`)();
  assert.ok(Array.isArray(rows) && rows.length >= 6, `DEMO_FEED read as ${rows && rows.length} posts`);
  return rows;
}

const LB = cfUnitPrefs('Imperial · lb / mi');
const KG = cfUnitPrefs('Metric · kg / km');

// Every figure-bearing string the website draws from a post (its note excluded:
// the card never rewrites a member's words).
const figures = (p) => {
  const out = [p.title, p.delta, p.load, p.distance, p.pace, p.elev];
  const s = p.session;
  if (s) {
    out.push(s.title);
    for (const r of s.stats || []) out.push(r[1]);
    for (const r of (s.breakdown && s.breakdown.rows) || []) out.push(...r.slice(1));
    if (s.breakdown) out.push(s.breakdown.label);
  }
  return out.filter((v) => v != null && v !== '').map(String);
};
const IMPERIAL_FIG = /\d\s*(?:mi|yd|yds|ft|mph|lbs?)(?![\w-])|\/\s*(?:mi|100\s*yd)\b/i;
const METRIC_FIG = /\d\s*(?:km|kg|km\/h)(?![\w-])|\/\s*(?:km|100\s*m)\b|\d,\d{3}\s*m(?![\w/-])|\d\s+m(?![\w/-])/i;

test('the setting is read the way both surfaces write it, and defaults to imperial', () => {
  assert.deepEqual(cfUnitPrefs('Metric · kg / km'), { weight: 'kg', distance: 'km' });
  assert.deepEqual(cfUnitPrefs('metric'), { weight: 'kg', distance: 'km' });
  assert.deepEqual(cfUnitPrefs('Imperial · lb / mi'), { weight: 'lb', distance: 'mi' });
  assert.deepEqual(cfUnitPrefs(null), { weight: 'lb', distance: 'mi' }, 'signed out: the app\'s default');
  assert.deepEqual(cfUnitPrefs(''), { weight: 'lb', distance: 'mi' });
});

test('EVERY website demo post, both settings: no figure in the other system', () => {
  const failures = [];
  for (const p of demoFeed()) {
    for (const [prefs, other, name] of [[KG, IMPERIAL_FIG, 'metric'], [LB, METRIC_FIG, 'imperial']]) {
      for (const f of figures(cfUnitizePost(p, U, prefs))) {
        if (other.test(f)) failures.push(`${p.who} (${p.kind}, ${name}): "${f}"`);
      }
    }
  }
  assert.deepEqual(failures, [], failures.join('\n'));
});

test('the demo run reads in kilometres for a metric member, charts included', () => {
  const run = demoFeed().find((p) => p.kind === 'run');
  const out = cfUnitizePost(run, U, KG);
  assert.equal(out.distance, '13.5 km');
  assert.equal(out.pace, '4:47/km');
  assert.equal(out.elev, '+126 m');
  assert.equal(out.session.title, 'Long run · 13.5 km');
  assert.deepEqual(out.session.stats.find((r) => r[0] === 'Elevation'), ['Elevation', '126 m']);
  assert.equal(out.session.breakdown.rows[0][1], '4:59/km');
  // ⚠ THE TRACES FOLLOW THEIR FIGURES: the pace chart is drawn per km and the
  // elevation profile in metres, or a chart disagrees with the number above it.
  const m0 = run.session.metrics, m1 = out.session.metrics;
  assert.ok(Math.abs(m1.paceTrace[0] - m0.paceTrace[0] / 1.609344) < 1e-9, 'the pace trace stayed per mile');
  assert.ok(Math.abs(m1.elevTrace[0] - m0.elevTrace[0] * 0.3048) < 1e-9, 'the elevation trace stayed in feet');
  assert.deepEqual(m1.hrTrace, m0.hrTrace, 'heart rate has no unit to convert');
  // The member's own note is never rewritten, and the stored post is untouched.
  assert.equal(out.body, run.body);
  assert.equal(run.distance, '8.4 mi', 'the stored post was mutated');
  assert.equal(run.session.metrics.paceTrace, m0.paceTrace);
});

test('the demo PR states its load and its gain in the member\'s units', () => {
  const pr = demoFeed().find((p) => p.kind === 'pr');
  const out = cfUnitizePost(pr, U, KG);
  assert.equal(out.load, '102 kg');
  assert.equal(out.delta, '+4.5 kg');
  assert.equal(out.reps, pr.reps, 'a rep scheme is not a measurement');
});

test('an imperial member sees the stored imperial post exactly as stored', () => {
  for (const p of demoFeed()) {
    const out = cfUnitizePost(p, U, LB);
    assert.deepEqual(figures(out), figures(p), `${p.who}: an imperial figure was rewritten for an imperial reader`);
  }
});

test('a live swim reads in the pool unit of the member\'s system', () => {
  const swim = {
    kind: 'post', who: 'Lena', title: 'Masters swim · 2 km', body: 'Long-course meters.',
    session: { sport: 'swim', title: 'Masters swim · 2 km', stats: [['Distance', '2,000 m'], ['Avg pace', '1:42/100m'], ['Time', '34:10']],
      metrics: { paceTrace: [108, 93] }, breakdown: { label: '500m splits', rows: [['Split 1', '1:46/100m', 'Build']] } },
  };
  const imp = cfUnitizePost(swim, U, LB);
  assert.equal(imp.title, 'Masters swim · 2,187 yd');
  assert.deepEqual(imp.session.stats.slice(0, 2), [['Distance', '2,187 yd'], ['Avg pace', '1:33/100yd']]);
  assert.equal(imp.session.breakdown.label, '547 yd splits');
  assert.ok(Math.abs(imp.session.metrics.paceTrace[0] - 108 * 0.9144) < 1e-9, 'the swim pace trace stayed per 100 m');
  assert.equal(imp.session.stats[2][1], '34:10');
  const met = cfUnitizePost(swim, U, KG);
  assert.equal(met.title, 'Masters swim · 2,000 m');
});

test('a swim posted with only a title still reads in the pool unit', () => {
  // No stats and no traces, so the website gives it no session; its sport is
  // the post's own (`activity_type`), which is what the app reads too.
  const swim = { kind: 'post', isLive: true, who: 'Lena', sport: 'swim', title: 'Pool · 2,000 m', body: 'Easy.', session: null };
  assert.equal(cfUnitizePost(swim, U, LB).title, 'Pool · 2,187 yd');
  assert.equal(cfUnitizePost(swim, U, KG).title, 'Pool · 2,000 m');
  // The live mapper sets it, outside the session as well as inside.
  assert.match(FEED, /\n {8}sport: p\.activity_type \|\| '',\n/, 'a live post no longer carries its sport outside its session');
});

test('a breakdown row is a set, not a stat: "Hill climb" keeps its metres', () => {
  const post = { kind: 'post', who: 'T', session: { sport: 'run', stats: [], metrics: {},
    breakdown: { label: 'Working sets', rows: [['Hill climb', '6 × 200 m', 'RPE 8'], ['Flat', '2 × 400 m', 'RPE 7']] } } };
  assert.deepEqual(cfUnitizePost(post, U, LB).session.breakdown.rows.map((r) => r[1]), ['6 × 200 m', '2 × 400 m']);
});

test('conversion is idempotent, so a re-render cannot drift', () => {
  for (const p of demoFeed()) {
    const once = cfUnitizePost(p, U, KG);
    assert.deepEqual(figures(cfUnitizePost(once, U, KG)), figures(once), `${p.who} drifted`);
  }
});

test('nothing loaded yet: the post is returned as it is', () => {
  const p = demoFeed()[0];
  assert.equal(cfUnitizePost(p, null, KG), p);
  assert.equal(cfUnitizePost(p, U, null), p);
});

test('the website and the app run ONE converter', () => {
  // The app's names are re-exports of the website module, not a second copy.
  for (const name of ['bsSdUnitizeText', 'bsSdUnitizeStat', 'bsSdPaceTraceIn', 'bsSdElevTraceIn', 'bsSdUnitizeLabel', 'bsSdMeasure', 'bsSdConvertValue']) {
    assert.equal(Ledger[name], U[name], `${name} is not the shared function`);
  }
  // The path the feed imports is the module the test drives, and it is pure.
  assert.match(FEED, /import\("\/newdesign\/unitText\.mjs"\)/);
  assert.ok(existsSync('public/newdesign/unitText.mjs'));
  const mod = readFileSync('public/newdesign/unitText.mjs', 'utf8').replace(/\/\/.*$/gm, '');
  assert.doesNotMatch(mod, /\bwindow\b|\bdocument\b|\bimport\s/, 'the shared module reaches for the page or another module');
});

test('the card draws the converted post, and writes only the stored one', () => {
  const at = FEED.indexOf('function FeedItem({ p: stored');
  assert.ok(at > 0, 'FeedItem no longer separates the stored post from the drawn one');
  const item = FEED.slice(at, FEED.indexOf('function PostComposer', at));
  assert.match(item, /const p = React\.useMemo\(\(\) => \(units \? cfUnitizePost\(stored, units\.U, units\.prefs\) : stored\), \[stored, units\]\);/);
  // The plate, the session page and the share card read `p`…
  assert.match(item, /const wall = cfWallModel\(p\);/);
  assert.match(item, /<SessionDetailsModal p=\{p\}/);
  assert.match(item, /<ShareChooserModal p=\{p\}/);
  // …and every write sends what was stored, never the reader's conversion.
  assert.match(item, /title: stored\.title \|\| "Repost", note: stored\.body/);
  // The quote a repost carries is stored too, so it keeps the author's words.
  assert.match(item, /repostOf: \{ postId: p\.id, who: p\.who \|\| "", title: stored\.title \|\| "", body: String\(stored\.body \|\| ""\)/,
    'the repost quote writes the reader\'s conversion');
  assert.match(item, /onEdit\(stored\)/);
  assert.match(item, /<SendPostModal post=\{stored\}/);
  assert.doesNotMatch(item, /onEdit\(p\)|SendPostModal post=\{p\}|title: p\.title \|\| "Repost"/);
  // And the feed's load hands the loaded converter and setting to every card.
  assert.match(FEED, /cfLoadUnits\(signedIn\)\.then\(\(u\) => \{ if \(alive && u\) setUnits\(u\); \}\);/, 'the feed never loads the member\'s units');
});

test('a stat\'s label still decides what a bare metre is (elevation, stride)', () => {
  const post = { kind: 'post', who: 'T', session: { sport: 'run', metrics: {},
    stats: [['Distance', '5 km'], ['Elev gain', '165 m'], ['Stride', '1.18 m'], ['Time', '45m']] } };
  assert.deepEqual(cfUnitizePost(post, U, LB).session.stats.map((r) => r[1]), ['3.1 mi', '541 ft', '3.9 ft', '45m']);
});

test('the feed reads the member\'s setting, and falls back to imperial when it cannot', async () => {
  // The loader, lifted and run against the real module: the page's absolute
  // path is pointed at the file, and `window.shapeDb` is a stub.
  const src = lift('cfLoadUnits')
    .replace('import("/newdesign/unitText.mjs")', `import(${JSON.stringify(pathToFileURL('public/newdesign/unitText.mjs').href)})`)
    .replace('import("/newdesign/paceSplits.mjs")', `import(${JSON.stringify(pathToFileURL('public/newdesign/paceSplits.mjs').href)})`);
  assert.notEqual(src, lift('cfLoadUnits'), 'the loader no longer imports the shared module by its page path');
  // eslint-disable-next-line no-new-func
  const load = new Function('cfUnitPrefs', `${src}\nreturn cfLoadUnits;`)(cfUnitPrefs);
  const prev = globalThis.window;
  try {
    const asked = [];
    globalThis.window = { shapeDb: { getUserGoals: async (k) => { asked.push(k); return { units: 'Metric · kg / km' }; } } };
    const signedIn = await load(true);
    assert.deepEqual(signedIn.prefs, KG, 'a metric member was given imperial');
    assert.equal(signedIn.U.bsSdUnitizeText, U.bsSdUnitizeText, 'the loader handed back a different converter');
    assert.equal(signedIn.U.bsPaceSplits, S.bsPaceSplits, 'the loader did not hand the feed the splits model');
    assert.deepEqual(asked, ['client_settings']);
    globalThis.window = { shapeDb: { getUserGoals: async () => ({ units: 'kg / km' }) } };
    assert.deepEqual((await load(true)).prefs, KG, 'the app’s rule: a kg or km setting is metric');
    globalThis.window = { shapeDb: { getUserGoals: async (k) => { asked.push(k); return { units: 'Metric · kg / km' }; } } };
    asked.length = 1;
    assert.deepEqual((await load(false)).prefs, LB, 'signed out: the default, and the setting is not read');
    assert.deepEqual(asked, ['client_settings'], 'a signed-out visitor\'s settings were read');
    globalThis.window = { shapeDb: { getUserGoals: async () => { throw new Error('offline'); } } };
    assert.deepEqual((await load(true)).prefs, LB, 'a failed read must fall back, not break the feed');
    globalThis.window = {};
    assert.deepEqual((await load(true)).prefs, LB, 'no database on the page: the default');
  } finally { globalThis.window = prev; }
});

// ── splits are cut in the reader's unit ─────────────────────────────────────
// ⚠ The demo run's split strip said "Mile 1"–"Mile 8" over paces per km for a
// metric reader. It is re-cut per kilometre from the run's own trace, by the
// app's rule.
test('the demo run\'s splits are per kilometre for a metric reader, per mile for an imperial one', () => {
  const run = demoFeed().find((p) => p.session && p.session.breakdown && /mile/i.test(p.session.breakdown.label));
  assert.ok(run, 'the demo run with mile splits is gone — re-anchor this test');
  const km = cfUnitizePost(run, UF, KG).session.breakdown;
  assert.equal(km.label, 'Km splits');
  assert.deepEqual(km.rows.map((r) => r[0]), Array.from({ length: 14 }, (_, i) => `Km ${i + 1}`), '8.4 mi is 13.5 km: fourteen per-km splits');
  assert.ok(km.rows.every((r) => /^\d+:\d{2}\/km$/.test(r[1])), `a split pace is not per km: ${km.rows.map((r) => r[1])}`);
  assert.ok(km.rows.every((r) => /^\d+ bpm$/.test(r[2])), 'the split\'s heart rate is gone');
  const mi = cfUnitizePost(run, UF, LB).session.breakdown;
  assert.deepEqual(mi.rows, run.session.breakdown.rows, 'an imperial reader sees the authored mile splits');
  assert.equal(mi.label, 'Mile splits');
});

test('every demo post, metric: no split is labelled in miles', () => {
  for (const p of demoFeed()) {
    const rows = (cfUnitizePost(p, UF, KG).session || {}).breakdown;
    if (!rows || !Array.isArray(rows.rows)) continue;
    assert.ok(rows.rows.every((r) => !/^(miles?|mi)\b/i.test(String(r[0]))), `${p.who}: ${rows.rows.map((r) => r[0])}`);
  }
});

test('a distance is read in either unit the card shows it in', () => {
  assert.deepEqual(cfDistanceOf('13.5 km'), { distance: 13.5, unit: 'km' });
  assert.deepEqual(cfDistanceOf('8.4 mi'), { distance: 8.4, unit: 'mi' });
  assert.deepEqual(cfDistanceOf('1,234.5 km'), { distance: 1234.5, unit: 'km' });
  assert.equal(cfDistanceOf('2,000 m'), null, 'a swim\'s metres are not a distance to mark');
  assert.equal(cfDistanceOf('2,187 yd'), null);
  assert.equal(cfDistanceOf(null), null);
  // The session charts read it, and mark it in its own unit.
  assert.match(FEED, /const dist = cfDistanceOf\(distStat \? distStat\[1\] : null\);/);
  assert.equal((FEED.match(/distance=\{distance\} distUnit=\{distUnit\}/g) || []).length, 5, 'a session chart is not given the distance in the shown unit');
  assert.match(FEED, /\{mm\} \{distUnit \|\| "mi"\}<\/span>/);
  assert.doesNotMatch(FEED, /distanceMi/, 'a chart still reads its distance in miles only');
});
