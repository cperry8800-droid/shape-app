// Calories eaten and calories burned, separated (owner, 2026-10-11: "Separate
// calories eaten from calories burned").
//
// daily_health_snapshot.calories meant two things: meal logs ADDED to it, and the
// device syncs (Garmin dailies, Oura, Apple Health) OVERWROTE it with active
// kilocalories. 2026-10-11-dietary-kcal.sql gives calories eaten their own column,
// `dietary_kcal`, and leaves `calories` to the devices. What is pinned here:
//   · the migration: the column, a backfill that moves only untagged (meal-log)
//     rows, add_meal_macros writing dietary_kcal (with a NaN guard that works),
//     the four SQL readers of calories eaten moved over, and its guard;
//   · every app reader of calories EATEN reads dietary_kcal, never `calories`.
// The SQL was run on a local PostgreSQL 16, applied twice (see the PR).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = join(import.meta.dirname, '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const SQL = read('supabase-migrations/2026-10-11-dietary-kcal.sql');

// The body of one `create or replace function public.<name>(` in the migration.
function fnBody(name) {
  const at = SQL.indexOf(`create or replace function public.${name}(`);
  assert.ok(at >= 0, `${name} is not redefined in the migration`);
  const open = SQL.indexOf('$$', at);
  const close = SQL.indexOf('$$', open + 2);
  return { head: SQL.slice(at, open), body: SQL.slice(open + 2, close) };
}

test('the migration adds dietary_kcal and moves only meal-log rows into it', () => {
  assert.match(SQL, /add column if not exists dietary_kcal integer\s+check \(dietary_kcal is null or dietary_kcal >= 0\)/);
  // A row no device wrote (no sources.calories tag) holds meal calories: moved, and cleared.
  assert.match(SQL, /set dietary_kcal = calories,\s+calories = null\s+where dietary_kcal is null\s+and calories is not null\s+and not \(coalesce\(sources, '\{\}'::jsonb\) \? 'calories'\)/);
  // A device row a meal was logged onto after the sync: the excess over the
  // device's own reading (health_metric_observations) is the meal, and the burn
  // goes back to the reading. It runs before the macros fallback.
  const recover = SQL.indexOf('from public.health_metric_observations o');
  const fallback = SQL.indexOf('-- Other device rows with logged macros');
  assert.ok(recover > 0 && fallback > recover, 'the recovery from the device reading must run before the macros fallback');
  assert.match(SQL, /set dietary_kcal = d\.calories - round\(o\.value\)::integer,\s+calories\s+= round\(o\.value\)::integer/);
  assert.match(SQL, /and o\.metric = 'calories'\s+and o\.source = d\.sources->>'calories'\s+and d\.calories > round\(o\.value\);/, 'only the reading of the source that tagged the row, and only a real excess');
  // A device row keeps its burn; its eaten calories come from the logged macros.
  assert.match(SQL, /set dietary_kcal = round\(4 \* coalesce\(protein_g, 0\) \+ 4 \* coalesce\(carbs_g, 0\) \+ 9 \* coalesce\(fat_g, 0\)\)::integer\s+where dietary_kcal is null\s+and \(coalesce\(sources, '\{\}'::jsonb\) \? 'calories'\)/);
  assert.doesNotMatch(SQL, /update public\.daily_health_snapshot\s+set calories = (?!null)/, 'the migration never writes a value into a device\'s burn');
});

test('a meal log writes calories eaten and never touches the burn', () => {
  const { head, body } = fnBody('add_meal_macros');
  assert.match(head, /p_kcal numeric, p_protein numeric, p_carbs numeric, p_fat numeric, p_hydration numeric, p_date date/, 'the signature is unchanged, so the grants carry over');
  assert.match(head, /security definer\s+set search_path = public, pg_temp/);
  assert.match(body, /if v_uid is null then raise exception 'not authenticated'; end if;/);
  assert.match(body, /\(user_id, snapshot_date, dietary_kcal, protein_g, carbs_g, fat_g, hydration_l\)/);
  assert.match(body, /dietary_kcal = case when p_kcal\s+is null then d\.dietary_kcal\s+else coalesce\(d\.dietary_kcal, 0\) \+ p_kcal\s+end/);
  assert.doesNotMatch(body.replace(/--[^\n]*/g, ''), /\bcalories\b/, 'add_meal_macros must not write the device column');
});

