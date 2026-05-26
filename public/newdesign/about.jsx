// About page — tight one-screen mission/story page, dropped into the standard
// marketing shell (Header + Footer from pageShell.jsx).

function AboutHero() {
  return (
    <section style={{ padding: "40px 72px 100px", position: "relative", overflow: "hidden", minHeight: "78vh", display: "flex", alignItems: "center" }}>
      <div aria-hidden style={{ position: "absolute", width: 620, height: 620, top: "-20%", right: "-8%", borderRadius: "50%", filter: "blur(85px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", width: "100%", textAlign: "center" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 14px", borderRadius: 999, background: "rgba(10,197,168,0.12)", border: "1px solid rgba(10,197,168,0.35)", fontFamily: mono, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 32 }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL }}></span>
          About Shape
        </div>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(48px, 7vw, 104px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.94, color: INK }}>
          Real coaches.<br />
          <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>One community.</em>
        </h1>
        <p style={{ fontFamily: sans, fontSize: 19, color: "rgba(242,237,228,0.74)", margin: "36px auto 0", maxWidth: 720, lineHeight: 1.6 }}>
          Shape connects everyday people with vetted trainers and nutritionists — and gives those coaches a real platform to run their practice. No bots. No bundles. No lock-in. Just the loop that makes fitness actually stick: train, eat, recover, repeat — with a human in your corner.
        </p>
      </div>
    </section>
  );
}

function AboutMission() {
  const items = [
    {
      k: "01",
      t: "A platform built around the coach.",
      p: "Most apps treat coaches as content. We treat them as the product. Programming tools, payouts, scheduling, messaging, and analytics — all in one place, built by people who actually train clients.",
    },
    {
      k: "02",
      t: "A marketplace built around trust.",
      p: "Every trainer and nutritionist on Shape is credential-checked before they earn a single dollar. Browse, read, message — no paywall before you've found the right fit. The platform fee is flat ($5/mo); your coach's rate is paid to them, directly.",
    },
    {
      k: "03",
      t: "An app built around the loop.",
      p: "Train, eat, recover, coach — every day. Workouts loaded the night before. Macros tallied as you log. Shape Score reads the truth at the end of every week. Your coach adjusts before you stall, not after.",
    },
  ];
  return (
    <section style={{ padding: "100px 72px 140px", background: INK, color: PAPER, position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>What we believe</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(36px, 5vw, 64px)", letterSpacing: "-0.03em", fontWeight: 300, margin: 0, lineHeight: 1.02, maxWidth: 780 }}>
          The future of fitness is <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>human</em>.
        </h2>
        <div style={{ marginTop: 72, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 40 }}>
          {items.map((it) => (
            <div key={it.k}>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", color: TEAL_BRIGHT, marginBottom: 18 }}>{it.k}</div>
              <div style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.01em", fontWeight: 400, color: PAPER, lineHeight: 1.2, marginBottom: 14 }}>{it.t}</div>
              <p style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(26,22,18,0.72)", lineHeight: 1.65, margin: 0 }}>{it.p}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function AboutStats() {
  const stats = [
    { k: "$5", l: "flat platform fee — that's it" },
    { k: "100%", l: "vetted before going live" },
    { k: "0", l: "lock-in. Cancel anytime." },
  ];
  return (
    <section style={{ padding: "100px 72px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, justifyItems: "center", textAlign: "center" }}>
        {stats.map((s) => (
          <div key={s.k} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
            <div style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.035em", fontWeight: 300, lineHeight: 1, color: INK }}>{s.k}</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 12, lineHeight: 1.55, maxWidth: 220 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

function AboutCTA() {
  return (
    <section style={{ padding: "60px 72px 140px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <h3 style={{ fontFamily: serif, fontSize: "clamp(32px, 4.4vw, 54px)", letterSpacing: "-0.03em", fontWeight: 300, margin: 0, lineHeight: 1.05 }}>
          Find your <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>coach</em>.<br />Build your <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>practice</em>.
        </h3>
        <div style={{ marginTop: 36, display: "flex", gap: 14, flexWrap: "wrap", justifyContent: "center" }}>
          <a href="Marketplace.html" style={{ padding: "16px 30px", borderRadius: 2, background: TEAL, color: PAPER, fontFamily: sans, fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}>Browse the marketplace →</a>
          <a href="SignupTrainer.html" style={{ padding: "16px 30px", borderRadius: 2, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", fontFamily: sans, fontSize: 14.5, fontWeight: 600, textDecoration: "none" }}>Apply as a coach</a>
        </div>
      </div>
    </section>
  );
}

function AboutPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh" }}>
      <Header active="About" />
      <AboutHero />
      <AboutMission />
      <AboutStats />
      <AboutCTA />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<AboutPage />);
