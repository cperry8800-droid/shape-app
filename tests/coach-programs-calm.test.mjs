// tests/coach-programs-calm.test.mjs
//
// The coach's Programs / Plans page is the owner's A (2026-11-09: "for programs and plans do A"), after
// "reduce the coloring and simplify UI more": one list on the page, colour only as a signal. These hold that
// at the source of BSProCatalog.jsx, and hold the old pages and the preview switch gone, so two looks cannot
// drift back side by side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const PROS = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8');
const CAT = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSProCatalog.jsx'), 'utf8');
const fn = (src, head) => { const at = src.indexOf(head); assert.ok(at >= 0, head); return src.slice(at, src.indexOf('\n}\n', at)); };

test('colour is a signal: teal fills only ＋ From scratch, the empty list\'s build and the sample\'s lone Edit; the role\'s colour only the full stop and the ★', () => {
  assert.equal((CAT.match(/background: tealOf\(t\)/g) || []).length, 2, 'the compact primary pill (a top pick the list does not hold) and the empty list\'s Build from scratch');
  assert.match(fn(CAT, 'export function BSProCatalog('), /const scratch = t\.isLight \? \{ bg: '#0a7a72', fg: '#ffffff' \} : \{ bg: '#34d6c5', fg: '#06201d' \};/, '＋ From scratch, lit as Clients\' ＋ Add');
  const heatUses = CAT.match(/heatOf\(t, [^)]*\)/g) || [];
  assert.deepEqual(heatUses, ['heatOf(t, role)', 'heatOf(t, role)', 'heatOf(t, m.role)'], 'the ★ on a lone top pick, the ★ on a row, the title\'s full stop');
  assert.doesNotMatch(CAT, /filter: 'blur\(|radial-gradient|data-pc-halo/, 'a coloured glow or wash is back');
  assert.doesNotMatch(CAT, /linear-gradient\([^)]*(heat|teal)/i, 'a coloured gradient is back');
  // The picked kind is ink: a bar under the word, as on Clients.
  assert.match(fn(CAT, 'function PcTabs('), /data-pc-tab-bar="" style=\{\{[^}]*background: t\.INK,/);
});

test('one filled action a page: ＋ From scratch; every plan\'s Assign is the quiet pill and Copy a quiet icon', () => {
  const row = fn(CAT, 'function PcRow(');
  assert.doesNotMatch(row, /kind="primary"|kind=\{/, 'a row\'s Assign is quiet');
  assert.match(row, /data-pc-action="copy"[^>]*aria-label=\{tr\('coach:workoutEditor\.copyName'/, 'Copy is an icon with its name for a reader');
  // The most popular plan is a row of the list, not a card of its own; Enrolled is gone.
  assert.doesNotMatch(CAT, /function PcFeatured\(|function PcEnrolled\(|data-pc-enrolled/);
  const lead = fn(CAT, 'function PcLead(');
  assert.match(lead, /kind=\{i === 0 \? 'primary' : 'bare'\}/, 'a top pick the list does not hold keeps Edit, then Duplicate and Share as words');
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
  assert.doesNotMatch(CAT, /function PcFace\(|BSFacetAvatar/, 'the page draws no member faces since Enrolled went');
});
