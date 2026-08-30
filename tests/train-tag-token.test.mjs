import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  BS_TRAIN_TAG_KEY,
  bsTrainTagLabel,
  bsTrainT,
  bsEmptyTrainProgram,
  bsApplyTrainAdjust,
} from '../mobile-app/src/broadsheet/bsClientWeekDemo.js';

// ⚠ WHY THIS FILE EXISTS. A Train day's `tag` is BOTH a rendered chip and a live
// logic token: `iosAppBroadsheetClient.jsx` reads `cur.tag === 'REST'` to decide
// the deck's rest state. Dropping a tr() on that value — the obvious move when
// localizing the surface — would stop the app recognising a rest day in all
// twelve non-English locales, SILENTLY, with parse, tsc, the build and the whole
// suite green. It is cut 2's vibe-label lesson (key off a stable id, never the
// English word) at a place where the id and the word were the same string.
//
// The fix is a split: `tag` stays the canonical English token, `tagLabel` is what
// a member reads. These tests pin BOTH halves — that translation cannot reach the
// token, and that the token alone is never what gets rendered.

const THEME = { GREEN: '#0f0', RUST: '#f50', AMBER: '#fa0', TEAL: '#0dd' };

/** A translator that answers every key with a marker no English token equals. */
const shouty = (key, opts) => `«${key}»`;

test('the token survives translation; only the label moves', () => {
  const T = bsTrainT(shouty);
  for (const token of Object.keys(BS_TRAIN_TAG_KEY)) {
    const label = bsTrainTagLabel(token, T);
    assert.equal(label, `«${BS_TRAIN_TAG_KEY[token]}»`, `${token} did not route through its key`);
    assert.notEqual(label, token, `${token} rendered as its own token — the split is not doing anything`);
  }
});

test('an unknown tag falls through to itself rather than blanking', () => {
  const T = bsTrainT(shouty);
  assert.equal(bsTrainTagLabel('SOMETHING_NEW', T), 'SOMETHING_NEW');
});

test('bsEmptyTrainProgram keeps tag === REST under a translator that renames everything', () => {
  const days = bsEmptyTrainProgram(THEME, shouty);
  assert.ok(days.length > 0, 'no days built — the fixture is broken, not the rule');
  for (const d of days) {
    assert.equal(d.tag, 'REST', 'the rest-day TOKEN was translated — rest detection is now locale-dependent');
    assert.equal(d.tagLabel, `«${BS_TRAIN_TAG_KEY.REST}»`, 'the rest-day LABEL did not route through the catalog');
  }
});

test('bsApplyTrainAdjust: a coach rest day keeps the token, and a re-themed day keeps its own', () => {
  const program = [
    { tag: 'PUSH', tagLabel: 'Push', moves: [{ l: '100 lb' }], meta: 'RPE 8', title: 'Upper' },
    { tag: 'PULL', tagLabel: 'Pull', moves: [{ l: '90 lb' }], meta: 'RPE 8', title: 'Back' },
  ];
  // ⚠ `updatedAt` is what marks an adjustment as APPLIED — without it the
  // function returns the program untouched by contract, and this test would
  // read that pass-through as a lost token. The fixture carries it on purpose.
  const training = { days: ['Rest', 'Legs day'], intensity: 'maintain', updatedAt: '2026-08-30T00:00:00Z' };
  const out = bsApplyTrainAdjust(program, training, THEME, shouty);

  // Day 0: coach scheduled rest over a training day.
  assert.equal(out[0].tag, 'REST', 'coach-set rest lost its token to the translator');
  assert.equal(out[0].tagLabel, `«${BS_TRAIN_TAG_KEY.REST}»`);

  // Day 1: re-themed by the coach split — a different token, still English.
  assert.equal(out[1].tag, 'LEGS', 'the re-themed token was translated');
  assert.equal(out[1].tagLabel, `«${BS_TRAIN_TAG_KEY.LEGS}»`);
});

test('with no translator at all, token and label are both the shipped English', () => {
  const days = bsEmptyTrainProgram(THEME, null);
  for (const d of days) {
    assert.equal(d.tag, 'REST');
    assert.equal(d.tagLabel, 'REST', 'the no-catalog path must degrade to the English that shipped');
  }
});

// ── The readers ─────────────────────────────────────────────────────────────
// The split is only worth anything if each side is read by the right consumer.
// These are source assertions because the two readers sit inside a ~30k-line
// component with no seam to mount; they are pinned by what the code ANSWERS
// (which identifier the comparison and the render each name), not by spelling.

