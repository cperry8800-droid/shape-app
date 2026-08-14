// A SECURITY DEFINER function declared in a migration must pin pg_temp in its search_path.
//
// WHY A STATIC TEST AND NOT JUST THE MIGRATION
// 2026-08-09-definer-pg-temp-sweep.sql pins pg_temp on every definer that exists. It cannot
// keep them pinned. `create or replace function ... set search_path to 'public'` REVERTS one
// function to unpinned the moment that file is replayed, silently -- no error, and the damage
// shows up only when someone plants an object in pg_temp. The sweep's own guard runs at APPLY
// time, long after the code that broke it was written; this runs on every PR.
// Same shape as tests/schedule-lock.test.mjs, for the same reason.
//
// WHY THE SCOPE STARTS AT THE SWEEP AND NOT AT THE FIRST MIGRATION
// Measured 2026-08-14: 195 SECURITY DEFINER declarations across supabase-migrations/, of which
// 171 (in 91 files) do not pin. Those are historical -- the sweep is what closes them in the
// live database, and rewriting 91 historical files would be a diff nobody can review (and would
// sail past the >50-file reviewer skip). So the guard is FORWARD-LOOKING: every migration
// authored after the sweep must pin its own definers, which is the only rule that can actually
// hold. Filenames are date-prefixed and therefore sort chronologically, so the cutoff maintains
// itself -- there is no list to go stale, and no count to drift.
//
// ⚠ THE STANDING CONSEQUENCE, which this test cannot enforce: re-running any PRE-sweep
// migration un-pins the functions it declares. Re-run the sweep afterwards. It is idempotent.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, basename } from 'node:path';

const DIR = 'supabase-migrations';
const SWEEP = '2026-08-09-definer-pg-temp-sweep.sql';

/**
 * Strip SQL comments BEFORE any parsing. This is load-bearing, not tidiness -- the parser below
 * reads the FIRST `search_path` clause it finds in a declaration header, so a comment mentioning
 * pg_temp ahead of the real clause makes a genuinely unpinned function report clean. The trap is
 * not hypothetical: the failure message this very test prints instructs authors to write
 * `set search_path = public, pg_temp`, so documenting a fix in a comment above the declaration
 * would DISARM the check that demanded it.
 *
 * The reverse bites too. Prose containing the words "create function ... security definer"
 * manufactures a phantom declaration and reds a clean tree -- the false-alarm class that got the
 * parked source-based asset checker cut (see scripts/mobile-asset-refs.mjs).
 *
 * Comments collapse to a NEWLINE rather than to nothing, so line structure survives and the
 * line-anchored match below still means what it says. An unterminated `/*` is left alone (the
 * block pattern requires its closing delimiter), so it cannot eat the rest of the file.
 */
function stripComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, '\n').replace(/--[^\n]*/g, '\n');
}

/**
 * Pull every routine declaration HEADER out of a migration: the text from `create function` (or
 * `create procedure`) up to the body delimiter (`as $...$`). Everything that matters --
 * `security definer` and `set search_path` -- lives in that header, and stopping at the body
 * keeps a routine whose BODY mentions another routine from being mistaken for a declaration.
 *
 * PROCEDURES are in scope deliberately. `public` holds none today, so this catches nothing now,
 * but a future `create procedure ... security definer` carries the identical temp-schema hazard
 * and would otherwise pass every check here.
 */
function declarationHeaders(sql) {
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?(?:function|procedure)/gi;
  for (const m of sql.matchAll(re)) {
    const rest = sql.slice(m.index, m.index + 2000);
    const body = /\bas\s*\$/i.exec(rest);
    out.push(body ? rest.slice(0, body.index) : rest);
  }
  return out;
}

