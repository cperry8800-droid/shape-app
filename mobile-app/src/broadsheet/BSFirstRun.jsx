// The first-run look (owner, 2026-11-13, picking "B · Dock": "i like this design"; then "center this on
// screen and logo", "for all of them", "make sure all other pages i missed during account creation match
// this"). Every screen a new person sees before the app opens is drawn from these parts, so they cannot
// drift apart:
//
//   FRScreen  — the launch's fixed-dark ground, a top bar with ← (and, where it belongs, the coach's
//               "Apply to coach" pill) that content scrolls UNDER, never a floating arrow.
//   FRHeader  — the centred 3D mark, a centred headline (ink, then the accent word in teal) and an
//               optional centred sub-line or step line.
//   FRPanel   — the glass panel the fields and buttons sit in, labels left-aligned inside it.
//   FRField / FRButton / FRTabs / FRError / FRIcon — the parts inside.
//
// The launch surfaces stay fixed-dark (they never followed the paper theme: the beat, the telegram and
// the welcome are one launch). Plain parts, no state of their own beyond what a screen hands in.
// The parts are BSFirstRunKit.jsx's; this file holds the screens that need the app's translations.
import React from 'react';
import { useTr } from '../i18n/index.js';
import { FR, FR_HEAD, FR_MONO, FRScreen, FRHeader, FRPanel, FRField, FRError, FRTabs, FRIcon, FRSteps, frButton, frInput, frLink } from './BSFirstRunKit.jsx';

