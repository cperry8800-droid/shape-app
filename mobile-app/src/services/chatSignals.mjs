// Read receipts and the typing indicator (owner, 2026-11-02: "build read receipts and typing indicator
// next"). The pure parts live here: what a typing signal may carry, who is typing now, what a thread's
// last message says (Sent or Seen), and the store an open thread reads both from. The wire is in
// shapeBackend.js: a Realtime broadcast channel per thread carries typing and a "seen" nudge, and
// conversation_seen() (2026-11-02-read-receipts.sql) is the only place a read time is read from.

export const BS_TYPING = Object.freeze({
  SEND_EVERY_MS: 2500, // while there are words in the field, an "on" at most this often
  EXPIRE_MS: 6000,     // a typer with no signal for this long is no longer typing
  NAME_MAX: 40,
  ID_MAX: 64,
});

// Control characters and the bidi/zero-width marks that could dress one name up as another.
const HIDDEN = /[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g;

// A typing signal is another client's input, so it keeps an account id and a short name and nothing
// else. Your own signal (the channel never echoes it, but a second tab of yours would) is dropped.
export function bsTypingFromPayload(p, { myId = null } = {}) {
  // (An array has no `u`, so it ends here too.)
  if (!p || typeof p !== 'object') return null;
  const userId = typeof p.u === 'string' ? p.u.trim() : '';
  if (!userId || userId.length > BS_TYPING.ID_MAX || (myId && userId === myId)) return null;
  const name = typeof p.n === 'string' ? p.n.replace(HIDDEN, '').replace(/\s+/g, ' ').trim().slice(0, BS_TYPING.NAME_MAX) : '';
  return { userId, name, on: p.on !== false };
}

// Who is typing, by account: { [userId]: { name, until } }. An "off" (or a message from them) takes
// them off at once; an "on" keeps them EXPIRE_MS past it.
export function bsTypingNext(map, sig, now) {
  const next = { ...(map || {}) };
  if (!sig || !sig.userId) return next;
  if (sig.on) next[sig.userId] = { name: sig.name || (next[sig.userId] && next[sig.userId].name) || '', until: now + BS_TYPING.EXPIRE_MS };
  else delete next[sig.userId];
  return next;
}

export function bsTypingLive(map, now) {
  return Object.entries(map || {})
    .filter(([, v]) => v && v.until > now)
    .map(([userId, v]) => ({ userId, name: v.name || '' }));
}

// What the composer sends as you type: an "on" when there are words and none went out in the last
// SEND_EVERY_MS, an "off" once when the field empties, else nothing.
export function bsTypingSend(lastAt, text, now) {
  const words = !!String(text == null ? '' : text).trim();
  if (words) return (!lastAt || now - lastAt >= BS_TYPING.SEND_EVERY_MS) ? 'on' : null;
  return lastAt ? 'off' : null;
}

// How the typing line reads: one name, two, or "several".
export function bsTypingWho(live) {
  const list = Array.isArray(live) ? live : [];
  if (!list.length) return { kind: 'none' };
  if (list.length === 1) return { kind: 'one', a: list[0].name };
  if (list.length === 2) return { kind: 'two', a: list[0].name, b: list[1].name };
  return { kind: 'many' };
}

// conversation_seen()'s answer → { [userId]: iso } of the others whose reads may be shown, or null when
// none may: your own read receipts are off, the answer is malformed, or the function isn't there yet.
export function bsSeenFromRpc(data, { myId = null } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data) || data.on !== true || !Array.isArray(data.seen)) return null;
  const out = {};
  for (const r of data.seen) {
    if (!r || typeof r.user_id !== 'string' || !r.user_id || (myId && r.user_id === myId)) continue;
    const ms = Date.parse(r.last_read_at);
    if (!Number.isFinite(ms)) continue;
    if (!(r.user_id in out) || Date.parse(out[r.user_id]) < ms) out[r.user_id] = new Date(ms).toISOString();
  }
  return out;
}

