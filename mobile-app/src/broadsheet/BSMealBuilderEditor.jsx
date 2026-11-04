import React from 'react';
import '../../../public/newdesign/dashMealCore.js'; // → window.DashMeals, the website builder's core
import { mealBuilderDoc, dayMeals, dayTotals, hasVariants, foodsFor, swapMeal, removeMeal, addMeal, setTarget, mealPlanMeta } from '../services/mealBuilderEdit.mjs';
import { holdLeave } from '../services/leaveGuard.mjs';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, useBSClean, BSCleanType } from './bsCleanType.jsx';

// ─── A NUTRITIONIST'S MEAL PLAN, AS THE WEBSITE BUILDER KEEPS IT, IN THE APP ─────────────────────
// Owner, 2026-11-04, of the meal plans Nora drafts: "can only be edited and assigned on the website,
// not in the app … can you fix these and make them possible?". A plan whose detail holds the
// builder's document (detail.mealBuilder: Nora's drafts, and every plan made on the website) opens
// here: its name, its daily targets, and each day's meals, swapped, added or taken off from Shape's
// foods, within what the plan leaves out. Save writes the document back for both builders; Assign
// hands the saved plan to the Plans page's Assign, which sends the week the website would.
//
// What the app leaves to the website, and says so: a dish of the nutritionist's own, and a day's
// rest-day or travel-day version (kept as it is; a swap flows into it unless it replaces that meal).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (BSMastRow, BSBackRow, BSPage,
// bsAskConfirm, ShapeCoachPlans, DashMeals): this module is a static import of the pros module.

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

