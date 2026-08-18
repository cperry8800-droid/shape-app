import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// WHY THIS EXISTS.
//
// A regex escape written in the wrong quoting layer does not fail loudly. It
// becomes a raw control byte (BACKSPACE 0x08) or a plain letter, and the rule
// then silently matches NOTHING while parse, tsc and the whole suite stay green.
// That shipped six separate times while the Cook Mode label engine was built:
//   `\d+` in a template literal      -> every timer label fell back to clause 0
//   `\b`  in a template literal      -> ingredient ranking fell back to list order
//   `\s`  in a new RegExp string     -> the letter s, so no boundary ever matched
//   `\b`  doubled in a regex literal -> matched a literal backslash
// Each looked correct in review and did nothing at all.
//
// ⚠ The first version of this guard hand-listed three files and claimed to catch
// "the class". It did not: any other source file, including the Cook Mode client
// changed by the same commit, stayed outside it, and a new file was outside it
// by default. A guard whose headline is broader than its reach is worse than no
// guard, because it retires the worry without doing the work. It now derives its
// file list from the TRACKED source tree, so new files are covered on arrival.
const SOURCE_RE = /\.(mjs|js|jsx|ts|tsx)$/;
// Build output and VENDORED third-party bundles only. Minified vendor code
// legitimately carries control bytes inside string literals, and it is not ours
// to fix; everything we author stays in scope.
const SKIP_RE = /^(node_modules|public\/m|public\/vendor|mobile-app\/dist|\.next|android|ios)\//;

// The bytes a MIS-QUOTED escape actually produces -- backslash-zero, -a, -b,
// -v, -f. A byte outside this set (0x01 written deliberately as a sentinel, say)
// is a choice, not a botched regex, so flagging it would be noise -- and noise is
// how a guard gets muted. Tab, LF and CR are legal source characters.
//
// (This comment names those escapes in WORDS on purpose: the first draft spelled
//  them literally and the guard caught its own file. Which is the demonstration.)
const ESCAPE_BYTES = new Set([0x00, 0x07, 0x08, 0x0b, 0x0c]);

const trackedSources = () =>
  execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean)
    .filter((f) => SOURCE_RE.test(f) && !SKIP_RE.test(f));

test('no tracked source file carries a raw control byte from a botched escape', () => {
  const files = trackedSources();
  // Guard the guard: an empty list would pass vacuously and look like success.
  assert.ok(files.length > 200, `expected the tracked source tree, got ${files.length} files`);
  const offenders = [];
  for (const rel of files) {
    let src;
    try {
      src = readFileSync(join(ROOT, rel), 'utf8');
    } catch {
      continue; // deleted-but-tracked in a dirty tree; not this test's business
    }
    for (let i = 0; i < src.length; i++) {
      if (ESCAPE_BYTES.has(src.charCodeAt(i))) {
        const code = src.charCodeAt(i);
        offenders.push(`${rel}:${src.slice(0, i).split('\n').length} → 0x${code.toString(16).padStart(2, '0')}`);
        break;
      }
    }
  }
  assert.deepEqual(offenders, [], `control bytes found (mis-escaped regex, not real characters):\n  ${offenders.join('\n  ')}`);
});
