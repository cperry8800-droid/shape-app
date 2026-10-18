import React from 'react';
// ─── THE DAILY CHECK-IN, ONE CARD ON HOME ────────────────────────────────────
// Owner, 2026-10-18: "lets think of a way to redesign this page and process on app to make it
// easier to update each day and less effort for user each day", then design A of the preview
// (docs/REVIEW-2026-10-18-daily-checkin.md, rulings in §5): the check-in lives on Home as one
// card, one question at a time, and EVERY TAP SAVES. There is no Log today button to forget, and
// leaving halfway keeps what was answered.
//
//   energy → hunger → sleep (+ rested, optional; or Skip) → one line: Checked in ✓ · the streak · Edit
//
// ⚠ FIVE WORDS, STORED ON THE OLD 1-10 SCALE AS 2 · 4 · 6 · 8 · 10. Every reader of
// daily_health_snapshot keeps working unchanged: the coach's case file, roster triage, the
// engine's energy_low (≤ 4) and hunger_high (≥ 8), the correlations. A value written by the old
// 1-10 gauge reads back as its nearest word (bsCiWordIndex).
//
// ⚠ SAME AS YESTERDAY COPIES YESTERDAY'S OWN VALUES, never their words: a 7 stays a 7. Sleep is
// copied only when yesterday's was entered by hand, so a wearable's night is never re-typed as
// the member's own.
//
// ⚠ IT ASKS FROM 4 A.M. LOCAL, NOT MIDNIGHT: at 1 a.m. "last night" has not been slept.
//
// ⚠ A FAILED SAVE SAYS SO IN THE CARD. Toasts are a no-op app-wide (BSToastHost), so the answer
// is put back and a line under the question says it was not saved.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx): this file
// is a static import of the client module and evaluates before that module's body has run.

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

// ── The rules, kept pure so they can be driven ───────────────────────────────

export const BS_CI_ASK_FROM_HOUR = 4;
export const BS_CI_STORED = [2, 4, 6, 8, 10];

// A stored 1-10 value → its word (0..4): 1-2 → 0, 3-4 → 1, 5-6 → 2, 7-8 → 3, 9-10 → 4.
export function bsCiWordIndex(v) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.max(0, Math.min(4, Math.ceil(Math.min(10, n) / 2) - 1));
}

export function bsCiIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function bsCiShift(iso, days) {
  const [y, m, d] = iso.split('-').map(Number);
  return bsCiIso(new Date(y, m - 1, d + days, 12));
}

