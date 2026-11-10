import React from 'react';
import '../../../public/newdesign/dashMealCore.js'; // → window.DashMeals, the website builder's core
import { mealBuilderDoc, dayMeals, dayTotals, hasVariants, foodsFor, swapMeal, removeMeal, addMeal, setTarget, mealPlanMeta, mealDraftKey, readMealDraft, mealPlaylistChoices, playlistKey, samePlaylist, setDayPlaylist, setMealPlaylist } from '../services/mealBuilderEdit.mjs';
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
// A playlist (owner, 2026-11-10: "add a playlist picker to the coach app's meal editor too -
// nutritionists should be able to add playlists to meal plans"): one of the coach's saved playlists
// (ShapeSoundtracks, GET /api/coach/soundtracks, not a trainer's) for the day and for each meal, written
// as the website builder writes it (mealBuilderEdit.mjs), so Assign sends it and the member's Eat says
// "For Sun · Batch prep".
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

// A playlist picker: "No playlist", then the coach's playlists. A playlist the day or meal already carries
// is listed and selected even when the list lacks it (signed out, a read that failed, one since deleted),
// matched by id, or by name for one saved without an id, as the website's picker keeps it.
function PlaylistSelect({ t, tr, value, playlists, label, onChange, data = {} }) {
  const list = Array.isArray(playlists) ? playlists : [];
  const has = !!(value && typeof value.name === 'string' && value.name.trim());
  const lists = has && !list.some((p) => samePlaylist(p, value)) ? [value, ...list] : list;
  const current = has ? lists.find((p) => samePlaylist(p, value)) : null;
  const sub = (p) => (p.tracks ? tr('coach:mealEditor.tracks', { defaultValue: '{n, plural, one {# track} other {# tracks}}', n: p.tracks }) : (p.meta || ''));
  return (
    <select aria-label={label} {...data} value={current ? playlistKey(current) : ''} onChange={(e) => onChange(lists.find((x) => playlistKey(x) === e.target.value) || null)}
      style={{ ...field(t), color: current ? (t.isLight ? '#07706a' : '#34d6c5') : t.INK70 }}>
      <option value="">{tr('coach:mealEditor.noPlaylist', { defaultValue: 'No playlist' })}</option>
      {lists.map((p) => <option key={playlistKey(p)} value={playlistKey(p)}>{p.name}{sub(p) ? ` · ${sub(p)}` : ''}</option>)}
      {!lists.length ? <option value="" disabled>{tr('coach:mealEditor.noPlaylists', { defaultValue: 'No playlists yet' })}</option> : null}
    </select>
  );
}

