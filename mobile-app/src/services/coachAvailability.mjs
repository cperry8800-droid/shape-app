// Coach availability projection — pure. Turns a coach's weekly
// provider_availability pattern minus already-booked sessions into DATED open
// slots for the next N weeks. Consumed by the marketplace Listing (the OPEN
// THIS WEEK station + the full calendar). Server shape = GET /api/availability:
//   slots:  [{ weekday (0=Sun..6), start_minute, duration_min }]
//   booked: ISO strings (the live route serializes b.scheduled_at) — object
//   rows carrying { scheduled_at } are tolerated too; already requested/confirmed
//   zone:   the coach's IANA zone, or null
//
// ⚠ THIS MODULE USED TO READ THE STORED MINUTE AS THE *MEMBER'S* LOCAL TIME, AND THAT
// WAS THE APP'S HALF OF A DEFECT THE WEBSITE HAD IN THE OPPOSITE DIRECTION.
// provider_availability.start_minute is a bare wall-clock minute in the COACH's local
// day (the table's own migration says so, and both editors write exactly that: the coach
// toggles the cell marked "9a" and 540 is stored). Nothing recorded WHICH local day, so
// every reader invented one — this module used `setHours` on a member-local date, while
// consultation.html and bookingSlots.js read 540 as 09:00 UTC. One coach row therefore
// rendered DIFFERENT times in the app and on the website, and neither was the coach's.
//
// The instant is now resolved in the coach's zone. What a member SEES stays theirs:
// `iso`, `weekday` and `time` are the member's own calendar and clock, which is what the
// calendar grid groups on, and `at` carries the underlying instant.
//
// ⚠ AND A COACH WITH NO STORED ZONE PROJECTS NOTHING. Falling back to UTC is the
// website's old bug and falling back to the member's zone is this module's — an hour we
// cannot place is not an hour a member may book. The caller renders an honest state.
//
// ⚠ THE ZONED-INSTANT ALGORITHM EXISTS IN THREE PLACES AND THE DUPLICATION IS FORCED,
// NOT CHOSEN: this bundle, the website's public/newdesign/bookingSlots.js (a plain
// <script>, no bundler on that surface) and src/lib/time.ts (server). They are PROVEN
// not to drift by tests/booking-timezone-parity.test.mjs, which drives all three over
// one matrix of zones and dates and requires identical answers. Change one, change all
// three, or that guard fails.

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

const _fmt = new Map();
function fmtFor(zone) {
  // ⚠ AN ABSENT ZONE IS REFUSED HERE, BECAUSE `Intl` DOES NOT REFUSE IT. `timeZone:
  // undefined` is not an error — it means "use the system zone", which is the MEMBER's
  // zone in this bundle and therefore exactly the defect this module was rewritten to
  // remove. Guarded at the FORMATTER rather than at each caller, so every path is safe
  // instead of only the paths that remembered to ask.
  if (typeof zone !== 'string' || zone.length === 0) return null;
  if (_fmt.has(zone)) return _fmt.get(zone);
  let f = null;
  try {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: zone, hourCycle: 'h23',
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  } catch (e) { f = null; }   // RangeError — not a zone this runtime knows
  _fmt.set(zone, f);
  return f;
}

/** Whether `zone` is a zone this runtime can do arithmetic in. */
export function bsIsZone(zone) {
  return typeof zone === 'string' && zone.length > 0 && fmtFor(zone) != null;
}

function partsAt(t, zone) {
  const f = fmtFor(zone);
  if (!f || !Number.isFinite(t)) return null;
  const p = {};
  for (const part of f.formatToParts(new Date(t))) p[part.type] = part.value;
  const y = Number(p.year), mo = Number(p.month), d = Number(p.day);
  let h = Number(p.hour);
  const mi = Number(p.minute), s = Number(p.second);
  if (h === 24) h = 0;   // some ICU builds spell midnight "24"
  if (![y, mo, d, h, mi, s].every((n) => Number.isFinite(n))) return null;
  return { y, mo, d, h, mi, s };
}

function zoneOffsetMs(t, zone) {
  const p = partsAt(t, zone);
  if (!p) return NaN;
  return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t;
}

