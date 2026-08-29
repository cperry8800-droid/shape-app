// The search ceiling, and the honesty rule it depends on.
//
// ⚠ THE LIMITER IS ONLY HALF OF THIS. Adding a ceiling to a surface whose five
// callers all turn an RPC error into an EMPTY RESULT LIST would ship a worse bug
// than the one it fixes: a member searching for someone real would be told that
// person is not on Shape. Every caller must be able to tell a refusal from an
// empty answer, so that is what most of this file pins.
//
// The migration is validated as an ARTIFACT elsewhere (applied inside a
// transaction against production and rolled back, its own structural guard
// passing — the #1853 lesson). What CI can check is the SQL's shape and the
// clients' behaviour, which is what these tests do.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';
import * as babelParser from '@babel/parser';

const SQL = fs.readFileSync('supabase-migrations/2026-08-29-search-rate-limit.sql', 'utf8');
const BACKEND = fs.readFileSync('mobile-app/src/services/shapeBackend.js', 'utf8');
const CLIENT = fs.readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8');
const SITE = fs.readFileSync('public/newdesign/siteSearch.js', 'utf8');
const SHELL = fs.readFileSync('public/newdesign/pageShell.jsx', 'utf8');
const COMMUNITY = fs.readFileSync('public/newdesign/dashboardCommunity.jsx', 'utf8');
const PROS = fs.readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', 'utf8');

// -- the migration -----------------------------------------------------------

test('both search RPCs check the ceiling before they read anything', () => {
  for (const fn of ['search_shape_people', 'search_members']) {
    const body = SQL.slice(SQL.indexOf(`create or replace function public.${fn}`));
    const decl = body.slice(0, body.indexOf('$fn$;'));
    const check = decl.indexOf('check_rate_limit_self');
    const read = decl.indexOf('from public.profiles');
    assert.ok(check > 0, `${fn} no longer checks a ceiling`);
    assert.ok(read > check, `${fn} reads profiles before checking the ceiling — the scan is the cost`);
  }
});

// ⚠ A STABLE FUNCTION CANNOT WRITE A COUNTER. Postgres refuses an INSERT inside
// one, so a replay that reverted the volatility would not fail loudly — it would
// fail to deploy, or worse, silently drop the limit if the check were removed too.
test('both search RPCs are plpgsql and VOLATILE', () => {
  for (const fn of ['search_shape_people', 'search_members']) {
    const decl = SQL.slice(SQL.indexOf(`create or replace function public.${fn}`));
    const head = decl.slice(0, decl.indexOf('as $fn$'));
    assert.match(head, /language plpgsql/, `${fn} is not plpgsql — it cannot RAISE a refusal`);
    assert.match(head, /\nvolatile\n/, `${fn} is not VOLATILE — it cannot bump the counter`);
  }
});

// ⚠ THE BUCKET NAME HAS TO BE UNFORGEABLE. check_rate_limit is granted to anon
// and authenticated by design (the Edge proxy's anon client must reach it), so
// any signed-in caller can bump any bucket it can NAME — and `self:search:<uuid>`
// is trivially guessable. Without the reserved namespace, the limiter would hand
// every member a way to lock a chosen victim out of search.
test('the self namespace is reserved on the public entry point', () => {
  const body = SQL.slice(SQL.indexOf('create or replace function public.check_rate_limit('));
  const decl = body.slice(0, body.indexOf('$$;'));
  assert.match(decl, /p_key like 'self:%'/, 'check_rate_limit no longer reserves the self: namespace');
  assert.match(decl, /raise exception/, 'the reserved namespace is detected but not refused');
});

test('only the self entry point builds a self: key, and it builds it from auth.uid()', () => {
  const body = SQL.slice(SQL.indexOf('create or replace function public.check_rate_limit_self'));
  const decl = body.slice(0, body.indexOf('$$;'));
  assert.match(decl, /auth\.uid\(\)/, 'the identity is not taken from the JWT');
  assert.match(decl, /'self:' \|\| p_scope \|\| ':' \|\| v_uid/, 'the key is not derived from the caller');
  // The caller supplies a SCOPE only — never the identity, so there is nothing to forge.
  assert.doesNotMatch(decl, /p_key/, 'the self entry point takes a caller-supplied key');
});

test('the private limiter is revoked from every client role', () => {
  for (const fn of ['_rate_limit_bump', 'check_rate_limit_self']) {
    const revoke = new RegExp(`revoke all on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`);
    assert.match(SQL, revoke, `${fn} is not revoked from anon and authenticated by name`);
  }
});

// ⚠ `create or replace` PRESERVES the grants an earlier version made, so these
// have to be re-asserted by name — the proxy calls check_rate_limit on every
// /api/* request and losing them would cost a failed RPC on each one.
test('check_rate_limit keeps the grants the proxy depends on', () => {
  assert.match(SQL, /grant execute on function public\.check_rate_limit\(text, integer, integer\) to anon, authenticated, service_role;/);
});

test('one counter, not two', () => {
  const inserts = SQL.split('insert into public.rate_limits').length - 1;
  assert.equal(inserts, 1, 'the fixed-window counter exists more than once — two implementations will drift');
});

test('the search functions stay authenticated-only', () => {
  for (const sig of ['search_shape_people(text, integer)', 'search_members(text)']) {
    assert.match(SQL, new RegExp(`revoke all on function public\\.${sig.replace(/[()]/g, '\\$&')} from public, anon;`));
  }
});

test('every new function pins its search_path', () => {
  const defs = SQL.split('create or replace function public.').slice(1);
  assert.ok(defs.length >= 5, 'the function list shrank — this guard is checking nothing');
  for (const d of defs) {
    const name = d.slice(0, d.indexOf('('));
    assert.match(d.slice(0, d.indexOf('as $')), /set search_path = public, pg_temp/, `${name} does not pin its search_path`);
  }
});

// -- the clients -------------------------------------------------------------

