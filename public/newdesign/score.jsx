// Shape Score — dedicated member page. Spatial Cinema language.
const { useState: useSScore } = React;

const SCORE_TOTAL = 1284;
const SCORE_GOAL = 2000;
const STREAK = 14;
const TIER = "Tempo";
const NEXT_TIER = "Form";
const POINTS_TO_NEXT = 716;

const LEDGER = [
  { d: "Apr 18", t: "Session kept · Maya Okafor", p: 14, k: "session" },
  { d: "Apr 18", t: "Lower push logged", p: 9, k: "workout" },
  { d: "Apr 18", t: "Macros on target", p: 6, k: "nutrition" },
  { d: "Apr 18", t: "Morning mobility logged", p: 3, k: "habit" },
  { d: "Apr 17", t: "New PR · Back squat", p: 12, k: "workout" },
  { d: "Apr 17", t: "Protein target hit · 3rd day", p: 5, k: "nutrition" },
  { d: "Apr 17", t: "Session kept · Rae Lindqvist", p: 13, k: "session" },
  { d: "Apr 17", t: "Hydration goal", p: 2, k: "nutrition" },
  { d: "Apr 16", t: "Upper pull logged", p: 9, k: "workout" },
  { d: "Apr 16", t: "Sleep ≥ 7h", p: 3, k: "recovery" },
  { d: "Apr 16", t: "Steps ≥ 8,000", p: 2, k: "habit" },
  { d: "Apr 15", t: "Program day completed", p: 8, k: "workout" },
  { d: "Apr 15", t: "Weekly review submitted", p: 15, k: "milestone" },
  { d: "Apr 15", t: "Meal logged · dinner", p: 2, k: "nutrition" },
  { d: "Apr 15", t: "Habit streak · 7 days", p: 4, k: "habit" },
  { d: "Apr 14", t: "Session kept · Maya Okafor", p: 14, k: "session" },
  { d: "Apr 14", t: "Intro consult · new client", p: 8, k: "session" },
  { d: "Apr 14", t: "Tough session · RPE 8+", p: 4, k: "workout" },
];

// "The Record" signed-out demo — BAKED from bsScoreRecord(BS_RECORD_DEMO_ROWS)
// (the website can't run the ESM aggregation in-browser; the server owns the live
// path). Same demo rows the mobile Record computes at runtime, so the two match.
const RECORD_DEMO = {"ranges":{"1w":{"series":[{"date":"2026-07-02","cumulative":92,"dayDelta":15},{"date":"2026-07-05","cumulative":95,"dayDelta":3},{"date":"2026-07-06","cumulative":115,"dayDelta":20}],"byCategory":[{"key":"adherence","label":"Check-ins","earned":15},{"key":"nutrition","label":"Nutrition","earned":10},{"key":"workouts","label":"Workouts","earned":10},{"key":"habits","label":"Habits","earned":3}],"earned":38,"lost":0,"net":38,"penalties":[]},"1m":{"series":[{"date":"2026-06-11","cumulative":62,"dayDelta":10},{"date":"2026-06-19","cumulative":55,"dayDelta":-7},{"date":"2026-06-23","cumulative":67,"dayDelta":12},{"date":"2026-06-27","cumulative":77,"dayDelta":10},{"date":"2026-07-02","cumulative":92,"dayDelta":15},{"date":"2026-07-05","cumulative":95,"dayDelta":3},{"date":"2026-07-06","cumulative":115,"dayDelta":20}],"byCategory":[{"key":"nutrition","label":"Nutrition","earned":20},{"key":"workouts","label":"Workouts","earned":20},{"key":"adherence","label":"Check-ins","earned":15},{"key":"prs","label":"PRs","earned":12},{"key":"habits","label":"Habits","earned":3}],"earned":70,"lost":7,"net":63,"penalties":[{"note":"Missed check-in","total":-7}]},"3m":{"series":[{"date":"2026-04-20","cumulative":30,"dayDelta":10},{"date":"2026-05-04","cumulative":42,"dayDelta":12},{"date":"2026-05-18","cumulative":52,"dayDelta":10},{"date":"2026-06-08","cumulative":62,"dayDelta":10},{"date":"2026-06-15","cumulative":55,"dayDelta":-7},{"date":"2026-06-22","cumulative":77,"dayDelta":22},{"date":"2026-06-29","cumulative":95,"dayDelta":18},{"date":"2026-07-06","cumulative":115,"dayDelta":20}],"byCategory":[{"key":"nutrition","label":"Nutrition","earned":30},{"key":"workouts","label":"Workouts","earned":30},{"key":"prs","label":"PRs","earned":24},{"key":"adherence","label":"Check-ins","earned":15},{"key":"habits","label":"Habits","earned":3}],"earned":102,"lost":7,"net":95,"penalties":[{"note":"Missed check-in","total":-7}]},"all":{"series":[{"date":"2026-02-09","cumulative":10,"dayDelta":10},{"date":"2026-03-02","cumulative":20,"dayDelta":10},{"date":"2026-04-20","cumulative":30,"dayDelta":10},{"date":"2026-05-04","cumulative":42,"dayDelta":12},{"date":"2026-05-18","cumulative":52,"dayDelta":10},{"date":"2026-06-08","cumulative":62,"dayDelta":10},{"date":"2026-06-15","cumulative":55,"dayDelta":-7},{"date":"2026-06-22","cumulative":77,"dayDelta":22},{"date":"2026-06-29","cumulative":95,"dayDelta":18},{"date":"2026-07-06","cumulative":115,"dayDelta":20}],"byCategory":[{"key":"nutrition","label":"Nutrition","earned":40},{"key":"workouts","label":"Workouts","earned":40},{"key":"prs","label":"PRs","earned":24},{"key":"adherence","label":"Check-ins","earned":15},{"key":"habits","label":"Habits","earned":3}],"earned":122,"lost":7,"net":115,"penalties":[{"note":"Missed check-in","total":-7}]}},"history":[{"date":"2026-07-06","subtotal":20,"rows":[{"note":"Workout logged","category":"workouts","label":"Workouts","delta":10,"earned_at":"2026-07-06T15:00:00Z","bucket":"workouts","isPenalty":false},{"note":"Meal logged","category":"nutrition","label":"Nutrition","delta":10,"earned_at":"2026-07-06T12:00:00Z","bucket":"nutrition","isPenalty":false}]},{"date":"2026-07-05","subtotal":3,"rows":[{"note":"Habit completed","category":"habits","label":"Habits","delta":3,"earned_at":"2026-07-05T18:00:00Z","bucket":"habits","isPenalty":false}]},{"date":"2026-07-02","subtotal":15,"rows":[{"note":"Weekly check-in","category":"adherence","label":"Check-ins","delta":15,"earned_at":"2026-07-02T09:00:00Z","bucket":"checkins","isPenalty":false}]},{"date":"2026-06-27","subtotal":10,"rows":[{"note":"Workout logged","category":"workouts","label":"Workouts","delta":10,"earned_at":"2026-06-27T15:00:00Z","bucket":"workouts","isPenalty":false}]},{"date":"2026-06-23","subtotal":12,"rows":[{"note":"Back squat PR","category":"prs","label":"PRs","delta":12,"earned_at":"2026-06-23T17:00:00Z","bucket":"prs","isPenalty":false}]},{"date":"2026-06-19","subtotal":-7,"rows":[{"note":"Missed check-in","category":"adherence","label":"Check-ins","delta":-7,"earned_at":"2026-06-19T09:00:00Z","bucket":"penalty","isPenalty":true}]},{"date":"2026-06-11","subtotal":10,"rows":[{"note":"Meal logged","category":"nutrition","label":"Nutrition","delta":10,"earned_at":"2026-06-11T12:00:00Z","bucket":"nutrition","isPenalty":false}]},{"date":"2026-05-24","subtotal":10,"rows":[{"note":"Workout logged","category":"workouts","label":"Workouts","delta":10,"earned_at":"2026-05-24T15:00:00Z","bucket":"workouts","isPenalty":false}]},{"date":"2026-05-10","subtotal":12,"rows":[{"note":"Deadlift PR","category":"prs","label":"PRs","delta":12,"earned_at":"2026-05-10T17:00:00Z","bucket":"prs","isPenalty":false}]},{"date":"2026-04-22","subtotal":10,"rows":[{"note":"Meal logged","category":"nutrition","label":"Nutrition","delta":10,"earned_at":"2026-04-22T12:00:00Z","bucket":"nutrition","isPenalty":false}]},{"date":"2026-03-08","subtotal":10,"rows":[{"note":"Workout logged","category":"workouts","label":"Workouts","delta":10,"earned_at":"2026-03-08T15:00:00Z","bucket":"workouts","isPenalty":false}]},{"date":"2026-02-12","subtotal":10,"rows":[{"note":"Meal logged","category":"nutrition","label":"Nutrition","delta":10,"earned_at":"2026-02-12T12:00:00Z","bucket":"nutrition","isPenalty":false}]}],"lifetime":115};

