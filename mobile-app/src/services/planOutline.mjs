// Plan-outline parsers — shared by the coach Assign flow (iosAppBroadsheetPros)
// and the client Start-this-plan flow (a purchased plan → self-authored rows).
// Coach plans (coach_plans) store free-text outline blocks; these map them onto
// the shapes the client app consumes — client_workouts exercises (Train deck)
// and client_meal_plans days (Eat menu). Extracted verbatim so both callers
// share one implementation.

export const BS_ASSIGN_DOW = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];

export function bsAssignSplitBlock(text) {
  const s = String(text || '').trim();
  if (!s) return null;
  const m = s.match(/^(.*?)\s*[—–:]\s*(.+)$/);
  return { head: (m ? m[1] : s).trim(), tail: m ? m[2].trim() : '' };
}

// "Secondary compound · 4×8" / "Back squat — 4 × 6 · RPE 8" → exercise row.
export function bsAssignExercise(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  let { head, tail } = p;
  if (!tail) {
    const dot = head.split(/\s*·\s*/);
    if (dot.length > 1 && /\d/.test(dot.slice(1).join(''))) { head = dot[0].trim(); tail = dot.slice(1).join(' · '); }
  }
  const sx = tail.match(/(\d+)\s*[×x]\s*([\d–-]+)/);
  return {
    name: head,
    sets: sx ? sx[1] : '',
    reps: sx ? sx[2] : '',
    rest: '',
    load: sx ? tail.replace(sx[0], '').replace(/^[\s·,]+|[\s·,]+$/g, '') : tail,
  };
}

// "Week 3 — Intensification" → { week: 3, title: 'Intensification' }; null when
// the line is not a week label.
//
// This is NOT malformed input. The trainer's paid `plan` builder and the
// nutritionist's `program` builder both emit exactly this shape, and both label
// the field "Weeks" in the editor — a week-block outline is a first-class way to
// author a multi-week product. A week label states HOW HARD over time; it is not
// a movement, which is why it must never reach bsAssignExercise (that produced
// an exercise literally named "Week 3" carrying a LOAD of "Intensification").
//
// ONE grammar, deliberately: planPreview.mjs imports this, so the Listing
// preview can never classify a plan differently from how Assign /
// Start-this-plan actually deliver it.
export function bsAssignWeekLine(text) {
  const m = /^\s*week\s*(\d{1,2})\b[\s.:—–-]*(.*)$/i.exec(String(text || ''));
  if (!m) return null;
  const week = Number(m[1]);
  if (!Number.isFinite(week) || week < 1 || week > 52) return null;
  return { week, title: String(m[2] || '').trim() };
}

// The ONE aggregation over week lines: dedupe by week number (the first stated
// title wins), ordered ascending. Sharing the GRAMMAR was not enough — the
// preview, the coach Assign page and the client start sheet each re-derived this
// independently, and the preview's copy had neither the dedupe nor the sort, so a
// duplicated or out-of-order "Week N" line previewed a different set than the
// delivery built. That is the exact preview/delivery mismatch this file exists to
// prevent, so the aggregation is shared too.
export function bsWeekUnits(lines) {
  const seen = new Set();
  const out = [];
  for (const w of (Array.isArray(lines) ? lines : [])) {
    if (!w || seen.has(w.week)) continue;
    seen.add(w.week);
    out.push(w);
  }
  return out.sort((a, b) => a.week - b.week);
}

// A block's DURATION is the highest week it STATES, not how many labels it
// carries: "Week 1 — Base" + "Week 6 — Peak" is a six-week plan with two authored
// weeks. Counting labels would report 2 while the schedule runs to week 6 and the
// Listing preview (which reads the max) says 6 — three numbers, one plan.
export const bsWeekSpan = (units) => (units.length ? units[units.length - 1].week : 0);

// "Mon — Upper (push)" → { dow: 0, title, rest }; null when not a weekday line.
export function bsAssignDayLine(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  const dow = BS_ASSIGN_DOW.indexOf(p.head.slice(0, 3).toLowerCase());
  if (dow < 0) return null;
  return { dow, title: p.tail || p.head, rest: /rest/i.test(p.tail || p.head) };
}

