import React from 'react';
import { bsReceivedGroceryList, bsReceivedGroceryId } from '../services/groceryShare.mjs';
import { bsGroceryListsStore, bsGroceryListsBaseIn } from '../services/groceryLists.mjs';
import { signOutGen, signOutInProgress } from '../services/signOutGen.mjs';

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

// Where the Eat page keeps a member's own lists between visits, and its tombstones. The cloud document
// (user_goals 'client_grocery_lists') is read and written only through the store below.
const LISTS_KEY = 'shape.recipeGroceryLists';
const DELETED_KEY = 'shape.deletedGroceryIds';

// The app's one grocery lists store (services/groceryLists.mjs), shared by the Eat page and the chat's
// save so both go through one lane. Its base (the lists as this device last synced them) is kept per
// account under BS_GROCERY_BASE_KEY, which the sign-out scrub clears.
export const BS_GROCERY_BASE_KEY = 'shape.recipeGroceryListsBase';
let appStore = null;
export function bsGroceryListsAppStore() {
  if (!appStore) {
    appStore = bsGroceryListsStore({
      db: () => window.shapeDb,
      baseStore: bsGroceryListsBaseIn(() => { try { return window.localStorage; } catch (e) { return null; } }, BS_GROCERY_BASE_KEY),
      // Nothing is written or kept once a sign-out has begun (signOut bumps this before its scrub), and no
      // sync starts while one is under way.
      session: () => (signOutInProgress() ? null : signOutGen()),
    });
  }
  return appStore;
}

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
// ⚠ THE CLOUD WRITE IS SKIPPED, NEVER GUESSED (Codex P1s on #2432). A read that failed writes nothing,
// and the write is bound to the account the read was made for; skipped, the copy is still in local
// storage, and Eat sends it up with its next sync. The store adds the list to the document as just read
// and writes it compare-and-set, so another device's write in between is merged, not overwritten.
// ⚠ IT REPORTS A SAVE ONLY WHEN THE LIST LANDED SOMEWHERE (Codex P2 on #2432). Local storage can refuse
// (off, or full) and the cloud can be unreachable, fail its read or refuse its write; with both failed
// it throws, so the card says so and stays tappable rather than reading "Saved" over a list kept nowhere.
export async function bsSaveReceivedGroceryList(list) {
  if (!list || !list.id) throw new Error('no_list');
  const detail = { list, handled: false };
  try { window.dispatchEvent(new CustomEvent('shape:groceryReceived', { detail })); } catch (e) { /* no listener */ }
  if (detail.handled) return 'eat';
  // Reading window.localStorage itself throws (SecurityError) where the browser denies storage; that is
  // "no local copy", and the cloud is still tried (Codex P2 on #2432).
  let store = null;
  try { store = window.localStorage; } catch (e) { store = null; }
  let local = false;
  if (store) {
    try {
      const lists = readLocalLists();
      if (!lists.some((l) => l && l.id === list.id)) store.setItem(LISTS_KEY, JSON.stringify([list, ...lists]));
      local = true;
    } catch (e) { /* storage off or full */ }
    // Saving it again after deleting an earlier copy brings it back: the Eat page hides deleted ids.
    try {
      const gone = JSON.parse(store.getItem(DELETED_KEY) || '[]');
      if (Array.isArray(gone) && gone.includes(list.id)) store.setItem(DELETED_KEY, JSON.stringify(gone.filter((x) => x !== list.id)));
    } catch (e) { /* storage off */ }
  }
  const cloud = await saveToCloud(list);
  if (cloud) return 'stored';
  if (local) return 'local';
  throw new Error('not_saved');
}

// The cloud half of the save: true only when the list is in the member's own document.
async function saveToCloud(list) {
  try {
    const res = await bsGroceryListsAppStore().add(list);
    return !!(res && res.ok);
  } catch (e) { return false; }
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