const CLIENT = fs.readFileSync(
  new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');

test('rest detection compares the TOKEN, never the label', () => {
  const rest = CLIENT.match(/const\s+isRestDay\s*=\s*([^;]+);/);
  assert.ok(rest, 'isRestDay is gone — if the rest state moved, re-point this guard at its new home');
  assert.match(rest[1], /\.tag\b/, 'rest detection stopped reading the token');
  assert.doesNotMatch(rest[1], /tagLabel/, 'rest detection reads the TRANSLATED label — it is now locale-dependent');
});

test('the register renders the LABEL, falling back to the token', () => {
  const line = CLIENT.split('\n').find((l) => l.includes("'session:train.reg.tag'"));
  assert.ok(line, 'the Tag register row is gone — re-point this guard');
  assert.match(line, /tagLabel/, 'the register renders the raw token instead of the translated label');
});

test('every writer that sets a tag sets its label in the same object', () => {
  // A writer that emits a Train tag with no `tagLabel` beside it leaves a day
  // whose chip renders an English token in every locale — the half-applied split.
  //
  // ⚠ SCOPED TO THE TRAIN WRITERS, not to every `tag:` in the tree, and the
  // reason is that the token vocabulary is SHARED. `bsClientWeekDemo.js` is the
  // Train week module, so every tag in it is a Train tag; in the client file the
  // rule holds inside `bsBuildTrainProgram` alone. Elsewhere the same strings
  // appear as pure logic tokens on shapes that never render them — the Eat demo
  // week carries `tag: 'COND'` only to drive its own rest flags, and the meal
  // logger passes `tag:` as a tr() variable. Demanding a label there would be
  // demanding a translation for a string no member ever reads.
  const TOKENS = Object.keys(BS_TRAIN_TAG_KEY).join('|');
  const WRITER = new RegExp(`(^|[\\s{,])tag:\\s*(['"\`](${TOKENS})['"\`]|BS_SPLIT_TAG\\[)`);
  const demo = fs.readFileSync(
    new URL('../mobile-app/src/broadsheet/bsClientWeekDemo.js', import.meta.url), 'utf8');

  // The client-file region: the body of bsBuildTrainProgram.
  const clientLines = CLIENT.split('\n');
  const openIdx = clientLines.findIndex((l) => /^function bsBuildTrainProgram\b/.test(l));
  assert.ok(openIdx >= 0, 'bsBuildTrainProgram is gone — re-point this guard at the builder that replaced it');
  let closeIdx = -1;
  for (let i = openIdx + 1; i < clientLines.length; i += 1) {
    if (clientLines[i] === '}') { closeIdx = i; break; }
  }
  assert.ok(closeIdx > openIdx, 'could not find the end of bsBuildTrainProgram');

  let checked = 0;
  // ⚠ ONE EXEMPTION, AND IT IS A HOUSE RULE RATHER THAN AN OVERSIGHT.
  // `bsBuildDemoTrainProgram` builds the SIGNED-OUT demo week — English copy the
  // house deliberately does not translate (the same reason BSClientTrain stays
  // PARTIAL over its one demo string). It takes no translator at all, so a day
  // it emits carries no `tagLabel` and the render falls back to the English
  // token: correct for a demo day, and coherent rather than half-applied.
  // The exemption is pinned to that ONE function, and the assertion below proves
  // it is still the demo path — so it cannot silently widen over a live writer.
  const demoLines = demo.split('\n');
  const demoOpen = demoLines.findIndex((l) => /^export function bsBuildDemoTrainProgram\b/.test(l));
  assert.ok(demoOpen >= 0, 'bsBuildDemoTrainProgram is gone — re-check whether this exemption still has a subject');
  assert.match(CLIENT, /bsBuildDemoTrainProgram\(t\)/,
    'the demo builder gained a translator argument — it is no longer demo-only, so drop this exemption');
  let demoClose = demoLines.length;
  for (let i = demoOpen + 1; i < demoLines.length; i += 1) {
    if (demoLines[i] === '}') { demoClose = i; break; }
  }
  const demoScrubbed = demoLines.map((l, i) => (i >= demoOpen && i <= demoClose ? '' : l));

  const regions = [
    ['bsClientWeekDemo.js', demoScrubbed, 0],
    ['iosAppBroadsheetClient.jsx (bsBuildTrainProgram)', clientLines.slice(openIdx, closeIdx + 1), openIdx],
  ];
  for (const [label, lines, offset] of regions) {
    lines.forEach((l, i) => {
      if (!WRITER.test(l)) return;
      checked += 1;
      const near = lines.slice(i, i + 3).join('\n');
      assert.match(near, /tagLabel/, `${label}:${offset + i + 1} sets a Train tag with no tagLabel beside it:\n${l.trim()}`);
    });
  }
  // Guard-the-guard: a pattern that matched nothing would pass vacuously.
  assert.ok(checked >= 3, `only ${checked} Train tag writers found — the pattern is broken, not the tree`);
});