// Five of the Store's own items, at the Store's own prices (src/lib/store-catalogue.ts: 150 points a
// dollar, 300 for a credit). This list had its own invented prices ("$25 session credit · 500 pts" where
// the Store charges 7,500, a "20% off merch" the Store does not sell, a "$200" credit the Store sells at
// $60), and its Redeem did nothing; it opens the Store now. tests/score-page-examples.test.mjs holds
// each to the catalogue.
const SC_PTS_PER_USD = 150;
const scRewardCost = (r) => Math.round(r.retail * (r.kind === "credit" ? SC_PTS_PER_USD * 2 : SC_PTS_PER_USD));
const REWARDS = [
  { id: "train_credit_25", title: "$25 session credit", sub: "Use with any Shape coach", retail: 25, kind: "credit", img: "credit" },
  { id: "train_second_opinion", title: "Coach 2nd-opinion", sub: "A 30-min review with a Shape trainer", retail: 95, kind: "service", img: "coach" },
  { id: "nutri_meal_plan_refresh", title: "Meal-plan Refresh", sub: "A plan rebuild with your Shape RD", retail: 140, kind: "service", img: "nutrition" },
  { id: "merch_cap_black", title: "Shape Cap · Black", sub: "From the Shape merch drop", retail: 35, kind: "merch", img: "store" },
  { id: "perk_annual_credit", title: "Annual membership credit", sub: "$60 toward next year", retail: 60, kind: "credit", img: "annual", locked: true },
].map((r) => ({ ...r, cost: scRewardCost(r) }));

// 84 days of activity (12 weeks × 7 days)
const HEATMAP = Array.from({ length: 84 }, (_, i) => {
  const v = Math.max(0, Math.sin(i * 0.7) + Math.sin(i * 0.3) + 0.5);
  return i > 80 ? 0 : Math.min(4, Math.round(v * 2));
});

// Tier colors come from the canonical palette (tierColors.jsx →
// window.SHAPE_TIER_COLORS / window.tierColor); the literals below are the
// fallback when this page loads before that script. Member ladder + coach ladder
// match the mobile app (steel · gold · teal · violet · rose / teal crowns coach).
const SC_TC = (typeof window !== "undefined" && window.tierColor) || ((t, c) => {
  const M = { raw: "#5fa96e", tempo: "#d8a23a", form: "#e0463c", peak: "#8fe3e6", legend: "#34d6c5" };
  const C = { certified: "#5fa96e", pro: "#d8a23a", elite: "#e0463c", master: "#8fe3e6", icon: "#34d6c5" };
  return (c ? C : M)[String(t).toLowerCase()] || "#d8a23a";
});
const TIERS = [
  { name: "Raw",    min: 0,     color: SC_TC("raw"),                  desc: "Starting level", bonus: 0 },
  { name: "Tempo",  min: 750,   color: SC_TC("tempo"), current: true, desc: "Free Shape cap", bonus: 500 },
  { name: "Form",   min: 2000,  color: SC_TC("form"),                 desc: "Free coach workout or plan", bonus: 1000 },
  { name: "Peak",   min: 5000,  color: SC_TC("peak"),                 desc: "A free month with a coach", bonus: 2000 },
  { name: "Legend", min: 15000, color: SC_TC("legend"),               desc: "A free year of Shape + a cap", bonus: 4000 },
];

// Coaches climb the same 5 rungs under their own names (scheme J) with the
// coach color ramp — teal (the logo color) crowns the ladder at Icon.
const TIERS_COACH = [
  { name: "Certified", min: 0,     color: SC_TC("certified", true),                  desc: "Verified Shape coach", bonus: 0 },
  { name: "Pro",       min: 750,   color: SC_TC("pro", true), current: true,         desc: "Free Shape cap", bonus: 500 },
  { name: "Elite",     min: 2000,  color: SC_TC("elite", true),                      desc: "Free coach workout or plan", bonus: 1000 },
  { name: "Master",    min: 5000,  color: SC_TC("master", true),                     desc: "A free month with a coach", bonus: 2000 },
  { name: "Icon",      min: 15000, color: SC_TC("icon", true),                       desc: "A free year of Shape + a cap", bonus: 4000 },
];

const SC_RPR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

