// Every SECURITY DEFINER function anon can execute must be ACCOUNTED FOR: gated in its own body,
// or public on purpose with a note, or registered as a known finding. This is the static half of
// that audit; the live half is scripts/definer-live-check.sql plus tests/definer-live-agreement.test.mjs.
//
// WHY IT EXISTS. A definer runs with its owner's rights. Supabase grants EXECUTE on every new
// function to anon and authenticated BY NAME, so `revoke all ... from public` (the obvious
// lockdown) removes only the implicit PUBLIC grant and leaves the function callable by the whole
// internet through /rest/v1/rpc/. The repo has shipped exactly that bug three times
// (league_assign_cohort, fixed 2026-06-29; four score functions, fixed 2026-08-02; the League
// scorers, fixed 2026-09-10) and this audit found it a fourth time in shape_leaderboard.
// Nothing in a migration fails when it happens, so the only place it can be stopped is a check
// that runs on every push.
//
// WHAT IT CHECKS
//   1. The lexer and statement splitter (helpers/sql-scan.mjs): a `;` in a body, string or comment
//      never splits; nested comments; E'', U&'', B'', X'' and N'' literals; dollar tags; unterminated
//      input is an error.
//   2. The model's rules, as vectors (helpers/definer-vectors.mjs): each one is Postgres's own
//      answer, verified on PostgreSQL 16.13 with Supabase's default privileges, field for field (a
//      throwaway local cluster; that harness is not checked in).
//   3. Unknown-but-relevant statements FAIL ("unmodelled grant statement: ..."): a role membership
//      grant, a grant to a role the model does not track, ANY DO block that runs dynamic SQL (unless
//      a person has read it and documented it), ALTER FUNCTION OWNER, `set role`, `set search_path`
//      and so on. Skipping them would be the silence this class of defect survives on.
//   4. The real tree: every migration is read, none is unmodelled, no overload exists, the DO
//      sweep ran once, each documented inert DO block was used, and the same-day ordering is
//      justified AND complete: every same-day pair that defines one function differently is ordered
//      by a constraint or carries a ruling that a reversal test backs.
//   5. The allow-list (fixtures/definer-anon-allowlist.json): every anon-executable definer has an
//      entry with a class whose claim holds against its LATEST body, no entry is stale, and a
//      registered finding is not also an entry. Every body also goes through the NULL-logic guard (a
//      gate that a NULL auth.uid() skips, which a presence check cannot see): the real tree is pinned
//      to the bodies it touches, the real bodies that shipped the hole are flagged, and
//      get_health_sources is proven flagged as an ordinary entry. The checker is itself driven with
//      broken inputs.
//
// ⚠ THIS IS A TRIPWIRE FOR NEW FUNCTIONS, NOT AN AUTHORITY. Replaying whole migrations is
// infeasible (the base tables were created outside the set), so the model reads statements and
// applies Postgres's rules. It cannot see a privilege changed by hand or a function created
// outside the migrations; the live catalog can, and the agreement test says where they differ.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tokenize, splitStatements } from './helpers/sql-scan.mjs';
import * as M from './helpers/definer-model.mjs';
import { SEMANTIC_VECTORS, vectorSources } from './helpers/definer-vectors.mjs';
import { CLASSES, FINDING_KINDS, checkAllowlist, anonReachableNames, gatesOf, grantOf } from './helpers/definer-allowlist.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'supabase-migrations');
const ALLOW = JSON.parse(fs.readFileSync(join(ROOT, 'tests/fixtures/definer-anon-allowlist.json'), 'utf8'));

const fnSql = (name, attrs = 'security definer') => `create function public.${name}() returns int language sql ${attrs} as $$ select 1 $$;`;
const replayOne = (sql, file = 't.sql') => M.replay([{ file, sql }]);
const messages = (model) => model.unmodelled.map((u) => u.message);

let realModel = null;
const real = () => (realModel ??= M.replayDir(DIR));

// ── 1. The lexer and the statement splitter ──────────────────────────────────

test('a semicolon inside a dollar body, a string default or a comment does not end a statement', () => {
  const sql = [
    "create function public.a(p text default 'x;y') returns int language plpgsql security definer as $body$",
    'begin',
    '  -- a ; in a line comment',
    '  perform 1; /* and a ; in a block comment */',
    '  return 1;',
    'end $body$;',
    'select 1;',
  ].join('\n');
  const stmts = splitStatements(sql, 't.sql');
  assert.equal(stmts.length, 2, 'the function is ONE statement and `select 1` is the other');
  assert.equal(stmts[0].tokens[0].v, 'create');
  assert.ok(replayOne(sql).fns.has('public.a(text)'), 'the function must be modelled from its whole statement');
});

test('a semicolon inside brackets does not end a statement', () => {
  // `create rule ... do also (a; b)` is the shape; the depth count is what keeps it whole.
  const stmts = splitStatements('select (1; 2); select 3;', 't.sql');
  assert.equal(stmts.length, 2);
  assert.equal(stmts[0].text, 'select (1; 2)');
});

test('block comments nest, so a comment that closes early does not leak its tail as code', () => {
  const sql = `/* outer /* inner */ ${fnSql('ghost')} */\nselect 1;`;
  assert.equal(splitStatements(sql, 't.sql').length, 1);
  assert.equal(replayOne(sql).fns.size, 0, 'the create inside the outer comment must not be read');
});

test('E-string backslashes escape the quote, so the literal does not swallow the next statement', () => {
  const sql = `select E'\\'';\n${fnSql('after_e')}`;
  assert.equal(splitStatements(sql, 't.sql').length, 2);
  assert.ok(replayOne(sql).fns.has('public.after_e()'));
});

test('a statement spelled inside a comment or a string is not a statement', () => {
  const sql = [
    `-- ${fnSql('ghost1')}`,
    `select '${fnSql('ghost2')}';`,
    '/* revoke all on function public.ghost3() from public, anon; */',
    fnSql('real_one'),
  ].join('\n');
  const m = replayOne(sql);
  assert.deepEqual([...m.fns.keys()], ['public.real_one()']);
  assert.deepEqual(m.unmodelled, []);
  assert.deepEqual(m.orphans, [], 'the commented revoke must not be applied');
});

test('a `$tag$` cannot open a dollar quote from inside an identifier', () => {
  const sql = `select 1 as foo$tag$;\n${fnSql('after_ident')}`;
  assert.equal(splitStatements(sql, 't.sql').length, 2, 'foo$tag$ is ONE word to Postgres');
  assert.ok(replayOne(sql).fns.has('public.after_ident()'));
});

test('a dollar-quote tag has no length limit, so a long delimiter still hides its body from the statement scan', () => {
  // Measured on PostgreSQL 16.13: a tag of 10, 198, 199, 200, 201, 1,000 and 20,000 characters all delimit a string.
  // The lexer once read the tag out of the next 200 characters, so one past 198 was no delimiter at all and the
  // text inside it was lexed as top-level SQL: the `revoke` below would then have been applied to the model.
  for (const len of [1, 10, 198, 199, 200, 201, 400, 5000]) {
    const tag = 'a'.repeat(len);
    const sql = `select $${tag}$ x; revoke all on function public.f() from anon; y $${tag}$;\n${fnSql('after_long')}`;
    const toks = tokenize(sql, 't.sql');
    const doll = toks.filter((t) => t.k === 'dollar' && t.tag !== ''); // (the function after it has its own `$$` body)
    assert.equal(doll.length, 1, `tag of ${len}: one tagged dollar token, got ${toks.map((x) => x.k).join(',')}`);
    assert.equal(doll[0].tag.length, len);
    assert.ok(!toks.some((t) => t.k === 'word' && t.v === 'revoke'), `tag of ${len}: the revoke inside the string must not be code`);
    const m = replayOne(sql);
    assert.deepEqual(messages(m), [], `tag of ${len}`);
    assert.deepEqual(m.orphans, [], `tag of ${len}: the revoke was not read, so it names no missing function`);
    assert.ok(m.fns.has('public.after_long()'), `tag of ${len}: the statement after it is read`);
  }
  assert.throws(() => tokenize(`select $${'b'.repeat(300)}$ never closed`, 'f.sql'), /f\.sql:1: unterminated dollar-quoted string/, 'a long tag is still refused when it never closes');
  const m = tokenize(`select $${'c'.repeat(300)}$ one $${'c'.repeat(299)}$ two $${'c'.repeat(300)}$;`, 't.sql').filter((t) => t.k === 'dollar');
  assert.equal(m.length, 1, 'only the SAME delimiter closes it: a tag one letter shorter is text');
});

test('B, X, N and U& literals are ONE string token each, and a semicolon inside one never splits', () => {
  const one = (src, raw, value, kind = 'string') => {
    const toks = tokenize(src, 't.sql');
    assert.equal(toks.length, 1, `${src} must be one token, got ${toks.map((x) => `${x.k}:${x.raw}`).join(' ')}`);
    assert.equal(toks[0].k, kind, src);
    assert.equal(toks[0].raw, raw, src);
    assert.equal(toks[0].v, value, src);
  };
  one("B'1;0'", "B'1;0'", '1;0');
  one("b'1'", "b'1'", '1');
  one("X'1F;'", "X'1F;'", '1F;');
  one("N'it''s;'", "N'it''s;'", "it's;");
  one("U&'d\\0061t\\+000061;'", "U&'d\\0061t\\+000061;'", 'data;'); // \0061 and \+000061 are both the letter a
  one("u&'a'", "u&'a'", 'a');
  one('U&"i;d"', 'U&"i;d"', 'i;d', 'qident');
  // Measured on PostgreSQL 16.13: in a U& literal a backslash is the Unicode escape character and
  // does NOT escape the quote, so this literal ENDS at the second quote (the error comes later, in
  // parse analysis, and the next statement runs).
  one("U&'a\\'", "U&'a\\'", 'a\\');
  assert.equal(splitStatements("select U&'a\\';\nselect 2;", 't.sql').length, 2, "U&'a\\' ends where it looks like it ends");
  // Only E honours a backslash before a quote.
  assert.equal(splitStatements("select E'a\\'b;c';\nselect 2;", 't.sql').length, 2);
  assert.equal(splitStatements("select B'1\\';\nselect 2;", 't.sql').length, 2, 'a backslash means nothing in a B literal');
  // A prefix has to touch its quote: with a space in between they are an identifier and a string.
  assert.deepEqual(tokenize("x '1'", 't.sql').map((x) => x.k), ['word', 'string']);
  assert.deepEqual(tokenize("u & 'a'", 't.sql').map((x) => x.k), ['word', 'punct', 'string']);
  // A statement after any of them is still read.
  for (const lit of ["B'1;0'", "X'1F;'", "N'a;b'", "U&'d\\0061;'"]) {
    const sql = `select ${lit};\n${fnSql('after_lit')}`;
    assert.equal(splitStatements(sql, 't.sql').length, 2, lit);
    assert.ok(replayOne(sql).fns.has('public.after_lit()'), lit);
  }
});

test('escape strings are decoded the way Postgres decodes them, so a name written with escapes still compares equal', () => {
  const v = (sql) => { const t = tokenize(sql, 't.sql'); assert.equal(t.length, 1, sql); return t[0].v; };
  // Each of these is `search_path` on PostgreSQL 16.13 (`select <literal>`).
  for (const lit of ["E'\\x73earch_path'", "E'\\163earch_path'", "E'\\u0073earch_path'", "E'\\U00000073earch_path'", "E'search\\137path'", "e'\\x73\\x65arch_path'", "U&'\\0073earch_path'", "U&'\\+000073earch_path'"]) assert.equal(v(lit), 'search_path', lit);
  assert.equal(v("E'a\\nb\\tc\\rd\\be\\ff'"), 'a\nb\tc\rd\be\ff');
  assert.equal(v("E'it\\'s'"), "it's");
  assert.equal(v("E'it''s'"), "it's");
  assert.equal(v("E'a\\\\b'"), 'a\\b');
  assert.equal(v("E'a''\\'b'"), "a''b");
  assert.equal(v("E'\\x4'"), '\x04', 'one hex digit is enough');
  assert.equal(v("E'\\1'"), '\x01', 'so is one octal digit');
  assert.equal(v("E'\\q'"), 'q', 'any other character stands for itself');
  // U&: a doubled backslash is one backslash, and a U& identifier decodes too.
  assert.equal(v("U&'a\\\\b'"), 'a\\b');
  const id = tokenize('U&"\\0061uth"', 't.sql');
  assert.deepEqual([id[0].k, id[0].v], ['qident', 'auth']);
  // A plain string keeps its backslash.
  assert.equal(v("'\\x73'"), '\\x73');
  // UESCAPE changes the escape character, so it is refused rather than decoded under the wrong one.
  assert.throws(() => tokenize("select U&'!0073earch_path' UESCAPE '!';", 'f.sql'), /f\.sql:1: UESCAPE changes what every escape/);
  assert.throws(() => tokenize("select U&\"!0061uth\" /* c */ UESCAPE '!';", 'f.sql'), /UESCAPE changes what every escape/);
  assert.doesNotThrow(() => tokenize("select 'uescape'; select uescape from t;", 'f.sql'), 'the word on its own is only a word');
});

test('a doubled quote is an escaped quote in a string and in a quoted identifier', () => {
  const [s] = tokenize("'it''s; here'", 't.sql');
  assert.deepEqual([s.k, s.v], ['string', "it's; here"]);
  const [q] = tokenize('"a""b;c"', 't.sql');
  assert.deepEqual([q.k, q.v], ['qident', 'a"b;c']);
  assert.equal(splitStatements("select 'it''s;'; select \"a\"\"b;\";", 't.sql').length, 2);
});

test('a quoted identifier keeps its case and an unquoted one folds', () => {
  const m = replayOne(`create function public.MyFn() returns int language sql security definer as $$ select 1 $$;\ncreate function public."MyFn"() returns int language sql security definer as $$ select 2 $$;`);
  assert.deepEqual([...m.fns.keys()].sort(), ['public.MyFn()', 'public.myfn()']);
});

test('input the lexer cannot complete is an error that names the file and line', () => {
  assert.throws(() => tokenize('select 1;\nselect /* nope', 'f.sql'), /f\.sql:2: unterminated block comment/);
  assert.throws(() => tokenize("select 'nope", 'f.sql'), /f\.sql:1: unterminated string literal/);
  assert.throws(() => tokenize('select $$ nope', 'f.sql'), /f\.sql:1: unterminated dollar-quoted string/);
  assert.throws(() => tokenize('select "nope', 'f.sql'), /unterminated quoted identifier/);
  assert.throws(() => splitStatements('select (1;', 'f.sql'), /unbalanced/);
  assert.throws(() => splitStatements('select 1);', 'f.sql'), /unbalanced/);
  assert.throws(() => tokenize("set standard_conforming_strings = off; select 'a\\b';", 'f.sql'), /standard_conforming_strings/);
});

test('standard_conforming_strings is read from tokens: a comment cannot hide it and inert text cannot trigger it', () => {
  const refused = (sql) => assert.throws(() => tokenize(sql, 'f.sql'), /^Error: f\.sql:\d+: standard_conforming_strings is turned off/, sql);
  const accepted = (sql) => assert.doesNotThrow(() => tokenize(sql, 'f.sql'), sql);
  // The bypass: a comment between the words kept the old text pattern from seeing the setting.
  refused('set standard_conforming_strings /* gap */ = off;');
  refused('set standard_conforming_strings = /* gap */ off;');
  refused("set /* gap */ standard_conforming_strings to 'off';");
  refused('set standard_conforming_strings -- gap\n = off;');
  // Every spelling of off, every way to say set, and the missing semicolon.
  for (const v of ['off', "'off'", 'false', "'false'", 'no', 'n', 'of', 'f', '0', "'0'"]) refused(`set standard_conforming_strings = ${v};`);
  refused("set standard_conforming_strings to 'off';");
  refused('set local standard_conforming_strings to off;');
  refused('set session standard_conforming_strings = off;');
  refused('set "standard_conforming_strings" = off;');
  refused('SET STANDARD_CONFORMING_STRINGS = OFF;');
  refused('set standard_conforming_strings = off');
  refused("select set_config('standard_conforming_strings', 'off', false);");
  refused("select set_config('Standard_Conforming_Strings', 'false', true);");
  refused('select set_config($$standard_conforming_strings$$, $$off$$, true);');
  refused("select pg_catalog.\"set_config\"('standard_conforming_strings', 'off', false);"); // a quoted lowercase name is the built-in
  refused("select \"pg_catalog\".\"set_config\"('standard_conforming_strings', 'off', false);");
  refused("select set_config(E'\\x73tandard_conforming_strings', 'off', false);");
  refused("select set_config(U&'\\0073tandard_conforming_strings', 'off', false);");
  refused("select set_config('standard_conforming_strings', current_setting('x'), false);"); // a value it cannot read counts
  refused("select set_config('standard_conforming_strings', 'o' || 'ff', false);"); // and so does one assembled from parts
  // It is read before the NEXT statement is lexed, so the message is the refusal and not the
  // unterminated string that the standard reading makes of `'it\'s'` further down.
  assert.throws(() => tokenize("set standard_conforming_strings = off;\nselect 'it\\'s';", 'f.sql'), /standard_conforming_strings is turned off/);
  // Text that only MENTIONS it is not the setting.
  accepted('/* set standard_conforming_strings = off */ select 1;');
  accepted('-- set standard_conforming_strings = off\nselect 1;');
  accepted("select 'set standard_conforming_strings = off';");
  accepted('select "standard_conforming_strings";');
  accepted('do $$ begin raise notice $n$standard_conforming_strings = off$n$; end $$;');
  // And the settings that do not turn it off.
  accepted('set standard_conforming_strings = on;');
  accepted('set standard_conforming_strings to default;');
  accepted('reset standard_conforming_strings;');
  accepted("select set_config('standard_conforming_strings', 'on', false);");
  accepted("select set_config('statement_timeout', 'off', false);");
  accepted("select pg_catalog.\"SET_CONFIG\"('standard_conforming_strings', 'off', false);"); // a different (nonexistent) function: not the built-in
  // A name that is not one literal is no business of the lexer's: the model refuses every such set_config.
  accepted("select set_config('standard_' || 'conforming_strings', 'off', false);");
  accepted("select set_config(current_setting('x'), 'off', false);");
  accepted("select current_setting('standard_conforming_strings');");
});

test('a function body is lexed without the setting check: it runs when the function is called, not while the file is read', () => {
  const body = "select set_config('standard_conforming_strings', 'off', false)";
  assert.throws(() => tokenize(body, 'f.sql'), /standard_conforming_strings is turned off/, 'as a statement it changes how the rest of the file is lexed');
  assert.doesNotThrow(() => tokenize(body, 'f.sql', { settings: false }));
  const m = replayOne(`create function public.sets_it() returns text language sql security definer set search_path = public, pg_temp as $$ ${body} $$;`);
  assert.deepEqual(messages(m), []);
  assert.doesNotThrow(() => M.bodyTokens([...m.fns.values()][0]));
});

