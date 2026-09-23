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
// dashFilterBar (the library's filters) → this file.

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
// `.fld` and `.lbl`.
const dbuField = { boxSizing: "border-box", display: "flex", alignItems: "center", height: 40, padding: "0 12px", borderRadius: 9, border: "1px solid " + DBU_LINE2, background: DBU_WH, fontFamily: DBU_BODY, fontSize: 14, color: DBU_INK, outline: "none" };
// ⚠ WHILE AN IME IS COMPOSING, ITS KEYSTROKES BELONG TO IT. The Enter that confirms a
// candidate and the Escape that cancels one are the IME's, not the control's. keyCode 229
// is Safari's form: WebKit ends the composition BEFORE the keydown for the Enter that
// confirms it, so `isComposing` already reads false there.
const dbuImeComposing = (e) => !!(e && (e.isComposing || e.keyCode === 229));
// The row's secondary controls: a step quieter than dbuBtn, still past the floor.
const dbuRowBtn = { display: "inline-flex", alignItems: "center", justifyContent: "center", minWidth: 32, height: 32, padding: "0 10px", borderRadius: 7, border: "1px solid " + DBU_LINE2, background: DBU_WH, color: DBU_INK, fontFamily: DBU_BODY, fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap", cursor: "pointer", boxSizing: "border-box" };
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
// than a closure: the Grid's drag lives in `DbuGrid` and the day editor's Training-day
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
async function dbuUploadVideo(file) {
  const client = window.shapeDb && window.shapeDb.client;
  if (!client) throw new Error("Sign in to upload a demonstration.");
  const {data, error:authError} = await client.auth.getUser();
  if (authError || !data?.user) throw new Error("Sign in to upload a demonstration.");
  const ext = String(file.name || "").split(".").pop().toLowerCase();
  if (!['mp4','mov','m4v','webm'].includes(ext)) throw new Error("Choose an MP4, MOV, M4V or WebM video.");
  if (file.size > 200 * 1024 * 1024) throw new Error("Keep the video under 200 MB.");
  const path = data.user.id + "/exercise/" + crypto.randomUUID() + "." + ext;
  const {error} = await client.storage.from("coach-media").upload(path,file,{upsert:false,contentType:file.type || ({mov:'video/quicktime',webm:'video/webm'}[ext] || 'video/mp4')});
  if (error) throw error;
  const {data:media} = client.storage.from("coach-media").getPublicUrl(path);
  if (!media?.publicUrl) throw new Error("Upload did not return a playable link. Retry.");
  return media.publicUrl;
}

// ── The floating day panel: where it sits, and how it is moved ───────────────
// ⚠ IT WAS ANCHORED TO THE PAGE AND BUDGETED AGAINST THE VIEWPORT, and those two
// cannot both be true. `position:absolute;top:-8px` put its top wherever the stage
// happened to be while `max-height:calc(100vh - 140px)` sized it against the
// screen. Measured at 1440x940 in Sheet: top y 496, height 800, so its bottom sat
// at 1296 — **556px below the fold** — with 2,933px of scrollable content inside a
// 798px box. Reaching the lower half meant scrolling the page, which carried its
// own Done and Duplicate buttons off the top. Fixed positioning makes the budget
// correct by construction: the box now lives in the same coordinate space as the
// number that bounds it, so `maxHeight` below is exact rather than hopeful.
//
// ⚠ AND IT IS DRAGGABLE ON THE OWNER'S RULING — "floating but can be moved
// around...dragged. Free moving" — which is what answers the other half of the
// measurement. In Sheet the panel sat at x 978 over a Week 2 column running
// 990→1367: covered entirely, on the one view whose whole purpose is reading weeks
// left to right. A coach now moves it off whatever they are reading instead of
// choosing between the panel and the column.
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

const DBU_PANEL_W = 400;   // matches `.drawer.float`'s width
const DBU_PANEL_GAP = 12;  // the margin it keeps to every screen edge
const DBU_PANEL_MIN_H = 160; // enough of it to stay grabbable

// ⚠ CLAMPED ON EVERY MOVE **AND** ON RESIZE, because a floating control you can
// lose is worse than one that covers something. `y` is bounded so at least the
// header stays on screen; the panel's own height then takes whatever is left
// below it, so it can never end up extending past the bottom edge again.
function dbuClampPanel(x, y, w) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const width = w || DBU_PANEL_W;
  return {
    x: Math.min(Math.max(DBU_PANEL_GAP, x), Math.max(DBU_PANEL_GAP, vw - width - DBU_PANEL_GAP)),
    y: Math.min(Math.max(DBU_PANEL_GAP, y), Math.max(DBU_PANEL_GAP, vh - DBU_PANEL_MIN_H - DBU_PANEL_GAP)),
  };
}

// Where it opens: beside the canvas, as before — but raised when the stage sits so
// far down the page that opening level with it would leave a letterbox of panel.
// `DBU_PANEL_OPEN_H` is the height worth having before the internal scroll starts
// doing the work.
const DBU_PANEL_OPEN_H = 420;
function dbuDefaultPanelPos(stage) {
  const vh = window.innerHeight;
  const r = stage && stage.getBoundingClientRect ? stage.getBoundingClientRect() : null;
  const x = r ? r.right - DBU_PANEL_W + 10 : window.innerWidth - DBU_PANEL_W - DBU_PANEL_GAP;
  const top = r ? r.top - 8 : DBU_PANEL_GAP;
  return dbuClampPanel(x, Math.min(Math.max(DBU_PANEL_GAP, top), Math.max(DBU_PANEL_GAP, vh - DBU_PANEL_OPEN_H - DBU_PANEL_GAP)), DBU_PANEL_W);
}

// ⚠ BELOW 1100px THE PANEL IS NOT FLOATING AT ALL — `.drawer.float`'s media query
// drops it back into the flow — so no inline position may be written there or it
// would win over the stylesheet and pin a phone-width panel to the viewport.
// Dragging is a wide-screen affordance; the stacked panel needs none.
function useDbuFloating() {
  const [floating, setFloating] = React.useState(() => typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(min-width: 1101px)').matches : true);
  React.useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia('(min-width: 1101px)');
    const on = (e) => setFloating(e.matches);
    mq.addEventListener ? mq.addEventListener('change', on) : mq.addListener(on);
    return () => { mq.removeEventListener ? mq.removeEventListener('change', on) : mq.removeListener(on); };
  }, []);
  return floating;
}

