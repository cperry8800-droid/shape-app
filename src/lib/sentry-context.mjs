// src/lib/sentry-context.mjs
//
// What a Sentry event is allowed to say about a person. Pure — no SDK import, no
// network, no env read except through an explicitly passed object, so the rules
// are testable without a DSN.
//
// ⚠ NO PII, and this is not a style preference. #1851 restricted `profiles`
// email/phone/date_of_birth/location/stripe_customer_id at the DATABASE because
// they were readable by any signed-in member. Shipping the same fields to a
// third-party service would undo that at a different layer.
import { isCoachRole } from './roles.mjs';

/** Named so a reviewer can grep for them, and so a test can assert their absence. */
export const BS_SENTRY_DENIED_KEYS = [
  'email', 'full_name', 'name', 'phone', 'date_of_birth', 'location',
  'stripe_customer_id', 'username', 'ip_address',
];

/**
 * The roles a profile carries, as a sorted array of strings.
 *
 * ⚠ `roles` is an ARRAY and `role` is the legacy singular fallback — see
 * `public/supabase.js:83`. A dual-role account is real, so this must not collapse
 * to one value.
 */
function rolesOf(profile) {
  const arr = Array.isArray(profile.roles) ? profile.roles : null;
  const list = arr && arr.length ? arr : (profile.role ? [profile.role] : []);
  return list.filter((r) => typeof r === 'string' && r).sort();
}

/**
 * The user context for an event, or null.
 *
 * ⚠ Returns null rather than a partial object when there is no id: a user context
 * without an identifier groups unrelated people together, which is worse than none.
 */
export function bsSentryUser(profile) {
  if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
  const id = typeof profile.id === 'string' && profile.id ? profile.id : null;
  if (!id) return null;

  const roles = rolesOf(profile);
  return {
    id,
    roles: roles.join(','),
    // The common filter. `roles` keeps the detail; this keeps the query short.
    is_coach: roles.some((r) => isCoachRole(r)),
  };
}

/**
 * The release string. Identical on web and mobile so one deploy's errors correlate
 * — without it, joining a mobile crash to a server error means comparing clocks.
 *
 * ⚠ Returns undefined rather than a placeholder when unknown. A fabricated release
 * silently merges every unversioned deploy into one bucket.
 */
export function bsSentryRelease(env) {
  const e = env && typeof env === 'object' ? env : {};
  const v = e.SHAPE_RELEASE || e.VERCEL_GIT_COMMIT_SHA || '';
  return typeof v === 'string' && v ? v : undefined;
}
