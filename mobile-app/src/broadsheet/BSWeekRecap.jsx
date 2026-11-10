import React from 'react';
import { bsShareCardModel, bsShareCardImage } from '../../../public/newdesign/shareCard.mjs';
import { partsInZone, viewerZone } from '../services/shapeZone.mjs';
// ─── YOUR WEEK (the free, shareable weekly recap; owner, 2026-11-10) ───────────────────────────
// Last Monday–Sunday in the member's own time zone, as counted figures, for any signed-in account
// (GET /api/client/weekly-recap, ShapeWeeklyRecap.get): workouts, active minutes, meal days (days a meal
// was logged), days active, points and the streak, and a Share that builds the app's share image (shareCard.mjs, shared
// with the website and not changed here). The AI weekly readout stays paid with its locked teaser;
// this is the plain count, so it is free.
//
// ⚠ A FIGURE IS SHOWN ONLY WHEN IT IS SOMETHING. A null (not measured) or a 0 is left out, never
// drawn as a zero; a week with nothing at all says so in one line, and has no Share. A read that
// failed draws nothing.
//
// ⚠ THE RECAP CARRIES ITS SUBJECT (the weekly readout's rule): a session that became someone else
// renders nothing until its own read lands.
//
// Two looks: `card`, a plate on Progress; `row`, one line on Home on Mondays (Home adds no plates).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, BSPlate, ShapeWeeklyRecap, ShapeAuth, ShapeScore).

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

/** The figures worth showing, in the card's order: [key, label, value]; a null or 0 is left out. */
export function bsWeekRecapFigures(tr, d) {
  if (!d) return [];
  const rows = [
    ['workouts', tr('common:recap.workouts', { defaultValue: 'Workouts' }), d.workouts],
    ['activeMinutes', tr('common:recap.activeMinutes', { defaultValue: 'Active minutes' }), d.activeMinutes],
    ['mealDays', tr('common:recap.mealDays', { defaultValue: 'Meal days' }), d.mealDays],
    ['daysActive', tr('common:recap.daysActive', { defaultValue: 'Days active' }), d.daysActive],
    ['points', tr('common:recap.points', { defaultValue: 'Points' }), d.points],
    ['streak', tr('common:recap.streak', { defaultValue: 'Day streak' }), d.streak],
  ];
  return rows.filter(([, , v]) => typeof v === 'number' && Number.isFinite(v) && v > 0);
}

// "Nov 3" from "2026-11-03", read as the calendar day it names (never through UTC).
function bsRecapDay(ymd, locale) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(ymd || ''));
  if (!m) return '';
  try { return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString(locale || undefined, { month: 'short', day: 'numeric' }); } catch (e) { return ymd; }
}
export function bsWeekRecapDateLine(d, locale) {
  if (!d) return '';
  const a = bsRecapDay(d.weekStart, locale);
  const b = bsRecapDay(d.weekEnd, locale);
  return a && b ? `${a} – ${b}` : '';
}

/** The share image's model, from the same figures the card drew (so the two never disagree). */
export function bsWeekRecapShareModel(tr, d, { who = '', tierLine = '', locale } = {}) {
  const figs = bsWeekRecapFigures(tr, d);
  if (!figs.length) return null;
  const fmt = (v) => Number(v).toLocaleString(locale || undefined);
  const hero = figs.find(([k]) => k === 'workouts') || figs[0];
  return bsShareCardModel({
    who,
    tierLine,
    title: tr('common:recap.title', { defaultValue: 'Your week' }),
    heroStat: [hero[1], fmt(hero[2])],
    stats: figs.filter((f) => f !== hero).slice(0, 3).map(([, label, v]) => [label, fmt(v)]),
    dateLine: bsWeekRecapDateLine(d, locale),
  });
}

/** Monday in the account's own zone (shapeZone.mjs), the day Home shows last week's recap. */
export function bsIsRecapDay(now = Date.now()) {
  try { const p = partsInZone(now, viewerZone()); return !!p && p.wd === 1; } catch (e) { return false; }
}

