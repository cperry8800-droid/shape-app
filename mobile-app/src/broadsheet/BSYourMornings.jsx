import React from 'react';
import { bsCiIso, bsCiShift, bsCiDay, bsCiWindow, bsCiWordIndex, bsCiMostly, bsCiHM, bsCiShortNight, bsCiUsualNight, bsCiWornNight, bsCiCoachingOf, bsCiWhoSees, bsCiSettled, bsCiLanded, bsCiWords, bsCiBandWords, bsCiTodayRead, bsCiTodayReadText, BS_CI_HYDRATION_SYNCED, BS_CI_SHORT_NIGHT_H } from './BSCheckinCard.jsx';
import { morningReadinessForDay } from '../services/morningReadiness.mjs';
import { morningPatternsFor } from '../services/morningPatterns.mjs';
// ─── YOUR MORNINGS: THE MORNING CHECK-IN OVER TIME ───────────────────────────────────────────────
// docs/REVIEW-2026-10-19-morning-checkin.md §3.5 and §3.8 (part 2), §3.6 (part 3). One read-only page,
// from the same /api/client/progress read the morning card makes, so a page opened from the card costs
// no request.
//
//   Readiness today (morningReadiness.mjs: the number Home's done line shows), with today's read and
//   what it was built from · the cycle chip, inside its expected window only · What we've noticed ·
//   7 days | 30 days · the window's readiness · Sleep, Energy, How you woke up, and Hunger between
//   meals with a nutritionist · last night from a watch, or a Connect door · Who sees this
//
// Nora is told the page (bsNoraOpen), and "Ask Nora about your mornings" closes What we've noticed.
//
// Doors: Home's done line and the walkthrough summary ("Your mornings →"), the energy lead, Progress
// (BSMorningsDoor, where its Energy, Hunger and Rested tabs were), and with Check-ins off the quiet
// Home row, the Daily check-in reminder and the sleep lead. It replaces the old "How are you." page
// and its Sleep detail. Nothing is answered here: the card asks, this page shows.
//
// ⚠ A WINDOW IS TODAY AND THE DAYS BEFORE IT (the engine's week), compared with the same number of
// days before that. Member-local days (bsCiWindow, shifted at local noon), and nothing dated after
// today is read.
//
// ⚠ WORDS, NEVER /10 (ruling 11). A stored or averaged value becomes a word only through
// bsCiWordIndex, and the words are the card's own (bsCiWords), so the page, the card and Home's lead
// say one thing. A headline needs 3 answered days. A direction needs 3 in both windows, and a move of
// under half a word (1 point) or 20 minutes reads "About the same".
//
// ⚠ A HEADLINE SAYS THE WORDS AS THE LABELS THEY ARE: "Most days this week: Good", "Mixed: Low to
// Good", never lower-cased into a sentence (review on this PR: that made "ok" of OK and "kein hunger" of
// German's noun). "Most days" is the word most answered days had (bsCiMostly), never an average.
//
// ⚠ CHECK-INS OFF ASK NOTHING (ruling 12): the history still shows, a section short of answers says so
// instead of asking for more, and readiness today with no score says nothing new is asked.
//
// ⚠ HUNGER ONLY WITH A NUTRITIONIST (ruling 6): the plan read has to say there is one. A member
// without one, or whose read failed, sees no Hunger section, whatever history the old page left.
//
// ⚠ THE WATCH'S TILES ARE LAST NIGHT'S OR NOTHING. A reading shows only when it is dated today; the
// progress route's newest-however-old kpis (§7) are never read here.
//
// ⚠ WHAT WE'VE NOTICED IS THE MEMBER'S OWN READ, COUNTED BY morningPatterns.mjs (§3.6, rulings 15 and
// 16): the module Nora's read of the mornings runs too, so the page and Nora say one thing. Plain
// counts said with "after", never a share, an average or readiness. Its window is its own (the 60 days
// ending today, from 2026-10-19), so it sits above 7 days | 30 days, which never moves it. It is never
// drawn for the example (a pattern in made-up mornings is a made-up finding), a failed read or another
// account's; with Check-ins off, nothing will come to fill it, so only a pattern that holds is drawn.
//
// ⚠ WHO SEES THIS SAYS COACHES SEE THE ANSWERS (ruling 18): the nutritionist's day review shows each
// day's, so "7-day averages" undersold it. What we've noticed and readiness are only the member's.
//
// ⚠ A READ BELONGS TO THE ACCOUNT THAT MADE IT. One that lands after the account changed is dropped,
// and what is drawn is keyed to the uid it was read for. Signed out, the page shows example mornings
// (bsMorningsSample), says so, and reads nothing.
//
// ⚠ THIS FILE IMPORTS THE CARD, NEVER THE OTHER WAY: Home hands the card a door (BSCheckinCard.jsx).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx): this file is a
// static import of the client module and evaluates before that module's body has run.

const { useState, useEffect, useLayoutEffect, useMemo } = React;

const BS_MORNINGS_ISO = /^\d{4}-\d{2}-\d{2}$/;
const BS_MORNINGS_KINDS = ['sleep', 'energy', 'rested', 'hunger'];
// A headline or a direction needs 3 answered days, as the card's week line and the engine do.
const BS_MORNINGS_MIN = 3;
// "About the same": under half a word (1 point on the stored 1-10 scale), or under 20 minutes a night.
const BS_MORNINGS_SAME_POINTS = 1;
const BS_MORNINGS_SAME_MINUTES = 20;

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

function bsMorningsUid() { return window.ShapeAuth?.getCachedState?.()?.user?.id || null; }
// The app's language, for weekday and month names.
function bsMorningsLocale() { return window.ShapeI18n?.intlLocale?.() || undefined; }

// The page opens at its top: BSPage can keep the scroll of the view it replaced (the client's
// _bsScrollTopOnMount, which is not on window).
function useMorningsScrollTop() {
  useLayoutEffect(() => {
    const el = document.querySelector('.bs-scroll');
    if (el) el.scrollTop = 0;
  }, []);
}

