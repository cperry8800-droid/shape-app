// Shared Direction-B primitives for Marketplace + Community pages
const PAPER = "#1a1612";
const INK = "#f2ede4";
const TEAL = "#1ec0a8";
const TEAL_BRIGHT = "#2ee0c4";
const serif = "'Fraunces', 'Instrument Serif', serif";
const sans = "'Space Grotesk', sans-serif";

function Ph({ label, ratio = "1/1", tone = "dark", style = {} }) {
  const bg = tone === "dark" ? "#0f1513" : "#efece6";
  const fg = tone === "dark" ? "rgba(255,255,255,0.4)" : "rgba(242,237,228,0.4)";
  const stripe = tone === "dark"
    ? "repeating-linear-gradient(135deg, rgba(255,255,255,0.05) 0 1px, transparent 1px 10px)"
    : "repeating-linear-gradient(135deg, rgba(0,0,0,0.05) 0 1px, transparent 1px 10px)";
  return (
    <div style={{ aspectRatio: ratio, background: bg, backgroundImage: stripe, borderRadius: 4, position: "relative", overflow: "hidden", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: fg, textTransform: "uppercase", ...style }}>
      <span style={{ position: "absolute", top: 10, left: 12 }}>{label}</span>
    </div>
  );
}

function Logo({ variant = "black", size = 28 }) {
  const src = variant === "white" ? "/shape-logo-new-white.png?v=3"
    : variant === "black" ? "/shape-logo-new-black.png?v=3"
    : "/shape-logo-new-white.png?v=3";
  // New logo has the play-icon stacked above the SHAPE wordmark (aspect ~1.87:1), not inline like the old one.
  // Scale so the overall mark reads at a comparable visual weight to the previous inline logo.
  const h = Math.round(size * 1.8);
  return <img src={src} alt="Shape" style={{ height: h, width: "auto", display: "block" }} />;
}

