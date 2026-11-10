// Approving a coach application: which account the approval is for, and setting the coach up
// (2026-11-10). The admin's Approve (src/app/dashboard/applications/actions.ts) and the
// applicant's Confirm (src/app/coach/confirm/actions.ts) share this module.
//
// ⚠ AN APPROVAL GOES TO THE ACCOUNT THAT APPLIED, NEVER TO WHOEVER HOLDS THE FORM'S ADDRESS. It used
// to look the form's email up and put the coach role and the listing on any account that had it,
// so an application typed with someone else's address made THEIR account a coach. Now:
//   · sent signed in: /api/apply stamped the sender (details.account_id, with account_source
//     'session'; both are server keys a client cannot send). The approval goes to that account,
//     whatever address the form carried, and is emailed to that account's own address.
//   · sent signed out, no account at the address: an invite makes one; only the owner of the
//     address can use its link.
//   · sent signed out, an account at the address that has never signed in: a set-password link
//     to the address, as before (no one is using that account).
//   · sent signed out, an account in use at the address: NOTHING is set up. The address is
//     emailed a link to /coach/confirm, and the role and the listing are made only when that
//     account, signed in, presses Confirm there (confirmCoachApproval).
// ⚠ A STAMP WITHOUT `account_source: 'session'` IS NOT A STAMP. Before #2667 a client could put any
// `account_id` in `details`; only the pair the server writes is read as the sender.

import type { SupabaseClient } from '@supabase/supabase-js';
import { sendEmail } from '@/lib/email';
import { isMinorFromDob } from '@/lib/age-derive.mjs';
import { approvalConfirmEmail, approvalEmail, siteUrl } from '@/lib/coach-application-emails';
import { EXPERIENCE_STANDARD_YEARS, experienceYears } from '@/lib/provider-experience.mjs';
import { asRecord, isBackgroundCheckClear, textValue } from '@/lib/provider-applications';

type Admin = SupabaseClient;

export type ProviderRole = 'trainer' | 'nutritionist';
export type ApplicationStatus = 'pending' | 'in_review' | 'approved' | 'rejected' | 'withdrawn';

export type ProviderApplication = {
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
  /** The reviewer's own record (2026-10-12): written only by the review actions and Confirm. */
  admin_review?: Record<string, unknown> | null;
};

// How long an Approve's claim on an application holds off another Approve. Longer than any one
// approval takes (a server action is cut off well before it); a claim older than this belongs to
// a request that died, and a new Approve may take the application over.
export const APPROVAL_CLAIM_MS = 10 * 60 * 1000;
/** The statuses an application can still be decided from: approved or rejected is final. */
export const OPEN_APPLICATION_STATUSES: ApplicationStatus[] = ['pending', 'in_review', 'withdrawn'];
export const MIGRATION = 'supabase-migrations/2026-10-12-coach-application-review.sql';
/** The value /api/apply writes beside `account_id` when it stamps the signed-in sender. */
export const ACCOUNT_SOURCE_SESSION = 'session';
/** The page the confirm email links to. */
export const CONFIRM_PATH = '/coach/confirm';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** A read or write naming `admin_review` before the 2026-10-12 migration has run fails 42703/PGRST204: say so. */
export function reviewWriteError(error: { code?: string; message?: string }): Error {
  if (error?.code === '42703' || error?.code === 'PGRST204') {
    return new Error(`The admin_review column is missing. Run ${MIGRATION} before reviewing applications.`);
  }
  return error instanceof Error ? error : new Error(error?.message || 'Application update failed.');
}

/** The account /api/apply stamped as the sender, or null when the application was sent signed out. */
export function stampedAccountId(details: unknown): string | null {
  const d = asRecord(details);
  if (d.account_source !== ACCOUNT_SOURCE_SESSION) return null;
  const id = typeof d.account_id === 'string' ? d.account_id.trim() : '';
  return UUID.test(id) ? id : null;
}

