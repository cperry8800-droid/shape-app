// Business v2 — the old Analytics pages (Trainer/NutritionistAnalytics.html)
// MIGRATED into one role-parameterized Business page that also absorbs
// payouts (dashboard-v2 spec step). Zones: revenue trend (90d, real
// subscriber adds), payout schedule + history (REAL Stripe Connect data the
// analytics API already returned but no page ever rendered), the marketplace
// funnel with its benchmark, a churn list with exit reasons, and the migrated
// roster-outcomes section (the product the business sells).
//
// HONEST DATA RULE — hardest on this page: every dollar is either a real
// Stripe payout, a real available balance, or MRR derived from real
// subscription rows (labeled as such). When payouts aren't connected, money
// reads "—" with "connects when payouts go live" and a real Set-up CTA
// (Stripe Connect onboarding) — never plausible-looking fake money. Demo
// numbers exist ONLY under the demo band.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals.js →
// dashData.jsx → dashToday.jsx (DashGrowthPanel/DashFunnelPanel/band) → this.

const DBZ_INK50 = "rgba(242,237,228,0.55)";
const DBZ_MONO = "'JetBrains Mono', monospace";
const DBZ_TEAL = "#2ee0c4";
const DBZ_GREEN = "#7bbf5a";
const DBZ_AMBER = "#d8a23a";
const DBZ_RED = "#e0644b";
const DBZ_INK = "#f2ede4";        // the dashboard's fixed-dark cream ink
const DBZ_TEAL_INK = "#06231f";   // ink ON a teal-filled control

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
// Roster outcomes — migrated verbatim from the old Analytics pages' mocks.
const DBZ_DEMO_OUTCOMES = {
  trainer: {
    get activeClients() { return dbzDemoRosterSize(); },   // was a literal 34 — see V5 above
    workouts30d: 412, workouts7d: 96, prs30d: 41, avgAdherencePct: 88,
    roster: [
      { name: "Alex Rivera", workouts30d: 18, workouts7d: 4, weightChangeLb: -6.2, prs30d: 3 },
      { name: "Casey Morgan", workouts30d: 16, workouts7d: 4, weightChangeLb: -3.4, prs30d: 2 },
      { name: "Sam Patel", workouts30d: 15, workouts7d: 3, weightChangeLb: -1.8, prs30d: 1 },
      { name: "Riley Kim", workouts30d: 14, workouts7d: 4, weightChangeLb: -2.6, prs30d: 2 },
      { name: "Drew Park", workouts30d: 12, workouts7d: 2, weightChangeLb: 1.2, prs30d: 0 },
      { name: "Quinn Choi", workouts30d: 11, workouts7d: 3, weightChangeLb: -0.8, prs30d: 1 },
    ],
  },
  nutritionist: {
    get activeClients() { return dbzDemoRosterSize(); },   // was a literal 28
    proteinAdherencePct: 78, avgLogsPerClient: 22, totalDaysLogged: 612,
    roster: [
      { name: "Casey Morgan", daysLogged30d: 28, avgProteinG: 168, weightChangeLb: -5.2 },
      { name: "Riley Kim", daysLogged30d: 26, avgProteinG: 152, weightChangeLb: -3.4 },
      { name: "Alex Rivera", daysLogged30d: 25, avgProteinG: 175, weightChangeLb: -2.8 },
      { name: "Sam Patel", daysLogged30d: 22, avgProteinG: 138, weightChangeLb: 1.4 },
      { name: "Drew Park", daysLogged30d: 19, avgProteinG: 142, weightChangeLb: -1.2 },
      { name: "Quinn Choi", daysLogged30d: 17, avgProteinG: 128, weightChangeLb: -0.6 },
    ],
  },
};

