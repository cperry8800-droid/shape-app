// THE HEALTH SCREENING (PAR-Q+, injuries, medications, emergency contact): the member's first-run gate
// after a yes to coaching, Settings → Health profile, and the screening before a coach checkout.
// Moved out of iosAppBroadsheetClient.jsx when its first-run gate was redrawn in the first-run look
// (owner, 2026-11-13), as BSIntegrationsPage and BSLeaderboard were. The client imports it and draws it
// in all three places; only the gate takes the first-run look.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. The client imports this file statically,
// so it evaluates before the chrome's BSPage, BSBackRow and the client's BSMeCorner are on window; a
// top-level read would capture undefined (React error #130). The component names them on its first line.
import React from 'react';
import { FR, FR_HEAD, FRScreen, FRHead, FRSeg, frButton, frTitle, frAccent, frSub } from './BSFirstRunKit.jsx';

const { useState } = React;

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

// ── HEALTH PROFILE (intake) — the health screening ───────────────────────────
// PAR-Q+ screening + injuries / medications / emergency contact. Stored in
// user_goals('health_profile'); a LINKED coach always sees it via
// get_client_health_profile — deliberately not share-gated (liability).
// Asked at first run of a member who wants personal coaching, and before any coach
// checkout of one who has not completed it (client-onboarding review, fix 2).
//
// ⚠ EVERY LINE IS TRANSLATED NOW (review M2: it was English in all 13 languages). The
// questions are keyed by a stable id; the condition chips STORE their English (coaches
// and the website read `conditionTags` as it was always written) and SHOW the
// member's language, the token/label split this file uses for every stored choice.
export const BS_PARQ = [
  { id: 'heart', en: 'Has a doctor ever said you have a heart condition and that you should only do activity recommended by a doctor?' },
  { id: 'chestActive', en: 'Do you feel pain in your chest when you do physical activity?' },
  { id: 'chestRest', en: 'In the past month, have you had chest pain while not doing physical activity?' },
  { id: 'dizzy', en: 'Do you lose your balance because of dizziness, or do you ever lose consciousness?' },
  { id: 'joint', en: 'Do you have a bone or joint problem that could be made worse by a change in your physical activity?' },
  { id: 'bpMeds', en: 'Is a doctor currently prescribing medication for your blood pressure or a heart condition?' },
  { id: 'other', en: 'Do you know of any other reason why you should not do physical activity?' },
];
// Common ongoing-condition quick-picks (free text still captures the rest). `en` is stored.
export const BS_CONDITION_TAGS = [
  { id: 'diabetes', en: 'Diabetes' },
  { id: 'highBp', en: 'High blood pressure' },
  { id: 'asthma', en: 'Asthma / respiratory' },
  { id: 'heart', en: 'Heart condition' },
  { id: 'thyroid', en: 'Thyroid' },
  { id: 'cholesterol', en: 'High cholesterol' },
  { id: 'mood', en: 'Anxiety / depression' },
  { id: 'arthritis', en: 'Arthritis / joint' },
  { id: 'pregnant', en: 'Pregnant / postpartum' },
];

