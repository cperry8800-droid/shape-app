// User-initiated account actions: Export, Pause, Delete.
//
// These intentionally don't take destructive action on the server. They
// record the request in a dedicated table and notify admin support so a
// human can run the export / cancel / hard-delete flow with audit trail.
// The user sees an immediate "submitted" toast on the client.

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { sendEmail } from '@/lib/email';
import { readJson } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED = new Set(['Export', 'Pause', 'Delete']);
const ADMIN_EMAIL = process.env.APPLICATIONS_EMAIL ?? 'chris.perry@shapecommunity.onmicrosoft.com';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const bodyResult = await readJson<Record<string, unknown>>(req, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const action = String((body as { action?: unknown }).action || '');
  if (!ALLOWED.has(action)) {
    return NextResponse.json({ error: 'Invalid action.' }, { status: 400 });
  }

  // Record the request. The table is optional; if it doesn't exist yet we
  // still want the email-out path to fire so admin sees it.
  try {
    await supabase.from('account_action_requests').insert({
      user_id: user.id,
      action,
    });
  } catch {
    // No-op: table may not be provisioned yet; admin email below is the
    // backstop.
  }

  try {
    const summary =
      `User ${user.email || '(no email)'} (${user.id}) requested account action: ${action}.\n\n` +
      `Run the corresponding admin flow and email the user when complete.`;
    await sendEmail({
      to: ADMIN_EMAIL,
      subject: `[Shape] ${action} requested by ${user.email || user.id}`,
      text: summary,
      html: `<p>${summary.replace(/\n/g, '<br/>')}</p>`,
    });
  } catch (err) {
    // Don't block the user — they've already seen the confirm. Log
    // server-side and return ok so the toast says "submitted".
    console.error('[me/account-action] notify failed:', err);
  }

  return NextResponse.json({ ok: true, action });
}
