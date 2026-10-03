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
//                             a backslash before a quote). VALUES are decoded as Postgres decodes them,
//                             because the model compares them with names (`set_config(E'\x73earch_path',
//                             ...)` IS the search_path): an `E` literal reads \b \f \n \r \t, octal,
//                             \xhh, \uXXXX and \UXXXXXXXX; a `U&` literal or identifier reads \XXXX,
//                             \+XXXXXX and \\. `UESCAPE`, which changes the escape character, is refused.
//   dollar-quoted bodies      `$tag$ ... $tag$` with ANY tag, including none. The opener
//                             cannot CONTINUE an identifier: `$` is legal inside one, so
//                             `foo$tag$` is a single word to Postgres.
// WHAT IT REFUSES rather than guesses: an unterminated comment, literal or dollar quote, and
// `standard_conforming_strings = off` (read from tokens, per statement, so a comment cannot hide it:
// `set ... /* c */ = off`, `set_config('standard_conforming_strings', 'off', ...)` and a quoted
// `pg_catalog."set_config"` all count), which would change what a backslash means in every ordinary
// literal after it. That check is for statements that run while the file is read; a function body
// runs later, and `tokenize(sql, file, { settings: false })` lexes one without it. A lexer that
// finished cleanly on text it misread is a silent all-clear, so anything it cannot COMPLETE is an
// error naming the file and line.

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
export function tokenize(sql, file = '<sql>', { settings = true } = {}) {
  const out = [];
  const n = sql.length;
  let i = 0;
  let line = 1;
  const fail = (msg, at = line) => { throw new Error(`${file}:${at}: ${msg}`); };
  const push = (k, v, start, end, startLine) => out.push({ k, v, raw: sql.slice(start, end), start, end, line: startLine });
  const countLines = (from, to) => { for (let p = from; p < to; p++) if (sql[p] === '\n') line++; };

  // standard_conforming_strings = off changes what a backslash in a plain string means, so every
  // literal after it would be cut in the wrong place. It is read from TOKENS, at the end of each
  // statement: a comment between the words (`set standard_conforming_strings /* x */ = off`) cannot
  // hide it, the same words inside a comment, a string or a dollar body cannot trigger it, and it is
  // read before the NEXT statement is lexed, so the refusal is the message and not whatever an
  // unterminated string further down turns into.
  let stmtFrom = 0;
  const checkConformingStrings = () => {
    if (!settings) return; // a function body runs when the function is CALLED, not while the file is read
    const hit = turnsOffConformingStrings(out.slice(stmtFrom));
    stmtFrom = out.length;
    if (hit) fail('standard_conforming_strings is turned off, which changes what every quote means; refusing to lex', hit.line);
  };

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
  // `plain` is '...' and "..." (a doubled quote is one quote). `escape` is E'...', which reads what Postgres
  // reads: \b \f \n \r \t, octal (\o \oo \ooo), hex (\xh \xhh), \uXXXX and \UXXXXXXXX, any other
  // character as itself, and a doubled quote as one quote; so E'\x73earch_path' IS search_path, and a name
  // compared against it would not match if only the backslash were dropped. `unicode` is U&'...' and
  // U&"...", whose default escape is a backslash: \XXXX, \+XXXXXX and \\. UESCAPE, which changes the
  // escape character, is refused where it appears, so no value here is ever decoded under the wrong one.
  const decode = (raw, quote, mode = 'plain') => {
    const inner = raw.slice(1, -1);
    if (mode === 'plain') return inner.split(quote + quote).join(quote);
    if (mode === 'escape') {
      return inner.replace(/''|\\(?:([0-7]{1,3})|x([0-9A-Fa-f]{1,2})|u([0-9A-Fa-f]{4})|U([0-9A-Fa-f]{8})|([\s\S]))/g, (m, oct, hex, u4, u8, ch) => {
        if (m === "''") return "'";
        const digits = oct ?? hex ?? u4 ?? u8;
        if (digits === undefined) return { b: '\b', f: '\f', n: '\n', r: '\r', t: '\t' }[ch] ?? ch;
        const code = parseInt(digits, oct !== undefined ? 8 : 16);
        return code <= 0x10ffff ? String.fromCodePoint(code) : m; // out of range: Postgres refuses the statement
      });
    }
    return inner.split(quote + quote).join(quote).replace(/\\(?:(\\)|([0-9A-Fa-f]{4})|\+([0-9A-Fa-f]{6}))/g, (m, bs, u4, u6) => {
      if (bs) return '\\';
      const code = parseInt(u4 ?? u6, 16);
      return code <= 0x10ffff ? String.fromCodePoint(code) : m;
    });
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
      push('qident', decode(sql.slice(i, end), '"'), start, end, startLine);
      countLines(i, end); i = end; continue;
    }
    if (c === "'") {
      const end = readQuoted(i, "'", false, 'string literal');
      push('string', decode(sql.slice(i, end), "'"), start, end, startLine);
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
        push('string', decode(sql.slice(j, end), "'", low === 'e' ? 'escape' : 'plain'), start, end, startLine);
        countLines(i, end); i = end; continue;
      }
      if (low === 'u' && sql[j] === '&' && (sql[j + 1] === "'" || sql[j + 1] === '"')) {
        const quote = sql[j + 1];
        const end = readQuoted(j + 1, quote, false, quote === "'" ? 'string literal' : 'quoted identifier');
        push(quote === "'" ? 'string' : 'qident', decode(sql.slice(j + 1, end), quote, 'unicode'), start, end, startLine);
        out[out.length - 1].uni = true;
        countLines(i, end); i = end; continue;
      }
      if (low === 'uescape' && out[out.length - 1]?.uni) fail('UESCAPE changes what every escape in a U& literal means; refusing to lex', startLine);
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
    if (c === ';') checkConformingStrings();
    i++;
  }
  checkConformingStrings();
  return out;
}

