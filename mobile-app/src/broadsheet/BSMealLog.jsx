import React from 'react';
import { createPortal } from 'react-dom';
import { bsMealDirty, bsMealCtaLabel } from '../services/mealLoggerState.mjs';
import { bsCookingPayload } from '../services/liveProgress.mjs';
import { bsValidBarcode } from '../services/foodSearch.mjs';
import { bsMealSharePayload } from '../../../public/newdesign/mealShare.mjs';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType } from './bsCleanType.jsx';
import { bsMpGlass, bsMpGradText } from './BSMemberBento.jsx';
import { bsRaised } from './BSProInstrument.jsx';
import { bsDialogRef } from '../services/dialogBack.mjs';
// ─── LOG A MEAL · THE SHEET AND ITS FILED STAMP (owner, 2026-11-04) ─────────────────────────────────
// The Log meal sheet (BSLogMealFlow: Home's "Log Lunch →", the Up next card, a planned meal's Log Now)
// and the filed stamp after it, which the one-tap from a meal's own page shows too (BSMealLogged: Eat →
// a meal → Ate as planned). Of the old sheet the owner said "new designs for this", and of three looks
// picked B "for logging meals and Filed": glass, folded.
//   · The sheet. A raised card carries the meal and the one tap, a glowing teal pill. The corrections
//     ("Correct the record": portion, ingredients, Add) and the note to the coach ("Dispatch to …",
//     photo and voice) fold into two glass cards, so a meal eaten as planned is one screen and one tap.
//     A glass bar at the foot always holds the live tally, the figures moving as the record is
//     corrected, and the log button once the pill is out of sight or the meal is adjusted: the old
//     sheet's second "Log as planned →", always on beside the pill, is gone (the owner: "long and busy").
//     The bar also keeps the tab bar covered while the sheet is open, as the old footer did.
//   · Filed. A raised card with the meal's kcal lit from teal and its macros on a chip; the day so far
//     as two glass tiles with rings (kcal teal, protein amber); Done as the same teal pill.
// Carved out of the client module (the WORKLOG rule: a PR that touches a self-contained screen moves
// it): window globals are read at call time, the module has its own translator, and it never imports
// back into the client. The flow's rules (the dirty predicate, the repriced label, the coach note's
// honesty, the accumulating write) came over unchanged.

// The client's translator hook, copied: a feature module never imports back into the client.
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => window.ShapeLocale?.subscribe?.(() => force((n) => n + 1)), []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}
// The client's module-local useState alias, kept so the flow's logic reads as it did there.
function useStateBSC(init) { return React.useState(init); }
// The client's bsTHexA, copied.
const hexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
// The client's bsApi (the backend client: apiBaseUrl + Bearer on the native build) and its
// bsSetMyActivity (the presence dot), copied.
const bsMlApi = { fetch: (path, init) => (window.ShapeApi ? window.ShapeApi.fetch(path, init) : fetch(path, init)) };
function bsMlSetActivity(kind) {
  try { window.ShapePresence && window.ShapePresence.setActivity && window.ShapePresence.setActivity(kind || null); } catch (e) {}
}
const mastTop = () => window.BS_MAST_TOP_CSS || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';
// The sheet has no masthead row (BSPage mast={false}): its top bar sits under the notch.
const SHEET_TOP = 'max(52px, calc(env(safe-area-inset-top, 0px) + 10px))';
const phoneSurface = () => (typeof document === 'undefined' ? null : (document.getElementById('bs-phone-surface') || document.body));
const clamp01 = (x) => Math.max(0, Math.min(1, x));
// Teal on either paper (WORKLOG: Theme); protein's amber, darker on a light paper so it reads.
const bsMlTeal = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');
const bsMlAmber = (t) => (t.isLight ? '#a8701a' : '#e8a13c');
const TEAL_INK = '#04201d';
const bsMlCaps = (t, size, color, w = 800, ls = '0.18em') => ({ fontFamily: t.MONO, fontSize: size, fontWeight: w, letterSpacing: ls, textTransform: 'uppercase', color });
const BARE = { background: 'transparent', border: 0, padding: 0, cursor: 'pointer' };
// The teal pill: the one tap, the bar's log button over a meal as planned, and Done.
const bsMlPill = (t) => {
  const teal = bsMlTeal(t);
  return { border: 0, cursor: 'pointer', borderRadius: 999, background: `linear-gradient(180deg, ${teal}, ${hexA(teal, 0.82)})`, color: TEAL_INK, boxShadow: `0 12px 26px -12px ${hexA(teal, t.isLight ? 0.7 : 0.9)}, inset 0 1px 0 rgba(255,255,255,0.35)` };
};

// Stable per-ingredient id so a React list key never collides on duplicate
// names (addFood / manual edits can produce two rows with the same name).
let _bsIngSeq = 0;
const bsIngId = () => `bsing-${++_bsIngSeq}`;

// Real food recents — user_goals('food_recents'), cap 20, most-recent-first,
// deduped by name. Best-effort: a failed write never blocks the add.
async function bsLoadFoodRecents() {
  try {
    const doc = await window.shapeDb?.getUserGoals?.('food_recents');
    const items = doc && Array.isArray(doc.items) ? doc.items : [];
    return items.filter((x) => x && x.name).slice(0, 20);
  } catch (e) { return []; }
}
function bsPushFoodRecent(items, f) {
  const key = String(f.name || '').trim().toLowerCase();
  const rest = (Array.isArray(items) ? items : []).filter((x) => String((x && x.name) || '').trim().toLowerCase() !== key);
  return [{ name: f.name, qty: f.qty || '1 serving', kcal: Math.round(Number(f.kcal) || 0), p: Math.round(Number(f.p) || 0), c: Math.round(Number(f.c) || 0), f: Math.round(Number(f.f) || 0) }, ...rest].slice(0, 20);
}

// Barcode scan support: the BarcodeDetector API (Chrome/Android WebView) +
// camera access. iOS WebKit ships neither BarcodeDetector nor (pre-14.3)
// getUserMedia — those fall to the manual digits entry, honestly.
function bsBarcodeScanSupported() {
  try {
    return typeof window !== 'undefined'
      && typeof window.BarcodeDetector === 'function'
      && !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  } catch (e) { return false; }
}

