// The website's copy, for the click counts (src/lib/click-capture.mjs): every string the site's
// pages are written with, cleaned as a tap's label is. public/click-capture.js counts a control's
// aria-label, title or text only when it is in this list, so a name, a habit or a message on a
// page (data, never source) is counted by its control's kind instead (Codex on #2493).
//
// scripts/build-newdesign.mjs writes it at deploy, as public/newdesign/nd/click-vocab.json beside
// the compiled pages, so it is never stale and never committed. Read here:
//   - every .jsx/.js/.mjs under public/newdesign (not nd/): string literals, template literals
//     with nothing interpolated, JSX text, and the whole text of an element made only of those
//     ("Start session" with an arrow span reads "Start session →", as a tap does);
//   - every .html under public/newdesign and public/ (not public/m): its text, its aria-label,
//     title and value attributes, and its inline text/babel blocks, read as JSX.
// Usage: node scripts/click-vocab.mjs [--out <file>]  (prints a summary; writes with --out)

import { parseSync, traverse } from '@babel/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanLabel } from '../src/lib/click-capture.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Longer than this is prose, not a control's name (an aria-label rarely runs past it).
const RAW_MAX = 64;
const LETTER = /\p{L}/u;
// One word with code's punctuation (a class, a CSS value, a path, a key) is never a label.
const CODE_WORD = /^[^\s]*[-_./:=(){}[\]<>|\\$%^*+;'"`][^\s]*$/;
// A word in lower camelCase, or all lower case and longer than a button's word, is an identifier.
const IDENT = /^(?:[a-z]+[A-Z][A-Za-z0-9]*|[a-z0-9]{16,})$/;
const HEX_COLOR = /^#[0-9a-f]{3,8}$/i;
const ENTITIES = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', rarr: '→', larr: '←', uarr: '↑', darr: '↓',
  mdash: '—', ndash: '–', middot: '·', hellip: '…', times: '×', rsquo: '’', lsquo: '‘', ldquo: '“',
  rdquo: '”', copy: '©', reg: '®', trade: '™', bull: '•', check: '✓', deg: '°', plus: '+',
};

function decode(text) {
  return String(text).replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') {
      const code = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : m;
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

function walk(dir, keep, skip) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) return skip.includes(name) ? [] : walk(p, keep, skip);
    return keep.test(name) ? [p] : [];
  });
}

/** The whole text of a JSX element made only of fixed text, or null when any of it is data. */
function staticText(node) {
  let out = '';
  for (const child of node.children) {
    if (child.type === 'JSXText') out += child.value;
    else if (child.type === 'JSXElement') {
      const inner = staticText(child);
      if (inner === null) return null;
      out += inner;
    } else if (child.type === 'JSXExpressionContainer') {
      const e = child.expression;
      if (e.type === 'JSXEmptyExpression') continue;
      if (e.type === 'StringLiteral') out += e.value;
      else if (e.type === 'TemplateLiteral' && !e.expressions.length) out += e.quasis[0].value.cooked;
      else return null;
    } else return null;
  }
  return out;
}

export function buildClickVocab(root = ROOT) {
  const vocab = new Set();
  const add = (value) => {
    const raw = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!raw || raw.length > RAW_MAX || CODE_WORD.test(raw) || IDENT.test(raw) || HEX_COLOR.test(raw)) return;
    const label = cleanLabel(raw);
    if (label && LETTER.test(label)) vocab.add(label);
  };
  const readCode = (code, filename) => {
    let ast;
    try {
      ast = parseSync(code, {
        filename,
        babelrc: false,
        configFile: false,
        sourceType: 'unambiguous',
        parserOpts: { plugins: ['jsx'], errorRecovery: true },
      });
    } catch {
      return;
    }
    if (!ast) return;
    traverse(ast, {
      StringLiteral(p) { add(p.node.value); },
      TemplateLiteral(p) { if (!p.node.expressions.length) add(p.node.quasis[0].value.cooked); },
      JSXText(p) { add(p.node.value); },
      JSXElement(p) { const t = staticText(p.node); if (t !== null) add(t); },
    });
  };

  const nd = path.join(root, 'public', 'newdesign');
  for (const f of walk(nd, /\.(jsx|js|mjs)$/, ['nd', 'node_modules'])) readCode(fs.readFileSync(f, 'utf8'), f);
  const pages = [...walk(nd, /\.html$/, ['nd']), ...walk(path.join(root, 'public'), /\.html$/, ['newdesign', 'm', 'node_modules'])];
  for (const f of pages) {
    const html = fs.readFileSync(f, 'utf8');
    for (const m of html.matchAll(/<script\s+type="text\/babel"[^>]*>([\s\S]*?)<\/script>/g)) readCode(m[1], f);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<!--[\s\S]*?-->/g, ' ');
    for (const m of text.matchAll(/>([^<>]+)</g)) add(decode(m[1]));
    for (const m of text.matchAll(/\s(?:aria-label|title|value)="([^"]*)"/g)) add(decode(m[1]));
  }
  return [...vocab].sort();
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const list = buildClickVocab();
  const at = process.argv.indexOf('--out');
  const json = JSON.stringify(list);
  if (at > 0 && process.argv[at + 1]) fs.writeFileSync(process.argv[at + 1], json);
  console.log(`click vocab: ${list.length} labels, ${json.length} bytes`);
}
