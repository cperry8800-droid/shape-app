// Server-side data-fetching helpers.
// Use these from Server Components to render marketplace pages.

import { createClient } from './supabase/server';
import type { Trainer, Nutritionist, Gym, Profile, SessionBooking } from './types';

/**
 * Returns the signed-in user and their profile row, or null if not signed in.
 * Called from the /dashboard layout to gate routes and pick the right shell.
 */
export async function getCurrentUserAndProfile(): Promise<
  { userId: string; email: string | null; profile: Profile | null } | null
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  return {
    userId: user.id,
    email: user.email ?? null,
    profile: (profile as Profile | null) ?? null,
  };
}

/**
 * All active (or trialing) subscriptions for the signed-in user. RLS filters
 * this to rows where auth.uid() = client_id.
 */
export async function getMySubscriptions(): Promise<
  Array<{
    id: string;
    provider_id: number;
    provider_role: 'trainer' | 'nutritionist';
    status: string;
    price_cents: number | null;
    current_period_end: string | null;
    stripe_subscription_id: string | null;
  }>
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, provider_id, provider_role, status, price_cents, current_period_end, stripe_subscription_id')
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[shape-app] getMySubscriptions error', error);
    return [];
  }
  return (data ?? []) as Array<{
    id: string;
    provider_id: number;
    provider_role: 'trainer' | 'nutritionist';
    status: string;
    price_cents: number | null;
    current_period_end: string | null;
    stripe_subscription_id: string | null;
  }>;
}

/**
 * True if the signed-in user has an active/trialing subscription to this
 * specific provider. Cheap — used to swap the Subscribe button for a
 * "Subscribed" badge on detail pages.
 */
export async function isSubscribedTo(
  providerRole: 'trainer' | 'nutritionist',
  providerId: number
): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from('subscriptions')
    .select('id')
    .eq('client_id', user.id)
    .eq('provider_role', providerRole)
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing', 'past_due'])
    .maybeSingle();

  return !!data;
}

/**
 * Provider row(s) owned by the signed-in user. Returns an object with
 * optional `trainer` and `nutritionist` rows — a user can own both.
 * Used by the trainer/nutritionist dashboards to show "your business"
 * stats. Depends on the owner_id columns from the 2026-04-14 migration.
 */
export async function getMyProviderRows(): Promise<{
  trainer: { id: number; name: string; subscribers: number | null } | null;
  nutritionist: { id: number; name: string; subscribers: number | null } | null;
  gym: { id: number; name: string; members: number | null } | null;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { trainer: null, nutritionist: null, gym: null };

  const [t, n, g] = await Promise.all([
    supabase.from('trainers').select('id, name, subscribers').eq('owner_id', user.id).maybeSingle(),
    supabase.from('nutritionists').select('id, name, subscribers').eq('owner_id', user.id).maybeSingle(),
    supabase.from('gyms').select('id, name, members').eq('owner_id', user.id).maybeSingle(),
  ]);

  return {
    trainer: (t.data as { id: number; name: string; subscribers: number | null } | null) ?? null,
    nutritionist:
      (n.data as { id: number; name: string; subscribers: number | null } | null) ?? null,
    gym: (g.data as { id: number; name: string; members: number | null } | null) ?? null,
  };
}

/**
 * Active subscribers to the provider row the signed-in user owns, filtered
 * by role. RLS lets providers read subscriptions where they own the matching
 * provider row (via the "providers read own subscriptions" policy).
 *
 * Returns an empty array if the user doesn't own a provider row of that role.
 */
export async function getMyProviderSubscribers(
  role: 'trainer' | 'nutritionist'
): Promise<
  Array<{
    id: string;
    client_id: string;
    status: string;
    price_cents: number | null;
    current_period_end: string | null;
    created_at: string;
  }>
> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Find the provider row id this user owns for this role.
  const providerTable = role === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: providerRow } = await supabase
    .from(providerTable)
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();
  if (!providerRow) return [];

  const { data, error } = await supabase
    .from('subscriptions')
    .select('id, client_id, status, price_cents, current_period_end, created_at')
    .eq('provider_role', role)
    .eq('provider_id', (providerRow as { id: number }).id)
    .in('status', ['active', 'trialing', 'past_due'])
    .order('created_at', { ascending: false });
  if (error) {
    console.error('[shape-app] getMyProviderSubscribers error', error);
    return [];
  }
  return (data ?? []) as Array<{
    id: string;
    client_id: string;
    status: string;
    price_cents: number | null;
    current_period_end: string | null;
    created_at: string;
  }>;
}

/**
 * Upcoming + recent sessions for the signed-in user, in either role (client or
 * provider). RLS on `sessions` already restricts this to rows the user is part
 * of, so no extra filter is needed.
 */
export async function getMySessions(): Promise<SessionBooking[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('scheduled_at', { ascending: false })
    .limit(50);
  if (error) {
    console.error('[shape-app] getMySessions error', error);
    return [];
  }
  return (data ?? []) as SessionBooking[];
}

export async function getTrainers(): Promise<Trainer[]> {
  const supabase = await createClient();
  // Hide seed rows with no linked Supabase user — they have no Stripe
  // Connect account so subscribe / book would dead-end at checkout.
  const { data, error } = await supabase
    .from('trainers')
    .select('*, workouts:trainer_workouts(*, sample_days:workout_sample_days(*))')
    .not('owner_id', 'is', null)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[shape-app] getTrainers error', error);
    return [];
  }
  return (data ?? []) as Trainer[];
}

export async function getNutritionists(): Promise<Nutritionist[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nutritionists')
    .select('*, plans:nutritionist_plans(*, sample_days:plan_sample_days(*))')
    .not('owner_id', 'is', null)
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[shape-app] getNutritionists error', error);
    return [];
  }
  return (data ?? []) as Nutritionist[];
}

export async function getGyms(): Promise<Gym[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('gyms')
    .select('*')
    .order('sort_order', { ascending: true });
  if (error) {
    console.error('[shape-app] getGyms error', error);
    return [];
  }
  return (data ?? []) as Gym[];
}

export async function getTrainerById(id: number): Promise<Trainer | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('trainers')
    .select('*, workouts:trainer_workouts(*, sample_days:workout_sample_days(*))')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[shape-app] getTrainerById error', error);
    return null;
  }
  return (data as Trainer) ?? null;
}

export async function getNutritionistById(id: number): Promise<Nutritionist | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('nutritionists')
    .select('*, plans:nutritionist_plans(*, sample_days:plan_sample_days(*))')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[shape-app] getNutritionistById error', error);
    return null;
  }
  return (data as Nutritionist) ?? null;
}

export async function getGymById(id: number): Promise<Gym | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('gyms')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) {
    console.error('[shape-app] getGymById error', error);
    return null;
  }
  return (data as Gym) ?? null;
}
