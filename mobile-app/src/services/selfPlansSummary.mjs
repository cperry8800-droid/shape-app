// Self-plans summary — the coach Case File's read of a member's SELF-AUTHORED
// training: get_client_self_plans rows → the three display groups (programs ·
// weekly repeats · upcoming one-offs). Pure: no React, no Date.now() (today is
// injected as an ISO day string) — tested in tests/self-plans-summary.test.mjs.
//
// Input rows are the RPC's compact projection ({ title, kind, scheduled_date,
// repeat_dow, program, move_count, created_at }); camelCase twins are accepted
// so a future non-RPC caller can't silently drop fields.

// The self-training dow convention is 0 = MONDAY (BS_BUILDER_DOW /
// bsMaterializeProgram: date = Monday(start) + dow) — NOT the reminders
// table's 0 = Sunday. Mislabeling here would read a member's Tue/Thu plan
// as Mon/Wed to their coach.
const BS_SELF_PLAN_DAY_ABBR = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

// "repeatDow ints → 'Mo We Fr'" — invalid entries dropped, duplicates folded,
// always displayed in week order regardless of stored order.
export function bsSelfPlanDays(repeatDow) {
  if (!Array.isArray(repeatDow)) return '';
  // Number(null) is 0 — a null entry must never read as Sunday.
  const days = [...new Set(repeatDow
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map(Number)
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6))].sort((a, b) => a - b);
  return days.map((d) => BS_SELF_PLAN_DAY_ABBR[d]).join(' ');
}

/**
 * @param {Array} rows get_client_self_plans rows
 * @param {string|null} todayIso the member-facing "today" (YYYY-MM-DD); rows
 *   dated before it don't count as upcoming (a finished program shows its
 *   name with no next date — honest, never a fabricated future session).
 * @returns {{ total:number,
 *   programs:Array<{name,weeks,sessions,nextDate,nextWeek}>,
 *   repeats:Array<{title,days}>,
 *   upcoming:Array<{title,date}> }}
 */
export function bsSelfPlansSummary(rows, todayIso) {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === 'object') : [];
  const programs = new Map();
  const repeats = [];
  const upcoming = [];
  for (const r of list) {
    const prog = r.program && typeof r.program === 'object' ? r.program : null;
    const repRaw = Array.isArray(r.repeat_dow) ? r.repeat_dow : Array.isArray(r.repeatDow) ? r.repeatDow : null;
    const date = typeof r.scheduled_date === 'string' ? r.scheduled_date
      : typeof r.scheduledDate === 'string' ? r.scheduledDate : null;
    if (prog) {
      // One line per program RUN (a re-started plan is a fresh run) — sessions
      // counted, the next dated session (>= today) carries the week readout.
      const key = String(prog.runId || prog.id || prog.name || 'program');
      const g = programs.get(key) || {
        name: String(prog.name || 'Program'),
        weeks: Number.isFinite(Number(prog.weeks)) ? Number(prog.weeks) : null,
        sessions: 0,
        nextDate: null,
        nextWeek: null,
      };
      g.sessions += 1;
      if (date && (!todayIso || date >= todayIso) && (g.nextDate == null || date < g.nextDate)) {
        g.nextDate = date;
        g.nextWeek = Number.isFinite(Number(prog.week)) ? Number(prog.week) : null;
      }
      programs.set(key, g);
    } else if (repRaw && repRaw.length) {
      const days = bsSelfPlanDays(repRaw);
      if (!days) continue;
      const title = String(r.title || 'Session');
      if (!repeats.some((x) => x.title === title && x.days === days)) repeats.push({ title, days });
    } else if (date && (!todayIso || date >= todayIso)) {
      upcoming.push({ title: String(r.title || 'Session'), date });
    }
    // Undated, repeat-less, program-less rows (drafts) are counted in total
    // but get no display row — nothing to say about them honestly.
  }
  upcoming.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return {
    total: list.length,
    programs: [...programs.values()],
    repeats: repeats.slice(0, 6),
    upcoming: upcoming.slice(0, 5),
  };
}
