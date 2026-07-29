// The week-shaped publish contract — pure, no I/O, no clock reads.
//
// SPEC-guardrails.md §9.4. This module answers exactly two questions:
//   "is this a well-formed week?" and "what does it look like to the core, to
//   the ledger, and to client_workouts?"
//
// ⚠ IT DOES NOT JUDGE THE WEEK. Every guardrail verdict lives in the core; every
// publish decision lives in guardrail-gate.mjs. What is rejected HERE is a
// request that cannot be placed in a week at all — a shape no legitimate builder
// emits. The `malformed` reservation rule from §4.1 applies with full force in
// BOTH directions: over-rejecting turns a scoreable week into a hard error, and
// under-rejecting feeds the core a week it will silently mis-score.
//
// In particular this module does NOT reject a missing planned pair. A stamped
// week with no pair is `malformed_week` and an unstamped one is
// `incomplete_week` — two different faults with two different fixes, and the
// distinction is the entire reason the stamp exists (§3.2a). Collapsing them
// into one 400 here would destroy it.

/** A week no human schedule exceeds. Above this the caller is malformed. */
export const BS_WEEK_SESSION_MAX = 40;

/** Adjust regeneration modes. Provenance only — nothing in the core branches on it. */
export const BS_ADJUST_MODES = ['deload', 'maintain', 'progress'];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isFiniteNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * A real calendar date, not merely a well-shaped string.
 *
 * ⚠ `Date.parse('2026-02-30')` does NOT fail — V8 falls back to its legacy
 * parser and normalises the day to March 2, so a finite check looks sufficient
 * and isn't. Day overflow is the only case that slips through (month 13 and
 * hour 25 do yield NaN), which is exactly why the round-trip is the check.
 */
