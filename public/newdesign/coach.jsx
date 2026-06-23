// Trainer overview — marketing page for prospective trainers. Spatial Cinema language.

const CO_RPR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function CoReveal({ children, delay = 0, style = {} }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(CO_RPR);
  React.useEffect(() => {
    if (CO_RPR || !ref.current) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { threshold: 0.1 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(34px)", transition: `opacity .75s ease ${delay}ms, transform .75s ease ${delay}ms`, ...style }}>{children}</div>;
}

// ---------- Hero ----------
function TrainerHero() {
  return (
    <section style={{ padding: "40px 72px 30px", position: "relative", overflow: "hidden", minHeight: "78vh", display: "flex", alignItems: "center" }}>
      <div aria-hidden style={{ position: "absolute", width: 660, height: 660, top: "-20%", right: "-8%", borderRadius: "50%", filter: "blur(85px)", opacity: 0.32, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", width: "100%", display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 72, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 28 }}>For trainers</div>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(52px, 7vw, 108px)", letterSpacing: "-0.045em", fontWeight: 300, margin: 0, lineHeight: 0.92, color: INK }}>
            Shape how people <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>train.</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(242,237,228,0.74)", margin: "32px 0 0", maxWidth: 540, lineHeight: 1.55 }}>
            Shape puts your training business in front of potential clients actively looking for custom programs. Build your profile. Sell your sessions. No cost to join.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 40, flexWrap: "wrap" }}>
            <a href="SignupTrainer.html" style={{ padding: "16px 30px", borderRadius: 2, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer", letterSpacing: "0.01em" }}>Apply now — it's free</a>
            <a href="Marketplace.html" style={{ padding: "16px 30px", borderRadius: 2, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", fontFamily: sans, fontSize: 14.5, fontWeight: 600, cursor: "pointer" }}>See trainers on Shape</a>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          {/* Coach's notebook / lift card — paper-clipboard look with mono-numeric set grid */}
          <div style={{
            background: "linear-gradient(180deg, rgba(11,14,12,0.55) 0%, rgba(6,8,10,0.42) 100%)",
            border: "1px solid rgba(242,237,228,0.14)",
            borderRadius: 4,
            padding: "26px 26px 22px",
            position: "relative",
            boxShadow: "0 30px 80px rgba(0,0,0,0.5)",
            backdropFilter: "blur(10px)",
            WebkitBackdropFilter: "blur(10px)",
            backgroundImage: "repeating-linear-gradient(180deg, transparent 0, transparent 27px, rgba(242,237,228,0.04) 27px, rgba(242,237,228,0.04) 28px)",
          }}>
            {/* Header — block/session, lined up like a training journal */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 10, borderBottom: `2px solid ${TEAL}` }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 9.5, letterSpacing: "0.28em", color: TEAL, textTransform: "uppercase" }}>Session 14 · Block 3 / Wk 3</div>
                <div style={{ fontFamily: serif, fontSize: 24, color: INK, marginTop: 4, letterSpacing: "-0.015em", lineHeight: 1.1 }}>Lower Push <span style={{ color: "rgba(242,237,228,0.5)", fontFamily: mono, fontSize: 11, letterSpacing: "0.14em" }}>· 62 MIN</span></div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.2em", color: "rgba(242,237,228,0.45)" }}>RPE TARGET</div>
                <div style={{ fontFamily: mono, fontSize: 22, color: INK, marginTop: 2, fontWeight: 600, letterSpacing: "-0.01em" }}>8.0</div>
              </div>
            </div>

            {/* Set log grid — exercises with set × load × reps × rpe rows */}
            <div style={{ padding: "14px 0 6px" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1.4fr 38px 60px 50px 44px", gap: 8, fontFamily: mono, fontSize: 8.5, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,237,228,0.45)", padding: "0 2px 6px", borderBottom: `1px dashed rgba(242,237,228,0.18)` }}>
                <span>Lift</span><span style={{ textAlign: "center" }}>SET</span><span style={{ textAlign: "right" }}>LOAD</span><span style={{ textAlign: "right" }}>REPS</span><span style={{ textAlign: "right" }}>RPE</span>
              </div>
              {[
                { lift: "Back Squat",      sets: ["1×5 @ 225", "2×5 @ 245", "3×5 @ 255"], top: { set: "3", load: "255", reps: "5", rpe: "8.5" }, accent: TEAL },
                { lift: "Romanian Deadlift", sets: ["1×8 @ 185", "2×8 @ 205", "3×8 @ 215"], top: { set: "3", load: "215", reps: "8", rpe: "8" }, accent: TEAL },
                { lift: "Split Squat",     sets: ["1×10 @ 60", "2×10 @ 65"], top: { set: "2", load: "65", reps: "10", rpe: "7.5" }, accent: "#e8b14a" },
                { lift: "Hanging Leg Raise", sets: ["1×12 BW", "2×12 BW", "3×12 BW"], top: { set: "3", load: "BW", reps: "12", rpe: "—" }, accent: "rgba(242,237,228,0.5)" },
              ].map((ex, i) => (
                <div key={i} style={{ display: "grid", gridTemplateColumns: "1.4fr 38px 60px 50px 44px", gap: 8, alignItems: "center", padding: "9px 2px", borderBottom: i === 3 ? "none" : `1px dotted rgba(242,237,228,0.1)` }}>
                  <div>
                    <div style={{ fontFamily: serif, fontSize: 14, color: INK, letterSpacing: "-0.005em", lineHeight: 1.15 }}>{ex.lift}</div>
                    <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.06em", color: "rgba(242,237,228,0.4)", marginTop: 2 }}>{ex.sets.length} sets · last: {ex.sets[ex.sets.length - 1]}</div>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: ex.accent, textAlign: "center", fontWeight: 600 }}>{ex.top.set}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: INK, textAlign: "right", letterSpacing: "0.02em" }}>{ex.top.load}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.75)", textAlign: "right" }}>{ex.top.reps}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: ex.accent, textAlign: "right" }}>{ex.top.rpe}</div>
                </div>
              ))}
            </div>

            {/* Volume sparkline */}
            <div style={{ marginTop: 6, paddingTop: 12, borderTop: `2px solid rgba(242,237,228,0.22)`, display: "grid", gridTemplateColumns: "1fr auto", gap: 16, alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 9, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)" }}>Weekly volume · lbs lifted</div>
                <svg viewBox="0 0 220 36" style={{ width: "100%", height: 36, marginTop: 4 }}>
                  <polyline points="4,28 28,22 52,24 76,16 100,18 124,10 148,14 172,6 196,9 216,3" stroke={TEAL_BRIGHT} strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <polyline points="4,28 28,22 52,24 76,16 100,18 124,10 148,14 172,6 196,9 216,3 216,36 4,36" fill={`${TEAL}`} fillOpacity="0.12" stroke="none" />
                  <circle cx="216" cy="3" r="2.5" fill={TEAL_BRIGHT} />
                </svg>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: serif, fontSize: 22, color: INK, letterSpacing: "-0.015em", lineHeight: 1 }}>48,720</div>
                <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginTop: 3 }}>+6.4% w/w</div>
              </div>
            </div>
          </div>
          {/* Coach signature tag, like a clipboard owner tag */}
          <div style={{ position: "absolute", top: -14, right: 18, background: INK, color: PAPER, padding: "5px 10px", borderRadius: 2, fontFamily: mono, fontSize: 9, letterSpacing: "0.2em", fontWeight: 700, textTransform: "uppercase", boxShadow: "0 6px 18px rgba(0,0,0,0.35)" }}>Coach · Maya O.</div>
        </div>
      </div>
    </section>
  );
}

