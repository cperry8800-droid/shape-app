// The legs of a coach's per-client overview that the roster columns, the
// drilldown drawer and the signals engine read, but that nothing filled
// (review 2026-09-09, R4). Pure: rows in, leg out, no I/O — so
// `tests/coach-client-legs.test.mjs` can drive every rule and the route stays
// a set of queries.
//
// Each leg returns NULL when its source is absent, never a zero or a
// stand-in: `dashSignals` skips a rule whose input is missing, and every
// column renders its own "not shared". A fabricated leg would fire a flag on
// a client nobody has data for.
//
// ⚠ EVERY LEG IS SCOPED BY THE CALLER'S OWN PROVIDER ID, NOT BY ROLE.
// `shared_coach_reads_assignments` (2026-05-26-shared-clients-plans.sql) lets
// ANY coach linked to the client read EVERY assigned/active/paused row — a
// predecessor's and the counterpart's included — and `conversations` is
// participant-scoped the same way. Filtering on `provider_role === 'trainer'`
// alone therefore attributes another trainer's block to the caller. `mine` is
// the caller's provider id PER ROLE FOR THIS CLIENT (null where they hold no
// such link), which also settles the dual-role case: a coach who happens to
// own a trainer row is not this client's trainer unless that row is linked.

const DAY_MS = 86400000;

