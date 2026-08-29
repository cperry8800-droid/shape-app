'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/nextjs';
import { bsSentryUser } from '@/lib/sentry-context.mjs';

/**
 * Attaches the signed-in member's PII-free context to browser-side Sentry events.
 *
 * ⚠ WHY A COMPONENT AND NOT THE INIT. `instrumentation-client.ts` runs BEFORE
 * hydration, so no session exists there — and unlike the mobile app, `src/` has
 * ZERO `onAuthStateChange`: auth here is entirely server-side (`getUser()` in
 * server components and route handlers), so there is no client chokepoint every
 * identity transition already passes through. What there IS, on every signed-in
 * Next route, is a server component that has already resolved the user — so the
 * identity is passed DOWN rather than re-fetched, which costs no round-trip and
 * cannot disagree with the gate that let the page render.
 *
 * ⚠ THE DERIVATION IS NOT REPEATED HERE. `bsSentryUser` is the single definition
 * of what may ever be said about a person (id, roles, is_coach — never email,
 * name, phone, date_of_birth, location or stripe_customer_id, all of which #1851
 * restricted at the DATABASE precisely because they were over-readable). This
 * file only supplies the inputs.
 *
 * ⚠ ROLES ARE OPTIONAL AND HONESTLY ABSENT. An admin board resolves its user
 * through `requireAdminUser()`, which returns `{ id, email }` and no profile —
 * so it passes the id alone and the context carries `roles: ''`. That is the
 * canonical module's own behaviour for an unresolved profile ("roles come from
 * the profile only, so they are honestly absent rather than guessed"), not a
 * shortcut invented here.
 */
export default function SentryUser({
  id,
  roles,
}: {
  id: string;
  roles?: string[] | null;
}) {
  useEffect(() => {
    // Never throw: this runs inside a render tree whose errors the boundary
    // reports to Sentry, so a throw here would turn the reporting layer into a
    // source of the very crashes it exists to record.
    try {
      Sentry.setUser(bsSentryUser(roles ? { id, roles } : null, id));
    } catch {
      /* inert without a DSN, and never the cause of a page failure */
    }
    return () => {
      // Clear on unmount. Leaving the previous account's tags standing across a
      // sign-out is the cross-account leak class this repo has already fixed
      // once (the mobile `_followCache`).
      try {
        Sentry.setUser(null);
      } catch {
        /* nothing to clear */
      }
    };
    // `roles` is an array identity; join it so a re-render with an equal array
    // does not re-fire, while a genuine role change does.
  }, [id, roles ? roles.join(',') : '']);

  return null;
}
