// This week's reading of the adherence figure a coach's goal can bind to, recorded by the analytics
// routes as they compute it (trainers: session adherence; nutritionists: protein adherence). The Goal
// page projects the goal's pace from the weeks (public/newdesign/coachGoals.js, read back through
// GET /api/coach/goal-readings); no other history of the figure exists.
//
// Written with the coach's own session through record_coach_goal_reading
// (supabase-migrations/2026-11-05-coach-goal-readings.sql), which writes only for a listing the caller
// owns and keeps a week's latest. It never throws and never fails the read that calls it: an unread
// figure (null) records nothing, and an error (the migration not run yet) is logged.
import type { SupabaseClient } from '@supabase/supabase-js';

export async function recordGoalReading(
  supabase: SupabaseClient,
  role: 'trainer' | 'nutritionist',
  providerId: number,
  value: number | null
): Promise<boolean> {
  if (value == null || !Number.isFinite(value)) return false;
  try {
    const { error } = await supabase.rpc('record_coach_goal_reading', {
      p_role: role,
      p_provider_id: providerId,
      p_metric: 'adherencePct',
      p_value: value,
    });
    if (error) {
      console.warn(`[shape-app] ${role} analytics: the goal reading was not recorded:`, error.message);
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`[shape-app] ${role} analytics: the goal reading was not recorded:`, e instanceof Error ? e.message : e);
    return false;
  }
}