// What a thread's last word says, when it is yours and stored: 'seen' (and by how many), else 'sent'.
// null when receipts can't be shown, the last word is theirs, or yours is still on its way (no id).
// Shape's own notes are from neither side, so they are passed over.
export function bsReceiptFor(messages, seen) {
  if (!seen || typeof seen !== 'object' || !Array.isArray(messages)) return null;
  let i = messages.length - 1;
  while (i >= 0 && messages[i] && messages[i].shape) i -= 1;
  const m = i >= 0 ? messages[i] : null;
  if (!m || !m.me || !m.id) return null;
  const at = Date.parse(m.at);
  if (!Number.isFinite(at)) return null;
  const count = Object.values(seen).filter((iso) => Date.parse(iso) >= at).length;
  return { index: i, state: count ? 'seen' : 'sent', count };
}

// A thread's history can be read more than once at a time (on opening, and again on coming back into
// view), and the answers can land in either order. So a read is merged into what the thread holds, by
// message id, rather than replacing it: a slower, older snapshot never takes away a message a newer one
// showed (Codex on #2565). The same id keeps the latest read of it; the result is oldest first. A row
// with no id is no stored message and is left out.
export function bsMergeThreadHistory(prev, id, rows) {
  const base = prev && prev.id === id && Array.isArray(prev.messages) ? prev.messages : [];
  const byId = new Map();
  for (const m of [...base, ...(Array.isArray(rows) ? rows : [])]) {
    if (m && m.id != null && m.id !== '') byId.set(String(m.id), m);
  }
  const messages = [...byId.values()].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
  return { id, messages };
}

export const BS_SIGNALS_EMPTY = Object.freeze({ typing: Object.freeze([]), seen: null });

// The store an open thread reads with useSyncExternalStore: per thread key ('dm:<id>' or 'ch:<id>'),
// who is typing and the others' read times. A snapshot only changes when something in it does, and
// reading one never creates anything. A typer runs out on their own: a timer republishes at the
// earliest expiry.
export function createThreadSignalStore({ now = () => Date.now(), setTimer = (fn, ms) => setTimeout(fn, ms), clearTimer = (h) => clearTimeout(h) } = {}) {
  const slots = new Map();
  const slot = (key) => {
    let s = slots.get(key);
    if (!s) { s = { typing: {}, seen: null, snap: BS_SIGNALS_EMPTY, subs: new Set(), timer: null }; slots.set(key, s); }
    return s;
  };
  const publish = (s) => {
    const t = now();
    s.typing = Object.fromEntries(Object.entries(s.typing).filter(([, v]) => v && v.until > t));
    s.snap = Object.freeze({ typing: Object.freeze(bsTypingLive(s.typing, t)), seen: s.seen });
    if (s.timer != null) { clearTimer(s.timer); s.timer = null; }
    const ends = Object.values(s.typing).map((v) => v.until);
    if (ends.length) s.timer = setTimer(() => { s.timer = null; publish(s); }, Math.max(0, Math.min(...ends) - t) + 20);
    [...s.subs].forEach((fn) => { try { fn(); } catch (e) { /* a listener's fault is its own */ } });
  };
  // A thread left (or an account signed out): its typers and read times go with it.
  const clear = (key) => {
    const s = slots.get(key);
    if (!s) return;
    if (s.timer != null) clearTimer(s.timer);
    slots.delete(key);
    [...s.subs].forEach((fn) => { try { fn(); } catch (e) { /* as above */ } });
  };
  return {
    get: (key) => (key && slots.has(key) ? slots.get(key).snap : BS_SIGNALS_EMPTY),
    subscribe: (key, fn) => {
      if (!key || typeof fn !== 'function') return () => {};
      const s = slot(key);
      s.subs.add(fn);
      return () => { s.subs.delete(fn); };
    },
    typing: (key, sig) => {
      if (!key || !sig || !sig.userId) return;
      const s = slot(key);
      s.typing = bsTypingNext(s.typing, sig, now());
      publish(s);
    },
    setSeen: (key, seen) => {
      if (!key) return;
      const s = slot(key);
      s.seen = seen && typeof seen === 'object' && !Array.isArray(seen) ? { ...seen } : null;
      publish(s);
    },
    clear,
    clearAll: () => { [...slots.keys()].forEach(clear); },
  };
}
