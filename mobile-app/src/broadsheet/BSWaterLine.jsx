import React from 'react';
import { createPortal } from 'react-dom';
import { bsCleanSheet } from './bsCleanType.jsx';
import { saveAccountDocPatch } from '../../../public/newdesign/settingsSync.mjs';
import { bsCiEnqueue, bsCiSettled, bsCiIso, BS_CI_HYDRATION_SYNCED } from './BSCheckinCard.jsx';
// ─── WATER ON HOME: ONE LINE, ALL DAY ────────────────────────────────────────────────────────────
// Owner, 2026-10-19 (docs/REVIEW-2026-10-19-morning-checkin.md §3.7): water left the morning check-in,
// because it is drunk all day. It is its own Home line, shown whatever the Check-ins setting: the
// day's amount and + Glass.
//
// ⚠ PROGRESS ONLY AGAINST A TARGET THE MEMBER SET (owner, 2026-10-19). The hydration route answers
// targetStoredL, the member's own (null when none is set), beside targetL, which is 3 L when none is
// set; only the first is a target. Without one the line offers to set it, in a picker here, saved
// where Settings keeps it (client_nutrition_prefs.hydration_target_l). With Check-ins on, a target
// also lets the engine's "Water is behind" lead fire; with them off the engine reads no water, so
// the picker promises only the line (review on this PR).
//
// ⚠ GLASSES SAVE ONE AT A TIME, AND A FAILED ONE TAKES BACK ONLY ITSELF (Codex P2 on #2398): two
// quick taps used to race, and a failed first one put back the total over a second that saved.
// Each answer is the server's running total, so the line shows it plus what is still on its way.
//
// ⚠ AN OLDER READ NEVER REPLACES A NEWER ONE (Codex on #2405). The morning card syncs Apple Health
// and says so (BS_CI_HYDRATION_SYNCED); the line then reads the day again, and the first read
// answering last would put the total from before the sync back on screen, Apple Health's share with
// it. A read that fails supersedes nothing, so the other one still lands, and + Glass never stays
// disabled behind it (review on this PR).
// ⚠ A READ AFTER A SYNC TAKES ITS TOTAL ONLY WHEN NO GLASS MOVED AROUND IT. A glass still saving when
// the read goes out may or may not be in the total the server reads; one tapped or answering while
// the read is out may have landed after it. Then the read changes nothing, and the line reads again
// once no glass is on its way: a glass the server saved before the sync answers with a total from
// before it (Codex P2 on #2407). Apple Health's share waits for that read too, because the screen's
// total may not hold it yet (review on this PR). It waits for glasses already on their way first,
// so that is the rare case (review on this PR, twice).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

const { useState, useEffect, useRef } = React;

// The i18n translator for this module (the self-contained copy every feature module carries).
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

// A water read that failed: + Glass still works, because the add answers with the server's running
// total, and the line says "—" until it has one (Codex P2 on #2398).
const BS_WATER_UNKNOWN = { l: 0, target: null, deviceL: null, unknown: true };

