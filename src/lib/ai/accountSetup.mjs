// Nora sets the account up (the owner, 2026-09-29: "make Nora pop up when you are going through
// creating an account, that can fill evreything out for you, regading application etc. and also
// setup your account for you"). #2258 and #2259 shipped the first half: she answers questions on
// sign-up and the coach application and fills those forms in with the person. This is the second:
// once the account exists, she configures it from the conversation, the things a new member or
// coach would otherwise click through in the first-run steps and in Settings.
//
// ⚠ A MODEL'S OUTPUT IS UNTRUSTED INPUT. Every value Nora proposes is checked here against the
// same vocabulary the screen that owns it offers (the goal step, Settings' option rows, the
// notification centre, Make it yours), and anything else is refused by name on the card:
//   - an ALLOWLIST of fields (SETUP_FIELDS); a field that is not on it never reaches a write;
//   - the fields that are the person's own to do (their email, password, birth date, payment, the
//     agreements and the health screening) are refused as theirs, whatever Nora is told;
//   - only the signed-in account's own records: the target is the actor, a proposal naming any
//     other account is refused outright, and every write is keyed on the actor's id under RLS.
//
// ⚠ IT RIDES THE PREVIEW / CONFIRM SCAFFOLD (proposals.mjs), LIKE EVERY WRITE NORA MAKES. buildPreview
// is pure apart from its reads; the card lists each change (before → after) and each refusal; the
// signed token carries the exact cells; Confirm applies them all, Undo restores them all.
//
// ⚠ THE WRITES ARE THE SCREENS' OWN STORES, GUARDED IN THE STATEMENT. The member's documents are the
// user_goals rows the goal step and Settings write (client_goals, client_identity, client_onboarding,
// client_training_prefs, client_nutrition_prefs, client_settings, a coach's profile_custom); quiet
// hours and the daily limit are the notification centre's notification_settings row; the name is
// profiles.full_name with its client_identity mirror (settingsSync.mjs's displayName). Each
// user_goals document is written compare-and-set on its updated_at (the touch trigger moves it on
// every write), so a Settings save that lands between our read and our write is never overwritten;
// a row or column is written only while it still holds what was read.
//
// ⚠ A CHANGE SINCE THE CARD WAS DRAWN STOPS THE WHOLE APPLY, AND A FAILED APPLY IS ROLLED BACK. Confirm
// first reads every cell and refuses (nothing written) if any no longer holds what the card showed as
// "before". A write that fails part way restores what it had already written, so a failed confirm
// leaves no half-applied setup with no undo handle. Undo restores each cell that still holds what
// Confirm wrote, skips one already restored, and refuses (nothing undone) if any was changed since.
//
// Pure and dependency-injected (the Supabase client is the caller's own, RLS-scoped), so it runs in
// node:test with a fake and in the routes with the real thing.

import { SIGNUP_GOALS, SIGNUP_GOAL_MAX, signupGoalFromText } from '../signup-answers.mjs';
import { primaryGoalLabel, primaryGoalFromWords } from './goalLabels.mjs';
import { BS_PREF_OPTIONS } from '../../../public/newdesign/prefOptions.mjs';
import {
  bsProfileLine, bsProfileAbout, bsCleanText, bsCleanStory, BS_LINE_MAX, BS_ABOUT_STORY_MAX, BS_ABOUT_FACT_MAX, BS_ABOUT_YEARS_MAX,
} from '../../../public/newdesign/profileCustom.mjs';

// ── The vocabulary each screen offers ─────────────────────────────────────────────────────────
// Settings' Preferences rows (iosAppBroadsheetClient.jsx PREF_OPTIONS; settingsSync.mjs
// settingOptions for units). The stored value is the label, as the pane stores it.
export const UNITS_IMPERIAL = 'Imperial · lb / mi';
export const UNITS_METRIC = 'Metric · kg / km';
const WEEK_STARTS = ['Monday', 'Sunday'];
// The notification centre (iosAppBroadsheetClient.jsx _NP_CAPS, and the table's own defaults for
// an account with no row yet: 2026-06-17-notification-center.sql).
export const DAILY_CAPS = Object.freeze([2, 3, 4, 6, 8]);
export const NOTIFY_DEFAULTS = Object.freeze({ quiet_start: 22, quiet_end: 7, daily_cap: 4 });
// A goal in the member's own words is kept to the goal step's length (signup-answers.mjs).
const NAME_MAX = 60;
// At most this many changes in one card: a whole first run is about a dozen.
export const SETUP_MAX_CHANGES = 25;

const COACH_ROLES = ['trainer', 'nutritionist', 'dietitian'];
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const has = (o, k) => Object.prototype.hasOwnProperty.call(o || {}, k);
// Case, spacing and punctuation folded, with the Turkish i family made one letter (prefOptions.mjs).
const fold = (v) => String(v == null ? '' : v).normalize('NFKC').replace(/[İı]/g, 'i').toLowerCase()
  .replace(/[\s_·/\-–—.,+()]+/g, ' ').trim();
