#!/usr/bin/env node
// Keeps docs/WORKLOG.md under its size cap by moving the OLDEST dated changelog
// entries into docs/WORKLOG-ARCHIVE-<YYYY-MM>.md (one archive per entry month).
//
// Why a cap and not a month rollover: AGENTS.md `@`-imports docs/WORKLOG.md, so
// every agent session loads the whole file before its first prompt. The 2026-09-03
// split moved history into archives and told the reader to roll the month over —
// and September alone then grew to 1.17 MB / 116 entries / ~290k tokens inside the
// month, because a rule that fires at a month boundary says nothing about the size
// reached before it. The cap is checked by tests/worklog-size.test.mjs; when it
// fails, this script is the remedy and the failure message names it.
//
// Usage:
//   node scripts/worklog-archive.mjs            # keep the newest KEEP entries live
//   node scripts/worklog-archive.mjs --check    # print the plan, write nothing
//   node scripts/worklog-archive.mjs --keep 8   # keep a different number
//
// Guarantees, each self-checked before a byte is written:
//   • an entry's text is byte-identical after the move — the only bytes this script
//     ever adds are ONE newline between the moved block and an archive's existing
//     entries when the moved block does not already end in a blank line;
//   • head + kept + moved reconstructs the live file exactly, or nothing is written;
//   • an archive's existing entries are preserved exactly; new (newer) entries are
//     inserted above them, so every archive stays newest-first like the live log.
//
// The archives are linked from the live log and NEVER `@`-imported — that is the
// whole point, and tests/worklog-size.test.mjs asserts both.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// After a run the live log holds this many entries…
export const KEEP = 10;
// …and the test fails once it holds more than this many, or is bigger than this.
// KEEP < MAX_ENTRIES so one run always lands the file back under the cap with room
// for the next few entries (about a working week at the September 2026 pace).
export const MAX_ENTRIES = 15;
// ~62k tokens at bytes/4 — the conventions header alone is ~63 KB, so this is the
// backstop that says "the entries or the header have bloated", not the schedule.
export const MAX_BYTES = 256_000;

export const LIVE_PATH = 'docs/WORKLOG.md';
export const ARCHIVE_GLOB_DIR = 'docs';
export const ARCHIVE_PREFIX = 'WORKLOG-ARCHIVE-';

const DATED = /^### (\d{4})-(\d{2})-(\d{2})\b/;
const CHANGELOG_HEADING = '## Changelog';

/**
 * Split a worklog into its head (everything up to the first dated entry,
 * including the `## Changelog` intro) and its dated entries, in file order.
 * Throws on anything it cannot split losslessly.
 */
export function splitWorklog(text) {
  if (typeof text !== 'string') throw new Error('splitWorklog: text must be a string');
  if (text.includes('\r')) throw new Error('worklog has CR bytes; the log is LF-only and a text-mode rewrite would drift it');
  const lines = text.split('\n');
  const clIdx = lines.findIndex((l) => l === CHANGELOG_HEADING);
  if (clIdx < 0) throw new Error(`no "${CHANGELOG_HEADING}" heading found`);

  const headingIdx = [];
  for (let i = clIdx + 1; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('### ')) {
      if (!DATED.test(l)) throw new Error(`undated "### " heading under ${CHANGELOG_HEADING} at line ${i + 1}: ${l.slice(0, 80)}`);
      headingIdx.push(i);
    }
  }
  if (headingIdx.length === 0) return { head: text, entries: [] };

  // Offsets: line i starts at the sum of lengths of lines[0..i) plus i newlines.
  const starts = new Array(lines.length + 1);
  let off = 0;
  for (let i = 0; i < lines.length; i++) { starts[i] = off; off += lines[i].length + 1; }
  starts[lines.length] = off; // one past the (virtual) trailing newline

  const head = text.slice(0, starts[headingIdx[0]]);
  const entries = headingIdx.map((li, k) => {
    const from = starts[li];
    const to = k + 1 < headingIdx.length ? starts[headingIdx[k + 1]] : text.length;
    const heading = lines[li];
    const m = DATED.exec(heading);
    return {
      heading,
      date: `${m[1]}-${m[2]}-${m[3]}`,
      month: `${m[1]}-${m[2]}`,
      text: text.slice(from, to),
    };
  });

  const rebuilt = head + entries.map((e) => e.text).join('');
  if (rebuilt !== text) throw new Error('splitWorklog: head + entries does not reconstruct the file — refusing');
  return { head, entries };
}

/** Which entries stay live and which move, grouped by month in file (newest-first) order. */
export function planArchive(text, keep = KEEP) {
  if (!Number.isInteger(keep) || keep < 1) throw new Error(`keep must be a positive integer, got ${keep}`);
  const { head, entries } = splitWorklog(text);
  const kept = entries.slice(0, keep);
  const moved = entries.slice(keep);
  const groups = new Map();
  for (const e of moved) {
    if (!groups.has(e.month)) groups.set(e.month, []);
    groups.get(e.month).push(e);
  }
  return { head, entries, kept, moved, groups };
}

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export function archiveFileName(month) {
  return `${ARCHIVE_PREFIX}${month}.md`;
}

