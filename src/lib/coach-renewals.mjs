// Renewals due in the next few days, for the Business page's Money tab ("Renewing this
// week", design E, owner 2026-10-17). Pure: rows in, rows out, so the routes stay thin
// and `tests/coach-renewals.test.mjs` can drive it.
//
// ⚠ A ROW THAT IS DUE IS NOT A ROW THAT WILL RENEW. A member who cancels keeps an
// `active` subscription row until the period ends (src/app/subscribe/actions.ts sets
// Stripe's cancel_at_period_end, and the webhook writes only status and period end), so
// the row alone cannot say whether the charge will happen. The route asks Stripe about
// each one (`loadCancelFlags`) and passes the answer in as `ending`: true is "cancelled,
// ends on that date", false is "renews", null is "could not ask". Only `false` rows are
// counted as money coming in.

const DAY_MS = 86400000;
export const RENEWAL_DAYS = 7;
// The most rows checked with Stripe on one page load; past it a row reads as unchecked.
export const RENEWAL_CHECK_CAP = 25;

function ms(v) {
  if (v == null || v === '') return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

// Active rows whose period ends in [now, now + days), soonest first.
export function pickRenewals(subs, now = Date.now(), days = RENEWAL_DAYS) {
  const out = [];
  for (const r of subs || []) {
    const at = ms(r && r.current_period_end);
    if (at == null || at < now || at >= now + days * DAY_MS) continue;
    out.push(r);
  }
  return out.sort((a, b) => ms(a.current_period_end) - ms(b.current_period_end));
}

// The payload rows. `cutCents(priceCents, feeBps)` is the platform-fee helper the routes
// already use for net MRR; `names` maps client_id → display name; `flags` maps
// stripe_subscription_id → true | false | null.
export function renewalRows(picked, { names, flags, cutCents }) {
  return picked.map((r) => {
    const price = Number(r.price_cents) || 0;
    const id = r.stripe_subscription_id == null ? null : String(r.stripe_subscription_id);
    const flag = id != null && flags && flags.has(id) ? flags.get(id) : null;
    return {
      // — is an unknown name (the profiles read failed), as on the origin feed: a row of
      // "Client"s would hide who is renewing and who cancelled.
      name: (names && names.get(String(r.client_id))) || '—',
      // Who the plan belongs to: the page counts people, not plans (one client can hold two).
      clientId: r.client_id == null ? null : String(r.client_id),
      dueAt: new Date(ms(r.current_period_end)).toISOString(),
      priceCents: price,
      netCents: cutCents(price, r.fee_bps == null ? null : r.fee_bps),
      ending: flag === true ? true : flag === false ? false : null,
    };
  });
}
