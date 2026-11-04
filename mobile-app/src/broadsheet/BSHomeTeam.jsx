import React from 'react';
import { BS_GAUGE_FACE, BS_DECK_MONO } from './BSProInstrument.jsx';
import { useBSHomeUnread, useBSHomeNextSession } from './BSHomeSections.jsx';

// ─── TEAM ───────────────────────────────────────────────────────────────────────────────────────
// The member's coaches on Home, each speaking once (owner, 2026-11-03, the Home preview: "remove this"
// of Today's call, "and replace with just this" of the coaches' cards, "so you dont have them twice",
// and "change 'in your corner' to 'team'"):
//   · the trainer's card carries today's call, the session and I'll train today, with Message;
//   · the nutritionist's card carries their weekly note, the food left today and the next meal, with
//     Log and Message;
//   · a member with no coach reads "Today": the session without a face, the food left without a note,
//     and Find a coach.
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

// The role's mark: rust for a trainer, gold for a nutritionist, each in its readable pair.
const bsHtRole = (t, role) => (role === 'nutritionist'
  ? { mark: t.isLight ? '#a07a2e' : '#d8b25a', text: t.isLight ? '#7a5a1e' : '#d8b25a' }
  : { mark: '#c0533b', text: t.isLight ? '#9c3b26' : '#e98a73' });

// A coach's face: their photo in a ring of their role's mark, or their initials on it when there is no
// photo or it fails to load.
function BSHtFace({ photo, initials, ring, display }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [photo]);
  const box = { width: 40, height: 40, flexShrink: 0, borderRadius: 999, boxSizing: 'border-box' };
  if (photo && !broken) {
    return <img data-team-face="photo" src={photo} alt="" aria-hidden="true" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover', border: `2px solid ${ring}` }} />;
  }
  return <span data-team-face="initials" aria-hidden="true" style={{ ...box, background: ring, color: '#f6f0e3', display: 'grid', placeItems: 'center', fontFamily: display, fontSize: 14, fontWeight: 700 }}>{initials || '·'}</span>;
}

export function BSHomeTeam(props) {
  const coaches = Array.isArray(props.coaches) ? props.coaches : [];
  const unread = useBSHomeUnread(coaches.map((c) => c.conversationId).filter(Boolean));
  const next = useBSHomeNextSession(coaches);
  return <BSHomeTeamView {...props} coaches={coaches} unread={unread} next={next} />;
}