// ⚠ THE FALLBACK IS FOR A MISSING FUNCTION, NOT FOR EVERY ERROR. Under the old
// bare `catch`, a refused search would immediately fire a SECOND rpc — so the
// limiter would double the load it exists to halve — and the member would be
// shown whatever that returned, or an empty list.
test('the app falls back to the legacy RPC only when the function is missing', () => {
  const src = stripComments(BACKEND);
  const fn = src.slice(src.indexOf('async function searchShapePeople'));
  const body = fn.slice(0, fn.indexOf('\nwindow.ShapeSearch'));
  assert.doesNotMatch(body, /catch\s*\(/, 'searchShapePeople still swallows every error');
  assert.match(body, /if \(!searchFnMissing\(error, 'search_shape_people'\)\) throw error;/, 'a non-missing-function error is not propagated');
});

// ⚠ MATCHED ON THE CODE, NEVER THE MESSAGE. A refusal sentence is a spelling to
// pin, and #1936 is what that costs; PostgREST surfaces the SQLSTATE as `code`.
//
// The THREE WEB callers each carry the literal because they are three separate
// bundles with no shared import — a classic script, a babel component and another
// one. The APP does not, and must not: it reaches the data layer, so the code is
// written once there and every app caller asks `ShapeSearch.isRateLimited`.
test('every caller recognises a refusal by its SQLSTATE, never by its message', () => {
  const byCode = { 'siteSearch.js': SITE, 'pageShell.jsx': SHELL, 'dashboardCommunity.jsx': COMMUNITY };
  for (const [name, src] of Object.entries(byCode)) {
    const body = stripComments(src);
    assert.match(body, /PT429/, `${name} cannot tell a refusal from an empty result`);
    assert.doesNotMatch(body, /too many searches/i, `${name} matches the refusal MESSAGE — pin the code instead`);
  }
  const backend = stripComments(BACKEND);
  assert.match(backend, /SEARCH_RATE_LIMITED = 'PT429'/, 'the app has no refusal predicate');
  assert.match(backend, /isRateLimited: searchIsRateLimited/, 'the predicate is not exposed to the app');
});

// One predicate, one place — the class #1950 paid for when two readers of the
// same fact each derived it and could disagree about what the fact was.
test('the app asks the shared predicate rather than re-typing the code', () => {
  const client = stripComments(CLIENT);
  assert.match(client, /ShapeSearch\?\.isRateLimited\?\.\(e\)/, 'the search UI does not consult the shared predicate');
  assert.doesNotMatch(client, /PT429/, 'the app re-types the SQLSTATE instead of asking the data layer');
});

// ⚠ THE SIGNED-IN MEMBER IS NEVER SHOWN THE DEMO CAST. The typeahead used to read
// `r.length ? r : local`, so a real search that matched nobody — or that failed —
// substituted fictional people (userId: null, stock faces, and no marker on the
// row telling them apart from real accounts). A member searching for someone not
// on Shape was shown someone who does not exist.
test('the app search never substitutes demo people for a signed-in member', () => {
  const src = stripComments(CLIENT);
  const at = src.indexOf('window.ShapeSearch.people(query)');
  assert.ok(at > 0, 'the typeahead no longer calls the search');
  const around = src.slice(at, at + 700);
  assert.doesNotMatch(around, /\?\s*r\s*:\s*local|r\.length\s*\?/, 'a signed-in search still falls back to the demo cast');
  assert.match(around, /setRows\(\s*Array\.isArray\(r\)\s*\?\s*r\s*:\s*\[\]\s*\)/, 'the signed-in path no longer renders exactly what it got');
});

test('the honest empty state the demo substitution was hiding is still there', () => {
  assert.match(CLIENT, /Nothing on Shape matches/, 'the empty state copy is gone');
  assert.match(SHELL, /Nothing on Shape matches/);
  assert.match(SITE, /Nothing on Shape matches/);
});

// ⚠ THE CEILING IS ONLY SAFE IF THE CALLERS ARE DEBOUNCED. 60/min is far above a
// human search session ONLY because every surface waits for the typing to settle.
// The tag picker fired one RPC per keystroke — a dozen requests to type one name,
// four names to a post — so the heaviest caller was the one that would have been
// refused first, on entirely legitimate use. A caller added later without a
// debounce silently re-tunes the ceiling for everybody.
test('every browser-side search caller debounces its keystrokes', () => {
  // ⚠ THE CALL MUST BE INSIDE THE TIMER, NOT MERELY NEAR ONE. Asserting "a
  // setTimeout appears within N characters" passes on a direct per-keystroke call
  // that happens to sit beside an unrelated timer — the exact regression this
  // guard exists to catch. So: find the setTimeout, brace-match ITS callback, and
  // require the search call to live in that body and the delay to clear the floor.
  const callers = [
    ['the app typeahead', stripComments(CLIENT), 'window.ShapeSearch.people(query)'],
    ['the site header search', stripComments(SHELL), 'search_shape_people'],
    ['the DM send picker', stripComments(COMMUNITY), 'sb.rpc("search_members"'],
    ['the post tag picker', stripComments(COMMUNITY), 'cl.rpc("search_members"'],
    ['the coach roster search', stripComments(PROS), 'window.ShapeSearch?.people?.(query, 12)'],
    // One entry covers all FOUR member pickers (send-a-post, new message,
    // add-to-channel, tag-in-a-post): they route through the shared hook, so
    // the debounce exists once and cannot drift between them.
    ['the member pickers', stripComments(CLIENT), 'window.ShapeChannels.searchMembers(query)'],
  ];
  for (const [what, src, marker] of callers) {
    const call = src.indexOf(marker);
    assert.ok(call > 0, `${what}: call site not found`);

    // The nearest setTimeout that OPENS before the call.
    const open = src.lastIndexOf('setTimeout(', call);
    assert.ok(open > 0, `${what} fires a search with no timer ahead of it`);

    // ⚠ THE CALLBACK BODY, NOT THE ARGUMENT LIST — and the difference is not
    // pedantic. Brace-matching the setTimeout's own parens proves only that the
    // marker sits somewhere among its ARGUMENTS, which
    // `setTimeout(cb, directSearch(), 250)` satisfies while searching on every
    // keystroke. So: parse the callback head (`() =>`, `async () =>`, or
    // `function () `), take the `{` that opens ITS body, brace-match that, and
    // require the call to fall inside.
    const head = src.slice(open + 'setTimeout('.length).match(/^\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*\{|^\s*(?:async\s*)?function\s*[A-Za-z_$]*\s*\([^)]*\)\s*\{/);
    assert.ok(head, `${what}: the timer's first argument is not an inline callback`);
    const bodyOpen = open + 'setTimeout('.length + head[0].length - 1;
    let depth = 0, i = bodyOpen, bodyClose = -1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') depth++;
      else if (ch === '}') { depth--; if (depth === 0) { bodyClose = i; break; } }
    }
    assert.ok(bodyClose > 0, `${what}: could not find the end of the timer callback`);
    assert.ok(call > bodyOpen && call < bodyClose,
      `${what}: the search call is inside the setTimeout ARGUMENT LIST but not inside its callback body — it fires on every keystroke`);

    // …and the delay is the last argument of that same call, read AFTER the body.
    const tail = src.slice(bodyClose, src.indexOf(')', bodyClose) + 1);
    const delay = tail.match(/,\s*(\d+)\s*\)\s*$/);
    assert.ok(delay, `${what}: the timer has no literal delay`);
    assert.ok(Number(delay[1]) >= 220, `${what} debounces for ${delay[1]}ms, under the 220ms floor`);
  }

  // ⚠ siteSearch.js debounces through ONE HOP — the timer calls `run(query)` and
  // `run` holds the RPC — so the guard follows the hop rather than pretending the
  // call is inline. Both halves are required: a timer that calls something else,
  // or a `run` that no longer searches, each breaks the debounce.
  const site = stripComments(SITE);
  const timer = site.match(/debounceId\s*=\s*setTimeout\(\s*function\s*\(\)\s*\{([^]*?)\}\s*,\s*(\d+)\s*\)/);
  assert.ok(timer, 'the standalone-page search has no debounce timer');
  assert.match(timer[1], /\brun\s*\(/, 'the standalone-page debounce timer does not invoke the search runner');
  assert.ok(Number(timer[2]) >= 220, `the standalone-page search debounces for ${timer[2]}ms, under the 220ms floor`);
  const run = site.slice(site.indexOf('function run('));
  assert.match(run.slice(0, run.indexOf('\n  function ')), /rpc\('search_shape_people'/,
    'the standalone-page search runner no longer performs the search — the debounce guards nothing');
});

// ⚠ THE MESSAGE SAFETY NET MUST NOT MATCH EVERY UNDEFINED-OBJECT ERROR. A bare
// /does not exist/ also matches `relation "x" does not exist` (42P01), a missing
// column (42703), and anything else Postgres words that way — so a schema or
// permission fault would have fallen through to the legacy RPC and spent a SECOND
// allowance, which is the precise failure the narrowed fallback exists to prevent.
// Driven against the REAL predicate, not its spelling.
test('the missing-function fallback fires on missing functions and nothing else', async () => {
  const src = stripComments(BACKEND);
  const at = src.indexOf('function searchFnMissing');
  assert.ok(at > 0, 'the predicate is gone');
  const body = src.slice(at, src.indexOf('async function searchShapePeople', at));
  // eslint-disable-next-line no-eval
  const searchFnMissing = eval(`(${body.slice(body.indexOf('function searchFnMissing'))})`);
  const FN = 'search_shape_people';

  const fires = [
    { code: 'PGRST202' }, // PostgREST raises this about the RPC you called
    { code: '42883', message: 'function public.search_shape_people(text, integer) does not exist' },
    { code: '42883' },
    { message: 'Could not find the function public.search_shape_people(p_limit, p_q) in the schema cache' },
  ];
  for (const err of fires) assert.equal(searchFnMissing(err, FN), true, `should fall back: ${JSON.stringify(err)}`);

  const doesNot = [
    // ⚠ 42883 for a HELPER called from inside the search function. Treating any
    // missing function as "the search RPC is not deployed" lets a real execution
    // fault masquerade as a stale schema and silently return names-only results.
    { code: '42883', message: 'function public.check_rate_limit_self(text, integer, integer) does not exist' },
    { code: '42P01', message: 'relation "rate_limits" does not exist' },
    { code: '42703', message: 'column "foo" does not exist' },
    { code: '42501', message: 'permission denied for function check_rate_limit_self' },
    { code: 'PT429', message: 'too many searches - try again in a moment' },
    null,
    undefined,
  ];
  for (const err of doesNot) assert.equal(searchFnMissing(err, FN), false, `must NOT fall back: ${JSON.stringify(err)}`);

  // and the caller actually passes the function name — a defaulted parameter makes
  // an unwired call site look perfectly plausible.
  assert.match(src, /searchFnMissing\(\s*error\s*,\s*'search_shape_people'\s*\)/,
    'the fallback no longer tells the predicate which RPC it called');
});

// ⚠ A REFUSAL BRANCH THAT THROWS IS WORSE THAN NO BRANCH AT ALL. The site header
// search shipped `fontFamily: SANS` where nothing in scope defines it — valid
// syntax, so the parse-check passed, and tsc does not cover these browser-babel
// files. The result: a ReferenceError that blanks the whole search overlay EXACTLY
// when a member is rate-limited, i.e. the one state the branch exists to render.
//
// ⚠ SCOPE IS CROSS-BUNDLE HERE, WHICH IS WHY THE GUARD RESOLVES IT THAT WAY.
// babel-standalone evaluates these scripts through global eval, so a TOP-LEVEL
// `const` in one bundle is visible to every other bundle on the same page —
// `dashboardCommunity.jsx` legitimately renders `fontFamily: serif` declared in
// `pageShell.jsx`. A declaration INSIDE a closure does not escape, which is
// exactly why siteSearch.js's own `var SANS` never rescued pageShell. So the
// guard unions the top-level declarations of every bundle a page co-loads, and
// counts column-0 declarations only.
test('every font token a search surface renders resolves in its own page scope', () => {
  const pages = fs.readdirSync('public/newdesign').filter((f) => f.endsWith('.html'));
  const cache = new Map();
  const readBundle = (name) => {
    if (!cache.has(name)) {
      try { cache.set(name, fs.readFileSync(`public/newdesign/${name}`, 'utf8')); }
      catch { cache.set(name, ''); }
    }
    return cache.get(name);
  };
  // Column-0 declarations only — anything indented sits inside a closure and does
  // not reach a sibling bundle.
  const topLevelDecls = (src) => new Set(
    [...stripComments(src).matchAll(/^(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/gm)].map((m) => m[1]),
  );

  let checked = 0;
  for (const surface of ['pageShell.jsx', 'dashboardCommunity.jsx', 'siteSearch.js']) {
    const src = stripComments(readBundle(surface));
    const used = new Set([...src.matchAll(/fontFamily:\s*([A-Za-z_$][\w$]*)\b/g)].map((m) => m[1]));
    if (!used.size) continue;

    // Everything this surface can see: its own scope (closures included) plus the
    // top-level declarations of every bundle it shares a page with.
    const inScope = new Set(
      [...src.matchAll(/(?:const|let|var|function)\s+([A-Za-z_$][\w$]*)/g)].map((m) => m[1]),
    );
    for (const page of pages) {
      const html = fs.readFileSync(`public/newdesign/${page}`, 'utf8');
      if (!html.includes(surface)) continue;
      for (const m of html.matchAll(/\/?([A-Za-z0-9_.-]+\.(?:jsx|js))(?:\?[^"']*)?["']/g)) {
        if (m[1] === surface) continue;
        for (const id of topLevelDecls(readBundle(m[1]))) inScope.add(id);
      }
    }

    for (const id of used) {
      checked++;
      assert.ok(inScope.has(id), `${surface}: fontFamily uses \`${id}\`, which nothing in its page scope declares — that branch throws when it renders`);
    }
  }
  assert.ok(checked > 0, 'the guard resolved no font tokens at all — it is passing vacuously');
});

// ⚠ A REFUSAL MUST NOT LEAVE THE PREVIOUS QUERY'S PEOPLE ON SCREEN. Stale rows
// under new query text are worse than the empty list this change set out to fix:
// an empty list says "nobody", stale rows say "THIS person", and in the tag picker
// that credits the WRONG account on a public post. Pinned two ways, because either
// alone leaves the other as a trap.
// ⚠ ASSERT WHAT A BRANCH ANSWERS FOR, NOT HOW IT IS SPELLED. These guards used
// to pin `state !== "ok" ?`, which was true of the code and false of the rule —
// a negation admits EVERY non-ok state into the refusal branch, including the
// `pending` one added when a query changes. So the shape they pinned is exactly
// the shape that prints "couldn't search just now" in the middle of a debounce.
// A branch is correct when it NAMES the states it answers for.
const refusalGate = (v) => new RegExp(`${v} === ["']limited["'] \\|\\| ${v} === ["']failed["']`);
const settledGate = (v) => new RegExp(`${v} === ["']ok["'] &&`);

test('a refused picker search clears its results and shows the refusal', () => {
  const src = stripComments(COMMUNITY);

  // (a) the state is honest: both refusal paths in the tag picker clear the rows
  const at = src.indexOf('cl.rpc("search_members"');
  assert.ok(at > 0, 'the tag picker no longer calls search_members');
  const body = src.slice(at, at + 700);
  const clears = body.match(/setTagResults\(\s*\[\s*\]\s*\)/g) || [];
  assert.equal(clears.length, 2, 'the tag picker must clear its rows on BOTH the error and the throw path');

  // (b) the render cannot hide the notice behind a non-empty list
  assert.doesNotMatch(src, /tagResults\.length === 0 &&[^]{0,200}?tagState/,
    'the tag notice is gated behind an empty result list — stale rows hide it');
  assert.match(src, refusalGate('tagState'), 'the tag notice is not gated on the states it answers for');
  assert.match(src, settledGate('tagState'), 'the tag empty state does not require a settled successful search');

  // the send picker already had the right shape; keep it that way
  assert.match(src, refusalGate('state'), 'the send picker notice is not gated on the states it answers for');
  assert.match(src, settledGate('state'), 'the send picker empty state does not require a settled successful search');
});

// ⚠ ENUMERATED, NOT PATCHED WHERE IT WAS REPORTED. The tag picker's refusal was
// hidden because the notice sat BEHIND the empty-state test; the same ordering
// mistake on any other surface hides the refusal the same way. Swept all five
// callers — only the tag picker had it — and pinned the ordering everywhere so it
// cannot come back on a surface nobody was looking at.
test('every refusal branch renders ahead of its own empty state', () => {
  const surfaces = [
    ['the app typeahead', stripComments(CLIENT), /state !== 'ok' \?/, /Nothing on Shape matches/],
    ['the site header search', stripComments(SHELL), /state !== "ok" \?/, /Nothing on Shape matches/],
    ['the DM send picker', stripComments(COMMUNITY), refusalGate('state'), /people\.length === 0 \?/],
    ['the post tag picker', stripComments(COMMUNITY), refusalGate('tagState'), /tagResults\.length === 0 \?/],
    ['the coach roster search', stripComments(PROS), /searchState !== 'ok' &&/, /coach:addClient\.noMembers/],
  ];
  for (const [what, src, refusal, empty] of surfaces) {
    const r = src.search(refusal);
    const e = src.search(empty);
    assert.ok(r > 0, `${what}: no refusal branch found`);
    assert.ok(e > 0, `${what}: no empty state found`);
    assert.ok(r < e, `${what}: the empty state is tested before the refusal, so a refusal renders as "nobody matched"`);
  }
});

// The standalone-page search builds its markup fresh each render, so there is no
// stale state to clear — but the same precedence has to hold in the string it emits.
test('the standalone-page search puts its notice ahead of the empty state', () => {
  const src = stripComments(SITE);
  const notice = src.indexOf('if (notice)');
  const empty = src.indexOf('rows.length === 0 && !nh');
  assert.ok(notice > 0 && empty > 0, 'the render branches are gone');
  assert.ok(notice < empty, 'a refusal falls through to the "nothing matches" copy');
});

// ⚠ THREE OUTCOMES, NOT TWO. A refusal, a failure and an empty answer are
// different claims, and only the last one is evidence that nobody matched.
// Collapsing a failure into the empty state is the same fabrication as the demo
// cast, one step quieter: "Nothing on Shape matches" after a network error tells a
// member a real person is not on Shape, on evidence we never had.
test('a failed search never renders as "nobody matched"', () => {
  const surfaces = [
    ['the app typeahead', stripComments(CLIENT), /setState\(\s*window\.ShapeSearch\?\.isRateLimited\?\.\(e\) === true \? 'limited' : 'failed'\s*\)/],
    ['the site header search', stripComments(SHELL), /setState\(e && e\.code === "PT429" \? "limited" : "failed"\)/],
    ['the DM send picker', stripComments(COMMUNITY), /setState\(e && e\.code === "PT429" \? "limited" : "failed"\)/],
    ['the post tag picker', stripComments(COMMUNITY), /setTagState\(e && e\.code === "PT429" \? "limited" : "failed"\)/],
    ['the coach roster search', stripComments(PROS), /setSearchState\(\s*window\.ShapeSearch\?\.isRateLimited\?\.\(failure\) === true \? 'limited' : 'failed'\s*\)/],
  ];
  for (const [what, src, shape] of surfaces) {
    assert.match(src, shape, `${what} does not separate a failure from a refusal`);
  }
  // and each surface renders something for the failure case, not the empty state
  assert.match(stripComments(CLIENT), /Couldn't search just now/, 'the app has no failure copy');
  assert.match(stripComments(SHELL), /Couldn’t search just now/, 'the site header search has no failure copy');
  assert.match(stripComments(COMMUNITY), /Couldn’t search just now/, 'the send picker has no failure copy');
  assert.match(stripComments(COMMUNITY), /Couldn’t search just now — try again/, 'the tag picker has no failure copy');
  assert.match(stripComments(PROS), /coach:addClient\.searchFailed/, 'the coach roster has no failure copy');
  // siteSearch routes both through one honest could-not-answer renderer
  const site = stripComments(SITE);
  assert.match(site, /function renderProblem\(nh, isLimited\)/, 'siteSearch has no could-not-answer renderer');
  // The catch must route to renderProblem, never to the ordinary empty render.
  // ⚠ ANCHORED ON THE RPC, not on `.catch(` — the file has an earlier, unrelated
  // catch on the Supabase bundle loader, and a bare marker silently selects it
  // while every assertion goes on passing about someone else's code.
  const rpcAt = site.indexOf("rpc('search_shape_people'");
  assert.ok(rpcAt > 0, 'siteSearch no longer calls the search RPC');
  const cat = site.indexOf('.catch(', rpcAt);
  assert.ok(cat > rpcAt, 'siteSearch has no catch on its search');
  const catchBody = site.slice(cat, site.indexOf('});', cat));
  assert.doesNotMatch(catchBody, /render\(\[\], nh, query\)/,
    'siteSearch still renders a thrown search as an empty result');
  assert.match(catchBody, /renderProblem\(/, 'siteSearch does not route a thrown search to the could-not-answer state');
});

// ⚠ A SOURCE GUARD, DELIBERATELY — and the reason is a property of the harness,
// not a shortcut. `signedIn` is recomputed from the auth cache on every render, so
// with `[q]` alone the effect never re-ran when a session resolved and a timer
// scheduled before auth landed fired with the stale `false`, rendering the DEMO
// CAST to a signed-in member. The mount harness ignores dependency arrays
// (tests/helpers/broadsheet-mount.mjs), so no behavioural test can reach this;
// asserting the dependency is the only instrument that pins it, and saying so
// keeps the next reader from mistaking a source check for laziness.
test('the typeahead effect restarts when the session resolves', () => {
  const src = stripComments(CLIENT);
  const at = src.indexOf('window.ShapeSearch.people(query)');
  assert.ok(at > 0, 'the typeahead is gone');
  const deps = src.slice(at, at + 1400).match(/\},\s*\[([^\]]*)\]\s*\)/);
  assert.ok(deps, "the typeahead effect's dependency array is gone");
  assert.match(deps[1], /\bsignedIn\b/,
    'signedIn is not a dependency — a timer scheduled before auth resolved fires with the stale value and renders the demo cast to a signed-in member');
});

// ⚠ THE SUGGESTION RAIL WAS THE SIXTH DOOR INTO THE SAME FABRICATION. The
// typeahead stopped substituting the demo cast; the "People you may know" loader
// three lines above it did not. For a signed-in member, THREE different outcomes
// reached its final fallback — nobody to suggest, a REFUSED read (PT429), and a
// FAILED one — and every one of them wrote fictional accounts (userId null, stock
// faces, no marker on the row) into a real member's empty state. The rail renders
// nothing at all when the list is empty, so leaving it empty claims nothing; the
// substitution was the only thing making a claim.
test('the suggestion rail never substitutes demo people for a signed-in member', () => {
  const src = stripComments(CLIENT);
  const at = src.indexOf("window.ShapeSearch.people('', 8)");
  assert.ok(at > 0, 'the suggestion loader no longer calls the search');
  const tail = src.slice(at, at + 900);
  const demo = tail.match(/setSuggested\(\s*demoPeople[^)]*\)/);
  assert.ok(demo, 'the demo fallback is gone — if that is deliberate, retire this guard');
  const guard = tail.slice(0, demo.index);
  assert.match(guard.slice(-160), /!\s*signedIn/,
    'the demo cast is still reachable for a signed-in member — an empty, refused or failed suggestion read hands them fictional accounts');
});

// Same dependency trap as the typeahead, one effect up: `signedIn` is read fresh
// every render, so a `[]`-dep loader ran once with the pre-auth `false`, took the
// signed-out branch, and left the demo cast on screen for a member. The flip has
// to re-run it — and the re-run has to CLEAR what the first pass wrote, because
// re-running does not un-set state.
test('the suggestion loader restarts when the session resolves, and clears what it wrote', () => {
  const src = stripComments(CLIENT);
  const at = src.indexOf("window.ShapeFollows.suggestions(8)");
  assert.ok(at > 0, 'the suggestion loader is gone');
  const open = src.lastIndexOf('React.useEffect(', at);
  assert.ok(open > 0 && open < at, 'the suggestion loader is no longer in an effect');
  const body = src.slice(open, src.indexOf('window.ShapeSearch.people(query)'));
  const deps = body.match(/\},\s*\[([^\]]*)\]\s*\)/);
  assert.ok(deps, "the suggestion effect's dependency array is gone");
  assert.match(deps[1], /\bsignedIn\b/,
    'signedIn is not a dependency — a loader that ran before auth resolved leaves the demo cast in front of a signed-in member');
  assert.match(src.slice(open, at), /if \(signedIn\) setSuggested\(\[\]\)/,
    'the re-run does not clear the demo cast the pre-auth pass wrote');
});

// ⚠ A DERIVED INVENTORY, NOT A HAND-WRITTEN LIST — and this guard exists because
// the hand-written one failed exactly once, in review: every surface table above
// was populated by enumerating the callers I remembered, and the coach roster was
// not among them, so a rate-limited coach read "No members match" about members
// who were right there while sixteen assertions passed. A list of callers cannot
// prove it is the list of callers. This one reads the tree and fails on a file
// that searches without being covered, so the NEXT caller is caught at the gate
// rather than by the next reviewer.
test('no member picker can render "no matches" over a refused or failed search', () => {
  // ⚠ THE EMPTY STATE MUST BE GATED ON A SUCCESSFUL SEARCH, not merely preceded
  // by a notice. Ordering is what CodeRabbit caught on the website tag picker —
  // the notice sat BEHIND `length === 0`, so a refusal was invisible — but a
  // gate is the stronger property: it holds however the JSX is reordered.
  const src = stripComments(CLIENT);
  for (const [what, state, rows] of [
    ['the tag picker', 'tagState', 'tagResults'],
    ['the new-message picker', 'dmState', 'dmResults'],
    ['the add-member picker', 'memberState', 'memberResults'],
  ]) {
    assert.ok(src.includes(`<BSPickerNotice state={${state}} />`),
      `${what} renders no refusal notice`);
    assert.ok(src.includes(`{${state} === 'ok' && ${rows}.length === 0`),
      `${what} renders its empty state without requiring a successful search — ` +
      'a refused or failed search would read as "no matches"');
  }
  // The send sheet is a ternary rather than a && chain: its refusal branch must
  // come FIRST, or an empty `people` shadows it.
  // ⚠ SCOPED TO THE COMPONENT. `people.length === 0` also appears in the
  // follow-suggestions block far earlier in this file, so a whole-file indexOf
  // compares two unrelated sites and the assertion says nothing about the
  // picker — the marker-selects-someone-else's-code trap.
  const sendOpen = src.indexOf('function BSPostSendSheet');
  assert.ok(sendOpen > 0, 'the send picker component is gone');
  const send = src.slice(sendOpen, src.indexOf('\nfunction ', sendOpen + 10));
  const notice = send.search(refusalGate('peopleState'));
  const empty = send.indexOf('people.length === 0');
  assert.ok(notice > 0, 'the send picker has no refusal branch');
  assert.ok(empty > notice, 'the send picker tests its empty state before its refusal state');
  assert.match(send, settledGate('peopleState'),
    'the send picker renders its empty state without requiring a settled successful search');
});

test('a member picker clears its rows on every path that is not a fresh answer', () => {
  // ⚠ STALE ROWS ARE WORSE THAN NONE on a picker whose row ACTS on the person:
  // an empty list says *nobody*, stale rows say *this person*, and the member
  // sends to / adds / tags the wrong account.
  const src = stripComments(CLIENT);
  const open = src.indexOf('function useBSMemberPicker');
  assert.ok(open > 0, 'the shared member-picker hook is gone — the four pickers no longer share a contract');
  const body = src.slice(open, src.indexOf('\nfunction ', open + 10));

  assert.match(body, /\.catch\(\s*\(\s*e\s*\)\s*=>\s*\{[^]*?setRows\(\[\]\)/,
    'the hook does not clear its rows when the search is refused or fails');
  assert.match(body, /if\s*\(!open[^]*?setRows\(\(prev\)\s*=>\s*\(prev\.length\s*\?\s*\[\]\s*:\s*prev\)\)/,
    'the hook does not clear on close — reopening would paint the previous session’s people');
});

// ⚠ FOUR OUTCOMES, NOT THREE — AND THE FOURTH IS THE ONE THIS WAVE KEPT MISSING.
// A refusal, a failure and a settled empty answer were all modelled. The GAP
// between a new query and its answer was not, so it wore the PREVIOUS answer's
// state: rows on screen that were not an answer to the query on screen. And a
// picker row does not display a person — it SENDS to, TAGS, or ADDS that person.
// Typing "Alex" → "Alicia" and tapping tagged Alex, on a public post.
//
// This is the refusal rule one step wider. Refused, failed, closed, or simply
// SUPERSEDED BY A NEWER QUERY — in every case the rows have stopped being an
// answer, and in every case they must go BEFORE the next search starts, not
// after it returns. Clearing inside the debounce leaves them actionable for the
// whole 220ms + round trip, which is the entire window a member types in.
//
// ⚠ TWO SURFACES ALREADY HAD THIS RIGHT, by two different mechanisms, and both
// are pinned here as the reference rather than rewritten: the coach roster gates
// every row on `!searching`, and the standalone-page search overwrites its list
// with "Searching…" markup synchronously. Five did not. The mechanism is free to
// differ per surface; the property is not.
test('no search surface can act on the previous query’s rows', () => {
  // (a) the clear happens BEFORE the debounce timer, not inside it
  const before = [
    ['the shared member-picker hook', stripComments(CLIENT),
      // the live half of the effect — past the close branch's `return undefined;`
      (src) => { const o = src.indexOf('function useBSMemberPicker'); return src.slice(src.indexOf('return undefined;', o), src.indexOf('\nfunction ', o + 10)); },
      [/setRows\(\(prev\) => \(prev\.length \? \[\] : prev\)\)/, /setState\('pending'\)/]],
    // ⚠ SLICE PAST THE MARKER, NOT FROM IT. Both of these effects open with an
    // early return that ALREADY contains `setRows(null)` — for the empty query.
    // Starting the region at that line put the needle inside its own marker, so
    // the assertion passed with the real clear deleted: the marker-selects-
    // someone-else's-code trap, this time inside the guard written to catch it.
    ['the app typeahead', stripComments(CLIENT),
      (src) => { const m = "if (!query) { setRows(null); setBusy(false); setState('ok'); return; }"; const o = src.indexOf(m); return o < 0 ? '' : src.slice(o + m.length, src.indexOf('window.ShapeSearch.people(query)', o)); },
      [/setRows\(null\);/]],
    ['the site header search', stripComments(SHELL),
      (src) => { const m = 'if (!open || !query) { setRows(null); setState("ok"); return undefined; }'; const o = src.indexOf(m); return o < 0 ? '' : src.slice(o + m.length, src.indexOf('sb.rpc("search_shape_people"', o)); },
      [/setRows\(null\);/]],
    ['the DM send picker', stripComments(COMMUNITY),
      (src) => { const o = src.indexOf('setPeople((prev) => (prev.length ? [] : prev))'); return o < 0 ? '' : src.slice(o, src.indexOf('sb.rpc("search_members"', o)); },
      [/setState\("pending"\)/]],
    ['the post tag picker', stripComments(COMMUNITY),
      (src) => { const o = src.indexOf('setTagResults((prev) => (prev.length ? [] : prev))'); return o < 0 ? '' : src.slice(o, src.indexOf('cl.rpc("search_members"', o)); },
      [/setTagState\("pending"\)/]],
  ];
  for (const [what, src, slice, needles] of before) {
    const region = slice(src);
    assert.ok(region && region.length > 0 && region.length < 2000,
      `${what}: the effect region could not be located — the markers have moved`);
    assert.ok(region.includes('setTimeout'),
      `${what}: no debounce timer between the clear and the search — the region is not what it claims to be`);
    const timer = region.indexOf('setTimeout');
    for (const n of needles) {
      const at = region.search(n);
      assert.ok(at >= 0, `${what}: the previous query’s rows are never cleared`);
      assert.ok(at < timer,
        `${what}: the clear runs INSIDE the debounce, so the previous query’s rows stay actionable ` +
        'for the whole debounce + round trip');
    }
  }

  // (b) the two references, pinned so a "cleanup" cannot quietly remove them
  assert.match(stripComments(PROS), /\{!searching && \(results \|\| \[\]\)\.map\(/,
    'the coach roster no longer gates its rows on `!searching` — a superseded query’s clients ' +
    'become invitable again');
  const site = stripComments(SITE);
  const searching = site.indexOf('Searching…');
  const debounce = site.indexOf('debounceId = setTimeout');
  assert.ok(searching > 0 && debounce > 0, 'the standalone-page search markers are gone');
  assert.ok(searching < debounce,
    'the standalone-page search no longer overwrites its list before the debounce');

  // (b2) and the shared notice must say NOTHING while a search is pending — it is
  // not a refusal and not a failure, so "couldn't search just now" there would be
  // this file's fabrication class in the other direction: reporting a fault that
  // has not happened. Three pickers render through this one component.
  assert.match(stripComments(CLIENT), /if \(state === 'ok' \|\| state === 'pending'\) return null;/,
    'BSPickerNotice renders its refusal copy while a search is still pending');

  // (c) and no surface may render its empty copy while a search is in flight
  const settled = [
    ['the app typeahead', stripComments(CLIENT), /rows !== null && list\.length === 0/],
    ['the site header search', stripComments(SHELL), /rows !== null && rows\.length === 0/],
  ];
  for (const [what, src, gate] of settled) {
    assert.match(src, gate,
      `${what}: its empty state is reachable while a search is pending — only branch ORDER ` +
      'stands between a member and "nothing matches" over a search that has not run');
  }
});

test('every SEARCH CALL SITE is covered — inventory derived, not remembered', () => {
  // ⚠ THIS GUARD REPLACED A PER-FILE ONE, AND THE UPGRADE IS THE WHOLE POINT.
  // The per-file version listed `iosAppBroadsheetClient.jsx` as covered because
  // it reaches `ShapeSearch.people` — while FOUR other call sites in that same
  // file searched through a SECOND wrapper (`ShapeChannels.searchMembers`) with
  // no refusal handling and, in three cases, no debounce. A file-level set
  // cannot see that: coverage is a property of a CALL SITE, not of a filename.
  //
  // ⚠ AND THE WRAPPER LIST IS DERIVED, NOT TYPED HERE. The reason the second
  // wrapper was invisible is that the old pattern knew only the one I
  // remembered. So: read the data layer, find every function whose body calls a
  // search RPC, then find the public names those functions are exported under.
  // A third wrapper added later is picked up with nobody remembering to.
  const parse = (src, file) => {
    try {
      return babelParser.parse(src, {
        sourceType: 'unambiguous',
        errorRecovery: false,
        plugins: ['jsx', 'typescript', 'classProperties', 'optionalChaining', 'nullishCoalescingOperator'],
      });
    } catch (e) {
      assert.fail(`could not parse ${file} — the guard must never silently skip a file: ${e.message}`);
    }
  };
  // A tiny walker: no @babel/traverse dependency, and it visits only real AST
  // nodes, so a match can never come from a comment or a string.
  const walkAst = (node, fn, parents = []) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { for (const n of node) walkAst(n, fn, parents); return; }
    if (typeof node.type !== 'string') return;
    fn(node, parents);
    const next = parents.concat(node);
    for (const k of Object.keys(node)) {
      if (k === 'loc' || k === 'leadingComments' || k === 'trailingComments' || k === 'innerComments') continue;
      walkAst(node[k], fn, next);
    }
  };

  const RPCS = new Set(['search_shape_people', 'search_members']);
  // ⚠ BOTH CALL NODE TYPES. `a.b()` is a CallExpression but `a?.b?.()` is an
  // OptionalCallExpression, and the coach roster uses the optional form — a
  // CallExpression-only check walked straight past it. A guard blind to a
  // spelling the codebase actually uses is the hole it exists to close.
  const isCall = (n) => n.type === 'CallExpression' || n.type === 'OptionalCallExpression';
  const isMember = (n) => n.type === 'MemberExpression' || n.type === 'OptionalMemberExpression';
  const isRpcCall = (n) =>
    isCall(n) &&
    isMember(n.callee) &&
    ((n.callee.property.type === 'Identifier' && n.callee.property.name === 'rpc') ||
     (n.callee.property.type === 'StringLiteral' && n.callee.property.value === 'rpc')) &&
    n.arguments[0] && n.arguments[0].type === 'StringLiteral' && RPCS.has(n.arguments[0].value);

  // --- derive the wrapper method names from the data layer itself ---
  const DATA_LAYER = 'mobile-app/src/services/shapeBackend.js';
  const dlAst = parse(fs.readFileSync(DATA_LAYER, 'utf8'), DATA_LAYER);
  const rpcFnNames = new Set();
  walkAst(dlAst, (n) => {
    if (n.type !== 'FunctionDeclaration' || !n.id) return;
    let hit = false;
    walkAst(n.body, (m) => { if (isRpcCall(m)) hit = true; });
    if (hit) rpcFnNames.add(n.id.name);
  });
  assert.ok(rpcFnNames.size >= 2,
    `expected at least two search wrappers in the data layer, derived ${[...rpcFnNames].join(', ') || 'none'} — ` +
    'if the wrappers moved, this derivation (not the list) is what needs updating');

  const publicNames = new Set();
  walkAst(dlAst, (n) => {
    if (n.type !== 'ObjectProperty' || n.computed) return;
    if (n.value.type === 'Identifier' && rpcFnNames.has(n.value.name)) {
      publicNames.add(n.key.type === 'Identifier' ? n.key.name : n.key.value);
    }
  });
  assert.ok(publicNames.size >= 2,
    `derived wrapper functions ${[...rpcFnNames].join(', ')} but found no public aliases for them — ` +
    'the walk would then miss every consumer that calls through a window global');

  // --- walk the tree and check EVERY call site ---
  const roots = ['mobile-app/src', 'public/newdesign', 'src'];
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory()) { if (e.name !== 'node_modules') walk(p); }
      else if (/\.(js|jsx|mjs|ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  for (const r of roots) if (fs.existsSync(r)) walk(r);
  assert.ok(files.length > 50, 'the tree walk found almost nothing — the guard would pass vacuously');

  const isWrapperCall = (n) =>
    isCall(n) &&
    isMember(n.callee) &&
    !n.callee.computed &&
    n.callee.property.type === 'Identifier' &&
    publicNames.has(n.callee.property.name);

  // Evidence that a call site models a REFUSAL as distinct from an empty answer.
  // Two spellings, and the asymmetry is real rather than sloppy: the app asks
  // the data layer's predicate, while the three browser bundles are classic
  // scripts that cannot import it and so carry the SQLSTATE literal.
  const REFUSAL = /isRateLimited|PT429/;
  const offenders = [];
  const sites = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    if (!/search_shape_people|search_members|[.?]\s*(?:people|searchMembers)\s*[(?]/.test(src)) continue; // cheap pre-filter only
    const ast = parse(src, f);
    walkAst(ast, (n, parents) => {
      if (!isRpcCall(n) && !isWrapperCall(n)) return;
      sites.push(f);
      // The data layer PROPAGATES rather than renders — it has no notice to
      // show and must not swallow. Its own behaviour is pinned by the fallback
      // and predicate tests above.
      if (f === DATA_LAYER) return;
      const fnAncestors = parents.filter((p) =>
        p.type === 'FunctionDeclaration' || p.type === 'FunctionExpression' || p.type === 'ArrowFunctionExpression');
      const enclosing = fnAncestors.length ? fnAncestors : [ast.program];
      const covered = enclosing.some((fn) => {
        let hit = false;
        walkAst(fn, (m) => {
          if (m.type === 'Identifier' && REFUSAL.test(m.name)) hit = true;
          if (m.type === 'StringLiteral' && REFUSAL.test(m.value)) hit = true;
        });
        return hit;
      });
      if (!covered) offenders.push(`${f}:${n.loc ? n.loc.start.line : '?'}`);
    });
  }

  assert.ok(sites.length > 0, 'no search call sites found at all — the derivation no longer matches the code');
  assert.deepEqual(offenders, [],
    `these search CALL SITES cannot tell a refusal from an empty answer: ${offenders.join(', ')}. ` +
    'A refused or failed search must not render "nobody matched" — that tells a member a real person is not on Shape.');
});