const text = (v) => (typeof v === 'string' ? v : typeof v === 'number' && Number.isFinite(v) ? String(v) : typeof v === 'boolean' ? String(v) : null);

// One of a Settings option row: its token, its English label, or the token spelled loosely.
function option(row, raw) {
  const s = text(raw);
  if (s == null || !s.trim() || s.length > 60) return null;
  const rows = BS_PREF_OPTIONS[row] || [];
  const f = fold(s);
  const hit = rows.find((o) => o.id === s.trim()) || rows.find((o) => fold(o.en) === f) || rows.find((o) => fold(o.id) === f);
  return hit ? hit.id : null;
}
const optionLabel = (row, id) => ((BS_PREF_OPTIONS[row] || []).find((o) => o.id === id) || { en: id }).en;

function onOff(raw) {
  if (raw === true) return 'On';
  if (raw === false) return 'Off';
  const f = fold(text(raw));
  if (['on', 'yes', 'true', 'enable', 'enabled'].includes(f)) return 'On';
  if (['off', 'no', 'false', 'disable', 'disabled'].includes(f)) return 'Off';
  return null;
}

// An hour of the day, on the hour, as the notification centre keeps quiet hours: 0-23, "22:00",
// "10 pm", "noon", "midnight". A time with minutes is refused rather than rounded.
export function parseHour(raw) {
  if (typeof raw === 'number') return Number.isInteger(raw) && raw >= 0 && raw <= 23 ? raw : null;
  const s = fold(text(raw)).replace(/\s+/g, '');
  if (!s) return null;
  if (s === 'midnight') return 0;
  if (s === 'noon' || s === 'midday') return 12;
  const m = s.match(/^(\d{1,2})(?::(\d{2}))?(am|pm|a|p)?$/);
  if (!m) return null;
  let h = Number(m[1]);
  if (m[2] != null && m[2] !== '00') return null;
  const half = m[3] ? m[3][0] : null;
  if (half) {
    if (h < 1 || h > 12) return null;
    h = h % 12 + (half === 'p' ? 12 : 0);
  }
  return h >= 0 && h <= 23 ? h : null;
}
export const hourLabel = (h) => (h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`);

// A name as a person writes it: no control characters, single spaces, a letter in it, and nothing
// that reads as an address or a link (a name is shown on the leaderboard and in chat).
function cleanName(raw) {
  const s = text(raw);
  if (s == null) return null;
  const out = Array.from(s.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim());
  if (!out.length || out.length > NAME_MAX) return null;
  const name = out.join('');
  if (!/\p{L}/u.test(name) || /@|:\/\/|www\./i.test(name)) return null;
  return name;
}

// One line of a coach's About (bsCleanText's rule), refused rather than cut when it is too long.
function line(raw, max) {
  const s = text(raw);
  if (s == null) return null;
  const clean = bsCleanText(s.replace(/\s+/g, ' '), 0);
  return clean && clean.length <= max ? clean : null;
}

const COACHING = {
  none: { wants: false, for: [] },
  training: { wants: true, for: ['training'] },
  nutrition: { wants: true, for: ['nutrition'] },
  both: { wants: true, for: ['training', 'nutrition'] },
};
const COACHING_WORDS = {
  none: 'none', no: 'none', 'not now': 'none', 'not right now': 'none', false: 'none',
  training: 'training', trainer: 'training', 'a trainer': 'training',
  nutrition: 'nutrition', nutritionist: 'nutrition', 'a nutritionist': 'nutrition',
  both: 'both', 'trainer and nutritionist': 'both', 'both of them': 'both',
};
function coachingOf(onb) {
  if (!isObj(onb) || typeof onb.wantsCoaching !== 'boolean') return null;
  if (!onb.wantsCoaching) return 'none';
  const f = Array.isArray(onb.coachingFor) ? onb.coachingFor : [];
  const t = f.includes('training'), n = f.includes('nutrition');
  return t && n ? 'both' : t ? 'training' : n ? 'nutrition' : 'both';
}
const COACHING_LABEL = { none: 'Not right now', training: 'A trainer', nutrition: 'A nutritionist', both: 'A trainer and a nutritionist' };
const FORMAT_LABEL = { online: 'Online', in_person: 'In person', both: 'Online and in person' };
const goalLabel = (g) => (SIGNUP_GOALS.find((x) => x.id === g) || { en: g }).en;
const short = (s, n = 90) => { const a = Array.from(String(s)); return a.length > n ? `${a.slice(0, n - 1).join('')}…` : a.join(''); };

// ── The allowlist ────────────────────────────────────────────────────────────────────────────
// Each field: who may set it, how a proposed value is read (null = refused), what it writes (the
// cells: a store, a document or table, a key), how the card shows a value, and the current value
// from the cells as read. A cell marked `stamp` is a when-it-changed mark written beside the
// answer (the coaching step's coachingAt, the check-in's dailyCheckinSince): it never decides
// whether anything changed.
const doc = (kind, key, sub) => ({ store: 'goals', kind, key, ...(sub ? { sub } : {}) });
export const SETUP_FIELDS = Object.freeze({
  // The goal step ("What brings you here?"): the token the Goals page reads, the profile card's
  // label, and the step marked done. ⚠ The label is in the member's app language (`locale`, the chat's),
  // as the app's goal step and Goals page write it and the public profile shows it; English on the
  // website, as its sign-up writes it. Their own words stay their words (Codex on #2566).
  goal: {
    label: 'Goal', who: 'any',
    // A listed goal, or their own words: words, so a stray number is not a goal, and no longer than
    // the goal step's field takes (signupGoalFromText would cut it; the card must not show a cut goal).
    parse: (raw) => {
      const s = text(raw);
      if (s == null || Array.from(s.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim()).length > SIGNUP_GOAL_MAX) return null;
      // A listed goal named in any of the app's languages is that goal (goalLabels.mjs), not their words.
      const g = primaryGoalFromWords(s) || signupGoalFromText(s);
      return g && (SIGNUP_GOALS.some((x) => x.id === g) || /\p{L}/u.test(g)) ? g : null;
    },
    cells: (g, now, { locale } = {}) => [{ ...doc('client_goals', 'primaryGoal'), value: g }, { ...doc('client_identity', 'goal'), value: primaryGoalLabel(g, locale) ?? goalLabel(g) }, { ...doc('client_onboarding', 'intentSeen'), value: true }],
    show: (g) => goalLabel(g),
  },
  // The coaching step ("Are you looking for personal coaching?"). A yes still leads to the health
  // screening, which is theirs to answer (first-run stage 'health').
  coaching: {
    label: 'Personal coaching', who: 'any',
    parse: (raw) => { const k = COACHING_WORDS[fold(text(raw))]; return k || null; },
    cells: (k, now) => [
      { ...doc('client_onboarding', 'wantsCoaching'), value: COACHING[k].wants },
      { ...doc('client_onboarding', 'coachingFor'), value: COACHING[k].for },
      { ...doc('client_onboarding', 'coachingAt'), value: now, stamp: true },
    ],
    current: (read) => coachingOf({ wantsCoaching: read('goals:client_onboarding:wantsCoaching'), coachingFor: read('goals:client_onboarding:coachingFor') }),
    show: (k) => COACHING_LABEL[k] || k,
  },
  // Settings → Training and Nutrition: the option rows only (a token from BS_PREF_OPTIONS). The
  // free-text rows (allergies, injuries, supplements, targets) are left to the member.
  trainingGoal: optionField('Primary goal (training)', 'client_training_prefs', 'primary_goal'),
  experience: optionField('Experience', 'client_training_prefs', 'experience'),
  sessionsPerWeek: {
    label: 'Sessions a week', who: 'any',
    parse: (raw) => { const m = fold(text(raw)).match(/^([2-6])(?: ?(?:x|days?|sessions?|times?)(?: (?:a|per) week)?)?$/); return m ? m[1] : null; },
    cells: (v) => [{ ...doc('client_training_prefs', 'sessions_per_week'), value: v }],
    show: (v) => `${v} a week`,
  },
  equipment: optionField('Equipment', 'client_training_prefs', 'equipment'),
  preferredTimes: optionField('Preferred times', 'client_training_prefs', 'preferred_times'),
  dietaryStyle: optionField('Dietary style', 'client_nutrition_prefs', 'dietary_style'),
  calorieRange: optionField('Calorie range', 'client_nutrition_prefs', 'calorie_range'),
  alcohol: optionField('Alcohol', 'client_nutrition_prefs', 'alcohol'),
  // Settings → Preferences.
  units: {
    label: 'Units', who: 'any',
    parse: (raw) => {
      const f = fold(text(raw));
      if (f === fold(UNITS_METRIC) || ['metric', 'kg', 'kilograms', 'km', 'kg km'].includes(f)) return UNITS_METRIC;
      if (f === fold(UNITS_IMPERIAL) || ['imperial', 'lb', 'lbs', 'pounds', 'mi', 'miles', 'lb mi'].includes(f)) return UNITS_IMPERIAL;
      return null;
    },
    cells: (v) => [{ ...doc('client_settings', 'units'), value: v }],
    show: (v) => v,
  },
  weekStarts: {
    label: 'Week starts on', who: 'any',
    parse: (raw) => { const f = fold(text(raw)); return f === 'monday' || f === 'mon' ? 'Monday' : f === 'sunday' || f === 'sun' ? 'Sunday' : null; },
    cells: (v) => [{ ...doc('client_settings', 'weekStarts'), value: v }],
    show: (v) => v,
  },
  // The Morning check-in on Home. An absent key reads ON (useBSDailyCheckinPref's rule), and the
  // switch's time is stamped as the Settings pane stamps it (the score job reads it).
  dailyCheckin: {
    label: 'Morning check-in', who: 'any',
    parse: onOff,
    cells: (v, now) => [{ ...doc('client_settings', 'dailyCheckin'), value: v }, { ...doc('client_settings', 'dailyCheckinSince'), value: now, stamp: true }],
    current: (read) => { const v = read('goals:client_settings:dailyCheckin'); return v == null ? 'On' : onOff(v) || 'On'; },
    show: (v) => v,
  },
  // The notification centre: quiet hours and the daily limit (mute stays a switch they flip).
  quietStart: notifyField('Quiet hours from', 'quiet_start', parseHour, hourLabel),
  quietEnd: notifyField('Quiet hours until', 'quiet_end', parseHour, hourLabel),
  dailyLimit: notifyField('Daily notification limit', 'daily_cap', (raw) => { const n = Number(text(raw)); return DAILY_CAPS.includes(n) ? n : null; }, (n) => `${n} a day`),
  // The display name: profiles.full_name (the leaderboard, chat, search) and its client_identity
  // mirror, as Settings saves it (settingsSync.mjs displayName).
  name: {
    label: 'Name', who: 'any',
    parse: cleanName,
    cells: (v) => [{ store: 'profile', key: 'full_name', value: v }, { ...doc('client_identity', 'name'), value: v }],
    show: (v) => v,
  },
  // A coach's profile (Make it yours): the headline and the About, through the canonical
  // profile_custom cleaners. Rates, hours and specialties stay in their own editors.
  headline: {
    label: 'Headline', who: 'coach',
    parse: (raw) => { const v = line(raw, BS_LINE_MAX); return v && bsProfileLine(v) === v ? v : null; },
    cells: (v) => [{ ...doc('profile_custom', 'line'), value: v }],
    show: (v) => v,
  },
  aboutStory: {
    label: 'About you', who: 'coach',
    parse: (raw) => { const s = text(raw); if (s == null) return null; const v = bsCleanStory(s, 0); return v && v.length <= BS_ABOUT_STORY_MAX ? v : null; },
    cells: (v) => [{ ...doc('profile_custom', 'about', 'story'), value: v }],
    show: (v) => short(v),
  },
  yearsCoaching: {
    label: 'Years coaching', who: 'coach',
    parse: (raw) => { const n = Number(fold(text(raw)).replace(/ ?(years?|yrs?)$/, '')); return Number.isInteger(n) && n >= 1 && n <= BS_ABOUT_YEARS_MAX ? n : null; },
    cells: (v) => [{ ...doc('profile_custom', 'about', 'years'), value: v }],
    show: (v) => `${v} year${v === 1 ? '' : 's'}`,
  },
  coachingFormat: {
    label: 'How you coach', who: 'coach',
    parse: (raw) => { const f = fold(text(raw)); return f === 'online' || f === 'remote' ? 'online' : f === 'in person' || f === 'inperson' || f === 'face to face' ? 'in_person' : f === 'both' || f === 'online and in person' || f === 'hybrid' ? 'both' : null; },
    cells: (v) => [{ ...doc('profile_custom', 'about', 'how'), value: v }],
    show: (v) => FORMAT_LABEL[v] || v,
  },
  basedIn: {
    label: 'Based in', who: 'coach',
    parse: (raw) => line(raw, BS_ABOUT_FACT_MAX),
    cells: (v) => [{ ...doc('profile_custom', 'about', 'where'), value: v }],
    show: (v) => v,
  },
  languages: {
    label: 'Languages', who: 'coach',
    parse: (raw) => line(raw, BS_ABOUT_FACT_MAX),
    cells: (v) => [{ ...doc('profile_custom', 'about', 'languages'), value: v }],
    show: (v) => v,
  },
});
function optionField(label, kind, row) {
  return {
    label, who: 'any',
    parse: (raw) => option(row, raw),
    cells: (v) => [{ ...doc(kind, row), value: v }],
    show: (v) => optionLabel(row, v),
  };
}
function notifyField(label, col, parse, show) {
  return { label, who: 'any', parse, cells: (v) => [{ store: 'notify', key: col, value: v }], show };
}

export const SETUP_FIELD_KEYS = Object.freeze(Object.keys(SETUP_FIELDS));
export const cellId = (c) => (c.store === 'goals' ? `goals:${c.kind}:${c.key}${c.sub ? `.${c.sub}` : ''}` : `${c.store}:${c.key}`);
// Every cell any field can write. Confirm and Undo refuse a plan carrying any other (the token is
// signed, so this is defence in depth: a write outside this set cannot be expressed at all).
export const ALLOWED_CELLS = Object.freeze(new Set(SETUP_FIELD_KEYS.flatMap((k) => SETUP_FIELDS[k].cells(firstValid(k), 'x').map(cellId))));
// The when-it-changed stamps among them (coachingAt, dailyCheckinSince), named by the allowlist
// itself, so the stamp written at confirm never rests on a flag the token carries.
export const STAMP_CELLS = Object.freeze(new Set(SETUP_FIELD_KEYS.flatMap((k) => SETUP_FIELDS[k].cells(firstValid(k), 'x').filter((c) => c.stamp).map(cellId))));
function firstValid(k) {
  // A representative value per field, only to enumerate the cells it writes.
  return { goal: 'muscle', coaching: 'both', sessionsPerWeek: '3', units: UNITS_METRIC, weekStarts: 'Monday', dailyCheckin: 'On', quietStart: 22, quietEnd: 7, dailyLimit: 4, name: 'A', headline: 'A', aboutStory: 'A', yearsCoaching: 1, coachingFormat: 'online', basedIn: 'A', languages: 'A' }[k] ?? 'x';
}

// ── What is never Nora's to set ──────────────────────────────────────────────────────────────
// Asked for by name, these are refused as the person's own to do: credentials and contact, the
// birth date, payment and the membership, the agreements, the health screening, roles, and the
// privacy switches (who sees their profile, workouts and age is theirs to choose, not a model's).
const YOURS_RE = /pass ?word|e ?mail|phone|user ?name|handle|birth|dob|\bage\b|terms|\btos\b|agree|consent|waiver|par ?q|health|screen|medic|condition|pregnan|injur|allerg|card|pay|bill|bank|stripe|subscri|member|price|rate|charge|role|admin|privacy|visib|share|public/;
export const REFUSED_REASONS = Object.freeze({
  yours: 'Yours to do yourself',
  not_here: 'Nora can’t set this',
  invalid: 'That doesn’t fit this setting',
  coach_only: 'For coaches only',
});
// The keys a proposal may NOT use to aim at an account. Any of them naming someone other than the
// signed-in account refuses the whole proposal: Nora sets up only the account she is talking to.
const TARGET_KEYS = ['userId', 'user_id', 'uid', 'accountId', 'account_id', 'account', 'clientId', 'client_id', 'targetUserId', 'target', 'forUser', 'email'];
export const OTHER_ACCOUNT_MSG = 'I can only set up your own account, the one you are signed in to.';
export const NOTHING_MSG = 'There is nothing I can set from that. Tell me what you would like changed.';

/**
 * The proposal, checked: each change against the allowlist and its field's own rule. Pure.
 * @returns {{ changes: Array<{field:string, value:*}>, refused: Array<{field:string, label:string, reason:string}> }}
 * Throws OTHER_ACCOUNT_MSG for a proposal aimed at anyone else.
 */
export function planSetupChanges(input, { actorId, roles = [] } = {}) {
  const inp = isObj(input) ? input : {};
  for (const k of TARGET_KEYS) {
    if (!has(inp, k) || inp[k] == null || inp[k] === '') continue;
    if (k === 'email' || String(inp[k]).trim().toLowerCase() !== String(actorId || '').toLowerCase()) throw new Error(OTHER_ACCOUNT_MSG);
  }
  const list = Array.isArray(inp.changes) ? inp.changes.slice(0, SETUP_MAX_CHANGES) : [];
  const isCoach = (Array.isArray(roles) ? roles : []).some((r) => COACH_ROLES.includes(r));
  const changes = [];
  const refused = [];
  const seen = new Set();
  for (const ch of list) {
    if (!isObj(ch)) continue;
    const field = typeof ch.field === 'string' ? ch.field.trim() : '';
    if (!field) continue;
    const spec = has(SETUP_FIELDS, field) ? SETUP_FIELDS[field] : null;
    const safe = bsCleanText(field.replace(/\s+/g, ' '), 40) || 'setting';
    const label = spec ? spec.label : safe;
    if (!spec) { refused.push({ field: safe, label, reason: YOURS_RE.test(fold(field)) ? 'yours' : 'not_here' }); continue; }
    if (seen.has(field)) { refused.push({ field, label, reason: 'invalid' }); continue; }
    seen.add(field);
    if (spec.who === 'coach' && !isCoach) { refused.push({ field, label, reason: 'coach_only' }); continue; }
    const raw = ch.value;
    const value = (typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean') && String(raw).length <= 2000 ? spec.parse(raw) : null;
    if (value == null) { refused.push({ field, label, reason: 'invalid' }); continue; }
    changes.push({ field, value });
  }
  return { changes, refused };
}

// ── Reading and comparing cells ───────────────────────────────────────────────────────────────
export const READ_FAILED_MSG = 'I could not read your account right now, so nothing was changed. Try again in a moment.';
export const STALE_MSG = 'Something on this card changed since I drafted it, so nothing was applied. Ask me again and I will draft it fresh.';
export const CHANGED_MSG = 'Changed since — nothing undone.';
export const WRITE_FAILED_MSG = 'I could not save your setup, so nothing was changed. Try again in a moment.';
// ⚠ SAID ONLY WHEN IT IS TRUE. A write that fails part way restores what it had written; when one of
// those restores fails too (the same outage, or another device saving that document in between), part
// of the setup stays saved with no Undo, and "nothing was changed" would be false (Codex on #2566). This
// names what stayed, so the member knows where to look.
export const partialSavedMsg = (labels) => `Part of your setup was saved and I could not take it back: ${labels.join(', ')}. Nothing else was changed. You can change ${labels.length === 1 ? 'it' : 'those'} in Settings.`;
export const NOT_ALLOWED_MSG = 'That setup is not one I can apply.';

// Equal as stored: absent and null alike, and an object's keys in any order (jsonb keeps its own).
const canon = (v) => (v === undefined || v === null ? null : Array.isArray(v) ? v.map(canon)
  : isObj(v) ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
export const sameValue = (a, b) => JSON.stringify(canon(a)) === JSON.stringify(canon(b));

async function readState(sb, uid, cells) {
  const out = { goals: {}, notify: undefined, profile: undefined };
  const kinds = [...new Set(cells.filter((c) => c.store === 'goals').map((c) => c.kind))];
  if (kinds.length) {
    const r = await sb.from('user_goals').select('kind, data, updated_at').eq('user_id', uid).in('kind', kinds);
    if (!r || r.error || !Array.isArray(r.data)) throw new Error(READ_FAILED_MSG);
    for (const k of kinds) out.goals[k] = null;
    for (const row of r.data) if (row && kinds.includes(row.kind)) out.goals[row.kind] = { data: isObj(row.data) ? row.data : {}, updatedAt: row.updated_at };
  }
  if (cells.some((c) => c.store === 'notify')) {
    const r = await sb.from('notification_settings').select('quiet_start, quiet_end, daily_cap').eq('user_id', uid).maybeSingle();
    if (!r || r.error) throw new Error(READ_FAILED_MSG);
    out.notify = r.data || null;
  }
  if (cells.some((c) => c.store === 'profile')) {
    const r = await sb.from('profiles').select('full_name').eq('id', uid).maybeSingle();
    if (!r || r.error || !r.data) throw new Error(READ_FAILED_MSG);
    out.profile = r.data;
  }
  return out;
}

function readCell(state, c) {
  if (c.store === 'goals') {
    const d = state.goals[c.kind] ? state.goals[c.kind].data : {};
    const base = c.sub ? (isObj(d[c.key]) ? d[c.key] : {}) : d;
    const k = c.sub || c.key;
    return has(base, k) ? { had: true, value: base[k] } : { had: false, value: null };
  }
  if (c.store === 'notify') return state.notify ? { had: true, value: state.notify[c.key] ?? NOTIFY_DEFAULTS[c.key] } : { had: false, value: NOTIFY_DEFAULTS[c.key] };
  return { had: true, value: state.profile ? (state.profile[c.key] ?? null) : null };
}

function setCell(data, c, had, value) {
  if (c.sub) {
    const inner = isObj(data[c.key]) ? { ...data[c.key] } : {};
    if (had) inner[c.sub] = value; else delete inner[c.sub];
    if (Object.keys(inner).length) data[c.key] = inner; else delete data[c.key];
  } else if (had) data[c.key] = value;
  else delete data[c.key];
}

// What Make it yours would keep of a coach's headline and About: a write the canonical cleaner
// would reshape is refused rather than saved half-kept.
function checkProfileCustom(data, cells) {
  if (cells.some((c) => c.key === 'line') && has(data, 'line') && bsProfileLine(data.line) !== data.line) throw new Error(NOT_ALLOWED_MSG);
  if (cells.some((c) => c.key === 'about') && has(data, 'about') && !sameValue(bsProfileAbout(data.about), data.about)) {
    throw new Error('Your profile’s About needs one save in Make it yours before I can change it.');
  }
}

/** Every cell a plan carries is one an allowlisted field writes, for this account. */
export function assertAllowedCells(cells) {
  if (!Array.isArray(cells) || !cells.length) throw new Error(NOT_ALLOWED_MSG);
  for (const c of cells) if (!isObj(c) || !ALLOWED_CELLS.has(cellId(c))) throw new Error(NOT_ALLOWED_MSG);
}

// The writes, one group (a user_goals document, the notification row, the profile row) at a time,
// each re-read and re-checked under its own guard. `dir` 'apply' moves before → after; 'undo' moves
// after → before and passes over a cell already back at before.
const groupKey = (c) => (c.store === 'goals' ? `goals:${c.kind}` : c.store);
function checkCells(state, cells, dir) {
  const todo = [];
  for (const c of cells) {
    const cur = readCell(state, c).value;
    const from = dir === 'apply' ? c.before : c.after;
    const to = dir === 'apply' ? c.after : c.before;
    if (sameValue(cur, from)) todo.push(c);
    else if (dir === 'undo' && sameValue(cur, to)) continue;
    else throw new Error(dir === 'apply' ? STALE_MSG : CHANGED_MSG);
  }
  return todo;
}

async function writeGroup(sb, uid, cells, dir, tz) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const state = await readState(sb, uid, cells);
    const todo = checkCells(state, cells, dir);
    if (!todo.length) return false;
    const c0 = todo[0];
    let res;
    if (c0.store === 'goals') {
      const row = state.goals[c0.kind];
      const data = JSON.parse(JSON.stringify(row ? row.data : {}));
      for (const c of todo) setCell(data, c, dir === 'apply' ? true : c.had, dir === 'apply' ? c.after : c.before);
      if (c0.kind === 'profile_custom') checkProfileCustom(data, todo);
      res = row
        ? await sb.from('user_goals').update({ data }).eq('user_id', uid).eq('kind', c0.kind).eq('updated_at', row.updatedAt).select('kind')
        : await sb.from('user_goals').insert({ user_id: uid, kind: c0.kind, data }).select('kind');
    } else if (c0.store === 'notify') {
      // ⚠ A ROW THE SETUP MADE IS TAKEN AWAY BY ITS UNDO (Codex on #2566). An account with no
      // notification_settings row is given one by Confirm (in the chat's zone); restoring only the
      // columns would leave the row, and its zone, behind, which can start a quiet-hours window the
      // account never had. So when every cell was absent before, Undo (and a rollback) deletes the
      // row, only while each of its columns is still what the setup left: its own cells at their
      // `after`, the rest at the table's defaults, unmuted, in the zone it was made in. A row changed
      // since holds the member's own choices; then only the setup's columns go back, as below.
      if (dir === 'undo' && state.notify && cells.every((c) => c.had === false)) {
        let del = sb.from('notification_settings').delete().eq('user_id', uid).eq('muted', false).eq('tz', tz || 'UTC');
        for (const k of Object.keys(NOTIFY_DEFAULTS)) {
          const mine = cells.find((c) => c.key === k);
          del = del.eq(k, mine ? mine.after : NOTIFY_DEFAULTS[k]);
        }
        const gone = await del.select('user_id');
        if (gone && !gone.error && Array.isArray(gone.data) && gone.data.length) return true;
      }
      const patch = {};
      for (const c of todo) patch[c.key] = dir === 'apply' ? c.after : c.before;
      if (state.notify) {
        let q = sb.from('notification_settings').update({ ...patch, updated_at: new Date().toISOString() }).eq('user_id', uid);
        for (const c of todo) q = q.eq(c.key, dir === 'apply' ? c.before : c.after);
        res = await q.select('user_id');
      } else {
        res = await sb.from('notification_settings').insert({ user_id: uid, tz: tz || 'UTC', ...patch }).select('user_id');
      }
    } else {
      const from = dir === 'apply' ? c0.before : c0.after;
      let q = sb.from('profiles').update({ full_name: dir === 'apply' ? c0.after : c0.before, updated_at: new Date().toISOString() }).eq('id', uid);
      q = from == null ? q.is('full_name', null) : q.eq('full_name', from);
      res = await q.select('id');
    }
    if (res && res.error) {
      if (res.error.code === '23505') continue; // a first row written beside ours: read it and go again
      throw new Error(WRITE_FAILED_MSG);
    }
    if (res && Array.isArray(res.data) && res.data.length) return true;
    // Zero rows: the row moved since it was read (or is not this account's). Read it and go again.
  }
  throw new Error(dir === 'apply' ? STALE_MSG : CHANGED_MSG);
}

/**
 * ⚠ A WHEN-IT-CHANGED STAMP IS THE MOMENT THE MEMBER CONFIRMS, NOT THE MOMENT NORA DREW THE CARD.
 * The card is drawn with a `now` (the stamps' value in the preview), and it can wait up to the
 * token's life before Confirm. The check-in's dailyCheckinSince is read against the weekly cutoff
 * by score-accountability, so a preview-time stamp would date the switch minutes early. Execute
 * stamps the cells at confirm with this, and keeps the stamped cells for the undo, which checks the
 * stamp it wrote. A copy: the cells it is given are left as they are.
 */
export function stampSetupCells(cells, now = new Date().toISOString()) {
  if (!Array.isArray(cells)) return cells;
  return cells.map((c) => (isObj(c) && STAMP_CELLS.has(cellId(c)) ? { ...c, after: now } : c));
}

/**
 * Apply ('apply') or reverse ('undo') a plan's cells on the account `uid`. Reads every cell first
 * and refuses before any write when one is not where it should be; then writes group by group.
 * A failed apply restores the groups it had already written.
 */
export async function applySetupCells(sb, uid, cells, dir, { tz = 'UTC' } = {}) {
  assertAllowedCells(cells);
  if (!uid) throw new Error(NOT_ALLOWED_MSG);
  checkCells(await readState(sb, uid, cells), cells, dir);
  const groups = new Map();
  for (const c of cells) {
    const k = groupKey(c);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  }
  const done = [];
  for (const group of groups.values()) {
    try {
      if (await writeGroup(sb, uid, group, dir, tz)) done.push(group);
    } catch (e) {
      if (dir === 'apply') {
        const kept = [];
        for (const g of done.reverse()) {
          try { await writeGroup(sb, uid, g, 'undo', tz); } catch (re) {
            kept.push(...g);
            console.error('[nora-setup] rollback failed after a failed apply', { group: groupKey(g[0]), message: (re && re.message) || String(re) });
          }
        }
        if (kept.length) throw new Error(partialSavedMsg([...new Set(kept.map((c) => SETUP_FIELDS[c.field] ? SETUP_FIELDS[c.field].label : c.field))]));
      }
      throw e;
    }
  }
  return { written: done.length };
}

/**
 * The card: each change as before → after from the account as it stands, each refusal by name.
 * Unchanged values are left off (and named in `unchanged`). `now` is the stamp the coaching step
 * and the check-in carry. Reads only; writes nothing.
 */
export async function buildSetupPreview(sb, uid, { changes, refused }, { now = new Date().toISOString(), tz = 'UTC', locale = 'en' } = {}) {
  const planned = changes.map((ch) => ({ ch, spec: SETUP_FIELDS[ch.field], cells: SETUP_FIELDS[ch.field].cells(ch.value, now, { locale }) }));
  const state = await readState(sb, uid, planned.flatMap((p) => p.cells));
  const cells = [];
  const diff = [];
  const unchanged = [];
  for (const { ch, spec, cells: cs } of planned) {
    const read = (id) => { const c = cs.find((x) => cellId(x) === id); return c ? readCell(state, c).value : null; };
    // A field with a derived current value (the check-in reads ON when unset, coaching is three
    // keys) is unchanged when that value is; any other when none of its cells would move.
    const before = spec.current ? spec.current(read) : readCell(state, cs[0]).value;
    const moving = spec.current
      ? !sameValue(before, ch.value)
      : cs.some((c) => !c.stamp && !sameValue(readCell(state, c).value, c.value));
    if (!moving) { unchanged.push(ch.field); continue; }
    for (const c of cs) {
      const cur = readCell(state, c);
      if (!c.stamp && sameValue(cur.value, c.value)) continue;
      cells.push({ store: c.store, ...(c.kind ? { kind: c.kind } : {}), key: c.key, ...(c.sub ? { sub: c.sub } : {}), field: ch.field, had: cur.had, before: cur.value, after: c.value });
    }
    diff.push({ label: spec.label, field: ch.field, before: before == null ? null : spec.show(before), after: spec.show(ch.value) });
  }
  for (const r of refused) diff.push({ label: r.label, field: r.field, refused: r.reason, after: `Not set: ${REFUSED_REASONS[r.reason] || REFUSED_REASONS.not_here}` });
  return { cells, diff, unchanged, changed: diff.filter((d) => !d.refused).length, tz };
}

// ── The tool Nora is offered, and the note that teaches it ────────────────────────────────────
export const SETUP_TOOL = {
  type: 'function',
  name: 'set_up_account',
  description:
    "Set up the signed-in person's OWN account from what they told you: the things the first-run steps and Settings ask. DRAFTS one card listing every change (before → after) and anything that could not be set; nothing changes until they confirm, and Undo restores it all. Pass only what they said, one entry per setting, in these fields: goal (their main goal: lose fat, build muscle, recomp, maintain, get stronger, endurance, mobility, athletic performance, general health, tone up, run a race, postpartum, or their own words), coaching (none, training, nutrition or both), trainingGoal (strength, hypertrophy, strength + hypertrophy, endurance, fat loss, general health), experience (beginner, novice, intermediate, advanced, elite), sessionsPerWeek (2-6), equipment (full gym, home gym, bodyweight only, limited, full gym + home DBs), preferredTimes (early morning, mornings, midday, evenings, late evenings, variable), dietaryStyle (omnivore, vegetarian, vegan, pescatarian, keto, paleo, mediterranean), calorieRange (by feel, strict, loose tracking, 1600-1800, 1800-2000, 2000-2200, 2200-2400, 2400+), alcohol (none, rare, social, weekly, daily), units (metric or imperial), weekStarts (Monday or Sunday), dailyCheckin (on or off), quietStart and quietEnd (the hour notifications go quiet and come back, e.g. 22 and 7), dailyLimit (2, 3, 4, 6 or 8 notifications a day), name (their display name). For a coach also: headline (one line, 80 characters), aboutStory (their story in their words), yearsCoaching, coachingFormat (online, in person or both), basedIn, languages. Never anything else, and never for anyone but them.",
  parameters: {
    type: 'object',
    properties: {
      changes: {
        type: 'array',
        description: 'One entry per setting they told you, in their words or the listed value.',
        items: {
          type: 'object',
          properties: {
            field: { type: 'string', description: 'One of the fields listed above.' },
            value: { type: 'string', description: 'What they said for it.' },
          },
          required: ['field', 'value'],
          additionalProperties: false,
        },
      },
    },
    required: ['changes'],
    additionalProperties: false,
  },
  strict: true,
};

export const SETUP_PROMPT_NOTE =
  "ACCOUNT SETUP: You can set up their account with them (set_up_account). When they ask you to set it up, or say \"Set up my account with me\", ask a few short questions, two or three at a time, about what the first-run steps and Settings ask: their main goal and whether they want a personal trainer or nutritionist, their experience, how many days a week they can train, their equipment, when they like to train, how they eat, units, whether they want the Morning check-in, and when notifications should go quiet. For a coach, ask too for a one-line headline and a few sentences about themselves, how many years they have coached, online or in person, where they are based and the languages they coach in. Then call set_up_account once with only what they said: never guess a value, never fill one they did not give. It DRAFTS one card listing every change; say you've drafted it and that they confirm it below, never that it is done. If the result names settings that were not set, say which and why in one sentence. You can never set their email, password, phone, username, birth date, payment or plan, privacy, the agreements or the health screening: those are theirs to do, so say so and point them to where they do it. A coach's rates, hours and specialties are set in their own screens.";
