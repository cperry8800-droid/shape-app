// Provider application endpoint (trainer / nutritionist).
// Accepts a JSON body with core identifying fields + a free-form `details`
// object for the rest of the intake. Inserts into public.provider_applications.
//
// Called by the website's coach application (public/newdesign/signup.jsx), the app's
// (mobile-app shapeBackend submitProviderApplication) and the legacy pages
// public/signup-trainer.html and public/signup-nutritionist.html.

import { NextRequest, NextResponse, after } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { cleanText as clean, isEmail, readJson } from '@/lib/request-utils';
import { verifyTurnstile } from '@/lib/turnstile';
import { currentUser } from '@/lib/request-auth';
import { checkRateLimit } from '@/lib/rate-limit';
import {
  REQUIRED_PROVIDER_EXPERIENCE_YEARS,
  asRecord,
  hasBackgroundCheckConsent,
  isAffirmative,
  minimumYears,
  withBackgroundCheckDetails,
} from '@/lib/provider-applications';
import { attestationsComplete } from '@/lib/compliance/nutrition.mjs';
// The shared 18+ derivation — same rule as every signup surface and both gates.
import { isMinorFromDob } from '@/lib/age-derive.mjs';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.APPLICATIONS_EMAIL ?? 'christopher.perry@theshapecommunity.com';
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const MAX_LONG = 10000;
const FILE_BUCKET = 'provider-credentials';
const MAX_FILE_BYTES = 10 * 1024 * 1024;
// ⚠ THE REAL LIMIT IS THE REQUEST, NOT THE FILE. The files ride the request body through this
// route, and Vercel refuses a function request body over 4.5 MB before the route runs, with a
// plain-text 413 the forms could only read as "Could not submit application." Both forms check
// the total against this number before sending and say it plainly; the route holds the same
// line, so a body that does get here over it is told the same thing.
const MAX_TOTAL_FILE_BYTES = 4 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
]);
// L4 (2026-10-08 review): a browser sends an EMPTY type for an extension it does not know
// (serialised in the multipart body as application/octet-stream), and the old check
// (`file.type && !allowed`) let every such file straight into the bucket under whatever bytes it
// held. An undeclared type is now read off the extension, and only these count.
const EXTENSION_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
};
const MAX_FILES = 6;
const FILE_TYPE_MESSAGE = 'must be a PDF, DOC, DOCX, PNG, JPEG or WebP file.';
// Statuses that count as an open application: one per address and role (the
// provider_applications_one_open_idx index in 2026-10-12-coach-application-review.sql).
const OPEN_STATUSES = ['pending', 'in_review'];
// Applications a signed-in account may send a day without a human check (the app's path).
const ACCOUNT_DAILY_APPLICATIONS = 5;
// Document paths are written by this route alone, from the files it stored. A client-sent value
// under any of these names would put a path of the caller's choosing in front of the reviewer
// (the review page signs a link for each), so they are dropped from what the client sends.
const SERVER_DOCUMENT_KEYS = [
  'documents',
  'resume_document',
  'credential_documents',
  'resume_path',
  'certProof_path',
  'insuranceDoc_path',
  'samplePlan_path',
];

/** The content type an application file is stored under, or null when it is not one we accept. */
function applicationFileType(file: File): string | null {
  const declared = String(file.type || '').toLowerCase().split(';')[0].trim();
  if (declared && declared !== 'application/octet-stream') return ALLOWED_FILE_TYPES.has(declared) ? declared : null;
  const ext = (/\.([a-z0-9]+)$/.exec(String(file.name || '').toLowerCase()) || [])[1] || '';
  return EXTENSION_TYPES[ext] ?? null;
}

/** The sentence an application whose files are too big for one request gets, everywhere. */
function totalFilesMessage(bytes: number): string {
  const mb = (Math.ceil(bytes / (1024 * 1024 / 10)) / 10).toFixed(1);
  return `Your files add up to ${mb} MB; the limit for one application is 4 MB in total. Attach a smaller scan or fewer files.`;
}