// ── One drag rule, two floating panels ───────────────────────────────────────
// ⚠ THE DAY EDITOR AND THE CLIENT PREVIEW SHARE THIS rather than each carrying
// its own pointer-capture dance. They open in different corners at different
// widths — but "grab the header, stay on screen, and move by keyboard too" is
// ONE rule, and this repo already records what the other bet costs: `useCoachDoc`
// was the third line-for-line copy of one store and the copies had drifted.
function useDbuDrag({ enabled, open, defaultPos }) {
  const ref = React.useRef(null);
  const [pos, setPos] = React.useState(null);
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef(null);
  // Held on a ref so the open effect can read today's closure without listing a
  // fresh function identity as a dependency (which would re-place the panel on
  // every render).
  const defRef = React.useRef(defaultPos); defRef.current = defaultPos;
  // ⚠ THE WIDTH IS MEASURED, NEVER DECLARED. `.pop` carries
  // `max-width:calc(100vw - 40px)`, so below ~384px it is genuinely narrower
  // than the 344 it asks for — and a clamp against the constant bounds a box
  // that is not the one on screen.
  const rect = () => (ref.current && ref.current.getBoundingClientRect ? ref.current.getBoundingClientRect() : null);
  // ⚠ POINTER EVENTS, NOT MOUSE — one code path covers mouse, trackpad, pen and
  // touch, and `setPointerCapture` keeps the drag alive when the pointer outruns
  // the header (which it does: the header is ~40px tall and the gesture crosses
  // a 1440px screen).
  const onGrab = (e) => {
    if (!enabled || !ref.current) return;
    // A press on a control is that control's, never a drag — EXCEPT the grip.
    // ⚠ THE GRIP IS A `<button>`, SO IT MATCHED THIS EXCLUSION: the one element
    // that LOOKS like the handle was the one element that could not start a
    // drag. Shipped in #2144, found by reading rather than by a report.
    const hit = e.target.closest && e.target.closest('button,a,input,select,textarea');
    if (hit && !(e.target.closest && e.target.closest('.gh'))) return;
    // ⚠ ONE POINTER DRIVES A DRAG. A second finger landing on the header while the
    // first is still dragging used to REPLACE the drag — so the panel stopped
    // following the hand moving it and waited on the finger that was only
    // resting. The same pointer pressing again (a mouse whose last `pointerup`
    // landed off the page) is allowed through, so a missed release cannot strand
    // the drag for good.
    if (dragRef.current && dragRef.current.id !== e.pointerId) return;
    const r = ref.current.getBoundingClientRect();
    dragRef.current = { dx: e.clientX - r.x, dy: e.clientY - r.y, id: e.pointerId, w: r.width };
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch (err) {}
    setDragging(true);
    e.preventDefault();
  };
  const onMove = (e) => {
    const d = dragRef.current;
    if (!d || d.id !== e.pointerId) return;
    setPos(dbuClampPanel(e.clientX - d.dx, e.clientY - d.dy, d.w));
  };
  const end = () => { dragRef.current = null; setDragging(false); };
  const onDrop = (e) => {
    const d = dragRef.current;
    // ⚠ POINTER-ID MATCHED, exactly like `onMove`. A second finger landing on the
    // header and lifting would otherwise release the FIRST finger's capture and
    // end a drag that is still under way — the panel would simply stop following
    // the hand moving it.
    if (!d || (e && e.pointerId != null && d.id !== e.pointerId)) return;
    try { e.currentTarget.releasePointerCapture(d.id); } catch (err) {}
    end();
  };
  // ⚠ CAPTURE CAN END WITHOUT A POINTERUP — the capturing element removed, the
  // browser taking the pointer back. `lostpointercapture` is the one event that
  // fires however the gesture ends, so the grabbing cursor and the unselectable
  // text cannot outlive it.
  const onLostCapture = () => end();
  // ⚠ ARROW KEYS MOVE IT TOO. A drag-only affordance is unreachable by keyboard,
  // and either panel can cover the thing it is about — so the way out of that
  // has to exist without a pointer.
  const onKey = (e) => {
    const step = e.shiftKey ? 48 : 12;
    const d = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    const r = rect();
    if (!d || !r) return;
    setPos(dbuClampPanel(r.x + d[0], r.y + d[1], r.width));
    e.preventDefault();
  };
  // ⚠ `dragging` LIVES ABOVE THE PANEL, WHICH IT OUTLIVES. A drag interrupted by
  // the panel closing, or by the window narrowing out of floating mode, would
  // otherwise leave the NEXT open stuck in `grabbing` with its text
  // unselectable — including down paths no handler can be attached to.
  React.useEffect(() => { if (!(open && enabled)) end(); }, [open, enabled]);
  // ⚠ WHERE THEY PUT IT IS WHERE IT STAYS. Resetting on close would make a coach
  // re-drag the panel for every day they open, which is most of the work this
  // editor is for — so the position outlives the close and only the first open
  // computes a default. It is re-clamped on the way back in, because the window
  // may have been resized while the panel was shut.
  //
  // ⚠ A LAYOUT EFFECT, NOT A PASSIVE ONE. The panel mounts already open, and a
  // passive effect runs AFTER the browser paints — so every builder open showed
  // one frame of the panel at the stylesheet's fallback corner with no height
  // cap (the budget lives only in the inline style), then jumped. Placing it in
  // the commit means the first frame on screen is the placed one.
  React.useLayoutEffect(() => {
    if (!enabled || !open) return;
    const r = rect();
    setPos((prev) => (prev ? dbuClampPanel(prev.x, prev.y, r ? r.width : 0) : (defRef.current ? defRef.current() : null)));
  }, [enabled, open]);
  React.useEffect(() => {
    if (!enabled) return;
    const on = () => { const r = rect(); setPos((prev) => (prev ? dbuClampPanel(prev.x, prev.y, r ? r.width : 0) : prev)); };
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [enabled]);
  return {
    ref, pos, dragging, onKey,
    // Spread onto the panel's header — the header IS the drag surface.
    headerProps: { onPointerDown: onGrab, onPointerMove: onMove, onPointerUp: onDrop, onPointerCancel: onDrop, onLostPointerCapture: onLostCapture },
    // What a positioned panel writes inline. ⚠ `bottom`/`right` are RELEASED, not
    // merely left alone: `.pop` is anchored `right:20px;bottom:20px`, and a
    // `height:auto` box given BOTH `top` and `bottom` is over-constrained — CSS
    // stretches it to span them, so handing it a `top` alone would silently
    // resize the panel as well as move it.
    style: pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto", maxHeight: Math.max(DBU_PANEL_MIN_H, window.innerHeight - pos.y - DBU_PANEL_GAP) } : undefined,
    grabStyle: dragging ? { cursor: "grabbing", userSelect: "none" } : undefined,
  };
}

// ── Exercise picker popover ──────────────────────────────────────────────────
function DbuExercisePicker({ onPick, onClose, customMoves = [] }) {
  const [q, setQ] = React.useState("");
  const [selected, setSelected] = React.useState([]);
  const term = q.trim();
  const chosen = new Set(selected.map((x) => x.id));
  // ⚠ WHAT IS TICKED IS ALWAYS ON SCREEN, in its own group at the top. Ticking
  // three moves and then searching again used to hide every one of them behind
  // the new results, so the count on the button was the only evidence they
  // existed and a mis-tick could not be found again to undo it.
  const mine = DashBuilder.searchCustomMoves(customMoves, term).filter((e) => !chosen.has(e.id));
  const shape = DashBuilder.searchExercises(term).filter((e) => !chosen.has(e.id));
  const canCreate = DashBuilder.canCreateMove(term, customMoves)
    && !selected.some((x) => String(x.name).toLowerCase() === term.toLowerCase());
  const toggle = (ex, on) => setSelected((prev) => (on ? [...prev, ex] : prev.filter((x) => x.id !== ex.id)));
  const create = () => {
    setSelected((prev) => [...prev, { id: "new-" + term.toLowerCase(), name: term, muscle: "", equipment: "", own: true }]);
    setQ("");
  };
  const row = (ex, on) => (
    <label key={ex.id} className="pk-row">
      <input type="checkbox" checked={on} onChange={(e) => toggle(ex, e.target.checked)} />
      <span>
        <b>{ex.name}</b>
        <small>{[ex.muscle, ex.equipment].filter(Boolean).join(" · ") || (ex.own ? "Your own move" : "")}</small>
      </span>
    </label>
  );
  return <DbuDialog title="Add exercises" onClose={onClose} busy={false}>
    <h2 style={{ fontSize: 20, margin: "0 0 14px" }}>Add exercises</h2>
    <input autoFocus aria-label="Search exercises" value={q} onChange={(e) => setQ(e.target.value)}
      onKeyDown={(e) => {
        // ⚠ WHILE AN IME IS COMPOSING, THE KEYSTROKES BELONG TO THE IME. The Enter that
        // confirms a candidate would otherwise also create a half-composed move, and the
        // Escape that cancels one would close this dialog — throwing away every move
        // ticked so far, because `selected` lives here and nowhere else.
        if (e.nativeEvent && e.nativeEvent.isComposing) return;
        if (e.key === "Escape") onClose();
        if (e.key === "Enter" && canCreate) { e.preventDefault(); create(); }
      }}
      placeholder="Search exercises, muscles, equipment…" style={{ ...dbuField, width: "100%", marginBottom: 4 }} />
    {/* ⚠ THE OFFER TO CREATE IS NOT GATED ON AN EMPTY RESULT LIST. It used to be,
        so a coach typing a move that merely RESEMBLED a listed one got the
        resemblance and no way to add what they actually meant. It sits above the
        list, because it is the answer to the search they just typed. */}
    {canCreate && (
      <button type="button" className="pk-new" onClick={create}>
        <span aria-hidden>＋</span> Add “{term}” as a new exercise
      </button>
    )}
    <div className="pk-list dash-thin-scroll">
      {!!selected.length && <div className="pk-head">Selected · {selected.length}</div>}
      {selected.map((ex) => row(ex, true))}
      {!!mine.length && <div className="pk-head">Your moves</div>}
      {mine.map((ex) => row(ex, false))}
      {!!shape.length && <div className="pk-head">Shape library</div>}
      {shape.map((ex) => row(ex, false))}
      {!selected.length && !mine.length && !shape.length && (
        <div className="pk-none">{term ? "Nothing in the library matches that." : "Start typing to search."}</div>
      )}
    </div>
    <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
      <button disabled={!selected.length} style={dbuBtn(true)} onClick={() => onPick(selected)}>Add {selected.length || ""} exercise{selected.length === 1 ? "" : "s"}</button>
      <button style={dbuBtn(false)} onClick={onClose}>Cancel</button>
    </div>
  </DbuDialog>;
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
            <input aria-label={who + ' set ' + (i + 1) + ' reps'} value={e.reps ?? ''} maxLength={doc.SET_REPS_MAX} placeholder={String(row.reps ?? '') || '—'} onChange={ev => edit(i, 'reps', ev.target.value)} style={cellStyle} />
            <input aria-label={who + ' set ' + (i + 1) + ' weight'} type="number" min="0" step="any" value={e.load ?? ''} placeholder={baseWeight || '—'} onChange={ev => edit(i, 'load', ev.target.value === '' ? '' : Number(ev.target.value))} style={cellStyle} />
          </React.Fragment>;
        })}
      </div>
      <p style={{ fontSize: 12.5, color: DBU_INK50, margin: '8px 0 0' }}>A blank field uses the row's {String(row.reps ?? '') ? row.reps + ' reps' : 'reps'}{baseWeight ? ' and ' + baseWeight : ''}.{count > doc.LADDER_MAX ? ' Per-set targets cover the first ' + doc.LADDER_MAX + ' sets.' : ''}</p>
      {any && <button type="button" onClick={clear} style={{ ...dbuRowBtn, marginTop: 8 }}>Clear per-set targets</button>}
    </>}
  </details>;
}

function DbuRow({ row, label, onChange, onRemove, onMove, onDuplicate, clips = [], onUploading }) {
  const set = (k,v) => {const next={...row,[k]:v}; if(k==='load'||k==='loadType') delete next.loadText;
    // A trainer's new Rest value replaces any older numeric override, as in the mobile editor.
    if(k==='rest') delete next.restSeconds; onChange(next);};
  const [uploading,setUploading] = React.useState(false);
  const [error,setError] = React.useState('');
  const fileRef=React.useRef(null), latest=React.useRef({row,onChange}); latest.current={row,onChange};
  const mounted=React.useRef(true);
  React.useEffect(()=>()=>{mounted.current=false;},[]);
  const upload=async(file)=>{if(!file)return; setUploading(true);setError('');onUploading(1);try {const url=await dbuUploadVideo(file);if(mounted.current)latest.current.onChange({...latest.current.row,video:url});}catch(e){if(mounted.current)setError(e.message || 'Upload failed. Choose the file to retry.');}finally{if(mounted.current)setUploading(false);onUploading(-1);}};
  const video=ShapeWorkoutDocument.videoUrl(row.video);
  const field=(key,label,type='text')=><label style={{display:'block',minWidth:0}}><span style={dbuLabel}>{label}</span><input aria-label={row.name+' '+label} type={type} min={type==='number'?1:undefined} value={row[key] ?? ''} onChange={e=>set(key,type==='number'?e.target.value:e.target.value)} style={{...dbuField,width:'100%'}}/></label>;
  return <div style={{border:'1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)',borderLeft:'3px solid '+(row.group?'var(--sh-accent, #2ee0c4)':'rgba(var(--sh-ink-rgb, 242,237,228),0.2)'),borderRadius:4,padding:12,marginBottom:10}}>
    {/* ⚠ THE NAME GETS A ROW WHEN THE CONTROLS WOULD CROWD IT. Inside the 400px
        floating panel these four 40px buttons take ~254px, which left "Hip 90/90
        flow" about 60px and wrapped it onto three lines — most of what reads as
        clunky in a day with several moves. A flex-basis on the name is what pushes
        the controls to their own line at that width and keeps them beside it when
        the panel is in the flow and wide. The controls are also a step quieter than
        the fields they sit above: 32px, still past the 24px WCAG 2.5.8 floor. */}
    <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap',marginBottom:10}}>
      <span style={{color:DBU_INK50,flex:'0 0 auto'}}>{label}</span>
      <strong style={{flex:'1 1 150px',minWidth:0,fontSize:15}}>{row.name}</strong>
      <div style={{display:'flex',gap:6,marginLeft:'auto',flex:'0 0 auto'}}>
        <button aria-label={'Move '+row.name+' up'} onClick={()=>onMove(-1)} style={dbuRowBtn}>↑</button>
        <button aria-label={'Move '+row.name+' down'} onClick={()=>onMove(1)} style={dbuRowBtn}>↓</button>
        <button onClick={onDuplicate} style={dbuRowBtn}>Duplicate</button>
        <button disabled={uploading} aria-label={'Remove '+row.name} onClick={onRemove} style={dbuRowBtn}>×</button>
      </div>
    </div>
    <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(85px,1fr))',gap:10}}>
      {field('sets','Sets','number')}{field('reps','Reps')}
      <label><span style={dbuLabel}>Load</span><input aria-label={row.name+' load'} type="number" min="0" value={row.load ?? ''} onChange={e=>set('load',e.target.value===''?'':Number(e.target.value))} style={{...dbuField,width:'100%'}}/></label>
      {/* ⚠ RPE LEFT THIS LIST AND GOT ITS OWN. As a fourth `loadType` it was
             EXCLUSIVE with a weight — a coach could say 100 kg or RPE 8 and never
             "100 kg @ RPE 8", which is what most strength programming looks like.
             Owner: "if i want RPE, that should be a seperate drop down from KG or
             IBS". A stored row still carrying `loadType:'rpe'` is converted on
             read by `splitLegacyRpe`, so this select can never show a blank value
             for an option it no longer offers. */}
      <label><span style={dbuLabel}>Unit</span><select aria-label={row.name+' load unit'} value={row.loadType || 'kg'} onChange={e=>set('loadType',e.target.value)} style={{...dbuField,width:'100%'}}><option value="kg">kg</option><option value="lb">lb</option><option value="pct">% 1RM</option></select></label>
      <label><span style={dbuLabel}>RPE</span><select aria-label={row.name+' target RPE'} value={row.rpe ?? ''} onChange={e=>set('rpe',e.target.value===''?'':Number(e.target.value))} style={{...dbuField,width:'100%'}}><option value="">None</option>{dbuRpeOptions(row.rpe).map(v=><option key={v} value={v}>{v}</option>)}</select></label>
      {field('rest','Rest')}
    </div>
    {row.loadText && <p style={{fontSize:12,color:DBU_INK50}}>Original load instruction: {row.loadText}</p>}
    <DbuLadder row={row} onChange={onChange}/>
    <details style={{marginTop:12}}><summary style={{cursor:'pointer',fontSize:13,minHeight:32}}>Cues, tempo, superset & progression</summary>
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(130px,1fr))',gap:10}}>{field('cue','Coach cue')}{field('tempo','Tempo')}<label><span style={dbuLabel}>Superset</span><select value={row.group || ''} onChange={e=>set('group',e.target.value || null)} style={dbuField}><option value="">None</option>{['A','B','C','D'].map(g=><option key={g}>{g}</option>)}</select></label></div>
      <label style={{display:'flex',gap:8,alignItems:'center',fontSize:12,marginTop:10}}><input type="checkbox" checked={!!row.progression} onChange={e=>set('progression',e.target.checked?{rule:'all-reps',incKg:row.loadType==='kg'?2.5:undefined,incLb:row.loadType==='lb'?5:undefined,incPct:row.loadType==='pct'?2.5:undefined,incRpe:Number(row.rpe)>0?0.5:undefined}:null)}/> Apply progression when copying a week with progression</label>
    </details>
    <div style={{marginTop:12,paddingTop:10,borderTop:'1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.1)'}}>
      <input ref={fileRef} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v,.mp4,.mov,.m4v,.webm" hidden onChange={e=>{const f=e.target.files[0];e.target.value='';upload(f);}}/>
      <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}><button disabled={uploading} style={dbuBtn(false)} onClick={()=>fileRef.current.click()}>{uploading?'Uploading…':video?'Replace demo':'Upload demo'}</button>
        {!!clips.length && <select aria-label={'Choose demo for '+row.name} style={{...dbuField,maxWidth:'100%'}} value="" disabled={uploading} onChange={e=>set('video',e.target.value)}><option value="">Choose from video library</option>{clips.map(c=><option key={c.url} value={c.url}>{c.name}</option>)}</select>}
        {video && <button disabled={uploading} style={dbuBtn(false)} onClick={()=>set('video','')}>Remove demo</button>}
      </div>
      {uploading && <progress aria-label="Uploading exercise demonstration" style={{width:'100%',marginTop:8}}/>}
      {error && <p role="alert" style={{fontSize:13,color:'var(--sh-rust, #e0644b)'}}>{error}</p>}
      {video && <details style={{marginTop:8}}><summary style={{cursor:'pointer',fontSize:13}}>Preview demonstration</summary><video src={video} controls playsInline preload="metadata" onError={()=>setError('This browser could not play the clip. Upload a compatible MP4 before assigning.')} style={{width:'100%',maxHeight:240,marginTop:8}}/></details>}
    </div>
  </div>;
}