const DBZ_ROLES = {
  trainer: {
    accent: "#c0533b",
    nav: (k) => trainerNavItems(k),
    api: "/api/trainer/analytics",
    okKey: "isTrainer",
    outcomeCards: (cp) => [
      { k: String(cp.activeClients ?? 0), l: "Active clients", sub: "with an active plan" },
      { k: String(cp.workouts30d ?? 0), l: "Workouts logged", sub: (cp.workouts7d ?? 0) + " this week" },
      { k: (cp.avgAdherencePct ?? 0) + "%", l: "Avg adherence", sub: "vs 4 sessions/wk target" },
      { k: String(cp.prs30d ?? 0), l: "PRs hit", sub: "across roster, last 30d" },
    ],
    consistentLabel: "Most consistent · 30d",
    consistentValue: (r) => ({ n: r.workouts30d || 0, unit: "workouts" }),
    consistentSort: (a, b) => (b.workouts30d || 0) - (a.workouts30d || 0),
  },
  nutritionist: {
    accent: "#d8a23a",
    nav: (k) => nutriNavItems(k),
    api: "/api/nutritionist/analytics",
    okKey: "isNutritionist",
    outcomeCards: (cp) => [
      { k: String(cp.activeClients ?? 0), l: "Active clients", sub: "with an active plan" },
      { k: String(cp.avgLogsPerClient ?? 0), l: "Avg log days", sub: "per client, last 30d" },
      { k: (cp.proteinAdherencePct ?? 0) + "%", l: "Protein adherence", sub: "days ≥ 120g across roster" },
      { k: String(cp.totalDaysLogged ?? 0), l: "Total log days", sub: "across roster, 30d" },
    ],
    consistentLabel: "Most consistent loggers · 30d",
    consistentValue: (r) => ({ n: r.daysLogged30d || 0, unit: "days" }),
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

function DbzPayoutsZone({ live, stripe, providerId, role }) {
  const [linking, setLinking] = React.useState(false);
  const data = live ? stripe : dbzDemoPayouts();
  const connected = live ? !!(stripe && stripe.connected && stripe.status !== "error") : true;
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

  if (live && !connected) {
    return (
      <div>
        <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
          {[["Available balance"], ["Next payout"], ["Paid out · all time"]].map(([l]) => (
            <div key={l}>
              <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1, color: DBZ_INK50 }}>—</div>
              <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 5 }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55, margin: "12px 0" }}>
          This zone connects when payouts go live — link a Stripe account and every number here turns real: balance, schedule, and the full payout history.
        </div>
        {providerId != null && (
          <button onClick={startOnboarding} disabled={linking} style={{ fontFamily: DBZ_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#06231f", background: DBZ_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: "pointer", opacity: linking ? 0.6 : 1, clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>
            {linking ? "Opening Stripe…" : "Set up payouts →"}
          </button>
        )}
      </div>
    );
  }

  const paidTotal = (data.payouts || []).filter((p) => p.status === "paid").reduce((s, p) => s + p.amountCents, 0);
  const inTransit = (data.payouts || []).find((p) => p.status === "in_transit" || p.status === "pending");
  return (
    <div>
      <div style={{ display: "flex", gap: 26, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1 }}>{data.balanceCents != null ? dashMoney(data.balanceCents) : "—"}</div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 5 }}>Available balance</div>
        </div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1 }}>{inTransit ? dashMoney(inTransit.amountCents) : data.balanceCents != null ? dashMoney(data.balanceCents) : "—"}</div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 5 }}>{inTransit ? "In transit · arrives " + dbzDate(inTransit.arrivalDate) : "Next payout · est."}</div>
        </div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1 }}>{dashMoney(paidTotal)}</div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 5 }}>Paid · last {(data.payouts || []).length} payouts</div>
        </div>
      </div>
      {dbzScheduleLine(data.schedule) && (
        <div style={{ fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.06em", color: DBZ_TEAL, marginTop: 11 }}>{dbzScheduleLine(data.schedule)}</div>
      )}
      <div style={{ marginTop: 12 }}>
        {(data.payouts || []).length ? (data.payouts || []).map((p, i) => (
          <div key={p.id || i} style={{ display: "grid", gridTemplateColumns: "1fr auto auto", gap: 12, alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
            <span style={{ fontFamily: DBZ_MONO, fontSize: 10, color: DBZ_INK50 }}>{dbzDate(p.arrivalDate || p.created)}</span>
            <DashPill c={p.status === "paid" ? DBZ_GREEN : p.status === "failed" ? DBZ_RED : DBZ_AMBER}>{(p.status || "pending").replace("_", " ")}</DashPill>
            <span style={{ fontFamily: serif, fontSize: 16 }}>{dashMoney(p.amountCents)}</span>
          </div>
        )) : (
          <div style={{ fontSize: 12.5, color: DBZ_INK50, padding: "10px 0" }}>Connected — your first payout lands here on the schedule above.</div>
        )}
      </div>
    </div>
  );
}

// ── Churn zone — who left, when, and why (honest about the why) ─────────────
function DbzChurnZone({ live, churn }) {
  const rows = live ? (Array.isArray(churn) ? churn : []) : DBZ_DEMO_CHURN;
  const lostCents = rows.reduce((s, r) => s + (r.priceCents || 0), 0);
  if (live && !rows.length) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>No cancellations on record — churn rows appear here the day one lands, with the MRR it took.</div>;
  }
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 4 }}>
        <span style={{ fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DBZ_INK50 }}>{rows.length} departed · recent</span>
        {lostCents > 0 && <span style={{ fontFamily: DBZ_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.08em", color: DBZ_RED }}>−{dashMoney(lostCents)} MRR</span>}
      </div>
      {rows.map((r, i) => {
        const tenure = r.startedAt && r.endedAt ? dbzMonthsBetween(r.startedAt, r.endedAt) : null;
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "start", padding: "10px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.name}</div>
              <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.06em", textTransform: "uppercase", color: DBZ_INK50, marginTop: 3 }}>
                {r.endedAt ? "ended " + dbzDate(r.endedAt) : "ended —"}{tenure ? " · " + tenure + " mo client" : ""}
              </div>
              <div style={{ fontSize: 12, color: r.reason ? "rgba(242,237,228,0.78)" : DBZ_INK50, fontStyle: r.reason ? "normal" : "italic", lineHeight: 1.45, marginTop: 4 }}>
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
const DBZ_DEMO_ORIGIN = [
  { name: "Casey Morgan", kind: "subscription", origin: "coach_link", feeBps: 0, priceCents: 22000 },
  { name: "Alex Rivera", kind: "subscription", origin: "marketplace", feeBps: 1500, priceCents: 18000 },
  { name: "Riley Kim", kind: "subscription", origin: "coach_invite", feeBps: 0, priceCents: 16000 },
  { name: "Drew Park", kind: "purchase", origin: "coach_link", feeBps: 0, priceCents: 9000 },
  { name: "Sam Patel", kind: "subscription", origin: "marketplace", feeBps: 1500, priceCents: 20000 },
];
const DBZ_BYO_PITCH = "Clients you bring pay no Shape commission — you keep your full rate. They join Shape as members at $5/mo. Members already in your Shape waiting room count as Shape-found.";
function DbzBringClientsZone({ live, role, providerId }) {
  const [link, setLink] = React.useState(null); // null = generating / unavailable
  const [copied, setCopied] = React.useState(false);
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
          setLink("https://theshapecommunity.com/newdesign/MemberProfile.html?u=" + uid + "&ref=" + res.data);
        }
      } catch (e) { /* pre-migration / offline — the honest line below covers it */ }
    })();
    return () => { on = false; };
  }, [live, role, providerId]);
  const url = live ? link : "https://theshapecommunity.com/newdesign/MemberProfile.html?u=you&ref=…";
  const copyIt = async () => {
    if (!url || !live) return;
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); } catch (e) {}
  };
  const emailIt = () => {
    if (!url || !live) return;
    const body = "I’m coaching on Shape now — my programs, your logging, and our chat all live in one app. Join me here: " + url;
    window.location.href = "mailto:?subject=" + encodeURIComponent("Join me on Shape") + "&body=" + encodeURIComponent(body);
  };
  return (
    <div>
      <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.78)", lineHeight: 1.55 }}>{DBZ_BYO_PITCH}</div>
      {live && !link ? (
        <div style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50, marginTop: 12, lineHeight: 1.6 }}>
          Your ref-tagged link generates here once you're signed in and referrals are live.
        </div>
      ) : (
        <React.Fragment>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_TEAL, marginTop: 12, padding: "9px 10px", background: "rgba(46,224,196,0.06)", border: "1px solid rgba(46,224,196,0.18)", wordBreak: "break-all", lineHeight: 1.55, userSelect: "all" }}>
            {url}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button type="button" onClick={copyIt} style={{ fontFamily: DBZ_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_TEAL_INK, background: DBZ_TEAL, border: 0, borderRadius: 4, padding: "10px 16px", cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.5, clipPath: "polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 0 100%)" }}>
              {copied ? "Copied ✓" : "Copy link"}
            </button>
            <button type="button" onClick={emailIt} style={{ fontFamily: DBZ_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_INK, background: "transparent", border: "1px dashed rgba(242,237,228,0.25)", borderRadius: 4, padding: "10px 16px", cursor: live ? "pointer" : "default", opacity: live ? 1 : 0.5 }}>
              ✉︎ Email it
            </button>
          </div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DBZ_INK50, marginTop: 9 }}>
            Paste the raw URL anywhere — a text, an email signature, your Instagram bio. Anyone who opens it inside 30 days of subscribing counts as yours.
          </div>
        </React.Fragment>
      )}
    </div>
  );
}
function DbzOriginZone({ live, byOrigin }) {
  const rows = live ? (Array.isArray(byOrigin) ? byOrigin : []) : DBZ_DEMO_ORIGIN;
  if (live && !rows.length) {
    return <div style={{ fontSize: 12.5, color: DBZ_INK50, lineHeight: 1.55 }}>Origin labels land here as clients subscribe — "You brought" at your full rate, "Found you on Shape" at the marketplace fee.</div>;
  }
  // Commission status keys off the STORED fee, never off origin — this surface
  // is the fee pitch, and the row's rate is the billing truth.
  const isByo = (row) => row.feeBps === 0;
  const brought = rows.filter(isByo).length;
  return (
    <div>
      <div style={{ fontFamily: DBZ_MONO, fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DBZ_INK50, marginBottom: 4 }}>
        {brought} you brought · {rows.length - brought} found you on Shape
      </div>
      {rows.map((r, i) => {
        const byo = isByo(r);
        const feePct = Math.round((r.feeBps || 0) / 100 * 10) / 10;
        return (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, alignItems: "center", padding: "9px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
            <span style={{ fontSize: 13, fontWeight: 500, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</span>
            <span style={{ fontFamily: DBZ_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: byo ? DBZ_TEAL : DBZ_INK50, whiteSpace: "nowrap" }}>
              {byo ? "You brought" : "Found you on Shape"} · {feePct}% fee{r.kind === "purchase" ? " · one-time" : ""}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// ── Roster outcomes — the migrated Analytics content (what the business sells)
function DbzOutcomesZone({ role, cp }) {
  const cfg = DBZ_ROLES[role];
  const roster = cp.roster || [];
  const fmtWeight = (lb) => {
    if (lb == null) return "—";
    const r = Math.round(lb * 10) / 10;
    return (r > 0 ? "+" : r < 0 ? "−" : "") + Math.abs(r).toFixed(1) + " lb";
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
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
              <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name || "Client"}</span>
              <span style={{ fontFamily: serif, fontSize: 15, color: DBZ_TEAL }}>{fmtWeight(r.weightChangeLb)}</span>
            </div>
          )) : <div style={{ fontSize: 12, color: DBZ_INK50, padding: "8px 0" }}>No weight-loss trends yet.</div>}
        </div>
        <div>
          <div style={{ fontFamily: DBZ_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DBZ_INK50, marginBottom: 6 }}>{cfg.consistentLabel}</div>
          {consistent.length ? consistent.map((r, i) => {
            const v = cfg.consistentValue(r);
            return (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(242,237,228,0.05)" }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{r.name || "Client"}</span>
                <span style={{ fontFamily: serif, fontSize: 15 }}>{v.n} <span style={{ fontFamily: DBZ_MONO, fontSize: 9, color: DBZ_INK50, textTransform: "uppercase" }}>{v.unit}</span></span>
              </div>
            );
          }) : <div style={{ fontSize: 12, color: DBZ_INK50, padding: "8px 0" }}>No history yet.</div>}
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
const DBZ_T_TEAL = "#12a899";   // active · added · MRR
const DBZ_T_RUST = "#e0644b";   // ended
const DBZ_T_AMBER = "#b8892f";  // one-time purchases
const DBZ_T_SURFACE = "#1a1612";
const DBZ_T_GRID = "rgba(242,237,228,0.10)";
const DBZ_T_INK = "#f2ede4";

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
function dbzDemoRosterSize() {
  try {
    const n = DashSignals.buildMockClients(new Date()).length;
    return n > 0 ? n : 10;
  } catch (e) { return 10; }   // dashSignals not up yet — the ten it would have returned
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
    const gross = active * 18500 + (active % 3) * 1500;
    weeks.push({
      weekOf: new Date(monday.getTime() - i * 7 * 86400000).toISOString().slice(0, 10),
      active, added, ended,
      mrrGrossCents: gross, mrrNetCents: Math.round(gross * 0.88),
      oneTimeCents: rnd() < 0.3 ? 9000 * (1 + Math.floor(rnd() * 2)) : 0, oneTimeNetCents: 0,
    });
  }
  weeks.forEach((w) => { w.oneTimeNetCents = Math.round(w.oneTimeCents * 0.85); });
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
      const gross = w.active * 18500 + (w.active % 3) * 1500;
      w.mrrGrossCents = gross;
      w.mrrNetCents = Math.round(gross * 0.88);
    });
  }
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

// One small multiple. kind: "line" (value → area + line + endpoint) or "bars"
// (series: [{ key, color }] side by side per bucket), optionally with a line
// on the same axis (MRR over one-time). All series share ONE scale.
function DbzChart({ buckets, series, line, unit, hover, onHover, fmt }) {
  const W = 760, H = 150, padL = 44, padR = 16, padT = 12, padB = 24;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  const n = buckets.length;
  const vals = [];
  for (const b of buckets) { for (const s of series || []) vals.push(b[s.key] || 0); if (line) vals.push(b[line.key] || 0); }
  const ticks = dbzTicks(Math.max(...vals, 0), unit !== "$");
  const top = ticks[ticks.length - 1] || 1;
  const y = (v) => padT + plotH - (Math.max(0, v) / top) * plotH;
  const xc = (i) => padL + (n <= 1 ? plotW / 2 : (i + 0.5) * (plotW / n));
  const band = n ? plotW / n : plotW;
  const ref = React.useRef(null);
  const move = (e) => {
    if (!ref.current || !n) return;
    const r = ref.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.max(0, Math.min(n - 1, Math.floor((px - padL) / band)));
    onHover(i);
  };
  const labelEvery = n > 16 ? Math.ceil(n / 8) : n > 8 ? 2 : 1;
  const fmtTick = (v) => unit === "$" ? "$" + Math.round(v / 100).toLocaleString() : String(Math.round(v));
  return (
    <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" style={{ display: "block", height: "auto", overflow: "visible" }} onMouseMove={move} onMouseLeave={() => onHover(null)} role="img" aria-hidden="true">
      {ticks.map((t, i) => (
        <g key={i}>
          <line x1={padL} x2={W - padR} y1={y(t)} y2={y(t)} stroke={DBZ_T_GRID} strokeWidth="1" />
          <text x={padL - 6} y={y(t) + 3} textAnchor="end" fill="rgba(242,237,228,0.5)" fontFamily="'JetBrains Mono', monospace" fontSize="9">{fmtTick(t)}</text>
        </g>
      ))}
      {buckets.map((b, i) => (i % labelEvery === 0 || i === n - 1) ? (
        <text key={b.key} x={xc(i)} y={H - 8} textAnchor="middle" fill="rgba(242,237,228,0.5)" fontFamily="'JetBrains Mono', monospace" fontSize="9">{b.label}</text>
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
      {hover != null && n > 0 && <line x1={xc(hover)} x2={xc(hover)} y1={padT} y2={padT + plotH} stroke="rgba(242,237,228,0.35)" strokeWidth="1" />}
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
  const chip = (on) => ({ fontFamily: DBZ_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "5px 10px", borderRadius: 3, border: "1px solid " + (on ? DBZ_TEAL : "rgba(242,237,228,0.18)"), background: on ? "rgba(46,224,196,0.10)" : "transparent", color: on ? DBZ_TEAL : DBZ_INK50, cursor: "pointer" });
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
            <thead><tr>{["Period", "Active", "Joined", "Left", "MRR · net", "One-time"].map((h) => <th key={h} style={{ textAlign: h === "Period" ? "left" : "right", padding: "6px 8px", color: DBZ_INK50, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", fontSize: 8.5, borderBottom: "1px solid rgba(242,237,228,0.1)" }}>{h}</th>)}</tr></thead>
            <tbody>{buckets.map((b) => (
              <tr key={b.key}>
                <td style={{ padding: "5px 8px", borderTop: "1px solid rgba(242,237,228,0.05)" }}>{b.label}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(242,237,228,0.05)" }}>{b.active}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(242,237,228,0.05)" }}>{b.added ? "+" + b.added : "0"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(242,237,228,0.05)" }}>{b.ended ? "−" + b.ended : "0"}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(242,237,228,0.05)" }}>{money(b.mrrNetCents)}</td>
                <td style={{ padding: "5px 8px", textAlign: "right", borderTop: "1px solid rgba(242,237,228,0.05)" }}>{b.oneTimeCents ? money(b.oneTimeCents) : "—"}</td>
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
            <div style={{ position: "absolute", top: 8, ...(hover < buckets.length / 2 ? { right: 8 } : { left: 52 }), pointerEvents: "none", background: "rgba(20,17,14,0.96)", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 6, padding: "9px 12px", minWidth: 170, boxShadow: "0 12px 30px rgba(0,0,0,0.4)" }}>
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

// ── The page ─────────────────────────────────────────────────────────────────
function CoachBusinessPage({ role }) {
  const cfg = DBZ_ROLES[role];
  const { today: live, source } = useDashboard(role);
  const [extra, setExtra] = React.useState(null); // /api/{role}/analytics payload

  React.useEffect(() => {
    let on = true;
    fetch(cfg.api, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d && d[cfg.okKey]) setExtra(d); })
      .catch(() => {});
    return () => { on = false; };
  }, [role]);

  const isLive = !!live || !!extra;
  const stripe = extra && extra.stripe ? extra.stripe : null;
  const mrr = extra && extra.metrics ? extra.metrics : null;
  // Outcomes: the live rollup verbatim (the route always returns the full
  // shape), the demo set ONLY under the band — a live viewer with a failed
  // analytics fetch gets an honest loading state, never demo numbers.
  const cp = extra ? (extra.clientProgress || {}) : (!isLive ? DBZ_DEMO_OUTCOMES[role] : null);

  // Sidebar money card: REAL balance when connected, "—" until then, demo
  // numbers only under the band.
  const payoutCard = !isLive
    ? (role === "nutritionist" ? nutriPayoutCard : trainerPayoutCard)
    : stripe && stripe.connected && stripe.balanceCents != null
      ? { label: "BALANCE · AVAILABLE", amount: dashMoney(stripe.balanceCents), sub: dbzScheduleLine(stripe.schedule) || "Stripe connected" }
      : { label: "PAYOUTS", amount: "—", sub: "connects when payouts go live" };

  return (
    <React.Fragment>
      {source === "demo" && !extra && <DashDemoBand />}
      <DashPage
        tourHero="hero-business"
        navItems={cfg.nav("business")}
        payoutCard={payoutCard}
        eyebrow="REVENUE · PAYOUTS · FUNNEL · CHURN"
        title="Business"
        subtitle="The money side, told straight — real subscription revenue, real Stripe payouts, the marketplace funnel, and who left. Nothing here is invented."
      >
        {/* Practice trajectory — the growth question, answered first */}
        <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBZ_TEAL, paddingLeft: 24, marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
            <span className="dash-eyebrow">Practice · trajectory</span>
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
          </div>
          <div className="dash-ledger" style={{ marginTop: 9, marginBottom: 12 }} />
          <DbzTrajectoryZone live={isLive} trajectory={extra && extra.trajectory} role={role} loading={isLive && !extra} />
        </div>

        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start", marginBottom: 16 }}>
          {/* Revenue trend — 90 days */}
          <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBZ_TEAL, paddingLeft: 24 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
              <span className="dash-eyebrow">Revenue · 90-day trend</span>
              <span style={{ fontFamily: DBZ_MONO, fontSize: 9.5, color: DBZ_INK50 }}>
                {mrr ? <React.Fragment>MRR <span style={{ fontFamily: serif, fontSize: 17, color: "#f2ede4" }}>{dashMoney(mrr.mrrNetCents)}</span> net · {dashMoney(mrr.mrrGrossCents)} gross</React.Fragment>
                  : isLive ? "MRR — · no active subscriptions" : "MRR from active subscriptions"}
              </span>
            </div>
            <div className="dash-ledger" style={{ marginTop: 9, marginBottom: 12 }} />
            <DashGrowthPanel live={live} role={role} />
          </div>

          {/* Payouts — schedule + history */}
          <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBZ_GREEN, paddingLeft: 24 }}>
            <span className="dash-eyebrow" style={{ color: DBZ_GREEN }}>Payouts · schedule &amp; history</span>
            <div className="dash-ledger" style={{ "--dac": DBZ_GREEN, marginTop: 9, marginBottom: 12 }} />
            <DbzPayoutsZone live={isLive} stripe={stripe} providerId={extra && extra.providerId} role={role} />
          </div>
        </div>

        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16, alignItems: "start", marginBottom: 16 }}>
          {/* Marketplace funnel with benchmark */}
          <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBZ_TEAL, paddingLeft: 24 }}>
            <span className="dash-eyebrow">Marketplace funnel · views → consults → signed</span>
            <div className="dash-ledger" style={{ marginTop: 9, marginBottom: 12 }} />
            <DashFunnelPanel live={live} />
          </div>

          {/* Churn */}
          <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBZ_RED, paddingLeft: 24 }}>
            <span className="dash-eyebrow" style={{ color: DBZ_RED }}>Churn · who left &amp; why</span>
            <div className="dash-ledger" style={{ "--dac": DBZ_RED, marginTop: 9, marginBottom: 12 }} />
            <DbzChurnZone live={isLive} churn={extra && extra.churn} />
          </div>
        </div>

        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, alignItems: "start", marginBottom: 16 }}>
          {/* Bring your clients — the BYO ref link (0% commission) */}
          <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": DBZ_TEAL, paddingLeft: 24 }}>
            <span className="dash-eyebrow">Bring your clients · 0% commission</span>
            <div className="dash-ledger" style={{ marginTop: 9, marginBottom: 12 }} />
            <DbzBringClientsZone live={isLive} role={role} providerId={extra && extra.providerId} />
          </div>

          {/* Origin labels — who found whom, from the STORED fee_bps */}
          <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": cfg.accent, paddingLeft: 24 }}>
            <span className="dash-eyebrow" style={{ color: cfg.accent }}>Your roster · who found whom</span>
            <div className="dash-ledger" style={{ "--dac": cfg.accent, marginTop: 9, marginBottom: 12 }} />
            <DbzOriginZone live={isLive} byOrigin={extra && extra.byOrigin} />
          </div>
        </div>

        {/* Roster outcomes — migrated from the old Analytics page */}
        <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": cfg.accent, paddingLeft: 24 }}>
          <span className="dash-eyebrow" style={{ color: cfg.accent }}>The product · roster outcomes, last 30 days</span>
          <div className="dash-ledger" style={{ "--dac": cfg.accent, marginTop: 9, marginBottom: 14 }} />
          {cp
            ? <DbzOutcomesZone role={role} cp={cp} />
            : <div style={{ fontSize: 12.5, color: DBZ_INK50 }}>Roster outcomes load with the analytics rollup…</div>}
        </div>
      </DashPage>
    </React.Fragment>
  );
}

Object.assign(window, { CoachBusinessPage, DbzPayoutsZone, DbzChurnZone, DbzOutcomesZone, DbzBringClientsZone, DbzOriginZone });
