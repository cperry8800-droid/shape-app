// The forms Nora helps fill in (the Ask Nora plan, step 5): the member sign-up and the
// trainer and nutritionist applications (public/newdesign/signup.jsx). The SERVER names
// every field she may fill and every value a choice accepts. The page says only which form
// and step it is and which fields already hold something, never what they hold.
//
// ⚠ NEVER FILLED: a password, an uploaded document, a consent or agreement box (terms,
// waiver, background check, credential verification, the nutrition attestations), the human
// check, or the submit. Those stay the person's own taps, and no key for them exists here,
// so a value the model sends for one is dropped. The page refuses them too (signup.jsx).
// The state-license rows are left to the person: a licence number is checked by review.
//
// The app has its own two (the create step of BSLogin and BSProviderApplicationScreen):
// the same rules, with the fields and lists those screens show (`app_*`).
//
// Pure: no I/O, no clock beyond the `now` a caller passes.
import { validZone } from './noraContext.mjs';

const text = (key, label, max = 120) => ({ key, label, type: 'text', max });
const longText = (key, label, max = 600) => ({ key, label, type: 'text', max });
const choice = (key, label, options) => ({ key, label, type: 'choice', options });
const many = (key, label, options) => ({ key, label, type: 'many', options });
const date = (key, label, { past = false } = {}) => ({ key, label, type: 'date', past });
const amount = (key, label, maxValue) => ({ key, label, type: 'number', max: maxValue });
const EMAIL = { key: 'email', label: 'Email', type: 'email' };
const USERNAME = { key: 'username', label: 'Username (their @handle)', type: 'username' };
const PHONE = { key: 'phone', label: 'Phone', type: 'phone' };
const ZONE = { key: 'tz', label: 'Time zone (an IANA name such as America/New_York)', type: 'zone' };

// The choices exactly as signup.jsx offers them; a test keeps the two in step.
export const CHOICES = {
  goal: ['Lose weight', 'Build muscle', 'Improve endurance', 'Increase flexibility', 'General fitness'],
  experience: ['Beginner', 'Intermediate', 'Advanced'],
  frequency: ['1-2 times per week', '3-4 times per week', '5-6 times per week', 'Daily'],
  sex: ['Prefer not to say', 'Female', 'Male'],
  accountability: ['Hands-off — check in when I need help', 'Balanced — weekly check-ins', 'High-touch — daily messages & reminders'],
  interests: ['Personal training', 'Nutrition coaching', 'Both'],
  budget: ['Optional', 'Under $25/mo', '$25 – $50/mo', '$50 – $100/mo', '$100+/mo'],
  nutritionType: ['Nutritionist', 'Dietitian (RD / RDN)'],
  years: ['7-10 years', '10-15 years', '15+ years'],
  insurance: ['Yes', 'No', 'In progress'],
  rdCredential: ['rd', 'rdn'],
  trainerSpecs: ['Strength & Powerlifting', 'HIIT & Fat Loss', 'At-home Workouts', 'Cardio & Endurance', 'Functional Fitness', 'Bodybuilding', 'Sports Performance', 'Mobility', 'Run coaching'],
  nutriSpecs: ['Weight management', 'Sports nutrition', 'Plant-based', 'Gut health', 'Hormonal health', 'Pre/postnatal', 'Endurance fueling', 'Clinical / medical'],
  // The app's application lists two more trainer specialties and one more nutrition one
  // (iosAppBroadsheetProviderApply.jsx); a test keeps these in step with it.
  appTrainerSpecs: ['Strength & Powerlifting', 'HIIT & Fat Loss', 'At-home Workouts', 'Cardio & Endurance', 'Marathon', 'Ultra', 'Functional Fitness', 'Bodybuilding', 'Sports Performance', 'Mobility', 'Run coaching'],
  appNutriSpecs: ['Weight management', 'Sports nutrition', 'Plant-based', 'Gut health', 'Hormonal health', 'Pre/postnatal', 'Endurance fueling', 'Clinical / medical', 'Meal prep'],
  trainerPopulations: ['Beginners', 'Women 30-50', 'Men 40+', 'Postnatal', 'Athletes', 'Seniors', 'Rehab', 'Youth'],
  nutriPopulations: ['Endurance athletes', 'Strength athletes', 'Weight loss', 'Clinical conditions', 'Plant-based', 'Postnatal', 'Youth'],
  accepting: ['Yes', 'Waitlist', 'Not yet'],
  oneOnOne: ['Yes', 'No'],
  response: ['Within 12 hours', 'Within 24 hours', 'Within 48 hours'],
  intro: ['15-minute free intro', '30-minute free intro', 'No free intro'],
};

