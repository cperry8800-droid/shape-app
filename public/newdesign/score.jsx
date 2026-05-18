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
  { d: "Apr 18", t: "Morning mobility logged", p: 3, k: "habit" },
  { d: "Apr 17", t: "Protein target hit · 3rd day", p: 5, k: "nutrition" },
  { d: "Apr 17", t: "Session kept · Rae Lindqvist", p: 13, k: "session" },
  { d: "Apr 16", t: "Sleep ≥ 7h", p: 3, k: "recovery" },
  { d: "Apr 16", t: "Upper pull logged", p: 9, k: "workout" },
  { d: "Apr 15", t: "Weekly review submitted", p: 15, k: "milestone" },
  { d: "Apr 15", t: "Steps ≥ 8,000", p: 2, k: "habit" },
  { d: "Apr 14", t: "Session kept · Maya Okafor", p: 14, k: "session" },
];

const REWARDS = [
  { title: "$25 session credit", sub: "Use with any coach", cost: 500, img: "credit" },
  { title: "Shape Radio · Studio tier", sub: "3 months, ad-free", cost: 750, img: "radio" },
  { title: "Coach intro · 2nd opinion", sub: "Free 30-min with any trainer", cost: 900, img: "coach" },
  { title: "Nutrition plan refresh", sub: "Full plan rebuild with your RD", cost: 1200, img: "nutrition" },
  { title: "Shape merch — 20% off", sub: "In-house apparel and essentials", cost: 400, img: "store" },
  { title: "Annual membership credit", sub: "$200 toward next year", cost: 3500, img: "annual", locked: true },
];

// 84 days of activity (12 weeks × 7 days)
const HEATMAP = Array.from({ length: 84 }, (_, i) => {
  const v = Math.max(0, Math.sin(i * 0.7) + Math.sin(i * 0.3) + 0.5);
  return i > 80 ? 0 : Math.min(4, Math.round(v * 2));
});

const TIERS = [
  { name: "Raw",    min: 0,     color: "rgba(242,237,228,0.35)", desc: "Starting level" },
  { name: "Tempo",  min: 750,   color: "rgba(242,237,228,0.85)", current: true, desc: "2× redemption value" },
  { name: "Form",   min: 2000,  color: "#e89740",                desc: "Early access drops + streak boosts" },
  { name: "Peak",   min: 5000,  color: "#0a7463",                desc: "Priority booking + 1 free intro / mo" },
  { name: "Legend", min: 15000, color: "#0ac5a8",                desc: "Annual Shape merch + service credit" },
];

const SC_RPR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

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