// ⚠ TWO PASSES, AND THE SECOND IS WHAT MAKES DST CORRECT: an offset can only be asked
// for AT an instant, so the first pass prices the wall time as if it were UTC and the
// second re-asks at the corrected instant. They differ only near a transition, which is
// exactly where one pass lands an hour out.
//
// ⚠ AND THE ANSWER IS ROUND-TRIPPED. On a spring-forward day 02:30 never happens and the
// arithmetic alone would silently return 03:30 — an hour the coach never declared.
// Requiring the wall clock we asked for is what refuses it. (The old `setHours` version
// took the opposite view in a comment: it deliberately let the gap normalize forward so
// its wall-clock booked key would match. Keying on the instant removes that need.)
export function bsInstantInZone(y, mo, d, h, mi, zone) {
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

export function bsProjectAvailability({ slots = [], booked = [], weeks = 6, now = new Date(), zone = null } = {}) {
  // ⚠ BELT-AND-BRACES, PROVEN: `fmtFor` refuses the same values, so removing THIS line
  // alone changes no answer (a mutation round confirmed it survives); removing both kills
  // the suite. Kept as a fast path — it avoids building the whole day map — and because it
  // states the contract where a caller reads it.
  if (!bsIsZone(zone)) return [];            // fail closed: see the header
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return [];

  // ⚠ MATCHED ON THE INSTANT, NOT ON A WALL-CLOCK STRING. Postgres hands back
  // `…T13:00:00+00:00` where a client builds `…T13:00:00.000Z` — one moment, two
  // spellings — and the old local-HH:MM key could only ever agree with a slot built the
  // same wrong way. Epoch ms cannot be spelled two ways.
  const takenMs = new Set();
  for (const b of booked || []) {
    const raw = typeof b === 'string' ? b : b && b.scheduled_at;
    const t = new Date(raw).getTime();
    if (Number.isFinite(t)) takenMs.add(t);
  }

  const byDay = new Map();
  for (const s of slots || []) {
    const wd = Number(s && s.weekday);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) continue;
    const startMin = Number(s && s.start_minute);
    if (!Number.isInteger(startMin) || startMin < 0 || startMin >= 24 * 60) continue;
    const list = byDay.get(wd) || [];
    list.push({ startMin, durationMin: Number(s.duration_min) || 60 });
    byDay.set(wd, list);
  }
  if (!byDay.size) return [];

  // ⚠ THE WINDOW WALKS THE COACH'S OWN CALENDAR. A weekly pattern says "Monday 9am" in
  // the coach's zone, so the weekday has to be read there too — walking the member's
  // dates files a Sydney coach's Monday morning under Sunday. The civil dates are stepped
  // with Date.UTC arithmetic on purpose: a civil date has no offset, so stepping it in
  // UTC cannot be bitten by the DST it is being used to resolve.
  const today = partsAt(nowMs, zone);
  if (!today) return [];
  const base = Date.UTC(today.y, today.mo - 1, today.d);
  const DAY = 86400000;

  const out = [];
  const seen = new Set();
  for (let i = 0; i < weeks * 7; i++) {
    const civil = new Date(base + i * DAY);
    if (!Number.isFinite(civil.getTime())) continue;
    const cy = civil.getUTCFullYear(), cmo = civil.getUTCMonth() + 1, cd = civil.getUTCDate();
    const wd = civil.getUTCDay();       // the CIVIL weekday, offset-free by construction
    for (const s of byDay.get(wd) || []) {
      const h = Math.floor(s.startMin / 60), mi = s.startMin % 60;
      const at = bsInstantInZone(cy, cmo, cd, h, mi, zone);
      if (!Number.isFinite(at)) continue;   // a wall time the coach's zone skips over
      if (at <= nowMs) continue;            // past never emits
      if (takenMs.has(at)) continue;        // taken
      if (seen.has(at)) continue;           // overlapping blocks must not offer it twice
      seen.add(at);
      // Display fields are the MEMBER's own calendar and clock — the calendar grid keys
      // on `iso` and the member acts on `time`.
      const local = new Date(at);
      out.push({
        iso: isoDay(local),
        weekday: local.getDay(),
        time: `${pad2(local.getHours())}:${pad2(local.getMinutes())}`,
        durationMin: s.durationMin,
        at,
      });
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

// Group projected slots by day for the calendar grid: Map iso → slots[].
export function bsSlotsByDay(open) {
  const m = new Map();
  for (const s of open || []) {
    if (!m.has(s.iso)) m.set(s.iso, []);
    m.get(s.iso).push(s);
  }
  return m;
}
