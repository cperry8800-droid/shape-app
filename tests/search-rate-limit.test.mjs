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
  ];
  for (const [what, src, marker] of callers) {
    const call = src.indexOf(marker);
    assert.ok(call > 0, `${what}: call site not found`);

    // The nearest setTimeout that OPENS before the call.
    const open = src.lastIndexOf('setTimeout(', call);
    assert.ok(open > 0, `${what} fires a search with no timer ahead of it`);

    // Brace-match the setTimeout's argument list to find where its callback ends.
    let depth = 0, i = src.indexOf('(', open), close = -1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === '(') depth++;
      else if (ch === ')') { depth--; if (depth === 0) { close = i; break; } }
    }
    assert.ok(close > call, `${what}: the search call is not inside the timer callback`);

    // …and the delay is the last argument of that call.
    const args = src.slice(open, close);
    const delay = args.match(/,\s*(\d+)\s*$/);
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
  assert.match(src, /\{\s*tagState !== "ok"\s*\?/, 'the tag notice is not its own render branch');

  // the send picker already had the right shape; keep it that way
  assert.match(src, /\{state !== "ok" \? \(/, 'the send picker notice is no longer a top-level branch');
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
    ['the DM send picker', stripComments(COMMUNITY), /\{state !== "ok" \? \(/, /people\.length === 0 \?/],
    ['the post tag picker', stripComments(COMMUNITY), /\{\s*tagState !== "ok"\s*\?/, /tagResults\.length === 0 \?/],
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
test('every file that performs a search is covered by the guards above', () => {
  const GUARDED = new Set([
    'mobile-app/src/services/shapeBackend.js',            // the data layer itself
    'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx',
    'public/newdesign/pageShell.jsx',
    'public/newdesign/siteSearch.js',
    'public/newdesign/dashboardCommunity.jsx',
  ]);
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

  // A "search caller" is anything that reaches either search RPC, by either door:
  // the RPC name directly, or the data layer's ShapeSearch.people wrapper.
  const CALLS = /(rpc\(\s*['"]search_(shape_people|members)['"]|ShapeSearch\s*\??\.\s*people\s*\??\.?\s*\()/;
  const found = files.filter((f) => CALLS.test(stripComments(fs.readFileSync(f, 'utf8'))));
  assert.ok(found.length > 0, 'no search callers found at all — the pattern no longer matches the code');

  const unguarded = found.filter((f) => !GUARDED.has(f));
  assert.deepEqual(unguarded, [],
    `these files search but are not covered by the refusal/failure guards above: ${unguarded.join(', ')}. ` +
    'Add the surface to the tables above (and to GUARDED), or it will render a refused search as "nobody matched".');

  // …and the inverse: an entry that stops searching must be removed, or the set
  // silently vouches for a file that no longer has the behaviour it names.
  const stale = [...GUARDED].filter((f) => !found.includes(f));
  assert.deepEqual(stale, [], `these files are listed as search callers but no longer search: ${stale.join(', ')}`);
});
