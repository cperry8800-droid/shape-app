// The website's wall plate, against the app's.
//
// ⚠ THE CLAIM THIS FILE EXISTS TO CHECK IS PARITY, NOT PRETTINESS. The chat
// bubble's Wall tab draws the app's record card (`BSActivityCard variant="wall"`)
// — a dot-matrix hero figure, a heat-tinted record pill, the two facts beside the
// figure, the stat grid, the HR zones bar and the trace. The port could not
// import any of it: the app's helpers live behind `useBS()` and `tr()`, and the
// one web module that already mirrors one of them (`shareCard.mjs`) is loaded by
// THREE pages while the bubble mounts on 35. So the helpers are copies, and a
// copy silently drifts. Everything below compares the copy against its original
// rather than pinning our own spelling of it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const FEED = readFileSync('public/newdesign/communityFeed.jsx', 'utf8');
const WIDGET = readFileSync('public/newdesign/chatWidget.jsx', 'utf8');
const APP = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');
const SHARE = readFileSync('public/newdesign/shareCard.mjs', 'utf8');

// Lift a function body out of source and make it callable.
// ⚠ IT SKIPS THE PARAMETER LIST. Counting braces from the first `{` after the
// name opens and closes on a DESTRUCTURED PARAMETER and hands back the
// signature — after which every assertion made against it is vacuously true.
// The length floor is what surfaces that, so it stays.
function lift(src, name) {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone — re-anchor this guard`);
  const open = src.indexOf('{', src.indexOf(')', at));
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  const body = src.slice(at, i + 1);
  assert.ok(body.length > 120, `${name} lifted only ${body.length} chars — the matcher read a signature, not a body`);
  return body;
}

// The glyph table, read out of either file as data.
function glyphs(src, name) {
  const at = src.indexOf(`const ${name} = {`);
  assert.ok(at >= 0, `${name} is gone`);
  const open = src.indexOf('{', at);
  let depth = 0, i = open;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}' && --depth === 0) break;
  }
  // eslint-disable-next-line no-new-func
  const table = new Function(`return ${src.slice(open, i + 1)}`)();
  assert.ok(Object.keys(table).length >= 10, `${name} parsed to ${Object.keys(table).length} glyphs — the read stopped matching`);
  return table;
}

test('the web matrix can spell exactly what the app\'s can, dot for dot', () => {
  // ⚠ THIS IS THE PARITY CLAIM. A figure is DRAWN rather than typeset, so "the
  // same number reads the same on both surfaces" is a statement about these
  // bitmaps and nothing else. A single flipped bit is a digit that renders as a
  // different digit on one surface only.
  const app = glyphs(APP, 'BS_DOT_GLYPHS');
  const web = glyphs(FEED, 'CF_DOT_GLYPHS');
  assert.deepEqual(Object.keys(web).sort(), Object.keys(app).sort(),
    'the two matrices no longer carry the same characters');
  for (const ch of Object.keys(app)) {
    assert.deepEqual(web[ch], app[ch], `the glyph for "${ch}" differs between the app and the web`);
  }
});

test('the renderability gate refuses what the app\'s refuses', () => {
  // ⚠ WITHOUT THIS GATE A COMPOUND VALUE DRAWS AS A DIFFERENT NUMBER. The
  // matrix DROPS what it cannot spell, silently, and the leftovers still look
  // like a reading — "8h 10m" becomes "8 10". The vectors are the app's own
  // (tests/wall-dot-numeral.test.mjs), so the two gates cannot diverge.
  const scope = {};
  // ⚠ THE TABLE HAS TO COME WITH THEM. Both helpers close over CF_DOT_GLYPHS,
  // so lifting the functions alone throws a ReferenceError from inside the
  // assertion — which reads as "the gate is broken" rather than "the harness is
  // incomplete".
  const table = JSON.stringify(glyphs(FEED, 'CF_DOT_GLYPHS'));
  // eslint-disable-next-line no-new-func
  new Function('S', `const CF_DOT_GLYPHS = ${table};\n${lift(FEED, 'cfDotChars')}\n${lift(FEED, 'cfDotRenderable')}\nS.chars=cfDotChars;S.ok=cfDotRenderable;`)(scope);
  for (const ok of ['245', '18.2', '1,240', '8:42', '2:38:14', '91', '-3', '1/2', '8 10']) {
    assert.ok(scope.ok(ok), `${ok} is fully representable and must be drawn`);
  }
  for (const bad of ['8h 10m', '2.4 · MO', '4.2 · HI', '178 spm', 'lb', '38 SWOLF']) {
    assert.ok(!scope.ok(bad), `${bad} must fall back to type, not be drawn as its digits`);
  }
  // Distinct from "every character is representable", which is vacuously true
  // of '' and would mount a zero-width svg where a figure belongs.
  for (const empty of ['', '   ', null, undefined]) assert.ok(!scope.ok(empty));
  // And the drop itself still drops rather than gapping.
  assert.equal(scope.chars('2a4b5').join(''), '245');
});

test('the unit splitter and the hero rule are the ones the other surfaces use', () => {
  const scope = {};
  // eslint-disable-next-line no-new-func
  new Function('S', `${lift(FEED, 'cfSplitUnit')}\n${lift(FEED, 'cfHeroStatIndex')}\nS.split=cfSplitUnit;S.hero=cfHeroStatIndex;`)(scope);
  // `bsSdSplitUnit`'s contract: only a short trailing token is a unit, so a
  // composite and a time stay whole and reach the gate above intact.
  assert.deepEqual(scope.split('245 lb'), { num: '245', unit: 'lb' });
  assert.deepEqual(scope.split('25:31'), { num: '25:31', unit: '' });
  assert.deepEqual(scope.split('2.4 · MO'), { num: '2.4 · MO', unit: '' });
  // The hero rule is driven against shareCard.mjs's — the ONE promotion rule
  // both web surfaces share, so the wall's figure and the share card's agree.
  const ref = {};
  // eslint-disable-next-line no-new-func
  new Function('S', `${lift(SHARE, 'bsHeroStatIndex')}\nS.hero=bsHeroStatIndex;`)(ref);
  // ⚠ THE FIRST TWO CASES CANNOT SEPARATE THE RULE FROM ITS INVERSE — in both,
  // neither arm's pattern matches a LABEL and both fall through to the same
  // "first measurement" fallback, so an inverted `isRun` scores identically. A
  // mutation round proved it: the inversion survived. The discriminating shape
  // is a row set carrying BOTH a load and a distance, where the two arms pick
  // different rows.
  const cases = [
    [[['Load', '100 kg'], ['Distance', '5 km']], true],
    [[['Load', '100 kg'], ['Distance', '5 km']], false],
    [[['Distance', '8.4 mi'], ['Avg pace', '7:42/mi']], true],
    [[['Time', '52 min'], ['Top set', '225 lb']], false],
    [[['Calories', '620'], ['Protein', '42 g']], false],
    [[], false],
  ];
  for (const [stats, isRun] of cases) {
    assert.equal(scope.hero(stats, isRun), ref.hero(stats, { isRun }),
      `the wall and the share card disagree about the hero of ${JSON.stringify(stats)}`);
  }
});

test('heat is the author\'s role, in the app\'s own values', () => {
  // The app colours the plate by WHO WROTE IT, not by the site accent — a
  // coach's record reads as a coach's at a glance. Read the app's expression
  // rather than restating it, so a change there fails here.
  // The app carries a LIGHT and a DARK value per role; the web table reads one paper
  // token per role, so the check is on both papers: the token's dark fallback must be
  // the app's dark value and its :root (light) value in dash.css the app's light one.
  const line = /const heat = a\.role === 'Trainer' \? '(#[0-9a-f]{6})' : a\.role === 'Nutritionist' \? \(t\.isLight \? '(#[0-9a-f]{6})' : '(#[0-9a-f]{6})'\) : \(t\.isLight \? '(#[0-9a-f]{6})' : '(#[0-9a-f]{6})'\)/.exec(APP);
  assert.ok(line, "the app's heat expression moved — re-derive CF_HEAT");
  const [, trainer, nutriLight, nutriDark, clientLight, clientDark] = line;
  const web = /const CF_HEAT = \{([^}]*)\}/.exec(stripComments(FEED));
  assert.ok(web, 'CF_HEAT is gone');
  const css = readFileSync(new URL('../public/newdesign/dash.css', import.meta.url), 'utf8');
  const root = /:root \{([\s\S]*?)\n\}/.exec(css);
  assert.ok(root, 'dash.css lost its :root block');
  const light = (tok) => { const m = new RegExp('\\s' + tok + ':\\s*(#[0-9a-f]{6});').exec(root[1]); return m && m[1]; };
  const table = Object.fromEntries([...web[1].matchAll(/(\w+):\s*"var\((--sh-[\w-]+), (#[0-9a-f]{6})\)"/g)].map((m) => [m[1], { token: m[2], dark: m[3], light: light(m[2]) }]));
  assert.equal(table.TRAINER && table.TRAINER.dark, trainer, 'the trainer accent drifted from the app');
  assert.equal(table.TRAINER && table.TRAINER.light, trainer, 'the trainer accent drifted from the app on the light paper');
  assert.equal(table.NUTRI && table.NUTRI.dark, nutriDark, 'the nutritionist accent drifted from the app');
  assert.equal(table.NUTRI && table.NUTRI.light, nutriLight, 'the nutritionist accent drifted from the app on the light paper');
  assert.equal(table.CLIENT && table.CLIENT.dark, clientDark, 'the client accent drifted from the app');
  assert.equal(table.CLIENT && table.CLIENT.light, clientLight, 'the client accent drifted from the app on the light paper');
});

test('the plate never hands a hex alpha to an rgba() colour', () => {
  // ⚠ THE CLASS THAT ERASED EVERY PAGE BACKGROUND (2026-09-01): a hex alpha
  // appended to an `rgba()` string is not a colour, and CSS drops the WHOLE
  // declaration rather than the layer. `cfHexA` returns its input unchanged for
  // anything that is not 6-digit hex, so the only safe arguments are hex — and
  // this file's other tokens (the inline "rgba(242,237,228,…)" literals) are not.
  const src = stripComments(FEED);
  const args = [...src.matchAll(/cfHexA\(\s*([^,]+),/g)].map((m) => m[1].trim());
  assert.ok(args.length >= 10, `read only ${args.length} cfHexA call sites — the sweep stopped matching`);
  for (const a of args) {
    assert.doesNotMatch(a, /rgba|rgb\(/, `cfHexA is handed an rgba() colour: ${a}`);
  }
});

test('the six per-kind blocks the plate replaced are gone, and nothing renders them', () => {
  // Dead code that reads as live is worse than no code — and these four in
  // particular carried unguarded reads (`p.duration.toUpperCase()`,
  // `p.coach.split(" ")`, `p.earned.toLocaleString()`) that throw on a post
  // missing the field, in a directory with NO error boundary.
  const src = stripComments(FEED);
  for (const name of ['PRStat', 'WorkoutStat', 'RunStat', 'TierStat', 'MealStat', 'StreakStat']) {
    assert.doesNotMatch(src, new RegExp(`function ${name}\\(`), `${name} is still declared`);
    assert.doesNotMatch(src, new RegExp(`<${name}[\\s/>]`), `${name} is still rendered`);
  }
  assert.match(src, /<CfWallPlate\b/, 'the wall plate is not rendered');
  assert.match(src, /<CfWallEvidence\b/, 'the evidence block is not rendered');
});

test('the wall helpers are self-contained — they may not reach for ShapeShareCard', () => {
  // ⚠ `window.ShapeShareCard` IS ON THREE PAGES AND THE BUBBLE IS ON 35. A
  // plate that resolved its hero through that module would draw a figure on the
  // app shells and nothing on the other thirty-two, with no error anywhere.
  const src = stripComments(FEED);
  const from = src.indexOf('const CF_DOT_GLYPHS');
  const to = src.indexOf('function CommunityFeed(');
  assert.ok(from >= 0 && to > from, 'the wall block moved — re-anchor this guard');
  assert.doesNotMatch(src.slice(from, to), /ShapeShareCard/,
    'the wall block reaches for a module 32 of its 35 hosts do not load');
});

test('the chat tab keeps the app\'s own name for this segment, and its id', () => {
  // ⚠ DERIVED FROM THE APP'S CATALOG, NOT PINNED. The label was briefly changed
  // to "Wall" on 2026-09-15 and the owner reverted it — "leave it as feed" —
  // because the app's top segment IS Feed and the Wall is the chip inside it,
  // so a tab called Wall put two controls reading "Wall" in one panel. Reading
  // the catalog rather than restating "Feed" means the day the app renames its
  // segment, this fails instead of the two surfaces drifting apart in silence.
  // ⚠ AND THE CATALOG IS WHAT RENDERS, not the `defaultValue` at the app's call
  // site — this repo has shipped a JSX default that disagreed with the catalog
  // before, and the catalog won.
  // ⚠ THE CATALOG IS FLAT-KEYED — "tab.feed", not { tab: { feed } }. Reading it
  // as nested returns undefined and the assertion then reads as "the app
  // renamed its segment" while the app has not moved at all.
  const cat = JSON.parse(readFileSync('mobile-app/src/i18n/catalogs/en/feed.json', 'utf8'));
  const segment = cat['tab.feed'];
  const chip = cat['tab.wall'];
  assert.equal(typeof segment, 'string', 'the app no longer keys its Feed segment at feed:tab.feed');
  assert.equal(typeof chip, 'string', 'the app no longer keys its Wall chip at feed:tab.wall');
  assert.notEqual(segment, chip, 'the app now calls its segment and its chip the same thing');

  const tab = /const FEED_TAB = \{[\s\S]*?\};/.exec(stripComments(WIDGET));
  assert.ok(tab, 'FEED_TAB moved — re-anchor this guard');
  // The id is the tab's ADDRESS — __openChat(who, "feed"), DASH_INBOX_ROUTES.feed
  // and the positional record migration all key on it. Only a label may move.
  assert.match(tab[0], /id: "feed"/, 'the tab id changed, which orphans every deep link to it');
  assert.match(tab[0], new RegExp(`label: "${segment}"`),
    `the tab label no longer matches the app's own name for this segment (${segment})`);
  assert.match(tab[0], /feed: true/, 'the `feed` flag is what the body split and the record migration key on');
  // And the tab never takes the Wall's name. ⚠ THE CHIP ROW ITSELF IS GONE from
  // the web (owner: "dont need client and community tabs here in chat bubble …
  // repetitive" — the bubble carries those audiences as TABS, which the app's
  // Chat does not), so this no longer guards against two controls in one panel;
  // it guards the reason the owner gave for reverting the rename, which is that
  // the app's top segment is Feed. `tests/chat-feed-tab.test.mjs` pins the
  // removal and the write-side channel that outlived it.
  assert.doesNotMatch(tab[0], new RegExp(`label: "${chip}"`),
    'the tab took the chip\'s name, so two controls in one panel read the same');
});

// ── The Codex round on aab608c: three findings, each replayed as its own guard ──
// Every one was real, and every one is a place the port silently lost data that
// the app itself reads. Pinned here rather than left green-after-the-fix.

test('both workoutStats schemas reach the plate — the app writes two', () => {
  // ⚠ P1. `shapeBackend.js:3141` publishes a live session's rows as
  // { label, value }; the app's Log-activity composer (:14060) and the
  // Post-a-PR sheet (:20166) write { l, v }. Reading only the first dropped
  // every row from a post made in the app BY HAND — no hero, no facts, no grid,
  // and nothing failing anywhere.
  //
  // ⚠ THIS BLOCK ONCE CLAIMED "so the day a third shape appears this fails".
  // IT DID NOT, and the claim was repeated in the commit message and the PR
  // body (Codex, #2099 round 2). Asserting that the two KNOWN writers still
  // exist proves nothing about a THIRD: both keep existing when it arrives, so
  // a producer emitting { name, val } would be dropped by mapPost with the
  // suite green. What follows still earns its place — it pins each known
  // writer's shape, so a shape CHANGE at either fails here — but the
  // unrecognised-producer invariant is enforced by the derived guard below,
  // not by this test.
  const app = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');
  assert.match(app, /\.map\(\(\[l, v\]\) => \(\{ l, v: String\(v \|\| ''\)\.trim\(\) \}\)\)/,
    "the app's composer no longer writes { l, v } — re-derive this normalisation");
  const backend = readFileSync('mobile-app/src/services/shapeBackend.js', 'utf8');
  assert.match(backend, /workoutStats\.push\(\{ label: /,
    'shapeBackend no longer writes { label, value } — re-derive this normalisation');

  const mapper = /const mapPost = \(p, uid\) => \{[\s\S]*?\n    \};/.exec(stripComments(FEED));
  assert.ok(mapper, 'mapPost moved — re-anchor this guard');
  const ws = /const wstats = [\s\S]*?\n      \}\)\.filter\(Boolean\) : \[\];/.exec(mapper[0]);
  assert.ok(ws, 'the workoutStats normalisation moved — re-anchor this guard');
  // eslint-disable-next-line no-new-func
  const read = new Function('m', `${ws[0]}\nreturn wstats;`);
  assert.deepEqual(read({ workoutStats: [{ label: 'Avg HR', value: '168 bpm' }] }), [['Avg HR', '168 bpm']],
    'the { label, value } shape (a live session) no longer reaches the plate');
  assert.deepEqual(read({ workoutStats: [{ l: 'Top set', v: '315 lb' }] }), [['Top set', '315 lb']],
    'the { l, v } shape (the app composer / Post-a-PR) no longer reaches the plate');
  // An empty value is not a reading — a blank grid cell says nothing.
  assert.deepEqual(read({ workoutStats: [{ l: 'Top set', v: '   ' }, { label: 'X', value: '' }] }), []);
  assert.deepEqual(read({ workoutStats: [null, 'nope', 7] }), []);
  assert.deepEqual(read({}), []);
});

// ── The unrecognised-producer invariant, enforced rather than asserted ──────
// Codex, #2099 round 2 (P2). The guard above proves the two KNOWN writers still
// exist, which is silent about a third. This one DERIVES the writers: every
// production file that mentions `workoutStats`, every identifier that flows into
// it (including the local accumulator of a function called to build it), and
// every two-key object literal pushed into or constructed as one of those. Then
// it closes the loop — each derived shape is fed to the SHIPPED normaliser and
// must reach the plate. A writer added in a new integration route is covered
// with nobody remembering this file exists.
//
// Measured when written: 6 writers across 5 files, 15 literals, 2 shapes —
// shapeBackend.js (live session), the app's Log-activity composer and Post-a-PR
// sheet, and the Garmin, Strava and Whoop sync routes. Four of those six were
// server-side and no guard had ever looked at them.
function deriveWorkoutStatsWriters() {
  const walk = (dir, out = []) => {
    for (const e of readdirSync(dir)) {
      const rel = `${dir}/${e}`;
      if (statSync(rel).isDirectory()) { if (e !== 'node_modules') walk(rel, out); }
      else if (/\.(?:m?js|jsx|ts|tsx)$/.test(e)) out.push(rel);
    }
    return out;
  };
  // ⚠ BRACE-AWARE, AND THAT IS LOAD-BEARING. A stat value is routinely a
  // template literal (`${mins} min`), so a [^{}]* body stops at the first `${`
  // and the literal is MISSED — which is worse than a false positive, because
  // the sweep then reports clean. Measured: the naive form found 11 of 15 and
  // skipped shapeBackend's writer entirely.
  const objBody = (src, open) => {
    let d = 0;
    for (let i = open; i < src.length; i++) {
      if (src[i] === '{') d++;
      else if (src[i] === '}') { d--; if (!d) return src.slice(open + 1, i); }
    }
    return null;
  };
  // Top-level keys only, shorthand included (`{ label, value }` — how the Whoop
  // and Strava helpers push).
  const keysOf = (body) => {
    const parts = []; let d = 0, cur = '';
    for (const ch of body) {
      if ('{[('.includes(ch)) d++;
      else if ('}])'.includes(ch)) d--;
      if (ch === ',' && d === 0) { parts.push(cur); cur = ''; } else cur += ch;
    }
    parts.push(cur);
    return parts.map((x) => x.trim()).filter(Boolean)
      .map((x) => { const i = x.indexOf(':'); return (i === -1 ? x : x.slice(0, i)).trim(); })
      .filter((k) => /^[A-Za-z_$][\w$]*$/.test(k));
  };
  const lineOf = (src, i) => src.slice(0, i).split('\n').length;

  const files = ['mobile-app/src', 'src'].flatMap((d) => walk(d))
    .filter((f) => readFileSync(f, 'utf8').includes('workoutStats'));
  const out = [];
  for (const f of files) {
    const src = readFileSync(f, 'utf8');
    const sinks = [{ name: 'workoutStats', at: null }];
    for (const m of src.matchAll(/workoutStats\s*:\s*([A-Za-z_$][\w$]*)\s*(?=[,}\n])/g)) {
      sinks.push({ name: m[1], at: lineOf(src, m.index) });
    }
    // `workoutStats: buildActivityStats(activity)` — follow the call to the
    // accumulator the function pushes into.
    for (const m of src.matchAll(/workoutStats\s*:\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
      const b = new RegExp(`function\\s+${m[1]}\\b[\\s\\S]*?\\n\\}`, 'm').exec(src);
      if (b) for (const a of b[0].matchAll(/const\s+([A-Za-z_$][\w$]*)\s*:[^=]*=\s*\[\s*\]/g)) {
        sinks.push({ name: a[1], at: lineOf(src, b.index + a.index) });
      }
    }
    for (const s of sinks) {
      // ⚠ NO `pat.exec()` PROBE BEFORE THIS LOOP. A /g regex advances lastIndex
      // and matchAll inherits it, so a "does it match at all" guard silently
      // eats the FIRST match — measured: it lost Garmin's first push, and both
      // the Whoop and Strava writers entirely.
      const pat = new RegExp(`\\b${s.name}\\s*(?:\\.push\\(\\s*|[^=\\n]{0,40}=\\s*\\[\\s*|[^\\n]{0,80}=>\\s*\\()\\{`, 'g');
      for (const m of src.matchAll(pat)) {
        const open = src.indexOf('{', m.index + m[0].length - 1);
        const body = objBody(src, open);
        if (body === null) continue;
        const ln = lineOf(src, m.index);
        // A derived sink can carry a generic name (`stats`, `out`) that also
        // exists elsewhere in a 24k-line file, so scope it to its own region.
        if (s.at !== null && Math.abs(ln - s.at) > 200) continue;
        const keys = keysOf(body);
        if (keys.length !== 2) continue;
        out.push({ file: f, line: ln, keys });
      }
    }
  }
  return out;
}

test('every production writer of workoutStats emits a shape the plate can read', () => {
  const writers = deriveWorkoutStatsWriters();

  // VACUITY. A sweep that stops matching finds nothing and passes every
  // "is this shape readable" assertion below on an empty set. These floors are
  // what make a silent regression in the extractor fail instead.
  //
  // ⚠ THE TWO FLOORS ARE MUTUALLY REDUNDANT, AND THAT IS MEASURED RATHER THAN
  // ASSUMED. Removing EITHER one alone is a no-op — a mutation that does so
  // survives, because the other still fires. Removing BOTH, with the extractor
  // degraded, goes GREEN on a sweep that has silently lost a third of the
  // writers. So neither is decoration: together they are the only thing between
  // a broken extractor and a passing suite, and a single-mutation survivor here
  // is a fact about the design rather than a gap in it.
  const files = new Set(writers.map((w) => w.file));
  assert.ok(writers.length >= 12,
    `the writer sweep found only ${writers.length} stat literals (15 when written) — the extractor stopped matching`);
  assert.ok(files.size >= 5,
    `the writer sweep reached only ${files.size} files (5 when written) — the extractor stopped matching`);
  const shapes = new Set(writers.map((w) => [...w.keys].sort().join(',')));
  // POSITIVE CONTROL: both known shapes must still be REACHED. Without this the
  // floors above are satisfied by { label, value } alone (11 of the 15), and an
  // extractor blind to the app's { l, v } writers would read as clean.
  assert.ok(shapes.has('label,value'), 'the sweep no longer reaches any { label, value } writer');
  assert.ok(shapes.has('l,v'), 'the sweep no longer reaches any { l, v } writer');

  // THE INVARIANT. Every shape any production writer emits must reach the plate.
  // Driven through the SHIPPED normaliser, not compared against a restated list
  // — so a third producer fails here rather than being silently dropped.
  const mapper = /const mapPost = \(p, uid\) => \{[\s\S]*?\n    \};/.exec(stripComments(FEED));
  assert.ok(mapper, 'mapPost moved — re-anchor this guard');
  const ws = /const wstats = [\s\S]*?\n      \}\)\.filter\(Boolean\) : \[\];/.exec(mapper[0]);
  assert.ok(ws, 'the workoutStats normalisation moved — re-anchor this guard');
  // eslint-disable-next-line no-new-func
  const read = new Function('m', `${ws[0]}\nreturn wstats;`);

  for (const shape of shapes) {
    const [a, b] = shape.split(',');
    const row = { [a]: 'L', [b]: 'V' };
    const got = read({ workoutStats: [row] });
    const where = writers.filter((w) => [...w.keys].sort().join(',') === shape)
      .map((w) => `${w.file}:${w.line}`).join(', ');
    assert.equal(got.length, 1,
      `a production writer emits { ${a}, ${b} } and mapPost drops it, so every row from it ` +
      `vanishes from the plate with nothing failing anywhere. Written at: ${where}`);
    // Order-agnostic: mapPost reads by KEY, so a writer spelling the pair the
    // other way round is fine in production and must not fail here.
    assert.deepEqual([...got[0]].sort(), ['L', 'V'], `the { ${a}, ${b} } row reached the plate malformed`);
  }
});

