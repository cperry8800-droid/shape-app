// Every `@media (max-width: Npx) {` block in a source, brace-matched.
//
// ONE copy, because two suites read the same stylesheet this way and their copies
// had drifted (CodeRabbit, on #2158): one matched the query with ` ?` and the
// other with `\s*`, one kept the `@media` header in the body and the other did
// not, and on an unbalanced block one returned the rest of the file as the body
// (`slice(start, -1)`) while the other ran to the end. Two guards reading one
// stylesheet two ways can disagree about it; a fix in one copy would not reach
// the other.
//
// A block that never closes THROWS. Returning "the rest of the file" instead
// hands a guard every later rule as if it sat inside this query — the defect the
// brace-matching was written to stop in the first place.
export function mediaBlocks(src) {
  return [...src.matchAll(/@media \(max-width:\s*(\d+)px\)\s*\{/g)].map((m) => {
    let depth = 0, end = -1;
    for (let i = m.index + m[0].length - 1; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}' && --depth === 0) { end = i; break; }
    }
    if (end < 0) throw new Error('unbalanced `@media (max-width: ' + m[1] + 'px)` block at offset ' + m.index);
    return {
      offset: m.index,                              // where it sits in the source (for order)
      width: Number(m[1]),                          // its max-width, in px
      block: src.slice(m.index, end),               // the `@media` header and the body
      body: src.slice(m.index + m[0].length, end),  // the body alone
    };
  });
}
