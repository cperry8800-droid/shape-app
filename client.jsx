// Client profile + dashboard pages
const { useState: useSClient } = React;

const TODAY = [
  { when: "17:30", what: "Upper push · 5 exercises", with: "Maya Okafor", kind: "workout" },
  { when: "19:30", what: "Log dinner · protein target 168g", with: null, kind: "nutrition" },
  { when: "21:00", what: "Mobility · 10 min", with: null, kind: "recovery" },
];

const WEEK = [
  { d: "M", v: 68 }, { d: "T", v: 82 }, { d: "W", v: 74 }, { d: "T", v: 91 }, { d: "F", v: 64 }, { d: "S", v: 88 }, { d: "S", v: 0 },
];

const CLIENT_EVENTS = [
  // Week of Apr 13–19
  { date: "2026-04-13", time: "07:00", kind: "WORKOUT", title: "Lower push", sub: "60 min · with Marcus" },
  { date: "2026-04-13", time: "12:30", kind: "MEAL",    title: "Chicken bowl", sub: "620 cal" },
  { date: "2026-04-14", time: "08:00", kind: "WORKOUT", title: "Mobility flow", sub: "30 min · solo" },
  { date: "2026-04-14", time: "13:00", kind: "MEAL",    title: "Salmon + quinoa", sub: "720 cal" },
  { date: "2026-04-15", time: "17:30", kind: "WORKOUT", title: "Upper push", sub: "Bench 4×6" },
  { date: "2026-04-16", time: "07:00", kind: "WORKOUT", title: "Zone-2 run", sub: "40 min · Prospect Park" },
  { date: "2026-04-16", time: "18:00", kind: "CHECKIN", title: "Nutrition review", sub: "Rae · 20 min" },
  { date: "2026-04-17", time: "09:00", kind: "WORKOUT", title: "Upper pull", sub: "45 min · 6 exercises" },
  { date: "2026-04-17", time: "12:30", kind: "MEAL",    title: "Grilled chicken bowl", sub: "620 cal · 52g P" },
  { date: "2026-04-17", time: "18:30", kind: "CHECKIN", title: "Weekly w/ Marcus", sub: "Video call · 20 min" },
  { date: "2026-04-18", time: "09:00", kind: "WORKOUT", title: "Upper Body Pull", sub: "45 min · 6 exercises" },
  { date: "2026-04-18", time: "12:30", kind: "MEAL",    title: "Grilled chicken bowl", sub: "620 cal" },
  { date: "2026-04-18", time: "18:30", kind: "CHECKIN", title: "Weekly with Marcus", sub: "20 min · video call" },
  { date: "2026-04-19", time: "10:00", kind: "WORKOUT", title: "Long run", sub: "10k · easy pace" },
  // Scattered across month
  { date: "2026-04-20", time: "07:30", kind: "WORKOUT", title: "Lower pull", sub: "Deadlift 5×3" },
  { date: "2026-04-21", time: "17:00", kind: "WORKOUT", title: "Upper push", sub: "Tempo work" },
  { date: "2026-04-22", time: "12:30", kind: "MEAL",    title: "Prep meal-plan", sub: "With Rae" },
  { date: "2026-04-22", time: "18:00", kind: "CHECKIN", title: "Bloodwork review", sub: "Rae · 30 min" },
  { date: "2026-04-24", time: "08:00", kind: "WORKOUT", title: "Accessory day", sub: "Arms + core" },
  { date: "2026-04-25", time: "09:00", kind: "WORKOUT", title: "Long run", sub: "12k" },
  { date: "2026-04-28", time: "17:30", kind: "CHECKIN", title: "Monthly review", sub: "Marcus + Rae" },
  { date: "2026-04-30", time: "07:00", kind: "WORKOUT", title: "Strength test", sub: "Squat 1RM" },
];

function ClientProfile() {
  const cal = useCalendarOverlay();
  return (
    <section style={{ padding: "80px 40px 60px", position: "relative", overflow: "hidden" }}>
      <HeroBg />
      <CalendarOverlay {...cal.props} role="client" events={CLIENT_EVENTS} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative" }}>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr auto", gap: 40, alignItems: "center" }}>
          <Ph label="Priya · portrait" ratio="1/1" tone="light" style={{ borderRadius: 999 }} />
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 12 }}>Member · Brooklyn · since Feb '25</div>
            <h1 style={{ fontFamily: serif, fontSize: 88, letterSpacing: "-0.035em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>Priya Shankar</h1>
            <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", margin: "16px 0 0", maxWidth: 560 }}>Training strength & hypertrophy with Maya. Hybrid endurance block starting June. Tracks protein, not calories.</p>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}>SHAPE SCORE</div>
            <div style={{ fontFamily: serif, fontSize: 72, color: TEAL, letterSpacing: "-0.03em", lineHeight: 1 }}>1,284</div>
            <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>14-day streak · +82 this week</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 0, marginTop: 56, borderTop: "1px solid rgba(242,237,228,0.15)", borderBottom: "1px solid rgba(242,237,228,0.15)" }}>
          {[["14 mo", "Training on Shape"], ["+22 lb", "Squat PR this block"], ["4 / 5", "Sessions this week"], ["168g", "Avg protein / day"]].map(([k, l], i) => (
            <div key={i} style={{ padding: "28px 24px", borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
              <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.03em", color: INK, lineHeight: 1 }}>{k}</div>
              <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 10 }}>{l}</div>
            </div>
          ))}
        </div>

        <TodayAgenda onOpenCalendar={cal.open} />
      </div>
    </section>
  );
}

