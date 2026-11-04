import React from 'react';
import { createPortal } from 'react-dom';
import { createMobileVideoComponents } from '../services/videoComponents.mjs';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType } from './bsCleanType.jsx';
import { bsMpGlass } from './BSMemberBento.jsx';
import { bsRaised } from './BSProInstrument.jsx';
// ─── THE WORKOUT DETAIL PAGE (Home → I'll train today, and the Library's saved workout) ────────
// The owner asked for a new design for this page and for the three in-workout views (owner,
// 2026-11-04: "new design for this", then "B for all of them", "the training ones i mean"), and
// picked the glass look of the three offered: a raised card holds the day (the date, the title, its
// four figures), the coach's note and the plan sit on glass, and Begin session is held at the foot
// above the tab bar, the way the live session holds its one action (BSWorkoutSession.jsx).
// Moved out of iosAppBroadsheetClient.jsx when it was rebuilt, as BSLeaderboard and BSGoals were
// (the WORKLOG rule: a PR that touches a self-contained screen moves it into its own module).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx). This file is
// a static import of the client module, so it evaluates before that module's body has put
// BSMeCorner, BSPlaylistCard and the library on window; a top-level read would capture undefined
// (React error #130). The component names the globals it needs on its first line.

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

// The client's bsTHexA, copied rather than imported: a feature module never imports back into the client.
const hexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const kick = (t, size, color, extra) => ({ fontFamily: t.MONO, fontSize: size, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color, ...extra });
const tabular = { fontVariantNumeric: 'tabular-nums' };
// The chrome's masthead inset, for a harness that has not loaded the chrome.
const BS_MAST_TOP_CSS = 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';

// The coach's walkthrough players, made on first use rather than when the module evaluates.
let bsWdVideo = null;
const bsWdVideoPlayer = () => (bsWdVideo || (bsWdVideo = createMobileVideoComponents(React))).ShapeVideoPlayer;

// The signed-out preview's day (and the stand-in for a live workout that carries no detail yet).
// ⚠ THE CREDIT, THE PLAYLIST AND THE SAVED ITEM ARE THE SAMPLE DAY'S ON EVERY DAY, as they were before
// the redesign: a live workout reads its own title, figures, note and moves, but the note is still
// credited to Jordan Chen, the soundtrack is his, and Save files the sample workout. Reading the day's
// real coach and playlist is its own change; this one only redrew the page.
const BS_WD_DEMO_META = '52 min · 6 moves · RPE 8 · ~420 kcal';
const BS_WD_DEMO_NOTE = 'Peak week — tempo matters more than load. 3s eccentric on every pull. If bar speed drops, drop a rep, not the tempo.';
const BS_WD_DEMO_MOVES = [
  { name: 'Pull-up',        scheme: '4 × 6-8 · 3 min rest', cue: 'Dead hang. Chest to bar.',      load: '42 lb', up: true },
  { name: 'Barbell row',    scheme: '4 × 8 · 2 min rest',   cue: 'Hinge 45°, pull to sternum.',   load: '155 lb' },
  { name: 'Chest-sup. row', scheme: '3 × 10 · 90s rest',    cue: 'Pause 1s at peak contraction.', load: '60 lb' },
  { name: 'Face pull',      scheme: '3 × 15 · 60s rest',    cue: 'External rotation at the top.', load: '35 lb' },
  { name: 'Incline curl',   scheme: '3 × 12 · 60s rest',    cue: 'Full stretch. 3s eccentric.',   load: '27.5 lb' },
  { name: 'Farmer carry',   scheme: '3 × 40m · 60s rest',   cue: 'Crush grip. Ribs down.',        load: '80 lb' },
];
const BS_WD_PLAYLIST = {
  kicker: 'Jordan Chen · Your coach', title: 'Pull heavy.', meta: '52m · 95-138 BPM · 14 tracks', color: '#1db954',
  spotifyUrl: 'https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP',
  tracks: [
    { a: 'Iron Count', b: 'Tariq Osei', len: '3:38' },
    { a: 'Chalk & Steel', b: 'Sable', len: '4:02' },
    { a: 'Top Set', b: 'Linnea Aho', len: '3:21' },
    { a: 'Overhand', b: 'Samyuel', len: '3:54' },
    { a: 'Lat Spread', b: 'Mara Vance', len: '4:16' },
    { a: 'Last Rep', b: 'Shape Radio', len: '3:45' },
  ],
};
const BS_WD_SAVE_ITEM = { id: 'workout:upper-pull-peak', kind: 'workout', title: 'Upper Pull — Peak', meta: '52 min · 6 moves · RPE 8', coach: 'Jordan Chen' };
const BS_WD_NOTE_CREDIT = 'Jordan Chen · Trainer · notes';

