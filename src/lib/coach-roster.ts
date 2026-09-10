// Live client roster for the newdesign coach "Clients" pages.
// Read-only over existing tables (trainers/nutritionists, subscriptions,
// sessions) — no new schema. Per-client adherence / at-risk analytics are
// intentionally NOT here: that needs client data a coach can't read via RLS.
//
// Shared by the trainer and nutritionist routes, which differ only in the
// provider table, the provider_role filter, and the isTrainer/isNutritionist
// response key — all derived from `role` below.

import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { DAY_MS } from '@/lib/time';

// `.toISOString()` throws on an invalid date; every caller here wants "no
// answer" rather than a 500 that takes the whole roster down with it.
function isoOrNull(v: string | null | undefined): string | null {
  if (!v) return null;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
}

type ClientEntry = {
  id: string | null;
  name: string;
  sessions: number;
  lastAt: number | null;
  mrrCents: number;
  joinedAt: string | null;
  // The platform's cut of this client's MRR, summed from each row's STORED
  // fee_bps (review 2026-09-09, R12). Never re-derived from the current rate
  // constant: a future change to the fee must not rewrite what a coach was
  // charged last month, which is the whole reason the pair is stamped.
  feeCents: number;
  // How this client arrived, taken from their EARLIEST row — the one that also
  // sets `joinedAt`. A client with several rows may have several origins (a
  // marketplace find who later re-subscribed through the coach's own link); the
  // acquisition is the first one, and the fee above already reflects the mix.
  origin: string | null;
  originAt: string | null;
};

// A pre-feature row carries neither column and genuinely paid the marketplace
// rate, so these are the honest defaults rather than a guess.
const DEFAULT_ORIGIN = 'marketplace';
const DEFAULT_FEE_BPS = 1500;

