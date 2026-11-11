import React from 'react';
import { createPortal } from 'react-dom';
import { BS_CLEAN_HEAD, BS_CLEAN_SANS, BSCleanType, useBSClean } from './bsCleanType.jsx';
import {
  APPLICATION_FILE_ACCEPT,
  APPLICATION_FILE_KINDS,
  PROVIDER_APPLICATION_SEND_FAILED,
  PROVIDER_EXPERIENCE_OPTIONS,
  EXPERIENCE_STANDARD_YEARS,
  applicationFilesProblem,
  belowExperienceStandard,
  experienceProblem,
  experienceYears,
} from '../config/providerApplications.js';
// The shared 18+ derivation (anywhere-on-Earth rule) used by every gate + signup.
import { isMinorFromDob } from '../../../src/lib/age-derive.mjs';
// ⚠ IMPORT THE ROUTE'S OWN RULE, DO NOT RE-TYPE IT. /api/apply refuses a
// nutritionist application unless attestationsComplete() passes, so this surface
// renders a control for every key in REQUIRED_ATTESTATIONS and validates with the
// same function. If that list grows, the app grows a control instead of silently
// posting an application the route will refuse.
import { REQUIRED_ATTESTATIONS, attestationsComplete } from '../../../src/lib/compliance/nutrition.mjs';

// ─── THE COACH APPLICATION ───────────────────────────────────────────────────────────────────────
// Owner, 2026-11-09: "Option A: short steps", with Nora offered as a second way through it. Seven short
// steps (Role · You · Credentials · Documents · Specialty · Rates · Review) in place of four long ones,
// in the newer coach pages' clean type (Geist heads, Inter Tight words) on the app's own paper, light or
// dark. Each step is checked before Continue: the message sits under the field at fault, which takes a
// red edge and the focus. Send checks every step again and goes to the first that fails; the route's own
// words for a refusal show on Review.
//   · The role is picked on the first step (it could not be changed before), and a nutritionist says
//     whether they are a dietitian there.
//   · A DRAFT is kept while they type: on this device under their account when signed in
//     (`shape.applyDraft.<uid>`, 30 days), for this session only when signed out. The values, never a
//     file and never an agreement or attestation tick. It comes back on the next open with "Draft
//     restored · Start over", and goes once the application is sent.
//   · NORA: the first step offers her ("Fill it in with Nora"), which opens her sheet with a starter line
//     in her composer. Her fill card writes through window.shapeNoraForm (the rules in
//     src/lib/ai/noraForms.mjs): listed fields only, never a document, an agreement, an attestation or a
//     license row, and never the send. A step holding values she filled says so.
//   · After the send: where it stands (Submitted, now · In review · Background check · Decision).
// In the member app the screen covers the whole phone surface, the tab bar included (portalled into
// #bs-phone-surface above the nav, under Nora's sheet). On the sign-in route it stays where Main draws
// it, under Main's own "Ask Nora" door, so it does not portal.
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP: this module loads before the client
// module (coach-cold-start), so window.bsAskNora and the chrome are read when used.

const { useState, useEffect, useRef, useLayoutEffect } = React;

function useShapeTr() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    if (v != null && v !== key) return v;
    // No catalog in reach (a harness): the English, with its simple {name} slots filled.
    const d = opts?.defaultValue ?? key;
    return typeof d === 'string' ? d.replace(/\{(\w+)\}/g, (m, k) => (opts && opts[k] != null ? String(opts[k]) : m)) : d;
  };
}

const AP_STEPS = ['role', 'you', 'credentials', 'documents', 'specialty', 'rates', 'review'];
const AP_REVIEW = AP_STEPS.length - 1;
// Nora's list for this screen (src/lib/ai/noraForms.mjs) files its fields in four steps; the bridge tells
// her the one of those each of these seven sits in, and the screen's own step name beside it.
const AP_NORA_STEP = { role: 0, you: 0, credentials: 1, documents: 1, specialty: 2, rates: 3, review: 3 };
// The values each step holds: Review's summary, the "Filled by Nora" note and the draft read it.
const AP_STEP_KEYS = {
  role: ['nutritionType'],
  you: ['firstName', 'lastName', 'email', 'phone', 'dob', 'city', 'tz', 'social', 'bio'],
  credentials: ['cert', 'certExp', 'edu', 'years', 'insurance', 'experienceHistory', 'experienceType', 'experienceNotes', 'prev', 'cdrId', 'rdCredential', 'licenses', 'insCarrier', 'insPolicy', 'insExpires'],
  documents: [],
  specialty: ['primary', 'secondary', 'populations', 'style'],
  rates: ['maxClients', 'accepting', 'oneOnOne', 'response', 'subPrice', 'sessionPrice', 'intro'],
  review: [],
};
const AP_DRAFT_KEYS = Object.values(AP_STEP_KEYS).flat();
// Never kept in a draft: each tick is theirs to give again (the agreements, the verification box, the
// attestations). Files are never in `values` at all.
const AP_DRAFT_SKIP = ['verify', 'tos', 'conduct', 'bgcheck', 'attest'];
const AP_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// The stages an open application can stand at, in order (src/lib/application-status.mjs).
const AP_OPEN_STAGES = ['submitted', 'in_review', 'background_check'];

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

// The website's professional type, under the same key and wording (signup.jsx), so a
// dietitian can say so here too and not only by arriving from a dietitian link.
const AP_NUTRITION_TYPES = ['Nutritionist', 'Dietitian (RD / RDN)'];
const AP_EMPTY_LICENSE = { state: '', number: '', expires: '' };

const TRAINER_POPULATIONS = ['Beginners', 'Women 30-50', 'Men 40+', 'Postnatal', 'Athletes', 'Seniors', 'Rehab', 'Youth'];
const NUTRITION_POPULATIONS = ['Endurance athletes', 'Strength athletes', 'Weight loss', 'Clinical conditions', 'Plant-based', 'Postnatal', 'Youth'];

// ⚠ THE VALUES ARE WHAT THE ROUTE AND THE REVIEWER READ, IN ENGLISH, IN EVERY LANGUAGE. Only the words
// a person sees are translated: each list keeps its English values and shows the label for each.
const apSpecWords = (tr) => ({
  'Strength & Powerlifting': tr('onboarding:apply.spec.strength', { defaultValue: 'Strength & Powerlifting' }),
  'HIIT & Fat Loss': tr('onboarding:apply.spec.hiit', { defaultValue: 'HIIT & Fat Loss' }),
  'At-home Workouts': tr('onboarding:apply.spec.atHome', { defaultValue: 'At-home Workouts' }),
  'Cardio & Endurance': tr('onboarding:apply.spec.cardio', { defaultValue: 'Cardio & Endurance' }),
  Marathon: tr('onboarding:apply.spec.marathon', { defaultValue: 'Marathon' }),
  Ultra: tr('onboarding:apply.spec.ultra', { defaultValue: 'Ultra' }),
  'Functional Fitness': tr('onboarding:apply.spec.functional', { defaultValue: 'Functional Fitness' }),
  Bodybuilding: tr('onboarding:apply.spec.bodybuilding', { defaultValue: 'Bodybuilding' }),
  'Sports Performance': tr('onboarding:apply.spec.sports', { defaultValue: 'Sports Performance' }),
  Mobility: tr('onboarding:apply.spec.mobility', { defaultValue: 'Mobility' }),
  'Run coaching': tr('onboarding:apply.spec.run', { defaultValue: 'Run coaching' }),
  'Weight management': tr('onboarding:apply.spec.weight', { defaultValue: 'Weight management' }),
  'Sports nutrition': tr('onboarding:apply.spec.sportsNutrition', { defaultValue: 'Sports nutrition' }),
  'Plant-based': tr('onboarding:apply.spec.plantBased', { defaultValue: 'Plant-based' }),
  'Gut health': tr('onboarding:apply.spec.gut', { defaultValue: 'Gut health' }),
  'Hormonal health': tr('onboarding:apply.spec.hormonal', { defaultValue: 'Hormonal health' }),
  'Pre/postnatal': tr('onboarding:apply.spec.prePostnatal', { defaultValue: 'Pre/postnatal' }),
  'Endurance fueling': tr('onboarding:apply.spec.fueling', { defaultValue: 'Endurance fueling' }),
  'Clinical / medical': tr('onboarding:apply.spec.clinical', { defaultValue: 'Clinical / medical' }),
  'Meal prep': tr('onboarding:apply.spec.mealPrep', { defaultValue: 'Meal prep' }),
});
const apPopWords = (tr) => ({
  Beginners: tr('onboarding:apply.pop.beginners', { defaultValue: 'Beginners' }),
  'Women 30-50': tr('onboarding:apply.pop.women', { defaultValue: 'Women 30-50' }),
  'Men 40+': tr('onboarding:apply.pop.men', { defaultValue: 'Men 40+' }),
  Postnatal: tr('onboarding:apply.pop.postnatal', { defaultValue: 'Postnatal' }),
  Athletes: tr('onboarding:apply.pop.athletes', { defaultValue: 'Athletes' }),
  Seniors: tr('onboarding:apply.pop.seniors', { defaultValue: 'Seniors' }),
  Rehab: tr('onboarding:apply.pop.rehab', { defaultValue: 'Rehab' }),
  Youth: tr('onboarding:apply.pop.youth', { defaultValue: 'Youth' }),
  'Endurance athletes': tr('onboarding:apply.pop.endurance', { defaultValue: 'Endurance athletes' }),
  'Strength athletes': tr('onboarding:apply.pop.strength', { defaultValue: 'Strength athletes' }),
  'Weight loss': tr('onboarding:apply.pop.weightLoss', { defaultValue: 'Weight loss' }),
  'Clinical conditions': tr('onboarding:apply.pop.clinical', { defaultValue: 'Clinical conditions' }),
  'Plant-based': tr('onboarding:apply.pop.plantBased', { defaultValue: 'Plant-based' }),
});
const apChoiceWords = (tr) => ({
  Yes: tr('onboarding:apply.opt.yes', { defaultValue: 'Yes' }),
  No: tr('onboarding:apply.opt.no', { defaultValue: 'No' }),
  'In progress': tr('onboarding:apply.opt.inProgress', { defaultValue: 'In progress' }),
  Waitlist: tr('onboarding:apply.opt.waitlist', { defaultValue: 'Waitlist' }),
  'Not yet': tr('onboarding:apply.opt.notYet', { defaultValue: 'Not yet' }),
  'Within 12 hours': tr('onboarding:apply.opt.within12', { defaultValue: 'Within 12 hours' }),
  'Within 24 hours': tr('onboarding:apply.opt.within24', { defaultValue: 'Within 24 hours' }),
  'Within 48 hours': tr('onboarding:apply.opt.within48', { defaultValue: 'Within 48 hours' }),
  '15-minute free intro': tr('onboarding:apply.opt.intro15', { defaultValue: '15-minute free intro' }),
  '30-minute free intro': tr('onboarding:apply.opt.intro30', { defaultValue: '30-minute free intro' }),
  'No free intro': tr('onboarding:apply.opt.introNone', { defaultValue: 'No free intro' }),
  'Less than 1 year': tr('onboarding:apply.opt.yearsUnder1', { defaultValue: 'Less than 1 year' }),
  '1-2 years': tr('onboarding:apply.opt.years1to2', { defaultValue: '1-2 years' }),
  '3-4 years': tr('onboarding:apply.opt.years3to4', { defaultValue: '3-4 years' }),
  '5-7 years': tr('onboarding:apply.opt.years5to7', { defaultValue: '5-7 years' }),
  '7-10 years': tr('onboarding:apply.opt.years7to10', { defaultValue: '7-10 years' }),
  '10-15 years': tr('onboarding:apply.opt.years10to15', { defaultValue: '10-15 years' }),
  '15+ years': tr('onboarding:apply.opt.years15plus', { defaultValue: '15+ years' }),
  Nutritionist: tr('onboarding:apply.opt.nutritionist', { defaultValue: 'Nutritionist' }),
  'Dietitian (RD / RDN)': tr('onboarding:apply.opt.dietitian', { defaultValue: 'Dietitian (RD / RDN)' }),
});
// The document categories' words; the categories and their limits are the shared rules
// (src/lib/application-files.mjs), whose English stands in for a kind with no words here.
const apDocWords = (tr) => ({
  resume: [tr('onboarding:apply.docs.resume', { defaultValue: 'Resume / CV' }), tr('onboarding:apply.docs.resumeHelp', { defaultValue: 'Your current resume or CV.' })],
  cv_materials: [tr('onboarding:apply.docs.cv', { defaultValue: 'Other CV materials' }), tr('onboarding:apply.docs.cvHelp', { defaultValue: 'Cover letter, portfolio, references, transcripts.' })],
  credential: [tr('onboarding:apply.docs.credential', { defaultValue: 'Certifications and certificates' }), tr('onboarding:apply.docs.credentialHelp', { defaultValue: 'Each certification you hold (NASM, ACE, CSCS, CPR/AED…) and certificates of completion.' })],
  designation: [tr('onboarding:apply.docs.designation', { defaultValue: 'Designations and supporting paperwork' }), tr('onboarding:apply.docs.designationHelp', { defaultValue: 'Registration and license cards (RD/RDN, CDR, state licenses), degree certificates, CEU records.' })],
  insurance: [tr('onboarding:apply.docs.insurance', { defaultValue: 'Insurance' }), tr('onboarding:apply.docs.insuranceHelp', { defaultValue: 'Your liability insurance certificate.' })],
});
// Copy for each attestation key. The KEYS come from the shared module (above) so they cannot drift from
// what the route validates; only the wording lives here. A key with no copy still renders, labelled by
// its key, rather than going missing.
const apAttestWords = (tr) => ({
  independent_contractor: tr('onboarding:apply.attest.contractor', { defaultValue: 'I am an independent contractor. Shape is a marketplace, not my employer, and does not direct my clinical judgment.' }),
  maintains_licensure: tr('onboarding:apply.attest.licensure', { defaultValue: 'I will maintain valid licensure in every state where I provide individualized nutrition care, and only accept clients I am licensed to serve.' }),
  maintains_insurance: tr('onboarding:apply.attest.insurance', { defaultValue: 'I maintain current professional liability (malpractice) insurance.' }),
  scope_understood: tr('onboarding:apply.attest.scope', { defaultValue: 'I understand the difference between general wellness guidance and individualized medical nutrition therapy, and will practice within my scope and license.' }),
});

