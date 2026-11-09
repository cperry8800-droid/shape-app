// Roster v2 + the shared client panel (dashboard-v2 steps 6 + 11; coach dashboard step 5a).
//
// DashRosterTable renders the triage feed with ROLE-CONFIGURED columns
// (nutritionist: food-log columns; trainer: score/adherence/program/streak/
// contact), in labelled groups (Needs you, Watch, Progress unknown, On track), and
// DashClientDrawer is the shared client panel — opened from any roster row, Today's
// names and the Schedule — whose section set is role-configured. On Clients at desktop
// widths it DOCKS beside the list (DashRosterPeek: no modal, ↑ ↓ move through the
// list); everywhere else, and below the width where two columns fit, it is the
// slide-over. Every value is real or a labelled honest empty state, and loading,
// unread and empty are three different sentences.
//
// Load order: pageShell → trainerDashboard.jsx → coachNav/clientNav →
// dashSignals.js → dashData.jsx → dashToday.jsx (DashPill/helpers) → this.

const DASH_ROSTER_INK50 = "var(--sh-ink2, #a09b94)";
// ⚠ A SEPARATE, WEAKER INK, BECAUSE AN rgba() STRING CANNOT TAKE A HEX ALPHA SUFFIX.
// Appending two hex digits to this token yields a value that is not a colour, and CSS
// error-handling then drops the WHOLE declaration — so the border simply does not paint
// and nothing reports it. I shipped exactly that on the sections panel in the first cut of
// this change; neither the mutation round nor the browser drive could see an absent
// border. The same class this log post-mortems on the page textures, and `dashToday.jsx`
// carries the same warning above its own hex muted ink.
const DASH_ROSTER_HAIR = "rgba(var(--sh-ink-rgb, 242,237,228),0.18)";

// ⚠ ONE SHAPE FOR "NO ANSWER", AND IT USED TO HAVE TWO (CodeRabbit, #2031). This
// returned `null` for a falsy input and `NaN` for an UNPARSEABLE one —
// `Math.max(0, Math.floor(NaN))` is NaN — so every caller had to remember the second
// case separately, and three of the four did not: `dashLastLogLabel`,
// `dashContactLabel` and `dashConsultLabel` interpolated it and a malformed date
// rendered as **"NaNd ago"** on the roster. `dashTenureLabel` had the guard and its
// comment explains exactly this, which is the tell: a lesson written at one call site
// is not a fix for the other three. It is null for both now, so `d == null` is the
// whole of "we could not read this date".
function dashDaysSince(isoStr) {
  if (!isoStr) return null;
  try {
    const d = new Date(String(isoStr).length === 10 ? isoStr + "T00:00:00" : isoStr);
    const days = Math.max(0, Math.floor((Date.now() - d.getTime()) / 86400000));
    return Number.isFinite(days) ? days : null;
  } catch (e) { return null; }
}
function dashRelShort(isoStr) {
  const d = dashDaysSince(isoStr);
  return d == null ? null : d === 0 ? "Today" : d === 1 ? "Yesterday" : d + "d ago";
}

// ── Honest cell values — real, or a labelled empty state, never a bare dash ──
function dashCellText(v) {
  return (
    <span title={v.text} style={{ display: "block", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: v.dim ? "var(--sh-ink3, #75706a)" : v.warn ? DASH_SEV_COLORS.amber : "rgba(var(--sh-ink-rgb, 242,237,228),0.85)", fontStyle: v.dim ? "italic" : "normal", whiteSpace: "nowrap" }}>{v.text}</span>
  );
}
function dashLastLogLabel(rec) {
  const f = rec.foodLogs;
  if (!f) return { text: "Not shared", dim: true };
  if (f.lastLoggedOn) {
    const d = dashDaysSince(f.lastLoggedOn);
    // A date we cannot read is not a date: it falls through to the honest empty below
    // rather than rendering the arithmetic that failed on it.
    if (d != null) return { text: d === 0 ? "Today" : d === 1 ? "Yesterday" : d + "d ago", warn: d >= 3 };
  }
  if (f.daysLogged7d != null) return { text: f.daysLogged7d + "/7 this wk", warn: f.daysLogged7d === 0 };
  return { text: "Not shared", dim: true };
}
function dashComplianceLabel(rec) {
  const f = rec.foodLogs;
  if (!f || f.daysLogged7d == null) return { text: "Not shared", dim: true };
  const pct = Math.round((Math.min(7, f.daysLogged7d) / 7) * 100);
  return { text: pct + "%", warn: pct < 50 };
}
function dashPhaseLabel(rec) {
  return rec.goalPhase ? { text: rec.goalPhase } : { text: "Not set", dim: true };
}
function dashConsultLabel(rec) {
  const at = rec.payments && rec.payments.lastSessionAt;
  if (!at) return { text: "No consults yet", dim: true };
  const d = dashDaysSince(at);
  // ⚠ "No consults yet" IS THE WRONG EMPTY HERE. A stamp we cannot parse means a
  // consult DID happen and we cannot say when — saying there has never been one is a
  // different claim, and the wrong one.
  if (d == null) return { text: "Not shared", dim: true };
  return { text: d === 0 ? "Today" : d + "d", warn: d >= 14 };
}
// ⚠ "ADHERENCE" WAS NOT WHAT THIS MEASURES (2026-11-05). trainingAdherence is get_client_stats'
// sessions kept: completed over booked, the last 42 days, with ANY of the client's coaches (a
// nutritionist's consults count), and a past booking nobody marked done counts as missed
// (2026-10-31-client-stats-window.sql). It is labelled as that everywhere it shows: the column, the
// sort, the drawer and Today's line. A coach-scoped seven-day figure would need the overview's
// sessions on the record and would swing on one or two bookings; the label is the honest fix.
// The column's 92px holds "KEPT · 42D" (written out in the sort map and the trainer heads, which
// the roster tests lift on their own); the drawer section spells it out with DASH_KEPT_NOTE.
const DASH_KEPT_NOTE = "Booked sessions with any of their coaches, last 42 days. A past booking nobody marked done counts as missed.";
function dashAdherenceLabel(rec) {
  const a = rec.trainingAdherence;
  if (!a || a.pct == null) return { text: "Not shared", dim: true };
  return { text: a.pct + "%", warn: a.pct < 70 };
}
// ⚠ THE PROGRAM OF THIS PAGE'S ROLE (#2622's follow-up). `program` is one pick across both of a
// coach's listings, so the nutrition roster could name the trainer's block. `programs[role]`
// (shared-overview's, per role) is each role's own, as the signal engine's programForRole reads it;
// a record without it (an older overview, the demo roster) reads `program` as before.
function dashProgramOf(rec, role) {
  if (!rec) return null;
  const own = role === "trainer" ? "trainer" : role === "nutritionist" || role === "dietitian" ? "nutritionist" : null;
  if (own && rec.programs && typeof rec.programs === "object") return rec.programs[own] || null;
  return rec.program || null;
}
function dashProgramLabel(rec, role) {
  const pr = dashProgramOf(rec, role);
  if (!pr || !pr.name) return { text: "Not set", dim: true };
  // A paused block carries no week (the count is wall-clock and knows nothing
  // about the pause), so say WHY the number is missing rather than showing a
  // bare name that reads like a live program.
  const tail = pr.status === "paused" ? " · paused"
    : pr.week ? " · Wk " + pr.week + (pr.weeks ? "/" + pr.weeks : "") : "";
  return { text: pr.name + tail };
}
function dashStreakLabel(rec) {
  const s = rec.streaks;
  if (!s || s.current == null) return { text: "Not shared", dim: true };
  return { text: s.current + "d", warn: s.current === 0 && s.best >= 3 };
}
function dashContactLabel(rec, role) {
  const lc = rec.lastContact;
  // Three states, not two: no leg at all = we can't see your thread; a leg with
  // a null timestamp = your thread exists and you have never used it. The
  // second is a KNOWN fact about the coach's own inbox, and calling it "Not
  // shared" hides exactly the client who most needs the nudge.
  if (!lc) return { text: "Not shared", dim: true };
  const ts = role === "nutritionist" ? lc.nutritionist : lc.trainer;
  if (!ts) return { text: "Never", warn: true };
  const d = dashDaysSince(ts);
  // Same distinction as the consult cell: an unreadable stamp is not "Never".
  if (d == null) return { text: "Not shared", dim: true };
  return { text: d === 0 ? "Today" : d + "d ago", warn: d >= 5 };
}
function dashRevenueLabel(rec) {
  // What this client is worth per month, from the subscription rows the roster
  // route already sums. 0 is a REAL answer (a client on no paid plan), so it is
  // rendered as $0 rather than dimmed away; only a missing payments leg is
  // "not shared".
  const p = rec.payments;
  if (!p || p.mrrCents == null) return { text: "Not shared", dim: true };
  const dollars = p.mrrCents / 100;
  // ⚠ NOT dim. `dashCellText` renders dim in italic 40% ink — the exact
  // treatment of "Not shared" — so dimming $0 made "this client pays me
  // nothing" indistinguishable from "we do not know what they pay", which
  // is the distinction the comment above exists to keep.
  return { text: "$" + (dollars >= 1000 ? (dollars / 1000).toFixed(1) + "k" : Math.round(dollars).toLocaleString()) + "/mo" };
}
function dashTenureLabel(rec) {
  // How long they have been a client, from their earliest subscription.
  const at = rec.payments && rec.payments.joinedAt;
  if (!at) return { text: "Not shared", dim: true };
  const d = dashDaysSince(at);
  // ⚠ THIS COMMENT USED TO EXPLAIN A NaN THAT `dashDaysSince` NO LONGER RETURNS. It
  // was right, and being right in ONE place is what let three sibling cells render
  // "NaNd ago" for two months — so the fix moved to the source and this is now the
  // ordinary null check every one of them makes.
  if (d == null) return { text: "Not shared", dim: true };
  if (d < 31) return { text: d + "d" };
  const months = Math.floor(d / 30.44);
  return months < 12 ? { text: months + "mo" } : { text: (d / 365.25).toFixed(1) + "y" };
}
// A renewal Stripe is still retrying (past_due). The client keeps their coach, their logs stay
// visible and plans still go out (owner, 2026-10-18: "They stay normal clients until Stripe gives
// up"), so the row stays where its progress puts it and only carries a quiet mark: the payment,
// not the client, is what needs a look. True only when the roster route said so (dashData.jsx
// sets payments.status to "past_due" from its `paymentRetrying`).
function dashPaymentRetrying(rec) {
  return !!(rec && rec.payments && rec.payments.status === "past_due");
}
function dashScoreCell(rec) {
  // DashSignals.scoreWeekReading is the ONE definition of this delta — it
  // compares the two newest COMPLETE weeks, so an in-progress current week
  // shows its live number without reading as a mid-week collapse.
  const r = DashSignals.scoreWeekReading(rec.shapeScoreHistory);
  if (!r) return dashCellText({ text: "Not shared", dim: true });
  return (
    <span title={r.partial ? "Week in progress" : undefined} style={{ fontSize: 12, fontFamily: "'JetBrains Mono', monospace", color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)", whiteSpace: "nowrap" }}>
      {r.points}{r.partial && <span style={{ color: DASH_ROSTER_INK50 }}>*</span>}
      {r.delta != null && <span style={{ color: r.delta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red }}> {r.delta >= 0 ? "▲+" + r.delta : "▼−" + Math.abs(r.delta)}</span>}
    </span>
  );
}

// ── SORTING (review 2026-09-09, R15 · the control R16's memory was waiting on) ───
// The roster had a filter and a search and no ordering control of any kind, so a coach
// could not ask "who pays me most", "who has been here longest" or "who have I not
// spoken to". R16 shipped a memory for a sort that did not exist; this is the sort.
//
// ⚠ EVERY COMPARATOR READS THE VALUE, NEVER THE RENDERED LABEL. The cells say
// "$1.2k/mo", "2mo", "5d ago" — sorting those as text puts $999 above $1.2k, 9mo above
// 2y and 9d ago above 30d ago. Each key below returns the underlying number.
//
// ⚠ AND AN UNKNOWN IS NOT A SMALL VALUE. `null` means "we could not read it" — the
// roster renders it as "Not shared" — and it sorts LAST in BOTH directions, never
// interleaved. Sorting revenue ascending must not present a client whose subscriptions
// read failed as the one who pays the least: that is the honest-data doctrine applied
// to ordering, and it is the whole reason these are comparators rather than `.sort()`
// over the labels.
const DASH_ROSTER_SORTS = {
  // The engine's own order — severity first — which is what the roster has always
  // shown and stays the default. It is a re-ordering of nothing: the rows arrive in it.
  triage: null,
  name: { label: "CLIENT", dir: "asc", of: (r) => (r.client.profile.name || "").toLowerCase() },
  score: { label: "SCORE · WK", dir: "asc", of: (r) => {
    const w = DashSignals.scoreWeekReading(r.client.shapeScoreHistory);
    return w && w.points != null ? w.points : null;
  } },
  adherence: { label: "KEPT · 42D", dir: "asc", of: (r) => {
    const a = r.client.trainingAdherence;
    return a && a.pct != null ? a.pct : null;
  } },
  compliance: { label: "COMPLIANCE · 7D", dir: "asc", of: (r) => {
    const f = r.client.foodLogs;
    return f && f.daysLogged7d != null ? Math.min(7, f.daysLogged7d) : null;
  } },
  // ⚠ DAYS SINCE, so "most stale first" is descending on a number rather than a
  // reversed date. A client with a leg but no timestamp has NEVER been contacted, which
  // is a known fact and the most stale there is — not an unknown.
  lastLog: { label: "LAST FOOD LOG", dir: "desc", of: (r) => {
    const f = r.client.foodLogs;
    if (!f) return null;
    if (!f.lastLoggedOn) return f.daysLogged7d != null ? Infinity : null;
    return dashDaysSince(f.lastLoggedOn);
  } },
  contact: { label: "LAST CONTACT", dir: "desc", of: (r, role) => {
    const lc = r.client.lastContact;
    if (!lc) return null;
    const ts = role === "nutritionist" ? lc.nutritionist : lc.trainer;
    if (!ts) return Infinity;                       // "Never" — known, and the stalest
    return dashDaysSince(ts);
  } },
  consult: { label: "LAST CONSULT", dir: "desc", of: (r) => {
    return dashDaysSince(r.client.payments && r.client.payments.lastSessionAt);
  } },
  streak: { label: "STREAK", dir: "asc", of: (r) => {
    const st = r.client.streaks;
    return st && st.current != null ? st.current : null;
  } },
  revenue: { label: "REVENUE", dir: "desc", of: (r) => {
    const p = r.client.payments;
    return p && p.mrrCents != null ? p.mrrCents : null;
  } },
  tenure: { label: "TENURE", dir: "desc", of: (r) => {
    return dashDaysSince(r.client.payments && r.client.payments.joinedAt);
  } },
};
const DASH_ROSTER_SORT_KEYS = Object.keys(DASH_ROSTER_SORTS);

// A stable, unknown-last comparator. Exported so it can be driven directly — an
// ordering rule that is only ever exercised through a rendered table is a rule nobody
// can point a test at.
function dashRosterSorted(rows, key, dir, role) {
  const spec = DASH_ROSTER_SORTS[key];
  if (!spec) return rows;                            // "triage", or a key this build retired
  const desc = dir === "desc";
  // decorate-sort-undecorate: `of` can be several property reads deep and Array.sort
  // calls the comparator O(n log n) times.
  const decorated = rows.map((r, i) => ({ r, i, v: spec.of(r, role) }));
  decorated.sort((a, b) => {
    const an = a.v == null, bn = b.v == null;
    // ⚠ UNKNOWN LAST IN BOTH DIRECTIONS — not "smallest", not "largest". A client whose
    // revenue could not be read is not the cheapest client.
    if (an || bn) return an && bn ? a.i - b.i : an ? 1 : -1;
    let c;
    if (typeof a.v === "string" || typeof b.v === "string") c = String(a.v).localeCompare(String(b.v));
    else c = a.v < b.v ? -1 : a.v > b.v ? 1 : 0;
    if (c === 0) return a.i - b.i;                   // stable: ties keep triage order
    return desc ? -c : c;
  });
  return decorated.map((d) => d.r);
}

// ── Role-configured columns ──────────────────────────────────────────────────
const DASH_ROSTER_VIEWS = {
  nutritionist: {
    cols: "2fr 110px 110px 110px 120px 92px 74px",
    minWidth: 806,
    // ⚠ EACH HEAD NAMES ITS COMPARATOR, and GOAL PHASE names none — it is a free-text
    // label the coach types, so alphabetical order over it means nothing. A column with
    // no sort key renders as plain text rather than as a button that does nothing.
    heads: [["LAST FOOD LOG", "lastLog"], ["COMPLIANCE · 7D", "compliance"], ["GOAL PHASE", null], ["LAST CONSULT", "consult"], ["REVENUE", "revenue"], ["TENURE", "tenure"]],
    cells: (rec, role) => [
      dashCellText(dashLastLogLabel(rec)),
      dashCellText(dashComplianceLabel(rec)),
      dashCellText(dashPhaseLabel(rec)),
      dashCellText(dashConsultLabel(rec)),
      dashCellText(dashRevenueLabel(rec)),
      dashCellText(dashTenureLabel(rec)),
    ],
  },
  trainer: {
    // PROGRAM is flexible with a floor: a fixed 170px let "Strength Block 3 ·
    // Wk 6/12" run into STREAK at 1440px (review 2026-09-09, V1); the cell
    // also ellipsises now, with the full text on hover.
    cols: "1.6fr 104px 92px minmax(180px, 1fr) 64px 100px 92px 74px",
    minWidth: 926,
    // PROGRAM names no comparator: it is a block name plus a week, and ordering blocks
    // alphabetically answers no question a coach has.
    heads: [["SCORE · WK", "score"], ["KEPT · 42D", "adherence"], ["PROGRAM", null], ["STREAK", "streak"], ["LAST CONTACT", "contact"], ["REVENUE", "revenue"], ["TENURE", "tenure"]],
    cells: (rec, role) => [
      dashScoreCell(rec),
      dashCellText(dashAdherenceLabel(rec)),
      dashCellText(dashProgramLabel(rec, role)),
      dashCellText(dashStreakLabel(rec)),
      dashCellText(dashContactLabel(rec, role)),
      dashCellText(dashRevenueLabel(rec)),
      dashCellText(dashTenureLabel(rec)),
    ],
  },
};
// ⚠ THE COLUMNS A DOCKED LIST KEEPS (coach dashboard step 5a), by their index in `heads`. With the
// panel beside it the list has about two thirds of the page, and the panel carries the rest of the
// client, so the list keeps the three a coach scans by: the score and sessions kept with the last
// contact, or the last food log and compliance with the last consult. The column the roster is
// SORTED by always stays (dashRosterColumns), so a remembered sort never orders rows by a column
// nobody can see.
const DASH_ROSTER_COMPACT = { trainer: [0, 1, 4], nutritionist: [0, 1, 3] };
// A grid template's tracks, split on the spaces outside a minmax(…).
function dashGridTracks(cols) {
  const out = [];
  let depth = 0, cur = "";
  for (const ch of String(cols || "")) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (/\s/.test(ch) && !depth) { if (cur) out.push(cur); cur = ""; } else cur += ch;
  }
  if (cur) out.push(cur);
  return out;
}
// The columns a table draws: every head, or (docked) the compact ones and the sorted one, with the
// grid template and the floor for that set. `keep` holds indices into `heads`, in their own order.
function dashRosterColumns(view, role, docked, sort) {
  const all = view.heads.map((h, i) => i);
  if (!docked) return { keep: all, cols: view.cols, minWidth: view.minWidth };
  const base = DASH_ROSTER_COMPACT[role === "trainer" ? "trainer" : "nutritionist"] || all;
  const sorted = view.heads.findIndex((h) => h[1] && h[1] === sort);
  const keep = all.filter((i) => base.includes(i) || i === sorted);
  const tracks = dashGridTracks(view.cols);
  return { keep, cols: ["minmax(140px, 1fr)"].concat(keep.map((i) => tracks[i + 1] || "1fr")).join(" "), minWidth: 0 };
}

