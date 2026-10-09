#!/usr/bin/env node
// Diffs the LIVE catalog against the allow-list: reads the rows scripts/definer-live-check.sql
// returns (JSON on stdin) and fails on any anon-executable SECURITY DEFINER function that
// tests/fixtures/definer-anon-allowlist.json does not account for.
//
// Usage:
//   node scripts/definer-live-diff.mjs < rows.json
//   node scripts/definer-live-diff.mjs --allowlist path/to/allowlist.json --strict < rows.json
//
// Exit status:
//   0  every anon-executable non-trigger definer is an allow-list entry or a registered finding,
//      and every unpinned definer (trigger functions included) is a registered pin finding
//   1  something is not accounted for (the names are printed with what to do about each), or a name
//      has more than one signature: the allow-list is by NAME, so an overload made outside the
//      migrations would otherwise inherit the entry of the function it shares a name with
//   2  the input is not usable: not JSON, not rows, no rows, or the wrong columns. An empty or
//      malformed capture is NOT a pass, because "nothing to check" and "nothing wrong" read the
//      same to a script that only counts problems. A capture with no `is_trigger`, `pg_temp_pinned`
//      or `identity_args` column (an older query's output) is refused for the same reason: without
//      them it cannot say which rows are triggers, which are pinned or which are overloads of one
//      name, and would pass as clean.
//
// `--strict` also exits 1 on STALE entries (an entry or finding the live catalog no longer
// supports), which is how a fixed finding gets cleaned out of the list.

import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const DEFAULT_ALLOWLIST = fileURLToPath(new URL('../tests/fixtures/definer-anon-allowlist.json', import.meta.url));

/**
 * Rows from the query's output. A SQL client wraps a one-cell result differently, so this takes
 * the array itself, `[{ rows: [...] }]` (the column name the query uses), a single-key object
 * whose value is the array, or the cell's JSON as a string. Throws a plain Error otherwise.
 */
export function parseRows(text) {
  let v;
  try { v = JSON.parse(text); } catch (e) { throw new Error(`input is not JSON: ${e.message}`); }
  for (let depth = 0; depth < 3; depth++) {
    if (typeof v === 'string') { try { v = JSON.parse(v); } catch { break; } continue; }
    if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === 'object' && !Array.isArray(v[0]) && !('proname' in v[0])) {
      const vals = Object.values(v[0]);
      if (vals.length === 1) { v = vals[0]; continue; }
    }
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const vals = Object.values(v);
      if (vals.length === 1 && (Array.isArray(vals[0]) || typeof vals[0] === 'string')) { v = vals[0]; continue; }
    }
    break;
  }
  if (!Array.isArray(v)) throw new Error('expected a JSON array of rows (the `rows` cell of scripts/definer-live-check.sql)');
  if (v.length === 0) throw new Error('no rows: the query returned no SECURITY DEFINER functions, so nothing was checked');
  v.forEach((r, i) => {
    if (!r || typeof r.proname !== 'string' || typeof r.identity_args !== 'string' || typeof r.anon_executable !== 'boolean' || typeof r.is_trigger !== 'boolean' || typeof r.pg_temp_pinned !== 'boolean') {
      throw new Error(`row ${i} lacks \`proname\` or \`identity_args\` (text) or one of \`anon_executable\`, \`is_trigger\`, \`pg_temp_pinned\` (booleans): was this the output of the current scripts/definer-live-check.sql? It reads every definer now, triggers included, marks them, and lists each signature`);
    }
  });
  return v;
}

const names = (xs) => [...new Set(xs)].sort();