// The range switch sticks below BSPage's condensing masthead: the client's useBSPinnedMastTop, copied,
// since this file never imports the client. ⚠ offsetHeight, not the rect (Codex P2 on #2397): the
// Small and Large text sizes are a CSS zoom, and the rect would count it twice.
function useMorningsPinnedTop() {
  const [top, setTop] = useState(0);
  useEffect(() => {
    const measure = () => {
      try {
        const el = document.querySelector('[data-bs-pinned-mast]');
        const h = el ? Math.round(el.offsetHeight || 0) : 0;
        setTop(h > 0 ? h : 0);
      } catch (e) { /* no DOM: 0 is the honest answer */ }
    };
    measure();
    window.addEventListener('resize', measure);
    const later = setTimeout(measure, 320);
    return () => { window.removeEventListener('resize', measure); clearTimeout(later); };
  }, []);
  return top;
}

// ── The rules, kept pure so they can be driven ───────────────────────────────

// The signed-out example: 60 days ending today, one fortnight's mornings repeated, with a skipped night
// and a day with no answer so the strips show both. [energy, rested, hours, skipped], today first.
// Never saved, and the same for every visitor on a given day.
const BS_MORNINGS_SAMPLE = [
  [8, 8, 7.5], [8, 6, 7.25], [6, 6, 6.5], [8, 8, 7.75], [10, 8, 8], [4, 4, null, true], [8, 8, 7.5],
  [8, 10, 7], [6, 6, 5.5], [6, 6, 6.75], [8, 8, 7.5], [8, 6, 7.25], [null, null, null], [8, 8, 7.5],
];
export function bsMorningsSample(todayIso) {
  const out = { energy: [], sleepQuality: [], sleep: [], sleepSkipped: [] };
  if (typeof todayIso !== 'string' || !BS_MORNINGS_ISO.test(todayIso)) return out;
  for (let k = 59; k >= 0; k -= 1) {
    const date = bsCiShift(todayIso, -k);
    const [energy, rested, hours, skipped] = BS_MORNINGS_SAMPLE[k % BS_MORNINGS_SAMPLE.length];
    if (energy != null) out.energy.push({ date, value: energy });
    if (rested != null) out.sleepQuality.push({ date, value: rested });
    if (hours != null) out.sleep.push({ date, value: hours });
    if (skipped) out.sleepSkipped.push({ date, value: 1 });
  }
  return out;
}

// A section's answered values over a window: hours for sleep, stored 1-10 values for the words (an
// old value over 10 counts as 10, as its word does). `days` holds bsCiWindow's days or plain values.
function bsMorningsValues(kind, days) {
  return (Array.isArray(days) ? days : [])
    .map((d) => Number(d != null && typeof d === 'object' ? d[kind] : d))
    .filter((n) => (kind === 'sleep' ? Number.isFinite(n) && n > 0 : bsCiWordIndex(n) != null))
    .map((n) => (kind === 'sleep' ? n : Math.min(10, n)));
}

// Which way a section moved against the window before it: 'up' | 'down' | 'same', or null when either
// window has fewer than 3 answers. Words compare their stored values, so a move under half a word
// (1 point) is 'same'; sleep compares hours to the minute, so 20 minutes is the smallest move.
export function bsMorningsDirection(kind, cur, prev) {
  if (!BS_MORNINGS_KINDS.includes(kind)) return null;
  const a = bsMorningsValues(kind, cur);
  const b = bsMorningsValues(kind, prev);
  if (a.length < BS_MORNINGS_MIN || b.length < BS_MORNINGS_MIN) return null;
  const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;
  if (kind === 'sleep') {
    const minutes = Math.round((mean(a) - mean(b)) * 60);
    return Math.abs(minutes) < BS_MORNINGS_SAME_MINUTES ? 'same' : minutes > 0 ? 'up' : 'down';
  }
  // Means of whole values, so float noise (0.9999999) is rounded off before the line at 1 point.
  const points = Math.round((mean(a) - mean(b)) * 1e6) / 1e6;
  return Math.abs(points) < BS_MORNINGS_SAME_POINTS ? 'same' : points > 0 ? 'up' : 'down';
}

// A section's headline as the key that says it and the values that fill it; the page words it. Word
// values are indices into the section's five words (bsCiWords). The word most days had when one holds
// most of them (bsCiMostly), else the lowest and highest answered; sleep is the window's average night
// (`hours`) and how many were short (`short`: bsCiShortNight against the day's `usual`, when the day
// carries one). Under 3 answers it says how many more it needs. Null for a kind it doesn't know.
export function bsMorningsHeadline(kind, days) {
  if (!BS_MORNINGS_KINDS.includes(kind)) return null;
  const list = Array.isArray(days) ? days : [];
  if (kind === 'sleep') {
    const nights = list.filter((d) => d && Number.isFinite(Number(d.sleep)) && Number(d.sleep) > 0);
    if (nights.length < BS_MORNINGS_MIN) return { key: 'home:mornings.headMore', vars: { n: BS_MORNINGS_MIN - nights.length } };
    const hours = nights.reduce((s, d) => s + Number(d.sleep), 0) / nights.length;
    const short = nights.filter((d) => bsCiShortNight(d.sleep, d.usual)).length;
    return { key: 'home:mornings.sleepHead', vars: { hours, short } };
  }
  const values = bsMorningsValues(kind, list);
  if (values.length < BS_MORNINGS_MIN) return { key: 'home:mornings.headMore', vars: { n: BS_MORNINGS_MIN - values.length } };
  const most = bsCiMostly(values);
  if (most != null) return { key: list.length > 7 ? 'home:mornings.headMostlyMonth' : 'home:mornings.headMostlyWeek', vars: { word: most } };
  const idx = values.map(bsCiWordIndex);
  return { key: 'home:mornings.headMixed', vars: { low: Math.min(...idx), high: Math.max(...idx) } };
}

