import React from 'react';
import { useTr } from '../i18n/index.js';
import { FRScreen, FRHeader, FRPanel, FRField, FRError, frButton, frInput, frLink } from './BSFirstRunKit.jsx';

// Every call to Shape's server goes through the backend's ShapeApi.fetch: the API base in
// front and the live sign-in token. A root-relative '/api/…' fetch reaches nothing in the
// installed app (client-onboarding review H2, 2026-10-14; tests/app-api-base.test.mjs).
const bsApi = { fetch: (path, init) => (window.ShapeApi ? window.ShapeApi.fetch(path, init) : fetch(path, init)) };

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

  // The first-run look (BSFirstRun.jsx, owner 2026-11-13: every screen before the app matches the
  // welcome): fixed-dark like the other launch surfaces, the centred mark and headline, the field and
  // its buttons in the glass panel. Sign out is the way out on every state of this screen.
  const signOut = <button type="button" onClick={onLogout} style={frLink({ textAlign: 'center' })}>{tr('dob.signout', { defaultValue: 'Sign out' })}</button>;

  async function submit(e) {
    if (e && e.preventDefault) e.preventDefault();
    if (busy || !dob) return;
    setBusy(true);
    setErr('');
    try {
      const token = window.ShapeAuth?.getCachedState?.()?.session?.access_token;
      const headers = { 'Content-Type': 'application/json' };
      if (token) headers.Authorization = `Bearer ${token}`;
      const res = await bsApi.fetch('/api/me/date-of-birth', {
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

  // A known minor (/api/me/membership's ageRestricted), shown ahead of the paywall, whose
  // membership offer would refuse them: Shape is for adults 18 and over.
  if (blocked === 'age_restricted') {
    return <FRScreen dataAttr={{ 'data-fr-dob': 'minor' }} header={<FRHeader pre={tr('dob.errUnder18', { defaultValue: 'Shape is for adults 18 and over.' })} size={30} />} footer={signOut} />;
  }

  if (blocked) {
    return (
      <FRScreen dataAttr={{ 'data-fr-dob': 'blocked' }} footer={signOut}
        header={<FRHeader pre={tr('dob.blockedTitle', { defaultValue: 'We can’t finish this here.' })} size={30}
          sub={tr('dob.blockedBody', { defaultValue: 'Your account setup didn’t complete, so there’s nothing to save this to yet. Contact support and we’ll put it right.' })} />} />
    );
  }

  return (
    <FRScreen dataAttr={{ 'data-fr-dob': 'ask' }} footer={signOut}
      header={<FRHeader pre={tr('dob.title', { defaultValue: 'Confirm your date of birth.' })} size={30}
        sub={tr('dob.body', { defaultValue: 'Shape is for adults 18 and over, and every account needs a date of birth on file. You’ll only be asked once — the date can’t be changed afterwards, so check it before you save.' })} />}>
      <FRPanel>
        <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <FRField label={tr('dob.label', { defaultValue: 'Date of birth' })} note={tr('dob.subtitle', { defaultValue: 'Adults 18 and over' })}>
            <input
              id="bs-dob"
              className="bs-lf-input"
              type="date"
              value={dob}
              required
              onChange={(ev) => { setDob(ev.target.value); if (err) setErr(''); }}
              style={frInput()}
            />
          </FRField>
          {/* role="alert" so the refusal is announced, not just recoloured — this
              is the only feedback a member gets when the server rejects a date. */}
          <FRError text={err} />
          <button
            type="submit"
            disabled={busy || !dob}
            className="bs-wire-enter"
            style={frButton('primary', { opacity: (busy || !dob) ? 0.45 : 1, cursor: (busy || !dob) ? 'default' : 'pointer' })}
          >
            {busy ? tr('dob.saving', { defaultValue: 'Saving…' }) : tr('dob.cta', { defaultValue: 'Save and continue' })}
          </button>
        </form>
      </FRPanel>
      {/* An escape hatch is mandatory, not a courtesy: this screen is the only
          thing between the member and the app, so without it a member who
          cannot answer (a shared device, the wrong account) is stranded with
          no way out. It is the footer, under the panel. */}
    </FRScreen>
  );
}
