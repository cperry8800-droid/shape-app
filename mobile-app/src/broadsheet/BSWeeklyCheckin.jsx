import React from 'react';
import { bsRaised } from './BSProInstrument.jsx';
import { BSCleanType, useBSClean } from './bsCleanType.jsx';
import { bsPlanCheckinParts } from '../services/planRead.mjs';

// ─── THE WEEKLY CHECK-IN ──────────────────────────────────────────────────────────────────────────
// The coach's form (the Morning check-in review, 2026-10-19: "Weekly check-in · for your coach"): the
// week rated 1-10, the body, progress photos and the week in words, one row a week (client_checkins),
// saving again updating it. Home opens it from the line on Team, with the coaches it is for; Settings
// and Your first 30 days open it too.
//
// ⚠ REDRAWN IN HOME'S LOOK (owner, 2026-11-11: "update the look of that weekly check-in you moved to
// coaches to new updated design"): the clean type, each part a raised round plate in the paper's own
// colour, a rating a row of numbered pills, a field a rounded well that glows teal while typed in, and
// the send a round teal button. It moved out of the client module into this one when it was redrawn, with
// its words, which were English only, in all 13 catalogs (home:weekly.*).
//
// ⚠ A FAILED SEND SAYS SO ON THE PAGE, with the answers kept. Toasts are a no-op app-wide (BSToastHost),
// so the page used to sit as it was with nothing said.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx): BSPage and
// BSFooter are the chrome's, BSDetailHeader the client module's, published when its body has run.

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

// [key, English label, colour]. The label is the catalog's default (home:weekly.r.<key>).
export const BS_CHECKIN_RATINGS = [
  ['trainingAdherence', 'Training adherence', '#c0533b'],
  ['nutritionAdherence', 'Nutrition adherence', '#d8b25a'],
  ['sleep', 'Sleep quality', '#8a5cf6'],
  ['energy', 'Energy', '#34d6c5'],
  ['stress', 'Stress · 10 = calm', '#7ed4ff'],
  ['hunger', 'Hunger control', '#e8b14a'],
];
// ⚠ THE CHECK-IN ASKED HOW WELL THEY FOLLOWED A PLAN THEY DID NOT HAVE (client-onboarding review, M16).
// An adherence question is asked only for a discipline with a plan; until the plan read answers (or if
// it fails) every question is asked, as before. The website's check-in applies the same rule.
export function bsCheckinRatings(plans) {
  if (!plans) return BS_CHECKIN_RATINGS;
  return BS_CHECKIN_RATINGS.filter(([k]) => (k === 'trainingAdherence' ? plans.training : k === 'nutritionAdherence' ? plans.nutrition : true));
}
// What is saved is what was asked (Codex on #2378), as on the website: a hidden adherence score is not
// written back. A rating the form does not know is kept as it came.
export function bsCheckinRatingsToSave(ratings, plans) {
  const asked = new Set(bsCheckinRatings(plans).map(([k]) => k));
  const known = new Set(BS_CHECKIN_RATINGS.map(([k]) => k));
  const out = {};
  for (const [k, v] of Object.entries(ratings || {})) if (asked.has(k) || !known.has(k)) out[k] = v;
  return out;
}
export const BS_MEASURE_SITES = [['waist', 'Waist'], ['hips', 'Hips'], ['chest', 'Chest'], ['arm', 'Upper arm'], ['thigh', 'Thigh'], ['calf', 'Calf']];
const BS_POSES = [['front', 'Front'], ['side', 'Side'], ['back', 'Back']];

