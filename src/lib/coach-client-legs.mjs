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
  return { name, week, weeks: weeks != null && weeks > 0 ? weeks : null, status };
}

// ── Food logging: the last logged day, and the recent days themselves ───────
// ⚠ A DAY COUNTS AS LOGGED WHEN IT CARRIES CALORIES — the SAME definition
// `get_client_stats` uses (`calories is not null`, 2026-06-13-client-stats.sql).
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
    const kcal = num(r.calories);
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
export function bsLastContactLeg(conversations, mine) {
  const t = myId(mine, 'trainer'), n = myId(mine, 'nutritionist');
  if (t == null && n == null) return null;
  const rows = Array.isArray(conversations) ? conversations : [];
  const pick = (role, id) => {
    if (id == null) return null;
    let best = null;
    for (const c of rows) {
      if (!c || c.provider_role !== role || String(c.provider_id) !== String(id)) continue;
      const at = ms(c.last_message_at);
      if (at != null && (best == null || at > best)) best = at;
    }
    return best == null ? null : new Date(best).toISOString();
  };
  return { trainer: pick('trainer', t), nutritionist: pick('nutritionist', n) };
}
