// The weekly readout names each metric in the member's words.
//
// Its deterministic fallback printed the snapshot column with the underscores turned into spaces,
// so the Morning check-in's Rested answer read "sleep quality" and the units leaked in as words
// ("protein g", "hydration l"). Both readout cards show these lines word for word. The model is told
// the same thing from the other side: energy, hunger and Rested are answered in words, and the 1-10
// scale its catalog explanations name is only how they are stored (Morning check-in part 2,
// 2026-10-19).
//
// Run as written: the real route on stubs, with no claim RPC (the pre-migration path), so every
// request computes and either generates or falls back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRealModule } from './helpers/load-real-module.mjs';
import * as readoutLib from '../src/lib/weekly-readout.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const nextServer = createRequire(join(ROOT, 'package.json'))('next/server');

const corr = (x, y, over = {}) => ({
  x, y, lagDays: 0, label: `${x} ↔ ${y}`, explanation: 'Both are 1-10 self-reports set seconds apart.',
  r: 0.62, n: 12, pValue: 0.01, qValue: 0.05, strength: 'strong', direction: 'positive', series: [],
  ...over,
});

const CORRELATIONS = [
  corr('sleep_quality', 'energy', { label: 'Rested rating ↔ that morning’s energy' }),
  corr('protein_g', 'recovery_score', { lagDays: 1, r: -0.55, n: 10, strength: 'moderate', direction: 'negative' }),
  corr('hydration_l', 'weight_lb', { r: 0.5, n: 9, strength: 'moderate' }),
  // A metric the map does not name keeps the old spelling, which is plain words.
  corr('sleep_hours', 'new_metric_score', { r: 0.7, n: 14 }),
];

async function readout({ model = null } = {}) {
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: 'u-1' } } }) },
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'Could not find the function' } }),
    from: () => {
      const q = {
        select: () => q, eq: () => q, gte: () => q, order: () => q, returns: () => q,
        then: (res, rej) => Promise.resolve({ data: [{ snapshot_date: '2026-10-18' }], error: null }).then(res, rej),
      };
      return q;
    },
  };
  const calls = [];
  const mod = await loadRealModule(join(ROOT, 'src/app/api/ai/weekly-readout/route.ts'), {
    typescript: true,
    registry: new Map([
      ['next/server', nextServer],
      ['@/lib/supabase/server', { createClient: async () => client }],
      ['@/lib/request-utils', { readJson: async () => ({ ok: true, data: {} }), dbError: () => { throw new Error('unexpected db error'); } }],
      ['@/lib/ai', {
        hasOpenAIKey: () => !!model,
        callAI: async (req) => { calls.push(req); return { ok: true, data: { output_text: JSON.stringify(model) } }; },
      }],
      ['@/lib/require-membership', { requireMembership: async () => null }],
      ['@/lib/correlations', { computeCorrelations: () => CORRELATIONS, SNAPSHOT_SELECT: '*' }],
      ['@/lib/weekly-readout.mjs', readoutLib],
      ['@/lib/supabase/admin', { createAdminClient: () => { throw new Error('no service key in tests'); } }],
    ]),
  });
  const res = await mod.POST(new Request('https://shape.test/api/ai/weekly-readout', { method: 'POST' }));
  return { body: await res.json(), calls };
}

test('the fallback names each metric in words, never the column', async () => {
  const { body } = await readout();
  assert.equal(body.source, 'fallback');
  const [rested, protein, water, unknown] = body.readout.insights;
  assert.equal(rested.detail, 'Across 12 days, how rested you felt tracks together with energy (r=0.62, strong).');
  assert.equal(rested.recommendation,
    'Worth watching together: on your own days, how rested you felt and energy have moved in the same direction. What drives what is not established here.');
  assert.equal(protein.detail, 'Across 10 days, protein moves opposite to recovery (r=-0.55, moderate).');
  assert.equal(protein.recommendation,
    'Worth watching together: on your own days, protein and recovery have moved in opposite directions. What drives what is not established here.');
  assert.equal(water.detail, 'Across 9 days, water tracks together with weight (r=0.50, moderate).');
  assert.equal(unknown.detail, 'Across 14 days, sleep tracks together with new metric score (r=0.70, strong).');
  for (const ins of body.readout.insights) {
    const said = `${ins.detail} ${ins.recommendation}`;
    assert.doesNotMatch(said, /_|sleep quality|protein g\b|hydration l\b|weight lb\b|recovery score|\bpct\b/, `a column name reached the member: ${said}`);
    assert.doesNotMatch(said, /this member/, 'the line the member reads speaks of them in the third person');
  }
  // The headline is the catalog's own label, untouched.
  assert.equal(rested.headline, 'Rested rating ↔ that morning’s energy');
});

test('the model is told not to quote a 1-10 figure for an answer given in words', async () => {
  const { body, calls } = await readout({
    model: {
      summary: 'One pattern stands out.',
      insights: [{ headline: 'Rested and energy', detail: 'd', correlation_key: 'sleep_quality->energy@lag0', evidence_chart: 'scatter', recommendation: 'r' }],
    },
  });
  assert.equal(body.source, 'openai');
  assert.equal(calls.length, 1);
  const system = calls[0].input.find((m) => m.role === 'system').content;
  assert.match(system, /answers energy, hunger and how rested they felt in words, not numbers/);
  assert.match(system, /never quote a 1-10 figure, a "\/10" or the scale itself to the client/);
  // The causal guard it sits beside is still there.
  assert.match(system, /never claim one metric causes the other/i);
});
