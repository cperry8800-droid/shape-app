import React from 'react';
import {
  PROVIDER_APPLICATION_FILE_ACCEPT,
  PROVIDER_APPLICATION_MAX_FILE_BYTES,
  PROVIDER_EXPERIENCE_OPTIONS,
  REQUIRED_PROVIDER_EXPERIENCE_YEARS,
  experienceMeetsMinimum,
} from '../config/providerApplications.js';

const { useState: useStateBSA } = React;
const { BSPage, BSPageHeader, BSSection, BSEyebrow, BSTag, useBS } = window;

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

function BSApplyInput({ label, value, onChange, type = 'text', placeholder = '', multiline = false }) {
  const t = useBS();
  const base = {
    width: '100%',
    minWidth: 0,
    border: `1px solid ${t.RULE}`,
    background: t.PAPER2,
    color: t.INK,
    borderRadius: t.RADIUS_SM,
    padding: '12px 11px',
    fontFamily: t.DISPLAY,
    fontSize: 15,
    outline: 'none',
  };
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>{label}</span>
      {multiline ? (
        <textarea value={value || ''} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} rows={4} style={{ ...base, resize: 'vertical', lineHeight: 1.35 }} />
      ) : (
        <input value={value || ''} onChange={(e) => onChange(e.target.value)} type={type} placeholder={placeholder} style={base} />
      )}
    </label>
  );
}

function BSApplySelect({ label, value, onChange, options }) {
  const t = useBS();
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>{label}</span>
      <select value={value || options[0]} onChange={(e) => onChange(e.target.value)} style={{
        width: '100%',
        minWidth: 0,
        border: `1px solid ${t.RULE}`,
        background: t.PAPER2,
        color: t.INK,
        borderRadius: t.RADIUS_SM,
        padding: '12px 11px',
        fontFamily: t.MONO,
        fontSize: 10,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        outline: 'none',
      }}>
        {options.map(opt => <option key={opt} value={opt}>{opt}</option>)}
      </select>
    </label>
  );
}