function ScoreHero() {
  const pct = SCORE_TOTAL / SCORE_GOAL;
  const R = 118;
  const C = 2 * Math.PI * R;
  return (
    <section style={{ padding: "150px 72px 60px", position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", width: 600, height: 600, top: "-22%", right: "-6%", borderRadius: "50%", filter: "blur(80px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div className="sc-hero" style={{ display: "grid", gridTemplateColumns: "1.2fr 1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 22 }}>Shape Score · Priya Shankar</div>
            <h1 style={{ fontFamily: serif, fontSize: "clamp(54px, 8vw, 116px)", letterSpacing: "-0.045em", fontWeight: 300, margin: 0, lineHeight: 0.88 }}>
              Rewards for<br /><em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>showing&nbsp;up</em>.
            </h1>
            <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.6, color: "rgba(242,237,228,0.66)", margin: "30px 0 0", maxWidth: 520 }}>
              Every logged workout, tracked meal, and kept session adds up. Spend points on training credits, nutrition services, Shape Radio, or Shape merch. No expiry, no gotchas.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 34 }}>
              <button style={{ background: TEAL, color: PAPER, border: 0, padding: "16px 26px", borderRadius: 2, fontFamily: sans, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Redeem points →</button>
              <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.22)", padding: "16px 26px", borderRadius: 2, fontFamily: sans, fontSize: 14, cursor: "pointer" }}>How points work</button>
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
              <text x="140" y="128" textAnchor="middle" fontFamily="Fraunces, serif" fontSize="72" fontWeight="400" fill={INK} letterSpacing="-3">{SCORE_TOTAL}</text>
              <text x="140" y="152" textAnchor="middle" fontFamily="Space Grotesk, sans-serif" fontSize="13" fill="rgba(242,237,228,0.5)">of {SCORE_GOAL}</text>
              <text x="140" y="176" textAnchor="middle" fontFamily="JetBrains Mono, monospace" fontSize="10" fill={TEAL} letterSpacing="1.5">{STREAK}-DAY STREAK</text>
            </svg>
          </div>
        </div>
        <div className="sc-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginTop: 60, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          {[
            ["+36", "Points this week", "vs 32 last"],
            [`${STREAK}d`, "Current streak", "personal best 22d"],
            [TIER, "Tier", `${POINTS_TO_NEXT.toLocaleString()} to ${NEXT_TIER}`],
            ["940", "Available to spend", "344 reserved"],
          ].map(([k, l, s], i) => (
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

function ScoreTiers() {
  return (
    <section style={{ padding: "70px 72px" }}>
      <ScReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>Tiers</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(36px, 5vw, 60px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "0 0 44px", lineHeight: 1 }}>
            You're <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>{TIER}</em>. {POINTS_TO_NEXT.toLocaleString()} to {NEXT_TIER}.
          </h2>
          <div style={{ position: "relative", padding: "40px 0" }}>
            <div style={{ position: "absolute", left: 0, right: 0, top: "50%", height: 2, background: "rgba(242,237,228,0.12)", transform: "translateY(-50%)" }} />
            <div style={{ position: "absolute", left: 0, top: "50%", height: 2, background: `linear-gradient(90deg, ${TEAL}, ${TEAL_BRIGHT})`, transform: "translateY(-50%)", width: `${(SCORE_TOTAL / 15000) * 100}%` }} />
            <div style={{ display: "grid", gridTemplateColumns: `repeat(${TIERS.length}, 1fr)`, position: "relative" }}>
              {TIERS.map((t, i) => {
                const reached = SCORE_TOTAL >= t.min;
                const current = t.current;
                return (
                  <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12 }}>
                    <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{t.min.toLocaleString()}</div>
                    <div style={{ height: 32, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <div style={{ width: current ? 28 : 18, height: current ? 28 : 18, borderRadius: 999, background: reached ? (current ? TEAL : t.color) : INK_DEEP, border: `2px solid ${reached ? t.color : "rgba(242,237,228,0.2)"}`, boxShadow: current ? `0 0 0 6px rgba(19,194,168,0.18)` : "none" }} />
                    </div>
                    <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.01em", color: reached ? INK : "rgba(242,237,228,0.45)" }}>{t.name}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.5)", textAlign: "center", maxWidth: 160 }}>{t.desc}</div>
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

function ScoreActivity() {
  const weeks = 12;
  const shade = (v) => {
    if (v === 0) return "rgba(242,237,228,0.05)";
    if (v === 1) return "rgba(19,194,168,0.25)";
    if (v === 2) return "rgba(19,194,168,0.5)";
    if (v === 3) return "rgba(19,194,168,0.75)";
    return TEAL;
  };
  return (
    <section style={{ padding: "70px 72px" }}>
      <ScReveal>
        <div className="sc-act" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
          <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, padding: 36, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 26 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL }}>Activity · last 12 weeks</div>
                <h3 style={{ fontFamily: serif, fontSize: 34, letterSpacing: "-0.025em", fontWeight: 400, margin: "10px 0 0" }}>Consistency tells the story.</h3>
              </div>
              <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)" }}>{STREAK}d · {HEATMAP.filter(v => v > 0).length}/84</div>
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
            <div style={{ display: "flex", justifyContent: "flex-end", alignItems: "center", gap: 8, marginTop: 18, fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
              <span>Less</span>
              {[0, 1, 2, 3, 4].map(v => <div key={v} style={{ width: 12, height: 12, background: shade(v), borderRadius: 2 }} />)}
              <span>More</span>
            </div>
          </div>
          <div style={{ background: INK, color: PAPER, borderRadius: 6, padding: 36, display: "flex", flexDirection: "column" }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL }}>How you earn</div>
            <h3 style={{ fontFamily: serif, fontSize: 34, letterSpacing: "-0.025em", fontWeight: 400, margin: "10px 0 26px", color: PAPER }}>Points, by action.</h3>
            {[
              ["Session kept", "with a coach", "12–18"],
              ["Workout logged", "solo or programmed", "6–10"],
              ["Protein target hit", "daily goal", "5"],
              ["Sleep ≥ 7 hours", "wearable-verified", "3"],
              ["Habit streak", "any logged habit", "2–4"],
              ["Weekly review", "submitted on time", "15"],
              ["New PR logged", "any lift or run", "12"],
            ].map(([k, sub, p], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 16, padding: "13px 0", borderTop: i ? "1px solid rgba(26,22,18,0.1)" : "none", alignItems: "baseline" }}>
                <div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 600 }}>{k}</div>
                  <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(26,22,18,0.55)", marginTop: 2 }}>{sub}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 13, color: TEAL }}>+{p}</div>
              </div>
            ))}
          </div>
        </div>
      </ScReveal>
    </section>
  );
}

function ScoreLedger() {
  return (
    <section style={{ padding: "70px 72px" }}>
      <ScReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 26, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL }}>Ledger</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(34px, 4.4vw, 52px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "14px 0 0", lineHeight: 1 }}>Recent earnings.</h2>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              {["All", "Sessions", "Habits", "Nutrition", "Workouts"].map((t, i) => (
                <button key={t} style={{ padding: "9px 16px", borderRadius: 2, border: "1px solid rgba(242,237,228,0.16)", background: i === 0 ? INK : "transparent", color: i === 0 ? PAPER : INK, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, overflow: "hidden" }}>
            {LEDGER.map((row, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 86px 1fr auto", gap: 20, padding: "19px 26px", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none", alignItems: "center" }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)" }}>{row.d}</div>
                <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 8px", background: "rgba(19,194,168,0.1)", color: TEAL, borderRadius: 3, letterSpacing: "0.1em", textTransform: "uppercase", justifySelf: "start" }}>{row.k}</span>
                <div style={{ fontFamily: serif, fontSize: 18, color: INK }}>{row.t}</div>
                <div style={{ fontFamily: mono, fontSize: 14, color: TEAL, fontWeight: 500 }}>+{row.p}</div>
              </div>
            ))}
          </div>
        </div>
      </ScReveal>
    </section>
  );
}

