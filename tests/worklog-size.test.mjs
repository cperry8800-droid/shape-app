// docs/WORKLOG.md is `@`-imported by AGENTS.md, so every agent session loads it
// before its first prompt. Measured 2026-09-29: the month-rollover rule from the
// 2026-09-03 split had let September alone reach 1.17 MB / 116 entries / ~290k
// tokens. This guard caps the live file; scripts/worklog-archive.mjs is the remedy
// and every failure message below names it.
//
// It also pins the properties the cap depends on: entries are dated (so the
// script can count and move them), archives are linked from the live log (so a
// moved entry stays findable) and never `@`-imported (so the tax cannot come back
// through the side door), and no entry exists in two places at once.
//
// The second half drives the script's pure functions on fixtures — the move is
// only safe because head + kept + moved reconstructs the file byte for byte, and
// that is a claim about the code, not about today's file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {
  KEEP, MAX_ENTRIES, MAX_BYTES, LIVE_PATH, ARCHIVE_PREFIX,
  splitWorklog, planArchive, mergeIntoArchive, archiveHeader, archiveFileName, listArchives,
} from '../scripts/worklog-archive.mjs';

const ROOT = path.resolve(import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname), '..');
const LIVE = path.join(ROOT, LIVE_PATH);
const REMEDY = 'run `node scripts/worklog-archive.mjs` (moves the oldest entries into the dated archives, byte-identical) and commit the result';

const live = fs.readFileSync(LIVE, 'utf8');
const split = splitWorklog(live);
const archives = listArchives(ROOT);

test('the live worklog is under the byte cap', () => {
  const bytes = fs.statSync(LIVE).size;
  assert.ok(bytes <= MAX_BYTES, `${LIVE_PATH} is ${bytes} bytes (~${Math.round(bytes / 4 / 1000)}k tokens) against a cap of ${MAX_BYTES} — ${REMEDY}. If the ENTRIES are already within count, the conventions header itself has grown and needs trimming.`);
});

test('the live changelog holds at most MAX_ENTRIES dated entries', () => {
  assert.ok(split.entries.length >= 1, 'the live changelog has no dated entries — the parse stopped matching or the log was emptied');
  assert.ok(split.entries.length <= MAX_ENTRIES, `${split.entries.length} entries live against a cap of ${MAX_ENTRIES} — ${REMEDY}`);
});

test('the cap constants leave room: one archive run lands well under the cap', () => {
  assert.ok(Number.isInteger(KEEP) && KEEP >= 1, 'KEEP must be a positive integer');
  assert.ok(KEEP < MAX_ENTRIES, `KEEP (${KEEP}) must be below MAX_ENTRIES (${MAX_ENTRIES}) or the test fails again on the very next entry`);
  // The conventions head has to fit under the byte cap with the kept entries, or the
  // remedy cannot succeed. Measured against today's head so a header that outgrows
  // the cap is reported here rather than as an unfixable byte-cap failure.
  const headBytes = Buffer.byteLength(split.head);
  assert.ok(headBytes < MAX_BYTES * 0.5, `the conventions head alone is ${headBytes} bytes — more than half the cap; trim the head, the archive script cannot help`);
});

test('every "### " heading under ## Changelog is a dated entry, newest first', () => {
  // splitWorklog throws on an undated heading; reaching here proves the shape.
  const dates = split.entries.map((e) => e.date);
  for (let i = 1; i < dates.length; i++) {
    assert.ok(dates[i] <= dates[i - 1], `entry ${i + 1} (${dates[i]}) is dated after entry ${i} (${dates[i - 1]}) — entries are appended at the TOP, newest first`);
  }
});

test('the live log is LF-only (the archive move is a text rewrite and would drift CRLF)', () => {
  assert.equal(live.includes('\r'), false, `${LIVE_PATH} carries CR bytes`);
});

test('every archive on disk is linked from the live log', () => {
  assert.ok(archives.length >= 1, 'no docs/WORKLOG-ARCHIVE-*.md found — the glob stopped matching');
  for (const f of archives) {
    assert.ok(live.includes(`](${f})`), `docs/${f} exists but the live log does not link it — add it to the archive list in the conventions so moved entries stay findable`);
  }
});

test('no archive is @-imported by AGENTS.md or CLAUDE.md', () => {
  for (const f of ['AGENTS.md', 'CLAUDE.md']) {
    const t = fs.readFileSync(path.join(ROOT, f), 'utf8');
    const imports = t.split('\n').filter((l) => l.startsWith('@'));
    assert.ok(imports.length >= 1 || f === 'CLAUDE.md', `${f} has no @-imports at all — the auto-load chain changed; re-check this guard`);
    for (const l of imports) {
      assert.ok(!l.includes(ARCHIVE_PREFIX), `${f} @-imports an archive (${l}) — that re-imposes the token tax the cap removes`);
    }
  }
});

test('no dated entry exists in both the live log and an archive', () => {
  const liveHeads = new Set(split.entries.map((e) => e.heading));
  for (const f of archives) {
    const t = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
    for (const l of t.split('\n')) {
      if (l.startsWith('### ') && liveHeads.has(l)) assert.fail(`"${l.slice(0, 90)}" is in both ${LIVE_PATH} and docs/${f}`);
    }
  }
});

test('each archive holds only entries of its own month', () => {
  for (const f of archives) {
    const m = /^WORKLOG-ARCHIVE-(\d{4}-\d{2})\.md$/.exec(f);
    if (!m) continue; // the early-June cycles archive and the 06-07 span predate the one-month rule
    const t = fs.readFileSync(path.join(ROOT, 'docs', f), 'utf8');
    for (const l of t.split('\n')) {
      const d = /^### (\d{4}-\d{2})-\d{2}\b/.exec(l);
      if (d) assert.equal(d[1], m[1], `docs/${f} holds an entry from ${d[1]}: "${l.slice(0, 80)}"`);
    }
  }
});