// `app`: the app's screen, which has no username or nutrition compliance text fields
// (its attestations are boxes, which are never hers) and its own specialty lists.
function application(kind, { app = false } = {}) {
  const trainer = kind === 'trainer';
  const specs = trainer ? (app ? CHOICES.appTrainerSpecs : CHOICES.trainerSpecs) : (app ? CHOICES.appNutriSpecs : CHOICES.nutriSpecs);
  return {
    title: trainer ? 'trainer application' : 'nutritionist application',
    facts: [
      'Shape is 18+ for coaches.',
      `A provider profile needs at least 5 years of professional ${trainer ? 'training or coaching' : 'nutrition coaching or clinical'} experience before it can go live.`,
      "Credentials may be verified by Shape's trust team, and a background check (Checkr) is required; the review team sends the screening invite after the application is reviewed.",
      'The team reviews an application and reaches out within 2–3 business days.',
      ...(trainer ? [] : ['Without a state dietitian license a nutritionist offers general wellness guidance only, not individualized or clinical nutrition plans; a dietitian must be licensed in each client\'s state.']),
    ],
    steps: [
      { name: 'Personal', fields: [text('firstName', 'First name', 60), text('lastName', 'Last name', 60), ...(app ? [] : [USERNAME]), EMAIL, PHONE, date('dob', 'Date of birth', { past: true }), text('city', 'City, State / Country'), ZONE, text('social', 'Social handles (optional)'), longText('bio', `Short bio: why they got into ${trainer ? 'coaching' : 'nutrition'}`)] },
      { name: 'Credentials', fields: [
        ...(trainer || app ? [] : [choice('nutritionType', 'Professional type', CHOICES.nutritionType)]),
        text('cert', trainer ? 'Primary certification' : 'License type, or the RD/RDN registration number for a dietitian'),
        text('certExp', trainer ? 'Certification expiration / renewal' : 'License state + number'),
        text('edu', 'Degree / school'),
        choice('years', 'Years of professional experience', CHOICES.years),
        choice('insurance', 'Liability insurance', CHOICES.insurance),
        text('prev', 'Previous platforms (optional)'),
        ...(trainer || app ? [] : [
          text('cdrId', 'CDR registration number (dietitians only)', 20),
          choice('rdCredential', 'Credential type (dietitians only)', CHOICES.rdCredential),
          text('insCarrier', 'Insurance carrier', 80),
          text('insPolicy', 'Insurance policy number', 60),
          date('insExpires', 'Insurance expiration'),
        ]),
      ] },
      { name: 'Specialty', fields: [
        choice('primary', 'Primary specialty', specs),
        many('secondary', 'Secondary specialties', specs),
        many('populations', 'Populations they work best with', trainer ? CHOICES.trainerPopulations : CHOICES.nutriPopulations),
        text('style', 'Coaching style, one sentence', 160),
      ] },
      { name: app ? 'Pricing' : 'Availability & pricing', fields: [
        amount('maxClients', 'Most clients they can take', 500),
        choice('accepting', 'Accepting new clients', CHOICES.accepting),
        choice('oneOnOne', trainer ? 'Offer 1-on-1 sessions' : 'Offer 1-on-1 consults', CHOICES.oneOnOne),
        choice('response', 'Response time commitment', CHOICES.response),
        amount('subPrice', trainer ? 'Monthly subscription ($/mo)' : 'Monthly plan ($/mo)', 10000),
        amount('sessionPrice', trainer ? 'Single session ($)' : 'Single consult ($)', 10000),
        choice('intro', 'Free intro', CHOICES.intro),
      ] },
    ],
  };
}

