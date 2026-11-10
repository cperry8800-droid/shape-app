import React from 'react';
import { createPortal } from 'react-dom';
import { bsPaidLockNow, bsNoraLockNow, bsNoraLockOf, bsNoraDaysLeft, bsNoraPreviewNoticeShown, bsNoraPreviewStamp, bsPastDueNoticeShown, bsPastDueStamp } from '../services/memberGate.mjs';
// ─── A LOCKED PAID FEATURE (owner, 2026-11-10) ─────────────────────────────────
// An account is all the app needs; the $5 membership adds assistant Nora (her action cards and
// her voice), Shape Radio, the AI helpers, Cook Mode's voice and the points Store. Every one of
// those, met by an account that has not paid, draws the same small treatment from here:
//
//   free     a free account (never paid, or cancelled): what the feature is, that $5 a month
//            adds Nora, Shape Radio and the AI helpers, and Join (the one checkout door).
//   pastDue  the renewal failed and Stripe is retrying: "Your payment didn't go through. Update
//            your card to get Shape Radio and Nora back." and Update your card, which opens the
//            Stripe billing portal. Never the Join prompt: a second checkout would sell them a
//            second membership.
//   noraEnded  a free account whose free week of assistant Nora has ended (after its first 3
//            workouts it gets 7 days of her, once): "Your free week with Nora has ended. Join to
//            keep her." and Join. Only Nora's features take it (her cards, her voice, Cook Mode's
//            voice, the weekly readout): Radio, the Store, the full board and the AI helpers were
//            never in the week, and say the plain upgrade.
//
// Join opens the plan picker (Monthly or Annual, from /api/membership/plans) before the checkout,
// unless only monthly is configured. An account whose membership comes with its coaching is a
// member, so it never meets a lock or a Join.
//
// The shell (iosAppBroadsheetMain.jsx) publishes window.ShapePaid and window.ShapePastDue from
// /api/me/membership with a 'shape:paid' event. Only an explicit ShapePaid === false locks: on
// the first frames of a cold launch the flag is unknown, and a member is never shown a lock for
// a feature they pay for. A paid route's own 402 (membership_required / payment_past_due) is the
// other source, read where the call is made (memberGate.mjs maps the codes).
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, BSPlate, ShapeApi, ShapeMembershipApi,
// ShapeAuth), never at module top: the shell and the client import this module before those
// modules have put anything on window (see BSIntegrationsPage.jsx).
//
// ⚠ TOASTS ARE A NO-OP APP-WIDE (iosAppBroadsheet.jsx), so a Join or a portal that did not open
// says so on the lock itself, not in a toast nobody sees.

export const BS_MEMBERSHIP_PRICE = '$5';

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

/** The lock the shell's flags mean now: null (not locked, or not known yet), 'free' or 'pastDue'. */
export function bsPaidLockRead() {
  try { return bsPaidLockNow({ paid: window.ShapePaid, pastDue: window.ShapePastDue }); } catch (e) { return null; }
}

/** The same, as a hook that follows the shell's 'shape:paid' event. */
export function useBSPaidLock() {
  return useBSFlag(bsPaidLockRead);
}

/** Assistant Nora's lock now (window.ShapeNora): null, 'free', 'pastDue' or 'noraEnded'. */
export function bsNoraLockRead() {
  try { return bsNoraLockNow({ nora: window.ShapeNora, pastDue: window.ShapePastDue, noraPreview: window.ShapeNoraPreview }); } catch (e) { return null; }
}
export function useBSNoraLock() {
  return useBSFlag(bsNoraLockRead);
}
/** A Nora route's 402 code as its lock, the ended week included. */
export function bsNoraLockFromCode(code) {
  try { return bsNoraLockOf(code, window.ShapeNoraPreview) || 'free'; } catch (e) { return 'free'; }
}
/** The free week now: { startedAt, endsAt, active } or null. */
export function bsNoraPreviewRead() {
  try { return window.ShapeNoraPreview || null; } catch (e) { return null; }
}
export function useBSNoraPreview() {
  return useBSFlag(bsNoraPreviewRead);
}
/** Whether the account's membership comes with its coaching (window.ShapeIncludedWithCoach). */
export function useBSIncludedWithCoach() {
  return useBSFlag(() => { try { return window.ShapeIncludedWithCoach === true; } catch (e) { return false; } });
}

