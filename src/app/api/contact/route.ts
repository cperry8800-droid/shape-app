// Contact form submission endpoint.
// Expects a Supabase table `contact_submissions` with columns:
//   id uuid default gen_random_uuid() primary key
//   created_at timestamptz default now()
//   first_name text not null
//   last_name text not null
//   email text not null
//   phone text
//   subject text
//   message text not null
//   user_agent text
//   status text default 'new'
// RLS: no anonymous insert since the 2026-10-10 migration (L19); the route writes as the service
// role after its own checks. Select is restricted to authenticated admins.

import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendEmail } from '@/lib/email';
import { cleanText as clean, isEmail, readJson } from '@/lib/request-utils';
import { verifyTurnstile } from '@/lib/turnstile';

export const dynamic = 'force-dynamic';

const ADMIN_EMAIL = process.env.APPLICATIONS_EMAIL ?? 'chris.perry@shapecommunity.onmicrosoft.com';

const MAX_FIELD = 5000;

export async function POST(req: NextRequest) {
  const parsed = await readJson<Record<string, unknown>>(req);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const firstName = clean(body.firstName, 100);
  const lastName = clean(body.lastName, 100);
  const email = clean(body.email, 200).toLowerCase();
  const phone = clean(body.phone, 40);
  const subject = clean(body.subject, 100);
  const message = clean(body.message, MAX_FIELD);

  if (!firstName || !lastName || !email || !message) {
    return NextResponse.json(
      { error: 'First name, last name, email, and message are required.' },
      { status: 400 }
    );
  }
  if (!isEmail(email)) {
    return NextResponse.json({ error: 'Please enter a valid email.' }, { status: 400 });
  }

  // M2 (2026-10-08 review): an anonymous, Shape-branded email relay with no bot check. The same
  // Turnstile gate the consultation form carries: a no-op until TURNSTILE_SECRET_KEY is set, then
  // a public submission must carry a valid token (public/contact.html renders the widget). The
  // website is this route's only caller, so there is no app exemption here.
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
  if (!(await verifyTurnstile(body.captchaToken ?? body.turnstileToken, ip))) {
    return NextResponse.json({ error: 'Captcha check failed — please retry.' }, { status: 400 });
  }

  // L19 (2026-10-10): the anonymous insert policy on contact_submissions is gone, so this
  // public form writes through the service role after the checks above. Nothing is read back.
  const supabase = createAdminClient();
  const { error } = await supabase.from('contact_submissions').insert({
    first_name: firstName,
    last_name: lastName,
    email,
    phone: phone || null,
    subject: subject || null,
    message,
    user_agent: req.headers.get('user-agent') || null,
  });

  if (error) {
    console.error('contact_submissions insert failed:', error);
    return NextResponse.json(
      { error: 'Could not save your message. Please email info@theshapecommunity.com directly.' },
      { status: 500 }
    );
  }

  void sendContactEmails({ firstName, lastName, email, phone, subject, message });

  return NextResponse.json({ ok: true });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendContactEmails(c: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  subject: string;
  message: string;
}): Promise<void> {
  const fullName = `${c.firstName} ${c.lastName}`.trim();
  const rows: Array<[string, string]> = [
    ['Name', fullName],
    ['Email', c.email],
    ['Phone', c.phone],
    ['Subject', c.subject],
  ].filter(([, v]) => Boolean(v)) as Array<[string, string]>;

  const adminHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;">
      <h2 style="margin:0 0 12px;font-size:18px;">New contact form message</h2>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        ${rows.map(([k, v]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#666;width:120px;">${escapeHtml(k)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;">${escapeHtml(v)}</td></tr>`).join('')}
      </table>
      <div style="border-left:3px solid #0ac5a8;padding:12px 16px;background:#f7fafa;white-space:pre-wrap;font-size:14px;line-height:1.55;">${escapeHtml(c.message)}</div>
    </div>
  `;
  const adminText = [
    'New contact form message',
    '',
    ...rows.map(([k, v]) => `${k}: ${v}`),
    '',
    c.message,
  ].join('\n');

  void sendEmail({
    to: ADMIN_EMAIL,
    subject: `Contact form: ${c.subject || 'New message from ' + fullName}`,
    html: adminHtml,
    text: adminText,
  }).catch((e) => console.error('[contact] admin notify failed', e));

  // M2 (2026-10-08 review): the auto-reply no longer echoes the message. It went to whatever
  // address the body named, with up to 5,000 characters of the sender's own text inside a
  // Shape-branded mail: a free relay for anyone's words to anyone's inbox. The reply says we got
  // it and names the subject at most; the message itself is only in the team's copy.
  const subjectLine = c.subject ? ` about "${escapeHtml(c.subject)}"` : '';
  const replyHtml = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0d0c;">
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">Thanks, ${escapeHtml(c.firstName)}.</h2>
      <p style="margin:0 0 16px;line-height:1.55;">We got your message${subjectLine} and someone from the Shape team will get back to you within 1–2 business days.</p>
      <p style="margin:24px 0 0;color:#666;font-size:13px;">— The Shape team<br/><a href="https://theshapecommunity.com" style="color:#0ac5a8;">theshapecommunity.com</a></p>
    </div>
  `;
  const replyText = [
    `Thanks, ${c.firstName}.`,
    '',
    `We got your message${c.subject ? ` about "${c.subject}"` : ''} and someone from the Shape team will get back to you within 1–2 business days.`,
    '',
    '— The Shape team',
    'https://theshapecommunity.com',
  ].join('\n');

  void sendEmail({
    to: c.email,
    subject: `We got your message, ${c.firstName}`,
    html: replyHtml,
    text: replyText,
  }).catch((e) => console.error('[contact] reply failed', e));
}
