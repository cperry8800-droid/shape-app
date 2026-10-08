// Schedule v2 — the pro PLANNING view (dashboard-v2 gap step). A dedicated
// page (NOT the Today summary) for both coach roles, sessions + consults
// color-coded BY CLIENT, and an availability-blocks editor that feeds the
// marketplace profile. Today's schedule stays the daily summary.
//
// ⚠ STEP 2 OF THE OWNER-APPROVED UPGRADE (2026-10-07, "I like everything that is proposed for
// schedule"): the week is a TIME GRID now, not seven lists of chips. Hours run down the side
// and each booking is a block sized by its length; the coach's open hours are shaded on the
// same grid, requests wait in a strip above it, a click on a booking opens a sheet with real
// actions, a click on empty time books a client into it, and a booking drags to a new TIME
// (15-minute steps, pointer events so a finger works too) with the clash and open-hours
// verdicts drawn on the drop target. Day view is one wide column plus the day's agenda with
// each client's prep; under 760px the week becomes the day view with a day strip. Month keeps
// its chips and its day-only drag.
//
// Data: /api/calendar, a month range at a time with `tz` + `role`, so bookings come back on
// the coach's own clock and the response names the zone (sessions carry clientId + name +
// status + reschedulable; manual calendar_events are editable; pushed workouts/meals are
// read-only), /api/sessions/manage (reschedule · confirm · decline · cancel · complete, and
// `create` for a booking made from an empty slot — coach-only, the client is notified),
// /api/my-availability?role= (the same weekly slots the marketplace reads). useDashboard(role)
// supplies the roster for the book sheet, the prep lines and the client drawer. Demo under the
// band when signed out.
//
// ⚠ THE RULES ARE NOT IN THIS FILE. Open-hours fit, clash, lanes, the drawn hour range and the
// load figure come from scheduleRules.mjs (window.ShapeScheduleRules, loaded as a module by the
// host page) — the SAME file /api/sessions/manage, /api/sessions/request and /api/consultation
// import, so a red drop target here and a 409 there are one decision.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals →
// dashData → dashToday (DashDemoBand/helpers) → dashGoals → dashRoster
// (DashClientDrawer) → this; scheduleRules.mjs as a module before any of them runs.

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
  // The plans row (step 4) rides along with each month: merged by id, and unreadable once any
  // month's read of it failed (`clientPlansReadable: false`), so a gap is said, not drawn empty.
  const plansIn = Array.isArray(res.clientPlans) ? res.clientPlans : [];
  const plansOk = res.clientPlansReadable !== false;
  if (!prev || prev.zone !== zone) return { zone, months: new Set(months), events: res.events.slice(), clientPlans: plansIn.slice(), plansOk };
  const byId = new Map(prev.events.map((e) => [e.id, e]));
  for (const e of res.events) byId.set(e.id, e);
  const planById = new Map((prev.clientPlans || []).map((p) => [p.id, p]));
  for (const p of plansIn) planById.set(p.id, p);
  return { zone, months: new Set([...prev.months, ...months]), events: [...byId.values()], clientPlans: [...planById.values()], plansOk: prev.plansOk !== false && plansOk };
}
// A demo week of client plans for the signed-out preview: invented, like its bookings.
function dscDemoPlans(monday) {
  const at = (n) => dscIso(dscAddDays(monday, n));
  return [
    [0, "Priya S.", "Lower A"], [3, "Priya S.", "Upper A"], [1, "Marcus T.", "Push"], [5, "Marcus T.", "Legs"], [2, "Dana K.", "Tempo run"],
  ].map(([n, who, title]) => ({ id: "demo-cplan-" + n + who, date: at(n), clientId: "demo-" + who, with: who, title }));
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
  const at = (dayOffset, time, kind, title, client, sub, status) => ({
    id: "demo-" + dayOffset + "-" + time, source: kind === "WORKOUT" ? "plan" : "session",
    sessionId: "demo-s-" + dayOffset + "-" + time, reschedulable: kind !== "WORKOUT", editable: false,
    kind, title, sub: sub || "", date: dscIso(new Date(mon.getTime() + dayOffset * DSC_DAY)),
    time, durationMin: kind === "CONSULT" ? 30 : 60, with: client, clientId: "demo-" + client.split(" ")[0].toLowerCase(), status: status || "confirmed",
  });
  // An untimed item from a client's program — the grid's all-day row.
  const plan = (dayOffset, title) => ({
    id: "demo-plan-" + dayOffset, source: "plan", kind: "WORKOUT", title, sub: "Assigned workout",
    date: dscIso(new Date(mon.getTime() + dayOffset * DSC_DAY)), time: null, durationMin: null,
    with: "", status: "planned", editable: false, reschedulable: false,
  });
  return {
    events: [
      at(0, "07:00", "SESSION", "Lower pull", "Priya S.", "video"),
      at(0, "17:30", "SESSION", "Upper push", "Deandre K.", "inperson"),
      at(1, "09:00", "CONSULT", "Monthly review", "Aisha K.", "video"),
      at(1, "18:00", "SESSION", "Deadlift work", "Marcus T.", "inperson"),
      at(2, "07:00", "SESSION", "Tempo run", "Priya S.", "video"),
      at(2, "14:00", "CONSULT", "Intake call", "Sam R.", "video"),
      at(2, "08:30", "SESSION", "Intro session", "Jordan M.", "video", "requested"),
      at(3, "10:00", "SESSION", "Squat assessment", "Jordan M.", "inperson"),
      at(3, "19:00", "SESSION", "Conditioning", "Nadia P.", "video"),
      at(4, "08:00", "SESSION", "Long run", "Priya S.", "video"),
      at(4, "16:30", "CONSULT", "Plan delivery", "Elena R.", "video"),
      at(5, "09:00", "SESSION", "Strength check", "Sam R.", "video", "requested"),
      at(6, "10:00", "SESSION", "Open gym", "Deandre K.", "inperson"),
      plan(0, "Lower A"), plan(3, "Upper A"),
    ],
    // getDay()-style weekday: Mon=1 … Sat=6 (a Mon-Sat working week).
    availability: [
      { weekday: 1, start_minute: 6 * 60, duration_min: 240 }, { weekday: 1, start_minute: 17 * 60, duration_min: 180 },
      { weekday: 2, start_minute: 8 * 60, duration_min: 300 }, { weekday: 3, start_minute: 6 * 60, duration_min: 240 },
      { weekday: 4, start_minute: 9 * 60, duration_min: 300 }, { weekday: 5, start_minute: 6 * 60, duration_min: 300 },
      { weekday: 6, start_minute: 9 * 60, duration_min: 180 },
    ],
    // One example block, tomorrow 1:00 to 5:00 PM on this browser's clock like the rest, so it is
    // always ahead of the visitor and (but on a Sunday) on the week they are shown.
    timeOff: (() => {
      const t = new Date();
      return [{
        id: "demo-off-1", note: "Dentist",
        startsAt: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 13, 0).toISOString(),
        endsAt: new Date(t.getFullYear(), t.getMonth(), t.getDate() + 1, 17, 0).toISOString(),
      }];
    })(),
  };
})();

// ── Open hours — the weekly pattern the marketplace reads ───────────────────
// ⚠ THE GRID IS THE COACH'S OWN CLOCK, AND UNTIL 2026-09-11 NOBODY RECORDED WHICH ONE.
// A stored start_minute is a bare wall-clock minute — open "9:00" and 540 is written —
// so every reader had to invent a zone, and the live ones disagreed: the website read 540
// as 09:00 UTC while the app read it as 09:00 in the MEMBER's zone. A New York coach who
// opened 9am had members booking 5:00 AM on one surface and 9:00 AM on the other. The
// save now carries this browser's resolved zone, the route stamps it on the coach's row,
// and the label names it so a coach can see what they are declaring rather than
// trusting an unqualified "9a".
//
// ⚠ EDITED ON THE WEEK GRID IN HALF HOURS SINCE 2026-10-07 (Schedule step 3). The rail used to
// hold 105 whole-hour buttons from 6 AM to 8 PM that each saved on tap; a coach who opens 7:30
// or works until 9 PM could not say so, and every tap was a delete-and-rewrite of the week.
// provider_availability.weekday is getDay()-style: 0=Sun … 6=Sat (per the migration + what the
// booking flows read). Display Mon-first, but STORE the real getDay index.
const DSC_AVAIL_DAYS = [["Mon", 1], ["Tue", 2], ["Wed", 3], ["Thu", 4], ["Fri", 5], ["Sat", 6], ["Sun", 0]];
const DSC_HALF = 30;
const DSC_CELLS = 48;
// The rows the editor draws: 5 AM to 10 PM, widened to any open half hour outside it.
const DSC_EDIT_FROM = (5 * 60) / DSC_HALF;
const DSC_EDIT_TO = (22 * 60) / DSC_HALF;
const DSC_EDIT_PX = 14;
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
// Stored rows → seven days of 48 half-hour cells (index = getDay()). A cell is open when a row
// covers ALL of it. `offGrid` says a row did not land on the half hour, so saving will round it.
function dscHoursModel(slots) {
  const cells = Array.from({ length: 7 }, () => Array(DSC_CELLS).fill(false));
  let offGrid = false;
  for (const s of Array.isArray(slots) ? slots : []) {
    const wd = Number(s && s.weekday), start = Number(s && s.start_minute);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6 || !Number.isFinite(start)) continue;
    const dur = Number(s.duration_min) > 0 ? Number(s.duration_min) : 60;
    const end = Math.min(1440, start + dur);
    if (start % DSC_HALF || end % DSC_HALF) offGrid = true;
    for (let i = 0; i < DSC_CELLS; i++) if (start <= i * DSC_HALF && (i + 1) * DSC_HALF <= end) cells[wd][i] = true;
  }
  return { cells, offGrid };
}
// Seven days of cells → the rows the route stores: each run of open half hours, one row.
function dscHoursRows(cells) {
  const out = [];
  for (let wd = 0; wd < 7; wd++) {
    const day = cells[wd] || [];
    for (let i = 0; i < DSC_CELLS; i++) {
      if (!day[i]) continue;
      let j = i;
      while (j + 1 < DSC_CELLS && day[j + 1]) j++;
      out.push({ weekday: wd, start_minute: i * DSC_HALF, duration_min: (j - i + 1) * DSC_HALF });
      i = j;
    }
  }
  return out;
}
// "9:00a–12:00p, 2:00p–6:00p" for one weekday's rows, or "Closed".
function dscDaySummary(cells, wd) {
  const runs = dscHoursRows(cells).filter((r) => r.weekday === wd);
  return runs.length ? runs.map((r) => dscClock(r.start_minute) + "–" + dscClock(r.start_minute + r.duration_min)).join(", ") : "Closed";
}
// The days a copy goes to, from the editor's "to" choice.
function dscCopyTargets(to, from) {
  const days = to === "weekdays" ? [1, 2, 3, 4, 5] : to === "weekend" ? [6, 0] : to === "all" ? [0, 1, 2, 3, 4, 5, 6] : [Number(to)];
  return days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6 && d !== from);
}

