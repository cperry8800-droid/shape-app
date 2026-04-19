// My Team — the client's roster of coaches, messages, and upcoming sessions
const { useState: useSTeam } = React;

const TEAM = [
  {
    name: "Maya Okafor",
    role: "Trainer · Strength & Hypertrophy",
    cert: "NASM · PN1",
    with: "14 months",
    next: "Today · 17:30 · Upper push",
    msg: "Push to 60 lb on incline if bar speed stays crisp. Form on the last set was clean.",
    msgTime: "2h ago",
    sessions: 84,
    completion: 96,
    rating: 4.97,
    status: "primary",
    color: TEAL,
  },
  {
    name: "Rae Lindqvist",
    role: "Registered Dietitian",
    cert: "RD · RDN · CSSD",
    with: "11 months",
    next: "Sun · 10:00 · Weekly review",
    msg: "Protein's landed 3 days running — 168g avg. Let's talk carbs on training days this Sunday.",
    msgTime: "Yesterday",
    sessions: 38,
    completion: 100,
    rating: 4.92,
    status: "active",
    color: TEAL,
  },
  {
    name: "Julien Bertrand",
    role: "Physio · Mobility",
    cert: "DPT · CSCS",
    with: "3 months",
    next: "Apr 22 · 08:00 · Hip reset",
    msg: "Your hip internal rotation improved 12° since March. New mobility flow in your app.",
    msgTime: "3 days ago",
    sessions: 9,
    completion: 89,
    rating: 5.00,
    status: "active",
    color: TEAL,
  },
];

const UPCOMING = [
  { day: "TODAY", date: "APR 18", time: "17:30", who: "Maya Okafor", what: "Upper push · 5 exercises", kind: "remote", tag: "session" },
  { day: "THU", date: "APR 19", time: "19:30", who: "", what: "Log dinner · 168g protein", kind: "solo", tag: "habit" },
  { day: "SUN", date: "APR 22", time: "10:00", who: "Rae Lindqvist", what: "Weekly nutrition review", kind: "call", tag: "session" },
  { day: "MON", date: "APR 23", time: "08:00", who: "Julien Bertrand", what: "Hip reset · mobility flow", kind: "remote", tag: "session" },
  { day: "WED", date: "APR 25", time: "17:30", who: "Maya Okafor", what: "Lower pull + accessories", kind: "remote", tag: "session" },
];

const MESSAGES = [
  { from: "Maya", msg: "Form check on the incline press last session was clean. Push to 60 lb today if bar speed stays crisp.", time: "2h ago", unread: true },
  { from: "Rae", msg: "Great to see protein landing 3 days running. Let's look at carb timing Sunday.", time: "Yesterday", unread: true },
  { from: "Julien", msg: "New mobility flow uploaded — 10 min, add before your pulls.", time: "3d ago", unread: false },
  { from: "Maya", msg: "Booked you in for the mock meet on May 11. RSVP when you get a sec.", time: "4d ago", unread: false },
];

