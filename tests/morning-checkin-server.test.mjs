// tests/morning-checkin-server.test.mjs
//
// The Morning check-in's server side (owner, 2026-10-19; docs/REVIEW-2026-10-19-morning-checkin.md):
//   - the reminder says the two morning checks, and is not sent on a day whose morning is answered;
//   - momentum counts an energy or Rested answer as an active day (ruling 7);
//   - Home and the splash lead with sleep only on the engine's own shortfall.
import test, { mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { BS_LEVER_HEADS, bsWireDirective, bsSleepLeadOk } from '../mobile-app/src/services/dailyWire.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

// ── The reminder ───────────────────────────────────────────────────────────────

// One hourly run at 08:00 UTC over `rows`, with `snapshots` as today's daily_health_snapshot rows
// by member (an Error fails that read). Returns what was sent and which reminders were marked done.
async function runReminders(rows, snapshots = {}) {
  const sent = [];
  const fired = [];
  const reads = [];
  const admin = {
    from(table) {
      const q = {
        _eq: {},
        select() { return q; },
        eq(k, v) { q._eq[k] = v; return q; },
        limit: async () => ({ data: rows, error: null }),
        maybeSingle: async () => {
          reads.push({ table, ...q._eq });
          const s = snapshots[q._eq.user_id];
          if (s instanceof Error) return { data: null, error: { message: s.message } };
          return { data: s || null, error: null };
        },
        update(patch) { return { eq: async (_k, id) => { fired.push({ id, ...patch }); return { error: null }; } }; },
      };
      return q;
    },
  };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/cron/reminders/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/admin', { createAdminClient: () => admin }],
      ['@/lib/notify', { createNotification: async (_c, n) => { sent.push(n); return true; } }],
    ]),
  });
  process.env.CRON_SECRET = 'cron-test';
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 19, 8, 0) });
  try {
    const res = await mod.GET(new Request('https://x/api/cron/reminders', { headers: { 'x-cron-secret': 'cron-test' } }));
    return { body: await res.json(), sent, fired, reads };
  } finally { mock.timers.reset(); }
}
const reminder = (id, user, kind = 'daily_checkin') => ({ id, user_id: user, kind, label: '', at_time: '08:00', days: [0, 1, 2, 3, 4, 5, 6], tz: 'UTC', last_fired_on: null });

test('the Morning check-in reminder says the two morning checks and opens the card', async () => {
  const { sent, fired } = await runReminders([reminder('r1', 'member-1')]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, 'reminder_daily_checkin');
  assert.equal(sent[0].title, 'Morning check-in');
  assert.equal(sent[0].body, 'Two quick checks: last night and this morning.');
  assert.equal(sent[0].route, 'today');
  assert.deepEqual(fired, [{ id: 'r1', last_fired_on: '2026-10-19' }]);
});

test('a morning already answered is not reminded, and the reminder is done for the day', async () => {
  const { sent, fired, reads } = await runReminders(
    [reminder('r1', 'answered'), reminder('r2', 'night-only'), reminder('r3', 'read-fails'), reminder('r4', 'answered', 'weigh_in')],
    { answered: { energy: 8 }, 'night-only': { energy: null }, 'read-fails': new Error('down') },
  );
  assert.deepEqual(sent.map((n) => n.data.reminderId), ['r2', 'r3', 'r4'],
    'a morning with its energy in was reminded, or one still open (or unreadable) was not, or another kind was held back');
  assert.deepEqual(fired.map((f) => f.id), ['r1', 'r2', 'r3', 'r4'], 'an answered morning was asked again the next hour');
  assert.deepEqual(reads.filter((r) => r.table === 'daily_health_snapshot').map((r) => [r.user_id, r.snapshot_date]),
    [['answered', '2026-10-19'], ['night-only', '2026-10-19'], ['read-fails', '2026-10-19']],
    "the answered check read another day, or ran for a reminder that is not the morning's");
});

// ── Momentum (ruling 7) ─────────────────────────────────────────────────────────

const SQL = read('supabase-migrations/2026-10-19-momentum-morning-checkin.sql');
const fnAt = SQL.indexOf('create or replace function public.compute_momentum()');
const FN = SQL.slice(fnAt, SQL.indexOf('end $$;', fnAt) + 7);

