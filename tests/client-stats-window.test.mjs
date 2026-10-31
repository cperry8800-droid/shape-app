// The coach's client stats count seven days as seven (the War Room's item from #2532:
// "get_client_stats counts days logged from current_date - 7, eight dates").
//
// 2026-10-31-client-stats-window.sql was run on a local PostgreSQL 16.15 scaffold after the
// 2026-10-11 definition and probed, as the client's coach:
//   - a member in Tokyo who logged 2,000 kcal on each of their last 10 days, and 1,000 on a row
//     dated their tomorrow: daysLogged7d 10 → 7, daysLogged30d 11 → 10, avgCalories 1,900 → 2,000
//     (tomorrow's row left out), workoutMinutes30d 990 → 900 (30 minutes on each of 30 days);
//   - a member with no zone who logged every UTC day of the last 40, alternating 1,800 and 2,200:
//     daysLogged7d 8 → 7, daysLogged30d 31 → 30, avgCalories 2,000 → 1,971 (the last 7 days);
//   - anyone not on the client's team still reads null; applied twice; the guard raises on the
//     2026-10-11 body and passes as shipped.
// These tests hold the source to what was probed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SQL = read('supabase-migrations/2026-10-31-client-stats-window.sql');
const fn = (src) => {
  const at = src.indexOf('create or replace function public.get_client_stats(p_user_id uuid)');
  assert.ok(at >= 0, 'get_client_stats is not defined');
  return src.slice(at, src.indexOf('$$;', at) + 3);
};
const BODY = fn(SQL);
const OLD = fn(read('supabase-migrations/2026-10-11-dietary-kcal.sql'));

test("every window ends on the member's own today and holds exactly its days", () => {
  assert.match(BODY, /v_today := coalesce\(\(now\(\) at time zone public\.shape_user_tz\(p_user_id\)\)::date, current_date\);/);
  // Days logged, 7 and 30.
  assert.match(BODY, /select count\(\*\) filter \(where snapshot_date between v_today - 6 and v_today\),\n\s+count\(\*\) filter \(where snapshot_date between v_today - 29 and v_today\)\n\s+into v_days7, v_days30/);
  // Average intake and macros over the same 7.
  assert.match(BODY, /and dietary_kcal is not null\n\s+and snapshot_date between v_today - 6 and v_today;/);
  // Workout minutes over 30.
  assert.match(BODY, /into v_min_30\n\s+from public\.daily_health_snapshot\n\s+where user_id = p_user_id\n\s+and snapshot_date between v_today - 29 and v_today;/);
  assert.doesNotMatch(BODY, /current_date - (7|30)\b/, 'an eight- or 31-date window is left');
  assert.doesNotMatch(BODY, /snapshot_date >=/, 'a window with no end counts a day ahead');
});

test('the rest of the function is the 2026-10-11 definition, unchanged', () => {
  // The coach gate comes first, and the zone is read only after it.
  const gate = BODY.indexOf('if not public.is_coach_on_client(p_user_id) then\n    return null;');
  assert.ok(gate > 0, 'the coach gate is gone');
  assert.ok(BODY.indexOf('v_today := ') > gate, "the member's zone is read before the coach gate");
  // Strip the comments and put back the old windows: what is left is the old body.
  const strip = (s) => s.replace(/--[^\n]*/g, '').replace(/\n\s*\n/g, '\n').trim();
  const back = strip(BODY)
    .replace(/\n\s+v_today date;/, '')
    .replace(/\n\s+v_today := [^\n]*/, '')
    .replace('and snapshot_date between v_today - 29 and v_today;', 'and snapshot_date >= (current_date - 30);')
    .replace('filter (where snapshot_date between v_today - 6 and v_today)', 'filter (where snapshot_date >= current_date - 7)')
    .replace('filter (where snapshot_date between v_today - 29 and v_today)', 'filter (where snapshot_date >= current_date - 30)')
    .replace('and snapshot_date between v_today - 6 and v_today;', 'and snapshot_date >= current_date - 7;');
  assert.equal(back, strip(OLD));
});

test('a pinned definer whose grants create or replace keeps, and a guard that checks the windows', () => {
  assert.match(BODY, /security definer\nset search_path = public, pg_temp/);
  assert.doesNotMatch(SQL.replace(/--[^\n]*/g, ''), /\b(grant|revoke)\b/i, 'no grant is widened or narrowed');
  assert.match(SQL, /raise exception 'get_client_stats lost its coach gate'/);
  assert.match(SQL, /if v_src like '%current_date - 7%' or v_src like '%current_date - 30%'\n\s+or v_src not like '%snapshot_date between v_today - 6 and v_today%' then\n\s+raise exception 'get_client_stats still counts eight days as seven';/);
  assert.match(SQL, /^begin;\n/m);
  assert.match(SQL, /\ncommit;\n$/);
});