// ⚠ AN EXAMPLE MEMBER'S FIGURES, SAID WHERE THEY SIT. The score ring, the four
// hero figures, the tier standing, the activity card and the 940 balance are
// constants, the same member for every reader, and they rendered with nothing
// saying so, in the second person, to members too (CodeRabbit, on #2158, when the
// signed-in nav gained this page). This mark goes beside each group of them, the
// way the homepage's .exlabel does, so no reader takes them for their own. A
// member's live score is on their dashboard (ClientApp.html#score); this page
// explains the program, and `tests/score-page-examples.test.mjs` keeps every
// group of constants labelled.
function ScExample({ children = "Example member", style }) {
  return <div data-sc-example="" style={{ fontFamily: mono, fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(242,237,228,0.6)", ...style }}>{children}</div>;
}

// ⚠ A SIGNED-IN MEMBER SEES THEIR OWN STANDING, NOT THE EXAMPLE'S (owner, 2026-11-11: "fix the store
// sample numbers too, and community page, and rewards page"). The example member above stays for a
// visitor, labelled. A member gets /api/client/score (the Standing: the Shape Score, the tier on the
// high-water basis, the week, the spendable balance, the newest ledger rows, momentum) and
// /api/client/score-record (The Record: every day's points, for the heatmap and the streaks). Until
// the Standing answers a member sees "—", never the example's numbers; a read that fails falls back
// to the labelled example, which claims nothing.

const SC_DAY = 86400000;
const scIsoDay = (ms) => new Date(ms).toISOString().slice(0, 10);

// Points earned each UTC day (The Record's days), on the rank basis: positive rows only, no tier
// bonus (spendable credit, not activity). Store redemptions are already out of The Record.
function scEarnedByDay(history) {
  const out = new Map();
  for (const day of Array.isArray(history) ? history : []) {
    if (!day || typeof day.date !== "string") continue;
    let earned = 0;
    for (const r of Array.isArray(day.rows) ? day.rows : []) {
      const d = Number(r && r.delta);
      if (Number.isFinite(d) && d > 0 && r.source_kind !== "tier_bonus") earned += d;
    }
    if (earned > 0) out.set(day.date, earned);
  }
  return out;
}

// The member's figures, from the Standing and (once it has answered) The Record. Pure: `now` in ms.
function scView(score, record, now) {
  const num = (x) => (typeof x === "number" && Number.isFinite(x) ? x : null);
  const total = Math.max(0, num(score && score.points_total) || 0);
  const tierName = score && score.current_tier && typeof score.current_tier.name === "string" ? score.current_tier.name : TIERS[0].name;
  const tierIdx = Math.max(0, TIERS.findIndex((t) => t.name === tierName));
  const next = score && score.next_tier && typeof score.next_tier.name === "string" ? score.next_tier : null;
  const goal = next && num(next.threshold) ? next.threshold : Math.max(TIERS[tierIdx].min, total, 1);
  const m = score && score.momentum && typeof score.momentum === "object" ? score.momentum : null;
  const v = {
    total, goal, tier: tierName, tierIdx,
    next: next ? next.name : null,
    toNext: Math.max(0, num(score && score.points_to_next) || 0),
    weekGain: num(score && score.week_gain) || 0,
    balance: Math.max(0, num(score && score.spendable_balance) || 0),
    momentum: m && num(m.value) != null ? Math.max(0, Math.min(100, Math.round(m.value))) : null,
    recent: Array.isArray(score && score.recent) ? score.recent : [],
    // From The Record; null until it answers.
    streak: null, best: null, active: null, heat: null, lastWeek: null,
  };
  if (!record || !Array.isArray(record.history)) return v;
  const days = scEarnedByDay(record.history);
  const today = Math.floor(now / SC_DAY) * SC_DAY;
  const has = (ms) => days.has(scIsoDay(ms));
  // A streak runs to today, or to yesterday while today is still open.
  let t = has(today) ? today : today - SC_DAY, streak = 0;
  while (has(t)) { streak += 1; t -= SC_DAY; }
  let best = 0, run = 0, prev = null;
  for (const d of [...days.keys()].sort()) {
    const ms = Date.parse(d + "T00:00:00Z");
    run = prev != null && ms - prev === SC_DAY ? run + 1 : 1;
    if (run > best) best = run;
    prev = ms;
  }
  const level = (p) => (p <= 0 ? 0 : p < 10 ? 1 : p < 25 ? 2 : p < 45 ? 3 : 4);
  const heat = Array.from({ length: 84 }, (_, i) => level(days.get(scIsoDay(today - (83 - i) * SC_DAY)) || 0));
  // The week before, on week_gain's own basis: week_gain is net (penalties in, Store and tier
  // bonuses out) from midnight UTC seven days ago, so day offsets 0-7. The window before it is
  // offsets 8-15, net on the same basis (Codex on #2701: positive-only days 7-13 overlapped it).
  const net = new Map();
  for (const d of Array.isArray(record.history) ? record.history : []) {
    if (!d || typeof d.date !== "string") continue;
    for (const r of Array.isArray(d.rows) ? d.rows : []) {
      const x = Number(r && r.delta);
      if (!Number.isFinite(x) || r.source_kind === "tier_bonus" || r.source_kind === "store_redeem") continue;
      net.set(d.date, (net.get(d.date) || 0) + x);
    }
  }
  let lastWeek = 0;
  for (let k = 8; k <= 15; k++) lastWeek += net.get(scIsoDay(today - k * SC_DAY)) || 0;
  return { ...v, streak, best: Math.max(best, streak), active: heat.filter((x) => x > 0).length, heat, lastWeek };
}

function ScReveal({ children, delay = 0, style = {} }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(SC_RPR);
  React.useEffect(() => {
    if (SC_RPR || !ref.current) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { threshold: 0.12 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(32px)", transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`, ...style }}>{children}</div>;
}

// The scrim behind a hero's copy over the page photo (the depth review, 2026-11-04). It sits
// inside the copy (position: relative + isolation) at z-index -1: behind the words, above the photo.
// Feathered on every edge, so it reads as shade on the photo, not a box.
const SCORE_COPY_SCRIM = {
  position: "absolute", inset: "-44px -52px", zIndex: -1, pointerEvents: "none",
  background: "linear-gradient(90deg, rgba(14,11,9,0) 0, rgba(14,11,9,0.74) 52px, rgba(14,11,9,0.74) calc(100% - 52px), rgba(14,11,9,0) 100%)",
  WebkitMaskImage: "linear-gradient(180deg, transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%)",
  maskImage: "linear-gradient(180deg, transparent 0, #000 44px, #000 calc(100% - 44px), transparent 100%)",
};

function ScoreHero({ v = null, loading = false }) {
  const example = !v && !loading;
  const total = v ? v.total : loading ? null : SCORE_TOTAL;
  const goal = v ? v.goal : SCORE_GOAL;
  const pct = total == null ? 0 : Math.min(1, total / Math.max(1, goal));
  const streakLine = v ? (v.streak == null ? "" : `${v.streak}-DAY STREAK`) : loading ? "" : `${STREAK}-DAY STREAK`;
  const stats = v
    ? [
        [`${v.weekGain < 0 ? "−" : "+"}${Math.abs(v.weekGain).toLocaleString()}`, "Points this week", v.lastWeek == null ? "last 7 days" : `vs ${v.lastWeek < 0 ? "−" : ""}${Math.abs(v.lastWeek).toLocaleString()} the week before`],
        [v.streak == null ? "—" : `${v.streak}d`, "Current streak", v.best == null ? "" : `personal best ${v.best}d`],
        [v.tier, "Tier", v.next ? `${v.toNext.toLocaleString()} to ${v.next}` : "the top tier"],
        [v.balance.toLocaleString(), "Available to spend", "in the Store"],
      ]
    : loading
      ? [["—", "Points this week", ""], ["—", "Current streak", ""], ["—", "Tier", ""], ["—", "Available to spend", ""]]
      : [
          ["+36", "Points this week", "vs 32 last"],
          [`${STREAK}d`, "Current streak", "personal best 22d"],
          [TIER, "Tier", `${POINTS_TO_NEXT.toLocaleString()} to ${NEXT_TIER}`],
          ["940", "Available to spend", "344 reserved"],
        ];
  const R = 118;
  const C = 2 * Math.PI * R;
  return (
    <section style={{ padding: "40px 72px 60px", position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", width: 600, height: 600, top: "-22%", right: "-6%", borderRadius: "50%", filter: "blur(80px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div className="sc-hero" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 22 }}>Shape Score</div>
            <h1 style={{ fontFamily: serif, fontSize: "clamp(42px, 6vw, 84px)", letterSpacing: "-0.045em", fontWeight: 300, margin: 0, lineHeight: 0.88 }}>
              Rewards for<br /><em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>showing&nbsp;up</em>.
            </h1>
            <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.6, color: "rgba(242,237,228,0.66)", margin: "30px 0 0", position: "relative", isolation: "isolate", maxWidth: 520 }}>
              <span aria-hidden style={SCORE_COPY_SCRIM} />
              Every logged workout, tracked meal, kept session, and habit you hit adds up. Spend points on training credits, nutrition services, or Shape merch. No expiry, no gotchas.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
              <button onClick={() => { window.location.href = "Store.html"; }} style={{ background: TEAL, color: PAPER, border: 0, padding: "16px 26px", borderRadius: 2, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Redeem points →</button>
              <button onClick={() => { const el = document.getElementById("how-points-work"); if (el) el.scrollIntoView({ behavior: "smooth", block: "start" }); }} style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.22)", padding: "16px 26px", borderRadius: 2, fontFamily: sans, fontSize: 14, cursor: "pointer" }}>How points work</button>
            </div>
          </div>
          <div style={{ display: "grid", placeItems: "center" }}>
            <svg viewBox="0 0 280 280" style={{ width: "100%", maxWidth: 380 }}>
              <defs>
                <linearGradient id="ring-grad" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor={TEAL_BRIGHT} />
                  <stop offset="100%" stopColor={TEAL} />
                </linearGradient>
              </defs>
              <circle cx="140" cy="140" r={R} stroke="rgba(242,237,228,0.08)" strokeWidth="14" fill="none" />
              <circle cx="140" cy="140" r={R} stroke="url(#ring-grad)" strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={`${C * pct} ${C}`} transform="rotate(-90 140 140)" />
              <text x="140" y="128" textAnchor="middle" fontFamily="'Anybody', 'Anybody Fallback', system-ui, sans-serif" fontSize="72" fontWeight="400" fill={INK} letterSpacing="-3">{total == null ? "—" : total}</text>
              <text x="140" y="152" textAnchor="middle" fontFamily="'Schibsted Grotesk', 'Schibsted Fallback', system-ui, sans-serif" fontSize="13" fill="rgba(242,237,228,0.5)">{total == null ? "" : `of ${goal.toLocaleString()}`}</text>
              <text x="140" y="176" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill={TEAL} letterSpacing="1.5">{streakLine}</text>
            </svg>
            {example ? <ScExample style={{ marginTop: 10 }} /> : null}
          </div>
        </div>
        {example ? <ScExample style={{ marginTop: 60 }} /> : <div style={{ marginTop: 60 }} />}
        <div className="sc-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginTop: 12, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          {stats.map(([k, l, s], i) => (
            <div key={i} style={{ padding: "30px 24px", borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
              <div style={{ fontFamily: serif, fontSize: 46, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: INK, marginTop: 12 }}>{l}</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 4 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScoreTiers({ v = null, loading = false }) {
  const [aud, setAud] = useSScore("client");
  const tiers = aud === "coach" ? TIERS_COACH : TIERS;
  // The member's own rung on the Members ladder; the Coaches ladder stays the example coach's.
  const mine = aud === "client" && !!v;
  const points = mine ? v.total : aud === "client" && loading ? null : SCORE_TOTAL;
  // The teal fill reflects the member's ACTUAL points — interpolated between the
  // reached tier's node and the next one — so the line position matches the
  // "{N} to {next}" headline (e.g. 1,284 sits ~43% from Tempo→Form, not on the
  // Tempo node). Nodes sit at column centers ((i+0.5)/n); the track runs between
  // the first and last node (not the panel edges), and the fill ends in open
  // space with a head dot so it never fuses with a bubble.
  const nCols = tiers.length;
  const nodeCenterPct = (i) => ((i + 0.5) / nCols) * 100;
  const trackStart = nodeCenterPct(0);
  const trackEnd = nodeCenterPct(nCols - 1);
  // The reached rung is the Standing's (high-water: it never demotes), and the fill sits at the
  // member's points between it and the next, held at the rung while they sit below its line.
  const reachedIdx = points == null ? -1 : mine ? v.tierIdx : tiers.reduce((m, t, i) => (points >= t.min ? i : m), 0);
  let barPct;
  if (reachedIdx < 0) {
    barPct = 0;
  } else if (reachedIdx >= nCols - 1) {
    barPct = nodeCenterPct(reachedIdx);
  } else {
    const lo = tiers[reachedIdx].min, hi = tiers[reachedIdx + 1].min;
    const frac = hi > lo ? Math.max(0, Math.min(1, (points - lo) / (hi - lo))) : 0;
    barPct = nodeCenterPct(reachedIdx) + frac * (nodeCenterPct(reachedIdx + 1) - nodeCenterPct(reachedIdx));
  }
  return (
    <section style={{ padding: "96px 72px" }}>
      <ScReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>{aud === "coach" ? "Tiers · example coach" : mine ? "Tiers · your standing" : loading ? "Tiers" : "Tiers · example member"}</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(36px, 5vw, 60px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "0 0 28px", lineHeight: 1 }}>
            {aud === "coach"
              ? <>Coaches climb <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>their own</em> ladder.</>
              : reachedIdx < 0
                ? <>Five rungs, <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>one climb</em>.</>
                : mine
                  ? <>You're <em style={{ fontStyle: "italic", fontWeight: 600, color: tiers[reachedIdx].color }}>{v.tier}</em>. {v.next ? `${v.toNext.toLocaleString()} to ${v.next}.` : "The top tier."}</>
                  : <>You're <em style={{ fontStyle: "italic", fontWeight: 600, color: tiers[reachedIdx].color }}>{TIER}</em>. {POINTS_TO_NEXT.toLocaleString()} to {NEXT_TIER}.</>}
          </h2>
          {/* Audience toggle — Members vs Coaches ladder */}
          <div style={{ display: "flex", gap: 8, marginBottom: 40 }}>
            {[["client", "Members"], ["coach", "Coaches"]].map(([k, l]) => {
              const on = aud === k;
              return (
                <button key={k} onClick={() => setAud(k)} style={{
                  cursor: "pointer", fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", fontWeight: 600,
                  padding: "10px 22px", borderRadius: 999,
                  border: `1px solid ${on ? TEAL : "rgba(242,237,228,0.22)"}`,
                  background: on ? TEAL : "transparent", color: on ? "#04201d" : "rgba(242,237,228,0.7)",
                }}>{l}</button>
              );
            })}
          </div>
          <div style={{ position: "relative", padding: "24px 0 8px" }}>
            {/* Segmented connector — each segment sits BETWEEN two orbs with a
                clear gap on both ends, so the bar never touches an orb. */}
            {Array.from({ length: tiers.length - 1 }).map(function (_, i) {
              const a = nodeCenterPct(i), b = nodeCenterPct(i + 1);
              const GAP = 34; // px clearance from each orb (covers the lit orb's halo)
              const filled = reachedIdx >= 0 && barPct > a + 1;
              const toPct = Math.min(barPct, b);
              const fillW = barPct >= b ? `calc(${b - a}% - ${2 * GAP}px)` : `calc(${toPct - a}% - ${GAP}px)`;
              return (
                <React.Fragment key={i}>
                  <div style={{ position: "absolute", left: `calc(${a}% + ${GAP}px)`, width: `calc(${b - a}% - ${2 * GAP}px)`, top: 58, height: 4, background: "rgba(242,237,228,0.12)", transform: "translateY(-50%)", zIndex: 0, borderRadius: 2 }} />
                  {filled && <div style={{ position: "absolute", left: `calc(${a}% + ${GAP}px)`, width: fillW, top: 58, height: 4, background: `linear-gradient(90deg, ${tiers[i].color}, ${tiers[i + 1].color})`, transform: "translateY(-50%)", zIndex: 0, borderRadius: 2 }} />}
                </React.Fragment>
              );
            })}
            {/* current-position marker — sits in open space between orbs, colored
                as the NEXT tier you're climbing toward (falls back to the top
                tier's color once you're at the highest rung). */}
            {reachedIdx < 0 ? null : (() => {
              const nextColor = tiers[Math.min(reachedIdx + 1, tiers.length - 1)].color;
              return <div style={{ position: "absolute", left: `${barPct}%`, top: 58, width: 11, height: 11, borderRadius: 999, background: nextColor, boxShadow: `0 0 0 5px ${nextColor}33`, transform: "translate(-50%, -50%)", zIndex: 0 }} />;
            })()}
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${tiers.length}, 1fr)`, position: "relative", zIndex: 1 }}>
              {tiers.map((t, i) => {
                const reached = reachedIdx >= 0 && i <= reachedIdx;
                const current = mine ? i === reachedIdx : reachedIdx >= 0 && t.current;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                    <div style={{ height: 20, lineHeight: "20px", marginBottom: 12, fontFamily: mono, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>{t.min.toLocaleString()}</div>
                    <div style={{ height: 52, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: current ? 42 : 26, height: current ? 42 : 26, borderRadius: 999, background: reached ? t.color : INK_DEEP, border: `2.5px solid ${reached ? t.color : "rgba(242,237,228,0.2)"}`, boxShadow: current ? `0 0 0 9px ${t.color}30` : "none" }} />
                    </div>
                    <div style={{ marginTop: 16, fontFamily: serif, fontSize: 30, letterSpacing: "-0.015em", color: reached ? INK : "rgba(242,237,228,0.45)" }}>{t.name}</div>
                    <div style={{ height: 22, marginTop: 9, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {t.bonus > 0
                        ? <span style={{ fontFamily: mono, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.06em", color: t.color, background: `${t.color}1f`, border: `1px solid ${t.color}59`, borderRadius: 999, padding: "4px 11px", whiteSpace: "nowrap" }}>+{t.bonus.toLocaleString()} pts bonus</span>
                        : <span style={{ fontFamily: mono, fontSize: 9.5, fontWeight: 600, letterSpacing: "0.14em", textTransform: "uppercase", color: t.color, background: `${t.color}1f`, border: `1px solid ${t.color}59`, borderRadius: 999, padding: "4px 11px" }}>Start</span>}
                    </div>
                    <div style={{ marginTop: 9, fontFamily: sans, fontSize: 13, lineHeight: 1.4, color: "rgba(242,237,228,0.5)", textAlign: "center", maxWidth: 190 }}>{t.desc}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </ScReveal>
    </section>
  );
}

function ScoreActivity({ v = null, loading = false }) {
  const weeks = 12;
  const example = !v && !loading;
  // Oldest day first, today last; all quiet until The Record answers.
  const heat = v ? (v.heat || Array(84).fill(0)) : loading ? Array(84).fill(0) : HEATMAP;
  const tally = v ? (v.heat ? `${v.streak}d · ${v.active}/84` : "") : loading ? "" : `${STREAK}d · ${HEATMAP.filter(x => x > 0).length}/84`;
  const momentum = v ? v.momentum : loading ? null : 78;
  const shade = (v) => {
    if (v === 0) return "rgba(242,237,228,0.05)";
    if (v === 1) return "rgba(10,197,168,0.25)";
    if (v === 2) return "rgba(10,197,168,0.5)";
    if (v === 3) return "rgba(10,197,168,0.75)";
    return TEAL;
  };
  return (
    <section id="how-points-work" style={{ padding: "70px 72px", scrollMarginTop: 90 }}>
      <ScReveal>
        <div className="sc-act" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
          <div style={{ background: "rgba(11,14,12,0.62)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, padding: 36, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 26 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL }}>Activity · last 12 weeks</div>
                <h3 style={{ fontFamily: serif, fontSize: 34, letterSpacing: "-0.025em", fontWeight: 400, margin: "10px 0 0" }}>Consistency tells the story.</h3>
              </div>
              <div style={{ textAlign: "right" }}>
                {example ? <ScExample style={{ marginBottom: 6 }} /> : null}
                <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)" }}>{tally}</div>
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap: 4 }}>
              {Array.from({ length: weeks }, (_, w) => (
                <div key={w} style={{ display: "grid", gridTemplateRows: "repeat(7, 1fr)", gap: 4 }}>
                  {Array.from({ length: 7 }, (_, d) => {
                    const lv = heat[w * 7 + d];
                    return <div key={d} style={{ aspectRatio: "1/1", background: shade(lv), borderRadius: 3 }} />;
                  })}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 18, fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
              <span>Less</span>
              {[0, 1, 2, 3, 4].map(v => <div key={v} style={{ width: 12, height: 12, background: shade(v), borderRadius: 2 }} />)}
              <span>More</span>
            </div>
            {/* Momentum meter — the consistency carrot (illustrative on the marketing page) */}
            <div style={{ marginTop: 24, paddingTop: 22, borderTop: "1px solid rgba(242,237,228,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL }}>Momentum</div>
                <div style={{ fontFamily: serif, fontSize: 26, lineHeight: 1 }}>{momentum == null ? "—" : momentum}<span style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.45)" }}>/100</span></div>
              </div>
              <div style={{ height: 8, background: "rgba(242,237,228,0.08)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${momentum == null ? 0 : momentum}%`, background: TEAL, borderRadius: 999 }} />
              </div>
              <div style={{ marginTop: 12, fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)" }}>+7 for every active day, −12 for a miss — a notch, not a reset. Hold <span style={{ color: TEAL }}>80+</span> and bank a weekly bonus that grows with your streak — up to <span style={{ color: TEAL }}>+100</span>.</div>
            </div>
          </div>
          <div style={{ background: INK, color: PAPER, borderRadius: 6, padding: 36, display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL }}>How you earn</div>
            <h3 style={{ fontFamily: serif, fontSize: 34, letterSpacing: "-0.025em", fontWeight: 400, margin: "10px 0 20px", color: PAPER }}>Points, by action.</h3>
            <div className="sc-scroll" style={{ maxHeight: 360, overflowY: "auto", margin: "0 -12px", padding: "0 12px" }}>
            {[
              ["Consistency", "Weekly check-in", "submit your check-in", "15"],
              ["Consistency", "Workout logged", "any real session", "10"],
              ["Consistency", "Meal logged", "any real logged meal", "10"],
              ["Consistency", "Habit completed", "each one you check off", "3"],
              ["Consistency", "Daily steps", "+3 at your goal", "1 / 5k"],
              ["Consistency", "A good night", "7h+ from your watch or ring", "5"],
              ["Coaching", "Coach session kept", "marked complete", "12"],
              ["Progress", "New PR", "a personal best", "12"],
              ["Progress", "Career milestone", "log a work win · max once a month", "25"],
              ["Progress", "Goal milestone", "25 / 50 / 75 / 100%", "50–200"],
              ["Progress", "New tier reached", "one-time bonus", "500–4k"],
              ["Community", "Community post", "share to the feed", "5"],
              ["Momentum", "Momentum bonus", "hold 80+ each week", "25–100"],
              ["Momentum", "Commitment hit", "your weekly bet", "stake"],
            ].map(([cat, k, sub, p], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "12px 0", borderTop: i ? "1px solid rgba(26,22,18,0.1)" : "none", alignItems: "baseline" }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <span style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: "#0a7463", background: "rgba(10,116,99,0.12)", borderRadius: 4, padding: "2px 6px" }}>{cat}</span>
                    <span style={{ fontFamily: sans, fontSize: 14, fontWeight: 600 }}>{k}</span>
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 3 }}>{sub}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 13, color: TEAL }}>+{p}</div>
              </div>
            ))}
            {/* PROTECT YOUR POINTS — the accountability clawback, framed constructively. */}
            <div style={{ marginTop: 22 }}>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: "#e8957f" }}>Protect your points</div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.6)", margin: "8px 0 4px", lineHeight: 1.5 }}>Stay consistent to keep what you've earned — a coach can waive any of these.</div>
            </div>
            {[
              ["Skip your weekly check-in", "just check in next week", "7"],
              ["Miss an assigned workout", "logging can lag a day", "5"],
              ["Break a habit streak", "a 3+ day streak lost", "2"],
              ["Miss a commitment", "the bet you set", "stake"],
            ].map(([k, sub, p], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "12px 0", borderTop: "1px solid rgba(242,237,228,0.1)", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600 }}>{k}</div>
                  <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 3 }}>{sub}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 13, color: "#e8957f" }}>−{p}</div>
              </div>
            ))}
            {/* Good to know — the rules */}
            <div style={{ marginTop: 18, padding: "14px 16px", borderRadius: 6, border: "1px solid rgba(242,237,228,0.14)" }}>
              <div style={{ fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 6 }}>Good to know</div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.72)", lineHeight: 1.55 }}>You never drop below 0, and lose at most 30 points a week. Your tier never goes down once you reach it, and spending in the Store never lowers your rank.</div>
            </div>
            </div>
          </div>
        </div>
      </ScReveal>
    </section>
  );
}