function num(v) {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
function ms(v) {
  if (v == null || v === '') return null;
  const t = typeof v === 'number' ? v : new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}
// A snapshot_date is the member's LOCAL calendar day ('YYYY-MM-DD'); compare
// lexicographically and never through a Date, which would shift it by the
// server's offset.
function dayOf(row) {
  const d = row && row.snapshot_date;
  return typeof d === 'string' && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : null;
}
function isoDayUTC(atMs) { return new Date(atMs).toISOString().slice(0, 10); }
// Normalize `mine` once: { trainer, nutritionist } of provider ids, either of
// which may be null. Ids compare as strings — a numeric provider id arriving
// as a string from PostgREST must still match.
function myId(mine, role) {
  const v = mine && typeof mine === 'object' ? mine[role] : null;
  return v == null || v === '' ? null : String(v);
}

// ── The program the CALLER assigned ─────────────────────────────────────────
// `week` counts from the assignment's created_at — the only start date the
// table carries — so it is "week N since you assigned it", and it is CAPPED at
// the template's length: a program left assigned for a year must not report
// "Wk 53/12". A template with no durationWeeks yields a week with no total.
//
// ⚠ A PAUSED PROGRAM REPORTS NO WEEK. The count is wall-clock from created_at
// and knows nothing about the pause, so a 12-week block paused at week 4 in
// February would read "Wk 12/12" in September — the roster would tell the
// coach a client just finished a program they stopped seven months ago. The
// status rides along so the label can say `paused` instead of a number.
export function bsProgramLeg(assignments, templatesById, mine, now = Date.now()) {
  if (!Array.isArray(assignments)) return null;
  const t = myId(mine, 'trainer'), n = myId(mine, 'nutritionist');
  if (t == null && n == null) return null;
  const isMine = (a) =>
    (a.provider_role === 'trainer' && t != null && String(a.provider_id) === t) ||
    (a.provider_role === 'nutritionist' && n != null && String(a.provider_id) === n);
  const mineRows = assignments.filter((a) => a && isMine(a));
  if (!mineRows.length) return null;
  // ⚠ STATUS RANKS ABOVE RECENCY. `updated_at` moves on ANY edit, so pausing an
  // old block on Tuesday restamps it above the live block assigned on Monday —
  // and the PROGRAM column would name the paused one while the program the
  // client is actually running is invisible. A live assignment is the current
  // program by definition; recency only breaks ties within a status class.
  const rank = (st) => (st === 'active' ? 0 : st === 'assigned' ? 1 : 2);
  const a = mineRows.slice().sort((x, y) =>
    rank(x.status) - rank(y.status) || (ms(y.updated_at) || 0) - (ms(x.updated_at) || 0)
  )[0];
  const tpl = (templatesById && templatesById.get ? templatesById.get(a.program_template_id) : null) || null;
  const name = tpl && typeof tpl.title === 'string' && tpl.title.trim() ? tpl.title.trim() : null;
  if (!name) return null;   // an untitled program is not a program name
  const weeks = num(tpl.durationWeeks);
  const start = ms(a.created_at);
  const status = a.status || null;
  let week = null;
  if (status !== 'paused' && start != null && start <= now) {
    week = Math.floor((now - start) / (7 * DAY_MS)) + 1;
    if (weeks != null && weeks > 0) week = Math.min(week, weeks);
  }
  const estimatedEnd = start != null && weeks != null && weeks > 0 && status !== 'paused' ? start + weeks * 7 * DAY_MS : null;
  const next = mineRows.find((row) => row !== a && row.status === 'assigned' && ms(row.created_at) >= (start || 0));
  const nextTemplate = next && templatesById && templatesById.get ? templatesById.get(next.program_template_id) : null;
  return { name, week, weeks: weeks != null && weeks > 0 ? weeks : null, status,
    estimatedEndAt: estimatedEnd != null ? new Date(estimatedEnd).toISOString() : null,
    overdue: estimatedEnd != null && now > estimatedEnd,
    nextAssigned: nextTemplate && nextTemplate.title ? nextTemplate.title : null };

}

// ── Food logging: the last logged day, and the recent days themselves ───────
// ⚠ A DAY COUNTS AS LOGGED WHEN IT CARRIES CALORIES EATEN — the SAME definition
// `get_client_stats` uses (`dietary_kcal is not null`, 2026-10-11-dietary-kcal.sql;
// the snapshot's `calories` is a device's burn, which logs no meal).
// This leg supplies the LAST LOGGED DATE for a column that sits beside the
// COMPLIANCE column the rollup computes, so the two must not count differently:
// a protein-only day under a wider definition renders "Today" next to "0%" on
// one row. Two numbers that disagree is worse than one that is a day coarse —
// the same reasoning the score definer's UTC note records. Protein still rides
// in `recent` for display; it just does not decide whether a day was logged.
export function bsLogsLeg(snapRows, now = Date.now(), recentLimit = 3) {
  if (!Array.isArray(snapRows) || !snapRows.length) return null;
  const logged = [];
  for (const r of snapRows) {
    const day = dayOf(r);
    if (!day) continue;
    const kcal = num(r.dietary_kcal);
    if (kcal == null) continue;
    logged.push({ on: day, kcal, protein: num(r.protein_g) });
  }
  if (!logged.length) return null;
  logged.sort((a, b) => (a.on < b.on ? 1 : a.on > b.on ? -1 : 0));   // newest first
  // Seven CALENDAR days ending today, not the seven most recent logged rows —
  // a sparse logger would otherwise show a count drawn from weeks ago.
  const since = isoDayUTC(now - 6 * DAY_MS);
  const today = isoDayUTC(now);
  const daysLogged7d = new Set(logged.filter((l) => l.on >= since && l.on <= today).map((l) => l.on)).size;
  return { lastLoggedOn: logged[0].on, daysLogged7d, recent: logged.slice(0, recentLimit) };
}

// ── The client's nutrition targets (client_programs.detail.nutrition) ───────
// The same override the member's Eat hero reads. A HALF-SET pair is kept, not
// discarded: a calories-only target legitimately drives ruleLedgerBlown, and a
// protein-only one drives ruleProteinUnder — each rule needs only its own half,
// and dropping the pair would silence a rule the coach did set up. What is
// discarded is a target that carries no usable number at all (absent, zero,
// negative, or non-numeric) — a "0 g protein target" would fire `protein_under`
// at every client whose coach never set one.
//
// ⚠ THIS IS THE ONE LEG THE BANNER'S PROVIDER SCOPING CANNOT REACH, AND SAYING
// SO IS THE HONEST ANSWER. `detail.nutrition` is ONE whole-doc override per
// client, written by whichever coach last used Adjust and carrying no author
// id — so there is nothing to scope by. A predecessor's months-old prescription
// therefore drives the current coach's ledger and protein flags. That is a data
// -model gap, not something this function can close; what it must not do is
// call the result "the coach's own", which is how a stale target gets trusted.
export function bsNutritionTargets(programDetail) {
  const n = programDetail && typeof programDetail === 'object' ? programDetail.nutrition : null;
  if (!n || typeof n !== 'object') return null;
  const asTarget = (v) => { const x = num(v); return x != null && x > 0 ? x : null; };
  const calories = asTarget(n.calories);
  const protein = asTarget(n.protein);
  // Normalize FIRST, then decide emptiness — checking before normalizing let
  // `{ calories: 0 }` past the guard and returned { calories: null, protein:
  // null }, an object that means "no targets" where the contract says null.
  if (calories == null && protein == null) return null;
  return { calories, protein };
}

// ── Last contact, per role ──────────────────────────────────────────────────
// A coach can only read their OWN thread with the client, so the leg the
// caller cannot see stays null rather than reading as "never" — "not shared"
// and "you have never messaged them" are different sentences.
//
// ⚠ AND THOSE TWO SENTENCES ARE KEPT APART AT THE LEG, NOT JUST IN THE PROSE.
// The leg is returned whenever the caller holds a link for this client, even
// when every timestamp is null: a coach who has never messaged the client is a
// KNOWN never, and collapsing it into the absent-leg case renders "Not shared"
// against the coach's own thread. Only a caller with no link at all reads null.
//
// ⚠ AND THE MEMBER DM IS CONTACT TOO (Fable on fix 4). Before the coach thread (2026-10-15), a
// coach wrote to a client from a member DM (get_or_create_member_conversation: kind 'direct',
// keyed by the pair, no client or provider id), which the thread read cannot see, so every
// relationship that lived there read "never messaged". `dm` is that conversation ({ last_message_at })
// or null; it is the caller's own account talking to the client, so it counts for each role the
// caller coaches them in.
/** @param {{ last_message_at?: string | null } | null} [dm] */
export function bsLastContactLeg(conversations, mine, dm = null) {
  const t = myId(mine, 'trainer'), n = myId(mine, 'nutritionist');
  if (t == null && n == null) return null;
  const rows = Array.isArray(conversations) ? conversations : [];
  const dmAt = dm ? ms(dm.last_message_at) : null;
  const pick = (role, id) => {
    if (id == null) return null;
    let best = dmAt;
    for (const c of rows) {
      if (!c || c.provider_role !== role || String(c.provider_id) !== String(id)) continue;
      const at = ms(c.last_message_at);
      if (at != null && (best == null || at > best)) best = at;
    }
    return best == null ? null : new Date(best).toISOString();
  };
  return { trainer: pick('trainer', t), nutritionist: pick('nutritionist', n) };
}

// ── The onboarding board, per role (client-onboarding review, fix 4) ─────────
// One coach's first 30 days with a new client, built ONLY from records: the subscription, Shape's
// welcome in the thread, the coach's own first message, the first plan the coach published, the
// client's check-ins since joining, and a measurement around day 30. Nothing here is a box a coach
// ticks (the setup card's "Confirm intake" was one); a step is done when its record exists.
//
// ⚠ A FAILED READ IS NEVER A "NOT YET". Each input is `undefined` when its read failed, and the step
// it decides then reads done: null ("couldn't read"), which the board shows as such, never "to do".
//
// The week-one target is the coach's, per member (owner, 2026-10-14, decision 3: "no fixed 48-hour or
// 3-day rule"): client_programs.detail[discipline].weekOne = { count, startsOn, setAt, providerId },
// written through set_program_detail. ⚠ IT IS THE COACH'S WHO SET IT (Codex on #2378): the section
// outlives a change of coach, so a target is read only when `providerId` is the listing this board
// is for; a predecessor's count and start day are never the new coach's deadline. Until it is set, `suggested` is the client's own answer (sessions per week) for
// a trainer; a nutritionist's unit is days logged, and nothing they told Shape says how many.
export const ONBOARDING_DAYS = 30;
// How many check-ins the overview reads (get_client_checkins' p_limit); the website's week view
// keeps the same number as DWK_CHECKIN_LIMIT.
export const CHECKIN_READ_LIMIT = 4;
const WEEK_ONE_MAX = 14;

export function weekOneOf(programDetail, discipline, providerId) {
  const sec = programDetail && typeof programDetail === 'object' ? programDetail[discipline] : null;
  const w = sec && typeof sec === 'object' ? sec.weekOne : null;
  if (!w || typeof w !== 'object') return null;
  if (providerId == null || w.providerId == null || String(w.providerId) !== String(providerId)) return null;
  const count = num(w.count);
  if (count == null || !Number.isInteger(count) || count < 1 || count > WEEK_ONE_MAX) return null;
  const startsOn = typeof w.startsOn === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(w.startsOn) ? w.startsOn : null;
  return { count, startsOn, setAt: ms(w.setAt) != null ? new Date(ms(w.setAt)).toISOString() : null };
}
function suggestedCount(intake, role) {
  if (role !== 'trainer') return null;
  const v = intake && intake.training ? intake.training.sessions_per_week : null;
  const m = /\d+/.exec(String(v == null ? '' : v));
  const n = m ? Number(m[0]) : null;
  return n != null && n >= 1 && n <= WEEK_ONE_MAX ? n : null;
}
function addDaysISO(atMs, days) { return isoDayUTC(atMs + days * DAY_MS); }
// The Sunday that closes the week holding `day` ('YYYY-MM-DD'): check-ins are weekly, Monday-keyed.
// `after` days are added first, so a client who joins on a Saturday is not due the next morning.
function weekEndSunday(day, after = 0) {
  const t = Date.parse(day + 'T00:00:00Z') + after * DAY_MS;
  const dow = new Date(t).getUTCDay(); // 0 = Sunday
  return isoDayUTC(t + ((7 - dow) % 7) * DAY_MS);
}

/**
 * @param {object} input
 *   role: 'trainer' | 'nutritionist'; providerId: the caller's listing id (whose week-one target
 *   counts); joinedAt: ISO (the caller's subscription start);
 *   welcomeAt / helloAt: ISO | null | undefined (undefined = the read failed);
 *   firstPlan: { at, title } | null | undefined; checkins: rows | null | undefined (latest first,
 *   at most CHECKIN_READ_LIMIT); measurements: rows | null | undefined; programDetail; intake; now: ms.
 * @returns the board, or null when there is no subscription start or it is past day 30.
 */
export function bsOnboardingLeg(input) {
  const { role, providerId, joinedAt, welcomeAt, helloAt, firstPlan, checkins, measurements, programDetail, intake } = input || {};
  const now = input && input.now != null ? input.now : Date.now();
  if (role !== 'trainer' && role !== 'nutritionist') return null;
  const joined = ms(joinedAt);
  if (joined == null || joined > now) return null;
  const day = Math.floor((now - joined) / DAY_MS) + 1;
  if (day > ONBOARDING_DAYS) return null;
  const joinedDay = isoDayUTC(joined);
  const discipline = role === 'trainer' ? 'training' : 'nutrition';
  const weekOne = weekOneOf(programDetail, discipline, providerId);
  const iso = (v) => (ms(v) == null ? null : new Date(ms(v)).toISOString());

  // Check-ins since joining. ⚠ A CHECK-IN FILED BEFORE THE SUBSCRIPTION IS NOT ONE (Fable on fix 4):
  // a member who checked in on Monday and subscribed on Friday had "First check-in ✓" for a week
  // the coach was not part of. A row filed before joining is left out; a row with no filing time
  // falls back to its week ending on or after the join day.
  // ⚠ AND THE READ RETURNS ONLY THE LATEST CHECKIN_READ_LIMIT, so the oldest of them is the first
  // since joining only when the read reached back past it: fewer rows than the limit, or one filed
  // before joining. Otherwise the step is done and its week unnamed, rather than a later week
  // named as the first.
  let checkinsSince;
  if (checkins === undefined || checkins === null) checkinsSince = undefined;
  else {
    const all = Array.isArray(checkins) ? checkins : [];
    let reachedJoin = all.length < CHECKIN_READ_LIMIT;
    const weeks = [];
    for (const c of all) {
      const w = c && typeof (c.week_of || c.weekOf) === 'string' ? String(c.week_of || c.weekOf).slice(0, 10) : null;
      if (!w) continue;
      const filed = ms(c.created_at || c.createdAt);
      const since = filed != null ? filed >= joined : weekEndSunday(w) >= joinedDay;
      if (since) weeks.push(w); else reachedJoin = true;
    }
    weeks.sort();
    checkinsSince = { count: weeks.length, firstWeekOf: weeks.length && reachedJoin ? weeks[0] : null };
  }
  // A measurement from day 28 on is the day-30 progress read.
  const measuredAt = measurements === undefined || measurements === null ? undefined : (() => {
    let best = null;
    for (const m of Array.isArray(measurements) ? measurements : []) {
      const d = m && typeof m.measured_on === 'string' ? m.measured_on.slice(0, 10) : null;
      if (d && d >= addDaysISO(joined, 27) && (!best || d > best)) best = d;
    }
    return best;
  })();

  const known = (v) => (v === undefined ? null : !!v);
  const week1Start = weekOne && weekOne.startsOn ? weekOne.startsOn : joinedDay;
  const steps = [
    { key: 'joined', done: true, at: iso(joinedAt) },
    { key: 'welcome', done: known(welcomeAt), at: iso(welcomeAt) },
    { key: 'hello', done: known(helloAt), at: iso(helloAt) },
    { key: 'plan', done: known(firstPlan), at: firstPlan ? iso(firstPlan.at) : null, title: firstPlan && typeof firstPlan.title === 'string' ? firstPlan.title : null, due: weekOne && weekOne.startsOn ? weekOne.startsOn : null },
    { key: 'checkin', done: checkinsSince === undefined ? null : checkinsSince.count >= 1, at: checkinsSince && checkinsSince.firstWeekOf, due: weekEndSunday(week1Start, 3) },
    // A week after the first (Codex on #2378): fixed at joined + 14 days, a week one the coach set
    // to start later put the second check-in due before the first.
    { key: 'checkin2', done: checkinsSince === undefined ? null : checkinsSince.count >= 2, due: weekEndSunday(week1Start, 10) },
    // Due on day 30, the board's last (Codex on #2378): joined + 30 days was the day after it closed.
    { key: 'progress', done: measuredAt === undefined ? null : !!measuredAt, at: measuredAt || null, due: addDaysISO(joined, ONBOARDING_DAYS - 1) },
  ];
  return {
    role,
    joinedAt: iso(joinedAt),
    day,
    days: ONBOARDING_DAYS,
    steps,
    weekOne,
    suggested: weekOne ? null : suggestedCount(intake, role),
    unit: role === 'trainer' ? 'workouts' : 'days_logged',
  };
}