test('a CREATE FUNCTION whose definition mentions set_config outside its body is not a set_config statement', () => {
  // The default runs when the function is called, not when it is created.
  const m = replayOne("create function public.f(p text default set_config('search_path', 'private', false)) returns int language sql as $$ select 1 $$;");
  assert.deepEqual(messages(m), []);
  assert.ok(m.fns.has('public.f(text)'));
});

test('argument lists read as Postgres identifies them', () => {
  const tokens = tokenize("(p_a int, timestamptz, \"p b\" numeric(10,2), text[], double precision, p_x timestamp with time zone default now(), variadic int[], out z text, p_c character varying(20) = 'x')");
  const inner = tokens.slice(1, -1);
  assert.deepEqual(
    M.parseParams(inner).map((p) => [p.mode, p.name, p.type]),
    [['in', 'p_a', 'integer'], ['in', null, 'timestamp with time zone'], ['in', 'p b', 'numeric'], ['in', null, 'text[]'],
      ['in', null, 'double precision'], ['in', 'p_x', 'timestamp with time zone'], ['variadic', null, 'integer[]'],
      ['out', 'z', 'text'], ['in', 'p_c', 'character varying']],
  );
});

test('only the pg_catalog pseudo-types make a trigger function: a type called trigger in another schema is an ordinary RPC', () => {
  const create = (ret) => `create function public.f() returns ${ret} language plpgsql security definer as $$ begin return null; end $$;`;
  const model = (ret) => replayOne(create(ret));
  // The pseudo-types, unqualified (which resolves to pg_catalog first), qualified, quoted, in any case.
  for (const ret of ['trigger', 'TRIGGER', '"trigger"', 'pg_catalog.trigger', 'pg_catalog."trigger"', 'event_trigger', 'pg_catalog.event_trigger']) {
    const m = model(ret);
    assert.equal(m.fns.get('public.f()').trigger, true, ret);
    assert.deepEqual(M.definerRpcFns(m), [], `${ret}: nothing can call it as an RPC, so it is outside the audit`);
  }
  // A type with that name anywhere else, a differently-cased quoted name and an array are not.
  for (const ret of ['public.trigger', 'public."trigger"', 'public."event_trigger"', 'other.event_trigger', '"Trigger"', 'trigger[]']) {
    const m = model(ret);
    assert.equal(m.fns.get('public.f()').trigger, false, ret);
    assert.deepEqual(M.definerRpcFns(m).map((f) => f.name), ['f'], `${ret}: an ordinary RPC, so it stays in the audit`);
  }
});

test('a quoted "public" is the PUBLIC pseudo-role and a quoted "PUBLIC" is no role (both measured on PostgreSQL 16.13)', () => {
  // On 16.13 `revoke all on function f() from "public"` removed the PUBLIC entry from the function's ACL, exactly as the
  // unquoted word does, and `from "PUBLIC"` was `role "PUBLIC" does not exist`.
  const run = (stmt) => replayOne(`${fnSql('f')}\n${stmt}`);
  const quoted = run('revoke all on function public.f() from "public";');
  assert.deepEqual(messages(quoted), []);
  assert.deepEqual(quoted.fns.get('public.f()').acl, { public: false, anon: true, authenticated: true, service_role: true }, 'PUBLIC is removed, anon keeps its own grant');
  assert.equal(run('revoke all on function public.f() from public;').fns.get('public.f()').acl.public, false, 'control: the unquoted word');
  assert.equal(M.anonExecutable(run('revoke all on function public.f() from "public", anon;').fns.get('public.f()')), false, 'both gone: closed');
  const wrongCase = run('revoke all on function public.f() from "PUBLIC", anon;');
  assert.equal(wrongCase.unmodelled.length, 1);
  assert.match(wrongCase.unmodelled[0].why, /names "PUBLIC", which is not a role the model tracks/);
  assert.equal(M.anonExecutable(wrongCase.fns.get('public.f()')), true, 'Postgres refuses the whole statement, so nothing is revoked');
});

test('GRANTED BY must name the current user (postgres, for a migration): any other grantor is a statement Postgres refuses, so it is not applied', () => {
  // Measured on 16.13: `granted by anon` is `grantor must be current user`; `granted by <the current user>` works.
  const run = (stmt) => replayOne(`${fnSql('f')}\n${stmt}`);
  const ok = run('revoke all on function public.f() from public, anon granted by postgres;');
  assert.deepEqual(messages(ok), []);
  assert.equal(M.anonExecutable(ok.fns.get('public.f()')), false, 'the current user as grantor revokes as usual');
  assert.deepEqual(messages(run('grant execute on function public.f() to anon granted by "postgres";')), []);
  for (const grantor of ['authenticated', 'anon', 'service_role', 'current_user', 'some_role']) {
    const m = run(`revoke all on function public.f() from public, anon granted by ${grantor};`);
    assert.equal(m.unmodelled.length, 1, grantor);
    assert.match(m.unmodelled[0].why, /GRANTED BY .*: Postgres refuses a grantor that is not the current user/, grantor);
    assert.equal(M.anonExecutable(m.fns.get('public.f()')), true, `${grantor}: the refused statement closes nothing`);
  }
});

test('ALTER DEFAULT PRIVILEGES: every role in FOR ROLE must exist, so a list with one the model does not know is refused whole', () => {
  // Measured on 16.13: `for role <the current user>, nonexistent_role` is `role "nonexistent_role" does not exist`, and
  // nothing is applied. The model read `postgres` in the list and applied the change.
  const run = (forRole) => replayOne(`alter default privileges ${forRole} in schema public revoke execute on functions from anon;\nalter default privileges revoke execute on functions from public;\n${fnSql('after_fr')}`);
  const refused = run('for role postgres, nonexistent_role');
  assert.equal(refused.unmodelled.length, 1);
  assert.match(refused.unmodelled[0].why, /ALTER DEFAULT PRIVILEGES FOR ROLE names "nonexistent_role", which is not a role the model tracks/);
  assert.equal(M.anonExecutable(refused.fns.get('public.after_fr()')), true, 'the refused statement is not applied: anon keeps the Supabase default');
  const applied = run('for role postgres');
  assert.deepEqual(messages(applied), []);
  assert.equal(M.anonExecutable(applied.fns.get('public.after_fr()')), false, 'control: a list of known roles that includes postgres is applied');
  assert.equal(M.anonExecutable(run('for role postgres, anon').fns.get('public.after_fr()')), false, 'control: two known roles');
  assert.equal(M.anonExecutable(run('for role anon').fns.get('public.after_fr()')), true, 'control: a default set for another role never reaches what postgres creates');
});

test('a parameter named like an Object.prototype member is a parameter, not a crash', () => {
  for (const name of ['constructor', '__proto__', '"toString"', '"valueOf"', '"hasOwnProperty"']) {
    const m = replayOne(`create function public.f(${name} text) returns int language sql security definer as $$ select 1 $$;`);
    assert.deepEqual(messages(m), [], name);
    assert.deepEqual([...m.fns.keys()], ['public.f(text)'], name);
  }
  // And the multi-word types that make a first word a type, not a name, still do.
  assert.deepEqual([...replayOne('create function public.f(double precision, character varying, timestamp with time zone) returns int language sql security definer as $$ select 1 $$;').fns.keys()], ['public.f(double precision,character varying,timestamp with time zone)']);
});

test('a setting name is case-insensitive in a function definition: a quoted "SEARCH_PATH" is the search_path (measured on 16.13)', () => {
  const create = (setting) => `create function public.f() returns int language sql security definer ${setting} as $$ select 1 $$;`;
  const pathOf = (sql) => [...replayOne(sql).fns.values()][0].searchPath;
  // Controls: the unquoted spellings, which fold.
  assert.deepEqual(pathOf(create('set search_path = public, pg_temp')), ['public', 'pg_temp']);
  assert.deepEqual(pathOf(create('set SEARCH_PATH = public, pg_temp')), ['public', 'pg_temp']);
  // A quoted one, in any case, is the same setting.
  assert.deepEqual(pathOf(create('set "SEARCH_PATH" = public, pg_temp')), ['public', 'pg_temp']);
  assert.deepEqual(pathOf(create('set "Search_Path" to public')), ['public']);
  // ALTER FUNCTION: a quoted SET replaces the path and a quoted RESET removes it, so neither leaves the old pin standing.
  const base = create('set search_path = public, pg_temp');
  const after = (alter) => pathOf(`${base}\n${alter}`);
  assert.deepEqual(after('alter function public.f() set "Search_Path" = public;'), ['public'], 'a quoted SET replaces it');
  assert.equal(after('alter function public.f() reset "SEARCH_PATH";'), null, 'a quoted RESET removes it');
  assert.equal(after('alter function public.f() reset SEARCH_PATH;'), null, 'control: unquoted');
  assert.deepEqual(after('alter function public.f() reset "other_setting";'), ['public', 'pg_temp'], 'control: another setting leaves the path alone');
  assert.deepEqual(after('alter function public.f() set "Other_Setting" = 1;'), ['public', 'pg_temp'], 'control: another setting leaves the path alone');
});

test('argument types: a quoted name is a name, never a built-in alias', () => {
  const type = (t) => M.parseParams(tokenize(`(${t})`).slice(1, -1))[0].type;
  // Controls: the unquoted spellings fold, as before.
  assert.equal(type('int'), 'integer');
  assert.equal(type('public.int'), 'integer');
  assert.equal(type('pg_catalog.int4'), 'integer');
  assert.equal(type('char'), 'character');
  assert.equal(type('varchar(20)'), 'character varying');
  assert.equal(type('timestamptz'), 'timestamp with time zone');
  assert.equal(type('int[]'), 'integer[]');
  // A quoted one is a type that is literally called that: `"int"` is not int4, `public."int"` is a user type, and
  // `"char"` is the internal one-byte type, which is not char (bpchar).
  assert.equal(type('"int"'), '"int"');
  assert.equal(type('public."int"'), '"int"');
  assert.equal(type('"char"'), '"char"');
  assert.equal(type('"int"[]'), '"int"[]');
  assert.equal(type('public."varchar"(20)'), '"varchar"');
  assert.equal(type('"My Type"'), '"My Type"');
  assert.equal(type('"a""b"'), '"a""b"', 'a quote inside the name is doubled, so no name can spell another canonical text');
  assert.equal(type('"a . b"'), '"a . b"', 'spaces and dots inside a quoted name are part of it');
  assert.notEqual(type('"a . b"'), type('"a.b"'), 'two different quoted names are two different types');
  assert.equal(type('public . pg_catalog . "x y"'), 'pg_catalog."x y"', 'spacing around a qualifier dot is not part of the name');
  for (const quoted of ['"int"', 'public."int"', '"char"', '"int4"', '"timestamptz"']) {
    assert.ok(!['integer', 'character', 'timestamp with time zone'].includes(type(quoted)), `${quoted} must not read as a built-in`);
  }
});

test('a function typed by a quoted name is another signature, not a replacement of the built-in-typed one', () => {
  const m = replayOne(`create function public.f(p int) returns int language sql security definer as $$ select 1 $$;\ncreate or replace function public.f(p public."int") returns int language sql security definer as $$ select 2 $$;`);
  assert.deepEqual([...m.fns.keys()].sort(), ['public.f("int")', 'public.f(integer)'], 'two functions, as in Postgres');
  assert.deepEqual(M.overloads(m).map((o) => [o.name, o.sigs.length]), [['f', 2]], 'so the overload is reported and nothing is conflated');
  // The same pair spelled the same way is one function that create-or-replace replaces, as before.
  const same = replayOne(`create function public.f(p int) returns int language sql security definer as $$ select 1 $$;\ncreate or replace function public.f(p integer) returns int language sql security definer as $$ select 2 $$;`);
  assert.deepEqual([...same.fns.keys()], ['public.f(integer)']);
});

// ── 2. The model's rules, one vector each ────────────────────────────────────

test('the vectors are well formed', () => {
  const names = SEMANTIC_VECTORS.map((v) => v.name);
  assert.equal(new Set(names).size, names.length, 'vector names must be unique');
  for (const v of SEMANTIC_VECTORS) {
    assert.ok(v.why && v.why.length > 20, `${v.name}: says why`);
    assert.ok(Object.keys(v.expect).length || (v.absent ?? []).length, `${v.name}: asserts something`);
  }
});

for (const v of SEMANTIC_VECTORS) {
  test(`rule: ${v.name}`, () => {
    const model = M.replay(vectorSources(v, DIR));
    assert.deepEqual(messages(model), [], 'a vector is fully modelled');
    const got = M.describeAll(model);
    for (const [key, want] of Object.entries(v.expect)) {
      assert.ok(got[key], `${key} must exist afterwards (have: ${Object.keys(got).join(', ') || 'nothing'})`);
      for (const [field, value] of Object.entries(want)) {
        assert.equal(got[key][field], value, `${key}.${field}: ${v.why}`);
      }
    }
    for (const key of v.absent ?? []) assert.ok(!got[key], `${key} must be gone: ${v.why}`);
  });
}

test('a plain CREATE of a signature that exists is recorded and has no effect (Postgres refuses it)', () => {
  const m = replayOne(`${fnSql('dup')}\nrevoke all on function public.dup() from public, anon;\n${fnSql('dup')}`);
  assert.deepEqual(m.duplicateCreates.map((d) => d.key), ['public.dup()']);
  assert.equal(M.describeAll(m)['dup()'].anon, false, 'the refused statement must not reset the ACL');
});

test('a name-only reference that matches two overloads is ambiguous, not applied to one', () => {
  const m = replayOne(`create function public.f(p int) returns int language sql security definer as $$ select 1 $$;\ncreate function public.f(p text) returns int language sql security definer as $$ select 1 $$;\nrevoke all on function public.f from public, anon;`);
  assert.equal(m.ambiguous.length, 1);
  assert.equal(M.describeAll(m)['f(integer)'].anon, true, 'neither overload may be revoked by a guess');
});

test('ACL statements naming a function no earlier statement created are listed as orphans', () => {
  const m = replayOne('revoke all on function public.nowhere() from public, anon;\nalter function public.nowhere2() security invoker;\ndrop function public.nowhere3();');
  assert.deepEqual(m.orphans.map((o) => o.op), ['revoke', 'alter', 'drop']);
  const quiet = replayOne('drop function if exists public.nowhere();');
  assert.deepEqual(quiet.orphans, [], 'IF EXISTS is a legitimate no-op');
});

test('a function in another schema is tracked but is not in the public audit', () => {
  const m = replayOne('create function extra.f() returns int language sql security definer as $$ select 1 $$;');
  assert.ok(m.fns.has('extra.f()'));
  assert.deepEqual(M.definerRpcFns(m), []);
});

test('the default ACL a function receives is read when it is created, from both layers', () => {
  assert.deepEqual(M.supabaseDefaultAcl(), { public: true, anon: true, authenticated: true, service_role: true });
  const d = M.supabaseDefaults();
  assert.equal(d.global.anon, false, 'anon is NOT in the global layer');
  assert.equal(d.schemas.public.public, false, 'PUBLIC is NOT in the schema layer');
});

// `anonGrant` (explicit | default-only) is the model's own notion, not a catalog field: whether a
// `grant ... to anon` BY NAME still stands, as opposed to anon reaching the function only through the
// default ACL. It is what tells an intent from an accident, so it has to survive every ordering of
// grant and revoke, and only a REVOKE that removes anon's own entry may clear it.
const P_FN = fnSql('p');
const PROVENANCE = [
  ['no statement names anon', '', 'default-only', true],
  ['a grant to anon', 'grant execute on function public.p() to anon;', 'explicit', true],
  ['a grant to anon, then a revoke from anon: PUBLIC still opens it, so anon reaches it through the default ACL and the grant no longer stands',
    'grant execute on function public.p() to anon;\nrevoke execute on function public.p() from anon;', 'default-only', true],
  ["a grant to anon, then a revoke from PUBLIC only: anon's own entry still stands",
    'grant execute on function public.p() to anon;\nrevoke all on function public.p() from public;', 'explicit', true],
  ['a grant, a revoke from anon, then a grant again', 'grant execute on function public.p() to anon;\nrevoke execute on function public.p() from anon;\ngrant execute on function public.p() to anon;', 'explicit', true],
  ['a grant to anon, then a revoke from PUBLIC and anon closes it', 'grant execute on function public.p() to anon;\nrevoke all on function public.p() from public, anon;', 'default-only', false],
  ['a grant to authenticated only is not a grant to anon', 'grant execute on function public.p() to authenticated;', 'default-only', true],
  ['REVOKE GRANT OPTION FOR does not remove the grant', 'grant execute on function public.p() to anon;\nrevoke grant option for execute on function public.p() from anon;', 'explicit', true],
  ['a quoted "anon" is the same role', 'grant execute on function public.p() to "anon";', 'explicit', true],
  ['a grant to PUBLIC is not a grant to anon by name', 'grant execute on function public.p() to public;', 'default-only', true],
  ['a grant to several roles counts, and a revoke that names anon among several clears it',
    'grant execute on function public.p() to authenticated, anon;\nrevoke execute on function public.p() from authenticated, anon;', 'default-only', true],
  ['a multi-role revoke that does not name anon leaves the grant', 'grant execute on function public.p() to anon;\nrevoke execute on function public.p() from authenticated, service_role;', 'explicit', true],
];
for (const [name, stmts, want, open] of PROVENANCE) {
  test(`anonGrant provenance: ${name}`, () => {
    const m = replayOne(`${P_FN}\n${stmts}`);
    assert.deepEqual(messages(m), []);
    const f = m.fns.get('public.p()');
    assert.equal(grantOf(f), want, `anonGrantSite is ${f.anonGrantSite}`);
    assert.equal(M.anonExecutable(f), open);
    assert.equal(f.anonGrantSite === null, want === 'default-only', 'the site is recorded exactly when the grant stands');
  });
}

// ── 3. Unknown-but-relevant statement shapes fail ────────────────────────────

