// "Talk to a person" (the Ask Nora plan, step 5): a signed-in account sends its question,
// with its Nora conversation, to the Shape team; a person replies in the console, and the
// reply lands in the same conversation as a message from the Shape team and by email.
//
// The rules shared by POST /api/support/request, the console (/dashboard/support) and their
// tests. Pure, except appendTeamToThread, which writes through the client it is handed.

import { appendTeamReply, cleanThread } from './ai/noraThread.mjs';

export const QUESTION_MAX = 2000;
export const REPLY_MAX = 4000;
// Three a day per account: the button is for a person, not a channel to page the team.
export const DAILY_MAX = 3;
export const TRANSCRIPT_MAX = 12;
const TRANSCRIPT_TEXT_MAX = 1000;
// Where the questions go. SUPPORT_EMAIL overrides it on the server.
export const SUPPORT_INBOX_DEFAULT = 'info@theshapecommunity.com';

/** A question as sent: trimmed, 1 to QUESTION_MAX characters, else null. */
export function cleanQuestion(value) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\r\n?/g, '\n').trim();
  return s && s.length <= QUESTION_MAX ? s : null;
}

/** A reply as typed in the console, the same way. */
export function cleanReply(value) {
  if (typeof value !== 'string') return null;
  const s = value.replace(/\r\n?/g, '\n').trim();
  return s && s.length <= REPLY_MAX ? s : null;
}

/**
 * The Shape team's real replies to an account: the replies on its answered requests. Only the
 * console writes one (support_requests has no update policy, and an account inserts only an
 * open row with no reply), so a reply here is the team's, whatever nora_threads holds: an
 * account can write its own nora_threads row directly, and could put a 'team' message in it
 * (Codex, #2265). Read with the caller's own client. Resolves { ok, replies: Set<string> }.
 */
export async function answeredReplies(db, userId) {
  try {
    const r = await db.from('support_requests').select('reply')
      .eq('user_id', userId).eq('status', 'answered')
      .order('replied_at', { ascending: false }).limit(200);
    if (r.error) return { ok: false, replies: new Set() };
    return { ok: true, replies: new Set((r.data || []).map((x) => String((x && x.reply) || '').trim()).filter(Boolean)) };
  } catch {
    return { ok: false, replies: new Set() };
  }
}

/** A conversation with only the team messages `replies` vouches for; every other message kept. */
export function withVerifiedTeam(messages, replies) {
  return (Array.isArray(messages) ? messages : []).filter((m) => !m || m.role !== 'team' || replies.has(String(m.text || '').trim()));
}

/**
 * A stored conversation, cleaned, keeping a team message only when it is one of the account's
 * answered replies. A conversation with no team message reads nothing more; a failed read
 * drops every team message, never shows an unverified one.
 */
export async function verifiedThread(db, userId, stored, now = new Date()) {
  const messages = cleanThread(stored, now, { team: true });
  if (!messages.some((m) => m.role === 'team')) return messages;
  const { replies } = await answeredReplies(db, userId);
  return withVerifiedTeam(messages, replies);
}

/** The last TRANSCRIPT_MAX messages of a stored conversation, each cut to 1,000 characters. */
export function transcriptFrom(stored, now = new Date()) {
  return cleanThread(stored, now, { team: true }).slice(-TRANSCRIPT_MAX)
    .map((m) => ({ role: m.role, text: m.text.length > TRANSCRIPT_TEXT_MAX ? `${m.text.slice(0, TRANSCRIPT_TEXT_MAX - 1)}…` : m.text, at: m.at }));
}

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const WHO = { user: 'Them', assistant: 'Nora', team: 'Shape team' };

