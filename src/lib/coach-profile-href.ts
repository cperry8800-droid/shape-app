import { createAdminClient } from '@/lib/supabase/admin';
import { coachProfilePath } from '@/lib/coach-profile-path.mjs';

// The website profile of the coach behind a listing id, for the checkout actions' back
// link and error returns. One read of the listing's owner and name; a failed read falls
// back to the marketplace (coachProfilePath's last case) rather than a broken profile link.
export async function coachProfileHref(role: 'trainer' | 'nutritionist', providerId: number): Promise<string> {
  try {
    const { data } = await createAdminClient()
      .from(role === 'trainer' ? 'trainers' : 'nutritionists')
      .select('owner_id, name')
      .eq('id', providerId)
      .maybeSingle();
    return coachProfilePath(role, data);
  } catch {
    return coachProfilePath(role, null);
  }
}
