// A static, cumulative, POSITIONAL model of who can EXECUTE each SECURITY DEFINER function,
// replayed over supabase-migrations/ in filename order.
//
// ⚠ THIS IS A TRIPWIRE FOR NEW FUNCTIONS, NOT AN AUTHORITY. Replaying the migrations against a
// real database is infeasible (the base tables were created outside the migration set: an
// earlier attempt replayed 98 files ok and 123 failed), so the model reads the statements and
// applies Postgres's rules to them. The authority is the live catalog, which
// scripts/definer-live-check.sql reads and tests/definer-live-agreement.test.mjs compares
// against. Where the two disagree the disagreement is named, never smoothed.
//
// ⚠ A TRIPWIRE FOR ACCIDENTS, NOT A PARSER, AND NOT PROOF AGAINST A MIGRATION WRITTEN TO EVADE IT. SQL has
// more spellings than any token-level reader covers, and each review of this file found another that it
// read wrongly: a quoted name that is the same name, an escape string that spells a setting, a type that is
// literally called `int`, a dollar-quote tag past 200 characters, a function called `constructor`. Each is
// closed now and pinned by a test that fails without the fix, and the next one exists too. That is why the
// authority is the live catalog, which reads pg_proc and has no spelling to get wrong, and why every shape
// this model cannot read FAILS the run instead of being skipped.
//
// THE RULES IT APPLIES, each a fact about Postgres that a per-file regex pass got wrong:
//   * A new function gets the DEFAULT ACL. On Supabase that is EXECUTE for PUBLIC (Postgres's
//     own default) AND, explicitly, for anon, authenticated and service_role, because the
//     project ships ALTER DEFAULT PRIVILEGES that grant them. So `revoke ... from public`
//     removes ONLY the PUBLIC entry: the explicit anon grant stands and the function stays
//     callable by the whole internet through /rest/v1/rpc/. anon can execute a function when
//     EITHER its own entry or PUBLIC's is set, which is what has_function_privilege reports,
//     so both are tracked and `revoke ... from anon` alone does not close a PUBLIC grant.
//   * CREATE OR REPLACE on an existing signature PRESERVES the ACL and replaces everything
//     else: the definer flag, the return type and every SET clause. A replace that omits
//     `set search_path` therefore REMOVES the pin. A replace with a different argument list
//     is a different function (a new overload with the default ACL), and the old one stays.
//   * DROP FUNCTION then CREATE resets the ACL to the default. Statement order decides:
//     a drop later in a file removes a function only if the file has not recreated it since.
//   * ALTER FUNCTION ... SET search_path writes proconfig and nothing else.
//
// EVERY STATEMENT CLASS THAT CAN CHANGE EXECUTE, THE DEFINER FLAG OR THE PIN is either
// modelled here or FAILS the model with an `unmodelled ...` entry. Silence is how this class of
// defect survives, so an unknown shape is never skipped:
//   modelled   CREATE [OR REPLACE] FUNCTION · DROP FUNCTION · ALTER FUNCTION (security, SET/RESET)
//              GRANT/REVOKE on FUNCTION/ROUTINE and ON ALL FUNCTIONS|ROUTINES IN SCHEMA, to the
//              roles the model tracks · ALTER DEFAULT PRIVILEGES (functions) · the documented DO sweeps
//   ignored    GRANT/REVOKE on tables, sequences, schemas, columns and PROCEDURES (a procedure is
//              not a function: Postgres refuses `on procedure f()` for one, and ALL PROCEDURES IN
//              SCHEMA never reaches one, so neither can change a function's ACL); DDL on tables, indexes,
//              policies, triggers, sequences, views and publications; DML; transaction control;
//              COMMENT; SET/RESET of anything but the role and the search_path; DO blocks with no
//              `execute`, no function statement and no search_path or role change in code position;
//              the documented inert DO blocks.
//              Each ignored head is an explicit entry in IRRELEVANT, DML or TXN below, or one of the
//              COMMENT / SET / DO branches of applyStatement: a head in none of them fails.
//   fails      DROP TABLE|VIEW|SEQUENCE ... CASCADE (it also drops every function whose argument or
//              result type is the row type, and recreating one gives it the default ACL again) and
//              ALTER TABLE|VIEW|SEQUENCE|TYPE|DOMAIN ... RENAME TO or SET SCHEMA (they change a type
//              name that a later GRANT or REVOKE on a function must spell); role membership grants;
//              a function GRANT/REVOKE (or ALTER DEFAULT PRIVILEGES) that
//              names a role the model does not track, because Postgres refuses the WHOLE statement
//              for a role that does not exist; ALTER DEFAULT PRIVILEGES on an object class Postgres
//              has no form for (`on procedures`: one default covers functions and procedures); CREATE/DROP/ALTER of schemas, roles, extensions,
//              procedures, aggregates and types; ALTER FUNCTION OWNER/RENAME/SET SCHEMA; `set role`
//              and `set session authorization`; top-level `set|reset search_path` and its synonyms
//              `set schema` and `select set_config('search_path' | 'role', ...)`, which change the
//              schema every later unqualified name resolves in, or who runs it; and ANY DO block
//              that runs dynamic SQL (`execute`), is written in another language, or has in code
//              position a function statement or a change of the search_path or the role (`set`,
//              `reset` or `set_config` of them, or `set_config` of a name it cannot read), unless
//              it is a documented sweep or a documented inert block. An opaque block is opaque,
//              whatever its string literals say.
//
// WHAT NO STATIC READ CAN SEE, so it is out of scope by construction: a function that itself
// runs dynamic GRANT/REVOKE and is then CALLED by a migration, a privilege changed by hand in
// the dashboard, whether a schema named in `alter default privileges ... in schema` or in
// `grant ... on all functions in schema` exists (Postgres refuses the whole statement for one that
// does not; the model applies it to the schemas it knows), and anything the platform does (the
// event-trigger function rls_auto_enable exists live and in no migration). The live comparison is
// what finds those.

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { splitStatements, tokenize, nameIs } from './sql-scan.mjs';

// ── Roles and the default ACL ────────────────────────────────────────────────

export const ACL_ROLES = ['public', 'anon', 'authenticated', 'service_role'];

/**
 * Roles a function GRANT/REVOKE may name without changing who anon, authenticated or service_role
 * can execute as. `postgres` owns everything migrations create, so its own entry is not a client
 * grant, and Supabase's own default-privilege statement names it. Any grantee in neither list makes
 * the statement unmodelled: Postgres refuses the WHOLE statement for a role that does not exist
 * (measured: `revoke all on function f() from public, anno` fails with `role "anno" does not
 * exist` and leaves the ACL exactly as it was), so applying the roles the model does know would
 * record a change no database ever made.
 */
export const INERT_ROLES = ['postgres'];
const unknownRoles = (roles) => roles.filter((r) => !ACL_ROLES.includes(r) && !INERT_ROLES.includes(r));

/**
 * The default privileges a new function receives, in the TWO layers the catalog keeps
 * (`pg_default_acl` has one row per creator per scope), because an ALTER DEFAULT PRIVILEGES
 * only edits the layer it names. Measured on PostgreSQL 16.13 with Supabase's setup:
 *
 *   global   Postgres's own default: EXECUTE for PUBLIC and nothing for anyone else.
 *   public   the schema-level grant Supabase ships: EXECUTE for anon, authenticated and
 *            service_role, explicitly.
 *
 * A new function's ACL is the UNION of the two. So `alter default privileges in schema public
 * revoke ... from public` removes nothing (PUBLIC lives in the global layer), and a GLOBAL
 * `revoke ... from anon` removes nothing either (anon lives in the schema layer). A model that
 * kept one flat default read the first of these as closing the door. It does not.
 */
// `schemas` is keyed by a schema NAME from the SQL, so it has no prototype: on a plain object a schema called
// `__proto__` would hand `alter default privileges in schema __proto__ ...` Object.prototype itself to write the
// grant into, and `constructor` or `toString` would read as a layer nobody made.
export const supabaseDefaults = () => ({
  global: { public: true, anon: false, authenticated: false, service_role: false },
  schemas: Object.assign(Object.create(null), { public: { public: false, anon: true, authenticated: true, service_role: true } }),
});

const unionAcl = (...layers) => Object.fromEntries(ACL_ROLES.map((r) => [r, layers.some((l) => l && l[r])]));

/** The ACL a function created now, in `schema`, receives. */
export const newFunctionAcl = (defaults, schema = 'public') => unionAcl(defaults.global, defaults.schemas[schema]);

/** What a fresh function in `public` gets on Supabase. */
export const supabaseDefaultAcl = () => newFunctionAcl(supabaseDefaults());

export const anonExecutable = (fn) => fn.acl.public || fn.acl.anon;
export const pgTempPinned = (fn) => Array.isArray(fn.searchPath) && fn.searchPath[fn.searchPath.length - 1] === 'pg_temp';

// ── Migration order ──────────────────────────────────────────────────────────

/**
 * The comparison key for a migration file. Names are date-prefixed, so a plain string sort
 * is chronological across days. Two things make it wrong, and this key fixes the first:
 *
 *   1. The compact form the Supabase CLI writes (`20260924020426_name.sql`): `2026-` sorts
 *      before `20260`, so a compact file sorts AFTER a dashed file dated later. Today the
 *      newest file happens to be the compact one; the next dashed file dated after it would
 *      replay in the wrong order. The compact prefix is rewritten to the dashed form.
 *   2. The extension. `foo.sql` and `foo-fix.sql` compare on `.` against `-`, and `-` sorts
 *      first, so the follow-up replays BEFORE the file it follows. The `.sql` suffix is not part
 *      of the name, so it is dropped for comparison. Measured: this alone reordered three pairs
 *      (channels / channels-visibility, public-profile-avatar / -avatar-ungated, score-momentum
 *      / score-momentum-escalation), one of which left a phantom overload behind.
 */
export function migrationOrderKey(file) {
  const bare = file.replace(/\.sql$/, '');
  const m = /^(\d{4})(\d{2})(\d{2})(\d{6})?_(.*)$/.exec(bare);
  return m ? `${m[1]}-${m[2]}-${m[3]}-${m[4] ?? ''}_${m[5]}` : bare;
}

/**
 * Same-day pairs whose NAME order is not their APPLY order. Filename order is the model's
 * whole clock, and within one date it is only alphabetical; where the later file says in its
 * own text that it reworks the earlier one, replaying them the other way round leaves the
 * superseded body as the "latest" and, when the later file drops a signature the earlier one
 * creates, resurrects a function that was meant to be gone.
 *
 * Each entry is a CLAIM about history, so the test checks what a machine can: both files
 * exist, share a date, define at least one function in common, and the constraint DOES WORK:
 * without it the pair replays in the wrong order (an entry that changes nothing is stale and
 * fails). Constraints may CHAIN (surface, then units, then prev-race), which is why the ordering
 * below settles to a fixpoint instead of making one pass.
 *
 * The other half of the question, same-day files that define one function DIFFERENTLY and are
 * NOT listed here, is not left to memory either: tests/definer-grants.test.mjs enumerates them
 * and requires each to carry a written ruling (REVIEWED_SAME_DAY_PAIRS) that order does not
 * change what the audit concludes, and reverses each one to check that it does not.
 */
export const ORDER_CONSTRAINTS = [
  { before: '2026-06-08-user-follows.sql', after: '2026-06-08-follow-requests.sql',
    why: 'follow-requests reworks the follow RPCs user-follows introduced (its header says so, and it drops the signatures user-follows creates)' },
  { before: '2026-06-08-store-redemptions.sql', after: '2026-06-08-store-fulfillment.sql',
    why: 'store-fulfillment says it "replaces the prior 3-arg version" of redeem_store_item that store-redemptions creates, and drops it' },
  { before: '2026-07-06-meal-log-points.sql', after: '2026-07-06-award-day-timezone-clamp.sql',
    why: 'the clamp is the fix to award_meal_log and award_workout_session as meal-log-points shipped them ("THE HOLE ... THE FIX")' },
  { before: '2026-09-10-pr-wall-surface.sql', after: '2026-09-10-pr-wall-units.sql',
    why: 'pr-wall-units "restates the whole function from 2026-09-10-pr-wall-surface.sql" (its own header) and drops and recreates post_my_pr_to_wall and shape_pr_wall, both of which surface creates' },
  { before: '2026-09-10-pr-wall-units.sql', after: '2026-09-10-pr-wall-prev-race.sql',
    why: 'pr-wall-prev-race calls itself "A FOLLOW-UP FILE, NOT AN EDIT TO `2026-09-10-pr-wall-units.sql`, WHICH IS ALREADY APPLIED", generated from it, and recreates post_my_pr_to_wall with the prev_value fix' },
  { before: '2026-10-09-store-credit-reservations-and-lead-boost-redemption.sql', after: '2026-10-09-lead-boost-active-key-and-expiry.sql',
    why: 'lead-boost-active-key-and-expiry calls itself "A FOLLOW-UP FILE, NOT AN EDIT TO THAT ONE, which is already applied", generated from the redemption file\'s function text, and recreates redeem_lead_boost with the expiry and the role in its active check' },
];