const overline = (t, color) => ({ fontFamily: BS_CLEAN_SANS, fontSize: 11, fontWeight: 650, letterSpacing: '0.05em', textTransform: 'uppercase', lineHeight: 1.3, color: color || t.INK50 });
const primaryBtn = (t, off) => ({ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 50, padding: '0 16px', borderRadius: 14, border: 0, background: t.INK, color: t.PAPER, fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650, cursor: off ? 'default' : 'pointer', opacity: off ? 0.55 : 1 });
const quietBtn = (t, off) => ({ ...primaryBtn(t, off), border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK });
const linkBtn = (t) => ({ flexShrink: 0, minHeight: 44, padding: '0 4px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 600, color: t.isLight ? '#07706a' : '#34d6c5', whiteSpace: 'nowrap' });
const field = (t) => ({ width: '100%', minWidth: 0, boxSizing: 'border-box', minHeight: 44, padding: '0 10px', borderRadius: 10, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: BS_CLEAN_SANS, fontSize: 16, outline: 'none' });

export default function BSMealBuilderEditor({ plan, ownerId = null, onClose, onSaved = () => {}, onAssign = () => {} }) {
  const t = useBSClean();
  const tr = useShapeTr();
  const M = typeof window !== 'undefined' ? window.DashMeals : null;
  const start = mealBuilderDoc(plan && plan.detail);
  const [doc, setDoc] = React.useState(() => (start ? JSON.parse(JSON.stringify(start)) : null));
  const [name, setName] = React.useState((plan && plan.name) || '');
  const [dayIdx, setDayIdx] = React.useState(0);
  const [picker, setPicker] = React.useState(null); // { mode: 'swap', mealId, label } | { mode: 'add', slot }
  const [query, setQuery] = React.useState('');
  const [dirty, setDirty] = React.useState(false);
  const [status, setStatus] = React.useState(''); // '' | saving | saved | error
  const [err, setErr] = React.useState('');
  // Targets are typed as text and read on blur, so a half-typed "18" never becomes the day's target.
  const [targetText, setTargetText] = React.useState(() => ({ ...(start ? start.targets : {}) }));

  const MastRow = window.BSMastRow;
  const BackRow = window.BSBackRow;
  const Page = window.BSPage || React.Fragment;
  const pad = `${window.BS_MAST_TOP_CSS || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px))'} ${t.padX || 22}px 40px`;

  // ⚠ What is on screen now, read when a save comes back (Codex on #2594). An edit made while the save
  // was in flight is not what was saved, so it stays unsaved: Back still asks, and Assign saves it
  // first. An edit never clears a save in flight either, so a second Save can't start beside it.
  const onScreen = React.useRef({ doc, name });
  onScreen.current = { doc, name };
  const keepSaving = (s) => (s === 'saving' ? s : '');
  const change = (next) => { if (next !== doc) { setDoc(next); setDirty(true); setStatus(keepSaving); } };
  const askLeave = async () => !window.bsAskConfirm || !!(await window.bsAskConfirm({
    title: tr('coach:mealEditor.leaveTitle', { defaultValue: 'Leave without saving?' }),
    message: tr('coach:mealEditor.leaveMsg', { defaultValue: 'Your changes to this plan are not saved.' }),
    confirmLabel: tr('coach:mealEditor.leave', { defaultValue: 'Leave without saving' }),
  }));
  const close = async () => {
    if (dirty && !(await askLeave())) return;
    onClose();
  };
  // ⚠ The tab bar is under this editor (Codex on #2594): while it has unsaved changes, a tab tap or a
  // jump elsewhere asks the same question Back does (services/leaveGuard.mjs), never drops them.
  React.useEffect(() => (dirty ? holdLeave(window, askLeave) : undefined), [dirty]);

  const head = (trailing) => (
    <>
      {MastRow ? <MastRow trailing={null} /> : null}
      {BackRow ? <BackRow onBack={picker ? () => setPicker(null) : close} trailing={trailing} /> : null}
    </>
  );

  if (!doc || !M) {
    return (
      <Page>
        <section style={{ padding: pad, color: t.INK }}>
          {head(null)}
          <p role="alert" style={{ marginTop: 16, fontFamily: BS_CLEAN_SANS, fontSize: 15, lineHeight: 1.45 }}>{!M
            ? tr('coach:mealEditor.unavailable', { defaultValue: 'The meal builder could not load. Reload the app and try again.' })
            : tr('coach:mealEditor.notBuilder', { defaultValue: 'This plan has no meals to edit here.' })}</p>
        </section>
      </Page>
    );
  }

  const slotLabel = (s) => ({
    Breakfast: tr('coach:mealEditor.slotBreakfast', { defaultValue: 'Breakfast' }),
    Lunch: tr('coach:mealEditor.slotLunch', { defaultValue: 'Lunch' }),
    Dinner: tr('coach:mealEditor.slotDinner', { defaultValue: 'Dinner' }),
    Snack: tr('coach:mealEditor.slotSnack', { defaultValue: 'Snack' }),
  })[s] || s;
  const macros = (m) => tr('coach:mealEditor.macros', { defaultValue: '{kcal} kcal · {p} P · {c} C · {f} F', kcal: Math.round(Number(m.kcal) || 0), p: Math.round(Number(m.p) || 0), c: Math.round(Number(m.c) || 0), f: Math.round(Number(m.f) || 0) });
  const day = doc.days[Math.min(dayIdx, doc.days.length - 1)];
  const di = doc.days.indexOf(day);

  const save = async () => {
    if (status === 'saving') return null;
    if (!window.ShapeCoachPlans?.update) { setStatus('error'); setErr(tr('coach:mealEditor.saveFailed', { defaultValue: 'Could not save. Try again.' })); return null; }
    setStatus('saving'); setErr('');
    const sent = { doc, name };
    // An emptied name is saved as the plan's own, and the field shows it again: never "Saved" over a
    // blank the plan doesn't have (Codex on #2594).
    const savedName = name.trim() || plan.name;
    try {
      const row = await window.ShapeCoachPlans.update({
        id: plan.id, name: savedName, ...(ownerId ? { expectedOwnerId: ownerId } : {}),
        // The revision it opened (the saved row's, once saved): a plan changed on the website since is
        // refused with the route's words, and this document stays here, never written over it.
        expectedRevision: Number(plan.detail && plan.detail.revision) || 0,
        // The route merges `detail` over the stored one, so only the document is replaced.
        meta: mealPlanMeta(M, doc), detail: { mealBuilder: doc },
      });
      const unchanged = onScreen.current.doc === sent.doc && onScreen.current.name === sent.name;
      if (unchanged) { setDirty(false); if (name !== savedName) setName(savedName); }
      setStatus(unchanged ? 'saved' : '');
      onSaved(row);
      return row;
    } catch (e) {
      setStatus('error'); setErr(String((e && e.message) || tr('coach:mealEditor.saveFailed', { defaultValue: 'Could not save. Try again.' })));
      return null;
    }
  };
  const assign = async () => {
    const row = dirty ? await save() : { ...plan, name: name.trim() || plan.name, detail: { ...(plan.detail || {}), mealBuilder: doc } };
    if (row) onAssign(row);
  };

  // ── Picking a food: to swap a meal for, or to add in a slot ──
  if (picker) {
    const foods = foodsFor(M, doc, query);
    const pick = (food) => {
      change(picker.mode === 'swap' ? swapMeal(M, doc, di, picker.mealId, food) : addMeal(M, doc, di, food, picker.slot));
      setPicker(null); setQuery('');
    };
    return (
      <Page>
        <section data-meal-picker="" style={{ padding: pad, color: t.INK }}>
          {head(<span style={overline(t)}>{day.name}</span>)}
          <BSCleanType t={t}>
            <h1 style={{ margin: '10px 0 0', fontFamily: BS_CLEAN_HEAD, fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1 }}>
              {picker.mode === 'swap' ? tr('coach:mealEditor.pickSwap', { defaultValue: 'Swap {meal}', meal: picker.label }) : tr('coach:mealEditor.pickAdd', { defaultValue: 'Add a meal' })}
            </h1>
            {picker.mode === 'add' ? (
              <div role="radiogroup" aria-label={tr('coach:mealEditor.slotAria', { defaultValue: 'Meal of the day' })} style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {(M.SLOTS || ['Breakfast', 'Lunch', 'Dinner', 'Snack']).map((s) => {
                  const on = picker.slot === s;
                  return <button key={s} type="button" role="radio" aria-checked={on} data-meal-slot={s} onClick={() => setPicker({ ...picker, slot: s })} style={{ minHeight: 40, borderRadius: 999, padding: '0 15px', cursor: 'pointer', border: `1px solid ${on ? t.INK : t.RULE}`, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 600 }}>{slotLabel(s)}</button>;
                })}
              </div>
            ) : null}
            <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} aria-label={tr('coach:mealEditor.search', { defaultValue: "Search Shape's foods" })} placeholder={tr('coach:mealEditor.search', { defaultValue: "Search Shape's foods" })} style={{ ...field(t), marginTop: 14 }} />
            <p style={{ margin: '8px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 12, lineHeight: 1.45, color: t.INK50 }}>{tr('coach:mealEditor.libraryNote', { defaultValue: "Shape's foods, within what this plan leaves out. Add a dish of your own in the website builder." })}</p>
            <div style={{ marginTop: 10 }}>
              {foods.length ? foods.map((f) => (
                <button key={f.id} type="button" data-meal-food={f.id} onClick={() => pick(f)} style={{ display: 'block', width: '100%', minHeight: 52, padding: '10px 0', border: 0, borderTop: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 600 }}>{f.name}</span>
                  <span style={{ display: 'block', marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 12.5, color: t.INK70 }}>{macros(f)}</span>
                </button>
              )) : <p role="status" style={{ fontFamily: BS_CLEAN_SANS, fontSize: 14, color: t.INK70 }}>{tr('coach:mealEditor.noFoods', { defaultValue: "No food in Shape's list fits this plan's rules." })}</p>}
            </div>
            <button type="button" onClick={() => setPicker(null)} style={{ ...quietBtn(t, false), marginTop: 18 }}>{tr('coach:mealEditor.cancel', { defaultValue: 'Cancel' })}</button>
          </BSCleanType>
        </section>
      </Page>
    );
  }

  const meals = dayMeals(M, day);
  const tot = dayTotals(M, day);
  const floor = doc.constraints && doc.constraints.proteinFloor;
  const statusText = status === 'saving' ? tr('coach:mealEditor.saving', { defaultValue: 'Saving…' })
    : status === 'saved' ? tr('coach:mealEditor.saved', { defaultValue: 'Saved' })
    : dirty ? tr('coach:mealEditor.unsaved', { defaultValue: 'Unsaved changes' }) : '';
  const targetKeys = [
    ['kcal', tr('coach:mealEditor.kcal', { defaultValue: 'Calories' })],
    ['p', tr('coach:mealEditor.protein', { defaultValue: 'Protein g' })],
    ['c', tr('coach:mealEditor.carbs', { defaultValue: 'Carbs g' })],
    ['f', tr('coach:mealEditor.fat', { defaultValue: 'Fat g' })],
  ];
  const commitTarget = (k) => {
    const next = setTarget(doc, k, targetText[k]);
    if (next === doc) setTargetText((s) => ({ ...s, [k]: doc.targets[k] }));
    else change(next);
  };

  return (
    <Page>
      <section data-meal-builder-editor="" style={{ padding: pad, color: t.INK }}>
        {head(<span role="status" style={overline(t)}>{statusText || tr('coach:mealEditor.eyebrow', { defaultValue: 'Meal plan' })}</span>)}
        <BSCleanType t={t}>
          <input type="text" value={name} onChange={(e) => { setName(e.target.value); setDirty(true); setStatus(keepSaving); }} maxLength={160} aria-label={tr('coach:mealEditor.nameAria', { defaultValue: 'Plan name' })}
            style={{ ...field(t), marginTop: 10, minHeight: 52, padding: '0 2px', border: 0, borderBottom: `1px solid ${t.RULE}`, borderRadius: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 26, fontWeight: 600, letterSpacing: '-0.03em' }} />

          <div style={{ marginTop: 18, ...overline(t) }}>{tr('coach:mealEditor.targets', { defaultValue: 'Daily targets' })}</div>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
            {targetKeys.map(([k, label]) => (
              <label key={k} style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 11.5, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</span>
                <input type="text" inputMode="numeric" data-meal-target={k} value={targetText[k] == null ? '' : String(targetText[k])} onChange={(e) => setTargetText((s) => ({ ...s, [k]: e.target.value.replace(/[^\d]/g, '').slice(0, 4) }))} onBlur={() => commitTarget(k)} style={{ ...field(t), marginTop: 4, textAlign: 'center' }} />
              </label>
            ))}
          </div>

          {doc.days.length > 1 ? (
            <div role="tablist" aria-label={tr('coach:mealEditor.daysAria', { defaultValue: 'Days of the plan' })} className="bs-hide-scroll" style={{ marginTop: 20, display: 'flex', gap: 18, borderBottom: `1px solid ${t.RULE}`, overflowX: 'auto' }}>
              {doc.days.map((d, i) => {
                const on = i === di;
                return <button key={i} type="button" role="tab" aria-selected={on} data-meal-day={i} onClick={() => setDayIdx(i)} style={{ flexShrink: 0, minHeight: 44, padding: 0, marginBottom: -1, border: 0, borderBottom: `2px solid ${on ? t.INK : 'transparent'}`, background: 'transparent', cursor: 'pointer', fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: on ? 650 : 500, color: on ? t.INK : t.INK70, whiteSpace: 'nowrap' }}>{d.name}</button>;
              })}
            </div>
          ) : null}

          <p data-meal-day-total="" style={{ margin: '12px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 600, color: t.INK }}>
            {tr('coach:mealEditor.dayTotal', { defaultValue: '{kcal} of {target} kcal · {p} of {tp} g protein', kcal: tot.kcal, target: doc.targets.kcal, p: tot.p, tp: doc.targets.p })}
          </p>
          {floor != null && meals.length && tot.p < floor ? (
            <p role="status" style={{ margin: '4px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, color: t.RUST || '#c0533b' }}>{tr('coach:mealEditor.underFloor', { defaultValue: "Protein is under the plan's {floor} g floor.", floor })}</p>
          ) : null}

          <div style={{ marginTop: 8 }}>
            {meals.length ? meals.map((m) => {
              const base = day.slots.some((s) => s && s.id === m.id);
              return (
                <div key={m.id} data-meal-row={m.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 0', borderTop: `1px solid ${t.RULE}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={overline(t)}>{slotLabel(m.slot)}</div>
                    <div style={{ marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 600, color: t.INK }}>{m.name}</div>
                    <div style={{ marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 12.5, color: t.INK70 }}>{macros(m)}</div>
                  </div>
                  {base ? <>
                    <button type="button" data-meal-swap={m.id} onClick={() => { setQuery(''); setPicker({ mode: 'swap', mealId: m.id, label: m.name }); }} style={linkBtn(t)}>{tr('coach:mealEditor.swap', { defaultValue: 'Swap' })}</button>
                    <button type="button" data-meal-remove={m.id} onClick={() => change(removeMeal(doc, di, m.id))} aria-label={tr('coach:mealEditor.removeAria', { defaultValue: 'Remove {meal}', meal: m.name })} style={{ ...linkBtn(t), color: t.INK50 }}>{tr('coach:mealEditor.remove', { defaultValue: 'Remove' })}</button>
                  </> : null}
                </div>
              );
            }) : <p style={{ fontFamily: BS_CLEAN_SANS, fontSize: 14, color: t.INK70 }}>{tr('coach:mealEditor.noMeals', { defaultValue: 'No meals on this day yet.' })}</p>}
          </div>
          <button type="button" data-meal-add="" onClick={() => { setQuery(''); setPicker({ mode: 'add', slot: 'Lunch' }); }} style={{ ...quietBtn(t, false), marginTop: 10 }}>{tr('coach:mealEditor.addMeal', { defaultValue: '＋ Add a meal' })}</button>
          {hasVariants(doc) ? (
            <p data-meal-variants-note="" style={{ margin: '12px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 12, lineHeight: 1.45, color: t.INK50 }}>{tr('coach:mealEditor.variantsNote', { defaultValue: 'This plan has its own rest-day or travel-day versions. They stay as they are, and a swapped meal flows into them unless they replace it. Edit them in the website builder.' })}</p>
          ) : null}

          {err ? <p role="alert" style={{ margin: '14px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13, color: t.RUST || '#c0533b' }}>{err}</p> : null}
          <button type="button" data-meal-save="" onClick={save} disabled={status === 'saving' || !dirty} style={{ ...primaryBtn(t, status === 'saving' || !dirty), marginTop: 22 }}>{status === 'saving' ? tr('coach:mealEditor.saving', { defaultValue: 'Saving…' }) : tr('coach:mealEditor.save', { defaultValue: 'Save' })}</button>
          <button type="button" data-meal-assign="" onClick={assign} disabled={status === 'saving'} style={{ ...quietBtn(t, status === 'saving'), marginTop: 10 }}>{tr('coach:mealEditor.assign', { defaultValue: 'Assign to a client' })}</button>
        </BSCleanType>
      </section>
    </Page>
  );
}
