// Hide the horizontal scrollbar on the availability grid (scroll still works).
(function () {
  if (typeof document === 'undefined' || document.getElementById('dash-hide-scroll-css')) return;
  var s = document.createElement('style');
  s.id = 'dash-hide-scroll-css';
  s.textContent = '.dash-hide-scroll{scrollbar-width:none;-ms-overflow-style:none}.dash-hide-scroll::-webkit-scrollbar{display:none;width:0;height:0}';
  document.head.appendChild(s);
})();

// Schedule v2 — the pro PLANNING view (dashboard-v2 gap step). A dedicated
// page (NOT the Today summary) for both coach roles: a full month/week
// calendar with sessions + consults color-coded BY CLIENT, click any event →
// the shared client drawer, drag an event to another day to reschedule (with
// a client notification), and an availability-blocks editor that feeds the
// marketplace profile. Today's schedule stays the daily summary.
//
// Data: /api/calendar (sessions carry clientId + name + reschedulable;
// manual calendar_events are editable; pushed workouts/meals are read-only),
// /api/sessions/manage (action 'reschedule' — coach-only, notifies the
// client), /api/my-availability?role= (the same weekly slots the marketplace
// reads). useDashboard(role) supplies the roster for the drawer. Demo under
// the band when signed out.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals →
// dashData → dashToday (DashDemoBand/helpers) → dashGoals → dashRoster
// (DashClientDrawer) → this.

