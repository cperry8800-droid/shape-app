// Dashboard layout — shared between Trainer, Client, Nutritionist variants.
// See: Shape Community live spec. Direction B visual system (PAPER/INK/TEAL).

// Reusable sidebar. Renders a dashboard home href + nav items with active states.
// navItems items: { label, count, active, href }
function DashSidebar({ navItems, payoutCard, homeHref = "index.html" }) {
  return (
    <aside style={{ borderRight: "1px solid rgba(242,237,228,0.08)", padding: "32px 20px", display: "flex", flexDirection: "column", gap: 4, position: "sticky", top: 0, height: "100vh" }}>
      <div style={{ padding: "4px 10px 40px" }}>
        <a href={homeHref} style={{ flex: "none", display: "inline-flex" }}><Logo variant="white" size={50} /></a>
      </div>
      {navItems.map((n, i) => (
        <a key={i} href={n.href || "#"} style={{
          display: "flex", alignItems: "center", justifyContent: "space-between",
          padding: "10px 14px", borderRadius: 6,
          background: n.active ? "rgba(30,192,168,0.12)" : "transparent",
          color: n.active ? INK : "rgba(242,237,228,0.7)",
          fontSize: 14, fontWeight: n.active ? 500 : 400,
          borderLeft: n.active ? `2px solid ${TEAL}` : "2px solid transparent",
        }}>
          <span>{n.label}</span>
          {n.count != null && (
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)", background: n.active ? "rgba(30,192,168,0.18)" : "rgba(242,237,228,0.06)", padding: "2px 7px", borderRadius: 4 }}>{n.count}</span>
          )}
        </a>
      ))}
      {payoutCard && (
        <div style={{ marginTop: "auto", padding: 16, background: "rgba(30,192,168,0.08)", border: "1px solid rgba(30,192,168,0.25)", borderRadius: 8 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.14em", color: TEAL_BRIGHT }}>{payoutCard.label}</div>
          <div style={{ fontFamily: serif, fontSize: 26, fontWeight: 400, marginTop: 6, letterSpacing: "-0.01em" }}>{payoutCard.amount}</div>
          <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{payoutCard.sub}</div>
        </div>
      )}
    </aside>
  );
}

// Inner-page shell: sidebar + main w/ title bar + freeform children
function DashPage({ navItems, payoutCard, eyebrow, title, subtitle, actions, children }) {
  return (
    <div style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: sans, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1 }}>
      <DashSidebar navItems={navItems} payoutCard={payoutCard} />
      <main style={{ padding: "40px 48px 80px" }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 40 }}>
          <div>
            {eyebrow && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)", marginBottom: 14 }}>{eyebrow}</div>}
            <h1 style={{ fontFamily: serif, fontSize: 52, letterSpacing: "-0.025em", fontWeight: 400, margin: 0, lineHeight: 1 }}>{title}</h1>
            {subtitle && <div style={{ fontSize: 15, color: "rgba(242,237,228,0.6)", marginTop: 14, maxWidth: 640, lineHeight: 1.5 }}>{subtitle}</div>}
          </div>
          {actions && <div style={{ display: "flex", gap: 10, paddingTop: 14 }}>{actions}</div>}
        </div>
        {children}
      </main>
      </div>
      <Footer />
    </div>
  );
}

// Small helpers available to every inner page
function Card({ children, style }) {
  return <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 24, ...style }}>{children}</div>;
}
function SectionTitle({ children, right }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 16 }}>
      <div style={{ fontSize: 14, fontWeight: 500 }}>{children}</div>
      {right && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)", letterSpacing: "0.08em" }}>{right}</div>}
    </div>
  );
}
function Pill({ children, tone = "mute" }) {
  const bg = tone === "teal" ? TEAL : tone === "done" ? "rgba(242,237,228,0.08)" : "rgba(242,237,228,0.08)";
  const col = tone === "teal" ? PAPER : "rgba(242,237,228,0.7)";
  const bd = tone === "teal" ? "none" : "1px solid rgba(242,237,228,0.12)";
  return <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 4, background: bg, color: col, border: bd }}>{children}</span>;
}

