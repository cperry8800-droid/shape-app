// The coach Today, Clients and Programs pages pair two faces (owner, 2026-10-25, "I want both"):
// Geist for the titles and section heads, Inter Tight for the words. The member's Home takes the
// same type (owner, 2026-10-28: "Member/client home page font needs to match coaches"). The app
// bundles the files, so the proof that they carry the weights the pages set is the files' own
// `fvar` tables, and the proof that every locale stays in the face is a Cyrillic and a Vietnamese
// file for each.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { woff2Table, fvarAxes } from './helpers/woff2-fvar.mjs';

const CSS = readFileSync(new URL('../mobile-app/src/fonts.css', import.meta.url), 'utf8');
const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
const CLEAN = readFileSync(new URL('../mobile-app/src/broadsheet/bsCleanType.jsx', import.meta.url), 'utf8');
const file = (n) => readFileSync(new URL(`../mobile-app/src/assets/fonts/font-${n}.woff2`, import.meta.url));
const faces = (family) => CSS.split('@font-face').slice(1)
  .map((b) => b.slice(0, b.indexOf('}')))
  .filter((b) => b.includes(`font-family: '${family}'`))
  .map((b) => ({ block: b, n: (b.match(/font-(\d+)\.woff2/) || [])[1] }));

for (const family of ['Inter Tight', 'Geist']) {
  test(`${family} ships its weight axis across 100..900, in every script the app's locales use`, () => {
    const found = faces(family);
    assert.equal(found.length, 5, `expected latin, latin-ext, cyrillic, cyrillic-ext and vietnamese ${family} faces`);
    for (const { n, block } of found) {
      const wght = new Map(fvarAxes(woff2Table(file(n), 'fvar')).map((a) => [a.tag, a])).get('wght');
      assert.ok(wght, `font-${n} has no wght axis`);
      assert.ok(wght.min <= 400 && wght.max >= 800, `font-${n}: wght ${wght.min}..${wght.max}`);
      // A single declared weight clamps a variable face and the axis goes inert.
      assert.match(block, /font-weight:\s*100\s+900/, `font-${n}: the face does not declare the weight range`);
    }
    const ranges = found.map(({ block }) => block).join('\n');
    assert.match(ranges, /U\+0400-045F/, `${family}: no face covers basic Cyrillic (ru, uk)`);
    assert.match(ranges, /U\+1EA0-1EF9/, `${family}: no face covers Vietnamese`);
  });
}

test('every new face is a real subset, not an empty file', () => {
  for (const { n } of [...faces('Inter Tight'), ...faces('Geist')]) {
    const maxp = woff2Table(file(n), 'maxp');
    assert.ok(maxp && maxp.length >= 6, `font-${n}: maxp is missing`);
    assert.ok(maxp.readUInt16BE(4) >= 50, `font-${n}: only ${maxp.readUInt16BE(4)} glyphs`);
  }
});

test('the clean type names the two bundled faces, and sets every word in Inter Tight', () => {
  assert.match(CLEAN, /export const BS_CLEAN_HEAD = "'Geist',/);
  assert.match(CLEAN, /export const BS_CLEAN_SANS = "'Inter Tight',/);
  // The theme's two word faces, DISPLAY and the system BODY a few lines take (Codex on #2488).
  assert.match(CLEAN, /\{ \.\.\.base, DISPLAY: BS_CLEAN_SANS, BODY: BS_CLEAN_SANS, HEAD: BS_CLEAN_HEAD \}/);
});

// One top-level function of the client module, by its source.
const fnBody = (name) => {
  const from = CLIENT.slice(CLIENT.indexOf(`function ${name}(`));
  return from.slice(0, from.indexOf('\n}\n'));
};
// A page's main return: the clean area opens under its top bars, holds its content and closes
// before the footer; a shared sheet (BSSwapSheet) sits after it and keeps the app's own type.
const mainReturn = (body) => body.slice(body.lastIndexOf('\n  return ('));

test('the coach pages and the member Home share the one clean type', () => {
  assert.match(PROS, /import \{[^}]*\buseBSClean\b[^}]*\} from '\.\/bsCleanType\.jsx';/);
  assert.match(CLIENT, /import \{ useBSClean, BSCleanType\b[^}]*\} from '\.\/bsCleanType\.jsx';/);
  const body = fnBody('BSClientHome');
  assert.match(body, /const t = useBSClean\(\);/, 'Home reads the clean theme');
  // The clean area opens below the top bars and closes before the footer, as on the coach's Today.
  const open = body.indexOf('<BSCleanType t={t}>');
  const close = body.indexOf('</BSCleanType>');
  assert.ok(open > body.indexOf('<BSNowPlaying') && open < body.indexOf('<BSHomeGoal'), 'the clean area starts under Shape Radio');
  assert.ok(close > body.indexOf('<BSShortcuts') && close < body.indexOf('<BSFooter'), 'the clean area ends before the footer');
});

