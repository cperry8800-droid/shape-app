// tests/dash-look.test.mjs
//
// B, the dashboard look (BSDash.jsx; owner, 2026-10-25: "I like B", following the paper). A metric's
// words are drawn in its TEXT shade, so that shade has to read on every paper the app offers: on the
// card, on a chip tinted in the metric's colour, and on a hero's wash of it. The papers are read from the
// theme's own table, so a paper added later is held to the same line.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const React = require_('react');
const DASH = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSDash.jsx'), { registry: new Map([['react', React]]) });

const chrome = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
const PAPERS = [...chrome.matchAll(/^\s+(\w+):\s+\{ paper: '(#[0-9a-f]{6})'.*?inkRGB: '([\d,]+)',\s+light: (true|false)/gm)]
  .map(([, name, paper, inkRGB, light]) => ({ name, paper, inkRGB, isLight: light === 'true' }));

const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
const over = (under, top, a) => under.map((x, i) => x * (1 - a) + top[i] * a);
const lum = (c) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
// An rgba(r,g,b,a) the look returns, laid over what is under it.
const lay = (under, css) => { const m = /rgba\((\d+),(\d+),(\d+),([\d.]+)\)/.exec(css); return over(under, [+m[1], +m[2], +m[3]], +m[4]); };

test('the theme table is read: every paper, light and dark', () => {
  assert.ok(PAPERS.length >= 18, `read ${PAPERS.length} papers`);
  assert.ok(PAPERS.some((p) => p.isLight) && PAPERS.some((p) => !p.isLight));
  for (const name of ['light', 'white', 'manila', 'steel', 'dark', 'teal', 'carbon']) assert.ok(PAPERS.some((p) => p.name === name), `${name} was not read`);
});

test("a metric's text shade reads at 4.5:1 or better on every paper: on the card, its chip and a hero's wash", () => {
  for (const p of PAPERS) {
    const D = DASH.bsDash({ isLight: p.isLight, inkRGB: p.inkRGB });
    const card = lay(rgb(p.paper), D.card);
    for (const k of Object.keys(D.text)) {
      const text = rgb(D.text[k]);
      // The chip and the hero's wash, at the alphas BSYourMornings and BSDashCard lay them.
      const chip = over(card, rgb(D.mark[k]), p.isLight ? 0.12 : 0.16);
      const wash = over(card, rgb(D.mark[k]), p.isLight ? 0.1 : 0.16);
      for (const [where, ground] of [['card', card], ['chip', chip], ['wash', wash]]) {
        const r = ratio(text, ground);
        assert.ok(r >= 4.5, `${k} text on the ${p.name} paper's ${where}: ${r.toFixed(2)}:1`);
      }
    }
  }
});

test('on a light paper a mark is not its own text: the marks there are under 4.5', () => {
  // Why the two shades: the bright marks the mock draws would not read as words on a light paper.
  const D = DASH.bsDash({ isLight: true, inkRGB: '15,14,12' });
  const card = lay(rgb('#f5f0e6'), D.card);
  for (const k of Object.keys(D.mark)) {
    assert.notEqual(D.text[k], D.mark[k]);
    if (k !== 'violet') assert.ok(ratio(rgb(D.mark[k]), card) < 4.5, `${k}'s mark reads on its own; the text shade is not needed`);
  }
});

test('the switch is small, its keys 44px targets, and says which one is shown', () => {
  const src = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSDash.jsx'), 'utf8');
  // Owner, 2026-10-25: "Don't need those boxes so big". A 34px capsule as wide as its words, a 28px pill.
  assert.match(src, /display: 'inline-flex', alignItems: 'center', gap: 2, height: 34,/);
  assert.match(src, /height: 28, padding: '0 13px', borderRadius: 999,/);
  assert.match(src, /minHeight: 44,/);
  assert.match(src, /role === 'tab' \? \{ role: 'tab', 'aria-selected': on \} : \{ 'aria-pressed': on \}/);
});
