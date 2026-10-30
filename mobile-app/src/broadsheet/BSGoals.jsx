import React from 'react';
import { createPortal } from 'react-dom';
import { bsGoalVerdict, bsGoalPct, bsGoalRemaining } from '../services/goalContract.mjs';
import { bsCiIso, bsCiShift } from './BSCheckinCard.jsx';
import { bsDash, bsDashA, BSDashCard, BSDashRing } from './BSDash.jsx';
// ─── GOALS: THE PAGE, ITS CONTRACT AND ITS SHEETS ─────────────────────────────────────────────────
// Home's goal card and Settings → Goals open BSClientGoals: the member's goal, the read against it
// (BSGoalsContract: the ring, the next milestone, the five station doors and their pages), the
// share-with-coaches switch, and the sheets that edit it (a target, the headline goal, a station's
// headline, a weigh-in). Persisted to user_goals('client_goals').
//
// Moved out of iosAppBroadsheetClient.jsx (2026-10-25) when Goals was rebuilt in the dashboard look,
// as BSIntegrationsPage and BSLeaderboard were. The goal MODEL stays in the client module, because
// Home, the first-run intent step and the Me card read it too: BS_PRIMARY_GOALS and the
// bsPrimaryGoal* token helpers, BS_GOALS_DEFAULT, and the weigh-in helpers (bsGoalWeighIns,
// bsGoalDocKg, bsGoalNow). The client module publishes them on window for this file.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. This file is a static import of the
// client module, so it evaluates before that module's body has put anything on window; a top-level
// read would capture undefined (React error #130). Each component names the globals it needs on its
// first line (tests/goals-module.test.mjs).

const { useState } = React;

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

// ═══════════════════════════════════════════════════════════
// CLIENT GOALS — Training / Nutrition tabs + coach-visibility toggle.
// Mirrors the website goal page (public/newdesign/ClientGoal.html): goal cards
// (progress + target date) and a categorized template picker on add. Persisted
// to user_goals('client_goals') as { share, training:[], nutrition:[] }.
// ═══════════════════════════════════════════════════════════
const BS_GOAL_CATS = [
  { id: 'cardio',      label: 'Endurance',  group: 'training' },
  { id: 'strength',    label: 'Strength',   group: 'training' },
  { id: 'habits',      label: 'Habits',     group: 'training' },
  { id: 'wellbeing',   label: 'Wellbeing',  group: 'training' },
  { id: 'composition', label: 'Body comp',  group: 'nutrition' },
  { id: 'nutrition',   label: 'Nutrition',  group: 'nutrition' },
  { id: 'career',      label: 'Career',     group: 'work' },
  { id: 'skills',      label: 'Skills',     group: 'work' },
  { id: 'projects',    label: 'Projects',   group: 'work' },
];
const BS_GOAL_TEMPLATES = [
  { cat: 'cardio', t: 'Run a marathon',          cur: 0,   tgt: 26.2, sub: 'miles · 26.2',                 pct: false, weeksOut: 26 },
  { cat: 'cardio', t: 'Complete a triathlon',    cur: 0,   tgt: 100,  sub: 'Olympic distance · swim/bike/run', pct: true,  weeksOut: 24 },
  { cat: 'cardio', t: 'Sub-25:00 5K',            cur: 0,   tgt: 25,   sub: 'minutes · 3.1 miles',          pct: false, weeksOut: 12 },
  { cat: 'cardio', t: 'Half marathon under 1:45', cur: 0,  tgt: 105,  sub: 'minutes · 13.1 miles',         pct: false, weeksOut: 16 },
  { cat: 'cardio', t: 'Bike 100 miles',          cur: 0,   tgt: 100,  sub: 'miles · century ride',         pct: false, weeksOut: 20 },
  { cat: 'strength', t: 'Bench press 225 lbs',   cur: 135, tgt: 225,  sub: 'lbs · one rep max',            pct: false, weeksOut: 16 },
  { cat: 'strength', t: 'Squat 2× bodyweight',   cur: 0,   tgt: 100,  sub: '% of bodyweight',              pct: true,  weeksOut: 20 },
  { cat: 'strength', t: 'Deadlift 405 lbs',      cur: 0,   tgt: 405,  sub: 'lbs · one rep max',            pct: false, weeksOut: 24 },
  { cat: 'strength', t: '10 strict pull-ups',    cur: 0,   tgt: 10,   sub: 'consecutive · dead-hang',      pct: false, weeksOut: 12 },
  { cat: 'habits', t: 'Sleep 8 hours nightly',   cur: 0,   tgt: 7,    sub: 'nights · per week',            pct: false, weeksOut: 8 },
  { cat: 'habits', t: 'Train 4× per week',       cur: 0,   tgt: 4,    sub: 'sessions · per week',          pct: false, weeksOut: 12 },
  { cat: 'habits', t: '30-day streak',           cur: 0,   tgt: 30,   sub: 'consecutive days',             pct: false, weeksOut: 5 },
  { cat: 'habits', t: 'Drink 1 gallon water daily', cur: 0, tgt: 7,   sub: 'days hit · per week',          pct: false, weeksOut: 6 },
  { cat: 'wellbeing', t: 'Feel like myself again', cur: 0, tgt: 100,  sub: '% · weekly self-check-in',     pct: true,  weeksOut: 12 },
  { cat: 'wellbeing', t: 'More calm, less stress', cur: 0, tgt: 100,  sub: '% · stress-down weeks',        pct: true,  weeksOut: 10 },
  { cat: 'wellbeing', t: 'Build confidence',     cur: 0,   tgt: 100,  sub: '% · confidence score',         pct: true,  weeksOut: 12 },
  { cat: 'wellbeing', t: 'Better sleep quality', cur: 0,   tgt: 8,    sub: 'avg hours · 7-day avg',        pct: false, weeksOut: 8 },
  { cat: 'wellbeing', t: 'Mood-up days',         cur: 0,   tgt: 5,    sub: 'good days · per week',         pct: false, weeksOut: 8 },
  { cat: 'wellbeing', t: 'Daily meditation',     cur: 0,   tgt: 10,   sub: 'minutes · per day',            pct: false, weeksOut: 8 },
  { cat: 'wellbeing', t: 'Time outside daily',   cur: 0,   tgt: 30,   sub: 'minutes · per day',            pct: false, weeksOut: 6 },
  { cat: 'wellbeing', t: 'Cut back on alcohol',  cur: 0,   tgt: 100,  sub: '% · reduction from baseline',  pct: true,  weeksOut: 12 },
  { cat: 'wellbeing', t: 'Practice gratitude',   cur: 0,   tgt: 7,    sub: 'entries · per week',           pct: false, weeksOut: 4 },
  { cat: 'composition', t: 'Lose 10 lbs',        cur: 0,   tgt: 10,   sub: 'lbs · sustainably',            pct: false, weeksOut: 12 },
  { cat: 'composition', t: 'Body fat under 15%', cur: 20,  tgt: 15,   sub: '%',                            pct: true,  weeksOut: 20 },
  { cat: 'composition', t: 'Gain 5 lbs muscle',  cur: 0,   tgt: 5,    sub: 'lbs · lean mass',              pct: false, weeksOut: 16 },
  { cat: 'nutrition', t: 'Hit 150g protein daily', cur: 0, tgt: 150,  sub: 'g protein · per day',          pct: false, weeksOut: 8 },
  { cat: 'nutrition', t: 'Cook at home 5×/week', cur: 0,   tgt: 5,    sub: 'meals · per week',             pct: false, weeksOut: 8 },
  { cat: 'nutrition', t: 'Cut added sugar',      cur: 0,   tgt: 100,  sub: '% reduction from baseline',    pct: true,  weeksOut: 8 },
  { cat: 'nutrition', t: '85% protein adherence', cur: 0,  tgt: 85,   sub: '% · days on target',           pct: true,  weeksOut: 8 },
  { cat: 'career',   t: 'Make the promotion case', cur: 0, tgt: 100,  sub: '% · case built & delivered',   pct: true,  weeksOut: 12 },
  { cat: 'career',   t: 'Land a new role',       cur: 0,   tgt: 20,   sub: 'quality applications sent',    pct: false, weeksOut: 12 },
  { cat: 'career',   t: 'Grow the network',      cur: 0,   tgt: 12,   sub: 'real conversations · quarter', pct: false, weeksOut: 12 },
  { cat: 'skills',   t: 'Earn the certification', cur: 0,  tgt: 100,  sub: '% · study plan complete',      pct: true,  weeksOut: 16 },
  { cat: 'skills',   t: 'Deep work 10 h/week',   cur: 0,   tgt: 10,   sub: 'focused hours · per week',     pct: false, weeksOut: 8 },
  { cat: 'skills',   t: 'Read 12 books',         cur: 0,   tgt: 12,   sub: 'books · steady pace',          pct: false, weeksOut: 26 },
  { cat: 'projects', t: 'Ship the launch',       cur: 0,   tgt: 100,  sub: '% · scoped, built, live',      pct: true,  weeksOut: 10 },
  { cat: 'projects', t: 'Start the side project', cur: 0,  tgt: 100,  sub: '% · to first real user',       pct: true,  weeksOut: 16 },
];

// Empty goals for a SIGNED-IN account with nothing set yet — zeroed, NOT the demo
// "Lean by August" goal (that's the signed-out preview only). A real goal +
// weigh-ins merge in once loaded from client_goals.
const BS_GOALS_EMPTY = {
  share: false, primaryGoal: '',
  overall: { title: '', by: null, unit: 'kg', start: 0, startMonth: '', now: 0, target: 0, weighIns: [], why: '' },
  trainingMeta: { title: '', subtitle: '' },
  nutritionMeta: { title: '', subtitle: '' },
  workMeta: { title: '', subtitle: '' },
  training: [], nutrition: [], work: [],
};
function bsGoalIsoFromWeeks(w) { const d = new Date(); d.setDate(d.getDate() + (Number(w) || 0) * 7); return d.toISOString().slice(0, 10); }
function bsGoalDaysUntil(iso) { if (!iso) return null; const ms = new Date(iso).getTime() - Date.now(); return Math.max(0, Math.round(ms / 86400000)); }

