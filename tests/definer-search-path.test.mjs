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
 * Blank the CONTENTS of every dollar-quoted region ($$...$$ / $tag$...$tag$), keeping the
 * delimiters and the line structure. Two jobs, both load-bearing:
 *
 *   1. A routine's body can no longer be read as declaration text. Body prose containing
 *      `create function ... security definer` would otherwise manufacture a phantom declaration
 *      (the false-alarm class that got the parked asset checker cut), and a `do $guard$` block --
 *      every migration here ends in one -- is full of exactly those words.
 *   2. It makes "slice to the statement's `;`" safe, which is what lets the parser below read
 *      modifiers written AFTER the body.
 *
 * A dollar-quote with no matching close is left ALONE rather than blanked to end-of-file: a lone
 * `$` in ordinary text must not swallow the rest of the migration and hide real declarations.
 */
function maskDollarBodies(sql) {
  const open = /\$([A-Za-z_][A-Za-z0-9_]*)?\$/g;
  let out = '';
  let i = 0;
  for (;;) {
    open.lastIndex = i;
    const m = open.exec(sql);
    if (!m) { out += sql.slice(i); return out; }
    const tag = m[0];
    const bodyStart = m.index + tag.length;
    const close = sql.indexOf(tag, bodyStart);
    if (close === -1) { out += sql.slice(i); return out; } // unterminated -> not a body
    out += sql.slice(i, bodyStart);
    out += sql.slice(bodyStart, close).replace(/[^\n]/g, ' '); // blank, keep newlines
    out += tag;
    i = close + tag.length;
  }
}

/**
 * Blank the contents of a STRING-CONSTANT body -- `as 'select 1'`, the older spelling of a
 * routine body that PostgreSQL still accepts. Two failures, in opposite directions:
 *
 *   as 'SELECT 1;' language sql security definer set search_path to 'public';
 *       -> the body's semicolon read as the statement terminator, cutting the slice before
 *          `security definer`, so the routine left the check's scope and CI reported clean.
 *   as 'select 1 -- set search_path = public, pg_temp' ... set search_path to 'public';
 *       -> the value parser reads the FIRST search_path in the slice, which is the one inside the
 *          body, so a genuinely unpinned routine reports PINNED. The comment-disarm bug, arriving
 *          through a string instead of a comment.
 *
 * ⚠ ONLY THE BODY IS MASKED, not every single-quoted string. Blanking all of them would take
 * `set search_path to 'pg_temp'` with it -- a form this file deliberately accepts as a legitimate
 * pin (Postgres stores a quoted GUC value as ONE schema name) -- and report it unpinned. That is
 * a false alarm on correct SQL, which is the failure mode that gets a check bypassed rather than
 * fixed. The distinction is positional: a body follows `as`, a search_path value follows
 * `search_path =`.
 *
 * Run AFTER maskDollarBodies, so quotes inside a dollar-quoted body are already gone.
 */
function maskStringBodies(sql) {
  const re = /\bas\s*'/gi;
  let out = '';
  let i = 0;
  for (;;) {
    re.lastIndex = i;
    const m = re.exec(sql);
    if (!m) { out += sql.slice(i); return out; }
    const bodyStart = m.index + m[0].length; // first char inside the quote
    let j = bodyStart;
    for (; j < sql.length; j++) {
      if (sql[j] !== "'") continue;
      if (sql[j + 1] === "'") { j++; continue; } // '' is an escaped quote, still inside
      break;
    }
    if (j >= sql.length) { out += sql.slice(i); return out; } // unterminated -> leave alone
    out += sql.slice(i, bodyStart);
    out += sql.slice(bodyStart, j).replace(/[^\n]/g, ' ');
    out += "'";
    i = j + 1;
  }
}