// ── The script's own rules, driven on fixtures ────────────────────────────────

const FIX = `# Log

- convention one
- convention two

## Open work

### Next up (planned)
- thing

## Changelog

**Intro line.** Links: [x](WORKLOG-ARCHIVE-2026-08.md).

### 2026-09-29 — Newest

- a
- b

### 2026-09-23 — Second

- c

### 2026-08-31 — Third, last month

- d
- e

### 2026-08-30 — Oldest, no trailing blank line
- f
`;

test('splitWorklog reconstructs the file byte for byte and keeps the intro with the head', () => {
  const { head, entries } = splitWorklog(FIX);
  assert.equal(head + entries.map((e) => e.text).join(''), FIX);
  assert.ok(head.endsWith('[x](WORKLOG-ARCHIVE-2026-08.md).\n\n'), 'the ## Changelog intro belongs to the head, not to the first entry');
  assert.deepEqual(entries.map((e) => e.date), ['2026-09-29', '2026-09-23', '2026-08-31', '2026-08-30']);
  assert.deepEqual(entries.map((e) => e.month), ['2026-09', '2026-09', '2026-08', '2026-08']);
  assert.equal(entries[3].text, '### 2026-08-30 — Oldest, no trailing blank line\n- f\n', 'the EOF entry runs to the end of the file exactly');
  assert.equal(entries[0].text, '### 2026-09-29 — Newest\n\n- a\n- b\n\n', 'an entry owns the blank line that separates it from the next');
  // The undated "### Next up" ABOVE ## Changelog is not an entry.
  assert.equal(entries.length, 4);
});

test('planArchive keeps the newest N and groups the rest by month, in order', () => {
  const p = planArchive(FIX, 1);
  assert.deepEqual(p.kept.map((e) => e.date), ['2026-09-29']);
  assert.deepEqual(p.moved.map((e) => e.date), ['2026-09-23', '2026-08-31', '2026-08-30']);
  assert.deepEqual([...p.groups.keys()], ['2026-09', '2026-08']);
  assert.deepEqual(p.groups.get('2026-08').map((e) => e.date), ['2026-08-31', '2026-08-30']);
  // keep ≥ entries → nothing moves; the live file would be rewritten identically.
  const none = planArchive(FIX, 10);
  assert.equal(none.moved.length, 0);
  assert.equal(none.head + none.kept.map((e) => e.text).join(''), FIX);
});

test('splitWorklog refuses what it cannot move losslessly', () => {
  assert.throws(() => splitWorklog(FIX.replace('\n', '\r\n')), /CR bytes/);
  assert.throws(() => splitWorklog(FIX.replace('### 2026-09-23 — Second', '### Second, undated')), /undated/);
  assert.throws(() => splitWorklog(FIX.replace('## Changelog', '## Change log')), /no "## Changelog"/);
  assert.throws(() => planArchive(FIX, 0), /positive integer/);
});

test('mergeIntoArchive creates a headed archive, then inserts newer blocks ABOVE existing entries, byte-preserving', () => {
  const p = planArchive(FIX, 1);
  const aug = p.groups.get('2026-08').map((e) => e.text).join('');
  const created = mergeIntoArchive(null, '2026-08', aug, ['WORKLOG-ARCHIVE-2026-06-07.md']);
  assert.ok(created.startsWith('# Shape — changelog archive: 2026-08\n'));
  assert.ok(created.includes('**August 2026**'));
  assert.ok(created.includes('[`WORKLOG-ARCHIVE-2026-06-07.md`](WORKLOG-ARCHIVE-2026-06-07.md)'), 'siblings are linked');
  assert.ok(!created.includes('](WORKLOG-ARCHIVE-2026-08.md)'), 'an archive does not link itself');
  assert.ok(created.endsWith('## Changelog — 2026-08\n\n' + aug), 'the block sits directly under the month heading');

  // A later run moves a NEWER August entry (dated after both); it must land on top,
  // and the existing entries must be untouched. The block here ends without a blank
  // line, so exactly one newline is added as the separator.
  const newer = '### 2026-08-31 — Later find\n- z\n';
  const merged = mergeIntoArchive(created, '2026-08', newer, []);
  const afterHeading = merged.slice(merged.indexOf('## Changelog — 2026-08\n\n') + '## Changelog — 2026-08\n\n'.length);
  assert.ok(afterHeading.startsWith(newer + '\n' + aug), 'newer block first, one separator newline, then the original block byte for byte');
  assert.equal(merged.length, created.length + newer.length + 1);

  // A block that already ends in a blank line gets no separator.
  const withBlank = '### 2026-08-31 — Later find\n- z\n\n';
  const merged2 = mergeIntoArchive(created, '2026-08', withBlank, []);
  assert.equal(merged2.length, created.length + withBlank.length);

  assert.throws(() => mergeIntoArchive('# no heading here\n', '2026-08', aug), /no "## Changelog — 2026-08"/);
  assert.throws(() => mergeIntoArchive(created.replace('\n', '\r\n'), '2026-08', aug), /CR bytes/);
});

test('archive file names and headers agree on the month', () => {
  assert.equal(archiveFileName('2026-09'), 'WORKLOG-ARCHIVE-2026-09.md');
  assert.ok(archiveHeader('2026-09').includes('**September 2026**'));
  assert.ok(archiveHeader('2026-01').includes('**January 2026**'));
});
