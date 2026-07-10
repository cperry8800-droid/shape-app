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

// Fuzzy-match ONE of the member's own active habits. Exactly one hit proceeds;
// everything else fails closed (spec #1652) — never guess-toggles. Exact
// name match wins alone even when it substring-matches siblings.
export function matchHabit(habits, query) {
  const list = (Array.isArray(habits) ? habits : []).filter((h) => h && h.id && typeof h.name === 'string');
  const q = String(query || '').replace(/\s+/g, ' ').trim().toLowerCase();
  const names = list.map((h) => h.name).slice(0, 12);
  if (!q) return { error: 'not_found', names };
  const exact = list.filter((h) => h.name.toLowerCase() === q);
  if (exact.length === 1) return { habit: exact[0] };
  if (exact.length > 1) return { error: 'ambiguous', candidates: exact.map((h) => ({ id: h.id, name: h.name })) };
  const loose = list.filter((h) => h.name.toLowerCase().includes(q));
  if (loose.length === 1) return { habit: loose[0] };
  if (loose.length > 1) return { error: 'ambiguous', candidates: loose.map((h) => ({ id: h.id, name: h.name })) };
  return { error: 'not_found', names };
}
