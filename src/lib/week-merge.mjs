// Folding a single assigned session into the week it lands in.
//
// SPEC-guardrails.md §9.4 makes the week the unit: the boundary evaluates a
// whole week and REPLACES the coach's rows for it. That is exactly right for a
// builder that authors a week, and exactly wrong for the session-shaped writers
// (`/api/trainer/workout` and everything behind it — both web builders and
// Nora's assign_workout), which add ONE session at a time.
//
// Handing the boundary that one session would replace the week with it and
// DELETE every other session the coach had scheduled there. So a session-shaped
// write has to be widened into the true week before it can be published: read
// what the coach already has, fold the new session in, publish the result.
//
// That is not a workaround for the contract — it is the contract. The guardrail
// judges a week's load, and a week missing four of its five sessions is not the
// week the client will train. Merging is what makes the verdict true.
//
// Pure: no I/O, no clock reads. `todayISO` is an input.

/**
 * A session's planned pair, or undefined — never coerced.
 *
 * ⚠ TOP LEVEL FIRST, THEN THE PAYLOAD. The two callers hand this two different
 * shapes and both are legitimate: a stored `client_workouts` row keeps the pair
 * inside `payload`, while `normalizeWeekRequest` type-checks it onto the TOP
 * LEVEL of every session it emits. Reading `payload` alone stripped the pair off
 * each NEWLY AUTHORED session on its way through the merge, so `capture`
 * recomputed as undefined and the primary mobile assignment path published
 * `incomplete_week` → `unknown` — a week that is never judged. §7.5 rules that
 * `unknown` never blocks, so that is the guardrail switching ITSELF OFF, which is
 * the one direction the wave exists to prevent.
 *
 * Neither source is coerced. `Number.isFinite` gates both, so a wire-shape bug
 * still reads as ABSENT rather than as a plausible number — the §3.2a rule that
 * a missing stamp degrades safe while a laundered one does not.
 */
function pairFrom(session) {
  const s = session && typeof session === 'object' && !Array.isArray(session) ? session : {};
  const p = s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {};
  const pick = (top, inner) => (Number.isFinite(top) ? top : Number.isFinite(inner) ? inner : undefined);
  return {
    plannedMinutes: pick(s.plannedMinutes, p.plannedMinutes),
    plannedRpe: pick(s.plannedRpe, p.plannedRpe),
  };
}

/** `YYYY-MM-DD` → whole days from `a` to `b`, or null if either is unreadable. */
function dayDelta(a, b) {
  const pa = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(a || ''));
  const pb = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(b || ''));
  if (!pa || !pb) return null;
  const ms = Date.UTC(+pb[1], +pb[2] - 1, +pb[3]) - Date.UTC(+pa[1], +pa[2] - 1, +pa[3]);
  return Math.round(ms / 86400000);
}

/**
 * The full session list for one client-week, after folding in new session(s).
 *
 * @param {Array} existingRows the coach's OWN published `client_workouts` rows
 *   for this client, any dates — filtered here rather than by the caller so the
 *   window rule lives in one place.
 * @param {Array} incoming sessions to add, in publish shape
 *   (`{title, description, kind, scheduledDate, payload}`)
 * @param {{weekStartISO: string, todayISO: string}} opts
 * @returns {{sessions: Array, capture: 'per_session'|undefined, carried: number,
 *            skippedPast: number}}
 */
