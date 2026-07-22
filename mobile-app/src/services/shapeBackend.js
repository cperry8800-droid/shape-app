import { Capacitor } from '@capacitor/core';
import { createClient } from '@supabase/supabase-js';
import { isHealthKitPlatform, requestHealthKitAuth, collectHealthKitSnapshots } from './healthkit.js';
import { hrmAvailable, hrmConnected, hrmCurrent, hrmConnect, hrmDisconnect } from './hrm.js';
import { registerPush } from './push.js';
import { bsAdjustRegen } from './adjustRegen.mjs';
import { mergePostPatch } from './communityPostPatch.mjs';
import { computeWeekendSplit, buildSelfWeekendBuckets } from './weekendSplit.mjs';
import { bsVarianceBand } from '../../../public/newdesign/varianceBand.mjs';
import { bsSetsWindow } from '../../../public/newdesign/noraSets.mjs';
import { bsFeedQuerySpec } from './feedMode.mjs';
import { bsWorkoutSharePrivacy, bsIsDuplicateWorkoutPost, BS_PRIVACY_RANK } from './workoutShare.mjs';
import { bsLiveAudience } from './liveProgress.mjs';
import { bsMaterializeProgram, bsRepeatSpec } from './trainingBuilder.mjs';
import { bsMaterializeOutline } from './planOutline.mjs';
import { bsPrunePrep } from './mealPrep.mjs';
// The SHARED nora_memory doc normalizer (pure ESM, cross-root import — the
// dashSignals.js precedent): one implementation of the {rev, notes} semantics
// for the server tools AND this Settings mirror, so they can't drift.
import { normalizeMemoryDoc } from '../../../src/lib/ai/noraMemory.mjs';
import {
  DEFAULT_BACKGROUND_CHECK_PROVIDER,
  PROVIDER_APPLICATION_MAX_FILE_BYTES,
  REQUIRED_PROVIDER_EXPERIENCE_YEARS,
} from '../config/providerApplications.js';

// Supabase config. The native Capacitor build injects these via env at build
// time; the /m/ web preview is built without them, so fall back to the SAME
// project URL + publishable (anon) key the website hardcodes in
// public/supabase.js. This is what lets the /m/ preview reach the same backend
// as the website — without it, `supabase` is null and auth + the shared
// user_goals store (window.shapeDb) silently no-op. The publishable key is
// RLS-protected and already public on the website.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://zznufekgjngecelwxndw.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_vuOq-03RJHruIz0PWtXiUA_R4zvTJcR';
// Backend base URL. An explicit VITE_API_BASE_URL always wins (required for the
// native app, which has no same origin). Otherwise default to the page's own
// origin — the hosted /m/ web build is served from the same site that hosts
// /api, so same-origin requests just work without a build-time env.
const _apiEnvBase = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
const _isNative = (() => { try { return !!(Capacitor && Capacitor.isNativePlatform && Capacitor.isNativePlatform()); } catch (e) { return false; } })();
const apiBaseUrl = _apiEnvBase
  || ((!_isNative && typeof window !== 'undefined' && window.location && window.location.origin)
      ? window.location.origin.replace(/\/$/, '')
      : '');
const providerApplicationFileBucket = 'provider-credentials';

const authConfigured = Boolean(supabaseUrl && supabaseAnonKey);
const supabase = authConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;

const state = {
  user: null,
  session: null,
  profile: null,
};

function normalizeRole(role) {
  // dietitian (RD/RDN) is a first-class nutrition-discipline provider role.
  return ['client', 'trainer', 'nutritionist', 'dietitian'].includes(role) ? role : 'client';
}

// A dietitian (RD/RDN) is a CREDENTIAL on the NUTRITIONIST provider rails — the
// provider row, provider_role, roster/booking/availability endpoints, and console
// are all keyed by the physical discipline ('trainer' | 'nutritionist'). Map a
// dietitian onto 'nutritionist' anywhere we pick a discipline so they never fall
// through to the trainer path (or get rejected).
function providerDiscipline(role) {
  return role === 'dietitian' ? 'nutritionist' : role;
}

function normalizeRoles(roles, fallbackRole = 'client') {
  const input = Array.isArray(roles) ? roles : [fallbackRole];
  const normalized = input
    .map(normalizeRole)
    .filter((role, index, arr) => role && arr.indexOf(role) === index);
  return normalized.length ? normalized : [normalizeRole(fallbackRole)];
}

function demoProfile(overrides = {}) {
  const role = normalizeRole(overrides.role);
  return {
    id: 'demo-user',
    email: overrides.email || 'quinn@harper.co',
    full_name: overrides.fullName || 'Quinn Harper',
    role,
    roles: normalizeRoles(overrides.roles, role),
    shape_radio_enabled: true,
    profile_visibility: 'community',
  };
}

function setCached(next = {}) {
  const prevUid = (state.user && state.user.id) || null;
  const prevName = (state.profile && state.profile.full_name) || null;
  Object.assign(state, next);
  const uid = (state.user && state.user.id) || null;
  const name = (state.profile && state.profile.full_name) || null;
  // Notify the UI when identity actually changes (sign-in / sign-out / profile
  // resolve). Avatars read bsMyName()/bsMyPhoto() straight from this cache, and
  // they typically render once BEFORE getCurrentSession resolves (user.id still
  // null → bsMyPhoto returns the demo headshot). Without this nudge they never
  // refresh, so a brand-new account keeps showing the demo persona / photo
  // instead of its own initials. The app listens for 'shape:identity' and bumps
  // a version to re-render every avatar.
  if (typeof window !== 'undefined' && (uid !== prevUid || name !== prevName)) {
    try { window.dispatchEvent(new Event('shape:identity')); } catch (e) {}
  }
  return { user: state.user, session: state.session, profile: state.profile };
}

async function bridgeSessionToApi(session = state.session) {
  if (!apiBaseUrl || !session?.access_token || !session?.refresh_token) return { bridged: false };

  const response = await fetch(`${apiBaseUrl}/api/auth/session`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to prepare integration session.');
  }
  return { bridged: true };
}

async function fetchProfile(user) {
  if (!supabase || !user?.id) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .maybeSingle();

  if (error) throw error;
  return data;
}

async function upsertProfile(user, overrides = {}) {
  if (!supabase || !user?.id) return null;
  const role = normalizeRole(overrides.role || user.user_metadata?.role);
  const payload = {
    id: user.id,
    email: user.email,
    full_name: overrides.fullName || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Shape member',
    role,
    roles: normalizeRoles(overrides.roles || user.user_metadata?.roles, role),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('profiles')
    .upsert(payload, { onConflict: 'id' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

async function signIn({ email, password, role, captchaToken }) {
  if (!authConfigured) {
    const profile = demoProfile({ email, role });
    return setCached({
      user: { id: profile.id, email: profile.email, user_metadata: { role: profile.role } },
      session: { demo: true },
      profile,
    });
  }

  // The sign-in field accepts an email OR a Shape username — resolve a
  // username to its login email first (get_email_for_username RPC).
  let loginEmail = String(email || '').trim();
  if (loginEmail && !loginEmail.includes('@')) {
    let resolved = null;
    // Resolve via the rate-limited server route (get_email_for_username is
    // service-role-only now — no anon username->email enumeration).
    try {
      const rr = await fetch(`${apiBaseUrl}/api/auth/resolve-username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: loginEmail.replace(/^@/, '') }),
      });
      resolved = rr.ok ? ((await rr.json().catch(() => ({}))).email ?? null) : undefined;
    } catch (e) { resolved = undefined; }
    if (resolved === null) throw new Error('No account with that username — check the spelling or sign in with your email.');
    if (resolved) loginEmail = resolved;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email: loginEmail, password, options: captchaToken ? { captchaToken } : undefined });
  if (error) throw error;

  let profile = await fetchProfile(data.user);
  if (!profile) profile = await upsertProfile(data.user, { role });
  profile = await ensureUsernameClaimed(data.user, profile);
  profile = await ensureDobPersisted(data.user, profile); // claim a signup DOB (email-confirm flow) on first login

  const cached = setCached({ user: data.user, session: data.session, profile });
  await bridgeSessionToApi(data.session).catch((error) => {
    console.warn('[shape] Session bridge failed.', error);
  });
  return cached;
}

// If the account asked for a username at signup (stored in user_metadata —
// covers the email-confirmation flow where no session exists at signup time)
// but the profile doesn't carry one yet, claim it now. Best-effort.
async function ensureUsernameClaimed(user, profile) {
  try {
    const want = user && user.user_metadata && user.user_metadata.username;
    if (!want || !supabase || (profile && profile.username)) return profile;
    const { data } = await supabase.rpc('set_my_username', { p_username: want });
    if (data && profile) profile = { ...profile, username: data };
  } catch (e) {}
  return profile;
}
// Persist the account's date of birth onto the profiles row so the over_18
// trigger fires. The email-confirmation signup flow has no session at signUp time
// (DOB only lives in user_metadata) and the phone flow never touches signUp at
// all — so copy it on first confirmed login / OTP verify when the profile doesn't
// carry it yet. Best-effort: no-ops if the age-verification migration isn't
// applied. Pass an explicit `dob` to seed it directly; otherwise read metadata.
async function ensureDobPersisted(user, profile, dob) {
  try {
    if (!supabase || !user?.id) return profile;
    const want = dob || (user.user_metadata && user.user_metadata.date_of_birth);
    if (!want || (profile && profile.date_of_birth)) return profile;
    const { data } = await supabase.from('profiles').update({ date_of_birth: want }).eq('id', user.id).select().maybeSingle();
    if (data) profile = data;
  } catch (e) { /* column may not exist yet */ }
  return profile;
}
async function checkUsernameAvailable(username) {
  if (!supabase) return null;
  try { const { data } = await supabase.rpc('is_username_available', { p_username: String(username || '').replace(/^@/, '') }); return data === true; } catch (e) { return null; }
}
async function claimUsername(username) {
  if (!supabase || !state.user?.id) throw new Error('Sign in first.');
  const { data, error } = await supabase.rpc('set_my_username', { p_username: String(username || '').replace(/^@/, '') });
  if (error) throw error;
  if (state.profile) setCached({ ...state, profile: { ...state.profile, username: data } });
  return data;
}

async function signUp({ email, password, fullName, role, username, captchaToken, dob }) {
  const normalizedRole = normalizeRole(role);
  // 18+ age gate — REQUIRED at account creation (no soft-fail): a missing or
  // unparseable date of birth is rejected, and under-18 is blocked. This is the
  // authoritative server-side check; over_18 is then recomputed from date_of_birth
  // by a DB trigger, so neither the date nor the derived flag can be faked.
  {
    const d = dob ? new Date(dob) : null;
    if (!d || isNaN(d.getTime())) { const e = new Error('Enter a valid date of birth — Shape is for adults 18 and over.'); e.code = 'dob_required'; throw e; }
    const eighteen = new Date(); eighteen.setFullYear(eighteen.getFullYear() - 18);
    if (d > eighteen) { const e = new Error('You must be 18 or older to use Shape.'); e.code = 'under_18'; throw e; }
  }
  if (!authConfigured) {
    const profile = demoProfile({ email, fullName, role: normalizedRole });
    return setCached({
      user: { id: profile.id, email: profile.email, user_metadata: { role: profile.role, full_name: profile.full_name } },
      session: { demo: true },
      profile,
    });
  }

  const cleanUsername = String(username || '').trim().replace(/^@/, '').toLowerCase() || undefined;
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: (typeof window !== 'undefined') ? `${window.location.origin}${window.location.pathname}` : undefined,
      ...(captchaToken ? { captchaToken } : {}),
      data: {
        full_name: fullName,
        role: normalizedRole,
        roles: [normalizedRole],
        ...(cleanUsername ? { username: cleanUsername } : {}),
        ...(dob ? { date_of_birth: dob } : {}),
      },
    },
  });
  if (error) throw error;

  // Email confirmation enabled: Supabase returns a user but no session until
  // the link is clicked. Surface that so the UI shows "check your email".
  // (The chosen username rides in user_metadata and is claimed on first login.)
  if (data.user && !data.session) {
    return { needsEmailConfirmation: true, email, role: normalizedRole };
  }

  let profile = data.user ? await upsertProfile(data.user, { fullName, role }) : null;
  // Persist DOB so the over_18 trigger fires (best-effort: no-ops if the
  // age-verification migration isn't applied yet). Email-confirm signups keep it
  // in user_metadata until first login.
  if (dob && data.user && data.session) {
    try { await supabase.from('profiles').update({ date_of_birth: dob }).eq('id', data.user.id); } catch (e) { /* column may not exist yet */ }
  }
  if (data.session) profile = await ensureUsernameClaimed(data.user, profile);
  const cached = setCached({ user: data.user, session: data.session, profile });
  await bridgeSessionToApi(data.session).catch((error) => {
    console.warn('[shape] Session bridge failed.', error);
  });
  return cached;
}

// ─── Phone / SMS sign-in (Supabase phone auth + Twilio) ──────────────────────
// Step 1: request an SMS one-time code. Supabase sends it via the configured
// SMS provider (Twilio) — see the Auth → Providers → Phone settings. With
// `shouldCreateUser: true` this doubles as passwordless sign-UP for new phones.
async function signInWithPhone({ phone, fullName, role, captchaToken, dob, isCreate }) {
  const normalizedPhone = String(phone || '').trim();
  if (!normalizedPhone) throw new Error('Enter your phone number.');
  // 18+ age gate — account CREATION via phone must carry a valid DOB, exactly like
  // email signUp (no soft-fail). Creation only ever happens in the create flow:
  // `shouldCreateUser` is tied to isCreate below, so an existing user signing in
  // (isCreate false) never provisions an account and needs no DOB, while a new
  // account can only be made through the DOB-required create path. over_18 is
  // recomputed from date_of_birth by a trigger, so the value can't be faked.
  if (isCreate) {
    const d = dob ? new Date(dob) : null;
    if (!d || isNaN(d.getTime())) { const e = new Error('Enter a valid date of birth — Shape is for adults 18 and over.'); e.code = 'dob_required'; throw e; }
    const eighteen = new Date(); eighteen.setFullYear(eighteen.getFullYear() - 18);
    if (d > eighteen) { const e = new Error('You must be 18 or older to use Shape.'); e.code = 'under_18'; throw e; }
  }
  if (!authConfigured) {
    // Demo mode (no Supabase configured): pretend the code was sent.
    return { otpSent: true, demo: true, phone: normalizedPhone };
  }
  const meta = {};
  if (fullName) meta.full_name = fullName;
  if (role) meta.role = normalizeRole(role);
  if (isCreate && dob) meta.date_of_birth = dob; // claimed onto profiles after OTP verify
  const { error } = await supabase.auth.signInWithOtp({
    phone: normalizedPhone,
    options: {
      shouldCreateUser: !!isCreate, // only the create flow may provision an account — and that path always carries a DOB
      ...(captchaToken ? { captchaToken } : {}),
      data: Object.keys(meta).length ? meta : undefined,
    },
  });
  if (error) throw error;
  return { otpSent: true, phone: normalizedPhone };
}

// Step 2: verify the 6-digit SMS code, establish the session, and (for a brand
// new phone account) seed the profile row + bridge the session to the API.
async function verifyPhoneOtp({ phone, token, fullName, role, dob }) {
  const normalizedPhone = String(phone || '').trim();
  const code = String(token || '').trim();
  if (!normalizedPhone || !code) throw new Error('Enter the code we texted you.');
  if (!authConfigured) {
    const profile = demoProfile({ fullName, role: normalizeRole(role) });
    return setCached({
      user: { id: profile.id, email: profile.email, phone: normalizedPhone, user_metadata: { role: profile.role } },
      session: { demo: true },
      profile,
    });
  }
  const { data, error } = await supabase.auth.verifyOtp({ phone: normalizedPhone, token: code, type: 'sms' });
  if (error) throw error;

  let profile = data.user ? await fetchProfile(data.user) : null;
  if (!profile && data.user) profile = await upsertProfile(data.user, { fullName, role });
  // Persist the date of birth from this signup (or from earlier OTP metadata) so
  // the over_18 trigger fires — phone signups never hit the email signUp path.
  if (data.user) profile = await ensureDobPersisted(data.user, profile, dob);

  const cached = setCached({ user: data.user, session: data.session, profile });
  await bridgeSessionToApi(data.session).catch((error) => {
    console.warn('[shape] Session bridge failed.', error);
  });
  return cached;
}

async function updateProfileRoles({ primaryRole, roles } = {}) {
  if (!state.user?.id) {
    throw new Error('Sign in before updating roles.');
  }
  const normalizedPrimary = normalizeRole(primaryRole || state.profile?.role);
  const normalizedRoles = normalizeRoles(roles || state.profile?.roles, normalizedPrimary);
  const payload = {
    role: normalizedPrimary,
    roles: normalizedRoles.includes(normalizedPrimary)
      ? normalizedRoles
      : [normalizedPrimary, ...normalizedRoles],
    updated_at: new Date().toISOString(),
  };

  if (!supabase) {
    const profile = { ...(state.profile || demoProfile()), ...payload };
    return { stored: 'local', data: setCached({ profile }).profile };
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(payload)
    .eq('id', state.user.id)
    .select()
    .single();

  if (error) throw error;
  setCached({ profile: data });
  return { stored: 'supabase', data };
}

// Update just the display name on the profile (from Settings → Edit profile), so
// chat/search/leaderboard surfaces that read profiles.full_name stay in sync.
async function updateProfileName(name) {
  const clean = String(name || '').trim();
  if (!clean || !state.user?.id) return null;
  if (!supabase) {
    const profile = { ...(state.profile || demoProfile()), full_name: clean };
    return setCached({ profile }).profile;
  }
  const { data, error } = await supabase
    .from('profiles')
    .update({ full_name: clean, updated_at: new Date().toISOString() })
    .eq('id', state.user.id)
    .select()
    .single();
  if (error) return null;
  setCached({ profile: data });
  return data;
}

async function getCurrentSession() {
  if (!authConfigured) return setCached({});

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const user = data.session?.user || null;
  let profile = user ? await fetchProfile(user) : null;
  // No DB trigger creates the profile row, and the email-confirmation signup
  // path establishes a session via redirect (not signIn), so a brand-new
  // account arrives here with no profile. Create it from the signup metadata
  // (full_name + role) so the real name/initials show instead of the demo
  // persona. Idempotent (upsert on id).
  if (user && !profile) { try { profile = await upsertProfile(user); } catch (e) {} }
  if (user) profile = await ensureUsernameClaimed(user, profile); // claim a signup-chosen username on first (confirmed) login
  if (user) profile = await ensureDobPersisted(user, profile); // claim a signup DOB on first (confirmed) login → fires the over_18 trigger
  const cached = setCached({ user, session: data.session, profile });
  if (user) { try { startPresence(); } catch (e) {} } // join "online" presence app-wide
  if (user) { try { startActivity(); } catch (e) {} } // hydrate + subscribe to live "doing now" activity (DB-backed)
  if (user) { try { registerPush(); } catch (e) {} } // register device for system push (native only; no-op on web)
  if (user) { try { window.ShapeVoice?.load?.(); } catch (e) {} } // pull the account's saved Nora tone (syncs across devices)
  if (user) { try { setTimeout(() => { window.ShapeNotify?.evaluate?.(); }, 4000); } catch (e) {} } // proactive notifications (throttled; honest — fires only on real, new events)
  if (user) { try { supabase.rpc('award_tier_bonuses').then(() => {}, () => {}); } catch (e) {} } // grant any one-time tier bonuses (idempotent; swallow async rejection so it can't surface as an unhandled rejection)
  if (user) { try { window.ShapeMomentum?.check?.().catch(() => {}); } catch (e) {} } // grant any earned weekly momentum bonus (idempotent; no-op pre-migration)
  if (user) { try { window.ShapeStepPoints?.check?.().catch(() => {}); } catch (e) {} } // credit Shape Steps points for completed days (idempotent; no-op pre-migration)
  if (user) { try { window.ShapeCareerAward?.catchUp?.().catch(() => {}); } catch (e) {} } // re-fire a milestone +25 that failed at post time (idempotent monthly dedupe; no-op pre-migration)
  if (data.session) {
    await bridgeSessionToApi(data.session).catch((error) => {
      console.warn('[shape] Session bridge failed.', error);
    });
  }
  return cached;
}

async function signOut() {
  if (supabase) await supabase.auth.signOut();
  invalidateClientMetrics();
  // Clear viewer-relative caches so the next account never sees the previous user's
  // follow state / avatars (these are keyed by target id but hold viewer-relative data).
  for (const k in _followCache) delete _followCache[k];
  for (const k in _avatarCache) delete _avatarCache[k];
  _followingIdsCache = { uid: null, ids: null, at: 0 };
  _prepCache = null;   // PREPPED records are member data — never cross accounts
  return setCached({ user: null, session: null, profile: null });
}

async function startCheckout({ item, coach, user, role }) {
  if (!apiBaseUrl) {
    return {
      demo: true,
      message: 'Stripe backend URL is not configured. Set VITE_API_BASE_URL after deploying the backend.',
    };
  }

  const response = await fetch(`${apiBaseUrl}/api/stripe/checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(state.session?.access_token ? { Authorization: `Bearer ${state.session.access_token}` } : {}),
    },
    body: JSON.stringify({
      item,
      coach: coach
        ? {
            id: coach.id,
            provider_id: coach.provider_id || coach.db_id,
            db_id: coach.db_id,
            name: coach.name,
            role: coach.provider_role || role,
          }
        : null,
      user: user || state.user,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to start checkout.');
  }

  if (payload.url) openCheckoutUrl(payload.url);

  return payload;
}

// Open Stripe Checkout so Apple Pay / Google Pay can appear: on native, use the
// system browser (SFSafariViewController via the Capacitor Browser plugin) — the
// in-app WebView can't present the Apple Pay sheet. Falls back to the WebView.
function openCheckoutUrl(url) {
  try {
    const cap = (typeof window !== 'undefined' && window.Capacitor) || null;
    const Browser = cap && cap.Plugins && cap.Plugins.Browser;
    if (Capacitor.isNativePlatform() && Browser && Browser.open) {
      Browser.open({ url, presentationStyle: 'fullscreen' });
      return;
    }
  } catch (e) {}
  try { window.location.assign(url); } catch (e) { window.location.href = url; }
}

async function startStripeConnectOnboarding({ role } = {}) {
  if (!apiBaseUrl) {
    throw new Error('Stripe backend URL is not configured. Set VITE_API_BASE_URL after deploying the backend.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before setting up payouts.');
  }

  const response = await fetch(`${apiBaseUrl}/api/stripe/connect-account`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.session.access_token}`,
    },
    body: JSON.stringify({ role }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to start Stripe Connect onboarding.');
  }

  if (payload.url) window.location.assign(payload.url);
  return payload;
}

async function generatePlanDraft(input = {}) {
  const fallbackDraft = (kind = input.kind || 'workout') => {
    if (kind === 'meal_plan') {
      return {
        source: 'template',
        draft: {
          title: `${input.goal || 'Performance'} fuel plan`,
          summary: `${input.duration || '7-day'} meal-plan draft with editable portions, grocery sections, and coach notes.`,
          tag: 'NUTRITION',
          duration: input.duration || '7 days',
          blocks: [
            { label: '01', title: 'Breakfast base', detail: 'Greek yogurt, oats, berries, chia', note: 'Batch 3 servings.' },
            { label: '02', title: 'Lunch anchor', detail: 'Chicken rice bowl, greens, olive oil', note: 'Prep protein and carbs ahead.' },
            { label: '03', title: 'Training snack', detail: 'Banana, protein shake, rice cakes', note: 'Use 60-90 min pre-training.' },
            { label: '04', title: 'Dinner rotation', detail: 'Salmon, potatoes, vegetables', note: 'Adjust carb serving to hit calories.' },
          ],
          coachNotes: ['Confirm allergies and dietary restrictions before sending.', 'Edit portions to match the client macro target.'],
          shoppingList: [
            { section: 'Protein', items: ['Greek yogurt', 'Chicken breast', 'Salmon', 'Protein powder'] },
            { section: 'Carbs', items: ['Oats', 'Rice', 'Potatoes', 'Bananas'] },
            { section: 'Produce', items: ['Berries', 'Greens', 'Mixed vegetables'] },
          ],
        },
      };
    }
    return {
      source: 'template',
      draft: {
        title: kind === 'program' ? `${input.goal || 'Strength'} block` : `${input.goal || 'Strength'} session`,
        summary: `${input.duration || (kind === 'program' ? '4-week' : '60-minute')} editable draft for ${input.client || 'a client'}.`,
        tag: String(input.goal || (kind === 'program' ? 'Program' : 'Workout')).toUpperCase().slice(0, 14),
        duration: input.duration || (kind === 'program' ? '4 weeks' : '60 minutes'),
        blocks: kind === 'program'
          ? [
              { label: 'W1', title: 'Base week', detail: 'Technical volume', note: 'RPE 6-7.' },
              { label: 'W2', title: 'Build week', detail: 'Add reps or load', note: 'Progress only if recovery holds.' },
              { label: 'W3', title: 'Peak week', detail: 'Highest workload', note: 'Cap accessories before fatigue climbs.' },
              { label: 'W4', title: 'Deload/test', detail: 'Reduce volume', note: 'Retest one key metric.' },
            ]
          : [
              { label: 'A', title: 'Warm-up', detail: '8 min prep + ramp sets', note: 'Clean positions.' },
              { label: 'B', title: 'Primary lift', detail: '4 x 5 @ RPE 7', note: 'Stop before form breakdown.' },
              { label: 'C1', title: 'Accessory superset', detail: '3 x 10-12', note: 'Controlled eccentric.' },
              { label: 'D', title: 'Finisher', detail: '6 min intervals', note: 'Scale to readiness.' },
            ],
        coachNotes: ['Review injury history and equipment access.', 'Customize loads, substitutions, and cues before sending.'],
        shoppingList: [],
      },
    };
  };

  if (!apiBaseUrl) return fallbackDraft(input.kind);
  const response = await fetch(`${apiBaseUrl}/api/ai/generate-plan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(state.session?.access_token ? { Authorization: `Bearer ${state.session.access_token}` } : {}),
    },
    body: JSON.stringify(input),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    console.warn('[shape] AI generator API failed; using local template.', payload);
    return fallbackDraft(input.kind);
  }
  return payload;
}

async function requestRefund({ subscriptionId, oneTimePurchaseId, reason } = {}) {
  if (!state.user?.id) {
    throw new Error('Sign in before requesting a refund.');
  }
  if (!subscriptionId && !oneTimePurchaseId) {
    throw new Error('Choose a subscription or purchase to refund.');
  }
  if (subscriptionId && oneTimePurchaseId) {
    throw new Error('Refund requests can target one purchase at a time.');
  }

  const payload = {
    client_id: state.user.id,
    subscription_id: subscriptionId || null,
    one_time_purchase_id: oneTimePurchaseId || null,
    reason: reason || '',
  };

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.refundRequests', payload) };
  }

  const { data, error } = await supabase
    .from('refund_requests')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.refundRequests', payload, error), error };
  }

  return { stored: 'supabase', data };
}

function clientIntakeToPayload(values = {}) {
  const profile = state.profile || {};
  const user = state.user || {};

  return {
    user_id: user.id,
    first_name: values.firstName ?? values.first_name ?? profile.full_name?.split(' ')?.[0] ?? '',
    last_name: values.lastName ?? values.last_name ?? profile.full_name?.split(' ')?.slice(1).join(' ') ?? '',
    dob: values.dob || null,
    sex: values.sex || '',
    primary_goal: values.primaryGoal ?? values.primary_goal ?? '',
    experience_level: values.experienceLevel ?? values.experience_level ?? '',
    workout_frequency: values.workoutFrequency ?? values.workout_frequency ?? '',
    injuries: values.injuries || '',
    medical: values.medical || '',
    dietary: values.dietary || '',
    emergency_contact: values.emergencyContact ?? values.emergency_contact ?? '',
    accountability_style: values.accountabilityStyle ?? values.accountability_style ?? '',
    interests: values.interests || '',
    budget: values.budget || '',
    details: {
      height: values.height || '',
      weight: values.weight || '',
      equipment_access: values.equipmentAccess || values.equipment_access || '',
      preferred_times: values.preferredTimes || values.preferred_times || '',
      nutrition_goal: values.nutritionGoal || values.nutrition_goal || '',
      allergies: values.allergies || '',
      meal_cadence: values.mealCadence || values.meal_cadence || '',
      source: 'shape-mobile-app',
      ...(values.details || {}),
    },
  };
}

async function getClientIntake() {
  if (!state.user?.id) {
    throw new Error('Sign in before loading intake details.');
  }
  if (!supabase) {
    return { stored: 'local', data: null };
  }

  const { data, error } = await supabase
    .from('client_intakes')
    .select('*')
    .eq('user_id', state.user.id)
    .maybeSingle();

  if (error) throw error;
  return { stored: 'supabase', data };
}

async function saveClientIntake(values = {}) {
  if (!state.user?.id) {
    throw new Error('Sign in before saving intake details.');
  }

  const payload = clientIntakeToPayload(values);
  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.clientIntakes', payload) };
  }

  const { data, error } = await supabase
    .from('client_intakes')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.clientIntakes', payload, error), error };
  }

  return { stored: 'supabase', data };
}

async function listVisibleClientIntakes() {
  if (!state.user?.id) {
    throw new Error('Sign in before loading client intakes.');
  }
  if (!supabase) return { stored: 'local', data: [] };

  const { data, error } = await supabase
    .from('client_intakes')
    .select('*')
    .order('updated_at', { ascending: false });

  if (error) throw error;
  return { stored: 'supabase', data: data || [] };
}

async function getClientProfileData() {
  if (!state.user?.id) {
    throw new Error('Sign in before loading client profile data.');
  }
  if (!supabase) return { stored: 'local', data: null };

  const { data, error } = await supabase
    .from('client_profiles')
    .select('*')
    .eq('user_id', state.user.id)
    .maybeSingle();

  if (error) throw error;
  return { stored: 'supabase', data };
}

async function saveClientProfileData(data = {}) {
  if (!state.user?.id) {
    throw new Error('Sign in before saving client profile data.');
  }

  const payload = {
    user_id: state.user.id,
    data: data && typeof data === 'object' ? data : {},
  };

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.clientProfiles', payload) };
  }

  const { data: row, error } = await supabase
    .from('client_profiles')
    .upsert(payload, { onConflict: 'user_id' })
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.clientProfiles', payload, error), error };
  }

  return { stored: 'supabase', data: row };
}

function applicationToPayload(role, values = {}) {
  const firstName = String(values.firstName || '').trim();
  const lastName = String(values.lastName || '').trim();
  const documents = Array.isArray(values.documents) ? values.documents : [];

  return {
    provider_type: role,
    first_name: firstName,
    last_name: lastName,
    email: values.email || state.user?.email || '',
    phone: values.phone || '',
    location: values.city || '',
    specialty: values.primary || '',
    years_experience: values.years || '',
    monthly_price: values.subPrice || '',
    details: {
      // RD/RDN declaration (nutritionist applications only) — the apply route
      // reads details.nutrition_role === 'dietitian' to label the application
      // for the reviewer, who assigns profiles.role='dietitian' on approval.
      nutrition_role: values.nutrition_role || '',
      timezone: values.tz || '',
      social_handles: values.social || '',
      bio: values.bio || '',
      certification: values.cert || '',
      certification_expiration: values.certExp || '',
      education: values.edu || '',
      insurance_status: values.insurance || '',
      previous_platforms: values.prev || '',
      secondary_specialties: values.secondary || [],
      populations: values.populations || [],
      coaching_style: values.style || '',
      max_clients: values.maxClients || '',
      accepting_new_clients: values.accepting || '',
      one_on_one: values.oneOnOne || '',
      response_time: values.response || '',
      single_session_price: values.sessionPrice || '',
      intro_offer: values.intro || '',
      agreements: {
        credential_verification: Boolean(values.verify),
        terms: Boolean(values.tos),
        code_of_conduct: Boolean(values.conduct),
        background_check: Boolean(values.bgcheck),
      },
      background_check_provider: DEFAULT_BACKGROUND_CHECK_PROVIDER,
      background_check_required: true,
      background_check_consent: Boolean(values.bgcheck),
      background_check_status: values.bgcheck ? 'consent_received' : 'not_consented',
      background_check_requested_at: null,
      background_check_completed_at: null,
      background_check_report_id: null,
      professional_minimum_years: REQUIRED_PROVIDER_EXPERIENCE_YEARS,
      documents,
      resume_document: documents.find((document) => document?.kind === 'resume') || null,
      credential_documents: documents.filter((document) => ['credential', 'insurance'].includes(document?.kind)),
      user_id: state.user?.id || null,
    },
    user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
  };
}

function safeFileName(name = 'document') {
  return String(name || 'document')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120) || 'document';
}

async function uploadProviderApplicationFile(file, kind = 'resume') {
  if (!file) return null;
  if (!state.user?.id) {
    throw new Error('Sign in before uploading resume or credential files.');
  }
  if (file.size > PROVIDER_APPLICATION_MAX_FILE_BYTES) {
    throw new Error('Application files must be 10MB or smaller.');
  }

  const metadata = {
    kind,
    name: file.name || 'document',
    type: file.type || 'application/octet-stream',
    size: file.size || 0,
  };

  if (!supabase) {
    return {
      ...metadata,
      bucket: 'local',
      path: `${state.user.id}/${kind}/${Date.now()}-${safeFileName(file.name)}`,
      stored: 'local',
    };
  }

  const path = `${state.user.id}/${kind}/${Date.now()}-${safeFileName(file.name)}`;
  const { error } = await supabase
    .storage
    .from(providerApplicationFileBucket)
    .upload(path, file, {
      contentType: file.type || undefined,
      upsert: false,
    });

  if (error) throw error;
  return {
    ...metadata,
    bucket: providerApplicationFileBucket,
    path,
    stored: 'supabase',
  };
}


