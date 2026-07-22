// Cook Mode voice command grammar (spec 2026-07-21 §7.2). A hold-to-talk
// transcript hits THIS local classifier FIRST — a recognized command runs
// instantly with no model round-trip; anything else returns null and falls
// through to Nora's grounded Q&A (§7.3).
//
// Command-first, but false-positive-averse: a genuine QUESTION that happens to
// contain a command word ("should I go back to searing the chicken?") must NOT
// be swallowed as a command. So we only classify a transcript that, after
// stripping filler, IS essentially just the command — substantive extra words
// mean it's a question for Nora.
//
// Pure + deterministic; Symbol/whitespace-safe (transcripts are user speech).

export const BS_COOK_COMMANDS = ['next', 'back', 'repeat', 'skip', 'timer', 'howlong'];

// Filler tokens that don't change a command's meaning ("next step please" ==
// "next"). Kept tight so it can't dissolve a real question into a command.
// The polite-request modals (can/could/would/will) are filler so "could you
// skip this" reduces to the bare `skip` command — a modal + "you" addressed to
// Nora IS a command. First-person advice ("could I skip?") is caught by
// QUESTION_OPENER BEFORE filler runs, so stripping these here can't turn a
// genuine question into a command (Codex P2 #1805, completing the "can you" fix).
const FILLER = new Set([
  'the', 'a', 'an', 'this', 'that', 'it', 'please', 'ok', 'okay', 'now',
  'step', 'one', 'just', 'go', 'lets', 'let', 'us', 'can', 'could', 'would',
  'will', 'you', 'hey', 'nora', 'and', 'to', 'my',
]);

const norm = (s) => (typeof s === 'string' ? s : '')
  .toLowerCase()
  // Drop apostrophes FIRST (straight + curly) so STT contractions collapse to
  // the grammar's forms — "what's left" → "whats left", "let's skip" → "lets
  // skip" — instead of splitting into "what s"/"let s" and missing (Codex P3
  // #1805). A negation like "don't skip" → "dont skip" still stays a non-command
  // (its extra token means it's not a bare "skip").
  .replace(/['’ʼ]/g, '')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Timer-status INTERROGATIVES — checked on the FULL string and NOT word-capped,
// because a natural query is long ("how long is left on the timer" = 6 words).
// Anchored to the "how long"/"how much time|longer" interrogative (a strong
// signal even when long) so a passing mention like "…10 min of time left…"
// buried mid-sentence does NOT match (that elliptical form is capped below).
// The lookaheads already exclude cooking continuations, and runCommand falls
// through to Nora when no timer is running, so a stray cooking "how long" can't
// get a wrong timer answer. Three lookaheads: (1) modal/prep continuations,
// (2) "to X" except the timer idiom "to go", (3) copula except "is/are + left/
// remaining". Codex P2 + adversarial review #1805.
const TIMER_PHRASE = [
  [/\bhow (long|much (time|longer))\b(?!\s+(should|shall|do|does|did|will|would|could|can|til|till|until|before|for|of)\b)(?!\s+to (?!go\b))(?!\s+(is|are|was|were|has|have)\s+(?!left\b|remaining\b))/, 'howlong'],
];
// Word-capped phrases (see bsCookCommand): the elliptical timer forms ("time
// left") and nav/timer-start — a long utterance that merely contains one is a
// question, not a command ("should I go back to the pan now"; "…time left before
// guests arrive, should I rush?").
const CAPPED_PHRASE = [
  // Elliptical timer-status — but NOT when trailed by "to …" ("what's left to
  // do", "time left to cook"), which is a TASK/cooking question for Nora, not a
  // request for the countdown (Codex P2 #1805).
  [/\b(time left|whats left)\b(?!\s+to\b)/, 'howlong'],
  // "start/set [the|a|my] timer" — natural wordings incl. the indefinite article
  // (Codex P3 #1805: "start a timer" previously fell through to Nora).
  [/\b(start|set) (the |a |my )?timer\b/, 'timer'],
  [/\b(go back|previous step|last step|one back)\b/, 'back'],
  [/\b(next step|move on|go on|keep going)\b/, 'next'],
  [/\b(say (that )?again|read (it|that) again|one more time)\b/, 'repeat'],
];

// Single-token commands (after filler is stripped, exactly one meaningful word).
const SINGLE = {
  next: 'next', continue: 'next', forward: 'next', done: 'next',
  back: 'back', previous: 'back',
  repeat: 'repeat', again: 'repeat',
  skip: 'skip',
  timer: 'timer',
};

// A modal/aux question opener + a FIRST-PERSON pronoun ("should I go back?",
// "can I move on?", "do we skip this?") is asking Nora's ADVICE about the
// member's own next move, not issuing a command — even a short one containing a
// nav/timer phrase — so it must reach the grounded Q&A (Codex P2 #1805).
// Advice-seeking, not a command: a modal + a FIRST-PERSON or IMPERSONAL
// third-person subject ("should I go back?", "could it skip this?", "will this
// burn?") is asking Nora, so it reaches the grounded Q&A — even a short one
// containing a nav/timer phrase (Codex P2 + CodeRabbit #1805). Deliberately does
// NOT include "you": a modal + "you" addressed to the assistant ("can you skip
// this") IS a command (FILLER strips can/could/would/will + you so it reduces to
// the bare command). "how"/"what"/"when" are also excluded, so "how long left"
// still classifies as timer-status.
const QUESTION_OPENER = /^(should|shall|can|could|would|will|may|might|do|does|did|am|is|are) (i|we|it|this|that)\b/;

export const bsCookCommand = (transcript) => {
  const t = norm(transcript);
  if (!t) return null;
  if (QUESTION_OPENER.test(t)) return null;
  const words = t.split(' ');

  // Timer-status interrogatives ("how long …") are unambiguous and often long
  // — NOT word-capped.
  for (const [re, cmd] of TIMER_PHRASE) if (re.test(t)) return cmd;

  // Elliptical-timer + nav/timer-start phrases: capped, because a long utterance
  // that merely contains "time left"/"go back"/"next step" is a question, not a
  // command ("should I go back to the pan now" = 7 words).
  if (words.length <= 5) {
    for (const [re, cmd] of CAPPED_PHRASE) if (re.test(t)) return cmd;
  }

  // Strip filler → what's left is the command core. If more than one
  // meaningful token remains, it's not a bare command (→ question).
  const core = words.filter((w) => !FILLER.has(w));
  if (core.length === 1) {
    const cmd = SINGLE[core[0]];
    if (cmd) return cmd;
  }
  return null;
};