// ── Day editor (right pane) ──────────────────────────────────────────────────
function DbuDayEditor({ day, onChange, onWeekday, takenBy, playlists, clips, onUploading, customMoves, compact = false }) {
  const [pickerFor, setPickerFor] = React.useState(null); // block index
  const [expanded, setExpanded] = React.useState(day.blocks[0]?.rows[0]?.id || "");
  const labels = DashBuilder.rowLabels(day);
  let labelIdx = 0;
  const setBlock = (bi, next) => onChange({ ...day, blocks: day.blocks.map((b, i) => (i === bi ? next : b)) });
  return (
    <div>
      {/* ⚠ A GRID THAT READS ITS OWN CONTAINER, not the viewport. This block sits
          inside a 400px floating panel on a wide screen and inside a full-width one
          below 1100px, and a viewport media query cannot tell those apart — which is
          why the old flex-wrap row dealt three fields of three different widths into
          two ragged lines. `auto-fit` measures the panel, so it is one clean column
          in the float and three across when the panel is in the flow. */}
      <div className="dayhead">
        <div>
          <label style={dbuLabel} htmlFor="dbu-day-name">Day name</label>
          <input id="dbu-day-name" value={day.name} onChange={(e) => onChange({ ...day, name: e.target.value })} style={{ ...dbuField, width: "100%", fontSize: 14 }} />
        </div>
        <label style={{ minWidth: 0 }}>
          <span style={dbuLabel}>Training day</span>
          {/* ⚠ ROUTED THROUGH `onWeekday`, NEVER `onChange`. This select and the Grid's drag
              are the two writers of a day's weekday; both go through `dbuAssignWeekday`, so a
              weekday another day already holds is EXCHANGED rather than duplicated. Writing it
              through `onChange` — a blind positional replace — is how two days came to sit on
              one weekday, and the Grid can render only the first of those, so the second was
              unreachable while the document still held it. Fixed in #2143.
              The option names the day it would swap with, so the outcome is legible before the
              click rather than a session quietly changing day. */}
          <select value={day.weekday ?? ''} onChange={(e) => onWeekday(e.target.value === '' ? undefined : Number(e.target.value))} style={{ ...dbuField, width: "100%" }}>
            <option value="">In sequence from start</option>
            {DBU_DOW_FULL.map((d, i) => <option key={d} value={i}>{d}{takenBy && takenBy[i] ? " · swaps with " + takenBy[i] : ""}</option>)}
          </select>
        </label>
        <div>
          <span style={dbuLabel}>Shape Radio playlist</span>
          <select value={day.playlist ? day.playlist.name : ""} onChange={(e) => {
            const p = playlists.find((x) => x.name === e.target.value);
            onChange({ ...day, playlist: p ? { name: p.name, meta: p.meta || "" } : null });
          }} style={{ ...dbuField, width: "100%" }}>
            <option value="">No playlist</option>
            {playlists.map((p) => <option key={p.name} value={p.name}>{p.name}{p.meta ? " · " + p.meta : ""}</option>)}
          </select>
          <span className="hint">Chips on the client card</span>
        </div>
      </div>
      {day.blocks.map((block, bi) => (
        <div key={bi} style={{ marginBottom: 14 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 7 }}>
            <select value={block.kind} onChange={(e) => setBlock(bi, { ...block, kind: e.target.value })} style={{ ...dbuField, fontFamily: DBU_MONO, fontSize: 9.5, textTransform: "uppercase", letterSpacing: "0.1em", color: DBU_RUST, padding: "5px 7px" }}>
              {DashBuilder.BLOCK_KINDS.map((k) => <option key={k.key} value={k.key}>{k.label}</option>)}
            </select>
            <div style={{ flex: 1, height: 2, background: "linear-gradient(90deg, " + DBU_RUST + ", rgba(var(--sh-rust2-rgb, 192,83,59),0.2) 45%, transparent 85%)" }} />
            {day.blocks.length > 1 && <button onClick={() => onChange({ ...day, blocks: day.blocks.filter((_, i) => i !== bi) })} style={{ ...dbuBtn(false), padding: "4px 8px", color: "var(--sh-rust, #e0644b)", borderColor: "rgba(var(--sh-rust-rgb, 224,100,75),0.4)" }}>Remove block</button>}
          </div>
          {block.rows.map((row, ri) => {
            const label = labels[labelIdx]; labelIdx += 1;
            return (
              <details className="cb-exercise" key={row.id} open={!compact || expanded === row.id}>
                <summary onClick={compact ? e=>{e.preventDefault();setExpanded(expanded===row.id?"":row.id);} : undefined}>{label} · {row.name}<small>{row.sets} × {row.reps}{row.rest ? " · rest " + row.rest : ""}{row.video ? " · video" : ""}</small></summary>
              <DbuRow row={row} label={label} clips={clips} onUploading={onUploading}
                onDuplicate={() => setBlock(bi, {...block, rows:[...block.rows.slice(0,ri+1),{...JSON.parse(JSON.stringify(row)),id:crypto.randomUUID()},...block.rows.slice(ri+1)]})}
                onChange={(next) => setBlock(bi, { ...block, rows: block.rows.map((r, i) => (i === ri ? next : r)) })}
                onRemove={() => setBlock(bi, { ...block, rows: block.rows.filter((_, i) => i !== ri) })}
                onMove={(dir) => {
                  const rows = [...block.rows];
                  const j = ri + dir;
                  if (j < 0 || j >= rows.length) return;
                  [rows[ri], rows[j]] = [rows[j], rows[ri]];
                  setBlock(bi, { ...block, rows });
                }} />
              </details>
            );
          })}
          <div style={{ position: "relative", display: "inline-block" }}>
            <button onClick={() => setPickerFor(pickerFor === bi ? null : bi)} style={dbuBtn(false)}>+ Exercise</button>
            {pickerFor === bi && (
              <DbuExercisePicker customMoves={customMoves}
                onPick={(items) => { const added=items.map(ex=>DashBuilder.newRow(ex)); setBlock(bi, { ...block, rows: [...block.rows, ...added] }); if(added.length)setExpanded(added[0].id); setPickerFor(null); }}
                onClose={() => setPickerFor(null)} />
            )}
          </div>
        </div>
      ))}
      <button onClick={() => onChange({ ...day, blocks: [...day.blocks, { kind: "accessory", rows: [] }] })} style={{ ...dbuBtn(false), marginTop: 2 }}>+ Block</button>
    </div>
  );
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
    const key=e=>{if(e.isComposing)return;if(e.key==='Escape'&&!latest.current.busy){e.preventDefault();latest.current.onClose();}if(e.key==='Tab'){
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

// ── Assign modal — multi-client + start date; marks the programming queue ───
function DbuAssignModal({ template, doc, clients, queue, live, preselectId, onClose }) {
  const [picked, setPicked] = React.useState(() => preselectId ? { [preselectId]: true } : {});
  React.useEffect(() => { if (preselectId) setPicked((prev) => ({ ...prev, [preselectId]: true })); }, [preselectId]);
  const [startDate, setStartDate] = React.useState(() => {
    const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); // next Monday
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  });
  const [state, setState] = React.useState("");
  // ⚠ The guardrail's REASON, kept. A 409 is the gate holding the week and it
  // carries the sentence the coach has to act on ("this is a 40% jump on
  // her last four weeks"); a fixed "try again" is advice that can never work,
  // because retrying an unchanged week returns the same 409 forever.
  const [errMsg, setErrMsg] = React.useState("");
  const queueState = (id) => { const q = (queue || []).find((r) => r.client.profile.id === id); return q ? q.state : null; };
  const dayCount = doc.weeks.reduce((s, w) => s + w.days.length, 0);
  const ids = Object.keys(picked).filter((k) => picked[k]);

  const assign = async () => {
    if (!ids.length || state === "working" || state === "done") return;
    setState("working");
    setErrMsg("");
    let rows;
    try { rows=DashBuilder.buildAssignmentRows(doc, template, startDate); if(!rows.length || rows.some(r=>!r.payload.exercises.length))throw new Error("Add exercises to each training day before assigning."); } catch(e){setErrMsg(e.message);setState("error");return;}
    // Weeks publish one at a time, so a failure partway through leaves the
    // earlier weeks LIVE. Counting them is the difference between "nothing
    // happened" and "three weeks landed and week four was held" — and only the
    // second is true.
    let landed = 0;
    let totalWeeks = 0;
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
                title: row.title, description: template.name, kind: "template",
                scheduledDate: row.scheduledDate, payload: row.payload,
              })),
            }),
          });
          // A 409 is the progression guardrail HOLDING the week, not a fault —
          // it carries the reason in `error`, and throwing "HTTP 409" would
          // strip exactly the sentence the coach needs to act on.
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error || ("HTTP " + res.status));
          }
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
      setTimeout(onClose, 1100);
    } catch (e) {
      const reason = (e && e.message ? String(e.message) : "").trim();
      // Name what actually landed. Silence here reads as "nothing was written",
      // and the coach would re-assign the whole program on top of the weeks that
      // already published.
      const partial = landed > 0
        ? "First " + landed + " of " + totalWeeks + " week" + (totalWeeks === 1 ? "" : "s") + " published. "
        : "";
      setErrMsg(partial + (reason || "Couldn't assign — try again."));
      setState("error");
    }
  };

  return (
    <DbuDialog title="Assign workout" onClose={onClose} busy={state === "working"}>
        <div style={{ fontFamily: DBU_MONO, fontSize: 9, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Assign · {template.name}</div>
        <div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 23, margin: "6px 0 4px" }}>Put clients on it.</div>
        <div style={{ fontSize: 12, color: DBU_INK50, marginBottom: 14 }}>{doc.weeks.length} week{doc.weeks.length === 1 ? "" : "s"} · {dayCount} days · snapshot v{doc.version} — your later template edits won't change what they get.</div>
        <span style={dbuLabel}>Start date</span>
        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} style={{ ...dbuField, marginBottom: 12 }} />
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
          {!clients.length && <div style={{ fontSize: 12, color: DBU_INK50, padding: 8 }}>No clients loaded.</div>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <button onClick={assign} disabled={!ids.length || state === "working"} style={{ ...dbuBtn(true, DBU_RUST), color: "#fff", padding: "11px 18px", opacity: !ids.length || state === "working" ? 0.6 : 1 }}>
            {state === "working" ? "Assigning…" : state === "done" ? "Assigned ✓" : "Publish to " + (ids.length || 0) + " client" + (ids.length === 1 ? "" : "s")}
          </button>
          <button disabled={state === "working"} onClick={onClose} style={dbuBtn(false)}>Cancel</button>
          {!live && <span style={{ fontFamily: DBU_MONO, fontSize: 8.5, color: DBU_INK50 }}>DEMO · marks the queue only</span>}
        </div>
        {state === "error" && (
          // A guardrail reason is a SENTENCE, so it gets a line to be read on —
          // out of the button row, where a long one would wrap the actions apart.
          // role=alert because this is the one thing on the screen the coach must
          // not miss.
          <div role="alert" style={{ marginTop: 12, borderLeft: "3px solid " + DBU_RUST, paddingLeft: 11 }}>
            <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.16em", textTransform: "uppercase", color: DBU_RUST }}>Publish stopped</div>
            <div style={{ fontSize: 12.5, lineHeight: 1.45, color: "var(--sh-ink, #f2ede4)", marginTop: 3 }}>{errMsg}</div>
          </div>
        )}
    </DbuDialog>
  );
}