// ── The shared drilldown drawer ──────────────────────────────────────────────
function DashDrawerSection({ title, right, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 10 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "var(--sh-accent, #2ee0c4)" }}>{title}</div>
        {right && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{right}</div>}
      </div>
      <div style={{ height: 2, background: "linear-gradient(90deg, var(--sh-accent, #2ee0c4), rgba(var(--sh-accent-rgb, 46,224,196),0.2) 45%, transparent 85%)", margin: "7px 0 12px" }} />
      {children}
    </div>
  );
}
function DashDrawerEmpty({ children }) {
  return <div style={{ fontSize: 12.5, color: DASH_ROSTER_INK50, lineHeight: 1.5 }}>{children}</div>;
}
// ⚠ LOADING, UNREAD AND EMPTY ARE THREE SENTENCES (coach dashboard step 5a). Most of the panel comes
// from the client's overview, which a live roster reads after its first paint: until it lands a
// field is absent because nobody has looked, and after a failed read because the look failed. Only a
// READ overview's absence is "not shared" or "none yet". The preview's people carry no read state:
// their records are whole, so they read as read.
function dashPeekRead(rec) {
  const s = rec && rec.progressRead && rec.progressRead.state;
  return s === "loading" ? "loading" : s === "unavailable" ? "unavailable" : "ready";
}
// The sentence for a field the record does not hold yet, or null once the overview was read.
function dashPeekWait(rec, what) {
  const read = dashPeekRead(rec);
  if (read === "loading") return "Reading their " + what + "…";
  if (read === "unavailable") return "Their " + what + " couldn't be read just now.";
  return null;
}
function DashDrawerSpark({ data, color = "var(--sh-accent, #2ee0c4)", w = 120, h = 34 }) {
  if (!Array.isArray(data) || data.length < 2) return null;
  const min = Math.min(...data), max = Math.max(...data), span = max - min || 1;
  const pts = data.map((v, i) => ((i / (data.length - 1)) * (w - 4) + 2) + "," + (h - 4 - ((v - min) / span) * (h - 8)));
  return <svg width={w} height={h} style={{ flexShrink: 0 }}><polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

// Section bodies — each handles its own honest empty state.
function DashSecScore({ rec }) {
  const r = DashSignals.scoreWeekReading(rec.shapeScoreHistory);
  if (!r) return <DashDrawerEmpty>{dashPeekWait(rec, "Shape Score") || "Score history isn't shared to coaches yet."}</DashDrawerEmpty>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <DashDrawerSpark data={r.series} />
      <div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 22, letterSpacing: "-0.02em" }}>{r.points} <span style={{ fontSize: 12, color: DASH_ROSTER_INK50 }}>wk pts</span></div>
        {/* The delta names which weeks it compares — a bare arrow beside an
            in-progress number invites reading it as this week vs last. */}
        {r.delta != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, marginTop: 3, color: r.delta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red }}>{r.delta >= 0 ? "▲ +" + r.delta : "▼ −" + Math.abs(r.delta)} {r.partial ? "last full wk" : "wk/wk"}</div>}
        {r.partial && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.08em", textTransform: "uppercase", color: DASH_ROSTER_INK50, marginTop: 3 }}>Week in progress</div>}
      </div>
    </div>
  );
}
function DashSecAdherence({ rec }) {
  const a = rec.trainingAdherence;
  if (!a) return <DashDrawerEmpty>{dashPeekWait(rec, "sessions") || "Session data isn't shared yet."}</DashDrawerEmpty>;
  return (
    <div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
        <span style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 22 }}>{a.pct}%</span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50 }}>{a.done} of {a.planned} sessions kept · 42d</span>
      </div>
      <div style={{ fontSize: 10.5, color: DASH_ROSTER_INK50, marginTop: 4, lineHeight: 1.45 }}>{DASH_KEPT_NOTE}</div>
      <div style={{ position: "relative", height: 6, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 2, marginTop: 8 }}>
        <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, a.pct) + "%", background: a.pct < 70 ? DASH_SEV_COLORS.amber : "var(--sh-accent, #2ee0c4)", borderRadius: 2 }} />
      </div>
    </div>
  );
}
function DashSecNotes({ rec }) {
  const notes = rec.coachNotes;
  // Same three-state idiom as DashSecLogs below: [] is a doc that was read and
  // holds nothing for this client; null is a doc that could not be read, and
  // asserting "no notes yet" there tells the coach they wrote nothing when the
  // truth is we could not look.
  if (notes === undefined) return <DashDrawerEmpty>Loading your notes…</DashDrawerEmpty>;
  if (notes == null) return <DashDrawerEmpty>Couldn't read your notes just now — use Refresh above to retry.</DashDrawerEmpty>;
  if (!Array.isArray(notes) || !notes.length) return <DashDrawerEmpty>No notes yet — write one on the client's file.</DashDrawerEmpty>;
  return (
    <div>
      {notes.slice(0, 3).map((n, i) => (
        <div key={i} style={{ padding: "8px 0", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" : "none" }}>
          <div style={{ fontSize: 12.5, lineHeight: 1.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)" }}>{n.text}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.08em", textTransform: "uppercase", color: DASH_ROSTER_INK50, marginTop: 3 }}>{dashRelShort(n.on) || ""}</div>
        </div>
      ))}
    </div>
  );
}
function DashSecMilestones({ rec }) {
  const units = useDashUnits();
  const ms = dashMilestonesIn(DashSignals.buildMilestones(rec), units);
  if (!ms.recent.length && !ms.next.length) return <DashDrawerEmpty>{dashPeekWait(rec, "milestones") || "Milestones appear as they log and share progress."}</DashDrawerEmpty>;
  return (
    <div>
      {ms.recent.map((m, i) => (
        <div key={"r" + i} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 8, alignItems: "center", padding: "5px 0" }}>
          <span style={{ color: DASH_SEV_COLORS.green, fontSize: 12 }}>✓</span>
          <span style={{ fontSize: 12.5, fontWeight: 500 }}>{m.label}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{m.active ? "active" : (dashRelShort(m.hitAt) || "earned")}</span>
        </div>
      ))}
      {ms.next.map((m, i) => (
        <div key={"n" + i} style={{ display: "grid", gridTemplateColumns: "16px 1fr auto", gap: 8, alignItems: "center", padding: "5px 0" }}>
          <span style={{ color: DASH_ROSTER_INK50, fontSize: 12 }}>○</span>
          <span style={{ fontSize: 12.5, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.75)" }}>{m.label}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, color: DASH_ROSTER_INK50 }}>{m.detail}</span>
        </div>
      ))}
    </div>
  );
}
function DashSecNutritionSummary({ rec }) {
  const units = useDashUnits();
  const f = rec.foodLogs;
  const weighIns = Array.isArray(rec.weighIns) ? rec.weighIns.filter((w) => w && w.weight != null) : [];
  const wDelta = weighIns.length >= 2 ? dashWeighInDelta(weighIns[0], weighIns[weighIns.length - 1], units) : null;
  const wNow = weighIns.length ? dashWeighIn(weighIns[weighIns.length - 1], units) : null;
  if (!f && !weighIns.length) return <DashDrawerEmpty>{dashPeekWait(rec, "food logs") || "Nothing shared from the nutrition side yet."}</DashDrawerEmpty>;
  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: weighIns.length ? 12 : 0 }}>
        <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 8, padding: "11px 13px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Logging</div>
          <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 18, marginTop: 4 }}>{f && f.daysLogged7d != null ? f.daysLogged7d + "/7 days" : "—"}</div>
          <div style={{ fontSize: 10, color: DASH_ROSTER_INK50, marginTop: 2 }}>{f && f.lastLoggedOn ? "last " + (dashRelShort(f.lastLoggedOn) || "").toLowerCase() : "no last-log date shared"}</div>
        </div>
        <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 8, padding: "11px 13px" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Compliance · 7d</div>
          <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 18, marginTop: 4 }}>{f && f.daysLogged7d != null ? Math.round((Math.min(7, f.daysLogged7d) / 7) * 100) + "%" : "—"}</div>
          <div style={{ fontSize: 10, color: DASH_ROSTER_INK50, marginTop: 2 }}>food logs</div>
        </div>
      </div>
      {weighIns.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <DashDrawerSpark data={weighIns.map((w) => Number(dashWeighIn(w, units).value))} />
          <div>
            <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 18 }}>{wNow.value} <span style={{ fontSize: 11, color: DASH_ROSTER_INK50 }}>{wNow.unit}</span></div>
            {wDelta != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, color: DASH_ROSTER_INK50, marginTop: 2 }}>{wDelta > 0 ? "+" : ""}{wDelta} since first shared weigh-in</div>}
          </div>
        </div>
      )}
    </div>
  );
}
function DashSecLogs({ rec }) {
  if (Array.isArray(rec.recentLogs) && rec.recentLogs.length) {
    return (
      <div>
        {rec.recentLogs.slice(0, 3).map((l, i) => (
          <div key={i} style={{ display: "grid", gridTemplateColumns: "84px 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: i ? "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.06)" : "none" }}>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50 }}>{dashRelShort(l.on)}</span>
            <span style={{ fontSize: 12.5 }}>{l.kcal != null ? l.kcal.toLocaleString() + " kcal" : "logged"}</span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: DASH_ROSTER_INK50 }}>{l.protein != null ? l.protein + "g P" : ""}</span>
          </div>
        ))}
      </div>
    );
  }
  const wait = dashPeekWait(rec, "food logs");
  if (wait) return <DashDrawerEmpty>{wait}</DashDrawerEmpty>;
  return rec.recentLogs
    ? <DashDrawerEmpty>No logs in the window — matches the flag above.</DashDrawerEmpty>
    : <DashDrawerEmpty>Per-day log detail isn't shared to the web yet — weekly compliance is in the roster column.</DashDrawerEmpty>;
}
function DashSecMacros({ rec }) {
  const n = rec.nutrition;
  if (!n || (n.avgCalories == null && n.avgProtein == null)) return <DashDrawerEmpty>{dashPeekWait(rec, "intake averages") || "No intake averages shared yet."}</DashDrawerEmpty>;
  const row = (label, avg, target, overBad) => {
    if (avg == null) return null;
    const pct = target ? Math.round((avg / target) * 100) : null;
    const bad = pct != null && (overBad ? pct > 110 : pct < 85);
    return (
      <div style={{ display: "grid", gridTemplateColumns: "70px 1fr auto", gap: 10, alignItems: "center", padding: "7px 0" }}>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.1em", color: DASH_ROSTER_INK50, textTransform: "uppercase" }}>{label}</span>
        <div style={{ position: "relative", height: 5, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 2 }}>
          {pct != null && <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: Math.min(100, pct) + "%", background: bad ? DASH_SEV_COLORS.red : "var(--sh-accent, #2ee0c4)", borderRadius: 2 }} />}
        </div>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: bad ? DASH_SEV_COLORS.red : "var(--sh-ink, #f2ede4)", whiteSpace: "nowrap" }}>
          {avg}{target ? <span style={{ color: DASH_ROSTER_INK50 }}>/{target} ({pct}%)</span> : <span style={{ color: DASH_ROSTER_INK50 }}> · no target set</span>}
        </span>
      </div>
    );
  };
  return <div>{row("Calories", n.avgCalories, n.targetCalories, true)}{row("Protein", n.avgProtein, n.targetProtein, false)}</div>;
}
function DashSecWeighIns({ rec }) {
  const units = useDashUnits();
  const weighIns = Array.isArray(rec.weighIns) ? rec.weighIns.filter((w) => w && w.weight != null) : [];
  if (!weighIns.length) return <DashDrawerEmpty>{dashPeekWait(rec, "weigh-ins") || "No shared weigh-ins yet."}</DashDrawerEmpty>;
  const wDelta = weighIns.length >= 2 ? dashWeighInDelta(weighIns[0], weighIns[weighIns.length - 1], units) : null;
  const wNow = dashWeighIn(weighIns[weighIns.length - 1], units);
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <DashDrawerSpark data={weighIns.map((w) => Number(dashWeighIn(w, units).value))} />
      <div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 20, letterSpacing: "-0.02em" }}>{wNow.value} <span style={{ fontSize: 12, color: DASH_ROSTER_INK50 }}>{wNow.unit}</span></div>
        {wDelta != null && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, color: DASH_ROSTER_INK50, marginTop: 2 }}>{wDelta > 0 ? "+" : ""}{wDelta} since first shared weigh-in</div>}
      </div>
    </div>
  );
}
function DashSecTrainingContext({ rec }) {
  const adh = rec.trainingAdherence;
  const wk = DashSignals.scoreWeekReading(rec.shapeScoreHistory);
  const wkPts = wk ? wk.points : null;
  const wkDelta = wk ? wk.delta : null;
  // ⚠ The delta compares the two newest COMPLETE weeks, so when the number
  // above it is the week in progress the two are not the same comparison and
  // the label must not say "wk/wk" — the same marker dashScoreCell and
  // DashSecScore carry. Adopting the shared reading without its `partial` flag
  // is how a number ends up disagreeing with its own caption.
  const wkPartial = !!(wk && wk.partial);
  if (!adh && wkPts == null) return <DashDrawerEmpty>{dashPeekWait(rec, "training") || "Training data isn't shared to coaches on the web yet."}</DashDrawerEmpty>;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
      <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Volume · 42d</div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 20, marginTop: 5 }}>{adh ? adh.done + "/" + adh.planned : "—"}</div>
        <div style={{ fontSize: 10.5, color: DASH_ROSTER_INK50, marginTop: 2 }}>{adh ? adh.pct + "% of sessions kept" : "not shared"}</div>
      </div>
      <div style={{ background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 8, padding: "12px 14px" }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>Shape Score · wk</div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 20, marginTop: 5 }}>{wkPts != null ? wkPts + " pts" : "—"}{wkPartial && <span style={{ fontSize: 12, color: DASH_ROSTER_INK50 }}>*</span>}</div>
        <div style={{ fontSize: 10.5, color: wkDelta == null ? DASH_ROSTER_INK50 : wkDelta >= 0 ? DASH_SEV_COLORS.green : DASH_SEV_COLORS.red, marginTop: 2 }}>{wkDelta != null ? (wkDelta >= 0 ? "▲ +" + wkDelta : "▼ −" + Math.abs(wkDelta)) + (wkPartial ? " last full wk" : " wk/wk") : "history not shared"}</div>
        {wkPartial && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: "0.08em", textTransform: "uppercase", color: DASH_ROSTER_INK50, marginTop: 2 }}>Week in progress</div>}
      </div>
    </div>
  );
}