const DSC_INK50 = "rgba(242,237,228,0.55)";
const DSC_MONO = "'JetBrains Mono', monospace";
const DSC_TEAL = "#2ee0c4";
const DSC_DAY = 86400000;
const DSC_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Client palette. The page builds a colorOf() that assigns palette colors by
// the DISTINCT clients on the visible calendar (first → palette[0], …) so no
// two clients on screen ever share a color until there are >10. dscClientColor
// is the deterministic hash fallback (overflow + standalone callers).
const DSC_PALETTE = ["#2ee0c4", "#d8a23a", "#c0533b", "#8a5cf6", "#7bbf5a", "#7ed4ff", "#e0644b", "#f5a0c8", "#9be3a8", "#ffb46b"];
function dscClientColor(key) {
  const s = String(key || "—");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return DSC_PALETTE[h % DSC_PALETTE.length];
}
// Build an order-stable color map from the events' distinct client keys.
function dscColorMap(events) {
  const order = [];
  const seen = new Set();
  for (const e of events || []) {
    const k = e.clientId || e.with || e.title;
    if (k && !seen.has(k)) { seen.add(k); order.push(k); }
  }
  const map = new Map();
  order.forEach((k, i) => map.set(k, i < DSC_PALETTE.length ? DSC_PALETTE[i] : dscClientColor(k)));
  return (key) => map.get(key) || dscClientColor(key);
}
function dscIso(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
function dscMonday(d) { const x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function dscFmt12(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (isNaN(h)) return null;
  return (h % 12 === 0 ? 12 : h % 12) + ":" + String(m || 0).padStart(2, "0") + (h >= 12 ? "p" : "a");
}

// ── Demo dataset (signed out — under the band) ──────────────────────────────
const DSC_DEMO = (() => {
  const mon = dscMonday(new Date());
  const at = (dayOffset, time, kind, title, client, sub) => ({
    id: "demo-" + dayOffset + "-" + time, source: kind === "WORKOUT" ? "plan" : "session",
    sessionId: "demo-s-" + dayOffset, reschedulable: kind !== "WORKOUT", editable: false,
    kind, title, sub: sub || "", date: dscIso(new Date(mon.getTime() + dayOffset * DSC_DAY)),
    time, durationMin: kind === "CONSULT" ? 30 : 60, with: client, clientId: "demo-" + client.split(" ")[0].toLowerCase(), status: "confirmed",
  });
  return {
    events: [
      at(0, "07:00", "SESSION", "Lower pull", "Priya S.", "remote"),
      at(0, "17:30", "SESSION", "Upper push", "Deandre K.", "studio"),
      at(1, "09:00", "CONSULT", "Monthly review", "Aisha K.", "video"),
      at(1, "18:00", "SESSION", "Deadlift work", "Marcus T.", "studio"),
      at(2, "07:00", "SESSION", "Tempo run", "Priya S.", "remote"),
      at(2, "14:00", "CONSULT", "Intake call", "Sam R.", "new client"),
      at(3, "10:00", "SESSION", "Squat assessment", "Jordan M.", "studio"),
      at(3, "19:00", "SESSION", "Conditioning", "Nadia P.", "remote"),
      at(4, "08:00", "SESSION", "Long run", "Priya S.", "remote"),
      at(4, "16:30", "CONSULT", "Plan delivery", "Elena R.", "video"),
      at(6, "10:00", "SESSION", "Open gym", "Deandre K.", "studio"),
    ],
    // getDay()-style weekday: Mon=1 … Sat=6 (a Mon-Sat working week).
    availability: [
      { weekday: 1, start_minute: 6 * 60, duration_min: 240 }, { weekday: 1, start_minute: 17 * 60, duration_min: 180 },
      { weekday: 2, start_minute: 8 * 60, duration_min: 300 }, { weekday: 3, start_minute: 6 * 60, duration_min: 240 },
      { weekday: 4, start_minute: 9 * 60, duration_min: 300 }, { weekday: 5, start_minute: 6 * 60, duration_min: 300 },
      { weekday: 6, start_minute: 9 * 60, duration_min: 180 },
    ],
  };
})();

// ── Availability editor — the weekly slots the marketplace reads ────────────
// Slots are hour blocks (start_minute on the hour); toggling rebuilds the
// whole set and POSTs it (the route is delete-all + re-insert).
const DSC_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
// provider_availability.weekday is getDay()-style: 0=Sun … 6=Sat (per the
// migration + what the consultation/booking flow reads). Display Mon-first,
// but STORE the real getDay index so the marketplace booking lines up.
const DSC_AVAIL_DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
function DscAvailability({ role, live, initial }) {
  // A Set of "weekday:hour" keys derived from the loaded slots (each slot
  // covers its duration in hourly cells).
  const seed = () => {
    const set = new Set();
    for (const s of initial || []) {
      const startH = Math.floor(s.start_minute / 60);
      const spanH = Math.max(1, Math.round((s.duration_min || 60) / 60));
      for (let h = startH; h < startH + spanH && h <= 20; h++) set.add(s.weekday + ":" + h);
    }
    return set;
  };
  const [cells, setCells] = React.useState(seed);
  const [state, setState] = React.useState("");
  React.useEffect(() => { setCells(seed()); }, [JSON.stringify(initial)]);

  // Persist: collapse contiguous hour cells per weekday into {start,duration}.
  const persist = async (next) => {
    setCells(next);
    if (!live) { setState("demo"); return; }
    const slots = [];
    for (let wd = 0; wd < 7; wd++) {
      const hrs = DSC_HOURS.filter((h) => next.has(wd + ":" + h)).sort((a, b) => a - b);
      let i = 0;
      while (i < hrs.length) {
        let j = i;
        while (j + 1 < hrs.length && hrs[j + 1] === hrs[j] + 1) j++;
        slots.push({ weekday: wd, start_minute: hrs[i] * 60, duration_min: (hrs[j] - hrs[i] + 1) * 60 });
        i = j + 1;
      }
    }
    setState("saving");
    try {
      const res = await fetch("/api/my-availability", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role, slots }),
      });
      setState(res.ok ? "saved" : "error");
    } catch (e) { setState("error"); }
  };
  const toggle = (wd, h) => {
    const k = wd + ":" + h;
    const next = new Set(cells);
    next.has(k) ? next.delete(k) : next.add(k);
    persist(next);
  };
  const blocks = cells.size;
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
        <span className="dash-eyebrow" style={{ color: "#d8a23a" }}>Availability · feeds your marketplace profile</span>
        <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, color: state === "saved" ? "#7bbf5a" : state === "error" ? "#e0644b" : DSC_INK50 }}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved · live on your profile" : state === "error" ? "Couldn't save" : state === "demo" ? "Demo · saves once signed in" : blocks + " open hours/wk"}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: DSC_INK50, lineHeight: 1.5, margin: "8px 0 10px", maxWidth: 560 }}>
        Tap the hours you take clients. This is exactly what shows on your marketplace profile — members book into these blocks.
      </div>
      <div style={{ overflowX: "auto" }} className="dash-roster-scroll dash-hide-scroll">
        <div style={{ display: "grid", gridTemplateColumns: "34px repeat(" + DSC_HOURS.length + ", 1fr)", gap: 3, minWidth: 520 }}>
          <span />
          {DSC_HOURS.map((h) => <span key={h} style={{ fontFamily: DSC_MONO, fontSize: 7, color: DSC_INK50, textAlign: "center" }}>{h % 12 === 0 ? 12 : h % 12}{h >= 12 ? "p" : "a"}</span>)}
          {DSC_AVAIL_DAYS.map(([lbl, wd]) => (
            <React.Fragment key={wd}>
              <span style={{ fontFamily: DSC_MONO, fontSize: 8, color: DSC_INK50, alignSelf: "center" }}>{lbl}</span>
              {DSC_HOURS.map((h) => {
                const on = cells.has(wd + ":" + h);
                return <button key={h} onClick={() => toggle(wd, h)} aria-label={lbl + " " + h} style={{ height: 18, borderRadius: 3, border: "1px solid " + (on ? "rgba(216,162,58,0.5)" : "rgba(242,237,228,0.12)"), background: on ? "#d8a23a" : "transparent", cursor: "pointer", padding: 0 }} />;
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Event chip (draggable) ──────────────────────────────────────────────────
function DscChip({ ev, onClick, onDragStart, compact, colorOf }) {
  const color = (colorOf || dscClientColor)(ev.clientId || ev.with || ev.title);
  const movable = ev.reschedulable || ev.editable;
  return (
    <div
      draggable={movable}
      onDragStart={(e) => { if (movable) { e.dataTransfer.setData("text/plain", ev.id); onDragStart(ev); } }}
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
      title={ev.title + (ev.with ? " · " + ev.with : "") + (movable ? "" : " · read-only")}
      style={{
        display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
        background: color + "22", borderLeft: "3px solid " + color, borderRadius: 3,
        padding: compact ? "2px 5px" : "4px 7px", marginBottom: 3, minWidth: 0,
        opacity: ev.status === "cancelled" ? 0.4 : 1,
      }}
    >
      {ev.time && <span style={{ fontFamily: DSC_MONO, fontSize: compact ? 7.5 : 9, color: DSC_INK50, flexShrink: 0 }}>{dscFmt12(ev.time)}</span>}
      <span style={{ fontSize: compact ? 9.5 : 11.5, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ev.with || ev.title}</span>
      {!movable && <span style={{ fontSize: 8, color: DSC_INK50, flexShrink: 0 }}>🔒︎</span>}
    </div>
  );
}

// ── Month grid ──────────────────────────────────────────────────────────────
function DscMonth({ cursor, byDate, onPickEvent, onDrop, onDrag, dragId, colorOf }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = dscMonday(first);
  const todayIso = dscIso(new Date());
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(new Date(start.getTime() + i * DSC_DAY));
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DSC_DOW.map((d) => <div key={d} style={{ fontFamily: DSC_MONO, fontSize: 8, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50, textAlign: "center" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          const iso = dscIso(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const evs = byDate.get(iso) || [];
          const isToday = iso === todayIso;
          return (
            <div key={i}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); onDrop(iso); }}
              style={{ minHeight: 92, borderRadius: 6, border: "1px solid " + (isToday ? "rgba(46,224,196,0.4)" : "rgba(242,237,228,0.08)"), background: inMonth ? "rgba(242,237,228,0.02)" : "transparent", opacity: inMonth ? 1 : 0.4, padding: 5, overflow: "hidden" }}>
              <div style={{ fontFamily: DSC_MONO, fontSize: 9, color: isToday ? DSC_TEAL : DSC_INK50, marginBottom: 3 }}>{d.getDate()}</div>
              {evs.slice(0, 4).map((ev) => <DscChip key={ev.id} ev={ev} compact colorOf={colorOf} onClick={onPickEvent} onDragStart={onDrag} />)}
              {evs.length > 4 && <div style={{ fontFamily: DSC_MONO, fontSize: 7.5, color: DSC_INK50 }}>+{evs.length - 4} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week view (day columns) ─────────────────────────────────────────────────
function DscWeek({ cursor, byDate, onPickEvent, onDrop, onDrag, dragId, colorOf }) {
  const mon = dscMonday(cursor);
  const todayIso = dscIso(new Date());
  const days = [];
  for (let i = 0; i < 7; i++) days.push(new Date(mon.getTime() + i * DSC_DAY));
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}>
      {days.map((d, i) => {
        const iso = dscIso(d);
        const evs = (byDate.get(iso) || []).slice().sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
        const isToday = iso === todayIso;
        return (
          <div key={i}
            onDragOver={(e) => { if (dragId) e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); onDrop(iso); }}
            style={{ minHeight: 280, borderRadius: 6, border: "1px solid " + (isToday ? "rgba(46,224,196,0.4)" : "rgba(242,237,228,0.08)"), background: "rgba(242,237,228,0.02)", padding: 6 }}>
            <div style={{ fontFamily: DSC_MONO, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: isToday ? DSC_TEAL : DSC_INK50, marginBottom: 6, textAlign: "center" }}>
              {DSC_DOW[i]} {d.getDate()}
            </div>
            {evs.length ? evs.map((ev) => <DscChip key={ev.id} ev={ev} colorOf={colorOf} onClick={onPickEvent} onDragStart={onDrag} />) : <div style={{ fontFamily: DSC_MONO, fontSize: 8, color: DSC_INK50, textAlign: "center", paddingTop: 10 }}>—</div>}
          </div>
        );
      })}
    </div>
  );
}

// Read-only event detail popover (for events without a roster client, or
// read-only pushed workouts/meals).
function DscEventSheet({ ev, onClose, colorOf }) {
  const color = (colorOf || dscClientColor)(ev.clientId || ev.with || ev.title);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 240 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.6)", backdropFilter: "blur(3px)" }} />
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(380px, 92vw)", background: "#14110e", border: "1px solid rgba(242,237,228,0.14)", borderLeft: "4px solid " + color, borderRadius: 10, padding: 22, color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif" }}>
        <div style={{ fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: color }}>{ev.kind}{ev.with ? " · " + ev.with : ""}</div>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, margin: "6px 0 4px" }}>{ev.title}</div>
        <div style={{ fontSize: 12.5, color: DSC_INK50 }}>{[ev.date, ev.time ? dscFmt12(ev.time) : null, ev.durationMin ? ev.durationMin + " min" : null, ev.sub].filter(Boolean).join(" · ")}</div>
        {!(ev.reschedulable || ev.editable) && <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DSC_INK50, marginTop: 10 }}>🔒︎ READ-ONLY — PUSHED FROM THE {ev.kind === "WORKOUT" ? "PROGRAM" : "MEAL PLAN"}; RESCHEDULE THERE</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {ev.meetingUrl && <a href={ev.meetingUrl} target="_blank" rel="noreferrer" style={{ fontFamily: DSC_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "#06231f", background: DSC_TEAL, borderRadius: 4, padding: "10px 14px", textDecoration: "none" }}>Join →</a>}
          <button onClick={onClose} style={{ fontFamily: DSC_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", background: "transparent", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "10px 14px", cursor: "pointer" }}>Close</button>
        </div>
      </div>
    </div>
  );
}

const DSC_ROLES = {
  trainer: { nav: (k) => trainerNavItems(k), payout: () => trainerPayoutCard },
  nutritionist: { nav: (k) => nutriNavItems(k), payout: () => nutriPayoutCard },
};

// ── The page ────────────────────────────────────────────────────────────────
function CoachSchedulePage({ role }) {
  const cfg = DSC_ROLES[role];
  const { triage, today: live, source } = useDashboard(role);
  const [events, setEvents] = React.useState(null);
  const [avail, setAvail] = React.useState(null);
  const [view, setView] = React.useState("month"); // month | week
  const [cursor, setCursor] = React.useState(() => new Date());
  const [drawerRow, setDrawerRow] = React.useState(null);
  const [sheetEv, setSheetEv] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const dragRef = React.useRef(null);
  const [dragId, setDragId] = React.useState(null);
  const isLive = !!live;

  React.useEffect(() => {
    let on = true;
    const j = (p) => fetch(p, { credentials: "same-origin", cache: "no-store" }).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    (async () => {
      const [cal, av] = await Promise.all([j("/api/calendar"), j("/api/my-availability?role=" + role)]);
      if (!on) return;
      if (cal && Array.isArray(cal.events)) setEvents(cal.events);
      if (av && Array.isArray(av.slots)) setAvail(av.slots);
    })();
    return () => { on = false; };
  }, [role]);

  const liveEvents = events != null;
  const allEvents = liveEvents ? events : DSC_DEMO.events;
  const availSlots = avail != null ? avail : (isLive ? [] : DSC_DEMO.availability);
  // Only the coach's own bookings (sessions/consults) + manual events belong
  // on the planning calendar — the client-facing pushed workouts/meals are a
  // client surface, shown read-only if present.
  const planEvents = allEvents.filter((e) => e.kind === "SESSION" || e.kind === "CONSULT" || e.source === "event" || e.kind === "WORKOUT" || e.kind === "MEAL");
  const colorOf = React.useMemo(() => dscColorMap(planEvents), [JSON.stringify(planEvents.map((e) => e.clientId || e.with || e.title))]);
  const byDate = React.useMemo(() => {
    const m = new Map();
    for (const e of planEvents) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); }
    return m;
  }, [JSON.stringify(planEvents)]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2600); };

  const pickEvent = (ev) => {
    // A booking with a roster client → the shared client drawer.
    const row = ev.clientId ? (triage || []).find((r) => r.client.profile.id === ev.clientId) : null;
    if (row && typeof window.DashClientDrawer === "function") { setDrawerRow(row); return; }
    setSheetEv(ev);
  };

  const onDrop = async (dateIso) => {
    const ev = dragRef.current;
    dragRef.current = null; setDragId(null);
    if (!ev || ev.date === dateIso) return;
    if (!(ev.reschedulable || ev.editable)) { showToast(ev.with || ev.title + " is read-only — reschedule it in the program/plan."); return; }
    // Optimistic local move.
    setEvents((prev) => (prev || allEvents).map((e) => (e.id === ev.id ? { ...e, date: dateIso } : e)));
    if (!isLive) { showToast("Demo · would move " + (ev.with || ev.title) + " to " + dateIso + " and notify them."); return; }
    try {
      let res;
      if (ev.source === "session" && ev.sessionId) {
        res = await fetch("/api/sessions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reschedule", sessionId: ev.sessionId, date: dateIso, time: ev.time || null }) });
      } else if (ev.source === "event") {
        res = await fetch("/api/calendar", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: String(ev.id).replace(/^event:/, ""), date: dateIso }) });
      }
      if (res && res.ok) showToast("Moved " + (ev.with || ev.title) + " to " + dateIso + " · " + (ev.with ? ev.with.split(" ")[0] + " notified" : "updated"));
      else throw new Error("HTTP " + (res ? res.status : "—"));
    } catch (e) {
      showToast("Couldn't move it — try again.");
      setEvents((prev) => (prev || []).map((x) => (x.id === ev.id ? { ...x, date: ev.date } : x))); // revert
    }
  };

  const monthLabel = cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const weekLabel = (() => { const m = dscMonday(cursor); const s = new Date(m.getTime() + 6 * DSC_DAY); return m.toLocaleDateString([], { month: "short", day: "numeric" }) + " – " + s.toLocaleDateString([], { month: "short", day: "numeric" }); })();
  const step = (dir) => setCursor((c) => { const n = new Date(c); view === "month" ? n.setMonth(n.getMonth() + dir) : n.setDate(n.getDate() + dir * 7); return n; });

  // Color-key legend: the clients on the visible calendar.
  const legend = [...new Map(planEvents.filter((e) => e.with).map((e) => [e.clientId || e.with, { name: e.with, key: e.clientId || e.with }])).values()].slice(0, 8);
  const btn = (on) => ({ fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: on ? "#06231f" : "rgba(242,237,228,0.7)", background: on ? DSC_TEAL : "transparent", border: on ? 0 : "1px solid rgba(242,237,228,0.18)", borderRadius: 4, padding: "7px 12px", cursor: "pointer" });

  return (
    <React.Fragment>
      {source === "demo" && !liveEvents && <DashDemoBand />}
      <DashPage
        navItems={cfg.nav("schedule")}
        payoutCard={cfg.payout()}
        eyebrow="PLANNING VIEW · DRAG TO RESCHEDULE"
        title="Schedule"
        subtitle="Your whole calendar — sessions and consults color-coded by client. Click any booking for the client, drag it to move it (they're notified), and set the availability members book into."
      >
        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>
          {/* Calendar */}
          <div className="dash-plate dash-plate--tick" style={{ "--dac": role === "nutritionist" ? "#d8a23a" : "#c0533b", paddingLeft: 24, minWidth: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <button onClick={() => step(-1)} aria-label="Previous" style={btn(false)}>‹</button>
                <span style={{ fontFamily: serif, fontSize: 19, letterSpacing: "-0.015em", minWidth: 150 }}>{view === "month" ? monthLabel : weekLabel}</span>
                <button onClick={() => step(1)} aria-label="Next" style={btn(false)}>›</button>
                <button onClick={() => setCursor(new Date())} style={{ ...btn(false), fontSize: 8 }}>Today</button>
              </div>
              <div style={{ display: "flex", gap: 6 }}>
                <button onClick={() => setView("month")} style={btn(view === "month")}>Month</button>
                <button onClick={() => setView("week")} style={btn(view === "week")}>Week</button>
              </div>
            </div>
            {view === "month"
              ? <DscMonth cursor={cursor} byDate={byDate} colorOf={colorOf} onPickEvent={pickEvent} onDrop={onDrop} onDrag={(ev) => { dragRef.current = ev; setDragId(ev.id); }} dragId={dragId} />
              : <DscWeek cursor={cursor} byDate={byDate} colorOf={colorOf} onPickEvent={pickEvent} onDrop={onDrop} onDrag={(ev) => { dragRef.current = ev; setDragId(ev.id); }} dragId={dragId} />}
            {/* Client color legend */}
            {legend.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(242,237,228,0.06)" }}>
                {legend.map((c) => (
                  <span key={c.key} style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: DSC_MONO, fontSize: 8.5, color: DSC_INK50 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 2, background: colorOf(c.key) }} />{c.name}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Availability */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "#d8a23a", paddingLeft: 22 }}>
              <DscAvailability role={role} live={isLive} initial={availSlots} />
            </div>
            <div className="dash-plate" style={{ "--dac": "rgba(242,237,228,0.35)", padding: "14px 16px" }}>
              <div className="dash-eyebrow">How rescheduling works</div>
              <div style={{ fontSize: 12, color: DSC_INK50, lineHeight: 1.55, marginTop: 8 }}>
                Drag a session or consult to a new day — the client gets a notification with the new time. Workouts and meals pushed from a plan are read-only here; move those in the program or meal plan.
              </div>
              <a href={role === "nutritionist" ? "NutritionistDashboard.html" : "TrainerDashboard.html"} style={{ display: "inline-block", marginTop: 10, fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DSC_TEAL, textDecoration: "none" }}>← Today's summary</a>
            </div>
          </div>
        </div>
      </DashPage>

      {drawerRow && typeof window.DashClientDrawer === "function" && <DashClientDrawer row={drawerRow} role={role} onClose={() => setDrawerRow(null)} />}
      {sheetEv && <DscEventSheet ev={sheetEv} colorOf={colorOf} onClose={() => setSheetEv(null)} />}
      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 300, background: "#14110e", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 8, padding: "10px 18px", color: "#f2ede4", fontFamily: "'Space Grotesk', sans-serif", fontSize: 12.5, maxWidth: "90vw" }}>{toast}</div>
      )}
    </React.Fragment>
  );
}

Object.assign(window, { CoachSchedulePage, dscClientColor, dscColorMap });