// One reader of the shell's flags, re-read on its 'shape:paid' event.
function useBSFlag(read) {
  const [v, setV] = React.useState(read);
  React.useEffect(() => {
    const on = () => setV(read());
    on();
    if (typeof window.addEventListener !== 'function') return undefined;
    window.addEventListener('shape:paid', on);
    return () => window.removeEventListener('shape:paid', on);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return v;
}

// A paid route refused this account (a 402) while the shell's flags still read it as paid or
// unknown: the membership changed under the session (a renewal failed, a cancellation ran out).
// The shell is asked to read it again ('shape:membership-recheck'), at most once a minute, so
// every other paid feature locks with it instead of each failing on its own.
let bsPaidRecheckAt = 0;
export function bsPaidRefused() {
  const now = Date.now();
  if (now - bsPaidRecheckAt < 60000) return;
  bsPaidRecheckAt = now;
  try { window.dispatchEvent(new Event('shape:membership-recheck')); } catch (e) {}
}

const bsApiFetch = (path, init) => (window.ShapeApi ? window.ShapeApi.fetch(path, init) : fetch(path, init));

/**
 * The Stripe billing portal, where a past-due member updates the card (POST
 * /api/stripe/billing-portal { returnPath: '/m/' }, as Settings' Manage does). Resolves true when
 * it is opening, false when it could not.
 */
export async function bsOpenBillingPortal() {
  const signedIn = !!(window.ShapeAuth?.getCachedState?.()?.user?.id);
  if (!signedIn) { try { window.__bsGoAuth?.('signin'); } catch (e) {} return false; }
  try {
    const res = await bsApiFetch('/api/stripe/billing-portal', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ returnPath: '/m/' }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data && data.url) { window.location.href = data.url; return true; }
  } catch (e) {}
  return false;
}

/**
 * The plan for a Join: the picker sheet (BSPlanPickerHost, mounted by the shell) offers Monthly and
 * Annual from /api/membership/plans and resolves 'monthly' | 'annual', or null when the member
 * closes it. With no annual plan configured, or no picker mounted, it is monthly at once.
 */
export function bsPickPlan() {
  return new Promise((resolve) => {
    const host = typeof window !== 'undefined' ? window.__bsPlanPicker : null;
    if (typeof host !== 'function') { resolve('monthly'); return; }
    try { host(resolve); } catch (e) { resolve('monthly'); }
  });
}

/**
 * Join: the membership through the backend's one checkout door, on the plan the member picks. A
 * past-due account is refused a second membership (409 payment_past_due) and goes to the billing
 * portal instead. Resolves { ok } — ok when the checkout (or the portal) is opening, or the account
 * is a member already (its own plan, or one that comes with its coaching); { cancelled } when the
 * picker was closed.
 */
export async function bsPaidJoin() {
  const signedIn = !!(window.ShapeAuth?.getCachedState?.()?.user?.id);
  if (!signedIn) { try { window.__bsGoAuth?.('create'); } catch (e) {} return { ok: false }; }
  const api = window.ShapeMembershipApi;
  if (!api || !api.startCheckout) return { ok: false };
  const plan = await bsPickPlan();
  if (!plan) return { ok: false, cancelled: true };
  const r = await api.startCheckout({ plan });
  if (r && (r.ok || r.code === 'already_member')) return { ok: true };
  if (r && r.code === 'payment_past_due') return { ok: await bsOpenBillingPortal() };
  if (r && r.status === 401) { try { window.__bsGoAuth?.('create'); } catch (e) {} return { ok: false }; }
  return { ok: false, code: (r && r.code) || null };
}

/** The lock's one action: Update your card for a past-due membership, Join for anyone else (an ended free week included). */
export function bsPaidGo(lock) {
  return lock === 'pastDue' ? bsOpenBillingPortal().then((ok) => ({ ok })) : bsPaidJoin();
}

/** The feature's own line for a free account, in the reader's language. */
export function bsPaidFeatureLine(tr, feature) {
  switch (feature) {
    case 'radio': return tr('common:paid.feature.radio', { defaultValue: 'Shape Radio comes with membership.' });
    case 'voice': return tr('common:paid.feature.voice', { defaultValue: 'Talking to Nora comes with membership.' });
    case 'actions': return tr('common:paid.feature.actions', { defaultValue: 'Nora making changes for you comes with membership.' });
    case 'readout': return tr('common:paid.feature.readout', { defaultValue: 'Nora’s weekly readout comes with membership.' });
    case 'cookVoice': return tr('common:paid.feature.cookVoice', { defaultValue: 'Nora reading the steps aloud comes with membership.' });
    case 'recipeImport': return tr('common:paid.feature.recipeImport', { defaultValue: 'Reading a recipe from text or a photo comes with membership.' });
    case 'draft': return tr('common:paid.feature.draft', { defaultValue: 'A program drafted by Nora comes with membership.' });
    case 'store': return tr('common:paid.feature.store', { defaultValue: 'Redeeming points in the Store comes with membership.' });
    case 'leaderboard': return tr('common:paid.feature.leaderboard', { defaultValue: 'See your exact rank and the full board with membership.' });
    default: return tr('common:paid.feature.any', { defaultValue: 'This comes with membership.' });
  }
}

/** One sentence for a place with no room for the card (Cook Mode's note, a status line). */
export function bsPaidSentence(tr, lock, feature) {
  if (lock === 'pastDue') return tr('common:paid.pastDue', { defaultValue: 'Your payment didn’t go through. Update your card to get Shape Radio and Nora back.' });
  if (lock === 'noraEnded') return bsNoraEndedLine(tr);
  return `${bsPaidFeatureLine(tr, feature)} ${tr('common:paid.freeBody', { price: BS_MEMBERSHIP_PRICE, defaultValue: '{price} a month adds Nora, Shape Radio and the AI helpers.' })}`;
}

/** The ended free week's line. */
export function bsNoraEndedLine(tr) {
  return tr('common:paid.noraEnded', { defaultValue: 'Your free week with Nora has ended. Join to keep her.' });
}

/** What every account gets free (community channels among them, never a membership perk). */
export function bsFreeWithAccountLine(tr) {
  return tr('common:paid.freeWithAccount', { defaultValue: 'Free with your account: training, nutrition, coaches, messaging and community channels.' });
}

/** The lock's button words. */
export function bsPaidActionLabel(tr, lock) {
  return lock === 'pastDue'
    ? tr('common:paid.updateCard', { defaultValue: 'Update your card →' })
    : tr('onboarding:paywall.join', { price: BS_MEMBERSHIP_PRICE, defaultValue: 'Join · {price}/mo →' });
}

// The padlock: a theme-tinted glyph, never a coloured emoji.
export function BSLockGlyph({ size = 12 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', display: 'block' }}>
      <rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  );
}

// The colours on either ground: the theme's paper, or a fixed dark one (the Radio page's stage,
// the Home radio console, Nora's voice room), which never follows the paper.
function bsLockInk(t, tone) {
  if (tone === 'dark') {
    return {
      ink: '#f4ede0', ink70: 'rgba(244,237,224,0.72)', hair: 'rgba(244,237,224,0.18)',
      accent: '#34d6c5', warn: '#e3a544', btnBg: '#f4ede0', btnInk: '#0c1413',
    };
  }
  return {
    ink: t.INK, ink70: t.INK70, hair: t.HAIR || t.RULE,
    accent: t.isLight ? '#0a8f87' : '#34d6c5', warn: t.AMBER || '#c8881a', btnBg: t.INK, btnInk: t.PAPER,
  };
}

/** The action, with its own busy and failed states (toasts show nothing in this app). */
function useBSPaidAction(lock) {
  const [state, setState] = React.useState('idle'); // idle | busy | failed | inProgress | age
  const alive = React.useRef(true);
  React.useEffect(() => () => { alive.current = false; }, []);
  const go = async (e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    if (state === 'busy') return;
    setState('busy');
    let r = null;
    try { r = await bsPaidGo(lock); } catch (err) { r = null; }
    if (!alive.current) return;
    setState(r && (r.ok || r.cancelled) ? 'idle' : r && r.code === 'checkout_in_progress' ? 'inProgress' : r && r.code === 'age_restricted' ? 'age' : 'failed');
  };
  return { state, go };
}

// ⚠ THE SERVER'S WORDS ARE ENGLISH (client-onboarding review, L4): a refusal the checkout names is
// said in the member's language; anything else is the translated "didn't open".
function bsPaidActionNote(tr, state) {
  if (state === 'inProgress') return tr('onboarding:paywall.err.inProgress', { defaultValue: 'Checkout is already opening. Try again in a moment.' });
  if (state === 'age') return tr('onboarding:login.err.under18', { defaultValue: 'You must be 18 or older to use Shape.' });
  if (state === 'failed') return tr('common:paid.failed', { defaultValue: 'That didn’t open. Try again.' });
  return null;
}

/**
 * The lock itself. `lock` 'free' | 'pastDue' (null draws nothing). `feature` names what is locked
 * (radio, voice, actions, readout, cookVoice, recipeImport, draft, store, leaderboard) for a free account's
 * line. `compact` is one line and a button, for a row or a sheet's head; the default is the
 * instrument plate (a directive with one action). `tone: 'dark'` sits on a fixed dark ground.
 */
export function BSPaidLock({ lock, feature, compact = false, tone, style }) {
  const useBS = window.useBS;
  const t = useBS ? useBS() : null;
  const tr = useShapeTr();
  const { state, go } = useBSPaidAction(lock);
  if (!lock || !t) return null;
  const c = bsLockInk(t, tone);
  const pastDue = lock === 'pastDue';
  const accent = pastDue ? c.warn : c.accent;
  const eyebrow = pastDue
    ? tr('common:paid.eyebrowPastDue', { defaultValue: 'Payment didn’t go through' })
    : tr('common:paid.eyebrow', { price: BS_MEMBERSHIP_PRICE, defaultValue: 'Members · {price}/mo' });
  const label = state === 'busy' ? tr('common:paid.opening', { defaultValue: 'Opening…' }) : bsPaidActionLabel(tr, lock);
  const note = bsPaidActionNote(tr, state);
  const failed = note
    ? <div role="alert" style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c.warn }}>{note}</div>
    : null;
  const button = (
    <button type="button" data-bs-paid-action={lock} onClick={go} disabled={state === 'busy'} aria-busy={state === 'busy'}
      style={{ flex: 'none', minHeight: 44, padding: '0 16px', border: 0, borderRadius: 4, background: c.btnBg, color: c.btnInk, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: state === 'busy' ? 'wait' : 'pointer', opacity: state === 'busy' ? 0.7 : 1, whiteSpace: 'nowrap' }}>
      {label}
    </button>
  );
  const head = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: accent, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
      <BSLockGlyph size={11} /><span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{eyebrow}</span>
    </div>
  );
  const body = pastDue
    ? tr('common:paid.pastDue', { defaultValue: 'Your payment didn’t go through. Update your card to get Shape Radio and Nora back.' })
    : lock === 'noraEnded' ? bsNoraEndedLine(tr)
      : bsPaidFeatureLine(tr, feature);
  const sub = pastDue ? null : tr('common:paid.freeBody', { price: BS_MEMBERSHIP_PRICE, defaultValue: '{price} a month adds Nora, Shape Radio and the AI helpers.' });

  if (compact) {
    return (
      <div data-bs-paid-lock={lock} data-bs-paid-feature={feature || ''} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0 10px 12px', borderLeft: `3px solid ${accent}`, ...style }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {head}
          <div style={{ marginTop: 3, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.4, color: c.ink }}>{body}</div>
          {failed}
        </div>
        {button}
      </div>
    );
  }
  const Plate = tone === 'dark' ? null : window.BSPlate;
  const inner = (
    <>
      {head}
      <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, lineHeight: 1.3, letterSpacing: '-0.01em', color: c.ink }}>{body}</div>
      {sub ? <div style={{ marginTop: 4, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.45, color: c.ink70 }}>{sub}</div> : null}
      <div style={{ marginTop: 12, display: 'flex' }}>{button}</div>
      {failed}
    </>
  );
  return (
    <div data-bs-paid-lock={lock} data-bs-paid-feature={feature || ''} style={style}>
      {Plate
        ? <Plate c={accent} pad="13px 16px 14px 18px" bracket>{inner}</Plate>
        : <div style={{ position: 'relative', padding: '13px 16px 14px 18px', borderRadius: 6, border: `1px solid ${c.hair}`, background: 'rgba(244,237,224,0.04)' }}>
            <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: accent, borderRadius: '6px 0 0 6px' }} />
            {inner}
          </div>}
    </div>
  );
}

function bsLocalDayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const BS_PAST_DUE_SEEN = 'shape.pastDueSeen';

/**
 * Home's past-due notice: one row under the score line (Home adds no plates), put away for the
 * day by its ×. Only a past-due membership draws it; the Settings plan card says the same.
 */
export function BSPastDueNotice() {
  const useBS = window.useBS;
  const t = useBS ? useBS() : null;
  const tr = useShapeTr();
  const lock = useBSPaidLock();
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const day = bsLocalDayKey();
  const [stamp, setStamp] = React.useState(() => { try { return localStorage.getItem(BS_PAST_DUE_SEEN); } catch (e) { return null; } });
  const { state, go } = useBSPaidAction('pastDue');
  if (!t || !bsPastDueNoticeShown({ pastDue: lock === 'pastDue', uid, day, stamp })) return null;
  const warn = t.AMBER || '#c8881a';
  const hide = () => {
    const s = bsPastDueStamp(uid, day);
    try { localStorage.setItem(BS_PAST_DUE_SEEN, s); } catch (e) {}
    setStamp(s);
  };
  return (
    <div data-bs-past-due-notice="" role="status" style={{ margin: `8px ${t.padX}px 4px`, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 12px', borderLeft: `3px solid ${warn}`, borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
      <span style={{ color: warn }}><BSLockGlyph size={13} /></span>
      <div style={{ flex: 1, minWidth: 0, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.4, color: t.INK }}>
        {tr('common:paid.pastDue', { defaultValue: 'Your payment didn’t go through. Update your card to get Shape Radio and Nora back.' })}
        {bsPaidActionNote(tr, state) ? <span role="alert" style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: warn }}>{bsPaidActionNote(tr, state)}</span> : null}
      </div>
      <button type="button" data-bs-paid-action="pastDue" onClick={go} disabled={state === 'busy'}
        style={{ flex: 'none', minHeight: 44, padding: '0 12px', border: 0, borderRadius: 4, background: t.INK, color: t.PAPER, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer', opacity: state === 'busy' ? 0.7 : 1, whiteSpace: 'nowrap' }}>
        {state === 'busy' ? tr('common:paid.opening', { defaultValue: 'Opening…' }) : tr('common:paid.updateCard', { defaultValue: 'Update your card →' })}
      </button>
      <button type="button" onClick={hide} aria-label={tr('common:paid.hideToday', { defaultValue: 'Hide until tomorrow' })}
        style={{ flex: 'none', width: 44, height: 44, border: 0, background: 'transparent', color: t.INK50, fontSize: 18, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>×</button>
    </div>
  );
}

/**
 * The locked lock as a sheet, for a control whose tap has nowhere to open the card in place (a
 * Listen under a reply, a Nora card's Confirm). Portals into the phone surface.
 */
export function BSPaidLockSheet({ lock, feature, onClose }) {
  const useBS = window.useBS;
  const t = useBS ? useBS() : null;
  const tr = useShapeTr();
  if (!lock || !t) return null;
  const sheet = (
    <div role="dialog" aria-modal="true" aria-label={bsPaidFeatureLine(tr, feature)} onClick={onClose}
      style={{ position: 'absolute', inset: 0, zIndex: 400, display: 'flex', alignItems: 'flex-end', background: 'rgba(3,5,11,0.5)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: `18px ${t.padX}px max(18px, calc(12px + env(safe-area-inset-bottom, 0px)))`, background: t.PAPER, borderTop: `1px solid ${t.RULE}`, borderRadius: '14px 14px 0 0' }}>
        <BSPaidLock lock={lock} feature={feature} />
        <button type="button" onClick={onClose} style={{ width: '100%', minHeight: 44, marginTop: 10, border: `1px solid ${t.RULE}`, borderRadius: 4, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {tr('common:paid.notNow', { defaultValue: 'Not now' })}
        </button>
      </div>
    </div>
  );
  const host = typeof document !== 'undefined' ? document.getElementById('bs-phone-surface') : null;
  return host ? createPortal(sheet, host) : sheet;
}

/** "Sign in to send messages": the composer for a session with no account (messaging is free). */
export function BSSignInToSend({ t, pinned = false, square = false, arrow = false }) {
  const tr = useShapeTr();
  const go = typeof window !== 'undefined' && window.__bsGoAuth ? () => window.__bsGoAuth('signin') : null;
  const style = {
    width: '100%', boxSizing: 'border-box', minHeight: 44,
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    background: pinned ? t.SURFACE : t.PAPER, border: `1px solid ${t.SURFACE_BORDER}`,
    borderRadius: square ? 0 : 20, padding: '11px 15px', cursor: go ? 'pointer' : 'default',
    fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: t.INK50,
  };
  const words = tr('feed:composer.signInToSend', { defaultValue: 'Sign in to send messages' });
  return go
    ? <button type="button" onClick={go} style={style}>{words}{arrow ? <span aria-hidden="true"> →</span> : null}</button>
    : <div style={style}>{words}</div>;
}

// ── Nora's free week (owner, 2026-11-10) ───────────────────────────────────────────────────────

/** "N days left with Nora", or null outside an active free week. */
export function bsNoraDaysLine(tr, noraPreview, now = Date.now()) {
  const days = bsNoraDaysLeft(noraPreview, now);
  if (days == null) return null;
  return tr('common:paid.noraWeek.sheetLine', { days, defaultValue: '{days, plural, one {# day left with Nora} other {# days left with Nora}}' });
}

const BS_NORA_WEEK_SEEN = 'shape.noraWeekSeen';

/**
 * The free week's one-time notice, on Home: what she can do now and the days left, until its × puts
 * it away for this week (once per account). A row like the past-due notice (Home adds no plates).
 */
export function BSNoraPreviewNotice() {
  const useBS = window.useBS;
  const t = useBS ? useBS() : null;
  const tr = useShapeTr();
  const preview = useBSNoraPreview();
  const lock = useBSNoraLock();
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const [stamp, setStamp] = React.useState(() => { try { return localStorage.getItem(BS_NORA_WEEK_SEEN); } catch (e) { return null; } });
  if (!t || lock || !bsNoraPreviewNoticeShown({ noraPreview: preview, uid, stamp })) return null;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const days = bsNoraDaysLeft(preview);
  const hide = () => {
    const s = bsNoraPreviewStamp(uid, preview);
    try { localStorage.setItem(BS_NORA_WEEK_SEEN, s); } catch (e) {}
    setStamp(s);
  };
  return (
    <div data-bs-nora-week-notice="" role="status" style={{ margin: `8px ${t.padX}px 4px`, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0 8px 12px', borderLeft: `3px solid ${teal}`, borderBottom: `1px solid ${t.HAIR || t.RULE}` }}>
      <span aria-hidden="true" style={{ color: teal, fontSize: 14, lineHeight: 1 }}>{'✦'}</span>
      <div style={{ flex: 1, minWidth: 0, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.4, color: t.INK }}>
        {tr('common:paid.noraWeek.unlocked', { defaultValue: 'You’ve unlocked a free week of Nora as your assistant — she can now look up your plan, log for you and talk by voice.' })}
        {days != null ? <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: teal }}>{tr('common:paid.noraWeek.daysLeft', { days, defaultValue: '{days, plural, one {# day left} other {# days left}}' })}</span> : null}
      </div>
      <button type="button" onClick={hide} aria-label={tr('common:paid.noraWeek.dismiss', { defaultValue: 'Got it' })}
        style={{ flex: 'none', width: 44, height: 44, border: 0, background: 'transparent', color: t.INK50, fontSize: 18, lineHeight: 1, cursor: 'pointer', display: 'grid', placeItems: 'center' }}>×</button>
    </div>
  );
}

// ── The plan picker (owner, 2026-11-10: $5 a month or $48 a year) ───────────────────────────────

/** "$48" from 4800 cents: whole dollars stay whole. Shape charges USD in every locale. */
export function bsPlanMoney(cents) {
  const n = Number(cents);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n % 100 === 0 ? `$${n / 100}` : `$${(n / 100).toFixed(2)}`;
}
/** What the annual plan saves over twelve monthly payments, in whole percent; null when nothing. */
export function bsPlanSavingPct(plans) {
  const m = plans && plans.monthly && Number(plans.monthly.priceCents);
  const a = plans && plans.annual && Number(plans.annual.priceCents);
  if (!(m > 0) || !(a > 0)) return null;
  const pct = Math.round((1 - a / (m * 12)) * 100);
  return pct > 0 ? pct : null;
}
/** "$5 / month" or "$48 / year" for a price and an interval ('month' | 'year'). */
export function bsPlanPriceLabel(tr, cents, interval) {
  const price = bsPlanMoney(cents);
  if (!price) return null;
  return interval === 'year'
    ? tr('common:paid.plans.perYear', { price, defaultValue: '{price} / year' })
    : tr('common:paid.plans.perMonth', { price, defaultValue: '{price} / month' });
}

/**
 * The picker's host, mounted once by the shell inside the phone: bsPickPlan() asks it, it reads the
 * plans (ShapeMembershipApi.plans) and, when an annual plan is configured, shows Monthly and Annual
 * in a sheet portaled into #bs-phone-surface. With monthly alone it answers 'monthly' at once.
 */
export function BSPlanPickerHost() {
  const useBS = window.useBS;
  const t = useBS ? useBS() : null;
  const tr = useShapeTr();
  const [ask, setAsk] = React.useState(null); // { resolve, plans }
  React.useEffect(() => {
    const host = (resolve) => {
      Promise.resolve(window.ShapeMembershipApi?.plans?.()).catch(() => null).then((plans) => {
        if (!plans || !plans.annual || !(Number(plans.annual.priceCents) > 0)) { resolve('monthly'); return; }
        setAsk({ resolve, plans });
      });
    };
    window.__bsPlanPicker = host;
    return () => { if (window.__bsPlanPicker === host) window.__bsPlanPicker = null; };
  }, []);
  if (!ask || !t) return null;
  const answer = (plan) => { const r = ask.resolve; setAsk(null); r(plan); };
  const { plans } = ask;
  const pct = bsPlanSavingPct(plans);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const option = (key, name, price, note) => (
    <button key={key} type="button" data-bs-plan={key} onClick={() => answer(key)}
      style={{ width: '100%', minHeight: 60, display: 'flex', alignItems: 'center', gap: 12, marginTop: 8, padding: '10px 14px', border: `1px solid ${key === 'annual' ? teal : t.RULE}`, borderRadius: 8, background: key === 'annual' ? `${teal}14` : 'transparent', color: t.INK, cursor: 'pointer', textAlign: 'left' }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, letterSpacing: '-0.01em' }}>{name}</span>
        <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>{price}</span>
      </span>
      {note ? <span style={{ flex: 'none', padding: '4px 8px', borderRadius: 999, background: t.INK, color: t.PAPER, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{note}</span> : null}
      <span aria-hidden="true" style={{ flex: 'none', color: t.INK50 }}>→</span>
    </button>
  );
  const sheet = (
    <div role="dialog" aria-modal="true" aria-label={tr('common:paid.plans.title', { defaultValue: 'Pick your plan' })} onClick={() => answer(null)}
      style={{ position: 'absolute', inset: 0, zIndex: 420, display: 'flex', alignItems: 'flex-end', background: 'rgba(3,5,11,0.5)' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', padding: `18px ${t.padX}px max(18px, calc(12px + env(safe-area-inset-bottom, 0px)))`, background: t.PAPER, borderTop: `1px solid ${t.RULE}`, borderRadius: '14px 14px 0 0' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>{tr('common:paid.plans.eyebrow', { defaultValue: 'Shape membership' })}</div>
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK }}>{tr('common:paid.plans.title', { defaultValue: 'Pick your plan' })}<span aria-hidden="true" style={{ color: teal }}>.</span></div>
        <div style={{ marginTop: 4, fontFamily: t.BODY, fontSize: 13, lineHeight: 1.45, color: t.INK70 }}>{tr('common:paid.plans.body', { defaultValue: 'Nora, Shape Radio and the AI helpers. Cancel any time in Settings.' })}</div>
        {/* What stays free either way (owner, 2026-11-10: community channels are free, never a perk). */}
        <div data-bs-plans-free="" style={{ marginTop: 4, fontFamily: t.BODY, fontSize: 12, lineHeight: 1.45, color: t.INK50 }}>{bsFreeWithAccountLine(tr)}</div>
        {option('monthly', tr('common:paid.plans.monthly', { defaultValue: 'Monthly' }), bsPlanPriceLabel(tr, plans.monthly && plans.monthly.priceCents, 'month'), null)}
        {option('annual', tr('common:paid.plans.annual', { defaultValue: 'Annual' }), bsPlanPriceLabel(tr, plans.annual.priceCents, 'year'), pct ? tr('common:paid.plans.save', { pct, defaultValue: 'Save {pct}%' }) : null)}
        <button type="button" onClick={() => answer(null)} style={{ width: '100%', minHeight: 44, marginTop: 10, border: 0, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {tr('common:paid.notNow', { defaultValue: 'Not now' })}
        </button>
      </div>
    </div>
  );
  const hostEl = typeof document !== 'undefined' ? document.getElementById('bs-phone-surface') : null;
  return hostEl ? createPortal(sheet, hostEl) : sheet;
}
