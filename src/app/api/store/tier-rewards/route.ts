// Tier rewards — the free unlocks a member earns by climbing the Shape Score
// ladder, claimed from the Shape Store at 0 points.
//
// GET                                        -> { rewards: [...] }
// POST { rewardKey, choice?, shipping? }     -> { code, kind, name }
//
// Every rule that decides WHAT a tier unlocks, whether it's still unclaimed,
// and which choices are legal lives in the `claim_tier_reward` RPC — this route
// carries no reward catalogue of its own, so it cannot drift from the grant.
// Fulfillment mirrors /api/store/redeem: merch ships (ops emailed), coaching
// and membership vouchers are recorded and emailed for the team to honour.
import { NextResponse } from 'next/server';
import { clientForRequest, currentUser } from '@/lib/request-auth';
import { computeMembership, adminEmails } from '@/lib/membership-core';
import { sendEmail } from '@/lib/email';
import { readJson, dbError } from '@/lib/request-utils';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ShipTo = {
  name: string;
  line1: string;
  line2?: string;
  city: string;
  region: string;
  postal: string;
  country: string;
};

function parseShipping(input: unknown): ShipTo | null {
  if (!input || typeof input !== 'object') return null;
  const s = input as Record<string, unknown>;
  const str = (k: string) => String(s[k] ?? '').trim();
  const ship: ShipTo = {
    name: str('name'),
    line1: str('line1'),
    line2: str('line2'),
    city: str('city'),
    region: str('region'),
    postal: str('postal'),
    country: str('country') || 'US',
  };
  if (!ship.name || !ship.line1 || !ship.city || !ship.postal) return null;
  return ship;
}

function escapeHtml(s: string): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function GET(request: Request) {
  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const supabase = await clientForRequest(request);

  const { data, error } = await supabase.rpc('get_my_tier_rewards');
  // Pre-migration the RPC doesn't exist — an empty shelf is the honest state
  // (no unlocks to show), never an error page over the store.
  if (error) return NextResponse.json({ rewards: [] });
  return NextResponse.json({ rewards: Array.isArray(data) ? data : [] });
}

// What the member (and ops) are told a claim actually means. Keyed by the RPC's
// fulfilment kind + reward key, so the copy follows the reward, not the item.
function claimNext(rewardKey: string, kind: string, ship: ShipTo | null): string {
  if (kind === 'merch') {
    const addr = ship
      ? [ship.name, ship.line1, ship.line2, `${ship.city}, ${ship.region} ${ship.postal}`, ship.country].filter(Boolean).join('\n')
      : 'your address on file';
    return `We'll ship it to:\n${addr}.\nYou'll get a note when it leaves.`;
  }
  if (rewardKey === 'peak_coach_month') {
    return 'Pick any Shape trainer or nutritionist and start — your first month is on us. Show this code when you book and the coach is paid their full rate by Shape.';
  }
  if (rewardKey === 'form_coach_plan') {
    return 'Pick any Shape coach and ask for a workout or meal plan — show this code and it costs you nothing.';
  }
  if (rewardKey === 'legend_year') {
    return 'Your next year of Shape is on us. We apply it to your membership — nothing to do.';
  }
  return 'Your reward is recorded. Show this code to your coach or the Shape team to use it.';
}

