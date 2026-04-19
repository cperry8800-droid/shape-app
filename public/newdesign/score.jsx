// Shape Score — dedicated member page
const { useState: useSScore } = React;

const SCORE_TOTAL = 1284;
const SCORE_GOAL = 1500;
const STREAK = 14;
const TIER = "Tempo";
const NEXT_TIER = "Peak";
const POINTS_TO_NEXT = 216;

const LEDGER = [
  { d: "Apr 18", t: "Session kept · Maya Okafor", p: 32, k: "session" },
  { d: "Apr 18", t: "Morning mobility logged", p: 6, k: "habit" },
  { d: "Apr 17", t: "Protein target hit · 3rd day", p: 14, k: "nutrition" },
  { d: "Apr 17", t: "Session kept · Rae Lindqvist", p: 28, k: "session" },
  { d: "Apr 16", t: "Sleep ≥ 7h", p: 8, k: "recovery" },
  { d: "Apr 16", t: "Upper pull logged", p: 22, k: "workout" },
  { d: "Apr 15", t: "Weekly review submitted", p: 40, k: "milestone" },
  { d: "Apr 15", t: "Steps ≥ 8,000", p: 6, k: "habit" },
  { d: "Apr 14", t: "Session kept · Maya Okafor", p: 32, k: "session" },
];

const REWARDS = [
  { title: "$25 session credit", sub: "Use with any coach", cost: 500, img: "credit" },
  { title: "Shape Radio · Studio tier", sub: "3 months, ad-free", cost: 750, img: "radio" },
  { title: "Coach intro · 2nd opinion", sub: "Free 30-min with any trainer", cost: 900, img: "coach" },
  { title: "Nutrition plan refresh", sub: "Full plan rebuild with your RD", cost: 1200, img: "nutrition" },
  { title: "Shape Store — 20% off", sub: "Apparel, gear, supplements", cost: 400, img: "store" },
  { title: "Annual membership credit", sub: "$200 toward next year", cost: 3500, img: "annual", locked: true },
];

// 84 days of activity (12 weeks × 7 days)
const HEATMAP = Array.from({ length: 84 }, (_, i) => {
  const v = Math.max(0, Math.sin(i * 0.7) + Math.sin(i * 0.3) + 0.5);
  return i > 80 ? 0 : Math.min(4, Math.round(v * 2));
});

const TIERS = [
  { name: "Raw", min: 0, color: "rgba(242,237,228,0.35)" },
  { name: "Tempo", min: 1000, color: "rgba(242,237,228,0.85)", current: true },
  { name: "Peak", min: 1500, color: "#0a7463" },
  { name: "Legend", min: 3000, color: "#0ac5a8" },
];

function RewardsHeroBg() {
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url('/Rewards.png')", backgroundSize: "cover", backgroundPosition: "center center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(26,22,18,0.5) 0%, rgba(26,22,18,0.2) 35%, rgba(26,22,18,0.3) 65%, rgba(26,22,18,0.88) 95%, rgba(26,22,18,1) 100%)", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(26,22,18,0.35) 0%, rgba(26,22,18,0.1) 35%, rgba(26,22,18,0) 60%)", pointerEvents: "none" }} />
    </>
  );
}

