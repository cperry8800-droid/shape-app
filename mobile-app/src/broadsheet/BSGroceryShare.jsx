import React from 'react';
import { bsReceivedGroceryList, bsReceivedGroceryId } from '../services/groceryShare.mjs';

// A grocery list sent to another member (owner, 2026-10-23: "I want to also create ability to send grocery
// lists to other shape members"). The message and the strict reading of what arrives are in
// services/groceryShare.mjs; this module draws the card a thread shows for it and saves the copy.
//
// Window globals are read at call time and the module never imports back into the client module (the
// BSIntegrationsPage / BSLeaderboard pattern).

const { useState, useEffect } = React;

function useShapeTr() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// Where the Eat page keeps a member's own lists between visits, and the cloud document it merges in on
// mount (user_goals 'client_grocery_lists').
const LISTS_KEY = 'shape.recipeGroceryLists';
const DELETED_KEY = 'shape.deletedGroceryIds';
const CLOUD_KIND = 'client_grocery_lists';

function readLocalLists() {
  try {
    const v = JSON.parse(window.localStorage?.getItem(LISTS_KEY) || '[]');
    return Array.isArray(v) ? v : [];
  } catch (e) { return []; }
}

export function bsHasGroceryList(id) {
  return !!id && readLocalLists().some((l) => l && l.id === id);
}

// Save a received list as one of the recipient's own.
// ⚠ ONE WRITER AT A TIME. While the Eat page is mounted it owns the lists: it writes its whole state to
// local storage and to the cloud document whenever that state changes, so a copy written past it would
// be overwritten by its next write. So the list is offered to it first ('shape:groceryReceived'); it
// takes the list into its own state and marks the event handled. Only when nothing took it (Eat is not
// on screen) is it written where the Eat page reads on its next mount: local storage, and the cloud
// document read, merged and written back, so another device has it too.
export async function bsSaveReceivedGroceryList(list) {
  if (!list || !list.id) throw new Error('no_list');
  const detail = { list, handled: false };
  try { window.dispatchEvent(new CustomEvent('shape:groceryReceived', { detail })); } catch (e) { /* no listener */ }
  if (detail.handled) return 'eat';
  const local = readLocalLists();
  if (!local.some((l) => l && l.id === list.id)) {
    try { window.localStorage?.setItem(LISTS_KEY, JSON.stringify([list, ...local])); } catch (e) { /* storage off */ }
  }
  // Saving it again after deleting an earlier copy brings it back: the Eat page hides deleted ids.
  try {
    const gone = JSON.parse(window.localStorage?.getItem(DELETED_KEY) || '[]');
    if (Array.isArray(gone) && gone.includes(list.id)) window.localStorage?.setItem(DELETED_KEY, JSON.stringify(gone.filter((x) => x !== list.id)));
  } catch (e) { /* storage off */ }
  const db = window.shapeDb;
  if (!(db && db.getUserGoals && db.saveUserGoals)) return 'local';
  try {
    const saved = await db.getUserGoals(CLOUD_KIND);
    const arr = Array.isArray(saved) ? saved : [];
    if (!arr.some((l) => l && l.id === list.id)) await db.saveUserGoals(CLOUD_KIND, [list, ...arr]);
    return 'stored';
  } catch (e) { return 'local'; }
}

// The card under a grocery list's message. `shared` is the strictly parsed { name, items }
// (bsGroceryFromMetadata); `me` is the sender's own copy of the message, which has nothing to save.
// `canSave` is false in the coach apps: a coach's lists live in coach_grocery_lists, not the member's
// Eat lists this saves to, so a copy saved there would land where their app never shows it.
export function BSGroceryShareCard({ shared, me = false, canSave = true, messageId = null, from = '' }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const id = bsReceivedGroceryId(messageId);
  const [saved, setSaved] = useState(() => bsHasGroceryList(id));
  const [busy, setBusy] = useState(false);
  if (!shared || !Array.isArray(shared.items) || !shared.items.length) return null;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const count = shared.items.length;
  const preview = shared.items.slice(0, 3).map((it) => it.n).join(' · ');
  const save = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (saved || busy) return;
    const list = bsReceivedGroceryList(shared, { messageId, from });
    if (!list) return;
    setBusy(true);
    try {
      await bsSaveReceivedGroceryList(list);
      setSaved(true);
      window.__bsToast?.(tr('nutrition:grocery.share.savedToast', { defaultValue: 'Saved to your grocery lists' }), 'ok');
    } catch (err) {
      window.__bsToast?.(tr('nutrition:grocery.share.saveFail', { defaultValue: 'Could not save the list. Try again.' }), 'error');
    }
    setBusy(false);
  };
  return (
    <div data-bs-grocery-share="" style={{ marginTop: 9, minWidth: 200, padding: '10px 12px', background: t.PAPER, border: `1px solid ${teal}55`, borderRadius: 10, textAlign: 'left' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
        <span aria-hidden style={{ width: 30, height: 30, flex: 'none', borderRadius: 8, background: `${teal}1f`, border: `1px solid ${teal}55`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={teal} strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M3 4h2.2l2.3 11h10.6l2-7.5H6.4" /><circle cx="9.5" cy="19" r="1.4" /><circle cx="16.5" cy="19" r="1.4" /></svg>
        </span>
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{shared.name}</span>
          <span style={{ display: 'block', marginTop: 1, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
            {tr('nutrition:grocery.share.meta', { defaultValue: count === 1 ? 'Grocery list · 1 item' : `Grocery list · ${count} items`, count })}
          </span>
        </span>
      </div>
      <div style={{ marginTop: 7, fontFamily: t.BODY, fontSize: 12, lineHeight: 1.35, color: t.INK50, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
        {preview}{count > 3 ? ' …' : ''}
      </div>
      {me || !canSave ? null : (
        <button type="button" data-bs-grocery-save="" onClick={save} disabled={busy} aria-pressed={saved}
          style={{ marginTop: 9, width: '100%', minHeight: 44, borderRadius: 8, border: `1px solid ${teal}`, background: saved ? `${teal}14` : teal, color: saved ? teal : (t.isLight ? '#fff' : t.PAPER), cursor: saved ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
          {saved
            ? tr('nutrition:grocery.share.saved', { defaultValue: '✓ Saved to your lists' })
            : tr('nutrition:grocery.share.save', { defaultValue: 'Save to my lists' })}
        </button>
      )}
    </div>
  );
}
