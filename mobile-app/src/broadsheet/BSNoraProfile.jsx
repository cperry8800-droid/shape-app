import React from 'react';
import { createPortal } from 'react-dom';
import { bsNoraPhotoError } from './noraFace.mjs';
// ─── NORA'S PROFILE (Shape's AI concierge) ───────────────────────────────────
// Moved out of iosAppBroadsheetClient.jsx (2026-11-01) when it took the profile look. Owner,
// 2026-11-01, on a screenshot of the old page: "also need to update design of this page", and
// "has old masthead" (a bare Vol. 1 · No. 1 row with only the ⚙, over a ← row on the paper).
//
// It is the coach and member profiles' head now (#2546): a cover (the night city behind her
// photo, every window lit: always on) under the masthead in white with its ✦ ⌕ ⚙, the round
// photo over the cover's edge, her name and what she is, the counts, Message Nora and Email the
// team, then what she helps with on the profile's eyebrows and hairlines, and her promise. It is
// still a STAFF page, deliberately not a member's: no score, followers or climb.
//
// ⚠ IT PAINTS AT zIndex 100000, above search (230), Settings (210) and the Nora sheet (240), so
// every way off the page first takes the page down: ← and Message Nora call `onClose`; ✦ ⌕ ⚙ call
// `onLeave` (the page, and the sheet under it when the sheet opened it) and hand off on the next
// tick, so what they open is not under this page.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, BSLogo, BSBackRow, BSSettingsCorner,
// BSSearchCorner, BS_MAST_TOP_CSS), never at module top: this file is a static import of the
// client module, which evaluates it before anything is put on window (BSIntegrationsPage.jsx).

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

const SUPPORT_EMAIL = 'info@theshapecommunity.com';

