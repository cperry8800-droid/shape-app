'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireAdminUser } from '@/lib/admin-access';
import { sendEmail } from '@/lib/email';
// The shared 18+ derivation — approval must not provision a coach the gates cannot place.
import { isMinorFromDob } from '@/lib/age-derive.mjs';
import { approvalEmail, rejectionEmail, siteUrl } from '@/lib/coach-application-emails';
import { EXPERIENCE_STANDARD_YEARS, belowExperienceStandard, experienceYears } from '@/lib/provider-experience.mjs';
import {
  BackgroundCheckStatus,
  asRecord,
  isBackgroundCheckClear,
  textValue,
  withAdminBackgroundCheck,
} from '@/lib/provider-applications';

type ProviderRole = 'trainer' | 'nutritionist';
type ApplicationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';

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
  dob: string | null;
  details: Record<string, unknown> | null;
  status: ApplicationStatus;
  /** Moved by the table's touch trigger on every write: the approval claim compares it. */
  updated_at?: string | null;
  /** The reviewer's own record (2026-10-12): written only by these actions. */
  admin_review?: Record<string, unknown> | null;
};

const PAGE = '/dashboard/applications';
// How long an Approve's claim on an application holds off another Approve. Longer than any one
// approval takes (a server action is cut off well before it); a claim older than this belongs to
// a request that died, and a new Approve may take the application over.
const APPROVAL_CLAIM_MS = 10 * 60 * 1000;
const MIGRATION = 'supabase-migrations/2026-10-12-coach-application-review.sql';

function clean(value: FormDataEntryValue | null, max = 2000): string {
  return String(value ?? '').trim().slice(0, max);
}

/** Back to the review page with a message for the admin. Throws (Next's redirect), so never inside a try. */
function backToReview(query: Record<string, string>): never {
  redirect(`${PAGE}?${new URLSearchParams(query).toString()}`);
}

/** A read or write naming `admin_review` before the 2026-10-12 migration has run fails 42703/PGRST204: say so. */
function reviewWriteError(error: { code?: string; message?: string }): Error {
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    return new Error(`The admin_review column is missing. Run ${MIGRATION} before reviewing applications.`);
  }
  return error instanceof Error ? error : new Error(error?.message || 'Application update failed.');
}

async function updateBackgroundCheckStatus(
  formData: FormData,
  status: Exclude<BackgroundCheckStatus, 'consent_received'>
): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const admin = createAdminClient();
  const now = new Date().toISOString();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('status, admin_review')
    .eq('id', applicationId)
    .single();
  if (appError) throw reviewWriteError(appError);

  // ⚠ A BACKGROUND-CHECK CLICK DOES NOT REOPEN AN APPROVED APPLICATION. It used to set
  // status 'in_review' unconditionally, so a click on an approved card made a live coach's
  // application read as undecided (and approvable again).
  if (application?.status === 'approved') backToReview({ notice: 'locked_approved' });

  // The check is recorded in admin_review, never in the applicant's `details`.
  const nextReview = withAdminBackgroundCheck(application?.admin_review, status, adminUser.id, now);
  const { error } = await admin
    .from('provider_applications')
    .update({
      status: 'in_review',
      reviewed_by: adminUser.id,
      reviewed_at: now,
      review_notes: notes || null,
      admin_review: nextReview,
    })
    .eq('id', applicationId)
    .neq('status', 'approved');
  if (error) throw reviewWriteError(error);

  revalidatePath(PAGE);
  backToReview({ updated: `background_${status}` });
}

export async function markBackgroundCheckRequested(formData: FormData): Promise<void> {
  await updateBackgroundCheckStatus(formData, 'requested');
}

export async function markBackgroundCheckNeedsReview(formData: FormData): Promise<void> {
  await updateBackgroundCheckStatus(formData, 'needs_review');
}

