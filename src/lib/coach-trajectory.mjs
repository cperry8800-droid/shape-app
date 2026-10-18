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
// Open while the status is one of these (membership-core.ts's ACTIVE_SUB). The list is exported
// for a read that asks only for open rows (the coach dashboards' kpis), and it is ALSO the
// coach↔client relationship: every check in src/ of whether a coach coaches a client reads it
// (owner, 2026-10-18: "They stay normal clients until Stripe gives up", so a client whose renewal
// is retrying keeps their coach), as the database's checks do from
// supabase-migrations/2026-10-18-coach-access-past-due.sql. tests/coach-access-past-due.test.mjs
// sweeps src/ for a relationship read that stops at active and trialing.
export const OPEN_SUB_STATUSES = ['active', 'trialing', 'past_due'];
const OPEN_STATUSES = new Set(OPEN_SUB_STATUSES);
// Never a client: no join, no departure, no row in the series.
const NEVER_STARTED = new Set(['incomplete', 'incomplete_expired']);
// Every status that does NOT close a span. A read of the rows that ended takes every other status,
// which is the set this series closes a span on (the routes' churn read: `.not('status', 'in', …)`).
export const NOT_ENDED_STATUSES = [...OPEN_STATUSES, ...NEVER_STARTED];

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

// The span a row draws in the series, { start, end } with end null while open, or null for a row
// that is not in it (never started, or no start date). buildTrajectory, subDeparture and openSubsAt
// all read this, so the series, the churn list and today's figures open and close a span alike.
function spanOf(row, now) {
  if (!row || subNeverStarted(row)) return null;
  const start = ms(row.created_at);
  if (start == null) return null;
  const end = subEndedAt(row, now);
  // A close before its open is a data error; treat it as a zero-length span.
  return { start, end: end != null && end < start ? start : end };
}

// True while `span` is open at the instant `t`: opened at or before it, and not closed by it.
// buildTrajectory's headcount and departures and subDeparture all read it.
function spanOpenAt(span, t) {
  return span.start <= t && (span.end == null || span.end > t);
}

// Where the ISO week that opens on `monday` ends: a week later, or just after `now` for the
// current, partial week (it is measured at "now"). Its last instant is the one a week's
// departures are judged at, in the series' buckets and in subDeparture alike.
function weekEnd(monday, now) {
  return Math.min(monday + WEEK_MS, now + 1);
}

// ⚠ A PLAN THAT ENDED IS A DEPARTURE ONLY IF ITS CLIENT HELD NO OTHER PLAN AT THAT MOMENT (the sweep
// after #2394 round 10). The routes' churn list asked whether the client holds a plan NOW, so a client
// who left on Aug 20 and came back on Sep 25 read as "still a client" and dropped out of the list,
// while this series (leftIn) and the pace counted the Aug 20 departure. Each row is decided from every
// row of this coach (any status, the trajectory read).
// ⚠ AND THE MOMENT IS THE CLOSE OF THE WEEK IT ENDED IN, AS leftIn JUDGES IT (the sweep after #2394
// round 10, its review). Judged at the instant the row ended, a client whose card failed on a Monday
// and who re-subscribed on the Thursday was a departure in the list and none in the pace (leftIn asks
// who holds no plan at the end of the week), so one tab said "No one has left over the last 3 months"
// above "1 left over the last 3 months −$180 a month". So it is not a departure when another started
// row of the same client is open at the last instant of that ISO week (at now for the current week):
// spanOpenAt at weekEnd − 1, the series' own test.
//   → { endedAt, departed }: endedAt is the series' own close (subEndedAt, clamped to now, a close
//     before the open read as the open), null for a row that has not ended; departed is true when
//     this row ended the client's membership that week, false when another of their plans was open
//     at its close (or the row has not ended). A row with no client has no other plan to hold: a
//     departure. Rows of one client that end in one week are each a departure or each not, so the
//     page counts them as one (coachForecast.js `departures`), as leftIn counts the client once.
export function subDeparture(row, subs = [], now = Date.now()) {
  const own = spanOf(row, now);
  const end = own ? own.end : subEndedAt(row, now);
  if (end == null) return { endedAt: null, departed: false };
  if (row.client_id == null) return { endedAt: end, departed: true };
  const who = String(row.client_id);
  const close = weekEnd(mondayUTC(end), now) - 1;
  for (const s of subs || []) {
    if (!s || s === row || (row.id != null && s.id === row.id)) continue;
    if (s.client_id == null || String(s.client_id) !== who) continue;
    const other = spanOf(s, now);
    if (other && spanOpenAt(other, close)) return { endedAt: end, departed: false };
  }
  return { endedAt: end, departed: true };
}

function defaultCut(priceCents, feeBps) {
  const bps = feeBps == null ? 1500 : Number(feeBps);
  return Math.round((Number(priceCents) || 0) * (1 - bps / 10000));
}

// ⚠ TODAY'S CLIENTS ARE THE SERIES' LATEST POINT, AND EVERY FIGURE BESIDE THEM IS TAKEN OVER THE
// SAME ROWS (the sweep after #2394 round 10). The Plan's "you have 13 today" is the latest week's
// `active`, which counts a client whose payment is retrying (past_due); the brought-in share was
// taken over the active and trialing rows alone, so it read "0% fee · 3 of your 12" beside it, and
// Today's monthly net left the same client out of a figure the Business page counts. These are the
// rows open at `now` by the series' own rule: the ones its latest week counts.
export function openSubsAt(subs = [], now = Date.now()) {
  return (Array.isArray(subs) ? subs : []).filter((r) => {
    const s = spanOf(r, now);
    return !!s && s.start <= now && (s.end == null || s.end > now);
  });
}

