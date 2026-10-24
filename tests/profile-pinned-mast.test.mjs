// tests/profile-pinned-mast.test.mjs
//
// The Profile page keeps its masthead while it scrolls, like every other page
// (owner, 2026-10-18: "make sure this mast head stays present when i scroll down
// on profile page on app like all the other pages").
//
// Every other page gets that from BSPage: it watches its own scroller and slides a
// condensed masthead over the top once the page's own masthead scrolls away. The
// member profile (Terrain) and the coach profile (Signal) used to be their own
// `.bs-scroll` with no BSPage, so nothing pinned. Both now render inside BSPage,
// their sticky tab rows stick BELOW that bar (measured, not restated), and the
// Posts jump lands below it too.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const src = stripComments(readFileSync(SRC, 'utf8'));

function body(marker) {
  const at = src.indexOf(marker);
  assert.notEqual(at, -1, `marker not found: ${marker}`);
  const next = src.indexOf('\nfunction ', at + marker.length);
  return src.slice(at, next < 0 ? undefined : next);
}

const { BSTerrainProfile } = await loadBroadsheet(['BSTerrainProfile']);

test('the member profile renders inside BSPage, on the Me tab and pushed', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'member-a' } }) };
  const person = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
  for (const props of [{ isSelf: true, meMode: true }, { isSelf: false }]) {
    const d = drive(BSTerrainProfile, { person, onBack() {}, onMessage() {}, ...props });
    const root = d.nodes()[0];
    assert.equal(root.type, globalThis.BSPage, `the profile (${JSON.stringify(props)}) is its own scroller again — nothing pins its masthead`);
  }
});

test('both profiles are pages, and neither keeps its own scroller or tab-bar spacer', () => {
  for (const marker of ['function BSTerrainProfile(', 'function BSSignalCoachProfile(']) {
    const fn = body(marker);
    assert.match(fn, /return \(\s*<BSPage><div /, `${marker} no longer returns a BSPage`);
    assert.doesNotMatch(fn, /className="bs-scroll"/, `${marker} renders its own scroller again`);
    assert.match(fn, /const pinnedTop = useBSPinnedMastTop\(\);/, `${marker} no longer measures the pinned masthead`);
    assert.match(fn, /scrollMarginTop: pinnedTop/, `${marker}'s Posts jump lands under the pinned masthead`);
  }
  assert.doesNotMatch(body('function BSTerrainProfile('), /height: 92/, 'the member profile pads for the tab bar twice');
  assert.doesNotMatch(body('function BSSignalCoachProfile('), /meMode \? 112/, 'the coach profile pads for the tab bar twice');
});

test('the sticky tab rows stick below the pinned masthead, not under it', () => {
  assert.match(body('function BSTerrainProfile('), /<BSTerrainTabs [^>]*top=\{pinnedTop\}/, 'the member tab row sticks at 0, under the pinned masthead');
  // Both profiles share the one strip since the coach profile took the Wall's look (2026-10-24).
  assert.match(body('function BSSignalCoachProfile('), /<BSTerrainTabs [^>]*top=\{pinnedTop\}/, 'the coach tab row sticks at 0, under the pinned masthead');
  assert.match(body('function BSTerrainTabs('), /position: 'sticky', top,/, 'the tab strip ignores the offset it is given');
  // One measurement for every sticky row in a BSPage, read off the bar itself.
  const hook = body('function useBSPinnedMastTop(');
  assert.match(hook, /querySelector\('\[data-bs-pinned-mast\]'\)/, 'the offset is no longer measured off the bar');
  // In layout px: a rect is zoomed by the Small/Large text size and `top` is zoomed again
  // (Codex, P2 on #2397). tests/kitchen-course-tabs.test.mjs runs it at all three sizes.
  assert.match(hook, /el\.offsetHeight/, 'the bar is measured in screen px again');
  assert.doesNotMatch(hook, /getBoundingClientRect/, 'the bar is measured in screen px again');
});
