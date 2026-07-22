import test from 'node:test';
import assert from 'node:assert/strict';
import { bsCookCommand, BS_COOK_COMMANDS } from '../mobile-app/src/services/cookCommands.mjs';

test('bare single-word commands', () => {
  assert.equal(bsCookCommand('next'), 'next');
  assert.equal(bsCookCommand('Next.'), 'next');
  assert.equal(bsCookCommand('back'), 'back');
  assert.equal(bsCookCommand('repeat'), 'repeat');
  assert.equal(bsCookCommand('skip'), 'skip');
  assert.equal(bsCookCommand('done'), 'next');       // "Done · Next" is advance
  assert.equal(bsCookCommand('continue'), 'next');
  assert.equal(bsCookCommand('again'), 'repeat');
  assert.equal(bsCookCommand('previous'), 'back');
});

test('filler words are tolerated around a single command', () => {
  assert.equal(bsCookCommand('next step'), 'next');
  assert.equal(bsCookCommand('ok next please'), 'next');
  assert.equal(bsCookCommand('go back'), 'back');
  assert.equal(bsCookCommand('skip this step'), 'skip');
  assert.equal(bsCookCommand('hey Nora repeat that'), 'repeat');
});

test('multi-word phrase commands', () => {
  assert.equal(bsCookCommand('next step'), 'next');
  assert.equal(bsCookCommand('go on'), 'next');
  assert.equal(bsCookCommand('move on'), 'next');
  assert.equal(bsCookCommand('go back'), 'back');
  assert.equal(bsCookCommand('last step'), 'back');
  assert.equal(bsCookCommand('say that again'), 'repeat');
  assert.equal(bsCookCommand('one more time'), 'repeat');
  assert.equal(bsCookCommand('start the timer'), 'timer');
  assert.equal(bsCookCommand('set timer'), 'timer');
  assert.equal(bsCookCommand('how long left'), 'howlong');
  assert.equal(bsCookCommand('how much time'), 'howlong');
  assert.equal(bsCookCommand('time left'), 'howlong');
  assert.equal(bsCookCommand('how much longer'), 'howlong');
});

test('QUESTIONS containing a command word are NOT swallowed (→ null → Nora Q&A)', () => {
  assert.equal(bsCookCommand('should I go back to searing the chicken now'), null);
  assert.equal(bsCookCommand('what should I do next with the sauce'), null);
  assert.equal(bsCookCommand('can I skip the resting if I am in a hurry'), null);
  assert.equal(bsCookCommand('what can I use instead of buttermilk'), null);
  assert.equal(bsCookCommand('is the chicken done yet how do I tell'), null);
  assert.equal(bsCookCommand('how do I know when the rice is ready'), null);
});

test('a SHORT modal question is not swallowed as a nav/timer command (→ Nora)', () => {
  // Codex P2 #1805: "should I go back?" contains the "go back" phrase and is
  // ≤5 words, but it's asking for advice — it must reach the grounded Q&A.
  assert.equal(bsCookCommand('should I go back'), null);
  assert.equal(bsCookCommand('should I move on'), null);
  assert.equal(bsCookCommand('can I skip this'), null);
  assert.equal(bsCookCommand('do I go on now'), null);
  assert.equal(bsCookCommand('is it time to flip'), null);
  // …bare imperatives are untouched.
  assert.equal(bsCookCommand('go back'), 'back');
  assert.equal(bsCookCommand('move on'), 'next');
  assert.equal(bsCookCommand('skip'), 'skip');
  assert.equal(bsCookCommand('start the timer'), 'timer');
  // …and a modal addressed to NORA ("can you …") is a COMMAND, not advice-
  // seeking — the opener guard is first-person only (adversarial pre-push
  // review caught 'you' in the pronoun group defeating FILLER's design).
  assert.equal(bsCookCommand('can you skip this'), 'skip');
  assert.equal(bsCookCommand('can you repeat that'), 'repeat');
  assert.equal(bsCookCommand('could you go back'), 'back');
});

test('a "how long" COOKING question reaches Nora, not the timer command', () => {
  // The reported false positive (Codex P2 #1805): a recipe timing question is
  // not a timer-status query — it must fall through to the grounded Q&A.
  assert.equal(bsCookCommand('how long should this simmer'), null);
  assert.equal(bsCookCommand('how long to cook the rice'), null);
  assert.equal(bsCookCommand('how much time to bake the fish'), null);
  assert.equal(bsCookCommand('how long until the chicken is done'), null);
  // …while genuine timer-status queries STILL classify (regression guard).
  assert.equal(bsCookCommand('how long left'), 'howlong');
  assert.equal(bsCookCommand('how long to go'), 'howlong');   // the timer idiom
  assert.equal(bsCookCommand('how much longer'), 'howlong');
  assert.equal(bsCookCommand('time left'), 'howlong');
});

test('the "how long" lookaheads exclude copula/prep cooking questions (≤5 words, exercises the lookahead not the length cap)', () => {
  // CodeRabbit #1805: "is" is a copula, not a timer-status word.
  assert.equal(bsCookCommand('how long is this simmer'), null);
  assert.equal(bsCookCommand('how long are the noodles'), null);
  assert.equal(bsCookCommand('how much time to bake'), null);   // exercises the "to X" lookahead
  assert.equal(bsCookCommand('how long until done'), null);     // exercises the modal/prep lookahead
  // …but "is/are + left/remaining" is a genuine timer-status query.
  assert.equal(bsCookCommand('how long is left'), 'howlong');
  assert.equal(bsCookCommand('how long remaining'), 'howlong');
});

test('empty / non-string / junk → null', () => {
  assert.equal(bsCookCommand(''), null);
  assert.equal(bsCookCommand('   '), null);
  assert.equal(bsCookCommand(null), null);
  assert.equal(bsCookCommand(undefined), null);
  assert.equal(bsCookCommand(Symbol('x')), null);
  assert.equal(bsCookCommand(42), null);
  assert.equal(bsCookCommand('umm well I think'), null);
});

test('every classified value is in the command set', () => {
  for (const s of ['next', 'back', 'repeat', 'skip', 'start the timer', 'how long left']) {
    const c = bsCookCommand(s);
    assert.ok(BS_COOK_COMMANDS.includes(c), `${s} → ${c}`);
  }
});
