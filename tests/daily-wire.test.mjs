import test from 'node:test';
import assert from 'node:assert/strict';
import {
  bsLaunchRoute, bsDailyStamp, bsAfterBeat,
  bsWireDirective, bsWireLines, BS_LEVER_HEADS,
} from '../mobile-app/src/services/dailyWire.mjs';

// ── bsLaunchRoute — the warm-relaunch decision ─────────────────────────────
test('launchRoute: same uid + same day + cached member → app', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'app');
});
test('launchRoute: different day → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-09', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
});
test('launchRoute: different uid → beat (no cross-account skip)', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u2:2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
});
test('launchRoute: no membership cache → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: false }), 'beat');
});
test('launchRoute: no stamp / malformed stamp → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: undefined, uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: 'no-separator', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: ':2026-07-10', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: 'u1:', uid: 'u1', todayLocal: '2026-07-10', memberCached: true }), 'beat');
});
test('launchRoute: missing uid or day → beat', () => {
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: null, todayLocal: '2026-07-10', memberCached: true }), 'beat');
  assert.equal(bsLaunchRoute({ stamp: 'u1:2026-07-10', uid: 'u1', todayLocal: null, memberCached: true }), 'beat');
});
test('launchRoute: no args → beat (safe default)', () => {
  assert.equal(bsLaunchRoute(), 'beat');
});
test('dailyStamp: builds "<uid>:<day>" and round-trips through launchRoute', () => {
  const s = bsDailyStamp('abc', '2026-07-10');
  assert.equal(s, 'abc:2026-07-10');
  assert.equal(bsLaunchRoute({ stamp: s, uid: 'abc', todayLocal: '2026-07-10', memberCached: true }), 'app');
});

// ── bsAfterBeat — post-beat routing ────────────────────────────────────────
test('afterBeat: no locale → language picker regardless of membership', () => {
  assert.equal(bsAfterBeat({ allowed: true, hasLocale: false }), 'lang');
  assert.equal(bsAfterBeat({ allowed: false, hasLocale: false }), 'lang');
});
test('afterBeat: locale + allowed → daily; locale + not allowed → gate', () => {
  assert.equal(bsAfterBeat({ allowed: true, hasLocale: true }), 'daily');
  assert.equal(bsAfterBeat({ allowed: false, hasLocale: true }), 'gate');
});

// ── bsWireDirective — mirror of Home's gate ────────────────────────────────
test('wireDirective: real lever + action + verdict → head + reason', () => {
  const d = bsWireDirective({ lever: 'checkin', action: { label: 'x' }, verdict: 'Check-in due', reason: 'Check-in due' });
  assert.deepEqual(d, { head: BS_LEVER_HEADS.checkin, reason: 'Check-in due' });
});
test('wireDirective: null / no action / lever none / verdict — → null', () => {
  assert.equal(bsWireDirective(null), null);
  assert.equal(bsWireDirective({ lever: 'checkin', verdict: 'x' }), null); // no action
  assert.equal(bsWireDirective({ lever: 'none', action: { label: 'x' }, verdict: 'x' }), null);
  assert.equal(bsWireDirective({ lever: 'checkin', action: { label: 'x' }, verdict: '—' }), null);
});
test('wireDirective: lever Home does not lead with (sleep / contact) → null', () => {
  assert.equal(bsWireDirective({ lever: 'sleep', action: { label: 'x' }, verdict: 'Sleep is the lever', reason: 'r' }), null);
  assert.equal(bsWireDirective({ lever: 'contact', action: { label: 'x' }, verdict: 'Reconnect', reason: 'r' }), null);
});

// ── bsWireLines — signed-out sentinel ──────────────────────────────────────
test('wireLines: null digest → null (signed-out sentinel)', () => {
  assert.equal(bsWireLines(null, null), null);
});
test('wireLines: signedIn !== true → null (never a member briefing)', () => {
  assert.equal(bsWireLines({ signedIn: false, name: 'Quinn' }, null), null);
  assert.equal(bsWireLines({ name: 'Quinn' }, null), null);
});

