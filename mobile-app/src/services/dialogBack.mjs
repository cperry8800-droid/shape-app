// ─── THE DIALOG IN FRONT CLOSES ON A BACK ─────────────────────────────────────────────────────────
// The phone's back and the swipe do what the page in front's ← does (the chrome's bsTopPageBack and
// bsPageBackFor, iosAppBroadsheet.jsx). An open sheet or dialog is in front of its page, so a Back closes
// it first, before the page's ← and before the shell's history (the War Room's "App Back" section: with
// Chat's places open on a root tab, the phone's back left the app).
//
// Every `role="dialog"` / `role="alertdialog"` in the app says what a Back does to it:
//   ref={bsDialogRef(close)}            a Back runs close, as its ×, its scrim or Escape does; pass the
//                                       element's own ref after it (bsDialogRef(close, panelRef)) and both
//                                       are kept. A close of null (bsDialogRef(busy ? null : onClose)) is a
//                                       dialog that cannot close right now: a Back stays.
//   data-bs-dialog="stay"               a dialog that must be answered (a required update, a question with
//                                       no way out but its answers): a Back does nothing while it shows. It
//                                       never leaves the app and never steps the page behind it.
// tests/dialog-back.test.mjs holds every dialog in mobile-app/src to one of the two.
//
// Plain DOM, no React: a ref callback stores the close on the element, so a dialog drawn by a helper
// function (no hooks) takes it as easily as a component's.

const CLOSES = new WeakMap();
export const BS_DIALOG_STAY = 'stay';
// Fired when a dialog appears or goes, so the shell looks again at whether a Back has somewhere to go
// (bsNavShell's guard entry): a dialog that opens without a tap (a timer, a reminder) still arms it.
export const BS_DIALOG_EVENT = 'shape:dialog';
const STAY = () => {};

function notify() {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function' && typeof Event === 'function') window.dispatchEvent(new Event(BS_DIALOG_EVENT));
  } catch (e) { /* no window: nothing to tell */ }
}

// The ref for a dialog's element. A fresh callback each render is fine: React hands the old one null and
// the new one the element, and the element keeps the newest close.
export function bsDialogRef(close, ...refs) {
  let at = null;
  return (el) => {
    if (el) {
      const fresh = !CLOSES.has(el);
      CLOSES.set(el, typeof close === 'function' ? close : null);
      at = el;
      if (fresh) notify();
    } else if (at) {
      // A re-render hands null and then the same element straight back; only a dialog that left the page
      // is news.
      const was = at;
      at = null;
      try { setTimeout(() => { if (!was.isConnected) notify(); }, 0); } catch (e) { /* no timers */ }
    }
    for (const r of refs) {
      if (typeof r === 'function') r(el);
      else if (r && typeof r === 'object') r.current = el;
    }
  };
}

export function bsIsDialog(el) {
  const role = el && typeof el.getAttribute === 'function' ? el.getAttribute('role') : null;
  return role === 'dialog' || role === 'alertdialog';
}

// Does a Back stay on this dialog (it must be answered, cannot close right now, or names no close)?
export function bsDialogStays(el) {
  if (!el) return true;
  if (typeof el.getAttribute === 'function' && el.getAttribute('data-bs-dialog') === BS_DIALOG_STAY) return true;
  return typeof CLOSES.get(el) !== 'function';
}

// What a Back does to this dialog: its close, or nothing at all. A dialog that names no close is held, not
// skipped: skipping it would step the page behind it, or leave the app, while it still shows.
export function bsDialogCloseOf(el) {
  if (bsDialogStays(el)) return STAY;
  const close = CLOSES.get(el);
  return () => close();
}

// The dialog in front, of those on screen: each is on top when what is drawn at its own centre is inside
// it (a page or a sheet over it covers that point), and of those on top the later in the document is the
// one opened last (a dialog inside a dialog, a sheet portalled after another). Pure: the caller measures.
// [{ el, onTop }] in document order → the element, or null.
export function bsPickTopDialog(list) {
  let top = null;
  for (const d of list || []) if (d && d.onTop) top = d.el;
  return top;
}