// Today's practice from those rows: clients (people, as the series counts them: a row with no
// client_id stands alone), and the monthly gross and net, cut by each row's STORED fee. The same
// three numbers as buildTrajectory's latest week, from the same rows.
export function practiceToday(subs = [], { now = Date.now(), cutCents = defaultCut } = {}) {
  const open = openSubsAt(subs, now);
  return {
    clients: new Set(open.map((r, i) => (r.client_id != null ? 'c:' + String(r.client_id) : 'row:' + i))).size,
    mrrGrossCents: open.reduce((s, r) => s + (Number(r.price_cents) || 0), 0),
    mrrNetCents: open.reduce((s, r) => s + cutCents(Number(r.price_cents) || 0, r.fee_bps == null ? null : r.fee_bps), 0),
  };
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
    // An abandoned checkout is not a join and not a departure; nor is a row with no start date.
    const span = spanOf(r, now);
    if (!span) continue;
    spans.push({
      ...span,
      price: Number(r.price_cents) || 0,
      net: cutCents(Number(r.price_cents) || 0, r.fee_bps == null ? null : r.fee_bps),
      // ⚠ A SPAN IS A SUBSCRIPTION ROW; A CLIENT IS A PERSON. Nothing in the
      // schema stops one client holding several rows under one provider (a plan
      // change, a re-subscribe, a duplicated checkout), so counting rows and
      // labelling them "clients" inflates the headcount against the roster,
      // which groups by client_id. Every count below that says "client" is
      // taken over this key. A row with no client_id cannot be grouped, so it
      // becomes its own identity rather than merging with another row's.
      client: r && r.client_id != null ? 'c:' + String(r.client_id) : 'row:' + spans.length,
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

  const openAt = (t) => spans.filter((s) => spanOpenAt(s, t));
  const clientsOpenAt = (t) => new Set(openAt(t).map((s) => s.client));
  const activeAt = (t) => clientsOpenAt(t).size;
  // A client JOINED in [from, to) if a span of theirs opens inside it and they
  // were not already a client the instant before. A mid-membership plan change
  // opens a second row and must not read as a new person.
  const joinedIn = (from, to) => {
    const before = clientsOpenAt(from - 1);
    const out = new Set();
    for (const s of spans) if (s.start >= from && s.start < to && !before.has(s.client)) out.add(s.client);
    return out.size;
  };
  // A client LEFT in [from, to) if a span of theirs closes inside it and they
  // hold no open span at the end of it — so cancelling one row while another
  // stays open is not a departure. Over a week bucket that end is weekEnd − 1,
  // the instant subDeparture decides the churn list's rows at.
  const leftIn = (from, to) => {
    const after = clientsOpenAt(to - 1);
    const out = new Set();
    for (const s of spans) if (s.end != null && s.end >= from && s.end < to && !after.has(s.client)) out.add(s.client);
    return out.size;
  };

  const thisMonday = mondayUTC(now);
  const firstMonday = thisMonday - (weeks - 1) * WEEK_MS;
  const out = [];
  for (let k = 0; k < weeks; k++) {
    const start = firstMonday + k * WEEK_MS;
    const end = weekEnd(start, now); // the current week is partial: measure at "now"
    const open = openAt(end - 1);
    let gross = 0, net = 0;
    for (const s of open) { gross += s.price; net += s.net; }
    let oneTime = 0, oneTimeNet = 0;
    for (const p of paid) if (p.at >= start && p.at < end) { oneTime += p.price; oneTimeNet += p.net; }
    out.push({
      weekOf: new Date(start).toISOString().slice(0, 10),
      active: new Set(open.map((s) => s.client)).size,
      added: joinedIn(start, end),
      ended: leftIn(start, end),
      mrrGrossCents: gross,
      mrrNetCents: net,
      oneTimeCents: oneTime,
      oneTimeNetCents: oneTimeNet,
    });
  }

  const d30 = now - 30 * DAY_MS;
  const monthStart = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth(), 1);
  const active30dAgo = activeAt(d30);
  const ended30d = leftIn(d30, now + 1);
  const tenures = spans.map((s) => ((s.end == null ? now : s.end) - s.start) / DAY_MS).filter((n) => n >= 0);
  const firstStart = spans.length ? Math.min(...spans.map((s) => s.start)) : null;

  return {
    weeks: out,
    firstSubAt: firstStart == null ? null : new Date(firstStart).toISOString(),
    summary: {
      activeNow: activeAt(now),
      active30dAgo,
      addsThisMonth: joinedIn(monthStart, now + 1),
      endedThisMonth: leftIn(monthStart, now + 1),
      churnRate30dPct: active30dAgo > 0 ? Math.round((ended30d / active30dAgo) * 100) : null,
      medianTenureDays: tenures.length ? Math.round(median(tenures)) : null,
      oneTime30dCents: paid.filter((p) => p.at >= d30 && p.at <= now).reduce((s, p) => s + p.price, 0),
      // People, not rows — so it is comparable with the roster's client count.
      totalEverSubscribed: new Set(spans.map((s) => s.client)).size,
      // ⚠ AND THE SPAN COUNT KEPT SEPARATELY, because `medianTenureDays` is
      // measured over SPANS on purpose ("how long does a membership last") and a
      // card that quotes it beside a people count would be describing a
      // different denominator than the one it prints.
      totalSpans: spans.length,
    },
  };
}