// Row renderer for DashShell.todayItems. Supports t.playlist = { name, provider, bpm, accent, cover, note, author, tracks }
function DashTodayItemRow({ t }) {
  const [open, setOpen] = React.useState(false);
  const p = t.playlist;
  const spotMark = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" style={{ flex: "none" }}>
      <circle cx="12" cy="12" r="10" fill="#1ED760"/>
      <path d="M7.2 10.4c3.2-.9 7.4-.7 10.3 1.1.4.2.5.8.2 1.2-.2.4-.8.5-1.2.2-2.5-1.5-6.2-1.7-9-.9-.5.2-1-.2-1.1-.6-.1-.5.2-.9.8-1zM7.5 13c2.7-.8 6.3-.5 8.6 1 .3.2.4.7.2 1-.2.3-.7.4-1 .2-2-1.2-5.1-1.5-7.4-.8-.4.1-.8-.2-.9-.5 0-.4.2-.8.5-.9zM7.8 15.4c2.2-.6 4.9-.5 6.9.7.3.2.3.5.2.8-.2.3-.5.3-.8.2-1.7-1-4-1.1-5.9-.6-.3.1-.6-.1-.7-.4-.1-.3.1-.6.4-.7z" fill="#000"/>
    </svg>
  );
  const appleMark = (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="#fc3c44" style={{ flex: "none" }}>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm3 13.3c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5 1.1-2.5 2.5-2.5c.4 0 .7.1 1 .2V7l4-1v9.3z"/>
    </svg>
  );
  return (
    <div style={{ borderTop: "1px solid rgba(242,237,228,0.06)" }}>
      <div style={{ display: "grid", gridTemplateColumns: "80px 1fr auto auto", gap: 16, alignItems: "center", padding: "18px 4px" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11.5, color: "rgba(242,237,228,0.55)", letterSpacing: "0.04em" }}>{t.time}</div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 6 }}>{t.kind}</div>
          <div style={{ fontSize: 15, fontWeight: 500, marginBottom: 4 }}>{t.title}</div>
          {t.sub && <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.55)" }}>{t.sub}</div>}
        </div>
        {p ? (
          <button onClick={() => setOpen(!open)}
            title={`${p.author || "Coach"}'s playlist: ${p.name}`}
            style={{ display: "inline-flex", alignItems: "center", gap: 8, padding: "6px 12px 6px 6px", borderRadius: 999, border: `1px solid ${p.accent}55`, background: `${p.accent}1a`, color: PAPER, fontFamily: sans, fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, background: p.accent, display: "inline-flex", alignItems: "center", justifyContent: "center", flex: "none" }}>
              <svg width="9" height="9" viewBox="0 0 16 16" fill="#1a1612"><path d="M4 2.5v11l10-5.5z"/></svg>
            </span>
            {p.provider === "apple" ? appleMark : spotMark}
            <span style={{ opacity: 0.9 }}>Coach's mix</span>
            <svg width="10" height="10" viewBox="0 0 10 10" style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", opacity: 0.6 }}><path d="M2 3.5l3 3 3-3" stroke="currentColor" fill="none" strokeWidth="1.5"/></svg>
          </button>
        ) : <div />}
        {t.cta ? (
          t.cta.primary ? (
            <button style={{ background: TEAL, color: PAPER, border: 0, padding: "10px 18px", borderRadius: 4, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap" }}>{t.cta.label} <span style={{ marginLeft: 4 }}>→</span></button>
          ) : (
            <button style={{ background: "transparent", color: TEAL_BRIGHT, border: `1px solid ${TEAL}`, padding: "9px 18px", borderRadius: 4, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", cursor: "pointer", whiteSpace: "nowrap" }}>{t.cta.label}</button>
          )
        ) : <div />}
      </div>

      {open && p && (
        <div style={{ marginBottom: 14, marginLeft: 96, marginRight: 4, borderRadius: 10, overflow: "hidden", border: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ padding: "14px 18px", background: p.cover, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", padding: "4px 10px", borderRadius: 999, fontSize: 9.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", marginBottom: 7, color: PAPER }}>
                {p.provider === "apple" ? appleMark : spotMark}
                {p.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"} · {(p.author || "COACH").toUpperCase()}'S PICK
              </div>
              <div style={{ fontFamily: "Fraunces, serif", fontSize: 20, fontWeight: 400, letterSpacing: "-0.01em", color: PAPER }}>{p.name}</div>
              <div style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "rgba(242,237,228,0.75)", letterSpacing: "0.06em", marginTop: 4 }}>
                {p.bpm} BPM · {p.tracks || "—"} tracks · optional, always skippable
              </div>
            </div>
            <button style={{ background: p.accent, color: "#1a1612", border: 0, padding: "9px 16px", borderRadius: 999, fontFamily: sans, fontSize: 12, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>▶ Play</button>
          </div>
          {p.note && (
            <div style={{ padding: "12px 18px", background: "rgba(242,237,228,0.04)", display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontSize: 12, color: "rgba(242,237,228,0.75)", fontStyle: "italic", flex: 1 }}>"{p.note}" — {p.author || "Coach"}</span>
              <button style={{ background: "transparent", color: "rgba(242,237,228,0.5)", border: 0, fontSize: 10.5, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.1em", cursor: "pointer" }}>HIDE PLAYLIST</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DashShell({
  role,         // "trainer" | "client" | "nutritionist"
  userName,
  date,         // "WEDNESDAY APR 18"
  greeting,     // "Good morning, Maya."
  primaryCta,   // ["+ Program", onClick]
  secondaryCta, // ["New session", onClick]
  navItems,     // [{ label, count, active }]
  payoutCard,   // { label, amount, sub } or null
  kpis,         // [{ k, l, sub }]
  todayItems,   // optional [{ time, kind, title, sub, cta }]
  scheduleTitle,
  schedule,     // [{ time, who, sub, status }]
  pulseTitle,
  pulse,        // [{ who, sub, trend }]  trend = array of numbers 0-1
  extraSections, // optional [{ title, render }]
  calendarEvents, // optional [{date,time,kind,title,sub}] — enables "Open calendar →"
}) {
  const cal = (typeof useCalendarOverlay === "function") ? useCalendarOverlay() : null;
  return (
    <div style={{ background: PAPER, color: INK, minHeight: "100vh", fontFamily: sans, display: "flex", flexDirection: "column" }}>
      <div style={{ display: "grid", gridTemplateColumns: "240px 1fr", flex: 1 }}>
      <DashSidebar navItems={navItems} payoutCard={payoutCard} />
      {calendarEvents && cal && <CalendarOverlay {...cal.props} role={role} events={calendarEvents} />}

      {/* Main */}
      <main style={{ padding: "40px 48px 80px", minWidth: 0 }}>
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 24, marginBottom: 36 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)", marginBottom: 12 }}>{date}</div>
            <h1 style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.025em", fontWeight: 400, margin: 0, lineHeight: 1.02 }}>{greeting}</h1>
          </div>
          <div style={{ display: "flex", gap: 10, paddingTop: 10, flexShrink: 0 }}>
            {primaryCta && <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "10px 20px", borderRadius: 999, fontFamily: sans, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap" }}>{primaryCta[0]}</button>}
            {secondaryCta && <button style={{ background: INK, color: PAPER, border: 0, padding: "10px 22px", borderRadius: 999, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>{secondaryCta[0]}</button>}
          </div>
        </div>

        {/* KPI strip — single card w/ dividers */}
        <div style={{
          display: "grid", gridTemplateColumns: `repeat(${kpis.length},1fr)`,
          background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)",
          borderRadius: 10, marginBottom: 20, overflow: "hidden",
        }}>
          {kpis.map((k, i) => (
            <div key={i} style={{
              padding: "20px 20px",
              borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none",
              minWidth: 0,
            }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)", marginBottom: 10, textTransform: "uppercase" }}>{k.l}</div>
              <div style={{
                fontFamily: serif, fontSize: 26, fontWeight: 400, letterSpacing: "-0.015em", lineHeight: 1,
                whiteSpace: "nowrap",
                fontVariantNumeric: "tabular-nums",
              }}>{k.k}</div>
              {k.sub && <div style={{ fontSize: 11, color: "rgba(242,237,228,0.5)", marginTop: 6 }}>{k.sub}</div>}
            </div>
          ))}
        </div>

        {/* Today */}
        {todayItems && todayItems.length > 0 && (
          <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 24, marginBottom: 20 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)" }}>TODAY</div>
              {calendarEvents && cal && (
                <a href="#" onClick={cal.open} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>OPEN CALENDAR <span style={{ fontSize: 12 }}>→</span></a>
              )}
            </div>
            {todayItems.map((t, i) => (
              <DashTodayItemRow key={i} t={t} />
            ))}
          </div>
        )}

        {/* Schedule + Pulse */}
        <div style={{ display: "grid", gridTemplateColumns: "1.35fr 1fr", gap: 20 }}>
          <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 24 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{scheduleTitle}</div>
              {calendarEvents && cal && (
                <a href="#" onClick={cal.open} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.16em", color: TEAL_BRIGHT, display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}>OPEN CALENDAR <span style={{ fontSize: 12 }}>→</span></a>
              )}
            </div>
            {schedule.map((s, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "64px 1fr auto", gap: 12, alignItems: "center", padding: "14px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{s.time}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{s.who}</div>
                  <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 2 }}>{s.sub}</div>
                </div>
                {s.status && (
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", padding: "4px 8px", borderRadius: 4,
                    background: s.status === "DONE" ? "rgba(242,237,228,0.08)" : s.status === "NEXT" ? TEAL : "rgba(242,237,228,0.08)",
                    color: s.status === "NEXT" ? PAPER : "rgba(242,237,228,0.65)",
                    border: s.status === "DONE" ? "1px solid rgba(242,237,228,0.12)" : "none",
                  }}>{s.status}</span>
                )}
              </div>
            ))}
          </div>

          <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{pulseTitle}</div>
            {pulse.map((p, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "32px 1fr 60px", gap: 12, alignItems: "center", padding: "12px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)" }}>
                <div style={{ width: 32, height: 32, borderRadius: 999, background: "#efece6" }} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>{p.who}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", marginTop: 1 }}>{p.sub}</div>
                </div>
                <Sparkline data={p.trend} />
              </div>
            ))}
          </div>
        </div>

        {extraSections && extraSections.map((x, i) => (
          <div key={i} style={{ marginTop: 20, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 24 }}>
            <div style={{ fontSize: 14, fontWeight: 500, marginBottom: 16 }}>{x.title}</div>
            {x.render()}
          </div>
        ))}
      </main>
      </div>
      <Footer />
    </div>
  );
}

function Sparkline({ data, width = 60, height = 22, color = TEAL }) {  const max = Math.max(...data, 1);
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * width;
    const y = height - (v / max) * height;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline fill="none" stroke={color} strokeWidth="1.5" points={pts} />
    </svg>
  );
}

// ProfileHero — shared hero for all profile pages. Cover photo + avatar overlap + identity + score.
// Uses existing Card padding/typographic system. `stats` is [[k, l], ...] shown in the KPI strip.
function ProfileHero({ eyebrow, name, headline, pills, score, scoreLabel = "COACH SCORE", scoreCaption, stats, cover, avatar }) {
  // Gradient fallback for cover if no image is supplied. Teal→deep-brown diagonal, subtle noise via layered gradients.
  const coverBg = cover
    ? `url(${cover}) center/cover no-repeat`
    : `linear-gradient(135deg, rgba(30,192,168,0.45) 0%, rgba(30,192,168,0.08) 40%, rgba(26,22,18,0.9) 100%), radial-gradient(1200px 400px at 20% 20%, rgba(242,237,228,0.12), transparent 60%), #221d18`;
  const avatarBg = avatar ? `url(${avatar}) center/cover no-repeat` : "#efece6";
  return (
    <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, marginBottom: 20, overflow: "hidden" }}>
      {/* Cover */}
      <div style={{ position: "relative", height: 200, background: coverBg }}>
        <button style={{
          position: "absolute", top: 16, right: 16,
          background: "rgba(26,22,18,0.72)", color: INK, border: "1px solid rgba(242,237,228,0.18)",
          padding: "8px 14px", borderRadius: 999, fontFamily: sans, fontSize: 12, cursor: "pointer",
          display: "flex", alignItems: "center", gap: 6, backdropFilter: "blur(8px)",
        }}>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M1.5 9V3.5a1 1 0 0 1 1-1h1l.8-1h3.4l.8 1h1a1 1 0 0 1 1 1V9a1 1 0 0 1-1 1H2.5a1 1 0 0 1-1-1Z" stroke="currentColor" strokeWidth="1.1"/><circle cx="6" cy="6" r="2" stroke="currentColor" strokeWidth="1.1"/></svg>
          Change cover
        </button>
      </div>

      {/* Identity row — avatar overlaps cover; name/pills/score sit fully below */}
      <div style={{ padding: "0 32px 32px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 28, alignItems: "flex-start" }}>
          <div style={{ position: "relative", marginTop: -80 }}>
            <div style={{ width: 160, height: 160, borderRadius: 999, background: avatarBg, border: "4px solid #1a1612", boxShadow: "0 12px 40px -8px rgba(0,0,0,0.5)" }} />
            <button style={{
              position: "absolute", bottom: 4, right: 4,
              width: 36, height: 36, borderRadius: 999,
              background: INK, color: PAPER, border: "2px solid #1a1612",
              display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
            }} title="Change photo">
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M2 10.5V11a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-.5M7 9V2M7 2 4.5 4.5M7 2l2.5 2.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            </button>
          </div>
          <div style={{ paddingTop: 20, minWidth: 0 }}>
            {eyebrow && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 10 }}>{eyebrow}</div>}
            <div style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.03em", lineHeight: 1.1, fontWeight: 400, color: INK, wordBreak: "break-word" }}>{name}</div>
            {pills && pills.length > 0 && (
              <div style={{ marginTop: 14, display: "flex", gap: 8, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", flexWrap: "wrap" }}>
                {pills.map((p, i) => <Pill key={i} tone={p.tone}>{p.label}</Pill>)}
              </div>
            )}
          </div>
          {score != null && (
            <div style={{ textAlign: "right", paddingTop: 20 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.5)", letterSpacing: "0.14em" }}>{scoreLabel}</div>
              <div style={{ fontFamily: serif, fontSize: 56, color: TEAL_BRIGHT, letterSpacing: "-0.03em", lineHeight: 1.05 }}>{score}</div>
              {scoreCaption && <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 4 }}>{scoreCaption}</div>}
            </div>
          )}
        </div>

        {stats && stats.length > 0 && (
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${stats.length},1fr)`, marginTop: 28, paddingTop: 24, borderTop: "1px solid rgba(242,237,228,0.1)" }}>
            {stats.map(([k, l], i) => (
              <div key={i} style={{ borderLeft: i ? "1px solid rgba(242,237,228,0.08)" : "none", padding: i ? "0 0 0 24px" : "0 24px 0 0" }}>
                <div style={{ fontFamily: serif, fontSize: 36, letterSpacing: "-0.02em", lineHeight: 1 }}>{k}</div>
                <div style={{ fontSize: 12, color: "rgba(242,237,228,0.55)", marginTop: 8 }}>{l}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// BioCard — editable-feeling bio block. Label eyebrow, long-form body, char counter, edit CTA.
function BioCard({ body, charLimit = 500 }) {
  const chars = body ? body.length : 0;
  return (
    <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 28, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", marginBottom: 14 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Bio</div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.5)", letterSpacing: "0.08em" }}>{chars} / {charLimit}</div>
          <span style={{ fontSize: 12, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.08em", cursor: "pointer" }}>EDIT</span>
        </div>
      </div>
      <div style={{ fontFamily: serif, fontSize: 20, lineHeight: 1.5, color: "rgba(242,237,228,0.88)", letterSpacing: "-0.005em", textWrap: "pretty" }}>{body}</div>
    </div>
  );
}

// SubscriptionCard — full-width profile card for the coach's monthly subscription offer.
// Editable price placeholder ($-- /mo) + muted explainer + check-listed perks.
function SubscriptionCard({ price = "--", cadence = "mo", caption = "Set your own monthly subscription price", includes = [] }) {
  return (
    <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, padding: 28, marginBottom: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>Subscription</div>
        <span style={{ fontSize: 11, color: TEAL_BRIGHT, fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.12em", cursor: "pointer", border: `1px solid ${TEAL}`, padding: "4px 10px", borderRadius: 4 }}>EDIT</span>
      </div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <div style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.03em", fontWeight: 400, lineHeight: 1 }}>${price}</div>
        <div style={{ fontSize: 14, color: "rgba(242,237,228,0.55)" }}>/{cadence}</div>
      </div>
      <div style={{ fontSize: 13, color: "rgba(242,237,228,0.55)", marginTop: 8 }}>{caption}</div>
      <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid rgba(242,237,228,0.08)" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.5)", marginBottom: 14 }}>WHAT'S INCLUDED</div>
        <div style={{ display: "grid", gap: 10 }}>
          {includes.map((item, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 14 }}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ flexShrink: 0 }}>
                <path d="M2.5 7.2 5.5 10l6-6.5" stroke={TEAL_BRIGHT} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span>{item}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Recent payouts — 3-col table (date · middle meta · amount). Matches schedule/pulse row rhythm.
function RecentPayouts({ rows }) {
  return (
    <div>
      {rows.map((r, i) => (
        <div key={i} style={{
          display: "grid", gridTemplateColumns: "1fr 1fr auto", gap: 12, alignItems: "center",
          padding: "16px 4px", borderTop: i === 0 ? "none" : "1px solid rgba(242,237,228,0.06)",
        }}>
          <div style={{ fontSize: 14, fontWeight: 500 }}>{r.date}</div>
          <div style={{ fontSize: 13, color: "rgba(242,237,228,0.55)", textAlign: "center" }}>{r.mid}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 14, fontWeight: 500, letterSpacing: "-0.01em" }}>{r.amount}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { DashShell, DashPage, DashSidebar, Sparkline, Card, SectionTitle, Pill, RecentPayouts, ProfileHero, BioCard, SubscriptionCard });