function saveLocalRecord(key, payload, error) {
  const item = {
    id: `local-${Date.now()}`,
    created_at: new Date().toISOString(),
    payload,
    error: error?.message || '',
  };
  try {
    const current = JSON.parse(window.localStorage?.getItem(key) || '[]');
    const next = Array.isArray(current) ? [item, ...current] : [item];
    window.localStorage?.setItem(key, JSON.stringify(next.slice(0, 25)));
  } catch {}
  return item;
}

const COMMUNITY_POST_SELECT = '*, likes:community_likes(user_id), comments:community_comments(id, user_id, author_name, body, created_at)';

function readLocalRecords(key) {
  try {
    const current = JSON.parse(window.localStorage?.getItem(key) || '[]');
    return Array.isArray(current) ? current : [];
  } catch {
    return [];
  }
}

function providerApplicationApiBody(payload) {
  return {
    providerType: payload.provider_type,
    firstName: payload.first_name,
    lastName: payload.last_name,
    email: payload.email,
    phone: payload.phone,
    location: payload.location,
    specialty: payload.specialty,
    yearsExperience: payload.years_experience,
    monthlyPrice: payload.monthly_price,
    details: payload.details || {},
  };
}

async function submitProviderApplicationToApi(payload) {
  if (!apiBaseUrl) return null;
  const response = await fetch(`${apiBaseUrl}/api/apply`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(providerApplicationApiBody(payload)),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result?.error || 'Application email route failed.');
  }
  return result;
}

async function submitProviderApplication({ role, values }) {
  const normalizedRole = normalizeRole(role);
  if (!['trainer', 'nutritionist'].includes(normalizedRole)) {
    throw new Error('Choose trainer or nutritionist before submitting.');
  }

  const payload = applicationToPayload(normalizedRole, values);
  if (!payload.email || !payload.first_name || !payload.last_name) {
    throw new Error('Name and email are required.');
  }

  try {
    const apiResult = await submitProviderApplicationToApi(payload);
    if (apiResult) {
      return {
        stored: 'api',
        data: {
          id: apiResult.id,
          ...payload,
        },
      };
    }
  } catch (apiError) {
    console.warn('[shape] Application API failed; falling back to Supabase insert.', apiError);
  }

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.providerApplications', payload) };
  }

  const { data, error } = await supabase
    .from('provider_applications')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.providerApplications', payload, error), error };
  }

  return { stored: 'supabase', data };
}

function toBookingDate(date, month = 'May') {
  const day = Number(date);
  if (!Number.isFinite(day)) return null;
  const MONTHS = { Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5, Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11 };
  const mi = MONTHS[month];
  if (mi == null) return null; // unknown month → no guess (was silently April)
  // Pick the year so the month/day is upcoming — this year, or next year if it
  // has already passed. (Was hardcoded 2026, which silently breaks past 2026.)
  const now = new Date();
  let year = now.getFullYear();
  if (mi < now.getMonth() || (mi === now.getMonth() && day < now.getDate())) year += 1;
  return `${year}-${String(mi + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function scheduledAtFromSlot(slot = {}) {
  const scheduledDate = slot.scheduled_date || toBookingDate(slot.date, slot.month || 'May');
  if (!scheduledDate || !slot.time || slot.time === '--') return null;
  return `${scheduledDate}T${String(slot.time).padStart(5, '0')}:00`;
}

async function createSessionRequest({
  providerId,
  providerRole,
  type = 'video',
  scheduledAt,
  durationMin = 15,
  meetingUrl = '',
  clientPhone = '',
  clientName = '',
  clientEmail = '',
  topic = '',
  notes = '',
} = {}) {
  const normalizedRole = normalizeRole(providerRole);
  const normalizedProviderId = Number(providerId);
  if (!Number.isInteger(normalizedProviderId) || normalizedProviderId <= 0 || !['trainer', 'nutritionist'].includes(normalizedRole)) {
    throw new Error('Missing provider row for session booking.');
  }
  if (!scheduledAt) {
    throw new Error('Choose a valid session time.');
  }

  const profile = state.profile || {};
  const user = state.user || {};
  const resolvedClientName = clientName || profile.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Shape client';
  const resolvedClientEmail = clientEmail || user.email || profile.email || '';
  if (!resolvedClientEmail) {
    throw new Error('Client email is required before booking a session.');
  }

  const payload = {
    client_id: state.user?.id || null,
    client_name: resolvedClientName,
    client_email: resolvedClientEmail,
    provider_id: normalizedProviderId,
    provider_role: normalizedRole,
    type,
    scheduled_at: scheduledAt,
    duration_min: durationMin,
    status: 'requested',
    meeting_url: meetingUrl || null,
    client_phone: clientPhone || profile.phone || null,
    topic,
    notes,
  };

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.sessions', payload) };
  }

  const { data, error } = await supabase
    .from('sessions')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.sessions', payload, error), error };
  }

  return { stored: 'supabase', data };
}

async function listSessions() {
  if (!state.user?.id) {
    throw new Error('Sign in before loading sessions.');
  }
  if (!supabase) return { stored: 'local', data: [] };

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .order('scheduled_at', { ascending: true });

  if (error) throw error;
  return { stored: 'supabase', data: data || [] };
}

async function updateSessionStatus({ sessionId, status, meetingUrl } = {}) {
  if (!sessionId || !status) {
    throw new Error('Missing session update details.');
  }
  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.sessionUpdates', { sessionId, status, meetingUrl }) };
  }

  const patch = { status };
  if (meetingUrl !== undefined) patch.meeting_url = meetingUrl || null;

  const { data, error } = await supabase
    .from('sessions')
    .update(patch)
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw error;
  return { stored: 'supabase', data };
}

async function submitConsultationBooking({ coach, role, slot = {}, topic = 'Free intro call' }) {
  const profile = state.profile || {};
  const user = state.user || {};
  const clientName = profile.full_name || user.user_metadata?.full_name || user.email?.split('@')[0] || 'Shape client';
  const clientEmail = user.email || profile.email || '';
  const professionalType = normalizeRole(role || coach?.provider_role);
  const scheduledAt = scheduledAtFromSlot(slot);

  if (!coach?.name || !['trainer', 'nutritionist'].includes(professionalType)) {
    throw new Error('Missing provider details for booking.');
  }
  if (!scheduledAt) {
    throw new Error('Choose a valid consultation time.');
  }
  if (!clientEmail) {
    throw new Error('Sign in with an email before booking a consultation.');
  }

  const providerId = coach.provider_id || coach.db_id;
  const session = await createSessionRequest({
    providerId,
    providerRole: professionalType,
    type: 'video',
    scheduledAt,
    durationMin: 15,
    clientName,
    clientEmail,
    topic,
    notes: `Intro consultation with ${coach.name}.`,
  });

  return { stored: session.stored, data: session.data, session };
}

async function listProviderAvailability({ providerId, providerRole } = {}) {
  const normalizedRole = normalizeRole(providerRole);
  const normalizedProviderId = Number(providerId);
  if (!Number.isInteger(normalizedProviderId) || normalizedProviderId <= 0 || !['trainer', 'nutritionist'].includes(normalizedRole)) {
    throw new Error('Missing provider row for availability lookup.');
  }
  if (!supabase) return { stored: 'local', data: [] };

  const { data, error } = await supabase
    .from('provider_availability')
    .select('*')
    .eq('provider_role', normalizedRole)
    .eq('provider_id', normalizedProviderId)
    .order('weekday', { ascending: true })
    .order('start_minute', { ascending: true });

  if (error) throw error;
  return { stored: 'supabase', data: data || [] };
}

async function saveProviderAvailability({ providerId, providerRole, slots = [] } = {}) {
  const normalizedRole = normalizeRole(providerRole);
  const normalizedProviderId = Number(providerId);
  if (!Number.isInteger(normalizedProviderId) || normalizedProviderId <= 0 || !['trainer', 'nutritionist'].includes(normalizedRole)) {
    throw new Error('Missing provider row for availability update.');
  }

  const payload = slots.map(slot => ({
    provider_id: normalizedProviderId,
    provider_role: normalizedRole,
    weekday: Number(slot.weekday),
    start_minute: Number(slot.start_minute ?? slot.startMinute),
    duration_min: Number(slot.duration_min ?? slot.durationMin ?? 15),
  })).filter(slot =>
    Number.isInteger(slot.weekday) &&
    slot.weekday >= 0 &&
    slot.weekday <= 6 &&
    Number.isInteger(slot.start_minute) &&
    slot.start_minute >= 0 &&
    slot.start_minute <= 1439
  );

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.providerAvailability', payload) };
  }

  const deleteResult = await supabase
    .from('provider_availability')
    .delete()
    .eq('provider_role', normalizedRole)
    .eq('provider_id', normalizedProviderId);
  if (deleteResult.error) throw deleteResult.error;

  if (!payload.length) return { stored: 'supabase', data: [] };

  const { data, error } = await supabase
    .from('provider_availability')
    .insert(payload)
    .select();

  if (error) throw error;
  return { stored: 'supabase', data: data || [] };
}

function extractSpotifyPlaylistId(input = '') {
  const text = String(input || '').trim();
  if (!text) return '';
  const match = text.match(/playlist\/([A-Za-z0-9]+)/);
  return match?.[1] || text;
}

async function getOwnedTrainerId() {
  if (!supabase || !state.user?.id) return null;
  const { data, error } = await supabase
    .from('trainers')
    .select('id')
    .eq('owner_id', state.user.id)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

// trainer/nutritionist -> the provider table that holds that role's rows.
function providerTable(role) {
  return role === 'nutritionist' ? 'nutritionists' : 'trainers';
}

async function getOwnedProviderId(role = 'trainer') {
  if (!supabase || !state.user?.id) return null;
  const normalizedRole = normalizeRole(role);
  const table = providerTable(normalizedRole);
  const { data, error } = await supabase
    .from(table)
    .select('id')
    .eq('owner_id', state.user.id)
    .order('id', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.id || null;
}

// ─── At-capacity (pause new bookings) ────────────────────────────────────────
// Read the signed-in coach's own provider row capacity flag. Returns null when
// the user has no provider row (i.e. not a coach). RLS lets a provider read +
// update their own row via owner_id = auth.uid().
async function getProviderCapacity() {
  if (!supabase || !state.user?.id) return null;
  for (const role of ['trainer', 'nutritionist']) {
    const table = providerTable(role);
    const { data } = await supabase
      .from(table)
      .select('id, at_capacity, capacity_resume_at')
      .eq('owner_id', state.user.id)
      .order('id', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (data) {
      return { role, providerId: data.id, atCapacity: !!data.at_capacity, resumeAt: data.capacity_resume_at || null };
    }
  }
  return null;
}

// Flip the coach's at_capacity flag. When turning it ON you can optionally pass
// an auto-resume date (ISO); turning it OFF clears any resume date.
async function setProviderCapacity({ atCapacity, resumeAt = null } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to update bookings.');
  let table = null;
  for (const role of ['trainer', 'nutritionist']) {
    const tbl = providerTable(role);
    const { data } = await supabase.from(tbl).select('id').eq('owner_id', state.user.id).limit(1).maybeSingle();
    if (data) { table = tbl; break; }
  }
  if (!table) throw new Error('No coach profile found for this account.');
  const { data, error } = await supabase
    .from(table)
    .update({ at_capacity: !!atCapacity, capacity_resume_at: atCapacity ? (resumeAt || null) : null })
    .eq('owner_id', state.user.id)
    .select('id, at_capacity, capacity_resume_at')
    .maybeSingle();
  if (error) throw error;
  return { atCapacity: !!data?.at_capacity, resumeAt: data?.capacity_resume_at || null };
}

function playlistFromRow(row) {
  return {
    id: row.id,
    name: row.title,
    title: row.title,
    service: 'spotify',
    bpm: 'Shape Radio',
    tracks: 0,
    attached: row.workout_id ? `Workout #${row.workout_id}` : 'General trainer playlist',
    targetType: row.workout_id ? 'WORKOUT' : 'PLAYLIST',
    note: row.description || 'Trainer-curated Spotify playlist.',
    clients: 'Live on Shape',
    url: `https://open.spotify.com/playlist/${row.spotify_playlist_id}`,
    spotify_playlist_id: row.spotify_playlist_id,
    trainer_id: row.trainer_id,
    workout_id: row.workout_id,
  };
}

async function listTrainerPlaylists({ trainerId } = {}) {
  if (!supabase) {
    return { stored: 'local', data: [] };
  }

  let query = supabase
    .from('trainer_playlists')
    .select('*')
    .order('created_at', { ascending: false });
  if (trainerId) query = query.eq('trainer_id', trainerId);

  const { data, error } = await query;
  if (error) {
    return { stored: 'local', data: [], error };
  }
  return { stored: 'supabase', data: (data || []).map(playlistFromRow) };
}

async function createTrainerPlaylist({ title, description, spotifyUrl, workoutId, trainerId } = {}) {
  const spotifyPlaylistId = extractSpotifyPlaylistId(spotifyUrl);
  const resolvedTrainerId = trainerId || await getOwnedTrainerId();

  if (!title || !spotifyPlaylistId) {
    throw new Error('Playlist title and Spotify playlist link are required.');
  }

  const payload = {
    trainer_id: resolvedTrainerId || 4,
    workout_id: workoutId || null,
    title,
    description: description || '',
    spotify_playlist_id: spotifyPlaylistId,
  };

  if (!supabase || !resolvedTrainerId) {
    return { stored: 'local', data: saveLocalRecord('shape.trainerPlaylists', payload) };
  }

  const { data, error } = await supabase
    .from('trainer_playlists')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.trainerPlaylists', payload, error), error };
  }

  return { stored: 'supabase', data: playlistFromRow(data) };
}

function workoutFromRow(row) {
  return {
    id: row.id,
    trainer_id: row.trainer_id,
    client_id: row.client_id,
    title: row.title,
    description: row.description || '',
    kind: row.kind,
    payload: row.payload || {},
    playlist_id: row.playlist_id,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function listClientWorkouts({ clientId, trainerId, status = 'published' } = {}) {
  if (!state.user?.id) {
    throw new Error('Sign in before loading workouts.');
  }
  if (!supabase) return { stored: 'local', data: [] };

  let query = supabase
    .from('client_workouts')
    .select('*')
    .order('created_at', { ascending: false });
  if (clientId) query = query.eq('client_id', clientId);
  if (trainerId) query = query.eq('trainer_id', trainerId);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) throw error;
  return { stored: 'supabase', data: (data || []).map(workoutFromRow) };
}

async function assignClientWorkout({
  trainerId,
  clientId,
  title,
  description = '',
  kind = 'custom',
  payload = {},
  playlistId = null,
  scheduledDate = null,
} = {}) {
  if (!clientId || !title) {
    throw new Error('Client and workout title are required.');
  }
  const resolvedTrainerId = trainerId || await getOwnedTrainerId();
  if (!resolvedTrainerId) {
    throw new Error('No trainer profile is connected to this account.');
  }

  const payloadRow = {
    trainer_id: resolvedTrainerId,
    client_id: clientId,
    title,
    description,
    kind: kind === 'template' ? 'template' : 'custom',
    payload: payload || {},
    playlist_id: playlistId || null,
    scheduled_date: scheduledDate || null,
    status: 'published',
  };

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.clientWorkouts', payloadRow) };
  }

  const { data, error } = await supabase
    .from('client_workouts')
    .insert(payloadRow)
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.clientWorkouts', payloadRow, error), error };
  }
  return { stored: 'supabase', data: workoutFromRow(data) };
}

// ─── Self-authored training ──────────────────────────────────────────────────
// A member with no coach builds their own workouts, programs and race
// schedules. Self rows are client_workouts with trainer_id NULL, written
// directly under the client self-CRUD RLS (2026-07-08-self-authored-workouts).
// The client's /api/client/plan reads them back exactly like coach rows.
function selfRunId() {
  return 'p' + Math.random().toString(36).slice(2, 9);
}
// Shape a materialized row into a client_workouts insert record (self row).
function selfWorkoutRow({ title, description = '', scheduledDate = null, payload = {} }) {
  return {
    trainer_id: null,
    client_id: state.user.id,
    title: title || 'Workout',
    description: description || '',
    kind: 'custom',
    payload: payload || {},
    scheduled_date: scheduledDate || null,
    status: 'published',
  };
}
// One self-row insert (self = trainer_id null, client = the signed-in user).
async function insertSelfWorkout(spec) {
  if (!supabase || !state.user?.id) throw new Error('Sign in first.');
  const { data, error } = await supabase.from('client_workouts').insert(selfWorkoutRow(spec)).select().single();
  if (error) throw error;
  return workoutFromRow(data);
}
// Batch insert (one round-trip) — a full program is up to CAP (182) rows.
async function insertSelfWorkouts(specs) {
  if (!supabase || !state.user?.id) throw new Error('Sign in first.');
  if (!specs.length) return [];
  const { data, error } = await supabase.from('client_workouts').insert(specs.map(selfWorkoutRow)).select();
  if (error) throw error;
  return (data || []).map(workoutFromRow);
}
// A weekly-repeating session — ONE row carrying payload.repeatDow. When editId
// is passed (Edit · Yours), the prior repeat row is retired after the new one
// lands so removed weekdays don't linger and duplicates can't accumulate.
async function saveSelfSession({ name, discipline, repeatDow, moves, time, editId } = {}) {
  const spec = bsRepeatSpec({ name, discipline, repeatDow, moves, time });
  const created = await insertSelfWorkout({ title: spec.title, description: spec.description, payload: spec.payload });
  if (editId && editId !== created.id) {
    try { await supabase.from('client_workouts').delete().eq('id', editId).is('trainer_id', null); } catch (e) {}
  }
  invalidateClientMetrics();
  return { runId: null, count: 1, data: created };
}
// A multi-week program — dated rows materialized across the block, stamped
// payload.program{runId}, inserted in ONE batch. The rows land FIRST; a caller
// replacing a prior block deletes it only after (atomic-in-effect) — see
// startPurchasedPlan/removeProgram.
async function saveSelfProgram({ name, discipline, weeks, startISO } = {}) {
  const runId = selfRunId();
  const rows = bsMaterializeProgram({ name, discipline, weeks, startISO, runId });
  await insertSelfWorkouts(rows);
  invalidateClientMetrics();
  return { runId, count: rows.length };
}
// Start a PURCHASED plan onto the calendar. Materialize the outline → insert the
// NEW block (fresh runId, one batch) → only then delete the prior plan:<id> rows
// with a different runId. A mid-flow failure leaves the old block intact; readers
// show the newest runId, so a re-start never duplicates.
async function startPurchasedPlan({ plan, startISO, weeks = 4 } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in first.');
  const runId = selfRunId();
  const rows = bsMaterializeOutline({ plan, startISO, weeks, runId });
  await insertSelfWorkouts(rows);
  // New block landed — retire the prior run of THIS plan (best-effort).
  try {
    const programId = `plan:${plan.id}`;
    const { data: prior } = await supabase.from('client_workouts')
      .select('id, payload')
      .eq('client_id', state.user.id)
      .is('trainer_id', null);
    const stale = (prior || []).filter((w) => {
      const p = w.payload && w.payload.program;
      return p && p.id === programId && p.runId && p.runId !== runId;
    }).map((w) => w.id);
    if (stale.length) await supabase.from('client_workouts').delete().in('id', stale);
  } catch (e) { /* the new block is live; a stale-row sweep failure is non-fatal */ }
  invalidateClientMetrics();
  return { runId, count: rows.length };
}
// Delete a single self row (edit/retire one day) or a whole program by its id.
async function removeSelfWorkout(id) {
  if (!supabase || !state.user?.id || !id) return { ok: false };
  const { error } = await supabase.from('client_workouts').delete().eq('id', id).is('trainer_id', null);
  invalidateClientMetrics();
  return { ok: !error, error };
}
async function removeSelfProgram(programId) {
  if (!supabase || !state.user?.id || !programId) return { ok: false };
  const { data: rows } = await supabase.from('client_workouts')
    .select('id, payload').eq('client_id', state.user.id).is('trainer_id', null);
  const ids = (rows || []).filter((w) => w.payload && w.payload.program && w.payload.program.id === programId).map((w) => w.id);
  if (ids.length) await supabase.from('client_workouts').delete().in('id', ids);
  invalidateClientMetrics();
  return { ok: true, count: ids.length };
}
// The member's own self rows (for edit/delete surfaces).
async function listSelfWorkouts() {
  if (!supabase || !state.user?.id) return [];
  const { data } = await supabase.from('client_workouts')
    .select('*').eq('client_id', state.user.id).is('trainer_id', null).eq('status', 'published');
  return (data || []).map(workoutFromRow);
}
window.ShapeSelfTraining = {
  saveSession: saveSelfSession,
  saveProgram: saveSelfProgram,
  startPurchasedPlan,
  remove: removeSelfWorkout,
  removeProgram: removeSelfProgram,
  list: listSelfWorkouts,
};

