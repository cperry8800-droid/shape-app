import React from 'react';
import { createPortal } from 'react-dom';
import { bsCookSlug } from '../services/cookable.mjs';
import { bsRecipeMinutes } from '../services/prepAhead.mjs';
import { BS_OWN_SLOTS } from '../services/mealDays.mjs';
// ─── EAT · THE MEMBER'S OWN DAY (night-before prep, Phase 2; 2026-11-01) ────────────────────────────
// Two pieces Eat draws for the member's own changes to a day of meals (mealDays.mjs, user_goals
// `client_meal_days`):
//   - BSPlanMealSheet: plan a Shape Kitchen recipe for today or tomorrow, into a slot. Opened from
//     Eat's "Plan a meal" row and from a recipe's own page. A recipe that has to be prepped the night
//     before says so, and planning it for tomorrow puts it on tonight's card and the reminder.
//   - BSMorningSwapCard: a meal that needed the night before and was not prepped is offered a quick
//     swap for that morning (prepAhead.mjs bsMorningSwapFor), kept for that day only. The member can
//     keep the meal instead.
// Eat owns the reads and writes and passes them in; this module only draws. Window globals are read
// at call time and the module never imports back into the client module (the BSIntegrationsPage /
// BSLeaderboard pattern).

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

// A slot word in the reader's language, from the catalog Home and Eat already read.
function useSlotWord() {
  const tr = useShapeTr();
  return (slot) => {
    const s = String(slot || '').toUpperCase();
    if (s === 'BREAKFAST' || s === 'BFAST') return tr('home:slot.breakfast', { defaultValue: 'Breakfast' });
    if (s === 'LUNCH') return tr('home:slot.lunch', { defaultValue: 'Lunch' });
    if (s === 'SNACK') return tr('home:slot.snack', { defaultValue: 'Snack' });
    if (s === 'DINNER' || s === 'DINR') return tr('home:slot.dinner', { defaultValue: 'Dinner' });
    return '';
  };
}

// Which catalog recipes a slot lists: a breakfast for breakfast, a snack for a snack, a main for
// lunch and dinner (the morning swap's grouping, prepAhead.mjs).
const SLOT_TAGS = { BREAKFAST: ['Breakfast', 'Brunch'], SNACK: ['Snack', 'Side'] };
const NOT_A_MAIN = ['Breakfast', 'Brunch', 'Snack', 'Side'];
export function bsRecipesForSlot(recipes, slot, query) {
  const want = SLOT_TAGS[slot] || null;
  const q = String(query || '').trim().toLowerCase();
  return (Array.isArray(recipes) ? recipes : []).filter((r) => {
    if (!r || !r.title) return false;
    if (q) return String(r.title).toLowerCase().includes(q);
    const tags = Array.isArray(r.tags) ? r.tags : [];
    return want ? want.some((x) => tags.includes(x)) : !tags.some((x) => NOT_A_MAIN.includes(x));
  });
}
// The slot a recipe is planned into when none is chosen: its own, by its tags.
export function bsSlotForRecipe(recipe) {
  const tags = recipe && Array.isArray(recipe.tags) ? recipe.tags : [];
  if (tags.includes('Breakfast') || tags.includes('Brunch')) return 'BREAKFAST';
  if (tags.includes('Snack')) return 'SNACK';
  return 'DINNER';
}