/** Why the files cannot be taken, or null. Run BEFORE the application row is written, so a refused file is a 400 the applicant can fix, not an application saved without its documents. */
function checkApplicationFiles(files: Array<{ kind: string; file: File }>): string | null {
  if (files.length > MAX_FILES) return `At most ${MAX_FILES} files per application.`;
  for (const { file } of files) {
    if (file.size > MAX_FILE_BYTES) return `${file.name} is larger than 10MB.`;
    if (!applicationFileType(file)) return `${file.name} ${FILE_TYPE_MESSAGE}`;
  }
  const total = files.reduce((sum, { file }) => sum + file.size, 0);
  if (total > MAX_TOTAL_FILE_BYTES) return totalFilesMessage(total);
  return null;
}

function sanitizeDetails(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    if (typeof rawKey !== 'string' || !rawKey) continue;
    const key = rawKey.slice(0, 100);
    if (rawVal == null) continue;
    if (SERVER_DOCUMENT_KEYS.includes(key)) continue;
    if (typeof rawVal === 'string') {
      out[key] = rawVal.trim().slice(0, MAX_LONG);
    } else if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
      out[key] = String(rawVal);
    } else if (Array.isArray(rawVal)) {
      out[key] = rawVal.slice(0, 25);
    } else if (typeof rawVal === 'object') {
      out[key] = rawVal;
    }
    if (Object.keys(out).length >= 100) break;
  }
  return out;
}

/**
 * The credential under the key approval reads. Approval publishes the coach's credential from
 * `details.certifications` (then `details.credentials`), which the legacy trainer page sends; the
 * website and the app send `certification`, so every approved coach from either read "Verified by
 * Shape" instead of their credential. Normalised here, once, for every surface.
 */
function withCertifications(details: Record<string, unknown>): Record<string, unknown> {
  const has = (v: unknown) => typeof v === 'string' && v.trim() !== '';
  if (has(details.certifications)) return details;
  if (!has(details.certification)) return details;
  return { ...details, certifications: String(details.certification).trim() };
}

/**
 * The agreements as this server recorded them, with the time it did. The app sends an
 * `agreements` object, the website now does too, and the legacy pages send their boxes as
 * agreeTos / agreeCoc / agreeVerify ('Yes' or 'No'). Whatever the client sent under
 * `agreements` is replaced, so `recorded_at` is always the server's clock.
 */
function recordedAgreements(details: Record<string, unknown>, body: Record<string, unknown>): Record<string, unknown> {
  const given = asRecord(details.agreements);
  return {
    terms: isAffirmative(given.terms) || isAffirmative(details.agreeTos),
    code_of_conduct: isAffirmative(given.code_of_conduct) || isAffirmative(details.agreeCoc),
    credential_verification: isAffirmative(given.credential_verification) || isAffirmative(details.agreeVerify),
    background_check: hasBackgroundCheckConsent(details, body),
    recorded_at: new Date().toISOString(),
  };
}

/**
 * The bot check. A Turnstile token from the form passes (verifyTurnstile is a no-op until
 * TURNSTILE_SECRET_KEY is set, and fails closed after: M11). Without one, only a signed-in
 * account passes, verified through the Auth server, and at most ACCOUNT_DAILY_APPLICATIONS a day.
 *
 * ⚠ WHY THE ACCOUNT PATH EXISTS: the installed app solves Turnstile with ShapeTurnstile.solve(),
 * which can only pass once `localhost` is in the widget's hostnames in Cloudflare (the native
 * origins are capacitor://localhost and https://localhost). Until then a signed-in applicant in
 * the app is let through on their account, as /api/consultation lets the app through. ⚠ A
 * signed-out applicant in the native app with no token is refused, not waved through: an
 * Origin header or a "this is the app" flag is the caller's to write, so either would be the
 * same as no check at all.
 */
async function passesBotCheck(req: NextRequest, body: Record<string, unknown>, ip: string | null): Promise<boolean> {
  if (await verifyTurnstile(body.captchaToken ?? body.turnstileToken, ip)) return true;
  if (!/^Bearer\s+\S/i.test(req.headers.get('authorization') ?? '')) return false;
  let userId = '';
  try {
    userId = (await currentUser(req))?.id ?? '';
  } catch {
    userId = '';
  }
  if (!userId) return false;
  // Strict: this cap stands in for the bot check, so a limiter fault refuses rather than admits.
  const limit = await checkRateLimit(createAdminClient(), `apply:u:${userId}`, ACCOUNT_DAILY_APPLICATIONS, 24 * 60 * 60, { failClosed: true });
  return limit.allowed;
}

