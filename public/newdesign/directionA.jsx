// Direction A — Performance
// Dark, athletic, data-forward, Whoop-style
const DirA = (() => {
  const styles = {
    root: {
      background: "#06080a", color: "#e9efed",
      fontFamily: "'Inter Tight', sans-serif",
      minHeight: "100vh",
    },
  };

  // ---------- Nav ----------
  function Nav() {
    const link = { fontSize: 13, color: "rgba(255,255,255,0.7)", padding: "8px 0", fontWeight: 400 };
    return (
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(6,8,10,0.72)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px" }}>
          <ShapeWord color="#fff" />
          <nav style={{ display: "flex", gap: 28 }}>
            <a style={link}>Marketplace</a>
            <a style={link}>Trainers</a>
            <a style={link}>Nutritionists</a>
            <a style={link}>Shape Score</a>
            <a style={link}>Radio</a>
            <a style={link}>Pricing</a>
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <a href="Login.html" style={{ ...link, fontSize: 13 }}>Log in</a>
            <button style={{ background: "#0ac5a8", color: "#06080a", border: 0, padding: "10px 18px", borderRadius: 999, fontWeight: 600, fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>Start training →</button>
          </div>
        </div>
      </header>
    );
  }

  // ---------- Hero ----------
  function Hero() {
    const [pulse, setPulse] = useState(0);
    useEffect(() => { const id = setInterval(() => setPulse(p => p + 1), 1800); return () => clearInterval(id); }, []);
    return (
      <section style={{ padding: "80px 40px 60px", position: "relative", overflow: "hidden" }}>
        {/* mountain photo background */}
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url('/Home%20page%202.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
        {/* dark overlay to keep text legible */}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(6,8,10,0.62) 0%, rgba(6,8,10,0.78) 60%, #06080a 100%)", pointerEvents: "none" }} />
        {/* ambient teal glow */}
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(900px 500px at 75% 10%, rgba(10,197,168,0.16), transparent 60%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 60, alignItems: "end", position: "relative" }}>
          <div>
            <Eyebrow color="#0ac5a8" n="001 /">Real coaches · one platform</Eyebrow>
            <h1 style={{ fontSize: 112, lineHeight: 0.92, letterSpacing: "-0.04em", fontWeight: 500, margin: "24px 0 0", fontFamily: "'Inter Tight', sans-serif" }}>
              Train with<br />
              <span style={{ color: "#0ac5a8" }}>a human.</span><br />
              Not an app.
            </h1>
            <p style={{ fontSize: 19, lineHeight: 1.5, color: "rgba(255,255,255,0.64)", maxWidth: 520, marginTop: 28 }}>
              Shape connects you with certified trainers and nutritionists in a single marketplace. Subscribe on your terms — custom sessions, meal plans, direct access.
            </p>
            <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
              <button style={{ background: "#0ac5a8", color: "#06080a", border: 0, padding: "16px 28px", borderRadius: 999, fontWeight: 600, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>Find your coach →</button>
              <button style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", padding: "16px 28px", borderRadius: 999, fontWeight: 500, fontSize: 15, cursor: "pointer", fontFamily: "inherit" }}>I'm a trainer</button>
            </div>

            {/* Stats row */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, marginTop: 72, paddingTop: 28, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              {STATS.map((s, i) => (
                <div key={i}>
                  <div style={{ fontFamily: "'Inter Tight', sans-serif", fontSize: 34, fontWeight: 500, letterSpacing: "-0.03em" }}>{s.k}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", marginTop: 6 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Product preview */}
          <HeroPreview pulse={pulse} />
        </div>
      </section>
    );
  }

  function HeroPreview({ pulse }) {
    // Mock "today" dashboard with live metric ring, like Whoop
    const ring = Math.min(100, 62 + (pulse % 3) * 4);
    return (
      <div style={{ position: "relative" }}>
        <div style={{ background: "linear-gradient(180deg, #0d1210 0%, #080a0a 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 24, boxShadow: "0 40px 100px -30px rgba(10,197,168,0.25)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Today · Wed Apr 18</div>
              <div style={{ fontSize: 17, fontWeight: 500, marginTop: 4 }}>Recovery zone</div>
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: "#0ac5a8", boxShadow: "0 0 12px #0ac5a8" }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.5)" }}>LIVE</span>
            </div>
          </div>

          {/* Ring + numbers */}
          <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: 24, alignItems: "center" }}>
            <svg viewBox="0 0 200 200" style={{ width: "100%" }}>
              <circle cx="100" cy="100" r="86" stroke="rgba(255,255,255,0.06)" strokeWidth="14" fill="none" />
              <circle cx="100" cy="100" r="86" stroke="#0ac5a8" strokeWidth="14" fill="none" strokeLinecap="round" strokeDasharray={`${ring * 5.4} 540`} transform="rotate(-90 100 100)" style={{ transition: "stroke-dasharray .6s ease" }} />
              <text x="100" y="96" textAnchor="middle" fontFamily="Inter Tight" fontSize="52" fontWeight="500" fill="#fff" letterSpacing="-2">{ring}</text>
              <text x="100" y="120" textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="rgba(255,255,255,0.5)" letterSpacing="1.5">SHAPE SCORE</text>
            </svg>
            <div style={{ display: "grid", gap: 14 }}>
              {[
                ["Workouts", "4 / 5", 80, "#0ac5a8"],
                ["Protein", "168 g", 92, "#e9efed"],
                ["Sleep", "7h 42m", 88, "rgba(255,255,255,0.6)"],
                ["Steps", "9,820", 71, "rgba(255,255,255,0.6)"],
              ].map(([l, v, w, c]) => (
                <div key={l}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 6 }}>
                    <span style={{ color: "rgba(255,255,255,0.6)" }}>{l}</span>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace" }}>{v}</span>
                  </div>
                  <div style={{ height: 4, background: "rgba(255,255,255,0.06)", borderRadius: 999, overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${w}%`, background: c, borderRadius: 999 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Next session card */}
          <div style={{ marginTop: 22, padding: 16, background: "rgba(10,197,168,0.08)", border: "1px solid rgba(10,197,168,0.25)", borderRadius: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "#0ac5a8", textTransform: "uppercase" }}>Next session · 17:30</div>
              <div style={{ fontSize: 15, fontWeight: 500, marginTop: 4 }}>Upper push · with Maya Okafor</div>
            </div>
            <button style={{ background: "#0ac5a8", color: "#06080a", border: 0, padding: "8px 14px", borderRadius: 999, fontWeight: 600, fontSize: 12, cursor: "pointer" }}>Join →</button>
          </div>
        </div>

        {/* Floating chip — athlete card */}
        <div style={{ position: "absolute", left: -30, bottom: -40, background: "#0f1513", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 14, padding: 12, display: "flex", gap: 12, alignItems: "center", width: 260, boxShadow: "0 20px 50px -10px rgba(0,0,0,0.6)" }}>
          <Placeholder label="COACH" ratio="1/1" style={{ width: 48, height: 48, borderRadius: 10, flexShrink: 0 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Maya replied</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 2 }}>"Nice PR on the RDL — let's add 5 lb."</div>
          </div>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: "#0ac5a8" }} />
        </div>
      </div>
    );
  }

  // ---------- Three audiences ----------
  function Audiences() {
    const tiles = [
      {
        tag: "FOR CLIENTS", title: "Find your coach.", copy: "Browse certified trainers and nutritionists. Subscribe on your terms — custom sessions, meal plans, direct access.", cta: "Find your coach", accent: "#0ac5a8",
      },
      {
        tag: "FOR TRAINERS", title: "Launch your business.", copy: "Shape puts you in front of thousands of members looking for custom programs. Build your profile, sell sessions, we handle the marketing.", cta: "Apply as trainer", accent: "#e9efed",
      },
      {
        tag: "FOR NUTRITIONISTS", title: "Grow your practice.", copy: "Reach clients who need real nutrition guidance. Create meal plans, sell consultations — Shape handles the rest.", cta: "Apply as nutritionist", accent: "#0ac5a8",
      },
    ];
    return (
      <section style={{ padding: "120px 40px 80px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 48 }}>
            <div>
              <Eyebrow color="#0ac5a8" n="002 /">The platform</Eyebrow>
              <h2 style={{ fontSize: 64, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 0", lineHeight: 1 }}>One platform.<br/>Three sides.</h2>
            </div>
            <p style={{ maxWidth: 380, color: "rgba(255,255,255,0.6)", fontSize: 15, lineHeight: 1.55 }}>
              Whether you're training, coaching, or prescribing, Shape gives you the infrastructure — billing, scheduling, programming, messaging — so you can focus on the work.
            </p>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
            {tiles.map((t, i) => (
              <div key={i} style={{ background: "#0b0f0e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18, overflow: "hidden", display: "flex", flexDirection: "column" }}>
                <Placeholder label={t.tag.replace("FOR ", "") + " · photo"} ratio="4/3" style={{ borderRadius: 0, borderBottom: "1px solid rgba(255,255,255,0.08)" }} />
                <div style={{ padding: 28, flex: 1, display: "flex", flexDirection: "column" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: t.accent, textTransform: "uppercase" }}>{t.tag}</div>
                  <h3 style={{ fontSize: 32, letterSpacing: "-0.02em", fontWeight: 500, margin: "12px 0 12px", lineHeight: 1.05 }}>{t.title}</h3>
                  <p style={{ fontSize: 14.5, lineHeight: 1.55, color: "rgba(255,255,255,0.6)", margin: 0, flex: 1 }}>{t.copy}</p>
                  <a style={{ display: "inline-flex", alignItems: "center", gap: 8, marginTop: 24, fontSize: 13, fontWeight: 500, color: t.accent, borderTop: "1px solid rgba(255,255,255,0.08)", paddingTop: 20 }}>{t.cta} →</a>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---------- Marketplace ----------
  function Marketplace() {
    const [filter, setFilter] = useState("All");
    const tabs = ["All", "Trainer", "Nutritionist"];
    const filtered = filter === "All" ? COACHES : COACHES.filter(c => c.tag === filter);
    return (
      <section style={{ padding: "120px 40px 80px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 40 }}>
            <div>
              <Eyebrow color="#0ac5a8" n="003 /">Marketplace</Eyebrow>
              <h2 style={{ fontSize: 64, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 0", lineHeight: 1 }}>3,100 coaches.<br/>One directory.</h2>
            </div>
            <div style={{ display: "flex", gap: 6, background: "#0b0f0e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 999, padding: 4 }}>
              {tabs.map(t => (
                <button key={t} onClick={() => setFilter(t)} style={{ background: filter === t ? "#fff" : "transparent", color: filter === t ? "#06080a" : "rgba(255,255,255,0.7)", border: 0, padding: "10px 18px", borderRadius: 999, fontSize: 12, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {filtered.map((c, i) => <CoachCard key={i} c={c} />)}
          </div>
        </div>
      </section>
    );
  }

  function CoachCard({ c }) {
    return (
      <div style={{ background: "#0b0f0e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 16, padding: 20, transition: "all .2s", cursor: "pointer" }}
        onMouseEnter={e => e.currentTarget.style.borderColor = "rgba(10,197,168,0.4)"}
        onMouseLeave={e => e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"}>
        <Placeholder label={`${c.name.split(' ')[0]} · portrait`} ratio="4/3" style={{ marginBottom: 16 }} />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 4 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 500 }}>{c.name}</div>
            <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.55)", marginTop: 2 }}>{c.role} · {c.city}</div>
          </div>
          <div style={{ padding: "3px 8px", background: c.tag === "Trainer" ? "rgba(10,197,168,0.12)" : "rgba(255,255,255,0.06)", color: c.tag === "Trainer" ? "#0ac5a8" : "rgba(255,255,255,0.7)", borderRadius: 4, fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", textTransform: "uppercase" }}>{c.tag}</div>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.06)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11 }}>
          <span style={{ color: "rgba(255,255,255,0.55)" }}>★ {c.rating.toFixed(2)} · {c.sessions} sessions</span>
          <span style={{ color: "#fff", fontWeight: 600 }}>${c.rate}<span style={{ color: "rgba(255,255,255,0.5)", fontWeight: 400 }}>/session</span></span>
        </div>
      </div>
    );
  }

  // ---------- Shape Score ----------
  function Score() {
    return (
      <section style={{ padding: "120px 40px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, #06080a 0%, #081210 100%)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.2fr", gap: 80, alignItems: "center" }}>
          <div>
            <Eyebrow color="#0ac5a8" n="004 /">Shape score</Eyebrow>
            <h2 style={{ fontSize: 64, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 24px", lineHeight: 1 }}>Points for<br/>showing up.</h2>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,0.65)", marginBottom: 32 }}>
              Earn Shape Score for every workout logged, meal tracked, and session kept. Redeem in the Shape Store or as session credit. We reward the boring stuff that actually moves the needle.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 20 }}>
              {[
                ["+12 / workout", "logged & completed"],
                ["+4 / meal", "macros tracked"],
                ["+30 / session", "with certified coach"],
                ["2.5x multiplier", "14-day streak"],
              ].map(([k, v]) => (
                <div key={k} style={{ padding: "16px 0", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
                  <div style={{ fontSize: 20, fontWeight: 500, color: "#0ac5a8", fontFamily: "'JetBrains Mono', monospace" }}>{k}</div>
                  <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{v}</div>
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
    // Generate a 14-day bar chart
    const bars = useMemo(() => Array.from({ length: 14 }, (_, i) => 20 + Math.round(Math.abs(Math.sin(i * 1.3)) * 80) + (i === 13 ? 30 : 0)), []);
    const total = bars.reduce((a, b) => a + b, 0);
    return (
      <div style={{ background: "#0b0f0e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 32 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 28 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)", textTransform: "uppercase" }}>Last 14 days</div>
            <div style={{ fontSize: 56, fontWeight: 500, letterSpacing: "-0.03em", lineHeight: 1, marginTop: 8 }}>1,284<span style={{ fontSize: 20, color: "rgba(255,255,255,0.5)", fontWeight: 400, marginLeft: 6 }}>pts</span></div>
          </div>
          <div style={{ padding: "6px 10px", background: "rgba(10,197,168,0.15)", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#0ac5a8" }}>▲ +312 vs prior</div>
        </div>
        {/* Bars */}
        <div style={{ display: "flex", alignItems: "end", gap: 6, height: 180, marginBottom: 16 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 13 ? "#0ac5a8" : "rgba(255,255,255,0.12)", borderRadius: 4, transition: "height .4s" }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)", letterSpacing: "0.08em" }}>
          <span>APR 05</span><span>APR 12</span><span>APR 18</span>
        </div>
        {/* Rewards */}
        <div style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.06)", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
          {[["Free intro session", "500 pts", 100], ["Merch drop", "800 pts", 100], ["1 month Radio+", "1,500 pts", 85]].map(([l, c, p]) => (
            <div key={l}>
              <div style={{ fontSize: 12.5, fontWeight: 500 }}>{l}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.5)", marginTop: 4, marginBottom: 8 }}>{c}</div>
              <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ width: `${p}%`, height: "100%", background: p === 100 ? "#0ac5a8" : "rgba(255,255,255,0.5)" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- Trainer Dashboard ----------
  function TrainerDash() {
    return (
      <section style={{ padding: "120px 40px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto" }}>
          <div style={{ textAlign: "center", marginBottom: 64 }}>
            <Eyebrow color="#0ac5a8" n="005 /">Trainer dashboard</Eyebrow>
            <h2 style={{ fontSize: 72, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 16px", lineHeight: 1 }}>Run your practice<br/>from one screen.</h2>
            <p style={{ fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,0.6)", maxWidth: 560, margin: "0 auto" }}>
              Scheduling, programming, payouts, messaging. Built for coaches who'd rather train than do admin.
            </p>
          </div>
          <div style={{ background: "#0b0f0e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 24, padding: 14, boxShadow: "0 40px 120px -40px rgba(10,197,168,0.2)" }}>
            <TrainerApp />
          </div>
        </div>
      </section>
    );
  }

  function TrainerApp() {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 14, minHeight: 580 }}>
        {/* Sidebar */}
        <aside style={{ background: "#06080a", borderRadius: 14, padding: 16 }}>
          <ShapeWord color="#fff" size={15} />
          <div style={{ marginTop: 24, display: "flex", flexDirection: "column", gap: 2 }}>
            {[["Today", true], ["Clients (34)"], ["Programs"], ["Schedule"], ["Messages", false, 3], ["Payouts"], ["Settings"]].map(([l, on, badge]) => (
              <a key={l} style={{ padding: "8px 10px", borderRadius: 8, fontSize: 13, color: on ? "#fff" : "rgba(255,255,255,0.55)", background: on ? "rgba(10,197,168,0.12)" : "transparent", display: "flex", justifyContent: "space-between" }}>
                {l}
                {badge && <span style={{ fontSize: 10, background: "#0ac5a8", color: "#06080a", borderRadius: 999, padding: "1px 6px", fontWeight: 600 }}>{badge}</span>}
              </a>
            ))}
          </div>
          <div style={{ marginTop: 40, padding: 12, background: "rgba(10,197,168,0.08)", borderRadius: 10 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: "#0ac5a8", letterSpacing: "0.1em" }}>THIS MONTH</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4 }}>$14,820</div>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>Payout Apr 30</div>
          </div>
        </aside>
        {/* Main */}
        <div style={{ padding: "20px 24px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.4)" }}>WEDNESDAY · APR 18</div>
              <h3 style={{ fontSize: 26, fontWeight: 500, margin: "4px 0 0", letterSpacing: "-0.02em" }}>Good morning, Maya.</h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ background: "transparent", border: "1px solid rgba(255,255,255,0.12)", color: "#fff", padding: "7px 12px", borderRadius: 8, fontSize: 12, fontFamily: "inherit" }}>+ Program</button>
              <button style={{ background: "#0ac5a8", border: 0, color: "#06080a", padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, fontFamily: "inherit" }}>New session</button>
            </div>
          </div>

          {/* KPIs */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10, marginBottom: 20 }}>
            {[["Sessions today", "5", "$750"], ["Active clients", "34", "+3 this wk"], ["Completion", "96%", "30-day avg"], ["Rating", "4.97", "1,284 reviews"]].map(([l, v, sub]) => (
              <div key={l} style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: 14 }}>
                <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", textTransform: "uppercase" }}>{l}</div>
                <div style={{ fontSize: 24, fontWeight: 500, marginTop: 6, letterSpacing: "-0.02em" }}>{v}</div>
                <div style={{ fontSize: 11, color: "rgba(255,255,255,0.45)", marginTop: 2 }}>{sub}</div>
              </div>
            ))}
          </div>

          {/* Schedule */}
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Today's schedule</div>
              {[
                ["07:00", "Priya S.", "Lower pull · remote", "#0ac5a8", "done"],
                ["09:30", "Deandre K.", "Upper push · Brooklyn", "rgba(255,255,255,0.3)", "done"],
                ["12:00", "Lunch", "", "transparent", ""],
                ["14:00", "Sam O.", "Intake call", "#0ac5a8", "next"],
                ["17:30", "Priya S.", "Upper push · remote", "rgba(255,255,255,0.3)", ""],
              ].map(([t, n, d, c, s], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "50px 1fr auto", gap: 12, alignItems: "center", padding: "10px 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{t}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{n}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{d}</div>
                  </div>
                  {s && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: "3px 7px", borderRadius: 4, background: s === "done" ? "rgba(255,255,255,0.06)" : "rgba(10,197,168,0.15)", color: s === "done" ? "rgba(255,255,255,0.5)" : "#0ac5a8", letterSpacing: "0.08em", textTransform: "uppercase" }}>{s}</span>}
                </div>
              ))}
            </div>
            <div style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12 }}>Client pulse</div>
              {COACHES.slice(0, 4).map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
                  <Placeholder label="" ratio="1/1" style={{ width: 32, height: 32, borderRadius: 999, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.name.split(' ')[0]} {c.name.split(' ')[1][0]}.</div>
                    <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)" }}>Logged {(i+1)*2} workouts · streak {i*3+4}d</div>
                  </div>
                  <div style={{ width: 40, height: 16 }}>
                    <svg viewBox="0 0 40 16" style={{ width: "100%", height: "100%" }}>
                      <polyline points={Array.from({ length: 8 }, (_, j) => `${j*5},${14 - Math.abs(Math.sin(j + i)) * 12}`).join(" ")} stroke="#0ac5a8" strokeWidth="1.5" fill="none" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Client dashboard screenshot ----------
  function ClientDash() {
    return (
      <section style={{ padding: "80px 40px 120px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 80, alignItems: "center" }}>
          <div style={{ order: 2 }}>
            <Eyebrow color="#0ac5a8" n="006 /">Client dashboard</Eyebrow>
            <h2 style={{ fontSize: 56, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 24px", lineHeight: 1.02 }}>Everything your coach sees.<br/>Nothing they shouldn't.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.6)", marginBottom: 24 }}>
              Your programming, meal plans, session history, macros, and messages — in one timeline. Sync your wearable and Shape handles the rest.
            </p>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
              {["Wearables sync", "Meal planner", "Session replay", "Habit streaks", "Video messaging", "Shape Score"].map(f => (
                <div key={f} style={{ fontSize: 13, padding: "10px 0", borderTop: "1px solid rgba(255,255,255,0.08)", display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: "#0ac5a8" }} />{f}
                </div>
              ))}
            </div>
          </div>
          <ClientApp />
        </div>
      </section>
    );
  }

  function ClientApp() {
    return (
      <div style={{ background: "#0b0f0e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 22, order: 1 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 18 }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.5)", letterSpacing: "0.1em" }}>HEY PRIYA</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, letterSpacing: "-0.02em" }}>Week 6 / 12 · Hypertrophy block</div>
          </div>
          <Placeholder label="COACH" ratio="1/1" style={{ width: 40, height: 40, borderRadius: 999 }} />
        </div>

        {/* Weekly grid */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginBottom: 18 }}>
          {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => {
            const done = i < 3;
            const today = i === 2;
            return (
              <div key={i} style={{ padding: 10, background: today ? "rgba(10,197,168,0.12)" : "rgba(255,255,255,0.03)", border: today ? "1px solid rgba(10,197,168,0.4)" : "1px solid transparent", borderRadius: 8, textAlign: "center" }}>
                <div style={{ fontSize: 10, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace" }}>{d}</div>
                <div style={{ fontSize: 18, fontWeight: 500, marginTop: 4, letterSpacing: "-0.02em" }}>{13 + i}</div>
                <div style={{ marginTop: 4, height: 3, background: done ? "#0ac5a8" : "rgba(255,255,255,0.1)", borderRadius: 999 }} />
              </div>
            );
          })}
        </div>

        {/* Today */}
        <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 12, padding: 16, marginBottom: 14 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#0ac5a8", letterSpacing: "0.1em" }}>TODAY · UPPER PUSH</div>
              <div style={{ fontSize: 16, fontWeight: 500, marginTop: 4 }}>5 exercises · ~62 min</div>
            </div>
            <button style={{ background: "#0ac5a8", color: "#06080a", border: 0, padding: "7px 14px", borderRadius: 8, fontWeight: 600, fontSize: 12 }}>Start →</button>
          </div>
          {[
            ["A1", "Incline DB press", "4 × 8 @ 55 lb"],
            ["A2", "Cable fly", "3 × 12"],
            ["B1", "Overhead press", "4 × 6 @ 75 lb"],
            ["B2", "Lateral raise", "4 × 12"],
            ["C", "Tricep pushdown", "3 × 15"],
          ].map(([k, e, p], i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "28px 1fr auto", gap: 10, padding: "8px 0", borderTop: i ? "1px solid rgba(255,255,255,0.05)" : "none" }}>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.4)" }}>{k}</span>
              <span style={{ fontSize: 12.5 }}>{e}</span>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>{p}</span>
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>MACROS · TODAY</div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {[["P", 168, 180, "#0ac5a8"], ["C", 204, 260, "rgba(255,255,255,0.5)"], ["F", 72, 75, "rgba(255,255,255,0.5)"]].map(([l, v, t, c]) => (
                <div key={l} style={{ flex: 1 }}>
                  <div style={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}>{l}</div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{v}<span style={{ fontSize: 10, color: "rgba(255,255,255,0.4)" }}>/{t}</span></div>
                  <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 999, marginTop: 4, overflow: "hidden" }}>
                    <div style={{ width: `${v/t*100}%`, height: "100%", background: c }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: "rgba(255,255,255,0.03)", borderRadius: 10, padding: 12 }}>
            <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em" }}>FROM MAYA · 08:12</div>
            <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.45 }}>"Good recovery score today — push through the overhead work, keep the lateral raise strict."</div>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Radio strip ----------
  function Radio() {
    return (
      <section style={{ padding: "80px 40px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "#0a0d0c" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "center" }}>
          <div>
            <Eyebrow color="#0ac5a8" n="007 /">Shape radio</Eyebrow>
            <h2 style={{ fontSize: 64, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 20px", lineHeight: 1 }}>Music built<br/>for training.</h2>
            <p style={{ fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.6)", maxWidth: 440 }}>
              Ad-free workout mixes, curated playlists, live sets, beats designed to keep you moving. Included with every Shape membership.
            </p>
            <button style={{ marginTop: 28, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", padding: "14px 22px", borderRadius: 999, fontSize: 14, fontWeight: 500, cursor: "pointer", fontFamily: "inherit" }}>Listen now →</button>
          </div>
          <RadioPlayer />
        </div>
      </section>
    );
  }

  function RadioPlayer() {
    const [playing, setPlaying] = useState(true);
    const [bars, setBars] = useState(Array.from({length: 28}, () => Math.random()));
    useEffect(() => {
      if (!playing) return;
      const id = setInterval(() => setBars(Array.from({length: 28}, () => Math.random())), 180);
      return () => clearInterval(id);
    }, [playing]);
    return (
      <div style={{ background: "linear-gradient(135deg, #0f1513 0%, #06080a 100%)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 20, padding: 28 }}>
        <div style={{ display: "flex", gap: 18, alignItems: "center" }}>
          <Placeholder label="MIX · cover" ratio="1/1" style={{ width: 120, height: 120, borderRadius: 12 }} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "#0ac5a8", letterSpacing: "0.1em" }}>◉ LIVE · 1,284 LISTENING</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 8, letterSpacing: "-0.02em" }}>Heavy Day · 132 BPM</div>
            <div style={{ fontSize: 13, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>DJ Kaya Mars · Lift Series vol. 04</div>
          </div>
        </div>
        {/* Waveform */}
        <div style={{ display: "flex", alignItems: "center", gap: 3, height: 60, marginTop: 24, marginBottom: 12 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${20 + h*80}%`, background: i < 14 ? "#0ac5a8" : "rgba(255,255,255,0.2)", borderRadius: 2, transition: "height .2s" }} />
          ))}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.5)" }}>24:18 / 52:04</div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <button onClick={() => setPlaying(p => !p)} style={{ width: 44, height: 44, borderRadius: 999, background: "#0ac5a8", border: 0, color: "#06080a", cursor: "pointer", fontSize: 16, fontWeight: 700 }}>{playing ? "❙❙" : "▶"}</button>
          </div>
        </div>
      </div>
    );
  }

  // ---------- Testimonials ----------
  function Testimonials() {
    return (
      <section style={{ padding: "120px 40px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto" }}>
          <Eyebrow color="#0ac5a8" n="008 /">What members say</Eyebrow>
          <h2 style={{ fontSize: 64, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 48px", lineHeight: 1 }}>The people<br/>doing the work.</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {TESTIMONIALS.map((t, i) => (
              <figure key={i} style={{ margin: 0, padding: 28, background: "#0b0f0e", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 18 }}>
                <blockquote style={{ margin: 0, fontSize: 18, lineHeight: 1.45, letterSpacing: "-0.01em", fontWeight: 400 }}>"{t.quote}"</blockquote>
                <div style={{ marginTop: 28, paddingTop: 20, borderTop: "1px solid rgba(255,255,255,0.06)", display: "flex", gap: 12, alignItems: "center" }}>
                  <Placeholder label="" ratio="1/1" style={{ width: 40, height: 40, borderRadius: 999 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>{t.role}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "#0ac5a8" }}>{t.metric}</div>
                </div>
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---------- FAQ ----------
  function Faq() {
    const [open, setOpen] = useState(0);
    return (
      <section style={{ padding: "120px 40px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
        <div style={{ maxWidth: 1440, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 80 }}>
          <div>
            <Eyebrow color="#0ac5a8" n="009 /">FAQ</Eyebrow>
            <h2 style={{ fontSize: 56, letterSpacing: "-0.03em", fontWeight: 500, margin: "16px 0 20px", lineHeight: 1 }}>Good questions.<br/>Real answers.</h2>
            <p style={{ fontSize: 15, color: "rgba(255,255,255,0.55)", lineHeight: 1.55 }}>Can't find what you need? Our team replies within the hour.</p>
          </div>
          <div>
            {FAQ.map((f, i) => (
              <div key={i} onClick={() => setOpen(open === i ? -1 : i)} style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: "24px 0", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 24, alignItems: "start" }}>
                  <div style={{ fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em" }}>{f.q}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", color: "#0ac5a8", fontSize: 18, flexShrink: 0 }}>{open === i ? "−" : "+"}</div>
                </div>
                {open === i && <div style={{ marginTop: 14, fontSize: 15, lineHeight: 1.55, color: "rgba(255,255,255,0.65)", maxWidth: 640 }}>{f.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // ---------- Footer CTA ----------
  function Footer() {
    return (
      <section style={{ padding: "120px 40px 60px", borderTop: "1px solid rgba(255,255,255,0.06)", background: "linear-gradient(180deg, #06080a 0%, #081a16 100%)", position: "relative", overflow: "hidden" }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "radial-gradient(700px 400px at 50% 100%, rgba(10,197,168,0.22), transparent 60%)" }} />
        <div style={{ maxWidth: 1440, margin: "0 auto", position: "relative" }}>
          <div style={{ textAlign: "center", paddingBottom: 80 }}>
            <h2 style={{ fontSize: 140, letterSpacing: "-0.04em", fontWeight: 500, margin: 0, lineHeight: 0.9 }}>
              Real coaches.<br/>
              <span style={{ color: "#0ac5a8" }}>One platform.</span>
            </h2>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", marginTop: 48 }}>
              <button style={{ background: "#0ac5a8", color: "#06080a", border: 0, padding: "18px 32px", borderRadius: 999, fontWeight: 600, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>Start training →</button>
              <button style={{ background: "transparent", color: "#fff", border: "1px solid rgba(255,255,255,0.2)", padding: "18px 32px", borderRadius: 999, fontWeight: 500, fontSize: 16, cursor: "pointer", fontFamily: "inherit" }}>Apply as coach</button>
            </div>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 40, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40 }}>
            <div>
              <ShapeWord color="#fff" />
              <p style={{ fontSize: 13, color: "rgba(255,255,255,0.85)", marginTop: 16, maxWidth: 280 }}>Real coaches. One marketplace. One community. One platform.</p>
            </div>
            {[
              ["Platform", ["Marketplace", "Clients", "Trainers", "Nutritionists", "Integrations"]],
              ["Get started", ["Sign up", "Apply as trainer", "Apply as nutritionist", "Pricing"]],
              ["Company", ["About", "Careers", "Press", "Partnerships"]],
              ["Support", ["Help center", "Contact", "Privacy", "Terms"]],
            ].map(([h, links]) => (
              <div key={h}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "rgba(255,255,255,0.75)", textTransform: "uppercase", marginBottom: 16 }}>{h}</div>
                {links.map(l => <div key={l} style={{ fontSize: 13, color: "#ffffff", padding: "6px 0" }}>{l}</div>)}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 48, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.7)" }}>
            <span>© 2026 SHAPE COMMUNITY INC.</span>
            <span>MADE FOR THE WORK ·  v3.0.1</span>
          </div>
        </div>
      </section>
    );
  }

  function Root() {
    return (
      <div style={styles.root}>
        <Nav />
        <Hero />
        <Audiences />
        <Marketplace />
        <Score />
        <TrainerDash />
        <ClientDash />
        <Radio />
        <Testimonials />
        <Faq />
        <Footer />
      </div>
    );
  }

  return Root;
})();

window.DirA = DirA;
