// Shape Score points for a good night (owner, 2026-10-18: "also lets give shape score points for
// good sleep", then: watch nights only, +5 for 7h or more). The migration
// (2026-10-18-sleep-points.sql) was applied twice to a local PostgreSQL 16 scaffold with Supabase's
// default function grants and probed: a watch's 7h, 12h, last night and the 14th night back each paid +5 once and a
// second claim paid nothing; 6.5h, 13h, a typed ('manual') night, an unstamped night, a night
// stamped by a provider the member has not connected, the 15th night back and tomorrow paid
// nothing; a member with no zone was paid for nights from 14 UTC days back to UTC tomorrow, and
// not 15 back or 2 ahead; signed out paid nothing; anon could not
// execute it. These tests hold the source to what was probed, and the app and website to
// claiming it.
//
// The award's latest definition is 2026-10-31-device-sleep-nights.sql: it pays from
// device_sleep_nights, which only the server writes, because the snapshot's stamp sat on a row the
// member writes (a forged 8 hours stamped 'oura' was paid; probed on the same scaffold before and
// after). tests/device-sleep-nights.test.mjs holds the table, the recording and that probe.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
// The latest definition of the award.
const SQL = read('supabase-migrations/2026-10-31-device-sleep-nights.sql')
const at = SQL.indexOf('create or replace function public.award_sleep_points()')
const BODY = SQL.slice(at, SQL.indexOf('$$;', at) + 3)

test('+5 in habits, once per night, for the caller only', () => {
  assert.ok(at >= 0, 'award_sleep_points is not defined')
  assert.match(BODY, /security definer\nset search_path = public, pg_temp/)
  assert.match(BODY, /v_uid uuid := auth\.uid\(\);/)
  assert.match(BODY, /if v_uid is null then return; end if;/)
  assert.doesNotMatch(SQL, /award_sleep_points\(p_/, 'the award takes a user id, so anyone could be credited')
  assert.match(BODY, /values \(\n\s+v_uid, 'habits', 'sleep_night',\n\s+md5\('sleep_night:' \|\| v_uid::text \|\| ':' \|\| r\.d::text\)::uuid,\n\s+5,/)
  assert.match(BODY, /on conflict do nothing;\n\n\s+if found then\n\s+day := r\.d; points := 5; return next;/)
})

test('a night of 7 to 12 hours, from the last 14 nights: last night and the 13 before it', () => {
  assert.match(BODY, /and n\.hours >= 7 and n\.hours <= 12\n/)
  assert.match(BODY, /and n\.night <= v_hi\n\s+and n\.night >= v_lo\n/)
  // A known zone: its own today and the 13 nights before it (Codex on #2404: the first draft held 15).
  assert.match(BODY, /v_today date := case when v_tz is not null then \(now\(\) at time zone v_tz\)::date end;/)
  // No zone: from the earliest today any zone has (a UTC day behind) back 13 nights, up to the
  // latest (a UTC day ahead), so no zone's 14th night is cut off (Codex on #2404).
  assert.match(BODY, /v_hi date := coalesce\(v_today, \(now\(\) at time zone 'utc'\)::date \+ 1\);/)
  assert.match(BODY, /v_lo date := coalesce\(v_today, \(now\(\) at time zone 'utc'\)::date - 1\) - 13;/)
})

test('watch nights only: a night the server recorded, from a provider the member has connected', () => {
  // Read from device_sleep_nights, which no member can write; the snapshot's stamp sat on a row the
  // member writes. The provider must still be connected (user_integrations is the server's alone).
  assert.match(BODY, /select distinct n\.night as d\n\s+from public\.device_sleep_nights n\n\s+where n\.user_id = v_uid\n/)
  assert.match(BODY, /and exists \(\n\s+select 1 from public\.user_integrations i\n\s+where i\.user_id = v_uid and i\.provider = n\.provider\n\s+\)/)
  assert.doesNotMatch(BODY, /daily_health_snapshot|sources/, 'the award reads a row the member writes')
  assert.doesNotMatch(BODY, /'manual'/)
})

test('callable by members, never by anon, and the migration checks it', () => {
  assert.match(SQL, /revoke all on function public\.award_sleep_points\(\) from public, anon;/)
  assert.match(SQL, /grant execute on function public\.award_sleep_points\(\) to authenticated, service_role;/)
  assert.match(SQL, /has_function_privilege\('anon', 'public\.award_sleep_points\(\)', 'EXECUTE'\) then\n\s+raise exception/)
  assert.match(SQL, /^begin;\n/m)
  assert.match(SQL, /\ncommit;\n$/)
})

test('the app claims it on sign-in and after the check-in syncs a watch; the website on load', () => {
  const backend = read('mobile-app/src/services/shapeBackend.js')
  assert.match(backend, /await supabase\.rpc\('award_sleep_points'\);/)
  assert.match(backend, /window\.ShapeSleepPoints = \{ check: awardSleepPoints \};/)
  // A credit checks the tier bonuses again, after it (Codex on #2404).
  const fn = backend.slice(backend.indexOf('async function awardSleepPoints()'), backend.indexOf('window.ShapeSleepPoints ='))
  assert.match(fn, /invalidateClientMetrics\(\);\n\s+try \{ await supabase\.rpc\('award_tier_bonuses'\); \}/)
  assert.match(backend, /if \(user\) \{ try \{ window\.ShapeSleepPoints\?\.check\?\.\(\)\.catch\(\(\) => \{\}\); \} catch \(e\) \{\} \}/)
  assert.match(read('mobile-app/src/broadsheet/BSCheckinCard.jsx'), /window\.ShapeSleepPoints\?\.check\?\.\(\)/)
  assert.match(read('public/newdesign/globalChatButton.js'), /quiet\(cl\.rpc\("award_sleep_points"\)\)/)
})

test('the Score page lists it and labels its ledger rows, in every language', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx')
  assert.match(client, /\{ id: 'goodNight', capKey: 'daily', name: 'A good night', pts: '\+5', cap: 'Daily', note: '7h\+ from your watch or ring' \}/)
  assert.match(client, /const _BS_LEDGER_KINDS = new Set\(\[[^\]]*'sleep_night'/)
  const dir = join(ROOT, 'mobile-app/src/i18n/catalogs')
  const locales = readdirSync(dir)
  assert.equal(locales.length, 13)
  for (const l of locales) {
    const cat = JSON.parse(readFileSync(join(dir, l, 'score.json'), 'utf8'))
    for (const k of ['earn.goodNight.name', 'earn.goodNight.note', 'ledger.kind.sleep_night']) assert.ok(cat[k], `${l} has no ${k}`)
  }
  assert.match(read('public/newdesign/score.jsx'), /\["Consistency", "A good night", "7h\+ from your watch or ring", "5"\]/)
  assert.match(read('src/lib/ai/shapeKnowledge.mjs'), /a good night’s sleep \(\+5 for a night of 7 hours or more that a connected watch or ring recorded; typed hours don’t earn\)/)
})
