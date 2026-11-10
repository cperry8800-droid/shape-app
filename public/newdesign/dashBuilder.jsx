// Trainer Programs v2 — library + performance zones and the workout builder
// (dashboard-v2 spec step). Logic lives in dashBuilderCore.js (pure, tested);
// this file is UI. Templates persist to /api/coach/plans (detail.builder —
// the same store the mobile builder and marketplace share); assignment
// snapshots into client_workouts via /api/trainer/workout, which is what the
// client today-rail, calendar, and app already read. Signed out / API down:
// the demo templates render under the demo band, and drafts go to
// localStorage so the builder is fully usable in preview.
//
// Load order: pageShell → trainerDashboard → coachNav → dashSignals →
// dashData → dashToday → dashClient (DashWorkoutCard) → dashBuilderCore →
// dashFilterBar (the library's filters and shared pieces) → this file. The tier gems
// (DashClientGem) are dashToday's, read at render.

// ⚠ THE BUILDER IS THE CONCEPT BOARD'S LIGHT PAPER, NOT THE DASHBOARD'S DARK BROADSHEET.
// The round-one concepts kept the dark newspaper chrome and the tree-beside-editor layout
// and the owner said no to all of it; the board's own lede is "these three start from a
// white page, real controls, readable type, and dates you can see". So every value below is
// lifted from the approved artboards (`.ab2` in the G · Grid ⇄ Sheet board) rather than
// re-invented: 14px body text where this file used 8.5px mono, 40px controls, 9–10px radii,
// white cards on #f4f6f5.
// ⚠ THESE READ THE PAPER TOKENS NOW. The palette that was scoped to the builder became
// `dash.css`'s :root (light, the default) with the previous dark values one switch away
// (`html[data-paper="dark"]`), so the whole dashboard shares this vocabulary and the builder
// follows the switch like every other page. Each fallback is the DARK value, per the rule
// in dash.css — a page that never loads the stylesheet is a marketing page on dark paper.
const DBU_PG = "var(--sh-ground, #1a1612)", DBU_WH = "var(--sh-card, #25211d)";
const DBU_INK = "var(--sh-ink, #f2ede4)", DBU_INK2 = "var(--sh-ink2, #a09b94)", DBU_INK3 = "var(--sh-ink3, #75706a)";
const DBU_LINE = "var(--sh-line, #302c27)", DBU_LINE2 = "var(--sh-line2, #413d38)";
const DBU_TEAL = "var(--sh-accent, #2ee0c4)", DBU_TEALBG = "var(--sh-accent-tint, #182d26)";
const DBU_RUST = "var(--sh-rust2, #c0533b)", DBU_RUSTBG = "var(--sh-rust-tint, #321f19)";
const DBU_GOLD = "var(--sh-gold, #d8a23a)", DBU_GOLDBG = "var(--sh-gold-tint, #312717)";
const DBU_REST = "var(--sh-rest, #221e19)";
const DBU_INK50 = DBU_INK2;
const DBU_MONO = "'JetBrains Mono', monospace";
const DBU_DISPLAY = "'Anybody', system-ui, sans-serif";
const DBU_BODY = "'Schibsted Grotesk', system-ui, sans-serif";

// `.btn` / `.btn.pri` from the board.
function dbuBtn(primary, c) {
  const col = c || DBU_TEAL;
  const base = { display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 16px", borderRadius: 9, fontFamily: DBU_BODY, fontSize: 14, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", boxSizing: "border-box" };
  return primary
    ? { ...base, background: col, border: "1px solid " + col, color: "var(--sh-deep, #06231f)" }
    : { ...base, background: DBU_WH, border: "1px solid " + DBU_LINE2, color: DBU_INK };
}
// `.fld` and `.lbl`. Every box drawn with it also takes the class `dbu-field`, so dash.css can
// raise it to 16px on a coarse pointer: iOS Safari zooms the page on focus when a text box
// computes under 16px, and an inline 14px can't change by pointer.
const dbuField = { boxSizing: "border-box", display: "flex", alignItems: "center", height: 40, padding: "0 12px", borderRadius: 9, border: "1px solid " + DBU_LINE2, background: DBU_WH, fontFamily: DBU_BODY, fontSize: 14, color: DBU_INK, outline: "none" };
// ⚠ WHILE AN IME IS COMPOSING, ITS KEYSTROKES BELONG TO IT. The Enter that confirms a
// candidate and the Escape that cancels one are the IME's, not the control's. keyCode 229
// is Safari's form: WebKit ends the composition BEFORE the keydown for the Enter that
// confirms it, so `isComposing` already reads false there.
const dbuImeComposing = (e) => !!(e && (e.isComposing || e.keyCode === 229));
const dbuLabel = { fontFamily: DBU_BODY, fontSize: 12.5, color: DBU_INK2, fontWeight: 600, marginBottom: 5, display: "block" };

// ── The library page's controls ─────────────────────────────────────────────
// ⚠ THE LIBRARY LIST SITS ON THE PAGE GROUND, NOT ON THE BUILDER'S CARD. Before the paper
// switch it drew the builder's cream tokens on the DARK dashboard ground — measured at 1440,
// the card's kind line computed to 3.05:1 and every secondary action was a WHITE pill on a
// dark plate. Both grounds read the same tokens now (`dash.css`'s :root is the light paper,
// `html[data-paper="dark"]` brings the old values back), so the library takes the builder's
// own ink, line and rest and follows the switch with it: ink2 reads 5.44:1 on the light
// paper and 6.5:1 on the dark one, where a 0.55 ink alpha reads 3.9:1 on white. What
// survives from the dark-ground fix is the SIZE — a compact 36px control, a step quieter
// than the builder's 40px, still past the 24px WCAG 2.5.8 floor.
// Named once: the eyebrow/figure voice the whole dashboard already speaks.
const dbuLibMeta = { fontFamily: DBU_MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase" };
// The builder's own button, compact. The colours come from dbuBtn so the two cannot drift.
function dbuLibBtn(primary) {
  return { ...dbuBtn(primary), gap: 6, height: 36, padding: "0 13px", borderRadius: 8, fontSize: 13 };
}

// ── Tags ─────────────────────────────────────────────────────────────────────
// ⚠ THE HEADER USED TO SAY "STRENGTH" ON EVERY PROGRAM, because `newProgram` and the
// importer both stamp goalTag:'strength' and nothing let a coach change it. This is
// that control: Shape's five goals plus the coach's own words, written to `doc.tags`
// and saved with the program like any other edit. The library files programs under
// these, and its tag row offers every tag the coach has used anywhere.
function DbuTagPicker({ tags, customTags, onChange }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const wrap = React.useRef(null), toggleBtn = React.useRef(null), anchor = React.useRef(null), panel = React.useRef(null);
  const shift = useDfbPopShift(open, anchor, panel);
  const id = React.useId();
  const current = DashBuilder.normalizeTags(tags);
  const keyOf = (t) => DashBuilder.tagInfo(t).key;
  const has = (t) => current.some((x) => keyOf(x) === keyOf(t));
  const full = current.length >= DashBuilder.TAG_MAX;
  const write = (next) => onChange(DashBuilder.normalizeTags(next));
  const toggle = (t) => { if (has(t)) write(current.filter((x) => keyOf(x) !== keyOf(t))); else if (!full) write([...current, t]); };
  const typed = DashBuilder.normalizeTag(text);
  const add = () => { if (!typed) return; if (!has(typed) && !full) write([...current, typed]); if (has(typed) || !full) setText(""); };
  // Every tag of the coach's own: the ones on their other programs, and this one's.
  const own = [...new Map([...(customTags || []), ...current.filter((t) => !DashBuilder.tagInfo(t).builtin)].map((t) => [keyOf(t), t])).values()];
  React.useEffect(() => {
    if (!open) return undefined;
    const down = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false); };
    const key = (e) => { if (dbuImeComposing(e)) return; if (e.key === "Escape") { setOpen(false); if (toggleBtn.current) toggleBtn.current.focus(); } };
    document.addEventListener("mousedown", down);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [open]);
  // The same menu contract as DashFacetMenu: the button names the panel it opens, and
  // the keyboard lands on the first choice it can use rather than back at the page.
  React.useEffect(() => {
    if (!open || !panel.current) return;
    const first = panel.current.querySelector("input:not([aria-disabled='true']), button");
    if (first) first.focus();
  }, [open]);
  const row = (t) => {
    const info = DashBuilder.tagInfo(t), on = has(t), dead = !on && full;
    return (
      <label key={info.key} className={"dash-facet-opt" + (dead ? " is-zero" : "")}>
        <input type="checkbox" checked={on} aria-disabled={dead ? "true" : undefined} onChange={() => { if (!dead) toggle(t); }} />
        <span className="dash-facet-l">{info.label}</span>
      </label>
    );
  };
  return (
    <span ref={wrap} style={{ display: "inline-flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
      {current.map((t) => {
        const info = DashBuilder.tagInfo(t);
        return (
          <span key={info.key} className="dash-chip dash-chip--sm dash-chip--menu" style={{ "--c": info.c }}>
            <span className="dash-chip-main">{info.label}</span>
            <button type="button" className="dash-chip-x" aria-label={"Remove the " + info.label + " tag"} onClick={() => toggle(t)}>×</button>
          </span>
        );
      })}
      <span ref={anchor} className="dash-facet">
        <button ref={toggleBtn} type="button" className="dash-chip dash-chip--sm" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}>
          {current.length ? "＋ Tag" : "＋ Add a tag"}
        </button>
        {open && (
          <div ref={panel} id={id} className="dash-facet-pop" style={shift ? { left: -shift } : undefined} role="group" aria-label="Tags for this program">
            <div className="dash-facet-h">Shape’s goals</div>
            {DashBuilder.GOAL_TAGS.map((g) => row(g.key))}
            {!!own.length && <div className="dash-facet-h" style={{ marginTop: 10 }}>Your tags</div>}
            {own.map(row)}
            <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
              <input className="dash-tag-new" value={text} maxLength={DashBuilder.TAG_MAX_LEN} placeholder="New tag" aria-label="New tag"
                onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (dbuImeComposing(e.nativeEvent)) return; if (e.key === "Enter") { e.preventDefault(); add(); } }}
                style={{ ...dbuField, height: 36, flex: 1, minWidth: 0, fontSize: 13 }} />
              <button type="button" style={dbuLibBtn(false)} disabled={!typed || (full && !has(typed))} onClick={add}>Add</button>
            </div>
            {full && <p className="dash-facet-note">A program can carry {DashBuilder.TAG_MAX} tags — remove one to add another.</p>}
          </div>
        )}
      </span>
    </span>
  );
}

// ── Dates ────────────────────────────────────────────────────────────────────
// ⚠ F2 (P0): NOTHING IN THIS BUILDER EVER SHOWED A DATE. The client's page and the app
// are both dated, and the first date a coach saw was inside a collapsed <details> in the
// Assign modal — so a program was written blind and its shape on a real calendar was a
// surprise at assign time.
//
// ⚠ AND EVERY DATE DRAWN HERE COMES FROM THE FUNCTION THAT ASSIGNS THEM, never from a
// second copy of the rule. `DashBuilder.buildAssignmentRows` is what actually writes
// `scheduledDate` onto every row; deriving the sheet from any other arithmetic would let
// the preview and the assignment disagree, which is worse than showing no date at all.
const DBU_DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
// Same order and same indices as DBU_DOW — the day editor's Training-day select spells
// them out where the Grid's column heads abbreviate.
const DBU_DOW_FULL = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const DBU_MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dbuISO(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}
// The Assign modal's own next-Monday rule, lifted so the two cannot drift apart.
function dbuNextMonday() {
  const d = new Date();
  d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7));
  return dbuISO(d);
}
function dbuParseISO(iso) {
  const d = new Date(String(iso) + "T00:00:00");
  return Number.isFinite(d.getTime()) ? d : null;
}
// ⚠ THE REFERENCE START SNAPS TO ITS MONDAY, because the Grid draws Mon–Sun columns and
// `builderToAssignmentRows` offsets each day from the START's weekday, not from a Monday
// (`workoutDocument.js:98`). Measured on a Mon/Wed/Fri program with a WEDNESDAY start: each
// Grid row then spans TWO calendar weeks and its dates run BACKWARDS across it — Monday's
// cell reads 28 Sep beside Wednesday's 23 Sep — while the week header, which takes the
// earliest date in the row, contradicts its own first cell. The field's label already says
// "Reference start Monday" and the default is `dbuNextMonday()`; only the input accepted
// anything else. `previewStart` is read in exactly ONE place and reaches nothing at assign
// (each client's real start is chosen there), so snapping costs no scheduling accuracy.
// (CodeRabbit, #2143.) An unusable value yields null and the caller keeps what it had.
function dbuMondayOf(iso) {
  const d = dbuParseISO(iso);
  if (!d) return null;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return dbuISO(d);
}
function dbuShortDate(iso) {
  const d = dbuParseISO(iso);
  return d ? DBU_DOW[(d.getDay() + 6) % 7] + " " + d.getDate() + " " + DBU_MON[d.getMonth()] : "";
}
function dbuDayMonth(iso) {
  const d = dbuParseISO(iso);
  return d ? d.getDate() + " " + DBU_MON[d.getMonth()] : "";
}

// ── Weekday defaults ─────────────────────────────────────────────────────────
// ⚠ F3 (P0): `newDay` carried NO weekday, and `builderToAssignmentRows` falls back to the
// day's INDEX when one is missing (workoutDocument.js:98) — so a two-session week landed
// on Mon and TUE with five empty days after it, and nothing on screen said so. The table
// is the brief's: 1 → Mon · 2 → Mon Thu · 3 → Mon Wed Fri · 4 → Mon Tue Thu Fri ·
// 5 → Mon–Fri · 6 → Mon–Sat · 7 → every day.
// ⚠ PAST SEVEN DAYS A WEEK THE COLLISION IS ARITHMETIC — a week has seven weekdays — so
// the extras cycle and the sheet DRAWS two bands on one date. That is the improvement:
// today the identical collision happens silently at assign time (F12).
const DBU_WEEKDAYS = { 1: [0], 2: [0, 3], 3: [0, 2, 4], 4: [0, 1, 3, 4], 5: [0, 1, 2, 3, 4], 6: [0, 1, 2, 3, 4, 5], 7: [0, 1, 2, 3, 4, 5, 6] };
function dbuDefaultWeekdays(n) {
  if (DBU_WEEKDAYS[n]) return DBU_WEEKDAYS[n].slice();
  return Array.from({ length: Math.max(0, n) }, (_, i) => i % 7);
}
const dbuHasWeekday = (d) => !!d && Number.isInteger(d.weekday) && d.weekday >= 0 && d.weekday <= 6;
// A week is SOUND when every day has a weekday and no two share one — the property the
// Grid needs, since it resolves a cell by weekday and can render only the first match.
const dbuWeekSound = (w) => {
  const seen = new Set();
  for (const d of (w && w.days) || []) {
    if (!dbuHasWeekday(d)) return false;
    if (seen.has(d.weekday)) return false;
    seen.add(d.weekday);
  }
  return true;
};
// Give a legacy document weekdays ON LOAD, per week, in order, leaving any the coach has
// already set alone.
// ⚠ APPLIED IN THE BUILDER RATHER THAN IN THE SHARED NORMALISER (`workoutDocument.js`),
// which the API route also runs: rewriting stored documents server-side is a far larger
// blast radius than one PR should take, and doing it here is where the coach can SEE the
// result before assigning. A document assigned straight from the library without ever
// being opened keeps today's behaviour — a no-op, not a regression — and the fallback
// branch of `builderToAssignmentRows` stays as the guard it was written to be.
function dbuWithWeekdays(doc) {
  if (!doc || !Array.isArray(doc.weeks)) return doc;
  if (doc.weeks.every(dbuWeekSound)) return doc;
  return {
    ...doc,
    weeks: doc.weeks.map((w) => {
      const days = w.days || [];
      if (dbuWeekSound(w)) return w;
      // ⚠ A DUPLICATE IS REPAIRED, NOT ONLY A MISSING WEEKDAY. Before #2143 the day editor's
      // Training-day select wrote a weekday with no collision check, so a STORED document can
      // hold two days on one weekday — and each value is individually valid, which is why the
      // old `every(dbuHasWeekday)` test passed it straight through. The Grid then rendered
      // only the first and the second was unreachable. (CodeRabbit, #2143.)
      // The FIRST day holding a weekday keeps it: that is the one the Grid is already drawing,
      // so the repair brings the HIDDEN session back rather than moving the visible one out
      // from under the coach.
      // ⚠ PAST SEVEN DAYS A WEEK THE SURPLUS STILL CYCLES, deliberately — uniqueness is
      // arithmetically impossible there and this file already states that position above
      // `DBU_WEEKDAYS`. This repair does not quietly reverse it.
      const keep = new Set();
      const holds = days.map((d) => {
        if (!dbuHasWeekday(d) || keep.has(d.weekday)) return false;
        keep.add(d.weekday);
        return true;
      });
      const free = dbuDefaultWeekdays(days.length).filter((x) => !keep.has(x));
      let k = 0;
      return {
        ...w,
        days: days.map((d, i) => {
          if (holds[i]) return d;
          const wd = free[k] != null ? free[k] : k % 7;
          k += 1;
          return { ...d, weekday: wd };
        }),
      };
    }),
  };
}
// The next weekday a new day in this week should take: the first the week is not using.
function dbuNextFreeWeekday(week) {
  const taken = new Set((week.days || []).filter(dbuHasWeekday).map((d) => d.weekday));
  const table = dbuDefaultWeekdays((week.days || []).length + 1);
  const free = table.find((x) => !taken.has(x));
  if (free != null) return free;
  for (let i = 0; i < 7; i += 1) if (!taken.has(i)) return i;
  return 0;
}

// ⚠ ASSIGNING A WEEKDAY IS A SWAP, NOT AN OVERWRITE, AND THIS IS ITS ONLY IMPLEMENTATION.
// The Grid finds a day BY WEEKDAY (`findIndex(d => d.weekday === wd)`), so two days in one
// week sharing a weekday leaves the second UNREACHABLE: it cannot be rendered, selected or
// edited, while the document still holds it and Sheet still lists it. Exchanging the two
// days' values keeps the week a permutation, so that state is unrepresentable rather than
// merely avoided at each call site.
// ⚠ BOTH WRITERS ROUTE THROUGH HERE, and the second is why this is a module helper rather
// than a closure: the plan's drag lives in `DbuPlan` and the day editor's Training-day
// select lives in `DbuBuilder`, so a shared rule cannot be a local function of either. The
// select wrote through a blind positional replace until #2143 — picking a weekday another
// day already held produced exactly the collision the drag had just been fixed to prevent,
// through the ORDINARY control rather than a deliberate drop onto an occupied cell.
// ⚠ ITS PERMUTATION PROPERTY ASSUMES A SOUND WEEK, and `dbuWithWeekdays` is what guarantees
// one: on a week that ALREADY holds a duplicate, exchanging two values preserves the multiset
// and therefore preserves the duplicate — `[0, 0, 2]` assigned to weekday 2 gives `[2, 0, 0]`,
// one session still hidden. (CodeRabbit, #2143.) The repair belongs at load rather than here
// because only the loader can make the hidden session REAPPEAR; a single assignment cannot.
// A source with no weekday ("In sequence from start") is legitimate here and is NOT refused:
// the displaced day takes its absent weekday, which is still a permutation and still leaves
// no two days sharing one. Passing `undefined` therefore clears a day's weekday and, because
// no day can equal it, disturbs nothing else — so clearing needs no separate path.
// Which OTHER day in this week holds each weekday, for the select's option labels. Read
// per render rather than memoised: it is at most seven entries, and a hook here would sit
// below `week`/`day` in `DbuBuilder` where a later early return could change the hook order.
function dbuTakenByWeekday(week, di) {
  const out = {};
  ((week && week.days) || []).forEach((d, j) => {
    if (j !== di && dbuHasWeekday(d)) out[d.weekday] = d.name || ("Day " + (j + 1));
  });
  return out;
}
function dbuAssignWeekday(week, di, weekday) {
  const days = (week && week.days) || [];
  const from = days[di];
  if (!from) return week;
  return {
    ...week,
    days: days.map((d, j) => {
      if (j === di) return { ...d, weekday };
      if (dbuHasWeekday(d) && d.weekday === weekday) return { ...d, weekday: from.weekday };
      return d;
    }),
  };
}

// Every date the assignment would write, keyed "week:day" — one call, one source of truth.
// ⚠ A meta object is passed rather than null because `builderToAssignmentRows` only stamps
// `template.week` / `template.day` when it HAS one; with null the rows come back unlabelled
// and nothing could be keyed to a band.
function dbuDateMap(doc, startISO) {
  const out = {};
  try {
    DashBuilder.buildAssignmentRows(doc, { id: null, name: "" }, startISO).forEach((r) => {
      const t = r.payload && r.payload.template;
      if (t && t.week && t.day) out[(t.week - 1) + ":" + (t.day - 1)] = r.scheduledDate;
    });
  } catch (e) { /* an unusable start date or an empty document simply yields no dates */ }
  return out;
}
// A summary a coach can check at a glance, derived rather than typed.
function dbuSummary(doc, dates) {
  const weekdays = new Set();
  let sessions = 0;
  (doc.weeks || []).forEach((w) => (w.days || []).forEach((d) => {
    sessions += 1;
    if (dbuHasWeekday(d)) weekdays.add(d.weekday);
  }));
  const all = Object.values(dates).filter(Boolean).sort();
  return {
    weeks: (doc.weeks || []).length,
    sessions,
    weekdays: [...weekdays].sort((a, b) => a - b),
    last: all[all.length - 1] || "",
  };
}

// ── A day, deleted or copied to other weeks ─────────────────────────────────
// Step 3 of the builder plan (owner, 2026-10-07): "Delete a day; copy it to other weeks".
// Duplicate already copied a day within its week; neither of these existed.
const dbuMoves = (day) => ((day && day.blocks) || []).reduce((n, b) => n + ((b.rows || []).length), 0);
// One week's day goes: the Grid cell the panel's heading names. The other weeks keep
// theirs, and the confirm says so before anything is removed.
function dbuDeleteDay(doc, wi, di) {
  const w = doc.weeks[wi];
  if (!w || !w.days[di]) return doc;
  return { ...doc, weeks: doc.weeks.map((x, i) => (i === wi ? { ...x, days: x.days.filter((_, j) => j !== di) } : x)) };
}
// Where a copy of week `wi`'s day `di` lands in week `ti`: the slot of its own weekday.
// ⚠ A DAY ALREADY IN THAT SLOT IS REPLACED, AND NEVER WITHOUT BEING NAMED FIRST: the week
// list says "replaces Upper A, 5 moves" beside that week, and the button counts the days it
// will replace, before the coach confirms. Asking per collision was the other choice;
// replacing is what "copy Lower A to weeks 2–8" means, and the commonest collision is the
// empty "Day 1" that ＋ Week puts on every new week's Monday.
function dbuCopySlot(doc, wi, di, ti) {
  const src = doc.weeks[wi] && doc.weeks[wi].days[di];
  const target = doc.weeks[ti];
  if (!src || !target || ti === wi) return null;
  const at = dbuHasWeekday(src) ? target.days.findIndex((d) => dbuHasWeekday(d) && d.weekday === src.weekday) : -1;
  return { at, replaces: at >= 0 ? target.days[at] : null };
}
// A copy is a day of its own: new ids for it and every move, so nothing that finds a day
// or a move by id (the assignment's `dayId`, the editor's selection) mistakes it for its
// source. Its sets are the full week's (a copy out of a deload week is not cut again in a
// training week), and a load typed by hand for the source's week is not one for the
// target's, so the copy follows the program's progression there.
function dbuCopiedDay(day, deload) {
  const fresh = JSON.parse(JSON.stringify(day));
  fresh.id = crypto.randomUUID();
  (fresh.blocks || []).forEach((b) => { b.rows = (b.rows || []).map((r) => ({ ...ShapeWorkoutDocument.unpinned(r), id: crypto.randomUUID() })); });
  const whole = ShapeWorkoutDocument.undeloadWeek({ deload: true, days: [fresh] }).days[0];
  return deload ? ShapeWorkoutDocument.deloadWeek({ deload: false, days: [whole] }).days[0] : whole;
}
function dbuCopyDayToWeeks(doc, wi, di, targets) {
  const src = doc.weeks[wi] && doc.weeks[wi].days[di];
  if (!src) return doc;
  const want = new Set((targets || []).filter((t) => t !== wi && doc.weeks[t]));
  if (!want.size) return doc;
  return { ...doc, weeks: doc.weeks.map((w, ti) => {
    if (!want.has(ti)) return w;
    const copy = dbuCopiedDay(src, !!w.deload);
    const slot = dbuCopySlot(doc, wi, di, ti);
    if (slot && slot.at >= 0) return { ...w, days: w.days.map((d, j) => (j === slot.at ? copy : d)) };
    // A source with no weekday ("In sequence from start") has no slot to aim at, so the
    // copy takes the week's next free weekday, as Duplicate does.
    if (!dbuHasWeekday(copy)) copy.weekday = dbuNextFreeWeekday(w);
    // In weekday order, so the Sheet reads Mon → Sun as the Grid does.
    const after = w.days.findIndex((d) => dbuHasWeekday(d) && d.weekday > copy.weekday);
    return { ...w, days: after < 0 ? [...w.days, copy] : [...w.days.slice(0, after), copy, ...w.days.slice(after)] };
  }) };
}
// "week 2", "weeks 2 and 3", "weeks 2–8", "weeks 2, 3 and 5": runs of three or more read
// as a range.
function dbuWeekList(nums) {
  const list = [...new Set(nums)].sort((a, b) => a - b);
  if (!list.length) return "";
  const parts = [];
  for (let i = 0; i < list.length;) {
    let j = i;
    while (j + 1 < list.length && list[j + 1] === list[j] + 1) j += 1;
    if (j - i >= 2) parts.push(list[i] + "–" + list[j]);
    else for (let k = i; k <= j; k += 1) parts.push(String(list[k]));
    i = j + 1;
  }
  const words = parts.length > 1 ? parts.slice(0, -1).join(", ") + " and " + parts[parts.length - 1] : parts[0];
  return (list.length === 1 ? "week " : "weeks ") + words;
}

// ── The program's progression, as the bar and the marks show it ─────────────
// The rule and its arithmetic live in the document module (`ShapeWorkoutDocument`:
// `normalizeProgression`, `applyProgramProgression`, `progressionStatus`), because they
// write the loads every reader of the document receives. What is here is how a coach sees
// it. U+FE0E keeps the arrow and the pencil as type, not iOS's colour emoji.
const DBU_PROGRESS_MARK = {
  source: ["↗︎", "Goes up each week with the program’s progression"],
  follows: ["↗︎", "This week’s load is set by the program’s progression"],
  pinned: ["✎︎", "This week’s load was typed by hand"],
};
// The same marks for a move's RPE, when the rule climbs RPE too.
const DBU_RPE_MARK = {
  source: ["↗︎", "Its RPE goes up each week with the program’s progression"],
  follows: ["↗︎", "This week’s RPE is set by the program’s progression"],
  pinned: ["✎︎", "This week’s RPE was picked by hand"],
};
// A line's marks for the progression: the load's, and the RPE's beside it. ⚠ ONE ARROW,
// NOT TWO: when the rule moves both, the load's arrow already says the move climbs, so the
// RPE adds a mark only where it says something the load's does not (its own pin, or a
// climb on a move whose load the rule leaves alone).
function dbuProgressMarks(load, rpe) {
  const out = [];
  if (load) out.push(DBU_PROGRESS_MARK[load]);
  if (rpe === "pinned" || (rpe && !load)) out.push(DBU_RPE_MARK[rpe]);
  return out;
}
const dbuUnitLabel = (unit) => (unit === "pct" ? "% 1RM" : unit === "lb" ? "lb" : "kg");
const dbuAmountLabel = (rule) => rule.amount + (rule.unit === "pct" ? "% 1RM" : " " + dbuUnitLabel(rule.unit));
const DBU_PROGRESS_KINDS = [
  { kinds: ["main"], label: "main lifts" },
  { kinds: ["main", "accessory"], label: "main and accessory lifts" },
  { kinds: ["warmup", "main", "accessory", "finisher"], label: "every block" },
];
const DBU_DELOAD_EVERY = [0, 3, 4, 5, 6];
// The RPE climb's choices: as typed (no climb), or up half a point or a point a week, to a
// cap on the editors' own half-point scale. A stored value off these lists is offered too,
// so the select never shows a choice the rule does not hold.
const DBU_RPE_STEPS_A_WEEK = [0.5, 1];
const DBU_RPE_CAPS = [6, 6.5, 7, 7.5, 8, 8.5, 9, 9.5, 10];
const DBU_RPE_CAP_DEFAULT = 9;
const dbuWithStored = (list, v) => (v == null || list.includes(v) ? list : [...list, v].sort((a, b) => a - b));
const dbuOrdinal = (n) => n + ((n % 100 >= 11 && n % 100 <= 13) ? "th" : ({ 1: "st", 2: "nd", 3: "rd" }[n % 10] || "th"));
const dbuDeloadLabel = (n) => (n ? "Deload every " + dbuOrdinal(n) + " week" : "No deload week");
// The rule a coach starts from: the unit most of week 1's main lifts are typed in (so the
// bar moves what they already wrote), 5 lb or 2.5 kg / % a week, and no deload yet.
function dbuDefaultRule(doc) {
  const count = { kg: 0, lb: 0, pct: 0 };
  (((doc.weeks || [])[0] || {}).days || []).forEach((d) => (d.blocks || []).forEach((b) => {
    if (b.kind !== "main") return;
    (b.rows || []).forEach((r) => { if (count[r.loadType] != null && r.loadText == null && Number(r.load) > 0) count[r.loadType] += 1; });
  }));
  const unit = ["lb", "kg", "pct"].reduce((best, u) => (count[u] > count[best] ? u : best), "kg");
  return { amount: unit === "lb" ? 5 : 2.5, unit, kinds: ["main"], deloadEvery: 0 };
}
// What the bar reports: how many moves climb, one of them as an example, the deload weeks,
// the loads typed by hand, and the moves left alone because they are in another unit.
function dbuProgressionReport(doc) {
  const W = ShapeWorkoutDocument;
  const rule = W.normalizeProgression(doc.progression);
  const weeks = doc.weeks || [];
  const out = { rule, moves: 0, otherUnit: 0, pinned: 0, deloads: [], example: null, rpeMoves: 0, rpePinned: 0 };
  if (!rule) return out;
  const same = (a, b) => String((a && a.name) || "").trim().toLowerCase() === String((b && b.name) || "").trim().toLowerCase();
  ((weeks[0] || {}).days || []).forEach((day, di) => (day.blocks || []).forEach((b, bi) => (b.rows || []).forEach((r, ri) => {
    if (W.rpeProgressionStatus(doc, 0, di, bi, ri) === "source") out.rpeMoves += 1;
    if (W.progressionStatus(doc, 0, di, bi, ri) === "source") {
      out.moves += 1;
      for (let wi = weeks.length - 1; wi > 0 && !out.example; wi -= 1) {
        (weeks[wi].days || []).forEach((td, tdi) => (td.blocks || []).forEach((tb, tbi) => (tb.rows || []).forEach((tr, tri) => {
          if (!out.example && same(tr, r) && W.progressionStatus(doc, wi, tdi, tbi, tri) === "follows") {
            out.example = { name: String(r.name).trim(), to: Number(tr.load), week: wi + 1 };
          }
        })));
      }
    } else if (rule.kinds.includes(b.kind) && r.loadText == null && Number(r.load) > 0 && r.loadType !== rule.unit) out.otherUnit += 1;
  })));
  weeks.forEach((w, wi) => {
    if (w.deload) out.deloads.push(wi + 1);
    if (wi) (w.days || []).forEach((day, di) => (day.blocks || []).forEach((b, bi) => (b.rows || []).forEach((_, ri) => {
      if (W.progressionStatus(doc, wi, di, bi, ri) === "pinned") out.pinned += 1;
      if (W.rpeProgressionStatus(doc, wi, di, bi, ri) === "pinned") out.rpePinned += 1;
    })));
  });
  return out;
}