// The section itself, off what Home hands it. The tests draw it directly.
//   coaches   [{ role, name, conversationId, providerId, photo }]   the ones the member pays
//   notes     [{ role, text, who, providerId }]               their weekly notes, by coach
//   workout   { title, meta, time, onStart, coachId } | null  today's session, and the trainer who wrote it
//   meal      { slot, time, title, onLog } | null             the next meal not logged
//   mealCoachId                                              the nutritionist who wrote the meal plan
//   fuel      { left, pct } | null                            food left today, and the share eaten
export function BSHomeTeamView({ coaches = [], notes = [], workout = null, meal = null, fuel = null, mealCoachId = null, unread = {}, next = null, dayLabel = '', showFindCoach = false, onFindCoach, onCoaches, onCalendar, tour }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const trainers = coaches.filter((c) => c.role !== 'nutritionist');
  const nutris = coaches.filter((c) => c.role === 'nutritionist');
  // ⚠ TODAY'S SESSION IS ITS OWN TRAINER'S (Codex P2 on #2583): a member may pay two trainers, and the
  // session goes on the card of the one who wrote it (the plan read's coachId), with that trainer's Message.
  // A session no paid trainer wrote (the member's own, or a trainer's no longer paid) is Today's workout, on
  // no coach's card.
  const sessionCoach = workout && workout.coachId != null
    ? trainers.find((c) => c.providerId != null && String(c.providerId) === String(workout.coachId)) || null
    : null;
  const trainer = sessionCoach || trainers[0] || null;
  // The day's meals and food left go on the card of the nutritionist who wrote the meal plan (Codex P2 on
  // #2583: a member may pay two), with that nutritionist's Message; with no author named, the first. A plan
  // by a nutritionist no longer paid is Fuel left today on no coach's card, as a session no paid trainer
  // wrote is (Codex P2 on #2583): never under another nutritionist, with their Message.
  const mealCoach = mealCoachId != null
    ? nutris.find((c) => c.providerId != null && String(c.providerId) === String(mealCoachId)) || null
    : null;
  const nutri = mealCoach || nutris[0] || null;
  const fuelOrphan = mealCoachId != null && !mealCoach;
  const extras = [...trainers.filter((c) => c !== trainer), ...nutris.filter((c) => c !== nutri)];
  // Each coach's weekly note on their own card. A note carrying a coach's listing id is that coach's (Codex
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
  const quote = (note) => <div data-team-note="" style={{ fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.4, color: t.INK }}>&ldquo;{note.text}&rdquo;</div>;
  const roleWord = (role) => (role === 'nutritionist' ? tr('home:role.nutritionist', { defaultValue: 'Nutritionist' }) : tr('home:role.trainer', { defaultValue: 'Trainer' }));
  const openThread = (c) => {
    if (!c.conversationId) { if (typeof onCoaches === 'function') onCoaches(); return; }
    try { window.dispatchEvent(new window.CustomEvent('shape:openConversation', { detail: { conversationId: c.conversationId, name: c.name || undefined } })); } catch (e) { /* the chat tab is still a tap away */ }
  };
  const nNew = (c) => (c && c.conversationId && unread && unread[`dm:${c.conversationId}`]) || 0;
  const hasFuel = !!(fuel && fuel.left != null) || !!meal;
  if (!coaches.length && !workout && !hasFuel && !showFindCoach) return null;

  const mono = { fontFamily: BS_DECK_MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap' };
  const card = { marginTop: 8, padding: '12px 14px 14px', borderRadius: 6, background: t.isLight ? 'rgba(255,255,255,0.42)' : t.PAPER2, border: `1px solid ${t.HAIR || t.RULE}` };
  const btn = (primary) => ({ minHeight: 44, borderRadius: 4, border: primary ? 0 : `1px solid ${t.INK50}`, background: primary ? t.INK : 'transparent', color: primary ? t.PAPER : t.INK, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 650, cursor: 'pointer', padding: '0 12px' });
  const message = (c) => {
    const n = nNew(c);
    return (
      <button type="button" data-team-message={c.role} onClick={() => openThread(c)} style={btn(false)}
        aria-label={c.name ? tr('home:coaches.message', { defaultValue: 'Message {name}', name: c.name }) : c.role === 'nutritionist' ? tr('home:coaches.messageNutritionist', { defaultValue: 'Message your nutritionist' }) : tr('home:coaches.messageTrainer', { defaultValue: 'Message your trainer' })}>
        {tr('home:team.message', { defaultValue: 'Message' })}{n > 0 ? ` · ${tr('home:coaches.unread', { defaultValue: '{n} new', n })}` : ''}
      </button>
    );
  };
  const face = (c) => {
    const initials = String(c.name || roleWord(c.role)).trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
    return <BSHtFace photo={c.photo} initials={initials} ring={bsHtRole(t, c.role).mark} display={t.DISPLAY} />;
  };
  // A coach's head: their face, their name, and their role with what their card carries.
  const head = (c, what, right) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {face(c)}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 650, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || roleWord(c.role)}</div>
        <div style={{ ...mono, marginTop: 2, color: bsHtRole(t, c.role).text, overflow: 'hidden', textOverflow: 'ellipsis' }}>{[roleWord(c.role), what].filter(Boolean).join(' · ')}</div>
      </div>
      {right ? <span style={{ ...mono, color: t.INK50 }}>{right}</span> : null}
    </div>
  );
  // The head of a card with no coach behind it: just what it holds.
  const plainHead = (label, right) => (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
      <span style={{ ...mono, color: t.INK70 }}>{label}</span>
      {right ? <span style={{ ...mono, marginLeft: 'auto', color: t.INK50 }}>{right}</span> : null}
    </div>
  );
  const sessionCard = (withMessage, note = null) => (
    <div data-team-card="session" style={card}>
      {note ? <div style={{ paddingBottom: 10, marginBottom: 10, borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>{quote(note)}</div> : null}
      {workout ? (
        <>
          <div style={{ fontFamily: BS_GAUGE_FACE, fontSize: 21, fontWeight: 500, letterSpacing: '-0.01em', lineHeight: 1.15, color: t.INK }}>{workout.title}</div>
          {workout.meta ? <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70 }}>{workout.meta}</div> : null}
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: withMessage ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 8 }}>
            <button type="button" data-team-start="" onClick={workout.onStart} style={btn(true)}>{tr('home:lead.workout.cta', { defaultValue: "I'll train today →" })}</button>
            {withMessage}
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70 }}>{tr('home:team.noSession', { defaultValue: 'No session today' })}</span>
          {withMessage}
        </div>
      )}
    </div>
  );
  const fuelBody = (note) => (
    <>
      {note ? quote(note) : null}
      {(fuel && fuel.left != null) || meal ? (
        <div style={{ marginTop: note ? 10 : 0, paddingTop: note ? 10 : 0, borderTop: note ? `1px solid ${t.HAIR || t.RULE}` : 0, display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap' }}>
          {fuel && fuel.left != null ? (
            <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
              <span data-team-fuel="" style={{ fontFamily: BS_GAUGE_FACE, fontSize: 24, fontWeight: 300, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{Number(fuel.left).toLocaleString(bsHtLocale())}</span>
              <span style={{ ...mono, fontSize: 8, color: t.INK50 }}>{tr('home:team.kcalLeft', { defaultValue: 'kcal left' })}</span>
            </span>
          ) : null}
          {meal ? <span style={{ marginLeft: 'auto', fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, minWidth: 0 }}>{[meal.slot, meal.time].filter(Boolean).join(' ')}{meal.title ? ` · ${meal.title}` : ''}</span> : null}
        </div>
      ) : null}
      {fuel && fuel.pct != null ? (
        <div aria-hidden="true" style={{ marginTop: 8, height: 3, background: t.HAIR || t.RULE }}>
          <div style={{ width: `${Math.max(0, Math.min(100, fuel.pct))}%`, height: 3, background: bsHtRole(t, 'nutritionist').mark }} />
        </div>
      ) : null}
    </>
  );
  const fuelButtons = (withMessage) => (meal || withMessage) ? (
    <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: meal && withMessage ? 'repeat(2, minmax(0, 1fr))' : 'minmax(0, 1fr)', gap: 8 }}>
      {meal ? <button type="button" data-team-log="" onClick={meal.onLog} style={btn(true)}>{tr('home:team.logSlot', { defaultValue: 'Log {slot} →', slot: meal.slot || '' })}</button> : null}
      {withMessage}
    </div>
  ) : null;
  const count = coaches.length;

  return (
    <section data-bs-home-team="" data-tour={tour || undefined} style={{ padding: `${t.sectGap || 22}px ${t.padX}px 0` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, paddingBottom: 4 }}>
        <h2 style={{ margin: 0, fontFamily: t.HEAD || t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: t.INK }}>
          {count ? tr('home:team.title', { defaultValue: 'Team' }) : tr('home:team.today', { defaultValue: 'Today' })}<span aria-hidden="true" style={{ color: '#c0533b' }}>.</span>
        </h2>
        <span style={{ ...mono, marginLeft: 'auto', color: t.INK50 }}>{[dayLabel, count ? tr('home:team.coaches', { defaultValue: '{count, plural, one {# coach} other {# coaches}}', count }) : null].filter(Boolean).join(' · ')}</span>
      </div>

      {/* The trainer, with today's call when the session is theirs; a session no paid trainer wrote stands
          on its own as Today's workout. */}
      {trainer ? (() => {
        const note = noteOf(trainer, true);
        return (
          <div data-team-coach="trainer" style={{ marginTop: 10 }}>
            {/* Their card holds today's call: their session, or "No session today" when there is none at all;
                a session someone else wrote stands below, and their card keeps the note and Message. */}
            {head(trainer, sessionCoach || !workout ? tr('home:focus.todaysCall', { defaultValue: 'Today’s call' }) : (note ? tr('home:team.weeklyNote', { defaultValue: 'This week’s note' }) : null), sessionCoach ? workout.time : null)}
            {sessionCoach || !workout ? sessionCard(message(trainer), note)
              : note ? <div style={card}>{quote(note)}<div style={{ marginTop: 12 }}>{message(trainer)}</div></div>
                : <div style={{ marginTop: 8 }}>{message(trainer)}</div>}
          </div>
        );
      })() : null}
      {workout && !sessionCoach ? (
        <div data-team-coach="none-session" style={{ marginTop: trainer ? 16 : 10 }}>
          {plainHead(tr('home:team.workout', { defaultValue: 'Today’s workout' }), workout.time)}
          {sessionCard(null)}
        </div>
      ) : null}

      {/* The nutritionist, with their note and the food left; or the food left alone. */}
      {nutri ? (() => {
        const note = noteOf(nutri, true);
        const fuelHere = hasFuel && !fuelOrphan;
        return (
          <div data-team-coach="nutritionist" style={{ marginTop: 16 }}>
            {head(nutri, note ? tr('home:team.weeklyNote', { defaultValue: 'This week’s note' }) : null)}
            {fuelHere ? <div data-team-card="fuel" style={card}>{fuelBody(note)}{fuelButtons(message(nutri))}</div>
              : note ? <div style={card}>{quote(note)}<div style={{ marginTop: 12 }}>{message(nutri)}</div></div>
                : <div style={{ marginTop: 8 }}>{message(nutri)}</div>}
          </div>
        );
      })() : null}
      {hasFuel && (!nutri || fuelOrphan) ? (
        <div data-team-coach="none-fuel" style={{ marginTop: 16 }}>
          {plainHead(tr('home:team.fuel', { defaultValue: 'Fuel left today' }))}
          <div data-team-card="fuel" style={card}>{fuelBody(null)}{fuelButtons(null)}</div>
        </div>
      ) : null}

      {/* A second coach of a role: a row with Message, and their own note under it when they wrote one. */}
      {extras.map((c) => {
        const note = noteOf(c, false);
        return (
          <div key={`${c.role}:${c.providerId ?? c.name}`} data-team-coach="extra" style={{ marginTop: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, minWidth: 0 }}>{head(c, note ? tr('home:team.weeklyNote', { defaultValue: 'This week’s note' }) : null)}</div>
              {message(c)}
            </div>
            {note ? <div style={{ ...card, marginTop: 8 }}>{quote(note)}</div> : null}
          </div>
        );
      })}

      {next ? (
        <button type="button" data-team-next="" onClick={() => { if (typeof onCalendar === 'function') onCalendar(new Date(next.at)); }}
          style={{ marginTop: 12, width: '100%', minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 0, borderTop: `1px solid ${t.HAIR || t.RULE}`, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK }}>
          <span style={{ ...mono, color: t.INK70 }}>{tr('home:coaches.nextSession', { defaultValue: 'Next session' })}</span>
          <span style={{ marginLeft: 'auto', fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {(() => { try { return new Date(next.at).toLocaleString(bsHtLocale(), { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })()} · {next.providerName || roleWord(next.providerRole)}
          </span>
        </button>
      ) : null}

      {showFindCoach ? (
        <button type="button" data-team-find="" onClick={onFindCoach}
          style={{ marginTop: 12, width: '100%', minHeight: 48, display: 'flex', alignItems: 'center', gap: 10, padding: '0 2px', border: 0, borderTop: `1px solid ${t.HAIR || t.RULE}`, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: t.INK }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 650 }}>{tr('home:shortcut.findCoach', { defaultValue: 'Find a coach' })}</span>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70 }}>{tr('home:shortcut.findCoachSub', { defaultValue: 'Trainers and nutritionists' })}</span>
          <span aria-hidden="true" style={{ marginLeft: 'auto', color: t.INK50, fontSize: 20 }}>›</span>
        </button>
      ) : null}
    </section>
  );
}
