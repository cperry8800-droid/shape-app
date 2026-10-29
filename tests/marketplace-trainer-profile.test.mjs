// The marketplace opens a coach on the coach profile (owner, 2026-10-28: "Open the new profile",
// then "demo environment should show new profile designs"; nutritionists since they got the
// profile too): the person it hands the profile, from the real marketplace module, and the open
// branch that routes there and back.
//
// What it pins: a coach with no account (Shape's seeded listings) is handed with the listing's id,
// so the profile reads that listing fresh and draws a sample from its specialty and rating; a coach
// with an account is handed by the account; a tapped trainer or nutritionist opens the profile, its
// full listing one tap away and back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
const React = require_('react');
const SRC = join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
const { bsmCoachPerson } = await loadRealModule(SRC, {
  registry: new Map([['react', React], ['react-dom', require_('react-dom')]]),
  appendExports: 'exports.bsmCoachPerson = bsmCoachPerson;',
});

test('a seeded listing\'s coach is handed by the listing\'s id, with what a sample is drawn from', () => {
  const leah = { name: 'Leah Kim', provider_id: 41, provider_user_id: null, provider_role: 'trainer', loc: 'Remote', bio: 'HIIT built around clear blocks.', init: 'LK', category: 'HIIT & Conditioning', spec: ['HIIT', 'Fat loss'], rating: 4.8, ratingLive: false };
  const p = bsmCoachPerson(leah, '/m/x.webp');
  assert.equal(p.kind, 'TRAINER');
  assert.equal(p.userId, null, 'no account');
  assert.equal(p.providerId, 41, 'the listing, by its id');
  assert.equal(p.who, 'Leah Kim');
  assert.equal(p.bio, 'HIIT built around clear blocks.');
  assert.equal(p.photo, '/m/x.webp');
  assert.equal(p.specialty, 'HIIT & Conditioning HIIT Fat loss');
  assert.equal(p.rating10, 9.6, 'a seeded five-point rating, doubled as the cards show it');
});

test('a coach with an account is handed by the account, rated by their reviews', () => {
  const p = bsmCoachPerson({ name: 'Maya Okafor', provider_id: 7, provider_user_id: 'u-maya', rating: 9.1, ratingLive: true }, null);
  assert.equal(p.userId, 'u-maya');
  assert.equal(p.providerId, 7);
  assert.equal(p.rating10, 9.1, 'already on the ten-point scale');
  assert.equal(p.photo, null);
});

test('a seeded nutritionist is handed as a nutritionist, by the listing\'s id', () => {
  const p = bsmCoachPerson({ name: 'Rae Lindqvist', provider_id: 52, provider_user_id: null, provider_role: 'nutritionist', category: 'Sports nutrition', spec: ['Endurance'], rating: 4.9, ratingLive: false }, null, true);
  assert.equal(p.kind, 'NUTRI');
  assert.equal(p.userId, null);
  assert.equal(p.providerId, 52);
  assert.equal(p.specialty, 'Sports nutrition Endurance');
  assert.equal(bsmCoachPerson({ name: 'X', provider_id: 1 }, null).kind, 'TRAINER', 'a trainer by default');
});

test('a tapped coach opens the coach profile, its full listing one tap away and back', () => {
  const src = readFileSync(SRC, 'utf8');
  const branch = src.slice(src.indexOf('  if (open) {'), src.indexOf('  if (open) {') + 2600);
  assert.match(branch, /const isCoach = openRole === 'trainer' \|\| openRole === 'nutritionist';\n\s+if \(isCoach && !openListing && window\.BSPublicProfile\) \{/);
  assert.match(branch, /<Profile person=\{bsmCoachPerson\(open, coachPhoto\(open\), nutri\)\} onBack=\{closeOpen\} onListing=\{\(\) => setOpenListing\(true\)\}/);
  assert.match(branch, /goChat\(\(pp && pp\.who\) \|\| open\.name, nutri \? 'Nutritionist' : 'Trainer'\)/, 'Message goes to the coach in their role');
  assert.match(branch, /onProfile=\{isCoach \? \(\) => setOpenListing\(false\) : null\} onBack=\{isCoach \? \(\) => setOpenListing\(false\) : closeOpen\}/);
  assert.match(src, /data-full-profile="" onClick=\{\(\) => \(onProfile \? onProfile\(\) : setShowProfile\(true\)\)\}/, 'the listing\'s leader goes back to the profile it came from');
});