// Goals (dashGoals.jsx) — pros SET goals from this drawer; loaded lazily so
// pages without the goals module keep rendering the rest of the drawer.
function DashSecGoals({ rec, role }) {
  if (typeof window !== "undefined" && typeof window.DashGoalsSection === "function") {
    return <DashGoalsSection rec={rec} role={role} />;
  }
  return <DashDrawerEmpty>Goal cards live on pages that load dashGoals.jsx.</DashDrawerEmpty>;
}

// ── The calmer panel's parts (the owner's coach review, step 5a) ─────────────
// Three facts at the top: the program (the plan, for a nutritionist), how they are keeping to it
// (sessions kept, or days logged), and their streak. Each is a value, or says which of loading,
// unread or empty it is: "…" while the overview reads, "—" when it couldn't be read, and the
// roster's own words ("Not set", "Not shared") for a read overview that holds nothing.
function dashPeekFacts(rec, role) {
  const read = dashPeekRead(rec);
  const nutri = role === "nutritionist" || role === "dietitian";
  const miss = (empty) => read === "loading" ? { v: "…", sub: "reading", state: "loading" }
    : read === "unavailable" ? { v: "—", sub: "couldn't be read", state: "unread" }
    : { v: empty, sub: null, state: "empty" };
  const pr = dashProgramOf(rec, role);
  // No program of this role's own, but a goal phase: the phase, as the panel's header said before.
  const program = pr && pr.name
    ? { v: pr.name, sub: pr.status === "paused" ? "paused" : pr.week ? "week " + pr.week + (pr.weeks ? " of " + pr.weeks : "") : null, state: "value" }
    : rec.goalPhase ? { v: rec.goalPhase + " phase", sub: nutri ? "no plan set" : "no program set", state: "value" }
    : miss("Not set");
  let keeping;
  if (nutri) {
    const f = rec.foodLogs;
    const d = f && f.daysLogged7d != null ? Math.min(7, f.daysLogged7d) : null;
    keeping = d != null ? { v: Math.round((d / 7) * 100) + "%", sub: d + " of 7 days logged", state: "value" } : miss("Not shared");
  } else {
    const a = rec.trainingAdherence;
    keeping = a && a.pct != null
      ? { v: a.pct + "%", sub: (a.done != null && a.planned != null ? a.done + " of " + a.planned + " kept" : "kept") + " · 42 days", state: "value" }
      : miss("Not shared");
  }
  const st = rec.streaks;
  const streak = st && st.current != null
    ? { v: st.current + (st.current === 1 ? " day" : " days"), sub: st.best != null ? "best " + st.best : null, state: "value" }
    : miss("Not shared");
  return [
    { key: "program", label: nutri ? "Plan" : "Program", ...program },
    { key: "keeping", label: nutri ? "Logging · 7 days" : "Sessions kept", ...keeping },
    { key: "streak", label: "Streak", ...streak },
  ];
}
function DashPeekFacts({ rec, role }) {
  const facts = dashPeekFacts(rec, role);
  return (
    <div data-peek-facts="" style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 1, background: "var(--sh-line, #302c27)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 10, overflow: "hidden", marginBottom: 20 }}>
      {facts.map((f) => (
        <div key={f.key} data-peek-fact={f.key} data-state={f.state} style={{ background: "var(--sh-card, #25211d)", padding: "11px 12px", minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{f.label}</div>
          <div title={f.v} style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: f.state === "value" ? 17 : 14, marginTop: 5, lineHeight: 1.15, color: f.state === "value" ? "var(--sh-ink, #f2ede4)" : DASH_ROSTER_INK50, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.v}</div>
          {f.sub && <div style={{ fontSize: 10.5, color: DASH_ROSTER_INK50, marginTop: 3, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.sub}</div>}
        </div>
      ))}
    </div>
  );
}

// An instant's day on the account's clock, "YYYY-MM-DD" (shapeZone.mjs, read at call time), else
// this browser's; and today's.
function dashPeekDayKey(ms) {
  try {
    const Z = typeof window !== "undefined" ? window.ShapeZone : null;
    if (Z && typeof Z.dayKey === "function") { const k = Z.dayKey(ms); if (k) return k; }
  } catch (e) { /* this browser's day below */ }
  const d = new Date(ms);
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
function dashPeekTodayKey() { return dashPeekDayKey(Date.now()); }
function dashDaysBetweenKeys(fromKey, toKey) {
  const day = (k) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(k || "")); return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null; };
  const a = day(fromKey), b = day(toKey);
  return a == null || b == null ? null : Math.round((b - a) / 86400000);
}
// The Monday of a "YYYY-MM-DD" day as a UTC-noon instant, or null; whole weeks between two days.
function dashMondayOf(key) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(key || ""));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12));
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.getTime();
}
function dashWeeksBetween(fromKey, toKey) {
  const a = dashMondayOf(fromKey), b = dashMondayOf(toKey);
  return a == null || b == null ? null : Math.round((b - a) / (7 * 86400000));
}
const DASH_CHECKIN_RATINGS = [["trainingAdherence", "Training"], ["nutritionAdherence", "Nutrition"], ["sleep", "Sleep"], ["energy", "Energy"], ["stress", "Stress"], ["hunger", "Hunger"]];

