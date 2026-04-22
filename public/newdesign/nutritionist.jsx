// Nutritionist overview — marketing page for prospective nutritionists/dietitians.

// ---------- Hero ----------
function NutHero() {
  return (
    <section style={{ padding: "120px 40px 100px", position: "relative", overflow: "hidden", minHeight: "88vh", display: "flex", alignItems: "center" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", width: "100%" }}>
        <div style={{ maxWidth: 900 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL_BRIGHT, marginBottom: 28 }}>For nutritionists</div>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(56px, 8vw, 112px)", letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.95, color: INK }}>
            Shape how<br/>
            people <em style={{ fontStyle: "italic", color: TEAL }}>eat.</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 19, color: "rgba(242,237,228,0.78)", margin: "36px 0 0", maxWidth: 640, lineHeight: 1.5 }}>
            Members are already tracking meals, logging macros, and looking for guidance. Shape puts you where they are — ready to listen, ready to commit, and ready to let you shape their nutrition.
          </p>
          <div style={{ display: "flex", gap: 14, marginTop: 44, flexWrap: "wrap" }}>
            <a href="SignupNutritionist.html" style={{ padding: "16px 28px", borderRadius: 6, background: TEAL, color: PAPER, border: 0, fontFamily: sans, fontSize: 14.5, fontWeight: 500, cursor: "pointer" }}>Apply now — it's free</a>
            <a href="Marketplace.html?role=Nutritionist" style={{ padding: "16px 28px", borderRadius: 6, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", fontFamily: sans, fontSize: 14.5, fontWeight: 500 }}>See nutritionists on Shape</a>
          </div>
          <div style={{ marginTop: 40, display: "flex", gap: 28, fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.55)", flexWrap: "wrap" }}>
            <span>✓ RD &amp; CNS licensure protected</span>
            <span>✓ Weekly payouts</span>
            <span>✓ 10-minute application</span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Value strip ----------
function NutStats() {
  const items = [
    { k: "15%", v: "Platform fee on what clients pay you. No monthly dues, no listing fees." },
    { k: "Weekly", v: "Payouts direct to your bank, or instant any day." },
    { k: "Verified", v: "Every RD, RDN, CNS, and license checked on intake." },
    { k: "Yours", v: "Your practice, your pricing, your clients. No lock-in." },
  ];
  return (
    <section style={{ padding: "80px 40px", borderTop: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "repeat(4, 1fr)" }}>
        {items.map((it, i) => (
          <div key={i} style={{ padding: "12px 32px", borderLeft: i ? "1px solid rgba(242,237,228,0.1)" : "none" }}>
            <div style={{ fontFamily: serif, fontSize: it.k.length > 6 ? 42 : 56, letterSpacing: "-0.035em", fontWeight: 400, color: INK, lineHeight: 1 }}>{it.k}</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)", marginTop: 14, lineHeight: 1.5, maxWidth: 220 }}>{it.v}</div>
          </div>
        ))}
      </div>
    </section>
  );
}

// ---------- Why Shape ----------
function NutWhy() {
  const pillars = [
    { n: "01", title: "Keep your license clean", body: "HIPAA-aligned client records. Scope-of-practice flags. RD/CSSD/CNS credentials verified on intake. Built with licensed dietitians, not by moving fast and breaking rules." },
    { n: "02", title: "Plans clients actually follow", body: "Meal plan builder with macro targets and food logging. Swap rules clients can use. Import from Cronometer, MyFitnessPal, or your own templates." },
    { n: "03", title: "Demand that fits your practice", body: "Members search by specialty — endurance fueling, gut health, plant-forward, clinical. You set scope, Shape sends you the right people." },
  ];
  return (
    <section style={{ padding: "140px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Why Shape</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 80px", lineHeight: 1, color: INK, maxWidth: 1100 }}>
          Built for the <em style={{ fontStyle: "italic", color: TEAL }}>nuance of nutrition.</em>
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48 }}>
          {pillars.map((p, i) => (
            <div key={i}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEAL, letterSpacing: "0.14em", marginBottom: 24 }}>{p.n}</div>
              <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 16px", lineHeight: 1.1, color: INK }}>{p.title}</h3>
              <p style={{ fontFamily: sans, fontSize: 15.5, color: "rgba(242,237,228,0.7)", lineHeight: 1.6, margin: 0 }}>{p.body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- How it works ----------
function NutHow() {
  const steps = [
    { n: "01", t: "Apply with credentials", b: "RD, RDN, CNS, CSSD, or licensed dietitian. Upload your CDR number or state license. We verify every one.", time: "10 min" },
    { n: "02", t: "Review in 2–3 days", b: "Our clinical team reads every application. Licensed dietitians review yours. Approvals come with onboarding notes.", time: "2–3 days" },
    { n: "03", t: "Set up your practice", b: "Build intake forms, set session pricing, connect your calendar, upload plan templates. Import from existing clients.", time: "1–2 hrs" },
    { n: "04", t: "Start getting matched", b: "Members searching by specialty find your profile. First consults usually book within the first two weeks.", time: "Ongoing" },
  ];
  return (
    <section style={{ padding: "140px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "end", marginBottom: 80, gap: 40, flexWrap: "wrap" }}>
          <div style={{ maxWidth: 680 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>How it works</div>
            <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 1 }}>From application to first consult in <em style={{ fontStyle: "italic", color: TEAL }}>under two weeks.</em></h2>
          </div>
          <a href="SignupNutritionist.html" style={{ padding: "14px 24px", borderRadius: 6, background: PAPER, color: INK, fontFamily: sans, fontSize: 13, fontWeight: 500, whiteSpace: "nowrap" }}>Start application →</a>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", borderTop: "1px solid rgba(26,22,18,0.12)" }}>
          {steps.map((s, i) => (
            <div key={i} style={{ padding: "40px 32px 40px 0", borderLeft: i ? "1px solid rgba(26,22,18,0.12)" : "none", paddingLeft: i ? 32 : 0 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 28 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: TEAL, letterSpacing: "0.14em" }}>{s.n}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(26,22,18,0.45)", letterSpacing: "0.08em" }}>{s.time}</div>
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
function NutEarnings() {
  const [clients, setClients] = React.useState(18);
  const [price, setPrice] = React.useState(140);
  const PLATFORM_FEE_RATE = 0.15;
  const grossMonthly = clients * price * 2;
  const feeMonthly = grossMonthly * PLATFORM_FEE_RATE;
  const monthly = grossMonthly - feeMonthly;
  const yearly = monthly * 12;
  return (
    <section style={{ padding: "140px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1.1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Earnings</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5vw, 76px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 28px", lineHeight: 0.98, color: INK }}>Your rate. <em style={{ fontStyle: "italic", color: TEAL }}>Keep 85% of it.</em></h2>
          <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", lineHeight: 1.6, margin: "0 0 28px", maxWidth: 500 }}>
            Shape takes a <strong style={{ color: INK }}>15% platform fee</strong> on everything clients pay you. No monthly dues, no setup fees, no per-booking cuts — you only pay when you earn. Cancel any time.
          </p>
          <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 10, padding: "22px 24px", marginBottom: 28, maxWidth: 500 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 10 }}>What the 15% covers</div>
            <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.75)", lineHeight: 1.55 }}>
              Client acquisition through the Shape marketplace, in-app messaging and video, meal plan hosting, scheduling, and liability coverage. Standard card processing is separate.
            </div>
          </div>
          <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 14 }}>
            {["No monthly fee — you only pay Shape when you earn", "Link your existing Stripe account, or set one up in 5 minutes", "Weekly payouts direct to your bank"].map(t => (
              <li key={t} style={{ fontFamily: sans, fontSize: 14.5, color: "rgba(242,237,228,0.78)", display: "flex", gap: 12, alignItems: "baseline" }}>
                <span style={{ color: TEAL }}>→</span>{t}
              </li>
            ))}
          </ul>
        </div>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, padding: 44 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL, marginBottom: 32 }}>Estimate your take-home</div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <label style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)" }}>Active clients</label>
              <div style={{ fontFamily: serif, fontSize: 28, color: INK, letterSpacing: "-0.02em" }}>{clients}</div>
            </div>
            <input type="range" min="5" max="40" value={clients} onChange={e => setClients(+e.target.value)} style={{ width: "100%", accentColor: TEAL }} />
          </div>
          <div style={{ marginBottom: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
              <label style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.7)" }}>Consult / plan price</label>
              <div style={{ fontFamily: serif, fontSize: 28, color: INK, letterSpacing: "-0.02em" }}>${price}</div>
            </div>
            <input type="range" min="60" max="400" step="10" value={price} onChange={e => setPrice(+e.target.value)} style={{ width: "100%", accentColor: TEAL }} />
          </div>
          <div style={{ padding: "22px 0 0", borderTop: "1px solid rgba(242,237,228,0.1)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>Gross monthly</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "rgba(242,237,228,0.75)" }}>${grossMonthly.toLocaleString()}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 18, borderBottom: "1px dashed rgba(242,237,228,0.12)" }}>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.6)" }}>Platform fee (15%)</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: "rgba(242,237,228,0.55)" }}>-${Math.round(feeMonthly).toLocaleString()}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 18 }}>
              <div style={{ fontFamily: sans, fontSize: 13, color: INK }}>Your take-home</div>
              <div style={{ fontFamily: serif, fontSize: 56, color: INK, letterSpacing: "-0.035em", lineHeight: 1 }}>${monthly.toLocaleString()}</div>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 10 }}>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.45)" }}>Annualized</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, color: TEAL }}>${yearly.toLocaleString()}/yr</div>
            </div>
          </div>
          <div style={{ marginTop: 28, fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.4)", lineHeight: 1.5 }}>
            Estimate assumes 2 billable touchpoints per client per month, less Shape's 15% platform fee. Actual earnings vary by specialty and practice model.
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------- Tools ----------
function NutTools() {
  const tools = [
    { t: "Meal plan builder", b: "Macro targets, swap rules, grocery lists that auto-generate. Save any plan as a template, reuse across clients." },
    { t: "Food log review", b: "Client logs land in one thread. Flag outliers, leave timestamped notes. Logs integrate with Cronometer, MFP, Apple Health." },
    { t: "Client roster", b: "Adherence, weight trend, flagged clients, upcoming consults — all one screen. Filter by specialty or protocol." },
    { t: "Scheduling", b: "Two-way sync with Google, Apple, Outlook. Clients book 20-min check-ins or 60-min consults. Auto-reminders, intake forms." },
    { t: "Messaging", b: "Secure client chat. Voice notes, photos of meals and labs, saved replies for the questions you answer weekly." },
    { t: "Payouts & docs", b: "Weekly direct deposit, or instant for 1%. Clean monthly statements. Tax docs when January comes." },
  ];
  return (
    <section style={{ padding: "140px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>The toolkit</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 72px", lineHeight: 1, color: INK, maxWidth: 1000 }}>Built for <em style={{ fontStyle: "italic", color: TEAL }}>real practice.</em></h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", borderTop: "1px solid rgba(242,237,228,0.1)", borderLeft: "1px solid rgba(242,237,228,0.1)" }}>
          {tools.map((t, i) => (
            <div key={i} style={{ padding: "40px 36px", borderRight: "1px solid rgba(242,237,228,0.1)", borderBottom: "1px solid rgba(242,237,228,0.1)" }}>
              <h3 style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.02em", fontWeight: 400, margin: "0 0 14px", color: INK }}>{t.t}</h3>
              <p style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.65)", lineHeight: 1.55, margin: 0 }}>{t.b}</p>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 48, textAlign: "center" }}>
          <a href="NutritionistDashboard.html" style={{ fontFamily: sans, fontSize: 14, color: TEAL, borderBottom: "1px solid rgba(30,192,168,0.3)", paddingBottom: 3 }}>See the full dashboard →</a>
        </div>
      </div>
    </section>
  );
}

// ---------- Featured ----------
function NutFeatured() {
  const pros = [
    { name: "Rae Lindqvist", loc: "Lisbon", cred: "RD, CSSD · 11 yrs", spec: "Endurance · Plant-based · Race fueling", quote: "I stopped hating Mondays. Admin used to eat my morning — now I spend it writing plans and reading logs.", clients: "28 active" },
    { name: "Noor Haddad", loc: "Toronto", cred: "RD · 8 yrs", spec: "Gut health · IBS · Low-FODMAP", quote: "My clients finally log food because the interface isn't hostile. Adherence is up 40% since I switched.", clients: "24 active" },
    { name: "Chen Wu", loc: "Remote", cred: "CNS · 6 yrs", spec: "Body recomp · Hormonal · Perimenopause", quote: "Shape brings me the right clients. Specialty search actually works — I barely need to market anymore.", clients: "31 active" },
  ];
  return (
    <section style={{ padding: "140px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Nutritionists on Shape</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 72px", lineHeight: 1 }}>In good <em style={{ fontStyle: "italic", color: TEAL }}>company.</em></h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 32 }}>
          {pros.map((p, i) => (
            <div key={i} style={{ background: "rgba(26,22,18,0.04)", border: "1px solid rgba(26,22,18,0.1)", borderRadius: 12, padding: 32 }}>
              <div style={{ display: "flex", gap: 16, alignItems: "center", marginBottom: 24 }}>
                <Ph label="" ratio="1/1" tone="light" style={{ width: 56, height: 56, borderRadius: 999, flexShrink: 0 }} />
                <div>
                  <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, letterSpacing: "-0.01em", lineHeight: 1.1 }}>{p.name}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(26,22,18,0.55)", marginTop: 4 }}>{p.loc} · {p.cred}</div>
                </div>
              </div>
              <div style={{ fontFamily: sans, fontSize: 11.5, letterSpacing: "0.1em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>{p.spec}</div>
              <p style={{ fontFamily: serif, fontSize: 18, lineHeight: 1.5, color: "rgba(26,22,18,0.85)", margin: "0 0 24px", fontStyle: "italic" }}>"{p.quote}"</p>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", paddingTop: 18, borderTop: "1px solid rgba(26,22,18,0.08)" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(26,22,18,0.55)" }}>{p.clients}</div>
                <a href="NutritionistPublic.html" style={{ fontFamily: sans, fontSize: 12.5, color: TEAL }}>View profile →</a>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- FAQ ----------
function NutFAQ() {
  const faqs = [
    { q: "What credentials do I need?", a: "RD, RDN, CNS, CDN, or state-licensed dietitian. CSSD (sports) or IFMCP (functional) help but aren't required. Non-licensed health/nutrition coaches accepted under a distinct scope-of-practice tier." },
    { q: "What does Shape cost?", a: "No monthly dues, no listing fees. Shape takes a 15% platform fee on what your clients pay you — so you only pay when you earn. Standard card processing is separate." },
    { q: "How does Shape handle HIPAA and scope of practice?", a: "Client records are encrypted at rest and in transit. Scope-of-practice tiers are enforced by credential — non-RDs can't access medical nutrition therapy flows. BAAs available for practices that need them." },
    { q: "Can I bring my existing clients?", a: "Yes. Most nutritionists migrate within the first month. We help with transition emails, pricing continuity, and importing plan templates." },
    { q: "Payouts?", a: "Weekly, direct to your bank. Instant payouts available for 1% any day. 1099s auto-generated every January." },
    { q: "Plans only, no consults — is that a thing?", a: "Yes. Publish meal plans as one-time or recurring products. Many nutritionists earn 30–40% of revenue from plan sales alone." },
  ];
  const [open, setOpen] = React.useState(0);
  return (
    <section style={{ padding: "140px 40px" }}>
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>Questions</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 64px", lineHeight: 1, color: INK }}>Everything <em style={{ fontStyle: "italic", color: TEAL }}>nutritionists ask.</em></h2>
        <div style={{ borderTop: "1px solid rgba(242,237,228,0.1)" }}>
          {faqs.map((f, i) => (
            <div key={i} style={{ borderBottom: "1px solid rgba(242,237,228,0.1)" }}>
              <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: "100%", padding: "28px 0", background: "transparent", border: 0, display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left" }}>
                <span style={{ fontFamily: serif, fontSize: 24, fontWeight: 400, letterSpacing: "-0.015em", color: INK }}>{f.q}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, color: TEAL, marginLeft: 24, transform: open === i ? "rotate(45deg)" : "none", transition: "transform 0.2s" }}>+</span>
              </button>
              {open === i && (
                <div style={{ padding: "0 0 28px", fontFamily: sans, fontSize: 15, color: "rgba(242,237,228,0.7)", lineHeight: 1.65, maxWidth: 760 }}>{f.a}</div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Final CTA ----------
function NutCTA() {
  return (
    <section style={{ padding: "140px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1100, margin: "0 auto", textAlign: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.22em", textTransform: "uppercase", color: TEAL, marginBottom: 28 }}>Ready?</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(56px, 8vw, 128px)", letterSpacing: "-0.04em", fontWeight: 400, margin: "0 0 40px", lineHeight: 0.95 }}>
          Apply in <em style={{ fontStyle: "italic", color: TEAL }}>10 minutes.</em>
        </h2>
        <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(26,22,18,0.7)", lineHeight: 1.55, margin: "0 auto 48px", maxWidth: 560 }}>
          Free to join. No lock-in. Licensed dietitians review every application within 2–3 days.
        </p>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="SignupNutritionist.html" style={{ padding: "18px 32px", borderRadius: 6, background: TEAL, color: PAPER, fontFamily: sans, fontSize: 15, fontWeight: 500 }}>Start your application →</a>
          <a href="/newdesign/Pricing.html" style={{ padding: "18px 32px", borderRadius: 6, background: "transparent", color: PAPER, border: "1px solid rgba(26,22,18,0.2)", fontFamily: sans, fontSize: 15, fontWeight: 500 }}>See pricing details</a>
        </div>
      </div>
    </section>
  );
}

// ---------- Page ----------
function NutritionistOverviewPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/Nutrition%202.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(26,22,18,0.6)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Nutritionist Overview" />
        <NutHero />
        <NutStats />
        <NutWhy />
        <NutHow />
        <NutEarnings />
        <NutTools />
        <NutFAQ />
        <NutCTA />
        <Footer />
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<NutritionistOverviewPage />);