// The shared file rules answer in English; each answer is said in their language when it is one of
// the rules' known sentences, and as the rules wrote it otherwise.
function apFilesProblemWords(tr, msg, kindWord) {
  let m;
  if ((m = /^Attach at most (\d+) files to one application\.$/.exec(msg))) return tr('onboarding:apply.err.fileCount', { defaultValue: 'Attach at most {max} files to one application.', max: m[1] });
  if ((m = /^Attach at most (\d+) files under (.+)\.$/.exec(msg))) return tr('onboarding:apply.err.fileKind', { defaultValue: 'Attach at most {max} files under {label}.', max: m[1], label: kindWord(m[2]) });
  if ((m = /^(.+) is empty\.$/.exec(msg))) return tr('onboarding:apply.err.fileEmpty', { defaultValue: '{name} is empty.', name: m[1] });
  if ((m = /^(.+) is ([\d.]+) MB; each file can be up to 10 MB\.$/.exec(msg))) return tr('onboarding:apply.err.fileBig', { defaultValue: '{name} is {size} MB; each file can be up to 10 MB.', name: m[1], size: m[2] });
  if ((m = /^(.+) must be a PDF, DOC, DOCX, PNG, JPEG or WebP file\.$/.exec(msg))) return tr('onboarding:apply.err.fileType', { defaultValue: '{name} must be a PDF, DOC, DOCX, PNG, JPEG or WebP file.', name: m[1] });
  if ((m = /^Your files add up to ([\d.]+) MB; one application can carry up to 75 MB\.$/.exec(msg))) return tr('onboarding:apply.err.fileTotal', { defaultValue: 'Your files add up to {size} MB; one application can carry up to 75 MB.', size: m[1] });
  return msg;
}

// ── Colour ──────────────────────────────────────────────────────────────────────────────────────

const inkA = (t, a) => `rgba(${t.inkRGB || (t.isLight ? '20,18,15' : '242,237,228')},${a})`;
// The primary button and the progress (the coach pages' teal), and teal words at AA on either paper.
const apTeal = (t) => (t.isLight ? '#0a7a72' : '#34d6c5');
const apOnTeal = (t) => (t.isLight ? '#ffffff' : '#05201d');
const apTealText = (t) => (t.isLight ? '#07706a' : '#34d6c5');
const apRed = (t) => (t.isLight ? '#b3261e' : '#ff9b7a');
const apAmber = (t) => (t.isLight ? '#7a5205' : '#eec56f');
const apAmberBg = (t) => (t.isLight ? 'rgba(201,138,18,0.14)' : 'rgba(245,189,79,0.16)');
const apPadX = (t) => (t && typeof t.padX === 'number' ? t.padX : 22);

// Focus, placeholders and the native date and select controls, in one sheet. Nothing moves under
// reduced motion.
const AP_CSS = `
[data-provider-apply] button, [data-provider-apply] input, [data-provider-apply] select, [data-provider-apply] textarea { -webkit-tap-highlight-color: transparent; }
[data-provider-apply] input::placeholder, [data-provider-apply] textarea::placeholder { color: var(--ap-ph); opacity: 1; }
[data-provider-apply] [data-ap-box]:not([data-ap-bad]):focus-within { border-color: var(--ap-teal) !important; }
[data-provider-apply] button:focus-visible { outline: 2px solid var(--ap-teal); outline-offset: 2px; }
[data-provider-apply] input[type=date] { -webkit-appearance: none; appearance: none; min-height: 24px; text-align: left; }
[data-provider-apply] input[type=date]::-webkit-date-and-time-value { text-align: left; }
[data-provider-apply] input[type=date]::-webkit-calendar-picker-indicator { opacity: 0.55; }
[data-provider-apply] select { -webkit-appearance: none; appearance: none; }
[data-provider-apply] input[type=number]::-webkit-inner-spin-button, [data-provider-apply] input[type=number]::-webkit-outer-spin-button { -webkit-appearance: none; margin: 0; }
@keyframes ap-in { from { opacity: 0; transform: translateY(6px); } }
@media (prefers-reduced-motion: reduce) { [data-provider-apply] *, [data-provider-apply] *::before, [data-provider-apply] *::after { animation: none !important; transition: none !important; } }
`;

// ── Storage (every access wrapped: a private window or blocked storage reads as no draft) ─────────────

function apUid() {
  try {
    const a = window.ShapeAuth?.getCachedState?.();
    return (a && a.user && a.user.id) || null;
  } catch (e) { return null; }
}
function apZone() {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch (e) { return ''; }
}
// The values a draft keeps, each in the shape the screen holds it: the two chip lists as lists of words,
// the license rows as rows, every other answer as words. Anything else (an old key, a hand-edited value)
// is left out rather than handed to a field that cannot hold it.
function apDraftValues(values) {
  const out = {};
  for (const k of AP_DRAFT_KEYS) {
    const v = values[k];
    if (AP_DRAFT_SKIP.includes(k) || v == null) continue;
    if (k === 'secondary' || k === 'populations') {
      if (Array.isArray(v)) out[k] = v.filter((x) => typeof x === 'string');
    } else if (k === 'licenses') {
      if (Array.isArray(v)) out[k] = v.filter((l) => l && typeof l === 'object').map((l) => ({ state: String(l.state || ''), number: String(l.number || ''), expires: String(l.expires || '') }));
    } else if (typeof v === 'string' || typeof v === 'number') {
      out[k] = String(v);
    }
  }
  return out;
}
// ⚠ WHERE A DRAFT IS KEPT (Codex on #2667): a signed-in applicant's on the device under their own account
// (localStorage, shape.applyDraft.<uid>), for 30 days; a signed-out one's for this session only
// (sessionStorage). One device-wide "anon" draft handed a previous applicant's name, email, date of
// birth and licence details to the next signed-out person on a shared phone or browser.
const AP_DRAFT_TTL = 30 * 86400000;
const AP_ANON_KEY = 'shape.applyDraft.anon';
function apDraftStore(signedIn) {
  try { return signedIn ? window.localStorage : window.sessionStorage; } catch (e) { return null; }
}
function apReadDraft(store, key) {
  try {
    const raw = store && store.getItem(key);
    if (!raw) return null;
    const d = JSON.parse(raw);
    if (!d || typeof d !== 'object' || !d.values || typeof d.values !== 'object') return null;
    if (!(Number(d.at) > 0) || Date.now() - Number(d.at) > AP_DRAFT_TTL) { store.removeItem(key); return null; }
    return { ...d, values: apDraftValues(d.values) };
  } catch (e) { return null; }
}
function apWriteDraft(store, key, draft) {
  try { if (!store) return false; store.setItem(key, JSON.stringify(draft)); return true; } catch (e) { return false; }
}
function apClearDraft(store, key) {
  try { if (store) store.removeItem(key); } catch (e) { /* nothing kept, nothing to clear */ }
}

function apFreshValues(dietitian, fromAccount) {
  let firstName = '';
  let lastName = '';
  let email = '';
  if (fromAccount) {
    const auth = window.ShapeAuth?.getCachedState?.() || {};
    const name = auth.profile?.full_name || '';
    const [first, ...rest] = name.split(' ');
    firstName = first || '';
    lastName = rest.join(' ');
    email = auth.user?.email || auth.profile?.email || '';
  }
  return {
    firstName,
    lastName,
    email,
    // The zone this phone is in, until they say another.
    tz: apZone(),
    // No default: the list starts below the standard, so a shown default would answer for them.
    years: '',
    insurance: 'Yes',
    accepting: 'Yes',
    oneOnOne: 'Yes',
    response: 'Within 24 hours',
    intro: '15-minute free intro',
    nutritionType: AP_NUTRITION_TYPES[dietitian ? 1 : 0],
    rdCredential: 'rd',
  };
}

// In the member app the tab bar draws over a page; the application covers it (and the masthead), as
// the app's other takeovers do. The sign-in route has no tab bar, and keeps Main's Ask Nora door above.
function apTakeoverHost() {
  if (typeof document === 'undefined') return null;
  const surface = document.getElementById('bs-phone-surface');
  return surface && surface.querySelector('[data-bs-tabbar], [data-bs-tabbar-dock]') ? surface : null;
}

const apStr = (v) => String(v ?? '').trim();

// ── Pieces ───────────────────────────────────────────────────────────────────────────────────────

const apLabelStyle = (t, bad) => ({ fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 600, lineHeight: 1.3, color: bad ? apRed(t) : t.INK70 });
const apBoxStyle = (t, bad) => ({
  display: 'flex', alignItems: 'center', gap: 8, boxSizing: 'border-box', width: '100%', minWidth: 0, minHeight: 48,
  padding: '0 14px', borderRadius: 12, position: 'relative',
  border: `1px solid ${bad ? apRed(t) : inkA(t, t.isLight ? 0.16 : 0.13)}`,
  background: t.isLight ? 'rgba(255,255,255,0.72)' : inkA(t, 0.05),
  transition: 'border-color 160ms ease',
});
const apInputStyle = (t) => ({
  flex: 1, minWidth: 0, width: '100%', border: 0, outline: 'none', background: 'transparent', color: t.INK,
  fontFamily: BS_CLEAN_SANS, fontSize: 16, fontWeight: 500, lineHeight: 1.35, padding: '12px 0', margin: 0, caretColor: apTeal(t),
});
const apPair = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(132px, 1fr))', gap: 12 };

function ApError({ t, id, children }) {
  return <span id={id} role="alert" style={{ fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 500, lineHeight: 1.35, color: apRed(t) }}>{children}</span>;
}

// A text field: its label above, a quiet rounded box, and the message under it when it is at fault.
function ApText({ t, fieldKey, label, value, onChange, error, type = 'text', placeholder, multiline = false, inputMode, autoComplete, prefix, maxLength }) {
  const errId = error ? `ap-err-${fieldKey}` : undefined;
  const common = {
    value: value || '',
    onChange: (e) => onChange(e.target.value),
    placeholder: placeholder || undefined,
    'aria-invalid': error ? 'true' : undefined,
    'aria-describedby': errId,
    autoComplete,
    maxLength,
  };
  return (
    <label data-apply-field={fieldKey} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={apLabelStyle(t, !!error)}>{label}</span>
      <span data-ap-box="" data-ap-bad={error ? '' : undefined} style={{ ...apBoxStyle(t, !!error), ...(multiline ? { alignItems: 'stretch' } : null) }}>
        {prefix ? <span aria-hidden="true" style={{ flex: 'none', fontFamily: BS_CLEAN_SANS, fontSize: 16, fontWeight: 600, color: t.INK50 }}>{prefix}</span> : null}
        {multiline
          ? <textarea {...common} rows={4} style={{ ...apInputStyle(t), resize: 'vertical', minHeight: 96 }} />
          : <input {...common} type={type} inputMode={inputMode} style={apInputStyle(t)} />}
      </span>
      {error ? <ApError t={t} id={errId}>{error}</ApError> : null}
    </label>
  );
}

