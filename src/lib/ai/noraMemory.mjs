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
  // Two independent 32-bit hashes (djb2 + sdbm) + the text length — ~64 bits of
  // id space over ≤30 notes, so an id collision between DIFFERENT texts is
  // effectively impossible (it would need equal lengths AND a double-hash
  // collision). Stable across retries — deliberately no Date.now()/randomness —
  // so a replayed remember lands on the same id.
  const s = text.toLowerCase();
  let h1 = 5381;
  let h2 = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = ((h1 * 33) ^ c) >>> 0;
    h2 = (c + (h2 << 6) + (h2 << 16) - h2) >>> 0;
  }
  return `mem_${h1.toString(36)}${h2.toString(36)}${s.length.toString(36)}`;
}

// Normalize a persisted doc to the schema: string id + string text only, each
// record copied clean, capped to NOTES_CAP — a malformed stored blob can never
// crash a mutation (`toLowerCase` on a number) or carry an over-cap list
// forward. Exported: the mobile Settings mirror uses THIS normalizer so the
// doc semantics have exactly one implementation.
export function normalizeMemoryDoc(doc) {
  const d = doc && typeof doc === 'object' ? doc : {};
  const notes = (Array.isArray(d.notes) ? d.notes : [])
    .filter((n) => n && typeof n === 'object' && typeof n.id === 'string' && n.id && typeof n.text === 'string' && n.text)
    .map((n) => ({ id: n.id, text: n.text, at: typeof n.at === 'string' ? n.at : '' }))
    .slice(0, NOTES_CAP);
  const rev = Number.isInteger(d.rev) && d.rev >= 0 ? d.rev : 0;
  return { rev, notes };
}
const normDoc = normalizeMemoryDoc;

export function applyRemember(doc, text, nowIso) {
  const d = normDoc(doc);
  const clean = truncateNote(text);
  // Whitespace-only input must never mint an empty note (with a stable
  // empty-string id) — reject before the id/dedupe/CAS path.
  if (!clean) return { error: 'empty_note' };
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
    // Whitespace-normalize but NEVER truncate the selector — a truncated
    // overlong selector could exactly match a shorter stored note and delete
    // something the member didn't name. Stored notes are all ≤ NOTE_MAX_CHARS,
    // so an overlong selector simply matches nothing.
    const norm = String(byText).replace(/\s+/g, ' ').trim().toLowerCase();
    matches = d.notes.filter((n) => n.text.toLowerCase() === norm);
  }
  if (matches.length === 0) return { error: 'not_found' };
  if (matches.length > 1) return { error: 'ambiguous', candidates: matches.map((n) => ({ id: n.id, text: n.text })) };
  const removed = matches[0];
  return { doc: { rev: d.rev, notes: d.notes.filter((n) => n.id !== removed.id) }, removed };
}