// The week's hours, as a grid you paint. Drag across cells to open time, or start on an open
// cell to close it; a drag fills the rectangle between where it started and where it is, so
// Monday 9:00 to Friday 5:00 opens the working week in one gesture. A cell is also a button:
// click it, or Enter/Space. Nothing is saved until "Save hours".
function DscHoursEditor({ role, live, initial, storedZone, onCancel, onSaved }) {
  const seed = React.useMemo(() => dscHoursModel(initial), [JSON.stringify(initial)]);
  const [cells, setCells] = React.useState(() => seed.cells.map((d) => d.slice()));
  const [saving, setSaving] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const [copyFrom, setCopyFrom] = React.useState(1);
  const [copyTo, setCopyTo] = React.useState("weekdays");
  const paintRef = React.useRef(null);
  React.useEffect(() => () => { if (paintRef.current) paintRef.current.cleanup(); }, []);
  let first = DSC_EDIT_FROM, last = DSC_EDIT_TO;
  cells.forEach((d) => d.forEach((on, i) => { if (on) { first = Math.min(first, i); last = Math.max(last, i + 1); } }));
  const rows = Array.from({ length: last - first }, (_, k) => first + k);
  const dirty = JSON.stringify(cells) !== JSON.stringify(seed.cells);
  const openMin = cells.reduce((n, d) => n + d.filter(Boolean).length, 0) * DSC_HALF;
  const zoneLabel = dscZoneLabel(live, storedZone);

  // The rectangle from the anchor to `to` (display column, row), painted over the cells as
  // they were when the drag began — so dragging back shrinks it.
  const paint = (p, to) => {
    const next = p.base.map((d) => d.slice());
    const [c0, c1] = [Math.min(p.col, to.col), Math.max(p.col, to.col)];
    const [r0, r1] = [Math.min(p.row, to.row), Math.max(p.row, to.row)];
    for (let c = c0; c <= c1; c++) for (let r = r0; r <= r1; r++) next[DSC_AVAIL_DAYS[c][1]][r] = p.value;
    setCells(next);
  };
  const startPaint = (col, row, e) => {
    if (e.button != null && e.button > 0) return;
    e.preventDefault();
    if (paintRef.current) paintRef.current.cleanup();
    const p = { col, row, base: cells.map((d) => d.slice()), value: !cells[DSC_AVAIL_DAYS[col][1]][row] };
    // ⚠ THE CELL UNDER THE POINTER, NOT THE ONE THE EVENT NAMES. A touch keeps sending its
    // events to the cell it started on, so the target never changes during a drag.
    const move = (m) => {
      const el = document.elementFromPoint ? document.elementFromPoint(m.clientX, m.clientY) : null;
      const cell = el && el.closest ? el.closest("[data-hcell]") : null;
      if (!cell) return;
      const [c, r] = cell.getAttribute("data-hcell").split(":").map(Number);
      paint(p, { col: c, row: r });
    };
    const end = () => { p.cleanup(); paintRef.current = null; };
    p.cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
    paintRef.current = p;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    paint(p, { col, row });
  };
  const toggle = (col, row) => {
    const next = cells.map((d) => d.slice());
    const wd = DSC_AVAIL_DAYS[col][1];
    next[wd][row] = !next[wd][row];
    setCells(next);
  };
  const copy = () => {
    const next = cells.map((d) => d.slice());
    for (const t of dscCopyTargets(copyTo, copyFrom)) next[t] = cells[copyFrom].slice();
    setCells(next);
  };
  const clearDay = () => {
    const next = cells.map((d) => d.slice());
    next[copyFrom] = Array(DSC_CELLS).fill(false);
    setCells(next);
  };
  const save = async () => {
    const slots = dscHoursRows(cells);
    if (!live) { onSaved(slots, null); return; }
    setSaving(true); setErr(null);
    try {
      const res = await fetch("/api/my-availability", {
        method: "POST", credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        // ⚠ WITHOUT THE ZONE THE ROUTE REFUSES THE SAVE — deliberately, because hours nobody
        // can place are hours no member can book.
        body: JSON.stringify({ role, slots, timezone: dscBrowserZone() }),
      });
      const j = await res.json().catch(() => null);
      if (!res.ok) { setErr((j && (j.detail || (typeof j.error === "string" && j.error !== "save_failed" ? j.error : null))) || "Couldn't save your hours — try again."); return; }
      // ⚠ ADOPT THE ZONE THE ROUTE ACTUALLY STORED, rather than assuming the one we sent landed.
      onSaved(slots, j && typeof j.timezone === "string" && j.timezone ? j.timezone : null);
    } catch (e) {
      setErr("Couldn't save your hours — try again.");
    } finally {
      setSaving(false);
    }
  };
  const sel = { ...dscInput, padding: "5px 6px", fontSize: 10.5 };
  const cols = "40px " + DSC_AVAIL_DAYS.map(() => "minmax(0, 1fr)").join(" ");
  return (
    <div data-hours-editor="">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8 }}>
        <div style={{ display: "grid", gap: 3 }}>
          <span className="dash-eyebrow" style={{ color: DSC_GOLD }}>Edit hours · every week</span>
          <span style={{ fontFamily: DSC_MONO, fontSize: 9, color: DSC_INK50 }}>{(window.ShapeScheduleRules ? window.ShapeScheduleRules.hoursLabel(openMin) : String(openMin / 60)) + " open hrs/wk" + (zoneLabel ? " · " + zoneLabel : "")}</span>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button type="button" onClick={onCancel} style={dscBtn()}>Cancel</button>
          <button type="button" data-save-hours="" onClick={save} disabled={saving || !dirty} style={{ ...dscBtn("on"), opacity: saving || !dirty ? 0.5 : 1 }}>{saving ? "Saving…" : "Save hours"}</button>
        </div>
      </div>
      <div role="group" aria-label="Copy a day" style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 8, fontSize: 12 }}>
        <span style={{ color: DSC_INK50 }}>Copy</span>
        <select aria-label="Copy from" value={copyFrom} onChange={(e) => setCopyFrom(Number(e.target.value))} style={sel}>
          {DSC_AVAIL_DAYS.map(([lbl, wd]) => <option key={wd} value={wd}>{lbl}</option>)}
        </select>
        <span style={{ color: DSC_INK50 }}>to</span>
        <select aria-label="Copy to" value={copyTo} onChange={(e) => setCopyTo(e.target.value)} style={sel}>
          <option value="weekdays">Weekdays</option>
          <option value="weekend">Weekend</option>
          <option value="all">Every day</option>
          {DSC_AVAIL_DAYS.filter(([, wd]) => wd !== copyFrom).map(([lbl, wd]) => <option key={wd} value={String(wd)}>{lbl}</option>)}
        </select>
        <button type="button" data-copy-day="" onClick={copy} style={{ ...dscBtn(), padding: "6px 10px" }}>Copy</button>
        <button type="button" data-clear-day="" onClick={clearDay} style={{ ...dscBtn(), padding: "6px 10px" }}>Clear {DSC_AVAIL_DAYS.find(([, wd]) => wd === copyFrom)[0]}</button>
      </div>
      <div style={{ fontSize: 11.5, color: DSC_INK50, lineHeight: 1.5, marginBottom: 8 }}>
        Drag across the grid to open time; start on an open half hour to close it. These hours repeat every week, and they're what members can book.
      </div>
      {seed.offGrid && <div style={{ fontSize: 11.5, color: DSC_GOLD, marginBottom: 8 }}>Some of your saved hours don't start or end on the half hour. Saving rounds them to the half hours shown.</div>}
      {err && <div role="alert" style={{ fontSize: 12, color: DSC_RUST, marginBottom: 8 }}>{err}</div>}
      <div style={{ border: "1px solid " + DSC_HAIR, borderRadius: 8, overflow: "hidden", touchAction: "none", userSelect: "none" }}>
        <div style={{ display: "grid", gridTemplateColumns: cols, borderBottom: "1px solid " + DSC_HAIR }}>
          <span />
          {DSC_AVAIL_DAYS.map(([lbl]) => <span key={lbl} style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_INK50, textAlign: "center", padding: "6px 0", borderLeft: "1px solid " + DSC_HAIR }}>{lbl}</span>)}
        </div>
        <div role="grid" aria-label="Weekly open hours" style={{ display: "grid", gridTemplateColumns: cols }}>
          {rows.map((r) => (
            <React.Fragment key={r}>
              <span aria-hidden style={{ fontFamily: DSC_MONO, fontSize: 8, color: DSC_INK50, textAlign: "right", paddingRight: 6, height: DSC_EDIT_PX, lineHeight: DSC_EDIT_PX + "px", transform: "translateY(-50%)" }}>{r % 2 === 0 ? dscHourLabel(r / 2) : ""}</span>
              {DSC_AVAIL_DAYS.map(([lbl, wd], c) => {
                const on = cells[wd][r];
                return (
                  <button key={wd} type="button" data-hcell={c + ":" + r} aria-pressed={on} aria-label={lbl + " " + dscClock(r * DSC_HALF)}
                    onPointerDown={(e) => startPaint(c, r, e)}
                    // A pointer's click was the paint itself; only a keyboard's click (detail 0) toggles.
                    onClick={(e) => { if (e.detail === 0) toggle(c, r); }}
                    style={{ height: DSC_EDIT_PX, padding: 0, border: 0, borderLeft: "1px solid " + DSC_HAIR, borderTop: r % 2 === 0 ? "1px solid " + DSC_HAIR : "1px dashed rgba(var(--sh-ink-rgb, 242,237,228),0.04)", background: on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.38)" : "transparent", cursor: "pointer" }} />
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

// The rail's summary of the week's hours, and the way into editing them.
function DscHoursPlate({ slots, live, storedZone, editing, state = "ready", onEdit }) {
  const { cells } = dscHoursModel(slots);
  const openMin = cells.reduce((n, d) => n + d.filter(Boolean).length, 0) * DSC_HALF;
  const zoneLabel = dscZoneLabel(live, storedZone);
  return (
    <div>
      <span className="dash-eyebrow" style={{ color: DSC_GOLD }}>Open hours · your marketplace profile</span>
      <div style={{ fontFamily: DSC_MONO, fontSize: 9, color: DSC_INK50, marginTop: 4 }}>{(window.ShapeScheduleRules ? window.ShapeScheduleRules.hoursLabel(openMin) : String(openMin / 60)) + " open hrs/wk" + (zoneLabel ? " · " + zoneLabel : "")}</div>
      <div data-hours-summary="" aria-busy={state === "loading"} style={{ display: "grid", gridTemplateColumns: "34px 1fr", gap: "4px 8px", margin: "10px 0 12px", fontSize: 11.5, opacity: state === "ready" ? 1 : 0.45 }}>
        {DSC_AVAIL_DAYS.map(([lbl, wd]) => {
          const text = dscDaySummary(cells, wd);
          return (
            <React.Fragment key={wd}>
              <span style={{ fontFamily: DSC_MONO, fontSize: 9, color: DSC_INK50, paddingTop: 1 }}>{lbl}</span>
              <span style={{ color: text === "Closed" ? DSC_INK50 : "var(--sh-ink, #f2ede4)" }}>{text}</span>
            </React.Fragment>
          );
        })}
      </div>
      {state === "failed" && <div role="alert" style={{ fontSize: 11.5, color: DSC_RUST, marginBottom: 8 }}>Your hours couldn't load. Reload to edit them.</div>}
      <button type="button" data-edit-hours="" onClick={onEdit} disabled={editing || state !== "ready"} style={{ ...dscBtn(editing || state !== "ready" ? "" : "on"), opacity: editing || state !== "ready" ? 0.6 : 1 }}>
        {editing ? "Editing on the grid" : state === "loading" ? "Loading your hours…" : "Edit hours"}
      </button>
    </div>
  );
}

// ── Time off ────────────────────────────────────────────────────────────────
// A vacation or an afternoon: booking is closed for it (bookingRules.checkSlot refuses it, and
// the member pages stop offering it), and it is hatched on the grid. It does NOT cancel a booking
// already inside it — the route counts those, and moving them stays the coach's call.
const dscDateFmt = (ms, zone) => new Date(ms).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", ...(zone ? { timeZone: zone } : {}) });
// "Mon, Oct 12 – Fri, Oct 16" for whole days, "Tue, Oct 13 · 1:00p–6:00p" for part of one.
function dscOffLabel(b, zone) {
  const s = Date.parse(b.startsAt), e = Date.parse(b.endsAt);
  const ws = zone ? dscWallAt(s, zone) : null, we = zone ? dscWallAt(e, zone) : null;
  if (ws && we && ws.min === 0 && we.min === 0) {
    const last = e - DSC_DAY / 2;   // the last whole day is the one before the end's midnight
    const a = dscDateFmt(s, zone), z = dscDateFmt(last, zone);
    return a === z ? a : a + " – " + z;
  }
  if (ws && we && ws.date === we.date) return dscDateFmt(s, zone) + " · " + dscClock(ws.min) + "–" + dscClock(we.min);
  if (ws && we) return dscDateFmt(s, zone) + " " + dscClock(ws.min) + " – " + dscDateFmt(e, zone) + " " + dscClock(we.min);
  return new Date(s).toLocaleString() + " – " + new Date(e).toLocaleString();
}
function DscTimeOffPlate({ list, zone, adding, onAdd, onRemove, busyId, error }) {
  const todayIso = dscTodayIn(zone);
  const [open, setOpen] = React.useState(false);
  const [allDay, setAllDay] = React.useState(true);
  const [from, setFrom] = React.useState(todayIso);
  const [to, setTo] = React.useState(todayIso);
  const [fromMin, setFromMin] = React.useState(12 * 60);
  const [toMin, setToMin] = React.useState(17 * 60);
  const [note, setNote] = React.useState("");
  const submit = async (e) => {
    e.preventDefault();
    const ok = await onAdd({ allDay, from, to: to < from ? from : to, fromMin, toMin, note: note.trim() });
    if (ok) { setOpen(false); setNote(""); }
  };
  const upcoming = (list || []).filter((b) => Date.parse(b.endsAt) > Date.now());
  return (
    <div>
      <span className="dash-eyebrow" style={{ color: DSC_GOLD }}>Time off · booking closes</span>
      <div data-time-off-list="" style={{ display: "grid", gap: 6, margin: "10px 0" }}>
        {upcoming.length === 0 && <div style={{ fontSize: 11.5, color: DSC_INK50 }}>None coming up.</div>}
        {upcoming.map((b) => (
          <div key={b.id} data-time-off-item={b.id} style={{ display: "flex", alignItems: "baseline", gap: 8, fontSize: 12 }}>
            <span style={{ flex: 1, minWidth: 0 }}>{dscOffLabel(b, zone)}{b.note ? <span style={{ color: DSC_INK50 }}>{" · " + b.note}</span> : null}</span>
            <button type="button" aria-label={"Remove time off " + dscOffLabel(b, zone)} disabled={busyId === b.id} onClick={() => onRemove(b)} style={{ ...dscBtn(), padding: "3px 8px" }}>×</button>
          </div>
        ))}
      </div>
      {error && <div role="alert" style={{ fontSize: 11.5, color: DSC_RUST, marginBottom: 8 }}>{error}</div>}
      {!open
        ? <button type="button" data-add-time-off="" onClick={() => setOpen(true)} style={dscBtn()}>＋ Add time off</button>
        : (
          <form data-time-off-form="" onSubmit={submit} style={{ display: "grid", gap: 8, fontSize: 12 }}>
            <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} /> Whole days
            </label>
            <div style={{ display: "grid", gridTemplateColumns: "38px 1fr", gap: 6, alignItems: "center" }}>
              <span style={{ color: DSC_INK50 }}>From</span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input type="date" aria-label="From date" value={from} min={todayIso} onChange={(e) => setFrom(e.target.value)} style={dscInput} />
                {!allDay && <DscTimeSelect label="From time" value={fromMin} onChange={setFromMin} />}
              </span>
              <span style={{ color: DSC_INK50 }}>To</span>
              <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                <input type="date" aria-label="To date" value={to < from ? from : to} min={from} onChange={(e) => setTo(e.target.value)} style={dscInput} />
                {!allDay && <DscTimeSelect label="To time" value={toMin} onChange={setToMin} />}
              </span>
            </div>
            <input type="text" aria-label="Note (only you see it)" placeholder="Note (only you see it)" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} style={dscInput} />
            <div style={{ display: "flex", gap: 6 }}>
              <button type="submit" disabled={adding} style={{ ...dscBtn("on"), opacity: adding ? 0.5 : 1 }}>{adding ? "Adding…" : "Add time off"}</button>
              <button type="button" onClick={() => setOpen(false)} style={dscBtn()}>Cancel</button>
            </div>
          </form>
        )}
    </div>
  );
}

// ── Booking rules ───────────────────────────────────────────────────────────
// What members may book: a buffer between sessions, a daily limit and a minimum notice. The
// routes refuse a member's booking that breaks one (bookingRules.checkSlot), and the member pages
// do not offer it. The coach's own bookings and moves are not held to them.
const DSC_BUFFERS = [0, 5, 10, 15, 20, 30, 45, 60, 90, 120];
const DSC_LIMITS = [null, 1, 2, 3, 4, 5, 6, 7, 8, 10, 12, 16, 20, 24];
const DSC_NOTICE = [0, 1, 2, 4, 6, 12, 24, 48, 72, 168, 336];
const dscNoticeText = (h) => (h === 0 ? "None" : h % 168 === 0 ? (h / 168) + (h === 168 ? " week" : " weeks") : h % 24 === 0 ? (h / 24) + (h === 24 ? " day" : " days") : h + (h === 1 ? " hour" : " hours"));
function DscRulesPlate({ role, live, onToast }) {
  const [saved, setSaved] = React.useState({ bufferMin: 0, maxPerDay: null, minNoticeHours: 0 });
  const [draft, setDraft] = React.useState(saved);
  const [state, setState] = React.useState(live ? "loading" : "ready");   // loading | ready | notready | error | saving
  const [err, setErr] = React.useState(null);
  React.useEffect(() => {
    if (!live) return undefined;
    let on = true;
    fetch("/api/my-booking-rules?role=" + role, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => {
        if (!on) return;
        if (!j || !j.rules) { setState("error"); return; }
        setSaved(j.rules); setDraft(j.rules); setState(j.ready === false ? "notready" : "ready");
      });
    return () => { on = false; };
  }, [role, live]);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  const save = async () => {
    if (!live) { setSaved(draft); onToast("Demo · these rules would apply once you're signed in."); return; }
    setState("saving"); setErr(null);
    try {
      const res = await fetch("/api/my-booking-rules", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role, ...draft }) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.rules) { setErr((j && j.detail) || "Couldn't save your rules — try again."); setState("ready"); return; }
      setSaved(j.rules); setDraft(j.rules); setState("ready");
      onToast("Booking rules saved · members see them now");
    } catch (e) {
      setErr("Couldn't save your rules — try again."); setState("ready");
    }
  };
  const opts = (list, cur) => (list.includes(cur) ? list : [...list, cur].sort((a, b) => (a == null ? -1 : b == null ? 1 : a - b)));
  const sel = { ...dscInput, padding: "5px 6px", fontSize: 10.5 };
  const off = state === "loading" || state === "notready" || state === "error" || state === "saving";
  const row = (label, el) => (
    <label style={{ display: "grid", gridTemplateColumns: "1fr auto", alignItems: "center", gap: 8, fontSize: 12 }}>
      <span>{label}</span>{el}
    </label>
  );
  return (
    <div data-rules-plate="">
      <span className="dash-eyebrow">Booking rules · for members</span>
      <div style={{ display: "grid", gap: 8, margin: "10px 0" }}>
        {row("Buffer between sessions", (
          <select aria-label="Buffer between sessions" disabled={off} value={String(draft.bufferMin)} onChange={(e) => setDraft({ ...draft, bufferMin: Number(e.target.value) })} style={sel}>
            {opts(DSC_BUFFERS, draft.bufferMin).map((m) => <option key={m} value={String(m)}>{m === 0 ? "None" : m + " min"}</option>)}
          </select>
        ))}
        {row("Most sessions a day", (
          <select aria-label="Most sessions a day" disabled={off} value={draft.maxPerDay == null ? "" : String(draft.maxPerDay)} onChange={(e) => setDraft({ ...draft, maxPerDay: e.target.value === "" ? null : Number(e.target.value) })} style={sel}>
            {opts(DSC_LIMITS, draft.maxPerDay).map((n) => <option key={String(n)} value={n == null ? "" : String(n)}>{n == null ? "No limit" : String(n)}</option>)}
          </select>
        ))}
        {row("Notice before a booking", (
          <select aria-label="Notice before a booking" disabled={off} value={String(draft.minNoticeHours)} onChange={(e) => setDraft({ ...draft, minNoticeHours: Number(e.target.value) })} style={sel}>
            {opts(DSC_NOTICE, draft.minNoticeHours).map((h) => <option key={h} value={String(h)}>{dscNoticeText(h)}</option>)}
          </select>
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: DSC_INK50, lineHeight: 1.5, marginBottom: 10 }}>
        {state === "notready" ? "Booking rules will be ready after the next update."
          : state === "error" ? "Your rules couldn't load. Reload to try again."
          : "Members can't book inside your buffer, past your daily limit or sooner than your notice. You can still book and move clients yourself."}
      </div>
      {err && <div role="alert" style={{ fontSize: 11.5, color: DSC_RUST, marginBottom: 8 }}>{err}</div>}
      <button type="button" data-save-rules="" onClick={save} disabled={off || !dirty} style={{ ...dscBtn("on"), opacity: off || !dirty ? 0.5 : 1 }}>{state === "saving" ? "Saving…" : "Save rules"}</button>
    </div>
  );
}

// ── Event chip (draggable) ──────────────────────────────────────────────────
// Month cells and the grid's all-day row. A REQUEST is dashed rather than filled: until the
// coach answers it, it is a question, not an appointment, and it must not read like one.
function DscChip({ ev, onClick, onDragStart, compact, colorOf, drag = true }) {
  const color = (colorOf || dscClientColor)(ev.clientId || ev.with || ev.title);
  const movable = ev.reschedulable || ev.editable;
  const requested = ev.status === "requested";
  return (
    <div
      draggable={drag && movable}
      onDragStart={(e) => { if (drag && movable) { e.dataTransfer.setData("text/plain", ev.id); onDragStart(ev); } }}
      onClick={(e) => { e.stopPropagation(); onClick(ev); }}
      title={ev.title + (ev.with ? " · " + ev.with : "") + (requested ? " · requested" : "") + (movable ? "" : " · read-only")}
      style={{
        display: "flex", alignItems: "center", gap: 5, cursor: "pointer",
        background: requested ? "transparent" : color + "22",
        borderTop: requested ? "1px dashed " + color : "0 solid transparent",
        borderRight: requested ? "1px dashed " + color : "0 solid transparent",
        borderBottom: requested ? "1px dashed " + color : "0 solid transparent",
        borderLeft: "3px " + (requested ? "dashed " : "solid ") + color, borderRadius: 3,
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
// Day-only moves, by HTML5 drag: a month cell has no clock to drop onto. The week and day
// grids below are where a booking moves to a new TIME.
function DscMonth({ cursor, byDate, onPickEvent, onDrop, onDrag, dragId, colorOf, offDates, todayIso = dscIso(new Date()) }) {
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
            <div key={i} data-date={iso}
              onDragOver={(e) => { if (dragId) e.preventDefault(); }}
              onDrop={(e) => { e.preventDefault(); onDrop(iso); }}
              style={{ minHeight: 92, borderRadius: 6, border: "1px solid " + (isToday ? "rgba(var(--sh-accent-rgb, 46,224,196),0.4)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.08)"), background: inMonth ? "rgba(var(--sh-ink-rgb, 242,237,228),0.02)" : "transparent", opacity: inMonth ? 1 : 0.4, padding: 5, overflow: "hidden" }}>
              <div style={{ fontFamily: DSC_MONO, fontSize: 9, color: isToday ? DSC_TEAL : DSC_INK50, marginBottom: 3 }}>{d.getDate()}</div>
              {offDates && offDates.has(iso) && <div data-time-off-day="" style={{ fontFamily: DSC_MONO, fontSize: 7.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_INK50, padding: "1px 4px", marginBottom: 3, borderRadius: 3, background: "repeating-linear-gradient(135deg, rgba(var(--sh-ink-rgb, 242,237,228),0.1) 0 5px, transparent 5px 10px)" }}>Time off</div>}
              {evs.slice(0, 4).map((ev) => <DscChip key={ev.id} ev={ev} compact colorOf={colorOf} onClick={onPickEvent} onDragStart={onDrag} />)}
              {evs.length > 4 && <div style={{ fontFamily: DSC_MONO, fontSize: 7.5, color: DSC_INK50 }}>+{evs.length - 4} more</div>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Clock helpers for the grid ──────────────────────────────────────────────
const DSC_VIEWS = ["day", "week", "month"];
const DSC_HOUR_PX = 44;
const DSC_RUST = "var(--sh-rust, #e0644b)";
const DSC_GOLD = "var(--sh-gold, #d8a23a)";
const DSC_HAIR = "rgba(var(--sh-ink-rgb, 242,237,228),0.08)";
// The accent as TEXT on an accent wash: the light paper's accent is too pale to read on its
// own tint, so the paper supplies a deeper ink (tests/newdesign-paper-pairs.test.mjs).
const DSC_TEAL_INK = "var(--sh-accent-ink, #2ee0c4)";
// "09:30" → 570, or null for an untimed item.
function dscMin(t) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(t || ""));
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}
function dscHHMM(min) { return String(Math.floor(min / 60)).padStart(2, "0") + ":" + String(min % 60).padStart(2, "0"); }
// 570 → "9:30 AM": the sheets and the strip, where a sentence reads better than "9:30a".
function dscClock(min) {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return (h % 12 === 0 ? 12 : h % 12) + ":" + String(m).padStart(2, "0") + " " + (h >= 12 ? "PM" : "AM");
}
function dscHourLabel(h) { return (h % 12 === 0 ? 12 : h % 12) + (h >= 12 && h < 24 ? "p" : "a"); }
// A booking's length. Sessions always carry one; a timed meal or workout from a plan may not,
// and is drawn at a nominal size rather than as a sliver.
function dscDur(e) { return e && e.durationMin > 0 ? e.durationMin : (e && e.kind === "MEAL" ? 30 : 60); }
// A calendar date's own weekday, getDay()-style — what provider_availability.weekday means.
function dscWeekday(iso) { const d = dscRouteDate(iso); return d ? d.getDay() : null; }
function dscDayLabel(iso, long) {
  const d = dscRouteDate(iso);
  return d ? d.toLocaleDateString([], long ? { weekday: "long", month: "short", day: "numeric" } : { weekday: "short", month: "short", day: "numeric" }) : iso;
}
// Now, on the zone's own clock: { date, min }. The grid's now line and "that time has passed"
// both read it, so the coach's clock decides, never this laptop's.
// ── Weekly runs (recurring sessions, step 4) ──
// The dates of a run as /api/sessions/manage lays them out (src/lib/session-series.ts): from the
// first date for `weeks` weeks, on the picked weekdays. Civil dates only; the route places each
// on the coach's clock and says which it skipped.
function dscRunDates(first, weeks, weekdays) {
  const d0 = dscRouteDate(first);
  if (!d0 || !(weeks > 0)) return [];
  const days = new Set(weekdays), out = [];
  for (let i = 0; i < weeks * 7; i++) { const d = dscAddDays(d0, i); if (days.has(d.getDay())) out.push(dscIso(d)); }
  return out;
}
const dscShiftIso = (iso, n) => { const d = dscRouteDate(iso); return d ? dscIso(dscAddDays(d, n)) : iso; };
const dscDaysBetween = (a, b) => {
  const x = dscRouteDate(a), y = dscRouteDate(b);
  return x && y ? Math.round((Date.UTC(y.getFullYear(), y.getMonth(), y.getDate()) - Date.UTC(x.getFullYear(), x.getMonth(), x.getDate())) / 86400000) : 0;
};
// "This and following" on the loaded calendar: this booking and every later active one of its run
// (the route acts on the same set, read from the database).
const dscFollowing = (list, ev) => list.filter((e) => e.seriesId && e.seriesId === ev.seriesId && (e.status === "requested" || e.status === "confirmed")
  && (e.date + " " + (e.time || "")) >= (ev.date + " " + (ev.time || "")));
const DSC_RUN_WEEKS = [2, 3, 4, 6, 8, 10, 12, 16, 20, 26];
const DSC_WD = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function dscNowIn(zone) {
  try {
    if (zone) {
      const p = {};
      for (const x of new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date())) p[x.type] = x.value;
      const h = Number(p.hour) % 24;
      if (p.year && Number.isFinite(h)) return { date: p.year + "-" + p.month + "-" + p.day, min: h * 60 + Number(p.minute) };
    }
  } catch (e) { /* an unknown zone falls back to this browser's clock */ }
  const n = new Date();
  return { date: dscIso(n), min: n.getHours() * 60 + n.getMinutes() };
}
// The rules module (scheduleRules.mjs), or null when the host page did not load it.
function dscRules() { return typeof window !== "undefined" && window.ShapeScheduleRules && typeof window.ShapeScheduleRules.clashIn === "function" ? window.ShapeScheduleRules : null; }
// The booking-rules module (bookingRules.mjs, window.ShapeBookingRules), for its zone arithmetic.
// Null when the host page did not load it: time off is then listed in the rail but not drawn on
// the grid, rather than drawn on a guessed clock.
function dscBookingRules() { return typeof window !== "undefined" && window.ShapeBookingRules && typeof window.ShapeBookingRules.wallInstant === "function" ? window.ShapeBookingRules : null; }
// The wall clock a zone shows at instant `ms`: { date, min }, or null.
function dscWallAt(ms, zone) {
  try {
    const p = {};
    for (const x of new Intl.DateTimeFormat("en-US", { timeZone: zone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).formatToParts(new Date(ms))) p[x.type] = x.value;
    const h = Number(p.hour) % 24;
    return p.year && Number.isFinite(h) ? { date: p.year + "-" + p.month + "-" + p.day, min: h * 60 + Number(p.minute) } : null;
  } catch (e) { return null; }
}
// The part of each time-off block that falls on `iso`, a date in `zone`, as minutes since that
// day's midnight: [{ start, end, id }]. A block that runs past midnight ends at 1440 on its first
// day and starts at 0 on the next. ⚠ THE DAY'S EDGES ARE INSTANTS FROM THE ZONE, NOT 24 HOURS
// APART: a DST day is 23 or 25 hours long, so midnight-to-midnight is asked of the zone.
function dscOffOn(list, iso, zone, BR) {
  if (!BR || !zone || !Array.isArray(list) || !list.length) return [];
  const d = dscRouteDate(iso);
  if (!d) return [];
  const n = dscAddDays(d, 1);
  const dayStart = BR.wallInstant(d.getFullYear(), d.getMonth() + 1, d.getDate(), 0, zone);
  const dayEnd = BR.wallInstant(n.getFullYear(), n.getMonth() + 1, n.getDate(), 0, zone);
  if (!Number.isFinite(dayStart) || !Number.isFinite(dayEnd)) return [];
  const out = [];
  for (const b of list) {
    const s = Date.parse(b.startsAt), e = Date.parse(b.endsAt);
    if (!(e > dayStart && s < dayEnd)) continue;
    const a = s <= dayStart ? 0 : (dscWallAt(s, zone) || {}).min;
    const z = e >= dayEnd ? 1440 : (dscWallAt(e, zone) || {}).min;
    if (Number.isFinite(a) && Number.isFinite(z) && z > a) out.push({ start: a, end: z, id: b.id });
  }
  return out;
}
// Under 760px seven columns are too narrow to read, so the week becomes the day view.
function useDscNarrow() {
  const q = "(max-width: 759px)";
  const get = () => { try { return !!(window.matchMedia && window.matchMedia(q).matches); } catch (e) { return false; } };
  const [narrow, setNarrow] = React.useState(get);
  React.useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(q);
    const on = () => setNarrow(mq.matches);
    if (mq.addEventListener) mq.addEventListener("change", on); else if (mq.addListener) mq.addListener(on);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", on); else if (mq.removeListener) mq.removeListener(on); };
  }, []);
  return narrow;
}
function dscInitials(name) { return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?"; }
function dscWhere(ev) {
  if (ev.sub === "inperson") return "In person";
  if (ev.sub === "phone") return "Phone";
  if (ev.sub === "message") return "Message";
  if (ev.sub === "video") return ev.meetingUrl ? "Video · room ready" : "Video · no room yet";
  return ev.sub || "—";
}

// ── The time grid (week and day) ────────────────────────────────────────────
//
// ⚠ POINTER EVENTS, NOT HTML5 DRAG. The old week view used `draggable`, and HTML5 drag does not
// fire on touch screens at all, so a coach on a tablet could not move a booking. A block takes
// the pointer on pointerdown and follows it through window-level moves; `touch-action: none`
// on the block keeps a finger's drag from scrolling the page instead. The verdict (clash,
// outside open hours, in the past) is asked for on every move, so the drop target is red
// BEFORE the coach lets go, not a "couldn't move it" after.
function DscTimeGrid({ days, byDate, blocks, offsFor, plansFor, onPlan, colorOf, todayIso, nowMin, startHour, endHour, slot, onSlot, onBookSlot, onPick, onMove, verdictFor, onDayHead, rules }) {
  const colsRef = React.useRef(null);
  const dragRef = React.useRef(null);
  const suppressRef = React.useRef(false);
  const [drag, setDrag] = React.useState(null);
  const isos = days.map(dscIso);
  const height = (endHour - startHour) * DSC_HOUR_PX;
  const yOf = (min) => ((min - startHour * 60) / 60) * DSC_HOUR_PX;
  const untimed = isos.map((iso) => (byDate.get(iso) || []).filter((e) => dscMin(e.time) == null));
  const anyUntimed = untimed.some((l) => l.length);
  // A drag in flight when the grid unmounts (a view switch mid-gesture) must not leave its
  // window listeners behind.
  React.useEffect(() => () => { if (dragRef.current) dragRef.current.cleanup(); }, []);

  const startDrag = (ev, e) => {
    suppressRef.current = false;
    if (!(ev.reschedulable || ev.editable) || !rules || (e.button != null && e.button > 0)) return;
    const box = colsRef.current && colsRef.current.getBoundingClientRect();
    const start = dscMin(ev.time);
    if (!box || start == null) return;
    const dur = dscDur(ev);
    // Where on the block the hand took hold, so the block moves WITH it.
    const d = { grabMin: startHour * 60 + ((e.clientY - box.top) / DSC_HOUR_PX) * 60 - start, x0: e.clientX, y0: e.clientY, moved: false, target: null };
    const move = (m) => {
      if (!d.moved && Math.abs(m.clientX - d.x0) + Math.abs(m.clientY - d.y0) < 6) return;
      d.moved = true;
      const rect = colsRef.current ? colsRef.current.getBoundingClientRect() : box;
      const at = rules.pointToSlot({ x: m.clientX, y: m.clientY, rect, columns: isos.length, startHour, hourPx: DSC_HOUR_PX, grabMin: d.grabMin, durationMin: dur });
      const date = isos[at.col];
      d.target = { date, minute: at.minute, verdict: verdictFor(ev, date, at.minute, dur) };
      setDrag({ id: ev.id, ...d.target, dur });
    };
    const finish = (commit) => {
      d.cleanup();
      dragRef.current = null;
      setDrag(null);
      if (!d.moved) return;
      // The click a browser fires after a drag is not a click on the booking.
      suppressRef.current = true;
      setTimeout(() => { suppressRef.current = false; }, 0);
      if (commit && d.target) onMove(ev, d.target.date, d.target.minute, d.target.verdict);
    };
    const up = () => finish(true);
    const cancel = () => finish(false);
    const key = (k) => { if (k.key === "Escape") finish(false); };
    d.cleanup = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", key);
    };
    dragRef.current = d;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", key);
  };

  const dragMsg = drag ? (drag.verdict.past ? "That time has passed"
    : drag.verdict.clash ? "Overlaps " + drag.verdict.clash.label + " — it won't move there"
    : drag.verdict.away ? "During your time off — you'll be asked first"
    : drag.verdict.outside ? "Outside your open hours — you'll be asked first"
    : "Drop to move to " + dscDayLabel(drag.date) + " · " + dscClock(drag.minute)) : "";
  const dragColor = drag ? (drag.verdict.past || drag.verdict.clash ? DSC_RUST : drag.verdict.outside || drag.verdict.away ? DSC_GOLD : DSC_TEAL) : DSC_TEAL;
  // ⚠ SPELLED OUT, NOT `repeat(7, …)`: pageShell's ≤900px stylesheet collapses any inline
  // `grid-template-columns: repeat(7…` to a single column, which would stack a tablet's week
  // grid into one tall column of seven.
  const cols = Array.from({ length: isos.length }, () => "minmax(0, 1fr)").join(" ");

  return (
    <div>
      <div role="status" aria-live="polite" style={{ minHeight: 14, fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.04em", color: dragColor, marginBottom: 4 }}>{dragMsg}</div>
      <div style={{ border: "1px solid " + DSC_HAIR, borderRadius: 8, overflow: "hidden", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.015)" }}>
        {/* Day heads */}
        <div style={{ display: "grid", gridTemplateColumns: "44px " + cols, borderBottom: "1px solid " + DSC_HAIR }}>
          <span />
          {days.map((d, i) => {
            const iso = isos[i];
            const today = iso === todayIso;
            const head = (
              <React.Fragment>
                <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: today ? DSC_TEAL : DSC_INK50 }}>{DSC_DOW[(d.getDay() + 6) % 7]}</span>
                <span style={{ display: "block", fontSize: 15, fontWeight: 600, color: today ? DSC_TEAL : "var(--sh-ink, #f2ede4)" }}>{d.getDate()}</span>
              </React.Fragment>
            );
            const style = { textAlign: "center", padding: "6px 0 5px", background: "transparent", borderTop: 0, borderRight: 0, borderBottom: 0, borderLeft: "1px solid " + DSC_HAIR, color: "inherit", font: "inherit", minWidth: 0 };
            return onDayHead && isos.length > 1
              ? <button key={iso} type="button" data-day-head={iso} onClick={() => onDayHead(iso)} title={"Open " + dscDayLabel(iso, true)} style={{ ...style, cursor: "pointer" }}>{head}</button>
              : <div key={iso} data-day-head={iso} style={style}>{head}</div>;
          })}
        </div>
        {/* All-day row: whatever has a date but no time — a program's workout, a menu day. */}
        {anyUntimed && (
          <div style={{ display: "grid", gridTemplateColumns: "44px " + cols, borderBottom: "1px solid " + DSC_HAIR }}>
            <span style={{ fontFamily: DSC_MONO, fontSize: 7.5, letterSpacing: "0.06em", textTransform: "uppercase", color: DSC_INK50, padding: "6px 4px 0", textAlign: "right" }}>All day</span>
            {untimed.map((list, i) => (
              <div key={isos[i]} style={{ borderLeft: "1px solid " + DSC_HAIR, padding: 3, minWidth: 0 }}>
                {list.slice(0, 3).map((ev) => <DscChip key={ev.id} ev={ev} compact drag={false} colorOf={colorOf} onClick={onPick} onDragStart={() => {}} />)}
                {list.length > 3 && <div style={{ fontFamily: DSC_MONO, fontSize: 7.5, color: DSC_INK50 }}>+{list.length - 3} more</div>}
              </div>
            ))}
          </div>
        )}
        {/* Plans row (step 4): what each client's program puts on the day. Read-only; a chip
            opens that client's file where the page has one. */}
        {plansFor && isos.some((iso) => plansFor(iso).length) && (
          <div data-plans-row="" style={{ display: "grid", gridTemplateColumns: "44px " + cols, borderBottom: "1px solid " + DSC_HAIR }}>
            <span style={{ fontFamily: DSC_MONO, fontSize: 7.5, letterSpacing: "0.06em", textTransform: "uppercase", color: DSC_INK50, padding: "6px 4px 0", textAlign: "right" }}>Plans</span>
            {isos.map((iso) => {
              const list = plansFor(iso);
              return (
                <div key={iso} data-plans-day={iso} style={{ borderLeft: "1px solid " + DSC_HAIR, padding: 3, minWidth: 0, display: "grid", gap: 2, alignContent: "start" }}>
                  {list.slice(0, 3).map((p) => {
                    const color = (colorOf || dscClientColor)(p.clientId || p.with);
                    const label = String(p.with || "Client").split(" ")[0] + " · " + p.title;
                    const style = { display: "flex", alignItems: "center", gap: 4, minWidth: 0, padding: "1px 4px", borderRadius: 3, border: 0, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.05)", color: "inherit", font: "inherit", fontSize: 10, lineHeight: 1.3, textAlign: "left", cursor: onPlan ? "pointer" : "default" };
                    const inner = <React.Fragment><span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: color, flex: "0 0 auto" }} /><span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{label}</span></React.Fragment>;
                    return onPlan
                      ? <button key={p.id} type="button" data-plan={p.id} title={(p.with || "Client") + " · " + p.title + " (their program)"} onClick={() => onPlan(p)} style={style}>{inner}</button>
                      : <div key={p.id} data-plan={p.id} title={(p.with || "Client") + " · " + p.title + " (their program)"} style={style}>{inner}</div>;
                  })}
                  {list.length > 3 && <div style={{ fontFamily: DSC_MONO, fontSize: 7.5, color: DSC_INK50 }}>+{list.length - 3} more</div>}
                </div>
              );
            })}
          </div>
        )}
        {/* Hours */}
        <div style={{ display: "grid", gridTemplateColumns: "44px minmax(0, 1fr)" }}>
          <div aria-hidden data-gutter="" style={{ position: "relative", height }}>
            {Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i).map((h, i) => (
              <span key={h} style={{ position: "absolute", right: 6, top: yOf(h * 60), transform: i === 0 ? "none" : h === endHour ? "translateY(-100%)" : "translateY(-50%)", fontFamily: DSC_MONO, fontSize: 8.5, color: DSC_INK50 }}>{dscHourLabel(h)}</span>
            ))}
          </div>
          <div ref={colsRef} data-dsc-cols="" style={{ display: "grid", gridTemplateColumns: cols, position: "relative", height }}>
            {isos.map((iso, i) => {
              const wd = days[i].getDay();
              const timed = (byDate.get(iso) || []).map((e) => ({ e, s: dscMin(e.time) })).filter((x) => x.s != null);
              const lanes = rules ? rules.layoutLanes(timed.map(({ e, s }) => ({ id: e.id, start: s, end: s + dscDur(e) }))) : new Map();
              return (
                <div key={iso} data-col-date={iso}
                  onClick={(e) => {
                    if (e.target && e.target.closest && e.target.closest("[data-dsc-block],[data-dsc-ghost]")) return;
                    if (suppressRef.current) { suppressRef.current = false; return; }
                    const r = e.currentTarget.getBoundingClientRect();
                    const raw = startHour * 60 + ((e.clientY - r.top) / DSC_HOUR_PX) * 60;
                    onSlot(iso, Math.max(0, Math.min(1425, Math.floor(raw / 15) * 15)));
                  }}
                  style={{ position: "relative", borderLeft: "1px solid " + DSC_HAIR, cursor: "copy", minWidth: 0,
                    backgroundImage: "repeating-linear-gradient(to bottom, transparent 0, transparent " + (DSC_HOUR_PX - 1) + "px, rgba(var(--sh-ink-rgb, 242,237,228),0.06) " + (DSC_HOUR_PX - 1) + "px, rgba(var(--sh-ink-rgb, 242,237,228),0.06) " + DSC_HOUR_PX + "px)" }}>
                  {/* Open hours, faint, under everything */}
                  {blocks && (blocks[wd] || []).map((b, k) => {
                    const s = Math.max(b.start, startHour * 60), en = Math.min(b.end, 1440, endHour * 60);
                    return en > s ? <div key={k} aria-hidden data-open-band="" style={{ position: "absolute", left: 0, right: 0, top: yOf(s), height: yOf(en) - yOf(s), background: "rgba(var(--sh-accent-rgb, 46,224,196),0.07)", borderLeft: "2px solid rgba(var(--sh-accent-rgb, 46,224,196),0.4)", pointerEvents: "none" }} /> : null;
                  })}
                  {/* Time off, hatched over the hours; a click still reaches the column (booking asks first). */}
                  {offsFor && offsFor(iso).map((o, k) => {
                    const s = Math.max(o.start, startHour * 60), en = Math.min(o.end, endHour * 60);
                    return en > s ? (
                      <div key={"off" + k} data-time-off="" style={{ position: "absolute", left: 0, right: 0, top: yOf(s), height: yOf(en) - yOf(s), zIndex: 1, pointerEvents: "none", background: "repeating-linear-gradient(135deg, rgba(var(--sh-ink-rgb, 242,237,228),0.08) 0 6px, transparent 6px 12px)", borderTop: "1px solid " + DSC_HAIR, borderBottom: "1px solid " + DSC_HAIR }}>
                        <span style={{ display: "block", padding: "3px 6px", fontFamily: DSC_MONO, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_INK50 }}>Time off</span>
                      </div>
                    ) : null;
                  })}
                  {timed.map(({ e, s }) => {
                    const color = (colorOf || dscClientColor)(e.clientId || e.with || e.title);
                    const pos = lanes.get(e.id) || { lane: 0, lanes: 1 };
                    const h = (dscDur(e) / 60) * DSC_HOUR_PX;
                    const movable = !!(e.reschedulable || e.editable);
                    const requested = e.status === "requested";
                    const done = e.status === "completed";
                    const dragging = drag && drag.id === e.id;
                    return (
                      <div key={e.id} data-dsc-block={e.id} role="button" tabIndex={0}
                        aria-label={(e.with || e.title) + ", " + dscDayLabel(iso) + " " + dscClock(s) + (requested ? ", requested" : done ? ", done" : "")}
                        onPointerDown={(pe) => startDrag(e, pe)}
                        onClick={() => { if (suppressRef.current) { suppressRef.current = false; return; } onPick(e); }}
                        onKeyDown={(k) => { if (k.key === "Enter" || k.key === " ") { k.preventDefault(); onPick(e); } }}
                        style={{
                          position: "absolute", top: yOf(s) + 1, height: Math.max(20, h - 2),
                          left: "calc(" + (pos.lane * 100) / pos.lanes + "% + 3px)", width: "calc(" + 100 / pos.lanes + "% - 6px)",
                          boxSizing: "border-box", borderRadius: 5, padding: "3px 6px", overflow: "hidden", zIndex: 2,
                          cursor: movable ? "grab" : "pointer", touchAction: movable ? "none" : "auto", userSelect: "none",
                          background: requested ? "rgba(var(--sh-ground-rgb, 26,22,18),0.55)" : color + "29",
                          borderTop: requested ? "1.5px dashed " + color : "0 solid transparent",
                          borderRight: requested ? "1.5px dashed " + color : "0 solid transparent",
                          borderBottom: requested ? "1.5px dashed " + color : "0 solid transparent",
                          borderLeft: "3px " + (requested ? "dashed " : "solid ") + color,
                          opacity: dragging ? 0.35 : done ? 0.62 : 1,
                        }}>
                        <div style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{done ? "✓ " : ""}{e.with || e.title}</div>
                        {h >= 30 && <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, color: DSC_INK50, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{dscFmt12(e.time)}{requested ? " · requested" : e.with ? " · " + e.title : ""}</div>}
                        {!movable && h >= 44 && <div style={{ fontSize: 8, color: DSC_INK50 }}>🔒︎ read-only</div>}
                      </div>
                    );
                  })}
                  {/* The now line, on the zone's clock */}
                  {iso === todayIso && nowMin != null && nowMin >= startHour * 60 && nowMin <= endHour * 60 && (
                    <div aria-hidden data-now-line="" style={{ position: "absolute", left: 0, right: 0, top: yOf(nowMin), borderTop: "2px solid " + DSC_RUST, zIndex: 3, pointerEvents: "none" }}>
                      <span style={{ position: "absolute", left: -4, top: -5, width: 8, height: 8, borderRadius: "50%", background: DSC_RUST }} />
                    </div>
                  )}
                  {/* "+ Book" on the empty time the coach clicked */}
                  {slot && slot.date === iso && (
                    <button type="button" data-dsc-ghost="" onClick={(e) => { e.stopPropagation(); onBookSlot(); }}
                      style={{ position: "absolute", left: 3, right: 3, top: yOf(slot.minute) + 1, height: Math.max(22, (slot.dur / 60) * DSC_HOUR_PX - 2), zIndex: 4,
                        border: "1.5px dashed " + DSC_TEAL, borderRadius: 5, background: "rgba(var(--sh-accent-rgb, 46,224,196),0.1)", color: DSC_TEAL_INK,
                        fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", cursor: "pointer", padding: 0 }}>
                      + Book {dscClock(slot.minute)}
                    </button>
                  )}
                  {/* Where a dragged booking would land, coloured by the verdict */}
                  {drag && drag.date === iso && (
                    <div aria-hidden data-drop-target={drag.verdict.clash || drag.verdict.past ? "refused" : drag.verdict.outside ? "outside" : "ok"}
                      style={{ position: "absolute", left: 3, right: 3, top: yOf(drag.minute) + 1, height: Math.max(20, (drag.dur / 60) * DSC_HOUR_PX - 2), zIndex: 5, pointerEvents: "none",
                        border: "2px " + (drag.verdict.outside && !drag.verdict.clash && !drag.verdict.past ? "dashed " : "solid ") + dragColor, borderRadius: 5,
                        // Opaque ground under the tint, so the booking it lands on cannot read through it.
                        backgroundColor: "var(--sh-ground2, #14110e)",
                        backgroundImage: drag.verdict.clash || drag.verdict.past
                          ? "linear-gradient(rgba(var(--sh-rust-rgb, 224,100,75),0.18), rgba(var(--sh-rust-rgb, 224,100,75),0.18))"
                          : "linear-gradient(rgba(var(--sh-accent-rgb, 46,224,196),0.14), rgba(var(--sh-accent-rgb, 46,224,196),0.14))",
                        fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, color: dragColor === DSC_TEAL ? DSC_TEAL_INK : dragColor, padding: "2px 5px", overflow: "hidden", whiteSpace: "nowrap" }}>
                      {dscClock(drag.minute)}{drag.verdict.clash ? " · overlaps" : drag.verdict.past ? " · past" : drag.verdict.outside ? " · outside hours" : ""}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Shared sheet chrome ─────────────────────────────────────────────────────
function DscModal({ label, accent, onClose, children, width = 420 }) {
  const boxRef = React.useRef(null);
  React.useEffect(() => {
    const key = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  // Focus goes into the dialog when it opens and back to what opened it when it closes, so a
  // keyboard user lands on the actions rather than behind the overlay.
  React.useEffect(() => {
    const back = document.activeElement;
    if (boxRef.current && boxRef.current.focus) boxRef.current.focus();
    return () => { if (back && back.focus && document.body.contains(back)) back.focus(); };
  }, []);
  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 240 }}>
      <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.6)", backdropFilter: "blur(3px)" }} />
      <div role="dialog" aria-modal="true" aria-label={label} ref={boxRef} tabIndex={-1}
        style={{ outline: "none", position: "absolute", top: "50%", left: "50%", transform: "translate(-50%,-50%)", width: "min(" + width + "px, 92vw)", maxHeight: "88vh", overflowY: "auto", boxSizing: "border-box", background: "var(--sh-ground2, #14110e)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.14)", borderTop: "4px solid " + accent, borderRadius: 10, padding: 20, color: "var(--sh-ink, #f2ede4)", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)" }}>
        {children}
      </div>
    </div>
  );
}
const dscBtn = (kind) => ({
  fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", borderRadius: 4, padding: "8px 12px", cursor: "pointer", textDecoration: "none", display: "inline-block",
  color: kind === "on" ? "var(--sh-deep, #06231f)" : kind === "warn" ? DSC_RUST : "rgba(var(--sh-ink-rgb, 242,237,228),0.78)",
  background: kind === "on" ? DSC_TEAL : "transparent",
  border: kind === "on" ? "1px solid transparent" : "1px solid " + (kind === "warn" ? "rgba(var(--sh-rust-rgb, 224,100,75),0.5)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.18)"),
});
function DscKV({ rows }) {
  return (
    <div style={{ display: "grid", gap: 7, fontSize: 12.5 }}>
      {rows.map(([k, v]) => (
        <div key={k} style={{ display: "grid", gridTemplateColumns: "92px 1fr", gap: 8 }}>
          <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_INK50, paddingTop: 2 }}>{k}</span>
          <span style={{ lineHeight: 1.45 }}>{v}</span>
        </div>
      ))}
    </div>
  );
}
// A time picker in 15-minute steps, 5:00 AM to 11:45 PM.
function DscTimeSelect({ value, onChange, label }) {
  const opts = [];
  for (let m = 5 * 60; m < 24 * 60; m += 15) opts.push(m);
  if (value != null && !opts.includes(value)) opts.unshift(value);
  return (
    <select aria-label={label} value={value == null ? "" : String(value)} onChange={(e) => onChange(Number(e.target.value))}
      style={{ background: "transparent", color: "inherit", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.2)", borderRadius: 4, padding: "6px 8px", fontFamily: DSC_MONO, fontSize: 11 }}>
      {opts.map((m) => <option key={m} value={m}>{dscClock(m)}</option>)}
    </select>
  );
}
const dscInput = { background: "transparent", color: "inherit", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.2)", borderRadius: 4, padding: "6px 8px", fontFamily: DSC_MONO, fontSize: 11, colorScheme: "dark light" };
function DscVerdict({ v }) {
  if (!v) return null;
  const text = v.past ? "That time has passed." : v.clash ? "Overlaps " + v.clash.label + "." : v.away ? "During your time off." : v.outside ? "Outside your open hours." : null;
  if (!text) return null;
  return <div role="alert" style={{ fontFamily: DSC_MONO, fontSize: 9.5, letterSpacing: "0.04em", color: v.past || v.clash ? DSC_RUST : DSC_GOLD, marginTop: 8 }}>{text}</div>;
}

// What the coach should know before this session, from data already on the page — never
// invented. The record is the roster's (useDashboard); "last session" is read off the loaded
// calendar, because the roster's `lastAt` is the newest booking of ANY status, upcoming ones
// included, and would name this very session.
function dscPrep({ row, ev, events, todayIso, nowMin, role }) {
  const out = [];
  if (ev && ev.clientId) {
    const at = (e) => e.date + " " + (e.time || "00:00");
    const here = at(ev);
    const nowKey = todayIso + " " + dscHHMM(nowMin == null ? 0 : nowMin);
    const past = (events || []).filter((e) => e.id !== ev.id && e.source === "session" && e.clientId === ev.clientId
      && (e.status === "confirmed" || e.status === "completed") && at(e) < here && at(e) <= nowKey)
      .sort((a, b) => (at(a) < at(b) ? 1 : -1))[0];
    if (past) out.push(["Last session", dscDayLabel(past.date) + " · " + past.title + (past.status === "completed" ? " · done" : "")]);
  }
  const c = row && row.client;
  if (!c) return out;
  if (c.trainingAdherence && c.trainingAdherence.planned) out.push(["Attendance", c.trainingAdherence.done + " of " + c.trainingAdherence.planned + " sessions done · 42 days"]);
  if (role === "nutritionist" && c.foodLogs && c.foodLogs.daysLogged7d != null) out.push(["Food log", c.foodLogs.daysLogged7d + "/7 days" + (c.foodLogs.lastLoggedOn ? " · last " + dscDayLabel(String(c.foodLogs.lastLoggedOn).slice(0, 10)) : "")]);
  if (c.program && c.program.name) out.push(["Program", c.program.name + (c.program.status === "paused" ? " · paused" : c.program.week ? " · week " + c.program.week + (c.program.weeks ? " of " + c.program.weeks : "") : "")]);
  if (c.checkIn) {
    // Check-ins are weekly (the triage engine's rule): this week's is either in or due.
    const thisMon = dscIso(dscMonday(dscRouteDate(todayIso) || new Date()));
    const last = c.checkIn.lastWeekOf ? String(c.checkIn.lastWeekOf).slice(0, 10) : null;
    out.push(["Check-in", !last ? "None yet" : last >= thisMon ? "This week's is in" : "Due this week · last was week of " + dscDayLabel(last)]);
  }
  const note = Array.isArray(c.coachNotes) && c.coachNotes[0] && c.coachNotes[0].text;
  if (note) out.push(["Your note", note]);
  return out;
}

// ── The booking sheet ───────────────────────────────────────────────────────
// Replaces the read-only card for sessions and consults: who, when, where, status, and the
// actions a coach takes on a booking. Plan items and manual events keep DscEventSheet below.
// ⚠ NO "NO-SHOW". `sessions.status` allows requested · confirmed · declined · completed ·
// cancelled (2026-04-18-sessions-and-availability.sql) and nothing else, so a no-show could
// only be faked as one of those. Registered for a migration rather than mislabelled.
function DscBookingSheet({ ev, row, colorOf, prep, busy, startInMove, verdictFor, onAction, onMove, onOpenFile, onClose }) {
  const color = (colorOf || dscClientColor)(ev.clientId || ev.with || ev.title);
  const s = dscMin(ev.time);
  const [moving, setMoving] = React.useState(!!startInMove);
  const [date, setDate] = React.useState(ev.date);
  const [minute, setMinute] = React.useState(s == null ? 9 * 60 : s);
  const [confirmCancel, setConfirmCancel] = React.useState(false);
  const verdict = moving ? verdictFor(ev, date, minute, dscDur(ev)) : null;
  const first = String(ev.with || "the client").split(" ")[0];
  const requested = ev.status === "requested", confirmed = ev.status === "confirmed", done = ev.status === "completed";
  const started = s != null && verdictFor(ev, ev.date, s, 1).past;
  const status = requested ? "Requested · waiting on you" : confirmed ? "Confirmed" : done ? "Done" : ev.status;
  return (
    <DscModal label={(ev.kind === "CONSULT" ? "Consult" : "Session") + " with " + (ev.with || "client")} accent={color} onClose={onClose}>
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span aria-hidden style={{ width: 36, height: 36, flex: "0 0 auto", borderRadius: 8, display: "grid", placeItems: "center", fontFamily: DSC_MONO, fontWeight: 700, fontSize: 12, border: "1.5px solid " + color, color }}>{dscInitials(ev.with || ev.title)}</span>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color }}>{ev.kind === "CONSULT" ? "Consult" : "Session"}{ev.with ? " · " + ev.with : ""}</div>
          <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 21, marginTop: 2 }}>{ev.title}</div>
        </div>
      </div>
      <div style={{ marginTop: 14 }}>
        <DscKV rows={[
          ["When", dscDayLabel(ev.date) + (s != null ? " · " + dscClock(s) + "–" + dscClock(s + dscDur(ev)) : "")],
          ["Where", dscWhere(ev)],
          ["Status", status],
          ...(ev.seriesId ? [["Repeats", "Part of a weekly run"]] : []),
        ]} />
      </div>

      {moving ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + DSC_HAIR }}>
          <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DSC_INK50, marginBottom: 8 }}>{requested ? "Offer another time" : "Move to"}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
            <input type="date" aria-label="New date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={dscInput} />
            <DscTimeSelect label="New time" value={minute} onChange={setMinute} />
          </div>
          <DscVerdict v={verdict} />
          <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
            <button type="button" disabled={busy || !verdict || verdict.past || !!verdict.clash || (date === ev.date && minute === s)} onClick={() => onMove(ev, date, minute, verdict)}
              style={{ ...dscBtn("on"), opacity: busy || !verdict || verdict.past || verdict.clash || (date === ev.date && minute === s) ? 0.45 : 1 }}>
              {verdict && verdict.outside ? "Move outside hours" : "Move"} · {first} is told
            </button>
            <button type="button" onClick={() => setMoving(false)} style={dscBtn()}>Back</button>
          </div>
        </div>
      ) : confirmCancel ? (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + DSC_HAIR }}>
          {ev.seriesId ? (
            <>
              <div style={{ fontSize: 13 }}>Cancel this session, or this one and the rest of its weekly run? {first} is told.</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button type="button" disabled={busy} onClick={() => onAction(ev, "cancel")} style={dscBtn("warn")}>This session</button>
                <button type="button" disabled={busy} onClick={() => onAction(ev, "cancel", { scope: "following" })} style={dscBtn("warn")}>This and following</button>
                <button type="button" onClick={() => setConfirmCancel(false)} style={dscBtn()}>Keep them</button>
              </div>
            </>
          ) : (
            <>
              <div style={{ fontSize: 13 }}>Cancel this session? {first} is told.</div>
              <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
                <button type="button" disabled={busy} onClick={() => onAction(ev, "cancel")} style={dscBtn("warn")}>Yes, cancel it</button>
                <button type="button" onClick={() => setConfirmCancel(false)} style={dscBtn()}>Keep it</button>
              </div>
            </>
          )}
        </div>
      ) : (
        <div style={{ marginTop: 14, display: "grid", gap: 8 }}>
          {requested && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button type="button" disabled={busy} onClick={() => onAction(ev, "confirm")} style={dscBtn("on")}>Accept</button>
              <button type="button" disabled={busy} onClick={() => setMoving(true)} style={dscBtn()}>Other time</button>
              <button type="button" disabled={busy} onClick={() => onAction(ev, "decline")} style={dscBtn("warn")}>Decline</button>
            </div>
          )}
          {confirmed && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {ev.meetingUrl && <a href={ev.meetingUrl} target="_blank" rel="noreferrer" style={dscBtn("on")}>Join ↗</a>}
              <button type="button" disabled={busy} onClick={() => setMoving(true)} style={dscBtn()}>Reschedule</button>
              <button type="button" disabled={busy} onClick={() => setConfirmCancel(true)} style={dscBtn()}>Cancel</button>
            </div>
          )}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {/* Done is a fact about the past: offered once the session has started. */}
            {confirmed && <button type="button" disabled={busy || !started} title={started ? undefined : "Once the session has started"} onClick={() => onAction(ev, "complete")} style={{ ...dscBtn(), opacity: busy || !started ? 0.45 : 1 }}>✓ Mark done</button>}
            {row && onOpenFile && <button type="button" onClick={() => onOpenFile(row)} style={dscBtn()}>Open client file →</button>}
          </div>
        </div>
      )}

      {prep.length > 0 && (
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid " + DSC_HAIR }}>
          <DscKV rows={prep} />
        </div>
      )}
      {!row && ev.clientId && (
        <div style={{ marginTop: 12, fontSize: 11.5, color: DSC_INK50 }}>Not on your client list — {requested ? "a prospect asking for a first session" : "no client file to open"}.</div>
      )}
      <div style={{ marginTop: 16 }}><button type="button" onClick={onClose} style={dscBtn()}>Close</button></div>
    </DscModal>
  );
}

// ── Book from an empty slot ─────────────────────────────────────────────────
// The length starts at what each role books: an hour for a trainer (the Team page's session,
// clientTeam.jsx CT_SESSION_MIN) and 15 minutes for a nutritionist (the consult,
// /api/consultation's duration_min). Both are a pick, not a rule.
const DSC_LENGTHS = [15, 30, 45, 60, 90];
const DSC_TYPES = [["video", "Video"], ["inperson", "In person"], ["phone", "Phone"]];
function DscBookSheet({ slot, roster, role, verdictFor, onBook, onClose, onDone }) {
  const [date, setDate] = React.useState(slot.date);
  const [minute, setMinute] = React.useState(slot.minute);
  const [clientId, setClientId] = React.useState(roster.length === 1 ? roster[0].client.profile.id : "");
  const [dur, setDur] = React.useState(role === "nutritionist" ? 15 : 60);
  const [type, setType] = React.useState("video");
  const [topic, setTopic] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  // A weekly run: the first date's own weekday is always in it (the run starts with this
  // booking), and any others the coach adds. Up to 60 sessions, the route's ceiling.
  const [weekly, setWeekly] = React.useState(false);
  const [weeks, setWeeks] = React.useState(8);
  const [extraDays, setExtraDays] = React.useState([]);
  const [skipped, setSkipped] = React.useState(null);   // after a run: the dates it could not book
  const firstWd = dscWeekday(date);
  const runDays = firstWd == null ? extraDays : [...new Set([firstWd, ...extraDays])].sort((a, b) => a - b);
  const runDates = weekly ? dscRunDates(date, weeks, runDays) : [];
  const tooMany = runDates.length > 60;
  const v = verdictFor(null, date, minute, dur);
  const row = roster.find((r) => r.client.profile.id === clientId) || null;
  const blocked = busy || !row || v.past || !!v.clash || tooMany;
  const pill = (on) => ({ ...dscBtn(on ? "on" : null), padding: "6px 10px" });
  const submit = async () => {
    if (blocked) return;
    setBusy(true); setErr("");
    const out = await onBook({ row, date, minute, durationMin: dur, type, topic: topic.trim(), ...(weekly ? { repeat: { weeks, weekdays: runDays } } : {}) });
    setBusy(false);
    if (!out || !out.ok) { setErr((out && out.error) || "Couldn't book it — try again."); return; }
    // A run that skipped dates says which before the sheet goes, rather than in a toast.
    if (out.skipped && out.skipped.length) setSkipped(out); else onClose();
  };
  if (skipped) {
    return (
      <DscModal label="Weekly run booked" accent={DSC_TEAL} onClose={onClose}>
        <div style={{ fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: DSC_TEAL }}>Weekly run</div>
        <div role="status" style={{ fontSize: 14, marginTop: 6 }}>Booked {skipped.booked} of {skipped.booked + skipped.skipped.length}. {skipped.first} is told.</div>
        <div style={{ marginTop: 10, fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50 }}>Not booked</div>
        <ul style={{ margin: "6px 0 0", paddingLeft: 18, display: "grid", gap: 4, fontSize: 12.5 }}>
          {skipped.skipped.map((x) => <li key={x.date + x.time}>{x.message}</li>)}
        </ul>
        <div style={{ marginTop: 16 }}><button type="button" onClick={onDone || onClose} style={dscBtn("on")}>Done</button></div>
      </DscModal>
    );
  }
  return (
    <DscModal label="Book a session" accent={DSC_TEAL} onClose={onClose}>
      <div style={{ fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: DSC_TEAL }}>Book a {role === "nutritionist" ? "consult" : "session"}</div>
      <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 21, margin: "4px 0 12px" }}>{dscDayLabel(date, true)} · {dscClock(minute)}</div>
      <div style={{ display: "grid", gap: 12 }}>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50 }}>Client</span>
          {roster.length ? (
            <select aria-label="Client" value={clientId} onChange={(e) => setClientId(e.target.value)} style={{ ...dscInput, fontSize: 12.5, fontFamily: "inherit" }}>
              <option value="">Pick a client…</option>
              {roster.map((r) => <option key={r.client.profile.id} value={r.client.profile.id}>{r.client.profile.name}</option>)}
            </select>
          ) : <span style={{ fontSize: 12.5, color: DSC_INK50 }}>No clients on your roster yet — a member who subscribes shows up here.</span>}
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <input type="date" aria-label="Date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} style={dscInput} />
          <DscTimeSelect label="Start" value={minute} onChange={setMinute} />
        </div>
        <div>
          <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50, marginBottom: 5 }}>Length</div>
          <div role="group" aria-label="Length" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {DSC_LENGTHS.map((m) => <button key={m} type="button" aria-pressed={dur === m} onClick={() => setDur(m)} style={pill(dur === m)}>{m} min</button>)}
          </div>
        </div>
        <div>
          <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50, marginBottom: 5 }}>Where</div>
          <div role="group" aria-label="Where" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {DSC_TYPES.map(([k, l]) => <button key={k} type="button" aria-pressed={type === k} onClick={() => setType(k)} style={pill(type === k)}>{l}</button>)}
          </div>
        </div>
        <label style={{ display: "grid", gap: 5 }}>
          <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50 }}>Focus · optional</span>
          <input type="text" aria-label="Focus" maxLength={200} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder={role === "nutritionist" ? "e.g. Plan review" : "e.g. Lower A"} style={{ ...dscInput, fontSize: 12.5, fontFamily: "inherit" }} />
        </label>
        <div>
          <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50, marginBottom: 5 }}>Repeat</div>
          <div role="group" aria-label="Repeat" style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            <button type="button" aria-pressed={!weekly} onClick={() => setWeekly(false)} style={pill(!weekly)}>Doesn’t repeat</button>
            <button type="button" aria-pressed={weekly} onClick={() => setWeekly(true)} style={pill(weekly)}>Weekly</button>
          </div>
          {weekly && (
            <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
              <div role="group" aria-label="Days" style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                {DSC_WD.map((l, i) => {
                  const on = runDays.includes(i), locked = i === firstWd;
                  return <button key={l} type="button" aria-label={l} aria-pressed={on} disabled={locked} title={locked ? "The run starts with this booking" : undefined}
                    onClick={() => setExtraDays((d) => (d.includes(i) ? d.filter((x) => x !== i) : [...d, i]))}
                    style={{ ...pill(on), padding: "6px 8px", minWidth: 34, opacity: locked ? 0.85 : 1 }}>{l.slice(0, 2)}</button>;
                })}
              </div>
              <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5 }}>
                <span>For</span>
                <select aria-label="Weeks" value={weeks} onChange={(e) => setWeeks(Number(e.target.value))} style={{ ...dscInput, fontSize: 12.5, fontFamily: "inherit" }}>
                  {DSC_RUN_WEEKS.map((n) => <option key={n} value={n}>{n} weeks</option>)}
                </select>
              </label>
              <div role="status" style={{ fontSize: 12, color: tooMany ? DSC_RUST : DSC_INK50 }}>
                {tooMany ? runDates.length + " sessions is more than one run can book (60). Pick fewer days or weeks."
                  : runDates.length + " sessions · last on " + dscDayLabel(runDates[runDates.length - 1]) + ". A date that overlaps another booking is skipped, and named."}
              </div>
            </div>
          )}
        </div>
      </div>
      <DscVerdict v={v} />
      {err && <div role="alert" style={{ fontSize: 12.5, color: DSC_RUST, marginTop: 8 }}>{err}</div>}
      <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
        <button type="button" disabled={blocked} onClick={submit} style={{ ...dscBtn("on"), opacity: blocked ? 0.45 : 1 }}>
          {busy ? "Booking…" : (weekly && runDates.length > 1 ? "Book " + runDates.length + " sessions" : "Book") + (v.away ? " in time off" : v.outside ? " outside hours" : "") + (row ? " · " + row.client.profile.name.split(" ")[0] + " is told" : "")}
        </button>
        <button type="button" onClick={onClose} style={dscBtn()}>Cancel</button>
      </div>
    </DscModal>
  );
}

