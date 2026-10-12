// The 2026-10-12 Shape Score review, fixed on the owner's word: "fix all bugs".
// The migration (2026-10-12-shape-score-fixes.sql) was also applied twice to a local
// PostgreSQL 16 scaffold and probed (check-in window, one rank basis, waive refusal,
// snapshot and PR triggers, step close-out, the card as anon); these tests hold the
// source to what was probed, and drive the shipping JS that changed.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadRealModule } from './helpers/load-real-module.mjs'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const SQL = read('supabase-migrations/2026-10-12-shape-score-fixes.sql')

/** `create or replace function public.<name>(` … `$$;` from a migration. */
function fnBody(sql, name) {
  const at = sql.indexOf(`create or replace function public.${name}(`)
  assert.ok(at >= 0, `${name} is not defined`)
  return sql.slice(at, sql.indexOf('$$;', sql.indexOf('as $$', at) + 5) + 3)
}

test('1 · a check-in pays for this week\'s or last week\'s Monday, exactly two keys', () => {
  // A date RANGE accepted fifteen keys, and client_checkins is owner-writable (Codex P1, #2314).
  const body = fnBody(SQL, 'award_checkin_points')
  assert.match(body, /v_monday := date_trunc\('week', v_today\)::date;/)
  assert.match(body, /if p_week_of <> v_monday and p_week_of <> v_monday - 7 then return; end if;/)
  assert.ok(body.indexOf('v_monday - 7') < body.indexOf('insert into public.score_ledger'), 'the keys are checked before the award')
  assert.doesNotMatch(body, /v_today - 13/)
})

test('6 · the app\'s meal award reports a meal the snapshot trigger paid, and only that one', () => {
  // The meal-log route's write fires the trigger before the app calls award_meal_log, so the
  // RPC's insert finds the row and the app's "+10" never showed (Codex, #2314).
  const prev = fnBody(read('supabase-migrations/2026-10-11-dietary-kcal.sql'), 'award_meal_log')
  const next = fnBody(SQL, 'award_meal_log')
  const block = /\n  -- ⚠ THE SNAPSHOT TRIGGER MAY HAVE PAID IT A MOMENT AGO[\s\S]*?\n  end if;\n/
  assert.match(next, block)
  assert.equal(next.replace(block, '\n'), prev, 'only the trigger-awarded check is added')
  assert.match(next, /and l\.earned_at = d\.updated_at/, 'the same write\'s transaction stamp, not a time window')
})

test('2 · one rank basis: the unlock, the card, the avatars and the boards', () => {
  const rank = fnBody(SQL, 'shape_rank_points')
  assert.match(rank, /not in \('store_redeem', 'tier_bonus'\)/)
  assert.match(rank, /max\(greatest\(r\.running, 0\)\)/, 'high-water: the tier never demotes')
  assert.doesNotMatch(rank, /security definer/, 'an invoker, called only from inside the definers')
  assert.match(SQL, /revoke execute on function public\.shape_rank_points\(uuid\) from public, anon, authenticated;/)
  assert.match(fnBody(SQL, 'award_tier_bonuses'), /v_base := public\.shape_rank_points\(v_uid\);/)
  assert.match(fnBody(SQL, 'get_user_points'), /public\.shape_rank_points\(u\.id\)/)
  for (const fn of ['shape_leaderboard', 'shape_leaderboard_me']) {
    assert.match(fnBody(SQL, fn), /and coalesce\(l\.source_kind, ''\) not in \('store_redeem', 'tier_bonus'\)/, fn)
  }
})

test('2 · the restated card and boards change only the points, nothing else', () => {
  // get_public_profile carries the visibility rules (L17, friends tier); a restatement
  // that drifted from 2026-10-10 would reopen them. Everything but the pts CTE must match.
  const prev = fnBody(read('supabase-migrations/2026-10-10-security-review-lows-and-anon-definers.sql'), 'get_public_profile')
  const next = fnBody(SQL, 'get_public_profile')
  const dropPts = (b) => b.replace(/with pts as \([\s\S]*?\n  \),/, 'with pts as (…),')
  assert.equal(dropPts(next), dropPts(prev))
  assert.match(next, /select public\.shape_rank_points\(p_user_id\) as points/)
  const orig = read('supabase-migrations/2026-05-31-score-and-leaderboard.sql')
  for (const fn of ['shape_leaderboard', 'shape_leaderboard_me']) {
    const strip = (b) => b.replace(/\n\s+and coalesce\(l\.source_kind, ''\) not in \('store_redeem', 'tier_bonus'\)/, '').replace('set search_path = public, pg_temp', 'set search_path = public')
    assert.equal(strip(fnBody(SQL, fn)), fnBody(orig, fn), `${fn} drifted from its original`)
  }
})

