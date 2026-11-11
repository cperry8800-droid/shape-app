import React from 'react';
import { BSFocusLead, BSFocusCountdown, BSFocusActions, BSFocusTitle, BSFocusLink } from './BSFocus.jsx';
import { BSTrainBurn } from './BSTrainBurn.jsx';
import { BSWeekDays, bsWeekDaysOf } from './BSWeekDays.jsx';
import { BSCoachExercises, BSCoachExercisesView } from './BSCoachExercises.jsx';

// ─── TRAIN · THE DAY ──────────────────────────────────────────────────────────────────────────
// The member's Train page under its head, in the owner's C for Train (2026-11-04: "C for tainer page but
// make these glow when day selected like in option b"), restored on their word the same day ("no revert
// training to what i had prior", after "dont like this" of the instrument page that replaced it):
//   · the week as seven lit tiles, the day picked glowing (BSWeekDays lit), with Month view;
//   · the coach's adjust (the page's own banner, handed in);
//   · Burned this week as a lit slot in Train's rust (BSTrainBurn), opening the week day by day;
//   · the session hanging from it by a dotted line on a glass card with a glowing 4px rust spine
//     (BSFocusLead lit): when, Your move or Rest, the head, the coach's chips, the day's soundtrack,
//     how long until it starts, who wrote it (Edit · Yours on a day the member wrote), and Start
//     session as a glowing capsule with Swap beside it (BSFocusActions lit), or a Rest chip;
//   · the program as a table, a row a move, each opening that move's swap; Swap at its head;
//   · the exercises the member's trainer added that day from the website's Live console, under the
//     program, off the page's own read (`coachRead`, the one its Start session runs them from: today's are
//     part of the session, so the list says so and has no Start of its own); without one handed in,
//     BSCoachExercises.jsx reads them itself;
//   · On deck: the next three days, each a preview of the session (its time, length and effort, its
//     first moves, its playlist) opening the full plan on that day; Plan opens the full plan (owner,
//     2026-11-10: "there should be a better preview of what actually is 'on deck'"). The sheet is the
//     page's (BSTrainPlan.jsx); Month view on the week still opens the calendar;
//   · the links (the full plan, build, an open session), then finding a coach (handed in, so a member
//     who pays a trainer is never sent to find one). The coach's music is no link of its own: each
//     playlist sits in the page's Playlists under the workouts it plays with (owner, 2026-11-10).
// The page (BSClientTrain) owns the data and every handler and hands them in; nothing here reads a plan
// or writes one. Every word is a catalog key the page already had.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx), and this module
// never imports the client module.

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