const hexA = (hex, a) => {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

export function BSWeeklyCheckin({ onBack, onSent = null }) {
  const t = useBSClean();
  const tr = useShapeTr();
  const { BSPage, BSFooter } = window;
  const BSDetailHeader = window.BSDetailHeader;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const tealInk = t.isLight ? '#0a7a72' : '#34d6c5';
  const onTeal = t.isLight ? '#ffffff' : '#04201d';
  // Opens at its top, as _bsScrollTopOnMount does for the client module's pages.
  React.useLayoutEffect(() => { const el = typeof document !== 'undefined' && document.querySelector('.bs-scroll'); if (el) el.scrollTop = 0; }, []);
  const loggedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.().user);
  const [ratings, setRatings] = useState({});
  const [wins, setWins] = useState('');
  const [struggles, setStruggles] = useState('');
  const [question, setQuestion] = useState('');
  const [weight, setWeight] = useState('');
  const [meas, setMeas] = useState({});
  const [photos, setPhotos] = useState({}); // pose → { file, url } until submit
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [doneWeek, setDoneWeek] = useState(false);
  const [plans, setPlans] = useState(null);
  useEffect(() => {
    if (!loggedIn || !window.ShapePlan?.get) return undefined;
    let on = true;
    // A part the read could not answer asks its adherence question, as a failed read always did.
    window.ShapePlan.get().then((p) => { if (on && p) setPlans(bsPlanCheckinParts(p)); }).catch(() => {});
    return () => { on = false; };
  }, [loggedIn]);
  // Prefill this week's check-in when it exists — saving again updates it.
  useEffect(() => {
    if (!loggedIn) return undefined;
    let on = true;
    window.ShapeCheckins?.mine?.(1).then((rows) => {
      if (!on || !rows || !rows.length) return;
      const r = rows.find((x) => String(x.week_of) === window.ShapeCheckins.weekOf());
      if (!r) return;
      setDoneWeek(true);
      setRatings(r.ratings || {});
      setWins(r.wins || ''); setStruggles(r.struggles || ''); setQuestion(r.question || '');
      if (r.weight != null) setWeight(String(r.weight));
    }).catch(() => {});
    return () => { on = false; };
  }, [loggedIn]);
  const pickPhoto = (pose) => (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file || !/^image\//.test(file.type || '')) return;
    setPhotos((p) => { try { if (p[pose] && p[pose].url) URL.revokeObjectURL(p[pose].url); } catch (x) { /* an old preview stays in memory */ } return { ...p, [pose]: { file, url: URL.createObjectURL(file) } }; });
  };
  const submit = async () => {
    if (busy) return;
    if (!loggedIn) { setErr(tr('home:weekly.signIn', { defaultValue: 'Sign in to send a check-in.' })); return; }
    setBusy(true); setErr('');
    try {
      await window.ShapeCheckins.submit({ ratings: bsCheckinRatingsToSave(ratings, plans), wins, struggles, question, weight: weight || null, unit: t.isMetric ? 'kg' : 'lb' });
      const entries = Object.entries(meas).filter(([, v]) => v).map(([site, v]) => ({ site, value: parseFloat(v) }));
      if (entries.length) { try { await window.ShapeMeasurements.log(entries, { unit: t.isMetric ? 'cm' : 'in' }); } catch (e) { /* the check-in itself is saved */ } }
      if (weight) { try { await window.ShapeWeighIns?.log?.({ weight: parseFloat(weight), unit: t.isMetric ? 'kg' : 'lb' }); } catch (e) { /* the check-in itself is saved */ } }
      for (const [pose] of BS_POSES) {
        const p = photos[pose];
        if (p && p.file) { try { await window.ShapeProgressPhotos.upload(p.file, { pose }); } catch (e) { /* the check-in itself is saved */ } }
      }
      setBusy(false);
      // Sent: the caller hears it (Home's Team line goes), then the page closes. A Back without sending
      // leaves the line where it was.
      if (typeof onSent === 'function') onSent(); else onBack();
    } catch (e) {
      setBusy(false);
      setErr(tr('home:weekly.failed', { defaultValue: 'Couldn’t send your check-in. Your answers are still here; try again.' }));
    }
  };

  if (!BSPage || !BSDetailHeader) return null;
  const plate = { ...bsRaised(t), borderRadius: 18, margin: `0 ${t.padX}px 12px`, padding: '16px 16px 14px' };
  const head = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 };
  const h2 = { margin: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: t.INK };
  const meta = { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap' };
  const label = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70, marginBottom: 6 };
  const well = { width: '100%', boxSizing: 'border-box', minHeight: 46, padding: '11px 13px', borderRadius: 12, border: `1px solid ${hexA(t.isLight ? '#111111' : '#f2ede4', 0.14)}`, background: t.isLight ? 'rgba(0,0,0,0.04)' : 'rgba(0,0,0,0.32)', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 500, color: t.INK, outline: 'none' };
  const num = { ...well, textAlign: 'center', fontVariantNumeric: 'tabular-nums', padding: '11px 6px' };
  const ta = { ...well, minHeight: 72, resize: 'vertical', lineHeight: 1.45, fontSize: 15 };
  const unitW = t.isMetric ? 'kg' : 'lb';
  const unitM = t.isMetric ? 'cm' : 'in';
  const optional = tr('home:weekly.optional', { defaultValue: 'Optional' });

  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} kicker={tr('home:weekly.kicker', { defaultValue: 'Weekly check-in' })} title={tr('home:weekly.title', { defaultValue: 'How did the week go?' })} />
      <BSCleanType t={t}>
        <style>{`[data-bs-weekly] input:focus, [data-bs-weekly] textarea:focus { border-color: ${teal} !important; box-shadow: 0 0 0 3px ${hexA(teal, 0.16)}; }`}</style>
        <div data-bs-weekly="" style={{ padding: '6px 0 28px' }}>
          <p style={{ margin: `0 ${t.padX}px 14px`, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>
            {tr('home:weekly.sub', { defaultValue: 'Two minutes. Your coaches read it before they plan your next week, and it goes on your Progress.' })}
          </p>
          {doneWeek && (
            <div data-weekly-done="" style={{ ...plate, display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', border: `1px solid ${hexA(teal, 0.4)}` }}>
              <span aria-hidden="true" style={{ flex: 'none', width: 24, height: 24, borderRadius: 999, background: teal, color: onTeal, display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800 }}>✓</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{tr('home:weekly.already', { defaultValue: 'You’ve checked in this week. Sending again updates it.' })}</span>
            </div>
          )}

          <section style={plate}>
            <div style={head}>
              <h2 style={h2}>{tr('home:weekly.rate', { defaultValue: 'Rate the week' })}</h2>
              <span style={meta}>{tr('home:weekly.rateScale', { defaultValue: '1 rough · 10 great' })}</span>
            </div>
            {bsCheckinRatings(plans).map(([k, en, c], idx) => {
              const name = tr(`home:weekly.r.${k}`, { defaultValue: en });
              const val = Number(ratings[k]) || 0;
              return (
                <div key={k} data-weekly-rating={k} style={{ padding: '11px 0 12px', borderTop: idx === 0 ? 0 : `1px solid ${t.HAIR || t.RULE}` }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{name}</span>
                    <span style={{ fontFamily: t.HEAD || t.DISPLAY, fontSize: 17, fontWeight: 700, color: val ? c : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{val || '—'}</span>
                  </div>
                  <div role="radiogroup" aria-label={name} style={{ display: 'grid', gridTemplateColumns: 'repeat(10, minmax(0, 1fr))', gap: 4 }}>
                    {Array.from({ length: 10 }).map((_, i) => {
                      const v = i + 1; const on = val >= v; const sel = val === v;
                      return (
                        <button key={v} type="button" role="radio" aria-checked={sel} onClick={() => setRatings((r) => ({ ...r, [k]: v }))}
                          aria-label={tr('home:weekly.rateAria', { defaultValue: '{label}: {n} of 10', label: name, n: v })}
                          style={{ minWidth: 0, height: 34, padding: 0, borderRadius: 9, cursor: 'pointer', border: `1px solid ${sel ? c : on ? hexA(c, 0.5) : hexA(t.isLight ? '#111111' : '#f2ede4', 0.14)}`, background: sel ? c : on ? hexA(c, 0.22) : 'transparent', boxShadow: sel && !t.isLight ? `0 0 10px ${hexA(c, 0.5)}` : 'none', color: sel ? '#0b0d10' : on ? t.INK : t.INK50, fontFamily: t.DISPLAY, fontSize: 12, fontWeight: sel ? 800 : 600, fontVariantNumeric: 'tabular-nums' }}>{v}</button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </section>

          <section style={plate}>
            <div style={head}>
              <h2 style={h2}>{tr('home:weekly.body', { defaultValue: 'Body' })}</h2>
              <span style={meta}>{optional}</span>
            </div>
            <label style={{ display: 'block', maxWidth: 170 }}>
              <span style={label}>{tr('home:weekly.weight', { defaultValue: 'Weight ({unit})', unit: unitW })}</span>
              <input value={weight} onChange={(e) => setWeight(e.target.value.replace(/[^0-9.]/g, ''))} inputMode="decimal" placeholder="—" style={num} />
            </label>
            <span style={{ ...label, marginTop: 14 }}>{tr('home:weekly.measurements', { defaultValue: 'Measurements ({unit})', unit: unitM })}</span>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {BS_MEASURE_SITES.map(([site, en]) => (
                <label key={site} style={{ display: 'block', minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 12, fontWeight: 500, color: t.INK70, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr(`home:weekly.m.${site}`, { defaultValue: en })}</span>
                  <input value={meas[site] || ''} onChange={(e) => { const v = e.target.value.replace(/[^0-9.]/g, ''); setMeas((m) => ({ ...m, [site]: v })); }} inputMode="decimal" placeholder="—" style={num} />
                </label>
              ))}
            </div>
          </section>

          <section style={plate}>
            <div style={head}>
              <h2 style={h2}>{tr('home:weekly.photos', { defaultValue: 'Progress photos' })}</h2>
              <span style={meta}>{optional}</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
              {BS_POSES.map(([pose, en]) => {
                const has = !!photos[pose];
                const word = tr(`home:weekly.pose.${pose}`, { defaultValue: en });
                return (
                  <label key={pose} style={{ display: 'block', cursor: 'pointer', minWidth: 0 }}>
                    <input type="file" accept="image/*" onChange={pickPhoto(pose)} style={{ display: 'none' }} />
                    <span style={{ position: 'relative', display: 'grid', placeItems: 'center', aspectRatio: '3 / 4', borderRadius: 14, border: `1.5px ${has ? 'solid' : 'dashed'} ${has ? teal : hexA(t.isLight ? '#111111' : '#f2ede4', 0.22)}`, background: has ? `url(${photos[pose].url}) center/cover` : (t.isLight ? 'rgba(0,0,0,0.03)' : 'rgba(0,0,0,0.25)'), overflow: 'hidden' }}>
                      {!has && <span style={{ display: 'grid', justifyItems: 'center', gap: 4, color: t.INK70 }}><span aria-hidden="true" style={{ fontSize: 20, lineHeight: 1, color: tealInk }}>＋</span><span style={{ fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 600 }}>{word}</span></span>}
                      {has && <span style={{ position: 'absolute', left: 6, bottom: 6, padding: '3px 8px', borderRadius: 999, background: 'rgba(5,8,12,0.7)', color: '#f2ede4', fontFamily: t.DISPLAY, fontSize: 11.5, fontWeight: 600 }}>{word}</span>}
                    </span>
                  </label>
                );
              })}
            </div>
            <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.4, color: t.INK50 }}>{tr('home:weekly.photosPrivate', { defaultValue: 'Private: only you and your coaches see these.' })}</div>
          </section>

          <section style={plate}>
            <div style={head}>
              <h2 style={h2}>{tr('home:weekly.words', { defaultValue: 'The week in words' })}</h2>
            </div>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={label}>{tr('home:weekly.wins', { defaultValue: 'Wins: what went well?' })}</span>
              <textarea value={wins} onChange={(e) => setWins(e.target.value)} style={ta} />
            </label>
            <label style={{ display: 'block', marginBottom: 12 }}>
              <span style={label}>{tr('home:weekly.struggles', { defaultValue: 'Struggles: what got in the way?' })}</span>
              <textarea value={struggles} onChange={(e) => setStruggles(e.target.value)} style={ta} />
            </label>
            <label style={{ display: 'block' }}>
              <span style={label}>{tr('home:weekly.question', { defaultValue: 'A question for your coach' })}</span>
              <textarea value={question} onChange={(e) => setQuestion(e.target.value)} style={{ ...ta, minHeight: 54 }} />
            </label>
          </section>

          {err ? <div role="alert" data-weekly-error="" style={{ margin: `0 ${t.padX}px 10px`, padding: '11px 14px', borderRadius: 12, border: `1px solid ${hexA(t.RUST || '#c0533b', 0.5)}`, background: hexA(t.RUST || '#c0533b', 0.08), fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.4, color: t.RUST || '#c0533b' }}>{err}</div> : null}
          <div style={{ padding: `0 ${t.padX}px` }}>
            <button type="button" data-weekly-send="" onClick={submit} disabled={busy} aria-busy={busy || undefined}
              style={{ display: 'block', width: '100%', minHeight: 54, borderRadius: 14, border: 0, background: tealInk, color: onTeal, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.75 : 1, boxShadow: t.isLight ? 'none' : `0 0 22px ${hexA(teal, 0.3)}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              {busy ? tr('profile:log.saving', { defaultValue: 'Saving…' }) : tr('home:weekly.send', { defaultValue: 'Send check-in →' })}
            </button>
          </div>
        </div>
      </BSCleanType>
      {BSFooter ? <BSFooter right={tr('home:weekly.kicker', { defaultValue: 'Weekly check-in' })} /> : null}
    </BSPage>
  );
}
