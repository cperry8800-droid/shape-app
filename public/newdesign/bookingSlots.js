// Booking slots — turning a coach's weekly availability into concrete, bookable
// instants (review 2026-09-09, R20's other half; zone-correct since 2026-09-11).
//
// PURE module: no React, no DOM, no fetch. Loads as a plain <script> in the
// browser (exposes window.BookingSlots) and via require() in Node, so every
// rule below is driven by tests/booking-slots.test.mjs rather than eyeballed.
//
// Input is exactly what GET /api/availability answers:
//   slots  [{ weekday, start_minute, duration_min }]   weekday is getDay()-style, 0=Sun
//   booked [iso, …]                                    requested + confirmed, any source
//   zone   "America/New_York" | null                   the coach's IANA zone
//
// ⚠ THE STORED MINUTE IS THE COACH'S WALL CLOCK, AND UNTIL 2026-09-11 NOTHING COULD
// READ IT. provider_availability's own migration documents start_minute as "minutes
// since midnight in the coach's local day", and both editors write exactly that — the
// coach toggles the cell marked "9a" and 540 is stored. Nothing recorded WHICH local
// day, so every reader invented an answer and the three live readers invented three
// different ones: this module and consultation.html read 540 as 09:00 UTC, while the
// mobile app's coachAvailability.mjs read it as 09:00 in the MEMBER's zone. A coach in
// New York who opened 9am therefore had clients booking 5:00 AM on the website and
// 9:00 AM in the app, off one row, while both parties were shown a string that was
// nobody's actual time.
//
// `zone` is what closes it (trainers.timezone / nutritionists.timezone, stamped by the
// availability editors). The instant is now resolved as "this wall clock, in the
// coach's zone" — so a slot means what the coach declared, and `slotLabel` still
// renders it in the VIEWER's zone, which is the only clock a member can act on.
//
// ⚠ AND A COACH WITH NO STORED ZONE OFFERS NOTHING, DELIBERATELY. Falling back to UTC
// is precisely the defect above; falling back to the viewer's zone is the other one. An
// hour we cannot place is not an hour a member can be allowed to book, so the
// projection fails CLOSED and the caller renders an honest state (`isZone` is exported
// so it can tell that apart from a coach who has set no hours). Measured 2026-09-11:
// production holds zero availability rows, so nothing real lands on this branch — and
// every row written from here on carries a zone, because the route refuses a save that
// cannot resolve one.
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.BookingSlots = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const DAY_MS = 86400000;
  const HOUR = 60;

  // ⚠ `Number(null)` IS 0 AND SO IS `Number("")`, AND BOTH ARE FINITE — so
  // `Number.isFinite` alone cannot tell an absent field from a measured zero. Here that
  // is not academic: a row with no `start_minute` became a bookable MIDNIGHT slot, and a
  // row with no `weekday` became SUNDAY, because 0 is a perfectly good minute and a
  // perfectly good weekday. Both were live in the first cut of this module and both were
  // caught by the tests below rather than by reading it. The same class this repo
  // post-mortems on the Wall's helpers and on the demo payout history's `joinedAt: 0`.
  function num(v) {
    if (v == null || v === "" || typeof v === "boolean") return NaN;
    const n = Number(v);
    return isFinite(n) ? n : NaN;
  }

  // ── Zone resolution ────────────────────────────────────────────────────────
  // One formatter per zone, memoized: the projection asks for ~200 slots × 2 offset
  // probes each, and constructing an Intl.DateTimeFormat is the expensive part. A cache
  // keyed on the zone name is still pure — same zone, same answer.
  const FMT = new Map();
  function fmtFor(zone) {
  // ⚠ AN ABSENT ZONE IS REFUSED HERE, BECAUSE `Intl` DOES NOT REFUSE IT. `timeZone:
  // undefined` is not an error — it means "use the system zone", so a caller that passes
  // nothing would silently get the viewer's own zone, which is one of the two defects
  // this module was rewritten to remove. Guarded at the FORMATTER rather than at each
  // caller, so every path is safe instead of only the paths that remembered to ask.
  if (typeof zone !== "string" || zone.length === 0) return null;
    if (FMT.has(zone)) return FMT.get(zone);
    let f = null;
    try {
      // `hourCycle: h23` keeps midnight at 00 rather than the 24 some ICU builds emit.
      f = new Intl.DateTimeFormat("en-US", {
        timeZone: zone, hourCycle: "h23",
        year: "numeric", month: "2-digit", day: "2-digit",
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      });
    } catch (e) { f = null; }   // RangeError — not an IANA zone this runtime knows
    FMT.set(zone, f);
    return f;
  }

  // ⚠ VALIDATION IS `Intl` REFUSING THE NAME, NOT A REGEX. An IANA zone is not a shape
  // ("Area/Location" matches "Foo/Bar"), it is a membership — so the only honest test is
  // whether the runtime that will do the arithmetic accepts it. Postgres does the same
  // thing on its side by joining pg_timezone_names (shape_user_tz, 2026-07-06).
  function isZone(zone) {
    return typeof zone === "string" && zone.length > 0 && fmtFor(zone) != null;
  }

  // The civil fields a zone shows at instant `t`.
  function partsAt(t, zone) {
    const f = fmtFor(zone);
    if (!f || !isFinite(t)) return null;
    const p = {};
    for (const part of f.formatToParts(new Date(t))) p[part.type] = part.value;
    const y = Number(p.year), mo = Number(p.month), d = Number(p.day);
    let h = Number(p.hour); const mi = Number(p.minute), s = Number(p.second);
    if (h === 24) h = 0;        // belt-and-braces: some ICU builds spell midnight "24"
    if (![y, mo, d, h, mi, s].every((n) => isFinite(n))) return null;
    return { y: y, mo: mo, d: d, h: h, mi: mi, s: s };
  }

  // The zone's offset from UTC at instant `t`, in ms (east of UTC is positive).
  function zoneOffsetMs(t, zone) {
    const p = partsAt(t, zone);
    if (!p) return NaN;
    return Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - t;
  }

  // The calendar date a zone is on at instant `t`.
  function zonedCivil(t, zone) {
    const p = partsAt(t, zone);
    return p ? { y: p.y, mo: p.mo, d: p.d } : null;
  }

  // ⚠ TWO PASSES, AND THE SECOND ONE IS WHAT MAKES DST CORRECT. We hold a wall clock and
  // need an instant, but an offset can only be asked for AT an instant — so the first
  // pass prices the wall time as if it were UTC and corrects by the offset there, and the
  // second re-asks at the corrected instant. They differ only near a transition, which is
  // exactly where one pass lands an hour out.
  function zonedInstant(y, mo, d, h, mi, zone) {
    const naive = Date.UTC(y, mo - 1, d, h, mi, 0);
    const o1 = zoneOffsetMs(naive, zone);
    if (!isFinite(o1)) return NaN;
    let t = naive - o1;
    const o2 = zoneOffsetMs(t, zone);
    if (isFinite(o2) && o2 !== o1) t = naive - o2;
    return t;
  }

  // A bookable instant for a wall-clock minute on a calendar date in the coach's zone.
  //
  // ⚠ THE RESULT IS ROUND-TRIPPED, AND THE CHECK IS THE FEATURE RATHER THAN A GUARD ON
  // THE ARITHMETIC. On a spring-forward day a wall time simply DOES NOT EXIST — 02:30
  // never happens in New York on the March transition — and the two-pass resolution lands
  // on 03:30 instead, which is an hour the coach never declared. Formatting the instant
  // back in the zone and requiring the wall clock we asked for is what refuses it. The
  // fall-back overlap needs no such care: 01:30 happening twice is two real instants with
  // the right wall clock, so the earlier one is offered once and `seen` drops the twin.
  function isoForSlot(dateStr, startMinute, zone) {
    const parts = String(dateStr).split("-").map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => !isFinite(n))) return null;
    const m = num(startMinute);
    if (!isFinite(m) || m < 0 || m > 1439) return null;
    // ⚠ BELT-AND-BRACES, PROVEN: `fmtFor` refuses the same values, so removing THIS line
    // alone changes no answer (a mutation round confirmed it survives). Removing BOTH kills
    // the suite. Kept because it states the contract where a caller reads it, and because
    // the inner guard lives in a formatter cache a later refactor could reshape.
    if (!isZone(zone)) return null;        // fail closed: see the header
    const h = Math.floor(m / 60);
    const mi = m % 60;
    const t = zonedInstant(parts[0], parts[1], parts[2], h, mi, zone);
    if (!isFinite(t)) return null;
    const back = partsAt(t, zone);
    if (!back) return null;
    if (back.y !== parts[0] || back.mo !== parts[1] || back.d !== parts[2] ||
        back.h !== h || back.mi !== mi) return null;   // the wall time does not exist
    const d = new Date(t);
    return isFinite(d.getTime()) ? d.toISOString() : null;
  }

  // ⚠ A BLOCK IS EXPANDED INTO HOURLY STARTS, because the coach's editor COLLAPSES
  // contiguous hour cells into one row: opening 6a·7a·8a·9a stores a single
  // {start_minute 360, duration_min 240}. consultation.html offers only `start_minute`,
  // so a coach who opened four hours could be booked in the first one alone — three
  // quarters of their declared availability unreachable. Every whole hour that FITS
  // inside the block is offered, so the session can never run past the hours the coach
  // actually set.
  function expand(slot, sessionMin) {
    const start = num(slot && slot.start_minute);
    const dur = num(slot && slot.duration_min);
    if (!isFinite(start) || start < 0 || start > 1439) return [];
    // A row with no usable duration is its own single start, not a whole day.
    const span = isFinite(dur) && dur > 0 ? dur : sessionMin;
    const out = [];
    for (let m = start; m + sessionMin <= start + span; m += HOUR) {
      if (m > 1439) break;
      out.push(m);
    }
    // A block shorter than one session still offers its own start: the coach declared
    // it, and refusing it outright would silently drop a 15- or 30-minute slot.
    if (!out.length) out.push(start);
    return out;
  }

  // Build every open instant in the window.
  //
  // ⚠ `booked` IS MATCHED ON THE INSTANT, NOT ON THE STRING. Postgres can hand back
  // `2026-09-17T13:00:00+00:00` where this builds `2026-09-17T13:00:00.000Z` — the same
  // moment, spelled two ways — so a set of raw strings misses it and the slot is offered
  // to a second member. Compared as epoch ms, the spelling cannot matter. This is also
  // what lets the construction above change zone without breaking the match: an instant
  // is an instant however it was reached.
  //
  // ⚠ AND THE WINDOW WALKS THE COACH'S OWN CALENDAR, NOT UTC'S. A weekly pattern says
  // "Monday 9am" in the coach's zone, so the weekday has to be read there too: walking
  // UTC dates puts a Sydney coach's Monday morning under Sunday, and an early-morning
  // Los Angeles slot under the previous day. The civil dates are stepped through
  // Date.UTC arithmetic on purpose — a civil date has no offset, so stepping it in UTC
  // cannot be bitten by the DST it is being used to resolve.
  function buildSlots(opts) {
    const o = opts || {};
    const slots = Array.isArray(o.slots) ? o.slots : [];
    const zone = o.zone;
    // ⚠ BELT-AND-BRACES, PROVEN: `fmtFor` refuses the same values, so removing THIS line
    // alone changes no answer (a mutation round confirmed it survives). Removing BOTH kills
    // the suite. Kept because it states the contract where a caller reads it, and because
    // the inner guard lives in a formatter cache a later refactor could reshape.
    if (!isZone(zone)) return [];          // fail closed: see the header
    const days = Math.max(1, Math.min(90, num(o.days) || 14));
    const sessionMin = Math.max(1, num(o.sessionMin) || 60);
    const now = o.now instanceof Date ? o.now.getTime() : num(o.now);
    if (!isFinite(now)) return [];

    const taken = new Set();
    for (const b of Array.isArray(o.booked) ? o.booked : []) {
      const t = new Date(b).getTime();
      if (isFinite(t)) taken.add(t);
    }

    const byDay = new Map();
    for (const s of slots) {
      const wd = num(s && s.weekday);
      if (!Number.isInteger(wd) || wd < 0 || wd > 6) continue;
      const list = byDay.get(wd) || [];
      for (const m of expand(s, sessionMin)) list.push(m);
      byDay.set(wd, list);
    }
    if (!byDay.size) return [];

    const today = zonedCivil(now, zone);
    if (!today) return [];
    const base = Date.UTC(today.y, today.mo - 1, today.d);

    const out = [];
    const seen = new Set();
    for (let i = 0; i < days; i++) {
      const civil = new Date(base + i * DAY_MS);
      if (!isFinite(civil.getTime())) continue;
      const y = civil.getUTCFullYear(), mo = civil.getUTCMonth() + 1, d = civil.getUTCDate();
      const wd = civil.getUTCDay();          // the CIVIL weekday, offset-free by construction
      const starts = (byDay.get(wd) || []).slice().sort((a, b) => a - b);
      if (!starts.length) continue;
      const dateStr = y + "-" + String(mo).padStart(2, "0") + "-" + String(d).padStart(2, "0");
      for (const m of starts) {
        const iso = isoForSlot(dateStr, m, zone);
        if (!iso) continue;            // includes a wall time the zone skips over
        const t = new Date(iso).getTime();
        if (t <= now) continue;        // a slot in the past is not open
        if (taken.has(t)) continue;    // somebody already holds it
        if (seen.has(t)) continue;     // overlapping blocks must not offer it twice
        seen.add(t);
        out.push({ iso: iso, ms: t, startMinute: m, durationMin: sessionMin });
      }
    }
    out.sort((a, b) => a.ms - b.ms);
    return out;
  }

  // ⚠ THE LABEL COMES FROM THE INSTANT, NEVER FROM `start_minute`. The stored minute is
  // the COACH's wall clock; a member needs their own. `toLocaleTimeString` on the real
  // instant is the only clock they can act on — and it stays correct now that the instant
  // is built in the coach's zone, where before it was correct about an instant that was
  // itself wrong.
  function slotLabel(iso, locale, tz) {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return null;
    const opt = { hour: "numeric", minute: "2-digit" };
    if (tz) opt.timeZone = tz;
    return d.toLocaleTimeString(locale || undefined, opt);
  }

  function dayLabel(iso, locale, tz) {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return null;
    const opt = { weekday: "short", month: "short", day: "numeric" };
    if (tz) opt.timeZone = tz;
    return d.toLocaleDateString(locale || undefined, opt);
  }

  // Group by the member's OWN calendar day, not by the date the instant was built from —
  // a 13:00Z slot is the previous evening in Los Angeles, and filing it under the
  // coach's date would put it under tomorrow's heading on the member's screen.
  function groupByDay(list, locale, tz) {
    const out = [];
    const idx = new Map();
    for (const s of list || []) {
      const key = dayLabel(s.iso, locale, tz);
      if (key == null) continue;
      if (!idx.has(key)) { idx.set(key, out.length); out.push({ day: key, slots: [] }); }
      out[idx.get(key)].slots.push(s);
    }
    return out;
  }

  // ⚠ `utcDateStr` IS GONE, not misplaced. It existed to walk the projection over UTC
  // dates, which is the bug this module was fixed for; leaving an exported helper that
  // spells the old convention is how it comes back. Nothing outside ever called it.
  return {
    isZone: isZone,
    isoForSlot: isoForSlot,
    buildSlots: buildSlots,
    slotLabel: slotLabel,
    dayLabel: dayLabel,
    groupByDay: groupByDay,
    _internals: { expand: expand, zoneOffsetMs: zoneOffsetMs, zonedCivil: zonedCivil, zonedInstant: zonedInstant },
  };
});
