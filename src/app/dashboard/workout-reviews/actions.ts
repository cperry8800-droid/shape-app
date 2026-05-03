'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';

export async function addWorkoutReviewNote(
  formData: FormData
): Promise<void> {
  const sessionId = String(formData.get('session_id') ?? '').trim();
  const providerRole = String(formData.get('provider_role') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();

  if (!sessionId || !body) throw new Error('Session and note are required.');
  if (!['trainer', 'nutritionist'].includes(providerRole)) {
    throw new Error('Invalid provider role.');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in.');

  const providerTable = providerRole === 'trainer' ? 'trainers' : 'nutritionists';
  const { data: providerRow, error: providerError } = await supabase
    .from(providerTable)
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  if (providerError) throw new Error(providerError.message);
  if (!providerRow) throw new Error('No linked provider profile found for this account.');

  const { error } = await supabase.from('coach_workout_review_notes').insert({
    session_id: sessionId,
    reviewer_id: user.id,
    provider_id: (providerRow as { id: number }).id,
    provider_role: providerRole,
    body,
    visibility: 'client',
  });

  if (error) throw new Error(error.message);

  revalidatePath('/dashboard/workout-reviews');
  revalidatePath(`/dashboard/${providerRole}`);
}
