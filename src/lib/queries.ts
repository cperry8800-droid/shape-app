// Server-side data-fetching helpers.
// Use these from Server Components to render marketplace pages.

import { createClient } from './supabase/server';
import type { Trainer, Nutritionist, Gym } from './types';

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
