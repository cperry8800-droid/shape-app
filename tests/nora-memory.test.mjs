// nora_memory doc mutations — pure CAS-side logic. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMemoryDoc, truncateNote, applyRemember, applyForget, NOTES_CAP, NOTE_MAX_CHARS } from '../src/lib/ai/noraMemory.mjs';

const NOW = '2026-07-10T12:00:00.000Z';

test('whitespace-only remember is rejected before the id/CAS path', () => {
  assert.equal(applyRemember(emptyMemoryDoc(), '   ', NOW).error, 'empty_note');
  assert.equal(applyRemember(emptyMemoryDoc(), null, NOW).error, 'empty_note');
});

test('remember adds newest-first with a stable id; identical text dedupes', () => {
  const a = applyRemember(emptyMemoryDoc(), 'hates burpees', NOW);
  assert.equal(a.doc.notes.length, 1);
  assert.ok(a.note.id.startsWith('mem_'));
  const b = applyRemember(a.doc, 'prefers mornings', NOW);
  assert.equal(b.doc.notes[0].text, 'prefers mornings'); // newest first
  const c = applyRemember(b.doc, 'hates burpees', NOW);
  assert.equal(c.deduped, true);
  assert.equal(c.doc.notes.length, 2);
  assert.equal(c.note.id, a.note.id); // stable id — the retry/audit-repair key
});

test('notes truncate at a word boundary at 280 chars and the cap drops the oldest', () => {
  const long = 'word '.repeat(100);
  const t = truncateNote(long);
  assert.ok(t.length <= NOTE_MAX_CHARS);
  assert.ok(!/\s$/.test(t) && !t.endsWith('wor'));
  // A single unbroken token longer than the cap: hard-cut (no word boundary
  // exists), never empty, never over the cap, no trailing whitespace.
  const unbroken = truncateNote('x'.repeat(NOTE_MAX_CHARS + 40));
  assert.equal(unbroken.length, NOTE_MAX_CHARS);
  assert.ok(!/\s$/.test(unbroken));
  let doc = emptyMemoryDoc();
  for (let i = 0; i < NOTES_CAP + 5; i++) doc = applyRemember(doc, `note number ${i}`, NOW).doc;
  assert.equal(doc.notes.length, NOTES_CAP);
  assert.equal(doc.notes[0].text, `note number ${NOTES_CAP + 4}`);
  assert.ok(!doc.notes.some((n) => n.text === 'note number 0')); // oldest gone
});

test('forget: exactly one selector; by id; by exact single text; partial text never matches', () => {
  let doc = emptyMemoryDoc();
  doc = applyRemember(doc, 'call me Chris', NOW).doc;
  const kept = applyRemember(doc, 'hates burpees', NOW);
  doc = kept.doc;
  assert.equal(applyForget(doc, {}).error, 'bad_selector');
  assert.equal(applyForget(doc, { noteId: 'x', note: 'y' }).error, 'bad_selector');
  assert.equal(applyForget(doc, { noteId: 'mem_nope' }).error, 'not_found');
  const byId = applyForget(doc, { noteId: kept.note.id });
  assert.equal(byId.removed.text, 'hates burpees');
  assert.equal(byId.doc.notes.length, 1);
  const byText = applyForget(doc, { note: 'call me Chris' });
  assert.equal(byText.removed.text, 'call me Chris');
  assert.equal(applyForget(doc, { note: 'call me' }).error, 'not_found'); // partial ≠ exact
});

test('a malformed stored doc normalizes instead of crashing', () => {
  const r = applyRemember({ rev: 'x', notes: [null, { id: 'mem_a', text: 'kept', at: NOW }, { bad: true }, { id: 'mem_b', text: 123 }, { id: 77, text: 'no string id' }] }, 'new note', NOW);
  assert.equal(r.doc.notes.length, 2); // non-string text + non-string id both dropped
  assert.equal(r.doc.notes[0].text, 'new note');
  assert.equal(r.doc.notes[1].text, 'kept');
  // forget over the same malformed doc never throws (toLowerCase on a number)
  assert.equal(applyForget({ notes: [{ id: 'mem_b', text: 123 }] }, { note: 'anything' }).error, 'not_found');
  // an over-cap stored list is capped at normalization, even on a dedupe pass
  const big = { rev: 1, notes: Array.from({ length: NOTES_CAP + 8 }, (_, i) => ({ id: `mem_x${i}`, text: `stored ${i}`, at: NOW })) };
  const dedupe = applyRemember(big, 'stored 0', NOW); // hits no id (different hash) → adds, still capped
  assert.ok(dedupe.doc.notes.length <= NOTES_CAP);
});

test('an overlong forget selector never matches a shorter stored note', () => {
  let doc = emptyMemoryDoc();
  doc = applyRemember(doc, 'word '.repeat(100), NOW).doc; // stored TRUNCATED at 280
  const truncatedStored = doc.notes[0].text;
  // The full (untruncated) original text is NOT an exact match for the stored
  // truncation — the selector must not be truncated into a false match.
  const r = applyForget(doc, { note: 'word '.repeat(100) });
  assert.equal(r.error, 'not_found');
  // The exact stored text still deletes.
  assert.equal(applyForget(doc, { note: truncatedStored }).removed.text, truncatedStored);
});