/**
 * Names in replay order: the plain key sort, then each constraint's `before` moved ahead of its
 * `after`. A move can undo an earlier constraint (moving units ahead of prev-race drags it ahead of
 * surface too), so the passes repeat until none moves anything; the tests permute the real
 * constraints to check that the listing order does not change the result. A set that contradicts
 * itself never settles: that is an error, not an order.
 */
export function orderMigrationFiles(names, constraints = ORDER_CONSTRAINTS) {
  const sorted = [...names].sort((a, b) => {
    const ka = migrationOrderKey(a);
    const kb = migrationOrderKey(b);
    return ka < kb ? -1 : ka > kb ? 1 : a < b ? -1 : a > b ? 1 : 0;
  });
  for (let passes = 0; ;) {
    let moved = false;
    for (const c of constraints) {
      const ib = sorted.indexOf(c.before);
      const ia = sorted.indexOf(c.after);
      if (ib === -1 || ia === -1 || ib < ia) continue;
      sorted.splice(ib, 1);
      sorted.splice(ia, 0, c.before);
      moved = true;
    }
    if (!moved) return sorted;
    if (++passes > constraints.length) throw new Error(`the migration ordering constraints contradict each other: ${constraints.map((c) => `${c.before} before ${c.after}`).join('; ')}`);
  }
}

/** The date a migration is filed under, as YYYY-MM-DD (the compact CLI form included). */
export const migrationDate = (file) => migrationOrderKey(file).slice(0, 10);

export function orderedMigrationFiles(dir, constraints = ORDER_CONSTRAINTS) {
  return orderMigrationFiles(fs.readdirSync(dir).filter((f) => f.endsWith('.sql')), constraints);
}

/** True when the constraints put `a` and `b` in a fixed order, directly or through a chain of others. */
export function constraintOrders(constraints, a, b) {
  const reaches = (from, to) => {
    const seen = new Set([from]);
    for (const x of seen) {
      if (x === to) return true;
      for (const c of constraints) if (c.before === x) seen.add(c.after);
    }
    return false;
  };
  return reaches(a, b) || reaches(b, a);
}

/**
 * Same-day pairs that define one function DIFFERENTLY and that no ordering constraint fixes, each
 * with the ruling that order does not change what the audit concludes. An entry is a CLAIM, so it
 * is checked twice by tests/definer-grants.test.mjs: the pair is still there (an entry for a pair
 * that no longer exists, or is now constrained, fails), and the claim is measured, by replaying the
 * whole tree with the pair reversed and comparing every function's classification.
 *
 * `files` is the pair; `fn` is the function, spelled `name(input types)`.
 */
export const REVIEWED_SAME_DAY_PAIRS = [
  { files: ['2026-06-07-public-profile-avatar.sql', '2026-06-07-public-profile-avatar-ungated.sql'], fn: 'get_public_profile(uuid)',
    ruling: 'superseded by later-dated files: 2026-06-08-profile-custom.sql and 2026-06-09-usernames.sql each DROP the function and CREATE it again, which resets the body and the ACL, so nothing any 2026-06-07 order leaves survives' },
  { files: ['2026-06-07-public-profile-avatar.sql', '2026-06-07-public-profile-friends-visibility.sql'], fn: 'get_public_profile(uuid)',
    ruling: 'superseded by later-dated files: 2026-06-08-profile-custom.sql and 2026-06-09-usernames.sql each DROP the function and CREATE it again, which resets the body and the ACL, so nothing any 2026-06-07 order leaves survives' },
  { files: ['2026-06-07-public-profile-avatar-ungated.sql', '2026-06-07-public-profile-friends-visibility.sql'], fn: 'get_public_profile(uuid)',
    ruling: 'superseded by later-dated files: 2026-06-08-profile-custom.sql and 2026-06-09-usernames.sql each DROP the function and CREATE it again, which resets the body and the ACL, so nothing any 2026-06-07 order leaves survives' },
  { files: ['2026-06-09-universal-search.sql', '2026-06-09-usernames.sql'], fn: 'search_shape_people(text,integer)',
    ruling: 'superseded by later-dated files: 2026-08-05-search-pattern-hardening.sql and 2026-08-29-search-rate-limit.sql re-create it with search_path = public, pg_temp and set the ACL explicitly (revoke from public and anon, grant to authenticated), so neither the body, the pin nor the ACL of a 2026-06-09 order survives' },
  { files: ['2026-06-13-client-goals-coach-read.sql', '2026-06-13-client-weigh-ins.sql'], fn: 'get_client_goals(uuid)',
    ruling: 'client-weigh-ins says it EXTENDS the coach-read function and the plain order already replays it second; both bodies open with the same is_coach_on_client(p_user_id) gate and the same share opt-out, both are SECURITY DEFINER with search_path = public, and both only `grant execute ... to authenticated`, so reversing them changes which body text is latest and nothing the audit reads' },
  { files: ['2026-06-18-score-momentum.sql', '2026-06-18-score-momentum-escalation.sql'], fn: 'award_momentum_bonus()',
    ruling: 'the escalation file says it "Replaces the Phase B award_momentum_bonus()" and to "Run AFTER 2026-06-18-score-momentum.sql", and the plain order (the .sql suffix is not part of a name) already replays them that way; both take v_uid := auth.uid() and return when it is null, both are SECURITY DEFINER with search_path = public, and both only grant to authenticated, so reversing them changes only the body text' },
  { files: ['2026-09-10-lift-units.sql', '2026-09-10-my-lifts-source.sql'], fn: 'get_my_lifts()',
    ruling: 'my-lifts-source says it is "Generated from 2026-09-10-lift-units.sql" and re-issues get_my_lifts, and the plain order already replays lift-units first; both create or replace with search_path = public, pg_temp, revoke execute from public and anon, and grant to authenticated, so reversing them changes only the body text' },
];

// ── Token helpers ────────────────────────────────────────────────────────────

const isWord = (t, ...vs) => !!t && t.k === 'word' && (vs.length === 0 || vs.includes(t.v));
const isPunct = (t, v) => !!t && t.k === 'punct' && t.v === v;
const isName = (t) => !!t && (t.k === 'word' || t.k === 'qident');
const squash = (s, n = 140) => s.replace(/\s+/g, ' ').trim().slice(0, n);

/** `a`, `a.b`, `"a"."b"` from tokens[i]. Returns { parts, next } or null. */
function readQName(tokens, i) {
  if (!isName(tokens[i])) return null;
  const parts = [tokens[i].v];
  let j = i + 1;
  while (isPunct(tokens[j], '.') && isName(tokens[j + 1])) { parts.push(tokens[j + 1].v); j += 2; }
  return { parts, next: j };
}

/** The tokens strictly inside the bracket opened at tokens[i], and the index after its closer. */
function readGroup(tokens, i) {
  const open = tokens[i].v;
  const close = open === '(' ? ')' : ']';
  let depth = 0;
  for (let j = i; j < tokens.length; j++) {
    if (isPunct(tokens[j], open)) depth++;
    else if (isPunct(tokens[j], close)) { depth--; if (depth === 0) return { inner: tokens.slice(i + 1, j), next: j + 1 }; }
  }
  return null;
}

/** Split tokens at commas that sit outside every bracket. */
function splitTopLevel(tokens) {
  const parts = [];
  let cur = [];
  let depth = 0;
  for (const t of tokens) {
    if (isPunct(t, '(') || isPunct(t, '[')) depth++;
    else if (isPunct(t, ')') || isPunct(t, ']')) depth--;
    if (depth === 0 && isPunct(t, ',')) { parts.push(cur); cur = []; continue; }
    cur.push(t);
  }
  if (cur.length) parts.push(cur);
  return parts;
}

// ── Argument lists and function identity ─────────────────────────────────────

const TYPE_ALIASES = new Map([
  ['int', 'integer'], ['int4', 'integer'], ['int2', 'smallint'], ['int8', 'bigint'],
  ['float8', 'double precision'], ['float4', 'real'], ['float', 'double precision'],
  ['bool', 'boolean'], ['varchar', 'character varying'], ['bpchar', 'character'], ['char', 'character'],
  ['decimal', 'numeric'], ['timestamptz', 'timestamp with time zone'], ['timetz', 'time with time zone'],
  ['timestamp', 'timestamp without time zone'], ['time', 'time without time zone'],
]);

/**
 * One parameter's type in the spelling Postgres prints for an identity: aliases folded, type
 * modifiers dropped (`numeric(10,2)` is `numeric`, which is how the function is identified),
 * the `public.`/`pg_catalog.` qualifier dropped, array markers kept.
 *
 * A QUOTED name is never an alias. `int` is the grammar's spelling of int4, but `"int"` is a type that is
 * literally called int, and `public."int"` is a user type, not the built-in; `"char"` is the internal one-byte
 * type, which is not `char` (bpchar) either. Folding them would make a second signature look like the first, so
 * `create or replace` of the user-typed function would overwrite the built-in-typed one in the model instead
 * of showing as the overload it is. A quoted name is kept as written, IN its quotes (a doubled quote inside
 * stays doubled), so no alias key and no other canonical text can equal it. At worst two spellings of one
 * built-in (`"int4"` and `int4`) read as two signatures, which fails loudly as an overload or an orphan and
 * hides nothing.
 */
export function canonType(tokens) {
  const words = [];
  let arr = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (isPunct(t, '(')) { const g = readGroup(tokens, i); i = g ? g.next - 1 : tokens.length; continue; }
    if (isPunct(t, '[')) { const g = readGroup(tokens, i); arr++; i = g ? g.next - 1 : tokens.length; continue; }
    if (isWord(t, 'array')) { arr++; continue; }
    if (isPunct(t, '.')) { words.push('.'); continue; }
    if (t?.k === 'qident') { words.push(`"${t.v.replace(/"/g, '""')}"`); continue; }
    if (isWord(t)) words.push(t.v);
  }
  // Joined by hand, not by a regex over the joined text: a quoted name may hold ` . ` and must stay as written.
  let base = '';
  for (const w of words) base += w === '.' || base === '' || base.endsWith('.') ? w : ` ${w}`;
  base = base.replace(/^(?:public|pg_catalog)\./, '');
  base = TYPE_ALIASES.get(base) ?? base;
  return base + '[]'.repeat(arr);
}

// A word that opens a multi-word type name. `double precision` is a TYPE, not a parameter
// called `double`; the second word is what tells them apart.
// A Map, not an object: it is looked up by a PARAMETER NAME from the SQL, and `constructor` or `__proto__` (valid
// unquoted names) would otherwise find Object.prototype's members and crash the read of a valid function.
const MULTIWORD = new Map(Object.entries({
  double: ['precision'], character: ['varying'], national: ['character', 'char'], bit: ['varying'],
  timestamp: ['with', 'without'], time: ['with', 'without'], interval: ['year', 'month', 'day', 'hour', 'minute', 'second', 'to'],
}));

/** [{ mode, name, type }] for the tokens inside a parameter list's parentheses. */
export function parseParams(inner) {
  return splitTopLevel(inner).map((p) => {
    let toks = p;
    let mode = 'in';
    if (isWord(toks[0], 'in', 'out', 'inout', 'variadic')) { mode = toks[0].v; toks = toks.slice(1); }
    let depth = 0;
    let cut = toks.length;
    for (let i = 0; i < toks.length; i++) {
      if (isPunct(toks[i], '(') || isPunct(toks[i], '[')) depth++;
      else if (isPunct(toks[i], ')') || isPunct(toks[i], ']')) depth--;
      else if (depth === 0 && (isWord(toks[i], 'default') || isPunct(toks[i], '='))) { cut = i; break; }
    }
    toks = toks.slice(0, cut);
    let name = null;
    if (toks.length >= 2 && isName(toks[0]) && !isPunct(toks[1], '.') && !isPunct(toks[1], '(') && !isPunct(toks[1], '[')
        && !(toks[0].k === 'word' && (MULTIWORD.get(toks[0].v) ?? []).includes(toks[1].v))) {
      name = toks[0].v;
      toks = toks.slice(1);
    }
    return { mode, name, type: canonType(toks) };
  });
}

