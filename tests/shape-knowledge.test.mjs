// What Nora knows about how Shape works — DRIVEN, and held to its sources.
//
// ⚠ WHY THE PARITY HALF EXISTS. A knowledge base is a set of claims, and the
// ones that can drift are the ones a member will act on: the price, the coach
// fee, the tier thresholds, the credentials rule. Each is read here from the
// page or the app source that states it, so a change there fails this test
// rather than leaving Nora quoting last quarter's number with a source line
// that says otherwise.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { SHAPE_KNOWLEDGE, searchKnowledge } from '../src/lib/ai/shapeKnowledge.mjs';

const PRICING = readFileSync(new URL('../public/newdesign/pricing.jsx', import.meta.url), 'utf8');
const CLIENT = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
const entry = (id) => SHAPE_KNOWLEDGE.find((e) => e.id === id);

test('every entry is a sourced claim with a searchable shape', () => {
  assert.ok(SHAPE_KNOWLEDGE.length >= 12);
  assert.ok(Object.isFrozen(SHAPE_KNOWLEDGE));
  const ids = new Set();
  for (const e of SHAPE_KNOWLEDGE) {
    assert.match(e.id, /^[a-z-]+$/);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id}`); ids.add(e.id);
    assert.ok(e.title.length > 8 && e.body.length >= 80 && e.body.length <= 900, `${e.id} body length ${e.body.length}`);
    assert.ok(Array.isArray(e.tags) && e.tags.length >= 4, `${e.id} tags`);
    for (const t of e.tags) assert.equal(t, t.toLowerCase(), `${e.id} tag ${t} must be lowercase`);
    assert.ok(e.source && e.source.length > 3, `${e.id} names its source`);
  }
});

test('searchKnowledge: tags outrank titles outrank body words, whole words only, and no hit answers the topic list', () => {
  assert.equal(searchKnowledge('how much does shape cost').entries[0].id, 'membership');
  assert.equal(searchKnowledge('can i cancel').entries[0].id, 'cancel');
  assert.equal(searchKnowledge('what are the tiers').entries[0].id, 'shape-score');
  assert.ok(searchKnowledge('are coaches verified').entries.map((e) => e.id).includes('credentials'));
  assert.equal(searchKnowledge('how does cook mode work').entries[0].id, 'cook-mode');
  assert.equal(searchKnowledge('what can you do').entries[0].id, 'nora');
  // 'age' is a tag of the account entry; "manage" must not fire it.
  assert.ok(!searchKnowledge('manage').entries.some((e) => e.id === 'account'));
  const miss = searchKnowledge('hi');
  assert.deepEqual(miss.entries, []);
  assert.equal(miss.topics.length, SHAPE_KNOWLEDGE.length);
  // minScore: the rule-based fallback demands a tag or a title hit.
  assert.deepEqual(searchKnowledge('is there', { minScore: 4 }).entries, []);
  assert.equal(searchKnowledge('how much does shape cost', { minScore: 4 }).entries[0].id, 'membership');
  assert.equal(searchKnowledge('coach', { limit: 99 }).entries.length <= 5, true, 'limit clamps to five');
  assert.equal(searchKnowledge('coach', { limit: 0 }).entries.length, 1, 'limit clamps to one');
  const e = searchKnowledge('cancel').entries[0];
  assert.deepEqual(Object.keys(e).sort(), ['body', 'id', 'source', 'title']);
});

test('⚠ THE PRICE AND THE FEE ARE THE PRICING PAGE\'S OWN', () => {
  assert.match(PRICING, /\$5\/mo/, 'the pricing page no longer states $5/mo — update the membership entry');
  assert.match(PRICING, /15% platform fee/, 'the pricing page no longer states the 15% fee — update the coach-fees entry');
  assert.match(entry('membership').body, /\$5 a month/);
  assert.match(entry('coach-fees').body, /15% platform fee/);
  assert.match(entry('coach-fees').body, /join and list for free/);
  // The owner's fee terms (2026-10-18), as the code charges them (src/lib/coach-origin.mjs): the 15%
  // is on a client who found the coach on Shape, nothing on one the coach brought, and Stripe's
  // card-processing fee comes out of the coach's share. The entry said "15% on everything" and "card processing is separate" after the
  // pages stopped saying it (Codex on #2396).
  assert.match(PRICING, /nothing on a client who subscribes through their own invite or referral link\. Stripe's card-processing fee comes out of their share\./, 'the pricing page changed its fee terms — update the coach-fees entry');
  const fees = entry('coach-fees').body;
  assert.match(fees, /when a client who found the coach on Shape pays them, and nothing on a client who subscribes through the coach’s own invite or referral link within 30 days of it/);
  // The 0% is a 30-day window from the invite or the link (resolve_coach_checkout_origin), not a
  // promise about every client a coach knows (Codex on #2396).
  assert.doesNotMatch(fees, /nothing on clients the coach brings\b/);
  // Stripe's card-processing fee is the coach's, as the Terms say (owner, 2026-10-18).
  assert.match(fees, /Stripe’s card-processing fee comes out of the coach’s share/);
  // The same labelled estimate the coach pages show (coachForecast.js processingCents, part C).
  assert.match(fees, /estimated at about 2\.9% \+ 30¢ a US card charge plus 0\.7% Stripe Billing on a subscription \(the coach’s own Stripe pricing decides it\)/);
  assert.doesNotMatch(fees, /Shape pays the card processing/);
  assert.match(fees, /on the schedule they set there/, 'payouts follow the coach\'s own Stripe schedule');
  assert.doesNotMatch(fees, /on everything|processing is separate|weekly|instant/i);
  assert.equal(searchKnowledge('can I bring my own clients as a coach').entries[0].id, 'coach-fees');
});

test('⚠ THE CREDENTIALS RULE IS TERMS CLAUSE 04, VERBATIM, as the app renders it', () => {
  const m = CLIENT.match(/\['04', 'Coaches', '([^']+)'\]/);
  assert.ok(m, 'the app no longer renders Terms clause 04 in that shape');
  assert.ok(entry('credentials').body.includes(m[1]), 'the credentials entry drifted from the Terms clause');
  assert.match(m[1], /self-reported and not independently verified/, 'the clause itself still says what the entry rests on');
});

test('⚠ THE TIER NAMES AND THRESHOLDS ARE THE SCORE PAGE\'S OWN, for members and for coaches', () => {
  const block = (name) => {
    const a = CLIENT.indexOf(`const ${name} = [`);
    assert.ok(a > 0, `${name} not found`);
    return CLIENT.slice(a, CLIENT.indexOf('\n];', a));
  };
  const members = [...block('SHAPE_SCORE_TIERS').matchAll(/\{ name: '([A-Za-z]+)', range: '([\d,]+)\+'/g)].map((m) => [m[1], m[2]]);
  assert.equal(members.length, 5, 'five member tiers');
  const body = entry('shape-score').body;
  for (const [name, from] of members) assert.ok(body.includes(`${name} from ${from}`), `the Score entry lacks "${name} from ${from}"`);
  const coaches = [...block('SHAPE_SCORE_TIERS_COACH').matchAll(/\{ name: '([A-Za-z]+)'/g)].map((m) => m[1]);
  assert.equal(coaches.length, 5, 'five coach rungs');
  for (const name of coaches) assert.ok(body.includes(name), `the Score entry lacks the coach rung ${name}`);
});

// The Morning check-in (docs/REVIEW-2026-10-19-morning-checkin.md §3.4, §3.8, §3.9, §3.10): what it
// is, what readiness means, who sees what, and that the website has none.
test('the Morning check-in entry: found by its words, and says what the app says', () => {
  for (const q of ['how does the morning check-in work', 'what is morning readiness', 'who sees my check-in answers', 'what have you noticed about my mornings', 'is there a check-in on the website', 'why am I tired']) {
    assert.equal(searchKnowledge(q).entries[0].id, 'morning-checkin', q);
  }
  // The questions other entries answer stay theirs.
  assert.equal(searchKnowledge('what can you do').entries[0].id, 'nora');
  assert.equal(searchKnowledge('how do I earn points for sleep').entries[0].id, 'shape-score');
  const body = entry('morning-checkin').body;
  assert.match(body, /on Home in the Shape app from 4 a\.m\./);
  assert.match(body, /With a nutritionist, Home also asks about hunger between meals from 6 p\.m\./);
  assert.match(body, /0-100 guide from your own answers[^.]*\(Ready, Steady, Take it easy, Run down\), not a medical reading\./);
  // Who sees this, as §3.4 says it now (ruling 18).
  assert.match(body, /Your trainer and nutritionist see your answers; readiness and the patterns are only yours\./);
  assert.match(body, /The website has no check-in\./);
  assert.match(body, /The weekly check-in for your coach is a separate form\./);
  assert.doesNotMatch(body, /\/\s?10\b|of 10\b|because/);
  const en = JSON.parse(readFileSync(new URL('../mobile-app/src/i18n/catalogs/en/home.json', import.meta.url), 'utf8'));
  for (const k of ['mornings.bandReady', 'mornings.bandSteady', 'mornings.bandEasy', 'mornings.bandLow']) assert.ok(body.includes(en[k]), `the band ${en[k]}`);
  assert.ok(body.includes(en['mornings.patternsTitle'].replace("'", '’')), 'What we’ve noticed, by its title');
});