function safeFileName(name = 'document'): string {
  return name
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'document';
}

async function parseApplyRequest(req: NextRequest): Promise<{
  body: Record<string, unknown>;
  files: Array<{ kind: string; file: File }>;
}> {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    const parsed = await readJson<Record<string, unknown>>(req);
    if (!parsed.ok) throw new Error('invalid_json');
    return { body: parsed.data, files: [] };
  }

  const form = await req.formData();
  const body: Record<string, unknown> = {};
  const files: Array<{ kind: string; file: File }> = [];

  for (const [key, value] of form.entries()) {
    if (value instanceof File) {
      if (value.size > 0) files.push({ kind: key, file: value });
    } else if (key === 'details') {
      try {
        body.details = JSON.parse(value);
      } catch {
        body.details = {};
      }
    } else {
      body[key] = value;
    }
  }

  return { body, files };
}

/**
 * Stores the files under the application's id BEFORE its row exists, so a row is only ever
 * written with every one of its documents. ⚠ ALL OR NOTHING: when one upload fails, the ones
 * already stored for this submission are removed before the error goes up, so a retry starts
 * clean instead of leaving orphaned documents (or, as before, a saved row with half of them).
 */
async function uploadApplicationFiles(
  applicationId: string,
  files: Array<{ kind: string; file: File }>
): Promise<Array<Record<string, unknown>>> {
  if (!files.length) return [];
  const supabase = createAdminClient();
  const uploaded: Array<Record<string, unknown>> = [];

  try {
    for (const { kind, file } of files) {
      if (file.size > MAX_FILE_BYTES) {
        throw new Error(`${file.name} is larger than 10MB.`);
      }
      const type = applicationFileType(file);
      if (!type) {
        throw new Error(`${file.name} ${FILE_TYPE_MESSAGE}`);
      }

      const path = `website/${applicationId}/${kind}/${Date.now()}-${safeFileName(file.name)}`;
      const bytes = new Uint8Array(await file.arrayBuffer());
      const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, bytes, {
        contentType: type,
        upsert: false,
      });
      if (error) throw error;
      uploaded.push({
        kind,
        bucket: FILE_BUCKET,
        path,
        name: file.name,
        type,
        size: file.size,
        stored: 'supabase',
      });
    }
  } catch (uploadError) {
    await removeApplicationFiles(uploaded);
    throw uploadError;
  }

  return uploaded;
}

