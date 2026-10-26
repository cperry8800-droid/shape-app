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

// One hourly run at 08:00 UTC over `rows`, with `snapshots` as the day's daily_health_snapshot rows
// by member (an Error fails any read that asks for that member). `noSkipColumn` is the database
// before 2026-10-19-sleep-skipped.sql: a read that names sleep_skipped fails with 42703. Returns what
// was sent, which reminders were marked done, and the snapshot reads with the members and columns
// each one asked for.
async function runReminders(rows, snapshots = {}, { noSkipColumn = false, missingError = { code: '42703', message: 'column daily_health_snapshot.sleep_skipped does not exist' } } = {}) {
  const sent = [];
  const fired = [];
  const reads = [];
  const admin = {
    from(table) {
      const q = {
        _eq: {},
        _in: null,
        _cols: '*',
        select(cols) { q._cols = cols || '*'; return q; },
        eq(k, v) { q._eq[k] = v; return q; },
        _not: [],
        in(k, v) { q._eq[k] = 'in'; q._in = v; return q; },
        not(k, op, v) { q._not.push([k, op, v]); return q; },
        limit: async () => ({ data: rows, error: null }),
        // The reminders are read a page at a time, in id order (one page here).
        order() { return q; },
        range: async () => ({ data: rows, error: null }),
        // An awaited snapshot read: the asked members' rows that day, kept by each `.not(col, 'is', null)`.
        then(resolve, reject) {
          reads.push({ table, ids: q._in, ...q._eq, not: q._not.flat(), cols: q._cols });
          const ids = q._in || [];
          const cols = q._cols.split(',').map((c) => c.trim());
          if (noSkipColumn && cols.includes('sleep_skipped')) return Promise.resolve({ data: null, error: missingError }).then(resolve, reject);
          if (ids.some((id) => snapshots[id] instanceof Error)) return Promise.resolve({ data: null, error: { message: 'down' } }).then(resolve, reject);
          const found = ids.filter((id) => snapshots[id]).map((id) => ({ user_id: id, ...snapshots[id] }))
            .filter((row) => q._not.every(([k, op, v]) => op === 'is' && v === null && row[k] != null))
            .map((row) => (cols.includes('*') ? row : Object.fromEntries(cols.map((c) => [c, row[c] ?? null]))));
          return Promise.resolve({ data: found, error: null }).then(resolve, reject);
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
const reminder = (id, user, kind = 'daily_checkin', tz = 'UTC', at = '08:00') => ({ id, user_id: user, kind, label: '', at_time: at, days: [0, 1, 2, 3, 4, 5, 6], tz, last_fired_on: null });

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
    [reminder('r1', 'answered'), reminder('r2', 'night-only'), reminder('r3', 'read-fails', 'daily_checkin', 'Pacific/Pago_Pago', '21:00'),
      reminder('r4', 'answered', 'weigh_in'), reminder('r5', 'answered', 'daily_checkin', 'UTC', '09:00'), reminder('r6', 'scale', 'weigh_in')],
    { answered: { energy: 8, sleep_hours: 7 }, 'night-only': { energy: null, sleep_hours: 6, sleep_quality: 8 }, 'read-fails': new Error('down'), scale: { energy: 6 } },
  );
  assert.deepEqual(sent.map((n) => n.data.reminderId), ['r2', 'r3', 'r4', 'r6'],
    'a morning with its energy in was reminded, or one still open (or unreadable) was not, or another kind was held back');
  assert.deepEqual(fired.map((f) => f.id), ['r1', 'r2', 'r3', 'r4', 'r6'], 'an answered morning was asked again the next hour, or one not due was touched');
  assert.deepEqual(fired.find((f) => f.id === 'r3').last_fired_on, '2026-10-18', "a reminder was marked on a day not its own");
  // One read per local day, for the morning reminders due this hour, on the energy column.
  assert.deepEqual(reads.filter((r) => r.table === 'daily_health_snapshot').map((r) => [r.ids, r.user_id, r.snapshot_date, r.not]),
    [[['answered', 'night-only'], 'in', '2026-10-19', ['energy', 'is', null]], [['read-fails'], 'in', '2026-10-18', ['energy', 'is', null]]],
    "the answered check read another day or column, or ran for a reminder that is not the morning's or not due");
});

test('a busy hour reads the mornings 200 members at a time, and a failed read sends only its own (Codex P2 on #2407)', async () => {
  const ids = Array.from({ length: 450 }, (_, i) => `m${i}`);
  const snapshots = { m3: { energy: 6, sleep_hours: 7 }, m250: { energy: 4, sleep_skipped: true }, m449: { energy: 10, sleep_quality: 8 }, m420: new Error('down'), m421: { energy: 6, sleep_hours: 6 } };
  const { sent, fired, reads } = await runReminders([...ids.map((u, i) => reminder(`r${i}`, u)), reminder('dup', 'm3')], snapshots);
  const snap = reads.filter((r) => r.table === 'daily_health_snapshot');
  assert.deepEqual(snap.map((r) => r.ids.length), [200, 200, 50], 'the mornings were read one member at a time, or in reads too large');
  assert.deepEqual(snap.flatMap((r) => r.ids), ids, 'a member was read twice or not at all');
  const notSent = ids.filter((u, i) => !sent.some((n) => n.data.reminderId === `r${i}`));
  assert.deepEqual(notSent, ['m3', 'm250'], 'an answered morning was reminded, or the failed read held back its members');
  assert.equal(sent.some((n) => n.data.reminderId === 'dup'), false, "a member's second morning reminder ignored the answer");
  assert.equal(fired.length, 451);
});

// The owner, 2026-10-19 ("yes fix"): energy saved alone, as the website's old daily card could (until
// part 3 retired it) and the app's old "How are you." page did (until part 2), is not a finished morning. The
// night has to be in too, by the card's own rule (bsCiStep): hours, typed or a watch's, or a skip
// the card saved. Rested alone leaves the night open there, so here too, and a watch's 0h night is a
// night there, so here too (review on #2408).
test('a morning is answered once its energy and its night are in, as the card asks: hours or a skip', async () => {
  const cases = {
    'energy-only': { energy: 6 },
    'zero-hours': { energy: 6, sleep_hours: 0 },
    'typed-or-watch': { energy: 6, sleep_hours: 7.5 },
    'rested': { energy: 6, sleep_quality: 4 },
    'skipped': { energy: 6, sleep_skipped: true },
    'skipped-no-energy': { sleep_skipped: true },
    'skip-false': { energy: 6, sleep_skipped: false },
  };
  const users = Object.keys(cases);
  const { sent, fired, reads } = await runReminders(users.map((u) => reminder(`r-${u}`, u)), cases);
  assert.deepEqual(sent.map((n) => n.data.reminderId).sort(), ['r-energy-only', 'r-rested', 'r-skip-false', 'r-skipped-no-energy'],
    "energy alone or with Rested answered the morning, or a night with hours (a watch's 0h too) or a skip did not");
  assert.equal(fired.length, users.length);
  const snap = reads.filter((r) => r.table === 'daily_health_snapshot');
  assert.equal(snap.length, 1);
  assert.deepEqual(snap[0].cols.split(',').map((c) => c.trim()).sort(), ['sleep_hours', 'sleep_skipped', 'user_id']);
});

test("the reminder's rule is the card's: each of these mornings is open or done on both sides alike", async () => {
  const req = createRequire(import.meta.url);
  const CARD = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSCheckinCard.jsx'), { registry: new Map([['react', req('react')], ['react-dom', req('react-dom')]]) });
  const step = CARD.bsCiStep;
  assert.equal(typeof step, 'function');
  const rows = {
    a: { energy: 6 }, b: { energy: 6, sleep_quality: 8 }, c: { energy: 6, sleep_hours: 0 },
    d: { energy: 6, sleep_hours: 7 }, e: { energy: 6, sleep_skipped: true }, f: { sleep_hours: 7 },
  };
  const { sent } = await runReminders(Object.keys(rows).map((u) => reminder(`r-${u}`, u)), rows);
  for (const [u, r] of Object.entries(rows)) {
    const reminded = sent.some((n) => n.data.reminderId === `r-${u}`);
    const card = step({ energy: r.energy ?? null, sleep: r.sleep_hours ?? null, rested: r.sleep_quality ?? null }, r.sleep_skipped === true);
    assert.equal(reminded, card !== 'done', `row ${u}: the card reads it ${card}, and the reminder ${reminded ? 'went' : 'held'}`);
  }
});

test('before the sleep_skipped migration runs, the reminder keeps the energy-only rule', async () => {
  const { sent, reads } = await runReminders(
    [reminder('r1', 'energy-only'), reminder('r2', 'open'), reminder('r3', 'down', 'daily_checkin', 'Pacific/Pago_Pago', '21:00')],
    { 'energy-only': { energy: 6 }, open: { energy: null }, down: new Error('down') },
    { noSkipColumn: true },
  );
  assert.deepEqual(sent.map((n) => n.data.reminderId), ['r2', 'r3'],
    'a missing column sent every reminder, or held back one still open or unreadable');
  const today = reads.filter((r) => r.table === 'daily_health_snapshot' && r.snapshot_date === '2026-10-19');
  assert.deepEqual(today.map((r) => r.cols), ['user_id, sleep_hours, sleep_skipped', 'user_id'], 'the read was not made again without the column');
  // PostgREST can name the missing column its own way.
  for (const missingError of [{ code: 'PGRST204', message: 'Could not find the column' }, { code: 'XX000', message: 'column "sleep_skipped" does not exist' }]) {
    const again = await runReminders([reminder('r1', 'energy-only')], { 'energy-only': { energy: 6 } }, { noSkipColumn: true, missingError });
    assert.deepEqual(again.sent, [], `a missing column reported as ${missingError.code} sent the reminder`);
  }
  // Any other failure is a failed read, not a missing column: its members are reminded.
  const other = await runReminders([reminder('r1', 'energy-only')], { 'energy-only': { energy: 6 } }, { noSkipColumn: true, missingError: { code: '57014', message: 'canceling statement due to statement timeout' } });
  assert.deepEqual(other.sent.map((n) => n.data.reminderId), ['r1'], 'a failed read was taken for a missing column');
});

test('the sleep_skipped migration is one re-runnable transaction with a guard, and restates no grants', () => {
  const sql = read('supabase-migrations/2026-10-19-sleep-skipped.sql');
  assert.match(sql, /^begin;$/m);
  assert.match(sql, /^commit;$/m);
  assert.match(sql, /add column if not exists sleep_skipped boolean;/);
  assert.doesNotMatch(sql, /sleep_skipped boolean (not null|default)/i, 'a skip is null until the member skips: nothing reads false');
  assert.match(sql, /do \$guard\$/);
  assert.match(sql, /has_column_privilege\('authenticated', 'public\.daily_health_snapshot', 'sleep_skipped', 'UPDATE'\)/);
  assert.doesNotMatch(sql, /^\s*(grant|revoke)\b/im);
});

// ── The Score page's Consistency pillar (owner, 2026-10-19) ─────────────────────

// The real score route over `snaps` (this member's daily_health_snapshot rows), on 2026-10-19.
async function scoreComposite(snaps) {
  const reads = [];
  const q = (table) => {
    const b = {
      _cols: null,
      select(c) { b._cols = c; return b; },
      eq() { return b; }, gte() { return b; }, order() { return b; },
      limit: async () => ({ data: [], error: null }),
      then(ok, ko) { reads.push({ table, cols: b._cols }); return Promise.resolve({ data: table === 'daily_health_snapshot' ? snaps : [], error: null }).then(ok, ko); },
    };
    return b;
  };
  const supabase = { auth: { getUser: async () => ({ data: { user: { id: 'member-1' } } }) }, from: q, rpc: async () => ({ data: 0, error: null }) };
  const mod = await loadRealModule(join(ROOT, 'src/app/api/client/score/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/request-utils', { dbError: () => nextServer.NextResponse.json({ error: 'db' }, { status: 500 }) }],
      ['@/lib/request-auth', { clientForRequest: async () => supabase, currentUser: async () => ({ id: 'member-1' }) }],
      ['@/lib/score-derive',{ deriveScore: () => ({ shapeScore: 0, highWaterScore: 0, spendableBalance: 0 }) }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/score-ledger-read', { readAllLedgerRows: async () => ({ rows: [], error: null }) }],
    ]),
  });
  mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 9, 19, 12, 0) });
  try {
    const res = await mod.GET(new Request('https://x/api/client/score'));
    return { body: await res.json(), reads };
  } finally { mock.timers.reset(); }
}
const snapOn = (day, fields) => ({ snapshot_date: `2026-10-${String(day).padStart(2, '0')}`, dietary_kcal: null, calories: null, sleep_hours: null, workout_minutes: null, energy: null, sleep_quality: null, ...fields });