// ✦ AI draft for the builder — POST a goal, get a STRUCTURED program back (the
// builder's review shape). Returns null on any failure (the sheet shows the
// honest "unavailable" fallback); NOTHING is saved here.
async function draftTrainingProgram({ goal, weeks, daysPerWeek, discipline, experience } = {}) {
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/ai/draft-program`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ goal, weeks, daysPerWeek, discipline, experience }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok || !d || !d.program) return null;
    return d.program; // { name, discipline, weeks: [...] }
  } catch (e) { return null; }
}
window.ShapeTrainingAI = { draft: draftTrainingProgram };

async function updateClientWorkout({ workoutId, patch = {} } = {}) {
  if (!workoutId) {
    throw new Error('Workout id is required.');
  }
  const allowed = {};
  ['title', 'description', 'kind', 'payload', 'playlist_id', 'status'].forEach(key => {
    if (patch[key] !== undefined) allowed[key] = patch[key];
  });

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.clientWorkoutUpdates', { workoutId, patch: allowed }) };
  }

  const { data, error } = await supabase
    .from('client_workouts')
    .update(allowed)
    .eq('id', workoutId)
    .select()
    .single();

  if (error) throw error;
  return { stored: 'supabase', data: workoutFromRow(data) };
}

function normalizeProviderRoleForMessages(role) {
  const clean = String(role || '').toLowerCase();
  if (clean.includes('nutrition')) return 'nutritionist';
  if (clean.includes('trainer')) return 'trainer';
  return normalizeRole(clean);
}

function resolveCoachProvider(coach = {}) {
  const providerRole = normalizeProviderRoleForMessages(coach.provider_role || coach.role || coach.kind);
  const rawId = coach.provider_id || coach.db_id || coach.providerId || coach.id;
  const providerId = Number(String(rawId || '').replace(/^[a-z]/i, ''));
  if (!['trainer', 'nutritionist'].includes(providerRole) || !Number.isInteger(providerId) || providerId <= 0) {
    return null;
  }
  return { providerRole, providerId };
}

function conversationToThread(conversation, messages = []) {
  const providerRole = conversation.provider_role === 'nutritionist' ? 'Nutritionist' : 'Trainer';
  const ordered = [...messages].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  return {
    id: `conversation-${conversation.id}`,
    conversation_id: conversation.id,
    provider_id: conversation.provider_id,
    provider_role: conversation.provider_role,
    who: conversation.title || providerRole,
    role: `${providerRole} - Shape coach`,
    last: conversation.last_message || ordered.at(-1)?.body || 'New conversation',
    time: conversation.last_message_at ? 'synced' : 'now',
    unread: 0,
    bucket: 'COACH',
    messages: ordered.map(message => ({
      who: message.sender_id === state.user?.id ? 'You' : conversation.title || providerRole,
      t: message.body,
      time: message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now',
      me: message.sender_id === state.user?.id,
      coach: message.sender_id !== state.user?.id,
      audio: message.metadata && message.metadata.audio ? message.metadata.audio.url : null,
      photo: message.metadata && message.metadata.photo ? message.metadata.photo.url : null,
      sharedChannel: (message.metadata && message.metadata.channel && message.metadata.channel.id != null) ? message.metadata.channel : null,
      boost: (message.metadata && message.metadata.kind === 'live_boost' && (message.metadata.activity === 'cooking' || message.metadata.activity === 'workout')) ? message.metadata.activity : null,
      coachInvite: (message.metadata && message.metadata.kind === 'coach_invite' && message.metadata.providerId != null)
        ? { role: message.metadata.role === 'nutritionist' ? 'nutritionist' : 'trainer', providerId: Number(message.metadata.providerId), name: String(message.metadata.name || 'Your coach') }
        : null,
    })),
    updatedAt: conversation.updated_at || conversation.last_message_at || conversation.created_at,
  };
}

// Member-to-member DM: find or create the 1:1 conversation, then it behaves
// like any other conversation (sendMessage / subscribeMessages by id).
async function getOrCreateMemberConversation({ otherUserId } = {}) {
  if (!state.user?.id) throw new Error('Sign in before messaging.');
  if (!supabase) return { stored: 'local', data: null };
  const { data, error } = await supabase.rpc('get_or_create_member_conversation', { p_other_user_id: otherUserId });
  if (error) throw error;
  return { stored: 'supabase', data };
}

function memberThreadFromRow(row, messages = []) {
  const ordered = [...messages].sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
  const other = row.other_name || 'Member';
  return {
    id: `conversation-${row.conversation_id}`,
    conversation_id: row.conversation_id,
    provider_role: null,
    who: other,
    role: 'Direct message',
    last: row.last_message || ordered.at(-1)?.body || 'New conversation',
    time: row.last_message_at ? 'synced' : 'now',
    unread: 0,
    bucket: 'DM',
    messages: ordered.map(message => ({
      who: message.sender_id === state.user?.id ? 'You' : other,
      t: message.body,
      time: message.created_at ? new Date(message.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now',
      me: message.sender_id === state.user?.id,
      audio: message.metadata && message.metadata.audio ? message.metadata.audio.url : null,
      photo: message.metadata && message.metadata.photo ? message.metadata.photo.url : null,
      sharedChannel: (message.metadata && message.metadata.channel && message.metadata.channel.id != null) ? message.metadata.channel : null,
      boost: (message.metadata && message.metadata.kind === 'live_boost' && (message.metadata.activity === 'cooking' || message.metadata.activity === 'workout')) ? message.metadata.activity : null,
      coachInvite: (message.metadata && message.metadata.kind === 'coach_invite' && message.metadata.providerId != null)
        ? { role: message.metadata.role === 'nutritionist' ? 'nutritionist' : 'trainer', providerId: Number(message.metadata.providerId), name: String(message.metadata.name || 'Your coach') }
        : null,
    })),
    updatedAt: row.last_message_at,
  };
}

async function listMemberThreads() {
  if (!state.user?.id || !supabase) return { stored: 'local', data: [] };
  const { data: rows, error } = await supabase.rpc('list_member_dm_threads');
  if (error) throw error;
  const ids = (rows || []).map(r => r.conversation_id);
  let byConversation = {};
  if (ids.length) {
    const { data: messages } = await supabase
      .from('messages').select('*').in('conversation_id', ids).order('created_at', { ascending: true });
    byConversation = (messages || []).reduce((acc, m) => { (acc[m.conversation_id] || (acc[m.conversation_id] = [])).push(m); return acc; }, {});
  }
  return { stored: 'supabase', data: (rows || []).map(r => memberThreadFromRow(r, byConversation[r.conversation_id] || [])) };
}

async function getOrCreateDirectConversation({ providerRole, providerId } = {}) {
  if (!state.user?.id) {
    throw new Error('Sign in before messaging a coach.');
  }
  if (!supabase) {
    return { stored: 'local', data: null };
  }

  const { data, error } = await supabase.rpc('get_or_create_direct_conversation', {
    p_provider_role: normalizeProviderRoleForMessages(providerRole),
    p_provider_id: Number(providerId),
  });

  if (error) throw error;
  return { stored: 'supabase', data };
}

async function sendMessage({ conversationId, body, metadata = {} } = {}) {
  const clean = String(body || '').trim();
  if (!clean) throw new Error('Message cannot be empty.');
  if (!state.user?.id) throw new Error('Sign in before sending messages.');
  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.messages', { conversationId, body: clean, metadata }) };
  }

  const { data, error } = await supabase
    .from('messages')
    .insert({
      conversation_id: conversationId,
      sender_id: state.user.id,
      body: clean,
      metadata,
    })
    .select()
    .single();

  if (error) throw error;
  return { stored: 'supabase', data };
}

async function sendProviderMessage({ coach, text } = {}) {
  const clean = String(text || '').trim();
  const provider = resolveCoachProvider(coach);
  if (!clean) throw new Error('Message cannot be empty.');
  if (!provider || !supabase || !state.user?.id) {
    return { stored: 'local', data: saveLocalRecord('shape.providerMessages', { coach, text: clean }) };
  }

  const conversation = await getOrCreateDirectConversation(provider);
  const message = await sendMessage({
    conversationId: conversation.data,
    body: clean,
    metadata: {
      source: 'marketplace',
      provider_id: provider.providerId,
      provider_role: provider.providerRole,
      provider_name: coach?.name || '',
    },
  });

  return {
    stored: 'supabase',
    conversationId: conversation.data,
    data: message.data,
  };
}

async function listDirectCoachThreads() {
  if (!state.user?.id || !supabase) {
    return { stored: 'local', data: [] };
  }

  const { data: conversations, error } = await supabase
    .from('conversations')
    .select('*')
    .eq('kind', 'direct')
    .is('dm_key', null) // member↔member DMs (dm_key set) are listed separately
    .order('last_message_at', { ascending: false, nullsFirst: false });

  if (error) throw error;
  const ids = (conversations || []).map(item => item.id);
  if (!ids.length) return { stored: 'supabase', data: [] };

  const { data: messages, error: messageError } = await supabase
    .from('messages')
    .select('*')
    .in('conversation_id', ids)
    .order('created_at', { ascending: true });

  if (messageError) throw messageError;
  const byConversation = (messages || []).reduce((acc, message) => {
    if (!acc[message.conversation_id]) acc[message.conversation_id] = [];
    acc[message.conversation_id].push(message);
    return acc;
  }, {});

  return {
    stored: 'supabase',
    data: (conversations || []).map(conversation => conversationToThread(conversation, byConversation[conversation.id] || [])),
  };
}

function titleCase(value) {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, letter => letter.toUpperCase());
}

function providerLabel(provider) {
  const clean = String(provider || '').toLowerCase();
  if (clean === 'strava') return 'Strava';
  if (clean === 'garmin') return 'Garmin';
  if (clean === 'apple' || clean === 'apple_health') return 'Apple Health';
  if (clean === 'whoop') return 'WHOOP';
  if (clean === 'sensor') return 'Sensor';
  return clean ? titleCase(clean) : '';
}

function decodePolyline(encoded = '') {
  const points = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let result = 0;
    let shift = 0;
    let byte = null;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lat += (result & 1) ? ~(result >> 1) : (result >> 1);

    result = 0;
    shift = 0;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20 && index < encoded.length);
    lng += (result & 1) ? ~(result >> 1) : (result >> 1);

    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

function normalizedGeoPoint(point) {
  if (!point) return null;
  if (Array.isArray(point)) {
    const a = Number(point[0]);
    const b = Number(point[1]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    if (Math.abs(a) <= 90 && Math.abs(b) <= 180) return { lat: a, lng: b };
    if (Math.abs(b) <= 90 && Math.abs(a) <= 180) return { lat: b, lng: a };
    return null;
  }

  const lat = Number(point.lat ?? point.latitude ?? point[1]);
  const lng = Number(point.lng ?? point.lon ?? point.long ?? point.longitude ?? point[0]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function projectGeoPoints(points = []) {
  const geo = points.map(normalizedGeoPoint).filter(Boolean);
  if (geo.length < 2) return [];

  const lats = geo.map(point => point.lat);
  const lngs = geo.map(point => point.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  const latSpan = maxLat - minLat || 1;
  const lngSpan = maxLng - minLng || 1;
  const pad = 8;
  const scale = 100 - pad * 2;

  return geo.map(point => [
    Number((pad + ((point.lng - minLng) / lngSpan) * scale).toFixed(2)),
    Number((pad + ((maxLat - point.lat) / latSpan) * scale).toFixed(2)),
  ]);
}

function routePolylineFrom(route = {}, metrics = {}) {
  return route.polyline
    || route.summary_polyline
    || route.encoded_polyline
    || route?.map?.summary_polyline
    || route?.map?.polyline
    || metrics.polyline
    || metrics.summary_polyline
    || metrics.encoded_polyline
    || metrics?.map?.summary_polyline
    || metrics?.map?.polyline
    || '';
}

function routePointCandidates(route = {}, metrics = {}) {
  return route.latlng
    || route.latlngs
    || route.coordinates
    || route.path
    || route.gps
    || route.geojson?.coordinates
    || metrics.latlng
    || metrics.latlngs
    || metrics.coordinates
    || metrics.path
    || [];
}

function normalizeDisplayRoute(route = {}, metrics = {}, sourceProvider = '') {
  const rawRoute = route || {};
  const rawMetrics = metrics || {};
  const provider = providerLabel(sourceProvider || rawRoute.provider || rawMetrics.provider);
  let points = Array.isArray(rawRoute.points) ? rawRoute.points : [];

  const looksProjected = points.length >= 2
    && points.every(point => Array.isArray(point)
      && Number.isFinite(Number(point[0]))
      && Number.isFinite(Number(point[1]))
      && Math.abs(Number(point[0])) <= 110
      && Math.abs(Number(point[1])) <= 110);

  if (!looksProjected) {
    points = projectGeoPoints(points);
  }

  if (points.length < 2) {
    const polyline = routePolylineFrom(rawRoute, rawMetrics);
    if (polyline) points = projectGeoPoints(decodePolyline(polyline));
  }

  if (points.length < 2) {
    points = projectGeoPoints(routePointCandidates(rawRoute, rawMetrics));
  }

  if (points.length < 2) return null;

  return {
    ...rawRoute,
    kind: rawRoute.kind || rawRoute.type || rawMetrics.activityType || rawMetrics.sport_name || 'GPS route',
    area: rawRoute.area || rawRoute.name || rawRoute.location || rawMetrics.location || rawMetrics.name || 'Imported activity',
    privacy: rawRoute.privacy || rawMetrics.routePrivacy || 'Start/end hidden',
    elevation: rawRoute.elevation || rawRoute.elevationGain || rawMetrics.elevation || rawMetrics.elevation_gain || rawMetrics.total_elevation_gain || 'GPS imported',
    provider,
    imported: Boolean(provider || sourceProvider || rawRoute.imported),
    points,
  };
}

function numericMetric(metrics = {}, keys = []) {
  for (const key of keys) {
    const value = metrics[key];
    const number = Number(value);
    if (Number.isFinite(number) && number > 0) return number;
  }
  return null;
}

function formatMetersToMiles(meters) {
  if (!Number.isFinite(meters) || meters <= 0) return '';
  const miles = meters / 1609.344;
  return `${miles >= 10 ? miles.toFixed(1) : miles.toFixed(2)} mi`;
}

function formatSeconds(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '';
  const rounded = Math.round(seconds);
  const hours = Math.floor(rounded / 3600);
  const minutes = Math.floor((rounded % 3600) / 60);
  if (hours) return `${hours}h ${String(minutes).padStart(2, '0')}m`;
  return `${minutes || 1} min`;
}

function formatPace(distanceMeters, seconds) {
  if (!Number.isFinite(distanceMeters) || !Number.isFinite(seconds) || distanceMeters <= 0 || seconds <= 0) return '';
  const secondsPerMile = seconds / (distanceMeters / 1609.344);
  const minutes = Math.floor(secondsPerMile / 60);
  const secs = Math.round(secondsPerMile % 60);
  return `${minutes}:${String(secs).padStart(2, '0')} pace`;
}

function normalizeCommunityStats(metrics = {}) {
  const distanceMeters = numericMetric(metrics, ['distance_meters', 'distance_meter', 'distance', 'distanceMeters']);
  const durationSeconds = numericMetric(metrics, ['moving_time', 'elapsed_time', 'duration_seconds', 'durationSeconds']);
  const heartRate = numericMetric(metrics, ['average_heartrate', 'average_heart_rate', 'avg_hr', 'heartRate']);
  const calories = numericMetric(metrics, ['calories', 'kilocalories']);
  const elevationMeters = numericMetric(metrics, ['total_elevation_gain', 'elevation_gain', 'elevationGain']);
  const elevationFeet = elevationMeters ? Math.round(elevationMeters * 3.28084) : null;

  return {
    // `real` = the post actually carries metric data. The 'Live / On plan /
    // Shape' strings below are display filler so sensor cards always show a
    // full 3-up row — plain text posts must NOT be classified as activities
    // because of them (they'd render as fake WORKOUT cards).
    real: !!(distanceMeters || durationSeconds || heartRate || calories || elevationMeters
      || metrics.statA || metrics.statB || metrics.statC || metrics.distance || metrics.duration
      || metrics.pace || metrics.sets || metrics.heartRate),
    statA: metrics.statA || formatMetersToMiles(distanceMeters) || metrics.distance || metrics.duration || formatSeconds(durationSeconds) || 'Live',
    statB: metrics.statB || metrics.pace || formatPace(distanceMeters, durationSeconds) || metrics.sets || 'On plan',
    statC: metrics.statC || (heartRate ? `${Math.round(heartRate)} bpm` : '') || (calories ? `${Math.round(calories)} kcal` : '') || (elevationFeet ? `${elevationFeet} ft` : '') || metrics.heartRate || 'Shape',
    labels: metrics.labels || [
      distanceMeters ? 'Distance' : 'Metric',
      distanceMeters && durationSeconds ? 'Pace' : 'Metric',
      heartRate ? 'Heart' : calories ? 'Calories' : elevationFeet ? 'Elev.' : 'Metric',
    ],
  };
}

function communityPostFromRow(row) {
  const metrics = row.metrics || {};
  const route = row.route || {};
  const displayRoute = normalizeDisplayRoute(route, metrics, row.source_provider);
  const stats = normalizeCommunityStats(metrics);
  const provider = providerLabel(row.source_provider);
  const comments = Array.isArray(row.comments) ? row.comments : [];
  const likes = Array.isArray(row.likes) ? row.likes : [];
  const authorName = row.author_name || 'Shape member';
  const privacy = String(row.privacy || 'community');
  const tags = metrics.tags || [privacy.toUpperCase(), String(row.author_role || 'client').toUpperCase()];
  const displayTags = provider
    ? Array.from(new Set([provider.toUpperCase(), ...(displayRoute ? ['GPS'] : []), ...tags]))
    : tags;
  return {
    id: row.id,
    author_id: row.author_id || null,
    created_at: row.created_at || null,
    name: authorName,
    photo: row.photo_url || (metrics && metrics.photo_url) || null,
    mentions: Array.isArray(metrics.mentions) ? metrics.mentions : [],
    channel: typeof metrics.channel === 'string' ? metrics.channel : '',
    // Rich "log activity" post types (Substack-style profile publishing).
    kind: typeof metrics.kind === 'string' ? metrics.kind : '',
    video: metrics.video_url || metrics.video || null,
    link: (metrics.link && metrics.link.url) ? metrics.link : null,
    workoutStats: Array.isArray(metrics.workoutStats) ? metrics.workoutStats : null,
    coach: typeof metrics.coach === 'string' ? metrics.coach : '',
    program: typeof metrics.program === 'string' ? metrics.program : '',
    delta: typeof metrics.delta === 'string' ? metrics.delta : '',
    // Coach co-sign: stamped by post_coach_cosign when one of the author's own
    // coaches reacts ({name, role}); null until that happens. Drives the card badge.
    cosign: (metrics.cosign && typeof metrics.cosign === 'object' && metrics.cosign.name)
      ? { name: String(metrics.cosign.name), role: String(metrics.cosign.role || 'trainer'), byId: metrics.cosign.byId || null }
      : null,
    repostOf: (metrics.repostOf && typeof metrics.repostOf === 'object') ? metrics.repostOf : null,
    role: row.author_role === 'trainer' ? 'Trainer' : row.author_role === 'nutritionist' ? 'Nutritionist' : 'Client',
    avatar: authorName.trim()[0]?.toUpperCase() || 'S',
    time: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now',
    privacy: privacy === 'public' ? 'Public' : privacy === 'private' ? 'Private' : privacy === 'profile' ? 'Profile' : 'Community',
    workout: row.activity_type || 'Workout',
    status: row.status || row.title,
    statA: stats.statA,
    statB: stats.statB,
    statC: stats.statC,
    hasRealStats: !!stats.real,
    labels: stats.labels,
    note: row.note || '',
    route: displayRoute,
    rawMetrics: metrics,
    rawRoute: route,
    tags: displayTags,
    likes: likes.length,
    likerIds: likes.map((l) => l.user_id).filter(Boolean),
    liked: likes.some(like => like.user_id === state.user?.id),
    comments: comments.map(comment => ({
      who: comment.author_name || 'Shape member',
      text: comment.body,
      userId: comment.user_id || null,
    })),
    live: privacy !== 'private',
    source_provider: row.source_provider || null,
    sourceProviderLabel: provider,
    source_activity_id: row.source_activity_id || null,
  };
}

const SENSOR_PROVIDERS = ['whoop', 'strava', 'garmin', 'apple_health', 'apple_music', 'apple'];

async function listSensorWorkoutLogs() {
  if (!state.user?.id) throw new Error('Sign in before viewing sensor logs.');

  if (!supabase) {
    const localPosts = readLocalRecords('shape.communityPosts').map((post) => post.payload || post);
    return { stored: 'local', data: localPosts.filter((post) => SENSOR_PROVIDERS.includes(String(post.source_provider || '').toLowerCase())) };
  }

  const { data, error } = await supabase
    .from('community_posts')
    .select(COMMUNITY_POST_SELECT)
    .eq('author_id', state.user.id)
    .in('source_provider', SENSOR_PROVIDERS)
    .order('created_at', { ascending: false })
    .limit(25);

  if (error) throw error;
  return { stored: 'supabase', data: (data || []).map(communityPostFromRow) };
}

async function importSensorWorkoutLogs({ provider = 'all' } = {}) {
  const clean = String(provider || 'all').toLowerCase();
  const results = {};

  if (clean === 'all' || clean === 'whoop') {
    results.whoop = await syncWhoop({ importWorkouts: true }).catch((error) => ({ error: error.message }));
  }
  if (clean === 'all' || clean === 'strava') {
    results.strava = await syncStrava({ importActivities: true }).catch((error) => ({ error: error.message }));
  }

  const logs = await listSensorWorkoutLogs().catch((error) => ({ stored: 'error', data: [], error }));
  return { results, logs };
}

async function publishSensorWorkoutLog({ log, privacy = 'community' } = {}) {
  if (!log?.id) throw new Error('Choose a sensor log to publish.');
  return createCommunityPost({
    title: log.status || log.workout || 'Sensor-authored workout',
    status: 'Sensor-authored log',
    note: log.note || 'Published from verified workout data.',
    privacy,
    activityType: log.workout || 'workout',
    metrics: {
      ...(log.rawMetrics || {}),
      tags: Array.from(new Set([...(log.tags || []), 'SENSOR', String(privacy).toUpperCase()])),
      sensorAuthored: true,
      reviewedByUser: true,
    },
    route: log.rawRoute || log.route || {},
    sourceProvider: log.source_provider || 'sensor',
    sourceActivityId: `${log.source_activity_id || log.id}:published:${Date.now()}`,
  });
}

// Parse a possibly free-text load/reps/rpe value ("230", "230 lb", "8", a "3-5"
// rep range) to its leading number — matching the readers' parseFloat() behavior —
// or null when there's no number to read ("bodyweight", ""): honest, never a 0.
function _setLogNum(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v == null) return null;
  const n = parseFloat(String(v));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
// Resolve the load unit: an explicit unit field wins, else sniff the load string
// ("100 kg" → kg), else 'lb' — the column is NOT NULL default 'lb', so we never
// write null.
function _setLogUnit(entry) {
  const explicit = entry.unit || entry.loadUnit || entry.load_unit;
  if (explicit) return String(explicit).toLowerCase().includes('kg') ? 'kg' : 'lb';
  const ls = `${entry.actualLoad ?? entry.targetLoad ?? ''}`.toLowerCase();
  return ls.includes('kg') ? 'kg' : 'lb';
}

function normalizeWorkoutSetLog(entry = {}, fallbackIndex = 0) {
  const startedAt = entry.startedAt || entry.started_at || null;
  const finishedAt = entry.finishedAt || entry.finished_at || entry.capturedAt || null;
  // Populate the actual_load/actual_reps/rpe/load_unit COLUMNS at write time — not
  // just the payload jsonb — so the train-volume + strength/progress readers that
  // read the columns directly (some without a payload fallback) see real numbers.
  const actualLoad = _setLogNum(entry.actualLoad ?? entry.actual_load ?? entry.load);
  const actualReps = _setLogNum(entry.actualReps ?? entry.actual_reps ?? entry.reps);
  const rpe = _setLogNum(entry.rpe);
  return {
    move_index: Number.isFinite(Number(entry.moveIndex)) ? Number(entry.moveIndex) : fallbackIndex,
    move_name: String(entry.moveName || entry.exercise || entry.move || 'Exercise').trim(),
    set_number: Math.max(1, Number(entry.setNumber || entry.set || 1)),
    target_reps: entry.targetReps ? String(entry.targetReps) : null,
    target_load: entry.targetLoad ? String(entry.targetLoad) : null,
    actual_reps: actualReps != null ? Math.round(actualReps) : null,
    actual_load: actualLoad != null ? Math.round(actualLoad * 100) / 100 : null,
    rpe: rpe != null ? Math.max(0, Math.min(10, Math.round(rpe * 10) / 10)) : null,
    load_unit: _setLogUnit(entry),
    started_at: startedAt,
    finished_at: finishedAt,
    set_duration_seconds: Math.max(0, Number(entry.setDurationSeconds || entry.durationSeconds || 0)),
    rest_before_seconds: Number.isFinite(Number(entry.restBeforeSeconds)) ? Math.max(0, Number(entry.restBeforeSeconds)) : null,
    completed: entry.completed !== false,
    payload: entry,
  };
}

function normalizeWorkoutSensorSample(sample = {}) {
  return {
    provider: String(sample.provider || 'shape_app').toLowerCase(),
    sample_type: String(sample.sampleType || sample.sample_type || 'summary').toLowerCase(),
    sampled_at: sample.sampledAt || sample.sampled_at || new Date().toISOString(),
    value: Number.isFinite(Number(sample.value)) ? Number(sample.value) : null,
    unit: sample.unit || null,
    payload: sample.payload || sample,
  };
}

async function saveStructuredWorkoutSession({
  title = 'Workout session',
  workout = 'workout',
  durationSeconds = 0,
  setLogs = [],
  sensorSamples = [],
  privacy = 'private',
  clientWorkoutId = null,
  providerId = null,
  providerRole = null,
  summary = {},
} = {}) {
  if (!state.user?.id) throw new Error('Sign in before saving a workout session.');

  const normalizedSetLogs = setLogs.map(normalizeWorkoutSetLog);
  const completedSets = normalizedSetLogs.filter((entry) => entry.completed).length;
  const sessionStartedAt = normalizedSetLogs.find((entry) => entry.started_at)?.started_at || new Date(Date.now() - Number(durationSeconds || 0) * 1000).toISOString();
  const sessionEndedAt = [...normalizedSetLogs].reverse().find((entry) => entry.finished_at)?.finished_at || new Date().toISOString();
  const normalizedProviderRole = providerRole ? normalizeRole(providerRole) : null;
  const normalizedProviderId = Number.isFinite(Number(providerId)) ? Number(providerId) : null;
  const sessionPayload = {
    client_id: state.user.id,
    client_workout_id: clientWorkoutId || null,
    provider_id: normalizedProviderId,
    provider_role: normalizedProviderRole && ['trainer', 'nutritionist'].includes(normalizedProviderRole) ? normalizedProviderRole : null,
    title,
    activity_type: workout,
    status: 'completed',
    privacy: privacy === 'public' ? 'public' : privacy === 'community' ? 'community' : privacy === 'coach' ? 'coach' : 'private',
    source: 'shape_app',
    started_at: sessionStartedAt,
    ended_at: sessionEndedAt,
    duration_seconds: Math.max(0, Number(durationSeconds || 0)),
    summary: {
      ...summary,
      completedSets,
      captureMethod: 'in_app_session_timer',
      sensorAuthored: true,
    },
  };

  if (!supabase) {
    const local = saveLocalRecord('shape.workoutSessions', {
      ...sessionPayload,
      setLogs: normalizedSetLogs,
      sensorSamples,
    });
    return { stored: 'local', data: local };
  }

  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .insert(sessionPayload)
    .select()
    .single();
  if (sessionError) throw sessionError;

  const setRows = normalizedSetLogs.map((entry) => ({
    ...entry,
    session_id: session.id,
    client_id: state.user.id,
  }));
  if (setRows.length) {
    const { error } = await supabase.from('workout_set_logs').insert(setRows);
    if (error) throw error;
  }

  const sampleRows = [
    {
      provider: 'shape_app',
      sample_type: 'summary',
      sampled_at: session.ended_at || new Date().toISOString(),
      value: completedSets,
      unit: 'sets',
      payload: sessionPayload.summary,
    },
    ...sensorSamples.map(normalizeWorkoutSensorSample),
  ].map((sample) => ({
    ...sample,
    session_id: session.id,
    client_id: state.user.id,
  }));
  if (sampleRows.length) {
    const { error } = await supabase.from('workout_sensor_samples').insert(sampleRows);
    if (error) throw error;
  }

  // Roll the session into today's health snapshot so the Progress volume
  // series counts in-app workouts (integrations write the same column for
  // device-synced workouts). Accumulates — best-effort, never blocks the save.
  try {
    const day = _localDate(sessionEndedAt ? new Date(sessionEndedAt) : new Date());
    const mins = Math.max(1, Math.round(Number(durationSeconds || 0) / 60));
    const { data: snap } = await supabase
      .from('daily_health_snapshot')
      .select('workout_minutes')
      .eq('user_id', state.user.id)
      .eq('snapshot_date', day)
      .maybeSingle();
    if (snap) {
      await supabase.from('daily_health_snapshot')
        .update({ workout_minutes: Number(snap.workout_minutes || 0) + mins })
        .eq('user_id', state.user.id).eq('snapshot_date', day);
    } else {
      await supabase.from('daily_health_snapshot')
        .insert({ user_id: state.user.id, snapshot_date: day, workout_minutes: mins });
    }
  } catch (e) { /* snapshot rollup is best-effort */ }

  return {
    stored: 'supabase',
    data: {
      ...session,
      set_logs: setRows,
      sensor_samples: sampleRows,
    },
  };
}

async function listWorkoutSessions() {
  if (!state.user?.id) throw new Error('Sign in before loading workout sessions.');
  if (!supabase) return { stored: 'local', data: readLocalRecords('shape.workoutSessions').map((item) => item.payload || item) };

  const { data, error } = await supabase
    .from('workout_sessions')
    .select('*, workout_set_logs(*), workout_sensor_samples(*), coach_workout_review_notes(*)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw error;
  return { stored: 'supabase', data: data || [] };
}

async function addCoachWorkoutReviewNote({
  sessionId,
  body,
  providerId,
  providerRole = 'trainer',
  visibility = 'client',
} = {}) {
  if (!state.user?.id) throw new Error('Sign in before adding coach review notes.');
  const clean = String(body || '').trim();
  if (!sessionId || !clean) throw new Error('Session and note are required.');
  const normalizedRole = normalizeRole(providerRole);
  const resolvedProviderId = Number.isFinite(Number(providerId))
    ? Number(providerId)
    : await getOwnedProviderId(normalizedRole);
  const payload = {
    session_id: sessionId,
    reviewer_id: state.user.id,
    provider_id: resolvedProviderId,
    provider_role: ['trainer', 'nutritionist'].includes(normalizedRole) ? normalizedRole : null,
    body: clean,
    visibility: ['client', 'coach_private', 'team'].includes(visibility) ? visibility : 'client',
  };

  if (!supabase) return { stored: 'local', data: saveLocalRecord('shape.coachWorkoutReviewNotes', payload) };
  if (!resolvedProviderId) {
    return { stored: 'local', data: saveLocalRecord('shape.coachWorkoutReviewNotes', payload) };
  }

  const { data, error } = await supabase
    .from('coach_workout_review_notes')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return { stored: 'supabase', data };
}

async function saveWorkoutSessionLog({
  title = 'Workout session',
  workout = 'workout',
  durationSeconds = 0,
  setLogs = [],
  sensorSamples = [],
  hr = null, // { avg, max, samples } from a worn Bluetooth monitor during the session
  privacy = null, // null = auto-share: the member's own share rule decides
  clientWorkoutId = null,
  providerId = null,
  providerRole = null,
} = {}) {
  const completedSets = setLogs.filter((entry) => entry.completed).length;
  const avgSetSeconds = completedSets
    ? Math.round(setLogs.filter((entry) => entry.completed).reduce((sum, entry) => sum + Number(entry.setDurationSeconds || 0), 0) / completedSets)
    : 0;
  const restEntries = setLogs.filter((entry) => Number.isFinite(Number(entry.restBeforeSeconds)));
  const avgRestSeconds = restEntries.length
    ? Math.round(restEntries.reduce((sum, entry) => sum + Number(entry.restBeforeSeconds || 0), 0) / restEntries.length)
    : 0;
  const summary = {
    completedSets,
    avgSetSeconds,
    avgRestSeconds,
    durationSeconds,
  };
  const structured = await saveStructuredWorkoutSession({
    title,
    workout,
    durationSeconds,
    setLogs,
    sensorSamples,
    privacy,
    clientWorkoutId,
    providerId,
    providerRole,
    summary,
  }).catch((error) => ({ stored: 'error', error }));

  // Full stat set for the card (first 3) + detail page (all) — sets, duration,
  // and the worn-monitor heart rate when one was connected during the session.
  const minutes = Math.round(durationSeconds / 60);
  const workoutStats = [
    { label: 'Sets', value: `${completedSets}` },
    { label: 'Duration', value: `${minutes} min` },
  ];
  if (hr && Number.isFinite(Number(hr.avg))) workoutStats.push({ label: 'Avg HR', value: `${Math.round(hr.avg)} bpm` });
  if (hr && Number.isFinite(Number(hr.max))) workoutStats.push({ label: 'Max HR', value: `${Math.round(hr.max)} bpm` });
  if (avgRestSeconds) workoutStats.push({ label: 'Avg rest', value: `${avgRestSeconds}s` });

  // Auto-share: no explicit privacy from the caller → the member's own share
  // rule decides (Share toggle × profile visibility). Settings read is
  // best-effort; any failure falls back to 'private' (fail-closed).
  const sessionStart = structured?.data?.started_at
    || new Date(Date.now() - Number(durationSeconds || 0) * 1000).toISOString();
  let resolvedPrivacy = privacy;
  if (!resolvedPrivacy) {
    if (supabase && state.user?.id) {
      try {
        // Supabase surfaces failures on `error` without throwing — fail CLOSED
        // on it, like the server resolver (a no-row read with NO error is just
        // "no doc yet" → the On·Public defaults apply).
        const { data: sdoc, error: sErr } = await supabase.from('user_goals').select('data')
          .eq('user_id', state.user.id).eq('kind', 'client_settings').maybeSingle();
        resolvedPrivacy = sErr ? 'private' : bsWorkoutSharePrivacy((sdoc && sdoc.data) || null);
      } catch (e) { resolvedPrivacy = 'private'; }
    } else {
      resolvedPrivacy = 'private';
    }
  }
  // Cross-source guard: a device (watch) post for this same workout within
  // ±20 min of the session start → skip the social post (the session itself
  // persisted above; first-writer-wins, silent). Best-effort — never blocks.
  let crossDup = false;
  if (supabase && state.user?.id) {
    try {
      const w = 20 * 60 * 1000; const s = Date.parse(sessionStart);
      const { data: near } = await supabase.from('community_posts')
        .select('source_provider, created_at')
        .eq('author_id', state.user.id)
        .not('source_provider', 'is', null)
        .neq('source_provider', 'shape_session')
        .gte('created_at', new Date(s - w).toISOString())
        .lte('created_at', new Date(s + w).toISOString())
        .limit(5);
      crossDup = bsIsDuplicateWorkoutPost(near || [], sessionStart, 'shape_session');
    } catch (e) { crossDup = false; }
  }

  const feedPost = crossDup ? null : await createCommunityPost({
    title,
    status: 'Sensor-authored workout log',
    note: `${completedSets} sets captured automatically. Avg set ${avgSetSeconds}s. Avg rest ${avgRestSeconds}s.`,
    privacy: resolvedPrivacy,
    activityType: workout,
    metrics: {
      provider: 'shape_session',
      sensorAuthored: true,
      captureMethod: 'in_app_session_timer',
      durationSeconds,
      completedSets,
      avgSetSeconds,
      avgRestSeconds,
      averageHeartRate: hr && Number.isFinite(Number(hr.avg)) ? Math.round(hr.avg) : null,
      maxHeartRate: hr && Number.isFinite(Number(hr.max)) ? Math.round(hr.max) : null,
      workoutStats,
      setLogs: setLogs.map((entry) => ({
        key: entry.key,
        moveIndex: entry.moveIndex,
        moveName: entry.moveName,
        setNumber: entry.setNumber,
        targetReps: entry.targetReps,
        targetLoad: entry.targetLoad,
        // The ACTUAL lifted load/reps/RPE captured in the live session — these
        // drive the detail page's per-set breakdown.
        actualReps: entry.actualReps != null ? entry.actualReps : null,
        actualLoad: entry.actualLoad != null ? entry.actualLoad : null,
        rpe: entry.rpe != null ? entry.rpe : null,
        unit: entry.unit || null,
        startedAt: entry.startedAt,
        finishedAt: entry.finishedAt || entry.capturedAt,
        capturedAt: entry.capturedAt,
        setDurationSeconds: entry.setDurationSeconds,
        restBeforeSeconds: entry.restBeforeSeconds,
        completed: !!entry.completed,
      })),
      workoutSessionId: structured?.data?.id || null,
      statA: `${completedSets} sets`,
      statB: avgRestSeconds ? `${avgRestSeconds}s rest` : 'Rest tracked',
      statC: `${Math.round(durationSeconds / 60)} min`,
      labels: ['Sets', 'Avg rest', 'Elapsed'],
      tags: ['SENSOR', 'SESSION', ...(resolvedPrivacy === 'private' ? ['PRIVATE'] : [])],
    },
    sourceProvider: 'shape_session',
    // Idempotent by the persisted session id (a retry of the same save can't
    // double-post); Date.now() only for the local/offline fallback.
    sourceActivityId: `shape-session-${structured?.data?.id || Date.now()}`,
    createdAt: sessionStart,
    autoShare: true,
  });

  invalidateClientMetrics();
  // Announce any new PRs to the community PR Wall. The server RPC enforces that
  // the profile is PUBLIC and that it's a genuine new best, so non-public members
  // and non-PRs post nothing. Best-effort, fire-and-forget — never blocks save.
  if (structured && structured.stored === 'supabase') {
    announcePRsFromSetLogs(setLogs);
    // +10 Shape Score once for the day's workout — gated server-side on the
    // workout_minutes snapshot we just wrote (un-farmable: one per day), idempotent.
    // No-op until the accountability migration is applied.
    try { if (state.user?.id) supabase.rpc('award_workout_session', { p_day: _localDate() }).then(() => {}, () => {}); } catch (e) {}
  }
  // First-run heads-up (mobile twin of the server notice). The stamp lives in
  // its OWN user_goals row ('auto_share_flag', shared with the server) — never
  // merged into client_settings, so it can't clobber a concurrent Settings
  // change. Whichever path shares first wins; the member sees one toast ever.
  if (feedPost && resolvedPrivacy !== 'private' && supabase && state.user?.id) {
    try {
      const { data: fdoc, error: fErr } = await supabase.from('user_goals').select('data')
        .eq('user_id', state.user.id).eq('kind', 'auto_share_flag').maybeSingle();
      if (fErr) throw fErr;
      if (!(fdoc && fdoc.data && fdoc.data.at)) {
        await supabase.from('user_goals').upsert(
          { user_id: state.user.id, kind: 'auto_share_flag', data: { at: new Date().toISOString() } },
          { onConflict: 'user_id,kind' });
        window.__bsToast?.('Workouts now share to your profile + feed · Settings → Share workout data', 'ok');
      }
    } catch (e) {}
  }
  return {
    ...(feedPost || {}),
    workoutSession: structured,
  };
}

// PR Wall — announce a new personal record to the community PR Wall channel.
// post_my_pr_to_wall re-checks the caller is a PUBLIC profile and that the value
// beats their last posted best for that lift (dedupe ledger), so this is safe to
// over-call. Applies to every role.
async function postPRToWall({ lift, value, unit = 'lb', reps = null } = {}) {
  if (!supabase || !state.user?.id) return { ok: false };
  const name = String(lift || '').trim();
  const v = Number(value);
  if (!name || !Number.isFinite(v) || v <= 0) return { ok: false };
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/community/pr-wall`, {
      method: 'POST',
      headers: { ...sessionsAuthHeaders(), 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ lift: name, value: v, unit, reps: reps != null ? Number(reps) : null }),
    });
    return res.ok ? await res.json().catch(() => ({ ok: false })) : { ok: false };
  } catch (e) { return { ok: false }; }
}

// From a finished session's set logs: the heaviest completed set per move →
// one PR-wall post each (the RPC dedupes + gates public). Capped so a big
// session can't flood the wall at once.
async function announcePRsFromSetLogs(setLogs = []) {
  try {
    const best = new Map(); // moveName → { load, reps }
    for (const e of (setLogs || [])) {
      if (!e || e.completed === false) continue;
      const lift = String(e.moveName || e.move || e.exercise || '').trim();
      const load = parseFloat(String(e.actualLoad ?? e.load ?? e.actual_load ?? '').replace(/[^0-9.]/g, ''));
      if (!lift || !Number.isFinite(load) || load <= 0) continue;
      const reps = parseInt(String(e.actualReps ?? e.reps ?? e.actual_reps ?? ''), 10);
      const prev = best.get(lift);
      if (!prev || load > prev.load) best.set(lift, { load, reps: Number.isFinite(reps) ? reps : null });
    }
    for (const [lift, { load, reps }] of [...best.entries()].slice(0, 6)) {
      await postPRToWall({ lift, value: load, unit: 'lb', reps });
    }
  } catch (e) { /* best-effort */ }
}

window.ShapePRWall = { post: postPRToWall, announce: announcePRsFromSetLogs };

function privacyToDb(value) {
  const clean = String(value || '').toLowerCase();
  if (clean === 'public' || clean === 'private' || clean === 'profile' || clean === 'followers') return clean;
  return 'community';
}

// Accepted follows of the signed-in user — the FOLLOWING feed's author scope.
// Cached 60s per uid; capped 500 (the .in() filter's practical bound). RLS on
// community_posts remains the authority — this only narrows the query.
let _followingIdsCache = { uid: null, ids: null, at: 0 };
async function listAcceptedFollowingIds() {
  const uid = state.user?.id;
  if (!supabase || !uid) return [];
  const now = Date.now();
  if (_followingIdsCache.uid === uid && _followingIdsCache.ids && now - _followingIdsCache.at < 60000) {
    return _followingIdsCache.ids;
  }
  const { data, error } = await supabase
    .from('user_follows')
    .select('following_id')
    .eq('follower_id', uid)
    .eq('status', 'accepted')
    .limit(500);
  if (error) return _followingIdsCache.uid === uid ? (_followingIdsCache.ids || []) : [];
  const ids = (data || []).map((r) => r.following_id);
  _followingIdsCache = { uid, ids, at: now };
  return ids;
}

async function listCommunityPosts(mode = 'universal') {
  if (!supabase) return { stored: 'local', data: [] };

  const spec = bsFeedQuerySpec(
    mode,
    state.user?.id || null,
    mode === 'following' ? await listAcceptedFollowingIds() : []
  );
  let query = supabase
    .from('community_posts')
    .select(COMMUNITY_POST_SELECT)
    // Universal: 'profile'/'private'/'followers' never appear. Following:
    // 'followers' allowed, scoped to accepted follows + self (RLS re-checks).
    .in('privacy', spec.privacyIn);
  if (spec.authorIn) query = query.in('author_id', spec.authorIn);
  const { data, error } = await query.order('created_at', { ascending: false }).limit(50);

  if (error) {
    return { stored: 'local', data: [], error };
  }

  return { stored: 'supabase', data: (data || []).map(communityPostFromRow) };
}

// Resolve the post author's OWN coach + program (their assigned plan + program
// phase) so a workout post can credit "Programmed by {coach} · {program}" on the
// feed card. Honest: returns empty when no real coach is assigned (self-coached →
// the card suppresses the row), and never fabricates (the plan route doesn't).
async function resolveAuthorCoachProgram() {
  try {
    const plan = await getPlan(); // cached /api/client/plan; null when signed out
    const coach = (plan && plan.training && typeof plan.training.coach === 'string') ? plan.training.coach.trim() : '';
    if (!coach) return { coach: '', program: '' };
    let program = '';
    try {
      const ph = (typeof window !== 'undefined' && window.ShapeProgram) ? (window.ShapeProgram.trainingPhase || window.ShapeProgram.phase) : '';
      if (ph) program = String(ph).trim();
    } catch (e) {}
    return { coach, program };
  } catch (e) { return { coach: '', program: '' }; }
}

