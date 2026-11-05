// The Team view of a shared client (owner, 2026-11-05: "Show both coaches' week side by side, the
// care-team thread, and 'next, and whose'"): one week, one lane per coach, from what each coach can
// already read of the other's work (the shared definers: plan headers, workouts without sets, menus
// without recipes, sessions). Pure: /api/me/shared-clients/[clientId]/team reads the rows and hands
// them here, so the test runs exactly what the route runs.
//
// buildTeamView(input) → {
//   week: { start, days: [YYYY-MM-DD ×7] },
//   team: [{ userId, role, name, since, me }],
//   lanes: [{ userId, role, name, me, days: { [ymd]: [{ kind, title, detail, done? }] } }],
//   next: [{ whose: 'you' | 'both' | <name>, role?, kind, label, at? }],
// }
// A lane holds what that coach put on each day: workouts (a trainer), the menu's day (a
// nutritionist: its title, training or rest, and the day's kcal), and sessions (anyone). Nothing is
// invented: a coach with nothing this week has an empty lane, said as such by the page.

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DAY = 86_400_000;

export function mondayOf(ymd) {
  const at = Date.parse((YMD.test(String(ymd)) ? ymd : new Date().toISOString().slice(0, 10)) + 'T12:00:00Z');
  const d = new Date(at);
  const dow = (d.getUTCDay() + 6) % 7;
  return new Date(at - dow * DAY).toISOString().slice(0, 10);
}
export function weekDays(start) {
  const at = Date.parse(start + 'T12:00:00Z');
  return Array.from({ length: 7 }, (_, i) => new Date(at + i * DAY).toISOString().slice(0, 10));
}
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
const clean = (s, max = 80) => String(s == null ? '' : s).replace(/\s+/g, ' ').trim().slice(0, max);

// A menu's days placed on the week: its week_start when it has one (dow 0 = that Monday), else the
// menu repeats weekly from this week's Monday.
function menuDays(menu, start) {
  const out = {};
  const days = Array.isArray(menu && menu.payload && menu.payload.days) ? menu.payload.days : [];
  const base = menu && YMD.test(String(menu.week_start || '')) ? mondayOf(menu.week_start) : start;
  const repeats = !(menu && YMD.test(String(menu.week_start || '')));
  const week = weekDays(start);
  for (const d of days) {
    if (!d || typeof d !== 'object') continue;
    const dow = Number(d.dow);
    if (!Number.isInteger(dow) || dow < 0 || dow > 6) continue;
    // A dated menu covers its own week and, as plans run on, the weeks after it.
    const ymd = repeats || base <= start ? week[dow] : addDays(base, dow);
    if (!week.includes(ymd)) continue;
    const meals = Array.isArray(d.meals) ? d.meals : [];
    const kcal = meals.reduce((s, m) => s + (Number(m && m.kcal) || 0), 0);
    const target = d.targets && Number(d.targets.cal) > 0 ? Number(d.targets.cal) : null;
    const tag = String(d.tag || '').toUpperCase() === 'REST' ? 'Rest day' : String(d.tag || '').toUpperCase() === 'TRAIN' ? 'Training day' : '';
    (out[ymd] ||= []).push({
      kind: 'menu',
      title: clean(d.title) || clean(menu.title) || 'Menu',
      detail: [tag, target ? `${target} kcal target` : kcal ? `${Math.round(kcal)} kcal` : ''].filter(Boolean).join(' · '),
    });
  }
  return out;
}

function whenLabel(iso, tz) {
  const at = new Date(iso);
  if (!Number.isFinite(at.getTime())) return '';
  try {
    return at.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: tz || 'UTC', ...(tz ? {} : { timeZoneName: 'short' }) });
  } catch {
    return at.toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  }
}

