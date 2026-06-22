// Privacy rights request intake (CCPA requires an accessible request method;
// GDPR + state laws require a clear channel). Public — anyone (data subject or an
// authorized agent) can submit a request to access, delete, correct, port, opt
// out, withdraw consent, or appeal a prior decision. The request is delivered to
// the privacy inbox for handling within the statutory SLA; we verify identity
// before acting on it. No-ops cleanly if email isn't configured.

import { NextResponse } from 'next/server';
import { sendEmail } from '@/lib/email';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TYPES = new Set(['access', 'delete', 'correct', 'portability', 'opt-out', 'withdraw-consent', 'limit-sensitive', 'appeal', 'other']);
const TO = process.env.PRIVACY_EMAIL ?? 'privacy@theshapecommunity.com';

function clean(s: unknown, max = 2000): string { return String(s ?? '').slice(0, max).trim(); }
function isEmail(s: string): boolean { return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s); }
function esc(s: string): string { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

export async function POST(req: Request) {
  const r = await readJson<Record<string, unknown>>(req);
  if (!r.ok) return r.response;
  const b = r.data as Record<string, unknown>;

  const email = clean(b.email, 200);
  const type = clean(b.type, 50);
  const name = clean(b.name, 200);
  const region = clean(b.region, 80);
  const details = clean(b.details, 5000);
  const agent = b.authorizedAgent === true || b.authorizedAgent === 'true';

  if (!isEmail(email)) return NextResponse.json({ error: 'A valid email is required so we can verify and respond.' }, { status: 400 });
  if (!TYPES.has(type)) return NextResponse.json({ error: 'Please choose a valid request type.' }, { status: 400 });

  const summary =
    `Privacy rights request\n\n` +
    `Type: ${type}\n` +
    `From: ${email}\n` +
    `Name: ${name || '(not provided)'}\n` +
    `Region/state: ${region || '(not provided)'}\n` +
    `Authorized agent: ${agent ? 'yes' : 'no'}\n\n` +
    `Details:\n${details || '(none)'}\n\n` +
    `Action: verify identity, then fulfil within the applicable SLA (CCPA: acknowledge <=10 business days, respond <=45 days; GDPR/state: <=1 month).`;

  // A statutory rights request MUST actually reach the privacy inbox. sendEmail
  // returns { ok:false } (it never throws) when email is unconfigured or Resend
  // returns non-2xx — so check the result, don't just guard against throws. If we
  // can't deliver it, tell the requester to email directly rather than silently
  // dropping the request while reporting success.
  let delivered = false;
  try {
    const sent = await sendEmail({
      to: TO,
      subject: `[Shape] Privacy request: ${type} - ${email}`,
      text: summary,
      html: `<p>${esc(summary).replace(/\n/g, '<br/>')}</p>`,
    });
    delivered = sent.ok;
    if (!sent.ok) console.error('[privacy-request] notify failed:', sent.error);
  } catch (err) {
    console.error('[privacy-request] notify threw:', err);
  }
  if (!delivered) {
    return NextResponse.json({ error: "Couldn't submit right now. Please email privacy@theshapecommunity.com directly." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
