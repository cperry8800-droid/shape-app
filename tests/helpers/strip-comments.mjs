// Drop comment LINES from a source file so a rationale comment quoting the very
// token under test cannot satisfy the assertion it explains.
//
// ⚠ DELIBERATELY LINE-ORIENTED, NOT A SPANNING REGEX. The obvious
// `src.replace(/\/\*[\s\S]*?\*\//g, '')` is wrong here: shapeBackend.js contains
// `/*` inside a `//` line comment, so the lazy span ran to the next `*/` hundreds
// of lines later and ate the function the caller asserts about — a guard reporting
// on source it had silently deleted. A block comment is only treated as one when
// it OPENS a line, which is the form these files actually use.
//
// ONE implementation on purpose: this stripper shipped a real defect that only
// mutation-testing caught, and a second copy is a second chance to reintroduce it.
//
// ⚠ AND IT DID — TWICE, IN GUARDS WRITTEN AFTER THIS WARNING. Two later source
// guards kept their own lazy /* … */ span: pref-options-token swallowed 567,895
// characters of iosAppBroadsheetClient.jsx (7 false blocks, the first opening on
// `accept="image/*"`), signup-dob-persisted 383 across the bodies it asserts over.
// Mutation-proven on 2026-08-31: a local `/fat ?loss|cut|lean/` planted inside a
// swallowed span PASSED the ban with the local stripper and FAILS with this one.
// All three copies are now deleted — import this, never re-derive it.
export function stripComments(src) {
  const out = [];
  let inBlock = false;
  for (const line of String(src).replace(/<!--[\s\S]*?-->/g, '').split('\n')) {
    const t = line.trim();
    if (inBlock) {
      if (t.includes('*/')) inBlock = false;
      continue;
    }
    if (t.startsWith('/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    if (t.startsWith('//') || t.startsWith('*')) continue;
    // ⚠ A JSX COMMENT CONTAINER OPENS WITH A BRACE, so none of the line rules above
    // can see it — `{/* … */}` reached every caller as source. Measured: a guard
    // forbidding the string "No read on record" in dashWeek.jsx passed only because
    // a BROKEN local stripper was deleting that comment (along with 1,271 characters
    // of real code); swapping it for this one made the same guard fail on the
    // documentation of the rule it enforces. Handled here rather than in the caller,
    // because the whole point of this file is that there is one implementation.
    //
    // ⚠ `{/*` IS A SAFE OPENER IN A WAY THAT `/*` IS NOT. The bare form matched
    // `accept="image/*"` and ran to the next `*/` hundreds of lines later; a brace
    // immediately followed by `/*` cannot occur inside a string like that, and in JS
    // it can only ever start a comment.
    if (t.startsWith('{/*')) {
      if (!t.includes('*/')) inBlock = true;
      continue;
    }
    out.push(line);
  }
  return out.join('\n');
}
