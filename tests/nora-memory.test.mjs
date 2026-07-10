// nora_memory doc mutations — pure CAS-side logic. node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyMemoryDoc, truncateNote, applyRemember, applyForget, NOTES_CAP, NOTE_MAX_CHARS } from '../src/lib/ai/noraMemory.mjs';

const NOW = '2026-07-10T12:00:00.000Z';

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
  const r = applyRemember({ rev: 'x', notes: [null, { id: 'mem_a', text: 'kept', at: NOW }, { bad: true }] }, 'new note', NOW);
  assert.equal(r.doc.notes.length, 2);
  assert.equal(r.doc.notes[0].text, 'new note');
  assert.equal(r.doc.notes[1].text, 'kept');
});
