// A trainer opened from the marketplace with no Shape account is their listing: the profile draws a
// sample studio around the listing's own facts, read again by its id (#2491). The search screen's
// Recent keeps every profile viewed, and reopens it from what it kept. Codex (P2 on #2491): it kept
// only a name, photo and tier, so reopening a seeded trainer from Recent drew a different, generic
// sample with no listing behind it. These tests take the real marketplace hand-off through Recent and
// back, and drive the search screen's own reopen.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, SRC } from './helpers/broadsheet-mount.mjs';

const mod = await loadBroadsheet(['bsRecentOfPerson', 'bsPersonOfRecent', 'BSUniversalSearch', 'BSPublicProfile']);

// As the marketplace hands a seeded listing's coach to the profile (bsmCoachPerson).
const leah = {
  who: 'Leah Kim', kind: 'TRAINER', userId: null, providerId: 41, city: 'Austin, TX', bio: 'Conditioning for busy people.',
  init: 'L', photo: 'https://example.test/leah.jpg', tier: 'Master', category: 'HIIT & Conditioning', specialty: 'HIIT & Conditioning Intervals', rating10: 9.6,
};

test('a seeded trainer goes into Recent with their listing, and comes back out as the same person', () => {
  const rec = mod.bsRecentOfPerson(leah);
  assert.deepEqual(rec, {
    userId: null, name: 'Leah Kim', role: 'trainer', avatar: leah.photo, tier: 'Master', points: null,
    providerId: 41, specialty: leah.specialty, category: leah.category, rating10: 9.6, city: 'Austin, TX', bio: leah.bio,
  });
  // Through storage, as the search screen reads it.
  const back = mod.bsPersonOfRecent(JSON.parse(JSON.stringify(rec)));
  for (const k of ['who', 'kind', 'providerId', 'specialty', 'category', 'rating10', 'city', 'bio', 'tier', 'photo']) {
    assert.deepEqual(back[k], leah[k], `${k} survives the round trip`);
  }
  assert.equal(back.userId, undefined);
});

test('a seeded nutritionist goes into Recent with their listing too, and comes back a nutritionist', () => {
  const rae = { ...leah, who: 'Rae Lindqvist', kind: 'NUTRI', providerId: 52, category: 'Sports nutrition', specialty: 'Sports nutrition Endurance' };
  const rec = mod.bsRecentOfPerson(rae);
  assert.equal(rec.role, 'nutritionist');
  assert.equal(rec.providerId, 52);
  const back = mod.bsPersonOfRecent(JSON.parse(JSON.stringify(rec)));
  for (const k of ['who', 'kind', 'providerId', 'specialty', 'category', 'rating10', 'city', 'bio']) {
    assert.deepEqual(back[k], rae[k], `${k} survives the round trip`);
  }
});

test('anyone with an account goes into Recent by their account alone, as before', () => {
  const maya = { who: 'Maya Okafor', kind: 'TRAINER', userId: 'u-maya', providerId: 7, photo: null, tier: 'Pro', specialty: 'Strength', rating10: 9 };
  const rec = mod.bsRecentOfPerson(maya);
  assert.deepEqual(rec, { userId: 'u-maya', name: 'Maya Okafor', role: 'trainer', avatar: null, tier: 'Pro', points: null });
  const back = mod.bsPersonOfRecent(rec);
  assert.equal(back.userId, 'u-maya');
  assert.equal(back.providerId, undefined, 'the profile reads an account coach by the account');
  assert.equal(back.tier, undefined, 'an account\'s standing is read live, as before');
  const ann = mod.bsRecentOfPerson({ who: 'Ann Lee', kind: 'CLIENT', userId: 'u-ann', providerId: 3 });
  assert.equal(ann.providerId, undefined);
  // A long listing bio is cut to keep the stored list small.
  assert.equal(mod.bsRecentOfPerson({ ...leah, bio: 'x'.repeat(2000) }).bio.length, 600);
});

test('the search screen reopens a Recent seeded trainer with their listing', () => {
  const stored = [mod.bsRecentOfPerson(leah)];
  globalThis.window.localStorage = { getItem: (k) => (k === 'shape.recentSearch' ? JSON.stringify(stored) : null), setItem() {}, removeItem() {} };
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u-me' } }) };
  globalThis.window.ShapeSearch = { people: () => new Promise(() => {}) };
  globalThis.window.ShapeFollows = { getCached: () => null, stats: () => new Promise(() => {}) };
  const d = drive(mod.BSUniversalSearch, { onClose() {} });
  d.click('TrainerLeah Kim');
  const opened = d.nodes().find((n) => n.type === mod.BSPublicProfile);
  assert.ok(opened, 'the profile opened');
  assert.equal(opened.props.person.providerId, 41);
  assert.equal(opened.props.person.specialty, leah.specialty);
  assert.equal(opened.props.person.rating10, 9.6);
  // And every profile records itself through the same helper.
  const src = readFileSync(SRC, 'utf8');
  assert.match(src, /bsRecentSearchPush\(bsRecentOfPerson\(person\)\);/);
});
