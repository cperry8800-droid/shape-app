import React from 'react';
// ─── THE CLEAN TYPE: GEIST HEADS, INTER TIGHT WORDS ─────────────────────────────────────────────
// The coach pages' type (owner, 2026-10-25, "Do with clean", the header mockup 3, and "I want both"
// of the two faces offered): Today, Clients and Programs set their titles and section heads in Geist
// and their words in Inter Tight, in place of Saira. The member's Home takes the same type (owner,
// 2026-10-28: "Member/client home page font needs to match coaches"), then Train and Eat ("do the
// same for Train and Eat pages"). Both faces are bundled (fonts.css) and draw Cyrillic and Vietnamese.
//
// A page swaps the text face in its own theme (useBSClean) and hands that theme to what it renders
// (BSCleanType), so a child's text follows; the masthead and the top bars sit outside and keep
// theirs. The theme also carries HEAD, the head face: a shared head that reads it (BSFocus.jsx) sets
// itself in Geist on a clean page and in Saira everywhere else.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

export const BS_CLEAN_HEAD = "'Geist', 'Inter Tight', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";
export const BS_CLEAN_SANS = "'Inter Tight', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

export function useBSClean() {
  const base = window.useBS();
  return React.useMemo(() => ({ ...base, DISPLAY: BS_CLEAN_SANS, HEAD: BS_CLEAN_HEAD }), [base]);
}

// ⚠ The app's "regular" weight (tweaks.js, the default) steps every weight down with !important
// rules that know only 400–800 (BSPhone's bs-weight-css), so a 750 head fell to 300 and an 800 title
// to 500. The clean area keeps the weights it is written with, as the mockup shows them: its root is
// 400, a child inherits, and an inline weight is restored (each rule outranks the one it undoes).
const BS_CLEAN_WEIGHTS = [300, 400, 500, 600, 650, 700, 750, 800, 900];
function bsCleanWeightCss() {
  if (typeof document === 'undefined' || document.getElementById('bs-pro-clean-css')) return;
  const s = document.createElement('style');
  s.id = 'bs-pro-clean-css';
  s.textContent = [
    '[data-bs-weight="regular"] [data-bs-clean] { font-weight: 400 !important; }',
    '[data-bs-weight="regular"] [data-bs-clean] * { font-weight: inherit !important; }',
    ...BS_CLEAN_WEIGHTS.map((w) => `[data-bs-weight="regular"] [data-bs-clean] [style*="font-weight: ${w};"] { font-weight: ${w} !important; }`),
  ].join('\n');
  document.head.appendChild(s);
}

export function BSCleanType({ t, children }) {
  React.useEffect(() => { bsCleanWeightCss(); }, []);
  const Ctx = typeof window !== 'undefined' ? window.BSContext : null;
  const body = <div data-bs-clean="" style={{ display: 'contents' }}>{children}</div>;
  return Ctx ? <Ctx.Provider value={t}>{body}</Ctx.Provider> : body;
}

// A sheet that a clean area opens is portalled out of BSCleanType's box: it keeps the clean theme
// (React context crosses the portal) but not the box, so its weights would step down. This hands
// the sheet the box's mark; on any other page it returns the sheet as it is.
export function bsCleanSheet(t, sheet) {
  return t && t.HEAD && sheet ? <div data-bs-clean="" style={{ display: 'contents' }}>{sheet}</div> : sheet;
}
