// ─── A SHEET'S FOCUS: KEPT IN, AND HANDED BACK ────────────────────────────────────────────────
// For a sheet drawn as an `aria-modal` dialog (Train's full plan, BSTrainPlan.jsx; Codex on #2669: "focus can
// move from the aria-modal sheet into controls on the obscured Train page; closing the sheet also removes the
// focused panel without restoring focus"). bsTrapFocus(panel, onClose) moves focus into the panel, keeps Tab
// and Shift+Tab inside it (the last control wraps to the first and back), closes on Escape, and returns a
// cleanup that hands focus back to whatever had it before, when that is still on the page.
//
// Plain DOM, no React: a sheet calls it in its mount effect and returns its cleanup.

const FOCUSABLE = 'button:not(:disabled), [href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])';

export function bsTrapFocus(panel, onClose) {
  if (!panel || !panel.ownerDocument) return () => {};
  const doc = panel.ownerDocument;
  const before = doc.activeElement;
  const focus = (el) => { try { el.focus({ preventScroll: true }); } catch (e) { try { el.focus(); } catch (e2) { /* not focusable */ } } };
  focus(panel);
  const items = () => [...panel.querySelectorAll(FOCUSABLE)].filter((el) => !el.hidden && el.getAttribute('aria-hidden') !== 'true');
  const key = (e) => {
    if (e.key === 'Escape') { if (onClose) onClose(); return; }
    if (e.key !== 'Tab') return;
    const list = items();
    if (!list.length) { e.preventDefault(); focus(panel); return; }
    const first = list[0], last = list[list.length - 1];
    const at = doc.activeElement;
    const inside = panel.contains(at);
    if (e.shiftKey && (!inside || at === first || at === panel)) { e.preventDefault(); focus(last); }
    else if (!e.shiftKey && (!inside || at === last)) { e.preventDefault(); focus(first); }
  };
  doc.addEventListener('keydown', key);
  return () => {
    doc.removeEventListener('keydown', key);
    if (before && before !== doc.body && typeof before.focus === 'function' && doc.contains(before)) focus(before);
  };
}
