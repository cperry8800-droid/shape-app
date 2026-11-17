import React from 'react';
import { useBSHomeUnread, useBSHomeNextSession } from './BSHomeSections.jsx';
import { bsHomeCare, bsCareRoleInk } from '../services/homeCare.mjs';
import { bsHomePlate, bsHomeMono, bsHomeInk, bsHomeSquare, BSHomeGlyph, bsHomeCoachName, bsHomeRoleWord } from './BSHomeCare.jsx';

// ─── TODAY'S PLAN ───────────────────────────────────────────────────────────────────────────────
// One plate, a row a half (owner, 2026-11-17, the approved Home: "build those. Please make it look like
// the preview"): the trainer's session for the day, "From {name}" with the session's own summary, and the
// nutritionist's side, the food left today and the next meal. It took the place of Team's two coach cards
// (owner, 2026-11-03: each coach speaking once, "so you dont have them twice") in layout only. Everything
// a card offered is still here:
//   · the session opens from its square: I'll train today, or Preview on another day;
//   · the next meal is logged from its square, Log {slot};
//   · each coach has Message, a square with what is unread on it;
//   · a coach's weekly note reads under their row;
//   · the Weekly check-in, the next session and Find a coach are the plate's last rows.
// A half nobody coaches yet, for a member who has a coach of the other discipline, reads as the member's
// own with a dashed mark (their own session, their own food log). A member with no coach keeps Today:
// the session and the food left, and Find a coach.
// Only coaches the member pays now (Home's planCoaches); a coach's note is theirs (bsHomePaidBanners).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx).

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

function bsHtLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}

// A button's name without the arrow its words end in ("I'll train today →").
const bsHtBare = (s) => String(s || '').replace(/\s*[→›]\s*$/, '');

export function BSHomeTeam(props) {
  const coaches = Array.isArray(props.coaches) ? props.coaches : [];
  const unread = useBSHomeUnread(coaches.map((c) => c.conversationId).filter(Boolean));
  const next = useBSHomeNextSession(coaches);
  return <BSHomeTeamView {...props} coaches={coaches} unread={unread} next={next} />;
}

