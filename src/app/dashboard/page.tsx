// The legacy Next.js dashboard has been RETIRED in favor of the newdesign
// portal (public/newdesign/*.html). This route survives only as a redirect so
// the handful of `/dashboard` fallback targets — password reset, the Stripe
// error pages, the admin applications non-admin fallback — land somewhere
// sensible: the role-appropriate newdesign dashboard. The admin-only
// /dashboard/applications and /dashboard/claim tools still live under here.

import { redirect } from 'next/navigation';
import { getCurrentUserAndProfile } from '@/lib/queries';

export const metadata = { title: 'Dashboard — Shape' };

export default async function DashboardIndex() {
  const ctx = await getCurrentUserAndProfile();
  const role = ctx?.profile?.role ?? 'client';
  redirect(
    role === 'trainer'
      ? '/newdesign/TrainerDashboard.html'
      : role === 'nutritionist'
        ? '/newdesign/NutritionistDashboard.html'
        : '/newdesign/ClientDashboard.html'
  );
}