// Last night from a watch. `has`: one has reported in the last 30 days (a night it wrote, or a recovery
// or HRV reading). The rest are its readings DATED TODAY, each null when there is none: the hours only
// on a night the watch wrote (bsCiWornNight), never typed hours.
function bsMorningsWatch(series, todayIso) {
  const from = bsCiShift(todayIso, -29);
  const pts = (k) => (Array.isArray(series && series[k]) ? series[k] : []);
  const recent = (k) => pts(k).some((p) => p && typeof p.date === 'string' && p.date >= from && p.date <= todayIso && Number.isFinite(Number(p.value)));
  const at = (k) => { const p = pts(k).find((s) => s && s.date === todayIso); const n = p ? Number(p.value) : NaN; return Number.isFinite(n) ? n : null; };
  const pos = (k) => { const n = at(k); return n != null && n > 0 ? n : null; };
  const day = bsCiDay(series, todayIso);
  return {
    has: recent('sleepFromDevice') || recent('recovery') || recent('hrv'),
    hours: bsCiWornNight(day) ? day.sleep : null,
    efficiency: pos('sleepEfficiency'),
    rhr: pos('restingHr'),
    hrv: pos('hrv'),
    recovery: at('recovery'),
  };
}

// A word in a narrow cell: a step smaller and tighter when it is long (German, Russian, Portuguese at
// 320 px), and hyphenated in the page's language where it must break. The card's rule.
function bsMorningsFit(text, base) {
  const n = Math.max(0, ...String(text || '').split(/\s+/).map((x) => x.length));
  return { fontSize: n >= 10 ? base - 1.5 : n >= 7 ? base - 1 : base, letterSpacing: n >= 7 ? '0.01em' : '0.05em', overflowWrap: 'anywhere', hyphens: 'auto', WebkitHyphens: 'auto' };
}

// ── The page ─────────────────────────────────────────────────────────────────

