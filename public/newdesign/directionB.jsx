// Direction B — Editorial (Ramp-style)
// Warm off-white, serif display + grotesk body, tight editorial grids
const DirB = (() => {
  const PAPER = "#1a1612";
  const INK = "#f2ede4";
  const TEAL = "#1ec0a8";
  const TEAL_BRIGHT = "#2ee0c4";

  const serif = "'Fraunces', 'Instrument Serif', serif";
  const sans = "'Space Grotesk', sans-serif";

  function NavTab({ label, items, href }) {
    const [open, setOpen] = React.useState(false);
    const closeTimer = React.useRef(null);
    const hasMenu = !!items;
    const primaryHref = href || (hasMenu && items[0] && items[0][1]) || "#";
    const tabStyle = { fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(255,255,255,0.92)", fontFamily: sans, fontWeight: 400, cursor: "pointer", paddingBottom: 6, display: "inline-flex", alignItems: "center", gap: 5 };
    const enter = () => { if (closeTimer.current) clearTimeout(closeTimer.current); setOpen(true); };
    const leave = () => { closeTimer.current = setTimeout(() => setOpen(false), 160); };
    return (
      <div style={{ position: "relative", paddingBottom: 14 }} onMouseEnter={() => hasMenu && enter()} onMouseLeave={() => hasMenu && leave()}>
        <a href={primaryHref} style={tabStyle}>
          {label}{hasMenu && <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>}
        </a>
        {hasMenu && open && (
          <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", background: "rgba(26,22,18,0.98)", backdropFilter: "blur(14px)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: 8, minWidth: 180, boxShadow: "0 20px 50px rgba(0,0,0,0.5)", zIndex: 60 }}>
            {items.map(([n, h]) => (
              <a key={n} href={h} style={{ display: "block", padding: "10px 14px", fontSize: 13, color: "rgba(242,237,228,0.85)", fontFamily: sans, borderRadius: 4, whiteSpace: "nowrap" }}
                onMouseEnter={e => { e.currentTarget.style.background = "rgba(30,192,168,0.12)"; e.currentTarget.style.color = INK; }}
                onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(242,237,228,0.85)"; }}
              >{n}</a>
            ))}
          </div>
        )}
      </div>
    );
  }

  function Nav() {
    return (
      <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(26,22,18,0.9)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", gap: 32 }}>
          <ShapeWord variant="white" size={26} />
          <nav style={{ display: "flex", gap: 22, alignItems: "center" }}>
            <NavTab label="Clients" items={[["Overview", "Client.html"], ["Dashboard", "ClientDashboard.html"]]} />
            <NavTab label="Trainers" items={[["Overview", "Coach.html"], ["Dashboard", "TrainerDashboard.html"]]} />
            <NavTab label="Nutritionists" items={[["Overview", "Nutritionist.html"], ["Dashboard", "NutritionistDashboard.html"]]} />
            <NavTab label="Marketplace" href="Marketplace.html" />
            <NavTab label="Community" href="Community.html" />
            <NavTab label="Rewards" href="Score.html" />
            <NavTab label="Radio" href="Radio.html" />
            <NavTab label="Pricing" href="Pricing.html" />
          </nav>
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
            <a href="Login.html" style={{ fontSize: 13, color: "rgba(255,255,255,0.92)", fontFamily: sans, cursor: "pointer" }}>Log in</a>
            <a href="get-started.html" style={{ background: INK, color: PAPER, border: 0, padding: "10px 18px", borderRadius: 6, fontWeight: 500, fontSize: 13, fontFamily: sans, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Get started</a>
          </div>
        </div>
      </header>
    );
  }

  function Hero() {
    return (
      <section style={{ padding: "100px 40px 80px", position: "relative", overflow: "hidden" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "end", marginBottom: 80 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 32 }}>
                One Platform · One Marketplace
              </div>
              <h1 style={{ fontFamily: serif, fontSize: 128, lineHeight: 0.88, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, color: INK }}>
                Real coaches.<br />
                <span style={{ whiteSpace: "nowrap" }}>One <em style={{ fontStyle: "italic", color: TEAL, fontWeight: 400 }}>marketplace</em>.</span>
              </h1>
            </div>
            <div style={{ paddingBottom: 12 }}>
              <p style={{ fontFamily: sans, fontSize: 20, lineHeight: 1.45, color: "rgba(255,255,255,0.92)", margin: 0, maxWidth: 480, fontWeight: 400 }}>
                Browse certified personal trainers and nutritionists — subscribe on your terms with custom sessions, meal plans, and direct access to the people coaching you on one platform.
              </p>
              <div style={{ display: "flex", gap: 12, marginTop: 36 }}>
                <a href="Marketplace.html" style={{ background: INK, color: PAPER, border: 0, padding: "16px 26px", borderRadius: 6, fontWeight: 500, fontSize: 14.5, fontFamily: sans, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Find your coach →</a>
                <a href="Coach.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", padding: "16px 26px", borderRadius: 6, fontWeight: 500, fontSize: 14.5, fontFamily: sans, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>I'm a trainer</a>
              </div>
            </div>
          </div>

          {/* Product screenshot with Ramp-style editorial frame */}
          <div style={{ position: "relative", background: "rgba(242,237,228,0.05)", borderRadius: 16, padding: 4, border: "1px solid rgba(242,237,228,0.1)", boxShadow: "0 40px 80px -30px rgba(0,0,0,0.6)" }}>
            <div style={{ background: PAPER, borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(242,237,228,0.08)", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ display: "flex", gap: 6 }}>
                  {["#ed6a5e", "#f4bf4f", "#62c554"].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c }} />)}
                </div>
                <div style={{ flex: 1, textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}>shape.app/priya</div>
              </div>
              <HeroApp />
            </div>
          </div>
        </div>
      </section>
    );
  }

  function HeroApp() {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr 300px", minHeight: 500 }}>
        {/* Sidebar */}
        <aside style={{ padding: 20, borderRight: "1px solid rgba(242,237,228,0.06)", fontFamily: sans }}>
          <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>My Coaches</div>
          {COACHES.slice(0, 3).map((c, i) => (
            <div key={i} style={{ display: "flex", gap: 10, padding: "10px 8px", borderRadius: 8, background: i === 0 ? "rgba(30,192,168,0.08)" : "transparent", marginBottom: 4, alignItems: "center" }}>
              <Placeholder label="" ratio="1/1" tone="light" style={{ width: 32, height: 32, borderRadius: 999 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 500, color: INK }}>{c.name.split(' ')[0]} {c.name.split(' ')[1][0]}.</div>
                <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{c.tag}</div>
              </div>
            </div>
          ))}
          <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", marginTop: 28, marginBottom: 12 }}>Programs</div>
          {["Hypertrophy · wk 6/12", "Marathon base · wk 2/16", "Nutrition reset · active"].map(p => (
            <div key={p} style={{ padding: "8px 8px", fontSize: 12.5, color: "rgba(242,237,228,0.75)" }}>{p}</div>
          ))}
        </aside>

        {/* Main */}
        <div style={{ padding: "28px 32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", color: TEAL, textTransform: "uppercase" }}>Wednesday, April 18</div>
              <h3 style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", fontWeight: 400, margin: "8px 0 0", color: INK }}>Back to the platform.</h3>
            </div>
            <div style={{ display: "flex", gap: 6, fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              <span>Wk 6 of 12</span><span>·</span><span>14 day streak</span>
            </div>
          </div>

          {/* Stat row — editorial figure */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24, padding: "28px 0", borderTop: "1px solid rgba(242,237,228,0.1)", borderBottom: "1px solid rgba(242,237,228,0.1)" }}>
            {[
              { fig: "168g", label: "Protein today", sub: "93% of target" },
              { fig: "7h 42", label: "Sleep", sub: "+18 min vs 30d" },
              { fig: "62", label: "Shape Score", sub: "Recovery · good" },
              { fig: "4 / 5", label: "Sessions / wk", sub: "On pace" },
            ].map((s, i) => (
              <div key={i}>
                <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", fontWeight: 400, color: INK, lineHeight: 1 }}>{s.fig}</div>
                <div style={{ fontFamily: sans, fontSize: 12.5, marginTop: 10, color: "rgba(242,237,228,0.85)", fontWeight: 500 }}>{s.label}</div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Today's block */}
          <div style={{ marginTop: 24 }}>
            <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 12 }}>Today · 17:30 w/ Maya</div>
            <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", color: INK, marginBottom: 14 }}>Upper push — 5 exercises · 62 min</div>
            {[["Incline DB press", "4 × 8 · 55 lb"], ["Cable fly", "3 × 12"], ["Overhead press", "4 × 6 · 75 lb"]].map(([e, v]) => (
              <div key={e} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderTop: "1px solid rgba(242,237,228,0.06)", fontFamily: sans, fontSize: 13 }}>
                <span style={{ color: INK }}>{e}</span>
                <span style={{ color: "rgba(242,237,228,0.6)", fontFamily: "'JetBrains Mono', monospace", fontSize: 12 }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Right panel */}
        <div style={{ padding: 24, borderLeft: "1px solid rgba(242,237,228,0.06)", background: "rgba(242,237,228,0.02)" }}>
          <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 14 }}>Message · 8:12</div>
          <div style={{ display: "flex", gap: 10, marginBottom: 16, alignItems: "start" }}>
            <Placeholder label="" ratio="1/1" tone="light" style={{ width: 32, height: 32, borderRadius: 999, flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontFamily: sans, fontWeight: 500, color: INK }}>Maya Okafor</div>
              <div style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.4, marginTop: 6, color: INK, fontStyle: "italic" }}>"Nice PR on the RDL yesterday — let's add 5 lb and hold the top for a beat."</div>
            </div>
          </div>
          <div style={{ marginTop: 28, padding: 16, background: PAPER, borderRadius: 10, border: "1px solid rgba(242,237,228,0.08)" }}>
            <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL }}>Radio · now playing</div>
            <div style={{ fontFamily: serif, fontSize: 17, marginTop: 6, color: INK }}>Heavy Day · 132 BPM</div>
            <div style={{ display: "flex", alignItems: "end", gap: 2, height: 26, marginTop: 12 }}>
              {Array.from({ length: 20 }, (_, i) => (
                <div key={i} style={{ flex: 1, height: `${30 + Math.abs(Math.sin(i))*70}%`, background: i < 10 ? TEAL : "rgba(242,237,228,0.15)", borderRadius: 1 }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Stats band under hero
  function Proof() {
    return (
      <section style={{ padding: "64px 40px", borderTop: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", background: INK, color: PAPER }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40, alignItems: "center" }}>
          {STATS.map((s, i) => (
            <div key={i}>
              <div style={{ fontFamily: serif, fontSize: 64, fontWeight: 400, letterSpacing: "-0.03em", lineHeight: 1, color: PAPER }}>{s.k}</div>
              <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(26,22,18,0.55)", marginTop: 12 }}>{s.l}</div>
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Audiences — long horizontal rows, Ramp-style
  function Audiences() {
    const rows = [
      {
        num: "01", tag: "I want to train · I want nutrition", title: "Find your coach.", body: "Browse certified trainers and nutritionists. Subscribe on your terms — custom sessions, meal plans, and direct access to the people coaching you.", bullets: ["Certified: NASM / ACE / RD verified", "Free 15-min intro before you commit", "Switch coaches any time"], cta: "Find your coach →",
      },
      {
        num: "02", tag: "I'm a trainer", title: "Launch your business.", body: "Put your practice in front of Shape members looking for custom programs at no cost. Build your profile, sell your sessions, and let us handle the software, payments, and marketing.", bullets: ["Thousands of members looking", "Programming exports to floor iPads", "$14,800 average monthly payout"], cta: "Apply now →",
      },
      {
        num: "03", tag: "I'm a nutritionist", title: "Grow your practice.", body: "Reach clients who need real nutrition guidance. Create meal plans, sell consultations, and build your client base — Shape handles intake, messaging, and billing.", bullets: ["RD / RDN verified on application", "Meal plan builder with USDA database", "PDF + app-native delivery"], cta: "Apply now →",
      },
    ];
    return (
      <section style={{ padding: "120px 40px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ marginBottom: 64 }}>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>One marketplace. One community. One platform.</div>
            <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "24px 0 0", lineHeight: 0.95, color: INK, maxWidth: 900 }}>
              One product for the person training, the person coaching, and the person feeding them.
            </h2>
          </div>
          {rows.map((r, i) => (
            <div key={i} style={{ borderTop: "1px solid rgba(242,237,228,0.15)", padding: "56px 0", display: "grid", gridTemplateColumns: "100px 1fr 1.2fr 1fr", gap: 40, alignItems: "start" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>— {r.num}</div>
              <div>
                <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>{r.tag}</div>
                <h3 style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", fontWeight: 400, margin: 0, lineHeight: 1.05, color: INK }}>{r.title}</h3>
                <a style={{ fontFamily: sans, fontSize: 14, fontWeight: 500, color: INK, marginTop: 32, display: "inline-block", borderBottom: `1px solid ${TEAL}`, paddingBottom: 2 }}>{r.cta}</a>
              </div>
              <div>
                <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.92)", margin: 0 }}>{r.body}</p>
                <div style={{ marginTop: 20 }}>
                  {r.bullets.map(b => (
                    <div key={b} style={{ display: "flex", gap: 10, padding: "8px 0", fontFamily: sans, fontSize: 13.5, color: INK }}>
                      <span style={{ color: TEAL }}>◆</span> {b}
                    </div>
                  ))}
                </div>
              </div>
              <Placeholder label={`${r.tag} · photo`} ratio="4/5" tone="light" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  // Marketplace — editorial coach grid
  function Marketplace() {
    return (
      <section style={{ padding: "120px 40px", background: "rgba(26,22,18,0.55)", color: INK, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60, alignItems: "end", marginBottom: 56 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Marketplace</div>
              <h2 style={{ fontFamily: serif, fontSize: 84, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.92 }}>
                Real <em style={{ fontStyle: "italic", color: TEAL }}>coaches</em>.<br/>One community.
              </h2>
            </div>
            <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.55, color: "rgba(255,255,255,0.92)", margin: 0, maxWidth: 440 }}>
              3,100 certified coaches across 40 countries. Filtered by specialty, goal, schedule, and fit — not by who paid for placement.
            </p>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
            {COACHES.map((c, i) => (
              <article key={i} style={{ paddingBottom: 24, borderBottom: "1px solid rgba(242,237,228,0.1)" }}>
                <Placeholder label={`${c.name.split(' ')[0]} · portrait`} ratio="3/4" style={{ marginBottom: 20 }} />
                <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL }}>{c.tag} · {c.city}</div>
                <h3 style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", fontWeight: 400, margin: "10px 0 6px" }}>{c.name}</h3>
                <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(255,255,255,0.92)", margin: 0 }}>{c.role}</p>
                <div style={{ display: "flex", justifyContent: "space-between", marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
                  <span>★ {c.rating.toFixed(2)} · {c.sessions}</span>
                  <span>${c.rate}/session</span>
                </div>
              </article>
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 48 }}>
            <a href="Marketplace.html" style={{ background: INK, color: PAPER, border: 0, padding: "16px 28px", borderRadius: 6, fontFamily: sans, fontWeight: 500, fontSize: 14.5, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Browse all 3,100 coaches →</a>
          </div>
        </div>
      </section>
    );
  }

  function PhoneToday() {
    const exercises = [
      { n: 1, name: "Bench press", set: "4 × 6 · 185 lb", badge: "+5 lb", done: true },
      { n: 2, name: "Incline DB press", set: "3 × 10 · 55 lb", badge: "Set 2/3", active: true },
      { n: 3, name: "Cable fly", set: "3 × 12" },
      { n: 4, name: "Triceps pushdown", set: "3 × 12" },
    ];
    return (
      <section style={{ padding: "120px 40px", background: "rgba(26,22,18,0.55)", borderTop: "1px solid rgba(242,237,228,0.1)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 380px", gap: 100, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>In your pocket</div>
            <h2 style={{ fontFamily: serif, fontSize: 84, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.92, color: INK }}>
              Today, <em style={{ fontStyle: "italic", color: TEAL }}>on&nbsp;the&nbsp;floor</em>.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 18, lineHeight: 1.55, color: "rgba(255,255,255,0.92)", maxWidth: 480, marginTop: 28 }}>
              Your block, your coach, your sets — one screen that knows what you're doing next. Notes land in-session. Weights auto-fill from last week. Log a set, move on.
            </p>
            <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 520 }}>
              {[["Auto-loaded", "Programming straight from your coach"], ["In-session notes", "Coach can tweak while you lift"], ["Rest timer", "Between-set timers and tempo cues"], ["Offline ready", "Log sets without signal"]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 500, color: INK, marginBottom: 4 }}>{k}</div>
                  <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", lineHeight: 1.5 }}>{v}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Phone */}
          <div style={{ position: "relative", width: 380, margin: "0 auto" }}>
            <div style={{ position: "absolute", inset: "-40px -60px -40px -60px", background: "radial-gradient(ellipse at center, rgba(30,192,168,0.12), transparent 70%)", filter: "blur(20px)", zIndex: 0 }} />
            <div style={{ position: "relative", zIndex: 1, background: "#000", borderRadius: 48, padding: 10, boxShadow: "0 40px 80px -30px rgba(242,237,228,0.35), 0 0 0 1px rgba(242,237,228,0.08)" }}>
              <div style={{ background: "#0a0d0c", borderRadius: 40, overflow: "hidden", padding: "14px 22px 28px", color: "#fff", fontFamily: sans, minHeight: 720, position: "relative" }}>
                {/* status bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 600, marginBottom: 22 }}>
                  <span>9:41</span>
                  <div style={{ width: 84, height: 26, background: "#000", borderRadius: 999 }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.05em" }}>▂▄▆▇ 􀙇 ▮▮</span>
                </div>
                {/* header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)" }}>TODAY</div>
                    <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em", marginTop: 4 }}>Push — Week 12</div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: "#1a1f1d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>MJ</div>
                </div>
                {/* coach note */}
                <div style={{ marginTop: 20, padding: 16, background: "rgba(30,192,168,0.18)", border: "1px solid rgba(10,197,168,0.25)", borderRadius: 14 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 999, background: "#2a332f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>MJ</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Marcus Johnson</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL_BRIGHT, display: "inline-block" }} />Active · 2m ago</div>
                    </div>
                    <div style={{ color: TEAL_BRIGHT, fontSize: 14 }}>⊡</div>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.45, fontStyle: "italic" }}>"Nice work yesterday — let's ease into today. Stop 2 reps shy on every set."</div>
                </div>
                {/* session header */}
                <div style={{ marginTop: 24, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)" }}>TODAY'S SESSION</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>48 min</div>
                </div>
                {/* exercises */}
                <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
                  {exercises.map(e => (
                    <div key={e.n} style={{ display: "grid", gridTemplateColumns: "40px 1fr auto", gap: 12, alignItems: "center", padding: "12px 14px", background: e.active ? "rgba(30,192,168,0.28)" : "rgba(255,255,255,0.04)", border: e.active ? `1px solid ${TEAL_BRIGHT}` : "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                      <div style={{ width: 30, height: 30, borderRadius: 8, background: e.done ? TEAL_BRIGHT : e.active ? TEAL_BRIGHT : "rgba(255,255,255,0.08)", color: e.done || e.active ? "#0a0d0c" : "rgba(255,255,255,0.6)", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center" }}>{e.done ? "✓" : e.n}</div>
                      <div>
                        <div style={{ fontSize: 14, fontWeight: 600 }}>{e.name}</div>
                        <div style={{ fontSize: 11.5, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{e.set}</div>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: e.done ? TEAL_BRIGHT : "rgba(255,255,255,0.55)" }}>{e.badge || ""}</div>
                    </div>
                  ))}
                </div>
                {/* CTA */}
                <div style={{ position: "absolute", left: 22, right: 22, bottom: 28 }}>
                  <button style={{ width: "100%", padding: "16px 20px", borderRadius: 999, background: "#fff", color: "#0a0d0c", border: 0, fontFamily: sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Log set →</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  function PhoneNutrition() {
    const meals = [
      { n: 1, name: "Oats + whey + berries", set: "520 kcal · 42P / 68C / 9F", badge: "✓", done: true, time: "7:30" },
      { n: 2, name: "Chicken bowl + rice", set: "680 kcal · 52P / 84C / 14F", badge: "LOG NOW", active: true, time: "12:30" },
      { n: 3, name: "Apple + almonds", set: "240 kcal · 6P / 24C / 14F", time: "15:45" },
      { n: 4, name: "Salmon + sweet potato", set: "610 kcal · 44P / 58C / 22F", time: "19:00" },
    ];
    const grocery = [
      { item: "Chicken thighs · 2 lb", aisle: "Butcher", checked: true },
      { item: "Wild salmon · 1 lb", aisle: "Seafood", checked: true },
      { item: "Sweet potatoes · 4", aisle: "Produce" },
      { item: "Greek yogurt · 32 oz", aisle: "Dairy" },
      { item: "Jasmine rice · 2 lb", aisle: "Pantry" },
    ];
    return (
      <section style={{ padding: "120px 40px 140px", background: "rgba(26,22,18,0.55)", borderTop: "1px solid rgba(242,237,228,0.1)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "380px 1fr", gap: 100, alignItems: "center" }}>
          {/* Phone - left side this time for rhythm */}
          <div style={{ position: "relative", width: 380, margin: "0 auto" }}>
            <div style={{ position: "absolute", inset: "-40px -60px -40px -60px", background: "radial-gradient(ellipse at center, rgba(30,192,168,0.12), transparent 70%)", filter: "blur(20px)", zIndex: 0 }} />
            <div style={{ position: "relative", zIndex: 1, background: "#000", borderRadius: 48, padding: 10, boxShadow: "0 40px 80px -30px rgba(242,237,228,0.35), 0 0 0 1px rgba(242,237,228,0.08)" }}>
              <div style={{ background: "#0a0d0c", borderRadius: 40, overflow: "hidden", padding: "14px 22px 28px", color: "#fff", fontFamily: sans, minHeight: 720, position: "relative" }}>
                {/* status bar */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 13, fontWeight: 600, marginBottom: 22 }}>
                  <span>9:41</span>
                  <div style={{ width: 84, height: 26, background: "#000", borderRadius: 999 }} />
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.05em" }}>▂▄▆▇ 􀙇 ▮▮</span>
                </div>
                {/* header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start" }}>
                  <div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)" }}>WEEK 6 · CUT</div>
                    <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em", marginTop: 4 }}>Today's plan</div>
                  </div>
                  <div style={{ width: 36, height: 36, borderRadius: 999, background: "#1a1f1d", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 600, letterSpacing: "0.04em" }}>RL</div>
                </div>
                {/* nutritionist note */}
                <div style={{ marginTop: 20, padding: 16, background: "rgba(30,192,168,0.18)", border: "1px solid rgba(10,197,168,0.25)", borderRadius: 14 }}>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <div style={{ width: 30, height: 30, borderRadius: 999, background: "#2a332f", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>RL</div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>Rae Lindqvist</div>
                      <div style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", display: "flex", alignItems: "center", gap: 6 }}><span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL_BRIGHT, display: "inline-block" }} />Active · 14m ago</div>
                    </div>
                    <div style={{ color: TEAL_BRIGHT, fontSize: 14 }}>⊡</div>
                  </div>
                  <div style={{ fontSize: 12.5, marginTop: 10, color: "rgba(255,255,255,0.8)", lineHeight: 1.45, fontStyle: "italic" }}>"Protein's been short on run days. I bumped lunch to 52g — hit it before the session."</div>
                </div>
                {/* macro progress */}
                <div style={{ marginTop: 22, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                  {[["PROTEIN", "98 / 165g", 0.59, TEAL_BRIGHT], ["CARBS", "142 / 240g", 0.59, "#e89b4a"], ["FAT", "38 / 65g", 0.58, "#c978d8"]].map(([l, v, p, c]) => (
                    <div key={l} style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.06)", borderRadius: 10, padding: "10px 11px" }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", color: "rgba(255,255,255,0.5)" }}>{l}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, marginTop: 3 }}>{v}</div>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.08)", borderRadius: 2, marginTop: 8, overflow: "hidden" }}>
                        <div style={{ width: `${p*100}%`, height: "100%", background: c }} />
                      </div>
                    </div>
                  ))}
                </div>
                {/* meals */}
                <div style={{ marginTop: 22, display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(255,255,255,0.5)" }}>MEALS · 2,050 KCAL</div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,0.5)" }}>Grocery →</div>
                </div>
                <div style={{ marginTop: 12, display: "grid", gap: 7 }}>
                  {meals.map(m => (
                    <div key={m.n} style={{ display: "grid", gridTemplateColumns: "44px 1fr auto", gap: 10, alignItems: "center", padding: "10px 12px", background: m.active ? "rgba(30,192,168,0.28)" : "rgba(255,255,255,0.04)", border: m.active ? `1px solid ${TEAL_BRIGHT}` : "1px solid rgba(255,255,255,0.06)", borderRadius: 12 }}>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.55)" }}>{m.time}</div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.2 }}>{m.name}</div>
                        <div style={{ fontSize: 10.5, color: "rgba(255,255,255,0.5)", marginTop: 2 }}>{m.set}</div>
                      </div>
                      <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: m.done ? TEAL_BRIGHT : m.active ? "#0a0d0c" : "rgba(255,255,255,0.4)", background: m.active ? TEAL_BRIGHT : "transparent", padding: m.active ? "3px 7px" : "0", borderRadius: 4, fontWeight: m.active ? 600 : 400, letterSpacing: "0.04em" }}>{m.badge || ""}</div>
                    </div>
                  ))}
                </div>
                {/* CTA */}
                <div style={{ position: "absolute", left: 22, right: 22, bottom: 28 }}>
                  <button style={{ width: "100%", padding: "16px 20px", borderRadius: 999, background: "#fff", color: "#0a0d0c", border: 0, fontFamily: sans, fontSize: 15, fontWeight: 600, cursor: "pointer" }}>Log meal →</button>
                </div>
              </div>
            </div>
          </div>

          {/* Copy - right side */}
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>In your pocket · nutrition</div>
            <h2 style={{ fontFamily: serif, fontSize: 84, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.92, color: INK }}>
              Eat the plan, <em style={{ fontStyle: "italic", color: TEAL }}>not&nbsp;the&nbsp;app</em>.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 18, lineHeight: 1.55, color: "rgba(255,255,255,0.92)", maxWidth: 480, marginTop: 28 }}>
              Your nutritionist's meal plan, built around your training week. Macros auto-tally as you log. One tap turns the week into a grocery list — sorted by aisle, not guesswork.
            </p>
            <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, maxWidth: 520 }}>
              {[["Macros live", "Protein, carbs, fat update per meal"], ["Grocery list", "One-tap export, sorted by aisle"], ["Swap smart", "Barcode scan for quick substitutes"], ["Coach notes", "Rae tweaks your plan in-app"]].map(([k, v]) => (
                <div key={k}>
                  <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 500, color: INK, marginBottom: 4 }}>{k}</div>
                  <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", lineHeight: 1.5 }}>{v}</div>
                </div>
              ))}
            </div>

            {/* Grocery list preview */}
            <div style={{ marginTop: 40, maxWidth: 520, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, padding: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)" }}>THIS WEEK'S GROCERY</div>
                <div style={{ fontFamily: sans, fontSize: 11.5, color: TEAL }}>Send to Instacart →</div>
              </div>
              {grocery.map((g, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "22px 1fr auto", gap: 12, padding: "9px 0", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)", alignItems: "center" }}>
                  <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${g.checked ? TEAL : "rgba(242,237,228,0.25)"}`, background: g.checked ? TEAL : "transparent", display: "flex", alignItems: "center", justifyContent: "center", color: PAPER, fontSize: 10, fontWeight: 700 }}>{g.checked ? "✓" : ""}</div>
                  <div style={{ fontSize: 13.5, color: g.checked ? "rgba(242,237,228,0.45)" : INK, textDecoration: g.checked ? "line-through" : "none" }}>{g.item}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.45)", letterSpacing: "0.06em" }}>{g.aisle.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  function Score() {
    return (
      <section style={{ padding: "120px 40px", background: "rgba(26,22,18,0.55)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Shape Score</div>
            <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "20px 0 20px", lineHeight: 0.95, color: INK }}>
              Rewards for <em style={{ fontStyle: "italic", color: TEAL }}>showing&nbsp;up</em>.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(255,255,255,0.92)", maxWidth: 460 }}>
              Earn Shape Score for every workout logged, meal tracked, and session kept. Redeem in the Shape Store or as session credit — a reward for the boring stuff that actually moves the needle.
            </p>
            <div style={{ marginTop: 32 }}>
              {[["+12", "Workout logged & completed"], ["+30", "Session with a certified coach"], ["+4", "Meal with macros tracked"], ["2.5×", "14-day streak multiplier"]].map(([k, v], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 20, padding: "18px 0", borderTop: "1px solid rgba(242,237,228,0.1)", alignItems: "baseline" }}>
                  <div style={{ fontFamily: serif, fontSize: 30, letterSpacing: "-0.02em", color: TEAL }}>{k}</div>
                  <div style={{ fontFamily: sans, fontSize: 14.5, color: INK }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
          <div style={{ background: INK, color: PAPER, borderRadius: 20, padding: 40 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 32 }}>
              <div>
                <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,22,18,0.5)" }}>Priya's ledger · Q2</div>
                <div style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, lineHeight: 1, marginTop: 8 }}>1,284<span style={{ fontSize: 22, color: "rgba(26,22,18,0.5)", fontFamily: sans }}>pts</span></div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TEAL, padding: "4px 10px", border: `1px solid ${TEAL}`, borderRadius: 999 }}>+312 Q/Q</div>
            </div>
            <div style={{ display: "flex", alignItems: "end", gap: 4, height: 140, marginBottom: 10 }}>
              {Array.from({ length: 14 }, (_, i) => 20 + Math.round(Math.abs(Math.sin(i*1.3))*80) + (i === 13 ? 20 : 0)).map((h, i) => (
                <div key={i} style={{ flex: 1, height: `${h}%`, background: i === 13 ? TEAL : "rgba(26,22,18,0.12)", borderRadius: 2 }} />
              ))}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,22,18,0.4)", letterSpacing: "0.08em", marginBottom: 28 }}>
              <span>APR 05</span><span>APR 12</span><span>APR 18</span>
            </div>
            <div style={{ paddingTop: 24, borderTop: "1px solid rgba(26,22,18,0.08)" }}>
              <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,22,18,0.5)", marginBottom: 14 }}>Redeem</div>
              {[["Free intro session", "500", "READY"], ["Merch drop · spring", "800", "READY"], ["Radio+ · 30 day", "1,500", "216 TO GO"]].map(([l, c, s], i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderTop: i ? "1px solid rgba(26,22,18,0.06)" : "none", alignItems: "center" }}>
                  <div>
                    <div style={{ fontFamily: serif, fontSize: 17 }}>{l}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,22,18,0.5)", marginTop: 2 }}>{c} PTS</div>
                  </div>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, padding: "4px 8px", borderRadius: 4, background: s === "READY" ? TEAL : "rgba(26,22,18,0.08)", color: s === "READY" ? INK : "rgba(26,22,18,0.5)", letterSpacing: "0.08em" }}>{s}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  // Trainer dashboard screenshot
  function TrainerDash() {
    return (
      <section style={{ padding: "120px 40px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", textAlign: "center", marginBottom: 48 }}>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Trainer dashboard</div>
          <h2 style={{ fontFamily: serif, fontSize: 80, letterSpacing: "-0.035em", fontWeight: 400, margin: "20px 0 20px", lineHeight: 0.95, color: INK, maxWidth: 900, margin: "20px auto 20px" }}>
            Launch your <em style={{ fontStyle: "italic", color: TEAL }}>business</em>.<br/>We handle the rest.
          </h2>
        </div>
        <div style={{ maxWidth: 1320, margin: "0 auto", background: "rgba(242,237,228,0.04)", borderRadius: 16, padding: 4, border: "1px solid rgba(242,237,228,0.1)", boxShadow: "0 40px 80px -40px rgba(0,0,0,0.6)" }}>
          <div style={{ background: PAPER, borderRadius: 12, overflow: "hidden" }}>
            <div style={{ padding: "12px 18px", borderBottom: "1px solid rgba(242,237,228,0.08)", display: "flex", alignItems: "center" }}>
              <div style={{ display: "flex", gap: 6 }}>
                {["#ed6a5e", "#f4bf4f", "#62c554"].map(c => <span key={c} style={{ width: 10, height: 10, borderRadius: 999, background: c }} />)}
              </div>
              <div style={{ flex: 1, textAlign: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}>shape.app/coach/maya</div>
            </div>
            <TrainerApp />
          </div>
        </div>
      </section>
    );
  }

  function TrainerApp() {
    const mono = "'JetBrains Mono', monospace";
    return (
      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", minHeight: 580, fontFamily: sans, color: INK, background: PAPER }}>
        <aside style={{ background: "rgba(0,0,0,0.25)", borderRight: "1px solid rgba(242,237,228,0.06)", padding: 18 }}>
          <ShapeWord variant="white" size={15} />
          <div style={{ marginTop: 24 }}>
            {[["Today", true], ["Clients", false, "34"], ["Programs"], ["Schedule"], ["Messages", false, "3"], ["Payouts"], ["Settings"]].map(([l, on, b]) => (
              <div key={l} style={{ padding: "9px 12px", borderRadius: 8, fontSize: 13, color: on ? INK : "rgba(242,237,228,0.65)", background: on ? "rgba(30,192,168,0.12)" : "transparent", fontWeight: on ? 500 : 400, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                {l}
                {b && <span style={{ fontSize: 10, padding: "1px 6px", background: on ? TEAL : "rgba(242,237,228,0.08)", color: on ? "#fff" : "rgba(242,237,228,0.6)", borderRadius: 999 }}>{b}</span>}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 40, padding: 14, background: "rgba(30,192,168,0.12)", color: INK, border: "1px solid rgba(30,192,168,0.25)", borderRadius: 12 }}>
            <div style={{ fontFamily: mono, fontSize: 9, color: TEAL_BRIGHT, letterSpacing: "0.12em" }}>PAYOUT APR 30</div>
            <div style={{ fontSize: 22, fontWeight: 500, marginTop: 4, letterSpacing: "-0.02em" }}>$14,820</div>
            <div style={{ fontSize: 11, color: "rgba(255,255,255,0.55)" }}>Month to date · +18%</div>
          </div>
        </aside>
        <div style={{ padding: "22px 28px", background: PAPER }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 22 }}>
            <div>
              <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>WEDNESDAY APR 18</div>
              <h3 style={{ fontFamily: serif, fontSize: 32, fontWeight: 400, margin: "4px 0 0", letterSpacing: "-0.02em" }}>Good morning, Maya.</h3>
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.18)", padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontFamily: sans, cursor: "pointer" }}>+ Program</button>
              <button style={{ background: INK, color: PAPER, border: 0, padding: "8px 14px", borderRadius: 999, fontSize: 12.5, fontFamily: sans, fontWeight: 500, cursor: "pointer" }}>New session</button>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 22 }}>
            {[["5", "Sessions today", "$750"], ["34", "Active clients", "+3 this wk"], ["96%", "Completion", "30d"], ["4.97", "Rating", "1,284 reviews"]].map(([v, l, s], i) => (
              <div key={i} style={{ background: PAPER, borderRadius: 12, padding: 16, border: "1px solid rgba(242,237,228,0.05)" }}>
                <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1 }}>{v}</div>
                <div style={{ fontSize: 12, color: "rgba(255,255,255,0.92)", marginTop: 8 }}>{l}</div>
                <div style={{ fontSize: 11, color: "rgba(242,237,228,0.45)", marginTop: 2 }}>{s}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 16 }}>
            <div style={{ background: PAPER, borderRadius: 12, padding: 16, border: "1px solid rgba(242,237,228,0.05)" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Today's schedule</div>
              {[
                ["07:00", "Priya S.", "Lower pull · remote", "done"],
                ["09:30", "Deandre K.", "Upper push · Brooklyn", "done"],
                ["14:00", "Sam O.", "Intake call · new", "next"],
                ["17:30", "Priya S.", "Upper push · remote", ""],
                ["19:00", "Jaya P.", "Nutrition review", ""],
              ].map(([t, n, d, s], i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "52px 1fr auto", gap: 12, padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none", alignItems: "center" }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{t}</div>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 500 }}>{n}</div>
                    <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{d}</div>
                  </div>
                  {s && <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 7px", borderRadius: 4, background: s === "done" ? "rgba(242,237,228,0.06)" : TEAL, color: s === "done" ? "rgba(242,237,228,0.6)" : "#fff", letterSpacing: "0.08em", textTransform: "uppercase" }}>{s}</span>}
                </div>
              ))}
            </div>
            <div style={{ background: PAPER, borderRadius: 12, padding: 16, border: "1px solid rgba(242,237,228,0.05)" }}>
              <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 10 }}>Client pulse</div>
              {COACHES.slice(0, 5).map((c, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 0", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
                  <Placeholder label="" ratio="1/1" tone="light" style={{ width: 30, height: 30, borderRadius: 999, flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 12.5, fontWeight: 500 }}>{c.name.split(' ')[0]}</div>
                    <div style={{ fontSize: 10.5, color: "rgba(242,237,228,0.55)" }}>{(i+1)*2} workouts · {i*3+4}d streak</div>
                  </div>
                  <svg viewBox="0 0 40 16" style={{ width: 40, height: 16 }}>
                    <polyline points={Array.from({ length: 8 }, (_, j) => `${j*5},${14 - Math.abs(Math.sin(j + i)) * 12}`).join(" ")} stroke={TEAL} strokeWidth="1.5" fill="none" />
                  </svg>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Radio
  function Radio() {
    return (
      <section style={{ padding: "120px 40px", position: "relative", overflow: "hidden", color: INK }}>
        <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url('/Make_the_lines_202604170430%20(1).png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(6,10,9,0.85) 0%, rgba(6,10,9,0.65) 45%, rgba(6,10,9,0.3) 100%)", pointerEvents: "none" }} />
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.1fr 1fr", gap: 80, alignItems: "center", position: "relative" }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Shape Radio</div>
            <h2 style={{ fontFamily: serif, fontSize: 84, letterSpacing: "-0.035em", fontWeight: 400, margin: "20px 0 20px", lineHeight: 0.9 }}>
              Music built<br/>for <em style={{ fontStyle: "italic", color: TEAL }}>training</em>.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "#ffffff", maxWidth: 460 }}>
              Ad-free workout mixes, curated playlists, live sets, and beats designed to keep you moving. Included with every Shape membership.
            </p>
          </div>
          <RadioPlayer />
        </div>
      </section>
    );
  }

  function RadioPlayer() {
    const [bars, setBars] = useState(Array.from({length: 32}, () => Math.random()));
    useEffect(() => { const id = setInterval(() => setBars(Array.from({length: 32}, () => Math.random())), 220); return () => clearInterval(id); }, []);
    return (
      <div style={{ background: "rgba(26,22,18,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 4, padding: 32 }}>
        <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", color: TEAL_BRIGHT, textTransform: "uppercase" }}>◉ Live · 1,284 listening</div>
        <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.02em", marginTop: 14, lineHeight: 1 }}>Heavy Day · 132 BPM</div>
        <div style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(255,255,255,0.92)", marginTop: 8 }}>DJ Kaya Mars — Lift Series vol. 04</div>
        <div style={{ display: "flex", alignItems: "center", gap: 3, height: 56, marginTop: 28 }}>
          {bars.map((h, i) => (
            <div key={i} style={{ flex: 1, height: `${20 + h*80}%`, background: i < 16 ? TEAL_BRIGHT : "rgba(242,237,228,0.2)", borderRadius: 1, transition: "height .2s" }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          <a href="Radio.html" style={{ background: TEAL_BRIGHT, color: PAPER, border: 0, padding: "12px 22px", borderRadius: 6, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>▶ Play mix</a>
          <a href="Radio.html" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "12px 22px", borderRadius: 6, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Browse stations</a>
        </div>
      </div>
    );
  }

  // Testimonials
  function Testimonials() {
    return (
      <section style={{ padding: "120px 40px" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>Members</div>
          <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "20px 0 56px", lineHeight: 0.95, color: INK }}>
            From the <em style={{ fontStyle: "italic", color: TEAL }}>community</em>.
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40 }}>
            {TESTIMONIALS.map((t, i) => (
              <figure key={i} style={{ margin: 0 }}>
                <div style={{ fontFamily: serif, fontSize: 40, letterSpacing: "-0.02em", lineHeight: 1, color: TEAL, marginBottom: 20 }}>"</div>
                <blockquote style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.3, letterSpacing: "-0.01em", color: INK, margin: 0 }}>{t.quote}</blockquote>
                <figcaption style={{ marginTop: 32, paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.15)", display: "flex", alignItems: "center", gap: 12 }}>
                  <Placeholder label="" ratio="1/1" tone="light" style={{ width: 36, height: 36, borderRadius: 999 }} />
                  <div style={{ flex: 1, fontFamily: sans }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: INK }}>{t.name}</div>
                    <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{t.role}</div>
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TEAL }}>{t.metric}</div>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>
    );
  }

  // FAQ
  function Faq() {
    const [open, setOpen] = useState(0);
    return (
      <section style={{ padding: "120px 40px", background: "rgba(26,22,18,0.55)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 80 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL }}>FAQ</div>
            <h2 style={{ fontFamily: serif, fontSize: 64, letterSpacing: "-0.03em", fontWeight: 400, margin: "20px 0 0", lineHeight: 0.95, color: INK }}>
              Good <em style={{ fontStyle: "italic", color: TEAL }}>questions</em>.
            </h2>
            <p style={{ fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.6)", lineHeight: 1.55, marginTop: 20 }}>Can't find it? hello@shape — we reply within the hour.</p>
          </div>
          <div>
            {FAQ.map((f, i) => (
              <div key={i} onClick={() => setOpen(open === i ? -1 : i)} style={{ borderTop: "1px solid rgba(242,237,228,0.15)", padding: "28px 0", cursor: "pointer" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 24 }}>
                  <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.01em", color: INK }}>{f.q}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", color: TEAL, fontSize: 18 }}>{open === i ? "−" : "+"}</div>
                </div>
                {open === i && <div style={{ marginTop: 16, fontFamily: sans, fontSize: 15, lineHeight: 1.6, color: "rgba(255,255,255,0.92)", maxWidth: 640 }}>{f.a}</div>}
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }

  function Footer() {
    return (
      <section style={{ padding: "100px 40px 40px", background: "rgba(26,22,18,0.7)", color: "#ffffff", borderTop: "1px solid rgba(255,255,255,0.12)" }}>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <h2 style={{ fontFamily: serif, fontSize: 160, letterSpacing: "-0.04em", fontWeight: 400, lineHeight: 0.88, margin: "0 0 60px", color: "#ffffff" }}>
            Join the<br/><em style={{ fontStyle: "italic", color: TEAL }}>community</em>.
          </h2>
          <div style={{ display: "flex", gap: 12, marginBottom: 100 }}>
            <a href="get-started.html" style={{ background: "#ffffff", color: PAPER, border: 0, padding: "18px 32px", borderRadius: 6, fontFamily: sans, fontWeight: 500, fontSize: 15, cursor: "pointer", textDecoration: "none", display: "inline-block" }}>Get Started →</a>
          </div>
          <div style={{ borderTop: "1px solid rgba(255,255,255,0.15)", paddingTop: 40, display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40 }}>
            <div>
              <ShapeWord variant="black" size={30} />
              <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(255,255,255,0.8)", marginTop: 16, maxWidth: 280 }}>A marketplace for certified trainers and nutritionists. Real coaches. One platform.</p>
            </div>
            {[
              ["Platform", ["Marketplace", "Clients", "Trainers", "Nutritionists"]],
              ["Start", ["Sign up", "Apply", "Pricing"]],
              ["Company", ["About", "Careers", "Press"]],
              ["Help", ["Center", "Contact", "Privacy", "Terms"]],
            ].map(([h, links]) => (
              <div key={h}>
                <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", color: "rgba(255,255,255,0.7)", textTransform: "uppercase", marginBottom: 16 }}>{h}</div>
                {links.map(l => <div key={l} style={{ fontFamily: sans, fontSize: 13, color: "#ffffff", padding: "6px 0" }}>{l}</div>)}
              </div>
            ))}
          </div>
          <div style={{ marginTop: 60, paddingTop: 24, borderTop: "1px solid rgba(255,255,255,0.12)", display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(255,255,255,0.6)" }}>
            <span>© 2026 SHAPE</span>
            <span>BROOKLYN · LISBON · MELBOURNE</span>
          </div>
        </div>
      </section>
    );
  }

  function Root() {
    return (
      <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Home%20page%202.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "linear-gradient(180deg, rgba(26,22,18,0.55) 0%, rgba(26,22,18,0.7) 100%)", pointerEvents: "none" }} />
        <div style={{ position: "relative", zIndex: 1 }}>
          <Nav />
          <Hero />
          <Audiences />
          <PhoneToday />
          <PhoneNutrition />
          <Marketplace />
          <Score />
          <TrainerDash />
          <Radio />
          <Faq />
          <Footer />
        </div>
      </div>
    );
  }
  return Root;
})();

window.DirB = DirB;