/** The header a NEW archive file opens with. `siblings` are other archive basenames to link. */
export function archiveHeader(month, siblings = []) {
  const [y, mo] = month.split('-');
  const name = `${MONTH_NAMES[Number(mo) - 1]} ${y}`;
  const links = siblings.filter((s) => s !== archiveFileName(month)).sort().reverse()
    .map((s) => `[\`${s}\`](${s})`).join(' ·\n');
  return `# Shape — changelog archive: ${month}

Dated changelog entries for **${name}**, moved out of \`docs/WORKLOG.md\` by
\`scripts/worklog-archive.mjs\`, which keeps only the newest entries live so the
auto-loaded working memory stays under the cap that \`tests/worklog-size.test.mjs\`
enforces. **Nothing is edited on the way** — each entry is byte-identical to what
it was in the live log.

⚠ **This is history, not guidance.** The live conventions — build/deploy steps,
the review stack, the stale-base rule, the architecture map — are in
[\`docs/WORKLOG.md\`](WORKLOG.md) and are the ONLY ones that bind. Where an entry
here describes a convention, a reviewer, a gate or a command, assume it is
superseded and check the live file. Entries carry their own ⚠ CORRECTED markers;
those corrections are part of the record.

⚠ **Read an entry, not the file** — \`grep -n "<term>" docs/WORKLOG-ARCHIVE-*.md\`
to find it, then \`sed -n '<start>,<end>p'\` to read only that entry. Reading a whole
archive re-pays the token tax the cap exists to remove.

**Newest first**, same as the live log.${links ? ` Sibling archives:\n${links}` : ''}

## Changelog — ${month}

`;
}

/**
 * Insert a block of entries (newest-first, all from `month`) at the TOP of the
 * archive's entries. `existing` is the archive's current text or null.
 * Returns the new text; self-checks that nothing already there moved.
 */
export function mergeIntoArchive(existing, month, block, siblings = []) {
  if (block.includes('\r')) throw new Error('block has CR bytes');
  if (existing == null) return archiveHeader(month, siblings) + block;
  if (existing.includes('\r')) throw new Error(`archive for ${month} has CR bytes; refusing to rewrite it`);
  const marker = `\n## Changelog — ${month}\n`;
  const at = existing.indexOf(marker);
  if (at < 0) throw new Error(`archive for ${month} has no "## Changelog — ${month}" heading`);
  let cut = at + marker.length;
  // Keep the blank line that follows the heading with the heading.
  if (existing[cut] === '\n') cut += 1;
  const before = existing.slice(0, cut);
  const after = existing.slice(cut);
  const sep = after.length && !block.endsWith('\n\n') ? '\n' : '';
  const out = before + block + sep + after;
  if (!out.startsWith(before) || !out.endsWith(after) || out.length !== before.length + block.length + sep.length + after.length) {
    throw new Error('mergeIntoArchive: self-check failed — refusing');
  }
  return out;
}

export function listArchives(root) {
  const dir = path.join(root, ARCHIVE_GLOB_DIR);
  return fs.readdirSync(dir).filter((f) => f.startsWith(ARCHIVE_PREFIX) && f.endsWith('.md')).sort();
}

export function main(argv = process.argv.slice(2), root = process.cwd()) {
  const check = argv.includes('--check');
  const ki = argv.indexOf('--keep');
  const keep = ki >= 0 ? Number(argv[ki + 1]) : KEEP;

  const livePath = path.join(root, LIVE_PATH);
  const text = fs.readFileSync(livePath, 'utf8');
  const plan = planArchive(text, keep);
  const fmt = (n) => `${(n / 1024).toFixed(1)} KB`;

  if (plan.moved.length === 0) {
    console.log(`worklog-archive: ${plan.entries.length} entries live (keep ${keep}) — nothing to move.`);
    return { moved: 0 };
  }

  const siblings = listArchives(root);
  const writes = [];
  for (const [month, group] of plan.groups) {
    const file = archiveFileName(month);
    const p = path.join(root, ARCHIVE_GLOB_DIR, file);
    const existing = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : null;
    const block = group.map((e) => e.text).join('');
    const all = new Set([...siblings, file]);
    writes.push({ p, file, text: mergeIntoArchive(existing, month, block, [...all]), count: group.length, created: existing == null });
  }
  const live = plan.head + plan.kept.map((e) => e.text).join('');

  console.log(`worklog-archive: ${plan.entries.length} entries live → keeping ${plan.kept.length}, moving ${plan.moved.length}`);
  console.log(`  ${LIVE_PATH}: ${fmt(Buffer.byteLength(text))} → ${fmt(Buffer.byteLength(live))}`);
  for (const w of writes) console.log(`  ${w.created ? 'create' : 'update'} docs/${w.file}: +${w.count} entries`);
  if (check) { console.log('  (--check: nothing written)'); return { moved: plan.moved.length, check: true }; }

  for (const w of writes) fs.writeFileSync(w.p, w.text);
  fs.writeFileSync(livePath, live);
  const created = writes.filter((w) => w.created).map((w) => w.file);
  if (created.length) {
    console.log(`  ⚠ new archive(s) ${created.join(', ')}: add each to the archive list in ${LIVE_PATH}'s conventions — tests/worklog-size.test.mjs fails until you do.`);
  }
  return { moved: plan.moved.length, created };
}

if (process.argv[1] && import.meta.url === pathToFileURL(fileURLToPath(new URL(process.argv[1], 'file:'))).href) {
  try { main(); } catch (e) { console.error(`worklog-archive: ${e.message}`); process.exit(1); }
}
