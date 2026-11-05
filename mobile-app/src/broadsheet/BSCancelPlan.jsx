import React from 'react';
import { createPortal } from 'react-dom';
// ─── CANCEL A COACH PLAN (Settings → Billing) ────────────────────────────────
// Owner, 2026-11-05: "3 - user types response". A member cancels a coach plan in Shape's own step,
// not in Stripe's billing portal (the portal on a coach's account no longer offers its own cancel):
// one optional question, "Why are you leaving?", answered in the member's own words, then the plan is
// cancelled at its period's end through POST /api/stripe/cancel-plan. The member keeps it until then.
//
// ⚠ THE QUESTION NEVER BLOCKS THE CANCELLATION: an empty answer cancels, and a failed save of the words
// still cancels (the route sends them to Stripe too). ⚠ ONLY THAT COACH AND SHAPE READ THE WORDS, and
// the sheet says so.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP (BSIntegrationsPage.jsx explains why):
// this file is a static import of the client module, so it evaluates before that module's body runs.
// It never imports the client back.

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

const api = (path, init) => (window.ShapeApi ? window.ShapeApi.fetch(path, init) : fetch(path, init));
export const BS_CANCEL_REASON_MAX = 500;

function intlLocale() {
  try { return window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined; } catch (e) { return undefined; }
}
export function bsCancelDate(v) {
  if (!v) return null;
  try { return new Date(String(v)).toLocaleDateString(intlLocale(), { month: 'long', day: 'numeric' }); } catch (e) { return null; }
}

/**
 * The member's coach plans as the cancel step lists them (GET /api/stripe/cancel-plan): each with
 * whether it already ends. [] signed out, or while it loads, or when it can't be read (the billing
 * rows then simply don't offer the step). `reload` bumps to read again.
 */
export function useBSCoachPlansToCancel(reload = 0) {
  const [plans, setPlans] = React.useState([]);
  React.useEffect(() => {
    let on = true;
    if (!window.ShapeAuth?.getCachedState?.()?.user?.id) { setPlans([]); return undefined; }
    api('/api/stripe/cancel-plan', { credentials: 'same-origin', cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (on && d && Array.isArray(d.plans)) setPlans(d.plans); })
      .catch(() => {});
    return () => { on = false; };
  }, [reload]);
  return plans;
}

