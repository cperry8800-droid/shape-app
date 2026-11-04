// A screen holding unsaved work that a tab tap (or a jump elsewhere) would drop, asks first (Codex on
// #2594: the meal-plan editor sits inside the Plans tab, with the tab bar under it). The screen holds
// the guard while it has unsaved changes and lets go when it has none or goes; whatever would take
// the coach away asks it first. One at a time; kept on the window, as the app's other shared state is,
// so every module bundled into the app reads the same one.

const KEY = '__bsLeaveGuard';

/** Hold the guard: `ask` resolves true to leave. Returns the release, which drops only this one. */
export function holdLeave(w, ask) {
  if (!w || typeof ask !== 'function') return () => {};
  w[KEY] = ask;
  return () => { if (w[KEY] === ask) delete w[KEY]; };
}

/** Whether the coach may be taken away: true with no guard held, else what the guard says. */
export async function mayLeave(w) {
  const ask = w && w[KEY];
  if (typeof ask !== 'function') return true;
  try { return (await ask()) === true; } catch (e) { return false; }
}
