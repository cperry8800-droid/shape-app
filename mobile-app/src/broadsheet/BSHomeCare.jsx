import React from 'react';
import { BSCleanType } from './bsCleanType.jsx';
import { bsMpGlass } from './BSMemberBento.jsx';
import { bsHomeCare, bsCareFirstName, bsCareInitials, bsCareRoleInk, bsCareInviteShown, bsCareInviteRead, bsCareInviteWrite, BS_CARE_INVITE_KEY } from '../services/homeCare.mjs';

// ─── THE MEMBER HOME'S LOOK, AND WHAT IT SAYS ABOUT THE MEMBER'S COACHES ────────────────────────────
// Owner, 2026-11-17, of the two Home designs (a member with a team, a member with one coach): "ok make
// new home screens live", "build those. Please make it look like the preview", "on the app", then "just
// make sure look and design is same as preview". This module holds what every Home section shares:
//   · the type: Saira for words and figures, the app's mono for the small capitals (useBSHomeType);
//   · the plate: an 18px round box over the faint dot grid, a hairline round it (bsHomePlate), its label
//     led by a small gold dot (BSHomePlateLabel), and the square controls (bsHomeSquare);
//   · a coach's portrait, the coaches' row of the goal plate, and the invitation to add the other
//     discipline for a member with exactly one coach (BSHomeInvite).
// Who the member has hired, and so which Home they get, is services/homeCare.mjs's.
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

// ── The type ─────────────────────────────────────────────────────────────────────────────────────
// Home is set in Saira again (owner, 2026-11-17: "just make sure look and design is same as preview";
// it took the coach pages' Geist and Inter Tight on 2026-10-28). Every word face of the theme is Saira,
// the system face a few lines take included, and HEAD too, so a sheet Home opens keeps its weights
// (bsCleanSheet). BSHomeType is the clean area's box under another theme: inside it a weight is the one
// it is written with, where the app's "regular" setting would step it down (bsCleanType.jsx).
export const BS_HOME_FACE = "'Saira', 'Space Grotesk', -apple-system, system-ui, sans-serif";
export function useBSHomeType() {
  const base = window.useBS();
  return React.useMemo(() => ({ ...base, DISPLAY: BS_HOME_FACE, BODY: BS_HOME_FACE, HEAD: BS_HOME_FACE }), [base]);
}
export function BSHomeType({ t, children }) {
  return <BSCleanType t={t}>{children}</BSCleanType>;
}

// The paper's ink at an alpha, and a hex colour at one.
export const bsHomeInk = (t, a) => `rgba(${(t && t.inkRGB) || (t && t.isLight ? '15,14,12' : '245,240,230')},${a})`;
export function bsHomeA(hex, a) {
  const h = String(hex || '').replace('#', '');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

// ── The plate ────────────────────────────────────────────────────────────────────────────────────
// The member profile's pane (BSMemberBento.jsx's bsMpGlass: glass over the instrument's dot grid, the
// Day streak and Trajectory plates), at Home's 18px corner. On a dark paper it is drawn flat, as the
// approved Home is: the paper's ink at a few percent, the dots and a hairline, no sheen and no shadow.
export function bsHomePlate(t) {
  const glass = bsMpGlass(t, t.INK, { grid: true, radius: 18 });
  if (t.isLight) return glass;
  return {
    ...glass, backgroundColor: bsHomeInk(t, 0.055), backgroundImage: `radial-gradient(${bsHomeInk(t, 0.055)} 1px, transparent 1px)`,
    backgroundSize: '14px 14px', border: `1px solid ${bsHomeInk(t, 0.12)}`, boxShadow: 'none',
  };
}
// A slot inside a plate (a chip, the milestone row): a step darker than the plate on a dark paper, a
// step of ink on a light one.
export const bsHomeSlot = (t) => ({ background: t.isLight ? bsHomeInk(t, 0.04) : 'rgba(0,0,0,0.2)', border: `1px solid ${bsHomeInk(t, 0.12)}` });

// The small capitals: the app's mono, spaced as the approved Home spaces them.
export const bsHomeMono = (t, over = null) => ({ fontFamily: t.MONO, fontWeight: 500, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', ...(over || {}) });

// A plate's label: a small dot (the goal's gold unless told), the words, and a pill tag on the right.
export function BSHomePlateLabel({ t, children, note = null, dot = null }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 14, color: bsHomeInk(t, 0.82) }}>
        <span aria-hidden="true" style={{ flex: 'none', width: 7, height: 7, borderRadius: 99, background: dot || '#e0b23a' }} />
        <span data-home-plate-title="" style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{children}</span>
      </div>
      {note ? <span data-home-plate-tag="" style={{ flex: '0 1 auto', minWidth: 0, maxWidth: '55%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', border: `1px solid ${bsHomeInk(t, 0.2)}`, borderRadius: 999, padding: '3px 10px', fontFamily: t.DISPLAY, fontSize: 12, fontWeight: 600, color: bsHomeInk(t, 0.82) }}>{note}</span> : null}
    </div>
  );
}

