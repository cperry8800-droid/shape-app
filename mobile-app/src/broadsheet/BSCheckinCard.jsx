import React from 'react';
import { createPortal } from 'react-dom';
// ─── THE DAILY CHECK-IN: A CARD ON HOME, AND A WALKTHROUGH ───────────────────────────────────────
// Owner, 2026-10-18: "lets think of a way to redesign this page and process on app to make it
// easier to update each day and less effort for user each day" (docs/REVIEW-2026-10-18-daily-
// checkin.md, rulings in §5), then, on the first build: "have it be a step by step, almost like a
// tutorial that walks through each check", with the member's own answers from the days before
// under every step. EVERY TAP SAVES: there is no Log button to forget, and leaving halfway keeps
// what was answered.
//
//   Home card: Start check-in →  ·  Same as yesterday (the whole day in one tap)
//   Walkthrough: Energy → Hunger → Sleep (+ Rested, optional; or Skip) → Water → the summary
//   Each step: what the check is and why it is asked, the answers, and the last 7 days.
//   Done: one line on Home — Checked in ✓ · the streak · Edit (the summary) · Details (the page)
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
// ⚠ A FAILED SAVE SAYS SO ON SCREEN. Toasts are a no-op app-wide (BSToastHost), so the answer is
// put back and a line says it was not saved.
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

// The seven days before today, oldest first: the strip under every step. Water is the day's total.
export function bsCiWeek(series, todayIso) {
  const out = [];
  for (let i = 7; i >= 1; i -= 1) {
    const iso = bsCiShift(todayIso, -i);
    const w = ((series && series.hydration) || []).find((p) => p && p.date === iso);
    const water = w ? Number(w.value) : NaN;
    out.push({ iso, ...bsCiDay(series, iso), water: Number.isFinite(water) && water > 0 ? water : null });
  }
  return out;
}

// The word (0..4) a week was mostly answered with: more than half of at least three answered days.
// Null otherwise, and the strip then says nothing rather than guess at a trend.
export function bsCiMostly(values) {
  const idx = (values || []).map(bsCiWordIndex).filter((i) => i != null);
  if (idx.length < 3) return null;
  const counts = [0, 0, 0, 0, 0];
  for (const i of idx) counts[i] += 1;
  const best = counts.indexOf(Math.max(...counts));
  return counts[best] * 2 > idx.length ? best : null;
}

// The signed-out preview's week: a sample, never saved.
function bsCiSampleWeek(todayIso) {
  const e = [null, 8, 8, 4, 10, 8, 8];
  const h = [null, 6, 6, 4, 6, 8, 6];
  const s = [null, 7.33, 7.5, 5.83, 7.83, 6.67, 7.17];
  const w = [null, 2.25, 2.75, 1.5, 3, 2, 2.5];
  return e.map((_, i) => ({ iso: bsCiShift(todayIso, i - 7), energy: e[i], hunger: h[i], sleep: s[i], rested: null, device: false, water: w[i] }));
}

// A water read that failed: + Glass still works, because the add answers with the server's running
// total, and the screen says "—" until it has one (Codex P2 on #2398).
const BS_CI_WATER_UNKNOWN = { l: 0, target: 3, unknown: true };

// One save at a time: two quick taps would otherwise both find no row for today and both insert.
// Water has its own line, so a glass never waits on a check-in answer.
// ⚠ A QUEUED SAVE BELONGS TO THE ACCOUNT AND THE DAY THAT MADE IT (Codex P1 and P2 on #2398). The
// write goes out under whoever is signed in, dated by the data layer, when it leaves the queue. So
// a member who answers on a slow connection and signs out would otherwise have the answer saved to
// the next member's day, and a tap just before midnight to tomorrow. A save whose turn comes after
// either changed is dropped, and rejects like any failed save.
const bsCiLines = { checkin: Promise.resolve(), water: Promise.resolve() };
function bsCiCurrentUid() { return window.ShapeAuth?.getCachedState?.()?.user?.id || null; }
function bsCiEnqueue(line, uid, send) {
  const day = bsCiIso(new Date());
  const run = bsCiLines[line].then(() => {
    if (bsCiCurrentUid() !== uid) throw new Error('signed-in account changed');
    if (bsCiIso(new Date()) !== day) throw new Error('the local day changed');
    return send();
  });
  bsCiLines[line] = run.catch(() => {});
  return run;
}
function bsCiSave(patch, uid) { return bsCiEnqueue('checkin', uid, () => window.ShapeCheckin.log(patch)); }

// ── The card, and the walkthrough it opens ───────────────────────────────────

const BS_CI_STEPS = ['energy', 'hunger', 'sleep', 'water'];