test('Train and Eat set their pages in the clean type, under the header, and keep the swap sheet out', () => {
  const train = fnBody('BSClientTrain');
  assert.match(train, /const t = useBSClean\(\);/, 'Train reads the clean theme');
  // The no-plan door and a failed plan read are Train too.
  assert.equal(train.split('<BSCleanType t={t}>').length - 1, 3, 'the page, the Build door and the failed read');
  const eat = fnBody('BSClientEat');
  assert.match(eat, /const t = useBS\(\);/, "Eat's own t stays the app's: the grocery sheets read it");
  assert.match(eat, /const tClean = useBSClean\(\);/);
  for (const [name, body, tag] of [['Train', train, '<BSCleanType t={t}>'], ['Eat', eat, '<BSCleanType t={tClean}>']]) {
    const page = mainReturn(body);
    const open = page.indexOf(tag);
    const close = page.indexOf('</BSCleanType>');
    assert.ok(open > page.indexOf('<BSPageHeader') && open < page.indexOf('<BSWeekStrip'), `${name}: the clean area starts under the header`);
    assert.ok(close > page.indexOf('<BSCoachPlaylists') && close < page.indexOf('<BSFooter'), `${name}: the clean area ends before the footer`);
    assert.ok(page.indexOf('<BSSwapSheet', close) > close, `${name}: the swap sheet sits outside the clean area`);
  }
  // A sheet portalled out of a clean area carries its mark, or its weights step down (Codex on #2488):
  // the coach playlists' preview on Train and Eat, and Home's check-in and water sheets.
  assert.match(fnBody('BSPlaylistCard'), /createPortal\(bsCleanSheet\(t,/, "the playlist preview loses the clean weights");
  for (const f of ['BSCheckinCard', 'BSWaterLine']) {
    const src = readFileSync(new URL(`../mobile-app/src/broadsheet/${f}.jsx`, import.meta.url), 'utf8');
    assert.match(src, /createPortal\(bsCleanSheet\(t, sheet\), host\)/, `${f}'s sheet loses the clean weights`);
  }
  // Eat's tabs are the Grocery page's too, so they stay outside with the header.
  const eatPage = mainReturn(eat);
  assert.ok(eatPage.indexOf('<BSNutritionTopTabs') < eatPage.indexOf('<BSCleanType'), "Eat's tabs keep the app's type");
});

test('Grocery and the Library set their pages in the clean type under the Eat tabs; the header and the sheets keep the app\'s', () => {
  // Owner, 2026-10-29: "Yes", to moving Grocery and the Library off Saira, as Day and Build a list are.
  const grocery = fnBody('BSGrocery');
  assert.match(grocery, /const t = useBS\(\);/, "Grocery's own t stays the app's: the header and the list picker read it");
  assert.match(grocery, /const tc = useBSClean\(\);/);
  const page = mainReturn(grocery);
  const open = page.indexOf('<BSCleanType t={tc}>');
  const close = page.indexOf('</BSCleanType>');
  assert.ok(open > page.indexOf('<BSNutritionTopTabs'), 'Grocery: the clean area starts under the header and the tabs');
  assert.ok(close > open && close < page.indexOf('<BSFooter'), 'Grocery: the clean area ends before the footer');
  assert.doesNotMatch(page.slice(0, open), /\btc\./, "Grocery's header (Food list.) keeps the app's face");
  // Send to a member is a portalled sheet: it sits after the clean area. The list picker portals from
  // inside it but sets its own text from the app's t.
  assert.ok(page.indexOf('<BSPostSendSheet', close) > close, 'Send to a member sits outside the clean area');
  const clean = page.slice(open, close);
  const pickAt = clean.indexOf('{pickerOpen && createPortal(');
  const picker = clean.slice(pickAt, clean.indexOf("document.getElementById('bs-phone-surface')) || document.body", pickAt));
  assert.ok(picker.length > 200, 'the list picker is gone — re-point this guard');
  assert.doesNotMatch(picker, /\btc\./, 'the list picker keeps the app\'s type');
  // The page's own words in the clean faces, and the aisle being walked a Geist head.
  assert.match(clean, /fontFamily: tc\.HEAD, fontSize: 28, fontWeight: 600/);
  assert.equal((clean.replace(picker, '').match(/fontFamily: t\.(DISPLAY|BODY)\b/g) || []).length, 0, 'a Saira line left in the Grocery body');
  assert.match(clean, /<BSCoachGroceryReview t=\{tc\}/, 'the coach\'s sent list reads the clean theme');
  // The rows are drawn by a helper above the return; it reads the clean face too.
  assert.equal((grocery.slice(0, grocery.lastIndexOf('\n  return (')).match(/fontFamily: t\.(DISPLAY|BODY)\b/g) || []).length, 0);

  const LIB = readFileSync(new URL('../mobile-app/src/broadsheet/BSGroceryLibrary.jsx', import.meta.url), 'utf8');
  assert.match(LIB, /^import \{ useBSClean, BSCleanType \} from '\.\/bsCleanType\.jsx';$/m);
  assert.match(LIB, /const t = useBS\(\);\n[\s\S]{0,400}const tc = useBSClean\(\);/);
  const lib = LIB.slice(LIB.lastIndexOf('\n  return ('));
  const lOpen = lib.indexOf('<BSCleanType t={tc}>');
  const lClose = lib.indexOf('</BSCleanType>');
  assert.ok(lOpen > lib.indexOf('<BSNutritionTopTabs') && lClose < lib.indexOf('<BSFooter'), 'the Library: under the header and the tabs, before the footer');
  assert.ok(lib.indexOf('<BSPostSendSheet') > lClose, "the Library's Send to a member sits outside the clean area");
  assert.equal((lib.slice(lOpen, lClose).match(/fontFamily: t\.(DISPLAY|BODY)\b/g) || []).length, 0, 'a Saira line left in the Library body');
});
