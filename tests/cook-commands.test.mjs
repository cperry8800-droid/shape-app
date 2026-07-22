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
  assert.equal(bsCookCommand('start a timer'), 'timer');   // indefinite article (Codex P3 #1805)
  assert.equal(bsCookCommand('set a timer'), 'timer');
  assert.equal(bsCookCommand('start my timer'), 'timer');
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
  // …and a modal addressed to NORA ("can/could/would/will you …") is a
  // COMMAND, not advice-seeking — the opener guard is first-person only, and
  // ALL the polite modals are filler so they reduce to the bare command
  // (Codex P2 #1805: 'can' alone was filler, leaving could/would in the core).
  assert.equal(bsCookCommand('can you skip this'), 'skip');
  assert.equal(bsCookCommand('can you repeat that'), 'repeat');
  assert.equal(bsCookCommand('could you go back'), 'back');
  assert.equal(bsCookCommand('could you skip this'), 'skip');
  assert.equal(bsCookCommand('would you repeat that'), 'repeat');
  assert.equal(bsCookCommand('will you skip this'), 'skip');
  // …but first-person "could I / would we …" stays advice-seeking → Nora.
  assert.equal(bsCookCommand('could I skip this'), null);
  assert.equal(bsCookCommand('would we go back'), null);
  // …and so does an IMPERSONAL third-person modal question — "could it skip
  // this" must not strip down to the bare command (CodeRabbit #1805).
  assert.equal(bsCookCommand('could it skip this'), null);
  assert.equal(bsCookCommand('should this go back'), null);
  assert.equal(bsCookCommand('is that done'), null);
});

test('timer-status queries are NOT word-capped; nav phrases are (Codex P2 #1805)', () => {
  // A natural timer-status ask runs long — it must still classify locally,
  // because Nora has no timer state (the cookContext carries none).
  assert.equal(bsCookCommand('how long is left on the timer'), 'howlong');    // 6 words, uncapped how-long
  assert.equal(bsCookCommand('how much time is left on the timer'), 'howlong'); // 7 words, uncapped how-much
  // …while the lookaheads still route long COOKING "how long" asks to Nora…
  assert.equal(bsCookCommand('how long should the chicken rest before slicing'), null);
  assert.equal(bsCookCommand('how long until the chicken is done'), null);
  assert.equal(bsCookCommand('how long till the chicken is done'), null);   // 'till' spelling
  // …NAV + elliptical-timer phrases stay capped: a long utterance that merely
  // CONTAINS one is a question, not a command.
  assert.equal(bsCookCommand('should I go back to the pan now please'), null);
  assert.equal(bsCookCommand('i have ten minutes of time left before guests arrive'), null);
  // …but the short elliptical timer forms still classify.
  assert.equal(bsCookCommand('time left'), 'howlong');
  assert.equal(bsCookCommand('whats left'), 'howlong');
  // …and "whats/time left TO …" is a task/cooking question → Nora (Codex P2 #1805).
  assert.equal(bsCookCommand("what's left to do"), null);
  assert.equal(bsCookCommand('whats left to prep'), null);
  assert.equal(bsCookCommand('time left to cook'), null);
});

test('a wh-QUESTION embedding a nav phrase reaches Nora, not the command (Codex P2 #1805)', () => {
  // "what is the next step" / "when do I move on" contain next-step/move-on but
  // are questions — they must NOT advance the recipe.
  assert.equal(bsCookCommand('what is the next step'), null);
  assert.equal(bsCookCommand("what's the next step"), null);   // apostrophe → "whats the next step"
  assert.equal(bsCookCommand('when do I move on'), null);
  assert.equal(bsCookCommand('where do I go back to'), null);
  assert.equal(bsCookCommand('which step is next'), null);
  // …the genuine elliptical timer forms still classify (they run before the guard).
  assert.equal(bsCookCommand('whats left'), 'howlong');
  assert.equal(bsCookCommand('time left'), 'howlong');
  assert.equal(bsCookCommand('how long left'), 'howlong');   // "how" isn't a wh-guard word
  // …and the plain imperatives still fire.
  assert.equal(bsCookCommand('next step'), 'next');
  assert.equal(bsCookCommand('move on'), 'next');
  assert.equal(bsCookCommand('go back'), 'back');
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

test('STT contractions with apostrophes still match (Codex P3 #1805)', () => {
  assert.equal(bsCookCommand("what's left"), 'howlong');   // → "whats left"
  assert.equal(bsCookCommand("let's skip"), 'skip');       // → "lets skip" → skip
  assert.equal(bsCookCommand("let’s skip this"), 'skip'); // curly apostrophe
  // …a NEGATION is not a command — "don't skip" / "can't skip this" must NOT
  // fire skip (the extra token keeps it out of the bare-command path).
  assert.equal(bsCookCommand("don't skip"), null);
  assert.equal(bsCookCommand("can't skip this"), null);
  // …and a negated PHRASE command must fall through too (Codex P2 #1805):
  // "don't go back" / "do not move on" / "don't start the timer" reach Nora.
  assert.equal(bsCookCommand("don't go back"), null);
  assert.equal(bsCookCommand('do not move on'), null);
  assert.equal(bsCookCommand("don't start the timer"), null);
  assert.equal(bsCookCommand('never mind go back'), null);
  assert.equal(bsCookCommand("can't go back"), null);
  // …the plain imperatives still fire.
  assert.equal(bsCookCommand('go back'), 'back');
  assert.equal(bsCookCommand('move on'), 'next');
  assert.equal(bsCookCommand('start the timer'), 'timer');
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
