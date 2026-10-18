// Business — one role-parameterized page in five sections (design E, owner 2026-10-17):
// Overview (the practice trajectory), Money (what's coming to you from Stripe, this week's
// renewals, net a month over 13 weeks), Plan (what clients earn you, and the next 12 months),
// Growth (the marketplace funnel, who found whom, bringing your own clients, the waiting list)
// and Retention (what a client is worth, roster outcomes, who left and why).
//
// HONEST DATA RULE — hardest on this page: every dollar is either a real Stripe figure, MRR
// derived from real subscription rows, or a projection labelled as one and started from the
// coach's own numbers. When payouts aren't connected, the Money tab says so with a real Set-up
// CTA (Stripe Connect onboarding) — never plausible-looking fake money. Demo numbers exist ONLY
// under the demo band.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals.js → coachForecast.js →
// dashData.jsx → dashToday.jsx (DashFunnelPanel/band) → this.

const DBZ_INK50 = "var(--sh-ink2, #a09b94)";
const DBZ_MONO = "'JetBrains Mono', monospace";
const DBZ_TEAL = "var(--sh-accent, #2ee0c4)";
const DBZ_GREEN = "var(--sh-green, #7bbf5a)";
const DBZ_AMBER = "var(--sh-gold, #d8a23a)";
const DBZ_RED = "var(--sh-rust, #e0644b)";
const DBZ_INK = "var(--sh-ink, #f2ede4)";        // the dashboard's fixed-dark cream ink
const DBZ_TEAL_INK = "var(--sh-deep, #06231f)";   // ink ON a teal-filled control
// The Plan and Money tabs' type: a small-caps label, a plain note, and the rule between rows.
const DBZ_LBL = { fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.12em", textTransform: "uppercase", color: DBZ_INK50 };
const DBZ_NOTE = { fontSize: 12, color: DBZ_INK50, lineHeight: 1.5 };
const DBZ_RULE = "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)";

function dbzDate(v) {
  if (!v) return "—";
  try { return new Date(typeof v === "number" ? v : String(v)).toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return "—"; }
}
function dbzMonthsBetween(a, b) {
  try {
    const ms = new Date(b).getTime() - new Date(a).getTime();
    return ms > 0 ? Math.max(1, Math.round(ms / (30.4 * 86400000))) : null;
  } catch (e) { return null; }
}

// ── Demo datasets — shown ONLY under the demo band ───────────────────────────
//
// ⚠ THE PAYOUTS BLOCK WAS FOUR UNANCHORED LITERALS, AND IT DISAGREED WITH THE PRACTICE
// ON ITS OWN PAGE BY AN ORDER OF MAGNITUDE (review 2026-09-09, V5's tail). It claimed a
// $1,840 balance and four weekly payouts of $4,125 / $3,860 / $4,015 / $3,740 — $15,740
// over 24 days, i.e. roughly $19,700 a month — beside a strip reading **$1,820 monthly
// recurring** from the same ten demo clients. Measured against the derived figures: the
// balance was 9× and the history 12×. That is the same tenfold disagreement the sidebar
// payout card was fixed for, still live one page over.
//
// ⚠ AND IT DESCRIBED A DIFFERENT SCHEDULE THAN THE REST OF THE PREVIEW. This said
// "weekly · Fridays"; `demoPayouts` states the payout lands on the last day of the month
// and every coach tab's sidebar card says "PAYOUT SEP 30". One preview cannot have two
// cadences. It is monthly here now, with **no day anchor** — the rows carry their own
// month-end dates and an anchor would be a claim about a processor nobody has connected.
//
// ⚠ LAZY AND DAY-KEYED, the pattern `dbzDemoTrajectory` below already establishes: the
// derivation reads `new Date()`, so a module-scope build leaves a tab open overnight
// quoting yesterday's balance, and an IIFE would read the roster at LOAD while the
// outcomes plate reads it at RENDER — two read times for one number is the disagreement
// this whole change is about.
let _dbzDemoPayouts = null;
function dbzDemoPayouts() {
  const now = new Date();
  const key = now.toDateString();
  if (_dbzDemoPayouts && _dbzDemoPayouts.key === key) return _dbzDemoPayouts.v;
  let v;
  try {
    const clients = DashSignals.buildMockClients(now);
    const p = DashSignals.demoPayouts(clients, now);
    v = {
      balanceCents: p.balanceCents,
      schedule: { interval: "monthly", delayDays: 7 },   // the holding period demoPayouts models
      payouts: DashSignals.demoPayoutHistory(clients, now, 4),
    };
  } catch (e) {
    // dashSignals not up on this page — say nothing rather than inventing a figure.
    v = { balanceCents: null, schedule: null, payouts: [] };
  }
  _dbzDemoPayouts = { key, v };
  return v;
}
const DBZ_DEMO_CHURN = [
  { name: "Devon Sharpe", startedAt: new Date(Date.now() - 210 * 86400000).toISOString(), endedAt: new Date(Date.now() - 9 * 86400000).toISOString(), priceCents: 18000, reason: "Budget — coming back in the fall" },
  { name: "Mara Ellison", startedAt: new Date(Date.now() - 460 * 86400000).toISOString(), endedAt: new Date(Date.now() - 31 * 86400000).toISOString(), priceCents: 22000, reason: "Hit her goal — graduated to self-managed" },
  { name: "Theo Brandt", startedAt: new Date(Date.now() - 88 * 86400000).toISOString(), endedAt: new Date(Date.now() - 64 * 86400000).toISOString(), priceCents: 16000, reason: "Moved cities — wanted in-person" },
];
// Roster outcomes — the aggregates migrated verbatim from the old Analytics pages' mocks.
// ⚠ THE OUTCOMES PLATE NAMES THE PREVIEW'S ROSTER (the sweep after #2394 round 10). Its six rows
// were people of their own (Alex Rivera, Casey Morgan, Sam Patel, Riley Kim, Drew Park, Quinn
// Choi), so once Growth's origin list and Money's renewals became Today's ten, Retention listed
// five strangers as the most consistent clients of a roster Growth had just named, beside "Active
// clients 10". Each row is now a roster client, found by the id their row carries
// (buildMockClients' "demo-N") and named at render, lazily as the origin list is, because the
// roster reads `new Date()` and dashSignals may not be up at load. With no roster there are no
// rows of it. A row fits its persona: the new client (Tess B., five days in), the one three weeks
// without a check-in and the one at 64% adherence are on no 30-day list, the stalled weight
// (Marcus T.) is not a weight loss, and the one eating over target (Deandre K.) gained. A
// person's weight change is one fact, so both roles' previews read the same one.
const DBZ_DEMO_OUTCOME_ROWS = [
  { id: "demo-1", weightChangeLb: -3.4, workouts30d: 18, workouts7d: 4, prs30d: 3, daysLogged30d: 28, avgProteinG: 142 },
  { id: "demo-5", weightChangeLb: -6.2, workouts30d: 16, workouts7d: 4, prs30d: 2, daysLogged30d: 26, avgProteinG: 96 },
  { id: "demo-3", weightChangeLb: -2.6, workouts30d: 15, workouts7d: 3, prs30d: 1, daysLogged30d: 25, avgProteinG: 142 },
  { id: "demo-6", weightChangeLb: -1.8, workouts30d: 14, workouts7d: 4, prs30d: 2, daysLogged30d: 22, avgProteinG: 142 },
  { id: "demo-7", weightChangeLb: 1.4, workouts30d: 12, workouts7d: 2, prs30d: 0, daysLogged30d: 17, avgProteinG: 138 },
  { id: "demo-10", weightChangeLb: -0.4, workouts30d: 11, workouts7d: 3, prs30d: 1, daysLogged30d: 24, avgProteinG: 142 },
];
function dbzDemoOutcomeRoster(role) {
  const names = {};
  try {
    for (const c of DashSignals.buildMockClients(new Date())) names[c.profile.id] = c.profile.name;
  } catch (e) { return []; }   // dashSignals not up yet — no roster, so no rows of it
  return DBZ_DEMO_OUTCOME_ROWS.filter((r) => names[r.id]).map((r) => (role === "trainer"
    ? { name: names[r.id], workouts30d: r.workouts30d, workouts7d: r.workouts7d, weightChangeLb: r.weightChangeLb, prs30d: r.prs30d }
    : { name: names[r.id], daysLogged30d: r.daysLogged30d, avgProteinG: r.avgProteinG, weightChangeLb: r.weightChangeLb }));
}
const DBZ_DEMO_OUTCOMES = {
  trainer: {
    get activeClients() { return dbzDemoRosterSize(); },   // was a literal 34 — see V5 above
    workouts30d: 412, workouts7d: 96, prs30d: 41, avgAdherencePct: 88,
    get roster() { return dbzDemoOutcomeRoster("trainer"); },
  },
  nutritionist: {
    get activeClients() { return dbzDemoRosterSize(); },   // was a literal 28
    proteinAdherencePct: 78, avgLogsPerClient: 22, totalDaysLogged: 612,
    get roster() { return dbzDemoOutcomeRoster("nutritionist"); },
  },
};

// Both analytics routes send null for a figure they could not read (or have nothing to measure);
// it reads "—", never 0, which is a measurement.
const dbzFig = (v, suffix = "") => (v == null ? "—" : String(v) + suffix);
// A client's name is null when none is on file or when it couldn't be read (`nameUnread`), and the
// page says which: the routes sent "Client" and "Former client" for both, so an unread name looked
// like no name at all. `none` is the word for a client with no name on file.
const dbzName = (r, none) => r.name || (r.nameUnread ? "Name couldn't be read" : none);

const DBZ_ROLES = {
  trainer: {
    accent: "var(--sh-rust2, #c0533b)",
    nav: (k) => trainerNavItems(k),
    api: "/api/trainer/analytics",
    okKey: "isTrainer",
    outcomeCards: (cp) => [
      { k: dbzFig(cp.activeClients), l: "Active clients", sub: "with an active plan" },
      { k: dbzFig(cp.workouts30d), l: "Workouts logged", sub: cp.workouts7d == null ? "couldn't be read" : cp.workouts7d + " this week" },
      { k: dbzFig(cp.avgAdherencePct, "%"), l: "Avg adherence", sub: "vs 4 sessions/wk target" },
      { k: dbzFig(cp.prs30d), l: "PRs hit", sub: "lifts beaten, last 30d" },
    ],
    consistentLabel: "Most consistent · 30d",
    consistentValue: (r) => ({ n: dbzFig(r.workouts30d), unit: "workouts" }),
    consistentSort: (a, b) => (b.workouts30d || 0) - (a.workouts30d || 0),
  },
  nutritionist: {
    accent: "var(--sh-gold, #d8a23a)",
    nav: (k) => nutriNavItems(k),
    api: "/api/nutritionist/analytics",
    okKey: "isNutritionist",
    outcomeCards: (cp) => [
      { k: dbzFig(cp.activeClients), l: "Active clients", sub: "with an active plan" },
      { k: dbzFig(cp.avgLogsPerClient), l: "Avg log days", sub: "per client, last 30d" },
      { k: dbzFig(cp.proteinAdherencePct, "%"), l: "Protein adherence", sub: "days ≥ 120g across roster" },
      { k: dbzFig(cp.totalDaysLogged), l: "Total log days", sub: "across roster, 30d" },
    ],
    consistentLabel: "Most consistent loggers · 30d",
    consistentValue: (r) => ({ n: dbzFig(r.daysLogged30d), unit: "days" }),
    consistentSort: (a, b) => (b.daysLogged30d || 0) - (a.daysLogged30d || 0),
  },
};

// ── Payout zone — real Stripe data, or "—" + connect CTA, never fake ────────
function dbzScheduleLine(s) {
  if (!s) return null;
  const cap = (x) => (x ? x.charAt(0).toUpperCase() + x.slice(1) : "");
  if (s.interval === "manual") return "Manual payouts — you trigger them from Stripe";
  let line = "Paid out " + (s.interval || "daily");
  if (s.interval === "weekly" && s.weeklyAnchor) line += " · " + cap(s.weeklyAnchor) + "s";
  if (s.interval === "monthly" && s.monthlyAnchor) line += " · day " + s.monthlyAnchor;
  if (s.delayDays != null) line += " · " + s.delayDays + "-day rolling delay";
  return line;
}

// ── Your money (design E, owner 2026-10-17: the payout boxes "dont love the looks of these") ──
// One sentence and a short list, from Stripe: what is on its way to the bank, what is ready to
// pay out, what is still clearing, and the net a month the subscriptions bring in. A coach with a
// Standard account manages payouts in their own Stripe dashboard, which the link opens.
const DBZ_STRIPE_DASHBOARD = "https://dashboard.stripe.com/";
function DbzPayoutsZone({ live, stripe, providerId, role, metrics }) {
  const [linking, setLinking] = React.useState(false);
  const data = live ? stripe : dbzDemoPayouts();
  const startOnboarding = async () => {
    if (!providerId || linking) return;
    setLinking(true);
    try {
      const res = await fetch("/api/stripe/connect/onboard", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider_role: role, provider_id: providerId }),
      });
      const d = await res.json().catch(() => null);
      if (d && d.url) { window.location.href = d.url; return; }
    } catch (e) {}
    setLinking(false);
  };

  if (live && !data) return <div style={DBZ_NOTE}>{data === null ? "Couldn't read your payouts just now. Nothing is lost; reload to try again." : "Your payouts load with the analytics rollup…"}</div>;
  if (live && !data.connected) {
    return (
      <div>
        <div style={{ fontSize: 13.5, color: DBZ_INK50, lineHeight: 1.55, marginBottom: 12 }}>
          Payouts aren't set up yet. Link a Stripe account and this fills in: what's ready to pay out, what's on its way to your bank, and when.
        </div>
        {providerId != null && (
          <button onClick={startOnboarding} disabled={linking} style={{ fontFamily: DBZ_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_TEAL_INK, background: DBZ_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: "pointer", opacity: linking ? 0.6 : 1, clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>
            {linking ? "Opening Stripe…" : "Set up payouts →"}
          </button>
        )}
      </div>
    );
  }
  // Linked, but Stripe could not be read just now: say that, rather than an empty account.
  if (live && data.error) {
    return <div style={DBZ_NOTE}>Couldn't reach Stripe just now. Your balance and payouts are safe there; reload to try again, or open your Stripe dashboard.</div>;
  }

  // The sums are coachForecast.js `moneyFrom`, which the app's Business page reads too.
  const m = window.CoachForecast.moneyFrom(data);
  const next = m.next;
  const rows = [
    m.onWay ? { k: "On its way to your bank", s: next && next.arrivalDate ? "arrives " + dbzDate(next.arrivalDate) : "paid out, not landed yet", v: m.onWayCents } : null,
    m.balanceCents != null ? { k: "Ready to pay out", s: "in your Stripe balance now", v: m.balanceCents } : null,
    m.pendingCents ? { k: "Still clearing", s: "new charges Stripe hasn't released yet", v: m.pendingCents } : null,
  ].filter(Boolean);
  const coming = m.comingCents;
  if (metrics && metrics.mrrNetCents != null) {
    rows.push({ k: "Net a month, at today's clients", s: dashMoney(metrics.mrrGrossCents) + " billed · " + dashMoney((metrics.mrrGrossCents || 0) - metrics.mrrNetCents) + " Shape fee", v: metrics.mrrNetCents });
  }
  const b = (t) => <b style={{ color: DBZ_INK, fontWeight: 600 }}>{t}</b>;
  return (
    <div>
      <p style={{ margin: "0 0 4px", fontSize: 15, lineHeight: 1.6, color: DBZ_INK50 }}>
        {b(dashMoney(coming))} is coming to you.{next && next.arrivalDate ? <React.Fragment> The next payout, {b(dashMoney(next.amountCents))}, lands {b(dbzDate(next.arrivalDate))}.</React.Fragment> : null}
      </p>
      {rows.map((r, i) => (
        <div key={r.k} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "baseline", padding: "12px 0", borderBottom: i < rows.length - 1 ? DBZ_RULE : 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14 }}>{r.k}</div>
            <div style={{ fontSize: 12, color: DBZ_INK50, marginTop: 2 }}>{r.s}</div>
          </div>
          <div style={{ fontFamily: serif, fontSize: 21, fontVariantNumeric: "tabular-nums" }}>{dashMoney(r.v)}</div>
        </div>
      ))}
      {dbzScheduleLine(data.schedule) && <div style={{ ...DBZ_NOTE, marginTop: 8 }}>{dbzScheduleLine(data.schedule)}.</div>}
    </div>
  );
}