// The member's own target off a hydration answer, or null: never the route's 3 L stand-in.
export function bsWaterTargetOf(d) {
  const n = Number(d && d.targetStoredL);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// The target picker: litres by the quarter, or ounces by the 8 oz glass. Saved as litres.
export const BS_WATER_PICK = { metric: { min: 1, max: 6, step: 0.25, start: 2.5 }, imperial: { min: 32, max: 200, step: 8, start: 80 } };
export function bsWaterPickStart(targetL, metric) {
  const p = metric ? BS_WATER_PICK.metric : BS_WATER_PICK.imperial;
  if (!(Number(targetL) > 0)) return p.start;
  const v = metric ? Math.round(targetL * 4) / 4 : Math.round((targetL * 33.814) / 8) * 8;
  return Math.max(p.min, Math.min(p.max, v));
}
export function bsWaterPickLitres(value, metric) {
  return metric ? Math.round(value * 100) / 100 : Math.round((value / 33.814) * 100) / 100;
}

function BSWaterDay({ dayIso }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const sky = t.isLight ? '#1f7fb0' : '#4fb3e8';
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const signedIn = !!uid;
  const metric = !!t.isMetric;
  // Signed out, the line counts glasses on screen and saves nothing.
  const [water, setWater] = useState(signedIn ? null : { l: 0, target: null, deviceL: null }); // { l, target, deviceL, unknown }
  const [err, setErr] = useState(null);         // 'water' | 'target': the last write that failed
  const [pick, setPick] = useState(null);       // the target picker's value while it is open
  const [saving, setSaving] = useState(false);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  // Litres added on screen whose save has not answered yet: the server's total plus these is what shows.
  const pending = useRef(0);
  const taps = useRef(0);    // glasses tapped, so a read sent before one never shows a total without it
  const inFlight = useRef(0);  // glasses whose save has not answered yet
  const landed = useRef(0);    // glass saves that answered, saved or failed
  const readSeq = useRef(0);   // reads sent
  const shownSeq = useRef(0);  // the newest read whose answer is on screen
  const resync = useRef(false);  // a sync read kept the screen's total: read again once no glass is out
  const syncRead = useRef(null); // that read, for a glass that lands to send again
  const sheetRef = useRef(null);
  const [, bump] = useState(0); // a re-render, for a tap that finds its day already over
  const round = (l) => Math.round(Math.max(0, l) * 1000) / 1000;
  const fromRead = (d) => ({ l: Number(d.hydrationL) || 0, target: bsWaterTargetOf(d), deviceL: Number(d.deviceL) > 0 ? Number(d.deviceL) : null, unknown: false });

  // The first read waits for glasses already on their way, so a line mounted meanwhile shows them.
  useEffect(() => {
    if (!signedIn || !window.ShapeHydration?.get) return undefined;
    let on = true;
    let seq = 0;
    bsCiSettled('water').then(() => { seq = ++readSeq.current; return window.ShapeHydration.get(); }).then((d) => {
      if (!on) return;
      if (!d || !d.ok) { setWater((w) => w || BS_WATER_UNKNOWN); return; }
      if (seq < shownSeq.current) return;
      shownSeq.current = seq;
      setWater(fromRead(d));
    }).catch(() => { if (on) setWater((w) => w || BS_WATER_UNKNOWN); });
    return () => { on = false; };
  }, [signedIn]);

  // A watch sync on the morning card may have moved the day's water: read it again.
  useEffect(() => {
    if (!signedIn) return undefined;
    const onSync = () => {
      if (!window.ShapeHydration?.get) return;
      let tapsAtSend = 0;
      let landedAtSend = 0;
      let outAtSend = 0;
      let seq = 0;
      bsCiSettled('water').then(() => {
        tapsAtSend = taps.current; landedAtSend = landed.current; outAtSend = inFlight.current;
        seq = ++readSeq.current;
        return window.ShapeHydration.get();
      }).then((d) => {
        // A failed read here changes nothing: the first read, answered or not, still stands.
        if (!alive.current || !d || !d.ok) return;
        if (seq < shownSeq.current) return;
        shownSeq.current = seq;
        // A glass that was out when the read left, or was tapped or answered while it was out, may be
        // missing from its total: keep the screen as it is (its total may not hold Apple Health's
        // share yet either) and read again once no glass is on its way.
        if (outAtSend > 0 || taps.current !== tapsAtSend || landed.current !== landedAtSend) {
          if (inFlight.current > 0) resync.current = true; else onSync();
          return;
        }
        setWater(fromRead(d));
      }).catch(() => {});
    };
    syncRead.current = onSync;
    window.addEventListener(BS_CI_HYDRATION_SYNCED, onSync);
    return () => { syncRead.current = null; window.removeEventListener(BS_CI_HYDRATION_SYNCED, onSync); };
  }, [signedIn]);

  useEffect(() => {
    if (pick == null) return;
    sheetRef.current?.querySelector('h2')?.focus?.({ preventScroll: true });
  }, [pick == null]);

  if (bsCiIso(new Date()) !== dayIso) return null;

  const glassL = metric ? 0.25 : 0.2366;
  // The last glass on its way has answered: a sync read held back for it goes out again.
  const afterGlass = () => {
    if (inFlight.current > 0 || !resync.current) return;
    resync.current = false;
    if (alive.current) syncRead.current?.();
  };
  const addWater = () => {
    if (bsCiIso(new Date()) !== dayIso) { bump((n) => n + 1); return; }
    if (!water) return;
    taps.current += 1;
    const deltaL = glassL;
    setWater((w) => ({ ...w, l: round(w.l + deltaL) }));
    setErr(null);
    if (!signedIn) return; // the preview counts locally and saves nothing
    if (!window.ShapeHydration?.add) { setWater((w) => ({ ...w, l: round(w.l - deltaL) })); setErr('water'); return; }
    pending.current += deltaL;
    inFlight.current += 1;
    bsCiEnqueue('water', uid, () => window.ShapeHydration.add(deltaL)).then((d) => {
      pending.current -= deltaL;
      inFlight.current -= 1; landed.current += 1;
      // The add answers with the running total and the member's own target, which a failed first
      // read left unknown (Codex P2 on #2398).
      if (alive.current && d && d.ok) setWater((w) => ({ ...w, l: round((Number(d.hydrationL) || 0) + pending.current), target: bsWaterTargetOf(d) ?? w.target, unknown: false }));
      afterGlass();
    }).catch(() => {
      pending.current -= deltaL;
      inFlight.current -= 1; landed.current += 1;
      afterGlass();
      if (!alive.current) return;
      setWater((w) => ({ ...w, l: round(w.l - deltaL) }));
      setErr('water');
    });
  };

  const P = metric ? BS_WATER_PICK.metric : BS_WATER_PICK.imperial;
  const openPick = () => { setErr(null); setPick(bsWaterPickStart(water && water.target, metric)); };
  const closePick = () => { if (!saving) { setPick(null); setErr(null); } };
  const saveTarget = () => {
    const litres = bsWaterPickLitres(pick, metric);
    const db = window.shapeDb;
    if (!signedIn || !db) { setErr('target'); return; }
    setSaving(true);
    setErr(null);
    // Stored as Settings stores it: the litres as a string ('2.5').
    saveAccountDocPatch(db, 'client_nutrition_prefs', { hydration_target_l: String(litres) }, uid).then(() => {
      if (!alive.current) return;
      setWater((w) => ({ ...(w || BS_WATER_UNKNOWN), target: litres }));
      setPick(null);
    }).catch(() => { if (alive.current) setErr('target'); }).finally(() => { if (alive.current) setSaving(false); });
  };

  const locale = window.ShapeI18n?.intlLocale?.() || undefined;
  const num = (n, digits) => { try { return new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(n); } catch (e) { return String(n); } };
  const litres = (l) => (metric ? `${num(Math.round(l * 100) / 100, 2)} L` : `${num(Math.round(l * 33.814), 0)} oz`);
  const known = !!(water && !water.unknown);
  const target = water ? water.target : null;
  const mono = { fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
  const errLine = (which) => (err === which ? (
    <div role="alert" style={{ fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.35, color: t.RUST }}>
      {which === 'water' ? tr('home:today.waterFailed', { defaultValue: 'Could not log water — try again' })
        : tr('home:water.targetFailed', { defaultValue: 'Could not save your target — try again' })}
    </div>
  ) : null);
  const share = known && water.deviceL && water.l > 0 ? Math.min(water.deviceL, water.l) : null;

  const sheet = pick == null ? null : (
    <div ref={sheetRef} role="dialog" aria-modal="true" aria-label={tr('home:water.targetTitle', { defaultValue: 'Your daily water target' })} data-bs-layer="water-target"
      onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); closePick(); } }}
      onClick={(e) => { if (e.target === e.currentTarget) closePick(); }}
      style={{ position: 'absolute', inset: 0, zIndex: 250, background: 'rgba(0,0,0,0.45)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
      <div style={{ background: t.PAPER, color: t.INK, borderTop: `1px solid ${t.RULE}`, padding: '20px 20px calc(env(safe-area-inset-bottom, 0px) + 22px)', display: 'flex', flexDirection: 'column', gap: 14 }}>
        <span style={{ ...mono, color: sky }}>{tr('home:checkin.water', { defaultValue: 'Water' })}</span>
        <h2 tabIndex={-1} style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1.1, outline: 'none' }}>{tr('home:water.targetTitle', { defaultValue: 'Your daily water target' })}</h2>
        <p style={{ margin: 0, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>{tr('home:water.targetWhy', { defaultValue: 'Your water shows against it on Home.' })}</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button type="button" aria-label={tr('home:water.less', { defaultValue: 'Less water' })} disabled={pick <= P.min} onClick={() => setPick((v) => Math.max(P.min, Math.round((v - P.step) * 100) / 100))} style={{ width: 54, height: 54, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 24, cursor: 'pointer', opacity: pick <= P.min ? 0.35 : 1 }}>−</button>
          <div aria-live="polite" style={{ fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{metric ? `${num(pick, 2)} L` : `${num(pick, 0)} oz`}</div>
          <button type="button" aria-label={tr('home:water.more', { defaultValue: 'More water' })} disabled={pick >= P.max} onClick={() => setPick((v) => Math.min(P.max, Math.round((v + P.step) * 100) / 100))} style={{ width: 54, height: 54, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 24, cursor: 'pointer', opacity: pick >= P.max ? 0.35 : 1 }}>+</button>
        </div>
        {errLine('target')}
        <div style={{ display: 'flex', gap: 10 }}>
          <button type="button" onClick={closePick} disabled={saving} style={{ minHeight: 50, padding: '0 18px', borderRadius: 5, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', ...mono, fontSize: 10, letterSpacing: '0.14em' }}>{tr('home:setup.cancel', { defaultValue: 'CANCEL' })}</button>
          <button type="button" onClick={saveTarget} disabled={saving} style={{ flex: 1, minHeight: 50, borderRadius: 5, border: 0, background: t.INK, color: t.PAPER, cursor: saving ? 'default' : 'pointer', ...mono, fontSize: 10.5, letterSpacing: '0.14em' }}>{saving ? tr('home:today.saving', { defaultValue: 'Saving…' }) : tr('home:setup.save', { defaultValue: 'SAVE' })}</button>
        </div>
      </div>
    </div>
  );
  const host = typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;

  // ⚠ IN THE MORNING PANEL (owner, 2026-10-22, Option A: the card and the water row "look analog and
  // outdated"). The line draws no box of its own: BSMorningPanel (BSCheckinCard.jsx) holds it with the
  // check-in card, or alone when Check-ins is off. A drop tile, Water and the day's total, the day as
  // glasses against a target (one pip a glass of + Glass's size, at most 12), then + Glass as a round
  // button (owner, 2026-10-23, of the board's water row: "add the updated water to home page"). Apple
  // Health's share and Set a daily target are small lines under it.
  // ⚠ THE PIPS FILL A GLASS AT A TIME, TARGET OR NOT (owner, 2026-10-24: "the water here is supposed to
  // show little bars that fill up each time you add a glass"). Without a target the member set they
  // still measure nothing against one: the day's glasses filled and the next one empty, at most 12.
  const pips = known ? (() => {
    if (target) {
      const n = Math.max(1, Math.min(12, Math.round(target / glassL)));
      return { n, on: Math.min(n, Math.floor((water.l / target) * n + 1e-6)), mode: 'target' };
    }
    const had = Math.max(0, Math.round(water.l / glassL));
    const n = Math.min(12, had + 1);
    return { n, on: Math.min(n, had), mode: 'count' };
  })() : null;
  const onSky = t.isLight ? '#1a6f9c' : sky;
  return (
    <>
      <div data-bs-water="" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span aria-hidden style={{ width: 30, height: 30, borderRadius: 9, background: `${sky}1f`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flex: 'none' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={sky} strokeWidth="1.9" strokeLinejoin="round"><path d="M12 3c3.6 4.3 6 7.7 6 10.6A6 6 0 0 1 6 13.6C6 10.7 8.4 7.3 12 3z" /></svg>
          </span>
          {/* The total and the glasses share one wrapping row: the glasses sit beside the total and
              drop under it when a narrow phone, large text or a long language leaves no room, so they
              never squeeze Water or + Glass (Codex P2 on #2426). */}
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 10, rowGap: 6 }}>
            <span style={{ flex: '1 1 auto', minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, letterSpacing: '-0.01em', color: t.INK }}>{tr('home:checkin.water', { defaultValue: 'Water' })}</span>
              <span style={{ display: 'block', fontFamily: t.BODY, fontSize: 12, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>
                {known ? litres(water.l) : '—'}
                {known && target ? ` ${tr('home:checkin.ofTarget', { defaultValue: 'of {target}', target: litres(target) })}` : null}
              </span>
            </span>
            {pips ? (
              <span aria-hidden data-bs-water-bar="" data-bs-water-mode={pips.mode} style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>
                {Array.from({ length: pips.n }, (_, i) => (
                  <span key={i} style={{ width: 7, height: 14, borderRadius: 3, background: i < pips.on ? onSky : 'transparent', boxShadow: `inset 0 0 0 1.4px ${i < pips.on ? onSky : `${sky}66`}` }} />
                ))}
              </span>
            ) : null}
          </span>
          {/* The round you see is 38 px (owner, 2026-10-24: "make these smaller"); the tap stays 44,
              its margin giving the row back the 6 px. */}
          <button type="button" data-bs-water-add="" aria-label={tr('home:checkin.addGlass', { defaultValue: '+ Glass' })} onClick={addWater} disabled={!water}
            style={{ flex: 'none', width: 44, height: 44, minHeight: 44, margin: -3, padding: 0, border: 0, borderRadius: 999, background: 'transparent', color: t.isLight ? '#fff' : t.PAPER, cursor: water ? 'pointer' : 'default', opacity: water ? 1 : 0.5, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <span aria-hidden data-bs-water-add-dot="" style={{ width: 38, height: 38, borderRadius: 999, background: onSky, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', boxShadow: t.isLight ? '0 8px 16px -10px rgba(26,111,156,0.9)' : 'none' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
          </button>
        </div>
        {share ? <div style={{ fontFamily: t.BODY, fontSize: 11.5, color: t.INK50, paddingLeft: 40 }}>{tr('home:checkin.waterFromHealth', { defaultValue: 'Includes {amount} from Apple Health', amount: litres(share) })}</div> : null}
        {signedIn && known && !target ? (
          <button type="button" onClick={openPick} style={{ alignSelf: 'flex-start', minHeight: 32, margin: '-2px 0 -6px 40px', padding: '4px 0', border: 0, background: 'transparent', color: sky, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600 }}>{tr('home:water.setTarget', { defaultValue: 'Set a daily target' })}<span aria-hidden> ›</span></button>
        ) : null}
        {errLine('water')}
      </div>
      {sheet && host ? createPortal(bsCleanSheet(t, sheet), host) : sheet}
    </>
  );
}

// One line per local day, as the morning card: a new day mounts a new line, so a total from the day
// before never shows, and a glass tapped on a day that is over saves nothing.
export function BSWaterLine() {
  const day = bsCiIso(new Date());
  return <BSWaterDay key={day} dayIso={day} />;
}

// ⚠ THE HYDRATION LEAD OPENS THIS LINE (part 2, §3.7): water has no page of its own any more, so "I'll
// log water →" brings today's line to the middle of the screen and puts focus on + Glass, one tap
// from a glass. True when the line is on screen to bring; false when it is not (a day that is over,
// or Home not showing), and the lead then does nothing rather than open a page. With Reduce Motion on
// it jumps there: an explicit smooth scroll overrides the setting (review on this PR). 'auto', never
// 'instant', which older WebKit throws on.
export function bsWaterLineFocus() {
  const line = typeof document !== 'undefined' ? document.querySelector('[data-bs-water]') : null;
  if (!line) return false;
  let still = false;
  try { still = !!window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { /* no matchMedia: a smooth scroll */ }
  try {
    if (typeof line.scrollIntoView === 'function') line.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
  } catch (e) { /* a scroll that fails still leaves focus on + Glass */ }
  // The scroll is already moving it, so focusing must not jump the page a second time.
  line.querySelector('[data-bs-water-add]')?.focus?.({ preventScroll: true });
  return true;
}
