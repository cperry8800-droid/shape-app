// Schedule v2 — the pro PLANNING view (dashboard-v2 gap step). A dedicated
// page (NOT the Today summary) for both coach roles: a full month/week
// calendar with sessions + consults color-coded BY CLIENT, click any event →
// the shared client drawer, drag an event to another day to reschedule (with
// a client notification), and an availability-blocks editor that feeds the
// marketplace profile. Today's schedule stays the daily summary.
//
// Data: /api/calendar, a month range at a time with `tz` + `role`, so bookings come back on
// the coach's own clock and the response names the zone (sessions carry clientId + name +
// reschedulable; manual calendar_events are editable; pushed workouts/meals are read-only),
// /api/sessions/manage (action 'reschedule' — coach-only, notifies the
// client), /api/my-availability?role= (the same weekly slots the marketplace
// reads). useDashboard(role) supplies the roster for the drawer. Demo under
// the band when signed out.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals →
// dashData → dashToday (DashDemoBand/helpers) → dashGoals → dashRoster
// (DashClientDrawer) → this.

const DSC_INK50 = "var(--sh-ink2, #a09b94)";
const DSC_MONO = "'JetBrains Mono', monospace";
const DSC_TEAL = "var(--sh-accent, #2ee0c4)";
const DSC_DAY = 86400000;
const DSC_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Client palette. The page builds a colorOf() that assigns palette colors by
// the DISTINCT clients on the visible calendar (first → palette[0], …) so no
// two clients on screen ever share a color until there are >10. dscClientColor
// is the deterministic hash fallback (overflow + standalone callers).
// ⚠ THESE STAY LITERAL, BY RULE RATHER THAN BY OVERSIGHT. A chip composes its
// tint by APPENDING a hex-alpha suffix to the palette entry it was given
// (`color + "22"` in DscChip), so a var() here is not a colour and CSS drops the
// whole declaration — the chip loses its tint AND its left border. Turning these
// into paper tokens means teaching DscChip to take a triplet, which is a change
// of behaviour rather than a rename, and it belongs with the light-paper values
// where the tint actually has to move. They are also a per-CLIENT identity
// palette rather than the paper's own colours, so they do not follow the ground.
// tests/newdesign-paper-tokens.test.mjs holds the rule.
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
function dscRouteDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const date = new Date(value + "T12:00:00");
  return Number.isFinite(date.getTime()) && dscIso(date) === value ? date : null;
}
function dscMonday(d) { const x = new Date(d.getTime()); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; }
function dscFmt12(t) {
  if (!t) return null;
  const [h, m] = String(t).split(":").map(Number);
  if (isNaN(h)) return null;
  return (h % 12 === 0 ? 12 : h % 12) + ":" + String(m || 0).padStart(2, "0") + (h >= 12 ? "p" : "a");
}
// `n` calendar days after `d`, at local midnight.
// ⚠ BY THE CALENDAR, NOT BY 24-HOUR STEPS. The grids used to build their cells as
// `start + i * DSC_DAY`, and on the night the clocks go back a day is 25 hours long: the
// cell after it landed at 23:00 the day before, so the month that contains the change
// showed that Sunday twice and every later cell one day early, under the wrong weekday.
function dscAddDays(d, n) { return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n); }