// "Breakfast — Greek yogurt bowl · 420 kcal" → meal-plan meal entry.
export function bsAssignMeal(text) {
  const p = bsAssignSplitBlock(text);
  if (!p) return null;
  const lower = p.head.toLowerCase();
  const slot = ['breakfast', 'lunch', 'dinner', 'snack'].find(w => lower.startsWith(w));
  const kcal = ((p.tail || p.head).match(/(\d{2,4})\s*kcal/i) || [])[1];
  return { slot: (slot || 'meal').toUpperCase(), title: p.tail || p.head, kcal: kcal ? Number(kcal) : 0 };
}

// ── The per-day menu contract ────────────────────────────────────────────────
// docs/superpowers/specs/2026-07-26-per-day-menu-contract.md
//
// The single source of truth for "what does this plan serve on each day?".
// BSProAssignPage delivers from it and planPreview.mjs renders the buyer-facing
// paid preview from it, so a preview can never describe a week the delivery does
// not build — the same reason the parsers above are shared rather than copied.
//
// `detail.days` is ADDITIVE. `detail.blocks` stays and is the DEFAULT menu: a
// plan with no `days` key, or a `days` that omits a weekday, serves
// `detail.blocks` on those days. That is what keeps every already-published plan
// byte-identical with no backfill, and what keeps the paid preview from ever
// seeing an empty block list.

// `detail` comes off a PUBLIC-READ provider row, so a crafted plan can carry a
// huge array. Bound the scan the way planPreview.mjs already does.
const DAYS_SCAN = 7;
const DAY_BLOCK_SCAN = 40;

// A dow is valid only as a real integer 0..6 (0 = MONDAY, matching
// BS_ASSIGN_DOW and bsRepeatSpec — NOT the reminders table's 0 = Sunday).
// Invalid/duplicate values are DROPPED, never clamped: clamping would silently
// move a coach's Thursday menu onto Sunday, whereas dropping falls back to that
// day's default menu, which is the honest degrade.
//
// Deliberately strict about type. `Number('1')` is 1, so a stringy dow off a
// jsonb column would coerce — but a value we cannot distinguish from a typo is
// not a day the coach chose, and this is the write path for PAID content.
function validDow(v) {
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 6;
}

// Two block lists say the same thing when their rendered TEXT matches in order.
// Compared on text, not identity: a per-day authoring UI naturally produces
// fresh objects for an unmodified day, and those are not a per-day plan.
function sameBlocks(a, b) {
  if (a === b) return true;
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    const ta = (a[i] && a[i].text != null) ? a[i].text : a[i];
    const tb = (b[i] && b[i].text != null) ? b[i].text : b[i];
    if (String(ta == null ? '' : ta) !== String(tb == null ? '' : tb)) return false;
  }
  return true;
}

// → { perDay: boolean, days: [{ dow, blocks }] } — ALWAYS seven entries, dow 0..6
// ascending, each carrying the blocks that day actually serves.
//
// `perDay` is true only when at least one day's blocks DIFFER from the default.
// A `days` array that is present but says the same thing everywhere is not a
// per-day plan and must not be sold as one — §5.3 of the contract.
export function bsPlanWeek(detail) {
  const d = (detail && typeof detail === 'object' && !Array.isArray(detail)) ? detail : {};
  const fallback = Array.isArray(d.blocks) ? d.blocks.slice(0, DAY_BLOCK_SCAN) : [];

  const byDow = new Map();
  if (Array.isArray(d.days)) {
    for (const entry of d.days.slice(0, DAYS_SCAN)) {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
      if (!validDow(entry.dow)) continue;
      if (byDow.has(entry.dow)) continue;          // first authored entry wins
      if (!Array.isArray(entry.blocks)) continue;  // a day with no list inherits
      byDow.set(entry.dow, entry.blocks.slice(0, DAY_BLOCK_SCAN));
    }
  }

  let perDay = false;
  const days = [];
  for (let dow = 0; dow < 7; dow += 1) {
    const authored = byDow.get(dow);
    if (authored && !sameBlocks(authored, fallback)) perDay = true;
    days.push({ dow, blocks: authored || fallback });
  }
  return { perDay, days };
}

