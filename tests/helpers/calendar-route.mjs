// tests/helpers/calendar-route.mjs
//
// The SHIPPED /api/calendar GET, compiled with loadRealModule, signed in as `member-1` against a
// fakeSupabase that applies the filters it is given. Used by the calendar Weeks and activities
// suites. (tests/schedule-fixes.test.mjs keeps its own, which also drives the manage route.)
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadRealModule } from './load-real-module.mjs';
import { fakeSupabase } from './fake-supabase.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

// Returns `get(tables, { fail, qs })`: the route's JSON body for `?{qs}` over those tables.
export async function calendarRoute() {
  const nextServer = require_('next/server');
  const lib = (f, registry = new Map([['next/server', nextServer]])) => loadRealModule(join(ROOT, 'src/lib', f), { typescript: true, registry });
  const [time, requestUtils] = await Promise.all([lib('time.ts'), lib('request-utils.ts')]);
  const guards = await import(pathToFileURL(join(ROOT, 'src/lib/access-guards.mjs')).href);
  const owned = await lib('owned-provider.ts', new Map([['@/lib/time', time], ['@supabase/supabase-js', {}]]));
  const booking = await lib('session-booking.ts', new Map([['@supabase/supabase-js', {}], ['@/lib/owned-provider', owned]]));
  const series = await lib('session-series.ts', new Map([['@supabase/supabase-js', {}], ['@/lib/time', time]]));
  const activities = await lib('calendar-activities.ts', new Map([['@/lib/time', time]]));
  let client = null;
  const route = await loadRealModule(join(ROOT, 'src/app/api/calendar/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer], ['@/lib/time', time], ['@/lib/request-utils', requestUtils],
      ['@/lib/access-guards.mjs', guards], ['@/lib/session-booking', booking], ['@/lib/session-series', series],
      ['@/lib/calendar-activities', activities],
      ['@/lib/paid-sessions', { openPaidSessions: async () => ({ ok: true, rows: [] }), linkPaidSession: async () => true }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/request-auth', { clientForRequest: async () => client, currentUser: async () => ({ id: 'member-1' }) }],
      ['@/lib/supabase/admin', { createAdminClient: () => ({}) }],
      ['@/lib/video', { videoRoomUrl: () => null }],
      ['@/lib/notify', { createNotification: async () => {} }],
      ['@/lib/session-emails', { afterSessionStep: async () => ({ emailed: false, followedUp: false }) }],
      ['@supabase/supabase-js', {}],
    ]),
  });
  return async (tables, { fail = [], qs = 'tz=UTC' } = {}) => {
    client = fakeSupabase({
      tables: { trainers: [], nutritionists: [], sessions: [], calendar_events: [], client_meal_plans: [], client_profiles: [], client_workouts: [], workout_sessions: [], activities: [], ...tables },
      fail,
    });
    const res = await route.GET(new Request(`https://shape.test/api/calendar?${qs}`));
    return res.json();
  };
}