function unpinnedDefiners(sql) {
  return declarationHeaders(stripComments(sql))
    .filter((h) => /security\s+definer/i.test(h))
    .filter((h) => {
      // Deliberately NOT anchored to a line start. An earlier cut of this guard required the
      // clause to begin its own line, which reds a CORRECTLY pinned declaration written on one
      // line (`create ... security definer set search_path = public, pg_temp as $$`) -- a legal
      // style, and a false alarm the author can only silence by editing this file. That is the
      // failure mode that got the parked source-based asset checker cut, so it is not repeated
      // here. Stripping comments above is what makes the loose match safe; the anchor bought
      // nothing it does not already cover.
      // Capture the value as a comma-separated identifier LIST, not "the rest of the line".
      // `[^\n;]+` stopped at the first newline, so a legal declaration that wraps its list --
      //
      //     set search_path = public,
      //                       pg_temp
      //
      // -- was reported UNPINNED. This guard gates every post-sweep migration, so that false
      // alarm reds CI on correct SQL and can only be cleared by reformatting the correct SQL or
      // bypassing the check: exactly the failure mode that got the parked asset checker cut, and
      // the one this file's own header warns about.
      //
      // Matching the list SHAPE also removes the trailing-modifier problem for free. A
      // declaration written `set search_path = public, pg_temp security definer` now stops the
      // capture at `pg_temp`, because ` security` is not preceded by a comma — so the ordering
      // test below can be exact instead of tolerant.
      // ⚠ `""` inside a quoted identifier is an ESCAPED QUOTE, not the end of the token. A
      // pattern of `"[^"]*"` stops at the first closing quote, so `"pg_temp""evil"` — one
      // identifier named `pg_temp"evil` — reads as the token `"pg_temp"` and passes. The
      // function still searches the real temporary schema implicitly first while CI calls it
      // pinned. Doubled quotes are therefore consumed as part of the token here, and decoded
      // before the comparison below.
      const IDENT = String.raw`(?:"(?:[^"]|"")*"|'(?:[^']|'')*'|[A-Za-z0-9_$]+)`;
      const sp = new RegExp(
        String.raw`search_path\s*(?:to|=)\s*(${IDENT}(?:\s*,\s*${IDENT})*)`,
        'i',
      ).exec(h);
      if (!sp) return true; // no clause at all -- unpinned.

      const value = sp[1].trim();

      // A substring test for `pg_temp` was the whole check here once, and it waved through two
      // declarations that are WRONG in opposite ways. Both were measured against production
      // (a throwaway function in pg_temp, read back via proconfig + current_setting), because
      // the failure is in how Postgres PARSES the clause and that is not worth reasoning about:
      //
      //   set search_path = pg_temp, public      -> stored `pg_temp, public`, resolves pg_temp FIRST,
      //                                             so a temp object shadows every trusted schema.
      //   set search_path to 'public, pg_temp'   -> stored `"public, pg_temp"` -- ONE quoted
      //                                             IDENTIFIER, not a list. That schema does not
      //                                             exist, so unqualified names resolve to nothing
      //                                             and the function fails at CALL time.
      //
      // Both contain the substring. Neither is pinned.

      // The quoted-whole-list form: one pair of quotes spanning a comma. Quoting an INDIVIDUAL
      // element (`"public", "pg_temp"`) is legal and safe, so the comma inside the quotes is what
      // this keys on -- not the presence of a quote.
      if (/^(['"])[^'"]*,[^'"]*\1/.test(value)) return true;

      // Ordering: pg_temp must be the LAST entry. Deliberately NOT "the last entry must equal
      // pg_temp" -- the header slice can carry trailing modifiers on the same line (`... set
      // search_path = public, pg_temp security definer`), and demanding an exact match there
      // reds a correctly pinned declaration. Requiring the pg_temp ELEMENT to be last says the
      // same thing about ordering without caring what follows it on the line.
      // Re-extract the elements with the SAME identifier pattern rather than `split(',')`, so a
      // quoted name containing a comma stays one element instead of being torn in half.
      const parts = value.match(new RegExp(IDENT, 'g')) || [];

      // Match the WHOLE element, with Postgres's own identifier rules. A prefix test (`/^"?pg_temp"?\b/`)
      // accepted `"pg_temp.old"` and `"pg_temp "` — `\b` matches before the punctuation or the
      // space — while Postgres treats each of those as a DIFFERENT schema and therefore still
      // searches the real temporary schema implicitly first. That is the failure the pin exists to
      // prevent, reported as pinned.
      //
      // Quoting decides case-sensitivity, so the two cases are not the same test:
      //   bare      -> folded to lower case by Postgres, so `PG_TEMP` IS `pg_temp`
      //   "quoted"  -> exact, so `"PG_TEMP"` is a different schema and must NOT pass
      const isPgTemp = (raw) => {
        const s = raw.trim();
        // Quoted: exact, after decoding the doubled-quote escape. Single quotes are accepted the
        // same way because Postgres takes a quoted GUC value as ONE schema name (measured: `to
        // 'public, pg_temp'` stores as the single identifier `"public, pg_temp"`), so a lone
        // `'pg_temp'` is a legitimate pin and must not read as unpinned.
        if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/""/g, '"') === 'pg_temp';
        if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1).replace(/''/g, "'") === 'pg_temp';
        return /^pg_temp$/i.test(s);
      };

      const idx = parts.findIndex(isPgTemp);
      if (idx === -1) return true; // pinned to something, but not to pg_temp.
      return idx !== parts.length - 1;
    })
    .map((h) => {
      const name = /(?:function|procedure)\s+([A-Za-z0-9_."]+)/i.exec(h);
      return name ? name[1] : '(unnamed)';
    });
}

test('the pg_temp sweep migration is still present', () => {
  // If this file is renamed or deleted the cutoff below silently swallows every migration and
  // the guard becomes a no-op that still reports green. Fail loudly instead.
  assert.ok(
    existsSync(join(DIR, SWEEP)),
    `${SWEEP} is missing. It defines the cutoff for this guard — if it was renamed, update SWEEP here in the same commit.`
  );
});

test('every migration authored after the sweep pins pg_temp on its SECURITY DEFINER functions', () => {
  const offenders = [];

  for (const file of readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()) {
    // Lexicographic works because every filename is date-prefixed. The sweep itself is excluded:
    // it ALTERs existing functions and declares none of its own.
    if (basename(file) <= SWEEP) continue;
    const sql = readFileSync(join(DIR, file), 'utf8');
    for (const fn of unpinnedDefiners(sql)) offenders.push(`${file} -> ${fn}`);
  }

  assert.deepEqual(
    offenders,
    [],
    'SECURITY DEFINER functions declared without pg_temp in search_path:\n  ' +
      offenders.join('\n  ') +
      '\n\nAn omitted pg_temp is not absent — Postgres searches the session temp schema FIRST,\n' +
      'ahead of pg_catalog, so a caller can shadow a name your body resolves and run it as the\n' +
      'function owner. Add `set search_path = public, pg_temp` to the declaration.\n' +
      '⚠ Write it as a bare identifier list. Quoting it (set search_path to \'public, pg_temp\')\n' +
      'stores ONE schema named "public, pg_temp", which does not exist, and the function then\n' +
      'fails to resolve anything at CALL time with no error at apply.'
  );
});

test('the guard actually detects an unpinned declaration (mutation check)', () => {
  // Pins the detector itself. If declarationHeaders/unpinnedDefiners ever stops matching this
  // repo's declaration style, the test above would pass by finding nothing — green because it
  // went blind, which is the failure mode this whole item exists to close.
  const bad = `
    create or replace function public.probe_bad(p uuid)
    returns void
    language plpgsql
    security definer
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(unpinnedDefiners(bad), ['public.probe_bad']);

  const good = bad.replace("set search_path to 'public'", 'set search_path = public, pg_temp');
  assert.deepEqual(unpinnedDefiners(good), []);

  // A SECURITY INVOKER function is out of scope — it runs as the caller, so temp-schema
  // shadowing buys an attacker nothing they did not already have.
  const invoker = bad.replace('security definer', 'security invoker');
  assert.deepEqual(unpinnedDefiners(invoker), []);
});

test('a comment can neither disarm the guard nor manufacture a false alarm', () => {
  // Both directions of the comment bug, pinned. Before comments were stripped the parser read
  // the FIRST search_path in a raw text window, so each of these was wrong.

  // (1) FALSE PASS — the comment is verbatim what this test's own failure message tells authors
  //     to write, so the natural way to document a fix used to switch the check off.
  const disarmed = `
    create or replace function public.probe_bad(p uuid)
    returns void
    language plpgsql
    security definer
    -- Remember: every definer must set search_path = public, pg_temp (see the sweep).
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(
    unpinnedDefiners(disarmed),
    ['public.probe_bad'],
    'a comment mentioning pg_temp must not satisfy the check for the clause below it'
  );

  // (2) FALSE ALARM — prose describing the wrong form must not become a phantom declaration.
  const prose = `
    -- Do NOT write: create or replace function foo() ... security definer
    -- set search_path to 'public'   <- the old wrong form
    create or replace function public.probe_good(p uuid)
    returns void
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $$ begin return; end $$;
  `;
  assert.deepEqual(unpinnedDefiners(prose), [], 'commented-out prose must not red a clean tree');

  // (3) FALSE PASS — a TRAILING comment on the clause line. The capture runs to end-of-line, so
  //     without stripping it swallows the comment and finds pg_temp in it. This is the likeliest
  //     shape of all: annotating the very line you are supposed to fix.
  const trailing = `
    create or replace function public.probe_trail(p uuid)
    returns void
    language plpgsql
    security definer
    set search_path to 'public'  -- TODO: should be public, pg_temp
    as $$ begin return; end $$;
  `;
  assert.deepEqual(
    unpinnedDefiners(trailing),
    ['public.probe_trail'],
    'a trailing comment must not be read as part of the search_path value'
  );

  // (4) FALSE PASS — a BLOCK comment whose text sits at a line start, which defeats the
  //     line-anchored match on its own.
  const block = `
    create or replace function public.probe_block(p uuid)
    returns void
    language plpgsql
    security definer
    /*
    set search_path = public, pg_temp
    */
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(unpinnedDefiners(block), ['public.probe_block']);

  // (5) FALSE ALARM — a correctly pinned declaration written on ONE line. Guards this against a
  //     line-start anchor being reintroduced: a check that reds a clean tree teaches --no-verify,
  //     which also disables every mount test.
  const oneLine =
    'create or replace function public.probe_line() returns void language plpgsql ' +
    'security definer set search_path = public, pg_temp as $$ begin return; end $$;';
  assert.deepEqual(unpinnedDefiners(oneLine), [], 'a one-line pinned declaration is correct code');

  // (6) A procedure carries the identical hazard and must be in scope.
  const proc = `
    create or replace procedure public.probe_proc(p uuid)
    language plpgsql
    security definer
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(unpinnedDefiners(proc), ['public.probe_proc']);
});