// The week's check-in: whose week it is, the ratings and what they wrote, and whether the coach has
// reviewed it. `checkIn` is the engine's summary (latest: weekOf, ratings, reviewed); `checkins` the
// rows themselves, for the words. A review state nobody could read (`reviewed` null on a read
// check-in) says so; the preview reads no reviews and claims none.
function DashSecCheckin({ rec, role }) {
  const ci = rec.checkIn;
  if (!ci) return <DashDrawerEmpty>{dashPeekWait(rec, "check-ins") || "Check-ins aren't shared to the web yet."}</DashDrawerEmpty>;
  const latest = ci.latest && typeof ci.latest === "object" ? ci.latest : null;
  const weekOf = (latest && latest.weekOf) || ci.lastWeekOf || null;
  if (!weekOf) return <DashDrawerEmpty>{rec.profile && rec.profile.isNew ? "No first check-in yet. They're new, so it isn't late." : "No check-in yet."}</DashDrawerEmpty>;
  const ago = dashWeeksBetween(weekOf, dashPeekTodayKey());
  const when = ago === 0 ? "This week's check-in is in."
    : ago === 1 ? "Last week's check-in. This week's isn't in yet."
    : ago != null && ago > 1 ? "Their last check-in was " + ago + " weeks ago."
    : "Their last check-in is for the week of " + weekOf + ".";
  const row = Array.isArray(rec.checkins) ? rec.checkins.find((c) => c && String(c.week_of || c.weekOf || "").slice(0, 10) === weekOf) || null : null;
  const ratings = (row && row.ratings) || (latest && latest.ratings) || null;
  const rated = ratings && typeof ratings === "object"
    ? DASH_CHECKIN_RATINGS.filter(([k]) => typeof ratings[k] === "number" && Number.isFinite(ratings[k])).map(([k, l]) => l + " " + ratings[k] + "/10")
    : [];
  // The review state is said for this week's or last week's check-in only, the window the engine
  // treats as a to-do (ruleCheckinWaiting); an older one is Week's history, not a nag.
  const review = !latest || ago == null || ago < 0 || ago > 1 ? null
    : latest.reviewed === true ? { t: "Reviewed", c: DASH_SEV_COLORS.green }
    : latest.reviewed === false ? { t: "Waiting on your review", c: DASH_SEV_COLORS.amber }
    : { t: "Review status couldn't be read", c: DASH_SEV_COLORS.unknown };
  const label = { fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DASH_ROSTER_INK50, marginRight: 8 };
  const week = typeof dashTabHref === "function" && ago != null && ago <= 1 ? dashTabHref("week", role) : null;
  return (
    <div data-peek-checkin={ago === 0 ? "this-week" : ago === 1 ? "last-week" : "older"} style={{ display: "grid", gap: 7 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 13 }}>
        <span>{when}</span>
        {review && <DashPill c={review.c}>{review.t}</DashPill>}
      </div>
      {rated.length > 0 && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: DASH_ROSTER_INK50, lineHeight: 1.6 }}>{rated.join(" · ")}</div>}
      {row && row.wins && <div style={{ fontSize: 12.5, lineHeight: 1.45 }}><span style={label}>Win</span>{row.wins}</div>}
      {row && row.struggles && <div style={{ fontSize: 12.5, lineHeight: 1.45 }}><span style={label}>Struggle</span>{row.struggles}</div>}
      {row && row.question && <div style={{ fontSize: 12.5, lineHeight: 1.45 }}><span style={label}>Asked you</span>{row.question}</div>}
      {week && <a href={week} style={{ fontSize: 12, color: "var(--sh-accent-ink, #2ee0c4)", textDecoration: "none" }}>Read it on Week →</a>}
    </div>
  );
}

// ── The next session: from the schedule the page already reads, never a fetch per client ──────
// `sessions` is what the host hands the panel (dashPeekSessions): { state: "loading" | "unread" |
// "read", rows: [{ at, clientId, who, status, sub }] }, or nothing on a page that holds no schedule.
// A row is this client's by its client id; one booked without an account link (no id) by their name.
// A cancelled, declined or completed booking is not a next session, and neither is one that started.
const DASH_PEEK_OPEN_STATUSES = ["requested", "confirmed"];
function dashNextSessionFor(rec, sessions, now) {
  if (!sessions || typeof sessions !== "object") return { state: "elsewhere" };
  if (sessions.state === "loading") return { state: "loading" };
  if (sessions.state !== "read" || !Array.isArray(sessions.rows)) return { state: "unread" };
  const p = rec && rec.profile ? rec.profile : {};
  const id = p.id != null ? String(p.id) : null;
  const name = String(p.name || "").trim().toLowerCase();
  const t = Number.isFinite(now) ? now : Date.now();
  let best = null;
  for (const s of sessions.rows) {
    if (!s || !Number.isFinite(s.at) || s.at <= t) continue;
    if (s.status != null && DASH_PEEK_OPEN_STATUSES.indexOf(s.status) === -1) continue;
    const mine = s.clientId != null ? id != null && String(s.clientId) === id : !!name && String(s.who || "").trim().toLowerCase() === name;
    if (mine && (!best || s.at < best.at)) best = s;
  }
  return best ? { state: "booked", session: best } : { state: "none" };
}
// The page's schedule for the panel. `today` is useDashboard's role dashboard feed, whose calendar
// holds the coach's own bookings (kind SESSION, with their client id and status) and the other
// coach's (sharedCoach), which are not this coach's to name. The preview reads its own sample
// calendar, under the demo band. ⚠ AN OLDER FEED SENT NO STATUS, and a cancelled booking must not
// read as the next one, so a calendar whose own rows carry none is unread, never "nothing booked".
function dashPeekSessions(today, source, role) {
  if (source == null) return { state: "loading" };
  if (source === "demo") {
    const cfg = typeof DASH_TODAY_ROLES !== "undefined" && DASH_TODAY_ROLES ? DASH_TODAY_ROLES[role === "nutritionist" ? "nutritionist" : "trainer"] : null;
    const cal = cfg && typeof dashDemoCalendar === "function" ? dashDemoCalendar(cfg.mockCalendar) : null;
    if (!Array.isArray(cal)) return { state: "unread" };
    const kind = role === "nutritionist" ? "CONSULT" : "SESSION";
    const rows = cal.filter((e) => e && e.kind === kind && /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") && /^\d{2}:\d{2}$/.test(e.time || "")).map((e) => {
      const d = e.date.split("-").map(Number), hm = e.time.split(":").map(Number);
      const parts = String(e.title || "").split(" · ");
      return { at: new Date(d[0], d[1] - 1, d[2], hm[0], hm[1]).getTime(), clientId: null, who: parts[0], status: null, sub: parts.slice(1).join(" · ") || e.sub || null };
    });
    return { state: "read", rows };
  }
  if (source !== "live") return { state: "unread" };
  const cal = today && Array.isArray(today.calendar) ? today.calendar : null;
  if (!cal) return { state: "unread" };
  const own = cal.filter((e) => e && !e.sharedCoach && e.kind === "SESSION");
  if (own.length && !own.some((e) => typeof e.status === "string")) return { state: "unread" };
  return { state: "read", rows: own.map((e) => ({ at: Date.parse(e.at), clientId: e.clientId != null ? e.clientId : null, who: e.title || "", status: typeof e.status === "string" ? e.status : null, sub: e.sub || null })) };
}
// A booking's day and time on the account's clock (shapeZone.mjs), else this browser's.
function dashPeekWhen(ms) {
  try {
    const Z = typeof window !== "undefined" ? window.ShapeZone : null;
    if (Z && typeof Z.formatDateTime === "function") { const s = Z.formatDateTime(ms); if (s) return s; }
  } catch (e) { /* this browser's clock below */ }
  try { return new Date(ms).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }); } catch (e) { return ""; }
}
function DashSecNext({ rec, role, ctx }) {
  const unit = role === "nutritionist" ? "consult" : "session";
  const r = dashNextSessionFor(rec, ctx && ctx.sessions, Date.now());
  const sched = typeof dashTabHref === "function" ? dashTabHref("schedule", role) : null;
  const link = sched ? <a href={sched} style={{ color: "var(--sh-accent-ink, #2ee0c4)", textDecoration: "none", whiteSpace: "nowrap" }}>Open Schedule →</a> : null;
  if (r.state === "booked") {
    const s = r.session;
    // Calendar days on the account's clock: "today", "tomorrow", "in 4 days".
    const days = dashDaysBetweenKeys(dashPeekTodayKey(), dashPeekDayKey(s.at));
    const rel = days == null ? null : days <= 0 ? "today" : days === 1 ? "tomorrow" : "in " + days + " days";
    return (
      <div data-peek-next="booked">
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 18 }}>{dashPeekWhen(s.at)}</div>
        <div style={{ fontSize: 11.5, color: DASH_ROSTER_INK50, marginTop: 3 }}>{[rel, s.sub].filter(Boolean).join(" · ")}</div>
      </div>
    );
  }
  const say = r.state === "loading" ? "Reading your schedule…"
    : r.state === "unread" ? "Your schedule couldn't be read just now."
    : r.state === "none" ? "No " + unit + " booked with them."
    : "This page doesn't hold your bookings.";
  return <DashDrawerEmpty><span data-peek-next={r.state}>{say}</span>{link && r.state !== "loading" ? <> {link}</> : null}</DashDrawerEmpty>;
}

