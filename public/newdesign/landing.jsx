// Landing — role selector. Four paths: Client, Trainer, Nutritionist, Radio.
// Matches Direction B editorial aesthetic from pageShell.jsx.

const ROLES = [
  {
    key: "client",
    kicker: "For members",
    title: "Client",
    blurb: "Browse trainers and nutritionists, get workouts, subscribe to the pros who get you.",
    cta: "Get started",
    href: "SignupClient.html",
    meta: "$5 / month platform",
    perks: ["Every coach, one app", "Workouts + meals in one place", "Cancel any time"],
  },
  {
    key: "trainer",
    kicker: "For coaches",
    title: "Personal Trainer",
    blurb: "Build your brand, publish programs, manage clients, grow a recurring subscriber base.",
    cta: "Apply now",
    href: "SignupTrainer.html",
    meta: "15% platform fee",
    perks: ["Your storefront, your pricing", "Programs + sessions + subs", "Weekly payouts"],
  },
  {
    key: "nutritionist",
    kicker: "For coaches",
    title: "Nutritionist",
    blurb: "Create meal plans, coach clients on nutrition, earn recurring revenue on your terms.",
    cta: "Apply now",
    href: "SignupNutritionist.html",
    meta: "15% platform fee",
    perks: ["Plans + consults + subs", "Built-in macro tracking", "Weekly payouts"],
  },
  {
    key: "radio",
    kicker: "Here for the vibes",
    title: "Shape Radio",
    blurb: "Stream curated, BPM-tagged workout mixes. Ad-free. And when your coach sends you a playlist for a specific workout or meal prep — it plays right here. Included free with Shape membership.",
    cta: "Start listening",
    href: "SignupRadio.html",
    meta: "Free with membership",
    perks: ["Ad-free mixes", "BPM-tagged stations", "Offline downloads"],
  },
];

function MinimalHeader() {
  return (
    <header style={{ position: "absolute", top: 0, left: 0, right: 0, zIndex: 10, padding: "24px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <a href="index.html" aria-label="Shape home" style={{ flex: "none", display: "inline-flex" }}><Logo variant="white" size={50} /></a>
        <div style={{ display: "flex", alignItems: "center", gap: 22 }}>
          <span style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)" }}>Already have an account?</span>
          <a href="Login.html" style={{ fontFamily: sans, fontSize: 13, color: INK, fontWeight: 500, borderBottom: `1.5px solid ${TEAL}`, paddingBottom: 3 }}>Log in</a>
        </div>
      </div>
    </header>
  );
}

function LandingHero() {
  return (
    <section style={{ padding: "160px 40px 60px", position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "end" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL, marginBottom: 22 }}>Welcome to Shape</div>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(56px, 9vw, 128px)", letterSpacing: "-0.04em", fontWeight: 400, margin: 0, lineHeight: 0.92, maxWidth: 1200 }}>
            How will you <em style={{ fontStyle: "italic", fontWeight: 500, color: TEAL }}>Shape</em><br />your next move?
          </h1>
          <p style={{ fontFamily: sans, fontSize: 19, color: "rgba(242,237,228,0.72)", margin: "30px 0 0", maxWidth: 640, lineHeight: 1.55 }}>
            Choose your profile to get started. Your experience is tailored to who you are and what you need.
          </p>
        </div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", textAlign: "right", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          <div>01 — Pick your path</div>
          <div style={{ marginTop: 4 }}>Four doors. One Shape.</div>
        </div>
      </div>
    </section>
  );
}

function RoleCard({ role, index, total }) {
  const [hover, setHover] = React.useState(false);
  const isRadio = role.key === "radio";
  return (
    <a
      href={role.href}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: "flex",
        flexDirection: "column",
        background: hover ? "rgba(242,237,228,0.06)" : "rgba(242,237,228,0.025)",
        border: `1px solid ${hover ? "rgba(30,192,168,0.4)" : "rgba(242,237,228,0.1)"}`,
        borderRadius: 14,
        padding: "36px 32px 30px",
        position: "relative",
        transition: "background 0.25s ease, border-color 0.25s ease, transform 0.25s ease",
        transform: hover ? "translateY(-3px)" : "translateY(0)",
        minHeight: 420,
      }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL }}>{role.kicker}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "rgba(242,237,228,0.4)" }}>{String(index + 1).padStart(2, "0")} / {String(total).padStart(2, "0")}</div>
      </div>

      <h2 style={{ fontFamily: serif, fontSize: 42, letterSpacing: "-0.025em", fontWeight: 400, margin: 0, lineHeight: 1.02 }}>
        {isRadio ? <><span>Shape</span><br /><em style={{ fontStyle: "italic", color: TEAL }}>Radio</em></> : role.title}
      </h2>

      <p style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(242,237,228,0.7)", margin: "18px 0 24px", lineHeight: 1.55, flex: "0 0 auto" }}>{role.blurb}</p>

      <ul style={{ listStyle: "none", padding: 0, margin: "0 0 28px", display: "flex", flexDirection: "column", gap: 9, flex: 1 }}>
        {role.perks.map(p => (
          <li key={p} style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.8)", display: "flex", gap: 10, alignItems: "baseline" }}>
            <span style={{ color: TEAL, fontFamily: sans, fontSize: 12 }}>→</span>
            <span>{p}</span>
          </li>
        ))}
      </ul>

      <div style={{ marginTop: "auto", paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>{role.meta}</div>
        <div style={{ fontFamily: sans, fontSize: 13.5, fontWeight: 500, color: INK, display: "flex", alignItems: "center", gap: 8 }}>
          {role.cta}
          <span style={{ transition: "transform 0.25s ease", transform: hover ? "translateX(4px)" : "translateX(0)", color: TEAL }}>→</span>
        </div>
      </div>
    </a>
  );
}

