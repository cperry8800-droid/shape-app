// Pure logic for Nora's member action tools (PR C, spec #1652) — plain ESM,
// node-tested, no deps. The action executors live in actions.mjs; this module
// owns the judgment calls that must be provably fail-closed.

// Mirrors src/app/api/client/reminders/route.ts KINDS — the tool validates
// before proposing so a bad kind never reaches the confirm card.
export const REMINDER_KINDS = ['weigh_in', 'checkin', 'water', 'photo', 'custom'];

export function validReminderTime(t) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(String(t || ''));
}

// 'ml'/'oz' → liters (3 dp); null on anything non-positive/unknown — the tool
// must never guess a unit into a member's hydration record.
export function waterLiters(amount, unit) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return null;
  if (unit === 'ml') return Math.round(n) / 1000;
  if (unit === 'oz') return Math.round(n * 29.5735) / 1000;
  return null;
}

// Resolve ONE named item from a list the member (or coach) actually owns.
// Exactly one hit proceeds; everything else fails closed with what WAS found
// (spec #1652) — never a guess. An exact name match wins alone even when it
// substring-matches siblings ("water" beats "water the plants"). Shared by the
// habit toggle and by the coach's client lookup, so the two cannot disagree
// about what "one match" means.
export function matchNamed(items, query) {
  const list = (Array.isArray(items) ? items : []).filter((h) => h && h.id && typeof h.name === 'string');
  const q = String(query || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const names = list.map((h) => h.name).slice(0, 12);
  if (!q) return { error: 'not_found', names };
  const exact = list.filter((h) => h.name.toLowerCase() === q);
  if (exact.length === 1) return { item: exact[0] };
  if (exact.length > 1) return { error: 'ambiguous', candidates: exact.map((h) => ({ id: h.id, name: h.name })) };
  const loose = list.filter((h) => h.name.toLowerCase().includes(q));
  if (loose.length === 1) return { item: loose[0] };
  if (loose.length > 1) return { error: 'ambiguous', candidates: loose.map((h) => ({ id: h.id, name: h.name })) };
  return { error: 'not_found', names };
}

// Fuzzy-match ONE of the member's own active habits — matchNamed's policy,
// with the hit under the key the habit tool has always read.
export function matchHabit(habits, query) {
  const r = matchNamed(habits, query);
  return r.item ? { habit: r.item } : r;
}
