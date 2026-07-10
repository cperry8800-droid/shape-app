import React from 'react';
import {
  PROVIDER_APPLICATION_FILE_ACCEPT,
  PROVIDER_APPLICATION_MAX_FILE_BYTES,
  PROVIDER_EXPERIENCE_OPTIONS,
  REQUIRED_PROVIDER_EXPERIENCE_YEARS,
  experienceMeetsMinimum,
} from '../config/providerApplications.js';

const { useState: useStateBSA } = React;
const { useBS } = window;

const APPLY_STEPS = ['Personal', 'Credentials', 'Specialty', 'Pricing'];

const TRAINER_SPECIALTIES = [
  'Strength & Powerlifting',
  'HIIT & Fat Loss',
  'At-home Workouts',
  'Cardio & Endurance',
  'Marathon',
  'Ultra',
  'Functional Fitness',
  'Bodybuilding',
  'Sports Performance',
  'Mobility',
  'Run coaching',
];

const NUTRITION_SPECIALTIES = [
  'Weight management',
  'Sports nutrition',
  'Plant-based',
  'Gut health',
  'Hormonal health',
  'Pre/postnatal',
  'Endurance fueling',
  'Clinical / medical',
  'Meal prep',
];

const TRAINER_POPULATIONS = ['Beginners', 'Women 30-50', 'Men 40+', 'Postnatal', 'Athletes', 'Seniors', 'Rehab', 'Youth'];
const NUTRITION_POPULATIONS = ['Endurance athletes', 'Strength athletes', 'Weight loss', 'Clinical conditions', 'Plant-based', 'Postnatal', 'Youth'];

// The application rides the LAUNCH grammar (it's entered from the wire auth
// pages), so it's fixed-dark by design — never the paper theme.
const AP_CREAM = '#f2ede4';
const AP_C70 = 'rgba(242,237,228,0.72)';
const AP_C50 = 'rgba(242,237,228,0.5)';
const AP_C30 = 'rgba(242,237,228,0.3)';
const AP_LINE = 'rgba(242,237,228,0.18)';
const AP_LINE2 = 'rgba(242,237,228,0.34)';
const AP_TEAL = '#34d6c5';
const AP_TEAL2 = '#2ee0c4';
const AP_ERR = '#ff9b7a';
const AP_BG = 'radial-gradient(135% 90% at 50% -8%, rgba(52,214,197,0.13), transparent 52%), linear-gradient(176deg, #0b161c 0%, #070b11 48%, #03050b 100%)';
// Role heat rides ONLY the application tag (trainer rust / nutritionist gold).
const AP_ROLE = {
  trainer: { bg: '#c0533b', ink: '#f2ede4' },
  nutritionist: { bg: '#d8b25a', ink: '#141007' },
};

let _bsApplyStyled = false;
function ensureApplyStyles() {
  if (_bsApplyStyled || typeof document === 'undefined') return;
  _bsApplyStyled = true;
  const el = document.createElement('style');
  el.textContent = `
  .bs-apply-row { border-bottom:1px dotted rgba(242,237,228,0.34); padding:7px 0 6px; }
  .bs-apply-row:focus-within { border-bottom-color:#34d6c5; border-bottom-style:solid; }
  .bs-apply-in { width:100%; min-width:0; background:transparent; border:0; outline:none; color-scheme:dark; caret-color:#34d6c5; color:#f2ede4; }
  .bs-apply-in::placeholder { color:rgba(242,237,228,0.28); }
  .bs-apply-in:-webkit-autofill, .bs-apply-in:-webkit-autofill:hover, .bs-apply-in:-webkit-autofill:focus {
    -webkit-box-shadow: inset 0 0 0 1000px #0c161c; -webkit-text-fill-color:#f2ede4; caret-color:#f2ede4;
    transition: background-color 999999s ease-out 0s;
  }
  select.bs-apply-in option { background:#0b161c; color:#f2ede4; }
  .bs-apply-area { width:100%; min-width:0; box-sizing:border-box; background:transparent; outline:none; color-scheme:dark; caret-color:#34d6c5; color:#f2ede4; border:1px solid rgba(242,237,228,0.18); border-radius:0; padding:10px; }
  .bs-apply-area:focus { border-color:#34d6c5; }
  .bs-apply-file::file-selector-button { background:transparent; border:1px solid rgba(242,237,228,0.34); color:#f2ede4; font-family:inherit; text-transform:uppercase; letter-spacing:0.1em; font-size:9px; font-weight:700; padding:6px 10px; margin-right:10px; cursor:pointer; }
  `;
  document.head.appendChild(el);
}

