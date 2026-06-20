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
const DBZ_DEMO_PAYOUTS = {
  balanceCents: 184000,
  schedule: { interval: "weekly", weeklyAnchor: "friday", delayDays: 2 },
  payouts: [3, 10, 17, 24].map((d, i) => ({
    id: "demo-po-" + i, amountCents: [412500, 386000, 401500, 374000][i],
    status: "paid", arrivalDate: Date.now() - d * 86400000, created: Date.now() - (d + 2) * 86400000,
  })),
};
const DBZ_DEMO_CHURN = [
  { name: "Devon Sharpe", startedAt: new Date(Date.now() - 210 * 86400000).toISOString(), endedAt: new Date(Date.now() - 9 * 86400000).toISOString(), priceCents: 18000, reason: "Budget — coming back in the fall" },
  { name: "Mara Ellison", startedAt: new Date(Date.now() - 460 * 86400000).toISOString(), endedAt: new Date(Date.now() - 31 * 86400000).toISOString(), priceCents: 22000, reason: "Hit her goal — graduated to self-managed" },
  { name: "Theo Brandt", startedAt: new Date(Date.now() - 88 * 86400000).toISOString(), endedAt: new Date(Date.now() - 64 * 86400000).toISOString(), priceCents: 16000, reason: "Moved cities — wanted in-person" },
];
// Roster outcomes — migrated verbatim from the old Analytics pages' mocks.
const DBZ_DEMO_OUTCOMES = {
  trainer: {
    activeClients: 34, workouts30d: 412, workouts7d: 96, prs30d: 41, avgAdherencePct: 88,
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
    activeClients: 28, proteinAdherencePct: 78, avgLogsPerClient: 22, totalDaysLogged: 612,
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
  const data = live ? stripe : DBZ_DEMO_PAYOUTS;
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

Object.assign(window, { CoachBusinessPage, DbzPayoutsZone, DbzChurnZone, DbzOutcomesZone });