const identityTypes = (params) => params.filter((p) => p.mode !== 'out').map((p) => p.type);

/** `schema.name(types)` or `schema.name` (sig === null) from tokens[i]. */
function readFunctionRef(tokens, i) {
  const q = readQName(tokens, i);
  if (!q) return null;
  let j = q.next;
  let sig = null;
  if (isPunct(tokens[j], '(')) {
    const g = readGroup(tokens, j);
    if (!g) return null;
    sig = identityTypes(parseParams(g.inner)).join(',');
    j = g.next;
  }
  const parts = q.parts;
  return { schema: parts.length >= 2 ? parts[parts.length - 2] : 'public', name: parts[parts.length - 1], sig, next: j };
}

export const fnKey = (schema, name, sig) => `${schema}.${name}(${sig})`;

// ── SET / RESET clauses (CREATE FUNCTION and ALTER FUNCTION share them) ──────

/** The elements of a `set name to a, b` value list, as Postgres stores them. */
function readSetValues(tokens, i) {
  const items = [];
  let j = i;
  for (;;) {
    let sign = '';
    if (isPunct(tokens[j], '-') || isPunct(tokens[j], '+')) { sign = tokens[j].v; j++; }
    const t = tokens[j];
    if (!t || !(t.k === 'word' || t.k === 'qident' || t.k === 'string' || t.k === 'num')) return null;
    items.push(sign + t.v);
    j++;
    if (isPunct(tokens[j], ',')) { j++; continue; }
    break;
  }
  return { items, next: j };
}

/** `set <name> { to | = } v[, v...]` or `set <name> from current`, tokens[i] being `set`. */
function readSetClause(tokens, i) {
  const q = readQName(tokens, i + 1);
  if (!q) return null;
  // A setting's name is case-insensitive and quoting does not change it (measured on PostgreSQL 16.13: `set
  // "SEARCH_PATH" = public, pg_temp` stores `search_path=public, pg_temp`, and `reset "SEARCH_PATH"` removes it).
  const name = q.parts.join('.').toLowerCase();
  let j = q.next;
  if (isWord(tokens[j], 'from') && isWord(tokens[j + 1], 'current')) return { name, fromCurrent: true, values: null, next: j + 2 };
  if (!(isWord(tokens[j], 'to') || isPunct(tokens[j], '='))) return null;
  j++;
  if (isWord(tokens[j], 'default')) return { name, fromCurrent: false, values: null, isDefault: true, next: j + 1 };
  const v = readSetValues(tokens, j);
  return v ? { name, fromCurrent: false, values: v.items, next: v.next } : null;
}

/** What proconfig stores for a search_path list: an element that is not a plain lower-case
 *  identifier is stored double-quoted, so `'public, pg_temp'` is ONE element `"public, pg_temp"`. */
export function storedSearchPath(elements) {
  return elements.map((e) => (/^[a-z_][a-z0-9_$]*$/.test(e) ? e : `"${e.replace(/"/g, '""')}"`)).join(', ');
}

// The sweep's own test for "already pinned": a word-boundary match on the stored text.
const PG_TEMP_WORD = /(^|[,\s"])pg_temp($|[,\s"])/;

// ── CREATE FUNCTION ──────────────────────────────────────────────────────────

const RETURNS_STOP = new Set(['language', 'as', 'security', 'external', 'set', 'strict', 'called', 'immutable', 'stable', 'volatile', 'not', 'leakproof', 'parallel', 'cost', 'rows', 'support', 'transform', 'window', 'returns']);

/** Parse `create [or replace] function ...`. Throws a string reason for a shape it cannot read. */
export function parseCreateFunction(tokens) {
  let i = 1;
  let orReplace = false;
  if (isWord(tokens[i], 'or') && isWord(tokens[i + 1], 'replace')) { orReplace = true; i += 2; }
  if (!isWord(tokens[i], 'function')) throw 'not a CREATE FUNCTION';
  i++;
  const q = readQName(tokens, i);
  if (!q) throw 'no function name';
  if (!isPunct(tokens[q.next], '(')) throw 'no argument list';
  const g = readGroup(tokens, q.next);
  if (!g) throw 'unbalanced argument list';
  const params = parseParams(g.inner);
  const out = {
    orReplace,
    schema: q.parts.length >= 2 ? q.parts[q.parts.length - 2] : 'public',
    name: q.parts[q.parts.length - 1],
    sig: identityTypes(params).join(','),
    // The names a body can read as caller-supplied values (OUT parameters are outputs).
    paramNames: params.filter((x) => x.mode !== 'out' && x.name).map((x) => x.name),
    definer: false, invoker: false, trigger: false, searchPath: null, body: null, language: null,
  };
  let p = g.next;
  while (p < tokens.length) {
    const t = tokens[p];
    if (!isWord(t)) throw `unexpected token ${t.raw} after the argument list`;
    switch (t.v) {
      case 'returns': {
        if (isWord(tokens[p + 1], 'null')) { p += 5; break; } // returns null on null input
        p++;
        if (isWord(tokens[p], 'setof')) p++;
        const start = p;
        while (p < tokens.length && !(isWord(tokens[p]) && RETURNS_STOP.has(tokens[p].v))) {
          if (isPunct(tokens[p], '(') || isPunct(tokens[p], '[')) { const gg = readGroup(tokens, p); if (!gg) throw 'unbalanced return type'; p = gg.next; } else p++;
        }
        const q2 = readQName(tokens, start);
        const parts = q2 ? q2.parts : [];
        const last = parts[parts.length - 1] ?? '';
        // Only the pseudo-types are trigger returns, and they live in pg_catalog: unqualified (which resolves there
        // first) or `pg_catalog.`-qualified. `public.trigger` or `public."event_trigger"` is an ordinary type with
        // that name, so a function returning one is an ordinary RPC and stays in the audit.
        const pseudo = parts.length === 1 || (parts.length === 2 && parts[0] === 'pg_catalog');
        out.trigger = !!q2 && q2.next === p && pseudo && (last === 'trigger' || last === 'event_trigger');
        break;
      }
      case 'language': out.language = tokens[p + 1]?.v ?? null; p += 2; break;
      case 'external': p++; break;
      case 'security':
        if (isWord(tokens[p + 1], 'definer')) out.definer = true;
        else if (isWord(tokens[p + 1], 'invoker')) out.invoker = true;
        else throw 'SECURITY without DEFINER or INVOKER';
        p += 2; break;
      case 'set': {
        const c = readSetClause(tokens, p);
        if (!c) throw 'unreadable SET clause';
        if (c.name === 'search_path') {
          if (c.fromCurrent) throw 'SET search_path FROM CURRENT captures a session value the model cannot know';
          out.searchPath = c.values; // null (default) means no pin
        }
        p = c.next; break;
      }
      case 'as': {
        const b = tokens[p + 1];
        if (!b || !(b.k === 'dollar' || b.k === 'string')) throw 'AS without a body';
        out.body = b.v;
        p += 2;
        if (isPunct(tokens[p], ',') && tokens[p + 1]?.k === 'string') p += 2; // AS 'obj_file', 'link_symbol'
        break;
      }
      case 'immutable': case 'stable': case 'volatile': case 'strict': case 'leakproof': case 'window': p++; break;
      case 'called': p += 4; break; // called on null input
      case 'not': p += 2; break; // not leakproof
      case 'parallel': case 'cost': case 'rows': p += 2; break;
      case 'support': { const sq = readQName(tokens, p + 1); if (!sq) throw 'SUPPORT without a name'; p = sq.next; break; }
      case 'transform': {
        p++;
        while (p < tokens.length && !(isWord(tokens[p]) && RETURNS_STOP.has(tokens[p].v) && !isWord(tokens[p], 'for', 'type'))) p++;
        break;
      }
      default: throw `unrecognised attribute ${t.v}`;
    }
  }
  if (out.definer && out.invoker) throw 'both SECURITY DEFINER and SECURITY INVOKER';
  return out;
}

// ── Same-day files that define one function ──────────────────────────────────

/**
 * The definition of a function as a later CREATE OR REPLACE would change it: the code of the body
 * (comments and whitespace are not code), the search_path, the security mode and the language.
 */
const definitionKey = (p) => JSON.stringify([tokenFingerprint(tokenize(p.body ?? '', 'body', { settings: false })), p.searchPath, p.definer, p.invoker, p.trigger, p.language]);

/**
 * Every pair of migration files dated the same day that both CREATE one function, as
 * [{ date, a, b, fn, differs }], `a` sorting before `b` under the plain order. `differs` is true when
 * the two definitions are not the same code, search_path, security mode and language.
 */
export function sameDayDefinitions(dir, files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql'))) {
  const defs = new Map();
  for (const file of files) {
    const m = new Map();
    for (const st of splitStatements(fs.readFileSync(path.join(dir, file), 'utf8'), file)) {
      const t = st.tokens;
      if (!(isWord(t[0], 'create') && (isWord(t[1], 'function') || (isWord(t[1], 'or') && isWord(t[3], 'function'))))) continue;
      let p;
      try { p = parseCreateFunction(t); } catch { continue; }
      m.set(fnKey(p.schema, p.name, p.sig), definitionKey(p));
    }
    defs.set(file, m);
  }
  const byDate = new Map();
  for (const f of files) byDate.set(migrationDate(f), [...(byDate.get(migrationDate(f)) ?? []), f]);
  const out = [];
  for (const [date, group] of byDate) {
    const sorted = orderMigrationFiles(group, []);
    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        for (const [key, dk] of defs.get(sorted[i])) {
          if (defs.get(sorted[j]).has(key)) out.push({ date, a: sorted[i], b: sorted[j], fn: key.replace(/^public\./, ''), differs: dk !== defs.get(sorted[j]).get(key) });
        }
      }
    }
  }
  return out;
}

/** The pairs `sameDayDefinitions` found that differ, are not ordered by a constraint, and carry no ruling. */
export function unresolvedSameDayPairs(pairs, constraints = ORDER_CONSTRAINTS, reviewed = REVIEWED_SAME_DAY_PAIRS) {
  return pairs.filter((p) => p.differs
    && !constraintOrders(constraints, p.a, p.b)
    && !reviewed.some((r) => r.fn === p.fn && r.files.includes(p.a) && r.files.includes(p.b)));
}

// ── GRANT / REVOKE ───────────────────────────────────────────────────────────

const OBJECT_KINDS = new Set(['table', 'sequence', 'schema', 'database', 'domain', 'foreign', 'language', 'large', 'parameter', 'tablespace', 'type']);
const ROLE_NOISE = new Set(['cascade', 'restrict']);

/** Parse the role list after TO/FROM. Returns { roles, next } with roles as ACL role names or the raw name. */
function readRoles(tokens, i) {
  const roles = [];
  let j = i;
  for (;;) {
    if (isWord(tokens[j], 'group')) j++;
    const t = tokens[j];
    if (!t || !(t.k === 'word' || t.k === 'qident')) return null;
    roles.push(t.v);
    j++;
    if (isPunct(tokens[j], ',')) { j++; continue; }
    break;
  }
  return { roles, next: j };
}

/**
 * Parse a GRANT or REVOKE. Returns
 *   { verb, grantOptionOnly, privs, target: { kind: 'function', refs } | { kind: 'all-functions', schemas }
 *                                         | { kind: 'other', what } | { kind: 'membership' }, roles }
 * or throws a string reason. `other` is anything that cannot change a function's ACL, a PROCEDURE
 * (`on procedure f()`, `on all procedures in schema`) included: Postgres reads PROCEDURE as procedures
 * only, so after `revoke all on all procedures in schema public from public, anon` a function is
 * still executable by anon, and `on procedure f()` naming a function is an error that applies nothing
 * (both measured on PostgreSQL 16.13). `routine` and `functions` DO reach functions.
 */
