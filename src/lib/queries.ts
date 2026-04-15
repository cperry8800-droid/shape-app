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
  const { data, error } = await supabase
    .from('trainers')
    .select('*, workouts:trainer_workouts(*, sample_days:workout_sample_days(*))')
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