// The plate itself, off what Home hands it. The tests draw it directly.
//   coaches   [{ role, name, conversationId, providerId, photo }]   the ones the member pays
//   notes     [{ role, text, who, providerId }]               their weekly notes, by coach
//   workout   { title, meta, time, onStart, coachId } | null  today's session, and the trainer who wrote it
//   meal      { slot, time, title, onLog } | null             the next meal not logged
//   mealCoachId                                              the nutritionist who wrote the meal plan
//   fuel      { left, pct } | null                            food left today, and the share eaten
//   today     whether the day is today (owner, 2026-11-04: "the change in weekly date should adjust
//             activities on home page"); another day picked in This week reads by its date: its session
//             opened as a preview, its meals in order (dayMeals [{ slot, time, title }]), nothing to log
//             and no food left
//   weekly    { onOpen } | null                              the Weekly check-in, due this week
//   onEat, onTrain                                           the Eat and Train tabs, for a half with nothing
//                                                            of its own to open
//
// ⚠ THE WEEKLY CHECK-IN IS HERE, WITH THE COACHES IT IS FOR, NOT BESIDE THE MORNING CHECK-IN (owner,
// 2026-11-11: "why are there 2 checkins for a signed in account"). It is the coach's form (the Morning
// check-in review, 2026-10-19: "Weekly check-in · for your coach"); it sat under the morning panel as a
// second check-in that only a signed-in account saw. So Home has one check-in, the morning's, and the weekly
// one is a line of this plate, naming who it is for, only while there is a coach to read it.
export function BSHomeTeamView({ coaches = [], notes = [], workout = null, meal = null, fuel = null, dayMeals = null, today = true, mealCoachId = null, unread = {}, next = null, dayLabel = '', showFindCoach = false, onFindCoach, onCoaches, onCalendar, onEat = null, onTrain = null, weekly = null, tour }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const care = bsHomeCare(coaches);
  const trainers = coaches.filter((c) => c.role !== 'nutritionist');
  const nutris = coaches.filter((c) => c.role === 'nutritionist');
  // ⚠ TODAY'S SESSION IS ITS OWN TRAINER'S (Codex P2 on #2583): a member may pay two trainers, and the
  // session goes on the row of the one who wrote it (the plan read's coachId), with that trainer's Message.
  // A session no paid trainer wrote (the member's own, or a trainer's no longer paid) is Today's workout, on
  // no coach's row.
  const sessionCoach = workout && workout.coachId != null
    ? trainers.find((c) => c.providerId != null && String(c.providerId) === String(workout.coachId)) || null
    : null;
  const trainer = sessionCoach || trainers[0] || null;
  // The day's meals and food left go on the row of the nutritionist who wrote the meal plan (Codex P2 on
  // #2583: a member may pay two), with that nutritionist's Message; with no author named, the first. A plan
  // by a nutritionist no longer paid is Fuel left today on no coach's row, as a session no paid trainer
  // wrote is (Codex P2 on #2583): never under another nutritionist, with their Message.
  const mealCoach = mealCoachId != null
    ? nutris.find((c) => c.providerId != null && String(c.providerId) === String(mealCoachId)) || null
    : null;
  const nutri = mealCoach || nutris[0] || null;
  const fuelOrphan = mealCoachId != null && !mealCoach;
  const extras = [...trainers.filter((c) => c !== trainer), ...nutris.filter((c) => c !== nutri)];
  // Each coach's weekly note on their own row. A note carrying a coach's listing id is that coach's (Codex
  // P2 on #2583: two coaches may share a name, and a name lookup may fail); one without an id falls back to
  // the name; one that names no coach here goes to the first of its role. A second coach of a role never
  // shows another coach's note.
  const sameRole = (a, b) => (a.role === 'nutritionist') === (b.role === 'nutritionist');
  const idOf = (x) => (x && x.providerId != null ? String(x.providerId) : null);
  const noteOf = (c, first) => {
    const mine = notes.filter((n) => sameRole(n, c));
    const ids = new Set(coaches.filter((k) => sameRole(k, c)).map(idOf).filter(Boolean));
    const byId = idOf(c) ? mine.find((n) => idOf(n) === idOf(c)) : null;
    if (byId) return byId;
    // A note whose id is another coach's here is theirs, never this one's, whatever its name says.
    const free = mine.filter((n) => !(idOf(n) && ids.has(idOf(n))));
    const own = c.name ? free.find((n) => n.who && n.who === c.name) : null;
    if (own || !first) return own || null;
    const named = coaches.filter((k) => k !== c && sameRole(k, c) && k.name).map((k) => k.name);
    return free.find((n) => !n.who || !named.includes(n.who)) || null;
  };
  const roleWord = (role) => bsHomeRoleWord(tr, role);
  const openThread = (c) => {
    if (!c.conversationId) { if (typeof onCoaches === 'function') onCoaches(); return; }
    try { window.dispatchEvent(new window.CustomEvent('shape:openConversation', { detail: { conversationId: c.conversationId, name: c.name || undefined } })); } catch (e) { /* the chat tab is still a tap away */ }
  };
  const nNew = (c) => (c && c.conversationId && unread && unread[`dm:${c.conversationId}`]) || 0;
  const hasFuel = !!(fuel && fuel.left != null) || !!meal || !!(dayMeals && dayMeals.length);
  if (!coaches.length && !workout && !hasFuel && !showFindCoach) return null;

  const count = coaches.length;
  const ink = (a) => bsHomeInk(t, a);
  const hair = `1px solid ${ink(0.1)}`;
  const mono = bsHomeMono(t, { whiteSpace: 'nowrap' });
  const subS = { fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.35, color: ink(0.66), overflowWrap: 'anywhere' };
  const titleS = { fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 17, lineHeight: 1.25, color: t.INK, overflowWrap: 'anywhere' };
  const from = (c) => tr('home:care.from', { defaultValue: 'From {name}', name: bsHomeCoachName(tr, c) });
  const own = tr('home:care.onYourOwn', { defaultValue: 'On your own for now' });
  // A half nobody coaches yet, for a member with a coach of the other discipline: the open seat, dashed.
  const open = (role) => care.openRole === role;

  // Message: a square with the chat mark, and what is unread on it.
  const message = (c) => {
    const n = nNew(c);
    return (
      <button type="button" data-team-message={c.role} onClick={() => openThread(c)} style={bsHomeSquare(t, false)}
        // The unread count is said too, as the square shows it.
        aria-label={[c.name ? tr('home:coaches.message', { defaultValue: 'Message {name}', name: c.name }) : c.role === 'nutritionist' ? tr('home:coaches.messageNutritionist', { defaultValue: 'Message your nutritionist' }) : tr('home:coaches.messageTrainer', { defaultValue: 'Message your trainer' }),
          n > 0 ? tr('home:coaches.unread', { defaultValue: '{n} new', n }) : null].filter(Boolean).join(', ')}>
        <BSHomeGlyph name="chat" size={20} />
        {n > 0 ? <span aria-hidden="true" data-team-unread="" style={{ position: 'absolute', top: -5, right: -5, minWidth: 18, height: 18, padding: '0 4px', boxSizing: 'border-box', borderRadius: 9, background: t.ACCENT, color: t.isLight ? '#ffffff' : '#04110f', fontFamily: t.DISPLAY, fontSize: 11, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>{n}</span> : null}
      </button>
    );
  };
  // The session's square: I'll train today, or Preview on another day.
  const start = workout ? (
    <button type="button" data-team-start="" onClick={workout.onStart} style={bsHomeSquare(t, false)}
      aria-label={bsHtBare(today ? tr('home:lead.workout.cta', { defaultValue: "I'll train today →" }) : tr('home:action.preview', { defaultValue: 'Preview →' }))}>
      <BSHomeGlyph name={today ? 'play' : 'arrow'} size={today ? 16 : 18} />
    </button>
  ) : null;
  // The food's square: Log the next meal, or the way to Eat when there is none to log today.
  const canLog = !!(meal && meal.onLog);
  const food = canLog ? (
    <button type="button" data-team-log="" onClick={meal.onLog} style={bsHomeSquare(t, false)} aria-label={bsHtBare(tr('home:team.logSlot', { defaultValue: 'Log {slot} →', slot: meal.slot || '' }))}>
      <BSHomeGlyph name="plus" size={20} />
    </button>
  ) : today && typeof onEat === 'function' ? (
    <button type="button" data-team-eat="" onClick={() => onEat()} style={bsHomeSquare(t, false)} aria-label={tr('home:care.openEat', { defaultValue: 'Open today’s menu' })}>
      <BSHomeGlyph name="arrow" size={18} />
    </button>
  ) : null;

  // A row: its mark (the role's colour, dashed for an open seat), a title over one line, its squares,
  // and under them the coach's note and whatever else it holds.
  const row = ({ who, role, dashed = false, title, sub, squares = [], note = null, under = null, k }) => {
    const c = bsCareRoleInk(t.isLight, role).mark;
    return {
      key: k || who,
      node: (
        <div data-team-coach={who} style={{ padding: '12px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span aria-hidden="true" data-team-mark={dashed ? 'open' : 'solid'} style={{ flex: 'none', width: 3, height: 38, boxSizing: 'border-box', ...(dashed ? { borderLeft: `3px dashed ${c}` } : { background: c, borderRadius: 2 }) }} />
            <div style={{ flex: '1 1 0', minWidth: 0 }}>
              <div data-team-title="" style={titleS}>{title}</div>
              {sub ? <div data-team-sub="" style={subS}>{sub}</div> : null}
            </div>
            {squares.filter(Boolean).map((s, i) => <React.Fragment key={i}>{s}</React.Fragment>)}
          </div>
          {note ? (
            <div style={{ margin: '8px 0 0 15px' }}>
              <div style={{ ...mono, fontSize: 9, letterSpacing: '0.14em', color: bsCareRoleInk(t.isLight, role).text }}>{tr('home:team.weeklyNote', { defaultValue: 'This week’s note' })}</div>
              <div data-team-note="" style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.4, color: ink(0.86) }}>&ldquo;{note.text}&rdquo;</div>
            </div>
          ) : null}
          {under}
        </div>
      ),
    };
  };
  const join = (parts) => parts.filter(Boolean).join(' · ');
  // A coach's own row, with no session or food of theirs to lead it: their name over their role; with no
  // name to read, the role alone, once.
  const named = (c) => (c.name ? { title: c.name, sub: roleWord(c.role) } : { title: roleWord(c.role), sub: null });
  const mealLine = meal ? `${[meal.slot, meal.time].filter(Boolean).join(' ')}${meal.title ? ` · ${meal.title}` : ''}` : '';
  const kcal = fuel && fuel.left != null ? (
    <><span data-team-fuel="" style={{ fontVariantNumeric: 'tabular-nums' }}>{Number(fuel.left).toLocaleString(bsHtLocale())}</span> {tr('home:team.kcalLeft', { defaultValue: 'kcal left' })}</>
  ) : null;
  const mealsUnder = dayMeals && dayMeals.length ? (
    <div data-team-day-meals="" style={{ margin: '8px 0 0 15px', display: 'flex', flexDirection: 'column', gap: 6 }}>
      {dayMeals.map((m, i) => (
        <div key={i} data-team-day-meal="" style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
          <span style={{ ...mono, fontSize: 9, letterSpacing: '0.14em', flex: 'none', minWidth: 64, color: bsCareRoleInk(t.isLight, 'nutritionist').text }}>{m.slot}</span>
          <span style={{ ...mono, fontSize: 9, letterSpacing: '0.14em', flex: 'none', color: ink(0.5) }}>{m.time}</span>
          <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.title}</span>
        </div>
      ))}
    </div>
  ) : null;
  // The food half's title: what is left today, else the next meal, else the day's meals.
  const foodTitle = kcal || (meal && meal.title) || (dayMeals && dayMeals.length ? tr('home:team.mealsOn', { defaultValue: 'Meals · {day}', day: dayLabel }) : null);
  const foodSub = (lead) => join([lead, kcal ? mealLine : (meal ? [meal.slot, meal.time].filter(Boolean).join(' ') : '')]);

  const rows = [];
  // The trainer, with the day's session when it is theirs; a session no paid trainer wrote stands on its
  // own row as Today's workout.
  if (trainer) {
    const note = noteOf(trainer, true);
    if (sessionCoach && workout) {
      rows.push(row({ who: 'trainer', role: 'trainer', title: workout.title, sub: join([from(trainer), workout.time, workout.meta]), squares: [message(trainer), start], note }));
    } else if (!workout) {
      rows.push(row({ who: 'trainer', role: 'trainer', title: today ? tr('home:team.noSession', { defaultValue: 'No session today' }) : tr('home:team.noSessionOn', { defaultValue: 'No session · {day}', day: dayLabel }),
        sub: join([trainer.name, roleWord('trainer')]), squares: [message(trainer)], note }));
    } else {
      // Their row keeps the note and Message; the session someone else wrote stands below.
      rows.push(row({ who: 'trainer', role: 'trainer', ...named(trainer), squares: [message(trainer)], note }));
    }
  }
  if (workout && !sessionCoach) {
    rows.push(row({ who: 'none-session', role: 'trainer', dashed: open('trainer'), title: workout.title,
      sub: join([today ? tr('home:team.workout', { defaultValue: 'Today’s workout' }) : tr('home:team.workoutOn', { defaultValue: 'Workout · {day}', day: dayLabel }), open('trainer') ? own : null, workout.time, workout.meta]), squares: [start] }));
  } else if (!trainer && !workout && open('trainer')) {
    rows.push(row({ who: 'open-training', role: 'trainer', dashed: true, title: tr('home:care.ownTraining', { defaultValue: 'Your training' }), sub: own,
      squares: [typeof onTrain === 'function' ? <button type="button" data-team-train="" onClick={() => onTrain()} style={bsHomeSquare(t, false)} aria-label={tr('home:care.openTrain', { defaultValue: 'Open your training' })}><BSHomeGlyph name="arrow" size={18} /></button> : null] }));
  }

  // The nutritionist, with their note, the food left and the next meal; or the food left on its own.
  if (nutri) {
    const note = noteOf(nutri, true);
    const fuelHere = hasFuel && !fuelOrphan;
    rows.push(fuelHere
      ? row({ who: 'nutritionist', role: 'nutritionist', title: foodTitle || nutri.name || roleWord('nutritionist'), sub: foodSub(from(nutri)), squares: [message(nutri), food], note, under: mealsUnder })
      : row({ who: 'nutritionist', role: 'nutritionist', ...named(nutri), squares: [message(nutri)], note }));
  }
  if (hasFuel && (!nutri || fuelOrphan)) {
    rows.push(row({ who: 'none-fuel', role: 'nutritionist', dashed: open('nutritionist'), title: foodTitle || tr('home:care.ownFood', { defaultValue: 'Your food log' }),
      sub: foodSub(open('nutritionist') ? own : null) || (today && kcal ? tr('home:care.ownFood', { defaultValue: 'Your food log' }) : null),
      squares: [food], under: mealsUnder }));
  } else if (!nutri && !hasFuel && open('nutritionist')) {
    rows.push(row({ who: 'open-food', role: 'nutritionist', dashed: true, title: tr('home:care.ownFood', { defaultValue: 'Your food log' }), sub: own,
      squares: [typeof onEat === 'function' ? <button type="button" data-team-eat="" onClick={() => onEat()} style={bsHomeSquare(t, false)} aria-label={tr('home:care.logMeal', { defaultValue: 'Log a meal' })}><BSHomeGlyph name="plus" size={20} /></button> : null] }));
  }

  // A second coach of a role: a row with Message, and their own note under it when they wrote one.
  for (const c of extras) {
    rows.push(row({ who: 'extra', k: `extra:${c.role}:${c.providerId ?? c.name}`, role: c.role, ...named(c), squares: [message(c)], note: noteOf(c, false) }));
  }
  const line = { width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK };

  return (
    <section data-bs-home-team={care.kind} data-tour={tour || undefined} aria-label={today ? tr('home:team.today', { defaultValue: 'Today' }) : dayLabel}
      style={{ ...bsHomePlate(t), margin: '10px 10px 0', padding: '4px 16px', color: t.INK }}>
      {/* Another day picked in This week: the plate says which. Today, it says nothing over its rows. */}
      {!today && dayLabel ? <div data-team-day="" style={{ ...mono, color: ink(0.6), padding: '10px 0 0' }}>{dayLabel}</div> : null}
      {rows.map((r, i) => <div key={r.key} style={{ borderTop: i ? hair : 0 }}>{r.node}</div>)}

      {weekly && count ? (() => {
        const forWhom = count === 1 ? tr('home:team.weeklyFor', { defaultValue: 'For {name}', name: bsHomeCoachName(tr, coaches[0]) }) : tr('home:team.weeklyForCoaches', { defaultValue: 'For your coaches' });
        const label = tr('home:bulletin.weeklyCheckin', { defaultValue: 'Weekly check-in due' });
        const mins = tr('home:bulletin.weeklyCheckinDetail', { defaultValue: '2 min' });
        return (
          <button type="button" data-team-weekly="" onClick={weekly.onOpen} aria-label={[label, forWhom, mins].join(' · ')}
            style={{ ...line, minHeight: 56, borderTop: rows.length ? hair : 0 }}>
            <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 999, background: t.ACCENT }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
              <span style={{ display: 'block', ...subS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{forWhom}</span>
            </span>
            <span style={{ ...mono, fontWeight: 700, color: t.ACCENT }}>{mins}</span>
            <span aria-hidden="true" style={{ color: ink(0.6), fontSize: 20 }}>›</span>
          </button>
        );
      })() : null}

      {next ? (
        <button type="button" data-team-next="" onClick={() => { if (typeof onCalendar === 'function') onCalendar(new Date(next.at)); }}
          style={{ ...line, minHeight: 48, borderTop: rows.length || (weekly && count) ? hair : 0 }}>
          <span style={{ ...mono, color: ink(0.6) }}>{tr('home:coaches.nextSession', { defaultValue: 'Next session' })}</span>
          <span style={{ marginLeft: 'auto', ...subS, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(() => { try { return new Date(next.at).toLocaleString(bsHtLocale(), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })()} · {next.providerName || roleWord(next.providerRole)}
          </span>
        </button>
      ) : null}

      {showFindCoach ? (
        <button type="button" data-team-find="" onClick={onFindCoach}
          style={{ ...line, minHeight: 56, borderTop: rows.length ? hair : 0 }}>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700 }}>{tr('home:shortcut.findCoach', { defaultValue: 'Find a coach' })}</span>
            <span style={{ display: 'block', ...subS }}>{tr('home:shortcut.findCoachSub', { defaultValue: 'Trainers and nutritionists' })}</span>
          </span>
          <span aria-hidden="true" style={{ color: ink(0.6), fontSize: 20 }}>›</span>
        </button>
      ) : null}
    </section>
  );
}