// ── The joint note: only for a shared client (#2629's Shared mark) ─────────────
// The client is on the joint list (useDashboard's `joint`, DashSignals.findJointAttention: a co-coach
// of the other discipline, and slipping in training and in nutrition). The note is the two coaches'
// own, in their private care-team thread (dashOpenCareTeam), which the client never sees, and it says
// so when the thread can't be opened rather than doing nothing.
function dashPeekJoint(joint, rec) {
  if (!Array.isArray(joint) || !rec || !rec.profile || rec.profile.id == null) return null;
  return joint.find((j) => j && j.client && j.client.profile && j.client.profile.id === rec.profile.id && j.coCoach && j.coCoach.role) || null;
}
function DashSecJoint({ rec, role, ctx }) {
  const [fail, setFail] = React.useState(null);
  const j = ctx && ctx.joint;
  if (!j) return null;
  const other = j.coCoach.role;
  const who = "their " + other + (j.coCoach.name ? ", " + j.coCoach.name : "");
  const words = (fs) => (Array.isArray(fs) ? fs : []).map((f) => String((f && f.label) || "").toLowerCase()).filter(Boolean).join(", ");
  const reason = typeof dashJointReason === "function" ? dashJointReason(j) : "Slipping on both sides: " + words(j.trainingFlags) + " and " + words(j.nutritionFlags) + ".";
  const real = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(rec.profile.id || "")) && !!j.coCoach.userId;
  const open = () => {
    setFail(null);
    const say = "Your private thread with " + rec.profile.name + "'s " + other + (real ? " couldn't be opened just now." : " opens on a live account.");
    const go = typeof dashOpenCareTeam === "function" ? dashOpenCareTeam(j, role) : false;
    Promise.resolve(go).then((ok) => { if (!ok) setFail(say); }, () => setFail(say));
  };
  return (
    <div data-peek-joint={other}>
      <div style={{ fontSize: 13, lineHeight: 1.45 }}>Shared with {who}.</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.85)", marginTop: 4 }}>{reason}</div>
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
        <button type="button" className="sh-key" onClick={open} title={"Opens your private thread with " + who + ". The client doesn't see it."}
          style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)", background: "var(--sh-card, #25211d)", border: "1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.35)", borderRadius: 6, padding: "8px 11px", minHeight: 32, cursor: "pointer" }}>
          {(j.action && j.action.label) || "Start joint note"}
        </button>
        <span style={{ fontSize: 11, color: DASH_ROSTER_INK50 }}>A private thread. The client doesn't see it.</span>
      </div>
      <div role="status" style={{ marginTop: fail ? 6 : 0, fontSize: 12, color: DASH_ROSTER_INK50 }}>{fail || ""}</div>
    </div>
  );
}

// Role section sets. The drawer is ONE component; the role decides the lens.
//
// ⚠ EVERY SECTION CARRIES A STABLE KEY, AND THE TITLE IS NOT IT (review 2026-09-09,
// R15 — "choose the drawer's sections per lens"). A coach's hidden list is stored against
// these keys, and a title is user-facing copy: keying on it would mean rewording a
// heading silently un-hides that section for everyone who had hidden it, and renaming it
// back re-hides it. The key never changes; the title is free to.
//
// ⚠ THE REVIEW'S SECTIONS LEAD, IN ITS ORDER (coach dashboard step 5a): the joint note (a shared
// client only), the week's check-in, the score trend, food logs and the next session, under the
// three facts (DashPeekFacts). Each role's own sections follow, and every one stays hideable with
// the ⚙. `score` joins the nutrition lens as the same concept, the same key (as `goals` is).
const DASH_DRAWER_VIEWS = {
  trainer: {
    eyebrow: "Client drilldown",
    sections: [
      ["joint", "Joint note · shared client", DashSecJoint],
      ["checkin", "This week's check-in", DashSecCheckin],
      ["score", "Shape Score · 8 weeks", DashSecScore],
      ["nutrition", "From the nutritionist side · food logs", DashSecNutritionSummary],
      ["next", "Next session", DashSecNext],
      ["adherence", "Sessions kept · 42 days", DashSecAdherence],
      ["goals", "Goals · projections", DashSecGoals],
      ["notes", "Coach notes", DashSecNotes],
      ["milestones", "Milestones", DashSecMilestones],
    ],
  },
  nutritionist: {
    eyebrow: "Quick consult",
    sections: [
      ["joint", "Joint note · shared client", DashSecJoint],
      ["checkin", "This week's check-in", DashSecCheckin],
      ["score", "Shape Score · 8 weeks", DashSecScore],
      ["logs", "Last 3 days · food logs", DashSecLogs],
      ["next", "Next consult", DashSecNext],
      ["macros", "Macros vs targets · 7d avg", DashSecMacros],
      ["weighins", "Weigh-in trend", DashSecWeighIns],
      ["goals", "Goals · projections", DashSecGoals],
      ["training", "From the trainer side · read-only", DashSecTrainingContext],
    ],
  },
};

// Which sections a drawer draws, given the coach's hidden list.
//
// ⚠ THE SET STORES WHAT IS HIDDEN, NOT WHAT IS SHOWN, and the polarity is the whole
// design. Storing the shown list pins today's drawer into the coach's own data: a section
// added next month would be missing for every coach who had ever touched the control, and
// they would have no way to know it existed. Hiding is the exception, so the exception is
// what is written — the same reasoning as `useRememberedChoice` refusing to store a value
// that equals the default.
//
// ⚠ AND A KEY THIS BUILD DOES NOT RECOGNISE IS IGNORED, NOT DROPPED from the document: a
// section retired here may belong to a build that still has it.
function dashDrawerSections(view, hidden) {
  const all = (view && Array.isArray(view.sections)) ? view.sections : [];
  // ⚠ NO FILTER ON THE HIDDEN LIST, AND THE CONTRAST WITH `pulseOrder` IS THE POINT.
  // There a null in the pinned set genuinely matches, because the id reader returns null
  // for a row with no profile id — so the filter is load-bearing and a mutation removing
  // it fails. Here every section key is a slug from the table above, so nothing a
  // corrupted document can carry (null, "", a number) can ever equal one, and a filter
  // would be dead code reading as a guard. The same shape is not the same guard.
  const off = new Set(Array.isArray(hidden) ? hidden : []);
  return { all: all, shown: all.filter(([key]) => !off.has(key)), hiddenCount: all.filter(([key]) => off.has(key)).length };
}

function DashProgressReadout({ row }) {
  const progress = row.progress || DashSignals.progressStatus(row.client);
  if (!row.client.progressRead) return null;
  const checked = progress.checkedAt ? new Date(progress.checkedAt) : null;
  return <div role="status" style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", color: DASH_ROSTER_INK50, fontSize: 12, margin: "0 0 18px", lineHeight: 1.5 }}>
    <span>{progress.label}{checked && Number.isFinite(checked.getTime()) ? " · Last checked " + checked.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : ""}</span>
    <button type="button" disabled={progress.state === "loading"} onClick={() => window.dispatchEvent(new CustomEvent("shape:coach-progress-refresh", { detail: { clientId: row.client.profile.id } }))} style={{ border: "1px solid " + DASH_ROSTER_HAIR, background: "transparent", color: "var(--sh-ink, #f2ede4)", borderRadius: 5, padding: "7px 10px", minHeight: 36, cursor: "pointer" }}>{progress.state === "unavailable" ? "Retry progress" : "Refresh"}</button>
  </div>;
}