export function bsMergeWeekSessions(existingRows, incoming, opts) {
  const weekStartISO = opts && opts.weekStartISO;
  const todayISO = opts && opts.todayISO;

  const inWeek = (iso) => {
    const d = dayDelta(weekStartISO, iso);
    return d !== null && d >= 0 && d <= 6;
  };
  // ⚠ PAST ROWS ARE NEVER RESUBMITTED. The boundary refuses a past-dated session
  // (it may already have been logged against), and the RPC's replace only clears
  // the coach's FUTURE rows — so a past row is untouched by the publish and must
  // stay out of the payload. Carrying it forward would fail the whole week on
  // `past_session`; the day is simply not ours to rewrite any more.
  const isFuture = (iso) => {
    const d = dayDelta(todayISO, iso);
    return d !== null && d >= 0;
  };

  let skippedPast = 0;
  const kept = [];
  for (const r of (Array.isArray(existingRows) ? existingRows : [])) {
    if (!r || typeof r !== 'object') continue;
    const iso = String(r.scheduled_date == null ? '' : r.scheduled_date).slice(0, 10);
    if (!inWeek(iso)) continue;
    if (!isFuture(iso)) { skippedPast += 1; continue; }
    // A DB row carries no top-level pair (the select is id/title/description/
    // kind/scheduled_date/payload), so this resolves through the payload.
    const { plannedMinutes, plannedRpe } = pairFrom(r);
    kept.push({
      title: String(r.title == null ? '' : r.title).trim() || 'Workout',
      description: typeof r.description === 'string' ? r.description : '',
      kind: r.kind === 'template' ? 'template' : 'custom',
      scheduledDate: iso,
      plannedMinutes,
      plannedRpe,
      payload: r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {},
    });
  }
  const carried = kept.length;

  // A new session on the SAME DAY with the SAME TITLE replaces rather than
  // stacks: re-sending an assignment (a retry, a corrected payload, the same
  // workout dragged onto the same day twice) is one session, not two. Anything
  // else is a genuine addition — two different sessions on one day is real.
  const merged = [...kept];
  for (const s of (Array.isArray(incoming) ? incoming : [])) {
    if (!s || typeof s !== 'object') continue;
    const iso = String(s.scheduledDate == null ? '' : s.scheduledDate).slice(0, 10);
    if (!inWeek(iso)) continue;
    // An incoming session is normalize-shaped: the pair rides on the TOP LEVEL.
    // The caller's per-session `loadCapture` is deliberately NOT read — the week
    // stamp is derived below from what the merged week actually carries, because
    // letting a caller's claim ride over the merge is F158.
    const { plannedMinutes, plannedRpe } = pairFrom(s);
    const next = {
      title: String(s.title == null ? '' : s.title).trim() || 'Workout',
      description: typeof s.description === 'string' ? s.description : '',
      kind: s.kind === 'template' ? 'template' : 'custom',
      scheduledDate: iso,
      plannedMinutes,
      plannedRpe,
      payload: s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {},
    };
    const at = merged.findIndex((m) => m.scheduledDate === next.scheduledDate && m.title === next.title);
    if (at >= 0) merged[at] = next; else merged.push(next);
  }

  merged.sort((a, b) => (a.scheduledDate < b.scheduledDate ? -1 : a.scheduledDate > b.scheduledDate ? 1 : 0));

  // §3.2a, judged over the MERGED week — which is the point. A carried session
  // with no captured pair makes the whole week `incomplete_week`, and it should:
  // the week genuinely is not fully measured, and claiming otherwise would put a
  // hole in a week that declared itself complete (F158, the malformed case that
  // switches the guardrail off).
  const stamped = merged.length > 0
    && merged.every((s) => s.plannedMinutes !== undefined && s.plannedRpe !== undefined);

  return {
    sessions: merged.map((s) => (stamped
      ? { ...s, loadCapture: 'per_session' }
      : { title: s.title, description: s.description, kind: s.kind, scheduledDate: s.scheduledDate, payload: s.payload })),
    capture: stamped ? 'per_session' : undefined,
    carried,
    skippedPast,
  };
}

/** Monday of the ISO week containing `iso`, as `YYYY-MM-DD`. */
export function bsWeekStartOf(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  if (Number.isNaN(d.getTime())) return null;
  // Calendar-arithmetic only — no local timezone can shift a UTC-constructed
  // date here, which is why the whole function stays on Date.UTC.
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/** Group publish-shaped sessions by the week they fall in: Map(weekStart -> []). */
export function bsGroupByWeek(sessions) {
  const out = new Map();
  for (const s of (Array.isArray(sessions) ? sessions : [])) {
    if (!s || typeof s !== 'object') continue;
    const wk = bsWeekStartOf(String(s.scheduledDate == null ? '' : s.scheduledDate).slice(0, 10));
    if (!wk) continue;
    if (!out.has(wk)) out.set(wk, []);
    out.get(wk).push(s);
  }
  return out;
}
