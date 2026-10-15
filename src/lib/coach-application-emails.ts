// The emails a coach application's review sends: the decision to the applicant (approved or
// not), and a heads-up to the applications inbox when an approved coach submits credentials for
// verification. Pure builders, so the copy can be tested without a mail service; the actions send
// them through sendEmail (src/lib/email.ts), which fails quietly.
//
// The tone follows the applicant confirmation email in /api/apply: short, plain, signed by the
// Shape team, a reply goes to a person.

export type CoachRole = 'trainer' | 'nutritionist';

export type BuiltEmail = { subject: string; html: string; text: string };

/** Where the site lives, for links in an email (the same default /api/apply uses). */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com').replace(/\/+$/, '');
}

/** The applications inbox: the address /api/apply mails new applications to. */
export function applicationsInbox(): string {
  return process.env.APPLICATIONS_EMAIL ?? 'christopher.perry@theshapecommunity.com';
}

export function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const WRAP_OPEN =
  `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0a0d0c;">`;
export const SIGN_OFF_HTML =
  `<p style="margin:24px 0 0;color:#666;font-size:13px;">— The Shape team<br/><a href="https://theshapecommunity.com" style="color:#0ac5a8;">theshapecommunity.com</a></p>`;
export const SIGN_OFF_TEXT = ['— The Shape team', 'https://theshapecommunity.com'];

export function button(href: string, label: string): string {
  return `<p style="margin:0 0 20px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:#0ac5a8;color:#06100e;text-decoration:none;padding:11px 16px;border-radius:999px;font-size:14px;font-weight:600;">${escapeHtml(label)}</a></p>`;
}

function noteBlock(note: string): { html: string; text: string[] } {
  const clean = note.trim();
  if (!clean) return { html: '', text: [] };
  return {
    html: `<p style="margin:0 0 16px;line-height:1.55;padding:12px 14px;border-left:3px solid #0ac5a8;background:#f4f7f6;">${escapeHtml(clean).replace(/\n/g, '<br/>')}</p>`,
    text: ['A note from the reviewer:', clean, ''],
  };
}

export function coachPages(role: CoachRole, site = siteUrl()) {
  const prefix = role === 'nutritionist' ? 'Nutritionist' : 'Trainer';
  return {
    dashboard: `${site}/newdesign/${prefix}Dashboard.html`,
    profile: `${site}/newdesign/${prefix}Profile.html`,
    business: `${site}/newdesign/${prefix}Analytics.html`,
    signIn: `${site}/newdesign/Login.html`,
    forgotPassword: `${site}/forgot-password`,
  };
}

/**
 * The approval email. A new account gets `setPasswordUrl` (a one-time link that signs them in
 * and opens the set-password page); an account that already existed is told to sign in with it.
 */
export function approvalEmail(args: {
  firstName: string;
  role: CoachRole;
  setPasswordUrl: string | null;
  applicantNote?: string;
  site?: string;
}): BuiltEmail {
  const site = args.site ?? siteUrl();
  const pages = coachPages(args.role, site);
  const roleLabel = args.role === 'nutritionist' ? 'nutritionist' : 'trainer';
  const first = args.firstName.trim() || 'there';
  const note = noteBlock(args.applicantNote ?? '');

  const signInHtml = args.setPasswordUrl
    ? `<p style="margin:0 0 12px;line-height:1.55;">Your coach account is ready. Choose a password to sign in for the first time:</p>${button(args.setPasswordUrl, 'Set your password')}<p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.5;">The link works once, for a limited time. If it has expired, use <a href="${escapeHtml(pages.forgotPassword)}" style="color:#0ac5a8;">Forgot password</a> with this email address.</p>`
    : `<p style="margin:0 0 12px;line-height:1.55;">Your coach profile is on the account you already have with this email address. Sign in as usual:</p>${button(pages.signIn, 'Sign in to Shape')}<p style="margin:0 0 16px;color:#666;font-size:13px;line-height:1.5;">Forgot your password? <a href="${escapeHtml(pages.forgotPassword)}" style="color:#0ac5a8;">Reset it here</a>.</p>`;
  const signInText = args.setPasswordUrl
    ? [
        'Your coach account is ready. Choose a password to sign in for the first time:',
        args.setPasswordUrl,
        `(The link works once, for a limited time. If it has expired, use Forgot password at ${pages.forgotPassword} with this email address.)`,
      ]
    : [
        'Your coach profile is on the account you already have with this email address. Sign in as usual:',
        pages.signIn,
        `Forgot your password? ${pages.forgotPassword}`,
      ];

  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">Welcome to Shape, ${escapeHtml(first)}.</h2>
      <p style="margin:0 0 16px;line-height:1.55;">Your application to coach on Shape as a ${escapeHtml(roleLabel)} has been approved.</p>
      ${note.html}
      ${signInHtml}
      <p style="margin:0 0 8px;line-height:1.55;"><strong>Before clients can find and book you</strong> (your listing appears in the marketplace once the first three are done):</p>
      <ol style="margin:0 0 20px;padding-left:20px;line-height:1.6;">
        <li>Add a profile photo and check your listing on <a href="${escapeHtml(pages.profile)}" style="color:#0ac5a8;">your profile</a>.</li>
        <li>Set your prices: your monthly rate and your single-session price.</li>
        <li>Connect Stripe so you can be paid: <a href="${escapeHtml(pages.business)}" style="color:#0ac5a8;">Business</a> → Set up payouts.</li>
        <li>Upload your certification and insurance on your profile to get the Verified badge.</li>
      </ol>
      <p style="margin:0 0 16px;line-height:1.55;">There's no monthly fee to be on Shape. We take a <strong>15% platform fee</strong> on what your clients pay you.</p>
      <p style="margin:0 0 16px;line-height:1.55;">Questions? Just reply to this email.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `Welcome to Shape, ${first}.`,
    '',
    `Your application to coach on Shape as a ${roleLabel} has been approved.`,
    '',
    ...note.text,
    ...signInText,
    '',
    'Before clients can find and book you (your listing appears in the marketplace once the first three are done):',
    `  1. Add a profile photo and check your listing: ${pages.profile}`,
    '  2. Set your prices: your monthly rate and your single-session price.',
    `  3. Connect Stripe so you can be paid: Business > Set up payouts (${pages.business})`,
    '  4. Upload your certification and insurance on your profile to get the Verified badge.',
    '',
    "No monthly fee on Shape. We take a 15% platform fee on what your clients pay you.",
    '',
    'Questions? Just reply to this email.',
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');

  return { subject: `You're approved to coach on Shape, ${first}`, html, text };
}