async function claimEmails(
  opts: { rewardKey: string; kind: string; name: string; code: string; email: string | null; ship: ShipTo | null },
) {
  const { rewardKey, kind, name, code, email, ship } = opts;
  const SITE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://theshapecommunity.com';
  const next = claimNext(rewardKey, kind, ship);

  if (email) {
    const text = `You unlocked: ${name}\nConfirmation code: ${code}\n\n${next}\n\n— Shape`;
    await sendEmail({
      to: email,
      subject: `You unlocked ${name} — Shape`,
      text,
      html: `<div style="font-family:system-ui,sans-serif;max-width:480px"><h2 style="margin:0 0 8px">You unlocked ${escapeHtml(name)}</h2><p style="font-size:13px;color:#555">Confirmation code</p><p style="font-family:monospace;font-size:18px;font-weight:700;letter-spacing:1px;margin:0 0 16px">${escapeHtml(code)}</p><p style="white-space:pre-line;font-size:14px;line-height:1.5">${escapeHtml(next)}</p><p style="font-size:12px;color:#888;margin-top:24px">Earned by showing up. See the rest of your <a href="${SITE}">Shape Store</a>.</p></div>`,
    }).catch(() => {});
  }

  // Ops has to DO something for every kind here: ship the merch, arrange and
  // pay the coach, or apply the free year — so ops is notified either way.
  const ops = process.env.STORE_OPS_EMAIL || adminEmails()[0];
  if (ops) {
    const addr = ship
      ? [ship.name, ship.line1, ship.line2, `${ship.city}, ${ship.region} ${ship.postal}`, ship.country].filter(Boolean).join('\n')
      : '(no address — not a shipped reward)';
    const verb = kind === 'merch' ? 'Ship' : 'Honour';
    await sendEmail({
      to: ops,
      subject: `[Shape tier reward] ${verb}: ${name} — ${code}`,
      text: `A member claimed a tier reward.\n\nReward: ${name} (${rewardKey})\nCode: ${code}\nMember: ${email || 'unknown'}\n\n${addr}`,
      html: `<div style="font-family:system-ui,sans-serif"><h3>${escapeHtml(verb)}: ${escapeHtml(name)}</h3><p>Code <b>${escapeHtml(code)}</b> · ${escapeHtml(rewardKey)} · member ${escapeHtml(email || 'unknown')}</p><pre style="font-size:13px">${escapeHtml(addr)}</pre></div>`,
    }).catch(() => {});
  }
}

export async function POST(request: Request) {
  const bodyResult = await readJson<Record<string, unknown>>(request, { allowEmpty: true });
  if (!bodyResult.ok) return bodyResult.response;
  const body = bodyResult.data;
  const rewardKey = String((body as { rewardKey?: unknown }).rewardKey ?? '').trim();
  if (!rewardKey) return NextResponse.json({ error: 'Missing rewardKey.' }, { status: 400 });
  const rawChoice = (body as { choice?: unknown }).choice;
  const choice = rawChoice == null || rawChoice === '' ? null : String(rawChoice).trim();

  const user = await currentUser(request);
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const supabase = await clientForRequest(request);
  const membership = await computeMembership(supabase, user.id, user.email ?? null);
  if (!membership.isMember) {
    return NextResponse.json({ error: 'membership_required' }, { status: 402 });
  }

  // Shipping is parsed here but the RPC is the authority on whether this reward
  // needs it — so a voucher can't be claimed with an address attached, and a
  // merch claim can't slip through without one.
  const ship = parseShipping((body as { shipping?: unknown }).shipping);

  const { data, error } = await supabase.rpc('claim_tier_reward', {
    p_reward_key: rewardKey,
    p_choice: choice,
    p_ship_to: ship,
  });

  if (error) {
    const msg = String(error.message || '');
    if (msg.includes('needs_shipping')) return NextResponse.json({ error: 'needs_shipping' }, { status: 422 });
    if (msg.includes('already_claimed')) return NextResponse.json({ error: 'already_claimed' }, { status: 409 });
    if (msg.includes('not_unlocked')) return NextResponse.json({ error: 'not_unlocked' }, { status: 403 });
    if (msg.includes('bad_choice')) return NextResponse.json({ error: 'bad_choice' }, { status: 400 });
    if (msg.includes('unexpected_shipping')) return NextResponse.json({ error: 'bad_choice' }, { status: 400 });
    if (msg.includes('unknown_reward')) return NextResponse.json({ error: 'unknown_reward' }, { status: 404 });
    return dbError(error, 'tier reward claim', 500, 'Claim failed.');
  }

  const result = (data || {}) as { code?: string; kind?: string; name?: string; itemId?: string };
  const code = result.code || '';
  const kind = result.kind || '';
  const name = result.name || 'Shape reward';

  await claimEmails({ rewardKey, kind, name, code, email: user.email ?? null, ship: kind === 'merch' ? ship : null });

  return NextResponse.json({ ok: true, code, kind, name, rewardKey, itemId: result.itemId ?? null });
}
