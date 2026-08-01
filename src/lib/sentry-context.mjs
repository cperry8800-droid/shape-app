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
 *
 * ⚠ Never throws. This runs while Sentry is building an error report for a DIFFERENT
 * crash — a throw here would replace that original error with a stack trace pointing
 * at this file, which is the exact failure this whole tracking layer exists to avoid.
 * A throwing getter or a `get`-trapping Proxy anywhere on `profile` (id, roles, an
 * array element read during the filter/sort/join) is caught and treated as "no usable
 * context" — deliberately swallowed, not re-raised, and not a sign the caller is
 * broken. Coverage for exactly this is in the test file (throwing getters + a
 * get-trapping Proxy), so a real bug in the derivation itself still shows up in CI —
 * this catch does not make the module untestable, it makes it total.
 */
export function bsSentryUser(profile) {
  try {
    if (!profile || typeof profile !== 'object' || Array.isArray(profile)) return null;
    const id = typeof profile.id === 'string' && profile.id ? profile.id : null;
    if (!id) return null;

    const roles = rolesOf(profile);
    // Built in one expression: if deriving `is_coach` throws after `roles` already
    // resolved, the throw propagates out of this `return` and is caught below — there
    // is no code path that returns a partial object with a defaulted `is_coach`.
    return {
      id,
      roles: roles.join(','),
      // The common filter. `roles` keeps the detail; this keeps the query short.
      is_coach: roles.some((r) => isCoachRole(r)),
    };
  } catch {
    return null;
  }
}

/**
 * The release string. Identical on web and mobile so one deploy's errors correlate
 * — without it, joining a mobile crash to a server error means comparing clocks.
 *
 * ⚠ Returns undefined rather than a placeholder when unknown. A fabricated release
 * silently merges every unversioned deploy into one bucket.
 *
 * ⚠ Never throws, same reasoning as `bsSentryUser` above. A throwing getter on
 * `SHAPE_RELEASE`/`VERCEL_GIT_COMMIT_SHA` is caught and reads as "no release" rather
 * than crashing the caller mid error-report.
 */
export function bsSentryRelease(env) {
  try {
    const e = env && typeof env === 'object' ? env : {};
    const v = e.SHAPE_RELEASE || e.VERCEL_GIT_COMMIT_SHA || '';
    return typeof v === 'string' && v ? v : undefined;
  } catch {
    return undefined;
  }
}
