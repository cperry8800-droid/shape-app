// Provider application endpoint (trainer / nutritionist).
// Accepts a JSON body with core identifying fields + a free-form `details`
// object for the rest of the intake. Inserts into public.provider_applications.
//
// Called by public/signup-trainer.html and public/signup-nutritionist.html.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { cleanText as clean, isEmail } from '@/lib/request-utils';
import {
  REQUIRED_PROVIDER_EXPERIENCE_YEARS,
  hasBackgroundCheckConsent,
  minimumYears,
  withBackgroundCheckDetails,
} from '@/lib/provider-applications';

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
const ALLOWED_FILE_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/png',
  'image/jpeg',
  'image/webp',
]);

function sanitizeDetails(input: unknown): Record<string, unknown> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    if (typeof rawKey !== 'string' || !rawKey) continue;
    const key = rawKey.slice(0, 100);
    if (rawVal == null) continue;
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
    return { body: await req.json(), files: [] };
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

async function uploadApplicationFiles(
  applicationId: string,
  files: Array<{ kind: string; file: File }>
): Promise<Array<Record<string, unknown>>> {
  if (!files.length) return [];
  const supabase = createAdminClient();
  const uploaded: Array<Record<string, unknown>> = [];

  for (const { kind, file } of files) {
    if (file.size > MAX_FILE_BYTES) {
      throw new Error(`${file.name} is larger than 10MB.`);
    }
    if (file.type && !ALLOWED_FILE_TYPES.has(file.type)) {
      throw new Error(`${file.name} must be a PDF, DOC, image, or DOCX file.`);
    }

    const path = `website/${applicationId}/${kind}/${Date.now()}-${safeFileName(file.name)}`;
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { error } = await supabase.storage.from(FILE_BUCKET).upload(path, bytes, {
      contentType: file.type || undefined,
      upsert: false,
    });
    if (error) throw error;
    uploaded.push({
      kind,
      bucket: FILE_BUCKET,
      path,
      name: file.name,
      type: file.type || 'application/octet-stream',
      size: file.size,
      stored: 'supabase',
    });
  }

  return uploaded;
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

  details = withBackgroundCheckDetails({
    ...details,
    meets_experience_preference: true,
    background_check_consent: true,
  }, 'consent_received');

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('provider_applications')
    .insert({
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
    })
    .select('id')
    .single();

  if (error) {
    console.error('provider_applications insert failed:', error);
    return NextResponse.json(
      { error: 'Could not submit your application. Please email christopher.perry@theshapecommunity.com directly.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  try {
    const documents = await uploadApplicationFiles(data.id, files);
    if (documents.length) {
      details = { ...details, documents };
      const admin = createAdminClient();
      const { error: updateError } = await admin
        .from('provider_applications')
        .update({ details })
        .eq('id', data.id);
      if (updateError) throw updateError;
    }
  } catch (uploadError) {
    console.error('provider application upload failed:', uploadError);
    return NextResponse.json(
      { error: uploadError instanceof Error ? uploadError.message : 'Could not upload application files.' },
      { status: 500, headers: CORS_HEADERS }
    );
  }

  const role = providerTypeRaw === 'trainer' ? 'Trainer' : 'Nutritionist';
  const fullName = `${firstName} ${lastName}`.trim();
  void sendApplicationEmails({
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
    applicationId: data?.id,
  });

  return NextResponse.json({ ok: true, id: data?.id }, { headers: CORS_HEADERS });
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

  void sendEmail({
    to: ADMIN_EMAIL,
    subject: `New ${ctx.role.toLowerCase()} application — ${ctx.fullName}`,
    html: adminHtml,
    text: adminText,
  }).catch((e) => console.error('[apply] admin notify failed', e));

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

  void sendEmail({
    to: ctx.email,
    subject: `We got your application, ${ctx.firstName}`,
    html: applicantHtml,
    text: applicantText,
  }).catch((e) => console.error('[apply] applicant reply failed', e));
}