// ── Template persistence (live API ⇄ localStorage drafts) ───────────────────
const dbuDraftKey = ownerId => "shape.dashBuilderDrafts.v2." + (ownerId || "demo");
function dbuReadDrafts(ownerId) {
  try { return JSON.parse(localStorage.getItem(dbuDraftKey(ownerId)) || "{}"); } catch (e) { return {}; }
}
function dbuWriteDraft(ownerId, id, value) {
  try { const all = dbuReadDrafts(ownerId); if (value) all[id] = value; else delete all[id]; localStorage.setItem(dbuDraftKey(ownerId), JSON.stringify(all)); return true; } catch (e) { return false; }
}
function dbuRecoveredTemplate(id, draft, templates) {
  const saved = (templates || []).find(t => t.id === id) || {};
  return { ...saved, draftId:id, id:draft.persisted ? id : undefined, name:draft.name,
    published:draft.published ?? saved.published ?? false,
    detail:{...(saved.detail || {}),...(draft.detail || {}),builder:draft.doc,revision:draft.revision || 0}, recovered:draft };
}
// A program's cover photo (owner, 2026-11-09, of the program cards on the Climb: "use programs own photo"):
// a JPEG, PNG or WebP under 10 MB, into the coach's own folder of coach-media, which takes images
// (2026-06-09-coach-media.sql). The builder had a place for an introduction video only.
const DBU_COVER_TYPES = { jpg:"image/jpeg", jpeg:"image/jpeg", png:"image/png", webp:"image/webp" };
const DBU_COVER_MAX = 10 * 1024 * 1024;
function dbuCoverCheck(file) {
  if (!file || !file.size) throw new Error("Choose a photo that is not empty.");
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  const type = Object.prototype.hasOwnProperty.call(DBU_COVER_TYPES, ext) ? DBU_COVER_TYPES[ext] : null;
  if (!type || (file.type && file.type.toLowerCase() !== type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
  if (file.size > DBU_COVER_MAX) throw new Error("Keep the photo under 10 MB.");
  return { ext: ext === "jpeg" ? "jpg" : ext, contentType: type };
}
async function dbuUploadCover(file) {
  const {ext, contentType} = dbuCoverCheck(file);
  const client = window.shapeDb && window.shapeDb.client;
  if (!client) throw new Error("Sign in to add a cover photo.");
  const {data, error:authError} = await client.auth.getUser();
  if (authError || !data?.user) throw new Error("Sign in to add a cover photo.");
  const path = data.user.id + "/program/" + crypto.randomUUID() + "." + ext;
  const {error} = await client.storage.from("coach-media").upload(path,file,{upsert:false,contentType});
  if (error) throw error;
  const {data:media} = client.storage.from("coach-media").getPublicUrl(path);
  if (!media?.publicUrl) throw new Error("Upload did not return a link. Retry.");
  return media.publicUrl;
}
// ⚠ THE COVER RIDES IN detail.media, NOT ONLY IN THE BUILDER. The public read of a coach's programs
// (get_coach_sale_plans, 2026-10-29-program-preview-names.sql) drops `builder` and keeps a program's images
// from detail.media, in order; the profile's card shows the first. So the cover is written there as the first
// image, marked `cover`, and a removed cover leaves the coach's other media as they were.
function dbuMediaWithCover(media, cover) {
  const rest = (Array.isArray(media) ? media : []).filter((m) => !(m && typeof m === "object" && m.cover === true));
  const url = typeof cover === "string" && /^https:\/\//i.test(cover.trim()) ? cover.trim() : "";
  return url ? [{ type: "image", url, name: "Cover", cover: true }, ...rest] : rest;
}
function DbuCover({ value, onChange, onBusy }) {
  const input = React.useRef(null), alive = React.useRef(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState("");
  React.useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const pick = async (file) => {
    if (!file || busy) return;
    setError(""); setBusy(true); onBusy(1);
    try { const url = await dbuUploadCover(file); if (alive.current) onChange(url); }
    catch (e) { if (alive.current) setError((e && e.message) || "Upload failed. Try again."); }
    finally { if (alive.current) setBusy(false); onBusy(-1); }
  };
  const has = typeof value === "string" && /^https:\/\//i.test(value);
  return <div className="cb-cover" data-dbu-cover="">
    <p><strong>Cover photo · Optional.</strong> The picture on this program's card on your profile.</p>
    <input ref={input} type="file" accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp" hidden onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; pick(f); }} />
    <div className="drow">
      {has ? <img data-dbu-cover-img="" src={value} alt="" style={{ width: 120, height: 68, objectFit: "cover", borderRadius: 6 }} /> : null}
      <button type="button" className="dbtn" disabled={busy} onClick={() => input.current && input.current.click()}>{busy ? "Uploading…" : has ? "Replace photo" : "Add a cover photo"}</button>
      {has ? <button type="button" className="dbtn" disabled={busy} onClick={() => onChange("")}>Remove photo</button> : null}
    </div>
    {busy ? <progress aria-label="Uploading the cover photo" style={{ width: "100%", marginTop: 8 }} /> : null}
    {error ? <p role="alert" style={{ fontSize: 13, color: "var(--sh-rust, #e0644b)" }}>{error}</p> : null}
  </div>;
}
async function dbuUploadVideo(file) {
  const client = window.shapeDb && window.shapeDb.client;
  if (!client) throw new Error("Sign in to upload a demonstration.");
  const {data, error:authError} = await client.auth.getUser();
  if (authError || !data?.user) throw new Error("Sign in to upload a demonstration.");
  const {ext, contentType} = ShapeVideo.validateFile(file);
  const path = data.user.id + "/exercise/" + crypto.randomUUID() + "." + ext;
  const {error} = await client.storage.from("coach-media").upload(path,file,{upsert:false,contentType});
  if (error) throw error;
  const {data:media} = client.storage.from("coach-media").getPublicUrl(path);
  if (!media?.publicUrl) throw new Error("Upload did not return a playable link. Retry.");
  return media.publicUrl;
}

// The RPE scale, 1–10 in half points. ⚠ IT RUNS FROM 1, NOT 5: a lifting block
// lives at 7–9, but the same field carries an easy run at RPE 3 — the 5k demo
// template has exactly that — and a scale that started at 5 could not express it.
const DBU_RPE_STEPS = Array.from({ length: 19 }, (_, i) => Math.round((1 + i * 0.5) * 10) / 10);
// ⚠ A STORED VALUE OFF THE LIST IS SHOWN, NOT HIDDEN. A legacy "RPE 8.3" reaches the
// row through `splitLegacyRpe`; a select whose value matches no option DISPLAYS its
// first option — "None" — while the card still prints RPE 8.3, so the coach could
// neither see what is stored nor tell that it is there. The stored reading joins
// the list; anything off the 1–10 scale is not a reading and stays out.
function dbuRpeOptions(current) {
  const n = Number(current);
  const stored = current !== '' && current != null && Number.isFinite(n) && n > 0 && n <= 10 && !DBU_RPE_STEPS.includes(n);
  return stored ? [...DBU_RPE_STEPS, n].sort((a, b) => a - b) : DBU_RPE_STEPS;
}

// ── One drag rule ───────────────────────────────────────────────────────────
// ⚠ THE CAPTURE DANCE IS WRITTEN ONCE: a row dragged by its handle uses it. (The floating
// client preview used it too until step 6c made Client view a tab on the sheet.) A capture can
// throw (the pointer already gone, an element detached mid-gesture) and a throw there must not
// end the gesture it was only protecting.
function dbuCapture(e) { try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {} }
function dbuRelease(e, id) { try { e.currentTarget.releasePointerCapture(id); } catch (err) {} }

// ── The library, open beside the day ────────────────────────────────────────
// ⚠ IT REPLACES THE 12-RESULT POP-UP (the owner's coach review, step 6c: "The library stays
// open: Search, Legs / Upper / Core, an equipment filter, a ✓ on moves already in, and drag or
// ＋ Main"). The pop-up showed the first 12 of 75 moves with no filters and closed on every
// pick; this lists every move the filters leave, stays on screen, and adds one move per press
// to the block being built (its ＋ names it). Each move can also be dragged into the list at the
// line it is dropped on. The coach's own moves come first, and a name nothing matches can be
// added as a new move, as the pop-up allowed.
const DBU_REGIONS = [
  { key: "", label: "All" },
  { key: "lower", label: "Legs" },
  { key: "upper", label: "Upper" },
  { key: "core", label: "Core" },
];
// The move a library drag carries, read by the list's drop. One drag at a time, so one slot.
const dbuLibDrag = { current: null };
const dbuNameKey = (n) => String(n || "").trim().toLowerCase();
function DbuLibrary({ customMoves = [], inDay, target = "Main", onAdd, searchRef }) {
  const [q, setQ] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [equipment, setEquipment] = React.useState("");
  const term = q.trim();
  const found = DashBuilder.libraryMoves(customMoves, term, region, equipment);
  const canCreate = DashBuilder.canCreateMove(term, customMoves);
  const kit = DashBuilder.libraryEquipment();
  const has = (ex) => !!inDay && inDay.has(dbuNameKey(ex.name));
  const create = () => { if (!canCreate) return; onAdd({ id: "new-" + term.toLowerCase(), name: term, muscle: "", equipment: "", own: true }); setQ(""); };
  const total = found.mine.length + found.shape.length;
  const row = (ex) => (
    <li key={ex.id} className="lib-row" draggable
      onDragStart={(e) => { dbuLibDrag.current = ex; try { e.dataTransfer.setData("text/plain", ex.name); e.dataTransfer.effectAllowed = "copy"; } catch (err) {} }}
      onDragEnd={() => { dbuLibDrag.current = null; }}>
      <span className="lib-nm">
        <b>{ex.name}</b>
        <small>{[ex.muscle, ex.equipment].filter(Boolean).join(" · ") || (ex.own ? "Your own move" : "")}</small>
      </span>
      {has(ex) && <span className="lib-in" title="Already in this session"><span aria-hidden="true">✓</span><span className="sr">Already in this session</span></span>}
      <button type="button" className="lib-add" aria-label={"Add " + ex.name + " to " + target} onClick={() => onAdd(ex)}>＋ {target}</button>
    </li>
  );
  return (
    <aside className="dlib" aria-label="Exercise library">
      <div className="lib-h">Library <small>{total} {total === 1 ? "move" : "moves"}</small></div>
      <input ref={searchRef} className="lib-q" aria-label="Search exercises" placeholder="Search moves, muscles, equipment…" value={q}
        onChange={(e) => setQ(e.target.value)}
        onKeyDown={(e) => {
          // ⚠ WHILE AN IME IS COMPOSING, ITS ENTER AND ESCAPE ARE ITS OWN (dbuImeComposing): the
          // Enter that confirms a candidate would otherwise add a half-composed move.
          if (dbuImeComposing(e.nativeEvent)) return;
          if (e.key === "Enter" && canCreate) { e.preventDefault(); create(); }
          else if (e.key === "Escape" && q) { e.preventDefault(); e.stopPropagation(); setQ(""); }
        }} />
      <div className="lib-f">
        <div className="lib-seg" role="group" aria-label="Body region">
          {DBU_REGIONS.map((r) => <button key={r.key || "all"} type="button" aria-pressed={region === r.key} onClick={() => setRegion(r.key)}>{r.label}</button>)}
        </div>
        <select aria-label="Equipment" value={equipment} onChange={(e) => setEquipment(e.target.value)}>
          <option value="">Any equipment</option>
          {kit.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
        </select>
      </div>
      {canCreate && <button type="button" className="lib-new" onClick={create}><span aria-hidden="true">＋</span> Add “{term}” as a new exercise</button>}
      <ul className="lib-list dash-thin-scroll" aria-label="Moves">
        {!!found.mine.length && <li role="presentation" className="lib-g">Your moves</li>}
        {found.mine.map(row)}
        {!!found.shape.length && <li role="presentation" className="lib-g">Shape library</li>}
        {found.shape.map(row)}
        {!total && <li role="presentation" className="lib-none">{term || region || equipment ? "Nothing in the library matches that." : "The library is empty."}</li>}
      </ul>
      <p className="lib-hint">Drag a move into the list, or press ＋ to add it to {target}.</p>
    </aside>
  );
}

// ── Exercise row editor ──────────────────────────────────────────────────────
// ⚠ PER-SET REPS AND WEIGHT: THE FULL LADDER. Owner: "i also should be able to
// customize as a coach the numbers of reps for each set and weight if I want to";
// the pick was a full ladder (Back squat 3 × 8/6/4 · 60/70/80 kg). A blank field
// INHERITS the row, and its placeholder shows what it inherits, so filling in only
// the sets that differ is the whole job. The unit is the row's and so is the RPE.
// Reps are stored as typed and trimmed when the document is saved, never per
// keystroke, so a space the coach is in the middle of typing is not eaten.
function DbuLadder({ row, onChange }) {
  const doc = ShapeWorkoutDocument;
  const count = Number(row.sets);
  const n = Number.isInteger(count) && count > 0 ? Math.min(count, doc.LADDER_MAX) : 0;
  const ladder = doc.ladder(row);
  const stored = Array.isArray(row.perSet) ? row.perSet : [];
  const any = doc.perSetEntries(row).some(e => e.reps !== '' || e.load !== '');
  const [open, setOpen] = React.useState(() => !!ladder);
  const unit = row.loadType === 'pct' ? '% 1RM' : row.loadType === 'lb' ? 'lb' : 'kg';
  const baseWeight = doc.weightLabel(row);
  const edit = (i, key, value) => {
    const list = stored.map(e => ({ ...(e && typeof e === 'object' ? e : {}) }));
    while (list.length <= i) list.push({});
    list[i] = { ...list[i], [key]: value };
    onChange({ ...row, perSet: list });
  };
  // ⚠ CLEAR TAKES ITSELF AWAY (nothing is left to clear), so it hands focus to the
  // summary first, or a keyboard user lands on the page.
  const summaryRef = React.useRef(null);
  const clear = () => { const { perSet, ...rest } = row; onChange(rest); if (summaryRef.current) summaryRef.current.focus(); };
  // A row the mobile editor added and has not named yet has no name to label with,
  // and "undefined set 1 reps" names nothing; the mobile editor calls it "New exercise".
  const who = String(row.name || '').trim() || 'New exercise';
  const cellStyle = { ...dbuField, width: '100%', height: 36 };
  return <details open={open} onToggle={e => setOpen(e.currentTarget.open)} style={{ marginTop: 12 }}>
    <summary ref={summaryRef} style={{ cursor: 'pointer', fontSize: 13, minHeight: 32 }}>Per-set reps & weight{ladder ? ' · ' + [ladder.reps, ladder.weight].filter(Boolean).join(' · ') : ''}</summary>
    {!n ? <p style={{ fontSize: 12.5, color: DBU_INK50, margin: '8px 0 0' }}>Set the number of sets first.</p> : <>
      <div role="group" aria-label={who + ' per-set targets'} style={{ display: 'grid', gridTemplateColumns: '44px 1fr 1fr', gap: '6px 10px', alignItems: 'center', marginTop: 8 }}>
        <span style={dbuLabel}>Set</span><span style={dbuLabel}>Reps</span><span style={dbuLabel}>Weight ({unit})</span>
        {Array.from({ length: n }, (_, i) => {
          const e = stored[i] && typeof stored[i] === 'object' ? stored[i] : {};
          return <React.Fragment key={i}>
            <span style={{ fontFamily: DBU_MONO, fontSize: 13, color: DBU_INK2 }}>{String(i + 1).padStart(2, '0')}</span>
            <input aria-label={who + ' set ' + (i + 1) + ' reps'} value={e.reps ?? ''} maxLength={doc.SET_REPS_MAX} placeholder={String(row.reps ?? '') || '—'} onChange={ev => edit(i, 'reps', ev.target.value)} className="dbu-field" style={cellStyle} />
            <input aria-label={who + ' set ' + (i + 1) + ' weight'} type="number" min="0" step="any" value={e.load ?? ''} placeholder={baseWeight || '—'} onChange={ev => edit(i, 'load', ev.target.value === '' ? '' : Number(ev.target.value))} className="dbu-field" style={cellStyle} />
          </React.Fragment>;
        })}
      </div>
      <p style={{ fontSize: 12.5, color: DBU_INK50, margin: '8px 0 0' }}>A blank field uses the row's {String(row.reps ?? '') ? row.reps + ' reps' : 'reps'}{baseWeight ? ' and ' + baseWeight : ''}.{count > doc.LADDER_MAX ? ' Per-set targets cover the first ' + doc.LADDER_MAX + ' sets.' : ''}</p>
      {any && <button type="button" className="dbtn" onClick={clear} style={{ marginTop: 8 }}>Clear per-set targets</button>}
    </>}
  </details>;
}

// ⚠ AN EMPTY LOAD READS EMPTY. `newRow` stores `load: 0`, and 0 is "no load" to every
// reader (`weightLabel`, `setTarget`, the player's prefill), so every new move showed a
// "0" that prescribed nothing, beside a unit for a weight nobody had written. Owner,
// 2026-10-07: "Apply all the fixes first". DISPLAY ONLY: the stored 0 is untouched, so
// no assigned workout reads any differently. The text is held while the field is in use,
// or typing "0.5" would lose its leading 0 the moment it read as none.
function dbuNoLoad(load) { return load == null || load === "" || !(Number(load) > 0); }
// ⚠ IT IS A CELL OF THE DAY'S LIST NOW, so it takes the list's class and a `data-cell`
// the list restores focus by. Rendered without a class it keeps the field it was.
function DbuLoadInput({ row, onLoad, who, className }) {
  const [draft, setDraft] = React.useState(null);
  const value = draft != null ? draft : dbuNoLoad(row.load) ? "" : row.load;
  return <input aria-label={(who || row.name)+' load'} type="number" min="0" placeholder="—" value={value} data-cell="load" className={className || "dbu-field"}
    onFocus={()=>setDraft(dbuNoLoad(row.load) ? "" : String(row.load))} onBlur={()=>setDraft(null)}
    onChange={e=>{setDraft(e.target.value);onLoad(e.target.value===''?'':Number(e.target.value));}} style={className ? undefined : {...dbuField,width:'100%'}}/>;
}
// The unit belongs to a weight, so it appears once there is one to qualify: the row's
// own, an imported load instruction it may replace, or a per-set weight in the ladder
// (whose column reads in this unit). A hidden select keeps its saved value.
function dbuShowsUnit(row) {
  return !dbuNoLoad(row.load) || String(row.loadText ?? '').trim() !== ''
    || ShapeWorkoutDocument.perSetEntries(row).some(e=>!dbuNoLoad(e.load));
}

// ── The day as one list ──────────────────────────────────────────────────────
// ⚠ STEP 2 OF THE APPROVED BUILDER PLAN — owner, 2026-10-07: "I like everything that is
// proposed for schedule and program builder", after calling the day editor "overwhelming
// and confusing". The proposal's drawn day is the target: ONE LINE PER EXERCISE carrying
// the prescription a coach changes most (sets × reps, load, RPE, rest), the blocks as
// section labels inside that one list, and the rest of a move (its ladder, cue, tempo,
// superset, progression and demo) in a DETAIL opened beside the list, or under it where
// the panel is narrow. A six-move day was about 2,000px of stacked cards; it is one screen.
//
// A row is found by its id, never by where it sits. Rows MOVE now (drag, Alt+arrow, across
// blocks), and an edit addressed by position lands on whatever slid into that position —
// including the upload that finishes after the coach has reordered the day. A legacy row
// with no id falls back to its position, which is all the old editor ever used.
function dbuRowKey(row, bi, ri) {
  return row && row.id != null && row.id !== "" ? String(row.id) : "pos:" + bi + ":" + ri;
}
const dbuKindLabel = (kind) => (DashBuilder.BLOCK_KINDS.find((k) => k.key === kind) || {}).label || "Block";
// Every row in the order the member does them, with its block and its A1/01 label. The
// labels come from `DashBuilder.rowLabels` — the member's card uses the same rule.
function dbuFlatRows(day) {
  const labels = DashBuilder.rowLabels(day);
  const out = [];
  (day.blocks || []).forEach((b, bi) => (b.rows || []).forEach((row, ri) => {
    out.push({ row, bi, ri, key: dbuRowKey(row, bi, ri), label: labels[out.length] });
  }));
  return out;
}
// Move one row to `index` of block `toBi`, where `index` counts the target block's rows
// WITHOUT the moving one. Moving into another block changes the row's block, which is the
// whole of what "across blocks" means: the block is where a row sits, not a field on it.
// The same day comes back when nothing would change, so a drop in place writes nothing.
function dbuMoveRow(day, key, toBi, toIndex) {
  const blocks = day.blocks || [];
  let from = null;
  blocks.forEach((b, bi) => (b.rows || []).forEach((r, ri) => { if (!from && dbuRowKey(r, bi, ri) === key) from = { row: r, bi, ri }; }));
  if (!from || !blocks[toBi]) return day;
  const without = blocks.map((b, bi) => (bi === from.bi ? { ...b, rows: b.rows.filter((_, ri) => ri !== from.ri) } : b));
  const target = without[toBi].rows || [];
  const at = Math.max(0, Math.min(Number(toIndex) || 0, target.length));
  if (toBi === from.bi && at === from.ri) return day;
  return { ...day, blocks: without.map((b, bi) => (bi === toBi ? { ...b, rows: [...target.slice(0, at), from.row, ...target.slice(at)] } : b)) };
}
// Alt+↑ / Alt+↓, the keyboard's way to do what the handle does. One step, and a step off
// the end of a block lands at the near end of the next one — the boundary is crossed, as
// a drag across it would.
function dbuStepTarget(day, key, dir) {
  const blocks = day.blocks || [];
  for (let bi = 0; bi < blocks.length; bi += 1) {
    const rows = blocks[bi].rows || [];
    for (let ri = 0; ri < rows.length; ri += 1) {
      if (dbuRowKey(rows[ri], bi, ri) !== key) continue;
      if (dir < 0) {
        if (ri > 0) return { bi, index: ri - 1 };
        return bi > 0 ? { bi: bi - 1, index: (blocks[bi - 1].rows || []).length } : null;
      }
      if (ri < rows.length - 1) return { bi, index: ri + 1 };
      return bi < blocks.length - 1 ? { bi: bi + 1, index: 0 } : null;
    }
  }
  return null;
}
// Where a dragged row would land, read off the rows as they are drawn. Each row's
// midpoint splits "before it" from "after it"; a block's label opens that block, so a
// pointer above a label's midpoint drops at the END of the block before it — which is
// what makes an EMPTY block, a label and nothing else, a place a row can be dropped.
// `y` is where the insertion line goes, relative to the list.
// ⚠ WITH `pair`, A ROW'S MIDDLE IS A SUPERSET TARGET (Builder step 4, "superset by drop"): over
// the middle 40% of another move the answer is { pair: its key, y, h }, and only the top and
// bottom 30% still mean "before" and "after". A line is a short target, so the bands are
// generous to the move and the pair both.
function dbuDropTarget(list, key, clientY, pair = false) {
  if (!list) return null;
  const top = list.getBoundingClientRect().top;
  let bi = 0, k = 0, edge = null;
  for (const el of list.querySelectorAll("[data-bk],[data-rk]")) {
    const r = el.getBoundingClientRect(), mid = r.top + r.height / 2;
    if (el.hasAttribute("data-bk")) {
      if (edge != null && clientY < mid) return { bi, index: k, y: edge - top };
      bi = Number(el.getAttribute("data-bk")); k = 0; edge = r.bottom;
      continue;
    }
    if (el.getAttribute("data-rk") === key) continue;
    if (pair && clientY >= r.top + r.height * 0.3 && clientY <= r.bottom - r.height * 0.3) {
      return { pair: el.getAttribute("data-rk"), bi, y: r.top - top, h: r.height };
    }
    if (clientY < mid) return { bi, index: k, y: r.top - top };
    k += 1; edge = r.bottom;
  }
  return edge == null ? null : { bi, index: k, y: edge - top };
}
// Drop one move onto another: they become a superset. The pair takes the target's letter
// (joining its superset when it already has one), else the first of A–D the day is not using.
// The dropped move lands right after the target's group in the target's block, so the pair
// reads A1, A2 down the list. A superset the dropped move leaves with only one move in it is
// undone, as "Superset with next" does. `error` when no letter is free.
function dbuPairByDrop(day, key, targetKey) {
  if (!key || key === targetKey) return { day };
  const blocks = day.blocks || [];
  let src = null, dst = null;
  blocks.forEach((b, bi) => (b.rows || []).forEach((r, ri) => {
    const k = dbuRowKey(r, bi, ri);
    if (k === key) src = { bi, ri, row: r };
    if (k === targetKey) dst = { bi, ri, row: r };
  }));
  if (!src || !dst) return { day };
  const all = blocks.flatMap((b) => b.rows || []);
  const tg = dbuGroupOf(dst.row);
  // The move leaves its own superset unless it is dropped into it. A partner left alone there
  // is no superset any more and loses its letter, so that letter is free for the new pair.
  const sg = dbuGroupOf(src.row);
  const stay = sg && sg !== tg ? all.filter((r) => r !== src.row && dbuGroupOf(r) === sg) : [];
  const orphan = stay.length === 1 ? stay[0] : null;
  const used = new Set(all.filter((r) => r !== src.row && r !== dst.row && r !== orphan).map(dbuGroupOf).filter(Boolean));
  const letter = tg || ["A", "B", "C", "D"].find((l) => !used.has(l));
  if (!letter) return { day, error: "All four superset letters (A–D) are in use on this day." };
  const moved = { ...src.row, group: letter };
  const next = blocks.map((b, bi) => {
    let rows = (b.rows || []).filter((r) => r !== src.row).map((r) => (r === orphan ? { ...r, group: null } : r === dst.row ? { ...r, group: letter } : r));
    if (bi === dst.bi) {
      let at = (b.rows || []).filter((r) => r !== src.row).indexOf(dst.row);
      while (at + 1 < rows.length && dbuGroupOf(rows[at + 1]) === letter) at += 1;
      rows = [...rows.slice(0, at + 1), moved, ...rows.slice(at + 1)];
    }
    return { ...b, rows };
  });
  return { day: { ...day, blocks: next }, letter };
}
// "Superset with next": pair this move with the one after it IN ITS BLOCK. They take the
// letter either already carries, or the first of A–D the day is not using — the same four
// letters the Superset select offers. Pressed on a pair, it takes this move out, and a
// partner left alone in its letter leaves with it, because a superset of one is not one.
const dbuGroupOf = (row) => String((row && row.group) || "").trim().toUpperCase();
function dbuPairState(day, key) {
  for (const [bi, b] of (day.blocks || []).entries()) {
    const rows = b.rows || [];
    const ri = rows.findIndex((r, i) => dbuRowKey(r, bi, i) === key);
    if (ri < 0) continue;
    const g = dbuGroupOf(rows[ri]), next = rows[ri + 1];
    return { canPair: !!next, paired: !!g && !!next && dbuGroupOf(next) === g };
  }
  return { canPair: false, paired: false };
}
function dbuTogglePair(day, key) {
  const blocks = day.blocks || [];
  const bi = blocks.findIndex((b, i) => (b.rows || []).some((r, ri) => dbuRowKey(r, i, ri) === key));
  if (bi < 0) return day;
  const rows = blocks[bi].rows;
  const ri = rows.findIndex((r, i) => dbuRowKey(r, bi, i) === key);
  const row = rows[ri], next = rows[ri + 1];
  const g = dbuGroupOf(row);
  const all = blocks.flatMap((b) => b.rows || []);
  if (g && next && dbuGroupOf(next) === g) {
    const left = all.filter((r) => r !== row && dbuGroupOf(r) === g);
    const clear = (r) => (r === row || (left.length === 1 && r === left[0]) ? { ...r, group: null } : r);
    return { ...day, blocks: blocks.map((b) => ({ ...b, rows: (b.rows || []).map(clear) })) };
  }
  if (!next) return day;
  const used = new Set(all.filter((r) => r !== row && r !== next).map(dbuGroupOf).filter(Boolean));
  const letter = g || dbuGroupOf(next) || ["A", "B", "C", "D"].find((l) => !used.has(l)) || "A";
  return { ...day, blocks: blocks.map((b, i) => (i !== bi ? b : { ...b, rows: rows.map((r, j) => (j === ri || j === ri + 1 ? { ...r, group: letter } : r)) })) };
}
// The type-ahead's order inside a group: the exact name first, then names that start with
// what was typed, then the rest as the library lists them — so Enter on "deadlift" adds
// Deadlift, not Romanian deadlift.
function dbuRankMoves(list, term) {
  const t = String(term || "").trim().toLowerCase();
  const rank = (e) => { const n = String(e.name || "").toLowerCase(); return n === t ? 0 : n.startsWith(t) ? 1 : 2; };
  return (list || []).map((e, i) => [e, i]).sort((a, b) => rank(a[0]) - rank(b[0]) || a[1] - b[1]).map((x) => x[0]);
}

// ── One line per exercise ────────────────────────────────────────────────────
// ⚠ A WHITEBOARD LINE (the owner's coach review, step 6c): "Back squat 4 × 5 @ 255 lb · RPE 8 ·
// 3-1-X-1 · 2:30, edited in place". ⠿ · index · name · sets × reps · @ load · RPE · tempo ·
// rest, and the cue under the name, so nothing a coach writes on the whiteboard hides behind
// the detail any more (the review: "a row hides tempo and cues"). Every cell is a real input
// that reads as text until it is used, so Tab walks the line like a spreadsheet; each one
// names its move for a screen reader. Focus anywhere in the line selects it, so the detail
// follows the coach's cursor. Usable on its own (two suites mount it bare), with selection
// and drag handed in.
// ⚠ IN A SUPERSET, A MOVE THAT IS NOT THE LAST READS "→ A2" WHERE ITS REST WOULD BE: the member
// goes straight on, so a rest there prescribes nothing. Its stored rest is kept, untouched,
// and returns if the pair is undone. `bracket` is the superset's line, drawn on its first move.
function DbuRow({ row, label, onChange, selected = false, onSelect, detailId, rowKey, handle, dragging = false, dy = 0, onRowKeyDown, progress = '', rpeProgress = '', restTo = '', bracket = '' }) {
  const set = (k,v) => {const next={...row,[k]:v}; if(k==='load'||k==='loadType') delete next.loadText;
    // A trainer's new Rest value replaces any older numeric override, as in the mobile editor.
    if(k==='rest') delete next.restSeconds; onChange(next);};
  const who = String(row.name || '').trim() || 'New exercise';
  const video = ShapeWorkoutDocument.videoUrl(row.video);
  const ladder = ShapeWorkoutDocument.ladder(row);
  // ⚠ U+FE0E ON THE ARROWS: ▶ and ↗ have emoji forms that iOS draws in colour, and the
  // house rule is monochrome symbols only. The text selector keeps them type.
  const marks = [
    video && ['▶︎', 'Has a demo video'],
    // ⚠ THE PROGRAM'S PROGRESSION, NOT THE ROW'S OLD CHECKBOX. `row.progression` only ever
    // did anything when a week was copied with Progress, a tool step 3 retired, so marking
    // it would promise a climb that no longer happens.
    ...dbuProgressMarks(progress, rpeProgress),
    ladder && ['≡', 'Per-set targets · ' + [ladder.reps, ladder.weight].filter(Boolean).join(' · ')],
  ].filter(Boolean);
  const pick = () => { if (onSelect) onSelect(); };
  return <div className={'dr' + (selected ? ' on' : '') + (row.group ? ' grp' : '') + (dragging ? ' drag' : '')} data-rk={rowKey} role="listitem"
    onFocus={pick} onClick={pick} onKeyDown={onRowKeyDown} style={dragging ? { transform: 'translateY(' + dy + 'px)' } : undefined}>
    {bracket && <span className="ssb">{bracket}</span>}
    <button type="button" className="rh" tabIndex={-1} aria-label={'Drag to reorder ' + who} title="Drag to reorder. From the keyboard: Alt+↑ or Alt+↓" {...(handle || {})}>⠿</button>
    <i className={'ix' + (row.group ? ' ss' : '')}>{label}</i>
    <span className="nmc">
      <button type="button" className="nm" data-cell="name" title={who} aria-expanded={onSelect ? selected : undefined} aria-controls={onSelect && selected ? detailId : undefined} aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown">{who}</button>
      {!!marks.length && <span className="mk">{marks.map(([g, t]) => <b key={t} title={t}><span aria-hidden="true">{g}</span><span className="sr">{t}</span></b>)}</span>}
    </span>
    <span className="dcells">
      <span className="c sx">
        <input className="ci n" data-cell="sets" aria-label={who+' Sets'} type="number" min="1" value={row.sets ?? ''} onChange={e=>set('sets',e.target.value)}/>
        <span className="tm" aria-hidden="true">×</span>
        <input className="ci" data-cell="reps" aria-label={who+' Reps'} value={row.reps ?? ''} onChange={e=>set('reps',e.target.value)}/>
      </span>
      <span className="c ld">
        <span className="tm" aria-hidden="true">@</span>
        <DbuLoadInput row={row} who={who} className="ci n" onLoad={v=>set('load',v)}/>
        {/* ⚠ RPE LEFT THIS LIST AND GOT ITS OWN. As a fourth `loadType` it was
               EXCLUSIVE with a weight — a coach could say 100 kg or RPE 8 and never
               "100 kg @ RPE 8", which is what most strength programming looks like.
               Owner: "if i want RPE, that should be a seperate drop down from KG or
               IBS". A stored row still carrying `loadType:'rpe'` is converted on
               read by `splitLegacyRpe`, so this select can never show a blank value
               for an option it no longer offers. */}
        {dbuShowsUnit(row) && <select className="ci u" data-cell="unit" aria-label={who+' load unit'} value={row.loadType || 'kg'} onChange={e=>set('loadType',e.target.value)}><option value="kg">kg</option><option value="lb">lb</option><option value="pct">% 1RM</option></select>}
      </span>
      {/* No target RPE reads "—", as an empty load does: a placeholder, not a word. */}
      <span className="c rp"><select className="ci" data-cell="rpe" aria-label={who+' target RPE'} value={row.rpe ?? ''} onChange={e=>set('rpe',e.target.value===''?'':Number(e.target.value))}><option value="">—</option>{dbuRpeOptions(row.rpe).map(v=><option key={v} value={v}>{v}</option>)}</select></span>
      <span className="c tp"><input className="ci" data-cell="tempo" aria-label={who+' Tempo'} placeholder="Tempo" value={row.tempo ?? ''} onChange={e=>set('tempo',e.target.value)}/></span>
      <span className="c rs">{restTo
        ? <span className="ci to" title={'Straight on to ' + restTo}><span aria-hidden="true">→ {restTo}</span><span className="sr">{who + ' Rest: straight on to ' + restTo}</span></span>
        : <input className="ci" data-cell="rest" aria-label={who+' Rest'} placeholder="—" value={row.rest ?? ''} onChange={e=>set('rest',e.target.value)}/>}</span>
    </span>
    <input className="ci cue" data-cell="cue" aria-label={who+' Coach cue'} placeholder="＋ Cue" value={row.cue ?? ''} onChange={e=>set('cue',e.target.value)}/>
  </div>;
}

// ── The detail beside the list ───────────────────────────────────────────────
// Everything about one move that is not the line: the per-set ladder, the coaching
// fields, the demo and the move's own actions. Remounted per move (its key), so an
// upload's state belongs to the move it was started on — and the list will not change
// the selection while one runs (`busy`), so that move stays on screen until it lands.
function DbuRowDetail({ id, row, label, blockLabel, onChange, onRemove, onDuplicate, onPair, pair = {}, clips = [], onUploading, progress = '', rpeProgress = '', rule = null, onFollow, onFollowRpe }) {
  const set = (k,v) => onChange({...row,[k]:v});
  const [uploading,setUploading] = React.useState(false);
  const [error,setError] = React.useState('');
  const fileRef=React.useRef(null), latest=React.useRef({row,onChange}); latest.current={row,onChange};
  const mounted=React.useRef(true);
  React.useEffect(()=>()=>{mounted.current=false;},[]);
  const upload=async(file)=>{if(!file)return; setUploading(true);setError('');onUploading(1);try {const url=await dbuUploadVideo(file);if(mounted.current)latest.current.onChange({...latest.current.row,video:url});}catch(e){if(mounted.current)setError(e.message || 'Upload failed. Choose the file to retry.');}finally{if(mounted.current)setUploading(false);onUploading(-1);}};
  const video=ShapeWorkoutDocument.videoUrl(row.video);
  const who = String(row.name || '').trim() || 'New exercise';
  return <aside className="ddetail" id={id} aria-label={'Exercise detail · ' + who}>
    <div className="deb">{label}{blockLabel ? ' · ' + blockLabel : ''}</div>
    <h3 className="dnm">{who}</h3>
    {row.loadText && <p className="dnote">Original load instruction: {row.loadText}</p>}
    <DbuLadder row={row} onChange={onChange}/>
    {/* ⚠ THE CUE AND THE TEMPO ARE ON THE LINE NOW, and the Superset select is gone (step 6c:
        "one control instead of a dropdown and a button"): Superset with next, below, pairs and
        unpairs, and a move dropped on another pairs them too. */}
    {/* ⚠ THE CHECKBOX THAT WAS HERE ("Increase it when a week is copied with Progress")
        carried increments fixed in code. The program's progression bar sets one rule for
        every move it covers; this line says what it does to this one. */}
    {progress && rule && <p className="dprg">
      <span aria-hidden="true">{DBU_PROGRESS_MARK[progress][0]}</span>
      {progress === 'source' ? 'Goes up ' + dbuAmountLabel(rule) + ' each week with the program’s progression.'
        : progress === 'follows' ? 'This week’s load is set by the progression. Type a load to set it by hand.'
        : 'You set this week’s load by hand.'}
      {progress === 'pinned' && onFollow && <button type="button" className="dbtn" onClick={onFollow}>Follow the progression</button>}
    </p>}
    {rpeProgress && rule && rule.rpe && <p className="dprg">
      <span aria-hidden="true">{DBU_RPE_MARK[rpeProgress][0]}</span>
      {rpeProgress === 'source' ? 'Its RPE goes up ' + rule.rpe.step + ' each week, up to ' + rule.rpe.cap + '.'
        : rpeProgress === 'follows' ? 'This week’s RPE is set by the progression. Pick an RPE to set it by hand.'
        : 'You picked this week’s RPE by hand.'}
      {rpeProgress === 'pinned' && onFollowRpe && <button type="button" className="dbtn" aria-label="Follow the progression for this RPE" onClick={onFollowRpe}>Follow the progression</button>}
    </p>}
    {/* ⚠ THE DEMO OPENS HERE, NOT BEHIND A FOLD. Step 1 folded it under every move because
        it was under EVERY move; the detail holds one move, so its demo is the thing being
        looked at and stays open. The heading still says whether a demo is attached, and
        whether an upload is running or failed. Upload, library, link, remove and player are
        what they were. */}
    <div className="cb-demo" role="group" aria-label={'Demo video for ' + who}>
      <div className="sub">Demo video <small>{uploading?'Uploading…':error?'Upload failed':video?'Attached':'Optional'}</small></div>
      <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm" hidden onChange={e=>{const f=e.target.files[0];e.target.value='';upload(f);}}/>
      <div className="drow"><button type="button" disabled={uploading} className="dbtn" onClick={()=>fileRef.current.click()}>{uploading?'Uploading…':video?'Replace demo':'Upload demo'}</button>
        {!!clips.length && <select aria-label={'Choose demo for '+who} className="df" value="" disabled={uploading} onChange={e=>set('video',e.target.value)}><option value="">Choose from video library</option>{clips.map(c=><option key={c.url} value={c.url}>{c.name}</option>)}</select>}
        {video && <button type="button" disabled={uploading} className="dbtn" onClick={()=>set('video','')}>Remove demo</button>}
      </div>
      {uploading && <progress aria-label="Uploading exercise demonstration" style={{width:'100%',marginTop:8}}/>}
      {error && <p role="alert" style={{fontSize:13,color:'var(--sh-rust, #e0644b)'}}>{error}</p>}
      <ShapeVideoLink value={video} onChange={url=>set('video',url)} label={'Video link for '+who} disabled={uploading}/>
      <ShapeVideoPlayer value={video} title={row.name || 'Exercise demonstration'}/>
    </div>
    <div className="dacts">
      <button type="button" className="dbtn" disabled={uploading || !pair.canPair} onClick={onPair} title={pair.canPair ? undefined : 'The last move in a block has nothing after it to pair with'}>{pair.paired ? 'Unpair from next' : 'Superset with next'}</button>
      <button type="button" className="dbtn" onClick={onDuplicate}>Duplicate</button>
      <button type="button" className="dbtn danger" disabled={uploading} aria-label={'Remove '+who} onClick={onRemove}>Remove</button>
    </div>
  </aside>;
}

// ── Type to add ──────────────────────────────────────────────────────────────
// The list's last line. Type-ahead over the picker's own sources and rule — the coach's
// moves, the Shape library, and "Add 'X' as a new exercise" — so the two ways in cannot
// disagree about what a name means. ↑/↓ choose, Enter adds, Escape closes the list. The
// modal picker stays one click away on every block label, for ticking several at once.
function DbuQuickAdd({ customMoves = [], onAdd, blockLabel, inputRef }) {
  const [q, setQ] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const id = React.useId();
  const term = q.trim();
  const mine = term ? dbuRankMoves(DashBuilder.searchCustomMoves(customMoves, term), term) : [];
  const shape = term ? dbuRankMoves(DashBuilder.searchExercises(term), term) : [];
  const create = DashBuilder.canCreateMove(term, customMoves) ? { id: "new-" + term.toLowerCase(), name: term, muscle: "", equipment: "", own: true, isNew: true } : null;
  const options = [...mine, ...shape, ...(create ? [create] : [])];
  const at = options.length ? Math.min(active, options.length - 1) : -1;
  const shown = open && options.length > 0;
  const add = (ex) => { if (!ex) return; setQ(""); setActive(0); setOpen(false); onAdd(ex); };
  const onKey = (e) => {
    if (dbuImeComposing(e.nativeEvent)) return;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && options.length && !e.altKey) {
      e.preventDefault();
      setOpen(true);
      setActive((at + (e.key === "ArrowDown" ? 1 : options.length - 1)) % options.length);
    } else if (e.key === "Enter" && at >= 0) {
      e.preventDefault();
      add(options[at]);
    } else if (e.key === "Escape" && (shown || q)) {
      // Only when there is something to dismiss; an Escape on an empty line is the
      // panel's (it closes the day editor).
      e.preventDefault(); e.stopPropagation();
      if (shown) setOpen(false); else setQ("");
    }
  };
  const opt = (ex, i) => (
    <li key={ex.id + ":" + i} id={id + "-" + i} role="option" aria-selected={i === at} className={ex.isNew ? "new" : undefined}
      onMouseDown={(e) => e.preventDefault()} onClick={() => add(ex)} onMouseEnter={() => setActive(i)}>
      <span>{ex.isNew ? "＋ Add “" + ex.name + "” as a new exercise" : ex.name}</span>
      {!ex.isNew && <small>{[ex.muscle, ex.equipment].filter(Boolean).join(" · ") || (ex.own ? "Your own move" : "")}</small>}
    </li>
  );
  return (
    <div className="dqa">
      <input ref={inputRef} role="combobox" aria-autocomplete="list" aria-expanded={shown} aria-controls={id} aria-activedescendant={shown && at >= 0 ? id + "-" + at : undefined}
        aria-label={"Add an exercise to " + blockLabel} placeholder="Type an exercise and press Enter…" value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }} onKeyDown={onKey}
        onFocus={() => setOpen(true)} onBlur={() => setOpen(false)} />
      <span className="kbd" aria-hidden="true">to {blockLabel} · ⏎ add · ⇥ next cell</span>
      {shown && (
        <ul role="listbox" id={id} className="dqa-list dash-thin-scroll" aria-label="Exercises">
          {!!mine.length && <li role="presentation" className="h">Your moves</li>}
          {mine.map((ex, i) => opt(ex, i))}
          {!!shape.length && <li role="presentation" className="h">Shape library</li>}
          {shape.map((ex, i) => opt(ex, mine.length + i))}
          {create && opt(create, options.length - 1)}
        </ul>
      )}
    </div>
  );
}

// ── The day's own settings, as chips ─────────────────────────────────────────
// ⚠ THREE FULL-WIDTH FIELDS BECAME THREE CHIPS (owner, 2026-10-07). The training day and
// the playlist are NATIVE selects laid invisibly over their chip, so the chip opens the
// platform's own list — keyboard, screen reader and phone included — while showing only
// what matters ("♫ Heavy Day mix", or a dashed "＋ Playlist"). The walkthrough is an
// attachment, not a choice, so its chip opens an inline panel; the panel is hidden, never
// unmounted, so an upload started in it outlives closing it.
function DbuDayChips({ day, onChange, onWeekday, takenBy, playlists = [], clips, onUploading }) {
  const [vidOpen, setVidOpen] = React.useState(false);
  const [vidBusy, setVidBusy] = React.useState(0);
  const panelId = React.useId();
  const chipRef = React.useRef(null);
  const wd = dbuHasWeekday(day) ? day.weekday : null;
  // A playlist the day already carries is offered even when the list has not loaded it
  // (signed out, or since renamed), or the select would DISPLAY "No playlist" over a day
  // that has one — the same trap `dbuRpeOptions` closes for a stored RPE.
  // ⚠ A PLAYLIST IS MATCHED BY ITS ID (step 6b's Playlists page writes `{ id, name, meta }` and
  // matches by id), and a day saved before ids keeps matching by name, so a renamed playlist is
  // still the one the day carries. Each option is keyed by id where it has one.
  const keyOf = (p) => (p && p.id != null && p.id !== "" ? "id:" + p.id : "name:" + ((p && p.name) || ""));
  const same = (p, q) => !!p && !!q && (q.id != null && q.id !== "" ? p.id === q.id : p.name === q.name);
  const lists = day.playlist && day.playlist.name && !playlists.some((p) => same(p, day.playlist)) ? [day.playlist, ...playlists] : playlists;
  const current = day.playlist ? lists.find((p) => same(p, day.playlist)) : null;
  const closeVid = () => { setVidOpen(false); if (chipRef.current) chipRef.current.focus(); };
  return <>
    <div className="dchips" role="group" aria-label="Day settings">
      <span className="dchip" title="Training day">
        <span aria-hidden="true"><small>Training day</small> {wd != null ? DBU_DOW_FULL[wd] : "In sequence"} <i>▾</i></span>
        {/* ⚠ ROUTED THROUGH `onWeekday`, NEVER `onChange`. This select and the Grid's drag
            are the two writers of a day's weekday; both go through `dbuAssignWeekday`, so a
            weekday another day already holds is EXCHANGED rather than duplicated. Writing it
            through `onChange` — a blind positional replace — is how two days came to sit on
            one weekday, and the Grid can render only the first of those, so the second was
            unreachable while the document still held it. Fixed in #2143.
            The option names the day it would swap with, so the outcome is legible before the
            click rather than a session quietly changing day. */}
        <select aria-label="Training day" value={day.weekday ?? ''} onChange={(e) => onWeekday(e.target.value === '' ? undefined : Number(e.target.value))}>
          <option value="">In sequence from start</option>
          {DBU_DOW_FULL.map((d, i) => <option key={d} value={i}>{d}{takenBy && takenBy[i] ? " · swaps with " + takenBy[i] : ""}</option>)}
        </select>
      </span>
      <span className={"dchip" + (day.playlist ? "" : " dim")} title="Playlist on the client's card">
        <span aria-hidden="true">{day.playlist ? "♫ " + day.playlist.name : "＋ Playlist"}</span>
        <select aria-label="Playlist on the client's card" value={current ? keyOf(current) : ""} onChange={(e) => {
          const p = lists.find((x) => keyOf(x) === e.target.value);
          onChange({ ...day, playlist: p ? { ...(p.id != null && p.id !== "" ? { id: p.id } : {}), name: p.name, meta: p.meta || "" } : null });
        }}>
          <option value="">No playlist</option>
          {lists.map((p) => <option key={keyOf(p)} value={keyOf(p)}>{p.name}{p.meta ? " · " + p.meta : ""}</option>)}
          {!lists.length && <option value="" disabled>No Shape Radio playlists yet</option>}
        </select>
      </span>
      <button type="button" ref={chipRef} className={"dchip" + (day.video ? "" : " dim")} aria-expanded={vidOpen} aria-controls={panelId} onClick={() => setVidOpen((o) => !o)}>
        {vidBusy ? "Uploading walkthrough…" : day.video ? "▶︎ Walkthrough video" : "＋ Walkthrough video"}
      </button>
    </div>
    <div className="dpop" id={panelId} hidden={!vidOpen} role="group" aria-label="Workout walkthrough video"
      onKeyDown={(e) => { if (e.key === "Escape" && !dbuImeComposing(e.nativeEvent) && !e.defaultPrevented) { e.preventDefault(); e.stopPropagation(); closeVid(); } }}>
      <p>Explain this day's workout: exercises, technique and what to focus on.</p>
      <ShapeVideoAttachment value={day.video} title="Workout walkthrough" onChange={video=>onChange({...day,video})} upload={dbuUploadVideo} onBusy={(d)=>{setVidBusy((n)=>Math.max(0,n+d));onUploading(d);}} clips={clips}/>
      <button type="button" className="dbtn" onClick={closeVid}>Done</button>
    </div>
  </>;
}

// ── Day editor ───────────────────────────────────────────────────────────────
// The chips, then the list and its detail. The day's name and date are the panel's
// heading (`DbuBuilder`), which is where a coach looks for which day this is.
// ── Draft with AI ────────────────────────────────────────────────────────────
// The proposal's "Draft a day with AI on the web" (owner-approved 2026-10-07), and the
// owner's "make sure there are no gaps". The coach describes the day in their own words;
// /api/ai/draft-workout (the same core Nora drafts with, src/lib/ai/workoutDraft.mjs)
// answers with builder rows, which are SHOWN before anything touches the day. The coach
// then adds them to the day or replaces it, and one Undo puts the day back. Nothing is
// saved by drafting: the rows join the document and ride its own autosave.
// ⚠ THE ROUTE NEVER INVENTS A LOAD, so drafted rows read "—" in Load until the coach
// types one, unless the brief itself named a weight. And a template answer (no AI key, a
// failed call) is LABELLED as one, in the route's own words, never passed off as AI.
// ⚠ SIGNED OUT (the preview) THERE IS NO CALL: the route is trainer-only, and a 401 in a
// demo would read as a broken button rather than a feature that needs an account.
function DbuAiDraft({ live, clientId, hasRows, onApply, onClose }) {
  const [text, setText] = React.useState("");
  const [st, setSt] = React.useState({ state: "idle" });
  const inputRef = React.useRef(null);
  const id = React.useId();
  React.useEffect(() => { if (inputRef.current) inputRef.current.focus(); }, []);
  const ask = React.useRef(0);
  React.useEffect(() => () => { ask.current++; }, []);
  const run = async () => {
    const request = text.trim();
    if (!request) { setSt({ state: "error", error: "Describe the day first, for example “Lower body, 50 min, barbell, intermediate”." }); return; }
    if (!live) { setSt({ state: "error", error: "Drafting with AI needs a signed-in trainer account. This is the preview." }); return; }
    const mine = ++ask.current;
    setSt({ state: "busy" });
    try {
      const res = await fetch("/api/ai/draft-workout", { method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ request, kind: "day", ...(clientId ? { clientId } : {}) }) });
      const data = await res.json().catch(() => null);
      if (mine !== ask.current) return;
      if (!res.ok || !data) throw new Error((data && data.error) || "Could not draft that day. Try again in a moment.");
      const week = data.draft && data.draft.builder && Array.isArray(data.draft.builder.weeks) ? data.draft.builder.weeks[0] : null;
      const dDay = week && Array.isArray(week.days) ? week.days[0] : null;
      if (!dDay || !(dDay.blocks || []).some((b) => (b.rows || []).length)) throw new Error("The draft came back empty. Try describing the day another way.");
      setSt({ state: "ready", day: dDay, lines: Array.isArray(data.lines) ? data.lines.map(String) : [], notice: data.notice ? String(data.notice) : "", notes: data.notes ? String(data.notes) : "" });
    } catch (e) {
      if (mine === ask.current) setSt({ state: "error", error: (e && e.message) || "Could not draft that day." });
    }
  };
  const ready = st.state === "ready";
  return (
    <section className="dai" aria-label="Draft this day with AI">
      <div className="dai-row">
        <label className="sr" htmlFor={id}>Describe the day</label>
        <input id={id} ref={inputRef} className="dai-in" value={text} placeholder="Lower body, 50 min, barbell, intermediate" maxLength={500}
          disabled={st.state === "busy"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (dbuImeComposing(e.nativeEvent)) return;
            if (e.key === "Enter") { e.preventDefault(); run(); }
            else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
          }} />
        <button type="button" className="dbtn" onClick={run} disabled={st.state === "busy"}>{st.state === "busy" ? "Drafting…" : ready ? "Draft again" : "Draft"}</button>
        <button type="button" className="dq" aria-label="Close Draft with AI" onClick={onClose}>×</button>
      </div>
      <p className="dai-hint">Name the focus, time, equipment and level. Loads stay empty unless you give one.</p>
      <div role="status" aria-live="polite">
        {st.state === "busy" && <p className="dai-msg">Drafting the day…</p>}
        {st.state === "error" && <p className="dai-msg err">{st.error}</p>}
        {ready && st.notice && <p className="dai-msg note">{st.notice}</p>}
      </div>
      {ready && (
        <>
          <ul className="dai-lines" aria-label="Drafted exercises">
            {st.lines.map((l, i) => <li key={i} className={i === 0 ? "head" : undefined}>{l}</li>)}
          </ul>
          {st.notes && <p className="dai-hint">{st.notes}</p>}
          <div className="dai-row">
            {hasRows ? (
              <>
                <button type="button" className="dbtn" onClick={() => onApply("add", st.day)}>Add to this day</button>
                <button type="button" className="dbtn" onClick={() => onApply("replace", st.day)}>Replace this day</button>
              </>
            ) : <button type="button" className="dbtn" onClick={() => onApply("replace", st.day)}>Use this draft</button>}
          </div>
        </>
      )}
    </section>
  );
}

