'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';

type ProviderRole = 'trainer' | 'nutritionist';

type ProviderApplication = {
  id: string;
  provider_type: ProviderRole;
  first_name: string;
  last_name: string;
  email: string;
  phone: string | null;
  location: string | null;
  specialty: string | null;
  years_experience: string | null;
  monthly_price: string | null;
  details: Record<string, unknown> | null;
};

function clean(value: FormDataEntryValue | null, max = 2000): string {
  return String(value ?? '').trim().slice(0, max);
}

function parsePriceCents(value: string | null): number | null {
  if (!value) return null;
  const match = value.replace(/,/g, '').match(/\d+(\.\d{1,2})?/);
  if (!match) return null;
  return Math.round(Number(match[0]) * 100);
}

function parsePriceDollars(value: string | null): number | null {
  const cents = parsePriceCents(value);
  return cents == null ? null : Math.round(cents / 100);
}

function yearsLabel(value: string | null): string {
  const years = value?.match(/\d+/)?.[0];
  return years ? `${years} years` : '7+ years';
}

function titleCase(value: string): string {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

async function findAuthUserByEmail(admin: ReturnType<typeof createAdminClient>, email: string) {
  const needle = email.toLowerCase();
  for (let page = 1; page <= 5; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((user) => user.email?.toLowerCase() === needle);
    if (match) return match;
    if (data.users.length < 1000) break;
  }
  return null;
}

async function resolveOrInviteProviderUser(
  admin: ReturnType<typeof createAdminClient>,
  application: ProviderApplication
) {
  const existing = await findAuthUserByEmail(admin, application.email);
  if (existing) return existing;

  const { data, error } = await admin.auth.admin.inviteUserByEmail(application.email, {
    data: {
      role: application.provider_type,
      full_name: `${application.first_name} ${application.last_name}`.trim(),
    },
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com'}/auth/callback?next=/dashboard/settings`,
  });
  if (error) throw error;
  if (!data.user) throw new Error('Supabase did not return an invited user.');
  return data.user;
}

async function updateProfileRole(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  role: ProviderRole,
  fullName: string
) {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, roles, full_name')
    .eq('id', userId)
    .maybeSingle();

  const existingRoles = Array.isArray(profile?.roles) ? profile.roles : [];
  const roles = Array.from(new Set([...existingRoles, role]));

  const { error } = await admin.from('profiles').upsert({
    id: userId,
    role: profile?.role ?? role,
    roles,
    full_name: profile?.full_name || fullName,
  });
  if (error) throw error;
}

async function publishProviderRow(
  admin: ReturnType<typeof createAdminClient>,
  application: ProviderApplication,
  ownerId: string
) {
  const table = application.provider_type === 'trainer' ? 'trainers' : 'nutritionists';
  const fullName = `${application.first_name} ${application.last_name}`.trim();
  const specialty = application.specialty || (application.provider_type === 'trainer' ? 'Strength training' : 'Nutrition coaching');
  const category = titleCase(specialty.split(/[,.|/]/)[0] || specialty);
  const price = parsePriceDollars(application.monthly_price);
  const details = application.details ?? {};
  const credential =
    typeof details.certifications === 'string'
      ? details.certifications.slice(0, 120)
      : typeof details.credentials === 'string'
        ? details.credentials.slice(0, 120)
        : 'Verified by Shape';

  const basePayload = {
    owner_id: ownerId,
    name: fullName,
    specialty,
    category,
    price,
    rating: 0,
    subscribers: 0,
    experience: yearsLabel(application.years_experience),
    credential,
    credential_full: credential,
    specialty_type: specialty,
    bio: typeof details.bio === 'string'
      ? details.bio.slice(0, 1000)
      : `${fullName} is a verified Shape ${application.provider_type} specializing in ${specialty}.`,
    color: application.provider_type === 'trainer' ? '#0ac5a8' : '#d39b28',
    tags: [specialty, category, application.location].filter(Boolean),
    featured: false,
    at_capacity: false,
    ...(application.provider_type === 'trainer'
      ? { trainer_of_month: false, totm_quote: null, session_price: price }
      : {
          nutritionist_of_month: false,
          notm_quote: null,
          services: ['Consultation', 'Plans', 'Templates'],
          meal_plan_price: price,
        }),
  };

  const { data: existing, error: lookupError } = await admin
    .from(table)
    .select('id')
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (existing?.id) {
    const { data, error } = await admin
      .from(table)
      .update(basePayload)
      .eq('id', existing.id)
      .select('id')
      .single();
    if (error) throw error;
    return data.id as number;
  }

  const { data, error } = await admin
    .from(table)
    .insert(basePayload)
    .select('id')
    .single();
  if (error) throw error;
  return data.id as number;
}

export async function markApplicationInReview(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const admin = createAdminClient();

  const { error } = await admin
    .from('provider_applications')
    .update({
      status: 'in_review',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    })
    .eq('id', applicationId);
  if (error) throw error;

  revalidatePath('/dashboard/applications');
  redirect('/dashboard/applications?updated=in_review');
}

export async function rejectApplication(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const admin = createAdminClient();

  const { error } = await admin
    .from('provider_applications')
    .update({
      status: 'rejected',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || 'Rejected from admin review.',
    })
    .eq('id', applicationId);
  if (error) throw error;

  revalidatePath('/dashboard/applications');
  redirect('/dashboard/applications?updated=rejected');
}

export async function approveApplication(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const admin = createAdminClient();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('*')
    .eq('id', applicationId)
    .single();
  if (appError) throw appError;

  const typed = application as ProviderApplication;
  if (typed.provider_type !== 'trainer' && typed.provider_type !== 'nutritionist') {
    throw new Error('Application has an invalid provider type.');
  }

  const authUser = await resolveOrInviteProviderUser(admin, typed);
  const fullName = `${typed.first_name} ${typed.last_name}`.trim();
  await updateProfileRole(admin, authUser.id, typed.provider_type, fullName);
  const providerId = await publishProviderRow(admin, typed, authUser.id);

  const nextDetails = {
    ...(typed.details ?? {}),
    approved_provider: {
      provider_role: typed.provider_type,
      provider_id: providerId,
      owner_id: authUser.id,
      approved_at: new Date().toISOString(),
    },
  };

  const { error: updateError } = await admin
    .from('provider_applications')
    .update({
      status: 'approved',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || `Approved and published as ${typed.provider_type} #${providerId}.`,
      details: nextDetails,
    })
    .eq('id', applicationId);
  if (updateError) throw updateError;

  revalidatePath('/dashboard/applications');
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');
  redirect('/dashboard/applications?updated=approved');
}
