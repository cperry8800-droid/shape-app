// Booking slots — turning a coach's weekly availability into concrete, bookable
// instants (review 2026-09-09, R20's other half).
//
// PURE module: no React, no DOM, no fetch. Loads as a plain <script> in the
// browser (exposes window.BookingSlots) and via require() in Node, so every
// rule below is driven by tests/booking-slots.test.mjs rather than eyeballed.
//
// Input is exactly what GET /api/availability answers:
//   slots  [{ weekday, start_minute, duration_min }]   weekday is getDay()-style, 0=Sun
//   booked [iso, …]                                    requested + confirmed, any source
//
// ⚠ THE INSTANT IS BUILT WITH Date.UTC, AND THAT IS NOT A PREFERENCE — IT IS THE
// CONVENTION THE REST OF THE BOOKING CHAIN ALREADY USES. consultation.html's
// `isoForSlot` builds `new Date(Date.UTC(y, mo-1, d, h, mi))`, and /api/availability
// returns `booked` as the raw `scheduled_at` of every requested/confirmed row. So the
// ONLY way this surface can tell that a slot is already taken is to spell the instant
// the same way. Build it in local time instead and every ISO misses the booked set —
// two members book the same hour, and the database's own partial unique index is the
// first thing that notices.
//
// ⚠ AND THE CONVENTION IS WRONG, WHICH IS WHY THE LABEL IS NOT DERIVED FROM
// `start_minute`. `provider_availability` has NO timezone column and the coach's
// Schedule editor stores a bare wall-clock hour — the coach toggles the cell marked
// "9a" and 540 is written. Turning 540 into 09:00Z means a coach in New York who opens
// 9am has clients booking 5:00 AM their time, and Los Angeles 2:00 AM, while both
// parties are shown the string "9:00 AM" — which is nobody's actual time.
//
// The member is never lied to about that here: `slotLabel` formats the REAL INSTANT in
// the viewer's own zone, so what they pick is what their calendar gets. Fixing the
// coach's side needs a timezone on the provider and a backfill — a migration, and the
// owner's call — so it is REGISTERED, not quietly redefined underneath a chain that
// four other surfaces already agree on.
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

  // The canonical construction — byte-for-byte the rule consultation.html applies.
  function isoForSlot(dateStr, startMinute) {
    const parts = String(dateStr).split("-").map((n) => parseInt(n, 10));
    if (parts.length !== 3 || parts.some((n) => !isFinite(n))) return null;
    const m = num(startMinute);
    if (!isFinite(m) || m < 0 || m > 1439) return null;
    const h = Math.floor(m / 60);
    const mi = m % 60;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], h, mi, 0));
    return isFinite(d.getTime()) ? d.toISOString() : null;
  }

  // A UTC calendar date string for the Nth day after a given instant. The projection
  // runs on UTC dates because `isoForSlot` reads them as UTC — mixing a local date into
  // a UTC construction is how a slot lands a day out either side of midnight.
  function utcDateStr(ms) {
    const d = new Date(ms);
    if (!isFinite(d.getTime())) return null;
    const p = (n) => String(n).padStart(2, "0");
    return d.getUTCFullYear() + "-" + p(d.getUTCMonth() + 1) + "-" + p(d.getUTCDate());
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
  // `2026-09-17T09:00:00+00:00` where this builds `2026-09-17T09:00:00.000Z` — the same
  // moment, spelled two ways — so a set of raw strings misses it and the slot is offered
  // to a second member. Compared as epoch ms, the spelling cannot matter.
  function buildSlots(opts) {
    const o = opts || {};
    const slots = Array.isArray(o.slots) ? o.slots : [];
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

    const out = [];
    const seen = new Set();
    for (let i = 0; i < days; i++) {
      const dayMs = now + i * DAY_MS;
      const dateStr = utcDateStr(dayMs);
      if (!dateStr) continue;
      const wd = new Date(dayMs).getUTCDay();
      const starts = (byDay.get(wd) || []).slice().sort((a, b) => a - b);
      for (const m of starts) {
        const iso = isoForSlot(dateStr, m);
        if (!iso) continue;
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

  // ⚠ THE LABEL COMES FROM THE INSTANT, NEVER FROM `start_minute`. See the header: the
  // stored minute is the coach's wall clock read as UTC, so rendering it directly shows
  // the member a time neither of them gets. `toLocaleTimeString` on the real instant is
  // the member's own clock, which is the only time they can act on.
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

  // Group by the member's OWN calendar day, not by the UTC date the instant was built
  // from — a 9:00Z slot is the previous evening in Los Angeles, and filing it under the
  // UTC date would put it under tomorrow's heading on the member's screen.
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

  return {
    isoForSlot: isoForSlot,
    utcDateStr: utcDateStr,
    buildSlots: buildSlots,
    slotLabel: slotLabel,
    dayLabel: dayLabel,
    groupByDay: groupByDay,
    _internals: { expand: expand },
  };
});