// A plate's square control, 48px with a 12px corner: filled in the paper's ink (cream on a dark paper)
// when it does the thing, an outline when it opens something.
export function bsHomeSquare(t, filled = false, size = 48) {
  return {
    flex: 'none', width: size, height: size, minWidth: size, minHeight: size, padding: 0, boxSizing: 'border-box', borderRadius: 12,
    border: filled ? 0 : `1px solid ${bsHomeInk(t, 0.3)}`, background: filled ? t.INK : 'transparent', color: filled ? t.PAPER : t.INK,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', position: 'relative',
  };
}
// A plate's wide button, 48px tall with a 14px corner: the filled one and the outlined one beside it.
export function bsHomeButton(t, filled = false) {
  return {
    minHeight: 48, boxSizing: 'border-box', borderRadius: 14, padding: '0 16px', cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 15,
    fontWeight: filled ? 700 : 600, border: filled ? 0 : `1px solid ${bsHomeInk(t, 0.25)}`, background: filled ? t.INK : 'transparent', color: filled ? t.PAPER : t.INK,
    display: 'flex', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  };
}

// The line glyphs Home's squares carry, drawn in currentColor (no coloured emoji in new work).
const BS_HOME_GLYPHS = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  chat: <path d="M4 5h16v11H10l-5 4v-4H4z" />,
  eye: <><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" /><circle cx="12" cy="12" r="2.6" /></>,
};
export function BSHomeGlyph({ name, size = 18 }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flex: 'none' }}>
      {BS_HOME_GLYPHS[name] || BS_HOME_GLYPHS.arrow}
    </svg>
  );
}

// ── A coach's portrait ───────────────────────────────────────────────────────────────────────────
// Their photo in a soft square ringed in their role's colour, or their initials on it when there is no
// photo or it fails to load.
export function BSHomeCoachFace({ photo, name, role, size = 36 }) {
  const t = window.useBS();
  const [broken, setBroken] = useState(false);
  useEffect(() => { setBroken(false); }, [photo]);
  const ink = bsCareRoleInk(t.isLight, role);
  const box = { width: size, height: size, flex: 'none', borderRadius: '26%', boxSizing: 'border-box' };
  if (photo && !broken) {
    return <img data-home-face="photo" src={photo} alt="" aria-hidden="true" onError={() => setBroken(true)} style={{ ...box, objectFit: 'cover', border: `2px solid ${ink.line}` }} />;
  }
  const initials = bsCareInitials(name);
  return <span data-home-face="initials" aria-hidden="true" style={{ ...box, background: ink.mark, color: '#f6f0e3', display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontSize: Math.round(size * 0.36), fontWeight: 700 }}>{initials || '·'}</span>;
}

// A discipline's word under a coach's name: Training for a trainer, Fuel for a nutritionist.
export function bsHomeDiscipline(tr, role) {
  return role === 'nutritionist' ? tr('home:care.fuel', { defaultValue: 'Fuel' }) : tr('home:care.training', { defaultValue: 'Training' });
}
export function bsHomeRoleWord(tr, role) {
  return role === 'nutritionist' ? tr('home:role.nutritionist', { defaultValue: 'Nutritionist' }) : tr('home:role.trainer', { defaultValue: 'Trainer' });
}
// How a coach is named in a line: their first name, or their role when the name could not be read.
export const bsHomeCoachName = (tr, c) => bsCareFirstName(c && c.name) || bsHomeRoleWord(tr, c && c.role);