function BSApplyChips({ label, options, values = [], onToggle }) {
  const t = useBS();
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {options.map(opt => {
          const on = values.includes(opt);
          return (
            <button key={opt} type="button" onClick={() => onToggle(opt)} style={{
              borderRadius: t.RADIUS_SM,
              padding: '8px 10px',
              border: `1px solid ${on ? t.ACCENT : t.RULE}`,
              background: on ? t.ACCENT : 'transparent',
              color: on ? '#07100d' : t.INK,
              fontFamily: t.MONO,
              fontSize: 8.5,
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
      color: t.INK70,
      textAlign: 'left',
      cursor: 'pointer',
      fontFamily: t.DISPLAY,
      fontSize: 13.5,
      lineHeight: 1.45,
    }}>
      <span style={{ width: 18, height: 18, border: `1px solid ${checked ? t.ACCENT : t.RULE}`, background: checked ? t.ACCENT : 'transparent', color: '#07100d', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 900, marginTop: 1 }}>
        {checked ? 'x' : ''}
      </span>
      <span>{children}</span>
    </button>
  );
}

function BSApplyFile({ label, file, onChange, helper }) {
  const t = useBS();
  return (
    <label style={{ display: 'grid', gap: 7 }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>{label}</span>
      <input
        type="file"
        accept={PROVIDER_APPLICATION_FILE_ACCEPT}
        onChange={(event) => onChange(event.target.files?.[0] || null)}
        style={{
          width: '100%',
          border: `1px solid ${t.RULE}`,
          background: t.PAPER2,
          color: t.INK,
          borderRadius: t.RADIUS_SM,
          padding: '11px',
          fontFamily: t.MONO,
          fontSize: 9,
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
        }}
      />
      <span style={{ fontFamily: t.DISPLAY, fontSize: 12, lineHeight: 1.35, color: t.INK50 }}>
        {file ? `${file.name} - ${Math.round(file.size / 1024)}KB` : helper}
      </span>
    </label>
  );
}

function BSProviderApplicationScreen({ initialRole = 'trainer', onBack }) {
  const t = useBS();
  const [role, setRole] = useStateBSA(initialRole === 'nutritionist' ? 'nutritionist' : 'trainer');
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
        values: { ...values, primary: values.primary || specialties[0], documents },
      });
      setResult(next || { stored: 'local' });
    } catch (err) {
      setError(err?.message || 'Application could not be submitted.');
    } finally {
      setSubmitting(false);
    }
  }

  const body = (() => {
    if (step === 0) return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BSApplyInput label="First name" value={values.firstName} onChange={v => set('firstName', v)} />
          <BSApplyInput label="Last name" value={values.lastName} onChange={v => set('lastName', v)} />
        </div>
        <BSApplyInput label="Email" value={values.email} onChange={v => set('email', v)} type="email" />
        <BSApplyInput label="Phone" value={values.phone} onChange={v => set('phone', v)} type="tel" />
        <BSApplyInput label="City, state / country" value={values.city} onChange={v => set('city', v)} placeholder="Brooklyn, NY" />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BSApplyInput label="Time zone" value={values.tz} onChange={v => set('tz', v)} placeholder="America/New_York" />
          <BSApplyInput label="Social handles" value={values.social} onChange={v => set('social', v)} placeholder="@handle" />
        </div>
        <BSApplyInput label={`Short bio - why ${isTrainer ? 'coaching' : 'nutrition'}`} value={values.bio} onChange={v => set('bio', v)} multiline />
      </div>
    );

    if (step === 1) return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BSApplyInput label={isTrainer ? 'Primary certification' : 'License type'} value={values.cert} onChange={v => set('cert', v)} placeholder={isTrainer ? 'NASM, ACE, CSCS' : 'RD, RDN, CNS'} />
          <BSApplyInput label={isTrainer ? 'Expiration / renewal' : 'License state + number'} value={values.certExp} onChange={v => set('certExp', v)} />
        </div>
        <BSApplyInput label="Degree / school" value={values.edu} onChange={v => set('edu', v)} placeholder={isTrainer ? 'BS Kinesiology' : 'MS Nutrition'} />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BSApplySelect label="Years professional experience" value={values.years} onChange={v => set('years', v)} options={PROVIDER_EXPERIENCE_OPTIONS} />
          <BSApplySelect label="Liability insurance" value={values.insurance} onChange={v => set('insurance', v)} options={['Yes', 'No', 'In progress']} />
        </div>
        <div style={{ border: `1px solid ${t.RULE}`, background: t.PAPER2, borderRadius: t.RADIUS_SM, padding: 12, fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.4, color: t.INK70 }}>
          Shape requires a minimum of 7 years of professional {isTrainer ? 'training or coaching' : 'nutrition coaching or clinical'} experience before a provider profile can go live.
        </div>
        <BSApplyInput label="Previous platforms" value={values.prev} onChange={v => set('prev', v)} placeholder="Trainerize, MyFitnessPal Pro" />
        <div style={{ display: 'grid', gap: 10 }}>
          <BSApplyFile label="Resume / CV" file={resumeFile} onChange={setResumeFile} helper="PDF, DOC, image, up to 10MB" />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <BSApplyFile label={isTrainer ? 'Certification file' : 'License file'} file={credentialFile} onChange={setCredentialFile} helper="Proof of credential" />
            <BSApplyFile label="Insurance file" file={insuranceFile} onChange={setInsuranceFile} helper="Optional but recommended" />
          </div>
        </div>
        <BSApplyCheck checked={values.verify} onChange={v => set('verify', v)}>I understand my credentials may be verified by Shape's trust team.</BSApplyCheck>
      </div>
    );

    if (step === 2) return (
      <div style={{ display: 'grid', gap: 16 }}>
        <BSApplySelect label="Primary specialty" value={values.primary || specialties[0]} onChange={v => set('primary', v)} options={specialties} />
        <BSApplyChips label="Secondary specialties" options={specialties} values={values.secondary || []} onToggle={v => toggle('secondary', v)} />
        <BSApplyChips label="Populations you work best with" options={populations} values={values.populations || []} onToggle={v => toggle('populations', v)} />
        <BSApplyInput label="Coaching style" value={values.style} onChange={v => set('style', v)} placeholder={isTrainer ? 'Data-driven, warm, no shouting' : 'Evidence-based, real food, no restriction'} />
      </div>
    );

    return (
      <div style={{ display: 'grid', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BSApplyInput label="Max clients" value={values.maxClients} onChange={v => set('maxClients', v)} type="number" placeholder="25" />
          <BSApplySelect label="Accepting clients" value={values.accepting} onChange={v => set('accepting', v)} options={['Yes', 'Waitlist', 'Not yet']} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BSApplySelect label={isTrainer ? '1-on-1 sessions' : '1-on-1 consults'} value={values.oneOnOne} onChange={v => set('oneOnOne', v)} options={['Yes', 'No']} />
          <BSApplySelect label="Response time" value={values.response} onChange={v => set('response', v)} options={['Within 12 hours', 'Within 24 hours', 'Within 48 hours']} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <BSApplyInput label={isTrainer ? 'Subscription $/mo' : 'Monthly plan $/mo'} value={values.subPrice} onChange={v => set('subPrice', v)} type="number" placeholder={isTrainer ? '280' : '320'} />
          <BSApplyInput label={isTrainer ? 'Single session $' : 'Single consult $'} value={values.sessionPrice} onChange={v => set('sessionPrice', v)} type="number" placeholder={isTrainer ? '55' : '150'} />
        </div>
        <BSApplySelect label="Free intro" value={values.intro} onChange={v => set('intro', v)} options={['15-minute free intro', '30-minute free intro', 'No free intro']} />
        <div style={{ display: 'grid', gap: 9, borderTop: `1px solid ${t.HAIR}`, paddingTop: 12 }}>
          <div style={{ border: `1px solid ${t.RULE}`, background: t.PAPER2, borderRadius: t.RADIUS_SM, padding: 12, fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.4, color: t.INK70 }}>
            Background checks are required before a provider profile can go live. Shape uses Checkr first; the review team sends the screening invite after application review.
          </div>
          <BSApplyCheck checked={values.tos} onChange={v => set('tos', v)}>I agree to the {isTrainer ? 'Trainer' : 'Nutritionist'} Agreement and Terms of Service.</BSApplyCheck>
          <BSApplyCheck checked={values.conduct} onChange={v => set('conduct', v)}>I agree to Shape's code of conduct.</BSApplyCheck>
          <BSApplyCheck checked={values.bgcheck} onChange={v => set('bgcheck', v)}>I consent to a required background check through Shape's screening partner before my provider profile can go live.</BSApplyCheck>
        </div>
      </div>
    );
  })();

  if (result) {
    return (
      <BSPage>
        <BSPageHeader kicker="Application" title={<>Submitted<br/><span style={{ fontStyle: 'italic' }}>for review.</span></>} trailing={<BackButton onClick={onBack} />} />
        <div style={{ margin: `18px ${t.padX}px`, padding: 18, border: `2px solid ${t.INK}`, background: t.PAPER2, boxShadow: `4px 4px 0 ${t.INK}` }}>
          <BSTag color={result.stored === 'local' ? t.AMBER : t.ACCENT} dark={!t.isLight}>{result.stored === 'local' ? 'Saved locally' : 'Submitted'}</BSTag>
          <div style={{ marginTop: 14, fontFamily: t.DISPLAY, fontSize: 22, lineHeight: 1.25, color: t.INK }}>
            Your {isTrainer ? 'trainer' : 'nutritionist'} application is ready for review.
          </div>
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK60, lineHeight: 1.6 }}>
            Review target: 2-3 business days. If this says saved locally, check the provider application API and Supabase configuration before production.
            Uploaded resume and credential files are attached to the application review record.
          </div>
          <button onClick={onBack} style={{ marginTop: 18, width: '100%', border: `1px solid ${t.INK}`, background: t.INK, color: t.PAPER, borderRadius: t.RADIUS_SM, padding: 14, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 800 }}>
            Back to marketplace
          </button>
        </div>
      </BSPage>
    );
  }

  return (
    <BSPage>
      <BSPageHeader
        kicker="Provider desk"
        title={<>Apply to<br/><span style={{ fontStyle: 'italic' }}>Shape.</span></>}
        trailing={<BackButton onClick={onBack} />}
      />

      <div style={{ padding: `0 ${t.padX}px 14px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
        {['trainer', 'nutritionist'].map(next => {
          const on = role === next;
          return (
            <button key={next} onClick={() => setRole(next)} style={{
              borderRadius: t.RADIUS_SM,
              minHeight: 42,
              background: on ? t.INK : 'transparent',
              color: on ? t.PAPER : t.INK,
              border: `1px solid ${t.INK}`,
              fontFamily: t.MONO,
              fontSize: 9.5,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              fontWeight: 800,
            }}>{next}</button>
          );
        })}
      </div>

      <div style={{ margin: `0 ${t.padX}px 14px`, padding: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
        <BSEyebrow color={t.ACCENT}>Free to join - no upfront costs</BSEyebrow>
        <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontSize: 18, lineHeight: 1.35, color: t.INK }}>
          Set your own pricing, publish programs, sell sessions, and get reviewed by Shape before going live.
        </div>
      </div>

      <BSSection title={`Step ${step + 1} of ${APPLY_STEPS.length}`} meta={APPLY_STEPS[step]} />
      <div style={{ padding: `0 ${t.padX}px 12px`, display: 'flex', gap: 5 }}>
        {APPLY_STEPS.map((name, index) => (
          <div key={name} style={{ flex: 1, height: 4, background: index <= step ? t.ACCENT : t.HAIR }} />
        ))}
      </div>

      <div style={{ margin: `0 ${t.padX}px`, padding: 14, border: `1px solid ${t.RULE}`, background: t.PAPER }}>
        {body}
      </div>

      {error && (
        <div style={{ margin: `12px ${t.padX}px 0`, color: t.RED, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', lineHeight: 1.45 }}>
          {error}
        </div>
      )}

      <div style={{ padding: `16px ${t.padX}px 20px`, display: 'grid', gridTemplateColumns: '96px 1fr', gap: 8 }}>
        <button disabled={step === 0 || submitting} onClick={() => setStep(Math.max(0, step - 1))} style={{
          borderRadius: t.RADIUS_SM,
          border: `1px solid ${t.RULE}`,
          background: 'transparent',
          color: step === 0 ? t.INK30 : t.INK,
          fontFamily: t.MONO,
          fontSize: 9.5,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          fontWeight: 800,
        }}>Back</button>
        <button disabled={submitting} onClick={() => step === APPLY_STEPS.length - 1 ? submit() : setStep(step + 1)} style={{
          borderRadius: t.RADIUS_SM,
          border: `1px solid ${t.INK}`,
          background: t.INK,
          color: t.PAPER,
          fontFamily: t.MONO,
          fontSize: 10,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          fontWeight: 800,
          minHeight: 48,
          opacity: submitting ? 0.65 : 1,
        }}>{submitting ? 'Submitting...' : step === APPLY_STEPS.length - 1 ? 'Submit application' : 'Continue'}</button>
      </div>
    </BSPage>
  );
}

function BackButton({ onClick }) {
  const t = useBS();
  return (
    <button onClick={onClick} style={{
      borderRadius: t.RADIUS_SM,
      padding: '6px 12px',
      background: 'transparent',
      color: t.INK,
      border: `1px solid ${t.INK}`,
      cursor: 'pointer',
      fontFamily: t.MONO,
      fontSize: 9.5,
      letterSpacing: '0.2em',
      textTransform: 'uppercase',
      fontWeight: 700,
    }}>Back</button>
  );
}

Object.assign(window, { BSProviderApplicationScreen });