const LEDGER_TABS = [["All", "all"], ["Sessions", "sessions"], ["Habits", "habits"], ["Nutrition", "nutrition"], ["Workouts", "workouts"]];
const LEDGER_SLUG_K = { sessions: "session", habits: "habit", nutrition: "nutrition", workouts: "workout" };

function ScoreLedger(props) {
  const slugs = LEDGER_TABS.map(function (x) { return x[1]; });
  const readHash = function () {
    var h = (typeof location !== "undefined" ? location.hash || "" : "").replace(/^#/, "");
    return slugs.indexOf(h) >= 0 ? h : "all";
  };
  const [active, setActive] = React.useState(readHash);
  React.useEffect(function () {
    var onHash = function () { setActive(readHash()); };
    window.addEventListener("hashchange", onHash);
    return function () { window.removeEventListener("hashchange", onHash); };
  }, []);
  // The member's newest rows from the page's Standing read (props.v); the example's LEDGER only for
  // a visitor, labelled. A member with no points yet sees an empty ledger, never the example's.
  var catK = function (c) {
    c = String(c || "").toLowerCase();
    if (c.indexOf("session") >= 0 || c.indexOf("consult") >= 0) return "session";
    if (c.indexOf("habit") >= 0 || c.indexOf("streak") >= 0 || c.indexOf("step") >= 0 || c.indexOf("sleep") >= 0 || c.indexOf("checkin") >= 0) return "habit";
    if (c.indexOf("nutri") >= 0 || c.indexOf("protein") >= 0 || c.indexOf("meal") >= 0 || c.indexOf("macro") >= 0 || c.indexOf("hydrat") >= 0 || c.indexOf("calorie") >= 0) return "nutrition";
    if (c.indexOf("workout") >= 0 || c.indexOf("pr") >= 0 || c.indexOf("lift") >= 0 || c.indexOf("train") >= 0 || c.indexOf("run") >= 0) return "workout";
    return "session";
  };
  var fmtD = function (iso) { try { return new Date(iso).toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return ""; } };
  var live = props.v ? props.v.recent.map(function (r) {
    return { d: fmtD(r.earned_at), t: r.note || (r.category ? String(r.category).replace(/_/g, " ") : "Points"), p: Number(r.delta) || 0, k: catK(r.category) };
  }) : null;
  const source = live || (props.loading ? [] : LEDGER);
  const activeK = LEDGER_SLUG_K[active] || null;
  const rows = activeK ? source.filter(function (r) { return r.k === activeK; }) : source;
  return (
    <section style={{ padding: "70px 72px" }}>
      <ScReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 26, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL }}>{live || props.loading ? "Ledger" : "Ledger · example entries"}</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(34px, 4.4vw, 52px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "14px 0 0", lineHeight: 1 }}>Recent earnings.</h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              {LEDGER_TABS.map(function (tab) {
                var label = tab[0], slug = tab[1], on = active === slug;
                return (
                  <a key={slug} href={"#" + slug} aria-current={on ? "page" : undefined} style={{ padding: "9px 16px", borderRadius: 2, border: "1px solid rgba(242,237,228,0.16)", background: on ? INK : "transparent", color: on ? PAPER : INK, fontFamily: sans, fontSize: 12, cursor: "pointer", textDecoration: "none" }}>{label}</a>
                );
              })}
            </div>
          </div>
          <div className="sc-scroll" style={{ background: "rgba(11,14,12,0.62)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, maxHeight: 440, overflowY: "auto" }}>
            {rows.length === 0 ? (
              <div style={{ padding: "28px 26px", fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.55)" }}>{props.loading ? "Loading your points…" : live && !live.length ? "No points yet. Your first logged workout, meal or check-in lands here." : "No entries in this category yet."}</div>
            ) : rows.map(function (row, i) {
              return (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 86px 1fr auto", gap: 20, padding: "19px 26px", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none", alignItems: "center" }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)" }}>{row.d}</div>
                  <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 8px", background: "rgba(10,197,168,0.1)", color: TEAL, borderRadius: 3, letterSpacing: "0.1em", textTransform: "uppercase", justifySelf: "start" }}>{row.k}</span>
                  <div style={{ fontFamily: serif, fontSize: 18, color: INK }}>{row.t}</div>
                  <div style={{ fontFamily: mono, fontSize: 14, color: row.p < 0 ? "#e8957f" : TEAL, fontWeight: 500 }}>{row.p < 0 ? "−" : "+"}{Math.abs(row.p)}</div>
                </div>
              );
            })}
          </div>
          <div onClick={props.onOpenRecord} role="button" tabIndex={0} style={{ marginTop: 22, fontFamily: mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, cursor: "pointer", borderBottom: "2px solid " + TEAL, width: "fit-content", paddingBottom: 4 }}>See the full record →</div>
        </div>
      </ScReveal>
    </section>
  );
}

