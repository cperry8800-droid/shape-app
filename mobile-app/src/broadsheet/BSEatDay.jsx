import React from 'react';
import { BSFocusLead, BSFocusArrival, BSFocusActions, BSFocusLine } from './BSFocus.jsx';
import { BSEatFuel } from './BSEatFuel.jsx';
import { BSWeekDays, bsWeekDaysOf } from './BSWeekDays.jsx';
import { BSCoachMeals } from './BSCoachMeals.jsx';

// ─── EAT · THE DAY VIEW'S TOP ─────────────────────────────────────────────────────────────────────
// Eat's Day view under its head and tabs, in the owner's pick for Eat (2026-11-04: "option C for eat but
// use this for fuel section and 2nd image for fuel left today"), restored on their word the same day
// ("use this again", of a shot of it, after the orbit that replaced it):
//   · the week as seven round days, the day picked filled and glowing (BSWeekDays round), Month view;
//   · the plan's notices (a coach's Adjust, a nutritionist preparing the plan, a read that failed);
//   · Fuel left today as one glass card, a ring of the day's kcal with what is left inside it and each
//     macro beside it, each opening its own page (BSEatFuel); another day picked names its day;
//   · the next meal, today only, on a lit glass lead with its glowing Log it and Swap (BSFocusLead and
//     BSFocusActions lit), and where now sits between the last meal and it (BSFocusArrival);
//   · the morning swap, when a made-ahead meal was not prepped last night;
//   · the menu: the day as a line, each meal at its time, the NOW tick today (BSFocusLine), or, empty,
//     the page's line offering Nora;
//   · the meals a nutritionist added from the Live console on that day, and today their grocery notes
//     (BSCoachMeals.jsx, which reads them itself), under the menu.
// The page (BSClientEat) owns the data and every handler and hands them in; nothing here reads a plan or
// writes one (the nutritionist's added meals are BSCoachMeals' own read). Every word is a catalog key the page already had.
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

