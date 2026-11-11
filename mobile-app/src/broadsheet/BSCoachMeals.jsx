import React from 'react';
import { BSFocusTitle } from './BSFocus.jsx';
import { bsCoachExerciseDate } from './BSCoachExercises.jsx';

// ─── EAT · FROM YOUR NUTRITIONIST ───────────────────────────────────────────────────────────────
// The meals a nutritionist adds from the website's Live console ("+ Add to today's plan"), on the day
// they were added, under the day's menu on Eat (BSEatDay.jsx), and each nutritionist's grocery note, on
// Grocery (BSGroceryList.jsx) and under today's meals. The member's "New meal + grocery items" and "Note
// on your grocery list" notices open Eat, so this is where they land.
//
// ⚠ BEFORE THIS THE MEALS SHOWED NOWHERE (left by #2686). The console saved each as a coach_pushed_items
// row and /api/client/nutrition sent them as `todayMeals`, which nothing read; a grocery note could not
// be saved at all. The read is /api/client/coach-meals (window.ShapeCoachFeed.meals): the member's last
// seven days, each meal on the member's day it was sent, and the notes, from nutritionists the member
// pays now. The days are the account's, as Train's coach exercises are (bsCoachExerciseDate).
//
// A failed read says so with a Retry, never as "nothing sent"; loading and an empty day draw nothing.
// An add or a removal in the console redraws it live (ShapeCoachFeed.subscribeMeals), and so does
// coming back to the app.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx), and this module
// never imports the client module.

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

const pad = (n) => String(n).padStart(2, '0');

/** A read's meals on `date`, grouped by the nutritionist who added them, in the order the first of each was added. */
export function bsCoachMealGroups(read, date) {
  const list = read && read.status === 'ready' && read.days && Array.isArray(read.days[date]) ? read.days[date] : [];
  const groups = [];
  for (const m of list) {
    if (!m || typeof m.name !== 'string' || !m.name.trim()) continue;
    const key = String(m.providerId ?? '');
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, coachName: m.coachName || null, items: [] }; groups.push(g); }
    g.items.push(m);
  }
  return groups;
}

/** A read's grocery notes, the newest first; none unless the read is in. */
export function bsCoachGroceryNotes(read) {
  return read && read.status === 'ready' && Array.isArray(read.notes)
    ? read.notes.filter((n) => n && typeof n.text === 'string' && n.text.trim())
    : [];
}

/** The member's pushed meals and notes, read on mount, on a change in the console, on an account change and back in the app. */
export function useBSCoachMeals() {
  const [read, setRead] = React.useState({ status: 'loading' });
  const [account, setAccount] = React.useState(0);
  const seq = React.useRef(0);
  const load = React.useCallback(async () => {
    const mine = ++seq.current;
    const api = window.ShapeCoachFeed;
    if (!api || typeof api.meals !== 'function') { setRead({ status: 'none' }); return; }
    let next;
    try { next = await api.meals(); } catch (e) { next = { status: 'error' }; }
    // Only the newest read lands: an older one answering late never paints over it.
    if (mine === seq.current) setRead(next && next.status ? next : { status: 'error' });
  }, []);
  React.useEffect(() => {
    load();
    const api = window.ShapeCoachFeed;
    const unsubscribe = api && typeof api.subscribeMeals === 'function' ? api.subscribeMeals(() => { load(); }) : () => {};
    const identity = () => { seq.current += 1; setRead({ status: 'loading' }); setAccount((n) => n + 1); };
    const foreground = () => { if (typeof document === 'undefined' || document.visibilityState !== 'hidden') load(); };
    window.addEventListener?.('shape:identity', identity);
    if (typeof document !== 'undefined') document.addEventListener?.('visibilitychange', foreground);
    return () => {
      seq.current += 1;
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (e) { /* nothing left to stop */ }
      window.removeEventListener?.('shape:identity', identity);
      if (typeof document !== 'undefined') document.removeEventListener?.('visibilitychange', foreground);
    };
  }, [load, account]);
  return { read, retry: load };
}

// The pieces below are plain render helpers on the caller's theme and translator (no hooks of their
// own), so a view draws them inline.
function unreadBlock(t, tr, text, onRetry) {
  return (
    <div data-coach-meals="error" role="status" style={{ margin: `${(t.sectGap || 22)}px ${t.padX}px 0`, display: 'flex', alignItems: 'center', gap: 12, paddingTop: 10, borderTop: `1px solid ${t.HAIR || t.RULE}` }}>
      <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70 }}>{text}</span>
      {onRetry ? (
        <button type="button" data-coach-meals-retry="" onClick={onRetry} style={{ flexShrink: 0, minHeight: 44, background: 'transparent', border: 0, padding: '0 2px', color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>{tr('nutrition:eat.coachAdded.retry', { defaultValue: 'Try again' })} →</button>
      ) : null}
    </div>
  );
}