function RewardCard({ r, balance = 940 }) {
  const ref = React.useRef(null);
  // A tier-locked reward stays locked for everyone: the Store shows it "Tier locked" and
  // /api/store/redeem refuses it, so a Redeem here would lead nowhere (Codex on #2701).
  const locked = !!r.locked;
  const canAfford = !locked && balance != null && r.cost <= balance;
  const onMove = (e) => {
    if (SC_RPR || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
    ref.current.style.transform = `perspective(1200px) rotateY(${px * 5}deg) rotateX(${-py * 5}deg) translateZ(4px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <article ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ background: "rgba(11,14,12,0.62)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, overflow: "hidden", opacity: locked ? 0.55 : 1, transition: "transform .12s ease-out", willChange: "transform" }}>
      <Ph label={r.img} ratio="16/10" tone="light" style={{ borderRadius: 0, borderBottom: "1px solid rgba(242,237,228,0.06)" }} />
      <div style={{ padding: 26 }}>
        <div style={{ fontFamily: serif, fontSize: 23, letterSpacing: "-0.015em", color: INK }}>{r.title}</div>
        <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 6 }}>{r.sub}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ fontFamily: mono, fontSize: 14, color: canAfford ? TEAL : "rgba(242,237,228,0.5)" }}>{r.cost.toLocaleString()} pts</div>
          <button disabled={!canAfford} onClick={() => { if (canAfford) window.location.href = "Store.html"; }} style={{ padding: "9px 16px", borderRadius: 2, background: canAfford ? TEAL : "rgba(242,237,228,0.08)", color: canAfford ? PAPER : "rgba(242,237,228,0.45)", border: 0, fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: canAfford ? "pointer" : "not-allowed" }}>
            {locked ? "Peak tier" : canAfford ? "Redeem →" : "Keep earning"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ScoreRewards({ v = null, loading = false }) {
  const balance = v ? v.balance : loading ? null : 940;
  return (
    <section style={{ padding: "80px 72px 130px" }}>
      <ScReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 36, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL }}>Rewards</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(38px, 5.4vw, 64px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "14px 0 0", lineHeight: 1 }}>
                Spend your <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>points</em>.
              </h2>
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", textAlign: "right" }}>
              {!v && !loading ? <ScExample style={{ marginBottom: 6 }} /> : null}
              Available balance<br />
              <span style={{ fontFamily: serif, fontSize: 38, color: INK, letterSpacing: "-0.02em" }}>{balance == null ? "—" : balance.toLocaleString()} pts</span>
            </div>
          </div>
          <div className="sc-rewards" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22, perspective: "1400px" }}>
            {REWARDS.map((r, i) => <RewardCard key={i} r={r} balance={balance} />)}
          </div>
        </div>
      </ScReveal>
    </section>
  );
}

// "The Record" — the full Shape Score history + report, reached from the Ledger
// leader. Signed-in members fetch /api/client/score-record (live); signed-out
// shows the baked RECORD_DEMO preview. Same four blocks as the mobile page.
function ScoreRecordView({ onBack }) {
  const [record, setRecord] = React.useState(RECORD_DEMO);
  const [live, setLive] = React.useState(false);
  const [range, setRange] = React.useState("1w");
  const [filter, setFilter] = React.useState("all");
  React.useEffect(function () {
    var alive = true;
    fetch("/api/client/score-record", { credentials: "same-origin", cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (d) { if (alive && d && d.ranges) { setRecord(d); setLive(true); } })
      .catch(function () {});
    return function () { alive = false; };
  }, []);

  var win = record.ranges[range] || record.ranges["1w"];
  var filters = [["all", "All"], ["workouts", "Workouts"], ["habits", "Habits"], ["nutrition", "Nutrition"], ["checkins", "Check-ins"], ["prs", "PRs"], ["penalty", "Penalties"]];
  var days = filter === "all" ? record.history
    : record.history.map(function (d) {
        var rows = d.rows.filter(function (r) { return r.bucket === filter; });
        return Object.assign({}, d, { rows: rows, subtotal: rows.reduce(function (s, r) { return s + r.delta; }, 0) });
      }).filter(function (d) { return d.rows.length; });
  var fmtD = function (iso) { try { return new Date(iso + "T00:00:00Z").toLocaleDateString([], { month: "short", day: "numeric" }); } catch (e) { return iso; } };
  var maxBar = Math.max.apply(null, [1].concat(win.byCategory.map(function (c) { return c.earned; })));
  var register = [["This week", record.ranges["1w"].net], ["This month", record.ranges["1m"].net], ["Earned · " + range.toUpperCase(), win.earned], ["Lost · " + range.toUpperCase(), -win.lost]];

  // Cumulative line — preserveAspectRatio="none" + %-positioned end dot (the same
  // idiom the hero trace uses), scaled between the series min/max.
  var series = win.series, chart;
  if (series.length >= 2) {
    var vals = series.map(function (p) { return p.cumulative; });
    var min = Math.min.apply(null, vals), max = Math.max.apply(null, vals), span = (max - min) || 1, n = series.length;
    var pts = series.map(function (p, i) { return [n === 1 ? 100 : (i / (n - 1)) * 100, 100 - ((p.cumulative - min) / span) * 100]; });
    var dPath = pts.map(function (xy, i) { return (i ? "L" : "M") + xy[0].toFixed(2) + " " + xy[1].toFixed(2); }).join(" ");
    var endPt = pts[pts.length - 1];
    chart = (
      <div style={{ position: "relative", height: 150 }}>
        <svg viewBox="0 0 100 100" preserveAspectRatio="none" style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
          <path d={dPath} fill="none" stroke={TEAL} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <span style={{ position: "absolute", left: endPt[0] + "%", top: endPt[1] + "%", width: 10, height: 10, marginLeft: -5, marginTop: -5, borderRadius: "50%", background: TEAL, boxShadow: "0 0 0 4px rgba(10,197,168,0.25)" }} />
      </div>
    );
  } else {
    chart = <div style={{ padding: "24px 0", fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.55)" }}>Not enough history in this range yet.</div>;
  }

  var card = { background: "rgba(11,14,12,0.62)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6 };
  var eyebrow = { fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL };
  var rangeBtn = function (k) {
    var on = range === k;
    return <button key={k} type="button" onClick={function () { setRange(k); }} style={{ padding: "8px 15px", borderRadius: 2, border: "1px solid rgba(242,237,228,0.16)", background: on ? TEAL : "transparent", color: on ? PAPER : INK, fontFamily: mono, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", cursor: "pointer" }}>{k}</button>;
  };

  return (
    <section style={{ padding: "70px 72px 120px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div onClick={onBack} role="button" tabIndex={0} style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, cursor: "pointer", marginBottom: 26 }}>← Back to Shape Score</div>
        {!live && (
          <div style={{ padding: "12px 16px", border: "1px solid rgba(10,197,168,0.4)", borderRadius: 6, marginBottom: 26, fontFamily: mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", color: TEAL }}>
            Preview · demo record — an example of a live account · <a href="/newdesign/Login.html" style={{ color: TEAL, borderBottom: "1px solid " + TEAL }}>Sign in →</a>
          </div>
        )}

        {/* 1 · Header register */}
        <div style={eyebrow}>Shape Score · The Record</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(40px, 5vw, 60px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "12px 0 0", lineHeight: 1 }}>
          {record.lifetime.toLocaleString()} <span style={{ fontSize: "0.34em", color: "rgba(242,237,228,0.5)", letterSpacing: "0.02em" }}>lifetime</span>
        </h2>
        <div style={{ display: "flex", gap: 44, marginTop: 24, flexWrap: "wrap" }}>
          {register.map(function (pair) {
            var neg = Number(pair[1]) < 0;
            return (
              <div key={pair[0]}>
                <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>{pair[0]}</div>
                <div style={{ fontFamily: serif, fontSize: 30, marginTop: 6, color: neg ? "#e0644b" : INK }}>{Number(pair[1]) >= 0 ? "+" : ""}{pair[1]}</div>
              </div>
            );
          })}
        </div>

        {/* 2 · Score over time */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16, margin: "56px 0 0" }}>
          <div style={eyebrow}>Score over time</div>
          <div style={{ display: "flex", gap: 8 }}>{["1w", "1m", "3m", "all"].map(rangeBtn)}</div>
        </div>
        <div style={Object.assign({}, card, { padding: "26px 28px", marginTop: 16 })}>{chart}</div>

        {/* 3 · By source + penalties */}
        <div style={Object.assign({}, eyebrow, { marginTop: 56 })}>By source · {range.toUpperCase()}</div>
        <div style={Object.assign({}, card, { padding: "26px 28px", marginTop: 16 })}>
          {win.byCategory.length === 0
            ? <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.55)" }}>No points earned in this range yet.</div>
            : win.byCategory.map(function (c) {
              return (
                <div key={c.key} style={{ display: "grid", gridTemplateColumns: "120px 1fr 70px", gap: 16, alignItems: "center", padding: "10px 0" }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: "rgba(242,237,228,0.65)" }}>{c.label}</div>
                  <div style={{ height: 10, background: "rgba(242,237,228,0.08)", borderRadius: 3, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: Math.max(3, (c.earned / maxBar) * 100) + "%", background: TEAL, borderRadius: 3 }} />
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 14, color: TEAL, textAlign: "right" }}>+{c.earned}</div>
                </div>
              );
            })}
          {win.lost > 0 && (
            <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "#e0644b" }}>− Penalties · {win.lost} lost</div>
              {win.penalties.slice(0, 3).map(function (p, i) {
                return (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", marginTop: 10, fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.7)" }}>
                    <span>{p.note}</span>
                    <span style={{ fontFamily: mono, color: "#e0644b" }}>{p.total}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* 4 · The full history */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 16, margin: "56px 0 0" }}>
          <div style={eyebrow}>The full history</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {filters.map(function (f) {
              var on = filter === f[0];
              return <button key={f[0]} type="button" onClick={function () { setFilter(f[0]); }} style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid " + (on ? TEAL : "rgba(242,237,228,0.16)"), background: on ? "rgba(10,197,168,0.12)" : "transparent", color: on ? TEAL : "rgba(242,237,228,0.7)", fontFamily: mono, fontSize: 11, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer" }}>{f[1]}</button>;
            })}
          </div>
        </div>
        <div className="sc-scroll" style={Object.assign({}, card, { marginTop: 16, maxHeight: 560, overflowY: "auto" })}>
          {days.length === 0 ? (
            <div style={{ padding: "28px 26px", fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.55)" }}>No entries in this filter yet.</div>
          ) : days.map(function (d, di) {
            return (
              <div key={d.date} style={{ padding: "20px 26px", borderTop: di ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>{fmtD(d.date)}</div>
                  <div style={{ fontFamily: mono, fontSize: 13, color: d.subtotal < 0 ? "#e0644b" : TEAL }}>{d.subtotal >= 0 ? "+" : ""}{d.subtotal}</div>
                </div>
                {d.rows.map(function (r, i) {
                  return (
                    <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "8px 0", alignItems: "baseline" }}>
                      <div style={{ fontFamily: serif, fontSize: 17, color: INK }}>{r.note}</div>
                      <div style={{ fontFamily: mono, fontSize: 13, color: r.isPenalty ? "#e0644b" : TEAL }}>{r.delta >= 0 ? "+" : ""}{r.delta}</div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ScorePage() {
  const [recordOpen, setRecordOpen] = React.useState(false);
  // "loading" until the Standing answers, null for a visitor (the example), else the reads. Everyone starts
  // waiting: a member signed in through the Next.js login holds the session in cookies only, which this
  // page cannot see, and the score route is what reads them (Codex on #2701). A visitor's 401 is quick.
  const [live, setLive] = React.useState("loading");
  React.useEffect(function () {
    var alive = true;
    var get = function (url) {
      return fetch(url, { credentials: "same-origin", cache: "no-store" }).then(function (r) { return r.ok ? r.json() : null; });
    };
    get("/api/client/score").then(function (score) {
      if (!alive) return;
      if (!score || typeof score !== "object") { setLive(null); return; }
      setLive({ score: score, record: null });
      return get("/api/client/score-record").then(function (record) {
        if (alive && record && typeof record === "object") setLive(function (cur) { return cur && cur !== "loading" ? { score: cur.score, record: record } : cur; });
      });
    }).catch(function () { if (alive) setLive(function (cur) { return cur === "loading" ? null : cur; }); });
    return function () { alive = false; };
  }, []);
  const loading = live === "loading";
  const v = live && !loading ? scView(live.score, live.record, Date.now()) : null;
  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Rewards-bg.webp')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none", opacity: 0.9 }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 6%, rgba(26,24,19,0.28) 0%, rgba(11,14,12,0.52) 55%, rgba(11,14,12,0.74) 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        {/* The bar's tab for this page is labelled Rewards, and a tab lights only
            when active equals its label — "Shape Score" lit nothing, so the one
            page the Rewards tab opens was the one page it never marked. */}
        <Header active="Rewards" />
        {recordOpen ? (
          <ScoreRecordView onBack={function () { setRecordOpen(false); }} />
        ) : (
          <React.Fragment>
            <ScoreHero v={v} loading={loading} />
            <ScoreTiers v={v} loading={loading} />
            <ScoreActivity v={v} loading={loading} />
            <ScoreLedger v={v} loading={loading} onOpenRecord={function () { setRecordOpen(true); }} />
            <ScoreRewards v={v} loading={loading} />
          </React.Fragment>
        )}
        <Footer />
      </div>
      <style>{`
        @media (max-width: 900px) {
          .sc-hero { grid-template-columns: 1fr !important; }
          .sc-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .sc-act { grid-template-columns: 1fr !important; }
          .sc-rewards { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ScorePage />);