// Adds a drafted day's rows to a day: each drafted block's rows go to the end of the
// first block of the same kind, or to a new block of that kind in the builder's order.
function dbuMergeDraft(blocks, draftBlocks) {
  const order = DashBuilder.BLOCK_KINDS.map((k) => k.key);
  const rank = (kind) => { const i = order.indexOf(kind); return i < 0 ? order.length : i; };
  const next = blocks.map((b) => ({ ...b, rows: [...(b.rows || [])] }));
  for (const db of draftBlocks) {
    const at = next.findIndex((b) => b.kind === db.kind);
    if (at >= 0) { next[at] = { ...next[at], rows: [...next[at].rows, ...db.rows] }; continue; }
    let i = next.length;
    while (i > 0 && rank(next[i - 1].kind) > rank(db.kind)) i--;
    next.splice(i, 0, { kind: db.kind, rows: [...db.rows] });
  }
  return next;
}

// ── The session adds itself up ──────────────────────────────────────────────
// Step 6c: "≈62 min, 19 working sets, 12.2k lb and a muscle-balance bar (Quads 7, Hamstrings 6,
// Core 6), with one note". Every figure is `DashBuilder.sessionTotals`, read off the rows and the
// library's own muscle tags. ⚠ NO MINUTES UNLESS THE DAY HAS THEM: Shape has no rule for how
// long a set takes, so a duration is shown only where the day carries its planned minutes (an
// outline import stamps them), never estimated. A move with no muscle tag (a coach's own) adds
// nothing to the bar and is counted under it, so the bar never claims a balance it cannot see.
const DBU_MUSCLE_TONES = ["var(--sh-accent, #2ee0c4)", "var(--sh-rust2, #c0533b)", "var(--sh-gold, #d8a23a)", "var(--sh-ink2, #a09b94)"];
function dbuVolume(n) {
  if (!(n > 0)) return "";
  return n >= 1000 ? (Math.round(n / 100) / 10).toLocaleString("en-US") + "k" : String(Math.round(n));
}
function DbuSessionTotals({ day }) {
  const t = DashBuilder.sessionTotals(day);
  if (!t.workingSets && !t.minutes) return null;
  const vol = [t.volume.lb > 0 && dbuVolume(t.volume.lb) + " lb", t.volume.kg > 0 && dbuVolume(t.volume.kg) + " kg"].filter(Boolean).join(" · ");
  const shown = t.muscles.slice(0, 4);
  const rest = t.muscles.slice(4).reduce((n, m) => n + m.sets, 0);
  const parts = [...shown.map((m, i) => ({ ...m, c: DBU_MUSCLE_TONES[i] })), ...(rest ? [{ label: "Other", sets: rest, c: DBU_LINE2 }] : [])];
  const tagged = parts.reduce((n, p) => n + p.sets, 0);
  const notes = [];
  if (vol && t.unweighed) notes.push("Volume leaves out " + t.unweighed + (t.unweighed === 1 ? " move" : " moves") + " with a set that has no weight or no whole rep count.");
  if (t.untagged) notes.push(t.untagged + (t.untagged === 1 ? " set is" : " sets are") + " on moves with no muscle recorded.");
  return (
    <section className="dtot" aria-label="This session adds up to">
      <div className="dtot-n">
        {t.minutes != null && <span><b>{t.minutes} min</b> planned</span>}
        <span><b>{t.workingSets}</b> working {t.workingSets === 1 ? "set" : "sets"}</span>
        {vol && <span><b>{vol}</b> volume</span>}
      </div>
      {tagged > 0 && <div className="dtot-m">
        <div className="mbar" role="img" aria-label={"Working sets by muscle: " + parts.map((p) => p.label + " " + p.sets).join(", ")}>
          {parts.map((p) => <i key={p.label} style={{ flexGrow: p.sets, background: p.c }} />)}
        </div>
        <ul className="mleg" aria-hidden="true">{parts.map((p) => <li key={p.label}><i style={{ background: p.c }} />{p.label} <b>{p.sets}</b></li>)}</ul>
      </div>}
      {t.pairWith && <p className="dtot-note">{t.pairWith}</p>}
      {!!notes.length && <p className="dtot-foot">{notes.join(" ")}</p>}
    </section>
  );
}

function DbuDayEditor({ day, onChange, onWeekday, takenBy, playlists, clips, onUploading, customMoves, busy = false, live = false, clientId = null, progress = {}, rpeProgress = {}, rule = null }) {
  // The block the library adds to: the one a block label's ＋ Exercise named, else the block of
  // the selected move (as the type-ahead does).
  // It opens on the Main block (step 6c: "drag or ＋ Main"), until the coach picks a move or a
  // block of their own.
  const [aim, setAim] = React.useState(() => { const i = (day.blocks || []).findIndex((b) => b && b.kind === "main"); return i >= 0 ? i : null; });
  const libSearch = React.useRef(null);
  const blocks = day.blocks || [];
  const flat = dbuFlatRows(day);
  // ⚠ ONE MOVE IS SELECTED, AND THE DAY OPENS ON ITS FIRST. Step 1 folded every move to a
  // line and opened one at a time; here the line IS the fold and the detail beside it is
  // the opened move, so there is always one to show when the day has any.
  const [selKey, setSelKey] = React.useState(() => (flat[0] ? flat[0].key : ""));
  const current = flat.find((x) => x.key === selKey) || flat[0] || null;
  const detailId = React.useId();
  const listRef = React.useRef(null), addRef = React.useRef(null);
  const focusNext = React.useRef(null);
  const [say, setSay] = React.useState("");
  const [aiOpen, setAiOpen] = React.useState(false);
  // One step back from the last draft applied, offered only while the day is still exactly
  // what the draft left: an Undo that also threw away edits made since would lose work.
  const aiUndo = React.useRef(null);
  // ⚠ NOT WHILE AN UPLOAD RUNS. The detail is remounted per move, and a demo upload's
  // result is written by the detail that started it; switching moves mid-upload would
  // unmount it and drop the video on the floor. The fieldset already stops every control;
  // this stops the row clicks that are not controls.
  const select = (key) => { if (!busy && key !== selKey) { setSelKey(key); setAim(null); } };
  const write = (next) => onChange({ ...day, blocks: next });
  const setBlock = (bi, next) => write(blocks.map((b, i) => (i === bi ? next : b)));
  const updateRow = (key, next) => write(blocks.map((b, bi) => ({ ...b, rows: (b.rows || []).map((r, ri) => (dbuRowKey(r, bi, ri) === key ? next : r)) })));
  const curBi = current ? current.bi : Math.max(0, blocks.length - 1);
  // New moves land in the CURRENT block — the one the selected move is in — at its end.
  const addRows = (bi, rows, focusSets) => {
    if (!rows.length) return;
    write(blocks.length ? blocks.map((b, i) => (i === bi ? { ...b, rows: [...(b.rows || []), ...rows] } : b)) : [{ kind: "main", rows }]);
    const key = String(rows[0].id);
    setSelKey(key);
    if (focusSets) focusNext.current = { key, cell: "sets", select: true };
    setSay(rows.length === 1 ? (rows[0].name || "An exercise") + " added to " + dbuKindLabel((blocks[bi] || { kind: "main" }).kind) + "." : rows.length + " exercises added.");
  };
  // The library's two ways in. ＋ adds to the end of the block it names; a drop lands at the line
  // it was let go on, read off the rows as drawn (`dbuDropTarget`, the handle drag's own rule).
  const addBi = aim != null && blocks[aim] ? aim : curBi;
  const addKind = dbuKindLabel((blocks[addBi] || { kind: "main" }).kind);
  const inDay = new Set(flat.map((x) => dbuNameKey(x.row.name)));
  const [libLine, setLibLine] = React.useState(null);
  const libOver = (e) => {
    if (!dbuLibDrag.current || busy) return;
    e.preventDefault();
    const to = dbuDropTarget(listRef.current, "", e.clientY);
    setLibLine(to ? to.y : null);
  };
  const libDrop = (e) => {
    const ex = dbuLibDrag.current;
    dbuLibDrag.current = null;
    setLibLine(null);
    if (!ex || busy) return;
    e.preventDefault();
    const to = dbuDropTarget(listRef.current, "", e.clientY) || { bi: addBi, index: ((blocks[addBi] || {}).rows || []).length };
    const row = DashBuilder.newRow(ex);
    if (!blocks.length) { write([{ kind: "main", rows: [row] }]); }
    else write(blocks.map((b, i) => (i === to.bi ? { ...b, rows: [...(b.rows || []).slice(0, to.index), row, ...(b.rows || []).slice(to.index)] } : b)));
    setSelKey(String(row.id));
    setSay((ex.name || "An exercise") + " added to " + dbuKindLabel((blocks[to.bi] || { kind: "main" }).kind) + ".");
  };
  const move = (key, to) => {
    const next = dbuMoveRow(day, key, to.bi, to.index);
    if (next === day) return;
    onChange(next);
    const b = next.blocks[to.bi], rows = b.rows || [];
    const at = rows.findIndex((r, ri) => dbuRowKey(r, to.bi, ri) === key);
    const name = String((rows[at] && rows[at].name) || "").trim() || "The exercise";
    setSay(name + " moved to " + dbuKindLabel(b.kind) + ", " + (at + 1) + " of " + rows.length + ".");
  };
  // Alt+↑ / Alt+↓ on any focused part of a line. Focus goes back to the same cell after
  // the move — React moves the line's DOM node, and a moved node loses focus.
  const onRowKey = (key) => (e) => {
    if (!e.altKey || (e.key !== "ArrowUp" && e.key !== "ArrowDown") || dbuImeComposing(e.nativeEvent)) return;
    e.preventDefault();
    if (busy) return;
    const up = e.key === "ArrowUp";
    const to = dbuStepTarget(day, key, up ? -1 : 1);
    const x = flat.find((f) => f.key === key);
    const name = String((x && x.row.name) || "").trim() || "The exercise";
    if (!to) { setSay(name + (up ? " is already first." : " is already last.")); return; }
    focusNext.current = { key, cell: (e.target && e.target.getAttribute && e.target.getAttribute("data-cell")) || "name" };
    move(key, to);
  };
  React.useLayoutEffect(() => {
    const f = focusNext.current;
    if (!f) return;
    focusNext.current = null;
    if (f.add) { if (addRef.current) addRef.current.focus(); return; }
    const line = listRef.current && [...listRef.current.querySelectorAll("[data-rk]")].find((el) => el.getAttribute("data-rk") === f.key);
    const el = line && (line.querySelector('[data-cell="' + f.cell + '"]') || line.querySelector('[data-cell="name"]'));
    if (el) { el.focus(); if (f.select && el.select) el.select(); }
  });

  // ── Drag by the handle ────────────────────────────────────────────────────
  // ⚠ POINTER EVENTS WITH CAPTURE, the capture rule written once above (`dbuCapture`): one path for
  // mouse, pen and touch, one pointer drives a drag, and losing capture ends it. The row
  // follows the pointer and a line marks where it will land; nothing moves in the
  // document until the drop, so an abandoned drag (Escape, a cancelled touch) writes
  // nothing and spends no revision.
  const dragRef = React.useRef(null);
  const [drag, setDrag] = React.useState(null);
  const endDrag = () => { dragRef.current = null; setDrag(null); };
  React.useEffect(() => {
    if (!drag) return undefined;
    const key = (e) => { if (e.key === "Escape" && dragRef.current) { e.preventDefault(); dragRef.current.cancelled = true; setDrag(null); } };
    document.addEventListener("keydown", key, true);
    return () => document.removeEventListener("keydown", key, true);
  }, [!!drag]);
  const handleFor = (key) => ({
    onPointerDown: (e) => {
      if (busy || (e.pointerType === "mouse" && e.button !== 0)) return;
      if (dragRef.current && dragRef.current.id !== e.pointerId) return;
      dbuCapture(e);
      dragRef.current = { key, id: e.pointerId, y0: e.clientY, to: null };
      select(key);
      setDrag({ key, dy: 0, line: null });
      e.preventDefault();
    },
    onPointerMove: (e) => {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId || d.cancelled) return;
      d.to = dbuDropTarget(listRef.current, d.key, e.clientY, true);
      const onto = d.to && d.to.pair ? flat.find((f) => f.key === d.to.pair) : null;
      setDrag({ key: d.key, dy: e.clientY - d.y0, line: d.to && !d.to.pair ? d.to.y : null,
        pair: onto ? { y: d.to.y, h: d.to.h, name: String(onto.row.name || "").trim() || "this move" } : null });
    },
    onPointerUp: (e) => {
      const d = dragRef.current;
      if (!d || d.id !== e.pointerId) return;
      endDrag();
      dbuRelease(e, e.pointerId);
      if (!d.to || d.cancelled) return;
      if (d.to.pair) pairOnto(d.key, d.to.pair); else move(d.key, d.to);
    },
    onPointerCancel: (e) => { const d = dragRef.current; if (d && d.id === e.pointerId) endDrag(); },
    onLostPointerCapture: (e) => { const d = dragRef.current; if (d && d.id === e.pointerId) endDrag(); },
  });

  // Superset by drop: the dragged move pairs with the one it was let go on.
  const pairOnto = (key, targetKey) => {
    const out = dbuPairByDrop(day, key, targetKey);
    if (out.error) { setSay(out.error); return; }
    if (out.day === day) return;
    onChange(out.day);
    const a = flat.find((f) => f.key === key), b = flat.find((f) => f.key === targetKey);
    const nm = (x) => String((x && x.row.name) || "").trim() || "The exercise";
    setSay(nm(a) + " and " + nm(b) + " are superset " + out.letter + ".");
  };
  const duplicate = (x) => {
    setBlock(x.bi, { ...blocks[x.bi], rows: [...blocks[x.bi].rows.slice(0, x.ri + 1), { ...JSON.parse(JSON.stringify(x.row)), id: crypto.randomUUID() }, ...blocks[x.bi].rows.slice(x.ri + 1)] });
    setSay((String(x.row.name || "").trim() || "The exercise") + " duplicated.");
  };
  const applyDraft = (mode, dDay) => {
    const drafted = (dDay.blocks || []).filter((b) => (b.rows || []).length).map((b) => ({ kind: b.kind, rows: b.rows }));
    const count = drafted.reduce((n, b) => n + b.rows.length, 0);
    if (!count) return;
    const replace = mode === "replace" || !flat.length;
    const nextBlocks = replace ? drafted : dbuMergeDraft(blocks, drafted);
    // The draft's name only replaces a placeholder ("Day 2", or nothing) — never a name the
    // coach chose.
    const placeholder = !String(day.name || "").trim() || /^day\s*\d+$/i.test(String(day.name).trim());
    const next = { ...day, ...(placeholder && dDay.name ? { name: dDay.name } : {}), blocks: nextBlocks };
    aiUndo.current = { before: day, after: JSON.stringify(next.blocks) };
    onChange(next);
    const first = drafted[0].rows[0];
    if (first && first.id != null) setSelKey(String(first.id));
    setAiOpen(false);
    setSay((replace ? "Day replaced with the draft: " : "Draft added: ") + count + (count === 1 ? " exercise." : " exercises.") + " Undo draft is under the list.");
  };
  const canUndoDraft = !!aiUndo.current && aiUndo.current.after === JSON.stringify(day.blocks || []);
  const undoDraft = () => {
    const u = aiUndo.current;
    if (!u) return;
    aiUndo.current = null;
    onChange(u.before);
    setSay("Draft undone.");
  };
  // Removing a move selects its neighbour and puts focus on it, so neither the detail nor
  // the keyboard is left pointing at nothing.
  const remove = (x) => {
    const i = flat.findIndex((f) => f.key === x.key);
    const next = flat[i + 1] || flat[i - 1] || null;
    setBlock(x.bi, { ...blocks[x.bi], rows: blocks[x.bi].rows.filter((_, ri) => ri !== x.ri) });
    setSelKey(next ? next.key : "");
    focusNext.current = next ? { key: next.key, cell: "name" } : { add: true };
    setSay((String(x.row.name || "").trim() || "The exercise") + " removed.");
  };

  // ⚠ A SUPERSET IS A BRACKET (step 6c): its first move carries "Superset A · 3 rounds, rest 90s
  // after A2", every move but the last reads "→ A2" where its rest would be, and the last keeps
  // the rest the round takes. Read off the flat list, so the labels are the member card's.
  const ssOf = (x) => dbuGroupOf(x.row);
  const pairInfo = {};
  flat.forEach((x, i) => {
    const g = ssOf(x);
    if (!g) return;
    const members = flat.filter((y) => ssOf(y) === g);
    if (members.length < 2) return;
    const at = members.indexOf(x), last = members[members.length - 1];
    const info = {};
    if (at < members.length - 1) info.restTo = members[at + 1].label;
    if (at === 0) {
      const b = DashBuilder.supersetBracket(day, g);
      info.bracket = "Superset " + g + (b && b.rounds ? " · " + b.rounds + (b.rounds === 1 ? " round" : " rounds") : "")
        + (b && b.rest ? ", rest " + b.rest + " after " + last.label : ", no rest after " + last.label);
    }
    pairInfo[x.key] = info;
  });
  return (
    <div className="dday">
      <DbuDayChips day={day} onChange={onChange} onWeekday={onWeekday} takenBy={takenBy} playlists={playlists} clips={clips} onUploading={onUploading} />
      <DbuSessionTotals day={day} />
      <div className="dsplit lib">
        <div className="dmain">
          <div className="dlist" ref={listRef} data-dragging={drag ? "" : undefined} onDragOver={libOver} onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setLibLine(null); }} onDrop={libDrop}>
            <div className="dhd" aria-hidden="true"><span /><span /><span>Exercise</span><span>Sets × reps</span><span>Load</span><span>RPE</span><span>Tempo</span><span>Rest</span></div>
            {blocks.map((block, bi) => {
              const kl = dbuKindLabel(block.kind);
              const rows = flat.filter((x) => x.bi === bi);
              return (
                <div className="dblk" key={bi} role="group" aria-label={kl + " block"}>
                  <div className="dbk" data-bk={bi}>
                    <select className="kind" aria-label={"Block " + (bi + 1) + " type"} value={block.kind} onChange={(e) => setBlock(bi, { ...block, kind: e.target.value })}>
                      {DashBuilder.BLOCK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
                    </select>
                    <span className="rule" aria-hidden="true" />
                    {/* The library is open beside the list; this names the block it adds to and
                        puts the keyboard in its search. */}
                    <button type="button" className="dq" aria-pressed={addBi === bi} title={"The library adds to " + kl} onClick={() => { setAim(bi); if (libSearch.current) libSearch.current.focus(); }}>+ Exercise</button>
                    {blocks.length > 1 && <button type="button" className="dq" aria-label={"Remove the " + kl + " block"} title="Remove this block" onClick={() => write(blocks.filter((_, i) => i !== bi))}>×</button>}
                  </div>
                  {rows.length ? (
                    <div role="list" aria-label={kl}>
                      {rows.map((x) => (
                        <DbuRow key={x.key} row={x.row} label={x.label} rowKey={x.key} detailId={detailId}
                          selected={!!current && current.key === x.key} onSelect={() => select(x.key)}
                          dragging={!!drag && drag.key === x.key} dy={drag && drag.key === x.key ? drag.dy : 0}
                          handle={handleFor(x.key)} onRowKeyDown={onRowKey(x.key)} progress={progress[x.key] || ''} rpeProgress={rpeProgress[x.key] || ''}
                          restTo={(pairInfo[x.key] || {}).restTo || ''} bracket={(pairInfo[x.key] || {}).bracket || ''}
                          onChange={(next) => updateRow(x.key, next)} />
                      ))}
                    </div>
                  ) : <p className="dempty">Nothing here yet. Drag a move in from the library, or press + Exercise.</p>}
                </div>
              );
            })}
            {drag && drag.line != null && <div className="dline" style={{ top: drag.line }} aria-hidden="true" />}
            {libLine != null && <div className="dline" style={{ top: libLine }} aria-hidden="true" />}
            {drag && drag.pair && <div className="dpair" style={{ top: drag.pair.y, height: drag.pair.h }} aria-hidden="true"><span>Superset with {drag.pair.name}</span></div>}
            <DbuQuickAdd customMoves={customMoves} inputRef={addRef} blockLabel={dbuKindLabel((blocks[curBi] || { kind: "main" }).kind)}
              onAdd={(ex) => addRows(curBi, [DashBuilder.newRow(ex)], true)} />
          </div>
          {aiOpen && <DbuAiDraft live={live} clientId={clientId} hasRows={flat.length > 0} onApply={applyDraft} onClose={() => setAiOpen(false)} />}
          <div className="dfoot">
            <button type="button" className="dbtn ghost" onClick={() => write([...blocks, { kind: "accessory", rows: [] }])}>+ Block</button>
            <button type="button" className="dbtn ghost" aria-expanded={aiOpen} onClick={() => setAiOpen((o) => !o)}>✦ Draft with AI</button>
            {canUndoDraft && <button type="button" className="dbtn" onClick={undoDraft}>Undo draft</button>}
          </div>
          {current ? (
            <DbuRowDetail key={current.key} id={detailId} row={current.row} label={current.label} blockLabel={dbuKindLabel(blocks[current.bi].kind)}
              clips={clips} onUploading={onUploading} pair={dbuPairState(day, current.key)}
              progress={progress[current.key] || ''} rpeProgress={rpeProgress[current.key] || ''} rule={rule}
              onFollow={() => updateRow(current.key, ShapeWorkoutDocument.unpinned(current.row, 'load'))}
              onFollowRpe={() => updateRow(current.key, ShapeWorkoutDocument.unpinned(current.row, 'rpe'))}
              onChange={(next) => updateRow(current.key, next)}
              onPair={() => onChange(dbuTogglePair(day, current.key))}
              onDuplicate={() => duplicate(current)} onRemove={() => remove(current)} />
          ) : (
            <aside className="ddetail empty" aria-label="Exercise detail">
              <p>Add a move from the library, or type one in the last line and press Enter. Its per-set targets and demo open here.</p>
            </aside>
          )}
        </div>
        <DbuLibrary customMoves={customMoves} inDay={inDay} target={addKind} searchRef={libSearch}
          onAdd={(ex) => addRows(addBi, [DashBuilder.newRow(ex)], false)} />
      </div>
      <p className="sr" role="status" aria-live="polite">{say}</p>
    </div>
  );
}