export async function markBackgroundCheckClear(formData: FormData): Promise<void> {
  await updateBackgroundCheckStatus(formData, 'clear');
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

/**
 * The applicant's single-session (trainer) or single-consult (nutritionist) price, in dollars
 * with cents, or null when they gave none. ⚠ NEVER THE MONTHLY PRICE: approval used to copy the
 * monthly rate into the one-time price column, so a $280/month trainer sold one session at $280.
 */
function parseOneTimePrice(value: unknown): number | null {
  const cents = parsePriceCents(textValue(value) || null);
  // numeric(10,2) holds up to 99,999,999.99.
  if (cents == null || cents <= 0 || cents >= 10_000_000_000) return null;
  return cents / 100;
}

/**
 * The listing's experience line: the fewest years the answer states. ⚠ NO ANSWER IS NO LINE: this
 * used to fall back to "7+ years", so an application without an answer was published claiming
 * seven.
 */
function yearsLabel(value: string | null): string | null {
  const years = experienceYears(value);
  if (years === null) return null;
  if (years === 0) return 'Under 1 year';
  return years === 1 ? '1 year' : `${years} years`;
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

type ProvisionedUser = {
  user: { id: string; email?: string | null };
  /** A one-time link that signs a NEW account in and opens the set-password page; null for an existing account. */
  setPasswordUrl: string | null;
  existingAccount: boolean;
};

async function resolveOrInviteProviderUser(
  admin: ReturnType<typeof createAdminClient>,
  application: ProviderApplication
): Promise<ProvisionedUser> {
  const existing = await findAuthUserByEmail(admin, application.email);
  if (existing) {
    // An account that has never signed in (an approval that stopped part-way, say) may have no
    // password at all: it gets a set-password link too, through the same route.
    if (!existing.last_sign_in_at) {
      const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: application.email });
      const tokenHash = error ? null : data?.properties?.hashed_token;
      if (tokenHash) return { user: existing, setPasswordUrl: setPasswordLink(tokenHash, 'recovery'), existingAccount: true };
    }
    // An account in use keeps its password; the approval email tells it to sign in.
    return { user: existing, setPasswordUrl: null, existingAccount: true };
  }

  // ⚠ THE INVITE LINK IS OURS, NOT SUPABASE'S. inviteUserByEmail mailed Supabase's own invite,
  // whose link comes back through the IMPLICIT flow (tokens in the URL #fragment, since an admin
  // invite has no PKCE verifier). /auth/callback only exchanges a `?code=`, so it bounced every
  // invited coach to /login?error=auth_callback_failed, and the browser client (PKCE) refuses a
  // fragment session. generateLink creates the same invited user WITHOUT sending anything and
  // hands back the hashed token; the approval email carries a link to /auth/confirm, which
  // verifies it server-side (verifyOtp with token_hash), sets the session cookies and opens the
  // set-password page.
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'invite',
    email: application.email,
    options: {
      data: {
        role: application.provider_type,
        full_name: `${application.first_name} ${application.last_name}`.trim(),
      },
    },
  });
  if (error) throw error;
  if (!data?.user) throw new Error('Supabase did not return an invited user.');
  const tokenHash = data.properties?.hashed_token;
  if (!tokenHash) throw new Error('Supabase did not return an invite token.');
  return { user: data.user, setPasswordUrl: setPasswordLink(tokenHash, 'invite'), existingAccount: false };
}

/** The emailed link: /auth/confirm verifies the hash, signs the coach in, opens the set-password page. */
function setPasswordLink(tokenHash: string, type: 'invite' | 'recovery'): string {
  const query = new URLSearchParams({ token_hash: tokenHash, type, next: '/reset-password' });
  return `${siteUrl()}/auth/confirm?${query.toString()}`;
}

