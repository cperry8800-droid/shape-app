// Pure helpers for the coach Today "Assignment Rail" + Case File lead.
// No DOM, no Date.now — callers pass `now`. Contract:
// docs/superpowers/specs/2026-07-04-coach-ledger-redesign-design.md
// (three rules: one loop · anchor · attention budget).

export function bsProMin(hhmm) {
  if (typeof hhmm !== 'string') return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = +m[1], mm = +m[2];
  if (h > 23 || mm > 59) return null;
  return h * 60 + mm;
}

export function bsProHourLabel(hhmm) {
  const min = bsProMin(hhmm);
  if (min == null) return typeof hhmm === 'string' && hhmm ? hhmm : '—';
  const h = Math.floor(min / 60), mm = min % 60;
  const h12 = ((h + 11) % 12) + 1;
  return mm ? `${h12}:${String(mm).padStart(2, '0')}` : `${h12}${h < 12 ? 'A' : 'P'}`;
}

export function bsProGapLabel(startMin, endMin) {
  const f = (m) => ((Math.floor(m / 60) + 11) % 12) + 1;
  return `${f(startMin)} – ${f(endMin)} · OPEN`;
}

// Durations are embedded in the booking `sub` strings ('Lower Pull · 60m') on
// BOTH the demo datasets and the real ShapeCalendar rows — no durationMin field
// exists upstream. Callers map this onto bookings before bsProDayShape.
export function bsProDurationFromSub(sub) {
  if (typeof sub !== 'string') return null;
  const m = sub.match(/(\d+)\s*m\b/i);
  return m ? +m[1] : null;
}

export function bsProDayShape(bookings = [], now = null) {
  const rows = bookings
    .map((b, i) => ({ i, min: bsProMin(b && b.time), b }))
    .filter((r) => r.min != null)
    .sort((a, b) => a.min - b.min);
  const endOf = (r) => r.min + ((r.b && r.b.durationMin) || 60);
  const gaps = [];
  let openMins = 0;
  for (let k = 1; k < rows.length; k++) {
    const g = rows[k].min - endOf(rows[k - 1]);
    if (g >= 60) openMins += g;
    if (g >= 90) gaps.push({ afterIdx: rows[k - 1].i, startMin: endOf(rows[k - 1]), endMin: rows[k].min });
  }
  const openHours = rows.length >= 2 ? Math.floor(openMins / 60) : null;
  let nowSlot = null, countdown = null;
  if (now && typeof now.h === 'number') {
    const nowMin = now.h * 60 + now.m;
    const next = rows.find((r) => r.min > nowMin && (!r.b || r.b.state !== 'done'));
    nowSlot = next ? next.i : (rows.length ? 'end' : null);
    if (next) {
      const d = next.min - nowMin, H = Math.floor(d / 60), M = d % 60;
      const who = String((next.b && (next.b.client || next.b.title)) || 'next').split(' ')[0].toUpperCase();
      countdown = d < 60 ? `${M}M UNTIL ${who}` : `${H}H ${M}M UNTIL ${who}`;
    } else if (rows.length) {
      countdown = 'DAY CLEAR';
    }
  }
  return { sessions: bookings.length, gaps, openHours, nowSlot, countdown };
}

export function bsProAttentionBudget(triage = [], bookings = [], max = 3) {
  const norm = (s) => String(s || '').trim().toLowerCase();
  const anchorOf = (t) => bookings.findIndex((b) => b && (
    (t.clientId && b.clientId && t.clientId === b.clientId) ||
    (norm(t.name) && (norm(b.client) === norm(t.name) || norm(b.title) === norm(t.name)))
  ));
  const lead = triage[0] || null;
  const leadIdx = lead ? anchorOf(lead) : -1;
  const inline = [], wires = [], demoted = [];
  for (const t of triage.slice(1)) {
    if (inline.length + wires.length >= max) { demoted.push(t); continue; }
    const idx = anchorOf(t);
    if (idx >= 0) inline.push({ ...t, bookingIdx: idx }); else wires.push(t);
  }
  return { lead, leadAnchor: leadIdx >= 0 ? leadIdx : null, inline, wires, demoted };
}

// Coach Home's Your day (owner, 2026-11-04, of To do and the Schedule: "also can we combine these? figure out
// a design to show both condensed more together to take up less space"). A session's client is matched to
// their to-do by client id when both carry one, else by the exact name: the booking's client (or title)
// without its "New:" or a " · review" after it, never a substring.
export function bsProBookingWho(b) {
  return String((b && (b.client || b.title)) || '').replace(/^\s*new:\s*/i, '').split(/\s+·\s+/)[0].trim();
}
export function bsProTodoFor(triage = [], b) {
  if (!b) return null;
  const norm = (s) => String(s || '').trim().toLowerCase();
  return triage.find((w) => (w.clientId && b.clientId)
    ? w.clientId === b.clientId
    : (!!norm(w.name) && norm(w.name) === norm(bsProBookingWho(b)))) || null;
}
// On today, each open session (not done) takes in its client's to-do, the first session of theirs only;
// `foldAt` maps a booking's index to the to-do it carries, and `anytime` is what no session carries, in
// the triage's order. On another day nothing folds: To do is today's.
export function bsProFoldTodos(triage = [], bookings = [], { today = true } = {}) {
  const foldAt = new Map();
  if (today) bookings.forEach((b, i) => {
    if (!b || b.state === 'done') return;
    const w = bsProTodoFor(triage, b);
    if (w && ![...foldAt.values()].includes(w)) foldAt.set(i, w);
  });
  const folded = new Set(foldAt.values());
  return { foldAt, anytime: triage.filter((w) => !folded.has(w)) };
}

export function bsProLeadVerdict({ signedIn, sessions = 0, firstLabel = null, top = null } = {}) {
  if (!signedIn) return null; // signed-out demo narratives are authored at the call site
  if (top) return `${top.name} first — ${top.directive}`;
  if (sessions) return `${sessions} ${sessions === 1 ? 'session' : 'sessions'} — first at ${firstLabel}.`;
  return 'Nothing booked, nobody flagged — a clear day.';
}
