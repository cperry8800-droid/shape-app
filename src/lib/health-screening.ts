// The health screening before hiring a coach (client-onboarding review, fix 2b; owner decision 2:
// health screening only for members who want personal coaching).
//
// ⚠ ONLY A YES IS SCREENED AT FIRST RUN (fix 2a), SO A NO WHO HIRES A COACH IS SCREENED HERE.
// Every coach checkout that HIRES a coach asks first: a monthly coaching subscription (a trainer
// or a nutritionist), or a one-time session with a trainer. A program, a single workout or a meal
// plan is a product, not a hire, and is not held to it. The answer is refused with the code
// `screening_required`, and each surface sends the member to its screening and back: the app's
// own form, and the website's (Settings → Health profile).
//
// The screening is the member's own `user_goals('health_profile')` document; it is complete when
// it carries `consentAt` (both forms write it when the member confirms their answers).

import type { SupabaseClient } from '@supabase/supabase-js';

export const SCREENING_REQUIRED = {
  error: 'Complete your health screening before hiring a coach. It is shared with the coaches you hire, so they can train you safely.',
  code: 'screening_required',
} as const;

/** Whether this purchase hires a coach, and so needs the screening first. */
export function hiresCoach({ subscription, providerRole, product }: { subscription: boolean; providerRole: string; product: boolean }): boolean {
  if (subscription) return true;
  if (product) return false;
  return providerRole === 'trainer';
}

/**
 * Whether the member has completed the screening, read on their OWN client (user_goals is theirs
 * by RLS). Throws when it could not be read: callers refuse, and no payment starts on a screening
 * we could not read.
 */
export async function hasCompletedScreening(client: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await client
    .from('user_goals')
    .select('data')
    .eq('user_id', userId)
    .eq('kind', 'health_profile')
    .maybeSingle();
  if (error) throw error;
  const doc = (data as { data?: unknown } | null)?.data;
  return !!(doc && typeof doc === 'object' && (doc as { consentAt?: unknown }).consentAt);
}

/** The website's screening (Settings → Health profile), coming back to `next` (a same-site path) once saved. */
export function screeningHref(next: string): string {
  return `/newdesign/ClientApp.html?screening=required&next=${encodeURIComponent(next)}#settings`;
}
