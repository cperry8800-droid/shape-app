// Coach availability projection — pure. Turns a coach's weekly
// provider_availability pattern minus already-booked sessions into DATED open
// slots for the next N weeks. Consumed by the marketplace Listing (the OPEN
// THIS WEEK station + the full calendar). Server shape = GET /api/availability:
//   slots:  [{ weekday (0=Sun..6), start_minute, duration_min }]
//   booked: [{ scheduled_at (ISO), status }]  — already filtered to requested/confirmed
// All math is LOCAL time (a member books in their own clock; the server stores
// the instant). Past slots never emit; a booked instant suppresses its slot.

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export function bsProjectAvailability({ slots = [], booked = [], weeks = 6, now = new Date() } = {}) {
  const bookedKeys = new Set(
    (booked || [])
      .map((b) => {
        const d = new Date(b && b.scheduled_at);
        return Number.isNaN(d.getTime()) ? null : `${isoDay(d)}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      })
      .filter(Boolean),
  );
  const out = [];
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  for (let i = 0; i < weeks * 7; i++) {
    const day = new Date(start);
    day.setDate(start.getDate() + i);
    const wd = day.getDay();
    for (const s of slots || []) {
      if (Number(s && s.weekday) !== wd) continue;
      const startMin = Number(s.start_minute);
      if (!Number.isFinite(startMin) || startMin < 0 || startMin >= 24 * 60) continue;
      const h = Math.floor(startMin / 60);
      const m = startMin % 60;
      const at = new Date(day);
      at.setHours(h, m, 0, 0);
      if (at.getTime() <= now.getTime()) continue; // past never emits
      const iso = isoDay(day);
      const time = `${pad2(h)}:${pad2(m)}`;
      if (bookedKeys.has(`${iso}T${time}`)) continue; // taken
      out.push({ iso, weekday: wd, time, durationMin: Number(s.duration_min) || 60 });
    }
  }
  return out.sort((a, b) => `${a.iso}T${a.time}`.localeCompare(`${b.iso}T${b.time}`));
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
