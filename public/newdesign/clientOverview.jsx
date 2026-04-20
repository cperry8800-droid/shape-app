// Client marketing overview — parallel to Coach.html / Nutritionist.html
const { useState: useSClientOv } = React;

// Match home page palette (#06080a near-black-green with light teal text)
const DARK = "#06080a";
const LIGHT = "#e9efed";

// ---------- Hero ----------
function ClientOvHero() {
  return (
    <section style={{ padding: "120px 40px 100px", position: "relative", overflow: "hidden", minHeight: "88vh", display: "flex", alignItems: "center", color: LIGHT }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", width: "100%", position: "relative", display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "7px 14px", borderRadius: 999, background: "rgba(30,192,168,0.12)", border: "1px solid rgba(30,192,168,0.35)", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 40 }}>
            <span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL }}></span>
            For members
          </div>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(60px, 7.6vw, 128px)", letterSpacing: "-0.04em", fontWeight: 400, lineHeight: 0.92, margin: 0, color: LIGHT }}>
            Shape your<br />
            <em style={{ fontStyle: "italic", color: TEAL }}>lifestyle.</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 20, lineHeight: 1.5, color: "rgba(233,239,237,0.72)", margin: "40px 0 48px", maxWidth: 540 }}>
            Train smarter, eat better, and track every step of your progress. Shape puts certified coaches and tools in one place — so you can focus on becoming the best version of yourself.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="Marketplace.html" style={{ padding: "16px 28px", borderRadius: 6, background: TEAL, color: LIGHT, fontFamily: sans, fontSize: 14, fontWeight: 500, letterSpacing: "0.02em" }}>Find your coach →</a>
            <a href="SignupClient.html" style={{ padding: "16px 28px", borderRadius: 6, background: "transparent", color: LIGHT, border: "1px solid rgba(233,239,237,0.25)", fontFamily: sans, fontSize: 14, fontWeight: 500 }}>Start free account</a>
          </div>
          <div style={{ marginTop: 48, display: "flex", gap: 36, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(233,239,237,0.5)" }}>
            <span>Free to start</span>
            <span>Cancel anytime</span>
            <span>Verified pros</span>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ background: "rgba(233,239,237,0.04)", border: "1px solid rgba(233,239,237,0.12)", borderRadius: 14, padding: 28, backdropFilter: "blur(12px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>This week</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.5)" }}>APR 13 — APR 19</div>
            </div>
            <div style={{ display: "grid", gap: 10 }}>
              {[
                { when: "Mon 07:00", kind: "WORKOUT", what: "Lower push · 5 lifts", who: "Maya" },
                { when: "Tue 13:00", kind: "MEAL", what: "Check-in: protein avg", who: "Rae" },
                { when: "Wed 17:30", kind: "WORKOUT", what: "Upper pull · 6 lifts", who: "Maya" },
                { when: "Thu 09:00", kind: "CALL", what: "Quarterly review · 30 min", who: "Maya + Rae" },
                { when: "Fri 07:00", kind: "WORKOUT", what: "Full body · deload", who: "Maya" },
              ].map((it, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "90px 72px 1fr auto", gap: 14, alignItems: "center", padding: "12px 14px", background: "rgba(233,239,237,0.03)", borderRadius: 8, border: "1px solid rgba(233,239,237,0.06)" }}>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.7)", letterSpacing: "0.05em" }}>{it.when}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", color: it.kind === "WORKOUT" ? TEAL : it.kind === "MEAL" ? "#e8b14a" : "rgba(233,239,237,0.8)" }}>{it.kind}</div>
                  <div style={{ fontFamily: serif, fontSize: 15, color: LIGHT, letterSpacing: "-0.005em" }}>{it.what}</div>
                  <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(233,239,237,0.55)" }}>{it.who}</div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(233,239,237,0.08)", display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.5)", letterSpacing: "0.08em" }}>
              <span>5 sessions · 1 review</span>
              <span style={{ color: TEAL }}>on track ●</span>
            </div>
          </div>
          <div style={{ position: "absolute", bottom: -24, left: -24, background: DARK, color: LIGHT, padding: "14px 18px", borderRadius: 10, fontFamily: sans, fontSize: 12, lineHeight: 1.4, boxShadow: "0 20px 40px rgba(0,0,0,0.25)", maxWidth: 220 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(6,8,10,0.5)", marginBottom: 4 }}>From Maya</div>
            Great session. Added 5 lb to your working sets next week — you earned it.
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Value strip ----------
function ClientOvStats() {
  const items = [
    { k: "Free", v: "To join. Pay your coach directly — no middleman markup." },
    { k: "Verified", v: "Every trainer and nutritionist is credential-checked." },
    { k: "Together", v: "Training, nutrition, and community in one place." },
    { k: "Yours", v: "Your data, your plan, your coach. Leave anytime." },
  ];
  return (
    <section style={{ padding: "80px 40px", background: DARK, borderTop: "1px solid rgba(233,239,237,0.08)", borderBottom: "1px solid rgba(233,239,237,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: "12px 32px", borderLeft: i ? "1px solid rgba(233,239,237,0.1)" : "none" }}>
            <div style={{ fontFamily: serif, fontSize: it.k.length > 6 ? 42 : 56, letterSpacing: "-0.035em", fontWeight: 400, color: LIGHT, lineHeight: 1 }}>{it.k}</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(233,239,237,0.6)", marginTop: 14, lineHeight: 1.5, maxWidth: 220 }}>{it.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Why Shape ----------
function ClientOvWhy() {
  const pillars = [
    {
      n: "01",
      title: "One person who knows you",
      body: "Not a chatbot. Not a generic plan. A real coach who reads your logs, writes your program, and messages back. One name, one number, one relationship.",
    },
    {
      n: "02",
      title: "A whole team, if you want one",
      body: "Pair a trainer with a nutritionist. Stack specialists — strength, endurance, recovery, therapy. They see the same calendar, the same goals. No explaining yourself twice.",
    },
    {
      n: "03",
      title: "One place, no app graveyard",
      body: "Workouts, meals, messages, check-ins, invoices, calendar. Everything in one place. Delete the other six apps on your phone.",
    },
  ];
  return (
    <section style={{ padding: "140px 40px", background: LIGHT, color: DARK }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Why Shape for you</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 72px", lineHeight: 1, maxWidth: 1000 }}>
          Everything a coach gives you. <em style={{ fontStyle: "italic", color: TEAL }}>Nothing a chatbot can.</em>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
          {pillars.map((p, i) => (
            <div key={i} style={{ paddingTop: 28, borderTop: `1px solid ${TEAL}` }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "rgba(6,8,10,0.4)", marginBottom: 20 }}>{p.n}</div>
              <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.1, marginBottom: 18, color: "rgba(6,8,10,1)" }}>{p.title}</div>
              <p style={{ fontFamily: sans, fontSize: 14.5, lineHeight: 1.65, color: "rgba(6,8,10,0.7)", margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- How it works ----------
function ClientOvHow() {
  const steps = [
    { n: "01", t: "Tell us what you want", b: "Goals, training history, schedule, injuries, food preferences. Takes about 5 minutes — enough for us to match well.", time: "5 min" },
    { n: "02", t: "Match with a coach", b: "Browse verified trainers and nutritionists, or let Shape recommend. Filter by specialty, format, city, rate. Book a free intro call with up to three.", time: "Same day" },
    { n: "03", t: "Start your first week", b: "Your coach writes your program. You get a calendar, messages thread, and log. Train, eat, check in. They read everything.", time: "Week 1" },
    { n: "04", t: "Adjust as you go", b: "Every 4–6 weeks your coach reviews progress and re-writes. Swap coaches anytime, add a nutritionist, scale up or down — your call.", time: "Ongoing" },
  ];
  return (
    <section style={{ padding: "140px 40px", background: DARK, color: LIGHT }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 80, marginBottom: 80, alignItems: "end" }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>How it works</div>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1 }}>
              From curious<br />
              <em style={{ fontStyle: "italic", color: TEAL }}>to coached</em> in a week.
            </h2>
          </div>
          <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.6, color: "rgba(233,239,237,0.65)", margin: 0, maxWidth: 520 }}>
            Most members find their coach in an afternoon and start the following Monday. Nothing about this has to be slow — but nothing about it is generic either.
          </p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 24 }}>
          {steps.map((s, i) => (
            <div key={i} style={{ padding: 32, background: "rgba(233,239,237,0.03)", border: "1px solid rgba(233,239,237,0.08)", borderRadius: 10, position: "relative" }}>
              <div style={{ position: "absolute", top: 18, right: 20, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.1em", color: TEAL }}>{s.time}</div>
              <div style={{ fontFamily: serif, fontSize: 58, fontWeight: 400, color: TEAL, lineHeight: 1, letterSpacing: "-0.03em", marginBottom: 24 }}>{s.n}</div>
              <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, letterSpacing: "-0.015em", color: LIGHT, marginBottom: 14, lineHeight: 1.15 }}>{s.t}</div>
              <p style={{ fontFamily: sans, fontSize: 13.5, lineHeight: 1.6, color: "rgba(233,239,237,0.65)", margin: 0 }}>{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Paths / plans ----------
function ClientOvPaths() {
  const paths = [
    {
      tag: "Starter",
      title: "Just a trainer",
      body: "One coach. Custom programming, check-ins, form reviews, calendar, and messages. Good for strength, endurance, or general.",
      price: "from $280/mo",
      cta: ["Browse trainers", "Marketplace.html"],
      featured: false,
    },
    {
      tag: "Full stack",
      title: "Trainer + Nutritionist",
      body: "Training and nutrition working off the same goals, calendar, and review cycle. The setup we built Shape for — and what most members choose.",
      price: "from $520/mo",
      cta: ["Match with both", "SignupClient.html"],
      featured: true,
    },
    {
      tag: "Specialists",
      title: "Build a full team",
      body: "Add PT, recovery, sport psych, massage. One roster, one calendar, one invoice. For serious training seasons or real rehab.",
      price: "custom",
      cta: ["Talk to us", "mailto:teams@shape.co"],
      featured: false,
    },
  ];
  return (
    <section style={{ padding: "140px 40px", background: LIGHT, color: DARK }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Three ways in</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 72px", lineHeight: 1, maxWidth: 1000 }}>
          Start with one. <em style={{ fontStyle: "italic", color: TEAL }}>Add more anytime.</em>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {paths.map((p, i) => (
            <div key={i} style={{
              padding: 36,
              borderRadius: 12,
              background: p.featured ? DARK : "transparent",
              color: p.featured ? LIGHT : DARK,
              border: p.featured ? "none" : "1px solid rgba(6,8,10,0.12)",
              display: "flex",
              flexDirection: "column",
              position: "relative",
              minHeight: 380,
            }}>
              {p.featured && (
                <div style={{ position: "absolute", top: 20, right: 20, padding: "5px 10px", borderRadius: 4, background: TEAL, color: LIGHT, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 600 }}>Most common</div>
              )}
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: p.featured ? TEAL : "rgba(6,8,10,0.5)", marginBottom: 16 }}>{p.tag}</div>
              <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: 18 }}>{p.title}</div>
              <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.6, color: p.featured ? "rgba(233,239,237,0.72)" : "rgba(6,8,10,0.7)", margin: "0 0 24px", flex: 1 }}>{p.body}</p>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: p.featured ? TEAL : "rgba(6,8,10,0.7)", marginBottom: 20, letterSpacing: "0.04em" }}>{p.price}</div>
              <a href={p.cta[1]} style={{
                padding: "13px 18px",
                borderRadius: 6,
                background: p.featured ? TEAL : "transparent",
                color: p.featured ? LIGHT : DARK,
                border: p.featured ? "none" : `1px solid rgba(6,8,10,0.25)`,
                fontFamily: sans,
                fontSize: 13,
                fontWeight: 500,
                textAlign: "center",
              }}>{p.cta[0]} →</a>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- What you get ----------
function ClientOvTools() {
  const tools = [
    { t: "Real programming", b: "Your coach writes it. Sets, reps, progressions, substitutions. Updated every cycle based on how you're actually moving." },
    { t: "Food logs that read you back", b: "Photo, barcode, or quick-add. Your nutritionist reviews them. You get real feedback, not a green checkmark." },
    { t: "One calendar", b: "Workouts, meals, check-ins, calls. Syncs with Google, Apple, Outlook. Your coach sees what you see." },
    { t: "Messages with your team", b: "One thread per coach. Form check videos, lift cues, nutrition tweaks. Replies usually within a day." },
    { t: "Shape Score", b: "A weekly read on training load, recovery, and consistency. Uses your log — not your smartwatch's guess." },
    { t: "Community & events", b: "Local runs, lift nights, cohorts, and challenges. Train alone; stay accountable with people in your city." },
  ];
  return (
    <section style={{ padding: "140px 40px", background: DARK, color: LIGHT }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>What you get</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 72px", lineHeight: 1 }}>Everything you actually <em style={{ fontStyle: "italic", color: TEAL }}>use.</em></h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 1, background: "rgba(233,239,237,0.08)", border: "1px solid rgba(233,239,237,0.08)" }}>
          {tools.map((tool, i) => (
            <div key={i} style={{ padding: 36, background: DARK }}>
              <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 400, letterSpacing: "-0.015em", color: LIGHT, marginBottom: 14, lineHeight: 1.15 }}>{tool.t}</div>
              <p style={{ fontFamily: sans, fontSize: 13.5, lineHeight: 1.6, color: "rgba(233,239,237,0.65)", margin: 0 }}>{tool.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- FAQ ----------
function ClientOvFAQ() {
  const faqs = [
    { q: "What does it cost?", a: "Joining Shape is free. You pay your coach directly — their rates range roughly from $140/session (remote) to $900+/month for full-service programming. No platform markup: what your coach lists is what you pay." },
    { q: "Can I try a coach before committing?", a: "Yes. Every listed trainer and nutritionist offers a free 20-minute intro call. Book up to three at once, decide after." },
    { q: "Can I have a trainer and a nutritionist?", a: "That's the most common setup. They see the same calendar and your goals. You message each separately, but they coordinate." },
    { q: "What if it's not working?", a: "Switch coaches whenever. You keep your history, logs, and calendar; your next coach picks up with full context. No fees, no drama." },
    { q: "Do I need a gym?", a: "Up to you and your coach. Filter the marketplace by 'at-home', 'gym-based', or 'hybrid'. Many trainers work with home-gym or bodyweight-only clients." },
    { q: "Is my data safe?", a: "Yes. End-to-end encrypted messages. You own your log data and can export everything anytime. Nothing sold, nothing shared." },
  ];
  const [open, setOpen] = useSClientOv(0);
  return (
    <section style={{ padding: "140px 40px", background: LIGHT, color: DARK }}>
      <div style={{ maxWidth: 960, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>FAQ</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 48px", lineHeight: 1 }}>Common <em style={{ fontStyle: "italic", color: TEAL }}>questions.</em></h2>
        <div style={{ borderTop: "1px solid rgba(6,8,10,0.1)" }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: "1px solid rgba(6,8,10,0.1)" }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: "100%", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "28px 0", background: "transparent", border: "none", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: serif, fontSize: 24, fontWeight: 400, color: DARK, letterSpacing: "-0.015em" }}>{f.q}</span>
                <span style={{ fontFamily: serif, fontSize: 28, color: TEAL, transform: open === i ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
              </button>
              {open === i && <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.65, color: "rgba(6,8,10,0.7)", margin: "0 0 32px", maxWidth: 760 }}>{f.a}</p>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Final CTA ----------
function ClientOvCTA() {
  return (
    <section style={{ padding: "140px 40px", background: DARK, color: LIGHT, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(800px 500px at 50% 100%, rgba(30,192,168,0.14), transparent 70%)" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", textAlign: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 28 }}>Find your coach</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(60px, 8vw, 132px)", letterSpacing: "-0.04em", fontWeight: 400, lineHeight: 0.92, margin: "0 0 48px" }}>
          You're ready.<br /><em style={{ fontStyle: "italic", color: TEAL }}>Pick someone real.</em>
        </h2>
        <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.6, color: "rgba(233,239,237,0.7)", margin: "0 auto 48px", maxWidth: 640 }}>
          Free to join. Free intro calls. The right coach is usually a 20-minute conversation away.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="Marketplace.html" style={{ padding: "18px 32px", borderRadius: 6, background: TEAL, color: LIGHT, fontFamily: sans, fontSize: 14, fontWeight: 500 }}>Browse coaches →</a>
          <a href="SignupClient.html" style={{ padding: "18px 32px", borderRadius: 6, background: "transparent", color: LIGHT, border: "1px solid rgba(233,239,237,0.3)", fontFamily: sans, fontSize: 14, fontWeight: 500 }}>Start free account</a>
        </div>
      </div>
    </section>
  );
}

// ---------- Page ----------
function ClientOverviewPage() {
  return (
    <div style={{ background: DARK, color: LIGHT, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Home%20page%202.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(6,8,10,0.6)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Client Overview" />
        <ClientOvHero />
        <ClientOvStats />
        <ClientOvWhy />
        <ClientOvHow />
        <ClientOvPaths />
        <ClientOvTools />
        <ClientOvFAQ />
        <ClientOvCTA />
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ClientOverviewPage />);