function RoleGrid() {
  return (
    <section style={{ padding: "20px 40px 100px", position: "relative" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 16 }}>
          {ROLES.map((r, i) => <RoleCard key={r.key} role={r} index={i} total={ROLES.length} />)}
        </div>
      </div>
    </section>
  );
}

function LandingReassurance() {
  const items = [
    { k: "$5/mo", v: "Flat platform fee for members" },
    { k: "Verified", v: "Every trainer and nutritionist credential-checked" },
    { k: "Weekly", v: "Payouts to coaches — or instant" },
    { k: "No lock-in", v: "Cancel any time, take your clients with you" },
  ];
  return (
    <section style={{ padding: "40px 40px 120px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", borderTop: "1px solid rgba(242,237,228,0.1)", paddingTop: 48 }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 40 }}>
          {items.map(it => (
            <div key={it.k}>
              <div style={{ fontFamily: serif, fontSize: it.k.length > 8 ? 40 : 56, letterSpacing: "-0.03em", fontWeight: 400, lineHeight: 1 }}>{it.k}</div>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 10, lineHeight: 1.5, maxWidth: 220 }}>{it.v}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function LandingFooter() {
  return (
    <footer style={{ padding: "40px 40px 40px", borderTop: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>
        <span>© 2026 Shape · All rights reserved</span>
        <div style={{ display: "flex", gap: 24 }}>
          <a href="index.html" style={{ color: "rgba(242,237,228,0.7)" }}>Explore the platform</a>
          <a href="/privacy" style={{ color: "rgba(242,237,228,0.5)" }}>Privacy</a>
          <a href="/terms" style={{ color: "rgba(242,237,228,0.5)" }}>Terms</a>
        </div>
      </div>
    </footer>
  );
}

function LandingPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/get%20started.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(26,22,18,0.6)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <MinimalHeader />
        <LandingHero />
        <RoleGrid />
        <LandingReassurance />
        <LandingFooter />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<LandingPage />);