/** The diff. `allow` is the parsed allow-list; `rows` come from parseRows. */
export function diffLive(rows, allow) {
  const rawEntries = new Set(Object.keys(allow.entries ?? {}));
  const rawFindings = new Set((allow.registeredFindings ?? []).map((f) => f.name));
  // `fixedAfterCapture`: a migration fixes it, and the database may not have it yet. While the live
  // row is still anon-executable (or, for a pin fix, still unpinned) it counts as what the list said
  // before (`wasEntry` / `wasFinding` / `wasPinFinding`) and is named as awaiting apply; once live
  // agrees it is fixed, it is named as applied, to delete.
  const fixed = (allow.fixedAfterCapture ?? []).filter((f) => f && f.name);
  const fixedAccess = fixed.filter((f) => !f.wasPinFinding);
  const fixedPins = fixed.filter((f) => f.wasPinFinding);
  const rawPinFindings = new Set((allow.registeredPinFindings ?? []).map((f) => f.name));
  // ONE SCOPE (see tests/helpers/definer-live.mjs): every definer in public is here, trigger and
  // event-trigger functions included, and a row that says it is not a definer or not in public is
  // dropped so pasting a wider capture cannot fail the check for the wrong reason. The pin is
  // read over ALL of them (a trigger definer is just as exposed to a planted pg_temp relation);
  // anon-executability only over the non-trigger ones, because nothing can call a trigger function
  // as an RPC. The pin list is computed BEFORE the trigger filter: computed after it, an unpinned
  // trigger definer would be invisible here.
  const all = rows.filter((r) => r.prosecdef !== false && (r.nspname ?? 'public') === 'public');
  const definers = all.filter((r) => r.is_trigger !== true);
  const anon = definers.filter((r) => r.anon_executable);
  const anonNames = new Set(anon.map((r) => r.proname));
  const awaiting = fixedAccess.filter((f) => anonNames.has(f.name));
  const entries = new Set([...rawEntries, ...awaiting.filter((f) => f.wasEntry).map((f) => f.name)]);
  const findings = new Set([...rawFindings, ...awaiting.filter((f) => !f.wasEntry).map((f) => f.name)]);
  const unpinned = names(all.filter((r) => r.pg_temp_pinned === false).map((r) => r.proname));
  const awaitingPins = fixedPins.filter((f) => unpinned.includes(f.name));
  const pinFindings = new Set([...rawPinFindings, ...awaitingPins.map((f) => f.name)]);
  // The allow-list and everything above are by NAME, which is sound only while a name is ONE
  // signature. The function this check exists to catch is one made outside the migrations, and it
  // can be an overload of an allow-listed name: counted by name it would inherit that entry's
  // classification without anyone having read it. The static audit refuses overloads in the model;
  // this is the same refusal for the live catalog, which the model cannot see. It reads EVERY definer,
  // trigger functions included: the pin findings are by name too, so an unpinned plain function that
  // shares a name with a registered trigger function would inherit that registration just the same.
  const sigsByName = new Map();
  for (const r of all) {
    const bySig = sigsByName.get(r.proname) ?? new Map();
    const seen = bySig.get(r.identity_args) ?? { anon: false, trigger: false };
    bySig.set(r.identity_args, { anon: seen.anon || r.anon_executable === true, trigger: seen.trigger || r.is_trigger === true });
    sigsByName.set(r.proname, bySig);
  }
  const overloaded = [...sigsByName]
    .filter(([, bySig]) => bySig.size > 1)
    .map(([name, bySig]) => ({ name, sigs: [...bySig].map(([args, v]) => ({ args, anon: v.anon, trigger: v.trigger })).sort((a, b) => (a.args < b.args ? -1 : 1)) }))
    .sort((a, b) => (a.name < b.name ? -1 : 1));
  return {
    definers: names(definers.map((r) => r.proname)).length,
    triggerDefiners: names(all.filter((r) => r.is_trigger === true).map((r) => r.proname)).length,
    anonExecutable: anonNames.size,
    allowListed: names([...anonNames].filter((n) => entries.has(n))).length,
    registered: names([...anonNames].filter((n) => findings.has(n))).length,
    unaccounted: names([...anonNames].filter((n) => !entries.has(n) && !findings.has(n))),
    // In both lists at once is a mistake in the file, not in the database; say so here too.
    doubleListed: names([
      ...[...rawEntries].filter((n) => rawFindings.has(n)),
      ...fixedAccess.map((f) => f.name).filter((n) => rawEntries.has(n) || rawFindings.has(n)),
      ...fixedPins.map((f) => f.name).filter((n) => rawPinFindings.has(n)),
    ]),
    stale: names([...rawEntries, ...rawFindings].filter((n) => !anonNames.has(n))),
    awaitingApply: names([...awaiting, ...awaitingPins].map((f) => f.name)),
    appliedLive: names([...fixedAccess.filter((f) => !anonNames.has(f.name)), ...fixedPins.filter((f) => !unpinned.includes(f.name))].map((f) => f.name)),
    overloaded,
    unpinned,
    unregisteredPins: unpinned.filter((n) => !pinFindings.has(n)),
    stalePins: names([...rawPinFindings].filter((n) => !unpinned.includes(n))),
  };
}

