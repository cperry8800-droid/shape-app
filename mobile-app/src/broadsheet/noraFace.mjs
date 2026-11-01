// ─── NORA'S FACE, AND WHAT STANDS IN WHEN IT WILL NOT LOAD ─────────────────────
// Owner, 2026-11-01, on the Nora sheet and a chat row showing a broken image where her face
// goes: "also noras avatar is gone now", "avatar broken here also". The file is there and the
// host serves it; a load that fails once (a dropped request, a stalled radio) left the browser's
// broken-image icon, because her faces in the sheet and the talk view are plain <img>s with no
// way back. The website's chat panel already does it right (cwPhotoError in
// public/newdesign/chatWidget.jsx): ask once more past a cached failure, then her N mark in the
// same circle, and if even that fails, step aside. This is the same rule for the app.
//
// Plain JS on purpose: the client, BSNoraTalk.jsx and BSNoraProfile.jsx all import it, and it
// reads no window global, so it is safe at any load order.

/** Her N, in the desk's ink and teal: the stand-in a face that will not load turns into. */
export const BS_NORA_MARK = 'data:image/svg+xml,' + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#0f0c0a"/>'
  + '<text x="50" y="67" text-anchor="middle" font-family="Georgia, serif" font-size="50" fill="#34d6c5">N</text></svg>',
);

/** An <img>'s onError: once more with a fresh query, then the mark, then out of sight. */
export function bsNoraPhotoError(e) {
  const img = e && e.currentTarget;
  if (!img || typeof img.getAttribute !== 'function') return;
  const src = img.getAttribute('src') || '';
  if (!img.getAttribute('data-retried') && src.indexOf('data:') !== 0) {
    img.setAttribute('data-retried', '1');
    img.src = src + (src.indexOf('?') < 0 ? '?' : '&') + 'r=' + Date.now();
    return;
  }
  if (src !== BS_NORA_MARK) { img.src = BS_NORA_MARK; return; }
  img.style.visibility = 'hidden';
}