// A long list: the native picker (a phone's own wheel), its labels translated and its values English.
function ApSelect({ t, fieldKey, label, value, onChange, options, labelOf, placeholder, error }) {
  const errId = error ? `ap-err-${fieldKey}` : undefined;
  return (
    <label data-apply-field={fieldKey} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span style={apLabelStyle(t, !!error)}>{label}</span>
      <span data-ap-box="" data-ap-bad={error ? '' : undefined} style={apBoxStyle(t, !!error)}>
        <select
          value={value || ''}
          onChange={(e) => onChange(e.target.value)}
          aria-invalid={error ? 'true' : undefined}
          aria-describedby={errId}
          style={{ ...apInputStyle(t), paddingRight: 22, cursor: 'pointer', color: value ? t.INK : t.INK50 }}
        >
          {placeholder ? <option value="" disabled>{placeholder}</option> : null}
          {options.map((opt) => <option key={opt} value={opt}>{labelOf ? labelOf(opt) : opt}</option>)}
        </select>
        <span aria-hidden="true" style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', fontSize: 13, color: t.INK50 }}>⌄</span>
      </span>
      {error ? <ApError t={t} id={errId}>{error}</ApError> : null}
    </label>
  );
}

// Two or three short answers side by side; the picked one is filled with the ink.
function ApSeg({ t, fieldKey, label, value, onChange, options, labelOf }) {
  return (
    <div data-apply-field={fieldKey} style={{ display: 'grid', gap: 6, minWidth: 0 }}>
      <span id={`ap-lbl-${fieldKey}`} style={apLabelStyle(t, false)}>{label}</span>
      <div role="radiogroup" aria-labelledby={`ap-lbl-${fieldKey}`} style={{ display: 'flex', gap: 3, padding: 3, borderRadius: 13, background: inkA(t, t.isLight ? 0.07 : 0.07) }}>
        {options.map((opt) => {
          const on = value === opt;
          return (
            <button key={opt} type="button" role="radio" aria-checked={on} onClick={() => onChange(opt)} style={{
              flex: '1 1 0', minWidth: 0, minHeight: 44, padding: '4px 6px', borderRadius: 10, border: 0, cursor: 'pointer',
              background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70,
              fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: on ? 650 : 550, lineHeight: 1.15, textAlign: 'center',
              boxShadow: on && t.isLight ? '0 1px 2px rgba(0,0,0,0.12)' : 'none', transition: 'background 160ms ease, color 160ms ease',
            }}>{labelOf ? labelOf(opt) : opt}</button>
          );
        })}
      </div>
    </div>
  );
}

// Several answers: rounded chips, a picked one teal with a tick.
function ApChips({ t, fieldKey, label, options, values = [], onToggle, labelOf }) {
  const teal = apTealText(t);
  return (
    <div data-apply-field={fieldKey} role="group" aria-labelledby={`ap-lbl-${fieldKey}`} style={{ display: 'grid', gap: 8, minWidth: 0 }}>
      <span id={`ap-lbl-${fieldKey}`} style={apLabelStyle(t, false)}>{label}</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {options.map((opt) => {
          const on = values.includes(opt);
          return (
            <button key={opt} type="button" aria-pressed={on} onClick={() => onToggle(opt)} style={{
              minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', maxWidth: '100%',
              border: `1px solid ${on ? teal : inkA(t, t.isLight ? 0.18 : 0.16)}`,
              background: on ? (t.isLight ? 'rgba(10,122,114,0.09)' : 'rgba(52,214,197,0.12)') : 'transparent',
              color: on ? teal : t.INK85 || t.INK, fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: on ? 650 : 550, lineHeight: 1.2,
              display: 'inline-flex', alignItems: 'center', gap: 6, textAlign: 'left',
            }}>{on ? <span aria-hidden="true">✓</span> : null}{labelOf ? labelOf(opt) : opt}</button>
          );
        })}
      </div>
    </div>
  );
}

// A tick box: the whole line is the target. At fault, the box takes the red edge and the message sits
// under the line.
function ApCheck({ t, fieldKey, checked, onChange, error, children }) {
  const teal = apTeal(t);
  const errId = error ? `ap-err-${fieldKey}` : undefined;
  return (
    <div data-apply-field={fieldKey} style={{ display: 'grid', gap: 4 }}>
      <button type="button" role="checkbox" aria-checked={!!checked} aria-invalid={error ? 'true' : undefined} aria-describedby={errId} onClick={() => onChange(!checked)} style={{
        display: 'grid', gridTemplateColumns: '22px 1fr', gap: 12, alignItems: 'start', width: '100%', minHeight: 44,
        padding: '10px 0', border: 0, background: 'transparent', color: t.INK, textAlign: 'left', cursor: 'pointer',
        fontFamily: BS_CLEAN_SANS, fontSize: 14.5, fontWeight: 500, lineHeight: 1.4,
      }}>
        <span aria-hidden="true" style={{
          width: 22, height: 22, boxSizing: 'border-box', borderRadius: 7, marginTop: -1,
          border: checked ? 0 : `1.5px solid ${error ? apRed(t) : inkA(t, 0.42)}`,
          background: checked ? teal : 'transparent', color: apOnTeal(t),
          display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 800, lineHeight: 1,
        }}>{checked ? '✓' : ''}</span>
        <span style={{ minWidth: 0 }}>{children}</span>
      </button>
      {error ? <span style={{ paddingLeft: 34 }}><ApError t={t} id={errId}>{error}</ApError></span> : null}
    </div>
  );
}

// A quiet line that says how the step works (the standard, the compliance rules).
function ApNote({ t, children, tone }) {
  const teal = tone === 'teal';
  return (
    <p style={{
      margin: 0, padding: '11px 13px', borderRadius: 12,
      background: teal ? (t.isLight ? 'rgba(10,122,114,0.07)' : 'rgba(52,214,197,0.08)') : inkA(t, t.isLight ? 0.045 : 0.05),
      fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: t.INK70, textWrap: 'pretty',
    }}>{children}</p>
  );
}

// One of the two roles, as a large choice.
function ApRoleCard({ t, on, onPick, title, sub }) {
  const teal = apTeal(t);
  return (
    <button type="button" role="radio" aria-checked={on} onClick={onPick} style={{
      display: 'flex', alignItems: 'center', gap: 14, width: '100%', minHeight: 72, padding: '14px 16px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
      border: `${on ? 1.5 : 1}px solid ${on ? teal : inkA(t, t.isLight ? 0.16 : 0.14)}`,
      background: on ? (t.isLight ? 'rgba(10,122,114,0.07)' : 'rgba(52,214,197,0.09)') : 'transparent',
      color: t.INK, transition: 'border-color 160ms ease, background 160ms ease',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: BS_CLEAN_HEAD, fontSize: 17, fontWeight: 700, letterSpacing: '-0.015em', lineHeight: 1.2 }}>{title}</span>
        <span style={{ display: 'block', marginTop: 3, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: t.INK70 }}>{sub}</span>
      </span>
      <span aria-hidden="true" style={{
        flex: 'none', width: 24, height: 24, boxSizing: 'border-box', borderRadius: 99, display: 'grid', placeItems: 'center',
        border: on ? 0 : `1.5px solid ${inkA(t, 0.35)}`, background: on ? teal : 'transparent', color: apOnTeal(t), fontSize: 13, fontWeight: 800,
      }}>{on ? '✓' : ''}</span>
    </button>
  );
}

