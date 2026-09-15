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
import { readFileSync } from 'node:fs';
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
  const line = /const heat = a\.role === 'Trainer' \? '(#[0-9a-f]{6})' : a\.role === 'Nutritionist' \? \(t\.isLight \? '#[0-9a-f]{6}' : '(#[0-9a-f]{6})'\) : \(t\.isLight \? '#[0-9a-f]{6}' : '(#[0-9a-f]{6})'\)/.exec(APP);
  assert.ok(line, "the app's heat expression moved — re-derive CF_HEAT");
  const [, trainer, nutri, client] = line;
  const web = /const CF_HEAT = \{([^}]*)\}/.exec(stripComments(FEED));
  assert.ok(web, 'CF_HEAT is gone');
  const table = Object.fromEntries([...web[1].matchAll(/(\w+):\s*"(#[0-9a-f]{6})"/g)].map((m) => [m[1], m[2]]));
  assert.equal(table.TRAINER, trainer, 'the trainer accent drifted from the app');
  assert.equal(table.NUTRI, nutri, 'the nutritionist accent drifted from the app');
  assert.equal(table.CLIENT, client, 'the client accent drifted from the app');
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
  // And the Wall stays the CHIP, so the panel never carries two controls with
  // the same label. `tests/chat-feed-tab.test.mjs` pins the chip labels
  // themselves against the app's; this pins that the tab is not one of them.
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
  // and nothing failing anywhere. Both writers are read out of the app rather
  // than restated, so the day a third shape appears this fails.
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
