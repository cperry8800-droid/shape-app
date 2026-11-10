// mobile-app/src/services/chatThreadBack.mjs
// ── Where an open chat thread's Back goes ──
// Owner, 2026-11-10: "when i click on messages from the coaches page, it brings up message which is
// good, but when i hit back, it bring me to teams page. Make sure back buttons are going back to
// previous page and location user was on."
//
// A thread opens two ways. From Chat's own lists (a row, a channel, a profile's Message inside Chat):
// its Back closes it onto that list. Or another page jumps to it (Coaches' or Home's Message, a search
// result, a notification, a coach's client): the shell pushes where the member was onto the nav history
// first and says so on its request (`back: 'nav'`), and that thread's Back steps the history back
// there, which reopens the page at the scroll it left. The thread the request opened is held by its
// key, so a different thread opened in its place (from a profile inside Chat) goes back to the list.
// Pure, so node --test covers it.

// One thread's identity: its conversation, its channel, or (a sample thread) its name. The same
// identity the thread view is keyed by.
export function bsThreadKey(o) {
  if (!o) return null;
  if (o.conversation_id) return String(o.conversation_id);
  if (o.channelId != null) return 'ch:' + o.channelId;
  return 'n:' + (o.n || '');
}

// The key to hold for the thread a request opened: its own when the request came by a nav jump, else none.
export function bsThreadNavKey(request, opened) {
  return request && request.back === 'nav' ? bsThreadKey(opened) : null;
}

// Is this thread the one a nav jump opened? Its Back then steps the nav history; any other closes to the list.
export function bsThreadViaNav(openChat, navKey) {
  return !!openChat && navKey != null && bsThreadKey(openChat) === navKey;
}