// A saved playlist as the day's playlist picker lists it. ⚠ THE COLUMN IS `tracks`
// (coach_soundtracks, 2026-06-13-coach-soundtracks.sql). This read `track_count`, which no row
// has, so every playlist in the picker came with no count at all.
// Its saved link rides along for the Client view's chip (dclWithPlaylistLink); the day stores id, name
// and meta only (DbuDayChips), never the link.
function dbuPlaylistChoice(x) {
  const n = Number(x && x.tracks);
  const url = x && typeof x.url === 'string' && x.url.trim() ? x.url.trim() : '';
  return { ...(x && x.id != null && x.id !== '' ? { id: x.id } : {}), name: x && x.name, meta: Number.isFinite(n) && n > 0 ? n + (n === 1 ? ' track' : ' tracks') : '', ...(url ? { url } : {}) };
}

function DbuDialog({title,onClose,busy,children}) {
  const ref=React.useRef(null), latest=React.useRef({onClose,busy});latest.current={onClose,busy};
  React.useEffect(()=>{
    const previous=document.activeElement;
    const node=ref.current;
    node?.focus();
    // ⚠ A COMPOSING IME OWNS ITS KEYSTROKES, AND THIS LISTENER IS THE ONE THAT
    // MATTERS. The picker's own Escape branch is a duplicate; THIS is the handler an
    // Escape bubbles up to, so without the guard, cancelling an IME candidate also
    // closed the dialog — throwing away every move ticked in the exercise picker,
    // whose `selected` lives nowhere else. Tab is guarded with it for the same reason:
    // while composing, it moves the candidate, not the focus ring.
    const key=e=>{if(dbuImeComposing(e))return;if(e.key==='Escape'&&!latest.current.busy){e.preventDefault();latest.current.onClose();}if(e.key==='Tab'){
      const items=[...node.querySelectorAll('button:not(:disabled),input:not(:disabled),select:not(:disabled),summary,[tabindex="0"]')].filter(x=>!x.hidden);
      const first=items[0],last=items[items.length-1];
      if(!first){e.preventDefault();node.focus();}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===node)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===node)){e.preventDefault();first.focus();}
    }};
    node.addEventListener('keydown',key);const old=document.body.style.overflow;document.body.style.overflow='hidden';
    return()=>{node.removeEventListener('keydown',key);document.body.style.overflow=old;if(previous?.isConnected)previous.focus();};
  },[]);
  return ReactDOM.createPortal(<div style={{position:'fixed',inset:0,zIndex:300,display:'grid',placeItems:'center',background:'rgba(10,10,8,.8)',padding:16}} onPointerDown={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}>
    <div ref={ref} role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} style={{width:'min(660px,100%)',maxHeight:'90vh',overflowY:'auto',boxSizing:'border-box',padding:22,background:'var(--sh-ground2, #14110e)',color:'var(--sh-ink, #f2ede4)',border:'1px solid rgba(var(--sh-ink-rgb, 242,237,228),.2)',borderRadius:8,fontFamily:"var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)"}}>{children}</div>
  </div>,document.body);
}

function DbuFutureUpdates({template,clients,onClose}) {
  const [rows,setRows]=React.useState(null),[picked,setPicked]=React.useState({}),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false),[done,setDone]=React.useState(false),[skipped,setSkipped]=React.useState(0);
  React.useEffect(()=>{let on=true;const date=new Date();const today=date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');fetch('/api/coach/plans/assignments?id='+encodeURIComponent(template.id)+'&today='+today,{credentials:'same-origin'}).then(async res=>{const data=await res.json();if(!res.ok)throw new Error(data.error||'Could not load assignments.');if(on){setRows(data.assignments||[]);setSkipped(data.skipped||0);}}).catch(e=>{if(on)setError(e.message);});return()=>{on=false;};},[template.id]);
  const selected=(rows||[]).filter(r=>picked[r.id]);
  const apply=async()=>{
    setBusy(true);setError('');let completed=0;
    try{
      for(const clientId of [...new Set(selected.map(r=>r.clientId))]){
        for(const week of DashBuilder.groupAssignmentWeeks(selected.filter(r=>r.clientId===clientId))){
          const res=await fetch('/api/trainer/workout',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({clientIds:[clientId],assignmentPreconditions:week.rows.map(r=>r.before),sessions:week.rows.map(r=>({title:r.title,description:r.description,kind:'template',scheduledDate:r.scheduledDate,payload:r.payload}))})});
          const data=await res.json();if(!res.ok)throw new Error(data.error||'Update failed.');completed+=week.rows.length;
          setPicked(prev=>{const next={...prev};week.rows.forEach(r=>delete next[r.id]);return next;});
          setRows(prev=>prev.filter(r=>!week.rows.some(x=>x.id===r.id)));
        }
      }
      setDone(true);
    }catch(e){setError((completed?completed+' workouts updated. ':'')+e.message);}finally{setBusy(false);}
  };
  const summary=e=>[e.sets&&e.reps?e.sets+' × '+e.reps:'',e.load,e.rest,e.tempo&&e.tempo+' tempo',e.cue,e.video?'Demo attached':''].filter(Boolean).join(' · ');
  return <DbuDialog title="Update future workouts" onClose={onClose} busy={busy}><h2>Update future workouts</h2><p style={{fontSize:13,lineHeight:1.5}}>Choose the upcoming prescriptions to replace with this saved template. Dates stay the same. Today's workouts and logged sessions are excluded. Clients already training keep the prescription with which they started.</p>
    {skipped>0&&<p style={{fontSize:13}}>{skipped} assignments with logged work, removed days or client overrides need individual review.</p>}
    {rows===null&&!error&&<p role="status">Loading upcoming workouts…</p>}
    {rows?.length===0&&<p>{done?'Selected workouts updated.':'No eligible future assignments.'}</p>}
    {(rows||[]).map(r=><div key={r.id} style={{borderTop:'1px solid rgba(var(--sh-ink-rgb, 242,237,228),.15)',padding:'12px 0'}}><label style={{display:'flex',gap:10,alignItems:'center'}}><input type="checkbox" disabled={busy} checked={!!picked[r.id]} onChange={e=>setPicked({...picked,[r.id]:e.target.checked})}/><span>{clients.find(c=>c.profile.id===r.clientId)?.profile.name||'Client'} · {r.scheduledDate} · {r.title}</span></label><details style={{margin:'8px 0 0 24px'}}><summary>Review changes</summary><div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:14,fontSize:12}}><div><strong>Current</strong><p>{r.before.title}</p>{r.before.exercises.map((e,i)=><p key={i}><b>{e.name}</b><br/>{summary(e)}</p>)}</div><div><strong>Updated</strong><p>{r.title}</p>{r.payload.exercises.map((e,i)=><p key={i}><b>{e.name}</b><br/>{summary(e)}</p>)}</div></div></details></div>)}
    {error&&<p role="alert" style={{color:'var(--sh-rust, #e0644b)'}}>{error}</p>}
    <div style={{display:'flex',gap:10,marginTop:16}}><button disabled={busy||!selected.length} onClick={apply} style={dbuBtn(true)}>{busy?'Updating…':'Update '+selected.length+' workouts'}</button><button disabled={busy} onClick={onClose} style={dbuBtn(false)}>Close</button></div>
  </DbuDialog>;
}

// ── Assigning: one publish path, two places to start it ─────────────────────
// The Assign sheet (the library's Assign, the single workout's) and the program builder's own
// Assign panel (step 6c: "Assign on the same screen") both publish through `useDbuAssign`, so the
// two cannot drift on what a partial publish means or who is read again afterwards.
// `onAssigned(ids)`: the clients something was published for, so the page reads who is on what again
// (Codex on #2645); it fires on a partial publish too, since those weeks are live.
function useDbuAssign({ template, doc, live, onAssigned }) {
  const [state, setState] = React.useState("");
  // ⚠ The guardrail's REASON, kept. A 409 is the gate holding the week and it
  // carries the sentence the coach has to act on ("this is a 40% jump on
  // her last four weeks"); a fixed "try again" is advice that can never work,
  // because retrying an unchanged week returns the same 409 forever.
  const [errMsg, setErrMsg] = React.useState("");
  // Resolves true once every week has published (or, signed out, the queue is marked).
  const assign = async (ids, startDate, meta) => {
    const tpl = meta || template;
    if (!ids.length || state === "working" || state === "done") return false;
    setState("working");
    setErrMsg("");
    let rows;
    try { rows=DashBuilder.buildAssignmentRows((meta && meta.doc) || doc, tpl, startDate); if(!rows.length || rows.some(r=>!r.payload.exercises.length))throw new Error("Add exercises to each training day before assigning."); } catch(e){setErrMsg(e.message);setState("error");return false;}
    // Weeks publish one at a time, so a failure partway through leaves the
    // earlier weeks LIVE. Counting them is the difference between "nothing
    // happened" and "three weeks landed and week four was held" — and only the
    // second is true.
    let landed = 0;
    let totalWeeks = 0;
    // The clients a week landed for, read from each answer's per-client results: a publish to
    // several clients can answer 409 with some of them accepted (Codex on #2645), and those clients'
    // weeks are live, so the page must read them again.
    const landedFor = new Set();
    const noteLanded = (d) => { for (const r of (d && Array.isArray(d.results) ? d.results : [])) { if (r && r.clientId && (r.status === "accepted" || r.status === "already_delivered")) landedFor.add(String(r.clientId)); } };
    try {
      if (live) {
        // ⚠ ONE PUBLISH PER WEEK, not per session. The boundary evaluates and
        // replaces a whole client-week, so sending sessions one at a time
        // republishes the same week once per session — ~36 publishes and ~36
        // telemetry rows for a 12-week program, which skews §10.2's flag-rate
        // denominators by counting one authoring act as 36. Grouping is in
        // dashBuilderCore (pure + tested) because a session bucketed into the
        // wrong week is judged against the wrong load and lands in a replace
        // that clears a week it was never part of.
        const weekGroups = DashBuilder.groupAssignmentWeeks(rows);
        totalWeeks = weekGroups.length;
        for (const wk of weekGroups) {
          const res = await fetch("/api/trainer/workout", {
            method: "POST", credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              clientIds: ids,
              sessions: wk.rows.map((row) => ({
                title: row.title, description: tpl.name, kind: "template",
                scheduledDate: row.scheduledDate, payload: row.payload,
              })),
            }),
          });
          // A 409 is the progression guardrail HOLDING the week, not a fault —
          // it carries the reason in `error`, and throwing "HTTP 409" would
          // strip exactly the sentence the coach needs to act on.
          const d = await res.json().catch(() => ({}));
          noteLanded(d);
          if (!res.ok) throw new Error(d.error || ("HTTP " + res.status));
          landed += 1;
        }
      }
      // Plan written → those clients leave the programming queue for this week.
      try {
        const m = new Date(); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
        const key = "shape.dashQueueDone." + m.getFullYear() + "-" + String(m.getMonth() + 1).padStart(2, "0") + "-" + String(m.getDate()).padStart(2, "0");
        const done = new Set(JSON.parse(localStorage.getItem(key) || "[]"));
        ids.forEach((id) => done.add(id));
        localStorage.setItem(key, JSON.stringify([...done]));
      } catch (e) {}
      setState("done");
      if (live && typeof onAssigned === "function") onAssigned(ids);
      return true;
    } catch (e) {
      if (live && (landed > 0 || landedFor.size) && typeof onAssigned === "function") onAssigned(landed > 0 ? ids : [...landedFor]);
      const reason = (e && e.message ? String(e.message) : "").trim();
      // Name what actually landed. Silence here reads as "nothing was written",
      // and the coach would re-assign the whole program on top of the weeks that
      // already published.
      const partial = landed > 0
        ? "First " + landed + " of " + totalWeeks + " week" + (totalWeeks === 1 ? "" : "s") + " published. "
        : "";
      setErrMsg(partial + (reason || "Couldn't assign — try again."));
      setState("error");
      return false;
    }
  };
  return { state, errMsg, assign, reset: () => { setState(""); setErrMsg(""); } };
}
// A guardrail reason is a SENTENCE, so it gets a line to be read on — out of the button row,
// where a long one would wrap the actions apart. role=alert because this is the one thing on the
// screen the coach must not miss.
function DbuAssignError({ msg }) {
  return (
    <div role="alert" style={{ marginTop: 12, borderLeft: "3px solid " + DBU_RUST, paddingLeft: 11 }}>
      <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Publish stopped</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--sh-ink, #f2ede4)", marginTop: 3 }}>{msg}</div>
    </div>
  );
}