test('4 · a new record earns +12 again, on the original bucket', () => {
  const body = fnBody(SQL, 'award_pr_wall_post')
  assert.match(body, /md5\('pr_wall:' \|\| new\.user_id::text \|\| ':' \|\| lower\(new\.lift_key\) \|\| ':' \|\| to_char\(now\(\), 'YYYY-MM'\)\)::uuid,\n\s+12,/)
  assert.match(body, /if tg_op = 'UPDATE' and new\.best_value is not distinct from old\.best_value then return new; end if;/)
  assert.match(SQL, /after insert or update of best_value on public\.pr_wall_posts/)
  // the bucket is the one the original award used
  assert.match(read('supabase-migrations/2026-06-18-score-ledger-awards.sql'), /md5\('pr_wall:' \|\| v_uid::text \|\| ':' \|\| lower\(v_lift\) \|\| ':' \|\| to_char\(now\(\), 'YYYY-MM'\)\)::uuid/)
})

test('5 · a coach waives penalties, not purchases', () => {
  const body = fnBody(SQL, 'waive_penalty')
  assert.match(body, /if p_source_kind not like 'penalty\\_%' escape '\\' or p_source_kind = 'penalty_waive' then\n\s+return jsonb_build_object\('waived', false, 'reason', 'not_a_penalty'\);/)
  assert.ok(body.indexOf("'not_a_penalty'") < body.indexOf('insert into public.score_ledger'))
})

test('6 · the snapshot trigger pays with the RPCs\' own keys, so a day pays once', () => {
  const trig = fnBody(SQL, 'award_from_daily_snapshot')
  const workoutRpc = read('supabase-migrations/2026-07-06-award-day-timezone-clamp.sql')
  const mealRpc = read('supabase-migrations/2026-10-11-dietary-kcal.sql')
  assert.match(workoutRpc, /md5\('workout_session:'\|\|v_uid::text\|\|':'\|\|v_day::text\)::uuid, 10, 'Workout session'/)
  assert.match(trig, /md5\('workout_session:' \|\| new\.user_id::text \|\| ':' \|\| new\.snapshot_date::text\)::uuid, 10, 'Workout session'/)
  assert.match(mealRpc, /md5\('meal_log:' \|\| v_uid::text \|\| ':' \|\| v_day::text\)::uuid, 10, 'Meal logged'/)
  assert.match(trig, /md5\('meal_log:' \|\| new\.user_id::text \|\| ':' \|\| new\.snapshot_date::text\)::uuid, 10, 'Meal logged'/)
  // the same gates the RPCs use: minutes for a workout, food (not burn) for a meal
  assert.match(trig, /if coalesce\(new\.workout_minutes, 0\) > 0 then/)
  assert.match(trig, /if coalesce\(new\.dietary_kcal, 0\) > 0 or coalesce\(new\.protein_g, 0\) > 0\n\s+or coalesce\(new\.carbs_g, 0\) > 0 or coalesce\(new\.fat_g, 0\) > 0 then/)
  assert.doesNotMatch(trig, /new\.calories/, 'a device burn is not a meal')
  // today or yesterday in the member's zone; a day either side of UTC when unknown
  assert.match(trig, /if new\.snapshot_date > v_latest or new\.snapshot_date < v_today - 1 then/)
  assert.match(SQL, /after insert or update of workout_minutes, dietary_kcal, protein_g, carbs_g, fat_g\n\s+on public\.daily_health_snapshot/)
  assert.match(SQL, /revoke execute on function public\.award_from_daily_snapshot\(\) from public, anon, authenticated;/)
})

test('7 · steps close out on the member\'s own day, or a day later when the zone is unknown', () => {
  const body = fnBody(SQL, 'award_step_points')
  assert.match(body, /v_today := case when v_tz is not null then \(now\(\) at time zone v_tz\)::date\n\s+else \(now\(\) at time zone 'utc'\)::date - 1 end;/)
  assert.match(body, /and snapshot_date <  v_today/)
})

