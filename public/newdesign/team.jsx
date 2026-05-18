// My Team — the client's roster of coaches, messages, and upcoming sessions. Spatial Cinema language.
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

const TM_RPR = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

function TmReveal({ children, delay = 0, style = {} }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(TM_RPR);
  React.useEffect(() => {
    if (TM_RPR || !ref.current) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { threshold: 0.12 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(32px)", transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`, ...style }}>{children}</div>;
}

function TeamHero() {
  return (
    <section style={{ padding: "150px 72px 40px", position: "relative", overflow: "hidden" }}>
      <div aria-hidden style={{ position: "absolute", width: 600, height: 600, top: "-22%", right: "-6%", borderRadius: "50%", filter: "blur(80px)", opacity: 0.3, background: `radial-gradient(circle, ${TEAL}, transparent 70%)`, pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.3em", textTransform: "uppercase", color: TEAL, marginBottom: 22 }}>Your team · Priya Shankar</div>
        <h1 style={{ fontFamily: serif, fontSize: "clamp(54px, 8vw, 116px)", letterSpacing: "-0.045em", fontWeight: 300, margin: 0, lineHeight: 0.88 }}>
          Three people<br />in <em style={{ fontStyle: "italic", fontWeight: 600, color: "transparent", WebkitTextStroke: `1.4px ${INK}` }}>your corner</em>.
        </h1>
        <p style={{ fontFamily: sans, fontSize: 17, lineHeight: 1.6, color: "rgba(242,237,228,0.66)", margin: "30px 0 0", maxWidth: 640 }}>
          Every coach you've hired, in one place. Message them, see upcoming sessions, and track how the whole team is moving you forward.
        </p>
        <div className="tm-stats" style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginTop: 60, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          {[["3", "Active coaches", "1 primary, 2 active"], ["131", "Sessions with team", "across 14 months"], ["94%", "Completion rate", "team average"], ["4.96", "Avg rating", "from you"]].map(([k, l, s], i) => (
            <div key={i} style={{ padding: "30px 24px", borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
              <div style={{ fontFamily: serif, fontSize: 46, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: sans, fontSize: 13, fontWeight: 600, color: INK, marginTop: 12 }}>{l}</div>
              <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 4 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamRoster() {
  return (
    <section style={{ padding: "60px 72px 70px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 34, flexWrap: "wrap", gap: 16 }}>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(34px, 4.4vw, 52px)", letterSpacing: "-0.035em", fontWeight: 300, margin: 0 }}>Your roster.</h2>
          <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.22)", padding: "12px 20px", borderRadius: 2, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>+ Add a coach</button>
        </div>
        <div style={{ display: "grid", gap: 20 }}>
          {TEAM.map((m, i) => (
            <TmReveal key={i} delay={i * 60}>
              <article className="tm-card" style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, padding: 36, display: "grid", gridTemplateColumns: "120px 1.5fr 1fr auto", gap: 32, alignItems: "center", position: "relative", overflow: "hidden" }}>
                {m.status === "primary" && <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7 }} />}
                <Ph label="" ratio="1/1" tone="light" style={{ borderRadius: 999 }} />
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                    <h3 style={{ fontFamily: serif, fontSize: 32, letterSpacing: "-0.02em", fontWeight: 400, margin: 0 }}>{m.name}</h3>
                    {m.status === "primary" && <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 8px", background: TEAL, color: PAPER, borderRadius: 3, letterSpacing: "0.1em", textTransform: "uppercase" }}>Primary</span>}
                  </div>
                  <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.7)" }}>{m.role}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 5, letterSpacing: "0.08em" }}>{m.cert} · WORKING TOGETHER {m.with.toUpperCase()}</div>
                  <div style={{ marginTop: 16, padding: "14px 18px", background: "rgba(19,194,168,0.06)", borderRadius: 4, borderLeft: `2px solid ${TEAL}` }}>
                    <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL, marginBottom: 7 }}>Latest · {m.msgTime}</div>
                    <p style={{ fontFamily: serif, fontSize: 16, fontStyle: "italic", lineHeight: 1.45, color: INK, margin: 0 }}>"{m.msg}"</p>
                  </div>
                </div>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", color: "rgba(242,237,228,0.5)", marginBottom: 12 }}>Up next</div>
                  <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.015em", color: INK, lineHeight: 1.2 }}>{m.next}</div>
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
                  <button style={{ background: TEAL, color: PAPER, border: 0, padding: "11px 20px", borderRadius: 2, fontFamily: sans, fontSize: 12.5, fontWeight: 600, cursor: "pointer" }}>Message</button>
                  <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.16)", padding: "11px 20px", borderRadius: 2, fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>Book</button>
                  <button style={{ background: "transparent", border: 0, padding: "6px", fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.6)", cursor: "pointer" }}>Profile →</button>
                </div>
              </article>
            </TmReveal>
          ))}
        </div>
      </div>
    </section>
  );
}

function TeamSchedule() {
  return (
    <section style={{ padding: "70px 72px" }}>
      <TmReveal>
        <div className="tm-sched" style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 24 }}>
          <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, padding: 36, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7 }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 26 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL }}>Upcoming · next 7 days</div>
                <h3 style={{ fontFamily: serif, fontSize: 34, letterSpacing: "-0.025em", fontWeight: 400, margin: "10px 0 0" }}>What's on.</h3>
              </div>
              <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.16)", padding: "9px 16px", borderRadius: 2, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Full calendar →</button>
            </div>
            {UPCOMING.map((u, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 60px 1fr auto", gap: 20, padding: "20px 0", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "none", alignItems: "center" }}>
                <div>
                  <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.1em", color: u.day === "TODAY" ? TEAL : "rgba(242,237,228,0.5)", fontWeight: u.day === "TODAY" ? 600 : 400 }}>{u.day}</div>
                  <div style={{ fontFamily: mono, fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{u.date}</div>
                </div>
                <div style={{ fontFamily: mono, fontSize: 13, color: INK }}>{u.time}</div>
                <div>
                  <div style={{ fontFamily: serif, fontSize: 19, letterSpacing: "-0.01em", color: INK }}>{u.what}</div>
                  {u.who && <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>with {u.who} · {u.kind}</div>}
                  {!u.who && <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>{u.kind}</div>}
                </div>
                <span style={{ fontFamily: mono, fontSize: 9, padding: "3px 8px", background: u.tag === "session" ? "rgba(19,194,168,0.1)" : "rgba(242,237,228,0.06)", color: u.tag === "session" ? TEAL : "rgba(242,237,228,0.6)", borderRadius: 3, letterSpacing: "0.1em", textTransform: "uppercase" }}>{u.tag}</span>
              </div>
            ))}
          </div>
          <div style={{ background: INK, color: PAPER, borderRadius: 6, padding: 36 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 22 }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: TEAL }}>Inbox</div>
                <h3 style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.02em", fontWeight: 400, margin: "10px 0 0", color: PAPER }}>From your team.</h3>
              </div>
              <span style={{ fontFamily: mono, fontSize: 11, color: TEAL }}>2 new</span>
            </div>
            {MESSAGES.map((m, i) => (
              <div key={i} style={{ padding: "16px 0", borderTop: i ? "1px solid rgba(26,22,18,0.1)" : "none" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: sans, fontSize: 13, fontWeight: 600 }}>{m.from}</span>
                    {m.unread && <span style={{ width: 6, height: 6, borderRadius: 999, background: TEAL }} />}
                  </div>
                  <span style={{ fontFamily: mono, fontSize: 10, color: "rgba(26,22,18,0.5)" }}>{m.time}</span>
                </div>
                <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(26,22,18,0.75)", lineHeight: 1.5 }}>{m.msg}</div>
              </div>
            ))}
            <button style={{ marginTop: 22, width: "100%", background: "rgba(26,22,18,0.08)", color: PAPER, border: 0, padding: "13px", borderRadius: 2, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>Open inbox →</button>
          </div>
        </div>
      </TmReveal>
    </section>
  );
}

function TeamCollab() {
  return (
    <section style={{ padding: "70px 72px 130px" }}>
      <TmReveal>
        <div style={{ maxWidth: 1320, margin: "0 auto" }}>
          <div style={{ fontFamily: mono, fontSize: 12, letterSpacing: "0.25em", textTransform: "uppercase", color: TEAL, marginBottom: 18 }}>Team brief</div>
          <h2 style={{ fontFamily: serif, fontSize: "clamp(38px, 5.4vw, 64px)", letterSpacing: "-0.035em", fontWeight: 300, margin: "0 0 8px", lineHeight: 1 }}>
            They <em style={{ fontStyle: "italic", fontWeight: 600, color: TEAL }}>talk to each other</em>.
          </h2>
          <p style={{ fontFamily: sans, fontSize: 16, lineHeight: 1.6, color: "rgba(242,237,228,0.62)", maxWidth: 640, margin: "16px 0 40px" }}>
            A shared brief keeps Maya, Rae, and Julien aligned on your goals, schedule, and injuries — so nobody programs around an ankle they didn't know about.
          </p>
          <div style={{ background: "rgba(242,237,228,0.03)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 6, padding: 44, position: "relative", overflow: "hidden" }}>
            <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${TEAL}, ${RUST})`, opacity: 0.7 }} />
            <div className="tm-brief" style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 44, alignItems: "start" }}>
              <div>
                <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)" }}>BRIEF · UPDATED APR 15</div>
                <div style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.02em", marginTop: 12, lineHeight: 1.2 }}>Priya's spring block.</div>
                <button style={{ marginTop: 22, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.16)", padding: "9px 16px", borderRadius: 2, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Edit brief</button>
              </div>
              <div className="tm-brief-grid" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 32 }}>
                {[
                  ["Primary goal", "Strength PRs — squat, bench, deadlift. Hybrid endurance block starting June."],
                  ["Schedule", "4 × 1-hr sessions / week. Tues & Thurs AM. Sat long session."],
                  ["Watch", "Left ankle (mild sprain Feb). Avoid high-impact jumps until cleared by Julien."],
                  ["Nutrition focus", "Protein 168g/day. Carbs periodized around training. No calorie counting."],
                  ["Sleep target", "7h minimum. Currently averaging 7h 42m."],
                  ["Next milestone", "Mock meet May 11. 225 bench attempt on May 25."],
                ].map(([k, v], i) => (
                  <div key={i}>
                    <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: "0.16em", textTransform: "uppercase", color: TEAL, marginBottom: 7 }}>{k}</div>
                    <div style={{ fontFamily: serif, fontSize: 17, lineHeight: 1.4, color: INK }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </TmReveal>
    </section>
  );
}

function TeamPage() {
  return (
    <div style={{ background: INK_DEEP, color: INK, fontFamily: sans, minHeight: "100vh", position: "relative" }}>
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, backgroundImage: "url('/get%20started.png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none", opacity: 0.9 }} />
      <div aria-hidden style={{ position: "fixed", inset: 0, zIndex: 0, pointerEvents: "none", background: "radial-gradient(120% 90% at 50% 6%, rgba(26,24,19,0.28) 0%, rgba(11,14,12,0.52) 55%, rgba(11,14,12,0.74) 100%)" }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="My Team" />
        <TeamHero />
        <TeamRoster />
        <TeamSchedule />
        <TeamCollab />
        <Footer />
      </div>
      <style>{`
        @media (max-width: 980px) {
          .tm-stats { grid-template-columns: repeat(2, 1fr) !important; }
          .tm-card { grid-template-columns: 1fr !important; gap: 20px !important; }
          .tm-sched { grid-template-columns: 1fr !important; }
          .tm-brief { grid-template-columns: 1fr !important; gap: 28px !important; }
          .tm-brief-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<TeamPage />);
