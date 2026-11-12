// A coach's existing clients (supabase-migrations/2026-11-12-coach-existing-clients.sql; owner,
// 2026-11-12: "Shape takes 15% cut on clients that sign up through Shape. Existing clients, Shape
// takes no cut from."). The coach lists the clients they had before Shape by email; a member whose
// confirmed Shape email is on the list pays no Shape fee at that coach's checkout. The list is open
// for 60 days from the later of the coach joining and 2026-11-12, then fixed.
//
// The reads and writes go through three definer functions as the signed-in coach, for one of their
// own provider rows; the database refuses anyone else and a closed list.

// One email per entry, from what a coach pastes: commas, semicolons, spaces or new lines between them.
export function splitEmails(text) {
  if (typeof text !== 'string') return [];
  const seen = new Set();
  const out = [];
  for (const part of text.split(/[\s,;]+/)) {
    const e = part.trim().toLowerCase();
    if (!e || seen.has(e)) continue;
    seen.add(e);
    out.push(e);
  }
  return out;
}

// The database's own shape check (coach_existing_clients_email_shape), so the editor can say which
// entries it will skip before it sends them. The database checks again.
const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const looksLikeEmail = (e) => typeof e === 'string' && e.length >= 3 && e.length <= 254 && EMAIL.test(e);

// The most the database takes in one call.
export const ADD_BATCH = 200;

const isMissing = (error) => error && (error.code === 'PGRST202' || error.code === '42883');
const isClosed = (error) => error && /existing_client_list_closed/.test(String(error.message || ''));
const isRefused = (error) => error && (error.code === '42501' || error.code === '22023');

function listOf(data) {
  const d = data && typeof data === 'object' && !Array.isArray(data) ? data : null;
  if (!d || typeof d.closes_at !== 'string' || !Number.isFinite(Date.parse(d.closes_at))) return null;
  const emails = Array.isArray(d.emails)
    ? d.emails.filter((e) => e && typeof e.email === 'string').map((e) => ({ email: e.email, addedAt: typeof e.added_at === 'string' ? e.added_at : null }))
    : [];
  return { closesAt: d.closes_at, open: d.open === true, emails };
}

// { ok: true, ready: true, list: { closesAt, open, emails: [{ email, addedAt }] } } once the database
// answered; { ok: true, ready: false } before the migration runs (the function is not there yet);
// { ok: false, error: 'refused' | 'failed' } when the read failed, which is never "an empty list".
export async function readExistingClients(client, role, providerId) {
  if (!client || typeof client.rpc !== 'function' || !role || providerId == null) return { ok: false, error: 'failed' };
  try {
    const { data, error } = await client.rpc('get_coach_existing_clients', { p_provider_role: role, p_provider_id: providerId });
    if (error) {
      if (isMissing(error)) return { ok: true, ready: false };
      return { ok: false, error: isRefused(error) ? 'refused' : 'failed' };
    }
    const list = listOf(data);
    return list ? { ok: true, ready: true, list } : { ok: false, error: 'failed' };
  } catch {
    return { ok: false, error: 'failed' };
  }
}

// Adds `emails` (already split) in batches of ADD_BATCH. { ok: true, added, invalid } when every batch
// went; { ok: false, error: 'closed' | 'refused' | 'unavailable' | 'failed', added, invalid } otherwise,
// with what the batches before the failure added.
export async function addExistingClients(client, role, providerId, emails) {
  const list = Array.isArray(emails) ? emails : [];
  let added = 0;
  const invalid = [];
  if (!client || typeof client.rpc !== 'function' || !role || providerId == null) return { ok: false, error: 'failed', added, invalid };
  for (let i = 0; i < list.length; i += ADD_BATCH) {
    try {
      const { data, error } = await client.rpc('add_coach_existing_clients', {
        p_provider_role: role, p_provider_id: providerId, p_emails: list.slice(i, i + ADD_BATCH),
      });
      if (error) {
        const kind = isClosed(error) ? 'closed' : isMissing(error) ? 'unavailable' : isRefused(error) ? 'refused' : 'failed';
        return { ok: false, error: kind, added, invalid };
      }
      added += Number.isInteger(data?.added) ? data.added : 0;
      if (Array.isArray(data?.invalid)) invalid.push(...data.invalid.filter((e) => typeof e === 'string'));
    } catch {
      return { ok: false, error: 'failed', added, invalid };
    }
  }
  return { ok: true, added, invalid };
}

// { ok: true, removed } or { ok: false, error: 'closed' | 'refused' | 'unavailable' | 'failed' }.
export async function removeExistingClient(client, role, providerId, email) {
  if (!client || typeof client.rpc !== 'function' || !role || providerId == null || !email) return { ok: false, error: 'failed' };
  try {
    const { data, error } = await client.rpc('remove_coach_existing_client', { p_provider_role: role, p_provider_id: providerId, p_email: email });
    if (error) {
      const kind = isClosed(error) ? 'closed' : isMissing(error) ? 'unavailable' : isRefused(error) ? 'refused' : 'failed';
      return { ok: false, error: kind };
    }
    return { ok: true, removed: data === true };
  } catch {
    return { ok: false, error: 'failed' };
  }
}
