// The coach's push alerts (P2, 2026-11-05):
//   1. they fire again after a client recovers and later slips again — the memory of who was alerted
//      (`notify_state.coachClients`) was written and never cleared (notifications.mjs coachCandidates /
//      decideNotifications), so a client alerted once was never alerted again at that severity;
//   2. a coach who uses only the website gets them too — the hourly cron re-runs the roster snapshot a
//      surface last posted, and only the app posted one (and the app's records carried their id where
//      the route did not read it, so even its posts were dropped);
//   3. quiet hours and the alert switches still hold.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { coachCandidates, coachSeen, settleCoachMemory, decideNotifications } from '../src/lib/ai/notifications.mjs';

const require_ = createRequire(import.meta.url);
const E = require_('../public/newdesign/dashSignals.js');
const read = (rel) => readFileSync(new URL('../' + rel, import.meta.url), 'utf8');

// Noon in New York, outside the default quiet hours (22–7).
const NOON = new Date('2026-11-04T17:00:00Z');
const PREFS = { tz: 'America/New_York', capTz: 'America/New_York', quietStart: 22, quietEnd: 7, maxPerDay: 20 };
const DAY = 864e5;

// The pipeline candidatesFor runs (notify-core.ts), on a record at an instant.
function run(records, last, now = NOON, prefs = PREFS) {
  const rows = E.getTriageFeed('trainer', records, now).map((r) => ({
    clientId: r.client.userId, clientName: r.client.profile.name, severity: r.severity,
    reason: (r.lead && r.lead.reason) || r.reasons[0] || '', flags: r.flags, lead: r.lead,
  }));
  const candidates = coachCandidates({ triageRows: rows, lastSeverity: last.coachClients || {}, providerRole: 'trainer' });
  const d = decideNotifications({ candidates, last, prefs, now, audience: 'coach', coachSeen: coachSeen(rows) });
  return { sent: d.send.map((s) => s.type + ':' + s.data.clientId), held: d.suppressed.map((s) => s.reason), state: d.nextState, digest: d.digest };
}
const client = (over) => ({ userId: 'c1', profile: { id: 'c1', name: 'Sam R.' }, checkIn: { lastWeekOf: '2026-11-02' }, progressRead: { state: 'ready' }, foodLogs: { lastLoggedOn: '2026-11-03', daysLogged7d: 6 }, ...over });
const quiet = (days) => client({ lastContact: { trainer: new Date(NOON.getTime() - days * DAY).toISOString() } });
const fine = client({ lastContact: { trainer: new Date(NOON.getTime() - DAY).toISOString() } });
const red = client({ lastContact: { trainer: new Date(NOON.getTime() - 6 * DAY).toISOString() }, streaks: { current: 0, best: 9 } });

test('amber → recovers → amber again: the second slip alerts', () => {
  const a = run([quiet(6)], {});
  assert.deepEqual(a.sent, ['client_amber:c1']);
  const again = run([quiet(6)], a.state);
  assert.deepEqual(again.sent, [], 'still amber: no re-nag');
  const ok = run([fine], again.state);
  assert.equal('c1' in ok.state.coachClients, false, 'recovered: forgotten');
  const slip = run([quiet(6)], ok.state);
  assert.deepEqual(slip.sent, ['client_amber:c1'], 'the same reason again is a new event');
});

test('red → recovers → red again alerts; red → eases to amber → red again alerts', () => {
  const r1 = run([red], {});
  assert.deepEqual(r1.sent, ['client_red:c1']);
  const eased = run([quiet(6)], r1.state);
  assert.deepEqual(eased.sent, [], 'easing is not news');
  assert.equal(eased.state.coachClients.c1, 'amber', 'but it is remembered as amber');
  assert.deepEqual(run([red], eased.state).sent, ['client_red:c1'], 'worse again: alerted');
  const ok = run([fine], r1.state);
  assert.deepEqual(run([red], ok.state).sent, ['client_red:c1']);
});

test('a client the run did not see keeps what it had', () => {
  assert.deepEqual(settleCoachMemory({ c1: 'red', c2: 'amber' }, { c2: 'clear' }), { c1: 'red' });
  assert.deepEqual(settleCoachMemory({ c1: 'red' }, { c1: 'amber' }), { c1: 'amber' });
  assert.deepEqual(settleCoachMemory({ c1: 'amber' }, { c1: 'red' }), { c1: 'amber' }, 'worsening is the alert\'s to record');
  assert.deepEqual(settleCoachMemory({ c1: 'red' }, null), { c1: 'red' });
});

test('a row whose only flags are routed to the other coach reads as clear for this one', () => {
  const rows = [
    { clientId: 'a', severity: 'red', flags: [{ owned: true }] },
    { clientId: 'b', severity: 'amber', flags: [{ owned: false }] },
    { clientId: 'c', severity: 'green', flags: [] },
    { clientId: '', severity: 'red', flags: [{ owned: true }] },
  ];
  assert.deepEqual(coachSeen(rows), { a: 'red', b: 'clear', c: 'clear' });
});

