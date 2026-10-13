// Mutation spec for sign-ups by source, birthdays and anniversaries (2026-10-13): each mutation
// undoes one guard, and tests/signup-source.test.mjs or tests/admin-console.test.mjs must fail on
// every one. The SQL's behaviour was probed on a PostgreSQL 16 replica; the runner does not run
// Postgres, so its mutations here are the source checks.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/signup-source-2026-10-13.mutations.mjs --fail-on-skipped
const RULES = 'src/lib/signup-source.mjs';
const MIRROR = 'public/signup-source.js';
const OVERVIEW = 'src/lib/admin-overview.mjs';
const MEMBERS_PAGE = 'src/app/admin/members/page.tsx';
const SQL = 'supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql';

export default {
  test: 'node --test tests/signup-source.test.mjs tests/admin-console.test.mjs',
  timeoutMs: 300_000,
  mutations: [
    // ── the rules ──
    { name: 'this site counts as a referrer', file: RULES,
      find: "  if (!host || (own && (host === own || host.endsWith(`.${own}`)))) return '';",
      replace: "  if (!host) return '';" },
    { name: 'a referrer keeps its wrapping subdomain', file: RULES,
      find: "  const host = url.hostname.toLowerCase().replace(HOST_PREFIX, '');",
      replace: "  const host = url.hostname.toLowerCase();" },
    { name: 'a direct visit is remembered', file: RULES,
      find: "  if (!touch.utm_source && !touch.utm_medium && !touch.utm_campaign && !touch.referrer) return null;\n  const landing = String(path || '')",
      replace: "  const landing = String(path || '')" },
    { name: 'any field survives cleaning', file: RULES,
      find: "  if (raw.surface === 'website' || raw.surface === 'app') out.surface = raw.surface;",
      replace: "  if (raw.surface) out.surface = raw.surface;" },
    { name: 'a coach ref is believed from a string', file: RULES,
      find: "  if (raw.coach_ref === true) out.coach_ref = true;",
      replace: "  if (raw.coach_ref) out.coach_ref = true;" },
    { name: 'a remembered touch never expires', file: RULES,
      find: "  if (!v || !v.at || now - Date.parse(v.at) > SOURCE_TTL_MS || Date.parse(v.at) > now + 60_000) return null;",
      replace: "  if (!v || !v.at) return null;" },
    { name: 'a later touch replaces the first', file: RULES,
      find: '  return stored || touch || null;',
      replace: '  return touch || stored || null;' },
    { name: 'Global Privacy Control is ignored', file: RULES,
      find: '  if (gpc) return false;\n  if (consent === \'reject\') return false;',
      replace: "  if (consent === 'reject') return false;" },
    { name: 'the EEA/UK is remembered without a choice', file: RULES,
      find: "  return !/^Europe\\//.test(timeZone);",
      replace: '  return true;' },
    { name: 'an unknown region is remembered', file: RULES,
      find: "  if (!timeZone) return false;\n  return !/^Europe",
      replace: "  if (!timeZone) return true;\n  return !/^Europe" },
    { name: 'the sign-up page’s own touch beats the remembered one', file: RULES,
      find: '  return cleanSource({ ...(stored || current || {}), coach_ref: coachRef === true, surface, platform }) || { surface };',
      replace: '  return cleanSource({ ...(current || stored || {}), coach_ref: coachRef === true, surface, platform }) || { surface };' },
    { name: 'the redirect carries any key', file: RULES,
      find: "export const CARRIED_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'ref'];",
      replace: "export const CARRIED_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'ref', 'next'];" },
    // ── the browser copy drifts ──
    { name: 'the copy keeps the wrapping subdomain', file: MIRROR,
      find: "  var HOST_PREFIX = /^(www\\d?|m|l|lm|mobile)\\./;",
      replace: "  var HOST_PREFIX = /^(www\\d?)\\./;" },
    { name: 'the copy remembers in the EEA/UK without a choice', file: MIRROR,
      find: '    return !/^Europe\\//.test(o.timeZone);',
      replace: '    return true;' },
    { name: 'the copy reads the remembered touch without consent', file: MIRROR,
      find: '        var stored = allowedHere() ? readStored(get(SOURCE_KEY)) : null;',
      replace: '        var stored = readStored(get(SOURCE_KEY));' },
    { name: 'a withdrawn consent keeps what was remembered', file: MIRROR,
      find: '        try { root.localStorage.removeItem(SOURCE_KEY); } catch (e) {}\n',
      replace: '' },
    { name: 'the copy drops the coach link', file: MIRROR,
      find: "coachRef: coachRefLive(get(COACH_REF_KEY)), surface:",
      replace: "coachRef: false, surface:" },
    // ── the pages ──
    { name: 'a not-recorded row is dropped from the bars', file: OVERVIEW,
      find: "    .map((r) => ({ source: String(r?.source ?? 'not recorded'), count: n(r?.count) }))",
      replace: "    .filter((r) => r?.source && r.source !== 'not recorded')\n    .map((r) => ({ source: String(r?.source), count: n(r?.count) }))" },
    { name: 'today’s birthdays are not counted apart', file: OVERVIEW,
      find: '    return { week: rows.length, today: rows.filter((r) => n(r?.days_until) === 0).length };',
      replace: '    return { week: rows.length, today: 0 };' },
    { name: 'the join date shifts a day', file: MEMBERS_PAGE,
      find: 'joined ${formatDay(a.joined)}',
      replace: 'joined ${formatWhen(a.joined)}' },
    { name: 'a failed celebrations read takes the members down', file: MEMBERS_PAGE,
      find: '  const cel = (celebrations.error ? null : celebrations.data)',
      replace: '  if (celebrations.error) throw celebrations.error;\n  const cel = (celebrations.data)' },
    // ── the migration ──
    { name: 'members can call the celebrations', file: SQL,
      find: 'revoke all on function public.admin_upcoming_celebrations(text, integer) from public, anon, authenticated;',
      replace: 'revoke all on function public.admin_upcoming_celebrations(text, integer) from public;' },
    { name: 'the label helper is granted out', file: SQL,
      find: 'revoke all on function public.signup_source_label(jsonb) from public, anon, authenticated;',
      replace: 'revoke all on function public.signup_source_label(jsonb) from public, anon, authenticated;\ngrant execute on function public.signup_source_label(jsonb) to authenticated;' },
    { name: 'the birthdays hand out the date of birth', file: SQL,
      find: "        'month', dt.m, 'day', dt.d, 'next', dt.next_day, 'days_until', dt.next_day - v_today\n",
      replace: "        'month', dt.m, 'day', dt.d, 'next', dt.next_day, 'days_until', dt.next_day - v_today, 'born', dt.date_of_birth\n" },
    { name: 'an anniversary can be the join day', file: SQL,
      find: "x.day >= v_today and (k.kind = 'birthday' or x.day > pe.joined)",
      replace: 'x.day >= v_today' },
  ],
};
