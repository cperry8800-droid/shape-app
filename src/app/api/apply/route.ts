// Provider application endpoint (trainer / nutritionist).
//
// Accepts multipart/form-data with the application fields plus optional file
// uploads (certProof, insuranceDoc, samplePlan). Files are uploaded to the
// private `provider-credentials` Supabase Storage bucket via the service-role
// admin client and their object paths recorded in the `details` JSONB.
//
// Called by public/signup-trainer.html and public/signup-nutritionist.html.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.APPLICATIONS_EMAIL ?? 'chris.perry@shapecommunity.onmicrosoft.com';
const STORAGE_BUCKET = 'provider-credentials';

const MAX_TEXT = 500;
const MAX_LONG = 10000;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB; matches bucket file_size_limit
const ALLOWED_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);
const FILE_FIELDS = ['certProof', 'insuranceDoc', 'samplePlan'] as const;

// Reserved keys that map to top-level columns or are filled in by the server;
// stripping them from the user-controlled details blob keeps the JSONB clean.
const RESERVED_DETAIL_KEYS = new Set([
  'providerType',
  'firstName',
  'lastName',
  'email',
  'phone',
  'location',
  'specialty',
  'yearsExperience',
  'monthlyPrice',
  ...FILE_FIELDS,
  ...FILE_FIELDS.map((f) => `${f}_path`),
]);

function clean(v: unknown, max = MAX_TEXT): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function safeFileName(name: string): string {
  const trimmed = name.trim().replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
  return trimmed || 'upload';
}

function extensionFor(file: File): string {
  const fromName = file.name.match(/\.([a-zA-Z0-9]{1,8})$/);
  if (fromName) return fromName[1].toLowerCase();
  switch (file.type) {
    case 'image/png': return 'png';
    case 'image/jpeg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'application/pdf': return 'pdf';
    case 'application/msword': return 'doc';
    case 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': return 'docx';
    default: return 'bin';
  }
}

function sanitizeDetails(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of form.entries()) {
    if (!rawKey || RESERVED_DETAIL_KEYS.has(rawKey)) continue;
    if (typeof rawVal !== 'string') continue;
    const key = rawKey.slice(0, 100);
    out[key] = rawVal.trim().slice(0, MAX_LONG);
    if (Object.keys(out).length >= 100) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: 'Expected multipart/form-data.' }, { status: 400 });
  }

  const providerTypeRaw = clean(form.get('providerType'), 20).toLowerCase();
  if (providerTypeRaw !== 'trainer' && providerTypeRaw !== 'nutritionist') {
    return NextResponse.json(
      { error: 'providerType must be "trainer" or "nutritionist".' },
      { status: 400 }
    );
  }

  const firstName = clean(form.get('firstName'), 100);
  const lastName = clean(form.get('lastName'), 100);
  const email = clean(form.get('email'), 200).toLowerCase();
  const phone = clean(form.get('phone'), 40);
  const location = clean(form.get('location'), 200);
  const specialty = clean(form.get('specialty'), 200);
  const yearsExperience = clean(form.get('yearsExperience'), 40);
  const monthlyPrice = clean(form.get('monthlyPrice'), 40);
  const details = sanitizeDetails(form);

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: 'First name, last name, and email are required.' },
      { status: 400 }
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  // Validate any uploaded files up front so we don't insert a row and then
  // bail halfway through the storage uploads.
  const incomingFiles: Array<{ field: string; file: File }> = [];
  for (const field of FILE_FIELDS) {
    const value = form.get(field);
    if (!value || typeof value === 'string') continue;
    const file = value as File;
    if (file.size === 0) continue; // empty file input — treat as not provided
    if (file.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `${field} exceeds the 10 MB limit.` },
        { status: 413 }
      );
    }
    if (file.type && !ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { error: `${field} must be a PDF, image, or Word document.` },
        { status: 415 }
      );
    }
    incomingFiles.push({ field, file });
  }

  const supabase = await createClient();
  const { data: insertData, error } = await supabase
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

  if (error || !insertData?.id) {
    console.error('provider_applications insert failed:', error);
    return NextResponse.json(
      { error: 'Could not submit your application. Please email christopher.perry@theshapecommunity.com directly.' },
      { status: 500 }
    );
  }

  const applicationId = insertData.id as string;
  const uploadedPaths: Record<string, string> = {};

  if (incomingFiles.length > 0) {
    const admin = createAdminClient();
    for (const { field, file } of incomingFiles) {
      const ext = extensionFor(file);
      const path = `${providerTypeRaw}/${applicationId}/${field}-${Date.now()}-${safeFileName(file.name)}`.replace(/\.[a-zA-Z0-9]{1,8}$/, '') + `.${ext}`;
      const arrayBuffer = await file.arrayBuffer();
      const { error: upErr } = await admin.storage
        .from(STORAGE_BUCKET)
        .upload(path, new Uint8Array(arrayBuffer), {
          contentType: file.type || 'application/octet-stream',
          upsert: false,
        });
      if (upErr) {
        console.error(`[apply] storage upload failed for ${field}:`, upErr);
        continue; // a missing supporting doc shouldn't kill the whole submission
      }
      uploadedPaths[`${field}_path`] = path;
    }

    if (Object.keys(uploadedPaths).length > 0) {
      const mergedDetails = { ...details, ...uploadedPaths };
      const { error: updErr } = await admin
        .from('provider_applications')
        .update({ details: mergedDetails })
        .eq('id', applicationId);
      if (updErr) {
        console.error('[apply] failed to record file paths on application:', updErr);
      } else {
        Object.assign(details, uploadedPaths);
      }
    }
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
    applicationId,
  });

  return NextResponse.json({ ok: true, id: applicationId });
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
  details: Record<string, string>;
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

async function sendApplicationEmails(ctx: EmailContext): Promise<void> {
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
  const adminRows: Array<[string, string]> = [...baseRows, ...Object.entries(ctx.details)]
    .filter(([, v]) => Boolean(v));

  const adminHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:18px;">New ${escapeHtml(ctx.role.toLowerCase())} application</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px;">Submitted through the ${escapeHtml(ctx.role.toLowerCase())} signup form.</p>
      <table style="width:100%;border-collapse:collapse;font-size:14px;">
        ${adminRows.map(([k, v]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;width:160px;vertical-align:top;">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(v)}</td></tr>`).join('')}
      </table>
      ${ctx.applicationId ? `<p style="margin:20px 0 0;color:#999;font-size:12px;">Application ID: ${escapeHtml(ctx.applicationId)}</p>` : ''}
    </div>
  `;
  const adminText = [
    `New ${ctx.role.toLowerCase()} application`,
    '',
    ...adminRows.map(([k, v]) => `${k}: ${v}`),
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
        <li>If it's a fit, we'll email you to verify your credentials and schedule a short intro call.</li>
        <li>Once approved, we'll set up your dashboard and help you launch your profile.</li>
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
    "  2. If it's a fit, we'll email you to verify your credentials and schedule a short intro call.",
    "  3. Once approved, we'll set up your dashboard and help you launch your profile.",
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
