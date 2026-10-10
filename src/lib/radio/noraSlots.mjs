// noraSlots.mjs — when Nora is the DJ: the owner's recurring slots ("every weekday 6–7 pm, New
// York time"), the sets they put on the schedule, and what the schedule must change to match.
// Pure: the clock comes in as `now`. Wall clocks are resolved per date in the slot's own zone
// (bookingRules.mjs wallInstant), so "6 pm" stays 6 pm across a clock change.

import { isZone, wallInstant, localDate } from '../../../public/newdesign/bookingRules.mjs';

export const SET_TITLE = 'Nora · DJ set';
export const SET_DJ = 'Nora';
export const HORIZON_DAYS = 7;          // how far ahead sets are put on the schedule
export const MIN_SET_MIN = 30;
export const MAX_SET_MIN = 360;         // nora_sets' own cap
const DAY_MS = 86400000;
export const WEEKDAYS = Object.freeze(['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']);

/**
 * A slot from the form: days (0 = Sunday … 6), a start time "HH:MM", a length in minutes and an
 * IANA zone. @returns {{ok: true, value} | {ok: false, error}}
 */
export function checkSlot(input) {
  const i = input && typeof input === 'object' ? input : {};
  const raw = Array.isArray(i.days) ? i.days : [];
  const days = [...new Set(raw.map((d) => Number(d)))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort((a, b) => a - b);
  if (!days.length || days.length !== new Set(raw.map(String)).size) return { ok: false, error: 'days' };
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(i.startTime || '').trim());
  if (!m) return { ok: false, error: 'start_time' };
  const durationMin = Number(i.durationMin);
  if (!Number.isInteger(durationMin) || durationMin < MIN_SET_MIN || durationMin > MAX_SET_MIN) return { ok: false, error: 'duration' };
  const zone = String(i.zone || '').trim();
  if (!isZone(zone)) return { ok: false, error: 'zone' };
  return { ok: true, value: { days, start_minute: Number(m[1]) * 60 + Number(m[2]), duration_min: durationMin, zone } };
}

/** "Mon–Fri · 6:00 pm · 60 min · America/New_York" for the page. */
export function describeSlot(slot) {
  const d = Array.isArray(slot.days) ? [...slot.days].sort((a, b) => a - b) : [];
  const run = d.length > 2 && d.every((x, i) => i === 0 || x === d[i - 1] + 1);
  const days = d.length === 7 ? 'Every day' : run ? `${WEEKDAYS[d[0]]}–${WEEKDAYS[d[d.length - 1]]}` : d.map((x) => WEEKDAYS[x]).join(', ');
  const h = Math.floor(slot.start_minute / 60), mi = slot.start_minute % 60;
  const time = `${h % 12 || 12}:${String(mi).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
  return `${days} · ${time} · ${slot.duration_min} min · ${slot.zone}`;
}

/** Every start of `slot` in [fromMs, toMs), as { slotId, startsAt (ISO), durationMin }. */
export function slotOccurrences(slot, fromMs, toMs) {
  const out = [];
  if (!slot || !isZone(slot.zone) || !(toMs > fromMs)) return out;
  const first = localDate(fromMs - DAY_MS, slot.zone);
  const last = localDate(toMs + DAY_MS, slot.zone);
  if (!first || !last) return out;
  let [y, mo, d] = first.split('-').map(Number);
  for (let guard = 0; guard < 400; guard++) {
    const ymd = `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (ymd > last) break;
    const weekday = new Date(Date.UTC(y, mo - 1, d)).getUTCDay();
    if (slot.days.includes(weekday)) {
      const t = wallInstant(y, mo, d, slot.start_minute, slot.zone);
      if (Number.isFinite(t) && t >= fromMs && t < toMs) out.push({ slotId: slot.id, startsAt: new Date(t).toISOString(), durationMin: slot.duration_min });
    }
    const next = new Date(Date.UTC(y, mo - 1, d + 1));
    y = next.getUTCFullYear(); mo = next.getUTCMonth() + 1; d = next.getUTCDate();
  }
  return out;
}

const span = (r) => {
  const a = Date.parse(r.startsAt ?? r.starts_at);
  return [a, a + Number(r.durationMin ?? r.duration_min) * 60000];
};
const overlap = (x, y) => { const [a, b] = span(x), [c, e] = span(y); return a < e && c < b; };

/**
 * What the schedule must change so Nora's future sets match the slots.
 * @param {object} p
 * @param {Array} p.slots      enabled slots
 * @param {Array} p.sets       every nora_sets row from `now` on (guest and Nora), with `planned`
 *                             true for a Nora set that already has a programme
 * @param {boolean} p.licensed the owner has confirmed the station's licences
 * @param {number} p.now
 * @returns {{insert: object[], remove: string[], publish: string[], unpublish: string[], clashes: object[]}}
 *
 * ⚠ A PLANNED SET IS NEVER REMOVED: its programme may already be on the air or about to be. And a
 * set that has started is left alone whatever the slots say now.
 * ⚠ NOTHING IS PUBLISHED WITHOUT THE LICENCES: an unlicensed set is planned privately and never
 * appears in "Coming up".
 */
export function reconcileSets({ slots, sets, licensed, now }) {
  const horizonEnd = now + HORIZON_DAYS * DAY_MS;
  const desired = [];
  for (const s of slots || []) if (s && s.enabled !== false) desired.push(...slotOccurrences(s, now, horizonEnd));
  desired.sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));

  const future = (sets || []).filter((r) => Date.parse(r.starts_at) > now);
  const nora = future.filter((r) => r.host_kind === 'nora');
  const guests = future.filter((r) => r.host_kind !== 'nora');
  const key = (slotId, startsAt) => `${slotId}|${new Date(Date.parse(startsAt)).toISOString()}`;
  const have = new Map(nora.filter((r) => r.slot_id).map((r) => [key(r.slot_id, r.starts_at), r]));
  const wanted = new Set();
  const insert = [], clashes = [];
  const taken = [...guests];
  for (const o of desired) {
    const k = key(o.slotId, o.startsAt);
    wanted.add(k);
    if (have.has(k)) { taken.push(have.get(k)); continue; }
    // Two slots that overlap, or a guest set in the way: the earlier claim keeps the time.
    const hit = taken.find((r) => overlap(r, o));
    if (hit) { clashes.push({ ...o, with: hit.id ?? hit.slotId }); continue; }
    insert.push({
      title: SET_TITLE, dj: SET_DJ, blurb: null, starts_at: o.startsAt, duration_min: o.durationMin,
      host_kind: 'nora', slot_id: o.slotId, published: !!licensed,
    });
    taken.push(o);
  }
  const remove = nora.filter((r) => !r.planned && !(r.slot_id && wanted.has(key(r.slot_id, r.starts_at)))).map((r) => r.id);
  const removed = new Set(remove);
  const publish = nora.filter((r) => !removed.has(r.id) && licensed && !r.published).map((r) => r.id);
  const unpublish = nora.filter((r) => !removed.has(r.id) && !licensed && r.published).map((r) => r.id);
  return { insert, remove, publish, unpublish, clashes };
}