export function parseAclStatement(tokens) {
  const verb = tokens[0].v;
  let i = 1;
  let grantOptionOnly = false;
  if (verb === 'revoke' && isWord(tokens[i], 'grant') && isWord(tokens[i + 1], 'option') && isWord(tokens[i + 2], 'for')) { grantOptionOnly = true; i += 3; }

  const privs = [];
  if (isWord(tokens[i], 'all')) { privs.push('all'); i++; if (isWord(tokens[i], 'privileges')) i++; }
  else {
    for (;;) {
      if (!isWord(tokens[i])) break;
      privs.push(tokens[i].v);
      i++;
      if (isPunct(tokens[i], '(')) { const g = readGroup(tokens, i); if (!g) throw 'unbalanced column list'; i = g.next; }
      if (isPunct(tokens[i], ',')) { i++; continue; }
      break;
    }
  }

  const toWord = verb === 'grant' ? 'to' : 'from';
  let target;
  if (!isWord(tokens[i], 'on')) {
    target = { kind: 'membership' };
  } else {
    i++;
    const kw = tokens[i];
    if (isWord(kw, 'function', 'procedure', 'routine')) {
      i++;
      const refs = [];
      for (;;) {
        const r = readFunctionRef(tokens, i);
        if (!r) throw 'unreadable function reference';
        refs.push(r);
        i = r.next;
        if (isPunct(tokens[i], ',')) { i++; continue; }
        break;
      }
      target = kw.v === 'procedure' ? { kind: 'other', what: 'procedure' } : { kind: 'function', routineWord: kw.v, refs };
    } else if (isWord(kw, 'all') && isWord(tokens[i + 1], 'functions', 'procedures', 'routines') && isWord(tokens[i + 2], 'in') && isWord(tokens[i + 3], 'schema')) {
      const routines = tokens[i + 1].v;
      i += 4;
      const schemas = [];
      for (;;) {
        if (!isName(tokens[i])) throw 'unreadable schema name';
        schemas.push(tokens[i].v);
        i++;
        if (isPunct(tokens[i], ',')) { i++; continue; }
        break;
      }
      target = routines === 'procedures' ? { kind: 'other', what: 'all procedures in schema' } : { kind: 'all-functions', schemas };
    } else {
      // Anything else is a privilege on a non-function object. Skip its name list up to TO/FROM.
      const what = isWord(kw, 'all') ? `all ${tokens[i + 1]?.v} in schema` : (isWord(kw) && OBJECT_KINDS.has(kw.v) ? kw.v : 'table');
      let depth = 0;
      while (i < tokens.length && !(depth === 0 && isWord(tokens[i], toWord))) {
        if (isPunct(tokens[i], '(')) depth++;
        else if (isPunct(tokens[i], ')')) depth--;
        i++;
      }
      target = { kind: 'other', what };
    }
  }

  // Membership grants have no ON: `grant a to b` — the privileges list above swallowed the role.
  if (target.kind === 'membership') return { verb, grantOptionOnly, privs, target, roles: [] };

  if (!isWord(tokens[i], toWord)) throw `expected ${toWord.toUpperCase()}`;
  const r = readRoles(tokens, i + 1);
  if (!r) throw 'unreadable role list';
  i = r.next;
  while (i < tokens.length) {
    if (isWord(tokens[i], 'with') && isWord(tokens[i + 1], 'grant') && isWord(tokens[i + 2], 'option')) { i += 3; continue; }
    if (isWord(tokens[i], 'with') && isWord(tokens[i + 1], 'admin', 'inherit', 'set')) throw 'role option clause';
    if (isWord(tokens[i], 'granted') && isWord(tokens[i + 1], 'by')) {
      const g = readRoles(tokens, i + 2);
      if (!g) throw 'unreadable GRANTED BY';
      // Measured on PostgreSQL 16.13: the grantor must be the current user (`grantor must be current user`
      // otherwise), and migrations run as postgres. Any other grantor means Postgres refuses the whole statement,
      // so the model must not apply it.
      if (g.roles.some((r) => r !== 'postgres')) throw `GRANTED BY ${g.roles.join(', ')}: Postgres refuses a grantor that is not the current user (postgres, for a migration), so the statement is not applied`;
      i = g.next; continue;
    }
    if (isWord(tokens[i]) && ROLE_NOISE.has(tokens[i].v)) { i++; continue; }
    throw `unexpected trailing ${tokens[i].raw}`;
  }
  return { verb, grantOptionOnly, privs, target, roles: r.roles };
}

// ── ALTER FUNCTION ───────────────────────────────────────────────────────────

/** Parse `alter function ref action...`. Returns { ref, actions } or throws a string reason. */
export function parseAlterFunction(tokens) {
  const ref = readFunctionRef(tokens, 2);
  if (!ref) throw 'unreadable function reference';
  const actions = [];
  let p = ref.next;
  while (p < tokens.length) {
    const t = tokens[p];
    if (!isWord(t)) throw `unexpected token ${t.raw}`;
    if (t.v === 'external') { p++; continue; }
    if (t.v === 'security') {
      if (isWord(tokens[p + 1], 'definer')) actions.push({ op: 'security', definer: true });
      else if (isWord(tokens[p + 1], 'invoker')) actions.push({ op: 'security', definer: false });
      else throw 'SECURITY without DEFINER or INVOKER';
      p += 2; continue;
    }
    if (t.v === 'set') {
      if (isWord(tokens[p + 1], 'schema')) throw 'ALTER FUNCTION ... SET SCHEMA moves the function';
      const c = readSetClause(tokens, p);
      if (!c) throw 'unreadable SET clause';
      if (c.name === 'search_path') {
        if (c.fromCurrent) throw 'SET search_path FROM CURRENT captures a session value the model cannot know';
        actions.push({ op: 'search_path', value: c.values });
      }
      p = c.next; continue;
    }
    if (t.v === 'reset') {
      if (isWord(tokens[p + 1], 'all')) { actions.push({ op: 'reset-all' }); p += 2; continue; }
      const q = readQName(tokens, p + 1);
      if (!q) throw 'unreadable RESET';
      if (q.parts.join('.').toLowerCase() === 'search_path') actions.push({ op: 'search_path', value: null });
      p = q.next; continue;
    }
    if (t.v === 'owner' || t.v === 'rename' || t.v === 'depends' || t.v === 'no') throw `ALTER FUNCTION ... ${t.v.toUpperCase()} is not modelled`;
    if (['immutable', 'stable', 'volatile', 'strict', 'leakproof', 'restrict'].includes(t.v)) { p++; continue; }
    if (t.v === 'called') { p += 4; continue; }
    if (t.v === 'returns') { p += 5; continue; }
    if (t.v === 'not') { p += 2; continue; }
    if (['parallel', 'cost', 'rows'].includes(t.v)) { p += 2; continue; }
    if (t.v === 'support') { const sq = readQName(tokens, p + 1); if (!sq) throw 'SUPPORT without a name'; p = sq.next; continue; }
    throw `unrecognised action ${t.v}`;
  }
  return { ref, actions };
}

// ── ALTER DEFAULT PRIVILEGES ─────────────────────────────────────────────────

/** Parse `alter default privileges [for role r,..] [in schema s,..] grant|revoke ...`. */
export function parseAlterDefaultPrivileges(tokens) {
  let i = 3;
  let forRoles = null;
  let schemas = null;
  for (;;) {
    if (isWord(tokens[i], 'for') && isWord(tokens[i + 1], 'role', 'user')) {
      const r = readRoles(tokens, i + 2);
      if (!r) throw 'unreadable FOR ROLE';
      forRoles = r.roles; i = r.next; continue;
    }
    if (isWord(tokens[i], 'in') && isWord(tokens[i + 1], 'schema')) {
      const s = [];
      let j = i + 2;
      for (;;) {
        if (!isName(tokens[j])) throw 'unreadable IN SCHEMA';
        s.push(tokens[j].v); j++;
        if (isPunct(tokens[j], ',')) { j++; continue; }
        break;
      }
      schemas = s; i = j; continue;
    }
    break;
  }
  if (!isWord(tokens[i], 'grant', 'revoke')) throw 'expected GRANT or REVOKE';
  const verb = tokens[i].v;
  i++;
  let grantOptionOnly = false;
  if (verb === 'revoke' && isWord(tokens[i], 'grant') && isWord(tokens[i + 1], 'option') && isWord(tokens[i + 2], 'for')) { grantOptionOnly = true; i += 3; }
  const privs = [];
  if (isWord(tokens[i], 'all')) { privs.push('all'); i++; if (isWord(tokens[i], 'privileges')) i++; }
  else for (;;) { if (!isWord(tokens[i])) break; privs.push(tokens[i].v); i++; if (isPunct(tokens[i], ',')) { i++; continue; } break; }
  if (!isWord(tokens[i], 'on')) throw 'expected ON';
  const objects = tokens[i + 1]?.v;
  // No `procedures`: Postgres has no such form here (`alter default privileges ... grant execute on procedures`
  // is a syntax error on 16.13; FUNCTIONS and ROUTINES are the same word, and one default covers both). A
  // migration holding it never ran, so reading it as a change to the function defaults would model an ACL the
  // database never had. It is refused as an unmodelled statement instead.
  if (!['functions', 'routines', 'tables', 'sequences', 'types', 'schemas'].includes(objects)) throw `unrecognised object class ${objects}`;
  i += 2;
  const toWord = verb === 'grant' ? 'to' : 'from';
  if (!isWord(tokens[i], toWord)) throw `expected ${toWord.toUpperCase()}`;
  const r = readRoles(tokens, i + 1);
  if (!r) throw 'unreadable role list';
  return { verb, grantOptionOnly, privs, objects, forRoles, schemas, roles: r.roles };
}

// ── DO blocks ────────────────────────────────────────────────────────────────

// A DO block is opaque, so what it does to a function is judged by what a static read can see,
// and nothing more:
//   * a function statement in CODE position is an effect (the patterns below). A guard block that
//     merely MENTIONS `grant` in an error message is not a statement, so strings are not scanned;
//   * so is a change of the search_path or the role in code position, with no `execute` needed:
//     `perform set_config('search_path', 'private', false)`, a bare `set search_path to private;`
//     and `set schema 'private'` each leave the session resolving later unqualified names in
//     another schema, and `set session role anon` leaves it running as anon (all measured on
//     PostgreSQL 16.13, inside a DO block). `set_config` of any other parameter is harmless and
//     stays inert; `set_config` of a name the model cannot read is not, because it could be one
//     of these. `set local` lasts only the transaction, which a migration may span, so it counts.
//     The patterns read WORDS, so a column named `role`, `schema` or `search_path` in an UPDATE's
//     SET list reads as the statement and is refused too: that over-flags, on purpose, because
//     telling a column from a parameter takes a parser, and a quoted name counts too (`set "role" to
//     anon` works). A documented inert entry cannot excuse it (those excuse dynamic SQL only); the way
//     out is to run the UPDATE outside the DO block. No block in the tree is affected;
//   * ANY `execute` is an effect. Dynamic SQL is text the block assembles when it runs, and a scan
//     of the string literals it happens to contain cannot say what it assembles. Each of these
//     read as inert to such a scan, and each changes who can execute what: an `execute` whose text
//     is joined from parts (`'GRANT EXECUTE ON ' || 'FUNCTION public.g() TO anon'`), a
//     `format('REVOKE ALL ON %s %s FROM anon', kind, sig)` driven by a pg_proc loop, and SQL held
//     in a nested dollar quote (`execute $q$ revoke ... $q$`).
// So an opaque block is one of three things: a documented sweep (DO_SWEEPS: the model implements
// its exact effect), a documented inert block (DO_INERT: a person read it, and the entry is keyed
// by file AND a fingerprint of the block, so an edit re-opens the question), or an unmodelled
// statement that fails the run.
const FN_EFFECT_PATTERNS = [
  { label: 'GRANT/REVOKE on functions', re: /\b(?:grant|revoke)\b[^;]*?\bon\s+(?:function|procedure|routine|all\s+(?:functions|procedures|routines))\b/i },
  { label: 'ALTER FUNCTION / DEFAULT PRIVILEGES', re: /\balter\s+(?:function|procedure|routine|default\s+privileges)\b/i },
  { label: 'CREATE FUNCTION', re: /\bcreate\s+(?:or\s+replace\s+)?(?:function|procedure)\b/i },
  { label: 'DROP of something functions depend on', re: /\bdrop\s+(?:function|procedure|routine|schema|type|extension|owned)\b/i },
  { label: 'SET ROLE', re: /\b(?:set|reset)\s+(?:(?:local|session)\s+)?role\b/i },
  { label: 'SET search_path / SET SCHEMA', re: /\b(?:set|reset)\s+(?:(?:local|session)\s+)?(?:search_path|schema)\b/i },
  { label: 'SET SESSION AUTHORIZATION', re: /\bset\s+session\s+authorization\b/i },
];

/**
 * A stable fingerprint of a token list: 16 hex characters of a SHA-256 over each token's kind and
 * source text. Whitespace and comments between tokens are not tokens, so reformatting a block or
 * rewording a comment leaves it alone; any change to the code changes it.
 */
