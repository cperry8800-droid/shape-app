// Coach credential expiry re-verification — weekly cron. Scans for professional
// liability insurance (provider_credentials.insurance_expires) and state licenses
// (provider_licenses.expires_on) falling inside the next 60 days, and sends ONE
// never-shaming heads-up per coach per credential per calendar month (deduped via
// coach_credential_expiry_reminders). The notification rides the existing push
// spine (a notifications INSERT → /api/push/dispatch webhook).
//
// Auth: header `x-cron-secret: <CRON_SECRET>` OR Vercel Cron's
// `Authorization: Bearer <CRON_SECRET>`. Runs as the service role. No-op until the
// 2026-06-19-coach-credential-verification migration is applied.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const WINDOW_DAYS = 60;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || process.env.NOTIFY_CRON_SECRET || '';
  if (!secret) return false;
  const hdr = request.headers.get('x-cron-secret') || '';
  const auth = request.headers.get('authorization') || '';
  return safeEqual(hdr, secret) || safeEqual(auth, `Bearer ${secret}`);
}

const isoDate = (d: Date): string => d.toISOString().slice(0, 10);

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_DAYS * 86400000);
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let sent = 0;

  // One reminder for this owner+kind this calendar month — only when the ledger row
  // is freshly inserted (ignoreDuplicates makes a re-send a no-op).
  const remindOnce = async (ownerId: string, kind: string, notify: { title: string; body: string }) => {
    try {
      const { data: ins } = await admin
        .from('coach_credential_expiry_reminders')
        .upsert({ owner_id: ownerId, kind, period }, { onConflict: 'owner_id,kind,period', ignoreDuplicates: true })
        .select('owner_id');
      if (!ins || ins.length === 0) return; // already reminded this month
      await createNotification(admin, {
        userId: ownerId,
        type: 'credential_expiry',
        title: notify.title,
        body: notify.body,
        route: 'profile',
        data: { channels: { inapp: true, push: true, email: false }, kind },
      });
      sent += 1;
    } catch (err) {
      console.error('[shape] credential-expiry remind failed:', err);
    }
  };

  try {
    const [creds, licenses] = await Promise.all([
      admin
        .from('provider_credentials')
        .select('owner_id, insurance_expires')
        .gte('insurance_expires', isoDate(now))
        .lte('insurance_expires', isoDate(until)),
      admin
        .from('provider_licenses')
        .select('owner_id, state, expires_on')
        .gte('expires_on', isoDate(now))
        .lte('expires_on', isoDate(until)),
    ]);

    for (const c of (creds.data ?? []) as Array<{ owner_id: string; insurance_expires: string }>) {
      await remindOnce(c.owner_id, 'insurance', {
        title: 'Insurance renewal coming up',
        body: `Your liability insurance expires ${c.insurance_expires}. Renew and re-upload your COI to keep your Verified badge.`,
      });
    }
    for (const l of (licenses.data ?? []) as Array<{ owner_id: string; state: string; expires_on: string }>) {
      await remindOnce(l.owner_id, `license:${l.state}`, {
        title: `License renewal — ${l.state}`,
        body: `Your ${l.state} license expires ${l.expires_on}. Update it to stay verified for clients in that state.`,
      });
    }
  } catch (err) {
    // Tables missing (migration not yet applied) or any read failure: no-op.
    console.error('[shape] credential-expiry scan failed:', err);
    return NextResponse.json({ ok: true, sent: 0, skipped: true });
  }

  return NextResponse.json({ ok: true, sent });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
