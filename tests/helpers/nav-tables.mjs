// The shared header's nav tables, evaluated from the source that SHIPS.
//
// pageShell.jsx is a browser script (Babel in the page, precompiled at deploy),
// so it cannot be imported. Each table is a plain `const NAME = …;` statement
// with no JSX in it, so each is cut out whole and evaluated as written.
//
// ⚠ WHOLE STATEMENTS, NOT ARRAY LITERALS. The guards used to bracket-match from
// `const X = ` to the first `[` and evaluate that — which only works while every
// table is written out as a literal. The signed-in row is DERIVED now
// (`SHAPE_NAV_GROUPS.filter(…)`, owner 2026-09-23), and a guard that restated the
// derivation would be testing its own copy of it rather than the one that ships.
// Evaluating each statement in order runs the real filter against the real table.
const NAMES = ['COACHES_HREF', 'COACHES_ITEMS', 'SHAPE_NAV_GROUPS', 'SIGNED_OUT_ONLY', 'PORTAL_NAV'];

// The index just past the `;` that ends the statement starting at `from`: the
// first semicolon outside any bracket, string or comment.
function statementEnd(src, from) {
  let depth = 0;
  for (let i = from; i < src.length; i++) {
    const c = src[i];
    if (c === '"' || c === "'" || c === '`') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === '\\') i++;
    } else if (c === '/' && src[i + 1] === '/') {
      i = src.indexOf('\n', i);
      if (i === -1) break;
    } else if (c === '/' && src[i + 1] === '*') {
      i = src.indexOf('*/', i + 2) + 1;
      if (i === 0) break;
    } else if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ';' && depth === 0) return i + 1;
  }
  return -1;
}

export function statement(src, name) {
  const at = src.indexOf('const ' + name + ' = ');
  if (at === -1) throw new Error(name + ' is gone from pageShell.jsx — this guard is reading nothing');
  const end = statementEnd(src, at);
  if (end === -1) throw new Error('could not find the end of the ' + name + ' statement');
  return src.slice(at, end);
}

export function navTables(shell) {
  const body = NAMES.map((n) => statement(shell, n)).join('\n');
  return new Function(body + '\nreturn { ' + NAMES.join(', ') + ' };')();
}
