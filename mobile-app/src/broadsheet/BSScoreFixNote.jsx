import React from 'react';
// ─── THE SCORE FIX NOTE (the coach Score page) ───────────────────────────────
// Score was corrected on 2026-11-05: session completion counts only sessions that have happened
// (completed, or confirmed and unmarked a day after), and "Programs published" counts the coach's
// published programs, not every assigned workout (supabase-migrations/2026-11-05-coach-score-
// past-sessions.sql, src/app/api/coach/score/route.ts). Every coach's score moved, so the coach
// Score page says so, under the breakdown, for 30 days from the day the fix shipped.
//
// ⚠ SET BS_SCORE_FIX_ON TO THE DAY THE FIX SHIPS (the PR merges and the migration runs), and
// COACH_SCORE_FIX_ON in public/newdesign/leaderboards.jsx to the same day: tests/coach-score-fix.
// test.mjs holds the two equal.
//
// Its own module, as BSLeaderboard and BSIntegrationsPage are, rather than more lines in the client
// module: it reads no window global, and carries its own useShapeTr.

export const BS_SCORE_FIX_ON = '2026-11-05';
export const BS_SCORE_FIX_DAYS = 30;

// Whether the note shows at `now`: from the fix's day for 30 days.
export function bsScoreFixShown(now = Date.now()) {
  const start = Date.parse(BS_SCORE_FIX_ON + 'T00:00:00Z');
  return Number.isFinite(start) && now >= start && now < start + BS_SCORE_FIX_DAYS * 86400000;
}

// The fix's day in the app's language ("5 November 2026", "5. November 2026" …); English where the
// runtime has no names for the locale.
export function bsScoreFixDate(locale) {
  const at = new Date(Date.parse(BS_SCORE_FIX_ON + 'T00:00:00Z'));
  try { return at.toLocaleDateString(locale || undefined, { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
  catch (e) { return at.toLocaleDateString('en-US', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }); }
}

// The i18n translator for this module (the self-contained copy every feature module carries).
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// The line itself. `role` is the coach score's role: a nutritionist's has no programs term, so their
// line names sessions alone. `t` is the page's theme (useBS()).
export function BSScoreFixNote({ role, t, now }) {
  const tr = useShapeTr();
  if (!bsScoreFixShown(typeof now === 'number' ? now : Date.now())) return null;
  let locale = null;
  try { locale = window.ShapeLocale?.get?.() || null; } catch (e) { locale = null; }
  const date = bsScoreFixDate(locale);
  const text = role === 'nutritionist'
    ? tr('score:coach.fixNoteNutri', { date, defaultValue: 'We corrected how Score counts sessions on {date}. Your score may have moved.' })
    : tr('score:coach.fixNote', { date, defaultValue: 'We corrected how Score counts sessions and programs on {date}. Your score may have moved.' });
  return (
    <div role="note" data-score-fix style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.HAIR}`, fontFamily: t.DISPLAY, fontSize: 12.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.4 }}>
      {String(text).replace('{date}', date)}
    </div>
  );
}
