// Provider application endpoint (trainer / nutritionist).
// Accepts a JSON body with core identifying fields + a free-form `details`
// object for the rest of the intake. Inserts into public.provider_applications.
//
// Called by public/signup-trainer.html and public/signup-nutritionist.html.

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.APPLICATIONS_EMAIL ?? 'info@theshapecommunity.com';

const MAX_TEXT = 500;
const MAX_LONG = 10000;

function clean(v: unknown, max = MAX_TEXT): string {
  if (typeof v !== 'string') return '';
  return v.trim().slice(0, max);
}

function isEmail(s: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function sanitizeDetails(input: unknown): Record<string, string> {
  if (!input || typeof input !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [rawKey, rawVal] of Object.entries(input as Record<string, unknown>)) {
    if (typeof rawKey !== 'string' || !rawKey) continue;
    const key = rawKey.slice(0, 100);
    if (rawVal == null) continue;
    if (typeof rawVal === 'string') {
      out[key] = rawVal.trim().slice(0, MAX_LONG);
    } else if (typeof rawVal === 'number' || typeof rawVal === 'boolean') {
      out[key] = String(rawVal);
    }
    if (Object.keys(out).length >= 100) break;
  }
  return out;
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const providerTypeRaw = clean(body.providerType, 20).toLowerCase();
  if (providerTypeRaw !== 'trainer' && providerTypeRaw !== 'nutritionist') {
    return NextResponse.json(
      { error: 'providerType must be "trainer" or "nutritionist".' },
      { status: 400 }
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
  const details = sanitizeDetails(body.details);

  if (!firstName || !lastName || !email) {
    return NextResponse.json(
      { error: 'First name, last name, and email are required.' },
      { status: 400 }
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

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
      { error: 'Could not submit your application. Please email info@theshapecommunity.com directly.' },
      { status: 500 }
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

  return NextResponse.json({ ok: true, id: data?.id });
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
      <p style="margin:0 0 16px;line-height:1.55;">Remember: <strong>your first 60 days on Shape are free</strong>. After that, it's a flat $20/month platform fee — no matter how many clients you take on or how much you earn.</p>
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
    'Your first 60 days on Shape are free. After that, a flat $20/month platform fee — no matter how many clients you take on or how much you earn.',
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
