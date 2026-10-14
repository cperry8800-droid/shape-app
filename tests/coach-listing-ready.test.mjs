// Coach listings are discoverable once they are ready (owner, 2026-10-12: "hide unready coaches").
// supabase-migrations/2026-10-12-coach-listing-ready.sql keeps trainers/nutritionists.listing_ready
// (a real coach's listing: a price, active payouts and a photo; Shape's own listings always), and
// every place that lists coaches to a member or a visitor filters on it. A new discovery read that
// forgets the filter shows a coach nobody can buy from, so the readers are listed here and each is
// held to the filter.
//
// The migration was verified on a PostgreSQL 16 scaffold of the live objects it touches (the
// harness is not checked in): it applies twice; a coach who writes listing_ready or a Stripe status
// of their own is still not ready; payouts made active by the service role, a price and a photo
// (listing portrait or profile avatar) each turn it on, and losing any one turns it off; a profile
// photo change recomputes the owner's listings; Shape's own rows stay ready; a visitor's filter
// works; get_market_plans lists only plans whose coach has a ready listing and keeps its grants.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { stripComments } from './helpers/strip-comments.mjs'

const MIGRATION = 'supabase-migrations/2026-10-12-coach-listing-ready.sql'
const read = (p) => readFileSync(p, 'utf8').replace(/\r\n/g, '\n')
const sql = read(MIGRATION)
const code = sql.replace(/--[^\n]*/g, '')

test('the column, its visitor grant and its triggers', () => {
  for (const t of ['trainers', 'nutritionists']) {
    assert.match(code, new RegExp(`alter table public\\.${t} add column if not exists listing_ready boolean not null default true;`))
    assert.match(code, new RegExp(`grant select \\(listing_ready\\) on table public\\.${t} to anon;`))
    assert.match(code, new RegExp(`create trigger ${t}_zz_listing_ready\\s+before insert or update on public\\.${t}\\s+for each row execute function public\\.provider_listing_ready_row\\(\\);`))
    // BEFORE triggers fire in name order: the recompute must follow the admin-column guard, which
    // puts back a stripe_account_status a coach tried to write.
    assert.ok(`${t}_zz_listing_ready` > `${t}_guard_admin_columns` && `${t}_zz_listing_ready` > `${t}_touch_updated_at`)
  }
  assert.match(code, /create trigger profiles_zz_listing_ready\s+after update of avatar_url on public\.profiles/)
  assert.match(code, /begin;[\s\S]*commit;\s*$/)
})

test('ready means a price, active payouts and a photo, and Shape\'s own listings always are', () => {
  const fn = code.slice(code.indexOf('create or replace function public.provider_listing_ready_row()'), code.indexOf('$$;', code.indexOf('provider_listing_ready_row()')))
  assert.match(fn, /if new\.owner_id is null then\s+new\.listing_ready := true;/)
  assert.match(fn, /coalesce\(new\.price, 0\) > 0/)
  assert.match(fn, /coalesce\(new\.stripe_account_status, ''\) = 'active'/)
  assert.match(fn, /new\.listing_media ->> 'portrait'/)
  assert.match(fn, /from public\.profiles p where p\.id = new\.owner_id/)
  for (const name of ['provider_listing_ready_row', 'profile_avatar_listing_ready']) {
    const at = code.indexOf(`create or replace function public.${name}()`)
    const head = code.slice(at, code.indexOf('as $$', at))
    assert.doesNotMatch(head, /security definer/, `${name} runs as the caller`)
    assert.match(head, /set search_path to 'public', 'pg_temp'/)
    assert.match(code, new RegExp(`revoke all on function public\\.${name}\\(\\) from public, anon, authenticated;`))
  }
})

test('the public plan list shows plans from ready listings only, still pinned and still public', () => {
  const at = code.indexOf('create or replace function public.get_market_plans()')
  assert.ok(at > 0)
  const fn = code.slice(at, code.indexOf('$$;', code.indexOf('as $$', at)))
  assert.match(fn, /security definer set search_path to 'public', 'pg_temp'/)
  assert.match(fn, /n\.owner_id = cp\.owner_id and n\.listing_ready/)
  assert.match(fn, /t\.owner_id = cp\.owner_id and t\.listing_ready/)
  assert.doesNotMatch(code, /drop function[^;]*get_market_plans/, 'a drop would take its grants with it')
})

// Every place a member or a visitor is shown a set of coaches (the inventory of 2026-10-12).
const READERS = [
  ['src/lib/queries.ts', /\.from\('trainers'\)[\s\S]{0,400}?\.eq\('listing_ready', true\)/, 'the /trainers directory'],
  ['src/lib/queries.ts', /\.from\('nutritionists'\)[\s\S]{0,400}?\.eq\('listing_ready', true\)/, 'the /nutritionists directory'],
  ['src/app/api/marketplace-stats/route.ts', /from\('trainers'\)[^\n]*\.eq\('listing_ready', true\)/, 'the homepage trainer count'],
  ['src/app/api/marketplace-stats/route.ts', /from\('nutritionists'\)[^\n]*\.eq\('listing_ready', true\)/, 'the homepage nutritionist count'],
  ['src/app/api/support/chat/route.ts', /sb\.from\(table\)\.select\(`\$\{LIVE_COACH_COLUMNS\}[^\n]*\.eq\('listing_ready', true\)/, "Nora's coach suggestions"],
  ['public/newdesign/marketplace.jsx', /cl\.from\(table\)\.select\(columns\)\.eq\("listing_ready", true\)/, 'the website marketplace'],
  ['mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx', /client\.from\('trainers'\)\.select\('[^']+'\)\.eq\('listing_ready', true\)/, 'the app marketplace, trainers'],
  ['mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx', /client\.from\('nutritionists'\)\.select\('[^']+'\)\.eq\('listing_ready', true\)/, 'the app marketplace, nutritionists'],
]

test('every discovery read filters on listing_ready', () => {
  for (const [file, re, what] of READERS) assert.match(stripComments(read(file)), re, `${what} (${file}) lists coaches without the readiness filter`)
  const legacy = stripComments(read('public/supabase.js'))
  for (const fn of ['listTrainers', 'listNutritionists']) {
    const at = legacy.indexOf(fn)
    assert.ok(at > 0, fn)
    assert.match(legacy.slice(at, at + 700), /\.eq\('listing_ready', true\)/, `public/supabase.js ${fn} lists coaches without the readiness filter`)
  }
})

test('the approval email says when the listing appears', () => {
  const src = read('src/lib/coach-application-emails.ts')
  assert.equal((src.match(/your listing appears in the marketplace once the first three are done/g) || []).length, 2, 'both the HTML and the text say it')
})
