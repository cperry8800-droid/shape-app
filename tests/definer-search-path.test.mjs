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
 * ONE left-to-right scan that neutralises comments and routine bodies together.
 *
 * ⚠ WHY A SCANNER AND NOT MORE PASSES. This started as layered regex passes -- strip comments,
 * then mask dollar bodies, then mask string bodies -- and review landed on that seam three rounds
 * running, each fix exposing the next: modifiers after the body, then a semicolon inside a string
 * body, then a `--` inside a string body eating the closing quote and every modifier after it.
 * The layering IS the defect. Each pass rewrites the text the next one parses, so comment-vs-string
 * precedence is decided by pass ORDER instead of by position, and whichever runs first corrupts the
 * other's input. There is no ordering that fixes it: comments can contain quotes and strings can
 * contain comment markers, so either pass first is wrong for some input. The repo's own rule for a
 * flat findings curve is to change approach rather than patch again (and the parked asset checker
 * was cut for exactly this -- regex lexing of a thing that needs a lexer).
 *
 * A single pass has no order to get wrong: whichever construct OPENS first wins, which is what
 * Postgres itself does. Output is the same length with the same newlines, so offsets and line
 * structure survive.
 *
 * ⚠ AND IT REFUSES RATHER THAN GUESSES. One scan fixed the ORDERING bug; it did not make a
 * hand-rolled lexer complete, and the next review round proved it -- nested block comments,
 * `E'...'` backslash escapes, and a clause hiding in an ordinary literal, all found at once.
 * PostgreSQL's lexer has more corners than this file will ever model (`U&'...'`, bit/hex
 * literals, `standard_conforming_strings`), and every gap here is a FALSE NEGATIVE: the guard
 * says clean about a declaration that is unpinned. So the scan now reports `unverifiable` when
 * it meets a construct it does not model EXACTLY, and the caller flags every definer in that
 * file. A parsing gap becomes a loud failure the author can act on instead of a silent
 * all-clear -- the only direction a security guard may fail in.
 *
 * WHAT IS BLANKED, AND WHY EACH:
 *   comments             a comment mentioning pg_temp ahead of the real clause would DISARM the
 *                        check (the parser reads the first `search_path` it finds), and prose
 *                        containing "create function ... security definer" would manufacture a
 *                        phantom declaration and red a clean tree. Block comments NEST in
 *                        Postgres, so they are consumed by DEPTH: stopping at the first closing
 *                        delimiter leaks the outer comment's tail back in as live code.
 *   dollar-quoted text   bodies and `do $guard$` blocks are full of these exact words.
 *   every other quoted   including `as '...'` bodies AND ordinary literals. A parameter default
 *   run                  holding `default 'set search_path = public, pg_temp'` sits EARLIER in
 *                        the declaration than the real clause, and the value parser reads the
 *                        first `search_path` it finds -- so an unpinned routine reported clean.
 *
 * WHAT IS KEPT, AND WHY IT IS EXACTLY THIS:
 *   only a run that is syntactically the VALUE of a real `set search_path = ...` clause.
 *   `set search_path to 'pg_temp'` is a legitimate pin (Postgres stores a quoted GUC value as
 *   ONE schema name) and `set search_path = public, "pg_temp"` quotes a list ELEMENT, so both
 *   must survive to be judged. Position decides it -- not the presence of a quote, and no longer
 *   "anything that is not a body", which was the wider reading that let a literal fake a clause.
 *
 * Quotes are still RECOGNISED everywhere even when blanked: a `;` or `--` inside `default 'a;b'`
 * must not end the statement or start a comment.
 */