export async function coachClientsResponse(
  role: 'trainer' | 'nutritionist',
  request: Request
): Promise<NextResponse> {
  const user = await currentUser(request);

  if (!user) {
    return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  }
  const supabase = await clientForRequest(request);

  const roleKey = role === 'trainer' ? 'isTrainer' : 'isNutritionist';
  const table = role === 'trainer' ? 'trainers' : 'nutritionists';

  const { data: providerRow } = await supabase
    .from(table)
    .select('id')
    .eq('owner_id', user.id)
    .maybeSingle();

  const providerId: number | null = providerRow?.id ?? null;
  if (providerId == null) {
    return NextResponse.json({ [roleKey]: false, clients: [], totals: { active: 0, mrrCents: 0 } });
  }

  // ⚠ THE ERROR IS KEPT, because dropping it turns "we could not read what
  // this client pays" into the measured claim "$0/mo". A transient failure, an
  // RLS change or a schema drift would otherwise have every row on the roster
  // confidently reporting zero revenue — the same collapse of "no data" into
  // "a measured zero" this review round has already fixed twice elsewhere.
  //
  // ⚠ `'*'` IS DELIBERATE AND IS THE SAME MIGRATION-SAFETY THE ANALYTICS ROUTE USES.
  // An explicit `origin, fee_bps` select ERRORS THE WHOLE QUERY on a pre-migration DB,
  // which would take the roster's revenue and tenure down with it — and by the rule
  // above, a failed read renders "Not shared" on every row. Absent columns arrive as
  // undefined and default to marketplace / 1500 bps, which is correct for every
  // pre-feature row: they genuinely paid 15% through the marketplace.
  const { data: subRows, error: subErr } = await supabase
    .from('subscriptions')
    .select('*')
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .in('status', ['active', 'trialing']);
  if (subErr) {
    console.warn(
      `[shape-app] ${role} roster: subscriptions read failed — REVENUE and TENURE render "Not shared" rather than $0:`,
      subErr.message
    );
  }
  const subsUnknown = !!subErr;

  const { data: sessRows } = await supabase
    .from('sessions')
    .select('client_id, client_name, scheduled_at')
    .eq('provider_role', role)
    .eq('provider_id', providerId)
    .order('scheduled_at', { ascending: false })
    .limit(1000);

  const byClient = new Map<string, ClientEntry>();
  const ensure = (key: string): ClientEntry => {
    let e = byClient.get(key);
    if (!e) {
      e = { id: null, name: 'Client', sessions: 0, lastAt: null, mrrCents: 0, joinedAt: null,
            feeCents: 0, origin: null, originAt: null };
      byClient.set(key, e);
    }
    return e;
  };

  for (const s of sessRows ?? []) {
    const key = s.client_id || `name:${s.client_name || 'unknown'}`;
    const e = ensure(key);
    if (s.client_id) e.id = s.client_id;
    e.sessions += 1;
    if (s.client_name && e.name === 'Client') e.name = s.client_name;
    const t = new Date(s.scheduled_at).getTime();
    if (e.lastAt == null || t > e.lastAt) e.lastAt = t;
  }

  for (const sub of subRows ?? []) {
    const e = ensure(sub.client_id || 'unknown');
    if (sub.client_id) e.id = sub.client_id;
    const price = sub.price_cents ?? 0;
    e.mrrCents += price;
    const bps = typeof sub.fee_bps === 'number' && Number.isFinite(sub.fee_bps) ? sub.fee_bps : DEFAULT_FEE_BPS;
    e.feeCents += Math.round((price * bps) / 10000);
    if (sub.created_at && (!e.joinedAt || sub.created_at < e.joinedAt)) {
      e.joinedAt = sub.created_at;
    }
    // The origin follows the earliest DATED row, tracked separately from `joinedAt`
    // so a row with no created_at cannot claim the acquisition by arriving first.
    //
    // ⚠ AND AN UNDATED ROW NEVER CLAIMS IT AT ALL (CodeRabbit, #2030). An earlier cut
    // had an `else if (!e.origin && !e.originAt)` arm that handed the origin to whichever
    // undated row PostgREST returned first — non-deterministic, and the exact opposite of
    // what the comment above it promised. A client whose every subscription lacks a date
    // has no readable acquisition, so `origin` stays null and the export writes an empty
    // cell rather than a guess.
    //
    // ⚠ AND TIES ARE BROKEN ON THE ROW ID, because two rows created in the same
    // millisecond would otherwise resolve to whichever the database happened to return
    // first — a value that can change between two loads of the same page.
    if (sub.created_at) {
      const key = String(sub.created_at) + '\u0000' + String(sub.id ?? '');
      if (!e.originAt || key < e.originAt) {
        e.originAt = key;
        e.origin = typeof sub.origin === 'string' && sub.origin ? sub.origin : DEFAULT_ORIGIN;
      }
    }
  }

  const now = Date.now();
  const STALE_MS = 14 * DAY_MS;
  const clients = [...byClient.values()]
    .sort((a, b) => (b.lastAt ?? 0) - (a.lastAt ?? 0))
    .map((e) => {
      const isNew = e.joinedAt ? now - new Date(e.joinedAt).getTime() < STALE_MS : e.sessions <= 1;
      // Needs-eyes = not new and low-touch: no session in 14d, or fewer than
      // 3 sessions when we have no timestamp to go on. Everyone else is on track.
      const stale = e.lastAt == null ? e.sessions < 3 : (now - e.lastAt) > STALE_MS;
      const status: 'new' | 'eyes' | 'ontrack' = isNew ? 'new' : stale ? 'eyes' : 'ontrack';
      return {
        id: e.id,
        name: e.name,
        sessions: e.sessions,
        // null, not 0, when the subscriptions read failed: the roster renders
        // "Not shared" for null and a real "$0" for zero.
        mrrCents: subsUnknown ? null : e.mrrCents,
        // The earliest subscription start — already computed above for `isNew`
        // and then thrown away, so the roster could never show how long anyone
        // had been a client (review 2026-09-09, R10).
        //
        // ⚠ GUARDED, because `.toISOString()` THROWS on an invalid date while
        // the `isNew` read above only yields NaN. An unparseable created_at
        // would 500 the whole roster route, `_dashJson` would throw, and
        // `useDashboard` falls through to the DEMO cast — so one bad row would
        // show a signed-in coach a fabricated roster with nothing saying so.
        //
        // ⚠ AND THIS IS THE START OF THE CURRENT RUN, NOT LIFETIME TENURE: the
        // query above reads active/trialing rows only, so a client who left and
        // came back dates from their return. The Goal page's median tenure is
        // computed over EVERY span by `buildTrajectory`, which is the lifetime
        // reading; the two answer different questions on purpose.
        joinedAt: isoOrNull(e.joinedAt),
        // ⚠ NULL ON AN UNREADABLE SUBSCRIPTIONS READ, exactly like `mrrCents` above.
        // A fee of 0 is a real answer (a BYO client pays the coach 0%); "we could not
        // read it" is not, and an export that silently reports 0 is worse than one
        // that leaves the cell empty.
        feeCents: subsUnknown ? null : e.feeCents,
        origin: subsUnknown ? null : e.origin,
        lastAt: e.lastAt ? new Date(e.lastAt).toISOString() : null,
        isNew,
        status,
      };
    });

  const mrrCents = clients.reduce((sum, c) => sum + (c.mrrCents ?? 0), 0);

  return NextResponse.json({
    [roleKey]: true,
    clients,
    totals: { active: clients.length, mrrCents: subsUnknown ? null : mrrCents },
  });
}