// ── Assign modal — multi-client + start date; marks the programming queue ───
// `emptyNote` is what an empty client list means, from the library page (step 6a): a roster that
// could not be read says so, and only a read, empty roster reads "No clients yet."
function DbuAssignModal({ template, doc, clients, queue, live, preselectId, onClose, emptyNote, onAssigned }) {
  // ⚠ ONE CLOSE PER SHEET (Codex on #2645). A finished assign closes itself a moment later; a coach
  // who closes it first (Cancel, the scrim, Esc) used to get a second close when the timer fired, and
  // the library's Assign all stepped past the next client. The first close wins, and the timer goes
  // with the sheet.
  const closedRef = React.useRef(false);
  const closeTimer = React.useRef(null);
  React.useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const close = () => {
    if (closedRef.current) return;
    closedRef.current = true;
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
    onClose();
  };
  const [picked, setPicked] = React.useState(() => preselectId ? { [preselectId]: true } : {});
  React.useEffect(() => { if (preselectId) setPicked((prev) => ({ ...prev, [preselectId]: true })); }, [preselectId]);
  const [startDate, setStartDate] = React.useState(() => dbuNextMonday());
  const { state, errMsg, assign: publish } = useDbuAssign({ template, doc, live, onAssigned });
  const queueState = (id) => { const q = (queue || []).find((r) => r.client.profile.id === id); return q ? q.state : null; };
  const dayCount = doc.weeks.reduce((s, w) => s + w.days.length, 0);
  const ids = Object.keys(picked).filter((k) => picked[k]);
  const assign = async () => { if (await publish(ids, startDate)) closeTimer.current = setTimeout(close, 1100); };

  return (
    <DbuDialog title="Assign workout" onClose={close} busy={state === "working"}>
        <div style={{ fontFamily: DBU_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Assign · {template.name}</div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 23, margin: "6px 0 4px" }}>Put clients on it.</div>
        <div style={{ fontSize: 12, color: DBU_INK50, marginBottom: 14 }}>{doc.weeks.length} week{doc.weeks.length === 1 ? "" : "s"} · {dayCount} days · snapshot v{doc.version} — your later template edits won't change what they get.</div>
        <span style={dbuLabel}>Start date</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dbu-field" style={{ ...dbuField, marginBottom: 12 }} />
        <details style={{marginBottom:12}}><summary>Preview scheduled workouts</summary>{DashBuilder.buildAssignmentRows(doc,template,startDate || '2000-01-01').map((r,i)=><p key={i} style={{fontSize:12}}>{r.scheduledDate} · {r.title} · {r.payload.exercises.length} exercises</p>)}</details>
        <span style={dbuLabel}>Clients</span>
        <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.08)", borderRadius: 6, padding: "2px 10px", marginBottom: 14 }}>
          {clients.map((c) => {
            const id = c.profile.id;
            const qs = queueState(id);
            return (
              <label key={id} style={{ display: "grid", gridTemplateColumns: "auto 1fr auto", gap: 10, alignItems: "center", padding: "8px 0", borderTop: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.05)", cursor: "pointer" }}>
                <input type="checkbox" checked={!!picked[id]} onChange={(e) => setPicked({ ...picked, [id]: e.target.checked })} />
                <span style={{ fontSize: 13 }}>{c.profile.name}</span>
                {qs && <DashPill c={qs === "ready" ? "var(--sh-accent, #2ee0c4)" : "var(--sh-gold, #d8a23a)"}>{qs === "ready" ? "Ready" : "Awaiting check-in"}</DashPill>}
              </label>
            );
          })}
          {!clients.length && <div role="status" style={{ fontSize: 12, color: DBU_INK50, padding: 8 }}>{emptyNote || "No clients loaded."}</div>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={assign} disabled={!ids.length || state === "working"} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff", padding: "11px 18px", opacity: !ids.length || state === "working" ? 0.6 : 1 }}>
            {state === "working" ? "Assigning…" : state === "done" ? "Assigned ✓" : "Publish to " + (ids.length || 0) + " client" + (ids.length === 1 ? "" : "s")}
          </button>
          <button disabled={state === "working"} onClick={close} style={dbuBtn(false)}>Cancel</button>
          {!live && <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>DEMO · marks the queue only</span>}
        </div>
        {state === "error" && <DbuAssignError msg={errMsg} />}
    </DbuDialog>
  );
}

// ── Assign on the program's own screen ──────────────────────────────────────
// Step 6c: "The five clients on it now with Update theirs, then add-client gems in their colours,
// a start date and one button: Assign to Sam and Nadia. Each gets a copy." Who is on it now is the
// usage read's (`/api/coach/plans/usage`, the library's own), never a sample; "Update theirs" is the
// library's Update future assignments (`/api/coach/plans/assignments`). Each person wears their
// tier mark (`DashClientGem`, hollow when the tier is unknown), with the name in words.
function dbuNameList(names) {
  if (names.length <= 1) return names[0] || "";
  if (names.length > 3) return names.slice(0, 2).join(", ") + " and " + (names.length - 2) + " more";
  return names.slice(0, -1).join(", ") + " and " + names[names.length - 1];
}
function DbuAssignPanel({ panelRef, template, doc, clients, usage, live, persisted, preselectId, emptyNote, onAssigned, onUpdateTheirs, beforeAssign }) {
  const [picked, setPicked] = React.useState(() => (preselectId ? { [preselectId]: true } : {}));
  const [startDate, setStartDate] = React.useState(() => dbuNextMonday());
  const { state, errMsg, assign, reset } = useDbuAssign({ template, doc, live, onAssigned });
  const u = usage || { state: "idle" };
  const entry = u.state === "ready" && template.id && Object.prototype.hasOwnProperty.call(u.map, template.id) ? u.map[template.id] : null;
  const who = u.state === "ready" ? DashBuilder.programWho(entry, clients) : null;
  const onIds = new Set(((who && who.people) || []).map((p) => String(p.id)));
  const others = (clients || []).filter((c) => c && c.profile && !onIds.has(String(c.profile.id)));
  const ids = Object.keys(picked).filter((k) => picked[k]);
  const names = ids.map((id) => ((clients || []).find((c) => String(c.profile.id) === id) || { profile: { name: "a client" } }).profile.name);
  const gem = (p) => (typeof DashClientGem === "function" ? <DashClientGem points={p.rankPoints} title={p.name} /> : null);
  let now;
  if (!live) now = <span className="dash-lib-quiet">Preview · no client calendars to read</span>;
  else if (!persisted) now = <span className="dash-lib-quiet">No clients yet · it saves before it assigns</span>;
  else if (u.state !== "ready") now = <span className="dash-lib-quiet">{u.state === "error" ? "Couldn’t read who’s on it" : "Checking who’s on it…"}</span>;
  else if (!who.count) now = <span className="dash-lib-quiet">{u.capped ? "None found on the calendars read" : "No clients yet"}</span>;
  else if (!who.people) now = <span>{who.count + (u.capped ? "+ clients" : who.count === 1 ? " client" : " clients")}</span>;
  else now = <>
    <ul className="das-on">{(who.people || []).map((p) => <li key={p.id}>{gem(p)}<b>{p.name}</b></li>)}
      {who.count > (who.people || []).length && <li className="dash-lib-quiet">{(who.people || []).length ? "and " : ""}{who.count - (who.people || []).length} not on your roster</li>}</ul>
    {typeof onUpdateTheirs === "function" && <button type="button" className="das-b" onClick={onUpdateTheirs}>Update theirs</button>}
  </>;
  const go = async () => {
    if (!ids.length || state === "working") return;
    const meta = beforeAssign ? await beforeAssign() : template;
    if (!meta) return;
    if (await assign(ids, startDate, meta)) setPicked({});
  };
  return (
    <section className="das" ref={panelRef} tabIndex={-1} aria-label="Assign this program">
      <h3 className="das-h">Assign</h3>
      <div className="das-row"><span className="das-l">On it now</span><div className="das-v">{now}</div></div>
      <div className="das-row"><span className="das-l">Add clients</span><div className="das-v">
        {others.length ? <div className="das-gems" role="group" aria-label="Clients to assign">{others.map((c) => {
          const on = !!picked[c.profile.id];
          return <button key={c.profile.id} type="button" className="das-gem" aria-pressed={on} onClick={() => { if (state === "done" || state === "error") reset(); setPicked({ ...picked, [c.profile.id]: !on }); }}>
            {gem({ rankPoints: c.rankPoints, name: c.profile.name })}<span>{c.profile.name}</span>{on && <span aria-hidden="true">✓</span>}
          </button>;
        })}</div> : <span className="dash-lib-quiet" role="status">{clients && clients.length ? "Everyone on your roster is on it." : emptyNote || "No clients loaded."}</span>}
      </div></div>
      <div className="das-row"><span className="das-l">Start</span><div className="das-v">
        <input type="date" aria-label="Start date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="dbu-field das-date" />
        <span className="dash-lib-quiet">Each gets their own copy: later edits here don’t change it.</span>
      </div></div>
      <div className="das-go">
        <button type="button" style={{ ...dbuBtn(true, DBU_RUST), color: "#fff" }} disabled={!ids.length || state === "working"} onClick={go}>
          {state === "working" ? "Assigning…" : state === "done" ? "Assigned ✓" : ids.length ? "Assign to " + dbuNameList(names) : "Pick clients to assign"}
        </button>
        {!live && <span className="das-demo">Preview · marks the queue only</span>}
      </div>
      {state === "error" && <DbuAssignError msg={errMsg} />}
    </section>
  );
}

// ── The builder (the canvas · the day editor docked under it · a floating client preview) ──
// ── The two canvases ─────────────────────────────────────────────────────────
// ⚠ ONE DOCUMENT, TWO VIEWS, READ IN OPPOSITE DIRECTIONS — which is why this is a switch
// and not one stacked page. Grid answers WHEN (rows are weeks, columns are weekdays); Sheet
// answers HOW MUCH (rows are exercises, columns are weeks, so the progression reads left to
// right). The board measured the stacked alternative at 1,439px against the grid's 1,115px,
// showing the same session twice.
//
// Every rule below is the approved artboard's own (`.ab2 .wg`, `.ab2 .sh`, `.ab2 .seg`), not
// a re-interpretation of it.

// The two views, NAMED ONCE. The switch renders from this table and the remembered
// choice validates against its keys, so a view can never exist in one and not the other:
// `useRememberedChoice` silently ignores a stored value outside its allow-list, which on
// screen reads as "the switch forgot what I picked" rather than as a missing entry.
const DBU_VIEWS = [
  { key: "plan", glyph: "▦", label: "Plan" },
  { key: "sheet", glyph: "▤", label: "Sheet" },
];
const DBU_VIEW_KEYS = DBU_VIEWS.map((v) => v.key);

// The view switch — the board's `.seg`.
function DbuViewSwitch({ view, setView }) {
  return (
    <div className="seg" role="group" aria-label="Builder view">
      {DBU_VIEWS.map(({ key, glyph, label }) => (
        <button key={key} type="button" onClick={() => setView(key)} aria-pressed={view === key} title={label + " view"}>
          <i aria-hidden="true">{glyph}</i>{label}
        </button>
      ))}
    </div>
  );
}

// ── The plan — weeks across, training days down ─────────────────────────────
// ⚠ IT REPLACES THE MON–SUN GRID (the owner's coach review, step 6c: "A calendar where most cells
// say Rest"). Weeks were rows and the seven weekdays columns, so Strength Block 3 drew 14 cells and
// 10 said "Rest · ＋ Add session", and 12 weeks would draw 84. Now each week is a column, each row
// a weekday the program trains on, and a strip of seven letters under each week's heading shows
// its training days: a rest letter adds a session on that day, and a training letter peeks at it.
// Every session card carries that week's loads with the change on last week ("Back squat 260 ▲5",
// `DashBuilder.sessionLoadLines`), so the progression shows on the plan, and a click PEEKS at the
// full session, with Open in builder, rather than navigating away.
// A deload week from before the progression that its cadence does not name: the coach can
// take its flag off. A week the cadence names is a deload either way.
const dbuLegacyOff = (rule, w, wi) => !!(rule && rule.deloadEvery) && ShapeWorkoutDocument.legacyDeload(w) && (wi + 1) % rule.deloadEvery !== 0;
const DBU_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
// A saved session a tray drag carries (`DbuTray`), read by the plan's drop.
const dbuTrayDrag = { current: null };
// The weekdays the plan draws a row for: every weekday any week trains on, Monday first.
function dbuPlanWeekdays(doc) {
  const on = new Set();
  (doc.weeks || []).forEach((w) => (w.days || []).forEach((d) => { if (dbuHasWeekday(d)) on.add(d.weekday); }));
  return [...on].sort((a, b) => a - b);
}
const dbuDelta = (l) => (l.delta ? (l.delta > 0 ? "▲" : "▼") + Math.abs(l.delta) : "");
function DbuPlan({ doc, dates, peek, onPeek, setWeeks, uploads, onWeek, onAddAt, onPlace }) {
  const dragRef = React.useRef(null);
  const rule = ShapeWorkoutDocument.normalizeProgression(doc.progression);
  const cadence = !!(rule && rule.deloadEvery);
  const weeks = doc.weeks || [];
  const rows = dbuPlanWeekdays(doc);
  const weekStart = (wi) => ((weeks[wi].days || []).map((_, di) => dates[wi + ":" + di]).filter(Boolean).sort()[0] || "");
  // ⚠ A DROP SWAPS, IT DOES NOT OVERWRITE. Measured on a Mon/Wed/Fri week, dragging Mon onto
  // the POPULATED Wed cell: 3 of 3 sessions visible becomes 2 of 3, silently. That drop is
  // the ordinary same-week case and it passes the `f.wi === wi` guard, so the guard is not
  // what protects it. The rule itself is `dbuAssignWeekday`, shared with the day editor's
  // Training-day select, so the two controls cannot drift into two answers.
  // ⚠ AND THE `f.wi === wi` GUARD IS ON EVERY TARGET: `moveTo` only ever edits week `f.wi`, so
  // dragging a Week 1 session onto a free day of Week 3 used to leave it in Week 1 and silently
  // change its WEEKDAY there — the drop target the coach aimed at was ignored. (CodeRabbit,
  // #2143.) Moving a day BETWEEN weeks is a feature, not this fix; registered.
  // ⚠ ONE DROP HANDLER FOR EVERY TARGET (a session, a free slot, a rest letter), so the targets
  // cannot drift apart again. A session from the tray lands only on a free day.
  const moveTo = (wi, di, weekday) => setWeeks(weeks.map((w, i) => (i === wi ? dbuAssignWeekday(w, di, weekday) : w)));
  const drop = (wi, wd) => {
    const f = dragRef.current, t = dbuTrayDrag.current;
    dragRef.current = null; dbuTrayDrag.current = null;
    if (uploads) return;
    if (t) { onPlace(t, wi, wd); return; }
    if (f && f.wi === wi) moveTo(f.wi, f.di, wd);
  };
  const dayAt = (w, wd) => (w.days || []).findIndex((d) => dbuHasWeekday(d) && d.weekday === wd);
  return (
    <div className="scroll">
      <div className="dpl" style={{ gridTemplateColumns: "88px repeat(" + weeks.length + ", minmax(176px, 1fr))", minWidth: 88 + weeks.length * 184 }}>
        <div className="rl" />
        {weeks.map((w, wi) => (
          <div className={"wkh" + (w.deload ? " dl" : "")} key={"h" + wi}>
            <div className="wkt"><b>Week {wi + 1}</b><span>{dbuDayMonth(weekStart(wi)) || "—"}</span>{w.deload && <span className="chip gold">Deload −40%</span>}</div>
            {/* ⚠ Every week tool the retired tree carried, kept — except Progress, which step 3
                retired with the per-move checkbox it read. Under a deload cadence the bar owns
                which weeks deload, so the week's own Deload says so instead of fighting it; a
                deload week saved before the cadence keeps its flag the coach's to clear. */}
            <span className="tools">
              <button type="button" onClick={() => onWeek("duplicate", wi)} title={cadence ? "Copy this week. The progression sets its loads" : "Copy this week unchanged"}>Copy</button>
              <button type="button" onClick={() => onWeek("deload", wi)} aria-pressed={!!w.deload} disabled={cadence && !dbuLegacyOff(rule, w, wi)}
                title={cadence ? (dbuLegacyOff(rule, w, wi) ? "Deloaded before the progression. Press to take the deload off; its sets stay as they are" : "The progression sets the deload weeks") : "Deload: −40% volume, then edit freely"}>Deload</button>
              {weeks.length > 1 && <button type="button" onClick={() => onWeek("remove", wi)} aria-label={"Remove week " + (wi + 1)}>×</button>}
            </span>
            <div className="wst" role="group" aria-label={"Week " + (wi + 1) + " training days"}>
              {DBU_LETTERS.map((letter, wd) => {
                const di = dayAt(w, wd);
                return di >= 0
                  ? <button type="button" key={wd} className="on" aria-label={DBU_DOW_FULL[wd] + ", week " + (wi + 1) + ": " + w.days[di].name}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => drop(wi, wd)}
                      onClick={() => onPeek(wi, di)}>{letter}</button>
                  : <button type="button" key={wd} aria-label={"Add a session on " + DBU_DOW_FULL[wd] + " of week " + (wi + 1)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => drop(wi, wd)}
                      onClick={() => onAddAt(wi, wd)}>{letter}</button>;
              })}
            </div>
          </div>
        ))}
        {rows.map((wd) => (
          <React.Fragment key={wd}>
            <div className="rl">{DBU_DOW_FULL[wd]}</div>
            {weeks.map((w, wi) => {
              const di = dayAt(w, wd);
              if (di < 0) return (
                <button type="button" key={wi} className="ses empty" aria-label={"Add a session on " + DBU_DOW[wd] + " of week " + (wi + 1)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(wi, wd)}
                  onClick={() => onAddAt(wi, wd)}><span aria-hidden="true">＋</span></button>
              );
              const day = w.days[di];
              const moves = dbuMoves(day);
              const lines = DashBuilder.sessionLoadLines(doc, wi, di, 3);
              const on = peek && peek.w === wi && peek.d === di;
              return (
                <button type="button" key={wi} className={"ses" + (on ? " on" : "") + (w.deload ? " dl" : "")} draggable={!uploads} aria-expanded={!!on}
                  onDragStart={(e) => { if (uploads) { e.preventDefault(); return; } dragRef.current = { wi, di }; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => drop(wi, wd)}
                  onClick={() => onPeek(wi, di)}>
                  <span className="d">{dbuDayMonth(dates[wi + ":" + di]) || "—"}</span>
                  <b>{day.name}</b>
                  <span className="m">{moves} {moves === 1 ? "move" : "moves"}{day.playlist ? " · ♪" : ""}</span>
                  {lines.filter((l) => l.weight).map((l, k) => (
                    <span className="ln" key={k}><span className="n">{l.name}</span>
                      <span className="v">{l.weight.replace(/ (kg|lb)$/, "")}{dbuDelta(l) && <> <i aria-hidden="true">{dbuDelta(l)}</i><span className="sr">{", " + (l.delta > 0 ? "up " : "down ") + Math.abs(l.delta) + (l.unit === "%" ? "%" : " " + l.unit) + " on last week"}</span></>}</span>
                    </span>
                  ))}
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {!rows.length && <p className="dmsg">No sessions yet. Press a letter under a week to add one.</p>}
    </div>
  );
}

// One move as the whiteboard writes it: "4 × 5 @ 255 lb · RPE 8 · 3-1-X-1 · 2:30".
function dbuWhiteboard(row) {
  const W = ShapeWorkoutDocument, l = W.ladder(row);
  const reps = l ? l.reps : W.repsLabel(row);
  const weight = l ? l.weight : W.weightLabel(row);
  const head = [row.sets, reps].filter((x) => String(x ?? "").trim() !== "").join(" × ");
  return [head + (weight ? " @ " + weight : ""), row.rpe !== "" && row.rpe != null ? "RPE " + row.rpe : "", row.tempo, row.rest].filter((x) => String(x || "").trim()).join(" · ");
}
// The peek: the whole session, read-only, with the one way into it.
function DbuPeek({ doc, wi, di, dates, onOpen, onClose }) {
  const w = doc.weeks[wi], day = w && w.days[di];
  const ref = React.useRef(null);
  React.useEffect(() => { if (ref.current) ref.current.focus(); }, [wi, di]);
  if (!day) return null;
  const labels = DashBuilder.rowLabels(day);
  let k = 0;
  return (
    <section className="dpeek" ref={ref} tabIndex={-1} aria-label={"Session · " + day.name}
      onKeyDown={(e) => { if (e.key === "Escape" && !dbuImeComposing(e.nativeEvent)) { e.preventDefault(); e.stopPropagation(); onClose(); } }}>
      <div className="pk-hd">
        <div><div className="when">Week {wi + 1} of {doc.weeks.length}{dates[wi + ":" + di] ? " · " + dbuShortDate(dates[wi + ":" + di]) : ""}{w.deload ? " · Deload" : ""}</div><b>{day.name}</b></div>
        <span className="pk-acts">
          <button type="button" style={dbuBtn(true)} onClick={onOpen}>Open in builder</button>
          <button type="button" className="x" aria-label="Close the session" onClick={onClose}>×</button>
        </span>
      </div>
      {(day.blocks || []).filter((b) => (b.rows || []).length).map((b, bi) => (
        <div className="pk-b" key={bi}>
          <span className="kl">{dbuKindLabel(b.kind)}</span>
          <ul>{(b.rows || []).map((r, ri) => { const label = labels[k++]; return <li key={ri}><i>{label}</i><b>{String(r.name || "").trim() || "New exercise"}</b><span>{dbuWhiteboard(r)}</span></li>; })}</ul>
        </div>
      ))}
      {!dbuMoves(day) && <p className="dmsg">No moves yet. Open it in the builder to add some.</p>}
    </section>
  );
}

// ── Sessions you can drag in ────────────────────────────────────────────────
// Step 6c: "This program's sessions and saved days from your other programs, as cards in their
// program-type colours, replace 'Add a saved day…'." The colour is the program's first tag
// (`DashBuilder.tagInfo`), always with the tag in words beside it; an untagged program's cards
// say so. A card is dragged onto a free day of any week, or pressed to add it to the week being
// looked at (week 1 when none is).
function dbuTrayItems(doc, dayTemplates, selfId) {
  const own = [], seen = new Set();
  (doc.weeks || []).forEach((w) => (w.days || []).forEach((d) => {
    const key = dbuNameKey(d.name);
    if (!key || seen.has(key)) return;
    seen.add(key);
    own.push({ key: "own:" + key, name: d.name, day: d, tags: doc.tags, from: "This program" });
  }));
  const others = (dayTemplates || []).filter((x) => x && x.day && (!selfId || x.programId !== selfId))
    .map((x, i) => ({ key: "saved:" + i, name: x.dayName || x.name, day: x.day, tags: x.tags, from: x.program || "Saved day" }));
  return { own, others };
}
function DbuTray({ doc, dayTemplates, selfId, week, onAdd }) {
  const { own, others } = dbuTrayItems(doc, dayTemplates, selfId);
  if (!own.length && !others.length) return null;
  const card = (it) => {
    const tags = DashBuilder.normalizeTags(it.tags);
    const info = tags.length ? DashBuilder.tagInfo(tags[0]) : null;
    const n = dbuMoves(it.day);
    return (
      <button key={it.key} type="button" className="tray-c" draggable style={{ "--c": info ? info.c : DBU_LINE2 }}
        aria-label={"Add " + it.name + " to week " + (week + 1)}
        onDragStart={(e) => { dbuTrayDrag.current = it; try { e.dataTransfer.setData("text/plain", it.name); } catch (err) {} }}
        onDragEnd={() => { dbuTrayDrag.current = null; }}
        onClick={() => onAdd(it)}>
        <span className="tk">{info ? info.label : "No tag"}</span>
        <b>{it.name}</b>
        <small>{it.from} · {n} {n === 1 ? "move" : "moves"}</small>
      </button>
    );
  };
  return (
    <section className="dtray" aria-label="Sessions you can drag in">
      <div className="tray-h">Sessions <small>Drag one onto a free day, or press it to add it to week {week + 1}.</small></div>
      {!!own.length && <><div className="tray-g">This program</div><div className="tray-l">{own.map(card)}</div></>}
      {!!others.length && <><div className="tray-g">From your other programs</div><div className="tray-l">{others.map(card)}</div></>}
    </section>
  );
}

// ── The program's length, in one tap ────────────────────────────────────────
// Step 6c: "4, 6, 8 or 12 weeks, or Custom". Longer copies the last week into the weeks not written
// yet, and the progression sets their loads (`DashBuilder.resizeProgram`); shorter asks first when
// the weeks it drops hold any move.
const DBU_LENGTHS = [4, 6, 8, 12];
function DbuLength({ weeks, onLength }) {
  const custom = !DBU_LENGTHS.includes(weeks);
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(null);
  const apply = () => { const n = Math.floor(Number(text)); setText(null); if (Number.isFinite(n) && n >= 1 && n <= 52 && n !== weeks) onLength(n); };
  return (
    <div className="dlen" role="group" aria-label="Program length">
      <span className="dlen-l">Length</span>
      <span className="seg">
        {DBU_LENGTHS.map((n) => <button key={n} type="button" aria-pressed={weeks === n} onClick={() => { setOpen(false); if (weeks !== n) onLength(n); }}>{n}</button>)}
        <button type="button" aria-pressed={custom || open} onClick={() => setOpen(true)}>Custom</button>
      </span>
      {(custom || open) && <input type="number" min="1" max="52" aria-label="Program length in weeks" value={text != null ? text : String(weeks)}
        onFocus={() => setText(String(weeks))} onChange={(e) => setText(e.target.value)} onBlur={apply}
        onKeyDown={(e) => { if (dbuImeComposing(e.nativeEvent)) return; if (e.key === "Enter") { e.preventDefault(); apply(); } }} />}
      <span className="dlen-w">weeks</span>
    </div>
  );
}

// ── Sheet — exercises down, weeks across ─────────────────────────────────────
// ⚠ ROWS ARE KEYED BY POSITION (day · block · row), NOT BY EXERCISE NAME. The document is a
// grid by construction whenever a week was made with Copy or Progress, which is the normal
// flow; matching by name would silently merge two different moves sharing a name and split
// one that was renamed. Where a later week genuinely holds a DIFFERENT move at the same
// position, the cell prints that week's own name — the divergence is drawn, not hidden.
// A ladder written out ("100/107.5/110/115 kg") has no space to wrap at, so a week column
// on a phone (~105px) cut it off with an ellipsis: the one cell that exists to be read
// lost its last weights. A break opportunity after each slash lets it wrap there and
// nowhere mid-number; the text a reader copies is unchanged.
function dbuSlashBreaks(text) {
  const parts = String(text).split("/");
  return parts.map((p, i) => <React.Fragment key={i}>{i ? <>/<wbr /></> : null}{p}</React.Fragment>);
}
// ⚠ ONLY THE FIRST SEPARATOR SPLITS SETS FROM REPS. The Sheet's "sets × reps" box split on
// every × and every letter x and kept two pieces, and each keystroke rewrites both fields,
// so a row whose reps hold an x lost part of them as soon as the coach touched the cell:
// changing the sets of "3 × max" stored the reps "ma". The box always writes " × " between
// the two, so its first × is the boundary; a coach who types "3x10" has no ×, and then the
// first x is. Everything after the boundary is the reps, trimmed as before. A capital X is
// not a separator, as before.
function dbuSplitSetsReps(value) {
  const text = String(value ?? "");
  let at = text.indexOf("×");
  if (at === -1) at = text.indexOf("x");
  if (at === -1) return { sets: text.trim(), reps: "" };
  return { sets: text.slice(0, at).trim(), reps: text.slice(at + 1).trim() };
}

// Keep the focused text separate from the trimmed document. Otherwise the space
// after "10 " disappears on rerender before the coach can type "each".
function DbuSheetSetsReps({ row, label, onChange }) {
  const [draft, setDraft] = React.useState(null);
  return <input className="a" aria-label={label}
    value={draft ?? ((row.sets ?? "") + " × " + (row.reps ?? ""))}
    onFocus={(e) => setDraft(e.target.value)}
    onChange={(e) => { setDraft(e.target.value); onChange(dbuSplitSetsReps(e.target.value)); }}
    onBlur={() => setDraft(null)} />;
}

function DbuSheet({ doc, dates, setSel, setWeeks }) {
  const weeks = doc.weeks || [];
  const dayCount = weeks.reduce((n, w) => Math.max(n, (w.days || []).length), 0);
  // `value` is the fields to write, or a function of the row for an edit that removes one.
  const editRow = (di, bi, ri, wi, value) => setWeeks(weeks.map((w, i) => {
    if (i !== wi) return w;
    const day = (w.days || [])[di];
    if (!day || !(day.blocks || [])[bi] || !(day.blocks[bi].rows || [])[ri]) return w;
    return { ...w, days: w.days.map((d, j) => (j !== di ? d : { ...d, blocks: d.blocks.map((b, k) => (k !== bi ? b : { ...b, rows: b.rows.map((r, m) => (m !== ri ? r : typeof value === "function" ? value(r) : { ...r, ...value })) })) })) };
  }));
  // ⚠ A LOAD TYPED IN A LATER WEEK OF A MOVE THE PROGRESSION SETS IS PINNED, or the rule
  // would put its own number back on the next keystroke. The mark beside it takes the pin
  // off again, and the load returns to the rule's.
  const status = (wi, di, bi, ri) => ShapeWorkoutDocument.progressionStatus(doc, wi, di, bi, ri);
  const unpin = (r) => ShapeWorkoutDocument.unpinned(r, 'load');
  const mark = (st, name, wi, di, bi, ri) => (st === "follows" || st === "source")
    ? <span className="pg" title={DBU_PROGRESS_MARK[st][1]}><span aria-hidden="true">{DBU_PROGRESS_MARK[st][0]}</span><span className="sr">{DBU_PROGRESS_MARK[st][1]}</span></span>
    : st === "pinned"
      ? <button type="button" className="pg pin" title="Typed by hand. Press to follow the progression again" aria-label={"Follow the progression again, " + name + ", week " + (wi + 1)} onClick={() => editRow(di, bi, ri, wi, unpin)}>{DBU_PROGRESS_MARK.pinned[0]}</button>
      : null;
  return (
    <div className="scroll">
      <table className="sh" style={{ minWidth: 300 + weeks.length * 130 }}>
        <colgroup><col style={{ width: 300 }} />{weeks.map((_, i) => <col key={i} />)}</colgroup>
        <thead>
          <tr>
            <th>Exercise</th>
            {weeks.map((w, wi) => (
              <th key={wi}>
                Week {wi + 1}
                <small>{dbuShortDate(dates[wi + ":0"]) || "—"}</small>
                {w.deload && <span className="dl">Deload −40%</span>}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: dayCount }, (_, di) => {
            const base = weeks.find((w) => (w.days || [])[di]);
            const day = base ? base.days[di] : null;
            if (!day) return null;
            const moves = (day.blocks || []).reduce((n, b) => n + (b.rows || []).length, 0);
            const names = new Set(weeks.map((w) => ((w.days || [])[di] || {}).name).filter(Boolean));
            return (
              <React.Fragment key={di}>
                <tr className="band">
                  <td colSpan={weeks.length + 1}>
                    <div className="bn">
                      <button type="button" onClick={() => setSel({ w: 0, d: di })} title={"Open " + day.name}>
                        <b>{day.name}</b>
                      </button>
                      <span className="chip rust">{dbuHasWeekday(day) ? DBU_DOW[day.weekday] : "No weekday"}</span>
                      <span className="hint">
                        {moves} moves{day.playlist ? " · ♪ " + day.playlist.name : ""}
                        {names.size > 1 ? " · renamed in a later week" : ""}
                        {" · "}{weeks.map((_, wi) => dbuDayMonth(dates[wi + ":" + di])).filter(Boolean).join(" · ") || "—"}
                      </span>
                    </div>
                  </td>
                </tr>
                {(day.blocks || []).map((block, bi) => (block.rows || []).map((row, ri) => (
                  <tr key={bi + ":" + ri}>
                    <td className="en">
                      <b>{row.name || "Unnamed move"}</b>
                      <span>{block.kind}{row.tempo ? " · " + row.tempo : ""}{row.group ? " · " + row.group : ""}{row.rest ? " · rest " + row.rest : ""}</span>
                    </td>
                    {weeks.map((w, wi) => {
                      const wBlock = (((w.days || [])[di] || {}).blocks || [])[bi];
                      const cellRow = wBlock && (wBlock.rows || [])[ri];
                      if (!cellRow) return <td key={wi}><span className="none">—</span></td>;
                      const diverged = cellRow.name && row.name && cellRow.name !== row.name;
                      // ⚠ A ROW WITH PER-SET TARGETS IS READ HERE, NEVER EDITED. These two
                      // boxes write the row's own sets × reps and weight, and every set the
                      // coach wrote a value for would ignore them — an edit that reads as
                      // saved and changes nothing the member does. The cell shows the ladder
                      // and opens the day, where the per-set table is.
                      const cellLadder = ShapeWorkoutDocument.ladder(cellRow);
                      const st = status(wi, di, bi, ri);
                      const who = cellRow.name || row.name;
                      if (cellLadder) return (
                        <td key={wi}>
                          <button type="button" className={"cell ladder" + (w.deload ? " dl" : "")} onClick={() => setSel({ w: wi, d: di })}
                            aria-label={"Per-set targets, " + (cellRow.name || row.name) + ", week " + (wi + 1) + ": " + cellRow.sets + " × " + cellLadder.reps + (cellLadder.weight ? ", " + cellLadder.weight : "") + ". Open the day to edit."}>
                            {diverged && <span className="div" title={cellRow.name}>{cellRow.name}</span>}
                            {st && <span className="pg" aria-hidden="true" title={DBU_PROGRESS_MARK[st][1]}>{DBU_PROGRESS_MARK[st][0]}</span>}
                            <span className="a">{cellRow.sets} × {dbuSlashBreaks(cellLadder.reps)}</span>
                            <span className="b">{cellLadder.weight ? dbuSlashBreaks(cellLadder.weight) : "—"}</span>
                          </button>
                        </td>
                      );
                      return (
                        <td key={wi}>
                          <span className={"cell" + (w.deload ? " dl" : "")}>
                            {diverged && <span className="div" title={cellRow.name}>{cellRow.name}</span>}
                            <DbuSheetSetsReps key={cellRow.id} row={cellRow}
                              label={"Sets and reps, " + (cellRow.name || row.name) + ", week " + (wi + 1)}
                              onChange={(value) => editRow(di, bi, ri, wi, value)} />
                            <input className="b" aria-label={"Load, " + who + ", week " + (wi + 1)}
                              value={cellRow.load ?? ""} onChange={(e) => editRow(di, bi, ri, wi, { load: e.target.value, ...(st === "follows" ? { loadPinned: true } : {}) })} />
                            {mark(st, who, wi, di, bi, ri)}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                )))}
                <tr className="add">
                  <td colSpan={weeks.length + 1}>
                    <button type="button" onClick={() => setSel({ w: 0, d: di })}>＋ Add exercise to {day.name}</button>
                  </td>
                </tr>
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── The progression, drawn ──────────────────────────────────────────────────
// Step 6c: "Back squat 255 → 295 lb across the 12 weeks, deload weeks hatched, Now at week 6".
// One series, so no legend: the caption names the move. The loads are the document's own (the
// rule writes them into the weeks), read for the first move the rule climbs. "Now" is where the
// clients on this program are, from each client's program leg on the roster (`now`), and is drawn
// only when there is one: a program nobody is on has no now.
function DbuProgressionChart({ doc, rule, now = [] }) {
  const uid = React.useId().replace(/[^a-zA-Z0-9]/g, "");
  if (!rule) return null;
  const W = ShapeWorkoutDocument, weeks = doc.weeks || [];
  let pick = null;
  ((weeks[0] || {}).days || []).forEach((d, di) => (d.blocks || []).forEach((b, bi) => (b.rows || []).forEach((r, ri) => {
    if (!pick && W.progressionStatus(doc, 0, di, bi, ri) === "source") pick = { name: String(r.name || "").trim(), di };
  })));
  if (!pick || weeks.length < 2) return null;
  const series = DashBuilder.progressionSeries(doc, pick.name, pick.di, rule.unit);
  const pts = series.filter((p) => p.load != null);
  if (pts.length < 2) return null;
  const unit = rule.unit === "pct" ? "% 1RM" : " " + dbuUnitLabel(rule.unit);
  const lo = Math.min(...pts.map((p) => p.load)), hi = Math.max(...pts.map((p) => p.load));
  const n = weeks.length, colW = Math.max(34, Math.min(84, Math.floor(720 / n))), L = 44, T = 16, H = 76, B = 20;
  const width = L + n * colW + 8, height = T + H + B;
  const x = (wk) => L + (wk - 0.5) * colW;
  const y = (v) => T + (hi === lo ? H / 2 : H - ((v - lo) / (hi - lo)) * H);
  const path = pts.map((p, i) => (i ? "L" : "M") + x(p.week).toFixed(1) + " " + y(p.load).toFixed(1)).join(" ");
  const marks = now.filter((m) => m.week >= 1 && m.week <= n);
  const first = pts[0], last = pts[pts.length - 1];
  const caption = pick.name + " " + first.load + " → " + last.load + unit + " across the " + n + " weeks"
    + (series.some((p) => p.deload) ? ", deload weeks hatched" : "")
    + (marks.length ? ". Now at " + marks.map((m) => "week " + m.week + " (" + m.names.join(", ") + ")").join(", ") : "") + ".";
  return (
    <figure className="dpc">
      <svg viewBox={"0 0 " + width + " " + height} width={width} height={height} role="img" aria-label={caption}>
        <defs><pattern id={"h" + uid} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="6" stroke="currentColor" strokeWidth="2" /></pattern></defs>
        {series.map((p) => p.deload && <rect key={"d" + p.week} className="dpc-dl" x={L + (p.week - 1) * colW + 1} y={T - 6} width={colW - 2} height={H + 12} fill={"url(#h" + uid + ")"} />)}
        <line className="dpc-ax" x1={L} x2={L + n * colW} y1={T + H + 2} y2={T + H + 2} />
        <text className="dpc-t" x={L - 6} y={y(hi) + 4} textAnchor="end">{hi}</text>
        {hi !== lo && <text className="dpc-t" x={L - 6} y={y(lo) + 4} textAnchor="end">{lo}</text>}
        {series.map((p) => (n <= 12 || p.week % 2 === 1 || p.week === n) && <text key={"w" + p.week} className="dpc-t" x={x(p.week)} y={height - 5} textAnchor="middle">{p.week}</text>)}
        {marks.map((m) => <g key={"n" + m.week}><line className="dpc-now" x1={x(m.week)} x2={x(m.week)} y1={T - 8} y2={T + H + 2} /><text className="dpc-nt" x={x(m.week) + 4} y={T - 1}>Now</text></g>)}
        <path className="dpc-l" d={path} />
        {pts.map((p) => <circle key={p.week} className="dpc-p" cx={x(p.week)} cy={y(p.load)} r="4"><title>{"Week " + p.week + (p.deload ? " · deload" : "") + " · " + p.load + unit}</title></circle>)}
      </svg>
      <figcaption>{caption}</figcaption>
    </figure>
  );
}

// ── The progression bar ──────────────────────────────────────────────────────
// One rule for the program, set once and always in view above the canvas: "+5 lb a week
// on main lifts, deload every 4th week" (owner, 2026-10-07, step 3 of the builder plan;
// the 21 Sept brief drew it as "Progression +N kg / week on main lifts ▾" in the
// toolbar). The rule writes each later week's loads into the document as week 1 changes
// (`applyProgramProgression`), so the Sheet's cells, the client preview and every
// assignment read the climbed loads, not a label.
function DbuProgressionBar({ doc, onRule, now = [] }) {
  // The amount is held as typed while the field is in use: clearing "5" to type "2.5"
  // must not write a rule of nothing, or the weeks would flatten under the coach's hands.
  const [amount, setAmount] = React.useState(null);
  const rep = dbuProgressionReport(doc);
  const rule = rep.rule;
  if (!rule) {
    return (
      <div className="dprog off" role="group" aria-label="Progression">
        <span className="dp-l"><i aria-hidden="true">↗︎</i>Progression</span>
        <span className="dp-off">Off. Each week’s loads are the ones you type.</span>
        <button type="button" className="dp-b" onClick={() => onRule(dbuDefaultRule(doc))}>＋ Add a progression</button>
      </div>
    );
  }
  const set = (patch) => onRule({ ...rule, ...patch });
  const kindsKey = rule.kinds.join(",");
  const kindOptions = DBU_PROGRESS_KINDS.some((k) => k.kinds.join(",") === kindsKey)
    ? DBU_PROGRESS_KINDS
    : [...DBU_PROGRESS_KINDS, { kinds: rule.kinds, label: rule.kinds.map(dbuKindLabel).join(", ").toLowerCase() }];
  const deloadOptions = DBU_DELOAD_EVERY.includes(rule.deloadEvery) ? DBU_DELOAD_EVERY : [...DBU_DELOAD_EVERY, rule.deloadEvery].sort((a, b) => a - b);
  const kindsLabel = (kindOptions.find((k) => k.kinds.join(",") === kindsKey) || {}).label || "lifts";
  const weeks = (doc.weeks || []).length;
  const lines = [];
  if (weeks < 2) lines.push("Add a week and its loads follow this rule.");
  else if (!rep.moves) lines.push("No " + kindsLabel + " in week 1 have a load in " + dbuUnitLabel(rule.unit) + " yet.");
  else lines.push(rep.moves + (rep.moves === 1 ? " move" : " moves") + " from week 1 go up " + dbuAmountLabel(rule) + " each week"
    + (rep.example ? ". " + rep.example.name + " reaches " + rep.example.to + (rule.unit === "pct" ? "% 1RM" : " " + dbuUnitLabel(rule.unit)) + " in week " + rep.example.week : "") + ".");
  if (rule.rpe) lines.push(rep.rpeMoves ? "RPE goes up " + rule.rpe.step + " a week on " + rep.rpeMoves + (rep.rpeMoves === 1 ? " move" : " moves") + ", up to " + rule.rpe.cap + "."
    : "No " + kindsLabel + " in week 1 have a target RPE yet.");
  if (rule.deloadEvery && rep.deloads.length) lines.push((rep.deloads.length === 1 ? "Week " + rep.deloads[0] + " deloads" : dbuWeekList(rep.deloads).replace(/^weeks/, "Weeks") + " deload")
    + (rule.rpe ? ": about 40% fewer sets, loads hold, and RPE goes back to week 1’s." : ": about 40% fewer sets, and loads hold."));
  if (rep.pinned) lines.push(rep.pinned + (rep.pinned === 1 ? " load you typed by hand stays" : " loads you typed by hand stay") + " as typed.");
  if (rep.rpePinned) lines.push(rep.rpePinned + (rep.rpePinned === 1 ? " RPE you picked by hand stays" : " RPEs you picked by hand stay") + " as picked.");
  if (rep.otherUnit) lines.push(rep.otherUnit + (rep.otherUnit === 1 ? " move" : " moves") + " in another unit " + (rep.otherUnit === 1 ? "stays" : "stay") + " as written.");
  return (
    <div className="dprog" role="group" aria-label="Progression">
      <div className="dp-row">
        <span className="dp-l"><i aria-hidden="true">↗︎</i>Progression</span>
        <span className="dp-f">
          <span aria-hidden="true">＋</span>
          <input aria-label="Load added each week" type="number" min="0" step="any" inputMode="decimal"
            value={amount != null ? amount : String(rule.amount)}
            onFocus={() => setAmount(String(rule.amount))} onBlur={() => setAmount(null)}
            onChange={(e) => { const v = e.target.value; setAmount(v); const n = Number(v); if (v.trim() !== "" && Number.isFinite(n) && n > 0) set({ amount: n }); }} />
          <select aria-label="Unit of the weekly increase" value={rule.unit} onChange={(e) => set({ unit: e.target.value })}>
            <option value="lb">lb</option><option value="kg">kg</option><option value="pct">% 1RM</option>
          </select>
          <span>a week on</span>
          <select aria-label="Moves the progression applies to" value={kindsKey} onChange={(e) => set({ kinds: e.target.value.split(",") })}>
            {kindOptions.map((k) => <option key={k.kinds.join(",")} value={k.kinds.join(",")}>{k.label}</option>)}
          </select>
        </span>
        <span className="dp-f">
          <select aria-label="Deload weeks" value={rule.deloadEvery} onChange={(e) => set({ deloadEvery: Number(e.target.value) })}>
            {deloadOptions.map((n) => <option key={n} value={n}>{dbuDeloadLabel(n)}</option>)}
          </select>
        </span>
        {/* The RPE climb: one more group in the same row, not a second bar. */}
        <span className="dp-f">
          <select aria-label="RPE added each week" value={rule.rpe ? String(rule.rpe.step) : "0"}
            onChange={(e) => { const step = Number(e.target.value); set({ rpe: step ? { step, cap: rule.rpe ? rule.rpe.cap : DBU_RPE_CAP_DEFAULT } : null }); }}>
            <option value="0">RPE as typed</option>
            {dbuWithStored(DBU_RPE_STEPS_A_WEEK, rule.rpe && rule.rpe.step).map((n) => <option key={n} value={String(n)}>{"RPE +" + n + " a week"}</option>)}
          </select>
          {rule.rpe && <select aria-label="Highest RPE" value={String(rule.rpe.cap)} onChange={(e) => set({ rpe: { ...rule.rpe, cap: Number(e.target.value) } })}>
            {dbuWithStored(DBU_RPE_CAPS, rule.rpe.cap).map((n) => <option key={n} value={String(n)}>{"up to " + n}</option>)}
          </select>}
        </span>
        <button type="button" className="dp-b" onClick={() => onRule(null)}>Turn off</button>
      </div>
      <p className="dp-s">{lines.join(" ")}</p>
      <DbuProgressionChart doc={doc} rule={rule} now={now} />
    </div>
  );
}

// ── Copy a day to other weeks ────────────────────────────────────────────────
// Opened from the day editor's heading. Every other week is listed with what the copy
// does there, BEFORE the coach confirms: "Monday is free", or "replaces Upper A, 5 moves".
function DbuCopyToWeeks({ doc, wi, di, onCopy, onCancel }) {
  const day = doc.weeks[wi].days[di];
  const others = doc.weeks.map((_, i) => i).filter((i) => i !== wi);
  const later = others.filter((i) => i > wi);
  const [picked, setPicked] = React.useState(() => new Set());
  const firstRef = React.useRef(null);
  React.useEffect(() => { if (firstRef.current) firstRef.current.focus(); }, []);
  const slot = (ti) => dbuCopySlot(doc, wi, di, ti) || { at: -1, replaces: null };
  const chosen = others.filter((t) => picked.has(t));
  const replacing = chosen.filter((t) => slot(t).replaces).length;
  const when = dbuHasWeekday(day) ? DBU_DOW_FULL[day.weekday] : null;
  const toggle = (ti, on) => setPicked((prev) => { const next = new Set(prev); if (on) next.add(ti); else next.delete(ti); return next; });
  return (
    <div className="dtool" role="group" aria-label={"Copy " + day.name + " to other weeks"}
      onKeyDown={(e) => { if (e.key === "Escape" && !dbuImeComposing(e.nativeEvent)) { e.preventDefault(); e.stopPropagation(); onCancel(); } }}>
      <p>{"Copy " + day.name + " to " + (when ? "the " + when + " of " : "") + "other weeks. A day already there is replaced."}</p>
      <div className="dweeks">
        {others.map((ti, k) => {
          const r = slot(ti).replaces;
          const n = r ? dbuMoves(r) : 0;
          return (
            <label key={ti} className={"dwk" + (r ? " rep" : "")}>
              <input ref={k === 0 ? firstRef : undefined} type="checkbox" checked={picked.has(ti)} onChange={(e) => toggle(ti, e.target.checked)} />
              <span><b>Week {ti + 1}</b><small>{r ? "replaces " + (r.name || "a day") + ", " + (n ? n + (n === 1 ? " move" : " moves") : "empty") : when ? when + " is free" : "adds a day"}</small></span>
            </label>
          );
        })}
      </div>
      <div className="drow2">
        {later.length > 1 && <button type="button" onClick={() => setPicked(new Set(later))}>All later weeks</button>}
        <button type="button" className="go" disabled={!chosen.length} onClick={() => onCopy(chosen)}>
          {chosen.length ? "Copy to " + chosen.length + (chosen.length === 1 ? " week" : " weeks") + (replacing ? " · replaces " + replacing + (replacing === 1 ? " day" : " days") : "") : "Choose weeks"}
        </button>
        <button type="button" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

// ── Delete a day ─────────────────────────────────────────────────────────────
// ⚠ A CONFIRM BUILT INTO THE PANEL, NOT AN UNDO. Three reasons, each about this page:
// deleting closes the panel the coach is working in, so an Undo would have to live
// somewhere the builder puts no other notice; the autosave writes the deletion within a
// second, and an assign or an update of future workouts in that window reads the saved
// document; and the confirm can name what goes (the day, its week, its moves) before it
// goes. The safe answer has the focus, and Escape is "Keep it".
function DbuDeleteDay({ day, wi, onDelete, onCancel }) {
  const keepRef = React.useRef(null);
  React.useEffect(() => { if (keepRef.current) keepRef.current.focus(); }, []);
  const n = dbuMoves(day);
  return (
    <div className="dtool warn" role="group" aria-label={"Delete " + day.name + "?"}
      onKeyDown={(e) => { if (e.key === "Escape" && !dbuImeComposing(e.nativeEvent)) { e.preventDefault(); e.stopPropagation(); onCancel(); } }}>
      <p>Delete {day.name} from week {wi + 1}? {n ? "Its " + n + (n === 1 ? " move goes" : " moves go") + " with it." : "It has no moves yet."} Other weeks keep theirs.</p>
      <div className="drow2">
        <button type="button" className="danger" onClick={onDelete}>{"Delete " + day.name}</button>
        <button type="button" ref={keepRef} onClick={onCancel}>Keep it</button>
      </div>
    </div>
  );
}

// ── The two builders (the owner's coach review, step 6c) ────────────────────
// ⚠ ONE WORKOUT NO LONGER OPENS THE WHOLE PROGRAM BUILDER. "＋ Single workout day opened the
// program builder with a week of six empty Rest cells, so 36 controls sat above the first exercise
// and the add line fell below the fold." A single workout opens the DAY CANVAS alone: no plan,
// no progression, no ＋ Week, the library open beside the list, the session's totals over it,
// and one primary action, Assign. A program opens on its PLAN (weeks across, `DbuPlan`), and a
// session peeked there opens in this same day canvas with Open in builder.
// What counts as a single workout: a template saved as one (`buildType: 'workout'`), or, for one
// that names no type, a document of one week and one day, which is the shared normaliser's own
// rule (`normalizeWorkoutDetail`). A stored 'workout' that somehow holds more days than one is a
// program here, so no day of it can be hidden.
function dbuIsSingle(template, doc) {
  const days = ((doc && doc.weeks) || []).reduce((n, w) => n + ((w && w.days) || []).length, 0);
  const type = template && template.detail && template.detail.buildType;
  return days === 1 && (doc.weeks || []).length === 1 && (type ? type === "workout" : true);
}
// "Saved just now" (step 6c: it "replaces Save template"). The time is the last save this page
// made; a program opened from the library was saved before it opened, so it reads "Saved".
function dbuSavedWords(at, nowMs) {
  if (!at) return "Saved";
  const mins = Math.floor((nowMs - at) / 60000);
  return mins < 1 ? "Saved just now" : mins < 60 ? "Saved " + mins + " min ago" : "Saved";
}
function DbuBuilder({ template, preselectId, clients, queue, live, playlists, ownerId, clips, dayTemplates, customMoves, customTags, onBack, onSaved, emptyNote, onAssigned, usage }) {
  const ownerRef = React.useRef(ownerId);
  const initial = React.useRef(template.recovered || {name:template.name,doc:template.detail.builder,revision:template.detail.revision || 0});
  const [name, setName] = React.useState(initial.current.name);
  // ⚠ The weekday backfill runs INSIDE the initializer, so it is part of the baseline
  // `saved.current` below and opening a legacy program does not mark it dirty or spend a
  // revision. The dates drawn and the dates assigned both use it either way. The program's
  // progression is brought into step here for the same reason: a document already in step
  // comes back as itself.
  const [doc, setDocState] = React.useState(() => ShapeWorkoutDocument.applyProgramProgression(dbuWithWeekdays(JSON.parse(JSON.stringify(initial.current.doc)))));
  // ⚠ EVERY EDIT GOES THROUGH THE PROGRESSION, so a load changed in week 1, a week copied
  // or removed, or a day copied to other weeks leaves every later week's governed loads
  // where the rule puts them. Without a rule this returns the document it was given.
  const setDoc = (next) => setDocState(ShapeWorkoutDocument.applyProgramProgression(next));
  // Decided once, from what opened: a single workout stays one while it is open.
  const [single] = React.useState(() => dbuIsSingle(template, initial.current.doc));
  // A single workout opens on its day; a program opens on its plan, with nothing open.
  const [sel, setSel] = React.useState(() => (single ? {w:0,d:0} : {w:-1,d:-1}));
  // The session peeked at on the plan, or null.
  const [peek, setPeek] = React.useState(null);
  // The day canvas's two tabs: build it, or see it as the client does (step 6c: "Client view is
  // a tab on the sheet", where it used to float).
  const [tab, setTab] = React.useState("build");
  const assignRef = React.useRef(null);
  // ⚠ REMEMBERED PER COACH, which the board's G tab asks for in as many words: "the
  // switch is remembered per coach, so whoever thinks in calendars opens to the grid and
  // whoever programs in spreadsheets opens to the sheet". It rides the dashboard's own
  // `dashboard_prefs` store rather than a second mechanism — same account binding, same
  // serial write lane, same three read states, no migration and no route.
  //
  // ⚠ THE STORE OPENS ONLY WHEN THE BUILDER IS LIVE. In the signed-out preview there is
  // no account to remember against, and `useRememberedChoices` declines to open a
  // per-account document without one; the switch still works, it just does not persist.
  //
  // ⚠ PLAN ⇄ SHEET IS THE ONLY CHOICE LEFT. The Guided / Editor / Planner layouts and the day
  // editor's three panel positions were retired in step 3 (owner, 2026-10-07), so nothing reads
  // `workoutBuilderLayout` any more. Step 6c replaced the Grid with the Plan, under a key of its
  // own: a coach whose prefs still say "grid" opens on the Plan, which is what the Grid became.
  // (The meal builder keeps its own layouts.)
  const prefs = useRememberedChoices(!!live);
  const [view, setViewRaw] = useRememberedChoice(prefs, "builderView", DBU_VIEW_KEYS, "plan");
  // What opened the day editor, so Done, Escape and Delete give focus back to it; and the
  // one-shot request to move focus into the editor once it has rendered.
  const dayTrigger = React.useRef(null);
  const focusPanel = React.useRef(false);
  const panelRef = React.useRef(null);
  const addDayRef = React.useRef(null);
  // The day editor's heading tools that open a strip of their own: copy to weeks, delete.
  const [dayTool, setDayTool] = React.useState(null);
  // Said once a day is copied or deleted, since the result is in weeks the editor is not
  // showing (copy) or the editor itself is gone (delete).
  const [notice, setNotice] = React.useState("");
  // When this page last saved, for "Saved just now", and a clock that moves it on.
  const [savedAt, setSavedAt] = React.useState(0);
  const [clock, setClock] = React.useState(() => Date.now());
  React.useEffect(() => { if (!savedAt) return undefined; const t = setInterval(() => setClock(Date.now()), 30000); return () => clearInterval(t); }, [savedAt]);
  React.useEffect(() => setDayTool(null), [sel.w, sel.d]);
  // Opening a day (from the plan's peek, a Sheet band, ＋ Add a day) puts the canvas on screen in
  // the plan's place and the keyboard in it; the peek closes, and Build is the tab it opens on.
  const selectDay = next => { dayTrigger.current = document.activeElement; focusPanel.current = true; setNotice(""); setPeek(null); setTab("build"); setSel(next); };
  // Sheet edits its own cells. Close the day editor when switching, then reopen
  // it from a day heading.
  const setView = (next) => { if (next === "sheet") { setSel({ w: -1, d: -1 }); setPeek(null); } setViewRaw(next); };
  // ⚠ THE OPEN DOCUMENT COUNTS TOO. `customMoves` comes from SAVED templates, so a
  // move created ten seconds ago would not be offered for the next day until the
  // program had been saved and re-fetched — which reads as the feature not
  // working. The two are merged and de-duplicated by name.
  // ⚠ THE OPEN DOCUMENT GOES FIRST — what the coach typed a moment ago is the current
  // truth about that move, where the saved copy is last week's. `mergeMoveInto` then fills
  // any descriptor the open copy is missing from the saved one, so the reorder loses
  // nothing; it is the library walk's own rule, not a second one written here.
  const ownMoves = React.useMemo(() => DashBuilder.ownMovesFor(doc, customMoves), [customMoves, doc]);
  const [updating, setUpdating] = React.useState(false);
  const [saveState, setSaveState] = React.useState(template.recovered ? 'dirty' : 'saved');
  const [error,setError] = React.useState('');
  const [saveConflict,setSaveConflict] = React.useState(false);
  const [assigning,setAssigning] = React.useState(false);
  const [uploads,setUploads] = React.useState(0);
  // Focus goes back to whatever opened the day, or, when nothing on the canvas did (the
  // day the builder opens on), to ＋ Add a day, so the keyboard is never left on nothing.
  // ⚠ THE PLAN IS NOT ON THE PAGE WHILE A DAY IS OPEN (the canvas takes its place), so the
  // focus is handed back once it has rendered again, not in the click that closes the day.
  const refocusNext = React.useRef(false);
  const refocus = () => { refocusNext.current = true; };
  React.useEffect(() => {
    if (!refocusNext.current) return;
    refocusNext.current = false;
    const el = dayTrigger.current && dayTrigger.current.isConnected ? dayTrigger.current : addDayRef.current;
    if (el) el.focus();
  });
  // Closing a day goes back to the plan with that session peeked, so the coach lands where they
  // left (the peek takes the keyboard). A single workout has no plan, so it has nothing to close.
  const closeDayEditor = () => {
    if (uploads || single) return;
    const was = sel;
    setSel({w:-1,d:-1});
    if (view === "sheet") refocus(); else setPeek(was.w >= 0 ? { w: was.w, d: was.d } : null);
  };
  // ⚠ THE DAY EDITOR DOCKS UNDER THE CANVAS, so a day opened from week 1 of an 8-week Grid
  // can open below the fold. Focus moves into it once it has rendered, which brings it on
  // screen and puts a keyboard user where the edit is (Planner's side panel did the same).
  // One-shot: a request that finds no panel (a Sheet band whose day week 1 does not have)
  // is dropped, rather than waiting to pull focus on some later, unrelated render.
  React.useEffect(() => {
    if (!focusPanel.current) return;
    focusPanel.current = false;
    if (panelRef.current) panelRef.current.focus();
  });
  const idRef = React.useRef(template.draftId || (template.id && !String(template.id).startsWith('demo-') ? template.id : crypto.randomUUID()));
  const persisted = React.useRef(template.recovered ? !!template.recovered.persisted : !!template.id && !String(template.id).startsWith('demo-'));
  const revision = React.useRef(initial.current.revision);
  const published = React.useRef(!!template.published);
  const copiedFrom = React.useRef(null);
  const active=React.useRef(true), flight=React.useRef(null);
  const latest = React.useRef({name,doc}); latest.current={name,doc};
  const saved = React.useRef(template.recovered ? '' : JSON.stringify({name,doc}));
  const draft = value => dbuWriteDraft(ownerRef.current,idRef.current,{...value,detail:{...(template.detail || {}),builder:value.doc},published:published.current,revision:revision.current,persisted:persisted.current,at:Date.now()});
  const flush = async (publish=false) => {
    if (uploads) {setError('Wait for the demonstration upload to finish.');return false;}
    if (flight.current) {const ok=await flight.current; if(!ok)return false; if(saved.current!==JSON.stringify(latest.current)||publish)return flush(publish);return true;}
    const value=latest.current, serial=JSON.stringify(value);
    if(persisted.current && serial===saved.current && !publish)return true;
    if(!value.name.trim()){setError('Give this workout a name.');return false;}
    setError('');setSaveConflict(false);setSaveState('saving');
    flight.current=(async()=>{
      try{
        const media=dbuMediaWithCover(template.detail && template.detail.media, value.doc.cover);
        // Always sent: the server lays this detail over the stored one, so a cover removed here must replace
        // the stored list, not leave the old cover in it.
        let plan={id:idRef.current,name:value.name,detail:{...(template.detail||{}),builder:value.doc,media,revision:revision.current}};
        if(live){
          if(!ownerRef.current)throw new Error('Sign in before saving this draft.');
          const res=await fetch('/api/coach/plans',{method:persisted.current?'PATCH':'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:idRef.current,kind:'program',name:value.name,meta:value.doc.weeks.length+' weeks',published:publish?true:published.current,expectedOwnerId:ownerRef.current,expectedRevision:revision.current,detail:plan.detail})});
          const data=await res.json();
          if(!res.ok || !data.plan?.id){const failure=new Error(data.error || 'Save failed. Your draft is still on this device.');failure.saveConflict=res.status===409 || data.code==='revision_conflict';throw failure;}
          plan=data.plan;revision.current=Number(plan.detail?.revision)||0;persisted.current=true;published.current=!!plan.published;
        }else if(!draft(value))throw new Error('This browser could not retain your draft. Keep this page open.');
        saved.current=serial;
        if(live && copiedFrom.current){dbuWriteDraft(ownerRef.current,copiedFrom.current,null);copiedFrom.current=null;}
        if(live && serial===JSON.stringify(latest.current))dbuWriteDraft(ownerRef.current,idRef.current,null);
        else draft(latest.current);
        if(active.current){setSaveState('saved');setSavedAt(Date.now());setClock(Date.now());onSaved?.({id:plan.id,name:plan.name,doc:plan.detail.builder,plan});}
        return true;
      }catch(e){if(active.current){setSaveState('error');setSaveConflict(!!e.saveConflict);setError(e.message || 'Save failed. Retry.');}return false;}
      finally{flight.current=null;}
    })();
    const ok = await flight.current;
    // A save/leave/assign action includes edits made while its request was pending.
    return ok && saved.current !== JSON.stringify(latest.current) ? flush() : ok;
  };
  React.useEffect(()=>{active.current=true;return()=>{active.current=false;};},[]);
  React.useEffect(()=>{
    if(JSON.stringify({name,doc})===saved.current)return;
    if(!draft({name,doc}))setError('Local recovery is unavailable. Save before leaving.');
    setSaveState('dirty');
    const timer=setTimeout(()=>flush(),900);
    return()=>clearTimeout(timer);
  },[name,doc,ownerId]);
  React.useEffect(()=>{
    const guard=e=>{if(saved.current!==JSON.stringify(latest.current)||uploads){e.preventDefault();e.returnValue='';}};
    const beforeLink=e=>{if(uploads && e.target.closest?.('a[href]')){e.preventDefault();e.stopPropagation();setError('Wait for the demonstration upload to finish before leaving.');}};
    window.addEventListener('beforeunload',guard);document.addEventListener('click',beforeLink,true);
    return()=>{window.removeEventListener('beforeunload',guard);document.removeEventListener('click',beforeLink,true);};
  },[uploads]);
  const leave=async()=>{if(await flush())onBack();};
  const saveAsCopy=async()=>{
    if(uploads || flight.current)return;
    copiedFrom.current=idRef.current;
    idRef.current=crypto.randomUUID();persisted.current=false;revision.current=0;published.current=false;
    const next={...latest.current,name:latest.current.name+' (copy)'};
    latest.current=next;setName(next.name);saved.current='';draft(next);
    await flush();
  };
  const uploadCount=delta=>setUploads(n=>Math.max(0,n+delta));

  const week = doc.weeks[sel.w];
  const day = week && week.days[sel.d];
  const setWeeks = (weeks) => setDoc({ ...doc, weeks });
  // ⚠ IN A LATER WEEK, A LOAD THE COACH TYPES OVER THE PROGRESSION'S IS PINNED to that
  // week (`pinLoadEdits`), or the rule would put its own number back on the next render.
  // Week 1 is where the climb starts, so its loads are never pinned: they move the rest.
  const setDay = (next) => {
    const prev = doc.weeks[sel.w] && doc.weeks[sel.w].days[sel.d];
    const day2 = doc.progression && sel.w > 0 ? ShapeWorkoutDocument.pinLoadEdits(prev, next, doc.progression) : next;
    setWeeks(doc.weeks.map((w, wi) => (wi === sel.w ? { ...w, days: w.days.map((d, di) => (di === sel.d ? day2 : d)) } : w)));
  };
  // ⚠ THE DAY EDITOR'S TRAINING-DAY SELECT DOES NOT GO THROUGH `setDay`, which is a blind
  // positional replace with no collision check — picking a weekday another day in the week
  // already held put two days on one weekday, and the Grid finds a day BY weekday, so the
  // second became unreachable while the document still held it. `dbuAssignWeekday` is the
  // same rule the Grid's drag uses, so the two controls cannot answer differently.
  // Clearing a weekday needs no separate branch: no day can equal `undefined`, so it moves
  // this day and displaces nothing.
  const setDayWeekday = (n) => setWeeks(doc.weeks.map((w, wi) => (wi === sel.w ? dbuAssignWeekday(w, sel.d, n) : w)));

  // A copied week is a new week: the loads typed by hand for the source week are not its
  // own, so under a progression it climbs from week 1 like every other.
  const duplicateWeek = (wi) => {
    const next = JSON.parse(JSON.stringify(doc.weeks[wi]));
    (next.days || []).forEach((d) => (d.blocks || []).forEach((b) => { b.rows = (b.rows || []).map((r) => ShapeWorkoutDocument.unpinned(r)); }));
    setWeeks([...doc.weeks.slice(0, wi + 1), next, ...doc.weeks.slice(wi + 1)]);
  };
  // Every per-week action in one place, so the grid's gutter and any later caller
  // cannot drift into two versions of "duplicate a week". ("progress" — copy a week with
  // the per-move increments — retired with those increments; the progression bar is the
  // one rule now, and a copied week climbs under it.)
  const onWeek = (action, wi) => {
    if (action === "duplicate") return duplicateWeek(wi);
    if (action === "deload") return toggleDeload(wi);
    if (action === "remove" && doc.weeks.length > 1) {
      setWeeks(doc.weeks.filter((_, i) => i !== wi));
      setSel({ w: -1, d: -1 });
      setPeek(null);
    }
  };
  // ⚠ TAKING A DELOAD OFF GIVES THE SETS BACK (`undeloadWeek`), unless the coach changed them
  // during it. It used to leave them cut, which a deload cadence cannot live with.
  const toggleDeload = (wi) => {
    const w = doc.weeks[wi];
    setWeeks(doc.weeks.map((x, i) => (i !== wi ? x : w.deload ? DashBuilder.undeloadWeek(x) : DashBuilder.deloadWeek(x))));
  };
  // The progression bar's one writer. Off keeps every load where it is (they are real
  // numbers in the weeks, not a view of the rule) and drops the hand-typed marks, which
  // have nothing left to hold against. Leaving a deload cadence takes its deloads off.
  // Turning the RPE climb off does the same for RPE: every RPE stays where it is, and
  // the RPEs picked by hand lose their marks.
  const unpinAll = (weeks, axis) => weeks.map((w) => ({ ...w, days: (w.days || []).map((d) => ({ ...d, blocks: (d.blocks || []).map((b) => ({ ...b, rows: (b.rows || []).map((r) => ShapeWorkoutDocument.unpinned(r, axis)) })) })) }));
  const setRule = (next) => {
    const prev = ShapeWorkoutDocument.normalizeProgression(doc.progression);
    if (!next) {
      const { progression, ...rest } = doc;
      setDoc({ ...rest, weeks: unpinAll(doc.weeks) });
      return;
    }
    // ⚠ NOT A DELOAD WEEK SAVED BEFORE THE CADENCE (`legacyDeload`): its sets were cut
    // with nothing to give them back, so it stays marked as the deload it still is.
    const rule = ShapeWorkoutDocument.normalizeProgression(next) || prev;
    let weeks = prev && prev.deloadEvery && !next.deloadEvery ? doc.weeks.map((w) => (w.deload && !ShapeWorkoutDocument.legacyDeload(w) ? DashBuilder.undeloadWeek(w) : w)) : doc.weeks;
    if (prev && prev.rpe && !(rule && rule.rpe)) weeks = unpinAll(weeks, "rpe");
    setDoc({ ...doc, weeks, progression: rule });
  };
  const addDay = () => {
    const wi = Math.max(0, sel.w), w = doc.weeks[wi];
    setWeeks(doc.weeks.map((v, i) => (i === wi ? { ...v, days: [...v.days, { ...DashBuilder.newDay("Day " + (w.days.length + 1)), weekday: dbuNextFreeWeekday(w) }] } : v)));
    selectDay({ w: wi, d: w.days.length });
  };
  const deleteDay = () => {
    const gone = day && day.name;
    setDoc(dbuDeleteDay(doc, sel.w, sel.d));
    setNotice((gone || "The day") + " deleted from week " + (sel.w + 1) + ".");
    setSel({ w: -1, d: -1 });
    refocus();
  };
  const copyDay = (targets) => {
    setDoc(dbuCopyDayToWeeks(doc, sel.w, sel.d, targets));
    setNotice(day.name + " copied to " + dbuWeekList(targets.map((t) => t + 1)) + ".");
    setDayTool(null);
  };
  // The only day left in the whole program is not deleted: an empty program has no day
  // for the editor to open, and the Grid would be the only way back.
  const onlyDay = doc.weeks.reduce((n, w) => n + (w.days || []).length, 0) <= 1;

  // ── The plan's own writers ──
  // A rest letter or a free slot adds an empty session on that weekday and opens it.
  const addAt = (wi, weekday) => {
    const w = doc.weeks[wi];
    setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, days: [...x.days, { ...DashBuilder.newDay("Day " + (w.days.length + 1)), weekday }] } : x)));
    selectDay({ w: wi, d: w.days.length });
  };
  // A session from the tray lands on a free day only: a day already there is the coach's, and
  // this is an add, not a replace (Copy to weeks is the tool that replaces, and says so first).
  // The copy is a day of its own (`dbuCopiedDay`: new ids, the full week's sets, loads that follow
  // the progression), cut like the rest of a deload week it lands in.
  const placeSession = (item, wi, weekday) => {
    const w = doc.weeks[wi];
    if (!w || !item || !item.day) return;
    const taken = (w.days || []).find((d) => dbuHasWeekday(d) && d.weekday === weekday);
    if (taken) { setNotice("Week " + (wi + 1) + " already has " + (taken.name || "a session") + " on " + DBU_DOW_FULL[weekday] + ". Drop " + item.name + " on a free day."); return; }
    const copy = dbuCopiedDay(item.day, !!w.deload);
    copy.weekday = weekday;
    const after = w.days.findIndex((d) => dbuHasWeekday(d) && d.weekday > weekday);
    const days = after < 0 ? [...w.days, copy] : [...w.days.slice(0, after), copy, ...w.days.slice(after)];
    setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, days } : x)));
    setNotice(item.name + " added to week " + (wi + 1) + ", " + DBU_DOW_FULL[weekday] + ".");
  };
  // Pressed rather than dragged: the week being peeked at (week 1 when none is), on the saved
  // day's own weekday when that is free, else the week's next free one.
  const trayWeek = peek ? peek.w : 0;
  const addFromTray = (item) => {
    const w = doc.weeks[trayWeek];
    if (!w) return;
    const own = dbuHasWeekday(item.day) && !(w.days || []).some((d) => dbuHasWeekday(d) && d.weekday === item.day.weekday) ? item.day.weekday : null;
    const free = [0, 1, 2, 3, 4, 5, 6].filter((x) => !(w.days || []).some((d) => dbuHasWeekday(d) && d.weekday === x));
    if (own == null && !free.length) { setNotice("Week " + (trayWeek + 1) + " trains every day already."); return; }
    placeSession(item, trayWeek, own != null ? own : dbuNextFreeWeekday(w));
  };
  // The length control's one writer. Dropping weeks that hold a move asks first, through the
  // site's own confirm; never the browser's.
  const setLength = async (n) => {
    const out = DashBuilder.resizeProgram(doc, n);
    if (out.builder === doc) return;
    if (out.removed && out.removed.moves) {
      const C = typeof window !== "undefined" && window.ShapeConfirm;
      if (!C || typeof C.open !== "function") { setNotice("Remove weeks with the × on each week."); return; }
      const r = out.removed, k = r.to - r.from + 1;
      const ok = await C.open({ title: "Shorten to " + n + (n === 1 ? " week?" : " weeks?"), name: latest.current.name,
        confirmLabel: "Remove " + k + (k === 1 ? " week" : " weeks"),
        message: (k === 1 ? "Week " + r.from + " goes" : "Weeks " + r.from + "–" + r.to + " go") + ", with " + r.sessions + (r.sessions === 1 ? " session" : " sessions") + " in " + (k === 1 ? "it" : "them") + ". Clients already assigned keep every session on their calendar." });
      if (!ok) return;
      const again = DashBuilder.resizeProgram(latest.current.doc, n);
      setDoc(again.builder);
    } else setDoc(out.builder);
    if (peek && peek.w >= n) setPeek(null);
    setNotice("The program is " + n + (n === 1 ? " week" : " weeks") + " long" + (n > doc.weeks.length ? "; the new weeks copy the last one, with the progression applied." : "."));
  };
  // Where the clients on this program are now, from each one's program leg on the roster.
  const nowMarks = React.useMemo(() => {
    const by = new Map();
    (clients || []).forEach((c) => {
      const leg = DashBuilder.trainerProgramOf(c);
      const wk = leg && Number(leg.week);
      if (!leg || leg.templateId !== idRef.current || !Number.isInteger(wk) || wk < 1) return;
      if (!by.has(wk)) by.set(wk, []);
      by.get(wk).push(String((c.profile && c.profile.name) || "A client"));
    });
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([week, names]) => ({ week, names }));
    // The program's id is a ref: "Save as new copy" changes it without a new roster (Codex on #2648).
  }, [clients, idRef.current]);
  // The header's Assign: the sheet for a single workout; the program's own panel for a program,
  // back on the plan if a session is open.
  const openAssign = async () => {
    if (single) { if (await flush()) setAssigning(true); return; }
    setSel({ w: -1, d: -1 });
    setTimeout(() => { const el = assignRef.current; if (el) { if (el.scrollIntoView) el.scrollIntoView({ block: "center" }); el.focus(); } }, 0);
  };
  // The panel saves first, then assigns the version it saved.
  // What Assign sends is what just saved (Codex on #2648): the document the save wrote, read after it,
  // never the one on screen when Assign was pressed (an edit made while the save ran is in the save).
  const beforeAssign = async () => ((await flush()) ? { id: idRef.current, name: latest.current.name, revision: revision.current, doc: latest.current.doc } : null);

  // What the program's progression does to each move of the open day, for its marks.
  const progress = {}, rpeProgress = {};
  if (day) (day.blocks || []).forEach((b, bi) => (b.rows || []).forEach((r, ri) => {
    const st = ShapeWorkoutDocument.progressionStatus(doc, sel.w, sel.d, bi, ri);
    if (st) progress[dbuRowKey(r, bi, ri)] = st;
    const rs = ShapeWorkoutDocument.rpeProgressionStatus(doc, sel.w, sel.d, bi, ri);
    if (rs) rpeProgress[dbuRowKey(r, bi, ri)] = rs;
  }));
  const rule = ShapeWorkoutDocument.normalizeProgression(doc.progression);

  // The day's playlist opens what the member's card opens: the link the coach saved for it, found in the
  // playlists this page read (dclWithPlaylistLink, dashClient.jsx).
  const previewBase = day ? DashBuilder.dayToClientCard(day, { coach: "you", programVideo:doc.video }) : null;
  const previewCard = previewBase && previewBase.playlist && typeof dclWithPlaylistLink === "function" ? { ...previewBase, playlist: dclWithPlaylistLink(previewBase.playlist, playlists) } : previewBase;
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Draft on this device" : saveState === "error" ? "Save failed · draft retained" : live ? (persisted.current ? dbuSavedWords(savedAt, clock) : "New · not saved yet") : savedAt ? "Draft saved locally · " + dbuSavedWords(savedAt, clock).replace(/^Saved /, "") : "Draft saved locally";
  // The reference Monday the dates on this page are drawn for. It lives ON the document
  // (`detail.builder.previewStart`) so it survives a reload, and it is a REFERENCE only —
  // ⚠ each client's real start is still chosen per client at assign, which is why the
  // header says so in as many words rather than letting a coach read it as the start.
  const startISO = doc.previewStart || dbuNextMonday();
  const setStart = (iso) => setDoc({ ...doc, previewStart: iso });
  const dates = React.useMemo(() => dbuDateMap(doc, startISO), [doc, startISO]);
  const summary = React.useMemo(() => dbuSummary(doc, dates), [doc, dates]);
  const weekdayLabel = summary.weekdays.length ? summary.weekdays.map((i) => DBU_DOW[i]).join(" ") : "no weekdays set";

  return (
    <fieldset disabled={!!uploads} style={{border:0,padding:0,margin:0,minWidth:0}}>
      {/* ⚠ INLINE, NOT A NAMED CONSTANT. `tests/site-nav.test.mjs` requires every <style>
          child to be a plain template literal: a stray backtick in a CSS comment closes the
          template early and builds an EXPRESSION that parses, builds, tests green and throws
          at render — it cost ~70 pages their chrome once. Behind an identifier this
          stylesheet would be invisible to the one sweep that catches that. */}
      <style>{`
.dbu2{background:${DBU_PG};color:${DBU_INK};font-family:${DBU_BODY};font-size:14px;line-height:1.45;border-radius:14px;padding:22px 24px 30px}
.dbu2 *{box-sizing:border-box}
.dbu2 button{font-family:inherit}
.dbu2 input,.dbu2 select,.dbu2 textarea{font-family:inherit;color:${DBU_INK}}
.dbu2 :focus-visible{outline:2px solid ${DBU_TEAL};outline-offset:2px}
.dbu2 [hidden]{display:none!important}
.dbu2 button:disabled{opacity:.5;cursor:not-allowed}
.dbu2 .cb-copy{padding:12px 16px;background:${DBU_REST};border-radius:8px;font-size:14px;margin:0 0 16px}
.dbu2 .cb-details{border-bottom:1px solid ${DBU_LINE};margin:0 0 14px;padding:0 0 4px}
.dbu2 .cb-details>summary{cursor:pointer;padding:10px 0;font-size:14px;font-weight:600}
.dbu2 .cb-details>summary small{margin-left:10px;color:${DBU_INK2};font-size:12px;font-weight:400}
.dbu2 .cb-details>p{font-size:13px;line-height:1.5;color:${DBU_INK2};margin:4px 0 12px}
.dbu2 .cb-details .meta{margin-bottom:10px}
.dbu2 h1{font-family:${DBU_DISPLAY};font-weight:600;font-variation-settings:'wdth' 112;font-size:34px;letter-spacing:-.01em;margin:0;line-height:1.05;color:${DBU_INK}}
.dbu2 .hd{display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap;margin-bottom:18px}
.dbu2 .meta{font-size:14px;color:${DBU_INK2};margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dbu2 .chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;font-size:13px;font-weight:600;background:${DBU_WH};border:1px solid ${DBU_LINE2};color:${DBU_INK};white-space:nowrap}
.dbu2 .chip.rust{background:${DBU_RUSTBG};border-color:transparent;color:${DBU_RUST}}
.dbu2 .chip.gold{background:${DBU_GOLDBG};border-color:transparent;color:${DBU_GOLD}}
.dbu2 .chip.q{background:transparent;border-color:transparent;color:${DBU_INK2};font-weight:500;padding:0 2px}
.dbu2 .acts{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:2px}
.dbu2 .saved{font-size:13px;color:${DBU_INK3}}
.dbu2 .seg{display:inline-flex;gap:3px;background:${DBU_PG};border:1px solid ${DBU_LINE2};border-radius:9px;padding:3px;height:40px;align-items:center}
.dbu2 .seg button{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border:0;border-radius:7px;font-size:13.5px;font-weight:600;color:${DBU_INK2};white-space:nowrap;background:transparent;cursor:pointer}
.dbu2 .seg button[aria-pressed="true"]{background:${DBU_WH};color:${DBU_INK};box-shadow:0 1px 2px rgba(0,0,0,.14)}
.dbu2 .seg button i{font-style:normal;font-size:13px;line-height:1;opacity:.85}
.dbu2 .tb{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.dbu2 .sh{width:100%;border-collapse:separate;border-spacing:0;background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:12px;overflow:hidden;table-layout:fixed}
.dbu2 .sh th{text-align:left;padding:12px 12px 10px;border-bottom:1px solid ${DBU_LINE};vertical-align:top;font-weight:600;font-size:14px;background:${DBU_PG}}
.dbu2 .sh th small{display:block;font-size:12.5px;color:${DBU_INK2};font-weight:500;margin-top:2px}
.dbu2 .sh th .dl{display:inline-block;margin-top:5px;font-size:11.5px;padding:2px 7px;border-radius:5px;background:${DBU_GOLDBG};color:${DBU_GOLD};font-weight:700}
.dbu2 .sh td{padding:8px 12px;border-bottom:1px solid ${DBU_LINE};vertical-align:middle;font-size:14px}
.dbu2 .sh tr.band td{background:${DBU_RUSTBG};padding:11px 12px}
.dbu2 .sh tr.band .bn{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.dbu2 .sh tr.band .bn b{font-size:15px;font-weight:700}
.dbu2 .sh tr.band .bn button{background:transparent;border:0;padding:0;min-height:24px;cursor:pointer;font:inherit;color:inherit;text-align:left}
.dbu2 .sh tr.band .hint{margin-left:auto;font-size:13px;color:${DBU_INK2}}
.dbu2 .sh .en b{display:block;font-size:14.5px;font-weight:600}
.dbu2 .sh .en span{display:block;font-size:12px;color:${DBU_INK3};margin-top:1px}
.dbu2 .sh .cell{position:relative;display:inline-flex;flex-direction:column;justify-content:center;width:100%;min-width:0;height:52px;padding:0 10px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};font-variant-numeric:tabular-nums;line-height:1.15}
.dbu2 .sh .cell input{border:0;background:transparent;padding:0;width:100%;height:24px;font-variant-numeric:tabular-nums;outline:none}
.dbu2 .sh .cell input.a{font-size:14px;font-weight:600;color:${DBU_INK}}
.dbu2 .sh .cell input.b{font-size:12px;color:${DBU_INK2}}
.dbu2 .sh .cell.dl{background:${DBU_PG}}
.dbu2 .sh .cell.dl input.b{color:${DBU_GOLD};font-weight:600}
.dbu2 .sh .cell .div{font-size:12px;color:${DBU_GOLD};font-weight:600}
.dbu2 .sh .cell.ladder{cursor:pointer;text-align:left;font:inherit;color:inherit;height:auto;min-height:52px;padding:6px 10px}
.dbu2 .sh .cell.ladder .a,.dbu2 .sh .cell.ladder .b{display:block;white-space:normal;overflow:hidden;line-height:20px;padding:2px 0}
.dbu2 .sh .cell.ladder .a{font-size:14px;font-weight:600;color:${DBU_INK}}
.dbu2 .sh .cell.ladder .b{font-size:12px;color:${DBU_INK2}}
.dbu2 .sh .cell.ladder.dl .b{color:${DBU_GOLD};font-weight:600}
.dbu2 .sh tr.add td{padding:9px 12px}
.dbu2 .sh tr.add button{color:${DBU_TEAL};font-weight:600;font-size:13.5px;background:transparent;border:0;cursor:pointer;padding:0;min-height:24px}
.dbu2 .back{background:transparent;border:0;padding:4px 0;min-height:24px;cursor:pointer;font-size:13.5px;color:${DBU_INK2}}
.dbu2 .chip input[type="date"]{border:0;background:transparent;font:inherit;color:inherit;padding:0;height:26px;outline:none}
.dbu2 input[type="checkbox"]{width:24px;height:24px;accent-color:${DBU_TEAL}}
.dbu2 .sh .none{color:${DBU_INK3};text-align:center;display:block}
.dbu2 .addday{display:inline-flex;align-items:center;gap:8px;height:40px;padding:0 14px;border:1.5px dashed ${DBU_LINE2};border-radius:9px;justify-content:center;font-size:14px;font-weight:600;color:${DBU_TEAL};background:transparent;cursor:pointer;margin-top:14px}
.dbu2 .stage{position:relative}
/* The progression bar: one rule for the program, above the canvas. */
.dbu2 .dprog{display:flex;flex-direction:column;gap:6px;margin:0 0 14px;padding:10px 14px;border:1px solid ${DBU_LINE};border-left:3px solid ${DBU_TEAL};border-radius:10px;background:${DBU_WH}}
.dbu2 .dprog.off{flex-direction:row;align-items:center;flex-wrap:wrap;gap:8px 12px;border-left-color:${DBU_LINE2}}
.dbu2 .dprog .dp-row{display:flex;align-items:center;flex-wrap:wrap;gap:8px 14px}
.dbu2 .dprog .dp-l{font-family:${DBU_MONO};font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_TEAL};white-space:nowrap}
.dbu2 .dprog.off .dp-l{color:${DBU_INK3}}
.dbu2 .dprog .dp-l i{font-style:normal;margin-right:5px}
.dbu2 .dprog .dp-f{display:inline-flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:14px;color:${DBU_INK2}}
.dbu2 .dprog input,.dbu2 .dprog select{height:34px;padding:0 8px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};color:${DBU_INK};font-size:14px}
.dbu2 .dprog input{width:70px;font-variant-numeric:tabular-nums}
.dbu2 .dprog .dp-b{height:34px;padding:0 12px;margin-left:auto;border-radius:8px;border:1px solid ${DBU_LINE2};background:transparent;color:${DBU_INK2};font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap}
.dbu2 .dprog.off .dp-b{border-style:dashed;color:${DBU_TEAL}}
.dbu2 .dprog .dp-off,.dbu2 .dprog .dp-s{margin:0;font-size:13px;color:${DBU_INK2}}
.dbu2 .dmsg{margin:0 0 12px;font-size:13.5px;font-weight:600;color:${DBU_TEAL}}
.dbu2 .sh .cell .pg{position:absolute;top:3px;right:6px;font-size:11px;line-height:1;color:${DBU_TEAL};background:transparent;border:0;padding:0}
.dbu2 .sh .cell button.pg.pin{top:0;right:0;min-width:24px;min-height:24px;padding:3px 6px;display:flex;justify-content:flex-end;align-items:flex-start;color:${DBU_GOLD};cursor:pointer}
/* The day editor sits at the builder's full width: under the canvas since step 3, in the plan's
   place since step 6c. It used to float in three positions; nothing floats now. */
.dbu2 .drawer{background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:14px;padding:20px 22px 18px;margin-top:16px;scroll-margin-top:16px}
.dbu2 .drawer:focus{outline:none}
.dbu2 .drawer:focus-visible{outline:2px solid ${DBU_TEAL};outline-offset:2px}
.dbu2 .x{height:32px;padding:0 11px;border-radius:8px;border:1px solid ${DBU_LINE};background:${DBU_WH};color:${DBU_INK2};font-size:13px;font-weight:600;cursor:pointer}
.dbu2 .scroll{overflow-x:auto}
/* ── The day editor: one line per exercise, the detail beside it ─────────────
   Step 2 of the approved builder plan (owner, 2026-10-07). The panel it sits in is the
   builder's full width since step 3 docked it (about 1,050px at 1440) and under 300 on a
   phone, so the list and its rows read their OWN width (container queries, as the
   dashboard grid's widgets do) rather than the viewport's.
   ONE CONTROL HEIGHT: every button in the panel is --dbu-ctl, 36px, or 44 on a coarse
   pointer. They were 32, 40 and 44 (the shared video controls), side by side. The
   video controls carry their 44 inline, so the override below needs !important. */
.dbu2 .drawer{--dbu-ctl:36px;--dbu-cell:30px}
@media (pointer:coarse){.dbu2 .drawer{--dbu-ctl:44px;--dbu-cell:40px}}
/* ⚠ iOS SAFARI ZOOMS THE PAGE ON FOCUS when a text box computes under 16px, and this sheet sets
   the row cells (.ci), quick-add, the AI box and the detail fields at 13.5 to 14px (Codex on
   #2526). On a coarse pointer every text control in the builder takes 16px, so a new one can't
   slip by; a mouse keeps the sheet's sizes. Boxes drawn outside .dbu2 (dbuField's, in dialogs)
   take dash.css's floor through the class dbu-field. */
@media (pointer:coarse){.dbu2 input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),.dbu2 select,.dbu2 textarea{font-size:16px!important}}
.dbu2 .sr{position:absolute!important;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0}
.dbu2 .drawer .dh{display:flex;justify-content:space-between;align-items:flex-end;gap:8px 12px;margin-bottom:12px;flex-wrap:wrap}
.dbu2 .drawer .dh .x{height:var(--dbu-ctl)}
.dbu2 .drawer .dt{flex:1 1 220px;min-width:0;display:grid;gap:3px}
.dbu2 .drawer .dt .when{font-family:${DBU_MONO};font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_RUST}}
.dbu2 .drawer .dt .when b{font-weight:700;color:inherit}
.dbu2 .drawer .dn{font-family:${DBU_DISPLAY};font-weight:700;font-variation-settings:'wdth' 92;font-size:22px;line-height:1.2;letter-spacing:-.005em;color:${DBU_INK};background:transparent;border:0;border-radius:0;padding:0 0 2px;margin:0;width:100%;min-width:0;outline:none;text-overflow:ellipsis;box-shadow:inset 0 -1px 0 transparent;cursor:text}
.dbu2 .drawer .dn:hover{box-shadow:inset 0 -1px 0 ${DBU_LINE2}}
.dbu2 .drawer .dn:focus{box-shadow:inset 0 -2px 0 ${DBU_TEAL}}
.dbu2 .drawer .dh .dacts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end;margin-left:auto}
.dbu2 .drawer .dh .x.danger{color:${DBU_RUST}}
.dbu2 .drawer .dh .x[aria-expanded="true"]{border-color:${DBU_TEAL};color:${DBU_TEAL}}
/* The heading's strips: copy to weeks, and the delete confirm. */
.dbu2 .dtool{margin:0 0 14px;padding:12px 14px;border:1px solid ${DBU_LINE2};border-radius:12px;background:${DBU_PG}}
.dbu2 .dtool.warn{border-color:${DBU_RUST};background:${DBU_RUSTBG}}
.dbu2 .dtool>p{margin:0 0 10px;font-size:13.5px;color:${DBU_INK}}
.dbu2 .dtool .dweeks{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;margin:0 0 10px}
.dbu2 .dtool .dwk{display:flex;align-items:center;gap:8px;min-height:var(--dbu-ctl);padding:4px 8px;border:1px solid ${DBU_LINE};border-radius:8px;background:${DBU_WH};cursor:pointer}
.dbu2 .dtool .dwk input[type="checkbox"]{width:18px;height:18px;flex:0 0 auto}
.dbu2 .dtool .dwk>span{display:grid;min-width:0}
.dbu2 .dtool .dwk b{font-size:13.5px;font-weight:600}
.dbu2 .dtool .dwk small{font-size:12px;line-height:1.35;color:${DBU_INK3};overflow-wrap:anywhere}
.dbu2 .dtool .dwk.rep small{color:${DBU_RUST}}
.dbu2 .dtool .drow2{display:flex;flex-wrap:wrap;gap:8px}
.dbu2 .dtool button{height:var(--dbu-ctl);padding:0 12px;border-radius:8px;border:1px solid ${DBU_LINE2};background:${DBU_WH};color:${DBU_INK};font-size:13px;font-weight:600;cursor:pointer}
.dbu2 .dtool button.go{background:${DBU_TEAL};border-color:${DBU_TEAL};color:var(--sh-deep, #06231f)}
.dbu2 .dtool button.danger{border-color:${DBU_RUST};color:${DBU_RUST}}
.dbu2 .dday{container:dday / inline-size}
.dbu2 .dday .dbtn{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:var(--dbu-ctl);padding:0 12px;border-radius:8px;border:1px solid ${DBU_LINE2};background:${DBU_WH};color:${DBU_INK};font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}
.dbu2 .dday .dbtn.ghost{border-style:dashed;background:transparent;color:${DBU_TEAL}}
.dbu2 .dday .dbtn.danger{color:${DBU_RUST}}
.dbu2 .dday :is(.cb-demo,.dpop) :is(button,select,input[type="url"]){min-height:var(--dbu-ctl)!important;padding-top:0!important;padding-bottom:0!important}
/* The day's settings, as chips. A select laid invisibly over its chip opens the
   platform's own list; the chip shows only the answer. */
.dbu2 .dchips{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.dbu2 .dchip{position:relative;display:inline-flex;align-items:center;gap:6px;height:var(--dbu-ctl);max-width:100%;padding:0 14px;border-radius:999px;border:1px solid ${DBU_LINE2};background:${DBU_WH};color:${DBU_INK};font-size:13px;font-weight:600;white-space:nowrap;cursor:pointer}
.dbu2 .dchip>span{overflow:hidden;text-overflow:ellipsis}
.dbu2 .dchip small{font-size:11.5px;font-weight:500;color:${DBU_INK3};margin-right:2px}
.dbu2 .dchip i{font-style:normal;font-size:10px;color:${DBU_INK3};margin-left:2px}
.dbu2 .dchip.dim{border-style:dashed;background:transparent;color:${DBU_INK2};font-weight:500}
.dbu2 .dchip:hover{border-color:${DBU_INK3}}
.dbu2 .dchip:focus-within{outline:2px solid ${DBU_TEAL};outline-offset:2px}
.dbu2 .dchip[aria-expanded="true"]{border-color:${DBU_TEAL};color:${DBU_TEAL};border-style:solid}
.dbu2 .dchip select{position:absolute;inset:0;width:100%;height:100%;margin:0;border:0;opacity:0;cursor:pointer;font-size:16px}
.dbu2 .dpop{max-width:600px;border:1px solid ${DBU_LINE2};border-radius:12px;background:${DBU_PG};padding:12px 14px;margin:-4px 0 14px}
.dbu2 .dpop>p{margin:0;font-size:13px;color:${DBU_INK2}}
/* List beside detail when the panel has the room, the detail under it when not.
   NOT sticky: the page's main element is overflow-x hidden, which makes it a scroll
   container, so a sticky detail would never stick to the viewport (measured at 1440). */
.dbu2 .dsplit{display:grid;gap:16px;align-items:start}
.dbu2 .dmain{min-width:0}
@container dday (min-width:760px){
 .dbu2 .dsplit{grid-template-columns:minmax(0,1fr) 284px}
 .dbu2 .dsplit.lib{grid-template-columns:minmax(0,1fr) 300px}
}
.dbu2 .dlist{container:dlist / inline-size;position:relative;border:1px solid ${DBU_LINE};border-radius:10px;background:${DBU_WH}}
.dbu2 .dlist[data-dragging]{user-select:none;-webkit-user-select:none}
.dbu2 .dbk{display:flex;align-items:center;gap:4px;padding:4px 6px 0 8px;background:${DBU_PG};border-top:1px solid ${DBU_LINE}}
.dbu2 .dbk .kind{-webkit-appearance:none;appearance:none;height:28px;padding:0 20px 0 6px;border:1px solid transparent;border-radius:6px;background-color:transparent;background-image:linear-gradient(45deg,transparent 50%,currentColor 50%),linear-gradient(135deg,currentColor 50%,transparent 50%);background-position:right 10px top 52%,right 6px top 52%;background-size:4px 4px;background-repeat:no-repeat;font-family:${DBU_MONO};font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_RUST};cursor:pointer}
.dbu2 .dbk .kind:hover{border-color:${DBU_LINE2}}
.dbu2 .dbk .rule{flex:1;height:1px;background:linear-gradient(90deg,rgba(var(--sh-rust2-rgb, 192,83,59),.45),transparent 80%)}
.dbu2 .dbk .dq{height:var(--dbu-ctl);padding:0 8px;border:0;border-radius:6px;background:transparent;color:${DBU_TEAL};font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap}
.dbu2 .dbk .dq:hover{background:${DBU_TEALBG}}
.dbu2 .dempty{margin:0;padding:8px 12px 10px 48px;font-size:12.5px;color:${DBU_INK3};border-top:1px dashed ${DBU_LINE}}
/* A line, two rows of it where the list is narrow: the move on top, its four numbers
   under it in fixed columns, which the list's header names once. (A caption on every
   cell was tried first and ran a phone row to three lines.) */
.dbu2 .dhd{display:grid;grid-template-columns:16px 84px 96px 38px 72px minmax(0,1fr);column-gap:6px;padding:7px 8px 4px 4px;font-family:${DBU_MONO};font-size:9.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:${DBU_INK3}}
.dbu2 .dhd span:nth-child(-n+3){display:none}
.dbu2 .dhd span:nth-child(4){grid-column:2}
.dbu2 .dhd span:nth-child(n+4){padding-left:5px;white-space:nowrap}
.dbu2 .dhd+.dblk .dbk{border-top:1px solid ${DBU_LINE}}
.dbu2 .dr{position:relative;display:grid;grid-template-columns:16px 26px minmax(0,1fr);align-items:center;column-gap:6px;padding:3px 8px 5px 4px;border-top:1px solid ${DBU_LINE};background:${DBU_WH}}
.dbu2 .dr:hover{background:rgba(var(--sh-ink-rgb, 242,237,228),.025)}
.dbu2 .dr.grp{box-shadow:inset 3px 0 0 ${DBU_RUST}}
.dbu2 .dr.on{background:${DBU_TEALBG};box-shadow:inset 3px 0 0 ${DBU_TEAL}}
.dbu2 .dr.drag{z-index:3;background:${DBU_WH};box-shadow:0 10px 28px rgba(21,33,30,.2),inset 3px 0 0 ${DBU_TEAL};opacity:.97}
.dbu2 .dr .rh{width:16px;height:var(--dbu-cell);padding:0;border:0;border-radius:4px;background:transparent;color:${DBU_INK3};font-size:13px;line-height:1;display:inline-flex;align-items:center;justify-content:center;cursor:grab;touch-action:none}
.dbu2 .dr .rh:hover{color:${DBU_INK};background:rgba(var(--sh-ink-rgb, 242,237,228),.06)}
.dbu2 .dlist[data-dragging] .dr .rh{cursor:grabbing}
.dbu2 .dr .ix{font-style:normal;font-family:${DBU_MONO};font-size:10.5px;font-weight:700;color:${DBU_INK3}}
.dbu2 .dr .ix.ss{color:${DBU_RUST}}
.dbu2 .dr .nmc{display:flex;align-items:center;gap:6px;min-width:0}
.dbu2 .dr .nm{flex:0 1 auto;min-width:0;height:var(--dbu-cell);padding:0 4px;border:0;border-radius:5px;background:transparent;color:${DBU_INK};font-size:14px;font-weight:600;text-align:left;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.dbu2 .dr .mk{flex:0 0 auto;display:inline-flex;gap:6px;color:${DBU_INK3};font-size:12.5px;line-height:1}
.dbu2 .dr .mk b{font-weight:600;cursor:default}
.dbu2 .dr .dcells{grid-column:2/-1;display:grid;grid-template-columns:84px 96px 38px 72px minmax(0,1fr);column-gap:6px;align-items:center}
.dbu2 .dr .c{display:flex;align-items:center;gap:1px;min-width:0}
.dbu2 .dr .tm{flex:0 0 auto;color:${DBU_INK3};font-size:12px}
.dbu2 .dr .ci{box-sizing:border-box;height:var(--dbu-cell);min-width:0;padding:0 5px;border:1px solid transparent;border-radius:6px;background:transparent;color:${DBU_INK};font-size:14px;font-variant-numeric:tabular-nums;outline:none}
.dbu2 .dr .ci:hover{border-color:${DBU_LINE2}}
.dbu2 .dr .ci:focus{border-color:${DBU_TEAL};background:${DBU_WH};box-shadow:0 0 0 1px ${DBU_TEAL}}
.dbu2 .dr .ci::placeholder{color:${DBU_INK3};opacity:1}
.dbu2 .dr input.ci[type="number"]{-moz-appearance:textfield;appearance:textfield}
.dbu2 .dr input.ci::-webkit-outer-spin-button,.dbu2 .dr input.ci::-webkit-inner-spin-button{-webkit-appearance:none;margin:0}
.dbu2 .dr select.ci{-webkit-appearance:none;appearance:none;cursor:pointer}
.dbu2 .dr .sx [data-cell="sets"]{flex:0 0 28px;width:28px;text-align:right}
.dbu2 .dr .sx [data-cell="reps"]{flex:1 1 auto;width:0}
.dbu2 .dr .ld [data-cell="load"]{flex:1 1 auto;width:0;max-width:52px}
.dbu2 .dr .ld .u{flex:0 0 38px;width:38px;padding:0 3px;color:${DBU_INK2}}
.dbu2 .dr .rp .ci{width:100%;text-align:center}
.dbu2 .dr .rs .ci{width:100%}
@container dlist (min-width:500px){
 .dbu2 .dhd{grid-template-columns:16px 26px minmax(0,1fr) 96px 104px 38px 74px 52px;column-gap:4px;padding:8px 8px 5px 4px}
 .dbu2 .dhd span:nth-child(-n+3){display:block}
 .dbu2 .dhd span:nth-child(4){grid-column:auto}
 .dbu2 .dr{grid-template-columns:16px 26px minmax(0,1fr) 96px 104px 38px 74px 52px;column-gap:4px;padding:3px 8px 3px 4px}
 .dbu2 .dr .dcells{display:contents}
}
.dbu2 .dline{position:absolute;left:8px;right:8px;height:2px;margin-top:-1px;border-radius:2px;background:${DBU_TEAL};pointer-events:none;z-index:4}
.dbu2 .dpair{position:absolute;left:4px;right:4px;box-sizing:border-box;border:2px solid ${DBU_TEAL};border-radius:6px;pointer-events:none;z-index:4}
.dbu2 .dpair span{position:absolute;right:8px;top:-10px;padding:1px 6px;border-radius:3px;background:${DBU_TEALBG};color:${DBU_TEAL};border:1px solid ${DBU_TEAL};font:700 9px/1.4 ui-monospace,Menlo,monospace;letter-spacing:.06em;text-transform:uppercase;white-space:nowrap;max-width:80%;overflow:hidden;text-overflow:ellipsis}
.dbu2 .dline::before{content:"";position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:50%;background:${DBU_TEAL}}
/* Type to add: the list's last line. */
.dbu2 .dqa{position:relative;display:flex;align-items:center;gap:10px;padding:6px 10px 6px 8px;border-top:1px solid ${DBU_LINE}}
.dbu2 .dqa input{flex:1;min-width:0;height:var(--dbu-ctl);padding:0 10px;border:0;border-left:2px solid ${DBU_TEAL};border-radius:0;background:transparent;color:${DBU_INK};font-size:14px;outline:none}
.dbu2 .dqa input::placeholder{color:${DBU_INK3};opacity:1}
.dbu2 .dqa input:focus{background:${DBU_TEALBG}}
.dbu2 .dqa .kbd{font-family:${DBU_MONO};font-size:10px;color:${DBU_INK3};white-space:nowrap}
@container dlist (max-width:499px){.dbu2 .dqa .kbd{display:none}}
.dbu2 .dqa-list{position:absolute;left:8px;right:8px;top:100%;z-index:20;margin:2px 0 0;padding:4px;list-style:none;max-height:300px;overflow-y:auto;background:${DBU_WH};border:1px solid ${DBU_LINE2};border-radius:10px;box-shadow:0 14px 36px rgba(21,33,30,.18)}
.dbu2 .dqa-list .h{padding:8px 8px 3px;font-family:${DBU_MONO};font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${DBU_INK2}}
.dbu2 .dqa-list [role="option"]{display:flex;justify-content:space-between;align-items:center;gap:10px;min-height:36px;padding:4px 8px;border-radius:6px;font-size:13.5px;cursor:pointer}
.dbu2 .dqa-list [role="option"] small{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11.5px;color:${DBU_INK3}}
.dbu2 .dqa-list [aria-selected="true"]{background:${DBU_TEALBG}}
.dbu2 .dqa-list .new{color:${DBU_TEAL};font-weight:600}
.dbu2 .dfoot{display:flex;gap:8px;margin-top:10px}
/* Draft with AI: the brief, the drafted lines shown before anything touches the day. */
.dbu2 .dai{margin-top:10px;padding:12px;border:1px solid ${DBU_LINE2};border-radius:10px;background:${DBU_PG}}
.dbu2 .dai-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dbu2 .dai-in{flex:1 1 220px;min-width:0;height:var(--dbu-ctl);padding:0 10px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};color:${DBU_INK};font-size:14px}
.dbu2 .dai-hint{margin:6px 0 0;font-size:12px;color:${DBU_INK3}}
.dbu2 .dai-msg{margin:8px 0 0;font-size:13px;color:${DBU_INK2}}
.dbu2 .dai-msg.err{color:${DBU_RUST}}
.dbu2 .dai-msg.note{color:${DBU_GOLD}}
.dbu2 .dai-lines{list-style:none;margin:10px 0;padding:8px 10px;max-height:260px;overflow:auto;border:1px solid ${DBU_LINE};border-radius:8px;background:${DBU_WH};font-size:13px;line-height:1.55}
.dbu2 .dai-lines li.head{font-family:${DBU_MONO};font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_INK3}}
/* The detail. */
.dbu2 .ddetail{min-width:0;padding:14px 16px 16px;border:1px solid ${DBU_LINE2};border-top:3px solid ${DBU_RUST};border-radius:12px;background:${DBU_PG}}
.dbu2 .ddetail.empty{border-top-color:${DBU_LINE2};font-size:13px;color:${DBU_INK2}}
.dbu2 .ddetail.empty p{margin:0}
.dbu2 .ddetail .deb{font-family:${DBU_MONO};font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_RUST}}
.dbu2 .ddetail .dnm{margin:3px 0 0;font-family:${DBU_DISPLAY};font-weight:700;font-variation-settings:'wdth' 92;font-size:19px;line-height:1.2;overflow-wrap:anywhere}
.dbu2 .ddetail .dnote{margin:8px 0 0;font-size:12px;color:${DBU_INK2}}
.dbu2 .ddetail>details>summary{font-weight:600}
.dbu2 .ddetail .sub{display:flex;align-items:baseline;gap:8px;margin:14px 0 8px;padding-top:10px;border-top:1px solid ${DBU_LINE};font-family:${DBU_MONO};font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_INK3}}
.dbu2 .ddetail .sub small{font-family:${DBU_BODY};font-size:12px;font-weight:500;letter-spacing:0;text-transform:none;color:${DBU_INK2}}
.dbu2 .ddetail .dfs{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px 10px}
.dbu2 .ddetail .dfs label{min-width:0}
.dbu2 .ddetail .dfs label:first-child{grid-column:1/-1}
.dbu2 .ddetail .dfs label>span{display:block;margin-bottom:4px;font-size:12px;font-weight:600;color:${DBU_INK2}}
.dbu2 .ddetail .df{box-sizing:border-box;width:100%;max-width:100%;height:var(--dbu-ctl);padding:0 10px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};color:${DBU_INK};font-size:13.5px;outline:none}
.dbu2 .ddetail .dprg{display:flex;flex-wrap:wrap;gap:6px 8px;align-items:center;margin:10px 0 0;font-size:12.5px;color:${DBU_INK2}}
.dbu2 .ddetail .dprg>span{color:${DBU_TEAL}}
.dbu2 .ddetail .drow{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dbu2 .ddetail .drow .df{width:auto;flex:1 1 150px}
.dbu2 .ddetail .dacts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-start;margin:14px 0 0;padding-top:12px;border-top:1px solid ${DBU_LINE}}
@media(max-width:760px){.dbu2{padding:16px 12px}.dbu2 .hd>div{min-width:0!important}.dbu2 .drawer{padding:14px 12px 16px}}
/* ── Step 6c: the two builders ─────────────────────────────────────────────
   A tool page with a fixed layout: the header, then the plan (a program) or the day canvas
   (a single workout, or a program's session opened from the plan). */
.dbu2 .savenow{height:28px;padding:0 10px;border-radius:7px;border:1px solid ${DBU_LINE2};background:transparent;color:${DBU_INK2};font-size:12.5px;font-weight:600;cursor:pointer}
.dbu2 .dlen{display:inline-flex;align-items:center;gap:8px;font-size:13px;color:${DBU_INK2}}
.dbu2 .dlen-l{font-family:${DBU_MONO};font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_INK3}}
.dbu2 .dlen .seg button{padding:0 11px}
.dbu2 .dlen input{width:58px;height:34px;padding:0 8px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};font-size:14px;font-variant-numeric:tabular-nums}
/* The plan: weeks across, training days down. */
.dbu2 .dpl{display:grid;gap:8px;align-items:stretch}
.dbu2 .dpl .rl{padding:10px 4px 0 0;font-size:12px;font-weight:700;color:${DBU_INK3};text-transform:uppercase;letter-spacing:.06em}
.dbu2 .dpl .wkh{display:grid;gap:8px;align-content:start;padding:10px 10px 12px;border-radius:10px;background:${DBU_WH};border:1px solid ${DBU_LINE}}
.dbu2 .dpl .wkh.dl{background-image:repeating-linear-gradient(135deg,transparent 0 7px,${DBU_GOLDBG} 7px 9px)}
.dbu2 .dpl .wkt{display:flex;align-items:baseline;gap:8px;flex-wrap:wrap}
.dbu2 .dpl .wkt b{font-size:15px;font-weight:700}
.dbu2 .dpl .wkt>span:not(.chip){font-size:13px;color:${DBU_INK2}}
.dbu2 .dpl .wkh .chip{height:22px;font-size:11.5px}
.dbu2 .dpl .tools{display:flex;gap:4px;flex-wrap:wrap}
.dbu2 .dpl .tools button{height:26px;padding:0 8px;border-radius:6px;border:1px solid ${DBU_LINE2};background:${DBU_WH};font-size:12px;font-weight:600;color:${DBU_INK2};cursor:pointer}
.dbu2 .dpl .tools button[aria-pressed="true"]{background:${DBU_GOLDBG};border-color:transparent;color:${DBU_GOLD}}
.dbu2 .dpl .wst{display:grid;grid-template-columns:repeat(7,1fr);gap:3px}
.dbu2 .dpl .wst button{height:26px;min-width:0;padding:0;border-radius:6px;border:1px dashed ${DBU_LINE2};background:transparent;color:${DBU_INK3};font-family:${DBU_MONO};font-size:11px;font-weight:700;cursor:pointer}
.dbu2 .dpl .wst button.on{border:1px solid ${DBU_RUST};background:${DBU_RUSTBG};color:${DBU_RUST}}
.dbu2 .dpl .wst button:not(.on):hover{border-color:${DBU_TEAL};color:${DBU_TEAL}}
.dbu2 .dpl .ses{display:flex;flex-direction:column;gap:2px;width:100%;min-height:96px;padding:9px 10px 10px;border:1px solid ${DBU_LINE};border-left:3px solid ${DBU_RUST};border-radius:10px;background:${DBU_WH};color:${DBU_INK};text-align:left;cursor:pointer;font:inherit}
.dbu2 .dpl .ses.dl{background-image:repeating-linear-gradient(135deg,transparent 0 7px,${DBU_GOLDBG} 7px 9px);border-left-color:${DBU_GOLD}}
.dbu2 .dpl .ses.on{outline:2px solid ${DBU_TEAL};outline-offset:1px}
.dbu2 .dpl .ses .d{font-size:12px;color:${DBU_INK3};font-variant-numeric:tabular-nums}
.dbu2 .dpl .ses b{font-size:14px;font-weight:700;line-height:1.2}
.dbu2 .dpl .ses .m{font-size:12px;color:${DBU_INK2};margin-bottom:4px}
.dbu2 .dpl .ses .ln{display:flex;justify-content:space-between;gap:8px;font-size:12.5px;line-height:1.35;font-variant-numeric:tabular-nums}
.dbu2 .dpl .ses .ln .n{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:${DBU_INK2}}
.dbu2 .dpl .ses .ln .v{flex:0 0 auto;font-weight:600}
.dbu2 .dpl .ses .ln i{font-style:normal;color:${DBU_TEAL};font-weight:700}
.dbu2 .dpl .ses.empty{min-height:44px;align-items:center;justify-content:center;border:1px dashed ${DBU_LINE2};background:transparent;color:${DBU_INK3}}
.dbu2 .dpl .ses.empty:hover,.dbu2 .dpl .ses.empty:focus-visible{border-color:${DBU_TEAL};color:${DBU_TEAL};background:${DBU_TEALBG}}
/* The peek: one session, read-only, under the plan. */
.dbu2 .dpeek{margin-top:14px;padding:14px 16px;border:1px solid ${DBU_LINE2};border-top:3px solid ${DBU_TEAL};border-radius:12px;background:${DBU_WH}}
.dbu2 .dpeek:focus{outline:none}
.dbu2 .dpeek .pk-hd{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:8px}
.dbu2 .dpeek .when{font-family:${DBU_MONO};font-size:10.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_RUST}}
.dbu2 .dpeek .pk-hd b{font-family:${DBU_DISPLAY};font-size:20px;font-weight:700}
.dbu2 .dpeek .pk-acts{display:flex;gap:8px;align-items:center}
.dbu2 .dpeek .pk-b{display:grid;grid-template-columns:96px 1fr;gap:4px 12px;padding:8px 0;border-top:1px solid ${DBU_LINE}}
.dbu2 .dpeek .kl{font-family:${DBU_MONO};font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_INK3};padding-top:2px}
.dbu2 .dpeek ul{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.dbu2 .dpeek li{display:flex;gap:10px;align-items:baseline;flex-wrap:wrap;font-size:13.5px}
.dbu2 .dpeek li i{font-style:normal;font-family:${DBU_MONO};font-size:10.5px;font-weight:700;color:${DBU_INK3};width:22px}
.dbu2 .dpeek li span{color:${DBU_INK2};font-variant-numeric:tabular-nums}
/* The tray of sessions to drag in. */
.dbu2 .dtray{margin-top:16px}
.dbu2 .tray-h{font-size:14px;font-weight:700;margin-bottom:6px}
.dbu2 .tray-h small{margin-left:8px;font-size:12.5px;font-weight:500;color:${DBU_INK2}}
.dbu2 .tray-g{font-family:${DBU_MONO};font-size:9.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${DBU_INK3};margin:8px 0 6px}
.dbu2 .tray-l{display:flex;gap:8px;flex-wrap:wrap}
.dbu2 .tray-c{display:grid;gap:1px;min-width:150px;max-width:230px;padding:8px 12px 9px;border:1px solid ${DBU_LINE};border-left:4px solid var(--c);border-radius:9px;background:${DBU_WH};color:${DBU_INK};text-align:left;cursor:grab;font:inherit}
.dbu2 .tray-c .tk{font-size:11px;font-weight:700;color:${DBU_INK2}}
.dbu2 .tray-c b{font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbu2 .tray-c small{font-size:12px;color:${DBU_INK3};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Assign on the same screen. */
.dbu2 .das{margin-top:18px;padding:16px 18px;border:1px solid ${DBU_LINE};border-left:3px solid ${DBU_RUST};border-radius:12px;background:${DBU_WH};display:grid;gap:10px}
.dbu2 .das:focus{outline:none}
.dbu2 .das:focus-visible{outline:2px solid ${DBU_TEAL};outline-offset:2px}
.dbu2 .das-h{margin:0;font-family:${DBU_DISPLAY};font-size:20px;font-weight:700}
.dbu2 .das-row{display:grid;grid-template-columns:110px minmax(0,1fr);gap:10px;align-items:start}
.dbu2 .das-l{font-family:${DBU_MONO};font-size:10px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:${DBU_INK3};padding-top:8px}
.dbu2 .das-v{display:flex;gap:8px 12px;align-items:center;flex-wrap:wrap;min-height:36px;font-size:13.5px}
.dbu2 .das-on{display:flex;gap:6px 14px;flex-wrap:wrap;list-style:none;margin:0;padding:0}
.dbu2 .das-on li{display:inline-flex;align-items:center;gap:6px}
.dbu2 .das-b{height:32px;padding:0 12px;border-radius:8px;border:1px solid ${DBU_LINE2};background:${DBU_WH};color:${DBU_INK};font-size:13px;font-weight:600;cursor:pointer}
.dbu2 .das-gems{display:flex;gap:6px;flex-wrap:wrap}
.dbu2 .das-gem{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 12px;border-radius:999px;border:1px solid ${DBU_LINE2};background:transparent;color:${DBU_INK};font-size:13px;font-weight:600;cursor:pointer}
.dbu2 .das-gem[aria-pressed="true"]{border-color:${DBU_TEAL};background:${DBU_TEALBG}}
.dbu2 .das-date{height:36px;padding:0 10px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};font-size:14px}
.dbu2 .das-go{display:flex;gap:12px;align-items:center;flex-wrap:wrap;padding-top:4px}
.dbu2 .das-demo{font-family:${DBU_MONO};font-size:9px;color:${DBU_INK2};letter-spacing:.1em;text-transform:uppercase}
/* The progression, drawn. */
.dbu2 .dpc{margin:6px 0 0;overflow-x:auto}
.dbu2 .dpc svg{display:block;color:${DBU_GOLD}}
.dbu2 .dpc figcaption{font-size:12.5px;color:${DBU_INK2};margin-top:2px}
.dbu2 .dpc .dpc-dl{opacity:.45}
.dbu2 .dpc .dpc-ax{stroke:${DBU_LINE2};stroke-width:1}
.dbu2 .dpc .dpc-t{fill:${DBU_INK3};font-size:10px;font-family:${DBU_MONO}}
.dbu2 .dpc .dpc-l{fill:none;stroke:${DBU_TEAL};stroke-width:2;stroke-linejoin:round;stroke-linecap:round}
.dbu2 .dpc .dpc-p{fill:${DBU_TEAL};stroke:${DBU_WH};stroke-width:2}
.dbu2 .dpc .dpc-now{stroke:${DBU_RUST};stroke-width:1.5;stroke-dasharray:3 3}
.dbu2 .dpc .dpc-nt{fill:${DBU_RUST};font-size:10px;font-weight:700;font-family:${DBU_MONO}}
/* The day canvas: tabs, the totals, the library beside the list. */
.dbu2 .drawer.solo{margin-top:0}
.dbu2 .dtabs{display:inline-flex;gap:3px;padding:3px;margin:0 0 14px;border:1px solid ${DBU_LINE2};border-radius:9px;background:${DBU_PG}}
.dbu2 .dtabs button{height:30px;padding:0 14px;border:0;border-radius:7px;background:transparent;color:${DBU_INK2};font-size:13px;font-weight:600;cursor:pointer}
.dbu2 .dtabs button[aria-selected="true"]{background:${DBU_WH};color:${DBU_INK};box-shadow:0 1px 2px rgba(0,0,0,.14)}
.dbu2 .dclient{max-width:420px}
.dbu2 .dtot{display:grid;gap:8px;margin:0 0 14px;padding:10px 14px;border:1px solid ${DBU_LINE};border-radius:10px;background:${DBU_PG}}
.dbu2 .dtot-n{display:flex;gap:6px 18px;flex-wrap:wrap;font-size:13px;color:${DBU_INK2}}
.dbu2 .dtot-n b{font-family:${DBU_DISPLAY};font-size:19px;font-weight:700;color:${DBU_INK};margin-right:3px;font-variant-numeric:tabular-nums}
.dbu2 .dtot-m{display:grid;gap:6px}
.dbu2 .mbar{display:flex;gap:2px;height:10px}
.dbu2 .mbar i{display:block;min-width:4px;border-radius:3px}
.dbu2 .mleg{display:flex;gap:4px 14px;flex-wrap:wrap;list-style:none;margin:0;padding:0;font-size:12.5px;color:${DBU_INK2}}
.dbu2 .mleg li{display:inline-flex;align-items:center;gap:5px}
.dbu2 .mleg i{width:9px;height:9px;border-radius:2px;display:inline-block}
.dbu2 .mleg b{color:${DBU_INK};font-variant-numeric:tabular-nums}
.dbu2 .dtot-note{margin:0;font-size:13px;font-weight:600;color:${DBU_INK}}
.dbu2 .dtot-foot{margin:0;font-size:12px;color:${DBU_INK3}}
.dbu2 .dlib{min-width:0;display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid ${DBU_LINE2};border-radius:12px;background:${DBU_PG}}
.dbu2 .lib-h{font-family:${DBU_MONO};font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:${DBU_INK2}}
.dbu2 .lib-h small{margin-left:6px;font-family:${DBU_BODY};font-size:12px;letter-spacing:0;text-transform:none;font-weight:500;color:${DBU_INK3}}
.dbu2 .lib-q{height:var(--dbu-ctl);padding:0 10px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};font-size:13.5px;outline:none}
.dbu2 .lib-q:focus{border-color:${DBU_TEAL}}
.dbu2 .lib-f{display:flex;gap:6px;flex-wrap:wrap;align-items:center}
.dbu2 .lib-seg{display:inline-flex;gap:2px;padding:2px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH}}
.dbu2 .lib-seg button{height:28px;padding:0 9px;border:0;border-radius:6px;background:transparent;color:${DBU_INK2};font-size:12.5px;font-weight:600;cursor:pointer}
.dbu2 .lib-seg button[aria-pressed="true"]{background:${DBU_TEALBG};color:${DBU_INK}}
.dbu2 .lib-f select{flex:1 1 110px;min-width:0;height:32px;padding:0 6px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};font-size:12.5px}
.dbu2 .lib-new{display:flex;align-items:center;gap:6px;min-height:34px;padding:0 10px;border:1px dashed ${DBU_TEAL};border-radius:8px;background:${DBU_TEALBG};color:${DBU_TEAL};font-size:13px;font-weight:600;text-align:left;cursor:pointer}
/* Positioned, so a visually hidden label inside a row is clipped with the list rather than
   stretching the page below it. */
.dbu2 .lib-list{position:relative;list-style:none;margin:0;padding:0 2px 0 0;max-height:520px;overflow-y:auto}
.dbu2 .lib-g{padding:8px 4px 3px;font-family:${DBU_MONO};font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${DBU_INK3}}
.dbu2 .lib-row{display:flex;align-items:center;gap:6px;min-height:40px;padding:3px 4px;border-radius:7px;cursor:grab}
.dbu2 .lib-row:hover{background:${DBU_WH}}
.dbu2 .lib-nm{flex:1 1 auto;min-width:0;display:grid}
.dbu2 .lib-nm b{font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbu2 .lib-nm small{font-size:11.5px;color:${DBU_INK3};overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dbu2 .lib-in{flex:0 0 auto;color:${DBU_TEAL};font-weight:700;font-size:13px}
.dbu2 .lib-add{flex:0 0 auto;height:28px;padding:0 8px;border:1px solid ${DBU_LINE2};border-radius:7px;background:${DBU_WH};color:${DBU_TEAL};font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap}
.dbu2 .lib-none{padding:10px 4px;font-size:12.5px;color:${DBU_INK2}}
.dbu2 .lib-hint{margin:0;font-size:11.5px;color:${DBU_INK3}}
/* The whiteboard line: the superset bracket, the tempo, the cue, and the rest that goes on. */
.dbu2 .dr .ssb{grid-column:1/-1;padding:3px 0 1px 46px;font-family:${DBU_MONO};font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:${DBU_RUST}}
.dbu2 .dr .tp .ci{width:100%}
.dbu2 .dr .ci.to{display:inline-flex;align-items:center;width:100%;color:${DBU_RUST};font-family:${DBU_MONO};font-size:12px;font-weight:700}
.dbu2 .dr .ci.cue{grid-column:3/-1;height:24px;font-size:12.5px;font-style:italic;color:${DBU_INK2}}
.dbu2 .dr .ci.cue::placeholder{font-style:normal}
@container dday (max-width:759px){.dbu2 .dsplit.lib .dlib .lib-list{max-height:320px}}
/* The thin-scrollbar rules live in dash.css (.dash-thin-scroll) because the meal
   builder needs the same ones and has no style host of its own. */
`}</style>
      <div className="dbu2" data-view={view} data-mode={single ? "workout" : "program"}>
        {template.sourceName && <p className="cb-copy">Based on <strong>{template.sourceName}</strong>. You’re editing a new copy; the original template stays unchanged.</p>}
        {/* ── Header ──────────────────────────────────────────────────────────
            One row that never moves: who this is, what it adds up to, whether it is saved,
            and the one primary action, Assign (step 6c). "Saved just now" replaces Save
            template; Save now stays beside it for the coach who wants to be sure. */}
        <div className="hd">
          <div style={{ minWidth: 260, flex: "1 1 320px" }}>
            <button type="button" className="back" onClick={leave} disabled={!!uploads} style={{ marginBottom: 6 }}>← Library</button>
            <input aria-label="Workout or program name" value={name} onChange={(e) => setName(e.target.value)}
              style={{ fontFamily: DBU_DISPLAY, fontWeight: 600, fontVariationSettings: "'wdth' 112", fontSize: 34, letterSpacing: "-.01em", lineHeight: 1.05, color: DBU_INK,
                background: "transparent", border: 0, borderBottom: "1px solid transparent", padding: 0, width: "100%", outline: "none" }}
              onFocus={(e) => { e.target.style.borderBottomColor = DBU_LINE2; }}
              onBlur={(e) => { e.target.style.borderBottomColor = "transparent"; }} />
            <div className="meta">
              {single
                ? <span className="chip q">Single workout · {dbuMoves(day)} {dbuMoves(day) === 1 ? "move" : "moves"}</span>
                : <span className="chip q">{summary.weeks} {summary.weeks === 1 ? "week" : "weeks"} · {weekdayLabel} · {summary.sessions} {summary.sessions === 1 ? "session" : "sessions"}{summary.last ? " · last " + dbuShortDate(summary.last) : ""}</span>}
              <span className="saved" role="status">v{doc.version} · {saveLabel}</span>
              <button type="button" className="savenow" disabled={!!uploads || saveState === "saving"} onClick={() => flush()}>Save now</button>
            </div>
          </div>
          <div className="acts">
            {!single && <DbuLength weeks={doc.weeks.length} onLength={setLength} />}
            <button type="button" disabled={!!uploads || saveState === "saving"} onClick={() => flush(true)} style={dbuBtn(false)}>Publish</button>
            <button type="button" disabled={!!uploads} onClick={openAssign} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff" }}>Assign</button>
          </div>
        </div>

        <details className="cb-details">
          <summary>{single ? "Details" : "Program details"} <small>{single ? "Tags" : "Tags, start date, cover photo & introduction video"}{doc.cover ? " · Cover photo" : ""}{doc.video ? " · Video added" : ""}</small></summary>
          <div className="meta">
              <DbuTagPicker tags={doc.tags} customTags={customTags} onChange={(tags) => setDoc({ ...doc, tags })} />
              {!single && <span className="chip">
                Starts
                <input type="date" aria-label="Reference start Monday the dates on this page are drawn for"
                  value={startISO} onChange={(e) => setStart(dbuMondayOf(e.target.value) || startISO)} />
              </span>}
          </div>
          {!single && <p>The reference date sets the dates shown here. Each client's own start is chosen at assign.</p>}
          {!single && <DbuCover value={doc.cover} onChange={(cover) => setDoc({ ...doc, cover })} onBusy={uploadCount} />}
          {!single && <p><strong>Program introduction video · Optional.</strong> Explain the entire program, its goals, structure and what to expect.</p>}
          {!single && <ShapeVideoAttachment value={doc.video} title="Program introduction" onChange={video=>setDoc({...doc,video})} upload={dbuUploadVideo} onBusy={uploadCount} clips={clips}/>}
        </details>

        {/* ⚠ F6 retired *Save draft* and *Publish template* into autosave + Publish — but the
            header's button was ALSO the retry, so a coach whose save failed keeps a way to try
            again here, beside the other two recovery actions. */}
        {error && (
          <div role="alert" style={{ fontSize: 13.5, color: DBU_RUST, background: DBU_RUSTBG, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <p style={{ margin: "0 0 10px" }}>{error}</p>
            <button type="button" disabled={!!uploads || saveState === "saving"} style={{ ...dbuBtn(false), marginRight: 8 }} onClick={() => flush()}>Retry save</button>
            <button type="button" style={{ ...dbuBtn(false), marginRight: 8 }} onClick={() => { if (draft(latest.current)) onBack(); else setError("This browser could not retain your draft. Keep this page open and retry saving."); }}>Keep draft &amp; return to library</button>
            {saveConflict && <button type="button" disabled={!!uploads || saveState === "saving"} style={dbuBtn(false)} onClick={saveAsCopy}>Save as new copy</button>}
          </div>
        )}
        {doc.outlineOnly && <p style={{ fontSize: 13.5, color: DBU_INK2 }}>This imported outline has day or week titles only. Add exercises before assigning it as a structured workout.</p>}
        {notice && <p className="dmsg" role="status">{notice}</p>}

        {!single && !day && <>
          {/* ── The plan ───────────────────────────────────────────────────────
              ⚠ ONE WAY TO BUILD A PROGRAM: its plan (or the Sheet, the same document read
              move by move), the progression in a sentence and a chart, the sessions to drag in,
              and Assign, all on one screen. A session opens in the day canvas below, in the
              plan's place, and Back to the plan returns. */}
          <div className="tb">
            <DbuViewSwitch view={view} setView={setView} />
            <div style={{ flex: 1 }} />
            <button type="button" ref={addDayRef} style={dbuBtn(false)} onClick={addDay}>＋ Add a day</button>
            <button type="button" style={dbuBtn(false)} onClick={() => setWeeks([...doc.weeks, { ...DashBuilder.newWeek(), days: [{ ...DashBuilder.newDay("Day 1"), weekday: 0 }] }])}>＋ Week</button>
          </div>
          <DbuProgressionBar doc={doc} onRule={setRule} now={nowMarks} />
          <div className="stage">
            {view === "sheet"
              ? <DbuSheet doc={doc} dates={dates} setSel={selectDay} setWeeks={setWeeks} />
              : <DbuPlan doc={doc} dates={dates} peek={peek} onPeek={(w, d) => setPeek(peek && peek.w === w && peek.d === d ? null : { w, d })} setWeeks={setWeeks} uploads={uploads} onWeek={onWeek} onAddAt={addAt} onPlace={placeSession} />}
          </div>
          {peek && view !== "sheet" && doc.weeks[peek.w] && doc.weeks[peek.w].days[peek.d] && (
            <DbuPeek doc={doc} wi={peek.w} di={peek.d} dates={dates} onOpen={() => selectDay({ w: peek.w, d: peek.d })} onClose={() => setPeek(null)} />
          )}
          <DbuTray doc={doc} dayTemplates={dayTemplates} selfId={idRef.current} week={trayWeek} onAdd={addFromTray} />
          <DbuAssignPanel panelRef={assignRef} template={{ id: idRef.current, name, revision: revision.current }} doc={doc} clients={clients || []} usage={usage}
            live={!!live} persisted={persisted.current} preselectId={preselectId} emptyNote={emptyNote} onAssigned={onAssigned}
            onUpdateTheirs={live && persisted.current ? () => setUpdating(true) : null} beforeAssign={beforeAssign} />
        </>}

        {day && (
          /* ⚠ role="group", NOT "dialog": this panel is not modal and traps no focus. Escape
             goes back to the plan, as Done does — unless the Escape belonged to something
             inside it (a list, a strip, the walkthrough panel), which marks it handled. A
             single workout has no plan to go back to, so there Escape leaves it alone. */
          <div className={"drawer dash-thin-scroll" + (single ? " solo" : "")} ref={panelRef} role="group" tabIndex={-1} aria-label={(single ? "Workout · " : "Day editor · ") + day.name}
            onKeyDown={(e) => { if (e.key === "Escape" && !single && !e.defaultPrevented && !dbuImeComposing(e.nativeEvent) && !e.target.closest('[role="dialog"]')) { e.stopPropagation(); closeDayEditor(); } }}>
            <div className="dh">
              {/* ⚠ THE DAY'S NAME IS ITS HEADING, AND THE HEADING IS THE FIELD: it is the title the
                  client's card carries. In a program the line above it is the date the assignment
                  would write, and where the week sits in the program's length. */}
              <div className="dt">
                <div className="when">{single ? "Session title · what the client sees" : <>Week {sel.w + 1} of {doc.weeks.length}{dates[sel.w + ":" + sel.d] ? <> · <b>{dbuShortDate(dates[sel.w + ":" + sel.d])}</b></> : null}</>}</div>
                <label htmlFor="dbu-day-name" className="sr">Day name</label>
                <input id="dbu-day-name" className="dn" value={day.name} title="Rename this day" onChange={(e) => setDay({ ...day, name: e.target.value })} />
              </div>
              <div className="dacts">
                {!single && <button type="button" className="x" aria-label="Back to the plan" disabled={!!uploads} onClick={closeDayEditor}>← Plan</button>}
                {!single && view === "plan" && <button type="button" className="x" onClick={() => setView("sheet")} title="See this move across every week">Edit all {doc.weeks.length} weeks in the sheet</button>}
                {/* ⚠ The tree carried a per-day Copy button; the plan moves a day by dragging it
                    to another weekday, which is a different action. Duplication lands here — on
                    the day it is about. */}
                {!single && <button type="button" className="x" aria-label={"Duplicate " + day.name} onClick={() => {
                  const next = JSON.parse(JSON.stringify(day));
                  next.name += " (copy)";
                  next.id = crypto.randomUUID();
                  next.weekday = dbuNextFreeWeekday(doc.weeks[sel.w]);
                  setWeeks(doc.weeks.map((x, i) => (i === sel.w ? { ...x, days: [...x.days.slice(0, sel.d + 1), next, ...x.days.slice(sel.d + 1)] } : x)));
                  setSel({ w: sel.w, d: sel.d + 1 });
                }}>Duplicate day</button>}
                {!single && <button type="button" className="x" aria-expanded={dayTool === "copy"} disabled={doc.weeks.length < 2}
                  title={doc.weeks.length < 2 ? "Add a week to copy this day into" : undefined}
                  onClick={() => { setNotice(""); setDayTool(dayTool === "copy" ? null : "copy"); }}>Copy to weeks</button>}
                {!single && <button type="button" className="x danger" aria-expanded={dayTool === "delete"} disabled={onlyDay}
                  title={onlyDay ? "A program keeps at least one day" : undefined}
                  onClick={() => { setNotice(""); setDayTool(dayTool === "delete" ? null : "delete"); }}>Delete day</button>}
                {!single && <button type="button" className="x" aria-label="Close the day editor" disabled={!!uploads} onClick={closeDayEditor}>Done</button>}
              </div>
            </div>
            {dayTool === "copy" && <DbuCopyToWeeks doc={doc} wi={sel.w} di={sel.d} onCopy={copyDay} onCancel={() => setDayTool(null)} />}
            {dayTool === "delete" && <DbuDeleteDay day={day} wi={sel.w} onDelete={deleteDay} onCancel={() => setDayTool(null)} />}
            <div className="dtabs" role="tablist" aria-label="Session view">
              <button type="button" role="tab" id="dbu-tab-build" aria-selected={tab === "build"} aria-controls="dbu-pane" onClick={() => setTab("build")}>Build</button>
              <button type="button" role="tab" id="dbu-tab-client" aria-selected={tab === "client"} aria-controls="dbu-pane" onClick={() => setTab("client")}>Client view</button>
            </div>
            <div id="dbu-pane" role="tabpanel" aria-labelledby={tab === "build" ? "dbu-tab-build" : "dbu-tab-client"}>
              {/* Keyed by the day's PLACE as well as its id: `newDay` gives a day no id, so two
                  id-less days in one week shared a key and the second opened on the first's
                  selection. Kept mounted under Client view (hidden), so an upload started in the
                  build tab outlives a look at the client's card. */}
              <div hidden={tab !== "build"}>
                <DbuDayEditor
                  key={sel.w + ":" + sel.d + ":" + (day.id || "")}
                  busy={!!uploads}
                  day={day}
                  onChange={setDay}
                  onWeekday={setDayWeekday}
                  takenBy={dbuTakenByWeekday(week, sel.d)}
                  playlists={playlists}
                  clips={clips}
                  customMoves={ownMoves}
                  onUploading={uploadCount}
                  live={!!live}
                  clientId={preselectId || null}
                  progress={progress}
                  rpeProgress={rpeProgress}
                  rule={rule}
                />
              </div>
              {/* The EXACT card the client dashboard renders. */}
              {tab === "client" && <div className="dclient" aria-label="Client view">
                <DashWorkoutCard workout={previewCard} interactive={false} maxRows={99} />
              </div>}
            </div>
          </div>
        )}
      </div>

      {assigning && <DbuAssignModal template={{ id: idRef.current, name, revision: revision.current }} doc={doc} clients={clients} queue={queue} live={live} preselectId={preselectId} emptyNote={emptyNote} onAssigned={onAssigned} onClose={() => setAssigning(false)} />}
      {updating && <DbuFutureUpdates template={{ id: idRef.current, name }} clients={clients || []} onClose={() => setUpdating(false)} />}
    </fieldset>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────
// The facts line on a library card: what the program trains and what it needs, in the
// filters' own words so a coach can see why a card matched. "Full body" stands in for
// lower + upper, and "Bodyweight only" for Home, which it implies.
function dbuFacetLabel(facetKey, optionKey) {
  const f = DashBuilder.PROGRAM_FACETS.find((x) => x.key === facetKey);
  const o = f && f.options.find((x) => x.key === optionKey);
  return o ? o.label : optionKey;
}
function dbuCardFacts(info) {
  const focus = info.focus.includes("full") ? ["full", ...info.focus.filter((k) => k !== "lower" && k !== "upper" && k !== "full")] : info.focus;
  const kit = info.equipment.includes("bodyweight") ? info.equipment.filter((k) => k !== "home") : info.equipment;
  return [...focus.map((k) => dbuFacetLabel("focus", k)), ...kit.map((k) => dbuFacetLabel("equipment", k))].join(" · ");
}

// ── The library (the owner's coach review, step 6a: "the calmer library") ────
// "15 buttons for 5 programs, and the week's job not on the page." The week's job leads, in one
// line at Lift 2 (DbuWeekLine); every card is the same size, a cover in its goal's colour with
// the goal in words, who is on it as tier marks, one Assign and a ⋯; one row of filters; and the
// programs on one client's calendar as a plain list. Each block reads only what a read stores:
// the roster's program leg per client (DashBuilder.programWeekAhead), the usage read's ids
// (programWho), and both together (oneClientPrograms).
// ⚠ NO "SEND N READY". Assigning publishes every week of a program at once, so a ready week is
// already on the client's calendar: the store holds no unsent week, and nothing here sends one.
const DBU_SORTS = [
  { key: "newest", label: "Newest" },
  { key: "used", label: "Most used" },
  { key: "name", label: "Name A–Z" },
];
const dbuCount = (n, one, many) => n + " " + (n === 1 ? one : many);
// A leg's end is a calendar day stored at UTC midnight: "Nov 5", read as the day it is.
function dbuLegDay(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return m ? DBU_MON[Number(m[2]) - 1] + " " + Number(m[3]) : null;
}
// One client's next week in words: { tone, label, detail }.
function dbuNextWeekWords(n) {
  if (!n) return { tone: "quiet", label: "Not their current program", detail: "" };
  if (n.state === "ready") {
    if (n.why === "starts") return { tone: "ready", label: "Ready", detail: "Not started yet" + (n.weeks ? " · " + dbuCount(n.weeks, "week", "weeks") + " on their calendar" : "") };
    if (n.why === "next-program") return { tone: "ready", label: "Ready", detail: n.next + " is assigned after it" };
    return { tone: "ready", label: "Ready", detail: "Week " + n.nextWeek + " of " + n.weeks + " is on their calendar" };
  }
  if (n.state === "need") {
    const day = dbuLegDay(n.endsAt);
    return { tone: "need", label: "Needs you", detail: (n.why === "ended" ? "Ended" + (day ? " " + day : "") : "Final week") + " · nothing assigned after it" };
  }
  if (n.state === "paused") return { tone: "quiet", label: "Paused", detail: "" };
  return { tone: "quiet", label: "Length not recorded", detail: "" };
}
function dbuWeekOf(row) {
  return row.week != null && row.weeks != null ? "Week " + row.week + " of " + row.weeks : row.next && row.next.why === "starts" ? "Not started" : "";
}
// A person with their tier's gem (hollow when unknown) and their name.
function DbuPerson({ p }) {
  return <span className="dash-lib-person">{typeof DashClientGem === "function" && <DashClientGem points={p.rankPoints} title={p.name} />}<b>{p.name}</b></span>;
}

// The week's job: who is on a program next week, how many are ready and how many need the coach.
function dbuWeekModel(roster, clients) {
  if (roster === "loading" || roster === "unread") return { roster, ahead: null };
  return { roster, ahead: DashBuilder.programWeekAhead(clients) };
}
// One program per client, their current one: "due" is its next week, ready or not.
function DbuWeekLine({ model, onReview }) {
  const label = "Next week";
  if (!model.ahead) return <DashLibTopLine label={label} figure="—" line="programs due" note={model.roster === "unread" ? DASH_LIB_ROSTER_UNREAD : "Reading your roster…"} />;
  const a = model.ahead;
  const on = a.ready + a.need + a.unknown;
  const settling = a.pending > 0 && !a.rows.length;
  const notes = [];
  if (a.pending) notes.push(dbuCount(a.pending, "client is", "clients are") + " still loading");
  if (a.unread) notes.push(dbuCount(a.unread, "client’s program", "clients’ programs") + " couldn’t be read");
  if (!settling && !on && !a.paused && !a.pending && !a.unread) notes.push(a.total ? "None of your clients is on one of your programs." : "No clients on your roster yet.");
  const chips = settling ? null : <>
    {a.ready > 0 && <DashLibStatus tone="ready" title="Their next week is already on their calendar">{a.ready} ready</DashLibStatus>}
    {a.need > 0 && <DashLibStatus tone="need" title="Their program ends with nothing assigned after it">{a.need} need you</DashLibStatus>}
    {a.unknown > 0 && <DashLibStatus>{dbuCount(a.unknown, "length", "lengths")} not recorded</DashLibStatus>}
    {a.paused > 0 && <DashLibStatus>{a.paused} paused</DashLibStatus>}
  </>;
  return <DashLibTopLine label={label} figure={settling ? "—" : on} line={on === 1 && !settling ? "program due" : "programs due"}
    chips={chips} note={notes.length ? notes.join(" · ") : null}
    actions={<button type="button" style={dbuLibBtn(false)} disabled={!a.rows.length} onClick={onReview}>Review</button>} />;
}
function DbuWeekDrawer({ ahead, onPick, onClose }) {
  return <DashLibDrawer title="Due next week" onClose={onClose}
    sub="Each client’s current program from your calendar. Ready means their next week is already on it: assigning publishes every week at once.">
    <ul className="dash-lib-rows">{ahead.rows.map((r) => {
      const w = dbuNextWeekWords(r.next);
      return <li key={r.id} className="dash-lib-row" data-next={r.next.state}>
        <div className="dash-lib-row-main">
          <DbuPerson p={r} />
          <span className="dash-lib-row-what">{r.program}{dbuWeekOf(r) ? " · " + dbuWeekOf(r) : ""}</span>
        </div>
        <div className="dash-lib-row-side">
          <DashLibStatus tone={w.tone}>{w.label}</DashLibStatus>
          {w.detail && <span className="dash-lib-row-detail">{w.detail}</span>}
          {r.next.state === "need" && <button type="button" style={dbuLibBtn(false)} onClick={() => onPick(r.id)}>Choose a program</button>}
        </div>
      </li>;
    })}</ul>
  </DashLibDrawer>;
}

// Who is on one program, on its card. `usage` is the usage read; `roster` the roster's state.
function DbuWho({ entry, usage, roster, clients, preview }) {
  let body;
  if (preview) body = <span className="dash-lib-quiet">Preview · no client calendars to read</span>;
  else if (usage.state !== "ready") body = <span className="dash-lib-quiet">{usage.state === "error" ? "Couldn’t read who’s on it" : "Checking who’s on it…"}</span>;
  else {
    const who = DashBuilder.programWho(entry, clients);
    // ⚠ A CAPPED READ CAN ONLY UNDER-COUNT: "5+ clients", and never "No clients yet".
    const many = who.count + (usage.capped ? "+ clients" : who.count === 1 ? " client" : " clients");
    if (!who.count) body = <span className="dash-lib-quiet">{usage.capped ? "None found on the calendars read" : "No clients yet"}</span>;
    else if (roster !== "live" && roster !== "demo") body = <span className="dash-lib-quiet">{many} · {roster === "unread" ? DASH_LIB_ROSTER_UNREAD : "Reading your roster…"}</span>;
    else if (!who.people) body = <span>{many}</span>;
    else body = <><DashLibPeople people={who.people} extra={who.count - who.people.length} />{usage.capped && <span className="dash-lib-quiet">· not every calendar was read</span>}</>;
  }
  return <div className="dash-lib-who"><span className="dash-lib-who-label">On it</span>{body}</div>;
}

// The programs on exactly one client's calendar: a plain list, the ones not ready first.
function DbuOneClient({ rows, roster, onOpen }) {
  if (!rows || !rows.length) return null;
  return <section className="dash-lib-list" aria-label="On one client only">
    <h3 className="dash-lib-list-h">On one client only</h3>
    <p className="dash-lib-list-sub">Programs on exactly one client’s calendar, the ones that need you first.</p>
    {roster === "unread" ? <p className="dash-lib-quiet" role="status">{DASH_LIB_ROSTER_UNREAD}</p> : <ul className="dash-lib-rows">{rows.map((r) => {
      const w = dbuNextWeekWords(r.next);
      return <li key={r.template.id} className="dash-lib-row">
        <div className="dash-lib-row-main">
          <button type="button" className="dash-lib-row-name" onClick={() => onOpen(r.template)}>{r.template.name}</button>
          <span className="dash-lib-row-what">{r.person ? <DbuPerson p={r.person} /> : "A client not on your roster"}{r.week != null ? " · Week " + r.week + " of " + r.weeks : ""}</span>
        </div>
        <div className="dash-lib-row-side"><DashLibStatus tone={w.tone}>{w.label}</DashLibStatus>{w.detail && <span className="dash-lib-row-detail">{w.detail}</span>}</div>
      </li>;
    })}</ul>}
  </section>;
}

function TrainerProgramsPage() {
  const {clients,queue,today:live,source}=useDashboard('trainer');
  // The client a program is being chosen for: the link's (?client=, from Today or a client's
  // file), or the one the week's drawer picked on this page.
  const [pickFor,setPickFor]=React.useState(null);
  const forClient = pickFor || (typeof dashRouteParam === 'function' ? dashRouteParam('client') : null);
  const [templates,setTemplates]=React.useState(null),[view,setView]=React.useState(null);
  const [filters,setFilters]=React.useState(DFB_EMPTY),[error,setError]=React.useState('');
  const [ownerId,setOwnerId]=React.useState(null),[refresh,setRefresh]=React.useState(0);
  const libraryOwner = React.useRef(null);
  // Whether the library has answered once. "＋ Program" works while it is still loading,
  // and the first answer is not an account CHANGE: treating it as one (null → this coach)
  // closed the builder under the coach's hands. The meal library carries the same flag.
  const resolved = React.useRef(false);
  const [playlists,setPlaylists]=React.useState([]),[assignFor,setAssignFor]=React.useState(null),[updateFor,setUpdateFor]=React.useState(null);
  const [recoveries,setRecoveries]=React.useState([]);
  // ⚠ WHO IS ON EACH PROGRAM IS ITS OWN READ, and an unread one is not "nobody". Until
  // it lands (and in the preview, where no program is on anyone's calendar) the In use
  // filter says why it cannot answer instead of offering an empty "No"; a failed
  // REFRESH keeps the reading the page already had, because a stale count is still a
  // count and a blank is a claim.
  const [usage,setUsage]=React.useState({state:'idle'});
  const usageRead=React.useRef(0);
  const loadUsage=React.useCallback(async()=>{
    const read=++usageRead.current;
    setUsage(u=>u.state==='ready'?u:{state:'loading'});
    try{
      const res=await fetch('/api/coach/plans/usage?today='+dbuISO(new Date()),{credentials:'same-origin'});
      const data=await res.json().catch(()=>null);
      if(!res.ok || !data || !data.usage || typeof data.usage!=='object')throw new Error('usage');
      if(read===usageRead.current)setUsage({state:'ready',map:data.usage,capped:!!data.capped});
    }catch(e){if(read===usageRead.current)setUsage(u=>u.state==='ready'?u:{state:'error'});}
  },[]);
  const isLive=!!ownerId;
  // ⚠ ?plan=<id> OPENS THAT PROGRAM, ONCE: Nora's "Open in builder" after she saves a draft
  // (src/lib/ai/actions.mjs). Read once the library has answered, and only once, so closing
  // the builder does not snap it open again on the next refresh.
  const openPlan = typeof dashRouteParam === 'function' ? dashRouteParam('plan') : null;
  const planOpened = React.useRef(false);
  const [planMissing,setPlanMissing]=React.useState(false);
  React.useEffect(()=>{
    if(!openPlan||planOpened.current||!templates||!resolved.current)return;
    planOpened.current=true;
    const t=templates.find(x=>String(x.id)===String(openPlan));
    if(t)setView(t);else setPlanMissing(true);
  },[templates,openPlan]);
  React.useEffect(()=>{
    let on=true;
    (async()=>{
      try{
        const res=await fetch('/api/coach/plans?kind=program',{credentials:'same-origin'});
        const data=await res.json().catch(()=>null);
        if(!res.ok || !data)throw new Error(data?.error || 'Could not load your workouts. Check your connection and retry.');
        if(on){
          // A different account is a different library: nothing from the last one — the
          // open program, the filters, who was on what — may carry across.
          // Everything this page holds for one account (Codex on #2645: the drawer's pick, the open
          // review, the last notice, who was on what) goes with it.
          if(resolved.current&&libraryOwner.current!==data.ownerId){setView(null);setAssignFor(null);setUpdateFor(null);setFilters(DFB_EMPTY);usageRead.current++;setUsage({state:'idle'});setPickFor(null);setReviewing(false);setNotice('');}
          resolved.current=true;libraryOwner.current=data.ownerId;setOwnerId(data.ownerId);setTemplates((data.plans||[]).map(ShapeWorkoutDocument.normalizeWorkoutPlan));setError('');setRecoveries(Object.entries(dbuReadDrafts(data.ownerId)));
          if(data.ownerId)loadUsage();
        }
      // Until the dashboard knows whether anyone is signed in (`source` still null), a
      // failed read means nothing yet: stay on Loading instead of flashing an error at a
      // visitor who is a moment from the preview.
      }catch(e){if(on&&source!=null){if(source==='demo' && !libraryOwner.current){resolved.current=true;setTemplates(DashBuilder.demoTemplates());setRecoveries(Object.entries(dbuReadDrafts(null)));setError('');}else{setError(e.message || 'Could not load your workouts. Check your connection and retry.');setTemplates(null);}}}
      try{const res=await fetch('/api/coach/soundtracks',{credentials:'same-origin'});if(!res.ok)return;const data=await res.json();if(on)setPlaylists((data.soundtracks||data.playlists||[]).map(dbuPlaylistChoice));}catch(e){}
    })();
    return()=>{on=false;};
  },[source,refresh]);
  React.useEffect(()=>{const update=()=>{if(!document.hidden)setRefresh(n=>n+1);};window.addEventListener('focus',update);document.addEventListener('visibilitychange',update);return()=>{window.removeEventListener('focus',update);document.removeEventListener('visibilitychange',update);};},[]);
  // Every filter reads the program's own facts (DashBuilder.programFacts); the tag row's
  // options are Shape's goals plus every tag this coach has used.
  const tagFacet=React.useMemo(()=>DashBuilder.programTagFacet(templates||[]),[templates]);
  const items=React.useMemo(()=>(templates||[]).map(t=>{
    const entry=usage.state==='ready' && Object.prototype.hasOwnProperty.call(usage.map,t.id) ? usage.map[t.id] : null;
    return {t,...DashBuilder.programFacts(t,usage.state==='ready'?{clients:entry?Number(entry.clients)||0:0,capped:usage.capped}:null)};
  }),[templates,usage]);
  const useNote=usage.state==='ready'?null
    :usage.state==='error'?<>Couldn’t read who is on each program just now.<br/><button type="button" style={dbuLibBtn(false)} onClick={loadUsage}>Retry</button></>
    :isLive?'Checking who is on each program…':'Live only — in the preview no program is on anyone’s calendar.';
  // ⚠ THE COUNT RUNS ON THE FACETS THE BAR SHOWS. A capped read drops In use · No from
  // the bar; counting against the unpruned list would keep a No chosen before
  // the cap narrowing the library to nothing, with no chip left on screen to undo it.
  const barFacets=DashBuilder.PROGRAM_FACETS.map(f=>f.key==='use'&&usage.state==='ready'&&usage.capped?{...f,help:f.help+' There were too many upcoming sessions to read them all, so this can only answer Yes — a program without it may still be on someone’s calendar.',options:f.options.filter(o=>o.key!=='idle')}:f);
  const run=dfbRun(items,[...barFacets,tagFacet],filters);
  // ⚠ THE PREVIEW IS THE SIGNED-OUT LIBRARY, NOTHING ELSE. Until the library has answered, the
  // page cannot tell a visitor from a coach whose roster read failed, so neither the band nor
  // a sample person shows; once it has, a signed-in library never shows the sample cast.
  const roster=source==='demo'&&!resolved.current?'loading':dashLibRosterState(source,isLive);
  const preview=roster==='demo';
  // The people the page may name: the coach's roster, or the preview's cast under the band.
  const people=roster==='live'||roster==='demo'?clients:[];
  // What an empty client list in the assign sheet means: unread is not "no clients".
  const emptyNote=roster==='unread'?DASH_LIB_ROSTER_UNREAD:roster==='loading'?'Reading your roster…':'No clients yet.';
  const targetPerson=people.find(c=>c.profile.id===forClient)||null;
  const [sort,setSort]=React.useState('newest');
  const usedOf=t=>usage.state==='ready'&&Object.prototype.hasOwnProperty.call(usage.map,t.id)?Number(usage.map[t.id].clients)||0:0;
  const shown=sort==='name'?[...run.shown].sort((a,b)=>String(a.t.name).localeCompare(String(b.t.name)))
    :sort==='used'&&usage.state==='ready'?[...run.shown].sort((a,b)=>usedOf(b.t)-usedOf(a.t)):run.shown;
  const most=usage.state==='ready'?DashBuilder.mostUsedProgram(usage.map,usage.capped):null;
  const week=dbuWeekModel(roster,people);
  const [reviewing,setReviewing]=React.useState(false);
  const oneRows=usage.state==='ready'&&(roster==='live'||roster==='unread')?DashBuilder.oneClientPrograms(templates||[],usage.map,usage.capped,people):null;
  const [notice,setNotice]=React.useState('');
  // ⚠ AN ASSIGN CHANGES WHO IS ON WHAT (Codex on #2645): the card's "On it" is the usage read's, and the
  // week line is each client's program leg on the roster's overview. Both are read again once a sheet
  // has published, so the page never invites the same assign twice: the usage now, and the roster by
  // the event useDashboard already listens for, one client at a time (their overviews only).
  const assigned=ids=>{
    if(libraryOwner.current)loadUsage();
    for(const id of ids||[]){try{window.dispatchEvent(new CustomEvent('shape:coach-progress-refresh',{detail:{clientId:id}}));}catch(e){}}
  };
  // Delete: the plans route's own DELETE (the app's coach Plans uses it), behind ShapeConfirm. A
  // program is a template; what clients were assigned is a snapshot on their calendar, and stays.
  const canDelete=isLive&&typeof window!=='undefined'&&!!(window.ShapeConfirm&&window.ShapeConfirm.open);
  const remove=async t=>{
    const n=usedOf(t);
    const ok=await window.ShapeConfirm.open({title:'Delete this program?',name:t.name,confirmLabel:'Delete program',
      message:'It leaves your library for good.'+(n?' The '+dbuCount(n,'client','clients')+' on it keep every session already on their calendar.':' Sessions already on a client’s calendar stay there.')});
    if(!ok)return;
    setNotice('');
    try{
      const res=await fetch('/api/coach/plans',{method:'DELETE',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:t.id})});
      const data=await res.json().catch(()=>null);
      if(!res.ok)throw new Error((data&&data.error)||'Couldn’t delete that program. Retry.');
      setTemplates(prev=>(prev||[]).filter(x=>x.id!==t.id));
      setNotice(t.name+' is deleted.');
    }catch(e){setNotice(e.message||'Couldn’t delete that program. Retry.');}
  };
  // Every saved session, for a program's tray (step 6c): the program it comes from and that program's
  // tags, so its card wears the program's colour with the tag in words.
  const days=(templates||[]).flatMap(t=>t.detail.builder.weeks.flatMap(w=>w.days.map(day=>({name:t.name+' · '+day.name,dayName:day.name,program:t.name,programId:t.id,tags:t.detail.builder.tags,day}))));
  // Every move this coach has written that Shape does not list — derived from
  // their own saved programs, so the picker can offer it back with no store.
  const customMoves=DashBuilder.customMovesFromTemplates(templates||[]);
  const customTags=DashBuilder.customTagsFromTemplates(templates||[]);
  const clips=[...new Map((templates||[]).flatMap(t=>[
    {name:t.name+' · Introduction',url:ShapeWorkoutDocument.videoUrl(t.detail.builder.video)},
    ...t.detail.builder.weeks.flatMap(w=>w.days.map(d=>({name:d.name+' · Walkthrough',url:ShapeWorkoutDocument.videoUrl(d.video)}))),
    ...(t.detail.media||[]).filter(m=>m.type==='video').map(m=>({name:m.name||t.name,url:ShapeWorkoutDocument.videoUrl(m.url)})),
    ...t.detail.builder.weeks.flatMap(w=>w.days.flatMap(d=>d.blocks.flatMap(b=>b.rows.filter(r=>r.video).map(r=>({name:r.name,url:ShapeWorkoutDocument.videoUrl(r.video)}))))),
  ]).filter(c=>c.url).map(c=>[c.url,c])).values()];
  const create=type=>{const builder=DashBuilder.newProgram();builder.weeks[0].days[0].name='Day 1';setView({name:type==='workout'?'New workout':'New program',published:false,detail:{buildType:type,builder}});};
  const saved=({plan})=>{setTemplates(prev=>[plan,...(prev||[]).filter(t=>t.id!==plan.id)]);setRecoveries(Object.entries(dbuReadDrafts(ownerId)));};
  return <React.Fragment>
    {preview&&<DashDemoBand/>}
    <DashPage tourHero="hero-programs" navItems={trainerNavItems('programs')} payoutCard={trainerPayoutCard}
      eyebrow="WORKOUT LIBRARY" title={<>Workouts <span style={{ fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontWeight: 500, fontSize: "0.86em", letterSpacing: 0 }}>&amp;</span> programs</>} subtitle={view?'Build once. Use the same workout on the website and app.':'Reusable single days and programs, with demonstrations attached to each exercise.'}>
      {targetPerson && <p role="status">Choose a program for {targetPerson.profile.name}{/\.$/.test(targetPerson.profile.name)?'':'.'} The assignment will have this client selected.{pickFor&&<> <button type="button" style={dbuLibBtn(false)} onClick={()=>setPickFor(null)}>Not now</button></>}</p>}
      {view?<DbuBuilder key={view.id||view.name} template={view} preselectId={targetPerson ? forClient : null} clients={people} queue={queue} live={isLive} ownerId={ownerId} playlists={playlists} clips={clips} dayTemplates={days} customMoves={customMoves} customTags={customTags} emptyNote={emptyNote} onAssigned={assigned} usage={usage} onBack={()=>{setView(null);setRefresh(n=>n+1);}} onSaved={saved}/>:<>
        <div className="dbu-library-actions">
          <button type="button" style={dbuLibBtn(true)} onClick={()=>create('workout')}>＋ Single workout day</button>
          <button type="button" style={dbuLibBtn(false)} onClick={()=>create('program')}>＋ Program</button>
          <button type="button" className="dbu-library-refresh" onClick={()=>setRefresh(n=>n+1)}>Refresh</button>
        </div>
        {!!recoveries.length&&<div role="status" style={{padding:14,border:'1px solid var(--sh-gold, #d8a23a)',marginBottom:16}}><strong>Recover your work</strong>{recoveries.map(([id,draft])=><div key={id} style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:8}}><span>{draft.name} · draft on this device</span><button style={dbuLibBtn(false)} onClick={()=>setView(dbuRecoveredTemplate(id,draft,templates))}>Resume draft</button></div>)}</div>}
        {error&&<p role="alert">{error} <button style={dbuLibBtn(false)} onClick={()=>setRefresh(n=>n+1)}>Retry</button></p>}
        {planMissing&&<p role="status">That program isn’t in your library yet. If you just saved it from Nora, refresh in a moment.</p>}
        {/* The week's job, the page's highest block (Lift 2). */}
        <DbuWeekLine model={week} onReview={()=>setReviewing(true)}/>
        {templates===null&&!error&&<p role="status">Loading workouts…</p>}
        {templates?.length===0&&<div><p>No workouts yet. Create a single day or program to start your library.</p>{window.ShapeAskNoraLink&&<window.ShapeAskNoraLink label="Ask Nora to draft one" draft="Draft a workout for me: "/>}</div>}
        {notice&&<p role="status" className="dash-lib-quiet">{notice}</p>}
        {!!templates?.length&&<div className="dbu-library-filters">
          {/* ⚠ ONE ROW: search, type, goal and sort, the rest behind More filters. EVERY
              FILTER SAYS WHAT IT WOULD LEAVE: options inside one filter widen it, two
              filters narrow each other, and the count beside Clear is the result. */}
          <DashFilterBar facets={[...barFacets,tagFacet]} primaryFacetKeys={['type','tags']} run={run} state={filters} setState={setFilters} one="program" many="programs" placeholder="Find a program…" notes={{use:useNote}}
            extra={<DashLibSort value={sort} onChange={setSort} options={DBU_SORTS.map(o=>o.key==='used'&&usage.state!=='ready'?{...o,disabled:true}:o)}/>}/>
          {!customTags.length&&!items.some(x=>x.keys.tags.length)&&<p style={{...dbuLibMeta,fontSize:9,color:DBU_INK2,margin:'10px 0 0'}}>Tag a program under its name in the builder to file it here.</p>}
        </div>}
        {!!templates?.length&&!run.shown.length&&<p role="status" style={{fontSize:14,color:DBU_INK2}}>No programs match these filters. <button type="button" style={dbuLibBtn(false)} onClick={()=>setFilters(DFB_EMPTY)}>Clear filters</button></p>}
        {/* ⚠ EVERY CARD THE SAME SIZE, ONE PRIMARY. Use as template, Edit and Update future
            assignments were three more buttons on every card ("15 buttons for 5 programs");
            they live in the ⋯ now, and a click on the card opens the builder. The most-used
            program gets a chip, not a bigger card. auto-FILL, not auto-fit: a filter that
            leaves one program would otherwise stretch its card across the library. */}
        <div className="dash-lib-grid">{shown.map(({t,info})=>{
          const entry=usage.state==='ready'&&Object.prototype.hasOwnProperty.call(usage.map,t.id)?usage.map[t.id]:null;
          const single=t.detail.buildType==='workout';
          const tag=info.tags[0]||null;
          const facts=[...info.tags.slice(1).map(x=>x.label),dbuCardFacts(info)].filter(Boolean).join(' · ');
          return <DashLibCard key={t.id} name={t.name} onOpen={()=>setView(t)} openTitle={'Open '+t.name+' in the builder'}
            cover={{color:tag?tag.c:DBU_INK3,tone:tag?dashLibKind(tag.key):null,kind:tag?tag.label:(single?'Single day':'Program'),badges:<>
              {most&&most.id===t.id&&<span className="dash-lib-badge" data-most="">Most used · {dbuCount(most.clients,'client','clients')}</span>}
              {!t.published&&<span className="dash-lib-badge">Draft</span>}
            </>}}
            meta={single?'Single day · '+dbuCount(info.moves,'move','moves'):'Program · '+dbuCount(info.weeks,'week','weeks')+' · '+dbuCount(info.perWeek,'day','days')+' a week'}
            primary={<button type="button" style={dbuLibBtn(true)} onClick={()=>setAssignFor(t)}>Assign</button>}
            menu={<DashLibMenu label={'More for '+t.name} items={[
              {key:'edit',label:'Edit',onSelect:()=>setView(t)},
              {key:'copy',label:'Use as template',onSelect:()=>setView(coachTemplateCopy(t))},
              isLive&&{key:'future',label:'Update future assignments',onSelect:()=>setUpdateFor(t)},
              canDelete&&{key:'delete',label:'Delete',danger:true,onSelect:()=>remove(t)},
            ]}/>}>
            {facts&&<p className="dash-lib-facts">{facts}</p>}
            <DbuWho entry={entry} usage={usage} roster={roster} clients={people} preview={preview}/>
          </DashLibCard>;})}</div>
        <DbuOneClient rows={oneRows} roster={roster} onOpen={t=>setView(t)}/>
      </>}
    </DashPage>
    {reviewing&&week.ahead&&<DbuWeekDrawer ahead={week.ahead} onClose={()=>setReviewing(false)} onPick={id=>{setPickFor(id);setReviewing(false);}}/>}
    {updateFor&&<DbuFutureUpdates template={updateFor} clients={people} onClose={()=>setUpdateFor(null)}/>}
    {assignFor&&<DbuAssignModal template={{id:assignFor.id,name:assignFor.name,revision:assignFor.detail.revision}} doc={assignFor.detail.builder} clients={people} queue={queue} live={isLive} preselectId={targetPerson ? forClient : null} emptyNote={emptyNote} onAssigned={assigned} onClose={()=>setAssignFor(null)}/>}
  </React.Fragment>;
}

Object.assign(window, { TrainerProgramsPage, DbuBuilder, DbuAssignModal });
