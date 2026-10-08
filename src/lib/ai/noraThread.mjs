// One conversation with Nora per account (the Ask Nora plan, step 4). The shape stored in
// public.nora_threads and the rules for it, shared by /api/nora/thread and its tests.
//
// A message is { role: 'user' | 'assistant', text, at }. Confirm cards, chips and links are
// never stored: a card's signed token expires, and a stored one could not be confirmed.
// The last THREAD_MAX messages are kept.
//
// ⚠ EACH DEVICE APPENDS, NONE REPLACES. A phone holding the thread it loaded an hour ago
// would wipe out what the laptop said since if it wrote the whole thread back, so a client
// sends only the messages it added, and the server appends them to what is stored.

export const THREAD_MAX = 40;
export const TEXT_MAX = 4000;
export const APPEND_MAX = 20;

/** One message reduced to the stored shape, or null when it is not one. */
export function cleanMessage(m, now = new Date()) {
  if (!m || typeof m !== 'object') return null;
  const role = m.role === 'user' || m.role === 'assistant' ? m.role : null;
  const text = typeof m.text === 'string' ? m.text.trim().slice(0, TEXT_MAX) : '';
  if (!role || !text) return null;
  const t = typeof m.at === 'string' ? Date.parse(m.at) : NaN;
  // A time from the future (a skewed device clock) is stored as now.
  const at = Number.isFinite(t) && t <= now.getTime() + 60_000 ? new Date(t).toISOString() : now.toISOString();
  return { role, text, at };
}

/** A stored or sent list, cleaned and trimmed to the newest THREAD_MAX. */
export function cleanThread(list, now = new Date()) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const c = cleanMessage(m, now);
    if (c) out.push(c);
  }
  return out.slice(-THREAD_MAX);
}

/** What is stored plus what a device added, oldest first, trimmed to the newest THREAD_MAX. */
export function appendThread(stored, added, now = new Date()) {
  const extra = cleanThread(Array.isArray(added) ? added.slice(-APPEND_MAX) : [], now);
  return cleanThread(stored, now).concat(extra).slice(-THREAD_MAX);
}
