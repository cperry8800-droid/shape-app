// Same document and compare-and-set contract as the website's CKCoachNote.
// Never upsert: another device may be editing this or a different client's note.
export const coachNoteDraftKey = (uid, clientId) => uid && clientId
  ? `shape:coach-note-draft:v1:${encodeURIComponent(uid)}:${encodeURIComponent(clientId)}` : null;

export function readCoachNoteDraft(storage, uid, clientId) {
  try {
    const key = coachNoteDraftKey(uid, clientId);
    const d = key && JSON.parse(storage.getItem(key));
    return d && typeof d.text === 'string' && typeof d.baseText === 'string' ? d : null;
  } catch { return null; }
}
export function writeCoachNoteDraft(storage, uid, clientId, draft) {
  try {
    const key = coachNoteDraftKey(uid, clientId);
    if (!key) return false;
    if (draft == null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch { return false; }
}
export async function readCoachNotes(client, uid) {
  if (!client || !uid) throw new Error('Notes unavailable');
  const r = await client.from('user_goals').select('data').eq('user_id', uid).eq('kind', 'coach_client_notes').maybeSingle();
  if (r.error) throw r.error;
  return r.data?.data || {};
}
export const coachNoteText = (doc, id) => typeof doc?.[id]?.text === 'string' ? doc[id].text : '';

export async function saveCoachNote({ client, uid, clientId, text, baseText, currentUid }) {
  // Retry unrelated-client contention; a change to THIS note needs a decision.
  for (let attempt = 0; attempt < 3; attempt++) {
    if (!uid || !clientId || currentUid() !== uid) return { accountChanged: true };
    const base = await readCoachNotes(client, uid);
    if (currentUid() !== uid) return { accountChanged: true };
    const latest = coachNoteText(base, clientId);
    if (latest !== baseText && latest !== text) return { conflict: true, latestText: latest };
    const updatedAt = new Date().toISOString();
    const next = { ...base };
    if (text.trim()) next[clientId] = { ...base[clientId], text, updatedAt };
    else delete next[clientId];
    const r = await client.from('user_goals').update({ data: next })
      .eq('user_id', uid).eq('kind', 'coach_client_notes').eq('data', JSON.stringify(base)).select('user_id');
    if (r.error) throw r.error;
    if (r.data?.length === 1) return { ok: true, updatedAt };
    if (!Object.keys(base).length) {
      if (currentUid() !== uid) return { accountChanged: true };
      const inserted = await client.from('user_goals').insert({ user_id: uid, kind: 'coach_client_notes', data: next });
      if (!inserted.error) return { ok: true, updatedAt };
      if (inserted.error.code !== '23505') throw inserted.error;
    }
  }
  throw new Error('Notes changed while saving');
}