const AFTER = fnSql('after_it');
const UNMODELLED = [
  ['a role membership grant', 'grant authenticated to anon;', 'unmodelled grant statement'],
  ['a role membership revoke', 'revoke authenticated from anon;', 'unmodelled grant statement'],
  ['a privilege other than EXECUTE on a function', 'grant usage on function public.f() to anon;', 'unmodelled grant statement'],
  ['an ACL statement it cannot read', 'grant execute on function to anon;', 'unmodelled grant statement'],
  ['ALTER DEFAULT PRIVILEGES on an object class it does not know', 'alter default privileges in schema public grant execute on widgets to anon;', 'unmodelled grant statement'],
  ['ALTER DEFAULT PRIVILEGES ... GRANT ON PROCEDURES (a syntax error in Postgres 16: there is no such form)', 'alter default privileges in schema public grant execute on procedures to anon;', 'unmodelled grant statement'],
  ['ALTER DEFAULT PRIVILEGES ... REVOKE ON PROCEDURES', 'alter default privileges in schema public revoke execute on procedures from anon;', 'unmodelled grant statement'],
  ['a global ALTER DEFAULT PRIVILEGES ... ON PROCEDURES', 'alter default privileges revoke all on procedures from public;', 'unmodelled grant statement'],
  ['CREATE SCHEMA', 'create schema extra;', 'unmodelled statement'],
  ['DROP SCHEMA', 'drop schema extra cascade;', 'unmodelled statement'],
  ['ALTER SCHEMA', 'alter schema public rename to pub;', 'unmodelled statement'],
  ['CREATE EXTENSION', 'create extension pgcrypto;', 'unmodelled statement'],
  ['CREATE EXTENSION of a documented extension with no schema', 'create extension btree_gist;', 'unmodelled statement'],
  ['CREATE EXTENSION of a documented extension in another schema', 'create extension btree_gist with schema public;', 'unmodelled statement'],
  ['CREATE EXTENSION ... CASCADE', 'create extension if not exists btree_gist with schema extensions cascade;', 'unmodelled statement'],
  ['CREATE EXTENSION of an undocumented extension', 'create extension pg_net with schema extensions;', 'unmodelled statement'],
  ['CREATE ROLE', 'create role extra;', 'unmodelled statement'],
  ['ALTER ROLE', 'alter role anon set statement_timeout = 1;', 'unmodelled statement'],
  ['DROP TYPE (CASCADE drops functions that use it)', 'drop type public.t cascade;', 'unmodelled statement'],
  ['CREATE PROCEDURE', 'create procedure public.p() language sql as $$ select 1 $$;', 'unmodelled statement'],
  ['CREATE AGGREGATE', 'create aggregate public.agg(int) (sfunc = int4pl, stype = int);', 'unmodelled statement'],
  ['CREATE EVENT TRIGGER', 'create event trigger e on ddl_command_end execute function public.f();', 'unmodelled statement'],
  ['ALTER FUNCTION OWNER TO', 'alter function public.f() owner to someone;', 'unmodelled function statement'],
  ['ALTER FUNCTION RENAME TO', 'alter function public.f() rename to g;', 'unmodelled function statement'],
  ['ALTER FUNCTION SET SCHEMA', 'alter function public.f() set schema extra;', 'unmodelled function statement'],
  ['SET ROLE', 'set role anon;', 'unmodelled statement'],
  ['SET LOCAL ROLE', 'set local role anon;', 'unmodelled statement'],
  ['RESET ROLE', 'reset role;', 'unmodelled statement'],
  ['SET SESSION AUTHORIZATION', 'set session authorization anon;', 'unmodelled statement'],
  ['REASSIGN OWNED', 'reassign owned by a to b;', 'unmodelled statement'],
  ['CALL', 'call public.p();', 'unmodelled statement'],
  ['SET search_path FROM CURRENT on a function', fnSql('cur', 'security definer set search_path from current'), 'unmodelled function statement'],
  ['both SECURITY DEFINER and SECURITY INVOKER', fnSql('both', 'security definer security invoker'), 'unmodelled function statement'],
  ['a DO block running dynamic GRANT', "do $$ begin execute 'grant execute on function public.f() to anon'; end $$;", 'unmodelled DO block'],
  ['a DO block with GRANT in code position', 'do $$ begin grant execute on function public.f() to anon; end $$;', 'unmodelled DO block'],
  ['a DO block running dynamic REVOKE ON ALL FUNCTIONS', "do $$ begin execute 'revoke execute on all functions in schema public from public'; end $$;", 'unmodelled DO block'],
  ['a DO block altering a function dynamically', "do $$ begin execute format('alter function %s set search_path = public', 'public.f()'); end $$;", 'unmodelled DO block'],
  ['a DO block that changes default privileges', 'do $$ begin alter default privileges in schema public revoke execute on functions from anon; end $$;', 'unmodelled DO block'],
  ['a DO block creating a function', 'do $$ begin create function public.made() returns int language sql as $x$ select 1 $x$; end $$;', 'unmodelled DO block'],
  ['a DO block that changes role', "do $$ begin execute 'set local role anon'; end $$;", 'unmodelled DO block'],
  // ANY dynamic SQL is opaque. These three read as inert to a scan of the string literals (no
  // `on function` contiguous in one of them), and each one changes who can execute what.
  ['P1: a pg_proc loop that formats the object kind and signature into a REVOKE',
    "do $$ declare r record; begin for r in select p.oid::regprocedure::text as sig, 'FUNCTION' as kind from pg_proc p where p.proname = 'f' loop execute format('REVOKE ALL ON %s %s FROM anon, authenticated', r.kind, r.sig); end loop; end $$;", 'unmodelled DO block'],
  ['P2: a GRANT whose text is joined from parts', "do $$ begin execute 'GRANT EXECUTE ON ' || 'FUNCTION public.g() TO anon'; end $$;", 'unmodelled DO block'],
  ['P13: a REVOKE on every function whose text is joined from parts', "do $$ begin execute 'revoke all on all ' || 'functions in schema public from anon'; end $$;", 'unmodelled DO block'],
  ['a DO block that runs SQL held in a nested dollar quote', 'do $$ begin execute $q$ revoke all on function public.f() from anon $q$; end $$;', 'unmodelled DO block'],
  ['a DO block with a quoted language name in front of its body', "do language 'plpgsql' $$ begin execute 'revoke all on function public.f() from public, anon'; end $$;", 'unmodelled DO block'],
  ['a DO block in a language the model cannot read', "do language plpython3u $$ plpy.notice('nothing to see') $$;", 'unmodelled DO block'],
  ['a DO block with no readable body', 'do language plpgsql;', 'unmodelled DO block'],
  ['undocumented dynamic SQL, even when it only revokes a table column', "do $$ begin execute format('revoke all (%I) on table public.t from public, anon', 'c'); end $$;", 'unmodelled DO block'],
  ['undocumented dynamic SQL that looks harmless', "do $$ begin execute 'select 1'; end $$;", 'unmodelled DO block'],
  // A DO block changes the session's search_path or role WITHOUT `execute`. Each of these was
  // measured on PostgreSQL 16.13: the function created after the block landed in `private`, or
  // current_user became anon. A scan for `execute` and function statements read every one as inert.
  ['a DO block calling set_config on the search_path through PERFORM', "do $$ begin perform set_config('search_path', 'private', false); end $$;", 'unmodelled DO block'],
  ['a DO block calling set_config on the search_path through SELECT INTO', "do $$ declare v text; begin select set_config('search_path', 'private', false) into v; end $$;", 'unmodelled DO block'],
  ['a DO block calling set_config on the role', "do $$ begin perform set_config('role', 'anon', false); end $$;", 'unmodelled DO block'],
  ['a DO block calling set_config with a name it cannot read', "do $$ begin perform set_config(current_setting('x'), 'private', false); end $$;", 'unmodelled DO block'],
  ['a DO block calling set_config with a dollar-quoted name', 'do $$ begin perform set_config($q$search_path$q$, $q$private$q$, false); end $$;', 'unmodelled DO block'],
  ['a DO block with a bare SET search_path', 'do $$ begin set search_path to private; end $$;', 'unmodelled DO block'],
  ['a DO block with SET LOCAL search_path', 'do $$ begin set local search_path to private; end $$;', 'unmodelled DO block'],
  ['a DO block with RESET search_path', 'do $$ begin reset search_path; end $$;', 'unmodelled DO block'],
  ['a DO block with SET SCHEMA', "do $$ begin set schema 'private'; end $$;", 'unmodelled DO block'],
  ['a DO block with a bare SET SESSION ROLE', 'do $$ begin set session role anon; end $$;', 'unmodelled DO block'],
  ['a DO block with a bare SET LOCAL ROLE', 'do $$ begin set local role anon; end $$;', 'unmodelled DO block'],
  ['a DO block with a bare RESET ROLE', 'do $$ begin reset role; end $$;', 'unmodelled DO block'],
  // The same call, spelled so that a word-by-word comparison misses it. Each takes effect on PostgreSQL 16.13,
  // except inside a materialized view, where Postgres runs the query as a restricted operation and discards
  // the change (measured); that one is refused anyway, because refusing costs less than telling them apart.
  ['set_config through a quoted function name', "select pg_catalog.\"set_config\"('search_path', 'private', false);", 'unmodelled statement'],
  ['set_config through two quoted names', "select \"pg_catalog\".\"set_config\"('search_path', 'private', false);", 'unmodelled statement'],
  ['set_config on a name written with hex escapes', "select set_config(E'\\x73earch_path', 'private', false);", 'unmodelled statement'],
  ['set_config on a name written with octal escapes', "select set_config(E'\\163earch_path', 'private', false);", 'unmodelled statement'],
  ['set_config on a name written with U& escapes', "select set_config(U&'\\0073earch_path', 'private', false);", 'unmodelled statement'],
  ['set_config on a name built from two literals', "select set_config('search_' || 'path', 'private', false);", 'unmodelled statement'],
  ['set_config on a name that is cast', "select set_config('search_path'::text, 'private', false);", 'unmodelled statement'],
  ['set_config inside CREATE TABLE AS (it runs now)', "create table public.t2 as select set_config('search_path', 'private', false);", 'unmodelled statement'],
  ['set_config inside CREATE MATERIALIZED VIEW (refused although Postgres discards the change there)', "create materialized view public.mv as select set_config('role', 'anon', false);", 'unmodelled statement'],
  ['set_config inside INSERT ... SELECT', "insert into public.t select set_config('search_path', 'private', false);", 'unmodelled statement'],
  ['a DO block calling set_config through a quoted function name', "do $$ begin perform pg_catalog.\"set_config\"('search_path', 'private', false); end $$;", 'unmodelled DO block'],
  ['a DO block calling set_config on an escaped name', "do $$ begin perform set_config(E'\\x73earch_path', 'private', false); end $$;", 'unmodelled DO block'],
  ['a DO block calling set_config on a name built from parts', "do $$ begin perform set_config('search_' || 'path', 'private', false); end $$;", 'unmodelled DO block'],
  ['a DO block with a quoted SET search_path', 'do $$ begin set "search_path" to private; end $$;', 'unmodelled DO block'],
  ['a DO block with a quoted SET role', 'do $$ begin set "role" to anon; end $$;', 'unmodelled DO block'],
  ['a DO block with a quoted upper-case SET search_path', 'do $$ begin set "SEARCH_PATH" to private; end $$;', 'unmodelled DO block'],
  // DDL that is irrelevant until it can change which functions exist or what a later GRANT must call them.
  ['DROP TABLE ... CASCADE', 'drop table public.t cascade;', 'unmodelled statement'],
  ['DROP TABLE IF EXISTS ... CASCADE', 'drop table if exists public.t cascade;', 'unmodelled statement'],
  ['DROP VIEW ... CASCADE', 'drop view public.v cascade;', 'unmodelled statement'],
  ['DROP SEQUENCE ... CASCADE', 'drop sequence public.s cascade;', 'unmodelled statement'],
  ['ALTER TABLE ... RENAME TO', 'alter table public.t rename to u;', 'unmodelled statement'],
  ['ALTER TABLE ... SET SCHEMA', 'alter table public.t set schema other;', 'unmodelled statement'],
  ['ALTER VIEW ... RENAME TO', 'alter view public.v rename to w;', 'unmodelled statement'],
  ['ALTER SEQUENCE ... SET SCHEMA', 'alter sequence public.s set schema other;', 'unmodelled statement'],
  ['ALTER TYPE ... RENAME TO', 'alter type public.t rename to u;', 'unmodelled statement'],
  ['ALTER DOMAIN ... SET SCHEMA', 'alter domain public.d set schema other;', 'unmodelled statement'],
  // The search_path decides which schema every later UNQUALIFIED name resolves in.
  ['SET search_path', 'set search_path to private;', 'unmodelled statement'],
  ['SET search_path with =', 'set search_path = private;', 'unmodelled statement'],
  ['SET LOCAL search_path', 'set local search_path to private;', 'unmodelled statement'],
  ['SET SESSION search_path', 'set session search_path to private;', 'unmodelled statement'],
  ['RESET search_path', 'reset search_path;', 'unmodelled statement'],
  ['SET SCHEMA (Postgres\'s alias for it)', "set schema 'private';", 'unmodelled statement'],
  ['a quoted "search_path"', 'set "search_path" to private;', 'unmodelled statement'],
  ['set_config on the search_path', "select set_config('search_path', 'private', false);", 'unmodelled statement'],
  ['set_config on the role', "select set_config('role', 'anon', false);", 'unmodelled statement'],
  ['set_config on something the model cannot read', "select set_config(current_setting('x'), 'private', false);", 'unmodelled statement'],
  // Postgres refuses the WHOLE statement for a role that does not exist.
  ['a GRANT to a role that does not exist (a typo)', 'grant execute on function public.f() to anno;', 'unmodelled grant statement'],
  ['a REVOKE whose grantee list includes a role that does not exist', 'revoke all on function public.f() from public, anno;', 'unmodelled grant statement'],
  ['a REVOKE ON ALL FUNCTIONS naming a role that does not exist', 'revoke execute on all functions in schema public from public, anno;', 'unmodelled grant statement'],
  ['ALTER DEFAULT PRIVILEGES granting to a role that does not exist', 'alter default privileges in schema public grant execute on functions to anno;', 'unmodelled grant statement'],
  ['a quoted role that differs from anon only in case', 'revoke all on function public.f() from "ANON";', 'unmodelled grant statement'],
  ['a statement that does not start with a keyword', '(select 1);', 'unmodelled statement'],
  ['a head nobody has vouched for', 'security label for x on table public.t is \'y\';', 'unmodelled statement'],
];

for (const [name, sql, prefix] of UNMODELLED) {
  test(`an unmodelled shape fails, not skipped: ${name}`, () => {
    const model = replayOne(`${sql}\n${AFTER}`);
    assert.equal(model.unmodelled.length, 1, `exactly one unmodelled entry, got: ${messages(model).join(' | ') || 'none'}`);
    assert.ok(model.unmodelled[0].message.startsWith(`${prefix}: t.sql:1 `), `message must start "${prefix}: t.sql:1", got: ${model.unmodelled[0].message}`);
    assert.ok(model.fns.has('public.after_it()'), 'the model goes on after a shape it cannot read');
  });
}

test('ALTER DEFAULT PRIVILEGES: FUNCTIONS and ROUTINES are the same word and both change the default; PROCEDURES is refused and changes nothing', () => {
  // Measured on PostgreSQL 16.13: `... on functions` and `... on routines` give the same new-function ACL, and
  // `... on procedures` is `syntax error at or near "procedures"` (one default covers functions and procedures).
  const after = (sql) => { const m = replayOne(`alter default privileges revoke execute on functions from public;\n${sql}\n${fnSql('after_dp')}`); return m; };
  for (const noun of ['functions', 'routines']) {
    const m = after(`alter default privileges in schema public revoke execute on ${noun} from anon;`);
    assert.deepEqual(messages(m), [], noun);
    assert.equal(M.anonExecutable(m.fns.get('public.after_dp()')), false, `${noun}: the default for anon is closed`);
  }
  const refused = after('alter default privileges in schema public revoke execute on procedures from anon;');
  assert.equal(refused.unmodelled.length, 1);
  assert.match(refused.unmodelled[0].why, /unrecognised object class procedures/);
  assert.equal(M.anonExecutable(refused.fns.get('public.after_dp()')), true, 'the refused statement is not applied, so the Supabase default for anon stands');
});

test('the real pg_temp sweep in a file the model does not know is an unmodelled DO block', () => {
  const sweep = fs.readFileSync(join(DIR, '2026-08-09-definer-pg-temp-sweep.sql'), 'utf8');
  const model = M.replay([{ file: 'other-sweep.sql', sql: sweep }]);
  assert.equal(model.unmodelled.length, 1);
  assert.match(model.unmodelled[0].message, /^unmodelled DO block: other-sweep\.sql:\d+ /);
});

const HARMLESS = [
  'grant select on table public.t to anon;',
  'revoke all on public.t from public, anon, authenticated;',
  'grant select (a, b) on public.t to authenticated;',
  'grant usage on schema public to anon;',
  'revoke all on all tables in schema public from anon;',
  'grant usage on sequence public.s to anon;',
  'alter table public.t add column c int;',
  'create table if not exists public.t (id int);',
  'create unique index if not exists i on public.t (id);',
  'create policy p on public.t for select using (true);',
  'drop policy if exists p on public.t;',
  'create trigger tg before insert on public.t for each row execute function public.f();',
  'drop trigger if exists tg on public.t;',
  "insert into public.t values (1);",
  'update public.t set id = 2;',
  'delete from public.t;',
  'begin;',
  'commit;',
  "comment on function public.f() is 'x';",
  "comment on table public.t is 'x';",
  // What is left of SET/RESET once the role and the search_path are refused: settings that change
  // neither who runs a statement nor where an unqualified name resolves.
  'set statement_timeout = 0;',
  "set local lock_timeout = '5s';",
  'set session client_min_messages = warning;',
  "select set_config('request.jwt.claim.sub', 'x', false);",
  // A DO block with no `execute` and no function statement in code position: its strings only talk.
  "do $$ begin if has_function_privilege('anon', 'public.f()', 'EXECUTE') then raise exception 'anon can still grant nothing; revoke it from anon'; end if; end $$;",
  // A grantee that is postgres, the owner of everything a migration creates.
  'grant execute on function public.kept() to postgres;',
  'alter default privileges in schema public revoke all on tables from anon;',
  "create type public.mood as enum ('a', 'b');",
  "alter type public.mood add value 'c';",
  'create domain public.pos as int check (value > 0);',
  'create or replace view public.v as select 1;',
  'create materialized view public.mv as select 1;',
  'create unlogged table public.u (id int);',
];

test('statements that cannot change a function are read and ignored, not flagged', () => {
  for (const sql of HARMLESS) {
    const model = replayOne(`${fnSql('kept')}\n${sql}`);
    assert.deepEqual(messages(model), [], `flagged: ${sql}`);
    assert.equal(M.describeAll(model)['kept()'].anon, true, `${sql} must not change the function`);
  }
});

test('P3: after `set search_path to private`, the functions that follow are not silently filed under public', () => {
  // Measured on PostgreSQL 16.13: this script creates private.h() and revokes on private.h(), and no
  // public.h() ever exists. A model that ignored the SET filed the revoke under public.h().
  const m = replayOne(`set search_path to private;\n${fnSql('h')}\nrevoke all on function h() from public, anon;`);
  assert.equal(m.unmodelled.length, 1, messages(m).join(' | '));
  assert.match(m.unmodelled[0].message, /^unmodelled statement: t\.sql:1 changes the schema every later unqualified name resolves in/);
});