export function tokenFingerprint(tokens) {
  return crypto.createHash('sha256').update(tokens.map((t) => `${t.k}\u0001${t.raw}`).join('\u0002')).digest('hex').slice(0, 16);
}

/**
 * What a DO statement can do, for its tokens:
 *   effect          it can change a function, so it must be documented or it fails
 *   dynamic         it runs `execute`
 *   staticEffect    a function statement, or a change of the search_path or role, in code position (a
 *                   documented inert entry cannot excuse this)
 *   tag             the dollar tag ('' for `$$`) or '' for a quoted body
 *   fingerprint     of the block's own code tokens (null when there is no readable body)
 *   why             one line saying what made it an effect, for the failure message
 * The body is the code literal, which is NOT the first string in the statement: a quoted
 * `language 'plpgsql'` sits before it and Postgres accepts that spelling.
 */
export function classifyDoBlock(tokens) {
  let lang = 'plpgsql';
  let body = null;
  for (let i = 1; i < tokens.length; i++) {
    const t = tokens[i];
    if (isWord(t, 'language') && tokens[i + 1]) { lang = String(tokens[i + 1].v).toLowerCase(); i++; continue; }
    if (!body && (t.k === 'dollar' || t.k === 'string')) body = t;
  }
  const opaque = { effect: true, dynamic: false, staticEffect: false, tag: null, fingerprint: null };
  if (!body) return { ...opaque, why: 'it has no readable body' };
  const tag = body.k === 'dollar' ? body.tag : '';
  if (lang !== 'plpgsql') return { ...opaque, tag, why: `it is written in ${lang}, which the model cannot read` };
  const inner = tokenize(body.v, 'do-block');
  const dynamic = inner.some((t) => isWord(t, 'execute'));
  // Words, and quoted identifiers: `set "search_path" to private` and `set "role" to anon` work (measured on
  // PostgreSQL 16.13), because quoting does not change a setting's name. A setting's name is case-insensitive
  // and the patterns below are too, so `set "SEARCH_PATH" to private` reads the same way.
  const code = inner.filter((t) => t.k === 'word' || t.k === 'qident').map((t) => String(t.v)).join(' ');
  // set_config is a function call, so it is read from the tokens (its first argument is a string
  // literal, which `code` leaves out), the way the top-level path reads it.
  const cfg = setConfigTarget(inner);
  const cfgHit = cfg === null ? null : cfg === '<not a literal>'
    ? { phrase: 'it calls set_config with a parameter name the model cannot read, which could be the search_path or the role' }
    : { phrase: `it calls set_config('${cfg}'), which changes ${cfg === 'search_path' ? 'the schema every later unqualified name resolves in' : 'who the session runs as'}` };
  const hit = FN_EFFECT_PATTERNS.find((p) => p.re.test(code)) ?? cfgHit;
  const why = hit ? (hit.phrase ?? `it has a ${hit.label} statement in code position`) : dynamic ? 'it runs dynamic SQL (`execute`), which a static read cannot resolve' : null;
  return { effect: dynamic || !!hit, dynamic, staticEffect: !!hit, tag, fingerprint: tokenFingerprint(inner), why };
}

/**
 * The DO blocks that DO change a function, each with its EXACT effect, keyed by file and dollar
 * tag, and by `fingerprint` (of the block's code tokens, see tokenFingerprint) so that editing the
 * block re-opens the question instead of silently applying a stale reading. Adding one here is a
 * claim about what a block does to the catalog, so it names the effect and the model implements
 * exactly that.
 *
 *   pg-temp-append   for every function in `public` that is SECURITY DEFINER and already
 *                    carries a search_path without a pg_temp entry, append `pg_temp`.
 *                    Functions with no search_path are skipped (the block's own guard raises
 *                    if any exist), and it changes NOTHING else: not the ACL, the flag or the body.
 *                    It is a SNAPSHOT of the functions that exist when it runs: a function
 *                    created or replaced after it is not pinned by it.
 */
export const DO_SWEEPS = [
  { file: '2026-08-09-definer-pg-temp-sweep.sql', tag: 'pin', effect: 'pg-temp-append', fingerprint: 'a73fa8456946350b' },
];

/**
 * The DO blocks that run dynamic SQL and were READ by a person and found not to touch a function's
 * ACL, its definer flag or its search_path. Each is keyed by file and fingerprint, and `reads` says
 * what it runs, so the claim can be checked against the block: tests/definer-grants.test.mjs finds
 * each entry's block in its file, confirms it is dynamic with no function statement in code
 * position, and fails an entry the replay never used.
 */
export const DO_INERT = [
  { file: '2026-06-02-chat-realtime.sql', fingerprint: 'e889dff4c8cb10ad',
    reads: 'runs `alter publication supabase_realtime add table` for public.channel_messages and public.messages, each behind a pg_publication_tables existence check: publication membership, which no function ACL, definer flag or search_path depends on' },
  { file: '2026-08-06-guardrail-health-runs.sql', fingerprint: '5164b6386b50a906',
    reads: 'loops over the columns of public.guardrail_health_runs and runs `revoke all (column) on table public.guardrail_health_runs from public, anon, authenticated, service_role`: a column privilege on one table, never a function' },
];

// CREATE EXTENSION, documented one extension at a time. An extension's install script is not in the
// migration, so the replay cannot read what it creates; each entry is one a person read. Only the exact
// form `create extension [if not exists] <name> with schema <schema>` matches: a version, CASCADE or a
// missing or different schema still fails, because each changes what is installed or where.
export const EXTENSIONS_INERT = [
  { name: 'btree_gist', schema: 'extensions', file: '2026-10-07-sessions-no-overlap.sql',
    reads: 'GiST operator classes for scalar types (so provider_role and provider_id can sit beside a range in the sessions_no_overlap exclusion constraint) and their C support functions, all SECURITY INVOKER, installed in the extensions schema: nothing in public, and no existing function\'s ACL, definer flag or search_path changes' },
];

function inertExtension(t) {
  let i = 2;
  if (isWord(t[i], 'if') && isWord(t[i + 1], 'not') && isWord(t[i + 2], 'exists')) i += 3;
  if (!(isWord(t[i]) && isWord(t[i + 1], 'with') && isWord(t[i + 2], 'schema') && isWord(t[i + 3]))) return null;
  if (t.length !== i + 4) return null;
  return EXTENSIONS_INERT.find((e) => e.name === t[i].v && e.schema === t[i + 3].v) ?? null;
}

// ── Statements that cannot change a function ─────────────────────────────────

// Each entry is the head of a statement class known NOT to change EXECUTE, the definer flag or
// the pin. A head that is in neither this table nor a modelled class FAILS the model, so a new
// kind of statement is a decision someone made, not a default.
const IRRELEVANT = {
  create: new Set(['table', 'index', 'policy', 'trigger', 'sequence', 'view', 'publication', 'type', 'domain']),
  alter: new Set(['table', 'policy', 'sequence', 'index', 'publication', 'view', 'type', 'domain']),
  drop: new Set(['table', 'index', 'policy', 'trigger', 'sequence', 'view', 'publication']),
};
// DDL that is irrelevant UNTIL it carries one of these. CASCADE on a table or a view also drops every
// function whose argument or result type is its row type (measured on PostgreSQL 16.13: `drop table t
// cascade` dropped uses_tt(tt), while a plain `drop table t` was refused), and the function made again
// afterwards has the default ACL, which a replay that kept the old one would read as still closed.
// A RENAME TO or SET SCHEMA changes a type name that a later GRANT or REVOKE on a function spells, so the
// replay would look the function up under a name it no longer has (Postgres: `type "public.tt2" does not
// exist`). RENAME COLUMN, RENAME CONSTRAINT and `RENAME a TO b` are about columns and stay ignored.
const CASCADE_DROPS = new Set(['table', 'view', 'sequence']);
const IDENTITY_ALTERS = new Set(['table', 'view', 'sequence', 'type', 'domain']);
const renamesOrMoves = (t) => t.some((x, i) => (isWord(x, 'rename') && isWord(t[i + 1], 'to')) || (isWord(x, 'set') && isWord(t[i + 1], 'schema')));

const DML = new Set(['insert', 'update', 'delete', 'select', 'with', 'values', 'truncate', 'lock', 'notify', 'analyze', 'vacuum', 'refresh', 'listen', 'unlisten', 'explain']);
const TXN = new Set(['begin', 'start', 'commit', 'end', 'rollback', 'abort', 'savepoint', 'release', 'show']);
const CREATE_MODIFIERS = new Set(['or', 'replace', 'unique', 'temp', 'temporary', 'unlogged', 'global', 'local', 'recursive', 'materialized', 'constraint']);

/**
 * The first `set_config('name', ...)` call in a statement that sets the role or the search_path
 * (or names something the model cannot read: a first argument that is not a string literal), as the
 * text to quote; null when there is none. `select set_config('request.jwt.claim.sub', ...)` is a
 * setting that changes no name resolution and no role, and is left alone.
 */
function setConfigTarget(tokens) {
  for (let i = 0; i + 2 < tokens.length; i++) {
    if (!nameIs(tokens[i], 'set_config') || !isPunct(tokens[i + 1], '(')) continue;
    const first = tokens[i + 2];
    // The name counts only as the WHOLE first argument: `'search_' || 'path'` and `'search_path'::text` start
    // with a string literal and mean something else (both take effect: measured on PostgreSQL 16.13).
    if (first.k !== 'string' || !isPunct(tokens[i + 3], ',')) return '<not a literal>';
    const name = first.v.toLowerCase();
    if (name === 'search_path' || name === 'role' || name === 'session_authorization') return name;
  }
  return null;
}

/** The object word of a CREATE/ALTER/DROP statement, past its modifiers. */
function objectWord(tokens) {
  let i = 1;
  while (isWord(tokens[i]) && CREATE_MODIFIERS.has(tokens[i].v)) i++;
  return tokens[i]?.k === 'word' ? tokens[i].v : null;
}

// ── The model ────────────────────────────────────────────────────────────────

export function createModel({ doSweeps = DO_SWEEPS, doInert = DO_INERT } = {}) {
  return {
    // The DO blocks the model knows about. The shipped lists by default; a test passes its own to
    // drive the rules (a stale fingerprint, a static effect an entry must not excuse) without
    // editing a real migration.
    doSweeps,
    doInert,
    fns: new Map(),
    defaults: supabaseDefaults(),
    unmodelled: [], // statements that could change a function and are not understood
    orphans: [], // ACL / ALTER / DROP statements naming a function no earlier statement created
    duplicateCreates: [], // plain CREATE FUNCTION of a signature that already exists (Postgres errors)
    ambiguous: [], // name-only references that match more than one overload
    sweeps: [], // documented DO sweeps as they ran
    counts: {}, // statements by class, so a classifier that stops recognising one is visible
    files: [],
  };
}

const bump = (model, kind) => { model.counts[kind] = (model.counts[kind] || 0) + 1; };
const site = (stmt) => `${stmt.file}:${stmt.line}`;

function logOp(fn, stmt, op) { fn.history.push(`${site(stmt)} ${op}`); }

function reject(model, stmt, prefix, why) {
  model.unmodelled.push({ file: stmt.file, line: stmt.line, why, text: squash(stmt.text), message: `${prefix}: ${site(stmt)} ${why} — ${squash(stmt.text, 110)}` });
}

const mapRoles = (roles) => roles.filter((r) => ACL_ROLES.includes(r));

/** The `unmodelled` reason for a grantee list that names a role the model does not track. */
const unknownRoleReason = (verb, bad) => `${verb.toUpperCase()} names ${bad.map((r) => `"${r}"`).join(', ')}, which is not a role the model tracks (${[...ACL_ROLES, ...INERT_ROLES].join(', ')}). Postgres refuses the whole statement for a role that does not exist, so it is not applied; fix the spelling, or add the role to INERT_ROLES after checking it holds no client privilege`;

/** Functions a reference points at: the exact signature, or every overload of a bare name. */
function resolveRef(model, ref) {
  if (ref.sig !== null) {
    const fn = model.fns.get(fnKey(ref.schema, ref.name, ref.sig));
    return fn ? [fn] : [];
  }
  return [...model.fns.values()].filter((f) => f.schema === ref.schema && f.name === ref.name);
}

