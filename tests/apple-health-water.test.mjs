// Water from Apple Health, added to the glasses logged in Shape (owner, 2026-10-18: "Add them
// together"). The migration (2026-10-18-apple-health-water.sql) was applied twice to a local
// PostgreSQL 16 scaffold with Supabase's default grants and the live add_hydration, and probed:
// a zero reading with none before wrote no row; two glasses (0.50) then Apple Health's 1.2 read
// 1.70; the same reading again changed nothing; a glass after it read 1.95; Apple Health at 1.5
// read 2.25; Apple Health's water deleted (0) left the three glasses, 0.75; a day with no row
// took 0.8; NaN, 25 L, a day 20 back or 5 ahead, and a signed-out call were refused; anon could
// not execute it. These tests hold the source to what was probed, and drive the routes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');
const SQL = read('supabase-migrations/2026-10-18-apple-health-water.sql');
const BODY = SQL.slice(SQL.indexOf('create or replace function public.set_apple_health_water('), SQL.indexOf('$$;') + 3);

test("a sync moves the day's total by the change in Apple Health's own reading", () => {
  assert.match(BODY, /security definer\nset search_path = public, pg_temp/);
  assert.match(BODY, /v_uid uuid := auth\.uid\(\);/);
  assert.match(BODY, /if v_uid is null then raise exception 'not authenticated'; end if;/);
  assert.match(BODY, /p_l in \('NaN', 'Infinity', '-Infinity'\) or p_l < 0 or p_l > 20 then raise exception/);
  assert.match(BODY, /p_date > \(now\(\) at time zone 'utc'\)::date \+ 1 or p_date < \(now\(\) at time zone 'utc'\)::date - 16 then/);
  assert.match(BODY, /if v_prev is null and v_new = 0 then return null; end if;/, 'an empty Apple Health day made a row');
  assert.match(BODY, /for update;\n/, "the day's row is not locked before the reading is compared");
  assert.match(BODY, /if v_prev = v_new then return v_total; end if;/);
  assert.match(BODY, /metric = 'hydration_l' and o\.source = 'apple_health'/);
  assert.match(BODY, /set hydration_l = least\(99\.99, greatest\(0, round\(coalesce\(d\.hydration_l, 0\) - coalesce\(v_prev, 0\) \+ v_new, 2\)\)\)/);
  assert.match(SQL, /revoke all on function public\.set_apple_health_water\(date, numeric\) from public, anon;/);
  assert.match(SQL, /has_function_privilege\('anon', 'public\.set_apple_health_water\(date, numeric\)', 'EXECUTE'\) then\n\s+raise exception/);
});

test('the Apple Health sync sends water through it, never through upsertSnapshot, and the app reads it', () => {
  const route = read('src/app/api/integrations/apple-health/sync/route.ts');
  assert.match(route, /await client\.rpc\('set_apple_health_water', \{ p_date: day\.date, p_l: water \}\);/);
  assert.match(route, /typeof water === 'number' && Number\.isFinite\(water\) && water >= 0 && water <= 20/);
  const allowed = route.slice(route.indexOf('const ALLOWED_FIELDS'), route.indexOf('];', route.indexOf('const ALLOWED_FIELDS')));
  assert.doesNotMatch(allowed, /hydration_l/, "upsertSnapshot would write Apple Health's water over the day's glasses");
  const swift = read('mobile-app/ios/App/App/ShapeHealthPlugin.swift');
  assert.match(swift, /case "dietaryWater":\n\s+return HKObjectType\.quantityType\(forIdentifier: \.dietaryWater\)\.map \{ \(\$0, HKUnit\.liter\(\)\) \}/);
  assert.match(swift, /\.distanceWalkingRunning, \.dietaryWater\] \{/, 'water is not in the types Shape asks to read');
  assert.match(read('mobile-app/ios/App/App/Info.plist'), /active energy, water, and workouts/);
});

async function hydrationGet(obs) {
  const client = {
    from: (table) => {
      const q = {
        select: () => q, eq: () => q,
        maybeSingle: async () => {
          if (table === 'daily_health_snapshot') return { data: { hydration_l: 1.7 }, error: null };
          if (table === 'health_metric_observations') return obs instanceof Error ? Promise.reject(obs) : { data: obs, error: null };
          return { data: null, error: null };
        },
      };
      return q;
    },
  };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/client/hydration/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: 'member-1' }) }],
      ['@/lib/request-utils', await loadRealModule(join(ROOT, 'src/lib/request-utils.ts'), { typescript: true, registry: new Map([['next/server', nextServer]]) })],
      ['@/lib/local-day', { clientLocalDay: () => '2026-10-18' }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
    ]),
  });
  const res = await mod.GET(new Request('https://x/api/client/hydration?date=2026-10-18'));
  return res.json();
}

test("the hydration read says how much of the day's water came from Apple Health", async () => {
  let body = await hydrationGet({ value: 1.2 });
  assert.equal(body.hydrationL, 1.7);
  assert.equal(body.deviceL, 1.2);
  body = await hydrationGet(null);
  assert.equal(body.deviceL, null);
  body = await hydrationGet({ value: 0 });
  assert.equal(body.deviceL, null, 'a zero reading was said as water from Apple Health');
  body = await hydrationGet(new Error('down'));
  assert.equal(body.ok, true, 'a failed read of the share failed the water read');
  assert.equal(body.deviceL, null);
});
