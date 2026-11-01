// ─── REPLIES IN A CHAT THREAD (owner, 2026-11-01: "build the day dividers and swipe to reply") ──
// Swipe a message left (a right swipe is Back on every page, BS_SWIPE) and the composer quotes it;
// what you send carries the quote as metadata.reply on the row, a direct message's `messages.metadata`
// and a channel's `channel_messages.metadata` (2026-11-01-channel-message-replies.sql). Read back, the
// quote is another member's input: bsReplyFromMetadata keeps only short strings, and the thread draws
// the quoted message itself when it is on screen, so a stored quote cannot put words in its mouth.

export const BS_REPLY_SNIPPET = 140;   // characters of the quoted words kept with a reply
export const BS_REPLY_NAME = 60;       // characters of the quoted sender's name

/** The quoted words: whitespace run together, cut at BS_REPLY_SNIPPET with an ellipsis. */
export function bsReplySnippet(text) {
  const s = String(text == null ? '' : text).replace(/\s+/g, ' ').trim();
  return s.length > BS_REPLY_SNIPPET ? `${s.slice(0, BS_REPLY_SNIPPET - 1).trimEnd()}…` : s;
}

const idOf = (v) => ((typeof v === 'string' && v) || (typeof v === 'number' && Number.isFinite(v)) ? String(v).slice(0, 64) : null);

/** The reply a message's metadata carries, read strictly; null unless it has words or a name. */
export function bsReplyFromMetadata(md) {
  const r = md && typeof md === 'object' ? md.reply : null;
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const t = typeof r.t === 'string' ? bsReplySnippet(r.t) : '';
  const who = typeof r.who === 'string' ? r.who.replace(/\s+/g, ' ').trim().slice(0, BS_REPLY_NAME) : '';
  if (!t && !who) return null;
  return { id: idOf(r.id), from: idOf(r.from), who: who || 'Member', t };
}

/** The reply to store for a message being answered: its row id, its sender's account and name, its words. */
export function bsReplyFor(m, { myId = null, myName = '' } = {}) {
  if (!m) return null;
  return {
    id: idOf(m.id),
    from: m.me ? idOf(myId) : idOf(m.userId),
    who: (m.me ? (myName || 'You') : (m.who || 'Member')).slice(0, BS_REPLY_NAME),
    t: bsReplySnippet(m.t),
  };
}

// ─── The swipe ─────────────────────────────────────────────────────────────────────────────────
export const BS_REPLY_SWIPE = {
  SLOP: 8,      // the finger must move this far before the touch decides swipe or scroll
  RATIO: 1.2,   // …and leftward by more than RATIO × its vertical travel to be a swipe
  ARM: 56,      // let go past this many px left and it replies
  MAX: 76,      // the message follows the finger this far, no further
};

/** A touch's first decision: null until it has moved SLOP, then 'reply' (mostly leftward) or 'scroll'. */
export function bsReplySwipeDecide({ dx, dy }) {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < BS_REPLY_SWIPE.SLOP) return null;
  return dx < 0 && -dx > BS_REPLY_SWIPE.RATIO * Math.abs(dy) ? 'reply' : 'scroll';
}

/** How far the message sits left while it follows the finger: 0 to -MAX. */
export function bsReplySwipeOffset(dx) {
  return Math.max(-BS_REPLY_SWIPE.MAX, Math.min(0, dx));
}

/** Let go: does it reply? */
export function bsReplySwipeCommits(offset) {
  return -offset >= BS_REPLY_SWIPE.ARM;
}
