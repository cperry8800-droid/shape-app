// Coach credential expiry re-verification — weekly cron. Scans for professional
// liability insurance (provider_credentials.insurance_expires) and state licenses
// (provider_licenses.expires_on) falling inside the next 60 days, and sends ONE
// never-shaming heads-up per coach per credential per calendar month (deduped via
// coach_credential_expiry_reminders). The notification rides the existing push
// spine (a notifications INSERT → /api/push/dispatch webhook).
//
// It also acts on insurance that has already EXPIRED: the Verified badge rests on a current
// certificate of insurance (the admin review checks it), so a verified coach whose COI has lapsed
// loses the badge, their credential row goes back to 'changes_requested' for the admin, and they
// are told, once, when the badge comes off. An expired state license is left to the licensure
// matching, which already ignores a lapsed state (src/lib/compliance/nutrition.mjs); it does not
// take the coach's badge.
//
// Auth: header `x-cron-secret: <CRON_SECRET>` OR Vercel Cron's
// `Authorization: Bearer <CRON_SECRET>`. Runs as the service role. No-op until the
// 2026-06-19-coach-credential-verification migration is applied.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { createNotification } from '@/lib/notify';
import { clearListingVerified } from '@/lib/coach-verification';

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
// Owners per `.in()` filter: the ids ride in the request URL.
const ID_CHUNK = 100;

async function handle(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const admin = createAdminClient();
  const now = new Date();
  const until = new Date(now.getTime() + WINDOW_DAYS * 86400000);
  const period = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  let sent = 0;
  let unverified = 0;

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

    // ⚠ EXPIRED, NOT EXPIRING. The reminders above stop at today, so a certificate that lapsed
    // left the coach Verified indefinitely. Only coaches who are verified now are looked at: the
    // badge is what is wrong, and the set is small.
    const today = isoDate(now);
    const verifiedOwners = new Set<string>();
    for (const table of ['trainers', 'nutritionists'] as const) {
      const { data, error } = await admin.from(table).select('owner_id').eq('verified', true);
      if (error) throw error;
      for (const r of (data ?? []) as Array<{ owner_id: string | null }>) if (r.owner_id) verifiedOwners.add(r.owner_id);
    }
    const ids = [...verifiedOwners];
    const lapsed: Array<{ owner_id: string; insurance_expires: string }> = [];
    for (let i = 0; i < ids.length; i += ID_CHUNK) {
      const { data, error } = await admin
        .from('provider_credentials')
        .select('owner_id, insurance_expires')
        .in('owner_id', ids.slice(i, i + ID_CHUNK))
        .lt('insurance_expires', today);
      if (error) throw error;
      lapsed.push(...((data ?? []) as Array<{ owner_id: string; insurance_expires: string }>));
    }
    for (const c of lapsed) {
      try {
        if ((await clearListingVerified(admin, c.owner_id)) === 0) continue;
        unverified += 1;
        // Back into the admin's queue, as a request for changes, with the reason.
        await admin
          .from('provider_credentials')
          .update({
            review_status: 'changes_requested',
            verified_at: null,
            review_notes: `Insurance expired ${c.insurance_expires}. A current certificate of insurance is needed to restore the Verified badge.`,
          })
          .eq('owner_id', c.owner_id)
          .eq('review_status', 'approved');
      } catch (err) {
        console.error('[shape] credential-expiry unverify failed:', err);
        continue;
      }
      await remindOnce(c.owner_id, 'insurance_expired', {
        title: 'Your insurance has expired',
        body: `Your liability insurance expired ${c.insurance_expires}, so your Verified badge is off for now. Upload a current COI on your profile and we’ll re-verify you.`,
      });
    }
  } catch (err) {
    // Tables missing (migration not yet applied) or any read failure: no-op.
    console.error('[shape] credential-expiry scan failed:', err);
    return NextResponse.json({ ok: true, sent: 0, skipped: true });
  }

  return NextResponse.json({ ok: true, sent, unverified });
}

export async function GET(request: Request) {
  return handle(request);
}
export async function POST(request: Request) {
  return handle(request);
}