// ── Churn zone — who left, when, and why (honest about the why) ─────────────
// How many cancellations the analytics routes send, newest first (their `.limit(12)`).
const DBZ_CHURN_LIST = 12;
// `pace` is the one "What a client is worth" reads (paceFrom at the page's one moment, `now`), so
// the two zones count the same departures over the same days.
function DbzChurnZone({ live, churn, pace = null, now = Date.now() }) {
  // undefined: the analytics are still loading, which is neither "none on record" nor a failed read.
  if (live && churn === undefined) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Your cancellations load with the analytics rollup…</div>;
  }
  // null: the route could not read the cancellations, which is not "none on record".
  if (live && churn === null) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Couldn't read your cancellations just now. Nothing is lost; reload to try again.</div>;
  }
  const rows = live ? (Array.isArray(churn) ? churn : []) : DBZ_DEMO_CHURN;
  if (live && !rows.length) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>No cancellations on record — churn rows appear here the day one lands, with the MRR it took.</div>;
  }
  // ⚠ THE TOTAL HAS A WINDOW (Business review, 2026-10-17). It summed the last 12 cancellations
  // whenever they happened, so a "−$X MRR" could add a departure from last week to one from two
  // years ago. It counts a window, and says which; the rows below still list the older ones.
  // ⚠ AND THE WINDOW IS THE PACE'S, IN THE PACE'S WORDS (the sweep after #2394 round 10). It was the
  // last 90 days while "What a client is worth" on the same tab read the pace's window, so the tab
  // could say "1.6% leave a month" beside "None left". coachForecast.js `churnWindow` opens the count
  // where the pace opens, and falls back to the last 90 days only when there is no pace.
  // ⚠ AND THE LIST STOPS AT DBZ_CHURN_LIST ROWS (the routes' .limit(12)). When every row it holds
  // is inside the window, more may have left than it shows, so the total is a floor and says so.
  // ⚠ WHO LEFT CAN'T BE SAID WHILE THE HISTORY IT IS DECIDED FROM IS UNREAD (Codex round 9, #2394; the
  // sweep after round 10). The route sends departed null when it couldn't read the subscription rows
  // each departure is decided from; counting those rows as gone would report departures (and money
  // lost) it never established.
  // ⚠ DEPARTURES, NOT PLANS THAT ENDED, AND NOT PEOPLE (Codex round 8, #2394; the sweep after round
  // 10). The route decides each row at the close of the week it ended in, as the pace's ended count
  // is judged: a client who held another plan then hadn't left (departed false), whoever they are now.
  // One client's plans ended in one week are one departure whose money adds; a client who left in two
  // weeks left twice (coachForecast.js `departures`), so this count and the pace's agree.
  const gone = window.CoachForecast.departures(rows, { pace, now, cap: DBZ_CHURN_LIST });
  if (!gone) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Couldn't check who still has a plan with you just now, so no one is counted as gone. Nothing is lost; reload to try again.</div>;
  }
  const when = gone.window.paced ? dbzPaceWhen(gone.window) : "in the last 90 days";
  const floor = live && gone.floor;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DBZ_INK50 }}>{gone.count ? gone.count + (floor ? " or more" : "") + " left " + when : "None left " + when}</span>
        {gone.lostCents > 0 && <span style={{ fontFamily: DBZ_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: DBZ_RED }}>{floor ? "at least " : ""}−{dashMoney(gone.lostCents)} a month</span>}
      </div>
      {gone.list.map((r, i) => {
        const tenure = r.startedAt && r.endedAt ? dbzMonthsBetween(r.startedAt, r.endedAt) : null;
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", padding: "10px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{dbzName(r, "Former client")}</div>
              <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.06em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 3 }}>
                {r.endedAt ? "ended " + dbzDate(r.endedAt) : "ended —"}{tenure ? " · " + tenure + " mo client" : ""}
              </div>
              <div style={{ fontSize: 12, color: r.reason ? "rgba(var(--sh-ink-rgb, 242,237,228),0.78)" : DBZ_INK50, fontStyle: r.reason ? "normal" : "italic", lineHeight: 1.45, marginTop: 4 }}>
                {r.reason ? "“" + r.reason + "”" : "Exit reason — collects once the cancellation survey ships"}
              </div>
            </div>
            <span style={{ fontFamily: serif, fontSize: 15, color: DBZ_RED, whiteSpace: "nowrap" }}>{r.priceCents != null ? "−" + dashMoney(r.priceCents) + "/mo" : "—"}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Bring your clients — the BYO link block + origin labels (rails #1794) ───
// Clients a coach brings pay 0% Shape commission; marketplace-delivered
// clients pay 15%. The link block hands the coach their durable ref-tagged
// URL (copy · email · raw URL for an Instagram bio); the origin zone labels
// each active client from the STORED fee_bps — never re-derived from origin +
// the current constant, so a future rate change alters no existing label.
// ⚠ THE PREVIEW'S ORIGIN LIST IS THE PREVIEW'S ROSTER (the sweep after #2394 round 10). It was
// five people of its own (four subscribers) beside a roster of ten on Today, and its fee mix (half
// brought at 0%) never reached a net: Today took 15% off everyone and Business's trajectory did
// too. Each subscriber row is now a roster client, at the fee their row stores, so the list, the
// Plan's "Brought by you", the renewals and every net on the preview describe one practice. The
// stored fee is in cents (coach-roster.ts's shape); the list shows it as the rate it is.
// Lazy, like the trajectory: the roster reads `new Date()` and dashSignals may not be up at load.
// Each row is one client in the routes' shape (origin-attribution.ts: their id, and their plans
// folded into one row); a roster client holds one plan, so the preview's net stays the roster's.
const DBZ_DEMO_PURCHASES = [
  { name: "Drew Park", kind: "purchase", origin: "coach_link", feeBps: 0, priceCents: 9000 },
];
function dbzDemoOrigin() {
  let subs = [];
  try {
    subs = DashSignals.buildMockClients(new Date()).map((c) => {
      const p = c.payments || {};
      return {
        name: c.profile.name, clientId: c.profile.id, kind: "subscription", origin: p.origin, priceCents: p.mrrCents,
        feeBps: p.mrrCents > 0 ? Math.round((p.feeCents || 0) / p.mrrCents * 10000) : 0,
        plans: 1, mixedFees: false,
      };
    });
  } catch (e) { /* dashSignals not up yet — no roster, so no rows of it */ }
  return subs.concat(DBZ_DEMO_PURCHASES);
}
const DBZ_BYO_PITCH = "Clients you bring pay no Shape commission — you keep your full rate. They join Shape as members at $5/mo. Members already in your Shape waiting room count as Shape-found.";
function DbzBringClientsZone({ live, role, providerId }) {
  const [link, setLink] = React.useState(null); // null = generating / unavailable
  const [copied, setCopied] = React.useState(false);
  // A refused clipboard (an older browser, a page not in focus) said nothing: the button just
  // stayed "Copy link". It now says to copy the link by hand, which the box allows.
  const [copyFailed, setCopyFailed] = React.useState(false);
  React.useEffect(() => {
    let on = true;
    (async () => {
      if (!live || !providerId || !window.shapeDb) return;
      try {
        const session = await window.shapeDb.getSession();
        const uid = session && session.user && session.user.id;
        if (!uid || !on) return;
        const res = await window.shapeDb.client.rpc("create_coach_referral_link", { p_provider_role: role, p_provider_id: providerId });
        if (on && res && !res.error && res.data) {
          // ⚠ THE LINK NAMES THE ROLE. A coach with both roles has two provider rows, and without
          // &role= the profile opened the one its account role guessed: checkout then went to the
          // other row, the token did not match it, and the client paid 15%.
          setLink("https://theshapecommunity.com/newdesign/MemberProfile.html?u=" + uid + "&ref=" + res.data + "&role=" + role);
        }
      } catch (e) { /* pre-migration / offline — the honest line below covers it */ }
    })();
    return () => { on = false; };
  }, [live, role, providerId]);
  const url = live ? link : "https://theshapecommunity.com/newdesign/MemberProfile.html?u=you&ref=…";
  const copyIt = async () => {
    if (!url || !live) return;
    try { await navigator.clipboard.writeText(url); setCopyFailed(false); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch (e) { setCopyFailed(true); }
  };
  const emailIt = () => {
    if (!url || !live) return;
    const body = "I’m coaching on Shape now — my programs, your logging, and our chat all live in one app. Join me here: " + url;
    window.location.href = "mailto:?subject=" + encodeURIComponent("Join me on Shape") + "&body=" + encodeURIComponent(body);
  };
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.78)", lineHeight: 1.55 }}>{DBZ_BYO_PITCH}</div>
      {live && !link ? (
        <div style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50, marginTop: 12, lineHeight: 1.6 }}>
          Your ref-tagged link generates here once you're signed in and referrals are live.
        </div>
      ) : (
        <React.Fragment>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: "var(--sh-accent-ink, #2ee0c4)", marginTop: 12, padding: "9px 10px", background: "rgba(var(--sh-accent-rgb, 46,224,196),0.06)", border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.18)", wordBreak: "break-all", lineHeight: 1.55, userSelect: "all" }}>
            {url}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={copyIt} style={{ fontFamily: DBZ_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_TEAL_INK, background: DBZ_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.5, clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button type="button" onClick={emailIt} style={{ fontFamily: DBZ_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_INK, background: "transparent", border: "1px dashed rgba(var(--sh-ink-rgb, 242,237,228),0.25)", borderRadius: 4, padding: "10px 16px", cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.5 }}>
              ✉︎ Email it
            </button>
          </div>
          {copyFailed && <div role="status" style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_AMBER, marginTop: 8 }}>Couldn't copy it here. Select the link above and copy it.</div>}
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DBZ_INK50, marginTop: 9 }}>
            Paste the raw URL anywhere — a text, an email signature, your Instagram bio. Anyone who opens it inside 30 days of subscribing counts as yours.
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
// How many one-time purchases the origin feed lists, newest first (origin-attribution.ts's .limit(20)).
const DBZ_ORIGIN_PURCHASES = 20;
function DbzOriginZone({ live, byOrigin }) {
  // undefined: the analytics are still loading, which is neither "no clients yet" nor a failed read.
  if (live && byOrigin === undefined) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Where your clients came from loads with the analytics rollup…</div>;
  }
  // null: the route could not read the subscriptions, which is not "no clients yet".
  if (live && byOrigin === null) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Couldn't read where your clients came from just now. Nothing is lost; reload to try again.</div>;
  }
  const rows = live ? (Array.isArray(byOrigin) ? byOrigin : []) : dbzDemoOrigin();
  if (live && !rows.length) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Origin labels land here as clients subscribe — "You brought" at your full rate, "Found you on Shape" at the marketplace fee.</div>;
  }
  // Commission status keys off the STORED fee, never off origin — this surface
  // is the fee pitch, and the row's rate is the billing truth.
  const isByo = (row) => row.feeBps === 0;
  // ⚠ THE HEADER COUNTS CLIENTS, AND A PURCHASE IS NOT ONE (the follow-up to #2395). It counted
  // rows, one a plan and one more a one-time purchase, so one brought client with two plans beside
  // one from Shape read "2 you brought · 1 found you on Shape" while the Plan said "1 of your 2".
  // The routes send one row a client now (origin-attribution.ts, the brought-in share's own fold:
  // brought when any of their plans is at 0%), so the header counts those rows and is the share's
  // count; the purchases are listed under a line of their own.
  const clients = rows.filter((r) => r.kind === "subscription");
  const purchases = rows.filter((r) => r.kind === "purchase");
  const brought = clients.filter(isByo).length;
  const countStyle = { fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DBZ_INK50, marginBottom: 4 };
  // The feed holds the latest DBZ_ORIGIN_PURCHASES purchases, so a full list is not a total. None
  // has no line: a purchases read that failed sends none too, and "0" would be a claim.
  const bought = purchases.length >= DBZ_ORIGIN_PURCHASES ? "Your latest " + purchases.length + " one-time purchases"
    : purchases.length === 1 ? "1 one-time purchase" : purchases.length + " one-time purchases";
  const line = (r, i) => {
    const byo = isByo(r);
    const feePct = Math.round((r.feeBps || 0) / 100 * 10) / 10;
    // A client on two plans is one row. When their plans' fees differ no one rate is theirs, so the
    // row says so rather than print the 0% that made them brought.
    const fee = (r.plans > 1 ? r.plans + " plans · " : "") + (r.mixedFees ? "different fees" : feePct + "% fee");
    return (
      <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
        <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
        <span style={{ fontFamily: DBZ_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: byo ? DBZ_TEAL : DBZ_INK50, whiteSpace: "nowrap" }}>
          {byo ? "You brought" : "Found you on Shape"} · {fee}{r.kind === "purchase" ? " · one-time" : ""}
        </span>
      </div>
    );
  };
  return (
    <div>
      <div style={countStyle}>
        {brought} you brought · {clients.length - brought} found you on Shape
      </div>
      {clients.map(line)}
      {purchases.length > 0 && (
        <React.Fragment>
          <div style={{ ...countStyle, marginTop: 14 }}>{bought}</div>
          {purchases.map(line)}
        </React.Fragment>
      )}
    </div>
  );
}

