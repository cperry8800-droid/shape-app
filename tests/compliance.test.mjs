// Nutrition-provider compliance controls (NC1): credential capture, the CRITICAL
// licensure-to-client-state match, scope gating (general vs. individualized/MNT),
// disclaimers, expiration status, attestations, and the enforcement flag.
//
// These pure functions are the exact logic the server routes run (the route just
// loads provider/client rows and calls them), so this test IS the preview for the
// three required scenarios. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  CREDENTIAL_TYPES, isDietitianCredential, credentialCanBeLicensed,
  isLicensedInState, canServeClient, actionScope, gateAction, disclaimerFor,
  credentialStatus, REQUIRED_ATTESTATIONS, attestationsComplete,
  HIPAA_BILLING_ENABLED, complianceEnforced,
} from '../src/lib/compliance/nutrition.mjs';

const NOW = new Date('2026-06-17T12:00:00Z');
const FUTURE = '2027-01-01';
const PAST = '2025-01-01';

// A licensed-in-NY RD with current insurance.
const rdNY = {
  credentialType: 'rd',
  insuranceExpires: FUTURE,
  licenses: [{ state: 'NY', number: '123', expires: FUTURE }],
};
// An unlicensed nutritionist (general wellness only).
const nutritionist = { credentialType: 'nutritionist', licenses: [] };

// ── credential helpers ───────────────────────────────────────────────────────
test('credential taxonomy', () => {
  assert.deepEqual(CREDENTIAL_TYPES, ['rd', 'rdn', 'cns', 'nutritionist']);
  assert.equal(isDietitianCredential('rd'), true);
  assert.equal(isDietitianCredential('rdn'), true);
  assert.equal(isDietitianCredential('cns'), false);
  assert.equal(isDietitianCredential('nutritionist'), false);
  // RD/RDN/CNS can hold a state license; a plain nutritionist cannot.
  assert.equal(credentialCanBeLicensed('rd'), true);
  assert.equal(credentialCanBeLicensed('cns'), true);
  assert.equal(credentialCanBeLicensed('nutritionist'), false);
});

// ── PREVIEW 1: onboarding a dietitian (credential + state license + insurance) ─
test('onboarded dietitian is licensed-in-state with active credential status', () => {
  assert.equal(isLicensedInState(rdNY, 'NY', NOW), true);
  const status = credentialStatus(rdNY, NOW);
  assert.equal(status.licenses[0].status, 'active');
  assert.equal(status.insurance.status, 'active');
  assert.equal(status.blocked, false);
});

test('expiring-soon (≤60d) license + insurance are flagged', () => {
  const soon = { ...rdNY, insuranceExpires: '2026-07-01', licenses: [{ state: 'NY', expires: '2026-07-10' }] };
  const status = credentialStatus(soon, NOW);
  assert.equal(status.licenses[0].status, 'expiring');
  assert.equal(status.insurance.status, 'expiring');
});

// ── PREVIEW 2: a BLOCKED match to an out-of-state client ─────────────────────
test('CRITICAL — RD licensed in NY is BLOCKED for a TX client', () => {
  const verdict = canServeClient(rdNY, 'TX', NOW);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'not_licensed_in_client_state');
  assert.equal(verdict.scope, 'general');
});

test('RD licensed in NY CAN serve a NY client (insurance current)', () => {
  const verdict = canServeClient(rdNY, 'NY', NOW);
  assert.equal(verdict.allowed, true);
  assert.equal(verdict.reason, 'licensed_in_state');
  assert.equal(verdict.scope, 'individualized');
});

test('unknown client state blocks individualized care (cannot confirm licensure)', () => {
  assert.equal(canServeClient(rdNY, null, NOW).reason, 'client_state_unknown');
  assert.equal(isLicensedInState(rdNY, null, NOW), false);
});

test('expired license / expired insurance both block', () => {
  const expiredLic = { credentialType: 'rd', insuranceExpires: FUTURE, licenses: [{ state: 'NY', expires: PAST }] };
  assert.equal(canServeClient(expiredLic, 'NY', NOW).reason, 'not_licensed_in_client_state');
  const expiredIns = { credentialType: 'rd', insuranceExpires: PAST, licenses: [{ state: 'NY', expires: FUTURE }] };
  assert.equal(canServeClient(expiredIns, 'NY', NOW).reason, 'insurance_expired');
});

test('unlicensed nutritionist is always general-only, never individualized', () => {
  const verdict = canServeClient(nutritionist, 'NY', NOW);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, 'unlicensed_general_only');
});

// ── PREVIEW 3: scope disclaimer on an individualized nutrition action ─────────
test('scope gating: individualized actions vs general', () => {
  assert.equal(actionScope('meal_plan'), 'individualized');
  assert.equal(actionScope('set_program_detail'), 'individualized');
  assert.equal(actionScope('condition_guidance'), 'individualized');
  assert.equal(actionScope('macro_prescription'), 'individualized');
  assert.equal(actionScope('log_meal'), 'general');
  assert.equal(actionScope('send_message'), 'general');
});

test('gateAction: meal_plan passes for in-state RD, blocks out-of-state', () => {
  assert.equal(gateAction(rdNY, 'NY', 'meal_plan', NOW).allowed, true);
  assert.equal(gateAction(rdNY, 'TX', 'meal_plan', NOW).allowed, false);
  // A general action always passes regardless of licensure.
  assert.equal(gateAction(nutritionist, 'TX', 'log_meal', NOW).allowed, true);
});

test('disclaimer reflects scope — licensed MNT vs general wellness', () => {
  const licensed = disclaimerFor('individualized', true);
  assert.match(licensed, /licensed dietitian/i);

  const general = disclaimerFor('general', false);
  assert.match(general, /not medical/i);
  assert.match(general, /licensed in your state/i);
  // No diagnosis/treatment language is presented for the general/non-licensed case.
  assert.doesNotMatch(general, /\bdiagnos(e|is)\b(?! or treatment)/i);

  // A blocked individualized action falls back to the general disclaimer.
  assert.equal(disclaimerFor('individualized', false), general);
});

// ── attestations + posture flags ─────────────────────────────────────────────
test('required onboarding attestations', () => {
  assert.deepEqual(REQUIRED_ATTESTATIONS, ['independent_contractor', 'maintains_licensure', 'maintains_insurance', 'scope_understood']);
  assert.equal(attestationsComplete({}), false);
  assert.equal(attestationsComplete({ independent_contractor: true, maintains_licensure: true, maintains_insurance: true }), false);
  assert.equal(attestationsComplete({ independent_contractor: true, maintains_licensure: true, maintains_insurance: true, scope_understood: true }), true);
});

test('posture flags: HIPAA/billing OFF; enforcement gated on env', () => {
  assert.equal(HIPAA_BILLING_ENABLED, false);
  assert.equal(complianceEnforced({}), false);
  assert.equal(complianceEnforced({ NUTRITION_COMPLIANCE_ENFORCE: 'false' }), false);
  assert.equal(complianceEnforced({ NUTRITION_COMPLIANCE_ENFORCE: 'true' }), true);
  assert.equal(complianceEnforced({ NUTRITION_COMPLIANCE_ENFORCE: 'TRUE' }), true);
});
