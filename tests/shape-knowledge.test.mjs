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