// The coach's move and the reasons behind it, at the top of the drawer (P2): the lead reason and the
// 30-day read the engine computes (`directive.read.summary30d`, never shown before), then each reason
// THIS coach owns with Snooze (3 days) and Dismiss (until the reason changes), and what was set aside
// with Restore. `dismiss` is { ok, set, clear } from useDashboard; without it, or before the dismissals
// table answers (the migration is run by hand), the list shows and the controls do not.
const DASH_SNOOZE_DAYS = 3;
function DashDrawerMove({ row, dismiss }) {
  const [busy, setBusy] = React.useState(null);
  const [failed, setFailed] = React.useState(false);
  const rec = row.client;
  const lead = row.lead || null;
  const summary = row.directive && row.directive.read && row.directive.read.summary30d && row.directive.read.summary30d !== "—" ? row.directive.read.summary30d : null;
  const owned = (row.flags || []).filter((f) => f.owned !== false);
  const set = Array.isArray(row.dismissed) ? row.dismissed : [];
  const can = !!(dismiss && dismiss.ok && typeof dismiss.set === "function" && rec.profile && rec.profile.id && !/^demo-/.test(String(rec.profile.id)));
  const act = async (key, fn) => { setBusy(key); setFailed(false); const ok = await fn(); setBusy(null); if (!ok) setFailed(true); };
  const small = { fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", background: "transparent", border: "1px solid " + DASH_ROSTER_HAIR, color: DASH_ROSTER_INK50, borderRadius: 4, padding: "5px 8px", minHeight: 28, cursor: "pointer" };
  if (!lead && !summary && !set.length) return null;
  return (
    <div data-drawer-move="" style={{ marginBottom: 20 }}>
      {lead && <div style={{ fontSize: 14, lineHeight: 1.45 }}>{lead.reason}</div>}
      {summary && <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.04em", color: DASH_ROSTER_INK50, marginTop: 6 }}>{summary}</div>}
      {can && owned.length > 0 && (
        <div style={{ marginTop: 12, display: "grid", gap: 6 }}>
          {owned.map((f) => (
            <div key={f.key} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <span style={{ flex: "1 1 180px", fontSize: 12, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.8)" }}>{f.reason}</span>
              <button type="button" disabled={busy === f.key} style={small} title={"Hide this for " + DASH_SNOOZE_DAYS + " days, or until the reason changes"}
                onClick={() => act(f.key, () => dismiss.set(rec.profile.id, f, new Date(Date.now() + DASH_SNOOZE_DAYS * 86400000).toISOString()))}>Snooze {DASH_SNOOZE_DAYS}d</button>
              <button type="button" disabled={busy === f.key} style={small} title="Hide this until the reason changes"
                onClick={() => act(f.key, () => dismiss.set(rec.profile.id, f, null))}>Dismiss</button>
            </div>
          ))}
        </div>
      )}
      {can && set.length > 0 && (
        <div style={{ marginTop: 10, fontSize: 12, color: DASH_ROSTER_INK50, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <span>Set aside: {set.map((f) => f.label).join(", ")}</span>
          {set.map((f) => <button key={f.key} type="button" disabled={busy === f.key} style={small} onClick={() => act(f.key, () => dismiss.clear(rec.profile.id, f.key))}>Restore {f.label}</button>)}
        </div>
      )}
      {failed && <div role="alert" style={{ marginTop: 8, fontSize: 12, color: DASH_ROSTER_INK50 }}>Couldn't save that just now. Try again in a moment.</div>}
    </div>
  );
}

// ⚠ TWO SHAPES, ONE PANEL (coach dashboard step 5a). `docked` is Clients at desktop widths: the panel
// sits beside the list, on the page, so NOTHING is inert, the page keeps its scroll, focus is free to
// go back to the list (↑ ↓ move the selection there, DashRosterTable), and Esc closes it. Otherwise it
// is the slide-over it always was: a modal over the page, the rest inert, scroll locked, focus held,
// and Esc closes it with focus back on its opener. The content is the same in both.
// `joint` is useDashboard's joint list (a shared client's note) and `sessions` the host's schedule
// (dashPeekSessions); a host without one gets no joint section and "not on this page".
function DashClientDrawer({ row, role, onClose, prefs, dismiss, docked = false, joint, sessions }) {
  const dialogRef = React.useRef(null);
  const overlayRef = React.useRef(null);
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  const headingId = React.useId();
  React.useEffect(() => {
    if (!row || !dialogRef.current) return undefined;
    if (docked) {
      // Docked, Esc is the only key the panel takes, and not from a modal opened over the page.
      const onEsc = (e) => {
        if (e.key !== "Escape" || e.defaultPrevented) return;
        if (document.querySelector('[aria-modal="true"]')) return;
        e.preventDefault();
        closeRef.current();
      };
      document.addEventListener("keydown", onEsc);
      return () => document.removeEventListener("keydown", onEsc);
    }
    const origin = document.activeElement;
    const bodyOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // The portal is a body child; make all other surfaces unavailable to both
    // pointer and keyboard users until the client sheet is closed.
    const siblings = Array.from(document.body.children).filter((el) => el !== overlayRef.current);
    const previous = siblings.map((el) => [el, el.inert, el.getAttribute("aria-hidden")]);
    siblings.forEach((el) => { el.inert = true; el.setAttribute("aria-hidden", "true"); });
    const focusable = () => Array.from(dialogRef.current.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex="0"]')).filter((el) => !el.hidden && !el.closest('[hidden],[aria-hidden="true"]'));
    const focusFirst = () => (focusable()[0] || dialogRef.current).focus();
    const onKey = (e) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); closeRef.current(); }
      if (e.key !== "Tab") return;
      const items = focusable();
      const first = items[0], last = items[items.length - 1];
      if (!first) { e.preventDefault(); dialogRef.current.focus(); }
      else if (e.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    const containFocus = (e) => { if (dialogRef.current && !dialogRef.current.contains(e.target)) focusFirst(); };
    document.addEventListener("keydown", onKey, true);
    document.addEventListener("focusin", containFocus);
    focusFirst();
    return () => {
      document.removeEventListener("keydown", onKey, true);
      document.removeEventListener("focusin", containFocus);
      previous.forEach(([el, inert, hidden]) => { el.inert = inert; if (hidden == null) el.removeAttribute("aria-hidden"); else el.setAttribute("aria-hidden", hidden); });
      document.body.style.overflow = bodyOverflow;
      if (origin && origin.isConnected && origin.focus) origin.focus();
    };
  }, [!!row, !!docked]);
  // ⚠ THE CONTROL LIVES IN THE DRAWER, NOT ON A CARD'S ⚙, because the drawer opens from
  // FOUR places — the roster table, the pulse, the schedule and the roster page — so any
  // one card's gear would be the wrong home for a preference about the drawer itself.
  // Written once here, it works from all four.
  //
  // ⚠ AND THE STORE IS THE PAGE'S, PASSED IN — the drawer does NOT open its own, and the
  // reason is that this component is mounted only while it is open. Its own store would
  // therefore start a fresh `dashboard_prefs` read on EVERY open: the drawer would paint
  // all six sections and drop two ~300ms later, every time, and a coach who reached the
  // ⚙ inside that window could write a list derived from an empty document. The page's
  // store is hydrated long before any row is clicked. A host that passes none degrades
  // to session-only — the same shape as the signed-out preview, and `dash-drawer-prefs`
  // asserts every mount site supplies one, so that path is a safety net and not a plan.
  //
  // ⚠ ONE CONSEQUENCE, DELIBERATE: the drawer now inherits its HOST's `live` flag, so a
  // signed-in coach whose dashboard fell back to demo data remembers nothing here. That
  // is what the roster filter, the schedule view and the pulse pins already do on that
  // same page — one page, one answer about whether this session is real.
  const [hiddenSections, toggleSection] = useRememberedSet(prefs, "drawerHidden:" + role, 12);
  const [showSettings, setShowSettings] = React.useState(false);
  // Hooks run before the early return, or a drawer that closes renders fewer of them
  // than the one that opened — the rules-of-hooks class this repo already post-mortems.
  if (!row) return null;
  const rec = row.client;
  const view = DASH_DRAWER_VIEWS[role] || DASH_DRAWER_VIEWS.trainer;
  const secs = dashDrawerSections(view, hiddenSections);
  // The joint note is drawn for a shared client only; hidden or not, it is never "empty" elsewhere.
  const jointRow = dashPeekJoint(joint, rec);
  const shown = secs.shown.filter(([key]) => key !== "joint" || !!jointRow);
  const ctx = { joint: jointRow, sessions };
  const sevColor = row.severity === "green" ? (rec.profile.isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS.green) : DASH_SEV_COLORS[row.severity] || DASH_SEV_COLORS.unknown;
  // ⚠ THE STATUS IS A LABELLED CHIP, NEVER A BARE COLOUR (owner, #2630): the group's word, then what
  // put them there in the page's ink. The square before the name is their tier, as on the roster.
  const status = row.severity === "red" ? "Needs you" : row.severity === "amber" ? "Watch" : row.severity === "green" ? (rec.profile.isNew ? "New" : "On track") : "Progress unknown";
  const why = row.flags.length ? row.flags.map((f) => f.label).join(" · ") : row.severity === "unknown" ? (row.progress || DashSignals.progressStatus(rec)).label : null;
  const tier = dashClientTierMark(rec.rankPoints);
  const ground = docked ? "var(--sh-card, #25211d)" : "var(--sh-ground2, #14110e)";
  const pad = docked ? 22 : 26;
  const href = dashClientHref(rec, role);

  const panel = (
    <div ref={dialogRef} role={docked ? "region" : "dialog"} aria-modal={docked ? undefined : "true"} aria-labelledby={headingId} tabIndex={-1} data-peek={docked ? "docked" : "sheet"}
      style={docked
        ? { position: "sticky", top: 16, boxSizing: "border-box", maxHeight: "calc(100vh - 32px)", background: ground, border: "1px solid var(--sh-line, #302c27)", borderRadius: 12, boxShadow: "var(--lift-2, 0 4px 14px rgba(0,0,0,0.14))", overflowY: "auto", overscrollBehavior: "contain", padding: "0 " + pad + "px", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", color: "var(--sh-ink, #f2ede4)" }
        : { position: "absolute", top: 0, right: 0, bottom: 0, boxSizing: "border-box", width: "min(440px, 100vw)", background: ground, borderLeft: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", boxShadow: "-24px 0 60px rgba(0,0,0,0.5)", overflowY: "auto", overscrollBehavior: "contain", padding: "26px 26px 40px", fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", color: "var(--sh-ink, #f2ede4)" }}>
      <div style={{ position: "sticky", top: docked ? 0 : -26, zIndex: 2, background: ground, padding: docked ? "18px 0 12px" : "16px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DASH_ROSTER_INK50 }}>{view.eyebrow}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 5, minWidth: 0 }}>
            {tier
              ? <span className="sh-tier-mark" data-tier={tier.tier} role="img" aria-label={tier.title} title={tier.title} style={{ ...tier.style, width: 10, height: 10, flexShrink: 0, borderRadius: 3 }} />
              : <span aria-hidden="true" data-tier-unknown="" style={{ width: 10, height: 10, flexShrink: 0, borderRadius: 3, boxShadow: "inset 0 0 0 1px var(--sh-line2, #413d38)" }} />}
            <div id={headingId} style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: docked ? 24 : 28, letterSpacing: "-0.02em", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{rec.profile.name}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0 }}>
          <button
            type="button"
            aria-label="Choose sections"
            aria-expanded={showSettings}
            title="Choose which sections this drawer shows"
            onClick={() => setShowSettings((v) => !v)}
            style={{ background: "transparent", border: 0, color: secs.hiddenCount ? "var(--sh-accent, #2ee0c4)" : DASH_ROSTER_INK50, fontSize: 15, cursor: "pointer", lineHeight: 1, padding: "4px 6px" }}
          >⚙</button>
          <button onClick={onClose} aria-label="Close" title={docked ? "Close (Esc)" : undefined} style={{ background: "transparent", border: 0, color: DASH_ROSTER_INK50, fontSize: 22, cursor: "pointer", lineHeight: 1, minWidth: 44, minHeight: 44 }}>×</button>
        </div>
      </div>
      <div data-peek-status={row.severity} style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        <DashPill c={sevColor}>{status}</DashPill>
        {jointRow && <span data-dash-shared={jointRow.coCoach.role} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", border: "1px solid currentColor", borderRadius: 4, padding: "2px 6px", whiteSpace: "nowrap", color: "var(--sh-rust, #e0644b)" }}>{"Shared · " + jointRow.coCoach.role}</span>}
        {dashPaymentRetrying(rec) && <DashPill c={DASH_SEV_COLORS.unknown}>Payment retrying</DashPill>}
        {why && <span style={{ fontSize: 12, color: "rgba(var(--sh-ink-rgb, 242,237,228),0.8)" }}>{why}</span>}
      </div>
      <DashPeekFacts rec={rec} role={role} />
      <DashProgressReadout row={row} />
      <DashDrawerMove row={row} dismiss={dismiss} />
      {showSettings && (
        <div style={{ marginBottom: 22, padding: "12px 14px", border: `1px solid ${DASH_ROSTER_HAIR}`, borderRadius: 6, background: "rgba(var(--sh-ink-rgb, 242,237,228),0.03)" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: DASH_ROSTER_INK50, marginBottom: 9 }}>
            Sections · {view.eyebrow}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {secs.all.map(([key, title]) => {
              const on = !hiddenSections.includes(key);
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleSection(key)}
                  style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.06em", padding: "7px 10px", minHeight: 24, borderRadius: 4, cursor: "pointer",
                    border: "1px solid " + (on ? "var(--sh-accent, #2ee0c4)" : DASH_ROSTER_HAIR),
                    background: on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.12)" : "transparent",
                    color: on ? "var(--sh-ink, #f2ede4)" : DASH_ROSTER_INK50 }}
                >{on ? "\u2713 " : ""}{title}</button>
              );
            })}
          </div>
        </div>
      )}
      {shown.map(([key, title, Body]) => (
        <DashDrawerSection key={key} title={title}><Body rec={rec} role={role} ctx={ctx} /></DashDrawerSection>
      ))}
      {secs.shown.length === 0 && (
        /* ⚠ AN EMPTY DRAWER SAYS WHY IT IS EMPTY AND HOW TO UNDO IT. A coach who hides
           every section gets what they asked for — but a name and two buttons reads as
           broken, and a control whose effect cannot be reversed from where you see it is
           the dead-control class from the other direction. */
        <div style={{ fontSize: 12.5, color: DASH_ROSTER_INK50, lineHeight: 1.5, marginBottom: 22 }}>
          Every section is hidden. Open ⚙ above to bring one back.
        </div>
      )}
      <div style={{ position: "sticky", bottom: docked ? 0 : -40, background: ground, padding: "16px 0", display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap", marginTop: 4 }}>
        <button onClick={() => { onClose(); const act = row.lead && row.lead.action; if (act && typeof dashCoachActionGo === "function") dashCoachActionGo(act, row, role); else dashMessageClient(rec.profile.name, role, null, rec.profile.id); }} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sh-deep, #06231f)", background: "var(--sh-accent, #2ee0c4)", border: 0, borderRadius: 4, padding: "11px 18px", cursor: "pointer" }}>{row.lead && row.lead.action ? row.lead.action.label : "Message"}</button>
        {/* The whole file, by its own address: a plain click goes there, ⌘/Ctrl-click opens a tab.
            The preview's people have no file, so the link is not offered for them. */}
        {href && <a href={href} data-peek-file="" style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "var(--sh-accent-ink, #2ee0c4)", textDecoration: "none", padding: "10px 0" }}>Open full file →</a>}
      </div>
    </div>
  );
  if (docked) return panel;
  return ReactDOM.createPortal(
    <div ref={overlayRef} style={{ position: "fixed", inset: 0, zIndex: 240 }}>
      <div aria-hidden="true" onPointerDown={e => { if (e.target === e.currentTarget) onClose(); }} style={{ position: "absolute", inset: 0, background: "rgba(10,10,8,0.6)", backdropFilter: "blur(3px)" }} />
      {panel}
    </div>, document.body
  );
}
// Back-compat alias (step 6 name).
const DashConsultDrawer = DashClientDrawer;

// Which roster rows a status filter keeps. One rule for the table and for the health bar
// that counts it (Clients, 2026-10-15; the bar since step 5a), so a part can never promise
// a number the table then disagrees with. Anything else (including "all") keeps every row.
function dashRosterMatches(r, filter) {
  if (["red", "amber", "green", "unknown"].includes(filter)) return r.severity === filter;
  if (filter === "new") return !!r.client.profile.isNew;
  return true;
}

// ── The roster-health bar (coach dashboard step 5a: it replaces the five status tiles) ─────
// "3 need you · 4 watch · 3 on track", each part a filter over the same rule the table uses
// (dashRosterMatches), so the bar can never promise a number the list then disagrees with; the new
// clients and those whose progress is unknown follow, while there is someone in them (or their
// filter is on). Tapping the part that is on turns it off again.
// ⚠ A COUNT NOBODY COULD READ IS "—", NEVER 0. While the roster loads every part is a dash; while
// the clients' overviews are still on their way (the first paint has every severity "unknown") the
// three status parts are dashes and the bar says it is reading, because "0 need you" then would be a
// claim about people nobody has looked at. Once read, 0 is a measured 0, and the clients whose
// progress couldn't be read are counted apart, as "N progress unknown", which is what is missing.
const DASH_HEALTH_KEYS = ["red", "amber", "green", "new", "unknown"];
const DASH_HEALTH_WORDS = {
  red: (n) => (n === 1 ? "needs you" : "need you"),
  amber: () => "watch",
  green: () => "on track",
  new: () => "new",
  unknown: () => "progress unknown",
};
function dashRosterHealth(triage, loading) {
  const none = { red: null, amber: null, green: null, new: null, unknown: null };
  if (loading || !Array.isArray(triage)) return { state: "loading", counts: none, reading: null, total: null };
  const rows = triage.filter((r) => r && r.client && r.client.profile);
  const reading = rows.filter((r) => r.client.progressRead && r.client.progressRead.state === "loading").length;
  const count = (k) => rows.filter((r) => dashRosterMatches(r, k)).length;
  const settled = reading === 0;
  return {
    state: settled ? "read" : "reading",
    counts: { red: settled ? count("red") : null, amber: settled ? count("amber") : null, green: settled ? count("green") : null, new: count("new"), unknown: settled ? count("unknown") : null },
    reading,
    total: rows.length,
  };
}
// filters: the page's [[key, label]] set (the remembered `rosterFilter`'s allowlist is derived from
// it); `reviewed` is Today's At a glance figure for check-ins reviewed ({ k, l, sub }), or null.
function DashRosterHealth({ health, filters, value, onChange, reviewed }) {
  const h = health || dashRosterHealth(null, true);
  const words = Object.fromEntries((filters || []).map(([k, label]) => [k, label]));
  const keys = DASH_HEALTH_KEYS.filter((k) => words[k] != null);
  const shown = keys.filter((k) => k === "red" || k === "amber" || k === "green" || k === value || (h.counts[k] != null && h.counts[k] > 0));
  const colour = { red: DASH_SEV_COLORS.red, amber: DASH_SEV_COLORS.amber, green: DASH_SEV_COLORS.green, new: DASH_SEV_COLORS.new, unknown: DASH_SEV_COLORS.unknown };
  const sep = <span aria-hidden="true" style={{ color: "var(--sh-ink3, #75706a)" }}>·</span>;
  return (
    <div data-roster-health={h.state} style={{ display: "flex", alignItems: "center", gap: "8px 14px", flexWrap: "wrap", marginBottom: 14, padding: "12px 16px", background: "var(--sh-card, #25211d)", border: "1px solid var(--sh-line, #302c27)", borderRadius: 12 }}>
      <div role="group" aria-label="Roster health: filter the list by status" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", minWidth: 0 }}>
        {shown.map((k, i) => {
          const on = k === value;
          const n = h.counts[k];
          return (
            <React.Fragment key={k}>
              {i > 0 && sep}
              <button type="button" data-health={k} aria-pressed={on} title={words[k]} onClick={() => onChange(on ? "all" : k)}
                style={{ display: "inline-flex", alignItems: "baseline", gap: 6, minHeight: 32, padding: "4px 10px 4px 9px", borderRadius: 6, cursor: "pointer", font: "inherit", fontSize: 13.5, whiteSpace: "nowrap",
                  color: "var(--sh-ink, #f2ede4)", background: on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.1)" : "transparent",
                  // Four sides written apart: a shorthand beside borderLeft is a React styling trap on re-render.
                  borderTop: "1px solid " + (on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.5)" : "transparent"),
                  borderRight: "1px solid " + (on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.5)" : "transparent"),
                  borderBottom: "1px solid " + (on ? "rgba(var(--sh-accent-rgb, 46,224,196),0.5)" : "transparent"),
                  borderLeft: "3px solid " + colour[k] }}>
                <b style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{n == null ? "\u2014" : n}</b>{" "}
                <span style={{ color: on ? "var(--sh-ink, #f2ede4)" : "var(--sh-ink2, #a09b94)" }}>{DASH_HEALTH_WORDS[k](n)}</span>
              </button>
            </React.Fragment>
          );
        })}
        {value && value !== "all" && (
          <button type="button" data-health="all" onClick={() => onChange("all")}
            style={{ minHeight: 32, padding: "4px 8px", border: 0, background: "transparent", cursor: "pointer", font: "inherit", fontSize: 12.5, fontWeight: 600, color: "var(--sh-accent-ink, #2ee0c4)" }}>
            {"Show all" + (h.total != null ? " " + h.total : "")}
          </button>
        )}
      </div>
      <span role="status" style={{ fontSize: 12, color: "var(--sh-ink2, #a09b94)" }}>
        {h.state === "loading" ? "Reading your roster…" : h.state === "reading" ? "Reading " + h.reading + (h.reading === 1 ? " client's" : " clients'") + " progress…" : ""}
      </span>
      {reviewed && (
        <span data-health-reviewed="" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "baseline", gap: 8, flexWrap: "wrap", fontSize: 12.5, color: "var(--sh-ink2, #a09b94)" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.12em", textTransform: "uppercase" }}>{reviewed.l || "Check-ins reviewed"}</span>{" "}
          <b style={{ fontSize: 14, fontWeight: 600, color: reviewed.k === "\u2014" ? "var(--sh-ink2, #a09b94)" : "var(--sh-ink, #f2ede4)", fontVariantNumeric: "tabular-nums" }}>{reviewed.k}</b>
          {reviewed.sub && <React.Fragment>{" "}<span>{reviewed.sub}</span></React.Fragment>}
        </span>
      )}
    </div>
  );
}

// A client's colour is their Shape Score tier's (clientColors.mjs), drawn as the gem before the
// name, never on the name, which keeps the row's ink: { tier, title, style }, the tier in words
// for hover and assistive tech, and `--tier-mark` for dash.css's `.sh-tier-mark`. `points` is the
// record's `rankPoints` (useDashboard). Read at CALL time, because the module tag that sets
// window.ShapeClientColors is only on the two coach app pages. null for an unknown tier (not
// read, a failed read, no module): no colour, never Raw.
function dashClientTierMark(points) {
  const CC = typeof window !== "undefined" ? window.ShapeClientColors : null;
  if (typeof points !== "number" || !Number.isFinite(points) || points < 0) return null;
  if (!CC || typeof CC.clientTier !== "function" || typeof CC.clientTierVars !== "function") return null;
  const t = CC.clientTier(points), vars = CC.clientTierVars(points);
  return t && vars ? { tier: t.key, title: t.title, style: vars } : null;
}

// ── The list's groups (coach dashboard step 5a) ─────────────────────────────
// Status is a labelled heading, never a bare colour: Needs you, Watch and On track, in the engine's
// own order, and Progress unknown between Watch and On track, where the engine ranks it (a client
// nobody can read is not on track). A NEW client is in the group their week puts them in, with a
// New mark on the row, and the bar's "new" part lists all of them; a client whose progress couldn't
// be read or isn't shared yet is under Progress unknown, which says why. A severity this build does
// not know joins Progress unknown rather than leaving the list.
const DASH_ROSTER_GROUPS = [
  ["red", "Needs you", null],
  ["amber", "Watch", null],
  ["unknown", "Progress unknown", "Their progress couldn't be read, or they haven't shared enough of it yet."],
  ["green", "On track", null],
];
function dashRosterGroups(rows) {
  const known = new Set(DASH_ROSTER_GROUPS.map((g) => g[0]));
  const keyOf = (r) => (known.has(r.severity) ? r.severity : "unknown");
  return DASH_ROSTER_GROUPS
    .map(([key, label, note]) => ({ key, label, note, rows: rows.filter((r) => keyOf(r) === key) }))
    .filter((g) => g.rows.length > 0);
}

// ── Roster table — grouped, triage-ordered rows + role-configured columns ────
// `sort`/`sortDir`/`onSort` are optional and default to the triage order, so a caller
// that does not offer sorting gets exactly the table it had — and the headers render as
// plain text rather than as buttons that lead nowhere. A sort orders the rows WITHIN each
// group: the groups are the status, and status always reads first.
// `selectedId`/`onSelect` make the selection the host's (Clients' DashRosterPeek, which draws the
// panel); without them the table keeps its own and opens the slide-over itself, as it always did.
// `docked`: the panel is open beside the list, so the list keeps its compact columns
// (dashRosterColumns), the selected row lifts to meet the panel, and ↑ ↓ on a row move the
// selection through the list as it is drawn, groups included.
function DashRosterTable({ triage, role, filter, query, sort, sortDir, onSort, prefs, dismiss, selectedId, onSelect, docked = false, joint, sessions }) {
  const controlled = typeof onSelect === "function";
  const [ownId, setOwnId] = React.useState(null);
  const selId = controlled ? (selectedId == null ? null : selectedId) : ownId;
  const select = controlled ? onSelect : setOwnId;
  const open = !controlled ? triage.find((r) => r.client.profile.id === selId) || null : null;
  const listRef = React.useRef(null);
  const ink50 = DASH_ROSTER_INK50;

  // Client AGES (never birthdates) — a coach always sees them for their own
  // clients, which is the SERVER's rule (member_dobs_for_viewer answers on the
  // active-subscription link), not this table's. ONE request for the whole
  // table rather than one per row, and it lives HERE rather than in the two
  // role pages above so trainer and nutritionist cannot drift apart.
  //
  // ⚠ KEYED ON THE IDS, NOT THE ARRAY. `triage` is a fresh array identity on
  // every parent render, so depending on it directly would refetch forever.
  // The joined id string changes only when the roster actually changes.
  const idKey = triage.map((r) => r.client.profile.id).filter(Boolean).join(",");
  const [ages, setAges] = React.useState({});
  React.useEffect(() => {
    setAges({});                       // reset FIRST — never show one roster's ages over another
    const ids = idKey ? idKey.split(",") : [];
    if (!ids.length) return undefined;
    let on = true;
    // ⚠ CHUNKED AT THE ENDPOINT'S OWN CAP (500). The route REFUSES a longer ask
    // rather than truncating, so a roster past it would 400 and every client
    // would render age-less — reading as "they all keep it private". A failed
    // chunk costs only its own members; absence already covers every kind of no.
    const CHUNK = 500;
    const chunks = [];
    for (let i = 0; i < ids.length; i += CHUNK) chunks.push(ids.slice(i, i + CHUNK));
    Promise.all(chunks.map((c) =>
      fetch("/api/members/ages", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: c }),
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => (d && d.ages) || {})
        .catch(() => ({}))
    )).then((maps) => { if (on) setAges(Object.assign({}, ...maps)); });
    return () => { on = false; };
  }, [idKey]);
  const view = DASH_ROSTER_VIEWS[role] || DASH_ROSTER_VIEWS.nutritionist;

  const q = (query || "").trim().toLowerCase();
  const filtered = triage.filter((r) => dashRosterMatches(r, filter)).filter((r) => !q || r.client.profile.name.toLowerCase().includes(q));
  // Sorting is applied AFTER the filter and the search, so the three compose the way a
  // coach expects: narrow to who matters, then order what is left.
  const rows = dashRosterSorted(filtered, sort, sortDir, role);
  const groups = dashRosterGroups(rows);
  const activeSort = DASH_ROSTER_SORTS[sort] ? sort : "triage";
  const columns = dashRosterColumns(view, role, docked, activeSort);
  // Clicking the column you are already on flips the direction; a new column starts in
  // ITS OWN natural direction — revenue and tenure open highest-first, score and
  // adherence lowest-first, "last contact" stalest-first. A single default would make
  // half of them open on the end nobody wants.
  const clickSort = (k) => {
    if (!k || !onSort) return;
    if (k === activeSort) return onSort(k, sortDir === "desc" ? "asc" : "desc");
    onSort(k, DASH_ROSTER_SORTS[k].dir);
  };
  const headCell = (label, k) => {
    if (!k || !onSort) return <span key={label}>{label}</span>;
    const on = k === activeSort;
    return (
      <button key={label} onClick={() => clickSort(k)} title={"Sort by " + label.toLowerCase()}
        style={{ all: "unset", cursor: "pointer", display: "flex", alignItems: "center", gap: 4, minWidth: 0,
                 color: on ? "var(--sh-accent, #2ee0c4)" : "inherit", font: "inherit", letterSpacing: "inherit", minHeight: 24 }}>
        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</span>
        {/* The arrow marks the ACTIVE column only. A row of arrows on every header
            reads as decoration and stops saying which one is in force. */}
        <span aria-hidden="true" style={{ flex: "none", opacity: on ? 1 : 0 }}>{sortDir === "desc" ? "\u25be" : "\u25b4"}</span>
      </button>
    );
  };
  // ↑ ↓ from a row, docked: the next row as drawn (the DOM's order is the groups' order), focused and
  // opened. Only the row's own keys: an arrow in a control inside it is that control's.
  const step = (e, by) => {
    if (!docked || e.target !== e.currentTarget || !listRef.current) return;
    const all = Array.from(listRef.current.querySelectorAll("[data-roster-row]"));
    const at = all.indexOf(e.currentTarget);
    const next = at < 0 ? null : all[at + by];
    e.preventDefault();
    if (!next) return;
    const id = next.getAttribute("data-roster-row");
    const row = rows.find((r) => String(r.client.profile.id) === id);
    if (row) select(row.client.profile.id);
    next.focus();
  };

  return (
    <div className={"dash-roster-scroll" + (docked ? " is-docked" : "")} style={docked ? { overflow: "visible" } : undefined}>
    <div ref={listRef} style={{ minWidth: columns.minWidth }}>
      <div style={{ display: "grid", gridTemplateColumns: columns.cols, gap: 12, padding: "6px 4px 14px", fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: ink50, borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)" }}>
        {headCell("CLIENT", "name")}{columns.keep.map((j) => headCell(view.heads[j][0], view.heads[j][1]))}
      </div>
      {rows.length === 0 && (
        <div style={{ padding: "34px 4px", textAlign: "center", color: ink50, fontSize: 13.5 }}>
          {triage.length === 0 ? "No clients yet. Share your public profile to start getting subscribers." : "No clients match this search or filter."}
        </div>
      )}
      {groups.map((g) => (
        <div key={g.key} data-roster-group={g.key}>
          {/* The group's status, in words, on a rule of its colour: a heading, never a bare swatch. */}
          <div role="heading" aria-level={3} style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap", margin: "16px 0 4px", padding: "2px 0 2px 9px", borderLeft: "3px solid " + (DASH_SEV_COLORS[g.key] || DASH_SEV_COLORS.unknown) }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{g.label}</span>{" "}
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.08em", color: ink50 }}>{g.rows.length}</span>
            {g.note && <React.Fragment>{" "}<span style={{ fontSize: 11.5, color: ink50 }}>{g.note}</span></React.Fragment>}
          </div>
          {g.rows.map((r, i) => {
            const rec = r.client;
            const sevColor = r.severity === "green" ? (rec.profile.isNew ? DASH_SEV_COLORS.new : DASH_SEV_COLORS.green) : DASH_SEV_COLORS[r.severity] || DASH_SEV_COLORS.unknown;
            const tier = dashClientTierMark(rec.rankPoints);
            const cells = view.cells(rec, role);
            const picked = selId != null && rec.profile.id === selId;
            return (
              <div
                key={rec.profile.id || i}
                data-roster-row={String(rec.profile.id)}
                onClick={() => select(rec.profile.id)}
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") return step(e, 1);
                  if (e.key === "ArrowUp") return step(e, -1);
                  // Enter and Space are the row's own keys only (dashToday.jsx dashRowKeyOpen, #2628).
                  if (typeof dashRowKeyOpen === "function") return dashRowKeyOpen(e, true, () => select(rec.profile.id));
                  if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); select(rec.profile.id); }
                }}
                role="button"
                tabIndex={0}
                aria-current={picked ? "true" : undefined}
                aria-label={"Open " + rec.profile.name + " drilldown" + (tier ? ", " + tier.title : "")}
                data-track="Open client drilldown"
                style={{ display: "grid", gridTemplateColumns: columns.cols, gap: 12, padding: "14px 8px 14px 4px", alignItems: "center", cursor: "pointer", position: "relative",
                  borderTop: i === 0 || picked ? "1px solid transparent" : "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)",
                  // ⚠ HEIGHT MEANS PRIORITY: the list rests and the selected row lifts to the panel's
                  // own height (Lift 2), on the card's fill; nothing about its colour changes.
                  ...(picked ? { zIndex: 1, borderRadius: 10, background: "var(--sh-card, #25211d)", boxShadow: "var(--lift-2, 0 4px 14px rgba(0,0,0,0.14))" } : null) }}
              >
                {/* The pill WRAPS under the name rather than squeezing it: at the table's
                    minimum width the name column is ~130px, and a "STREAK BROKEN" pill beside
                    it cut "Marcus T." to "M…" (measured at 390px, 2026-10-15). */}
                <div style={{ display: "flex", gap: 10, rowGap: 4, flexWrap: "wrap", alignItems: "center", minWidth: 0 }}>
                  {/* ⚠ THE SQUARE BEFORE THE NAME IS THE CLIENT'S TIER, NOT THEIR STATUS (owner,
                      2026-11-06). Red, gold and green are tiers now, so the status is the group's
                      heading and the labelled pill after the name, never a colour alone; a row
                      with nothing flagged has no pill. An unknown tier is a hollow square that
                      claims nothing. The name keeps the row's ink: Peak and Legend would not read
                      as text on White. */}
                  {tier
                    ? <span className="sh-tier-mark" data-tier={tier.tier} role="img" aria-label={tier.title} title={tier.title} style={{ ...tier.style, width: 8, height: 8, flexShrink: 0, borderRadius: 2 }} />
                    : <span aria-hidden="true" data-tier-unknown="" style={{ width: 8, height: 8, flexShrink: 0, borderRadius: 2, boxShadow: "inset 0 0 0 1px var(--sh-line2, #413d38)" }} />}
                  <span title={tier ? tier.title : undefined} style={{ fontSize: 13.5, fontWeight: picked ? 600 : 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{rec.profile.name}</span>
                  {/* ⚠ typeof, not truthiness — 0 is a real age. Absence renders as
                      nothing, never as a placeholder or "private". */}
                  {typeof ages[rec.profile.id] === "number" && (
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: ink50, flexShrink: 0 }}>{ages[rec.profile.id]}</span>
                  )}
                  {/* The first flag that colours the row; the engine's quiet payment flag (P2) is the mark
                      below, said once. */}
                  {r.flags.some((f) => f.key !== "payment_retrying") && <DashPill c={sevColor}>{r.flags.find((f) => f.key !== "payment_retrying").label}</DashPill>}
                  {r.severity === "unknown" && <DashPill c={DASH_SEV_COLORS.unknown}>{(r.progress || DashSignals.progressStatus(rec)).label}</DashPill>}
                  {rec.profile.isNew && <DashPill c={DASH_SEV_COLORS.new}>New</DashPill>}
                  {dashPaymentRetrying(rec) && <DashPill c={DASH_SEV_COLORS.unknown}>Payment retrying</DashPill>}
                </div>
                {columns.keep.map((j) => <React.Fragment key={j}>{cells[j]}</React.Fragment>)}
              </div>
            );
          })}
        </div>
      ))}
      {open && <DashClientDrawer row={open} role={role} onClose={() => setOwnId(null)} prefs={prefs} dismiss={dismiss} joint={joint} sessions={sessions} />}
    </div>
    </div>
  );
}