async function createCommunityPost({
  title,
  status = '',
  note = '',
  privacy = 'community',
  activityType = 'workout',
  metrics = {},
  route = {},
  sourceProvider = '',
  sourceActivityId = '',
  channel = '',
  photoUrl = '',
  mentions = [],
  createdAt = '',      // ISO — auto-share posts stamp the activity START
  autoShare = false,   // true = automatic workout post (skips the +5 award)
  skipAward = false,   // deliberate share that still must not earn (meal
                       // shares, spec 2026-07-12) — NOT autoShare: auto-post
                       // semantics (dedup windows, tightening) never apply
} = {}) {
  if (!state.user?.id) throw new Error('Sign in before posting to the community feed.');
  const cleanPhoto = String(photoUrl || '').trim();
  const cleanTitle = String(title || '').trim() || (cleanPhoto ? 'Photo' : '');
  if (!cleanTitle) throw new Error('Post title is required.');

  const profile = state.profile || {};
  const authorName = profile.full_name || state.user.email?.split('@')[0] || 'Shape member';
  // Stash the feed channel (SHAPE / CLIENT / TRAINER / NUTRI / COMMUNITY) in the
  // jsonb metrics so a post made on the Shape or Community tab stays on that tab
  // — author_role alone would collapse every post into the user's own role feed.
  const cleanChannel = String(channel || '').trim().toUpperCase();
  const mergedMetrics = { ...(metrics || {}) };
  if (cleanChannel) mergedMetrics.channel = cleanChannel;
  if (Array.isArray(mentions) && mentions.length) {
    mergedMetrics.mentions = mentions.map((x) => ({ userId: x.userId || x.id || null, name: x.name || x.full_name || '' })).filter((x) => x.name).slice(0, 12);
  }
  // Workout/run posts credit the author's coach + program (only when a real coach
  // is assigned — self-coached posts stamp nothing and the card hides the row).
  // Never overrides a coach the caller passed explicitly.
  const _isWorkoutPost = (mergedMetrics.kind === 'workout') || (Array.isArray(mergedMetrics.workoutStats) && mergedMetrics.workoutStats.length > 0) || /run|ride|bike|cycl|cardio|workout|lift|strength/i.test(String(activityType || ''));
  if (_isWorkoutPost && !mergedMetrics.coach) {
    const cp = await resolveAuthorCoachProgram();
    if (cp.coach) { mergedMetrics.coach = cp.coach; if (cp.program) mergedMetrics.program = cp.program; }
  }
  // Strength PR delta — when the post carries a structured lift + load, diff the
  // load against the author's prior best for that lift (the pr_wall_posts ledger,
  // owner-readable) and stamp "+X" ONLY when it's a genuine new best. Honest: the
  // very first time a lift is logged there's no prior best → no delta, just the
  // number. Then announce the PR (advances the ledger + posts to #PR Wall — the
  // RPC re-gates on public). Best-effort, never blocks the post.
  const _lift = (mergedMetrics.lift && String(mergedMetrics.lift).trim()) || '';
  const _loadNum = mergedMetrics.load ? parseFloat(String(mergedMetrics.load).replace(/[^0-9.]/g, '')) : NaN;
  const _unit = (mergedMetrics.load && /kg/i.test(String(mergedMetrics.load))) ? 'kg' : 'lb';
  if (supabase && state.user?.id && _lift && Number.isFinite(_loadNum) && _loadNum > 0) {
    try {
      const { data: prev } = await supabase
        .from('pr_wall_posts').select('best_value, posted_at')
        .eq('user_id', state.user.id).eq('lift_key', _lift.toLowerCase()).maybeSingle();
      const prevBest = (prev && Number.isFinite(Number(prev.best_value))) ? Number(prev.best_value) : null;
      if (prevBest != null && _loadNum > prevBest) {
        const gain = Math.round((_loadNum - prevBest) * 10) / 10;
        let when = '';
        try { const d = prev.posted_at ? new Date(prev.posted_at) : null; if (d && !isNaN(d)) when = ` on ${d.toLocaleDateString([], { month: 'short' })} best`; } catch (e) {}
        mergedMetrics.delta = `+${gain} ${_unit}${when}`;
      }
    } catch (e) { /* delta is best-effort */ }
    try { if (window.ShapePRWall && window.ShapePRWall.post) window.ShapePRWall.post({ lift: _lift, value: _loadNum, unit: _unit }); } catch (e) {}
  }
  const payload = {
    author_id: state.user.id,
    author_name: authorName,
    author_role: normalizeRole(profile.role || 'client'),
    privacy: privacyToDb(privacy),
    activity_type: activityType,
    title: cleanTitle,
    status: String(status || '').trim() || null,
    note: String(note || '').trim() || null,
    metrics: mergedMetrics,
    route: route || {},
    photo_url: cleanPhoto || null,
    source_provider: sourceProvider || null,
    source_activity_id: sourceActivityId || null,
    // Auto-posted workouts stamp created_at at the activity START so the
    // ±20-min cross-source dedup window compares like with like (device posts
    // already do this). Manual posts keep the DB default (now).
    ...(createdAt ? { created_at: createdAt } : {}),
  };

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.communityPosts', payload) };
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert(payload)
    .select(COMMUNITY_POST_SELECT)
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.communityPosts', payload, error), error };
  }

  // Shape Score: +5 for a feed-visible community post. The RPC hard-codes the
  // amount and re-verifies the post is caller-owned + feed-visible (idempotent on
  // the post id), so it can't be abused. Best-effort; no-ops until the migration runs.
  // AUTO-SHARED workout posts never earn it — the workout already earned its +10
  // (spec: no double-dipping via automatic posts). skipAward covers deliberate
  // shares that must not earn either (meal shares — the RPC guard migration
  // backs this up server-side for the web route).
  if (data?.id && !autoShare && !skipAward) {
    try { await supabase.rpc('award_community_post', { p_post_id: data.id }); invalidateClientMetrics(); } catch (e) {}
  }

  return { stored: 'supabase', data: communityPostFromRow(data) };
}

async function updateCommunityPost({ postId, title, note, photoUrl, video, metrics, privacy } = {}) {
  if (!state.user?.id) throw new Error('Sign in before editing.');
  if (!postId) throw new Error('Post id is required.');
  if (!supabase) throw new Error('Not connected.');
  // Fetch the current metrics so we merge (never clobber) the parts the editor
  // didn't touch (workoutStats, coach, program, delta, mentions…). Scope to the
  // owner and HARD-FAIL on a read error — otherwise we'd merge against {} and wipe
  // the existing metrics.
  const { data: cur, error: curErr } = await supabase
    .from('community_posts').select('metrics').eq('id', postId).eq('author_id', state.user.id).maybeSingle();
  if (curErr) throw curErr;
  const patchMetrics = { ...(metrics || {}) };
  if (video !== undefined) patchMetrics.video_url = String(video || '').trim();
  patchMetrics.editedAt = new Date().toISOString();
  const merged = mergePostPatch(cur?.metrics || {}, patchMetrics);
  const patch = { metrics: merged };
  if (title !== undefined) patch.title = String(title || '').trim() || 'Post';
  if (note !== undefined) patch.note = String(note || '').trim() || null;
  if (photoUrl !== undefined) patch.photo_url = String(photoUrl || '').trim() || null;
  if (privacy !== undefined) patch.privacy = privacyToDb(privacy);
  const { data, error } = await supabase
    .from('community_posts')
    .update(patch)
    .eq('id', postId)
    .eq('author_id', state.user.id) // RLS also enforces this; belt-and-braces
    .select(COMMUNITY_POST_SELECT)
    .single();
  if (error) throw error;
  return { stored: 'supabase', data: communityPostFromRow(data) };
}

// Parse the object path out of a Supabase public storage URL for a bucket
// (…/storage/v1/object/public/<bucket>/<path>). Returns null for non-matching
// URLs (e.g. a pasted YouTube link) so we never try to delete media we don't own.
function bsStoragePathFromUrl(url, bucket) {
  if (!url || typeof url !== 'string') return null;
  const marker = '/storage/v1/object/public/' + bucket + '/';
  const i = url.indexOf(marker);
  if (i === -1) return null;
  try { return decodeURIComponent(url.slice(i + marker.length).split('?')[0]); }
  catch (e) { return url.slice(i + marker.length).split('?')[0]; }
}

async function deleteCommunityPost({ postId } = {}) {
  if (!state.user?.id) throw new Error('Sign in before deleting.');
  if (!postId) throw new Error('Post id is required.');
  if (!supabase) throw new Error('Not connected.');
  // Best-effort: remove the post's own uploaded media from public storage so a
  // deleted photo/video isn't still reachable by URL (owner-scoped). Never blocks the delete.
  try {
    const { data: row } = await supabase
      .from('community_posts').select('photo_url, metrics')
      .eq('id', postId).eq('author_id', state.user.id).maybeSingle();
    if (row) {
      const jobs = [];
      const ph = bsStoragePathFromUrl(row.photo_url, 'community-photos');
      if (ph) jobs.push(supabase.storage.from('community-photos').remove([ph]));
      const vurl = row.metrics && (row.metrics.video_url || row.metrics.video);
      const vp = bsStoragePathFromUrl(vurl, 'coach-media');
      if (vp) jobs.push(supabase.storage.from('coach-media').remove([vp]));
      if (jobs.length) await Promise.allSettled(jobs);
    }
  } catch (e) { /* media cleanup is best-effort */ }
  const { error } = await supabase
    .from('community_posts')
    .delete()
    .eq('id', postId)
    .eq('author_id', state.user.id);
  if (error) throw error;
  return { ok: true };
}

async function toggleCommunityLike({ postId, cosign = false } = {}) {
  if (!state.user?.id) throw new Error('Sign in before liking posts.');
  if (!postId) throw new Error('Post id is required.');
  if (!supabase) return { stored: 'local', liked: true };

  const { data: existing, error: existingError } = await supabase
    .from('community_likes')
    .select('post_id')
    .eq('post_id', postId)
    .eq('user_id', state.user.id)
    .maybeSingle();
  if (existingError) throw existingError;

  // Coach co-sign: a SECURITY DEFINER RPC that re-checks the caller is the post
  // author's OWN coach, records the like (so the count stays one unified tally),
  // stamps metrics.cosign so every viewer sees the badge, and notifies the
  // athlete. Best-effort — falls through to a plain like if the migration isn't
  // deployed yet, so the reaction (and the count) always works.
  if (cosign) {
    try {
      const { error: csErr } = await supabase.rpc('post_coach_cosign', { p_post_id: postId, p_on: !existing });
      if (!csErr) return { stored: 'supabase', liked: !existing, cosign: !existing };
    } catch (e) { /* fall through to a plain like */ }
  }

  if (existing) {
    const { error } = await supabase
      .from('community_likes')
      .delete()
      .eq('post_id', postId)
      .eq('user_id', state.user.id);
    if (error) throw error;
    return { stored: 'supabase', liked: false };
  }

  const { error } = await supabase
    .from('community_likes')
    .insert({ post_id: postId, user_id: state.user.id });
  if (error) throw error;
  return { stored: 'supabase', liked: true };
}

async function addCommunityComment({ postId, body } = {}) {
  if (!state.user?.id) throw new Error('Sign in before commenting.');
  const clean = String(body || '').trim();
  if (!postId || !clean) throw new Error('Post and comment are required.');

  const profile = state.profile || {};
  const payload = {
    post_id: postId,
    user_id: state.user.id,
    author_name: profile.full_name || state.user.email?.split('@')[0] || 'Shape member',
    body: clean,
  };

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.communityComments', payload) };
  }

  const { data, error } = await supabase
    .from('community_comments')
    .insert(payload)
    .select()
    .single();
  if (error) throw error;
  return { stored: 'supabase', data };
}

async function syncWhoop({ importWorkouts = false } = {}) {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before syncing WHOOP.');
  }

  const query = importWorkouts ? '?import=1' : '';
  const response = await fetch(`${apiBaseUrl}/api/integrations/whoop/sync${query}`, {
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'WHOOP sync failed.');
  }
  return payload;
}

async function syncStrava({ importActivities = false } = {}) {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before syncing Strava.');
  }

  const query = importActivities ? '?import=1' : '';
  const response = await fetch(`${apiBaseUrl}/api/integrations/strava/sync${query}`, {
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Strava sync failed.');
  }
  return payload;
}

async function syncOura({ importWorkouts = false } = {}) {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before syncing Oura.');
  }

  const query = importWorkouts ? '?import=1' : '';
  const response = await fetch(`${apiBaseUrl}/api/integrations/oura/sync${query}`, {
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Oura sync failed.');
  }
  return payload;
}

// Apple Health (HealthKit) — reads samples on-device and posts daily roll-ups.
// Connecting and syncing are the same flow: prompt for permission, read, upload.
async function syncAppleHealth({ importWorkouts = true } = {}) {
  if (!isHealthKitPlatform()) {
    throw new Error('Apple Health is only available in the iOS app.');
  }
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before syncing Apple Health.');
  }
  await requestHealthKitAuth();
  const { days, workouts } = await collectHealthKitSnapshots();
  const response = await fetch(`${apiBaseUrl}/api/integrations/apple-health/sync`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.session.access_token}`,
    },
    body: JSON.stringify({ days, workouts: importWorkouts ? workouts : [] }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Apple Health sync failed.');
  }
  return payload;
}

async function connectProvider(provider, { returnTo = '/newdesign/GetApp.html' } = {}) {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before connecting integrations.');
  }

  const cleanProvider = String(provider || '').toLowerCase();
  if (!cleanProvider) throw new Error('Provider is required.');

  await bridgeSessionToApi(state.session);
  const url = `${apiBaseUrl}/api/integrations/${cleanProvider}/authorize?return=${encodeURIComponent(returnTo)}`;
  window.location.assign(url);
  return { redirected: true };
}

async function connectWhoop(options = {}) {
  return connectProvider('whoop', options);
}

async function connectStrava(options = {}) {
  return connectProvider('strava', options);
}

async function connectSpotify(options = {}) {
  return connectProvider('spotify', options);
}

// Save (follow) a coach's Spotify playlist into the signed-in client's own
// Spotify library. `playlist` is a Spotify URL, URI, or id.
async function saveSpotifyPlaylist(playlist) {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before saving playlists.');
  }
  const url = typeof playlist === 'string' ? playlist : (playlist?.url || playlist?.playlistId || '');
  const response = await fetch(`${apiBaseUrl}/api/integrations/spotify/save-playlist`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.session.access_token}`,
    },
    body: JSON.stringify({ url }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Could not save playlist to Spotify.');
  }
  return payload;
}

// Inject the MusicKit v3 script once and resolve when window.MusicKit exists.
let _musicKitPromise = null;
function loadMusicKit() {
  if (typeof window !== 'undefined' && window.MusicKit) return Promise.resolve(window.MusicKit);
  if (_musicKitPromise) return _musicKitPromise;
  _musicKitPromise = new Promise((resolve, reject) => {
    if (typeof document === 'undefined') { reject(new Error('MusicKit unavailable.')); return; }
    const done = () => (window.MusicKit ? resolve(window.MusicKit) : reject(new Error('MusicKit failed to load.')));
    const existing = document.querySelector('script[data-musickit]');
    if (existing) { document.addEventListener('musickitloaded', done, { once: true }); return; }
    const s = document.createElement('script');
    s.src = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';
    s.async = true;
    s.setAttribute('data-musickit', '1');
    document.addEventListener('musickitloaded', done, { once: true });
    s.onerror = () => reject(new Error('Could not load Apple MusicKit.'));
    document.head.appendChild(s);
  });
  // On failure, clear the cached promise so a later call can retry instead of
  // re-returning the rejected one (script onerror / no-window / load timeout).
  _musicKitPromise.catch(() => { _musicKitPromise = null; });
  return _musicKitPromise;
}

// Apple Music: mint a developer token, run MusicKit's device-side authorize
// to get a Music-User-Token, then persist it server-side. Not an OAuth
// redirect flow — everything happens in-page.
async function connectAppleMusic() {
  if (!apiBaseUrl) throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  if (!state.session?.access_token) throw new Error('Sign in before connecting Apple Music.');

  const tokenRes = await fetch(`${apiBaseUrl}/api/integrations/apple-music/developer-token`);
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.developerToken) {
    throw new Error(tokenJson.error || 'Apple Music is not configured yet.');
  }

  const MusicKit = await loadMusicKit();
  await MusicKit.configure({
    developerToken: tokenJson.developerToken,
    app: { name: 'Shape', build: '1.0.0' },
  });
  const music = MusicKit.getInstance();
  const musicUserToken = await music.authorize();
  if (!musicUserToken) throw new Error('Apple Music authorization was cancelled.');

  const res = await fetch(`${apiBaseUrl}/api/integrations/apple-music/connect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ musicUserToken, storefront: music.storefrontId || null }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Unable to connect Apple Music.');
  return payload;
}

async function disconnectAppleMusic() {
  if (!apiBaseUrl) throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  if (!state.session?.access_token) throw new Error('Sign in before disconnecting Apple Music.');
  const res = await fetch(`${apiBaseUrl}/api/integrations/apple-music/disconnect`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}` },
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Unable to disconnect Apple Music.');
  return payload;
}

// Save (add) a coach's Apple Music playlist into the signed-in member's own
// library. Apple has NO server save route — the write happens client-side via
// MusicKit using the on-device Music-User-Token. `playlist` is an Apple Music
// catalog URL or a `pl.xxxx` id.
async function saveAppleMusicPlaylist(playlist) {
  if (typeof window === 'undefined') throw new Error('Apple Music is unavailable here.');
  const url = typeof playlist === 'string' ? playlist : (playlist?.url || '');
  const m = String(url).match(/(pl\.[A-Za-z0-9-]+)/);
  const playlistId = m ? m[1] : '';
  if (!playlistId) throw new Error('Not a catalog Apple Music playlist link.');
  const tokenRes = await fetch(`${apiBaseUrl}/api/integrations/apple-music/developer-token`);
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.developerToken) throw new Error('Apple Music is not configured yet.');
  const MusicKit = await loadMusicKit();
  try { await MusicKit.configure({ developerToken: tokenJson.developerToken, app: { name: 'Shape', build: '1.0.0' } }); } catch (_) { /* may already be configured */ }
  const music = MusicKit.getInstance();
  if (!music.isAuthorized) {
    const tok = await music.authorize();
    if (!tok) throw new Error('Connect Apple Music before saving.');
    if (apiBaseUrl && state.session?.access_token) {
      fetch(`${apiBaseUrl}/api/integrations/apple-music/connect`, { method: 'POST', headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ musicUserToken: tok, storefront: music.storefrontId || null }) }).catch(() => {});
    }
  }
  // Add the catalog playlist to the user's library (client-side write).
  await music.api.music('/v1/me/library', { 'ids[playlists]': playlistId }, { fetchOptions: { method: 'POST' } });
  return { ok: true };
}

// List the signed-in user's Apple Music library playlists (client-side via
// MusicKit — Apple has no server playlists route). Returns the same shape the
// Spotify picker uses: [{ id, name, tracks, url, image }].
async function listAppleMusicPlaylists() {
  if (typeof window === 'undefined') { const e = new Error('Apple Music unavailable.'); e.connected = false; throw e; }
  const tokenRes = await fetch(`${apiBaseUrl}/api/integrations/apple-music/developer-token`);
  const tokenJson = await tokenRes.json().catch(() => ({}));
  if (!tokenRes.ok || !tokenJson.developerToken) { const e = new Error('Apple Music is not configured yet.'); e.connected = false; throw e; }
  const MusicKit = await loadMusicKit();
  try { await MusicKit.configure({ developerToken: tokenJson.developerToken, app: { name: 'Shape', build: '1.0.0' } }); } catch (_) {}
  const music = MusicKit.getInstance();
  if (!music.isAuthorized) {
    const tok = await music.authorize();
    if (!tok) { const e = new Error('Connect Apple Music.'); e.connected = false; throw e; }
    if (apiBaseUrl && state.session?.access_token) {
      fetch(`${apiBaseUrl}/api/integrations/apple-music/connect`, { method: 'POST', headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ musicUserToken: tok, storefront: music.storefrontId || null }) }).catch(() => {});
    }
  }
  let rows = [];
  try {
    // include=catalog resolves each library playlist to its shareable catalog
    // equivalent (a `pl.` id members can open + save) when one exists.
    const result = await music.api.music('v1/me/library/playlists', { limit: 100, include: 'catalog' });
    rows = (result && result.data && result.data.data) || [];
  } catch (_) { rows = []; }
  return rows.map((pl) => {
    const at = pl.attributes || {};
    const cat = pl.relationships && pl.relationships.catalog && pl.relationships.catalog.data && pl.relationships.catalog.data[0];
    const catAt = (cat && cat.attributes) || {};
    const artSrc = (catAt.artwork && catAt.artwork.url) || (at.artwork && at.artwork.url) || null;
    const art = artSrc ? artSrc.replace('{w}', '88').replace('{h}', '88') : null;
    // Prefer the catalog playlist (shareable + saveable by other members); fall
    // back to the personal library URL, which only the owner's account can open.
    const url = catAt.url || at.url || (cat && cat.id ? ('https://music.apple.com/playlist/' + cat.id) : ('https://music.apple.com/library/playlist/' + pl.id));
    return { id: (cat && cat.id) || pl.id, name: at.name || catAt.name || 'Playlist', tracks: at.trackCount != null ? at.trackCount : (catAt.trackCount || 0), url, image: art };
  });
}

// Instacart: hand the user's grocery list to Instacart and return a URL that
// opens a pre-filled shopping-list page. `items` is optional — when omitted
// the server builds the list from coach-pushed meals.
// Turn a grocery line (string or {name, quantity, unit, display_text}) into text.
function _groceryLine(it) {
  if (typeof it === 'string') return it.trim();
  if (!it) return '';
  if (it.display_text) return String(it.display_text).trim();
  const name = String(it.name || '').trim();
  if (!name) return '';
  const qty = (typeof it.quantity === 'number' && it.quantity !== 1) ? `${it.quantity} ` : '';
  const unit = it.unit && it.unit !== 'each' ? `${it.unit} ` : '';
  return `${qty}${unit}${name}`.trim();
}

// Copy text to the clipboard, with a textarea fallback for WebViews where the
// async clipboard API isn't available.
async function _copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.focus(); ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

async function sendGroceryToInstacart({ items, title } = {}) {
  if (!apiBaseUrl) throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  if (!state.session?.access_token) throw new Error('Sign in before sending your grocery list.');
  const res = await fetch(`${apiBaseUrl}/api/integrations/instacart/shopping-list`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, title }),
  });
  const payload = await res.json().catch(() => ({}));
  // Happy path: Instacart configured → open the pre-filled cart.
  if (res.ok && payload.url) {
    try { window.open(payload.url, '_blank', 'noopener'); } catch (e) {}
    window.__bsToast?.('Opening Instacart…', 'ok');
    return { mode: 'opened', ...payload };
  }
  // Fallback: Instacart access is gated → copy the list so it's not a dead-end.
  const notConfigured = payload && (payload.configured === false || /not configured/i.test(payload.error || ''));
  if (notConfigured) {
    const lines = (payload.items || items || []).map(_groceryLine).filter(Boolean);
    if (!lines.length) { window.__bsToast?.('Your grocery list is empty.', 'error'); return { mode: 'empty' }; }
    const text = [(payload.title || title || 'Grocery list'), '', ...lines].join('\n');
    const ok = await _copyText(text);
    window.__bsToast?.(ok ? 'Instacart unavailable — list copied to clipboard' : 'Instacart unavailable right now', ok ? 'ok' : 'error');
    return { mode: 'copied', copied: ok, text };
  }
  throw new Error(payload.error || 'Unable to send list to Instacart.');
}

// Ask the in-app support assistant. Works signed-out (server returns a
// rule-based reply); signed-in users get the AI assistant. `extra` (optional):
// { cookContext } rides Cook Mode's sous-chef grounding on the same rail, and
// { signal } lets the caller bound a stalled request with an AbortController —
// Cook Mode must never leave its mic stuck on a hung fetch (CodeRabbit #1805).
async function askSupportBot(messages, tone, extra = {}) {
  if (!apiBaseUrl) throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  const headers = { 'Content-Type': 'application/json' };
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  const body = { messages: Array.isArray(messages) ? messages : [], tone: tone || (window.ShapeVoice && window.ShapeVoice.tone()) || 'supportive' };
  if (extra.cookContext) body.cookContext = extra.cookContext;
  const res = await fetch(`${apiBaseUrl}/api/support/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    signal: extra.signal,
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Support is unavailable right now.');
  return payload;
}

// Server STT (Whisper) for hold-to-talk callers (Cook Mode's mic). Routes
// through apiBaseUrl + the Bearer session — a root-relative fetch never reaches
// the backend on the NATIVE build, whose WebView has no same origin and no
// cookie (Codex, PR #1805). On the /m/ web build apiBaseUrl is the page origin,
// so the cookie session still rides via same-origin credentials.
async function transcribeVoice(blob, { filename = 'nora.webm', signal } = {}) {
  const fd = new FormData();
  fd.append('audio', blob, filename);
  const headers = {};
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  const res = await fetch(`${apiBaseUrl || ''}/api/ai/transcribe`, { method: 'POST', headers, body: fd, credentials: 'same-origin', signal });
  const payload = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, transcript: payload && payload.transcript ? String(payload.transcript).trim() : '' };
}

// List the signed-in user's own Spotify playlists (coach Soundtracks importer).
// Returns { connected, playlists:[{id,name,tracks,url,image,owner}] }. On a
// not-connected/expired token the thrown error carries `.connected = false`.
async function listSpotifyPlaylists() {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before importing playlists.');
  }
  const response = await fetch(`${apiBaseUrl}/api/integrations/spotify/playlists`, {
    headers: { Authorization: `Bearer ${state.session.access_token}` },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const err = new Error(payload.error || 'Could not load your Spotify playlists.');
    err.connected = payload.connected;
    throw err;
  }
  return payload;
}

async function getIntegrationStatus() {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before loading integrations.');
  }

  const response = await fetch(`${apiBaseUrl}/api/integrations/status`, {
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to load integration status.');
  }
  return payload;
}

async function disconnectIntegration(provider) {
  if (!apiBaseUrl) {
    throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  }
  if (!state.session?.access_token) {
    throw new Error('Sign in before disconnecting integrations.');
  }
  const cleanProvider = String(provider || '').toLowerCase();
  if (!cleanProvider) throw new Error('Provider is required.');

  const response = await fetch(`${apiBaseUrl}/api/integrations/${cleanProvider}/disconnect`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${state.session.access_token}`,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || 'Unable to disconnect integration.');
  }
  return payload;
}

// Sign in with Apple via Supabase OAuth. Redirects to Apple and returns to
// the /m/ app, where detectSessionInUrl establishes the session on load.
// Requires the Apple provider to be enabled in the Supabase project.
async function signInWithApple({ role } = {}) {
  if (!supabase) throw new Error('Apple sign-in is not configured.');
  try { if (role) window.localStorage && window.localStorage.setItem('shape.pendingRole', normalizeRole(role)); } catch (e) {}
  const redirectTo = `${window.location.origin}${window.location.pathname}`;
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo },
  });
  if (error) throw error;
  return data;
}

// Re-send the signup confirmation email (for the "check your email" screen).
async function resendConfirmation(email, captchaToken) {
  if (!supabase) throw new Error('Email verification is not configured.');
  const cleanEmail = String(email || '').trim();
  if (!cleanEmail) throw new Error('No email to resend to.');
  const emailRedirectTo = (typeof window !== 'undefined') ? `${window.location.origin}${window.location.pathname}` : undefined;
  const { error } = await supabase.auth.resend({ type: 'signup', email: cleanEmail, options: { emailRedirectTo, ...(captchaToken ? { captchaToken } : {}) } });
  if (error) throw error;
  return true;
}

// Shared key-value store, backed by the same Supabase `user_goals` table the
// website's window.shapeDb (public/supabase.js) uses. This is what makes the
// mobile app and the website "talk to each other": both upsert into
// user_goals keyed by (user_id, kind), so prefs/swaps saved on one surface are
// read by the other (same Supabase project + same signed-in user). Many mobile
// screens already call window.shapeDb.getUserGoals/saveUserGoals; until now it
// was undefined here, so those calls silently no-op'd and nothing persisted.
window.shapeDb = window.shapeDb || {
  async getUser() {
    if (state.user && state.user.id) return state.user;
    if (!supabase) return null;
    try { const { data } = await supabase.auth.getUser(); return data && data.user ? data.user : null; }
    catch (e) { return null; }
  },
  async getUserGoals(kind) {
    if (!supabase) return null;
    const u = await window.shapeDb.getUser();
    if (!u) return null;
    const res = await supabase.from('user_goals').select('data').eq('user_id', u.id).eq('kind', kind).maybeSingle();
    if (res.error) { console.warn('[shape] getUserGoals error', res.error); return null; }
    return (res.data && res.data.data) || {};
  },
  async saveUserGoals(kind, data) {
    if (!supabase) return { error: { message: 'No backend' } };
    const u = await window.shapeDb.getUser();
    if (!u) return { error: { message: 'Not logged in' } };
    const res = await supabase.from('user_goals').upsert({ user_id: u.id, kind, data: data || {} }, { onConflict: 'user_id,kind' });
    if (res.error) { console.warn('[shape] saveUserGoals error', res.error); return { error: res.error }; }
    return { ok: true };
  },
};

window.ShapeAuth = {
  configured: authConfigured,
  client: supabase,
  signIn,
  signUp,
  signInWithPhone,
  verifyPhoneOtp,
  signInWithApple,
  resendConfirmation,
  signOut,
  getCurrentSession,
  updateProfileRoles,
  updateProfileName,
  checkUsername: checkUsernameAvailable,
  claimUsername,
  getCachedState: () => ({ ...state }),
};

window.ShapePayments = {
  configured: Boolean(apiBaseUrl),
  startCheckout,
};

window.ShapeConnect = {
  configured: Boolean(apiBaseUrl),
  startOnboarding: startStripeConnectOnboarding,
};

window.ShapeRefunds = {
  requestRefund,
};

window.ShapeIntakes = {
  getClientIntake,
  saveClientIntake,
  listVisibleClientIntakes,
};

window.ShapeClientProfiles = {
  getClientProfileData,
  saveClientProfileData,
};

window.ShapeApplications = {
  uploadProviderApplicationFile,
  submitProviderApplication,
};

// ─── Sessions API (confirm/decline/join via /api/sessions/manage) ────────────
// Works in both the web (/m/, same-origin cookie) and native (Bearer) contexts.
function sessionsApiUrl() {
  return `${apiBaseUrl || ''}/api/sessions/manage`;
}
function sessionsAuthHeaders(extra = {}) {
  const h = { ...extra };
  if (state.session?.access_token) h.Authorization = `Bearer ${state.session.access_token}`;
  return h;
}
// Best-effort authenticated GET: returns `fallback` on missing session, a
// non-OK response, or any error. `transform` shapes a successful JSON body.
async function getJsonOrDefault(url, fallback, transform) {
  if (!supabase || !state.user?.id) return fallback;
  try {
    const res = await fetch(url, { headers: sessionsAuthHeaders(), credentials: 'same-origin', cache: 'no-store' });
    if (!res.ok) return fallback;
    const data = await res.json();
    return transform ? transform(data) : data;
  } catch (e) {
    return fallback;
  }
}

// ── Shared client-metrics cache ──────────────────────────────────────────────
// The client rollup endpoints (analytics / progress / train / nutrition / plan)
// used to be fetched independently by every surface that shows them — home
// ticker, Me profile, Progress hub, Goal page — duplicate requests AND
// staleness races where two screens showed different numbers for the same
// metric. Every reader now shares ONE in-flight promise + cached RAW response
// per endpoint (60s TTL); callers apply their own transforms on top. Writes
// that change the numbers (weigh-in, check-in, meal note, sign-in/out)
// invalidate the cache so the next read is fresh.
const _metricsCache = new Map(); // url → { at, promise }
const METRICS_TTL_MS = 60_000;
function cachedClientJson(path) {
  const url = `${apiBaseUrl || ''}${path}`;
  const uid = state.user?.id || 'anon';
  const key = `${uid}:${url}`;
  const hit = _metricsCache.get(key);
  if (hit && Date.now() - hit.at < METRICS_TTL_MS) return hit.promise;
  const entry = { at: Date.now(), promise: getJsonOrDefault(url, null) };
  _metricsCache.set(key, entry);
  return entry.promise;
}
function invalidateClientMetrics() { _metricsCache.clear(); }
window.ShapeMetrics = { invalidate: invalidateClientMetrics };
// The Record — full Shape Score history + report. Native-safe (apiBaseUrl + Bearer
// via getJsonOrDefault); the raw relative fetch would target the WebView origin on
// the native build. Returns null on no-session / non-OK / error (page → empty).
async function getScoreRecord() {
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/client/score-record`, null);
}
window.ShapeScoreRecord = { get: getScoreRecord };
// Real food search (meal logger add sheet). Plain authed fetch — NO shared
// cache (queries are too varied to benefit); THROWS on failure so the sheet
// can show the honest can't-reach state instead of a silent empty list.
// Native-safe (apiBaseUrl + Bearer via sessionsAuthHeaders).
async function searchFoods(q, { signal } = {}) {
  const query = String(q || '').trim();
  if (query.length < 2) return { results: [] };
  const res = await fetch(`${apiBaseUrl || ''}/api/nutrition/food-search?q=${encodeURIComponent(query)}`, {
    headers: sessionsAuthHeaders(), credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (!res.ok) throw new Error('food_search_failed');
  return await res.json();
}
// Barcode → one OFF product (the v2 scanner). Same route, ?barcode= leg;
// resolves { results:[row] } | { results:[], notFound } | { results:[], unavailable }.
async function lookupFoodBarcode(code, { signal } = {}) {
  const clean = String(code || '').trim();
  if (!clean) return { results: [], notFound: true };
  const res = await fetch(`${apiBaseUrl || ''}/api/nutrition/food-search?barcode=${encodeURIComponent(clean)}`, {
    headers: sessionsAuthHeaders(), credentials: 'same-origin', cache: 'no-store', signal,
  });
  if (!res.ok) throw new Error('food_barcode_failed');
  return await res.json();
}
window.ShapeFoodSearch = { search: searchFoods, barcode: lookupFoodBarcode };
async function getSessions() {
  return getJsonOrDefault(sessionsApiUrl(), [], (data) => (Array.isArray(data.sessions) ? data.sessions : []));
}
async function manageSession({ sessionId, action, date, time } = {}) {
  // reschedule carries the new wall-clock ({ date: 'YYYY-MM-DD', time?: 'HH:MM' });
  // the other actions send only { sessionId, action }.
  const body = { sessionId, action };
  if (date) body.date = date;
  if (time) body.time = time;
  const res = await fetch(sessionsApiUrl(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Could not update session.');
  return data;
}

// ─── Notifications (in-app feed + live bell) ─────────────────────────────────
async function listNotifications() {
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/notifications`, { notifications: [], unread: 0 },
    (data) => ({ notifications: Array.isArray(data.notifications) ? data.notifications : [], unread: data.unread || 0 }));
}
async function markNotificationRead({ id, all } = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/notifications`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(all ? { all: true } : { id }),
  });
  return res.ok;
}
// Live subscription on the user's notifications (added to supabase_realtime by
// the 2026-05-30 migration). Fires onInsert for new rows; returns unsubscribe.
function subscribeNotifications(onInsert) {
  if (!supabase || !state.user?.id) return () => {};
  const userId = state.user.id;
  const channel = supabase
    .channel(`notifications:${userId}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `user_id=eq.${userId}` },
      (payload) => { try { onInsert?.(payload.new); } catch (e) {} })
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
}