// ── The range the page loads ────────────────────────────────────────────────
// ⚠ THE PAGE ASKS FOR THE DATES ON SCREEN. It used to load /api/calendar once with no
// range, and the route's default is 60 days either side of today, so a coach who paged
// three months ahead saw an empty calendar that had simply never been asked for. It now
// loads whole MONTHS, keyed "YYYY-MM": the ones the visible grid touches plus a week
// either side, each fetched once and kept, so paging back costs nothing and the next
// week is usually already there. Contiguous missing months go in one request.
const DSC_MARGIN_DAYS = 7;
function dscVisibleRange(view, cursor) {
  const start = view === "month" ? dscMonday(new Date(cursor.getFullYear(), cursor.getMonth(), 1)) : dscMonday(cursor);
  return { from: dscAddDays(start, -DSC_MARGIN_DAYS), to: dscAddDays(start, (view === "month" ? 41 : 6) + DSC_MARGIN_DAYS) };
}
function dscMonthKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); }
function dscNextMonthKey(k) {
  let y = Number(k.slice(0, 4)), m = Number(k.slice(5, 7)) + 1;
  if (m > 12) { m = 1; y += 1; }
  return y + "-" + String(m).padStart(2, "0");
}
function dscMonthsIn(range) {
  const out = [];
  const last = dscMonthKey(range.to);
  for (let k = dscMonthKey(range.from); k <= last; k = dscNextMonthKey(k)) out.push(k);
  return out;
}
// Consecutive months as runs, so one request covers each gap.
function dscMonthRuns(keys) {
  const runs = [];
  for (const k of keys) {
    const run = runs[runs.length - 1];
    if (run && dscNextMonthKey(run[run.length - 1]) === k) run.push(k); else runs.push([k]);
  }
  return runs;
}
function dscMonthEnd(k) { return k + "-" + String(new Date(Number(k.slice(0, 4)), Number(k.slice(5, 7)), 0).getDate()).padStart(2, "0"); }
// One response folded into what is already loaded. Events are keyed by id, so a booking
// dragged into a month that loads later arrives once, with the server's own date.
// ⚠ A RESPONSE IN A DIFFERENT ZONE STARTS THE CACHE OVER. Every booking's `date`/`time` is
// a wall clock in the zone the route names, and the reschedule hands that zone back; a
// coach who re-saves their hours from another zone mid-visit would otherwise get months
// read on two clocks under one label, and drags priced in the wrong one.
function dscMergeRange(prev, res, months) {
  const zone = typeof res.zone === "string" && res.zone ? res.zone : null;
  if (!prev || prev.zone !== zone) return { zone, months: new Set(months), events: res.events.slice() };
  const byId = new Map(prev.events.map((e) => [e.id, e]));
  for (const e of res.events) byId.set(e.id, e);
  return { zone, months: new Set([...prev.months, ...months]), events: [...byId.values()] };
}
// Today's date in the zone the bookings are read in, so the highlighted cell is the day
// the coach's own clock says it is (a coach whose laptop is elsewhere still sees their day).
function dscTodayIn(zone) {
  try {
    if (zone) {
      const s = new Intl.DateTimeFormat("en-CA", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    }
  } catch (e) { /* an unknown zone falls back to this browser's day */ }
  return dscIso(new Date());
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
//
// ⚠ THE GRID IS THE COACH'S OWN CLOCK, AND UNTIL 2026-09-11 NOBODY RECORDED WHICH ONE.
// A stored start_minute is a bare wall-clock minute — toggle "9a" and 540 is written —
// so every reader had to invent a zone, and the live ones disagreed: the website read 540
// as 09:00 UTC while the app read it as 09:00 in the MEMBER's zone. A New York coach who
// opened 9am had members booking 5:00 AM on one surface and 9:00 AM on the other. The
// POST now carries this browser's resolved zone, the route stamps it on the coach's row,
// and the label below names it so a coach can see what they are declaring rather than
// trusting an unqualified "9a".
const DSC_HOURS = [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];
// provider_availability.weekday is getDay()-style: 0=Sun … 6=Sat (per the
// migration + what the consultation/booking flow reads). Display Mon-first,
// but STORE the real getDay index so the marketplace booking lines up.
const DSC_AVAIL_DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
// ⚠ THE LABEL STATES A FACT OR NOTHING. Live, it names the zone the hours are STORED
// against (what members are actually booked in) and falls back to this browser's zone
// only before the first save, marked as the one about to be stamped. In the demo preview
// there is no stored zone and nothing is written, so naming one would be a claim about a
// coach who does not exist.
function dscZoneLabel(live, storedZone) {
  if (!live) return "";
  if (storedZone) return "times in " + storedZone;
  const b = dscBrowserZone();
  return b ? "times will be saved in " + b : "";
}
// This browser's IANA zone. Resolved once per render rather than cached in a module
// constant: a laptop that changes zone mid-session should stamp the new one on the next
// save, not the one it booted in.
function dscBrowserZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || null; } catch (e) { return null; }
}
function DscAvailability({ role, live, initial, storedZone, onZone }) {
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
        // ⚠ WITHOUT THIS THE ROUTE REFUSES THE SAVE — deliberately, because hours nobody
        // can place are hours no member can book, and writing them would report "live on
        // your profile" over availability that renders nowhere.
        body: JSON.stringify({ role, slots, timezone: dscBrowserZone() }),
      });
      setState(res.ok ? "saved" : "error");
      // ⚠ ADOPT THE ZONE THE ROUTE ACTUALLY STORED, rather than assuming the one we sent
      // landed. The label below is a claim about what members are booked in, so it has to
      // come from the write's own answer — and a coach whose laptop changed zone would
      // otherwise keep reading the previous one until a reload. Only on success: a failed
      // save stored nothing, so the old label is still the true one.
      if (res.ok && onZone) {
        const j = await res.json().catch(() => null);
        if (j && typeof j.timezone === "string" && j.timezone) onZone(j.timezone);
      }
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
        <span className="dash-eyebrow" style={{ color: "var(--sh-gold, #d8a23a)" }}>
          Availability · feeds your marketplace profile{dscZoneLabel(live, storedZone) ? " · " + dscZoneLabel(live, storedZone) : ""}
        </span>
        <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, color: state === "saved" ? "var(--sh-green, #7bbf5a)" : state === "error" ? "var(--sh-rust, #e0644b)" : DSC_INK50 }}>
          {state === "saving" ? "Saving…" : state === "saved" ? "Saved · live on your profile" : state === "error" ? "Couldn't save" : state === "demo" ? "Demo · saves once signed in" : blocks + " open hours/wk"}
        </span>
      </div>
      <div style={{ fontSize: 11.5, color: DSC_INK50, lineHeight: 1.5, margin: "8px 0 10px", maxWidth: 560 }}>
        Tap the hours you take clients. This is exactly what shows on your marketplace profile — members book into these blocks.
      </div>
      {/* ⚠ HOURS RUN DOWN, DAYS RUN ACROSS — and the transpose is the fix, not a
          restyle. This plate lives in the Schedule page's 300px rail, and the
          old layout put 15 hour COLUMNS in it behind `minWidth: 520` with the
          scrollbar hidden on purpose: 1p–8p were off-screen with no affordance
          saying so, and the cells that were visible sat ~15px wide, under any
          usable tap target (review 2026-09-09, V2). Seven day columns fit the
          rail with ~35px cells and nothing hidden — and hours-down is the shape
          every calendar uses, so it reads as a week rather than a heatmap. */}
      <div style={{ display: "grid", gridTemplateColumns: "34px repeat(" + DSC_AVAIL_DAYS.length + ", 1fr)", gap: 3 }}>
        <span />
        {DSC_AVAIL_DAYS.map(([lbl]) => <span key={lbl} style={{ fontFamily: DSC_MONO, fontSize: 8, color: DSC_INK50, textAlign: "center" }}>{lbl}</span>)}
        {DSC_HOURS.map((h) => {
          const hLbl = (h % 12 === 0 ? 12 : h % 12) + (h >= 12 ? "p" : "a");
          return (
            <React.Fragment key={h}>
              <span style={{ fontFamily: DSC_MONO, fontSize: 7.5, color: DSC_INK50, alignSelf: "center", textAlign: "right", paddingRight: 2 }}>{hLbl}</span>
              {DSC_AVAIL_DAYS.map(([lbl, wd]) => {
                const on = cells.has(wd + ":" + h);
                return <button key={wd} onClick={() => toggle(wd, h)} aria-label={lbl + " " + hLbl} aria-pressed={on} style={{ height: 22, borderRadius: 3, border: "1px solid " + (on ? "rgba(var(--sh-gold-rgb, 216,162,58),0.5)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.12)"), background: on ? "var(--sh-gold, #d8a23a)" : "transparent", cursor: "pointer", padding: 0 }} />;
              })}
            </React.Fragment>
          );
        })}
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
function DscMonth({ cursor, byDate, onPickEvent, onDrop, onDrag, dragId, colorOf, todayIso = dscIso(new Date()) }) {
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = dscMonday(first);
  const cells = [];
  for (let i = 0; i < 42; i++) cells.push(dscAddDays(start, i));
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
              style={{ minHeight: 92, borderRadius: 6, border: "1px solid " + (isToday ? "rgba(var(--sh-accent-rgb, 46,224,196),0.4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)"), background: inMonth ? "rgba(var(--sh-ink-rgb, 242,237,228),0.02)" : "transparent", opacity: inMonth ? 1 : 0.4, padding: 5, overflow: "hidden" }}>
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
function DscWeek({ cursor, byDate, onPickEvent, onDrop, onDrag, dragId, colorOf, todayIso = dscIso(new Date()) }) {
  const mon = dscMonday(cursor);
  const days = [];
  for (let i = 0; i < 7; i++) days.push(dscAddDays(mon, i));
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
            style={{ minHeight: 280, borderRadius: 6, border: "1px solid " + (isToday ? "rgba(var(--sh-accent-rgb, 46,224,196),0.4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)"), background: "rgba(var(--sh-ink-rgb, 242,237,228),0.02)", padding: 6 }}>
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
      <div style={{ position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(380px, 92vw)", background: "var(--sh-ground2, #14110e)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderLeft: "4px solid " + color, borderRadius: 10, padding: 22, color: "var(--sh-ink, #f2ede4)", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)" }}>
        <div style={{ fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: color }}>{ev.kind}{ev.with ? " · " + ev.with : ""}</div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 23, margin: "6px 0 4px" }}>{ev.title}</div>
        <div style={{ fontSize: 12.5, color: DSC_INK50 }}>{[ev.date, ev.time ? dscFmt12(ev.time) : null, ev.durationMin ? ev.durationMin + " min" : null, ev.sub].filter(Boolean).join(" · ")}</div>
        {!(ev.reschedulable || ev.editable) && <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DSC_INK50, marginTop: 10 }}>🔒︎ READ-ONLY — PUSHED FROM THE {ev.kind === "WORKOUT" ? "PROGRAM" : "MEAL PLAN"}; RESCHEDULE THERE</div>}
        <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
          {ev.meetingUrl && <a href={ev.meetingUrl} target="_blank" rel="noreferrer" style={{ fontFamily: DSC_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-deep, #06231f)", background: DSC_TEAL, borderRadius: 4, padding: "10px 14px", textDecoration: "none" }}>Join →</a>}
          <button onClick={onClose} style={{ fontFamily: DSC_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", background: "transparent", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 4, padding: "10px 14px", cursor: "pointer" }}>Close</button>
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
  // What /api/calendar has answered so far: { zone, months: Set<"YYYY-MM">, events }, or null
  // until the first answer (the demo shows until then). See dscMergeRange.
  const [cal, setCal] = React.useState(null);
  // The demo set, held in state only so a drag in the preview visibly moves the chip
  // without the moved copy being mistaken for a live answer.
  const [demoEvents, setDemoEvents] = React.useState(DSC_DEMO.events);
  const [avail, setAvail] = React.useState(null);
  // Month or week, remembered: a coach who works the week grid should not have to
  // choose it again on every visit to their own calendar.
  const prefs = useRememberedChoices(source === "live");
  const [view, setView] = useRememberedChoice(prefs, "scheduleView", ["month", "week"], "month");
  const [cursor, setCursor] = React.useState(() => {
    return dscRouteDate(dashRouteParam("date")) || new Date();
  });
  const selectedDay = dashRouteParam("date");
  const requestedClient = dashRouteParam("client");
  const focusedClient = (triage || []).find((r) => r.client.profile.id === requestedClient);
  React.useEffect(() => {
    const requestedDate = dscRouteDate(selectedDay);
    if (requestedDate) { setCursor(requestedDate); setView("week"); }
  }, [selectedDay]);
  const [drawerRow, setDrawerRow] = React.useState(null);
  const [sheetEv, setSheetEv] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const dragRef = React.useRef(null);
  const [dragId, setDragId] = React.useState(null);
  // The zone the coach's stored hours are expressed in (null until first saved).
  const [availZone, setAvailZone] = React.useState(null);
  const isLive = !!live;

  React.useEffect(() => {
    let on = true;
    fetch("/api/my-availability?role=" + role, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((av) => {
        if (!on) return;
        if (av && Array.isArray(av.slots)) setAvail(av.slots);
        if (av && typeof av.timezone === "string") setAvailZone(av.timezone);
      });
    return () => { on = false; };
  }, [role]);

  // ── The calendar, a month at a time (see dscVisibleRange) ──
  // In-flight and failed months live in refs, not state: they gate requests and must not
  // themselves re-run the effect. A failed month is not retried on its own — that would
  // loop on a signed-out visitor — but by the Retry the error note offers.
  const inflight = React.useRef(new Set());
  const failed = React.useRef(new Set());
  const mounted = React.useRef(true);
  React.useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [loadNote, setLoadNote] = React.useState("");
  const [retryTick, setRetryTick] = React.useState(0);
  const wanted = dscMonthsIn(dscVisibleRange(view, cursor));
  React.useEffect(() => {
    const missing = wanted.filter((k) => !(cal && cal.months.has(k)) && !inflight.current.has(k) && !failed.current.has(k));
    if (!missing.length) return;
    setLoadNote("loading");
    for (const run of dscMonthRuns(missing)) {
      run.forEach((k) => inflight.current.add(k));
      // ⚠ `tz` IS WHAT MAKES THE ROUTE ANSWER ON A CLOCK at all — without it every booking
      // comes back in UTC (the contract older app builds rely on). With it the route uses the
      // coach's stored zone for `role`, and this browser's only when none is stored yet.
      const url = "/api/calendar?from=" + run[0] + "-01&to=" + dscMonthEnd(run[run.length - 1])
        + "&role=" + encodeURIComponent(role) + "&tz=" + encodeURIComponent(dscBrowserZone() || "");
      fetch(url, { credentials: "same-origin", cache: "no-store" })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((res) => {
          run.forEach((k) => inflight.current.delete(k));
          if (!mounted.current) return;
          if (res && Array.isArray(res.events)) setCal((prev) => dscMergeRange(prev, res, run));
          else run.forEach((k) => failed.current.add(k));
          setLoadNote(inflight.current.size ? "loading" : failed.current.size ? "error" : "");
        });
    }
  }, [role, wanted.join(","), cal, retryTick]);
  const retryLoad = () => { failed.current.clear(); setLoadNote(""); setRetryTick((n) => n + 1); };

  const liveEvents = cal != null;
  const allEvents = liveEvents ? cal.events : demoEvents;
  const calZone = liveEvents ? cal.zone : null;
  const todayIso = dscTodayIn(calZone);
  const availSlots = avail != null ? avail : (isLive ? [] : DSC_DEMO.availability);
  // Only the coach's own bookings (sessions/consults) + manual events belong
  // on the planning calendar — the client-facing pushed workouts/meals are a
  // client surface, shown read-only if present.
  const planEvents = allEvents.filter((e) => (!focusedClient || e.clientId === requestedClient) && (e.kind === "SESSION" || e.kind === "CONSULT" || e.source === "event" || e.kind === "WORKOUT" || e.kind === "MEAL"));
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
    if (!(ev.reschedulable || ev.editable)) { showToast((ev.with || ev.title) + " is read-only — reschedule it in the program/plan."); return; }
    // Optimistic local move, on whichever set is on screen.
    const moveTo = (date) => (list) => list.map((e) => (e.id === ev.id ? { ...e, date } : e));
    if (!liveEvents) { setDemoEvents(moveTo(dateIso)); showToast("Demo · would move " + (ev.with || ev.title) + " to " + dateIso + " and notify them."); return; }
    setCal((c) => (c ? { ...c, events: moveTo(dateIso)(c.events) } : c));
    if (!isLive) { showToast("Demo · would move " + (ev.with || ev.title) + " to " + dateIso + " and notify them."); return; }
    try {
      let res;
      if (ev.source === "session" && ev.sessionId) {
        // ⚠ THE TIME IS A WALL CLOCK IN `calZone`, SO THE ZONE GOES WITH IT. The route reads a
        // reschedule's date+time in the zone it is handed; without one it reads UTC, and a
        // 9:00 AM New York session dropped on a new day would land at 5:00 AM (4:00 in winter).
        // Keeping the WALL clock is also what holds "9:00 AM" across a DST change.
        res = await fetch("/api/sessions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reschedule", sessionId: ev.sessionId, date: dateIso, time: ev.time || null, tz: calZone || undefined }) });
      } else if (ev.source === "event") {
        res = await fetch("/api/calendar", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: String(ev.id).replace(/^event:/, ""), date: dateIso }) });
      }
      if (res && res.ok) showToast("Moved " + (ev.with || ev.title) + " to " + dateIso + " · " + (ev.with ? ev.with.split(" ")[0] + " notified" : "updated"));
      else throw new Error("HTTP " + (res ? res.status : "—"));
    } catch (e) {
      showToast("Couldn't move it — try again.");
      setCal((c) => (c ? { ...c, events: moveTo(ev.date)(c.events) } : c)); // revert
    }
  };

  const monthLabel = cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const weekLabel = (() => { const m = dscMonday(cursor); const s = dscAddDays(m, 6); return m.toLocaleDateString([], { month: "short", day: "numeric" }) + " – " + s.toLocaleDateString([], { month: "short", day: "numeric" }); })();
  // ⚠ A MONTH STEP LANDS ON THE 1ST. `setMonth(+1)` from the 31st overflows — Oct 31 became
  // "Nov 31", i.e. Dec 1 — so on the last days of a month "next" skipped a whole month.
  const step = (dir) => setCursor((c) => (view === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : dscAddDays(c, dir * 7)));

  // Color-key legend: the clients on the visible calendar.
  const legend = [...new Map(planEvents.filter((e) => e.with).map((e) => [e.clientId || e.with, { name: e.with, key: e.clientId || e.with }])).values()].slice(0, 8);
  const btn = (on) => ({ fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: on ? "var(--sh-deep, #06231f)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", background: on ? DSC_TEAL : "transparent", border: on ? 0 : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 4, padding: "7px 12px", cursor: "pointer" });

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
        {focusedClient && <p role="status" style={{ fontSize: 13 }}>Schedule for {focusedClient.client.profile.name}. <a href={dashTabHref("schedule", role)}>Show all clients</a></p>}
        {selectedDay && <p style={{ fontSize: 13 }}>Selected day: {selectedDay}</p>}
        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>
          {/* Calendar */}
          <div className="dash-plate dash-plate--tick" style={{ "--dac": role === "nutritionist" ? "var(--sh-gold, #d8a23a)" : "var(--sh-rust2, #c0533b)", paddingLeft: 24, minWidth: 0 }}>
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
            {/* ⚠ THE ZONE IS NAMED, BECAUSE A BARE "9:00a" IS A CLAIM ABOUT A CLOCK. It is the zone
                the route says it answered in — never this browser's guess — and it is the one a
                drag hands back. Shown only for a live answer — the demo has no coach to name —
                or for a signed-in coach whose first read failed, who needs the Retry. */}
            {(liveEvents || isLive) && (calZone || loadNote) && (
              <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DSC_INK50, margin: "-4px 0 10px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                {calZone && <span>Times in {calZone}</span>}
                {loadNote === "loading" && <span>Loading…</span>}
                {loadNote === "error" && <span>Some dates couldn't load. <button type="button" onClick={retryLoad} style={{ ...btn(false), padding: "2px 8px", fontSize: 8 }}>Retry</button></span>}
              </div>
            )}
            {view === "month"
              ? <DscMonth cursor={cursor} byDate={byDate} colorOf={colorOf} todayIso={todayIso} onPickEvent={pickEvent} onDrop={onDrop} onDrag={(ev) => { dragRef.current = ev; setDragId(ev.id); }} dragId={dragId} />
              : <DscWeek cursor={cursor} byDate={byDate} colorOf={colorOf} todayIso={todayIso} onPickEvent={pickEvent} onDrop={onDrop} onDrag={(ev) => { dragRef.current = ev; setDragId(ev.id); }} dragId={dragId} />}
            {/* Client color legend */}
            {legend.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 12px", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
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
            <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "var(--sh-gold, #d8a23a)", paddingLeft: 22 }}>
              <DscAvailability role={role} live={isLive} initial={availSlots} storedZone={availZone} onZone={setAvailZone} />
            </div>
            <div className="dash-plate" style={{ "--dac": "var(--sh-ink3, #75706a)", padding: "14px 16px" }}>
              <div className="dash-eyebrow">How rescheduling works</div>
              <div style={{ fontSize: 12, color: DSC_INK50, lineHeight: 1.55, marginTop: 8 }}>
                Drag a session or consult to a new day — the client gets a notification with the new time. Workouts and meals pushed from a plan are read-only here; move those in the program or meal plan.
              </div>
              <a href={role === "nutritionist" ? "NutritionistDashboard.html" : "TrainerDashboard.html"} style={{ display: "inline-block", marginTop: 10, fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DSC_TEAL, textDecoration: "none" }}>← Today's summary</a>
            </div>
          </div>
        </div>
      </DashPage>

      {drawerRow && typeof window.DashClientDrawer === "function" && <DashClientDrawer row={drawerRow} role={role} onClose={() => setDrawerRow(null)} prefs={prefs} />}
      {sheetEv && <DscEventSheet ev={sheetEv} colorOf={colorOf} onClose={() => setSheetEv(null)} />}
      {toast && (
        <div style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 300, background: "var(--sh-ground2, #14110e)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 8, padding: "10px 18px", color: "var(--sh-ink, #f2ede4)", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 12.5, maxWidth: "90vw" }}>{toast}</div>
      )}
    </React.Fragment>
  );
}

Object.assign(window, { CoachSchedulePage, dscClientColor, dscColorMap });
