// No unresolved merge-conflict markers in any tracked file.
//
// ⚠ THIS EXISTS BECAUSE A SET OF THEM REACHED `main`. A merge commit resolved two of
// three conflicted files, `git add -A` staged the third with its markers intact, and
// `SKIP_VERIFY=1` (set because the merge was mostly records) skipped the hook. The file
// was `docs/REVIEW-2026-09-09-website-dashboard.md` — and NOTHING in the repo could have
// caught it: the pre-commit hook skips the code gates for a docs-only change, no test
// parses that file, and CI does not lint markdown. It sat on `main` through a squash
// merge and was found two PRs later, by a later merge conflicting ON the markers.
//
// The lesson is not "resolve your conflicts". It is that the gates were all scoped to
// CODE, and a conflict marker is a defect in any file — a table with three rows of
// `<<<<<<< HEAD` in it is wrong in exactly the way a broken build is wrong, and the
// records are what the next session reads before it does anything.
//
// So this runs over EVERY tracked file, and it runs in CI, where `SKIP_VERIFY=1` cannot
// reach it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ⚠ THE MARKER SHAPE IS THE THREE-PART ONE, NOT ANY ONE LINE. A bare `=======` at the
// start of a line is a setext `<h1>` underline in Markdown and appears legitimately, and
// `>>>>>>>` can be a quoted shell prompt in a code fence. What is never legitimate is the
// FULL set in one file: an opener, a separator and a closer, in that order.
const OPEN = /^<<<<<<< /m;
const SEP = /^=======\r?$/m;
const CLOSE = /^>>>>>>> /m;

function trackedFiles() {
  const out = execFileSync('git', ['-C', ROOT, 'ls-files', '-z'], { maxBuffer: 1 << 28 }).toString();
  return out.split('\0').filter(Boolean);
}

test('no tracked file carries an unresolved merge conflict', () => {
  const files = trackedFiles();
  // ⚠ AND IT ASSERTS IT SCANNED A CORPUS. A sweep that silently walks zero files passes,
  // which is the failure mode of every sweep ever written.
  assert.ok(files.length > 500, 'expected the repo, scanned ' + files.length + ' files');

  const bad = [];
  let scanned = 0;
  for (const rel of files) {
    const abs = path.join(ROOT, rel);
    let st;
    try { st = statSync(abs); } catch { continue; }   // a submodule or a deleted-but-tracked path
    if (!st.isFile() || st.size > 8 * 1024 * 1024) continue;
    let text;
    try { text = readFileSync(abs, 'utf8'); } catch { continue; }
    if (text.indexOf('\0') >= 0) continue;            // binary
    scanned++;
    // This file names the markers in its own prose, so it describes them rather than
    // containing them — the opener below is split so this test cannot fail on itself.
    if (rel === 'tests/no-conflict-markers.test.mjs') continue;
    if (OPEN.test(text) && SEP.test(text) && CLOSE.test(text)) {
      const line = text.split('\n').findIndex((l) => /^<<<<<<< /.test(l)) + 1;
      bad.push(rel + ':' + line);
    }
  }
  assert.ok(scanned > 500, 'read only ' + scanned + ' of ' + files.length + ' tracked files');
  assert.deepEqual(bad, [], 'unresolved merge conflict markers in:\n  ' + bad.join('\n  '));
});
