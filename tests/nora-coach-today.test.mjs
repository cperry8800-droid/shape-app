// "What needs me today?" for a coach (the Ask Nora plan, step 5): src/lib/ai/coachToday.mjs
// over the shared fake Supabase, which applies the filters and projects the selected columns,
// so a reader that forgets one gets the wrong rows here as it would in production.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readCoachToday, TODAY_CAPS } from '../src/lib/ai/coachToday.mjs';
import { fakeSupabase } from './helpers/fake-supabase.mjs';

const NOW = new Date('2026-10-08T10:00:00.000Z'); // 11:00 in London, a Thursday
const at = (iso) => new Date(iso).toISOString();
function fixture(extra = {}) {
  const sessions = [
    { id: 's1', provider_role: 'trainer', provider_id: 7, client_id: 'c9', status: 'requested', scheduled_at: at('2026-10-09T15:00:00Z'), duration_min: 15, type: 'consult', topic: 'Intro call' },
    { id: 's2', provider_role: 'trainer', provider_id: 7, client_id: 'c1', status: 'confirmed', scheduled_at: at('2026-10-08T13:00:00Z'), duration_min: 60, type: 'session', topic: null },
    // 23:30 UTC is 00:30 TOMORROW in London: a request, never "today" on the coach's clock.
    { id: 's3', provider_role: 'trainer', provider_id: 7, client_id: 'c2', status: 'requested', scheduled_at: at('2026-10-08T23:30:00Z'), duration_min: 45, type: 'session', topic: null },
    { id: 's4', provider_role: 'trainer', provider_id: 99, client_id: 'c1', status: 'confirmed', scheduled_at: at('2026-10-08T12:00:00Z'), duration_min: 60, type: 'session', topic: null },
    { id: 's5', provider_role: 'trainer', provider_id: 7, client_id: 'c1', status: 'cancelled', scheduled_at: at('2026-10-08T16:00:00Z'), duration_min: 60, type: 'session', topic: null },
    { id: 's6', provider_role: 'trainer', provider_id: 7, client_id: 'c2', status: 'requested', scheduled_at: at('2026-10-07T09:00:00Z'), duration_min: 60, type: 'session', topic: null },
    // A nutritionist listing with the same numeric id is a different provider.
    { id: 's7', provider_role: 'nutritionist', provider_id: 7, client_id: 'c1', status: 'requested', scheduled_at: at('2026-10-10T09:00:00Z'), duration_min: 30, type: 'consult', topic: null },
  ];
  return {
    tables: {
      trainers: [{ id: 7, owner_id: 'coach-1', name: 'Coach' }],
      nutritionists: [],
      subscriptions: [
        { client_id: 'c1', status: 'active', provider_role: 'trainer', provider_id: 7 },
        { client_id: 'c2', status: 'trialing', provider_role: 'trainer', provider_id: 7 },
        { client_id: 'c3', status: 'canceled', provider_role: 'trainer', provider_id: 7 },
      ],
      sessions,
      user_goals: [],
      ...extra.tables,
    },
    rpcs: {
      get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: { c1: 'Priya Shah', c2: 'Sam Lee', c9: 'Jo Intro' }[id] || null })),
      get_client_stats: ({ p_user_id }) => ({ c1: { daysLogged7d: 6, sessionsCompleted: 4, sessionsPlanned: 4 }, c2: { daysLogged7d: 0, sessionsCompleted: 0, sessionsPlanned: 4 } }[p_user_id] || null),
      get_client_goals: () => null,
      get_client_checkins: () => [],
      ...extra.rpcs,
    },
    fail: extra.fail || [],
  };
}

test('requests to confirm, today on the coach\'s own clock, and who the Today engine flags', async () => {
  const sb = fakeSupabase(fixture());
  const t = await readCoachToday(sb, 'coach-1', { now: NOW, zone: 'Europe/London', role: 'trainer' });
  assert.equal(t.ok, true);
  assert.equal(t.today, '2026-10-08 (Thursday)');
  assert.equal(t.requestsToConfirm.count, 2, 'future requests on this coach\'s listing only: not the past one, the other listing\'s or another role\'s');
  assert.deepEqual(t.requestsToConfirm.items.map((r) => r.name), ['Sam Lee', 'Jo Intro'], 'soonest first; someone booking an intro is named too');
  assert.equal(t.requestsToConfirm.items[1].what, 'consult · Intro call');
  assert.deepEqual(t.sessionsToday, [{ time: '2:00 PM', name: 'Priya Shah', status: 'confirmed', what: 'session', minutes: 60 }], 'London\'s Thursday: 13:00 UTC is 2:00 PM there, and 23:30 UTC is tomorrow');
  assert.equal(t.needsYou.checked, 2);
  assert.equal(t.needsYou.of, 2);
  assert.deepEqual(t.needsYou.items, [{ name: 'Sam Lee', severity: 'amber', why: 'Tighten nutrition: No food logs in the last week' }]);
  assert.ok(!JSON.stringify(t.needsYou).includes('log a meal today'), 'the client\'s own action line is not the coach\'s');
  const stats = sb._calls.filter((c) => c.rpc === 'get_client_stats').map((c) => c.args.p_user_id).sort();
  assert.deepEqual(stats, ['c1', 'c2'], 'only the active roster is read');
});