test('the NaN guard compares against the value: a numeric NaN equals itself in Postgres', () => {
  const { body } = fnBody('add_meal_macros');
  for (const p of ['p_kcal', 'p_protein', 'p_carbs', 'p_fat', 'p_hydration']) {
    assert.match(body, new RegExp(`${p}\\s+:= case when ${p}\\s+is null or ${p}\\s+in \\('NaN', 'Infinity'\\) then null`), `${p} is not guarded against NaN and Infinity`);
  }
  assert.doesNotMatch(body, /p_\w+\s+<> p_\w+/, '`x <> x` is false for a numeric NaN, so it guards nothing');
});

test('the four SQL readers of calories eaten read dietary_kcal, each still a pinned definer', () => {
  const award = fnBody('award_meal_log');
  assert.match(award.body, /coalesce\(d\.dietary_kcal, 0\) > 0 or coalesce\(d\.protein_g, 0\) > 0/, 'a watch\'s burn alone must not earn "Meal logged"');
  assert.doesNotMatch(award.body, /d\.calories/);

  const stats = fnBody('get_client_stats');
  assert.match(stats.body, /where user_id = p_user_id and dietary_kcal is not null;/);
  assert.match(stats.body, /select round\(avg\(dietary_kcal\)\), round\(avg\(protein_g\)\)/);
  assert.match(stats.body, /if not public\.is_coach_on_client\(p_user_id\) then/, 'the coach gate is kept');
  assert.doesNotMatch(stats.body.replace(/--[^\n]*/g, ''), /\bcalories\b/, 'the coach\'s days logged and average intake are calories eaten');

  const momentum = fnBody('compute_momentum');
  assert.match(momentum.body, /s\.dietary_kcal > 0 or s\.calories > 0 or s\.workout_minutes > 0 or s\.sleep_hours > 0/, 'eaten and burned both still mark a day active');

  const funnel = fnBody('get_funnel');
  assert.match(funnel.body, /d\.dietary_kcal is not null or d\.protein_g is not null/);
  assert.doesNotMatch(funnel.body, /d\.calories/);

  for (const f of [award, stats, momentum, funnel]) assert.match(f.head, /security definer\s+set search_path = public, pg_temp/);
  assert.doesNotMatch(SQL, /grant execute on function public\.(award_meal_log|get_client_stats|compute_momentum|get_funnel)/, 'create or replace keeps each grant; none is widened');
});

test('the guard checks the column, the writer, the four readers and the backfill', () => {
  assert.match(SQL, /raise exception 'daily_health_snapshot\.dietary_kcal is missing'/);
  assert.match(SQL, /raise exception 'add_meal_macros is not the pinned definer that writes dietary_kcal'/);
  assert.match(SQL, /p\.proname in \('award_meal_log', 'compute_momentum', 'get_client_stats', 'get_funnel'\)[\s\S]{0,200}p\.prosrc like '%dietary_kcal%'\s+\) <> 4 then/);
  assert.match(SQL, /raise exception 'a meal-log row still holds its calories in daily_health_snapshot\.calories'/);
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
});

// ── The app's readers of calories EATEN ──

