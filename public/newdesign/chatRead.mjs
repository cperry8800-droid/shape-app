// When a conversation is read: ONE rule for the app and the website (P7; owner, 2026-11-05: "the website
// and app need to fully communicate").
//
// The app marks a thread read (mark_conversation_read, which clears dm_unread for everyone's badges and
// turns the sender's Sent to Seen) when it is open and in view, and holds a message that arrives while it
// is out of sight (another tab, the phone locked) until it comes back. The website's chat never marked
// anything read, showed every live thread as unread 0, and so a thread read on the website kept its
// badge in the app. Both surfaces now decide by this module:
//   · readOnArrival: what a message arriving in a thread means for its read state;
//   · createReadTracker: the open thread's read state over time (opened, a message, back in view);
//   · unreadByConversation / unreadAfterInsert: the per-thread counts from dm_unread() and live rows.
// The app re-exports it (mobile-app/src/services/chatRead.mjs); the website imports it at run time.
// No React, no window, no clock.

/**
 * What a message arriving in a conversation means: 'read' (mark it now: the thread is open, in view,
 * and the message is someone else's), 'wait' (open but out of sight: read when it is back in view) or
 * 'none' (not the open thread, or the viewer's own message: nothing to mark).
 */
export function readOnArrival({ isOpenThread, fromOther, hidden }) {
  if (!isOpenThread || !fromOther) return 'none';
  return hidden ? 'wait' : 'read';
}

/**
 * The open thread's read state. `isHidden()` says whether the page is out of sight; `mark(id)` stores
 * the read (and may return a promise). Opening a thread reads it (or waits until it is in view); a
 * message from someone else into it reads it again (or waits); back in view, a waiting thread is read.
 */
export function createReadTracker({ isHidden, mark }) {
  const hidden = () => { try { return !!(isHidden && isHidden()); } catch (e) { return false; } };
  let openId = null;
  let waiting = false;
  const doMark = (id) => { try { return mark(id); } catch (e) { return null; } };
  return {
    open(id) {
      openId = typeof id === 'string' && id ? id : null;
      waiting = false;
      if (!openId) return null;
      if (hidden()) { waiting = true; return null; }
      return doMark(openId);
    },
    arrived(row, myId) {
      const isOpenThread = !!(openId && row && row.conversation_id === openId);
      const fromOther = !!(row && (!myId || row.sender_id !== myId));
      const what = readOnArrival({ isOpenThread, fromOther, hidden: hidden() });
      if (what === 'wait') waiting = true;
      if (what === 'read') doMark(openId);
      return what;
    },
    shown() {
      if (!openId || !waiting || hidden()) return null;
      waiting = false;
      return doMark(openId);
    },
    close() { openId = null; waiting = false; },
    get openId() { return openId; },
    get waiting() { return waiting; },
  };
}

/** dm_unread()'s rows as { conversationId: count }, counts below 1 left out. */
export function unreadByConversation(rows) {
  const out = {};
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = r && typeof r.conversation_id === 'string' ? r.conversation_id : null;
    const n = Number(r && r.unread);
    if (id && Number.isFinite(n) && n > 0) out[id] = Math.floor(n);
  }
  return out;
}

/**
 * The counts after a live message: one more for its thread, unless it is the viewer's own or it lands
 * in the open thread in view (that one is read as it arrives). A new object; the old is untouched.
 */
export function unreadAfterInsert(map, row, { myId = null, openId = null, hidden = false } = {}) {
  const base = map && typeof map === 'object' ? map : {};
  const id = row && typeof row.conversation_id === 'string' ? row.conversation_id : null;
  if (!id) return base;
  const what = readOnArrival({ isOpenThread: id === openId, fromOther: !myId || row.sender_id !== myId, hidden });
  if (what === 'read' || (myId && row.sender_id === myId)) return base;
  return { ...base, [id]: (Number(base[id]) || 0) + 1 };
}
