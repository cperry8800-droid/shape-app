// tests/nora-radio-magazine.test.mjs
//
// Four asks from the owner on 2026-10-24, read from the shipping source (each surface is mounted and driven
// by its own suites: nora-thread-load-retry for Talk to a person, the radio-* suites for the station):
//   "the x is overlapping nora box" (the Nora sheet's × over Talk to Nora);
//   "update look of this box and make sure its wired correctly" (Talk to a person);
//   "also fix the look of this" (the Radio station's deck);
// and the dock that hides on scroll, now on a member's profile too ("fix this message box thats appearing"),
// which tests/me-page-magazine.test.mjs mounts.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripComments } from './helpers/strip-comments.mjs';

const CLIENT = stripComments(readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'utf8'));
const RADIO = stripComments(readFileSync('mobile-app/src/broadsheet/iosAppBroadsheetRadio.jsx', 'utf8'));
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `marker moved: ${a}`); const j = src.indexOf(b, i + a.length); assert.ok(j > i, `marker moved: ${b}`); return src.slice(i, j); };

test('the Nora sheet\'s head stops short of its ×, at every density', () => {
  const sheet = between(CLIENT, 'function BSNoraSheet(', '\nfunction ');
  // The × is 34px, 10px in from the sheet's right edge and 8px down.
  assert.match(sheet, /onClick=\{onClose\} aria-label=\{tr\('cycle:close'[^}]*\}\)\} style=\{\{ position: 'absolute', top: 8, right: 10, zIndex: 1, width: 34, height: 34,/);
  const m = /padding: `0 \$\{Math\.max\(0, (\d+) - t\.padX\)\}px 0 0`/.exec(sheet);
  assert.ok(m, 'the head row no longer keeps clear of the ×');
  // The row's content ends at the gutter less this padding; the × starts 44px in from the edge.
  for (const padX of [18, 22, 26]) {
    const contentRight = padX + Math.max(0, Number(m[1]) - padX);
    assert.ok(contentRight >= 44, `at padX ${padX}, Talk to Nora runs under the × (${contentRight}px from the edge)`);
  }
});

test('Talk to a person in the Wall\'s look: a ruled block, a square field, square actions, Send in ink', () => {
  const form = between(CLIENT, '<div data-nora-person-form', '\n                )}');
  assert.match(form, /borderTop: `2px solid \$\{t\.INK\}`/);
  assert.doesNotMatch(form, /borderRadius: (12|10|999)/, 'a rounded card, field or pill is back');
  assert.doesNotMatch(form, /\$\{noraTint\}12/, 'the tinted card is back');
  assert.match(form, /<textarea [\s\S]*?borderRadius: 0/);
  // Send is ink with the paper's text, Cancel the ink outline; both 44px.
  assert.match(form, /data-nora-person-send onClick=\{sendPerson\} disabled=\{personForm\.busy\} style=\{\{ minHeight: 44, [^}]*background: t\.INK, color: t\.PAPER, borderRadius: 0/);
  assert.match(form, /onClick=\{\(\) => setPersonForm\(null\)\} disabled=\{personForm\.busy\} style=\{\{ minHeight: 44, [^}]*border: `1px solid \$\{t\.INK\}`, background: 'transparent', color: t\.INK, borderRadius: 0/);
  // The wiring is unchanged: the question goes through ShapeSupport.talkToPerson (POST /api/support/request).
  assert.match(CLIENT, /const r = await window\.ShapeSupport\.talkToPerson\(\{ question, surface: 'app', page: _bsNoraOpen\.page \|\| null, account \}\)/);
  // The opener is an underlined word, as the profiles' Message, not a teal pill.
  const opener = between(CLIENT, '<button type="button" data-nora-person', '</button>');
  assert.doesNotMatch(opener, /borderRadius: 999/);
});

test('the Radio station\'s deck: square keys, the one to take in ink, the strip as words', () => {
  const deck = between(RADIO, 'const signedIn = bsRadioSignedIn();', 'paddingBottom: 80 + 28');
  assert.doesNotMatch(deck, /borderRadius: 12/, 'a rounded key is back on the deck');
  // Tune in, when it can play, is ink with the paper's text.
  assert.match(deck, /background: act \? CREAM : 'transparent', color: act \? \(isLight \? t\.PAPER : '#050707'\) : CREAM50/);
  // The vote keys: square, 44px, the chosen one ruled in the station's teal, never a teal wash.
  assert.match(deck, /flex: 1, minHeight: 44, borderRadius: 0, cursor: canReact \? 'pointer' : 'default'/);
  assert.doesNotMatch(deck, /\$\{TEAL\}1f/);
  // The strip: Live, Shape Sets, Nora as words, aria-pressed, 44px, the chosen one in ink over teal.
  assert.match(deck, /<button key=\{s\.key\} aria-pressed=\{s\.on\} onClick=\{s\.go\} style=\{\{ [^}]*minHeight: 44/);
  assert.match(deck, /boxShadow: s\.on \? `inset 0 -2px 0 \$\{TEAL\}` : 'none', color: s\.on \? CREAM : CREAM50/);
});