// "52 min · 6 moves · RPE 8 · ~420 kcal" → the hero's four figures, each its number over its word
// ({ v: '52', l: 'min' }, …, { v: '8', l: 'RPE' }). A part with no number reads whole.
function bsWorkoutDetailStats(meta) {
  return String(meta || '').split('·').map((s) => s.trim()).filter(Boolean).map((s) => {
    let m = s.match(/^(~?[\d.,:]+)\s*(.*)$/);
    if (m) return { v: m[1], l: m[2] };
    m = s.match(/^(.*?)\s+(~?[\d.,:]+)$/);
    return m ? { v: m[2], l: m[1] } : { v: s, l: '' };
  });
}

export function BSWorkoutDetail({ workout = null, day = null, onBack, onMove = () => {}, onStart = () => {}, onMessage = () => {} }) {
  const { useBS, BSPage, BSMastRow, BSBackRow, BSMeCorner, BSFooter, BSPlaylistCard, useBSLibrary, bsLibToggle, bsDateLocale } = window;
  const tr = useShapeTr();
  const t0 = useBS();
  // Home's clean type (Geist heads, Inter Tight words) under the chrome, which keeps its own.
  const t = { ...t0, DISPLAY: BS_CLEAN_SANS, BODY: BS_CLEAN_SANS, HEAD: BS_CLEAN_HEAD };
  const [reminded, setReminded] = React.useState(false);
  const lib = useBSLibrary();
  const saved = lib.some((x) => x.id === BS_WD_SAVE_ITEM.id);
  const ShapeVideoPlayer = bsWdVideoPlayer();
  const INK = t.INK, px = t.padX, rust = t.RUST || '#c0533b';
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const onTeal = t.isLight ? '#ffffff' : '#04201d';
  const HEAD = BS_CLEAN_HEAD, SANS = BS_CLEAN_SANS;

  const detail = workout && workout.detail;
  const wkTitle = (workout && workout.title) || 'Upper Pull — Peak';
  const wkMeta = (detail && detail.meta) || BS_WD_DEMO_META;
  const wkNote = (detail && detail.note) || BS_WD_DEMO_NOTE;
  const moves = (detail && detail.moves) || BS_WD_DEMO_MOVES;
  const stats = bsWorkoutDetailStats(wkMeta);
  // "Today · Thu Jun 4 · 5:45 PM" for today's session; another day's (`day`, the day picked in Home's
  // This week) reads its own date with no Today (Codex P1 on #2599: a Saturday session read "Today ·
  // Wed"). Weekday/month tokens follow the selected UI language (i18n date-locale rule).
  const wd = day instanceof Date && !isNaN(day) ? day : new Date();
  const isToday = (() => { const n = new Date(); return wd.getFullYear() === n.getFullYear() && wd.getMonth() === n.getMonth() && wd.getDate() === n.getDate(); })();
  const dateLoc = bsDateLocale ? bsDateLocale() : undefined;
  const dow = wd.toLocaleDateString(dateLoc, { weekday: 'short' });
  const mon = wd.toLocaleDateString(dateLoc, { month: 'short' });
  const timeLabel = (() => {
    const [h, m] = String((workout && workout.time) || '09:00').split(':').map(Number);
    if (Number.isNaN(h)) return '9:00 AM';
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
  })();

  const planLabel = tr('home:workoutPreview.plan', { defaultValue: 'Plan' });
  const countLabel = tr('home:workoutPreview.moves', { defaultValue: '{count, plural, one {# move} other {# moves}}', count: moves.length });
  const beginLabel = tr('home:workoutPreview.begin', { defaultValue: 'Begin session →' });
  const eyebrow = tr('home:workoutPreview.eyebrow', { defaultValue: 'Preview' });
  // Save, Move session and Remind me, three glass keys; a key that is on reads in teal.
  const keyStyle = (on) => ({ ...bsMpGlass(t, INK, { radius: 14 }), ...(on ? { border: `1px solid ${hexA(teal, 0.55)}` } : null), minHeight: 46, padding: '0 6px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? teal : INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' });
  const initials = BS_WD_NOTE_CREDIT.split('·')[0].trim().split(/\s+/).map((p) => p[0]).join('').slice(0, 2).toUpperCase();

  // ⚠ ONE PLACE FOR BACK: the masthead row, then BSBackRow directly under it (tests/back-placement).
  const chrome = (
    <>
      <div style={{ padding: `${window.BS_MAST_TOP_CSS || BS_MAST_TOP_CSS} ${t0.padX}px 0` }}>
        {BSMastRow && <BSMastRow trailing={<BSMeCorner />} />}
      </div>
      <div style={{ padding: `0 ${t0.padX}px 2px` }}>
        <BSBackRow onBack={onBack} trailing={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: t0.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: rust }}>{eyebrow}</span>
          <button onClick={onMessage} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, minHeight: 44, fontFamily: t0.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t0.INK50 }}>{tr('home:action.message', { defaultValue: 'Message' })}</button>
        </span>} />
      </div>
    </>
  );

  const body = (
    <>
      {/* The day: a raised card, its figures as four tiles inside it. */}
      <div data-wd-hero="" style={{ margin: `14px ${px}px 0`, ...bsRaised(t, teal), borderRadius: 22, padding: '16px 16px 14px' }}>
        <div style={kick(t, 8.5, t.INK50, { fontWeight: 700, letterSpacing: '0.2em' })}>{isToday ? <>{tr('home:when.today', { defaultValue: 'Today' })} · </> : null}{dow} {mon} {wd.getDate()} · {timeLabel}</div>
        <div style={{ marginTop: 8, fontFamily: HEAD, fontSize: 28, fontWeight: 700, color: INK, letterSpacing: '-0.035em', lineHeight: 1.04 }}>{wkTitle}<span style={{ color: teal }}>.</span></div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, gap: 6 }}>
          {stats.map((s, i) => (
            <div key={i} data-wd-stat="" style={{ borderRadius: 12, padding: '9px 9px 8px', background: hexA(INK, t.isLight ? 0.045 : 0.06), border: `1px solid ${hexA(INK, 0.08)}`, minWidth: 0 }}>
              <div style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: INK, lineHeight: 1, letterSpacing: '-0.02em', ...tabular }}>{s.v}</div>
              <div style={{ marginTop: 4, ...kick(t, 7, t.INK50, { fontWeight: 700, letterSpacing: '0.12em' }) }}>{s.l}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ padding: `0 ${px}px` }}>
        <ShapeVideoPlayer value={workout?.programVideo} title={tr('coach:video.programIntro', { defaultValue: 'Program introduction' })} />
        <ShapeVideoPlayer value={workout?.video} title={tr('coach:video.workoutWalkthrough', { defaultValue: 'Workout walkthrough' })} />
      </div>

      {/* The coach's note on glass, credited with the trainer's monogram (rust, the trainer's role). */}
      <div data-wd-note="" style={{ margin: `10px ${px}px 0`, ...bsMpGlass(t, INK, { radius: 18 }), padding: '13px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        <span aria-hidden style={{ flexShrink: 0, width: 34, height: 34, borderRadius: 999, display: 'grid', placeItems: 'center', background: hexA(rust, 0.16), border: `1px solid ${hexA(rust, 0.45)}`, color: rust, fontFamily: HEAD, fontSize: 12, fontWeight: 700 }}>{initials}</span>
        <div style={{ minWidth: 0 }}>
          <div style={kick(t, 7.5, t.INK50, { fontWeight: 700 })}>{BS_WD_NOTE_CREDIT}</div>
          <div style={{ marginTop: 5, fontFamily: SANS, fontSize: 13.5, lineHeight: 1.45, color: INK }}>“{wkNote}”</div>
        </div>
      </div>

      {/* The plan: one glass list, each move numbered, its load a pill (teal + when it goes up). */}
      <div style={{ padding: `22px ${px}px 8px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...kick(t, 9, INK, { letterSpacing: '0.2em' }) }}>
          <span aria-hidden style={{ width: 12, height: 2, background: teal, borderRadius: 2 }} />{planLabel}
        </span>
        <span style={{ padding: '4px 10px', borderRadius: 999, background: hexA(INK, t.isLight ? 0.05 : 0.07), fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70 }}>{countLabel}</span>
      </div>
      <div data-wd-plan="" style={{ margin: `0 ${px}px`, ...bsMpGlass(t, INK, { radius: 20 }), padding: '2px 14px' }}>
        {moves.map((m, i) => (
          <div key={m.name} data-wd-move="" style={{ display: 'grid', gridTemplateColumns: '30px minmax(0, 1fr) auto', columnGap: 12, alignItems: 'start', padding: '12px 0', borderTop: i ? `1px solid ${hexA(INK, 0.08)}` : 0 }}>
            <span style={{ width: 30, height: 30, borderRadius: 9, display: 'grid', placeItems: 'center', background: hexA(teal, 0.12), color: teal, fontFamily: t.MONO, fontSize: 10, fontWeight: 800 }}>{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: SANS, fontSize: 15.5, fontWeight: 650, color: INK, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{m.name}</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{m.scheme}</div>
              {m.cue && <div style={{ marginTop: 3, fontFamily: SANS, fontSize: 12.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.35 }}>“{m.cue}”</div>}
            </div>
            {m.load ? <span style={{ marginTop: 2, padding: '5px 9px', borderRadius: 999, border: `1px solid ${m.up ? hexA(teal, 0.5) : hexA(INK, 0.14)}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: INK, whiteSpace: 'nowrap', ...tabular }}>{t.uText(m.load)}{m.up ? <span style={{ color: teal }}> +</span> : null}</span> : <span />}
          </div>
        ))}
      </div>

      <div data-wd-actions="" style={{ margin: `12px ${px}px 0`, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8 }}>
        {/* The library's own words for a save, as its Save button everywhere else writes them. */}
        <button onClick={() => bsLibToggle(BS_WD_SAVE_ITEM)} style={keyStyle(saved)}>{saved ? '✓ Saved' : '♡ Save'}</button>
        <button onClick={onMove} style={keyStyle(false)}>{tr('home:workoutPreview.moveSession', { defaultValue: 'Move session' })}</button>
        <button onClick={() => setReminded(true)} style={keyStyle(reminded)}>{reminded ? tr('home:workoutPreview.reminderSet', { defaultValue: '✓ Reminder set' }) : tr('home:workoutPreview.remindMe', { defaultValue: 'Remind me' })}</button>
      </div>

      {/* Pre-workout playlist — tap the play button to open it in Spotify before training. */}
      <div style={{ padding: `24px ${px}px 4px` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 10 }}>
          <span style={kick(t, 8.5, teal, { letterSpacing: '0.2em' })}>{tr('home:workoutPreview.soundtrack', { defaultValue: 'Soundtrack' })}</span>
          <span style={{ fontFamily: HEAD, fontSize: 18, fontWeight: 700, color: INK, letterSpacing: '-0.02em' }}>{tr('home:workoutPreview.preWorkout', { defaultValue: 'Pre-workout' })}</span>
        </div>
        <BSPlaylistCard {...BS_WD_PLAYLIST} />
      </div>
      {/* Room for the held Begin session, so the footer is never under it. */}
      <div style={{ height: 70 }} />
      <BSFooter right={eyebrow} />
    </>
  );

  // Begin session, held above the tab bar on a fade of the paper (portalled into the phone surface,
  // as the live session's action is).
  const startBar = (
    <div data-bs-clean="" data-wd-start="" style={{ position: 'absolute', left: 0, right: 0, bottom: (window.BS_TABBAR_CSS || window.BS_TABBAR_H || 64), zIndex: 55, padding: `16px ${px}px 10px`, background: `linear-gradient(180deg, transparent, ${t.PAPER} 42%)`, pointerEvents: 'none' }}>
      <button onClick={onStart} style={{ pointerEvents: 'auto', width: '100%', minHeight: 52, borderRadius: 16, border: 0, background: teal, color: onTeal, cursor: 'pointer', fontFamily: SANS, fontSize: 15, fontWeight: 700, boxShadow: `0 12px 28px -12px ${hexA(teal, 0.85)}, inset 0 1px 0 rgba(255,255,255,0.35)` }}>{beginLabel}</button>
    </div>
  );
  const surface = typeof document !== 'undefined' && document.getElementById && document.getElementById('bs-phone-surface');

  return (
    <BSPage>
      {chrome}
      <BSCleanType t={t}>{body}</BSCleanType>
      {surface ? createPortal(startBar, surface) : startBar}
    </BSPage>
  );
}