function apLabel(t) {
  return { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: AP_C50 };
}

function BSApplyInput({ label, value, onChange, type = 'text', placeholder = '', multiline = false }) {
  const t = useBS();
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={apLabel(t)}>{label}</span>
      {multiline ? (
        <textarea className="bs-apply-area" value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} style={{ resize: 'vertical', fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.4 }} />
      ) : (
        <div className="bs-apply-row">
          <input className="bs-apply-in" value={value || ''} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} style={{ fontFamily: t.DISPLAY, fontSize: 14, padding: '1px 0' }} />
        </div>
      )}
    </label>
  );
}

function BSApplySelect({ label, value, onChange, options }) {
  const t = useBS();
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={apLabel(t)}>{label}</span>
      <div className="bs-apply-row">
        <select className="bs-apply-in" value={value || options[0]} onChange={(e) => onChange(e.target.value)} style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', padding: '3px 0' }}>
          {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
        </select>
      </div>
    </label>
  );
}

function BSApplyChips({ label, options, values = [], onToggle }) {
  const t = useBS();
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={apLabel(t)}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => {
          const on = values.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)} style={{
              padding: '8px 10px',
              border: `1px solid ${on ? AP_TEAL : AP_LINE2}`,
              background: on ? AP_TEAL : 'transparent',
              color: on ? '#05080c' : AP_CREAM,
              fontFamily: t.MONO,
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 800,
              cursor: 'pointer',
            }}>{on ? '[x] ' : ''}{opt}</button>
          );
        })}
      </div>
    </div>
  );
}

function BSApplyCheck({ checked, onChange, children }) {
  const t = useBS();
  return (
    <button type="button" onClick={() => onChange(!checked)} style={{
      display: 'grid',
      gridTemplateColumns: '22px 1fr',
      gap: 10,
      alignItems: 'start',
      width: '100%',
      padding: 0,
      border: 0,
      background: 'transparent',
      color: AP_C70,
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: t.DISPLAY,
      fontSize: 13.5,
      lineHeight: 1.45,
    }}>
      <span style={{ width: 18, height: 18, border: `1px solid ${checked ? AP_TEAL : AP_LINE2}`, background: checked ? AP_TEAL : 'transparent', color: '#05080c', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 900, marginTop: 1 }}>
        {checked ? 'x' : ''}
      </span>
      <span>{children}</span>
    </button>
  );
}