const locale = () => (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
// A weekday's short name in the reader's language (Monday first), as the page's own helper gives it.
function shortDay(idx) {
  const now = new Date();
  const mon = new Date(now); mon.setHours(0, 0, 0, 0); mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  const d = new Date(mon); d.setDate(mon.getDate() + idx);
  try { return new Intl.DateTimeFormat(locale(), { weekday: 'short' }).format(d); } catch (e) { return new Intl.DateTimeFormat(undefined, { weekday: 'short' }).format(d); }
}
// Display-only abbreviation ("3 min rest" → "3m", "90s rest" → "90s"); the stored scheme string is untouched.
const schemeOf = (s) => String(s || '').replace(/(\d+)\s*min rest/g, '$1m').replace(/(\d+)s rest/g, '$1s');

export function BSTrainDay(p) {
  const t = window.useBS();
  const tr = useShapeTr();
  const cur = p.cur || {};
  const moves = Array.isArray(p.moves) ? p.moves : [];
  const program = Array.isArray(p.program) ? p.program : [];
  const day = p.day || 0;
  const isRest = !!p.isRest;
  const RUST = t.RUST || '#c0533b';
  // A section title's one action, in the design's grammar (accent mono caps).
  const act = (label, onClick) => (
    <button type="button" onClick={onClick} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', minHeight: 44, marginBottom: -6, background: 'transparent', border: 0, padding: '0 2px', color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>{label} →</button>
  );
  const weekWord = tr('common:unit.weekN', { defaultValue: 'Week {n}', n: p.weekN });
  const until = p.until;
  const todayIdx = bsWeekDaysOf().todayIdx;

  return (
    <div data-train-day="">
      <BSWeekDays look="lit" activeIdx={day} onSelect={p.onDay} restFlags={program.map((d) => d && d.tag === 'REST')} onMonth={p.onMonth} />

      {p.adjust || null}

      {/* Burned this week, under the week as Eat's Fuel left is (owner, 2026-10-24); it opens the week day by day. */}
      <BSTrainBurn onOpen={p.onBurn || null} />

      {/* The session — on its own, on the move line's rust spine, lit. */}
      <BSFocusLead lit tour="hero-train" color={RUST}
        kicker={`${p.when || ''} · ${isRest ? tr('session:train.restChip', { defaultValue: 'Rest' }) : tr('home:lead.railHeader', { defaultValue: 'Your move' })}`}
        kickerRight={`${weekWord} · ${tr('session:train.dayN', { defaultValue: 'D{n}', n: day + 1 })}`}
        title={p.head}
        sub={moves.length > 0 ? cur.meta : cur.copy}>
        {cur.coachAdjust && (cur.intensityLabel || cur.coachFocus) && (
          <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {cur.coachFocus && <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.ACCENT, border: `1px solid ${t.ACCENT}66`, borderRadius: 3, padding: '3px 8px' }}>{cur.coachFocus}</span>}
            {cur.intensityLabel && <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70, border: `1px solid ${t.RULE}`, borderRadius: 3, padding: '3px 8px' }}>{tr('session:train.coachIntensity', { defaultValue: 'Coach · {label}', label: cur.intensityLabel })}</span>}
          </div>
        )}
        {/* The coach's playlist for this day, as the website card chips it ("♪ name · meta"). It is a Shape
            Radio soundtrack, so it opens Radio. A coach-set rest keeps the day's fields but is no session, so
            it shows no soundtrack. */}
        {!isRest && cur.playlist && cur.playlist.name && (
          <button type="button" data-train-soundtrack="" onClick={p.onRadio} style={{ marginTop: 6, minHeight: 44, maxWidth: '100%', display: 'flex', alignItems: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}>
            <span style={{ minWidth: 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.ACCENT, border: `1px solid ${t.ACCENT}66`, borderLeft: `3px solid ${t.ACCENT}`, borderRadius: 3, padding: '5px 9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>♪ {cur.playlist.name}{cur.playlist.meta ? ` · ${cur.playlist.meta}` : ''}</span>
          </button>
        )}
        <BSFocusCountdown label={tr('session:train.startsIn', { defaultValue: 'Starts in' })}
          value={until ? (until.h > 0 ? tr('session:train.untilHourMin', { defaultValue: '{h}h {m}m', h: until.h, m: until.m }) : tr('session:train.untilMin', { defaultValue: '{m} min', m: until.m })) : null} />
        {/* Who wrote the day — honest byline: "Programmed by you" (or the program name · Wn) on self days,
            the real assigning trainer on coach days, and nothing at all when no coach authored it. */}
        {/* Edit reaches 6px under this row and the lit Start 7px over its own (44px targets round smaller
            words), so 5px more under this row keeps the two apart (8 + 5 = 13). */}
        {cur.selfAuthored ? (
          <div style={{ marginTop: 8, marginBottom: 5, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>{cur.program && cur.program.name ? cur.program.name : tr('session:train.programmedByYou', { defaultValue: 'Programmed by you' })}{cur.program && cur.program.week ? ` · ${tr('session:train.yourProgramWeek', { defaultValue: 'Your program · Week {n}', n: cur.program.week })}` : ''}</span>
            {p.onEditYours && (
              <button type="button" onClick={p.onEditYours} style={{ background: 'transparent', border: 0, cursor: 'pointer', minHeight: 44, marginBlock: -6, padding: 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.ACCENT }}>{tr('session:train.editYours', { defaultValue: 'Edit · Yours' })}</button>
            )}
          </div>
        ) : p.coach ? (
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>{p.coach} · <span style={{ color: t.INK50 }}>{tr('session:train.coachRole', { defaultValue: 'Coach · Trainer' })}</span></div>
        ) : null}
        {!isRest ? (
          <BSFocusActions lit color={RUST}
            primary={{ label: `${tr('session:train.startAria', { defaultValue: 'Start session' })} →`, onClick: p.onStart }}
            secondary={moves.length > 0 ? { label: `${tr('session:train.swap', { defaultValue: 'Swap' })} →`, onClick: p.onSwap } : null} />
        ) : (
          <div style={{ marginTop: 14 }}>
            <span data-train-rest="" style={{ display: 'inline-block', padding: '8px 12px', borderRadius: 3, border: `1px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{tr('session:train.restChip', { defaultValue: 'Rest' })}</span>
          </div>
        )}
      </BSFocusLead>

      {/* Workout — the moves. Tap a move (or Swap) to pick a coach-approved sub. */}
      {moves.length > 0 && (
        <>
          <BSFocusTitle kicker={tr('session:train.programKicker', { defaultValue: 'The program' })} title={tr('session:train.moveCount', { defaultValue: `${moves.length} move${moves.length === 1 ? '' : 's'}`, count: moves.length })}
            right={act(tr('session:train.swap', { defaultValue: 'Swap' }), p.onSwap)} />
          <div data-train-program="" style={{ padding: `10px ${t.padX}px 0` }}>
            <div aria-hidden style={{ display: 'grid', gridTemplateColumns: '22px 1fr 92px 52px', gap: 10, padding: '0 0 7px', borderBottom: `1.5px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>
              <span>{tr('session:train.col.n', { defaultValue: 'N' })}</span><span>{tr('session:train.col.move', { defaultValue: 'Move' })}</span><span>{tr('session:train.col.scheme', { defaultValue: 'Scheme' })}</span><span style={{ textAlign: 'right' }}>{tr('session:train.col.load', { defaultValue: 'Load' })}</span>
            </div>
            {moves.map((r, i) => {
              const swapped = !!(p.swapped && p.swapped[i]);
              // Display-only (schemeOf): the session parser reads r.s.
              const sch = schemeOf(r.s);
              return (
                <button type="button" key={i} onClick={() => p.onMove && p.onMove(i)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr 92px 52px', gap: 10, alignItems: 'baseline', minHeight: 44, padding: '12px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{r.n}</span>
                  <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.m}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>{tr('session:train.swapped', { defaultValue: 'SWAPPED' })}</span>}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.02em' }}>{sch}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK, fontWeight: 600, textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.l}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* The exercises the trainer added to this day from the Live console, under the day's own program. */}
      {p.coachRead
        ? <BSCoachExercisesView read={p.coachRead} date={p.coachDate} today={day === todayIdx} dayLabel={shortDay(day)} onRetry={p.onCoachRetry} inSession />
        : <BSCoachExercises dayIdx={day} today={day === todayIdx} dayLabel={shortDay(day)} />}

      {/* This week — on deck: the next three days after today, from the same week as the calendar and Home.
          Each is a preview of the session: the day, its time and length, its first moves and its
          playlist; a tap opens the full plan on that day, and Plan opens it on today. */}
      <BSFocusTitle kicker={tr('home:section.thisWeek', { defaultValue: 'This week' })} title={tr('session:train.onDeck', { defaultValue: 'On deck' })}
        right={act(tr('session:train.plan', { defaultValue: 'Plan' }), () => (p.onPlan ? p.onPlan(null) : p.onMonth && p.onMonth()))} />
      <div data-train-ondeck="" style={{ padding: `10px ${t.padX}px 0` }}>
        {[1, 2, 3].map((off, i) => {
          const idx = (todayIdx + off) % 7;
          const d = program[idx] || {};
          const rest = d.tag === 'REST';
          // The moves as the page hands them, the member's swaps on (`movesOf`, the full plan's too), so the
          // preview and the plan it opens never disagree (Codex on #2669).
          const dm = rest ? [] : ((typeof p.movesOf === 'function' ? p.movesOf(idx) : d.moves) || []);
          const head = String(d.headline || d.title || '—').replace(/\s*\n\s*/g, ' ');
          const line = rest ? tr('session:train.restSub', { defaultValue: 'walk + mobility' }) : [d.timeLabel, d.meta].filter(Boolean).join(' · ');
          const tomorrow = off === 1;
          return (
            <button type="button" key={idx} data-ondeck-day={idx} onClick={() => (p.onPlan ? p.onPlan(idx) : p.onDay && p.onDay(idx))}
              style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '40px 1fr 14px', gap: 12, alignItems: 'start', minHeight: 44, padding: '14px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
              {/* The day, Tomorrow's in the accent. No date: past Sunday On deck reads this week's day again, as
                  the week repeats, and a date would claim next week's plan, which nothing has read. */}
              <span data-ondeck-dow="" style={{ paddingTop: 3, fontFamily: t.HEAD || t.DISPLAY, fontSize: 15, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.01em', color: tomorrow ? t.ACCENT : rest ? t.INK50 : t.INK }}>{shortDay(idx)}</span>
              <span style={{ minWidth: 0, display: 'block' }}>
                {tomorrow ? <span style={{ display: 'block', marginBottom: 3, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.ACCENT }}>{tr('home:when.tomorrow', { defaultValue: 'Tomorrow' })}</span> : null}
                <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 600, lineHeight: 1.2, color: rest ? t.INK70 : t.INK, letterSpacing: '-0.01em' }}>{rest ? tr('session:train.activeRest', { defaultValue: 'Active rest' }) : head}</span>
                {line ? <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{line}</span> : null}
                {/* Its first three moves, then how many more */}
                {dm.length > 0 ? (
                  <span data-ondeck-moves="" style={{ display: 'block', marginTop: 8, paddingLeft: 9, borderLeft: `2px solid ${t.RULE}` }}>
                    {dm.slice(0, 3).map((m, j) => (
                      <span key={j} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '2px 0' }}>
                        <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.m}</span>
                        <span style={{ flex: 'none', fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.02em' }}>{schemeOf(m.s)}</span>
                      </span>
                    ))}
                    {dm.length > 3 ? <span style={{ display: 'block', paddingTop: 2, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('session:train.moreMoves', { defaultValue: '+{count} more', count: dm.length - 3 })}</span> : null}
                  </span>
                ) : null}
                {/* The playlist the coach set on it */}
                {!rest && d.playlist && d.playlist.name ? (
                  <span data-ondeck-playlist="" style={{ display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box', marginTop: 8, padding: '4px 8px', border: `1px solid ${t.ACCENT}66`, borderLeft: `3px solid ${t.ACCENT}`, borderRadius: 3, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.ACCENT, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>♪ {d.playlist.name}</span>
                ) : null}
              </span>
              <span aria-hidden="true" style={{ paddingTop: 16, fontFamily: t.MONO, fontSize: 12, color: t.INK50 }}>→</span>
            </button>
          );
        })}
      </div>

      {/* The rest of Train, one row each: the full plan, then building or opening a session; then finding a
          coach, which the page hands in only for a member who pays no trainer (Codex on #2378). */}
      <div data-train-links="" style={{ marginTop: (t.sectGap || 22) + 8 }}>
        {(Array.isArray(p.links) ? p.links : []).map((l, i) => (
          <BSFocusLink key={i} color={l.color} glyph={l.glyph} label={l.label} tag={l.tag} onOpen={l.onOpen} />
        ))}
        {p.findCoach || null}
      </div>
    </div>
  );
}
