// add_hydration's NaN guard (2026-10-11-add-hydration-nan-guard.sql). The water
// quick-add rejected a bad delta with `p_delta <> p_delta`, but a numeric NaN
// EQUALS itself in Postgres, so NaN and Infinity were stored. Measured on a local
// PostgreSQL 16 before the fix (NaN and Infinity written) and after it (both
// refused, the stored ones cleared, a normal add and an undo unchanged).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SQL = readFileSync(join(import.meta.dirname, '..', 'supabase-migrations', '2026-10-11-add-hydration-nan-guard.sql'), 'utf8');
const at = SQL.indexOf('create or replace function public.add_hydration(p_delta numeric, p_date date)');
const open = SQL.indexOf('$$', at);
const HEAD = SQL.slice(at, open);
const BODY = SQL.slice(open + 2, SQL.indexOf('$$', open + 2));
const CODE = BODY.replace(/--[^\n]*/g, '');

test('the guard tests the value: NaN, Infinity and -Infinity are refused', () => {
  assert.ok(at >= 0, 'add_hydration is not redefined with its own signature (the grants ride on it)');
  assert.match(CODE, /if p_delta is null or p_delta in \('NaN', 'Infinity', '-Infinity'\) then raise exception 'invalid delta'; end if;/);
  assert.doesNotMatch(CODE, /p_delta <> p_delta/, '`x <> x` is false for a numeric NaN, so it guards nothing');
});

test('everything else in the function is kept', () => {
  assert.match(HEAD, /security definer\s+set search_path = public, pg_temp/);
  assert.match(CODE, /if v_uid is null then raise exception 'not authenticated'; end if;/);
  assert.match(CODE, /values \(v_uid, p_date, greatest\(0, round\(p_delta, 3\)\)\)/);
  assert.match(CODE, /set hydration_l = greatest\(0, round\(coalesce\(d\.hydration_l, 0\) \+ p_delta, 3\)\)/, 'a negative delta (undo) still clamps at 0');
  assert.doesNotMatch(SQL, /grant execute on function public\.add_hydration/, 'create or replace keeps the grant; nothing is widened');
});

test('the values the broken guards let through are cleared, and the guard checks it', () => {
  for (const col of ['hydration_l', 'protein_g', 'carbs_g', 'fat_g']) {
    assert.match(SQL, new RegExp(`${col}\\s+= case when ${col}\\s+in \\('NaN', 'Infinity'\\) then null else ${col}\\s+end`), `${col} is not cleared`);
  }
  assert.match(SQL, /raise exception 'add_hydration is not the pinned definer with the value-based NaN guard'/);
  assert.match(SQL, /raise exception 'a NaN or Infinity is still stored in daily_health_snapshot'/);
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
});