test('in UTC the late request is today; a client the RPC refuses is skipped, not zero', async () => {
  const sb = fakeSupabase(fixture({ rpcs: { get_client_stats: ({ p_user_id }) => (p_user_id === 'c1' ? { daysLogged7d: 6, sessionsCompleted: 4, sessionsPlanned: 4 } : null) } }));
  const t = await readCoachToday(sb, 'coach-1', { now: NOW, zone: 'UTC' });
  assert.deepEqual(t.sessionsToday.map((s) => s.name), ['Priya Shah', 'Sam Lee']);
  assert.equal(t.sessionsToday[1].status, 'requested, not confirmed yet');
  assert.equal(t.needsYou.checked, 1, 'Sam\'s stats came back NULL: not read, never a fabricated zero');
  assert.deepEqual(t.needsYou.items, []);
});

test('a failed bookings read says so; the triage still answers; not a coach says that', async () => {
  const sb = fakeSupabase(fixture({ fail: ['sessions'] }));
  const t = await readCoachToday(sb, 'coach-1', { now: NOW, zone: 'Europe/London' });
  assert.equal(t.sessionsUnavailable, true);
  assert.equal(t.requestsToConfirm, undefined, 'never an empty list standing in for an unread one');
  assert.equal(t.needsYou.items.length, 1);
  const member = await readCoachToday(fakeSupabase({ tables: { trainers: [], nutritionists: [] } }), 'm-1', { now: NOW });
  assert.deepEqual(member, { ok: true, isCoach: false });
  const down = await readCoachToday(fakeSupabase({ fail: ['trainers', 'nutritionists'] }), 'coach-1', { now: NOW });
  assert.deepEqual(down, { ok: false });
});

test('a large roster reads the first clients and says how many', async () => {
  const subs = Array.from({ length: TODAY_CAPS.clients + 5 }, (_, i) => ({ client_id: `x${i}`, status: 'active', provider_role: 'trainer', provider_id: 7 }));
  const sb = fakeSupabase(fixture({ tables: { subscriptions: subs }, rpcs: { get_client_stats: () => ({ daysLogged7d: 0, sessionsCompleted: 0, sessionsPlanned: 3 }), get_display_names: ({ p_ids }) => p_ids.map((id) => ({ user_id: id, full_name: `Client ${id}` })) } }));
  const t = await readCoachToday(sb, 'coach-1', { now: NOW, zone: 'UTC' });
  assert.equal(t.needsYou.of, TODAY_CAPS.clients + 5);
  assert.equal(t.needsYou.onlyFirst, TODAY_CAPS.clients);
  assert.equal(t.needsYou.checked, TODAY_CAPS.clients);
  assert.equal(t.needsYou.items.length, TODAY_CAPS.flagged);
  assert.equal(t.needsYou.more, TODAY_CAPS.clients - TODAY_CAPS.flagged);
});

test('the coach\'s own signal tuning is applied, re-validated by the engine', async () => {
  // A coach who set the food gap to 10 days is not shown a 7-day empty week (the engine's
  // own rule for that knob); house policy flags it.
  const tuned = fakeSupabase(fixture({ tables: { user_goals: [{ user_id: 'coach-1', kind: 'coach_settings', data: { thresholds: { FOOD_GAP_DAYS: 10 } } }] } }));
  const t = await readCoachToday(tuned, 'coach-1', { now: NOW, zone: 'UTC' });
  assert.deepEqual(t.needsYou.items, [], 'their tuning, not the house default');
  // Out of range is refused by the engine, never clamped: house policy again.
  const bad = fakeSupabase(fixture({ tables: { user_goals: [{ user_id: 'coach-1', kind: 'coach_settings', data: { thresholds: { FOOD_GAP_DAYS: 9999 } } }] } }));
  assert.equal((await readCoachToday(bad, 'coach-1', { now: NOW, zone: 'UTC' })).needsYou.items.length, 1);
  // Another coach's tuning is never read.
  const other = fakeSupabase(fixture({ tables: { user_goals: [{ user_id: 'coach-2', kind: 'coach_settings', data: { thresholds: { FOOD_GAP_DAYS: 10 } } }] } }));
  assert.equal((await readCoachToday(other, 'coach-1', { now: NOW, zone: 'UTC' })).needsYou.items.length, 1);
});
