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

test('switching main tabs re-baselines the guard as well as the state', () => {
  // The reveal-on-tab-change effect resets React state; if it leaves the ref
  // mirror stale, the next toggle compares against the wrong value and silently
  // does nothing.
  const m = SRC.match(/React\.useEffect\(\(\) => \{[^}]*setSubHidden\(false\);[^}]*\}, \[tab\]\);/);
  assert.ok(m, 'the tab-change reveal effect is still present');
  assert.match(m[0], /hidden = false/, 'it must clear the ref mirror too');
  assert.match(m[0], /lockUntil = 0/, 'and drop any armed deadline');
});
