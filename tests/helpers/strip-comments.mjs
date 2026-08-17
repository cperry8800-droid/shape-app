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
    out.push(line);
  }
  return out.join('\n');
}
