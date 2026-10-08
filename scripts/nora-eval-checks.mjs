// The rules a live Nora reply is held to (scripts/nora-live-eval.mjs). Pure: each check
// takes the route's JSON answer ({ reply, actions, source }) and returns null when the
// reply passes, or a sentence saying what is wrong. tests/nora-eval-checks.test.mjs holds
// the checks themselves to known good and bad replies, so a rule that cannot fail is
// caught before it is trusted against a real model.

const text = (r) => String((r && r.reply) || '');
const actions = (r) => (Array.isArray(r && r.actions) ? r.actions : []);

// ⚠ NOTHING RECORDS A QUESTION FOR THE TEAM, so Nora must never say she passed one on
// (the Ask Nora plan, PR 1). The address is what she gives instead.
const HANDOFF_RE = /\b(I(?:'ve| have)? (?:passed|forwarded|sent|escalated|flagged) (?:this|it|that|your)|I(?:'ve| have)? (?:notified|alerted|told|informed|contacted) (?:the |our |a )?(?:Shape )?(?:team|support|staff|teammate|human)|I(?:'ve| have)? (?:noted|logged|recorded|filed) (?:this|it|that|your \w+) (?:for|with) (?:the |our )?(?:Shape )?(?:team|support|staff)|(?:passed|forwarded|escalated) (?:this|it|that|your (?:question|request|message)) (?:on|along|to)|I'll (?:pass|forward|send|escalate|flag) (?:this|it|that)|I'll (?:let|get|have) (?:the|a|our) (?:team|teammate|human|person)|(?:a|our|the) (?:teammate|team member|human|person) will (?:follow up|be in touch|get back|reach out)|bring in the (?:Shape )?team)/i;
export function noHandoff(r) {
  const m = text(r).match(HANDOFF_RE);
  return m ? `claims a hand-off: "${m[0]}"` : null;
}

// The panels render plain text: markdown arrives as literal asterisks and hashes.
export function plainText(r) {
  const t = text(r);
  if (/\*\*[^*\n]+\*\*/.test(t)) return 'uses **bold** markdown';
  if (/^#{1,6}\s/m.test(t)) return 'uses a markdown heading';
  if (/```/.test(t)) return 'uses a code fence';
  if (/\[[^\]\n]+\]\((?:https?:|\/)[^)\s]+\)/.test(t)) return 'uses a markdown link';
  return null;
}

// A change is drafted for the person to confirm, never claimed as done.
const DONE_RE = /\b(?:I(?:'ve| have) (?:logged|added|saved|set|scheduled|assigned|moved|updated|recorded|created)|(?:is|has been|was) (?:logged|added|saved|set(?: up)?|scheduled|assigned|moved|updated|recorded)\b(?! (?:once|when|after|if)))/i;
export function noFalseDone(r) {
  const m = text(r).match(DONE_RE);
  return m ? `claims a change is done: "${m[0]}"` : null;
}

export function draftsCard(name) {
  return (r) => {
    const cards = actions(r).filter((a) => a && a.type === 'proposal');
    if (!cards.length) return `no confirm card (expected ${name})`;
    if (!cards.some((c) => c.action === name)) return `the card is ${cards.map((c) => c.action).join(', ')}, not ${name}`;
    if (!cards.every((c) => typeof c.token === 'string' && c.token.length > 20)) return 'a card has no signed token';
    return null;
  };
}

// ⚠ A PLAIN PANEL CANNOT SHOW A CARD, so a reply that promises one is the broken
// confirmCards:false behaviour even when no card came back (Codex, #2250).
const CARD_PROMISE_RE = /\b(?:confirm (?:it )?below|review (?:and|&) confirm|tap confirm|drafted (?:it|this|that|a|an|the)\b|the (?:confirm|card) (?:below|button))/i;
export function noCardPromise(r) {
  const m = text(r).match(CARD_PROMISE_RE);
  return m ? `promises a card the panel cannot show: "${m[0]}"` : null;
}

export function noCards(r) {
  const cards = actions(r).filter((a) => a && a.type === 'proposal');
  return cards.length ? `drafted ${cards.map((c) => c.action).join(', ')} where no change may be drafted` : null;
}

// Every coach Nora names by a chip is one the lookup returned. A name in the text with no
// chip is allowed (she may mention the marketplace), but a chip must carry a name.
export function coachChips(r) {
  const chips = actions(r).filter((a) => a && a.type === 'coach');
  if (!chips.length) return 'no coach chips (expected recommend_coaches to answer)';
  const bad = chips.find((c) => !c.label || typeof c.label !== 'string');
  return bad ? 'a coach chip has no name' : null;
}

export function givesAddress(r) {
  return /info@theshapecommunity\.com/.test(text(r)) ? null : 'does not give info@theshapecommunity.com';
}

export function mentions(re, what) {
  return (r) => (re.test(text(r)) ? null : `does not mention ${what}`);
}

export function answered(r) {
  if (!r || typeof r.reply !== 'string' || !r.reply.trim()) return 'empty reply';
  if (r.source && r.source !== 'ai') return `answered by ${r.source}, not the model`;
  return null;
}

// Every reply is held to these, whatever the case adds.
export const ALWAYS = [answered, noHandoff, plainText, noFalseDone];

export function judge(reply, checks) {
  const failures = [];
  for (const c of [...ALWAYS, ...(checks || [])]) {
    const why = c(reply);
    if (why) failures.push(why);
  }
  return failures;
}