export default function BSMealBuilderEditor({ plan, ownerId = null, onClose, onSaved = () => {}, onAssign = () => {} }) {
  const t = useBSClean();
  const tr = useShapeTr();
  const M = typeof window !== 'undefined' ? window.DashMeals : null;
  // ⚠ AN UNSAVED DRAFT IS KEPT ON THIS DEVICE (Codex on #2594), per account and plan, as the workout
  // editor keeps its own: whatever takes the coach away (a tab, a swipe, a notification, a page opened
  // over Plans), opening the plan again brings it back. It names the revision it was made on.
  const draftKey = plan && plan.id && ownerId ? mealDraftKey(ownerId, plan.id) : null;
  const [kept] = React.useState(() => { if (!draftKey) return null; try { return readMealDraft(window.localStorage.getItem(draftKey)); } catch (e) { return null; } });
  const start = kept ? kept.doc : mealBuilderDoc(plan && plan.detail);
  const [doc, setDoc] = React.useState(() => (start ? JSON.parse(JSON.stringify(start)) : null));
  const [name, setName] = React.useState(() => (kept ? kept.name : (plan && plan.name) || ''));
  const revRef = React.useRef(kept ? kept.revision : Number(plan && plan.detail && plan.detail.revision) || 0);
  const [stored, setStored] = React.useState(!!kept);
  const [dayIdx, setDayIdx] = React.useState(0);
  const [picker, setPicker] = React.useState(null); // { mode: 'swap', mealId, label } | { mode: 'add', slot }
  const [query, setQuery] = React.useState('');
  const [dirty, setDirty] = React.useState(!!kept);
  const [status, setStatus] = React.useState(''); // '' | saving | saved | error
  const [err, setErr] = React.useState('');
  // Targets are typed as text and read on blur, so a half-typed "18" never becomes the day's target.
  // A kept draft's targets still being typed come back as typed.
  const [targetText, setTargetText] = React.useState(() => ({ ...(start ? start.targets : {}), ...(kept && kept.targets ? kept.targets : {}) }));

  const MastRow = window.BSMastRow;
  const BackRow = window.BSBackRow;
  const Page = window.BSPage || React.Fragment;
  const pad = `${window.BS_MAST_TOP_CSS || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px))'} ${t.padX || 22}px 40px`;

  // ⚠ What is on screen now, read when a save comes back (Codex on #2594). An edit made while the save
  // was in flight is not what was saved, so it stays unsaved: Back still asks, and Assign saves it
  // first. An edit never clears a save in flight either, so a second Save can't start beside it.
  const onScreen = React.useRef({ doc, name, targets: targetText });
  onScreen.current = { doc, name, targets: targetText };
  const keepSaving = (s) => (s === 'saving' ? s : '');
  const change = (next) => { if (next !== doc) { setDoc(next); setDirty(true); setStatus(keepSaving); } };
  const dropDraft = () => { if (draftKey) { try { window.localStorage.removeItem(draftKey); } catch (e) { /* storage unavailable */ } } setStored(false); };
  // "Leave without saving" is the coach's word to drop it.
  const askLeave = async () => {
    const ok = !window.bsAskConfirm || !!(await window.bsAskConfirm({
      title: tr('coach:mealEditor.leaveTitle', { defaultValue: 'Leave without saving?' }),
      message: tr('coach:mealEditor.leaveMsg', { defaultValue: 'Your changes to this plan are not saved.' }),
      confirmLabel: tr('coach:mealEditor.leave', { defaultValue: 'Leave without saving' }),
    }));
    if (ok) dropDraft();
    return ok;
  };
  // A target typed but not yet read (it is read on blur) is unsaved too (Codex on #2594): a swipe
  // straight after typing must not drop it.
  const typing = !!doc && Object.keys(targetText).some((k) => String(targetText[k] == null ? '' : targetText[k]) !== String(doc.targets[k] == null ? '' : doc.targets[k]));
  const unsaved = dirty || typing;
  // Kept while unsaved, a target being typed included, and only for the account that opened it.
  const keepDraft = (snap) => {
    if (!draftKey || !snap.doc) return;
    if ((window.ShapeAuth?.getCachedState?.()?.user?.id || null) !== ownerId) return;
    try { window.localStorage.setItem(draftKey, JSON.stringify({ name: snap.name, doc: snap.doc, targets: snap.targets, revision: revRef.current })); setStored(true); }
    catch (e) { setStored(false); }
  };
  React.useEffect(() => { if (unsaved) keepDraft({ name, doc, targets: targetText }); }, [draftKey, unsaved, doc, name, targetText]);
  const close = async () => {
    if (unsaved && !(await askLeave())) return;
    onClose();
  };
  // ⚠ The tab bar is under this editor (Codex on #2594): while it has unsaved changes, a tab tap or a
  // jump elsewhere asks the same question Back does (services/leaveGuard.mjs), never drops them.
  React.useEffect(() => (unsaved ? holdLeave(window, askLeave) : undefined), [unsaved]);
  // The coach's saved playlists, read once (ShapeSoundtracks, read at call time). Signed out or a read that
  // failed leaves the list empty, and a day or meal keeps showing the playlist it has.
  const [playlists, setPlaylists] = React.useState([]);
  React.useEffect(() => {
    const list = window.ShapeSoundtracks && window.ShapeSoundtracks.list;
    if (typeof list !== 'function') return undefined;
    let on = true;
    Promise.resolve().then(() => list()).then((rows) => { if (on) setPlaylists(mealPlaylistChoices(rows || [])); }).catch(() => {});
    return () => { on = false; };
  }, []);

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
    // A target still being typed is read now, as its blur would (a tap on Save may not blur it first).
    let toSave = doc;
    Object.keys(targetText).forEach((k) => { toSave = setTarget(toSave, k, targetText[k]); });
    if (toSave !== doc) setDoc(toSave);
    setTargetText({ ...toSave.targets });
    const sent = { doc: toSave, name, targets: JSON.stringify({ ...toSave.targets }) };
    // An emptied name is saved as the plan's own, and the field shows it again: never "Saved" over a
    // blank the plan doesn't have (Codex on #2594).
    const savedName = name.trim() || plan.name;
    try {
      const row = await window.ShapeCoachPlans.update({
        id: plan.id, name: savedName, ...(ownerId ? { expectedOwnerId: ownerId } : {}),
        // The revision it was made on (a kept draft's own; the saved row's once saved): a plan changed on
        // the website since is refused with the route's words, and this document stays, never written over it.
        expectedRevision: revRef.current,
        // The route merges `detail` over the stored one, so only the document is replaced.
        meta: mealPlanMeta(M, toSave), detail: { mealBuilder: toSave },
      });
      const now = onScreen.current;
      const unchanged = now.doc === sent.doc && now.name === sent.name && JSON.stringify(now.targets) === sent.targets;
      const nextRev = Number(row && row.detail && row.detail.revision);
      if (Number.isFinite(nextRev) && nextRev > 0) revRef.current = nextRev;
      if (unchanged) { setDirty(false); dropDraft(); if (name !== savedName) setName(savedName); }
      // Edits made while it was in flight stay kept, now on the revision this save made (Codex on #2594).
      else keepDraft(now);
      setStatus(unchanged ? 'saved' : '');
      onSaved(row);
      // The row only when it is what is on screen: Assign never sends a menu older than the one shown.
      return unchanged ? row : null;
    } catch (e) {
      setStatus('error'); setErr(String((e && e.message) || tr('coach:mealEditor.saveFailed', { defaultValue: 'Could not save. Try again.' })));
      return null;
    }
  };
  const assign = async () => {
    const row = unsaved ? await save() : { ...plan, name: name.trim() || plan.name, detail: { ...(plan.detail || {}), mealBuilder: doc } };
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
    : unsaved ? (stored ? tr('coach:workoutEditor.localDraft', { defaultValue: 'Draft kept on this device' }) : tr('coach:mealEditor.unsaved', { defaultValue: 'Unsaved changes' })) : '';
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

          <label data-meal-day-playlist="" style={{ display: 'block', marginTop: 14 }}>
            <span style={{ display: 'block', marginBottom: 6, ...overline(t) }}>{tr('coach:mealEditor.dayPlaylist', { defaultValue: 'Playlist for this day' })}</span>
            <PlaylistSelect t={t} tr={tr} value={day.playlist} playlists={playlists} label={tr('coach:mealEditor.dayPlaylistAria', { defaultValue: 'Playlist for {day}', day: day.name })}
              onChange={(p) => change(setDayPlaylist(doc, di, p))} />
          </label>

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
                    {base ? (
                      <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span aria-hidden="true" style={{ flexShrink: 0, fontFamily: BS_CLEAN_SANS, fontSize: 14, color: t.INK50 }}>♪</span>
                        <PlaylistSelect t={t} tr={tr} value={m.playlist} playlists={playlists} data={{ 'data-meal-playlist': m.id }}
                          label={tr('coach:mealEditor.mealPlaylist', { defaultValue: '{meal} playlist', meal: m.name })} onChange={(p) => change(setMealPlaylist(doc, di, m.id, p))} />
                      </div>
                    ) : null}
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
          <button type="button" data-meal-save="" onClick={save} disabled={status === 'saving' || !unsaved} style={{ ...primaryBtn(t, status === 'saving' || !unsaved), marginTop: 22 }}>{status === 'saving' ? tr('coach:mealEditor.saving', { defaultValue: 'Saving…' }) : tr('coach:mealEditor.save', { defaultValue: 'Save' })}</button>
          <button type="button" data-meal-assign="" onClick={assign} disabled={status === 'saving'} style={{ ...quietBtn(t, status === 'saving'), marginTop: 10 }}>{tr('coach:mealEditor.assign', { defaultValue: 'Assign to a client' })}</button>
        </BSCleanType>
      </section>
    </Page>
  );
}
