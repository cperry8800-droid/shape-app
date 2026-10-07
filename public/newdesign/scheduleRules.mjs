// Schedule rules — the pure core of the coach Schedule's week grid (2026-10-07, step 2 of the
// owner-approved Schedule upgrade) and of the booking routes that have to agree with it.
//
// PURE: no React, no DOM, no fetch, no clock. Every "now" is an input. Canonical location is
// `public/newdesign/` (the workoutDocument.mjs / progressionGuardrail.mjs precedent): the
// Schedule page loads it as a native module (window.ShapeScheduleRules), the routes import it
// by relative path, and the Node tests import it directly. ONE implementation, so the grid's red
// drop target and the server's 409 cannot disagree about what a clash is.
//
// Units: minutes since local midnight for wall clocks, and whatever unit the caller uses for
// an interval (the grid passes minutes, the routes pass epoch ms) — `clashIn` only compares.
//
// provider_availability rows are { weekday, start_minute, duration_min }, weekday getDay()-style
// (0 = Sun … 6 = Sat), start_minute a wall-clock minute in the COACH's zone.

export const SNAP_MIN = 15;
// A booking that holds its time: the double-book index covers exactly these two, and
// /api/availability treats both as taken. Completed, declined and cancelled do not.
export const ACTIVE_STATUSES = ['requested', 'confirmed'];
// A booking that fills an open hour for "N of M open hrs booked". A request is not booked yet —
// it has its own strip and its own count.
export const BOOKED_STATUSES = ['confirmed', 'completed'];

// ⚠ `Number(null)` IS 0 AND SO IS `Number("")` — both finite. bookingSlots.js learned this the
// hard way (a row with no start_minute became a bookable midnight), so the same guard is here.
function num(v) {
  if (v == null || v === '' || typeof v === 'boolean') return NaN;
  const n = Number(v);
  return Number.isFinite(n) ? n : NaN;
}

// ── Open hours ──────────────────────────────────────────────────────────────

// Each weekday's slots merged into sorted, non-overlapping [start, end) minute ranges:
// an array of 7 lists, index = getDay() weekday.
// ⚠ NOT CLAMPED AT MIDNIGHT. A row may say 23:00 for 120 minutes; clamping here would refuse a
// 23:30 hour that bookingSlots.js offers. The grid clamps when it DRAWS, never when it decides.
export function openBlocks(slots) {
  const byDay = [[], [], [], [], [], [], []];
  for (const s of Array.isArray(slots) ? slots : []) {
    const wd = num(s && s.weekday);
    const start = num(s && s.start_minute);
    const dur = num(s && s.duration_min);
    if (!Number.isInteger(wd) || wd < 0 || wd > 6) continue;
    if (!Number.isFinite(start) || start < 0 || start > 1439) continue;
    // The column is NOT NULL (default 15), so a row without a usable length is malformed —
    // an hour of unknown size cannot be shaded or booked into.
    if (!Number.isFinite(dur) || dur <= 0) continue;
    byDay[wd].push({ start, end: start + dur });
  }
  return byDay.map((list) => {
    const sorted = list.slice().sort((a, b) => a.start - b.start);
    const out = [];
    for (const b of sorted) {
      const last = out[out.length - 1];
      // Touching blocks are one block: 6a–7a and 7a–8a is two hours a session can span.
      if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
      else out.push({ start: b.start, end: b.end });
    }
    return out;
  });
}

// Whether a session of `durationMin` starting at wall-clock `startMin` on `weekday` sits inside
// the coach's open hours.
//
// ⚠ IT ACCEPTS EXACTLY WHAT bookingSlots.js OFFERS, AND NOTHING MORE. That module offers every
// start whose session fits inside a declared row, plus — deliberately — the START of a row
// shorter than one session ("a block shorter than one session still offers its own start"). A
// check stricter than the offer would refuse a time the member was just shown; a looser one
// is the 3 AM booking this check exists to stop. So: fits inside the merged hours, or is the
// start of a short row.
export function fitsOpenHours(slots, weekday, startMin, durationMin) {
  const wd = num(weekday), start = num(startMin), dur = num(durationMin);
  if (!Number.isInteger(wd) || wd < 0 || wd > 6) return false;
  if (!Number.isFinite(start) || !Number.isFinite(dur) || dur <= 0) return false;
  const day = openBlocks(slots)[wd];
  if (day.some((b) => b.start <= start && start + dur <= b.end)) return true;
  return (Array.isArray(slots) ? slots : []).some((s) => num(s && s.weekday) === wd
    && num(s && s.start_minute) === start && num(s && s.duration_min) > 0 && num(s && s.duration_min) < dur);
}

// ── Clashes ─────────────────────────────────────────────────────────────────

// The first item that overlaps [start, end), or null. Items are { id, start, end, status }.
// Only ACTIVE bookings hold time; an item whose id is `excludeId` is the booking being moved.
// ⚠ HALF-OPEN INTERVALS: a 9:00–10:00 session and a 10:00 one are back to back, not a clash.
export function clashIn(items, start, end, excludeId) {
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || (excludeId != null && it.id === excludeId)) continue;
    if (!ACTIVE_STATUSES.includes(it.status)) continue;
    if (!(Number.isFinite(it.start) && Number.isFinite(it.end))) continue;
    if (it.start < end && start < it.end) return it;
  }
  return null;
}