function TeamHero() {
  return (
    <section style={{ padding: "80px 40px 40px", position: "relative", overflow: "hidden" }}>
      <HeroBg />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Your team · Priya Shankar</div>
        <h1 style={{ fontFamily: serif, fontSize: 104, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.9 }}>
          Three people<br/>in <em style={{ fontStyle: "italic", color: TEAL }}>your corner</em>.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.55, color: "rgba(242,237,228,0.7)", margin: "24px 0 0", maxWidth: 640 }}>
          Every coach you've hired, in one place. Message them, see upcoming sessions, and track how the whole team is moving you forward.
        </p>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginTop: 56, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          {[["3", "Active coaches", "1 primary, 2 active"], ["131", "Sessions with team", "across 14 months"], ["94%", "Completion rate", "team average"], ["4.96", "Avg rating", "from you"]].map(([k, l, s], i) => (
            <div key={i} style={{ padding: "28px 24px", borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
              <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 500, color: INK, marginTop: 10 }}>{l}</div>
              <div style={{ fontFamily: sans, fontSize: 11.5, color: "rgba(242,237,228,0.5)", marginTop: 2 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamRoster() {
  return (
    <section style={{ padding: "40px 40px 60px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 32 }}>
          <h2 style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.03em", fontWeight: 400, margin: 0 }}>Your roster.</h2>
          <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", padding: "10px 18px", borderRadius: 6, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>+ Add a coach</button>
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          {TEAM.map((m, i) => (
            <article key={i} style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, padding: 32, display: "grid", gridTemplateColumns: "120px 1.5fr 1fr auto", gap: 32, alignItems: "center" }}>
              <Ph label="" ratio="1/1" tone="light" style={{ borderRadius: 999 }} />
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: 0 }}>{m.name}</h3>
                  {m.status === "primary" && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: "3px 8px", background: TEAL, color: PAPER, borderRadius: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>Primary</span>}
                </div>
                <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.7)" }}>{m.role}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 4, letterSpacing: "0.08em" }}>{m.cert} · WORKING TOGETHER {m.with.toUpperCase()}</div>
                <div style={{ marginTop: 16, padding: "12px 16px", background: "rgba(30,192,168,0.06)", borderRadius: 8, borderLeft: `2px solid ${TEAL}` }}>
                  <div style={{ fontFamily: sans, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 6 }}>Latest · {m.msgTime}</div>
                  <p style={{ fontFamily: serif, fontSize: 15, fontStyle: "italic", lineHeight: 1.4, color: INK, margin: 0 }}>"{m.msg}"</p>
                </div>
              </div>
              <div>
                <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 12 }}>Up next</div>
                <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", color: INK, lineHeight: 1.15 }}>{m.next}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
                  {[[m.sessions, "sessions"], [`${m.completion}%`, "kept"], [m.rating, "rating"]].map(([v, l], j) => (
                    <div key={j}>
                      <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em", color: INK, lineHeight: 1 }}>{v}</div>
                      <div style={{ fontFamily: sans, fontSize: 10.5, color: "rgba(242,237,228,0.5)", marginTop: 4 }}>{l}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button style={{ background: INK, color: PAPER, border: 0, padding: "10px 18px", borderRadius: 6, fontFamily: sans, fontSize: 12.5, fontWeight: 500, cursor: "pointer" }}>Message</button>
                <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.15)", padding: "10px 18px", borderRadius: 6, fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>Book</button>
                <button style={{ background: "transparent", border: 0, padding: "6px", fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.6)", cursor: "pointer" }}>Profile →</button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamSchedule() {
  return (
    <section style={{ padding: "60px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 40 }}>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 24 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Upcoming · next 7 days</div>
              <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: "8px 0 0" }}>What's on.</h3>
            </div>
            <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.15)", padding: "8px 14px", borderRadius: 6, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Full calendar →</button>
          </div>
          {UPCOMING.map((u, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 60px 1fr auto", gap: 20, padding: "20px 0", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "none", alignItems: "center" }}>
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: u.day === "TODAY" ? TEAL : "rgba(242,237,228,0.5)", fontWeight: u.day === "TODAY" ? 600 : 400 }}>{u.day}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{u.date}</div>
              </div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: INK }}>{u.time}</div>
              <div>
                <div style={{ fontFamily: serif, fontSize: 19, letterSpacing: "-0.01em", color: INK }}>{u.what}</div>
                {u.who && <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>with {u.who} · {u.kind}</div>}
                {!u.who && <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>{u.kind}</div>}
              </div>
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, padding: "3px 8px", background: u.tag === "session" ? "rgba(30,192,168,0.1)" : "rgba(242,237,228,0.06)", color: u.tag === "session" ? TEAL : "rgba(242,237,228,0.6)", borderRadius: 4, letterSpacing: "0.1em", textTransform: "uppercase" }}>{u.tag}</span>
            </div>
          ))}
        </div>

        <div style={{ background: INK, color: PAPER, borderRadius: 12, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Inbox</div>
              <h3 style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", fontWeight: 400, margin: "8px 0 0", color: PAPER }}>From your team.</h3>
            </div>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: TEAL }}>2 new</span>
          </div>
          {MESSAGES.map((m, i) => (
            <div key={i} style={{ padding: "16px 0", borderTop: i ? "1px solid rgba(26,22,18,0.1)" : "none" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 500 }}>{m.from}</span>
                  {m.unread && <span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL }} />}
                </div>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,22,18,0.5)" }}>{m.time}</span>
              </div>
              <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(26,22,18,0.75)", lineHeight: 1.45 }}>{m.msg}</div>
            </div>
          ))}
          <button style={{ marginTop: 20, width: "100%", background: "rgba(26,22,18,0.08)", color: PAPER, border: 0, padding: "12px", borderRadius: 6, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Open inbox →</button>
        </div>
      </div>
    </section>
  );
}

function TeamCollab() {
  return (
    <section style={{ padding: "60px 40px 120px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Team brief</div>
        <h2 style={{ fontFamily: serif, fontSize: 56, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 8px", lineHeight: 1 }}>
          They <em style={{ fontStyle: "italic", color: TEAL }}>talk to each other</em>.
        </h2>
        <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.55, color: "rgba(242,237,228,0.65)", maxWidth: 640, margin: "16px 0 40px" }}>
          A shared brief keeps Maya, Rae, and Julien aligned on your goals, schedule, and injuries — so nobody programs around an ankle they didn't know about.
        </p>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, padding: 40 }}>
          <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 40, alignItems: "start" }}>
            <div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>BRIEF · UPDATED APR 15</div>
              <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", marginTop: 12, lineHeight: 1.2 }}>Priya's spring block.</div>
              <button style={{ marginTop: 20, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.15)", padding: "8px 14px", borderRadius: 6, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Edit brief</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
              {[
                ["Primary goal", "Strength PRs — squat, bench, deadlift. Hybrid endurance block starting June."],
                ["Schedule", "4 × 1-hr sessions / week. Tues & Thurs AM. Sat long session."],
                ["Watch", "Left ankle (mild sprain Feb). Avoid high-impact jumps until cleared by Julien."],
                ["Nutrition focus", "Protein 168g/day. Carbs periodized around training. No calorie counting."],
                ["Sleep target", "7h minimum. Currently averaging 7h 42m."],
                ["Next milestone", "Mock meet May 11. 225 bench attempt on May 25."],
              ].map(([k, v], i) => (
                <div key={i}>
                  <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 6 }}>{k}</div>
                  <div style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.35, color: INK }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function TeamPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans }}>
      <Header active="My Team" />
      <TeamHero />
      <TeamRoster />
      <TeamSchedule />
      <TeamCollab />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<TeamPage />);
