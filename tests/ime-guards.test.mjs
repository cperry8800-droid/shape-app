// While an IME is composing, its Enter and Escape are its own (#2150). `isComposing` alone
// misses Safari: WebKit ends the composition BEFORE the keydown for the Enter that confirms a
// candidate, so it reads false there, and keyCode 229 is the only sign. #2150 found the tag
// picker's guard reading `isComposing` only; its open item named two more in dashBuilder.jsx,
// and the meal builder's food picker and the settings box's Enter-to-save had the same gap.
// So every keydown guard on the website that reads `isComposing` reads keyCode 229 too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const DIR = new URL('../public/newdesign/', import.meta.url);
// A guard that never sees composed text: the profile editor's tab row is buttons, which an
// IME doesn't compose into, and it acts on arrows, Home and End only.
const NO_TEXT = new Set(['livingDesktop.jsx:if (e.isComposing) return;']);

test('every isComposing guard on the website also reads Safari\'s keyCode 229', () => {
  const missing = [];
  let seen = 0;
  for (const f of readdirSync(DIR).filter((n) => /\.(jsx|js|mjs)$/.test(n))) {
    readFileSync(new URL(f, DIR), 'utf8').split('\n').forEach((line, i) => {
      if (!/\.isComposing\b/.test(line) || /^\s*\/\//.test(line)) return;
      seen += 1;
      if (/229/.test(line) || NO_TEXT.has(f + ':' + line.trim())) return;
      missing.push(f + ':' + (i + 1) + '  ' + line.trim().slice(0, 100));
    });
  }
  assert.ok(seen >= 4, 'the sweep found ' + seen + ' guards');
  assert.deepEqual(missing, []);
});

test('the builder\'s guards ask its one rule', () => {
  const src = readFileSync(new URL('dashBuilder.jsx', DIR), 'utf8');
  assert.match(src, /const dbuImeComposing = \(e\) => !!\(e && \(e\.isComposing \|\| e\.keyCode === 229\)\);/);
  // The exercise picker's search and DbuDialog's own keydown (the Escape that closes it).
  assert.match(src, /if \(dbuImeComposing\(e\.nativeEvent\)\) return;\n\s+if \(e\.key === "Escape"\) onClose\(\);/);
  assert.match(src, /const key=e=>\{if\(dbuImeComposing\(e\)\)return;if\(e\.key==='Escape'/);
  assert.equal((src.match(/\.isComposing\b/g) || []).length, 1, 'only the rule itself reads isComposing');
});