async function updateProfileRole(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  role: ProviderRole,
  fullName: string,
  dob: string | null
) {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, roles, full_name, date_of_birth')
    .eq('id', userId)
    .maybeSingle();

  const existingRoles = Array.isArray(profile?.roles) ? profile.roles : [];
  const roles = Array.from(new Set([...existingRoles, role]));

  // ⚠ CARRY THE DATE OF BIRTH. An approved application provisions an auth user
  // and a coach profile, and coach roles satisfy membership automatically — so a
  // provider row with no DOB used to be an entitled, ungated account. Under the
  // read-time policy (absence no longer admits) it would instead be REFUSED, so
  // writing it here is what keeps approved coaches working. Never overwrite an
  // existing date: the DOB freeze makes the first write permanent, and a
  // service-role upsert would otherwise be a way around it.
  const { error } = await admin.from('profiles').upsert({
    id: userId,
    role: profile?.role ?? role,
    roles,
    full_name: profile?.full_name || fullName,
    ...(profile?.date_of_birth ? {} : dob ? { date_of_birth: dob } : {}),
  });
  if (error) throw error;
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

async function publishProviderRow(
  admin: ReturnType<typeof createAdminClient>,
  application: ProviderApplication,
  ownerId: string
) {
  const isTrainer = application.provider_type === 'trainer';
  const table = isTrainer ? 'trainers' : 'nutritionists';
  const fullName = `${application.first_name} ${application.last_name}`.trim();
  const specialty = application.specialty || (isTrainer ? 'Strength training' : 'Nutrition coaching');
  const category = titleCase(specialty.split(/[,.|/]/)[0] || specialty);
  const price = parsePriceDollars(application.monthly_price);
  const details = application.details ?? {};
  // The trainer's single session, or the nutritionist's single consult (their one-time price
  // column is meal_plan_price, the column the checkout and the marketplace read as their rate).
  const oneTimePrice = parseOneTimePrice(details.single_session_price);
  const credentialSource =
    textValue(details.certifications) || textValue(details.credentials) || textValue(details.certification);
  const credential = credentialSource ? credentialSource.slice(0, 120) : 'Verified by Shape';
  const bio = textValue(details.bio).trim();

  // The columns approval derives from the application, all of them the coach's to edit later.
  // Typed as a plain record: the role split makes this a union (trainer- vs nutritionist-shaped),
  // which @supabase/ssr's insert types reject as excess properties. The runtime shape matches
  // `table`, so a record is safe.
  const fromApplication: Record<string, unknown> = {
    name: fullName,
    specialty,
    category,
    price,
    experience: yearsLabel(application.years_experience),
    credential,
    credential_full: credential,
    specialty_type: specialty,
    bio: bio
      ? bio.slice(0, 1000)
      : `${fullName} is a verified Shape ${application.provider_type} specializing in ${specialty}.`,
    color: isTrainer ? '#0ac5a8' : '#d39b28',
    tags: [specialty, category, application.location].filter(Boolean),
    ...(isTrainer
      ? { session_price: oneTimePrice }
      : { services: ['Consultation', 'Plans', 'Templates'], meal_plan_price: oneTimePrice }),
  };

  const { data: existingRows, error: lookupError } = await admin
    .from(table)
    .select(['id', ...Object.keys(fromApplication)].join(', '))
    .eq('owner_id', ownerId)
    .order('id', { ascending: true })
    .limit(1);
  if (lookupError) throw lookupError;
  const existing = (Array.isArray(existingRows) ? existingRows[0] : null) as Record<string, unknown> | null;

  if (existing?.id != null) {
    // ⚠ AN EXISTING LISTING IS THE COACH'S. Re-approval used to UPDATE it with the whole
    // application payload: the coach's own name, bio, prices and tags reverted to what they
    // applied with, and rating, subscribers, featured and the of-the-month flags were reset to
    // zero. Only a column the listing has left EMPTY is filled now; the counters and flags are
    // never written to an existing row.
    const fill: Record<string, unknown> = {};
    for (const [column, value] of Object.entries(fromApplication)) {
      if (isEmptyValue(existing[column]) && !isEmptyValue(value)) fill[column] = value;
    }
    if (Object.keys(fill).length) {
      const { error } = await admin.from(table).update(fill).eq('id', existing.id);
      if (error) throw error;
    }
    return existing.id as number;
  }

  const { data, error } = await admin
    .from(table)
    .insert({
      owner_id: ownerId,
      ...fromApplication,
      rating: 0,
      subscribers: 0,
      featured: false,
      at_capacity: false,
      ...(isTrainer
        ? { trainer_of_month: false, totm_quote: null }
        : { nutritionist_of_month: false, notm_quote: null }),
    })
    .select('id')
    .single();
  if (error) {
    // One listing per role per account (2026-10-13-one-listing-per-account.sql): a listing that
    // appeared for this owner since the read above wins, and this approval uses it. Any other
    // unique violation finds no row here and is thrown as it was.
    if ((error as { code?: string }).code === '23505') {
      const { data: again, error: againError } = await admin
        .from(table)
        .select('id')
        .eq('owner_id', ownerId)
        .order('id', { ascending: true })
        .limit(1);
      if (againError) throw againError;
      const winner = (Array.isArray(again) ? again[0] : null) as { id?: number } | null;
      if (winner?.id != null) return winner.id;
    }
    throw error;
  }
  return data.id as number;
}

/** Records how the decision email went, best-effort: the decision itself is already saved. */
async function recordDecisionEmail(
  admin: ReturnType<typeof createAdminClient>,
  applicationId: string,
  review: Record<string, unknown>,
  kind: 'approval' | 'rejection',
  result: { ok: boolean; error?: string }
) {
  try {
    await admin
      .from('provider_applications')
      .update({
        admin_review: {
          ...review,
          decision_email: { kind, ok: result.ok, error: result.ok ? null : result.error ?? 'failed', at: new Date().toISOString() },
        },
      })
      .eq('id', applicationId);
  } catch (err) {
    console.error('[applications] could not record the decision email', err);
  }
}

export async function markApplicationInReview(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const admin = createAdminClient();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('status')
    .eq('id', applicationId)
    .single();
  if (appError) throw appError;
  // An approved application has a live coach behind it; "in review" would make it approvable again.
  if (application?.status === 'approved') backToReview({ notice: 'locked_approved' });

  const { error } = await admin
    .from('provider_applications')
    .update({
      status: 'in_review',
      reviewed_by: adminUser.id,
      reviewed_at: new Date().toISOString(),
      review_notes: notes || null,
    })
    .eq('id', applicationId)
    .neq('status', 'approved');
  if (error) throw error;

  revalidatePath(PAGE);
  backToReview({ updated: 'in_review' });
}

export async function rejectApplication(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  // The ONLY words of the reviewer's that reach the applicant: a separate field, empty by default.
  // The internal review notes are never sent.
  const applicantNote = clean(formData.get('applicant_note'), 2000);
  const admin = createAdminClient();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('id, status, provider_type, first_name, email, admin_review')
    .eq('id', applicationId)
    .single();
  if (appError) throw reviewWriteError(appError);
  const typed = application as Pick<ProviderApplication, 'id' | 'status' | 'provider_type' | 'first_name' | 'email' | 'admin_review'>;

  // ⚠ REJECTING AN APPROVED APPLICATION WOULD NOT TAKE THE COACH DOWN. The listing approval
  // published stays live whatever the application's status says, so a reject here only made the
  // record lie. The coach tables have no suspended/hidden column yet, and deleting a listing
  // breaks its subscriptions, so the action is refused and the page says what is missing.
  if (typed.status === 'approved') backToReview({ notice: 'reject_approved' });
  if (typed.status === 'rejected') backToReview({ notice: 'already_rejected' });

  const now = new Date().toISOString();
  const nextReview: Record<string, unknown> = {
    ...asRecord(typed.admin_review),
    applicant_note: applicantNote || null,
    decision: { decision: 'rejected', at: now, by: adminUser.id },
  };
  const { data: changed, error } = await admin
    .from('provider_applications')
    .update({
      status: 'rejected',
      reviewed_by: adminUser.id,
      reviewed_at: now,
      review_notes: notes || 'Rejected from admin review.',
      admin_review: nextReview,
    })
    .eq('id', applicationId)
    .in('status', ['pending', 'in_review', 'withdrawn'])
    .select('id');
  if (error) throw reviewWriteError(error);
  // Decided by someone else between the read and the write: they sent the email.
  if (!changed?.length) backToReview({ notice: 'already_decided' });

  revalidatePath(PAGE);
  const role: ProviderRole = typed.provider_type === 'nutritionist' ? 'nutritionist' : 'trainer';
  const mail = rejectionEmail({ firstName: typed.first_name, role, applicantNote });
  const sent = await sendEmail({ to: typed.email, ...mail });
  await recordDecisionEmail(admin, applicationId, nextReview, 'rejection', sent);
  backToReview({ updated: 'rejected', email: sent.ok ? 'sent' : sent.error || 'failed' });
}

export async function approveApplication(formData: FormData): Promise<void> {
  const adminUser = await requireAdminUser();
  const applicationId = clean(formData.get('application_id'), 80);
  const notes = clean(formData.get('review_notes'), 4000);
  const applicantNote = clean(formData.get('applicant_note'), 2000);
  const admin = createAdminClient();

  const { data: application, error: appError } = await admin
    .from('provider_applications')
    .select('*')
    .eq('id', applicationId)
    .single();
  if (appError) throw appError;

  const typed = application as ProviderApplication;
  // ⚠ CHECKED BEFORE ANYTHING IS PROVISIONED. Without the 2026-10-12 column the final status
  // write fails AFTER the account and the listing exist, leaving a live coach on a pending
  // application with no email; `select('*')` names every column, so its absence is the signal.
  if (!application || !('admin_review' in (application as Record<string, unknown>))) {
    throw new Error(`The admin_review column is missing. Run ${MIGRATION} before approving applications.`);
  }
  // ⚠ APPROVAL IS ONE-SHOT. A second Approve re-published the listing over the coach's own edits
  // and reset their rating, subscribers and flags (see publishProviderRow). An approved
  // application is refused before anything is provisioned.
  if (typed.status === 'approved') backToReview({ notice: 'already_approved' });
  if (typed.provider_type !== 'trainer' && typed.provider_type !== 'nutritionist') {
    throw new Error('Application has an invalid provider type.');
  }
  // The check is read from the admin's own record, never from the applicant's `details`.
  if (!isBackgroundCheckClear(typed.details, typed.admin_review)) {
    throw new Error('Background check consent and a clear background check are required before approval.');
  }
  // ⚠ REFUSE TO PROVISION A COACH WE CANNOT AGE-PLACE. Approval creates an auth
  // user AND a coach profile, and coach roles satisfy membership automatically —
  // so a provider row with no date of birth is an entitled account that the
  // read-time gates (absence no longer admits) will refuse at every surface.
  // Applications submitted before the DOB field existed carry none, so this
  // stops an admin turning a legacy row into a coach who is locked out of the
  // product on their first login, with nothing on screen explaining why.
  // Deliberately a hard refusal rather than a silent omission: the fix is to
  // collect the applicant's date of birth, not to provision around it.
  // ⚠ RECOVER THE DATE FROM `details` WHEN THE COLUMN IS ABSENT. Applications
  // submitted between deploy and the 2026-08-16 migration are stored by the
  // fallback path in /api/apply, which carries the server-validated date in the
  // jsonb `details` because the column does not exist yet. Without this, those
  // applicants pass validation, are told they are ready for review, and are then
  // permanently unapprovable with no way for an admin to restore the value.
  const applicantDob =
    typed.dob ||
    (typeof (typed.details as Record<string, unknown> | null)?.dob === 'string'
      ? ((typed.details as Record<string, unknown>).dob as string)
      : null);
  if (!applicantDob || isMinorFromDob(applicantDob) !== false) {
    throw new Error(
      'This application has no verified date of birth (Shape is 18+). Ask the applicant to resubmit, or record their date of birth on the application, before approving.'
    );
  }
  // ⚠ BELOW THE EXPERIENCE STANDARD IS APPROVED ONE BY ONE, ON PURPOSE. The application is never
  // refused for it (owner, 2026-10-12: "dont make it a hard no"), so the review is where the
  // decision is made, and the reviewer says so with a tick that is recorded with the approval.
  const belowStandard = belowExperienceStandard(typed.years_experience);
  if (belowStandard && formData.get('experience_exception') !== 'yes') {
    backToReview({ notice: 'experience_tick_required' });
  }

  // ⚠ CLAIMED BEFORE ANYTHING IS PROVISIONED. Two Approve clicks (a double submit, two tabs) both
  // read the application as pending, both found no listing for the coach and both inserted one,
  // so the coach was listed twice. Two rules together make the claim exclusive:
  //  · a live claim (admin_review.approval_claim, younger than APPROVAL_CLAIM_MS) on the row as
  //    read stops this request: a click that arrives while the first is still provisioning;
  //  · the claim is written as a compare-and-set on `updated_at`, which the
  //    provider_applications_touch trigger moves on every write: a click that read the row before
  //    the first one's claim landed matches nothing.
  // A provisioning failure releases the claim below; a request that dies holding it loses it when
  // it expires.
  if (!typed.updated_at) throw new Error('This application has no updated_at; it cannot be claimed for approval.');
  const priorReview = asRecord(typed.admin_review);
  const liveClaimAt = Date.parse(String(asRecord(priorReview.approval_claim).at ?? ''));
  if (Number.isFinite(liveClaimAt) && Date.now() - liveClaimAt < APPROVAL_CLAIM_MS) {
    backToReview({ notice: 'approval_in_progress' });
  }
  const { data: claimed, error: claimError } = await admin
    .from('provider_applications')
    .update({
      admin_review: { ...priorReview, approval_claim: { at: new Date().toISOString(), by: adminUser.id } },
    })
    .eq('id', applicationId)
    .eq('updated_at', typed.updated_at)
    .neq('status', 'approved')
    .select('id');
  if (claimError) throw reviewWriteError(claimError);
  if (!claimed?.length) backToReview({ notice: 'approval_conflict' });

  let provisioned: Awaited<ReturnType<typeof resolveOrInviteProviderUser>>;
  let providerId: Awaited<ReturnType<typeof publishProviderRow>>;
  try {
    provisioned = await resolveOrInviteProviderUser(admin, typed);
    const fullName = `${typed.first_name} ${typed.last_name}`.trim();
    await updateProfileRole(admin, provisioned.user.id, typed.provider_type, fullName, applicantDob);
    providerId = await publishProviderRow(admin, typed, provisioned.user.id);
  } catch (provisionError) {
    // Released, so the admin can approve again at once rather than wait out the claim.
    try {
      await admin
        .from('provider_applications')
        .update({ admin_review: { ...priorReview, approval_claim: null } })
        .eq('id', applicationId)
        .neq('status', 'approved');
    } catch (releaseError) {
      console.error('[shape] approval claim release failed:', releaseError);
    }
    throw provisionError;
  }
  const authUser = provisioned.user;

  const now = new Date().toISOString();
  // The approval record lives in admin_review. An `approved_provider` in the applicant's
  // `details` is theirs, and nothing reads it.
  const nextReview: Record<string, unknown> = {
    ...priorReview,
    approval_claim: null,
    applicant_note: applicantNote || null,
    decision: { decision: 'approved', at: now, by: adminUser.id },
    experience_exception: belowStandard
      ? { standard_years: EXPERIENCE_STANDARD_YEARS, years_experience: typed.years_experience, at: now, by: adminUser.id }
      : null,
    approved_provider: {
      provider_role: typed.provider_type,
      provider_id: providerId,
      owner_id: authUser.id,
      approved_at: now,
      existing_account: provisioned.existingAccount,
    },
  };

  const { data: changed, error: updateError } = await admin
    .from('provider_applications')
    .update({
      status: 'approved',
      reviewed_by: adminUser.id,
      reviewed_at: now,
      review_notes: notes || `Approved and published as ${typed.provider_type} #${providerId}.`,
      admin_review: nextReview,
    })
    .eq('id', applicationId)
    .neq('status', 'approved')
    .select('id');
  if (updateError) throw reviewWriteError(updateError);
  // A concurrent Approve marked it first; that one sends the email.
  if (!changed?.length) backToReview({ notice: 'already_approved' });

  revalidatePath(PAGE);
  revalidatePath('/trainers');
  revalidatePath('/nutritionists');

  // ⚠ THE APPLICANT IS TOLD. Approval used to send nothing of ours, and a reused account got no
  // invite either, so an approved coach learned of it only by finding their own listing.
  const mail = approvalEmail({
    firstName: typed.first_name,
    role: typed.provider_type,
    setPasswordUrl: provisioned.setPasswordUrl,
    applicantNote,
  });
  const sent = await sendEmail({ to: typed.email, ...mail });
  await recordDecisionEmail(admin, applicationId, nextReview, 'approval', sent);
  backToReview({
    updated: 'approved',
    email: sent.ok ? 'sent' : sent.error || 'failed',
    account: provisioned.setPasswordUrl ? 'new' : 'existing',
  });
}
