// The notices quiet hours held, sent once the night is over (owner, 2026-10-26: "fix 1-7").
// /api/push/dispatch stamps a notice that lands in the recipient's quiet hours with data.held_at
// instead of dropping its push and email; this runs every 15 minutes and hands each held notice back
// to deliverNotice, which sends it if the night is over and holds it again if it is not.
//
// A notice the person read or cleared in the app meanwhile is not pushed: they have seen it. One held
// more than a day is let go (it stays in the app). At most HELD_PER_PERSON pushes per person per run,
// oldest first, so a busy night is not a burst of pushes at 7 am; the rest stay in the app.
//
// Auth: x-cron-secret: <CRON_SECRET> OR Authorization: Bearer <CRON_SECRET>.
import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { deliverNotice } from '../../push/dispatch/route';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const HELD_FOR_MS = 24 * 60 * 60 * 1000;
const HELD_PER_PERSON = 3;
const PAGE = 500;
// ⚠ IT STOPS TAKING WORK WITH TIME TO SPARE (Codex on #2476). Cut off by maxDuration between taking a
// hold off and the send, a notice would never be pushed. What a run leaves keeps its hold for the next.
const TIME_BUDGET_MS = 90_000;

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(String(a || ''));
  const y = Buffer.from(String(b || ''));
  return x.length === y.length && timingSafeEqual(x, y);
}
function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET || '';
  if (!secret) return false;
  return safeEqual(request.headers.get('x-cron-secret') || '', secret)
    || safeEqual(request.headers.get('authorization') || '', `Bearer ${secret}`);
}

type HeldRow = {
  id: string; user_id: string; type: string; title: string; body: string; route: string | null;
  data: Record<string, unknown> | null; created_at: string; read_at: string | null; cleared_at?: string | null;
};

// What to do with one held notice: let it go (seen, or held too long) or send it.
export function heldVerdict(row: Pick<HeldRow, 'created_at' | 'read_at' | 'cleared_at'>, now: Date): 'send' | 'seen' | 'stale' {
  if (row.read_at || row.cleared_at) return 'seen';
  const at = Date.parse(row.created_at);
  return Number.isFinite(at) && now.getTime() - at > HELD_FOR_MS ? 'stale' : 'send';
}

// Takes the hold off a row, only if it still has one: two overlapping runs never both send it.
async function release(admin: ReturnType<typeof createAdminClient>, row: HeldRow): Promise<boolean> {
  const { held_at: _held, ...data } = row.data ?? {};
  const { data: claimed, error } = await admin.from('notifications')
    .update({ data })
    .eq('id', row.id)
    .not('data->>held_at', 'is', null)
    .select('id');
  return !error && Array.isArray(claimed) && claimed.length > 0;
}

// Puts the hold back on a row whose send failed, so the next run tries it again (one held over a day is
// let go then). It goes over the row as it now stands: the attempt may have stamped its email, and that
// stamp is kept so the email is not sent twice.
async function rehold(admin: ReturnType<typeof createAdminClient>, row: HeldRow, heldAt: string): Promise<boolean> {
  const { held_at: _held, ...before } = row.data ?? {};
  const { data: now } = await admin.from('notifications').select('data').eq('id', row.id).maybeSingle();
  const current = now && now.data && typeof now.data === 'object' ? (now.data as Record<string, unknown>) : before;
  const { error } = await admin.from('notifications').update({ data: { ...current, held_at: heldAt } }).eq('id', row.id);
  return !error;
}

async function run(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  const startedAt = Date.now();
  const admin = createAdminClient();
  const now = new Date();
  let delivered = 0, letGo = 0, failed = 0, stopped = false;
  const perPerson = new Map<string, number>();

  // Paged on created_at, not on an offset: every row this run releases leaves the filter, so an
  // offset would skip the rows behind it.
  // capped-read-ok: one page of a walk over every held row, oldest first so the night's notices go in
  // the order they came and the per-person limit keeps the first ones; not a cap.
  let after = '';
  walk: for (;;) {
    let q = admin.from('notifications')
      .select('*')
      .not('data->>held_at', 'is', null)
      .order('created_at', { ascending: true })
      .limit(PAGE);
    if (after) q = q.gt('created_at', after);
    const { data, error } = await q;
    if (error) {
      console.error('[push-held] read failed:', error.message);
      return NextResponse.json({ ok: false, delivered, letGo, failed, stopped }, { status: 500 });
    }
    const rows = (data ?? []) as HeldRow[];
    for (const row of rows) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) { stopped = true; break walk; }
      let released = false;
      try {
        const verdict = heldVerdict(row, now);
        const used = perPerson.get(row.user_id) || 0;
        if (verdict !== 'send' || used >= HELD_PER_PERSON) {
          if (await release(admin, row)) letGo += 1;
          continue;
        }
        if (!(await release(admin, row))) continue; // another run has it
        released = true;
        const { held_at: _held, ...data } = row.data ?? {};
        const out = await deliverNotice({ ...row, data }, now);
        // Still the person's night (they moved their quiet hours): deliverNotice held it again.
        if (!out.held) { perPerson.set(row.user_id, used + 1); delivered += 1; }
      } catch (err) {
        failed += 1;
        console.error('[push-held] could not send', row.id, err instanceof Error ? err.message : err);
        // ⚠ A SEND THAT FAILED KEEPS ITS HOLD (Codex on #2476). The hold had come off before the send, so
        // a send that threw left a row no run would see again, and its push was never sent.
        if (released) {
          try {
            if (!(await rehold(admin, row, String(row.data?.held_at ?? now.toISOString())))) console.error('[push-held] could not hold it again', row.id);
          } catch (e) {
            console.error('[push-held] could not hold it again', row.id, e instanceof Error ? e.message : e);
          }
        }
      }
    }
    if (rows.length < PAGE) break;
    after = rows[rows.length - 1].created_at;
  }
  if (stopped) console.error('[push-held] the run stopped at its time limit; the rest stay held for the next');
  return NextResponse.json({ ok: true, delivered, letGo, failed, stopped });
}

export async function GET(request: Request) { return run(request); }
export async function POST(request: Request) { return run(request); }
