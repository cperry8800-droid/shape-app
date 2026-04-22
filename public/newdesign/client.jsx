// Client profile + dashboard pages
const { useState: useSClient } = React;

const TODAY = [
  { when: "17:30", what: "Upper push · 5 exercises", with: "Maya Okafor", kind: "workout", playlist: { name: "Upper Push — Peak", provider: "spotify", bpm: "95–130", tracks: 31, accent: "#6a8cff", cover: "linear-gradient(135deg, #2a3a6a 0%, #1a1612 70%)", note: "Builds across the session. Peaks at the top sets.", author: "Maya" } },
  { when: "19:30", what: "Log dinner · protein target 168g", with: null, kind: "nutrition" },
  { when: "21:00", what: "Mobility · 10 min", with: null, kind: "recovery", playlist: { name: "Mobility + Warmup", provider: "apple", bpm: "60–90", tracks: 18, accent: "#f2a94e", cover: "linear-gradient(135deg, #6a4a1c 0%, #1a1612 70%)", note: "Low key. Don't rush.", author: "Maya" } },
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
    <section style={{ padding: "80px 72px 60px", position: "relative", overflow: "hidden" }}>
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
    <section style={{ padding: "40px 72px 100px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 32 }}>
        <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 12, padding: 32 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
            <div>
              <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: TEAL }}>Wednesday, April 18</div>
              <h2 style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", fontWeight: 400, margin: "8px 0 0" }}>Today.</h2>
            </div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)" }}>WK 6 / 12</div>
          </div>
          {TODAY.map((t, i) => <TodayRow key={i} t={t} />)}

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

function TodayRow({ t }) {
  const [open, setOpen] = React.useState(false);
  const p = t.playlist;
  const spotMark = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="10" fill="#1ED760"/>
      <path d="M7.2 10.4c3.2-.9 7.4-.7 10.3 1.1.4.2.5.8.2 1.2-.2.4-.8.5-1.2.2-2.5-1.5-6.2-1.7-9-.9-.5.2-1-.2-1.1-.6-.1-.5.2-.9.8-1zM7.5 13c2.7-.8 6.3-.5 8.6 1 .3.2.4.7.2 1-.2.3-.7.4-1 .2-2-1.2-5.1-1.5-7.4-.8-.4.1-.8-.2-.9-.5 0-.4.2-.8.5-.9zM7.8 15.4c2.2-.6 4.9-.5 6.9.7.3.2.3.5.2.8-.2.3-.5.3-.8.2-1.7-1-4-1.1-5.9-.6-.3.1-.6-.1-.7-.4-.1-.3.1-.6.4-.7z" fill="#000"/>
    </svg>
  );
  const appleMark = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fc3c44">
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm3 13.3c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.4 0 .7.1 1 .2V7l4-1v9.3z"/>
    </svg>
  );
  return (
    <div style={{ borderTop: "1px solid rgba(242,237,228,0.08)", padding: "20px 0" }}>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto auto", gap: 20, alignItems: "center" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: INK }}>{t.when}</div>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.01em", color: INK }}>{t.what}</div>
          {t.with && <div style={{ fontFamily: sans, fontSize: 12.5, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>with {t.with}</div>}
        </div>
        {p && (
          <button onClick={() => setOpen(!open)}
            title={`${p.author}'s playlist: ${p.name}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "7px 12px 7px 7px", borderRadius: 999, border: `1px solid ${p.accent}44`, background: `${p.accent}18`, color: INK, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, background: p.accent, display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
              <svg width="10" height="10" viewBox="0 0 16 16" fill="#1a1612"><path d="M4 2.5v11l10-5.5z"/></svg>
            </span>
            <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>{p.provider === "apple" ? appleMark : spotMark} <span style={{ opacity: 0.9 }}>Coach's mix</span></span>
          </button>
        )}
        <button style={{ padding: "8px 14px", borderRadius: 6, border: "1px solid rgba(242,237,228,0.2)", background: "transparent", color: INK, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Open →</button>
      </div>
      {open && p && (
        <div style={{ marginTop: 16, marginLeft: 100, borderRadius: 12, overflow: "hidden", border: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ padding: "16px 20px", background: p.cover, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", padding: "4px 10px", borderRadius: 999, fontSize: 10, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: 8 }}>
                {p.provider === "apple" ? appleMark : spotMark}
                {p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"} · {p.author.toUpperCase()}'S PICK
              </div>
              <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 400, letterSpacing: "-0.01em" }}>{p.name}</div>
              <div style={{ fontSize: 11.5, fontFamily: "'JetBrains Mono', monospace", color: "rgba(242,237,228,0.75)", letterSpacing: "0.06em", marginTop: 4 }}>
                {p.bpm} BPM · {p.tracks} tracks · optional
              </div>
            </div>
            <button style={{ background: p.accent, color: "#1a1612", border: 0, padding: "10px 18px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>▶ Play</button>
          </div>
          <div style={{ padding: "14px 20px", background: "rgba(242,237,228,0.03)", display: "flex", alignItems: "center", gap: 10 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={TEAL_BRIGHT} strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
            <span style={{ fontSize: 12.5, color: "rgba(242,237,228,0.75)", fontStyle: "italic", flex: 1 }}>"{p.note}" — {p.author}</span>
            <button style={{ background: "transparent", color: "rgba(242,237,228,0.55)", border: 0, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", cursor: "pointer" }}>SKIP</button>
          </div>
        </div>
      )}
    </div>
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