function NavDropdown({ label, items, active, activeMatch }) {
  const [open, setOpen] = React.useState(false);
  const isActive = activeMatch.includes(active);
  return (
    <div style={{ position: "relative" }} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      <a style={{ fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: isActive ? INK : "rgba(242,237,228,0.7)", fontFamily: sans, fontWeight: isActive ? 500 : 400, borderBottom: isActive ? `1.5px solid ${TEAL}` : "1.5px solid transparent", paddingBottom: 5, cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 4 }}>
        {label}<span style={{ fontSize: 7, opacity: 0.6 }}>▾</span>
      </a>
      {open && (
        <div style={{ position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)", paddingTop: 8, minWidth: 220 }}>
          <div style={{ background: "rgba(26,22,18,0.98)", backdropFilter: "blur(14px)", border: "1px solid rgba(242,237,228,0.1)", borderRadius: 8, padding: 10, boxShadow: "0 20px 50px rgba(0,0,0,0.5)" }}>
          {items.map(([n, href]) => (
            <a key={n} href={href} style={{ display: "block", padding: "10px 14px", fontSize: 13, color: "rgba(242,237,228,0.85)", fontFamily: sans, borderRadius: 4, whiteSpace: "nowrap" }}
              onMouseEnter={e => { e.currentTarget.style.background = "rgba(30,192,168,0.12)"; e.currentTarget.style.color = INK; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.color = "rgba(242,237,228,0.85)"; }}
            >{n}</a>
          ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Header({ active }) {
  const link = (name, href) => (
    <a href={href} style={{ fontSize: 10.5, letterSpacing: "0.11em", textTransform: "uppercase", color: active === name ? INK : "rgba(242,237,228,0.7)", fontFamily: sans, fontWeight: active === name ? 500 : 400, borderBottom: active === name ? `1.5px solid ${TEAL}` : "1.5px solid transparent", paddingBottom: 5, whiteSpace: "nowrap" }}>{name}</a>
  );
  return (
    <header style={{ position: "sticky", top: 0, zIndex: 50, background: "rgba(26,22,18,0.92)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
      <div style={{ maxWidth: 1400, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 40px", gap: 32 }}>
        <a href="index.html" style={{ flex: "none", display: "inline-flex" }}><Logo variant="white" size={50} /></a>
        <nav style={{ display: "flex", gap: 22, alignItems: "center", flexWrap: "nowrap", whiteSpace: "nowrap" }}>
          <NavDropdown label="Clients" active={active} activeMatch={["Clients", "My Profile", "Overview", "Dashboard", "Client Overview", "Client Dashboard"]} items={[["Overview", "Client.html"], ["Dashboard", "ClientDashboard.html"]]} />
          <NavDropdown label="Trainers" active={active} activeMatch={["Trainers", "Trainer Profile", "Trainer Overview", "Trainer Dashboard"]} items={[["Overview", "Coach.html"], ["Dashboard", "TrainerDashboard.html"]]} />
          <NavDropdown label="Nutritionists" active={active} activeMatch={["Nutritionists", "Nutritionist Profile", "Nutritionist Overview", "Nutritionist Dashboard"]} items={[["Overview", "Nutritionist.html"], ["Dashboard", "NutritionistDashboard.html"]]} />
          {link("Marketplace", "Marketplace.html")}
          {link("Community", "Community.html")}
          <NavDropdown label="Rewards" active={active} activeMatch={["Rewards", "Shape Score", "Store"]} items={[["Shape Score", "Score.html"], ["Shape Store", "Store.html"]]} />
          {link("Radio", "Radio.html")}
          {link("Pricing", "Pricing.html")}
        </nav>
        <div style={{ display: "flex", alignItems: "center", gap: 16, flexShrink: 0 }}>
          <a href="Login.html" style={{ fontSize: 13, color: "rgba(242,237,228,0.7)", fontFamily: sans, whiteSpace: "nowrap" }}>Log in</a>
          <a href="Landing.html" style={{ background: INK, color: PAPER, border: 0, padding: "10px 18px", borderRadius: 6, fontWeight: 500, fontSize: 13, fontFamily: sans, cursor: "pointer", whiteSpace: "nowrap", textDecoration: "none", display: "inline-block" }}>Get started</a>
        </div>
      </div>
    </header>
  );
}

function HeroBg() {
  return (
    <>
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url('/get%20started.png')", backgroundSize: "cover", backgroundPosition: "center 40%", pointerEvents: "none" }} />
      {/* Lighter gradient — let the road image breathe */}
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(26,22,18,0.55) 0%, rgba(26,22,18,0.1) 35%, rgba(26,22,18,0.1) 55%, rgba(26,22,18,0.85) 92%, rgba(26,22,18,1) 100%)", pointerEvents: "none" }} />
    </>
  );
}

function Footer() {
  return (
    <footer style={{ padding: "100px 40px 60px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr 1fr 1fr 1fr", gap: 40, paddingTop: 40, borderTop: "1px solid rgba(26,22,18,0.12)" }}>
          <div>
            <Logo variant="black" size={36} />
            <p style={{ fontFamily: sans, fontSize: 13, color: "rgba(26,22,18,0.55)", marginTop: 16, maxWidth: 280 }}>Real coaches. One marketplace. One platform.</p>
          </div>
          {[["Product", ["Marketplace", "Shape Score", "Radio", "Dashboard"]], ["For trainers", ["Apply", "Payouts", "Programs"]], ["Company", ["About", "Press", "Careers"]], ["Support", ["Help", "Contact", "Privacy"]]].map(([h, items]) => (
            <div key={h}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(26,22,18,0.5)", marginBottom: 16 }}>{h}</div>
              {items.map(x => <div key={x} style={{ fontFamily: sans, fontSize: 13, marginBottom: 8, color: "rgba(26,22,18,0.8)" }}>{x}</div>)}
            </div>
          ))}
        </div>
        <div style={{ marginTop: 60, paddingTop: 24, borderTop: "1px solid rgba(26,22,18,0.08)", display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.12em", color: "rgba(26,22,18,0.5)" }}>
          <span>© 2026 SHAPE</span>
          <span>BROOKLYN · LISBON · MELBOURNE</span>
        </div>
      </div>
    </footer>
  );
}

Object.assign(window, { PAPER, INK, TEAL, TEAL_BRIGHT, serif, sans, Ph, Logo, Header, Footer, HeroBg });

// -----------------------------------------------------------------------------
// Calendar overlay — shared across Client / Trainer / Nutritionist pages.
// Week + Month views. Filters by role-relevant event types.
// Usage:
//   const cal = useCalendarOverlay();
//   ...
//   <a onClick={cal.open}>Open calendar →</a>
//   <CalendarOverlay {...cal.props} role="client" events={EVENTS} />
// Event shape: { date: "2026-04-18", time: "09:00" | null, kind, title, sub, with? }
// kind ∈ WORKOUT | MEAL | CHECKIN | SESSION | CONSULT | REVIEW | PLAN | ADMIN
// -----------------------------------------------------------------------------

function useCalendarOverlay() {
  const [open, setOpen] = React.useState(false);
  return {
    open: (e) => { if (e) e.preventDefault(); setOpen(true); },
    close: () => setOpen(false),
    props: { open, onClose: () => setOpen(false) },
  };
}

const KIND_COLORS = {
  WORKOUT:  "#1ec0a8",
  SESSION:  "#1ec0a8",
  MEAL:     "#e8b54a",
  PLAN:     "#e8b54a",
  CONSULT:  "#c084e8",
  CHECKIN:  "#6fb5ff",
  REVIEW:   "#6fb5ff",
  ADMIN:    "rgba(242,237,228,0.5)",
};
const KIND_LABEL = { WORKOUT:"Workout", MEAL:"Meal", CHECKIN:"Check-in", SESSION:"Session", CONSULT:"Consult", REVIEW:"Review", PLAN:"Plan", ADMIN:"Admin" };

function ymd(d) { return d.toISOString().slice(0,10); }
function startOfWeek(d) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon-start
  x.setDate(x.getDate() - day); x.setHours(0,0,0,0);
  return x;
}
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate()+n); return x; }
function fmtMonth(d) { return d.toLocaleDateString("en-US", { month: "long", year: "numeric" }); }
function fmtWeekRange(s) {
  const e = addDays(s, 6);
  const sm = s.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const em = e.toLocaleDateString("en-US", { month: s.getMonth()===e.getMonth() ? undefined : "short", day: "numeric" });
  return `${sm} – ${em}, ${e.getFullYear()}`;
}

function CalendarOverlay({ open, onClose, role = "client", events = [], anchorDate = "2026-04-18" }) {
  const [view, setView] = React.useState("week"); // "week" | "month"
  const [cursor, setCursor] = React.useState(() => new Date(anchorDate + "T00:00:00"));
  const [selected, setSelected] = React.useState(null); // { event, anchor: {x,y,w,h} }
  const today = new Date(anchorDate + "T00:00:00");

  const byDate = React.useMemo(() => {
    const m = {};
    events.forEach(e => { (m[e.date] = m[e.date] || []).push(e); });
    Object.values(m).forEach(list => list.sort((a,b) => (a.time||"00:00").localeCompare(b.time||"00:00")));
    return m;
  }, [events]);

  if (!open) return null;

  const shift = (dir) => {
    setSelected(null);
    if (view === "week") setCursor(addDays(cursor, 7*dir));
    else { const x = new Date(cursor); x.setMonth(x.getMonth()+dir); setCursor(x); }
  };
  const setViewAndClose = (v) => { setSelected(null); setView(v); };
  const goToday = () => { setSelected(null); setCursor(today); };

  const roleLabel = { client: "My calendar", trainer: "Coaching calendar", nutritionist: "Nutrition calendar" }[role] || "Calendar";

  return (
    <div role="dialog" aria-modal="true"
      style={{ position: "fixed", inset: 0, zIndex: 200, background: "rgba(10,10,8,0.92)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", display: "flex", alignItems: "flex-start", justifyContent: "center", padding: "40px 24px", overflow: "auto" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ width: "min(1200px, 100%)", background: PAPER, color: INK, border: "1px solid rgba(242,237,228,0.1)", borderRadius: 14, boxShadow: "0 40px 120px rgba(0,0,0,0.6)", fontFamily: sans, overflow: "hidden", margin: "auto" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "22px 28px", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.18em", color: TEAL_BRIGHT }}>{roleLabel.toUpperCase()}</div>
            <div style={{ fontFamily: serif, fontSize: 26, letterSpacing: "-0.02em" }}>{view === "week" ? fmtWeekRange(startOfWeek(cursor)) : fmtMonth(cursor)}</div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ display: "inline-flex", border: "1px solid rgba(242,237,228,0.15)", borderRadius: 999, padding: 3 }}>
              {["week","month"].map(v => (
                <button key={v} onClick={() => setViewAndClose(v)}
                  style={{ background: view===v ? INK : "transparent", color: view===v ? PAPER : INK, border: 0, padding: "6px 16px", borderRadius: 999, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.04em", cursor: "pointer", textTransform: "capitalize" }}>{v}</button>
              ))}
            </div>
            <button onClick={goToday} style={{ background: "transparent", color: "rgba(242,237,228,0.8)", border: "1px solid rgba(242,237,228,0.15)", padding: "7px 14px", borderRadius: 999, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>Today</button>
            <div style={{ display: "inline-flex", gap: 2 }}>
              <button onClick={() => shift(-1)} style={navArrowStyle}>‹</button>
              <button onClick={() => shift(1)} style={navArrowStyle}>›</button>
            </div>
            <button onClick={onClose} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.6)", border: 0, fontSize: 22, padding: "2px 10px", cursor: "pointer", marginLeft: 6 }}>×</button>
          </div>
        </div>

        {/* Legend */}
        <div style={{ display: "flex", gap: 18, padding: "12px 28px", borderBottom: "1px solid rgba(242,237,228,0.06)", flexWrap: "wrap" }}>
          {legendForRole(role).map(k => (
            <div key={k} style={{ display: "inline-flex", alignItems: "center", gap: 8, fontSize: 11.5, fontFamily: sans, color: "rgba(242,237,228,0.65)" }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, background: KIND_COLORS[k] }} />
              {KIND_LABEL[k]}
            </div>
          ))}
        </div>

        {/* Body */}
        {view === "week" ? <WeekView start={startOfWeek(cursor)} byDate={byDate} today={today} onSelect={setSelected} /> : <MonthView cursor={cursor} byDate={byDate} today={today} onSelect={setSelected} />}

        {selected && <EventPopover selection={selected} role={role} onClose={() => setSelected(null)} />}
      </div>
    </div>
  );
}

const navArrowStyle = { background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.15)", width: 32, height: 32, borderRadius: 999, fontFamily: sans, fontSize: 16, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", lineHeight: 1 };

function legendForRole(role) {
  if (role === "trainer") return ["SESSION","CHECKIN","REVIEW","ADMIN"];
  if (role === "nutritionist") return ["CONSULT","PLAN","REVIEW","ADMIN"];
  return ["WORKOUT","MEAL","CHECKIN"];
}

function WeekView({ start, byDate, today, onSelect }) {
  const days = Array.from({length: 7}, (_, i) => addDays(start, i));
  const hours = Array.from({length: 14}, (_, i) => i + 7); // 7am – 8pm
  return (
    <div style={{ padding: "0 28px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "56px repeat(7, 1fr)", borderTop: "1px solid rgba(242,237,228,0.08)", borderLeft: "1px solid rgba(242,237,228,0.08)" }}>
        <div />
        {days.map(d => {
          const isToday = ymd(d) === ymd(today);
          return (
            <div key={d.toString()} style={{ padding: "14px 12px", borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", background: isToday ? "rgba(30,192,168,0.06)" : "transparent" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: isToday ? TEAL_BRIGHT : "rgba(242,237,228,0.55)" }}>{d.toLocaleDateString("en-US", { weekday: "short" }).toUpperCase()}</div>
              <div style={{ fontFamily: serif, fontSize: 22, marginTop: 4, color: isToday ? INK : "rgba(242,237,228,0.8)" }}>{d.getDate()}</div>
            </div>
          );
        })}

        {hours.map(h => (
          <React.Fragment key={h}>
            <div style={{ padding: "8px 8px 0", borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.05)", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(242,237,228,0.4)", minHeight: 54 }}>
              {h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h-12} PM`}
            </div>
            {days.map(d => {
              const list = (byDate[ymd(d)] || []).filter(e => e.time && Number(e.time.slice(0,2)) === h);
              return (
                <div key={d.toString()+h} style={{ position: "relative", borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.05)", minHeight: 54, padding: 4 }}>
                  {list.map((e, i) => (
                    <EventChip key={i} e={e} onSelect={onSelect} />
                  ))}
                </div>
              );
            })}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}

function EventChip({ e, compact, onSelect }) {
  const color = KIND_COLORS[e.kind] || TEAL;
  const handle = (ev) => {
    ev.stopPropagation();
    if (!onSelect) return;
    const r = ev.currentTarget.getBoundingClientRect();
    onSelect({ event: e, anchor: { x: r.left, y: r.top, w: r.width, h: r.height } });
  };
  return (
    <button type="button" onClick={handle} title={`${e.title}${e.sub ? " — " + e.sub : ""}`}
      style={{ display: "block", width: "100%", textAlign: "left", background: "rgba(242,237,228,0.04)", borderLeft: `3px solid ${color}`, borderTop: 0, borderRight: 0, borderBottom: 0, padding: compact ? "3px 6px" : "6px 8px", borderRadius: 3, marginBottom: 3, cursor: "pointer", overflow: "hidden", fontFamily: "inherit", color: "inherit" }}
      onMouseEnter={(ev) => { ev.currentTarget.style.background = "rgba(242,237,228,0.08)"; }}
      onMouseLeave={(ev) => { ev.currentTarget.style.background = "rgba(242,237,228,0.04)"; }}>
      <div style={{ display: "flex", gap: 6, alignItems: "baseline" }}>
        {e.time && <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: "rgba(242,237,228,0.55)" }}>{e.time}</span>}
        <span style={{ fontSize: compact ? 10.5 : 12, fontWeight: 500, color: INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.title}</span>
      </div>
      {!compact && e.sub && <div style={{ fontSize: 10.5, color: "rgba(242,237,228,0.5)", marginTop: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{e.sub}</div>}
    </button>
  );
}

function MonthView({ cursor, byDate, today, onSelect }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks = 6;
  const cells = Array.from({length: weeks*7}, (_, i) => addDays(gridStart, i));
  const weekdays = ["MON","TUE","WED","THU","FRI","SAT","SUN"];
  return (
    <div style={{ padding: "0 28px 28px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderBottom: "1px solid rgba(242,237,228,0.08)" }}>
        {weekdays.map(w => <div key={w} style={{ padding: "12px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color: "rgba(242,237,228,0.55)" }}>{w}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", borderLeft: "1px solid rgba(242,237,228,0.08)" }}>
        {cells.map((d, i) => {
          const inMonth = d.getMonth() === cursor.getMonth();
          const isToday = ymd(d) === ymd(today);
          const list = byDate[ymd(d)] || [];
          return (
            <div key={i} style={{ minHeight: 112, borderRight: "1px solid rgba(242,237,228,0.08)", borderBottom: "1px solid rgba(242,237,228,0.08)", padding: 8, background: isToday ? "rgba(30,192,168,0.06)" : "transparent", opacity: inMonth ? 1 : 0.35 }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: isToday ? TEAL_BRIGHT : "rgba(242,237,228,0.7)", marginBottom: 4 }}>{d.getDate()}</div>
              {list.slice(0,3).map((e, j) => <EventChip key={j} e={e} compact onSelect={onSelect} />)}
              {list.length > 3 && <div style={{ fontSize: 10.5, color: "rgba(242,237,228,0.5)", paddingLeft: 4, marginTop: 2 }}>+{list.length-3} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function actionsForEvent(role, kind) {
  // Returns [{ label, primary? }]
  if (role === "client") {
    if (kind === "WORKOUT") return [{ label: "Start workout", primary: true }, { label: "View plan" }, { label: "Reschedule" }];
    if (kind === "MEAL")    return [{ label: "Log meal", primary: true }, { label: "Swap meal" }, { label: "See macros" }];
    if (kind === "CHECKIN") return [{ label: "Join call", primary: true }, { label: "Message coach" }, { label: "Reschedule" }];
  }
  if (role === "trainer") {
    if (kind === "SESSION") return [{ label: "Join session", primary: true }, { label: "Open client" }, { label: "Reschedule" }];
    if (kind === "CHECKIN") return [{ label: "Join check-in", primary: true }, { label: "Open notes" }, { label: "Reschedule" }];
    if (kind === "REVIEW")  return [{ label: "Open review", primary: true }, { label: "Message client" }];
    if (kind === "ADMIN")   return [{ label: "Mark done", primary: true }, { label: "Edit" }];
  }
  if (role === "nutritionist") {
    if (kind === "CONSULT") return [{ label: "Join consult", primary: true }, { label: "Open client" }, { label: "Reschedule" }];
    if (kind === "PLAN")    return [{ label: "Open plan", primary: true }, { label: "Send to client" }];
    if (kind === "REVIEW")  return [{ label: "Open review", primary: true }, { label: "Message client" }];
    if (kind === "ADMIN")   return [{ label: "Mark done", primary: true }, { label: "Edit" }];
  }
  return [{ label: "View details", primary: true }];
}

function fmtTimeRange(time, duration) {
  if (!time) return "All day";
  const [h, m] = time.split(":").map(Number);
  const start = new Date(2026, 0, 1, h, m);
  const end = new Date(start.getTime() + (duration || 60) * 60000);
  const fmt = (d) => {
    const hh = d.getHours();
    const mm = d.getMinutes().toString().padStart(2, "0");
    const ap = hh >= 12 ? "PM" : "AM";
    const hh12 = ((hh + 11) % 12) + 1;
    return `${hh12}:${mm} ${ap}`;
  };
  return `${fmt(start)} – ${fmt(end)}`;
}

function fmtLongDate(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

function EventPopover({ selection, role, onClose }) {
  const { event: e, anchor } = selection;
  const popRef = React.useRef(null);
  const [pos, setPos] = React.useState(() => {
    // Initial guess — useLayoutEffect will refine once we know size
    return { left: anchor.x + anchor.w + 10, top: anchor.y - 4 };
  });

  React.useEffect(() => {
    const onKey = (ev) => { if (ev.key === "Escape") onClose(); };
    const onClick = (ev) => { if (popRef.current && !popRef.current.contains(ev.target)) onClose(); };
    window.addEventListener("keydown", onKey);
    const t = setTimeout(() => window.addEventListener("mousedown", onClick), 0);
    return () => { window.removeEventListener("keydown", onKey); clearTimeout(t); window.removeEventListener("mousedown", onClick); };
  }, [onClose]);

  React.useLayoutEffect(() => {
    if (!popRef.current) return;
    const r = popRef.current.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;
    let left = anchor.x + anchor.w + 10;
    let top = anchor.y - 4;
    if (left + r.width > vw - 16) left = Math.max(16, anchor.x - r.width - 10);
    if (left < 16) left = 16;
    if (top + r.height > vh - 16) top = Math.max(16, vh - r.height - 16);
    if (top < 16) top = 16;
    setPos({ left, top });
  }, [anchor.x, anchor.y, anchor.w, anchor.h]);

  const color = KIND_COLORS[e.kind] || TEAL;
  const actions = actionsForEvent(role, e.kind);

  const node = (
    <div ref={popRef}
      onClick={(ev) => ev.stopPropagation()}
      onMouseDown={(ev) => ev.stopPropagation()}
      style={{
        position: "fixed", left: pos.left, top: pos.top,
        width: 320, background: "#1a1612", color: INK,
        border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10,
        boxShadow: "0 24px 60px rgba(0,0,0,0.55)",
        zIndex: 300, overflow: "hidden", fontFamily: sans,
      }}>
      <div style={{ height: 3, background: color }} />
      <div style={{ padding: "16px 18px 6px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, letterSpacing: "0.14em", color }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {(KIND_LABEL[e.kind] || e.kind || "").toUpperCase()}
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: "transparent", color: "rgba(242,237,228,0.5)", border: 0, fontSize: 18, padding: "0 4px", cursor: "pointer", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ fontFamily: serif, fontSize: 22, letterSpacing: "-0.02em", lineHeight: 1.15, marginBottom: 8 }}>{e.title}</div>
        <div style={{ fontSize: 12.5, color: "rgba(242,237,228,0.65)", marginBottom: 4 }}>{fmtLongDate(e.date)}</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{fmtTimeRange(e.time, e.duration)}</div>
      </div>

      {(e.sub || e.with || e.location) && (
        <div style={{ padding: "12px 18px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "grid", gap: 6 }}>
          {e.with && (
            <div style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
              <span style={{ color: "rgba(242,237,228,0.5)", width: 56, flexShrink: 0 }}>With</span>
              <span>{e.with}</span>
            </div>
          )}
          {e.location && (
            <div style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
              <span style={{ color: "rgba(242,237,228,0.5)", width: 56, flexShrink: 0 }}>Where</span>
              <span>{e.location}</span>
            </div>
          )}
          {e.sub && (
            <div style={{ display: "flex", gap: 10, fontSize: 12.5 }}>
              <span style={{ color: "rgba(242,237,228,0.5)", width: 56, flexShrink: 0 }}>Details</span>
              <span style={{ color: "rgba(242,237,228,0.85)" }}>{e.sub}</span>
            </div>
          )}
        </div>
      )}

      <div style={{ padding: "12px 14px 14px", borderTop: "1px solid rgba(242,237,228,0.08)", display: "flex", flexWrap: "wrap", gap: 8 }}>
        {actions.map((a, i) => (
          a.primary ? (
            <button key={i} onClick={onClose}
              style={{ background: TEAL, color: PAPER, border: 0, padding: "9px 14px", borderRadius: 4, fontFamily: sans, fontSize: 12, fontWeight: 500, letterSpacing: "0.03em", cursor: "pointer" }}>
              {a.label} <span style={{ marginLeft: 4 }}>→</span>
            </button>
          ) : (
            <button key={i} onClick={onClose}
              style={{ background: "transparent", color: "rgba(242,237,228,0.85)", border: "1px solid rgba(242,237,228,0.18)", padding: "9px 14px", borderRadius: 4, fontFamily: sans, fontSize: 12, cursor: "pointer" }}>
              {a.label}
            </button>
          )
        ))}
      </div>
    </div>
  );
  return ReactDOM.createPortal(node, document.body);
}

Object.assign(window, { CalendarOverlay, useCalendarOverlay });