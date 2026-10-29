// Which visitors count as in the EEA or the UK for consent (Codex on #2334). The website's consent
// banner, the app's usage stats and the sign-up source capture decide by the device's time zone,
// and they decided by /^Europe\//, which misses EEA territory whose IANA zone sits elsewhere: the
// Canaries, Madeira, the Azores, Ceuta, Cyprus, Iceland and France's outermost regions. A visitor
// there got no banner and had their first link remembered before any choice, against the privacy
// policy's promise. One list now, written out in five files; this test holds them equal and pins
// what it covers.
// Run: node --test tests/consent-region.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONSENT_REGION_RE, trackingAllowed } from '../src/lib/signup-source.mjs';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

const COPIES = [
  'src/lib/signup-source.mjs',
  'public/signup-source.js',
  'public/newdesign/pageShell.jsx',
  'mobile-app/src/services/analytics.js',
  'public/click-capture.js',
];

// EEA or UK territory whose zone does not start with Europe/.
const OUTSIDE_EUROPE_PREFIX = [
  'Atlantic/Canary', 'Atlantic/Madeira', 'Atlantic/Azores', 'Africa/Ceuta',
  'Asia/Nicosia', 'Asia/Famagusta', 'Atlantic/Reykjavik', 'Arctic/Longyearbyen', 'Atlantic/Jan_Mayen',
  'America/Guadeloupe', 'America/Martinique', 'America/Cayenne', 'America/Marigot',
  'Indian/Reunion', 'Indian/Mayotte',
];
const EUROPE = ['Europe/London', 'Europe/Dublin', 'Europe/Paris', 'Europe/Berlin', 'Europe/Lisbon', 'Europe/Nicosia', 'Europe/Oslo'];
const ELSEWHERE = [
  'America/New_York', 'America/Los_Angeles', 'America/Sao_Paulo', 'America/Godthab', 'Asia/Tokyo',
  'Asia/Dubai', 'Africa/Casablanca', 'Atlantic/Bermuda', 'Atlantic/Stanley', 'Australia/Sydney', 'UTC', '',
  // a listed name as a prefix or suffix of another zone is not that zone
  'Atlantic/CanaryX', 'XAtlantic/Canary', 'America/Cayenne/Old',
];

test('the five region checks carry the same list', () => {
  for (const rel of COPIES) {
    const m = read(rel).match(/CONSENT_REGION_RE = (\/.+\/);/);
    assert.ok(m, `${rel} declares CONSENT_REGION_RE`);
    assert.equal(m[1], String(CONSENT_REGION_RE), `${rel} has the same list as src/lib/signup-source.mjs`);
    assert.doesNotMatch(read(rel), /\/\^Europe\\\/\/\.test\(/, `${rel} no longer decides by Europe/* alone`);
  }
});

test('each check decides by the list', () => {
  assert.match(read('public/signup-source.js'), /return !CONSENT_REGION_RE\.test\(o\.timeZone\);/);
  assert.match(read('public/newdesign/pageShell.jsx'), /if \(!CONSENT_REGION_RE\.test\(tz\)\) return;\s+\/\/ region-aware: show only for EEA\/UK/);
  assert.match(read('mobile-app/src/services/analytics.js'), /return CONSENT_REGION_RE\.test\(tz\);/);
  assert.match(read('public/click-capture.js'), /return !CONSENT_REGION_RE\.test\(o\.timeZone\);/);
});

test('every Europe/* zone and the EEA zones outside it count; nothing else does', () => {
  for (const tz of [...EUROPE, ...OUTSIDE_EUROPE_PREFIX]) assert.equal(CONSENT_REGION_RE.test(tz), true, tz);
  for (const tz of ELSEWHERE) assert.equal(CONSENT_REGION_RE.test(tz), false, tz || '(empty)');
});

test('with no choice, the first link is not remembered on the Canaries or in Cyprus', () => {
  for (const timeZone of ['Atlantic/Canary', 'Asia/Nicosia', 'Indian/Reunion']) {
    assert.equal(trackingAllowed({ consent: null, gpc: false, timeZone }), false, timeZone);
    assert.equal(trackingAllowed({ consent: 'accept', gpc: false, timeZone }), true, `${timeZone}, accepted`);
  }
  assert.equal(trackingAllowed({ consent: null, gpc: false, timeZone: 'America/New_York' }), true);
});
