// The coach pages' words on the member's scale, and the Eat Library headed as a tab.
//
// Owner, 2026-10-31: "font size is still different on client and coaches pages on app". The heads
// already matched (17px section heads, Geist), but under them the coach pages kept 14px lines under
// each row, 15–17 / 700 names, 13–14 / 700 links and buttons and 19px heads on Clients, where the
// member's Home sets a row's name at 15 / 600, the line under it at 12 and its links at 12.5 / 600.
// And: the Eat Library "doesnt need a back button and remove the section - library". It is a tab, as
// Day, Grocery and Recipes are, so it takes their header: the masthead and the title.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');
const LIB = readFileSync(new URL('../mobile-app/src/broadsheet/BSGroceryLibrary.jsx', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');

// A function's body, from its declaration to the next top-level declaration.
function body(src, decl) {
  const a = src.indexOf(decl);
  assert.ok(a >= 0, decl + ' is gone');
  const b = src.slice(a + decl.length).search(/\n(?:function |const |\/\/ ═)/);
  return src.slice(a, b < 0 ? src.length : a + decl.length + b);
}

test('the coach header helpers: 32 / 600, 13.5, 17, and links at 12.5 / 600', () => {
  assert.match(PROS, /const bsProH1 = \(t\) => \(\{[^}]*fontSize: 32, fontWeight: 600/);
  // Owner, 2026-10-31, of the Today title and its line: "this does not need to be so bold".
  assert.equal((PROS.match(/<b style=\{\{ fontWeight: 750, color: t\.INK \}\}>/g) || []).length, 0, 'a lede lead at 750');
  assert.equal((PROS.match(/<b style=\{\{ fontWeight: 600, color: t\.INK \}\}>/g) || []).length, 4, 'the four ledes\' leads at 600');
  assert.match(PROS, /const bsProLede = \(t\) => \(\{[^}]*fontSize: 13\.5, fontWeight: 500/);
  assert.match(PROS, /const bsProH2 = \(t\) => \(\{[^}]*fontSize: 17, fontWeight: 700/);
  assert.match(PROS, /const bsProLink = \(t\) => \(\{[^}]*fontSize: 12\.5, fontWeight: 600/);
});

test('Today, Clients and Plans set no line under a row at 14, no 19px head and no button at 14 / 700', () => {
  const parts = {
    Today: body(PROS, 'function BSProToday('),
    Clients: PROS.slice(PROS.indexOf("label: tr('coach:roster.groupRed'"), PROS.indexOf("label: tr('coach:roster.groupRed'") + 12000),
    'the plan row and card': PROS.slice(PROS.indexOf('function bsProTopPlan('), PROS.indexOf('function bsProOpenPerson(')),
  };
  for (const [name, src] of Object.entries(parts)) {
    assert.ok(src.length > 1000, name + ': the scan found too little');
    assert.doesNotMatch(src, /fontFamily: t\.DISPLAY, fontSize: 14,/, name + ': a line under a row at 14');
    assert.doesNotMatch(src, /fontSize: 19\b/, name + ': a 19px head');
    const buttons = src.split('\n').filter((l) => l.includes('<button') && /fontFamily: BS_PRO_SANS, fontSize: 14, fontWeight: 700/.test(l));
    assert.deepEqual(buttons, [], name + ': a button at 14 / 700');
  }
  // The rows themselves, at the member's 15, with the line under them at 12.5.
  assert.match(parts.Today, /fontFamily: t\.DISPLAY, fontSize: 15, fontWeight: 600, color: t\.INK \}\}>\{w\.name\}/);
  assert.match(parts.Today, /marginTop: 2, fontFamily: t\.DISPLAY, fontSize: 12\.5, lineHeight: 1\.35, color: t\.INK70 \}\}>\{w\.directive\}/);
  assert.match(PROS, /fontFamily: t\.DISPLAY, fontSize: 15, fontWeight: lead \? 700 : 600/);
  // Inputs keep 16: iOS zooms the page when a focused box is under it.
  assert.match(PROS, /placeholder=\{[^}]*Search[^]*?fontFamily: t\.DISPLAY, fontSize: 16/);
});

test('the Eat Library is headed as a tab: no Back, no "Section · Library"', () => {
  const lib = body(LIB, 'export function BSGroceryLibrary(');
  assert.doesNotMatch(lib, /BSDetailHeader|onBack|BSBackButton/, 'a Back on the Library');
  assert.doesNotMatch(lib, /grocery\.lib\.kicker/, 'the "Section · Library" line');
  assert.match(lib, /<BSPageHeader trailing=\{<BSHeaderTools onProfile=/);
  assert.match(lib, /nutrition:grocery\.lib\.titleA/);
  assert.match(lib, /nutrition:grocery\.lib\.count/, 'the count of lists is still shown');
  // The client hands it the settings corner, and puts BSHeaderTools where the module reads it.
  assert.match(CLIENT, /<BSGroceryLibrary onLoad=\{loadGroceryList\}[^>]*onProfile=\{onProfile\} \/>/);
  assert.match(CLIENT, /Object\.assign\(window, \{ BSNutritionTopTabs, BSHeaderTools,/);
});