// "Outside your open hours" — the one verdict a coach may overrule, so it asks.
function DscConfirmMove({ move, onYes, onNo }) {
  const away = move.why === "away";
  const title = away ? "During your time off" : "Outside your open hours";
  return (
    <DscModal label={title} accent={DSC_GOLD} onClose={onNo} width={380}>
      <div style={{ fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: DSC_GOLD }}>{title}</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>
        {dscDayLabel(move.date)} · {dscClock(dscMin(move.time))} {away ? "is in your time off" : "isn't in the hours you've opened"}. Move {move.ev.with || move.ev.title} there anyway?
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
        <button type="button" onClick={onYes} style={dscBtn("on")}>Move anyway</button>
        <button type="button" onClick={onNo} style={dscBtn()}>Keep it</button>
      </div>
    </DscModal>
  );
}

// A booking of a weekly run is moved alone or with the rest of the run, the coach's call.
function DscScopeAsk({ ask, onPick, onNo }) {
  const who = ask.ev.with || ask.ev.title;
  return (
    <DscModal label="Move a weekly session" accent={DSC_TEAL} onClose={onNo} width={400}>
      <div style={{ fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.14em", textTransform: "uppercase", color: DSC_TEAL }}>Weekly run</div>
      <div style={{ fontSize: 13.5, lineHeight: 1.5, marginTop: 8 }}>
        Move {who} to {dscDayLabel(ask.date)} · {dscClock(dscMin(ask.time))}. Just this session, or this one and the rest of the run? The rest keep their weekly rhythm on the new day and time.
      </div>
      <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
        <button type="button" onClick={() => onPick("one")} style={dscBtn("on")}>Just this one</button>
        <button type="button" onClick={() => onPick("following")} style={dscBtn("on")}>This and following</button>
        <button type="button" onClick={onNo} style={dscBtn()}>Keep it</button>
      </div>
    </DscModal>
  );
}

// ── Requests strip ──────────────────────────────────────────────────────────
// Every upcoming request on the loaded calendar, answered where the coach is looking. A
// request used to look exactly like a confirmed booking, and the website had no confirm or
// decline anywhere.
function DscRequests({ list, busyId, onAccept, onDecline, onOther, onPick }) {
  if (!list.length) return null;
  const shown = list.slice(0, 4);
  return (
    <div role="region" aria-label="Requests to confirm" style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", border: "1px dashed rgba(var(--sh-gold-rgb, 216,162,58),0.55)", borderRadius: 8, padding: "8px 10px", background: "rgba(var(--sh-gold-rgb, 216,162,58),0.06)", marginBottom: 12 }}>
      <span style={{ fontFamily: DSC_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_GOLD }}>{list.length} to confirm</span>
      {shown.map((ev) => (
        <span key={ev.id} data-request={ev.sessionId || ev.id} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12.5, paddingLeft: 10, borderLeft: "1px solid " + DSC_HAIR, flexWrap: "wrap" }}>
          <button type="button" onClick={() => onPick(ev)} style={{ background: "transparent", border: 0, padding: 0, color: "inherit", font: "inherit", fontWeight: 600, cursor: "pointer" }}>{ev.with || ev.title}</button>
          <span style={{ fontFamily: DSC_MONO, fontSize: 10, color: DSC_INK50 }}>{dscDayLabel(ev.date).split(",")[0]} {ev.time ? dscClock(dscMin(ev.time)) : ""}</span>
          <button type="button" disabled={busyId === ev.id} onClick={() => onAccept(ev)} style={{ ...dscBtn("on"), padding: "3px 7px", fontSize: 8.5 }}>Accept</button>
          <button type="button" disabled={busyId === ev.id} onClick={() => onOther(ev)} style={{ ...dscBtn(), padding: "3px 7px", fontSize: 8.5 }}>Other time</button>
          <button type="button" disabled={busyId === ev.id} onClick={() => onDecline(ev)} style={{ ...dscBtn("warn"), padding: "3px 7px", fontSize: 8.5 }}>Decline</button>
        </span>
      ))}
      {list.length > shown.length && <span style={{ fontFamily: DSC_MONO, fontSize: 9, color: DSC_INK50 }}>+{list.length - shown.length} more on the calendar</span>}
    </div>
  );
}