// One day's answers off the progress series ({ date, value } points per metric). `device` is
// true when a wearable reported that night (efficiency / resting HR / HRV — a manual log never
// writes those), which is the only honest sign the hours were not typed.
export function bsCiDay(series, iso) {
  const at = (k) => {
    const p = ((series && series[k]) || []).find((s) => s && s.date === iso);
    const n = p ? Number(p.value) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const device = at('sleepEfficiency') != null || at('restingHr') != null || at('hrv') != null;
  return { energy: at('energy'), hunger: at('hunger'), sleep: at('sleep'), rested: at('sleepQuality'), device };
}

// A day counts as checked in from a MANUAL answer only — the rule BSTodayCard keeps:
// a wearable syncing sleep alone never makes a check-in.
export function bsCiAnswered(day) {
  return !!day && (day.energy != null || day.hunger != null || day.rested != null || (day.sleep != null && !day.device));
}

// A night a wearable reported: hours on a day with device-only metrics. A watch that reported a
// resting heart rate but no night is not one, and its member is asked like anyone else.
export function bsCiWornNight(day) {
  return !!day && !!day.device && day.sleep != null;
}

// The next question for today, or 'done'. A night that already has hours (a wearable's or typed)
// needs no question, and neither does one the member skipped today (a member who does not track
// sleep is not asked "3 of 3" all day).
export function bsCiStep(today, sleepSkipped) {
  if (!today || today.energy == null) return 'energy';
  if (today.hunger == null) return 'hunger';
  if (today.sleep == null && !sleepSkipped) return 'sleep';
  return 'done';
}

// Skipping the night is remembered on this device for the rest of the local day.
function bsCiSkipKey(uid) { return `shape.checkin.sleepSkip.${uid || 'preview'}`; }
function bsCiReadSkip(uid, iso) { try { return window.localStorage.getItem(bsCiSkipKey(uid)) === iso; } catch (e) { return false; } }
function bsCiWriteSkip(uid, iso) { try { window.localStorage.setItem(bsCiSkipKey(uid), iso); } catch (e) { /* the skip still holds until the app closes */ } }

// Consecutive days with a manual answer, ending today, or yesterday while today is still open.
export function bsCiStreak(series, todayIso) {
  let iso = bsCiAnswered(bsCiDay(series, todayIso)) ? todayIso : bsCiShift(todayIso, -1);
  let n = 0;
  while (n < 400 && bsCiAnswered(bsCiDay(series, iso))) { n += 1; iso = bsCiShift(iso, -1); }
  return n;
}

// The member's usual night: the median of the last 14 nights they have, to the half hour,
// within the stepper's 3-12h. 7h 30 when there is nothing to go on.
export function bsCiUsualNight(series, todayIso) {
  const nights = [];
  for (let i = 1; i <= 14; i += 1) {
    const s = bsCiDay(series, bsCiShift(todayIso, -i)).sleep;
    if (s != null && s > 0) nights.push(s);
  }
  if (!nights.length) return 7.5;
  nights.sort((a, b) => a - b);
  const mid = nights.length % 2 ? nights[(nights.length - 1) / 2] : (nights[nights.length / 2 - 1] + nights[nights.length / 2]) / 2;
  return Math.max(3, Math.min(12, Math.round(mid * 2) / 2));
}

// What "Same as yesterday" writes for today: yesterday's own values for the questions today has
// not answered. Null when yesterday has no energy and hunger to copy.
export function bsCiSamePatch(yesterday, today) {
  if (!yesterday || yesterday.energy == null || yesterday.hunger == null) return null;
  const t = today || {};
  const patch = {};
  if (t.energy == null) patch.energy = yesterday.energy;
  if (t.hunger == null) patch.hunger = yesterday.hunger;
  if (t.sleep == null && yesterday.sleep != null && !yesterday.device) {
    patch.sleepHours = yesterday.sleep;
    if (t.rested == null && yesterday.rested != null) patch.sleepQuality = yesterday.rested;
  }
  return Object.keys(patch).length ? patch : null;
}

export function bsCiHM(h) {
  const n = Number(h);
  if (!Number.isFinite(n)) return '—';
  const hh = Math.floor(n);
  const mm = Math.round((n - hh) * 60);
  return mm ? `${hh}h ${String(mm).padStart(2, '0')}` : `${hh}h`;
}

// One save at a time: two quick taps would otherwise both find no row for today and both insert.
let bsCiQueue = Promise.resolve();
function bsCiSave(patch) {
  const run = bsCiQueue.then(() => window.ShapeCheckin.log(patch));
  bsCiQueue = run.catch(() => {});
  return run;
}

// ── The card ─────────────────────────────────────────────────────────────────

export function BSCheckinCard({ onOpen }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const amber = t.isLight ? '#b9802a' : '#e8b14a';
  const blue = t.BLUE || (t.isLight ? '#3a6ea5' : '#5b9bd5');
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const signedIn = !!uid;
  const now = new Date();
  const todayIso = bsCiIso(now);

  // Signed out, the card previews the flow on a sample yesterday and saves nothing.
  const [today, setToday] = useState({ energy: null, hunger: null, sleep: null, rested: null, device: false });
  const [yesterday, setYesterday] = useState(signedIn ? null : { energy: 8, hunger: 6, sleep: 7.5, rested: 8, device: false });
  const [usual, setUsual] = useState(7.5);
  const [streakBefore, setStreakBefore] = useState(0); // the run through yesterday; today adds one once answered
  const [editing, setEditing] = useState(null);   // a step reopened by Edit, or null
  const [sleepH, setSleepH] = useState(null);     // the stepper, before it is confirmed
  const [restedPick, setRestedPick] = useState(null);
  const [water, setWater] = useState(signedIn ? null : { l: 1.25, target: 3 }); // { l, target }; a sample in the preview
  const [err, setErr] = useState(null);           // the last write that failed, said in the card
  const [skippedDay, setSkippedDay] = useState(() => (bsCiReadSkip(uid, todayIso) ? todayIso : null)); // the day the night was skipped
  // Signed in, nothing is asked until today's answers are read: a tap on a card that has not
  // loaded would be overwritten by the read. A failed read asks anyway (every tap still saves).
  const [ready, setReady] = useState(!signedIn || !window.ShapeProgress?.progress);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // The newest answer per field, numbered, so an older save that fails never undoes a newer one.
  const latest = useRef({ n: 0 });

  useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    window.ShapeProgress.progress().then((p) => {
      if (!on) return;
      if (p && p.series) {
        const day = bsCiDay(p.series, todayIso);
        setToday(day);
        setYesterday(bsCiDay(p.series, bsCiShift(todayIso, -1)));
        setUsual(bsCiUsualNight(p.series, todayIso));
        setStreakBefore(bsCiStreak(p.series, todayIso) - (bsCiAnswered(day) ? 1 : 0));
      }
      setReady(true);
    }).catch(() => { if (on) setReady(true); });
    return () => { on = false; };
  }, [signedIn, todayIso]);

  useEffect(() => {
    if (!signedIn || !window.ShapeHydration?.get) return undefined;
    let on = true;
    window.ShapeHydration.get().then((d) => {
      if (on && d && d.ok) setWater({ l: Number(d.hydrationL) || 0, target: Number(d.targetL) || 3 });
    }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);

  if (!ready) return null;
  const step = editing || bsCiStep(today, skippedDay === todayIso);
  if (step !== 'done' && now.getHours() < BS_CI_ASK_FROM_HOUR) return null;

  // Save one answer: shown at once, written in the background. Signed out nothing is written, and
  // the done line says so instead of claiming a check-in.
  // ⚠ A FAILED SAVE PUTS BACK ONLY ITS OWN ANSWERS, and only where no newer answer has replaced
  // them (Codex P2 on #2398): an answer queued behind it may still save, and putting back the
  // whole day would hide an answer that is stored.
  const answer = (patch, next) => {
    const before = today;
    const merged = { ...today };
    const fields = [];
    if (patch.energy != null) { merged.energy = patch.energy; fields.push('energy'); }
    if (patch.hunger != null) { merged.hunger = patch.hunger; fields.push('hunger'); }
    if (patch.sleepHours != null) { merged.sleep = patch.sleepHours; fields.push('sleep'); }
    if (patch.sleepQuality != null) { merged.rested = patch.sleepQuality; fields.push('rested'); }
    const mine = {};
    for (const k of fields) { latest.current.n += 1; latest.current[k] = latest.current.n; mine[k] = latest.current.n; }
    setToday(merged);
    setEditing(next);
    setErr(null);
    if (!signedIn) return;
    const undo = (msg) => {
      setToday((cur) => {
        const back = { ...cur };
        for (const k of fields) if (latest.current[k] === mine[k]) back[k] = before[k];
        return back;
      });
      setEditing(null);
      setErr(msg);
    };
    if (!window.ShapeCheckin?.log) { undo('unavailable'); return; }
    bsCiSave(patch).catch(() => { if (alive.current) undo('failed'); });
  };
  const streak = streakBefore + (bsCiAnswered(today) ? 1 : 0);
  // Edit walks every question again; a night a wearable reported is not re-asked.
  const afterEnergy = () => (editing ? 'hunger' : null);
  const afterHunger = () => (editing && !bsCiWornNight(today) ? 'sleep' : null);

  const sameScale = (prefix, words, color, current, onPick) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
      {words.map((w, i) => {
        const on = bsCiWordIndex(current) === i;
        return (
          <button key={`${prefix}${i}`} type="button" aria-pressed={on} onClick={() => onPick(BS_CI_STORED[i])} style={{
            minHeight: 60, borderRadius: 4, cursor: 'pointer', padding: '6px 2px',
            border: `1px solid ${on ? color : t.RULE}`, background: on ? color : 'transparent', color: on ? t.PAPER : t.INK,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 7,
          }}>
            <span aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
              {[0, 1, 2, 3, 4].map((b) => <span key={b} style={{ width: 3, height: 4 + b * 3, background: b <= i ? (on ? t.PAPER : color) : t.RULE }} />)}
            </span>
            <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.15 }}>{w}</span>
          </button>
        );
      })}
    </div>
  );

  const E = [0, 1, 2, 3, 4].map((i) => tr(`home:checkin.e${i}`, { defaultValue: ['Drained', 'Low', 'OK', 'Good', 'Great'][i] }));
  const H = [0, 1, 2, 3, 4].map((i) => tr(`home:checkin.h${i}`, { defaultValue: ['Not hungry', 'A little', 'Normal', 'Hungry', 'Starving'][i] }));
  const R = [0, 1, 2, 3, 4].map((i) => tr(`home:checkin.r${i}`, { defaultValue: ['Wrecked', 'Tired', 'OK', 'Rested', 'Fresh'][i] }));
  const word = (list, v) => { const i = bsCiWordIndex(v); return i == null ? null : list[i]; };

  const same = editing ? null : bsCiSamePatch(yesterday, today);
  const sameLine = yesterday ? [word(E, yesterday.energy), word(H, yesterday.hunger), yesterday.sleep != null && !yesterday.device ? bsCiHM(yesterday.sleep) : null].filter(Boolean).join(' · ') : '';
  const stepNo = { energy: 1, hunger: 2, sleep: 3 }[step];
  const sleepFromUsual = sleepH == null && !(today.sleep != null && !today.device);
  const sleepValue = sleepH != null ? sleepH : (sleepFromUsual ? usual : today.sleep);
  const restedValue = restedPick != null ? restedPick : today.rested;
  const glassL = t.isMetric ? 0.25 : 0.2366;

  const addGlass = () => {
    if (!water) return;
    const before = water;
    setWater({ ...water, l: Math.round((water.l + glassL) * 1000) / 1000 });
    setErr(null);
    if (!signedIn) return; // the preview counts locally and saves nothing
    if (!window.ShapeHydration?.add) { setWater(before); setErr('water'); return; }
    window.ShapeHydration.add(glassL).then((d) => { if (alive.current && d && d.ok) setWater((w) => ({ ...(w || before), l: Number(d.hydrationL) || 0 })); }).catch(() => {
      if (!alive.current) return;
      setWater(before);
      setErr('water');
    });
  };

  const mono = { fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
  const question = (text, color) => (
    <h2 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 300, letterSpacing: '-0.02em', lineHeight: 1.1, color: t.INK }}>
      <span aria-hidden style={{ width: 12, height: 3, background: color, flex: 'none' }} />{text}
    </h2>
  );

  return (
    <div data-bs-checkin-card="" style={{ margin: `10px ${t.padX}px 4px`, padding: '13px 13px 11px', border: `1px solid ${step === 'done' ? t.RULE : `${teal}66`}`, background: t.PAPER2 || t.PAPER, clipPath: 'polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ ...mono, color: teal }}>
          {step === 'done' ? tr('home:today.checkinLabel', { defaultValue: 'Check-in' }) : tr('home:bulletin.checkin', { defaultValue: 'Check-in due' })}
        </span>
        {stepNo ? (
          <span style={{ ...mono, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50 }}>{tr('home:checkin.stepOf', { defaultValue: '{n} of {total}', n: stepNo, total: 3 })}</span>
        ) : null}
      </div>

      {step === 'energy' ? (
        <>
          {question(tr('home:checkin.askEnergy', { defaultValue: "How's your energy?" }), teal)}
          {sameScale('e', E, teal, today.energy, (v) => answer({ energy: v }, afterEnergy()))}
        </>
      ) : null}

      {step === 'hunger' ? (
        <>
          {question(tr('home:checkin.askHunger', { defaultValue: 'How hungry are you?' }), amber)}
          {sameScale('h', H, amber, today.hunger, (v) => answer({ hunger: v }, afterHunger()))}
        </>
      ) : null}

      {step === 'sleep' ? (
        <>
          {question(tr('home:checkin.askSleep', { defaultValue: 'How did you sleep?' }), blue)}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <button type="button" aria-label={tr('home:checkin.less', { defaultValue: 'Thirty minutes less' })} onClick={() => setSleepH(Math.max(3, sleepValue - 0.5))} style={{ width: 46, height: 46, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 22, cursor: 'pointer' }}>−</button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 36, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{bsCiHM(sleepValue)}</div>
              <div style={{ ...mono, marginTop: 4, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{sleepFromUsual ? tr('home:checkin.usualNight', { defaultValue: 'Your usual night' }) : '\u00a0'}</div>
            </div>
            <button type="button" aria-label={tr('home:checkin.more', { defaultValue: 'Thirty minutes more' })} onClick={() => setSleepH(Math.min(12, sleepValue + 0.5))} style={{ width: 46, height: 46, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 22, cursor: 'pointer' }}>+</button>
          </div>
          <div style={{ ...mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{tr('home:checkin.restedOptional', { defaultValue: 'Rested? · optional' })}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 5 }}>
            {R.map((w, i) => {
              const on = bsCiWordIndex(restedValue) === i;
              return (
                <button key={`r${i}`} type="button" aria-pressed={on} onClick={() => setRestedPick(on ? null : BS_CI_STORED[i])} style={{ minHeight: 36, borderRadius: 4, cursor: 'pointer', padding: '4px 2px', border: `1px solid ${on ? blue : t.RULE}`, background: on ? blue : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{w}</button>
              );
            })}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={() => { answer({ sleepHours: sleepValue, ...(restedValue != null ? { sleepQuality: restedValue } : {}) }, null); setSleepH(null); setRestedPick(null); }} style={{ flex: 1, minHeight: 46, borderRadius: 4, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', ...mono, fontSize: 10 }}>{tr('home:checkin.sleepConfirm', { defaultValue: "That's right ✓" })}</button>
            <button type="button" onClick={() => { bsCiWriteSkip(uid, todayIso); setSkippedDay(todayIso); setEditing(null); setSleepH(null); setRestedPick(null); setErr(null); }} style={{ minHeight: 46, padding: '0 14px', borderRadius: 4, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', ...mono, fontSize: 9 }}>{tr('home:checkin.skip', { defaultValue: 'Skip' })}</button>
          </div>
        </>
      ) : null}

      {err ? (
        <div role="alert" style={{ fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.35, color: t.RUST }}>
          {err === 'water' ? tr('home:today.waterFailed', { defaultValue: 'Could not log water — try again' })
            : err === 'unavailable' ? tr('home:today.checkinUnavailable', { defaultValue: 'Check-in is unavailable — try again' })
            : tr('home:today.checkinFailed', { defaultValue: 'Could not save check-in — try again' })}
        </div>
      ) : null}

      {same && step !== 'done' ? (
        <button type="button" onClick={() => answer(same, null)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, minHeight: 44, padding: '8px 10px', borderRadius: 4, border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', textAlign: 'left' }}>
          <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <span style={{ ...mono, fontSize: 8.5, color: teal }}>{tr('home:checkin.same', { defaultValue: 'Same as yesterday' })}</span>
            <span style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>{sameLine}</span>
          </span>
          <span aria-hidden style={{ fontFamily: t.MONO, fontSize: 14, color: teal }}>✓</span>
        </button>
      ) : null}

      {step === 'done' ? (
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: signedIn ? 21 : 16, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: t.INK }}>
              {signedIn ? <>{tr('home:checkin.done', { defaultValue: 'Checked in' })} <span style={{ color: teal }}>✓</span></> : tr('home:today.joinToSave', { defaultValue: 'Join Shape to save your check-in' })}
            </div>
            <div style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>
              {[
                today.energy != null ? `${tr('home:today.energy', { defaultValue: 'Energy' })} ${word(E, today.energy)}` : null,
                today.hunger != null ? `${tr('home:today.hunger', { defaultValue: 'Hunger' })} ${word(H, today.hunger)}` : null,
                today.sleep != null ? `${tr('home:today.sleep', { defaultValue: 'Sleep' })} ${bsCiHM(today.sleep)}` : null,
                today.rested != null ? word(R, today.rested) : null,
              ].filter(Boolean).join(' · ')}
            </div>
            {signedIn && streak >= 2 ? (
              <div style={{ ...mono, fontSize: 8.5, color: amber }}>{tr('home:checkin.streak', { defaultValue: '{n, plural, one {# day running} other {# days running}}', n: streak })}</div>
            ) : null}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 'none' }}>
            <button type="button" onClick={() => { setEditing('energy'); setSleepH(null); setRestedPick(null); }} style={{ minHeight: 34, padding: '5px 11px', borderRadius: 4, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', ...mono, fontSize: 8.5 }}>{tr('home:action.edit', { defaultValue: 'Edit' })}</button>
            {onOpen ? <button type="button" onClick={onOpen} style={{ minHeight: 30, padding: '4px 0', border: 0, background: 'transparent', color: t.INK50, cursor: 'pointer', ...mono, fontSize: 8.5 }}>{tr('home:checkin.details', { defaultValue: 'Details →' })}</button> : null}
          </div>
        </div>
      ) : null}

      <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${t.HAIR}`, paddingTop: 9 }}>
        <span style={{ ...mono, fontSize: 8.5, color: teal }}>{tr('home:checkin.water', { defaultValue: 'Water' })}</span>
        <span style={{ flex: 1, fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>
          {water ? (t.isMetric ? `${Math.round(water.l * 100) / 100} / ${water.target} L` : `${Math.round(water.l * 33.814)} / ${Math.round(water.target * 33.814)} oz`) : '—'}
        </span>
        <button type="button" onClick={addGlass} disabled={!water} style={{ minHeight: 32, padding: '4px 10px', borderRadius: 4, border: `1px solid ${teal}80`, background: `${teal}14`, color: teal, cursor: water ? 'pointer' : 'default', opacity: water ? 1 : 0.5, ...mono, fontSize: 8.5, letterSpacing: '0.1em' }}>{tr('home:checkin.addGlass', { defaultValue: '+ Glass' })}</button>
      </div>
    </div>
  );
}