export const FORMS = {
  signup: {
    title: 'member sign-up',
    facts: [
      'Shape is 18+.',
      'Signing up creates the account; health answers help their coach keep them safe and stay private.',
    ],
    steps: [
      { name: 'Personal', fields: [text('firstName', 'First name', 60), text('lastName', 'Last name', 60), USERNAME, EMAIL] },
      { name: 'Goals', fields: [choice('goal', 'Primary fitness goal', CHOICES.goal), choice('experience', 'Experience level', CHOICES.experience), choice('frequency', 'How often they work out', CHOICES.frequency)] },
      { name: 'Health intake', fields: [
        date('dob', 'Date of birth', { past: true }),
        choice('sex', 'Biological sex', CHOICES.sex),
        text('injuries', 'Injuries or physical limitations', 200),
        text('medications', 'Prescription medications', 200),
        text('medical', 'Other medical conditions', 200),
        text('diet', 'Allergies (food, medication, other)', 200),
        text('emergency', 'Emergency contact (name and phone)', 120),
        choice('accountability', 'Accountability style', CHOICES.accountability),
      ] },
      { name: 'Preferences', fields: [many('interests', 'Most interested in', CHOICES.interests), choice('budget', 'Budget per month', CHOICES.budget)] },
    ],
  },
  apply_trainer: application('trainer'),
  apply_nutritionist: application('nutritionist'),
  // The app's create-account steps: who they are, then how they sign in. The role is
  // picked on the first step and a coach goes on to the application; the password and
  // the phone sign-in stay theirs.
  app_signup: {
    title: 'account sign-up',
    facts: [
      'Shape is 18+.',
      'On the first step they choose member, trainer or nutritionist; a trainer or nutritionist continues to the coach application.',
    ],
    steps: [
      { name: 'Identity', fields: [text('fullName', 'Full name', 80), date('dob', 'Date of birth', { past: true }), USERNAME] },
      { name: 'Credentials', fields: [EMAIL] },
    ],
  },
  app_apply_trainer: application('trainer', { app: true }),
  app_apply_nutritionist: application('nutritionist', { app: true }),
};

// The keys the page itself refuses as well; none is ever a field above (a test checks).
export const NEVER_FILLED = ['password', 'tos', 'waiver', 'verify', 'conduct', 'bgcheck', 'attest', 'resumeFile', 'credentialFile', 'insuranceFile', 'licenses', 'captcha', 'turnstile'];

const fieldsOf = (kind) => (FORMS[kind] ? FORMS[kind].steps.flatMap((s) => s.fields) : []);

// The page's claim: which form, which step, which fields hold something. Every part is
// reduced to a known value, so nothing the page writes reaches the prompt as text.
export function cleanFormContext(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const kind = typeof raw.kind === 'string' && Object.prototype.hasOwnProperty.call(FORMS, raw.kind) ? raw.kind : null;
  if (!kind) return null;
  const steps = FORMS[kind].steps.length;
  const step = Number.isInteger(raw.step) && raw.step >= 0 && raw.step < steps ? raw.step : 0;
  const known = new Set(fieldsOf(kind).map((f) => f.key));
  const filled = Array.isArray(raw.filled) ? [...new Set(raw.filled.filter((k) => typeof k === 'string' && known.has(k)))] : [];
  return { kind, step, filled };
}

// The note that tells her about the form. Built only from the definitions above and the
// cleaned claim, so it can sit in the system tier.
export function formNote(form) {
  const def = form && FORMS[form.kind];
  if (!def) return '';
  const filled = new Set(form.filled);
  const lines = def.steps.map((s, i) => {
    const fields = s.fields.map((f) => {
      const opts = f.options ? ` — one of: ${f.options.map((o) => `"${o}"`).join(', ')}${f.type === 'many' ? ' (several allowed)' : ''}` : '';
      return `${f.label} [${f.key}]${filled.has(f.key) ? ' (filled)' : ''}${opts}`;
    }).join('; ');
    return `Step ${i + 1} · ${s.name}${i === form.step ? ' (they are here)' : ''}: ${fields}.`;
  });
  return [
    `FORM: They have the Shape ${def.title} open, on step ${form.step + 1} of ${def.steps.length} (${def.steps[form.step].name}). Help them through it: explain any question in plain words, and answer from the facts below or shape_help.`,
    'To fill it in for them, call fill_form with ONLY values they told you in this conversation, by field key. Never guess or invent a name, email, date, number or answer; ask for what is missing, a few at a time. A card then shows the values and they tap "Fill these in"; you never submit, and they review every step and continue themselves. Say so briefly.',
    'You can never fill or tick their password, an uploaded document, the human check, or any agreement or consent box (terms, waiver, background check, credential verification, attestations): tell them those are theirs to do on the form. Leave the state license rows to them too.',
    `Facts the form states: ${def.facts.join(' ')}`,
    `Fields you may fill: ${lines.join(' ')}`,
  ].join('\n');
}

const norm = (s) => String(s).toLowerCase().replace(/[\s–—-]+/g, ' ').replace(/\s+/g, ' ').trim();