// ── Roster outcomes — the migrated Analytics content (what the business sells)
// ⚠ THE WIDGET DECLARES `empty: !cp` AND THIS IS STILL NULL-SAFE, ON PURPOSE.
// `cp` is the analytics rollup, absent until the fetch lands — and a bare
// `cp.roster` is a TypeError with NO error boundary anywhere in public/newdesign,
// so the whole Business page goes blank. The `empty` contract is the honest
// PRESENTATION (a card with nothing measured is not drawn); this is the floor
// under it, so a future caller that forgets cannot take the page down. A
// mutation removing the declaration is what found this. ⚠ It is UNREACHABLE today
// — dgVisibleWidgets skips an `empty` widget before render() is ever called, and
// two guards pin that declaration — so it is labelled belt-and-braces rather than
// tested around, which is what a proven no-op earns.
function DbzOutcomesZone({ role, cp }) {
  const cfg = DBZ_ROLES[role];
  const roster = (cp && cp.roster) || [];
  const units = useDashUnits();
  // The roster carries the change in pounds; it reads in the coach's own units.
  const fmtWeight = (lb) => {
    if (lb == null) return "—";
    const m = units.measure(lb, "lb");
    const r = Math.round(Number(m.value) * 10) / 10;
    return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(1) + " " + m.unit;
  };
  const topLosers = roster.filter((r) => r.weightChangeLb != null && r.weightChangeLb < 0)
    .slice().sort((a, b) => a.weightChangeLb - b.weightChangeLb).slice(0, 5);
  const consistent = roster.slice().sort(cfg.consistentSort).slice(0, 5);
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 14, marginBottom: 16 }}>
        {cfg.outcomeCards(cp).map((c, i) => (
          <div key={i}>
            <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1 }}>{c.k}</div>
            <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 6 }}>{c.l}</div>
            <div style={{ fontSize: 10, color: DBZ_INK50, marginTop: 2 }}>{c.sub}</div>
          </div>
        ))}
      </div>
      <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 }}>
        <div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_INK50, marginBottom: 6 }}>Top weight loss · 30d</div>
          {topLosers.length ? topLosers.map((r, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{dbzName(r, "Client")}</span>
              <span style={{ fontFamily: serif, fontSize: 15, color: DBZ_TEAL }}>{fmtWeight(r.weightChangeLb)}</span>
            </div>
          )) : <div style={{ fontSize: 12, color: DBZ_INK50, padding: "8px 0" }}>{cp && cp.weightsUnknown ? "Couldn't read weigh-ins just now." : "No weight-loss trends yet."}</div>}
        </div>
        <div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_INK50, marginBottom: 6 }}>{cfg.consistentLabel}</div>
          {consistent.length ? consistent.map((r, i) => {
            const v = cfg.consistentValue(r);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{dbzName(r, "Client")}</span>
                <span style={{ fontFamily: serif, fontSize: 15 }}>{v.n} <span style={{ fontFamily: DBZ_MONO, fontSize: 9, color: DBZ_INK50, textTransform: "uppercase" }}>{v.unit}</span></span>
              </div>
            );
          }) : <div style={{ fontSize: 12, color: DBZ_INK50, padding: "8px 0" }}>{cp && cp.rosterUnknown ? "Couldn't read your roster just now." : "No history yet."}</div>}
        </div>
      </div>
    </div>
  );
}

// ── Practice trajectory — "are my clients increasing or decreasing?" ─────────
// (review 2026-09-09, R8). The series comes from /api/{role}/analytics
// `trajectory`: weekly ISO buckets of active · added · ended · MRR · one-time,
// built in src/lib/coach-trajectory.mjs from every subscription the coach has
// ever had plus paid one-time purchases. Three small multiples on one time
// axis each (never a dual axis), a crosshair + one tooltip for every series,
// a table twin, and a range row above the charts. Mark colours are the
// validated dark-surface pair(s): teal #12a899 with rust #e0644b (adds vs
// ended) and teal with amber #b8892f (MRR + one-time) — the brand's brighter
// #2ee0c4 stays on chrome, where it belongs. Demo series ONLY under the band.
// ⚠ ALL FOUR ARE TOKENS, because the surface they are drawn on is one: on the
// light ground the dark pair reads 2.73 / 2.91:1, under the 3:1 floor for a
// non-text mark, so --sh-chart-teal / --sh-chart-amber take the builder's own
// accent and gold there (3.66 / 3.64) and resolve back to the pair above on the
// dark paper. A chart whose surface, grid and rust moved while two of its marks
// stayed put would disagree with itself on one paper or the other.
const DBZ_T_TEAL = "var(--sh-chart-teal, #12a899)";   // active · added · MRR
const DBZ_T_RUST = "var(--sh-rust, #e0644b)";   // ended
const DBZ_T_AMBER = "var(--sh-chart-amber, #b8892f)";  // one-time purchases
const DBZ_T_SURFACE = "var(--sh-ground, #1a1612)";
const DBZ_T_GRID = "rgba(var(--sh-ink-rgb, 242,237,228),0.10)";
const DBZ_T_INK = "var(--sh-ink, #f2ede4)";

// A deterministic demo walk: 78 weeks, 6 → ~34 active, so the preview shows
// what a growing practice looks like. Demo band only.
// ⚠ THE PREVIEW HAS ONE PRACTICE, NOT TWO (review 2026-09-09, V5). This page told a
// prospective coach they had 34 active clients while Today, the roster and the Week —
// all built from `buildMockClients` — showed ten. Two internally-coherent demo datasets
// that contradict each other on adjacent tabs is worse than either alone, because the
// preview is what the product is judged on.
//
// The growth walk KEEPS ITS SHAPE and changes only where it lands: every week's active
// count is rescaled so the last one equals the roster the rest of the preview shows.
// Rescaling rather than re-walking is deliberate — the curve is the story, and a
// re-walk to a smaller target would flatten it.
// ⚠ THE DEMO TRAJECTORY NETTED MRR AT 0.88 — A 12% FEE THE PRODUCT DOES NOT CHARGE.
// Found by the guard written for the payouts block below, which is the same finding one
// plate over: this page showed net MRR cut at 12% beside a payout balance cut at 15%,
// from the same roster. 15% is the rate the pricing page publishes, the rate
// `coach.jsx` names, and the rate `coach-trajectory.mjs` falls back to when a
// subscription row carries no stored `fee_bps` — so 0.88 was not a deliberate variation,
// it was an outlier no comment ever claimed. Live money is untouched either way: the
// real trajectory cuts every row by its OWN stored fee and never by a constant.
//
// The rate has one definition (`DashSignals.PREVIEW_NET_RATE`) and is read through the
// guarded pattern `dbzDemoRosterSize` establishes, because this module can render before
// dashSignals is up. The fallback is pinned to the constant by a guard in
// tests/demo-coherence.test.mjs, so the two cannot drift apart unnoticed. Since the sweep
// after #2394 round 10 the walk's MRR is netted by each roster client's own fee instead
// (`dbzDemoBook` below); this rate nets only its one-time purchases, which store none.
function dbzNetRate() {
  try {
    const r = DashSignals.PREVIEW_NET_RATE;
    return typeof r === "number" && r > 0 && r <= 1 ? r : 0.85;
  } catch (e) { return 0.85; }   // dashSignals not up yet — the rate it would have returned
}
function dbzDemoRosterSize() {
  try {
    const n = DashSignals.buildMockClients(new Date()).length;
    return n > 0 ? n : 10;
  } catch (e) { return 10; }   // dashSignals not up yet — the ten it would have returned
}
// ⚠ THE PREVIEW'S TODAY IS TODAY'S PRACTICE, IN MONEY TOO (the sweep after #2394 round 10). The walk
// priced its own clients (active × $185, plus a wobble) and took 15% off every one, so the last
// week said $1,865 billed and $1,585 net while Today, from the roster, said $1,820 and $1,547, and
// the origin list two tabs over had half the clients brought at 0%. Money's "Net a month", the
// Plan's sentence and the 13-week header all read that last week. Its gross is now the roster's
// own prices and its net the roster after each client's stored fee (dashSignals.js
// `rosterNetCents`, which Today's card and the sidebar card read), and every earlier week is the
// same practice at its headcount then. The fallback is what the roster would have returned,
// pinned to it by a guard in tests/business-plan-page.test.mjs.
function dbzDemoBook() {
  try {
    const cs = DashSignals.buildMockClients(new Date());
    if (cs.length > 0) {
      return {
        clients: cs.length,
        grossCents: cs.reduce((s, c) => s + ((c.payments && c.payments.mrrCents) || 0), 0),
        netCents: DashSignals.rosterNetCents(cs),
      };
    }
  } catch (e) { /* dashSignals not up yet */ }
  return { clients: 10, grossCents: 182000, netCents: 168200 };
}
// ⚠ LAZY AND DAY-KEYED, FOR TWO REASONS. It reads `dbzDemoRosterSize()`, and an IIFE at
// module scope would read it at LOAD while the outcomes plate's getter reads it at
// RENDER — two read times for one number is the disagreement this whole change is
// about. And its week anchor is `new Date()`, so a module-scope build leaves a tab open
// overnight quoting yesterday's weeks.
let _dbzTraj = null;
function dbzDemoTrajectory() {
  const key = new Date().toDateString();
  if (_dbzTraj && _dbzTraj.key === key) return _dbzTraj.v;
  const v = (() => {
  let seed = 7;
  const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  const weeks = [];
  let active = 6;
  const monday = new Date(); monday.setUTCHours(0, 0, 0, 0); monday.setUTCDate(monday.getUTCDate() - ((monday.getUTCDay() + 6) % 7));
  for (let i = 77; i >= 0; i--) {
    const added = rnd() < 0.42 ? 1 + (rnd() < 0.25 ? 1 : 0) : 0;
    const ended = rnd() < 0.2 && active > 4 ? 1 : 0;
    active = Math.max(0, active + added - ended);
    weeks.push({
      weekOf: new Date(monday.getTime() - i * 7 * 86400000).toISOString().slice(0, 10),
      active, added, ended,
      mrrGrossCents: 0, mrrNetCents: 0,   // priced below, once the headcounts land on the roster
      oneTimeCents: rnd() < 0.3 ? 9000 * (1 + Math.floor(rnd() * 2)) : 0, oneTimeNetCents: 0,
    });
  }
  // One-time purchases in the walk store no fee, so they net at the published rate, as a live row
  // with no stored fee does (coach-trajectory.mjs). The preview never prints them; the export is live only.
  weeks.forEach((w) => { w.oneTimeNetCents = Math.round(w.oneTimeCents * dbzNetRate()); });
  // Land the curve on the roster the rest of the preview shows, keeping its shape.
  const target = dbzDemoRosterSize();
  const peak = weeks[weeks.length - 1].active;
  if (peak > 0 && target !== peak) {
    const k = target / peak;
    let prev = null;
    weeks.forEach((w, i) => {
      w.active = i === weeks.length - 1 ? target : Math.max(1, Math.round(w.active * k));
      // adds and ends are FLOWS, so they follow from the levels rather than being
      // scaled independently — otherwise the series stops adding up.
      if (prev != null) { const d = w.active - prev; w.added = Math.max(0, d); w.ended = Math.max(0, -d); }
      prev = w.active;
    });
  }
  // Every week is the roster's practice at that week's headcount, so the last one IS the roster:
  // its prices billed, and each client after their own fee (dbzDemoBook above).
  const book = dbzDemoBook();
  weeks.forEach((w) => {
    w.mrrGrossCents = Math.round(book.grossCents * w.active / book.clients);
    w.mrrNetCents = Math.round(book.netCents * w.active / book.clients);
  });
  const last = weeks[weeks.length - 1];
  return {
    weeks,
    firstSubAt: new Date(monday.getTime() - 77 * 7 * 86400000).toISOString(),
    // ⚠ THE FLOWS ARE SUMMED FROM THE WEEKS, not asserted beside them. `addsThisMonth: 3`
    // was a literal sitting next to a series that says something else — the same class of
    // disagreement one level down.
    summary: {
      activeNow: last.active,
      active30dAgo: weeks[weeks.length - 5].active,
      addsThisMonth: weeks.slice(-4).reduce((n, w) => n + w.added, 0),
      endedThisMonth: weeks.slice(-4).reduce((n, w) => n + w.ended, 0),
      churnRate30dPct: 4, medianTenureDays: 212,
      oneTime30dCents: weeks.slice(-4).reduce((n, w) => n + w.oneTimeCents, 0),
      totalEverSubscribed: weeks.reduce((n, w) => n + w.added, 6),
    },
  };
  })();
  _dbzTraj = { key, v };
  return v;
}