// ── The day's agenda (day view) ─────────────────────────────────────────────
function DscAgenda({ iso, items, load, prepFor, colorOf, onPick }) {
  const sessions = items.filter((e) => e.source === "session");
  return (
    <div>
      <div className="dash-eyebrow" style={{ marginBottom: 4 }}>{dscDayLabel(iso, true)}</div>
      <div style={{ fontFamily: serif, fontSize: 18, letterSpacing: "-0.01em", marginBottom: 12 }}>
        {sessions.length} {sessions.length === 1 ? "session" : "sessions"}{load && load.openMin ? " · " + window.ShapeScheduleRules.hoursLabel(load.freeMin) + " h free" : ""}
      </div>
      {!items.length && <div style={{ fontSize: 12.5, color: DSC_INK50 }}>Nothing booked. Click open time on the grid to book a client.</div>}
      <div style={{ display: "grid", gap: 10 }}>
        {items.map((e) => {
          const s = dscMin(e.time);
          const color = (colorOf || dscClientColor)(e.clientId || e.with || e.title);
          const prep = e.source === "session" ? prepFor(e).slice(0, 4) : [];
          return (
            <button key={e.id} type="button" data-agenda={e.id} onClick={() => onPick(e)}
              style={{ textAlign: "left", background: "rgba(var(--sh-ink-rgb, 242,237,228),0.02)", color: "inherit", font: "inherit", cursor: "pointer", border: "1px solid " + DSC_HAIR, borderLeft: "3px " + (e.status === "requested" ? "dashed " : "solid ") + color, borderRadius: 6, padding: "9px 11px" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                <span style={{ fontFamily: DSC_MONO, fontSize: 10, color: DSC_INK50 }}>{s == null ? "All day" : dscClock(s) + "–" + dscClock(s + dscDur(e))}</span>
                <span style={{ fontWeight: 600, fontSize: 13 }}>{e.with || e.title}</span>
                {e.with && <span style={{ fontSize: 12, color: DSC_INK50 }}>{e.title}</span>}
                {e.status === "requested" && <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_GOLD }}>requested</span>}
                {e.status === "completed" && <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_INK50 }}>✓ done</span>}
              </div>
              {prep.length > 0 && (
                <div style={{ display: "grid", gap: 3, marginTop: 6 }}>
                  {prep.map(([k, v]) => (
                    <div key={k} style={{ fontSize: 11.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.72)", lineHeight: 1.4, overflow: "hidden", textOverflow: "ellipsis", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical" }}>
                      <span style={{ fontFamily: DSC_MONO, fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: DSC_INK50, marginRight: 6 }}>{k}</span>{v}
                    </div>
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
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
        {!(ev.reschedulable || ev.editable) && <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DSC_INK50, marginTop: 10 }}>{ev.source === "booked"
          ? "🔒︎ READ-ONLY — YOUR OWN BOOKING WITH ANOTHER COACH; MANAGE IT FROM YOUR TEAM PAGE"
          : "🔒︎ READ-ONLY — PUSHED FROM THE " + (ev.kind === "WORKOUT" ? "PROGRAM" : "MEAL PLAN") + "; RESCHEDULE THERE"}</div>}
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
  const R = dscRules();
  const narrow = useDscNarrow();
  // What /api/calendar has answered so far: { zone, months: Set<"YYYY-MM">, events }, or null
  // until the first answer (the demo shows until then). See dscMergeRange.
  const [cal, setCal] = React.useState(null);
  // The demo set, held in state only so a drag in the preview visibly moves the chip
  // without the moved copy being mistaken for a live answer.
  const [demoEvents, setDemoEvents] = React.useState(DSC_DEMO.events);
  const [avail, setAvail] = React.useState(null);
  // The hours read has answered (with hours or without): until then the editor cannot open.
  const [availRead, setAvailRead] = React.useState(false);
  // Day, week or month, remembered: a coach who works the week grid should not have to
  // choose it again on every visit to their own calendar. The week is the default — it is
  // where the working day happens now.
  const prefs = useRememberedChoices(source === "live");
  const [view, setView] = useRememberedChoice(prefs, "scheduleView", DSC_VIEWS, "week");
  // The plans row: what a trainer's clients' programs put on each day (step 4), shown unless
  // the coach turns it off. A nutritionist's plans are meal plans, with no training days.
  const [plansPref, setPlansPref] = useRememberedChoice(prefs, "schedulePlans", ["on", "off"], "on");
  const [cursor, setCursor] = React.useState(() => {
    return dscRouteDate(dashRouteParam("date")) || new Date();
  });
  const selectedDay = dashRouteParam("date");
  const requestedClient = dashRouteParam("client");
  // ⚠ A LINKED DAY OPENS THE DAY VIEW FOR THIS VISIT ONLY. Today's week strip links each day
  // here with ?date=, and that click used to WRITE "week" into the coach's remembered choice —
  // one tap on Today changed how their Schedule opens from then on. The link is a place to look,
  // not a preference; any view button clears it.
  const [linked, setLinked] = React.useState(() => !!dscRouteDate(selectedDay));
  React.useEffect(() => {
    const requestedDate = dscRouteDate(selectedDay);
    if (requestedDate) { setCursor(requestedDate); setLinked(true); }
  }, [selectedDay]);
  const shownView = linked ? "day" : view;
  const pickView = (v) => { setLinked(false); setView(v); };
  // Client filter chips. ?client= still lands filtered on that client.
  const [picked, setPicked] = React.useState(() => (requestedClient ? [requestedClient] : []));
  const [drawerRow, setDrawerRow] = React.useState(null);
  const [sheetEv, setSheetEv] = React.useState(null);
  const [booking, setBooking] = React.useState(null);   // { ev, move } — the booking sheet
  // Nora's "this session" (the Ask Nora plan, step 4): the open booking, checked on the
  // server against the coach's own sessions and roster before she is told.
  const noraSession = booking && booking.ev && booking.ev.source === "session" ? booking.ev.sessionId : null;
  const noraClient = booking && booking.ev ? booking.ev.clientId : null;
  React.useEffect(() => (noraSession && window.shapeNoraOpen ? window.shapeNoraOpen({ sessionId: noraSession, ...(noraClient ? { clientId: noraClient } : {}) }) : undefined), [noraSession, noraClient]);
  const [slot, setSlot] = React.useState(null);         // { date, minute, dur } — "+ Book"
  const [bookOpen, setBookOpen] = React.useState(false);
  const [confirmMove, setConfirmMove] = React.useState(null);
  const [scopeAsk, setScopeAsk] = React.useState(null);   // { ev, date, time } — a run's move: this one or following
  const [busyId, setBusyId] = React.useState(null);
  const [toast, setToast] = React.useState(null);
  const dragRef = React.useRef(null);
  const [dragId, setDragId] = React.useState(null);
  // The zone the coach's stored hours are expressed in (null until first saved).
  const [availZone, setAvailZone] = React.useState(null);
  const isLive = !!live;
  // Editing the week's hours on the grid (Schedule step 3).
  const [editingHours, setEditingHours] = React.useState(false);
  // Time off: the coach's blocks, { id, startsAt, endsAt, note }. The demo shows one example.
  const [timeOff, setTimeOff] = React.useState([]);
  const [offBusy, setOffBusy] = React.useState(null);
  const [offAdding, setOffAdding] = React.useState(false);
  const [offErr, setOffErr] = React.useState(null);
  // A tick a minute, so the now line and "that time has passed" keep up with the clock.
  const [, setTick] = React.useState(0);
  React.useEffect(() => { const t = setInterval(() => setTick((n) => n + 1), 60000); return () => clearInterval(t); }, []);

  React.useEffect(() => {
    let on = true;
    fetch("/api/my-availability?role=" + role, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((av) => {
        if (!on) return;
        if (av && Array.isArray(av.slots)) setAvail(av.slots);
        if (av && typeof av.timezone === "string") setAvailZone(av.timezone);
        setAvailRead(true);
      });
    return () => { on = false; };
  }, [role]);
  React.useEffect(() => {
    if (!isLive) { setTimeOff(DSC_DEMO.timeOff); return undefined; }
    let on = true;
    fetch("/api/my-time-off?role=" + role, { credentials: "same-origin", cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null)).catch(() => null)
      .then((j) => {
        if (!on) return;
        if (j && Array.isArray(j.timeOff)) setTimeOff(j.timeOff);
        else setOffErr("Your time off couldn't load. Reload to try again.");
      });
    return () => { on = false; };
  }, [role, isLive]);

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
  const wanted = dscMonthsIn(dscVisibleRange(shownView, cursor));
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
        + "&role=" + encodeURIComponent(role) + "&tz=" + encodeURIComponent(dscBrowserZone() || "")
        // A trainer's clients' training days, for the plans row (step 4).
        + (role === "trainer" ? "&clientPlans=1" : "");
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
  const now = dscNowIn(calZone);
  const nowMin = now.date === todayIso ? now.min : null;
  const availSlots = avail != null ? avail : (isLive ? [] : DSC_DEMO.availability);
  // ⚠ OPEN HOURS ARE SHADED ONLY ON THE CLOCK THEY WERE DECLARED ON. A stored start_minute is a
  // wall clock in the coach's stored zone; the grid is in the zone /api/calendar named. Those
  // are the same zone for a coach who has saved hours (the route prefers the stored zone), and
  // when they are not — or no zone is stored at all — painting the hours would be a claim about
  // a clock nobody declared. The demo has no zones and shades its example hours.
  const shadeOk = !isLive || (!!availZone && (!calZone || calZone === availZone));
  const blocks = R && shadeOk ? R.openBlocks(availSlots) : null;
  const hasHours = !!blocks && blocks.some((d) => d.length > 0);
  // Time off on the grid's own clock: the zone /api/calendar answered in, or (in the demo, whose
  // example dates are this browser's) this browser's. Before a live answer it is not drawn.
  const BR = dscBookingRules();
  const offZone = liveEvents ? calZone : dscBrowserZone();
  const offsFor = (iso) => dscOffOn(timeOff, iso, offZone, BR);
  // ⚠ THE EDITOR OPENS ONLY ON HOURS THAT HAVE ARRIVED (Codex, the review of #2229). The save is
  // a delete-and-rewrite of the whole week, so an editor seeded before the read answered would
  // save one painted cell over every hour the coach had. A live coach waits for their own hours
  // (and cannot edit when the read failed); the demo waits until the page knows it is the demo,
  // so example hours are never what a coach about to be signed in saves.
  const hoursState = source === "live" ? (avail != null ? "ready" : availRead ? "failed" : "loading") : source === "demo" ? "ready" : "loading";
  // Only the coach's own bookings (sessions/consults) + manual events belong
  // on the planning calendar — the client-facing pushed workouts/meals are a
  // client surface, shown read-only if present.
  const kindOk = (e) => e.kind === "SESSION" || e.kind === "CONSULT" || e.source === "event" || e.kind === "WORKOUT" || e.kind === "MEAL";
  // ⚠ A SESSION WHERE THE COACH IS THE CLIENT (`asClient`, from /api/calendar) is their own
  // appointment with another coach. It shows, read-only, as time they are busy — but it is not
  // one of THEIR bookings: no Accept in the strip for a request they made, no drag, and no
  // clash, because the routes only weigh a coach's bookings as the provider.
  const calEvents = allEvents.filter(kindOk).map((e) => (e.source === "session" && e.asClient
    ? { ...e, source: "booked", reschedulable: false, editable: false, with: "", clientId: null, title: e.title + " · your booking" }
    : e));
  const planEvents = calEvents.filter((e) => !picked.length || picked.includes(e.clientId));
  // Colours come from the UNFILTERED calendar, so a client keeps their colour when the
  // chips narrow the view.
  const colorOf = React.useMemo(() => dscColorMap(calEvents), [JSON.stringify(calEvents.map((e) => e.clientId || e.with || e.title))]);
  const byDate = React.useMemo(() => {
    const m = new Map();
    for (const e of planEvents) { if (!m.has(e.date)) m.set(e.date, []); m.get(e.date).push(e); }
    for (const list of m.values()) list.sort((a, b) => String(a.time || "").localeCompare(String(b.time || "")));
    return m;
  }, [JSON.stringify(planEvents)]);
  // The plans row (step 4): a trainer's clients' training days, narrowed by the same client chips.
  const showPlans = role === "trainer" && plansPref !== "off";
  // The demo's plans meet the demo's bookings by name, so a client keeps one colour across both.
  const planList = !showPlans ? [] : liveEvents ? (cal.clientPlans || [])
    : dscDemoPlans(dscMonday(cursor)).map((p) => { const known = calEvents.find((e) => e.with === p.with && e.clientId); return known ? { ...p, clientId: known.clientId } : p; });
  const plansByDate = new Map();
  for (const p of planList) {
    if (picked.length && !picked.includes(p.clientId)) continue;
    if (!plansByDate.has(p.date)) plansByDate.set(p.date, []);
    plansByDate.get(p.date).push(p);
  }
  const plansFor = showPlans ? (iso) => plansByDate.get(iso) || [] : null;
  const plansUnread = showPlans && liveEvents && cal.plansOk === false;
  // Clashes are judged against EVERY booking, filtered or not: a session hidden by a chip
  // still holds its hour.
  const sessionsByDate = React.useMemo(() => {
    const m = new Map();
    for (const e of calEvents) {
      if (e.source !== "session" || dscMin(e.time) == null) continue;
      if (!m.has(e.date)) m.set(e.date, []);
      m.get(e.date).push(e);
    }
    return m;
  }, [JSON.stringify(calEvents)]);
  const rowFor = (ev) => {
    if (!ev || !triage) return null;
    const byId = ev.clientId ? triage.find((r) => r.client.profile.id === ev.clientId) : null;
    // The demo's bookings and the demo roster are two invented sets; they meet by name.
    return byId || (!isLive && ev.with ? triage.find((r) => r.client.profile.name === ev.with) || null : null);
  };

  // The verdict on putting a booking (or a new one, `ev` null) at `date` + `start`:
  // { past, clash: { label } | null, outside }. One function behind the drag's drop target, the
  // sheet's Move button and the book sheet, so all three refuse the same things.
  // ⚠ ONLY A SESSION IS JUDGED. A manual calendar note is the coach's own and moves freely
  // (requestMove does not ask), so a red target over one would be a refusal that never happens.
  const verdictFor = (ev, date, start, dur) => {
    if (ev && ev.source !== "session") return { past: false, clash: null, outside: false, away: false };
    const items = (sessionsByDate.get(date) || []).map((e) => ({ id: e.id, start: dscMin(e.time), end: dscMin(e.time) + dscDur(e), status: e.status, e }));
    const hit = R ? R.clashIn(items, start, start + dur, ev ? ev.id : null) : null;
    return {
      past: date < todayIso || (date === todayIso && nowMin != null && start < nowMin),
      clash: hit ? { label: (hit.e.with || hit.e.title) + " at " + dscClock(hit.start) } : null,
      // Only a coach who has opened hours is asked: with none set, every time is "outside".
      outside: !!(R && hasHours && !R.fitsOpenHours(availSlots, dscWeekday(date), start, dur)),
      // Time off closes booking for members; the coach may book or move into it, after asking.
      away: offsFor(date).some((o) => o.start < start + dur && o.end > start),
    };
  };

  // ⚠ ONE TIMER, RESET PER TOAST AND CLEARED ON UNMOUNT. A timer per call let the first
  // toast's timer clear the second one early — a refusal right after a move flashed and went.
  const toastTimer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(toastTimer.current), []);
  const showToast = (msg) => {
    clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 2600);
  };
  const setEvents = (fn) => { if (liveEvents) setCal((c) => (c ? { ...c, events: fn(c.events) } : c)); else setDemoEvents(fn); };

  const pickEvent = (ev) => {
    setSlot(null);
    // A session or consult → the booking sheet, with its actions and the client's prep.
    if (ev.source === "session") { setBooking({ ev, move: false }); return; }
    setSheetEv(ev);
  };

  // ── Moving a booking ──
  const moveBooking = async (ev, dateIso, time, scope) => {
    const who = ev.with || ev.title;
    const when = dscDayLabel(dateIso) + (time ? " " + dscClock(dscMin(time)) : "");
    // "This and following" on a run: every later booking of it moves by the same number of days to
    // the new wall time, as the route moves them (session-series.ts shiftedRun).
    const following = scope === "following" && !!ev.seriesId && ev.source === "session";
    const shift = dscDaysBetween(ev.date, dateIso);
    const moveTo = (date, t) => (list) => {
      if (!following) return list.map((e) => (e.id === ev.id ? { ...e, date, time: t } : e));
      const ids = new Set(dscFollowing(list, ev).map((e) => e.id));
      return list.map((e) => (e.id === ev.id ? { ...e, date, time: t } : ids.has(e.id) ? { ...e, date: dscShiftIso(e.date, shift), time: t } : e));
    };
    const snapshot = liveEvents && cal ? cal.events : null;
    const n = following ? Math.max(1, dscFollowing(calEvents, ev).length) : 1;
    const moved = following ? n + " sessions with " + who + " (" + dscDayLabel(dateIso) + " on, at " + dscClock(dscMin(time)) + ")" : who + " to " + when;
    if (!liveEvents) { setDemoEvents(moveTo(dateIso, time)); showToast("Demo · would move " + moved + " and notify them."); return; }
    setCal((c) => (c ? { ...c, events: moveTo(dateIso, time)(c.events) } : c));
    if (!isLive) { showToast("Demo · would move " + moved + " and notify them."); return; }
    try {
      let res;
      if (ev.source === "session" && ev.sessionId) {
        // ⚠ THE TIME IS A WALL CLOCK IN `calZone`, SO THE ZONE GOES WITH IT. The route reads a
        // reschedule's date+time in the zone it is handed; without one it reads UTC, and a
        // 9:00 AM New York session dropped on a new day would land at 5:00 AM (4:00 in winter).
        // Keeping the WALL clock is also what holds "9:00 AM" across a DST change.
        res = await fetch("/api/sessions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "reschedule", sessionId: ev.sessionId, date: dateIso, time: time || null, tz: calZone || undefined, ...(following ? { scope: "following" } : {}) }) });
      } else if (ev.source === "event") {
        res = await fetch("/api/calendar", { method: "PATCH", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: String(ev.id).replace(/^event:/, ""), date: dateIso, ...(time ? { time } : {}) }) });
      }
      if (res && res.ok) { showToast("Moved " + moved + " · " + (ev.with ? ev.with.split(" ")[0] + " notified" : "updated")); return; }
      // ⚠ THE SERVER'S OWN SENTENCE, WHEN IT HAS ONE. An overlap the grid could not see (a
      // booking in a month not loaded, or made a minute ago elsewhere) comes back as a 409
      // naming the clash, which says more than "couldn't move it".
      const j = res ? await res.json().catch(() => null) : null;
      throw new Error((j && j.error) || "");
    } catch (e) {
      showToast((e && e.message) || "Couldn't move it — try again.");
      // Revert: a run's move put back whole, from the list as it was before it.
      setCal((c) => (c ? { ...c, events: following && snapshot ? snapshot : moveTo(ev.date, ev.time)(c.events) } : c));
    }
  };
  // Every move goes through the verdict first: a clash or the past is refused outright,
  // outside open hours asks.
  const requestMove = (ev, dateIso, minute) => {
    if (!(ev.reschedulable || ev.editable)) { showToast((ev.with || ev.title) + " is read-only — reschedule it in the program/plan."); return; }
    const time = minute == null ? (ev.time || null) : dscHHMM(minute);
    if (ev.date === dateIso && (ev.time || null) === time) return;
    const start = dscMin(time);
    if (ev.source === "session" && start != null) {
      const v = verdictFor(ev, dateIso, start, dscDur(ev));
      if (v.past) { showToast("That time has passed — " + (ev.with || ev.title) + " wasn't moved."); return; }
      if (v.clash) { showToast("Not moved — that overlaps " + v.clash.label + "."); return; }
      if (v.outside || v.away) { setConfirmMove({ ev, date: dateIso, time, why: v.away ? "away" : "outside" }); return; }
    }
    goMove(ev, dateIso, time);
  };
  // A booking of a run asks which: just this one, or this one and the rest of the run.
  const goMove = (ev, dateIso, time) => {
    if (ev.source === "session" && ev.seriesId && time) { setScopeAsk({ ev, date: dateIso, time }); return; }
    moveBooking(ev, dateIso, time);
  };
  // Month view: a day-only move, by HTML5 drag.
  const onDrop = (dateIso) => {
    const ev = dragRef.current;
    dragRef.current = null; setDragId(null);
    if (!ev || ev.date === dateIso) return;
    requestMove(ev, dateIso, null);
  };

  // ── Answering a booking ──
  const sessionAction = async (ev, action, opts) => {
    const first = String(ev.with || "the client").split(" ")[0];
    // "This and following" on a run (recurring sessions): this booking and every later one of it.
    const following = action === "cancel" && opts && opts.scope === "following" && !!ev.seriesId;
    const said = { confirm: "Accepted", decline: "Declined", cancel: "Cancelled", complete: "Marked done" }[action];
    const told = action === "complete" ? "" : " · " + first + " is told";
    const apply = (extra) => (list) => {
      if (following) { const gone = new Set(dscFollowing(list, ev).map((e) => e.id)); gone.add(ev.id); return list.filter((e) => !gone.has(e.id)); }
      return action === "decline" || action === "cancel"
        ? list.filter((e) => e.id !== ev.id)
        : list.map((e) => (e.id === ev.id ? { ...e, status: action === "confirm" ? "confirmed" : "completed", reschedulable: action === "confirm", ...(extra || {}) } : e));
    };
    const what = (n) => (following ? n + (n === 1 ? " session" : " sessions") + " with " + (ev.with || ev.title) : (ev.with || ev.title));
    if (!liveEvents || !isLive) { const n = following ? dscFollowing(calEvents, ev).length : 1; setEvents(apply()); setBooking(null); showToast("Demo · " + said.toLowerCase() + " " + what(n) + told + " once you're signed in."); return; }
    setBusyId(ev.id);
    try {
      const res = await fetch("/api/sessions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, sessionId: ev.sessionId, ...(following ? { scope: "following" } : {}) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((j && j.error) || "");
      setEvents(apply(action === "confirm" && j && j.meetingUrl ? { meetingUrl: j.meetingUrl } : null));
      setBooking(null);
      showToast(said + " · " + what(following && j && j.series ? j.series.count : 1) + told);
    } catch (e) {
      showToast((e && e.message) || "Couldn't update it — try again.");
    } finally {
      setBusyId(null);
    }
  };

  // ── Booking from an empty slot ──
  const bookSession = async ({ row, date, minute, durationMin, type, topic, repeat }) => {
    const name = row.client.profile.name;
    const time = dscHHMM(minute);
    if (repeat) return bookRun({ row, date, time, durationMin, type, topic, repeat });
    const ev = {
      source: "session", kind: role === "nutritionist" ? "CONSULT" : "SESSION",
      title: topic || (role === "nutritionist" ? "Nutrition consult" : "Coaching session"), sub: type,
      date, time, durationMin, with: name, clientId: row.client.profile.id, status: "confirmed",
      reschedulable: true, editable: false, meetingUrl: null,
    };
    const when = dscDayLabel(date) + " " + dscClock(minute);
    if (!liveEvents || !isLive) {
      const id = "demo-new-" + date + "-" + time;
      // The demo roster and the demo bookings are two invented sets with different ids; a booking
      // for a name the demo calendar already has keeps that client's id (and colour, and chip).
      const known = calEvents.find((e) => e.with === name && e.clientId);
      setEvents((list) => [...list, { ...ev, id, sessionId: id, clientId: known ? known.clientId : ev.clientId }]);
      setSlot(null);
      showToast("Demo · would book " + name + " · " + when + " and tell them.");
      return { ok: true };
    }
    if (!calZone) return { ok: false, error: "Your calendar hasn't loaded yet — reload and try again." };
    try {
      const res = await fetch("/api/sessions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        // The wall clock is the grid's, in the zone the calendar named — the same pairing a move sends.
        body: JSON.stringify({ action: "create", role, clientId: row.client.profile.id, date, time, tz: calZone, durationMin, type, ...(topic ? { topic } : {}) }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j || !j.session) return { ok: false, error: (j && j.error) || "Couldn't book it — try again." };
      setEvents((list) => [...list, { ...ev, id: "session:" + j.session.id, sessionId: j.session.id, scheduledAt: j.session.scheduled_at, meetingUrl: j.meetingUrl || null, with: j.clientName || name }]);
      setSlot(null);
      showToast("Booked " + name + " · " + when + " · " + name.split(" ")[0] + " is told");
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Couldn't book it — try again." };
    }
  };
  // A weekly run: one request, every date the route could book added to the grid, and the ones
  // it skipped handed back to the sheet to name.
  const bookRun = async ({ row, date, time, durationMin, type, topic, repeat }) => {
    const name = row.client.profile.name, first = name.split(" ")[0];
    const base = {
      source: "session", kind: role === "nutritionist" ? "CONSULT" : "SESSION",
      title: topic || (role === "nutritionist" ? "Nutrition consult" : "Coaching session"), sub: type,
      time, durationMin, with: name, clientId: row.client.profile.id, status: "confirmed", reschedulable: true, editable: false, meetingUrl: null,
    };
    if (!liveEvents || !isLive) {
      const seriesId = "demo-run-" + date + "-" + time;
      const known = calEvents.find((e) => e.with === name && e.clientId);
      const dates = dscRunDates(date, repeat.weeks, repeat.weekdays);
      setEvents((list) => [...list, ...dates.map((d) => ({ ...base, id: seriesId + "-" + d, sessionId: seriesId + "-" + d, date: d, seriesId, clientId: known ? known.clientId : base.clientId }))]);
      setSlot(null);
      showToast("Demo · would book " + dates.length + " sessions with " + name + " and tell them.");
      return { ok: true };
    }
    if (!calZone) return { ok: false, error: "Your calendar hasn't loaded yet — reload and try again." };
    try {
      const res = await fetch("/api/sessions/manage", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create", role, clientId: row.client.profile.id, date, time, tz: calZone, durationMin, type, ...(topic ? { topic } : {}), repeat }) });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || !j || !j.series) {
        const why = j && Array.isArray(j.skipped) && j.skipped.length ? " " + j.skipped[0].message : "";
        return { ok: false, error: ((j && j.error) || "Couldn't book the run — try again.") + why };
      }
      const placed = (j.series.sessions || []).map((x) => {
        const wall = dscWallAt(Date.parse(x.scheduledAt), calZone);
        return { ...base, id: "session:" + x.id, sessionId: x.id, scheduledAt: x.scheduledAt, date: wall ? wall.date : date, time: wall ? dscHHMM(wall.min) : time, seriesId: j.series.id, meetingUrl: x.meetingUrl || null, with: j.clientName || name };
      });
      setEvents((list) => [...list, ...placed]);
      const skipped = j.series.skipped || [];
      // ⚠ THE SHEET STAYS WHEN DATES WERE SKIPPED, so it can name them; clearing the slot here
      // would close it first. Its Done clears the slot instead.
      if (!skipped.length) { setSlot(null); showToast("Booked " + j.series.booked + " sessions with " + name + " · " + first + " is told"); }
      return { ok: true, booked: j.series.booked, skipped, first };
    } catch (e) {
      return { ok: false, error: "Couldn't book the run — try again." };
    }
  };
  const onSlot = (date, minute) => {
    const v = verdictFor(null, date, minute, 15);
    if (v.past) { setSlot(null); showToast("That time has passed."); return; }
    setSlot({ date, minute, dur: role === "nutritionist" ? 15 : 60 });
  };
  // The toolbar's "+ Book": the same sheet without aiming at the grid, which is also the
  // keyboard's way in (an empty grid cell is a pointer target only). It starts at the day on
  // screen — its first open hour, or 9:00 — and never before now.
  const bookFromToolbar = () => {
    const day = dscIso(new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate()));
    const date = day < todayIso ? todayIso : day;
    const wd = dscWeekday(date);
    const open = blocks && wd != null && blocks[wd].length ? blocks[wd][0].start : 9 * 60;
    const soon = date === todayIso && nowMin != null ? Math.ceil((nowMin + 1) / 15) * 15 : 0;
    setSlot({ date, minute: Math.min(1425, Math.max(open, soon)), dur: role === "nutritionist" ? 15 : 60 });
    setBookOpen(true);
  };

  // ── Hours, time off ──
  const hoursSaved = (slots, zone) => {
    setAvail(slots);
    if (zone) setAvailZone(zone);
    setEditingHours(false);
    showToast(isLive ? "Hours saved · members can book them now" : "Demo · these hours would be saved once you're signed in.");
  };
  // ⚠ WHOLE DAYS ARE SENT AS DATES, AND THE ROUTE READS THEM IN THE COACH'S STORED ZONE; part of a
  // day is sent as two instants, made here from the wall clock in that same zone. The grid's zone
  // is that zone whenever hours are saved, so what the coach picks is what gets closed.
  const addTimeOff = async ({ allDay, from, to, fromMin, toMin, note }) => {
    setOffErr(null);
    const zone = isLive ? (availZone || calZone) : dscBrowserZone();
    const ymd = (iso) => iso.split("-").map(Number);
    let span = null;
    if (BR && zone) {
      const [y1, m1, d1] = ymd(from);
      const toDay = allDay ? dscAddDays(dscRouteDate(to), 1) : dscRouteDate(to);
      const s0 = BR.wallInstant(y1, m1, d1, allDay ? 0 : fromMin, zone);
      const e0 = toDay ? BR.wallInstant(toDay.getFullYear(), toDay.getMonth() + 1, toDay.getDate(), allDay ? 0 : toMin, zone) : NaN;
      if (Number.isFinite(s0) && Number.isFinite(e0)) span = { s: s0, e: e0 };
    }
    if (!allDay && !span) { setOffErr("Save your hours once first, so your time zone is set."); return false; }
    if (span && !(span.e > span.s)) { setOffErr("Time off has to end after it starts."); return false; }
    if (!isLive) {
      if (!span) return false;
      setTimeOff((l) => [...l, { id: "demo-off-" + span.s, startsAt: new Date(span.s).toISOString(), endsAt: new Date(span.e).toISOString(), note: note || null }]);
      showToast("Demo · this time off would close booking once you're signed in.");
      return true;
    }
    const body = allDay
      ? { role, allDay: true, fromDate: from, toDate: to, ...(note ? { note } : {}) }
      : { role, startsAt: new Date(span.s).toISOString(), endsAt: new Date(span.e).toISOString(), ...(note ? { note } : {}) };
    setOffAdding(true);
    try {
      const res = await fetch("/api/my-time-off", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await res.json().catch(() => null);
      if (!res.ok || !j || !j.timeOff) { setOffErr((j && j.detail) || "Couldn't add your time off — try again."); return false; }
      setTimeOff((l) => [...l, j.timeOff].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt)));
      const n = j.overlapping;
      showToast("Time off added" + (n > 0 ? " · " + n + (n === 1 ? " booking is" : " bookings are") + " still inside it — move or cancel " + (n === 1 ? "it" : "them") : ""));
      return true;
    } catch (e) {
      setOffErr("Couldn't add your time off — try again.");
      return false;
    } finally {
      setOffAdding(false);
    }
  };
  const removeTimeOff = async (b) => {
    setOffErr(null);
    if (!isLive) { setTimeOff((l) => l.filter((x) => x.id !== b.id)); return; }
    setOffBusy(b.id);
    try {
      const res = await fetch("/api/my-time-off?role=" + role + "&id=" + encodeURIComponent(b.id), { method: "DELETE", credentials: "same-origin" });
      if (!res.ok) throw new Error("");
      setTimeOff((l) => l.filter((x) => x.id !== b.id));
      showToast("Time off removed · members can book that time again");
    } catch (e) {
      setOffErr("Couldn't remove it — try again.");
    } finally {
      setOffBusy(null);
    }
  };

  // ── What is on screen ──
  const weekMon = dscMonday(cursor);
  const weekDays = Array.from({ length: 7 }, (_, i) => dscAddDays(weekMon, i));
  const cursorDay = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate());
  // ⚠ UNDER 760px THE WEEK IS THE DAY VIEW. Seven columns at phone width are ~45px each — a
  // name does not fit and a finger cannot drag. The day strip above it switches days.
  const gridDays = shownView === "week" && !narrow ? weekDays : [cursorDay];
  const gridIsos = gridDays.map(dscIso);
  // The hours drawn: 6a–9p, widened to whatever is on screen so nothing is cut off.
  const spans = [];
  for (const iso of gridIsos) {
    for (const e of byDate.get(iso) || []) { const s = dscMin(e.time); if (s != null) spans.push({ start: s, end: s + dscDur(e) }); }
    const wd = dscWeekday(iso);
    if (blocks && wd != null) for (const b of blocks[wd]) spans.push({ start: b.start, end: Math.min(b.end, 1440) });
  }
  const range = R ? R.hourRange(spans) : { startHour: 6, endHour: 21 };
  // Load at a glance: booked against open, for the week on screen (the cursor's week).
  const dayLoadOf = (iso) => {
    const wd = dscWeekday(iso);
    if (!R || !blocks || wd == null) return null;
    const evs = (sessionsByDate.get(iso) || []).map((e) => ({ start: dscMin(e.time), end: dscMin(e.time) + dscDur(e), status: e.status }));
    return R.dayLoad(blocks[wd], evs);
  };
  const weekLoad = weekDays.map((d) => dayLoadOf(dscIso(d))).filter(Boolean).reduce((a, l) => ({ openMin: a.openMin + l.openMin, bookedMin: a.bookedMin + l.bookedMin }), { openMin: 0, bookedMin: 0 });
  // Requests, soonest first, from today on.
  const requests = calEvents.filter((e) => e.source === "session" && e.status === "requested"
    && (e.date > todayIso || (e.date === todayIso && (nowMin == null || (dscMin(e.time) ?? 0) >= nowMin))))
    .sort((a, b) => (a.date + (a.time || "")).localeCompare(b.date + (b.time || "")));
  // The chips: every client with a booking in the loaded months, plus a ?client= target.
  const chipClients = (() => {
    const m = new Map();
    for (const e of calEvents) if (e.clientId && e.with && !m.has(e.clientId)) m.set(e.clientId, e.with);
    for (const id of picked) if (!m.has(id)) { const r = (triage || []).find((x) => x.client.profile.id === id); m.set(id, r ? r.client.profile.name : "1 client"); }
    return [...m.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name));
  })();
  const togglePick = (key) => setPicked((p) => (p.includes(key) ? p.filter((k) => k !== key) : [...p, key]));
  const roster = (triage || []).slice().sort((a, b) => String(a.client.profile.name).localeCompare(String(b.client.profile.name)));
  const prepFor = (ev) => dscPrep({ row: rowFor(ev), ev, events: calEvents, todayIso, nowMin, role });

  const monthLabel = cursor.toLocaleDateString([], { month: "long", year: "numeric" });
  const weekLabel = (() => { const m = dscMonday(cursor); const s = dscAddDays(m, 6); return m.toLocaleDateString([], { month: "short", day: "numeric" }) + " – " + s.toLocaleDateString([], { month: "short", day: "numeric" }); })();
  const dayLabel = cursor.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric" });
  // ⚠ A MONTH STEP LANDS ON THE 1ST. `setMonth(+1)` from the 31st overflows — Oct 31 became
  // "Nov 31", i.e. Dec 1 — so on the last days of a month "next" skipped a whole month.
  // The day view steps a day; a phone's week (which IS a day view) steps a week, and its day
  // strip picks the day.
  const stepByDay = shownView === "day";
  const step = (dir) => setCursor((c) => (stepByDay ? dscAddDays(c, dir) : view === "month" ? new Date(c.getFullYear(), c.getMonth() + dir, 1) : dscAddDays(c, dir * 7)));
  const goToday = () => setCursor(dscRouteDate(todayIso) || new Date());
  const btn = (on) => ({ fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: on ? "var(--sh-deep, #06231f)" : "rgba(var(--sh-ink-rgb, 242,237,228),0.7)", background: on ? DSC_TEAL : "transparent", border: on ? 0 : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 4, padding: "7px 12px", cursor: "pointer" });
  const label = shownView === "month" ? monthLabel : shownView === "day" ? dayLabel : narrow ? dayLabel : weekLabel;
  const pctBooked = weekLoad.openMin ? Math.min(100, Math.round((weekLoad.bookedMin / weekLoad.openMin) * 100)) : 0;

  const grid = (
    <DscTimeGrid rules={R} days={gridDays} byDate={byDate} blocks={blocks} offsFor={offsFor} colorOf={colorOf} todayIso={todayIso} nowMin={nowMin}
      plansFor={plansFor} onPlan={typeof window.DashClientDrawer === "function" ? (p) => { const row = rowFor({ clientId: p.clientId, with: p.with }); if (row) setDrawerRow(row); } : null}
      startHour={range.startHour} endHour={range.endHour}
      slot={slot} onSlot={onSlot} onBookSlot={() => setBookOpen(true)}
      onPick={pickEvent} onMove={(ev, date, minute) => requestMove(ev, date, minute)} verdictFor={verdictFor}
      onDayHead={(iso) => { setCursor(dscRouteDate(iso)); pickView("day"); }} />
  );
  // ⚠ FLEX, NOT A SEVEN-COLUMN GRID. pageShell's phone stylesheet collapses every inline
  // `grid-template-columns: repeat(7…` to one column (it exists for marketing sections), which
  // stacked this strip into seven full-width rows — the one screen width the strip is for.
  const dayStrip = narrow && shownView !== "month" && (
    <div role="group" aria-label="Day" data-day-strip="" style={{ display: "flex", gap: 4, marginBottom: 8 }}>
      {weekDays.map((d) => {
        const iso = dscIso(d);
        const on = iso === dscIso(cursorDay);
        const n = (sessionsByDate.get(iso) || []).length;
        return (
          <button key={iso} type="button" aria-pressed={on} onClick={() => setCursor(d)}
            style={{ ...btn(on), flex: "1 1 0", minWidth: 0, padding: "6px 0", display: "grid", gap: 1, justifyItems: "center", color: on ? "var(--sh-deep, #06231f)" : iso === todayIso ? DSC_TEAL : "rgba(var(--sh-ink-rgb, 242,237,228),0.7)" }}>
            <span style={{ fontSize: 8 }}>{DSC_DOW[(d.getDay() + 6) % 7]}</span>
            <span style={{ fontSize: 12, letterSpacing: 0 }}>{d.getDate()}</span>
            <span aria-hidden style={{ width: 4, height: 4, borderRadius: 2, background: n ? (on ? "var(--sh-deep, #06231f)" : DSC_TEAL) : "transparent" }} />
          </button>
        );
      })}
    </div>
  );
  const dayIso = dscIso(cursorDay);
  // The month grid's days with any time off (its 42 cells, from the Monday before the 1st).
  const monthOffDates = (() => {
    const set = new Set();
    if (shownView !== "month" || !timeOff.length) return set;
    const startMon = dscMonday(new Date(cursor.getFullYear(), cursor.getMonth(), 1));
    for (let i = 0; i < 42; i++) { const iso = dscIso(dscAddDays(startMon, i)); if (offsFor(iso).length) set.add(iso); }
    return set;
  })();

  return (
    <React.Fragment>
      {source === "demo" && !liveEvents && <DashDemoBand />}
      <DashPage
        navItems={cfg.nav("schedule")}
        payoutCard={cfg.payout()}
        eyebrow="PLANNING VIEW · DRAG TO RESCHEDULE"
        title="Schedule"
        subtitle="Your week on a clock — open hours shaded, requests waiting at the top. Click a booking for its actions, drag it to a new time (the client is told), or click open time to book someone in."
      >
        <div className="dash-cols" style={{ display: "grid", gridTemplateColumns: "1fr 300px", gap: 16, alignItems: "start" }}>
          {/* Calendar */}
          <div className="dash-plate dash-plate--tick" style={{ "--dac": role === "nutritionist" ? "var(--sh-gold, #d8a23a)" : "var(--sh-rust2, #c0533b)", paddingLeft: 24, minWidth: 0 }}>
            {/* While the hours are edited the grid below is the weekly pattern, not a dated week, so
                paging and switching views have nothing to act on and step aside. */}
            {!editingHours && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
              {/* ⚠ WRAPS AT PHONE WIDTH: a long day label ("Wednesday, Oct 7") pushed "+ Book" past
                  the plate's edge at 390px, where it was clipped. */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <button onClick={() => step(-1)} aria-label="Previous" style={btn(false)}>‹</button>
                <span style={{ fontFamily: serif, fontSize: 19, letterSpacing: "-0.015em", minWidth: narrow ? 0 : 150 }}>{label}</span>
                <button onClick={() => step(1)} aria-label="Next" style={btn(false)}>›</button>
                <button onClick={goToday} style={{ ...btn(false), fontSize: 8 }}>Today</button>
                <button type="button" onClick={bookFromToolbar} style={{ ...btn(false), fontSize: 8, whiteSpace: "nowrap", color: DSC_TEAL, border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.45)" }}>+ Book</button>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                {/* ⚠ LOAD AT A GLANCE COUNTS OPEN HOURS USED, NOT SESSIONS. Booked time is measured
                    only where it falls inside the hours the coach opened, so this never reads past
                    100%, and a request is not booked until it is accepted. */}
                {shownView !== "month" && blocks && (
                  <span data-load="" style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: DSC_MONO, fontSize: 9, letterSpacing: "0.04em", color: DSC_INK50 }}>
                    {weekLoad.openMin
                      ? <React.Fragment>{R.hoursLabel(weekLoad.bookedMin)} of {R.hoursLabel(weekLoad.openMin)} open hrs booked<span aria-hidden style={{ width: 70, height: 5, borderRadius: 3, background: DSC_HAIR, overflow: "hidden", display: "inline-block" }}><span style={{ display: "block", height: "100%", width: pctBooked + "%", background: DSC_TEAL }} /></span></React.Fragment>
                      : "No open hours set this week"}
                  </span>
                )}
                {role === "trainer" && shownView !== "month" && (
                  <button type="button" aria-pressed={showPlans} onClick={() => setPlansPref(showPlans ? "off" : "on")} title="What your clients' programs put on each day" style={btn(showPlans)}>Client plans</button>
                )}
                <div role="group" aria-label="View" style={{ display: "flex", gap: 6 }}>
                  {DSC_VIEWS.map((v) => <button key={v} type="button" aria-pressed={shownView === v} onClick={() => pickView(v)} style={btn(shownView === v)}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>)}
                </div>
              </div>
            </div>
            )}
            {/* ⚠ THE ZONE IS NAMED, BECAUSE A BARE "9:00a" IS A CLAIM ABOUT A CLOCK. It is the zone
                the route says it answered in — never this browser's guess — and it is the one a
                drag hands back. Shown only for a live answer — the demo has no coach to name —
                or for a signed-in coach whose first read failed, who needs the Retry. */}
            {!editingHours && (liveEvents || isLive) && (calZone || loadNote) && (
              <div style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.06em", color: DSC_INK50, margin: "-4px 0 10px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "baseline" }}>
                {calZone && <span>Times in {calZone}</span>}
                {isLive && avail && avail.length > 0 && !shadeOk && <span>Open hours aren't shaded — they're saved in {availZone || "no time zone"}; re-save them below</span>}
                {plansUnread && <span>Client plans couldn't load — the row is incomplete.</span>}
                {loadNote === "loading" && <span>Loading…</span>}
                {loadNote === "error" && <span>Some dates couldn't load. <button type="button" onClick={retryLoad} style={{ ...btn(false), padding: "2px 8px", fontSize: 8 }}>Retry</button></span>}
              </div>
            )}
            {editingHours ? (
              <DscHoursEditor role={role} live={isLive} initial={availSlots} storedZone={availZone}
                onCancel={() => setEditingHours(false)} onSaved={hoursSaved} />
            ) : (
            <React.Fragment>
            <DscRequests list={requests} busyId={busyId} onPick={pickEvent}
              onAccept={(ev) => sessionAction(ev, "confirm")} onDecline={(ev) => sessionAction(ev, "decline")}
              onOther={(ev) => { setSlot(null); setBooking({ ev, move: true }); }} />
            {!R && shownView !== "month" && (
              <div role="alert" style={{ fontSize: 12.5, color: DSC_RUST, marginBottom: 10 }}>The week grid couldn't load — reload the page. The month view still works.</div>
            )}
            {shownView === "month" || !R
              ? <DscMonth cursor={cursor} byDate={byDate} colorOf={colorOf} todayIso={todayIso} offDates={monthOffDates} onPickEvent={pickEvent} onDrop={onDrop} onDrag={(ev) => { dragRef.current = ev; setDragId(ev.id); }} dragId={dragId} />
              : shownView === "day" || narrow
                ? (
                  <div className="dsc-day" style={{ display: "grid", gridTemplateColumns: narrow ? "minmax(0, 1fr)" : "minmax(0, 1fr) minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
                    <div style={{ minWidth: 0 }}>{dayStrip}{grid}</div>
                    <DscAgenda iso={dayIso} items={(byDate.get(dayIso) || []).filter((e) => e.source === "session" || dscMin(e.time) != null)} load={dayLoadOf(dayIso)} prepFor={prepFor} colorOf={colorOf} onPick={pickEvent} />
                  </div>
                )
                : grid}
            {/* Client chips: click to show one client or several. */}
            {chipClients.length > 0 && (
              <div role="group" aria-label="Show clients" style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginTop: 12, paddingTop: 10, borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" }}>
                <span style={{ fontFamily: DSC_MONO, fontSize: 8.5, letterSpacing: "0.1em", textTransform: "uppercase", color: DSC_INK50, marginRight: 2 }}>Clients</span>
                {chipClients.map((c) => {
                  const on = picked.includes(c.key);
                  return (
                    <button key={c.key} type="button" aria-pressed={on} onClick={() => togglePick(c.key)}
                      style={{ display: "inline-flex", alignItems: "center", gap: 5, fontFamily: DSC_MONO, fontSize: 9, cursor: "pointer", borderRadius: 12, padding: "4px 9px",
                        color: on ? "var(--sh-ink, #f2ede4)" : DSC_INK50, background: on ? "rgba(var(--sh-ink-rgb, 242,237,228),0.08)" : "transparent",
                        border: "1px solid " + (on ? colorOf(c.key) : "rgba(var(--sh-ink-rgb, 242,237,228),0.12)") }}>
                      <span aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: colorOf(c.key) }} />{c.name}
                    </button>
                  );
                })}
                {picked.length > 0 && <button type="button" onClick={() => setPicked([])} style={{ ...btn(false), padding: "4px 9px", fontSize: 8 }}>Show all</button>}
              </div>
            )}
            </React.Fragment>
            )}
          </div>

          {/* Availability */}
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="dash-plate dash-plate--tick dash-plate--bracket" style={{ "--dac": "var(--sh-gold, #d8a23a)", paddingLeft: 22 }}>
              <DscHoursPlate slots={availSlots} live={isLive} storedZone={availZone} editing={editingHours} state={hoursState}
                onEdit={() => { setSlot(null); setBooking(null); setEditingHours(true); }} />
            </div>
            <div className="dash-plate" style={{ "--dac": "var(--sh-gold, #d8a23a)", padding: "14px 16px" }}>
              <DscTimeOffPlate list={timeOff} zone={offZone || availZone} adding={offAdding} busyId={offBusy} error={offErr}
                onAdd={addTimeOff} onRemove={removeTimeOff} />
            </div>
            <div className="dash-plate" style={{ "--dac": "var(--sh-ink3, #75706a)", padding: "14px 16px" }}>
              <DscRulesPlate role={role} live={isLive} onToast={showToast} />
            </div>
            <div className="dash-plate" style={{ "--dac": "var(--sh-ink3, #75706a)", padding: "14px 16px" }}>
              <div className="dash-eyebrow">How the week works</div>
              <div style={{ fontSize: 12, color: DSC_INK50, lineHeight: 1.55, marginTop: 8 }}>
                Drag a session to a new time in 15-minute steps — the client gets a notification with the new time. A red target means it would overlap another booking; outside your shaded open hours or in hatched time off you're asked first. Click open time to book a client, and answer dashed requests in the strip at the top. Workouts and meals pushed from a plan are read-only here; move those in the program or meal plan.
              </div>
              <a href={role === "nutritionist" ? "NutritionistDashboard.html" : "TrainerDashboard.html"} style={{ display: "inline-block", marginTop: 10, fontFamily: DSC_MONO, fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: DSC_TEAL, textDecoration: "none" }}>← Today's summary</a>
            </div>
          </div>
        </div>
      </DashPage>

      {booking && (
        <DscBookingSheet ev={booking.ev} startInMove={booking.move} row={rowFor(booking.ev)} colorOf={colorOf} prep={prepFor(booking.ev)}
          busy={busyId === booking.ev.id} verdictFor={verdictFor}
          onAction={sessionAction}
          onMove={(ev, date, minute, v) => { setBooking(null); if (v && (v.outside || v.away)) setConfirmMove({ ev, date, time: dscHHMM(minute), why: v.away ? "away" : "outside" }); else requestMove(ev, date, minute); }}
          onOpenFile={typeof window.DashClientDrawer === "function" ? (row) => { setBooking(null); setDrawerRow(row); } : null}
          onClose={() => setBooking(null)} />
      )}
      {bookOpen && slot && (
        <DscBookSheet slot={slot} roster={roster} role={role} verdictFor={verdictFor} onBook={bookSession} onClose={() => setBookOpen(false)} onDone={() => { setBookOpen(false); setSlot(null); }} />
      )}
      {confirmMove && (
        <DscConfirmMove move={confirmMove} onNo={() => setConfirmMove(null)}
          onYes={() => { const m = confirmMove; setConfirmMove(null); goMove(m.ev, m.date, m.time); }} />
      )}
      {scopeAsk && (
        <DscScopeAsk ask={scopeAsk} onNo={() => setScopeAsk(null)}
          onPick={(scope) => { const a = scopeAsk; setScopeAsk(null); moveBooking(a.ev, a.date, a.time, scope); }} />
      )}
      {drawerRow && typeof window.DashClientDrawer === "function" && <DashClientDrawer row={drawerRow} role={role} onClose={() => setDrawerRow(null)} prefs={prefs} />}
      {sheetEv && <DscEventSheet ev={sheetEv} colorOf={colorOf} onClose={() => setSheetEv(null)} />}
      {toast && (
        <div role="status" data-toast="" style={{ position: "fixed", left: "50%", bottom: 26, transform: "translateX(-50%)", zIndex: 300, background: "var(--sh-ground2, #14110e)", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.18)", borderRadius: 8, padding: "10px 18px", color: "var(--sh-ink, #f2ede4)", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontSize: 12.5, maxWidth: "90vw" }}>{toast}</div>
      )}
    </React.Fragment>
  );
}

Object.assign(window, { CoachSchedulePage, dscClientColor, dscColorMap });