test('3 · the score routes read every ledger row, a page at a time', async () => {
  const require_ = createRequire(join(ROOT, 'package.json'))
  const { readAllLedgerRows } = await loadRealModule(join(ROOT, 'src/lib/score-ledger-read.ts'), { typescript: true, registry: new Map() })
  const all = Array.from({ length: 2345 }, (_, i) => ({ delta: 1, i }))
  const ranges = []
  const client = {
    from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ order: () => ({
        // the API's row cap: a page never holds more than 1,000 rows
        range: async (from, to) => { ranges.push([from, to]); return { data: all.slice(from, Math.min(to + 1, from + 1000)), error: null } },
      }) }) }) }),
    }),
  }
  const { rows, error } = await readAllLedgerRows(client, 'u', 'delta')
  assert.equal(error, null)
  assert.equal(rows.length, 2345, 'every row, not the first 1,000')
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]])
  void require_
  for (const f of ['src/app/api/client/score/route.ts', 'src/app/api/client/score-record/route.ts']) {
    const src = read(f)
    assert.match(src, /readAllLedgerRows/, `${f} reads the ledger through the pager`)
    assert.doesNotMatch(src, /\.from\('score_ledger'\)\s*\n\s*\.select\('category, delta, (note, )?earned_at, source_kind'\)\s*\n\s*\.eq\('user_id', user\.id\);/, `${f} still reads the ledger in one capped select`)
  }
})

test('8 · the activities route reports the points the ledger holds, not the formula', async () => {
  const require_ = createRequire(join(ROOT, 'package.json'))
  const run = async ({ ledgerRow }) => {
    const client = {
      from: (table) => {
        if (table === 'activities') return { insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'act-1', source: 'manual', activity_type: 'run', title: 'run', started_at: '2026-10-12T10:00:00Z', duration_min: 100 }, error: null }) }) }) }
        if (table === 'score_ledger') return { select: () => ({ eq: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: ledgerRow, error: null }) }) }) }) }) }
        throw new Error('unexpected table ' + table)
      },
      rpc: async () => ({ data: null, error: null }),
    }
    const route = await loadRealModule(join(ROOT, 'src/app/api/client/activities/route.ts'), {
      typescript: true,
      registry: new Map([
        ['next/server', require_('next/server')],
        ['@/lib/request-auth', { currentUser: async () => ({ id: 'u-1' }), clientForRequest: async () => client }],
        ['@/lib/request-utils', { readJson: async (req) => ({ ok: true, data: await req.json() }), dbError: () => new Response('err', { status: 500 }) }],
        ['@/lib/require-membership', { requireMembership: async () => null }],
      ]),
    })
    const res = await route.POST(new Request('https://shape.test/api/client/activities', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ activityType: 'run', durationMin: 100 }) }))
    return res.json()
  }
  assert.equal((await run({ ledgerRow: { delta: 20 } })).pointsAwarded, 20)
  assert.equal((await run({ ledgerRow: null })).pointsAwarded, 0, 'the cap wrote nothing, so nothing is reported')
})

test('9 · the Score page\'s rank excludes tier bonuses, in both mirrors', () => {
  for (const f of ['src/lib/score-derive.ts', 'mobile-app/src/services/scoreDerive.mjs']) {
    assert.match(read(f), /if \(r\.source_kind !== 'store_redeem' && r\.source_kind !== 'tier_bonus'\) \{/, f)
  }
  const route = read('src/app/api/client/score/route.ts')
  assert.match(route, /if \(r\.source_kind === 'store_redeem' \|\| r\.source_kind === 'tier_bonus'\) continue;/, 'week and month are on the rank basis too')
})

test('6 · the website fires the visit awards the app fires', () => {
  const src = read('public/newdesign/globalChatButton.js')
  assert.match(src, /Promise\.all\(\[quiet\(cl\.rpc\("award_step_points"\)\), quiet\(cl\.rpc\("award_momentum_bonus"\)\)\]\)\n\s+\.then\(function \(\) \{ return quiet\(cl\.rpc\("award_tier_bonuses"\)\); \}\);/)
})