/** Removes stored application files; a failure here is logged, never thrown over the real error. */
async function removeApplicationFiles(documents: Array<Record<string, unknown>>): Promise<void> {
  const paths = documents.map((d) => String(d.path || '')).filter(Boolean);
  if (!paths.length) return;
  try {
    const { error } = await createAdminClient().storage.from(FILE_BUCKET).remove(paths);
    if (error) console.error('[shape-api] provider application file cleanup failed:', error);
  } catch (cleanupError) {
    console.error('[shape-api] provider application file cleanup failed:', cleanupError);
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  let files: Array<{ kind: string; file: File }> = [];
  try {
    const parsed = await parseApplyRequest(req);
    body = parsed.body;
    files = parsed.files;
  } catch {
    return NextResponse.json({ error: 'Invalid application request.' }, { status: 400, headers: CORS_HEADERS });
  }

  const providerTypeRaw = clean(body.providerType, 20).toLowerCase();
  if (providerTypeRaw !== 'trainer' && providerTypeRaw !== 'nutritionist') {
    return NextResponse.json(
      { error: 'providerType must be "trainer" or "nutritionist".' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const firstName = clean(body.firstName, 100);
  const lastName = clean(body.lastName, 100);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const location = clean(body.location, 200);
  const specialty = clean(body.specialty, 200);
  const yearsExperience = clean(body.yearsExperience, 40);
  const monthlyPrice = clean(body.monthlyPrice, 40);
  const dob = clean(body.dob, 40);
  let details = sanitizeDetails(body.details);

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: 'First name, last name, and email are required.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400, headers: CORS_HEADERS });
  }
  // ⚠ 18+ IS ENFORCED HERE, AND IT IS NOT COSMETIC FOR COACHES. An approved
  // application provisions an auth user AND a coach profile, and coach roles
  // satisfy membership automatically — so a provider account with no date of
  // birth is both entitled and, under the read-time policy, refused (absence no
  // longer admits). Collecting it here is what keeps approved coaches working.
  const providerMinor = isMinorFromDob(dob);
  if (providerMinor === null) {
    return NextResponse.json(
      { error: 'Enter a valid date of birth — Shape is for adults 18 and over.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (providerMinor === true) {
    return NextResponse.json(
      { error: 'You must be 18 or older to apply as a provider.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }
  if (minimumYears(yearsExperience) < REQUIRED_PROVIDER_EXPERIENCE_YEARS) {
    return NextResponse.json(
      {
        error: `Shape requires at least ${REQUIRED_PROVIDER_EXPERIENCE_YEARS} years of professional experience before applying as a provider.`,
      },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  if (!hasBackgroundCheckConsent(details, body)) {
    return NextResponse.json(
      { error: 'Background check consent is required before submitting a provider application.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  // Nutrition compliance attestations are enforced server-side, not just in the
  // signup UI — independent-contractor framing + maintains licensure + malpractice
  // insurance + scope understood. (RD/RDN dietitians ride on the nutritionist rails.)
  if (
    providerTypeRaw === 'nutritionist' &&
    !attestationsComplete(details.compliance_attestations as Record<string, boolean> | undefined)
  ) {
    return NextResponse.json(
      { error: 'All nutrition compliance attestations are required.' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  const fileProblem = checkApplicationFiles(files);
  if (fileProblem) {
    return NextResponse.json({ error: fileProblem }, { status: 400, headers: CORS_HEADERS });
  }

  // Bot check (Cloudflare Turnstile), after the checks above so a form that can be fixed is told
  // what to fix first, and before anything is read, stored or mailed. Anyone could post here with
  // no account, so this is what stands between a script and the review queue, the bucket and an
  // email sent to whatever address the body names.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  if (!(await passesBotCheck(req, body, ip))) {
    return NextResponse.json(
      { error: 'Captcha check failed — please retry.', code: 'captcha_failed' },
      { status: 400, headers: CORS_HEADERS }
    );
  }

  details = withBackgroundCheckDetails({
    ...withCertifications(details),
    agreements: recordedAgreements(details, body),
    meets_experience_preference: true,
    background_check_consent: true,
  }, 'consent_received');

  // L19 (2026-10-10): the anonymous insert policy on provider_applications is gone, so the
  // application row is written through the service role after the checks above.
  const supabase = createAdminClient();

  // ⚠ ONE OPEN APPLICATION PER ADDRESS AND ROLE, NOT ONE PER TAP. A retry after a slow answer, a
  // double tap or a back-and-resubmit used to write a second row and send both emails again. An
  // address with an open (pending or in-review) application for the same role gets that
  // application's id back: no new row, no new files, no new email. This read answers the common
  // case before any file is stored; the database enforces it (provider_applications_one_open_idx),
  // so a retry that arrives while the first request is still uploading lands on the 23505 below.
  // A failed read is not a refusal; the insert and the index decide.
  const openApplicationId = async (): Promise<string | null> => {
    const { data: existing, error: duplicateError } = await supabase
      .from('provider_applications')
      .select('id')
      .eq('email', email)
      .eq('provider_type', providerTypeRaw)
      .in('status', OPEN_STATUSES)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (duplicateError) console.error('[shape-api] provider application duplicate check failed:', duplicateError);
    return existing?.id ? String(existing.id) : null;
  };
  const duplicateResponse = (id: string) =>
    NextResponse.json({ ok: true, id, duplicate: true }, { headers: CORS_HEADERS });
  const existingId = await openApplicationId();
  if (existingId) return duplicateResponse(existingId);

  // The files go up first, under the id the row will carry, and the row is written once with
  // every document in it. A failed upload leaves no row and no files (uploadApplicationFiles
  // removes its own); a failed insert removes the files. Either way a retry starts clean.
  const applicationId = crypto.randomUUID();
  let documents: Array<Record<string, unknown>> = [];
  try {
    documents = await uploadApplicationFiles(applicationId, files);
  } catch (uploadError) {
    console.error('[shape-api] provider application upload failed:', uploadError);
    return NextResponse.json(
      { error: 'Could not upload application files. Nothing was saved, so please try again.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
  if (documents.length) details = { ...details, documents };

  const applicationRow = {
    id: applicationId,
    provider_type: providerTypeRaw,
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    location: location || null,
    specialty: specialty || null,
    years_experience: yearsExperience || null,
    monthly_price: monthlyPrice || null,
    details,
    user_agent: req.headers.get('user-agent') || null,
  };
  let { data, error } = await supabase
    .from('provider_applications')
    .insert({ ...applicationRow, dob })
    .select('id')
    .single();
  // ⚠ MIGRATION-SAFE. `dob` is declared in 2026-04-17-provider-applications.sql
  // but was NEVER present on the live table (verified against information_schema
  // on 2026-08-16 — schema drift, not a missing file), so it is added by
  // 2026-08-16-created-at-freeze-and-application-dob.sql. Until that runs, an
  // insert naming the column fails 42703 and would take down provider signups
  // entirely. Retry without it on the stable unknown-column codes only, so a
  // genuine failure still surfaces.
  //
  // ⚠ THE RETRY CARRIES THE DATE IN `details`, AND THAT IS LOAD-BEARING. Dropping
  // it would tell the applicant their application is ready for review, and then
  // approval — which refuses a row it cannot age-place — would reject them with no
  // way for an admin to restore the value. Every application submitted in the
  // window between deploy and migration would need manual database repair or an
  // unprompted resubmission. `details` is jsonb and already exists, so the
  // validated value survives either way and approval recovers it. Written from
  // the SERVER-VALIDATED `dob`, never from client input, so this cannot become a
  // passthrough that smuggles an unvalidated date past the check above.
  if (error && (error.code === '42703' || error.code === 'PGRST204')) {
    // Reassign the OUTER `details` so the emails below carry the same record the row does.
    details = { ...details, dob };
    ({ data, error } = await supabase
      .from('provider_applications')
      .insert({ ...applicationRow, details })
      .select('id')
      .single());
  }

  // The index refused it: an open application for this address and role landed while this
  // request was uploading. Answer with that one, and take back this request's files.
  if (error?.code === '23505') {
    await removeApplicationFiles(documents);
    const openId = await openApplicationId();
    if (openId) return duplicateResponse(openId);
  }

  // `data` is checked alongside `error` because the retry above reassigns both,
  // so it can no longer be narrowed by the error guard alone — and an insert that
  // somehow resolved with neither must not fall through to a null dereference.
  if (error || !data) {
    console.error('provider_applications insert failed:', error);
    await removeApplicationFiles(documents);
    return NextResponse.json(
      { error: 'Could not submit your application. Please email info@theshapecommunity.com directly.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  // A nutritionist applicant can declare RD/RDN inside the application — the
  // provider rails stay 'nutritionist'; the label + details carry the dietitian
  // distinction for the reviewer (who sets profiles.role='dietitian' + credential).
  const isDietitian = providerTypeRaw === 'nutritionist' && String(details.nutrition_role || '').toLowerCase() === 'dietitian';
  const role = providerTypeRaw === 'trainer' ? 'Trainer' : isDietitian ? 'Dietitian (RD/RDN)' : 'Nutritionist';
  const fullName = `${firstName} ${lastName}`.trim();
  const emailContext: EmailContext = {
    role,
    fullName,
    firstName,
    email,
    phone,
    location,
    specialty,
    yearsExperience,
    monthlyPrice,
    details,
    applicationId: data.id,
  };
  // ⚠ AFTER THE RESPONSE, BUT NOT FIRE-AND-FORGET. A promise left running when a serverless
  // function returns can be frozen with it, so the review team's notice and the applicant's
  // confirmation were sent only when the platform happened to let them finish. `after()` keeps
  // the function alive until they have.
  after(() => sendApplicationEmails(emailContext));

  return NextResponse.json({ ok: true, id: data.id }, { headers: CORS_HEADERS });
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

type EmailContext = {
  role: string;
  fullName: string;
  firstName: string;
  email: string;
  phone: string;
  location: string;
  specialty: string;
  yearsExperience: string;
  monthlyPrice: string;
  details: Record<string, unknown>;
  applicationId: string | undefined;
};

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function detailsValueToText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value == null) return '';
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

async function sendApplicationEmails(ctx: EmailContext): Promise<void> {
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com';
  const baseRows: Array<[string, string]> = [
    ['Role', ctx.role],
    ['Name', ctx.fullName],
    ['Email', ctx.email],
    ['Phone', ctx.phone],
    ['Location', ctx.location],
    ['Specialty', ctx.specialty],
    ['Years experience', ctx.yearsExperience],
    ['Monthly price', ctx.monthlyPrice],
  ];
  const adminRows: Array<[string, string]> = [
    ...baseRows,
    ...Object.entries(ctx.details).map(([key, value]) => [key, detailsValueToText(value)] as [string, string]),
  ].filter(([, v]) => Boolean(v));

  const adminHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:18px;">New ${escapeHtml(ctx.role.toLowerCase())} application</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px;">Submitted through the ${escapeHtml(ctx.role.toLowerCase())} signup form.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${adminRows.map(([k, v]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;width:160px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(v)}</td></tr>`).join('')}
      </table>
      <p style="margin:20px 0 0;"><a href="${escapeHtml(siteUrl)}/dashboard/applications" style="display:inline-block;background:#0ac5a8;color:#06100e;text-decoration:none;padding:10px 14px;border-radius:999px;font-size:13px;font-weight:600;">Open application review</a></p>
      ${ctx.applicationId ? `<p style="margin:20px 0 0;color:#999;font-size:12px;">Application ID: ${escapeHtml(ctx.applicationId)}</p>` : ''}
    </div>
  `;
  const adminText = [
    `New ${ctx.role.toLowerCase()} application`,
    '',
    ...adminRows.map(([k, v]) => `${k}: ${v}`),
    '',
    `Review: ${siteUrl}/dashboard/applications`,
    ctx.applicationId ? `\nApplication ID: ${ctx.applicationId}` : '',
  ].join('\n');

  const applicantHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0d0c;">
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">Thanks, ${escapeHtml(ctx.firstName)}.</h2>
      <p style="margin:0 0 16px;line-height:1.55;">We've received your application to join Shape as a ${escapeHtml(ctx.role.toLowerCase())}. Welcome aboard — here's what happens next:</p>
      <ol style="margin:0 0 20px;padding-left:20px;line-height:1.6;">
        <li>Our team reviews your application (usually within 2 business days).</li>
        <li>If it's a fit, we'll verify your credentials and send the required background check invite.</li>
        <li>After the background check clears, we'll set up your dashboard and help you launch your profile.</li>
      </ol>
      <p style="margin:0 0 16px;line-height:1.55;">Reminder on pricing: there's no monthly fee to be on Shape. We take a <strong>15% platform fee</strong> on everything your clients pay you — so you only pay Shape when you earn.</p>
      <p style="margin:0 0 16px;line-height:1.55;">Questions in the meantime? Just reply to this email.</p>
      <p style="margin:24px 0 0;color:#666;font-size:13px;">— The Shape team<br/><a href="https://theshapecommunity.com" style="color:#0ac5a8;">theshapecommunity.com</a></p>
    </div>
  `;
  const applicantText = [
    `Thanks, ${ctx.firstName}.`,
    '',
    `We've received your application to join Shape as a ${ctx.role.toLowerCase()}.`,
    '',
    "Here's what happens next:",
    '  1. Our team reviews your application (usually within 2 business days).',
    "  2. If it's a fit, we'll verify your credentials and send the required background check invite.",
    "  3. After the background check clears, we'll set up your dashboard and help you launch your profile.",
    '',
    "No monthly fee on Shape. We take a 15% platform fee on everything your clients pay you — so you only pay Shape when you earn.",
    '',
    'Questions? Just reply to this email.',
    '',
    '— The Shape team',
    'https://theshapecommunity.com',
  ].join('\n');

  // Both are awaited (inside `after()`), each failure logged on its own.
  await Promise.all([
    sendEmail({
      to: ADMIN_EMAIL,
      subject: `New ${ctx.role.toLowerCase()} application — ${ctx.fullName}`,
      html: adminHtml,
      text: adminText,
    }).catch((e) => console.error('[apply] admin notify failed', e)),
    sendEmail({
      to: ctx.email,
      subject: `We got your application, ${ctx.firstName}`,
      html: applicantHtml,
      text: applicantText,
    }).catch((e) => console.error('[apply] applicant reply failed', e)),
  ]);
}