// `cycleChip` is the client's BSCycleTodayChip, drawn as given: it shows itself only inside the
// expected window, and only here, never on Home. `checkinsOn` is the member's Check-ins setting: off,
// the history still shows, and the page says nothing new is asked.
export function BSYourMornings({ onBack, cycleChip = null, checkinsOn = true }) {
  const { useBS, BSPage, BSDetailHeader, BSAskNoraLink } = window;
  const t = useBS();
  const tr = useShapeTr();
  useMorningsScrollTop();
  const pinnedTop = useMorningsPinnedTop();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const amber = t.isLight ? '#b9802a' : '#e8b14a';
  // Amber marks (bars, borders, rules) but is never text on a light paper, where #b9802a is under 3:1
  // (review on this PR): words it would colour are drawn in ink there.
  const amberText = t.isLight ? t.INK70 : amber;
  const blue = t.BLUE || (t.isLight ? '#3a6ea5' : '#5b9bd5');
  const rust = t.RUST || '#c0533b';
  // Sleep and How you woke up are the card's night blue, energy its teal, hunger its amber.
  const COLOR = { sleep: blue, energy: teal, rested: blue, hunger: amber };
  const BAND_COLOR = { ready: teal, steady: blue, easy: amber, low: rust };
  const uid = bsMorningsUid();
  const todayIso = bsCiIso(new Date());
  const [range, setRange] = useState(7);
  const [read, setRead] = useState(null); // { uid, series } once read; series null when the read failed
  const [plan, setPlan] = useState(null); // { uid, coaching }
  const [synced, setSynced] = useState(0); // watch syncs the card finished while the page was open

  // The card asks the watches for last night when Home opens, and its sync outlives the card: Home
  // unmounts it for this page. A sync that lands clears the cache and says so (BS_CI_HYDRATION_SYNCED),
  // and the page reads again, so a night that arrives while it is open is shown.
  useEffect(() => {
    const again = () => setSynced((n) => n + 1);
    window.addEventListener(BS_CI_HYDRATION_SYNCED, again);
    return () => window.removeEventListener(BS_CI_HYDRATION_SYNCED, again);
  }, []);

  // The card's read, after any save still on its way (bsCiSettled, as the card waits), so an answer
  // given a moment ago is shown. The 60-second cache makes it free when the card has just read. What
  // is on screen stays until a read lands, and a read again after a sync that fails keeps it.
  // ⚠ A SAVE THE 3-SECOND WAIT GAVE UP ON IS READ AGAIN WHEN IT LANDS (review on this PR). The read
  // went out before it, so it answered from the day before the answer, and the page said a morning
  // Home had just scored was still open until it was opened again. A save that lands clears the cache
  // (bsCiLanded), so the read again is fresh; a line that had landed when the read went out reads once.
  useEffect(() => {
    if (!uid) return undefined;
    let on = true;
    const P = window.ShapeProgress;
    const land = (s) => {
      if (!on || bsMorningsUid() !== uid) return;
      setRead((cur) => (!s && cur && cur.uid === uid && cur.series ? cur : { uid, series: s }));
    };
    // Marked before bsCiSettled races the same promise, so a line that lands in time is marked first.
    const landed = bsCiLanded('checkin');
    let drained = false;
    landed.then(() => { drained = true; });
    const pending = P && P.progress ? bsCiSettled('checkin').then(() => {
      if (!drained) landed.then(() => { if (on && bsMorningsUid() === uid) setSynced((n) => n + 1); });
      return P.progress();
    }) : Promise.resolve(null);
    pending.then((p) => land(p && p.series ? p.series : null), () => land(null));
    return () => { on = false; };
  }, [uid, synced]);

  // Who coaches the member, from the plan read Home already makes: the Hunger section and Who sees this.
  useEffect(() => {
    if (!uid || !window.ShapePlan?.get) return undefined;
    let on = true;
    Promise.resolve(window.ShapePlan.get()).then((p) => {
      if (on && bsMorningsUid() === uid) setPlan({ uid, coaching: bsCiCoachingOf(p) });
    }).catch(() => {});
    return () => { on = false; };
  }, [uid]);

  // Nora is told this screen, and her sheet's chip names it in the member's language. Back gives the
  // chip back to the screen underneath: bsNoraOpen keeps what each open screen set (Home's 'Home').
  const noraLabel = tr('home:mornings.link', { defaultValue: 'Your mornings' });
  useEffect(() => {
    const off = window.bsNoraOpen?.({ page: 'Your mornings', label: noraLabel });
    return typeof off === 'function' ? off : undefined;
  }, [noraLabel]);

  const sample = useMemo(() => (uid ? null : bsMorningsSample(todayIso)), [uid, todayIso]);
  const mine = uid && read && read.uid === uid ? read : null;
  const series = uid ? (mine ? mine.series : null) : sample;
  const failed = !!mine && !mine.series;
  const coaching = uid && plan && plan.uid === uid ? plan.coaching : { trainer: null, nutritionist: null };
  // A coach of either role, for today's read and a pattern's follow-up: "tell your coach".
  const coached = coaching.trainer === true || coaching.nutritionist === true;

  // What we've noticed, over its own 60 days, so the range switch never moves it. Only the member's own
  // read that landed: never the example, a failed read, or a read another account made (`mine`).
  const own = mine && mine.series ? mine.series : null;
  const patterns = useMemo(() => (own ? morningPatternsFor(own, todayIso) : null), [own, todayIso]);

  // The window and the one before it. Each day carries its usual night (bsCiUsualNight, the 14 nights
  // before it), for its short night and its readiness, which is the number Home showed that morning.
  const model = useMemo(() => {
    if (!series) return null;
    const cur = bsCiWindow(series, todayIso, range).map((d) => ({ ...d, usual: bsCiUsualNight(series, d.iso) }));
    const prev = bsCiWindow(series, bsCiShift(todayIso, -range), range);
    const ready = cur.map((d) => morningReadinessForDay(series, d.iso, { usualNight: d.usual }));
    return { cur, prev, ready };
  }, [series, todayIso, range]);
  const watch = useMemo(() => (uid && series ? bsMorningsWatch(series, todayIso) : null), [uid, series, todayIso]);

  const { E, H, R } = bsCiWords(tr);
  const WORDS = { energy: E, rested: R, hunger: H };
  const BAND = bsCiBandWords(tr);
  const locale = bsMorningsLocale();
  const hm = (h) => bsCiHM(h, (hh, mm) => (mm == null
    ? tr('home:checkin.hOnly', { defaultValue: '{h}h', h: hh })
    : tr('home:checkin.hm', { defaultValue: '{h}h {m}', h: hh, m: mm })));
  const NAME = {
    sleep: tr('home:mornings.sleep', { defaultValue: 'Sleep' }),
    energy: tr('home:mornings.energy', { defaultValue: 'Energy' }),
    rested: tr('home:mornings.rested', { defaultValue: 'How you woke up' }),
    hunger: tr('home:mornings.hunger', { defaultValue: 'Hunger between meals' }),
  };
  const better = tr('home:mornings.dirBetter', { defaultValue: 'Better' });
  const lower = tr('home:mornings.dirLower', { defaultValue: 'Lower' });
  const DIR = {
    energy: { up: better, down: lower },
    rested: { up: better, down: lower },
    sleep: { up: tr('home:mornings.dirLonger', { defaultValue: 'Longer' }), down: tr('home:mornings.dirShorter', { defaultValue: 'Shorter' }) },
    hunger: { up: tr('home:mornings.dirHungrier', { defaultValue: 'Hungrier' }), down: tr('home:mornings.dirLessHungry', { defaultValue: 'Less hungry' }) },
  };
  const same = tr('home:mornings.dirSame', { defaultValue: 'About the same' });
  const vs = tr('home:mornings.dirVs', { defaultValue: 'than the {n} days before', n: range });
  const noAnswer = tr('home:mornings.noAnswer', { defaultValue: 'No answer' });
  const skippedWord = tr('home:mornings.skipped', { defaultValue: 'Skipped' });
  const fromWatch = tr('home:mornings.fromWatch', { defaultValue: 'From your watch' });

  // A headline in the member's words: each word as the card says it, a label after the colon (see the
  // header). Sleep is to the 5 minutes, as the card's week line says it. Short of 3 answers it says how
  // many more fill it in, or with Check-ins off, which will ask for none, that there are too few.
  const headline = (kind, h) => {
    if (!h) return null;
    const word = (i) => WORDS[kind][i];
    if (h.key === 'home:mornings.sleepHead') {
      const avg = tr('home:mornings.sleepHead', { defaultValue: '{hours} a night on average', hours: hm(Math.round(h.vars.hours * 12) / 12) });
      return h.vars.short > 0 ? `${avg} · ${tr('home:mornings.sleepShort', { defaultValue: '{n, plural, one {# short night} other {# short nights}}', n: h.vars.short })}` : avg;
    }
    if (h.key === 'home:mornings.headMostlyWeek') return tr('home:mornings.headMostlyWeek', { defaultValue: 'Most days this week: {word}', word: word(h.vars.word) });
    if (h.key === 'home:mornings.headMostlyMonth') return tr('home:mornings.headMostlyMonth', { defaultValue: 'Most days this month: {word}', word: word(h.vars.word) });
    if (h.key === 'home:mornings.headMixed') return tr('home:mornings.headMixed', { defaultValue: 'Mixed: {low} to {high}', low: word(h.vars.low), high: word(h.vars.high) });
    if (!checkinsOn) return tr('home:mornings.headNone', { defaultValue: 'Not enough answers in these days' });
    return tr('home:mornings.headMore', { defaultValue: '{n, plural, one {# more answer} other {# more answers}} and this fills in', n: h.vars.n });
  };

  const dateOf = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d, 12); };
  const dateText = (iso, opts) => { try { return dateOf(iso).toLocaleDateString(locale, opts); } catch (e) { return dateOf(iso).toLocaleDateString(undefined, opts); } };

  // One strip cell per day: how full its bar is, the word or figure under it, what a screen reader
  // hears, and its mark (a watch's night, or a night skipped). A day with no answer is an empty cell.
  const cellsFor = (kind, days) => days.map((d, i) => {
    const empty = { iso: d.iso, pct: 0, label: null, value: null, color: null, mark: null };
    if (kind === 'readiness') {
      const r = model.ready[i];
      if (!r) return empty;
      return { ...empty, pct: r.score / 100, label: String(r.score), color: BAND_COLOR[r.band], value: tr('home:mornings.readinessLine', { defaultValue: 'Readiness {score} · {band}', score: r.score, band: BAND[r.band] }) };
    }
    if (kind === 'sleep') {
      // Hours win over a skip, as readiness counts them: a night with hours shows them, a watch's 0h
      // included, however the row was skipped before they came.
      const h = d.sleep == null ? NaN : Number(d.sleep);
      if (Number.isFinite(h) && h >= 0) {
        const worn = bsCiWornNight(d);
        return { ...empty, pct: Math.min(1, h / 12), label: hm(h), color: COLOR.sleep, mark: worn ? 'watch' : null, value: worn ? `${hm(h)} · ${fromWatch}` : hm(h) };
      }
      // A night skipped, on the day's row, and not answered since: marked, never read as no answer.
      return d.skipped ? { ...empty, label: skippedWord, value: skippedWord, mark: 'skipped' } : empty;
    }
    const w = bsCiWordIndex(d[kind]);
    if (w == null) return empty;
    return { ...empty, pct: (w + 1) / 5, label: WORDS[kind][w], value: WORDS[kind][w], color: COLOR[kind] };
  });

  const mono = { fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
  const dot = { position: 'absolute', left: '50%', top: -7, width: 4, height: 4, marginLeft: -2, borderRadius: 99, background: t.INK70 };
  const stub = { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, background: t.INK50 };
  const head = (label, color) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <span aria-hidden style={{ flex: 'none', width: 10, height: 2, background: color }} />
      <h2 style={{ margin: 0, ...mono, fontSize: 9.5, letterSpacing: '0.2em', color: t.INK }}>{label}</h2>
    </div>
  );

  // The strip. Seven days are seven labelled cells, the weekday over the bar and the word or figure
  // under it, today ruled. Thirty are thin bars with one label for the strip, dated at both ends.
  const strip = (kind, cells) => {
    const name = kind === 'readiness' ? tr('home:mornings.readinessStrip', { defaultValue: 'Readiness' }) : NAME[kind];
    const aria = tr('home:mornings.stripAria', { defaultValue: '{name}, the last {n} days', name, n: cells.length });
    const bar = (c) => (
      <>
        {c.pct > 0 ? <span style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: `${Math.round(c.pct * 100)}%`, background: c.color, opacity: 0.85 }} /> : null}
        {c.mark === 'skipped' ? <span style={stub} /> : null}
        {c.mark === 'watch' ? <span style={dot} /> : null}
      </>
    );
    if (cells.length > 7) {
      return (
        <div data-bs-mornings-strip={kind}>
          <div role="img" aria-label={aria} style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, gap: 2, height: 48, paddingTop: 7 }}>
            {cells.map((c) => <span key={c.iso} data-bs-mornings-day={c.iso} data-bs-mornings-mark={c.mark || undefined} style={{ position: 'relative', background: t.HAIR }}>{bar(c)}</span>)}
          </div>
          <div aria-hidden style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 6, ...mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50 }}>
            <span>{dateText(cells[0].iso, { month: 'short', day: 'numeric' })}</span>
            <span>{dateText(cells[cells.length - 1].iso, { month: 'short', day: 'numeric' })}</span>
          </div>
        </div>
      );
    }
    return (
      <div data-bs-mornings-strip={kind} role="group" aria-label={aria} style={{ display: 'grid', gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`, gap: 3 }}>
        {cells.map((c) => {
          const weekday = dateText(c.iso, { weekday: 'short' });
          const day = `${weekday} ${Number(c.iso.slice(8))}`;
          return (
            <div key={c.iso} role="img" data-bs-mornings-day={c.iso} data-bs-mornings-mark={c.mark || undefined} aria-label={tr('home:mornings.dayAria', { defaultValue: '{day}: {value}', day, value: c.value || noAnswer })}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, padding: '8px 0 7px', borderRadius: 5, border: `1px solid ${c.iso === todayIso ? t.RULE : 'transparent'}`, minWidth: 0 }}>
              <span style={{ ...mono, fontSize: 8, letterSpacing: '0.1em', color: t.INK50 }}>{weekday}</span>
              <span style={{ position: 'relative', width: 14, height: 44, background: t.HAIR }}>{bar(c)}</span>
              <span style={{ fontFamily: t.MONO, fontWeight: 800, textTransform: 'uppercase', color: c.label ? t.INK : t.INK50, textAlign: 'center', lineHeight: 1.15, minHeight: 18, maxWidth: '100%', ...bsMorningsFit(c.label || '—', 7.5) }}>{c.label || '—'}</span>
            </div>
          );
        })}
      </div>
    );
  };
  // What the sleep strip's marks mean, when the window has any.
  const legend = (cells) => {
    const worn = cells.some((c) => c.mark === 'watch');
    const skip = cells.some((c) => c.mark === 'skipped');
    if (!worn && !skip) return null;
    const swatch = (style) => <span style={{ position: 'relative', display: 'inline-block', width: 8, height: 10 }}><span style={style} /></span>;
    return (
      <div aria-hidden style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 14px', marginTop: 8, ...mono, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50 }}>
        {worn ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch({ ...dot, top: 3 })}{fromWatch}</span> : null}
        {skip ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>{swatch(stub)}{skippedWord}</span> : null}
      </div>
    );
  };

  // What a score was built from: only the parts it counted (morningReadiness's `parts`), joined as the
  // app's language lists things ("your energy and your sleep"). A morning with the night skipped, or
  // no How did you wake up?, is never told it was built from them (review on this PR).
  const builtFrom = (r) => {
    const names = [
      r.parts.energy != null ? tr('home:mornings.fromEnergy', { defaultValue: 'your energy' }) : null,
      r.parts.sleep != null ? tr('home:mornings.fromSleep', { defaultValue: 'your sleep' }) : null,
      r.parts.rested != null ? tr('home:mornings.fromRested', { defaultValue: 'how you woke up' }) : null,
      r.usesWatch ? tr('home:mornings.fromWatchReadings', { defaultValue: "your watch's readings" }) : null,
    ].filter(Boolean);
    let parts;
    try { parts = new Intl.ListFormat(locale, { type: 'conjunction' }).format(names); } catch (e) { parts = names.join(', '); }
    return tr('home:mornings.readinessFromParts', { defaultValue: 'Built from {parts}.', parts });
  };
  // Check-ins off asks nothing, so the page says so: in the hero when today has no score, under it
  // when it has one, and alone while there is no hero.
  const offLine = (style) => <p data-bs-mornings-off="" style={style}>{tr('home:mornings.checkinsOff', { defaultValue: 'Morning check-ins are off, so nothing new is asked. You can turn them on in Settings.' })}</p>;
  const heroLine = { margin: '8px 0 0', fontFamily: t.BODY, fontSize: 14.5, lineHeight: 1.45, color: t.INK70 };

  // Readiness today, with today's read under it (§3.5: the card's own sentence, bsCiTodayReadText, so
  // the page and Home say one thing) and what it was built from. "Readiness today" never stands alone:
  // with no score the line under it asks for the check-in, or with Check-ins off says nothing is asked.
  const hero = () => {
    const r = model.ready[model.ready.length - 1];
    const d = model.cur[model.cur.length - 1];
    const color = r ? BAND_COLOR[r.band] : t.INK50;
    const readText = r ? bsCiTodayReadText(tr, bsCiTodayRead(d, d.usual), coached) : null;
    return (
      <div data-bs-mornings-hero="" style={{ padding: `10px ${t.padX}px 2px` }}>
        <div style={{ ...mono, color: t.INK50 }}>{tr('home:mornings.readinessToday', { defaultValue: 'Readiness today' })}</div>
        {r ? (
          <>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginTop: 6 }}>
              <span data-bs-mornings-score="" style={{ fontFamily: t.DISPLAY, fontSize: 56, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color, fontVariantNumeric: 'tabular-nums' }}>{r.score}</span>
              <span data-bs-mornings-band={r.band} style={{ ...mono, fontSize: 10.5, letterSpacing: '0.12em', color: r.band === 'easy' ? amberText : color }}>{BAND[r.band]}</span>
            </div>
            <div aria-hidden style={{ marginTop: 10, height: 4, background: t.HAIR }}>
              <div style={{ width: `${Math.max(2, Math.min(100, r.score))}%`, height: '100%', background: color }} />
            </div>
            {readText ? <p data-bs-mornings-read="" style={{ margin: '12px 0 0', fontFamily: t.BODY, fontSize: 15.5, lineHeight: 1.4, color: t.INK }}>{readText}</p> : null}
            <p data-bs-mornings-from="" style={{ margin: readText ? '8px 0 0' : '12px 0 0', fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{builtFrom(r)}</p>
            <p style={{ margin: '6px 0 0', fontFamily: t.BODY, fontSize: 12, lineHeight: 1.4, color: t.INK50 }}>{tr('home:mornings.readinessNote', { defaultValue: 'A guide from your own answers, not a medical reading.' })}</p>
          </>
        ) : checkinsOn ? (
          <p data-bs-mornings-open="" style={heroLine}>{tr('home:mornings.readinessOpen', { defaultValue: "Answer this morning's check-in to see today's readiness." })}</p>
        ) : offLine(heroLine)}
      </div>
    );
  };

  // What we've noticed (§3.6): a pattern's lead, its counts and "Based on {n} mornings", each word the
  // card's label as it is ("Low or Drained"), never lower-cased. Null for a key this page doesn't know,
  // so a pattern the module gains is never drawn under another's words.
  const patternLines = (p) => {
    if (p.key === 'energyAfterShort') {
      return {
        lead: p.dir === 'more'
          ? tr('home:mornings.patternShortMore', { defaultValue: 'Low mornings come more often after a short night.' })
          : tr('home:mornings.patternShortLess', { defaultValue: 'Low mornings come less often after a short night.' }),
        counts: tr('home:mornings.patternShortCounts', { defaultValue: '{low} or {drained} after {a} of {n, plural, one {# short night} other {# short nights}}, and after {b} of {m, plural, one {# full night} other {# full nights}}.', low: E[1], drained: E[0], a: p.short.low, n: p.short.n, b: p.full.low, m: p.full.n }),
        next: null,
      };
    }
    if (p.key === 'tiredAfterFull') {
      return {
        lead: tr('home:mornings.patternTired', { defaultValue: 'You often wake up tired after a full night.' }),
        counts: tr('home:mornings.patternTiredCounts', { defaultValue: '{tired} or {wrecked} after {k} of {n, plural, one {# full night} other {# full nights}}.', tired: R[1], wrecked: R[0], k: p.tired, n: p.n }),
        // The card's follow-up for a low morning after a full night: tell the coach, or keep an eye on it.
        next: coached
          ? tr('home:mornings.patternTiredCoach', { defaultValue: 'If it keeps happening, tell your coach.' })
          : tr('home:mornings.patternTiredSelf', { defaultValue: 'If it keeps happening, take it easy and keep an eye on it.' }),
      };
    }
    return null;
  };
  // Above the range switch: its window is its own. Nothing holding says so with Check-ins on; with
  // them off nothing new will come to hold, so the section is left out (ruling 12, as headNone says).
  const patternsBlock = () => {
    if (!patterns) return null;
    const shown = patterns.map((p) => ({ p, lines: patternLines(p) })).filter((x) => x.lines);
    if (!shown.length && !checkinsOn) return null;
    const body = { margin: '6px 0 0', fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 };
    return (
      <section data-bs-mornings-section="patterns" style={{ padding: `22px ${t.padX}px 0` }}>
        {head(tr('home:mornings.patternsTitle', { defaultValue: "What we've noticed" }), teal)}
        {shown.length ? shown.map(({ p, lines }, i) => (
          <div key={p.key} data-bs-mornings-pattern={p.key} style={{ marginTop: i ? 14 : 0, paddingTop: i ? 14 : 0, borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <p data-bs-mornings-pattern-lead="" style={{ margin: 0, fontFamily: t.DISPLAY, fontSize: 17.5, fontWeight: 600, letterSpacing: '-0.012em', lineHeight: 1.28, color: t.INK }}>{lines.lead}</p>
            <p data-bs-mornings-pattern-counts="" style={body}>{lines.counts}</p>
            {lines.next ? <p data-bs-mornings-pattern-next="" style={body}>{lines.next}</p> : null}
            <p data-bs-mornings-pattern-based="" style={{ margin: '6px 0 0', fontFamily: t.BODY, fontSize: 12, lineHeight: 1.4, color: t.INK50 }}>{tr('home:mornings.patternBasedOn', { defaultValue: 'Based on {n, plural, one {# morning} other {# mornings}}.', n: p.mornings })}</p>
          </div>
        )) : <p data-bs-mornings-patterns-none="" style={{ ...body, margin: 0 }}>{tr('home:mornings.patternsNone', { defaultValue: 'Nothing stands out yet. Patterns show here after a few weeks of mornings.' })}</p>}
        <p data-bs-mornings-patterns-foot="" style={{ margin: '12px 0 0', fontFamily: t.BODY, fontSize: 12, lineHeight: 1.4, color: t.INK50 }}>
          {tr('home:mornings.patternsShortRule', { defaultValue: 'A short night is under {h}, or an hour or more under your usual.', h: hm(BS_CI_SHORT_NIGHT_H) })} {tr('home:mornings.patternsOnlyYou', { defaultValue: 'Only you see these.' })}
        </p>
        {BSAskNoraLink ? <BSAskNoraLink t={t} style={{ marginTop: 4 }} label={tr('home:mornings.askNora', { defaultValue: 'Ask Nora about your mornings' })} draft={tr('home:mornings.askNoraDraft', { defaultValue: 'How have my mornings been?' })} /> : null}
      </section>
    );
  };

  // 7 days | 30 days, stuck below the condensed masthead.
  const rangeSwitch = (
    <div data-bs-mornings-range="" style={{ position: 'sticky', top: pinnedTop, zIndex: 3, margin: '18px 0 0', padding: `8px ${t.padX}px`, background: t.PAPER, borderBottom: `1px solid ${t.HAIR}` }}>
      <div role="group" aria-label={tr('home:mornings.rangeAria', { defaultValue: 'Show' })} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 3, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: 3 }}>
        {[7, 30].map((n) => {
          const on = range === n;
          return (
            <button key={n} type="button" aria-pressed={on} onClick={() => setRange(n)} style={{ minHeight: 32, padding: '0 6px', borderRadius: 999, border: 0, cursor: 'pointer', background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70, ...mono, fontSize: 9.5, letterSpacing: '0.1em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {n === 7 ? tr('home:mornings.range7', { defaultValue: '7 days' }) : tr('home:mornings.range30', { defaultValue: '30 days' })}
            </button>
          );
        })}
      </div>
    </div>
  );

  // The window's readiness: each answered morning's, and their average.
  const readinessBlock = () => {
    const scored = model.ready.filter(Boolean);
    const avg = scored.length ? Math.round(scored.reduce((s, r) => s + r.score, 0) / scored.length) : null;
    return (
      <section data-bs-mornings-section="readiness" style={{ padding: `20px ${t.padX}px 0` }}>
        {head(tr('home:mornings.readinessStrip', { defaultValue: 'Readiness' }), teal)}
        {avg != null ? <p data-bs-mornings-avg="" style={{ margin: '0 0 12px', fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25, color: t.INK }}>{tr('home:mornings.readinessAvg', { defaultValue: 'Averaging {score} over {n, plural, one {# morning} other {# mornings}}', score: avg, n: scored.length })}</p> : null}
        {strip('readiness', cellsFor('readiness', model.cur))}
      </section>
    );
  };

  // A section per check the member is asked: its headline, its direction against the window before,
  // and its strip.
  const section = (kind) => {
    const h = bsMorningsHeadline(kind, model.cur);
    const dir = bsMorningsDirection(kind, model.cur, model.prev);
    const cells = cellsFor(kind, model.cur);
    return (
      <section key={kind} data-bs-mornings-section={kind} style={{ padding: `26px ${t.padX}px 0` }}>
        {head(NAME[kind], COLOR[kind])}
        <p data-bs-mornings-headline="" style={{ margin: '0 0 8px', fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 600, letterSpacing: '-0.015em', lineHeight: 1.25, color: t.INK }}>{headline(kind, h)}</p>
        {dir ? (
          <div data-bs-mornings-dir={dir} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '4px 8px', margin: '0 0 12px' }}>
            <span style={{ padding: '4px 9px', borderRadius: 999, border: `1px solid ${COLOR[kind]}66`, color: kind === 'hunger' ? amberText : COLOR[kind], ...mono, fontSize: 8.5, letterSpacing: '0.12em' }}>{dir === 'same' ? same : DIR[kind][dir]}</span>
            {/* "About the same" stands alone: the window before is what every direction is against. */}
            {dir === 'same' ? null : <span style={{ fontFamily: t.BODY, fontSize: 12.5, color: t.INK50 }}>{vs}</span>}
          </div>
        ) : <div style={{ height: 4 }} />}
        {strip(kind, cells)}
        {kind === 'sleep' ? legend(cells) : null}
      </section>
    );
  };

  // Last night from a watch: its tiles dated today, or that it hasn't sent last night yet. Without a
  // watch, where the readings come from and a door to connect one. Signed out there is nothing to say.
  const tile = (key, label, value) => (
    <div key={key} data-bs-mornings-tile={key} style={{ minWidth: 0, padding: '10px 0 4px', borderTop: `1px solid ${t.HAIR}` }}>
      <div style={{ ...mono, fontSize: 8, letterSpacing: '0.12em', color: t.INK50, overflowWrap: 'anywhere' }}>{label}</div>
      <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
    </div>
  );
  const connect = () => { try { window.dispatchEvent(new window.CustomEvent('shape:openIntegrations')); } catch (e) { /* Settings → Integrations is the other way there */ } };
  const watchBlock = () => {
    if (!watch) return null; // signed out, or nothing read yet: `watch` is only built for a member
    if (!watch.has) {
      return (
        <section data-bs-mornings-watch="connect" style={{ padding: `26px ${t.padX}px 0` }}>
          <p style={{ margin: 0, fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{tr('home:mornings.watchConnectLine', { defaultValue: 'Sleep and recovery readings come from a watch.' })}</p>
          <button type="button" onClick={connect} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: t.INK, cursor: 'pointer', ...mono, letterSpacing: '0.14em' }}>
            <span style={{ borderBottom: `2px solid ${COLOR.sleep}`, paddingBottom: 2 }}>{tr('home:mornings.watchConnect', { defaultValue: 'Connect a watch' })}</span><span aria-hidden> →</span>
          </button>
        </section>
      );
    }
    const tiles = [
      watch.hours != null ? tile('hours', tr('home:mornings.tileHours', { defaultValue: 'Slept' }), hm(watch.hours)) : null,
      watch.efficiency != null ? tile('efficiency', tr('home:mornings.tileEfficiency', { defaultValue: 'Efficiency' }), tr('home:mornings.unitPct', { defaultValue: '{n}%', n: Math.round(watch.efficiency) })) : null,
      watch.rhr != null ? tile('rhr', tr('home:mornings.tileRhr', { defaultValue: 'Resting HR' }), tr('home:mornings.unitBpm', { defaultValue: '{n} bpm', n: Math.round(watch.rhr) })) : null,
      watch.hrv != null ? tile('hrv', tr('home:mornings.tileHrv', { defaultValue: 'HRV' }), tr('home:mornings.unitMs', { defaultValue: '{n} ms', n: Math.round(watch.hrv) })) : null,
      watch.recovery != null ? tile('recovery', tr('home:mornings.tileRecovery', { defaultValue: 'Watch recovery' }), Math.round(watch.recovery)) : null,
    ].filter(Boolean);
    return (
      <section data-bs-mornings-watch="on" style={{ padding: `26px ${t.padX}px 0` }}>
        {head(tr('home:mornings.watchTitle', { defaultValue: 'Last night from your watch' }), COLOR.sleep)}
        {tiles.length
          ? <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0 12px' }}>{tiles}</div>
          : <p data-bs-mornings-watchnone="" style={{ margin: 0, fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 }}>{tr('home:mornings.watchNone', { defaultValue: "Your watch hasn't sent last night yet." })}</p>}
      </section>
    );
  };

  const who = uid ? bsCiWhoSees(coaching) : null;
  const whoText = who === 'both' ? tr('home:checkin.whoBoth', { defaultValue: 'Your trainer and nutritionist see your answers.' })
    : who === 'trainer' ? tr('home:checkin.whoTrainer', { defaultValue: 'Your trainer sees your answers.' })
    : who === 'nutritionist' ? tr('home:checkin.whoNutritionist', { defaultValue: 'Your nutritionist sees your answers.' })
    : who === 'you' ? tr('home:checkin.whoYou', { defaultValue: 'Only you see these.' })
    : null;
  const kinds = ['sleep', 'energy', 'rested', ...(coaching.nutritionist === true ? ['hunger'] : [])];
  const note = { margin: '0', padding: `10px ${t.padX}px 0`, fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.45, color: t.INK70 };
  const todayScored = !!(model && model.ready[model.ready.length - 1]);

  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow={tr('home:mornings.eyebrow', { defaultValue: 'Morning check-in · history' })}
        title={<>{tr('home:mornings.titlePre', { defaultValue: 'Your' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('home:mornings.titleWord', { defaultValue: 'mornings.' })}</span></>} />
      <div data-bs-mornings="" style={{ paddingTop: 4 }}>
        {/* The example is said in the note's ink, marked by an amber rule beside it (amber is no text colour). */}
        {!uid ? <p data-bs-mornings-sample="" style={note}><span style={{ display: 'block', paddingLeft: 10, borderLeft: `2px solid ${amber}` }}>{tr('home:mornings.sample', { defaultValue: 'Example mornings. Join Shape to see your own.' })}</span></p> : null}
        {failed ? <p data-bs-mornings-failed="" role="alert" style={{ ...note, color: rust }}>{tr('home:mornings.loadFailed', { defaultValue: "Couldn't load your mornings. Try again in a minute." })}</p> : null}
        {model ? hero() : null}
        {checkinsOn || (model && !todayScored) ? null : offLine(note)}
        {cycleChip ? <div style={{ padding: `0 ${t.padX}px` }}>{cycleChip}</div> : null}
        {model ? (
          <>
            {patternsBlock()}
            {rangeSwitch}
            {readinessBlock()}
            {kinds.map(section)}
            {watchBlock()}
          </>
        ) : null}
        {whoText ? <p data-bs-mornings-who="" style={{ ...note, padding: `26px ${t.padX}px 0`, fontSize: 13, color: t.INK50 }}>{whoText}</p> : null}
      </div>
      <div style={{ height: 28 }} />
    </BSPage>
  );
}

// Progress's door to the page, on Overall where its Energy, Hunger and Rested tabs were: a dot-leader
// row in the Open Ledger's grammar. It carries its own translator, so Progress, which has none, stays
// as the i18n inventory records it.
export function BSMorningsDoor({ onOpen }) {
  const { useBS } = window;
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  return (
    <button type="button" data-bs-mornings-door="" onClick={() => { if (onOpen) onOpen(); }} style={{ display: 'flex', alignItems: 'baseline', gap: 9, width: '100%', minHeight: 44, boxSizing: 'border-box', margin: '0 0 24px', padding: '12px 0', border: 0, borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}`, background: 'transparent', color: t.INK, cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, letterSpacing: '-0.01em', color: t.INK }}>
        {tr('home:mornings.link', { defaultValue: 'Your mornings' })}
        <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('home:mornings.doorSub', { defaultValue: 'Sleep, energy and how you woke up, day by day' })}</span>
      </span>
      <span aria-hidden style={{ flex: 1, minWidth: 14, borderBottom: `1px dotted ${t.RULE}`, transform: 'translateY(-4px)' }} />
      <span aria-hidden style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: teal }}>→</span>
    </button>
  );
}
