// Mission Control triage — classification is the feature's main risk, so the
// boundaries are pinned here: EXT naming beats status, manual defaults to YOU,
// pending defaults to ENG unless it names an owner act, done is never open.
import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyWho, shortLabel, triageChecklist } from '../src/lib/console-triage.mjs';

test('classifyWho — status boundaries', () => {
  assert.equal(classifyWho({ status: 'done', label: 'Anything at all' }), null);
  assert.equal(classifyWho({ status: 'manual', label: 'OWNER on-device pass: Cook Mode prep' }), 'you');
  assert.equal(classifyWho({ status: 'pending', label: 'C1b — the AI draft contract (six modes)' }), 'eng');
});

test('classifyWho — named outsiders read EXT regardless of status', () => {
  assert.equal(classifyWho({ status: 'manual', label: 'Native iOS build chain — push/APNs via Apple' }), 'ext');
  assert.equal(classifyWho({ status: 'manual', label: 'Legal counsel review of the DRAFT compliance set' }), 'ext');
  assert.equal(classifyWho({ status: 'pending', label: 'Spotify Extended Quota approval' }), 'ext');
  assert.equal(classifyWho({ status: 'pending', label: 'Stripe Connect activation' }), 'ext');
  assert.equal(classifyWho({ status: 'pending', label: 'Standing human review of the LLM output' }), 'ext');
});

test('classifyWho — a pending item naming an OUTSTANDING owner act is YOURS', () => {
  assert.equal(classifyWho({ status: 'pending', label: '⚠ Unruled decision still owed by the owner' }), 'you');
  assert.equal(classifyWho({ status: 'pending', label: 'Blocked on the on-device pass across papers' }), 'you');
  assert.equal(classifyWho({ status: 'pending', label: '⚠ OWNER MIGRATION — run 2026-07-26-purchase-plan-snapshot.sql' }), 'you');
  assert.equal(classifyWho({ status: 'pending', label: 'Indonesian register is SPLIT and needs a house call' }), 'you');
});

test('classifyWho — a CLOSED owner decision is history, not an owner action (round-3 P2)', () => {
  // The real vector Codex cited: warroom.ts:842 — the rulings are closed; the
  // live blockers are the AI contract + entitlement layer, i.e. engineering.
  assert.equal(
    classifyWho({
      status: 'pending',
      label:
        '⚠ Spec #1834 (OPEN) — NOTHING IN THIS WAVE IS CURRENTLY BUILD-READY. The owner ruled C (multi-week menus) and all 8 rulings are closed, but a closed ruling is not a build signal',
    }),
    'eng'
  );
  assert.equal(classifyWho({ status: 'pending', label: 'Voice is OPT-IN, default OFF (owner ruling)' }), 'eng');
  assert.equal(classifyWho({ status: 'pending', label: 'Home rail B shipped — owner pick off the concept board' }), 'eng');
});

test('classifyWho — hands-on verification is owner work however it is phrased (round-4 P2)', () => {
  // Codex's vector (warroom.ts:1318) plus the two siblings the same audit found
  // — one fixed phrase would have caught only the first of the three.
  assert.equal(
    classifyWho({ status: 'pending', label: 'On-device WebGL verification (iOS/Android native build)' }),
    'you'
  );
  assert.equal(
    classifyWho({
      status: 'pending',
      label: 'Deferred: useUserGoals hook + newdesign shared-includes (need a manual browser/device pass)',
    }),
    'you'
  );
  assert.equal(
    classifyWho({
      status: 'pending',
      label:
        'Live HRM on device: native build w/ @capacitor-community/bluetooth-le (npx cap sync); works today in Chrome via Web Bluetooth',
    }),
    'you'
  );
  // Repo admin: reads like engineering, but no engineering can close it.
  assert.equal(
    classifyWho({
      status: 'pending',
      label:
        'Dependabot: monthly grouped minor/patch (root npm, mobile npm, actions); enable security updates in repo settings',
    }),
    'you'
  );
});

test('classifyWho — a device that merely appears near "pass" is not a pass', () => {
  // `\bpass\b` must not fire on "password"; broadening (b) must not leak.
  assert.equal(classifyWho({ status: 'pending', label: 'Device password reset flow' }), 'eng');
  assert.equal(classifyWho({ status: 'pending', label: 'Rebuild the device-linking browser handoff' }), 'eng');
});

test('classifyWho — "legal" alone is not counsel (ENG items mention legal pages)', () => {
  assert.equal(classifyWho({ status: 'pending', label: 'Rework the legal pages footer nav' }), 'eng');
});

test('shortLabel — short labels pass through untouched', () => {
  assert.equal(shortLabel('Confirm FDC_API_KEY in Vercel'), 'Confirm FDC_API_KEY in Vercel');
});

test('shortLabel — cuts at the first strong break past 24 chars', () => {
  const s = shortLabel(
    'C1b — make the ✦ AI DRAFT real · BLOCKED on the AI contract. BOTH plan builders await generatePlanDraft and render a template'
  );
  // ' — ' at index 3 is before the 24-char floor; ' · ' is the first valid break.
  assert.equal(s, 'C1b — make the ✦ AI DRAFT real …');
});

test('shortLabel — long unbroken prose truncates at a word boundary with ellipsis', () => {
  const long = 'word '.repeat(80).trim(); // 399 chars, no strong separators
  const s = shortLabel(long);
  assert.ok(s.length <= 163, `too long: ${s.length}`);
  assert.ok(s.endsWith(' …'));
  assert.ok(!/\swor$/.test(s.slice(0, -2)), 'must not cut mid-word');
});

test('triageChecklist — counts reconcile and done is excluded', () => {
  const t = triageChecklist([
    {
      section: 'B section',
      items: [
        { label: 'Shipped thing', status: 'done' },
        { label: 'OWNER migration to run', status: 'manual' },
        { label: 'Garmin API access', status: 'pending' },
      ],
    },
    { section: 'A section', items: [{ label: 'Refactor the widget', status: 'pending' }] },
  ]);
  assert.equal(t.counts.total, 4);
  assert.equal(t.counts.done, 1);
  assert.equal(t.counts.open, 3);
  assert.equal(t.counts.you + t.counts.ext + t.counts.eng, t.counts.open);
  // Sort: YOU → EXT → ENG (who wins over section name)
  assert.deepEqual(
    t.open.map((o) => o.who),
    ['you', 'ext', 'eng']
  );
  // Every open row carries a non-empty short + verbatim label
  for (const o of t.open) {
    assert.ok(o.short.length > 0);
    assert.ok(o.label.length >= o.short.replace(/ …$/, '').length);
  }
});

test('triageChecklist — garbage in, empty out (never throws)', () => {
  assert.deepEqual(triageChecklist(null).open, []);
  assert.deepEqual(triageChecklist([{ items: null }, {}]).counts.open, 0);
});