/**
 * Pull every routine DECLARATION out of a migration: from `create function` (or
 * `create procedure`) to the statement's terminating `;`, with the body blanked out by
 * maskDollarBodies above.
 *
 * ⚠ IT IS NOT ENOUGH TO STOP AT THE BODY. An earlier cut sliced the declaration at `as $...$` on
 * the reasoning that "everything that matters lives in that header" -- but PostgreSQL's
 * CREATE FUNCTION attributes are an UNORDERED list and `AS` is one of them, so
 *
 *     create function f() returns int as $$ select 1 $$ language sql security definer;
 *
 * is equally legal and puts both `security definer` and `set search_path` past that cut. Such a
 * routine did not read as unpinned -- it dropped out of scope entirely, because the slice carried
 * no `security definer` for the filter below to match, and CI reported clean on an unpinned
 * definer. A guard that only works when the author happens to pick one of two legal orderings is
 * the "green because it went blind" failure this whole file exists to close. Measured: no
 * migration in the repo writes that ordering today, so this was latent, not live.
 *
 * PROCEDURES are in scope deliberately. `public` holds none today, so this catches nothing now,
 * but a future `create procedure ... security definer` carries the identical temp-schema hazard
 * and would otherwise pass every check here.
 */
/**
 * Index of the statement's terminating `;`, skipping quoted text.
 *
 * A plain `indexOf(';')` would end the declaration at a semicolon inside a string literal --
 * `create function f(p text default 'a;b') ... security definer` would be cut before its
 * modifiers and drop out of scope. That is the SAME blind-spot class this parser was just fixed
 * for, so it is closed here rather than left for the next reader to rediscover. Measured: no
 * declaration in the repo carries one today, which is exactly why it would have gone unnoticed.
 *
 * Dollar-quoted bodies are already blanked by the caller, so only quote pairs need tracking.
 * Doubled quotes (`''`, `""`) are escapes and stay inside the literal.
 */
function statementEnd(s, start) {
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" || ch === '"') {
      for (i++; i < s.length; i++) {
        if (s[i] !== ch) continue;
        if (s[i + 1] === ch) { i++; continue; } // escaped quote -- still inside
        break;
      }
      continue;
    }
    if (ch === ';') return i;
  }
  return -1;
}