// ── Grid geometry ───────────────────────────────────────────────────────────

export function snapMinutes(min, step = SNAP_MIN) {
  return Math.round(min / step) * step;
}

// Side-by-side lanes for one day's blocks: overlapping blocks share a CLUSTER, each takes the
// lowest free lane in it, and every block in a cluster is drawn 1/lanes wide. Returns a Map
// id → { lane, lanes }. Items are { id, start, end }.
export function layoutLanes(items) {
  const sorted = (Array.isArray(items) ? items : []).filter((i) => i && Number.isFinite(i.start))
    .slice().sort((a, b) => a.start - b.start || b.end - a.end);
  const out = new Map();
  let cluster = [], laneEnds = [], clusterEnd = -Infinity;
  const close = () => { for (const id of cluster) out.get(id).lanes = laneEnds.length; cluster = []; laneEnds = []; };
  for (const it of sorted) {
    const end = Math.max(it.end, it.start + 1);
    if (it.start >= clusterEnd) { close(); clusterEnd = -Infinity; }
    let lane = laneEnds.findIndex((e) => e <= it.start);
    if (lane < 0) { lane = laneEnds.length; laneEnds.push(end); } else laneEnds[lane] = end;
    out.set(it.id, { lane, lanes: 1 });
    cluster.push(it.id);
    clusterEnd = Math.max(clusterEnd, end);
  }
  close();
  return out;
}

// The hours the grid draws: the default day (6a–9p), widened to the whole hour that holds the
// earliest start and the latest end of anything on screen, so nothing is cut off. `spans` are
// { start, end } wall-clock minutes. Returns { startHour, endHour } within 0…24.
export function hourRange(spans, defStart = 6, defEnd = 21) {
  let lo = defStart * 60, hi = defEnd * 60;
  for (const s of Array.isArray(spans) ? spans : []) {
    if (!s || !Number.isFinite(s.start)) continue;
    lo = Math.min(lo, s.start);
    hi = Math.max(hi, Number.isFinite(s.end) ? s.end : s.start + SNAP_MIN);
  }
  return { startHour: Math.max(0, Math.floor(lo / 60)), endHour: Math.min(24, Math.ceil(hi / 60)) };
}

// Where a pointer lands on the grid: the column under it and the wall-clock minute the dragged
// block's TOP would sit at, snapped. `rect` is the columns container's box; `grabMin` is how far
// below the block's top the pointer took hold, so the block moves with the hand rather than
// jumping its top to the pointer. Clamped so a block never leaves the day.
export function pointToSlot({ x, y, rect, columns, startHour, hourPx, grabMin = 0, durationMin = 0, step = SNAP_MIN }) {
  const cols = Math.max(1, columns | 0);
  const width = rect && rect.width > 0 ? rect.width : 1;
  const col = Math.min(cols - 1, Math.max(0, Math.floor(((x - (rect ? rect.left : 0)) / width) * cols)));
  const raw = startHour * 60 + ((y - (rect ? rect.top : 0)) / hourPx) * 60 - grabMin;
  // The latest start that still ends by midnight, on the snap grid.
  const latest = Math.max(0, Math.floor((1440 - Math.max(0, durationMin)) / step) * step);
  const minute = Math.min(latest, Math.max(0, snapMinutes(raw, step)));
  return { col, minute };
}

// ── Load ────────────────────────────────────────────────────────────────────

// Minutes of [start, end) that fall inside the day's open blocks (clamped at midnight).
function openOverlap(blocks, start, end) {
  let n = 0;
  for (const b of blocks) n += Math.max(0, Math.min(end, b.end, 1440) - Math.max(start, b.start));
  return n;
}

// One day's load: { openMin, bookedMin, freeMin }. `events` are { start, end, status } wall-clock
// minutes on that day. Booked time is counted only where it falls inside open hours, so "N of M
// open hrs booked" can never read more than 100% — a session outside your hours is not one of
// your open hours being used.
export function dayLoad(blocks, events) {
  const day = Array.isArray(blocks) ? blocks : [];
  const openMin = day.reduce((s, b) => s + Math.max(0, Math.min(b.end, 1440) - b.start), 0);
  // Booked intervals are unioned first, so two overlapping sessions do not count an hour twice.
  const spans = (Array.isArray(events) ? events : [])
    .filter((e) => e && BOOKED_STATUSES.includes(e.status) && Number.isFinite(e.start) && Number.isFinite(e.end))
    .map((e) => ({ start: e.start, end: e.end })).sort((a, b) => a.start - b.start);
  const merged = [];
  for (const s of spans) {
    const last = merged[merged.length - 1];
    if (last && s.start <= last.end) last.end = Math.max(last.end, s.end); else merged.push({ ...s });
  }
  const bookedMin = merged.reduce((s, m) => s + openOverlap(day, m.start, m.end), 0);
  return { openMin, bookedMin, freeMin: Math.max(0, openMin - bookedMin) };
}

// "6" for whole hours, "6.5" otherwise — the header reads hours, and a coach working in
// half-hour blocks should not see their load rounded away.
export function hoursLabel(min) {
  const h = Math.round((min / 60) * 10) / 10;
  return Number.isInteger(h) ? String(h) : h.toFixed(1);
}