test('a statement naming an unknown grantee is not applied at all, because Postgres refuses it whole', () => {
  const m = replayOne(`${fnSql('f')}\nrevoke all on function public.f() from public, anno;`);
  assert.equal(m.unmodelled.length, 1);
  assert.match(m.unmodelled[0].message, /^unmodelled grant statement: t\.sql:2 REVOKE names "anno", which is not a role the model tracks \(public, anon, authenticated, service_role, postgres\)\. Postgres refuses the whole statement/);
  // Measured on PostgreSQL 16.13: `role "anno" does not exist`, ACL untouched. So the PUBLIC half must
  // not be applied either, or the model records a revoke no database ever made.
  assert.deepEqual(m.fns.get('public.f()').acl, { public: true, anon: true, authenticated: true, service_role: true });
  // The same statement spelled right is applied.
  const ok = replayOne(`${fnSql('f')}\nrevoke all on function public.f() from public, anon;`);
  assert.deepEqual(ok.unmodelled, []);
  assert.equal(M.describeAll(ok)['f()'].anon, false);
});

test('postgres is an inert grantee: naming it alongside a tracked role changes nothing but that role', () => {
  const m = replayOne(`${fnSql('f')}\nrevoke all on function public.f() from public, anon, postgres;`);
  assert.deepEqual(messages(m), []);
  assert.equal(M.describeAll(m)['f()'].anon, false);
  assert.equal(M.describeAll(m)['f()'].authenticated, true);
  assert.deepEqual(M.INERT_ROLES, ['postgres']);
});

// ── Documented DO blocks ─────────────────────────────────────────────────────

const readMigration = (name) => fs.readFileSync(join(DIR, name), 'utf8');
const doBlocks = (file) => splitStatements(readMigration(file), file).filter((s) => s.tokens[0]?.v === 'do').map((stmt) => ({ stmt, c: M.classifyDoBlock(stmt.tokens) }));
const bodyToken = (stmt) => stmt.tokens.find((t) => t.k === 'dollar' || t.k === 'string');

test('every documented DO block is real: found in its file by fingerprint, and used by the replay', () => {
  for (const d of M.DO_INERT) {
    assert.ok(fs.existsSync(join(DIR, d.file)), `${d.file} is documented in DO_INERT but does not exist`);
    assert.ok(d.reads.length >= 60, `${d.file}: say what the block runs`);
    const hits = doBlocks(d.file).filter(({ c }) => c.fingerprint === d.fingerprint);
    assert.equal(hits.length, 1, `${d.file}: no DO block has fingerprint ${d.fingerprint}: the block was edited, or the entry is stale`);
    assert.equal(hits[0].c.dynamic, true, `${d.file}: an inert entry documents DYNAMIC SQL; a block with no execute needs no entry`);
    assert.equal(hits[0].c.staticEffect, false, `${d.file}: a function statement in code position cannot be documented inert`);
  }
  for (const s of M.DO_SWEEPS) {
    const hits = doBlocks(s.file).filter(({ c }) => c.tag === s.tag);
    assert.equal(hits.length, 1, `${s.file} $${s.tag}$`);
    assert.equal(hits[0].c.fingerprint, s.fingerprint, `${s.file}: the sweep block was edited since DO_SWEEPS was written`);
  }
  assert.equal(real().counts['do:inert-documented'], M.DO_INERT.length, 'each documented inert block was used exactly once by the replay: an unused entry is stale');
  assert.ok(M.DO_INERT.length >= 2, 'the two dynamic DO blocks in the corpus that are not the sweep');
});

test('a documented inert DO block is accepted, and only under its own file name and its own code', () => {
  for (const d of M.DO_INERT) {
    const text = readMigration(d.file);
    const block = doBlocks(d.file).find(({ c }) => c.fingerprint === d.fingerprint).stmt;
    const tok = bodyToken(block);
    const alone = (file, sql) => M.replay([{ file, sql }]);
    const ok = alone(d.file, text);
    assert.deepEqual(messages(ok), [], `${d.file} read on its own`);
    assert.equal(ok.counts['do:inert-documented'], 1);
    // Keyed by file: the same text under another name is an undocumented dynamic block.
    const renamed = alone('renamed.sql', text);
    assert.equal(renamed.unmodelled.length, 1, d.file);
    assert.match(renamed.unmodelled[0].message, /^unmodelled DO block: renamed\.sql:\d+ a DO block can change a function \(it runs dynamic SQL/);
    assert.ok(renamed.unmodelled[0].message.includes(`fingerprint ${d.fingerprint}`), 'the message hands over the fingerprint to document');
    // Keyed by CODE: one added statement re-opens the question.
    const edited = text.slice(0, tok.start) + tok.raw.replace('execute', 'perform 1; execute') + text.slice(tok.end);
    assert.notEqual(edited, text);
    assert.equal(alone(d.file, edited).unmodelled.length, 1, `${d.file}: an edited block must not ride on the old reading`);
    // A reflow or a comment is not code: it must not re-open it.
    const reflowed = text.slice(0, tok.start) + tok.raw.replace('execute', '/* re-read, still inert */\n\n     execute') + text.slice(tok.end);
    assert.deepEqual(messages(alone(d.file, reflowed)), [], `${d.file}: whitespace and comments are not code`);
  }
});

test('a documented inert entry never excuses a function statement in code position', () => {
  const both = "do $$ begin grant execute on function public.f() to anon; execute 'select 1'; end $$;";
  const [stmt] = splitStatements(both, 'x.sql');
  const c = M.classifyDoBlock(stmt.tokens);
  assert.equal(c.dynamic, true);
  assert.equal(c.staticEffect, true);
  const entry = (sql) => [{ file: 'x.sql', fingerprint: M.classifyDoBlock(splitStatements(sql, 'x.sql')[0].tokens).fingerprint, reads: 'a test entry that documents exactly this block as inert' }];
  const refused = M.replay([{ file: 'x.sql', sql: both }], { doInert: entry(both) });
  assert.equal(refused.unmodelled.length, 1, 'a documented entry cannot turn a code-position GRANT into an inert block');
  assert.match(refused.unmodelled[0].message, /it has a GRANT\/REVOKE on functions statement in code position/);
  // Control: the same kind of entry DOES excuse dynamic SQL that has no such statement.
  const dyn = "do $$ begin execute 'select 1'; end $$;";
  const accepted = M.replay([{ file: 'x.sql', sql: dyn }], { doInert: entry(dyn) });
  assert.deepEqual(messages(accepted), []);
  assert.equal(accepted.counts['do:inert-documented'], 1);
});

test('a documented sweep is keyed by its fingerprint too: an edited block is unmodelled, not applied on the old reading', () => {
  const [sweep] = M.DO_SWEEPS;
  const text = readMigration(sweep.file);
  const ok = M.replay([{ file: sweep.file, sql: text }]);
  assert.deepEqual(messages(ok), []);
  assert.equal(ok.sweeps.length, 1);
  const stale = M.replay([{ file: sweep.file, sql: text }], { doSweeps: [{ ...sweep, fingerprint: '0000000000000000' }] });
  assert.equal(stale.unmodelled.length, 1);
  assert.match(stale.unmodelled[0].message, /has been edited since \(now a73fa8456946350b\): re-read it, then update DO_SWEEPS/);
  assert.equal(stale.sweeps.length, 0, 'and the sweep is not applied');
  const tok = bodyToken(doBlocks(sweep.file).find(({ c }) => c.tag === sweep.tag).stmt);
  const edited = text.slice(0, tok.start) + tok.raw.replace("'alter function %I.%I(%s) set search_path to %s'", "'alter function %I.%I(%s) set search_path to %s, extra'") + text.slice(tok.end);
  assert.notEqual(edited, text);
  assert.equal(M.replay([{ file: sweep.file, sql: edited }]).unmodelled.length, 1, 'a real edit to the sweep re-opens it');
});

test('a DO block that only talks about the search_path, or sets a harmless parameter, is still inert', () => {
  // The other half of the rule: what makes a block an effect is a STATEMENT, not a word.
  for (const [what, sql] of [
    ['set_config of an unrelated parameter', "do $$ begin perform set_config('statement_timeout', '5s', false); end $$;"],
    ['a message that spells out set_config, SET search_path and SET ROLE', "do $$ begin raise notice 'set search_path to private; set_config(''search_path'', ''x'', false); set role anon'; end $$;"],
    ['a column whose name starts with schema', "do $$ begin update public.t set schema_name = 'x' where id = 1; end $$;"],
    ['a column whose name starts with search_path', "do $$ begin update public.t set search_path_hint = 'x'; end $$;"],
    ['a function whose name only contains set_config', "do $$ begin perform public.my_set_config_helper('x'); end $$;"],
    ['set_config with a quoted name of another case (a different function)', "do $$ begin perform pg_catalog.\"SET_CONFIG\"('search_path', 'private', false); end $$;"],
    ['a variable called role_name', "do $$ declare role_name text; begin role_name := 'anon'; end $$;"],
  ]) {
    const m = replayOne(`${sql}\n${AFTER}`);
    assert.deepEqual(messages(m), [], what);
    assert.equal(m.counts['do:inert'], 1, what);
  }
});

test('a documented inert entry never excuses a change of the search_path or the role in code position', () => {
  for (const sql of [
    "do $$ begin perform set_config('search_path', 'private', false); execute 'select 1'; end $$;",
    "do $$ begin set search_path to private; execute 'select 1'; end $$;",
    "do $$ begin set session role anon; execute 'select 1'; end $$;",
  ]) {
    const [stmt] = splitStatements(sql, 'x.sql');
    const c = M.classifyDoBlock(stmt.tokens);
    assert.equal(c.dynamic, true, sql);
    assert.equal(c.staticEffect, true, `${sql}: a statement in code position, which no inert entry may excuse`);
    const entry = [{ file: 'x.sql', fingerprint: c.fingerprint, reads: 'a test entry that documents exactly this block as inert' }];
    const refused = M.replay([{ file: 'x.sql', sql }], { doInert: entry });
    assert.equal(refused.unmodelled.length, 1, sql);
    assert.match(refused.unmodelled[0].message, /^unmodelled DO block: x\.sql:1 /);
  }
});

test('the reason a DO block is refused says what it changes', () => {
  const why = (sql) => M.classifyDoBlock(splitStatements(sql, 'x.sql')[0].tokens).why;
  assert.equal(why("do $$ begin perform set_config('search_path', 'private', false); end $$;"), "it calls set_config('search_path'), which changes the schema every later unqualified name resolves in");
  assert.equal(why("do $$ begin perform set_config('role', 'anon', false); end $$;"), "it calls set_config('role'), which changes who the session runs as");
  assert.equal(why("do $$ begin perform set_config(current_setting('x'), 'y', false); end $$;"), 'it calls set_config with a parameter name the model cannot read, which could be the search_path or the role');
  assert.equal(why('do $$ begin set search_path to private; end $$;'), 'it has a SET search_path / SET SCHEMA statement in code position');
  assert.equal(why('do $$ begin set session role anon; end $$;'), 'it has a SET ROLE statement in code position');
});

test('GRANT/REVOKE targets: PROCEDURE and ALL PROCEDURES are not functions; FUNCTION, ROUTINE, ALL FUNCTIONS and ALL ROUTINES are', () => {
  const target = (sql) => M.parseAclStatement(splitStatements(sql, 'x.sql')[0].tokens).target;
  assert.equal(target('revoke all on procedure public.p() from anon;').kind, 'other');
  assert.equal(target('revoke all on all procedures in schema public from anon;').kind, 'other');
  assert.equal(target('revoke all on function public.f() from anon;').kind, 'function');
  assert.equal(target('revoke all on routine public.f() from anon;').kind, 'function');
  assert.equal(target('revoke all on all functions in schema public from anon;').kind, 'all-functions');
  assert.equal(target('revoke all on all routines in schema public from anon;').kind, 'all-functions');
});

test('DDL that cannot change which functions exist or what they are called is still ignored', () => {
  for (const [what, sql] of [
    ['DROP TABLE without CASCADE (Postgres refuses it while a function depends on the row type)', 'drop table public.t;'],
    ['DROP INDEX ... CASCADE', 'drop index public.i cascade;'],
    ['DROP TRIGGER ... CASCADE', 'drop trigger tg on public.t cascade;'],
    ['DROP POLICY ... CASCADE', 'drop policy p on public.t cascade;'],
    ['ALTER TABLE ... RENAME COLUMN', 'alter table public.t rename column a to b;'],
    ['ALTER TABLE ... RENAME a TO b (a column)', 'alter table public.t rename a to b;'],
    ['ALTER TABLE ... RENAME CONSTRAINT', 'alter table public.t rename constraint c1 to c2;'],
    ['ALTER TABLE ... ALTER COLUMN schema SET DEFAULT', 'alter table public.t alter column schema set default 1;'],
    ['ALTER TABLE ... SET (fillfactor)', 'alter table public.t set (fillfactor = 70);'],
    ['ALTER TYPE ... ADD VALUE', "alter type public.t add value 'x';"],
    ['ALTER INDEX ... RENAME TO (an index is not a type)', 'alter index public.i rename to j;'],
    ['ALTER POLICY ... RENAME TO', 'alter policy p on public.t rename to q;'],
  ]) {
    const m = replayOne(`${sql}\n${AFTER}`);
    assert.deepEqual(messages(m), [], what);
  }
});

test('DROP TABLE ... CASCADE is refused because the replay would keep a function that Postgres dropped', () => {
  // Measured on PostgreSQL 16.13: `drop table t cascade` drops f(t), and the f made again afterwards has
  // the default ACL (open to anon). Ignoring the DROP leaves the first f standing, closed by its revoke,
  // so the replay would report the new f as closed.
  const m = replayOne([
    'create table public.t (a int);',
    'create function public.f(p public.t) returns int language sql security definer as $$ select 1 $$;',
    'revoke all on function public.f(public.t) from public, anon;',
    'drop table public.t cascade;',
    'create table public.t (a int);',
    'create function public.f(p public.t) returns int language sql security definer as $$ select 1 $$;',
  ].join('\n'));
  assert.equal(m.unmodelled.length, 1);
  assert.match(m.unmodelled[0].message, /^unmodelled statement: t\.sql:4 DROP TABLE \.\.\. CASCADE also drops every function whose argument or result type is its row type/);
});

test('castTypeEnd: what a type after :: or AS can look like, and where it stops', () => {
  const last = (sql) => { const t = tokenize(sql, 't.sql'); return { t, end: M.castTypeEnd(t, 0) }; };
  for (const ty of ['uuid', 'pg_catalog.uuid', '"uuid"', 'public."My Type"', 'character varying', 'character varying(36)', 'varchar(36)', 'char varying(2)', 'bit varying(8)', 'double precision', 'numeric(10, 2)', 'timestamp(3) with time zone', 'timestamp without time zone', 'time with time zone', 'uuid[]', 'uuid[][]', 'int[3]', 'int array', 'int array[3]', 'character varying(36)[]', 'pg_catalog.text[]']) {
    const { t, end } = last(ty);
    assert.equal(end, t.length - 1, `${ty}: the whole input is one type`);
  }
  for (const [sql, stop] of [['uuid <> x', 0], ['uuid)', 0], ['uuid and p', 0], ['text, y', 0], ['pg_catalog.uuid = x', 2], ['character varying <> x', 1], ['uuid[] <> x', 2], ['timestamp(3) with time zone and x', 6], ['double precision = 1', 1]]) {
    assert.equal(last(sql).end, stop, `${sql}: the type ends at token ${stop}`);
  }
  assert.equal(last('1').end, -1, 'a number is not a type');
  assert.equal(last('(').end, -1, 'neither is a bracket');
});

test('a PROCEDURE reference leaves no orphan and no unmodelled entry: it is not about a function', () => {
  const m = replayOne(`revoke all on procedure public.never_made() from public, anon;\nrevoke all on all procedures in schema public from public, anon;\n${AFTER}`);
  assert.deepEqual(messages(m), []);
  assert.deepEqual(m.orphans, []);
  assert.equal(m.counts['acl:other-object'], 2);
});

test('a DO block whose only strings mention a function statement is still inert: strings are not scanned', () => {
  // The other half of the rule. `execute` is what makes a block opaque; a raise message that spells out a
  // GRANT is not a statement, and flagging it would push every guard block into DO_INERT.
  const m = replayOne(`do $$ begin raise notice 'grant execute on function public.f() to anon; drop function public.f(); execute'; end $$;\n${AFTER}`);
  assert.deepEqual(messages(m), []);
  assert.equal(m.counts['do:inert'], 1);
});

// ── 4. The real tree ─────────────────────────────────────────────────────────

test('every statement of every migration is modelled or known to be irrelevant', () => {
  assert.deepEqual(messages(real()), [], 'a statement that could change EXECUTE, the definer flag or the pin is not understood');
});

// Each row is what a lockdown migration's OWN guard asserts about its end state (the DO block at
// the bottom of the file, which the model treats as inert), so this is the model reproducing an
// intent the author verified against the live catalog. A later DROP then CREATE that resets one of
// them fails here, which is the regression the lockdowns exist to prevent.
const CLOSED = { anon: false, authenticated: false, service_role: true };
const SIGNED_IN = { anon: false, authenticated: true, service_role: true };
const PINNED = 'public, pg_temp';
const LOCKDOWNS = [
  ['2026-08-02-rpc-grant-lockdown.sql', 'apply_obligation_penalty', CLOSED],
  ['2026-08-02-rpc-grant-lockdown.sql', 'award_session_kept', CLOSED],
  ['2026-08-02-rpc-grant-lockdown.sql', 'settle_commitment', CLOSED],
  ['2026-08-02-rpc-grant-lockdown.sql', 'get_store_credit_for', CLOSED],
  ['2026-08-02-rpc-grant-lockdown.sql', 'get_user_points', SIGNED_IN],
  ['2026-08-02-rpc-grant-lockdown.sql', 'is_coach_on_client', { authenticated: true, config: PINNED }],
  ['2026-06-30-rpc-authz-hardening.sql', 'admin_list_store_fulfillment', CLOSED],
  ['2026-06-30-rpc-authz-hardening.sql', 'admin_mark_store_fulfilled', CLOSED],
  ['2026-06-30-rpc-authz-hardening.sql', 'consume_store_credit', CLOSED],
  ['2026-09-10-league-grant-lockdown.sql', 'league_week_score', { ...CLOSED, config: PINNED }],
  ['2026-09-10-league-grant-lockdown.sql', 'league_standings', { ...SIGNED_IN, config: PINNED }],
  ['2026-06-29-league-cohort-atomic.sql', 'league_assign_cohort', { anon: false, authenticated: false }],
];

test('the shipped lockdowns hold in the replay, as each migration\'s own guard states', () => {
  const all = M.describeAll(real());
  const byName = (name) => Object.entries(all).filter(([k]) => k.startsWith(`${name}(`));
  for (const [file, name, want] of LOCKDOWNS) {
    assert.ok(fs.existsSync(join(DIR, file)), `${file} is named here but does not exist`);
    const hits = byName(name);
    assert.equal(hits.length, 1, `${name} must be exactly one function`);
    for (const [field, value] of Object.entries(want)) assert.equal(hits[0][1][field], value, `${name}.${field} — ${file} states this end state and something later undid it`);
  }
});

test('the model is reading what it claims to (coverage floors)', (t) => {
  const c = real().counts;
  const floors = { 'create-function': 250, 'drop-function': 30, 'acl:function': 300, 'alter-function': 2, 'do:sweep:pg-temp-append': 1 };
  for (const [kind, floor] of Object.entries(floors)) {
    assert.ok((c[kind] ?? 0) >= floor, `${kind}: read ${c[kind] ?? 0}, expected at least ${floor} — the classifier has stopped recognising a statement class`);
  }
  assert.ok(real().files.length >= 200, `only ${real().files.length} migration files were read`);
  t.diagnostic(`read ${real().files.length} files: ${Object.entries(c).filter(([k]) => !k.startsWith('ignored')).map(([k, v]) => `${k} ${v}`).join(' · ')}`);
});

test('nothing in the tree names a function before it exists, creates one twice, or names one ambiguously', () => {
  assert.deepEqual(real().orphans, [], 'an ACL, ALTER or DROP statement names a function no earlier statement creates');
  assert.deepEqual(real().duplicateCreates, [], 'a plain CREATE FUNCTION of a signature that already exists');
  assert.deepEqual(real().ambiguous, [], 'a name-only reference matches more than one overload');
});

test('no overloads: every function name in public is one signature', () => {
  // The allow-list and the live capture are name-level. A second signature under a name would
  // let a gated overload vouch for an ungated one, so a future overload fails HERE, loudly,
  // instead of being conflated.
  assert.deepEqual(M.overloads(real()), []);
});

test('every documented DO sweep is present and ran exactly once', (t) => {
  assert.equal(real().sweeps.length, M.DO_SWEEPS.length);
  for (const s of M.DO_SWEEPS) {
    assert.ok(fs.existsSync(join(DIR, s.file)), `${s.file} is documented in DO_SWEEPS but does not exist`);
    assert.equal(real().sweeps.filter((r) => r.file === s.file && r.tag === s.tag).length, 1, `${s.file} $${s.tag}$ must have run once`);
  }
  const sweep = real().sweeps[0];
  assert.ok(sweep.touched.length >= 100, `the sweep pinned ${sweep.touched.length} functions; it pinned 115 when this was written`);
  // The sweep's own guard raises when a definer has NO search_path at all. If the model finds
  // one at that point, the model and the migration disagree about what existed.
  assert.deepEqual(sweep.noPath, []);
  t.diagnostic(`the 2026-08-09 sweep pinned ${sweep.touched.length} functions in the replay`);
});

test('the migration order is date order, with the compact CLI form and the extension handled', () => {
  assert.equal(M.migrationOrderKey('20260924020426_atomic.sql'), '2026-09-24-020426_atomic');
  assert.equal(M.migrationOrderKey('2026-09-24-x.sql'), '2026-09-24-x');
  const names = ['2026-09-25-a.sql', '20260924020426_x.sql', '2026-09-23-z.sql'];
  assert.notDeepEqual([...names].sort(), ['2026-09-23-z.sql', '20260924020426_x.sql', '2026-09-25-a.sql'], 'a plain sort misplaces the compact file after a later dashed one');
  assert.deepEqual(M.orderMigrationFiles(names, []), ['2026-09-23-z.sql', '20260924020426_x.sql', '2026-09-25-a.sql']);
  assert.deepEqual(M.orderMigrationFiles(['foo-fix.sql', 'foo.sql'], []), ['foo.sql', 'foo-fix.sql'], 'a follow-up replays after the file it follows');
});

test('an ordering constraint moves its file ahead, and one whose files are absent is ignored', () => {
  const c = [{ before: 'b.sql', after: 'a.sql', why: 'x' }];
  assert.deepEqual(M.orderMigrationFiles(['a.sql', 'b.sql', 'c.sql'], c), ['b.sql', 'a.sql', 'c.sql']);
  assert.deepEqual(M.orderMigrationFiles(['a.sql', 'c.sql'], c), ['a.sql', 'c.sql']);
  assert.deepEqual(M.orderMigrationFiles(['b.sql', 'a.sql'], c), ['b.sql', 'a.sql'], 'already in order: untouched');
});

const allFiles = () => fs.readdirSync(DIR).filter((f) => f.endsWith('.sql'));
const permutations = (xs) => (xs.length <= 1 ? [xs] : xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((rest) => [x, ...rest])));