export function buildTeamView(input) {
  const me = String(input.me || '');
  const start = mondayOf(input.weekStart);
  const days = weekDays(start);
  const tz = typeof input.tz === 'string' && input.tz ? input.tz : null;
  const nowMs = input.now instanceof Date ? input.now.getTime() : Date.now();

  // One entry per person and role; the caller is marked.
  const team = [];
  for (const r of Array.isArray(input.team) ? input.team : []) {
    if (!r || (r.provider_role !== 'trainer' && r.provider_role !== 'nutritionist') || !r.owner_id) continue;
    if (team.some((t) => t.userId === r.owner_id && t.role === r.provider_role)) continue;
    team.push({ userId: r.owner_id, role: r.provider_role, providerId: Number(r.provider_id), name: clean(r.name) || (r.provider_role === 'trainer' ? 'Trainer' : 'Nutritionist'), since: r.since || null, me: r.owner_id === me });
  }
  const laneOf = new Map();
  const lanes = team.map((t) => {
    const lane = { userId: t.userId, role: t.role, name: t.name, me: t.me, days: {} };
    laneOf.set(`${t.role}:${t.providerId}`, lane);
    return lane;
  });
  const push = (lane, ymd, item) => { if (lane && days.includes(ymd)) (lane.days[ymd] ||= []).push(item); };
  const byName = (role, name) => lanes.find((l) => l.role === role && !l.me && l.name === clean(name)) || lanes.find((l) => l.role === role && !l.me) || null;

  // Workouts: the caller's own rows (by trainer id), and the other trainers' (the definer names them).
  for (const w of Array.isArray(input.ownWorkouts) ? input.ownWorkouts : []) {
    const lane = laneOf.get(`trainer:${Number(w.trainer_id)}`) || lanes.find((l) => l.me && l.role === 'trainer');
    const n = Array.isArray(w.payload && w.payload.exercises) ? w.payload.exercises.length : 0;
    push(lane, String(w.scheduled_date || ''), { kind: 'workout', title: clean(w.title) || 'Workout', detail: [w.payload && w.payload.duration ? clean(w.payload.duration, 20) : '', n ? `${n} exercises` : ''].filter(Boolean).join(' · '), done: !!w.done });
  }
  for (const w of Array.isArray(input.otherWorkouts) ? input.otherWorkouts : []) {
    const lane = byName('trainer', w.trainer_name);
    const runs = Array.isArray(w.runs) ? w.runs : [];
    push(lane, String(w.scheduled_date || ''), { kind: 'workout', title: clean(w.title) || 'Workout', detail: [w.duration ? clean(w.duration, 20) : '', w.exercise_count ? `${w.exercise_count} exercises` : ''].filter(Boolean).join(' · '), done: runs.length > 0 });
  }
  // Menus: the caller's own newest one, and each other nutritionist's newest (the definer names them).
  for (const m of Array.isArray(input.ownMenus) ? input.ownMenus : []) {
    const lane = laneOf.get(`nutritionist:${Number(m.nutritionist_id)}`) || lanes.find((l) => l.me && l.role === 'nutritionist');
    for (const [ymd, items] of Object.entries(menuDays(m, start))) for (const it of items) push(lane, ymd, it);
  }
  for (const m of Array.isArray(input.otherMenus) ? input.otherMenus : []) {
    const lane = byName('nutritionist', m.nutritionist_name);
    for (const [ymd, items] of Object.entries(menuDays(m, start))) for (const it of items) push(lane, ymd, it);
  }
  // Sessions, on the lane of the coach who holds them.
  const live = new Set(['requested', 'confirmed', 'completed']);
  const sessions = (Array.isArray(input.sessions) ? input.sessions : []).filter((s) => s && live.has(s.status) && Number.isFinite(Date.parse(s.scheduled_at)));
  for (const s of sessions) {
    const lane = laneOf.get(`${s.provider_role}:${Number(s.provider_id)}`);
    const ymd = new Date(s.scheduled_at).toISOString().slice(0, 10);
    const kind = s.intro ? 'Intro call' : s.provider_role === 'nutritionist' ? 'Consult' : 'Session';
    push(lane, ymd, { kind: 'session', title: kind + (s.status === 'requested' ? ' (requested)' : ''), detail: whenLabel(s.scheduled_at, tz) + (s.topic ? ' · ' + clean(s.topic, 60) : ''), done: s.status === 'completed' });
  }

  // Next, and whose.
  const whoseOf = (lane) => (lane ? (lane.me ? 'you' : lane.name) : 'both');
  const next = [];
  const upcoming = sessions.filter((s) => s.status !== 'completed' && Date.parse(s.scheduled_at) >= nowMs).sort((a, b) => Date.parse(a.scheduled_at) - Date.parse(b.scheduled_at));
  for (const s of upcoming.slice(0, 2)) {
    const lane = laneOf.get(`${s.provider_role}:${Number(s.provider_id)}`);
    next.push({ whose: whoseOf(lane), role: lane ? lane.role : null, kind: 'session', label: `${s.provider_role === 'nutritionist' ? 'Consult' : 'Session'} ${whenLabel(s.scheduled_at, tz)}${s.status === 'requested' ? ' (requested, not confirmed)' : ''}`, at: s.scheduled_at });
  }
  const checkin = (Array.isArray(input.checkins) ? input.checkins : []).filter((c) => c && c.question && String(c.question).trim())[0];
  if (checkin && String(checkin.week_of || '') >= addDays(start, -7)) {
    next.push({ whose: 'both', kind: 'question', label: `Answer their check-in question: "${clean(checkin.question, 140)}"` });
  }
  const nextWeek = weekDays(addDays(start, 7));
  for (const lane of lanes) {
    if (lane.role !== 'trainer') continue;
    const mine = lane.me
      ? (input.ownWorkouts || []).concat(input.ownWorkoutsNextWeek || [])
      : (input.otherWorkouts || []).filter((w) => byName('trainer', w.trainer_name) === lane);
    if (!mine.some((w) => nextWeek.includes(String(w.scheduled_date || '')))) {
      next.push({ whose: whoseOf(lane), role: 'trainer', kind: 'plan', label: `Next week's training (from ${nextWeek[0]}) isn't written yet` });
    }
  }
  for (const lane of lanes) {
    if (lane.role !== 'nutritionist') continue;
    if (!Object.keys(lane.days).some((d) => (lane.days[d] || []).some((it) => it.kind === 'menu'))) {
      next.push({ whose: whoseOf(lane), role: 'nutritionist', kind: 'plan', label: 'No menu on this week yet' });
    }
  }
  return { week: { start, days }, team: team.map(({ providerId: _p, ...t }) => t), lanes, next };
}

// The care-team thread's messages for the page, oldest first: whose, when, and a hand-off marked.
export function threadView(rows, me, team) {
  const nameOf = (id) => {
    const m = (Array.isArray(team) ? team : []).find((t) => t && (t.owner_id === id || t.userId === id));
    return m ? clean(m.name) : 'Coach';
  };
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r && typeof r.body === 'string')
    .map((r) => ({ id: r.id, at: r.created_at, mine: r.sender_id === me, from: r.sender_id === me ? 'You' : nameOf(r.sender_id), body: r.body, handoff: !!(r.metadata && r.metadata.kind === 'handoff') }))
    .sort((a, b) => String(a.at).localeCompare(String(b.at)));
}