// Full-page add/edit flow with a categorized template picker (filtered to the
// active tab's group) + the same fields as the website's GoalEditModal.
// Title-page panel matching BSOverallEditSheet (masthead + hero + gradient rule,
// hidden scrollbar, pinned squared footer).
function BSGoalEditSheet({ tab, goal, onClose, onSave, onDelete }) {
  const { useBS, BSLogo, bsTHexA, BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))' } = window;
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const isNew = !goal;
  const [g, setG] = useState(goal || { t: '', cur: 0, tgt: 100, sub: '', pct: false, cat: '', date: '' });
  const cats = BS_GOAL_CATS.filter(c => c.group === tab);
  const [showTpl, setShowTpl] = useState(isNew);
  const [activeCat, setActiveCat] = useState((cats[0] && cats[0].id) || 'cardio');
  const pick = (tpl) => { setG({ ...g, t: tpl.t, cur: tpl.cur, tgt: tpl.tgt, sub: tpl.sub, pct: tpl.pct, cat: tpl.cat, date: bsGoalIsoFromWeeks(tpl.weeksOut) }); setShowTpl(false); };
  const days = bsGoalDaysUntil(g.date);
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginBottom: 4 };
  // Zero-box underline fields — the Open Ledger form grammar.
  const field = { width: '100%', boxSizing: 'border-box', padding: '6px 0 10px', fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 600, color: t.INK, outline: 'none', '--bs-uline-ink': bsTHexA(t.INK, 0.25) };
  // Keep the raw string while editing (decimals type cleanly); coerce on save.
  // Blank/invalid numbers normalize to the sheet's defaults (0 / 100) so a saved
  // row never renders an empty ratio downstream (goalMeta only null-checks).
  const save = () => { if (!g.t) return; const n = (v, d) => { if (v === '' || v == null) return d; const x = Number(v); return Number.isFinite(x) ? x : d; }; onSave({ ...g, cur: n(g.cur, 0), tgt: n(g.tgt, 100) }); };
  const num = (key, label) => (
    <label style={{ display: 'block' }}><span style={lbl}>{label}</span><input className="bs-uline bs-no-spin" type="number" inputMode="decimal" value={g[key] ?? ''} onChange={(e) => setG({ ...g, [key]: e.target.value })} style={{ ...field, fontVariantNumeric: 'tabular-nums' }} /></label>
  );
  const sheet = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: t.PAPER, display: 'flex', flexDirection: 'column', '--bs-accent': teal }}>
      {/* Title-page header — masthead + hero title (matches the other pages) */}
      <div style={{ flex: '0 0 auto', padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {BSLogo && <BSLogo size={16} color={t.INK} />}
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>Vol. 1 · No. 1</div>
          </div>
          <button onClick={onClose} aria-label={tr('goal:sheet.closeAria', { defaultValue: 'Close' })} style={{ background: 'transparent', border: 0, color: t.INK50, cursor: 'pointer', fontFamily: t.MONO, fontSize: 15, fontWeight: 800, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: teal, fontWeight: 700 }}>{isNew ? tr('goal:edit.eyebrowNew', { defaultValue: 'New · Target' }) : tr('goal:edit.eyebrowEdit', { defaultValue: 'Edit · Target' })}</div>
        <h1 style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 31, letterSpacing: '-0.03em', color: t.INK, margin: '4px 0 0', lineHeight: 1 }}>{isNew
          ? <>{tr('goal:edit.titleNewPre', { defaultValue: 'New' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('goal:edit.titleNewAccent', { defaultValue: 'target.' })}</span></>
          : <>{tr('goal:edit.titleEditPre', { defaultValue: 'Edit' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('goal:edit.titleEditAccent', { defaultValue: 'target.' })}</span></>}</h1>
        <div style={{ marginTop: 12, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />
      </div>
      {/* Scrollable form — scrollbar hidden */}
      <div className="bs-hide-scroll" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `16px ${t.padX}px 18px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {isNew && (
          <div>
            <button onClick={() => setShowTpl(s => !s)} style={{ background: 'transparent', border: 0, padding: '6px 0', minHeight: 32, color: teal, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{showTpl ? tr('goal:edit.hideTemplates', { defaultValue: '▾ Hide templates' }) : tr('goal:edit.browseTemplates', { defaultValue: '▸ Browse goal templates' })}</button>
            {showTpl && (
              <div style={{ marginTop: 4 }}>
                {/* Category index — typographic, active = ink + heat underline */}
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {cats.map(c => { const on = activeCat === c.id; return <button key={c.id} onClick={() => setActiveCat(c.id)} style={{ background: 'transparent', border: 0, padding: '8px 0', minHeight: 36, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}><span style={{ borderBottom: `2px solid ${on ? teal : 'transparent'}`, paddingBottom: 3 }}>{c.label}</span></button>; })}
                </div>
                {/* Template rows — dot-leader ledger rows, no boxes */}
                <div style={{ marginTop: 2 }}>
                  {BS_GOAL_TEMPLATES.filter(x => x.cat === activeCat).map((tpl, i) => (
                    <button key={i} onClick={() => pick(tpl)} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, borderTop: `1px solid ${bsTHexA(t.INK, 0.1)}`, padding: '10px 0', minHeight: 48 }}>
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                        <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tpl.t}</span>
                        <span aria-hidden style={{ flex: 1, minWidth: 14, borderBottom: `1px dotted ${bsTHexA(t.INK, 0.28)}`, transform: 'translateY(-3px)' }} />
                        <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('goal:edit.tplWeeks', { defaultValue: '~{weeks, plural, one {# wk} other {# wks}}', weeks: tpl.weeksOut })}</span>
                      </span>
                      <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tpl.sub}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:sheet.fieldTitle', { defaultValue: 'Title' })}</span><input className="bs-uline" value={g.t} onChange={(e) => setG({ ...g, t: e.target.value })} placeholder={tr('goal:edit.titlePlaceholder', { defaultValue: 'What are you shaping toward?' })} style={field} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          {num('cur', tr('goal:edit.fieldCurrent', { defaultValue: 'Current' }))}
          {num('tgt', tr('goal:sheet.fieldTarget', { defaultValue: 'Target' }))}
        </div>
        <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:edit.fieldSubtext', { defaultValue: 'Subtext' })}</span><input className="bs-uline" value={g.sub} onChange={(e) => setG({ ...g, sub: e.target.value })} placeholder={tr('goal:edit.subtextPlaceholder', { defaultValue: 'e.g. 40 lb to go · +5 lb / 3 weeks' })} style={field} /></label>
        <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:sheet.fieldTargetDate', { defaultValue: 'Target date' })}</span><input className="bs-uline" type="date" value={g.date || ''} onChange={(e) => setG({ ...g, date: e.target.value })} style={field} /></label>
        {g.date && days != null && (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            <span style={{ color: t.INK50 }}>{tr('goal:edit.timeline', { defaultValue: 'Timeline' })}</span>
            <span aria-hidden style={{ flex: 1, minWidth: 14, borderBottom: `1px dotted ${bsTHexA(t.INK, 0.28)}`, transform: 'translateY(-3px)' }} />
            <span style={{ color: teal }}>{tr('goal:edit.timelineValue', { defaultValue: '{days, plural, one {# day} other {# days}} · ~{weeks, plural, one {# wk} other {# wks}}', days, weeks: Math.max(1, Math.round(days / 7)) })}</span>
          </div>
        )}
        <button onClick={() => setG({ ...g, pct: !g.pct })} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, alignSelf: 'flex-start' }}>
          <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${g.pct ? teal : t.RULE}`, background: g.pct ? teal : 'transparent', color: '#04201d', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 }}>{g.pct ? '✓' : ''}</span>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{tr('goal:edit.percentToggle', { defaultValue: 'Show values as percent (%)' })}</span>
        </button>
      </div>
      {/* Pinned footer — text-actions + the clipped solid CTA */}
      <div style={{ flex: '0 0 auto', padding: `13px ${t.padX}px calc(16px + env(safe-area-inset-bottom, 0px))`, borderTop: `1px solid ${t.HAIR || t.RULE}`, display: 'flex', gap: 12, alignItems: 'center', background: t.PAPER }}>
        {!isNew && onDelete && <button onClick={onDelete} style={{ marginRight: 'auto', background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.RUST }}><span style={{ borderBottom: `2px solid ${t.RUST}66`, paddingBottom: 2 }}>{tr('goal:edit.delete', { defaultValue: 'Delete' })}</span></button>}
        <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${bsTHexA(t.INK, 0.35)}`, paddingBottom: 2 }}>{tr('goal:sheet.cancel', { defaultValue: 'Cancel' })}</span></button>
        <button onClick={save} disabled={!g.t} style={{ flex: 1, padding: '14px', borderRadius: 6, clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', border: 0, background: g.t ? teal : t.RULE, color: g.t ? (t.isLight ? '#fff' : '#04201d') : t.INK50, cursor: g.t ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('goal:edit.save', { defaultValue: 'Save target' })}</button>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// A quiet action, B's small pill (Goals, 2026-10-25): a 34px capsule on the track, its words in ink, a
// 44px target. `heat` is the caller's colour and no longer drawn: the pill reads on every paper as is.
function BSOLAct({ heat, label, onClick, t }) {
  const D = bsDash(t);
  return (
    <button type="button" onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', background: 'transparent', border: 0, cursor: 'pointer', padding: 0, minHeight: 44 }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 15px', borderRadius: 999, background: D.track, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK, whiteSpace: 'nowrap' }}>{label}</span>
    </button>
  );
}
// A row: glyph . text . right meta. Button when onPress.
function BSOLRow({ glyph = null, glyphColor, text, textColor, sub = null, meta = null, metaColor, onPress = null, t }) {
  const inner = (
    <>
      {glyph != null && <span style={{ flexShrink: 0, width: 16, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: glyphColor || t.INK50 }}>{glyph}</span>}
      <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', color: textColor || t.INK }}>
        {text}
        {sub && <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>{sub}</span>}
      </span>
      <span aria-hidden style={{ flex: 1, minWidth: 14 }} />
      {meta != null && <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: metaColor || t.INK50 }}>{meta}</span>}
    </>
  );
  const style = { display: 'flex', alignItems: 'baseline', gap: 9, padding: '12px 0', minHeight: 44, boxSizing: 'border-box', width: '100%', textAlign: 'left' };
  return onPress
    ? <button onClick={onPress} style={{ ...style, background: 'transparent', border: 0, cursor: 'pointer' }}>{inner}</button>
    : <div style={style}>{inner}</div>;
}
// Press credit, in B: a card washed in the coach's role colour (`spine`, a mark shade), the credit line
// over the plan's title in that role's text shade (`ink`).
function BSOLCredit({ spine, ink = null, title, credit, t }) {
  return (
    <BSDashCard tint={spine} style={{ marginTop: 12, padding: '14px 16px' }}>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, letterSpacing: '0.1em', textTransform: 'uppercase', color: ink || t.INK70 }}>{credit}</div>
      <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, color: t.INK, letterSpacing: '-0.015em' }}>{title}</div>
    </BSDashCard>
  );
}

// The Contract — the Goals page as a COVER PAGE over full-screen station pages
// (owner pick 2026-08-28, Concept B off the simplification board: the
// one-ledger layout had grown to ~31 always-visible rows and read as
// overwhelming). The COVER holds the page's one job — the verdict lead, the
// register, the NEXT term, and five station DOORS; each door opens a
// full-screen sub-page (view: training/nutrition/work/week/terms) carrying
// that station's FULL former body — targets, lifts, adds, records — verbatim.
// Heat = the member's tier, line-only. Every data computation is carried from
// the one-ledger design unchanged (presentation-only).
export function BSGoalsContract({ overall, data, heat, view, onOpenView, onBack, onLog, onEditTargets, onOpenProgress, onAddGoal, onEditGoal, onEditHeadline, plans: livePlans = null, weekTargets: liveWeekTargets = null, train = null }) {
  const { useBS, BSMeCorner, BSSdCountUp, BSTRedact, bsDateLocale, bsGoalDocKg, bsGoalNow, bsGoalWeighIns, bsPrimaryGoalIsWeight, bsPrimaryGoalLabel, bsSdReduced, bsTHexA, useBSSdInView, BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))' } = window;
  const t = useBS();
  const tr = useShapeTr();
  // B, the dashboard look (owner, 2026-10-25: "make Goals match the new look too", after Progress and
  // Your mornings): each station a card in its colour (training coral, nutrition amber, work violet,
  // this week teal, the terms lime), a card's name in Saira in its colour's TEXT shade, rings and
  // rounded bars in its MARK shade (BSDash.jsx). The page title's period stays the member's tier.
  const D = bsDash(t);
  const STATION_C = { training: 'coral', nutrition: 'amber', work: 'violet', week: 'teal', terms: 'lime' };
  const cardName = (c, x = null) => ({ fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.text[c], ...x });
  const goArrow = (c) => <span aria-hidden style={{ flexShrink: 0, display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 999, background: bsDashA(D.mark[c], D.light ? 0.12 : 0.18), color: D.text[c], fontFamily: t.MONO, fontSize: 12, fontWeight: 800 }}>→</span>;
  const nextChip = <span style={{ flexShrink: 0, padding: '3px 9px', borderRadius: 999, background: bsDashA(D.mark.lime, D.light ? 0.12 : 0.16), color: D.text.lime, fontFamily: t.BODY, fontSize: 11.5, fontWeight: 600 }}>{tr('goal:terms.next', { defaultValue: 'Next' })}</span>;
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  // Every figure below is KILOGRAMS; `dsp` is the only thing that turns one into
  // a number the member reads, and `unit` is their Settings preference rather
  // than the goal document's stored unit. Before this the page rendered the raw
  // stored number under the document's own unit, so flipping Settings to Metric
  // changed the label and not the figure — a 178 that now said "kg".
  const start = bsGoalDocKg(overall.start, overall) || 0, now = bsGoalNow(overall), target = bsGoalDocKg(overall.target, overall) || 0;
  const unit = t.weightUnit;
  const dsp = (kg) => (kg == null || !Number.isFinite(Number(kg)) ? null : Math.round(t.kgToDisplay(Number(kg)) * 10) / 10);
  const down = +(now - start).toFixed(1);
  const range = +(start - target).toFixed(1);
  const byD = overall.by ? new Date(overall.by) : null;
  // ⚠ THE SELECTED UI LANGUAGE, NOT THE DEVICE — `[]` hands Intl the device
  // locale, so Spanish-in-Shape on an English phone read "MAY 21" (the cut-1
  // clock class, at its fifth site). And no `.toUpperCase()`: every render site
  // for this label already carries CSS `text-transform: uppercase`, which is
  // locale-aware through <html lang> where the JS fold is not.
  const byLabel = byD && !isNaN(byD) ? byD.toLocaleDateString(bsDateLocale(), { month: 'short', day: 'numeric' }) : '';
  // Weekly pace from the real weigh-in series (per-week change when dated, else
  // per-weigh-in delta).
  const wPace = (() => {
    const wi = bsGoalWeighIns(overall);
    if (wi.length < 2) return null;
    const a = wi[0], b = wi[wi.length - 1];
    const da = new Date(a.d), db = new Date(b.d);
    const dk = Number(b.kg) - Number(a.kg);
    if (!isNaN(da) && !isNaN(db) && db > da) { const wks = Math.max(1, (db - da) / (7 * 86400000)); return Math.round((dk / wks) * 10) / 10; }
    return Math.round((dk / Math.max(1, wi.length - 1)) * 10) / 10;
  })();
  // Engine pace projection (least-squares over the last 8 weeks) via
  // window.ShapeSignals — the SAME engine the website goal page + coach brief use.
  const goalProj = (() => {
    try {
      const S = (typeof window !== 'undefined') && window.ShapeSignals;
      if (!S || !S.goalProjection || !(start && target)) return null;
      const goal = { target, start, now, unit, history: bsGoalWeighIns(overall) };
      const p = S.goalProjection(goal);
      if (!p) return null;
      let slip = null; try { slip = S.goalSlipDays ? S.goalSlipDays(goal) : null; } catch (e) {}
      return { ...p, slip };
    } catch (e) { return null; }
  })();
  const paceVal = (goalProj && goalProj.ratePerWeek != null) ? goalProj.ratePerWeek : wPace;
  // ⚠ PRESENTATION GETS DISPLAY UNITS; PROJECTIONS KEEP KILOGRAMS. bsGoalVerdict
  // formats all three figures and their differences against `unit`, so handing
  // it kilograms under an 'lb' label printed kilogram-sized progress amounts as
  // pounds. `goalProj` is deliberately NOT converted — it contributes a date
  // label and a slip in DAYS, no weights.
  const verdict = bsGoalVerdict({ start: dsp(start), now: dsp(now), target: dsp(target), unit, proj: goalProj, tr });
  // The house treatment gives the lead's FINAL STOP the tier heat. The shipped
  // expression was `verdict.lead.slice(0, -1)` + a hardcoded '.', which is wrong
  // twice once the lead is translated:
  //   (1) `slice(0, -1)` walks UTF-16 CODE UNITS, so a lead ending in an astral
  //       codepoint loses half a surrogate pair and renders U+FFFD (the cut-10
  //       drop-cap class, at a second site);
  //   (2) it ASSUMES a trailing '.'. A locale that closes with '。', '!' or no
  //       terminal mark at all had a real character silently eaten and an
  //       English period painted in its place.
  // Only peel a mark that IS terminal punctuation — otherwise render the lead
  // whole and skip the accent. Losing a decoration is survivable; eating a
  // member-visible character is not. THAT test is the load-bearing half.
  // ⚠ THE CODEPOINT SPLIT IS DEFENSIVE HERE, NOT LOAD-BEARING, and saying so is
  // the point: measured against the naive slice(-1)/slice(0,-1) pair, the two
  // agree on EVERY input, terminal astral characters included — because the set
  // above contains no astral mark, so a lone low surrogate can never satisfy
  // leadDot and the character-eating branch is unreachable. It is kept because
  // it is the correct idiom and because adding one astral mark to that set
  // would make it load-bearing overnight — but it is NOT the About page's
  // drop-cap defect (charAt(0) on a LEADING astral genuinely broke). Do not
  // "simplify" it, and do not read a kill into it that the tests cannot make.
  const leadChars = [...String(verdict.lead || '')];
  const leadLast = leadChars.length ? leadChars[leadChars.length - 1] : '';
  const leadDot = /[.。．!?！？¡¿]/.test(leadLast) ? leadLast : '';
  const leadBody = leadDot ? leadChars.slice(0, -1).join('') : leadChars.join('');
  const [readRef, readSeen] = useBSSdInView();
  // Shared station furniture (all three station pages render the same anatomy).
  const stationMotto = (meta) => (meta.title || meta.subtitle) ? (
    <div style={{ fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>“{[meta.title, meta.subtitle].filter(Boolean).join(' — ')}”</div>
  ) : null;
  // The five station names — ONE map, read by the door titles AND the station
  // page titles, so a rename can never move one and leave the other.
  const STATION_LABEL = {
    training: tr('goal:door.training', { defaultValue: 'Training' }),
    nutrition: tr('goal:door.nutrition', { defaultValue: 'Nutrition' }),
    work: tr('goal:door.work', { defaultValue: 'Work' }),
    week: tr('goal:door.week', { defaultValue: 'This week' }),
    terms: tr('goal:door.terms', { defaultValue: 'The terms' }),
  };
  const ADD_TARGET = {
    training: tr('goal:station.addTraining', { defaultValue: 'Add a training target' }),
    nutrition: tr('goal:station.addNutrition', { defaultValue: 'Add a nutrition target' }),
    work: tr('goal:station.addWork', { defaultValue: 'Add a work target' }),
  };
  const RECORD_LINK = {
    training: tr('goal:station.recordTraining', { defaultValue: 'The full training record' }),
    nutrition: tr('goal:station.recordNutrition', { defaultValue: 'The full nutrition record' }),
  };
  // The targets card's name, the heading a reader hears, in the station's colour.
  const tgtEyebrow = (c) => (
    <h2 style={{ margin: 0, ...cardName(c) }}>{tr('goal:station.supportingTargets', { defaultValue: 'Supporting targets · serve the goal' })}</h2>
  );
  const hasGoal = range !== 0 && Number.isFinite(start) && Number.isFinite(target) && start && target;
  // ⚠ A GOAL THAT ISN'T ABOUT WEIGHT HAS NO WEIGHT READ (owner, 2026-10-20: "Show the goal's
  // words"). "Run my first 10k" with no weight target read "Set the terms." and asked for a start
  // and target weight. The goal's words are the page's title above; the card says the targets
  // below carry it, with no bar or weight figures, until a weight target is set as well. Read
  // here, before the sub-pages, so the terms door and page say the same (Codex on #2416).
  const wordsOnly = !hasGoal && !bsPrimaryGoalIsWeight(data && data.primaryGoal);
  // Milestones from the real goal trajectory (start -> quarter points -> target).
  const milestones = (() => {
    if (!hasGoal) return [];
    // `v` and `w` are kilograms (milestones are derived from start/range); the
    // comparison stays in kg and only the label converts.
    const fmt = (v) => `${dsp(v)} ${unit}`;
    const reached = (w) => range > 0 ? now <= w + 0.05 : now >= w - 0.05;
    const defs = [
      { w: start, t: tr('goal:terms.mBaseline', { defaultValue: 'Baseline set' }), sub: tr('goal:terms.mBaselineSub', { defaultValue: 'plans live' }) },
      { w: start - range * 0.25, t: tr('goal:terms.mQuarter', { defaultValue: '25% there' }), sub: tr('goal:terms.mQuarterSub', { defaultValue: 'habits sticking' }) },
      { w: start - range * 0.5, t: tr('goal:terms.mHalf', { defaultValue: 'Halfway' }), sub: tr('goal:terms.mHalfSub', { defaultValue: 'on pace' }) },
      { w: start - range * 0.75, t: tr('goal:terms.mThree', { defaultValue: '75% there' }), sub: tr('goal:terms.mThreeSub', { defaultValue: 'closing in' }) },
      { w: target, t: tr('goal:terms.mGoal', { defaultValue: 'Goal' }), sub: tr('goal:terms.mGoalSub', { defaultValue: 'lean & strong' }) },
    ];
    let nextMarked = false;
    return defs.map((m, i) => {
      const done = reached(m.w);
      const isNext = !done && !nextMarked; if (isNext) nextMarked = true;
      return { done, next: isNext, n: String(i + 1).padStart(2, '0'), t: tr('goal:terms.milestoneRow', { defaultValue: '{name} · {value}', name: m.t, value: fmt(m.w) }), sub: m.sub, when: i === 0 ? (overall.startMonth || tr('goal:terms.whenStart', { defaultValue: 'Start' })) : i === defs.length - 1 ? (byLabel || tr('goal:terms.whenGoal', { defaultValue: 'Goal' })) : (isNext ? tr('goal:terms.next', { defaultValue: 'Next' }) : (done ? tr('goal:terms.doneState', { defaultValue: 'Done' }) : '')) };
    });
  })();
  // Your plans -> station credits. Live (assigned plan + coach cadence/kcal) when
  // available; demo only signed-out.
  const plans = (Array.isArray(livePlans) && livePlans.length)
    ? livePlans
    : (signedIn ? [] : [
      { role: 'Training', t: '12-wk lean strength', sub: 'Jordan · 4×/wk' },
      { role: 'Nutrition', t: 'Protein-led cut', sub: 'Dr. Maya · 1,890 kcal' },
    ]);
  const trainPlan = plans.find((p) => p.role === 'Training');
  const nutrPlan = plans.find((p) => p.role === 'Nutrition');
  // This week targets — live ShapeProgress rollups when available, else demo.
  const weekTargets = (Array.isArray(liveWeekTargets) && liveWeekTargets.length)
    ? liveWeekTargets
    // ⚠ SIGNED-IN EMPTY IS LIVE COPY AND IS TRANSLATED; the signed-out branch
    // below is DEMO and deliberately is not (the cut-4 rule — localizing demo
    // fixtures makes the preview read less like the live screen).
    // ⚠ And the third row now MATCHES the live builder. BSClientGoals' own
    // comment claims "the same words the honest-empty set above uses, so the
    // live and empty paths can never disagree" — true of rows 1, 2 and 4 and
    // false of row 3, which read "Steps · avg · goal 8k" here and "7d volume ·
    // load lifted" the moment the rollup resolved. A row that renames itself
    // mid-load is the claim being wrong, not the label; the live wording wins.
    // Each row carries its colour (`c`) and, where it has a target, the share of it done (`pct`, the
    // ring on This week); a row with no target has no `pct` and reads as its figure alone.
    : (signedIn ? [
      { l: tr('goal:week.sessions', { defaultValue: 'Sessions' }), v: '0/—', sub: tr('goal:week.setPlan', { defaultValue: 'set a plan' }), c: 'coral', pct: null },
      { l: tr('goal:week.protein', { defaultValue: 'Protein days' }), v: '0/7', sub: tr('goal:week.proteinTracked', { defaultValue: 'days tracked' }), c: 'amber', pct: 0 },
      { l: tr('goal:week.volume', { defaultValue: '7d volume' }), v: '—', sub: tr('goal:week.volumeSub', { defaultValue: 'load lifted' }), c: 'teal', pct: null },
      { l: tr('goal:week.sleep', { defaultValue: 'Sleep' }), v: '—', sub: tr('goal:week.sleepSub', { defaultValue: 'avg · goal 7h' }), c: 'violet', pct: null },
    ] : [
      { l: 'Sessions', v: '3/4', sub: 'one to go', c: 'coral', pct: 3 / 4 },
      { l: 'Protein days', v: '6/7', sub: '≥170g hit', c: 'amber', pct: 6 / 7 },
      { l: 'Steps', v: '7.2k', sub: 'avg · goal 8k', c: 'teal', pct: 7.2 / 8 },
      { l: 'Sleep', v: '6.8h', sub: 'avg · goal 7h', c: 'violet', pct: 6.8 / 7 },
    ]);
  // Key lifts — live PRs when present, [] when signed-in with no data, demo
  // signed-out. That is what the old Training tab's comment claimed; it is what
  // the code does as of this change.
  const livePrs = (train && Array.isArray(train.prs) && train.prs.length) ? train.prs : null;
  // ⚠ A SIGNED-IN MEMBER NEVER READS THE DEMO LIFTS. The old gate was
  // `trainEmpty = signedIn && !train`, which goes false the moment the train
  // rollup resolves — and it always resolves — so the ternary fell to the
  // hardcoded array below and showed every signed-in member a 90 kg bench and a
  // 150 kg deadlift as their OWN PRs. `livePrs` could never rescue it either:
  // it needs `train.prs`, and /api/client/train returns exactly
  // { ok, assignedWorkouts, stats, recentSessions } — PRs are served by
  // /api/client/progress, a different route — so that branch is dead for
  // everyone. Signed in with no live PRs is now [] and the station simply omits
  // the lift rows, which is the honest answer; the demo set is signed-out only.
  // (Pointing livePrs at the route that actually serves PRs is registered.)
  const prRows = livePrs
    ? livePrs.slice(0, 4).map((p) => { const m = t.uMeasure(p.value, p.unit); return { t: p.lift, w: `${m.value} ${m.unit}`, d: p.deltaPct != null ? `+${Number(p.deltaPct).toFixed(1)}%` : 'held' }; })
    : null;
  const liftRows = prRows || (signedIn ? [] : [
    { t: 'Bench Press', w: '90 kg', d: '+5.0' },
    { t: 'Back Squat', w: '120 kg', d: '+5.0' },
    { t: 'Barbell Row', w: '75 kg', d: '+2.5' },
    { t: 'Deadlift', w: '150 kg', d: 'held' },
  ]);
  const trainGoals = Array.isArray(data.training) ? data.training : [];
  const nutrGoals = Array.isArray(data.nutrition) ? data.nutrition : [];
  const workGoals = Array.isArray(data.work) ? data.work : [];
  const trainingMeta = data.trainingMeta || {};
  const nutritionMeta = data.nutritionMeta || {};
  const workMeta = data.workMeta || {};
  const goalMeta = (g) => (g.pct ? `${g.cur ?? 0}/${g.tgt ?? 100}%` : `${g.cur ?? 0} → ${g.tgt ?? ''}`.trim());
  // The next milestone's dot on the terms track: lime, breathing (still when motion is reduced).
  const breathGlow = bsSdReduced() ? null : { '--sd-glow': bsDashA(D.mark.lime, 0.45), animation: 'bsSdPrBreath 2400ms ease-in-out infinite' };
  // Cover-door sublines — an honest one-line inventory of what each page holds.
  // ⚠ ICU, not `target${n === 1 ? '' : 's'}` — no language forms a plural by
  // appending a letter, and ru/uk need FOUR categories rather than two.
  const tCount = (n) => n
    ? tr('goal:door.targets', { defaultValue: '{count, plural, one {# target} other {# targets}}', count: n })
    : tr('goal:door.noTargets', { defaultValue: 'No targets yet' });
  const noPlan = tr('goal:door.noPlan', { defaultValue: 'no plan yet' });
  // The count is the door's figure (`tCount`); the subline is the plan and its coach, or the headline.
  const trainDoorSub = [trainPlan ? trainPlan.t : (signedIn ? noPlan : null), trainPlan ? trainPlan.sub : null].filter(Boolean).join(' · ');
  const nutrDoorSub = [nutrPlan ? nutrPlan.t : (signedIn ? noPlan : null), nutrPlan ? nutrPlan.sub : null].filter(Boolean).join(' · ');
  const workDoorSub = workMeta.title || null;
  // ⚠ NO `.toLowerCase()` ON THE LABEL. It is locale-INSENSITIVE (Turkish folds
  // I→ı, not i), it now runs over TRANSLATED text — and it was pointless even in
  // English: the door subline's own style carries CSS `text-transform:
  // uppercase`, so the JS fold was undone one line later by a transform that IS
  // locale-aware. How a label sits in a meta line is the catalog's call.
  // This week's door: the first figure large, its name and the second figure under it.
  const weekDoorBig = weekTargets[0] ? weekTargets[0].v : null;
  const weekDoorSub = [weekTargets[0] ? String(weekTargets[0].l || '') : null, weekTargets[1] ? `${weekTargets[1].v} ${String(weekTargets[1].l || '')}` : null].filter(Boolean).join(' · ');
  const termsDoorSub = wordsOnly
    ? (overall.why ? tr('goal:terms.whyHead', { defaultValue: 'Your why' }) : tr('goal:terms.addWhy', { defaultValue: 'Add your why' }))
    : hasGoal
    ? (overall.why
      ? tr('goal:door.milestonesWhy', { defaultValue: '{done}/{total} milestones · your why', done: milestones.filter((m) => m.done).length, total: milestones.length })
      : tr('goal:door.milestones', { defaultValue: '{done}/{total} milestones', done: milestones.filter((m) => m.done).length, total: milestones.length }))
    : tr('goal:door.setTerms', { defaultValue: 'Set the terms' });
  const nextTerm = milestones.find((m) => m.next) || null;
  // A station door — a card in the station's colour (`c`): its name, the figure (`big`), the inventory
  // subline and an arrow. Two to a row; a `wide` door runs the row with its name and subline beside
  // the arrow.
  const door = (c, title, big, sub, key, wide = false) => (
    <BSDashCard as="button" key={key} type="button" data-goal-door={key} onClick={() => onOpenView(key)} style={{ display: 'flex', flexDirection: wide ? 'row' : 'column', alignItems: wide ? 'center' : 'stretch', gap: wide ? 12 : 0, width: '100%', minWidth: 0, textAlign: 'left', cursor: 'pointer', padding: '13px 14px', borderRadius: 18, minHeight: 56, color: t.INK, font: 'inherit', gridColumn: wide ? '1 / -1' : undefined }}>
      {wide ? (
        <>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', ...cardName(c) }}>{title}</span>
            {sub ? <span style={{ display: 'block', marginTop: 4, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.35, color: t.INK70 }}>{sub}</span> : null}
          </span>
          {goArrow(c)}
        </>
      ) : (
        <>
          <span style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
            <span style={{ minWidth: 0, ...cardName(c) }}>{title}</span>
            {goArrow(c)}
          </span>
          {big ? <span style={{ display: 'block', marginTop: 2, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.15, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{big}</span> : null}
          {sub ? <span style={{ marginTop: 4, fontFamily: t.BODY, fontSize: 11.5, lineHeight: 1.3, color: t.INK70, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{sub}</span> : null}
        </>
      )}
    </BSDashCard>
  );
  // Sub-page chrome — mast row + ← Back + the station title (the parent hides
  // its own header + share strip while a sub-page is open).
  // The station's colour names its page: "The contract" in it, and the title's period.
  const pageHead = (label) => (
    <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
      {window.BSMastRow && <window.BSMastRow trailing={<BSMeCorner />} style={{ marginBottom: 12 }} />}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button data-bs-back="" onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, minHeight: 44, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 700 }}>← {tr('common:action.back', { defaultValue: 'Back' })}</button>
        <span style={cardName(STATION_C[view] || 'teal', { fontSize: 10.5 })}>{tr('goal:station.eyebrow', { defaultValue: 'The contract' })}</span>
      </div>
      {/* tabIndex -1 so the parent can move focus here when a station opens: the
          door that was pressed unmounts with the cover, and without this a
          keyboard/screen-reader user is dropped on document.body with no
          announcement that the page changed. Not in the tab order. */}
      <h1 data-goal-heading tabIndex={-1} style={{ outline: 'none', margin: '6px 0 0', fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK }}>{label}<span style={{ color: D.mark[STATION_C[view] || 'teal'] }}>.</span></h1>
    </div>
  );
  // A supporting target: its words, where it stands against its mark, the note under it, and a rounded
  // bar when the target is above where it stands (a count or a share climbing to it). A target below
  // where it stands (a weight or a time coming down) has no start to measure from, so it has no bar.
  const targetShare = (g) => {
    const cur = Number(g.cur), tgt = Number(g.tgt);
    return Number.isFinite(cur) && Number.isFinite(tgt) && tgt > 0 && cur >= 0 && cur <= tgt ? cur / tgt : null;
  };
  const targetRow = (kind, g, i) => {
    const share = targetShare(g);
    const c = STATION_C[kind];
    return (
      <button key={`${kind}-${i}`} type="button" data-goal-target={i} onClick={() => onEditGoal(kind, i)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', textAlign: 'left', background: 'transparent', border: 0, borderTop: i ? `1px solid ${D.border}` : 0, cursor: 'pointer', padding: '12px 0', minHeight: 44, font: 'inherit', color: t.INK }}>
        <span style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
          <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, letterSpacing: '-0.01em', color: t.INK }}>{g.t || tr('goal:station.targetFallback', { defaultValue: 'Target' })}</span>
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{goalMeta(g)}</span>
        </span>
        {g.sub ? <span style={{ display: 'block', marginTop: 3, fontFamily: t.BODY, fontSize: 11.5, lineHeight: 1.35, color: t.INK70 }}>{g.sub}</span> : null}
        {share != null ? (
          <span aria-hidden data-goal-target-bar="" style={{ display: 'block', height: 8, marginTop: 8, borderRadius: 99, background: D.track, overflow: 'hidden' }}>
            <span style={{ display: 'block', width: `${share * 100}%`, height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${bsDashA(D.mark[c], 0.62)}, ${D.mark[c]})` }} />
          </span>
        ) : null}
      </button>
    );
  };
  // A key lift: its name, its best and the change on it, in a tile.
  const liftTile = (l, i) => (
    <div key={`lift-${i}`} style={{ minWidth: 0, padding: '10px 11px', borderRadius: 14, background: D.track }}>
      <div style={{ fontFamily: t.BODY, fontSize: 12, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{l.t}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6, marginTop: 3 }}>
        <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{l.w}</span>
        <span style={{ flexShrink: 0, padding: '2px 7px', borderRadius: 999, background: bsDashA(D.mark.lime, D.light ? 0.12 : 0.16), fontFamily: t.MONO, fontSize: 9, fontWeight: 800, color: D.text.lime, whiteSpace: 'nowrap' }}>▲ {l.d}</span>
      </div>
    </div>
  );
  // Full station body — the one-ledger design's station anatomy VERBATIM
  // (motto, coach credit, targets, lifts, add, record), now on its own page so
  // every target renders (the 3-row cover cap died with the cover-page pick).
  // ⚠ THREE KEYS, NOT ONE WITH A {kind} PLACEHOLDER. `kind` is the STORED
  // discipline token ('training' | 'nutrition' | 'work') — the same value that
  // indexes data[kind] — so interpolating it renders the raw English id as copy
  // in twelve locales (the class cuts 5, 6 and 9 each paid for at a different
  // site). Lower-casing a translated noun into the frame would be worse: that is
  // the locale-insensitive fold, one line further on.
  const stationBody = (kind) => {
    const goalsArr = kind === 'training' ? trainGoals : kind === 'nutrition' ? nutrGoals : workGoals;
    const meta = kind === 'training' ? trainingMeta : kind === 'nutrition' ? nutritionMeta : workMeta;
    const c = STATION_C[kind];
    return (
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        {stationMotto(meta)}
        {kind === 'training' && (trainPlan
          // ⚠ NO `.toUpperCase()` — BSOLCredit's credit line already carries CSS
          // `text-transform: uppercase` (locale-aware via <html lang>), and the
          // value is a coach-authored cadence string, not our copy.
          ? <BSOLCredit spine={D.mark.coral} ink={D.text.coral} title={trainPlan.t} credit={tr('goal:station.creditTrainer', { defaultValue: 'TRAINER · {detail}', detail: String(trainPlan.sub || '') })} t={t} />
          : signedIn
            ? <><BSTRedact INK={t.INK} label={tr('goal:station.noTrainingPlan', { defaultValue: 'No training plan yet' })} /><BSOLAct heat={heat} label={tr('goal:station.findCoach', { defaultValue: 'Find a coach →' })} onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openMarket', { detail: 'trainer' })); } catch (e) {} }} t={t} /></>
            : <BSOLCredit spine={D.mark.coral} ink={D.text.coral} title="12-wk lean strength" credit="TRAINER · JORDAN · 4×/WK" t={t} />)}
        {kind === 'nutrition' && (nutrPlan
          ? <BSOLCredit spine={D.mark.amber} ink={D.text.amber} title={nutrPlan.t} credit={tr('goal:station.creditNutritionist', { defaultValue: 'NUTRITIONIST · {detail}', detail: String(nutrPlan.sub || '') })} t={t} />
          : signedIn
            ? <><BSTRedact INK={t.INK} label={tr('goal:station.noNutritionPlan', { defaultValue: 'No nutrition plan yet' })} /><BSOLAct heat={heat} label={tr('goal:station.findCoach', { defaultValue: 'Find a coach →' })} onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openMarket', { detail: 'nutritionist' })); } catch (e) {} }} t={t} /></>
            : <BSOLCredit spine={D.mark.amber} ink={D.text.amber} title="Protein-led cut" credit="NUTRITIONIST · DR. MAYA · 1,890 KCAL" t={t} />)}
        <BSDashCard as="section" data-goal-targets={kind} style={{ marginTop: 12, padding: '14px 16px 4px' }}>
          {tgtEyebrow(c)}
          {goalsArr.length === 0 && <div style={{ padding: '8px 0' }}><BSTRedact INK={t.INK} label={tr('goal:door.noTargets', { defaultValue: 'No targets yet' })} /></div>}
          {goalsArr.map((g, i) => targetRow(kind, g, i))}
        </BSDashCard>
        {kind === 'training' && liftRows.length > 0 && (
          <BSDashCard data-goal-lifts="" style={{ marginTop: 12, padding: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {liftRows.map((l, i) => liftTile(l, i))}
          </BSDashCard>
        )}
        <button onClick={() => onAddGoal(kind)} style={{ width: '100%', boxSizing: 'border-box', marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, padding: '12px 14px', background: 'transparent', border: `1.5px dashed ${bsTHexA(t.INK, 0.3)}`, borderRadius: 16, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span aria-hidden style={{ color: D.mark[c], fontSize: 13, lineHeight: 1 }}>＋</span> {ADD_TARGET[kind]}</button>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0 10px', marginTop: 4 }}>
          <BSOLAct heat={heat} label={tr('goal:station.editHeadline', { defaultValue: 'Edit headline' })} onClick={() => onEditHeadline(kind)} t={t} />
        </div>
        {(kind === 'training' || kind === 'nutrition') && (
          <BSDashCard style={{ marginTop: 6, padding: '0 16px', borderRadius: 18 }}>
            <BSOLRow t={t} text={RECORD_LINK[kind]} meta="→" metaColor={D.text[c]} onPress={onOpenProgress} />
          </BSDashCard>
        )}
      </div>
    );
  };

  const msDone = milestones.filter((m) => m.done).length;
  const msLabel = tr('goal:door.milestones', { defaultValue: '{done}/{total} milestones', done: msDone, total: milestones.length });

  // ── Sub-pages (view != 'cover') — full-screen, their own ← Back ──
  if (view !== 'cover') {
    // The terms track runs teal up to the last milestone met. A milestone to come is a hollow dot
    // filled with the card's own colour (its see-through white laid over the paper), so the track
    // stops at its rim.
    const lastDone = milestones.reduce((a, m, i) => (m.done ? i : a), -1);
    const trackPct = milestones.length > 1 && lastDone > 0 ? Math.round((lastDone / (milestones.length - 1)) * 100) : 0;
    return (
      <>
        {pageHead(STATION_LABEL[view] || tr('goal:station.eyebrow', { defaultValue: 'The contract' }))}
        {view === 'week' && (
          // Each figure a card in its colour, in a ring of its share done when it has a target.
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, padding: `14px ${t.padX}px 0` }}>
            {weekTargets.map((w, i) => {
              const c = w.c || ['coral', 'amber', 'teal', 'violet'][i % 4];
              const share = Number.isFinite(w.pct) ? Math.max(0, Math.min(1, w.pct)) : null;
              const fig = <span style={{ fontFamily: t.DISPLAY, fontSize: String(w.v).length > 5 ? 17 : 22, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{w.v}</span>;
              return (
                <BSDashCard as="section" key={i} data-goal-week={i} style={{ padding: 14, borderRadius: 18 }}>
                  <h2 style={{ margin: 0, ...cardName(c) }}>{w.l}</h2>
                  <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 88, margin: '10px 0 8px' }}>
                    {share != null ? <BSDashRing id={`goal-week-${i}`} pct={share} size={88} stroke={9} from={D.mark[c]}>{fig}</BSDashRing> : fig}
                  </div>
                  <div style={{ textAlign: 'center', fontFamily: t.BODY, fontSize: 12, lineHeight: 1.3, color: t.INK70 }}>{w.sub}</div>
                </BSDashCard>
              );
            })}
          </div>
        )}
        {view === 'terms' && (
          <div style={{ padding: `14px ${t.padX}px 0` }}>
            {wordsOnly ? (
              <BSDashCard>
                <div data-goal-words style={{ fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: t.INK70, overflowWrap: 'anywhere' }}>
                  {tr('goal:terms.wordsNone', { defaultValue: '“{goal}” isn’t a weight goal, so it has no weight milestones.', goal: bsPrimaryGoalLabel(data.primaryGoal, tr) })}
                </div>
                <BSOLAct heat={heat} label={tr('goal:cover.editTargets', { defaultValue: 'Edit targets' })} onClick={onEditTargets} t={t} />
              </BSDashCard>
            ) : !hasGoal ? (
              <><BSTRedact INK={t.INK} label={tr('goal:terms.noGoal', { defaultValue: 'No goal set yet' })} /><BSOLAct heat={heat} label={tr('goal:door.setTerms', { defaultValue: 'Set the terms' })} onClick={onEditTargets} t={t} /></>
            ) : (
              <>
                <BSDashCard as="section" data-goal-milestones="" style={{ padding: '14px 16px 8px' }}>
                  <h2 style={{ margin: 0, ...cardName('lime') }}>{msLabel}</h2>
                  <div style={{ position: 'relative', marginTop: 8 }}>
                    <span aria-hidden style={{ position: 'absolute', left: 10, top: 24, bottom: 24, width: 2, borderRadius: 2, background: `linear-gradient(${D.mark.teal} 0 ${trackPct}%, ${D.track} ${trackPct}%)` }} />
                    {milestones.map((m, i) => (
                      <div key={i} data-goal-milestone={m.done ? 'done' : m.next ? 'next' : 'todo'} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 14, minHeight: 48 }}>
                        <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, boxSizing: 'border-box', borderRadius: 99, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, ...(m.done ? { background: D.mark.teal, color: t.isLight ? '#fff' : '#04201d' } : m.next ? { background: D.mark.lime, boxShadow: `0 0 0 5px ${bsDashA(D.mark.lime, 0.22)}`, ...breathGlow } : { background: `linear-gradient(${D.card}, ${D.card}), ${t.PAPER}`, border: `2px solid ${D.track}` }) }}>{m.done ? '✓' : ''}</span>
                        <span style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: m.next ? 700 : 500, letterSpacing: '-0.01em', color: m.done ? t.INK50 : t.INK }}>{m.t}</span>
                          {m.next && m.sub ? <span style={{ display: 'block', marginTop: 2, fontFamily: t.BODY, fontSize: 12, color: t.INK70 }}>{m.sub}</span> : null}
                        </span>
                        {m.next ? nextChip : <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{m.when || ''}</span>}
                      </div>
                    ))}
                  </div>
                </BSDashCard>
                <BSOLAct heat={heat} label={tr('goal:cover.editTargets', { defaultValue: 'Edit targets' })} onClick={onEditTargets} t={t} />
              </>
            )}
            <BSDashCard as="section" data-goal-why="" tint={D.mark.violet} style={{ marginTop: 12 }}>
              <h2 style={{ margin: 0, ...cardName('violet') }}>{tr('goal:terms.whyHead', { defaultValue: 'Your why' })}</h2>
              {overall.why
                ? <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 500, lineHeight: 1.45, color: t.INK }}>“{overall.why}”</div>
                : <BSOLAct heat={heat} label={tr('goal:terms.addWhy', { defaultValue: 'Add your why' })} onClick={onEditTargets} t={t} />}
            </BSDashCard>
          </div>
        )}
        {(view === 'training' || view === 'nutrition' || view === 'work') && stationBody(view)}
        <div style={{ height: 28 }} />
      </>
    );
  }

  // ── The COVER — one card that answers "am I on track", one action, then the doors ──
  // Redesign (owner, 2026-10-20: "easier to read, more straightforward, easier to
  // navigate"): the target and date read once, as a sentence; the progress is a bar
  // with its two ends; three figures instead of four (the ETA is the lead's own
  // words); Log weigh-in is the one solid action; the next milestone is a single
  // row; the doors' sublines are plain text. Every figure is the one computed above.
  // The verdict's own "% there" (bsGoalPct), in the same display units it is given.
  const pct = hasGoal ? bsGoalPct({ start: dsp(start), now: dsp(now), target: dsp(target) }) : null;
  const targetLine = hasGoal
    ? (byLabel
      ? tr('goal:cover.targetBy', { defaultValue: 'Target {value} by {date}', value: `${dsp(target)} ${unit}`, date: byLabel })
      : tr('goal:cover.target', { defaultValue: 'Target {value}', value: `${dsp(target)} ${unit}` }))
    : null;
  const ctaInk = t.isLight ? '#fff' : '#04201d';
  // Current, To go and Pace, each in a tile in its own colour.
  const statC = ['teal', 'amber', 'violet'];
  return (
    <>
      {/* THE READ — the goal's ring beside the verdict and its target, then the three figures. The
          ring is the bar it replaced: one role="img", its share done as its name. */}
      <div ref={readRef} style={{ margin: `14px ${t.padX}px 0` }}>
        <BSDashCard data-goal-read="" tint={D.mark.teal}>
          {wordsOnly ? (
            <div data-goal-words>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.22, color: t.INK }}>
                {tr('goal:cover.wordsLead', { defaultValue: 'Your targets carry this one' })}<span style={{ color: D.mark.teal }}>.</span>
              </div>
              <div style={{ marginTop: 8, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: t.INK70, overflowWrap: 'anywhere' }}>
                {tr('goal:cover.wordsSub', { defaultValue: '“{goal}” isn’t a weight goal, so there’s no weight bar. Add a weight target to track one too.', goal: bsPrimaryGoalLabel(data.primaryGoal, tr) })}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {pct != null && (
                <div role="img" aria-label={`${pct}%`} style={{ flexShrink: 0 }}>
                  <BSDashRing id="goal-read" pct={pct / 100} size={92} stroke={10} from={D.mark.teal} to={D.mark.lime}>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{pct}%</span>
                  </BSDashRing>
                </div>
              )}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.22, color: verdict.tone === 'bad' ? t.RUST : t.INK }}>
                  {leadBody}{leadDot ? <span style={{ color: D.mark.teal }}>{leadDot}</span> : null}
                </div>
                {targetLine && <div style={{ marginTop: 6, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.35, color: t.INK70 }}>{targetLine}</div>}
              </div>
            </div>
          )}
          {!wordsOnly && <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            {[
              { l: tr('goal:cover.statCurrent', { defaultValue: 'Current' }), v: dsp(now), u: unit },
              { l: tr('goal:cover.statToGo', { defaultValue: 'To go' }), v: hasGoal ? bsGoalRemaining({ start: dsp(start), now: dsp(now), target: dsp(target) }) : null, u: unit },
              { l: tr('goal:cover.statPace', { defaultValue: 'Pace' }), v: paceVal != null ? dsp(paceVal) : null, u: `${unit}/wk` },
            ].map((r, i) => (
              <div key={i} style={{ minWidth: 0, padding: '10px 10px 9px', borderRadius: 14, background: D.track }}>
                <div style={cardName(statC[i], { fontSize: 9.5 })}>{r.l}</div>
                <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {r.v != null ? <><BSSdCountUp text={String(r.v)} run={readSeen} /><span style={{ fontFamily: t.BODY, fontSize: 10.5, fontWeight: 400, color: t.INK50, marginLeft: 3 }}>{r.u}</span></> : '—'}
                </div>
              </div>
            ))}
          </div>}
        </BSDashCard>
      </div>

      {/* The one action, and its quiet partner */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `12px ${t.padX}px 0` }}>
        <button onClick={onLog} style={{ flex: 1, minHeight: 44, borderRadius: 999, border: 0, cursor: 'pointer', background: D.mark.teal, color: ctaInk, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', boxShadow: D.light ? 'none' : `0 0 18px ${bsDashA(D.mark.teal, 0.35)}` }}>{tr('goal:cover.logWeighIn', { defaultValue: 'Log weigh-in' })}</button>
        <BSOLAct heat={heat} label={tr('goal:cover.editTargets', { defaultValue: 'Edit targets' })} onClick={onEditTargets} t={t} />
      </div>

      {/* The next milestone — one card; every milestone is behind it, its track under it from start to
          target. The milestones are weight points, so a goal read in words has none (and is no "No
          goal set yet"). */}
      {!wordsOnly && <div style={{ margin: `12px ${t.padX}px 0` }}>
        {!hasGoal ? (
          <>
            <BSTRedact INK={t.INK} size={9.5} label={tr('goal:terms.noGoal', { defaultValue: 'No goal set yet' })} />
            <BSOLAct heat={heat} label={tr('goal:door.setTerms', { defaultValue: 'Set the terms' })} onClick={onEditTargets} t={t} />
          </>
        ) : (
          <BSDashCard as="button" type="button" data-goal-next onClick={() => onOpenView('terms')} style={{ display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer', padding: '14px 16px', color: t.INK, font: 'inherit' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {nextTerm ? nextChip : <span aria-hidden style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, color: D.text.teal }}>✓</span>}
              <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK }}>{nextTerm ? nextTerm.t : tr('goal:terms.allMet', { defaultValue: 'Every term met' })}</span>
              {goArrow('lime')}
            </span>
            <span aria-hidden style={{ display: 'flex', gap: 5, marginTop: 12 }}>
              {milestones.map((m, i) => <span key={i} style={{ flex: 1, height: 6, borderRadius: 99, background: m.done ? D.mark.teal : m.next ? `linear-gradient(90deg, ${D.mark.lime}, ${D.track})` : D.track }} />)}
            </span>
            <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>
              <span>{dsp(start)} {unit}</span><span>{msLabel}</span><span>{dsp(target)} {unit}</span>
            </span>
          </BSDashCard>
        )}
      </div>}

      {/* THE STATIONS — each a card that opens its full-screen page, two to a row, the terms the width */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, margin: `12px ${t.padX}px 0` }}>
        {door('coral', STATION_LABEL.training, tCount(trainGoals.length), trainDoorSub, 'training')}
        {door('amber', STATION_LABEL.nutrition, tCount(nutrGoals.length), nutrDoorSub, 'nutrition')}
        {door('violet', STATION_LABEL.work, tCount(workGoals.length), workDoorSub, 'work')}
        {door('teal', STATION_LABEL.week, weekDoorBig, weekDoorSub, 'week')}
        {door('lime', tr('goal:door.termsWhy', { defaultValue: 'The terms & your why' }), null, termsDoorSub, 'terms', true)}
      </div>
    </>
  );
}

// Edit sheet for the Overall headline goal (title / target date / start-now-target / why).
function BSOverallEditSheet({ overall, onClose, onSave }) {
  const { useBS, BSLogo, BS_GOAL_LB_TO_KG, bsGoalDocKg, bsGoalUnitIsLb, bsGoalWeighIns, bsTHexA, BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))' } = window;
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // ⚠ THE THREE FIGURES ARE EDITED IN THE MEMBER'S UNIT AND STORED IN KILOGRAMS.
  // This sheet used to carry a FREE-TEXT unit box beside them, which is where
  // the mixed-unit documents came from: a member could type "lbs" here while
  // the weigh-in table was filling with kilograms, and nothing reconciled the
  // two. The unit now follows Settings and is shown, not typed.
  const [g, setG] = useState(() => {
    const out = (v) => { const kg = bsGoalDocKg(v, overall); const d = kg == null ? null : t.kgToDisplay(kg); return d == null ? '' : String(Math.round(d * 10) / 10); };
    return { ...overall, start: out(overall.start), now: out(overall.now), target: out(overall.target) };
  });
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginBottom: 4 };
  // Zero-box underline fields — the Open Ledger form grammar (.bs-uline focus →
  // accent underline via --bs-accent).
  const field = { width: '100%', boxSizing: 'border-box', padding: '6px 0 10px', fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 600, color: t.INK, outline: 'none', '--bs-uline-ink': bsTHexA(t.INK, 0.25) };
  // Keep the raw string while editing (so decimals like 76.8 type cleanly);
  // numeric fields are coerced to Number on save (`saveGoal`).
  const saveGoal = () => {
    const n = (v) => { if (v === '' || v == null) return ''; const x = Number(v); return Number.isFinite(x) ? Math.round(t.displayToKg(x) * 1000) / 1000 : ''; };
    // ⚠ THE EMBEDDED SERIES CONVERTS IN THE SAME STEP AS THE FIGURES. `...g`
    // carries `weighIns` forward untouched, and the legacy path stored a
    // member-entered POUND number in a property named `kg` — so stamping the
    // document 'kg' without converting them left a {kg: 185} point that
    // bsGoalNow then read as 185 kilograms. Same rule as logWeighIn.
    const wasLb = bsGoalUnitIsLb(overall);
    const series = bsGoalWeighIns(g).map((x) => (wasLb ? { ...x, kg: Number(x.kg) * BS_GOAL_LB_TO_KG } : x));
    onSave({ ...g, unit: 'kg', start: n(g.start), now: n(g.now), target: n(g.target), ...(series.length ? { weighIns: series } : {}) });
  };
  const num = (k) => <label style={{ display: 'block' }}><span style={lbl}>{k === 'start' ? tr('goal:overall.fieldStart', { defaultValue: 'Start' }) : k === 'now' ? tr('goal:overall.fieldNow', { defaultValue: 'Now' }) : tr('goal:sheet.fieldTarget', { defaultValue: 'Target' })}</span><input className="bs-uline bs-no-spin" type="number" inputMode="decimal" value={g[k] ?? ''} onChange={(e) => setG({ ...g, [k]: e.target.value })} style={{ ...field, fontVariantNumeric: 'tabular-nums' }} /></label>;
  const sheet = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: t.PAPER, display: 'flex', flexDirection: 'column', '--bs-accent': teal }}>
      {/* Title-page header — masthead + hero title (matches the other pages) */}
      <div style={{ flex: '0 0 auto', padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {BSLogo && <BSLogo size={16} color={t.INK} />}
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>Vol. 1 · No. 1</div>
          </div>
          <button onClick={onClose} aria-label={tr('goal:sheet.closeAria', { defaultValue: 'Close' })} style={{ background: 'transparent', border: 0, color: t.INK50, cursor: 'pointer', fontFamily: t.MONO, fontSize: 15, fontWeight: 800, padding: 4, lineHeight: 1 }}>✕</button>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: teal, fontWeight: 700 }}>{tr('goal:overall.eyebrow', { defaultValue: 'Edit · Goal' })}</div>
        <h1 style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 31, letterSpacing: '-0.03em', color: t.INK, margin: '4px 0 0', lineHeight: 1 }}>{tr('goal:overall.titlePre', { defaultValue: 'Your' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('goal:overall.titleAccent', { defaultValue: 'goal.' })}</span></h1>
        <div style={{ marginTop: 12, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />
      </div>
      {/* Scrollable form — scrollbar hidden */}
      <div className="bs-hide-scroll" style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `18px ${t.padX}px 18px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:sheet.fieldTitle', { defaultValue: 'Title' })}</span><input className="bs-uline" value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder={tr('goal:overall.titlePlaceholder', { defaultValue: 'e.g. Lean by August' })} style={field} /></label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
          <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:sheet.fieldTargetDate', { defaultValue: 'Target date' })}</span><input className="bs-uline" type="date" value={g.by || ''} onChange={(e) => setG({ ...g, by: e.target.value })} style={field} /></label>
          <div><span style={lbl}>{tr('goal:overall.fieldUnit', { defaultValue: 'Unit' })}</span><div style={{ ...field, display: 'flex', alignItems: 'center', minHeight: 34, fontVariantNumeric: 'tabular-nums' }}>{t.weightUnit}</div><div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('goal:overall.unitFromSettings', { defaultValue: 'Settings · Units' })}</div></div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>{num('start')}{num('now')}{num('target')}</div>
        <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:terms.whyHead', { defaultValue: 'Your why' })}</span><textarea className="bs-field bs-hide-scroll" value={g.why || ''} onChange={(e) => setG({ ...g, why: e.target.value })} rows={5} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: `1px solid ${bsTHexA(t.INK, 0.15)}`, background: 'transparent', borderRadius: 2, fontFamily: t.DISPLAY, color: t.INK, outline: 'none', resize: 'none', fontSize: 14.5, lineHeight: 1.5, minHeight: 120 }} /></label>
      </div>
      {/* Pinned footer — text-action Cancel + clipped solid CTA */}
      <div style={{ flex: '0 0 auto', padding: `13px ${t.padX}px calc(16px + env(safe-area-inset-bottom, 0px))`, borderTop: `1px solid ${t.HAIR || t.RULE}`, display: 'flex', gap: 12, alignItems: 'center', background: t.PAPER }}>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${bsTHexA(t.INK, 0.35)}`, paddingBottom: 2 }}>{tr('goal:sheet.cancel', { defaultValue: 'Cancel' })}</span></button>
        <button onClick={saveGoal} style={{ flex: 1, padding: '14px', borderRadius: 6, clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('goal:overall.save', { defaultValue: 'Save goal' })}</button>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// Small headline editor (title + subtitle) for the Training / Nutrition tabs.
function BSHeadlineEditSheet({ meta, accent, onClose, onSave }) {
  const { useBS, bsTHexA } = window;
  const t = useBS();
  const tr = useShapeTr();
  const [m, setM] = useState({ ...meta });
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginBottom: 4 };
  // Zero-box underline fields (accent focus via --bs-accent on the sheet root).
  const field = { width: '100%', boxSizing: 'border-box', padding: '6px 0 10px', fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 600, color: t.INK, outline: 'none', '--bs-uline-ink': bsTHexA(t.INK, 0.25) };
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)', '--bs-accent': accent }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: accent }}>{tr('goal:headline.eyebrow', { defaultValue: 'Edit · Headline' })}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{tr('goal:headline.titlePre', { defaultValue: 'Your' })} <span style={{ fontStyle: 'italic', color: accent }}>{tr('goal:headline.titleAccent', { defaultValue: 'headline.' })}</span></div>
        <div aria-hidden style={{ marginTop: 11, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${t.INK}, ${accent} 72%, transparent)` }} />
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 14 }}>
          <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:sheet.fieldTitle', { defaultValue: 'Title' })}</span><input className="bs-uline" value={m.title || ''} onChange={(e) => setM({ ...m, title: e.target.value })} style={field} /></label>
          <label style={{ display: 'block' }}><span style={lbl}>{tr('goal:headline.fieldSubtitle', { defaultValue: 'Subtitle' })}</span><input className="bs-uline" value={m.subtitle || ''} onChange={(e) => setM({ ...m, subtitle: e.target.value })} style={field} /></label>
        </div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${bsTHexA(t.INK, 0.35)}`, paddingBottom: 2 }}>{tr('goal:sheet.cancel', { defaultValue: 'Cancel' })}</span></button>
          <button onClick={() => onSave(m)} style={{ flex: 1, padding: '14px', borderRadius: 6, clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', border: 0, background: accent, color: '#fff', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('goal:headline.save', { defaultValue: 'Save' })}</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// Log a weigh-in — records today's weight, which updates now/down/%/to-go and the
// trend chart across the Overall + Nutrition tabs.
function BSWeighInSheet({ overall, onClose, onSave }) {
  const { useBS, bsGoalDocKg, bsGoalNow, bsTHexA } = window;
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const unit = t.weightUnit;
  // ⚠ THE FIELD IS THE MEMBER'S UNIT; `onSave` HANDS BACK KILOGRAMS. Seeding it
  // from bsGoalNow (canonical kg) while labelling it 'lb' put an 80.8 kg member
  // in front of "80.8" above the word "lb", and saving without editing filed
  // 80.8 lb — 36.7 kg — over today's canonical row. The seed converts out, the
  // save converts back, and the only place a pound exists is the input itself.
  const [kg, setKg] = useState(() => {
    const d = t.kgToDisplay(bsGoalNow(overall));
    return d ? String(Math.round(d * 10) / 10) : '';
  });
  const [bf, setBf] = useState('');
  const inputRef = React.useRef(null);
  React.useEffect(() => { const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(id); }, []);
  const typed = parseFloat(kg);
  const val = Number.isFinite(typed) ? t.displayToKg(typed) : NaN;   // kilograms — what onSave stores
  const bfVal = parseFloat(bf);
  const ok = Number.isFinite(val) && val > 0;
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)', '--bs-accent': teal }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: teal }}>{tr('goal:weighIn.eyebrow', { defaultValue: 'Log · Weigh-in' })}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{tr('goal:weighIn.titlePre', { defaultValue: "Today's" })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('goal:weighIn.titleAccent', { defaultValue: 'weight.' })}</span></div>
        <div aria-hidden style={{ marginTop: 11, height: 2, borderRadius: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />
        {/* Weight register — bare underline figure (Open Ledger form grammar);
            .bs-uline-row lights the shared underline on focus-within. */}
        <div className="bs-uline bs-uline-row" style={{ marginTop: 18, display: 'flex', alignItems: 'baseline', gap: 10, '--bs-uline-ink': bsTHexA(t.INK, 0.28) }}>
          <input ref={inputRef} value={kg} onChange={(e) => setKg(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && ok) onSave(val, Number.isFinite(bfVal) ? bfVal : null); }} inputMode="decimal" placeholder="0.0" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums', padding: '2px 0 9px' }} />
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{unit}</span>
        </div>
        {/* Body fat — quiet underline row */}
        <div className="bs-uline bs-uline-row" style={{ marginTop: 14, display: 'flex', alignItems: 'baseline', gap: 10, '--bs-uline-ink': bsTHexA(t.INK, 0.12) }}>
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800, flexShrink: 0 }}>{tr('goal:weighIn.bodyFat', { defaultValue: 'Body fat · optional' })}</span>
          <input value={bf} onChange={(e) => setBf(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="—" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', textAlign: 'right', fontVariantNumeric: 'tabular-nums', padding: '2px 0 8px' }} />
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', color: t.INK50 }}>%</span>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{tr('goal:weighIn.note', { defaultValue: 'Updates your trend + progress · start {start} · target {target}', start: `${Math.round(t.kgToDisplay(bsGoalDocKg(overall.start, overall) || 0) * 10) / 10} ${unit}`, target: `${Math.round(t.kgToDisplay(bsGoalDocKg(overall.target, overall) || 0) * 10) / 10} ${unit}` })}</div>
        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${bsTHexA(t.INK, 0.35)}`, paddingBottom: 2 }}>{tr('goal:sheet.cancel', { defaultValue: 'Cancel' })}</span></button>
          <button onClick={() => ok && onSave(val, Number.isFinite(bfVal) ? bfVal : null)} disabled={!ok} style={{ flex: 1, padding: '14px', borderRadius: 6, clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', border: 0, background: ok ? teal : t.RULE, color: ok ? (t.isLight ? '#fff' : '#04201d') : t.INK50, cursor: ok ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('goal:weighIn.save', { defaultValue: 'Save weigh-in' })}</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// A week's volume (pounds, from /api/client/train) in the reader's unit, in the
// Progress page's form: "9.1k lb" / "4.1k kg". No volume reads "—".
function bsGoalVolume(t, lb) {
  const n = Number(lb) || 0;
  if (!n) return '—';
  const m = t.uMeasure(n, 'lb');
  return `${(Number(m.value) / 1000).toFixed(1)}k ${m.unit || 'lb'}`;
}

// The week's sleep for Goals' "This week": the average of the nights dated today and the six days
// before, by the member's own days (the engine's week; nothing dated after today), to a tenth of an
// hour. 0 when no night is in it, which the row reads as "—". kpis.sleepAvg is the last 30 days
// (part 2), so it would have quoted the month under "This week".
export function bsGoalWeekSleep(series, todayIso) {
  const from = bsCiShift(todayIso, -6);
  const nights = (series && Array.isArray(series.sleep) ? series.sleep : [])
    .filter((p) => p && p.date >= from && p.date <= todayIso && Number(p.value) > 0).map((p) => Number(p.value));
  return nights.length ? Math.round((nights.reduce((a, b) => a + b, 0) / nights.length) * 10) / 10 : 0;
}

export function BSClientGoals({ onBack, onOpenProgress = () => {} }) {
  const { useBS, BSPage, BSFooter, BSMeCorner, BS_GOALS_DEFAULT, BS_GOAL_LB_TO_KG, BS_PRIMARY_GOALS, BS_PRIMARY_GOAL_MAX, _bsScrollTopOnMount, bsDateLocale, bsGoalDocKg, bsGoalUnitIsLb, bsGoalWeighIns, bsMyTierColor, bsPrimaryGoalFromText, bsPrimaryGoalIsCustom, bsPrimaryGoalLabel, bsPrimaryGoalToken, bsTHexA, useBSProgram, BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))' } = window;
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  _bsScrollTopOnMount();
  // Signed in → start EMPTY (no demo "Lean by August"); a real goal loads in. The
  // demo goal is the signed-out preview only.
  const _goalsSignedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const [data, setData] = useState(_goalsSignedIn ? BS_GOALS_EMPTY : BS_GOALS_DEFAULT);
  const heat = bsMyTierColor();
  const [listTab, setListTab] = useState('training'); // which station's goal list an add/edit targets
  const [editing, setEditing] = useState(null); // goal-list edit: 'new' | index | null
  const [editOverall, setEditOverall] = useState(false); // overall body-comp targets sheet
  const [editHeadline, setEditHeadline] = useState(null); // 'training' | 'nutrition' | null
  const [editPrimary, setEditPrimary] = useState(false); // in-place primary-goal chips
  const [customGoal, setCustomGoal] = useState(null); // the picker's own-words field: null = closed
  const [logWeigh, setLogWeigh] = useState(false);
  // Cover-page routing (owner pick 2026-08-28, Concept B): 'cover' plus one
  // full-screen page per station. The old five-item anchor index existed only
  // because the one-ledger page was long — the cover's doors replace it.
  const [goalView, setGoalView] = useState('cover');
  // ⚠ Resolve the scroller and the focus targets from OUR OWN subtree, never
  // `document.querySelector` — that returns the FIRST match in document order,
  // and this page has a second mount inside BSSettings (see showGoals) where
  // the shell renders `screens[tab]` BEFORE the settings overlay. From there
  // the first match belongs to the hidden tab page, so a document query would
  // scroll a screen nobody is looking at and leave the station opening at the
  // cover's old offset. `goalScrollRef` is an anchor span rendered as a sibling
  // of BSGoalsContract, so its parent holds both the cover's doors and the
  // station's heading.
  const goalScrollRef = React.useRef(null);
  const goalScroller = () => { try { return goalScrollRef.current?.closest?.('.bs-scroll') || null; } catch (e) { return null; } };
  const coverScrollRef = React.useRef(0);
  const prevGoalViewRef = React.useRef('cover');
  const openGoalView = (v) => {
    // ⚠ Capture the cover's offset HERE, not in the effect below: by the time a
    // layout effect runs the scroller already holds the station's content, and
    // the browser will have clamped scrollTop to the shorter page — so the
    // reading position would be lost before we could save it.
    if (goalView === 'cover') { const el = goalScroller(); if (el) coverScrollRef.current = el.scrollTop; }
    setGoalView(v);
  };
  // ⚠ A LAYOUT effect, not a line in the handler: a scroll or focus call issued
  // in the same tick as setGoalView runs against the OUTGOING view's height.
  React.useLayoutEffect(() => {
    const from = prevGoalViewRef.current;
    prevGoalViewRef.current = goalView;
    if (from === goalView) return;              // mount — never steal focus
    const el = goalScroller();
    const root = goalScrollRef.current && goalScrollRef.current.parentNode;
    try {
      if (goalView === 'cover') {
        // Back to the cover: return the member to where they were reading, and
        // move focus to the door they opened (the standard return-focus pattern
        // — the ← Back button unmounts with the station). preventScroll, or the
        // browser would scroll the door into view and undo the restore.
        if (el) el.scrollTop = coverScrollRef.current || 0;
        const door = root && root.querySelector(`[data-goal-door="${from}"]`);
        if (door && door.focus) door.focus({ preventScroll: true });
      } else {
        // Into a station: open at the top and announce the new page by moving
        // focus to its heading.
        if (el) el.scrollTop = 0;
        const head = root && root.querySelector('[data-goal-heading]');
        if (head && head.focus) head.focus({ preventScroll: true });
      }
    } catch (e) {}
  }, [goalView]);
  // ⚠ The open station is deliberately NOT announced to the nav stack, and the
  // BSClientEat/BSSettings pattern does NOT transfer here — this page cannot
  // announce for itself. Two reasons, both measured:
  //   (1) INERT from Home. This page is BSClientHome's `goalsPage` overlay, and
  //       the shell does not model Home's overlays: navLoc() returns a bare
  //       { tab:'home' } and navResolve() has branches for store/market/chat/
  //       eat/me but NONE for home. bsNavCompose would produce
  //       { tab:'home', sub:'training' } and the replay drops `sub` on the floor.
  //   (2) HARMFUL from Settings. BSClientGoals has a SECOND call site inside
  //       BSSettings (showGoals), which IS modelled and announces its own sub —
  //       and bsNavAnnounce writes ONE module-level slot, last write wins. An
  //       announce here therefore overwrites the parent's. Reproduced against
  //       the real register: with Settings deep-linked at 'edit-profile' and the
  //       member walked back to its root (navSub ''), opening this page's cover
  //       announced null, so bsNavCompose fell back to the shell's stale
  //       open-time settingsStart and composed sub:'edit-profile' — a value the
  //       member had already left. Opening a station composed sub:'training',
  //       which matches no Settings pane at all.
  // Making it real requires the PARENT to own the announcement (a one-slot
  // register cannot host a child rendered under two parents), i.e. teaching
  // navLoc/navResolve about Home's overlays and giving BSClientHome the
  // initialPage/onStartConsumed pair BSClientEat and BSClientMe already have.
  // That is its own change — registered on the War Room, not half-built here.
  const loggedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.().user);
  // Live "Your plans" + "This week targets" for the Contract (null →
  // BSGoalsContract keeps its demo content). Built from the assigned plan + the
  // coach adjustment + real ShapeProgress rollups.
  const [livePlans, setLivePlans] = useState(null);
  const [liveWeek, setLiveWeek] = useState(null);
  const [liveTrain, setLiveTrain] = useState(null);
  const bsGoalProgram = useBSProgram();
  React.useEffect(() => {
    if (!loggedIn || !window.ShapeProgress) return undefined;
    let on = true;
    Promise.all([
      window.ShapeProgress.train ? window.ShapeProgress.train().catch(() => null) : null,
      window.ShapeProgress.nutrition ? window.ShapeProgress.nutrition().catch(() => null) : null,
      window.ShapeProgress.progress ? window.ShapeProgress.progress().catch(() => null) : null,
      window.ShapePlan?.get ? window.ShapePlan.get().catch(() => null) : null,
    ]).then(([train, nutr, prog, plan]) => {
      if (!on) return;
      setLiveTrain(train || null);
      const det = bsGoalProgram.detail || {};
      // ⚠ NO LITERAL PHASE EITHER — same rule as sessTarget, one line over, and I
      // missed it there. These two locals feed NOTHING but the role-spined credit
      // rows below (grep: their only readers), so `|| 'Build'` / `|| 'Cut'` is not a
      // display default here — it is a training block attributed to a coach who
      // never set one, and the cover's Training door quotes that title as its
      // inventory subline. The app-wide kickers (Home/Train/Eat) keep their
      // defaults: those name the member's own program context under no byline.
      // ⚠ And this file had ALREADY drawn the line — BSTerrainProfile gates its
      // whole coached-by band on `prog.trainingPhase || prog.nutritionPhase` being
      // real (`hasRealProgram`), i.e. an unset phase is not evidence of a coach's
      // programming. Unknown → a neutral title, never an invented phase.
      const tphase = bsGoalProgram.trainingPhase || null;
      const nphase = bsGoalProgram.nutritionPhase || null;
      // Your plans — title from phase/assigned plan; sub from coach cadence/kcal.
      // ⚠ NO LITERAL FALLBACK. A target nobody set is not a target — and this
      // file already decided that: the honest-empty week set reads `0/—` ·
      // "set a plan". The old `|| 4` made the LIVE path fabricate exactly what
      // the EMPTY path refuses, and the cover's "This week" door now quotes the
      // first two figures as its inventory subline. Worse, it also fed the
      // TRAINER credit row — which the gate above just restricted to plans a
      // coach really authored — so a member with a real coach read "4×/wk" as
      // their coach's prescription. null means unknown; every reader renders —.
      const sessTarget = (det.training && det.training.sessions)
        || (plan && plan.training && Array.isArray(plan.training.workouts) && plan.training.workouts.length)
        || null;
      const kcal = (det.nutrition && det.nutrition.calories) || (nutr && nutr.today && nutr.today.calorieTarget) || null;
      const mealTitle = (plan && plan.meals && plan.meals.title) || null;
      // ⚠ A plan row is a CLAIM THAT A COACH AUTHORED SOMETHING — it renders as a
      // role-spined "TRAINER · …" / "NUTRITIONIST · …" credit, and (since the
      // cover-page rebuild) as the door's inventory subline. So it may only exist
      // on real evidence: an assigned plan from /api/client/plan, or a coach
      // adjustment in client_programs.detail. Every field below has a literal
      // fallback (`|| 'Build'`, `|| 'Cut'`, `|| 4`, `${nphase} plan`) — all four are
      // now gone, see the two ⚠ notes above — so an ungated push synthesised a
      // full plan + coach credit for a member with NO COACH AT ALL — and, because `plans` then never took its `signedIn ? []`
      // branch, it made both honest branches below (the "No training plan yet"
      // redaction and its "Find a coach →" action) permanently dead code.
      // ⚠ TRAINING NEEDS A COACH SIGNAL, NOT MERELY A PLAN — since the self-serve
      // wave a member can author their own week (client_workouts with a NULL
      // trainer_id), and `hasPlan` is true for those too, so gating on it would
      // credit a TRAINER for a plan the member wrote themselves. /api/client/plan
      // hands us both signals: `training.coach` (resolved from the first row with
      // a real trainer_id) and per-workout `selfAuthored`. Nutrition has no
      // self-serve authoring path — a client_meal_plans row always carries a
      // nutritionist — so a menu is evidence enough there.
      // ⚠ The gate outlives the fallbacks it was written for. Removing every
      // literal makes an unauthored row read honestly; it does not make the ROW
      // honest. A role-spined credit is itself the claim "a coach authored this",
      // so it still may only exist on real evidence.
      const coachTrain = !!(plan && plan.training && (plan.training.coach
        || (Array.isArray(plan.training.workouts) && plan.training.workouts.some((w) => w && w.selfAuthored === false))));
      const hasTrainPlan = !!(coachTrain || det.training);
      const hasNutrPlan = !!((plan && plan.meals && (plan.meals.hasPlan || plan.meals.title || plan.meals.coach)) || det.nutrition);
      // ⚠ `role` IS A TOKEN, NOT COPY — BSGoalsContract finds each plan with
      // `plans.find((p) => p.role === 'Training')`, so it must stay the literal
      // English discipline id. Only `t` and `sub` are read by a member. The
      // PHASE inside them (`tphase`/`nphase`) is coach-authored data passing
      // through, like a plan title — not our copy to translate.
      setLivePlans([
        hasTrainPlan ? { role: 'Training', t: tphase ? tr('goal:plan.trainingBlock', { defaultValue: '{phase} block', phase: tphase }) : tr('goal:plan.trainingTitle', { defaultValue: 'Training plan' }), sub: [sessTarget ? tr('goal:plan.cadence', { defaultValue: '{count}×/wk', count: sessTarget }) : null, (plan && plan.training && plan.training.hasPlan) ? tr('goal:plan.assigned', { defaultValue: 'assigned' }) : null].filter(Boolean).join(' · ') || tr('goal:plan.active', { defaultValue: 'active' }) } : null,
        hasNutrPlan ? { role: 'Nutrition', t: mealTitle || (nphase ? tr('goal:plan.nutritionPhase', { defaultValue: '{phase} plan', phase: nphase }) : tr('goal:plan.nutritionTitle', { defaultValue: 'Nutrition plan' })), sub: kcal ? tr('goal:plan.kcal', { defaultValue: '{kcal} kcal', kcal: Math.round(kcal).toLocaleString(bsDateLocale()) }) : (nphase ? tr('goal:plan.phaseTargets', { defaultValue: '{phase} targets', phase: nphase }) : tr('goal:plan.active', { defaultValue: 'active' })) } : null,
      ].filter(Boolean));
      // This week — real targets that move the goal.
      const thisWk = (train && train.stats && Number(train.stats.thisWeekCount)) || 0;
      const adher = (nutr && Number(nutr.adherentDays7)) || 0;
      const proteinTgt = (det.nutrition && det.nutrition.protein) || null; // same rule as sessTarget — no invented threshold
      const sleep = bsGoalWeekSleep(prog && prog.series, bsCiIso(new Date())); // this week's nights, by date
      const vol7 = (train && train.stats && Number(train.stats.volume7dLb)) || 0;
      setLiveWeek([
        // Unknown target → the same words the honest-empty set above uses, so the
        // live and empty paths can never disagree about what "no target" looks like.
        // `c` is the row's colour on This week, `pct` its share of the target: the sessions against the
        // plan's (none without one), the protein days of seven, the nights against the 7h its line
        // names; volume has no target, so no ring.
        { l: tr('goal:week.sessions', { defaultValue: 'Sessions' }), v: `${thisWk}/${sessTarget || '—'}`, sub: sessTarget ? (thisWk >= sessTarget ? tr('goal:week.done', { defaultValue: 'done' }) : tr('goal:week.toGo', { defaultValue: '{count} to go', count: Math.max(0, sessTarget - thisWk) })) : tr('goal:week.setPlan', { defaultValue: 'set a plan' }), c: 'coral', pct: sessTarget ? Math.min(1, thisWk / sessTarget) : null },
        { l: tr('goal:week.protein', { defaultValue: 'Protein days' }), v: `${adher}/7`, sub: proteinTgt ? tr('goal:week.proteinHit', { defaultValue: '≥{grams}g hit', grams: proteinTgt }) : tr('goal:week.proteinTracked', { defaultValue: 'days tracked' }), c: 'amber', pct: Math.min(1, adher / 7) },
        { l: tr('goal:week.sleep', { defaultValue: 'Sleep' }), v: sleep ? `${sleep}h` : '—', sub: tr('goal:week.sleepSub', { defaultValue: 'avg · goal 7h' }), c: 'violet', pct: sleep ? Math.min(1, sleep / 7) : null },
        { l: tr('goal:week.volume', { defaultValue: '7d volume' }), v: '—', volLb: vol7, sub: tr('goal:week.volumeSub', { defaultValue: 'load lifted' }), c: 'teal', pct: null },
      ]);
    }).catch(() => {});
    return () => { on = false; };
  }, [loggedIn, bsGoalProgram.detail, bsGoalProgram.trainingPhase, bsGoalProgram.nutritionPhase]);
  // The volume row is pounds from /api/client/train, converted HERE at render: the
  // effect above runs once per load, so converting there would hold the old unit
  // after a Settings flip until a remount.
  const liveWeekIn = liveWeek && liveWeek.map((w) => (w.volLb !== undefined ? { ...w, v: bsGoalVolume(t, w.volLb) } : w));
  const logWeighIn = (kg, bodyFat = null) => {
    const today = new Date().toISOString().slice(0, 10);
    // ⚠ THE DOCUMENT CANONICALISES ITSELF TO KILOGRAMS ON EVERY SAVE, START,
    // TARGET AND BACK SERIES TOGETHER. `kg` arrives in kilograms from the sheet,
    // so writing it into a document still stamped `unit: 'lb'` would have made
    // `bsGoalDocKg` convert it a SECOND time on the next read — an 81 kg
    // weigh-in reading back as 37. Converting the whole document in one step is
    // the only version where start, target and the series can never disagree
    // about which unit they are in; a member who prefers pounds still sees
    // pounds, because display is `t`'s job and no longer the document's.
    const wasLb = bsGoalUnitIsLb(overall);
    const prev = bsGoalWeighIns(overall).map(x => (wasLb ? { ...x, kg: Number(x.kg) * BS_GOAL_LB_TO_KG } : x));
    const wi = (prev.length && prev[prev.length - 1].d === today) ? [...prev.slice(0, -1), { d: today, kg }] : [...prev, { d: today, kg }];
    const nextOverall = {
      ...overall,
      unit: 'kg',
      start: bsGoalDocKg(overall.start, overall),
      target: bsGoalDocKg(overall.target, overall),
      weighIns: wi,
      now: kg,
    };
    if (loggedIn && window.ShapeWeighIns?.log) {
      // ⚠ THE CANONICAL DOCUMENT IS PERSISTED BEFORE THE AWARDS RPC RUNS, AND
      // THE ORDER IS THE WHOLE FIX. `award_my_goal_milestones` reads start and
      // target VERBATIM from user_goals and the latest weight VERBATIM from
      // client_weigh_ins — it normalises neither. Writing 185 lb as 83.9 kg
      // while a 200 -> 180 LB goal was still on the server made 83.9 look far
      // past a 180 target, so every milestone fired at once for a member who
      // had reached none of them. Persisting first means both operands are
      // kilograms by the time the RPC compares them.
      // ⚠ THE WEIGH-IN ALWAYS LANDS; THE AWARDS CHECK IS CONDITIONAL. The RPC
      // compares the persisted goal against the persisted weight and normalises
      // neither, so it may only run once the canonical (kilogram-stamped)
      // document is CONFIRMED written. An unconfirmed write — a failure, or a
      // missing backend — means the server may still hold a pound goal, and
      // comparing 83.9 kg against a 180 lb target awards every milestone at
      // once. Skipping the check costs a member a toast until their next
      // weigh-in, which is recoverable; awarding points they have not earned is
      // not. The member's own measurement is never withheld for this.
      persist({ ...data, overall: nextOverall })
        // ⚠ A REJECTED GOAL WRITE MUST NOT WITHHOLD THE WEIGH-IN. `saveUserGoals`
        // resolves `{ error }` rather than throwing on a PostgREST failure, but
        // it awaits a network call, so a rejection is not impossible — and
        // without this the chain would skip straight to `.catch` and the
        // member's own measurement would never be logged at all. Before the
        // ordering fix the log ran unconditionally; degrading to "not canonical"
        // keeps that true. Found by reviewing my own fix batch: the comment
        // below already CLAIMED this invariant and the code did not have it.
        .catch(() => null)
        .then((res) => {
          const canonical = !!(res && res.ok);
          return window.ShapeWeighIns.log({ weight: kg, unit: 'kg', bodyFat })
            .then(() => (canonical ? window.ShapeGoalAwards?.check?.() : null));
        })
        .then((awards) => (awards || []).forEach(a => window.__bsToast?.(tr('goal:award.toast', { defaultValue: '+{points} pts · {milestone}', points: a.points, milestone: a.milestone }), 'ok')))
        .catch(() => {});
    } else {
      persist({ ...data, overall: nextOverall });              // signed out / demo → user_goals JSONB
    }
    setLogWeigh(false);
  };
  // Catch-up milestone check on open (e.g. targets edited since the last
  // weigh-in) — idempotent server-side, so repeat calls never double-credit.
  React.useEffect(() => {
    if (!loggedIn) return undefined;
    let on = true;
    window.ShapeGoalAwards?.check?.().then((awards) => { if (on) (awards || []).forEach(a => window.__bsToast?.(tr('goal:award.toast', { defaultValue: '+{points} pts · {milestone}', points: a.points, milestone: a.milestone }), 'ok')); }).catch(() => {});
    return () => { on = false; };
  }, [loggedIn]);
  // Load the editable goal fields (user_goals) + the live weigh-in series. When
  // signed in, the dedicated client_weigh_ins table wins for weighIns/now.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      let doc = null, weigh = null, ident = null;
      try { doc = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_goals') : null; } catch (e) {}
      try { ident = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_identity') : null; } catch (e) {}
      if (loggedIn) { try { weigh = window.ShapeWeighIns?.list ? await window.ShapeWeighIns.list() : null; } catch (e) {} }
      if (!alive) return;
      setData(prev => {
        const m = { ...prev };
        // Primary goal — a TOKEN (client_goals.primaryGoal is canonical; fall back to
        // the profile's client_identity.goal, which carries the LABEL). Every value is
        // normalised through bsPrimaryGoalToken, so a row written before the split (an
        // English word) and the identity mirror both resolve to the same id.
        m.primaryGoal = bsPrimaryGoalToken((doc && doc.primaryGoal) || (ident && ident.goal) || prev.primaryGoal || '');
        if (doc && typeof doc === 'object') {
          m.share = doc.share !== false;
          m.overall = (doc.overall && typeof doc.overall === 'object') ? { ...prev.overall, ...doc.overall } : prev.overall;
          m.trainingMeta = (doc.trainingMeta && typeof doc.trainingMeta === 'object') ? { ...prev.trainingMeta, ...doc.trainingMeta } : prev.trainingMeta;
          m.nutritionMeta = (doc.nutritionMeta && typeof doc.nutritionMeta === 'object') ? { ...prev.nutritionMeta, ...doc.nutritionMeta } : prev.nutritionMeta;
          m.workMeta = (doc.workMeta && typeof doc.workMeta === 'object') ? { ...prev.workMeta, ...doc.workMeta } : prev.workMeta;
          m.training = Array.isArray(doc.training) ? doc.training : prev.training;
          m.nutrition = Array.isArray(doc.nutrition) ? doc.nutrition : prev.nutrition;
          m.work = Array.isArray(doc.work) ? doc.work : prev.work;
        }
        if (Array.isArray(weigh) && weigh.length) {
          // Same canonicalisation as the profile's signals loader: adopting a
          // kilogram series into a document still stamped `lb` is the
          // double-conversion this whole change exists to remove.
          m.overall = { ...m.overall, unit: 'kg', start: bsGoalDocKg(m.overall.start, m.overall), target: bsGoalDocKg(m.overall.target, m.overall), weighIns: weigh, now: Number(weigh[weigh.length - 1].kg) };
        }
        return m;
      });
    })();
    return () => { alive = false; };
  }, [loggedIn]);
  // ⚠ RETURNS THE WRITE, SO A CALLER CAN WAIT FOR IT. `saveUserGoals` is async
  // and resolves `{ ok }` or `{ error }` (it never throws), but this used to
  // discard the promise — so "persist before the RPC" established CALL order
  // and not COMPLETION order, and the awards check could still race a slower
  // user_goals upsert and read the legacy pound goal. Every existing caller
  // ignores the return value, so this is additive.
  const persist = (next) => {
    setData(next);
    try { return Promise.resolve(window.shapeDb?.saveUserGoals?.('client_goals', next)); } catch (e) { return Promise.resolve({ error: e }); }
  };
  const overall = data.overall || (loggedIn ? BS_GOALS_EMPTY.overall : BS_GOALS_DEFAULT.overall);
  const trainingMeta = data.trainingMeta || (loggedIn ? BS_GOALS_EMPTY.trainingMeta : BS_GOALS_DEFAULT.trainingMeta);
  const nutritionMeta = data.nutritionMeta || (loggedIn ? BS_GOALS_EMPTY.nutritionMeta : BS_GOALS_DEFAULT.nutritionMeta);
  const workMeta = data.workMeta || (loggedIn ? BS_GOALS_EMPTY.workMeta : BS_GOALS_DEFAULT.workMeta);
  const goals = Array.isArray(data[listTab]) ? data[listTab] : [];
  const saveGoal = (g) => { const arr = goals.slice(); if (editing === 'new') arr.push(g); else arr[editing] = g; persist({ ...data, [listTab]: arr }); setEditing(null); };
  const deleteGoal = () => { const arr = goals.filter((_, i) => i !== editing); persist({ ...data, [listTab]: arr }); setEditing(null); };
  // Header — the member's own primary goal words; italic last word takes tier heat.
  const hTitle = bsPrimaryGoalLabel(data.primaryGoal, tr) || overall.title || tr('home:goal.eyebrow', { defaultValue: 'Your goal' });
  const hWords = String(hTitle).trim().split(/\s+/);
  const hLast = hWords.length ? hWords.pop() : '';
  const hHead = hWords.join(' ');
  // A goal in the member's own words may end in its own stop ("Get fit!"); no second one.
  const hStop = /[.!?…]$/.test(hLast) ? '' : '.';
  const closePrimary = () => { setEditPrimary(false); setCustomGoal(null); };
  // Saves to client_goals.primaryGoal and mirrors the profile's client_identity.goal so the
  // edit-profile chips agree. `id` is a listed goal's token or the member's own words
  // (bsPrimaryGoalFromText).
  const setPrimaryGoal = async (id) => {
    if (!id) return;
    const label = bsPrimaryGoalLabel(id, tr);
    persist({ ...data, primaryGoal: id });
    try {
      const ident = (await window.shapeDb?.getUserGoals?.('client_identity')) || {};
      await window.shapeDb?.saveUserGoals?.('client_identity', { ...ident, goal: label });
      window.ShapeIdentity = { ...(window.ShapeIdentity || {}), goal: label };
      try { window.dispatchEvent(new Event('shape:identity')); } catch (e) {}
    } catch (e) {}
    closePrimary();
    window.__bsToast?.(tr('goal:primary.toast', { defaultValue: 'Goal set · {goal}', goal: label }), 'ok');
  };
  const ownGoal = bsPrimaryGoalIsCustom(data.primaryGoal) ? data.primaryGoal : '';
  const ownGoalNext = customGoal == null ? '' : bsPrimaryGoalFromText(customGoal);
  // B (2026-10-25): the cover's head in the dashboard look, as the page's cards are (BSGoalsContract).
  const D = bsDash(t);
  return (
    <BSPage>
      {/* Header — Back where every page keeps it, the eyebrow, then the goal and
          its Edit (owner, 2026-10-20: "easier to navigate"). The target and date
          read once, as a sentence, under it (BSGoalsContract). Cover only: a
          station page carries its own mast + ← Back + station title. */}
      {goalView === 'cover' && <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        {window.BSMastRow && <window.BSMastRow trailing={<BSMeCorner />} style={{ marginBottom: 4 }} />}
        <button data-bs-back="" onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, minHeight: 44, color: t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>← {tr('common:action.back', { defaultValue: 'Back' })}</button>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 700, lineHeight: 1.2, letterSpacing: '0.1em', textTransform: 'uppercase', color: D.text.teal }}>{tr('home:goal.eyebrow', { defaultValue: 'Your goal' })}</div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12, marginTop: 4 }}>
          {/* Upright, as every title in the dashboard look; the stop takes the member's tier. */}
          <h1 style={{ margin: 0, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.0, color: t.INK, overflowWrap: 'anywhere' }}>{hHead ? hHead + ' ' : ''}{hLast}<span style={{ color: heat }}>{hStop}</span></h1>
          <button onClick={() => setEditPrimary(true)} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}><span style={{ display: 'inline-flex', alignItems: 'center', height: 34, padding: '0 15px', borderRadius: 999, background: D.track, color: t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tr('goal:page.edit', { defaultValue: 'Edit' })}</span></button>
        </div>
      </div>}

      {/* Scroll-reset anchor — see goalScrollRef. Must render in EVERY view, so
          it sits above the contract rather than inside a cover-only block. */}
      <span ref={goalScrollRef} aria-hidden style={{ display: 'block', height: 0 }} />

      <BSGoalsContract
        overall={overall} data={data} heat={heat}
        view={goalView} onOpenView={openGoalView} onBack={() => openGoalView('cover')}
        onLog={() => setLogWeigh(true)}
        onEditTargets={() => setEditOverall(true)}
        onOpenProgress={onOpenProgress}
        onAddGoal={(tab) => { setListTab(tab); setEditing('new'); }}
        onEditGoal={(tab, i) => { setListTab(tab); setEditing(i); }}
        onEditHeadline={(tab) => setEditHeadline(tab)}
        plans={livePlans} weekTargets={liveWeekIn} train={liveTrain} />

      {/* Share with coaches — applies to the whole ledger, so it lives on the
          COVER (a station page is one station's detail, not the whole record). */}
      {goalView === 'cover' && <BSDashCard data-goal-share="" style={{ margin: `10px ${t.padX}px 0`, padding: '14px 16px', borderRadius: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.015em' }}>{tr('goal:page.shareTitle', { defaultValue: 'Share with your coaches' })}</div>
          <div style={{ marginTop: 3, fontFamily: t.BODY, fontSize: 12.5, color: t.INK70, lineHeight: 1.4 }}>{data.share ? tr('goal:page.shareOn', { defaultValue: 'Your coaches can see your goals' }) : tr('goal:page.shareOff', { defaultValue: 'Private — coaches can’t see your goals' })}</div>
        </div>
        <button onClick={() => persist({ ...data, share: !data.share })} aria-label={tr('goal:page.shareAria', { defaultValue: 'Toggle coach visibility' })} style={{ flexShrink: 0, width: 46, height: 28, borderRadius: 999, border: 0, cursor: 'pointer', padding: 3, background: data.share ? D.mark.teal : t.RULE, display: 'flex', justifyContent: data.share ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
          <span style={{ width: 22, height: 22, borderRadius: 999, background: '#fff', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.2)' }} />
        </button>
      </BSDashCard>}
      <div style={{ height: 28 }} />
      {/* Primary-goal editor — edits IN PLACE (no Settings takeover, so back
          always returns here). Saves to client_goals.primaryGoal and mirrors
          the profile's client_identity.goal so the edit-profile chips agree. */}
      {editPrimary && createPortal(
        <div style={{ position: 'absolute', inset: 0, zIndex: 60, background: t.PAPER, display: 'flex', flexDirection: 'column', '--bs-accent': teal }}>
          {/* Header — the question and a way out (owner, 2026-10-20: the chip wall
              read as a puzzle; a list with one check reads at a glance). Its hairline
              keeps the scrolled list from running up under the two-line hint. */}
          <div style={{ flex: '0 0 auto', padding: `${BS_MAST_TOP_CSS} ${t.padX}px 12px`, borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <h1 style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 28, letterSpacing: '-0.03em', color: t.INK, margin: '6px 0 0', lineHeight: 1.05 }}>{tr('goal:primary.titlePre', { defaultValue: 'Your primary' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('goal:primary.titleAccent', { defaultValue: 'goal.' })}</span></h1>
              <button onClick={closePrimary} aria-label={tr('goal:sheet.closeAria', { defaultValue: 'Close' })} style={{ flexShrink: 0, width: 44, height: 44, marginRight: -10, background: 'transparent', border: 0, color: t.INK70, cursor: 'pointer', fontFamily: t.MONO, fontSize: 17, fontWeight: 800, lineHeight: 1 }}>✕</button>
            </div>
            <div style={{ marginTop: 6, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.4, color: t.INK70 }}>{tr('goal:primary.hint', { defaultValue: 'Pick one or write your own · syncs with your profile' })}</div>
          </div>
          {/* The list — scrollbar hidden */}
          <div className="bs-hide-scroll" role="radiogroup" aria-label={tr('goal:primary.titlePre', { defaultValue: 'Your primary' }) + ' ' + tr('goal:primary.titleAccent', { defaultValue: 'goal.' })} style={{ flex: 1, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: `12px ${t.padX}px 18px` }}>
            {/* ⚠ THE ROW'S VALUE IS A TOKEN AND ITS FACE IS A LABEL — see
                BS_PRIMARY_GOALS. `g.id` is what gets written to
                client_goals.primaryGoal and what the selected-state test below
                compares; `bsPrimaryGoalLabel` is the only thing a member reads.
                The profile mirror (client_identity.goal) takes the LABEL, not
                the token, because get_public_profile serves that field to other
                members on both surfaces. */}
            {BS_PRIMARY_GOALS.map((g) => {
              const on = (data.primaryGoal || '') === g.id;
              const label = bsPrimaryGoalLabel(g.id, tr);
              return (
                <button key={g.id} role="radio" aria-checked={on} onClick={() => setPrimaryGoal(g.id)} style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 54, padding: '0 2px', background: 'transparent', border: 0, borderBottom: `1px solid ${t.HAIR || t.RULE}`, cursor: 'pointer', textAlign: 'left', color: on ? teal : t.INK, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: on ? 700 : 500, letterSpacing: '-0.01em' }}>
                  <span>{label}</span>
                  <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, boxSizing: 'border-box', borderRadius: 99, border: `1.5px solid ${on ? teal : t.RULE}`, background: on ? teal : 'transparent', color: t.isLight ? '#fff' : '#04201d', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                </button>
              );
            })}
            {/* A goal in the member's own words (owner, 2026-10-20: "make sure user can
                make custom goals"). Checked while the stored goal is none of the listed
                ones; tapping it opens the field, filled with their words. */}
            <button role="radio" aria-checked={!!ownGoal} aria-expanded={customGoal != null} onClick={() => setCustomGoal(customGoal != null ? null : ownGoal)} style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 54, padding: '8px 2px', background: 'transparent', border: 0, borderBottom: customGoal != null ? 0 : `1px solid ${t.HAIR || t.RULE}`, cursor: 'pointer', textAlign: 'left', color: ownGoal ? teal : t.INK, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: ownGoal ? 700 : 500, letterSpacing: '-0.01em' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block' }}>{tr('goal:primary.custom', { defaultValue: 'Your own goal' })}</span>
                {ownGoal && customGoal == null && <span data-own-goal style={{ display: 'block', marginTop: 2, fontFamily: t.BODY, fontSize: 14, fontWeight: 400, letterSpacing: 0, color: t.INK70, overflowWrap: 'anywhere' }}>{ownGoal}</span>}
              </span>
              <span aria-hidden style={{ flexShrink: 0, width: 22, height: 22, boxSizing: 'border-box', borderRadius: 99, border: `1.5px solid ${ownGoal ? teal : t.RULE}`, background: ownGoal ? teal : 'transparent', color: t.isLight ? '#fff' : '#04201d', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{ownGoal ? '✓' : ''}</span>
            </button>
            {customGoal != null && (
              <div style={{ padding: '2px 2px 16px', borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
                <input className="bs-uline" autoFocus enterKeyHint="done" value={customGoal} maxLength={BS_PRIMARY_GOAL_MAX}
                  aria-label={tr('goal:primary.customLabel', { defaultValue: 'Your goal, in your words' })}
                  placeholder={tr('goal:primary.customPlaceholder', { defaultValue: 'e.g. Run my first 10k' })}
                  onChange={(e) => setCustomGoal(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); setPrimaryGoal(ownGoalNext); } }}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '6px 0 10px', fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, color: t.INK, outline: 'none', '--bs-uline-ink': bsTHexA(t.INK, 0.25) }} />
                <button onClick={() => setPrimaryGoal(ownGoalNext)} disabled={!ownGoalNext} style={{ marginTop: 12, width: '100%', padding: '14px', borderRadius: 6, border: 0, background: ownGoalNext ? teal : t.RULE, color: ownGoalNext ? (t.isLight ? '#fff' : '#04201d') : t.INK50, cursor: ownGoalNext ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('goal:primary.customSave', { defaultValue: 'Set goal' })}</button>
              </div>
            )}
          </div>
          {/* Pinned footer */}
          <div style={{ flex: '0 0 auto', padding: `13px ${t.padX}px calc(16px + env(safe-area-inset-bottom, 0px))`, borderTop: `1px solid ${t.HAIR || t.RULE}`, background: t.PAPER }}>
            <button onClick={closePrimary} style={{ width: '100%', padding: '14px', borderRadius: 6, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tr('goal:primary.close', { defaultValue: 'Close' })}</button>
          </div>
        </div>,
        (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
      )}
      {logWeigh && <BSWeighInSheet overall={overall} onClose={() => setLogWeigh(false)} onSave={logWeighIn} />}
      {editOverall && <BSOverallEditSheet overall={overall} onClose={() => setEditOverall(false)} onSave={(g) => { persist({ ...data, overall: g }); setEditOverall(false); }} />}
      {editHeadline && <BSHeadlineEditSheet meta={editHeadline === 'training' ? trainingMeta : editHeadline === 'work' ? workMeta : nutritionMeta} accent={editHeadline === 'training' ? t.RUST : editHeadline === 'work' ? t.BLUE : '#d8a23a'} onClose={() => setEditHeadline(null)} onSave={(m) => { persist({ ...data, [editHeadline + 'Meta']: m }); setEditHeadline(null); }} />}
      {editing != null && <BSGoalEditSheet tab={listTab} goal={editing === 'new' ? null : (data[listTab] || [])[editing]} onClose={() => setEditing(null)} onSave={saveGoal} onDelete={deleteGoal} />}
      <BSFooter right="Goals" />
    </BSPage>
  );
}