// The menu's head: its kicker in the accent over the title, Swap meal at the right.
function BSEatMenuHead({ kicker, title, actionLabel, onAction }) {
  const t = window.useBS();
  return (
    <div data-eat-menu-head="" style={{ padding: `18px ${t.padX}px 0` }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 5 }}>{kicker}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: t.HEAD || t.DISPLAY, fontWeight: t.HEAD ? 700 : (t.W && t.W.display) || 600, fontSize: 21, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{title}</div>
        {actionLabel && <button type="button" onClick={onAction} style={{ minHeight: 44, marginBlock: -12, background: 'transparent', border: 0, color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>{actionLabel} →</button>}
      </div>
    </div>
  );
}

export function BSEatDay(p) {
  const t = window.useBS();
  const tr = useShapeTr();
  const { days } = bsWeekDaysOf();
  const day = p.day || 0;
  const isToday = day === p.todayIdx;
  const f = p.fuel || {};
  const next = p.next || null;
  const prev = p.prev || null;
  const slotOf = p.slotOf || (() => '');
  const timeOf = p.timeOf || (() => '');
  const fmt12 = p.fmt12 || ((s) => s);
  const macroRow = p.macroRow || (() => '');
  const prevAt = prev ? fmt12(`${Math.floor(prev.min / 60)}:${String(prev.min % 60).padStart(2, '0')}`) : '';
  const until = p.until;
  const pick = days[day] || days[0];

  return (
    <div data-eat-day="">
      <BSWeekDays look="round" activeIdx={day} onSelect={p.onDay} restFlags={p.restFlags || []} onMonth={p.onMonth} />

      {p.notices || null}

      {/* Fuel left today, above the next meal (owner, 2026-10-22). Coach-set targets (Adjust plan → Apply)
          win; each macro opens its own page. Another day picked in the week: its own head, not "Fuel left
          today" over that day's figures, read as the week shows it (this week's date and the weekday in the
          reader's language; Codex P2 on #2599). */}
      <BSEatFuel calLeft={f.calLeft} calTarget={f.calTarget} calNow={f.calNow} calPct={f.calPct}
        macros={f.macros || []} onOpen={p.onMacro} unread={!!f.unread} calTargetKnown={!!f.calTargetKnown}
        label={isToday ? null : tr('nutrition:eat.fuelOn', { defaultValue: 'Fuel · {day}', day: `${pick.short} ${pick.date}` })} />

      {/* The next meal — on its own, today only. Log it opens the meal, where it is logged; Swap opens the
          swap sheet on this meal. */}
      {next && (
        <BSFocusLead lit color={t.ACCENT}
          kicker={`${timeOf(next) || slotOf(next)} · ${p.nextAt != null && !p.ahead ? tr('home:focus.notLogged', { defaultValue: 'Not logged yet' }) : tr('home:focus.nextStop', { defaultValue: 'Next stop' })}`}
          kickerRight={until ? (until.h > 0
            ? tr('home:focus.inHourMin', { defaultValue: 'In {h} h {m} min', h: until.h, m: until.m })
            : tr('home:focus.inMin', { defaultValue: 'In {m} min', m: until.m })) : ''}
          title={slotOf(next)}
          sub={`${next.title} · ${macroRow(next)}`}>
          {prev && (
            <BSFocusArrival pct={p.arrivalPct}
              nowLabel={`${tr('home:slate.now', { defaultValue: 'Now' })} ${p.nowText}`}
              fromLabel={`${prevAt} · ${prev.label}${prev.done ? ' ✓' : ''}`}
              toLabel={`${timeOf(next)} · ${slotOf(next)}`}
              ariaLabel={tr('home:focus.arrivalAria', { defaultValue: 'Now {now}, between {from} and {to}', now: p.nowText, from: prevAt, to: timeOf(next) })} />
          )}
          <BSFocusActions lit
            primary={{ label: tr('nutrition:eat.logIt', { defaultValue: 'Log it →' }), onClick: () => p.onOpenMeal && p.onOpenMeal(next.id) }}
            secondary={{ label: `${tr('nutrition:eat.swapTitle', { defaultValue: 'Swap' })} →`, onClick: () => p.onSwapMeal && p.onSwapMeal(next.id) }} />
        </BSFocusLead>
      )}

      {p.morning || null}

      {/* The menu — the day as a line: each meal at its time, on the rail, with the NOW tick today; the next
          one is marked and carries the kcal still left. Tapping a meal opens it.
          ⚠ THE POSSESSIVE IS THE CATALOG'S TO FORM (es 'Comidas del lunes', de 'Mahlzeiten am Montag'),
          over the weekday in the reader's language, never an English list. */}
      <BSEatMenuHead kicker={tr('nutrition:eat.menuKicker', { defaultValue: 'The menu' })}
        title={isToday
          ? tr('nutrition:eat.mealsToday', { defaultValue: "Today's meals" })
          : tr('nutrition:eat.mealsOnDay', { defaultValue: "{day}'s meals", day: pick.name })}
        actionLabel={tr('nutrition:eat.swapAction', { defaultValue: 'Swap meal' })} onAction={p.onSwapPick} />
      <div data-tour="hero-eat" style={{ paddingTop: 4 }}>
        <BSFocusLine
          nowIndex={p.nowIdx}
          nowLabel={p.nowIdx >= 0 ? `${tr('home:slate.now', { defaultValue: 'Now' })} · ${p.nowText}` : null}
          rows={Array.isArray(p.rows) ? p.rows : []} />
        {p.empty || null}
      </div>

      {/* A nutritionist's added meals for the day picked, and today their grocery notes. Mounted, not
          written here: the section is BSCoachMeals.jsx's. */}
      <BSCoachMeals dayIdx={day} today={isToday} dayLabel={pick.short} />
    </div>
  );
}
