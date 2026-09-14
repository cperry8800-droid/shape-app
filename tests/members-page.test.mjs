// The members' door in the nav, and the page behind it.
//
// Owner, 2026-09-14: `Client.html` ("For members") was reachable from the footer
// alone — "maybe a seperate client tab on nav bar". It is the eighth link now,
// Members, beside Coaches, on the shared header, the homepage bar and the
// homepage drawer. And before it was one click from the bar, the page itself
// gave up three things the site's own rules already ban elsewhere: a timing
// promise ("from curious to coached in a week"), invented figures with no
// example mark (the "This week" card, the habits ledger, the grocery mock), and
// "Free — to join" on a membership the homepage and Pricing price at $5/mo
// (owner: "Its free to join for coaches. Its $5 a month for members/clients").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stripComments } from './helpers/strip-comments.mjs';

const ND = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'newdesign');
const read = (f) => readFileSync(path.join(ND, f), 'utf8');
const SHELL = read('pageShell.jsx');
const INDEX = read('index.html');
const PAGE = read('clientOverview.jsx');
const target = (href) => String(href || '').replace(/^.*\//, '');

// The shared header's signed-out table, lifted the way tests/site-nav does.
const decl = (name) => {
  const m = new RegExp('const ' + name + ' = (\\[[\\s\\S]*?\\n\\]);').exec(SHELL);
  assert.ok(m, name + ' did not parse out of pageShell.jsx');
  return m[1];
};
const NAV = new Function(
  'const COACHES_HREF = ' + /const COACHES_HREF = ("[^"]*")/.exec(SHELL)[1] + ';' +
  'const COACHES_ITEMS = ' + decl('COACHES_ITEMS') + ';' +
  'const SHAPE_NAV_GROUPS = ' + decl('SHAPE_NAV_GROUPS') + ';' +
  'const PORTAL_NAV = ' + decl('PORTAL_NAV') + ';' +
  'return { SHAPE_NAV_GROUPS, PORTAL_NAV };')();

// ── 1 · the link ────────────────────────────────────────────────────────────
test('Members sits beside Coaches and points at the members page', () => {
  const labels = NAV.SHAPE_NAV_GROUPS.map((g) => g.label);
  assert.equal(labels[0], 'Coaches');
  assert.equal(labels[1], 'Members', 'Members is not the link beside Coaches: ' + labels.join(' · '));
  const members = NAV.SHAPE_NAV_GROUPS[1];
  assert.equal(members.kind, 'link', 'Members is a plain link, not a menu');
  assert.equal(target(members.href), 'Client.html');
  assert.ok(existsSync(path.join(ND, 'Client.html')), 'Client.html is not in public/newdesign');
  // Signed in, the row is the essentials — the pitch to members is not one of them.
  assert.ok(!NAV.PORTAL_NAV.some((g) => g.label === 'Members'), 'Members is on the signed-in row');
});

// ⚠ THE DRAWER IS THE ONLY NAV A PHONE HAS, and tests/site-nav.test.mjs compares
// the two BARS, not the drawer — so a link added to both bars and forgotten in
// the drawer would pass every guard while a phone never saw it. Derived from the
// shared header's table, so every future top-level link is covered too.
test('every signed-out top-level link is in the homepage drawer', () => {
  const drawer = /<div class="ndrawer" id="ndrawer">([\s\S]*?)<\/div>/.exec(INDEX);
  assert.ok(drawer, 'the homepage has no drawer');
  const inDrawer = [...drawer[1].matchAll(/<a href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g)]
    .map((a) => [a[2].replace(/&nbsp;/g, ' ').replace(/<[^>]*>/g, '').trim(), target(a[1])]);
  assert.ok(inDrawer.length >= 8, 'parsed only ' + inDrawer.length + ' drawer links — the parse stopped matching');
  for (const g of NAV.SHAPE_NAV_GROUPS) {
    assert.ok(inDrawer.some(([n, h]) => n === g.label && h === target(g.href)),
      'the drawer is missing ' + g.label + ' → ' + g.href);
  }
});

// A plain header link lights when `active === label` (pageShell's `link()`), so
// the page has to name the label it wants lit — "Client Overview" lit nothing.
test('the members page lights its own link', () => {
  assert.match(PAGE, /<Header active="Members" \/>/, 'clientOverview.jsx does not pass active="Members"');
});

// ── 2 · the page's claims ──────────────────────────────────────────────────
// ⚠ EACH BAN IS PAIRED WITH THE SENTENCE IT WAS WRITTEN FOR, and a test below
// proves every one still catches its own — a ban whose regex quietly stopped
// matching passes on a page that carries the promise.
const PROMISES = [
  [/to coached\W* in a week|coached in a week/i, 'a promise about how long the whole path takes', 'From curious to coached in a week.'],
  [/in an afternoon|the following Monday/i, 'a promise about when members start', 'Most members find their coach in an afternoon and start the following Monday.'],
  [/time:\s*"(Same day|Week \d|Day \d|Tomorrow)"/i, 'a step chip naming an outcome window', 'time: "Same day"'],
];
const CLEAN = stripComments(PAGE);

// ⚠ THE BANS RUN OVER WHAT THE PAGE SAYS, NOT OVER ITS JSX. The retired headline
// was `<em>to coached</em> in a week.` — a tag in the middle of the sentence —
// and a ban over the raw source walked straight past it: the mutation restoring
// that exact markup SURVIVED the first round.
//
// ⚠ AND STRIPPING TAGS IS NOT ENOUGH — Codex's finding on this file. Two ordinary
// ways to write the same sentence still defeated it:
//   `to coached in a&nbsp;week`                  — an entity is not a space
//   `to coached{" in a "}<strong>week</strong>`  — braces and quotes are not text
// Both RENDER the banned promise to the reader. So: unwrap string expression
// containers, decode the entities this codebase actually writes, fold every kind
// of space (NBSP included) into one, and only then read the sentence. The
// controls below carry both shapes — a ban is proven by the forms it must catch,
// and a plain-string control passes on a ban that any real spelling would slip.
//
// ⚠ ONE FUNCTION, USED BY THE SWEEP AND BY ITS CONTROLS. The first cut wrote the
// pipeline twice — once for the page, once for the controls — and the mutation
// round proved what that buys: deleting the entity decode from the page's copy
// SURVIVED, because the controls were exercising the other copy. A guard that
// runs its own version of the code is measuring nothing.
const renderText = (src) => src
  .replace(/\{\s*(['"])((?:[^'"\\]|\\.)*)\1\s*\}/g, ' $2 ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&nbsp;|&#160;|&#xa0;/gi, ' ')
  .replace(/&amp;/gi, '&').replace(/&rsquo;|&#8217;/gi, "'").replace(/&mdash;|&#8212;/gi, '\u2014')
  .replace(/[\s\u00a0\u2007\u202f]+/g, ' ');
const TEXT = renderText(CLEAN);

test('the members page promises no timing', () => {
  for (const [re, why] of PROMISES) {
    const m = re.exec(TEXT);
    assert.ok(!m, why + ' is back on the members page: "' + (m && m[0]) + '"');
  }
});

test('every members-page ban still catches the sentence it was written for', () => {
  for (const [re, , sentence] of PROMISES) {
    assert.ok(re.test(sentence), 'the ban for "' + sentence + '" no longer matches it');
  }
  // ⚠ AND CATCHES IT THROUGH THE MARKUP IT COULD BE WRITTEN IN.
  const timing = PROMISES[0][0];
  for (const spelling of [
    '<em>to coached</em> in a week.',
    'to coached in a&nbsp;week.',
    'to coached{" in a "}<strong>week</strong>.',
    "to coached{' in a '}week.",
    'to coached in a\u00a0week.',
  ]) {
    assert.ok(timing.test(renderText(spelling)),
      'the timing ban does not survive this spelling: ' + spelling);
  }
  // ⚠ AND THE NORMALISATION MUST NOT INVENT A MATCH. Collapsing a tag to a space
  // joins nothing that was not adjacent; two separate elements are not one phrase.
  assert.ok(!timing.test(renderText('to coached</em><em>in a month')),
    'the normalisation manufactures a match out of unrelated text');
  // And the applicant-effort estimate the coach pages keep is not banned here either:
  // "Takes about 5 minutes" is a statement about our own form.
  for (const [re] of PROMISES) assert.ok(!re.test('Takes about 5 minutes — enough for us to match well.'));
});

// ⚠ THE MARK IS INSIDE EACH MOCK. Four invented pictures — the "This week" card,
// the coach's note under it, the habits ledger, the grocery list — each carry
// EXAMPLE in their own header, the way the Coaches page stamps its frames; a
// caption elsewhere on the page is not a mark on the picture.
test('every invented mock on the members page is marked as an example', () => {
  const marks = CLEAN.match(/EXAMPLE( WEEK)?\s*·|Example · from/g) || [];
  assert.ok(marks.length >= 4, 'expected at least four example marks (week card, note, habits, grocery); found ' + marks.length);
  for (const anchor of ['This week', 'Habits', 'Grocery list']) {
    assert.ok(CLEAN.includes(anchor), 'the "' + anchor + '" mock is gone — this guard is reading nothing');
  }
});

test('the members page prices the membership the way the rest of the site does', () => {
  assert.ok(!/Free\W+to join|"Free", v: "To join/i.test(CLEAN), 'the members page still says free to join');
  assert.match(CLEAN, /\$5\/mo/, 'the value strip no longer states the $5/mo membership');
  assert.match(CLEAN, /\$5\/month for clients/, 'the FAQ no longer states the $5/month membership');
});