// ── The builder (tree left · day editor right · always-on client preview) ───
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
  { key: "grid", glyph: "▦", label: "Grid" },
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

// ── Grid — the calendar is the builder ───────────────────────────────────────
function DbuGrid({ doc, dates, sel, setSel, setWeeks, uploads, onWeek }) {
  const dragRef = React.useRef(null);
  const weekStart = (wi) => ((doc.weeks[wi].days || []).map((_, di) => dates[wi + ":" + di]).filter(Boolean).sort()[0] || "");
  // ⚠ A DROP SWAPS, IT DOES NOT OVERWRITE. Measured on a Mon/Wed/Fri week, dragging Mon onto
  // the POPULATED Wed cell: 3 of 3 sessions visible becomes 2 of 3, silently. That drop is
  // the ordinary same-week case and it passes the `f.wi === wi` guard, so the guard is not
  // what protects it. The retired builder could not hit this — its `moveDay` REORDERED
  // within a week (a permutation, so no collision existed); assigning a weekday is new here,
  // and so is the collision. The rule itself is `dbuAssignWeekday`, shared with the day
  // editor's Training-day select, so the two controls cannot drift into two answers.
  const moveTo = (wi, di, weekday) => setWeeks(doc.weeks.map((w, i) => (i === wi ? dbuAssignWeekday(w, di, weekday) : w)));
  const addAt = (wi, weekday) => {
    const w = doc.weeks[wi];
    setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, days: [...x.days, { ...DashBuilder.newDay("Day " + (w.days.length + 1)), weekday }] } : x)));
    setSel({ w: wi, d: w.days.length });
  };
  return (
    <div className="scroll">
      <div className="wg" style={{ minWidth: 760 }}>
        <div />
        {DBU_DOW.map((d) => <div className="h" key={d}>{d}</div>)}
        {doc.weeks.map((w, wi) => (
          <React.Fragment key={wi}>
            <div className="wk">
              <b>Week {wi + 1}</b>
              <span>{dbuDayMonth(weekStart(wi)) || "—"}</span>
              {w.deload && <span className="dl">Deload −40%</span>}
              {/* ⚠ Every week tool the retired tree carried, kept. Losing one to a layout
                  change would be a silent regression in the engine §1.4 of the review says
                  must survive any redesign. */}
              <span className="tools">
                <button type="button" onClick={() => onWeek("duplicate", wi)} title="Copy this week unchanged">Copy</button>
                <button type="button" onClick={() => onWeek("progress", wi)} title="Copy this week with the configured load increases">Progress</button>
                <button type="button" onClick={() => onWeek("deload", wi)} aria-pressed={!!w.deload} title="Deload: −40% volume, then edit freely">Deload</button>
                {doc.weeks.length > 1 && <button type="button" onClick={() => onWeek("remove", wi)} aria-label={"Remove week " + (wi + 1)}>×</button>}
              </span>
            </div>
            {DBU_DOW.map((_, wd) => {
              const di = (w.days || []).findIndex((d) => dbuHasWeekday(d) && d.weekday === wd);
              const day = di >= 0 ? w.days[di] : null;
              const iso = di >= 0 ? dates[wi + ":" + di] : "";
              if (!day) {
                // ⚠ THE SAME `f.wi === wi` GUARD THE POPULATED CELL CARRIES, and its absence
                // here was not a no-op: `moveTo` only ever edits week `f.wi`, so dragging a
                // Week 1 session onto an empty cell under Week 3 left it in Week 1 and
                // silently changed its WEEKDAY there — the drop target the coach aimed at
                // was ignored. (CodeRabbit, #2143.) Moving a day BETWEEN weeks is a feature,
                // not this fix; registered.
                return (
                  <button type="button" key={wd} className="c rest"
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => { const f = dragRef.current; if (f && !uploads && f.wi === wi) moveTo(f.wi, f.di, wd); dragRef.current = null; }}
                    onClick={() => addAt(wi, wd)}
                    aria-label={"Add a session on " + DBU_DOW[wd] + " of week " + (wi + 1)}>
                    <span className="r">Rest · ＋ Add session</span>
                  </button>
                );
              }
              const moves = (day.blocks || []).reduce((n, b) => n + (b.rows || []).length, 0);
              return (
                <button type="button" key={wd} className={"c" + (sel.w === wi && sel.d === di ? " on" : "")} draggable={!uploads}
                  onDragStart={(e) => { if (uploads) { e.preventDefault(); return; } dragRef.current = { wi, di }; }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => { const f = dragRef.current; if (f && !uploads && f.wi === wi) moveTo(f.wi, f.di, wd); dragRef.current = null; }}
                  onClick={() => setSel({ w: wi, d: di })}>
                  <span className="d">{dbuDayMonth(iso) || "—"}</span>
                  <span className="s">
                    <b>{day.name}</b>
                    <span>{moves} moves{day.playlist ? " · ♪" : ""}</span>
                  </span>
                </button>
              );
            })}
          </React.Fragment>
        ))}
      </div>
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
  const editRow = (di, bi, ri, wi, value) => setWeeks(weeks.map((w, i) => {
    if (i !== wi) return w;
    const day = (w.days || [])[di];
    if (!day || !(day.blocks || [])[bi] || !(day.blocks[bi].rows || [])[ri]) return w;
    return { ...w, days: w.days.map((d, j) => (j !== di ? d : { ...d, blocks: d.blocks.map((b, k) => (k !== bi ? b : { ...b, rows: b.rows.map((r, m) => (m !== ri ? r : { ...r, ...value })) })) })) };
  }));
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
                      if (cellLadder) return (
                        <td key={wi}>
                          <button type="button" className={"cell ladder" + (w.deload ? " dl" : "")} onClick={() => setSel({ w: wi, d: di })}
                            aria-label={"Per-set targets, " + (cellRow.name || row.name) + ", week " + (wi + 1) + ": " + cellRow.sets + " × " + cellLadder.reps + (cellLadder.weight ? ", " + cellLadder.weight : "") + ". Open the day to edit."}>
                            {diverged && <span className="div" title={cellRow.name}>{cellRow.name}</span>}
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
                            <input className="b" aria-label={"Load, " + (cellRow.name || row.name) + ", week " + (wi + 1)}
                              value={cellRow.load ?? ""} onChange={(e) => editRow(di, bi, ri, wi, { load: e.target.value })} />
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
      <button type="button" className="addday" onClick={() => setWeeks(weeks.map((w, i) => (i !== 0 ? w : { ...w, days: [...w.days, { ...DashBuilder.newDay("Day " + (w.days.length + 1)), weekday: dbuNextFreeWeekday(w) }] })))}>
        ＋ Add a day
      </button>
    </div>
  );
}

