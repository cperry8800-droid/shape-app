// Mutation spec for one time zone per account (P9, 2026-11-05): the server's read and write of
// profiles.timezone (src/lib/account-timezone.ts), the routes that use it, the shared formatter's
// viewer zone and travel question, and the migration's statements. Every mutation must be killed.
//   node scripts/mutate.mjs --spec tests/mutations/account-timezone-2026-11-05.mutations.mjs --fail-on-skipped
const LIB = 'src/lib/account-timezone.ts';
const ME = 'src/app/api/me/timezone/route.ts';
const OPEN = 'src/app/api/client/timezone/route.ts';
const HOURS = 'src/app/api/my-availability/route.ts';
const ZONE = 'public/newdesign/shapeZone.mjs';
const SQL = 'supabase-migrations/2026-11-05-account-timezone.sql';

export default {
  test: 'node --test tests/account-timezone.test.mjs',
  timeoutMs: 120_000,
  mutations: [
    // ── reading and writing the account's zone ──
    { name: 'pre-migration reads as "no zone set"', file: LIB, find: "  if (!('timezone' in row)) return { ready: false, zone: null, error: false };", replace: '' },
    { name: 'a failed read reads as "no zone set"', file: LIB, find: "  if (error) return { ready: false, zone: null, error: true };", replace: "  if (error) return { ready: true, zone: null, error: false };" },
    { name: 'a first default replaces a chosen zone', file: LIB, find: "  if (opts.onlyIfUnset && before.zone) return { ok: true, zone: before.zone, changed: false };", replace: '' },
    { name: 'the first default is not conditioned on still being empty', file: LIB, find: "  if (opts.onlyIfUnset) q = q.is('timezone', null);", replace: '' },
    { name: 'a write that landed nowhere is reported as saved', file: LIB, find: "  if (after.error || !after.ready || !after.zone) return { ok: false, reason: 'failed' };", replace: '' },
    { name: 'a lost race claims the change', file: LIB, find: "  return { ok: true, zone: after.zone, changed: after.zone === zone };", replace: "  return { ok: true, zone: after.zone, changed: true };" },

    // ── the routes ──
    { name: 'the setting is a first default only', file: ME, find: "{ onlyIfUnset: body.data?.onlyIfUnset === true }", replace: '{ onlyIfUnset: true }' },
    { name: 'a failed GET reads as no zone', file: ME, find: "  if (read.error) return privateJson({ error: 'Could not read your time zone.', code: 'unavailable' }, { status: 503 });", replace: '' },
    { name: "the app's every-open post overwrites again", file: OPEN, find: "writeAccountZone(supabase, user.id, tz, { onlyIfUnset: true })", replace: 'writeAccountZone(supabase, user.id, tz, {})' },
    { name: 'the old write runs after the migration too', file: OPEN, find: "  if (set.ok) return NextResponse.json({ ok: true, timezone: set.zone, changed: set.changed });", replace: '' },
    { name: "the browser's zone wins over the account's", file: HOURS, find: "  const zone = (account.ready ? account.zone : null) ?? sentZone ?? owned.timezone;", replace: '  const zone = sentZone ?? owned.timezone;' },
    { name: 'an unread setting is saved over', file: HOURS, find: "  if (account.error) {", replace: '  if (false) {' },
    { name: "a coach's first save doesn't set the account", file: HOURS, find: "  if (account.ready && !account.zone && zone) {", replace: '  if (false) {' },

    // ── the formatter ──
    { name: "the device's zone wins over the account's", file: ZONE, find: "  return getAccountZone() || deviceZone() || 'UTC';", replace: "  return deviceZone() || getAccountZone() || 'UTC';" },
    { name: 'a same-clock device is asked about', file: ZONE, find: '  return !sameClock(a, d, at);', replace: '  return true;' },
    { name: '"keep mine" is forgotten', file: ZONE, find: '  if (normalizeZone(declined) === d) return false;', replace: '' },
    { name: 'a person with no zone is asked instead of defaulted', file: ZONE, find: '  if (!a || !d || a === d) return false;', replace: '  if (!d || a === d) return false;' },
    { name: 'the zone change is announced on every set', file: ZONE, find: "  if (prev !== next && typeof window !== 'undefined'", replace: "  if (typeof window !== 'undefined'" },

    // ── the migration ──
    { name: 'the backfill reads the device zone first', file: SQL, find: "             (select t.timezone from public.trainers t", replace: "             (select cp.timezone from public.client_profiles cp where cp.user_id = p2.id limit 1),\n             (select t.timezone from public.trainers t" },
    { name: 'a new listing keeps the zone it was sent', file: SQL, find: "  if v_zone is not null then\n    new.timezone := v_zone;", replace: "  if v_zone is not null and new.timezone is null then\n    new.timezone := v_zone;" },
    { name: 'the copy stays executable by clients', file: SQL, find: "revoke all on function public.profiles_copy_timezone() from public, anon, authenticated;", replace: '' },
  ],
};