/** The sheet: the question, Keep my plan, and Cancel plan. `onDone(endsAt)` after it is cancelled. */
export function BSCancelPlanSheet({ plan, onClose, onDone }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState(null);
  // undefined until it is cancelled; then the end date (null when none is known: the sentence says "the end of this billing period").
  const [done, setDone] = React.useState(undefined);
  // The coach's listing name. Without one, each sentence has its own no-name form: a fallback noun
  // ("your coach") would take the wrong case in German, Russian and Ukrainian.
  const who = String(plan.name || '').trim() || null;
  const until = bsCancelDate(plan.renewsAt);
  React.useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose && onClose(); } };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [busy, onClose]);
  const submit = async () => {
    if (busy) return;
    setBusy(true); setErr(null);
    try {
      const res = await api('/api/stripe/cancel-plan', {
        method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subscriptionId: plan.subscriptionId, reason: reason.trim() || undefined }),
      });
      const d = await res.json().catch(() => null);
      if (res.ok && d && d.ok) { setDone(d.endsAt || plan.renewsAt || null); setBusy(false); onDone && onDone(d.endsAt || plan.renewsAt || null); return; }
      setErr(d && d.reason === 'coach_disconnected'
        ? tr('settings:billing.cancel.disconnected', { defaultValue: "This coach has disconnected their payments from Shape, so this plan can't be cancelled here. Contact Shape support and we'll sort it out with you." })
        : tr('settings:billing.cancel.failed', { defaultValue: "Couldn't cancel just now. Nothing changed; try again." }));
    } catch (e) {
      setErr(tr('settings:billing.cancel.failed', { defaultValue: "Couldn't cancel just now. Nothing changed; try again." }));
    }
    setBusy(false);
  };
  const accent = t.RUST || '#c0533b';
  const mono = { fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: accent };
  const button = (solid) => ({ flex: solid ? 1 : '0 0 auto', minHeight: 48, padding: '0 22px', borderRadius: 999, border: solid ? 0 : `1px solid ${t.RULE}`, background: solid ? accent : 'transparent', color: solid ? t.PAPER : t.INK70, fontFamily: t.BODY, fontSize: 14, fontWeight: solid ? 700 : 600, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.7 : 1 });
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body;
  return createPortal(
    <div onClick={() => { if (!busy) onClose && onClose(); }} data-bs-cancel-plan="" style={{ position: 'absolute', inset: 0, zIndex: 4200, background: 'rgba(8,7,6,0.6)', display: 'flex', alignItems: 'flex-end' }}>
      <div role="dialog" aria-modal="true" aria-labelledby="bs-cancel-plan-title" onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, borderLeft: `3px solid ${accent}`, padding: `20px ${t.padX || 18}px calc(20px + env(safe-area-inset-bottom, 0px))` }}>
        <div style={mono}>{tr('settings:billing.cancel.eyebrow', { defaultValue: 'Cancel plan' })}</div>
        {done !== undefined ? (
          <React.Fragment>
            <div id="bs-cancel-plan-title" style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', margin: '5px 0 0' }}>{tr('settings:billing.cancel.doneTitle', { defaultValue: 'Plan cancelled' })}</div>
            <div style={{ marginTop: 11, fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.5 }}>
              {bsCancelDate(done)
                ? (who
                  ? tr('settings:billing.cancel.done', { defaultValue: 'Your plan with {coach} ends on {date}. It won\'t renew.', coach: who, date: bsCancelDate(done) })
                  : tr('settings:billing.cancel.doneNoName', { defaultValue: 'Your coaching plan ends on {date}. It won\'t renew.', date: bsCancelDate(done) }))
                : (who
                  ? tr('settings:billing.cancel.doneNoDate', { defaultValue: 'Your plan with {coach} ends at the end of this billing period. It won\'t renew.', coach: who })
                  : tr('settings:billing.cancel.doneNoNameNoDate', { defaultValue: 'Your coaching plan ends at the end of this billing period. It won\'t renew.' }))}
            </div>
            <div style={{ display: 'flex', marginTop: 16 }}>
              <button type="button" onClick={onClose} style={button(true)}>{tr('settings:billing.cancel.close', { defaultValue: 'Done' })}</button>
            </div>
          </React.Fragment>
        ) : (
          <React.Fragment>
            <div id="bs-cancel-plan-title" style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', margin: '5px 0 0' }}>{who
              ? tr('settings:billing.cancel.title', { defaultValue: 'Cancel your plan with {coach}?', coach: who })
              : tr('settings:billing.cancel.titleNoName', { defaultValue: 'Cancel your coaching plan?' })}</div>
            <div style={{ marginTop: 11, fontFamily: t.BODY, fontSize: 13, color: t.INK70, lineHeight: 1.5 }}>
              {until
                ? tr('settings:billing.cancel.until', { defaultValue: 'You keep it until {date}. It won\'t renew after that.', date: until })
                : tr('settings:billing.cancel.untilPeriod', { defaultValue: 'You keep it until the end of this billing period. It won\'t renew after that.' })}
            </div>
            <label htmlFor="bs-cancel-plan-reason" style={{ display: 'block', marginTop: 14, fontFamily: t.BODY, fontSize: 13, fontWeight: 600 }}>{tr('settings:billing.cancel.question', { defaultValue: 'Why are you leaving? (optional)' })}</label>
            <textarea id="bs-cancel-plan-reason" value={reason} maxLength={BS_CANCEL_REASON_MAX} rows={4} disabled={busy}
              onChange={(e) => setReason(e.target.value)} placeholder={tr('settings:billing.cancel.placeholder', { defaultValue: 'In your own words' })}
              style={{ width: '100%', boxSizing: 'border-box', marginTop: 8, padding: '12px 14px', borderRadius: 12, border: `1px solid ${t.HAIR}`, background: `${t.INK}09`, color: t.INK, fontFamily: t.BODY, fontSize: 16, lineHeight: 1.45, resize: 'none', outline: 'none' }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, marginTop: 4, fontFamily: t.BODY, fontSize: 11.5, color: t.INK50 }}>
              <span>{who
                ? tr('settings:billing.cancel.private', { defaultValue: 'Only {coach} and Shape will read this.', coach: who })
                : tr('settings:billing.cancel.privateNoName', { defaultValue: 'Only your coach and Shape will read this.' })}</span>
              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{reason.length}/{BS_CANCEL_REASON_MAX}</span>
            </div>
            {err && <div role="alert" style={{ marginTop: 10, fontFamily: t.BODY, fontSize: 13, color: accent, lineHeight: 1.45 }}>{err}</div>}
            <div style={{ display: 'flex', gap: 9, marginTop: 16 }}>
              <button type="button" onClick={onClose} disabled={busy} style={button(false)}>{tr('settings:billing.cancel.keep', { defaultValue: 'Keep my plan' })}</button>
              <button type="button" onClick={submit} disabled={busy} style={button(true)}>{busy ? tr('settings:billing.cancel.working', { defaultValue: 'Cancelling…' }) : tr('settings:billing.cancel.confirm', { defaultValue: 'Cancel plan' })}</button>
            </div>
          </React.Fragment>
        )}
      </div>
    </div>,
    surface
  );
}