function ScoreHero() {
  const pct = SCORE_TOTAL / SCORE_GOAL;
  const R = 118;
  const C = 2 * Math.PI * R;
  return (
    <section style={{ padding: "80px 40px 60px", position: "relative", overflow: "hidden" }}>
      <RewardsHeroBg />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Shape Score · Priya Shankar</div>
            <h1 style={{ fontFamily: serif, fontSize: 104, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.9 }}>
              Rewards for<br/><em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>showing&nbsp;up</em>.
            </h1>
            <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.7)", margin: "24px 0 0", maxWidth: 520 }}>
              Every logged workout, tracked meal, and kept session adds up. Spend points on session credits, Radio, or Shape Store gear. No expiry, no gotchas.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 32 }}>
              <button style={{ background: INK, color: PAPER, border: 0, padding: "14px 22px", borderRadius: 6, fontFamily: sans, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Redeem points →</button>
              <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", padding: "14px 22px", borderRadius: 6, fontFamily: sans, fontSize: 14, cursor: "pointer" }}>How points work</button>
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
              <circle
                cx="140" cy="140" r={R}
                stroke="url(#ring-grad)"
                strokeWidth="14" fill="none" strokeLinecap="round"
                strokeDasharray={`${C * pct} ${C}`}
                transform="rotate(-90 140 140)"
              />
              <text x="140" y="128" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="72" fontWeight="400" fill={INK} letterSpacing="-3">{SCORE_TOTAL}</text>
              <text x="140" y="152" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontSize="13" fill="rgba(242,237,228,0.5)">of {SCORE_GOAL}</text>
              <text x="140" y="176" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill={TEAL} letterSpacing="1.5">{STREAK}-DAY STREAK</text>
            </svg>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginTop: 56, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          {[
            ["+82", "Points this week", "vs 71 last"],
            [`${STREAK}d`, "Current streak", "personal best 22d"],
            [TIER, "Tier", `${POINTS_TO_NEXT} to ${NEXT_TIER}`],
            ["940", "Available to spend", "344 reserved"],
          ].map(([k, l, s], i) => (
            <div key={i} style={{ padding: "28px 24px", borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
              <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 500, color: INK, marginTop: 10 }}>{l}</div>
              <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScoreTiers() {
  return (
    <section style={{ padding: "60px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Tiers</div>
        <h2 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 40px", lineHeight: 1 }}>
          You're <em style={{ fontStyle: "italic", color: TEAL }}>Tempo</em>. 216 to Peak.
        </h2>
        <div style={{ position: "relative", padding: "40px 0" }}>
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: "rgba(242,237,228,0.12)", transform: "translateY(-50%)" }} />
          <div style={{ position: "absolute", left: 0, top: "50%", height: 2, background: TEAL, transform: "translateY(-50%)", width: `${(SCORE_TOTAL / 3000) * 100}%` }} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", position: "relative" }}>
            {TIERS.map((t, i) => {
              const reached = SCORE_TOTAL >= t.min;
              const current = t.current;
              return (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{t.min.toLocaleString()}</div>
                  <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: current ? 28 : 18, height: current ? 28 : 18, borderRadius: 999, background: reached ? (current ? TEAL : t.color) : "#fff", border: `2px solid ${reached ? t.color : "rgba(242,237,228,0.2)"}`, boxShadow: current ? `0 0 0 6px rgba(30,192,168,0.15)` : "none" }} />
                  </div>
                  <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.01em", color: reached ? INK : "rgba(242,237,228,0.45)" }}>{t.name}</div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.5)", textAlign: "center", maxWidth: 160 }}>
                    {i === 0 && "Starting level"}
                    {i === 1 && "2× redemption value"}
                    {i === 2 && "Priority booking + 1 free intro / mo"}
                    {i === 3 && "Annual store credit + tier gear"}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

function ScoreActivity() {
  const weeks = 12;
  const shade = (v) => {
    if (v === 0) return "rgba(242,237,228,0.05)";
    if (v === 1) return "rgba(30,192,168,0.25)";
    if (v === 2) return "rgba(30,192,168,0.5)";
    if (v === 3) return "rgba(30,192,168,0.75)";
    return TEAL;
  };
  return (
    <section style={{ padding: "60px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40 }}>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Activity · last 12 weeks</div>
              <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: "8px 0 0" }}>Consistency tells the story.</h3>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}>{STREAK}d · {HEATMAP.filter(v => v > 0).length}/84</div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${weeks}, 1fr)`, gap: 4 }}>
            {Array.from({ length: weeks }, (_, w) => (
              <div key={w} style={{ display: "grid", gridTemplateRows: "repeat(7, 1fr)", gap: 4 }}>
                {Array.from({ length: 7 }, (_, d) => {
                  const v = HEATMAP[w * 7 + d];
                  return <div key={d} style={{ aspectRatio: "1/1", background: shade(v), borderRadius: 3 }} />;
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 16, fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
            <span>Less</span>
            {[0, 1, 2, 3, 4].map(v => <div key={v} style={{ width: 12, height: 12, background: shade(v), borderRadius: 2 }} />)}
            <span>More</span>
          </div>
        </div>

        <div style={{ background: INK, color: PAPER, borderRadius: 12, padding: 32, display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>How you earn</div>
          <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: "8px 0 24px", color: PAPER }}>Points, by action.</h3>
          {[
            ["Session kept", "with a coach", "25–40"],
            ["Workout logged", "solo or programmed", "15–25"],
            ["Protein target hit", "daily goal", "12"],
            ["Sleep ≥ 7 hours", "wearable-verified", "8"],
            ["Habit streak", "any logged habit", "5–10"],
            ["Weekly review", "submitted on time", "40"],
            ["New PR logged", "any lift or run", "30"],
          ].map(([k, sub, p], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "12px 0", borderTop: i ? "1px solid rgba(26,22,18,0.1)" : "none", alignItems: "baseline" }}>
              <div>
                <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 500 }}>{k}</div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(26,22,18,0.55)", marginTop: 2 }}>{sub}</div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: TEAL }}>+{p}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScoreLedger() {
  return (
    <section style={{ padding: "60px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Ledger</div>
            <h2 style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.03em", fontWeight: 400, margin: "12px 0 0", lineHeight: 1 }}>Recent earnings.</h2>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            {["All", "Sessions", "Habits", "Nutrition", "Workouts"].map((t, i) => (
              <button key={t} style={{ padding: "8px 14px", borderRadius: 999, border: "1px solid rgba(242,237,228,0.15)", background: i === 0 ? INK : "transparent", color: i === 0 ? PAPER : INK, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, overflow: "hidden" }}>
          {LEDGER.map((row, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 80px 1fr auto", gap: 20, padding: "18px 24px", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none", alignItems: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}>{row.d}</div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: "3px 8px", background: "rgba(30,192,168,0.08)", color: TEAL, borderRadius: 4, letterSpacing: "0.1em", textTransform: "uppercase", justifySelf: "start" }}>{row.k}</span>
              <div style={{ fontFamily: serif, fontSize: 17, color: INK }}>{row.t}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: TEAL, fontWeight: 500 }}>+{row.p}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function ScoreRewards() {
  return (
    <section style={{ padding: "80px 40px 120px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 32 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Rewards</div>
            <h2 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: "12px 0 0", lineHeight: 1 }}>
              Spend your <em style={{ fontStyle: "italic", color: TEAL }}>940</em>.
            </h2>
          </div>
          <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", textAlign: "right" }}>
            Available balance<br/>
            <span style={{ fontFamily: serif, fontSize: 36, color: INK, letterSpacing: "-0.02em" }}>940 pts</span>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {REWARDS.map((r, i) => {
            const canAfford = !r.locked && r.cost <= 940;
            return (
              <article key={i} style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, overflow: "hidden", opacity: r.locked ? 0.55 : 1 }}>
                <Ph label={r.img} ratio="16/10" tone="light" style={{ borderRadius: 0, borderBottom: "1px solid rgba(242,237,228,0.06)" }} />
                <div style={{ padding: 24 }}>
                  <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", color: INK }}>{r.title}</div>
                  <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 6 }}>{r.sub}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: canAfford ? TEAL : "rgba(242,237,228,0.5)" }}>{r.cost.toLocaleString()} pts</div>
                    <button disabled={!canAfford} style={{ padding: "8px 14px", borderRadius: 6, background: canAfford ? INK : "rgba(242,237,228,0.08)", color: canAfford ? PAPER : "rgba(242,237,228,0.45)", border: 0, fontFamily: sans, fontSize: 12, fontWeight: 500, cursor: canAfford ? "pointer" : "not-allowed" }}>
                      {r.locked ? "Peak tier" : canAfford ? "Redeem →" : "Keep earning"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function ScorePage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans }}>
      <Header active="Shape Score" />
      <ScoreHero />
      <ScoreTiers />
      <ScoreActivity />
      <ScoreLedger />
      <ScoreRewards />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ScorePage />);