test('an alert held for the digest is dropped when the client recovers before it goes', () => {
  const night = new Date('2026-11-05T04:00:00Z'); // 11 pm in New York: quiet hours
  const held = run([quiet(6)], {}, night);
  assert.deepEqual(held.sent, []);
  assert.deepEqual(held.held, ['quiet_hours'], 'quiet hours hold a coach alert');
  assert.equal(held.state.pendingDigest.length, 1);
  const ok = run([fine], held.state);
  assert.equal(ok.digest, null, 'not delivered after they recovered');
  assert.equal(ok.state.pendingDigest.length, 0);
  // Still slipping by morning: the held alert goes out in the digest, as before.
  assert.ok(run([quiet(6)], held.state).digest, 'a client still amber gets the held alert');
});

test("the alert switches hold: a coach who turned 'Client went amber' off is not sent one", () => {
  const off = { ...PREFS, matrix: { client_amber: { inapp: false, push: false, email: false } } };
  const r = run([quiet(6)], {}, NOON, off);
  assert.deepEqual(r.sent, []);
  assert.deepEqual(r.held, ['opted_out']);
});

test('the push says the lead the website leads with', () => {
  // Contact (80) outranks the streak (40); the old push took the first owned flag in rule order.
  const rows = E.getTriageFeed('trainer', [red], NOON).map((r) => ({ clientId: 'c1', clientName: 'Sam', severity: r.severity, reason: r.reasons[0], flags: r.flags, lead: r.lead }));
  assert.equal(E.getTriageFeed('trainer', [red], NOON)[0].flags[0].key, 'streak_broken', 'rule order puts the streak first');
  const [alert] = coachCandidates({ triageRows: rows, lastSeverity: {} });
  assert.equal(alert.body, 'No contact in 6 days');
  assert.equal(alert.data.reasonKey, 'contact_gap');
});

// ── the website posts the snapshot ──────────────────────────────────────────
function slice(src, name) {
  const at = src.indexOf('function ' + name + '(');
  let d = 0;
  for (let j = src.indexOf('{', at); j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}' && --d === 0) return src.slice(at, j + 1); }
  throw new Error(name);
}
test('a website-only coach posts the roster to the push, every 30 minutes at most, without page-only data', () => {
  const DATA = read('public/newdesign/dashData.jsx');
  const store = new Map();
  const calls = [];
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, v) };
  const fetch = (url, init) => { calls.push({ url, init }); return Promise.resolve({ ok: true }); };
  // eslint-disable-next-line no-new-func
  const post = new Function('DashSignals', 'localStorage', 'fetch', 'const DASH_NOTIFY_EVERY_MS = 30 * 60 * 1000;\n' + slice(DATA, 'dashPostNotifySnapshot') + '; return dashPostNotifySnapshot;')(E, localStorage, fetch);
  const recs = [{ profile: { id: 'c1', name: 'A' }, intake: [{ l: 'private' }], streaks: { current: 0, best: 5 } }, { profile: { id: null, name: 'demo' } }];
  assert.equal(post('trainer', recs), true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/api/ai/notify');
  assert.equal(calls[0].init.credentials, 'same-origin');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.role, 'trainer');
  assert.deepEqual(body.clients.map((c) => c.userId), ['c1'], 'a record with no id is not posted');
  assert.equal('intake' in body.clients[0], false);
  assert.equal(post('trainer', recs), false, 'throttled');
  assert.equal(post('nutritionist', recs), true, 'each role on its own clock');
  assert.equal(post('client', recs), false, 'a member page never posts a roster');
  assert.equal(post('trainer', []), false);
  assert.match(DATA, /dashPostNotifySnapshot\(role, DashSignals\.attachCoachContext\(records\.filter\(\(r, i\) => !!overviews\[i\]\), ctx\)\);/, 'posted after the enriched read, unread clients left out');
});

test('the route reads the id where a record carries it, and the role only when the coach holds it', () => {
  const route = read('src/app/api/ai/notify/route.ts');
  assert.match(route, /const id = coachRecordId\(c\);/);
  assert.match(route, /const role = asked && isCoachRole\(asked\) && actor\.roles\.includes\(asked\) \? asked : actor\.role;/);
  assert.match(route, /const snapshot: Snapshot = \{ role, tz: prefs\.tz, at: \+now \};/);
  for (const rel of ['src/app/api/ai/notify/route.ts', 'src/app/api/ai/notify/cron/route.ts']) {
    const src = read(rel);
    assert.match(src, /loadCoachContext\(/, rel + ' does not read the dismissals and reviews fresh');
    assert.match(src, /tr: copy\?\.tr, coachSeen \}/, rel + ' does not settle the alert memory');
  }
  // The app posts the engine's snapshot, with the id the route reads.
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /records\.map\(\(r\) => E\.engineSnapshot\(r\)\)\.filter\(Boolean\)/);
});
