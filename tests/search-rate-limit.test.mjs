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
  assert.match(body, /if \(!searchFnMissing\(error\)\) throw error;/, 'a non-missing-function error is not propagated');
  assert.match(src, /SEARCH_MISSING_FN = new Set\(\['PGRST202', '42883'\]\)/, 'the missing-function codes are gone');
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
