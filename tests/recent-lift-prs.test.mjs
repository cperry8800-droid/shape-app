// get_my_recent_lift_prs (2026-10-25-my-recent-lift-prs.sql): the profile feed's newest PRs.
//
// get_my_lift_prs ranks every move's best by load and clamps its limit to 100, so a member
// with more than 100 distinct moves who set a new best on a light move had it cut before
// /api/client/progress could sort by date (Codex P2 on #2445). The new function computes
// the same per-move bests and orders them by date BEFORE its limit. It is a copy of
// get_my_lift_prs's body, so this guard holds the two equal except for that last ORDER BY:
// a fix to one that misses the other fails here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(join(ROOT, f), 'utf8');
const RECENT = read('supabase-migrations/2026-10-25-my-recent-lift-prs.sql');
const HEAVY = read('supabase-migrations/2026-06-26-my-lift-prs.sql');

// The function from `create or replace` to its closing `$$;`, split at its final ORDER BY.
function fn(sql, name) {
  const at = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(at >= 0, `${name} is not created`);
  const def = sql.slice(at, sql.indexOf('$$;', at) + 3);
  const cut = def.lastIndexOf('\n  order by ');
  return { def, head: def.slice(0, cut), tail: def.slice(cut) };
}
const heavy = fn(HEAVY, 'get_my_lift_prs');
const recent = fn(RECENT, 'get_my_recent_lift_prs');

test('the new function is get_my_lift_prs with only its name, default and final ORDER BY changed', () => {
  const same = (s) => s
    .replace('get_my_recent_lift_prs(p_limit int default 6)', 'get_my_lift_prs(p_limit int default 12)')
    .replace('set search_path = public, pg_temp\n', 'set search_path = public\n');
  assert.equal(same(recent.head), heavy.head, 'the per-move bests are computed differently from get_my_lift_prs');
  assert.equal(heavy.tail, '\n  order by load_lb desc\n  limit greatest(1, least(coalesce(p_limit, 12), 100));\n$$;');
  assert.equal(recent.tail, '\n  order by best_at desc, load_lb desc\n  limit greatest(1, least(coalesce(p_limit, 6), 100));\n$$;',
    'the newest bests are ordered by date before the limit, so none is cut for being light');
});

test('the migration is self-scoped, idempotent and closed to anon', () => {
  assert.match(recent.def, /returns table \(move text, best numeric, best_reps int, unit text, best_at timestamptz\)/, 'the rows have get_my_lift_prs\'s shape');
  assert.match(recent.def, /security definer\nset search_path = public, pg_temp\n/, 'pinned, as a new definer must be');
  assert.match(recent.def, /where sl\.client_id = auth\.uid\(\)/, 'a caller reads only their own sets');
  assert.doesNotMatch(recent.def, /p_user|user_id\s+uuid/, 'no caller-chosen user');
  assert.ok(RECENT.includes('revoke execute on function public.get_my_recent_lift_prs(int) from public, anon;'));
  assert.ok(RECENT.includes('grant execute on function public.get_my_recent_lift_prs(int) to authenticated;'));
  assert.doesNotMatch(RECENT, /\b(drop|alter|insert|update|delete)\b/i, 'nothing but the function and its grants');
});

test('the progress route asks both functions and lets the newest come from the new one', () => {
  const route = read('src/app/api/client/progress/route.ts');
  assert.match(route, /rpcPrs\('get_my_lift_prs', 100\), rpcPrs\('get_my_recent_lift_prs', 6\)/);
  assert.match(route, /if \(newest\) recentPrs = newest;/);
});
