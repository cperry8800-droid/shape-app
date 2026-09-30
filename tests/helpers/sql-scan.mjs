// A PostgreSQL lexer and top-level statement splitter for the migration models.
//
// WHY A LEXER AND NOT A REGEX PASS. The earlier per-file regex models stripped comments,
// then matched keywords across the whole text, and were wrong in both directions: a `drop
// function` later in a file deleted a function the file had recreated after it, and prose
// inside a comment or a string read as a statement. Every one of those defects is a
// question of WHICH CONSTRUCT OPENED FIRST, and only a scan that walks left to right and
// lets the first opener win answers it the way Postgres does. The same conclusion is
// written up at length in the parked search-path guard, whose review landed on the seam
// between layered passes three rounds running.
//
// WHAT IT KNOWS (each is a rule Postgres applies, and each has a vector in section 1 of
// tests/definer-grants.test.mjs, prefixed literals included):
//   line comments             `-- ...` to the end of the line
//   block comments            `/* ... */`, and they NEST, so they are consumed by depth
//   quoted identifiers        `"..."`, `""` is an escaped quote
//   string constants          `'...'` with `''`; `E'...'` also honours backslashes, so
//                             `E'\''` is ONE literal; `U&'...'`, `B'..'`, `X'..'`, `N'..'` are
//                             one token each, prefix included (measured on PostgreSQL 16.13: in
//                             `U&'a\'` the backslash is a Unicode escape character, NOT a quote
//                             escape, so the literal ends at the second quote; only `E` honours
//                             a backslash before a quote). The value of a `U&` literal is its
//                             undecoded text: only where it ENDS matters here.
//   dollar-quoted bodies      `$tag$ ... $tag$` with ANY tag, including none. The opener
//                             cannot CONTINUE an identifier: `$` is legal inside one, so
//                             `foo$tag$` is a single word to Postgres.
// WHAT IT REFUSES rather than guesses: an unterminated comment, literal or dollar quote, and
// `standard_conforming_strings = off`, which would change what a backslash means in every
// ordinary literal after it. A lexer that finished cleanly on text it misread is a silent
// all-clear, so anything it cannot COMPLETE is an error naming the file and line.

const IDENT_START = /[A-Za-z_\u0080-\uFFFF]/;
const IDENT_CONT = /[A-Za-z0-9_$\u0080-\uFFFF]/;
const isIdentStart = (ch) => ch !== undefined && IDENT_START.test(ch);
const isIdentCont = (ch) => ch !== undefined && IDENT_CONT.test(ch);
const isDigit = (ch) => ch !== undefined && ch >= '0' && ch <= '9';

/**
 * Tokens: { k, v, raw, start, end, line }.
 *   word     v is folded to lower case (Postgres folds an unquoted identifier)
 *   qident   v is the decoded name, exact case
 *   string   v is the decoded literal
 *   dollar   v is the text between the delimiters; `tag` is the delimiter's name ('' for $$)
 *   num, param, punct   v is the source text (punct is always ONE character)
 */