function declarationHeaders(sql) {
  const masked = maskStringBodies(maskDollarBodies(sql));
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?(?:function|procedure)/gi;
  for (const m of masked.matchAll(re)) {
    const end = statementEnd(masked, m.index);
    // No terminator (a truncated or malformed file): fall back to a bounded window rather than
    // reading the rest of the migration as one declaration.
    out.push(end === -1 ? masked.slice(m.index, m.index + 2000) : masked.slice(m.index, end));
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

test('modifiers written AFTER the body are scanned, and a body cannot manufacture a declaration', () => {
  // PostgreSQL's CREATE FUNCTION attributes are an unordered list and `AS` is one of them, so a
  // declaration may legally put `security definer` / `set search_path` on EITHER side of its body.
  // A parser that stops at the body sees neither, drops the routine as "not a definer", and
  // reports clean -- the blind-spot direction, which is strictly worse than a false alarm.

  // (1) Post-body ordering, UNPINNED -> must be caught. Before the rewrite this returned [].
  const afterBad = `
    create or replace function public.probe_after(p uuid)
    returns void
    as $$ begin return; end $$
    language plpgsql
    security definer
    set search_path to 'public';
  `;
  assert.deepEqual(
    unpinnedDefiners(afterBad),
    ['public.probe_after'],
    'a definer whose modifiers follow the body must still be in scope'
  );

  // (2) Post-body ordering, PINNED -> must stay clean. The fix must not buy detection with a
  //     false alarm on the same legal style: that is the trade that got the asset checker cut.
  const afterGood = afterBad.replace("set search_path to 'public'", 'set search_path = public, pg_temp');
  assert.deepEqual(unpinnedDefiners(afterGood), [], 'the same ordering, correctly pinned, is clean code');

  // (3) The one-line form of the same ordering, which has no newline to lean on.
  const afterOneLine =
    'create or replace function public.probe_after_line() returns void as $$ begin return; end $$ ' +
    "language plpgsql security definer set search_path to 'public';";
  assert.deepEqual(unpinnedDefiners(afterOneLine), ['public.probe_after_line']);

  // (4) A BODY that talks about declarations must not become one. The declaration now runs to the
  //     statement terminator, so the body is blanked rather than merely skipped -- without that,
  //     widening the slice would have re-opened the phantom-declaration false alarm.
  const talkativeBody = `
    create or replace function public.probe_talk()
    returns void
    language plpgsql
    security definer
    set search_path = public, pg_temp
    as $$
    begin
      -- create or replace function public.ghost() security definer set search_path to 'public'
      return;
    end
    $$;
  `;
  assert.deepEqual(unpinnedDefiners(talkativeBody), [], 'body text must not manufacture a phantom definer');

  // (5) Every migration in this repo ends in a `do $guard$ ... $guard$` block whose prose names
  //     these exact words. It is a dollar-quoted region too, so it is masked for the same reason.
  const guardBlock = `
    do $guard$
    begin
      raise exception 'create or replace function ... security definer set search_path to ''public''';
    end
    $guard$;
  `;
  assert.deepEqual(unpinnedDefiners(guardBlock), [], 'a DO block is not a declaration');

  // (6) A semicolon inside a STRING LITERAL must not end the declaration early. Cutting there
  //     would drop the modifiers that follow — the same blind spot as (1), reached another way.
  const semicolonInDefault = `
    create or replace function public.probe_semi(p_note text default 'a;b')
    returns void
    language plpgsql
    security definer
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(
    unpinnedDefiners(semicolonInDefault),
    ['public.probe_semi'],
    'a semicolon inside a literal must not truncate the declaration'
  );

  // (7) A STRING-CONSTANT body -- the older `as 'select 1'` spelling Postgres still accepts --
  //     whose semicolon would otherwise read as the statement terminator.
  const stringBody =
    "create function public.probe_strbody() returns int\n" +
    "as 'SELECT 1;' language sql security definer set search_path to 'public';";
  assert.deepEqual(
    unpinnedDefiners(stringBody),
    ['public.probe_strbody'],
    "a semicolon inside a string-constant body must not end the declaration"
  );

  // (8) The DISARM direction of the same form: the value parser reads the first `search_path` in
  //     the slice, so an unpinned routine whose BODY sets its own search_path -- an entirely
  //     ordinary thing for a body to do -- used to report clean off the body's clause while the
  //     real one said otherwise. Masking the body is what makes the real clause the first one.
  //
  //     ⚠ Residual, named rather than papered over: stripComments runs BEFORE this mask, so a `--`
  //     INSIDE a string-constant body still eats to end-of-line and can take the modifiers with
  //     it. Closing that needs a real lexer, which is what got the parked asset checker cut. The
  //     exposure is a string-constant body -- unused anywhere in this repo -- carrying a `--` on
  //     the same line as its modifiers.
  const stringBodyDisarm =
    "create function public.probe_disarm() returns int\n" +
    "as 'set search_path = public, pg_temp; select 1' language sql security definer " +
    "set search_path to 'public';";
  assert.deepEqual(
    unpinnedDefiners(stringBodyDisarm),
    ['public.probe_disarm'],
    'a string body must not be able to satisfy the check for the clause outside it'
  );

  // (9) ⚠ AND THE MASK MUST NOT BE WIDER THAN THE BODY. `set search_path to 'pg_temp'` is a
  //     legitimate pin (a quoted GUC value is ONE schema name), so blanking every single-quoted
  //     string -- the obvious over-broad reading of (7)/(8) -- would red correct SQL.
  const quotedPin =
    'create function public.probe_quoted_pin() returns int\n' +
    "language sql security definer set search_path to 'pg_temp' as $$ select 1 $$;";
  assert.deepEqual(
    unpinnedDefiners(quotedPin),
    [],
    "a single-quoted pg_temp pin is correct code and must not be masked away"
  );

  // (10) A lone unmatched `$` must not swallow the rest of the file and hide real declarations --
  //     blanking to end-of-file would turn one stray character into a silent all-clear.
  const strayDollar = `
    -- price$ is not a dollar quote
    select 'a$b' as x;
    create or replace function public.probe_stray()
    returns void
    language plpgsql
    security definer
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(unpinnedDefiners(strayDollar), ['public.probe_stray']);
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