test('each same-day ordering constraint is still justified', () => {
  const created = (file) => {
    const names = new Set();
    for (const st of splitStatements(fs.readFileSync(join(DIR, file), 'utf8'), file)) {
      const t = st.tokens;
      if (t[0]?.v === 'create' && (t[1]?.v === 'function' || (t[1]?.v === 'or' && t[3]?.v === 'function'))) names.add(M.parseCreateFunction(t).name);
    }
    return names;
  };
  const files = allFiles();
  for (const c of M.ORDER_CONSTRAINTS) {
    for (const f of [c.before, c.after]) assert.ok(fs.existsSync(join(DIR, f)), `${f} is named by an ordering constraint but does not exist`);
    assert.ok(c.why.length > 30, `${c.before}: the reason must be written down`);
    assert.equal(c.before.slice(0, 10), c.after.slice(0, 10), 'a constraint breaks a tie within ONE date; it does not reorder days');
    // The constraint must be DOING WORK: without it the pair replays the wrong way round. The plain
    // sort alone is not the test, because a chain (surface, then units, then prev-race) needs a link
    // that the plain sort already satisfies and that the OTHER constraint would undo.
    const without = M.orderMigrationFiles(files, M.ORDER_CONSTRAINTS.filter((x) => x !== c));
    assert.ok(without.indexOf(c.after) < without.indexOf(c.before), `${c.before} before ${c.after} changes nothing: without it the pair already replays in that order — delete it`);
    const shared = [...created(c.before)].filter((n) => created(c.after).has(n));
    assert.ok(shared.length > 0, `${c.before} and ${c.after} define no function in common, so the order between them cannot matter`);
  }
  // And each one must still CHANGE the model: a constraint whose removal moves nothing is stale.
  const fingerprint = (constraints) => JSON.stringify([...M.replay(M.orderMigrationFiles(files, constraints).map((file) => ({ file, sql: fs.readFileSync(join(DIR, file), 'utf8') }))).fns.values()].map((f) => [f.key, f.file, f.line, f.acl, f.searchPath, f.definer]));
  const full = fingerprint(M.ORDER_CONSTRAINTS);
  for (const c of M.ORDER_CONSTRAINTS) {
    assert.notEqual(fingerprint(M.ORDER_CONSTRAINTS.filter((x) => x !== c)), full, `${c.before} before ${c.after} changes nothing in the model any more — delete it`);
  }
});

test('ordering constraints chain: the passes settle to a fixpoint, and a contradiction is an error, not an order', () => {
  // plain order x, y, z. Wanted: z before y before x.
  const yx = { before: 'y.sql', after: 'x.sql', why: 'a test constraint' };
  const zy = { before: 'z.sql', after: 'y.sql', why: 'a test constraint' };
  const names = ['x.sql', 'y.sql', 'z.sql'];
  assert.deepEqual(M.orderMigrationFiles(names, [yx, zy]), ['z.sql', 'y.sql', 'x.sql']);
  // Listed the other way round, ONE pass leaves [y, x, z] (moving y drags it back over z's link):
  // the second pass is what fixes it.
  assert.deepEqual(M.orderMigrationFiles(names, [zy, yx]), ['z.sql', 'y.sql', 'x.sql']);
  assert.throws(() => M.orderMigrationFiles(['x.sql', 'y.sql'], [{ before: 'x.sql', after: 'y.sql', why: 'a' }, { before: 'y.sql', after: 'x.sql', why: 'b' }]), /ordering constraints contradict each other/);
  assert.deepEqual(M.orderMigrationFiles(names, [yx, yx]), ['y.sql', 'x.sql', 'z.sql'], 'a constraint listed twice settles');
});

test('the real constraints give one order whatever order they are listed in, and the pr-wall trio replays surface, units, prev-race', () => {
  const files = allFiles();
  const want = M.orderMigrationFiles(files).join('\n');
  for (const p of permutations(M.ORDER_CONSTRAINTS)) assert.equal(M.orderMigrationFiles(files, p).join('\n'), want, `constraints listed as ${p.map((c) => c.before.slice(11, 26)).join(' / ')}`);
  const order = M.orderMigrationFiles(files);
  const at = (f) => order.indexOf(`2026-09-10-pr-wall-${f}.sql`);
  assert.ok(at('surface') !== -1 && at('surface') < at('units') && at('units') < at('prev-race'), `surface ${at('surface')}, units ${at('units')}, prev-race ${at('prev-race')}`);
  // ...which is what makes the latest post_my_pr_to_wall the prev-race one, the fix for the race.
  const fn = real().fns.get('public.post_my_pr_to_wall(text,numeric,text,integer,uuid)');
  assert.equal(fn.file, '2026-09-10-pr-wall-prev-race.sql');
});

// ── Same-day files that define one function differently ──────────────────────

let sameDayRows = null;
const sameDay = () => (sameDayRows ??= M.sameDayDefinitions(DIR));
const label = (p) => `${p.a} + ${p.b} · ${p.fn}`;

test('same-day files that define one function DIFFERENTLY are ordered by a constraint or carry a written ruling', () => {
  const open = M.unresolvedSameDayPairs(sameDay());
  assert.deepEqual(open.map(label), [], 'each of these is a same-day pair whose replay order the model is guessing: order it with an ORDER_CONSTRAINT (if the later file says it reworks the earlier), or read both bodies and add a REVIEWED_SAME_DAY_PAIRS ruling that order does not change the audit');
});

test('each reviewed same-day pair is real, unconstrained, still different, and carries a ruling', () => {
  const live = sameDay().filter((p) => p.differs && !M.constraintOrders(M.ORDER_CONSTRAINTS, p.a, p.b));
  const seen = new Set();
  for (const r of M.REVIEWED_SAME_DAY_PAIRS) {
    assert.equal(r.files.length, 2, r.fn);
    for (const f of r.files) assert.ok(fs.existsSync(join(DIR, f)), `${f} is named by a ruling but does not exist`);
    assert.equal(r.files[0].slice(0, 10), r.files[1].slice(0, 10), 'a same-day pair');
    assert.ok(r.ruling.length >= 60, `${r.files.join(' + ')}: the ruling must say why order does not matter`);
    assert.ok(live.some((p) => p.fn === r.fn && r.files.includes(p.a) && r.files.includes(p.b)), `${r.files.join(' + ')} · ${r.fn}: no longer a same-day pair that defines the function differently, or a constraint orders it now — delete the ruling`);
    const key = [...r.files].sort().join('|') + r.fn;
    assert.ok(!seen.has(key), `${key} is ruled on twice`);
    seen.add(key);
  }
  assert.equal(live.length, M.REVIEWED_SAME_DAY_PAIRS.length, 'every unconstrained differing pair has exactly one ruling');
});

test('the enumeration finds what it should on the real tree', () => {
  const rows = sameDay();
  assert.ok(rows.length >= 24, `same-day (pair, function) rows: ${rows.length}; the enumeration has stopped finding them (24 when this was written)`);
  const differing = rows.filter((p) => p.differs);
  assert.ok(differing.length >= 14, `${differing.length} differing rows (14 when this was written)`);
  const ordered = differing.filter((p) => M.constraintOrders(M.ORDER_CONSTRAINTS, p.a, p.b));
  assert.deepEqual([...new Set(ordered.map((p) => p.fn))].sort(), ['award_meal_log(date)', 'get_follow_list(uuid,text)', 'get_follow_stats(uuid)', 'post_my_pr_to_wall(text,numeric,text,integer,uuid)', 'toggle_follow(uuid)']);
  assert.equal(differing.length - ordered.length, M.REVIEWED_SAME_DAY_PAIRS.length);
  // With no constraint and no ruling the whole differing set is open: the two lists are what closes it.
  assert.equal(M.unresolvedSameDayPairs(rows, [], []).length, differing.length);
});

/**
 * Replays `files` in the model's order and again with each unconstrained same-day group (files linked by
 * a shared function) in every other order, and returns the reversals that change what the audit
 * concludes: every function's classification (never its body text or file:line), the model's lists of
 * orphans, duplicates and ambiguous names, and, when `allow` is given, the allow-list's own verdict.
 */
function reversalDiffs({ files, read, pairs, constraints = M.ORDER_CONSTRAINTS, allow = null }) {
  const base = M.orderMigrationFiles(files, constraints);
  const snapshot = (order) => {
    const m = M.replay(order.map((file) => ({ file, sql: read(file) })));
    return JSON.stringify({
      fns: [...m.fns.values()].filter((f) => f.schema === 'public').map((f) => [f.key, M.describeFunction(f), f.definer ? gatesOf(f) : null, f.definer ? grantOf(f) : null]).sort(),
      orphans: m.orphans.map((o) => `${o.op} ${o.ref}`).sort(),
      duplicates: m.duplicateCreates.map((d) => d.key).sort(),
      ambiguous: m.ambiguous.map((x) => `${x.op} ${x.ref}`).sort(),
      unmodelled: m.unmodelled.length,
      allowList: allow ? checkAllowlist(m, allow) : null,
    });
  };
  const want = snapshot(base);
  // Groups: same-day files linked by an unconstrained pair that shares a function (identical definitions
  // or not: two files can share a definition and still disagree about who may execute it).
  const groups = [];
  for (const p of pairs.filter((x) => !M.constraintOrders(constraints, x.a, x.b))) {
    const hit = groups.filter((g) => g.has(p.a) || g.has(p.b));
    const merged = new Set([p.a, p.b, ...hit.flatMap((g) => [...g])]);
    for (const g of hit) groups.splice(groups.indexOf(g), 1);
    groups.push(merged);
  }
  const diffs = [];
  let replays = 0;
  for (const g of groups) {
    const members = [...g].sort((x, y) => base.indexOf(x) - base.indexOf(y));
    assert.ok(members.length <= 4, `${members.join(' + ')}: too many files to try every order; write a constraint`);
    const slots = members.map((f) => base.indexOf(f));
    for (const perm of permutations(members)) {
      if (perm.every((f, i) => f === members[i])) continue;
      const order = [...base];
      slots.forEach((slot, i) => { order[slot] = perm[i]; });
      replays++;
      if (snapshot(order) !== want) diffs.push(`${members.join(' + ')} replayed as ${perm.join(' + ')}`);
    }
  }
  return { diffs, groups, replays };
}

test('reversing a same-day pair changes no classification: the claim behind every ruling, measured', (t) => {
  // The claim a ruling makes is "order does not change what the audit concludes", so it is measured:
  // the whole tree is replayed with each same-day group (get_public_profile's trio included) in every
  // other order, and only body text and file:line may move.
  const files = allFiles();
  const sql = new Map(files.map((f) => [f, fs.readFileSync(join(DIR, f), 'utf8')]));
  const { diffs, groups, replays } = reversalDiffs({ files, read: (f) => sql.get(f), pairs: sameDay(), allow: ALLOW });
  assert.deepEqual(diffs, [], 'a reversal changes a classification: an ordering constraint is needed (or the ruling is wrong)');
  assert.ok(groups.length >= 8, `only ${groups.length} same-day groups: the enumeration has stopped finding them`);
  assert.ok(replays >= 12, `only ${replays} reversals ran`);
  t.diagnostic(`${groups.length} same-day groups (${groups.map((g) => g.size).join(', ')} files), ${replays} reversed replays, every one identical to the base order`);
});

