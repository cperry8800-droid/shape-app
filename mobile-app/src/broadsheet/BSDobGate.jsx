import React from 'react';
import { useTr } from '../i18n/index.js';

// ═══════════════════════════════════════════════════════════
// DATE OF BIRTH — the COLLECT half of the 18+ ruling
// ═══════════════════════════════════════════════════════════
// The owner ruled (2026-08-21) that EVERY account supplies a birthdate, which
// ends the grandfather clause in mustRefuseForAge(): today an account created
// before ADULT_PROOF_REQUIRED_FROM is admitted on no proof at all. Removing that
// clause without first giving those members a way to comply would 403 them
// across all seven gated prefixes INCLUDING the screens they would need to fix
// it. So: collect first, enforce second — the same ordering the profiles PII
// lockdown used.
//
// ⚠ THIS BLOCKS ONLY ON AN EXPLICIT `needed: true`. Every other answer — a
// failed request, a parse fault, an offline device, a shape we do not recognise
// — falls through to the app. That is deliberate and it is the opposite of how
// the GATE behaves: the gate is the authority on access and fails closed, while
// this screen only decides whether to ASK. A prompt that blocked on its own
// uncertainty would lock members out of a product they are entitled to, over a
// question we could not even establish needed asking.
//
// ⚠ NO CLIENT-SIDE AGE ARITHMETIC HERE, ON PURPOSE. There are already two
// implementations of the 18+ rule (src/lib/age-derive.mjs and its classic-script
// mirror public/age-derive.js) held together by a shared vector table plus a
// fuzz sweep in tests/age-derive-mirror.test.mjs. A third copy inside a React
// component would be a third thing to keep in step, and the failure it would
// introduce — a client that disagrees with the server about one person's
// birthday — is exactly what that mirror test exists to prevent. The server
// decides; this screen renders what it says.
//
// The `blocked` case is NOT a validation failure: it means the account has no
// profiles row at all, so there is nothing for POST to write to and no form we
// could show that would succeed. Verified live 2026-08-21 — 2 of 4 confirmed,
// signed-in accounts are in that state.
// ⚠ THE ROUTE'S `error` STRING IS ENGLISH, AND THIS SCREEN IS NOT. Every answer
// carries a human sentence, so rendering `d.error` never showed a bare code — but
// it did show English to a member reading the app in one of the other twelve
// locales, on the one screen standing between them and the product. The `code` is
// the stable, translatable half of the contract; the sentence is the fallback for
// a shape we do not recognise.
//
// Mapped rather than blanket-replaced with the generic line: `already_set` and
// `no_profile` both mean "contact support", and telling those members to "try
// again" would loop them against a form that cannot succeed.
const DOB_ERROR_KEYS = {
  invalid_date: ['dob.errInvalidDate', 'Enter a real date of birth.'],
  under_18: ['dob.errUnder18', 'Shape is for adults 18 and over.'],
  already_set: ['dob.errAlreadySet', 'Your date of birth is already on file and can’t be changed here. Contact support if it’s wrong.'],
  no_profile: ['dob.blockedBody', 'Your account setup didn’t complete, so there’s nothing to save this to yet. Contact support and we’ll put it right.'],
};

function errorCopyFor(tr, d) {
  const hit = d && d.code && DOB_ERROR_KEYS[d.code];
  if (hit) return tr(hit[0], { defaultValue: hit[1] });
  // An unrecognised code — or none at all — falls back to the generic line rather
  // than to `d.error`, so a future code cannot leak English onto this screen.
  return tr('dob.genericError', { defaultValue: 'Could not save your date of birth. Try again.' });
}