function scrubSql(sql) {
  const out = sql.split('');
  let unverifiable = null;
  const bail = (why) => { if (!unverifiable) unverifiable = why; };
  const blank = (from, to) => {
    for (let k = from; k < to && k < sql.length; k++) if (sql[k] !== '\n') out[k] = ' ';
  };
  // Backslashes are ordinary inside a normal literal only while standard_conforming_strings is
  // on. It has defaulted on since 9.1 and no migration turns it off -- but a file that did would
  // silently change what every quote means, so it is refused rather than mis-scanned.
  if (/standard_conforming_strings\s*(?:=|\bto\b)\s*(?:off|'off'|false|0)\b/i.test(sql)) {
    bail('standard_conforming_strings is turned off');
  }
  // The value of a `set search_path` clause: the clause head, then any already-closed list
  // elements. Anchored at the quote, so it can only ever describe THIS run's position.
  const VALUE_POS =
    /search_path\s*(?:=|\bto\b)\s*(?:(?:[A-Za-z0-9_$]+|"(?:[^"]|"")*"|'(?:[^']|'')*')\s*,\s*)*$/i;
  const idChar = (ch) => /[A-Za-z0-9_$]/.test(ch || '');
  let i = 0;
  while (i < sql.length) {
    const c = sql[i];

    if (c === '-' && sql[i + 1] === '-') {
      let j = i;
      while (j < sql.length && sql[j] !== '\n') j++;
      blank(i, j); i = j; continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      let depth = 1, j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; }
        else j++;
      }
      if (depth > 0) bail('unterminated block comment');
      blank(i, j); i = j; continue;
    }
    if (c === '$') {
      const m = /^\$([A-Za-z_][A-Za-z0-9_]*)?\$/.exec(sql.slice(i));
      if (m) {
        const close = sql.indexOf(m[0], i + m[0].length);
        if (close === -1) { bail('unterminated dollar-quoted string'); i = sql.length; continue; }
        blank(i + m[0].length, close);
        i = close + m[0].length; continue;
      }
      i++; continue; // a lone `$` is ordinary text
    }
    if (c === "'" || c === '"') {
      // `E'...'` and `U&'...'` honour backslash escapes, so `E'\''` is ONE string, not two.
      // Reading them as doubled-quote-only ends the run at the escaped quote and hands the rest
      // of the declaration to the scanner as code.
      const p1 = sql[i - 1], p2 = sql[i - 2];
      const escapes = c === "'" &&
        ((/[Ee]/.test(p1 || '') && !idChar(p2)) ||
         (p1 === '&' && /[Uu]/.test(p2 || '') && !idChar(sql[i - 3])));
      let j = i + 1, closed = false;
      for (; j < sql.length; j++) {
        if (escapes && sql[j] === '\\') { j++; continue; }
        if (sql[j] !== c) continue;
        if (sql[j + 1] === c) { j++; continue; } // doubled -> escaped, still inside
        closed = true; break;
      }
      if (!closed) { bail('unterminated string literal'); i = sql.length; continue; }
      // Look back over the ALREADY-MASKED text, so a `search_path` sitting inside a comment or a
      // body cannot make the next literal read as a clause value.
      const before = out.slice(Math.max(0, i - 500), i).join('');
      if (!VALUE_POS.test(before)) blank(i + 1, j);
      i = j + 1; continue;
    }
    i++;
  }
  return { masked: out.join(''), unverifiable };
}

/**
 * Index of the statement's terminating `;`, skipping quoted text.
 *
 * A plain `indexOf(';')` would end the declaration at a semicolon inside a string literal --
 * `create function f(p text default 'a;b') ... security definer` would be cut before its
 * modifiers and drop out of scope. Measured: no declaration in the repo carries one today, which
 * is exactly why it would have gone unnoticed.
 *
 * Runs on scrubSql'd text, so comments and body strings are already blank and cannot fake a
 * terminator. VALUE strings are still present by design (`set search_path to 'pg_temp'` must
 * survive), so quote pairs still need tracking here. Doubled quotes are escapes, not terminators,
 * and an `E'...'` value honours backslashes for the same reason the scanner does.
 */
