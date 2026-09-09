// The coach's practice trajectory — the series behind "are my clients
// increasing or decreasing?" (review 2026-09-09, R8). Pure: rows in, buckets out,
// no I/O, so the routes stay thin and `tests/coach-trajectory.test.mjs` can drive
// it with synthetic rows.
//
// Derived ONLY from data the routes already read:
//   subscriptions  — created_at · status · (canceled_at | current_period_end)
//                    · price_cents · fee_bps
//   one_time_purchases — created_at · status · price_cents · application_fee_cents
//
// A subscription is a span. It opens at created_at and stays open while the
// status is one the house counts as a subscription — active · trialing ·
// past_due, the same set membership-core.ts uses. A payment that is retrying
// has not left: a growth line that dropped them for a week and picked them back
// up would be noise, not news. Any other status closes the span.
//
// ⚠ A ROW THAT NEVER BECAME A CLIENT IS NOT A JOIN AND NOT A DEPARTURE.
// `incomplete` (checkout started, first invoice never paid) and
// `incomplete_expired` are dropped entirely rather than counted as a span that
// opened and closed — an abandoned checkout in the "joined vs left" columns is
// a fabricated event.
//
// ⚠ AND THE CLOSE DATE IS CLAMPED TO NOW, WHICH IS THE WHOLE REASON THIS IS NOT
// A ONE-LINER. `subscriptions` carries NO canceled_at — the Stripe webhook
// writes only { status, current_period_end } — so a member cancelled mid-period
// keeps a current_period_end in the FUTURE. Reading that verbatim counts them
// as active today and buckets their departure into a week beyond the series,
// where it is never drawn. The status says they are gone, so the span closes at
// the earlier of its period end and now. (The optional canceled_at / ended_at
// reads below cost nothing and would be exact if a migration ever adds them.)
//
// ⚠ THE HISTORY IS RECONSTRUCTED FROM THE CURRENT STATUS, so a member who
// paused and resumed reads as continuously active: the row remembers only where
// it stands today. That is a known floor on the series' resolution, not a bug
// to paper over with a guess.
//
// `active` at a moment is the count of spans covering it; `added` / `ended` are
// the spans that opened / closed inside the bucket; MRR is the sum over the
// spans open at the bucket's end, cut by each row's STORED fee (never a
// hardcoded 85%).
//
// Weekly ISO buckets (Monday, UTC), oldest first, the last one the current
// partial week. The UI rolls them up to months for the longer ranges.

export const TRAJECTORY_WEEKS = 104;
const DAY_MS = 86400000;
const WEEK_MS = 7 * DAY_MS;
// Open while the status is one of these (membership-core.ts's ACTIVE_SUB).
const OPEN_STATUSES = new Set(['active', 'trialing', 'past_due']);
// Never a client: no join, no departure, no row in the series.
const NEVER_STARTED = new Set(['incomplete', 'incomplete_expired']);

// The Monday (00:00 UTC) of the ISO week containing `ms`.
export function mondayUTC(ms) {
  const d = new Date(ms);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
}