function applyCreate(model, stmt) {
  let p;
  try { p = parseCreateFunction(stmt.tokens); } catch (e) { return reject(model, stmt, 'unmodelled function statement', String(e)); }
  const key = fnKey(p.schema, p.name, p.sig);
  const existing = model.fns.get(key);
  if (existing && !p.orReplace) {
    // Postgres refuses this (`already exists`), so the statement has no effect on a database
    // where the function is already there. Recorded, not replayed.
    model.duplicateCreates.push({ key, site: site(stmt) });
    return;
  }
  const fn = existing ?? {
    key, schema: p.schema, name: p.name, sig: p.sig,
    // A function created now receives the CURRENT default ACL. A replace keeps the ACL it has.
    acl: newFunctionAcl(model.defaults, p.schema),
    // Where anon was granted EXECUTE by name (not by the default ACL) and has not been revoked
    // since: the difference between a function anon can run on purpose and one it can run
    // because nothing took the default away.
    anonGrantSite: null,
    history: [],
  };
  fn.definer = p.definer;
  fn.paramNames = p.paramNames;
  fn.trigger = p.trigger;
  fn.searchPath = p.searchPath; // a replace REPLACES the config: no SET clause means no pin
  fn.body = p.body;
  fn.language = p.language;
  fn.file = stmt.file;
  fn.line = stmt.line;
  model.fns.set(key, fn);
  logOp(fn, stmt, existing ? 'create-or-replace (ACL kept)' : 'create (default ACL)');
}

function applyDrop(model, stmt) {
  const t = stmt.tokens;
  let i = 2;
  let ifExists = false;
  if (isWord(t[i], 'if') && isWord(t[i + 1], 'exists')) { ifExists = true; i += 2; }
  const refs = [];
  for (;;) {
    const r = readFunctionRef(t, i);
    if (!r) return reject(model, stmt, 'unmodelled function statement', 'unreadable DROP FUNCTION reference');
    refs.push(r);
    i = r.next;
    if (isPunct(t[i], ',')) { i++; continue; }
    break;
  }
  for (; i < t.length; i++) if (!isWord(t[i], 'cascade', 'restrict')) return reject(model, stmt, 'unmodelled function statement', `unexpected trailing ${t[i].raw} in DROP FUNCTION`);
  for (const r of refs) {
    const hits = resolveRef(model, r);
    if (hits.length === 0) { if (!ifExists) model.orphans.push({ op: 'drop', site: site(stmt), ref: `${r.schema}.${r.name}(${r.sig ?? ''})` }); continue; }
    if (hits.length > 1) { model.ambiguous.push({ op: 'drop', site: site(stmt), ref: `${r.schema}.${r.name}` }); continue; }
    model.fns.delete(hits[0].key);
  }
}

function applyAlter(model, stmt) {
  let a;
  try { a = parseAlterFunction(stmt.tokens); } catch (e) { return reject(model, stmt, 'unmodelled function statement', String(e)); }
  const hits = resolveRef(model, a.ref);
  if (hits.length === 0) { model.orphans.push({ op: 'alter', site: site(stmt), ref: `${a.ref.schema}.${a.ref.name}(${a.ref.sig ?? ''})` }); return; }
  if (hits.length > 1) { model.ambiguous.push({ op: 'alter', site: site(stmt), ref: `${a.ref.schema}.${a.ref.name}` }); return; }
  const fn = hits[0];
  for (const act of a.actions) {
    if (act.op === 'security') fn.definer = act.definer;
    else if (act.op === 'search_path') fn.searchPath = act.value;
    else if (act.op === 'reset-all') fn.searchPath = null;
  }
  logOp(fn, stmt, `alter ${a.actions.map((x) => x.op).join(',') || '(no effect)'}`);
}

/** GRANT/REVOKE EXECUTE (or ALL) on a set of functions. */
function changeAcl(fns, a, stmt) {
  if (a.grantOptionOnly) return; // removes the right to re-grant, not the privilege itself
  const value = a.verb === 'grant';
  for (const fn of fns) {
    for (const r of mapRoles(a.roles)) fn.acl[r] = value;
    if (a.roles.includes('anon')) fn.anonGrantSite = value ? site(stmt) : null;
    logOp(fn, stmt, `${a.verb} ${a.privs.join(',')} ${a.verb === 'grant' ? 'to' : 'from'} ${a.roles.join(',')}`);
  }
}

function applyAcl(model, stmt) {
  let a;
  try { a = parseAclStatement(stmt.tokens); } catch (e) { return reject(model, stmt, 'unmodelled grant statement', String(e)); }
  if (a.target.kind === 'membership') {
    return reject(model, stmt, 'unmodelled grant statement', 'a role membership grant can change what anon or authenticated inherit');
  }
  if (a.target.kind === 'other') { bump(model, 'acl:other-object'); return; }
  const badPriv = a.privs.filter((x) => x !== 'execute' && x !== 'all');
  if (badPriv.length) return reject(model, stmt, 'unmodelled grant statement', `privilege ${badPriv.join(',')} on a function`);
  const badRoles = unknownRoles(a.roles);
  if (badRoles.length) return reject(model, stmt, 'unmodelled grant statement', unknownRoleReason(a.verb, badRoles));
  bump(model, 'acl:function');
  if (a.target.kind === 'all-functions') {
    const fns = [...model.fns.values()].filter((f) => a.target.schemas.includes(f.schema));
    changeAcl(fns, a, stmt);
    return;
  }
  for (const r of a.target.refs) {
    const hits = resolveRef(model, r);
    if (hits.length === 0) { model.orphans.push({ op: a.verb, site: site(stmt), ref: `${r.schema}.${r.name}(${r.sig ?? ''})` }); continue; }
    if (hits.length > 1) { model.ambiguous.push({ op: a.verb, site: site(stmt), ref: `${r.schema}.${r.name}` }); continue; }
    changeAcl(hits, a, stmt);
  }
}

function applyDefaultPrivileges(model, stmt) {
  let a;
  try { a = parseAlterDefaultPrivileges(stmt.tokens); } catch (e) { return reject(model, stmt, 'unmodelled grant statement', String(e)); }
  if (!['functions', 'routines'].includes(a.objects)) return; // tables, sequences, types, schemas
  const badPriv = a.privs.filter((x) => x !== 'execute' && x !== 'all');
  if (badPriv.length) return reject(model, stmt, 'unmodelled grant statement', `privilege ${badPriv.join(',')} on functions`);
  const badRoles = unknownRoles(a.roles);
  if (badRoles.length) return reject(model, stmt, 'unmodelled grant statement', unknownRoleReason(a.verb, badRoles));
  // The FOR ROLE list is checked too: Postgres refuses the whole statement for a role that does not exist
  // (measured on 16.13: `for role postgres, nonexistent_role` is `role "nonexistent_role" does not exist`), so a
  // list that names `postgres` and something the model does not know must not be applied.
  const badFor = a.forRoles === null ? [] : unknownRoles(a.forRoles);
  if (badFor.length) return reject(model, stmt, 'unmodelled grant statement', unknownRoleReason('alter default privileges for role', badFor));
  // Migrations run as `postgres`, which owns every function they create. A default set for
  // another role never reaches them. `in schema` edits that schema's layer, and no `in schema`
  // edits the global one (see supabaseDefaults for why the difference decides the result).
  const ownerHit = a.forRoles === null || a.forRoles.includes('postgres');
  if (!ownerHit || a.grantOptionOnly) return;
  const layers = a.schemas === null ? [model.defaults.global] : a.schemas.map((sch) => (model.defaults.schemas[sch] ??= unionAcl()));
  for (const layer of layers) for (const r of mapRoles(a.roles)) layer[r] = a.verb === 'grant';
}

function applyPgTempAppend(model, stmt, sweep) {
  const touched = [];
  const noPath = [];
  for (const fn of model.fns.values()) {
    if (fn.schema !== 'public' || !fn.definer) continue;
    if (!Array.isArray(fn.searchPath)) { noPath.push(fn.key); continue; }
    if (PG_TEMP_WORD.test(storedSearchPath(fn.searchPath))) continue;
    fn.searchPath = [...fn.searchPath, 'pg_temp'];
    logOp(fn, stmt, 'sweep: pg_temp appended');
    touched.push(fn.key);
  }
  model.sweeps.push({ file: sweep.file, tag: sweep.tag, effect: sweep.effect, touched, noPath });
}

/** Apply one top-level statement to the model. */
export function applyStatement(model, stmt) {
  const t = stmt.tokens;
  const head = isWord(t[0]) ? t[0].v : null;
  if (head === null) return reject(model, stmt, 'unmodelled statement', 'does not start with a keyword');

  // A set_config call runs when the statement does, whatever the statement is: `create table t as select
  // set_config('search_path', 'private', false)` changes the session as surely as a bare SELECT. A function's
  // body is one dollar token and is not read here, since it runs when the function is called.
  if (!(head === 'create' && objectWord(t) === 'function')) {
    const cfg = setConfigTarget(t);
    if (cfg !== null) {
      const same = { search_path: '`set search_path`', role: '`set role`', session_authorization: '`set session authorization`' }[cfg] ?? '`set role` or `set search_path`';
      return reject(model, stmt, 'unmodelled statement', `set_config(${cfg}) does what ${same} does, from inside a statement, and the model fails both of those`);
    }
  }

  if (head === 'create') {
    const obj = objectWord(t);
    if (obj === 'function') { bump(model, 'create-function'); return applyCreate(model, stmt); }
    if (IRRELEVANT.create.has(obj)) { bump(model, `ignored:create ${obj}`); return; }
    if (obj === 'extension' && inertExtension(t)) { bump(model, 'ignored:create extension'); return; }
    return reject(model, stmt, 'unmodelled statement', `CREATE ${(obj ?? '?').toUpperCase()} is not a known-irrelevant statement (add it to IRRELEVANT in tests/helpers/definer-model.mjs if it cannot change a function's ACL, definer flag or search_path, or model it)`);
  }
  if (head === 'drop') {
    const obj = isWord(t[1]) ? t[1].v : null;
    if (obj === 'function') { bump(model, 'drop-function'); return applyDrop(model, stmt); }
    if (IRRELEVANT.drop.has(obj)) {
      if (CASCADE_DROPS.has(obj) && t.some((x) => isWord(x, 'cascade'))) {
        return reject(model, stmt, 'unmodelled statement', `DROP ${obj.toUpperCase()} ... CASCADE also drops every function whose argument or result type is its row type, and a function made again afterwards has the default ACL, which this replay would not see`);
      }
      bump(model, `ignored:drop ${obj}`); return;
    }
    return reject(model, stmt, 'unmodelled statement', `DROP ${(obj ?? '?').toUpperCase()} can remove functions or change who may run them`);
  }
  if (head === 'alter') {
    const obj = isWord(t[1]) ? t[1].v : null;
    if (obj === 'function') { bump(model, 'alter-function'); return applyAlter(model, stmt); }
    if (obj === 'default' && isWord(t[2], 'privileges')) { bump(model, 'alter-default-privileges'); return applyDefaultPrivileges(model, stmt); }
    if (IRRELEVANT.alter.has(obj)) {
      if (IDENTITY_ALTERS.has(obj) && renamesOrMoves(t)) {
        return reject(model, stmt, 'unmodelled statement', `ALTER ${obj.toUpperCase()} ... RENAME TO or SET SCHEMA changes a type name that a later GRANT or REVOKE on a function spells, so this replay would look the function up under a name it no longer has`);
      }
      bump(model, `ignored:alter ${obj}`); return;
    }
    return reject(model, stmt, 'unmodelled statement', `ALTER ${(obj ?? '?').toUpperCase()} is not a known-irrelevant statement (add it to IRRELEVANT in tests/helpers/definer-model.mjs if it cannot change a function's ACL, definer flag or search_path, or model it)`);
  }
  if (head === 'grant' || head === 'revoke') return applyAcl(model, stmt);
  if (head === 'do') {
    const c = classifyDoBlock(t);
    if (!c.effect) { bump(model, 'do:inert'); return; }
    const sweep = model.doSweeps.find((s) => s.file === stmt.file && s.tag === c.tag);
    if (sweep) {
      if (sweep.fingerprint !== c.fingerprint) return reject(model, stmt, 'unmodelled DO block', `the block was documented as the ${sweep.effect} sweep (fingerprint ${sweep.fingerprint}) but has been edited since (now ${c.fingerprint}): re-read it, then update DO_SWEEPS`);
      bump(model, `do:sweep:${sweep.effect}`);
      if (sweep.effect === 'pg-temp-append') return applyPgTempAppend(model, stmt, sweep);
      return reject(model, stmt, 'unmodelled DO block', `sweep effect ${sweep.effect} has no implementation`);
    }
    // A documented inert entry excuses DYNAMIC SQL that a person read. It never excuses a function
    // statement in code position: that is an effect, and the way to document one is a sweep.
    if (c.dynamic && !c.staticEffect && model.doInert.some((d) => d.file === stmt.file && d.fingerprint === c.fingerprint)) { bump(model, 'do:inert-documented'); return; }
    return reject(model, stmt, 'unmodelled DO block', `a DO block can change a function (${c.why}) and is not a documented sweep or a documented inert block: write the statements out, or add it to DO_SWEEPS with its exact effect, or to DO_INERT with fingerprint ${c.fingerprint} and a reading of what it runs`);
  }
  if (head === 'comment') { bump(model, 'ignored:comment'); return; }
  if (head === 'set' || head === 'reset') {
    // The parameter, past an optional LOCAL / SESSION scope word (`set session authorization x`
    // therefore reads as parameter `authorization`).
    let k = 1;
    while (isWord(t[k], 'local', 'session')) k++;
    const param = isName(t[k]) ? String(t[k].v).toLowerCase() : null;
    if (param === 'role' || param === 'authorization') {
      return reject(model, stmt, 'unmodelled statement', 'changes the role later statements run as, so who owns and can grant on what they create');
    }
    // The search_path decides which schema every later UNQUALIFIED name resolves in, so after
    // `set search_path to private;` the statements `create function h() ...; revoke all on function
    // h() from public, anon;` act on private.h(), and the model would file them under public.h().
    // `set schema 'x'` is Postgres's own alias for it.
    if (param === 'search_path' || param === 'schema') {
      return reject(model, stmt, 'unmodelled statement', 'changes the schema every later unqualified name resolves in, so the functions the following statements create, alter, grant on and drop would be filed under the wrong schema');
    }
    bump(model, 'ignored:set'); return;
  }
  if (TXN.has(head)) { bump(model, 'ignored:txn'); return; }
  if (DML.has(head)) { bump(model, `ignored:${head}`); return; }
  return reject(model, stmt, 'unmodelled statement', `${head.toUpperCase()} is not a known-irrelevant statement (add it to IRRELEVANT in tests/helpers/definer-model.mjs if it cannot change a function's ACL, definer flag or search_path, or model it)`);
}