test("Consistency counts a Morning check-in day as showing up, as momentum does; hunger or water alone do not", async () => {
  const snaps = [
    snapOn(18, { energy: 6 }), snapOn(17, { energy: 4 }), snapOn(16, { sleep_quality: 8 }),
    snapOn(15, { workout_minutes: 40 }), snapOn(14, { dietary_kcal: 1800 }),
    snapOn(13, { hunger: 6 }), snapOn(12, { hydration_l: 1.5 }),
  ];
  const { body, reads } = await scoreComposite(snaps);
  assert.equal(body.composite.consistency, 36, 'a check-in day was not counted as showing up, or hunger or water was'); // 5 of 14 days
  const snapRead = reads.find((r) => r.table === 'daily_health_snapshot');
  assert.equal(snapRead.cols, '*', 'the score does not read the whole row');
  // The other pillars are unchanged by a check-in.
  const without = await scoreComposite(snaps.map((r) => ({ ...r, energy: null, sleep_quality: null })));
  assert.equal(without.body.composite.consistency, 14);
  assert.equal(body.composite.train, without.body.composite.train);
  assert.equal(body.composite.recovery, without.body.composite.recovery);
});

test("a row made only by a skip is no data: the pillars keep their honest '—' (Codex P2 on #2408)", async () => {
  const meta = (day, fields = {}) => ({ id: `row-${day}`, user_id: 'member-1', created_at: 'x', updated_at: 'x', sources: {}, ...snapOn(day, fields) });
  const skips = [meta(18, { sleep_skipped: true }), meta(17, { sleep_skipped: true }), meta(16, { sleep_skipped: true })];
  const onlySkips = await scoreComposite(skips);
  assert.equal(onlySkips.body.composite.train, null, "three skip-only rows turned Train's '—' into a score");
  assert.equal(onlySkips.body.composite.consistency, null, "three skip-only rows turned Consistency's '—' into a score");
  // Any other content still makes a row count, as it always has: water, a skip with a check-in.
  const water = await scoreComposite([meta(18, { hydration_l: 1.5 }), meta(17, { hydration_l: 1 }), meta(16, { sleep_skipped: true, energy: 6 })]);
  assert.equal(water.body.composite.train, 0);
  assert.equal(water.body.composite.consistency, 7);
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

test('sleep leads on a real shortfall only, and Home, the splash and the push keep one rule (review on this PR)', async () => {
  const { buildDirective } = createRequire(import.meta.url)('../public/newdesign/dashSignals.js');
  const { clientCandidates } = await import('../src/lib/ai/notifications.mjs');
  const flag = { lever: 'sleep', action: { label: "Log last night's sleep" }, verdict: 'Sleep is the lever', reason: 'Averaging 5.5h sleep vs a 7.5h target — recovery is running down', cited: ['sleep_low'] };
  const mild = { ...flag, reason: "Deficit's fine — sleep is stalling recovery; tonight, lights out by 11.", cited: ['recovery.sleepHours', 'nutrition'] };
  const coach = { ...flag, cited: ['coach override'] };
  assert.equal(bsSleepLeadOk(flag), true);
  assert.equal(bsSleepLeadOk(mild), false, 'the milder 6-7h read led');
  assert.equal(bsSleepLeadOk(coach), true, "a coach's sleep move did not lead");
  assert.equal(bsSleepLeadOk({ ...flag, lever: 'energy' }), false);
  assert.equal(bsSleepLeadOk(null), false);
  assert.deepEqual(bsWireDirective(flag), { head: BS_LEVER_HEADS.sleep, reason: flag.reason });
  assert.equal(BS_LEVER_HEADS.sleep, 'Get to bed earlier tonight.');
  assert.equal(bsWireDirective(mild), null);
  // The push says what Home says, for every one of them.
  const pushed = (dir) => clientCandidates({ directive: { ...dir, line: 'x' }, flags: [], now: new Date(Date.UTC(2026, 9, 19, 8)) }).some((c) => c.type === 'directive');
  for (const dir of [flag, mild, coach]) assert.equal(pushed(dir), bsSleepLeadOk(dir), `the push and Home disagree on ${dir.cited.join(',')}`);
  assert.equal(pushed({ ...mild, lever: 'training', cited: ['streak'] }), true, 'the sleep rule silenced another move');
  // The engine's milder read is a real 6-7h average: it is what the push used to send alone.
  const engine = (avg7) => buildDirective({ recovery: { sleepHours: { avg7, lastNight: avg7, n: 5, target: 7.5 } } }, new Date(Date.UTC(2026, 9, 19, 8)), 'client');
  const milder = engine(6.6);
  assert.equal(milder.lever, 'sleep');
  assert.deepEqual(milder.cited, ['recovery.sleepHours'], "the engine's milder read changed shape");
  assert.equal(bsSleepLeadOk(milder), false);
  assert.equal(pushed(milder), false, "the engine's milder 6-7h read was pushed while Home hides it");
  const short = engine(5.5);
  assert.equal(short.lever, 'sleep');
  assert.ok(short.cited.includes('sleep_low'));
  assert.equal(bsSleepLeadOk(short), true);
  assert.equal(pushed(short), true);
  // Home reads the same gate, signed in only (the preview seeds a demo coach move), and its button
  // opens the morning check-in (its summary says the week).
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(client, /sleep: bsHomeSignedIn && bsSleepLeadOk\(engineFlag\) \? \{ head: tr\('home:lead\.sleep\.head', \{ defaultValue: BS_LEVER_HEADS\.sleep \}\), cta: \[tr\('home:lead\.sleep\.cta', \{ defaultValue: "I'll get to bed earlier →" \}\), \(\) => setCheckinOpenReq\(Date\.now\(\)\)\], c: t\.BLUE \} : null,/);
});

test('water is its own Home line, right under the morning card, whatever the Check-ins setting', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  // The hydration lead brings this line up (bsWaterLineFocus, part 2), so the client takes both.
  assert.match(client, /import \{ BSWaterLine, bsWaterLineFocus \} from '\.\/BSWaterLine\.jsx';/);
  const bulletin = '<BSTodayNudge onOpen={() => setMorningsPage(true)} variant="bulletin" openRequest={checkinPrefSettled ? checkinOpenReq : null} onOpenRequestConsumed={() => setCheckinOpenReq(null)} />';
  const at = client.indexOf(bulletin);
  assert.ok(at > 0);
  const after = client.slice(at + bulletin.length, at + bulletin.length + 300);
  // Owner, 2026-10-22, Option A: the two share one morning panel, the card first, outside any setting.
  assert.match(after, /^\n\s+<BSWaterLine \/>\n\s+<\/BSMorningPanel>\n/, 'the water line is not right under the morning card, in its panel');
  assert.match(client.slice(at - 200, at), /<BSMorningPanel>\n\s+$/, 'the morning card is not first in the panel');
  assert.doesNotMatch(after.split('<BSWaterLine />')[0], /checkinPrefOn/, 'the water line hides with the Check-ins setting');
});
