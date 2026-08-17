// The check-in vitals rules (spec §3A): a chronic 7-day energy/hunger/hydration
// read becomes a triage flag (energy_low / hunger_high) or a client-only
// directive (hydration_low) — while a thin sample, a missing leg, or an absent
// hydration target never fires anything. Absence is never a signal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluateClient, buildDirective } = require('../public/newdesign/dashSignals.js');

const NOW = new Date('2026-08-17T12:00:00');
const rec = (vitals) => ({ profile: { name: 'Q' }, vitals });
const has = (ev, key) => ev.flags.some((x) => x.key === key);

// ── energy_low: 7-day avg ≤ 4.0 with ≥3 logged days ─────────────────────────
test('energy averaging AT the 4.0 boundary flags energy_low (≤ is inclusive)', () => {
  const ev = evaluateClient(rec({ energy: { avg7: 4.0, n: 3 } }), NOW, 'trainer');
  const f = ev.flags.find((x) => x.key === 'energy_low');
  assert.ok(f, 'energy_low flag present');
  assert.match(f.reason, /Energy has averaged 4\/10 this week/);
});

test('energy just above the boundary (4.1) does NOT flag', () => {
  assert.equal(has(evaluateClient(rec({ energy: { avg7: 4.1, n: 7 } }), NOW, 'trainer'), 'energy_low'), false);
});

test('a thin energy sample (2 logged days) never flags, however low', () => {
  assert.equal(has(evaluateClient(rec({ energy: { avg7: 2.0, n: 2 } }), NOW, 'trainer'), 'energy_low'), false);
});

// ── hunger_high: 7-day avg ≥ 8.0 with ≥3 logged days ────────────────────────
test('hunger averaging AT the 8.0 boundary flags hunger_high (≥ is inclusive)', () => {
  const ev = evaluateClient(rec({ hunger: { avg7: 8.0, n: 3 } }), NOW, 'nutritionist');
  const f = ev.flags.find((x) => x.key === 'hunger_high');
  assert.ok(f, 'hunger_high flag present');
  assert.match(f.reason, /running light on fuel/);
});

test('hunger just under the boundary (7.9) does NOT flag', () => {
  assert.equal(has(evaluateClient(rec({ hunger: { avg7: 7.9, n: 7 } }), NOW, 'nutritionist'), 'hunger_high'), false);
});

test('a thin hunger sample (2 logged days) never flags', () => {
  assert.equal(has(evaluateClient(rec({ hunger: { avg7: 9.5, n: 2 } }), NOW, 'nutritionist'), 'hunger_high'), false);
});

// ── hydration_low: CLIENT-ONLY, avg strictly under 50% of a REAL target ─────
test('hydration well under half the target flags for the CLIENT role', () => {
  const ev = evaluateClient(rec({ hydration: { avg7L: 1.2, targetL: 3, n: 4 } }), NOW, 'client');
  const f = ev.flags.find((x) => x.key === 'hydration_low');
  assert.ok(f, 'hydration_low flag present');
  assert.match(f.reason, /1\.2L of a 3L water target/);
});

test('hydration at EXACTLY 50% of target does NOT flag (strictly under)', () => {
  assert.equal(has(evaluateClient(rec({ hydration: { avg7L: 1.5, targetL: 3, n: 7 } }), NOW, 'client'), 'hydration_low'), false);
});

test('hydration with NO stored target can never flag — a fabricated default never judges', () => {
  assert.equal(has(evaluateClient(rec({ hydration: { avg7L: 0.2, targetL: null, n: 7 } }), NOW, 'client'), 'hydration_low'), false);
});

test('a thin hydration sample (3 logged days) never flags', () => {
  assert.equal(has(evaluateClient(rec({ hydration: { avg7L: 0.5, targetL: 3, n: 3 } }), NOW, 'client'), 'hydration_low'), false);
});

test('hydration_low NEVER reaches a coach role — owner ruling, client directive only', () => {
  const v = { hydration: { avg7L: 0.5, targetL: 3, n: 7 } };
  assert.equal(has(evaluateClient(rec(v), NOW, 'trainer'), 'hydration_low'), false);
  assert.equal(has(evaluateClient(rec(v), NOW, 'nutritionist'), 'hydration_low'), false);
});

test('energy + hunger DO reach the coach roles (amber coach flags)', () => {
  const v = { energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 } };
  const ev = evaluateClient(rec(v), NOW, 'trainer');
  assert.ok(has(ev, 'energy_low'));
  assert.ok(has(ev, 'hunger_high'));
});

// ── absence gates ───────────────────────────────────────────────────────────
test('no vitals leg at all → no vitals flags', () => {
  const ev = evaluateClient({ profile: { name: 'Q' } }, NOW, 'client');
  assert.equal(ev.flags.some((x) => ['energy_low', 'hunger_high', 'hydration_low'].includes(x.key)), false);
});

test('a malformed vitals leg (non-object entries) never flags', () => {
  const ev = evaluateClient(rec({ energy: 3, hunger: 'high', hydration: null }), NOW, 'client');
  assert.equal(ev.flags.some((x) => ['energy_low', 'hunger_high', 'hydration_low'].includes(x.key)), false);
});

// ── directive priority + lever mapping ──────────────────────────────────────
test('energy_low alone becomes the energy directive (ease_load, never shaming)', () => {
  const d = buildDirective(rec({ energy: { avg7: 3.2, n: 5 } }), NOW, 'client');
  assert.equal(d.lever, 'energy');
  assert.equal(d.action.kind, 'ease_load');
  assert.equal(d.verdict, 'Energy is running low');
  assert.match(d.reason, /a lighter session still counts/);
  assert.deepEqual(d.cited, ['energy_low']);
});

test('hydration_low alone becomes the client hydration directive (log_water)', () => {
  const d = buildDirective(rec({ hydration: { avg7L: 1, targetL: 3, n: 5 } }), NOW, 'client');
  assert.equal(d.lever, 'hydration');
  assert.equal(d.action.kind, 'log_water');
  assert.equal(d.verdict, 'Water is behind');
});

test('sleep_low (35) outranks every vitals flag (34/33/32)', () => {
  const r = rec({ energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 }, hydration: { avg7L: 1, targetL: 3, n: 5 } });
  r.recovery = { sleepHours: { avg7: 5.5, lastNight: 5.5, target: 7.5 } };
  const d = buildDirective(r, NOW, 'client');
  assert.equal(d.lever, 'sleep');
});

test('within the vitals: energy (34) outranks hunger (33) outranks hydration (32)', () => {
  const all = rec({ energy: { avg7: 3, n: 5 }, hunger: { avg7: 9, n: 5 }, hydration: { avg7L: 1, targetL: 3, n: 5 } });
  assert.equal(buildDirective(all, NOW, 'client').lever, 'energy');
  const noEnergy = rec({ hunger: { avg7: 9, n: 5 }, hydration: { avg7L: 1, targetL: 3, n: 5 } });
  assert.equal(buildDirective(noEnergy, NOW, 'client').lever, 'hunger');
});
