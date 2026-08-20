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

test('classifyWho — your own task keeps its lane when it names a supplier (round-5 P2)', () => {
  // warroom.ts:1312 — the owner runs this; Radio.co just supplies the URL.
  assert.equal(
    classifyWho({
      status: 'manual',
      label:
        "OWNER — apply migration + set station row: UPDATE public.radio_station SET provider='http', stream_url='<Radio.co stream URL>' WHERE id=1",
    }),
    'you'
  );
  assert.equal(
    classifyWho({ status: 'manual', label: 'OWNER — Radio.co account signup + station creation' }),
    'you'
  );
  assert.equal(
    classifyWho({
      status: 'manual',
      label: 'OWNER — native build required for background audio: npx cap sync + Xcode/Android Studio build',
    }),
    'you'
  );
  // The marker is the records' own prefix, case-sensitive: "OWNER / COUNSEL"
  // is shared work whose blocker really is counsel, and lowercase prose about
  // an owner item is not a task assigned to the owner.
  assert.equal(
    classifyWho({ status: 'manual', label: 'OWNER / COUNSEL before launch: attorney review of all public docs' }),
    'ext'
  );
  assert.equal(
    classifyWho({ status: 'pending', label: 'THE FRONTISPIECE — blocked on the product-photography owner item' }),
    'ext'
  );
});

test('classifyWho — an outsider named only in an aside is not the dependency (round-5 P2)', () => {
  // The mention is a dead end we are not waiting on; the stated blocker is ours.
  assert.equal(
    classifyWho({
      status: 'pending',
      label:
        'Real song BPM on Shape Radio: blocked until radio streams real audio — compute BPM at ingest then (Spotify tempo API deprecated for new apps)',
    }),
    'eng'
  );
  // A queue we ARE sitting in names itself in the subject — still EXT.
  assert.equal(
    classifyWho({
      status: 'manual',
      label: 'Garmin Health/Activity API access (request form down — apply via Developer Contact Us)',
    }),
    'ext'
  );
  // Subject-named native-speaker work survives the paren strip.
  assert.equal(
    classifyWho({
      status: 'pending',
      label: 'OPEN (human review, low): word choices the translators flagged for a native pass',
    }),
    'ext'
  );
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

// ⚠ AN OPEN OWNER RULING IS OWNER WORK; A CLOSED ONE IS HISTORY. "OWNER RULING NEEDED —
// tuna macros" landed in the ENG lane: it matches neither the bare `OWNER —` marker nor
// any verb in OWNER_NAMED, so /console showed an explicitly owner-blocked decision as
// engineering work. Its NEIGHBOUR routed correctly only by accident — it happens to
// contain the word "unruled" — so one working example was hiding a broken rule.
test('classifyWho — an OPEN owner ruling is owner work, a CLOSED one is not', () => {
  for (const label of [
    'OWNER RULING NEEDED — tuna macros: the published source figures do not reconcile with the dish as plated',
    'OWNER DECISION NEEDED — whether the career award key is partitioned by account',
    'OWNER CALL NEEDED — the third allergen class',
  ]) {
    assert.equal(classifyWho({ status: 'pending', label }), 'you', label);
  }

  // ⚠ AND THE FIRST FIX FOR THIS OVER-CAPTURED. Adding RULING to the case-INSENSITIVE
  // OWNER_NAMED set routed these to the owner too — prose about a ruling already made.
  // Uppercase + anchored + a dash is the line between an open ask and a settled record.
  for (const label of [
    'Voice is OPT-IN, default OFF (owner ruling)',
    'The owner ruled C and all 8 rulings are closed, but a closed ruling is not a build signal',
    'Store copy follows the owner ruling from 2026-07-02',
  ]) {
    assert.equal(classifyWho({ status: 'pending', label }), 'eng', label);
  }
});
