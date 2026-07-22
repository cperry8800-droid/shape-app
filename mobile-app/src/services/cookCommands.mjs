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
const FILLER = new Set([
  'the', 'a', 'an', 'this', 'that', 'it', 'please', 'ok', 'okay', 'now',
  'step', 'one', 'just', 'go', 'lets', 'let', 'us', 'can', 'you', 'hey',
  'nora', 'and', 'to', 'my',
]);

const norm = (s) => (typeof s === 'string' ? s : '')
  .toLowerCase()
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

// Multi-word command phrases checked on the FULL normalized string, before
// filler-stripping, so "how long" / "time left" survive intact.
const PHRASE = [
  // Unambiguous timer-status forms.
  [/\b(time left|whats left)\b/, 'howlong'],
  // "how long" / "how much time|longer" is a TIMER-STATUS query only when it
  // isn't the FRONT of a recipe question ("how long SHOULD this simmer", "how
  // much time TO bake", "how long IS this simmer") — a trailing modal/aux/prep
  // OR a copula not leading to left/remaining means the member wants a COOKING
  // answer, which the local timer command can't give, so it must reach Nora.
  // Three lookaheads: (1) modal/prep continuations, (2) "to X" except the timer
  // idiom "to go", (3) copula ("is/are/has …") except "is left"/"is remaining".
  // Codex P2 + CodeRabbit #1805.
  [/\bhow (long|much (time|longer))\b(?!\s+(should|shall|do|does|did|will|would|could|can|til|until|before|for|of)\b)(?!\s+to (?!go\b))(?!\s+(is|are|was|were|has|have)\s+(?!left\b|remaining\b))/, 'howlong'],
  [/\b(start (the )?timer|set (the )?timer)\b/, 'timer'],
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
// Deliberately FIRST PERSON ONLY: a modal + "you" addressed to the assistant
// ("can you skip this", "could you go back") IS a command — FILLER contains
// can/you precisely so those reduce to the bare command (adversarial pre-push
// review). "how"/"what"/"when" are also NOT here, so "how long left" still
// classifies as timer-status.
const QUESTION_OPENER = /^(should|shall|can|could|would|will|may|might|do|does|did|am|is|are) (i|we)\b/;

export const bsCookCommand = (transcript) => {
  const t = norm(transcript);
  if (!t) return null;
  if (QUESTION_OPENER.test(t)) return null;
  const words = t.split(' ');

  // A short utterance can be a phrase command; a long one is a question even if
  // it contains "go back" etc. Cap keeps "should I go back to the pan now?"
  // (7 words) out of the command path.
  if (words.length <= 5) {
    for (const [re, cmd] of PHRASE) if (re.test(t)) return cmd;
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