// ── The coaches on the goal ──────────────────────────────────────────────────────────────────────
// The foot of the goal plate: each coach the member pays, their portrait, first name and discipline;
// with exactly one coach, the other discipline as an open seat, dashed in its role's colour, which opens
// the coaches of that discipline. A coach opens their own page (`onCoach`); Data opens the goal's page.
//   care     services/homeCare.mjs's bsHomeCare(coaches)
export function BSHomeCoachesRow({ care, onCoach = null, onSeat = null, onData = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  if (!care || !care.coaches.length) return null;
  const seatInk = care.seat && care.openRole ? bsCareRoleInk(t.isLight, care.openRole) : null;
  const cell = { flex: '1 1 0', minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 8, padding: 0, border: 0, background: 'transparent', color: t.INK, textAlign: 'left' };
  const words = (c) => (
    <span style={{ minWidth: 0 }}>
      <span style={{ display: 'block', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 14, lineHeight: 1.25, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bsHomeCoachName(tr, c)}</span>
      <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 12, lineHeight: 1.25, color: bsCareRoleInk(t.isLight, c.role).text, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{bsHomeDiscipline(tr, c.role)}</span>
    </span>
  );
  return (
    <div data-home-goal-coaches={care.kind} style={{ display: 'flex', flexWrap: 'wrap', gap: 8, borderTop: `1px solid ${bsHomeInk(t, 0.1)}`, paddingTop: 12 }}>
      {care.coaches.map((c) => {
        const face = <BSHomeCoachFace photo={c.photo} name={c.name || bsHomeRoleWord(tr, c.role)} role={c.role} size={care.seat ? 40 : 36} />;
        const key = `${c.role}:${c.providerId ?? c.name}`;
        return typeof onCoach === 'function' ? (
          <button key={key} type="button" data-home-goal-coach={c.role} onClick={() => onCoach(c)}
            aria-label={`${tr('home:care.coachPage', { defaultValue: '{name}’s page', name: c.name || bsHomeRoleWord(tr, c.role) })} · ${bsHomeDiscipline(tr, c.role)}`}
            style={{ ...cell, cursor: 'pointer' }}>{face}{words(c)}</button>
        ) : <div key={key} data-home-goal-coach={c.role} style={cell}>{face}{words(c)}</div>;
      })}
      {seatInk ? (() => {
        const find = care.openRole === 'nutritionist' ? tr('common:findCoach.nutritionist', { defaultValue: 'Find a nutritionist' }) : tr('common:findCoach.trainer', { defaultValue: 'Find a trainer' });
        const what = care.openRole === 'nutritionist' ? tr('home:week.barFood', { defaultValue: 'Food' }) : tr('home:care.training', { defaultValue: 'Training' });
        const body = (
          <>
            <span aria-hidden="true" style={{ width: 36, height: 36, flex: 'none', borderRadius: '26%', display: 'grid', placeItems: 'center', background: bsHomeA(seatInk.line, 0.14), color: seatInk.text }}><BSHomeGlyph name="plus" size={16} /></span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', ...bsHomeMono(t, { fontWeight: 700, fontSize: 9, letterSpacing: '0.14em', color: seatInk.text }), overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr('home:care.openSeat', { defaultValue: 'Open seat' })}</span>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 14, lineHeight: 1.25, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{what}</span>
            </span>
          </>
        );
        const seat = { ...cell, border: `1.5px dashed ${seatInk.line}`, borderRadius: 14, padding: '6px 8px', boxSizing: 'border-box' };
        return typeof onSeat === 'function'
          ? <button type="button" data-home-goal-seat={care.openRole} onClick={() => onSeat(care.openRole)} aria-label={`${tr('home:care.openSeat', { defaultValue: 'Open seat' })} · ${find}`} style={{ ...seat, cursor: 'pointer' }}>{body}</button>
          : <div data-home-goal-seat={care.openRole} style={seat}>{body}</div>;
      })() : null}
      {!care.seat && typeof onData === 'function' ? (
        <button type="button" data-home-goal-data="" onClick={onData}
          style={{ flex: 'none', alignSelf: 'center', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer', ...bsHomeMono(t, { fontWeight: 700, color: t.ACCENT }), whiteSpace: 'nowrap' }}>
          {tr('home:care.data', { defaultValue: 'Data →' })}
        </button>
      ) : null}
    </div>
  );
}

// ── The invitation, for a member with exactly one coach ──────────────────────────────────────────
// Owner, 2026-11-17, of this plate in the one-coach design: "i like this". Under the goal: what the
// member's coach has, what is still open, and the way to the coaches of the other discipline.
//
// ⚠ IT SAYS ONLY WHAT IS TRUE TODAY. A coach cannot yet name a partner (no pairing exists in the data),
// so the plate names none and promises no joint weekly review; it says what already happens once a member
// pays a trainer and a nutritionist: both read the member's plan, schedule and progress, and have a thread
// between them. When coach pairing ships, this plate names the coach's partner and opens their page.
//
// "Not now" puts it away for a fortnight on this device (homeCare.mjs's bsCareInviteShown); nothing
// changes with the member's coach, and the plate says so.
function bsHcToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function BSHomeInvite({ coaches = [], onFind = null }) {
  const care = bsHomeCare(coaches);
  const uid = (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id) || null;
  // What the device holds: a stamp an account and coach (homeCare.mjs's bsCareInviteRead / Write), so
  // another account's "Not now", or this member's for another coach, never wipes this one.
  const [stored, setStored] = useState(() => { try { return window.localStorage.getItem(BS_CARE_INVITE_KEY); } catch (e) { return null; } });
  const day = bsHcToday();
  const who = { uid, coach: care.only };
  const later = () => {
    // Read again at the tap: another tab may have put its own away since this one opened.
    let now = stored;
    try { now = window.localStorage.getItem(BS_CARE_INVITE_KEY); } catch (e) { /* what this visit holds */ }
    const next = bsCareInviteWrite(now, who, day);
    try { window.localStorage.setItem(BS_CARE_INVITE_KEY, next); } catch (e) { /* put away for this visit */ }
    setStored(next);
  };
  return <BSHomeInviteView care={care} shown={bsCareInviteShown({ care, uid, day, stamp: bsCareInviteRead(stored, who) })} onFind={onFind} onLater={later} />;
}

// The plate itself, off the care state. The tests draw it directly.
export function BSHomeInviteView({ care, shown = true, onFind = null, onLater = null }) {
  const t = window.useBS();
  const tr = useShapeTr();
  if (!shown || !care || !care.invite || !care.only || !care.openRole) return null;
  const food = care.openRole === 'nutritionist';
  const ink = bsCareRoleInk(t.isLight, care.openRole);
  const name = bsCareFirstName(care.only.name);
  const title = food
    ? (name ? tr('home:care.inviteTitleFood', { defaultValue: '{name} has your training. Food is the other half.', name }) : tr('home:care.inviteTitleFoodAnon', { defaultValue: 'Your trainer has your training. Food is the other half.' }))
    : (name ? tr('home:care.inviteTitleTrain', { defaultValue: '{name} has your food. Training is the other half.', name }) : tr('home:care.inviteTitleTrainAnon', { defaultValue: 'Your nutritionist has your food. Training is the other half.' }));
  const body = food
    ? tr('home:care.inviteBodyFood', { defaultValue: 'Add a nutritionist and both coaches see your plan, your schedule and your progress, with a thread of their own to work from.' })
    : tr('home:care.inviteBodyTrain', { defaultValue: 'Add a trainer and both coaches see your plan, your schedule and your progress, with a thread of their own to work from.' });
  const find = food ? tr('common:findCoach.nutritionist', { defaultValue: 'Find a nutritionist' }) : tr('common:findCoach.trainer', { defaultValue: 'Find a trainer' });
  return (
    <section data-bs-home-invite={care.openRole} aria-label={tr('home:care.inviteEyebrow', { defaultValue: 'The other half' })}
      style={{ margin: '10px 10px 0', boxSizing: 'border-box', borderRadius: 18, padding: 16, display: 'flex', flexDirection: 'column', gap: 10, color: t.INK,
        backgroundColor: t.isLight ? 'rgba(255,255,255,0.8)' : bsHomeInk(t, 0.055), backgroundImage: `linear-gradient(180deg, ${bsHomeA(ink.line, t.isLight ? 0.14 : 0.1)}, ${bsHomeA(ink.line, 0)})`, border: `1px solid ${bsHomeA(ink.line, 0.5)}` }}>
      <div style={{ ...bsHomeMono(t, { fontWeight: 700, color: ink.text }) }}>{tr('home:care.inviteEyebrow', { defaultValue: 'The other half' })}</div>
      <div data-home-invite-title="" style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 19, lineHeight: 1.2 }}>{title}</div>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.35, color: bsHomeInk(t, 0.8) }}>{body}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button type="button" data-home-invite-find={care.openRole} onClick={() => { if (typeof onFind === 'function') onFind(care.openRole); }} style={{ ...bsHomeButton(t, true), flex: '1 1 0', minWidth: 0 }}>{find}</button>
        <button type="button" data-home-invite-later="" onClick={() => { if (typeof onLater === 'function') onLater(); }} style={{ ...bsHomeButton(t, false), flex: '0 0 auto' }}>{tr('home:care.notNow', { defaultValue: 'Not now' })}</button>
      </div>
      <div data-home-invite-keep="" style={{ fontFamily: t.DISPLAY, fontSize: 12, lineHeight: 1.35, color: bsHomeInk(t, 0.66) }}>
        {name ? tr('home:care.inviteKeep', { defaultValue: 'Nothing changes with {name} either way.', name }) : tr('home:care.inviteKeepAnon', { defaultValue: 'Nothing changes with your coach either way.' })}
      </div>
    </section>
  );
}
