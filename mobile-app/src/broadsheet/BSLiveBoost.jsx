import React from 'react';
import { createPortal } from 'react-dom';
import { bsValidLivePayload } from '../services/liveProgress.mjs';
import { useBSLiveRow, useBSLiveMinutes } from './BSWallLive.jsx';
import { BSMpIcon } from './BSMemberBento.jsx';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType } from './bsCleanType.jsx';
import { bsDialogRef } from '../services/dialogBack.mjs';
// ─── THE LIVE BOOST SHEET: cheer someone on WHILE they're mid-workout or mid-cook ────────────────
// Opened from the Wall's online rail and its Training now story (iosAppBroadsheetClient.jsx), and from a
// coach's Home bulletin (iosAppBroadsheetPros.jsx, through window.BSLiveBoostSheet). It sends a real 1:1
// DM stamped metadata {kind:'live_boost', activity}: it lands in their chat right now (the thread prints
// a "Live boost" eyebrow over it) instead of waiting for the finished activity to post. A quick cheer is
// one tap; the field says it your own way.
//
// Redrawn from the magazine's print look (owner, 2026-11-04: "update to design for this pop up", "keep
// designs simple, nothing to futursitc … modern, appealing, esay to navigate, not overwhelming, not
// analog. make them look really alive, like popping off the screen", then "reduce the coloring and and
// simplify UI more"). The sheet is the paper's own colour with soft depth and no tinted panels; who
// they are (their face with a live pulse, their name, what they're doing as a calm pill) sits on top;
// the cheers are calm round pills that pop when pressed; the field's Send lights teal only once there is
// something to send; and a sent boost gets its own moment (a check and "Sent to Priya") before the sheet
// closes. Colour is only a signal: the live dot (teal in a workout, amber at the stove) and a ready Send.
// Every motion stops under reduced motion (the CSS below, and no animation styles are set at all).
// Moved out of iosAppBroadsheetClient.jsx when it was redrawn (the WORKLOG rule: a PR that touches a
// self-contained screen moves it into its own module). The client imports it and keeps the window global.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (see BSLeaderboard.jsx). This file is a
// static import of the client module, so it evaluates before that module's body has put useBS,
// BSFacetAvatar and bsInitials on window; a top-level read would capture undefined (React error #130).

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
// The client's bsValidPhoto, copied for the same reason: a blank or stale value never draws an empty image.
const validPhoto = (p) => {
  const s = (p == null ? '' : String(p)).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  if (/^data:/i.test(s)) return /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]{16,}/i.test(s) ? s : null;
  return /^(https?:|blob:|\/)/i.test(s) ? s : null;
};
const reducedMotion = () => { try { return typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) { return false; } };

// The quick cheers, one tap each, in the member's own language: what they tap is what is sent. Five a
// side, so they sit in two rows at 390px (owner, 2026-11-04: "simplify UI more"); the two near-repeats of
// the workout seven ("Love it!", "Strong — keep going.") and the cooking sixth ("Plate it clean.") went.
export const BS_BOOST_CHEERS = {
  workout: [
    ['feed:boost.cheer.letsGo', "Let's go!"], ['feed:boost.cheer.nice', 'Nice!'], ['feed:boost.cheer.oneMoreRep', 'One more rep.'],
    ['feed:boost.cheer.finishStrong', 'Finish strong →'], ['feed:boost.cheer.respect', 'Respect the work.'],
  ],
  cooking: [
    ['feed:boost.cheer.making', 'What are you making?'], ['feed:boost.cheer.sendPic', 'Send a pic →'],
    ['feed:boost.cheer.looksGood', 'Looks good already.'], ['feed:boost.cheer.chefMode', 'Chef mode — respect.'],
    ['feed:boost.cheer.fuel', 'Fuel the work.'],
  ],
};

// How long the sent moment shows before the sheet closes itself.
export const BS_BOOST_SENT_MS = 1400;