function RewardCard({ r }) {
  const ref = React.useRef(null);
  const canAfford = !r.locked && r.cost <= 940;
  const onMove = (e) => {
    if (SC_RPR || !ref.current) return;
    const b = ref.current.getBoundingClientRect();
    const px = (e.clientX - b.left) / b.width - 0.5, py = (e.clientY - b.top) / b.height - 0.5;
    ref.current.style.transform = `perspective(1200px) rotateY(${px * 5}deg) rotateX(${-py * 5}deg) translateZ(4px)`;
  };
  const onLeave = () => { if (ref.current) ref.current.style.transform = ""; };
  return (
    <article ref={ref} onMouseMove={onMove} onMouseLeave={onLeave} style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, overflow: "hidden", opacity: r.locked ? 0.55 : 1, transition: "transform .12s ease-out", willChange: "transform" }}>
      <Ph label={r.img} ratio="16/10" tone="light" style={{ borderRadius: 0, borderBottom: "1px solid rgba(242,237,228,0.06)" }} />
      <div style={{ padding: 26 }}>
        <div style={{ fontFamily: serif, fontSize: 23, letterSpacing: "-0.015em", color: INK }}>{r.title}</div>
        <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 6 }}>{r.sub}</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 22, paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ fontFamily: mono, fontSize: 14, color: canAfford ? TEAL : "rgba(242,237,228,0.5)" }}>{r.cost.toLocaleString()} pts</div>
          <button disabled={!canAfford} style={{ padding: "9px 16px", borderRadius: 2, background: canAfford ? TEAL : "rgba(242,237,228,0.08)", color: canAfford ? PAPER : "rgba(242,237,228,0.45)", border: 0, fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: canAfford ? "pointer" : "not-allowed" }}>
            {r.locked ? "Peak tier" : canAfford ? "Redeem →" : "Keep earning"}
          </button>
        </div>
      </div>
    </article>
  );
}

function ScoreRewards() {
  return (
    <section style={{ padding: "80px 72px 130px" }}>
      <ScReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 36, flexWrap: "wrap", gap: 16 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL }}>Rewards</div>
              <h2 style={{ fontFamily: serif, fontSize: "clamp(38px, 5.4vw, 64px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "14px 0 0", lineHeight: 1 }}>
                Spend your <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>940</em>.
              </h2>
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", textAlign: "right" }}>
              Available balance<br />
              <span style={{ fontFamily: serif, fontSize: 38, color: INK, letterSpacing: "-0.02em" }}>940 pts</span>
            </div>
          </div>
          <div className="sc-rewards" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 22, perspective: "1400px" }}>
            {REWARDS.map((r, i) => <RewardCard key={i} r={r} />)}
          </div>
        </div>
      </ScReveal>
    </section>
  );
}

function ScorePage() {
  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Rewards.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none", opacity: 0.9 }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 6%, rgba(26,24,19,0.28) 0%, rgba(11,14,12,0.52) 55%, rgba(11,14,12,0.74) 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Shape Score" />
        <ScoreHero />
        <ScoreTiers />
        <ScoreActivity />
        <ScoreLedger />
        <ScoreRewards />
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