function statementEnd(s, start) {
  const idChar = (ch) => /[A-Za-z0-9_$]/.test(ch || '');
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (ch === "'" || ch === '"') {
      const escapes = ch === "'" && /[Ee]/.test(s[i - 1] || '') && !idChar(s[i - 2]);
      for (i++; i < s.length; i++) {
        if (escapes && s[i] === '\\') { i++; continue; }
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

function declarationHeaders(masked) {
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
  const { masked, unverifiable } = scrubSql(sql);
  // A construct the scanner does not model exactly means every "pinned" verdict in this file is a
  // guess. Report rather than certify -- but only when there is a definer at stake, so a
  // malformed file with nothing to protect stays quiet instead of teaching people to ignore this.
  if (unverifiable) {
    return /security\s+definer/i.test(sql)
      ? [`(unverifiable: ${unverifiable} — pin pg_temp explicitly and add a vector to this test)`]
      : [];
  }
  return declarationHeaders(masked)
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
  //     This residual was carried openly for one commit -- comment-stripping ran BEFORE the body
  //     mask, so a `--` inside a string body ate the closing quote and every modifier after it --
  //     and vector (9) below is that exact case. It is closed now, by scrubSql handling comments
  //     and bodies in ONE pass instead of two ordered ones.
  const stringBodyDisarm =
    "create function public.probe_disarm() returns int\n" +
    "as 'set search_path = public, pg_temp; select 1' language sql security definer " +
    "set search_path to 'public';";
  assert.deepEqual(
    unpinnedDefiners(stringBodyDisarm),
    ['public.probe_disarm'],
    'a string body must not be able to satisfy the check for the clause outside it'
  );

  // (9) THE ORDERING BUG ITSELF: a `--` inside a string-constant body. With comment-stripping as a
  //     separate earlier pass this ate the closing quote AND every modifier on the line, so the
  //     declaration lost its `security definer` and left the check's scope — an unpinned routine
  //     reported clean. One scan cannot get this wrong: the quote opens before the `--`, so the
  //     `--` is body text, not a comment.
  const stringBodyComment =
    'create function public.probe_bodycomment() returns int\n' +
    "as 'select 1 -- harmless text' language sql security definer set search_path to 'public';";
  assert.deepEqual(
    unpinnedDefiners(stringBodyComment),
    ['public.probe_bodycomment'],
    'a comment marker inside a string body must not consume the declaration'
  );

  // (10) The mirror: a quote inside a REAL comment must not open a string and swallow what follows.
  //      Whichever construct opens first wins — here the `--` does.
  const commentWithQuote = `
    create or replace function public.probe_cquote(p uuid)
    returns void
    language plpgsql
    security definer
    -- don't pin this one yet
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(
    unpinnedDefiners(commentWithQuote),
    ['public.probe_cquote'],
    "an apostrophe inside a comment must not be read as a string opener"
  );

  // (11) ⚠ AND THE MASK MUST NOT BE WIDER THAN THE BODY. `set search_path to 'pg_temp'` is a
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

  // (12) A lone unmatched `$` must not swallow the rest of the file and hide real declarations --
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

  // (13) BLOCK COMMENTS NEST in Postgres. Stopping at the first `*/` ends the comment early and
  //      hands the OUTER comment's tail back to the scanner as live code -- and a `pg_temp` in
  //      that tail satisfies the check before the real, unpinned clause is ever reached.
  const nestedComment = `
    create or replace function public.probe_nested(p uuid)
    returns void
    language plpgsql
    security definer
    /* note /* aside */ set search_path = public, pg_temp */
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(
    unpinnedDefiners(nestedComment),
    ['public.probe_nested'],
    'a nested block comment must not leak its tail back in as a clause'
  );

  // (14) The same nesting, hiding nothing: consuming by depth must not red a clean tree either.
  const nestedClean = nestedComment
    .replace('/* note /* aside */ set search_path = public, pg_temp */', '/* note /* aside */ still the note */')
    .replace("set search_path to 'public'", 'set search_path = public, pg_temp');
  assert.deepEqual(unpinnedDefiners(nestedClean), [], 'a nested comment over correct SQL is clean code');

  // (15) `E'...'` honours BACKSLASH escapes, so `E'it\'s'` is ONE string. Reading it as
  //      doubled-quote-only ends the run at the escaped quote, and the `;` that follows inside
  //      the literal then reads as the statement terminator -- cutting the declaration before
  //      `security definer` and dropping it out of scope entirely.
  const eString =
    "create function public.probe_estring(p_note text default E'it\\'s a;b')\n" +
    "returns int language sql security definer set search_path to 'public' as $$ select 1 $$;";
  assert.deepEqual(
    unpinnedDefiners(eString),
    ['public.probe_estring'],
    'a backslash-escaped quote must not end an escape-string literal'
  );

  // (16) ⚠ AN ORDINARY LITERAL CAN FAKE THE CLAUSE. A parameter default sits EARLIER in the
  //      declaration than the modifiers, and the value parser reads the first `search_path` it
  //      finds -- so the routine's own real `to 'public'` was never reached. Masking only bodies
  //      was too narrow: what matters is not "is this a body" but "is this the clause's VALUE".
  const literalFake = `
    create or replace function public.probe_literal(p_note text default 'set search_path = public, pg_temp')
    returns void
    language plpgsql
    security definer
    set search_path to 'public'
    as $$ begin return; end $$;
  `;
  assert.deepEqual(
    unpinnedDefiners(literalFake),
    ['public.probe_literal'],
    'a literal holding a pinned-looking clause must not satisfy the check'
  );

  // (17) ...and the narrowing must not eat a QUOTED LIST ELEMENT. `"pg_temp"` is a legal way to
  //      write the pin, so masking every non-body string would have reported correct SQL unpinned.
  const quotedElement =
    'create function public.probe_quoted_elem() returns int\n' +
    'language sql security definer set search_path = public, "pg_temp" as $$ select 1 $$;';
  assert.deepEqual(
    unpinnedDefiners(quotedElement),
    [],
    'a quoted element inside the search_path list is correct code'
  );

  // (18) THE BACKSTOP. A construct the scanner does not model exactly makes every "pinned"
  //      verdict in the file a guess, so it reports instead of certifying. This is what stops
  //      the next unmodelled corner from being another silent all-clear.
  const unterminated =
    "create or replace function public.probe_unterminated()\n" +
    "returns void language plpgsql security definer set search_path = public, pg_temp\n" +
    "as $$ begin return; end $$;\n" +
    "select 'oops;";
  const bailed = unpinnedDefiners(unterminated);
  assert.equal(bailed.length, 1, 'an unscannable file reports rather than certifying');
  assert.match(bailed[0], /^\(unverifiable: unterminated string literal/);

  // ...but a file with no definer at stake stays quiet. A guard that reds a tree it has nothing
  // to protect in teaches people to ignore it, which is how the parked asset checker died.
  assert.deepEqual(unpinnedDefiners("select 'oops;"), []);
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
