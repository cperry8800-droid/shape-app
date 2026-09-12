// Small time helpers shared by the dashboard / clients / train API routes,
// which each previously carried an identical copy.

export const DAY_MS = 86_400_000;

/** Midnight (local) of the Monday that starts the week containing `d`, in ms. */
export function startOfWeek(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - mondayOffset);
  return x.getTime();
}

// ── IANA zones ──────────────────────────────────────────────────────────────
// Added 2026-09-11 with the coach-availability fix, which made this the third
// call site: /api/client/timezone captures a member's zone, /api/my-availability
// now captures a coach's, and the availability read has to trust what comes back.
// A third hand-rolled copy of the regex-plus-try/catch is how two of them drift.
//
// ⚠ THE SHAPE TEST IS NOT THE TEST. "Area/Nowhere" matches the pattern and is not
// a zone, so the pattern only cheaply rejects junk and bounds the length before the
// real check: asking the runtime that will do the arithmetic whether it accepts the
// name. Postgres does the same on its side by joining pg_timezone_names
// (shape_user_tz, 2026-07-06) — validate against the real database, never a regex.

/** "Area/Location", optionally multi-segment, plus the bare UTC alias. */
const IANA_SHAPE = /^(UTC|[A-Za-z]+\/[A-Za-z0-9_+\-]+(?:\/[A-Za-z0-9_+\-]+)?)$/;

/** The value as a usable IANA zone name, or null. Never throws. */
export function normalizeZone(raw: unknown): string | null {
  const tz = String(raw ?? '').trim().slice(0, 64);
  if (!IANA_SHAPE.test(tz)) return null;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
  } catch {
    return null; // RangeError — well-formed but not a zone this runtime knows
  }
  return tz;
}

/** Whether the value is a zone this runtime can do arithmetic in. */
export function isZone(raw: unknown): boolean {
  return normalizeZone(raw) !== null;
}

// ── Wall clock ↔ instant, in a named zone ───────────────────────────────────
// The server half of the booking-timezone fix (2026-09-11).
// provider_availability.start_minute is a bare wall-clock minute in the COACH's local
// day, so placing it on a real clock needs the coach's zone — and the consultation
// route both resolves such a wall time and prints one back in a confirmation mail.
//
// ⚠ public/newdesign/bookingSlots.js CARRIES THE SAME ALGORITHM AND CANNOT IMPORT THIS.
// It is a plain browser <script> (no bundler on that surface), so the duplication is
// forced rather than chosen — and it is therefore PROVEN not to drift:
// tests/booking-timezone-parity.test.mjs drives both implementations over a matrix of
// zones and dates and requires identical answers. Change one, change both, or that
// guard fails.

/** The civil fields `zone` shows at instant `t`, or null. */
function partsAt(t: number, zone: string): { y: number; mo: number; d: number; h: number; mi: number; s: number } | null {
  if (!Number.isFinite(t)) return null;
  // ⚠ AN ABSENT ZONE MUST BE REFUSED HERE, BECAUSE `Intl` DOES NOT REFUSE IT.
  // `timeZone: undefined` is not an error to Intl — it means "use the system zone", which
  // on Vercel is UTC. So a caller that passes nothing would silently get exactly the
  // read-it-as-UTC defect this helper exists to remove, with no throw to notice. An empty
  // string is refused for the same reason rather than because it is malformed. Caught by
  // tests/booking-timezone-parity.test.mjs, which asserts all three copies refuse it.
  if (typeof zone !== 'string' || zone.length === 0) return null;
  let parts: Intl.DateTimeFormatPart[];
  try {
    parts = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(t));
  } catch {
    return null;
  }
  const p: Record<string, string> = {};
  for (const part of parts) p[part.type] = part.value;
  const y = Number(p.year), mo = Number(p.month), d = Number(p.day);
  let h = Number(p.hour);
  const mi = Number(p.minute), s = Number(p.second);
  if (h === 24) h = 0; // belt-and-braces: some ICU builds spell midnight "24"
  if (![y, mo, d, h, mi, s].every((n) => Number.isFinite(n))) return null;
  return { y, mo, d, h, mi, s };
}

/** `zone`'s offset from UTC at instant `t`, in ms (east of UTC is positive). */
export function zoneOffsetMs(t: number, zone: string): number {
  const p = partsAt(t, zone);
  if (!p) return NaN;
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t;
}

/**
 * The instant whose wall clock in `zone` is the given civil fields, or NaN when that
 * wall time does not exist there (the spring-forward gap) or the zone is unusable.
 *
 * ⚠ TWO PASSES, AND THE SECOND IS WHAT MAKES DST CORRECT: an offset can only be asked
 * for AT an instant, so the first pass prices the wall time as if it were UTC and the
 * second re-asks at the corrected instant. They differ only near a transition, which is
 * exactly where one pass lands an hour out.
 *
 * ⚠ THE ANSWER IS ROUND-TRIPPED. On a spring-forward day 02:30 never happens, and the
 * arithmetic alone would silently return 03:30 — an hour nobody declared. Formatting the
 * result back and requiring the wall clock we asked for is what refuses it.
 */
export function instantInZone(
  y: number, mo: number, d: number, h: number, mi: number, zone: string
): number {
  const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
  const o1 = zoneOffsetMs(naive, zone);
  if (!Number.isFinite(o1)) return NaN;
  let t = naive - o1;
  const o2 = zoneOffsetMs(t, zone);
  if (Number.isFinite(o2) && o2 !== o1) t = naive - o2;
  const back = partsAt(t, zone);
  if (!back) return NaN;
  if (back.y !== y || back.mo !== mo || back.d !== d || back.h !== h || back.mi !== mi) return NaN;
  return t;
}
