// user_goals('nora_memory') — { rev, notes: [{ id, text, at }] }. Pure doc
// mutations; the CAS write loop lives in server.ts (casWriteUserGoals). Ids are
// a stable hash of the normalized text so a retry dedupes AND can repair a
// missing audit row keyed on the same id. Plain ESM (the tone.mjs pattern) so
// node:test imports the exact logic the tools run.
export const MEMORY_KIND = 'nora_memory';
export const NOTE_MAX_CHARS = 280;
export const NOTES_CAP = 30;

export function emptyMemoryDoc() { return { rev: 0, notes: [] }; }

// Word-boundary truncation to the 280-char cap — bounds the prompt-size
// contribution of a single note, not just the count.
export function truncateNote(text) {
  const s = String(text || '').replace(/\s+/g, ' ').trim();
  if (s.length <= NOTE_MAX_CHARS) return s;
  const cut = s.slice(0, NOTE_MAX_CHARS);
  const atWord = cut.replace(/\s+\S*$/, '');
  return (atWord || cut).trim();
}

function noteId(text) {
  // djb2 over the normalized text — stable across retries; deliberately no
  // Date.now()/randomness so a replayed remember lands on the same id.
  const s = text.toLowerCase();
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0;
  return `mem_${h.toString(36)}`;
}

function normDoc(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const notes = Array.isArray(d.notes) ? d.notes.filter((n) => n && typeof n === 'object' && n.id && n.text) : [];
  const rev = Number.isInteger(d.rev) && d.rev >= 0 ? d.rev : 0;
  return { rev, notes };
}

export function applyRemember(doc, text, nowIso) {
  const d = normDoc(doc);
  const clean = truncateNote(text);
  const id = noteId(clean);
  const existing = d.notes.find((n) => n.id === id);
  if (existing) return { doc: d, note: existing, deduped: true };
  const note = { id, text: clean, at: String(nowIso || '') };
  const notes = [note, ...d.notes].slice(0, NOTES_CAP);
  return { doc: { rev: d.rev, notes }, note, deduped: false };
}

// Exactly ONE selector (noteId XOR note); text matches must be exact and
// unique — duplicates/ambiguity fail closed with the candidates listed.
export function applyForget(doc, selector) {
  const d = normDoc(doc);
  const { noteId: byId, note: byText } = selector || {};
  const hasId = typeof byId === 'string' && byId.trim();
  const hasText = typeof byText === 'string' && byText.trim();
  if ((hasId && hasText) || (!hasId && !hasText)) return { error: 'bad_selector' };
  let matches;
  if (hasId) matches = d.notes.filter((n) => n.id === byId.trim());
  else {
    const norm = truncateNote(byText).toLowerCase();
    matches = d.notes.filter((n) => n.text.toLowerCase() === norm);
  }
  if (matches.length === 0) return { error: 'not_found' };
  if (matches.length > 1) return { error: 'ambiguous', candidates: matches.map((n) => ({ id: n.id, text: n.text })) };
  const removed = matches[0];
  return { doc: { rev: d.rev, notes: d.notes.filter((n) => n.id !== removed.id) }, removed };
}