/** The email to the team inbox. Everything the account wrote is escaped. */
export function supportEmail({ id, name, email, question, transcript, surface, page, consoleUrl }) {
  const who = name ? `${name} <${email}>` : email;
  const lines = (transcript || []).map((m) => `${WHO[m.role] || m.role}: ${m.text}`);
  const text = [
    `${who} asked for a person from Nora's chat (${surface === 'app' ? 'the app' : 'the website'}${page ? `, on ${page}` : ''}).`,
    '',
    question,
    '',
    lines.length ? 'Their conversation with Nora, most recent last:' : 'They had no conversation with Nora before asking.',
    ...lines,
    '',
    `Reply in the console, and it reaches them in Nora's chat and by email: ${consoleUrl}`,
    `Request ${id}`,
  ].join('\n');
  const html = [
    `<p><strong>${esc(who)}</strong> asked for a person from Nora's chat (${surface === 'app' ? 'the app' : 'the website'}${page ? `, on ${esc(page)}` : ''}).</p>`,
    `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #0a8f87;white-space:pre-wrap">${esc(question)}</blockquote>`,
    lines.length
      ? `<p style="color:#666">Their conversation with Nora, most recent last:</p><div style="font-size:13px;color:#444;white-space:pre-wrap">${(transcript || []).map((m) => `<p><strong>${esc(WHO[m.role] || m.role)}:</strong> ${esc(m.text)}</p>`).join('')}</div>`
      : '<p style="color:#666">They had no conversation with Nora before asking.</p>',
    `<p><a href="${esc(consoleUrl)}">Reply in the console</a>: it reaches them in Nora's chat and by email.</p>`,
    `<p style="color:#999;font-size:12px">Request ${esc(id)}</p>`,
  ].join('\n');
  return { subject: `Help request from ${name || email}`, text, html };
}

/** The email to the account when the team replies. */
export function replyEmail({ name, question, reply }) {
  const hi = name ? `Hi ${name.split(/\s+/)[0]},` : 'Hi,';
  const text = [hi, '', 'The Shape team replied to your question:', '', reply, '', `You asked: ${question}`, '', "The reply is also in your conversation with Nora, on the website and in the app."].join('\n');
  const html = [
    `<p>${esc(hi)}</p>`,
    '<p>The Shape team replied to your question:</p>',
    `<blockquote style="margin:0 0 16px;padding:8px 12px;border-left:3px solid #0a8f87;white-space:pre-wrap">${esc(reply)}</blockquote>`,
    `<p style="color:#666;white-space:pre-wrap">You asked: ${esc(question)}</p>`,
    "<p>The reply is also in your conversation with Nora, on the website and in the app.</p>",
  ].join('\n');
  return { subject: 'The Shape team replied', text, html };
}

/**
 * Append the team's reply to an account's Nora conversation, with the same conditional
 * write /api/nora/thread uses, so a device appending at the same moment is never lost.
 * `db` is the console's service-role client. Resolves { ok, error? }.
 */
export async function appendTeamToThread(db, userId, text, now = new Date(), tries = 4) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    const read = await db.from('nora_threads').select('messages, updated_at').eq('user_id', userId).maybeSingle();
    if (read.error) return { ok: false, error: 'read' };
    const row = read.data;
    const messages = appendTeamReply(row ? row.messages : [], text, now);
    if (!messages) return { ok: false, error: 'empty' };
    // Strictly after the stored stamp, so a later device's conditional write still sees a change.
    const prev = row && row.updated_at ? Date.parse(row.updated_at) : NaN;
    const stamp = new Date(Number.isFinite(prev) && prev >= now.getTime() ? prev + 1 : now.getTime()).toISOString();
    if (!row) {
      const created = await db.from('nora_threads').insert({ user_id: userId, messages, updated_at: stamp });
      if (!created.error) return { ok: true };
      if (created.error.code === '23505') continue;
      return { ok: false, error: 'write' };
    }
    const write = await db.from('nora_threads').update({ messages, updated_at: stamp })
      .eq('user_id', userId).eq('updated_at', row.updated_at).select('user_id');
    if (write.error) return { ok: false, error: 'write' };
    if (Array.isArray(write.data) && write.data.length) return { ok: true };
  }
  return { ok: false, error: 'busy' };
}