export default function BSDobGate({ blocked, onSaved, onLogout }) {
  const { tr } = useTr('onboarding');
  const [dob, setDob] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState('');

  // The launch surfaces (wire beat, language picker, paywall) are fixed-dark and
  // never take the paper theme, so this one matches them rather than useBS().
  const INKF = '#f2ede4', INKF70 = 'rgba(242,237,228,0.7)', INKF50 = 'rgba(242,237,228,0.55)', ACCF = '#34d6c5';
  const mono = `'JetBrains Mono', 'Cascadia Code', Consolas, monospace`;
  const serif = `'Newsreader', Georgia, serif`;
  const shell = { position: 'absolute', inset: 0, background: 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)', color: INKF, display: 'flex', flexDirection: 'column', padding: '52px 20px 24px', zIndex: 40 };
  const topbar = { fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.24em', textTransform: 'uppercase', color: INKF70, display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: `2px solid ${INKF}`, paddingBottom: 8 };
  const signOutBtn = { marginTop: 14, padding: '10px', border: 0, background: 'transparent', color: INKF50, fontFamily: mono, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' };

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (busy || !dob) return;
    setBusy(true);
    setErr('');
    try {
      const token = window.ShapeAuth?.getCachedState?.()?.session?.access_token;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await fetch('/api/me/date-of-birth', {
        method: 'POST', headers, credentials: 'same-origin', cache: 'no-store',
        body: JSON.stringify({ date_of_birth: dob }),
      });
      const d = await res.json().catch(() => null);
      // ⚠ BOTH CONDITIONS. A 200 carrying `ok` is the only success; the route
      // answers 503 `not_persisted` when it could not confirm the row actually
      // holds the date, and treating that as saved would put the member back in
      // front of the same gate with no idea why.
      if (res.ok && d && d.ok === true) { onSaved && onSaved(); return; }
      setErr(errorCopyFor(tr, d));
    } catch (e2) {
      setErr(tr('dob.genericError', { defaultValue: 'Could not save your date of birth. Try again.' }));
    } finally {
      setBusy(false);
    }
  }

  if (blocked) {
    return (
      <div style={shell}>
        <div style={topbar}>
          <span>Shape Wire</span>
          <span style={{ color: INKF }}>{tr('dob.eyebrow', { defaultValue: 'Account' })}</span>
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', maxWidth: 360, margin: '0 auto' }}>
          <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '14px 0 0' }}>{tr('dob.blockedTitle', { defaultValue: 'We can’t finish this here.' })}</h1>
          <div style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.55, color: INKF70, marginTop: 12 }}>{tr('dob.blockedBody', { defaultValue: 'Your account setup didn’t complete, so there’s nothing to save this to yet. Contact support and we’ll put it right.' })}</div>
          <button onClick={onLogout} style={signOutBtn}>{tr('dob.signout', { defaultValue: 'Sign out' })}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={shell}>
      <div style={topbar}>
        <span>Shape Wire</span>
        <span style={{ color: INKF }}>{tr('dob.required', { defaultValue: 'Required' })}</span>
      </div>
      <form onSubmit={submit} style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center', width: '100%', maxWidth: 360, margin: '0 auto' }}>
        <h1 style={{ fontFamily: serif, fontSize: 27, fontWeight: 600, letterSpacing: '-0.03em', lineHeight: 1.1, margin: '14px 0 0' }}>{tr('dob.title', { defaultValue: 'Confirm your date of birth.' })}</h1>
        <div style={{ fontFamily: mono, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: INKF50, marginTop: 8 }}>{tr('dob.subtitle', { defaultValue: 'Adults 18 and over' })}</div>
        <div style={{ fontFamily: serif, fontSize: 15, lineHeight: 1.55, color: INKF70, marginTop: 14 }}>{tr('dob.body', { defaultValue: 'Shape is for adults 18 and over, and every account needs a date of birth on file. You’ll only be asked once — the date can’t be changed afterwards, so check it before you save.' })}</div>

        <label htmlFor="bs-dob" style={{ fontFamily: mono, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: INKF50, marginTop: 20, display: 'block' }}>{tr('dob.label', { defaultValue: 'Date of birth' })}</label>
        <input
          id="bs-dob"
          type="date"
          value={dob}
          required
          onChange={(ev) => { setDob(ev.target.value); if (err) setErr(''); }}
          style={{ marginTop: 7, width: '100%', padding: '13px 12px', borderRadius: 4, minHeight: 48, background: 'rgba(242,237,228,0.06)', color: INKF, border: '1px solid rgba(242,237,228,0.16)', borderLeft: `3px solid ${dob ? ACCF : 'rgba(242,237,228,0.16)'}`, fontFamily: mono, fontSize: 14, letterSpacing: '0.04em' }}
        />

        {/* role="alert" so the refusal is announced, not just recoloured — this
            is the only feedback a member gets when the server rejects a date. */}
        {err ? (
          <div role="alert" style={{ marginTop: 12, padding: '10px 12px', borderLeft: '3px solid #ff6b5e', background: 'rgba(255,107,94,0.09)', fontFamily: serif, fontSize: 13.5, lineHeight: 1.45, color: INKF }}>{err}</div>
        ) : null}

        <button
          type="submit"
          disabled={busy || !dob}
          className="bs-wire-enter"
          style={{ marginTop: 18, clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)', padding: '14px', border: 0, background: (busy || !dob) ? 'rgba(52,214,197,0.35)' : ACCF, color: '#05080c', fontFamily: mono, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: (busy || !dob) ? 'default' : 'pointer' }}
        >
          {busy ? tr('dob.saving', { defaultValue: 'Saving…' }) : tr('dob.cta', { defaultValue: 'Save and continue' })}
        </button>
        {/* An escape hatch is mandatory, not a courtesy: this screen is the only
            thing between the member and the app, so without it a member who
            cannot answer (a shared device, the wrong account) is stranded with
            no way out. */}
        <button type="button" onClick={onLogout} style={signOutBtn}>{tr('dob.signout', { defaultValue: 'Sign out' })}</button>
      </form>
    </div>
  );
}
