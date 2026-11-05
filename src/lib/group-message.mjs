// One message to a chosen set of clients (owner, 2026-11-05: "Let a coach send one message to a chosen
// set of clients ('Nudge all 3', 'Note to all'). Each client gets their own copy in their normal thread;
// there is no group thread. Rate-limit it, and confirm before sending.")
//
// Pure: POST /api/coach/messages/group validates with checkGroupSend and limits with rateDecision, then
// writes one message per client into that client's own thread with the coach.
//
//   checkGroupSend({ role, clientIds, body, confirmed, groupId })
//     → { ok: true, role, clientIds, body, groupId } | { ok: false, status, error, code }
//     `confirmed` is the number of clients the coach saw on the confirm step; it must equal the list
//     sent, so a page that changed the list after confirming sends nothing. `groupId` is the send's own
//     id (the page mints it once per confirm): a retry of the same send is recognised, never doubled.
//   rateDecision(rows, now, groupId)
//     `rows`: the coach's own group messages of the last day ({ metadata: { groupId }, created_at }).
//     At most GROUP_SENDS_PER_HOUR sends an hour and GROUP_SENDS_PER_DAY a day; a groupId already
//     sent is answered as sent.

export const GROUP_MAX_RECIPIENTS = 50;
export const GROUP_MAX_BODY = 2000;
export const GROUP_SENDS_PER_HOUR = 5;
export const GROUP_SENDS_PER_DAY = 20;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function checkGroupSend(input) {
  const i = input && typeof input === 'object' ? input : {};
  const role = i.role === 'trainer' || i.role === 'nutritionist' ? i.role : null;
  if (!role) return { ok: false, status: 400, code: 'role', error: 'Say which of your coaching roles this is from.' };
  const raw = Array.isArray(i.clientIds) ? i.clientIds.map((x) => String(x || '').trim()) : [];
  const clientIds = [...new Set(raw)];
  if (!clientIds.length) return { ok: false, status: 400, code: 'no_clients', error: 'Pick at least one client.' };
  if (clientIds.some((id) => !UUID.test(id))) return { ok: false, status: 400, code: 'bad_client', error: 'One of those clients could not be read.' };
  if (clientIds.length > GROUP_MAX_RECIPIENTS) return { ok: false, status: 400, code: 'too_many', error: `At most ${GROUP_MAX_RECIPIENTS} clients at a time.` };
  const body = typeof i.body === 'string' ? i.body.trim() : '';
  if (!body) return { ok: false, status: 400, code: 'empty', error: 'Write the message first.' };
  if (body.length > GROUP_MAX_BODY) return { ok: false, status: 400, code: 'too_long', error: `Keep it under ${GROUP_MAX_BODY} characters.` };
  if (Number(i.confirmed) !== clientIds.length || raw.length !== clientIds.length) {
    return { ok: false, status: 409, code: 'confirm', error: 'Confirm who it goes to before it is sent.' };
  }
  const groupId = typeof i.groupId === 'string' && UUID.test(i.groupId) ? i.groupId.toLowerCase() : null;
  if (!groupId) return { ok: false, status: 400, code: 'group_id', error: 'This send could not be identified. Reload and try again.' };
  return { ok: true, role, clientIds, body, groupId };
}

export function rateDecision(rows, now, groupId) {
  const at = now instanceof Date ? now.getTime() : Date.now();
  const firstAt = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    const g = r && r.metadata && typeof r.metadata.groupId === 'string' ? r.metadata.groupId.toLowerCase() : null;
    const t = Date.parse(String(r && r.created_at || ''));
    if (!g || !Number.isFinite(t) || at - t > 24 * 3600_000) continue;
    if (!firstAt.has(g) || t < firstAt.get(g)) firstAt.set(g, t);
  }
  if (groupId && firstAt.has(String(groupId).toLowerCase())) return { ok: false, status: 409, code: 'already_sent', error: 'That message was already sent.' };
  const lastHour = [...firstAt.values()].filter((t) => at - t <= 3600_000).length;
  if (lastHour >= GROUP_SENDS_PER_HOUR) return { ok: false, status: 429, code: 'hourly', error: `You can send ${GROUP_SENDS_PER_HOUR} group messages an hour. Try again later.` };
  if (firstAt.size >= GROUP_SENDS_PER_DAY) return { ok: false, status: 429, code: 'daily', error: `You can send ${GROUP_SENDS_PER_DAY} group messages a day. Try again tomorrow.` };
  return { ok: true };
}
