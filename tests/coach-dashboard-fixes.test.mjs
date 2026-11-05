// Small correctness fixes on the coach dashboard's website pages (2026-11-05), each driven on the
// shipping source: a function lifted out of its file and run, or the page compiled and rendered.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = (rel) => readFileSync(join(ROOT, rel), 'utf8');
// One top-level function out of a website file, by its name, up to the next top-level declaration.
function lift(rel, name) {
  const text = source(rel);
  const at = text.indexOf('function ' + name + '(');
  assert.ok(at >= 0, `${rel} has no function ${name}`);
  const rest = text.slice(at);
  const end = rest.search(/\n(?:function |const |let |var |\/\/ ──)/);
  return end > 0 ? rest.slice(0, end) : rest;
}

// ── 3. The builder's playlist picker reads `tracks` ─────────────────────────
test('the day\'s playlist picker counts a playlist\'s tracks from the column that holds them', () => {
  const choice = new Function(lift('public/newdesign/dashBuilder.jsx', 'dbuPlaylistChoice') + '\nreturn dbuPlaylistChoice;')();
  assert.deepEqual(choice({ name: 'Leg day', tracks: 28 }), { name: 'Leg day', meta: '28 tracks' });
  assert.deepEqual(choice({ name: 'One', tracks: 1 }), { name: 'One', meta: '1 track' });
  assert.deepEqual(choice({ name: 'Empty', tracks: 0 }), { name: 'Empty', meta: '' });
  assert.deepEqual(choice({ name: 'Old', track_count: 12 }), { name: 'Old', meta: '' }, 'no row has track_count');
  assert.doesNotMatch(source('public/newdesign/dashBuilder.jsx'), /\.track_count\b/);
});