function DbuBuilder({ template, preselectId, clients, queue, live, playlists, ownerId, clips, dayTemplates, customMoves, customTags, onBack, onSaved }) {
  const ownerRef = React.useRef(ownerId);
  const initial = React.useRef(template.recovered || {name:template.name,doc:template.detail.builder,revision:template.detail.revision || 0});
  const [name, setName] = React.useState(initial.current.name);
  // ⚠ The weekday backfill runs INSIDE the initializer, so it is part of the baseline
  // `saved.current` below and opening a legacy program does not mark it dirty or spend a
  // revision. The dates drawn and the dates assigned both use it either way.
  const [doc, setDoc] = React.useState(() => dbuWithWeekdays(JSON.parse(JSON.stringify(initial.current.doc))));
  const [sel, setSel] = React.useState({w:0,d:0});
  // ⚠ REMEMBERED PER COACH, which the board's G tab asks for in as many words: "the
  // switch is remembered per coach, so whoever thinks in calendars opens to the grid and
  // whoever programs in spreadsheets opens to the sheet". It rides the dashboard's own
  // `dashboard_prefs` store rather than a second mechanism — same account binding, same
  // serial write lane, same three read states, no migration and no route.
  //
  // ⚠ THE STORE OPENS ONLY WHEN THE BUILDER IS LIVE. In the signed-out preview there is
  // no account to remember against, and `useRememberedChoices` declines to open a
  // per-account document without one; the switch still works, it just does not persist.
  const prefs = useRememberedChoices(!!live);
  const [view, setViewRaw] = useRememberedChoice(prefs, "builderView", DBU_VIEW_KEYS, "grid");
  const [layout, chooseLayout] = useRememberedChoice(prefs, "workoutBuilderLayout", COACH_BUILDER_LAYOUTS, "guided");
  const [step, setStep] = React.useState(0);
  const [popped, setPopped] = React.useState(false);
  const [showSchedule, setShowSchedule] = React.useState(false);
  const steps = ["Basics", "Exercises", "Schedule", "Review"];
  const [templateSaved, setTemplateSaved] = React.useState(false);
  React.useEffect(() => setTemplateSaved(false), [name, doc]);
  const goStep = next => { setStep(next); if (sel.w < 0) setSel({w:0,d:0}); };
  const setLayout = next => { chooseLayout(next); setPopped(false); if (sel.w < 0) setSel({w:0,d:0}); };
  const guided = layout === "guided";
  const scheduleShown = layout === "planner" || (guided ? step === 2 : showSchedule);
  const selectDay = next => { setSel(next); if (guided && step === 2) setStep(1); };
  // Sheet edits its own cells. Close the day editor when switching, then reopen
  // it from a day heading; coaches can explicitly pop it out when they need to.
  const setView = (next) => { if (next === "sheet") setSel({ w: -1, d: -1 }); setViewRaw(next); };
  // ⚠ THE OPEN DOCUMENT COUNTS TOO. `customMoves` comes from SAVED templates, so a
  // move created ten seconds ago would not be offered for the next day until the
  // program had been saved and re-fetched — which reads as the feature not
  // working. The two are merged and de-duplicated by name.
  // ⚠ THE OPEN DOCUMENT GOES FIRST — what the coach typed a moment ago is the current
  // truth about that move, where the saved copy is last week's. `mergeMoveInto` then fills
  // any descriptor the open copy is missing from the saved one, so the reorder loses
  // nothing; it is the library walk's own rule, not a second one written here.
  const ownMoves = React.useMemo(() => DashBuilder.ownMovesFor(doc, customMoves), [customMoves, doc]);
  const [preview, setPreview] = React.useState(false);
  // The two floating panels, on one drag rule (`useDbuDrag`).
  const canFloat = useDbuFloating();
  const floating = canFloat && popped;
  const stageRef = React.useRef(null);
  const panelOpen = sel.w >= 0 && sel.d >= 0;
  const panel = useDbuDrag({ enabled: floating, open: panelOpen, defaultPos: () => dbuDefaultPanelPos(stageRef.current) });
  // ⚠ THE PREVIEW IS DRAGGABLE AT EVERY WIDTH, unlike the day editor. `.pop` is
  // `position:fixed` in every media query — nothing drops it back into the flow —
  // so there is no width at which an inline position would fight the stylesheet.
  // It also needs no default: the stylesheet already anchors it bottom-right, and
  // leaving the position null until a coach moves it keeps that anchor live
  // across a resize instead of freezing today's pixels.
  const previewPanel = useDbuDrag({ enabled: true, open: preview, defaultPos: null });
  const [saveState, setSaveState] = React.useState(template.recovered ? 'dirty' : 'saved');
  const [error,setError] = React.useState('');
  const [saveConflict,setSaveConflict] = React.useState(false);
  const [assigning,setAssigning] = React.useState(false);
  const [uploads,setUploads] = React.useState(0);
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
        let plan={id:idRef.current,name:value.name,detail:{...(template.detail||{}),builder:value.doc,revision:revision.current}};
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
        if(active.current){setSaveState('saved');onSaved?.({id:plan.id,name:plan.name,doc:plan.detail.builder,plan});}
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
  const setDay = (next) => setWeeks(doc.weeks.map((w, wi) => (wi === sel.w ? { ...w, days: w.days.map((d, di) => (di === sel.d ? next : d)) } : w)));
  // ⚠ THE DAY EDITOR'S TRAINING-DAY SELECT DOES NOT GO THROUGH `setDay`, which is a blind
  // positional replace with no collision check — picking a weekday another day in the week
  // already held put two days on one weekday, and the Grid finds a day BY weekday, so the
  // second became unreachable while the document still held it. `dbuAssignWeekday` is the
  // same rule the Grid's drag uses, so the two controls cannot answer differently.
  // Clearing a weekday needs no separate branch: no day can equal `undefined`, so it moves
  // this day and displaces nothing.
  const setDayWeekday = (n) => setWeeks(doc.weeks.map((w, wi) => (wi === sel.w ? dbuAssignWeekday(w, sel.d, n) : w)));

  const duplicateWeek = (wi) => {
    const next = JSON.parse(JSON.stringify(doc.weeks[wi]));
    setWeeks([...doc.weeks.slice(0, wi + 1), next, ...doc.weeks.slice(wi + 1)]);
  };
  // Every per-week action in one place, so the grid's gutter and any later caller
  // cannot drift into two versions of "duplicate a week".
  const onWeek = (action, wi) => {
    if (action === "duplicate") return duplicateWeek(wi);
    if (action === "deload") return toggleDeload(wi);
    if (action === "progress") {
      const next = DashBuilder.applyProgression(doc.weeks[wi]);
      return setWeeks([...doc.weeks.slice(0, wi + 1), next, ...doc.weeks.slice(wi + 1)]);
    }
    if (action === "remove" && doc.weeks.length > 1) {
      setWeeks(doc.weeks.filter((_, i) => i !== wi));
      setSel({ w: -1, d: -1 });
    }
  };
  const toggleDeload = (wi) => {
    const w = doc.weeks[wi];
    if (w.deload) setWeeks(doc.weeks.map((x, i) => (i === wi ? { ...x, deload: false } : x))); // unflag; sets stay as edited
    else setWeeks(doc.weeks.map((x, i) => (i === wi ? DashBuilder.deloadWeek(x) : x)));
  };

  const previewCard = day ? DashBuilder.dayToClientCard(day, { coach: "you" }) : null;
  const saveLabel = saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Draft on this device" : saveState === "error" ? "Save failed · draft retained" : live ? (persisted.current ? "Saved" : "New template · not saved yet") : "Draft saved locally";

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
.dbu2 h1{font-family:${DBU_DISPLAY};font-weight:600;font-variation-settings:'wdth' 112;font-size:34px;letter-spacing:-.01em;margin:0;line-height:1.05;color:${DBU_INK}}
.dbu2 .hd{display:flex;align-items:flex-start;gap:18px;flex-wrap:wrap;margin-bottom:18px}
.dbu2 .meta{font-size:14px;color:${DBU_INK2};margin-top:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.dbu2 .chip{display:inline-flex;align-items:center;gap:6px;height:28px;padding:0 10px;border-radius:7px;font-size:13px;font-weight:600;background:${DBU_WH};border:1px solid ${DBU_LINE2};color:${DBU_INK};white-space:nowrap}
.dbu2 .chip.rust{background:${DBU_RUSTBG};border-color:transparent;color:${DBU_RUST}}
.dbu2 .chip.gold{background:${DBU_GOLDBG};border-color:transparent;color:${DBU_GOLD}}
.dbu2 .chip.q{background:transparent;border-color:transparent;color:${DBU_INK2};font-weight:500;padding:0 2px}
.dbu2 .acts{margin-left:auto;display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding-top:2px}
.dbu2 .saved{font-size:13px;color:${DBU_INK3}}
.dbu2 .tog{display:inline-flex;align-items:center;gap:8px;font-size:14px;color:${DBU_INK2};font-weight:500;background:transparent;border:0;cursor:pointer;height:40px;padding:0}
.dbu2 .tog i{width:36px;height:20px;border-radius:10px;background:${DBU_LINE2};position:relative;display:inline-block}
.dbu2 .tog[aria-pressed="true"]{color:${DBU_INK}}
.dbu2 .tog[aria-pressed="true"] i{background:${DBU_TEAL}}
.dbu2 .tog i::after{content:"";position:absolute;top:2px;left:2px;width:16px;height:16px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:left .14s}
.dbu2 .tog[aria-pressed="true"] i::after{left:18px}
.dbu2 .seg{display:inline-flex;gap:3px;background:${DBU_PG};border:1px solid ${DBU_LINE2};border-radius:9px;padding:3px;height:40px;align-items:center}
.dbu2 .seg button{display:inline-flex;align-items:center;gap:7px;height:32px;padding:0 13px;border:0;border-radius:7px;font-size:13.5px;font-weight:600;color:${DBU_INK2};white-space:nowrap;background:transparent;cursor:pointer}
.dbu2 .seg button[aria-pressed="true"]{background:${DBU_WH};color:${DBU_INK};box-shadow:0 1px 2px rgba(0,0,0,.14)}
.dbu2 .seg button i{font-style:normal;font-size:13px;line-height:1;opacity:.85}
.dbu2 .tb{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-bottom:14px}
.dbu2 .wg{display:grid;grid-template-columns:150px repeat(7,minmax(0,1fr));gap:8px}
.dbu2 .wg .h{font-size:12px;font-weight:700;color:${DBU_INK3};text-transform:uppercase;letter-spacing:.06em;padding:0 0 4px 10px}
.dbu2 .wg .wk{padding:10px 8px 10px 0}
.dbu2 .wg .wk b{display:block;font-size:15px;font-weight:700}
.dbu2 .wg .wk span{display:block;font-size:13px;color:${DBU_INK2};margin-top:2px}
.dbu2 .wg .wk .dl{display:inline-block;margin-top:8px;font-size:12px;padding:3px 8px;border-radius:6px;background:${DBU_GOLDBG};color:${DBU_GOLD};font-weight:600}
.dbu2 .wg .wk .tools{display:flex;gap:4px;flex-wrap:wrap;margin-top:8px}
.dbu2 .wg .wk .tools button{height:26px;padding:0 8px;border-radius:6px;border:1px solid ${DBU_LINE2};background:${DBU_WH};font-size:12px;font-weight:600;color:${DBU_INK2};cursor:pointer}
.dbu2 .wg .wk .tools button[aria-pressed="true"]{background:${DBU_GOLDBG};border-color:transparent;color:${DBU_GOLD}}
.dbu2 .wg .c{background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:10px;min-height:112px;padding:9px 10px;position:relative;text-align:left;width:100%;cursor:pointer;display:block}
.dbu2 .wg .c .d{display:block;font-size:13px;color:${DBU_INK3};font-variant-numeric:tabular-nums}
.dbu2 .wg .c.rest{background:${DBU_REST};border-color:transparent}
.dbu2 .wg .c.rest .r{display:block;position:absolute;left:10px;bottom:9px;font-size:12.5px;color:${DBU_INK3}}
.dbu2 .wg .c.rest:hover,.dbu2 .wg .c.rest:focus-visible{border:1.5px dashed ${DBU_TEAL};background:${DBU_TEALBG}}
.dbu2 .wg .c.rest:hover .r,.dbu2 .wg .c.rest:focus-visible .r{color:${DBU_TEAL};font-weight:700}
.dbu2 .wg .s{display:block;margin-top:8px;border-left:3px solid ${DBU_RUST};background:${DBU_RUSTBG};border-radius:6px;padding:7px 9px}
.dbu2 .wg .s b{display:block;font-size:14px;font-weight:700;line-height:1.2}
.dbu2 .wg .s span{display:block;font-size:12px;color:${DBU_INK2};margin-top:3px}
.dbu2 .wg .c.on{outline:2px solid ${DBU_TEAL};border-color:transparent}
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
.dbu2 .sh .cell{display:inline-flex;flex-direction:column;justify-content:center;width:100%;min-width:0;height:52px;padding:0 10px;border:1px solid ${DBU_LINE2};border-radius:8px;background:${DBU_WH};font-variant-numeric:tabular-nums;line-height:1.15}
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
.dbu2 .drawer{background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:14px;box-shadow:0 18px 50px rgba(21,33,30,.16);padding:20px 22px 18px}
.dbu2 .drawer.float{position:fixed;left:auto;right:16px;top:96px;width:${DBU_PANEL_W}px;overflow-y:auto;overscroll-behavior:contain;z-index:40}
.dbu2 .drawer .dh.grab,.dbu2 .pop .ph2.grab{cursor:grab;touch-action:none}
.dbu2 .dayhead{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px 12px;margin-bottom:14px;align-items:end}
.dbu2 .dayhead>*{min-width:0}
.dbu2 .dayhead .hint{display:block;margin-top:4px;font-size:11.5px;color:${DBU_INK3}}
.dbu2 .gh{flex:0 0 auto;order:-1;height:28px;width:22px;padding:0;border:0;cursor:grab;border-radius:6px;background-image:radial-gradient(currentColor 1.1px, transparent 1.2px);background-size:6px 6px;background-position:center;background-repeat:repeat;background-clip:content-box;padding:5px 7px;color:${DBU_LINE2}}
.dbu2 .gh:hover{color:${DBU_INK2}}
.dbu2 .gh:focus-visible{outline:2px solid ${DBU_TEAL};outline-offset:1px}
@media(max-width:1100px){.dbu2 .drawer.float{position:static!important;left:auto!important;top:auto!important;right:auto!important;width:auto!important;max-height:none!important;margin-top:16px}}
.dbu2 .drawer .dh{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:6px;flex-wrap:wrap}
.dbu2 .drawer .dh b{font-size:19px;font-weight:700;letter-spacing:-.01em}
.dbu2 .drawer .when{font-size:13.5px;color:${DBU_INK2};margin-bottom:14px}
.dbu2 .drawer .when b{color:${DBU_RUST};font-weight:700}
.dbu2 .pop{position:fixed;right:20px;bottom:20px;width:344px;max-width:calc(100vw - 40px);max-height:calc(100vh - 120px);overflow-y:auto;z-index:60;background:${DBU_WH};border:1px solid ${DBU_LINE};border-radius:14px;box-shadow:0 18px 50px rgba(21,33,30,.16);padding:16px 18px 18px}
.dbu2 .pop .ph2{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px}
.dbu2 .pop .ph2 b{font-size:15px;font-weight:700;margin-right:auto}
.dbu2 .x{height:32px;padding:0 11px;border-radius:8px;border:1px solid ${DBU_LINE};background:${DBU_WH};color:${DBU_INK2};font-size:13px;font-weight:600;cursor:pointer}
.dbu2 .scroll{overflow-x:auto}
/* NOTE: these rules carry NO .dbu2 prefix on purpose. DbuDialog portals into
   document.body, so the picker is NOT inside the builder's root and every
   prefixed rule above misses it — which is why its checkboxes drew at the
   browser default while .dbu2 input[type=checkbox] sized every other one on the
   page to 24px. (No backticks in here: this block is a template literal, and a
   backtick in a comment ends it — see the 2026-09-15 pageShell post-mortem.) */
.pk-list{max-height:min(48vh,380px);overflow-y:auto;margin-top:4px;padding-right:4px}
.pk-head{font-family:${DBU_MONO};font-size:9px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:${DBU_INK2};margin:13px 0 3px;padding:0 6px}
.pk-list>.pk-head:first-child{margin-top:2px}
.pk-row{display:flex;gap:11px;align-items:center;min-height:44px;padding:4px 6px;border-radius:6px;cursor:pointer}
.pk-row:hover{background:rgba(var(--sh-ink-rgb, 242,237,228),.06)}
.pk-row input[type="checkbox"]{flex:0 0 auto;width:20px;height:20px;accent-color:${DBU_TEAL};cursor:pointer}
.pk-row b{display:block;font-size:13.5px;font-weight:500}
.pk-row small{display:block;font-size:11.5px;color:${DBU_INK2};margin-top:1px}
.pk-none{font-size:12.5px;color:${DBU_INK2};padding:12px 6px}
.pk-new{display:flex;align-items:center;gap:8px;width:100%;min-height:40px;margin-top:8px;padding:0 12px;border-radius:9px;cursor:pointer;
  font-family:${DBU_BODY};font-size:13.5px;font-weight:600;text-align:left;
  color:${DBU_TEAL};background:rgba(var(--sh-accent-rgb, 46,224,196),.08);border:1px dashed rgba(var(--sh-accent-rgb, 46,224,196),.45)}
.pk-new:hover{background:rgba(var(--sh-accent-rgb, 46,224,196),.14)}
/* The thin-scrollbar rules live in dash.css (.dash-thin-scroll) because the meal
   builder needs the same ones and has no style host of its own. */
`}</style>
      <div className="dbu2 cbuilder" data-layout={layout} data-step={step}>
        <CoachBuilderNav layout={layout} onLayout={setLayout} step={step} onStep={goStep} steps={steps} busy={!!uploads}/>
        {template.sourceName && (!guided || step === 0) && <p className="cb-copy">Based on <strong>{template.sourceName}</strong>. You’re editing a new copy; the original template stays unchanged.</p>}
        {guided && <div className="cb-intro"><h2>{["Start with the basics", "Build your workout", "Arrange days and weeks", "Ready for your clients?"][step]}</h2><p>{["Name this template so you can find it and use it again. You can assign it to clients whenever you’re ready.", "Choose a day, add exercises, then set the prescription. Rest, RPE and demonstration videos are available on every exercise.", "Repeat a week, add progression or plan a deload. Each client’s start date is chosen when you assign the plan.", "Check each day as your client will see it. Save the template for later or choose clients and a start date."][step]}</p></div>}
        {/* ── Header ──────────────────────────────────────────────────────────
            One row that never moves between the two views: who this is, when it is
            drawn for, what it adds up to, and the one primary action. */}
        <div className="hd">
          <div style={{ minWidth: 260, flex: "1 1 320px" }}>
            <button type="button" className="back" onClick={leave} disabled={!!uploads} style={{ marginBottom: 6 }}>← Library</button>
            <input aria-label="Workout or program name" value={name} onChange={(e) => setName(e.target.value)}
              style={{ fontFamily: DBU_DISPLAY, fontWeight: 600, fontVariationSettings: "'wdth' 112", fontSize: guided && step !== 0 ? 24 : 34, letterSpacing: "-.01em", lineHeight: 1.05, color: DBU_INK,
                background: "transparent", border: 0, borderBottom: "1px solid transparent", padding: 0, width: "100%", outline: "none" }}
              onFocus={(e) => { e.target.style.borderBottomColor = DBU_LINE2; }}
              onBlur={(e) => { e.target.style.borderBottomColor = "transparent"; }} />
            <div className="meta" hidden={guided && step !== 0}>
              <DbuTagPicker tags={doc.tags} customTags={customTags} onChange={(tags) => setDoc({ ...doc, tags })} />
              <span className="chip">
                Starts
                <input type="date" aria-label="Reference start Monday the dates on this page are drawn for"
                  value={startISO} onChange={(e) => setStart(dbuMondayOf(e.target.value) || startISO)} />
              </span>
              <span className="chip q">{summary.weeks} {summary.weeks === 1 ? "week" : "weeks"} · {weekdayLabel} · {summary.sessions} {summary.sessions === 1 ? "session" : "sessions"}{summary.last ? " · last " + dbuShortDate(summary.last) : ""}</span>
              <span className="saved">v{doc.version} · {saveLabel}</span>
            </div>
            {/* ⚠ The reference Monday is a REFERENCE. Each client's real start is chosen per
                client at assign, so the page says so rather than letting a coach read this
                as the start date their clients get. */}
            <div className="saved" hidden={guided && step !== 0} style={{ marginTop: 6 }}>Each client's own start is chosen at assign.</div>
          </div>
          <div className="acts">
            <button type="button" className="tog" onClick={() => setPreview(!preview)} aria-pressed={preview}>
              <i aria-hidden="true" />Preview as client
            </button>
            <button type="button" disabled={!!uploads || saveState === "saving"} onClick={async () => { if (await flush()) setTemplateSaved(true); }} style={dbuBtn(false)}>Save template</button>
            <button hidden={guided && step !== 3} type="button" disabled={!!uploads || saveState === "saving"} onClick={() => flush(true)} style={dbuBtn(false)}>Publish</button>
            <button hidden={guided && step !== 3} type="button" disabled={!!uploads} onClick={async () => { if (await flush()) setAssigning(true); }} style={dbuBtn(true, DBU_RUST)}>Assign to clients →</button>
          </div>
        </div>

        {/* ⚠ F6 retires *Save draft* and *Publish template* into autosave + Publish — but the
            header's button was ALSO the retry (it re-labelled itself "Retry save" on failure),
            so removing it outright would have left a coach whose save failed with no way to
            try again short of editing something else. The retry moves here, beside the other
            two recovery actions, rather than disappearing with the verb. */}
        {error && (
          <div role="alert" style={{ fontSize: 13.5, color: DBU_RUST, background: DBU_RUSTBG, borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
            <p style={{ margin: "0 0 10px" }}>{error}</p>
            <button type="button" disabled={!!uploads || saveState === "saving"} style={{ ...dbuBtn(false), marginRight: 8 }} onClick={() => flush()}>Retry save</button>
            <button type="button" style={{ ...dbuBtn(false), marginRight: 8 }} onClick={() => { if (draft(latest.current)) onBack(); else setError("This browser could not retain your draft. Keep this page open and retry saving."); }}>Keep draft &amp; return to library</button>
            {saveConflict && <button type="button" disabled={!!uploads || saveState === "saving"} style={dbuBtn(false)} onClick={saveAsCopy}>Save as new copy</button>}
          </div>
        )}
        {templateSaved && <p role="status">{live ? "Template saved to your library. Use as template makes a separate copy next time." : "Template draft saved on this device. Sign in to save to your library."}</p>}
        {doc.outlineOnly && <p style={{ fontSize: 13.5, color: DBU_INK2 }}>This imported outline has day or week titles only. Add exercises before assigning it as a structured workout.</p>}

        {/* ── Toolbar ─────────────────────────────────────────────────────── */}
        {layout === "editor" && <button className="cb-button" type="button" aria-expanded={showSchedule} onClick={()=>setShowSchedule(!showSchedule)}>{showSchedule ? "Hide schedule tools" : "Arrange days & weeks"}</button>}
        <div className="tb" hidden={!scheduleShown}>
          <DbuViewSwitch view={view} setView={setView} />
          <div style={{ flex: 1 }} />
          {/* ⚠ "Reuse a saved day" survives the retired tree. It is the one control there with
              no home in either canvas, and dropping it would have removed a shipped feature in
              a layout PR. Its developer-voice label (F10) is what changed, not its behaviour. */}
          {!!dayTemplates?.length && (
            <select aria-label="Add a saved day to week 1" value="" style={{ ...dbuField, cursor: "pointer" }}
              onChange={(e) => {
                const savedDay = dayTemplates[Number(e.target.value)];
                if (!savedDay) return;
                const next = JSON.parse(JSON.stringify(savedDay.day));
                next.id = crypto.randomUUID();
                const target = Math.max(0, sel.w);
                if (!dbuHasWeekday(next)) next.weekday = dbuNextFreeWeekday(doc.weeks[target]);
                setWeeks(doc.weeks.map((w, i) => (i === target ? { ...w, days: [...w.days, next] } : w)));
              }}>
              <option value="">Add a saved day…</option>
              {dayTemplates.map((x, i) => <option key={i} value={i}>{x.name}</option>)}
            </select>
          )}
          <button type="button" style={dbuBtn(false)} onClick={() => setWeeks([...doc.weeks, { ...DashBuilder.newWeek(), days: [{ ...DashBuilder.newDay("Day 1"), weekday: 0 }] }])}>＋ Week</button>
        </div>

        {/* ⚠ F1 (P0): `.dbu-layout` DECLARED TWO COLUMNS AND HAD THREE CHILDREN, so the client
            preview wrapped into the second grid row — inside the 210px tree column, measured at
            1,413px below the fold, where `position:sticky` cannot lift it because the cell it
            sticks inside IS that row. A coach ticked the box, saw nothing change, and concluded
            the control did nothing.
            ⚠ AND NEVER THREE COLUMNS, which is measured rather than preferred: at 1440 the
            content area is 1,104px, so a canvas beside BOTH a 400px editor and a 340px preview
            is 332px — at which the grid clips Sunday and the sheet clips the very week columns
            it exists to read left to right. So the preview takes the panel slot in Sheet (where
            cells are edited inline anyway) and floats as a popover in Grid (where the panel IS
            how you edit). Both views keep a ~690px canvas with the preview open. */}
        <div className="stage" ref={stageRef}>
          <div hidden={!scheduleShown}>
          {view === "grid"
            ? <DbuGrid doc={doc} dates={dates} sel={sel} setSel={selectDay} setWeeks={setWeeks} uploads={uploads} onWeek={onWeek} />
            : <DbuSheet doc={doc} dates={dates} setSel={selectDay} setWeeks={setWeeks} />}

          {/* The day editor, unchanged — every engine control it carries survives the redesign.
              ⚠ IT FLOATS OVER THE CANVAS rather than sitting beside it, which is the board's own
              `.drawer` and is what keeps the canvas full width: as a column it left the grid
              640px — measured — at which "Rest · ＋ Add session" wraps to three lines and the
              sheet's week columns are clipped. Below 1100px it drops back into the flow. */}
          </div>
          <div className={layout === "planner" ? "cb-planner-editor" : "cb-workspace"} hidden={guided && step !== 1 && step !== 3}>
            {layout !== "planner" && <aside className="cb-days" aria-label="Workout days">
              <label>Week<select aria-label="Week to edit" value={Math.max(0,sel.w)} style={dbuField} onChange={e=>setSel({w:Number(e.target.value),d:0})}>{doc.weeks.map((w,i)=><option key={i} value={i}>Week {i+1}{w.deload?" · deload":""}</option>)}</select></label>
              {(week || doc.weeks[0]).days.map((d,i)=><button type="button" className="cb-button" key={d.id || i} aria-pressed={sel.d===i} onClick={()=>setSel({w:Math.max(0,sel.w),d:i})}>{d.name}<small>{d.blocks.reduce((n,b)=>n+b.rows.length,0)} exercises</small></button>)}
              <button type="button" className="cb-button" onClick={()=>{const wi=Math.max(0,sel.w), w=doc.weeks[wi];setWeeks(doc.weeks.map((v,i)=>i===wi?{...v,days:[...v.days,{...DashBuilder.newDay("Day "+(w.days.length+1)),weekday:dbuNextFreeWeekday(w)}]}:v));setSel({w:wi,d:w.days.length});}}>＋ Add a day</button>
            </aside>}
          {day && !(guided && step === 3) && (
            /* ⚠ role="group", NOT "dialog": this panel is not modal, traps no focus and
               sits beside a canvas that stays live. Calling it a dialog tells a
               screen-reader user the rest of the page is inert when it is not. */
            <div className={"drawer float dash-thin-scroll" + (floating ? " is-popped" : "")} ref={panel.ref} role="group" aria-label={"Day editor \u00b7 " + day.name}
              style={floating ? panel.style : undefined}>
              <div className={"dh" + (floating ? " grab" : "")} {...panel.headerProps} style={panel.grabStyle}>
                {floating && <button type="button" className="gh" aria-label="Move the day editor — arrow keys nudge it, shift with an arrow moves it further" onKeyDown={panel.onKey} title="Drag to move" />}
                <b>{day.name}</b>
                {canFloat && <button type="button" className="x" onClick={()=>setPopped(!popped)}>{popped ? "Dock editor" : "Pop out editor"}</button>}
                {view === "grid" && <button type="button" className="x" onClick={() => {setView("sheet");setShowSchedule(true);if(guided)setStep(2);}} title="See this move across every week">Edit all {doc.weeks.length} weeks in the sheet</button>}
                {/* ⚠ The tree carried a per-day Copy button; the grid moves a day by dragging it
                    to another weekday, which is a different action. Duplication would have been
                    lost with the tree, so it lands here — on the day it is about. */}
                <button type="button" className="x" aria-label={"Duplicate " + day.name} onClick={() => {
                  const next = JSON.parse(JSON.stringify(day));
                  next.name += " (copy)";
                  next.id = crypto.randomUUID();
                  next.weekday = dbuNextFreeWeekday(doc.weeks[sel.w]);
                  setWeeks(doc.weeks.map((x, i) => (i === sel.w ? { ...x, days: [...x.days.slice(0, sel.d + 1), next, ...x.days.slice(sel.d + 1)] } : x)));
                  setSel({ w: sel.w, d: sel.d + 1 });
                }}>Duplicate day</button>
                <button type="button" className="x" aria-label="Close the day editor" onClick={() => setSel({ w: -1, d: -1 })}>Done</button>
              </div>
              <div className="when">Week {sel.w + 1}{dates[sel.w + ":" + sel.d] ? <> · <b>{dbuShortDate(dates[sel.w + ":" + sel.d])}</b></> : null}</div>
              <DbuDayEditor
                key={sel.w + ":" + day.id}
                day={day}
                onChange={setDay}
                onWeekday={setDayWeekday}
                takenBy={dbuTakenByWeekday(week, sel.d)}
                playlists={playlists}
                clips={clips}
                customMoves={ownMoves}
                compact={guided}
                onUploading={uploadCount}
              />
            </div>
          )}

          {guided && step === 3 && <section className="cb-review" aria-label="Review workout">
            <h2>{day?.name || "Choose a day"}</h2>
            {previewCard && <DashWorkoutCard workout={previewCard} interactive={false} maxRows={99}/>}
            <div className="cb-actions"><button type="button" className="cb-button" onClick={()=>goStep(1)}>Edit this workout</button></div>
          </section>}
          </div>
        </div>
        {guided && <CoachBuilderFooter step={step} onStep={goStep} steps={steps} busy={!!uploads}/>}

        {/* Client preview — the EXACT card the client dashboard renders, as the board's `.pop`.
            ⚠ IT IS DRAGGABLE, on the owner's ruling. Anchored bottom-right it lands on top of
            the site-wide chat button and, at the widths a coach actually builds at, over the
            sidebar it is meant to be read beside. Same header-grab, same clamp and the same
            arrow keys as the day editor, because it is the same hook. */}
        {preview && (
          <div className="pop" ref={previewPanel.ref} role="dialog" aria-label="Client preview" style={previewPanel.style}>
            <div className="ph2 grab" {...previewPanel.headerProps} style={previewPanel.grabStyle}>
              <button type="button" className="gh" aria-label="Move the client preview — arrow keys nudge it, shift with an arrow moves it further" onKeyDown={previewPanel.onKey} title="Drag to move" />
              <b>Client preview</b>
              <button type="button" className="x" onClick={() => setPreview(false)} aria-label="Close the client preview">Close</button>
            </div>
            {previewCard
              ? <DashWorkoutCard workout={previewCard} interactive={false} maxRows={99} />
              : <div style={{ color: DBU_INK3, fontSize: 13.5 }}>Pick a session to see what the client gets.</div>}
          </div>
        )}
      </div>

      {assigning && <DbuAssignModal template={{ id: idRef.current, name, revision: revision.current }} doc={doc} clients={clients} queue={queue} live={live} preselectId={preselectId} onClose={() => setAssigning(false)} />}
    </fieldset>
  );
}

// ── Performance zone ─────────────────────────────────────────────────────────
function DbuPerformance({ template, live }) {
  const perf = live ? null : DashBuilder.demoPerformance(template.id);
  if (!perf) {
    return <div style={{ fontSize: 12.5, color: DBU_INK50, lineHeight: 1.55 }}>Performance tracks from your first assignment of this template — subscriber, completion, and drop-off data appear once clients run it.</div>;
  }
  const max = Math.max(...perf.retention, 1);
  return (
    <div>
      <div style={{ display: "flex", gap: 22, marginBottom: 12 }}>
        <div><div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 24, lineHeight: 1 }}>{perf.subscribers}</div><div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_INK50, marginTop: 4 }}>Active subscribers</div></div>
        <div><div style={{ fontFamily: "var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)", fontSize: 24, lineHeight: 1 }}>{perf.completion}%</div><div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.12em", textTransform: "uppercase", color: DBU_INK50, marginTop: 4 }}>Completion rate</div></div>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 4, height: 64 }}>
        {perf.retention.map((v, i) => (
          <div key={i} title={"Week " + (i + 1) + " · " + v + "% retained"} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, height: "100%", justifyContent: "flex-end" }}>
            <div style={{ width: "100%", height: Math.round((v / max) * 100) + "%", background: v >= 70 ? "var(--sh-accent, #2ee0c4)" : v >= 50 ? "var(--sh-gold, #d8a23a)" : "var(--sh-rust, #e0644b)", borderRadius: 1, opacity: 0.85 }} />
            <span style={{ fontFamily: DBU_MONO, fontSize: 7, color: DBU_INK50 }}>W{i + 1}</span>
          </div>
        ))}
      </div>
      <div style={{ fontFamily: DBU_MONO, fontSize: 8.5, letterSpacing: "0.08em", color: DBU_INK50, marginTop: 8 }}>
        Per-week retention · drop-off at {(() => { let worst = 1, drop = 0; for (let i = 1; i < perf.retention.length; i++) { const d = perf.retention[i - 1] - perf.retention[i]; if (d > drop) { drop = d; worst = i + 1; } } return "week " + worst + " (−" + drop + " pts)"; })()}
      </div>
    </div>
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

function TrainerProgramsPage() {
  const {clients,queue,today:live,source}=useDashboard('trainer');
  const forClient = typeof dashRouteParam === 'function' ? dashRouteParam('client') : null;
  const targetClient = clients.find(c => c.profile.id === forClient);
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
          if(resolved.current&&libraryOwner.current!==data.ownerId){setView(null);setAssignFor(null);setUpdateFor(null);setFilters(DFB_EMPTY);usageRead.current++;setUsage({state:'idle'});}
          resolved.current=true;libraryOwner.current=data.ownerId;setOwnerId(data.ownerId);setTemplates((data.plans||[]).map(ShapeWorkoutDocument.normalizeWorkoutPlan));setError('');setRecoveries(Object.entries(dbuReadDrafts(data.ownerId)));
          if(data.ownerId)loadUsage();
        }
      // Until the dashboard knows whether anyone is signed in (`source` still null), a
      // failed read means nothing yet: stay on Loading instead of flashing an error at a
      // visitor who is a moment from the preview.
      }catch(e){if(on&&source!=null){if(source==='demo' && !libraryOwner.current){resolved.current=true;setTemplates(DashBuilder.demoTemplates());setRecoveries(Object.entries(dbuReadDrafts(null)));setError('');}else{setError(e.message || 'Could not load your workouts. Check your connection and retry.');setTemplates(null);}}}
      try{const res=await fetch('/api/coach/soundtracks',{credentials:'same-origin'});if(!res.ok)return;const data=await res.json();if(on)setPlaylists((data.soundtracks||data.playlists||[]).map(x=>({name:x.name,meta:x.track_count?x.track_count+' tracks':''})));}catch(e){}
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
  const days=(templates||[]).flatMap(t=>t.detail.builder.weeks.flatMap(w=>w.days.map(day=>({name:t.name+' · '+day.name,day}))));
  // Every move this coach has written that Shape does not list — derived from
  // their own saved programs, so the picker can offer it back with no store.
  const customMoves=DashBuilder.customMovesFromTemplates(templates||[]);
  const customTags=DashBuilder.customTagsFromTemplates(templates||[]);
  const clips=[...new Map((templates||[]).flatMap(t=>[
    ...(t.detail.media||[]).filter(m=>m.type==='video').map(m=>({name:m.name||t.name,url:ShapeWorkoutDocument.videoUrl(m.url)})),
    ...t.detail.builder.weeks.flatMap(w=>w.days.flatMap(d=>d.blocks.flatMap(b=>b.rows.filter(r=>r.video).map(r=>({name:r.name,url:ShapeWorkoutDocument.videoUrl(r.video)}))))),
  ]).filter(c=>c.url).map(c=>[c.url,c])).values()];
  const create=type=>{const builder=DashBuilder.newProgram();builder.weeks[0].days[0].name='Day 1';setView({name:type==='workout'?'New workout':'New program',published:false,detail:{buildType:type,builder}});};
  const saved=({plan})=>{setTemplates(prev=>[plan,...(prev||[]).filter(t=>t.id!==plan.id)]);setRecoveries(Object.entries(dbuReadDrafts(ownerId)));};
  return <React.Fragment>
    {source==='demo'&&<DashDemoBand/>}
    <DashPage tourHero="hero-programs" navItems={trainerNavItems('programs')} payoutCard={live?{label:'MONTHLY · NET',amount:live.kpis.monthlyNetCents!=null?dashMoney(live.kpis.monthlyNetCents):'—',sub:live.kpis.activeClients+' active clients'}:trainerPayoutCard}
      eyebrow="WORKOUT LIBRARY" title={<>Workouts <span style={{ fontFamily: "var(--sh-font-body, 'Space Grotesk', 'Space Grotesk Fallback', sans-serif)", fontWeight: 500, fontSize: "0.86em", letterSpacing: 0 }}>&amp;</span> programs</>} subtitle={view?'Build once. Use the same workout on the website and app.':'Reusable single days and programs, with demonstrations attached to each exercise.'}>
      {targetClient && <p role="status">Choose a program for {targetClient.profile.name}. The assignment will have this client selected.</p>}
      {view?<DbuBuilder key={view.id||view.name} template={view} preselectId={targetClient ? forClient : null} clients={clients} queue={queue} live={isLive} ownerId={ownerId} playlists={playlists} clips={clips} dayTemplates={days} customMoves={customMoves} customTags={customTags} onBack={()=>{setView(null);setRefresh(n=>n+1);}} onSaved={saved}/>:<>
        <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:14}}><button style={dbuLibBtn(true)} onClick={()=>create('workout')}>＋ Single workout day</button><button style={dbuLibBtn(false)} onClick={()=>create('program')}>＋ Program</button><button style={dbuLibBtn(false)} onClick={()=>setRefresh(n=>n+1)}>Refresh</button></div>
        {!!recoveries.length&&<div role="status" style={{padding:14,border:'1px solid var(--sh-gold, #d8a23a)',marginBottom:16}}><strong>Recover your work</strong>{recoveries.map(([id,draft])=><div key={id} style={{display:'flex',gap:10,alignItems:'center',flexWrap:'wrap',marginTop:8}}><span>{draft.name} · draft on this device</span><button style={dbuLibBtn(false)} onClick={()=>setView(dbuRecoveredTemplate(id,draft,templates))}>Resume draft</button></div>)}</div>}
        {error&&<p role="alert">{error} <button style={dbuLibBtn(false)} onClick={()=>setRefresh(n=>n+1)}>Retry</button></p>}
        {templates===null&&!error&&<p role="status">Loading workouts…</p>}
        {templates?.length===0&&<p>No workouts yet. Create a single day or program to start your library.</p>}
        {!!templates?.length&&<>
          {/* ⚠ EVERY FILTER SAYS WHAT IT WOULD LEAVE. Options inside one filter widen it,
              two filters narrow each other, and the count beside Clear is the result. */}
          <DashFilterBar facets={barFacets} run={run} state={filters} setState={setFilters} one="program" many="programs" placeholder="Find a program…" notes={{use:useNote}}/>
          <DashTagChips facet={tagFacet} run={run} onToggle={k=>setFilters(s=>dfbToggle(s,'tags',k))} onClear={()=>setFilters(s=>dfbClearFacet(s,'tags'))}/>
          {!customTags.length&&!items.some(x=>x.keys.tags.length)&&<p style={{...dbuLibMeta,fontSize:9,color:DBU_INK2,margin:'-8px 0 16px'}}>Tag a program under its name in the builder to file it here.</p>}
        </>}
        {!!templates?.length&&!run.shown.length&&<p role="status" style={{fontSize:14,color:DBU_INK2}}>No programs match these filters. <button type="button" style={dbuLibBtn(false)} onClick={()=>setFilters(DFB_EMPTY)}>Clear filters</button></p>}
        {/* ⚠ ONE HIERARCHY PER CARD, AND ONE ACTION ROW. The four buttons were all the
            same weight and ran 119 / 79 / 266 / 98px wide, so on a 359px card they
            dealt themselves into two or three ragged rows of white pills — which is
            most of what reads as clutter. "Update future assignments" is the one that
            blows the row out AND the rarest thing a coach does here, so it drops to a
            quiet line of its own and the three everyday actions sit in one even row. */}
          {/* auto-FILL, not auto-fit: a filter that leaves one program would otherwise
              stretch its card across the whole library. */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(min(290px,100%),1fr))',gap:14}}>{run.shown.map(({t,info})=>{
            const facts=dbuCardFacts(info);
            const inUse=info.clients!=null&&info.clients>0;
            return <div key={t.id} className="dash-plate" style={{'--dac':DBU_RUST,display:'flex',flexDirection:'column',gap:0}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:9}}>
                <span style={{...dbuLibMeta,color:DBU_INK2}}>{t.detail.buildType==='workout'?'Single day':'Program'}</span>
                {inUse&&<span style={{marginLeft:'auto',...dbuLibMeta,fontSize:9,letterSpacing:'0.12em',color:DBU_TEAL}}>In use · {info.clients}{usage.capped?'+':''} {info.clients===1&&!usage.capped?'client':'clients'}</span>}
                <span style={{marginLeft:inUse?0:'auto',...dbuLibMeta,fontSize:9,letterSpacing:'0.12em',padding:'3px 8px',borderRadius:99,
                  ...(t.published
                    ? {color:"var(--sh-accent-ink, #2ee0c4)",background:'rgba(var(--sh-accent-rgb, 46,224,196),0.12)',border:'1px solid rgba(var(--sh-accent-rgb, 46,224,196),0.4)'}
                    : {color:DBU_INK2,background:DBU_REST,border:'1px solid '+DBU_LINE})}}>{t.published?'Published':'Draft'}</span>
              </div>
              <h2 style={{fontFamily:"var(--sh-font-display, 'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif)",fontSize:23,fontWeight:600,lineHeight:1.15,margin:'0 0 6px',color:'var(--sh-ink, #f2ede4)'}}>{t.name}</h2>
              {/* It read "1 weeks · 1 days" on every single-week workout. */}
              <p style={{...dbuLibMeta,fontSize:10,color:DBU_INK2,margin:'0 0 10px'}}>{t.detail.buildType==='workout'
                ? info.moves+' '+(info.moves===1?'move':'moves')
                : info.weeks+' '+(info.weeks===1?'week':'weeks')+' · '+info.perWeek+' '+(info.perWeek===1?'day':'days')+' a week'}</p>
              {!!info.tags.length&&<div style={{display:'flex',gap:6,flexWrap:'wrap',margin:'0 0 10px'}}>{info.tags.map(tag=><span key={tag.key} className="dash-chip dash-chip--sm" style={{'--c':tag.c,cursor:'default'}}>{tag.label}</span>)}</div>}
              {facts&&<p style={{...dbuLibMeta,fontSize:9,lineHeight:1.6,color:DBU_INK2,margin:'0 0 14px'}}>{facts}</p>}
              <div style={{display:'flex',gap:7,flexWrap:'wrap',marginTop:'auto'}}>
                <button style={dbuLibBtn(true)} onClick={()=>setView(coachTemplateCopy(t))}>Use as template</button>
                <button style={dbuLibBtn(false)} onClick={()=>setView(t)}>Edit template</button>
                <button style={dbuLibBtn(false)} onClick={()=>setAssignFor(t)}>Assign</button>

              </div>
              {isLive&&<button onClick={()=>setUpdateFor(t)} style={{marginTop:10,padding:'6px 0',minHeight:24,background:'transparent',border:0,cursor:'pointer',textAlign:'left',fontFamily:DBU_BODY,fontSize:12.5,fontWeight:600,color:DBU_TEAL}}>Update future assignments →</button>}
            </div>;})}</div>
      </>}
    </DashPage>
    {updateFor&&<DbuFutureUpdates template={updateFor} clients={clients} onClose={()=>setUpdateFor(null)}/>}
    {assignFor&&<DbuAssignModal template={{id:assignFor.id,name:assignFor.name,revision:assignFor.detail.revision}} doc={assignFor.detail.builder} clients={clients} queue={queue} live={isLive} preselectId={targetClient ? forClient : null} onClose={()=>setAssignFor(null)}/>}
  </React.Fragment>;
}

Object.assign(window, { TrainerProgramsPage, DbuBuilder, DbuAssignModal, DbuPerformance });