function notesBlock(t, tr, read) {
  const notes = bsCoachGroceryNotes(read);
  if (!notes.length) return null;
  return (
    <div data-coach-grocery-notes="" style={{ padding: `${(t.sectGap || 22)}px ${t.padX}px 0` }}>
      {notes.map((n) => (
        <div key={n.id || n.providerId} data-coach-grocery-note={String(n.providerId ?? '')} style={{ padding: '10px 0 12px', borderTop: `1px solid ${t.HAIR || t.RULE}` }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.GOLD || '#a07a2e', fontWeight: 700, marginBottom: 5 }}>
            {n.coachName ? tr('nutrition:grocery.coachNote.from', { defaultValue: 'Grocery note · {name}', name: n.coachName }) : tr('nutrition:grocery.coachNote.fromAnon', { defaultValue: 'Grocery note · your nutritionist' })}
          </div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{n.text}</div>
        </div>
      ))}
    </div>
  );
}

// The grocery notes off a read, on Grocery. The tests draw it directly.
export function BSCoachGroceryNotesView({ read, onRetry }) {
  const t = window.useBS();
  const tr = useShapeTr();
  if (read && read.status === 'error') return unreadBlock(t, tr, tr('nutrition:grocery.coachNote.unread', { defaultValue: 'Your nutritionist’s grocery note didn’t load.' }), onRetry);
  return notesBlock(t, tr, read);
}

// The day's meals off a read. The tests draw it directly.
//   read      { status: 'loading' | 'none' | 'error' | 'ready', days, notes }
//   date      the day shown ('YYYY-MM-DD')
//   today     whether that day is today (the grocery notes show under today's)
//   dayLabel  its short weekday name, for another day ("Added · Tue")
export function BSCoachMealsView({ read, date, today = true, dayLabel = '', onRetry }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const GOLD = t.GOLD || '#a07a2e';
  const mono = { fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.02em', color: t.INK50 };

  if (read && read.status === 'error') {
    return unreadBlock(t, tr, tr('nutrition:eat.coachAdded.unread', { defaultValue: 'Your nutritionist’s meals didn’t load.' }), onRetry);
  }

  const groups = bsCoachMealGroups(read, date);
  return (
    <>
      {groups.length ? (
        <div data-coach-meals="">
          {groups.map((g) => {
            const from = g.coachName ? tr('nutrition:eat.coachAdded.from', { defaultValue: 'From {name}', name: g.coachName }) : tr('nutrition:eat.coachAdded.fromNutritionist', { defaultValue: 'From your nutritionist' });
            return (
              <div key={g.key} data-coach-meals-coach={g.key}>
                <BSFocusTitle color={GOLD}
                  kicker={from}
                  title={today ? tr('nutrition:eat.coachAdded.today', { defaultValue: 'Added today' }) : tr('nutrition:eat.coachAdded.onDay', { defaultValue: 'Added · {day}', day: dayLabel })}
                  meta={tr('nutrition:eat.coachAdded.count', { defaultValue: '{count, plural, one {# meal} other {# meals}}', count: g.items.length })} />
                <div style={{ padding: `10px ${t.padX}px 0` }}>
                  {g.items.map((m, i) => {
                    const figures = [
                      m.kcal != null ? tr('nutrition:eat.coachAdded.kcal', { defaultValue: '{kcal} kcal', kcal: m.kcal }) : null,
                      m.protein != null ? tr('nutrition:eat.coachAdded.protein', { defaultValue: '{g} g protein', g: m.protein }) : null,
                    ].filter(Boolean);
                    const notes = [m.note, Array.isArray(m.alternatives) && m.alternatives.length ? tr('nutrition:eat.coachAdded.swaps', { defaultValue: 'Swaps: {list}', list: m.alternatives.join(', ') }) : null].filter(Boolean);
                    return (
                      <div key={m.id || i} data-coach-meal="" style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'baseline', padding: '12px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                        <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{pad(i + 1)}</span>
                        <span style={{ minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', overflowWrap: 'anywhere' }}>{m.name}</span>
                          {figures.length ? <span data-coach-meal-figures="" style={{ display: 'block', marginTop: 3, ...mono }}>{figures.join(' · ')}</span> : null}
                          {notes.length ? <span data-coach-meal-notes="" style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.4, color: t.INK70, overflowWrap: 'anywhere' }}>{notes.join(' · ')}</span> : null}
                        </span>
                        {m.time ? <span data-coach-meal-time="" style={{ ...mono, textAlign: 'right', maxWidth: 90, overflowWrap: 'anywhere' }}>{m.time}</span> : <span />}
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
      {today ? notesBlock(t, tr, read) : null}
    </>
  );
}

// The section on Eat for the week's day `dayIdx` (0 = Monday), reading for itself.
export function BSCoachMeals({ dayIdx = 0, today = true, dayLabel = '' }) {
  const { read, retry } = useBSCoachMeals();
  return <BSCoachMealsView read={read} date={bsCoachExerciseDate(dayIdx, new Date(), read && read.status === 'ready' ? read.today : null)} today={today} dayLabel={dayLabel} onRetry={retry} />;
}

// The notes on Grocery, reading for themselves.
export function BSCoachGroceryNotes() {
  const { read, retry } = useBSCoachMeals();
  return <BSCoachGroceryNotesView read={read} onRetry={retry} />;
}