// ── The peek beside the list (Clients, coach dashboard step 5a) ─────────────
// The review: "Every client is a page away". The selected client opens on the right of the list, on
// the same page, and ↑ ↓ move through everyone without leaving it. It docks only where two columns
// fit (DASH_PEEK_DOCK_QUERY); narrower, the same panel is the slide-over. `children` is the list,
// drawn as a function of the selection: ({ selectedId, select, docked }).
// ⚠ ESC FROM INSIDE THE DOCKED PANEL PUTS FOCUS BACK ON THE ROW it was showing, so a keyboard coach
// can carry on down the list; from the list itself focus stays where it is.
const DASH_PEEK_DOCK_QUERY = "(min-width: 1180px)";
function useDashMedia(query) {
  const read = () => {
    try { return typeof window !== "undefined" && typeof window.matchMedia === "function" && !!window.matchMedia(query).matches; }
    catch (e) { return false; }
  };
  const [on, setOn] = React.useState(read);
  React.useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
    let mq;
    try { mq = window.matchMedia(query); } catch (e) { return undefined; }
    const fn = () => setOn(!!mq.matches);
    fn();
    if (mq.addEventListener) mq.addEventListener("change", fn); else if (mq.addListener) mq.addListener(fn);
    return () => { if (mq.removeEventListener) mq.removeEventListener("change", fn); else if (mq.removeListener) mq.removeListener(fn); };
  }, [query]);
  return on;
}
function DashRosterPeek({ triage, role, prefs, dismiss, joint, sessions, children }) {
  const wide = useDashMedia(DASH_PEEK_DOCK_QUERY);
  const [selectedId, setSelectedId] = React.useState(null);
  const wrapRef = React.useRef(null);
  const backTo = React.useRef(null);
  const openRow = selectedId != null && Array.isArray(triage) ? triage.find((r) => r && r.client && r.client.profile && r.client.profile.id === selectedId) || null : null;
  const docked = wide && !!openRow;
  const close = () => {
    const active = typeof document !== "undefined" ? document.activeElement : null;
    const panel = wrapRef.current ? wrapRef.current.querySelector('[data-peek="docked"]') : null;
    if (docked && (!active || active === document.body || (panel && panel.contains(active)))) backTo.current = selectedId;
    setSelectedId(null);
  };
  React.useEffect(() => {
    if (selectedId != null || backTo.current == null || !wrapRef.current) return;
    const id = String(backTo.current);
    backTo.current = null;
    const el = Array.from(wrapRef.current.querySelectorAll("[data-roster-row]")).find((n) => n.getAttribute("data-roster-row") === id);
    if (el) el.focus();
  }, [selectedId]);
  const panel = openRow ? <DashClientDrawer row={openRow} role={role} onClose={close} prefs={prefs} dismiss={dismiss} joint={joint} sessions={sessions} docked={docked} /> : null;
  return (
    <div ref={wrapRef} className={"dash-peek" + (docked ? " is-docked" : "")} data-peek-layout={docked ? "docked" : "list"}
      style={{ display: "grid", gridTemplateColumns: docked ? "minmax(0, 1fr) minmax(340px, 400px)" : "minmax(0, 1fr)", gap: 16, alignItems: "start" }}>
      <div style={{ minWidth: 0 }}>{children({ selectedId: openRow ? selectedId : null, select: setSelectedId, docked })}</div>
      {docked ? panel : null}
      {!docked ? panel : null}
    </div>
  );
}

Object.assign(window, { DashRosterTable, DashRosterHealth, dashRosterHealth, DashRosterPeek, dashRosterGroups, dashRosterColumns, dashRosterMatches, dashPaymentRetrying, DashClientDrawer, DashConsultDrawer, DASH_DRAWER_VIEWS, dashDrawerSections, DASH_ROSTER_VIEWS, DASH_ROSTER_SORTS, DASH_ROSTER_SORT_KEYS, dashRosterSorted, dashPeekSessions, dashNextSessionFor, dashPeekFacts, dashPeekJoint });