test('momentum counts an energy or Rested answer as an active day, as it counts sleep hours', () => {
  assert.ok(fnAt >= 0, 'compute_momentum is not redefined');
  assert.match(FN, /s\.dietary_kcal > 0 or s\.calories > 0 or s\.workout_minutes > 0 or s\.sleep_hours > 0\s+or s\.energy is not null or s\.sleep_quality is not null/);
  assert.doesNotMatch(FN, /hunger|hydration/, 'hunger or water alone made a day active');
  // The same fold as the JS mirror, and the same gate.
  assert.match(FN, /if v_uid is null then return 0; end if;/);
  assert.match(FN, /v_m \+ case when r\.active then 7 else -12 end/);
  assert.match(FN, /security definer\nset search_path = public, pg_temp/);
});

test('the momentum migration is one re-runnable transaction with a guard, and restates no grants', () => {
  assert.match(SQL, /^begin;$/m);
  assert.match(SQL, /^commit;$/m);
  assert.match(SQL, /do \$guard\$/);
  assert.match(SQL, /raise exception 'compute_momentum does not count a morning check-in'/);
  assert.doesNotMatch(SQL, /^\s*(grant|revoke)\b/im, 'create or replace keeps the grants; restating them changes the definer allowlist');
  const mirror = read('mobile-app/src/services/momentum.mjs');
  assert.match(mirror, /2026-10-19-momentum-morning-checkin\.sql/, 'the JS mirror points at an older definition');
});

// ── The sleep lead (owner, 2026-10-19) ───────────────────────────────────────────

test('Home and the splash lead with sleep only on the engine\'s sleep_low flag, never its softer read', () => {
  const flag = { lever: 'sleep', action: { label: "Log last night's sleep" }, verdict: 'Sleep is the lever', reason: 'Averaging 5.5h sleep vs a 7.5h target — recovery is running down', cited: ['sleep_low'] };
  const soft = { ...flag, reason: 'Sleep is stalling recovery; log last night to confirm.', cited: ['recovery.sleepHours'] };
  const coach = { ...flag, cited: ['coach override'] };
  assert.equal(bsSleepLeadOk(flag), true);
  assert.equal(bsSleepLeadOk(soft), false, 'the read that fires every morning before the night is in led');
  assert.equal(bsSleepLeadOk(coach), false, "a coach's (or the preview's demo) sleep lever led");
  assert.equal(bsSleepLeadOk(null), false);
  assert.deepEqual(bsWireDirective(flag), { head: BS_LEVER_HEADS.sleep, reason: flag.reason });
  assert.equal(BS_LEVER_HEADS.sleep, 'Get to bed earlier tonight.');
  assert.equal(bsWireDirective(soft), null);
  assert.equal(bsWireDirective(coach), null);
  // Home reads the same gate, and its button opens the morning check-in (its summary says the week).
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /sleep: bsSleepLeadOk\(engineFlag\) \? \{ head: tr\('home:lead\.sleep\.head', \{ defaultValue: BS_LEVER_HEADS\.sleep \}\), cta: \[tr\('home:lead\.sleep\.cta', \{ defaultValue: "I'll get to bed earlier →" \}\), \(\) => setCheckinOpenReq\(Date\.now\(\)\)\], c: t\.BLUE \} : null,/);
});

test('water is its own Home line, right under the morning card, whatever the Check-ins setting', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /import \{ BSWaterLine \} from '\.\/BSWaterLine\.jsx';/);
  const bulletin = '<BSTodayNudge onOpen={() => setTodayPage(true)} variant="bulletin" openRequest={checkinPrefSettled ? checkinOpenReq : null} onOpenRequestConsumed={() => setCheckinOpenReq(null)} />';
  const at = client.indexOf(bulletin);
  assert.ok(at > 0);
  const after = client.slice(at + bulletin.length, at + bulletin.length + 300);
  assert.match(after, /^\n\s+\{\/\*[^*]*\*\/\}\n\s+<BSWaterLine \/>\n/, 'the water line is not right under the morning card');
  assert.doesNotMatch(after.split('<BSWaterLine />')[0], /checkinPrefOn/, 'the water line hides with the Check-ins setting');
});