// ── WELCOME ─────────────────────────────────────────────────────────────────
// What a free account gets as five tiles, three over two (Training, Nutrition, Coaches; Community, Music),
// the membership on one line under the buttons. Music carries the line's ✦: Shape Radio is the
// membership's, not the free account's (shapeKnowledge.mjs 'radio'), and the line says so.
// Preview the app (owner, 2026-11-13: "bring back the preview button … so i can see what app would look
// like with example data", "just the same as it was", at the app URL): a quiet third door under Sign in,
// only where the shell hands one in (the app at /m/; the installed apps keep the account-only welcome).
export function BSWelcomeScreen({ price, onCreate, onSignIn, onPreview = null }) {
  const { tr } = useTr('onboarding');
  const tiles = [
    ['train', tr('paywall.feat.training')],
    ['eat', tr('paywall.feat.nutrition')],
    ['coach', tr('paywall.feat.coaches')],
    ['people', tr('fr.welcome.tileCommunity')],
    ['music', tr('fr.welcome.tileMusic'), true],
  ];
  const col = ['1 / span 2', '3 / span 2', '5 / span 2', '2 / span 2', '4 / span 2'];
  return (
    <div data-fr="" data-bs-welcome="" style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', background: FR.bg, color: FR.ink, overflowY: 'auto' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 'max(56px, calc(env(safe-area-inset-top, 0px) + 40px)) 26px 18px' }}>
        <FRHeader flush markSize={100} size={38} pre={tr('fr.welcome.titlePre')} accent={tr('fr.welcome.titleAccent')} sub={tr('fr.welcome.sub')} />
        <div data-bs-welcome-feats="" style={{ marginTop: 20, width: '100%', display: 'grid', gridTemplateColumns: 'repeat(6, minmax(0, 1fr))', gap: 8 }}>
          {tiles.map(([k, label, member], i) => (
            <div key={k} data-fr-tile={k} style={{ position: 'relative', gridColumn: col[i], minWidth: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 7, padding: '12px 4px 10px', borderRadius: 14, border: `1px solid ${FR.line}`, background: FR.tealSoft }}>
              {member ? <span aria-hidden="true" style={{ position: 'absolute', top: 6, right: 9, color: FR.teal, fontSize: 11 }}>✦</span> : null}
              <FRIcon name={k} size={22} />
              <span style={{ maxWidth: '100%', fontFamily: FR_HEAD, fontSize: 13.5, fontWeight: 600, color: FR.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
            </div>
          ))}
        </div>
      </div>
      <FRPanel style={{ margin: '0 10px max(10px, env(safe-area-inset-bottom, 0px))', padding: '18px 16px 14px', gap: 10 }}>
        <button type="button" data-auth-create="" onClick={onCreate} style={frButton('primary')}>{tr('fr.welcome.create')}</button>
        <button type="button" data-auth-signin="" onClick={onSignIn} style={frButton('outline')}>{tr('fr.signIn')}</button>
        {onPreview ? <button type="button" data-auth-preview="" onClick={onPreview} style={frButton('text')}>{tr('paywall.preview')}</button> : null}
        <div data-bs-welcome-membership="" style={{ textAlign: 'center', fontFamily: FR_HEAD, fontSize: 13, lineHeight: 1.4, color: FR.ink3, paddingTop: 2 }}>
          <span aria-hidden="true" style={{ color: FR.teal }}>✦</span> {tr('welcome.membership', { price })}
        </div>
      </FRPanel>
    </div>
  );
}

// ── CHECK YOUR EMAIL ────────────────────────────────────────────────────────
export function BSVerifyEmailScreen({ email, captchaOn, captchaRef, onResend, onBackToSignIn }) {
  const { tr } = useTr('onboarding');
  return (
    <FRScreen dataAttr={{ 'data-fr-verify': '' }}
      header={<FRHeader pre={tr('login.verifyTitlePre')} accent={tr('login.verifyTitleAccent')} sub={tr('login.verifyBody', { email })} />}
      footer={<button type="button" onClick={onBackToSignIn} style={frLink({ textAlign: 'center' })}>{tr('fr.backToSignIn')}</button>}>
      <FRPanel>
        {captchaOn ? <div ref={captchaRef} style={{ minHeight: 65, display: 'flex', justifyContent: 'center' }} /> : null}
        <button type="button" onClick={onResend} style={frButton('outline')}>{tr('fr.resend')}</button>
      </FRPanel>
    </FRScreen>
  );
}

// ── JOIN and SIGN IN ────────────────────────────────────────────────────────
// BSLogin keeps every piece of state and every request; this draws them. One primary per screen. Join
// is a member's account: a coach applies through the pill (the application asks whether they are a
// dietitian). Sign in names no role: the account's own role decides (signIn reads the profile's).
export function BSLoginScreen({ s }) {
  const { tr } = useTr('onboarding');
  const [showPw, setShowPw] = React.useState(false);
  const [coachOpen, setCoachOpen] = React.useState(false);
  const { isCreate, isPhone } = s;
  const step1 = isCreate && !isPhone && s.createStep === 1;
  const step2 = isCreate && !isPhone && s.createStep === 2;

  const primaryLabel = s.busy ? tr(isCreate ? 'login.transmitting' : 'login.signingIn')
    : isPhone ? (s.otpSent ? tr(isCreate ? 'fr.verifyJoin' : 'fr.verifySignIn') : tr('fr.sendCode'))
    : step1 ? tr('common:action.continue')
    : step2 ? tr('fr.createAccount')
    : tr('fr.signIn');
  const primaryAct = isPhone ? (s.otpSent ? s.verifyPhoneCode : s.sendPhoneCode) : (step1 ? s.advanceIdentity : s.submitAuth);

  const handleNote = !s.username ? tr('login.handleHint') : s.unameOk === false ? tr('login.handleBad') : s.unameOk ? tr('login.handleOk', { handle: s.username }) : tr('login.handleChecking');
  const handleTone = s.username ? (s.unameOk === false ? 'bad' : s.unameOk ? 'ok' : null) : null;
  const eye = (
    <button type="button" aria-label={tr(showPw ? 'fr.hidePw' : 'fr.showPw')} aria-pressed={showPw} onClick={() => setShowPw((v) => !v)}
      style={{ flex: 'none', display: 'flex', background: 'transparent', border: 0, padding: 10, margin: '-10px -10px -10px 0', cursor: 'pointer', opacity: showPw ? 1 : 0.65 }}>
      <FRIcon name={showPw ? 'eyeOff' : 'eye'} color={FR.ink2} size={20} />
    </button>
  );
  const identity = (
    <>
      <FRField label={tr('login.fieldName')}>
        <input className="bs-lf-input" placeholder={tr('login.phName')} value={s.fullName} onChange={(e) => s.setFullName(e.target.value)} autoComplete="name" style={frInput()} />
      </FRField>
      <FRField label={tr('dob.label')} note={tr('dob.errUnder18')}>
        <input className="bs-lf-input" type="date" value={s.dob} onChange={(e) => s.setDob(e.target.value)} aria-label={tr('dob.label')} style={frInput()} />
      </FRField>
      <FRField label={tr('login.fieldHandle')} note={handleNote} noteTone={handleTone}>
        <span aria-hidden="true" style={{ fontFamily: FR_HEAD, fontSize: 16.5, color: FR.ink3, marginRight: 2 }}>@</span>
        <input className="bs-lf-input" placeholder={tr('login.phHandle')} value={s.username} onChange={(e) => s.setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20))} autoComplete="username" autoCapitalize="none" style={frInput()} />
      </FRField>
    </>
  );

  const fields = (
    <>
      {step1 && identity}
      {step2 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, borderRadius: 12, border: `1px solid ${FR.line}`, background: FR.tealSoft, padding: '4px 6px 4px 12px' }}>
            <span style={{ minWidth: 0, fontFamily: FR_HEAD, fontSize: 14.5, color: FR.ink2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{(s.fullName.trim() || '—') + ' · @' + (s.username || '—')}</span>
            <button type="button" onClick={() => { s.setCreateStep(1); s.setAuthError(''); }} style={frLink({ color: FR.teal, padding: '6px 8px', fontSize: 14, fontWeight: 600 })}>{tr('fr.edit')}</button>
          </div>
          <FRField label={tr('login.fieldEmail')}>
            <input className="bs-lf-input" placeholder={tr('login.phEmail')} type="email" value={s.email} onChange={(e) => s.setEmail(e.target.value)} autoComplete="email" autoCapitalize="none" style={frInput()} />
          </FRField>
          <FRField label={tr('login.fieldPassword')}>
            <input className="bs-lf-input" placeholder="••••••••" type={showPw ? 'text' : 'password'} value={s.password} onChange={(e) => s.setPassword(e.target.value)} autoComplete="new-password" style={frInput()} />
            {eye}
          </FRField>
        </>
      )}
      {!isCreate && !isPhone && (
        <>
          <FRField label={tr('login.phAccount')}>
            <input className="bs-lf-input" placeholder={tr('login.phEmail')} type="text" value={s.email} onChange={(e) => s.setEmail(e.target.value)} autoComplete="username" autoCapitalize="none" style={frInput()} />
          </FRField>
          <FRField label={tr('login.fieldPassword')}
            aside={<button type="button" data-fr-forgot="" onClick={s.forgotPassword} style={frLink({ color: FR.teal, minHeight: 28, padding: '0 2px', fontSize: 13.5, fontWeight: 600 })}>{tr('fr.forgot')}</button>}>
            <input className="bs-lf-input" placeholder="••••••••" type={showPw ? 'text' : 'password'} value={s.password} onChange={(e) => s.setPassword(e.target.value)} autoComplete="current-password" style={frInput()} />
            {eye}
          </FRField>
        </>
      )}
      {isPhone && (
        <>
          {/* Joining by phone asks who they are first, as joining by email does (name, birth date, handle). */}
          {isCreate && !s.otpSent && identity}
          <FRField label={tr('login.fieldPhone')}>
            <input className="bs-lf-input" placeholder={tr('login.phPhone')} type="tel" value={s.phone} onChange={(e) => s.setPhone(e.target.value)} autoComplete="tel" disabled={s.otpSent} style={frInput({ color: s.otpSent ? FR.ink3 : FR.ink })} />
          </FRField>
          {s.otpSent && (
            <FRField label={tr('login.fieldCode')}
              aside={<button type="button" onClick={() => { s.setOtpSent(false); s.setOtpCode(''); s.setAuthError(''); }} style={frLink({ color: FR.teal, minHeight: 28, padding: '0 2px', fontSize: 13.5, fontWeight: 600 })}>{tr('fr.changeNumber')}</button>}>
              <input className="bs-lf-input" placeholder={tr('login.phCode')} type="tel" inputMode="numeric" value={s.otpCode} onChange={(e) => s.setOtpCode(e.target.value)} autoComplete="one-time-code" style={frInput(s.otpCode ? { fontSize: 22, letterSpacing: '0.3em' } : null)} />
            </FRField>
          )}
        </>
      )}
      <FRError text={s.authError} />
      {isCreate && (isPhone || step2) && (
        <div style={{ fontFamily: FR_HEAD, fontSize: 13, lineHeight: 1.5, color: FR.ink3 }}>
          {tr('login.agree')}
          {s.BSLegalLinks ? <s.BSLegalLinks color={FR.ink2} /> : null}
        </div>
      )}
      {s.captchaSlot === 'form' && <div ref={s.captchaRef} style={{ display: 'flex', justifyContent: 'center' }} />}
    </>
  );

  // Email | Phone where both are open: sign in, and join's first step (the phone code step keeps them shut).
  const tabs = (!s.otpSent && (!isCreate || step1 || isPhone)) ? (
    <FRTabs label={tr('fr.method')} value={isPhone ? 'phone' : 'email'} onChange={(k) => s.switchMethod(k)}
      options={[['email', tr('login.fieldEmail')], ['phone', tr('login.fieldPhone')]]} />
  ) : null;

  // The coach's door: a pill in the top bar, opening the applications as a screen of their own.
  const pill = s.onApply ? (
    <button type="button" data-fr-coach-pill="" onClick={() => setCoachOpen((v) => !v)} aria-expanded={coachOpen}
      style={{ minHeight: 36, padding: '6px 14px', borderRadius: 999, border: `1px solid ${FR.line2}`, background: 'transparent', color: FR.ink2, fontFamily: FR_HEAD, fontSize: 13.5, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {coachOpen ? tr('fr.close') : tr('fr.applyPill')}
    </button>
  ) : null;
  // The coach's door, a screen of its own (coordinator's review): the same centred header ("Coach on
  // Shape."), the two applications in a panel, the pill turned to Close.
  // ⚠ IT OPENS OVER THE FORM, WHICH STAYS MOUNTED UNDER IT. Unmounting the form took the Turnstile
  // widget's container with it, and BSLogin draws the widget again only when the captcha slot changes,
  // which closing the door does not: a join or sign-in after Close was stuck at the bot check.
  const coachDoor = s.onApply && coachOpen ? (
    <div style={{ position: 'absolute', inset: 0, zIndex: 5 }}>
      <FRScreen dataAttr={{ 'data-login-coach-door': '' }} onBack={s.onBack} right={pill}
        header={<FRHeader pre={tr('fr.coachTitlePre')} accent={tr('fr.coachTitleAccent')} sub={tr('login.coachCardBody')} />}
        footer={<button type="button" onClick={() => setCoachOpen(false)} style={frLink({ textAlign: 'center' })}>{tr(isCreate ? 'fr.backToJoin' : 'fr.backToSignIn')}</button>}>
        <FRPanel style={{ gap: 10 }}>
          {[['trainer', tr('login.applyTrainer')], ['nutritionist', tr('login.applyNutritionist')]].map(([k, label]) => (
            <button key={k} type="button" data-login-apply={k} onClick={() => { s.setAuthError(''); s.onApply(k); }}
              style={frButton('outline', { display: 'flex', justifyContent: 'space-between', alignItems: 'center', textAlign: 'left' })}>
              <span>{label}</span><span aria-hidden="true" style={{ color: FR.teal }}>→</span>
            </button>
          ))}
        </FRPanel>
      </FRScreen>
    </div>
  ) : null;

  // The long forms take the compact header: join's first step, and joining by phone before the code.
  const long = step1 || (isCreate && isPhone && !s.otpSent);
  const header = isCreate
    ? <FRHeader compact={long} pre={tr('fr.joinTitlePre')} accent={tr('fr.joinTitleAccent')}
        step={!isPhone ? <FRSteps n={s.createStep} label={tr('login.step', { n: s.createStep }) + ' · ' + tr(s.createStep === 1 ? 'login.stepIdentity' : 'login.stepCredentials')} /> : null} />
    : <FRHeader pre={tr('login.titleBackPre')} accent={tr('login.titleBackAccent')} />;

  return (
    <>
    <FRScreen dataAttr={{ 'data-bs-login': '' }} tight={long} onBack={s.onBack} right={coachOpen ? null : pill} header={header}
      footer={<button type="button" data-fr-switch="" onClick={() => { s.setMode(isCreate ? 'signin' : 'create'); s.setAuthError(''); }} style={frLink({ textAlign: 'center' })}>{tr(isCreate ? 'login.haveAccount' : 'login.newHere')}</button>}>
      <FRPanel>
        {tabs}
        {fields}
        <button type="button" data-fr-primary="" onClick={primaryAct} disabled={s.busy} className="bs-wire-enter"
          style={frButton('primary', { cursor: s.busy ? 'wait' : 'pointer', opacity: s.busy ? 0.7 : 1 })}>{primaryLabel}</button>
      </FRPanel>
    </FRScreen>
    {coachDoor}
    </>
  );
}
