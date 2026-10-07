// supabase-migrations/2026-10-07-booking-rules-time-off.sql, read statement by statement.
//
// The owner runs migrations by hand in the Supabase SQL editor, sometimes twice, so the file has
// to be safe to replay; and provider_busy_blocks is a SECURITY DEFINER function anon can call,
// so what it RETURNS is the privacy boundary between a coach's private time off and the
// internet. Comments are stripped before anything is matched: the header talks about notes and
// ids at length, and a sentence about a column is not a column.
//
// Verified once against a real PostgreSQL 16 (a throwaway local cluster with Supabase-shaped
// roles; that harness is not checked in): the file applies twice cleanly; anon calling the RPC
// gets exactly (starts_at, ends_at, kind); anon and a stranger read 0 time-off rows and cannot
// write one; the owner reads the note; each CHECK refuses its out-of-range value; a 63-day window
// raises 22023.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { splitStatements } from './helpers/sql-scan.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FILE = 'supabase-migrations/2026-10-07-booking-rules-time-off.sql';
const statements = splitStatements(readFileSync(join(ROOT, FILE), 'utf8'), FILE)
  .map((s) => s.text.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim().toLowerCase());
const find = (re) => statements.filter((s) => re.test(s));
const rpc = () => {
  const [fn] = find(/^create or replace function public\.provider_busy_blocks\(/);
  assert.ok(fn, 'provider_busy_blocks is created');
  return fn;
};

test('the file is safe to run twice', () => {
  assert.ok(statements.length >= 10, `only ${statements.length} statements read`);
  for (const s of find(/^create (table|index|unique index)/)) assert.match(s, /^create (unique )?(table|index) if not exists /, s.slice(0, 80));
  for (const s of find(/^create (function|or replace function)/)) assert.match(s, /^create or replace function /, s.slice(0, 80));
  const policies = find(/^create policy /);
  assert.equal(policies.length, 3);
  for (const p of policies) {
    const [, name, table] = /^create policy ("[^"]+"|\S+) on (\S+)/.exec(p);
    const dropAt = statements.indexOf(`drop policy if exists ${name} on ${table}`);
    assert.ok(dropAt >= 0 && dropAt < statements.indexOf(p), `${name} is dropped before it is created`);
  }
  assert.deepEqual(find(/^(drop table|truncate|delete |update |insert )/), [], 'nothing destructive, nothing seeded');
});

test('both tables are row-level secured; time off is owner-only in every direction, rules are public to read', () => {
  assert.equal(find(/^alter table public\.provider_time_off enable row level security$/).length, 1);
  assert.equal(find(/^alter table public\.provider_booking_rules enable row level security$/).length, 1);
  const off = find(/^create policy \S+ on public\.provider_time_off /);
  assert.equal(off.length, 1, 'one policy on time off');
  assert.match(off[0], / for all to authenticated using \(/);
  assert.doesNotMatch(off[0], /anon|using \(true\)/, 'no public read: the note is private');
  for (const role of ['trainer', 'nutritionist']) {
    assert.ok(off[0].includes(`provider_role = '${role}' and exists`), role);
  }
  assert.ok((off[0].match(/owner_id = auth\.uid\(\)/g) ?? []).length === 4, 'the owner test in USING and in WITH CHECK, both roles');
  const read = find(/^create policy "public_read_booking_rules"/);
  assert.match(read[0], / for select to anon, authenticated using \(true\)$/);
  const write = find(/^create policy "provider_write_booking_rules"/);
  assert.ok((write[0].match(/owner_id = auth\.uid\(\)/g) ?? []).length === 4);
});

test('provider_busy_blocks is a pinned definer that returns when, and nothing about who or why', () => {
  const fn = rpc();
  assert.match(fn, / security definer /);
  assert.match(fn, / set search_path = public, pg_temp as \$\$/);
  assert.match(fn, /returns table \(starts_at timestamptz, ends_at timestamptz, kind text\)/);
  const body = fn.slice(fn.indexOf('$$'));
  // No column but the interval and the kind: no note, no id, no client, no status in the output.
  assert.doesNotMatch(body, /\bnote\b/, 'the time-off note never leaves the table');
  assert.doesNotMatch(body, /\b[os]\.id\b|client_|\btopic\b|\btype\b|meeting_url/);
  const selects = body.match(/select [^;]*? from /g) ?? [];
  assert.ok(selects.length >= 3, 'the outer select and both arms');
  assert.match(body, /select b\.starts_at, b\.ends_at, b\.kind from/);
  // Active sessions only, bounded in time and in rows.
  assert.match(body, /s\.status in \('requested', 'confirmed'\)/);
  assert.match(body, /p_to - p_from > interval '62 days' then raise exception/);
  assert.match(body, /greatest\(p_from, now\(\) - interval '2 days'\)/);
  assert.match(body, /limit 2000;/);
  assert.match(body, /o\.starts_at < p_to and o\.ends_at > v_from/, 'time off overlapping the window');
});

test('anon and authenticated may call it, by name, and PUBLIC may not', () => {
  const sig = 'public.provider_busy_blocks(text, bigint, timestamptz, timestamptz)';
  assert.deepEqual(find(/^revoke /), [`revoke all on function ${sig} from public`]);
  assert.deepEqual(find(/^grant /), [`grant execute on function ${sig} to anon, authenticated`]);
  // ⚠ AND THE DEFINER AUDIT KNOWS WHY: an anon-executable definer with no allow-list entry fails
  // tests/definer-grants.test.mjs, so the entry is part of this change, not an afterthought.
  const allow = JSON.parse(readFileSync(join(ROOT, 'tests/fixtures/definer-anon-allowlist.json'), 'utf8'));
  assert.equal(allow.entries.provider_busy_blocks?.class, 'public-by-design');
  assert.equal(allow.entries.provider_busy_blocks?.anonGrant, 'explicit');
});