function BSApplyFile({ label, file, onChange, helper }) {
  const t = useBS();
  return (
    <label style={{ display: 'grid', gap: 4 }}>
      <span style={apLabel(t)}>{label}</span>
      <input
        type="file"
        className="bs-apply-in bs-apply-file"
        accept={PROVIDER_APPLICATION_FILE_ACCEPT}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        style={{
          width: '100%',
          boxSizing: 'border-box',
          border: `1px dashed ${AP_LINE2}`,
          padding: 10,
          fontFamily: t.MONO,
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      />
      <span style={{ fontFamily: t.DISPLAY, fontSize: 12, lineHeight: 1.35, color: AP_C50 }}>
        {file ? `${file.name} - ${Math.round(file.size / 1024)}KB` : helper}
      </span>
    </label>
  );
}

// A teal-spined notice line — the wire grammar's quiet callout.
function BSApplyNotice({ t, children, mono }) {
  return (
    <div style={mono
      ? { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: AP_TEAL, border: `1px solid ${AP_LINE}`, borderLeft: `3px solid ${AP_TEAL}`, padding: '8px 10px' }
      : { border: `1px solid ${AP_LINE}`, borderLeft: `3px solid ${AP_TEAL}`, padding: '9px 11px', fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.45, color: AP_C70 }}>
      {children}
    </div>
  );
}

function BSProviderApplicationScreen({ initialRole = 'trainer', onBack }) {
  const t = useBS();
  ensureApplyStyles();
  // A dietitian (RD/RDN) applies on the NUTRITIONIST rails — the declaration
  // rides in details.nutrition_role for the reviewer (who assigns
  // profiles.role='dietitian' after credential review). Before this, an
  // initialRole of 'dietitian' silently coerced to the TRAINER application
  // and the RD/RDN flag never reached the apply route.
  const isDietitianApplicant = initialRole === 'dietitian';
  const [role, setRole] = useStateBSA(initialRole === 'nutritionist' || isDietitianApplicant ? 'nutritionist' : 'trainer');
  const [step, setStep] = useStateBSA(0);
  const [values, setValues] = useStateBSA(() => {
    const auth = window.ShapeAuth?.getCachedState?.() || {};
    const name = auth.profile?.full_name || '';
    const [firstName, ...rest] = name.split(' ');
    return {
      firstName: firstName || '',
      lastName: rest.join(' '),
      email: auth.user?.email || auth.profile?.email || '',
      years: '7-10 years',
      insurance: 'Yes',
      accepting: 'Yes',
      oneOnOne: 'Yes',
      response: 'Within 24 hours',
      intro: '15-minute free intro',
    };
  });
  const [submitting, setSubmitting] = useStateBSA(false);
  const [result, setResult] = useStateBSA(null);
  const [error, setError] = useStateBSA('');
  const [resumeFile, setResumeFile] = useStateBSA(null);
  const [credentialFile, setCredentialFile] = useStateBSA(null);
  const [insuranceFile, setInsuranceFile] = useStateBSA(null);

  const isTrainer = role === 'trainer';
  const roleHeat = AP_ROLE[isTrainer ? 'trainer' : 'nutritionist'];
  const specialties = isTrainer ? TRAINER_SPECIALTIES : NUTRITION_SPECIALTIES;
  const populations = isTrainer ? TRAINER_POPULATIONS : NUTRITION_POPULATIONS;
  const set = (key, value) => setValues(prev => ({ ...prev, [key]: value }));
  const toggle = (key, value) => {
    setValues(prev => {
      const current = prev[key] || [];
      return { ...prev, [key]: current.includes(value) ? current.filter(x => x !== value) : [...current, value] };
    });
  };

  async function submit() {
    setError('');
    const required = [values.firstName, values.lastName, values.email, values.cert, values.primary || specialties[0]];
    if (required.some(v => !String(v || '').trim())) {
      setError('Complete name, email, primary credential, and specialty before submitting.');
      return;
    }
    if (!values.verify || !values.tos || !values.conduct || !values.bgcheck) {
      setError('Credential verification, background check consent, terms, and code of conduct must be accepted.');
      return;
    }
    if (!experienceMeetsMinimum(values.years)) {
      setError(`Shape requires at least ${REQUIRED_PROVIDER_EXPERIENCE_YEARS} years of professional coaching or nutrition experience.`);
      return;
    }
    const files = [
      { kind: 'resume', file: resumeFile },
      { kind: 'credential', file: credentialFile },
      { kind: 'insurance', file: insuranceFile },
    ].filter(item => item.file);
    if (files.some(item => item.file.size > PROVIDER_APPLICATION_MAX_FILE_BYTES)) {
      setError('Resume and credential files must be 10MB or smaller.');
      return;
    }
    setSubmitting(true);
    try {
      const documents = [];
      for (const item of files) {
        const uploaded = await window.ShapeApplications?.uploadProviderApplicationFile?.(item.file, item.kind);
        if (uploaded) documents.push(uploaded);
      }
      const next = await window.ShapeApplications?.submitProviderApplication?.({
        role,
        values: {
          ...values,
          primary: values.primary || specialties[0],
          documents,
          // The RD/RDN declaration — the apply route reads details.nutrition_role
          // === 'dietitian' to label the application for the reviewer.
          nutrition_role: (role === 'nutritionist' && isDietitianApplicant) ? 'dietitian' : '',
        },
      });
      setResult(next || { stored: 'local' });
    } catch (err) {
      setError(err?.message || 'Application could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  const Ground = window.BSWireGround;
  const serifHead = { fontFamily: `'Newsreader', Georgia, serif`, fontWeight: 500, fontSize: 37, lineHeight: 0.94, letterSpacing: '-0.045em', color: AP_CREAM, marginTop: 4 };
  const eyebrow = { fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: AP_TEAL2, fontWeight: 700 };
  const backBtn = { position: 'absolute', zIndex: 3, top: 'max(16px, calc(env(safe-area-inset-top, 0px) + 10px))', left: 18, background: 'transparent', border: 0, color: AP_C70, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: '6px 4px' };
  const scroller = { position: 'relative', zIndex: 1, flex: 1, minHeight: 0, overflowY: 'auto', WebkitOverflowScrolling: 'touch', padding: 'max(52px, calc(env(safe-area-inset-top, 0px) + 40px)) 22px calc(24px + env(safe-area-inset-bottom, 0px))', display: 'flex', flexDirection: 'column', gap: 12 };

  const body = (() => {
    if (step === 0) return (
      <div style={{ display: 'grid', gap: 11 }}>
        {isDietitianApplicant && role === 'nutritionist' && (
          <BSApplyNotice t={t} mono>
            Applying as a Registered Dietitian (RD/RDN) · credentialed badge on approval
          </BSApplyNotice>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BSApplyInput label="First name" value={values.firstName} onChange={v => set('firstName', v)} />
          <BSApplyInput label="Last name" value={values.lastName} onChange={v => set('lastName', v)} />
        </div>
        <BSApplyInput label="Email" value={values.email} onChange={v => set('email', v)} type="email" />
        <BSApplyInput label="Phone" value={values.phone} onChange={v => set('phone', v)} type="tel" />
        <BSApplyInput label="City, state / country" value={values.city} onChange={v => set('city', v)} placeholder="Brooklyn, NY" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BSApplyInput label="Time zone" value={values.tz} onChange={v => set('tz', v)} placeholder="America/New_York" />
          <BSApplyInput label="Social handles" value={values.social} onChange={v => set('social', v)} placeholder="@handle" />
        </div>
        <BSApplyInput label={`Short bio - why ${isTrainer ? 'coaching' : 'nutrition'}`} value={values.bio} onChange={v => set('bio', v)} multiline />
      </div>
    );

    if (step === 1) return (
      <div style={{ display: 'grid', gap: 11 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BSApplyInput label={isTrainer ? 'Primary certification' : 'License type'} value={values.cert} onChange={v => set('cert', v)} placeholder={isTrainer ? 'NASM, ACE, CSCS' : 'RD, RDN, CNS'} />
          <BSApplyInput label={isTrainer ? 'Expiration / renewal' : 'License state + number'} value={values.certExp} onChange={v => set('certExp', v)} />
        </div>
        <BSApplyInput label="Degree / school" value={values.edu} onChange={v => set('edu', v)} placeholder={isTrainer ? 'BS Kinesiology' : 'MS Nutrition'} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BSApplySelect label="Years professional experience" value={values.years} onChange={v => set('years', v)} options={PROVIDER_EXPERIENCE_OPTIONS} />
          <BSApplySelect label="Liability insurance" value={values.insurance} onChange={v => set('insurance', v)} options={['Yes', 'No', 'In progress']} />
        </div>
        <BSApplyNotice t={t}>
          Shape requires a minimum of 5 years of professional {isTrainer ? 'training or coaching' : 'nutrition coaching or clinical'} experience before a provider profile can go live.
        </BSApplyNotice>
        <BSApplyInput label="Previous platforms" value={values.prev} onChange={v => set('prev', v)} placeholder="Trainerize, MyFitnessPal Pro" />
        <div style={{ display: 'grid', gap: 12 }}>
          <BSApplyFile label="Resume / CV" file={resumeFile} onChange={setResumeFile} helper="PDF, DOC, image, up to 10MB" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <BSApplyFile label={isTrainer ? 'Certification file' : 'License file'} file={credentialFile} onChange={setCredentialFile} helper="Proof of credential" />
            <BSApplyFile label="Insurance file" file={insuranceFile} onChange={setInsuranceFile} helper="Optional but recommended" />
          </div>
        </div>
        <BSApplyCheck checked={values.verify} onChange={v => set('verify', v)}>I understand my credentials may be verified by Shape's trust team.</BSApplyCheck>
      </div>
    );

    if (step === 2) return (
      <div style={{ display: 'grid', gap: 13 }}>
        <BSApplySelect label="Primary specialty" value={values.primary || specialties[0]} onChange={v => set('primary', v)} options={specialties} />
        <BSApplyChips label="Secondary specialties" options={specialties} values={values.secondary || []} onToggle={v => toggle('secondary', v)} />
        <BSApplyChips label="Populations you work best with" options={populations} values={values.populations || []} onToggle={v => toggle('populations', v)} />
        <BSApplyInput label="Coaching style" value={values.style} onChange={v => set('style', v)} placeholder={isTrainer ? 'Data-driven, warm, no shouting' : 'Evidence-based, real food, no restriction'} />
      </div>
    );

    return (
      <div style={{ display: 'grid', gap: 11 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BSApplyInput label="Max clients" value={values.maxClients} onChange={v => set('maxClients', v)} type="number" placeholder="25" />
          <BSApplySelect label="Accepting clients" value={values.accepting} onChange={v => set('accepting', v)} options={['Yes', 'Waitlist', 'Not yet']} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BSApplySelect label={isTrainer ? '1-on-1 sessions' : '1-on-1 consults'} value={values.oneOnOne} onChange={v => set('oneOnOne', v)} options={['Yes', 'No']} />
          <BSApplySelect label="Response time" value={values.response} onChange={v => set('response', v)} options={['Within 12 hours', 'Within 24 hours', 'Within 48 hours']} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <BSApplyInput label={isTrainer ? 'Subscription $/mo' : 'Monthly plan $/mo'} value={values.subPrice} onChange={v => set('subPrice', v)} type="number" placeholder={isTrainer ? '280' : '320'} />
          <BSApplyInput label={isTrainer ? 'Single session $' : 'Single consult $'} value={values.sessionPrice} onChange={v => set('sessionPrice', v)} type="number" placeholder={isTrainer ? '55' : '150'} />
        </div>
        <BSApplySelect label="Free intro" value={values.intro} onChange={v => set('intro', v)} options={['15-minute free intro', '30-minute free intro', 'No free intro']} />
        <div style={{ display: 'grid', gap: 11, borderTop: `1px solid ${AP_LINE}`, paddingTop: 12 }}>
          <BSApplyNotice t={t}>
            Background checks are required before a provider profile can go live. Shape uses Checkr first; the review team sends the screening invite after application review.
          </BSApplyNotice>
          <BSApplyCheck checked={values.tos} onChange={v => set('tos', v)}>I agree to the {isTrainer ? 'Trainer' : 'Nutritionist'} Agreement and Terms of Service.</BSApplyCheck>
          <BSApplyCheck checked={values.conduct} onChange={v => set('conduct', v)}>I agree to Shape's code of conduct.</BSApplyCheck>
          <BSApplyCheck checked={values.bgcheck} onChange={v => set('bgcheck', v)}>I consent to a required background check through Shape's screening partner before my provider profile can go live.</BSApplyCheck>
        </div>
      </div>
    );
  })();

  if (result) {
    const local = result.stored === 'local';
    return (
      <div style={{ position: 'absolute', inset: 0, color: AP_CREAM, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: AP_BG }}>
        {Ground ? <Ground dim /> : null}
        <button onClick={onBack} style={backBtn}>← Back</button>
        <div className="bs-hide-scroll" style={{ ...scroller, justifyContent: 'center', gap: 16 }}>
          <div style={eyebrow}>Application</div>
          <div style={serifHead}>Submitted<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em', color: AP_TEAL2 }}>for review.</span></div>
          <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: local ? '#e8c268' : AP_TEAL }}>
            {local ? 'Saved locally' : 'Filed ✓ · Submitted'}
          </div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.5, color: AP_C70 }}>
            Your {isTrainer ? 'trainer' : 'nutritionist'} application is ready for review.
          </div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: AP_C50, lineHeight: 1.7 }}>
            Review target: 2-3 business days. {local ? 'If this says saved locally, check the provider application API and Supabase configuration before production. ' : ''}Uploaded resume and credential files are attached to the application review record.
          </div>
          <button onClick={onBack} className="bs-wire-enter" style={{ width: '100%', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)', padding: '13px 14px', background: AP_TEAL, color: '#05080c', border: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Back to marketplace →
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'absolute', inset: 0, color: AP_CREAM, overflow: 'hidden', display: 'flex', flexDirection: 'column', background: AP_BG }}>
      {Ground ? <Ground dim /> : null}
      <button onClick={onBack} style={backBtn}>← Back</button>
      <div className="bs-hide-scroll" style={scroller}>
        {/* Head — the wire dispatch header */}
        <div>
          <div style={eyebrow}>Provider Desk</div>
          <div style={serifHead}>Apply to<br/><span style={{ fontWeight: 400, fontStyle: 'italic', letterSpacing: '-0.065em', color: AP_TEAL2 }}>Shape.</span></div>
        </div>

        {/* Role tag — the one role-heat placement */}
        <div>
          <span style={{ display: 'inline-block', background: roleHeat.bg, color: roleHeat.ink, padding: '8px 14px', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800 }}>
            {role} application{isDietitianApplicant ? ' · RD/RDN' : ''}
          </span>
        </div>

        {/* The pitch */}
        <div>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: AP_TEAL }}>Free to join — no upfront costs</div>
          <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.4, color: AP_C70 }}>
            Set your own pricing, publish programs, sell sessions, and get reviewed by Shape before going live.
          </div>
        </div>

        {/* Step register — same grammar as the wire-form auth */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: `2px solid ${AP_LINE2}`, paddingBottom: 6 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: AP_C50 }}>Step {step + 1} of {APPLY_STEPS.length}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: AP_TEAL2 }}>{APPLY_STEPS[step]}</span>
          </div>
          <div style={{ display: 'flex', gap: 5, marginTop: 6 }}>
            {APPLY_STEPS.map((name, index) => (
              <div key={name} style={{ flex: 1, height: 3, background: index <= step ? AP_TEAL : 'rgba(242,237,228,0.14)' }} />
            ))}
          </div>
        </div>

        {body}

        {error && (
          <div style={{ color: AP_ERR, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.45 }}>
            {error}
          </div>
        )}

        {/* Actions — quiet ghost back · clipped teal TRANSMIT */}
        <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8, marginTop: 4 }}>
          <button disabled={step === 0 || submitting} onClick={() => setStep(Math.max(0, step - 1))} style={{
            minHeight: 48,
            border: `1px solid ${AP_LINE2}`,
            background: 'transparent',
            color: step === 0 ? AP_C30 : AP_C70,
            fontFamily: t.MONO,
            fontSize: 9.5,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontWeight: 800,
            cursor: step === 0 ? 'default' : 'pointer',
          }}>Back</button>
          <button disabled={submitting} onClick={() => step === APPLY_STEPS.length - 1 ? submit() : setStep(step + 1)} className="bs-wire-enter" style={{
            clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)',
            border: 0,
            background: AP_TEAL,
            color: '#05080c',
            fontFamily: t.MONO,
            fontSize: 10,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontWeight: 800,
            minHeight: 48,
            cursor: submitting ? 'wait' : 'pointer',
            opacity: submitting ? 0.7 : 1,
          }}>{submitting ? 'Transmitting…' : step === APPLY_STEPS.length - 1 ? 'Transmit · Submit →' : 'Continue →'}</button>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { BSProviderApplicationScreen });
