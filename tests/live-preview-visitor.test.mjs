// Customize's and Make it yours' live preview is the page as a member who does not follow you sees it.
//
// Codex P2 on #2615: the preview read the owner's own profile and posts with the owner's sign-in, and the
// backend gives an author their locked fields and every post, so a private or friends-only profile, and
// followers-, friends- or private-only posts, showed in a preview that claimed to be the visitors' view.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
const TRAINER = readFileSync(new URL('../mobile-app/src/broadsheet/BSTrainerProfile.jsx', import.meta.url), 'utf8');
const BACKEND = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');

const terrain = CLIENT.slice(CLIENT.indexOf('function BSTerrainProfile({'), CLIENT.indexOf('\nfunction ', CLIENT.indexOf('function BSTerrainProfile({') + 20));
const signal = CLIENT.slice(CLIENT.indexOf('function BSSignalCoachProfile({'), CLIENT.indexOf('\nfunction ', CLIENT.indexOf('function BSSignalCoachProfile({') + 20));

test('a mapped post\'s privacy label is read, and only public, profile and community posts are a stranger\'s', () => {
  // Codex P2 on #2615 (b2c9058): communityPostFromRow's label (Public, Community…) is what a post carries, and a
  // lowercase-only check dropped every visible post; the profile tier is shown to everyone on the profile.
  const row = BACKEND.slice(BACKEND.indexOf('function communityPostFromRow'), BACKEND.indexOf('\n}\n', BACKEND.indexOf('function communityPostFromRow')));
  assert.equal((row.match(/\n\s*privacy[,:]/g) || []).length, 1, 'one privacy on the mapped post');
  const expr = row.match(/\n\s*privacy: (privacy === 'public'[\s\S]*?'Community'),\n/);
  assert.ok(expr, 'the label mapping moved');
  const label = new Function('privacy', `return ${expr[1]};`);
  const src = CLIENT.slice(CLIENT.indexOf('function bsPostSeenByStranger'), CLIENT.indexOf('\n', CLIENT.indexOf('function bsPostSeenByStranger')));
  const seen = new Function(`${src}; return bsPostSeenByStranger;`)();
  for (const v of ['public', 'profile', 'community']) {
    assert.equal(seen({ privacy: label(v) }), true, `${v} → ${label(v)}`);
    assert.equal(seen({ privacy: v }), true, `raw ${v}`);
  }
  assert.equal(seen({}), true, 'a post with no level is the default, community');
  for (const v of ['followers', 'friends', 'private']) {
    assert.equal(seen({ privacy: label(v) }), false, `${v} → ${label(v)}`);
    assert.equal(seen({ privacy: v }), false, `raw ${v}`);
  }
  assert.match(CLIENT, /bsProfileCardFromPost, bsPostSeenByStranger,/, 'not on window for the coach page');
});

test('the member page, previewed, gates a private or friends-only profile and shows no owner-only posts', () => {
  assert.match(terrain, /const asVisitor = !!previewCustom;/);
  assert.match(terrain, /asVisitor\n\s*\? \(live\.is_public === false \|\| live\.visibility === 'friends' \|\| live\.visibility === 'private'\)/);
  assert.match(terrain, /\(photoPosts \|\| \[\]\)\.filter\(\(p\) => !asVisitor \|\| bsPostSeenByStranger\(p\)\)/);
  // The owner's own logged activities are theirs: not in a stranger's view.
  assert.match(terrain, /if \(isSelf && !asVisitor && realFeed && realFeed\.length\)/);
});

test('the Signal coach page, previewed from a coach\'s Customize, gates and filters as the member page does', () => {
  // Codex P2 on #2615 (59c0e25): Customize's coach branch draws BSSignalCoachProfile.
  assert.match(signal, /const asVisitor = !!previewCustom;/);
  assert.match(signal, /asVisitor\n\s*\? \(live\.is_public === false \|\| live\.visibility === 'friends' \|\| live\.visibility === 'private'\)/);
  assert.match(signal, /\(coachPosts \|\| \[\]\)\.filter\(\(p\) => !asVisitor \|\| bsPostSeenByStranger\(p\)\)\.map\(/);
});

test('the coach page, previewed from Make it yours, shows only the posts a stranger sees', () => {
  assert.match(TRAINER, /const seen = previewCustom && typeof W\.bsPostSeenByStranger === 'function' \? all\.filter\(W\.bsPostSeenByStranger\) : all;/);
  assert.match(TRAINER, /\}, \[feedAuthor, postsNonce, !!previewCustom\]\);/);
});