test('the reversal check can fail: it reports a same-day pair whose order changes the ACL', () => {
  // a.sql creates f and closes anon; b.sql drops f and creates it again (a fresh default ACL). Replayed
  // a, b the function ends OPEN; replayed b, a it ends CLOSED. A reversal check that could not see that
  // would pass anything.
  const fn = (mode) => `${mode} function public.f() returns int language sql security definer as $$ select 1 $$;`;
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'definer-reverse-'));
  try {
    fs.writeFileSync(join(dir, '2026-02-01-a.sql'), `${fn('create or replace')}\nrevoke all on function public.f() from public, anon;\n`);
    fs.writeFileSync(join(dir, '2026-02-01-b.sql'), `drop function if exists public.f();\n${fn('create')}\n`);
    fs.writeFileSync(join(dir, '2026-02-02-c.sql'), `${fn('create or replace')}\n`);
    fs.writeFileSync(join(dir, '2026-02-02-d.sql'), `${fn('create or replace')}\n`);
    const files = fs.readdirSync(dir).sort();
    const pairs = M.sameDayDefinitions(dir, files);
    const { diffs, groups } = reversalDiffs({ files, read: (f) => fs.readFileSync(join(dir, f), 'utf8'), pairs });
    assert.equal(groups.length, 2, 'both pairs are groups');
    assert.deepEqual(diffs, ['2026-02-01-a.sql + 2026-02-01-b.sql replayed as 2026-02-01-b.sql + 2026-02-01-a.sql'], 'the ACL-sensitive pair is reported, and the harmless one (identical files) is not');
    // and a constraint that fixes the order removes it from the check
    const fixed = reversalDiffs({ files, read: (f) => fs.readFileSync(join(dir, f), 'utf8'), pairs, constraints: [{ before: '2026-02-01-a.sql', after: '2026-02-01-b.sql', why: 'a test constraint' }] });
    assert.deepEqual(fixed.diffs, []);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('the enumerator: a same-day pair is found by its code, ignoring comments and whitespace, and never across days', () => {
  const dir = fs.mkdtempSync(join(os.tmpdir(), 'definer-sameday-'));
  try {
    const put = (name, body, attrs = 'security definer set search_path = public, pg_temp') => fs.writeFileSync(join(dir, name), `create or replace function public.shared() returns int language sql ${attrs} as $$ ${body} $$;\n`);
    put('2026-01-01-a.sql', 'select 1');
    put('2026-01-01-b.sql', 'select 2');
    put('2026-01-02-c.sql', 'select 3');
    put('2026-01-03-d.sql', '/* only a comment differs */ select   1');
    put('2026-01-03-e.sql', 'select 1');
    put('2026-01-04-f.sql', 'select 1');
    put('2026-01-04-g.sql', 'select 1', 'security definer set search_path = public');
    put('2026-01-05-h.sql', 'select 1');
    put('2026-01-05-i.sql', 'select 1', 'security invoker set search_path = public, pg_temp');
    const rows = M.sameDayDefinitions(dir);
    const by = (a) => rows.find((r) => r.a === a);
    assert.deepEqual(rows.map((r) => `${r.date} ${r.a} ${r.b}`), ['2026-01-01 2026-01-01-a.sql 2026-01-01-b.sql', '2026-01-03 2026-01-03-d.sql 2026-01-03-e.sql', '2026-01-04 2026-01-04-f.sql 2026-01-04-g.sql', '2026-01-05 2026-01-05-h.sql 2026-01-05-i.sql'], 'files dated on different days are never a pair');
    assert.equal(by('2026-01-01-a.sql').differs, true, 'a different body differs');
    assert.equal(by('2026-01-03-d.sql').differs, false, 'a comment and whitespace are not code');
    assert.equal(by('2026-01-04-f.sql').differs, true, 'a different search_path differs');
    assert.equal(by('2026-01-05-h.sql').differs, true, 'a different security mode differs');
    // and the resolution logic
    const ab = { a: '2026-01-01-a.sql', b: '2026-01-01-b.sql', fn: 'shared()', differs: true };
    assert.equal(M.unresolvedSameDayPairs([ab], [], []).length, 1);
    assert.equal(M.unresolvedSameDayPairs([{ ...ab, differs: false }], [], []).length, 0, 'identical definitions need no ruling');
    assert.equal(M.unresolvedSameDayPairs([ab], [{ before: ab.b, after: ab.a, why: 'x' }], []).length, 0, 'a constraint orders it, in either direction');
    assert.equal(M.unresolvedSameDayPairs([ab], [], [{ files: [ab.b, ab.a], fn: 'shared()', ruling: 'x' }]).length, 0, 'a ruling covers it whichever way its files are listed');
    assert.equal(M.unresolvedSameDayPairs([ab], [], [{ files: [ab.a, ab.b], fn: 'other()', ruling: 'x' }]).length, 1, 'a ruling for another function does not');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('a constraint orders two files through a chain of others', () => {
  const c = [{ before: 'a', after: 'b' }, { before: 'b', after: 'c' }];
  assert.equal(M.constraintOrders(c, 'a', 'c'), true, 'transitively');
  assert.equal(M.constraintOrders(c, 'c', 'a'), true, 'either way round');
  assert.equal(M.constraintOrders(c, 'a', 'd'), false);
  assert.equal(M.constraintOrders([], 'a', 'b'), false);
});

test('trigger functions are outside the audit, and there are some in the tree', () => {
  const triggers = [...real().fns.values()].filter((f) => f.schema === 'public' && f.definer && f.trigger);
  assert.ok(triggers.length >= 1, 'the exclusion must be exercised by the real tree');
  const reach = new Set(anonReachableNames(real()));
  for (const f of triggers) assert.ok(!reach.has(f.name), `${f.name} returns a trigger and must not be audited as an RPC`);
  const m = replayOne('create function public.tf() returns trigger language plpgsql security definer as $$ begin return new; end $$;');
  assert.deepEqual(anonReachableNames(m), []);
});

// ── 5. The allow-list ────────────────────────────────────────────────────────

test('the class vocabulary is the fixed four', () => {
  assert.deepEqual(Object.keys(CLASSES), ['self-gated-auth-uid', 'coach-gated', 'rate-limit-guard', 'public-by-design']);
  for (const [k, v] of Object.entries(CLASSES)) assert.ok(v.length > 80, `${k} needs its meaning and what is CHECKED written down`);
});

test('every anon-executable SECURITY DEFINER function is accounted for, and every claim holds', (t) => {
  const problems = checkAllowlist(real(), ALLOW);
  assert.deepEqual(problems, [], `\n${problems.join('\n')}`);
  const byClass = {};
  for (const e of Object.values(ALLOW.entries)) byClass[e.class] = (byClass[e.class] ?? 0) + 1;
  t.diagnostic(`${anonReachableNames(real()).length} anon-executable definers: ${Object.entries(byClass).map(([k, v]) => `${v} ${k}`).join(', ')}, ${ALLOW.registeredFindings.length} registered findings`);
});

test('the registered findings are named, not hidden', (t) => {
  for (const f of ALLOW.registeredFindings) {
    t.diagnostic(`REGISTERED FINDING ${f.name} (${f.anonGrant} anon grant, found by ${f.discoveredBy}): ${f.exposed.slice(0, 150)}`);
  }
  for (const p of ALLOW.registeredPinFindings) t.diagnostic(`REGISTERED PIN FINDING ${p.name}: ${p.why.slice(0, 150)}`);
  assert.ok(ALLOW.registeredFindings.length + ALLOW.registeredPinFindings.length > 0);
});

test('a registered finding is what its kind says it is, mechanically', () => {
  const byName = new Map(M.definerRpcFns(real()).map((f) => [f.name, f]));
  for (const f of ALLOW.registeredFindings) {
    const fn = byName.get(f.name);
    assert.ok(Object.hasOwn(FINDING_KINDS, f.kind), `${f.name}: kind ${f.kind}`);
    if (f.kind === 'anon-executable-no-gate') {
      assert.deepEqual(gatesOf(fn), { authUid: false, coach: false, rateLimit: false }, `${f.name}: registered as having no gate at all`);
    } else {
      // The gate is THERE, and the NULL-logic guard shows it is skipped for a signed-out caller.
      const g = gatesOf(fn);
      assert.ok(g.authUid || g.coach, `${f.name}: a gate-skipped finding has a gate to skip`);
      assert.ok(M.nullLogicFlags(fn).flags.length > 0, `${f.name}: the guard no longer flags it, so the finding is stale`);
    }
  }
  assert.deepEqual(ALLOW.registeredFindings.filter((f) => f.kind === 'gate-skipped-for-anon').map((f) => f.name), ['get_health_sources']);
  assert.equal(ALLOW.entries.get_health_sources, undefined, 'and it is not an ordinary entry any more');
});

// The checker, driven on a small model with deliberately broken allow-lists. Each case is a rule
// a broken checker would pass: without these, "the allow-list is fine" would be true of any file.
const BODY = (b) => `language plpgsql security definer set search_path = public, pg_temp as $$ begin ${b} end $$`;
const def = (name, body, args = '') => `create function public.${name}(${args}) returns int ${BODY(body)};`;
const BASE_SQL = [
  def('mine', 'return (select 1 where auth.uid() is not null);'),
  def('coachy', 'return (select 1 where public.is_coach_on_client(null::uuid));'),
  def('throttle', "perform public._rate_limit_bump('k', 1, 1); return 1;"),
  def('granted', 'return 1;'),
  'grant execute on function public.granted() to anon;',
  def('openf', 'return 1;'),
  'create function public.trg() returns trigger language plpgsql security definer set search_path = public, pg_temp as $$ begin return new; end $$;',
].join('\n');
const FINDING = { name: 'openf', kind: 'anon-executable-no-gate', discoveredBy: 'a test', anonGrant: 'default-only', exposed: 'Anything, with no gate at all, to anyone.', notFixedHere: 'Only a fixture in a test of the checker.', ownerCall: 'None: this is not real, it exercises the checker.' };
const baseAllow = () => ({
  entries: {
    mine: { class: 'self-gated-auth-uid', note: "Acts on the caller's own row only." },
    coachy: { class: 'coach-gated', note: 'Only a coach on the client gets a row.' },
    throttle: { class: 'rate-limit-guard', note: 'The throttle itself, on purpose.' },
    granted: { class: 'public-by-design', anonGrant: 'explicit', note: 'A public storefront read that the product shows to signed-out visitors on purpose.' },
  },
  registeredFindings: [{ ...FINDING }],
  registeredPinFindings: [],
});
const check = (mutate, sql = '') => {
  const allow = baseAllow();
  mutate?.(allow);
  return checkAllowlist(replayOne(`${BASE_SQL}\n${sql}`), allow);
};

test('checker: a correct allow-list has no problems', () => assert.deepEqual(check(), []));

test('checker: an anon-executable definer with no entry is reported, with the gates its body shows', () => {
  const p = check((a) => { delete a.entries.mine; });
  assert.equal(p.length, 1);
  assert.match(p[0], /^missing from the allow-list: mine is anon-executable and shows auth\.uid\(\)/);
  assert.match(check((a) => { a.registeredFindings = []; })[0], /missing from the allow-list: openf .* no gate at all/);
});

test('checker: a definer named like an Object.prototype member is not classified by inheritance', () => {
  // `name in entries` is true for everything on Object.prototype, so a function called constructor (or __proto__,
  // or, quoted, toString) read as already classified. Each is a valid function name, and the entries come from JSON.
  const create = (n) => `create function public.${n}() returns int language sql security definer set search_path = public, pg_temp as $$ select auth.uid() is null $$;`;
  const allowing = (bare) => JSON.parse(`{ "entries": { ${JSON.stringify(bare)}: { "class": "self-gated-auth-uid", "note": "Returns whether the caller is signed out." } }, "registeredFindings": [], "registeredPinFindings": [] }`);
  for (const [spelled, bare] of [['constructor', 'constructor'], ['__proto__', '__proto__'], ['"toString"', 'toString'], ['"valueOf"', 'valueOf'], ['"hasOwnProperty"', 'hasOwnProperty'], ['"isPrototypeOf"', 'isPrototypeOf']]) {
    const m = replayOne(create(spelled));
    const bare0 = checkAllowlist(m, JSON.parse('{ "entries": {}, "registeredFindings": [], "registeredPinFindings": [] }'));
    assert.equal(bare0.length, 1, `${bare}: ${bare0.join(' | ')}`);
    assert.match(bare0[0], new RegExp(`^missing from the allow-list: ${bare} is anon-executable and shows auth\\.uid\\(\\)`), `${bare} with no entry is missing, not inherited`);
    assert.deepEqual(checkAllowlist(m, allowing(bare)), [], `${bare} with its own entry is accepted: the own key still counts`);
  }
  // The pin and finding lists are arrays, and entries are walked by their own keys: nothing else is keyed by a name.
});

test('a schema called __proto__ or constructor cannot reach Object.prototype or read as a layer nobody made', () => {
  const polluted = () => ['public', 'anon', 'authenticated', 'service_role'].filter((r) => Object.prototype[r] !== undefined);
  try {
    const m = replayOne([
      'alter default privileges in schema "__proto__" grant execute on functions to anon;',
      'alter default privileges in schema constructor grant execute on functions to authenticated;',
      'create function "__proto__".f() returns int language sql security definer as $$ select 1 $$;',
      'create function constructor.g() returns int language sql security definer as $$ select 1 $$;',
      'create function plain.h() returns int language sql security definer as $$ select 1 $$;',
      'create function toString.k() returns int language sql security definer as $$ select 1 $$;',
    ].join('\n'));
    assert.deepEqual(polluted(), [], 'Object.prototype was written into');
    assert.deepEqual(messages(m), []);
    const acl = (key) => m.fns.get(key).acl;
    assert.deepEqual(acl('__proto__.f()'), { public: true, anon: true, authenticated: false, service_role: false }, 'the grant lands on the schema it names');
    assert.deepEqual(acl('constructor.g()'), { public: true, anon: false, authenticated: true, service_role: false });
    assert.deepEqual(acl('plain.h()'), { public: true, anon: false, authenticated: false, service_role: false }, 'a schema with no layer gets the global default only');
    assert.deepEqual(acl('tostring.k()'), { public: true, anon: false, authenticated: false, service_role: false }, 'toString folds to tostring, and no layer exists for it');
    assert.deepEqual(M.supabaseDefaultAcl(), { public: true, anon: true, authenticated: true, service_role: true }, 'public is untouched');
  } finally {
    for (const r of polluted()) delete Object.prototype[r]; // a failing run must not poison every later test in this process
  }
});

test('checker: an entry for a function that is not anon-executable is stale', () => {
  assert.match(check((a) => { a.entries.nowhere = { class: 'self-gated-auth-uid', note: 'A function that does not exist any more.' }; })[0], /^stale: nowhere /);
  assert.match(check((a) => { a.entries.trg = { class: 'self-gated-auth-uid', note: 'A trigger function is outside the audit.' }; })[0], /^stale: trg /);
  const revoked = check(null, 'revoke all on function public.mine() from public, anon;');
  assert.equal(revoked.length, 1);
  assert.match(revoked[0], /^stale: mine /);
});

test('checker: a name that is both an entry and a registered finding is reported', () => {
  const p = check((a) => { a.entries.openf = { class: 'self-gated-auth-uid', note: 'Also listed as a finding, which is wrong.' }; });
  assert.ok(p.some((x) => /openf is both an entry and a registered finding/.test(x)), p.join('\n'));
});

test('checker: a finding listed twice is reported', () => {
  assert.ok(check((a) => { a.registeredFindings.push({ ...FINDING }); }).some((x) => /listed twice/.test(x)));
});

test('checker: auth.uid() in a comment or a string is not a gate', () => {
  const ghost = `create function public.ghost() returns int language plpgsql security definer set search_path = public, pg_temp as $$ begin -- auth.uid() is checked below\n perform 'auth.uid()'; /* auth.uid() */ return 1; end $$;`;
  const p = check((a) => { a.entries.ghost = { class: 'self-gated-auth-uid', note: 'Claims a gate it only mentions in prose.' }; }, ghost);
  assert.equal(p.length, 1);
  assert.match(p[0], /^ghost: claimed self-gated-auth-uid but its latest body .* does not evaluate auth\.uid\(\) in code/);
});

test('checker: a coach-gated claim needs the helper called, and a rate-limit claim needs the bump', () => {
  assert.match(check((a) => { a.entries.mine.class = 'coach-gated'; })[0], /^mine: claimed coach-gated but .* calls neither/);
  assert.match(check((a) => { a.entries.mine.class = 'rate-limit-guard'; })[0], /^mine: claimed rate-limit-guard but .* does not call _rate_limit_bump/);
  const other = def('coachy2', 'return (select 1 where other.is_coach_on_client(null::uuid));');
  const p = check((a) => { a.entries.coachy2 = { class: 'coach-gated', note: 'Calls a look-alike in another schema.' }; }, other);
  assert.match(p[0], /^coachy2: claimed coach-gated/, 'a same-named function in another schema is not the helper');
});

test('checker: public-by-design needs a real note and a true anonGrant', () => {
  assert.match(check((a) => { a.entries.granted.anonGrant = 'default-only'; })[0], /^granted: claims anonGrant "default-only" but the migrations say "explicit" \(granted at t\.sql:\d+\)/);
  assert.match(check((a) => { delete a.entries.granted.anonGrant; })[0], /^granted: public-by-design needs anonGrant/);
  assert.match(check((a) => { a.entries.granted.note = 'Public.'; })[0], /^granted: needs a real note/);
  const p = check((a) => { a.entries.mine = { class: 'public-by-design', anonGrant: 'explicit', note: 'A long enough note that claims an explicit grant which does not exist for this function.' }; });
  assert.match(p[0], /^mine: claims anonGrant "explicit" but the migrations say "default-only" \(no `grant ... to anon` stands\)/);
});

test('checker: an unknown class or a missing note is reported', () => {
  assert.match(check((a) => { a.entries.mine.class = 'trust-me'; })[0], /^mine: class "trust-me" is not one of/);
  assert.match(check((a) => { a.entries.mine.note = ''; })[0], /^mine: needs a real note/);
});

test('checker: a registered finding whose body has grown a gate is out of date', () => {
  const p = check(null, def('openf', 'return (select 1 where auth.uid() is not null);').replace('create function', 'create or replace function'));
  assert.equal(p.length, 1);
  assert.match(p[0], /^openf: registered as ungated but its latest body .* now shows auth\.uid\(\) — move it to entries/);
});

test('checker: a registered finding must say what is exposed, why it stands, and whose call it is', () => {
  for (const field of ['exposed', 'notFixedHere', 'ownerCall']) {
    assert.match(check((a) => { a.registeredFindings[0][field] = ''; })[0], new RegExp(`openf: registered finding needs \`${field}\``));
  }
  assert.match(check((a) => { a.registeredFindings[0].discoveredBy = ''; })[0], /needs `discoveredBy`/);
  assert.match(check((a) => { a.registeredFindings[0].anonGrant = 'explicit'; })[0], /^openf: registered anonGrant "explicit" but the migrations say "default-only"/);
});

test('checker: an unpinned definer must be registered, and a pin finding must still be true', () => {
  const loose = 'create function public.loose() returns int language plpgsql security definer set search_path = public as $$ begin return auth.uid()::int; end $$;';
  const p = check((a) => { a.entries.loose = { class: 'self-gated-auth-uid', note: 'Gated, but its search_path lacks pg_temp.' }; }, loose);
  assert.equal(p.length, 1);
  assert.match(p[0], /^unregistered unpinned definer: loose /);
  const pin = { name: 'loose', declaredAt: 't.sql:1', why: 'Declared with search_path = public only.', notFixedHere: 'A fixture in a test.', ownerCall: 'alter function ... set search_path = public, pg_temp;' };
  assert.deepEqual(check((a) => { a.entries.loose = { class: 'self-gated-auth-uid', note: 'Gated, but its search_path lacks pg_temp.' }; a.registeredPinFindings = [pin]; }, loose), []);
  assert.match(check((a) => { a.registeredPinFindings = [{ ...pin, name: 'mine' }]; })[0], /^stale pin finding: mine /);
  assert.match(check((a) => { a.entries.loose = { class: 'self-gated-auth-uid', note: 'Gated, but its search_path lacks pg_temp.' }; a.registeredPinFindings = [{ ...pin, why: '' }]; }, loose)[0], /loose: pin finding needs `why`/);
});

test('checker: pg_temp listed first, or quoted as one element, is not a pin', () => {
  const first = 'create function public.first() returns int language plpgsql security definer set search_path = pg_temp, public as $$ begin return auth.uid()::int; end $$;';
  const quoted = "create function public.quoted() returns int language plpgsql security definer set search_path to 'public, pg_temp' as $$ begin return auth.uid()::int; end $$;";
  const ent = (a) => { for (const n of ['first', 'quoted']) a.entries[n] = { class: 'self-gated-auth-uid', note: 'Gated; only the pin is in question.' }; };
  const p = check(ent, `${first}\n${quoted}`);
  assert.ok(p.some((x) => x.startsWith('unregistered unpinned definer: first')), p.join('\n'));
  assert.ok(p.some((x) => x.startsWith('unregistered unpinned definer: quoted')), p.join('\n'));
});

test('checker: an overload is refused rather than conflated', () => {
  const p = check(null, def('mine', 'return 1;', 'p int'));
  assert.ok(p.some((x) => /^overload: mine has 2 signatures/.test(x)), p.join('\n'));
});

test('checker: a malformed allow-list is one clear problem', () => {
  assert.equal(checkAllowlist(real(), {}).length, 1);
  assert.equal(checkAllowlist(real(), null).length, 1);
  assert.equal(checkAllowlist(real(), { entries: {}, registeredFindings: {}, registeredPinFindings: [] }).length, 1);
});

test('body checks read code, not comments or strings, and see through spacing', () => {
  const body = (b) => ({ name: 'x', body: b });
  assert.equal(M.bodyUsesAuthUid(body('select auth . uid ( )')), true);
  assert.equal(M.bodyUsesAuthUid(body('select 1 -- auth.uid()')), false);
  assert.equal(M.bodyUsesAuthUid(body("select 'auth.uid()'")), false);
  assert.equal(M.bodyUsesAuthUid(body('select /* auth.uid() */ 1')), false);
  assert.equal(M.bodyUsesAuthUid(body('select auth.uid')), false, 'a reference without the call is not the call');
  assert.equal(M.bodyCalls(body('select public.is_coach_on_client(x)'), 'is_coach_on_client'), true);
  assert.equal(M.bodyCalls(body('select is_coach_on_client(x)'), 'is_coach_on_client'), true);
  assert.equal(M.bodyCalls(body('select other.is_coach_on_client(x)'), 'is_coach_on_client'), false);
  assert.equal(M.bodyCalls(body('select is_coach_on_client'), 'is_coach_on_client'), false);
  assert.equal(M.bodyCalls(body('select 1 -- is_coach_on_client(x)'), 'is_coach_on_client'), false);
  // A quoted lower-case name is the same function; a quoted name of another case is a different one.
  assert.equal(M.bodyCalls(body('select "is_coach_on_client"(x)'), 'is_coach_on_client'), true);
  assert.equal(M.bodyCalls(body('select public."is_coach_on_client"(x)'), 'is_coach_on_client'), true);
  assert.equal(M.bodyCalls(body('select "public"."is_coach_on_client"(x)'), 'is_coach_on_client'), true);
  assert.equal(M.bodyCalls(body('select "Is_Coach_On_Client"(x)'), 'is_coach_on_client'), false);
  assert.equal(M.bodyCalls(body('select "other".is_coach_on_client(x)'), 'is_coach_on_client'), false);
  assert.equal(M.bodyCalls(body('select "Public".is_coach_on_client(x)'), 'is_coach_on_client'), false);
});

// ── The NULL-logic guard ─────────────────────────────────────────────────────
// A gate that a NULL auth.uid() skips. Each case is one body and the kinds of flag the guard raises for
// it, so a guard that stopped seeing a shape (or started crying wolf at a NULL-safe one) fails here.

const plpg = (body, { args = 'p_id uuid', declare = '', name = 'g' } = {}) => `create function public.${name}(${args}) returns jsonb language plpgsql security definer set search_path = public, pg_temp as $$ ${declare ? `declare ${declare} ` : ''}begin ${body} end $$;`;
const sqlBody = (body, { args = 'p_id uuid', name = 'g' } = {}) => `create function public.${name}(${args}) returns int language sql security definer set search_path = public, pg_temp as $$ ${body} $$;`;
const flagsOf = (sql) => M.nullLogicFlags([...replayOne(sql).fns.values()][0]);
const RAISE = "raise exception 'x' using errcode = '42501';";
const NULL_LOGIC = [
  // ── flagged: nothing rejects a NULL uid in front of it ──
  ['x <> auth.uid() in an IF that returns (the get_health_sources shape)', plpg("if p_id <> auth.uid() and not public.is_coach_on_client(p_id) then return null; end if; return null;"), ['not-equal']],
  ['x != auth.uid()', plpg('if p_id != auth.uid() then return null; end if; return null;'), ['not-equal']],
  ['auth.uid() <> x, the other operand order', plpg('if auth.uid() <> p_id then return null; end if; return null;'), ['not-equal']],
  ['auth.uid() != x', plpg('if auth.uid() != p_id then return null; end if; return null;'), ['not-equal']],
  ['x <> (select auth.uid()), the form Supabase recommends for policies', plpg('if p_id <> (select auth.uid()) then return null; end if; return null;'), ['not-equal']],
  ['x <> (auth.uid())', plpg('if p_id <> (auth.uid()) then return null; end if; return null;'), ['not-equal']],
  ['a cast on both sides', plpg('if p_id::text <> auth.uid()::text then return null; end if; return null;'), ['not-equal']],
  ['a cast on the caller as the LEFT operand', plpg('if auth.uid()::text <> p_id::text then return null; end if; return null;'), ['not-equal']],
  ['x <> v_me, where v_me is declared as auth.uid() (an alias)', plpg('if p_id <> v_me then return null; end if; return null;', { declare: 'v_me uuid := auth.uid();' }), ['not-equal']],
  ['an alias assigned in the body', plpg('v_me := auth.uid(); if p_id <> v_me then return null; end if; return null;', { declare: 'v_me uuid;' }), ['not-equal']],
  ['x <> "v_me", where "v_me" is declared quoted as auth.uid() (a quoted lower-case name is the same variable)', plpg('if p_id <> "v_me" then return null; end if; return null;', { declare: '"v_me" uuid := auth.uid();' }), ['not-equal']],
  ['"v_me" <> x, the quoted alias as the LEFT operand', plpg('if "v_me" <> p_id then return null; end if; return null;', { declare: '"v_me" uuid := auth.uid();' }), ['not-equal']],
  ['an alias declared quoted and compared bare is the same variable', plpg('if p_id <> v_me then return null; end if; return null;', { declare: '"v_me" uuid := auth.uid();' }), ['not-equal']],
  ['an alias declared bare and compared quoted is the same variable', plpg('if p_id <> "v_me" then return null; end if; return null;', { declare: 'v_me uuid := auth.uid();' }), ['not-equal']],
  ['a mixed-case quoted alias, compared with the same quoted name', plpg('if p_id <> "V_Me" then return null; end if; return null;', { declare: '"V_Me" uuid := auth.uid();' }), ['not-equal']],
  ['a quoted alias assigned in the body', plpg('"v_me" := auth.uid(); if p_id <> "v_me" then return null; end if; return null;', { declare: '"v_me" uuid;' }), ['not-equal']],
  ['a quoted alias under NOT', plpg(`if not ("v_me" = p_id) then ${RAISE} end if; return null;`, { declare: '"v_me" uuid := auth.uid();' }), ['negated-equality']],
  ['a NULL test on a variable BEFORE it is assigned from auth.uid() is no reject: it held another value then', plpg('if v_me is null then return null; end if; v_me := auth.uid(); if p_id <> v_me then return null; end if; return null;', { declare: 'v_me uuid := p_id;' }), ['not-equal']],
  ['a NULL test on the alias AFTER its assignment is a reject', plpg(`v_me := auth.uid(); if v_me is null then ${RAISE} end if; if p_id <> v_me then return null; end if; return null;`, { declare: 'v_me uuid;' }), []],
  ['a comparison with a variable BEFORE it is assigned from auth.uid() reads another value, so it is no caller comparison', plpg('if p_id <> v_me then return null; end if; v_me := auth.uid(); return null;', { declare: 'v_me uuid := p_id;' }), []],
  ['an alias in a coalesce AFTER its assignment is the caller', plpg('v_me := auth.uid(); return (select coalesce(p_id, v_me) is not null)::int::text::jsonb;', { declare: 'v_me uuid;' }), ['subject-coalesce']],
  ['an alias in a coalesce BEFORE its assignment is not the caller yet', plpg('perform coalesce(p_id, v_me); v_me := auth.uid(); return null;', { declare: 'v_me uuid := p_id;' }), []],
  ['a mixed-case quoted alias compared bare is a DIFFERENT name (Postgres folds V_Me to v_me), so it is not the caller', plpg('if p_id <> V_Me then return null; end if; return null;', { declare: '"V_Me" uuid := auth.uid();' }), []],
  ['a quoted variable that is not assigned from auth.uid() is no alias', plpg('if p_id <> "v_other" then return null; end if; return null;', { declare: '"v_other" uuid := p_id; "v_me" uuid := auth.uid();' }), []],
  ['not (auth.uid() = x or helper): NOT NULL is NULL (the set_program_detail shape)', plpg(`if not (auth.uid() = p_id or public.is_coach_on_client(p_id)) then ${RAISE} end if; return null;`), ['negated-equality']],
  ['not x = auth.uid(), unparenthesised', plpg(`if not p_id = auth.uid() then ${RAISE} end if; return null;`), ['negated-equality']],
  ['not ((x = auth.uid()) or helper), one group deeper', plpg(`if not ((p_id = auth.uid()) or public.is_coach_on_client(p_id)) then ${RAISE} end if; return null;`), ['negated-equality']],
  ['coalesce(param, auth.uid()) as the subject, with no reject anywhere', plpg('return null;', { declare: 'v uuid := coalesce(p_id, auth.uid());' }), ['subject-coalesce']],
  ['coalesce(auth.uid(), param): anon becomes whoever the parameter names', plpg('return null;', { declare: 'v uuid := coalesce(auth.uid(), p_id);' }), ['subject-coalesce']],
  ['a cast on the parameter inside the coalesce', plpg('return null;', { declare: 'v uuid := coalesce(p_id::uuid, auth.uid());' }), ['subject-coalesce']],
  ['coalesce("p_id", auth.uid()): a quoted parameter is the same parameter', plpg('return null;', { declare: 'v uuid := coalesce("p_id", auth.uid());' }), ['subject-coalesce']],
  ['coalesce(auth.uid(), "p_id"), the other order', plpg('return null;', { declare: 'v uuid := coalesce(auth.uid(), "p_id");' }), ['subject-coalesce']],
  ['a parameter declared quoted, used bare', plpg('return null;', { args: '"p_id" uuid', declare: 'v uuid := coalesce(p_id, auth.uid());' }), ['subject-coalesce']],
  ['a mixed-case quoted parameter, used with the same quoted name', plpg('return null;', { args: '"P_Id" uuid', declare: 'v uuid := coalesce("P_Id", auth.uid());' }), ['subject-coalesce']],
  ['a quoted parameter in a coalesce in executable code', plpg('return (select 1 where coalesce("p_id", auth.uid()) is not null)::int::text::jsonb;'), ['subject-coalesce']],
  ['a positional parameter in the coalesce', plpg('return null;', { args: 'uuid', declare: 'v uuid := coalesce($1, auth.uid());' }), ['subject-coalesce']],
  ['a coalesce and a comparison together (get_health_sources itself)', plpg('if v <> auth.uid() and not public.is_coach_on_client(v) then return null; end if; return null;', { declare: 'v uuid := coalesce(p_id, auth.uid());' }), ['not-equal', 'subject-coalesce']],
  ['a comparison in a language sql body, where no reject can be written', sqlBody('select 1 where p_id <> auth.uid()'), ['not-equal']],
  // ── casts: every spelling of a cast leaves a NULL as a NULL, so none of them hides the comparison ──
  // (syntax only: these bodies are read, never run)
  ['a cast to a schema-qualified type on the left', plpg('if auth.uid()::pg_catalog.uuid <> p_id then return null; end if; return null;'), ['not-equal']],
  ['a cast to an array type', plpg('if auth.uid()::uuid[] <> p_ids then return null; end if; return null;', { args: 'p_ids uuid[]' }), ['not-equal']],
  ['a cast to the array keyword form', plpg('if auth.uid()::uuid array <> p_ids then return null; end if; return null;', { args: 'p_ids uuid[]' }), ['not-equal']],
  ['a cast to a multi-word type', plpg('if auth.uid()::character varying <> p_id::text then return null; end if; return null;'), ['not-equal']],
  ['a cast to a type with a modifier', plpg('if auth.uid()::varchar(36) <> p_id::text then return null; end if; return null;'), ['not-equal']],
  ['a chain of casts', plpg('if auth.uid()::text::uuid <> p_id then return null; end if; return null;'), ['not-equal']],
  ['cast(auth.uid() as type) on the left', plpg('if cast(auth.uid() as uuid) <> p_id then return null; end if; return null;'), ['not-equal']],
  ['cast(auth.uid() as a qualified type) on the left', plpg('if cast(auth.uid() as pg_catalog.text) <> p_id::text then return null; end if; return null;'), ['not-equal']],
  ['a long cast() as the left operand', plpg('if cast(auth.uid() as character varying(36)) <> p_id::text then return null; end if; return null;'), ['not-equal']],
  ['cast(auth.uid() as type) on the right', plpg('if p_id <> cast(auth.uid() as uuid) then return null; end if; return null;'), ['not-equal']],
  ['a parenthesised cast', plpg('if (auth.uid()::text) <> p_id::text then return null; end if; return null;'), ['not-equal']],
  ['parentheses inside parentheses', plpg('if ((auth.uid())) <> p_id then return null; end if; return null;'), ['not-equal']],
  ['a cast followed by more condition is not swallowed', plpg('if auth.uid()::text <> p_id::text and p_id is not null then return null; end if; return null;'), ['not-equal']],
  ['an alias assigned through a cast', plpg('if p_id <> v_me then return null; end if; return null;', { declare: 'v_me uuid := auth.uid()::uuid;' }), ['not-equal']],
  ['an alias assigned from (select auth.uid())', plpg('if p_id <> v_me then return null; end if; return null;', { declare: 'v_me uuid := (select auth.uid());' }), ['not-equal']],
  ['negated equality through a qualified cast', plpg(`if not (auth.uid()::pg_catalog.uuid = p_id or public.is_coach_on_client(p_id)) then ${RAISE} end if; return null;`), ['negated-equality']],
  ['a coalesce with a qualified cast on the caller', plpg('return null;', { declare: 'v uuid := coalesce(p_id, auth.uid()::pg_catalog.uuid);' }), ['subject-coalesce']],
  ['"auth"."uid"() with both names quoted', plpg('if "auth"."uid"() <> p_id then return null; end if; return null;'), ['not-equal']],
  ['auth."uid"() with one name quoted', plpg('if auth."uid"() <> p_id then return null; end if; return null;'), ['not-equal']],
  ['"auth".uid() with the schema quoted', plpg('if p_id <> "auth".uid() then return null; end if; return null;'), ['not-equal']],
  ['a schema written with a U& escape', plpg('if U&"\\0061uth".uid() <> p_id then return null; end if; return null;'), ['not-equal']],
  ['sixty parentheses around the caller put it more than a hundred tokens from the operator', plpg(`if ${'('.repeat(60)}auth.uid()${')'.repeat(60)} <> p_id then return null; end if; return null;`), ['not-equal']],
  ['a cast chain of forty casts is one operand', plpg(`if auth.uid()${'::text'.repeat(40)} <> p_id::text then return null; end if; return null;`), ['not-equal']],
  ['a coalesce in executable code BEFORE a later reject: the reject cannot protect what already ran', plpg(`v := coalesce(p_id, auth.uid()); if auth.uid() is null then ${RAISE} end if; return null;`, { declare: 'v uuid;' }), ['subject-coalesce']],
  ['a coalesce in executable code with no reject at all', plpg('v := coalesce(p_id, auth.uid()); return null;', { declare: 'v uuid;' }), ['subject-coalesce']],
  ['a coalesce in executable code AFTER an earlier reject is cleared', plpg(`if auth.uid() is null then ${RAISE} end if; v := coalesce(p_id, auth.uid()); return null;`, { declare: 'v uuid;' }), []],
  ['a NULL test through a cast is a reject', plpg(`if auth.uid()::text is null then ${RAISE} end if; if p_id::text <> auth.uid()::text then return null; end if; return null;`), []],
  ['is distinct from through a qualified cast is NULL-safe', plpg(`if p_id is distinct from auth.uid()::pg_catalog.uuid then ${RAISE} end if; return null;`), []],
  ['a group that does more than hold the caller is not the caller', plpg("if (auth.uid()::text || 'x') <> p_id::text then return null; end if; return null;"), []],
  // ── cleared: an explicit reject comes first ──
  ['a reject that raises, then the comparison', plpg(`if auth.uid() is null then ${RAISE} end if; if p_id <> auth.uid() then return null; end if; return null;`), []],
  ['a reject that returns', plpg('if auth.uid() is null then return null; end if; if p_id <> auth.uid() then return null; end if; return null;'), []],
  ['a reject with the NULL test as one disjunct (accept_commitment)', plpg('if auth.uid() is null or p_id is null then return null; end if; if p_id <> auth.uid() then return null; end if; return null;'), []],
  ['a reject whose test is parenthesised', plpg('if (auth.uid() is null) then return null; end if; if p_id <> auth.uid() then return null; end if; return null;'), []],
  ['a reject through an alias (log_ai_action)', plpg(`if v_me is null then ${RAISE} end if; if p_id <> v_me then return null; end if; return null;`, { declare: 'v_me uuid := auth.uid();' }), []],
  ['a reject in the body, after a coalesce in the declare section (set_metric_source)', plpg(`if auth.uid() is null then ${RAISE} end if; if v <> auth.uid() and not public.is_coach_on_client(v) then ${RAISE} end if; return null;`, { declare: 'v uuid := coalesce(p_id, auth.uid());' }), []],
  ['a reject in front of the NOT form (set_program_detail)', plpg(`if auth.uid() is null then ${RAISE} end if; if not (auth.uid() = p_id or public.is_coach_on_client(p_id)) then ${RAISE} end if; return null;`), []],
  // ── NULL-safe: never flagged ──
  ['is distinct from is NULL-safe', plpg(`if p_id is distinct from auth.uid() and not public.is_coach_on_client(p_id) then ${RAISE} end if; return null;`), []],
  ['coalesce(auth.uid(), a zero uuid) is NULL-safe', sqlBody("select 1 where p_id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)"), []],
  ['a positive filter drops the row for NULL', sqlBody('select 1 where p_id = auth.uid()'), []],
  ['not exists over auth.uid(): EXISTS is never NULL', plpg(`if not exists (select 1 from public.t where user_id = auth.uid()) then ${RAISE} end if; return null;`), []],
  ['a subquery inside a NOT group is skipped', plpg(`if not (p_id is null or exists (select 1 from public.t where user_id = auth.uid())) then ${RAISE} end if; return null;`), []],
  ['not found is a plpgsql variable', plpg('if not found then return null; end if; return null;'), []],
  ['a != under NOT is the not-equal site alone, not also a negated equality', plpg(`if not (p_id != auth.uid()) then ${RAISE} end if; return null;`), ['not-equal']],
  ['ordering comparisons under NOT are outside the class (a documented limit: only = and <> are read)', plpg(`if not (p_id::text >= auth.uid()::text or p_id::text <= auth.uid()::text) then ${RAISE} end if; return null;`), []],
  ['a scalar subquery inside a NOT group is skipped', plpg(`if not (p_id is null or (select count(*) from public.t where user_id = auth.uid()) = 0) then ${RAISE} end if; return null;`), []],
  ['a function call around the comparison is NULL-safe and skipped', plpg(`if not coalesce(p_id = auth.uid(), false) then ${RAISE} end if; return null;`), []],
  ['<= and >= are not <>', plpg('if p_id::text <= auth.uid()::text or p_id::text >= auth.uid()::text then return null; end if; return null;'), []],
  ['a mention in a comment or a string is not code', plpg("-- if p_id <> auth.uid() then\n raise notice 'p_id <> auth.uid() and not (x = auth.uid())'; return null;"), []],
  ['a coalesce of two parameters names no caller', plpg('return null;', { args: 'p_id uuid, p_other uuid', declare: 'v uuid := coalesce(p_id, p_other);' }), []],
  ['a mixed-case quoted parameter used bare is a different name, so it is no parameter', plpg('return null;', { args: '"P_Id" uuid', declare: 'v uuid := coalesce(P_Id, auth.uid());' }), []],
  ['a quoted name that is not a parameter is no subject', plpg('return null;', { args: 'p_other uuid', declare: 'v uuid := coalesce("p_id", auth.uid());' }), []],
  ['a coalesce of the caller with a literal is no parameter', plpg('return null;', { declare: "v uuid := coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid);" }), []],
  // ── a reject that does not count ──
  ['return query does not leave: the NULL branch appends a row and the comparison after it still runs', plpg('if auth.uid() is null then return query select 1; end if; if p_id <> auth.uid() then return; end if; return query select 2;'), ['not-equal']],
  ['return next does not leave either', plpg('if auth.uid() is null then return next r; end if; if p_id <> auth.uid() then return; end if; return;', { declare: 'r int;' }), ['not-equal']],
  ['RETURN QUERY in capitals is read the same way', plpg('if auth.uid() is null then RETURN QUERY select 1; end if; if p_id <> auth.uid() then return; end if; return;'), ['not-equal']],
  ['a bare return in a set-returning body is a reject', plpg('if auth.uid() is null then return; end if; if p_id <> auth.uid() then return; end if; return query select 2;'), []],
  ['return query first and a bare return after it reads as not leaving (a documented over-flag: only the first statement is read)', plpg('if auth.uid() is null then return query select 1; return; end if; if p_id <> auth.uid() then return; end if; return;'), ['not-equal']],
  ['a reject AFTER the comparison', plpg(`if p_id <> auth.uid() then return null; end if; if auth.uid() is null then ${RAISE} end if; return null;`), ['not-equal']],
  ['raise notice does not leave', plpg("if auth.uid() is null then raise notice 'x'; end if; if p_id <> auth.uid() then return null; end if; return null;"), ['not-equal']],
  ['an and-ed NULL test is conditional, so not a reject', plpg(`if p_id is not null and auth.uid() is null then ${RAISE} end if; if p_id <> auth.uid() then return null; end if; return null;`), ['not-equal']],
  ['an and-ed NULL test written FIRST is just as conditional', plpg(`if auth.uid() is null and p_id is not null then ${RAISE} end if; if p_id <> auth.uid() then return null; end if; return null;`), ['not-equal']],
  ['an elsif reject is conditional', plpg(`if p_id is null then null; elsif auth.uid() is null then ${RAISE} end if; if p_id <> auth.uid() then return null; end if; return null;`), ['not-equal']],
  ['is not null is not a reject', plpg('if auth.uid() is not null then null; end if; if p_id <> auth.uid() then return null; end if; return null;'), ['not-equal']],
  ['a branch that does not leave is not a reject', plpg('if auth.uid() is null then perform 1; end if; if p_id <> auth.uid() then return null; end if; return null;'), ['not-equal']],
  ['a NULL test on some other operand is not a reject', plpg(`if p_id is null then ${RAISE} end if; if p_id <> auth.uid() then return null; end if; return null;`), ['not-equal']],
  ['a coalesce subject needs a reject even when nothing is compared afterwards', plpg("if p_id is null then return null; end if; return null;", { declare: 'v uuid := coalesce(p_id, auth.uid());' }), ['subject-coalesce']],
];
for (const [name, sql, kinds] of NULL_LOGIC) {
  test(`NULL-logic guard: ${name}`, () => {
    const r = flagsOf(sql);
    assert.deepEqual(r.flags.map((f) => f.kind).sort(), kinds);
    for (const f of r.flags) {
      assert.ok(f.text.length > 0 && f.reason.includes(`\`${f.text}\``), `the reason quotes the site: ${f.reason}`);
      if (f.kind !== 'subject-coalesce') assert.match(f.reason, /is NULL for anon, so the guard is skipped/);
    }
  });
}

test('NULL-logic guard: the reason quotes the comparison it found, whichever way round it is written', () => {
  const text = (sql) => flagsOf(sql).flags.map((f) => f.text);
  assert.deepEqual(text(plpg('if p_id <> auth.uid() then return null; end if; return null;')), ['p_id <> auth.uid()']);
  assert.deepEqual(text(plpg('if auth.uid() != p_id then return null; end if; return null;')), ['auth.uid() != p_id']);
  assert.deepEqual(text(plpg('if p_id <> (select auth.uid()) then return null; end if; return null;')), ['p_id <> (select auth.uid())']);
  assert.deepEqual(text(plpg('if o.user_id <> auth.uid() then return null; end if; return null;')), ['o.user_id <> auth.uid()']);
  assert.deepEqual(text(plpg(`if not (auth.uid() = p_id or public.is_coach_on_client(p_id)) then ${RAISE} end if; return null;`)), ['not (auth.uid() = p_id or public.is_coach_on_client(p_id))']);
  assert.deepEqual(text(plpg('return null;', { declare: 'v uuid := coalesce(p_id, auth.uid());' })), ['coalesce(p_id, auth.uid())']);
});

test('NULL-logic guard: it needs the declared parameter names, and a body with none reads no subject', () => {
  // The same coalesce, but `p_id` is not a parameter of this function (it is a local): no caller-supplied subject.
  assert.deepEqual(flagsOf(plpg('return null;', { args: 'p_other uuid', declare: 'p_id uuid; v uuid := coalesce(p_id, auth.uid());' })).flags, []);
});

test('NULL-logic guard, over the 85 anon-reachable bodies: it touches exactly these seven and flags exactly two', (t) => {
  const reach = M.definerRpcFns(real()).filter(M.anonExecutable);
  assert.ok(reach.length >= 85, `only ${reach.length} anon-reachable bodies were read (85 when this was written)`);
  const touched = reach.map((f) => [f.name, M.nullLogicFlags(f)]).filter(([, r]) => r.sites.length);
  assert.deepEqual(touched.map(([n]) => n).sort(), ['get_health_sources', 'list_member_dm_threads', 'log_ai_action', 'mark_ai_action_undone', 'set_metric_source', 'set_my_username', 'set_program_detail'], 'a new body the guard touches must be read, not waved through');
  assert.deepEqual(touched.filter(([, r]) => r.flags.length).map(([n]) => n).sort(), ['get_health_sources', 'list_member_dm_threads']);
  for (const [name, r] of touched.filter(([, r]) => !r.flags.length)) {
    const firstCompare = Math.min(...r.sites.filter((s) => s.kind !== 'subject-coalesce').map((s) => s.at));
    assert.ok(r.rejects.length > 0 && Math.min(...r.rejects) < firstCompare, `${name}: cleared, so an explicit reject must come before its first comparison`);
  }
  t.diagnostic(`touched ${touched.length} of ${reach.length}: ${touched.map(([n, r]) => `${n}${r.flags.length ? ' FLAGGED' : ' (cleared by a reject)'}`).join(', ')}`);
});

test('NULL-logic guard: the real bodies that shipped the hole before 2026-06-30 are flagged, and the fix clears them', () => {
  // 2026-06-30-rpc-authz-hardening.sql: "`x <> auth.uid()` is NULL when auth.uid() is NULL, so `if (NULL and ...) then raise`
  // never fired for anon". The guard is checked against the bodies as they shipped, not against a paraphrase.
  const before = M.replayDir(DIR, { before: '2026-06-30' });
  const get = (m, name) => M.definerRpcFns(m).find((f) => f.name === name);
  for (const [name, kinds] of [['set_metric_source', ['not-equal', 'subject-coalesce']], ['set_program_detail', ['negated-equality']]]) {
    assert.deepEqual(M.nullLogicFlags(get(before, name)).flags.map((f) => f.kind).sort(), kinds, `${name} as shipped`);
    assert.deepEqual(M.nullLogicFlags(get(real(), name)).flags, [], `${name} after the 2026-06-30 reject`);
  }
});

test('get_health_sources: the guard WOULD flag it as an ordinary entry, so it is excluded only because it is a registered finding', () => {
  const allow = structuredClone(ALLOW);
  const i = allow.registeredFindings.findIndex((f) => f.name === 'get_health_sources');
  assert.notEqual(i, -1);
  const [finding] = allow.registeredFindings.splice(i, 1);
  assert.equal(finding.kind, 'gate-skipped-for-anon');
  const gone = checkAllowlist(real(), allow);
  assert.equal(gone.length, 1);
  assert.match(gone[0], /^missing from the allow-list: get_health_sources is anon-executable and shows auth\.uid\(\) \+ a coach helper \(but its gate is skipped for anon: /, 'removing it from the findings alone is "missing", not a pass');
  for (const cls of ['coach-gated', 'self-gated-auth-uid']) {
    allow.entries.get_health_sources = { class: cls, note: "The caller's own observations, or a client's when is_coach_on_client(subject) holds; otherwise null." };
    const p = checkAllowlist(real(), allow);
    assert.equal(p.length, 1, `${cls}: ${p.join('\n')}`);
    assert.match(p[0], /^get_health_sources: `coalesce\(p_user_id, auth\.uid\(\)\)` takes the subject from a caller-supplied parameter and falls back to auth\.uid\(\), which is NULL for anon/);
    assert.match(p[0], /; `v_uid <> auth\.uid\(\)` is NULL for anon, so the guard is skipped: no `if auth\.uid\(\) is null then raise` reject comes before it — /);
  }
  // As a finding it is accepted: the very same body.
  assert.deepEqual(checkAllowlist(real(), ALLOW), []);
});

// The checker's handling of a flagged body, driven on a small model.
const SKIPPED_BODY = 'if p_id <> auth.uid() then return null; end if; return 1;';
const SKIPPED_SQL = def('skipped', SKIPPED_BODY, 'p_id uuid');
const skippedFp = () => M.bodyFingerprint([...replayOne(`${BASE_SQL}\n${SKIPPED_SQL}`).fns.values()].find((f) => f.name === 'skipped'));
const SKIPPED_ENTRY = { class: 'self-gated-auth-uid', note: 'Claims a self gate that a NULL uid skips, for the checker test.' };
const ACK = () => ({ fingerprint: skippedFp(), why: 'A test acknowledgement: an anonymous caller cannot reach this comparison because of the reasons written here at length.' });
const withSkipped = (mutate) => check((a) => { a.entries.skipped = { ...SKIPPED_ENTRY }; mutate?.(a); }, SKIPPED_SQL);

test('checker: a flagged body is a problem naming the function, quoting the comparison, and handing over the fingerprint', () => {
  const p = withSkipped();
  assert.equal(p.length, 1, p.join('\n'));
  assert.match(p[0], /^skipped: `p_id <> auth\.uid\(\)` is NULL for anon, so the guard is skipped: no `if auth\.uid\(\) is null then raise` reject comes before it — /);
  assert.ok(p[0].includes(`nullLogic: { fingerprint: "${skippedFp()}", why: "..." }`), p[0]);
});

test('checker: a flagged language sql body is told it cannot hold a reject, and how to acknowledge a join filter', () => {
  const sqlSkipped = sqlBody('select 1 where p_id <> auth.uid()', { name: 'sqlskipped' });
  const p = check((a) => { a.entries.sqlskipped = { ...SKIPPED_ENTRY }; }, sqlSkipped);
  assert.equal(p.length, 1, p.join('\n'));
  assert.match(p[0], /^sqlskipped: `p_id <> auth\.uid\(\)` is NULL for anon, so the guard is skipped: no `if auth\.uid\(\) is null then raise` reject comes before it — a language sql body cannot hold a reject: rewrite it in plpgsql/);
  assert.match(p[0], /if the comparison only filters rows that a NULL uid drops, acknowledge it with `nullLogic: \{ fingerprint: "[0-9a-f]{16}"/);
  assert.doesNotMatch(withSkipped()[0], /language sql body/, 'a plpgsql body gets the plpgsql advice');
});

test('checker: a flagged body missing from the allow-list says its gate is skipped, not just that it has one', () => {
  const p = check(null, SKIPPED_SQL);
  assert.equal(p.length, 1);
  assert.match(p[0], /^missing from the allow-list: skipped is anon-executable and shows auth\.uid\(\) \(but its gate is skipped for anon: `p_id <> auth\.uid\(\)` is NULL for anon, so the guard is skipped/);
});

test('checker: a written, fingerprinted acknowledgement accepts a flagged body, and only while it still describes it', () => {
  assert.deepEqual(withSkipped((a) => { a.entries.skipped.nullLogic = ACK(); }), []);
  assert.match(withSkipped((a) => { a.entries.skipped.nullLogic = { ...ACK(), fingerprint: '0000000000000000' }; })[0], /^skipped: the body changed since its `nullLogic` acknowledgement was written \(body t\.sql:\d+ is fingerprint [0-9a-f]{16}, acknowledged 0000000000000000\) — re-read it, then update the fingerprint/);
  assert.match(withSkipped((a) => { a.entries.skipped.nullLogic = { ...ACK(), why: 'too short' }; })[0], /^skipped: `nullLogic\.why` needs a real reason \(at least 60 characters\)/);
  assert.match(withSkipped((a) => { a.entries.skipped.nullLogic = { ...ACK(), why: 'x'.repeat(59) }; })[0], /needs a real reason/, '59 is short');
  assert.deepEqual(withSkipped((a) => { a.entries.skipped.nullLogic = { ...ACK(), why: 'x'.repeat(60) }; }), [], '60 is enough');
  assert.match(withSkipped((a) => { a.entries.skipped.nullLogic = 'trust me'; })[0], /^skipped: `nullLogic` must be \{ fingerprint, why \}/);
  // an acknowledgement for a body the guard does not flag is stale
  assert.match(check((a) => { a.entries.mine.nullLogic = ACK(); })[0], /^mine: stale `nullLogic` acknowledgement: the NULL-logic guard flags nothing in its latest body any more — delete it/);
});

test('checker: editing the function re-opens an acknowledgement, and a comment or a reflow does not', () => {
  const fp = skippedFp();
  const ack = { fingerprint: fp, why: ACK().why };
  const run = (sql) => checkAllowlist(replayOne(`${BASE_SQL}\n${sql}`), (() => { const a = baseAllow(); a.entries.skipped = { ...SKIPPED_ENTRY, nullLogic: ack }; return a; })());
  const orReplace = (b) => def('skipped', b, 'p_id uuid').replace('create function', 'create or replace function');
  assert.deepEqual(run(`${SKIPPED_SQL}\n${orReplace(`-- re-read, still fine\n   ${SKIPPED_BODY.replace('then return null', 'then\n return null')}`)}`), [], 'a comment and whitespace are not code');
  assert.match(run(`${SKIPPED_SQL}\n${orReplace(SKIPPED_BODY.replace('return 1', 'return 2'))}`)[0], /^skipped: the body changed since its `nullLogic` acknowledgement was written/, 'a changed literal is code');
});

test('checker: a registered finding of kind gate-skipped-for-anon must still be flagged, and each kind is verified for what it claims', () => {
  const skipped = { ...FINDING, name: 'skipped', kind: 'gate-skipped-for-anon' };
  assert.deepEqual(check((a) => { a.registeredFindings.push(skipped); }, SKIPPED_SQL), [], 'a flagged body may be registered as a gate-skipped finding');
  assert.match(check((a) => { delete a.entries.mine; a.registeredFindings.push({ ...skipped, name: 'mine' }); })[0], /^mine: registered as gate-skipped-for-anon but the NULL-logic guard no longer flags its latest body \(t\.sql:\d+\) — it is fixed, so move it to entries/);
  // the other kind is a claim of NO gate at all
  assert.match(check((a) => { a.registeredFindings.push({ ...skipped, kind: 'anon-executable-no-gate' }); }, SKIPPED_SQL)[0], /^skipped: registered as ungated but its latest body \(t\.sql:\d+\) now shows auth\.uid\(\) — move it to entries/);
  assert.match(check((a) => { a.registeredFindings.push({ ...skipped, kind: 'made-up' }); }, SKIPPED_SQL)[0], /^skipped: finding kind "made-up" is not one of anon-executable-no-gate, gate-skipped-for-anon/);
  assert.match(check((a) => { delete a.registeredFindings[0].kind; })[0], /^openf: finding kind "undefined" is not one of/);
  assert.deepEqual(Object.keys(FINDING_KINDS), ['anon-executable-no-gate', 'gate-skipped-for-anon']);
  for (const v of Object.values(FINDING_KINDS)) assert.ok(v.length > 60);
});

test('checker: note lengths are a floor and not a suggestion (the limits are part of the contract, so they are spelled as numbers here)', () => {
  const n = (k) => 'x'.repeat(k);
  assert.match(check((a) => { a.entries.mine.note = n(19); })[0], /^mine: needs a real note \(at least 20 characters\)/);
  assert.deepEqual(check((a) => { a.entries.mine.note = n(20); }), []);
  assert.match(check((a) => { a.entries.mine.note = ' '.repeat(40); })[0], /^mine: needs a real note/, 'blanks are not a note');
  assert.match(check((a) => { a.entries.granted.note = n(59); })[0], /^granted: needs a real note \(at least 60 characters\)/);
  assert.deepEqual(check((a) => { a.entries.granted.note = n(60); }), []);
  for (const field of ['exposed', 'notFixedHere', 'ownerCall']) {
    assert.match(check((a) => { a.registeredFindings[0][field] = n(19); })[0], new RegExp(`^openf: registered finding needs \`${field}\``), field);
    assert.deepEqual(check((a) => { a.registeredFindings[0][field] = n(20); }), [], field);
  }
  const loose = 'create function public.loose() returns int language plpgsql security definer set search_path = public as $$ begin return auth.uid()::int; end $$;';
  const pin = { name: 'loose', declaredAt: 't.sql:1', why: n(20), notFixedHere: n(20), ownerCall: n(20) };
  const withPin = (p) => check((a) => { a.entries.loose = { class: 'self-gated-auth-uid', note: 'Gated, but its search_path lacks pg_temp.' }; a.registeredPinFindings = [p]; }, loose);
  assert.deepEqual(withPin(pin), []);
  for (const field of ['why', 'notFixedHere', 'ownerCall']) assert.match(withPin({ ...pin, [field]: n(19) })[0], new RegExp(`^loose: pin finding needs \`${field}\``), field);
});
