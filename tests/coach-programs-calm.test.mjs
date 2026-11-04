// tests/coach-programs-calm.test.mjs
//
// The coach's Programs / Plans page is the owner's B (2026-11-04, of three looks: "B for programs just reduce
// size of this button"), after "reduce the coloring and simplify UI more": tiles in the paper's own colour,
// colour only as a signal. These hold that at the source of BSProCatalog.jsx, and hold the old page and its
// preview switch gone, so the two looks cannot drift back side by side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PROS = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
const CAT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSProCatalog.jsx'), 'utf8');
const fn = (src, head) => { const at = src.indexOf(head); assert.ok(at >= 0, head); return src.slice(at, src.indexOf('\n}\n', at)); };

test('colour is a signal: teal fills only the page\'s one primary action and the empty list\'s build; the role\'s colour only the full stop, the picked icon and the ★', () => {
  assert.equal((CAT.match(/background: tealOf\(t\)/g) || []).length, 2, 'the compact primary pill and the empty list\'s Build from scratch');
  const heatUses = CAT.match(/heatOf\(t, [^)]*\)/g) || [];
  assert.deepEqual(heatUses, ['heatOf(t, m.role)', 'heatOf(t, role)', 'heatOf(t, m.role)'], 'the picked icon, the ★, the title\'s full stop');
  assert.doesNotMatch(CAT, /filter: 'blur\(|radial-gradient|data-pc-halo/, 'a coloured glow or wash is back');
  assert.doesNotMatch(CAT, /linear-gradient\([^)]*(heat|teal)/i, 'a coloured gradient is back');
  // The picked sort and the picked chip are ink.
  assert.match(fn(CAT, 'function PcSort('), /\.\.\.\(on \? pcOn\(t\) : \{ color: t\.INK70 \}\)/);
  assert.match(CAT, /const pcOn = \(t\) => \(\{ background: t\.INK, color: t\.PAPER, border: `1px solid \$\{t\.INK\}` \}\);/);
});

test('one filled action a page: the most popular plan\'s Assign (or the sample\'s Edit); every other plan\'s Assign is the quiet pill', () => {
  const featured = fn(CAT, 'function PcFeatured(');
  assert.equal((featured.match(/kind="primary"/g) || []).length, 1);
  assert.match(featured, /kind=\{i === 0 \? 'primary' : 'bare'\}/, 'the sample\'s Edit, then Duplicate and Share as words');
  const row = fn(CAT, 'function PcRow(');
  assert.doesNotMatch(row, /kind="primary"|kind=\{/, 'a row\'s Assign is quiet');
  assert.match(row, /kind="bare" tag="copy"/, 'Copy is the words alone');
});

test('the old page, its primitives and the preview switch are gone', () => {
  for (const name of ['bsProSwatch', 'bsProTypoIndex', 'bsProCreateButton', 'bsProLibrarySearch', 'BSProFeaturedPlan', 'BSProCatRow', 'BSProTextAction', 'bsProStationHead', 'bsProMonoTrail', 'bsProFeatureLead', 'bsProEnrolledRow', 'bsProCatalogLook']) {
    assert.doesNotMatch(PROS, new RegExp(`\\b${name}\\b`), `${name} is back in the pros module`);
  }
  const trainer = PROS.slice(PROS.indexOf('function BSTrainerPrograms('), PROS.indexOf('function BSCoachPlaylistStudio('));
  const nutri = PROS.slice(PROS.indexOf('function BSNutriPlans('), PROS.indexOf('// SHARED PRO ME'));
  for (const [who, src] of [['trainer', trainer], ['nutritionist', nutri]]) {
    assert.equal((src.match(/<BSProCatalog t=\{t\} model=\{model\} \/>/g) || []).length, 1, `${who}: one page`);
    assert.doesNotMatch(src, /<BSProDeck\b|data-cat-row|showSoundtracks|const TABS = /, `${who}: the old page's furniture`);
  }
  const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p]; });
  for (const f of walk(join(ROOT, 'mobile-app/src')).filter((p) => /\.(jsx?|mjs)$/.test(p))) {
    assert.doesNotMatch(readFileSync(f, 'utf8'), /designPreview/, `${f} reads a design preview switch`);
  }
});

test('the page keeps the coach rules: window globals at call time, no import back into the pros or client module', () => {
  assert.doesNotMatch(CAT, /^import .*iosAppBroadsheet/m);
  assert.doesNotMatch(CAT, /^const \{[^}]*\} = window;/m, 'a window global read at module top');
  assert.match(fn(CAT, 'function PcFace('), /const Facet = typeof window !== 'undefined' \? window\.BSFacetAvatar : null;/, 'members as facet avatars, read at render');
});
