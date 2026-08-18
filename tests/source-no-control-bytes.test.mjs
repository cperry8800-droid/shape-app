import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

// WHY THIS EXISTS.
//
// A regex written as `\b` or `\s` inside the WRONG quoting layer does not fail
// loudly -- it becomes a raw control byte (BACKSPACE 0x08) or a plain letter,
// and the regex then silently matches nothing while parse, tsc and the entire
// suite stay green. That exact mistake shipped six separate times while this
// module was being built, each one a rule that appeared to work and did nothing:
//   `\d+` in a template literal   -> every timer label fell back to clause 0
//   `\b` in a template literal    -> ingredient ranking fell back to recipe order
//   `\s` in a new RegExp string   -> the letter s, so no boundary matched
//   `\b` in a regex literal, doubled -> matched a literal backslash
// A control byte in source is never intentional here, so this is cheap to assert
// and catches the whole class rather than the last instance of it.
const FILES = [
  'mobile-app/src/services/cookable.mjs',
  'mobile-app/src/services/cookOrchestrator.mjs',
  'mobile-app/src/services/mealPrep.mjs',
];

test('no source file carries a raw control byte from a botched escape', () => {
  for (const rel of FILES) {
    const src = readFileSync(join(ROOT, rel), 'utf8');
    for (let i = 0; i < src.length; i++) {
      const code = src.charCodeAt(i);
      // Tab, LF and CR are the only control characters legal in this source.
      if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
        const line = src.slice(0, i).split('\n').length;
        assert.fail(`${rel}:${line} carries control byte 0x${code.toString(16).padStart(2, '0')} — a mis-escaped regex, not a real character`);
      }
    }
  }
});