/**
 * The decision email when an application is not approved. Generic unless the reviewer wrote a
 * note FOR THE APPLICANT (a separate field); the internal review notes are never sent.
 */
export function rejectionEmail(args: { firstName: string; role: CoachRole; applicantNote?: string }): BuiltEmail {
  const roleLabel = args.role === 'nutritionist' ? 'nutritionist' : 'trainer';
  const first = args.firstName.trim() || 'there';
  const note = noteBlock(args.applicantNote ?? '');
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 16px;font-size:22px;font-weight:500;">Thank you, ${escapeHtml(first)}.</h2>
      <p style="margin:0 0 16px;line-height:1.55;">Thank you for applying to coach on Shape as a ${escapeHtml(roleLabel)}, and for the time you put into your application.</p>
      <p style="margin:0 0 16px;line-height:1.55;">After reviewing it, we're not able to approve your application at this time.</p>
      ${note.html}
      <p style="margin:0 0 16px;line-height:1.55;">If your circumstances change, you're welcome to apply again. Questions? Just reply to this email.</p>
      ${SIGN_OFF_HTML}
    </div>
  `;
  const text = [
    `Thank you, ${first}.`,
    '',
    `Thank you for applying to coach on Shape as a ${roleLabel}, and for the time you put into your application.`,
    '',
    "After reviewing it, we're not able to approve your application at this time.",
    '',
    ...note.text,
    "If your circumstances change, you're welcome to apply again. Questions? Just reply to this email.",
    '',
    ...SIGN_OFF_TEXT,
  ].join('\n');
  return { subject: 'Your Shape coach application', html, text };
}

/** The heads-up to the applications inbox when a coach submits credentials for verification. */
export function credentialsSubmittedEmail(args: {
  coachName: string;
  coachEmail: string;
  ownerId: string;
  site?: string;
}): BuiltEmail {
  const site = args.site ?? siteUrl();
  const queue = `${site}/dashboard/credentials?status=pending`;
  const name = args.coachName.trim() || 'A coach';
  const html = `
    ${WRAP_OPEN}
      <h2 style="margin:0 0 12px;font-size:18px;">Credentials submitted for verification</h2>
      <p style="margin:0 0 16px;color:#555;font-size:14px;line-height:1.5;">${escapeHtml(name)}${args.coachEmail ? ` (${escapeHtml(args.coachEmail)})` : ''} submitted their certification and insurance for review. Their Verified badge is off until the review is done.</p>
      ${button(queue, 'Open credential review')}
      <p style="margin:20px 0 0;color:#999;font-size:12px;">Coach account: ${escapeHtml(args.ownerId)}</p>
    </div>
  `;
  const text = [
    'Credentials submitted for verification',
    '',
    `${name}${args.coachEmail ? ` (${args.coachEmail})` : ''} submitted their certification and insurance for review. Their Verified badge is off until the review is done.`,
    '',
    `Review: ${queue}`,
    '',
    `Coach account: ${args.ownerId}`,
  ].join('\n');
  return { subject: `Credentials to verify — ${name}`, html, text };
}