// ── bsWireLines — full member day ──────────────────────────────────────────
const FULL = {
  signedIn: true, name: 'Quinn',
  training: { hasWorkout: true, title: 'Upper Pull', time: '17:45', durationMin: 52, moveCount: 6, coach: 'Jordan' },
  score: { score: 1284, tier: 'Tempo', delta: 15 },
  nutrition: { cal: 1820, calTarget: 2100, protein: 96, proteinTarget: 140 },
  streak: 6,
  coach: { who: 'Jordan', text: 'Leave two in the tank on the last set.', at: null },
};

test('wireLines: full day assembles session/directive/numbers/coach + END closer', () => {
  const dir = { lever: 'checkin', action: { label: 'x' }, verdict: 'Check-in due', reason: 'Check-in due' };
  const lines = bsWireLines(FULL, dir);
  const texts = lines.map(l => l.text);
  // session leads (title has a short-enough head to fold in time; extras only if <=26)
  assert.ok(texts[0].startsWith('UPPER PULL 5:45 PM'));
  assert.ok(texts.some(t => t === 'WITH JORDAN'));
  // directive is teal-marked and reads head — reason (uppercased)
  const hot = lines.find(l => l.hot);
  assert.ok(hot && hot.text.includes('SEND YOUR WEEKLY CHECK-IN'));
  // numbers fragments present
  assert.ok(texts.some(t => t.includes('SCORE 1,284 UP 15')));
  assert.ok(texts.some(t => t.includes('PROTEIN 96 OF 140')));
  assert.ok(texts.some(t => t.includes('STREAK 6 DAYS')));
  // coach note
  assert.ok(texts.some(t => t.startsWith('JORDAN: LEAVE TWO IN THE TANK')));
  // session day closes with the explicit reply line, terminated END
  const last = lines[lines.length - 1];
  assert.equal(last.text, 'REPLY BY SHOWING UP');
  assert.equal(last.end, true);
  assert.equal(last.sep, false);
  // every non-final line keeps STOP (sep true)
  for (let i = 0; i < lines.length - 1; i++) assert.equal(lines[i].sep, true);
});

test('wireLines: rest day (plan, no session) reads the honest rest line, no directive/coach', () => {
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: { hasWorkout: false }, score: null, nutrition: null, streak: 0, coach: null }, null);
  const texts = lines.map(l => l.text);
  assert.deepEqual(texts, ['REST DAY ON THE BOOKS']);
  // the only line terminates END (no session-day closer)
  assert.equal(lines[0].end, true);
  assert.equal(lines[0].sep, false);
});

test('wireLines: no plan reads the two honest no-session lines', () => {
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: null, score: null, nutrition: null, streak: 0, coach: null }, null);
  const texts = lines.map(l => l.text);
  assert.deepEqual(texts, ['NO SESSION ON THE WIRE', 'FIND YOUR COACH INSIDE']);
  assert.equal(lines[0].sep, true);
  assert.equal(lines[1].end, true);
});

test('wireLines: numbers fragments join one line — no fabrication when a leg is null', () => {
  // score present but delta 0 (no "UP"); protein without a target; no streak
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: { hasWorkout: false }, score: { score: 900, delta: 0 }, nutrition: { protein: 80, proteinTarget: null }, streak: 0, coach: null }, null);
  const numLine = lines.map(l => l.text).find(t => t.includes('SCORE'));
  assert.equal(numLine, 'SCORE 900 · PROTEIN 80G');         // no "UP" on delta 0, targetless protein, no streak
  assert.ok(!lines.some(l => l.text.includes('STREAK')));   // omitted
});

test('wireLines: directive omitted when the engine has no real lever', () => {
  const lines = bsWireLines(FULL, { lever: 'none', verdict: '—' });
  assert.ok(!lines.some(l => l.hot));
});

test('wireLines: session without coach/time still assembles a clean head', () => {
  const lines = bsWireLines({ signedIn: true, name: 'Q', training: { hasWorkout: true, title: 'Zone 2 Run' }, score: null, nutrition: null, streak: 0, coach: null }, null);
  assert.equal(lines[0].text, 'ZONE 2 RUN');
  // no WITH line, session-day closer still appended
  assert.ok(lines.some(l => l.text === 'REPLY BY SHOWING UP'));
});