export function tokenize(sql, file = '<sql>') {
  const out = [];
  const n = sql.length;
  let i = 0;
  let line = 1;
  const fail = (msg, at = line) => { throw new Error(`${file}:${at}: ${msg}`); };
  const push = (k, v, start, end, startLine) => out.push({ k, v, raw: sql.slice(start, end), start, end, line: startLine });
  const countLines = (from, to) => { for (let p = from; p < to; p++) if (sql[p] === '\n') line++; };

  if (/standard_conforming_strings\s*(?:=|\bto\b)\s*(?:off|'off'|false|0)\b/i.test(sql.replace(/--[^\n]*/g, ''))) {
    fail('standard_conforming_strings is turned off, which changes what every quote means; refusing to lex');
  }

  // `'...'` from the opening quote at `q`. Returns the index just past the closing quote.
  const readQuoted = (q, quote, backslash, what) => {
    const startLine = line;
    let j = q + 1;
    for (; j < n; j++) {
      const ch = sql[j];
      if (backslash && ch === '\\') { j++; continue; }
      if (ch === quote) {
        if (sql[j + 1] === quote) { j++; continue; }
        return j + 1;
      }
    }
    return fail(`unterminated ${what}`, startLine);
  };
  const decode = (raw, quote, backslash) => {
    const body = raw.slice(1, -1).split(quote + quote).join(quote);
    if (!backslash) return body;
    return body.replace(/\\(.)/gs, (_, c) => ({ n: '\n', t: '\t', r: '\r', b: '\b', f: '\f' }[c] ?? c));
  };

  while (i < n) {
    const c = sql[i];
    if (c === '\n') { line++; i++; continue; }
    if (c === ' ' || c === '\t' || c === '\r' || c === '\f' || c === '\v') { i++; continue; }

    if (c === '-' && sql[i + 1] === '-') {
      while (i < n && sql[i] !== '\n') i++;
      continue;
    }
    if (c === '/' && sql[i + 1] === '*') {
      const startLine = line;
      let depth = 1;
      let j = i + 2;
      while (j < n && depth > 0) {
        if (sql[j] === '/' && sql[j + 1] === '*') { depth++; j += 2; }
        else if (sql[j] === '*' && sql[j + 1] === '/') { depth--; j += 2; }
        else j++;
      }
      if (depth > 0) fail('unterminated block comment', startLine);
      countLines(i, j);
      i = j;
      continue;
    }

    const start = i;
    const startLine = line;

    if (c === '"') {
      const end = readQuoted(i, '"', false, 'quoted identifier');
      push('qident', decode(sql.slice(i, end), '"', false), start, end, startLine);
      countLines(i, end); i = end; continue;
    }
    if (c === "'") {
      const end = readQuoted(i, "'", false, 'string literal');
      push('string', decode(sql.slice(i, end), "'", false), start, end, startLine);
      countLines(i, end); i = end; continue;
    }

    if (c === '$') {
      const m = /^\$([A-Za-z_\u0080-\uFFFF][A-Za-z0-9_\u0080-\uFFFF]*)?\$/.exec(sql.slice(i, i + 200));
      if (m) {
        const close = sql.indexOf(m[0], i + m[0].length);
        if (close === -1) fail(`unterminated dollar-quoted string ${m[0]}`, startLine);
        const end = close + m[0].length;
        push('dollar', sql.slice(i + m[0].length, close), start, end, startLine);
        out[out.length - 1].tag = m[1] || '';
        countLines(i, end); i = end; continue;
      }
      let j = i + 1;
      while (isDigit(sql[j])) j++;
      if (j > i + 1) { push('param', sql.slice(i, j), start, j, startLine); i = j; continue; }
      push('punct', '$', start, i + 1, startLine); i++; continue;
    }

    if (isIdentStart(c)) {
      let j = i + 1;
      while (isIdentCont(sql[j])) j++;
      const word = sql.slice(i, j);
      const low = word.toLowerCase();
      // A one-letter prefix directly against a quote is part of the literal, not a word.
      if (sql[j] === "'" && (low === 'e' || low === 'b' || low === 'x' || low === 'n')) {
        const end = readQuoted(j, "'", low === 'e', 'string literal');
        push('string', decode(sql.slice(j, end), "'", low === 'e'), start, end, startLine);
        countLines(i, end); i = end; continue;
      }
      if (low === 'u' && sql[j] === '&' && (sql[j + 1] === "'" || sql[j + 1] === '"')) {
        const quote = sql[j + 1];
        const end = readQuoted(j + 1, quote, false, quote === "'" ? 'string literal' : 'quoted identifier');
        push(quote === "'" ? 'string' : 'qident', decode(sql.slice(j + 1, end), quote, false), start, end, startLine);
        countLines(i, end); i = end; continue;
      }
      push('word', low, start, j, startLine);
      i = j; continue;
    }

    if (isDigit(c) || (c === '.' && isDigit(sql[i + 1]))) {
      let j = i;
      while (isDigit(sql[j])) j++;
      if (sql[j] === '.' && isDigit(sql[j + 1])) { j++; while (isDigit(sql[j])) j++; }
      else if (sql[j] === '.' && !isIdentStart(sql[j + 1]) && sql[j + 1] !== '.') j++;
      if ((sql[j] === 'e' || sql[j] === 'E') && (isDigit(sql[j + 1]) || ((sql[j + 1] === '+' || sql[j + 1] === '-') && isDigit(sql[j + 2])))) {
        j += 2; while (isDigit(sql[j])) j++;
      }
      push('num', sql.slice(i, j), start, j, startLine);
      i = j; continue;
    }

    push('punct', c, start, i + 1, startLine);
    i++;
  }
  return out;
}

/**
 * Split a file into top-level statements at a `;` outside every quote, comment and
 * bracket. A `;` inside a function body is inside a dollar quote and never reaches here.
 * Returns [{ file, index, line, tokens, text }]. Unbalanced brackets are an error: they
 * mean the lexer and the file disagree about where something ends.
 */
export function splitStatements(sql, file = '<sql>') {
  const tokens = tokenize(sql, file);
  const stmts = [];
  let cur = [];
  let depth = 0;
  const flush = () => {
    if (!cur.length) return;
    stmts.push({
      file,
      index: stmts.length,
      line: cur[0].line,
      tokens: cur,
      text: sql.slice(cur[0].start, cur[cur.length - 1].end),
    });
    cur = [];
  };
  for (const t of tokens) {
    if (t.k === 'punct') {
      if (t.v === '(') depth++;
      else if (t.v === ')') {
        depth--;
        if (depth < 0) throw new Error(`${file}:${t.line}: unbalanced ')'`);
      } else if (t.v === ';' && depth === 0) { flush(); continue; }
    }
    cur.push(t);
  }
  if (depth !== 0) throw new Error(`${file}: unbalanced '(' at end of file`);
  flush();
  return stmts;
}
