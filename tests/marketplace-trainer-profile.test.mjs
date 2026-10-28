// The marketplace opens a trainer on the trainer profile (owner, 2026-10-28: "Open the new
// profile", then "demo environment should show new profile designs"): the person it hands the
// profile, from the real marketplace module, and the open branch that routes there and back.
//
// What it pins: a coach with no account (Shape's seeded listings) is handed with the listing's id,
// so the profile reads that listing fresh and draws a sample from its specialty and rating; a coach
// with an account is handed by the account; a tapped trainer opens the profile, its full listing
// one tap away and back; a nutritionist still opens the listing.
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
const { bsmTrainerPerson } = await loadRealModule(SRC, {
  registry: new Map([['react', React], ['react-dom', require_('react-dom')]]),
  appendExports: 'exports.bsmTrainerPerson = bsmTrainerPerson;',
});

test('a seeded listing\'s coach is handed by the listing\'s id, with what a sample is drawn from', () => {
  const leah = { name: 'Leah Kim', provider_id: 41, provider_user_id: null, provider_role: 'trainer', loc: 'Remote', bio: 'HIIT built around clear blocks.', init: 'LK', category: 'HIIT & Conditioning', spec: ['HIIT', 'Fat loss'], rating: 4.8, ratingLive: false };
  const p = bsmTrainerPerson(leah, '/m/x.webp');
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
  const p = bsmTrainerPerson({ name: 'Maya Okafor', provider_id: 7, provider_user_id: 'u-maya', rating: 9.1, ratingLive: true }, null);
  assert.equal(p.userId, 'u-maya');
  assert.equal(p.providerId, 7);
  assert.equal(p.rating10, 9.1, 'already on the ten-point scale');
  assert.equal(p.photo, null);
});

test('a tapped trainer opens the trainer profile, its full listing one tap away and back; a nutritionist opens the listing', () => {
  const src = readFileSync(SRC, 'utf8');
  const branch = src.slice(src.indexOf('  if (open) {'), src.indexOf('  if (open) {') + 2200);
  assert.match(branch, /if \(isTrainer && !openListing && window\.BSPublicProfile\) \{/);
  assert.match(branch, /<Profile person=\{bsmTrainerPerson\(open, coachPhoto\(open\)\)\} onBack=\{closeOpen\} onListing=\{\(\) => setOpenListing\(true\)\}/);
  assert.match(branch, /onProfile=\{isTrainer \? \(\) => setOpenListing\(false\) : null\} onBack=\{isTrainer \? \(\) => setOpenListing\(false\) : closeOpen\}/);
  assert.match(src, /data-full-profile="" onClick=\{\(\) => \(onProfile \? onProfile\(\) : setShowProfile\(true\)\)\}/, 'the listing\'s leader goes back to the profile it came from');
});