function isRealDate(s) {
  if (typeof s !== 'string' || !ISO_DATE.test(s)) return false;
  const y = +s.slice(0, 4);
  const m = +s.slice(5, 7);
  const d = +s.slice(8, 10);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

/** Whole days between two ISO dates. Dates only — no DST hazard. */
function dayDelta(fromISO, toISO) {
  const a = Date.UTC(+fromISO.slice(0, 4), +fromISO.slice(5, 7) - 1, +fromISO.slice(8, 10));
  const b = Date.UTC(+toISO.slice(0, 4), +toISO.slice(5, 7) - 1, +toISO.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/**
 * One session inside a submitted week.
 *
 * `plannedMinutes` / `plannedRpe` / `loadCapture` are `undefined` when ABSENT —
 * never null, never 0. The distinction is load-bearing: the core reads absence
 * against the week's stamp to tell `incomplete_week` from `malformed_week`.
 *
 * @typedef {{
 *   id: string,
 *   title: string,
 *   description: string,
 *   kind: 'template'|'custom',
 *   scheduledDate: string,
 *   plannedMinutes: number|undefined,
 *   plannedRpe: number|undefined,
 *   loadCapture: 'per_session'|'per_plan'|undefined,
 *   payload: Record<string, unknown>
 * }} WeekSession
 */

/**
 * A validated week, ready for the core, the ledger and the insert.
 *
 * @typedef {{
 *   idempotencyKey: string,
 *   weekStartISO: string,
 *   capture: 'per_session'|'per_plan'|undefined,
 *   sessions: WeekSession[],
 *   acknowledgment: {reasonCode: string|null, reasonText: string|null}|null,
 *   adjustMode: 'deload'|'maintain'|'progress'|null
 * }} PublishWeek
 */

/**
 * Normalize + validate a week-shaped publish request.
 *
 * @param {*} body the raw request body — assume nothing about it
 * @param {{todayISO: string}} opts today, as an INPUT (never a clock read)
 * @returns {{ok:true, week:PublishWeek, clientIds:string[]}
 *          |{ok:false, error:string, detail:string|null}}
 */
export function normalizeWeekRequest(body, opts = {}) {
  const todayISO = opts && opts.todayISO;
  const fail = (error, detail) => ({ ok: false, error, detail: detail || null });

  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('malformed_request', 'body');
  if (!isRealDate(todayISO)) return fail('malformed_request', 'todayISO');

  const clientIds = [...new Set(
    (Array.isArray(body.clientIds) ? body.clientIds : [body.clientId])
      .map((x) => String(x == null ? '' : x).trim())
      .filter(Boolean),
  )];
  if (!clientIds.length) return fail('malformed_request', 'clientIds');
  if (clientIds.some((id) => !UUID.test(id))) return fail('malformed_request', 'clientIds');

  // (1) The key is MINTED AT AUTHORING TIME and carried in the payload. A
  // server-side default here would defeat the whole requirement: it would be
  // derived at send time, and a retry would mint a second key — which is
  // precisely the duplicate-insert the ledger exists to stop.
  const key = String(body.idempotencyKey == null ? '' : body.idempotencyKey).trim();
  if (!key) return fail('missing_idempotency_key');
  if (!UUID.test(key)) return fail('malformed_request', 'idempotencyKey');

  const weekStartISO = String(body.weekStartISO == null ? '' : body.weekStartISO).trim();
  if (!isRealDate(weekStartISO)) return fail('malformed_request', 'weekStartISO');

  const raw = Array.isArray(body.sessions) ? body.sessions : null;
  if (!raw) return fail('malformed_request', 'sessions');
  if (raw.length === 0) return fail('empty_week');
  if (raw.length > BS_WEEK_SESSION_MAX) return fail('malformed_request', 'sessions');

  const sessions = [];
  for (let i = 0; i < raw.length; i += 1) {
    const s = raw[i];
    if (!s || typeof s !== 'object' || Array.isArray(s)) return fail('malformed_request', `sessions[${i}]`);

    const scheduledDate = String(s.scheduledDate == null ? '' : s.scheduledDate).trim();
    if (!isRealDate(scheduledDate)) return fail('malformed_request', `sessions[${i}].scheduledDate`);

    const offset = dayDelta(weekStartISO, scheduledDate);
    if (offset < 0 || offset > 6) return fail('malformed_request', `sessions[${i}].scheduledDate`);

    // ⚠ Never publish into the PAST. A past-dated session may already have been
    // logged against, and the boundary's week-replace would delete real work.
    // TODAY is fine — the boundary refuses history, not the present.
    if (dayDelta(todayISO, scheduledDate) < 0) return fail('past_session', `sessions[${i}].scheduledDate`);

    // The pair rides through with a TYPE check and nothing more. Presence and
    // range are the CORE's judgement (§3.2a's declaration table). Coercing
    // '60' to 60 here would launder a wire-shape bug into a plausible number;
    // defaulting a missing value would erase the stamp's whole purpose.
    sessions.push({
      id: String(s.id == null ? `s${i}` : s.id),
      title: String(s.title == null ? '' : s.title).trim().slice(0, 200) || 'Workout',
      description: typeof s.description === 'string' ? s.description.slice(0, 2000) : '',
      kind: s.kind === 'template' ? 'template' : 'custom',
      scheduledDate,
      plannedMinutes: isFiniteNum(s.plannedMinutes) ? s.plannedMinutes : undefined,
      plannedRpe: isFiniteNum(s.plannedRpe) ? s.plannedRpe : undefined,
      loadCapture: s.loadCapture === 'per_session' || s.loadCapture === 'per_plan' ? s.loadCapture : undefined,
      payload: s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {},
    });
  }

  const capture = body.capture === 'per_session' || body.capture === 'per_plan' ? body.capture : undefined;

  const ackRaw = body.acknowledgment;
  const acknowledgment = ackRaw && typeof ackRaw === 'object' && !Array.isArray(ackRaw)
    ? {
        reasonCode: String(ackRaw.reasonCode == null ? '' : ackRaw.reasonCode).trim().slice(0, 64) || null,
        reasonText: String(ackRaw.reasonText == null ? '' : ackRaw.reasonText).trim().slice(0, 1000) || null,
      }
    : null;

  const adjustMode = BS_ADJUST_MODES.includes(body.adjustMode) ? body.adjustMode : null;

  return {
    ok: true,
    clientIds,
    week: { idempotencyKey: key, weekStartISO, capture, sessions, acknowledgment, adjustMode },
  };
}

/**
 * A deterministic digest of what was submitted, PER CLIENT.
 *
 * Order-independent by construction: sessions are sorted by (date, id) before
 * hashing, so a builder that reorders its own list is a REPLAY, not a conflict.
 * Length-prefixed so a field boundary cannot be forged by moving characters
 * across it — dropping a session and renaming another cannot collide.
 *
 * FNV-1a rather than a crypto hash: edge-safe with no import, and a collision
 * here costs a wrongly-rejected replay rather than a wrong write, because
 * `publish_client_week` independently re-checks the coach and the client.
 * @param {string} clientId
 * @param {PublishWeek} week
 */
export function weekRequestHash(clientId, week) {
  const rows = [...week.sessions]
    .sort((a, b) => (
      a.scheduledDate === b.scheduledDate
        ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
        : (a.scheduledDate < b.scheduledDate ? -1 : 1)
    ))
    .map((s) => [
      s.scheduledDate,
      s.title,
      s.kind,
      s.plannedMinutes === undefined ? '' : String(s.plannedMinutes),
      s.plannedRpe === undefined ? '' : String(s.plannedRpe),
      s.loadCapture === undefined ? '' : s.loadCapture,
      JSON.stringify(s.payload || {}),
    ].map((p) => `${p.length}:${p}`).join(''));

  const parts = [String(clientId), week.weekStartISO, week.capture === undefined ? '' : week.capture, ...rows];
  const canonical = parts.map((p) => `${p.length}:${p}`).join('');

  let h = 0x811c9dc5;
  for (let i = 0; i < canonical.length; i += 1) {
    h ^= canonical.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a-${h.toString(16).padStart(8, '0')}-${canonical.length}`;
}

/**
 * The core's `proposedWeek` — the pair, the stamp, and nothing that isn't load.
 * @param {PublishWeek} week
 */
export function toProposedWeek(week) {
  return {
    weekStartISO: week.weekStartISO,
    capture: week.capture,
    sessions: week.sessions.map((s) => ({
      id: s.id,
      plannedMinutes: s.plannedMinutes,
      plannedRpe: s.plannedRpe,
      loadCapture: s.loadCapture,
    })),
  };
}

/**
 * `client_workouts` insert rows for the RPC.
 *
 * ⚠ THE PAIR AND THE STAMP GO INTO THE STORED PAYLOAD. That is the second copy
 * described in the capture design §4 — a row re-read later still describes
 * itself, and Adjust regeneration reads the pair back off it rather than
 * re-deriving it (§3.2b: the pair passes through UNCHANGED under all three
 * modes). The week object stays authoritative for evaluation; the row stamp is
 * asserted to agree, never read as a second source.
 *
 * A key is written only when the value EXISTS. Writing `plannedMinutes: null`
 * on an unstamped week would make an honest blank indistinguishable from a
 * value that was dropped in transit.
 * @param {PublishWeek} week
 */
export function toWorkoutRows(week) {
  return week.sessions.map((s) => {
    const payload = { ...s.payload };
    if (s.plannedMinutes !== undefined) payload.plannedMinutes = s.plannedMinutes;
    if (s.plannedRpe !== undefined) payload.plannedRpe = s.plannedRpe;
    if (s.loadCapture !== undefined) payload.loadCapture = s.loadCapture;
    if (week.adjustMode) payload.adjustMode = week.adjustMode;
    return {
      title: s.title,
      description: s.description,
      kind: s.kind,
      scheduled_date: s.scheduledDate,
      payload,
    };
  });
}