const DBZ_MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dbzWeekLabel(weekOf) { const d = new Date(weekOf + "T00:00:00Z"); return DBZ_MONTHS[d.getUTCMonth()] + " " + d.getUTCDate(); }
function dbzMonthLabel(key) { const [y, m] = key.split("-"); return DBZ_MONTHS[Number(m) - 1] + " " + y.slice(2); }
// Roll weekly buckets into calendar months: active and MRR are the month's last
// week (a level), added / ended / one-time are sums (flows).
function dbzRollMonths(weeks) {
  const out = []; const byKey = new Map();
  for (const w of weeks) {
    const key = w.weekOf.slice(0, 7);
    let m = byKey.get(key);
    if (!m) { m = { key, label: dbzMonthLabel(key), active: 0, added: 0, ended: 0, mrrNetCents: 0, mrrGrossCents: 0, oneTimeCents: 0 }; byKey.set(key, m); out.push(m); }
    m.active = w.active; m.mrrNetCents = w.mrrNetCents; m.mrrGrossCents = w.mrrGrossCents;
    m.added += w.added; m.ended += w.ended; m.oneTimeCents += w.oneTimeCents;
  }
  return out;
}
function dbzBuckets(traj, range) {
  const weeks = traj && Array.isArray(traj.weeks) ? traj.weeks : [];
  if (!weeks.length) return [];
  if (range === "90d") return weeks.slice(-13).map((w) => ({ ...w, key: w.weekOf, label: dbzWeekLabel(w.weekOf) }));
  const src = range === "12mo" ? weeks.slice(-53) : weeks;
  // A practice younger than a quarter reads better week by week even on "all".
  if (range === "all" && traj.firstSubAt) {
    const firstIdx = weeks.findIndex((w) => w.weekOf >= String(traj.firstSubAt).slice(0, 10));
    const since = firstIdx >= 0 ? weeks.slice(Math.max(0, firstIdx - 1)) : weeks;
    if (since.length <= 16) return since.map((w) => ({ ...w, key: w.weekOf, label: dbzWeekLabel(w.weekOf) }));
    return dbzRollMonths(since);
  }
  return dbzRollMonths(src);
}
// Clean axis ticks: 0 · mid · max on a rounded ceiling. Counts never get a
// fractional mid tick (a "0 · 1 · 1" axis is what rounding 0.5 produces).
function dbzTicks(max, integer) {
  if (!(max > 0)) return [0, 1];
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  const nice = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= max) || max;
  const mid = nice / 2;
  if (integer && mid !== Math.floor(mid)) return [0, nice];
  return [0, mid, nice];
}
// A column with a 4px rounded data-end and a square baseline; a zero draws nothing.
function dbzBarPath(x, w, yTop, yBase) {
  if (yBase - yTop <= 0.5) return "";
  const r = Math.min(4, w / 2, Math.max(0, yBase - yTop));
  return `M${x},${yBase} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yBase} Z`;
}

// The width a chart is drawn at, so its 9px labels stay 9px: a chart drawn at 760 units and
// shrunk onto a phone printed them at 4px. Wider than `cap` (760 unless a chart asks for more)
// it scales up.
function useDbzChartWidth(ref, base, cap = base) {
  const [w, setW] = React.useState(base);
  React.useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return undefined;
    const ro = new ResizeObserver((es) => {
      const cw = Math.round(es[0].contentRect.width);
      if (cw > 0) setW(Math.max(300, Math.min(cap, cw)));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [base, cap]);
  return w;
}

// One small multiple. kind: "line" (value → area + line + endpoint) or "bars"
// (series: [{ key, color }] side by side per bucket), optionally with a line
// on the same axis (MRR over one-time). All series share ONE scale.
function DbzChart({ buckets, series, line, unit, hover, onHover, fmt }) {
  const ref = React.useRef(null);
  const W = useDbzChartWidth(ref, 760), H = 150, padL = 44, padR = 16, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = buckets.length;
  const vals = [];
  for (const b of buckets) { for (const s of series || []) vals.push(b[s.key] || 0); if (line) vals.push(b[line.key] || 0); }
  const ticks = dbzTicks(Math.max(...vals, 0), unit !== "$");
  const top = ticks[ticks.length - 1] || 1;
  const y = (v) => padT + plotH - (Math.max(0, v) / top) * plotH;
  const xc = (i) => padL + (n <= 1 ? plotW / 2 : (i + 0.5) * (plotW / n));
  const band = n ? plotW / n : plotW;
  const move = (e) => {
    if (!ref.current || !n) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / band)));
    onHover(i);
  };
  // About one label per 70 units, so a phone's narrower chart thins them instead of overprinting.
  const room = Math.max(2, Math.floor(plotW / 70));
  const labelEvery = n > room ? Math.ceil(n / room) : 1;
  const fmtTick = (v) => unit === "$" ? "$" + Math.round(v / 100).toLocaleString() : String(Math.round(v));
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto", overflow: "visible" }} onMouseMove={move} onMouseLeave={() => onHover(null)} role="img" aria-hidden="true">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={DBZ_T_GRID} strokeWidth="1" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fill="var(--sh-ink2, #a09b94)" fontFamily="'JetBrains Mono', monospace" fontSize="9">{fmtTick(t)}</text>
        </g>
      ))}
      {buckets.map((b, i) => (i % labelEvery === 0 || i === n - 1) ? (
        <text key={b.key} x={xc(i)} y={H - 8} textAnchor="middle" fill="var(--sh-ink2, #a09b94)" fontFamily="'JetBrains Mono', monospace" fontSize="9">{b.label}</text>
      ) : null)}
      {(series || []).length > 0 && buckets.map((b, i) => {
        const k = series.length, gap = 2, bw = Math.min(24, Math.max(3, (band * 0.62 - gap * (k - 1)) / k));
        const x0 = xc(i) - (bw * k + gap * (k - 1)) / 2;
        return series.map((s, j) => {
          const d = dbzBarPath(x0 + j * (bw + gap), bw, y(b[s.key] || 0), y(0));
          return d ? <path key={b.key + s.key} d={d} fill={s.color} opacity={hover == null || hover === i ? 1 : 0.55} /> : null;
        });
      })}
      {line && n > 0 && (() => {
        const pts = buckets.map((b, i) => [xc(i), y(b[line.key] || 0)]);
        const d = pts.map((p, i) => (i ? "L" : "M") + p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" ");
        const area = d + ` L${pts[n - 1][0].toFixed(1)},${y(0)} L${pts[0][0].toFixed(1)},${y(0)} Z`;
        const end = pts[n - 1];
        return (
          <g>
            {line.area && <path d={area} fill={line.color} opacity="0.10" />}
            <path d={d} fill="none" stroke={line.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            <circle cx={end[0]} cy={end[1]} r="5" fill={line.color} stroke={DBZ_T_SURFACE} strokeWidth="2" />
            <text x={end[0] - 8} y={end[1] - 9} textAnchor="end" fill={DBZ_T_INK} fontFamily="'JetBrains Mono', monospace" fontSize="10">{fmt(buckets[n - 1][line.key] || 0)}</text>
          </g>
        );
      })()}
      {hover != null && n > 0 && <line x1={xc(hover)} x2={xc(hover)} y1={padT} y2={padT + plotH} stroke="rgba(var(--sh-ink-rgb, 242,237,228),0.35)" strokeWidth="1" />}
    </svg>
  );
}

function DbzLegend({ items }) {
  return (
    <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
      {items.map((it) => (
        <span key={it.label} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DBZ_INK50 }}>
          {it.line ? <span style={{ width: 14, height: 2, background: it.color, borderRadius: 1 }} /> : <span style={{ width: 9, height: 9, background: it.color, borderRadius: 2 }} />}
          {it.label}
        </span>
      ))}
    </div>
  );
}