// `purpose`: 'gate' (first run, required, no way out), 'settings' (Settings → Health profile)
// or 'hire' (before a coach checkout; Back cancels the checkout). Without one, `onBack`
// decides between the first two, as it always has.
export function BSHealthIntake({ onDone, onBack = null, initial = null, purpose = null }) {
  const { useBS, BSPage, BSBackRow, BSMeCorner, _bsScrollTopOnMount } = window;
  const BS_MAST_TOP_CSS = window.BS_MAST_TOP_CSS || 'max(56px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';
  const tBase = useBS();
  const tr = useShapeTr();
  const mode = purpose || (onBack ? 'settings' : 'gate');
  // ⚠ THE FIRST-RUN GATE IS DRAWN IN THE FIRST-RUN LOOK (owner, 2026-11-13: every screen from the welcome
  // to Home matches it), and only the gate: Settings → Health profile and the screening before a coach
  // checkout keep the app's paper. The gate reads the same tokens with the launch's fixed-dark values,
  // so every field below is the same code in both looks.
  const gate = mode === 'gate';
  const t = gate ? { ...tBase, isLight: false, INK: FR.ink, INK70: FR.ink2, INK50: FR.ink3, PAPER: FR.well, PAPER2: 'rgba(255,255,255,0.045)', RULE: FR.line2, HAIR: FR.line, DISPLAY: FR_HEAD, MONO: FR_HEAD } : tBase;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  _bsScrollTopOnMount();
  const [answers, setAnswers] = useState(() => (initial && Array.isArray(initial.parq) ? initial.parq : Array(BS_PARQ.length).fill(null)));
  const [injuries, setInjuries] = useState((initial && initial.injuries) || '');
  const [medications, setMedications] = useState((initial && initial.medications) || '');
  // Prescription meds — mandatory yes/no; default 'yes' for legacy docs that
  // already carry a medications free-text but no explicit flag.
  const [rxMeds, setRxMeds] = useState((initial && initial.rxMeds) || ((initial && initial.medications) ? 'yes' : null));
  // A GLP-1 medication (the coach-alerts plan, PR 2): its own yes/no, which the weight alerts read.
  const [glp1, setGlp1] = useState((initial && (initial.glp1 === 'yes' || initial.glp1 === 'no')) ? initial.glp1 : null);
  const [conditions, setConditions] = useState((initial && initial.conditions) || '');
  const [conditionTags, setConditionTags] = useState(() => (initial && Array.isArray(initial.conditionTags) ? initial.conditionTags : []));
  const [pregnancy, setPregnancy] = useState((initial && initial.pregnancy) || null);
  const [allergies, setAllergies] = useState((initial && initial.allergies) || null);
  const [allergyDetails, setAllergyDetails] = useState((initial && initial.allergyDetails) || '');
  const [emName, setEmName] = useState((initial && initial.emergency && initial.emergency.name) || '');
  const [emPhone, setEmPhone] = useState((initial && initial.emergency && initial.emergency.phone) || '');
  const [consent, setConsent] = useState(!!(initial && initial.consentAt));
  const [busy, setBusy] = useState(false);
  const allAnswered = answers.every((a) => a === true || a === false);
  // Mandatory: PAR-Q, the prescription-med screen (+ list when yes), pregnancy,
  // and the allergy screen (+ details when yes).
  const rxOk = rxMeds === 'no' || (rxMeds === 'yes' && medications.trim().length > 0);
  const allergyOk = allergies === 'no' || (allergies === 'yes' && allergyDetails.trim().length > 0);
  const screenComplete = allAnswered && rxMeds !== null && glp1 !== null && pregnancy !== null && allergies !== null && rxOk && allergyOk;
  const canSave = screenComplete && consent && !busy;
  const toggleTag = (tag) => setConditionTags((cur) => (cur.includes(tag) ? cur.filter((x) => x !== tag) : [...cur, tag]));
  const save = async () => {
    if (!canSave) return;
    setBusy(true);
    const doc = {
      parq: answers,
      flagged: answers.some((a) => a === true) || pregnancy === 'yes',
      injuries: injuries.trim() || null,
      rxMeds: rxMeds,
      medications: rxMeds === 'yes' ? (medications.trim() || null) : null,
      glp1: glp1,
      conditions: conditions.trim() || null,
      conditionTags: conditionTags,
      pregnancy: pregnancy,
      allergies: allergies,
      allergyDetails: allergies === 'yes' ? (allergyDetails.trim() || null) : null,
      emergency: { name: emName.trim() || null, phone: emPhone.trim() || null },
      consentAt: (initial && initial.consentAt) || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const ok = await window.ShapeHealthProfile?.set?.(doc);
    setBusy(false);
    if (ok) { window.__bsToast?.(tr('onboarding:health.saved', { defaultValue: 'Health profile saved' }), 'ok'); onDone(doc); }
    else window.__bsToast?.(tr('onboarding:firstRun.saveFailed', { defaultValue: 'Could not save. Check your connection and try again.' }), 'err');
  };
  // Full-bleed section bands — edge to edge, inner content keeps the page gutter.
  // The gate's sections are the first-run glass panels; the app's variants keep the full-bleed bands.
  const card = gate
    ? { margin: '0 10px 12px', padding: '16px', borderRadius: 24, border: `1px solid ${FR.glassEdge}`, background: FR.glass }
    : { borderTop: `1px solid ${t.RULE}`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2, padding: `14px ${t.padX}px`, marginBottom: 12 };
  // The gate's labels in the first-run face, normal case (the app's own variants keep the mono eyebrow).
  const lbl = gate
    ? { fontFamily: FR_HEAD, fontSize: 13.5, fontWeight: 600, color: FR.ink2, marginBottom: 8 }
    : { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 };
  const ta = { width: '100%', boxSizing: 'border-box', minHeight: 56, padding: '10px 12px', border: `1px solid ${t.RULE}`, background: t.PAPER, borderRadius: 8, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, outline: 'none', resize: 'vertical' };
  const field = { width: '100%', boxSizing: 'border-box', padding: '10px 12px', border: `1px solid ${t.RULE}`, background: t.PAPER, borderRadius: 8, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, outline: 'none' };
  const NO = tr('onboarding:health.no', { defaultValue: 'No' });
  const YES = tr('onboarding:health.yes', { defaultValue: 'Yes' });
  const NA = tr('onboarding:health.na', { defaultValue: 'N/A' });
  // Reusable yes/no(/n.a.) selector row — same look as the PAR-Q buttons.
  const YES_C = '#e2795f';
  // The gate answers in the first-run segmented control; the app's variants keep their paper buttons.
  const ynRow = (value, onPick, options) => (gate ? (
    <FRSeg value={value} onChange={onPick} options={options.map(([labelTxt, v]) => [v, labelTxt])} accent={(v) => (v === true ? YES_C : FR.teal)} />
  ) : (
    <div style={{ display: 'flex', gap: 8 }}>
      {options.map(([labelTxt, v, c]) => {
        const on = value === v;
        return <button key={v} type="button" onClick={() => onPick(v)} style={{ flex: 1, padding: '9px 0', borderRadius: 5, border: `1px solid ${on ? c : t.RULE}`, borderLeft: on ? `3px solid ${c}` : `1px solid ${t.RULE}`, background: on ? `${c}1c` : 'transparent', color: on ? c : t.INK70, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{labelTxt}</button>;
      })}
    </div>
  ));
  const eyebrow = mode === 'settings' ? tr('onboarding:health.eyebrowSettings', { defaultValue: 'Settings · Health profile' })
    : mode === 'hire' ? tr('onboarding:health.eyebrowHire', { defaultValue: 'Before you hire a coach' })
    : tr('onboarding:health.eyebrowGate', { defaultValue: 'One-time setup · Required' });
  const saveLabel = busy ? tr('onboarding:health.saving', { defaultValue: 'Saving…' })
    : mode === 'settings' ? tr('onboarding:health.saveSettings', { defaultValue: 'Save health profile' })
    : mode === 'hire' ? tr('onboarding:health.saveHire', { defaultValue: 'Save & continue →' })
    : tr('onboarding:health.saveGate', { defaultValue: 'Save and enter Shape' });
  const sections = (
        <div style={{ padding: '16px 0 28px' }}>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.parqLabel', { count: BS_PARQ.length, defaultValue: 'Health screening · answer all {count}' })}</div>
            {BS_PARQ.map((q, i) => (
              <div key={q.id} style={{ padding: '10px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK, lineHeight: 1.4 }}>{i + 1}. {tr(`onboarding:health.parq.${q.id}`, { defaultValue: q.en })}</div>
                {gate ? (
                  <div style={{ marginTop: 8 }}>
                    <FRSeg value={answers[i]} onChange={(v) => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} options={[[false, NO], [true, YES]]} accent={(v) => (v ? YES_C : FR.teal)} />
                  </div>
                ) : (
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  {[[NO, false, teal], [YES, true, t.RUST]].map(([labelTxt, v, c]) => {
                    const on = answers[i] === v;
                    return <button key={String(v)} onClick={() => setAnswers((a) => a.map((x, j) => (j === i ? v : x)))} style={{ flex: 1, padding: '9px 0', borderRadius: 5, border: `1px solid ${on ? c : t.RULE}`, borderLeft: on ? `3px solid ${c}` : `1px solid ${t.RULE}`, background: on ? `${c}1c` : 'transparent', color: on ? c : t.INK70, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{labelTxt}</button>;
                  })}
                </div>
                )}
              </div>
            ))}
            {answers.some((a) => a === true) && (
              <div style={{ marginTop: 10, padding: '10px 12px', borderRadius: 6, border: `1px solid ${t.RUST}55`, borderLeft: `3px solid ${t.RUST}`, background: `${t.RUST}10`, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, lineHeight: 1.45 }}>
                {tr('onboarding:health.flaggedNote', { defaultValue: 'You answered yes to a screening question — talk with your doctor before becoming much more physically active. Your coach will see this and program accordingly.' })}
              </div>
            )}
          </div>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.rxLabel', { defaultValue: 'Prescription medication · required' })}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK, lineHeight: 1.4, marginBottom: 8 }}>{tr('onboarding:health.rxQuestion', { defaultValue: 'Are you currently taking any prescription medication(s)?' })}</div>
            {ynRow(rxMeds, setRxMeds, [[NO, 'no', teal], [YES, 'yes', t.RUST]])}
            {rxMeds === 'yes' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...lbl, marginBottom: 5 }}>{tr('onboarding:health.rxList', { defaultValue: 'List your prescription medication(s)' })}</div>
                <textarea value={medications} onChange={(e) => setMedications(e.target.value)} placeholder={tr('onboarding:health.rxPlaceholder', { defaultValue: 'e.g. Lisinopril (blood pressure) · Levothyroxine (thyroid)' })} style={ta} />
              </div>
            )}
          </div>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.glp1Label', { defaultValue: 'GLP-1 medication · required' })}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK, lineHeight: 1.4, marginBottom: 8 }}>{tr('onboarding:health.glp1Question', { defaultValue: 'Are you taking a GLP-1 medication for weight or blood sugar, such as Ozempic, Wegovy, Mounjaro or Zepbound?' })}</div>
            {ynRow(glp1, setGlp1, [[NO, 'no', teal], [YES, 'yes', t.RUST]])}
            <div style={{ fontFamily: t.DISPLAY, fontSize: 12, color: t.INK50, lineHeight: 1.45, marginTop: 8 }}>{tr('onboarding:health.glp1Note', { defaultValue: 'Your coach uses this to keep your weight-loss pace and protein safe on the medication.' })}</div>
          </div>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.allergyLabel', { defaultValue: 'Allergies · required' })}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK, lineHeight: 1.4, marginBottom: 8 }}>{tr('onboarding:health.allergyQuestion', { defaultValue: 'Do you have any allergies (food, medication, or other)?' })}</div>
            {ynRow(allergies, setAllergies, [[NO, 'no', teal], [YES, 'yes', t.RUST]])}
            {allergies === 'yes' && (
              <div style={{ marginTop: 10 }}>
                <div style={{ ...lbl, marginBottom: 5 }}>{tr('onboarding:health.allergyList', { defaultValue: 'List your allergies' })}</div>
                <textarea value={allergyDetails} onChange={(e) => setAllergyDetails(e.target.value)} placeholder={tr('onboarding:health.allergyPlaceholder', { defaultValue: 'e.g. Peanuts (severe) · penicillin · shellfish' })} style={ta} />
              </div>
            )}
          </div>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.pregnancyLabel', { defaultValue: 'Pregnancy · required' })}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK, lineHeight: 1.4, marginBottom: 8 }}>{tr('onboarding:health.pregnancyQuestion', { defaultValue: 'Are you currently pregnant, or have you given birth in the past 6 months?' })}</div>
            {ynRow(pregnancy, setPregnancy, [[NO, 'no', teal], [YES, 'yes', t.RUST], [NA, 'na', t.INK50]])}
          </div>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.conditionsLabel', { defaultValue: 'Ongoing medical conditions · optional' })}</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginBottom: 10 }}>
              {BS_CONDITION_TAGS.map((tag) => {
                const on = conditionTags.includes(tag.en);
                return <button key={tag.id} type="button" onClick={() => toggleTag(tag.en)} style={gate
                  ? { minHeight: 40, padding: '8px 13px', borderRadius: 999, border: `1px solid ${on ? FR.teal : FR.line2}`, background: on ? FR.tealSoft : 'transparent', color: on ? FR.teal : FR.ink, cursor: 'pointer', fontFamily: FR_HEAD, fontSize: 14, fontWeight: 600 }
                  : { padding: '7px 11px', borderRadius: 999, border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}1c` : 'transparent', color: on ? teal : t.INK70, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{tr(`onboarding:health.tag.${tag.id}`, { defaultValue: tag.en })}</button>;
              })}
            </div>
            <div style={{ ...lbl, marginBottom: 5 }}>{tr('onboarding:health.conditionsMore', { defaultValue: 'Anything else your coach should know' })}</div>
            <textarea value={conditions} onChange={(e) => setConditions(e.target.value)} placeholder={tr('onboarding:health.conditionsPlaceholder', { defaultValue: 'e.g. Type 2 diabetes — diet-managed · exercise-induced asthma' })} style={ta} />
          </div>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.injuriesLabel', { defaultValue: 'Injuries & surgeries · helps your coach program safely' })}</div>
            <textarea value={injuries} onChange={(e) => setInjuries(e.target.value)} placeholder={tr('onboarding:health.injuriesPlaceholder', { defaultValue: 'e.g. Left knee ACL repair 2022 · lower-back tightness' })} style={ta} />
          </div>
          <div style={card}>
            <div style={lbl}>{tr('onboarding:health.emergencyLabel', { defaultValue: 'Emergency contact' })}</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              <input value={emName} onChange={(e) => setEmName(e.target.value)} placeholder={tr('onboarding:health.emergencyName', { defaultValue: 'Name' })} style={field} />
              <input value={emPhone} onChange={(e) => setEmPhone(e.target.value)} placeholder={tr('onboarding:health.emergencyPhone', { defaultValue: 'Phone' })} style={field} />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: 10, margin: `0 ${t.padX}px 14px`, cursor: 'pointer' }}>
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, lineHeight: 1.45 }}>
              {tr('onboarding:health.consent', { defaultValue: 'I confirm these answers are accurate, and I understand they are shared with coaches I hire on Shape for my safety.' })}
            </span>
          </label>
          <button onClick={save} disabled={!canSave} style={gate ? frButton('primary', { display: 'block', width: 'calc(100% - 20px)', margin: '0 10px', opacity: canSave ? 1 : 0.45, cursor: canSave ? 'pointer' : 'default' }) : { display: 'block', width: `calc(100% - ${t.padX * 2}px)`, margin: `0 ${t.padX}px`, padding: '15px', borderRadius: 5, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)', border: 0, background: canSave ? teal : t.RULE, color: canSave ? '#04201d' : t.INK50, cursor: canSave ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{saveLabel}</button>
          {!screenComplete && <div style={gate ? { marginTop: 10, padding: '0 24px', textAlign: 'center', fontFamily: FR_HEAD, fontSize: 13.5, lineHeight: 1.4, color: FR.ink3 } : { marginTop: 8, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('onboarding:health.incomplete', { defaultValue: 'Answer all required screening questions to continue' })}</div>}
        </div>
  );
  if (gate) {
    return (
      <FRScreen dataAttr={{ 'data-fr-health': '' }}>
        <FRHead>
          <h1 style={frTitle(32)}>{tr('onboarding:health.titlePre', { defaultValue: 'Your health' })} <span style={frAccent}>{tr('onboarding:health.titleAccent', { defaultValue: 'profile.' })}</span></h1>
          <p style={frSub}>{tr('onboarding:health.intro', { defaultValue: 'A quick safety screen (PAR-Q) before training starts. It lives on your profile and is shared with the coaches you hire — so they can program safely around your history.' })}</p>
        </FRHead>
        {sections}
      </FRScreen>
    );
  }
  return (
    <BSPage>
      {/* ⚠ Corners only in the Settings variant. This component is the required
          first-run gate, Settings → Health profile, and the screening before a coach
          checkout. BSClientAppInner returns the gate BEFORE the showSettings branch
          and before searchOverlay, and the checkout's screening sits over both — so
          from there ⌕ and the avatar set shell state that nothing can render, while
          each still pushes a nav entry the next back eats. A required step must not
          offer an exit, least of all a dead one. The mast row stays either way. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        {window.BSMastRow && <window.BSMastRow trailing={mode === 'settings' ? <BSMeCorner /> : null} />}
      </div>
      <div style={{ padding: `${onBack ? 0 : 12}px ${t.padX}px 0` }}>
        {/* ← Back on the left where every page keeps it, the eyebrow on the right (it was the other
            way round). The required gate has no Back: the eyebrow stands alone. */}
        {onBack
          ? <BSBackRow onBack={onBack} label={String(tr('onboarding:health.back', { defaultValue: '← Back' })).replace(/^\s*←\s*/, '')} trailing={<span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>{eyebrow}</span>} />
          : <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>{eyebrow}</span>}
        <h1 style={{ margin: '10px 0 0', fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: t.INK }}>{tr('onboarding:health.titlePre', { defaultValue: 'Your health' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('onboarding:health.titleAccent', { defaultValue: 'profile.' })}</span></h1>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.5 }}>
          {mode === 'hire'
            ? tr('onboarding:health.introHire', { defaultValue: 'Before you hire a coach, a quick safety screen (PAR-Q). It is shared with the coaches you hire, so they can program safely around your history, and checkout carries on once it is saved.' })
            : tr('onboarding:health.intro', { defaultValue: 'A quick safety screen (PAR-Q) before training starts. It lives on your profile and is shared with the coaches you hire — so they can program safely around your history.' })}
        </div>
      </div>
      {sections}
    </BSPage>
  );
}
