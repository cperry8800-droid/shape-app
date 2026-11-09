// The coach's playlists (Programs › Music, and the Playlists page) keep their look (owner, 2026-11-09, of its
// screenshot: "but do this for playlists"), and say only what is true (owner: "make sure to fix any bugs that
// were found during review"): the Sources tile printed a typed-in 2, and the sample playlists' made-up
// "used by" counts reached a signed-in coach's Attached figure and rows.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const PROS = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx', import.meta.url), 'utf8');
const ST = PROS.slice(PROS.indexOf('function BSProSoundtracks('), PROS.indexOf('\n}\n', PROS.indexOf('function BSProSoundtracks(')));

test('Sources reads the coach\'s connected music sources, "—" until read', () => {
  assert.ok(ST.length > 5000, 'the scan found the playlists page');
  assert.doesNotMatch(ST, /'SOURCES' \}\), '2',/, 'the typed-in 2 is back');
  assert.match(ST, /setSourcesConnected\(\['spotify', 'apple_music'\]\.filter\(\(id\) => !!providers\.find\(p => p\.id === id\)\?\.connected\)\.length\)/);
  assert.match(ST, /sourcesConnected == null \? '—' : String\(sourcesConnected\)/);
});

test('a signed-in coach\'s figures leave out the sample playlists\' made-up counts', () => {
  assert.match(ST, /const usedOf = \(p\) => \(stSignedIn && !isServerRow\(p\) && BS_SOUNDTRACKS_DEMO\.includes\(p\) \? 0 : \(p\.used \|\| 0\)\);/);
  assert.match(ST, /const totalAttached = all\.reduce\(\(s, p\) => s \+ usedOf\(p\) \+ assignedCount\(p\), 0\);/);
  assert.match(ST, /usedOf\(p\) > 0 \? tr\('coach:sound\.usedBy'[^]*?: tr\('coach:sound\.notAssigned'/);
  assert.doesNotMatch(ST, /count: p\.used \}\)/, 'a row prints p.used directly');
});
