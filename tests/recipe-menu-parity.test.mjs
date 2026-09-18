// THE MENU, ON BOTH SURFACES — the website's copy and the app's must group the
// same recipe into the same course and put the same three dishes on the board on
// the same day. Owner pick 2026-09-15 (docs/REVIEW-2026-09-15-about-and-kitchen.md
// §K3), built twice because the two surfaces share no code: the website page is a
// classic browser Babel script reading globals, the app is a Vite ES module. So
// the RULES are duplicated by necessity, and a duplicate drifts.
//
// ⚠ THIS DRIVES BOTH IMPLEMENTATIONS RATHER THAN COMPARING THEIR TEXT. A regex
// over "m > 15 && m <= 30" pins a spelling, and a spelling can be rewritten
// correctly (or wrongly) without the guard noticing either way. Each side's
// declarations are lifted out of its own shipping file and EXECUTED over the real
// catalog and over a year of day seeds.
//
// ⚠ AND THE COPY IS COMPARED TOO, not just the arithmetic. The website types its
// course headings into KM_COURSES; the app keys them. Two surfaces that agree
// about which recipes are in a course and disagree about what the course is
// CALLED is the same drift one level up.
//
// What is deliberately NOT compared: the search haystack. The two catalogs carry
// ingredients in different shapes — the website's parity copy holds plain strings
// and the app holds `{n, m, k?}` objects (shapeKitchenData.js) — so the app maps
// where the website spreads. Same rule, different data, and
// tests/recipe-web-mobile-parity.test.mjs is what keeps the DATA in step.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const WEB = readFileSync(path.join(ROOT, 'public/newdesign/recipesPage.jsx'), 'utf8');
const APP = readFileSync(path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8');
const EN = JSON.parse(readFileSync(path.join(ROOT, 'mobile-app/src/i18n/catalogs/en/nutrition.json'), 'utf8'));
const DATA = await import(pathToFileURL(path.join(ROOT, 'mobile-app/src/broadsheet/shapeKitchenData.js')).href);
const { SHAPE_KITCHEN_RECIPES, bsRecipeAttribution } = DATA;

// Lift a top-level declaration by name, brace-matched from its own opening brace.
// ⚠ It starts counting at the brace that opens the BODY, not at the first `{` in
// the text — a destructured parameter opens and closes on the parameter list and
// hands back a signature, after which every assertion made against it is
// vacuously true. This repo has paid for that twice (#2032, and again in the
// radio guards), so the scan skips a parameter list explicitly.
function lift(src, decl) {
  const at = src.indexOf(decl);
  assert.notEqual(at, -1, `could not find \`${decl}\` — this guard is reading nothing`);
  let i = at + decl.length;
  if (src[i - 1] === '(' || src.slice(at, i).endsWith('(')) {
    let depth = 1;
    while (depth > 0) { const c = src[i++]; if (c === '(') depth += 1; else if (c === ')') depth -= 1; }
  }
  const open = src.indexOf('{', i);
  assert.notEqual(open, -1, `no body for \`${decl}\``);
  let depth = 0;
  let j = open;
  for (; j < src.length; j += 1) {
    if (src[j] === '{') depth += 1;
    else if (src[j] === '}') { depth -= 1; if (depth === 0) break; }
  }
  const body = src.slice(at, j + 1);
  assert.ok(body.length > decl.length + 8, `\`${decl}\` lifted only ${body.length} characters — the matcher read a signature`);
  return body;
}
// An array/number declaration, taken to the end of its statement.
function liftConst(src, name) {
  const re = new RegExp(`^const ${name} = [\\s\\S]*?;$`, 'm');
  const m = re.exec(src);
  assert.ok(m, `could not find \`const ${name}\` — this guard is reading nothing`);
  return m[0];
}

// Build one side's rules by evaluating its own lifted source.
function build(src, n) {
  const parts = [
    liftConst(src, n.PAGE), liftConst(src, n.SLACK), lift(src, `function ${n.paged}(`),
    lift(src, `function ${n.minutes}(`), liftConst(src, n.COURSES),
    lift(src, `function ${n.courseIndex}(`), lift(src, `function ${n.sortByTime}(`),
    lift(src, `function ${n.daySeed}(`), lift(src, `function ${n.boardPicks}(`),
  ].join('\n');
  // `boardPicks` reads `isAuthored` from its own scope; the attribution helper is
  // the same rule on both sides (recipes.jsx:28 and shapeKitchenData.js:1001), so
  // it is INJECTED rather than lifted twice — what is under test here is the
  // picking, not the crediting.
  // eslint-disable-next-line no-new-func
  const make = new Function(n.isAuthored, `${parts}\nreturn { PAGE: ${n.PAGE}, SLACK: ${n.SLACK}, paged: ${n.paged}, minutes: ${n.minutes}, COURSES: ${n.COURSES}, courseIndex: ${n.courseIndex}, sortByTime: ${n.sortByTime}, daySeed: ${n.daySeed}, boardPicks: ${n.boardPicks} };`);
  const isAuthored = (r) => { const a = bsRecipeAttribution(r); return !!a && a.kind === 'authored'; };
  return make(isAuthored);
}

const web = build(WEB, {
  PAGE: 'KM_PAGE', SLACK: 'KM_PAGE_SLACK', paged: 'kmPaged', minutes: 'recipeMinutes',
  COURSES: 'KM_COURSES', courseIndex: 'kmCourseIndex', sortByTime: 'kmSortByTime',
  daySeed: 'kmDaySeed', boardPicks: 'kmBoardPicks', isAuthored: 'kmIsAuthored',
});
const app = build(APP, {
  PAGE: 'BS_KM_PAGE', SLACK: 'BS_KM_PAGE_SLACK', paged: 'bsKmPaged', minutes: 'bsRecipeMinutes',
  COURSES: 'BS_KM_COURSES', courseIndex: 'bsKmCourseIndex', sortByTime: 'bsKmSortByTime',
  daySeed: 'bsKmDaySeed', boardPicks: 'bsKmBoardPicks', isAuthored: 'bsKmIsAuthored',
});

test('both Menus read a cooking time off the same string the same way', () => {
  const times = [...new Set(SHAPE_KITCHEN_RECIPES.map((r) => r.time))];
  assert.ok(times.length >= 20, `only ${times.length} distinct time strings — the catalog stopped loading`);
  // The shapes the catalog carries, plus the shapes it does NOT, so the guard is
  // about the RULE and not about today's 24 values.
  const extra = ['1 hr', '1 hr 5 min', '2 hr 30 min', '90 min', '0 min', 'overnight', '', 'a while', '1.5 hr'];
  const disagree = [];
  for (const s of [...times, ...extra]) {
    const a = web.minutes({ time: s });
    const b = app.minutes({ time: s });
    if (a !== b) disagree.push(`${JSON.stringify(s)}: web ${a} vs app ${b}`);
  }
  assert.deepEqual(disagree, [], 'the two Menus disagree about how long a recipe takes');
  // Vacuity: a matcher that returned null for everything would agree perfectly.
  assert.equal(app.minutes({ time: '1 hr 15 min' }), 75, 'the app parser is not reading hours and minutes together');
  assert.equal(app.minutes({ time: 'overnight' }), null, 'an unreadable time must be null, not 0');
});

test('every catalog recipe has a readable time and lands in exactly one course', () => {
  const unreadable = SHAPE_KITCHEN_RECIPES.filter((r) => app.courseIndex(r) === -1);
  assert.deepEqual(unreadable.map((r) => `${r.title} (${r.time})`), [],
    'a recipe has no readable time — it would vanish from a page whose whole structure is by time');
  for (const r of SHAPE_KITCHEN_RECIPES) {
    const hits = app.COURSES.filter((c) => c.test(app.minutes(r)));
    assert.equal(hits.length, 1, `"${r.title}" (${r.time}) matches ${hits.length} courses — the bands do not partition`);
  }
});

test('both Menus put the same recipe in the same course, and page at the same row', () => {
  assert.deepEqual(app.COURSES.map((c) => c.key), web.COURSES.map((c) => c.key), 'the course keys diverged');
  const disagree = SHAPE_KITCHEN_RECIPES.filter((r) => app.courseIndex(r) !== web.courseIndex(r));
  assert.deepEqual(disagree.map((r) => `${r.title} (${r.time})`), [], 'the two Menus grouped a recipe differently');
  // The band edges are half-open on the TOP, so 15 lands in course 0 and 60 in
  // course 2 — the two boundaries a rewrite is most likely to get wrong.
  for (const [mins, idx] of [[1, 0], [15, 0], [16, 1], [30, 1], [31, 2], [60, 2], [61, 3], [240, 3]]) {
    const hit = app.COURSES.findIndex((c) => c.test(mins));
    assert.equal(hit, idx, `${mins} minutes lands in course ${hit}, expected ${idx}`);
    assert.equal(web.COURSES.findIndex((c) => c.test(mins)), idx, `the website puts ${mins} minutes elsewhere`);
  }
  assert.equal(app.PAGE, web.PAGE, 'the two Menus page at different row counts');
  assert.equal(app.SLACK, web.SLACK, 'the two Menus use different paging slack');
  for (let n = 0; n <= 40; n += 1) {
    assert.equal(app.paged(n), web.paged(n), `the two Menus disagree about paging at ${n} rows`);
  }
  assert.equal(app.paged(app.PAGE + app.SLACK), false, 'a door that hides only the slack is a tap that buys nothing');
  assert.equal(app.paged(app.PAGE + app.SLACK + 1), true, 'the paging door never opens');

  // ⚠ AND THE ROW ORDER, NOT ONLY THE PAGING BOOLEANS — CODEX'S FINDING, AND A
  // MUTATION PROVED IT BEFORE IT WAS FIXED. Reversing the app's tie-break for
  // SOURCED recipes only leaves course membership identical, leaves every
  // `paged(n)` identical, and never reaches the board (which filters to authored
  // dishes first), so the whole file went GREEN while the two surfaces listed
  // different rows above "Show all". What a reader sees is the ORDER, so that is
  // what has to agree: the full course and, separately, the first page of it,
  // because a divergence past row 12 is invisible until somebody opens the door.
  for (let i = 0; i < app.COURSES.length; i += 1) {
    const a = app.sortByTime(SHAPE_KITCHEN_RECIPES.filter((r) => app.courseIndex(r) === i)).map((r) => r.title);
    const b = web.sortByTime(SHAPE_KITCHEN_RECIPES.filter((r) => web.courseIndex(r) === i)).map((r) => r.title);
    assert.deepEqual(a, b, `the two Menus order course ${app.COURSES[i].key} differently`);
    // Vacuity: an empty course compares two empty arrays and is about nothing.
    assert.ok(a.length > 0, `course ${app.COURSES[i].key} is empty — this comparison is about nothing`);
  }
  // ⚠ THERE IS DELIBERATELY NO SEPARATE FIRST-PAGE COMPARISON, AND THAT IS A
  // MEASUREMENT RATHER THAN AN OMISSION. One was written and then removed: if the
  // whole course arrays are deepEqual then every slice of them is, so
  // `a.slice(0, PAGE)` vs `b.slice(0, PAGE)` cannot fail where the line above
  // passes — its paired mutation (drop the slice check, restore the sourced-only
  // sort divergence) was KILLED by the full comparison alone. A guard that cannot
  // fire reads as a safety net to the next person and is holding nothing.
});

test("both Menus show the same Today's board on the same day", () => {
  const courses = app.COURSES.map((c, i) => ({
    ...c, rows: app.sortByTime(SHAPE_KITCHEN_RECIPES.filter((r) => app.courseIndex(r) === i)),
  }));
  const webCourses = web.COURSES.map((c, i) => ({
    ...c, rows: web.sortByTime(SHAPE_KITCHEN_RECIPES.filter((r) => web.courseIndex(r) === i)),
  }));
  let differed = 0;
  let empty = 0;
  for (let day = 0; day < 366; day += 1) {
    const a = app.boardPicks(courses, day).map((r) => r.title);
    const b = web.boardPicks(webCourses, day).map((r) => r.title);
    if (a.join('|') !== b.join('|')) differed += 1;
    if (!a.length) empty += 1;
    // The courses are disjoint, so the board can never name one dish twice.
    assert.equal(new Set(a).size, a.length, `day ${day}: the board repeated a dish`);
  }
  assert.equal(differed, 0, 'the two Menus put different dishes on the board');
  assert.equal(empty, 0, 'the board came up empty — no authored dish in the first three courses');
  // Vacuity: a board of a fixed three would agree with itself every day.
  const rotates = new Set();
  for (let day = 0; day < 12; day += 1) rotates.add(app.boardPicks(courses, day).map((r) => r.title).join('|'));
  assert.ok(rotates.size >= 10, `the board showed only ${rotates.size} arrangements in 12 days — it is not rotating`);
  // Every dish on it is written by a Shape pro, which is what the board claims.
  const picks = app.boardPicks(courses, 0);
  assert.equal(picks.length, 3, 'the board is not three dishes');
  for (const r of picks) {
    const a = bsRecipeAttribution(r);
    assert.ok(a && a.kind === 'authored', `"${r.title}" is on the board and is not authored by a Shape pro`);
  }
});

test('both Menus date the board from the same day, in local time', () => {
  // ⚠ THE SEED IS DAY OF YEAR IN LOCAL TIME ON BOTH SIDES, AND THAT IS THE WHOLE
  // CLAIM: a board called "Today's board" must turn over at the reader's
  // midnight, not at UTC's.
  //
  // ⚠ AND IT IS DRIVEN IN A CHILD PROCESS PER ZONE, WHICH THE MUTATION ROUND IS
  // WHAT FORCED. Run in-process, this suite tests UTC: `node --test` runs in UTC
  // here and in CI, so local and UTC agree and a seed rewritten to
  // `getUTCFullYear` / UTC midnight passes every assertion — measured, the
  // mutation SURVIVED the first version of this test. V8 also caches the zone,
  // so re-assigning `process.env.TZ` mid-run does not reliably move it; a child
  // per zone is the only form of this check that is about anything. The same
  // reasoning and the same shape as tests/booking-timezone-parity.test.mjs.
  //
  // ⚠ AND THE FIXTURES REACH PAST THE DST TRANSITION, WHICH CODEX'S ROUND IS
  // WHAT FORCED. The first version sampled noon and the two ends of the year, and
  // a seed written as elapsed milliseconds since local Jan 1 passes all of them:
  // a DST day is not 24 hours, so from spring-forward to fall-back the quotient
  // runs an hour short and the board turned over at 1 a.m. rather than local
  // midnight — and where the summer offset runs BEHIND January's it turned over
  // at 11 p.m. the day before. Both directions are sampled: 00:30 in a northern
  // summer and 23:00 in a southern one.
  //
  // ⚠ AND THE THREE ADDED FIXTURES ARE LOAD-BEARING, MEASURED RATHER THAN
  // ASSUMED. Driven per (zone, instant) against the defect: of the six original
  // fixtures exactly ONE pair caught it — 2026-06-15T23:59 in Australia/Sydney,
  // by accident — and the NORTHERN direction, which is where most DST-observing
  // readers are, was caught by nothing at all. 2026-03-09T00:30 and
  // 2026-07-04T00:30 catch it in America/Los_Angeles.
  const DATES = ['2026-01-01T00:30:00', '2026-03-08T12:00:00', '2026-06-15T23:59:00',
    '2026-12-31T23:30:00', '2024-02-29T06:00:00', '2026-11-01T01:30:00',
    '2026-03-09T00:30:00', '2026-07-04T00:30:00', '2026-07-04T23:00:00'];
  const script = `
    const { readFileSync } = require('node:fs');
    ${lift.toString()}
    ${liftConst.toString()}
    ${build.toString()}
    const assert = require('node:assert/strict');
    const WEB = readFileSync(${JSON.stringify(path.join(ROOT, 'public/newdesign/recipesPage.jsx'))}, 'utf8');
    const APP = readFileSync(${JSON.stringify(path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'))}, 'utf8');
    const bsRecipeAttribution = () => null;
    const web = build(WEB, ${JSON.stringify({ PAGE: 'KM_PAGE', SLACK: 'KM_PAGE_SLACK', paged: 'kmPaged', minutes: 'recipeMinutes', COURSES: 'KM_COURSES', courseIndex: 'kmCourseIndex', sortByTime: 'kmSortByTime', daySeed: 'kmDaySeed', boardPicks: 'kmBoardPicks', isAuthored: 'kmIsAuthored' })});
    const app = build(APP, ${JSON.stringify({ PAGE: 'BS_KM_PAGE', SLACK: 'BS_KM_PAGE_SLACK', paged: 'bsKmPaged', minutes: 'bsRecipeMinutes', COURSES: 'BS_KM_COURSES', courseIndex: 'bsKmCourseIndex', sortByTime: 'bsKmSortByTime', daySeed: 'bsKmDaySeed', boardPicks: 'bsKmBoardPicks', isAuthored: 'bsKmIsAuthored' })});
    const out = { tz: Intl.DateTimeFormat().resolvedOptions().timeZone, rows: [] };
    for (const iso of ${JSON.stringify(DATES)}) {
      const d = new Date(iso);
      // The LOCAL calendar ordinal is what the seed claims to be. Mapping the
      // local components onto Date.UTC makes every day 24 hours by construction,
      // so this is the one comparison an elapsed-time seed cannot satisfy.
      const localOrd = Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 1)) / 86400000);
      const janOff = new Date(d.getFullYear(), 0, 1).getTimezoneOffset();
      out.rows.push([iso, web.daySeed(d), app.daySeed(d), Math.floor((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000), localOrd, d.getTimezoneOffset() !== janOff]);
    }
    process.stdout.write(JSON.stringify(out));
  `;
  let separated = 0;
  let offsetShifted = 0;
  for (const TZ of ['UTC', 'Pacific/Kiritimati', 'Pacific/Niue', 'Australia/Sydney', 'America/Los_Angeles']) {
    const raw = execFileSync(process.execPath, ['-e', script], { env: { ...process.env, TZ }, encoding: 'utf8' });
    const out = JSON.parse(raw);
    assert.equal(out.tz, TZ, `the child did not take ${TZ} — this check would be measuring UTC five times`);
    for (const [iso, a, b, utcDay, localOrd, shifted] of out.rows) {
      assert.equal(b, a, `in ${TZ} the two Menus date ${iso} differently (web ${a}, app ${b})`);
      assert.equal(b, localOrd, `in ${TZ} the seed for ${iso} is ${b}, and that local calendar day is ${localOrd}`);
      if (b !== utcDay) separated += 1;
      if (shifted) offsetShifted += 1;
    }
  }
  // Guard the guard, second half: at least one (zone, instant) pair must sit at
  // an offset OTHER than that zone's January offset, or the assertion above is
  // satisfied by the elapsed-time seed this round removed.
  assert.ok(offsetShifted > 0, 'no sampled instant sits past a DST transition — this check cannot see an elapsed-time seed');
  // Guard the guard: at least one (zone, instant) pair must put the LOCAL day
  // somewhere other than the UTC day, or every assertion above is satisfied by a
  // UTC implementation and this test is about nothing.
  assert.ok(separated > 0, 'no sampled instant separates the local day from the UTC day — this check cannot see a UTC seed');
  assert.equal(app.daySeed(new Date('2026-01-01T00:30:00')), 0, 'the first of January is not day 0');
  assert.equal(app.daySeed(new Date('2026-12-31T12:00:00')), 364, '2026 is not 365 days long by this seed');
});

test('the Menu sticky row still has a masthead to measure', () => {
  // Not parity, but the Menu's other cross-file contract, and it belongs with
  // them: the app's jump row is `position: sticky` inside BSPage's scroller,
  // and BSPage hangs a CONDENSING masthead OVER the top of that scroller once it
  // passes 64px. So the row offsets itself by that bar's measured height. If the
  // anchor goes, the measurement silently reads 0 and the row spends the whole
  // scroll underneath the bar — a defect with no error and no failing assertion
  // anywhere, because every other thing about the row still works.
  //
  // The offset is measured rather than restated precisely because the bar's
  // height moves with a safe-area inset, a notch floor and the text-size
  // setting; what is pinned here is that there is something to measure.
  const CHROME = readFileSync(path.join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
  assert.match(CHROME, /data-bs-pinned-mast/, 'BSPage no longer marks its pinned masthead — the Kitchen menu jump row has nothing to measure');
  assert.match(APP, /querySelector\('\[data-bs-pinned-mast\]'\)/, 'the Kitchen menu stopped measuring the pinned masthead');
  // Guard the guard: the attribute has to be ON the pinned bar, not merely
  // somewhere in the chrome file. It is the element that also carries the
  // z-index that puts it over the scroller.
  const at = CHROME.indexOf('data-bs-pinned-mast');
  const tag = CHROME.slice(CHROME.lastIndexOf('<div', at), CHROME.indexOf('>', at) + 1);
  assert.match(tag, /zIndex: 60/, 'the pinned-mast anchor moved off the bar that overlays the scroller');
  assert.match(tag, /position: 'absolute', top: 0/, 'the pinned-mast anchor is not on an element pinned to the top');
});

test('the two Menus call a course by the same name', () => {
  // The website types its headings into the table; the app keys them. This is the
  // only place the two spellings can be compared, and copy drift between two
  // surfaces of one design is exactly what a second implementation invites.
  const KEY = { under15: 'Under15', c15to30: '15to30', c30to60: '30to60', over60: 'Over60' };
  for (const c of web.COURSES) {
    const suffix = KEY[c.key];
    assert.ok(suffix, `no key mapping for course ${c.key}`);
    assert.equal(EN[`kitchen.course${suffix}`], c.title,
      `the app calls the ${c.key} course something else than the website's "${c.title}"`);
    assert.equal(EN[`kitchen.short${suffix}`], c.short,
      `the app's chip for ${c.key} differs from the website's "${c.short}"`);
  }
  // Vacuity: an empty catalog would satisfy the loop.
  assert.equal(web.COURSES.length, 4, 'the website Menu no longer has four courses');
});
