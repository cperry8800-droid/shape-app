// Nora's coach lookup over the LIVE marketplace — DRIVEN against the real
// src/lib/coach-catalog.ts.
//
// ⚠ WHAT THIS EXISTS FOR. recommend_coaches ranked a static example directory
// of 39 invented people while the marketplace both surfaces show is the
// trainers / nutritionists tables — so a member asking for a coach was handed
// names that are on no listing they can open. The live mapping here reads a
// row the way the website's marketplace does MINUS its cosmetic defaults: a
// missing rating is null, not 4.8; a missing rate is null, not $100; unknown
// years are null, not 5 — Nora quotes only what a listing states. The ranking
// puts a real listing before an example one and an at-capacity coach behind,
// and a keyword miss cannot be rescued by standing alone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const cc = await loadRealModule(join(ROOT, 'src/lib/coach-catalog.ts'), { typescript: true });

// A seeded trainer row as production holds it: no rating, no session_price, a
// base price, experience as free text — and the two columns the tables do NOT
// have (location, format) simply absent.
const SEEDED = { id: 2, name: 'Aisha Patel', specialty: 'HIIT & Fat Loss', category: 'HIIT', credential: 'ACE-CPT', experience: '6 years', price: '39.99', session_price: null, rating: null, subscribers: 0, tags: ['HIIT', 'Fat loss', 'Conditioning'], services: null, verified: false, at_capacity: false, owner_id: null };

test('liveCoachFromRow: what the listing states, nothing defaulted in', () => {
  const c = cc.liveCoachFromRow(SEEDED, 'trainer');
  assert.deepEqual(c, {
    name: 'Aisha Patel', tag: 'Trainer', role: 'HIIT & Fat Loss', city: '', rate: 40, rating: null, sessions: null,
    specialties: ['HIIT', 'Fat loss', 'Conditioning'], cert: 'ACE-CPT', years: 6, format: '', category: 'HIIT',
    providerId: 2, verified: false, atCapacity: false,
  });
  // A claimed row with a session price prefers it; a nutritionist reads the plan price.
  assert.equal(cc.liveCoachFromRow({ ...SEEDED, session_price: '50.00', price: '99.00' }, 'trainer').rate, 50);
  const n = cc.liveCoachFromRow({ ...SEEDED, id: 101, name: 'Dr. Sarah Mitchell', meal_plan_price: '120', price: '59.99', services: ['Meal plans', 'Reviews'], verified: true, at_capacity: true, rating: '4.9', subscribers: '12' }, 'nutritionist');
  assert.equal(n.tag, 'Nutritionist');
  assert.equal(n.rate, 120);
  assert.equal(n.rating, 4.9);
  assert.equal(n.sessions, 12);
  assert.deepEqual(n.specialties, ['HIIT', 'Fat loss', 'Conditioning', 'Meal plans']);
  assert.deepEqual({ verified: n.verified, atCapacity: n.atCapacity }, { verified: true, atCapacity: true });
  // A format column, when a table ever grows one, is read the marketplace's way.
  assert.equal(cc.liveCoachFromRow({ ...SEEDED, format: 'Online only' }, 'trainer').format, 'Remote');
  // Unusable rows are null; hostile strings are clipped, never interpreted.
  assert.equal(cc.liveCoachFromRow({ ...SEEDED, id: 'x' }, 'trainer'), null);
  assert.equal(cc.liveCoachFromRow({ ...SEEDED, name: '' }, 'trainer'), null);
  assert.equal(cc.liveCoachFromRow(null, 'trainer'), null);
  assert.equal(cc.liveCoachFromRow({ ...SEEDED, name: 'x'.repeat(500), rating: 'NaN', price: 'free', experience: 'lots' }, 'trainer').name.length, 80);
  const loose = cc.liveCoachFromRow({ ...SEEDED, rating: 'NaN', price: 'free', experience: 'lots', tags: 'not-an-array' }, 'trainer');
  assert.deepEqual({ rate: loose.rate, rating: loose.rating, years: loose.years, specialties: loose.specialties }, { rate: null, rating: null, years: null, specialties: [] });
});

test('mergeCoachPools: live first, examples marked and de-duplicated by name', () => {
  const live = [cc.liveCoachFromRow(SEEDED, 'trainer'), cc.liveCoachFromRow({ ...SEEDED, id: 3, name: 'maya okafor' }, 'trainer')];
  const pool = cc.mergeCoachPools(live, cc.COACH_CATALOG);
  assert.equal(pool[0].name, 'Aisha Patel');
  assert.equal(pool[0].example, undefined, 'a live row is never marked example');
  assert.ok(!pool.some((c) => c.example && c.name.toLowerCase() === 'maya okafor'), 'the example covered by a live name is dropped (case-insensitive)');
  assert.equal(pool.filter((c) => c.example).length, cc.COACH_CATALOG.length - 1);
  assert.equal(cc.mergeCoachPools(live, []).length, 2, 'an empty example list is the app surface');
  assert.ok(cc.COACH_CATALOG.every((c) => c.example === undefined), 'marking never mutates the catalog');
});

