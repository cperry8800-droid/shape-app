import React from 'react';
import { BS_CLEAN_HEAD as BS_PRO_HEAD, BS_CLEAN_SANS as BS_PRO_SANS, useBSClean as useBSProClean, BSCleanType as BSProCleanType } from './bsCleanType.jsx';
// ─── TUNE THE PROGRAM / TUNE THE PLAN (a client's file → ADJUST) ────────────────────────────────
// Owner, 2026-11-04, of this page: "update design here as well", in the direction they set that day:
// "keep designs simple, nothing to futursitc … but modern, appealing, esay to navigate, not
// overwhelming, not analog. make them look really alive, like popping off the screen", pointing at the
// member profile's rounded tiles. Then, of the redesigns that followed: "reduce the coloring and and
// simplify UI more". So: cards in the paper's own colour with soft depth, no tint and no gradient; a
// section is its head alone (no capitals over it); colour only where it means something, which is the
// picked intensity and the one button that sends; gentle motion, all of it still under reduced motion.
//
// What it does is what it did in iosAppBroadsheetPros.jsx, where it lived until this redesign: the
// controls and their limits, the note, Apply & Send / Apply & Notify, the regeneration through the
// guardrail (SPEC-guardrails.md §9.4) and its held-for-review panel, the program record and the note
// to the client's thread. Trainer and nutritionist share the page.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. This file is a static import of the
// coach module, which evaluates it before the chrome has put BSPage and the rest on window; a
// top-level read would capture undefined (React error #130). It imports nothing from the coach module.

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
// The app's locale, for numbers and weekday names.
function adjLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}

// ── Colour and surface ─────────────────────────────────────────────────────────────────────────