// ─── Activities (typed log + manual logging) ─────────────────────────────────
async function listActivities(clientId) {
  const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/client/activities${qs}`, { activities: [], breakdown: [], totalMinutes: 0 },
    (d) => ({ activities: d.activities || [], breakdown: d.breakdown || [], totalMinutes: d.totalMinutes || 0 }));
}
async function logActivity({ activityType, durationMin, distanceKm, calories, startedAt, title } = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/client/activities`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ activityType, durationMin, distanceKm, calories, startedAt, title }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not log activity.');
  return d;
}

// ─── Calendar (shared with website via /api/calendar) ────────────────────────
async function listCalendar({ from, to, clientId } = {}) {
  const qs = new URLSearchParams();
  if (from) qs.set('from', from);
  if (to) qs.set('to', to);
  if (clientId) qs.set('clientId', clientId);
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/calendar?${qs.toString()}`, { events: [] },
    (d) => ({ events: Array.isArray(d.events) ? d.events : [] }));
}
async function createCalendarEvent(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/calendar`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save event.');
  return d.event;
}
async function updateCalendarEvent(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/calendar`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not update event.');
  return d.event;
}
async function deleteCalendarEvent(id) {
  const res = await fetch(`${apiBaseUrl || ''}/api/calendar`, {
    method: 'DELETE', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id }),
  });
  return res.ok;
}

window.ShapeCalendar = {
  list: listCalendar,
  create: createCalendarEvent,
  update: updateCalendarEvent,
  remove: deleteCalendarEvent,
};

window.ShapeActivities = {
  list: listActivities,
  log: logActivity,
};

// Daily check-in (mood) → /api/client/checkin (upserts today's snapshot).
async function logCheckin({ mood, energy, hunger, stress, soreness, sleepHours, sleepQuality } = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/client/checkin`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ mood, energy, hunger, stress, soreness, sleepHours, sleepQuality, date: _localDate() }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save check-in.');
  invalidateClientMetrics();
  return d;
}
window.ShapeCheckin = { log: logCheckin };

// Shape Score leaderboard (cross-user ranking via SECURITY DEFINER RPC).
async function getLeaderboard(period = 'month') {
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/leaderboard?period=${encodeURIComponent(period)}`, { entries: [], me: null });
}
window.ShapeLeaderboard = { get: getLeaderboard };

// Client analytics (home cards + ticker). Bearer in native, cookie on /m/.
// Reads share the metrics cache — the ticker and the Progress hub consume the
// SAME response now, so they can never disagree within a session.
async function getAnalytics() {
  return cachedClientJson('/api/client/analytics');
}
async function getProgress() {
  return cachedClientJson('/api/client/progress');
}
// MERGE (don't replace) so a `track` already attached by services/analytics.js
// survives regardless of module load order; analytics.js likewise merges onto this.
window.ShapeAnalytics = Object.assign(window.ShapeAnalytics || {}, { get: getAnalytics, getProgress });

// Prescribed plan — assigned training + meal plan. Bearer in native, cookie
// on /m/. Returns null on any failure so callers fall back to demo content.
async function getPlan() {
  return cachedClientJson('/api/client/plan');
}
window.ShapePlan = { get: getPlan };

// Assignment — put a coach's catalogue plan onto a linked client's Train/Eat.
// Writes the SAME tables the client's /api/client/plan reads: trainer →
// client_workouts (direct Supabase via assignClientWorkout), nutritionist →
// client_meal_plans (POST /api/nutritionist/meal-plan). The roster is the
// coach's real linked clients (subscriptions + sessions); uuid-backed only.
async function listAssignableClients(role) {
  // dietitian → the nutritionist roster endpoint (not the trainer default).
  const path = providerDiscipline(role) === 'nutritionist' ? '/api/nutritionist/clients' : '/api/trainer/clients';
  const d = await getJsonOrDefault(`${apiBaseUrl || ''}${path}`, null);
  const list = Array.isArray(d?.clients) ? d.clients : [];
  return list.filter((c) => c.id).map((c) => ({ userId: c.id, name: c.name || 'Client', sessions: c.sessions || 0 }));
}
async function assignClientMealPlan({ clientId, title, weekStart, days }) {
  const res = await fetch(`${apiBaseUrl || ''}/api/nutritionist/meal-plan`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ clientId, title, weekStart: weekStart || null, days }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not assign the meal plan.');
  return d;
}
window.ShapeAssign = {
  clients: listAssignableClients,
  // Reuses the existing client_workouts writer (direct Supabase, RLS-scoped),
  // which the client's /api/client/plan reads back.
  workout: (args) => assignClientWorkout({ ...args, kind: 'template' }),
  mealPlan: assignClientMealPlan,
};

// ─── Shape Store (redeem points for real rewards) ────────────────────────────
// GET returns the live points balance + redemption locker; POST redeems an
// item by id (server validates cost + deducts atomically, issues a code).
async function getStore() {
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/store/redeem`, { balance: null, redemptions: [], credit: { session: 0, nutrition: 0 } },
    (data) => ({ balance: typeof data.balance === 'number' ? data.balance : null, redemptions: Array.isArray(data.redemptions) ? data.redemptions : [], credit: (data.credit && typeof data.credit === 'object') ? data.credit : { session: 0, nutrition: 0 } }));
}
async function redeemStoreItem(itemId, shipping) {
  const res = await fetch(`${apiBaseUrl || ''}/api/store/redeem`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(shipping ? { itemId, shipping } : { itemId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Redemption failed.');
  return data;
}
// Cart checkout — redeem MULTIPLE merch items in one order (one shipment).
// items: [{ itemId, qty }]. Server re-prices + redeems atomically.
async function checkoutStoreCart(items, shipping) {
  const res = await fetch(`${apiBaseUrl || ''}/api/store/checkout`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ items, shipping }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Checkout failed.');
  return data;
}
// Coach-only — activate a marketplace Lead Boost (separate from item redemption).
async function redeemLeadBoost(role, days) {
  const res = await fetch(`${apiBaseUrl || ''}/api/lead-boosts`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ role, days }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Lead Boost failed.');
  return data;
}
// Tier rewards — the free unlocks earned by climbing the ladder. The server
// owns the whole definition (which tier unlocks what, which picks are legal),
// so this layer only carries it through; a pre-migration read is an empty
// shelf, never an error.
async function listTierRewards() {
  const d = await getJsonOrDefault(`${apiBaseUrl || ''}/api/store/tier-rewards`, { rewards: [] },
    (data) => ({ rewards: Array.isArray(data.rewards) ? data.rewards : [] }));
  return d.rewards;
}
async function claimTierReward(rewardKey, choice, shipping) {
  const body = { rewardKey };
  if (choice) body.choice = choice;
  if (shipping) body.shipping = shipping;
  const res = await fetch(`${apiBaseUrl || ''}/api/store/tier-rewards`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Claim failed.');
  return data;
}
window.ShapeTierRewards = { list: listTierRewards, claim: claimTierReward };

window.ShapeStore = { get: getStore, redeem: redeemStoreItem, checkout: checkoutStoreCart, redeemLeadBoost };

window.ShapeNotifications = {
  list: listNotifications,
  markRead: markNotificationRead,
  subscribe: subscribeNotifications,
};

window.ShapeBookings = {
  submitConsultationBooking,
  getCapacity: getProviderCapacity,
  setCapacity: setProviderCapacity,
};

// ─── Coach waiting list (join / mine / withdraw / room / invite) ─────────────
async function waitlistJoin({ providerId, providerRole, note } = {}) {
  if (!apiBaseUrl || !state.session?.access_token) throw new Error('Sign in to join the waiting list.');
  const res = await fetch(`${apiBaseUrl}/api/waitlist/join`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ providerId, providerRole, note: note || undefined }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not join the waiting list.');
  return json; // { position, status }
}
async function waitlistMine() {
  if (!apiBaseUrl || !state.session?.access_token) return { entries: [] };
  // Reads degrade to a soft empty state on ANY failure (offline/CORS/malformed
  // JSON), not just non-OK HTTP — callers render "no waitlists" instead of throwing.
  try {
    const res = await fetch(`${apiBaseUrl}/api/waitlist/mine`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
    if (!res.ok) return { entries: [] };
    return await res.json().catch(() => ({ entries: [] }));
  } catch { return { entries: [] }; }
}
async function waitlistWithdraw(entryId) {
  if (!apiBaseUrl || !state.session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(`${apiBaseUrl}/api/waitlist/withdraw`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not update the waiting list.');
  return json;
}
async function waitlistRoom({ providerId, providerRole } = {}) {
  if (!apiBaseUrl || !state.session?.access_token) return { entries: [] };
  // Normalize to the physical provider discipline so the query never sends
  // `providerRole=undefined` (dietitian → nutritionist; unknown → server 400).
  const role = providerDiscipline(normalizeRole(providerRole));
  const q = new URLSearchParams({ providerId: String(providerId), providerRole: role }).toString();
  try {
    const res = await fetch(`${apiBaseUrl}/api/waitlist/room?${q}`, { headers: { Authorization: `Bearer ${state.session.access_token}` } });
    if (!res.ok) return { entries: [] };
    return await res.json().catch(() => ({ entries: [] }));
  } catch { return { entries: [] }; }
}
async function waitlistInvite(entryId) {
  if (!apiBaseUrl || !state.session?.access_token) throw new Error('Sign in first.');
  const res = await fetch(`${apiBaseUrl}/api/waitlist/invite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${state.session.access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ entryId }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error || 'Could not send the invite.');
  return json;
}
// Coach availability (the marketplace Listing + its full calendar): the coach's
// public weekly pattern + booked sessions from GET /api/availability. Public
// route (no auth); 60s cache per coach so the station + calendar share a fetch.
const _coachAvailCache = new Map();
async function coachAvailabilityGet(role, id) {
  if (!apiBaseUrl || !role || !id) return null;
  const key = `${role}:${id}`;
  const hit = _coachAvailCache.get(key);
  if (hit && Date.now() - hit.at < 60000) return hit.data;
  const res = await fetch(`${apiBaseUrl}/api/availability?role=${encodeURIComponent(role)}&id=${encodeURIComponent(id)}`, { credentials: 'same-origin' });
  if (!res.ok) return null;
  const data = await res.json().catch(() => null);
  if (data) _coachAvailCache.set(key, { at: Date.now(), data });
  return data;
}
window.ShapeCoachAvailability = { get: coachAvailabilityGet };

// Coach-authored monthly offer (the Listing's WHAT'S INCLUDED sheet): lives on
// the coach's own provider row (monthly_offer jsonb, migration 2026-07-09).
// The tables' own-row UPDATE policy covers the write — monthly_offer is not an
// admin-pinned column (2026-06-25-provider-admin-column-guard).
async function coachOfferGet(role) {
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id;
  if (!supabase || !uid) return null;
  const table = normalizeRole(role) === 'nutritionist' ? 'nutritionists' : 'trainers';
  const { data, error } = await supabase.from(table).select('id, monthly_offer').eq('owner_id', uid).maybeSingle();
  if (error || !data) return null;
  return { providerId: data.id, offer: data.monthly_offer || null };
}
async function coachOfferSave(role, offer) {
  const uid = window.ShapeAuth?.getCachedState?.()?.user?.id;
  if (!supabase || !uid) throw new Error('Sign in first.');
  const table = normalizeRole(role) === 'nutritionist' ? 'nutritionists' : 'trainers';
  const clean = {
    blurb: String((offer && offer.blurb) || '').trim().slice(0, 600),
    includes: (Array.isArray(offer && offer.includes) ? offer.includes : [])
      .map((x) => String(x || '').trim().slice(0, 80)).filter(Boolean).slice(0, 8),
    updatedAt: new Date().toISOString(),
  };
  const { error } = await supabase.from(table).update({ monthly_offer: clean }).eq('owner_id', uid);
  if (error) throw error;
  return clean;
}
window.ShapeCoachOffer = { get: coachOfferGet, save: coachOfferSave };


window.ShapeWaitlist = {
  join: waitlistJoin,
  mine: waitlistMine,
  withdraw: waitlistWithdraw,
  room: waitlistRoom,
  invite: waitlistInvite,
};

window.ShapeSessions = {
  createSessionRequest,
  listSessions,
  updateSessionStatus,
  getSessions,
  manageSession,
};

window.ShapeAvailability = {
  listProviderAvailability,
  saveProviderAvailability,
};


window.ShapeWorkouts = {
  listClientWorkouts,
  assignClientWorkout,
  updateClientWorkout,
};

window.ShapeAI = {
  generatePlanDraft,
};

// Per-client program phase (training block + nutrition phase). Self-scoped by
// default; a coach passes a client's userId to read/set their phase.
async function getClientProgram(userId) {
  if (!supabase || !state.user?.id) return null;
  const uid = userId || state.user.id;
  const { data, error } = await supabase
    .from('client_programs')
    .select('training_phase, nutrition_phase, detail')
    .eq('user_id', uid)
    .maybeSingle();
  if (error) return null;
  return data ? { trainingPhase: data.training_phase, nutritionPhase: data.nutrition_phase, detail: data.detail || {} } : null;
}
async function setClientProgram({ userId, trainingPhase, nutritionPhase, detail } = {}) {
  if (!supabase || !state.user?.id) return null;
  const uid = userId || state.user.id;

  // Self-edit: the client may set their own row directly (self RLS). A COACH
  // setting a client's program goes through set_program_detail, which enforces
  // discipline server-side (a trainer can only touch training, a nutritionist
  // only nutrition) and merges over what's stored. Per-discipline so neither
  // coach can clobber the other's section.
  if (uid !== state.user.id) {
    let result = null;
    const sections = [
      { d: 'training', phase: trainingPhase, body: detail?.training },
      { d: 'nutrition', phase: nutritionPhase, body: detail?.nutrition },
    ];
    for (const s of sections) {
      if (s.phase == null && s.body == null) continue;
      const { data, error } = await supabase.rpc('set_program_detail', {
        p_client_id: uid,
        p_discipline: s.d,
        p_phase: s.phase ?? null,
        p_detail: s.body ?? null,
      });
      if (error) throw error;
      result = data || result;
    }
    if (!result) return getClientProgram(uid);
    return { trainingPhase: result.trainingPhase, nutritionPhase: result.nutritionPhase, detail: result.detail || {} };
  }

  const payload = { user_id: uid, updated_by: state.user.id, updated_at: new Date().toISOString() };
  if (trainingPhase != null) payload.training_phase = trainingPhase;
  if (nutritionPhase != null) payload.nutrition_phase = nutritionPhase;

  // A SELF write must never set `detail.directive`: that field is the coach's override
  // (written only by /api/ai/directive/override) and the engine honors it as an
  // authoritative coach directive. Strip it so a client can't forge one.
  let selfDetail = null;
  if (detail && typeof detail === 'object') {
    const { directive: _coachOnly, ...rest } = detail;
    selfDetail = rest;
  }

  // The detail JSONB merges via merge_program_detail (atomic — ON CONFLICT DO UPDATE
  // under the row lock), so a concurrent coach Adjust to a sibling section isn't
  // clobbered by this self-write's stale read-modify-write. Phase columns stay a scalar
  // upsert (last-write-wins is the intended semantics). Falls back to the legacy
  // read-then-write until the merge_program_detail migration is applied.
  if (selfDetail && Object.keys(selfDetail).length) {
    const { error: mErr } = await supabase.rpc('merge_program_detail', { p_client_id: uid, p_patch: selfDetail });
    if (mErr) {
      if (mErr.code === 'PGRST202' || mErr.code === '42883') {
        let existing = {};
        // maybeSingle() returns read errors in-band — don't merge from {} on a failed
        // read, which would erase the sibling sections. (A genuine first write returns
        // data:null with no error, so existing stays {}.)
        const { data: cur, error: curErr } = await supabase.from('client_programs').select('detail').eq('user_id', uid).maybeSingle();
        if (curErr) throw curErr;
        if (cur?.detail && typeof cur.detail === 'object') existing = cur.detail;
        payload.detail = { ...existing, ...selfDetail };
      } else { throw mErr; }
    }
  }

  const { data, error } = await supabase
    .from('client_programs')
    .upsert(payload, { onConflict: 'user_id' })
    .select('training_phase, nutrition_phase, detail')
    .maybeSingle();
  if (error) throw error;
  return data ? { trainingPhase: data.training_phase, nutritionPhase: data.nutrition_phase, detail: data.detail || {} } : null;
}
window.ShapeProgramApi = { get: getClientProgram, set: setClientProgram };

// Coach read of a client's goals (user_goals 'client_goals'), gated server-side
// on is_coach_on_client + the client's `share` flag. Returns the goals document
// ({ share, training, nutrition }), { share:false } when the client opted out,
// or null when not the client's coach / not signed in.
async function getClientGoals(userId) {
  if (!supabase || !state.user?.id || !userId) return null;
  const { data, error } = await supabase.rpc('get_client_goals', { p_user_id: userId });
  if (error) return null;
  return data || null;
}
window.ShapeGoalsApi = { getForClient: getClientGoals };

// Coach read of a client's aggregated KPIs (sessions attendance, nutrition
// adherence + macro averages, weigh-in series), gated server-side on
// is_coach_on_client. Returns the stats object, or null when not the client's
// coach / not signed in. Fields may be null when there's no underlying data —
// the UI falls back to demo values per field.
async function getClientStats(userId) {
  if (!supabase || !state.user?.id || !userId) return null;
  const { data, error } = await supabase.rpc('get_client_stats', { p_user_id: userId });
  if (error) return null;
  return data || null;
}
// Strength rollup (key lifts, PRs, avg RPE) — best-effort from workout_set_logs.
async function getClientLifts(userId) {
  if (!supabase || !state.user?.id || !userId) return null;
  const { data, error } = await supabase.rpc('get_client_lifts', { p_user_id: userId });
  if (error) return null;
  return data || null;
}
// The member's SELF-AUTHORED training (trainer_id NULL rows) — compact
// projection via get_client_self_plans (is_coach_on_client-gated; null until
// the 2026-07-10 migration is applied or when the caller isn't their coach).
async function getClientSelfPlans(userId) {
  if (!supabase || !state.user?.id || !userId) return null;
  const { data, error } = await supabase.rpc('get_client_self_plans', { p_user_id: userId });
  if (error) return null;
  return Array.isArray(data) ? data : null;
}
window.ShapeClientStats = { get: getClientStats, getLifts: getClientLifts, getSelfPlans: getClientSelfPlans };
// Batch recent-sleep for a coach's roster (one call) so the triage engine can flag
// a client's chronic sleep deficit. RLS scopes it to this coach's clients; returns
// { [clientId]: { sleepHours: { avg7, lastNight, target } } } (empty on any failure).
async function getRosterSleep(ids) {
  if (!supabase || !state.user?.id || !Array.isArray(ids) || !ids.length) return {};
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/coach/roster-sleep`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...sessionsAuthHeaders() },
      body: JSON.stringify({ clientIds: ids }),
    });
    if (!res.ok) return {};
    const d = await res.json();
    return (d && d.recovery) || {};
  } catch (e) { return {}; }
}
window.ShapeRosterSleep = { get: getRosterSleep };

// Batch weekend-adherence split for a coach's roster (one call per roster view).
// POSTs { clientIds } to /api/coach/roster-weekend; degrades to an empty split so
// the roster never blocks on this auxiliary data.
async function rosterWeekendGet(clientIds) {
  const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
  // '' apiBaseUrl is valid same-origin config (see setTimezone) — gate on the token only.
  if (!ids.length || !state.session?.access_token) return { ok: true, split: {} };
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/coach/roster-weekend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ clientIds: ids }),
    });
    return res.ok ? await res.json() : { ok: true, split: {} };
  } catch { return { ok: true, split: {} }; }
}
window.ShapeRosterWeekend = { get: rosterWeekendGet };

// Weekly-adherence variance (spec 2026-07-19): direct definer RPC — the
// get_client_lifts pattern, NO route. Degrades to {} pre-migration/on error
// so the roster simply shows no chip. The band judgement is made by the ONE
// canonical module (public/newdesign/varianceBand.mjs); the RPC only buckets.
async function rosterVarianceGet(clientIds) {
  const ids = Array.isArray(clientIds) ? clientIds.filter(Boolean) : [];
  if (!supabase || !state.user?.id || !ids.length) return {};
  try {
    const { data, error } = await supabase.rpc('get_roster_weekly_adherence', { p_client_ids: ids });
    if (error || !Array.isArray(data)) return {};
    const byClient = {};
    for (const r of data) {
      if (!r || !r.client_id) continue;
      (byClient[r.client_id] = byClient[r.client_id] || []).push(r);
    }
    const out = {};
    for (const [uid, rows] of Object.entries(byClient)) {
      const v = bsVarianceBand(rows);
      if (v) out[uid] = v;
    }
    return out;
  } catch { return {}; }
}
window.ShapeRosterVariance = { get: rosterVarianceGet };

// Coach soundtracks — saved playlists shared with the website Playlists page
// (coach_soundtracks, owner-scoped). All calls hit the same-origin API so the
// signed-in coach's session is used; returns null when signed out / offline so
// the UI can fall back to local storage.
async function listSoundtracks() {
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/coach/soundtracks`, { credentials: 'same-origin', headers: sessionsAuthHeaders() });
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return Array.isArray(d.soundtracks) ? d.soundtracks : [];
  } catch (e) { return null; }
}
async function createSoundtrack(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/soundtracks`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save soundtrack.');
  return d.soundtrack;
}
async function updateSoundtrack(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/soundtracks`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not update soundtrack.');
  return d.soundtrack;
}
async function removeSoundtrack(id) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/soundtracks`, {
    method: 'DELETE', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id }),
  });
  return res.ok;
}
window.ShapeSoundtracks = { list: listSoundtracks, create: createSoundtrack, update: updateSoundtrack, remove: removeSoundtrack };

// ── Member playlists — a profile's Spotify/Apple library (public or private) ──
// Anyone can read a member's PUBLIC playlists (they show on the public profile);
// the owner sees all of theirs. Save copies a public playlist into your library.
function parsePlaylistUrl(url) {
  const u = String(url || '').trim();
  if (/open\.spotify\.com\/playlist\//i.test(u) || /spotify:playlist:/i.test(u)) return { provider: 'spotify', url: u };
  if (/music\.apple\.com\/.+\/playlist\//i.test(u)) return { provider: 'apple', url: u };
  if (/^https?:\/\//i.test(u)) return { provider: 'other', url: u };
  return null;
}
async function listMyPlaylists() {
  if (!supabase || !state.user?.id) return [];
  const { data, error } = await supabase.from('member_playlists').select('*').eq('user_id', state.user.id).order('sort').order('created_at', { ascending: false });
  if (error) return [];
  return data || [];
}
async function listPlaylistsFor(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.rpc('get_member_playlists', { p_user_id: userId });
  if (error) return [];
  return data || [];
}
async function addPlaylist({ name, url, cover = null, trackCount = null, meta = null, isPublic = true, savedFrom = null } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to save playlists.');
  const parsed = parsePlaylistUrl(url);
  if (!parsed) throw new Error('Paste a Spotify or Apple Music playlist link.');
  const row = { user_id: state.user.id, name: String(name || 'Playlist').trim() || 'Playlist', provider: parsed.provider, url: parsed.url, cover, track_count: trackCount, meta, is_public: !!isPublic, saved_from: savedFrom };
  const { data, error } = await supabase.from('member_playlists').insert(row).select().single();
  if (error) throw error;
  return data;
}
async function updatePlaylist(id, patch = {}) {
  if (!supabase || !state.user?.id || !id) return null;
  const allowed = {};
  ['name', 'is_public', 'cover', 'track_count', 'meta', 'sort'].forEach((k) => { if (patch[k] !== undefined) allowed[k] = patch[k]; });
  const { data, error } = await supabase.from('member_playlists').update(allowed).eq('id', id).eq('user_id', state.user.id).select().single();
  if (error) throw error;
  return data;
}
async function removePlaylist(id) {
  if (!supabase || !state.user?.id || !id) return false;
  const { error } = await supabase.from('member_playlists').delete().eq('id', id).eq('user_id', state.user.id);
  return !error;
}
// The signed-in member's own Spotify library (reuses the coach importer's API +
// the existing Spotify OAuth connection). { connected, playlists } | null on error.
async function listMySpotifyPlaylists() {
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/integrations/spotify/playlists`, { credentials: 'same-origin', headers: sessionsAuthHeaders() });
    const d = await res.json().catch(() => ({}));
    if (res.ok) return { connected: true, playlists: Array.isArray(d.playlists) ? d.playlists : [] };
    if (d && d.connected === false) return { connected: false, playlists: [] };
    return null;
  } catch (e) { return null; }
}
// Merged: member-playlist library + the trainer-playlist methods the Pros app
// uses (listTrainerPlaylists/createTrainerPlaylist). A second assignment used to
// clobber the trainer methods, silently breaking coach playlist load/create.
window.ShapePlaylists = { mine: listMyPlaylists, listFor: listPlaylistsFor, add: addPlaylist, update: updatePlaylist, remove: removePlaylist, parseUrl: parsePlaylistUrl, mySpotify: listMySpotifyPlaylists, listTrainerPlaylists, createTrainerPlaylist };

// Coach grocery lists — a coach's own + per-client lists (coach_grocery_lists,
// owner-scoped). Same shape as soundtracks; returns null when signed out so the
// UI falls back to demo seeds.
async function listGroceryLists() {
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/coach/grocery-lists`, { credentials: 'same-origin', headers: sessionsAuthHeaders() });
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return Array.isArray(d.lists) ? d.lists : [];
  } catch (e) { return null; }
}
async function createGroceryList(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/grocery-lists`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save grocery list.');
  return d.list;
}
async function updateGroceryList(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/grocery-lists`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not update grocery list.');
  return d.list;
}
async function removeGroceryList(id) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/grocery-lists`, {
    method: 'DELETE', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id }),
  });
  return res.ok;
}
// Fire the tailored "{coach} loaded your meal plan into grocery lists" notification
// for the client (SECURITY DEFINER RPC, gated to the linked coach). Best-effort.
async function notifyGroceryList(clientId, listName) {
  if (!supabase || !clientId) return;
  try { await supabase.rpc('notify_grocery_list', { p_client: clientId, p_list: listName || '' }); } catch (e) {}
}
// Deliver a grocery list to a client's Eat page (NOT chat): push it as a
// nutrition item (coach_pushed_items kind 'meal', payload.grocery flag) via the
// nutritionist console, so it shows up in their grocery for review + the tailored
// "loaded into grocery lists" notification fires (route 'eat').
async function pushGroceryToClient({ clientId, name, items } = {}) {
  if (!clientId) return false;
  const ingredients = (items || []).map(it => (it && it.name ? it.name : String(it || ''))).filter(Boolean);
  const payload = { name: name || 'Grocery list', ingredients, grocery: true };
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/nutritionist/console`, {
      method: 'POST', credentials: 'same-origin',
      headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ action: 'addItem', clientId, payload }),
    });
    return res.ok;
  } catch (e) { return false; }
}
window.ShapeGroceryLists = { list: listGroceryLists, create: createGroceryList, update: updateGroceryList, remove: removeGroceryList, notify: notifyGroceryList, push: pushGroceryToClient };