export function BSWeekRecap({ who = '', variant = 'card', style }) {
  const useBS = window.useBS;
  const t = useBS ? useBS() : null;
  const tr = useShapeTr();
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const [held, setHeld] = React.useState(null); // { uid, data }
  const [share, setShare] = React.useState('idle'); // idle | busy | failed
  React.useEffect(() => {
    if (!uid) { setHeld(null); return undefined; }
    let alive = true;
    Promise.resolve(window.ShapeWeeklyRecap?.get?.({ week: 'last' })).then((d) => {
      if (alive) setHeld(d ? { uid, data: d } : null);
    }, () => { if (alive) setHeld(null); });
    return () => { alive = false; };
  }, [uid]);
  const data = held && held.uid === uid ? held.data : null;
  if (!t || !data) return null;
  const locale = window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined;
  const figs = bsWeekRecapFigures(tr, data);
  if (!figs.length && variant === 'row') return null;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const fmt = (v) => Number(v).toLocaleString(locale);
  const dateLine = bsWeekRecapDateLine(data, locale);
  const doShare = async () => {
    if (share === 'busy') return;
    const model = bsWeekRecapShareModel(tr, data, { who, tierLine: (window.ShapeScore && window.ShapeScore.tier) || '', locale });
    if (!model) return;
    setShare('busy');
    let r = null;
    try { r = await bsShareCardImage(model); } catch (e) { r = null; }
    setShare(r && r.ok ? 'idle' : 'failed');
  };
  const shareBtn = figs.length ? (
    <button type="button" data-bs-week-recap-share="" onClick={doShare} disabled={share === 'busy'}
      style={{ flex: 'none', minHeight: 44, padding: '0 14px', border: 0, borderRadius: 4, background: t.INK, color: t.PAPER, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: share === 'busy' ? 'wait' : 'pointer', opacity: share === 'busy' ? 0.7 : 1, whiteSpace: 'nowrap' }}>
      {share === 'busy' ? tr('common:recap.sharing', { defaultValue: 'Making the image…' }) : tr('common:recap.share', { defaultValue: 'Share →' })}
    </button>
  ) : null;
  const failed = share === 'failed'
    ? <div role="alert" style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.AMBER || '#c8881a' }}>{tr('common:recap.shareFailed', { defaultValue: 'Couldn’t make the image. Try again.' })}</div>
    : null;

  if (variant === 'row') {
    const line = figs.slice(0, 2).map(([, label, v]) => `${fmt(v)} ${label}`).join(' · ');
    return (
      <div data-bs-week-recap="row" style={{ margin: `8px ${t.padX}px 4px`, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 12px', borderLeft: `3px solid ${teal}`, borderBottom: `1px solid ${t.HAIR || t.RULE}`, ...style }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal }}>{tr('common:recap.title', { defaultValue: 'Your week' })}{dateLine ? ` · ${dateLine}` : ''}</div>
          <div style={{ marginTop: 2, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.4, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{line}</div>
          {failed}
        </div>
        {shareBtn}
      </div>
    );
  }

  const Plate = window.BSPlate;
  const inner = (
    <>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>{tr('common:recap.lastWeek', { defaultValue: 'Last week' })}{dateLine ? ` · ${dateLine}` : ''}</div>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK }}>{tr('common:recap.title', { defaultValue: 'Your week' })}<span aria-hidden="true" style={{ color: teal }}>.</span></div>
      <div aria-hidden="true" style={{ margin: '8px 0 10px', height: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 58%, transparent)` }} />
      {figs.length ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '10px 12px' }}>
          {figs.map(([k, label, v]) => (
            <div key={k} data-bs-week-recap-figure={k} style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{fmt(v)}</div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70, overflow: 'hidden', textOverflow: 'ellipsis' }}>{label}</div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{tr('common:recap.empty', { defaultValue: 'Nothing logged last week. A fresh week starts today.' })}</div>
      )}
      {shareBtn ? <div style={{ marginTop: 14, display: 'flex' }}>{shareBtn}</div> : null}
      {failed}
    </>
  );
  return (
    <div data-bs-week-recap="card" style={{ marginBottom: 12, ...style }}>
      {Plate ? <Plate c={teal} pad="13px 16px 14px 18px" bracket>{inner}</Plate> : inner}
    </div>
  );
}