/** Replay a list of { file, sql } in the order given. `options` is createModel's (doSweeps, doInert). */
export function replay(sources, options = {}) {
  const model = createModel(options);
  for (const { file, sql } of sources) {
    model.files.push(file);
    for (const stmt of splitStatements(sql, file)) applyStatement(model, stmt);
  }
  return model;
}

/**
 * Replay a migrations directory in filename order. A live capture can only reflect the migrations
 * that existed when it was taken, so comparing it with a later tree would report every new
 * function as a disagreement. Two ways to draw that line, each a date (YYYY-MM-DD):
 *   through    files dated on or before it
 *   before     files dated STRICTLY before it. This is the one for a capture day: a capture carries a
 *              date and no time, so a file dated the capture day may or may not have been applied when
 *              it was taken, and replaying it would report a function the capture never saw as drift.
 *   including  file names replayed whatever their date: the capture-day files a capture records as
 *              applied before it was taken (`captureDayFilesApplied` in the live fixture). The claim
 *              is checked by the comparison itself: a file the capture did not see puts functions or
 *              grants in the model that live lacks, and that is drift. A name not in the directory is
 *              an error, so a typo cannot include nothing and pass.
 */
export function replayDir(dir, { through = null, before = null, including = [] } = {}) {
  if (through !== null && before !== null) throw new Error('replayDir: give `through` or `before`, not both');
  const ordered = orderedMigrationFiles(dir);
  for (const name of including) if (!ordered.includes(name)) throw new Error(`replayDir: \`including\` names ${name}, which is not a migration in ${dir}`);
  const files = ordered.filter((file) => {
    if (including.includes(file)) return true;
    const d = migrationDate(file);
    return (through === null || d <= through) && (before === null || d < before);
  });
  return replay(files.map((file) => ({ file, sql: fs.readFileSync(path.join(dir, file), 'utf8') })));
}

// ── Reading the result ──────────────────────────────────────────────────────

/**
 * One function as the differential harness and the vectors compare it: the same fields a
 * catalog query reads back (has_function_privilege for each client role, prosecdef, the
 * search_path entry of proconfig, and whether it returns a trigger).
 */
export function describeFunction(fn) {
  return {
    anon: anonExecutable(fn),
    authenticated: fn.acl.public || fn.acl.authenticated,
    service_role: fn.acl.public || fn.acl.service_role,
    definer: fn.definer,
    trigger: fn.trigger,
    config: Array.isArray(fn.searchPath) ? storedSearchPath(fn.searchPath) : null,
  };
}

/** { 'name(types)': describeFunction } for the functions in `public`. */
export function describeAll(model) {
  return Object.fromEntries([...model.fns.values()].filter((f) => f.schema === 'public').map((f) => [`${f.name}(${f.sig})`, describeFunction(f)]));
}

/** Every function in `public` that PostgREST can expose as an RPC: not a trigger function. */
export const publicRpcFns = (model) => [...model.fns.values()].filter((f) => f.schema === 'public' && !f.trigger);

/** SECURITY DEFINER functions in `public`, trigger functions excluded. */
export const definerRpcFns = (model) => publicRpcFns(model).filter((f) => f.definer);

/** Names carried by more than one signature. The allow-list and the live capture are name-level. */
export function overloads(model) {
  const by = new Map();
  for (const f of model.fns.values()) {
    if (f.schema !== 'public') continue;
    const list = by.get(f.name) ?? [];
    list.push(f.sig);
    by.set(f.name, list);
  }
  return [...by.entries()].filter(([, sigs]) => sigs.length > 1).map(([name, sigs]) => ({ name, sigs }));
}

// ── Reading a function body ──────────────────────────────────────────────────

/** Code tokens of a function body: comments are gone and strings are single `string` tokens. */
export function bodyTokens(fn) {
  return tokenize(fn.body ?? '', `${fn.name} body`, { settings: false });
}

/** True when the body CALLS `name(`, bare or `public.`-qualified, in code position (a quoted lower-case name is the same call). */
export function bodyCalls(fn, name) {
  const t = bodyTokens(fn);
  for (let i = 0; i < t.length; i++) {
    if (!nameIs(t[i], name) || !isPunct(t[i + 1], '(')) continue;
    if (isPunct(t[i - 1], '.')) { if (nameIs(t[i - 2], 'public')) return true; continue; }
    return true;
  }
  return false;
}

/** True when t[i..i+5) is the call `auth.uid()`. */
const isCallerCall = (t, i) => nameIs(t[i], 'auth') && isPunct(t[i + 1], '.') && nameIs(t[i + 2], 'uid') && isPunct(t[i + 3], '(') && isPunct(t[i + 4], ')');

/** True when the body evaluates `auth.uid()` in code position (not in a comment or a string). */
export function bodyUsesAuthUid(fn) {
  const t = bodyTokens(fn);
  for (let i = 0; i < t.length; i++) if (isCallerCall(t, i)) return true;
  return false;
}

/** A stable fingerprint of the body's code (see tokenFingerprint): a comment or a reflow leaves it alone. */
export const bodyFingerprint = (fn) => tokenFingerprint(bodyTokens(fn));

// ── The NULL-logic guard ─────────────────────────────────────────────────────
//
// A signed-out caller has a NULL auth.uid(), and a comparison with NULL is NULL, not FALSE. So a
// reject written as
//     if v_uid <> auth.uid() and not public.is_coach_on_client(v_uid) then return null; end if;
// is NEVER TAKEN for anon: NULL AND TRUE is NULL, an IF on NULL falls through, and the body runs.
// The repo shipped exactly that in set_metric_source and set_program_detail (fixed 2026-06-30 with
// an explicit `auth.uid() is null` reject at the top, see 2026-06-30-rpc-authz-hardening.sql) and
// again in get_health_sources, whose read twin with the identical predicate was missed. A presence
// check cannot see it: `auth.uid()` IS in the body. Measured on PostgreSQL 16.13: the real
// get_health_sources body, run as anon with no JWT, returns another user's observations while the
// table's own RLS shows anon 0 rows.
//
// FLAGGED, over the body's CODE tokens (comments and strings are not code):
//   not-equal          `x <> auth.uid()` or `x != auth.uid()`, either operand order. An operand may be
//                      auth.uid(), `(auth.uid())`, `(select auth.uid())`, `cast(auth.uid() as type)`,
//                      any of them followed by `::type` casts (qualified, array, multi-word and
//                      parameterised types: `::pg_catalog.uuid`, `::uuid[]`, `::character varying(36)`),
//                      in any nesting, or a variable assigned directly from one (`v_me uuid := auth.uid();`).
//                      Names are compared as Postgres compares them: a quoted lower-case name is the same
//                      variable or parameter (`"v_me"` is `v_me`), a quoted name of another case is its own
//                      (`"V_Me"` is not `v_me`, and a bare `V_Me` folds to `v_me`, so it is not `"V_Me"`).
//   negated-equality   `not (... = auth.uid() ...)` and `not x = auth.uid()`: NOT NULL is NULL.
//                      Subqueries and function calls are skipped: `not exists (select ... = auth.uid())`
//                      is NULL-safe because EXISTS is never NULL.
//   subject-coalesce   `coalesce(p_user_id, auth.uid())`, either order: the subject is chosen by a
//                      caller-supplied PARAMETER (`$1` and a quoted `"p_user_id"` included), so the body must
//                      reject a signed-out caller before it trusts the subject, whether or not it compares
//                      anything afterwards.
// A flag is CLEARED by an explicit reject that comes EARLIER in the body:
//     if auth.uid() is null [or ...] then raise exception ...;   -- or `return ...`
// where the NULL test is a whole disjunct of the condition (an `and`-ed test is conditional, so it is
// not a reject), the statement is an `if` (an `elsif` is conditional too), and its branch really
// leaves: a `raise notice` does not, and neither do `return next` and `return query`, which append
// rows to a set-returning function's result and carry on with the next statement (measured on
// PostgreSQL 16.13: as anon with no JWT, a body whose NULL branch ran `return query select -1` still
// reached the comparison after it and returned the other user's row). Only the branch's FIRST
// statement is read, so `return query ...; return;` reads as not leaving and is flagged: that over-
// flags a real reject, and the acknowledgement is how one is accepted. A comparison needs a reject
// before it. A subject-coalesce in the DECLARE section (an initializer, ahead of `begin`) needs one
// anywhere in the body, because it is the USE of the variable that a reject has to come before, which
// this does not track; a subject-coalesce in executable code needs one before it, like a comparison.
//
// NOT flagged, on purpose: `is distinct from` and `coalesce(auth.uid(), '0000...'::uuid)`, which are
// NULL-safe, and `x = auth.uid()` in a positive filter, where NULL drops the row.
// WHAT IT CANNOT SEE: a caller uid reached through any other expression (`lower(auth.uid()::text)`),
// a NULL-blind guard built on a helper that itself returns NULL, an alias assigned any way but
// `v := auth.uid();` (a cast or parentheses around the call are read; a plpgsql `=` assignment and
// `select auth.uid() into v` are not), a variable that is reassigned to something else after it held the
// caller (it reads as the caller from its FIRST assignment on: the position is read, the flow is not),
// a cast to a type of a shape the scan does not read (interval
// fields, `national character`), an ordering comparison
// (`<`, `>=`) under NOT, and whether the reject dominates the comparison (one nested in a branch
// that may not run still counts). It is a tripwire, with a written, fingerprinted acknowledgement
// for the exceptions, not a proof. A body it flags is fixed with an explicit reject first; a
// function that has to stay reachable is a registered finding until then.

/**
 * Variables assigned DIRECTLY from auth.uid() (`v_me uuid := auth.uid();`, `v_me := (select auth.uid())::uuid;`),
 * each with the source offset from which it holds the caller: the end of its FIRST such assignment. Position
 * matters: a variable that held something else when an earlier `if v_me is null then return` ran is not the caller
 * there, so that check is no reject and a comparison before the assignment is no caller comparison. The position
 * is a SOURCE OFFSET (a token's `start`), not an index, because the readers below also work on slices of the
 * token list (one disjunct of an IF condition, one argument of a coalesce), where an index starts again at 0.
 */
function callerAliases(t) {
  const names = new Map();
  const none = new Map();
  for (let i = 1; i < t.length; i++) {
    if (!(isPunct(t[i], ':') && isPunct(t[i + 1], '='))) continue;
    const end = callerOperandEnd(t, i + 2, none);
    if (end < 0 || !isPunct(t[end + 1], ';')) continue;
    let s = i - 1;
    while (s >= 0 && !isPunct(t[s], ';') && !isWord(t[s], 'declare', 'begin', 'then', 'else', 'loop')) s--;
    if (isName(t[s + 1]) && !names.has(t[s + 1].v)) names.set(t[s + 1].v, t[end + 1].start);
  }
  return names;
}