// Client read of grocery items a coach pushed (coach_pushed_items → /api/client/
// grocery, flattened to [{ id, item, qty, category, mealName }]). Powers the Eat
// review card. Returns [] when signed out / none.
async function listClientGrocery() {
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/client/grocery`, { credentials: 'same-origin', headers: sessionsAuthHeaders() });
    if (!res.ok) return [];
    const d = await res.json().catch(() => ({}));
    return Array.isArray(d.items) ? d.items : [];
  } catch (e) { return []; }
}
window.ShapeClientGrocery = { list: listClientGrocery };

// Care team — the OTHER coach(es) on a shared client + a private coach↔coach
// thread about that client. Mirrors the website coachClientDetail flow.
async function getCareTeamOverview(clientId) {
  if (!clientId) return null;
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/clients/${encodeURIComponent(clientId)}/shared-overview`, { credentials: 'same-origin', headers: sessionsAuthHeaders() });
    if (!res.ok) return null;
    return await res.json().catch(() => null);
  } catch (e) { return null; }
}
async function openCoachCoachThread(clientId, counterpartUserId) {
  if (!clientId || !counterpartUserId) return null;
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/me/shared-clients/${encodeURIComponent(clientId)}/thread`, {
      method: 'POST', credentials: 'same-origin',
      headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ counterpartUserId }),
    });
    const d = await res.json().catch(() => ({}));
    return res.ok ? (d.conversationId || null) : null;
  } catch (e) { return null; }
}
window.ShapeCareTeam = { overview: getCareTeamOverview, openThread: openCoachCoachThread };

// Coach: read + waive a client's recent accountability penalties. Both are gated
// server-side on is_coach_on_client (get_client_penalties / waive_penalty RPCs);
// a non-coach gets [] / { waived:false }. No-op until the migration is applied.
async function listClientPenalties(clientUid) {
  if (!supabase || !clientUid) return [];
  try {
    const { data, error } = await supabase.rpc('get_client_penalties', { p_uid: clientUid });
    return (!error && Array.isArray(data)) ? data : [];
  } catch (e) { return []; }
}
async function waiveClientPenalty(clientUid, sourceKind, sourceId) {
  if (!supabase || !clientUid || !sourceId) return { waived: false };
  try {
    const { data, error } = await supabase.rpc('waive_penalty', { p_uid: clientUid, p_source_kind: sourceKind, p_source_id: sourceId });
    return error ? { waived: false } : (data || { waived: false });
  } catch (e) { return { waived: false }; }
}
window.ShapeCoachPenalties = { list: listClientPenalties, waive: waiveClientPenalty };

// Coach: propose a weekly commitment for a client (set_commitment makes it 'proposed';
// the client must accept before any points are at risk). No-op pre-migration.
async function proposeCommitment(clientUid, targets, stake) {
  if (!supabase || !clientUid) return { ok: false };
  try {
    const { data, error } = await supabase.rpc('set_commitment', { p_user: clientUid, p_targets: targets, p_stake: stake });
    return error ? { ok: false } : (data || { ok: false });
  } catch (e) { return { ok: false }; }
}
window.ShapeCoachCommit = { propose: proposeCommitment };

// Coach plans — published programs / meal plans (coach_plans, owner-scoped),
// shared with the website. The AI draft builder + Duplicate persist here.
async function listCoachPlans(kind) {
  try {
    const qs = kind ? `?kind=${encodeURIComponent(kind)}` : '';
    const res = await fetch(`${apiBaseUrl || ''}/api/coach/plans${qs}`, { credentials: 'same-origin', headers: sessionsAuthHeaders() });
    if (!res.ok) return null;
    const d = await res.json().catch(() => ({}));
    return Array.isArray(d.plans) ? d.plans : [];
  } catch (e) { return null; }
}
async function createCoachPlan(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/plans`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not save plan.');
  return d.plan;
}
async function updateCoachPlan(body = {}) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/plans`, {
    method: 'PATCH', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not update plan.');
  return d.plan;
}
async function removeCoachPlan(id) {
  const res = await fetch(`${apiBaseUrl || ''}/api/coach/plans`, {
    method: 'DELETE', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ id }),
  });
  return res.ok;
}
// Sell-a-plan: a coach's published plans for sale, the buyer's owned plans, and
// the checkout that buys one (Stripe Connect via /api/stripe/checkout-session).
async function listSalePlans(providerRole, providerId) {
  if (!supabase || !providerRole || !providerId) return [];
  const { data, error } = await supabase.rpc('get_coach_sale_plans', { p_provider_role: providerRole, p_provider_id: Number(providerId) });
  if (error) return [];
  return (data || []).map((r) => ({ id: r.id, kind: r.kind, name: r.name, meta: r.meta || '', price: r.price || '', category: r.category || (r.kind === 'meal_plan' ? 'meal' : 'program'), detail: r.detail || {} }));
}
// Same as listSalePlans but keyed by the coach's auth user id (the Signal
// public profile only has the user id, not a marketplace provider-row id).
async function listSalePlansByUser(userId) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.rpc('get_coach_sale_plans_by_user', { p_user_id: userId });
  if (error) return [];
  return (data || []).map((r) => ({ id: r.id, kind: r.kind, name: r.name, meta: r.meta || '', price: r.price || '', category: r.category || (r.kind === 'meal_plan' ? 'meal' : 'program'), providerId: r.provider_id || null, providerRole: r.provider_role || (r.kind === 'meal_plan' ? 'nutritionist' : 'trainer'), detail: r.detail || {} }));
}
async function listPurchasedPlans() {
  if (!supabase || !state.user?.id) return [];
  const { data, error } = await supabase.rpc('get_my_purchased_plans');
  if (error) return [];
  return (data || []).map((r) => ({ id: r.id, kind: r.kind, name: r.name, meta: r.meta || '', detail: r.detail || {}, role: r.provider_role, purchasedAt: r.purchased_at }));
}
async function buyCoachPlan({ plan, providerRole, providerId } = {}) {
  if (!plan || !providerRole || !providerId) throw new Error('Plan unavailable to purchase.');
  const res = await fetch(`${apiBaseUrl || ''}/api/stripe/checkout-session`, {
    method: 'POST', credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({
      item: { type: 'plan', name: plan.name, price: plan.price, planId: plan.id },
      coach: { provider_id: providerId, provider_role: providerRole },
      successPath: '/purchase/success', cancelPath: '/m/',
    }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok || !d.url) throw new Error(d.error || 'Could not start checkout.');
  return d.url;
}
window.ShapeCoachPlans = { list: listCoachPlans, create: createCoachPlan, update: updateCoachPlan, remove: removeCoachPlan, salePlans: listSalePlans, salePlansByUser: listSalePlansByUser, purchased: listPurchasedPlans, buy: buyCoachPlan };

// Upload a coach's workout media (photo or video) to the public `coach-media`
// bucket (own <uid>/ folder, gated by storage RLS). Returns { url, type, name }
// — the URL rides in coach_plans.detail.media so clients can view it inline.
async function uploadCoachMedia(file) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to upload media.');
  if (!file) throw new Error('No file selected.');
  const isVideo = (file.type || '').startsWith('video/');
  const ext = ((file.type && file.type.split('/')[1]) || (isVideo ? 'mp4' : 'jpg')).replace(/[^a-z0-9]/gi, '') || (isVideo ? 'mp4' : 'jpg');
  const path = `${state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from('coach-media').upload(path, file, { contentType: file.type || (isVideo ? 'video/mp4' : 'image/jpeg'), upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('coach-media').getPublicUrl(path);
  return { url: data?.publicUrl || null, type: isVideo ? 'video' : 'image', name: file.name || '' };
}
window.ShapeCoachMedia = { upload: uploadCoachMedia };

// Live Bluetooth heart-rate monitor (standard HR profile straps/watches).
// Readings broadcast as `shape:hrm` window events; see services/hrm.js.
window.ShapeHRM = {
  available: hrmAvailable,
  connected: hrmConnected,
  current: hrmCurrent,
  connect: hrmConnect,
  disconnect: hrmDisconnect,
};

// Marketplace plan feed — published, priced coach_plans across ALL coaches,
// tabbed program | workout | meal. Public read (anon ok). Returns [] on no-data.
async function listMarketPlans() {
  if (!supabase) return [];
  const { data, error } = await supabase.rpc('get_market_plans');
  if (error) return [];
  return (data || []).map((r) => ({
    id: r.id, kind: r.kind, tab: r.tab || (r.kind === 'meal_plan' ? 'meal' : 'program'),
    name: r.name, meta: r.meta || '', price: r.price || '',
    coachName: r.coach_name || 'Shape coach', ownerId: r.owner_id || null,
    providerId: r.provider_id || null, providerRole: r.provider_role || (r.kind === 'meal_plan' ? 'nutritionist' : 'trainer'),
  }));
}
window.ShapeMarketPlans = { list: listMarketPlans, buy: buyCoachPlan };

// Weigh-ins — the live body-comp series (client_weigh_ins). One row per day
// (upsert), owned by the client; a linked coach reads them via get_client_goals.
async function listWeighIns() {
  if (!supabase || !state.user?.id) return null;
  const { data, error } = await supabase
    .from('client_weigh_ins')
    .select('logged_on, weight, unit')
    .eq('user_id', state.user.id)
    .order('logged_on', { ascending: true });
  if (error) return null;
  return (data || []).map(r => ({ d: r.logged_on, kg: Number(r.weight), unit: r.unit || 'kg' }));
}
async function logWeighIn({ weight, unit = 'kg', bodyFat = null } = {}) {
  if (!supabase || !state.user?.id) return null;
  const w = Number(weight);
  if (!Number.isFinite(w)) return null;
  const today = _localDate();
  const bf = Number(bodyFat);
  const row = { user_id: state.user.id, logged_on: today, weight: w, unit };
  if (Number.isFinite(bf) && bf > 0 && bf < 75) row.body_fat_pct = bf;
  let { data, error } = await supabase
    .from('client_weigh_ins')
    .upsert(row, { onConflict: 'user_id,logged_on' })
    .select('logged_on, weight')
    .maybeSingle();
  // Pre-migration safety: retry without body_fat_pct if the column is missing.
  if (error && row.body_fat_pct != null && /body_fat_pct/.test(String(error.message || ''))) {
    delete row.body_fat_pct;
    ({ data, error } = await supabase
      .from('client_weigh_ins')
      .upsert(row, { onConflict: 'user_id,logged_on' })
      .select('logged_on, weight')
      .maybeSingle());
  }
  if (error) throw error;
  invalidateClientMetrics();
  return data;
}
// Meal-log macros → today's daily_health_snapshot (accumulating server-side),
// so the Nutrition tab / macro adherence reflect what was actually logged.
async function logMealMacros({ kcal, protein, carbs, fat, hydrationL } = {}) {
  if (!supabase || !state.user?.id) return null;
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/nutrition/meal-log`, {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', ...sessionsAuthHeaders() },
      body: JSON.stringify({ kcal, protein, carbs, fat, hydrationL, date: _localDate() }),
    });
    if (!res.ok) return null;
    invalidateClientMetrics();
    // Shape Score: +10 once/day for logging a meal (server-gated + deduped;
    // mirrors award_workout_session). Fire-and-forget — never blocks the log —
    // but the RESULT ({awarded, points}) rides back on the resolved value so the
    // confirmation can show +10 only when it was actually granted (not on an
    // already-earned day). Errors + no-user resolve to null, never reject.
    let awardPromise = Promise.resolve(null);
    try {
      if (state.user?.id) {
        awardPromise = supabase.rpc('award_meal_log', { p_day: _localDate() })
          .then((r) => (r && r.data && typeof r.data === 'object' ? r.data : null), () => null);
      }
    } catch (e) {}
    const snap = await res.json().catch(() => ({}));
    return { ...(snap && typeof snap === 'object' ? snap : {}), awardPromise };
  } catch (e) { return null; }
}
window.ShapeMealLog = { log: logMealMacros };
// Hydration logger — GET today's intake + target; POST a delta (liters).
async function getHydration() {
  // Pass the client LOCAL date so the read targets the same snapshot row the
  // quick-add POST writes (addHydration sends date: _localDate()). Without it the
  // GET falls back to the server UTC day and the card can read a different day's
  // row near local midnight.
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/client/hydration?date=${_localDate()}`, null);
}
async function addHydration(deltaL) {
  const res = await fetch(`${apiBaseUrl || ''}/api/client/hydration`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...sessionsAuthHeaders() },
    body: JSON.stringify({ deltaL, date: _localDate() }),
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Could not log hydration.');
  invalidateClientMetrics();
  return d;
}
window.ShapeHydration = { get: getHydration, add: addHydration };
// Goal-milestone Shape points: the RPC checks the Overall goal trajectory
// against the latest weigh-in and credits any newly reached 25/50/75/goal
// milestone into score_ledger (idempotent — same pattern as award_tier_bonuses).
// Returns [{ milestone, points }] for the milestones credited by THIS call.
async function awardGoalMilestones() {
  if (!supabase || !state.user?.id) return [];
  try {
    const { data, error } = await supabase.rpc('award_my_goal_milestones');
    if (error || !Array.isArray(data) || !data.length) return [];
    invalidateClientMetrics();
    return data;
  } catch (e) { return []; }
}
window.ShapeWeighIns = { list: listWeighIns, log: logWeighIn };
window.ShapeGoalAwards = { check: awardGoalMilestones };

// ── The Cycle (spec 2026-07-19, PR A) ───────────────────────────────────────
// Data layer only — PR B–D consume. Every write path is RPC-first with NO
// fallback write: a direct settings/consent write would raise on the DB's
// GUC-guard triggers, CORRECTLY (flag and receipt may only move together,
// inside the RPCs). Pre-migration the RPCs are absent → honest
// { ok:false, reason:'unavailable' } and the UI says so; reads degrade to
// empty/null. Phase derivation lives ONLY in cyclePhase.mjs — nothing here
// interprets dates.
async function cycleList() {
  if (!supabase || !state.user?.id) return [];
  try {
    const { data, error } = await supabase
      .from('cycle_events')
      .select('event_date')
      .eq('user_id', state.user.id)
      .eq('kind', 'period_start')
      .order('event_date', { ascending: false })
      .limit(60);
    if (error) return [];
    return (data || []).map((r) => r.event_date);
  } catch (e) { return []; }
}
async function cycleLog(isoDate) {
  if (!supabase || !state.user?.id || !isoDate) return { ok: false };
  try {
    const { error } = await supabase.from('cycle_events').upsert(
      { user_id: state.user.id, event_date: isoDate, kind: 'period_start' },
      { onConflict: 'user_id,event_date,kind' },
    );
    if (error) {
      // The storage-boundary trigger names its rejection; PR B's calendar
      // toasts honestly instead of showing a generic failure.
      if (String(error.message || '').includes('future_event_date')) return { ok: false, reason: 'future' };
      return { ok: false };
    }
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
async function cycleUnlog(isoDate) {
  if (!supabase || !state.user?.id || !isoDate) return { ok: false };
  try {
    const { error } = await supabase.from('cycle_events').delete()
      .eq('user_id', state.user.id).eq('event_date', isoDate).eq('kind', 'period_start');
    return { ok: !error };
  } catch (e) { return { ok: false }; }
}
async function cycleSettings() {
  // READ direct is fine — only WRITES are RPC-gated.
  if (!supabase || !state.user?.id) return null;
  try {
    const { data, error } = await supabase.from('user_goals').select('data')
      .eq('user_id', state.user.id).eq('kind', 'cycle_settings').maybeSingle();
    if (error || !data || !data.data) return null;
    return { optIn: !!data.data.optIn, share: !!data.data.share };
  } catch (e) { return null; }
}
async function cycleSetSettings({ optIn, share, consentKind, granted, consentText } = {}) {
  if (!supabase || !state.user?.id) return { ok: false, reason: 'signed_out' };
  try {
    const { error } = await supabase.rpc('cycle_set_settings', {
      p_opt_in: !!optIn, p_share: !!share,
      p_consent_kind: consentKind, p_granted: !!granted, p_consent_text: String(consentText || ''),
    });
    if (error) {
      const msg = String(error.message || '');
      // PGRST202/42883 = the RPC doesn't exist yet (pre-migration).
      if (msg.includes('cycle_set_settings') || error.code === 'PGRST202' || error.code === '42883') {
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: false };
    }
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
async function cycleOptOut() {
  if (!supabase || !state.user?.id) return { ok: false, reason: 'signed_out' };
  try {
    const { error } = await supabase.rpc('cycle_opt_out');
    if (error) {
      const msg = String(error.message || '');
      if (msg.includes('cycle_opt_out') || error.code === 'PGRST202' || error.code === '42883') {
        return { ok: false, reason: 'unavailable' };
      }
      return { ok: false };
    }
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
async function cycleForClient(userId) {
  if (!supabase || !state.user?.id || !userId) return null;
  try {
    const { data, error } = await supabase.rpc('get_client_cycle', { p_user_id: userId });
    if (error || data == null) return null;               // not their coach / pre-migration
    if (data.share !== true) return { share: false };     // absence — the caller renders nothing
    // `today` = the member's OWN local date (get_client_cycle, via shape_user_tz)
    // so a consumer derives her cycle day against her today, not the device clock.
    return { share: true, starts: Array.isArray(data.starts) ? data.starts : [], today: typeof data.today === 'string' ? data.today : null };
  } catch (e) { return null; }
}
window.ShapeCycle = {
  list: cycleList, log: cycleLog, unlog: cycleUnlog,
  settings: cycleSettings, setSettings: cycleSetSettings,
  optOut: cycleOptOut, forClient: cycleForClient,
};

// ---------------------------------------------------------------------------
// Meal prep — the PREPPED state (Cook Mode wave PR C). user_goals('meal_prep')
// holds { entries: [...] }; every read AND write prunes to the 4-day freshness
// window (bsPrunePrep), so a stale record can never render a stamp. Cache is
// uid-keyed and cleared on sign-out (the cycle cross-account lesson — never an
// unscoped module cache over member data). Signed-out reads null: PREPPED
// renders only from a real record, no demo stamps (doctrine).
let _prepCache = null; // { uid, entries }
async function mealPrepEntries() {
  const uid = state.user?.id;
  if (!supabase || !uid) return null;
  // Re-prune on EVERY return — a long-lived session (app kept in memory across
  // days) must not keep serving records that have since aged out of the 4-day
  // window (CodeRabbit Major). Cheap (a filter over a tiny array).
  if (_prepCache && _prepCache.uid === uid) return bsPrunePrep(_prepCache.entries, Date.now());
  try {
    const { data, error } = await supabase.from('user_goals').select('data')
      .eq('user_id', uid).eq('kind', 'meal_prep').maybeSingle();
    if (error) return null;                       // read fault ≠ "no preps" — no cache
    const entries = bsPrunePrep(data?.data?.entries, Date.now());
    _prepCache = { uid, entries };
    return entries;
  } catch (e) { return null; }
}
async function mealPrepRecord(newEntries) {
  const uid = state.user?.id;
  if (!supabase || !uid || !Array.isArray(newEntries) || !newEntries.length) return { ok: false };
  try {
    // Read the CURRENT doc DIRECTLY (not via the cache) and ABORT on a read
    // error — a failed read must never be collapsed to "no entries" and then
    // upserted over the stored doc, which would wipe prior fresh PREPPED records
    // that simply didn't load (CodeRabbit Critical — non-idempotent write on an
    // unverified read).
    const { data, error } = await supabase.from('user_goals').select('data')
      .eq('user_id', uid).eq('kind', 'meal_prep').maybeSingle();
    if (error) return { ok: false };
    const cur = bsPrunePrep(data?.data?.entries, Date.now());
    const entries = bsPrunePrep([...cur, ...newEntries], Date.now());
    const res = await supabase.from('user_goals').upsert(
      { user_id: uid, kind: 'meal_prep', data: { entries } },
      { onConflict: 'user_id,kind' },
    );
    if (res.error) return { ok: false };
    _prepCache = { uid, entries };
    try { window.dispatchEvent(new CustomEvent('shape:mealPrep')); } catch (e) {}
    return { ok: true };
  } catch (e) { return { ok: false }; }
}
window.ShapeMealPrep = {
  entries: mealPrepEntries,
  record: mealPrepRecord,
  invalidate: () => { _prepCache = null; },
};

// Momentum weekly bonus: the RPC grants +25 once per ISO week when the caller's
// momentum is ≥ 80, derived server-side from real activity (idempotent — same
// pattern as award_my_goal_milestones). Returns the jsonb result, or null on
// no-op / pre-migration. Called on session resolve (next to award_tier_bonuses).
async function awardMomentumBonus() {
  if (!supabase || !state.user?.id) return null;
  try {
    const { data, error } = await supabase.rpc('award_momentum_bonus');
    if (error || !data) return null;
    if (data.awarded) invalidateClientMetrics();
    return data;
  } catch (e) { return null; }
}
window.ShapeMomentum = { check: awardMomentumBonus };

// Career milestone +25 (spec 2026-07-13): award_work_milestone validates the
// full milestone shape server-side and dedupes ONE award per calendar month in
// the member's own tz — a same-month duplicate returns { granted: false },
// never an error. The claim is AWAITED at post time; a failed call (network /
// backgrounded / pre-migration) queues the post id so the open-time catch-up
// re-fires it — the member can never permanently lose the award.
const CAREER_AWARD_PENDING_KEY = 'shape.careerAwardPending';
async function claimCareerAward(postId) {
  if (!supabase || !postId) return { granted: false };
  try {
    const { data, error } = await supabase.rpc('award_work_milestone', { p_post_id: postId });
    if (error) throw error;
    try { localStorage.removeItem(CAREER_AWARD_PENDING_KEY); } catch (e) {}
    if (data && data.granted) invalidateClientMetrics();
    return data || { granted: false };
  } catch (e) {
    try { localStorage.setItem(CAREER_AWARD_PENDING_KEY, String(postId)); } catch (e2) {}
    return { granted: false, pending: true };
  }
}
async function careerAwardCatchUp() {
  if (!supabase || !state.user?.id) return null;
  let pending = null;
  try { pending = localStorage.getItem(CAREER_AWARD_PENDING_KEY); } catch (e) { return null; }
  if (!pending) return null;
  try {
    const { data, error } = await supabase.rpc('award_work_milestone', { p_post_id: pending });
    if (error) return null; // still unreachable/pre-migration — keep the queue for next open
    try { localStorage.removeItem(CAREER_AWARD_PENDING_KEY); } catch (e) {}
    if (data && data.granted) invalidateClientMetrics();
    return data;
  } catch (e) { return null; }
}
window.ShapeCareerAward = { claim: claimCareerAward, catchUp: careerAwardCatchUp };

// Native-safe habits read (Bearer on native, cookie on the /m/ web build) —
// consumers must not raw-fetch the same-origin path, which targets the
// WebView origin on a native build (Codex P2, #1698). Used by the crossover
// card; returns the route's { habits } payload or null.
window.ShapeHabitsData = { list: () => getJsonOrDefault('/api/client/habits', null) };

// Shape Steps points: the RPC credits +1 per 5,000 steps (capped at +4/day) plus a
// +3 goal-hit bonus, once per COMPLETED day, from the device-synced step count
// (idempotent — same pattern as award_my_goal_milestones). Returns [{ day, points }]
// for the days credited by THIS call, or [] on no-op / pre-migration.
async function awardStepPoints() {
  if (!supabase || !state.user?.id) return [];
  try {
    const { data, error } = await supabase.rpc('award_step_points');
    if (error || !Array.isArray(data) || !data.length) return [];
    invalidateClientMetrics();
    return data;
  } catch (e) { return []; }
}
window.ShapeStepPoints = { check: awardStepPoints };

// Opportunistic, non-throwing: mirror the authenticated-fetch pattern used by
// postProConsole (there is NO generic postJson helper in this file).
async function setTimezone(tz) {
  if (!tz || typeof tz !== 'string') return { ok: false };
  // apiBaseUrl is '' on same-origin (/m/ web) builds — that's valid, not "missing
  // config" — so gate only on the bearer token and use the `${apiBaseUrl || ''}`
  // URL form the rest of the file uses for same-origin calls.
  if (!state.session?.access_token) return { ok: false };
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/client/timezone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ tz }),
    });
    return res.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}
// Opportunistic UI-locale mirror to client_profiles.locale (same auth pattern as
// setTimezone). Best-effort + non-throwing; no-ops signed-out / pre-migration.
async function setLocale(code) {
  if (!code || typeof code !== 'string') return { ok: false };
  if (!state.session?.access_token) return { ok: false };
  try {
    const res = await fetch(`${apiBaseUrl || ''}/api/client/locale`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ locale: code }),
    });
    return res.ok ? { ok: true } : { ok: false };
  } catch { return { ok: false }; }
}
window.ShapeProfile = { ...(window.ShapeProfile || {}), setTimezone, setLocale };

// Weekly commitment + stake. Reads score_commitments via the RLS-scoped client (owner
// sees their own row); writes through set/accept RPCs. All no-op pre-migration.
function _commitWeekMonday() {
  const mon = new Date(); mon.setUTCHours(0, 0, 0, 0);
  mon.setUTCDate(mon.getUTCDate() - ((mon.getUTCDay() + 6) % 7));
  return mon;
}
async function getCommitment() {
  if (!supabase || !state.user?.id) return null;
  try {
    const wk = _commitWeekMonday().toISOString().slice(0, 10);
    const { data, error } = await supabase.from('score_commitments')
      .select('id, targets, stake, status, week_of, created_by')
      .eq('user_id', state.user.id).eq('week_of', wk).maybeSingle();
    return error ? null : (data || null);
  } catch (e) { return null; }
}
async function getCommitmentProgress() {
  if (!supabase || !state.user?.id) return { workouts: 0, checkin: false, habits: 0 };
  try {
    const mon = _commitWeekMonday();
    const wk = mon.toISOString().slice(0, 10);
    const end = new Date(mon); end.setUTCDate(end.getUTCDate() + 6);
    const wkEnd = end.toISOString().slice(0, 10);
    const uid = state.user.id;
    const [snaps, acts, chk, habs] = await Promise.all([
      supabase.from('daily_health_snapshot').select('snapshot_date, workout_minutes').eq('user_id', uid).gte('snapshot_date', wk).lte('snapshot_date', wkEnd),
      supabase.from('activities').select('started_at').eq('user_id', uid).gte('started_at', wk).lte('started_at', wkEnd + 'T23:59:59Z'),
      supabase.from('client_checkins').select('week_of').eq('user_id', uid).eq('week_of', wk).maybeSingle(),
      supabase.from('user_habit_completions').select('done_on').eq('user_id', uid).gte('done_on', wk).lte('done_on', wkEnd),
    ]);
    const days = new Set();
    (snaps.data || []).forEach((s) => { if ((s.workout_minutes || 0) > 0) days.add(s.snapshot_date); });
    (acts.data || []).forEach((a) => { days.add(String(a.started_at).slice(0, 10)); });
    return { workouts: days.size, checkin: !!(chk && chk.data), habits: (habs.data || []).length };
  } catch (e) { return { workouts: 0, checkin: false, habits: 0 }; }
}
async function setCommitment(targets, stake) {
  if (!supabase || !state.user?.id) return { ok: false };
  try {
    const { data, error } = await supabase.rpc('set_commitment', { p_user: state.user.id, p_targets: targets, p_stake: stake });
    return error ? { ok: false } : (data || { ok: false });
  } catch (e) { return { ok: false }; }
}
async function acceptCommitment(id) {
  if (!supabase || !state.user?.id || !id) return { accepted: false };
  try {
    const { data, error } = await supabase.rpc('accept_commitment', { p_id: id });
    return error ? { accepted: false } : (data || { accepted: false });
  } catch (e) { return { accepted: false }; }
}
window.ShapeCommit = { get: getCommitment, progress: getCommitmentProgress, set: setCommitment, accept: acceptCommitment };

