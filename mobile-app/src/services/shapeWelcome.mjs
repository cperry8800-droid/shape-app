// Shape's welcome at the top of a new coach thread (client-onboarding review, fix 3a: H7).
// When a client's coach subscription is saved, the Stripe webhook opens the coach thread and posts
// this one message from Shape (owner decision 4: the welcome comes from Shape, not the coach).
// The server writes it in English as the message body (src/lib/coach-thread.ts); the app shows it
// in the member's language from the names the message carries in its metadata, and the website
// and the coach's Messages page show the body. Pure, so both sides share it.
//
// A Shape message is the one kind with no sender: the messages insert policy is
// sender_id = auth.uid(), so only the service role can write sender_id null.

/** The first word of a full name, trimmed to something a sentence can carry. */
export function shapeFirstName(full) {
  const first = String(full == null ? '' : full).trim().split(/\s+/)[0] || '';
  return first.slice(0, 40);
}

const TAIL = 'This thread is where you talk: questions, check-ins and plan changes all land here.';

/** The welcome's English text: the body the server stores. */
export function shapeWelcomeText({ client, coach } = {}) {
  const c = String(coach == null ? '' : coach).trim() || 'your coach';
  const who = shapeFirstName(client);
  return who
    ? `${who} and ${c} are now working together on Shape. ${TAIL}`
    : `Your coaching with ${c} starts here. ${TAIL}`;
}

/** Whether a stored message (a `messages` row) is Shape's welcome. */
export function isShapeWelcome(row) {
  return !!row && row.sender_id == null && !!row.metadata && typeof row.metadata === 'object' && row.metadata.shape === 'welcome';
}

/**
 * The welcome as the member reads it: translated from its metadata when a translator is given,
 * else the stored body. `tr(key, { ...vars, defaultValue })` is the app's i18n call.
 */
export function shapeWelcomeShown(row, tr) {
  const body = String((row && row.body) || '');
  if (!isShapeWelcome(row) || typeof tr !== 'function') return body;
  const meta = row.metadata;
  const coach = String(meta.coach || '').trim();
  const client = shapeFirstName(meta.client);
  if (!coach) return body;
  try {
    const out = client
      ? tr('feed:thread.shapeWelcome', { client, coach, defaultValue: shapeWelcomeText({ client, coach }) })
      : tr('feed:thread.shapeWelcomeNoClient', { coach, defaultValue: shapeWelcomeText({ coach }) });
    return typeof out === 'string' && out && !/^feed:/.test(out) ? out : body;
  } catch {
    return body;
  }
}