function DbzTrajectoryZone({ live, trajectory, role, loading }) {
  const [range, setRange] = React.useState("12mo");
  const [table, setTable] = React.useState(false);
  const [hover, setHover] = React.useState(null);
  const traj = live ? trajectory : dbzDemoTrajectory();
  // ⚠ A FAILED READ IS NOT AN EMPTY PRACTICE. The route sends `trajectory: null`
  // when the subscriptions read errors, so this branch says so rather than
  // falling through to the "no subscribers yet" line below — which would assert
  // a fact about the coach's business on the strength of a query that failed.
  if (live && !traj) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50 }}>{loading ? "Your trajectory loads with the analytics rollup…" : "Your trajectory could not be read just now — that's a loading problem, not an empty practice. Refresh to try again."}</div>;
  }
  const s = traj.summary || {};
  if (live && !(s.totalEverSubscribed > 0)) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Your trajectory starts with your first subscriber — this plate draws itself from the first one: active clients over time, who joined and who left, and what the practice earns.</div>;
  }
  const buckets = dbzBuckets(traj, range);
  const money = (c) => dashMoney(c);
  const delta30 = s.active30dAgo != null && s.activeNow != null ? s.activeNow - s.active30dAgo : null;
  const net = (s.addsThisMonth || 0) - (s.endedThisMonth || 0);
  const tenure = s.medianTenureDays == null ? "—" : s.medianTenureDays >= 60 ? (Math.round(s.medianTenureDays / 30.4 * 10) / 10) + " mo" : s.medianTenureDays + " d";
  const figures = [
    { k: String(s.activeNow ?? 0), l: "Active now", sub: delta30 == null ? "vs 30 days ago —" : (delta30 >= 0 ? "+" : "−") + Math.abs(delta30) + " vs 30 days ago", tone: delta30 == null ? null : delta30 >= 0 ? DBZ_GREEN : DBZ_RED },
    { k: (net >= 0 ? "+" : "−") + Math.abs(net), l: "Net this month", sub: (s.addsThisMonth || 0) + " joined · " + (s.endedThisMonth || 0) + " left", tone: net > 0 ? DBZ_GREEN : net < 0 ? DBZ_RED : null },
    { k: s.churnRate30dPct == null ? "—" : s.churnRate30dPct + "%", l: "Churn · 30d", sub: s.churnRate30dPct == null ? "no clients 30 days ago" : "of clients you had 30 days ago", tone: s.churnRate30dPct == null ? null : s.churnRate30dPct > 10 ? DBZ_AMBER : null },
    { k: tenure, l: "Median tenure", sub: s.totalEverSubscribed ? s.totalEverSubscribed + " subscribers, ever" : "—", tone: null },
  ];
  const chip = (on) => ({ fontFamily: DBZ_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 3, border: "1px solid " + (on ? DBZ_TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)"), background: on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.10)" : "transparent", color: on ? "var(--sh-accent-ink, #2ee0c4)" : DBZ_INK50, cursor: "pointer" });
  const hb = hover != null ? buckets[hover] : null;
  const chartHead = (title, legend) => (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "14px 0 4px" }}>
      <span style={{ fontFamily: DBZ_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_INK50 }}>{title}</span>
      {legend ? <DbzLegend items={legend} /> : null}
    </div>
  );
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14, marginBottom: 6 }}>
        {figures.map((f, i) => (
          <div key={i}>
            <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", lineHeight: 1 }}>{f.k}</div>
            <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 6 }}>{f.l}</div>
            <div style={{ fontSize: 10, color: f.tone || DBZ_INK50, marginTop: 2 }}>{f.sub}</div>
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <div style={{ display: "flex", gap: 6 }}>
          {[["90d", "90 days"], ["12mo", "12 months"], ["all", "All time"]].map(([k, l]) => <button key={k} type="button" onClick={() => setRange(k)} style={chip(range === k)}>{l}</button>)}
        </div>
        <button type="button" onClick={() => setTable(!table)} style={chip(table)}>{table ? "Charts" : "Table"}</button>
      </div>
      {table ? (
        <div style={{ overflowX: "auto", marginTop: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", fontFamily: DBZ_MONO, fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}>
            <thead><tr>{["Period", "Active", "Joined", "Left", "MRR · net", "One-time"].map((h) => <th key={h} style={{ textAlign: h === "Period" ? "left" : "right", padding: "6px 8px", color: DBZ_INK50, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 8.5, borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)" }}>{h}</th>)}</tr></thead>
            <tbody>{buckets.map((b) => (
              <tr key={b.key}>
                <td style={{ padding: "5px 8px", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>{b.label}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>{b.active}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>{b.added ? "+" + b.added : "0"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>{b.ended ? "−" + b.ended : "0"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>{money(b.mrrNetCents)}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)" }}>{b.oneTimeCents ? money(b.oneTimeCents) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div style={{ position: "relative" }}>
          {chartHead("Active clients")}
          <DbzChart buckets={buckets} line={{ key: "active", color: DBZ_T_TEAL, area: true }} unit="n" hover={hover} onHover={setHover} fmt={(v) => String(v)} />
          {chartHead("Joined vs left", [{ label: "Joined", color: DBZ_T_TEAL }, { label: "Left", color: DBZ_T_RUST }])}
          <DbzChart buckets={buckets} series={[{ key: "added", color: DBZ_T_TEAL }, { key: "ended", color: DBZ_T_RUST }]} unit="n" hover={hover} onHover={setHover} fmt={(v) => String(v)} />
          {chartHead("Revenue · MRR net, one-time purchases", [{ label: "MRR · net", color: DBZ_T_TEAL, line: true }, { label: "One-time", color: DBZ_T_AMBER }])}
          <DbzChart buckets={buckets} series={[{ key: "oneTimeCents", color: DBZ_T_AMBER }]} line={{ key: "mrrNetCents", color: DBZ_T_TEAL, area: false }} unit="$" hover={hover} onHover={setHover} fmt={money} />
          {hb && (
            <div style={{ position: "absolute", top: 8, ...(hover < buckets.length / 2 ? { right: 8 } : { left: 52 }), pointerEvents: "none", background: "rgba(var(--sh-ground2-rgb, 20,17,14),0.96)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderRadius: 6, padding: "9px 12px", minWidth: 170, boxShadow: "0 12px 30px rgba(0,0,0,0.4)" }}>
              <div style={{ fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase", color: DBZ_INK50, marginBottom: 6 }}>{hb.label}</div>
              {[[String(hb.active), "active", DBZ_T_TEAL, false], ["+" + hb.added, "joined", DBZ_T_TEAL, false], ["−" + hb.ended, "left", DBZ_T_RUST, false], [money(hb.mrrNetCents), "MRR · net", DBZ_T_TEAL, true], [hb.oneTimeCents ? money(hb.oneTimeCents) : "—", "one-time", DBZ_T_AMBER, false]].map(([v, l, c, isLine], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "14px 1fr auto", gap: 8, alignItems: "center", padding: "2px 0" }}>
                  <span style={{ width: isLine ? 14 : 9, height: isLine ? 2 : 9, background: c, borderRadius: isLine ? 1 : 2, justifySelf: "center" }} />
                  <span style={{ fontFamily: DBZ_MONO, fontSize: 9, color: DBZ_INK50, textTransform: "uppercase", letterSpacing: "0.06em" }}>{l}</span>
                  <span style={{ fontFamily: DBZ_MONO, fontSize: 11, color: DBZ_T_INK, fontWeight: 700 }}>{v}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.08em", color: DBZ_INK50, marginTop: 10 }}>
        {range === "90d" ? "Weekly · " : "Monthly · "}from your subscription and purchase records{traj.firstSubAt ? " · first subscriber " + dbzWeekLabel(String(traj.firstSubAt).slice(0, 10)) : ""} · a payment that is retrying still counts as active
      </div>
    </div>
  );
}

// ── Plan: what clients earn you, and the next 12 months (design E, owner 2026-10-17) ──
// "forecast on business"; the owner picked the calculator near the top and asked for a page
// that is "easy to use and read/understand" and not "overwhelming". So: one calculator, one
// planner with four sliders, one sentence that says what the chart shows, one chart, and a
// three-row table. The math is coachForecast.js (unit-tested); this file only lays it out.
//
// ⚠ IT STARTS FROM THE COACH'S OWN NUMBERS AND SAYS SO. Each starting figure names where it
// came from ("your listing price", "2.3 over the last 90 days"); a figure the practice cannot
// answer yet starts at a stated default ("no history yet · set your own"), never at a
// plausible-looking measurement.
const DBZ_PATH_TODAY = "var(--sh-ink2, #a09b94)";
const DBZ_DEFAULT_RATE_CENTS = 15000;   // CoachForecast.DEFAULT_RATE_CENTS, for the pages that read no forecast
// ⚠ A MEASURED CHURN IS KEPT TO A TENTH OF A POINT, AND NEVER ROUNDS TO 0. The rule, and why, is
// coachForecast.js `churnPct`, which the planner's start (`planStart`) and the app's page read too.
const dbzChurnPct = (churn) => window.CoachForecast.churnPct(churn);
const dbzPct = (p) => (Number.isInteger(p) ? p : p.toFixed(1)) + "%";
// A rate as the planner's slider prints it: whole dollars, or to the cent when the listing price
// has cents ("$149.50", never "$149.5").
const dbzRate = (r) => "$" + (Number.isInteger(r) ? r : r.toFixed(2));
const dbzMonthsWord = (m) => (m === 1 ? "1 month" : m + " months");

// ⚠ THE PREVIEW'S PACE INCLUDES THE PREVIEW'S DEPARTURES. The demo walk is rescaled onto the
// demo roster, which turns its flows into net level changes, so on its own it reads "no one has
// left" beside a churn list of three people who did. The departures inside the window are put
// back on both sides (each one left, and someone joined to keep the headcount), so the pace,
// the headcount and the churn list tell one story.
function dbzDemoPace(CF, traj, now) {
  const pace = CF.paceFrom(traj, now);
  if (pace.adds == null) return pace;
  // The pace's own window, the one the churn zone counts the demo's departures over.
  const left = DBZ_DEMO_CHURN.filter((r) => new Date(r.endedAt).getTime() >= pace.from).length;
  const months = pace.days / 30.4;
  const ended = pace.ended + left;
  return { ...pace, ended, added: pace.added + left, adds: pace.adds + left / months, churn: pace.avgActive > 0 ? Math.min(1, ended / pace.avgActive / months) : pace.churn };
}
const dbzPaceWhen = (pace) => (pace.fromFirst ? "after your first week" : "over the last 3 months");

// Today's clients and net, from the same series the Overview draws (the trajectory's latest
// week), so every tab says the same number. The rule, and why a past_due client counts, is in
// coachForecast.js `todayFrom`, which the app's Business page reads too.
function dbzToday(extra) {
  const CF = window.CoachForecast;
  return CF ? CF.todayFrom(extra) : null;
}

// The listing's monthly price in cents, or null when there is none (or no listing).
const dbzListedCents = (listing) => { const CF = window.CoachForecast; return CF ? CF.listedCents(listing ? listing.monthly : null) : null; };

// Where the Plan tab starts: today's clients and net, the rate a new client pays, the share
// the coach brings, and the pace. { state: "loading" | "unread" | "ready", ... }
function dbzPlanBase({ live, extra, failed = false, listing, listingRead, listingFailed = false, now = Date.now() }) {
  const CF = window.CoachForecast;
  if (!CF) return { state: "unread" };
  if (!live) {
    const traj = dbzDemoTrajectory();
    const last = traj.weeks[traj.weeks.length - 1];
    const subs = dbzDemoOrigin().filter((r) => r.kind === "subscription");
    const brought = subs.filter((r) => r.feeBps === 0).length;
    return {
      state: "ready", clients: last.active, mrrNetCents: last.mrrNetCents, mrrGrossCents: last.mrrGrossCents,
      rateCents: last.active ? Math.round(last.mrrGrossCents / last.active / 500) * 500 : DBZ_DEFAULT_RATE_CENTS, rateFrom: "your clients' average",
      byoShare: subs.length ? brought / subs.length : 0, byoNote: "0% Shape fee on these",
      pace: dbzDemoPace(CF, traj, now),
    };
  }
  if (!extra && failed) return { state: "unread" };
  if (!extra || !listingRead) return { state: "loading" };
  // The numbers are coachForecast.js `planNumbers`, which the app's Business page reads too: it
  // marks an unread listing, brought share and history (pace.unread), and the copy here says so.
  const n = CF.planNumbers({ extra, listingMonthly: listing ? listing.monthly : null, listingFailed, now });
  if (!n) return { state: "unread" };
  return {
    ...n, state: "ready",
    rateFrom: n.rateFrom === "listing" ? "your listing price"
      : n.listingUnread ? "couldn't read your listing price" + (n.rateFrom === "average" ? " · your clients' average" : " · set your own")
      : n.rateFrom === "average" ? "your clients' average" : "no listing price yet · set your own",
    // The brought-in share is per client (the routes' byoMix: one client with two plans is one
    // client). Null is a failed read: the share starts at 0% and says so, never as a measurement.
    byoNote: n.broughtUnread ? "couldn't read who you brought · set your own" : n.byoClients ? "0% fee · " + n.brought + " of your " + n.byoClients : "0% Shape fee on these",
  };
}

function DbzNumberField({ label, value, onChange, prefix, suffix, note, max }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
      <span style={DBZ_LBL}>{label}</span>
      <span style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid var(--sh-line2, #413d38)", borderRadius: 7, padding: "8px 11px", background: "var(--sh-rest, #221e19)" }}>
        {prefix && <span style={{ fontFamily: DBZ_MONO, fontSize: 12, color: DBZ_INK50 }}>{prefix}</span>}
        <input type="number" inputMode="decimal" min="0" max={max} value={value} onChange={(e) => onChange(e.target.value)}
          style={{ width: "100%", minWidth: 0, background: "transparent", border: 0, outline: "none", color: DBZ_INK, fontFamily: DBZ_MONO, fontSize: 15, fontVariantNumeric: "tabular-nums" }} />
        {suffix && <span style={{ fontFamily: DBZ_MONO, fontSize: 12, color: DBZ_INK50 }}>{suffix}</span>}
      </span>
      {note && <span style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50, lineHeight: 1.4 }}>{note}</span>}
    </label>
  );
}

// "What clients earn you": type a client count and a rate, read the net.
function DbzEarnZone({ base }) {
  const CF = window.CoachForecast;
  // A round number above today's count: the question is "what if I had more".
  const [clients, setClients] = React.useState(String(Math.max(20, Math.ceil((base.clients + 1) / 10) * 10)));
  // The rate as it is, to the cent: a $149.50 listing price is not "150 · your listing price"
  // (the sweep after #2394 round 10; the Plan's slider holds it the same way).
  const [rate, setRate] = React.useState(String(base.rateCents / 100));
  const [byo, setByo] = React.useState(String(Math.round(base.byoShare * 100)));
  const n = Math.max(0, Math.round(Number(clients) || 0));
  const e = CF.earn({ clients: n, priceCents: Math.round(Math.max(0, Number(rate) || 0) * 100), byoShare: Math.min(100, Math.max(0, Number(byo) || 0)) / 100 });
  return (
    <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "minmax(0,1.25fr) minmax(0,1fr)", gap: 28, alignItems: "end" }}>
      {/* Three short fields stay side by side on a phone: pageShell stacks any "repeat(3" grid. */}
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr) minmax(0,1fr)", gap: 12 }}>
        <DbzNumberField label="Clients" value={clients} onChange={setClients} max="999" note={"you have " + base.clients + " today"} />
        <DbzNumberField label="Monthly rate" value={rate} onChange={setRate} prefix="$" max="9999" note={base.rateFrom} />
        <DbzNumberField label="Brought by you" value={byo} onChange={setByo} suffix="%" max="100" note={base.byoNote} />
      </div>
      {/* The month and the year sit on one baseline with their labels on one line, and the
          billed and fee line, which is the month's, runs under both (owner, 2026-10-18: "fix look
          of this, formatting"). It sat under "a year", so $3,600 read as a year's billing. Grid
          places them; the markup keeps reading order: the month, its label, the year, its label. */}
      <div style={{ display: "grid", gridTemplateColumns: "auto auto", justifyContent: "start", columnGap: 36, alignItems: "baseline" }}>
        <div style={{ gridRow: 1, gridColumn: 1, fontFamily: serif, fontSize: 48, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{dashMoney(e.netCents)}</div>
        <div style={{ ...DBZ_LBL, gridRow: 2, gridColumn: 1, marginTop: 8 }}>net a month</div>
        <div style={{ gridRow: 1, gridColumn: 2, fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>{dashMoney(e.yearNetCents)}</div>
        <div style={{ ...DBZ_LBL, gridRow: 2, gridColumn: 2, marginTop: 8 }}>a year</div>
        <div style={{ ...DBZ_NOTE, gridRow: 3, gridColumn: "1 / -1", marginTop: 10, paddingTop: 9, borderTop: DBZ_RULE }}>{dashMoney(e.grossCents)} billed · {dashMoney(e.feeCents)} Shape fee, each month</div>
      </div>
    </div>
  );
}

// The Goal tab's calculator is this one (Business review, 2026-10-17). It was a weekly
// session-rate model that took 15% off everything, including clients a coach brings, and
// multiplied weeks by 4.33. The Goal tab keeps a calculator where coaches look for one, now
// "What clients earn you" started from their live figures (dashData.jsx useCoachLiveFigures),
// with the planner one tap away on Business → Plan.
function dbzGoalEarnBase(live) {
  if (!live || live.kind === "loading") return { state: "loading" };
  if (live.kind === "demo") return dbzPlanBase({ live: false });
  if (live.kind !== "live") return { state: "unread" };
  const now = dbzToday({ trajectory: live.trajectory, metrics: { activeClients: live.activeClients, mrrNetCents: live.mrrNetCents, mrrGrossCents: live.mrrGrossCents } });
  if (!now) return { state: "unread" };
  const avg = now.clients > 0 && now.mrrGrossCents > 0 ? Math.round(now.mrrGrossCents / now.clients / 500) * 500 : null;
  return {
    state: "ready", clients: now.clients, mrrNetCents: now.mrrNetCents, mrrGrossCents: now.mrrGrossCents,
    rateCents: avg != null ? avg : DBZ_DEFAULT_RATE_CENTS,
    rateFrom: avg != null ? "your clients' average" : "no clients yet · set your rate",
    byoShare: live.byoShare != null ? live.byoShare : 0,
    byoNote: live.byoNote || "0% Shape fee on these",
  };
}
function DbzGoalEarn({ role, live }) {
  const base = dbzGoalEarnBase(live);
  const href = typeof dashLinkedTab === "function" ? dashLinkedTab("business", role, { section: "plan" }) : (role === "nutritionist" ? "NutritionistApp.html" : "TrainerApp.html") + "#business?section=plan";
  return (
    <div>
      {base.state === "ready"
        ? <DbzEarnZone base={base} />
        : <div style={DBZ_NOTE}>{base.state === "loading" ? "Your numbers load with your live figures…" : "Couldn't read your subscriptions just now. Nothing is lost; reload to try again."}</div>}
      <a href={href} style={{ display: "inline-block", marginTop: 14, fontFamily: DBZ_MONO, fontSize: 10, letterSpacing: "0.06em", color: DBZ_TEAL, textDecoration: "none" }}>
        Plan the next 12 months on Business →
      </a>
    </div>
  );
}

function DbzSlider({ label, value, shown, was, min, max, step, onChange, note }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={DBZ_LBL}>{label}</span>
        <span style={{ fontFamily: DBZ_MONO, fontSize: 15, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>
          {shown}{was != null && <span style={{ fontSize: 11, color: DBZ_INK50 }}> · was {was}</span>}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%", accentColor: "var(--sh-accent, #2ee0c4)" }} />
      {note && <span style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50, lineHeight: 1.4 }}>{note}</span>}
    </label>
  );
}

// The paths over 24 months on one axis: today's pace (dashed), the plan (bright), the what-if.
// ⚠ DRAWN AT THE WIDTH IT IS SHOWN AT (owner, 2026-10-18: "it looks almost zoomed in"). Drawn at
// 760 units and stretched across a wide column, its 9px labels printed at 20px and it stood about
// 460px tall. It now takes the column's own width, to 2000, and grows only a little taller with it.
// `months` is 36 when a goal is reached after month 24, so the month the table names is on it.
function DbzPathsChart({ paths, goalCents, months = 24 }) {
  const ref = React.useRef(null);
  const W = useDbzChartWidth(ref, 760, 2000), H = Math.round(Math.min(270, Math.max(210, W * 0.19))), padL = 54, padR = 38, padT = 12, padB = 26;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const monthTicks = [];
  for (let m = 0; m <= months; m += W < 480 ? 12 : 6) monthTicks.push(m);
  let max = goalCents || 0;
  for (const p of paths) for (const r of p.f.rows) if (r.m <= months) max = Math.max(max, r.netCents);
  const ticks = dbzTicks(max, false);
  const top = ticks[ticks.length - 1] || 1;
  const x = (m) => padL + (m / months) * plotW;
  const y = (v) => padT + plotH - (Math.max(0, v) / top) * plotH;
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto", overflow: "visible" }} role="img"
      aria-label={"Net a month over the next " + months + " months: " + paths.map((p) => p.label + " " + dashMoney(p.f.rows[12].netCents) + " in 12 months").join("; ")}>
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={DBZ_T_GRID} strokeWidth="1" />
          <text x={padL - 8} y={y(t) + 3.5} textAnchor="end" fill="var(--sh-ink2, #a09b94)" fontFamily={DBZ_MONO} fontSize="10">{dashMoney(t)}</text>
        </g>
      ))}
      {monthTicks.map((m) => (
        <text key={m} x={x(m)} y={H - 6} textAnchor="middle" fill="var(--sh-ink2, #a09b94)" fontFamily={DBZ_MONO} fontSize="10">{m === 0 ? "now" : "mo " + m}</text>
      ))}
      {goalCents > 0 && (
        <g>
          <line x1={padL} x2={W - padR} y1={y(goalCents)} y2={y(goalCents)} stroke={DBZ_GREEN} strokeWidth="1.5" strokeDasharray="5 4" />
          <text x={W - padR + 6} y={y(goalCents) + 3.5} fill={DBZ_GREEN} fontFamily={DBZ_MONO} fontSize="10">goal</text>
        </g>
      )}
      {paths.map((p) => (
        <polyline key={p.key} fill="none" stroke={p.color} strokeWidth={p.width} strokeDasharray={p.dash ? "4 3" : undefined} strokeLinejoin="round" strokeLinecap="round"
          points={p.f.rows.filter((r) => r.m <= months).map((r) => x(r.m).toFixed(1) + "," + y(r.netCents).toFixed(1)).join(" ")} />
      ))}
    </svg>
  );
}

function DbzPathKey({ p }) {
  return p.dash
    ? <span aria-hidden="true" style={{ display: "inline-block", width: 16, borderTop: "2px dashed " + p.color, verticalAlign: 4, marginRight: 8 }} />
    : <span aria-hidden="true" style={{ display: "inline-block", width: 16, height: p.width, background: p.color, borderRadius: 1, verticalAlign: 3, marginRight: 8 }} />;
}

function DbzPlanZone({ base }) {
  const CF = window.CoachForecast;
  const known = base.pace.adds != null;
  // An unread history (the trajectory read failed) is not an empty one.
  const noHistory = base.pace.unread ? "couldn't read your history just now · set your own" : "no history yet · set your own";
  // The starting values, rounded to what the sliders can hold, so an untouched plan IS
  // today's pace rather than a near-copy of it.
  // (coachForecast.js `planStart`, shared with the app's planner: churn to a tenth, never 0.)
  const start = React.useMemo(() => CF.planStart(base), [base]);
  const [adds, setAdds] = React.useState(start.adds);
  const [churnPct, setChurnPct] = React.useState(start.churnPct);
  const [rate, setRate] = React.useState(start.rate);
  const [goal, setGoal] = React.useState(start.goal);
  const [whatIf, setWhatIf] = React.useState("more");
  const reset = () => { setAdds(start.adds); setChurnPct(start.churnPct); setRate(start.rate); setGoal(start.goal); setWhatIf("more"); };
  const touched = adds !== start.adds || churnPct !== start.churnPct || rate !== start.rate;

  const run = (o) => CF.forecast({ clients: base.clients, mrrNetCents: base.mrrNetCents, byoShare: base.byoShare, months: 36, priceCents: Math.round(o.rate * 100), adds: o.adds, churn: o.churnPct / 100 });
  // The rate slider holds the starting rate exactly, to the cent (coachForecast.js `rateRange`,
  // shared with the app's planner).
  const rateRange = CF.rateRange(start.rate);
  // ⚠ THE RATE SAYS WHERE IT CAME FROM, AS THE ADDS AND CHURN DO (the sweep after #2394 round 10).
  // A default ($150: no listing price and no clients) or the clients' average started the plan's
  // sentence with nothing on the Plan saying so: the note only ever said today's clients keep the
  // price they joined at. Now it names the source "What clients earn you" names, and keeps that
  // point, briefly.
  const rateNote = base.rateFrom + " · today's clients keep their price";
  const plan = { adds, churnPct, rate };
  const keepPct = Math.max(0, CF.round1(churnPct - 3));
  const priceUp = Math.round((rate * 1.15) / 5) * 5;
  const WHAT_IFS = [
    { key: "more", label: "+1 client a month", o: { ...plan, adds: adds + 1 } },
    churnPct > 0 ? { key: "keep", label: "Churn " + dbzPct(keepPct), o: { ...plan, churnPct: keepPct } } : null,
    { key: "price", label: "$" + priceUp + " for new clients", o: { ...plan, rate: priceUp } },
  ].filter(Boolean);
  const wi = WHAT_IFS.find((w) => w.key === whatIf) || null;
  const goalCents = goal * 100;
  // Until a slider moves, the plan IS today's pace: one bright line, named for what it is. Once
  // one moves, today's pace stays behind as the dashed line to compare against.
  const compare = known && touched;
  const paths = [
    compare ? { key: "today", label: "Today's pace", color: DBZ_PATH_TODAY, width: 2, dash: true, f: run(start) } : null,
    { key: "plan", label: known && !touched ? "Today's pace" : "Your plan", color: DBZ_T_TEAL, width: 3, f: run(plan) },
    wi ? { key: "whatif", label: "What if: " + wi.label.charAt(0).toLowerCase() + wi.label.slice(1), color: DBZ_T_AMBER, width: 2, f: run(wi.o) } : null,
  ].filter(Boolean);
  const P = paths.find((p) => p.key === "plan");
  const T = paths.find((p) => p.key === "today");
  const reach = (p) => CF.monthsTo(goalCents, p.f);
  const reachText = (m) => (m == null ? "—" : m === 0 ? "now" : "mo " + m);
  // Two years on the chart, or all three the forecast runs when a line reaches the goal after
  // month 24: "mo 33" in the table with the chart stopping at mo 24 left the crossing off it.
  const chartMonths = paths.some((p) => { const r = reach(p); return r != null && r > 24; }) ? 36 : 24;

  // The sentence says what the chart shows, in words (owner: "easy to use and read/understand").
  const b = (t, color) => <b style={{ color: color || DBZ_INK, fontWeight: 600 }}>{t}</b>;
  const planReach = reach(P), todayReach = T ? reach(T) : null;
  const goalWords = dashMoney(goalCents) + " goal";
  let goalLine;
  if (base.mrrNetCents >= goalCents) goalLine = <React.Fragment> You're already past your {b(goalWords, DBZ_GREEN)}.</React.Fragment>;
  // A plan that misses the goal for three years either levels off below it, which is why it
  // misses, or is still climbing past it and gets there later; the sentence says which.
  else if (planReach == null) {
    const steady = P.f.steadyNetCents;
    goalLine = <React.Fragment> That doesn't reach your {goalWords} within three years{steady == null ? null
      : steady < goalCents ? <React.Fragment>: it levels off near {b(dashMoney(steady) + " a month")}</React.Fragment>
      : <React.Fragment>, but it's still climbing, toward {b(dashMoney(steady) + " a month")}</React.Fragment>}.</React.Fragment>;
  }
  else if (!T) goalLine = <React.Fragment>, and you reach your {b(goalWords + " in " + dbzMonthsWord(planReach), DBZ_GREEN)}.</React.Fragment>;
  else goalLine = <React.Fragment>, and you reach your {b(goalWords + " in " + dbzMonthsWord(planReach), DBZ_GREEN)} {todayReach == null ? "(today's pace doesn't, within three years)" : todayReach === planReach ? "the same month as at today's pace" : "instead of " + dbzMonthsWord(todayReach)}.</React.Fragment>;
  const lead = <React.Fragment>{known ? "Today you have " : "You have "}{b(base.clients + (base.clients === 1 ? " client" : " clients"))} and net {b(dashMoney(base.mrrNetCents) + " a month")}.</React.Fragment>;
  const planYear = b(dashMoney(P.f.rows[12].netCents) + " a month", DBZ_T_TEAL);
  const sentence = T
    ? <React.Fragment>{lead} At today's pace that becomes {b(dashMoney(T.f.rows[12].netCents))} in a year. With {b("your plan", DBZ_T_TEAL)} it's {planYear}{planReach != null && base.mrrNetCents < goalCents ? goalLine : <React.Fragment>.{goalLine}</React.Fragment>}</React.Fragment>
    : <React.Fragment>{lead} {known ? "At today's pace" : "With your plan"} that becomes {planYear} in a year{planReach != null && base.mrrNetCents < goalCents ? goalLine : <React.Fragment>.{goalLine}</React.Fragment>}</React.Fragment>;

  return (
    <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "280px minmax(0,1fr)", gap: 30 }}>
      <div style={{ display: "grid", gap: 18, alignContent: "start" }}>
        <DbzSlider label="New clients a month" value={adds} shown={adds.toFixed(1)} was={adds !== start.adds ? start.adds.toFixed(1) : null}
          min={0} max={Math.max(10, Math.ceil(start.adds * 3))} step={0.1} onChange={(v) => setAdds(CF.round1(v))}
          note={known ? "yours: " + start.adds.toFixed(1) + " " + dbzPaceWhen(base.pace) : noHistory} />
        <DbzSlider label="Monthly churn" value={churnPct} shown={dbzPct(churnPct)} was={churnPct !== start.churnPct ? dbzPct(start.churnPct) : null}
          min={0} max={Math.max(30, Math.ceil(start.churnPct))} step={0.1} onChange={(v) => setChurnPct(CF.round1(v))}
          note={base.pace.churn != null ? "yours: " + dbzPct(start.churnPct) + " leave a month, " + dbzPaceWhen(base.pace) : noHistory} />
        <DbzSlider label="Rate for new clients" value={rate} shown={dbzRate(rate)} was={rate !== start.rate ? dbzRate(start.rate) : null}
          min={rateRange.min} max={rateRange.max} step={rateRange.step} onChange={setRate}
          note={rateNote} />
        <DbzSlider label="Goal · net a month" value={goal} shown={dashMoney(goalCents)}
          min={500} max={Math.max(20000, start.goal * 3)} step={250} onChange={setGoal} note="the dashed line" />
        <div>
          <div style={{ ...DBZ_LBL, marginBottom: 7 }}>Compare a what-if</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {WHAT_IFS.map((w) => {
              const on = w.key === whatIf;
              return (
                <button key={w.key} type="button" aria-pressed={on} onClick={() => setWhatIf(on ? null : w.key)}
                  style={{ fontFamily: DBZ_MONO, fontSize: 10, letterSpacing: "0.04em", padding: "6px 10px", borderRadius: 999, cursor: "pointer", border: "1px solid " + (on ? DBZ_T_AMBER : "var(--sh-line2, #413d38)"), color: on ? DBZ_T_AMBER : DBZ_INK50, background: on ? "rgba(216,162,58,0.08)" : "transparent" }}>
                  {w.label}
                </button>
              );
            })}
          </div>
        </div>
        {(touched || goal !== start.goal || whatIf !== "more") && (
          <button type="button" onClick={reset} style={{ justifySelf: "start", fontFamily: DBZ_MONO, fontSize: 10, letterSpacing: "0.06em", color: DBZ_TEAL, background: "transparent", border: 0, padding: 0, cursor: "pointer" }}>↺ Back to my numbers</button>
        )}
      </div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: DBZ_INK50 }}>{sentence}</p>
        <div style={{ marginTop: 14 }}><DbzPathsChart paths={paths} goalCents={goalCents} months={chartMonths} /></div>
        <div className="dbz-scroll" style={{ overflowX: "auto" }}>
          <table className="dbz-cmp" style={{ width: "100%", borderCollapse: "collapse", marginTop: 12, fontVariantNumeric: "tabular-nums" }}>
            <thead><tr>{["In 12 months", "Net a month", "Clients", "Earned in the year", "Reach goal"].map((h, i) => (
              <th key={h} style={{ ...DBZ_LBL, fontSize: 8.5, fontWeight: 700, textAlign: i ? "right" : "left", padding: "8px 10px", borderBottom: DBZ_RULE, whiteSpace: "nowrap" }}>{h}</th>
            ))}</tr></thead>
            <tbody>{paths.map((p) => {
              const r = reach(p);
              const cell = { padding: "11px 10px", textAlign: "right", borderBottom: DBZ_RULE, fontFamily: serif, fontSize: 18, whiteSpace: "nowrap" };
              return (
                <tr key={p.key}>
                  <td style={{ ...cell, textAlign: "left", fontFamily: "inherit", fontSize: 13.5, whiteSpace: "normal" }}><DbzPathKey p={p} /><b style={{ color: p.key === "today" ? DBZ_INK : p.color, fontWeight: 600 }}>{p.label}</b></td>
                  <td style={cell}>{dashMoney(p.f.rows[12].netCents)}</td>
                  <td style={cell}>{Math.round(p.f.rows[12].clients)}</td>
                  <td style={cell}>{dashMoney(CF.earnedOver(p.f, 12))}</td>
                  <td style={{ ...cell, color: r == null ? DBZ_AMBER : DBZ_GREEN }}>{reachText(r)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
        <div style={{ ...DBZ_NOTE, marginTop: 10 }}>
          A projection from your own numbers, not a promise. Today's clients keep the price they pay now; new clients join at the rate above, after Shape's fee on those who find you here.
          {P.f.steadyClients != null && <React.Fragment> At this pace it levels off near {Math.round(P.f.steadyClients)} clients, where each new one replaces one who leaves.</React.Fragment>}
        </div>
      </div>
    </div>
  );
}

// ── Money: renewals this week (design E) ─────────────────────────────────────
// From /api/{role}/analytics `renewals` (src/lib/coach-renewals.mjs): the active rows whose
// period ends in the next 7 days, each asked of Stripe. Only a confirmed renewal counts as
// money coming in; a cancelled one says so, and one Stripe could not be asked about (ending
// null: a failed read, past the check cap, or no Stripe id) says that on its own row, because
// the footnote alone can't tell the coach which client it is.
function dbzDemoRenewals() {
  const day = 86400000, now = Date.now();
  return dbzDemoOrigin().filter((r) => r.kind === "subscription").slice(0, 4).map((r, i) => ({
    name: r.name, dueAt: new Date(now + (1 + i * 2) * day).toISOString(), priceCents: r.priceCents,
    netCents: Math.round(r.priceCents * (1 - (r.feeBps || 0) / 10000)), ending: i === 3,
  }));
}
function dbzDay(v) {
  try { return new Date(v).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" }); } catch (e) { return "—"; }
}
function DbzRenewalsZone({ live, renewals }) {
  if (live && renewals === undefined) return <div style={DBZ_NOTE}>Your renewals load with the analytics rollup…</div>;
  if (live && renewals === null) return <div style={DBZ_NOTE}>Couldn't read your subscriptions just now. Nothing is lost; reload to try again.</div>;
  const rows = live ? renewals : dbzDemoRenewals();
  if (!rows.length) return <div style={DBZ_NOTE}>No one renews in the next 7 days.</div>;
  const unchecked = rows.some((r) => r.ending == null);
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "baseline", padding: "12px 0", borderBottom: i < rows.length - 1 ? DBZ_RULE : 0 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 14 }}>{r.name}</div>
            <div style={{ fontSize: 12, color: r.ending ? DBZ_RED : r.ending == null ? DBZ_AMBER : DBZ_INK50, marginTop: 2 }}>
              {r.ending ? "Cancelled · ends " + dbzDay(r.dueAt) : r.ending == null ? dbzDay(r.dueAt) + " · not checked with Stripe" : dbzDay(r.dueAt) + " · " + dashMoney(r.priceCents) + " a month"}
            </div>
          </div>
          <div style={{ fontFamily: serif, fontSize: 21, fontVariantNumeric: "tabular-nums", color: r.ending === false ? DBZ_INK : DBZ_INK50, textDecoration: r.ending ? "line-through" : "none" }}>{dashMoney(r.netCents)}</div>
        </div>
      ))}
      <div style={{ ...DBZ_NOTE, marginTop: 8 }}>
        Net to you, after Shape's fee.{unchecked ? " Some couldn't be checked with Stripe, so they aren't counted above." : ""}
      </div>
    </div>
  );
}
function dbzRenewalsHead(live, renewals) {
  // coachForecast.js `renewalsSum`, which the app's page reads too: only a confirmed renewal
  // counts, and none checked (Stripe down, or no key on a preview) is no total, not "0 clients · $0".
  const CF = window.CoachForecast;
  const sum = CF ? CF.renewalsSum(live ? renewals : dbzDemoRenewals()) : null;
  if (!sum) return null;
  return sum.count + (sum.count === 1 ? " client · " : " clients · ") + dashMoney(sum.netCents) + " net";
}

// ── Money: net a month, the last 13 weeks ────────────────────────────────────
function DbzNetWeeksZone({ live, trajectory }) {
  const [hover, setHover] = React.useState(null);
  const traj = live ? trajectory : dbzDemoTrajectory();
  if (live && !traj) return <div style={DBZ_NOTE}>{trajectory === undefined ? "Loads with the analytics rollup…" : "Couldn't read your subscriptions just now. Nothing is lost; reload to try again."}</div>;
  const buckets = dbzBuckets(traj, "90d");
  const hb = hover != null ? buckets[hover] : null;
  return (
    <div style={{ position: "relative" }}>
      <DbzChart buckets={buckets} series={[{ key: "mrrNetCents", color: DBZ_T_TEAL }]} unit="$" hover={hover} onHover={setHover} fmt={dashMoney} />
      {hb && (
        <div style={{ position: "absolute", top: 4, ...(hover < buckets.length / 2 ? { right: 8 } : { left: 52 }), pointerEvents: "none", background: "rgba(var(--sh-ground2-rgb, 20,17,14),0.96)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderRadius: 6, padding: "8px 11px" }}>
          <div style={{ ...DBZ_LBL, marginBottom: 4 }}>Week of {hb.label}</div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 12, color: DBZ_T_INK, fontWeight: 700 }}>{dashMoney(hb.mrrNetCents)} net a month · {hb.active} clients</div>
        </div>
      )}
    </div>
  );
}

// ── Retention: what a client is worth ────────────────────────────────────────
function DbzLifetimeZone({ base }) {
  const CF = window.CoachForecast;
  if (!base || base.state === "loading") return <div style={DBZ_NOTE}>Loads with the analytics rollup…</div>;
  if (base.state !== "ready") return <div style={DBZ_NOTE}>Couldn't read your subscriptions just now. Nothing is lost; reload to try again.</div>;
  const perClient = base.clients > 0 ? base.mrrNetCents / base.clients : null;
  if (base.pace.unread) return <div style={DBZ_NOTE}>Couldn't read your subscription history just now, and the average stay is measured from it. Nothing is lost; reload to try again.</div>;
  if (base.pace.churn == null || perClient == null) return <div style={DBZ_NOTE}>This fills in after a month with clients: how long a client stays with you on average, and what that's worth.</div>;
  if (base.pace.churn === 0) return <div style={DBZ_NOTE}>No one has left {dbzPaceWhen(base.pace)}, so there isn't an average stay to measure yet.</div>;
  const lt = CF.lifetime({ netPerClientCents: perClient, churn: base.pace.churn });
  return (
    <div>
      <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: DBZ_INK50 }}>
        A client stays about <b style={{ color: DBZ_INK, fontWeight: 600 }}>{dbzMonthsWord(Math.round(lt.months))}</b> on average, so each one is worth about <b style={{ color: DBZ_INK, fontWeight: 600 }}>{dashMoney(lt.valueCents)}</b> to you.
      </p>
      <div style={{ ...DBZ_NOTE, marginTop: 6 }}>From {dbzPct(dbzChurnPct(base.pace.churn))} of clients leaving a month {dbzPaceWhen(base.pace)}, and {dashMoney(perClient)} net a client a month.</div>
    </div>
  );
}

// ── Growth: the waiting list, in money ───────────────────────────────────────
// /api/coach/capacity `waiting` (people still waiting, not invited). They are Shape members, so
// they found the coach here: each one nets the listing price less Shape's 15%.
// ⚠ ONLY THE LISTING PRICE VALUES THEM (Codex, #2394). This was handed the Plan's starting rate,
// which falls back to the clients' average or a default when the listing price is unread or unset,
// and printed that as what these members would pay. Without a price, `priceNote` says why there's
// no figure.
function DbzWaitlistZone({ live, waiting, rateCents, priceNote = null }) {
  const CF = window.CoachForecast;
  const n = live ? waiting : 3;
  if (n === undefined) return <div style={DBZ_NOTE}>Loads with your listing…</div>;
  if (n == null) return <div style={DBZ_NOTE}>Couldn't read your waiting list just now.</div>;
  if (!n) return <div style={DBZ_NOTE}>No one is waiting. When you mark your listing full on your Profile, members can join a waiting list here.</div>;
  const net = CF && rateCents ? CF.earn({ clients: n, priceCents: rateCents, byoShare: 0 }).netCents : null;
  return (
    <p style={{ margin: 0, fontSize: 15, lineHeight: 1.6, color: DBZ_INK50 }}>
      <b style={{ color: DBZ_INK, fontWeight: 600 }}>{n === 1 ? "1 person is" : n + " people are"}</b> waiting to join you.
      {net != null && <React.Fragment> If {n === 1 ? "they join" : "they all join"} at {dashMoney(rateCents)} a month, that's about <b style={{ color: DBZ_INK, fontWeight: 600 }}>{dashMoney(net)} a month</b> to you.</React.Fragment>}
      {net == null && priceNote && <React.Fragment> {priceNote}</React.Fragment>}
    </p>
  );
}

// ── Not in the marketplace yet ───────────────────────────────────────────────
// A coach's listing is hidden from the marketplace until it has a monthly price, active payouts
// and a photo (listing_ready, 2026-10-12). Only the approval email said so; this says it where
// the payouts are, and links to the Profile page, where the rates and photos are set
// (/api/coach/listing, the same route the Profile page's Rates card reads).
const DBZ_LISTING_STEP = { price: "your monthly rate", payouts: "payouts set up (below)", photo: "a photo" };
function DbzListingNotice({ listing, role }) {
  // A listing staff suspended (/admin): the steps would not bring it back, so they are not shown.
  // Owner, 2026-10-13: "suspended until futher review".
  if (listing.suspended) {
    return (
      <div role="status" className="dash-plate" style={{ "--dac": DBZ_AMBER, borderColor: "rgba(216,162,58,0.45)", padding: "14px 18px", marginBottom: 16 }}>
        <span className="dash-eyebrow" style={{ color: DBZ_AMBER }}>Suspended</span>
        <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: DBZ_INK }}>Your listing is suspended until further review. Members can't find or subscribe to you while it is.</p>
      </div>
    );
  }
  const steps = (listing.missing || []).map((k) => DBZ_LISTING_STEP[k]).filter(Boolean);
  const line = steps.length <= 1 ? steps.join("") : steps.slice(0, -1).join(", ") + " and " + steps[steps.length - 1];
  // Inside the dashboard shell the stub's own #profile route, not a second page load (pageShell.jsx).
  const stub = role === "nutritionist" ? "NutritionistProfile.html" : "TrainerProfile.html";
  const profile = typeof window.dashShellHref === "function" ? window.dashShellHref(stub) : stub;
  return (
    <div role="status" className="dash-plate" style={{ "--dac": DBZ_AMBER, borderColor: "rgba(216,162,58,0.45)", padding: "14px 18px", marginBottom: 16 }}>
      <span className="dash-eyebrow" style={{ color: DBZ_AMBER }}>Not in the marketplace yet</span>
      <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.5, color: DBZ_INK }}>
        {steps.length
          ? <React.Fragment>Members can't find or subscribe to you until your listing has {line}. </React.Fragment>
          : <React.Fragment>Your listing isn't in the marketplace yet. </React.Fragment>}
        <a href={profile} style={{ color: DBZ_TEAL }}>Set your rates and photo on your Profile →</a>
      </p>
    </div>
  );
}

// The Business page's sections, hoisted so the remembered choice's allowlist is derived
// from the list the switch renders.
const DBZ_SECTIONS = [["overview", "Overview"], ["money", "Money"], ["plan", "Plan"], ["growth", "Growth"], ["retention", "Retention"]];
const DBZ_SECTION_KEYS = DBZ_SECTIONS.map((x) => x[0]);

// ── The page ─────────────────────────────────────────────────────────────────
function CoachBusinessPage({ role }) {
  const cfg = DBZ_ROLES[role];
  const { today: live, source } = useDashboard(role);
  const [extra, setExtra] = React.useState(null); // /api/{role}/analytics payload
  // How the analytics read ended: "pending"; "ok" (the payload is in `extra`); "preview" (signed
  // out, a 401 or 403, or signed in without this role, which the route answers with okKey false);
  // or "failed" (a 5xx, a timeout, a thrown fetch, an answer that isn't JSON).
  // ⚠ A FAILED ANALYTICS READ IS NOT STILL LOADING. A 500, a timeout or a thrown fetch left
  // `extra` null for good, so every zone below said it was loading forever; each has its own
  // "couldn't read" copy, which it now shows.
  const [analytics, setAnalytics] = React.useState("pending");

  React.useEffect(() => {
    let on = true;
    const asPreview = { preview: true };
    // ?renewals=1: this page shows this week's renewals, each checked with Stripe (the route skips them otherwise).
    fetch(cfg.api + "?renewals=1", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.status === 401 || r.status === 403 ? asPreview : r.ok ? r.json() : null))
      .then((d) => {
        if (!on) return;
        if (d === asPreview || (d && d[cfg.okKey] === false)) setAnalytics("preview");
        else if (d && d[cfg.okKey]) { setExtra(d); setAnalytics("ok"); }
        else setAnalytics("failed");
      })
      .catch(() => { if (on) setAnalytics("failed"); });
    return () => { on = false; };
  }, [role]);

  // ⚠ THE PREVIEW IS ONLY FOR A DEMO VIEWER, AND AN OUTAGE IS NOT ONE (Codex, #2394). Live was "a
  // feed has landed", so while the reads were pending a signed-in coach was shown the preview's
  // renewals, payouts and waiting list as their own, with no band. Then it was "the dashboard
  // resolved a demo", but useDashboard falls back to the demo whenever the roster read fails,
  // signed out and outage alike: a coach whose roster, dashboard and analytics reads all failed
  // was shown the preview's payouts, renewals, trajectory and plan as their own. The analytics
  // answer tells the two apart. Demo figures (and the band) need the dashboard's demo AND an
  // analytics answer that the viewer is signed out or not a coach; until both have answered the
  // page is loading, and a failed read is an unread state.
  const preview = !live && !extra && source === "demo" && analytics === "preview";
  const isLive = !preview;
  // The analytics read is over with nothing to show: it failed, or it answered "preview" to a
  // viewer the dashboard did not resolve as one. (Before the dashboard has answered, still loading.)
  const extraFailed = analytics === "failed" || (analytics === "preview" && !preview && source != null);
  // What a zone reads from the payload: the value once it has landed, null (unread) when the read
  // failed, undefined while it loads.
  const fromExtra = (k) => (extra ? extra[k] : extraFailed ? null : undefined);
  // The coach's own listing (live only): the notice above the plates when it is not ready.
  const [listing, setListing] = React.useState(null);
  // Whether the listing read has finished (either way): the Plan tab starts from its price, so it
  // waits for the answer rather than starting from a fallback and jumping when the price lands.
  const [listingRead, setListingRead] = React.useState(false);
  // A failed listing read (a 500, or no answer) is not "no listing price yet": the Plan says so.
  const [listingFailed, setListingFailed] = React.useState(false);
  React.useEffect(() => {
    if (!isLive) return undefined;
    let on = true;
    fetch("/api/coach/listing", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!on) return; if (d) setListing(((d.listings || []).find((l) => l.role === role)) || null); else setListingFailed(true); })
      .catch(() => { if (on) setListingFailed(true); })
      .then(() => { if (on) setListingRead(true); });
    return () => { on = false; };
  }, [role, isLive]);
  // The waiting list (Growth): how many members are waiting, from the capacity route.
  // undefined while it loads, null when it could not be read.
  const [waiting, setWaiting] = React.useState(undefined);
  React.useEffect(() => {
    if (!isLive) return undefined;
    let on = true;
    fetch("/api/coach/capacity", { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!on) return;
        const l = d && Array.isArray(d.listings) ? d.listings.find((x) => x.role === role) : null;
        setWaiting(l && typeof l.waiting === "number" ? l.waiting : null);
      })
      .catch(() => { if (on) setWaiting(null); });
    return () => { on = false; };
  }, [role, isLive]);
  const stripe = extra && extra.stripe ? extra.stripe : null;
  // Outcomes: the live rollup verbatim (the route always returns the full
  // shape), the demo set ONLY under the band — a live viewer with a failed
  // analytics fetch gets an honest loading state, never demo numbers.
  const cp = extra ? (extra.clientProgress || {}) : (!isLive ? DBZ_DEMO_OUTCOMES[role] : null);

  // Sidebar money card: REAL balance when connected, "—" until then, demo
  // numbers only under the band. With no analytics yet, or none to be had, it says which: an
  // unread Stripe summary is not "payouts aren't connected".
  const payoutCard = !isLive
    ? (role === "nutritionist" ? nutriPayoutCard : trainerPayoutCard)
    : !extra
      ? { label: "PAYOUTS", amount: "—", sub: extraFailed ? "couldn't read your payouts just now" : "loads with the analytics rollup" }
    : stripe && stripe.connected && stripe.balanceCents != null
      ? { label: "BALANCE · AVAILABLE", amount: dashMoney(stripe.balanceCents), sub: dbzScheduleLine(stripe.schedule) || "Stripe connected" }
      : stripe && stripe.connected && stripe.error
        ? { label: "PAYOUTS", amount: "—", sub: "couldn't reach Stripe just now" }
        : { label: "PAYOUTS", amount: "—", sub: "connects when payouts go live" };

  // ── A FIXED PAGE IN FOUR SECTIONS (owner, 2026-10-15: "least overwhelming as possible,
  // easy to navigate", the builder removed "like Programs"). Nine cards on one board was a
  // 2,700px page; now a switch shows one question at a time — how the practice is doing,
  // the money, where clients come from, and who stays — and remembers the one a coach
  // reads. The two-up rows collapse to one column below 1000px (`.dash-cols`).
  const prefs = useRememberedChoices(source === "live");
  const [section, setSection] = useRememberedChoice(prefs, "businessSection:" + role, DBZ_SECTION_KEYS, "overview");
  // A link that names a section opens on it (the Goal tab's "Plan the next 12 months" sends
  // #business?section=plan). It counts as the coach's choice, as a tap on that tab would.
  React.useEffect(() => {
    const asked = typeof dashRouteParam === "function" ? dashRouteParam("section") : null;
    if (asked && DBZ_SECTION_KEYS.includes(asked)) setSection(asked);
  }, []);
  const plate = (accent, children, extraStyle) => (
    <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": accent, paddingLeft: 24, ...(extraStyle || {}) }}>{children}</div>
  );
  const head = (label, accent, right) => (
    <React.Fragment>
      {right
        ? <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className="dash-eyebrow" style={accent ? { color: accent } : undefined}>{label}</span>
            {right}
          </div>
        : <span className="dash-eyebrow" style={accent ? { color: accent } : undefined}>{label}</span>}
      <div className="dash-ledger" style={{ ...(accent ? { "--dac": accent } : {}), marginTop: 9, marginBottom: 12 }} />
    </React.Fragment>
  );

  const pair = (left, right) => (
    <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>{left}{right}</div>
  );
  const quiet = (text) => (
    <div style={{ border: "1px dashed var(--sh-line2, #413d38)", borderRadius: 10, padding: "18px 20px", fontSize: 13, color: DBZ_INK50, lineHeight: 1.5 }}>{text}</div>
  );

  const trajectory = plate(DBZ_TEAL, <React.Fragment>
        {head("Practice · trajectory", null, (
          <span style={{ display: "inline-flex", alignItems: "center", gap: 10, marginLeft: "auto" }}>
            <span style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50 }}>active clients · joined vs left · revenue over time</span>
            {/* ⚠ EXPORTED BY MONTH, WHILE THE PLATE IS DRAWN BY WEEK, and that is a
                deliberate re-bucketing rather than a mismatch: a coach's accountant
                works in months. `revenueRows` assigns a week to the month its MONDAY
                falls in and carries the headcount as the LAST week of the month rather
                than a sum — summing a headcount across four weeks would report four
                times the practice. Joins and departures are events and do sum.
                ⚠ AND THE BUTTON IS OFF WHEN THE TRAJECTORY COULD NOT BE READ, not just
                when the viewer is a preview: an export built from a null series would
                be a header row and nothing under it, which reads as "the practice
                earned nothing" rather than as "we could not read it". */}
            {/* ⚠ THE EXPORT STILL RUNS WITH A FAILED PURCHASES READ, and that is
                deliberate: the subscription half is real and a coach doing their books
                should not lose it because one leg was unreadable. What must not happen
                is the one-time columns reporting 0.00 — `revenueRows` leaves them and
                Total net EMPTY when the route says the leg is unknown. */}
            <DashExportButton kind="revenue" label="monthly revenue"
              live={isLive && !!(extra && extra.trajectory)}
              build={() => window.DashExport.revenueCsv(extra.trajectory)} />
          </span>
        ))}
        <DbzTrajectoryZone live={isLive} trajectory={extra && extra.trajectory} role={role} loading={isLive && !extra && !extraFailed} />
      </React.Fragment>);

  // ── Money (design E): your money and this week's renewals side by side, the last 13 weeks under.
  const demoLast = !isLive ? dbzDemoTrajectory().weeks.slice(-1)[0] : null;
  const moneyMetrics = isLive ? (extra ? dbzToday(extra) : null) : { mrrNetCents: demoLast.mrrNetCents, mrrGrossCents: demoLast.mrrGrossCents };
  const stripeLink = (!isLive || (stripe && stripe.connected))
    ? <a href={isLive ? DBZ_STRIPE_DASHBOARD : undefined} target="_blank" rel="noopener noreferrer" style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_TEAL, textDecoration: "none", opacity: isLive ? 1 : 0.6 }}>Open your Stripe ↗</a>
    : null;
  const payouts = plate(DBZ_GREEN, <React.Fragment>
        {head("Your money", DBZ_GREEN, stripeLink)}
        <DbzPayoutsZone live={isLive} stripe={extra ? stripe : fromExtra("stripe")} providerId={extra && extra.providerId} role={role} metrics={moneyMetrics} />
      </React.Fragment>);
  const renewalsHead = dbzRenewalsHead(isLive, fromExtra("renewals"));
  const renewals = plate(DBZ_RED, <React.Fragment>
        {head("Renewing this week", DBZ_RED, renewalsHead ? <span style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50 }}>{renewalsHead}</span> : null)}
        <DbzRenewalsZone live={isLive} renewals={fromExtra("renewals")} />
      </React.Fragment>);
  const netWeeks = plate(DBZ_TEAL, <React.Fragment>
        {head("Net a month · last 13 weeks", null, moneyMetrics && moneyMetrics.mrrNetCents != null ? <span style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50 }}>from your subscriptions · {dashMoney(moneyMetrics.mrrNetCents)} now</span> : null)}
        <DbzNetWeeksZone live={isLive} trajectory={fromExtra("trajectory")} />
      </React.Fragment>);

  // ── Plan (design E): what clients earn you, then the next 12 months.
  // ⚠ THE PACE IS READ AT ONE MOMENT PER VISIT. Its rates are counts over the days to now, so
  // read at each render they change by the millisecond, the key below changes with them, and
  // every re-render (a tab's remembered choice saving, a late fetch landing) remounted both
  // zones and threw away the coach's sliders and typed values.
  const [planNow] = React.useState(() => Date.now());
  const planBase = dbzPlanBase({ live: isLive, extra, failed: extraFailed, listing, listingRead, listingFailed, now: planNow });
  const planKey = planBase.state === "ready" ? JSON.stringify([planBase.clients, planBase.mrrNetCents, planBase.rateCents, planBase.byoShare, planBase.pace]) : planBase.state;
  const planWait = planBase.state === "loading" ? "Your numbers load with the analytics rollup…" : "Couldn't read your subscriptions just now, and the plan starts from them. Nothing is lost; reload to try again.";
  const earnPlate = plate(DBZ_TEAL, <React.Fragment>
        {head("What clients earn you", null, <span style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50 }}>after Shape's fee · before card processing</span>)}
        {planBase.state === "ready" ? <DbzEarnZone key={planKey} base={planBase} /> : <div style={DBZ_NOTE}>{planWait}</div>}
      </React.Fragment>);
  const planPlate = plate(DBZ_TEAL, <React.Fragment>
        {head("Plan the next 12 months", DBZ_TEAL)}
        {planBase.state === "ready" ? <DbzPlanZone key={planKey} base={planBase} /> : <div style={DBZ_NOTE}>{planWait}</div>}
      </React.Fragment>);

  const funnel = plate(DBZ_TEAL, <React.Fragment>
        {head("Marketplace funnel · views → consults → signed")}
        {/* The panel draws the preview's funnel when it has no feed, so a viewer who is not a
            preview and has no feed (the reads still out, or failed) is told which, never shown it.
            ⚠ ONLY A DEMO WAITS ON THE ANALYTICS. useDashboard sets source "live" once the roster
            and dashboard reads have both settled, so a live coach with no feed has a failed feed,
            and no analytics answer can make them a preview: waiting on that read (several seconds
            with ?renewals=1, or forever if it never settles) said "loading" over a failed read. */}
        {!isLive || live
          ? <DashFunnelPanel live={live} />
          : <div style={DBZ_NOTE}>{source == null || (source === "demo" && analytics === "pending") ? "Your funnel is loading…" : "Couldn't read your funnel just now. Nothing is lost; reload to try again."}</div>}
      </React.Fragment>);

  // Who left counts over the pace "What a client is worth" reads, at the same moment (planNow): the
  // plan's own when it is ready, else the trajectory's straight (the listing read still out), else
  // none, and the zone falls back to the last 90 days.
  const churnPace = planBase.state === "ready" ? planBase.pace
    : isLive && extra && extra.trajectory && window.CoachForecast ? window.CoachForecast.paceFrom(extra.trajectory, planNow) : null;
  const churn = plate(DBZ_RED, <React.Fragment>
        {head("Churn · who left & why", DBZ_RED)}
        <DbzChurnZone live={isLive} churn={fromExtra("churn")} pace={churnPace} now={planNow} />
      </React.Fragment>);

  const byo = plate(DBZ_TEAL, <React.Fragment>
        {head("Bring your clients · 0% commission")}
        <DbzBringClientsZone live={isLive} role={role} providerId={extra && extra.providerId} />
      </React.Fragment>);

  // The waiting list is valued at the listing price alone (the preview's at its sample rate): the
  // Plan's fallbacks are where a slider starts, not what these members would pay.
  const waitRateCents = !isLive ? (planBase.state === "ready" ? planBase.rateCents : null) : dbzListedCents(listing);
  const waitPriceNote = !isLive || waitRateCents != null || !listingRead ? null
    : listingFailed ? "Couldn't read your listing price just now, so they aren't valued here."
    : "Set a monthly price on your Profile to see what they'd bring in.";
  const waitlist = plate(DBZ_TEAL, <React.Fragment>
        {head("Your waiting list")}
        <DbzWaitlistZone live={isLive} waiting={waiting} rateCents={waitRateCents} priceNote={waitPriceNote} />
      </React.Fragment>);

  const lifetime = plate(cfg.accent, <React.Fragment>
        {head("What a client is worth", cfg.accent)}
        <DbzLifetimeZone base={planBase} />
      </React.Fragment>);

  const origin = plate(cfg.accent, <React.Fragment>
        {head("Your roster · who found whom", cfg.accent)}
        <DbzOriginZone live={isLive} byOrigin={fromExtra("byOrigin")} />
      </React.Fragment>);

  // ⚠ NO ROLLUP, NO OUTCOMES CARD. DbzOutcomesZone is null-safe as a floor, but a card drawn
  // with no rollup claims a 30-day outcome nobody measured; the note says why it is not there.
  const outcomes = cp
    ? plate(cfg.accent, <React.Fragment>
        {head("The product · roster outcomes, last 30 days", cfg.accent)}
        <DbzOutcomesZone role={role} cp={cp} />
      </React.Fragment>)
    : quiet(extraFailed ? "Couldn't read your roster outcomes just now. Nothing is lost; reload to try again." : "Roster outcomes load with the analytics rollup.");

  const sections = {
    overview: trajectory,
    money: <React.Fragment>{pair(payouts, renewals)}{netWeeks}</React.Fragment>,
    plan: <React.Fragment>{earnPlate}{planPlate}</React.Fragment>,
    growth: <React.Fragment>{pair(funnel, origin)}{pair(byo, waitlist)}</React.Fragment>,
    retention: <React.Fragment>{lifetime}{outcomes}{churn}</React.Fragment>,
  };

  return (
    <React.Fragment>
      {preview && <DashDemoBand />}
      <DashPage
        tourHero="hero-business"
        navItems={cfg.nav("business")}
        payoutCard={payoutCard}
        eyebrow="REVENUE · PAYOUTS · PLAN"
        title="Business"
        subtitle="The money side, told straight: real subscription revenue and Stripe payouts, and a plan built from your own price, clients and churn."
      >
        {isLive && listing && !listing.ready && <DbzListingNotice listing={listing} role={role} />}
        <div style={{ marginBottom: 16 }}>
          <DashSegmented label="Business sections" value={section} onChange={setSection}
            items={DBZ_SECTIONS.map(([key, label]) => ({ key, label }))} />
        </div>
        <div role="tabpanel" aria-label={(DBZ_SECTIONS.find((x) => x[0] === section) || DBZ_SECTIONS[0])[1]} style={{ display: "grid", gap: 16 }}>
          {sections[section] || sections.overview}
        </div>
      </DashPage>
    </React.Fragment>
  );
}

Object.assign(window, { CoachBusinessPage, DbzGoalEarn, DbzListingNotice, DbzPayoutsZone, DbzChurnZone, DbzOutcomesZone, DbzBringClientsZone, DbzOriginZone });