// ── The check-in kit ─────────────────────────────────────────
// Weekly check-ins, girth measurements, structured progress photos, and the
// required health profile (PAR-Q+ screening). Tables are owner-RLS'd with
// coach read via is_coach_on_client; photo files ride the PRIVATE bucket via
// /api/client/progress-photos. Coach reads go through SECURITY DEFINER RPCs.
function bsWeekOfMonday(d = new Date()) {
  const dt = new Date(d);
  dt.setDate(dt.getDate() - ((dt.getDay() + 6) % 7)); // back to Monday
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
async function checkinSubmit({ ratings = {}, wins = '', struggles = '', question = '', weight = null, unit = 'kg' } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to check in.');
  const w = Number(weight);
  const row = {
    user_id: state.user.id,
    week_of: bsWeekOfMonday(),
    ratings,
    wins: wins || null,
    struggles: struggles || null,
    question: question || null,
    weight: Number.isFinite(w) && w > 0 ? w : null,
    unit,
  };
  const { data, error } = await supabase.from('client_checkins')
    .upsert(row, { onConflict: 'user_id,week_of' }).select().maybeSingle();
  if (error) throw error;
  // Shape Score: +15 for the weekly check-in (idempotent — once per week, via
  // auth.uid() in the RPC). Best-effort; no-ops until the awards migration runs.
  try { await supabase.rpc('award_checkin_points', { p_week_of: row.week_of }); } catch (e) {}
  invalidateClientMetrics();
  return data;
}
async function checkinMine(limit = 8) {
  if (!supabase || !state.user?.id) return [];
  const { data } = await supabase.from('client_checkins').select('*')
    .eq('user_id', state.user.id).order('week_of', { ascending: false }).limit(limit);
  return data || [];
}
window.ShapeCheckins = { submit: checkinSubmit, mine: checkinMine, weekOf: bsWeekOfMonday };

async function measurementsLog(entries = [], { unit = 'cm', date = null } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in first.');
  const day = date || _localDate();
  const rows = (entries || [])
    .filter((e) => e && e.site && Number.isFinite(Number(e.value)) && Number(e.value) > 0)
    .map((e) => ({ user_id: state.user.id, measured_on: day, site: e.site, value: Number(e.value), unit: e.unit || unit }));
  if (!rows.length) return [];
  const { data, error } = await supabase.from('client_measurements')
    .upsert(rows, { onConflict: 'user_id,measured_on,site' }).select();
  if (error) throw error;
  return data || [];
}
async function measurementsMine() {
  if (!supabase || !state.user?.id) return [];
  const { data } = await supabase.from('client_measurements').select('*')
    .eq('user_id', state.user.id).order('measured_on', { ascending: true });
  return data || [];
}
window.ShapeMeasurements = { log: measurementsLog, mine: measurementsMine };

async function progressPhotosMine() {
  return getJsonOrDefault(`${apiBaseUrl || ''}/api/client/progress-photos`, [], (d) => (Array.isArray(d.photos) ? d.photos : []));
}
async function progressPhotoUpload(file, { pose = 'front', takenOn = null } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in first.');
  const fd = new FormData();
  fd.append('photo', file);
  fd.append('pose', pose);
  if (takenOn) fd.append('takenOn', takenOn);
  const res = await fetch(`${apiBaseUrl || ''}/api/client/progress-photos`, {
    method: 'POST', credentials: 'same-origin', headers: sessionsAuthHeaders(), body: fd,
  });
  const d = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(d.error || 'Upload failed');
  return d.photo;
}
window.ShapeProgressPhotos = { mine: progressPhotosMine, upload: progressPhotoUpload };

async function healthProfileGet() {
  try { return window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('health_profile') : null; } catch (e) { return null; }
}
async function healthProfileSet(doc) {
  try { await window.shapeDb?.saveUserGoals?.('health_profile', doc); return true; } catch (e) { return false; }
}
window.ShapeHealthProfile = { get: healthProfileGet, set: healthProfileSet };

// Coach-side reads for a linked client (RPCs gate on is_coach_on_client; the
// health profile is deliberately NOT share-gated — liability screening).
window.ShapeClientKit = {
  checkins: async (userId, limit = 6) => { if (!supabase) return []; try { const { data } = await supabase.rpc('get_client_checkins', { p_user_id: userId, p_limit: limit }); return Array.isArray(data) ? data : []; } catch (e) { return []; } },
  measurements: async (userId) => { if (!supabase) return []; try { const { data } = await supabase.rpc('get_client_measurements', { p_user_id: userId }); return Array.isArray(data) ? data : []; } catch (e) { return []; } },
  photos: async (userId, limit = 30) => { if (!supabase) return []; try { const { data } = await supabase.rpc('get_client_progress_photos', { p_user_id: userId, p_limit: limit }); return Array.isArray(data) ? data : []; } catch (e) { return []; } },
  health: async (userId) => { if (!supabase) return null; try { const { data } = await supabase.rpc('get_client_health_profile', { p_user_id: userId }); return data || null; } catch (e) { return null; } },
};

window.ShapeMessages = {
  getOrCreateDirectConversation,
  getOrCreateMemberConversation,
  sendMessage,
  sendProviderMessage,
  listDirectCoachThreads,
  listMemberThreads,
  subscribeMessages: subscribeDirectMessages,
};

// Upload a feed photo to the public `community-photos` bucket (own <uid>/ folder,
// gated by storage RLS) and return its public URL. Used by the feed + profile
// photo-post composers; the URL rides on the post's photo_url column.
async function uploadCommunityPhoto(file) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to add a photo.');
  if (!file) throw new Error('No photo selected.');
  const ext = ((file.type && file.type.split('/')[1]) || 'jpg').replace(/[^a-z0-9]/gi, '') || 'jpg';
  const path = `${state.user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
  const { error } = await supabase.storage.from('community-photos').upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
  if (error) throw error;
  const { data } = supabase.storage.from('community-photos').getPublicUrl(path);
  return data?.publicUrl || null;
}

// All posts by one author (for the profile "Personal activities" feed) — newest
// first, optionally only those carrying a photo.
async function listCommunityPostsByAuthor(authorId, { withPhotoOnly = false } = {}) {
  if (!supabase || !authorId) return { stored: 'local', data: [] };
  let q = supabase.from('community_posts').select(COMMUNITY_POST_SELECT).eq('author_id', authorId).order('created_at', { ascending: false }).limit(40);
  if (withPhotoOnly) q = q.not('photo_url', 'is', null);
  const { data, error } = await q;
  if (error) return { stored: 'local', data: [], error };
  return { stored: 'supabase', data: (data || []).map(communityPostFromRow) };
}

// Visible-post count for a profile's "Posts" stat (RLS-scoped, so it matches
// what the viewer can actually see on that person's activity feed).
async function countCommunityPostsByAuthor(authorId) {
  if (!supabase || !authorId) return null;
  const { count, error } = await supabase.from('community_posts').select('id', { count: 'exact', head: true }).eq('author_id', authorId);
  if (error) return null;
  return count ?? 0;
}

// Retroactive tightening: when the member's share level gets STRICTER, every
// past auto-post (device + in-app: source_provider is not null) drops to the
// new level. Loosening never touches history (never surprise-publish), and
// manual composer posts (null source_provider) are never touched.
async function tightenAutoPosts(newPrivacy) {
  if (!supabase || !state.user?.id) return { ok: false };
  const looser = newPrivacy === 'private' ? ['public', 'community', 'followers']
    : newPrivacy === 'followers' ? ['public', 'community'] : [];
  if (!looser.length) return { ok: true, updated: 0 };
  const { error } = await supabase
    .from('community_posts')
    .update({ privacy: newPrivacy })
    .eq('author_id', state.user.id)
    .not('source_provider', 'is', null)
    .in('privacy', looser);
  return { ok: !error };
}

window.ShapeCommunity = {
  listPosts: listCommunityPosts,
  listByAuthor: listCommunityPostsByAuthor,
  countByAuthor: countCommunityPostsByAuthor,
  createPost: createCommunityPost,
  update: updateCommunityPost,
  remove: deleteCommunityPost,
  uploadPhoto: uploadCommunityPhoto,
  toggleLike: toggleCommunityLike,
  addComment: addCommunityComment,
  tightenAutoPosts,
};
// The share rule + rank, bridged for the Settings page + the live session's
// share-toggle seed (the client module can't import service modules directly).
window.ShapeWorkoutShare = { rule: bsWorkoutSharePrivacy, rank: BS_PRIVACY_RANK };

// ─── Shape Radio song social (shared like/dislike + comments) ────────────────
// A "song" has no stable id, so the key is the client's normalized title::artist
// composite. Reads are public (anyone sees counts); writes require sign-in — all
// three go through SECURITY DEFINER RPCs (2026-07-20-radio-song-social.sql), so
// the tables stay forge-proof and the author name is resolved server-side.
// Every call degrades to a neutral empty state pre-migration / signed-out, never
// throwing on the read path.
const RADIO_SOCIAL_EMPTY = { up: 0, down: 0, myVote: null, commentCount: 0, comments: [] };
function normRadioSocial(d) {
  if (!d || typeof d !== 'object') return { ...RADIO_SOCIAL_EMPTY };
  return {
    up: Number(d.up) || 0,
    down: Number(d.down) || 0,
    myVote: d.myVote === 'up' || d.myVote === 'down' ? d.myVote : null,
    commentCount: Number(d.commentCount) || 0,
    comments: Array.isArray(d.comments) ? d.comments : [],
  };
}
async function getRadioSongSocial(songKey) {
  if (!supabase || !songKey) return { ...RADIO_SOCIAL_EMPTY };
  try {
    const { data, error } = await supabase.rpc('get_radio_song_social', { p_song_key: songKey });
    if (error) return { ...RADIO_SOCIAL_EMPTY };   // pre-migration → neutral, never an error
    return normRadioSocial(data);
  } catch (e) { return { ...RADIO_SOCIAL_EMPTY }; }
}
async function setRadioSongVote(songKey, vote) {
  if (!state.user?.id) throw new Error('Sign in to react to a song.');
  if (!songKey) throw new Error('No song is playing.');
  if (!supabase) return { ...RADIO_SOCIAL_EMPTY };
  const { data, error } = await supabase.rpc('set_radio_song_vote', { p_song_key: songKey, p_vote: vote ?? null });
  if (error) throw error;
  return normRadioSocial(data);
}
async function addRadioSongComment(songKey, body) {
  if (!state.user?.id) throw new Error('Sign in to comment on a song.');
  const clean = String(body || '').trim();
  if (!songKey || !clean) throw new Error('A song and a comment are required.');
  if (!supabase) return { ...RADIO_SOCIAL_EMPTY };
  const { data, error } = await supabase.rpc('add_radio_song_comment', { p_song_key: songKey, p_body: clean });
  if (error) throw error;
  return normRadioSocial(data);
}
window.ShapeRadioSong = { get: getRadioSongSocial, vote: setRadioSongVote, comment: addRadioSongComment };

// Public profile card + batch tier points (for chat avatars / profile page).
async function getPublicProfile(userId) {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase.rpc('get_public_profile', { p_user_id: userId });
  if (error) return null;
  const r = Array.isArray(data) ? data[0] : data;
  if (!r) return null;
  return { userId: r.user_id, name: r.full_name, role: r.role, points: Number(r.points) || 0, bio: r.bio || '', pronouns: r.pronouns || '', goal: r.goal || '', link: r.link || '', avatar: r.avatar || null, visibility: r.visibility, custom: r.custom || null };
}
async function getUserPoints(ids) {
  const list = (ids || []).filter(Boolean);
  if (!supabase || !list.length) return {};
  const { data, error } = await supabase.rpc('get_user_points', { p_ids: list });
  if (error) return {};
  const out = {};
  (data || []).forEach(r => { out[r.user_id] = Number(r.points) || 0; });
  return out;
}
// Batch member avatars (profile photos) for chat/feed avatars. Reads
// get_public_profile per unique id (visibility-gated) and caches the result so
// repeat lookups across the feed/threads are free. Returns { userId: dataUrl }.
const _avatarCache = {};
async function getUserAvatars(ids) {
  const list = [...new Set((ids || []).filter(Boolean))];
  if (!supabase || !list.length) return {};
  const need = list.filter((id) => !(id in _avatarCache));
  if (need.length) {
    await Promise.all(need.map(async (id) => {
      try {
        const { data } = await supabase.rpc('get_public_profile', { p_user_id: id });
        const r = Array.isArray(data) ? data[0] : data;
        _avatarCache[id] = (r && r.avatar) || null;
      } catch { _avatarCache[id] = null; }
    }));
  }
  const out = {};
  list.forEach((id) => { if (_avatarCache[id]) out[id] = _avatarCache[id]; });
  return out;
}
window.ShapeProfiles = { getPublicProfile, getUserPoints, getUserAvatars };

// Progress hub — the same rollups the website Progress / Train / Nutrition pages
// read (KPIs, trend series, PRs, volume, macros). Each returns null on no-data so
// the mobile screen can fall back to its demo shape.
async function getClientProgress() { return cachedClientJson('/api/client/progress').then((d) => (d && d.ok ? d : null)); }
async function getClientAnalytics() { return cachedClientJson('/api/client/analytics').then((d) => (d && d.has_data ? d : null)); }
async function getClientTrain() { return cachedClientJson('/api/client/train').then((d) => (d && d.ok ? d : null)); }
async function getClientNutrition() { return cachedClientJson('/api/client/nutrition').then((d) => (d && d.ok ? d : null)); }
async function getClientHabits() { return cachedClientJson('/api/client/habits'); }
window.ShapeProgress = { progress: getClientProgress, analytics: getClientAnalytics, train: getClientTrain, nutrition: getClientNutrition };

// Member self-path weekend adherence split. Fetches the already-cached habits +
// progress payloads, builds weekly buckets client-side, and returns the split.
// Returns null on any error so the Weekends card renders nothing.
async function weekendSplitSelf() {
  try {
    const [habits, progress] = await Promise.all([getClientHabits(), getClientProgress()]);
    // device-local calendar day as YYYY-MM-DD (en-CA renders ISO order); no
    // cross-package import of local-day.ts needed.
    const todayLocal = new Date().toLocaleDateString('en-CA');
    const buckets = buildSelfWeekendBuckets(habits || { habits: [] }, progress || { series: {} }, { todayLocal });
    return computeWeekendSplit(buckets);
  } catch { return null; }
}
window.ShapeProgress = { ...(window.ShapeProgress || {}), weekendSplit: weekendSplitSelf };
async function getClientStrength() { return cachedClientJson('/api/client/strength').then((d) => (d && d.ok ? d : null)); }
window.ShapeStrength = { get: getClientStrength };

// Coach sigil rings — live { habits, clientWorkouts, ownActivity } (0..1 or null)
// for the signed-in coach (self only; RLS-scoped). Null fields fall back to demo.
async function getCoachRings() { return getJsonOrDefault(`${apiBaseUrl || ''}/api/coach/rings`, null, (d) => (d && d.isCoach ? d : null)); }
window.ShapeCoachRings = { get: getCoachRings };

// Follower / following graph (public profiles). stats → counts + my state;
// toggle → follow/unfollow; list → the followers/following names.
// A shared cache + `shape:follows` event keep every on-screen count in sync —
// the same uid shows the same number on the Me tab, Settings, and any profile,
// and a follow/unfollow anywhere live-updates them all (including the other
// member's follower count).
const _followCache = {};
function _emitFollows(uids) { try { window.dispatchEvent(new CustomEvent('shape:follows', { detail: { uids: (uids || []).filter(Boolean) } })); } catch (e) {} }
function _followShape(r) { return { followers: Number(r?.followers) || 0, following: Number(r?.following) || 0, isFollowing: !!r?.is_following, isPending: !!r?.is_pending }; }
async function getFollowStats(userId) {
  if (!supabase || !userId) return { followers: 0, following: 0, isFollowing: false, isPending: false };
  const { data, error } = await supabase.rpc('get_follow_stats', { p_user_id: userId });
  if (error) return _followCache[userId] || { followers: 0, following: 0, isFollowing: false, isPending: false };
  const out = _followShape(Array.isArray(data) ? data[0] : data);
  _followCache[userId] = out;
  return out;
}
async function toggleFollow(userId) {
  if (!supabase || !userId) throw new Error('Sign in to follow.');
  const { data, error } = await supabase.rpc('toggle_follow', { p_user_id: userId });
  if (error) throw new Error(error.message || 'Could not update follow.');
  const out = _followShape(Array.isArray(data) ? data[0] : data);
  _followCache[userId] = out;
  // My own "following" count just changed too — refresh my cached stats so the
  // Me tab / Settings counts stay in sync, then notify both affected users.
  const myId = state.user && state.user.id;
  if (myId && myId !== userId) { try { await getFollowStats(myId); } catch (e) {} }
  _emitFollows([userId, myId]);
  return out;
}
async function listFollows(userId, kind) {
  if (!supabase || !userId) return [];
  const { data, error } = await supabase.rpc('get_follow_list', { p_user_id: userId, p_kind: kind === 'following' ? 'following' : 'followers' });
  if (error) return [];
  return (data || []).map((r) => ({ userId: r.user_id, name: r.full_name || 'Shape member', role: r.role || 'client' }));
}
// Pending follow requests TO me (people who asked to follow my private profile).
async function listFollowRequests() {
  if (!supabase || !state.user?.id) return [];
  const { data, error } = await supabase.rpc('list_follow_requests');
  if (error) return [];
  return (data || []).map((r) => ({ userId: r.user_id, name: r.full_name || 'Shape member', role: r.role || 'client' }));
}
// Accept (true) or decline (false) a pending request from followerId.
async function respondFollowRequest(followerId, accept) {
  if (!supabase || !followerId) throw new Error('Sign in.');
  const { error } = await supabase.rpc('respond_follow_request', { p_follower_id: followerId, p_accept: !!accept });
  if (error) throw new Error(error.message || 'Could not respond.');
  const myId = state.user && state.user.id;
  if (myId) { try { await getFollowStats(myId); } catch (e) {} }
  _emitFollows([myId, followerId]);
  return true;
}
// "Who to follow" suggestions — members you don't already follow, ranked.
async function getFollowSuggestions(limit = 20) {
  if (!supabase || !state.user?.id) return [];
  const { data, error } = await supabase.rpc('get_follow_suggestions', { p_limit: limit });
  if (error) return [];
  return (data || []).map((r) => ({ userId: r.user_id, name: r.full_name || 'Shape member', role: r.role || 'client', followers: Number(r.followers) || 0, followsMe: !!r.follows_me, mutuals: Number(r.mutuals) || 0 }));
}
window.ShapeFollows = { stats: getFollowStats, toggle: toggleFollow, list: listFollows, requests: listFollowRequests, respond: respondFollowRequest, suggestions: getFollowSuggestions, getCached: (uid) => (uid && _followCache[uid]) || null };

// ── Member-created community channels ("run club" style) ─────────────────────
function channelDisplayName() {
  return (state.profile && (state.profile.full_name || state.profile.fullName))
    || (state.user && (state.user.user_metadata?.full_name || state.user.email))
    || 'Member';
}
async function listChannels() {
  if (!supabase || !state.user?.id) return { stored: 'local', data: [] };
  const uid = state.user.id;
  const { data: channels, error } = await supabase
    .from('channels')
    .select('id, name, description, created_by, visibility, last_message, last_message_at, created_at')
    .order('last_message_at', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw error;
  const ids = (channels || []).map(c => c.id);
  let members = [];
  if (ids.length) {
    const { data: mem } = await supabase.from('channel_members').select('channel_id, user_id, role, pinned').in('channel_id', ids);
    members = mem || [];
  }
  const byChannel = {};
  members.forEach(m => { (byChannel[m.channel_id] = byChannel[m.channel_id] || []).push(m); });
  const rows = (channels || []).map(c => {
    const ms = byChannel[c.id] || [];
    const mine = ms.find(m => m.user_id === uid);
    return {
      id: c.id, name: c.name, description: c.description || '',
      memberCount: ms.length,
      joined: !!mine,
      isHost: (mine && mine.role === 'host') || c.created_by === uid,
      private: c.visibility === 'private',
      pinned: !!(mine && mine.pinned),
      last: c.last_message || '', lastAt: c.last_message_at,
    };
  });
  rows.sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0)); // pinned first; stable otherwise
  return { stored: 'supabase', data: rows };
}
async function createChannel({ name, description, visibility } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to create a channel.');
  const { data, error } = await supabase.rpc('create_channel', { p_name: name, p_description: description || null, p_visibility: visibility === 'private' ? 'private' : 'public' });
  if (error) throw error;
  return { stored: 'supabase', data };
}
async function pinChannel(channelId, pinned) {
  if (!supabase || !state.user?.id) throw new Error('Sign in.');
  const { error } = await supabase.rpc('set_channel_pinned', { p_channel_id: channelId, p_pinned: !!pinned });
  if (error) throw error;
  return { ok: true };
}
async function joinChannel(channelId) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to join.');
  const { error } = await supabase.from('channel_members').insert({ channel_id: channelId, user_id: state.user.id, role: 'member' });
  if (error && !/duplicate|conflict/i.test(error.message || '')) throw error;
  return { ok: true };
}
async function leaveChannel(channelId) {
  if (!supabase || !state.user?.id) throw new Error('Sign in.');
  const { error } = await supabase.from('channel_members').delete().eq('channel_id', channelId).eq('user_id', state.user.id);
  if (error) throw error;
  return { ok: true };
}
async function addChannelMember({ channelId, userId } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in.');
  const { error } = await supabase.from('channel_members').insert({ channel_id: channelId, user_id: userId, role: 'member' });
  if (error && !/duplicate|conflict/i.test(error.message || '')) throw error;
  return { ok: true };
}
async function searchChannelMembers(q = '') {
  if (!supabase || !state.user?.id) return { data: [] };
  const { data, error } = await supabase.rpc('search_members', { p_q: q || '' });
  if (error) throw error;
  return { data: (data || []).map(m => ({ id: m.id, name: m.full_name || 'Member' })) };
}
async function listChannelMessages(channelId) {
  if (!supabase || !state.user?.id || !channelId) return { stored: 'local', data: [] };
  const { data, error } = await supabase
    .from('channel_messages')
    .select('id, sender_id, author_name, body, created_at')
    .eq('channel_id', channelId)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) throw error;
  return {
    stored: 'supabase',
    data: (data || []).map(m => ({
      who: m.sender_id === state.user.id ? 'You' : (m.author_name || 'Member'),
      t: m.body, time: 'synced', me: m.sender_id === state.user.id,
    })),
  };
}
async function sendChannelMessage({ channelId, body } = {}) {
  if (!supabase || !state.user?.id) throw new Error('Sign in to post.');
  const clean = String(body || '').trim();
  if (!clean) throw new Error('Message is empty.');
  const { data, error } = await supabase
    .from('channel_messages')
    .insert({ channel_id: channelId, sender_id: state.user.id, author_name: channelDisplayName(), body: clean })
    .select('id')
    .maybeSingle();
  if (error) throw error;
  return { stored: 'supabase', data };
}
let _rtSeq = 0;
function _rtTopic(base) { return `${base}:${state.user?.id || 'anon'}:${Date.now().toString(36)}-${(++_rtSeq).toString(36)}`; }
function subscribeChannelMessages(onInsert) {
  if (!supabase) return () => {};
  // Unique topic per subscriber — Supabase reuses a channel by topic name, and
  // calling .on() on an already-subscribed channel throws.
  const channel = supabase
    .channel(_rtTopic('rt-channel-messages'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'channel_messages' },
      (payload) => { try { onInsert?.(payload.new); } catch (e) {} })
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
}
function subscribeDirectMessages(onInsert) {
  if (!supabase) return () => {};
  const channel = supabase
    .channel(_rtTopic('rt-direct-messages'))
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' },
      (payload) => { try { onInsert?.(payload.new); } catch (e) {} })
    .subscribe();
  return () => { try { supabase.removeChannel(channel); } catch (e) {} };
}
window.ShapeChannels = {
  list: listChannels,
  create: createChannel,
  join: joinChannel,
  leave: leaveChannel,
  addMember: addChannelMember,
  searchMembers: searchChannelMembers,
  listMessages: listChannelMessages,
  sendMessage: sendChannelMessage,
  subscribeMessages: subscribeChannelMessages,
  pin: pinChannel,
};

// ── Universal search — every account on Shape (members + coaches) ────────────
// `search_shape_people` returns role + profile photo + all-time points in one
// call; falls back to the older `search_members` RPC (names only) when the
// migration hasn't been applied yet.
async function searchShapePeople(q = '', limit = 20) {
  if (!supabase || !state.user?.id) return [];
  try {
    const { data, error } = await supabase.rpc('search_shape_people', { p_q: q || '', p_limit: limit });
    if (error) throw error;
    return (data || []).map(p => ({ userId: p.id, name: p.full_name || 'Member', role: p.role || 'client', avatar: p.avatar || null, points: p.points != null ? Number(p.points) : null }));
  } catch (e) {
    const { data } = await supabase.rpc('search_members', { p_q: q || '' });
    return (data || []).map(p => ({ userId: p.id, name: p.full_name || 'Member', role: 'client', avatar: null, points: null }));
  }
}
window.ShapeSearch = { people: searchShapePeople };

// Resolve a provider row (trainers/nutritionists) to its owner auth user — lets
// "Coached by" chips link to the coach's live public profile.
async function coachOwnerOf(providerId, role) {
  if (!supabase || !providerId) return null;
  try {
    const table = role === 'nutritionist' ? 'nutritionists' : 'trainers';
    const { data } = await supabase.from(table).select('owner_id').eq('id', providerId).maybeSingle();
    return (data && data.owner_id) || null;
  } catch (e) { return null; }
}
// The signed-in coach's OWN marketplace identity (their provider row) — the
// add-client invite stamps role + provider id so the invite card in the
// member's chat can open the coach's Listing. Pass the roster's role so a
// dual-role account resolves the MATCHING provider row (a nutritionist invite
// must never carry a trainer id); with no role it falls back to whichever row
// exists. Null when the account has no provider row yet (application not
// approved / listing not published).
async function myCoachIdentity(role = null) {
  if (!supabase || !state.user?.id) return null;
  const roles = role === 'trainer' || role === 'nutritionist' ? [role] : ['trainer', 'nutritionist'];
  for (const r of roles) {
    try {
      const table = r === 'nutritionist' ? 'nutritionists' : 'trainers';
      const { data } = await supabase.from(table).select('id, name').eq('owner_id', state.user.id).limit(1).maybeSingle();
      if (data && data.id != null) return { role: r, providerId: Number(data.id), name: data.name || '' };
    } catch (e) { /* next role */ }
  }
  return null;
}
window.ShapeCoachLookup = { ownerOf: coachOwnerOf, mine: myCoachIdentity };

// ── BYO coach referrals (spec #1789 · rails #1794) ──────────────────────────
// The origin ledger's two coach-side writes. Both are auth.uid()-validated
// DEFINER RPCs (ownership checked in-body); both DEGRADE quietly pre-migration
// or on failure so the add-client sheet stays usable and can say so honestly.
async function coachReferralForClient(role, providerId, clientId) {
  if (!supabase || !state.user?.id || !providerId || !clientId) return { ok: false, reason: 'unavailable' };
  try {
    const { error } = await supabase.rpc('create_coach_referral', {
      p_provider_role: role, p_provider_id: providerId, p_client_id: clientId,
    });
    if (error) return { ok: false, reason: error.message || 'failed' };
    return { ok: true };
  } catch (e) { return { ok: false, reason: (e && e.message) || 'failed' }; }
}
async function coachReferralLink(role, providerId) {
  if (!supabase || !state.user?.id || !providerId) return null;
  try {
    const { data, error } = await supabase.rpc('create_coach_referral_link', {
      p_provider_role: role, p_provider_id: providerId,
    });
    if (error) return null;
    return data || null; // the durable ?ref= token (uuid) — one per provider, reused
  } catch (e) { return null; }
}
window.ShapeReferrals = { forClient: coachReferralForClient, link: coachReferralLink };

// ─── Adjust → full program regeneration (spec #1707) ─────────────────────────
// On the coach Adjust page's Apply, the trainer's adjustment rewrites the
// client's REAL upcoming rows so every surface reads the same adjusted plan.
// The pure planner (adjustRegen.mjs) decides WHAT changes; the transactional
// regenerate_client_workouts RPC applies it atomically (never both plans,
// never zero). Pre-migration (RPC absent) this degrades to detail+note only.
async function applyAdjustRegeneration({ clientId, adjustment } = {}) {
  if (!supabase || !state.user?.id || !clientId) return { changed: false, degraded: true };
  // Next generation from the client's program record (coach-readable).
  let gen = 1;
  try {
    const { data } = await supabase.from('client_programs').select('detail').eq('user_id', clientId).maybeSingle();
    gen = (Number(data?.detail?.training?.gen) || 0) + 1;
  } catch (e) { /* first generation */ }
  // RLS scopes this read to the caller's own authored rows for this client.
  const { data: rows, error: readErr } = await supabase
    .from('client_workouts')
    .select('id, title, description, kind, payload, playlist_id, scheduled_date')
    .eq('client_id', clientId)
    .not('trainer_id', 'is', null)
    .eq('status', 'published')
    .limit(400);
  if (readErr) throw readErr;
  // UTC date — matches the RPC's strictly-future validation basis.
  const todayISO = new Date().toISOString().slice(0, 10);
  const plan = bsAdjustRegen({ rows: rows || [], adjustment, todayISO, gen });
  if (!plan.changed) return { changed: false, gen: gen - 1 };
  const { data, error } = await supabase.rpc('regenerate_client_workouts', {
    p_client_id: clientId,
    p_delete_ids: plan.deleteIds,
    p_inserts: plan.inserts,
    p_repeat_patches: plan.repeatPatches,
  });
  if (error) {
    // RPC not deployed yet — honest degrade to today's detail+note behavior.
    if (error.code === 'PGRST202' || error.code === '42883') return { changed: false, degraded: true };
    throw error;
  }
  return { changed: true, gen, capped: !!plan.capped, result: data || null };
}
window.ShapeAdjustRegen = { apply: applyAdjustRegeneration };

// ── Unread manager — app-wide so the Chat-tab badge + per-row badges work even
//    when the chat screen isn't mounted. Seeds persisted counts, then keeps a
//    live map via realtime. Keys: `ch:<id>` / `dm:<id>`.
const _unread = { map: {}, started: false, listeners: new Set(), myChannels: new Set(), subs: [] };
function _unreadEmit() { _unread.listeners.forEach(fn => { try { fn(_unread.map); } catch (e) {} }); }
// Logged-out demo seed so the Chat-tab badge + per-row badges work in the
// marketing state, for every profile. Keys match the sample channels/DMs the
// feed renders, so opening a thread clears its badge just like live data.
const _DEMO_UNREAD = { 'ch:sample-shapehq': 2, 'ch:sample-runclub': 1, 'dm:demo-sofia': 2 };
function seedDemoUnread() {
  if (_unread.started || _unread.demoSeeded) return;
  _unread.demoSeeded = true;
  Object.assign(_unread.map, _DEMO_UNREAD);
  _unreadEmit();
}
async function startUnread() {
  if (_unread.started || !supabase || !state.user?.id) return;
  _unread.started = true;
  // Drop any demo seed once real data takes over.
  if (_unread.demoSeeded) { _unread.map = {}; _unread.demoSeeded = false; }
  try { const ch = await listChannels(); (ch.data || []).forEach(c => { if (c.joined) _unread.myChannels.add(c.id); }); } catch (e) {}
  try { const { data } = await supabase.rpc('channel_unread'); (data || []).forEach(r => { _unread.map['ch:' + r.channel_id] = Number(r.unread) || 0; }); } catch (e) {}
  try { const { data } = await supabase.rpc('dm_unread'); (data || []).forEach(r => { _unread.map['dm:' + r.conversation_id] = Number(r.unread) || 0; }); } catch (e) {}
  _unreadEmit();
  _unread.subs.push(subscribeChannelMessages((row) => {
    if (!row || row.sender_id === state.user?.id || !_unread.myChannels.has(row.channel_id)) return;
    const k = 'ch:' + row.channel_id; _unread.map[k] = (_unread.map[k] || 0) + 1; _unreadEmit();
  }));
  _unread.subs.push(subscribeDirectMessages((row) => {
    if (!row || row.sender_id === state.user?.id) return;
    const k = 'dm:' + row.conversation_id; _unread.map[k] = (_unread.map[k] || 0) + 1; _unreadEmit();
  }));
}
window.ShapeUnread = {
  start: startUnread,
  seedDemo: seedDemoUnread,
  all: () => _unread.map,
  get: (kind, id) => _unread.map[(kind === 'channel' ? 'ch:' : 'dm:') + id] || 0,
  total: () => Object.values(_unread.map).reduce((a, b) => a + (b || 0), 0),
  onChange: (cb) => { _unread.listeners.add(cb); return () => _unread.listeners.delete(cb); },
  noteChannel: (id) => { if (id) _unread.myChannels.add(id); },
  markChannelRead: (id) => { _unread.map['ch:' + id] = 0; _unread.myChannels.add(id); _unreadEmit(); if (supabase) supabase.rpc('mark_channel_read', { p_channel_id: id }).then(() => {}).catch(() => {}); },
  markConversationRead: (id) => { _unread.map['dm:' + id] = 0; _unreadEmit(); if (supabase) supabase.rpc('mark_conversation_read', { p_conversation_id: id }).then(() => {}).catch(() => {}); },
};

// ── Live presence — "N online now". Everyone with the app open joins one
//    Supabase Realtime presence channel keyed by user id; the count is the
//    number of distinct present users (genuinely live, updates on join/leave).
const _presence = { channel: null, count: 0, ids: new Set(), visible: true, listeners: new Set() };
function _presenceEmit() {
  _presence.listeners.forEach(fn => { try { fn(_presence.count); } catch (e) {} });
  try { window.dispatchEvent(new Event('shape:presence')); } catch (e) {}
}
function _presencePayload() {
  return { online_at: new Date().toISOString() };
}
function startPresence() {
  if (_presence.channel || !supabase || !state.user?.id) return;
  // Respect the "show when I'm online" preference seeded on window.
  try { if (window.ShapeOnlineVisible === false) _presence.visible = false; } catch (e) {}
  const ch = supabase.channel('online-users', { config: { presence: { key: state.user.id } } });
  ch.on('presence', { event: 'sync' }, () => {
    try { const st = ch.presenceState() || {}; _presence.ids = new Set(Object.keys(st).map(String)); _presence.count = _presence.ids.size; } catch (e) { _presence.ids = new Set(); _presence.count = 0; }
    _presenceEmit();
  }).subscribe(async (status) => {
    if (status === 'SUBSCRIBED' && _presence.visible) { try { await ch.track(_presencePayload()); } catch (e) {} }
  });
  _presence.channel = ch;
}
// ── Live activity ("doing right now") — DB-backed so it PERSISTS across screen
//    changes / app backgrounding and only clears when the user ends it. Source of
//    truth is the user_activity table (+ realtime); presence stays for "online".
const _activity = { map: new Map(), mine: null, channel: null, started: false };
function _activityEmit() { try { window.dispatchEvent(new Event('shape:presence')); } catch (e) {} }
async function startActivity() {
  if (_activity.started || !supabase || !state.user?.id) return;
  _activity.started = true;
  // Hydrate the currently-active set in one call.
  try {
    const { data } = await supabase.rpc('get_active_activities');
    const m = new Map();
    (data || []).forEach((r) => { if (r && r.user_id && r.kind) m.set(String(r.user_id), r.kind); });
    _activity.map = m;
    _activity.mine = m.get(String(state.user.id)) || null;
    try { window.ShapeMyActivity = _activity.mine; } catch (e) {}
  } catch (e) {}
  // Keep it live as people start/stop.
  try {
    const ch = supabase.channel('user-activity')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_activity' }, (payload) => {
        const row = payload.new && payload.new.user_id ? payload.new : payload.old;
        if (!row || !row.user_id) return;
        const uid = String(row.user_id);
        if (payload.eventType === 'DELETE') _activity.map.delete(uid);
        else if (row.kind) _activity.map.set(uid, row.kind);
        if (uid === String(state.user.id)) { _activity.mine = _activity.map.get(uid) || null; try { window.ShapeMyActivity = _activity.mine; } catch (e) {} }
        _activityEmit();
      })
      .subscribe();
    _activity.channel = ch;
  } catch (e) {}
  _activityEmit();
}
// Set what I'm doing right now ('workout' | 'cooking' | null). Persists to the DB
// (others see the dot live via realtime) until explicitly cleared with null.
async function setActivity(kind) {
  const k = (kind === 'workout' || kind === 'cooking') ? kind : null;
  if (_activity.mine === k) return;
  _activity.mine = k;
  try { window.ShapeMyActivity = k; } catch (e) {}
  if (state.user?.id) { const uid = String(state.user.id); if (k) _activity.map.set(uid, k); else _activity.map.delete(uid); }
  _activityEmit();
  if (!supabase || !state.user?.id) return;
  try {
    if (k) {
      const now = new Date();
      await supabase.from('user_activity').upsert({ user_id: state.user.id, kind: k, started_at: now.toISOString(), expires_at: new Date(now.getTime() + 6 * 3600 * 1000).toISOString() }, { onConflict: 'user_id' });
    } else {
      await supabase.from('user_activity').delete().eq('user_id', state.user.id);
    }
  } catch (e) {}
}
// Toggle whether I broadcast my presence (others see me online). Off → untrack;
// I still receive others' presence (so I can see who's online) but don't appear.
function setPresenceVisible(v) {
  _presence.visible = !!v;
  try { window.ShapeOnlineVisible = !!v; } catch (e) {}
  const ch = _presence.channel;
  if (!ch) { if (v) startPresence(); return; }
  try { if (v) ch.track(_presencePayload()); else ch.untrack(); } catch (e) {}
}
window.ShapePresence = {
  start: startPresence,
  count: () => _presence.count,
  ids: () => Array.from(_presence.ids),
  isOnline: (uid) => !!uid && _presence.ids.has(String(uid)),
  setVisible: setPresenceVisible,
  setActivity: setActivity,
  activityOf: (uid) => (uid ? (_activity.map.get(String(uid)) || null) : null),
  // What a member is doing right now + since when (user_activity is
  // authenticated-read) — powers the live-boost sheet's "N min in" line.
  // null when they're not mid-activity (or the row already expired).
  activityDetail: async (uid) => {
    if (!supabase || !uid) return null;
    try {
      const { data } = await supabase.from('user_activity').select('kind, started_at, expires_at').eq('user_id', uid).maybeSingle();
      // Only the two known kinds — unknown/malformed rows read as not-active
      // rather than fabricating a "workout" label (honest-data).
      if (!data || (data.kind !== 'workout' && data.kind !== 'cooking')) return null;
      if (data.expires_at && new Date(data.expires_at).getTime() < Date.now()) return null;
      return { kind: data.kind, startedAt: data.started_at || null };
    } catch (e) { return null; }
  },
  // Real "active now" roster (name · role · points → tier · avatar) for the
  // presence rail. Empty array when signed out / nobody active → demo fallback.
  activeNow: async (limit = 24) => {
    if (!supabase) return [];
    try { const { data } = await supabase.rpc('get_active_now', { p_limit: limit }); return Array.isArray(data) ? data : []; }
    catch (e) { return []; }
  },
  myActivity: () => _activity.mine,
  onChange: (cb) => { _presence.listeners.add(cb); return () => _presence.listeners.delete(cb); },
};

// ─── Live workout progress (spec 2026-07-18) ────────────────────────────────
// One row per member in user_activity_live; RLS enforces the audience.
// The AUDIENCE is resolved PER PUSH — deliberately NO cache (spec review:
// Codex P1 + CodeRabbit CWE-862 — a cache breaks retro-tightening inside its
// TTL, and a cached success masks a later failed read, defeating fail-closed).
// The writer's 4s throttle bounds this to one small single-row select per push.
// FAILS CLOSED: a failed read → null → clear(), never a broadcast (#1613).
// Push/clear are GENERATION-guarded so an in-flight push can never resurrect
// the row after session end (spec review: CodeRabbit race finding).
// Pre-migration degrade: any error is a silent no-op (the feature just
// doesn't exist until the OWNER applies the SQL).
// Mutations are SERIALIZED through one promise chain (review: CodeRabbit
// Critical + Codex P2). A pre-dispatch generation check alone cannot guard an
// ALREADY-DISPATCHED request: an upsert could pass the check, then land after a
// later clear() deleted the row, republishing progress after Stop/Finish or
// after a privacy withdrawal. With the queue, a clear() cannot start until the
// in-flight upsert has finished, so the delete always wins the ordering.
// The generation is still bumped on EVERY clear path (incl. the private/
// read-failed one) so a queued push that is now obsolete drops out cheaply.
let _liveGen = 0;
// The COACH row supersedes INDEPENDENTLY of the public one. _liveGen is bumped
// on every clear path INCLUDING the private/read-failed branch — correct for the
// public row (absence must win), but fatal if it also gated the coach leg: for a
// PRIVATE member every push takes that branch, so any push already queued behind
// it would drop out before writing its coachPayload and the coach row would sit
// stale until its 30-minute expiry — in precisely the private-member case this
// channel exists to serve (review: CodeRabbit). This counter is therefore bumped
// ONLY by a real session-end clear, never by a privacy withdrawal.
let _liveCoachGen = 0;
const _okUuid = (v) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
let _liveQueue = Promise.resolve();
function _liveEnqueue(fn) {
  const run = () => fn().catch(() => {});
  _liveQueue = _liveQueue.then(run, run);
  return _liveQueue;
}
async function _liveAudience() {
  let doc = null; let failed = false;
  try {
    const { data, error } = await supabase.from('user_goals').select('data')
      .eq('user_id', state.user.id).eq('kind', 'client_settings').maybeSingle();
    if (error) failed = true; else doc = (data && data.data) || null;
  } catch (e) { failed = true; }
  return bsLiveAudience(doc, failed);
}
// `fresh` = the first push of a session. It stamps started_at so a row that
// survived a crash / failed clear can't lend its OLD start time to the new
// session (the coach clock would read hours old — Codex P2). Later pushes omit
// started_at so the session's real start survives the upsert.
// `visOverride` (optional): a caller that has ALREADY resolved the audience
// passes it through instead of letting us re-read it. This exists for the
// settings-change re-push: `saveUserGoals('client_settings', …)` is
// fire-and-forget, so _liveAudience()'s read of user_goals can still see the
// OLD doc and hand back the previous, WIDER audience — which would resurrect
// the row the member just withdrew, with its payload intact (Codex P1).
// `undefined` = not supplied (resolve normally); `null` = resolved to private.
// `opts` (optional object; the 3rd positional was `visOverride` before the coach
// channel needed a second payload — an options bag rather than a 4th positional
// so neither caller has to pass `undefined` to reach the other):
//   · visOverride — a caller that has ALREADY resolved the audience passes it
//     through instead of letting us re-read it. saveUserGoals('client_settings')
//     is fire-and-forget, so _liveAudience()'s read can still see the OLD doc and
//     hand back the previous, WIDER audience — resurrecting a row the member
//     just withdrew (Codex P1). `undefined` = resolve normally; `null` = private.
//   · coachPayload — the coach-channel payload. Present → upsert the coach row;
//     absent/null → DELETE it, so a stale set of loads can never outlive the
//     state that produced them.
async function livePush(payload, fresh, opts) {
  if (!supabase || !state.user || !payload) return;
  const visOverride = opts && Object.prototype.hasOwnProperty.call(opts, 'visOverride') ? opts.visOverride : undefined;
  const coachPayload = opts ? opts.coachPayload : null;
  const gen = _liveGen;
  const cgen = _liveCoachGen;
  return _liveEnqueue(async () => {
    // Each leg is checked against its OWN generation: a superseded public write
    // must not carry the coach write down with it, or vice versa.
    const pubLive = () => gen === _liveGen;
    const coachLive = () => cgen === _liveCoachGen;
    if (!pubLive() && !coachLive()) return;    // fully superseded before we ran
    // Only the public leg needs the audience — skip the read when it is dead.
    const vis = pubLive() ? (visOverride !== undefined ? visOverride : await _liveAudience()) : null;
    if (!pubLive() && !coachLive()) return;
    const now = new Date();
    // PUBLIC row — the member's OWN share rule decides.
    if (!pubLive()) {
      /* superseded — the coach leg below still runs */
    } else if (!vis) {
      _liveGen++;                              // private/read-failed → absence
      await _livePublicDelete();
    } else {
      const row = {
        user_id: state.user.id, visibility: vis, payload,
        updated_at: now.toISOString(),
        expires_at: new Date(now.getTime() + 6 * 3600 * 1000).toISOString(),
      };
      if (fresh) row.started_at = now.toISOString();
      await supabase.from('user_activity_live').upsert(row, { onConflict: 'user_id' });
    }
    // COACH row — gated on the COACH LINK at the DB (RLS), never on the
    // member's share rule. This runs EVEN WHEN vis is null: a private member
    // still streams to her own coach, exactly as her session logs already do.
    // That is the owner-ratified decision — it changes WHEN the coach reads
    // what the log will tell them, not WHAT.
    try {
      if (!coachLive()) {
        /* a session-end clear landed while we waited — leave the row deleted */
      } else if (coachPayload) {
        const crow = {
          user_id: state.user.id, payload: coachPayload,
          updated_at: now.toISOString(),
          expires_at: new Date(now.getTime() + 30 * 60 * 1000).toISOString(),
        };
        if (fresh) crow.started_at = now.toISOString();
        await supabase.from('user_activity_live_coach').upsert(crow, { onConflict: 'user_id' });
      } else {
        // No coach payload (malformed state, or a non-workout push) must not
        // leave the old loads readable until expiry.
        await supabase.from('user_activity_live_coach').delete().eq('user_id', state.user.id);
      }
    } catch (e) { /* pre-migration: the table doesn't exist yet — degrade silently */ }
  });
}
// Public row only — used by the private-audience branch, which must NOT take
// the coach row down with it.
async function _livePublicDelete() {
  try { if (supabase && state.user) await supabase.from('user_activity_live').delete().eq('user_id', state.user.id); } catch (e) {}
}
// Session end: BOTH rows, transactionally, so a coach row can never be
// stranded behind a deleted public one.
async function _liveDelete() {
  if (!supabase || !state.user) return;
  try {
    const { error } = await supabase.rpc('live_clear');
    if (!error) return;
  } catch (e) {}
  // pre-migration fallback: two best-effort deletes
  await _livePublicDelete();
  try { await supabase.from('user_activity_live_coach').delete().eq('user_id', state.user.id); } catch (e) {}
}
function liveClear() {
  _liveGen++;                                   // obsolete any queued push
  _liveCoachGen++;                              // session end DOES obsolete the coach leg
  return _liveEnqueue(_liveDelete);             // runs AFTER any in-flight upsert
}
window.ShapeLiveProgress = {
  push: livePush,
  clear: liveClear,
  get: async (uid) => {
    if (!supabase || !uid) return null;
    try {
      const { data } = await supabase.from('user_activity_live')
        .select('payload, visibility, started_at, updated_at, expires_at')
        .eq('user_id', uid).gt('expires_at', new Date().toISOString()).maybeSingle();
      return data || null;   // RLS decides; absent/error → null (honest-absent)
    } catch (e) { return null; }
  },
  subscribe: (uid, cb) => {
    if (!supabase || !uid) return () => {};
    try {
      const channel = supabase.channel(`live-progress-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_activity_live', filter: `user_id=eq.${uid}` },
          (payload) => { try { cb(payload.eventType === 'DELETE' ? null : (payload.new || null)); } catch (e) {} })
        .subscribe();
      return () => { try { supabase.removeChannel(channel); } catch (e) {} };
    } catch (e) { return () => {}; }
  },
  // Coach channel (spec 2026-07-19). Same reader pair against the coach table.
  // RLS decides: a non-coach — and a SINCE-REVOKED coach — simply gets nothing,
  // which is why consumers hold no persistent cache (the revocation bound).
  // Absent table (pre-migration) / error → null, so the consumer falls back to
  // the public row and then to the neutral line.
  getCoach: async (uid) => {
    if (!supabase || !_okUuid(uid)) return null;
    try {
      const { data } = await supabase.from('user_activity_live_coach')
        .select('payload, started_at, updated_at, expires_at')
        .eq('user_id', uid).gt('expires_at', new Date().toISOString()).maybeSingle();
      return data || null;
    } catch (e) { return null; }
  },
  subscribeCoach: (uid, cb) => {
    // uid is interpolated RAW into the realtime filter string below, so it is
    // shape-checked first — parity with the web station (review: CodeRabbit).
    if (!supabase || !_okUuid(uid)) return () => {};
    const want = uid.toLowerCase();
    // Realtime does NOT apply postgres_changes filters to DELETE events, so a
    // DELETE for ANOTHER member lands here too. Unguarded it would blank the
    // watched client's loads when some OTHER client ended a session. user_id is
    // the table's PRIMARY KEY, so the default replica identity carries it in
    // `old`. Match case-insensitively: Postgres emits uuid lowercased, so a
    // strict === against a mixed-case id would drop every event (review: Codex).
    const mine = (rec) => !!(rec && typeof rec.user_id === 'string' && rec.user_id.toLowerCase() === want);
    try {
      const channel = supabase.channel(`live-coach-${uid}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'user_activity_live_coach', filter: `user_id=eq.${uid}` },
          (payload) => {
            try {
              if (payload.eventType === 'DELETE') { if (mine(payload.old)) cb(null); return; }
              if (mine(payload.new)) cb(payload.new);
            } catch (e) {}
          })
        .subscribe();
      return () => { try { supabase.removeChannel(channel); } catch (e) {} };
    } catch (e) { return () => {}; }
  },
};

window.ShapeWorkoutLogs = {
  saveSessionLog: saveWorkoutSessionLog,
  saveStructuredSession: saveStructuredWorkoutSession,
  listSessions: listWorkoutSessions,
  addCoachReviewNote: addCoachWorkoutReviewNote,
  listSensorLogs: listSensorWorkoutLogs,
  importSensorLogs: importSensorWorkoutLogs,
  publishSensorLog: publishSensorWorkoutLog,
};

window.ShapeIntegrations = {
  connectProvider,
  connectWhoop,
  connectStrava,
  connectSpotify,
  saveSpotifyPlaylist,
  listSpotifyPlaylists,
  connectAppleMusic,
  disconnectAppleMusic,
  saveAppleMusicPlaylist,
  listAppleMusicPlaylists,
  sendGroceryToInstacart,
  syncWhoop,
  syncStrava,
  syncOura,
  syncAppleHealth,
  connectAppleHealth: syncAppleHealth,
  appleHealthAvailable: isHealthKitPlatform,
  getStatus: getIntegrationStatus,
  disconnect: disconnectIntegration,
};

// Confirm a Nora-drafted change (the human-in-the-loop step): POST the signed
// proposal token to /api/ai/proposals/confirm. Nothing was applied until here.
// Returns { ok, auditId, result }. Undo reverses a confirmed change by auditId.
async function confirmNoraProposal(token) {
  const res = await fetch(`${apiBaseUrl || ''}/api/ai/proposals/confirm`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ token }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.message || payload.error || 'Could not apply that change.');
  return payload;
}
async function undoNoraProposal(auditId) {
  const res = await fetch(`${apiBaseUrl || ''}/api/ai/audit/undo`, {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ auditId }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Could not undo that change.');
  return payload;
}
window.ShapeSupport = {
  ask: askSupportBot,
  transcribe: transcribeVoice,
  confirm: confirmNoraProposal,
  undo: undoNoraProposal,
};

// ─── Nora's voice (server-side TTS) + tone toggle ────────────────────────────
// Off by default; fully usable without audio. `tone` (supportive | direct) also
// rides along with Nora's text replies so the framing matches what's spoken.
// speak() is server-only; a failure returns { ok:false, reason } and the caller
// shows an honest state (never robot audio).
const VOICE_KEY = 'shape.voice';
// The voices a member can pick for Nora (curated OpenAI TTS set). 'auto' follows
// the tone. Mirrors src/lib/ai/tone.mjs NORA_VOICES (kept in sync by hand — the
// mobile bundle can't import the server module).
const NORA_VOICE_LIST = [
  { id: 'shimmer', label: 'Warm' }, { id: 'alloy', label: 'Neutral' }, { id: 'sage', label: 'Calm' },
  { id: 'nova', label: 'Bright' }, { id: 'onyx', label: 'Deep' }, { id: 'verse', label: 'Expressive' },
];
const NORA_VOICE_IDS = NORA_VOICE_LIST.map(v => v.id);
function normVoice(v) { return NORA_VOICE_IDS.indexOf(String(v)) >= 0 ? String(v) : 'auto'; }
function readVoicePrefs() {
  try {
    const raw = JSON.parse(window.localStorage.getItem(VOICE_KEY) || '{}');
    return { enabled: raw.enabled === true, tone: raw.tone === 'direct' ? 'direct' : 'supportive', voice: normVoice(raw.voice) };
  } catch (e) { return { enabled: false, tone: 'supportive', voice: 'auto' }; }
}
function writeVoicePrefs(p) {
  try { window.localStorage.setItem(VOICE_KEY, JSON.stringify(p)); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent('shape:voice', { detail: p })); } catch (e) {}
}
let _voiceAudio = null;
// The blob: URL backing _voiceAudio, tracked so stopVoice() can revoke it on an
// INTERRUPTION — onended/onerror only fire on natural end/failure, so pausing a
// playing clip would otherwise retain its audio buffer for the page's lifetime
// (a leak of one blob per interrupted step, CodeRabbit Major PR #1805).
let _voiceUrl = null;
// AbortController for the in-flight /api/ai/speak fetch — the _voiceGen guard
// suppresses stale PLAYBACK, but the fetch itself would keep running (abandoned
// provider work + bandwidth on rapid toggles), so stopVoice() aborts it too
// (CodeRabbit Major PR #1805).
let _voiceAbort = null;
// Generation guard (Codex P2, PR #1805): a slow /api/ai/speak fetch can resolve
// AFTER the step/toggle that triggered it changed — stopVoice() only pauses an
// _voiceAudio that already exists, so an in-flight speak would still create a
// new Audio and play a stale step (or read AFTER the member turned NORA READS
// off). Every stop AND every new speak bumps _voiceGen; a speak that finds its
// captured gen superseded when its audio is ready bails without playing.
let _voiceGen = 0;
function stopVoice() {
  _voiceGen++;
  try { if (_voiceAbort) _voiceAbort.abort(); } catch (e) {}
  _voiceAbort = null;
  try { if (_voiceAudio) { _voiceAudio.pause(); } } catch (e) {}
  try { if (_voiceUrl) { URL.revokeObjectURL(_voiceUrl); } } catch (e) {}
  _voiceAudio = null; _voiceUrl = null;
}
// Server voice ONLY. The old on-device speechSynthesis fallback (the robot) is
// deliberately GONE — a failed/unavailable server voice returns an honest
// { ok:false, reason } and the caller decides what to say. Silence over
// brand-damaging robot audio.
async function speakVoice(text, toneOverride, opts = {}) {
  const clean = String(text || '').trim();
  if (!clean) return { ok: false, reason: 'unavailable' };
  const prefs = readVoicePrefs();
  // Honor the voice opt-out: when auto-speak is OFF, a stray speak() call must NOT
  // read coaching content aloud. An explicit "Listen" tap passes { force:true } —
  // that's a deliberate one-off the toggle shouldn't block.
  if (!opts.force && !prefs.enabled) return { ok: false, disabled: true };
  const tone = toneOverride || prefs.tone;
  stopVoice();                 // supersedes any prior speak (bumps _voiceGen)
  const myGen = _voiceGen;     // this call's generation, captured after the bump
  if (!apiBaseUrl || !state.session?.access_token) return { ok: false, reason: 'signed_out' };
  const ctrl = new AbortController();
  _voiceAbort = ctrl;
  try {
    const res = await fetch(`${apiBaseUrl}/api/ai/speak`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ text: clean.slice(0, 2000), tone, voice: prefs.voice !== 'auto' ? prefs.voice : undefined }),
      signal: ctrl.signal,
    });
    // A newer speak() or a stop() ran while we were fetching — don't play stale audio.
    if (myGen !== _voiceGen) return { ok: false, superseded: true };
    if (!res.ok) return { ok: false, reason: (res.status === 401 || res.status === 402) ? 'members' : 'unavailable' };
    const blob = await res.blob();
    if (myGen !== _voiceGen) return { ok: false, superseded: true };
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.onended = audio.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) {} };
    // Last-moment check: a stop() between the blob and playback still wins.
    if (myGen !== _voiceGen) { try { URL.revokeObjectURL(url); } catch (e) {} return { ok: false, superseded: true }; }
    _voiceAudio = audio;
    _voiceUrl = url;   // so an INTERRUPTING stopVoice() can revoke it (revoking twice is a no-op)
    try {
      await audio.play();
    } catch (playErr) {
      // Autoplay block / playback failure — release THIS clip's blob so it can't
      // leak, but only if a newer speak hasn't already taken over (CodeRabbit).
      try { URL.revokeObjectURL(url); } catch (e2) {}
      if (_voiceUrl === url) { _voiceAudio = null; _voiceUrl = null; }
      // A newer speak()/stop() pausing an unstarted play() rejects it — that's a
      // supersession, not a failure, so an explicit-Listen caller doesn't show a
      // spurious "unavailable" toast (adversarial review #1805).
      if (myGen !== _voiceGen) return { ok: false, superseded: true };
      return { ok: false, reason: 'unavailable' };
    }
    return { ok: true, source: 'server' };
  } catch (e) {
    // A stopVoice()/newer speak() aborted this fetch — that's a supersession, not
    // a real failure (so an explicit-Listen caller doesn't show an error).
    if (e && e.name === 'AbortError') return { ok: false, superseded: true };
    return { ok: false, reason: 'unavailable' };
  } finally {
    if (_voiceAbort === ctrl) _voiceAbort = null;  // this call's fetch is done
  }
}
// The TONE + VOICE sync to the account (user_goals 'nora_voice') so Nora's
// framing + sound follow you across devices/surfaces; the on/off ENABLED flag
// stays per-device (localStorage) — audio is device-appropriate, tone/voice are
// person-level prefs.
function persistPrefsToAccount(p) {
  try { window.shapeDb?.saveUserGoals?.('nora_voice', { tone: p.tone === 'direct' ? 'direct' : 'supportive', voice: normVoice(p.voice) }); } catch (e) {}
}
async function loadVoiceTone() {
  try {
    if (!window.shapeDb?.getUserGoals) return null;
    const doc = await window.shapeDb.getUserGoals('nora_voice');
    if (!doc || typeof doc !== 'object') return null;
    const tone = doc.tone === 'direct' ? 'direct' : doc.tone === 'supportive' ? 'supportive' : null;
    const voice = NORA_VOICE_IDS.indexOf(String(doc.voice)) >= 0 ? String(doc.voice) : (doc.voice === 'auto' ? 'auto' : null);
    if (tone == null && voice == null) return null;
    const p = readVoicePrefs();
    let changed = false;
    if (tone != null && p.tone !== tone) { p.tone = tone; changed = true; }
    if (voice != null && p.voice !== voice) { p.voice = voice; changed = true; }
    if (changed) writeVoicePrefs(p); // updates localStorage + fires shape:voice
    return p;
  } catch (e) { return null; }
}
// ─── Nora memory (user_goals 'nora_memory') — Settings management ───────────
// The {rev, notes:[{id,text,at}]} doc that Nora's remember/forget server tools
// and this UI ALL mutate under the same CAS contract. Doc SEMANTICS come from
// the shared normalizeMemoryDoc import (one implementation, no drift); only
// the persistence loop lives here (this runs on the member's own Supabase
// client, mirroring server.ts casWriteUserGoals: rev-conditioned update
// writing rev+1, retry ×2 on a genuine CAS miss, INSERT bootstrap, hard
// errors surfaced — never retried).
async function noraMemoryRow() {
  const uid = state.user?.id || null;
  if (!uid || !supabase) return { uid: null, doc: null };
  const { data, error } = await supabase.from('user_goals').select('data').eq('user_id', uid).eq('kind', 'nora_memory').maybeSingle();
  if (error) return { uid, doc: null, readFailed: true };
  return { uid, doc: (data && data.data) || null };
}
async function noraMemCasWrite(mutate) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const { uid, doc, readFailed } = await noraMemoryRow();
    if (!uid) return { ok: false, error: 'signed_out' };
    if (readFailed) return { ok: false, error: 'read_failed' };
    const d = normalizeMemoryDoc(doc);
    // The raw rev drives the CAS predicate (a legacy rev-less doc conditions
    // on NULL); the normalized rev only feeds the write.
    const rawRev = doc && typeof doc === 'object' && Number.isInteger(doc.rev) && doc.rev >= 0 ? doc.rev : null;
    const next = { notes: mutate(d.notes), rev: (rawRev ?? 0) + 1 };
    if (doc == null) {
      const { error } = await supabase.from('user_goals').insert({ user_id: uid, kind: 'nora_memory', data: next });
      if (!error) return { ok: true };
      if (error.code === '23505') continue; // concurrent first write → re-read (CAS miss)
      return { ok: false, error: 'write_failed' };
    }
    let q = supabase.from('user_goals').update({ data: next }).eq('user_id', uid).eq('kind', 'nora_memory');
    q = rawRev == null ? q.is('data->>rev', null) : q.eq('data->>rev', String(rawRev));
    const { data: upd, error } = await q.select('user_id');
    if (error) return { ok: false, error: 'write_failed' };
    if (Array.isArray(upd) && upd.length) return { ok: true };
    // zero rows = a concurrent writer won — re-read and retry.
  }
  return { ok: false, error: 'conflict' };
}
window.ShapeNoraMemory = {
  async list() { const { doc } = await noraMemoryRow(); return normalizeMemoryDoc(doc).notes; },
  removeNote(id) { return noraMemCasWrite((notes) => notes.filter(n => n.id !== id)); },
  clearAll() { return noraMemCasWrite(() => []); },
};

window.ShapeVoice = {
  get: readVoicePrefs,
  voices: NORA_VOICE_LIST,
  enabled() { return readVoicePrefs().enabled; },
  tone() { return readVoicePrefs().tone; },
  voice() { return readVoicePrefs().voice; },
  setEnabled(b) { const p = readVoicePrefs(); p.enabled = b === true; writeVoicePrefs(p); if (!p.enabled) stopVoice(); return p; },
  setTone(t) { const p = readVoicePrefs(); p.tone = t === 'direct' ? 'direct' : 'supportive'; writeVoicePrefs(p); persistPrefsToAccount(p); return p; },
  setVoice(v) { const p = readVoicePrefs(); p.voice = normVoice(v); writeVoicePrefs(p); persistPrefsToAccount(p); return p; },
  load: loadVoiceTone,
  speak: speakVoice,
  stop: stopVoice,
};

// ─── Proactive notifications: prefs + the server evaluator ───────────────────
// Prefs (per-type opt-out, quiet hours, channels) live in user_goals
// 'notify_prefs' — the SAME doc /api/ai/notify reads, so the screen and the
// server agree. evaluate() runs the engine server-side over the REAL record and
// writes any due notifications (deduped/capped/quiet-hours-aware over there).
function _deviceTz() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } }
// The device's LOCAL calendar day (YYYY-MM-DD) — never UTC. Day-bucketed writes
// (weigh-in, meal log, measurements, workout minutes) must use this so an
// evening log lands on the user's "today", not UTC's. (toISOString() is UTC.)
function _localDate(d = new Date()) {
  const x = d instanceof Date ? d : new Date(d);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
}
// The preference center: settings (mute/quiet hours/cap/tz) + the per-type ×
// per-channel matrix (notification_preferences) + the user's habit reminders.
// One RPC read; targeted upserts on change. The SAME tables /api/ai/notify reads.
async function notifyCenter() {
  if (!supabase || !state.user?.id) return { settings: null, prefs: [], reminders: [] };
  try {
    const { data, error } = await supabase.rpc('get_notification_center');
    if (error || !data) return { settings: null, prefs: [], reminders: [] };
    return { settings: data.settings || null, prefs: Array.isArray(data.prefs) ? data.prefs : [], reminders: Array.isArray(data.reminders) ? data.reminders : [] };
  } catch (e) { return { settings: null, prefs: [], reminders: [] }; }
}
async function saveNotifySettings(patch) {
  if (!supabase || !state.user?.id) return;
  const row = { user_id: state.user.id, tz: _deviceTz(), updated_at: new Date().toISOString(), ...patch };
  try { await supabase.from('notification_settings').upsert(row, { onConflict: 'user_id' }); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent('shape:notifyprefs')); } catch (e) {}
}
async function setNotifyChannel(type, channel, enabled) {
  if (!supabase || !state.user?.id) return;
  try { await supabase.from('notification_preferences').upsert({ user_id: state.user.id, type, channel, enabled: enabled === true, updated_at: new Date().toISOString() }, { onConflict: 'user_id,type,channel' }); } catch (e) {}
  try { window.dispatchEvent(new CustomEvent('shape:notifyprefs')); } catch (e) {}
}
window.ShapeNotifyPrefs = { center: notifyCenter, saveSettings: saveNotifySettings, setChannel: setNotifyChannel };

// ─── Habit reminders (Part B) — user-scheduled, opt-in ───────────────────────
// Persisted to habit_reminders (the cron reads it for push/email); also scheduled
// as device-LOCAL notifications (offline, no server cost) when the native plugin
// is present. Suppression-when-done + batching live in the server decision layer.
function _localNotifs() { try { return (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.LocalNotifications) || null; } catch (e) { return null; } }
function _habitNotifBase(habitId) { let h = 0; const s = String(habitId); for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0; } return (h % 200000) * 10; }
async function cancelLocalHabit(habitId) {
  const LN = _localNotifs(); if (!LN || !LN.cancel) return;
  const base = _habitNotifBase(habitId);
  try { await LN.cancel({ notifications: [0, 1, 2, 3, 4, 5, 6].map(d => ({ id: base + d })) }); } catch (e) {}
}
async function scheduleLocalHabit(r) {
  const LN = _localNotifs(); if (!LN || !LN.schedule) return;
  await cancelLocalHabit(r.habit_id);
  if (r.enabled === false) return;
  const parts = String(r.at_time || '09:00').split(':');
  const hour = parseInt(parts[0], 10) || 9, minute = parseInt(parts[1], 10) || 0;
  const notifications = (r.days || []).map((dow) => ({
    id: _habitNotifBase(r.habit_id) + dow,
    title: `Time for: ${r.label || 'your habit'}`,
    body: 'A quick nudge — tap to check it off.',
    schedule: { on: { weekday: dow + 1, hour, minute }, allowWhileIdle: true }, // Capacitor weekday 1=Sun…7=Sat
    extra: { route: 'habits', habitId: r.habit_id },
  }));
  try { if (notifications.length) await LN.schedule({ notifications }); } catch (e) {}
}
async function listHabitReminders() {
  if (!supabase || !state.user?.id) return [];
  try { const { data } = await supabase.from('habit_reminders').select('*').eq('user_id', state.user.id); return data || []; } catch (e) { return []; }
}
async function setHabitReminder({ habitId, label, time, days, enabled } = {}) {
  if (!supabase || !state.user?.id || !habitId) return null;
  const row = {
    habit_id: habitId, user_id: state.user.id, label: label || '',
    at_time: time || '09:00', days: Array.isArray(days) ? days : [1, 2, 3, 4, 5],
    tz: _deviceTz(), enabled: enabled !== false, snooze_until: null, updated_at: new Date().toISOString(),
  };
  try { await supabase.from('habit_reminders').upsert(row, { onConflict: 'habit_id' }); } catch (e) {}
  scheduleLocalHabit(row);
  return row;
}
// habit_id is the global PK (→ user_habits.id), so it identifies one user's row;
// we still scope writes by user_id (matching the reads + RLS) so a mismatched id
// can never touch another account's reminder.
async function removeHabitReminder(habitId) {
  if (!supabase || !state.user?.id || !habitId) return;
  try { await supabase.from('habit_reminders').delete().eq('habit_id', habitId).eq('user_id', state.user.id); } catch (e) {}
  cancelLocalHabit(habitId);
}
async function snoozeHabitReminder(habitId, minutes) {
  if (!supabase || !state.user?.id || !habitId) return;
  const until = new Date(Date.now() + (minutes || 60) * 60000).toISOString();
  try { await supabase.from('habit_reminders').update({ snooze_until: until }).eq('habit_id', habitId).eq('user_id', state.user.id); } catch (e) {}
}
window.ShapeHabitReminders = { list: listHabitReminders, set: setHabitReminder, remove: removeHabitReminder, snooze: snoozeHabitReminder };

// ─── User-set reminders (standalone nudges: weigh-in / check-in / water / photo /
// custom) — CRUD over /api/client/reminders; the hourly cron fires them. ────────
async function remindersList() {
  if (!apiBaseUrl) return { reminders: [] };
  const headers = {};
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  try {
    const res = await fetch(`${apiBaseUrl}/api/client/reminders`, { headers, credentials: 'include', cache: 'no-store' });
    return await res.json().catch(() => ({ reminders: [] }));
  } catch (e) { return { reminders: [] }; }
}
async function remindersSave(r) {
  if (!apiBaseUrl) return { ok: false };
  const headers = { 'Content-Type': 'application/json' };
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  const tz = _deviceTz();
  try {
    const res = await fetch(`${apiBaseUrl}/api/client/reminders`, { method: 'POST', headers, credentials: 'include', body: JSON.stringify({ tz, ...r }) });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) { return { ok: false }; }
}
async function remindersRemove(id) {
  if (!apiBaseUrl || !id) return { ok: false };
  const headers = {};
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  try {
    const res = await fetch(`${apiBaseUrl}/api/client/reminders?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers, credentials: 'include' });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) { return { ok: false }; }
}
window.ShapeReminders = { list: remindersList, save: remindersSave, remove: remindersRemove };