// #rrggbb (or #rgb) at an alpha.
function hexA(hex, a) {
  let h = String(hex || '').replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return hex;
  const n = parseInt(h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

/** What she helps with: [key, title, what it covers]. */
export function bsNoraHelps(tr) {
  return [
    ['integrations', tr('feed:support.profile.helpIntegrations', { defaultValue: 'Connecting integrations' }), tr('feed:support.profile.helpIntegrationsSub', { defaultValue: 'WHOOP, Oura, Strava, Spotify and more' })],
    ['plan', tr('feed:support.profile.helpPlan', { defaultValue: 'Your plan & programs' }), tr('feed:support.profile.helpPlanSub', { defaultValue: 'Workouts, meals, schedules, swaps' })],
    ['billing', tr('feed:support.profile.helpBilling', { defaultValue: 'Billing & membership' }), tr('feed:support.profile.helpBillingSub', { defaultValue: 'The $5/mo plan, coach payments, receipts' })],
    ['account', tr('feed:support.profile.helpAccount', { defaultValue: 'Account & settings' }), tr('feed:support.profile.helpAccountSub', { defaultValue: 'Profile, privacy, notifications, data' })],
    ['coach', tr('feed:support.profile.helpCoach', { defaultValue: 'Finding a coach' }), tr('feed:support.profile.helpCoachSub', { defaultValue: 'Matching you with vetted trainers and nutritionists' })],
  ];
}

/**
 * @param onClose  ← and Message Nora: back to wherever she was opened from (the sheet, the thread).
 * @param onLeave  ✦ ⌕ ⚙: everything above the app comes down first (defaults to onClose).
 * @param avatar   her photo's URL; @param cover the cover's.
 */
export function BSNoraProfile({ onClose, onLeave = null, avatar, cover = null }) {
  const { useBS, BSLogo, BSBackRow, BSSettingsCorner, BSSearchCorner } = window;
  const t = useBS();
  const tr = useShapeTr();
  const MAST_TOP = window.BS_MAST_TOP_CSS || 'calc(env(safe-area-inset-top, 0px) + 14px)';
  const gutter = t.padX || 22;
  const BG = t.PAPER_BG || t.PAPER;
  const INK = t.INK;
  const WHITE = '#ffffff';
  const TEAL = t.isLight ? '#0a8f87' : '#34d6c5';
  const corner = 34;
  const leave = typeof onLeave === 'function' ? onLeave : onClose;
  const goSettings = () => { leave(); setTimeout(() => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} }, 0); };
  const eyebrow = { fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' };
  const stats = [
    [tr('feed:support.profile.statInstant', { defaultValue: 'Instant' }), tr('feed:support.profile.statReplies', { defaultValue: 'Replies' })],
    ['24/7', tr('feed:support.profile.statHours', { defaultValue: 'Hours' })],
    [tr('feed:support.profile.statHuman', { defaultValue: 'Human' }), tr('feed:support.profile.statBackup', { defaultValue: 'Backup' })],
  ];
  const btn = (primary) => ({ flex: primary ? 1.2 : 1, minHeight: 46, boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 12px', border: primary ? 0 : `1px solid ${hexA(INK, 0.22)}`, background: primary ? TEAL : 'transparent', color: primary ? (t.isLight ? WHITE : '#06110e') : INK, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, textDecoration: 'none', cursor: 'pointer', textAlign: 'center' });
  const sheet = (
    <div data-nora-profile="" className="bs-scroll" style={{ position: 'absolute', inset: 0, zIndex: 100000, background: BG, color: INK, overflowY: 'auto', WebkitFontSmoothing: 'antialiased' }}>
      {/* The cover, with the masthead (and Back) over it in white, as on the coach and member profiles. */}
      <div data-nora-cover="" style={{ position: 'relative', height: `calc(${MAST_TOP} + 190px)`, overflow: 'hidden', background: '#0b1320' }}>
        {cover ? <img src={cover} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 35%' }} /> : null}
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.66) 42%, rgba(0,0,0,0.22) 72%, rgba(0,0,0,0.4) 100%), linear-gradient(120deg, ${hexA('#34d6c5', 0.2)} 0%, rgba(0,0,0,0) 55%)` }} />
        <div style={{ position: 'relative', padding: `${MAST_TOP} ${Math.max(4, gutter - 10)}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 10, color: WHITE }}>
            {BSLogo && <BSLogo size={16} color={WHITE} />}
            <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>Vol. 1 · No. 1</span>
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: window.BS_CORNER_GAP || 9 }}>
            {BSSearchCorner && <BSSearchCorner size={corner} ink={WHITE} close={leave} />}
            {BSSettingsCorner && <BSSettingsCorner size={corner} ink={WHITE} onClick={goSettings} />}
          </div>
        </div>
        <div style={{ position: 'relative', padding: `0 ${gutter}px` }}>
          <BSBackRow onBack={onClose} ink={WHITE} buttonStyle={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}
            trailing={<span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: hexA(WHITE, 0.82), textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>{tr('feed:support.profile.team', { defaultValue: 'Shape team' })}</span>} />
        </div>
      </div>

      <div style={{ position: 'relative', padding: `0 ${gutter}px calc(32px + env(safe-area-inset-bottom, 0px))` }}>
        {/* Her photo over the cover's edge, with the always-on dot. */}
        <div style={{ position: 'absolute', left: gutter, top: -58, width: 108, height: 108 }}>
          <div style={{ width: 108, height: 108, borderRadius: 99, border: `4px solid ${BG}`, background: '#0f0c0a', overflow: 'hidden', boxSizing: 'border-box', boxShadow: `0 0 0 1.5px ${hexA(TEAL, 0.55)}, 0 10px 30px rgba(0,0,0,0.18)` }}>
            <img src={avatar} alt="" onError={bsNoraPhotoError} style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover', objectPosition: '50% 30%' }} />
          </div>
          <span aria-label={tr('feed:support.profile.online', { defaultValue: 'Always online' })} style={{ position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: 99, background: '#34d6c5', border: `3px solid ${BG}`, boxSizing: 'border-box', boxShadow: `0 0 10px ${hexA('#34d6c5', 0.7)}` }} />
        </div>
        <div style={{ marginLeft: 120, paddingTop: 8, minHeight: 58, display: 'flex', flexDirection: 'column', gap: 3 }}>
          <h1 data-nora-name="" style={{ margin: 0, fontFamily: t.DISPLAY, fontWeight: 600, fontSize: 30, lineHeight: 1, letterSpacing: '-0.02em', color: INK }}>Nora<span style={{ color: TEAL }}>.</span></h1>
          <span style={{ fontSize: 13, color: hexA(INK, 0.74) }}>{tr('feed:support.profile.role', { defaultValue: "Shape's AI concierge" })}</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: TEAL }}>
            <span aria-hidden style={{ width: 6, height: 6, borderRadius: 99, background: TEAL }} />
            {tr('feed:support.profile.online', { defaultValue: 'Always online' })}
          </span>
        </div>
        <p data-nora-bio="" style={{ margin: '16px 0 0', fontSize: 15.5, lineHeight: 1.5, color: INK }}>{tr('feed:support.profile.bio', { defaultValue: 'Here for every member and visitor, day and night.' })}</p>

        {/* The counts, as the profiles' row: the figure over what it counts. */}
        <div data-nora-stats="" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', marginTop: 16, borderTop: `1px solid ${hexA(INK, 0.12)}`, borderBottom: `1px solid ${hexA(INK, 0.12)}` }}>
          {stats.map(([figure, label], i) => (
            <div key={i} style={{ padding: '12px 4px', textAlign: 'center', borderLeft: i ? `1px solid ${hexA(INK, 0.12)}` : 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, letterSpacing: '-0.02em', color: INK }}>{figure}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: hexA(INK, 0.62) }}>{label}</div>
            </div>
          ))}
        </div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button type="button" data-nora-message="" onClick={onClose} style={btn(true)}>{tr('feed:support.profile.message', { defaultValue: 'Message Nora' })} <span aria-hidden>→</span></button>
          <a data-nora-email="" href={`mailto:${SUPPORT_EMAIL}`} style={btn(false)}>{tr('feed:support.profile.email', { defaultValue: 'Email the team' })}</a>
        </div>

        {/* What she helps with, on the profiles' eyebrows and hairlines. */}
        <section data-nora-helps="" style={{ marginTop: 26 }}>
          <div style={{ ...eyebrow, color: hexA(INK, 0.64), paddingBottom: 8, borderBottom: `1px solid ${hexA(INK, 0.12)}` }}>{tr('feed:support.profile.helpsTitle', { defaultValue: 'What Nora helps with' })}</div>
          {bsNoraHelps(tr).map(([key, title, sub], i) => (
            <div key={key} style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '13px 0', borderBottom: `1px solid ${hexA(INK, 0.08)}` }}>
              <span aria-hidden style={{ flex: 'none', width: 20, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.04em', color: TEAL }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em', color: INK }}>{title}</span>
                <span style={{ display: 'block', marginTop: 2, fontSize: 12.5, lineHeight: 1.4, color: hexA(INK, 0.62) }}>{sub}</span>
              </span>
            </div>
          ))}
        </section>

        {/* Her promise: a person at Shape when she can't sort it out. */}
        <figure data-nora-promise="" style={{ margin: '24px 0 0', padding: '2px 0 2px 16px', borderLeft: `3px solid ${TEAL}` }}>
          <blockquote style={{ margin: 0, fontFamily: t.DISPLAY, fontSize: 17, fontStyle: 'italic', lineHeight: 1.45, color: INK }}>
            “{tr('feed:support.profile.promise', { defaultValue: "If I can't sort it out, I'll point you to the human Shape team at {email}.", email: SUPPORT_EMAIL })}”
          </blockquote>
          <figcaption style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: hexA(INK, 0.55) }}><span aria-hidden>— </span>Nora</figcaption>
        </figure>
      </div>
    </div>
  );
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return surface ? createPortal(sheet, surface) : sheet;
}
