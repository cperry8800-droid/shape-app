// How the website's Nora panel lays out her words (public/newdesign/chatWidget.jsx CwNoraText):
// paragraphs, lists, and an address or an email as a link, with every word around it kept
// (Codex P2 on #2725 read the link pass as dropping the prose beside a link).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import vm from 'node:vm';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const babel = require('next/dist/compiled/babel/core');
const presetReact = require('next/dist/compiled/babel/preset-react');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');

const WEB = readFileSync(join(ROOT, 'public/newdesign/chatWidget.jsx'), 'utf8');
const from = WEB.indexOf('const CW_NORA_BULLET =');
const to = WEB.indexOf('function MicGlyph()');
assert.ok(from > 0 && to > from, 'the text layout must stay where this test reads it');
const { code } = babel.transformSync(`${WEB.slice(from, to)}\nthis.CwNoraText = CwNoraText;`, { presets: [presetReact], babelrc: false, configFile: false });
const ctx = { React, window: { location: { origin: 'https://www.theshapecommunity.com' } } };
vm.runInNewContext(code, ctx);
const html = (text, caret) => renderToStaticMarkup(React.createElement(ctx.CwNoraText, { text, caret }));
const words = (h) => h.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&');

test('every word around a link is kept, and the link is one', () => {
  const t = 'Write to info@theshapecommunity.com or see https://example.com/a. Thanks!';
  const h = html(t);
  assert.equal(words(h), t, 'nothing dropped or doubled');
  assert.match(h, /<a href="mailto:info@theshapecommunity\.com">info@theshapecommunity\.com<\/a>/);
  assert.match(h, /<a href="https:\/\/example\.com\/a" target="_blank" rel="noopener noreferrer">https:\/\/example\.com\/a<\/a>\./, 'the full stop after it stays text');
  const own = html('Your plan: https://www.theshapecommunity.com/newdesign/ClientApp.html');
  assert.doesNotMatch(own, /target=/, 'Shape\'s own page opens in place');
});

test('only http(s) addresses and emails become links: nothing she writes is read as markup', () => {
  const h = html('Try javascript:alert(1) or <b>bold</b>');
  assert.doesNotMatch(h, /<a /);
  assert.doesNotMatch(h, /<b>/);
  assert.equal(words(h).replace(/&lt;/g, '<').replace(/&gt;/g, '>'), 'Try javascript:alert(1) or <b>bold</b>');
});

test('blank lines part paragraphs, and •, - or "1." lines are a list', () => {
  const h = html('Two plans.\n\n• Monthly: $5\n• Yearly: $48\n\nAnd:\n1. One\n2. Two');
  assert.equal((h.match(/<p>/g) || []).length, 2);
  assert.match(h, /<ul><li>Monthly: \$5<\/li><li>Yearly: \$48<\/li><\/ul>/);
  assert.match(h, /<ol><li>One<\/li><li>Two<\/li><\/ol>/);
});

test('the caret ends the last line while she writes', () => {
  assert.match(html('Hello', true), /<p>Hello<span class="cw-nora-caret" aria-hidden="true"><\/span><\/p>/);
  assert.match(html('• One', true), /<li>One<span class="cw-nora-caret"/);
  assert.doesNotMatch(html('Hello'), /cw-nora-caret/);
});
