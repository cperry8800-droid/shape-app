import React from 'react';
import { BSFocusLead, BSFocusCountdown, BSFocusActions, BSFocusTitle, BSFocusLink } from './BSFocus.jsx';
import { BSTrainBurn } from './BSTrainBurn.jsx';
import { BSWeekDays, bsWeekDaysOf } from './BSWeekDays.jsx';

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
//   · On deck: the next three days, each opening on the page; Plan opens the calendar;
//   · the links (music, the full plan, build, an open session), then finding a coach (handed in, so a
//     member who pays a trainer is never sent to find one).
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
        {cur.selfAuthored ? (
          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 9, flexWrap: 'wrap' }}>
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
              // Display-only abbreviation ("3 min rest" → "3m", "90s rest" → "90s"); the stored scheme string
              // is untouched (the session parser reads r.s).
              const sch = String(r.s || '').replace(/(\d+)\s*min rest/g, '$1m').replace(/(\d+)s rest/g, '$1s');
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

      {/* This week — on deck: the next three days after today, from the same week as the calendar and Home.
          Tap to jump there. */}
      <BSFocusTitle kicker={tr('home:section.thisWeek', { defaultValue: 'This week' })} title={tr('session:train.onDeck', { defaultValue: 'On deck' })}
        right={act(tr('session:train.plan', { defaultValue: 'Plan' }), p.onMonth)} />
      <div data-train-ondeck="" style={{ padding: `10px ${t.padX}px 0` }}>
        {[1, 2, 3].map((off) => {
          const idx = (todayIdx + off) % 7;
          const d = program[idx] || {};
          const rest = d.tag === 'REST';
          return { idx, m: rest ? tr('session:train.activeRest', { defaultValue: 'Active rest' }) : (d.headline || d.title || '—'), s: `${shortDay(idx)} · ${rest ? tr('session:train.restSub', { defaultValue: 'walk + mobility' }) : (d.meta || '')}` };
        }).map((x, i) => (
          <button type="button" key={i} onClick={() => p.onDay && p.onDay(x.idx)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', minHeight: 44, padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600, marginTop: 3 }}>{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 400, lineHeight: 1.2, color: t.INK, letterSpacing: '-0.01em' }}>{x.m}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{x.s}</div>
            </div>
            <span />
          </button>
        ))}
      </div>

      {/* The rest of Train, one row each: the coach's music for today (Shape Radio), the full plan, then
          building or opening a session; then finding a coach, which the page hands in only for a member who
          pays no trainer (Codex on #2378). */}
      <div data-train-links="" style={{ marginTop: (t.sectGap || 22) + 8 }}>
        {(Array.isArray(p.links) ? p.links : []).map((l, i) => (
          <BSFocusLink key={i} color={l.color} glyph={l.glyph} label={l.label} tag={l.tag} onOpen={l.onOpen} />
        ))}
        {p.findCoach || null}
      </div>
    </div>
  );
}
