// docs/WORKLOG.md is `@`-imported by AGENTS.md, so every session loads it before its
// first prompt. Since 2026-10-16 it holds only the current rules, the code map and the
// open items; the PR description is the record of what shipped. A session that started
// before the change, or works from an older plan, will still try to add a dated entry,
// so this guard says what to do instead.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const live = read('docs/WORKLOG.md');
const MAX_BYTES = 20 * 1024;

test('the worklog has no changelog', () => {
  const dated = live.split('\n').filter((l) => /^#{2,4} \d{4}-\d{2}-\d{2}/.test(l));
  assert.deepEqual(dated, [], 'docs/WORKLOG.md has no dated entries since 2026-10-16: write what shipped in the PR description, and put anything left open under "Open items"');
  assert.ok(!/^## Changelog/m.test(live), 'docs/WORKLOG.md has no "## Changelog" section since 2026-10-16: the PR description is the record');
});

test('the worklog stays short', () => {
  const bytes = Buffer.byteLength(live);
  assert.ok(bytes <= MAX_BYTES, `docs/WORKLOG.md is ${bytes} bytes (cap ${MAX_BYTES}); every session loads it, so replace an old rule instead of adding a correction under it`);
});

test('AGENTS.md loads the worklog and asks for no dated entries', () => {
  const agents = read('AGENTS.md');
  assert.match(agents, /^@docs\/WORKLOG\.md$/m, 'AGENTS.md must @-import docs/WORKLOG.md');
  assert.doesNotMatch(agents, /append a dated entry/i, 'AGENTS.md must not ask for dated changelog entries');
});

test('every archive the worklog links exists', () => {
  const links = [...live.matchAll(/\]\((WORKLOG-ARCHIVE-[^)]+\.md)\)/g)].map((m) => m[1]);
  assert.ok(links.length >= 6, 'the History section lists the archives');
  for (const f of links) assert.ok(fs.existsSync(path.join(root, 'docs', f)), `docs/${f} is linked from docs/WORKLOG.md but does not exist`);
});
