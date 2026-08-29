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
 *
 * ⚠ BOTH `roles` AND `role` ARE PASSED THROUGH, AND CHOOSING BETWEEN THEM IS NOT
 * THIS FILE'S JOB — a defect I shipped in the first cut of this component and
 * caught only in the self-review. It took the array alone, so a caller that
 * pre-picked one lost the other, and `profiles.roles` is `NOT NULL DEFAULT
 * '{}'::text[]` — an EMPTY array is the column's default, and 2 of the 4 live
 * accounts sit in exactly that state with a real singular `role`. `rolesOf`
 * already falls back on `arr && arr.length`; handing it only the empty array
 * left it nothing to fall back TO, so a trainer in that state would have
 * reported `roles: ''` and `is_coach: false` — a coach recorded as not a coach,
 * which is the fabrication class this module exists to prevent. Pass the raw
 * fields; let the one definition decide.
 */
export default function SentryUser({
  id,
  roles,
  role,
}: {
  id: string;
  roles?: string[] | null;
  role?: string | null;
}) {
  // ⚠ SET DURING RENDER, NOT ONLY IN THE EFFECT — an effect runs after COMMIT, so
  // a sibling that throws during the initial render or hydration is caught by
  // `error.tsx` before this component has ever run, and reports anonymously. An
  // initial-render crash is the most valuable error this surface can report, and
  // this repo has already paid for that exact ordering once: the static site's
  // Sentry loader was `appendChild`'d (async by default) and so lost every
  // page-startup crash until it was made a real deferred tag ahead of the app.
  // React renders depth-first in order, so running here — before the siblings
  // below this element in the tree — closes the window.
  //
  // ⚠ WINDOW-GUARDED, AND THAT GUARD IS LOAD-BEARING. A client component's body
  // also executes during SSR, where the Sentry scope is a SERVER global shared
  // across concurrent requests — setting a user there would attribute one
  // member's errors to another. This is the cross-account leak class this repo
  // has fixed before (the mobile `_followCache`), and the guard is the only
  // thing standing between this component and it.
  //
  // Safe to repeat: `setUser` is idempotent with the same value, so a render
  // React discards (StrictMode's double-invoke, a Suspense retry) costs nothing.
  if (typeof window !== 'undefined') {
    try {
      Sentry.setUser(bsSentryUser({ id, roles, role }, id));
    } catch {
      /* inert without a DSN, and never the cause of a page failure */
    }
  }

  useEffect(() => {
    // Re-applied on commit so a genuine identity CHANGE lands even when the
    // render-phase call above already ran for the previous value.
    // Never throw: this runs inside a render tree whose errors the boundary
    // reports to Sentry, so a throw here would turn the reporting layer into a
    // source of the very crashes it exists to record.
    try {
      Sentry.setUser(bsSentryUser({ id, roles, role }, id));
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
    // does not re-fire, while a genuine role change does. `role` is a scalar and
    // compares by value.
  }, [id, roles ? roles.join(',') : '', role ?? '']);

  return null;
}
