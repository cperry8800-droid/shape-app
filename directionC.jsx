// Direction C — Platform (Stripe-style)
// Light, airy, soft gradients, floating product UI
const DirC = (() => {
  const BG = "#fbfbfa";
  const INK = "#0a1f1b";
  const TEAL = "#0ac5a8";
  const TEAL_DEEP = "#068a75";

  const sans = "'Inter Tight', sans-serif";
  const mono = "'JetBrains Mono', monospace";

  // ---- shared gradient blob ----
  function Aurora({ height = 700 }) {
    return (
      <div aria-hidden style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
        <svg width="100%" height={height} viewBox="0 0 1440 700" preserveAspectRatio="none" style={{ position: "absolute", top: 0, left: 0 }}>
          <defs>
            <linearGradient id="aurora-g1" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#c7f5ec" stopOpacity="0.9" />
              <stop offset="0.5" stopColor="#e8fbf6" stopOpacity="0.6" />
              <stop offset="1" stopColor="#fbfbfa" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="aurora-g2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#d4f4e8" stopOpacity="0.7" />
              <stop offset="1" stopColor="#fbfbfa" stopOpacity="0" />
            </linearGradient>
            <filter id="blurMe"><feGaussianBlur stdDeviation="60" /></filter>
          </defs>
          <g filter="url(#blurMe)">
            <path d="M-100,80 C200,-40 600,150 900,60 C1200,-30 1500,180 1600,120 L1600,0 L-100,0 Z" fill="url(#aurora-g1)" />
            <ellipse cx="1100" cy="260" rx="560" ry="260" fill="#0ac5a8" opacity="0.18" />
            <ellipse cx="200" cy="380" rx="480" ry="220" fill="#7de3c8" opacity="0.22" />
          </g>
        </svg>
      </div>
    );
  }

  // ---- Nav ----
  function Nav() {
    const link = { fontSize: 13.5, color: "rgba(10,31,27,0.72)", fontWeight: 500, fontFamily: sans };
    return (
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(251,251,250,0.82)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px" }}>
          <ShapeWord color={INK} />
          <nav style={{ display: "flex", gap: 28 }}>
            {["Marketplace", "Trainers", "Nutritionists", "Shape Score", "Radio", "Pricing"].map(l => <a key={l} style={link}>{l}</a>)}
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <a href="Login.html" style={link}>Log in</a>
            <button style={{ background: INK, color: "#fff", border: 0, padding: "10px 18px", borderRadius: 999, fontWeight: 500, fontSize: 13, fontFamily: sans, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>Start training <span>›</span></button>
          </div>
        </div>
      </header>
    );
  }

  // ---- Hero ----
  function Hero() {
    return (
      <section style={{ position: "relative", padding: "80px 40px 100px", overflow: "hidden" }}>
        <Aurora />
        <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 6px", background: "rgba(255,255,255,0.7)", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 999, fontFamily: sans, fontSize: 12.5, color: "rgba(10,31,27,0.75)", marginBottom: 32 }}>
            <span style={{ padding: "2px 8px", background: TEAL, color: INK, borderRadius: 999, fontWeight: 600, fontSize: 11 }}>NEW</span>
            Shape Score 2.0 — earn on every session
            <span style={{ color: TEAL_DEEP }}>→</span>
          </div>
          <h1 style={{ fontFamily: sans, fontSize: 112, lineHeight: 0.94, letterSpacing: "-0.04em", fontWeight: 500, margin: 0, color: INK, maxWidth: 1100, marginInline: "auto" }}>
            The coaching platform<br/>for <span style={{ color: TEAL_DEEP, fontStyle: "italic", fontWeight: 400 }}>people</span> who want results.
          </h1>
          <p style={{ fontFamily: sans, fontSize: 20, color: "rgba(10,31,27,0.65)", lineHeight: 1.5, maxWidth: 620, marginInline: "auto", marginTop: 28 }}>
            Shape is the infrastructure for human coaching. One marketplace for clients, one dashboard for trainers and nutritionists, one platform for the whole practice.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36 }}>
            <button style={{ background: INK, color: "#fff", border: 0, padding: "15px 24px", borderRadius: 999, fontWeight: 500, fontSize: 15, fontFamily: sans, cursor: "pointer" }}>Start training →</button>
            <button style={{ background: "#fff", color: INK, border: "1px solid rgba(10,31,27,0.12)", padding: "15px 24px", borderRadius: 999, fontWeight: 500, fontSize: 15, fontFamily: sans, cursor: "pointer" }}>Apply as coach</button>
          </div>

          {/* Floating product preview */}
          <div style={{ marginTop: 80, position: "relative" }}>
            <HeroProduct />
          </div>
        </div>
      </section>
    );
  }

  function HeroProduct() {
    return (
      <div style={{ position: "relative", maxWidth: 1160, margin: "0 auto" }}>
        {/* Main browser-ish card */}
        <div style={{ background: "#fff", borderRadius: 16, boxShadow: "0 30px 80px -30px rgba(6,138,117,0.35), 0 10px 30px -10px rgba(10,31,27,0.15)", border: "1px solid rgba(10,31,27,0.06)", overflow: "hidden" }}>
          <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(10,31,27,0.06)", display: "flex", alignItems: "center", gap: 10, background: "rgba(251,251,250,0.6)" }}>
            <div style={{ display: "flex", gap: 6 }}>
              {["#ed6a5e", "#f4bf4f", "#62c554"].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c, opacity: 0.7 }} />)}
            </div>
            <div style={{ margin: "0 auto", fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.5)" }}>shape.app/marketplace</div>
          </div>
          <MarketplacePreview />
        </div>

        {/* Floating chips */}
        <div style={{ position: "absolute", left: -20, top: 80, background: "#fff", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 14, padding: 14, display: "flex", gap: 12, alignItems: "center", width: 230, boxShadow: "0 20px 50px -10px rgba(10,31,27,0.18)", textAlign: "left" }}>
          <div style={{ width: 38, height: 38, borderRadius: 10, background: `linear-gradient(135deg, ${TEAL}, ${TEAL_DEEP})`, display: "grid", placeItems: "center", color: "#fff", fontFamily: sans, fontWeight: 600 }}>↑</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontFamily: sans, color: "rgba(10,31,27,0.55)" }}>Shape Score · 7d</div>
            <div style={{ fontSize: 18, fontFamily: sans, fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>+142 pts</div>
          </div>
        </div>

        <div style={{ position: "absolute", right: -20, top: 200, background: "#fff", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 14, padding: 14, width: 240, boxShadow: "0 20px 50px -10px rgba(10,31,27,0.18)", textAlign: "left" }}>
          <div style={{ fontFamily: mono, fontSize: 10, color: TEAL_DEEP, letterSpacing: "0.12em", textTransform: "uppercase" }}>Payout · today</div>
          <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 500, letterSpacing: "-0.01em", color: INK, marginTop: 4 }}>$562.00</div>
          <div style={{ height: 6, background: "rgba(10,31,27,0.08)", borderRadius: 999, marginTop: 12, overflow: "hidden" }}>
            <div style={{ width: "72%", height: "100%", background: TEAL, borderRadius: 999 }} />
          </div>
          <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(10,31,27,0.55)", marginTop: 6 }}>$14,820 · month to date</div>
        </div>
      </div>
    );
  }

  function MarketplacePreview() {
    return (
      <div style={{ padding: 24, textAlign: "left" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(10,31,27,0.55)" }}>Marketplace</div>
            <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", color: INK, marginTop: 2 }}>3,100 certified coaches</div>
          </div>
          <div style={{ display: "flex", gap: 6, background: "#f5f6f5", borderRadius: 999, padding: 3 }}>
            {["All", "Trainers", "Nutrition"].map((t, i) => (
              <button key={t} style={{ padding: "7px 14px", borderRadius: 999, border: 0, fontSize: 12, fontFamily: sans, fontWeight: 500, background: i === 0 ? "#fff" : "transparent", color: i === 0 ? INK : "rgba(10,31,27,0.6)", cursor: "pointer", boxShadow: i === 0 ? "0 1px 3px rgba(10,31,27,0.08)" : "none" }}>{t}</button>
            ))}
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12 }}>
          {COACHES.slice(0, 4).map((c, i) => (
            <div key={i} style={{ background: "#fff", border: "1px solid rgba(10,31,27,0.06)", borderRadius: 12, overflow: "hidden" }}>
              <Placeholder label={c.name.split(' ')[0]} ratio="4/3" tone="light" style={{ borderRadius: 0 }} />
              <div style={{ padding: 12 }}>
                <div style={{ fontSize: 13.5, fontFamily: sans, fontWeight: 500, color: INK }}>{c.name}</div>
                <div style={{ fontSize: 11.5, fontFamily: sans, color: "rgba(10,31,27,0.55)", marginTop: 2 }}>{c.role}</div>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, paddingTop: 10, borderTop: "1px solid rgba(10,31,27,0.06)", fontFamily: mono, fontSize: 10.5, color: "rgba(10,31,27,0.55)" }}>
                  <span>★ {c.rating.toFixed(2)}</span>
                  <span style={{ color: INK, fontWeight: 600 }}>${c.rate}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Logos band (press substitute, using workplaces feel) ----
  function Logos() {
    const logos = ["RUNLAB", "PELOTON", "BARRY'S", "EQUINOX", "LIFETIME", "MIRROR"];
    return (
      <section style={{ padding: "40px 40px 80px", textAlign: "center" }}>
        <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(10,31,27,0.5)", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 28 }}>Trusted by coaches at</div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 1000, margin: "0 auto", gap: 40, flexWrap: "wrap" }}>
          {logos.map(l => (
            <div key={l} style={{ fontFamily: sans, fontSize: 18, fontWeight: 600, letterSpacing: "0.06em", color: "rgba(10,31,27,0.35)" }}>{l}</div>
          ))}
        </div>
      </section>
    );
  }

  // ---- Audiences ----
  function Audiences() {
    const [tab, setTab] = useState(0);
    const tabs = [
      {
        label: "For clients", title: "Hire the coach, not the app.", copy: "Browse certified coaches by specialty, goal, and budget. Book a free intro. Subscribe on your terms — cancel any time.",
        features: ["Verified NASM / ACE / RD credentials", "Wearables sync + habit streaks", "Shape Score on every session"],
        accent: TEAL,
      },
      {
        label: "For trainers", title: "A practice that runs itself.", copy: "Programming, scheduling, payouts, messaging — in one place. We front the marketing. You show up for the work.",
        features: ["Floor iPad export · Notion + Apple Notes", "Weekly payouts · Stripe Connect", "Average +11 new clients / quarter"],
        accent: TEAL_DEEP,
      },
      {
        label: "For nutritionists", title: "Real nutrition, real infrastructure.", copy: "Built with RDs. Intake forms, meal plan builder with USDA data, client food-log review, HIPAA-aware messaging.",
        features: ["RD / RDN verification on application", "USDA + brand database · 1.2M items", "PDF + native app delivery"],
        accent: TEAL,
      },
    ];
    const t = tabs[tab];
    return (
      <section style={{ padding: "100px 40px", background: "#fff", borderTop: "1px solid rgba(10,31,27,0.06)", borderBottom: "1px solid rgba(10,31,27,0.06)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: TEAL_DEEP, textTransform: "uppercase" }}>ONE PLATFORM · THREE SIDES</div>
            <h2 style={{ fontFamily: sans, fontSize: 72, letterSpacing: "-0.035em", fontWeight: 500, margin: "16px 0 0", lineHeight: 1, color: INK }}>
              Built for everyone in the room.
            </h2>
          </div>
          <div style={{ display: "flex", justifyContent: "center", gap: 6, background: "#f5f6f5", borderRadius: 999, padding: 5, maxWidth: 480, margin: "0 auto 48px" }}>
            {tabs.map((tb, i) => (
              <button key={i} onClick={() => setTab(i)} style={{ flex: 1, padding: "12px 16px", borderRadius: 999, border: 0, background: tab === i ? "#fff" : "transparent", color: tab === i ? INK : "rgba(10,31,27,0.6)", fontFamily: sans, fontSize: 13.5, fontWeight: 500, cursor: "pointer", boxShadow: tab === i ? "0 1px 4px rgba(10,31,27,0.1)" : "none" }}>{tb.label}</button>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
            <div>
              <h3 style={{ fontFamily: sans, fontSize: 52, letterSpacing: "-0.025em", fontWeight: 500, margin: 0, lineHeight: 1.04, color: INK }}>{t.title}</h3>
              <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(10,31,27,0.65)", marginTop: 20, maxWidth: 480 }}>{t.copy}</p>
              <div style={{ marginTop: 28 }}>
                {t.features.map(f => (
                  <div key={f} style={{ display: "flex", gap: 10, padding: "10px 0", borderTop: "1px solid rgba(10,31,27,0.08)", fontFamily: sans, fontSize: 14.5, color: INK }}>
                    <span style={{ color: t.accent, fontFamily: mono }}>✓</span>{f}
                  </div>
                ))}
              </div>
              <button style={{ marginTop: 28, background: INK, color: "#fff", border: 0, padding: "14px 22px", borderRadius: 999, fontFamily: sans, fontWeight: 500, fontSize: 14, cursor: "pointer" }}>Learn more →</button>
            </div>
            <AudiencePanel tab={tab} />
          </div>
        </div>
      </section>
    );
  }

  function AudiencePanel({ tab }) {
    if (tab === 0) return <ClientPanel />;
    if (tab === 1) return <TrainerPanel />;
    return <NutritionPanel />;
  }

  function ClientPanel() {
    return (
      <div style={{ background: "linear-gradient(180deg, #f4fbf8 0%, #ffffff 100%)", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 14 }}>
          <div style={{ fontFamily: sans, fontWeight: 500, color: INK }}>Priya's plan · week 6</div>
          <div style={{ fontFamily: mono, fontSize: 11, color: TEAL_DEEP }}>ON TRACK</div>
        </div>
        {[["M", "Lower pull", 100], ["T", "Rest", 0], ["W", "Upper push", 50], ["T", "Nutrition review", 0], ["F", "Lower push", 0], ["S", "Long run", 0], ["S", "Rest", 0]].map(([d, w, p], i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr 80px", gap: 10, alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid rgba(10,31,27,0.06)" : "none" }}>
            <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.5)" }}>{d}</div>
            <div style={{ fontFamily: sans, fontSize: 13.5, color: INK }}>{w}</div>
            {p > 0 ? <div style={{ height: 6, background: "rgba(10,31,27,0.06)", borderRadius: 999, overflow: "hidden" }}><div style={{ width: `${p}%`, height: "100%", background: p === 100 ? TEAL_DEEP : TEAL }} /></div> : <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(10,31,27,0.35)", textAlign: "right" }}>—</div>}
          </div>
        ))}
        <div style={{ marginTop: 16, padding: 12, background: "rgba(10,197,168,0.08)", borderRadius: 10, fontFamily: sans, fontSize: 13 }}>
          <span style={{ color: TEAL_DEEP, fontWeight: 500 }}>Maya · 8:12</span><br/>
          <span style={{ color: "rgba(10,31,27,0.75)" }}>"Good recovery — push through today. Add 5 lb on the RDL."</span>
        </div>
      </div>
    );
  }

  function TrainerPanel() {
    return (
      <div style={{ background: "#fff", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 16, padding: 22, boxShadow: "0 20px 60px -30px rgba(10,31,27,0.2)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", color: "rgba(10,31,27,0.5)" }}>MONTH TO DATE</div>
            <div style={{ fontFamily: sans, fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", color: INK, marginTop: 4 }}>$14,820.00</div>
          </div>
          <div style={{ padding: "4px 10px", background: "rgba(10,197,168,0.12)", color: TEAL_DEEP, fontFamily: mono, fontSize: 11, borderRadius: 999 }}>+18%</div>
        </div>
        <svg viewBox="0 0 400 120" style={{ width: "100%", height: 120 }}>
          <defs>
            <linearGradient id="spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={TEAL} stopOpacity="0.35" />
              <stop offset="1" stopColor={TEAL} stopOpacity="0" />
            </linearGradient>
          </defs>
          <path d="M0,80 C50,70 80,40 120,50 C170,62 200,30 250,28 C300,26 340,60 400,18 L400,120 L0,120 Z" fill="url(#spark)" />
          <path d="M0,80 C50,70 80,40 120,50 C170,62 200,30 250,28 C300,26 340,60 400,18" fill="none" stroke={TEAL_DEEP} strokeWidth="2.5" />
        </svg>
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid rgba(10,31,27,0.08)" }}>
          <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(10,31,27,0.5)", marginBottom: 10 }}>RECENT PAYOUTS</div>
          {[["Apr 15", "$3,240.00", "Paid"], ["Apr 08", "$2,860.00", "Paid"], ["Apr 01", "$3,110.00", "Paid"]].map(([d, a, s], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontFamily: sans, fontSize: 13, color: INK, borderTop: i ? "1px solid rgba(10,31,27,0.05)" : "none" }}>
              <span>{d}</span>
              <span style={{ fontFamily: mono, color: "rgba(10,31,27,0.8)" }}>{a}</span>
              <span style={{ fontFamily: mono, fontSize: 10, color: TEAL_DEEP, letterSpacing: "0.08em" }}>{s.toUpperCase()}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function NutritionPanel() {
    return (
      <div style={{ background: "#fff", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 16, padding: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(10,31,27,0.55)" }}>Priya · meal plan · today</div>
            <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 500, color: INK, marginTop: 2 }}>1,820 / 2,100 kcal</div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, color: TEAL_DEEP, padding: "3px 8px", background: "rgba(10,197,168,0.1)", borderRadius: 4 }}>89%</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 18 }}>
          {[["P", 168, 180], ["C", 204, 260], ["F", 72, 75]].map(([l, v, t]) => (
            <div key={l} style={{ background: "rgba(10,31,27,0.03)", borderRadius: 10, padding: 12 }}>
              <div style={{ fontFamily: mono, fontSize: 10, color: "rgba(10,31,27,0.5)", letterSpacing: "0.1em" }}>{l}</div>
              <div style={{ fontFamily: sans, fontSize: 20, fontWeight: 500, color: INK, marginTop: 4 }}>{v}g</div>
              <div style={{ height: 4, background: "rgba(10,31,27,0.06)", borderRadius: 999, marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${v/t*100}%`, height: "100%", background: TEAL_DEEP }} />
              </div>
            </div>
          ))}
        </div>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", color: "rgba(10,31,27,0.5)", marginBottom: 8 }}>MEALS</div>
        {[["08:00", "Oats · berries · whey", "412 kcal"], ["12:30", "Chicken bowl · rice", "680 kcal"], ["16:00", "Greek yogurt", "180 kcal"], ["19:30", "Salmon · greens", "548 kcal"]].map(([t, m, k], i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "56px 1fr auto", padding: "9px 0", borderTop: i ? "1px solid rgba(10,31,27,0.05)" : "none", fontFamily: sans, fontSize: 13, color: INK }}>
            <span style={{ fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.5)" }}>{t}</span>
            <span>{m}</span>
            <span style={{ fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.55)" }}>{k}</span>
          </div>
        ))}
      </div>
    );
  }

  // ---- Marketplace spotlight ----
  function Marketplace() {
    return (
      <section style={{ padding: "100px 40px", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", top: "-100px", right: "-200px", width: 600, height: 600, background: "radial-gradient(circle, rgba(10,197,168,0.15), transparent 60%)", filter: "blur(40px)" }} />
        <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: TEAL_DEEP, textTransform: "uppercase" }}>Marketplace</div>
            <h2 style={{ fontFamily: sans, fontSize: 72, letterSpacing: "-0.035em", fontWeight: 500, margin: "16px 0 16px", lineHeight: 1, color: INK }}>The coaches. Right there.</h2>
            <p style={{ fontFamily: sans, fontSize: 17, color: "rgba(10,31,27,0.65)", maxWidth: 520, marginInline: "auto" }}>Filtered by fit, not by who paid for placement. Every coach is credentialed, reviewed, and answerable to your progress.</p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {COACHES.map((c, i) => (
              <div key={i} style={{ background: "#fff", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 16, padding: 16, transition: "all .2s", boxShadow: "0 1px 3px rgba(10,31,27,0.04)" }}>
                <div style={{ position: "relative" }}>
                  <Placeholder label={`${c.name.split(' ')[0]} · portrait`} ratio="4/3" tone="light" style={{ borderRadius: 10 }} />
                  <div style={{ position: "absolute", top: 10, left: 10, padding: "4px 10px", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(6px)", borderRadius: 999, fontFamily: mono, fontSize: 10, color: INK, letterSpacing: "0.08em", textTransform: "uppercase" }}>{c.tag}</div>
                </div>
                <div style={{ padding: "16px 6px 6px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                    <div style={{ fontFamily: sans, fontSize: 18, fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>{c.name}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(10,31,27,0.55)" }}>★ {c.rating.toFixed(2)}</div>
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(10,31,27,0.6)", marginTop: 4 }}>{c.role} · {c.city}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 16, paddingTop: 14, borderTop: "1px solid rgba(10,31,27,0.06)" }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.55)" }}>{c.sessions} sessions</span>
                    <span style={{ fontFamily: sans, fontSize: 15, fontWeight: 600, color: INK }}>${c.rate}<span style={{ color: "rgba(10,31,27,0.5)", fontSize: 12, fontWeight: 400 }}>/session</span></span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---- Shape Score ----
  function Score() {
    return (
      <section style={{ padding: "100px 40px", background: "#fff", borderTop: "1px solid rgba(10,31,27,0.06)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: TEAL_DEEP, textTransform: "uppercase" }}>Shape Score</div>
            <h2 style={{ fontFamily: sans, fontSize: 60, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 20px", lineHeight: 1, color: INK }}>
              Points for consistency. Real rewards.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(10,31,27,0.65)", maxWidth: 480 }}>
              Log a workout, track a meal, keep a session — earn points. Cash them in for session credits, merch, or Radio+. It's our way of rewarding the boring stuff.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16, marginTop: 32 }}>
              {[["+12", "workout"], ["+30", "coach session"], ["+4", "meal tracked"], ["2.5×", "streak bonus"]].map(([k, v]) => (
                <div key={v} style={{ padding: 18, background: BG, border: "1px solid rgba(10,31,27,0.06)", borderRadius: 12 }}>
                  <div style={{ fontFamily: sans, fontSize: 28, fontWeight: 500, letterSpacing: "-0.02em", color: TEAL_DEEP }}>{k}</div>
                  <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(10,31,27,0.65)", marginTop: 4 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <ScoreViz />
        </div>
      </section>
    );
  }

  function ScoreViz() {
    const bars = useMemo(() => Array.from({ length: 14 }, (_, i) => 20 + Math.round(Math.abs(Math.sin(i * 1.3)) * 80) + (i === 13 ? 25 : 0)), []);
    return (
      <div style={{ background: "linear-gradient(135deg, #eafbf5 0%, #ffffff 60%)", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 20, padding: 28, boxShadow: "0 30px 80px -40px rgba(6,138,117,0.35)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.55)", letterSpacing: "0.12em", textTransform: "uppercase" }}>Last 14 days</div>
            <div style={{ fontFamily: sans, fontSize: 56, fontWeight: 500, letterSpacing: "-0.03em", color: INK, lineHeight: 1, marginTop: 4 }}>1,284<span style={{ fontSize: 18, color: "rgba(10,31,27,0.55)", marginLeft: 6 }}>pts</span></div>
          </div>
          <div style={{ fontFamily: mono, fontSize: 11, color: TEAL_DEEP, padding: "4px 10px", background: "rgba(10,197,168,0.15)", borderRadius: 999 }}>▲ +312</div>
        </div>
        <div style={{ display: "flex", alignItems: "end", gap: 5, height: 140 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 13 ? TEAL_DEEP : "rgba(10,197,168,0.35)", borderRadius: 4, transition: "height .4s" }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 10, color: "rgba(10,31,27,0.4)", letterSpacing: "0.08em", marginTop: 10 }}>
          <span>APR 05</span><span>APR 12</span><span>APR 18</span>
        </div>
        <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(10,31,27,0.08)" }}>
          <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.55)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>Next rewards</div>
          {[["Free intro session", 500, "ready"], ["Merch drop · spring", 800, "ready"], ["Radio+ 30 day", 1500, "85%"]].map(([l, c, s], i) => (
            <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: i ? "1px solid rgba(10,31,27,0.05)" : "none", fontFamily: sans, fontSize: 13.5, color: INK, alignItems: "center" }}>
              <span>{l}</span>
              <span style={{ fontFamily: mono, fontSize: 11, color: s === "ready" ? TEAL_DEEP : "rgba(10,31,27,0.55)" }}>{c} pts · {s}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---- Trainer Dash full ----
  function TrainerDash() {
    return (
      <section style={{ padding: "100px 40px", background: BG }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: TEAL_DEEP, textTransform: "uppercase" }}>For coaches</div>
            <h2 style={{ fontFamily: sans, fontSize: 64, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 16px", lineHeight: 1, color: INK }}>A practice in one view.</h2>
          </div>
          <div style={{ background: "#fff", borderRadius: 20, padding: 8, border: "1px solid rgba(10,31,27,0.06)", boxShadow: "0 40px 100px -40px rgba(10,31,27,0.2)" }}>
            <div style={{ background: "#fff", borderRadius: 14, overflow: "hidden" }}>
              <div style={{ padding: "10px 18px", borderBottom: "1px solid rgba(10,31,27,0.06)", display: "flex", alignItems: "center", background: "rgba(251,251,250,0.5)" }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {["#ed6a5e", "#f4bf4f", "#62c554"].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c, opacity: 0.7 }} />)}
                </div>
                <div style={{ margin: "0 auto", fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.5)" }}>shape.app/coach/maya</div>
              </div>
              <TrainerFullApp />
            </div>
          </div>
        </div>
      </section>
    );
  }

  function TrainerFullApp() {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 580, fontFamily: sans, color: INK }}>
        <aside style={{ background: "rgba(251,251,250,0.6)", borderRight: "1px solid rgba(10,31,27,0.06)", padding: 18 }}>
          <ShapeWord color={INK} size={15} />
          <div style={{ marginTop: 24 }}>
            {[["Today", true], ["Clients", false, "34"], ["Programs"], ["Schedule"], ["Messages", false, "3"], ["Payouts"], ["Settings"]].map(([l, on, b]) => (
              <div key={l} style={{ padding: "9px 12px", borderRadius: 8, fontSize: 13, color: on ? INK : "rgba(10,31,27,0.65)", background: on ? "rgba(10,197,168,0.12)" : "transparent", fontWeight: on ? 500 : 400, display: "flex", justifyContent: "space-between" }}>
                {l}
                {b && <span style={{ fontSize: 10, padding: "1px 6px", background: on ? TEAL_DEEP : "rgba(10,31,27,0.08)", color: on ? "#fff" : "rgba(10,31,27,0.6)", borderRadius: 999 }}>{b}</span>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, padding: 14, background: INK, color: "#fff", borderRadius: 12 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: TEAL, letterSpacing: "0.12em" }}>PAYOUT APR 30</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, letterSpacing: "-0.02em" }}>$14,820</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Month to date · 📈 +18%</div>
          </div>
        </aside>
        <div style={{ padding: "22px 28px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(10,31,27,0.5)" }}>WEDNESDAY APR 18</div>
              <h3 style={{ fontSize: 28, fontWeight: 500, margin: "4px 0 0", letterSpacing: "-0.02em" }}>Good morning, Maya.</h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ background: "#fff", border: "1px solid rgba(10,31,27,0.12)", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontFamily: sans }}>+ Program</button>
              <button style={{ background: INK, color: "#fff", border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontFamily: sans, fontWeight: 500 }}>New session</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
            {[["5", "Sessions today", "$750"], ["34", "Active clients", "+3 this wk"], ["96%", "Completion", "30d"], ["4.97", "Rating", "1,284 reviews"]].map(([v, l, s], i) => (
              <div key={i} style={{ background: BG, borderRadius: 12, padding: 16, border: "1px solid rgba(10,31,27,0.05)" }}>
                <div style={{ fontSize: 26, fontWeight: 500, letterSpacing: "-0.02em" }}>{v}</div>
                <div style={{ fontSize: 12, color: "rgba(10,31,27,0.65)", marginTop: 6 }}>{l}</div>
                <div style={{ fontSize: 11, color: "rgba(10,31,27,0.45)", marginTop: 2 }}>{s}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
            <div style={{ background: BG, borderRadius: 12, padding: 16, border: "1px solid rgba(10,31,27,0.05)" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Today's schedule</div>
              {[
                ["07:00", "Priya S.", "Lower pull · remote", "done"],
                ["09:30", "Deandre K.", "Upper push · Brooklyn", "done"],
                ["14:00", "Sam O.", "Intake call · new", "next"],
                ["17:30", "Priya S.", "Upper push · remote", ""],
                ["19:00", "Jaya P.", "Nutrition review", ""],
              ].map(([t, n, d, s], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 12, padding: "10px 0", borderTop: i ? "1px solid rgba(10,31,27,0.06)" : "none", alignItems: "center" }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(10,31,27,0.55)" }}>{t}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{n}</div>
                    <div style={{ fontSize: 11, color: "rgba(10,31,27,0.55)" }}>{d}</div>
                  </div>
                  {s && <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 7px", borderRadius: 4, background: s === "done" ? "rgba(10,31,27,0.06)" : TEAL_DEEP, color: s === "done" ? "rgba(10,31,27,0.6)" : "#fff", letterSpacing: "0.08em", textTransform: "uppercase" }}>{s}</span>}
                </div>
              ))}
            </div>
            <div style={{ background: BG, borderRadius: 12, padding: 16, border: "1px solid rgba(10,31,27,0.05)" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Client pulse</div>
              {COACHES.slice(0, 5).map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid rgba(10,31,27,0.06)" : "none" }}>
                  <Placeholder label="" ratio="1/1" tone="light" style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.name.split(' ')[0]}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(10,31,27,0.55)" }}>{(i+1)*2} workouts · {i*3+4}d streak</div>
                  </div>
                  <svg viewBox="0 0 40 16" style={{ width: 40, height: 16 }}>
                    <polyline points={Array.from({ length: 8 }, (_, j) => `${j*5},${14 - Math.abs(Math.sin(j + i)) * 12}`).join(" ")} stroke={TEAL_DEEP} strokeWidth="1.5" fill="none" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---- Radio ----
  function Radio() {
    const [bars, setBars] = useState(Array.from({length: 40}, () => Math.random()));
    useEffect(() => { const id = setInterval(() => setBars(Array.from({length: 40}, () => Math.random())), 220); return () => clearInterval(id); }, []);
    return (
      <section style={{ padding: "100px 40px", background: INK, color: "#fff", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(800px 400px at 30% 20%, rgba(10,197,168,0.25), transparent 60%)" }} />
        <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: TEAL, textTransform: "uppercase" }}>Shape Radio</div>
            <h2 style={{ fontFamily: sans, fontSize: 72, letterSpacing: "-0.035em", fontWeight: 500, margin: "16px 0 20px", lineHeight: 0.95 }}>Sound for the set.</h2>
            <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,0.7)", maxWidth: 440 }}>
              Ad-free workout mixes, curated by tempo and mood. Live sets from resident DJs. Included with every Shape membership.
            </p>
            <button style={{ marginTop: 28, background: TEAL, color: INK, border: 0, padding: "14px 22px", borderRadius: 999, fontFamily: sans, fontWeight: 500, fontSize: 14.5, cursor: "pointer" }}>Open Radio →</button>
          </div>
          <div style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24, backdropFilter: "blur(10px)" }}>
            <div style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 20 }}>
              <Placeholder label="MIX 04" ratio="1/1" style={{ width: 96, height: 96, borderRadius: 12 }} />
              <div>
                <div style={{ fontFamily: mono, fontSize: 10, color: TEAL, letterSpacing: "0.12em" }}>◉ LIVE · 1,284</div>
                <div style={{ fontFamily: sans, fontSize: 22, fontWeight: 500, letterSpacing: "-0.02em", marginTop: 6 }}>Heavy Day · 132</div>
                <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(255,255,255,0.6)", marginTop: 4 }}>Kaya Mars · Lift Series vol. 04</div>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 2, height: 52 }}>
              {bars.map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${20 + h*80}%`, background: i < 18 ? TEAL : "rgba(255,255,255,0.2)", borderRadius: 1, transition: "height .2s" }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginTop: 16, fontFamily: mono, fontSize: 11, color: "rgba(255,255,255,0.5)" }}>
              <span>24:18</span><span>52:04</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  // ---- Testimonials ----
  function Testimonials() {
    return (
      <section style={{ padding: "100px 40px", background: "#fff", borderTop: "1px solid rgba(10,31,27,0.06)", borderBottom: "1px solid rgba(10,31,27,0.06)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 56 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: TEAL_DEEP, textTransform: "uppercase" }}>Members & Coaches</div>
            <h2 style={{ fontFamily: sans, fontSize: 60, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 0", lineHeight: 1, color: INK }}>What happens when coaching works.</h2>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {TESTIMONIALS.map((t, i) => (
              <figure key={i} style={{ margin: 0, padding: 28, background: BG, borderRadius: 18, border: "1px solid rgba(10,31,27,0.06)", display: "flex", flexDirection: "column" }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: TEAL_DEEP, padding: "4px 10px", background: "rgba(10,197,168,0.1)", borderRadius: 999, display: "inline-block", alignSelf: "start" }}>{t.metric}</div>
                <blockquote style={{ margin: "20px 0 0", fontFamily: sans, fontSize: 17, lineHeight: 1.5, color: INK, letterSpacing: "-0.005em", flex: 1 }}>"{t.quote}"</blockquote>
                <figcaption style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(10,31,27,0.08)", display: "flex", alignItems: "center", gap: 12 }}>
                  <Placeholder label="" ratio="1/1" tone="light" style={{ width: 40, height: 40, borderRadius: 999 }} />
                  <div>
                    <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(10,31,27,0.55)" }}>{t.role}</div>
                  </div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---- FAQ ----
  function Faq() {
    const [open, setOpen] = useState(0);
    return (
      <section style={{ padding: "100px 40px" }}>
        <div style={{ maxWidth: 1000, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 48 }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", color: TEAL_DEEP, textTransform: "uppercase" }}>FAQ</div>
            <h2 style={{ fontFamily: sans, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 0", lineHeight: 1, color: INK }}>Questions, answered.</h2>
          </div>
          {FAQ.map((f, i) => (
            <div key={i} onClick={() => setOpen(open === i ? -1 : i)} style={{ background: "#fff", border: "1px solid rgba(10,31,27,0.08)", borderRadius: 14, padding: "22px 24px", marginBottom: 10, cursor: "pointer", transition: "all .2s" }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "start" }}>
                <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 500, color: INK, letterSpacing: "-0.01em" }}>{f.q}</div>
                <div style={{ fontFamily: mono, color: TEAL_DEEP, fontSize: 18 }}>{open === i ? "−" : "+"}</div>
              </div>
              {open === i && <div style={{ marginTop: 12, fontFamily: sans, fontSize: 15, lineHeight: 1.6, color: "rgba(10,31,27,0.7)" }}>{f.a}</div>}
            </div>
          ))}
        </div>
      </section>
    );
  }

  // ---- Footer ----
  function Footer() {
    return (
      <section style={{ position: "relative", overflow: "hidden" }}>
        <section style={{ padding: "100px 40px", background: "linear-gradient(135deg, #0a1f1b 0%, #083d34 50%, #0a7463 100%)", color: "#fff", position: "relative", overflow: "hidden" }}>
          <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(600px 400px at 80% 50%, rgba(10,197,168,0.4), transparent 60%)" }} />
          <div style={{ maxWidth: 1000, margin: "0 auto", textAlign: "center", position: "relative" }}>
            <h2 style={{ fontFamily: sans, fontSize: 96, letterSpacing: "-0.035em", fontWeight: 500, lineHeight: 1, margin: "0 0 24px" }}>Start with a human.</h2>
            <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(255,255,255,0.75)", maxWidth: 540, marginInline: "auto" }}>Free 15-minute intro with any coach on Shape. Subscribe only if it clicks.</p>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 36 }}>
              <button style={{ background: "#fff", color: INK, border: 0, padding: "16px 26px", borderRadius: 999, fontFamily: sans, fontWeight: 500, fontSize: 15, cursor: "pointer" }}>Find your coach →</button>
              <button style={{ background: "rgba(255,255,255,0.1)", color: "#fff", border: "1px solid rgba(255,255,255,0.25)", padding: "16px 26px", borderRadius: 999, fontFamily: sans, fontWeight: 500, fontSize: 15, cursor: "pointer" }}>Apply as coach</button>
            </div>
          </div>
        </section>
        <section style={{ padding: "60px 40px 40px", background: INK, color: "rgba(255,255,255,0.75)" }}>
          <div style={{ maxWidth: 1320, margin: "0 auto" }}>
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40 }}>
              <div>
                <ShapeWord color="#fff" />
                <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 16, maxWidth: 280 }}>The coaching platform for people who want results. Real coaches. One marketplace.</p>
              </div>
              {[
                ["Product", ["Marketplace", "Clients", "Trainers", "Nutritionists", "Radio"]],
                ["Start", ["Sign up", "Apply as coach", "Pricing"]],
                ["Company", ["About", "Careers", "Press"]],
                ["Help", ["Center", "Contact", "Privacy", "Terms"]],
              ].map(([h, links]) => (
                <div key={h}>
                  <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase", marginBottom: 16 }}>{h}</div>
                  {links.map(l => <div key={l} style={{ fontFamily: sans, fontSize: 13, color: "rgba(255,255,255,0.75)", padding: "6px 0" }}>{l}</div>)}
                </div>
              ))}
            </div>
            <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", justifyContent: "space-between", fontFamily: mono, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
              <span>© 2026 SHAPE COMMUNITY</span>
              <span>STATUS · ALL SYSTEMS OPERATIONAL</span>
            </div>
          </div>
        </section>
      </section>
    );
  }

  function Root() {
    return (
      <div style={{ background: BG, color: INK, minHeight: "100vh" }}>
        <Nav />
        <Hero />
        <Logos />
        <Audiences />
        <Marketplace />
        <Score />
        <TrainerDash />
        <Radio />
        <Testimonials />
        <Faq />
        <Footer />
      </div>
    );
  }
  return Root;
})();

window.DirC = DirC;
