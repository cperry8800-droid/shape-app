// Client marketing overview — parallel to Coach.html / Nutritionist.html
const { useState: useSClientOv } = React;

// Match home page palette (#06080a near-black-green with light teal text)
const DARK = "#06080a";
const LIGHT = "#e9efed";

// ---------- Hero ----------
function ClientOvHero() {
  return (
    <section style={{ padding: "40px 72px 100px", position: "relative", overflow: "hidden", minHeight: "88vh", display: "flex", alignItems: "center", color: LIGHT }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", width: "100%", position: "relative", display: "grid", gridTemplateColumns: "1.25fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 40 }}>For clients</div>
          <h1 style={{ fontFamily: serif, fontSize: "clamp(60px, 7.6vw, 128px)", letterSpacing: "-0.04em", fontWeight: 400, lineHeight: 0.92, margin: 0, color: LIGHT }}>
            Shape your<br />
            <em style={{ fontStyle: "italic", color: "transparent", WebkitTextStroke: `1.4px ${LIGHT}` }}>lifestyle.</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 20, lineHeight: 1.5, color: "rgba(233,239,237,0.72)", margin: "40px 0 48px", maxWidth: 540 }}>
            Train smarter, eat better, and track every step of your progress. Shape puts certified coaches and tools in one place — so you can focus on becoming the best version of yourself.
          </p>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
            <a href="Marketplace.html" style={{ padding: "16px 28px", borderRadius: 6, background: TEAL, color: LIGHT, fontFamily: sans, fontSize: 14, fontWeight: 500, letterSpacing: "0.02em" }}>Find your coach →</a>
            <a href="/newdesign/Pricing.html" style={{ padding: "16px 28px", borderRadius: 6, background: "transparent", color: LIGHT, border: "1px solid rgba(233,239,237,0.25)", fontFamily: sans, fontSize: 14, fontWeight: 500 }}>See pricing details</a>
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <div style={{ background: "rgba(6,8,10,0.7)", border: "1px solid rgba(233,239,237,0.12)", borderRadius: 14, padding: 28, backdropFilter: "blur(12px)" }}>
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
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.93)", letterSpacing: "0.05em" }}>{it.when}</div>
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
          <div style={{ position: "absolute", bottom: -24, left: -24, background: DARK, color: LIGHT, padding: "14px 18px", borderRadius: 10, fontFamily: sans, fontSize: 12, lineHeight: 1.4, boxShadow: "0 20px 72px rgba(0,0,0,0.25)", maxWidth: 220 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(6,8,10,0.82)", marginBottom: 4 }}>From Maya</div>
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
    <section style={{ padding: "80px 72px", background: "rgba(6,8,10,0.8)", borderTop: "1px solid rgba(233,239,237,0.08)", borderBottom: "1px solid rgba(233,239,237,0.08)" }}>
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
    <section style={{ padding: "140px 72px", background: "rgba(233,239,237,0.93)", color: DARK }}>
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
              <p style={{ fontFamily: sans, fontSize: 14.5, lineHeight: 1.65, color: "rgba(6,8,10,0.8)", margin: 0 }}>{p.body}</p>
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
    { n: "04", t: "Adjust as you go", b: "Your coach sets check-in times that fit your schedule — whatever cadence works for the two of you. They review progress and re-write. Swap coaches anytime, add a nutritionist, scale up or down — your call.", time: "Ongoing" },
  ];
  return (
    <section style={{ padding: "140px 72px", background: "rgba(6,8,10,0.82)", color: LIGHT }}>
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
      tag: "Nutrition",
      title: "Just a nutritionist",
      body: "One specialist, dialed in. Custom meal plans, macro targets, and check-ins — your goals, your calendar, your review cycle.",
      price: "from $280/mo",
      cta: ["Browse nutritionists", "Marketplace.html"],
      featured: true,
    },
    {
      tag: "Specialists",
      title: "Build a full team",
      body: "Add PT, recovery, sport psych, massage. One roster, one calendar, one invoice. For serious training seasons or real rehab.",
      price: "custom",
      cta: ["Browse specialists", "Marketplace.html"],
      featured: false,
    },
  ];
  return (
    <section style={{ padding: "140px 72px", background: "rgba(233,239,237,0.93)", color: DARK }}>
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
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: p.featured ? TEAL : "rgba(6,8,10,0.82)", marginBottom: 16 }}>{p.tag}</div>
              <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 400, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: 18 }}>{p.title}</div>
              <p style={{ fontFamily: sans, fontSize: 14, lineHeight: 1.6, color: p.featured ? "rgba(233,239,237,0.72)" : "rgba(6,8,10,0.8)", margin: "0 0 24px", flex: 1 }}>{p.body}</p>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: p.featured ? TEAL : "rgba(6,8,10,0.8)", marginBottom: 20, letterSpacing: "0.04em" }}>{p.price}</div>
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
    { t: "Real programming", b: "Your coach writes it. Sets, reps, progressions, substitutions — plus meal plans built around your goals. Updated every cycle based on how you're actually moving and eating." },
    { t: "Shape Radio", b: "Curated stations for lifting, running, recovery, and focus. Auto-matches the tempo of your session — your warm-up, your working sets, your cool-down." },
    { t: "Habits", b: "Build the good ones, break the bad. Track sleep, steps, mood, hydration, screen time, anything — your streaks roll up into your Shape Score." },
    { t: "Grocery list", b: "Your nutritionist's meal plan turns itself into a shoppable list, organized by aisle, with a live running cost. One tap sends the whole thing to Instacart." },
    { t: "Shape calendar", b: "Your own training calendar inside Shape — workouts, meals, check-ins, and calls all in one view. Your coach sees what you see, and updates land in real time." },
    { t: "Messaging", b: "DM your coach, your nutritionist, your training friends — or jump into community threads and event chats. Form-check videos, recipes, race-day pep talks, group challenges. Everyone you train with, in one inbox." },
    { t: "Shape Score", b: "Every kept session, logged meal, and hit habit earns points. Climb tiers, unlock rewards — session credits, plan refreshes, Shape merch. Showing up pays you back." },
    { t: "Community & events", b: "Local runs, lift nights, cohorts, and challenges. Train alone; stay accountable with people in your city." },
  ];
  return (
    <section style={{ padding: "140px 72px", background: "rgba(6,8,10,0.82)", color: LIGHT }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 20 }}>What you get</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(44px, 5.5vw, 80px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 72px", lineHeight: 1 }}>Everything you actually <em style={{ fontStyle: "italic", color: TEAL }}>use.</em></h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 1, background: "rgba(233,239,237,0.08)", border: "1px solid rgba(233,239,237,0.08)" }}>
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
function ClientOvSnapshots() {
  const habits = [
    { kind: "do",   name: "Sleep 8 hrs",          days: "7/7", hit: true,  note: "streak · 12d" },
    { kind: "do",   name: "10,000 steps",         days: "6/7", hit: true,  note: "+2 from last wk" },
    { kind: "do",   name: "Take vitamins",        days: "5/7", hit: true,  note: "" },
    { kind: "dont", name: "No phone after 9pm",   days: "4/7", hit: false, note: "" },
    { kind: "do",   name: "Read 20 min",          days: "6/7", hit: true,  note: "" },
    { kind: "dont", name: "No alcohol weekdays",  days: "5/5", hit: true,  note: "streak · 8d" },
    { kind: "dont", name: "Negative self-talk",   days: "4/7", hit: false, note: "" },
    { kind: "do",   name: "Stretch / mobility",   days: "4/7", hit: false, note: "" },
  ];
  const grocery = [
    { aisle: "Produce",  items: ["Avocado × 4", "Baby spinach", "Blueberries", "Sweet potato × 3"] },
    { aisle: "Protein",  items: ["Chicken breast · 2 lb", "Wild salmon · 1 lb", "Eggs · 18 ct"] },
    { aisle: "Pantry",   items: ["Rolled oats", "Almond butter", "Brown rice · 2 lb"] },
    { aisle: "Dairy",    items: ["Greek yogurt · 32 oz", "Feta"] },
  ];
  return (
    <section style={{ padding: "120px 72px", background: "rgba(6,8,10,0.8)", color: LIGHT, borderTop: "1px solid rgba(233,239,237,0.08)" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>Inside the app</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(38px, 4.8vw, 68px)", letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 60px", lineHeight: 1 }}>The <em style={{ fontStyle: "italic", color: TEAL }}>habits</em> and the <em style={{ fontStyle: "italic", color: TEAL }}>list</em>.</h2>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 28, alignItems: "stretch" }}>
          {/* Habits snapshot */}
          <div style={{ background: "rgba(6,8,10,0.7)", border: "1px solid rgba(233,239,237,0.12)", borderRadius: 14, padding: 28, backdropFilter: "blur(12px)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Habits</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.5)" }}>WEEK 04 · APR 13 — APR 19</div>
            </div>
            <div style={{ display: "grid", gap: 8 }}>
              {habits.map((h, i) => {
                const isDont = h.kind === "dont";
                const accent = isDont ? "#d2693f" : TEAL;
                return (
                  <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 44px 1fr 56px auto", gap: 12, alignItems: "center", padding: "12px 14px", background: "rgba(233,239,237,0.03)", borderRadius: 8, border: "1px solid rgba(233,239,237,0.06)" }}>
                    <div style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${h.hit ? accent : "rgba(233,239,237,0.25)"}`, background: h.hit ? accent : "transparent", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      {h.hit && <span style={{ color: DARK, fontSize: 9, lineHeight: 1, fontWeight: 600 }}>{isDont ? "×" : "✓"}</span>}
                    </div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: accent, textTransform: "uppercase" }}>{isDont ? "Don't" : "Do"}</div>
                    <div style={{ fontFamily: serif, fontSize: 15, color: LIGHT, letterSpacing: "-0.005em" }}>{h.name}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: h.hit ? accent : "rgba(233,239,237,0.55)", letterSpacing: "0.05em", textAlign: "right" }}>{h.days}</div>
                    <div style={{ fontFamily: sans, fontSize: 11, color: "rgba(233,239,237,0.5)" }}>{h.note}</div>
                  </div>
                );
              })}
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(233,239,237,0.08)", display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.5)", letterSpacing: "0.08em" }}>
              <span>5 / 8 above target · 3 don'ts</span>
              <span style={{ color: TEAL }}>Shape Score +12 ●</span>
            </div>
          </div>

          {/* Grocery list snapshot — tied to the meal plan above. */}
          <div style={{ background: "rgba(6,8,10,0.7)", border: "1px solid rgba(233,239,237,0.12)", borderRadius: 14, padding: 28, backdropFilter: "blur(12px)", display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Grocery list</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.5)" }}>FROM RAE'S PLAN · WEEK 04</div>
            </div>
            <div style={{ display: "grid", gap: 10, flex: 1 }}>
              {grocery.map((g, i) => (
                <div key={i} style={{ background: "rgba(233,239,237,0.03)", border: "1px solid rgba(233,239,237,0.06)", borderRadius: 8, padding: "10px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL }}>{g.aisle}</div>
                    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "rgba(233,239,237,0.5)" }}>{g.items.length} items</div>
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", columnGap: 16, rowGap: 4 }}>
                    {g.items.map((it, j) => (
                      <div key={j} style={{ display: "flex", alignItems: "center", gap: 8, fontFamily: serif, fontSize: 14, color: LIGHT }}>
                        <span style={{ width: 11, height: 11, borderRadius: 3, border: "1px solid rgba(233,239,237,0.35)", display: "inline-block" }} />
                        {it}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 18, paddingTop: 14, borderTop: "1px solid rgba(233,239,237,0.08)", display: "flex", justifyContent: "space-between", alignItems: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(233,239,237,0.5)", letterSpacing: "0.08em", gap: 12, flexWrap: "wrap" }}>
              <span>12 items · ~$72</span>
              <span style={{ display: "inline-flex", gap: 18 }}>
                <span style={{ color: "rgba(233,239,237,0.78)" }}>☆ Save to library</span>
                <span style={{ color: TEAL }}>Send to Instacart →</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function ClientOvFAQ() {
  const faqs = [
    { q: "What does it cost?", a: "Shape is $5/month for clients and includes Shape Radio and full platform access. Coach rates are set by each coach, and you pay them through the platform on top of the $5 membership." },
    { q: "Can I try a coach before committing?", a: "Yes. Every listed trainer and nutritionist offers a free 20-minute intro call. Book up to three at once, decide after." },
    { q: "Can I have a trainer and a nutritionist?", a: "That's the most common setup. They see the same calendar and your goals. You message each separately, but they coordinate." },
    { q: "What if it's not working?", a: "Switch coaches whenever. You keep your history, logs, and calendar; your next coach picks up with full context. No fees, no drama." },
    { q: "Do I need a gym?", a: "Up to you and your coach. Filter the marketplace by 'at-home', 'gym-based', or 'hybrid'. Many trainers work with home-gym or bodyweight-only clients." },
    { q: "Is my data safe?", a: "Yes. End-to-end encrypted messages. You own your log data and can export everything anytime. Nothing sold, nothing shared." },
  ];
  const [open, setOpen] = useSClientOv(0);
  return (
    <section style={{ padding: "140px 72px", background: "rgba(233,239,237,0.93)", color: DARK }}>
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
              {open === i && <p style={{ fontFamily: sans, fontSize: 15, lineHeight: 1.65, color: "rgba(6,8,10,0.8)", margin: "0 0 32px", maxWidth: 760 }}>{f.a}</p>}
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
    <section style={{ padding: "140px 72px", background: "rgba(6,8,10,0.8)", color: LIGHT, position: "relative", overflow: "hidden" }}>
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(800px 500px at 50% 100%, rgba(10,197,168,0.14), transparent 70%)" }} />
      <div style={{ maxWidth: 1100, margin: "0 auto", position: "relative", textAlign: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 28 }}>Find your coach</div>
        <h2 style={{ fontFamily: serif, fontSize: "clamp(40px, 5.2vw, 84px)", letterSpacing: "-0.04em", fontWeight: 400, lineHeight: 0.95, margin: "0 0 48px" }}>
          You're ready.<br /><em style={{ fontStyle: "italic", color: TEAL }}>Pick someone real.</em>
        </h2>
        <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.6, color: "rgba(233,239,237,0.93)", margin: "0 auto 48px", maxWidth: 640 }}>
          Free to join. Free intro calls. The right coach is usually a 20-minute conversation away.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <a href="Marketplace.html" style={{ padding: "18px 32px", borderRadius: 6, background: TEAL, color: LIGHT, fontFamily: sans, fontSize: 14, fontWeight: 500 }}>Browse coaches →</a>
          <a href="/newdesign/Pricing.html" style={{ padding: "18px 32px", borderRadius: 6, background: "transparent", color: LIGHT, border: "1px solid rgba(233,239,237,0.3)", fontFamily: sans, fontSize: 14, fontWeight: 500 }}>See pricing details</a>
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
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, background: "rgba(6,8,10,0.15)", pointerEvents: "none" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Client Overview" />
        <ClientOvHero />
        <ClientOvWhy />
        <ClientOvHow />
        <ClientOvSnapshots />
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