/**
 * The applicant's date of birth: the column, or, for applications stored by /api/apply's fallback
 * path before the 2026-08-16 migration, the server-validated copy it kept in `details`.
 */
export function applicantDob(application: Pick<ProviderApplication, 'dob' | 'details'>): string | null {
  if (application.dob) return application.dob;
  const fromDetails = asRecord(application.details).dob;
  return typeof fromDetails === 'string' ? fromDetails : null;
}

/**
 * Why this application cannot be turned into a coach right now, or null when it can. Checked by
 * the admin's Approve and again by the applicant's Confirm, since the review can change between
 * the two (a background check marked "needs review", say).
 */
export function approvalBlocker(application: ProviderApplication): string | null {
  if (application.provider_type !== 'trainer' && application.provider_type !== 'nutritionist') {
    return 'Application has an invalid provider type.';
  }
  // The check is read from the admin's own record, never from the applicant's `details`.
  if (!isBackgroundCheckClear(application.details, application.admin_review)) {
    return 'Background check consent and a clear background check are required before approval.';
  }
  // ⚠ REFUSE TO PROVISION A COACH WE CANNOT AGE-PLACE. Approval creates a coach profile, and coach
  // roles satisfy membership automatically, so a provider row with no date of birth is an entitled
  // account the read-time gates (absence no longer admits) refuse at every surface. A hard refusal
  // on purpose: the fix is to collect the applicant's date of birth, not to provision around it.
  const dob = applicantDob(application);
  if (!dob || isMinorFromDob(dob) !== false) {
    return 'This application has no verified date of birth (Shape is 18+). Ask the applicant to resubmit, or record their date of birth on the application, before approving.';
  }
  return null;
}