// ─── Source reconciliation (INT2) — "which source do you trust?" ─────────────
// On-demand data-quality view. clientId optional (a coach reconciling a client).
async function reconcileGet(clientId, days) {
  if (!apiBaseUrl) return { items: [] };
  const headers = {};
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  const qs = new URLSearchParams();
  if (clientId) qs.set('clientId', clientId);
  if (days) qs.set('days', String(days));
  try {
    const res = await fetch(`${apiBaseUrl}/api/integrations/reconcile?${qs.toString()}`, { headers });
    return await res.json().catch(() => ({ items: [] }));
  } catch (e) { return { items: [] }; }
}
async function reconcileSet({ clientId, metric, source } = {}) {
  if (!apiBaseUrl || !state.session?.access_token) return { ok: false };
  try {
    const res = await fetch(`${apiBaseUrl}/api/integrations/reconcile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify({ clientId, metric, source }),
    });
    return await res.json().catch(() => ({ ok: false }));
  } catch (e) { return { ok: false }; }
}
window.ShapeReconcile = { get: reconcileGet, set: reconcileSet };

async function evaluateNotifications(force) {
  if (!apiBaseUrl || !state.session?.access_token) return null;
  // Throttle (the server layer dedups too, but don't hammer the endpoint).
  try {
    if (!force) {
      const last = Number(window.localStorage.getItem('shape.notify.last') || 0);
      if (Date.now() - last < 30 * 60_000) return null;
    }
  } catch (e) {}
  try {
    const role = state.profile?.role || 'client';
    let body;
    // Coach roles send their client roster; dietitian rides the nutrition rails
    // (matches the server's isCoachRole, so /api/ai/notify takes the coach branch).
    if (role === 'trainer' || role === 'nutritionist' || role === 'dietitian') {
      // Pass the discipline so a nutritionist/dietitian evaluates the NUTRITION
      // roster — not the trainer default coachRecords() would otherwise use.
      const clients = window.ShapeSignals?.coachRecords ? await window.ShapeSignals.coachRecords(providerDiscipline(role)) : null;
      if (!Array.isArray(clients) || !clients.length) return null; // honest: nothing to evaluate
      body = { clients };
    } else {
      const record = window.ShapeSignals?.selfRecord ? await window.ShapeSignals.selfRecord() : null;
      if (!record) return null;
      body = { record };
    }
    // Stamp the throttle only now that a real payload exists — a not-ready
    // ShapeSignals or an empty roster must NOT suppress the next 30 minutes.
    try { window.localStorage.setItem('shape.notify.last', String(Date.now())); } catch (e) {}
    const res = await fetch(`${apiBaseUrl}/api/ai/notify`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
      body: JSON.stringify(body),
    });
    return await res.json().catch(() => null);
  } catch (e) { return null; }
}
window.ShapeNotify = { evaluate: evaluateNotifications };

// ─── Coach Console feed (banner + pushed items the coach sent to this client) ───
// Backed by the coach_focus_banners + coach_pushed_items tables (2026-05-22
// migration). RLS lets the signed-in client SELECT their own rows where
// client_id = auth.uid()::text. Returns { banners, items }, ready for direct
// rendering in the client broadsheet's Home view.
async function fetchCoachConsoleFeed() {
  if (!state.user?.id || !supabase) return { banners: [], items: [] };
  const userId = state.user.id;
  try {
    const [bannersRes, itemsRes] = await Promise.all([
      supabase
        .from('coach_focus_banners')
        .select('id, provider_role, provider_id, text, sent_at')
        .eq('client_id', userId)
        .order('sent_at', { ascending: false }),
      supabase
        .from('coach_pushed_items')
        .select('id, provider_role, provider_id, kind, payload, sent_at')
        .eq('client_id', userId)
        .is('removed_at', null)
        .order('sent_at', { ascending: true }),
    ]);
    return {
      banners: bannersRes.data ?? [],
      items: itemsRes.data ?? [],
    };
  } catch {
    return { banners: [], items: [] };
  }
}

// Live subscription on the same two tables. The 2026-05-23 migration adds
// them to the supabase_realtime publication so postgres_changes fires INSERT
// / UPDATE / DELETE events; RLS scopes them to this user's own rows. Returns
// an unsubscribe function the caller invokes on unmount.
function subscribeCoachConsoleFeed(onChange) {
  if (!state.user?.id || !supabase) return () => {};
  const userId = state.user.id;
  const channel = supabase
    .channel(`coach-feed:${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'coach_focus_banners', filter: `client_id=eq.${userId}` },
      onChange,
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'coach_pushed_items', filter: `client_id=eq.${userId}` },
      onChange,
    )
    .subscribe();
  return () => {
    try { supabase.removeChannel(channel); } catch {}
  };
}

window.ShapeCoachFeed = {
  fetch: fetchCoachConsoleFeed,
  subscribe: subscribeCoachConsoleFeed,
};

// ─── Pro Console API (trainer / nutritionist side) ───────────────────────────
// These call the Next.js /api/{role}/console endpoints with Bearer auth so the
// mobile app can read + write the console state without a cookie session bridge.

async function fetchProConsole(role) {
  if (!apiBaseUrl || !state.session?.access_token) return null;
  const res = await fetch(`${apiBaseUrl}/api/${role}/console`, {
    headers: { Authorization: `Bearer ${state.session.access_token}` },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Console fetch failed.');
  return res.json();
}

async function postProConsole(role, body) {
  if (!apiBaseUrl || !state.session?.access_token) throw new Error('Not authenticated.');
  const res = await fetch(`${apiBaseUrl}/api/${role}/console`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${state.session.access_token}`,
    },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Console action failed.');
  return payload;
}

window.ShapeProConsole = { fetch: fetchProConsole, post: postProConsole };

// ===== Shape Radio (live licensed stream) =====
(function () {
  let el = null, pollTimer = null, pollAbort = null, pollGen = 0;
  function api(path) {
    // Use the file's existing apiBaseUrl resolution: VITE_API_BASE_URL wins for
    // the native app (which has no same origin); the /m/ web build is served from
    // the same origin, so apiBaseUrl is '' and same-origin requests just work.
    return (apiBaseUrl || '') + path;
  }
  function audio() {
    // crossOrigin='anonymous' so createMediaElementSource (analyser + Nora avatar)
    // works for cross-origin provider streams that send ACAO; without it the Web
    // Audio graph is muted/blocked for cross-origin audio. Part of the stream contract.
    if (!el) { el = new Audio(); el.preload = 'none'; el.crossOrigin = 'anonymous'; }
    return el;
  }
  async function station() {
    try { const r = await fetch(api('/api/radio/station'), { cache: 'no-store' }); return r.ok ? r.json() : null; }
    catch { return null; }
  }
  async function nowPlaying(signal) {
    try { const r = await fetch(api('/api/radio/now-playing'), { cache: 'no-store', signal }); return r.ok ? r.json() : null; }
    catch { return null; }
  }
  async function play() {
    const cfg = await station();
    if (!cfg || !cfg.configured) return false;
    const a = audio();
    if (a.src !== cfg.streamUrl) a.src = cfg.streamUrl;
    try { await a.play(); return true; } catch { return false; }
  }
  function pause() { if (el) el.pause(); }
  // Self-scheduling poll with cancellation: each cycle finishes (or aborts) before
  // the next is scheduled, so a slow mobile network can't stack overlapping requests,
  // and a teardown (stopPolling) aborts the in-flight fetch + drops any late response
  // so it can't overwrite fresher UI state after the radio is turned off.
  function startPolling(cb) {
    stopPolling();
    const gen = ++pollGen;
    const loop = async () => {
      if (gen !== pollGen) return;
      pollAbort = (typeof AbortController !== 'undefined') ? new AbortController() : null;
      const np = await nowPlaying(pollAbort ? pollAbort.signal : undefined);
      if (gen !== pollGen) return;        // superseded/torn down mid-flight → drop the late response
      if (np) cb(np);
      pollTimer = setTimeout(loop, 15000); // schedule the NEXT cycle only after this one settled
    };
    loop();
  }
  function stopPolling() {
    pollGen++;                            // invalidate any in-flight cycle
    if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }
    if (pollAbort) { try { pollAbort.abort(); } catch { /* no-op */ } pollAbort = null; }
  }
  // Cached analyser — built ONCE from the radio <audio> element because a second
  // createMediaElementSource on the same element throws. Cache the AudioContext,
  // AnalyserNode, and a wired flag so every caller (including NoraStage) shares
  // the same graph node without risk of duplicate source creation.
  let _ac = null, _analyser = null, _srcWired = false;
  function analyser() {
    const a = audio();                       // the existing cached <audio> element
    if (!_ac) { const Ctx = window.AudioContext || window.webkitAudioContext; if (!Ctx) return null; _ac = new Ctx(); }
    if (_ac.state === 'suspended') { _ac.resume().catch(() => {}); }
    if (!_analyser) { _analyser = _ac.createAnalyser(); _analyser.fftSize = 512; }
    if (!_srcWired) { try { const s = _ac.createMediaElementSource(a); s.connect(_analyser); _analyser.connect(_ac.destination); _srcWired = true; } catch (e) {} }
    return _analyser;
  }
  window.ShapeRadioLive = { station, nowPlaying, audio, play, pause, startPolling, stopPolling, analyser };
})();

// Shape Sets broadcast schedule (spec 2026-07-19). Public read — the table's RLS
// exposes PUBLISHED rows only, so a signed-out preview sees the same schedule a
// member does. Reads the WHOLE relevant window with NO row limit: a limit could
// truncate away the row that is live right now, and the window is already the
// bound. Degrades silent — an unreachable table (or one that predates the
// migration) yields [] and every consumer renders its honest empty state.
window.ShapeNoraSets = {
  list: async () => {
    if (!supabase) return [];
    try {
      // The window is defined ONCE in the canonical module — it encodes a
      // schema coupling (the lookback IS the duration_min ceiling) that would
      // silently rot if each surface computed it (review: CodeRabbit).
      const { from, to } = bsSetsWindow(Date.now());
      const { data, error } = await supabase.from('nora_sets')
        .select('*').eq('published', true)
        .gte('starts_at', from).lte('starts_at', to)
        .order('starts_at', { ascending: true });
      if (error) return [];
      return Array.isArray(data) ? data : [];
    } catch (e) { return []; }
  },
};