// The second way through: Nora asks the questions and fills the form in; they check it all.
function ApNoraCard({ t, onAsk, hint }) {
  const tr = useShapeTr();
  const teal = apTealText(t);
  return (
    <div data-apply-nora="" style={{ marginTop: 6, padding: '15px 16px', borderRadius: 16, border: `1px solid ${inkA(t, t.isLight ? 0.14 : 0.12)}`, background: inkA(t, t.isLight ? 0.03 : 0.035) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: BS_CLEAN_HEAD, fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.01em', color: t.INK }}>
        <span aria-hidden="true" style={{ color: teal }}>✦</span>
        {tr('onboarding:apply.nora.title', { defaultValue: 'Prefer to talk it through?' })}
      </div>
      <p style={{ margin: '5px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: t.INK70 }}>
        {tr('onboarding:apply.nora.body', { defaultValue: 'Nora can ask you the questions and fill this in. You check everything before it is sent.' })}
      </p>
      <button type="button" data-apply-ask-nora="" onClick={onAsk} style={{
        marginTop: 12, minHeight: 44, padding: '0 18px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${teal}`, background: 'transparent', color: teal,
        fontFamily: BS_CLEAN_SANS, fontSize: 14.5, fontWeight: 650, display: 'inline-flex', alignItems: 'center', gap: 7,
      }}><span aria-hidden="true">✦</span>{tr('onboarding:apply.nora.button', { defaultValue: 'Fill it in with Nora' })}</button>
      {hint ? <p role="status" style={{ margin: '9px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: t.INK70 }}>{tr('onboarding:apply.nora.unavailable', { defaultValue: 'Nora couldn’t open just now. Try again in a moment.' })}</p> : null}
    </div>
  );
}

// "Filled by Nora · check it", on a step holding values her card filled in.
function ApNoraFilled({ t }) {
  const tr = useShapeTr();
  return (
    <p data-apply-nora-filled="" style={{ margin: 0, display: 'inline-flex', alignItems: 'center', gap: 6, alignSelf: 'start', padding: '5px 10px', borderRadius: 999, background: t.isLight ? 'rgba(10,122,114,0.09)' : 'rgba(52,214,197,0.12)', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 650, color: apTealText(t) }}>
      <span aria-hidden="true">✦</span>{tr('onboarding:apply.nora.filled', { defaultValue: 'Filled by Nora · check it' })}
    </p>
  );
}

// One picker per document category; each takes several files, and each chosen file can be taken
// off. The categories and their limits are the website's (src/lib/application-files.mjs).
function BSApplyDocuments({ t, docs, onChange, errorKind, error }) {
  const tr = useShapeTr();
  const words = apDocWords(tr);
  const teal = apTealText(t);
  const kb = (n) => (n >= 1024 * 1024 ? `${(n / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
  return (
    <div style={{ display: 'grid', gap: 10 }}>
      {APPLICATION_FILE_KINDS.map((k) => {
        const files = Array.isArray(docs[k.kind]) ? docs[k.kind] : [];
        const [label, help] = words[k.kind] || [k.label, k.help];
        const bad = errorKind === k.kind;
        return (
          <div key={k.kind} data-apply-field={`docs.${k.kind}`} style={{ display: 'grid', gap: 8, padding: '13px 14px', borderRadius: 14, border: `1px solid ${bad ? apRed(t) : inkA(t, t.isLight ? 0.14 : 0.12)}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 15, fontWeight: 650, color: t.INK, minWidth: 0 }}>{label}</span>
              {files.length ? <span style={{ flex: 'none', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 600, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{files.length}/{k.max}</span> : null}
            </div>
            <span style={{ fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 500, lineHeight: 1.4, color: t.INK70 }}>{help}</span>
            {files.map((file, i) => (
              <div key={`${file.name}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: 8, paddingLeft: 12, borderRadius: 10, background: inkA(t, t.isLight ? 0.05 : 0.06), fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, color: t.INK }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
                <span style={{ flex: 'none', color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{kb(file.size || 0)}</span>
                <button type="button" data-track="Remove file" aria-label={tr('onboarding:apply.docs.remove', { defaultValue: 'Remove {name}', name: file.name })} onClick={() => onChange(k.kind, files.filter((_, j) => j !== i))} style={{ flex: 'none', width: 44, height: 44, border: 0, background: 'transparent', color: t.INK70, fontSize: 18, cursor: 'pointer' }}>×</button>
              </div>
            ))}
            {files.length < k.max && (
              <label style={{ position: 'relative', justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px dashed ${inkA(t, 0.3)}`, color: teal, fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: 650, cursor: 'pointer' }}>
                {tr('onboarding:apply.docs.addFiles', { defaultValue: '＋ Add files' })}
                <input
                  type="file"
                  multiple
                  accept={APPLICATION_FILE_ACCEPT}
                  aria-label={tr('onboarding:apply.docs.add', { defaultValue: 'Add {label}', label })}
                  onChange={(event) => {
                    const picked = Array.from(event.target.files || []);
                    event.target.value = '';
                    if (picked.length) onChange(k.kind, [...files, ...picked].slice(0, k.max));
                  }}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', opacity: 0, cursor: 'pointer', fontSize: 0 }}
                />
              </label>
            )}
            {bad && error ? <ApError t={t} id={`ap-err-docs-${k.kind}`}>{error}</ApError> : null}
          </div>
        );
      })}
      {errorKind === 'docs' && error ? <ApError t={t} id="ap-err-docs">{error}</ApError> : null}
      <span style={{ fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 500, lineHeight: 1.4, color: t.INK50 }}>{tr('onboarding:apply.docs.limits', { defaultValue: 'PDF, DOC or image. Up to 10 MB a file and 75 MB in all.' })}</span>
    </div>
  );
}

// The ← in the masthead row's place (BS_BACK_SLOT_TOP_CSS): this screen draws no masthead, so the chrome's
// small ← sits at the masthead row's y on the gutter, as on the sign-in screens.
function apBackSlotTop() {
  return window.BS_BACK_SLOT_TOP_CSS || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px))';
}

// ═══════════════════════════════════════════════════════════════════════════════════════════════
function BSProviderApplicationScreen({ initialRole = 'trainer', onBack }) {
  const t = useBSClean();
  const tr = useShapeTr();
  // A dietitian (RD/RDN) applies on the NUTRITIONIST rails — the declaration
  // rides in details.nutrition_role for the reviewer (who assigns
  // profiles.role='dietitian' after credential review). Before this, an
  // initialRole of 'dietitian' silently coerced to the TRAINER application
  // and the RD/RDN flag never reached the apply route.
  const isDietitianApplicant = initialRole === 'dietitian';
  const startRole = initialRole === 'nutritionist' || isDietitianApplicant ? 'nutritionist' : 'trainer';
  const signedIn = !!apUid();
  const draftKey = signedIn ? `shape.applyDraft.${apUid()}` : AP_ANON_KEY;
  const draftStore = apDraftStore(signedIn);
  // The draft from the last time, read once as the screen opens. A device-wide signed-out draft an
  // earlier build kept in localStorage is cleared, never read.
  const [draft] = useState(() => {
    apClearDraft(apDraftStore(true), AP_ANON_KEY);
    return apReadDraft(draftStore, draftKey);
  });
  const [role, setRole] = useState(() => (draft && (draft.role === 'trainer' || draft.role === 'nutritionist') ? draft.role : startRole));
  const [step, setStep] = useState(() => (draft && Number.isInteger(draft.step) ? Math.max(0, Math.min(AP_REVIEW, draft.step)) : 0));
  const [values, setValues] = useState(() => {
    if (!draft) return apFreshValues(isDietitianApplicant, true);
    const merged = { ...apFreshValues(isDietitianApplicant, false), ...draft.values };
    if (!apStr(merged.tz)) merged.tz = apZone();
    return merged;
  });
  const [restored, setRestored] = useState(!!draft);
  const [noraKeys, setNoraKeys] = useState(() => (draft && Array.isArray(draft.nora) ? draft.nora.filter((k) => typeof k === 'string') : []));
  const [errors, setErrors] = useState({});
  const [focusKey, setFocusKey] = useState(null);
  const [fromReview, setFromReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [docs, setDocs] = useState({});
  const [noraHint, setNoraHint] = useState(false);
  const [host] = useState(apTakeoverHost);
  const scrollRef = useRef(null);
  // Something they typed or picked (or Nora filled): only then is there a draft worth keeping.
  const dirtyRef = useRef(false);
  const noraTimer = useRef(null);

  const isTrainer = role === 'trainer';
  // A dietitian is a nutritionist who says so: by arriving from a dietitian link (seeded above)
  // or by choosing it on the first step.
  const isDietitian = !isTrainer && /dietitian/i.test(values.nutritionType || '');
  const licenses = Array.isArray(values.licenses) && values.licenses.length ? values.licenses : [AP_EMPTY_LICENSE];
  const specialties = isTrainer ? TRAINER_SPECIALTIES : NUTRITION_SPECIALTIES;
  const populations = isTrainer ? TRAINER_POPULATIONS : NUTRITION_POPULATIONS;
  const name = AP_STEPS[step];
  const dropError = (key) => setErrors((prev) => {
    if (!(key in prev)) return prev;
    const next = { ...prev };
    delete next[key];
    return next;
  });
  const set = (key, value) => {
    dirtyRef.current = true;
    setValues((prev) => ({ ...prev, [key]: value }));
    dropError(key);
  };
  const toggle = (key, value) => {
    dirtyRef.current = true;
    setValues((prev) => {
      const current = prev[key] || [];
      return { ...prev, [key]: current.includes(value) ? current.filter((x) => x !== value) : [...current, value] };
    });
  };
  const setLicense = (index, patch) => set('licenses', licenses.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  const setAttest = (key, on) => {
    set('attest', { ...(values.attest || {}), [key]: on });
    dropError(`attest.${key}`);
  };
  // The role can change on the first step. The specialty answers are the role's own lists, so what
  // the other role's lists do not have goes with it.
  const pickRole = (next) => {
    if (next === role) return;
    dirtyRef.current = true;
    setRole(next);
    const specs = next === 'trainer' ? TRAINER_SPECIALTIES : NUTRITION_SPECIALTIES;
    const pops = next === 'trainer' ? TRAINER_POPULATIONS : NUTRITION_POPULATIONS;
    setValues((prev) => ({
      ...prev,
      primary: specs.includes(prev.primary) ? prev.primary : '',
      secondary: (prev.secondary || []).filter((x) => specs.includes(x)),
      populations: (prev.populations || []).filter((x) => pops.includes(x)),
    }));
  };

  // Nora fills the application in with them (the Ask Nora plan, step 5). She is told the
  // step and which fields hold something, never what they hold, and her card fills only
  // the fields src/lib/ai/noraForms.mjs lists for this screen. The documents, every
  // agreement box and the attestations stay theirs, and she never submits. Her list files the
  // fields in four steps: `step` is the one of those the screen's step sits in, `stepName` the
  // screen's own. The keys her card filled are kept, so each step says it holds her values.
  const noraApplyRef = React.useRef({});
  noraApplyRef.current = { step, values };
  const submitted = !!result;
  React.useEffect(() => {
    if (submitted) return undefined;
    const kind = isTrainer ? 'app_apply_trainer' : 'app_apply_nutritionist';
    const never = ['verify', 'tos', 'conduct', 'bgcheck', 'attest', 'licenses', 'docs', 'resumeFile', 'credentialFile', 'insuranceFile'];
    const bridge = {
      kind,
      state: () => {
        const v = noraApplyRef.current.values || {};
        const filled = Object.keys(v).filter((k) => !never.includes(k) && (Array.isArray(v[k]) ? v[k].length > 0 : v[k] !== '' && v[k] != null && v[k] !== false));
        const stepName = AP_STEPS[noraApplyRef.current.step || 0] || AP_STEPS[0];
        return { kind, step: AP_NORA_STEP[stepName], stepName, filled };
      },
      fill: (patch) => {
        const safe = {};
        Object.keys(patch || {}).forEach((k) => { if (!never.includes(k)) safe[k] = patch[k]; });
        if (!Object.keys(safe).length) return false;
        dirtyRef.current = true;
        setValues((prev) => ({ ...prev, ...safe }));
        setNoraKeys((prev) => [...new Set([...prev, ...Object.keys(safe)])]);
        setErrors((prev) => {
          const next = { ...prev };
          Object.keys(safe).forEach((k) => { delete next[k]; });
          return next;
        });
        return true;
      },
    };
    window.shapeNoraForm = bridge;
    return () => { if (window.shapeNoraForm === bridge) window.shapeNoraForm = null; };
  }, [isTrainer, submitted]);

  // ── The draft: kept half a second after the last change, and on the way out ──
  const snapshotRef = useRef(null);
  snapshotRef.current = () => ({ v: 1, role, step, values: apDraftValues(values), nora: noraKeys, at: Date.now() });
  const submittedRef = useRef(false);
  submittedRef.current = submitted;
  useEffect(() => {
    if (submitted || !dirtyRef.current) return undefined;
    const id = setTimeout(() => apWriteDraft(draftStore, draftKey, snapshotRef.current()), 500);
    return () => clearTimeout(id);
  }, [values, role, step, noraKeys, submitted, draftKey]);
  useEffect(() => () => {
    clearTimeout(noraTimer.current);
    if (dirtyRef.current && !submittedRef.current) apWriteDraft(draftStore, draftKey, snapshotRef.current());
  }, [draftKey]);
  const saveAndLeave = () => {
    apWriteDraft(draftStore, draftKey, snapshotRef.current());
    dirtyRef.current = false;
    if (onBack) onBack();
  };
  const startOver = () => {
    apClearDraft(draftStore, draftKey);
    dirtyRef.current = false;
    setRole(startRole);
    setStep(0);
    setValues(apFreshValues(isDietitianApplicant, true));
    setDocs({});
    setNoraKeys([]);
    setErrors({});
    setError('');
    setFromReview(false);
    setRestored(false);
  };

  // ── The checks, step by step: [field, message] in the order the step shows them ──
  const fileList = () => APPLICATION_FILE_KINDS.flatMap((k) => (Array.isArray(docs[k.kind]) ? docs[k.kind] : []).map((file) => ({ kind: k.kind, file })));
  const docWords = apDocWords(tr);
  const kindWord = (english) => {
    const k = APPLICATION_FILE_KINDS.find((x) => x.label === english);
    return (k && docWords[k.kind] && docWords[k.kind][0]) || english;
  };
  const problemsOf = (stepName) => {
    const v = values;
    const out = [];
    if (stepName === 'you') {
      if (!apStr(v.firstName)) out.push(['firstName', tr('onboarding:apply.err.firstName', { defaultValue: 'Add your first name.' })]);
      if (!apStr(v.lastName)) out.push(['lastName', tr('onboarding:apply.err.lastName', { defaultValue: 'Add your last name.' })]);
      if (!apStr(v.email)) out.push(['email', tr('onboarding:apply.err.email', { defaultValue: 'Add your email.' })]);
      else if (!AP_EMAIL.test(apStr(v.email))) out.push(['email', tr('onboarding:apply.err.emailBad', { defaultValue: 'Check your email address.' })]);
      // ⚠ 18+ applies to coaches. An approved application provisions a real auth
      // user AND a coach profile, and coach roles satisfy membership automatically,
      // so a provider account with no date of birth is entitled but unplaceable by
      // the gates. Same shared derivation; /api/apply re-validates server-side.
      const applyMinor = isMinorFromDob(v.dob);
      if (applyMinor === null) out.push(['dob', tr('onboarding:apply.err.dob', { defaultValue: 'Enter a valid date of birth — Shape is for adults 18 and over.' })]);
      else if (applyMinor === true) out.push(['dob', tr('onboarding:apply.err.minor', { defaultValue: 'You must be 18 or older to apply as a coach.' })]);
    }
    if (stepName === 'credentials') {
      if (!apStr(v.cert)) out.push(['cert', tr('onboarding:apply.err.cert', { defaultValue: 'Add your primary credential.' })]);
      // Under the standard is never a refusal: the application asks where they have worked and
      // what kind of experience it is, and is reviewed individually (the route checks the same).
      const experienceIssue = experienceProblem(v.years, { experience_history: v.experienceHistory, experience_type: v.experienceType });
      if (experienceIssue) {
        if (experienceYears(v.years) === null) {
          out.push(['years', tr('onboarding:apply.err.years', { defaultValue: 'Choose your years of professional experience.' })]);
        } else {
          const more = tr('onboarding:apply.err.moreExperience', { defaultValue: "With under {years} years, tell us where you've worked and what type of experience you have, so we can review your application.", years: EXPERIENCE_STANDARD_YEARS });
          if (!apStr(v.experienceHistory)) out.push(['experienceHistory', more]);
          if (!apStr(v.experienceType)) out.push(['experienceType', more]);
        }
      }
      if (!v.verify) out.push(['verify', tr('onboarding:apply.err.tick', { defaultValue: 'Tick this box to continue.' })]);
    }
    if (stepName === 'documents') {
      // Each file goes straight to storage, so the limits are per file and per application; say a
      // file the server would refuse before anything is sent, on the category that holds it.
      const files = fileList();
      const fileProblem = applicationFilesProblem(files.map(({ kind, file }) => ({ kind, name: file.name, type: file.type, size: file.size })));
      if (fileProblem) {
        const hit = files.find(({ file }) => file.name && fileProblem.startsWith(`${file.name} `));
        const kindHit = APPLICATION_FILE_KINDS.find((k) => fileProblem.includes(`under ${k.label}.`));
        out.push([hit ? `docs.${hit.kind}` : kindHit ? `docs.${kindHit.kind}` : 'docs', apFilesProblemWords(tr, fileProblem, kindWord)]);
      }
    }
    if (stepName === 'review') {
      const tick = tr('onboarding:apply.err.tickSend', { defaultValue: 'Tick this box to send your application.' });
      for (const k of ['tos', 'conduct', 'bgcheck']) if (!v[k]) out.push([k, tick]);
      // Nutrition compliance (NC1) — the route refuses without all four, so refuse
      // here rather than submit an application it will answer 400.
      if (role === 'nutritionist' && !attestationsComplete(v.attest)) {
        for (const k of REQUIRED_ATTESTATIONS) if (!(v.attest || {})[k]) out.push([`attest.${k}`, tick]);
      }
    }
    return out;
  };

  const goTo = (index) => {
    setStep(index);
    setErrors({});
    setRestored(false);
    if (index === AP_REVIEW) setFromReview(false);
  };
  const refuse = (found) => {
    setErrors(Object.fromEntries([...found].reverse()));
    setFocusKey(found[0][0]);
  };
  const goNext = () => {
    const found = problemsOf(name);
    if (found.length) { refuse(found); return; }
    setErrors({});
    if ((name === 'role' && noraKeys.length) || fromReview) { goTo(AP_REVIEW); return; }
    goTo(Math.min(AP_REVIEW, step + 1));
  };
  const goBack = () => {
    if (step === 0) { if (onBack) onBack(); return; }
    goTo(step - 1);
  };
  const editFromReview = (index) => { goTo(index); setFromReview(true); };

  // A new step opens at its top; a refused one scrolls to the field at fault and focuses it.
  useEffect(() => {
    const root = scrollRef.current;
    if (root) root.scrollTop = 0;
  }, [step]);
  useEffect(() => {
    if (!focusKey) return;
    const root = scrollRef.current;
    const field = root && root.querySelector(`[data-apply-field="${focusKey}"]`);
    if (field) {
      const el = field.querySelector('input:not([type=file]), select, textarea, button') || field.querySelector('input');
      try { if (el) el.focus({ preventScroll: true }); } catch (e) { /* focus is a nicety */ }
      try {
        const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (typeof field.scrollIntoView === 'function') field.scrollIntoView({ block: 'center', behavior: still ? 'auto' : 'smooth' });
      } catch (e) { /* scrolling is a nicety */ }
    }
    setFocusKey(null);
  }, [focusKey, step]);

  // Nora's sheet with the starter in her composer: the client module's door when it is loaded (the
  // member app), else the event every shell listens for, the sign-in route's included (Main opens her
  // there: its top-right door is gone, owner 2026-11-11). Her bundle may still be loading on the sign-in
  // route, so the line saying she could not open waits a few seconds for her sheet.
  const askNora = (text) => {
    setNoraHint(false);
    try {
      if (typeof window.bsAskNora === 'function') window.bsAskNora(text);
      else window.dispatchEvent(new window.CustomEvent('shape:openNora'));
    } catch (e) { /* the fallback below says so */ }
    clearTimeout(noraTimer.current);
    noraTimer.current = setTimeout(() => {
      if (typeof document === 'undefined' || document.querySelector('[data-nora-sheet]')) return;
      setNoraHint(true);
    }, 4000);
  };
  const askNoraToFill = () => askNora(isTrainer
    ? tr('onboarding:apply.nora.starterTrainer', { defaultValue: 'Help me fill in my trainer application. Ask me one question at a time.' })
    : tr('onboarding:apply.nora.starterNutritionist', { defaultValue: 'Help me fill in my nutritionist application. Ask me one question at a time.' }));

  async function submit() {
    setError('');
    // Every step's check again; the first step that fails is where they go.
    for (let i = 0; i < AP_STEPS.length; i += 1) {
      const found = problemsOf(AP_STEPS[i]);
      if (found.length) {
        if (i !== step) { goTo(i); setFromReview(i !== AP_REVIEW); }
        refuse(found);
        return;
      }
    }
    const files = fileList();
    setSubmitting(true);
    try {
      const send = window.ShapeApplications?.submitProviderApplication;
      if (!send) throw new Error(PROVIDER_APPLICATION_SEND_FAILED);
      const next = await send({
        role,
        values: {
          ...values,
          primary: values.primary || specialties[0],
          // The RD/RDN declaration — the apply route reads details.nutrition_role
          // === 'dietitian' to label the application for the reviewer.
          nutrition_role: role === 'nutritionist' ? (isDietitian ? 'dietitian' : 'nutritionist') : '',
        },
        files,
      });
      // ⚠ ONLY THE ROUTE'S OWN YES SHOWS "SENT". Anything else is a send that did not
      // happen, and the form, which keeps every value, stays up to try again.
      if (!next || next.stored !== 'api') throw new Error(PROVIDER_APPLICATION_SEND_FAILED);
      dirtyRef.current = false;
      apClearDraft(draftStore, draftKey);
      // ⚠ A DUPLICATE IS THE APPLICATION ALREADY WITH US (Codex on #2667): its stage and day are that
      // one's, read from the server, never "Submitted today"; unread, the screen draws no tracker.
      let stage = 'submitted';
      let sentAt = null;
      if (next.duplicate) {
        stage = null;
        try {
          const a = window.ShapeApplications?.myStatus ? await window.ShapeApplications.myStatus() : null;
          if (a && !a.unavailable && AP_OPEN_STAGES.includes(a.stage)) { stage = a.stage; sentAt = a.submittedAt || null; }
        } catch (e) { /* no tracker rather than a wrong one */ }
      }
      setResult({ ...next, stage, sentAt });
    } catch (err) {
      // The route's own words for a refusal; the send-failed sentence in their language.
      const said = err?.message || PROVIDER_APPLICATION_SEND_FAILED;
      setError(said === PROVIDER_APPLICATION_SEND_FAILED
        ? tr('onboarding:apply.err.sendFailed', { defaultValue: "We couldn't send your application. Check your connection and try again." })
        : said);
    } finally {
      setSubmitting(false);
    }
  }

  // ── Words ──
  const choice = apChoiceWords(tr);
  const choiceLabel = (v) => choice[v] || v;
  const specWords = apSpecWords(tr);
  const specLabel = (v) => specWords[v] || v;
  const popWords = apPopWords(tr);
  const popLabel = (v) => popWords[v] || v;
  const stepWord = {
    role: tr('onboarding:apply.step.role', { defaultValue: 'Role' }),
    you: tr('onboarding:apply.step.you', { defaultValue: 'You' }),
    credentials: tr('onboarding:apply.step.credentials', { defaultValue: 'Credentials' }),
    documents: tr('onboarding:apply.step.documents', { defaultValue: 'Documents' }),
    specialty: tr('onboarding:apply.step.specialty', { defaultValue: 'Specialty' }),
    rates: tr('onboarding:apply.step.rates', { defaultValue: 'Rates' }),
    review: tr('onboarding:apply.step.review', { defaultValue: 'Review' }),
  };
  const teal = apTeal(t);
  const tealText = apTealText(t);
  const padX = apPadX(t);
  const BackButton = window.BSBackButton || null;
  const backTop = apBackSlotTop();
  const hasNora = (stepName) => AP_STEP_KEYS[stepName].some((k) => noraKeys.includes(k));

  const titleOf = {
    role: tr('onboarding:apply.role.title', { defaultValue: 'Coach on Shape' }),
    you: tr('onboarding:apply.you.title', { defaultValue: 'About you' }),
    credentials: tr('onboarding:apply.cred.title', { defaultValue: 'Your credentials' }),
    documents: tr('onboarding:apply.docs.title', { defaultValue: 'Your documents' }),
    specialty: tr('onboarding:apply.spec.title', { defaultValue: 'Your specialty' }),
    rates: tr('onboarding:apply.rates.title', { defaultValue: 'Your rates' }),
    review: tr('onboarding:apply.review.title', { defaultValue: 'Review and send' }),
  };
  const subOf = {
    role: tr('onboarding:apply.role.sub', { defaultValue: 'Free to join. Set your own prices, publish programs and sell sessions once Shape has reviewed you.' }),
    you: tr('onboarding:apply.you.sub', { defaultValue: 'How we reach you, and what clients read about you.' }),
    credentials: tr('onboarding:apply.cred.sub', { defaultValue: "What you're certified in, and how long you've coached." }),
    documents: tr('onboarding:apply.docs.sub', { defaultValue: 'Your resume, certificates and insurance, for the review to check.' }),
    specialty: tr('onboarding:apply.spec.sub', { defaultValue: 'What you coach best, and who you coach.' }),
    rates: tr('onboarding:apply.rates.sub', { defaultValue: 'What you charge, and how many clients you take on.' }),
    review: null,
  };
  const kicker = isTrainer
    ? tr('onboarding:apply.kicker.trainer', { defaultValue: 'Step {n} of {total} · Trainer application', n: step + 1, total: AP_STEPS.length })
    : isDietitian
      ? tr('onboarding:apply.kicker.dietitian', { defaultValue: 'Step {n} of {total} · Dietitian application (RD/RDN)', n: step + 1, total: AP_STEPS.length })
      : tr('onboarding:apply.kicker.nutritionist', { defaultValue: 'Step {n} of {total} · Nutritionist application', n: step + 1, total: AP_STEPS.length });

  // ── The frame: the whole surface, the app's paper, the clean type ──
  const frame = (children) => {
    const el = (
      <BSCleanType t={t}>
        <div data-provider-apply="" data-apply-step={result ? 'sent' : name} style={{
          position: 'absolute', inset: 0, zIndex: host ? 220 : undefined, overflow: 'hidden', display: 'flex', flexDirection: 'column',
          background: t.PAPER_BG || t.PAPER, color: t.INK, colorScheme: t.isLight ? 'light' : 'dark', fontFamily: BS_CLEAN_SANS,
          WebkitFontSmoothing: 'antialiased', '--ap-teal': teal, '--ap-ph': inkA(t, 0.38),
        }}>
          <style>{AP_CSS}</style>
          {children}
        </div>
      </BSCleanType>
    );
    return host ? createPortal(el, host) : el;
  };
  const titleStyle = { margin: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 28, fontWeight: 700, letterSpacing: '-0.035em', lineHeight: 1.08, color: t.INK, textWrap: 'balance' };
  const subStyle = { margin: '6px 0 0', fontFamily: BS_CLEAN_SANS, fontSize: 14.5, fontWeight: 500, lineHeight: 1.45, color: t.INK70, textWrap: 'pretty' };
  const primaryBtn = (disabled) => ({
    display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', minHeight: 52, padding: '0 18px', borderRadius: 999, border: 0,
    background: teal, color: apOnTeal(t), cursor: disabled ? 'wait' : 'pointer', opacity: disabled ? 0.7 : 1,
    fontFamily: BS_CLEAN_HEAD, fontSize: 16.5, fontWeight: 650, letterSpacing: '-0.01em',
  });
  const quietLink = { minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', cursor: 'pointer', color: tealText, fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: 650 };
  const footStyle = { flex: 'none', padding: `10px ${padX}px calc(14px + env(safe-area-inset-bottom, 0px))`, background: t.PAPER_BG || t.PAPER, borderTop: `1px solid ${inkA(t, 0.08)}` };
  const caption = { margin: '8px 0 0', textAlign: 'center', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 500, color: t.INK50 };

  // ── After the send: where it stands ──
  if (result) {
    let today = '';
    try { today = new Intl.DateTimeFormat(window.ShapeI18n?.intlLocale?.() || undefined, { month: 'short', day: 'numeric' }).format(new Date()); } catch (e) { today = ''; }
    // A duplicate's files were not taken: it says only that the application is with us.
    const sentFiles = !result.duplicate && fileList().length > 0;
    const first = apStr(values.firstName);
    // ⚠ WHERE IT STANDS IS THE SERVER'S (Codex on #2667): a new row is `pending`, which the server and
    // Settings call Submitted until a reviewer opens it, so a fresh send is at Submitted, today; a
    // duplicate is at the stage, and from the day, the server read for it (submit), or has no tracker.
    const at = AP_OPEN_STAGES.indexOf(result.stage);
    let sentDay = result.duplicate ? '' : today;
    if (result.sentAt) {
      try { sentDay = new Intl.DateTimeFormat(window.ShapeI18n?.intlLocale?.() || undefined, { month: 'short', day: 'numeric' }).format(new Date(result.sentAt)); } catch (e) { /* the day stays off */ }
    }
    const stages = [
      { key: 'submitted', title: tr('onboarding:apply.status.submitted', { defaultValue: 'Submitted' }), sub: sentFiles ? tr('onboarding:apply.status.submittedSub', { defaultValue: 'We have your application and documents.' }) : tr('onboarding:apply.status.submittedSubNoDocs', { defaultValue: 'We have your application.' }), when: sentDay },
      { key: 'review', title: tr('onboarding:apply.status.review', { defaultValue: 'In review' }), sub: at >= 1 ? tr('onboarding:apply.status.reviewSubNow', { defaultValue: 'A Shape reviewer is reading your credentials.' }) : tr('onboarding:apply.status.reviewSub', { defaultValue: 'Next, a Shape reviewer reads your credentials.' }) },
      { key: 'bg', title: tr('onboarding:apply.status.bg', { defaultValue: 'Background check' }), sub: tr('onboarding:apply.status.bgSub', { defaultValue: 'Checkr emails you a secure link.' }) },
      { key: 'decision', title: tr('onboarding:apply.status.decision', { defaultValue: 'Decision' }), sub: tr('onboarding:apply.status.decisionSub', { defaultValue: 'We email you the decision.' }) },
    ].map((st, i) => ({ ...st, done: at >= 0 && i < at, now: i === at }));
    const tag = isTrainer
      ? tr('onboarding:apply.tag.trainer', { defaultValue: 'Trainer application' })
      : isDietitian ? tr('onboarding:apply.tag.dietitian', { defaultValue: 'Dietitian application (RD/RDN)' }) : tr('onboarding:apply.tag.nutritionist', { defaultValue: 'Nutritionist application' });
    return frame(
      <>
        <div style={{ flex: 'none', padding: `${backTop} ${padX}px 0`, display: 'flex', alignItems: 'center', minHeight: 34 }}>
          {BackButton ? <BackButton compact onClick={onBack} ink={t.INK} /> : null}
        </div>
        <div ref={scrollRef} className="bs-hide-scroll" data-apply-status="" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: `14px ${padX}px 24px` }}>
          <span style={{ display: 'inline-block', padding: '4px 10px', borderRadius: 999, background: t.isLight ? 'rgba(10,122,114,0.09)' : 'rgba(52,214,197,0.12)', fontFamily: BS_CLEAN_SANS, fontSize: 12.5, fontWeight: 650, color: tealText }}>{tag}</span>
          <h1 style={{ ...titleStyle, marginTop: 12 }}>{tr('onboarding:apply.status.title', { defaultValue: 'Application sent' })}<span aria-hidden="true" style={{ color: teal }}>.</span></h1>
          <p style={subStyle}>
            {result.duplicate
              ? tr('onboarding:apply.status.duplicate', { defaultValue: 'This application was already with us.' })
              : first ? tr('onboarding:apply.status.thanks', { defaultValue: 'Thanks, {name}. Here is where it stands.', name: first }) : tr('onboarding:apply.status.thanksNoName', { defaultValue: 'Here is where it stands.' })}
          </p>
          {at >= 0 ? <ol data-apply-tracker="" style={{ listStyle: 'none', margin: '24px 0 0', padding: 0 }}>
            {stages.map((s, i) => {
              const last = i === stages.length - 1;
              const ring = s.done ? teal : s.now ? teal : inkA(t, 0.24);
              return (
                <li key={s.key} data-apply-stage={s.key} aria-current={s.now ? 'step' : undefined} style={{ display: 'flex', gap: 12 }}>
                  <span aria-hidden="true" style={{ flex: 'none', width: 22, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                    <span style={{ width: 22, height: 22, boxSizing: 'border-box', borderRadius: 99, display: 'grid', placeItems: 'center', border: s.done ? 0 : `2px solid ${ring}`, background: s.done ? teal : 'transparent', color: apOnTeal(t), fontSize: 12, fontWeight: 800 }}>
                      {s.done ? '✓' : s.now ? <span style={{ width: 8, height: 8, borderRadius: 99, background: teal }} /> : null}
                    </span>
                    {last ? null : <span style={{ flex: 1, width: 2, minHeight: 18, background: s.done ? teal : inkA(t, 0.12) }} />}
                  </span>
                  <div style={{ flex: 1, minWidth: 0, paddingBottom: last ? 0 : 22 }}>
                    {s.now ? (
                      <div style={{ marginTop: -7, padding: '10px 13px', borderRadius: 14, border: `1px solid ${t.isLight ? 'rgba(10,122,114,0.4)' : 'rgba(52,214,197,0.45)'}`, background: t.isLight ? 'rgba(10,122,114,0.06)' : 'rgba(52,214,197,0.09)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 16, fontWeight: 650, color: tealText }}>{s.title}</span>
                          {s.when ? <span style={{ flex: 'none', fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, color: t.INK70 }}>{s.when}</span> : null}
                          <span style={{ flex: 'none', padding: '2px 8px', borderRadius: 6, background: t.isLight ? 'rgba(10,122,114,0.12)' : 'rgba(52,214,197,0.16)', fontFamily: BS_CLEAN_SANS, fontSize: 11.5, fontWeight: 700, color: tealText }}>{tr('onboarding:apply.status.now', { defaultValue: 'Now' })}</span>
                        </div>
                        <div style={{ marginTop: 3, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, color: t.INK70 }}>{s.sub}</div>
                      </div>
                    ) : (
                      <>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ flex: 1, minWidth: 0, fontFamily: BS_CLEAN_HEAD, fontSize: 16, fontWeight: 650, color: s.done ? t.INK : t.INK70 }}>{s.title}</span>
                          {s.when ? <span style={{ flex: 'none', fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, color: t.INK70 }}>{s.when}</span> : null}
                        </div>
                        <div style={{ marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, color: s.done ? t.INK70 : t.INK50 }}>{s.sub}</div>
                      </>
                    )}
                  </div>
                </li>
              );
            })}
          </ol> : null}
          <p style={{ margin: '24px 0 0', paddingTop: 14, borderTop: `1px solid ${inkA(t, 0.1)}`, fontFamily: BS_CLEAN_SANS, fontSize: 14, fontWeight: 500, lineHeight: 1.45, color: t.INK70 }}>
            <b style={{ fontWeight: 700, color: t.INK }}>{tr('onboarding:apply.status.usually', { defaultValue: 'Usually 2–3 business days.' })}</b>{' '}
            {tr('onboarding:apply.status.where', { defaultValue: "We'll email you, and you can see where it stands in Settings, under Coach on Shape." })}
          </p>
        </div>
        <div style={footStyle}>
          <button type="button" data-bs-back="" data-apply-done="" onClick={onBack} style={{ ...primaryBtn(false), background: 'transparent', color: t.INK, border: `1px solid ${inkA(t, 0.22)}` }}>{tr('onboarding:apply.status.done', { defaultValue: 'Done' })}</button>
          <button type="button" onClick={() => askNora('')} style={{ ...quietLink, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 4 }}>
            <span aria-hidden="true">✦</span>{tr('onboarding:apply.status.askNora', { defaultValue: 'Ask Nora a question' })}
          </button>
          {noraHint ? <p role="status" style={{ ...caption, marginTop: 2 }}>{tr('onboarding:apply.nora.unavailable', { defaultValue: 'Nora couldn’t open just now. Try again in a moment.' })}</p> : null}
        </div>
      </>,
    );
  }

  // ── The steps ──
  const tick = (key) => (key in errors ? errors[key] : null);
  const body = (() => {
    if (name === 'role') return (
      <>
        <div data-apply-field="role" role="radiogroup" aria-labelledby="ap-lbl-role" style={{ display: 'grid', gap: 10 }}>
          <span id="ap-lbl-role" style={apLabelStyle(t, false)}>{tr('onboarding:apply.role.label', { defaultValue: 'What do you coach?' })}</span>
          <ApRoleCard t={t} on={isTrainer} onPick={() => pickRole('trainer')}
            title={tr('onboarding:apply.role.trainer', { defaultValue: 'Trainer' })}
            sub={tr('onboarding:apply.role.trainerSub', { defaultValue: 'Training programs, sessions and check-ins.' })} />
          <ApRoleCard t={t} on={!isTrainer} onPick={() => pickRole('nutritionist')}
            title={tr('onboarding:apply.role.nutritionist', { defaultValue: 'Nutritionist' })}
            sub={tr('onboarding:apply.role.nutritionistSub', { defaultValue: 'Meal plans, consults and nutrition coaching.' })} />
        </div>
        {!isTrainer && (
          <ApSeg t={t} fieldKey="nutritionType" label={tr('onboarding:apply.role.type', { defaultValue: 'Professional type' })} value={values.nutritionType} onChange={(v) => set('nutritionType', v)} options={AP_NUTRITION_TYPES} labelOf={choiceLabel} />
        )}
        {isDietitian && <ApNote t={t} tone="teal">{tr('onboarding:apply.role.dietitianNote', { defaultValue: 'You apply as a Registered Dietitian (RD/RDN). Approved dietitians get the credentialed badge.' })}</ApNote>}
        <ApNoraCard t={t} onAsk={askNoraToFill} hint={noraHint} />
      </>
    );

    if (name === 'you') return (
      <>
        <div style={apPair}>
          <ApText t={t} fieldKey="firstName" label={tr('onboarding:apply.f.firstName', { defaultValue: 'First name' })} value={values.firstName} onChange={(v) => set('firstName', v)} error={tick('firstName')} autoComplete="given-name" />
          <ApText t={t} fieldKey="lastName" label={tr('onboarding:apply.f.lastName', { defaultValue: 'Last name' })} value={values.lastName} onChange={(v) => set('lastName', v)} error={tick('lastName')} autoComplete="family-name" />
        </div>
        <ApText t={t} fieldKey="email" type="email" inputMode="email" autoComplete="email" label={tr('onboarding:apply.f.email', { defaultValue: 'Email' })} value={values.email} onChange={(v) => set('email', v)} error={tick('email')} />
        <ApText t={t} fieldKey="phone" type="tel" inputMode="tel" autoComplete="tel" label={tr('onboarding:apply.f.phone', { defaultValue: 'Phone' })} value={values.phone} onChange={(v) => set('phone', v)} />
        {/* Shape is 18+ for coaches too: approval provisions a real account and
            coach roles satisfy membership, so a provider row with no DOB is an
            ungated account. Checked on Continue and on send, and again in /api/apply. */}
        <ApText t={t} fieldKey="dob" type="date" autoComplete="bday" label={tr('onboarding:apply.f.dob', { defaultValue: 'Date of birth' })} value={values.dob} onChange={(v) => set('dob', v)} error={tick('dob')} />
        <ApText t={t} fieldKey="city" autoComplete="address-level2" label={tr('onboarding:apply.f.city', { defaultValue: 'City, state / country' })} value={values.city} onChange={(v) => set('city', v)} placeholder={tr('onboarding:apply.ph.city', { defaultValue: 'Brooklyn, NY' })} />
        <div style={apPair}>
          <ApText t={t} fieldKey="tz" label={tr('onboarding:apply.f.tz', { defaultValue: 'Time zone' })} value={values.tz} onChange={(v) => set('tz', v)} placeholder={tr('onboarding:apply.ph.tz', { defaultValue: 'America/New_York' })} />
          <ApText t={t} fieldKey="social" label={tr('onboarding:apply.f.social', { defaultValue: 'Social handles' })} value={values.social} onChange={(v) => set('social', v)} placeholder={tr('onboarding:apply.ph.social', { defaultValue: '@handle' })} />
        </div>
        <ApText t={t} fieldKey="bio" multiline
          label={isTrainer ? tr('onboarding:apply.f.bioTrainer', { defaultValue: 'Short bio: why coaching' }) : tr('onboarding:apply.f.bioNutritionist', { defaultValue: 'Short bio: why nutrition' })}
          value={values.bio} onChange={(v) => set('bio', v)} placeholder={tr('onboarding:apply.ph.bio', { defaultValue: 'A few lines, in your own words' })} />
      </>
    );

    if (name === 'credentials') return (
      <>
        <ApText t={t} fieldKey="cert"
          label={isTrainer ? tr('onboarding:apply.f.certTrainer', { defaultValue: 'Primary certification' }) : isDietitian ? tr('onboarding:apply.f.certDietitian', { defaultValue: 'RD/RDN registration number' }) : tr('onboarding:apply.f.certNutritionist', { defaultValue: 'License type' })}
          value={values.cert} onChange={(v) => set('cert', v)} error={tick('cert')}
          placeholder={isTrainer ? tr('onboarding:apply.ph.certTrainer', { defaultValue: 'NASM, ACE, CSCS' }) : isDietitian ? tr('onboarding:apply.ph.certDietitian', { defaultValue: 'RD #, RDN #' }) : tr('onboarding:apply.ph.certNutritionist', { defaultValue: 'RD, RDN, CNS' })} />
        <ApText t={t} fieldKey="certExp"
          label={isTrainer ? tr('onboarding:apply.f.certExpTrainer', { defaultValue: 'Expiration / renewal' }) : tr('onboarding:apply.f.certExpNutritionist', { defaultValue: 'License state + number' })}
          value={values.certExp} onChange={(v) => set('certExp', v)}
          placeholder={isTrainer ? tr('onboarding:apply.ph.certExp', { defaultValue: 'MM / YYYY' }) : undefined} />
        <ApText t={t} fieldKey="edu" label={tr('onboarding:apply.f.edu', { defaultValue: 'Degree / school' })} value={values.edu} onChange={(v) => set('edu', v)}
          placeholder={isTrainer ? tr('onboarding:apply.ph.eduTrainer', { defaultValue: 'BS Kinesiology' }) : tr('onboarding:apply.ph.eduNutritionist', { defaultValue: 'MS Nutrition' })} />
        <ApSelect t={t} fieldKey="years" label={tr('onboarding:apply.f.years', { defaultValue: 'Years of professional experience' })} value={values.years} onChange={(v) => set('years', v)} options={PROVIDER_EXPERIENCE_OPTIONS} labelOf={choiceLabel} placeholder={tr('onboarding:apply.f.yearsPick', { defaultValue: 'Select' })} error={tick('years')} />
        <ApNote t={t}>
          {isTrainer
            ? tr('onboarding:apply.cred.standardTrainer', { defaultValue: "Shape's standard is {years} years of professional training or coaching experience. With less, you can still apply: tell us where you've worked and what kind of experience it is, and we review your application individually.", years: EXPERIENCE_STANDARD_YEARS })
            : tr('onboarding:apply.cred.standardNutritionist', { defaultValue: "Shape's standard is {years} years of professional nutrition coaching or clinical experience. With less, you can still apply: tell us where you've worked and what kind of experience it is, and we review your application individually.", years: EXPERIENCE_STANDARD_YEARS })}
        </ApNote>
        {belowExperienceStandard(values.years) && (
          <>
            <ApText t={t} fieldKey="experienceHistory" multiline label={tr('onboarding:apply.f.history', { defaultValue: "Where you've worked" })} value={values.experienceHistory} onChange={(v) => set('experienceHistory', v)} error={tick('experienceHistory')} placeholder={tr('onboarding:apply.ph.history', { defaultValue: 'Each place, your role and how long you were there' })} />
            <ApText t={t} fieldKey="experienceType" multiline label={tr('onboarding:apply.f.expType', { defaultValue: 'Type of experience' })} value={values.experienceType} onChange={(v) => set('experienceType', v)} error={tick('experienceType')}
              placeholder={isTrainer ? tr('onboarding:apply.ph.expTypeTrainer', { defaultValue: 'Gym floor, online coaching, a sports team, an internship' }) : tr('onboarding:apply.ph.expTypeNutritionist', { defaultValue: 'Clinical or dietetic practice, online coaching, a sports team, an internship' })} />
            <ApText t={t} fieldKey="experienceNotes" multiline label={tr('onboarding:apply.f.expNotes', { defaultValue: 'Anything else we should know (optional)' })} value={values.experienceNotes} onChange={(v) => set('experienceNotes', v)} />
          </>
        )}
        <ApSeg t={t} fieldKey="insurance" label={tr('onboarding:apply.f.insurance', { defaultValue: 'Liability insurance' })} value={values.insurance} onChange={(v) => set('insurance', v)} options={['Yes', 'No', 'In progress']} labelOf={choiceLabel} />
        <ApText t={t} fieldKey="prev" label={tr('onboarding:apply.f.prev', { defaultValue: 'Previous platforms' })} value={values.prev} onChange={(v) => set('prev', v)} placeholder={tr('onboarding:apply.ph.prev', { defaultValue: 'Trainerize, MyFitnessPal Pro' })} />
        {/* NC1: the nutrition-compliance capture the website's application carries (signup.jsx
            NutritionCompliance), under the same keys. The reviewer seeds the coach's credential
            and state licenses from it; the license rows are never Nora's to fill. */}
        {!isTrainer && (
          <div data-apply-compliance="" style={{ display: 'grid', gap: 14, borderTop: `1px solid ${inkA(t, 0.1)}`, paddingTop: 16 }}>
            <ApNote t={t}>
              {isDietitian
                ? tr('onboarding:apply.comp.dietitian', { defaultValue: "Individualized (medical) nutrition therapy needs a license in each client's state. Add your CDR registration, state licenses and liability insurance." })
                : tr('onboarding:apply.comp.nutritionist', { defaultValue: 'Without a state dietitian license you offer general wellness guidance only. Add a state license to offer individualized care in that state.' })}
            </ApNote>
            {isDietitian && (
              <>
                <ApText t={t} fieldKey="cdrId" inputMode="numeric" label={tr('onboarding:apply.f.cdr', { defaultValue: 'CDR registration number' })} value={values.cdrId} onChange={(v) => set('cdrId', v)} placeholder="1234567" />
                <ApSeg t={t} fieldKey="rdCredential" label={tr('onboarding:apply.f.rdCredential', { defaultValue: 'Credential type' })} value={values.rdCredential} onChange={(v) => set('rdCredential', v)} options={['rd', 'rdn']} labelOf={(v) => v.toUpperCase()} />
              </>
            )}
            <div data-apply-field="licenses" style={{ display: 'grid', gap: 8 }}>
              <span style={apLabelStyle(t, false)}>{tr('onboarding:apply.f.licenses', { defaultValue: 'State licenses · only clients in these states' })}</span>
              {licenses.map((l, i) => (
                <div key={i} data-apply-license={i} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 44px', gap: 8, padding: 10, borderRadius: 14, border: `1px solid ${inkA(t, t.isLight ? 0.14 : 0.12)}` }}>
                  <span data-ap-box="" style={{ ...apBoxStyle(t, false), padding: '0 10px' }}>
                    <input aria-label={tr('onboarding:apply.f.licState', { defaultValue: 'State' })} value={l.state || ''} onChange={(e) => setLicense(i, { state: e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2) })} placeholder={tr('onboarding:apply.ph.licState', { defaultValue: 'NY' })} autoCapitalize="characters" style={{ ...apInputStyle(t), letterSpacing: '0.06em' }} />
                  </span>
                  <span data-ap-box="" style={{ ...apBoxStyle(t, false), gridColumn: '2 / 4' }}>
                    <input aria-label={tr('onboarding:apply.f.licNumber', { defaultValue: 'License number' })} value={l.number || ''} onChange={(e) => setLicense(i, { number: e.target.value })} placeholder={tr('onboarding:apply.f.licNumber', { defaultValue: 'License number' })} style={apInputStyle(t)} />
                  </span>
                  <span data-ap-box="" style={{ ...apBoxStyle(t, false), gridColumn: '1 / 3' }}>
                    <input aria-label={tr('onboarding:apply.f.licExpires', { defaultValue: 'License expiration' })} type="date" value={l.expires || ''} onChange={(e) => setLicense(i, { expires: e.target.value })} style={apInputStyle(t)} />
                  </span>
                  <button type="button" aria-label={tr('onboarding:apply.f.licRemove', { defaultValue: 'Remove license' })} onClick={() => set('licenses', licenses.length > 1 ? licenses.filter((_, j) => j !== i) : [AP_EMPTY_LICENSE])} style={{ width: 44, minHeight: 48, borderRadius: 12, border: `1px solid ${inkA(t, 0.16)}`, background: 'transparent', color: t.INK70, fontSize: 18, cursor: 'pointer' }}>×</button>
                </div>
              ))}
              <button type="button" onClick={() => set('licenses', [...licenses, AP_EMPTY_LICENSE])} style={{ ...quietLink, justifySelf: 'start', padding: '0 14px', borderRadius: 999, border: `1px dashed ${inkA(t, 0.3)}` }}>{tr('onboarding:apply.f.licAdd', { defaultValue: '＋ Add another state' })}</button>
            </div>
            <ApText t={t} fieldKey="insCarrier" label={tr('onboarding:apply.f.insCarrier', { defaultValue: 'Insurance carrier' })} value={values.insCarrier} onChange={(v) => set('insCarrier', v)} placeholder={tr('onboarding:apply.ph.insCarrier', { defaultValue: 'HPSO' })} />
            <div style={apPair}>
              <ApText t={t} fieldKey="insPolicy" label={tr('onboarding:apply.f.insPolicy', { defaultValue: 'Policy number' })} value={values.insPolicy} onChange={(v) => set('insPolicy', v)} />
              <ApText t={t} fieldKey="insExpires" type="date" label={tr('onboarding:apply.f.insExpires', { defaultValue: 'Insurance expiration' })} value={values.insExpires} onChange={(v) => set('insExpires', v)} />
            </div>
          </div>
        )}
        <ApCheck t={t} fieldKey="verify" checked={values.verify} onChange={(v) => set('verify', v)} error={tick('verify')}>
          {tr('onboarding:apply.cred.verify', { defaultValue: "I understand my credentials may be verified by Shape's trust team." })}
        </ApCheck>
      </>
    );

    if (name === 'documents') {
      const docKey = Object.keys(errors).find((k) => k === 'docs' || k.startsWith('docs.'));
      return (
        <>
          <ApNote t={t}>{tr('onboarding:apply.docs.notKept', { defaultValue: 'Files are not saved with your draft. If you leave before you send, add them again.' })}</ApNote>
          <BSApplyDocuments t={t} docs={docs} onChange={(kind, files) => { setDocs((prev) => ({ ...prev, [kind]: files })); setErrors({}); }} errorKind={docKey ? (docKey === 'docs' ? 'docs' : docKey.slice(5)) : null} error={docKey ? errors[docKey] : null} />
        </>
      );
    }

    if (name === 'specialty') return (
      <>
        <ApSelect t={t} fieldKey="primary" label={tr('onboarding:apply.f.primary', { defaultValue: 'Primary specialty' })} value={values.primary || specialties[0]} onChange={(v) => set('primary', v)} options={specialties} labelOf={specLabel} />
        <ApChips t={t} fieldKey="secondary" label={tr('onboarding:apply.f.secondary', { defaultValue: 'Secondary specialties' })} options={specialties} values={values.secondary || []} onToggle={(v) => toggle('secondary', v)} labelOf={specLabel} />
        <ApChips t={t} fieldKey="populations" label={tr('onboarding:apply.f.populations', { defaultValue: 'Populations you work best with' })} options={populations} values={values.populations || []} onToggle={(v) => toggle('populations', v)} labelOf={popLabel} />
        <ApText t={t} fieldKey="style" label={tr('onboarding:apply.f.style', { defaultValue: 'Coaching style' })} value={values.style} onChange={(v) => set('style', v)}
          placeholder={isTrainer ? tr('onboarding:apply.ph.styleTrainer', { defaultValue: 'Data-driven, warm, no shouting' }) : tr('onboarding:apply.ph.styleNutritionist', { defaultValue: 'Evidence-based, real food, no restriction' })} />
      </>
    );

    if (name === 'rates') return (
      <>
        <div style={apPair}>
          <ApText t={t} fieldKey="subPrice" type="number" inputMode="decimal" prefix="$"
            label={isTrainer ? tr('onboarding:apply.f.subTrainer', { defaultValue: 'Subscription $/mo' }) : tr('onboarding:apply.f.subNutritionist', { defaultValue: 'Monthly plan $/mo' })}
            value={values.subPrice} onChange={(v) => set('subPrice', v)} placeholder={isTrainer ? '280' : '320'} />
          <ApText t={t} fieldKey="sessionPrice" type="number" inputMode="decimal" prefix="$"
            label={isTrainer ? tr('onboarding:apply.f.sessionTrainer', { defaultValue: 'Single session $' }) : tr('onboarding:apply.f.sessionNutritionist', { defaultValue: 'Single consult $' })}
            value={values.sessionPrice} onChange={(v) => set('sessionPrice', v)} placeholder={isTrainer ? '55' : '150'} />
        </div>
        <ApSeg t={t} fieldKey="oneOnOne" label={isTrainer ? tr('onboarding:apply.f.oneOnOneTrainer', { defaultValue: '1-on-1 sessions' }) : tr('onboarding:apply.f.oneOnOneNutritionist', { defaultValue: '1-on-1 consults' })} value={values.oneOnOne} onChange={(v) => set('oneOnOne', v)} options={['Yes', 'No']} labelOf={choiceLabel} />
        <ApSelect t={t} fieldKey="intro" label={tr('onboarding:apply.f.intro', { defaultValue: 'Free intro' })} value={values.intro} onChange={(v) => set('intro', v)} options={['15-minute free intro', '30-minute free intro', 'No free intro']} labelOf={choiceLabel} />
        <ApText t={t} fieldKey="maxClients" type="number" inputMode="numeric" label={tr('onboarding:apply.f.maxClients', { defaultValue: 'Max clients' })} value={values.maxClients} onChange={(v) => set('maxClients', v)} placeholder="25" />
        <ApSeg t={t} fieldKey="accepting" label={tr('onboarding:apply.f.accepting', { defaultValue: 'Accepting clients' })} value={values.accepting} onChange={(v) => set('accepting', v)} options={['Yes', 'Waitlist', 'Not yet']} labelOf={choiceLabel} />
        <ApSelect t={t} fieldKey="response" label={tr('onboarding:apply.f.response', { defaultValue: 'Response time' })} value={values.response} onChange={(v) => set('response', v)} options={['Within 12 hours', 'Within 24 hours', 'Within 48 hours']} labelOf={choiceLabel} />
      </>
    );

    // Review: each section with ✓ or what it still needs, and Edit; then the agreements.
    const files = fileList();
    const v = values;
    const join = (parts) => parts.filter(Boolean).join(' · ');
    const sections = [
      { key: 'role', at: 0, missing: 0, sum: isTrainer ? tr('onboarding:apply.role.trainer', { defaultValue: 'Trainer' }) : choiceLabel(v.nutritionType || AP_NUTRITION_TYPES[0]) },
      { key: 'you', at: 1, missing: problemsOf('you').length, sum: join([[apStr(v.firstName), apStr(v.lastName)].filter(Boolean).join(' '), apStr(v.city)]) },
      { key: 'credentials', at: 2, missing: problemsOf('credentials').length, sum: join([apStr(v.cert), apStr(v.certExp), v.years ? choiceLabel(v.years) : '']) },
      { key: 'documents', at: 3, check: problemsOf('documents').length > 0, sum: files.length ? join([tr('onboarding:apply.review.files', { defaultValue: '{count, plural, one {# file} other {# files}}', count: files.length }), ...APPLICATION_FILE_KINDS.filter((k) => (docs[k.kind] || []).length).map((k) => (docWords[k.kind] || [k.label])[0])]) : tr('onboarding:apply.review.noFiles', { defaultValue: 'No files added' }) },
      { key: 'specialty', at: 4, missing: 0, sum: join([specLabel(v.primary || specialties[0]), (v.secondary || []).map(specLabel).join(', ')]) },
      { key: 'rates', at: 5, missing: 0, sum: join([v.subPrice ? tr('onboarding:apply.review.perMonth', { defaultValue: '${price}/mo', price: v.subPrice }) : '', v.sessionPrice ? tr('onboarding:apply.review.perSession', { defaultValue: '${price} a session', price: v.sessionPrice }) : '', v.accepting && v.accepting !== 'Yes' ? `${tr('onboarding:apply.f.accepting', { defaultValue: 'Accepting clients' })}: ${choiceLabel(v.accepting)}` : '']) },
    ];
    const tos = isTrainer
      ? tr('onboarding:apply.review.tosTrainer', { defaultValue: 'I agree to the Trainer Agreement and Terms of Service.' })
      : tr('onboarding:apply.review.tosNutritionist', { defaultValue: 'I agree to the Nutritionist Agreement and Terms of Service.' });
    const attestWords = apAttestWords(tr);
    const amber = apAmber(t);
    return (
      <>
        <ul data-apply-review="" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {sections.map((s, i) => {
            const flagged = s.check || s.missing > 0;
            return (
              <li key={s.key} data-review-row={s.key} data-review-ok={flagged ? undefined : ''} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderTop: i ? `1px solid ${inkA(t, 0.08)}` : 0 }}>
                <span aria-hidden="true" style={{ flex: 'none', width: 16, textAlign: 'center', fontSize: 15, fontWeight: 800, color: flagged ? amber : tealText }}>{flagged ? '!' : '✓'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                    <span style={{ fontFamily: BS_CLEAN_HEAD, fontSize: 16, fontWeight: 650, color: t.INK }}>{stepWord[s.key]}</span>
                    {flagged ? (
                      <span data-review-flag="" style={{ padding: '2px 8px', borderRadius: 6, background: apAmberBg(t), fontFamily: BS_CLEAN_SANS, fontSize: 11.5, fontWeight: 700, color: amber }}>
                        {s.check ? tr('onboarding:apply.review.check', { defaultValue: 'Check' }) : tr('onboarding:apply.review.missing', { defaultValue: '{count, plural, one {# missing} other {# missing}}', count: s.missing })}
                      </span>
                    ) : null}
                  </div>
                  {s.sum ? <div style={{ marginTop: 2, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.35, color: t.INK70, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.sum}</div> : null}
                  {hasNora(s.key) ? <div style={{ marginTop: 3, fontFamily: BS_CLEAN_SANS, fontSize: 12, fontWeight: 650, color: tealText }}><span aria-hidden="true">✦ </span>{tr('onboarding:apply.nora.filled', { defaultValue: 'Filled by Nora · check it' })}</div> : null}
                </div>
                <button type="button" data-review-edit={s.key} aria-label={tr('onboarding:apply.review.editAria', { defaultValue: 'Edit {section}', section: stepWord[s.key] })} onClick={() => editFromReview(s.at)} style={{ ...quietLink, flex: 'none', minWidth: 44, padding: '0 0 0 8px', textAlign: 'right' }}>
                  {tr('onboarding:apply.review.edit', { defaultValue: 'Edit' })}
                </button>
              </li>
            );
          })}
        </ul>
        <div style={{ display: 'grid', gap: 2, borderTop: `1px solid ${inkA(t, 0.1)}`, paddingTop: 16 }}>
          <h2 style={{ margin: '0 0 6px', fontFamily: BS_CLEAN_HEAD, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em', color: t.INK }}>{tr('onboarding:apply.review.agreements', { defaultValue: 'Agreements' })}</h2>
          <ApNote t={t}>{tr('onboarding:apply.review.bgNote', { defaultValue: 'Background checks are required before a coach profile can go live. Shape uses Checkr; the review team sends the screening invite after reviewing your application.' })}</ApNote>
          <div style={{ height: 6 }} />
          <ApCheck t={t} fieldKey="tos" checked={values.tos} onChange={(on) => set('tos', on)} error={tick('tos')}>{tos}</ApCheck>
          <ApCheck t={t} fieldKey="conduct" checked={values.conduct} onChange={(on) => set('conduct', on)} error={tick('conduct')}>{tr('onboarding:apply.review.conduct', { defaultValue: "I agree to Shape's code of conduct." })}</ApCheck>
          <ApCheck t={t} fieldKey="bgcheck" checked={values.bgcheck} onChange={(on) => set('bgcheck', on)} error={tick('bgcheck')}>{tr('onboarding:apply.review.bgcheck', { defaultValue: "I consent to a required background check through Shape's screening partner before my coach profile can go live." })}</ApCheck>
        </div>
        {/* ⚠ NUTRITION COMPLIANCE ATTESTATIONS — /api/apply REFUSES a nutritionist
            application without all four (NC1). This surface omitted them, so every
            nutritionist applying from the app was answered 400 and, before the
            round-15 rethrow, silently fell back to a direct insert that skipped the
            route's own re-check. Keys come from the canonical module, not retyped. */}
        {!isTrainer && (
          <div data-apply-attest="" style={{ display: 'grid', gap: 2, borderTop: `1px solid ${inkA(t, 0.1)}`, paddingTop: 16 }}>
            <ApNote t={t}>{tr('onboarding:apply.review.compliance', { defaultValue: "Nutrition practice · compliance. Shape re-checks your state licensure against each client's state on every pairing." })}</ApNote>
            <div style={{ height: 6 }} />
            {REQUIRED_ATTESTATIONS.map((key) => (
              <ApCheck key={key} t={t} fieldKey={`attest.${key}`} checked={Boolean((values.attest || {})[key])} onChange={(on) => setAttest(key, on)} error={tick(`attest.${key}`)}>
                {attestWords[key] || key}
              </ApCheck>
            ))}
          </div>
        )}
      </>
    );
  })();

  const onReview = name === 'review';
  const continueWord = onReview
    ? (submitting ? tr('onboarding:apply.sending', { defaultValue: 'Sending…' }) : tr('onboarding:apply.send', { defaultValue: 'Send application' }))
    : name === 'role' && noraKeys.length
      ? tr('onboarding:apply.nora.reviewFilled', { defaultValue: 'Review what Nora filled' })
      : fromReview ? tr('onboarding:apply.backToReview', { defaultValue: 'Back to review' }) : tr('onboarding:apply.continue', { defaultValue: 'Continue' });
  // Save and finish later only where the draft outlives this session: signed in. Signed out, the draft
  // keeps for the session (going back and returning), and the link would promise more than that.
  const saveLater = !signedIn ? null : (
    <button type="button" data-apply-save-later="" onClick={saveAndLeave} style={{ ...quietLink, padding: '0 0 0 12px', margin: host ? '-5px 0' : 0 }}>{tr('onboarding:apply.saveLater', { defaultValue: 'Save and finish later' })}</button>
  );

  return frame(
    <>
      {/* The head: ← (the step before; on the first, out), Save and finish later, the seven segments. On
          the sign-in route Main's Ask Nora door sits at this corner, so Save and finish later goes under
          the button instead. */}
      <div style={{ flex: 'none', padding: `${backTop} ${padX}px 10px` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 34 }}>
          {BackButton ? <BackButton compact onClick={goBack} ink={t.INK} /> : <span />}
          {host ? saveLater : null}
        </div>
        <div role="progressbar" aria-valuemin={1} aria-valuemax={AP_STEPS.length} aria-valuenow={step + 1} aria-label={tr('onboarding:apply.progress', { defaultValue: 'Step {n} of {total}', n: step + 1, total: AP_STEPS.length })} data-apply-progress="" style={{ display: 'flex', gap: 4, marginTop: 10 }}>
          {AP_STEPS.map((s, i) => <span key={s} data-on={i <= step ? '' : undefined} style={{ flex: 1, height: 4, borderRadius: 2, background: i <= step ? teal : inkA(t, 0.12), transition: 'background 200ms ease' }} />)}
        </div>
      </div>
      <div ref={scrollRef} className="bs-hide-scroll" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden', WebkitOverflowScrolling: 'touch', padding: `8px ${padX}px 28px` }}>
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 16, animation: 'ap-in 260ms ease-out both' }}>
          <div>
            <div data-apply-kicker="" style={{ fontFamily: BS_CLEAN_SANS, fontSize: 13, fontWeight: 600, color: t.INK50 }}>{kicker}</div>
            <h1 style={{ ...titleStyle, marginTop: 6 }}>{titleOf[name]}<span aria-hidden="true" style={{ color: teal }}>.</span></h1>
            {subOf[name] ? <p style={subStyle}>{subOf[name]}</p> : null}
          </div>
          {restored ? (
            <p data-apply-restored="" style={{ margin: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', columnGap: 6, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, color: t.INK70 }}>
              <span><span aria-hidden="true" style={{ color: tealText }}>✓ </span>{tr('onboarding:apply.draft.restored', { defaultValue: 'Draft restored' })}</span>
              <span aria-hidden="true">·</span>
              <button type="button" onClick={startOver} style={{ ...quietLink, padding: 0 }}>{tr('onboarding:apply.draft.startOver', { defaultValue: 'Start over' })}</button>
            </p>
          ) : null}
          {name !== 'review' && hasNora(name) ? <ApNoraFilled t={t} /> : null}
          {body}
        </div>
      </div>
      <div style={footStyle}>
        {onReview && error ? (
          <p role="alert" data-apply-send-error="" style={{ margin: '0 0 10px', padding: '10px 12px', borderRadius: 12, border: `1px solid ${apRed(t)}`, fontFamily: BS_CLEAN_SANS, fontSize: 13.5, fontWeight: 500, lineHeight: 1.4, color: apRed(t) }}>{error}</p>
        ) : null}
        <button type="button" data-apply-continue="" disabled={submitting} onClick={() => (onReview ? submit() : goNext())} style={primaryBtn(submitting)}>{continueWord}</button>
        {host ? (
          <p style={caption}>
            {onReview ? tr('onboarding:apply.review.foot', { defaultValue: 'We review in 2–3 business days' }) : fromReview ? null : tr('onboarding:apply.next', { defaultValue: 'Next: {step}', step: stepWord[AP_STEPS[step + 1]] })}
          </p>
        ) : (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 2 }}>{saveLater}</div>
        )}
      </div>
    </>,
  );
}

Object.assign(window, { BSProviderApplicationScreen });