// A choice the model named, as the page spells it: an exact match (ignoring case, spaces
// and dash style), else the one option it is the start of.
function matchOption(options, value) {
  const v = norm(value);
  if (!v) return null;
  const exact = options.find((o) => norm(o) === v);
  if (exact) return exact;
  if (v.length < 3) return null;
  const starts = options.filter((o) => norm(o).startsWith(v));
  return starts.length === 1 ? starts[0] : null;
}

function isRealDate(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

// One value, checked against its field. Returns the value as the page holds it, or null.
function cleanValue(field, raw, now) {
  const s = typeof raw === 'string' ? raw.trim() : (typeof raw === 'number' && Number.isFinite(raw) ? String(raw) : '');
  if (!s) return null;
  switch (field.type) {
    case 'text': return s.replace(/\s+/g, ' ').slice(0, field.max);
    case 'email': return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) && s.length <= 254 ? s.toLowerCase() : null;
    case 'username': {
      const u = s.replace(/^@/, '').toLowerCase().replace(/[^a-z0-9._]/g, '').slice(0, 20);
      return /^[a-z0-9][a-z0-9._]{2,19}$/.test(u) ? u : null;
    }
    case 'phone': return /^[+()\d][\d\s().+-]{5,28}$/.test(s) ? s : null;
    case 'zone': return validZone(s) ? s : null;
    case 'date': {
      if (!isRealDate(s)) return null;
      const year = +s.slice(0, 4);
      if (year < 1900) return null;
      if (field.past && s >= now.toISOString().slice(0, 10)) return null;
      return s;
    }
    case 'number': {
      if (!/^\d{1,6}(\.\d{1,2})?$/.test(s)) return null;
      const n = Number(s);
      return n >= 0 && n <= field.max ? s : null;
    }
    case 'choice': return matchOption(field.options, s);
    default: return null;
  }
}

// What fill_form sent ({ fields: [{ key, value }] }), checked field by field. A key that is
// not on this form, or a value the field cannot hold, is dropped and named, never guessed.
// A field given twice keeps its last value; a several-choice field gathers every value given.
/**
 * @param {string} kind
 * @param {unknown} raw
 * @param {Date} [now]
 * @returns {{ values: Record<string, string | string[]>, fields: Array<{ key: string, label: string, value: string }>, dropped: string[] }}
 */
export function cleanFill(kind, raw, now = new Date()) {
  const byKey = new Map(fieldsOf(kind).map((f) => [f.key, f]));
  /** @type {Record<string, any>} */
  const values = {};
  /** @type {string[]} */
  const dropped = [];
  const list = raw && typeof raw === 'object' ? /** @type {{ fields?: unknown }} */ (raw).fields : null;
  const items = Array.isArray(list) ? list.slice(0, 60) : [];
  for (const item of items) {
    const key = item && typeof item.key === 'string' ? item.key.trim() : '';
    const field = byKey.get(key);
    if (!field) { if (key) dropped.push(key); continue; }
    if (field.type === 'many') {
      const parts = String(item.value ?? '').split(/\s*[;,|]\s*/).filter(Boolean);
      const picked = parts.map((p) => matchOption(field.options, p)).filter(Boolean);
      if (!picked.length) { dropped.push(key); continue; }
      values[key] = [...new Set([...(values[key] || []), ...picked])];
      continue;
    }
    const v = cleanValue(field, item.value, now);
    if (v === null) { dropped.push(key); continue; }
    values[key] = v;
  }
  const fields = fieldsOf(kind)
    .filter((f) => Object.prototype.hasOwnProperty.call(values, f.key))
    .map((f) => ({ key: f.key, label: f.label.replace(/ \(.*\)$/, ''), value: Array.isArray(values[f.key]) ? values[f.key].join(', ') : values[f.key] }));
  return { values, fields, dropped: [...new Set(dropped)] };
}

export const FILL_FORM_TOOL = {
  type: 'function',
  name: 'fill_form',
  description: 'Fill in fields of the sign-up or coach application form they have open, with values they told you. Shows them a card; nothing is filled until they tap it, and nothing is ever submitted. Only for fields listed in the FORM note.',
  parameters: {
    type: 'object',
    properties: {
      fields: {
        type: 'array',
        description: 'One entry per field. For a several-choice field, list the choices separated by commas.',
        items: {
          type: 'object',
          properties: {
            key: { type: 'string', description: 'The field key from the FORM note, e.g. firstName.' },
            value: { type: 'string', description: 'The value exactly as they gave it; a choice as the form spells it; a date as YYYY-MM-DD.' },
          },
          required: ['key', 'value'],
          additionalProperties: false,
        },
      },
    },
    required: ['fields'],
    additionalProperties: false,
  },
  strict: true,
};