test('⚠ RANKING: a real listing before an example, verified ahead, at capacity behind — and standing alone never makes a keyword miss a hit', () => {
  const mk = (over, role = 'trainer') => cc.liveCoachFromRow({ ...SEEDED, ...over }, role);
  const liveA = mk({ id: 11, name: 'Live A', tags: ['Strength'], specialty: 'Strength' });
  const liveVerified = mk({ id: 12, name: 'Live Verified', tags: ['Strength'], specialty: 'Strength', verified: true });
  const liveFull = mk({ id: 13, name: 'Live Full', tags: ['Strength'], specialty: 'Strength', at_capacity: true });
  const example = { ...cc.COACH_CATALOG.find((c) => c.specialties.includes('Marathon')), example: true };
  assert.ok(example.name, 'the catalog has a marathon coach to use as the example');
  const pool = [liveA, liveVerified, liveFull, example];
  assert.deepEqual(cc.rankCoaches({ role: 'any', focus: '', limit: 4, pool }).map((c) => c.name), ['Live Verified', 'Live A', example.name, 'Live Full']);
  // "marathon": only the example matches the words — the live rows' standing must not put them ahead of the one real hit.
  assert.deepEqual(cc.rankCoaches({ role: 'any', focus: 'marathon', limit: 3, pool }).map((c) => c.name), [example.name]);
  // "strength": the live rows match and outrank the example on standing.
  const s = cc.rankCoaches({ role: 'trainer', focus: 'strength', limit: 4, pool }).map((c) => c.name);
  assert.equal(s[0], 'Live Verified');
  assert.equal(s[s.length - 1], 'Live Full', 'at capacity is listed, last');
  assert.ok(!s.includes(example.name));
  // The default pool is still the example directory alone (the no-key fallback path).
  assert.ok(cc.rankCoaches({ role: 'trainer', focus: 'strength', limit: 2 }).every((c) => cc.COACH_CATALOG.includes(c)));
  // ⚠ A focus that names something NOBODY lists is an EMPTY answer — never the top of the
  // directory handed back as if it fit (CodeRabbit, the review of #2130). The fixture control
  // first: the directory really lists no fencing, so an empty answer is the only honest one.
  assert.ok(!cc.COACH_CATALOG.some((c) => /fencing/i.test(JSON.stringify(c))), 'fixture control: no example coach mentions fencing');
  assert.deepEqual(cc.rankCoaches({ role: 'any', focus: 'fencing coach', limit: 3, pool }), [], 'the highest-standing live coach must not come back for a focus they do not fit');
  assert.deepEqual(cc.rankCoaches({ role: 'trainer', focus: 'fencing', limit: 3 }), [], 'the example directory alone answers the same way');
  // A focus with no SEARCHABLE word in it — how a member ASKS, not what they want — is
  // non-specific and still ranks by standing, exactly like no focus at all.
  assert.deepEqual(cc.rankCoaches({ role: 'any', focus: 'find me a good trainer near me', limit: 4, pool }).map((c) => c.name), ['Live Verified', 'Live A', example.name, 'Live Full']);
  assert.deepEqual(cc.rankCoaches({ role: 'any', focus: 'I need help with my nutrition', limit: 4, pool }).map((c) => c.name), ['Live Verified', 'Live A', example.name, 'Live Full'], 'the kind of coach is not a specialty');
});

test('coachProfileUrl: a live listing opens the marketplace\'s derived profile by name; an example opens its static page by slug', () => {
  const live = cc.liveCoachFromRow(SEEDED, 'trainer');
  assert.equal(cc.coachProfileUrl(live), '/newdesign/MemberProfile.html?name=Aisha%20Patel&role=trainer');
  assert.equal(cc.coachProfileUrl(cc.liveCoachFromRow({ ...SEEDED, id: 101, name: 'Dr. Sarah Mitchell' }, 'nutritionist')), '/newdesign/MemberProfile.html?name=Dr.%20Sarah%20Mitchell&role=nutritionist');
  const ex = cc.COACH_CATALOG[0];
  assert.equal(cc.coachProfileUrl(ex), cc.coachUrl(ex));
  assert.match(cc.coachUrl(ex), /Public\.html\?coach=[a-z0-9-]+$/);
});

test('the live read names only columns both tables have, plus the role\'s own price column', () => {
  const cols = cc.LIVE_COACH_COLUMNS.split(',').map((s) => s.trim());
  for (const absent of ['location', 'format', 'session_price', 'meal_plan_price']) assert.ok(!cols.includes(absent), `${absent} must not be in the shared list`);
  for (const needed of ['id', 'name', 'specialty', 'price', 'rating', 'tags', 'services', 'verified', 'at_capacity', 'credential', 'experience']) assert.ok(cols.includes(needed), `${needed} is read by liveCoachFromRow`);
  assert.equal(cc.livePriceColumn('trainer'), 'session_price');
  assert.equal(cc.livePriceColumn('nutritionist'), 'meal_plan_price');
  assert.ok(cc.LIVE_COACH_CAP >= 60, 'the cap sits above today\'s whole directory');
});