// Live camera scanner for the add-food sheet. Owns the stream lifecycle
// (unmount stops every track); polls BarcodeDetector ~3×/s on the video and
// fires onHit ONCE with the first raw code. Camera denial / detector failure
// degrades to onFallback (the manual digits entry) — never a dead end.
function BSBarcodeScan({ onHit, onFallback, teal }) {
  const { useBS } = window;
  const t = useBS();
  const videoRef = React.useRef(null);
  React.useEffect(() => {
    let stream = null, timer = null, done = false;
    let detector = null;
    try {
      detector = new window.BarcodeDetector({ formats: ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'itf'] });
    } catch (e) { onFallback(); return undefined; }
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then((s) => {
        if (done) { s.getTracks().forEach((track) => track.stop()); return; }
        stream = s;
        const v = videoRef.current;
        if (v) { v.srcObject = s; const p = v.play && v.play(); if (p && p.catch) p.catch(() => {}); }
        timer = setInterval(async () => {
          const vid = videoRef.current;
          if (done || !vid || vid.readyState < 2) return;
          try {
            const hits = await detector.detect(vid);
            const code = hits && hits[0] && hits[0].rawValue;
            if (code && !done) { done = true; clearInterval(timer); onHit(String(code)); }
          } catch (e) { /* per-frame detect failures are normal — keep polling */ }
        }, 350);
      })
      .catch(() => { if (!done) onFallback(); });
    return () => { done = true; if (timer) clearInterval(timer); if (stream) stream.getTracks().forEach((track) => track.stop()); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div style={{ marginTop: 12, position: 'relative', borderRadius: t.RADIUS_SM, overflow: 'hidden', border: `1px solid ${t.RULE}`, background: '#000' }}>
      <video ref={videoRef} muted playsInline style={{ display: 'block', width: '100%', height: 190, objectFit: 'cover' }} />
      <div aria-hidden style={{ position: 'absolute', left: '10%', right: '10%', top: '50%', height: 2, background: teal, opacity: 0.85, boxShadow: `0 0 12px ${teal}` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '8px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'linear-gradient(transparent, rgba(0,0,0,0.65))' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff' }}>Point at the barcode</span>
      </div>
    </div>
  );
}

// Whether the one tap is on screen above the bar, so the bar's own log button shows only once it is
// not (or the meal is adjusted and the pill has gone).
function useBSMlInView(ref, active) {
  const [inView, setInView] = React.useState(true);
  React.useEffect(() => {
    if (!active) { setInView(true); return undefined; }
    const el = ref.current;
    if (!el || typeof IntersectionObserver === 'undefined') return undefined;
    const io = new IntersectionObserver((es) => { const e = es[es.length - 1]; if (e) setInView(e.isIntersecting); }, { rootMargin: '0px 0px -96px 0px', threshold: 0.5 });
    io.observe(el);
    return () => io.disconnect();
  }, [active]);
  return inView;
}

// The look's pieces are render helpers, not components: what they draw is part of the screen's own
// render, so the sheet holds one hook order and a test reads one tree.

// A day's figure as a ring (the filed stamp's tiles).
function bsMlRing({ frac, color, track, glow = false, size = 38, stroke = 4 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" style={{ flex: 'none', transform: 'rotate(-90deg)', overflow: 'visible' }}>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
      {frac != null && frac > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * frac} ${c}`} style={{ filter: glow ? `drop-shadow(0 0 4px ${hexA(color, 0.8)})` : 'none' }} />}
    </svg>
  );
}

// A folded glass card: its label and a one-line summary of what is inside, a dot in its colour; a
// tap opens it.
function bsMlFold(t, { id, open, onToggle, label, summary, accent, children }) {
  return (
    <div data-meal-log={id} style={{ ...bsMpGlass(t, t.INK, { radius: 18 }), margin: `10px ${t.padX}px 0`, overflow: 'hidden' }}>
      <button type="button" onClick={onToggle} aria-expanded={open} style={{ ...BARE, width: '100%', minHeight: 58, display: 'flex', alignItems: 'center', gap: 11, padding: '0 14px', textAlign: 'left' }}>
        <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 99, background: accent, boxShadow: t.isLight ? 'none' : `0 0 10px ${hexA(accent, 0.8)}` }} />
        <span style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: BS_CLEAN_SANS, fontSize: 14.5, fontWeight: 650, color: t.INK }}>{label}</span>
          <span style={{ display: 'block', marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 12.5, color: t.INK50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{summary}</span>
        </span>
        <span aria-hidden="true" style={{ flex: 'none', fontFamily: BS_CLEAN_SANS, fontSize: 18, color: t.INK50, transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 160ms ease' }}>›</span>
      </button>
      {open && <div style={{ padding: '0 14px 12px', borderTop: `1px solid ${t.HAIR}` }}>{children}</div>}
    </div>
  );
}

// The filed stamp, for both ways a meal is filed: the sheet's own (← Back, with the Shape Score award)
// and the one-tap's (← Undo, the cook's "Cooked"). `backRow(trailing)` draws the caller's row under
// the masthead with the stamp's eyebrow beside it. `translate` is the screen's translator.
function bsMlFiledStamp(t, translate, { mast, backRow, eyebrow, kcal, meta, award = null, day = null, onDone, share = null }) {
  const teal = bsMlTeal(t);
  const amber = bsMlAmber(t);
  const dark = !t.isLight;
  const SANS = BS_CLEAN_SANS, HEAD = BS_CLEAN_HEAD;
  const kcalUnit = translate('nutrition:log.kcalUnit', { defaultValue: 'KCAL' });
  const goal = (g) => (g != null ? g : '—');
  const tile = (key, value, g, unit, frac, c) => (
    <div key={key} data-meal-log={`day-${key}`} style={{ ...bsMpGlass(t, t.INK, { radius: 18 }), padding: '12px 12px 12px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: HEAD, fontSize: 21, fontWeight: 750, letterSpacing: '-0.02em', lineHeight: 1, color: c, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
        <div style={{ marginTop: 4, fontFamily: SANS, fontSize: 11.5, fontWeight: 600, color: t.INK50, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>/ {goal(g)} {unit}</div>
      </div>
      {bsMlRing({ frac, color: c, track: t.HAIR, glow: dark })}
    </div>
  );
  return (
    <BSCleanType t={t}>
      <div style={{ padding: `${mastTop()} ${t.padX}px 0` }}>
        {mast}
        {backRow(<span style={bsMlCaps(t, 8.5, teal, 800, '0.2em')}>{eyebrow}</span>)}
      </div>
      <div data-meal-log="stamp" style={{ ...bsRaised(t, teal), margin: `10px ${t.padX}px 0`, padding: '22px 18px 20px', textAlign: 'center' }}>
        <div style={{ fontFamily: HEAD, fontSize: 60, fontWeight: 750, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums', ...bsMpGradText(t, teal, t.INK) }}>{kcal}</div>
        <div style={{ marginTop: 10, display: 'inline-flex', alignItems: 'center', padding: '6px 12px', borderRadius: 99, background: hexA(teal, dark ? 0.14 : 0.1), border: `1px solid ${hexA(teal, 0.3)}`, fontFamily: SANS, fontSize: 12.5, fontWeight: 650, color: dark ? teal : t.INK70 }}>{meta}</div>
        {/* The Shape Score award, once the first log of the day earns it; its keyframes come with it. */}
        {award && (
          <>
            <div data-meal-log="award" style={{ marginTop: 10, fontFamily: SANS, fontSize: 12.5, fontWeight: 650, color: teal, animation: 'bsAwardIn 180ms ease-out' }}>{award}</div>
            <style>{`@keyframes bsAwardIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: none; } } @media (prefers-reduced-motion: reduce) { [style*="bsAwardIn"] { animation: none !important; } }`}</style>
          </>
        )}
      </div>
      {day && (
        <div style={{ margin: `14px ${t.padX}px 0` }}>
          <div style={{ ...bsMlCaps(t, 8, t.INK50, 800, '0.2em'), marginBottom: 8 }}>{translate('nutrition:log.daySoFar', { defaultValue: 'Day so far' })}</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {tile('kcal', day.cal, day.calGoal, kcalUnit, day.calGoal ? clamp01(day.cal / day.calGoal) : null, teal)}
            {tile('p', day.p, day.pGoal, 'P', day.pGoal ? clamp01(day.p / day.pGoal) : null, amber)}
          </div>
        </div>
      )}
      <div style={{ padding: `20px ${t.padX}px 8px` }}>
        <button type="button" data-meal-log="done" onClick={onDone} style={{ ...bsMlPill(t), width: '100%', minHeight: 54, fontFamily: SANS, fontSize: 15.5, fontWeight: 700 }}>{translate('nutrition:log.done', { defaultValue: 'Done →' })}</button>
      </div>
      {share}
    </BSCleanType>
  );
}

// Full meal-logging flow — opened from the home "Up next" meal card's
// "Log now" button. One-tap "ate as planned", or adjust portion / ingredients,
// photo, or voice; writes to the day total and shows a logged confirmation.
export function BSLogMealFlow({ onClose, onLogged = () => {}, meal = null, daySoFar = null, dayTargets = null, signedIn = false }) {
  const { useBS, BSPage, BSBackRow, BSMastRow } = window;
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // No mode tabs: the corrections fold under "Correct the record", photo and voice are disclosures
  // under the note, and search lives in the Add sheet.
  const [portion, setPortion] = useStateBSC(1);
  const [note, setNote] = useStateBSC('');
  const [foodQuery, setFoodQuery] = useStateBSC('');
  const [foodResults, setFoodResults] = useStateBSC(null);   // null = idle (no live query yet)
  const [foodStatus, setFoodStatus] = useStateBSC('idle');   // idle | searching | done | error
  const [foodRecents, setFoodRecents] = useStateBSC(null);   // null until loaded
  // Barcode lookup (v2) — 'scan' opens the camera (BarcodeDetector), 'enter'
  // the manual digits input (the honest fallback where the API is absent —
  // iOS WebKit has no BarcodeDetector).
  const [barcodeMode, setBarcodeMode] = useStateBSC(null);      // null | 'scan' | 'enter'
  const [barcodeDigits, setBarcodeDigits] = useStateBSC('');
  const [barcodeStatus, setBarcodeStatus] = useStateBSC('idle'); // idle | looking | invalid | notfound | error
  const [logged, setLogged] = useStateBSC(false);
  const [award, setAward] = useStateBSC(null);         // {awarded, points} | null — set after log resolves
  // Share-by-choice (spec 2026-07-12), freehand-logger parity with
  // BSMealLogged: per-meal, default off, never auto; only a real Supabase row
  // counts as shared. This screen has no un-log, so there's no Undo coupling —
  // a shared post stays owner-deletable from its feed card.
  const [sharedPostId, setSharedPostId] = useStateBSC(null);
  const [shareBusy, setShareBusy] = useStateBSC(false);
  const [coach, setCoach] = useStateBSC(null);         // {name, role} | null — resolved linked nutritionist/coach
  const [showAddFood, setShowAddFood] = useStateBSC(false);
  const [photoOpen, setPhotoOpen] = useStateBSC(false); // dispatch disclosures
  const [voiceOpen, setVoiceOpen] = useStateBSC(false);
  const [ings, setIngs] = useStateBSC(() => {
    // Seed from the REAL meal being logged when its macros are known; for a
    // signed-in account with no macro breakdown, start empty (add what you ate)
    // — never the demo plate. The demo ingredients are the signed-out preview.
    if (meal && Number.isFinite(Number(meal.kcal))) {
      // ⚠ `qty` STAYS ENGLISH ON PURPOSE — it is DATA in a column whose other values
      // are never localized: the food provider fills it with '100 g' / '250 g' / its
      // own '1 serving' (foodSearch.mjs, a pure module with no translator), so
      // translating only our fallback makes ONE data column bilingual — the split
      // this cut refused for the P/C/F macro letters. The NAME fallback does
      // translate, because it stands in for the same missing meal.title the hero
      // heading shows, and the two must not disagree on one screen.
      return [{ id: bsIngId(), name: meal.title || tr('nutrition:log.mealFallback', { defaultValue: 'Meal' }), qty: '1 serving', kcal: Math.round(Number(meal.kcal) || 0), p: Math.round(Number(meal.p) || 0), c: Math.round(Number(meal.c) || 0), f: Math.round(Number(meal.f) || 0), on: true }];
    }
    if (signedIn) return [];
    return [
      { id: bsIngId(), name: 'Grilled chicken breast', qty: '6 oz',  kcal: 280, p: 52, c: 0,  f: 8,  on: true },
      { id: bsIngId(), name: 'Jasmine rice',           qty: '1 cup', kcal: 205, p: 4,  c: 45, f: 0,  on: true },
      { id: bsIngId(), name: 'Charred broccoli',       qty: '1 cup', kcal: 55,  p: 4,  c: 11, f: 0,  on: true },
      { id: bsIngId(), name: 'Avocado',                qty: '½',     kcal: 120, p: 2,  c: 6,  f: 11, on: true },
      { id: bsIngId(), name: 'Tahini sauce',           qty: '2 tbsp',kcal: 90,  p: 3,  c: 3,  f: 8,  on: true },
    ];
  });
  const toggle = (i) => setIngs(arr => arr.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));
  // Frozen copy of the ingredients as the sheet opened — the baseline the dirty
  // predicate compares against (toggle / edit / add / remove all diverge from it).
  const initialIngsRef = React.useRef(null);
  if (initialIngsRef.current === null) initialIngsRef.current = ings.map((x) => ({ ...x }));

  // Real recents — loaded once per sheet open (signed-in only; the demo
  // catalog stays the signed-out preview).
  React.useEffect(() => {
    if (!signedIn || !showAddFood || foodRecents !== null) return;
    let on = true;
    // A late load must never clobber a list an add already updated.
    bsLoadFoodRecents().then((items) => { if (on) setFoodRecents((cur) => (cur === null ? items : cur)); });
    return () => { on = false; };
  }, [signedIn, showAddFood]);

  // In-flight barcode lookup — aborted on sheet close and before a new lookup,
  // so a late OFF response can never reopen a dismissed editor or land the
  // PREVIOUS barcode's product over the one the member is entering now.
  const barcodeCtlRef = React.useRef(null);
  // Closing the add sheet always ends a scan (unmounts the camera), aborts an
  // in-flight lookup, and clears the barcode state — a reopened sheet never
  // resumes a stale lookup.
  React.useEffect(() => {
    if (!showAddFood) {
      try { barcodeCtlRef.current?.abort(); } catch (e) {}
      barcodeCtlRef.current = null;
      setBarcodeMode(null); setBarcodeDigits(''); setBarcodeStatus('idle');
    }
  }, [showAddFood]);

  // Persist an added food to real recents. Centralized so BOTH add paths (＋
  // direct and via the prefilled editor) go through it, and so an add that
  // races the initial recents load merges with the CLOUD list instead of
  // clobbering it with a single item. Best-effort — never blocks the add.
  const rememberFood = async (f) => {
    try {
      const base = foodRecents === null ? await bsLoadFoodRecents() : foodRecents;
      const next = bsPushFoodRecent(base, f);
      setFoodRecents(next);
      await window.shapeDb?.saveUserGoals?.('food_recents', { items: next });
    } catch (e) {}
  };

  // Live food search — debounced 350 ms, in-flight aborted, min 2 chars.
  React.useEffect(() => {
    if (!signedIn || !showAddFood) return;
    const q = foodQuery.trim();
    if (q.length < 2) { setFoodResults(null); setFoodStatus('idle'); return; }
    // Clear immediately — the previous query's rows must not stay clickable
    // through the debounce (a member could add a food that no longer matches
    // what they typed).
    setFoodResults(null);
    setFoodStatus('searching');
    const ctl = new AbortController();
    const timer = setTimeout(() => {
      window.ShapeFoodSearch?.search(q, { signal: ctl.signal })
        .then((data) => {
          if (ctl.signal.aborted) return;
          setFoodResults(Array.isArray(data.results) ? data.results : []);
          setFoodStatus(data.unavailable ? 'error' : 'done');
        })
        .catch(() => { if (ctl.signal.aborted) return; setFoodResults([]); setFoodStatus('error'); });
    }, 350);
    return () => { clearTimeout(timer); ctl.abort(); };
  }, [foodQuery, signedIn, showAddFood]);
  // Broadcast "cooking" presence while the meal logger is open (amber dot) — and,
  // for a PLAN/RECIPE-sourced meal, the live cooking TITLE (spec 2026-07-19).
  // Provenance is LIVE: pivoting to freehand mid-session actively clears the
  // row (never waits for close); the audience re-resolves per push, and a
  // settings change re-pushes immediately via shape:liveAudienceChanged.
  React.useEffect(() => { bsMlSetActivity('cooking'); return () => bsMlSetActivity(null); }, []);
  const cookPayload = React.useMemo(() => bsCookingPayload(meal), [meal]);
  const cookPushedRef = React.useRef(null);              // last-pushed MEAL KEY — fresh=true when
  React.useEffect(() => {                                // the key changes; a re-push of the SAME
    if (!window.ShapeLiveProgress) return undefined;     // meal must never reset started_at
    if (cookPayload) {
      // The ref holds a meal KEY (id, else the payload title), not a boolean, so
      // a DIRECT swap from one eligible meal to another (A → B with no
      // ineligible gap between renders) still restamps started_at for B.
      const mealKey = (meal && (meal.id != null ? String(meal.id) : null)) || cookPayload.title;
      window.ShapeLiveProgress.push(cookPayload, cookPushedRef.current !== mealKey);
      cookPushedRef.current = mealKey;
    } else {
      window.ShapeLiveProgress.clear();                  // ineligible → absence, NOW
      cookPushedRef.current = null;                      // a NEW eligible meal restarts the clock
    }
    // Pass the audience the settings change already resolved straight through —
    // never let this push re-read the (possibly not-yet-persisted) settings doc.
    const rePush = (e) => {
      if (!cookPayload) return;
      const vis = e && e.detail ? e.detail.visibility : undefined;
      window.ShapeLiveProgress.push(cookPayload, false, { visOverride: vis });
    };
    window.addEventListener('shape:liveAudienceChanged', rePush);
    return () => {
      window.removeEventListener('shape:liveAudienceChanged', rePush);
      window.ShapeLiveProgress.clear();                  // logger close → absence
    };
  }, [cookPayload]);

  // Resolve the member's linked coach for the note's fold — prefer the
  // nutritionist thread, else any linked coach. No thread → coach stays null and
  // the whole note fold hides (the meal-note endpoint no-ops anyway).
  React.useEffect(() => {
    if (!signedIn || !window.ShapeMessages?.listDirectCoachThreads) return;
    let alive = true;
    window.ShapeMessages.listDirectCoachThreads().then((res) => {
      // A member's own coaches only: an account that also coaches gets its clients' threads back
      // too (as_coach), and none of them is this member's coach.
      const list = (Array.isArray(res) ? res : (res && res.data) || []).filter((c) => !c.as_coach);
      if (!alive || !list.length) return;
      const nutri = list.find((c) => c.provider_role === 'nutritionist');
      const co = nutri || list[0];
      const nm = co.who || co.name || co.full_name;
      if (!nm) return;
      setCoach({ name: nm, role: co.provider_role === 'nutritionist' ? 'nutritionist' : 'trainer' });
    }).catch(() => {});
    return () => { alive = false; };
  }, [signedIn]);

  // Voice note for the coach — either dictate (speech → text appended to the
  // note) or record an audio memo that rides along with the log. Web
  // MediaRecorder; transcription via /api/nutrition/voice. (Native mic plugin
  // is a follow-up.)
  const [voiceCapture, setVoiceCapture] = useStateBSC('text'); // 'text' (dictate) | 'audio' (memo)
  const [voiceState, setVoiceState] = useStateBSC('idle');     // 'idle' | 'recording' | 'processing'
  const [voiceError, setVoiceError] = useStateBSC('');
  const [voiceSecs, setVoiceSecs] = useStateBSC(0);
  const [voiceMemo, setVoiceMemo] = useStateBSC(null);         // { url, secs } recorded audio memo
  const voiceRef = React.useRef({ rec: null, chunks: [], stream: null, timer: null, secs: 0 });
  const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const cleanupVoice = () => {
    const v = voiceRef.current;
    if (v.timer) { clearInterval(v.timer); v.timer = null; }
    try { v.stream && v.stream.getTracks().forEach((track) => track.stop()); } catch (e) {}
    v.stream = null; v.rec = null; v.chunks = [];
  };
  React.useEffect(() => () => cleanupVoice(), []);
  const removeMemo = () => { setVoiceMemo(m => { try { if (m && m.url) URL.revokeObjectURL(m.url); } catch (e) {} return null; }); };
  const dictate = async (blob) => {
    setVoiceState('processing');
    try {
      // Through the backend client (apiBaseUrl + Bearer): a root-relative
      // fetch never reaches the backend on the NATIVE build (no same origin,
      // no cookie). The app's locale and the meal vocabulary ride along.
      const stt = window.ShapeSupport && window.ShapeSupport.transcribeNote;
      if (!stt) { setVoiceError(tr('nutrition:log.errVoiceUnavailable', { defaultValue: 'Voice notes unavailable' })); return; }
      const r = await stt(blob, { filename: 'note.webm', context: 'meal', language: window.ShapeLocale?.get?.() });
      if (!r.ok) { setVoiceError(r.error || tr('nutrition:log.errTranscribe', { defaultValue: 'Could not transcribe' })); return; }
      const text = String(r.transcript || '').trim();
      if (text) { setNote(n => (n && n.trim() ? `${n.trim()} ${text}` : text)); window.__bsToast?.(tr('nutrition:log.toastAddedToNote', { defaultValue: 'Added to your note' }), 'ok'); }
      else setVoiceError(tr('nutrition:log.errNoCatch', { defaultValue: 'Didn’t catch that — try again' }));
    } catch (e) {
      setVoiceError(tr('nutrition:log.errVoiceUnavailable', { defaultValue: 'Voice notes unavailable' }));
    } finally {
      setVoiceState('idle');
    }
  };
  const startVoice = async () => {
    setVoiceError('');
    if (!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined')) {
      setVoiceError(tr('nutrition:log.errVoiceUnsupported', { defaultValue: 'Voice input isn’t supported here yet' })); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const v = voiceRef.current;
      v.stream = stream; v.rec = rec; v.chunks = []; v.secs = 0;
      const captureAtStart = voiceCapture;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) v.chunks.push(e.data); };
      rec.onstop = () => {
        const secs = v.secs;
        const blob = new Blob(v.chunks, { type: rec.mimeType || 'audio/webm' });
        cleanupVoice();
        if (!(blob.size > 0)) { setVoiceState('idle'); return; }
        if (captureAtStart === 'audio') {
          setVoiceMemo(m => { try { if (m && m.url) URL.revokeObjectURL(m.url); } catch (e) {} return { url: URL.createObjectURL(blob), secs, blob }; });
          window.__bsToast?.(tr('nutrition:log.toastMemoAttached', { defaultValue: 'Voice memo attached' }), 'ok');
          setVoiceState('idle');
        } else {
          dictate(blob);
        }
      };
      rec.start();
      setVoiceSecs(0);
      setVoiceState('recording');
      v.timer = setInterval(() => { v.secs += 1; setVoiceSecs(v.secs); }, 1000);
    } catch (e) {
      setVoiceError(tr('nutrition:log.errMicDenied', { defaultValue: 'Microphone access denied' })); cleanupVoice(); setVoiceState('idle');
    }
  };
  const stopVoice = () => {
    const v = voiceRef.current;
    if (v.timer) { clearInterval(v.timer); v.timer = null; }
    try { if (v.rec && v.rec.state !== 'inactive') v.rec.stop(); else { cleanupVoice(); setVoiceState('idle'); } }
    catch (e) { cleanupVoice(); setVoiceState('idle'); }
  };
  const toggleVoice = () => { if (voiceState === 'recording') stopVoice(); else if (voiceState === 'idle') startVoice(); };

  // Meal photo for the coach — capture (camera) or pick from the library. The
  // image rides along with the log to the coach via /api/nutrition/meal-note.
  // No on-device macro reading yet — Maya reviews the plate.
  const [photo, setPhoto] = useStateBSC(null); // { url, blob }
  const photoCamRef = React.useRef(null);
  const photoLibRef = React.useRef(null);
  const onPhotoPick = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // let the user re-pick the same file later
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { window.__bsToast?.(tr('nutrition:log.toastPickImage', { defaultValue: 'Pick an image' }), 'err'); return; }
    setPhoto(p => { try { if (p && p.url) URL.revokeObjectURL(p.url); } catch (err) {} return { url: URL.createObjectURL(file), blob: file }; });
    window.__bsToast?.(tr('nutrition:log.toastPhotoAttached', { defaultValue: 'Photo attached' }), 'ok');
  };
  const removePhoto = () => setPhoto(p => { try { if (p && p.url) URL.revokeObjectURL(p.url); } catch (err) {} return null; });

  // Edit / add an ingredient via a bottom sheet. editIng.index === null = new.
  const [editIng, setEditIng] = useStateBSC(null);
  const openEditIng = (i) => { const x = ings[i]; setEditIng({ index: i, name: x.name, qty: x.qty || '', kcal: x.kcal, p: x.p, c: x.c, f: x.f }); };
  const openAddIng = () => setEditIng({ index: null, name: '', qty: '', kcal: '', p: '', c: '', f: '' });
  const setEditIngField = (k, v) => setEditIng(e => (e ? { ...e, [k]: v } : e));
  const saveEditIng = () => {
    if (!editIng) return;
    const name = String(editIng.name || '').trim();
    if (!name) { window.__bsToast?.(tr('nutrition:log.toastAddName', { defaultValue: 'Add a name' }), 'err'); return; }
    const item = {
      name, qty: String(editIng.qty || '').trim() || '1 serving',
      kcal: Math.max(0, Math.round(Number(editIng.kcal) || 0)), p: Math.max(0, Math.round(Number(editIng.p) || 0)),
      c: Math.max(0, Math.round(Number(editIng.c) || 0)), f: Math.max(0, Math.round(Number(editIng.f) || 0)),
    };
    if (editIng.index == null) {
      setIngs(arr => [...arr, { ...item, id: bsIngId(), on: true }]);
      window.__bsToast?.(tr('nutrition:log.toastAdded', { defaultValue: 'Added {name}', name }), 'ok');
      // A search result added via the prefilled editor is still an add —
      // recents replay what was added (with any portion edits made here).
      if (editIng.fromSearch && signedIn) rememberFood(item);
    }
    else { const idx = editIng.index; setIngs(arr => arr.map((x, j) => (j === idx ? { ...x, ...item } : x))); window.__bsToast?.(tr('nutrition:log.toastIngUpdated', { defaultValue: 'Ingredient updated' }), 'ok'); }
    setEditIng(null);
  };
  const deleteEditIng = () => {
    if (editIng && editIng.index != null) { const idx = editIng.index; setIngs(arr => arr.filter((_, j) => j !== idx)); window.__bsToast?.(tr('nutrition:log.toastRemoved', { defaultValue: 'Removed' }), 'ok'); }
    setEditIng(null);
  };

  const sum = (k) => ings.reduce((a, x) => a + (x.on ? x[k] : 0), 0);
  const kcal = Math.round(sum('kcal') * portion);
  const P = Math.round(sum('p') * portion);
  const C = Math.round(sum('c') * portion);
  const F = Math.round(sum('f') * portion);
  // Day targets: real member targets when signed in (passed from the home ticker);
  // the demo goals are only the signed-out preview. null target → render "/ —".
  const CAL_GOAL = signedIn ? ((dayTargets && Number.isFinite(Number(dayTargets.cal))) ? Math.round(Number(dayTargets.cal)) : null) : 2100;
  const P_GOAL   = signedIn ? ((dayTargets && Number.isFinite(Number(dayTargets.protein))) ? Math.round(Number(dayTargets.protein)) : null) : 165;
  const DAY_BASE_CAL = 1568, DAY_BASE_P = 118;
  const hasPlanned = !!(meal && Number.isFinite(Number(meal.kcal)));
  const dirty = bsMealDirty(portion, ings, initialIngsRef.current);
  const ctaLabel = bsMealCtaLabel({ dirty, portion, kcal, hasPlanned }, { tr });
  const resetToPlan = () => { setPortion(1); setIngs(initialIngsRef.current.map((x) => ({ ...x }))); };
  const coachName = coach ? coach.name : (signedIn ? null : 'Dr. Maya');
  const coachAccent = t.isLight ? '#a07a2e' : '#d8b25a';
  // Real "day so far" for a signed-in account (today's snapshot, passed in); the
  // demo base is only for the signed-out preview. Title/eyebrow/planned/time all
  // reflect the actual meal being logged — never a hardcoded sample.
  const dayBaseCal = signedIn ? Math.max(0, Math.round(Number(daySoFar && daySoFar.cal) || 0)) : DAY_BASE_CAL;
  const dayBaseP = signedIn ? Math.max(0, Math.round(Number(daySoFar && daySoFar.protein) || 0)) : DAY_BASE_P;
  const dayCal = dayBaseCal + kcal;
  const dayP = dayBaseP + P;
  const mealTitle = (meal && meal.title) || (signedIn ? tr('nutrition:log.mealFallback', { defaultValue: 'Meal' }) : tr('nutrition:log.mealDemoTitle', { defaultValue: 'Chicken bowl + rice' }));
  const logTime = new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  // The demo line runs through the SAME template as a real planned meal — a
  // numbers-only key would be a second sentence for a translator to keep in step
  // with the first, for a preview that is otherwise identical.
  const plannedTpl = (k, p, c, f) => tr('nutrition:log.planned', { defaultValue: '{kcal} planned · {p}P · {c}C · {f}F', kcal: k, p, c, f });
  const plannedLine = (meal && Number.isFinite(Number(meal.kcal)))
    ? plannedTpl(Math.round(Number(meal.kcal)), Math.round(Number(meal.p) || 0), Math.round(Number(meal.c) || 0), Math.round(Number(meal.f) || 0))
    : (signedIn ? tr('nutrition:log.addWhatYouAte', { defaultValue: 'Add what you ate to log it' }) : plannedTpl(620, 48, 72, 14));
  const mealEyebrow = (meal && meal.tag)
    ? tr('nutrition:log.eyebrowPlanned', { defaultValue: '{tag} · Planned', tag: meal.tag })
    : (signedIn ? tr('nutrition:log.eyebrowFree', { defaultValue: 'Log a meal' }) : tr('nutrition:log.eyebrowDemo', { defaultValue: 'Lunch · Planned' }));
  // On log, deliver the written note + any voice memo to the client's
  // nutritionist (best-effort; the endpoint resolves the coach and no-ops when
  // there's nothing to send or no coach linked).
  const sendMealNote = () => {
    const hasNote = !!(note && note.trim());
    const hasMemo = !!(voiceMemo && voiceMemo.blob);
    const hasPhoto = !!(photo && photo.blob);
    if (!hasNote && !hasMemo && !hasPhoto) return;
    try {
      const fd = new FormData();
      if (hasNote) fd.append('note', note.trim());
      fd.append('mealTitle', mealTitle);
      fd.append('mealSummary', `${kcal} kcal · ${P}P · ${C}C · ${F}F`);
      if (hasMemo) fd.append('audio', voiceMemo.blob, 'memo.webm');
      if (hasPhoto) fd.append('photo', photo.blob, photo.blob.name || 'meal.jpg');
      // ⚠ SAY SO WHEN IT DOESN'T ARRIVE. This only ever toasted on success, so a
      // failed dispatch was indistinguishable from having no coach — which is how
      // a missing server function went unnoticed (2026-08-05 schema-drift audit).
      // Having no coach stays quiet; a real delivery failure does not.
      //
      // ⚠ THIS DOES NOT USE window.__bsToast, AND THAT IS THE WHOLE POINT. That
      // global is `() => {}` (iosAppBroadsheet.jsx — toasts were switched off
      // app-wide on 2026-06-03, #938), so the first version of this fix reported
      // every failure into a void: the route told the truth, the client branched on
      // it correctly, and the member still saw nothing. A confirm-sheet notice is
      // the mechanism proven to render — BSConfirmHost is mounted in both phone
      // branches, and bsAskConfirm falls back to the platform `confirm` when the
      // host has not mounted, so this cannot degrade back into silence.
      const noteNotice = (title, message) => {
        try {
          const ask = window.bsAskConfirm;
          if (typeof ask === 'function') {
            // Fire-and-forget: nothing branches on the acknowledgement. The
            // catch is not decoration — bsAskConfirm resolves through a Promise
            // whose executor calls setState, so a throw there would surface as
            // an unhandled rejection from a path whose whole job is to report a
            // failure quietly.
            Promise.resolve(ask({ notice: true, eyebrow: tr('feed:thread.yourCoach', { defaultValue: 'Your coach' }), title, message, confirmLabel: tr('nutrition:log.noticeOk', { defaultValue: 'Got it' }) })).catch(() => {});
            return;
          }
        } catch (e) {}
        try { window.__bsToast?.(title, 'warn'); } catch (e2) {}
      };
      // ⚠ THIS NOTICE SPEAKS ONLY FOR THE NOTE. It must never claim the meal log was
      // saved, and must never claim it wasn't. The sentence here first read "Your meal
      // log is saved — only the note didn't send", which is exactly backwards in the
      // state that reaches it most: doLog() fires this dispatch and the macro write as
      // two independent unawaited requests, and `logMealMacros` resolves to null on
      // EVERY failure with no queue and no retry (shapeBackend.js:4979-5005) — so one
      // offline moment, or one 402 from the requireMembership gate BOTH routes sit
      // behind, takes down both legs and the notice asserted the one thing that had
      // not happened. Worse, the assertion was worded to stop the member re-logging.
      //
      // ⚠ AND DO NOT "FIX" IT BY WARNING THAT THE LOG FAILED — three reasons, each
      // load-bearing. (1) A null from ShapeMealLog.log means "failed" OR "never
      // attempted": it returns null BEFORE issuing a request when signed out
      // (shapeBackend.js:4980) and the global may be absent outright, so a warning
      // keyed on it fires on the signed-out preview, which reaches this path — the
      // same never-attempted class as the no_coach branch below. (2) Awaiting the log
      // promise to find out is worse: its fetch carries no AbortController and no
      // timeout, so a hung socket would leave this notice unrendered, which is the
      // void-reporting bug the whole notice exists to end. (3) add_meal_macros is an
      // ACCUMULATING upsert with no idempotency key (2026-06-29-atomic-daily-snapshot-
      // accumulators.sql), so copy that nudges a re-log permanently double-counts the
      // day. Report the note; stay silent on what this path cannot observe.
      const noteFailed = () => noteNotice(
        tr('nutrition:log.noteFailedTitle', { defaultValue: 'We couldn’t reach your coach' }),
        tr('nutrition:log.noteFailedBody', { defaultValue: 'Your note didn’t send. Try again from your chat, or send it to them directly.' }),
      );
      bsMlApi.fetch('/api/nutrition/meal-note', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(r => r.json().catch(() => ({})))
        .then(d => {
          if (!d) { noteFailed(); return; }
          if (d.delivered) {
            // ⚠ DELIVERED IS NOT THE SAME AS COMPLETE, AND IT IS NOT THE SAME AS
            // COMPLETE FOR EVERY COACH. The memo/photo upload is best-effort
            // server-side (a failed one still sends the message, body reading
            // "recorded"/"added" instead of "attached"), and a member with two
            // coaches can have one leg land while the other fails. Those are
            // independent, so they are reported TOGETHER — an earlier version
            // returned inside the attachment case and swallowed failedCount, so a
            // member whose note reached one of two coaches was told about their
            // photo and nothing about the coach who never got it.
            const lostMemo = hasMemo && !d.audioAttached;
            const lostPhoto = hasPhoto && !d.photoAttached;
            const partial = Number(d.failedCount) > 0;
            if (lostMemo || lostPhoto || partial) {
              // Each clause is a WHOLE sentence fragment, and the two-slot joiner is
              // its own key — an English " and " between translated halves would read
              // as a bug in every locale that joins lists differently.
              const attach = lostMemo && lostPhoto ? tr('nutrition:log.partialBoth', { defaultValue: 'the voice memo and photo didn’t upload' })
                : lostMemo ? tr('nutrition:log.partialMemo', { defaultValue: 'the voice memo didn’t upload' })
                : lostPhoto ? tr('nutrition:log.partialPhoto', { defaultValue: 'the photo didn’t upload' })
                : '';
              const some = partial ? tr('nutrition:log.partialSomeCoaches', { defaultValue: 'it only reached some of your coaches' }) : '';
              const bits = [some, attach].filter(Boolean);
              // Same rule as noteFailed above — the second instance of the claim, which
              // the review did not name. Patching only the other one leaves it standing.
              const what = bits.length > 1 ? tr('nutrition:log.partialAnd', { defaultValue: '{a} and {b}', a: bits[0], b: bits[1] }) : bits[0];
              noteNotice(
                tr('nutrition:log.notePartialTitle', { defaultValue: 'Your note sent — partly' }),
                tr('nutrition:log.notePartialBody', { defaultValue: 'Your note went out, but {what}.', what }),
              );
              return;
            }
            // Fully delivered stays SILENT. A success popup is exactly the noise
            // #938 removed, and the member already sees the meal on their log.
            return;
          }
          if (d.reason === 'no_coach') return;
          noteFailed();
        })
        .catch(() => { noteFailed(); });
    } catch (e) {}
  };
  const doLog = () => {
    sendMealNote();
    // Persist the logged macros onto today's health snapshot so the Nutrition
    // stats (today vs target, adherence) reflect real logging — server-side
    // accumulating write; no-ops when signed out. The +10 Shape Score award
    // ({awarded, points}) rides back on the resolved value; show it only when
    // actually granted (first meal-log of the day), never on an already-earned day.
    // The write rides to onLogged, so a screen showing the day's food can read it again once it lands
    // (Home's Team fuel, Codex P2 on #2583).
    let write = null;
    try {
      const r = window.ShapeMealLog?.log?.({ kcal, protein: P, carbs: C, fat: F });
      if (r && typeof r.then === 'function') {
        write = r;
        r.then((d) => (d && d.awardPromise) || null)
         .then((a) => { if (a && a.awarded) setAward(a); })
         .catch(() => {});
      }
    } catch (e) {}
    onLogged(write);
    setLogged(true);
  };
  // The one tap's place on screen, and the two folds (a free log opens on the record, where its food
  // is added). Hooks, so they sit above the filed return.
  const oneTapRef = React.useRef(null);
  const oneTapInView = useBSMlInView(oneTapRef, hasPlanned && !dirty && !logged);
  const [fixOpen, setFixOpen] = useStateBSC(!hasPlanned);
  const [noteOpen, setNoteOpen] = useStateBSC(false);
  // ═══ THE LOOK (B, owner 2026-11-04) ═══════════════════════════════════════════════════════════
  const dark = !t.isLight;
  const SANS = BS_CLEAN_SANS, HEAD = BS_CLEAN_HEAD;
  const caps = (size, color, w, ls) => bsMlCaps(t, size, color, w, ls);
  const showOneTap = hasPlanned && !dirty;
  const showBarLog = !showOneTap || !oneTapInView;
  const macros = `${P}P · ${C}C · ${F}F`;
  const dayFrac = CAL_GOAL ? clamp01(dayCal / CAL_GOAL) : null;
  const setPortionTo = (v) => setPortion(Math.min(2, Math.max(0.25, Math.round(v * 4) / 4)));
  const glass = (radius) => bsMpGlass(t, t.INK, { radius });

  // The photo and voice disclosures under the note (the dispatch fold).
  const photoPanel = photoOpen && (
    <div style={{ marginTop: 10 }}>
      <input ref={photoCamRef} type="file" accept="image/*" capture="environment" onChange={onPhotoPick} style={{ display: 'none' }} />
      <input ref={photoLibRef} type="file" accept="image/*" onChange={onPhotoPick} style={{ display: 'none' }} />
      {photo ? (
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, overflow: 'hidden', position: 'relative' }}>
          <img src={photo.url} alt={tr('nutrition:log.yourMealAlt', { defaultValue: 'Your meal' })} style={{ display: 'block', width: '100%', maxHeight: 280, objectFit: 'cover' }} />
          <button onClick={removePhoto} aria-label={tr('nutrition:log.removePhoto', { defaultValue: 'Remove photo' })} style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 999, border: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 12px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.62))', color: '#fff', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>{tr('nutrition:log.sendsTo', { defaultValue: 'Sends to {coach} when you log', coach: coachName })}</div>
        </div>
      ) : (
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '34px 16px', textAlign: 'center' }}>
          <div style={{ fontSize: 30 }}>⊡</div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{tr('nutrition:log.snapOrUpload', { defaultValue: 'Snap or upload' })}</div>
          <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{tr('nutrition:log.reviewsPlate', { defaultValue: '{coach} reviews your plate', coach: coachName })}</div>
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
        <button onClick={() => photoCamRef.current && photoCamRef.current.click()} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: 0, background: teal, color: '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{photo ? tr('nutrition:log.retake', { defaultValue: 'Retake' }) : tr('nutrition:log.takePhoto', { defaultValue: 'Take photo' })}</button>
        <button onClick={() => photoLibRef.current && photoLibRef.current.click()} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('nutrition:log.upload', { defaultValue: 'Upload' })}</button>
      </div>
    </div>
  );
  const voicePanel = voiceOpen && (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
        {[['text', tr('nutrition:log.voiceToText', { defaultValue: 'Voice to text' })], ['audio', tr('nutrition:log.voiceRecord', { defaultValue: 'Voice record' })]].map(([k, l]) => {
          const on = voiceCapture === k;
          return (
            <button key={k} onClick={() => { if (voiceState !== 'idle') return; setVoiceCapture(k); setVoiceError(''); }} aria-pressed={on} style={{
              flex: 1, padding: '9px 8px', borderRadius: t.RADIUS_SM, cursor: 'pointer',
              border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}14` : 'transparent',
              color: on ? t.INK : t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
            }}>{l}</button>
          );
        })}
      </div>
      <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '24px 16px', textAlign: 'center' }}>
        {voiceCapture === 'audio' && voiceMemo && voiceState !== 'recording' ? (
          <div>
            <audio src={voiceMemo.url} controls style={{ width: '100%' }} />
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{tr('nutrition:log.memo', { defaultValue: 'Memo · {len}', len: fmtSecs(voiceMemo.secs) })}</span>
              <button onClick={removeMemo} style={{ background: 'transparent', border: 0, color: t.RUST, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('nutrition:log.remove', { defaultValue: 'Remove' })}</button>
            </div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('nutrition:log.sentWithLog', { defaultValue: 'Sent to your coach with this log' })}</div>
          </div>
        ) : (
          <>
            <button onClick={toggleVoice} disabled={voiceState === 'processing'} aria-label={voiceState === 'recording' ? tr('nutrition:log.stopRecordingAria', { defaultValue: 'Stop recording' }) : tr('nutrition:log.startSpeakingAria', { defaultValue: 'Start speaking' })} style={{
              width: 96, height: 96, margin: '0 auto', borderRadius: 999, border: 0, padding: 0,
              cursor: voiceState === 'processing' ? 'default' : 'pointer',
              opacity: voiceState === 'processing' ? 0.6 : 1,
              background: `radial-gradient(circle, ${teal} 0%, ${teal} 32%, ${teal}22 33%, transparent 70%)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              animation: voiceState === 'recording' ? 'bs-blink 1.1s ease-in-out infinite' : 'none',
            }}>
              {voiceState === 'recording'
                ? <span style={{ width: 24, height: 24, borderRadius: 6, background: '#04201d', display: 'block' }} />
                : <span style={{ width: 14, height: 14, borderRadius: 999, background: '#04201d', display: 'block' }} />}
            </button>
            <div style={{ marginTop: 16, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, fontWeight: 600, color: t.INK70, minHeight: 21, padding: `0 ${t.padX}px` }}>
              {voiceState === 'recording' ? tr('nutrition:log.listening', { defaultValue: 'Listening…' }) : voiceState === 'processing' ? tr('nutrition:log.transcribing', { defaultValue: 'Transcribing…' }) : (voiceCapture === 'text' ? tr('nutrition:log.speakHint', { defaultValue: 'Speak — it’s added to your note' }) : tr('nutrition:log.recordHint', { defaultValue: 'Record a memo for your coach' }))}
            </div>
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: voiceError ? t.RUST : t.INK50, fontWeight: 600 }}>
              {voiceError ? voiceError : voiceState === 'recording' ? tr('nutrition:log.tapToStop', { defaultValue: 'Tap to stop · {len}', len: fmtSecs(voiceSecs) }) : voiceState === 'processing' ? tr('nutrition:log.working', { defaultValue: 'Working…' }) : tr('nutrition:log.tapToSpeak', { defaultValue: 'Tap to speak' })}
            </div>
          </>
        )}
      </div>
    </div>
  );

  if (logged) {
    // Post the meal to the wire (signed in, by choice): the plate, not the ledger.
    const shareBlock = signedIn && typeof window !== 'undefined' && window.ShapeCommunity?.createPost && (
      <div style={{ textAlign: 'center', paddingBottom: 4 }}>
        {sharedPostId ? (
          <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal }}>{tr('nutrition:log.onTheWire', { defaultValue: '✓ On the wire · Community' })}</div>
        ) : (
          <button
            disabled={shareBusy}
            onClick={async () => {
              if (sharedPostId || shareBusy) return;
              setShareBusy(true);
              try {
                // The plate, not the ledger: this meal's post-portion macros
                // only. planned = a plan meal logged untouched; attribution
                // only when the meal really came from the plan/catalogue.
                const res = await window.ShapeCommunity.createPost(bsMealSharePayload({
                  name: mealTitle, kcal, p: P, c: C, f: F, portion,
                  planned: hasPlanned && !dirty,
                  recipeId: (meal && meal.recipeId) || '',
                  // Attribution comes from the meal's OWN plan coach (stamped
                  // by bsHomeLiveWeek from /api/client/plan), never the
                  // DM-thread `coach` state — that resolver can name a
                  // different person or still be in flight (review P2).
                  coach: (hasPlanned && meal && meal.coach) || '',
                }));
                if (res && res.stored === 'supabase' && res.data && res.data.id) {
                  setSharedPostId(res.data.id);
                  window.__bsToast?.(tr('nutrition:log.toastOnWire', { defaultValue: 'On the wire → Community' }), 'ok');
                } else {
                  window.__bsToast?.(tr('nutrition:log.toastPostFailed', { defaultValue: 'Could not post — try again.' }), 'err');
                }
              } catch (e) {
                window.__bsToast?.(tr('nutrition:log.toastPostFailed', { defaultValue: 'Could not post — try again.' }), 'err');
              }
              setShareBusy(false);
            }}
            style={{ background: 'transparent', border: 0, cursor: shareBusy ? 'default' : 'pointer', minHeight: 44, padding: '0 12px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: shareBusy ? t.INK50 : teal }}
          >{shareBusy ? tr('nutrition:log.posting', { defaultValue: 'Posting…' }) : tr('nutrition:log.postToWire', { defaultValue: 'Post to the wire →' })}</button>
        )}
      </div>
    );
    return (
      <BSPage mast={false}>
        {bsMlFiledStamp(t, tr, {
          mast: BSMastRow ? <BSMastRow trailing={null} /> : null,
          backRow: (trailing) => <BSBackRow onBack={onClose} trailing={trailing} />,
          eyebrow: tr('nutrition:log.filed', { defaultValue: 'Meal · Filed {time}', time: logTime }),
          kcal,
          meta: tr('nutrition:log.kcalLogged', { defaultValue: 'Kcal · {p}P · Logged ✓', p: P }),
          award: award && award.awarded ? tr('nutrition:log.award', { defaultValue: '+{pts} · Nutrition · Shape Score', pts: award.points != null ? award.points : 10 }) : null,
          day: { cal: dayCal, calGoal: CAL_GOAL, p: dayP, pGoal: P_GOAL },
          onDone: onClose,
          share: shareBlock,
        })}
      </BSPage>
    );
  }

  const ingNames = ings.filter((x) => x.on).map((x) => x.name).join(', ');
  const noteSummary = [note && note.trim() ? `“${note.trim()}”` : null,
    photo ? `${tr('nutrition:log.photoTab', { defaultValue: '⊡ Photo' })} ✓` : null,
    voiceMemo ? `${tr('nutrition:log.voiceTab', { defaultValue: '● Voice' })} ✓` : null].filter(Boolean).join(' · ');
  const stepBtn = (sym, d, off) => (
    <button type="button" onClick={() => setPortionTo(portion + d)} disabled={off} aria-label={`${tr('nutrition:log.portion', { defaultValue: 'Portion' })} ${sym}`} style={{ ...BARE, width: 44, height: 44, color: t.INK, opacity: off ? 0.3 : 1, cursor: off ? 'default' : 'pointer', fontFamily: SANS, fontSize: 19, fontWeight: 500, display: 'grid', placeItems: 'center' }}>{sym}</button>
  );

  return (
    <BSPage mast={false}>
      <BSCleanType t={t}>
        {/* The top bar: × Cancel, the sheet's name, the time it files at. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 10, padding: `${SHEET_TOP} ${t.padX}px 0` }}>
          <button type="button" onClick={onClose} style={{ ...BARE, justifySelf: 'start', minHeight: 44, ...caps(10, t.INK) }}>{tr('nutrition:log.cancel', { defaultValue: '× Cancel' })}</button>
          <span style={caps(9.5, teal, 800, '0.2em')}>{tr('nutrition:log.title', { defaultValue: 'Log meal' })}</span>
          <span style={{ justifySelf: 'end', ...caps(9.5, t.INK50, 700, '0.12em') }}>{logTime}</span>
        </div>

        {/* The hero: the meal and the one tap. The planned line shows once the record has moved off
            the plan (or for a free log), where it is something to compare against; on a meal as
            planned it would only repeat the bar. Adjusted, the pill gives way to the reset. */}
        <div style={{ padding: `10px ${t.padX}px 0` }}>
          <div data-meal-log="hero" style={{ ...bsRaised(t, teal), padding: '16px 16px 14px' }}>
            <div style={caps(8.5, t.INK50, 800, '0.2em')}>{mealEyebrow}</div>
            <div style={{ marginTop: 6, fontFamily: HEAD, fontSize: 24, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.1, color: t.INK }}>{mealTitle}</div>
            {(!hasPlanned || dirty) && <div style={{ marginTop: 5, fontFamily: SANS, fontSize: 12.5, color: t.INK50 }}>{plannedLine}</div>}
            {showOneTap && (
              <button ref={oneTapRef} type="button" data-meal-log="one-tap" onClick={doLog} style={{ ...bsMlPill(t), marginTop: 14, width: '100%', minHeight: 56, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '0 8px 0 20px', textAlign: 'left' }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', ...caps(7.5, TEAL_INK, 800, '0.2em'), opacity: 0.62 }}>{tr('nutrition:log.oneTap', { defaultValue: 'One tap' })}</span>
                  <span style={{ display: 'block', marginTop: 1, fontFamily: SANS, fontSize: 16, fontWeight: 700 }}>{tr('nutrition:log.ateAsPlanned', { defaultValue: 'Ate it as planned' })}</span>
                </span>
                <span aria-hidden="true" style={{ flex: 'none', width: 40, height: 40, borderRadius: 99, background: 'rgba(4,32,29,0.14)', display: 'grid', placeItems: 'center', fontSize: 17, fontWeight: 800 }}>✓</span>
              </button>
            )}
            {hasPlanned && dirty && (
              <button type="button" data-meal-log="reset" onClick={resetToPlan} style={{ marginTop: 12, width: '100%', minHeight: 46, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', cursor: 'pointer', color: t.INK70, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, fontFamily: SANS, fontSize: 13.5, fontWeight: 600 }}>
                <span aria-hidden="true" style={{ color: teal, fontSize: 15 }}>↺</span>{tr('nutrition:log.resetToPlan', { defaultValue: 'Adjusted — reset to plan' })}
              </button>
            )}
          </div>
        </div>

        {/* Correct the record — folded until asked for; a free log opens on it, where its food is added. */}
        {bsMlFold(t, { id: 'record', open: fixOpen, onToggle: () => setFixOpen((v) => !v), accent: teal,
          label: tr('nutrition:log.correctRecord', { defaultValue: 'Correct the record' }),
          summary: `${tr('nutrition:log.portion', { defaultValue: 'Portion' })} ${portion.toFixed(2)}× · ${ingNames}`,
          children: (<>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 58 }}>
              <span style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 500, color: t.INK }}>{tr('nutrition:log.portion', { defaultValue: 'Portion' })}</span>
              <span style={{ ...glass(999), display: 'inline-flex', alignItems: 'center' }}>
                {stepBtn('−', -0.25, portion <= 0.25)}
                <span style={{ minWidth: 54, textAlign: 'center', fontFamily: HEAD, fontSize: 15.5, fontWeight: 700, color: portion === 1 ? t.INK : teal, fontVariantNumeric: 'tabular-nums' }}>{portion.toFixed(2)}×</span>
                {stepBtn('＋', 0.25, portion >= 2)}
              </span>
            </div>
            <div style={{ ...caps(8, t.INK50, 800, '0.16em'), paddingTop: 4 }}>{tr('nutrition:log.ingredients', { defaultValue: 'Ingredients · tap to toggle' })}</div>
            {ings.map((x, i) => (
              <div key={x.id || x.name} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 56, borderBottom: `1px solid ${t.HAIR}` }}>
                <button type="button" onClick={() => toggle(i)} aria-pressed={x.on} aria-label={x.on ? tr('nutrition:log.excludeAria', { defaultValue: 'Exclude {name}', name: x.name }) : tr('nutrition:log.includeAria', { defaultValue: 'Include {name}', name: x.name })} style={{ ...BARE, width: 44, height: 44, marginLeft: -11, flex: 'none', display: 'grid', placeItems: 'center' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 7, boxSizing: 'border-box', border: `1.5px solid ${x.on ? teal : t.RULE}`, background: x.on ? teal : 'transparent', color: TEAL_INK, fontSize: 12, fontWeight: 800, display: 'grid', placeItems: 'center', boxShadow: x.on && dark ? `0 0 10px ${hexA(teal, 0.45)}` : 'none' }}>{x.on ? '✓' : ''}</span>
                </button>
                <div style={{ flex: 1, minWidth: 0, opacity: x.on ? 1 : 0.45 }}>
                  <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 600, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.name}</div>
                  <div style={{ marginTop: 2, fontFamily: SANS, fontSize: 12, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{tr('nutrition:log.foodMeta', { defaultValue: '{qty} · {kcal} kcal · {p}P', qty: x.qty, kcal: Math.round(x.kcal * portion), p: Math.round(x.p * portion) })}</div>
                </div>
                <button type="button" onClick={() => openEditIng(i)} style={{ ...BARE, flex: 'none', minHeight: 44, paddingLeft: 12, fontFamily: SANS, fontSize: 13, fontWeight: 650, color: teal }}>{tr('nutrition:log.edit', { defaultValue: 'Edit' })}</button>
              </div>
            ))}
            <button type="button" onClick={() => setShowAddFood(true)} style={{ ...BARE, width: '100%', minHeight: 46, textAlign: 'left', fontFamily: SANS, fontSize: 13.5, fontWeight: 650, color: teal }}>{tr('nutrition:log.addFoodCta', { defaultValue: '＋ Add — search foods or enter manually' })}</button>
          </>) })}

        {/* The note to the coach — hidden when signed in with no linked coach (the meal-note endpoint
            no-ops anyway). Folded, it reads what will ride along: the note, a photo, a voice memo. */}
        {(coach || !signedIn) && (
          bsMlFold(t, { id: 'dispatch', open: noteOpen, onToggle: () => setNoteOpen((v) => !v), accent: coachAccent,
            label: tr('nutrition:log.dispatchTo', { defaultValue: 'Dispatch to {coach}', coach: coachName }),
            summary: noteSummary || tr('nutrition:log.optional', { defaultValue: 'Optional' }),
            children: (<>
              <div style={{ ...glass(12), marginTop: 12, padding: '2px 12px' }}>
                <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder={tr('nutrition:log.notePlaceholder', { defaultValue: 'Felt a bit hungry still · swapped rice for sweet potato…' })} style={{ display: 'block', width: '100%', boxSizing: 'border-box', padding: '9px 0', border: 0, background: 'transparent', color: t.INK, fontFamily: SANS, fontSize: 14, lineHeight: 1.4, outline: 'none', resize: 'none' }} />
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                {[['photo', tr('nutrition:log.photoTab', { defaultValue: '⊡ Photo' }), photoOpen, () => { setPhotoOpen((v) => !v); setVoiceOpen(false); }, !!photo],
                  ['voice', tr('nutrition:log.voiceTab', { defaultValue: '● Voice' }), voiceOpen, () => { setVoiceOpen((v) => !v); setPhotoOpen(false); }, !!voiceMemo]].map(([k, label, open, onTap, attached]) => (
                  <button key={k} type="button" onClick={onTap} aria-pressed={open} style={{ ...glass(999), flex: 1, minHeight: 44, cursor: 'pointer', ...(open || attached ? { borderColor: hexA(coachAccent, 0.7) } : null), color: open || attached ? t.INK : t.INK70, fontFamily: SANS, fontSize: 13.5, fontWeight: 600 }}>{label}{attached ? ' ✓' : ''}</button>
                ))}
              </div>
              {photoPanel}
              {voicePanel}
            </>) })
        )}

        {/* Room for the bar, so the last fold never sits behind it. */}
        <div style={{ height: 112 }} />

        {/* The glass bar — the live tally always (the figures move as the record is corrected above it),
            and the log button once the pill is out of sight or the meal is adjusted: "Log as planned →"
            while it is as planned, the repriced "Log · 700 kcal · 1.25× →" once it is not. Always drawn,
            so the tab bar stays covered while the sheet is open. */}
        {createPortal((
          <div data-bs-clean="" style={{ display: 'contents' }}>
            <div data-meal-log="bar" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, zIndex: 5200, padding: `10px ${t.padX}px calc(12px + env(safe-area-inset-bottom, 0px))`, background: `${t.isLight ? 'linear-gradient(180deg, rgba(255,255,255,0.7), rgba(255,255,255,0.35))' : `linear-gradient(180deg, rgba(${t.inkRGB || '245,240,230'},0.07), rgba(${t.inkRGB || '245,240,230'},0.02))`}, ${t.PAPER}`, borderTop: `1px solid ${t.HAIR}`, boxShadow: t.isLight ? '0 -10px 24px -18px rgba(15,14,12,0.35)' : 'inset 0 1px 0 rgba(255,255,255,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48 }}>
                <div style={{ flex: 1, minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, whiteSpace: 'nowrap' }}>
                    <span style={{ fontFamily: HEAD, fontSize: 22, fontWeight: 750, lineHeight: 1, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', ...bsMpGradText(t, teal, t.INK) }}>{kcal}</span>
                    <span style={caps(8, t.INK50, 800, '0.16em')}>{tr('nutrition:log.kcalUnit', { defaultValue: 'KCAL' })}</span>
                    {!showBarLog && <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{macros}</span>}
                  </div>
                  <div style={{ marginTop: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ ...caps(8, t.INK50, 800, '0.14em'), fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{tr('nutrition:log.dayLabel', { defaultValue: 'DAY' })} <span style={{ color: t.INK }}>{dayCal}</span> / {CAL_GOAL != null ? CAL_GOAL : '—'}</span>
                    {dayFrac != null && !showBarLog && (
                      <span aria-hidden="true" style={{ display: 'flex', gap: 3 }}>
                        {Array.from({ length: 10 }).map((_, i) => { const on = (i + 0.5) / 10 <= dayFrac; return <span key={i} style={{ width: 5, height: 5, borderRadius: 99, background: on ? teal : t.RULE, boxShadow: on && dark ? `0 0 6px ${hexA(teal, 0.7)}` : 'none' }} />; })}
                      </span>
                    )}
                  </div>
                </div>
                {showBarLog && (
                  <button type="button" data-meal-log="bar-log" onClick={doLog} disabled={signedIn && kcal <= 0} style={{ ...(showOneTap ? bsMlPill(t) : { border: 0, cursor: 'pointer', borderRadius: 999, background: t.INK, color: t.PAPER }), flex: 'none', minHeight: 48, padding: '0 20px', ...((signedIn && kcal <= 0) ? { cursor: 'default', opacity: 0.45 } : null), fontFamily: SANS, fontSize: 14, fontWeight: 700 }}>{ctaLabel}</button>
                )}
              </div>
            </div>
          </div>
        ), phoneSurface())}
      </BSCleanType>

      {/* Add-food sheet — search recents or enter manually (replaces the old SEARCH tab). */}
      {showAddFood && (() => {
        const FOODS = [
          { name: 'Chipotle · chicken bowl', qty: '1 bowl',  kcal: 560, p: 42, c: 52, f: 18 },
          { name: 'Whey isolate',            qty: '1 scoop', kcal: 120, p: 25, c: 3,  f: 1  },
          { name: 'Jasmine rice',            qty: '1 cup',   kcal: 205, p: 4,  c: 45, f: 0  },
          { name: 'Grilled chicken breast',  qty: '6 oz',    kcal: 280, p: 52, c: 0,  f: 8  },
          { name: 'Greek yogurt · plain',    qty: '1 cup',   kcal: 150, p: 25, c: 9,  f: 4  },
          { name: 'Banana',                  qty: '1 medium',kcal: 105, p: 1,  c: 27, f: 0  },
          { name: 'Almonds',                 qty: '1 oz',    kcal: 165, p: 6,  c: 6,  f: 14 },
          { name: 'Olive oil',               qty: '1 tbsp',  kcal: 120, p: 0,  c: 0,  f: 14 },
        ];
        const q = foodQuery.trim().toLowerCase();
        // Signed-in members search the REAL hybrid food database (FDC + OFF via
        // /api/nutrition/food-search) with real user_goals recents; the demo
        // list (search + recents) is the signed-out preview only.
        const rows = q ? FOODS.filter(f => f.name.toLowerCase().includes(q)) : FOODS.slice(0, 3);
        const addFood = (f) => { setIngs(arr => [...arr, { id: bsIngId(), name: f.name, qty: f.qty, kcal: f.kcal, p: f.p, c: f.c, f: f.f, on: true }]); window.__bsToast?.(tr('nutrition:log.toastAdded', { defaultValue: 'Added {name}', name: f.name }), 'ok'); setShowAddFood(false); };
        // Live handlers — ＋ adds the provider's default serving directly; a tap
        // on the row body opens the ingredient editor prefilled so the portion
        // can be adjusted before it lands. Adds persist to real recents
        // (best-effort — a failed write never blocks the add).
        const addLiveFood = (f) => {
          setIngs(arr => [...arr, { id: bsIngId(), name: f.name, qty: f.qty || '1 serving', kcal: Math.round(Number(f.kcal) || 0), p: Math.round(Number(f.p) || 0), c: Math.round(Number(f.c) || 0), f: Math.round(Number(f.f) || 0), on: true }]);
          window.__bsToast?.(tr('nutrition:log.toastAdded', { defaultValue: 'Added {name}', name: f.name }), 'ok');
          setShowAddFood(false);
          rememberFood(f);
        };
        const editLiveFood = (f) => {
          setShowAddFood(false);
          // fromSearch: the editor's save persists this add to recents too.
          setEditIng({ index: null, fromSearch: true, name: f.name, qty: f.qty || '', kcal: String(Math.round(Number(f.kcal) || 0)), p: String(Math.round(Number(f.p) || 0)), c: String(Math.round(Number(f.c) || 0)), f: String(Math.round(Number(f.f) || 0)) });
        };
        // Barcode → one OFF product → the prefilled ingredient editor (the
        // member confirms the portion before it lands — same contract as a
        // search-row tap). Honest states for invalid / not-found / outage.
        // Stale-guarded like the text search: a new lookup (or the sheet
        // closing) ABORTS the prior request, and every post-await update is
        // gated on this call still being the live one — a late response can
        // never reopen a dismissed sheet or win over a newer code.
        const lookupBarcode = async (raw) => {
          const code = bsValidBarcode(raw);
          if (!code) { setBarcodeStatus('invalid'); return; }
          try { barcodeCtlRef.current?.abort(); } catch (e) {}
          const ctl = new AbortController();
          barcodeCtlRef.current = ctl;
          setBarcodeStatus('looking');
          setBarcodeMode((m) => (m === 'scan' ? null : m)); // a scanned hit stops the camera
          try {
            const data = await window.ShapeFoodSearch?.barcode?.(code, { signal: ctl.signal });
            if (ctl.signal.aborted || barcodeCtlRef.current !== ctl) return;
            const row = data && Array.isArray(data.results) ? data.results[0] : null;
            if (row) { setBarcodeStatus('idle'); setBarcodeDigits(''); setBarcodeMode(null); editLiveFood(row); return; }
            setBarcodeStatus(data && data.unavailable ? 'error' : 'notfound');
          } catch (e) {
            if (ctl.signal.aborted || barcodeCtlRef.current !== ctl) return;
            setBarcodeStatus('error');
          }
        };
        const searching = foodQuery.trim().length >= 2;
        const liveRows = searching ? (foodResults || []) : (foodRecents || []);
        const liveStatus = foodStatus === 'searching' ? tr('nutrition:log.searching', { defaultValue: 'Searching…' })
          : foodStatus === 'error' ? tr('nutrition:log.searchError', { defaultValue: 'Can’t reach the food database — enter manually below' })
          : searching ? tr('nutrition:log.results', { defaultValue: '{n, plural, one {# result} other {# results}}', n: liveRows.length })
          : (foodRecents === null || liveRows.length ? tr('nutrition:log.recents', { defaultValue: 'Recents' }) : tr('nutrition:log.noRecents', { defaultValue: 'No recents yet — search or enter manually' }));
        return createPortal((
          <div onClick={() => setShowAddFood(false)} style={{ position: 'absolute', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
            <div ref={bsDialogRef(() => setShowAddFood(false))} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -16px 40px rgba(0,0,0,0.35)', maxHeight: '80%', overflowY: 'auto' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, marginBottom: 12 }}>{tr('nutrition:log.addFood', { defaultValue: 'Add food' })}</div>
              {signedIn ? (
                <>
                  <input autoFocus value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder={tr('nutrition:log.searchPlaceholder', { defaultValue: 'Search foods & brands…' })} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, outline: 'none' }} />
                  {/* Barcode (v2) — scan where BarcodeDetector exists (Chrome /
                      Android WebView); the manual digits entry everywhere
                      (iOS WebKit ships no BarcodeDetector). */}
                  <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 18 }}>
                    {bsBarcodeScanSupported() && (
                      <button onClick={() => { setBarcodeStatus('idle'); setBarcodeMode(barcodeMode === 'scan' ? null : 'scan'); }} style={{ background: 'transparent', border: 0, padding: '6px 0', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: barcodeMode === 'scan' ? teal : t.INK50 }}>{tr('nutrition:log.scanBarcode', { defaultValue: '▥ Scan barcode' })}</button>
                    )}
                    <button onClick={() => { setBarcodeStatus('idle'); setBarcodeMode(barcodeMode === 'enter' ? null : 'enter'); }} style={{ background: 'transparent', border: 0, padding: '6px 0', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: barcodeMode === 'enter' ? teal : t.INK50 }}>{tr('nutrition:log.enterBarcode', { defaultValue: '# Enter barcode' })}</button>
                    {barcodeMode && <button onClick={() => { setBarcodeMode(null); setBarcodeStatus('idle'); }} style={{ marginLeft: 'auto', background: 'transparent', border: 0, padding: '6px 0', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{tr('nutrition:log.cancelPlain', { defaultValue: 'Cancel' })}</button>}
                  </div>
                  {barcodeMode === 'scan' && <BSBarcodeScan teal={teal} onHit={(code) => lookupBarcode(code)} onFallback={() => setBarcodeMode('enter')} />}
                  {barcodeMode === 'enter' && (
                    <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
                      <input value={barcodeDigits} onChange={(e) => setBarcodeDigits(e.target.value.replace(/[^\d\s-]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter') lookupBarcode(barcodeDigits); }} inputMode="numeric" placeholder={tr('nutrition:log.barcodePlaceholder', { defaultValue: 'Barcode digits (EAN / UPC)…' })} aria-label={tr('nutrition:log.barcodeAria', { defaultValue: 'Barcode digits' })} style={{ flex: 1, minWidth: 0, boxSizing: 'border-box', padding: '11px 13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 14, outline: 'none' }} />
                      <button onClick={() => lookupBarcode(barcodeDigits)} disabled={barcodeStatus === 'looking'} style={{ flex: '0 0 auto', minHeight: 44, padding: '0 16px', borderRadius: t.RADIUS_SM, border: 0, background: teal, color: '#08221f', cursor: barcodeStatus === 'looking' ? 'default' : 'pointer', opacity: barcodeStatus === 'looking' ? 0.6 : 1, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tr('nutrition:log.lookUp', { defaultValue: 'Look up' })}</button>
                    </div>
                  )}
                  {barcodeStatus !== 'idle' && (
                    <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: barcodeStatus === 'looking' ? t.INK50 : t.RUST }}>
                      {barcodeStatus === 'looking' ? tr('nutrition:log.lookingUp', { defaultValue: 'Looking up…' })
                        : barcodeStatus === 'invalid' ? tr('nutrition:log.barcodeInvalid', { defaultValue: 'That doesn’t read as a barcode — 8–14 digits' })
                        : barcodeStatus === 'notfound' ? tr('nutrition:log.barcodeNotFound', { defaultValue: 'No match for that barcode — search or enter it manually' })
                        : tr('nutrition:log.barcodeError', { defaultValue: 'Can’t reach the food database — try again or enter manually' })}
                    </div>
                  )}
                  <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: foodStatus === 'error' ? t.RUST : t.INK50 }}>{liveStatus}</div>
                  <div style={{ marginTop: 2 }}>
                    {liveRows.map((r, i) => (
                      <div key={r.id || `${r.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '4px 0', borderBottom: i === liveRows.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                        <button onClick={() => editLiveFood(r)} style={{ flex: 1, minWidth: 0, minHeight: 44, textAlign: 'left', background: 'transparent', border: 0, padding: '9px 0', cursor: 'pointer' }}>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name}</div>
                          <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.brand ? `${r.brand} · ` : ''}{tr('nutrition:log.foodMeta', { defaultValue: '{qty} · {kcal} kcal · {p}P', qty: r.qty, kcal: r.kcal, p: r.p })}</div>
                        </button>
                        <button onClick={() => addLiveFood(r)} aria-label={tr('nutrition:log.addAria', { defaultValue: 'Add {name}', name: r.name })} style={{ flex: '0 0 auto', minWidth: 44, minHeight: 44, background: 'transparent', border: 0, color: teal, cursor: 'pointer', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>＋</button>
                      </div>
                    ))}
                    {searching && foodStatus === 'done' && liveRows.length === 0 && <div style={{ padding: '16px 0', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>{tr('nutrition:log.noMatches', { defaultValue: 'No matches for “{q}”.', q: foodQuery.trim() })}</div>}
                  </div>
                </>
              ) : (
                <>
                  <input autoFocus value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder={tr('nutrition:log.searchPlaceholderDemo', { defaultValue: 'Search foods, brands, barcodes…' })} style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, outline: 'none' }} />
                  <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{q ? tr('nutrition:log.results', { defaultValue: '{n, plural, one {# result} other {# results}}', n: rows.length }) : tr('nutrition:log.recents', { defaultValue: 'Recents' })}</div>
                  <div style={{ marginTop: 2 }}>
                    {rows.map((r, i) => (
                      <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i === rows.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.name}</div>
                          <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('nutrition:log.foodMeta', { defaultValue: '{qty} · {kcal} kcal · {p}P', qty: r.qty, kcal: r.kcal, p: r.p })}</div>
                        </div>
                        <button onClick={() => addFood(r)} aria-label={tr('nutrition:log.addAria', { defaultValue: 'Add {name}', name: r.name })} style={{ flex: '0 0 auto', minWidth: 44, minHeight: 44, background: 'transparent', border: 0, color: teal, cursor: 'pointer', fontSize: 22, fontWeight: 700, lineHeight: 1 }}>＋</button>
                      </div>
                    ))}
                    {q && rows.length === 0 && <div style={{ padding: '16px 0', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>{tr('nutrition:log.noMatches', { defaultValue: 'No matches for “{q}”.', q: foodQuery.trim() })}</div>}
                  </div>
                </>
              )}
              <button onClick={() => { setShowAddFood(false); openAddIng(); }} style={{ marginTop: 12, width: '100%', padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{tr('nutrition:log.enterManually', { defaultValue: 'Enter manually →' })}</button>
            </div>
          </div>
        ), phoneSurface());
      })()}

      {/* Ingredient editor / add sheet */}
      {editIng && (() => {
        const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, outline: 'none' };
        return createPortal((
          <div onClick={() => setEditIng(null)} style={{ position: 'absolute', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
            <div ref={bsDialogRef(() => setEditIng(null))} role="dialog" aria-modal="true" onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -16px 40px rgba(0,0,0,0.35)' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, marginBottom: 12 }}>{editIng.index == null ? tr('nutrition:log.addIngredient', { defaultValue: 'Add ingredient' }) : tr('nutrition:log.editIngredient', { defaultValue: 'Edit ingredient' })}</div>
              <input autoFocus value={editIng.name} placeholder={tr('nutrition:log.ingredientPlaceholder', { defaultValue: 'Ingredient' })} onChange={(e) => setEditIngField('name', e.target.value)} style={inputStyle} />
              <input value={editIng.qty} placeholder={tr('nutrition:log.portionPlaceholder', { defaultValue: 'Portion · e.g. 1 cup' })} onChange={(e) => setEditIngField('qty', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                {[['kcal', tr('cook:plated.kcal', { defaultValue: 'Kcal' })], ['p', tr('cook:plated.protein', { defaultValue: 'Protein' })], ['c', tr('cook:plated.carbs', { defaultValue: 'Carbs' })], ['f', tr('cook:plated.fat', { defaultValue: 'Fat' })]].map(([k, l]) => (
                  <label key={k} style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 4 }}>{l}</span>
                    <input value={editIng[k]} inputMode="numeric" placeholder="0" onChange={(e) => setEditIngField(k, e.target.value.replace(/[^0-9]/g, ''))} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 6px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 13, fontWeight: 700, outline: 'none', textAlign: 'center' }} />
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {editIng.index != null && <button onClick={deleteEditIng} style={{ padding: '13px 14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RUST}`, background: 'transparent', color: t.RUST, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{tr('nutrition:log.remove', { defaultValue: 'Remove' })}</button>}
                <button onClick={() => setEditIng(null)} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{tr('nutrition:log.cancelPlain', { defaultValue: 'Cancel' })}</button>
                <button onClick={saveEditIng} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{tr('nutrition:log.save', { defaultValue: 'Save' })}</button>
              </div>
            </div>
          </div>
        ), phoneSurface());
      })()}
    </BSPage>
  );
}

// Shared "Logged." confirmation screen — used after one-tap logging a meal
// from the preview (and mirrors the log-meal flow's confirmation).
// `p` has NO default: an omitted prop must stay undefined so the stamp renders
// an honest "—" (a `= 0` default would fabricate "0P" for unknown protein —
// the Number(null)/?? 0 zero-fabrication class). `p || 0` guards the arithmetic.
export function BSMealLogged({ kcal = null, p, time = '12:40 PM', logged = null, onDone = () => {}, onUndo = () => {}, share = null }) {
  const { useBS, BSPage, BSMastRow, BSMeCorner } = window;
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // ⚠ AN UNKNOWN CALORIE COUNT IS NOT ZERO, AND `Logged ✓` OVER IT IS A CLAIM
  // NOTHING BACKED. The cook's own logIt OMITS the log entirely when kcal is
  // null ("never posted as fabricated 0s"), so this screen was printing a 46px
  // teal 0 under a filed stamp while the ledger had received nothing. Reachable
  // for the first time by member-imported recipes, which carry no macros by
  // construction. The `—` is the idiom already sitting beside it for protein.
  // ⚠ INFERENCE IS THE DEFAULT, NOT THE RULE. Cook mode's logIt skips the post
  // when kcal is null, so there `kcal != null` IS whether a row was written —
  // but the plan-meal path posts unconditionally, and a screen that denied a
  // log the app had just made would put two surfaces in disagreement about the
  // same meal. A caller that knows says so.
  const didLog = logged == null ? kcal != null : !!logged;
  // Share-by-choice (spec 2026-07-12): a deliberate per-meal action, default
  // off, never auto. The created postId persists here so Undo can retract the
  // post; the button disables while pending (no double-posts). Signed-in only
  // — the demo preview never shows it.
  const [sharedPostId, setSharedPostId] = useStateBSC(null);
  const [shareBusy, setShareBusy] = useStateBSC(false);
  const canShare = !!(share && typeof window !== 'undefined' && window.ShapeCommunity && window.ShapeCommunity.createPost
    && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user);
  const doShare = async () => {
    if (sharedPostId || shareBusy || !canShare) return;
    setShareBusy(true);
    try {
      const res = await window.ShapeCommunity.createPost(bsMealSharePayload(share));
      // createCommunityPost returns { stored: 'local', … } WITHOUT throwing
      // when the insert didn't reach Supabase — only a real stored row is a
      // success (CodeRabbit: never a fake ✓ over a local fallback).
      if (res && res.stored === 'supabase' && res.data && res.data.id) {
        setSharedPostId(res.data.id);
        window.__bsToast?.(tr('nutrition:log.toastOnWire', { defaultValue: 'On the wire → Community' }), 'ok');
      } else {
        window.__bsToast?.(tr('nutrition:log.toastPostFailed', { defaultValue: 'Could not post — try again.' }), 'err');
      }
    } catch (e) {
      window.__bsToast?.(tr('nutrition:log.toastPostFailed', { defaultValue: 'Could not post — try again.' }), 'err');
    }
    setShareBusy(false);
  };
  const handleUndo = async () => {
    // Undo retracts the shared POST (a retracted meal never leaves a ghost
    // card). Gated on shareBusy — a fast Undo mid-post would orphan the
    // just-created row (CodeRabbit). A failed delete is told honestly — the
    // post stays deletable from the feed card's own menu; we never claim
    // it's gone when it isn't. The log-side macro reversal is the
    // pre-existing Undo gap — out of scope here (spec, review rounds).
    if (shareBusy) return;
    if (sharedPostId && window.ShapeCommunity?.remove) {
      try { await window.ShapeCommunity.remove({ postId: sharedPostId }); }
      catch (e) { window.__bsToast?.('Could not remove the post — delete it from the feed card.', 'err'); }
    }
    onUndo();
  };
  // Day-so-far demo bases are the SIGNED-OUT preview only — a signed-in
  // member gets no fabricated day figures here (this shared confirmation has
  // no live day feed; the log-meal flow's own confirmation carries the real
  // ones). Honest absence over invented numbers.
  const loggedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const CAL_GOAL = 2100, P_GOAL = 165, DAY_BASE_CAL = 1568, DAY_BASE_P = 118;
  const dayCal = DAY_BASE_CAL + (kcal || 0);
  const dayP = DAY_BASE_P + (p || 0);
  const pTxt = p == null ? '—' : p;
  // ⚠ THE COOKED STAMP AND "No macros on this one" ARE STILL ENGLISH: the honest states above have no
  // catalog keys yet (keying them is its own cut, the inventory's note). Everything else here reads
  // the log flow's keys, which say the same words.
  return (
    <BSPage>
      {bsMlFiledStamp(t, tr, {
        mast: BSMastRow ? <BSMastRow trailing={BSMeCorner ? <BSMeCorner /> : null} /> : null,
        backRow: (trailing) => (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            {/* Undo is not this page's Back: it retracts the log (and a shared post), so it is its own
                button in the back slot, never the shared row a swipe would also fire. */}
            <button type="button" data-meal-log="undo" onClick={handleUndo} disabled={shareBusy} style={{ ...BARE, minHeight: 44, cursor: shareBusy ? 'default' : 'pointer', opacity: shareBusy ? 0.5 : 1, display: 'inline-flex', alignItems: 'center', gap: 6, ...bsMlCaps(t, 9, t.INK, 800, '0.14em') }}><span aria-hidden="true" style={{ fontSize: 11 }}>←</span>{tr('cook:ck.undo', { defaultValue: 'Undo' })}</button>
            {trailing}
          </div>
        ),
        eyebrow: didLog ? tr('nutrition:log.filed', { defaultValue: 'Meal · Filed {time}', time }) : <>Meal · Cooked {time}</>,
        kcal: didLog ? kcal : '—',
        meta: didLog ? tr('nutrition:log.kcalLogged', { defaultValue: 'Kcal · {p}P · Logged ✓', p: pTxt }) : <>Kcal · {pTxt}P · No macros on this one</>,
        day: loggedIn ? null : { cal: dayCal, calGoal: CAL_GOAL, p: dayP, pGoal: P_GOAL },
        onDone,
        share: canShare ? (
          <div style={{ textAlign: 'center', paddingBottom: 4 }}>
            {sharedPostId ? (
              <div style={{ minHeight: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', ...bsMlCaps(t, 9.5, teal, 800, '0.16em') }}>{tr('nutrition:log.onTheWire', { defaultValue: '✓ On the wire · Community' })}</div>
            ) : (
              <button type="button" onClick={doShare} disabled={shareBusy} style={{ ...BARE, cursor: shareBusy ? 'default' : 'pointer', minHeight: 44, padding: '0 12px', ...bsMlCaps(t, 9.5, shareBusy ? t.INK50 : teal, 800, '0.16em') }}>{shareBusy ? tr('nutrition:log.posting', { defaultValue: 'Posting…' }) : tr('nutrition:log.postToWire', { defaultValue: 'Post to the wire →' })}</button>
            )}
          </div>
        ) : null,
      })}
    </BSPage>
  );
}