export async function findAuthUserByEmail(admin: Admin, email: string) {
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

type AuthUser = { id: string; email?: string | null; last_sign_in_at?: string | null };

/** Who an approval is for, decided before anything is set up. */
export type ApprovalBinding =
  /** Set the coach up on this account now. `setPasswordUrl` is a one-time link for an account nobody has used. */
  | { kind: 'provision'; user: AuthUser; setPasswordUrl: string | null; existingAccount: boolean; mailTo: string; source: 'stamped' | 'invite' | 'unused_account' }
  /** An account in use holds the address of an application sent signed out: it must confirm first. */
  | { kind: 'confirm'; user: AuthUser; mailTo: string }
  /** The account that sent the application no longer exists. */
  | { kind: 'account_gone' };

/** The emailed link: /auth/confirm verifies the hash, signs the coach in, opens the set-password page. */
export function setPasswordLink(tokenHash: string, type: 'invite' | 'recovery'): string {
  const query = new URLSearchParams({ token_hash: tokenHash, type, next: '/reset-password' });
  return `${siteUrl()}/auth/confirm?${query.toString()}`;
}

/** The confirm page for one application. No token: the page asks the account to sign in. */
export function confirmLink(applicationId: string): string {
  return `${siteUrl()}${CONFIRM_PATH}?${new URLSearchParams({ application: applicationId }).toString()}`;
}

/**
 * Decides which account the approval goes to (see the header). It may CREATE an invited account
 * (an application sent signed out to an address with none), so it runs only once the application
 * is claimed.
 */
export async function resolveApprovalBinding(admin: Admin, application: ProviderApplication): Promise<ApprovalBinding> {
  const stamped = stampedAccountId(application.details);
  if (stamped) {
    const { data, error } = await admin.auth.admin.getUserById(stamped);
    // A deleted account answers "User not found"; anything else is a failure to read, thrown.
    if (error && !/not.?found/i.test(String(error.message ?? ''))) throw error;
    const user = data?.user;
    if (!user) return { kind: 'account_gone' };
    return {
      kind: 'provision',
      user,
      setPasswordUrl: null,
      existingAccount: true,
      // The account's own address. A phone-only account has none: the form's address is told.
      mailTo: user.email || application.email,
      source: 'stamped',
    };
  }

  const existing = await findAuthUserByEmail(admin, application.email);
  if (existing) {
    // An account that has never signed in (an approval that stopped part-way, say) has nobody
    // using it: it gets a set-password link to the address, through the same route.
    if (!existing.last_sign_in_at) {
      const { data, error } = await admin.auth.admin.generateLink({ type: 'recovery', email: application.email });
      const tokenHash = error ? null : data?.properties?.hashed_token;
      if (tokenHash) {
        return { kind: 'provision', user: existing, setPasswordUrl: setPasswordLink(tokenHash, 'recovery'), existingAccount: true, mailTo: application.email, source: 'unused_account' };
      }
    }
    // ⚠ AN ACCOUNT IN USE IS NEVER MADE A COACH ON THE FORM'S WORD. It confirms first, signed in.
    return { kind: 'confirm', user: existing, mailTo: existing.email || application.email };
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
  return { kind: 'provision', user: data.user, setPasswordUrl: setPasswordLink(tokenHash, 'invite'), existingAccount: false, mailTo: application.email, source: 'invite' };
}

async function updateProfileRole(admin: Admin, userId: string, role: ProviderRole, fullName: string, dob: string | null) {
  const { data: profile } = await admin
    .from('profiles')
    .select('role, roles, full_name, date_of_birth')
    .eq('id', userId)
    .maybeSingle();

  // ⚠ AN EMPTY `roles` HOLDS THE PRIMARY ROLE. A member's profile can carry `role: 'client'` and
  // `roles: []`; adding the coach role to the empty list alone made `roles` ['trainer'], and the
  // portal gate (which reads `roles` first) then sent the member's own pages to the coach dashboard.
  const listed = Array.isArray(profile?.roles) ? (profile.roles as string[]) : [];
  const existingRoles = listed.length ? listed : profile?.role ? [String(profile.role)] : [];
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

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

async function publishProviderRow(admin: Admin, application: ProviderApplication, ownerId: string) {
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

/** Records how a decision email went, best-effort: the decision itself is already saved. */
export async function recordDecisionEmail(
  admin: Admin,
  applicationId: string,
  review: Record<string, unknown>,
  kind: 'approval' | 'rejection' | 'confirmation',
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

export type ClaimResult = 'claimed' | 'in_progress' | 'conflict';

/**
 * ⚠ CLAIMED BEFORE ANYTHING IS PROVISIONED. Two Approve clicks (a double submit, two tabs), or an
 * Approve and the applicant's Confirm, both read the application as open, both found no listing
 * and both inserted one, so the coach was listed twice. Two rules together make the claim
 * exclusive:
 *  · a live claim (admin_review.approval_claim, younger than APPROVAL_CLAIM_MS) on the row as read
 *    stops this request: one that arrives while the first is still provisioning;
 *  · the claim is written as a compare-and-set on `updated_at`, which the
 *    provider_applications_touch trigger moves on every write: a request that read the row before
 *    the first one's claim landed matches nothing.
 * A provisioning failure releases the claim (releaseApprovalClaim); a request that dies holding it
 * loses it when it expires.
 */
export async function claimForApproval(admin: Admin, application: ProviderApplication, by: string): Promise<ClaimResult> {
  if (!application.updated_at) throw new Error('This application has no updated_at; it cannot be claimed for approval.');
  const priorReview = asRecord(application.admin_review);
  const liveClaimAt = Date.parse(String(asRecord(priorReview.approval_claim).at ?? ''));
  if (Number.isFinite(liveClaimAt) && Date.now() - liveClaimAt < APPROVAL_CLAIM_MS) return 'in_progress';
  const { data: claimed, error } = await admin
    .from('provider_applications')
    .update({ admin_review: { ...priorReview, approval_claim: { at: new Date().toISOString(), by } } })
    .eq('id', application.id)
    .eq('updated_at', application.updated_at)
    .in('status', OPEN_APPLICATION_STATUSES)
    .select('id');
  if (error) throw reviewWriteError(error);
  return claimed?.length ? 'claimed' : 'conflict';
}

/** Gives the claim back (to the review as it was read), so another Approve can go at once. */
export async function releaseApprovalClaim(admin: Admin, application: ProviderApplication) {
  try {
    await admin
      .from('provider_applications')
      .update({ admin_review: { ...asRecord(application.admin_review), approval_claim: null } })
      .eq('id', application.id)
      .neq('status', 'approved');
  } catch (releaseError) {
    console.error('[shape] approval claim release failed:', releaseError);
  }
}

/** The record of a below-standard approval, or null when the applicant meets the standard. */
export function experienceExceptionRecord(application: ProviderApplication, belowStandard: boolean, at: string, by: string) {
  return belowStandard
    ? { standard_years: EXPERIENCE_STANDARD_YEARS, years_experience: application.years_experience, at, by }
    : null;
}

export type ApprovalDecision = {
  /** The admin who approved. */
  decidedBy: string;
  /** When the admin approved (for a confirmed approval, when they pressed Approve). */
  decidedAt?: string;
  notes: string;
  applicantNote: string;
  experienceException: Record<string, unknown> | null;
  /** Set when the account confirmed the approval itself on /coach/confirm. */
  confirmedBy?: string | null;
};

export type ApprovalOutcome =
  | { done: true; providerId: number; email: { ok: boolean; error?: string } }
  /** Another request approved it first (that one sends the email), or it was rejected meanwhile. */
  | { done: false; rejectedMeanwhile?: boolean };

/**
 * Sets the coach up on `binding.user` and marks the application approved, then emails them. The
 * application must already be claimed (claimForApproval); a provisioning failure releases the
 * claim and is thrown.
 */
export async function provisionApproval(
  admin: Admin,
  application: ProviderApplication,
  binding: Extract<ApprovalBinding, { kind: 'provision' }>,
  decision: ApprovalDecision
): Promise<ApprovalOutcome> {
  const priorReview = asRecord(application.admin_review);
  let providerId: number;
  try {
    const fullName = `${application.first_name} ${application.last_name}`.trim();
    await updateProfileRole(admin, binding.user.id, application.provider_type, fullName, applicantDob(application));
    providerId = await publishProviderRow(admin, application, binding.user.id);
  } catch (provisionError) {
    await releaseApprovalClaim(admin, application);
    throw provisionError;
  }

  const now = new Date().toISOString();
  // The approval record lives in admin_review. An `approved_provider` in the applicant's
  // `details` is theirs, and nothing reads it.
  const nextReview: Record<string, unknown> = {
    ...priorReview,
    approval_claim: null,
    pending_confirmation: null,
    applicant_note: decision.applicantNote || null,
    decision: {
      decision: 'approved',
      at: decision.decidedAt || now,
      by: decision.decidedBy,
      ...(decision.confirmedBy ? { confirmed_by: decision.confirmedBy, confirmed_at: now } : {}),
    },
    experience_exception: decision.experienceException,
    approved_provider: {
      provider_role: application.provider_type,
      provider_id: providerId,
      owner_id: binding.user.id,
      approved_at: now,
      existing_account: binding.existingAccount,
      bound_by: decision.confirmedBy ? 'confirmed' : binding.source,
    },
  };

  const { data: changed, error: updateError } = await admin
    .from('provider_applications')
    .update({
      status: 'approved',
      reviewed_by: decision.decidedBy,
      reviewed_at: now,
      review_notes: decision.notes || `Approved and published as ${application.provider_type} #${providerId}.`,
      admin_review: nextReview,
    })
    .eq('id', application.id)
    .in('status', OPEN_APPLICATION_STATUSES)
    .select('id');
  if (updateError) throw reviewWriteError(updateError);
  if (!changed?.length) {
    // ⚠ NEVER OVER A REJECTION (Codex P1 on #2675): only an open application is approved. A reject
    // cannot land while the claim is live; one that landed after the claim ran out leaves a coach
    // set up for a rejected application, which is said loudly for an admin to undo.
    const { data: now2 } = await admin.from('provider_applications').select('status').eq('id', application.id).maybeSingle();
    if (now2 && (now2 as { status?: string }).status === 'rejected') {
      console.error('[shape] an approval set a coach up for an application rejected meanwhile; take the role and listing down', { application: application.id, provider_id: providerId, owner_id: binding.user.id });
      return { done: false, rejectedMeanwhile: true };
    }
    return { done: false };
  }

  // ⚠ THE APPLICANT IS TOLD. Approval used to send nothing of ours, and a reused account got no
  // invite either, so an approved coach learned of it only by finding their own listing.
  const mail = approvalEmail({
    firstName: application.first_name,
    role: application.provider_type,
    setPasswordUrl: binding.setPasswordUrl,
    applicantNote: decision.applicantNote,
  });
  const sent = await sendEmail({ to: binding.mailTo, ...mail });
  await recordDecisionEmail(admin, application.id, nextReview, 'approval', sent);
  return { done: true, providerId, email: sent };
}

/**
 * The admin approved an application sent signed out to an address whose account is in use: the
 * decision is recorded as waiting for that account, nothing is set up, and the address is emailed
 * the confirm link. The claim is cleared in the same write. Returns null when the application was
 * approved meanwhile.
 */
export async function requestConfirmation(
  admin: Admin,
  application: ProviderApplication,
  binding: Extract<ApprovalBinding, { kind: 'confirm' }>,
  decision: ApprovalDecision
): Promise<{ ok: boolean; error?: string } | null> {
  const now = new Date().toISOString();
  const nextReview: Record<string, unknown> = {
    ...asRecord(application.admin_review),
    approval_claim: null,
    applicant_note: decision.applicantNote || null,
    pending_confirmation: {
      user_id: binding.user.id,
      email: String(binding.user.email || application.email).toLowerCase(),
      at: now,
      by: decision.decidedBy,
      notes: decision.notes || null,
      applicant_note: decision.applicantNote || null,
      experience_exception: decision.experienceException,
    },
  };
  const { data: changed, error } = await admin
    .from('provider_applications')
    .update({
      status: 'in_review',
      reviewed_by: decision.decidedBy,
      reviewed_at: now,
      review_notes: decision.notes || 'Approved; waiting for the applicant to confirm their account.',
      admin_review: nextReview,
    })
    .eq('id', application.id)
    // Only an open application: a rejection is never reopened into a waiting approval (Codex P1 on #2675).
    .in('status', OPEN_APPLICATION_STATUSES)
    .select('id');
  if (error) throw reviewWriteError(error);
  if (!changed?.length) return null;

  const mail = approvalConfirmEmail({
    firstName: application.first_name,
    role: application.provider_type,
    confirmUrl: confirmLink(application.id),
    applicantNote: decision.applicantNote,
  });
  const sent = await sendEmail({ to: binding.mailTo, ...mail });
  await recordDecisionEmail(admin, application.id, nextReview, 'confirmation', sent);
  return sent;
}

/** The approval waiting for an account's Confirm, or null. */
export function pendingConfirmation(application: Pick<ProviderApplication, 'admin_review'>) {
  const pending = asRecord(asRecord(application.admin_review).pending_confirmation);
  const userId = typeof pending.user_id === 'string' ? pending.user_id : '';
  if (!userId) return null;
  return {
    userId,
    email: typeof pending.email === 'string' ? pending.email : '',
    at: typeof pending.at === 'string' ? pending.at : '',
    by: typeof pending.by === 'string' ? pending.by : '',
    notes: typeof pending.notes === 'string' ? pending.notes : '',
    applicantNote: typeof pending.applicant_note === 'string' ? pending.applicant_note : '',
    experienceException: pending.experience_exception && typeof pending.experience_exception === 'object'
      ? (pending.experience_exception as Record<string, unknown>)
      : null,
  };
}
