// Canonical provider-role ⇄ discipline model.
//
// A DIETITIAN (RD/RDN) and a NUTRITIONIST are both the NUTRITION-discipline
// owner: they share the nutritionist surfaces, the write path
// (POST /api/nutritionist/meal-plan), and the engine's routing — only the
// credential/label differs. Trainers own TRAINING. This is the single source of
// truth for "what discipline does this role own"; the engine
// (public/newdesign/dashSignals.js) mirrors disciplineForRole verbatim (a test
// asserts they agree).
//
// Pure & dependency-free so node:test and any route can import it.

export const COACH_ROLES = ['trainer', 'nutritionist', 'dietitian'];
export const NUTRITION_ROLES = ['nutritionist', 'dietitian'];

// role → the discipline it OWNS ('training' | 'nutrition' | 'general').
export function disciplineForRole(role) {
  if (role === 'trainer') return 'training';
  if (role === 'nutritionist' || role === 'dietitian') return 'nutrition';
  return 'general'; // client / unknown
}

export function isCoachRole(role) { return COACH_ROLES.includes(String(role)); }
export function isNutritionRole(role) { return NUTRITION_ROLES.includes(String(role)); }
export function isTrainingRole(role) { return role === 'trainer'; }

// The provider-infra key a role rides on. A dietitian uses the NUTRITIONIST
// rails (subscriptions.provider_role = 'nutritionist', the nutritionists table),
// so the existing RLS / is_coach_on_client / meal-plan write path work unchanged
// — no per-table CHECK-constraint churn.
export function providerRoleForRole(role) {
  if (disciplineForRole(role) === 'nutrition') return 'nutritionist';
  if (role === 'trainer') return 'trainer';
  return null;
}

// Two roles can SEE each other's data, but each only WRITES its own discipline.
// (A trainer + a dietitian on the same client: each reads the other read-only.)
export function ownsDiscipline(role, discipline) {
  const d = disciplineForRole(role);
  return discipline === 'general' || d === discipline;
}

export function roleLabel(role) {
  if (role === 'trainer') return 'Trainer';
  if (role === 'dietitian') return 'Dietitian (RD/RDN)';
  if (role === 'nutritionist') return 'Nutritionist';
  if (role === 'admin') return 'Admin';
  return 'Client';
}

// A nutrition provider's display role, derived from their RD/RDN credential:
// a credentialed nutritionist reads as a Dietitian, otherwise a Nutritionist.
export function nutritionRoleForCredential(credential) {
  const c = String(credential || '').toLowerCase();
  return (c === 'rd' || c === 'rdn') ? 'dietitian' : 'nutritionist';
}