test('the member\'s own numbers read calories eaten', () => {
  const analytics = read('src/app/api/client/analytics/route.ts');
  assert.match(analytics, /\.select\('snapshot_date, sleep_hours, protein_g, dietary_kcal, /);
  assert.match(analytics, /cal: todaySnap\?\.dietary_kcal != null \? Math\.round\(Number\(todaySnap\.dietary_kcal\)\) : null,/);

  const nutrition = read('src/app/api/client/nutrition/route.ts');
  assert.match(nutrition, /\.select\('snapshot_date, dietary_kcal, protein_g, carbs_g, fat_g, hydration_l'\)/);
  assert.match(nutrition, /logged: s\.dietary_kcal != null,/);
  assert.doesNotMatch(nutrition, /s\.calories|latest\.calories/);

  const progress = read('src/app/api/client/progress/route.ts');
  assert.match(progress, /const kcal = g\('dietary_kcal'\) > 0\s+\? Math\.round\(g\('dietary_kcal'\)\)\s+: Math\.round\(4 \* g\('protein_g'\) \+ 4 \* g\('carbs_g'\) \+ 9 \* g\('fat_g'\)\);/);
  assert.doesNotMatch(progress, /g\('calories'\)|seriesFor\('calories'\)/);

  const score = read('src/app/api/client/score/route.ts');
  assert.match(score, /const logged = last14\.filter\(r => num\(r\.dietary_kcal\) > 0\)\.length;/, 'the nutrition pillar counts meals, not a watch');
  assert.match(score, /num\(r\.dietary_kcal\) > 0 \|\| num\(r\.calories\) > 0 \|\| num\(r\.workout_minutes\) > 0/, 'consistency still counts a synced burn as showing up');
  assert.match(score, /from\('daily_health_snapshot'\)\s*\.select\('\*'\)/, 'the score reads the whole row, so it can tell a skip-only row from data');
});

test('the coach\'s numbers read calories eaten', () => {
  const t = read('src/app/api/trainer/analytics/route.ts');
  const n = read('src/app/api/nutritionist/analytics/route.ts');
  for (const src of [n]) {
    // (`id` is the cursor the rows are paged on: tests/coach-analytics-routes.test.mjs.)
    assert.match(src, /\.select\('id, user_id, snapshot_date, protein_g, dietary_kcal, weight_lb'\)/);
    assert.match(src, /const cals = rows\.map\(\(r\) => r\.dietary_kcal\)/);
    // Codex on #2310: days logged are days with a meal, not every snapshot row.
    assert.match(src, /const loggedDays = rows\.filter\(\(r\) => r\.dietary_kcal != null \|\| r\.protein_g != null\)\.length;/);
    assert.match(src, /totalDaysLogged \+= loggedDays;/);
    assert.match(src, /daysLogged30d: loggedDays,/);
    assert.doesNotMatch(src, /rows\.length/, 'a watch-only row counted as a logged day');
  }
  // ⚠ THEY ARE NOT ONE FILE. #2030 copied the nutritionist route over the trainer's and #2310
  // pinned the copy here, so a trainer's Business dashboard read { isNutritionist: false } for a
  // month (restored 2026-10-13; tests/coach-analytics-routes.test.mjs). The trainer route reads
  // weight, workouts and PRs, and no calories at all.
  assert.notEqual(t, n, 'the trainer analytics route is its own');
  assert.doesNotMatch(t, /calories|dietary_kcal/, 'the trainer roster reads no calories');
  for (const p of ['src/app/api/trainer/console/route.ts', 'src/app/api/nutritionist/console/route.ts']) {
    assert.match(read(p), /stress, calories:dietary_kcal, protein_g,/, `${p}: the console's \`calories\` must be calories eaten`);
  }
  const legs = read('src/lib/coach-client-legs.mjs');
  assert.match(legs, /const kcal = num\(r\.dietary_kcal\);/);
  assert.doesNotMatch(legs, /num\(r\.calories\)/);
  const app = read('mobile-app/src/services/shapeBackend.js');
  assert.match(app, /\.or\('dietary_kcal\.not\.is\.null,protein_g\.not\.is\.null'\)/);
  assert.match(app, /kcal: num\(r\.dietary_kcal\),\s+kcalTarget: target\.kcal,/);
});

test('Nora and the correlations read calories eaten', () => {
  const reads = read('src/lib/ai/memberReads.mjs');
  assert.match(reads, /select\('snapshot_date, dietary_kcal, protein_g,/);
  assert.match(reads, /avgKcal: Math\.round\(avg\(logged\.map\(\(r\) => num\(r\.dietary_kcal\)\)\)\)/);
  const chat = read('src/app/api/support/chat/route.ts');
  assert.match(chat, /select\('dietary_kcal, protein_g, workout_minutes'\)/);
  assert.match(chat, /if \(snap\.dietary_kcal != null\) todayFacts\.kcal = Number\(snap\.dietary_kcal\);/);
  const actions = read('src/lib/ai/actions.mjs');
  assert.match(actions, /\.select\('dietary_kcal, protein_g, carbs_g, fat_g, hydration_l'\)/);
  assert.match(actions, /\.update\(\{ dietary_kcal: eaten\(b\), protein_g:/);
  const corr = read('src/lib/correlations.mjs');
  assert.match(corr, /export const SNAPSHOT_COLUMN = \{ calories: 'dietary_kcal' \};/);
});