export function bsAssignIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// Materialize a purchased plan's outline into self-authored client_workouts
// insert-payloads. Mirrors BSProAssignPage.apply's split-vs-exercise branch,
// but returns payloads (stamped payload.program:{id:'plan:'+planId, …}) instead
// of writing — the client's Start-this-plan flow inserts them as self rows.
//
//   plan     — { id, name, detail:{ blocks:[{text}|string], note } }
//   startISO — 'YYYY-MM-DD' the block begins on
//   weeks    — how many weeks to repeat
//   runId    — the materialization run stamp (for atomic re-start)
export function bsMaterializeOutline({ plan, startISO, weeks = 4, runId }) {
  if (!plan) return [];
  const id = `plan:${plan.id}`;
  const name = plan.name || 'Plan';
  const [sy, sm, sd] = String(startISO).split('-').map(Number);
  const start = new Date(sy, (sm || 1) - 1, sd || 1); // local midnight
  const monday = new Date(start); monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  const planNote = (plan.detail && plan.detail.note) || '';
  const blocks = (plan.detail && Array.isArray(plan.detail.blocks) ? plan.detail.blocks : [])
    .map(b => (b && b.text != null) ? b.text : b).map(s => String(s || '').trim()).filter(Boolean);
  const dayLines = blocks.map(bsAssignDayLine);
  const weekLines = blocks.map(bsAssignWeekLine);
  // Precedence mirrors planPreview.mjs EXACTLY (split → week block → session).
  // The two modules classify the same outline or the Listing preview would
  // promise something the delivery doesn't build.
  const isSplit = dayLines.filter(Boolean).length >= 3;
  const isWeekBlock = !isSplit && weekLines.filter(Boolean).length >= 2;
  // Stated phase per week ("Week 3 — Intensification" → phases[3]). Carried, not
  // dropped: the split branch used to skip every non-weekday line, so a phase the
  // coach deliberately wrote just vanished.
  const phases = {};
  for (const w of weekLines) if (w && w.title && phases[w.week] == null) phases[w.week] = w.title;
  const nWeeks = Math.max(1, Math.min(26, Math.round(Number(weeks) || 1)));
  const rows = [];
  const stamp = (week, day) => {
    const s = { id, name, week, day, weeks: nWeeks, runId: runId || '' };
    if (phases[week]) s.phase = phases[week];
    return s;
  };

  if (isWeekBlock) {
    // A week block's length is STATED by the outline itself, so it drives the
    // schedule — the caller's `weeks` means "repeat the weekly thing N times",
    // which is not what a week block does. Deduped and ordered by the coach's
    // own week numbers; a non-week block (the nutrition builder emits a trailing
    // "Grocery + prep guide") is not a week and is not scheduled as one.
    const units = bsWeekUnits(weekLines);
    const span = bsWeekSpan(units);
    for (const u of units) {
      const d = new Date(start);
      d.setDate(d.getDate() + (u.week - 1) * 7);
      const dow = (d.getDay() + 6) % 7;
      rows.push({
        title: u.title || `${name} · Week ${u.week}`,
        description: planNote || name,
        scheduledDate: bsAssignIso(d),
        // Deliberately NO exercises: the coach stated a phase, not movements.
        // An empty session is the honest render of what they wrote — inventing
        // moves from a week label is exactly the old bug.
        payload: {
          exercises: [],
          program: { id, name, week: u.week, day: dow, weeks: span, runId: runId || '', ...(u.title ? { phase: u.title } : {}) },
        },
      });
    }
    return rows;
  }

  if (isSplit) {
    for (let w = 0; w < nWeeks; w++) {
      for (const dl of dayLines) {
        if (!dl || dl.rest) continue;
        const d = new Date(monday); d.setDate(d.getDate() + w * 7 + dl.dow);
        if (d < start) continue;
        rows.push({
          title: dl.title,
          description: planNote || name,
          scheduledDate: bsAssignIso(d),
          payload: { exercises: [], program: stamp(w + 1, dl.dow) },
        });
      }
    }
  } else {
    // A week label is never a movement — drop it here too, so a mixed outline
    // (one phase line + real exercises) can't smuggle "Week 1" in as a lift.
    const exercises = blocks.filter((_, i) => !weekLines[i]).map(bsAssignExercise).filter(Boolean)
      .map(e => ({ name: e.name, sets: e.sets, reps: e.reps, load: e.load, seg: '' }));
    for (let w = 0; w < nWeeks; w++) {
      const d = new Date(start); d.setDate(d.getDate() + w * 7);
      const dow = (d.getDay() + 6) % 7;
      rows.push({
        title: name,
        description: planNote,
        scheduledDate: bsAssignIso(d),
        payload: { exercises, program: stamp(w + 1, dow) },
      });
    }
  }
  return rows;
}