// The role's colour: trainer rust, nutritionist gold (the lighter gold on a dark paper, as the coach
// pages draw it). It marks the picked intensity and the send button, nothing else.
export function bsAdjustAccent(t, role) {
  return role === 'nutritionist' ? (t && t.isLight ? '#a07a2e' : '#d8b25a') : '#c0533b';
}
const hexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const inkA = (t, a) => `rgba(${t.inkRGB || (t.isLight ? '15,14,12' : '245,240,230')},${a})`;
// White or a near-black on a fill, whichever reads better (WCAG contrast): white on rust, ink on gold.
function lum(hex) {
  const h = String(hex).replace('#', '');
  const ch = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
export function bsAdjustOn(hex) {
  const L = lum(hex);
  return (1.05 / (L + 0.05)) >= ((L + 0.05) / (lum('#14110d') + 0.05)) ? '#ffffff' : '#14110d';
}
// A card: the paper's own colour lifted off the page by a soft shadow (on a light paper) or by its
// raised stock and a hairline (on a dark one, where a shadow does not show).
export function bsAdjustCard(t) {
  const base = { borderRadius: 18, boxSizing: 'border-box' };
  return t.isLight
    ? { ...base, background: t.PAPER, border: `1px solid ${inkA(t, 0.08)}`, boxShadow: `0 1px 2px ${inkA(t, 0.05)}, 0 10px 26px -16px ${inkA(t, 0.32)}` }
    : { ...base, background: t.PAPER2, border: `1px solid ${inkA(t, 0.08)}`, boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04), 0 12px 28px -18px rgba(0,0,0,0.9)' };
}

// Motion, once per page: a section rises in, a number rolls the way it moved, a bar slides to its
// length, a pressed control gives a little. Under reduced motion nothing moves.
const adjCss = (accent) => [
  '@keyframes bsadj-rise{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}',
  '@keyframes bsadj-up{0%{opacity:.2;transform:translateY(.45em) scale(.92)}60%{opacity:1;transform:translateY(-.04em) scale(1.1)}100%{opacity:1;transform:none}}',
  '@keyframes bsadj-down{0%{opacity:.2;transform:translateY(-.45em) scale(.92)}60%{opacity:1;transform:translateY(.04em) scale(1.1)}100%{opacity:1;transform:none}}',
  '@keyframes bsadj-in{from{opacity:0;transform:translateX(6px)}to{opacity:1;transform:none}}',
  '[data-pro-adjust] [data-adj-press]{transition:transform 140ms ease,box-shadow 220ms ease,border-color 220ms ease,background-color 220ms ease,color 220ms ease}',
  '[data-pro-adjust] [data-adj-press]:not(:disabled):active{transform:scale(0.97)}',
  '[data-pro-adjust] [data-adj-bar]{transition:width 380ms cubic-bezier(.2,.7,.2,1)}',
  `[data-pro-adjust] button:focus-visible,[data-pro-adjust] textarea:focus-visible{outline:2px solid ${accent};outline-offset:2px}`,
  '@media (prefers-reduced-motion:reduce){[data-pro-adjust],[data-pro-adjust] *{animation:none!important;transition:none!important}[data-pro-adjust] [data-adj-press]:not(:disabled):active{transform:none}}',
].join('');
const rise = (i) => ({ animation: `bsadj-rise 420ms cubic-bezier(.2,.7,.2,1) ${60 + i * 60}ms both` });

// Line icons in currentColor (no coloured emoji in new work).
const ADJ_ICONS = {
  down: ['M3 7l6 6 4-4 8 8', 'M21 11v6h-6'],
  hold: ['M4 12h15', 'M15 8l4 4-4 4'],
  up: ['M3 17l6-6 4 4 8-8', 'M14 7h7v7'],
  minus: ['M6 12h12'],
  plus: ['M12 6v12', 'M6 12h12'],
  check: ['M20 6 9 17l-5-5'],
  swap: ['M7 7h12', 'm15 3 4 4-4 4', 'M17 17H5', 'm9 21-4-4 4-4'],
};
function AdjIcon({ name, size = 18, stroke = 2 }) {
  const paths = ADJ_ICONS[name] || ADJ_ICONS.check;
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

// ── The parts ──────────────────────────────────────────────────────────────────────────────────

// A section: its head in Geist, a quiet hint on the right where one helps, then what it holds.
function AdjSection({ t, title, hint, i, children }) {
  return (
    <section style={rise(i)}>
      <div data-pro-action-sec="" style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
        <h2 style={{ margin: 0, minWidth: 0, fontFamily: BS_PRO_HEAD, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, color: t.INK }}>{title}</h2>
        {hint ? <span style={{ flexShrink: 0, fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 500, color: t.INK50, textAlign: 'right' }}>{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

// A number the coach steps: its name and what it counts on the left, − number + on the right. The
// number rolls up or down as it changes (not on the first paint) and is announced.
function AdjStepper({ t, label, sub, value, text, unit, dot, min, max, step = 1, set, top }) {
  const prev = React.useRef(value);
  const dirRef = React.useRef(null);
  if (value !== prev.current) dirRef.current = value > prev.current ? 'up' : 'down';
  React.useEffect(() => { prev.current = value; }, [value]);
  const dir = dirRef.current;
  const btn = (name, aria, off, onClick) => (
    <button type="button" data-adj-press="" aria-label={aria} disabled={off} onClick={onClick}
      style={{ width: 44, height: 44, flex: 'none', display: 'grid', placeItems: 'center', borderRadius: 999, padding: 0, cursor: off ? 'default' : 'pointer', border: `1px solid ${off ? inkA(t, 0.08) : inkA(t, 0.16)}`, background: t.isLight ? t.PAPER : inkA(t, 0.05), color: off ? inkA(t, 0.28) : t.INK }}>
      <AdjIcon name={name} size={18} stroke={2.2} />
    </button>
  );
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', columnGap: 12, rowGap: 8, padding: '14px 16px', borderTop: top ? 0 : `1px solid ${inkA(t, 0.08)}` }}>
      <div style={{ flex: '1 1 64px', minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: BS_PRO_SANS, fontSize: 15, fontWeight: 600, color: t.INK, lineHeight: 1.25, overflowWrap: 'anywhere' }}>
          {dot ? <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: dot, flex: 'none' }} /> : null}
          {label}
        </div>
        {sub ? <div style={{ marginTop: 3, fontFamily: BS_PRO_SANS, fontSize: 12.5, color: t.INK50, lineHeight: 1.3 }}>{sub}</div> : null}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none', marginLeft: 'auto' }}>
        {btn('minus', `− ${label}`, value <= min, () => set(Math.max(min, value - step)))}
        <span aria-live="polite" style={{ minWidth: unit ? 72 : 52, textAlign: 'center', overflow: 'hidden', padding: '2px 0' }}>
          <span key={value} data-adj-num="" style={{ display: 'inline-block', fontFamily: BS_PRO_HEAD, fontSize: 26, fontWeight: 650, letterSpacing: '-0.03em', lineHeight: 1.1, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', animation: dir ? `bsadj-${dir} 320ms cubic-bezier(.2,.8,.2,1)` : 'none' }}>
            {text}{unit ? <span style={{ fontSize: 15, fontWeight: 600, color: t.INK50, marginLeft: 1 }}>{unit}</span> : null}
          </span>
        </span>
        {btn('plus', `+ ${label}`, value >= max, () => set(Math.min(max, value + step)))}
      </div>
    </div>
  );
}

// Choices of any number, as rounded pills: ＋ when off, ✓ when on (the same width either way, so the
// row never reflows under the thumb).
function AdjPills({ t, options, value, onPick }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      {options.map((o) => {
        const on = value.includes(o.k);
        return (
          <button key={o.k} type="button" data-adj-press="" aria-pressed={on} onClick={() => onPick(o.k)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minHeight: 44, maxWidth: '100%', padding: '0 16px 0 13px', borderRadius: 999, cursor: 'pointer', boxSizing: 'border-box', border: `1px solid ${on ? t.INK : inkA(t, 0.14)}`, boxShadow: on ? `inset 0 0 0 0.5px ${t.INK}` : 'none', background: t.isLight ? t.PAPER : (on ? inkA(t, 0.06) : 'transparent'), color: on ? t.INK : t.INK70, fontFamily: BS_PRO_SANS, fontSize: 14, fontWeight: on ? 650 : 500, textAlign: 'left' }}>
            <span style={{ color: on ? t.INK : t.INK50 }}><AdjIcon name={on ? 'check' : 'plus'} size={15} stroke={on ? 2.6 : 2} /></span>
            <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{o.l}</span>
          </button>
        );
      })}
    </div>
  );
}

// This week's intensity, as three cards: the picked one ringed in the role's colour.
function AdjIntensity({ t, accent, label, options, value, onPick }) {
  return (
    <div role="radiogroup" aria-label={label} style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 10 }}>
      {options.map((o) => {
        const on = value === o.k;
        return (
          <button key={o.k} type="button" role="radio" aria-checked={on} data-adj-press="" onClick={() => onPick(o.k)}
            style={{ ...bsAdjustCard(t), minWidth: 0, minHeight: 86, padding: '14px 6px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9, cursor: 'pointer', border: `1px solid ${on ? accent : inkA(t, 0.08)}`, boxShadow: on ? `inset 0 0 0 1px ${accent}, 0 12px 26px -16px ${hexA(accent, 0.55)}` : bsAdjustCard(t).boxShadow }}>
            <span style={{ color: on ? accent : t.INK50 }}><AdjIcon name={o.icon} size={24} stroke={2.2} /></span>
            <span style={{ maxWidth: '100%', fontFamily: BS_PRO_SANS, fontSize: 14, fontWeight: on ? 700 : 550, color: on ? t.INK : t.INK70, lineHeight: 1.2, textAlign: 'center', overflowWrap: 'anywhere', hyphens: 'auto' }}>{o.l}</span>
          </button>
        );
      })}
    </div>
  );
}

// What the picked intensity does to the week's volume: now against this week, as two bars, the change
// at the end of the second (the description's own −40%, the same, one more set), then the description.
const ADJ_VOLUME = { deload: 0.6, maintain: 1, progress: 1.12 };
function AdjVolume({ t, accent, nowLabel, weekLabel, value, delta, desc }) {
  const full = 1.15;
  const bar = (w, c) => (
    <div style={{ height: 8, borderRadius: 999, background: inkA(t, 0.06), overflow: 'hidden' }}>
      <div data-adj-bar="" style={{ width: `${Math.round((w / full) * 100)}%`, height: '100%', borderRadius: 999, background: c }} />
    </div>
  );
  return (
    <div data-adj-volume="" style={{ ...bsAdjustCard(t), marginTop: 10, padding: '16px 16px 15px' }}>
      <div aria-hidden="true" style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', alignItems: 'center', columnGap: 12, rowGap: 10 }}>
        <span style={{ fontFamily: BS_PRO_SANS, fontSize: 12.5, color: t.INK50 }}>{nowLabel}</span>
        {bar(1, inkA(t, 0.26))}
        <span />
        <span style={{ fontFamily: BS_PRO_SANS, fontSize: 12.5, color: t.INK70, fontWeight: 600 }}>{weekLabel}</span>
        {bar(ADJ_VOLUME[value] || 1, accent)}
        <span key={value} style={{ fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 700, color: t.INK, whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums', animation: 'bsadj-in 260ms ease both' }}>{delta}</span>
      </div>
      <p style={{ margin: '13px 0 0', fontFamily: BS_PRO_SANS, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>{desc}</p>
    </div>
  );
}

// ── The page ───────────────────────────────────────────────────────────────────────────────────

export default function BSProAdjustProgram({ client, role = 'trainer', clientUid, onBack }) {
  const { BSPage, BSFooter, BSBackRow, BSMastRow, BSFacetAvatar, BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))' } = window;
  const t = useBSProClean();
  const tr = useShapeTr();
  const isNutri = role === 'nutritionist';
  const accent = bsAdjustAccent(t, role);
  const onAccent = bsAdjustOn(accent);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const gold = '#d8b25a';
  const rust = t.RUST;
  const locale = adjLocale();
  const first = (client?.n || tr('coach:common.there', { defaultValue: 'there' })).split(' ')[0];
  // Trainer state
  const [intensity, setIntensity] = React.useState('progress');
  const [sessions, setSessions] = React.useState(4);
  const [weeks, setWeeks] = React.useState(6);
  const [focus, setFocus] = React.useState(['strength', 'hypertrophy']);
  const DAY_OPTS = ['Push day', 'Pull day', 'Legs day', 'Upper day', 'Lower day', 'Conditioning', 'Rest'];
  const [days, setDays] = React.useState(['Push day', 'Pull day', 'Legs day', 'Rest', 'Push day', 'Pull day', 'Rest']);
  // Nutritionist state
  const [calories, setCalories] = React.useState(2100);
  const [protein, setProtein] = React.useState(170);
  const [carbs, setCarbs] = React.useState(190);
  const [fat, setFat] = React.useState(62);
  const [meals, setMeals] = React.useState(4);
  const [refeed, setRefeed] = React.useState(true);
  const [restrictions, setRestrictions] = React.useState(['dairy-light']);
  // Shared
  const [noteText, setNoteText] = React.useState(null);
  const [status, setStatus] = React.useState('');
  // A guardrail rejection is an ANSWER, not an error (SPEC-guardrails.md §9.4):
  // held here with the boundary's own words so the coach can read the reason
  // and decide. Nothing else in the Apply runs while a regeneration is blocked.
  const [blocked, setBlocked] = React.useState(null); // {weekStartISO, copy, reason}
  const [reasonText, setReasonText] = React.useState('');
  // The week's days in the app's language, Monday first (2024-01-01 was a Monday).
  const DOW = React.useMemo(() => {
    const names = (loc) => { const f = new Intl.DateTimeFormat(loc, { weekday: 'short', timeZone: 'UTC' }); return [0, 1, 2, 3, 4, 5, 6].map((i) => f.format(new Date(Date.UTC(2024, 0, 1 + i)))); };
    try { return names(locale); } catch (e) { return names(undefined); }
  }, [locale]);

  // Seed the controls from the last-applied adjustment so reopening the page
  // shows what's currently in effect for this client (coach-writable store).
  // The note is left to auto-regenerate from the seeded values.
  React.useEffect(() => {
    let alive = true;
    if (!clientUid || !window.ShapeProgramApi?.get) return undefined;
    window.ShapeProgramApi.get(clientUid).then((rec) => {
      if (!alive || !rec) return;
      const d = isNutri ? rec.detail?.nutrition : rec.detail?.training;
      if (!d) return;
      if (isNutri) {
        if (d.calories != null) setCalories(d.calories);
        if (d.protein != null) setProtein(d.protein);
        if (d.carbs != null) setCarbs(d.carbs);
        if (d.fat != null) setFat(d.fat);
        if (d.meals != null) setMeals(d.meals);
        if (typeof d.refeed === 'boolean') setRefeed(d.refeed);
        if (Array.isArray(d.restrictions)) setRestrictions(d.restrictions);
      } else {
        if (d.intensity) setIntensity(d.intensity);
        if (d.sessions != null) setSessions(d.sessions);
        if (d.weeks != null) setWeeks(d.weeks);
        if (Array.isArray(d.focus)) setFocus(d.focus);
        if (Array.isArray(d.days)) setDays(d.days);
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);

  // Trainer derived
  const intensityDesc = { deload: tr('coach:adjust.descDeload', { defaultValue: 'Pull volume back ~40% and cap intensity. Recover and resensitize.' }), maintain: tr('coach:adjust.descMaintain', { defaultValue: 'Hold volume and loads — keep the engine ticking, no new stress.' }), progress: tr('coach:adjust.descProgress', { defaultValue: 'Add a set to main lifts and nudge top-set loads. Keep RPE ≤ 8.' }) }[intensity];
  const intensityOpts = [{ k: 'deload', icon: 'down', l: tr('coach:adjust.deload', { defaultValue: 'Deload' }) }, { k: 'maintain', icon: 'hold', l: tr('coach:adjust.maintain', { defaultValue: 'Maintain' }) }, { k: 'progress', icon: 'up', l: tr('coach:adjust.progress', { defaultValue: 'Progress' }) }];
  let deloadPct = '−40%';
  try { deloadPct = new Intl.NumberFormat(locale, { style: 'percent', signDisplay: 'always' }).format(-0.4); } catch (e) { /* the literal above */ }
  const intensityDelta = intensity === 'deload' ? deloadPct : intensity === 'maintain' ? tr('coach:adjust.deltaSame', { defaultValue: 'Same' }) : tr('coach:adjust.deltaSet', { defaultValue: '+1 set' });
  const focusOpts = [{ k: 'strength', l: tr('coach:adjust.focusStrength', { defaultValue: 'Strength' }) }, { k: 'hypertrophy', l: tr('coach:adjust.focusHypertrophy', { defaultValue: 'Hypertrophy' }) }, { k: 'conditioning', l: tr('coach:adjust.focusConditioning', { defaultValue: 'Conditioning' }) }, { k: 'mobility', l: tr('coach:adjust.focusMobility', { defaultValue: 'Mobility' }) }, { k: 'power', l: tr('coach:adjust.focusPower', { defaultValue: 'Power' }) }];
  const toggleFocus = (k) => setFocus(f => f.includes(k) ? f.filter(x => x !== k) : [...f, k]);
  const cycleDay = (i) => setDays(d => d.map((v, j) => j === i ? DAY_OPTS[(DAY_OPTS.indexOf(v) + 1) % DAY_OPTS.length] : v));
  const focusLabel = focus.map(k => focusOpts.find(o => o.k === k)?.l.toLowerCase()).filter(Boolean).join(' + ') || tr('coach:adjust.generalFitness', { defaultValue: 'general fitness' });
  const verb = intensity === 'progress' ? tr('coach:adjust.verbProgress', { defaultValue: 'progressing top sets' }) : intensity === 'deload' ? tr('coach:adjust.verbDeload', { defaultValue: 'deloading this week' }) : tr('coach:adjust.verbMaintain', { defaultValue: 'maintaining volume' });
  // Nutritionist derived
  const restrictOpts = [{ k: 'vegetarian', l: tr('coach:adjust.restrictVegetarian', { defaultValue: 'Vegetarian' }) }, { k: 'dairy-light', l: tr('coach:adjust.restrictDairyLight', { defaultValue: 'Dairy-light' }) }, { k: 'gluten-free', l: tr('coach:adjust.restrictGlutenFree', { defaultValue: 'Gluten-free' }) }, { k: 'egg-free', l: tr('coach:adjust.restrictEggFree', { defaultValue: 'Egg-free' }) }, { k: 'nut-free', l: tr('coach:adjust.restrictNutFree', { defaultValue: 'Nut-free' }) }, { k: 'halal', l: tr('coach:adjust.restrictHalal', { defaultValue: 'Halal' }) }];
  const toggleRestrict = (k) => setRestrictions(r => r.includes(k) ? r.filter(x => x !== k) : [...r, k]);
  const kcalFromMacros = protein * 4 + carbs * 4 + fat * 9;
  const kcalDiff = kcalFromMacros - calories;
  const pK = protein * 4, cK = carbs * 4, fK = fat * 9, mTot = (pK + cK + fK) || 1;

  const autoNote = isNutri
    ? tr('coach:adjust.noteNutri', { defaultValue: 'Updated your plan to {calories} kcal — {protein}g protein, {carbs}g carbs, {fat}g fat across {meals} meals.{refeed} New targets are live in your Eat tab.', calories, protein, carbs, fat, meals, refeed: refeed ? tr('coach:adjust.noteRefeed', { defaultValue: ' Keeping the weekend refeed to support training.' }) : '' })
    : tr('coach:adjust.noteTrainer', { defaultValue: 'Adjusting your block: {sessions}×/week, {verb}. Focus stays on {focus}. Check the updated split in your Train tab.', sessions, verb, focus: focusLabel });
  const body = noteText == null ? autoNote : noteText;
  const apply = async (notify, ack) => {
    const who = (client && (client.n || client.name)) || tr('coach:common.thisClient', { defaultValue: 'this client' });
    if (!(await window.bsAskConfirm({
      title: isNutri ? tr('coach:adjust.confirmTitleNutri', { defaultValue: 'Update nutrition targets?' }) : tr('coach:adjust.confirmTitleTrainer', { defaultValue: 'Update training program?' }),
      name: who,
      message: isNutri
        ? tr('coach:adjust.confirmMsgNutri', { defaultValue: "This overwrites this client's live nutrition targets (calories + macros) on their Eat tab. It takes effect immediately." })
        : tr('coach:adjust.confirmMsgTrainer', { defaultValue: "This overwrites this client's live training program on their Train tab. It takes effect immediately." }),
      confirmLabel: tr('coach:adjust.confirmApply', { defaultValue: 'Apply changes' }),
    }))) return;
    setStatus('saving');
    try {
      // 1a) TRAINING: regenerate the client's REAL upcoming rows first
      //     (spec #1707) — the deck, calendar, and website then read the same
      //     adjusted plan from the same rows. A regeneration failure aborts
      //     honestly (detail/note only land after the rows do); pre-migration
      //     it degrades to the detail+note behavior below.
      let regenGen = null;
      if (!isNutri && clientUid && window.ShapeAdjustRegen?.apply) {
        const regen = await window.ShapeAdjustRegen.apply({
          clientId: clientUid,
          adjustment: { intensity, sessions, weeks, days },
          acknowledgment: ack || null,
        });
        // ⚠ A GUARDRAIL REJECTION STOPS THE WHOLE APPLY — it must not fall
        // through to the detail/note writes below. Those are what the client
        // actually reads, so persisting them over a regeneration the boundary
        // refused would tell the client their program changed when not one of
        // their rows moved. Held, surfaced, and never absorbed into a success.
        if (regen?.rejected) {
          // ⚠ CARRY THE NOTIFY CHOICE THAT TRIGGERED THE HOLD. "Publish anyway"
          // replays this apply, and it used to pass `false` unconditionally — so
          // a coach who tapped Apply & Notify, got held, then overrode, changed
          // the client's Train tab and NOBODY TOLD THE CLIENT. The override is a
          // decision about the guardrail, not about notification.
          //
          // Spread over an object rather than `|| null` so a rejection with no
          // blocking week still RENDERS (the panel's default copy). Clearing the
          // status with nothing on screen is the silent refusal §9.4 forbids.
          setBlocked({ ...(regen.blocking || {}), notify: notify === true });
          setStatus('');
          return;
        }
        setBlocked(null);
        // Keep the generation whenever the regeneration path ran (changed OR
        // a no-op re-apply returning the CURRENT gen) so the display guard
        // never lapses on already-baked rows; only the degraded
        // (pre-migration) path leaves gen absent.
        if (regen?.gen != null && regen.gen > 0) regenGen = regen.gen;
        if (regen?.changed && regen.capped) window.__bsToast?.(tr('coach:adjust.trimmed', { defaultValue: 'Extension hit the plan bound — trimmed to fit.' }), 'warn');
      }
      // 1b) Persist the adjustment to the client's coach-writable program record.
      //    This is what actually "takes effect" — the client app reads it back
      //    and reflects it on their Train / Eat tabs. Only on Apply, never on tap.
      if (clientUid && window.ShapeProgramApi?.set) {
        const now = new Date().toISOString();
        const detail = isNutri
          ? { nutrition: { calories, protein, carbs, fat, meals, refeed, restrictions, note: body, updatedAt: now } }
          : { training: { intensity, sessions, weeks, focus, days, note: body, updatedAt: now, ...(regenGen != null ? { gen: regenGen } : {}) } };
        try { await window.ShapeProgramApi.set({ userId: clientUid, detail }); }
        catch (e) {
          // After a real row rewrite the gen stamp MUST land (it's the
          // display double-scale guard) — surface the failure honestly
          // instead of sending the note over a half-applied adjustment.
          if (regenGen != null) throw e;
        }
      }
      // 2) Deliver the note to the client's 1:1 thread.
      if (clientUid && window.ShapeMessages?.getOrCreateMemberConversation) {
        const conv = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: clientUid });
        const cid = conv?.data;
        if (cid && window.ShapeMessages?.sendMessage) await window.ShapeMessages.sendMessage({ conversationId: cid, body, metadata: { kind: isNutri ? 'plan_update' : 'program_update', notify: !!notify } });
      }
      setStatus('done');
      setTimeout(onBack, 950);
    } catch (e) {
      setStatus('error');
      // ⚠ NEVER SWALLOW THE BOUNDARY'S REASON. The rust line below says only
      // "Couldn't send — try again", which is true of a network blip and
      // actively misleading for the answer that matters: a 409 means the
      // client's plan MOVED under this adjustment and NOTHING WAS WRITTEN. The
      // coach needs to know their apply was refused rather than half-applied,
      // and that applying again re-reads the plan rather than repeating a
      // doomed call.
      //
      // Only a 4xx carries a message written for a human; a 5xx is our own
      // failure and its text is not the coach's business, so that falls back to
      // the same generic line the status already renders.
      const s = e && e.status;
      const msg = (s >= 400 && s < 500 && e && e.message)
        ? e.message
        : tr('coach:adjust.sendError', { defaultValue: "Couldn't send — try again." });
      window.__bsToast?.(msg, 'warn');
    }
  };
  // The one lit button sends the change and its note; the second way to apply it is the quiet one.
  const off = status === 'saving' || status === 'done';
  const ctaBase = { display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', minHeight: 52, padding: '0 16px', borderRadius: 16, fontFamily: BS_PRO_SANS, fontSize: 15.5, fontWeight: 650, letterSpacing: '-0.01em', cursor: off ? 'default' : 'pointer', opacity: status === 'saving' ? 0.6 : 1, boxSizing: 'border-box' };
  const sendLabel = status === 'saving' ? tr('coach:common.sending', { defaultValue: 'Sending…' }) : status === 'done' ? tr('coach:adjust.sent', { defaultValue: 'Sent ✓' }) : tr('coach:adjust.applySend', { defaultValue: 'Apply & Send →' });
  const card = bsAdjustCard(t);
  const prog = client ? (client.prog || (client.r || '').split('·')[0].trim() || tr('coach:common.program', { defaultValue: 'Program' })) : '';
  const title = `${tr('coach:adjust.titleA', { defaultValue: 'Tune the' })} ${String(isNutri ? tr('coach:adjust.titleBNutri', { defaultValue: 'plan.' }) : tr('coach:adjust.titleBTrainer', { defaultValue: 'program.' })).replace(/[.。]\s*$/, '')}`;

  const trainerBody = (
    <>
      <AdjSection t={t} i={1} title={tr('coach:adjust.intensity', { defaultValue: 'Intensity' })}>
        <AdjIntensity t={t} accent={accent} label={tr('coach:adjust.intensity', { defaultValue: 'Intensity' })} options={intensityOpts} value={intensity} onPick={setIntensity} />
        <AdjVolume t={t} accent={accent} value={intensity} desc={intensityDesc} delta={intensityDelta}
          nowLabel={tr('coach:adjust.volNow', { defaultValue: 'Now' })} weekLabel={tr('coach:adjust.volThisWeek', { defaultValue: 'This week' })} />
      </AdjSection>
      <AdjSection t={t} i={2} title={tr('coach:adjust.frequencyBlock', { defaultValue: 'Frequency & block' })}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <AdjStepper t={t} top label={tr('coach:adjust.sessionsLabel', { defaultValue: 'Sessions a week' })} sub={tr('coach:adjust.perMicrocycle', { defaultValue: 'Per microcycle' })} value={sessions} text={sessions} set={setSessions} min={1} max={7} />
          <AdjStepper t={t} label={tr('coach:adjust.weeksLabel', { defaultValue: 'Weeks left' })} sub={tr('coach:adjust.untilReview', { defaultValue: 'Until next review' })} value={weeks} text={weeks} set={setWeeks} min={1} max={16} />
        </div>
      </AdjSection>
      <AdjSection t={t} i={3} title={tr('coach:adjust.focus', { defaultValue: 'Focus' })} hint={tr('coach:adjust.pickAny', { defaultValue: 'Pick any' })}>
        <AdjPills t={t} options={focusOpts} value={focus} onPick={toggleFocus} />
      </AdjSection>
      <AdjSection t={t} i={4} title={tr('coach:adjust.trainingDays', { defaultValue: 'Training days' })} hint={tr('coach:adjust.tapDay', { defaultValue: 'Tap to change' })}>
        <div style={{ ...card, overflow: 'hidden' }}>
          {days.map((label, i) => {
            const rest = label === 'Rest';
            return (
              <button key={i} type="button" data-adj-press="" data-adj-day={i} onClick={() => cycleDay(i)}
                style={{ display: 'grid', gridTemplateColumns: '52px minmax(0, 1fr) 20px', alignItems: 'center', gap: 10, width: '100%', minHeight: 52, padding: '0 16px', border: 0, borderTop: i ? `1px solid ${inkA(t, 0.08)}` : 0, borderRadius: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box' }}>
                <span style={{ fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 600, color: t.INK50 }}>{DOW[i]}</span>
                <span key={label} style={{ minWidth: 0, fontFamily: BS_PRO_SANS, fontSize: 15, fontWeight: rest ? 500 : 600, color: rest ? t.INK50 : t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', animation: 'bsadj-in 240ms ease both' }}>{label}</span>
                <span style={{ color: t.INK50 }}><AdjIcon name="swap" size={17} stroke={1.9} /></span>
              </button>
            );
          })}
        </div>
      </AdjSection>
    </>
  );

  const nutriBody = (
    <>
      <AdjSection t={t} i={1} title={tr('coach:adjust.calorieTarget', { defaultValue: 'Calorie target' })}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <AdjStepper t={t} top label={tr('coach:adjust.caloriesLabel', { defaultValue: 'Daily calories' })} sub={tr('coach:adjust.kcalPerDay', { defaultValue: 'kcal / day' })} value={calories} text={calories.toLocaleString(locale)} set={setCalories} min={1000} max={5000} step={50} />
        </div>
      </AdjSection>
      <AdjSection t={t} i={2} title={tr('coach:adjust.dailySplit', { defaultValue: 'Daily split' })}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <AdjStepper t={t} top label={tr('coach:case.macroProtein', { defaultValue: 'Protein' })} value={protein} text={protein} unit="g" set={setProtein} min={0} max={400} step={5} dot={teal} />
          <AdjStepper t={t} label={tr('coach:case.macroCarbs', { defaultValue: 'Carbs' })} value={carbs} text={carbs} unit="g" set={setCarbs} min={0} max={600} step={5} dot={gold} />
          <AdjStepper t={t} label={tr('coach:case.macroFat', { defaultValue: 'Fat' })} value={fat} text={fat} unit="g" set={setFat} min={0} max={250} step={2} dot={rust} />
          <div data-adj-macros="" style={{ padding: '14px 16px 15px', borderTop: `1px solid ${inkA(t, 0.08)}` }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'baseline', columnGap: 10, rowGap: 2 }}>
              <span style={{ fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 600, color: t.INK70 }}>{tr('coach:adjust.fromMacrosLabel', { defaultValue: 'From macros' })}</span>
              <span style={{ fontFamily: BS_PRO_SANS, fontSize: 13, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{tr('coach:adjust.kcalUnit', { defaultValue: '{kcal} kcal', kcal: kcalFromMacros.toLocaleString(locale) })} · <span style={{ color: kcalDiff < 0 ? rust : t.INK, fontWeight: 600 }}>{kcalDiff >= 0 ? '+' : ''}{tr('coach:adjust.vsTarget', { defaultValue: '{diff} vs target', diff: kcalDiff })}</span></span>
            </div>
            <div aria-hidden="true" style={{ marginTop: 10, display: 'flex', height: 8, borderRadius: 999, overflow: 'hidden', gap: 2 }}>
              <div data-adj-bar="" style={{ width: `${(pK / mTot) * 100}%`, background: teal, borderRadius: 999 }} />
              <div data-adj-bar="" style={{ width: `${(cK / mTot) * 100}%`, background: gold, borderRadius: 999 }} />
              <div data-adj-bar="" style={{ width: `${(fK / mTot) * 100}%`, background: rust, borderRadius: 999 }} />
            </div>
          </div>
        </div>
      </AdjSection>
      <AdjSection t={t} i={3} title={tr('coach:adjust.mealsRefeeds', { defaultValue: 'Meals & refeeds' })}>
        <div style={{ ...card, overflow: 'hidden' }}>
          <AdjStepper t={t} top label={tr('coach:adjust.mealsLabel', { defaultValue: 'Meals a day' })} value={meals} text={meals} set={setMeals} min={1} max={8} />
          <button type="button" role="switch" aria-checked={refeed} data-adj-press="" onClick={() => setRefeed(r => !r)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, width: '100%', minHeight: 64, padding: '12px 16px', border: 0, borderTop: `1px solid ${inkA(t, 0.08)}`, borderRadius: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', boxSizing: 'border-box' }}>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: BS_PRO_SANS, fontSize: 15, fontWeight: 600, color: t.INK }}>{tr('coach:adjust.weekendRefeed', { defaultValue: 'Weekend refeed' })}</span>
              <span style={{ display: 'block', marginTop: 3, fontFamily: BS_PRO_SANS, fontSize: 12.5, color: t.INK50 }}>{tr('coach:adjust.refeedSub', { defaultValue: '+40g carbs on training days' })}</span>
            </span>
            <span aria-hidden="true" style={{ width: 46, height: 28, flex: 'none', borderRadius: 999, padding: 3, boxSizing: 'border-box', border: `1px solid ${refeed ? t.INK : inkA(t, 0.2)}`, background: refeed ? t.INK : 'transparent', display: 'flex', alignItems: 'center', justifyContent: refeed ? 'flex-end' : 'flex-start', transition: 'background-color 200ms ease' }}>
              <span style={{ width: 20, height: 20, borderRadius: 999, background: refeed ? t.PAPER : inkA(t, 0.45), display: 'block' }} />
            </span>
          </button>
        </div>
      </AdjSection>
      <AdjSection t={t} i={4} title={tr('coach:adjust.restrictions', { defaultValue: 'Restrictions' })} hint={tr('coach:adjust.pickAny', { defaultValue: 'Pick any' })}>
        <AdjPills t={t} options={restrictOpts} value={restrictions} onPick={toggleRestrict} />
      </AdjSection>
    </>
  );

  return (
    <BSPage>
      <div data-pro-adjust="" style={{ padding: `0 ${t.padX}px 32px` }}>
        <style>{adjCss(accent)}</style>
        <div style={{ paddingTop: BS_MAST_TOP_CSS }}>
          {/* No corners: the page holds un-applied input, and the settings gear would unmount it. */}
          {BSMastRow ? <BSMastRow trailing={null} /> : null}
          <BSBackRow onBack={onBack} />
        </div>
        <BSProCleanType t={t}>
          {/* The head: the page's name, then whose program it is, warm and plain. */}
          <div style={rise(0)}>
            <h1 style={{ margin: '12px 0 0', minWidth: 0, fontFamily: BS_PRO_HEAD, fontSize: 32, fontWeight: 650, letterSpacing: '-0.035em', lineHeight: 1.05, color: t.INK, overflowWrap: 'anywhere' }}>{title}</h1>
            {client ? (
              <div data-pro-client-mini="" style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 13 }}>
                <BSFacetAvatar size={50} c={client.c} initial={client.i} name={client.n} photo={client.avatarUrl || client.avatar || undefined} showRank={false} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: BS_PRO_HEAD, fontSize: 17, fontWeight: 650, letterSpacing: '-0.015em', color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{client.n}</div>
                  <div style={{ marginTop: 2, fontFamily: BS_PRO_SANS, fontSize: 13.5, color: t.INK50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prog}{client.week != null && client.weeks != null ? tr('coach:common.weekOf', { defaultValue: ' · Week {week} of {weeks}', week: client.week, weeks: client.weeks }) : ''}</div>
                </div>
              </div>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 34, marginTop: 32 }}>
            {isNutri ? nutriBody : trainerBody}
            <AdjSection t={t} i={5} title={tr('coach:adjust.noteTo', { defaultValue: 'Note to {name}', name: first })}>
              <textarea value={body} onChange={(e) => setNoteText(e.target.value)} rows={isNutri ? 5 : 4}
                style={{ ...card, display: 'block', width: '100%', padding: '14px 16px', color: t.INK, fontFamily: BS_PRO_SANS, fontSize: 16, lineHeight: 1.5, resize: 'vertical', outline: 'none' }} />
              <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <button type="button" data-adj-press="" data-adj-send="" onClick={() => apply(false)} disabled={off}
                  style={{ ...ctaBase, border: 0, background: accent, color: onAccent, boxShadow: off ? 'none' : `0 12px 26px -12px ${hexA(accent, 0.7)}, inset 0 1px 0 rgba(255,255,255,0.18)` }}>{sendLabel}</button>
                <button type="button" data-adj-press="" onClick={() => apply(true)} disabled={off}
                  style={{ ...ctaBase, border: `1px solid ${inkA(t, 0.16)}`, background: 'transparent', color: t.INK }}>{tr('coach:adjust.applyNotify', { defaultValue: 'Apply & Notify →' })}</button>
              </div>
              {/* The guardrail's own words, a REQUIRED reason, and an explicit
                  override — the same acknowledgment path §9.4 gives a
                  hand-authored week, because a regenerated one is judged on
                  exactly the same terms.

                  ⚠ The `coach:assign.guard*` keys are reused DELIBERATELY. This is
                  one concept with one wording, and forking it into a second key
                  set would let the two gated surfaces drift into describing the
                  same refusal differently — in 13 locales. */}
              {blocked && (
                <div data-adj-held="" style={{ ...card, marginTop: 16, padding: '16px 16px 10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 650, color: t.AMBER }}>
                    <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 999, background: t.AMBER, flex: 'none' }} />
                    {(blocked.copy && blocked.copy.chip) || tr('coach:assign.guardChip', { defaultValue: 'Held for review' })}
                  </div>
                  <div style={{ marginTop: 8, fontFamily: BS_PRO_HEAD, fontSize: 17, fontWeight: 650, color: t.INK, letterSpacing: '-0.015em', lineHeight: 1.3 }}>{(blocked.copy && blocked.copy.line) || tr('coach:assign.guardLine', { defaultValue: 'This week was held for review.' })}</div>
                  {blocked.copy && blocked.copy.detail && (
                    <div style={{ marginTop: 6, fontFamily: BS_PRO_SANS, fontSize: 13.5, lineHeight: 1.5, color: t.INK70 }}>{blocked.copy.detail}</div>
                  )}
                  {blocked.weekStartISO && (
                    <div style={{ marginTop: 8, fontFamily: BS_PRO_SANS, fontSize: 12.5, color: t.INK50 }}>{tr('coach:assign.guardWeek', { defaultValue: 'Week of {date}', date: blocked.weekStartISO })}</div>
                  )}
                  <textarea
                    value={reasonText}
                    onChange={(e) => setReasonText(e.target.value)}
                    rows={3}
                    placeholder={tr('coach:assign.guardReasonPlaceholder', { defaultValue: 'Why is this week right for them?' })}
                    style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, borderRadius: 12, border: `1px solid ${inkA(t, 0.14)}`, background: t.isLight ? t.PAPER : inkA(t, 0.04), color: t.INK, padding: '10px 12px', fontFamily: BS_PRO_SANS, fontSize: 16, lineHeight: 1.45, resize: 'vertical', outline: 'none' }}
                  />
                  <div style={{ marginTop: 6, fontFamily: BS_PRO_SANS, fontSize: 12.5, color: t.INK50 }}>{tr('coach:assign.guardReasonHint', { defaultValue: 'Recorded with the week · required to publish' })}</div>
                  <button
                    type="button"
                    data-adj-press=""
                    onClick={() => apply(blocked.notify === true, { reasonCode: 'coach_override', reasonText: reasonText.trim() })}
                    disabled={!reasonText.trim() || status === 'saving'}
                    style={{ ...ctaBase, marginTop: 12, minHeight: 48, border: `1px solid ${t.AMBER}`, background: 'transparent', color: t.AMBER, fontSize: 14.5, cursor: (!reasonText.trim() || status === 'saving') ? 'default' : 'pointer', opacity: (!reasonText.trim() || status === 'saving') ? 0.5 : 1 }}
                  >{tr('coach:assign.guardPublishAnyway', { defaultValue: 'Publish anyway' })}</button>
                  <button type="button" onClick={() => { setBlocked(null); setReasonText(''); }} style={{ display: 'block', width: '100%', minHeight: 44, marginTop: 4, border: 0, background: 'transparent', color: t.INK50, fontFamily: BS_PRO_SANS, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{tr('coach:common.cancel', { defaultValue: 'Cancel' })}</button>
                </div>
              )}
              {status === 'error' && <div role="alert" style={{ marginTop: 12, fontFamily: BS_PRO_SANS, fontSize: 13, fontWeight: 600, color: t.RUST, textAlign: 'center' }}>{tr('coach:adjust.sendError', { defaultValue: "Couldn't send — try again." })}</div>}
              <div style={{ marginTop: 12, fontFamily: BS_PRO_SANS, fontSize: 12.5, lineHeight: 1.45, color: t.INK50, textAlign: 'center' }}>
                {clientUid
                  ? (isNutri ? tr('coach:adjust.onApplyNutri', { defaultValue: "On apply · updates {name}'s Eat tab + sends this note", name: first }) : tr('coach:adjust.onApplyTrainer', { defaultValue: "On apply · updates {name}'s Train tab + sends this note", name: first }))
                  : tr('coach:adjust.demoApplies', { defaultValue: 'Demo client · applies once linked to a live member' })}
              </div>
            </AdjSection>
          </div>
        </BSProCleanType>
      </div>
      <BSFooter left={isNutri ? tr('coach:adjust.footerNutri', { defaultValue: 'Adjust plan' }) : tr('coach:adjust.footerTrainer', { defaultValue: 'Adjust program' })} right={client?.n} />
    </BSPage>
  );
}