test("a member's FIRST record still says New PR — it has a marker and no delta", () => {
  // ⚠ P1. `delta` exists only against a PRIOR best, so BSWallPostSheet stamps
  // `metrics.pr: true` for a first accepted record and no delta at all
  // (iosAppBroadsheetClient.jsx:20223). Deciding the pill on the delta alone
  // drew a genuine first record as an ordinary load — the exact defect the app
  // had already fixed for itself.
  const app = readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');
  assert.match(app, /metrics: \{ pr: true, \.\.\.\(trueGain != null \? \{ delta: /,
    'the app no longer stamps pr:true without a delta — re-derive this rule');
  assert.match(app, /a\.pr === true/, "the app's card no longer reads a.pr — re-derive this rule");

  const s = stripComments(FEED);
  assert.match(s, /pr: m\.pr === true,/, 'mapPost no longer lifts the first-record marker');
  assert.match(s, /const isPR = p\.kind === "pr" \|\| p\.pr === true \|\| /,
    'the pill no longer reads the first-record marker, so a first PR loses its pill');
});

// ── The three rules #2099 diverged on, reversed and pinned ──────────────────
// Each was a deliberate STATED divergence from the app, each shipped, and the
// owner reported the result as "still not replicating what is on app on wall
// feed". They are the app's rules now, repetition and all — so each is checked
// from BOTH ends: the app still does it (or this guard is describing a rule
// that has moved), and the web's shipped model produces the same answer.
function wallModel() {
  const scope = {};
  // ⚠ `cfHeat` AND `sessArr` ARE STUBBED, NOT LIFTED — both are one-liners well
  // under lift()'s body floor, and neither is what these three rules are about
  // (heat is the author's role; sessArr is an array guard). Everything the rules
  // actually run through is the shipped source.
  new Function('S', `
    const cfHeat = () => '#34d6c5';
    const sessArr = (v) => (Array.isArray(v) && v.length > 1) ? v : null;
    ${lift(FEED, 'buildZonesFromDurations')}
    ${lift(FEED, 'cfHeroStatIndex')}
    ${lift(FEED, 'cfWallStats')}
    ${lift(FEED, 'cfWallModel')}
    S.model = cfWallModel;
  `)(scope);
  return scope.model;
}

test('a post with no record still carries a pill — the measure and its figure', () => {
  // ⚠ THE APP PILLS EVERY CARD. This shipped suppressed: the pill was treated as
  // a RECORD claim, so an ordinary workout drew none at all. Reversed on the
  // owner's call.
  assert.match(APP, /return `\$\{measure\}\$\{heroStat\[1\] \? ` · \$\{heroStat\[1\]\}` : ''\}\$\{tail\}`;/,
    "the app's wallPill no longer falls back to measure · figure — re-derive the web rule");
  const model = wallModel();
  // The demo workout, field for field.
  const w = model({ kind: 'workout', role: 'Peak · 6,108', duration: '52 min', exercises: 6, rpe: 8.5 });
  assert.equal(w.pill, 'Time · 52 min', 'a workout with no record draws no pill');
  // And a first-record PR still leads with New PR rather than the measure.
  const pr = model({ kind: 'pr', role: 'Tempo · 1,412', lift: 'Bench Press', load: '225 lb', reps: '5 × 5', delta: '+10 lb' });
  assert.equal(pr.pill, 'New PR · Bench Press · +10 lb', 'the PR pill lost its lift or its gain');
});

test('a PR pill falls back to the measure when nothing names the lift', () => {
  // ⚠ A LIVE PR NEVER NAMES ONE — `mapPost` sets no `lift`, exactly as the app
  // blanks it (`a.real ? '' : a.lift`). Without the fallback every real PR read
  // "New PR · +0:06/mi" where the app reads "New PR · Distance · +0:06/mi".
  assert.match(APP, /\$\{lift \? ` · \$\{lift\}` : \(measure \? ` · \$\{measure\}` : ''\)\}/,
    "the app's PR pill no longer falls back to the measure — re-derive the web rule");
  const model = wallModel();
  const m = model({ kind: 'pr', role: 'Tempo · 1,412', load: '225 lb', reps: '5 × 5', delta: '+10 lb' });
  assert.equal(m.pill, 'New PR · Top set · +10 lb', 'a lift-less PR lost the measure from its pill');
});

test('the stat grid is the whole set, not what the hero and facts left over', () => {
  // ⚠ THE APP'S `detailStats` IS UNFILTERED and the card renders its first six.
  // This shipped as `rest.slice(2, 8)`, which on a two-stat PR left NOTHING and
  // drew no grid at all — the emptiest card on the board was the record.
  const s = stripComments(APP);
  assert.match(s, /const detailStats = uStats\(a\.real \? \(a\.fullStats \|\| statsRaw\) : \(a\.stats \|\| statsRaw\)\);/,
    "the app's detailStats is no longer the whole stat set — re-derive the web rule");
  assert.match(s, /\{detailStats\.slice\(0, 6\)\.map\(/,
    'the app no longer renders detailStats unfiltered — re-derive the web rule');
  const model = wallModel();
  const pr = model({ kind: 'pr', role: 'Tempo · 1,412', lift: 'Bench Press', load: '225 lb', reps: '5 × 5' });
  assert.deepEqual(pr.detail, [['Top set', '225 lb'], ['Reps', '5 × 5']],
    'the two-stat PR draws an empty grid again');
  // And the hero IS in it, which is the part that was filtered out.
  assert.deepEqual(pr.heroStat, ['Top set', '225 lb']);
  assert.ok(pr.detail.some(([k]) => k === pr.heroStat[0]),
    'the grid is filtering the hero out again');
  // Six is the cap, taken off the FRONT — a nine-stat run shows the first six.
  const run = model({ kind: 'run', role: 'Tempo · 980', session: { stats: [
    ['Distance', '8.4 mi'], ['Avg pace', '7:42/mi'], ['Best pace', '7:18/mi'], ['Time', '1:04:42'],
    ['Avg HR', '156 bpm'], ['Max HR', '174 bpm'], ['Cadence', '176 spm'], ['Elevation', '412 ft'], ['Calories', '1,020'],
  ] } });
  assert.equal(run.detail.length, 6, 'the grid cap moved off the app\'s six');
  assert.deepEqual(run.detail[0], ['Distance', '8.4 mi'], 'the grid no longer starts at the first stat');
});

test("a demo PR's headline is composed the way the app composes it", () => {
  // ⚠ THE APP'S DEMO PRs CARRY NO `title` EITHER — it BUILDS one
  // (iosAppBroadsheetClient.jsx:18957). A bare lift is a divergence, not a
  // simplification: the plate then reads "Bench Press." where the app reads
  // "Bench Press — new PR." Derived from the app's own expression, so the day it
  // rewords the suffix this fails rather than the two drifting in silence.
  const m = /a\.kind === 'pr' \? `\$\{a\.lift\}([^`]*)`/.exec(stripComments(APP));
  assert.ok(m, "the app no longer composes a demo PR's title — re-derive the web rule");
  const suffix = m[1];
  assert.ok(suffix.trim().length > 2,
    `the app's PR title suffix parsed as "${suffix}" — the read stopped matching`);
  assert.ok(stripComments(FEED).includes('`${p.lift}' + suffix + '`'),
    `the web no longer composes a demo PR's headline as the app does (suffix "${suffix}")`);
});

test('a note post with nothing measured draws no pill and no grid', () => {
  // The honest-absent half of the same rule: restoring the fallbacks must not
  // start inventing a pill for a post that measured nothing.
  const model = wallModel();
  const n = model({ kind: 'post', role: 'Peak · 6,108', body: 'Race day Sunday.' });
  assert.equal(n.pill, '', 'a plain note grew a pill');
  assert.equal(n.heroStat, null);
  assert.deepEqual(n.detail, []);
});

test('an incomplete HR zone distribution is refused, not zero-filled', () => {
  // ⚠ P2. `Number(undefined) || 0` cannot tell a zone nobody sent from a zone
  // genuinely spent at 0 — and because these are percentages of a SUM, dropping
  // one shortens the denominator and inflates every other segment. The app
  // refuses the whole distribution (bsBuildZones); the web copy zero-filled it,
  // and this PR is what draws it on the wall.
  const zb = /function buildZonesFromDurations\(m\) \{[\s\S]*?\n\}/.exec(FEED);
  assert.ok(zb, 'buildZonesFromDurations moved — re-anchor this guard');
  // eslint-disable-next-line no-new-func
  const build = new Function(`${zb[0]}\nreturn buildZonesFromDurations;`)();
  const full = { zone_one_milli: 1, zone_two_milli: 1, zone_three_milli: 1, zone_four_milli: 1, zone_five_milli: 1 };
  assert.equal(build({ zoneDurations: full }).length, 5, 'a complete distribution must still render');
  // A real zero is a real reading and keeps its place.
  assert.equal(build({ zoneDurations: { ...full, zone_five_milli: 0 } }).length, 5);
  for (const bad of [undefined, null, '', 'x', NaN, -1]) {
    const zd = { ...full }; zd.zone_five_milli = bad;
    assert.equal(build({ zoneDurations: zd }), null,
      `an unreadable Z5 (${JSON.stringify(bad)}) must refuse the whole bar, not publish it as 0%`);
  }
  const { zone_five_milli, ...missing } = full;
  assert.equal(build({ zoneDurations: missing }), null, 'an absent Z5 must refuse the whole bar');
});
