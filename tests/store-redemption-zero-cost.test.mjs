// A free tier reward writes a redemption at ZERO points. The table has to admit
// that — and the CATALOGUE must not.
//
// This exact contradiction shipped and sat live: 2026-06-08-store-redemptions.sql
// declared `check (cost_points > 0)` while 2026-07-20-tier-rewards.sql's
// claim_tier_reward inserted a literal 0. Every tier reward — merch and voucher
// alike — raised 23514, which falls past every named branch in
// /api/store/tier-rewards and surfaces as a generic 500 "Claim failed."
// Unreachable only because score_ledger is empty (no member has points, so no
// unlock is ever minted); it would have gone live with the first Tempo member.
//
// The fix is bounded, and BOTH halves of the boundary are pinned here:
//   store_redemptions  must admit 0  — or a free claim cannot be written
//   store_catalogue    must stay > 0 — or a PAID item could price at nothing
// Over-applying the relax to the catalogue is the dangerous direction, which is
// why it is asserted rather than assumed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), '..', 'supabase-migrations');
const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort();
const text = new Map(files.map((f) => [f, readFileSync(join(MIGRATIONS, f), 'utf8')]));

// Strip comments so a file that DESCRIBES the old constraint (this fix's own
// header quotes it verbatim) is never read as declaring it.
const bare = (sql) => sql.replace(/--[^\n]*/g, '');

// Split a parenthesised list on top-level commas.
function topLevel(list) {
  const out = [];
  let depth = 0, cur = '', quote = null;
  for (const ch of list) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '"') { quote = ch; cur += ch; continue; }
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

// Read the balanced (...) starting at `from`.
function paren(sql, from) {
  const start = sql.indexOf('(', from);
  if (start === -1) return null;
  let depth = 0, quote = null;
  for (let i = start; i < sql.length; i++) {
    const ch = sql[i];
    if (quote) { if (ch === quote) quote = null; continue; }
    if (ch === "'" || ch === '$') { if (ch === "'") quote = ch; continue; }
    if (ch === '(') depth++;
    else if (ch === ')') { depth--; if (depth === 0) return { body: sql.slice(start + 1, i), end: i }; }
  }
  return null;
}

// Every cost_points CHECK, attributed to the table it is actually on.
function checksFor(table) {
  const found = [];
  for (const [file, sql] of text) {
    const s = bare(sql);
    // create table … ( … cost_points … check (cost_points <op> 0) … )
    const create = new RegExp(`create table[^;]*?public\\.${table}\\s*\\(`, 'i').exec(s);
    if (create) {
      const block = paren(s, create.index + create[0].length - 1);
      const m = block && /cost_points[^,]*check\s*\(\s*cost_points\s*(>=|>)\s*0\s*\)/i.exec(block.body);
      if (m) found.push({ file, op: m[1], via: 'create table' });
    }
    // alter table … add constraint … check (cost_points <op> 0)
    for (const a of s.matchAll(new RegExp(`alter table[^;]*?public\\.${table}[\\s\\S]*?check\\s*\\(\\s*cost_points\\s*(>=|>)\\s*0\\s*\\)`, 'gi'))) {
      found.push({ file, op: a[1], via: 'alter table' });
    }
  }
  return found;
}

// Spans of `do $tag$ … $tag$` — a migration's own structural guard may write a
// throwaway 0-cost probe row (this fix's does). Counting that as a "writer"
// would make the guard self-fulfilling: it would keep demanding the relax even
// after the real writer stopped needing it. Function bodies are NOT excluded —
// those are the real writers.
function guardSpans(s) {
  const spans = [];
  for (const m of s.matchAll(/\bdo\s+(\$[a-z_]*\$)/gi)) {
    const tag = m[1];
    const close = s.indexOf(tag, m.index + m[0].length);
    if (close !== -1) spans.push([m.index, close + tag.length]);
  }
  return spans;
}

// Migrations that write a redemption whose cost_points value is a literal 0.
function zeroCostWriters() {
  const out = [];
  for (const [file, sql] of text) {
    const s = bare(sql);
    const skip = guardSpans(s);
    for (const m of s.matchAll(/insert\s+into\s+public\.store_redemptions/gi)) {
      if (skip.some(([a, b]) => m.index > a && m.index < b)) continue;
      const cols = paren(s, m.index + m[0].length);
      if (!cols) continue;
      const names = topLevel(cols.body).map((c) => c.trim().toLowerCase());
      const idx = names.indexOf('cost_points');
      if (idx === -1) continue;
      const vKey = /\bvalues\b/i.exec(s.slice(cols.end));
      if (!vKey) continue;
      const vals = paren(s, cols.end + vKey.index + vKey[0].length);
      if (!vals) continue;
      const v = topLevel(vals.body)[idx];
      if (v !== undefined && /^0$/.test(v.trim())) out.push({ file, value: v.trim() });
    }
  }
  return out;
}

test('a zero-cost redemption writer requires a table that admits zero', () => {
  const writers = zeroCostWriters();
  assert.ok(
    writers.length > 0,
    'no migration writes a 0-cost redemption any more — if free tier rewards were priced, this guard and the >= 0 relax can both go',
  );

  const checks = checksFor('store_redemptions');
  assert.ok(checks.length > 0, 'found no cost_points CHECK on store_redemptions — the parser is broken, not the schema');

  // The LAST declaration wins in the DB. A file that re-tightens it after the
  // relax would silently break every free claim again.
  const last = checks[checks.length - 1];
  assert.equal(
    last.op,
    '>=',
    `store_redemptions.cost_points is left at "${last.op} 0" by ${last.file}, but ${writers[0].file} writes a redemption at 0 — every tier reward claim would raise 23514 and surface as a generic 500`,
  );
});

test('the paid path keeps its own floor — the relax must not reach the catalogue', () => {
  const checks = checksFor('store_catalogue');
  assert.ok(checks.length > 0, 'found no cost_points CHECK on store_catalogue — the parser is broken, not the schema');
  const last = checks[checks.length - 1];
  assert.equal(
    last.op,
    '>',
    `store_catalogue.cost_points was relaxed to "${last.op} 0" by ${last.file} — a PAID item could then price at nothing. Only store_redemptions may admit 0.`,
  );
});