// The sheet's motion and pressed states, injected once. The reduced-motion block is the backstop for the
// inline animations (which are not set at all when the reader asked for less motion).
const BS_BOOST_CSS = `
@keyframes bsBoostFade { from { opacity: 0; } to { opacity: 1; } }
@keyframes bsBoostRise { from { transform: translateY(26px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes bsBoostIn { from { transform: translateY(6px); opacity: 0; } to { transform: none; opacity: 1; } }
@keyframes bsBoostPulse { 0% { transform: scale(1); opacity: 0.55; } 70%, 100% { transform: scale(2.5); opacity: 0; } }
@keyframes bsBoostPop { 0% { transform: scale(0.9); } 55% { transform: scale(1.06); } 100% { transform: scale(1); } }
@keyframes bsBoostCheck { 0% { transform: scale(0.4); opacity: 0; } 60% { transform: scale(1.1); opacity: 1; } 100% { transform: scale(1); opacity: 1; } }
@keyframes bsBoostRipple { 0% { transform: scale(1); opacity: 0.4; } 100% { transform: scale(1.9); opacity: 0; } }
.bs-boost-pill, .bs-boost-send, .bs-boost-profile { -webkit-tap-highlight-color: transparent; transition: transform 160ms cubic-bezier(.2,.8,.3,1.4), border-color 160ms ease, background-color 180ms ease, color 180ms ease, opacity 180ms ease, box-shadow 160ms ease; }
.bs-boost-pill:active:not(:disabled), .bs-boost-send:active:not(:disabled), .bs-boost-profile:active { transform: scale(0.94); }
.bs-boost-pill:focus-visible, .bs-boost-send:focus-visible, .bs-boost-profile:focus-visible { outline: 2px solid var(--bs-boost-ring); outline-offset: 2px; }
.bs-boost-field:focus-within { border-color: var(--bs-boost-ring) !important; }
.bs-boost-input::placeholder { color: var(--bs-boost-hint); opacity: 1; }
@media (hover: hover) { .bs-boost-pill:hover:not(:disabled) { border-color: var(--bs-boost-ring) !important; } }
@media (prefers-reduced-motion: reduce) {
  .bs-boost, .bs-boost * { animation: none !important; transition: none !important; }
  .bs-boost-pill:active:not(:disabled), .bs-boost-send:active:not(:disabled), .bs-boost-profile:active { transform: none; }
}
`;
function bsInjectBoostCss() {
  if (typeof document === 'undefined' || !document.head || document.getElementById('bs-boost-css')) return;
  const s = document.createElement('style');
  s.id = 'bs-boost-css';
  s.textContent = BS_BOOST_CSS;
  document.head.appendChild(s);
}