/**
 * Last token index of the type that starts at t[i] (just after `::` or `as`), or -1. It reads what a cast
 * to a type can look like: `uuid`, `pg_catalog.uuid`, `"uuid"`, `character varying`, `double precision`,
 * `varchar(36)`, `timestamp(3) with time zone`, and any array suffix (`[]`, `[3]`, `array`, `array[3]`). A
 * type of another shape is read as far as it still looks like a name, which at worst leaves the operand
 * unrecognised and never matches a wrong one.
 */
export function castTypeEnd(t, i) {
  if (!isName(t[i])) return -1;
  let e = i;
  while (isPunct(t[e + 1], '.') && isName(t[e + 2])) e += 2;
  const w = t[i].k === 'word' && e === i ? t[i].v : null;
  if (w === 'double' && isWord(t[e + 1], 'precision')) e++;
  else if ((w === 'character' || w === 'char' || w === 'bit') && isWord(t[e + 1], 'varying')) e++;
  if (isPunct(t[e + 1], '(')) { const g = readGroup(t, e + 1); if (!g) return -1; e = g.next - 1; }
  if ((w === 'timestamp' || w === 'time') && isWord(t[e + 1], 'with', 'without') && isWord(t[e + 2], 'time') && isWord(t[e + 3], 'zone')) e += 3;
  for (;;) {
    if (isPunct(t[e + 1], '[')) { const g = readGroup(t, e + 1); if (!g) return -1; e = g.next - 1; continue; }
    if (isWord(t[e + 1], 'array')) { e++; continue; }
    return e;
  }
}

/**
 * Last token index of the caller operand that STARTS at t[i], or -1. An operand is auth.uid(), or a variable
 * assigned directly from it (an alias), either of those in parentheses (`(auth.uid())`, `(select auth.uid())`)
 * or inside `cast(... as type)`, with any number of `::type` suffixes after it, in any nesting. A cast leaves
 * a NULL as a NULL, so it hides nothing and must not stop the operand being seen.
 */
function callerOperandEnd(t, i, aliases) {
  let e = -1;
  if (isCallerCall(t, i)) e = i + 4;
  else if (isPunct(t[i], '(')) {
    const g = readGroup(t, i);
    if (!g) return -1;
    const inner = callerOperandEnd(t, isWord(t[i + 1], 'select') ? i + 2 : i + 1, aliases);
    if (inner !== g.next - 2) return -1; // the operand must fill the group
    e = g.next - 1;
  } else if (isWord(t[i], 'cast') && isPunct(t[i + 1], '(') && !isPunct(t[i - 1], '.')) {
    const g = readGroup(t, i + 1);
    if (!g) return -1;
    const inner = callerOperandEnd(t, i + 2, aliases);
    if (inner < 0 || !isWord(t[inner + 1], 'as') || castTypeEnd(t, inner + 2) !== g.next - 2) return -1;
    e = g.next - 1;
  } else if (isName(t[i]) && (aliases.get(t[i].v) ?? Infinity) < t[i].start && !isPunct(t[i + 1], '.') && !isPunct(t[i + 1], '(') && !isPunct(t[i - 1], '.')) {
    e = i;
  } else return -1;
  while (isPunct(t[e + 1], ':') && isPunct(t[e + 2], ':')) {
    const te = castTypeEnd(t, e + 3);
    if (te < 0) break;
    e = te;
  }
  return e;
}

/** Length of the caller operand that STARTS at t[i], casts included, or 0. */
function callerOperandAt(t, i, aliases) {
  const e = callerOperandEnd(t, i, aliases);
  return e < 0 ? 0 : e - i + 1;
}

/** Index where the caller operand ENDING at t[j] starts, or -1. */
function callerOperandStartEndingAt(t, j, aliases) {
  // No cutoff: a left operand wrapped in enough parentheses starts as far back as it likes.
  for (let s = j; s >= 0; s--) if (callerOperandEnd(t, s, aliases) === j) return s;
  return -1;
}

/** Start of the operand that ENDS at t[j]: a call `f(...)`, a dotted name, or a single token. */
function operandStartEndingAt(t, j) {
  let s = j;
  if (isPunct(t[s], ')')) {
    let depth = 0;
    for (; s >= 0; s--) { if (isPunct(t[s], ')')) depth++; else if (isPunct(t[s], '(')) { depth--; if (depth === 0) break; } }
    if (s > 0 && isName(t[s - 1])) s--;
  }
  while (s >= 2 && isPunct(t[s - 1], '.') && isName(t[s - 2])) s -= 2;
  return Math.max(s, 0);
}

/** End (inclusive) of the operand that STARTS at t[i]. */
function operandEndStartingAt(t, i) {
  let e = i;
  for (;;) {
    if (isPunct(t[e + 1], '(') && isName(t[e])) { const g = readGroup(t, e + 1); if (!g) return e; e = g.next - 1; continue; }
    if (isPunct(t[e + 1], '.') && isName(t[e + 2])) { e += 2; continue; }
    return Math.min(e, t.length - 1);
  }
}

/** Lone `=` comparisons in t[from..to) that involve a caller operand, at this level and inside plain groups (not subqueries or calls). */
function callerEqualities(t, from, to, aliases, hits) {
  for (let k = from; k < to; k++) {
    if (isPunct(t[k], '(')) {
      const g = readGroup(t, k);
      if (!g) return;
      const prev = t[k - 1];
      const plain = k === from || !prev || prev.k === 'punct' || isWord(prev, 'and', 'or', 'not', 'then', 'when', 'if', 'elsif', 'else', 'where', 'on');
      if (plain && !isWord(t[k + 1], 'select')) callerEqualities(t, k + 1, g.next - 1, aliases, hits);
      k = g.next - 1;
      continue;
    }
    if (!isPunct(t[k], '=')) continue;
    const before = t[k - 1];
    if (before?.k === 'punct' && ['<', '>', '!'].includes(before.v)) continue; // <= >= != (and <=>): not a lone `=`
    if (callerOperandAt(t, k + 1, aliases) || callerOperandStartEndingAt(t, k - 1, aliases) >= 0) hits.push(k);
  }
}

/** Every NULL-blind comparison and caller-chosen subject in a body's tokens, each { kind, at, text }. */
function nullBlindSites(t, src, aliases, params) {
  const sites = [];
  const text = (a, b) => src.slice(t[a].start, t[Math.min(b, t.length - 1)].end).replace(/\s+/g, ' ').trim().slice(0, 110);
  for (let i = 0; i < t.length; i++) {
    const ne = (isPunct(t[i], '<') && isPunct(t[i + 1], '>')) || (isPunct(t[i], '!') && isPunct(t[i + 1], '='));
    if (ne) {
      const right = callerOperandAt(t, i + 2, aliases);
      const leftStart = callerOperandStartEndingAt(t, i - 1, aliases);
      if (right || leftStart >= 0) {
        const from = leftStart >= 0 ? leftStart : operandStartEndingAt(t, i - 1);
        const to = right ? i + 2 + right - 1 : operandEndStartingAt(t, i + 2);
        sites.push({ kind: 'not-equal', at: i, text: text(from, to) });
      }
      continue;
    }
    if (isWord(t[i], 'not')) {
      let from = i + 1;
      let to;
      if (isPunct(t[from], '(')) { const g = readGroup(t, from); if (!g) continue; to = g.next; }
      else {
        let depth = 0;
        for (to = from; to < t.length; to++) {
          if (isPunct(t[to], '(')) depth++;
          else if (isPunct(t[to], ')')) { if (depth === 0) break; depth--; }
          else if (depth === 0 && (isWord(t[to], 'and', 'or', 'then', 'else', 'loop') || isPunct(t[to], ';'))) break;
        }
      }
      const hits = [];
      callerEqualities(t, from, to, aliases, hits);
      if (hits.length) sites.push({ kind: 'negated-equality', at: i, text: text(i, to - 1) });
      continue;
    }
    if (isWord(t[i], 'coalesce') && isPunct(t[i + 1], '(') && !isPunct(t[i - 1], '.')) {
      const g = readGroup(t, i + 1);
      if (!g) continue;
      const args = splitTopLevel(g.inner);
      const isCaller = (a) => { const n = callerOperandAt(a, 0, aliases); return n > 0 && n === a.length; };
      const usesParam = (a) => a.some((x, k) => x.k === 'param' || (isName(x) && params.has(x.v) && !isPunct(a[k - 1], '.') && !isPunct(a[k + 1], '(')));
      if (args.some(isCaller) && args.some((a) => !isCaller(a) && usesParam(a))) sites.push({ kind: 'subject-coalesce', at: i, text: text(i, g.next - 1) });
    }
  }
  return sites;
}

/** Token indexes of the explicit rejects: `if <... or> auth.uid() is null <or ...> then raise|return`. */
function nullRejects(t, aliases) {
  const out = [];
  for (let i = 0; i < t.length; i++) {
    if (!isWord(t[i], 'if')) continue; // (an `if` after `end` is followed by `;`, which can never be a bare NULL test)
    let j = i + 1;
    let depth = 0;
    for (; j < t.length; j++) {
      if (isPunct(t[j], '(')) depth++;
      else if (isPunct(t[j], ')')) depth--;
      else if (depth === 0 && isWord(t[j], 'then')) break;
    }
    if (j >= t.length) continue;
    const disjuncts = [];
    let cur = [];
    depth = 0;
    for (const x of t.slice(i + 1, j)) {
      if (isPunct(x, '(')) depth++;
      else if (isPunct(x, ')')) depth--;
      if (depth === 0 && isWord(x, 'or')) { disjuncts.push(cur); cur = []; continue; }
      cur.push(x);
    }
    disjuncts.push(cur);
    const isNullTest = (d) => {
      let a = d;
      while (a.length >= 2 && isPunct(a[0], '(') && readGroup(a, 0)?.next === a.length) a = a.slice(1, -1);
      const n = callerOperandAt(a, 0, aliases);
      return n > 0 && isWord(a[n], 'is') && isWord(a[n + 1], 'null') && a.length === n + 2;
    };
    if (!disjuncts.some(isNullTest)) continue;
    const first = t[j + 1];
    if ((isWord(first, 'return') && !isWord(t[j + 2], 'next', 'query')) || (isWord(first, 'raise') && !isWord(t[j + 2], 'notice', 'warning', 'info', 'log', 'debug'))) out.push(i);
  }
  return out;
}

/**
 * The NULL-logic verdict for a function: { sites, rejects, flags }, where each flag is a site not
 * cleared by a reject, with the `reason` to print. Empty `flags` means nothing here is NULL-blind
 * as far as this heuristic can tell.
 */
export function nullLogicFlags(fn) {
  const t = bodyTokens(fn);
  const src = fn.body ?? '';
  const aliases = callerAliases(t);
  const sites = nullBlindSites(t, src, aliases, new Set(fn.paramNames ?? []));
  const rejects = nullRejects(t, aliases);
  const firstReject = rejects.length ? Math.min(...rejects) : Infinity;
  const beginAt = t.findIndex((x) => isWord(x, 'begin'));
  const flags = [];
  for (const s of sites) {
    if (s.kind === 'subject-coalesce') {
      // A coalesce in the DECLARE section is an initializer: it runs before any reject can, and what matters
      // is that the body rejects a signed-out caller before it uses the variable, so a reject anywhere in the
      // body clears it. One in executable code (after the first `begin`) takes its subject at that point, so
      // only a reject BEFORE it protects it, as for a comparison.
      const initializer = beginAt > 0 && s.at < beginAt;
      if (initializer ? rejects.length === 0 : !(firstReject < s.at)) {
        const where = initializer ? 'in the body' : 'before it';
        flags.push({ ...s, reason: `\`${s.text}\` takes the subject from a caller-supplied parameter and falls back to auth.uid(), which is NULL for anon; with no \`if auth.uid() is null then raise\` reject ${where}, a signed-out caller is whoever the parameter names` });
      }
    } else if (!(firstReject < s.at)) {
      const what = s.kind === 'not-equal' ? `\`${s.text}\`` : `\`${s.text}\` (under NOT)`;
      flags.push({ ...s, reason: `${what} is NULL for anon, so the guard is skipped: no \`if auth.uid() is null then raise\` reject comes before it` });
    }
  }
  return { sites, rejects, flags };
}