// ---------- Value strip ----------
function TrainerStats() {
  const items = [
    { k: "Free", v: "To join and list your services. No monthly dues, no setup fees, no per-booking cuts." },
    { k: "Weekly", v: "Payouts direct to your bank, or instant any day." },
    { k: "Verified", v: "Every coach credential-checked on intake." },
    { k: "Yours", v: "Your brand, your pricing, your clients. No lock-in." },
  ];
  return (
    <section style={{ padding: "80px 72px", borderTop: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div className="co-stats" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0 }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: "12px 32px", borderLeft: i ? "1px solid rgba(242,237,228,0.1)" : "none" }}>
            <div style={{ fontFamily: serif, fontSize: it.k.length > 6 ? 42 : 58, letterSpacing: "-0.04em", fontWeight: 300, color: INK, lineHeight: 1 }}>{it.k}</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 14, lineHeight: 1.5, maxWidth: 220 }}>{it.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Why Shape ----------
function TrainerWhy() {
  const pillars = [
    { n: "01", title: "Own your brand", body: "Your name on the door. Your colors, your voice, your pricing. Shape is the infrastructure — clients sign up for you, not a faceless platform." },
    { n: "02", title: "Real tools, not templates", body: "Program builder that understands periodization. Form-check video threads. Auto-progression. The tools fitness apps build for themselves — built for you." },
    { n: "03", title: "One marketplace, real demand", body: "Members browse trainers every day by specialty, schedule, and format. Get matched with clients whose goals and experience fit how you coach." },
  ];
  return (
    <section style={{ padding: "40px 72px 140px" }}>
      <CoReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Why Shape</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 82px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 80px", lineHeight: 0.98, color: INK, maxWidth: 1100 }}>
            The platform that <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>gets out of the way.</em>
          </h2>
          <div className="co-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
            {pillars.map((p, i) => (
              <CoReveal key={i} delay={i * 80}>
                <div style={{ fontFamily: mono, fontSize: 12, color: TEAL, letterSpacing: "0.16em", marginBottom: 24 }}>{p.n}</div>
                <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 16px", lineHeight: 1.12, color: INK }}>{p.title}</h3>
                <p style={{ fontFamily: sans, fontSize: 15.5, color: "rgba(242,237,228,0.66)", lineHeight: 1.62, margin: 0 }}>{p.body}</p>
              </CoReveal>
            ))}
          </div>
        </div>
      </CoReveal>
    </section>
  );
}

// ---------- How it works ----------
function TrainerHow() {
  const steps = [
    { n: "01", t: "Apply in 10 minutes", b: "Tell us about your credentials, specialty, and coaching style. We verify CPT, CSCS, or equivalent.", time: "10 min" },
    { n: "02", t: "Review in 2–3 days", b: "Our team reads every application. We reach out to learn more or with an approval.", time: "2–3 days" },
    { n: "03", t: "Set up your storefront", b: "Upload your programs, set session pricing, connect your calendar, write your bio. We help with copy.", time: "1–2 hrs" },
    { n: "04", t: "Start getting matched", b: "Your profile goes live in the marketplace. New client inquiries land in your inbox within the first week.", time: "Ongoing" },
  ];
  return (
    <section style={{ padding: "140px 72px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 80, gap: 40, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>How it works</div>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 82px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.98 }}>From application to first client in <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>under two weeks.</em></h2>
          </div>
          <a href="SignupTrainer.html" style={{ padding: "15px 26px", borderRadius: 2, background: PAPER, color: INK, fontFamily: sans, fontSize: 13, fontWeight: 600, whiteSpace: "nowrap" }}>Start application →</a>
        </div>
        <div className="co-steps" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, borderTop: "1px solid rgba(26,22,18,0.12)" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ padding: "40px 32px 72px 0", borderLeft: i ? "1px solid rgba(26,22,18,0.12)" : "none", paddingLeft: i ? 32 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
                <div style={{ fontFamily: mono, fontSize: 12, color: TEAL, letterSpacing: "0.14em" }}>{s.n}</div>
                <div style={{ fontFamily: mono, fontSize: 10.5, color: "rgba(26,22,18,0.45)", letterSpacing: "0.08em" }}>{s.time}</div>
              </div>
              <h3 style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 14px", lineHeight: 1.15 }}>{s.t}</h3>
              <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(26,22,18,0.7)", lineHeight: 1.55, margin: 0 }}>{s.b}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Earnings calculator ----------
function TrainerEarnings() {
  const [clients, setClients] = React.useState(20);
  const [price, setPrice] = React.useState(120);
  const PLATFORM_FEE_RATE = 0.15;
  const grossMonthly = clients * price * 4;
  const feeMonthly = grossMonthly * PLATFORM_FEE_RATE;
  const monthly = grossMonthly - feeMonthly;
  const yearly = monthly * 12;
  return (
    <section style={{ padding: "140px 72px" }}>
      <CoReveal>
        <div className="co-earn" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 80, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Earnings</div>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5vw, 78px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 28px", lineHeight: 0.96, color: INK }}>Set your price. <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>See your take-home.</em></h2>
            <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.68)", lineHeight: 1.62, margin: "0 0 28px", maxWidth: 500 }}>
              Set your own session price and keep what you earn. No monthly dues, no setup fees, no per-booking cuts — Shape only takes a small platform fee when you get paid. Cancel any time.
            </p>
            <div style={{ background: "rgba(11,14,12,0.62)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, padding: "22px 24px", marginBottom: 28, maxWidth: 500 }}>
              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>What Shape covers</div>
              <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.72)", lineHeight: 1.55 }}>
                Client acquisition through the Shape marketplace, in-app messaging and video, program hosting, scheduling, and liability coverage. Standard card processing is separate.
              </div>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
              {["No monthly fee — you only pay Shape when you earn", "Link your existing Stripe account, or set one up in 5 minutes", "Weekly payouts direct to your bank"].map(t => (
                <li key={t} style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(242,237,228,0.76)", display: "flex", gap: 12, alignItems: "baseline" }}>
                  <span style={{ color: TEAL }}>→</span>{t}
                </li>
              ))}
            </ul>
          </div>
          <div style={{ background: "rgba(11,14,12,0.62)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 8, padding: 44, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7 }} />
            <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 32 }}>Estimate your take-home</div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <label style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)" }}>Active clients</label>
                <div style={{ fontFamily: serif, fontSize: 30, color: INK, letterSpacing: "-0.02em" }}>{clients}</div>
              </div>
              <input type="range" min="5" max="50" value={clients} onChange={e => setClients(+e.target.value)} style={{ width: "100%", accentColor: TEAL }} />
            </div>
            <div style={{ marginBottom: 32 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
                <label style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)" }}>Session price</label>
                <div style={{ fontFamily: serif, fontSize: 30, color: INK, letterSpacing: "-0.02em" }}>${price}</div>
              </div>
              <input type="range" min="40" max="300" step="5" value={price} onChange={e => setPrice(+e.target.value)} style={{ width: "100%", accentColor: TEAL }} />
            </div>
            <div style={{ padding: "22px 0 0", borderTop: "1px solid rgba(242,237,228,0.1)" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
                <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>Gross monthly</div>
                <div style={{ fontFamily: mono, fontSize: 14, color: "rgba(242,237,228,0.75)" }}>${grossMonthly.toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 18, borderBottom: "1px dashed rgba(242,237,228,0.12)" }}>
                <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>Platform fee</div>
                <div style={{ fontFamily: mono, fontSize: 14, color: "rgba(242,237,228,0.55)" }}>-${Math.round(feeMonthly).toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
                <div style={{ fontFamily: sans, fontSize: 13, color: INK }}>Your take-home</div>
                <div style={{ fontFamily: serif, fontSize: 58, color: INK, letterSpacing: "-0.04em", lineHeight: 1 }}>${monthly.toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
                <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.45)" }}>Annualized</div>
                <div style={{ fontFamily: mono, fontSize: 14, color: TEAL }}>${yearly.toLocaleString()}/yr</div>
              </div>
            </div>
            <div style={{ marginTop: 28, fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.4)", lineHeight: 1.5 }}>
              Estimate assumes 4 sessions per client per month, less Shape's small platform fee. Actual earnings vary by specialty, location, and hours worked.
            </div>
          </div>
        </div>
      </CoReveal>
    </section>
  );
}

// ---------- Tools ----------
function TrainerTools() {
  const tools = [
    { t: "Program builder", b: "Sets, reps, RPE, tempo, supersets. Autoregulation baked in. Clone any block to a new client in one click." },
    { t: "Client roster", b: "One view. Streaks, check-ins, flagged clients, weekly adherence. Sort by whatever you care about today." },
    { t: "Form check videos", b: "Clients upload. You annotate. Threads stay tied to the lift. Better than voice memos, faster than email." },
    { t: "Scheduling", b: "Two-way sync with Google, Apple, Outlook. Clients book inside Shape. Auto-reminders, reschedule rules, no-show handling." },
    { t: "Messaging", b: "Typing indicators, read receipts, voice notes. Quick replies for the things you type all day." },
    { t: "Payouts", b: "Weekly direct deposit, or instant for 1%. Clean monthly statements. Tax docs when January comes." },
  ];
  return (
    <section style={{ padding: "140px 72px" }}>
      <CoReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>The toolkit</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 82px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 72px", lineHeight: 0.98, color: INK, maxWidth: 1000 }}>Everything you need. <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>Nothing you don't.</em></h2>
          <div className="co-tools" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid rgba(242,237,228,0.1)", borderLeft: "1px solid rgba(242,237,228,0.1)" }}>
            {tools.map((t, i) => (
              <div key={i} style={{ padding: "40px 36px", borderRight: "1px solid rgba(242,237,228,0.1)", borderBottom: "1px solid rgba(242,237,228,0.1)", background: "rgba(11,14,12,0.6)" }}>
                <h3 style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 14px", color: INK }}>{t.t}</h3>
                <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.62)", lineHeight: 1.55, margin: 0 }}>{t.b}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 48, textAlign: "center" }}>
            <a href="TrainerDashboard.html" style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.12em", textTransform: "uppercase", color: TEAL, borderBottom: "1px solid rgba(10,197,168,0.3)", paddingBottom: 3 }}>See the full dashboard →</a>
          </div>
        </div>
      </CoReveal>
    </section>
  );
}

// ---------- Featured trainers ----------
function TrainerFeatured() {
  const trainers = [
    { name: "Maya Okafor", loc: "Brooklyn, NY", cred: "NASM-CPT · 9 yrs", spec: "Strength · Hypertrophy · Women 30+", quote: "Shape gave me tools that actually speak my language. Block programming, RPE, autoregulation — I stopped hacking spreadsheets.", clients: "34 active" },
    { name: "Diego Morales", loc: "Austin, TX", cred: "CSCS · 7 yrs", spec: "Powerlifting · Conjugate · Masters lifters", quote: "I used to spend 10 hours a week on admin. Now I coach. The scheduling and billing alone paid for itself in the first month.", clients: "22 active" },
    { name: "Sana Bhatt", loc: "Remote", cred: "NSCA-CPT · 5 yrs", spec: "At-home · Postpartum · Kettlebell", quote: "My remote practice went from 6 to 28 clients in a year. The marketplace sends me people I actually want to coach.", clients: "28 active" },
  ];
  return (
    <section style={{ padding: "140px 72px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Trainers on Shape</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 82px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 72px", lineHeight: 0.98 }}>Good company. <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>Great coaches.</em></h2>
        <div className="co-3" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
          {trainers.map((t, i) => (
            <div key={i} style={{ background: "rgba(26,22,18,0.04)", border: "1px solid rgba(26,22,18,0.1)", borderRadius: 6, padding: 32 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                <Ph label="" ratio="1/1" tone="light" style={{ width: 56, height: 56, borderRadius: 999, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{t.name}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(26,22,18,0.55)", marginTop: 4 }}>{t.loc} · {t.cred}</div>
                </div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>{t.spec}</div>
              <p style={{ fontFamily: serif, fontSize: 18, lineHeight: 1.5, color: "rgba(26,22,18,0.85)", margin: "0 0 24px", fontStyle: "italic" }}>"{t.quote}"</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, borderTop: "1px solid rgba(26,22,18,0.08)" }}>
                <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(26,22,18,0.55)" }}>{t.clients}</div>
                <a href={"TrainerPublic.html?coach=" + t.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")} style={{ fontFamily: sans, fontSize: 12.5, color: TEAL }}>View profile →</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- FAQ ----------
function TrainerFAQ() {
  const faqs = [
    { q: "What credentials do I need?", a: "An accredited personal training certification (NASM, ACE, NSCA, ACSM, NCSF, or similar), plus proof of current CPR/AED. Specialty certs (CSCS, RKC, FMS) help but aren't required." },
    { q: "What does Shape cost trainers?", a: "You keep the vast majority of everything your clients pay you. No monthly dues, no listing fees — Shape only takes a small platform fee when you get paid. Standard card processing is separate." },
    { q: "Can I bring my existing clients?", a: "Yes. Most trainers migrate their book within the first month. We'll help with invitations, transfer flows, and pricing continuity." },
    { q: "How fast do payouts land?", a: "Weekly, direct to your bank — usually Monday. Need it faster? Instant payouts for 1% are available any day." },
    { q: "Am I locked in?", a: "No exclusivity. Coach on Shape, on your own site, wherever — it's your business. Leave anytime, take your clients with you." },
    { q: "What if I only want to sell programs, not sessions?", a: "That works. Publish programs as one-time purchases or subscriptions. Many trainers earn 30–50% of revenue from programs alone." },
  ];
  const [open, setOpen] = React.useState(0);
  return (
    <section style={{ padding: "140px 72px" }}>
      <CoReveal>
        <div style={{ maxWidth: 1100, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Questions</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 82px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 64px", lineHeight: 0.98, color: INK }}>Everything <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>trainers ask.</em></h2>
          <div style={{ borderTop: "1px solid rgba(242,237,228,0.1)" }}>
            {faqs.map((f, i) => (
              <div key={i} style={{ borderBottom: "1px solid rgba(242,237,228,0.1)" }}>
                <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: "100%", padding: "28px 0", background: "transparent", border: 0, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}>
                  <span style={{ fontFamily: serif, fontSize: 25, fontWeight: 400, letterSpacing: "-0.015em", color: INK }}>{f.q}</span>
                  <span style={{ fontFamily: mono, fontSize: 20, color: TEAL, marginLeft: 24, transform: open === i ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
                </button>
                {open === i && (
                  <div style={{ padding: "0 0 28px", fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.7)", lineHeight: 1.65, maxWidth: 760 }}>{f.a}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </CoReveal>
    </section>
  );
}

// ---------- Final CTA ----------
function TrainerCTA() {
  return (
    <section style={{ padding: "140px 72px", background: INK, color: PAPER, position: "relative", overflow: "hidden" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 28 }}>Ready?</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(40px, 5.2vw, 84px)", letterSpacing: "-0.04em", fontWeight: 300, margin: "0 0 40px", lineHeight: 0.95 }}>
          Apply in <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>10 minutes.</em>
        </h2>
        <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(26,22,18,0.7)", lineHeight: 1.55, margin: "0 auto 48px", maxWidth: 560 }}>
          Free to join. No lock-in. We review every application personally — you'll hear back within 2–3 days.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="SignupTrainer.html" style={{ padding: "18px 34px", borderRadius: 2, background: TEAL, color: PAPER, fontFamily: sans, fontSize: 15, fontWeight: 600, letterSpacing: "0.01em" }}>Start your application →</a>
        </div>
      </div>
    </section>
  );
}

// ---------- Page ----------
function TrainerOverviewPage() {
  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Training%203.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none", opacity: 0.9 }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 6%, rgba(26,24,19,0.28) 0%, rgba(11,14,12,0.52) 55%, rgba(11,14,12,0.74) 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Trainer Overview" />
        <TrainerHero />
        <TrainerWhy />
        <TrainerHow />
        <TrainerEarnings />
        <TrainerTools />
        <TrainerFAQ />
        <TrainerCTA />
        <Footer />
      </div>
      <style>{`
        @media (max-width: 980px) {
          .co-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .co-3 { grid-template-columns: 1fr !important; }
          .co-steps { grid-template-columns: 1fr 1fr !important; }
          .co-tools { grid-template-columns: 1fr 1fr !important; }
          .co-earn { grid-template-columns: 1fr !important; gap: 48px !important; }
        }
        @media (max-width: 620px) {
          .co-stats, .co-steps, .co-tools { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<TrainerOverviewPage />);
