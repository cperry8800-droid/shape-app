// One conversation with Nora per account (the Ask Nora plan, step 4). The shape stored in
// public.nora_threads and the rules for it, shared by /api/nora/thread and its tests.
//
// A message is { role: 'user' | 'assistant' | 'team', text, at }. Confirm cards, chips and
// links are never stored: a card's signed token expires, and a stored one could not be
// confirmed. The last THREAD_MAX messages are kept.
//
// ⚠ 'team' IS A REPLY FROM A PERSON AT SHAPE ("Talk to a person"), and only the server writes
// one: the console's reply (appendTeamReply). A device's append can never carry it, so an
// account cannot put words in the team's mouth; a stored one is kept on every later append.
// A team message also carries `ref`, the id of the support request it answered: a reader shows
// it only when that request's stored reply is this text (supportRequests.mjs, L15 of the
// 2026-10-08 review), so a stored message cannot be moved, repeated or re-timed into place.
//
// ⚠ EACH DEVICE APPENDS, NONE REPLACES. A phone holding the thread it loaded an hour ago
// would wipe out what the laptop said since if it wrote the whole thread back, so a client
// sends only the messages it added, and the server appends them to what is stored.

export const THREAD_MAX = 40;
export const TEXT_MAX = 4000;
export const APPEND_MAX = 20;

/** One message reduced to the stored shape, or null when it is not one. */
export function cleanMessage(m, now = new Date(), opts = {}) {
  if (!m || typeof m !== 'object') return null;
  const role = m.role === 'user' || m.role === 'assistant' || (opts.team === true && m.role === 'team') ? m.role : null;
  const text = typeof m.text === 'string' ? m.text.trim().slice(0, TEXT_MAX) : '';
  if (!role || !text) return null;
  const t = typeof m.at === 'string' ? Date.parse(m.at) : NaN;
  // A time from the future (a skewed device clock) is stored as now.
  const at = Number.isFinite(t) && t <= now.getTime() + 60_000 ? new Date(t).toISOString() : now.toISOString();
  const ref = role === 'team' && typeof m.ref === 'string' && /^[A-Za-z0-9-]{1,40}$/.test(m.ref) ? m.ref : null;
  return ref ? { role, text, at, ref } : { role, text, at };
}

/** A stored or sent list, cleaned and trimmed to the newest THREAD_MAX. */
export function cleanThread(list, now = new Date(), opts = {}) {
  const out = [];
  for (const m of Array.isArray(list) ? list : []) {
    const c = cleanMessage(m, now, opts);
    if (c) out.push(c);
  }
  return out.slice(-THREAD_MAX);
}

/** What is stored plus what a device added, oldest first, trimmed to the newest THREAD_MAX. */
export function appendThread(stored, added, now = new Date()) {
  const extra = cleanThread(Array.isArray(added) ? added.slice(-APPEND_MAX) : [], now);
  return cleanThread(stored, now, { team: true }).concat(extra).slice(-THREAD_MAX);
}

/** What is stored plus the Shape team's reply, written only by the server; `ref` names the request it answers. */
export function appendTeamReply(stored, text, now = new Date(), ref = null) {
  const reply = cleanMessage({ role: 'team', text, at: now.toISOString(), ref }, now, { team: true });
  if (!reply) return null;
  return cleanThread(stored, now, { team: true }).concat(reply).slice(-THREAD_MAX);
}