function BSCheckinDay({ onOpen, dayIso }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const amber = t.isLight ? '#b9802a' : '#e8b14a';
  const blue = t.BLUE || (t.isLight ? '#3a6ea5' : '#5b9bd5');
  const sky = t.isLight ? '#1f7fb0' : '#4fb3e8';
  const COLOR = { energy: teal, hunger: amber, sleep: blue, water: sky };
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const signedIn = !!uid;
  const now = new Date();
  const todayIso = dayIso; // the one local day this card belongs to (BSCheckinCard, below)

  // Signed out, the card previews the flow on a sample week and saves nothing.
  const [today, setToday] = useState({ energy: null, hunger: null, sleep: null, rested: null, device: false });
  const [yesterday, setYesterday] = useState(signedIn ? null : { energy: 8, hunger: 6, sleep: 7.17, rested: 8, device: false });
  const [week, setWeek] = useState(() => (signedIn ? [] : bsCiSampleWeek(todayIso)));
  const [usual, setUsual] = useState(7.5);
  const [streakBefore, setStreakBefore] = useState(0); // the run through yesterday; today adds one once answered
  const [walk, setWalk] = useState(null);         // the walkthrough's screen: 0-3 a check, 4 the summary; null closed
  const [fromSummary, setFromSummary] = useState(false); // a Change from the summary goes back to it
  const [sleepH, setSleepH] = useState(null);     // the stepper, before Next saves it
  const [restedPick, setRestedPick] = useState(null);
  const [water, setWater] = useState(signedIn ? null : { l: 0, target: 3 }); // { l, target }; the preview starts dry
  const [err, setErr] = useState(null);           // the last write that failed, said on screen
  const [skippedDay, setSkippedDay] = useState(() => (bsCiReadSkip(uid, todayIso) ? todayIso : null)); // the day the night was skipped
  // Signed in, nothing is asked until today's answers are read: a tap on a card that has not
  // loaded would be overwritten by the read. A failed read asks anyway (every tap still saves).
  // A new local day mounts a new card (BSCheckinCard, below), so this gate, like every other piece
  // of state here, only ever holds this card's own day.
  const [ready, setReady] = useState(!signedIn || !window.ShapeProgress?.progress);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);
  // The newest answer per field, numbered, so an older save that fails never undoes a newer one.
  const latest = useRef({ n: 0 });
  const failures = useRef(0); // check-in saves that failed, so Details can tell whether to leave
  // Litres added on screen whose save has not answered yet: the server's total plus these is what shows.
  const waterPending = useRef(0);
  const [, bump] = useState(0); // a re-render, for a tap that finds its day already over

  useEffect(() => {
    if (!signedIn || !window.ShapeProgress?.progress) return undefined;
    let on = true;
    // A read that fails still opens the card, on its own empty day.
    window.ShapeProgress.progress().then((p) => {
      if (!on) return;
      if (p && p.series) {
        const day = bsCiDay(p.series, todayIso);
        setToday(day);
        setYesterday(bsCiDay(p.series, bsCiShift(todayIso, -1)));
        setWeek(bsCiWeek(p.series, todayIso));
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
      if (!on) return;
      setWater(d && d.ok ? { l: Number(d.hydrationL) || 0, target: Number(d.targetL) || 3 } : BS_CI_WATER_UNKNOWN);
    }).catch(() => { if (on) setWater(BS_CI_WATER_UNKNOWN); });
    return () => { on = false; };
  }, [signedIn]);

  // A card whose day is over shows nothing and saves nothing; Home's next render mounts the new day's.
  if (bsCiIso(now) !== todayIso) return null;
  if (!ready) return null;
  const sleepSkipped = skippedDay === todayIso;
  const status = bsCiStep(today, sleepSkipped);
  if (walk == null && status !== 'done' && now.getHours() < BS_CI_ASK_FROM_HOUR) return null;

  // Save one answer: shown at once, written in the background. Signed out nothing is written, and
  // the done line says so instead of claiming a check-in.
  // ⚠ A FAILED SAVE PUTS BACK ONLY ITS OWN ANSWERS, and only where no newer answer has replaced
  // them (Codex P2 on #2398): an answer queued behind it may still save, and putting back the
  // whole day would hide an answer that is stored.
  const answer = (patch) => {
    if (bsCiIso(new Date()) !== todayIso) { bump((n) => n + 1); return; }
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
    setErr(null);
    if (!signedIn) return;
    const undo = (msg) => {
      setToday((cur) => {
        const back = { ...cur };
        for (const k of fields) if (latest.current[k] === mine[k]) back[k] = before[k];
        return back;
      });
      failures.current += 1;
      setErr(msg);
    };
    if (!window.ShapeCheckin?.log) { undo('unavailable'); return; }
    bsCiSave(patch, uid).catch(() => { if (alive.current) undo('failed'); });
  };
  const streak = streakBefore + (bsCiAnswered(today) ? 1 : 0);

  const glassL = t.isMetric ? 0.25 : 0.2366;
  // ⚠ GLASSES SAVE ONE AT A TIME, AND A FAILED ONE TAKES BACK ONLY ITSELF (Codex P2 on #2398): two
  // quick taps used to race, and a failed first one put back the total over a second that saved.
  // Each answer is the server's running total, so the screen shows it plus what is still on its way.
  const addWater = (glasses) => {
    if (bsCiIso(new Date()) !== todayIso) { bump((n) => n + 1); return; }
    if (!water) return;
    const deltaL = Math.round(glassL * glasses * 10000) / 10000;
    const round = (l) => Math.round(Math.max(0, l) * 1000) / 1000;
    setWater((w) => ({ ...w, l: round(w.l + deltaL) }));
    setErr(null);
    if (!signedIn) return; // the preview counts locally and saves nothing
    if (!window.ShapeHydration?.add) { setWater((w) => ({ ...w, l: round(w.l - deltaL) })); setErr('water'); return; }
    waterPending.current += deltaL;
    bsCiEnqueue('water', uid, () => window.ShapeHydration.add(deltaL)).then((d) => {
      waterPending.current -= deltaL;
      if (alive.current && d && d.ok) setWater((w) => ({ ...w, l: round((Number(d.hydrationL) || 0) + waterPending.current), unknown: false }));
    }).catch(() => {
      waterPending.current -= deltaL;
      if (!alive.current) return;
      setWater((w) => ({ ...w, l: round(w.l - deltaL) }));
      setErr('water');
    });
  };

  // ⚠ DETAILS WAITS FOR THE SAVES ON THEIR WAY (Codex P2 on #2398). Leaving at once unmounts this
  // card, so the page would read the metrics cache from before the save, and a save that then
  // failed could no longer say so. It opens once they have settled, and stays here if one failed.
  const openDetails = () => {
    const before = failures.current;
    bsCiLines.checkin.then(() => { if (alive.current && failures.current === before) onOpen(); });
  };

  // ── walkthrough navigation ──
  const reset = () => { setSleepH(null); setRestedPick(null); setErr(null); };
  const open = (i, back) => { reset(); setFromSummary(!!back); setWalk(i); };
  const close = () => { reset(); setFromSummary(false); setWalk(null); };
  const next = () => {
    setSleepH(null); setRestedPick(null);
    if (fromSummary) { setFromSummary(false); setWalk(4); return; }
    setWalk((i) => (i == null ? i : Math.min(4, i + 1)));
  };
  const back = () => { setSleepH(null); setRestedPick(null); setFromSummary(false); setWalk((i) => (i == null ? i : Math.max(0, i - 1))); };
  const waterKnown = !!(water && !water.unknown);
  const answered = { energy: today.energy != null, hunger: today.hunger != null, sleep: today.sleep != null || sleepSkipped, water: waterKnown && water.l > 0 };
  const firstOpen = () => { const i = BS_CI_STEPS.findIndex((k) => k !== 'water' && !answered[k]); return i < 0 ? 3 : i; };

  const E = [0, 1, 2, 3, 4].map((i) => tr(`home:checkin.e${i}`, { defaultValue: ['Drained', 'Low', 'OK', 'Good', 'Great'][i] }));
  const H = [0, 1, 2, 3, 4].map((i) => tr(`home:checkin.h${i}`, { defaultValue: ['Not hungry', 'A little', 'Normal', 'Hungry', 'Starving'][i] }));
  const R = [0, 1, 2, 3, 4].map((i) => tr(`home:checkin.r${i}`, { defaultValue: ['Wrecked', 'Tired', 'OK', 'Rested', 'Fresh'][i] }));
  const word = (list, v) => { const i = bsCiWordIndex(v); return i == null ? null : list[i]; };
  const NAME = {
    energy: tr('home:today.energy', { defaultValue: 'Energy' }),
    hunger: tr('home:today.hunger', { defaultValue: 'Hunger' }),
    sleep: tr('home:today.sleep', { defaultValue: 'Sleep' }),
    water: tr('home:checkin.water', { defaultValue: 'Water' }),
  };
  const litres = (l) => (t.isMetric ? `${Math.round(l * 100) / 100} L` : `${Math.round(l * 33.814)} oz`);
  const target = water ? water.target : 3;

  const same = bsCiSamePatch(yesterday, today);
  const sameLine = yesterday ? [word(E, yesterday.energy), word(H, yesterday.hunger), yesterday.sleep != null && !yesterday.device ? bsCiHM(yesterday.sleep) : null].filter(Boolean).join(' · ') : '';
  const wornNight = bsCiWornNight(today);
  const sleepFromUsual = sleepH == null && !(today.sleep != null && !today.device);
  const sleepValue = sleepH != null ? sleepH : (sleepFromUsual ? usual : today.sleep);
  const restedValue = restedPick != null ? restedPick : today.rested;

  const mono = { fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
  const btnPrimary = { flex: 1, minHeight: 52, borderRadius: 5, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', ...mono, fontSize: 10.5, letterSpacing: '0.14em' };
  const btnGhost = { minHeight: 52, padding: '0 18px', borderRadius: 5, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', ...mono, fontSize: 10, letterSpacing: '0.14em' };
  const errLine = err ? (
    <div role="alert" style={{ fontFamily: t.BODY, fontSize: 12.5, lineHeight: 1.35, color: t.RUST }}>
      {err === 'water' ? tr('home:today.waterFailed', { defaultValue: 'Could not log water — try again' })
        : err === 'unavailable' ? tr('home:today.checkinUnavailable', { defaultValue: 'Check-in is unavailable — try again' })
        : tr('home:today.checkinFailed', { defaultValue: 'Could not save check-in — try again' })}
    </div>
  ) : null;

  // The five-word answers, as tiles with a rising bar.
  const tiles = (prefix, words, color, current, onPick) => (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 7 }}>
      {words.map((w, i) => {
        const on = bsCiWordIndex(current) === i;
        return (
          <button key={`${prefix}${i}`} type="button" aria-pressed={on} onClick={() => onPick(BS_CI_STORED[i])} style={{
            minHeight: 72, borderRadius: 5, cursor: 'pointer', padding: '6px 2px',
            border: `1px solid ${on ? color : t.RULE}`, background: on ? color : 'transparent', color: on ? t.PAPER : t.INK,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 9,
          }}>
            <span aria-hidden style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 18 }}>
              {[0, 1, 2, 3, 4].map((b) => <span key={b} style={{ width: 3.5, height: 5 + b * 3.2, background: b <= i ? (on ? t.PAPER : color) : t.RULE }} />)}
            </span>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', textAlign: 'center', lineHeight: 1.15 }}>{w}</span>
          </button>
        );
      })}
    </div>
  );

  // The last seven days under a step. `onPick` reuses a day's answer; `tip` and `trend` frame it.
  const locale = window.ShapeI18n?.intlLocale?.() || undefined;
  const strip = (kind, color, tip, trend, onPick) => (
    <div data-bs-checkin-week={kind} style={{ borderTop: `1px solid ${t.HAIR}`, paddingTop: 13, marginTop: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, marginBottom: 9 }}>
        <span style={{ ...mono, color: t.INK50 }}>{tr('home:checkin.last7', { defaultValue: 'Your last 7 days' })}</span>
        {tip ? <span style={{ fontFamily: t.BODY, fontSize: 11.5, color: t.INK50, textAlign: 'right' }}>{tip}</span> : null}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 3 }}>
        {week.map((d, i) => {
          const v = d[kind];
          const has = v != null;
          const pct = !has ? 0 : kind === 'sleep' ? Math.min(1, v / 10) : kind === 'water' ? Math.min(1, v / (target || 3)) : ((bsCiWordIndex(v) || 0) + 1) / 5;
          const label = !has ? '—' : kind === 'energy' ? word(E, v) : kind === 'hunger' ? word(H, v) : kind === 'sleep' ? bsCiHM(v) : litres(v);
          const [y, m, dd] = d.iso.split('-').map(Number);
          const date = new Date(y, m - 1, dd, 12);
          const dayName = date.toLocaleDateString(locale, { weekday: 'short' });
          const pick = onPick && has ? () => onPick(d) : null;
          const isYesterday = i === week.length - 1;
          const cell = (
            <>
              <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{dayName}</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1 }}>{dd}</span>
              <span aria-hidden style={{ width: 14, height: 44, background: t.HAIR, position: 'relative' }}>
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.round(pct * 100)}%`, background: color, opacity: 0.85 }} />
              </span>
              <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.03em', textTransform: 'uppercase', color: has ? t.INK : t.INK50, textAlign: 'center', lineHeight: 1.15, minHeight: 18 }}>{label}</span>
            </>
          );
          const cellStyle = { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0 7px', borderRadius: 5, border: `1px solid ${isYesterday ? t.RULE : 'transparent'}`, background: 'transparent', color: t.INK, minWidth: 0 };
          return pick ? (
            <button key={d.iso} type="button" onClick={pick} aria-label={`${dayName} ${dd}: ${label}`} style={{ ...cellStyle, cursor: 'pointer' }}>{cell}</button>
          ) : (
            <div key={d.iso} aria-label={`${dayName} ${dd}: ${label}`} style={cellStyle}>{cell}</div>
          );
        })}
      </div>
      {trend ? <div style={{ marginTop: 10, fontFamily: t.BODY, fontSize: 12.5, color: t.INK70, lineHeight: 1.4 }}>{trend}</div> : null}
    </div>
  );
  const mostlyLine = (list, kind) => {
    const i = bsCiMostly(week.map((d) => d[kind]));
    return i == null ? null : tr('home:checkin.trendMostly', { defaultValue: 'Mostly {word} this week.', word: list[i] });
  };
  const hasWaterWeek = week.some((d) => d.water != null);
  const reached = week.filter((d) => d.water != null && d.water >= target).length;
  const tapTip = tr('home:checkin.tapReuse', { defaultValue: 'Tap a day to reuse it' });

  // ── one screen of the walkthrough ──
  const screen = () => {
    if (walk === 4) {
      const row = (kind, value, i, actionKey, actionDefault) => (
        <div key={kind} style={{ display: 'grid', gridTemplateColumns: '78px minmax(0, 1fr) auto', alignItems: 'center', gap: 10, padding: '14px 0', borderBottom: `1px solid ${t.HAIR}` }}>
          <span style={{ ...mono, letterSpacing: '0.14em', color: COLOR[kind] }}>{NAME[kind]}</span>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 19, color: value ? t.INK : t.INK50 }}>{value || '—'}</span>
          <button type="button" onClick={() => open(i, true)} style={{ minHeight: 36, padding: '4px 2px', border: 0, background: 'transparent', color: t.INK50, cursor: 'pointer', ...mono, letterSpacing: '0.12em' }}>{tr(actionKey, { defaultValue: actionDefault })}</button>
        </div>
      );
      const sleepText = today.sleep != null ? [bsCiHM(today.sleep), today.rested != null ? word(R, today.rested) : null].filter(Boolean).join(' · ') : sleepSkipped ? tr('home:checkin.skipped', { defaultValue: 'Skipped' }) : null;
      const done = status === 'done';
      return (
        <>
          <span style={{ ...mono, color: teal }}>{done ? tr('home:checkin.allDone', { defaultValue: 'All checks done' }) : tr('home:checkin.nearly', { defaultValue: 'Nearly there' })}</span>
          <h1 style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 32, letterSpacing: '-0.02em', lineHeight: 1.08, color: t.INK }}>
            {!signedIn ? tr('home:today.joinToSave', { defaultValue: 'Join Shape to save your check-in' })
              : done ? <>{tr('home:checkin.checkedIn', { defaultValue: "You're checked in" })} <span style={{ color: teal }}>✓</span></>
              : tr('home:checkin.notYet', { defaultValue: 'A check is still open' })}
          </h1>
          <p style={{ margin: 0, fontFamily: t.BODY, fontSize: 14.5, lineHeight: 1.45, color: t.INK70 }}>{tr('home:checkin.savedAsYouWent', { defaultValue: 'Saved as you went. Change any answer below, or come back to it from Home.' })}</p>
          {errLine}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {row('energy', word(E, today.energy), 0, 'home:checkin.change', 'Change')}
            {row('hunger', word(H, today.hunger), 1, 'home:checkin.change', 'Change')}
            {row('sleep', sleepText, 2, 'home:checkin.change', 'Change')}
            {row('water', waterKnown ? `${litres(water.l)} ${tr('home:checkin.ofTarget', { defaultValue: 'of {target}', target: litres(target) })}` : null, 3, 'home:checkin.add', 'Add')}
          </div>
          {signedIn && streak >= 2 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 6, padding: 14, border: `1px solid ${t.RULE}`, borderRadius: 5 }}>
              <span aria-hidden style={{ display: 'flex', gap: 5 }}>{Array.from({ length: Math.min(7, streak) }, (_, i) => <span key={i} style={{ width: 10, height: 10, borderRadius: 99, background: amber }} />)}</span>
              <span style={{ ...mono, color: amber, letterSpacing: '0.12em' }}>{tr('home:checkin.streak', { defaultValue: '{n, plural, one {# day running} other {# days running}}', n: streak })}</span>
            </div>
          ) : null}
        </>
      );
    }
    const kind = BS_CI_STEPS[walk];
    const color = COLOR[kind];
    const head = (askKey, askDefault, whyKey, whyDefault) => (
      <>
        <span style={{ ...mono, color }}>{tr('home:checkin.stepLabel', { defaultValue: 'Step {n} of {total} · {name}', n: walk + 1, total: 4, name: NAME[kind] })}</span>
        <h1 style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 32, letterSpacing: '-0.02em', lineHeight: 1.08, color: t.INK }}>{tr(askKey, { defaultValue: askDefault })}</h1>
        <p style={{ margin: 0, fontFamily: t.BODY, fontSize: 14.5, lineHeight: 1.45, color: t.INK70 }}>{tr(whyKey, { defaultValue: whyDefault })}</p>
        {errLine}
      </>
    );
    if (kind === 'energy') {
      return (
        <>
          {head('home:checkin.askEnergy', "How's your energy?", 'home:checkin.whyEnergy', 'How much you have in the tank right now. On low days training should ease off, so an honest "Low" helps.')}
          {tiles('e', E, color, today.energy, (v) => { answer({ energy: v }); next(); })}
          {strip('energy', color, tapTip, mostlyLine(E, 'energy'), (d) => { answer({ energy: d.energy }); next(); })}
        </>
      );
    }
    if (kind === 'hunger') {
      return (
        <>
          {head('home:checkin.askHunger', 'How hungry are you?', 'home:checkin.whyHunger', "How hungry you've felt today overall, not just this minute. Hungry most days can mean your meals are running light.")}
          {tiles('h', H, color, today.hunger, (v) => { answer({ hunger: v }); next(); })}
          {strip('hunger', color, tapTip, mostlyLine(H, 'hunger'), (d) => { answer({ hunger: d.hunger }); next(); })}
        </>
      );
    }
    if (kind === 'sleep') {
      return (
        <>
          {head('home:checkin.askSleep', 'How did you sleep?', 'home:checkin.whySleep', "Hours of sleep last night. It's the biggest lever on recovery. A connected watch fills this in for you.")}
          {wornNight ? (
            <div style={{ textAlign: 'center', padding: '6px 0' }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK }}>{bsCiHM(today.sleep)}</div>
              <div style={{ ...mono, marginTop: 6, fontSize: 8.5, color: t.INK50 }}>{tr('home:checkin.fromWatch', { defaultValue: 'From your watch' })}</div>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <button type="button" aria-label={tr('home:checkin.less', { defaultValue: 'Thirty minutes less' })} onClick={() => setSleepH(Math.max(3, sleepValue - 0.5))} style={{ width: 54, height: 54, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 24, cursor: 'pointer' }}>−</button>
                <div style={{ textAlign: 'center' }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{bsCiHM(sleepValue)}</div>
                  <div style={{ ...mono, marginTop: 6, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{sleepFromUsual ? tr('home:checkin.usualNight', { defaultValue: 'Your usual night' }) : ' '}</div>
                </div>
                <button type="button" aria-label={tr('home:checkin.more', { defaultValue: 'Thirty minutes more' })} onClick={() => setSleepH(Math.min(12, sleepValue + 0.5))} style={{ width: 54, height: 54, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontSize: 24, cursor: 'pointer' }}>+</button>
              </div>
            </>
          )}
          {/* Rested is the member's own check, so a wearable's night still offers it (Codex P2 on #2398). */}
          <div style={{ ...mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>{tr('home:checkin.restedOptional', { defaultValue: 'Rested? · optional' })}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', gap: 6 }}>
            {R.map((w, i) => {
              const on = bsCiWordIndex(restedValue) === i;
              return (
                <button key={`r${i}`} type="button" aria-pressed={on} onClick={() => setRestedPick(on ? null : BS_CI_STORED[i])} style={{ minHeight: 38, borderRadius: 5, cursor: 'pointer', padding: '4px 2px', border: `1px solid ${on ? color : t.RULE}`, background: on ? color : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{w}</button>
              );
            })}
          </div>
          {strip('sleep', color, wornNight ? null : tapTip, null, wornNight ? null : (d) => { setSleepH(d.sleep); if (d.rested != null) setRestedPick(d.rested); })}
        </>
      );
    }
    // water
    const glasses = Math.max(6, Math.min(14, Math.round(target / glassL)));
    const full = waterKnown ? Math.max(0, Math.min(glasses, Math.round(water.l / glassL))) : 0;
    return (
      <>
        {head('home:checkin.askWater', 'Water so far today', 'home:checkin.whyWater', "Add what you've drunk so far. You can keep adding all day from Home. It doesn't hold up your check-in.")}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{waterKnown ? litres(water.l) : '—'}</span>
          <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50 }}>{tr('home:checkin.ofTarget', { defaultValue: 'of {target}', target: litres(target) })}</span>
        </div>
        <div aria-hidden style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {Array.from({ length: glasses }, (_, i) => (
            <span key={i} style={{ width: 22, height: 30, border: `1.5px solid ${t.RULE}`, borderTop: 0, borderRadius: '0 0 5px 5px', position: 'relative' }}>
              {i < full ? <span style={{ position: 'absolute', left: 2, right: 2, bottom: 2, top: 6, background: color, borderRadius: '0 0 3px 3px' }} /> : null}
            </span>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[1, 2].map((n) => (
            <button key={n} type="button" disabled={!water} onClick={() => addWater(n)} style={{ minHeight: 48, borderRadius: 5, border: `1px solid ${color}88`, background: `${color}17`, color, cursor: water ? 'pointer' : 'default', opacity: water ? 1 : 0.5, ...mono, fontSize: 10, letterSpacing: '0.12em' }}>
              {tr('home:checkin.addGlasses', { defaultValue: '{n, plural, one {+ # glass} other {+ # glasses}}', n })}
            </button>
          ))}
        </div>
        {strip('water', color, tr('home:checkin.targetTip', { defaultValue: 'Target {target}', target: litres(target) }), hasWaterWeek ? tr('home:checkin.trendWater', { defaultValue: '{n, plural, =0 {Target not reached this week.} one {Target reached once this week.} other {Target reached on # days this week.}}', n: reached }) : null, null)}
      </>
    );
  };

  const foot = () => {
    if (walk === 4) return <button type="button" onClick={close} style={btnPrimary}>{tr('home:checkin.doneButton', { defaultValue: 'Done' })}</button>;
    const kind = BS_CI_STEPS[walk];
    if (kind === 'sleep') {
      return (
        <>
          {wornNight ? null : <button type="button" onClick={() => { bsCiWriteSkip(uid, todayIso); setSkippedDay(todayIso); next(); }} style={btnGhost}>{tr('home:checkin.skip', { defaultValue: 'Skip' })}</button>}
          <button type="button" onClick={() => {
            // A wearable's hours are never re-typed; its Rested is saved on its own when picked.
            if (!wornNight) answer({ sleepHours: sleepValue, ...(restedValue != null ? { sleepQuality: restedValue } : {}) });
            else if (restedPick != null && restedPick !== today.rested) answer({ sleepQuality: restedPick });
            next();
          }} style={btnPrimary}>{tr('home:checkin.next', { defaultValue: 'Next →' })}</button>
        </>
      );
    }
    if (kind === 'water') return <button type="button" onClick={() => { setFromSummary(false); setWalk(4); }} style={btnPrimary}>{tr('home:checkin.finish', { defaultValue: 'Finish ✓' })}</button>;
    const can = answered[kind];
    return <button type="button" disabled={!can} onClick={next} style={{ ...btnPrimary, opacity: can ? 1 : 0.35, cursor: can ? 'pointer' : 'default' }}>{tr('home:checkin.next', { defaultValue: 'Next →' })}</button>;
  };

  const sheet = walk == null ? null : (
    <div role="dialog" aria-modal="true" aria-label={tr('home:checkin.title', { defaultValue: 'Daily check-in' })} data-bs-checkin-walk={walk} style={{ position: 'absolute', inset: 0, zIndex: 250, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: 'calc(env(safe-area-inset-top, 0px) + 18px) 20px 10px' }}>
        <button type="button" onClick={back} style={{ minHeight: 36, padding: 0, border: 0, background: 'transparent', color: t.INK70, cursor: 'pointer', visibility: walk > 0 && walk < 4 ? 'visible' : 'hidden', ...mono, fontSize: 10, fontWeight: 700, letterSpacing: '0.12em' }}>{tr('home:checkin.back', { defaultValue: '← Back' })}</button>
        <span style={{ ...mono, color: t.INK50 }}>{tr('home:checkin.title', { defaultValue: 'Daily check-in' })}</span>
        <button type="button" onClick={close} aria-label={tr('home:checkin.close', { defaultValue: 'Close' })} style={{ width: 36, height: 36, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', fontSize: 16 }}>×</button>
      </div>
      <div aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6, padding: '4px 20px 0' }}>
        {BS_CI_STEPS.map((k, i) => {
          const on = i === walk;
          const ok = answered[k];
          return (
            <span key={k} style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <span style={{ height: 3, background: on ? COLOR[k] : ok ? t.INK70 : t.HAIR }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? COLOR[k] : ok ? t.INK70 : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{ok && !on ? '✓ ' : ''}{NAME[k]}</span>
            </span>
          );
        })}
      </div>
      <div style={{ padding: '22px 20px 0', display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>{screen()}</div>
      <div style={{ padding: '18px 20px calc(env(safe-area-inset-bottom, 0px) + 24px)', display: 'flex', gap: 10 }}>{foot()}</div>
    </div>
  );
  const host = typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;

  // ── the card on Home ──
  const done = status === 'done';
  return (
    <>
      <div data-bs-checkin-card="" style={{ margin: `10px ${t.padX}px 4px`, padding: '14px 13px 12px', border: `1px solid ${done ? t.RULE : `${teal}66`}`, background: t.PAPER2 || t.PAPER, clipPath: 'polygon(0 0, calc(100% - 13px) 0, 100% 13px, 100% 100%, 0 100%)', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ ...mono, color: teal }}>{done ? tr('home:today.checkinLabel', { defaultValue: 'Check-in' }) : tr('home:bulletin.checkin', { defaultValue: 'Check-in due' })}</span>
          {done ? null : <span style={{ ...mono, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50 }}>{tr('home:checkin.cardMeta', { defaultValue: '4 checks · 30 sec' })}</span>}
        </div>

        {done ? (
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5, minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: signedIn ? 21 : 16, fontWeight: 600, letterSpacing: '-0.02em', lineHeight: 1.2, color: t.INK }}>
                {signedIn ? <>{tr('home:checkin.done', { defaultValue: 'Checked in' })} <span style={{ color: teal }}>✓</span></> : tr('home:today.joinToSave', { defaultValue: 'Join Shape to save your check-in' })}
              </div>
              <div style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>
                {[
                  today.energy != null ? `${NAME.energy} ${word(E, today.energy)}` : null,
                  today.hunger != null ? `${NAME.hunger} ${word(H, today.hunger)}` : null,
                  today.sleep != null ? `${NAME.sleep} ${bsCiHM(today.sleep)}` : null,
                  today.rested != null ? word(R, today.rested) : null,
                ].filter(Boolean).join(' · ')}
              </div>
              {signedIn && streak >= 2 ? (
                <div style={{ ...mono, fontSize: 8.5, color: amber }}>{tr('home:checkin.streak', { defaultValue: '{n, plural, one {# day running} other {# days running}}', n: streak })}</div>
              ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6, flex: 'none' }}>
              <button type="button" onClick={() => open(4)} style={{ minHeight: 34, padding: '5px 11px', borderRadius: 4, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', ...mono, fontSize: 8.5 }}>{tr('home:action.edit', { defaultValue: 'Edit' })}</button>
              {onOpen ? <button type="button" onClick={openDetails} style={{ minHeight: 30, padding: '4px 0', border: 0, background: 'transparent', color: t.INK50, cursor: 'pointer', ...mono, fontSize: 8.5 }}>{tr('home:checkin.details', { defaultValue: 'Details →' })}</button> : null}
            </div>
          </div>
        ) : (
          <>
            <h2 style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 300, fontSize: 25, letterSpacing: '-0.02em', lineHeight: 1.1, color: t.INK }}>
              {tr('home:checkin.cardTitle', { defaultValue: 'Four quick checks.' })}<br />{tr('home:checkin.cardSub', { defaultValue: 'Saved as you go.' })}
            </h2>
            <div aria-hidden style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 6 }}>
              {BS_CI_STEPS.map((k) => (
                <span key={k} style={{ borderTop: `3px solid ${answered[k] ? COLOR[k] : t.HAIR}`, paddingTop: 7, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: answered[k] ? t.INK : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{answered[k] ? '✓ ' : ''}{NAME[k]}</span>
              ))}
            </div>
            {errLine}
            <button type="button" onClick={() => open(firstOpen())} style={{ ...btnPrimary, flex: 'none' }}>
              {answered.energy || answered.hunger ? tr('home:checkin.continue', { defaultValue: 'Continue →' }) : tr('home:checkin.start', { defaultValue: 'Start check-in →' })}
            </button>
            {same ? (
              <button type="button" onClick={() => answer(same)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, minHeight: 56, padding: '8px 10px', borderRadius: 5, border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer' }}>
                <span style={{ ...mono, fontSize: 8.5, color: teal }}>{tr('home:checkin.same', { defaultValue: 'Same as yesterday' })} ✓</span>
                <span style={{ fontFamily: t.BODY, fontSize: 13, color: t.INK70 }}>{sameLine}</span>
              </button>
            ) : null}
          </>
        )}

        {done ? errLine : null}
        {done ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, borderTop: `1px solid ${t.HAIR}`, paddingTop: 9 }}>
            <span style={{ ...mono, fontSize: 8.5, color: sky }}>{NAME.water}</span>
            <span style={{ flex: 1, fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{waterKnown ? `${litres(water.l)} / ${litres(target)}` : '—'}</span>
            <button type="button" onClick={() => addWater(1)} disabled={!water} style={{ minHeight: 32, padding: '4px 10px', borderRadius: 4, border: `1px solid ${sky}80`, background: `${sky}14`, color: sky, cursor: water ? 'pointer' : 'default', opacity: water ? 1 : 0.5, ...mono, fontSize: 8.5, letterSpacing: '0.1em' }}>{tr('home:checkin.addGlass', { defaultValue: '+ Glass' })}</button>
          </div>
        ) : null}
      </div>
      {sheet && host ? createPortal(sheet, host) : sheet}
    </>
  );
}

// ⚠ ONE CARD PER LOCAL DAY (Codex P2s on #2398). Every piece of the card's state belongs to the day
// it was read for: the answers, the water, the open walkthrough, the save versions. So a new day
// mounts a new card rather than carrying any of it across midnight. A walkthrough open at midnight
// closes, and a save from the day before that fails after midnight lands on the old, unmounted card
// and changes nothing.
export function BSCheckinCard(props) {
  const day = bsCiIso(new Date());
  return <BSCheckinDay key={day} dayIso={day} {...props} />;
}