// `days` are [{ ymd, label }] (today and tomorrow, in the member's words); `plannedOn(ymd)` is what
// the member already planned that day (mealDays.mjs bsMealDayOf(...).add). `onAdd(ymd, slot, recipe)`
// and `onRemove(ymd, id)` resolve true when saved. With `recipe`, the sheet plans that one recipe;
// without, it lists the catalog for the slot, with a search.
export function BSPlanMealSheet({ recipes = [], index = null, recipe = null, days = [], initialYmd = null, plannedOn = () => [], onAdd, onRemove, onClose }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const slotWord = useSlotWord();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [ymd, setYmd] = useState(initialYmd || (days[days.length - 1] && days[days.length - 1].ymd) || null);
  const [slot, setSlot] = useState(recipe ? bsSlotForRecipe(recipe) : 'BREAKFAST');
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const dayLabel = (days.find((d) => d.ymd === ymd) || {}).label || '';
  const planned = ymd ? (plannedOn(ymd) || []) : [];
  const needsPrep = (r) => !!(index instanceof Map && r && index.has(bsCookSlug(r.title)));
  const run = async (fn) => {
    if (busy) return;
    setBusy(true); setFailed(false);
    let ok = false;
    try { ok = !!(await fn()); } catch (e) { ok = false; }
    setBusy(false);
    if (!ok) setFailed(true);
    return ok;
  };
  const add = async (r) => { const ok = await run(() => onAdd && onAdd(ymd, slot, r)); if (ok && recipe) onClose && onClose(); };
  const chip = (on) => ({ minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? teal : t.RULE}`, background: on ? teal : 'transparent', color: on ? (t.isLight ? '#fff' : '#04201d') : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' });
  const head = (s) => <div style={{ marginTop: 16, marginBottom: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{s}</div>;
  const list = recipe ? [] : bsRecipesForSlot(recipes, slot, query).slice(0, 60);
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div role="dialog" aria-label={tr('nutrition:planDay.kicker', { defaultValue: 'Plan a meal' })} onClick={(e) => e.stopPropagation()} className="bs-scroll"
        style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, color: t.INK, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, maxHeight: '84%', overflowY: 'auto', borderTop: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: teal, fontWeight: 800 }}>{tr('nutrition:planDay.kicker', { defaultValue: 'Plan a meal' })}</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, marginTop: 4, letterSpacing: '-0.02em' }}>
          {recipe ? recipe.title : tr('nutrition:planDay.title', { defaultValue: 'What are you having?' })}
        </div>
        {recipe && needsPrep(recipe) && (
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: teal }}>{tr('nutrition:planDay.needsPrep', { defaultValue: 'Prep the night before' })}</div>
        )}
        {head(tr('nutrition:planDay.when', { defaultValue: 'When' }))}
        <div role="group" aria-label={tr('nutrition:planDay.when', { defaultValue: 'When' })} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {days.map((d) => <button key={d.ymd} type="button" aria-pressed={d.ymd === ymd} onClick={() => setYmd(d.ymd)} style={chip(d.ymd === ymd)}>{d.label}</button>)}
        </div>
        {head(tr('nutrition:planDay.slot', { defaultValue: 'Meal' }))}
        <div role="group" aria-label={tr('nutrition:planDay.slot', { defaultValue: 'Meal' })} style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {BS_OWN_SLOTS.map((s) => <button key={s} type="button" aria-pressed={s === slot} onClick={() => setSlot(s)} style={chip(s === slot)}>{slotWord(s)}</button>)}
        </div>
        {planned.length > 0 && (
          <>
            {head(tr('nutrition:planDay.planned', { defaultValue: 'Planned for {day}', day: dayLabel }))}
            {planned.map((a) => (
              <div key={a.id} data-planned={a.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 0', borderTop: `1px solid ${t.HAIR}` }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{slotWord(a.slot)}</div>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK }}>{a.title}</div>
                </div>
                <button type="button" disabled={busy} onClick={() => run(() => onRemove && onRemove(ymd, a.id))}
                  aria-label={tr('nutrition:planDay.remove', { defaultValue: 'Remove {title}', title: a.title })}
                  style={{ minWidth: 44, minHeight: 44, border: 0, background: 'transparent', color: t.INK50, fontSize: 18, cursor: 'pointer' }}>×</button>
              </div>
            ))}
          </>
        )}
        {recipe ? (
          <button type="button" disabled={busy || !ymd} onClick={() => add(recipe)}
            style={{ marginTop: 18, width: '100%', minHeight: 48, border: 0, borderRadius: 12, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
            {tr('nutrition:planDay.planIt', { defaultValue: 'Plan it for {day}', day: dayLabel })}
          </button>
        ) : (
          <>
            {head(tr('nutrition:planDay.fromKitchen', { defaultValue: 'From Shape Kitchen' }))}
            <input value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr('nutrition:planDay.search', { defaultValue: 'Search recipes' })}
              placeholder={tr('nutrition:planDay.search', { defaultValue: 'Search recipes' })}
              style={{ width: '100%', boxSizing: 'border-box', minHeight: 44, borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '0 13px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' }} />
            <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
              {list.length === 0 && <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50, padding: '8px 0' }}>{tr('nutrition:planDay.none', { defaultValue: 'No recipe fits that.' })}</div>}
              {list.map((r) => {
                const min = bsRecipeMinutes(r.time);
                return (
                  <button key={r.title} type="button" disabled={busy} onClick={() => add(r)}
                    style={{ width: '100%', textAlign: 'left', cursor: busy ? 'default' : 'pointer', padding: '11px 13px', minHeight: 48, borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK }}>
                    <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600 }}>{r.title}</span>
                    <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', color: t.INK50 }}>
                      {[min != null ? tr('nutrition:planDay.minutes', { defaultValue: '{min} min', min }) : null, r.kcal ? tr('nutrition:planDay.kcal', { defaultValue: '{kcal} kcal', kcal: r.kcal }) : null].filter(Boolean).join(' · ')}
                    </span>
                    {needsPrep(r) && <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: teal }}>{tr('nutrition:planDay.needsPrep', { defaultValue: 'Prep the night before' })}</span>}
                  </button>
                );
              })}
            </div>
          </>
        )}
        {failed && <div role="alert" style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 13, color: t.RUST }}>{tr('nutrition:planDay.failed', { defaultValue: 'That was not saved. Try again.' })}</div>}
        <button type="button" onClick={onClose} style={{ marginTop: 16, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tr('nutrition:planDay.close', { defaultValue: 'Done' })}</button>
      </div>
    </div>
  );
  const host = (typeof document !== 'undefined' && (document.getElementById('bs-phone-surface') || document.body)) || null;
  return host ? createPortal(sheet, host) : sheet;
}

// The morning swap: `meal` is the made-ahead meal on today's menu that was not prepped
// ({ title, slot }), `recipe` the catalog recipe offered in its place. `onSwap` keeps the swap for
// today; `onKeep` keeps the meal and the card goes.
export function BSMorningSwapCard({ meal, recipe, onSwap, onKeep, busy = false }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const slotWord = useSlotWord();
  const BSPlate = window.BSPlate;
  if (!meal || !recipe) return null;
  const teal = t.isLight ? '#0a8f87' : t.ACCENT;
  const min = bsRecipeMinutes(recipe.time);
  const btn = { minHeight: 44, padding: '10px 16px', cursor: busy ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' };
  return (
    <BSPlate c={t.ACCENT} pad="14px 16px 14px 18px">
      <div data-morning-swap="" style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: teal }}>
        {[tr('cook:prepAhead.notPrepped', { defaultValue: 'Not prepped last night' }), slotWord(meal.slot)].filter(Boolean).join(' · ')}
      </div>
      <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{meal.title}</div>
      <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.45, color: t.INK }}>
        {min != null
          ? tr('cook:morningSwap.offer', { defaultValue: 'Have {recipe} this morning instead? Ready in {min} min, nothing to prep ahead.', recipe: recipe.title, min })
          : tr('cook:morningSwap.offerNoTime', { defaultValue: 'Have {recipe} this morning instead? Nothing to prep ahead.', recipe: recipe.title })}
      </div>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.4, color: t.INK70 }}>{tr('cook:morningSwap.todayOnly', { defaultValue: 'For today only. The rest of your plan stays as it is.' })}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
        <button type="button" disabled={busy} onClick={onSwap} style={{ ...btn, background: t.INK, color: t.PAPER, border: 0, opacity: busy ? 0.6 : 1 }}>{tr('cook:morningSwap.swap', { defaultValue: 'Swap it' })}</button>
        <button type="button" disabled={busy} onClick={onKeep} style={{ ...btn, background: 'transparent', color: t.INK, border: `1.5px solid ${t.INK}` }}>{tr('cook:morningSwap.keep', { defaultValue: 'Keep it' })}</button>
      </div>
    </BSPlate>
  );
}