export function BSLiveBoostSheet({ person, onClose, onOpenProfile }) {
  const { useBS, BSFacetAvatar, bsInitials } = window;
  const t = useBS();
  const tr = useShapeTr();
  const INK = t.INK, light = !!t.isLight;
  const kind = person.activity === 'cooking' ? 'cooking' : 'workout';
  const teal = light ? '#0a8f87' : '#34d6c5';
  const onTeal = light ? '#ffffff' : '#04201d';
  // The live dot's colour: teal in a workout, amber at the stove (as the face's dot on the rail).
  const live = kind === 'cooking' ? (t.AMBER || '#d8a23a') : teal;
  const name = String(person.name || person.who || '').trim();
  const first = name.split(/\s+/)[0] || tr('profile:role.member', { defaultValue: 'Member' });
  const isCoach = person.role === 'trainer' || person.role === 'nutritionist';
  const [custom, setCustom] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  // What was sent (the words), or null: the sent moment shows them back.
  const [sentText, setSentText] = React.useState(null);
  // The cheer being sent ('custom' for the field), so it holds its pressed look while the send runs.
  const [picked, setPicked] = React.useState(null);
  const [photoFailed, setPhotoFailed] = React.useState(false);
  // What the sheet has to say back (sign in first, a demo member, a failed send), in the note's place.
  // ⚠ TOASTS ARE A NO-OP APP-WIDE (BSToastHost, iosAppBroadsheet.jsx), so a toast alone said nothing: a tap
  // on a cheer in the preview did nothing a reader could see. The toast still fires; the sheet says it too.
  const [notice, setNotice] = React.useState(null);
  const sent = sentText != null;
  // "N min in": honest, only when started_at is readable (BSWallLive.jsx, shared with the Wall's card).
  const mins = useBSLiveMinutes(person.userId || null);
  const signedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  // Live set-by-set line (spec 2026-07-18): renders ONLY when a row is readable under RLS. No row → no
  // line; absence is deliberately unremarkable (never "they hid this", which would leak that a setting
  // exists). Demo people (no userId) never fetch. The row's own payload.kind decides what renders (spec
  // 2026-07-19); the read, its TOCTOU guard and its expiry live in useBSLiveRow (BSWallLive.jsx).
  const row = useBSLiveRow(person.userId || null);
  const lp = row ? bsValidLivePayload(row.payload) : null;   // malformed/unknown wire shape → render nothing
  // A DISCRIMINATED UNION (workout | cooking): lpWork carries exercises/sets, lpCook a title and nothing
  // else, so neither branch can touch the other's fields.
  const lpWork = lp && (!lp.kind || lp.kind === 'workout') ? lp : null;
  const lpCook = lp && lp.kind === 'cooking' ? lp : null;
  const lpCur = lpWork && lpWork.curIdx >= 0 && lpWork.exercises[lpWork.curIdx] ? lpWork.exercises[lpWork.curIdx] : null;

  const closeTimer = React.useRef(null);
  React.useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  const say = (msg, level) => { window.__bsToast?.(msg, level); setNotice(msg); };
  const sendBoost = async (body, which) => {
    const msg = String(body || '').trim();
    if (!msg || busy || sent) return;
    if (!signedIn) { say(tr('feed:boost.toastJoin', { defaultValue: 'Join Shape to send live boosts' }), 'info'); return; }
    if (!person.userId) { say(tr('feed:boost.toastDemo', { defaultValue: "Demo member — boosts reach real members when they're live." }), 'info'); return; }
    setBusy(true);
    setPicked(which);
    setNotice(null);
    try {
      const r = await window.ShapeMessages.getOrCreateMemberConversation({ otherUserId: person.userId });
      const cid = (r && r.data) || null;
      if (!cid) throw new Error('no conversation');
      await window.ShapeMessages.sendMessage({ conversationId: cid, body: msg, metadata: { kind: 'live_boost', activity: kind } });
      setSentText(msg);
      window.__bsToast?.(tr('feed:boost.toastSent', { defaultValue: 'Boost sent → {name}', name: first }), 'ok');
      closeTimer.current = setTimeout(() => { onClose && onClose(); }, BS_BOOST_SENT_MS);
    } catch (e) {
      setPicked(null);
      say(tr('feed:boost.toastError', { defaultValue: 'Could not send — try again' }), 'err');
    } finally { setBusy(false); }
  };

  // Real modal semantics: dialog role, Escape closes, and focus moves INTO the sheet on open (not into
  // the field: that would pop the mobile keyboard over the cheers).
  const panelRef = React.useRef(null);
  React.useEffect(() => { try { panelRef.current && panelRef.current.focus(); } catch (e) {} }, []);
  const reduced = reducedMotion();
  const anim = (value) => (reduced ? null : { animation: value });
  (React.useInsertionEffect || React.useLayoutEffect)(() => { bsInjectBoostCss(); }, []);
  const surface = (typeof document !== 'undefined' && (document.getElementById('bs-phone-surface') || document.body)) || null;
  if (!surface) return null;

  const hair = hexA(INK, light ? 0.12 : 0.16);
  const muted = hexA(INK, light ? 0.62 : 0.66);
  const cheers = (BS_BOOST_CHEERS[kind] || BS_BOOST_CHEERS.workout).map(([key, def]) => tr(key, { defaultValue: def }));
  const ready = !!custom.trim() && !busy && !sent;
  // Send stays lit while its own words are on the way.
  const sendLit = ready || (busy && picked === 'custom');
  const status = kind === 'cooking' ? tr('feed:boost.cookingNow', { defaultValue: 'Cooking now' }) : tr('feed:boost.workoutNow', { defaultValue: 'In a workout now' });
  const minsIn = mins != null ? tr('feed:wallLive.minIn', { defaultValue: '{n, number} min in', n: mins }) : null;
  const placeholder = tr('feed:boost.placeholder', { defaultValue: 'Cheer {name} on…', name: first });
  const photo = validPhoto(person.photoUrl || person.photo);
  const initials = (bsInitials && bsInitials(name)) || '?';
  const AV = 56;

  // Their face: a member's facet (the magazine's flat cut, as on the rail), a coach's round photo in the
  // ring of the coach's colour; the live dot at its corner, breathing out a soft pulse.
  const face = isCoach ? (
    <span style={{ display: 'block', width: AV, height: AV, borderRadius: '50%', border: `2px solid ${person.role === 'nutritionist' ? '#a07a2e' : '#c0533b'}`, padding: 2, boxSizing: 'border-box' }}>
      {photo && !photoFailed
        ? <img src={photo} alt="" onError={() => setPhotoFailed(true)} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
        : <span style={{ width: '100%', height: '100%', borderRadius: '50%', display: 'grid', placeItems: 'center', background: t.PAPER, fontFamily: BS_CLEAN_HEAD, fontSize: 19, fontWeight: 650, color: muted }}>{initials}</span>}
    </span>
  ) : (
    <BSFacetAvatar flat size={AV} c={INK} initial={initials} photo={photo || undefined} online={false} showRank={false} BG={t.PAPER} INK={INK} />
  );

  // BSCleanType keeps the weights it is written with: the app's "regular" weight otherwise steps every
  // inline weight down (bsCleanType.jsx), and the name's 700 drew at 500.
  return createPortal(
    <BSCleanType t={t}>
    <div className="bs-boost" onClick={onClose} onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose && onClose(); } }}
      style={{ position: 'absolute', inset: 0, zIndex: 240, background: light ? 'rgba(15,14,12,0.42)' : 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', ...anim('bsBoostFade 220ms ease both') }}>
      <div ref={bsDialogRef(onClose, panelRef)} tabIndex={-1} role="dialog" aria-modal="true" data-boost-sheet=""
        aria-label={tr('feed:boost.dialogAria', { defaultValue: 'Send {name} a live boost', name: first })}
        onClick={(e) => e.stopPropagation()}
        style={{
          '--bs-boost-ring': hexA(INK, 0.5), '--bs-boost-hint': hexA(INK, light ? 0.48 : 0.5),
          width: '100%', boxSizing: 'border-box', background: t.PAPER, color: INK, outline: 'none',
          borderTopLeftRadius: 26, borderTopRightRadius: 26, borderTop: `1px solid ${hexA(INK, light ? 0.06 : 0.1)}`,
          boxShadow: light ? '0 -10px 30px rgba(15,14,12,0.12), 0 -1px 3px rgba(15,14,12,0.05)' : '0 -18px 44px rgba(0,0,0,0.55)',
          padding: `20px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, fontFamily: BS_CLEAN_SANS,
          ...anim('bsBoostRise 340ms cubic-bezier(.2,.8,.3,1) both'),
        }}>
        {/* Who, and what they're doing right now */}
        <div style={{ display: 'grid', gridTemplateColumns: `${AV}px minmax(0, 1fr) auto`, columnGap: 14, rowGap: 6, alignItems: 'center' }}>
          <span data-boost-face="" style={{ gridRow: '1 / span 2', position: 'relative', width: AV, height: AV }}>
            {face}
            <span aria-hidden="true" style={{ position: 'absolute', right: -3, bottom: -3, width: 18, height: 18, borderRadius: 99, background: t.PAPER, display: 'grid', placeItems: 'center' }}>
              {reduced ? null : <span data-boost-pulse="" style={{ position: 'absolute', inset: 4, borderRadius: 99, background: live, animation: 'bsBoostPulse 2.2s ease-out infinite' }} />}
              <span data-boost-dot="" style={{ position: 'relative', width: 10, height: 10, borderRadius: 99, background: live }} />
            </span>
          </span>
          {/* A long name wraps to a second line rather than losing its surname beside Profile on a narrow phone. */}
          <div data-boost-name="" style={{ minWidth: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 20, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.15, overflowWrap: 'anywhere', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', alignSelf: 'end' }}>{name || first}</div>
          {onOpenProfile ? (
            <button type="button" className="bs-boost-profile" data-boost-profile="" onClick={() => { onClose && onClose(); onOpenProfile(); }}
              style={{ alignSelf: 'end', minHeight: 44, minWidth: 44, margin: '-8px -6px -8px 0', padding: '0 6px', border: 0, background: 'transparent', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', color: INK }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, height: 32, padding: '0 10px 0 13px', borderRadius: 99, border: `1px solid ${hair}`, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, whiteSpace: 'nowrap' }}>
                {tr('feed:boost.profile', { defaultValue: 'Profile' })}<BSMpIcon name="chevron" size={14} stroke={2.2} />
              </span>
            </button>
          ) : null}
          <div style={{ gridColumn: '2 / span 2', minWidth: 0, alignSelf: 'start' }}>
            <span data-boost-status="" style={{ display: 'inline-block', maxWidth: '100%', boxSizing: 'border-box', padding: '4px 11px', borderRadius: 99, border: `1px solid ${hair}`, fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, color: muted, overflowWrap: 'anywhere' }}>
              {status}{minsIn ? ` · ${minsIn}` : ''}
            </span>
          </div>
        </div>

        {/* What they're on, when their live row is readable. Cooking: the PLANNED meal's title only, never
            macros, portions or adjustments; a freehand meal pushes nothing, so nothing renders. */}
        {lpCook ? (
          <div data-boost-live="" style={{ marginTop: 14, fontSize: 13.5, lineHeight: 1.4, color: INK, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lpCook.title}</div>
        ) : null}
        {lpWork ? (
          <div data-boost-live="" style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13.5, lineHeight: 1.4, color: muted, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontVariantNumeric: 'tabular-nums' }}>
              {lpCur ? <>
                <span style={{ color: INK, fontWeight: 650 }}>{lpCur.n}</span>
                {' · '}{tr('feed:boost.liveSet', { done: Math.min(lpCur.done + 1, lpCur.total), total: lpCur.total, defaultValue: 'set {done, number} of {total, number}' })}
                {' · '}
              </> : null}
              {tr('feed:boost.liveSets', { done: lpWork.setsDone, total: lpWork.setsTotal, defaultValue: '{done, number}/{total, number} sets' })}
            </div>
            <div aria-hidden="true" style={{ marginTop: 7, height: 4, borderRadius: 99, background: hexA(INK, 0.1), overflow: 'hidden' }}>
              <div style={{ height: '100%', borderRadius: 99, width: `${lpWork.setsTotal ? Math.round((lpWork.setsDone / lpWork.setsTotal) * 100) : 0}%`, background: hexA(INK, 0.78) }} />
            </div>
          </div>
        ) : null}

        {/* The note (or what the sheet has to say back), the cheers and the field. Once sent they hold their
            place, hidden, and the sent moment draws over them, so the sheet keeps its height. The note holds
            two lines, so a one-line reply does not move the cheers under the finger that tapped one. */}
        <div style={{ position: 'relative' }}>
          <div data-boost-body="" aria-hidden={sent ? 'true' : undefined} style={sent ? { visibility: 'hidden' } : undefined}>
            <p data-boost-note="" aria-live="polite" style={{ margin: '14px 0 0', minHeight: '2.9em', fontSize: 13, lineHeight: 1.45, color: notice ? INK : muted, fontWeight: notice ? 600 : 400, ...(notice ? anim('bsBoostIn 260ms ease both') : null) }}>
              {notice || (person.userId
                ? (kind === 'cooking'
                  ? tr('feed:boost.noteLiveCooking', { defaultValue: 'Lands in their chat right now — mid-cook, not after the post.' })
                  : tr('feed:boost.noteLiveWorkout', { defaultValue: 'Lands in their chat right now — mid-set, not after the post.' }))
                : tr('feed:boost.noteDemo', { defaultValue: "Preview · demo member — boosts land in a real member's chat while they train." }))}
            </p>
            {/* The quick cheers: calm round pills, one tap sends. Each row's pills share its width, so the rows
                read as one tidy block at any width or language rather than a ragged edge. */}
            <div data-boost-cheers="" style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {cheers.map((ph, i) => {
                const on = picked === i;
                return (
                  <button key={i} type="button" className="bs-boost-pill" data-boost-cheer={i} disabled={busy || sent} onClick={() => sendBoost(ph, i)}
                    style={{
                      flex: '1 1 auto', minHeight: 44, maxWidth: '100%', padding: '0 15px', borderRadius: 99, boxSizing: 'border-box',
                      border: `1px solid ${on ? hexA(INK, 0.55) : hair}`, background: t.PAPER, color: INK,
                      boxShadow: light ? '0 1px 2px rgba(15,14,12,0.06)' : 'none',
                      fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 500, lineHeight: 1.2, textAlign: 'center', overflowWrap: 'anywhere',
                      cursor: busy || sent ? 'default' : 'pointer', opacity: busy && !on ? 0.45 : 1,
                      ...(reduced ? null : { animation: on ? 'bsBoostPop 320ms cubic-bezier(.2,.8,.3,1.3) both' : `bsBoostIn 280ms ease ${90 + i * 35}ms both` }),
                    }}>{ph}</button>
                );
              })}
            </div>
            {/* Say it your way: the field, with Send inside it that lights up once there is text */}
            <div className="bs-boost-field" style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 6, minHeight: 52, padding: '3px 4px 3px 18px', boxSizing: 'border-box', borderRadius: 99, border: `1px solid ${hair}`, background: t.PAPER, ...anim(`bsBoostIn 280ms ease ${90 + cheers.length * 35}ms both`) }}>
              <input className="bs-boost-input" value={custom} onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendBoost(custom, 'custom'); }}
                placeholder={placeholder} aria-label={placeholder} enterKeyHint="send" disabled={sent}
                style={{ flex: 1, minWidth: 0, minHeight: 44, boxSizing: 'border-box', border: 0, background: 'transparent', color: INK, padding: 0, fontFamily: BS_CLEAN_SANS, fontSize: 16, outline: 'none' }} />
              <button type="button" className="bs-boost-send" data-boost-send="" disabled={!ready} onClick={() => sendBoost(custom, 'custom')}
                style={{
                  flexShrink: 0, minHeight: 44, minWidth: 44, padding: '0 16px', borderRadius: 99, border: 0, display: 'inline-flex', alignItems: 'center', gap: 6,
                  background: sendLit ? teal : 'transparent', color: sendLit ? onTeal : hexA(INK, 0.42), cursor: ready ? 'pointer' : 'default',
                  fontFamily: BS_CLEAN_SANS, fontSize: 15, fontWeight: 650,
                  ...(ready && !reduced ? { animation: 'bsBoostPop 300ms cubic-bezier(.2,.8,.3,1.3) both' } : null),
                }}>
                {busy && picked === 'custom' ? '…' : <>{tr('feed:action.send', { defaultValue: 'Send' })}<BSMpIcon name="send" size={15} stroke={2.2} /></>}
              </button>
            </div>
          </div>
          {/* The sent moment: a check that pops, who it went to, and the words that went. The live region is
              always there, so its words are announced when they arrive. */}
          <div role="status" aria-live="polite" data-boost-sent={sent ? '' : undefined}
            style={{ position: 'absolute', inset: 0, pointerEvents: 'none', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
            {sent ? (
              <>
                <span style={{ position: 'relative', width: 56, height: 56, display: 'grid', placeItems: 'center' }}>
                  {reduced ? null : <span aria-hidden="true" style={{ position: 'absolute', inset: 0, borderRadius: 99, background: teal, animation: 'bsBoostRipple 700ms ease-out 120ms both' }} />}
                  <span aria-hidden="true" style={{ position: 'relative', width: 56, height: 56, borderRadius: 99, background: teal, color: onTeal, display: 'grid', placeItems: 'center', boxShadow: light ? '0 8px 20px -8px rgba(10,143,135,0.55)' : 'none', ...anim('bsBoostCheck 420ms cubic-bezier(.2,.9,.3,1.2) both') }}>
                    <BSMpIcon name="check" size={26} stroke={2.8} />
                  </span>
                </span>
                <div style={{ marginTop: 14, fontFamily: BS_CLEAN_HEAD, fontSize: 19, fontWeight: 700, letterSpacing: '-0.01em', ...anim('bsBoostIn 300ms ease 160ms both') }}>
                  {tr('feed:boost.sentTitle', { defaultValue: 'Sent to {name}', name: first })}
                </div>
                <div style={{ marginTop: 4, maxWidth: '100%', fontSize: 14, lineHeight: 1.4, color: muted, overflowWrap: 'anywhere', ...anim('bsBoostIn 300ms ease 220ms both') }}>“{sentText}”</div>
              </>
            ) : null}
          </div>
        </div>
      </div>
    </div>
    </BSCleanType>,
    surface
  );
}