const AGENDA = [
  { when: "9:00 AM",  kind: "WORKOUT",  title: "Upper Body Pull",    sub: "45 min · 6 exercises · programmed by Marcus", cta: ["START", "solid"] },
  { when: "12:30 PM", kind: "MEAL",     title: "Grilled chicken bowl", sub: "620 cal · 52g P · 68g C · 18g F",            cta: ["LOG MEAL", "ghost"] },
  { when: "6:30 PM",  kind: "CHECK-IN", title: "Weekly with Marcus",   sub: "20 min · video call",                          cta: ["JOIN", "ghost"] },
];

function TodayAgenda({ onOpenCalendar }) {
  return (
    <div style={{ marginTop: 48, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 12, overflow: "hidden" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 28px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", color: "rgba(242,237,228,0.7)" }}>TODAY</div>
        <a href="#" onClick={onOpenCalendar} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.18em", color: TEAL_BRIGHT, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>OPEN CALENDAR <span style={{ fontSize: 13 }}>→</span></a>
      </div>
      {AGENDA.map((a, i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "96px 1fr auto", gap: 24, alignItems: "center", padding: "22px 28px", borderTop: i ? "1px solid rgba(242,237,228,0.06)" : "none" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: "rgba(242,237,228,0.55)", letterSpacing: "0.04em" }}>{a.when}</div>
          <div>
            <div style={{ fontFamily: sans, fontSize: 10.5, fontWeight: 600, letterSpacing: "0.18em", color: TEAL_BRIGHT, marginBottom: 6 }}>{a.kind}</div>
            <div style={{ fontFamily: sans, fontSize: 17, fontWeight: 500, color: INK, letterSpacing: "-0.005em" }}>{a.title}</div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(242,237,228,0.5)", marginTop: 4 }}>{a.sub}</div>
          </div>
          {a.cta[1] === "solid" ? (
            <button style={{ background: TEAL, color: "#0a0f0d", border: 0, padding: "11px 22px", borderRadius: 4, fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 8 }}>{a.cta[0]} <span>→</span></button>
          ) : (
            <button style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "10px 20px", borderRadius: 4, fontFamily: sans, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.14em", cursor: "pointer" }}>{a.cta[0]}</button>
          )}
        </div>
      ))}
    </div>
  );
}

function ClientDashboard() {
  return (
    <section style={{ padding: "40px 40px 100px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32 }}>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Wednesday, April 18</div>
              <h2 style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", fontWeight: 400, margin: "8px 0 0" }}>Today.</h2>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}>WK 6 / 12</div>
          </div>
          {TODAY.map((t, i) => (
            <div key={i} style={{ display: "grid", gridTemplateColumns: "80px 1fr auto", gap: 20, padding: "20px 0", borderTop: "1px solid rgba(242,237,228,0.08)", alignItems: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: INK }}>{t.when}</div>
              <div>
                <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.01em", color: INK }}>{t.what}</div>
                {t.with && <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>with {t.with}</div>}
              </div>
              <button style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: INK, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Open →</button>
            </div>
          ))}

          <div style={{ marginTop: 32, padding: 24, background: "rgba(30,192,168,0.06)", borderRadius: 10 }}>
            <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 8 }}>Note from Maya · 2h ago</div>
            <p style={{ fontFamily: serif, fontSize: 17, fontStyle: "italic", lineHeight: 1.4, color: INK, margin: 0 }}>"Form check on the incline press last session was clean. Push to 60 lb today if bar speed stays crisp."</p>
          </div>
        </div>

        <div style={{ display: "grid", gap: 32 }}>
          <div style={{ background: INK, color: PAPER, borderRadius: 12, padding: 28 }}>
            <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 12 }}>This week</div>
            <div style={{ display: "flex", alignItems: "end", gap: 10, height: 120, marginBottom: 12 }}>
              {WEEK.map((d, i) => (
                <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <div style={{ flex: 1, display: "flex", alignItems: "end", width: "100%" }}>
                    <div style={{ width: "100%", height: `${d.v}%`, background: d.v ? TEAL_BRIGHT : "rgba(26,22,18,0.1)", borderRadius: 3 }} />
                  </div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(26,22,18,0.5)" }}>{d.d}</div>
                </div>
              ))}
            </div>
            <div style={{ fontFamily: sans, fontSize: 13, color: "rgba(26,22,18,0.7)" }}>Training load trending up vs last week. Recovery holding.</div>
          </div>

          <div style={{ background: "rgba(242,237,228,0.04)", borderRadius: 12, padding: 28, border: "1px solid rgba(242,237,228,0.08)" }}>
            <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>My coaches</div>
            {[["Maya Okafor", "Strength · Hypertrophy", "Next: today 17:30"], ["Rae Lindqvist", "Sports Nutrition", "Weekly review Sunday"]].map(([n, r, next], i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "48px 1fr auto", gap: 14, padding: "14px 0", alignItems: "center", borderTop: i ? "1px solid rgba(242,237,228,0.08)" : "none" }}>
                <Ph label="" ratio="1/1" tone="light" style={{ borderRadius: 999 }} />
                <div>
                  <div style={{ fontFamily: sans, fontSize: 14, fontWeight: 500, color: INK }}>{n}</div>
                  <div style={{ fontFamily: sans, fontSize: 12, color: "rgba(242,237,228,0.55)" }}>{r} · {next}</div>
                </div>
                <button style={{ padding: "6px 12px", borderRadius: 999, background: "rgba(30,192,168,0.1)", color: TEAL, border: 0, fontFamily: sans, fontSize: 11, fontWeight: 500, cursor: "pointer" }}>Message</button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

function ClientPage() {
  return (
    <div style={{ background: PAPER, color: INK, fontFamily: sans }}>
      <Header />
      <ClientProfile />
      <ClientDashboard />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<ClientPage />);
