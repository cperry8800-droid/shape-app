// What Nora knows about training, nutrition, recovery and weight (fitnessKnowledge.mjs) —
// DRIVEN, and held to the rules that make it a sourced library rather than a model's memory.
//
// ⚠ WHY THE CROSS-CHECKS. A figure stated twice can drift apart: the ISSN's everyday protein
// range is in protein-daily and again in keep-muscle, and the calorie floor is in the entry
// and in the prompt's safety line. Each pair is read here, so a change to one fails this test.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FITNESS_KNOWLEDGE, FITNESS_TOPICS, searchFitness } from '../src/lib/ai/fitnessKnowledge.mjs';
import { SHAPE_KNOWLEDGE } from '../src/lib/ai/shapeKnowledge.mjs';

const ROUTE = readFileSync(new URL('../src/app/api/support/chat/route.ts', import.meta.url), 'utf8');
const entry = (id) => FITNESS_KNOWLEDGE.find((e) => e.id === id);

test('every entry is a sourced claim with a searchable shape, in plain prose', () => {
  assert.ok(FITNESS_KNOWLEDGE.length >= 25);
  assert.ok(Object.isFrozen(FITNESS_KNOWLEDGE));
  const ids = new Set(SHAPE_KNOWLEDGE.map((e) => e.id));
  for (const e of FITNESS_KNOWLEDGE) {
    assert.match(e.id, /^[a-z0-9-]+$/);
    assert.ok(!ids.has(e.id), `duplicate id ${e.id} (an id is unique across both libraries)`); ids.add(e.id);
    assert.ok(FITNESS_TOPICS.includes(e.topic), `${e.id} topic ${e.topic}`);
    assert.ok(e.title.length > 8 && e.body.length >= 120 && e.body.length <= 900, `${e.id} body length ${e.body.length}`);
    assert.ok(Array.isArray(e.tags) && e.tags.length >= 5, `${e.id} tags`);
    for (const t of e.tags) assert.equal(t, t.toLowerCase(), `${e.id} tag ${t} must be lowercase`);
    // A source a reader can find: named, and dated where it is a paper or a guideline.
    assert.match(e.source, /\b(19|20)\d{2}\b/, `${e.id} names a dated source`);
    // Nora's reply is a plain bubble: no markdown, no list markers, no emoji.
    assert.doesNotMatch(e.body, /\*\*|^#|^\s*[-*•]\s|\[[^\]]+\]\(|`/m, `${e.id} body is plain prose`);
    assert.doesNotMatch(e.body, /\p{Extended_Pictographic}/u, `${e.id} body has no emoji`);
  }
  // Every topic carries entries.
  for (const topic of FITNESS_TOPICS) assert.ok(FITNESS_KNOWLEDGE.some((e) => e.topic === topic), `topic ${topic} has entries`);
});

test('searchFitness: a member\'s question finds its entry first', () => {
  const cases = [
    ['How much protein should I eat a day?', 'protein-daily'],
    ['protein after workout', 'protein-timing'],
    ['how many carbs before a marathon', 'carbs-training'],
    ['what macro split should I use', 'macro-ranges'],
    ['is creatine safe', 'creatine'],
    ['how much caffeine pre workout', 'caffeine'],
    ['how much water should I drink', 'hydration'],
    ['how many sets per week to build muscle', 'lifting-frequency-volume'],
    ['how long should I rest between sets', 'reps-load-rest'],
    ['should I go to failure', 'progression-effort'],
    ['how do I start lifting', 'beginner-lifting'],
    ['how much cardio per week', 'activity-guidelines'],
    ['how many steps a day', 'steps'],
    ['should I stretch before lifting', 'warmup-stretching'],
    ['how much sleep do I need', 'sleep-amount'],
    ['my legs are so sore after leg day', 'soreness'],
    ['I feel burned out and my lifts are dropping', 'overreaching'],
    ['should I take an ice bath after lifting', 'cold-plunge'],
    ['how fast should I lose weight', 'weight-loss-rate'],
    ['how many calories should I eat to lose weight', 'calorie-floor'],
    ['how do I keep muscle while cutting', 'keep-muscle'],
    ['is keto better than low fat', 'which-diet'],
    ['why did my weight go up overnight', 'scale-swings'],
    ['I am on ozempic, what should I eat', 'glp1'],
    ['I get chest pain when I run', 'red-flags'],
    // Codex on #2731: the common phrasings of a condition find the clearance entry.
    ['Is it safe to exercise with heart disease?', 'red-flags'],
    ['I have high blood pressure, can I lift heavy?', 'red-flags'],
    ['can I work out with diabetes', 'red-flags'],
    ['I blacked out at the gym', 'red-flags'],
    ['I have hypertension, can I exercise?', 'red-flags'],
    ['I have anorexia, how many calories should I eat?', 'eating-disorders'],
    ['I have bulimia, what macros should I hit?', 'eating-disorders'],
    ["I've been making myself throw up after meals", 'eating-disorders'],
    // Codex on #2731: inflections and common phrasings reach the safety entries.
    ['I suddenly get unusually breathless when I run', 'red-flags'],
    ['I fainted at the gym yesterday', 'red-flags'],
    ['I starve myself so I can lose weight. What calorie target?', 'eating-disorders'],
    ['I starved myself last week, what now?', 'eating-disorders'],
    ['I exercise to make up for eating. How many calories should I have?', 'eating-disorders'],
    ['I barely eat anything, what should my macros be?', 'eating-disorders'],
    ['I just had a baby, when can I lift again?', 'pregnancy'],
    ['can I work out while pregnant', 'pregnancy'],
  ];
  for (const [q, id] of cases) assert.equal(searchFitness(q).entries[0]?.id, id, q);
  // Each hit carries its source, so Nora can name it.
  for (const e of searchFitness('how much protein').entries) assert.ok(e.source.length > 10);
  // No hit answers the topic list, as shape_help does.
  const none = searchFitness('zzqx');
  assert.equal(none.entries.length, 0);
  assert.equal(none.topics.length, FITNESS_KNOWLEDGE.length);
});

test('a safety hit returns only safety entries: no how-to and no calorie figure beside it (Codex P1 on #2731)', () => {
  for (const q of ['I have anorexia, how many calories should I eat?', 'I have an eating disorder, what should my deficit be?', 'I have high blood pressure, can I lift heavy?', 'I blacked out at the gym, how long should I rest?']) {
    const ids = searchFitness(q).entries.map((e) => e.id);
    assert.ok(ids.length > 0, q);
    for (const id of ids) assert.equal(FITNESS_KNOWLEDGE.find((e) => e.id === id).topic, 'safety', `${q} → ${id}`);
  }
  // Everyday words stay everyday: none of these is a safety question.
  for (const q of ['how do I compensate for a missed workout', 'should I try restricting carbs', 'I feel like I could throw up during intervals', 'I binged on pizza, how do I get back on track', "I'm not eating meat anymore, how do I get protein?", 'how do I make up for a missed workout']) {
    assert.ok(!searchFitness(q).entries.some((e) => e.id === 'eating-disorders'), q);
  }
});

test('an idiom is not a safety question: "baby steps" is a beginner\'s (Codex on #2731)', () => {
  const ids = searchFitness('I am new to lifting, can you give me baby steps?').entries.map((e) => e.id);
  assert.ok(!ids.includes('pregnancy'), ids.join(','));
  assert.ok(ids.includes('beginner-lifting'), ids.join(','));
});

test('a figure stated twice says the same thing in both places', () => {
  // The ISSN everyday protein range: protein-daily states it, keep-muscle quotes it.
  assert.match(entry('protein-daily').body, /1\.4 to 2\.0 grams of protein per kilogram/);
  assert.match(entry('keep-muscle').body, /1\.4 to 2\.0 g per kilogram/);
  // The pace for lifters: weight-loss-rate states it, keep-muscle quotes it.
  assert.match(entry('weight-loss-rate').body, /0\.5 to 1% of bodyweight a week/);
  assert.match(entry('keep-muscle').body, /0\.5 to 1% of bodyweight a week/);
  // The calorie floor: the entry and the prompt's safety line.
  assert.match(entry('calorie-floor').body, /below 1,200 a day for women or 1,500 for men/);
  assert.match(ROUTE, /a calorie target below 1,200 a day for a woman or 1,500 for a man/);
  // Caffeine within 6 hours of bed: caffeine and sleep-habits cite the same study.
  for (const id of ['caffeine', 'sleep-habits']) {
    assert.match(entry(id).body, /6 hours before bed/);
    assert.match(entry(id).source, /Drake et al\., Journal of Clinical Sleep Medicine \(2013\)/);
  }
});

test('the chat route offers fitness_knowledge to a member only, and answers it from the library', () => {
  const memberTools = ROUTE.slice(ROUTE.indexOf('const MEMBER_TOOLS = ['), ROUTE.indexOf('const MEMBER_READ_TOOLS = ['));
  assert.match(memberTools, /name: 'fitness_knowledge'/, 'the schema sits in MEMBER_TOOLS');
  const visitorTools = ROUTE.slice(ROUTE.indexOf('const TOOLS = ['), ROUTE.indexOf('const WRITE_TOOLS'));
  assert.doesNotMatch(visitorTools, /fitness_knowledge/, 'a visitor\'s TOOLS never carry it');
  assert.ok(!/WRITE_TOOLS = new Set\([^)]*fitness_knowledge/.test(ROUTE), 'a read, never a card');
  const handler = ROUTE.slice(ROUTE.indexOf("if (name === 'fitness_knowledge')"));
  assert.match(handler.slice(0, 600), /if \(!memoryCtx\) return \{ result: \{ error: 'members_only' \}/, 'fails closed without a verified member');
  assert.match(handler.slice(0, 600), /searchFitness\(question, \{ limit: 3 \}\)/);
});

test('the member prompt carries the library rule and the safety lines', () => {
  const note = ROUTE.slice(ROUTE.indexOf('const FITNESS_PROMPT_NOTE ='), ROUTE.indexOf('const MEMBER_PROMPT_NOTE ='));
  assert.match(note, /call fitness_knowledge and answer from the entries it returns, naming the source/);
  assert.match(note, /Never invent a figure, a study or a source/);
  assert.match(note, /Their coach's plan comes first: explain it, never overrule it/);
  for (const sign of ['chest pain', 'fainting', 'irregular heartbeat', 'breathlessness', 'joint pain', 'cola-coloured urine', 'pregnancy', 'GLP-1', 'medication dose', 'diagnosis', 'purging', 'anorexia, bulimia, binge eating', '988']) {
    assert.ok(note.includes(sign), `the safety line names ${sign}`);
  }
  // It rides the member note, so it reaches exactly the callers who have the tool.
  assert.match(ROUTE, /answer those from it\.\\n' \+\n {2}FITNESS_PROMPT_NOTE;/);
});
