// The Chat sub-row auto-hide, and the loop it used to drive.
//
// ⚠ WHAT THIS IS ABOUT. The row sits above the viewport once you have scrolled,
// so collapsing it shortens the content above and the browser moves scrollTop to
// compensate. That compensation arrives at the scroll handler as a delta with the
// OPPOSITE sign, flips the row back, and moves scrollTop again. Measured in
// Chromium before the fix: scrollHeight oscillating over a 36px range with no
// user input, on the Wall AND on the untouched Client chip — the feed visibly
// vibrating. The fix is that a toggle arms a short deadline and scrolls arriving
// inside it only re-baseline the reference point.
//
// ⚠ AND THIS GUARD ASSERTS THE INVARIANT, NOT THE SPELLING. It does not pin 420,
// or Date.now, or the shape of the comparison — a rewrite that still routes every
// toggle through the arming helper and still declines to decide mid-settle passes.
// What it refuses is the two shapes that measurably bring the vibration back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const SRC = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');

// Brace-match a function body from its opening paren, skipping the parameter
// list. ⚠ Counting braces from the NAME lands on a destructured parameter and
// returns the signature — a 47-character string every later assertion is then
// vacuously true about. This repo has paid for that twice.
function body(src, marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `marker not found: ${marker}`);
  const open = src.indexOf('{', src.indexOf(')', at));
  assert.notEqual(open, -1, `no body after ${marker}`);
  let d = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') d++;
    else if (src[i] === '}' && --d === 0) return src.slice(open, i + 1);
  }
  throw new Error(`unbalanced body for ${marker}`);
}

test('the scroll handler never flips the row directly — every toggle arms the settle window', () => {
  const anchor = body(SRC, 'const bsSubAnchorRef = React.useCallback(');
  assert.ok(anchor.length > 400, `handler body looks truncated (${anchor.length} chars)`);
  // The whole defect is a scroll event deciding on a delta the collapse caused.
  // Calling the raw setter from here bypasses the arming helper and restores it.
  assert.ok(!/setSubHidden\s*\(/.test(anchor),
    'the scroll handler must route toggles through bsSetSub, not call setSubHidden directly');
  assert.ok(/bsSetSub\s*\(/.test(anchor), 'the scroll handler still drives the row');
  // And it must decline to decide while our own collapse is settling.
  assert.ok(/lockUntil/.test(anchor),
    'the scroll handler must consult the settle deadline before reading a delta');
});

test('the toggle arms a FUTURE deadline, so the compensation scroll cannot decide', () => {
  const setter = body(SRC, 'const bsSetSub = React.useCallback(');
  assert.ok(setter.length > 80, `bsSetSub body looks truncated (${setter.length} chars)`);
  assert.ok(/setSubHidden\s*\(/.test(setter), 'bsSetSub is the one place that moves the state');
  // A deadline armed to 0 (or to now) is no deadline — that mutation measurably
  // brought the 36px oscillation back on both sub-tabs.
  assert.match(setter, /lockUntil\s*=\s*[^;]*\+\s*\d+/,
    'bsSetSub must push the deadline into the future, not set it to a constant');
});

test('switching main tabs reveals the row through the guarded setter', () => {
  // ⚠ THIS TEST USED TO ASSERT THE DEFECT. It required the effect to set
  // `lockUntil = 0`, which is precisely what makes the reveal unsafe: switching
  // to another sub-row-bearing tab while the row is hidden EXPANDS it, the
  // browser raises scrollTop to compensate for content growing above the
  // viewport, the handler reads that as dy > 6 and hides the new tab's row
  // before it has been seen. Clearing the deadline removed the only thing
  // standing in the way, so a correct fix FAILED a test about something else.
  // (Codex, #2043.) The invariant is that the effect does not decide for
  // itself — it goes through the setter that arms the window.
  // ⚠ A REGEX CANNOT DELIMIT THIS, AND THE FIRST TWO ATTEMPTS PROVED IT. Three
  // effects in this file carry a `[tab...]` dep list; a lazy `[\s\S]*?` does not
  // stop at the effect's own closing brace, it runs to the NEXT `}, [tab` found
  // anywhere in 19k lines — the three matches measured 28KB, 1MB and 395KB, and
  // every assertion against them was about unrelated code. Paren-match instead,
  // then select by what the effect TOUCHES rather than by where it sits.
  const effects = [];
  for (let i = SRC.indexOf('React.useEffect('); i >= 0; i = SRC.indexOf('React.useEffect(', i + 1)) {
    let d = 0;
    for (let k = SRC.indexOf('(', i); k < SRC.length; k++) {
      if (SRC[k] === '(') d++;
      else if (SRC[k] === ')') { d--; if (d === 0) { effects.push(SRC.slice(i, k + 1)); break; } }
    }
  }
  assert.ok(effects.length > 100, `the effect extractor found only ${effects.length} — it is not reading the module`);
  const m = effects.filter((b) => b.includes('bsScroll.current'));
  assert.equal(m.length, 1,
    `expected exactly one effect touching the scroll guard, found ${m.length}`);
  assert.match(m[0], /\}, \[tab[^\]]*\]\)$/, 'the scroll-guard effect is no longer keyed on the tab');
  assert.match(m[0], /bsSetSub\(false\)/, 'the reveal must go through the guarded setter');
  assert.equal(/lockUntil\s*=\s*0/.test(m[0]), false,
    'the tab effect clears the settle deadline — the reveal can be undone by its own layout move');
  assert.match(m[0], /st\.last\s*=\s*st\.sc\.scrollTop/,
    'the scroll reference is not re-baselined, so the first scroll after a switch measures from the old tab');
  // and nothing else may write the mirror behind the setter's back
  assert.equal(/st\.hidden\s*=\s*(true|false)/.test(m[0]), false,
    'the tab effect writes the ref mirror directly instead of through bsSetSub');
});