function ms(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

// True for a row that never became a client (an abandoned checkout).
export function subNeverStarted(row) {
  return !!row && NEVER_STARTED.has(String(row.status || '').toLowerCase());
}

// When a subscription row's span closed, or null while it is open. `now` clamps
// the close date: a status that says "gone" cannot resolve to a future date.
export function subEndedAt(row, now = Date.now()) {
  if (!row || subNeverStarted(row)) return null;
  if (OPEN_STATUSES.has(String(row.status || '').toLowerCase())) return null;
  const at = ms(row.canceled_at) ?? ms(row.ended_at) ?? ms(row.current_period_end) ?? ms(row.updated_at) ?? ms(row.created_at);
  if (at == null) return null;
  return Math.min(at, now);
}

function defaultCut(priceCents, feeBps) {
  const bps = feeBps == null ? 1500 : Number(feeBps);
  return Math.round((Number(priceCents) || 0) * (1 - bps / 10000));
}

function median(nums) {
  if (!nums.length) return null;
  const s = nums.slice().sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// subs: subscription rows (any status). purchases: one_time_purchases rows.
// cutCents(priceCents, feeBps) → the coach's net for one row (the route passes
// the platform-fee helper; the default mirrors its rounding).
export function buildTrajectory({ subs = [], purchases = [], now = Date.now(), weeks = TRAJECTORY_WEEKS, cutCents = defaultCut } = {}) {
  const spans = [];
  for (const r of subs) {
    if (subNeverStarted(r)) continue;   // an abandoned checkout is not a join and not a departure
    const start = ms(r && r.created_at);
    if (start == null) continue;
    const end = subEndedAt(r, now);
    spans.push({
      start,
      end: end != null && end < start ? start : end, // a close before its open is a data error; treat as a zero-length span
      price: Number(r.price_cents) || 0,
      net: cutCents(Number(r.price_cents) || 0, r.fee_bps == null ? null : r.fee_bps),
    });
  }
  const paid = [];
  for (const p of purchases) {
    if (!p || String(p.status || '').toLowerCase() !== 'paid') continue;
    const at = ms(p.created_at);
    if (at == null) continue;
    const price = Number(p.price_cents) || 0;
    const fee = p.application_fee_cents == null ? 0 : Number(p.application_fee_cents) || 0;
    paid.push({ at, price, net: Math.max(0, price - fee) });
  }

  const openAt = (t) => spans.filter((s) => s.start <= t && (s.end == null || s.end > t));
  const activeAt = (t) => openAt(t).length;

  const thisMonday = mondayUTC(now);
  const firstMonday = thisMonday - (weeks - 1) * WEEK_MS;
  const out = [];
  for (let k = 0; k < weeks; k++) {
    const start = firstMonday + k * WEEK_MS;
    const end = Math.min(start + WEEK_MS, now + 1); // the current week is partial: measure at "now"
    const open = openAt(end - 1);
    let gross = 0, net = 0;
    for (const s of open) { gross += s.price; net += s.net; }
    let oneTime = 0, oneTimeNet = 0;
    for (const p of paid) if (p.at >= start && p.at < end) { oneTime += p.price; oneTimeNet += p.net; }
    out.push({
      weekOf: new Date(start).toISOString().slice(0, 10),
      active: open.length,
      added: spans.filter((s) => s.start >= start && s.start < end).length,
      ended: spans.filter((s) => s.end != null && s.end >= start && s.end < end).length,
      mrrGrossCents: gross,
      mrrNetCents: net,
      oneTimeCents: oneTime,
      oneTimeNetCents: oneTimeNet,
    });
  }

  const d30 = now - 30 * DAY_MS;
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const active30dAgo = activeAt(d30);
  const ended30d = spans.filter((s) => s.end != null && s.end >= d30 && s.end <= now).length;
  const tenures = spans.map((s) => ((s.end == null ? now : s.end) - s.start) / DAY_MS).filter((n) => n >= 0);
  const firstStart = spans.length ? Math.min(...spans.map((s) => s.start)) : null;

  return {
    weeks: out,
    firstSubAt: firstStart == null ? null : new Date(firstStart).toISOString(),
    summary: {
      activeNow: activeAt(now),
      active30dAgo,
      addsThisMonth: spans.filter((s) => s.start >= monthStart && s.start <= now).length,
      endedThisMonth: spans.filter((s) => s.end != null && s.end >= monthStart && s.end <= now).length,
      churnRate30dPct: active30dAgo > 0 ? Math.round((ended30d / active30dAgo) * 100) : null,
      medianTenureDays: tenures.length ? Math.round(median(tenures)) : null,
      oneTime30dCents: paid.filter((p) => p.at >= d30 && p.at <= now).reduce((s, p) => s + p.price, 0),
      totalEverSubscribed: spans.length,
    },
  };
}
