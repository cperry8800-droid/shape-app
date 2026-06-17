// Nutrition-provider compliance controls (NC1).
//
// ⚠️ NOT LEGAL ADVICE. These are engineering controls. Turning HARD enforcement
// on in production requires healthcare-regulatory counsel sign-off — see
// shape-ai-nutrition-compliance-brief.md. The licensure block + scope gating are
// computed always; whether a violation HARD-BLOCKS (vs. logs + disclaims) is
// gated on NUTRITION_COMPLIANCE_ENFORCE so we never wrongly block legitimate
// pairings before credential/state data is populated and counsel approves.
//
// Pure & dependency-free so node:test runs the exact logic the routes run.

// Credential types. RD/RDN = Registered Dietitian (licensed-eligible in ~all
// states); CNS = licensed only where state-recognized; "nutritionist" = NOT a
// licensed provider (general wellness information only).
export const CREDENTIAL_TYPES = ['rd', 'rdn', 'cns', 'nutritionist'];
export function isDietitianCredential(type) { return type === 'rd' || type === 'rdn'; }
// Credentials that CAN hold a state license for individualized/clinical nutrition
// (Medical Nutrition Therapy). The credential is necessary; the STATE LICENSE in
// the client's state is the per-client gate.
export function credentialCanBeLicensed(type) { return type === 'rd' || type === 'rdn' || type === 'cns'; }

function isExpired(dateStr, now) {
  if (!dateStr) return false; // not recorded → not a block reason on its own (capture gap)
  const t = new Date(dateStr).getTime();
  return Number.isFinite(t) && t < now.getTime();
}

// A provider's licenses: [{ state:'NY', number, expires:'YYYY-MM-DD' }].
export function isLicensedInState(provider, clientState, now = new Date()) {
  if (!clientState) return false; // unknown client state → cannot confirm licensure
  const st = String(clientState).toUpperCase().trim();
  const lics = (provider && provider.licenses) || [];
  return lics.some((l) => l && String(l.state).toUpperCase().trim() === st && !isExpired(l.expires, now));
}

// CRITICAL — licensure-to-client-state matching. Can this provider be paired with
// (and write INDIVIDUALIZED content for) a client in `clientState`? Re-checked on
// every match AND every individualized write. We do NOT honor the Dietitian
// Licensure Compact (not yet issuing privileges) — only an actual state license.
export function canServeClient(provider, clientState, now = new Date()) {
  const type = provider && provider.credentialType;
  // Unlicensed nutritionist / CNS-without-license → general wellness only, never individualized.
  if (!credentialCanBeLicensed(type)) {
    return { allowed: false, scope: 'general', reason: 'unlicensed_general_only' };
  }
  if (!clientState) return { allowed: false, scope: 'general', reason: 'client_state_unknown' };
  if (!isLicensedInState(provider, clientState, now)) {
    return { allowed: false, scope: 'general', reason: 'not_licensed_in_client_state' };
  }
  if (isExpired(provider && provider.insuranceExpires, now)) {
    return { allowed: false, scope: 'general', reason: 'insurance_expired' };
  }
  return { allowed: true, scope: 'individualized', reason: 'licensed_in_state' };
}

// Scope gating: which provider actions are INDIVIDUALIZED (MNT — gated to a
// licensed-in-state provider) vs GENERAL wellness (any provider).
const INDIVIDUALIZED_ACTIONS = new Set(['meal_plan', 'set_program_detail', 'condition_guidance', 'macro_prescription']);
export function actionScope(actionType) { return INDIVIDUALIZED_ACTIONS.has(String(actionType)) ? 'individualized' : 'general'; }

// Gate one action. A general action always passes; an individualized action
// requires canServeClient to allow it.
export function gateAction(provider, clientState, actionType, now = new Date()) {
  if (actionScope(actionType) === 'general') return { allowed: true, scope: 'general', reason: 'general_wellness' };
  const c = canServeClient(provider, clientState, now);
  return { allowed: c.allowed, scope: 'individualized', reason: c.reason, providerScope: c.scope };
}

// Disclaimers. Unlicensed/general: explicit "not medical advice", no diagnosis or
// treatment language. Licensed individualized: professional MNT framing.
export function disclaimerFor(scope, allowed) {
  if (scope === 'individualized' && allowed) {
    return 'Individualized nutrition guidance from your licensed dietitian. Not a substitute for care from your physician — tell your care team about your medical conditions and medications.';
  }
  return 'General wellness information only — not medical or individualized nutrition advice, not a diagnosis or treatment. For medical nutrition therapy, consult a dietitian licensed in your state.';
}

// Credential / license / insurance expirations → dashboard status + flags.
function expiryState(dateStr, now, soonMs) {
  if (!dateStr) return 'missing';
  const t = new Date(dateStr).getTime();
  if (!Number.isFinite(t)) return 'missing';
  if (t < now.getTime()) return 'expired';
  if (t - now.getTime() <= soonMs) return 'expiring';
  return 'active';
}
export function credentialStatus(provider, now = new Date(), soonDays = 60) {
  const soon = soonDays * 86400000;
  const licenses = ((provider && provider.licenses) || []).map((l) => ({ state: l.state, expires: l.expires, status: expiryState(l.expires, now, soon) }));
  const insurance = { expires: provider && provider.insuranceExpires, status: expiryState(provider && provider.insuranceExpires, now, soon) };
  const verifiedRd = !!(provider && provider.verifiedRd);
  const blocked = insurance.status === 'expired' || (licenses.every((l) => l.status === 'expired') && licenses.length > 0);
  return { licenses, insurance, verifiedRd, blocked: !!blocked };
}

// Onboarding attestations a provider must affirm (independent-contractor framing +
// maintains licensure + malpractice insurance).
export const REQUIRED_ATTESTATIONS = ['independent_contractor', 'maintains_licensure', 'maintains_insurance', 'scope_understood'];
export function attestationsComplete(attestations) {
  const a = attestations || {};
  return REQUIRED_ATTESTATIONS.every((k) => a[k] === true);
}

// Posture flags. Insurance-billing / HIPAA posture (BAAs, etc.) is OFF — Shape is
// cash-pay and likely outside HIPAA; flip only with counsel + signed BAAs.
export const HIPAA_BILLING_ENABLED = false;
// HARD enforcement of the licensure block is gated on counsel sign-off.
export function complianceEnforced(env) {
  return String((env && env.NUTRITION_COMPLIANCE_ENFORCE) || '').toLowerCase() === 'true';
}
