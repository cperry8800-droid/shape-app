// Which coach app opens a plan from Nora's "Open in builder" card (`shape:openCoachPlan`).
//
// The trainer shell answers a trainer's program, the nutritionist shell a nutrition plan
// (`planKind: 'meal_plan'`: a meal plan, program or diet). Nora offers a coach every drafting action
// for the roles the account HOLDS, not only the one on screen, so a trainer who is also a
// nutritionist can have a nutrition plan drafted from the trainer app, where no shell answers its
// card (Codex on #2594). The app's root then switches to the coach app the plan belongs to, as
// Profile mode does, and hands the request over: the shell it mounts takes it on mount.
//
// PURE but for the handoff, which is a window property the root writes and one shell takes.

const NUTRITION = ['nutritionist', 'dietitian'];
const KEY = '__bsPendingCoachPlan';
// A handoff older than this was never taken (the switch did not happen); it is not opened later.
export const COACH_PLAN_HANDOFF_MS = 15000;

const isNutritionPlan = (detail) => !!detail && detail.planKind === 'meal_plan';

/** The coach roles an account holds (its role and its roles[]), in the app's role names. */
export function heldCoachRoles(profile) {
  const p = profile && typeof profile === 'object' ? profile : {};
  const raw = [p.role, ...(Array.isArray(p.roles) ? p.roles : [])];
  const norm = raw
    .map((x) => String(x || '').toLowerCase())
    .map((x) => (x === 'nutrition' ? 'nutritionist' : x))
    .filter((x) => x === 'trainer' || NUTRITION.includes(x));
  return Array.from(new Set(norm));
}

/**
 * The coach app to switch to for a card's plan, or null: when the app on screen answers it, when
 * the account holds no role that does, or when the card names no plan.
 */
export function coachPlanSwitch(detail, activeRole, held) {
  if (!detail || typeof detail.planId !== 'string' || !detail.planId) return null;
  const fits = isNutritionPlan(detail) ? (r) => NUTRITION.includes(r) : (r) => r === 'trainer';
  if (fits(activeRole)) return null;
  return (Array.isArray(held) ? held : []).find(fits) || null;
}

/** The root keeps the request for the shell it is switching to. */
export function holdCoachPlan(w, detail, now = Date.now()) {
  if (!w || !detail) return;
  w[KEY] = {
    at: now,
    detail: {
      planId: detail.planId,
      clientId: typeof detail.clientId === 'string' && detail.clientId ? detail.clientId : null,
      planKind: detail.planKind || null,
    },
  };
}

/**
 * A shell, on mount, takes the request held for it: `nutrition` true for the nutritionist shell.
 * One held for the other shell is left; one past its time is dropped.
 */
export function takeCoachPlan(w, nutrition, now = Date.now()) {
  const held = w && w[KEY];
  if (!held || !held.detail) return null;
  if (!(now - held.at >= 0 && now - held.at <= COACH_PLAN_HANDOFF_MS)) { delete w[KEY]; return null; }
  if (isNutritionPlan(held.detail) !== !!nutrition) return null;
  delete w[KEY];
  return held.detail;
}
