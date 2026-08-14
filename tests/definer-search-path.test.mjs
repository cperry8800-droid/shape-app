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
 * Pull every function declaration HEADER out of a migration: the text from `create function` up
 * to the body delimiter (`as $...$`). Everything that matters -- `security definer` and
 * `set search_path` -- lives in that header, and stopping at the body keeps a function whose
 * BODY mentions another function from being mistaken for a second declaration.
 */
function declarationHeaders(sql) {
  const out = [];
  const re = /create\s+(?:or\s+replace\s+)?function/gi;
  for (const m of sql.matchAll(re)) {
    const rest = sql.slice(m.index, m.index + 2000);
    const body = /\bas\s*\$/i.exec(rest);
    out.push(body ? rest.slice(0, body.index) : rest);
  }
  return out;
}

function unpinnedDefiners(sql) {
  return declarationHeaders(sql)
    .filter((h) => /security\s+definer/i.test(h))
    .filter((h) => {
      const sp = /search_path\s*(?:to|=)\s*([^\n;]+)/i.exec(h);
      return !sp || !sp[1].includes('pg_temp');
    })
    .map((h) => {
      const name = /function\s+([A-Za-z0-9_."]+)/i.exec(h);
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