/** Exit status for a diff: 1 for anything unaccounted or overloaded (and, with strict, anything stale). */
export function verdict(d, { strict = false } = {}) {
  if (d.unaccounted.length || d.unregisteredPins.length || d.doubleListed.length || d.overloaded.length) return 1;
  if (strict && (d.stale.length || d.stalePins.length || (d.appliedLive ?? []).length)) return 1;
  return 0;
}

export function report(d, { strict = false } = {}) {
  const out = [];
  out.push(`${d.definers} SECURITY DEFINER functions in public (plus ${d.triggerDefiners} trigger functions, checked for the pin only); ${d.anonExecutable} executable by anon: ${d.allowListed} allow-listed, ${d.registered} registered findings, ${d.unaccounted.length} UNACCOUNTED`);
  if (d.unaccounted.length) {
    out.push('', 'UNACCOUNTED anon-executable definers (each is a new exposure or a missing classification):');
    for (const n of d.unaccounted) out.push(`  ${n}`);
    out.push('', 'Fix each with `revoke execute on function public.<name>(<args>) from public, anon;`, or classify it in tests/fixtures/definer-anon-allowlist.json (revoking from PUBLIC alone leaves the explicit anon grant standing).');
  }
  if (d.doubleListed.length) out.push('', `In both entries and registeredFindings, or in fixedAfterCapture and the list it says it left (a finding must not also be an entry): ${d.doubleListed.join(', ')}`);
  if (d.overloaded.length) {
    out.push('', 'OVERLOADED (one name, several signatures). The allow-list is by NAME, so one entry would vouch for every signature, including one made outside the migrations that nobody has read:');
    for (const o of d.overloaded) out.push(`  ${o.name}: ${o.sigs.map((x) => `(${x.args})${x.trigger ? ' [trigger]' : x.anon ? ' [anon-executable]' : ''}`).join(' and ')}`);
    out.push('Rename or drop the extra signature. The migrations hold no overload, and tests/definer-grants.test.mjs fails on one.');
  }
  if (d.unregisteredPins.length) {
    out.push('', 'search_path does not end in pg_temp, and is not a registered pin finding:');
    for (const n of d.unregisteredPins) out.push(`  ${n}`);
    out.push('Fix with `alter function public.<name>(<args>) set search_path = public, pg_temp;`, or register it in registeredPinFindings.');
  }
  if ((d.awaitingApply ?? []).length) out.push('', `Fixed in a migration, not applied live yet (counted as before until it is): ${d.awaitingApply.join(', ')}`);
  if ((d.appliedLive ?? []).length) out.push('', `${strict ? 'APPLIED (delete from fixedAfterCapture)' : 'Applied live (delete from fixedAfterCapture, or pass --strict to fail on this)'}: ${d.appliedLive.join(', ')}`);
  if (d.stale.length) out.push('', `${strict ? 'STALE' : 'Stale (not anon-executable live any more; delete the entry, or pass --strict to fail on this)'}: ${d.stale.join(', ')}`);
  if (d.stalePins.length) out.push('', `${strict ? 'STALE PIN FINDINGS' : 'Stale pin findings (pinned live now)'}: ${d.stalePins.join(', ')}`);
  return out.join('\n');
}

/** CLI body with injectable I/O so a test can drive it. Returns the exit status. */
export function main(argv, { stdin, out = (s) => console.log(s), err = (s) => console.error(s) } = {}) {
  const arg = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const strict = argv.includes('--strict');
  let allow;
  try { allow = JSON.parse(fs.readFileSync(arg('--allowlist') ?? DEFAULT_ALLOWLIST, 'utf8')); } catch (e) { err(`definer-live-diff: cannot read the allow-list: ${e.message}`); return 2; }
  let rows;
  try { rows = parseRows(stdin); } catch (e) { err(`definer-live-diff: ${e.message}`); return 2; }
  const d = diffLive(rows, allow);
  const code = verdict(d, { strict });
  (code ? err : out)(report(d, { strict }));
  return code;
}

if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(new URL(process.argv[1], 'file:'))).href) {
  process.exit(main(process.argv.slice(2), { stdin: fs.readFileSync(0, 'utf8') }));
}