/**
 * True when t names `v`: the unquoted word (already folded to lower case) or a quoted identifier spelled
 * exactly `v`, which Postgres resolves to the same name (`pg_catalog."set_config"(...)` is the built-in).
 */
export const nameIs = (t, v) => !!t && (t.k === 'word' || t.k === 'qident') && t.v === v;

const SCS = 'standard_conforming_strings';
const lowerV = (t) => String(t?.v ?? '').toLowerCase();
const isNameOf = (t, name) => !!t && ['word', 'qident', 'string', 'dollar'].includes(t.k) && lowerV(t) === name;
/** Postgres reads a boolean setting from `false`, `no`, `off` and `0` and their unique prefixes (`f`, `n`, `of`). */
const isOffValue = (t) => {
  if (!t || !['word', 'string', 'num'].includes(t.k)) return null; // unreadable: the caller decides
  const s = lowerV(t);
  const prefix = (word, min) => s.length >= min && word.startsWith(s);
  return s === '0' || prefix('false', 1) || prefix('no', 1) || prefix('off', 2);
};

/**
 * The token that turns standard_conforming_strings off in one statement's tokens, or null:
 *   SET [SESSION | LOCAL] standard_conforming_strings { = | TO } off | false | no | 0 (quoted or not)
 *   set_config('standard_conforming_strings', 'off' | ..., is_local)
 * A value that is not a literal (`set_config('standard_conforming_strings', current_setting('x'), false)`)
 * cannot be read, so it counts: this is a refusal, and a wrong refusal costs less than a wrong lexing.
 */
function turnsOffConformingStrings(toks) {
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i];
    if (isNameOf(t, SCS) && (t.k === 'word' || t.k === 'qident')) {
      const afterSet = (toks[i - 1]?.k === 'word' && toks[i - 1].v === 'set') || (['session', 'local'].includes(toks[i - 1]?.v) && toks[i - 2]?.k === 'word' && toks[i - 2].v === 'set');
      const assign = (toks[i + 1]?.k === 'punct' && toks[i + 1].v === '=') || (toks[i + 1]?.k === 'word' && toks[i + 1].v === 'to');
      if (afterSet && assign && isOffValue(toks[i + 2]) === true) return toks[i];
    }
    if (nameIs(t, 'set_config') && toks[i + 1]?.k === 'punct' && toks[i + 1].v === '(') {
      // Only a name that is ONE whole literal is read here. `'standard_' || 'conforming_strings'` and
      // `'standard_conforming_strings'::text` start with a literal and say something else, and a name that
      // is no literal at all could be anything: the model refuses every such set_config as an unmodelled
      // statement (setConfigTarget), which is loud, so the lexer need not throw for them as well.
      const arg = toks[i + 2];
      const wholeName = ['string', 'dollar'].includes(arg?.k) && toks[i + 3]?.k === 'punct' && toks[i + 3].v === ',';
      if (!wholeName || lowerV(arg) !== SCS) continue;
      const comma = toks[i + 3]?.k === 'punct' && toks[i + 3].v === ',';
      // A value is readable only when it is the WHOLE argument: `current_setting('x')` starts with a word
      // and `'o' || 'ff'` with a string, and neither says what the setting becomes.
      const whole = comma && toks[i + 5]?.k === 'punct' && (toks[i + 5].v === ',' || toks[i + 5].v === ')');
      const off = whole ? isOffValue(toks[i + 4]) : null;
      if (off === true || off === null) return toks[i];
    }
  }
  return null;
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
