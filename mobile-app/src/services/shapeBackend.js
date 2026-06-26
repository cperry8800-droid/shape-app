import { Capacitor } from '@capacitor/core';
import { createClient } from '@supabase/supabase-js';
import { isHealthKitPlatform, requestHealthKitAuth, collectHealthKitSnapshots } from './healthkit.js';
import { hrmAvailable, hrmConnected, hrmCurrent, hrmConnect, hrmDisconnect } from './hrm.js';
import { registerPush } from './push.js';
import { mergePostPatch } from './communityPostPatch.mjs';
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
    try { const { data: r } = await supabase.rpc('get_email_for_username', { p_username: loginEmail.replace(/^@/, '') }); resolved = r || null; } catch (e) { resolved = undefined; }
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

function normalizeWorkoutSetLog(entry = {}, fallbackIndex = 0) {
  const startedAt = entry.startedAt || entry.started_at || null;
  const finishedAt = entry.finishedAt || entry.finished_at || entry.capturedAt || null;
  return {
    move_index: Number.isFinite(Number(entry.moveIndex)) ? Number(entry.moveIndex) : fallbackIndex,
    move_name: String(entry.moveName || entry.exercise || entry.move || 'Exercise').trim(),
    set_number: Math.max(1, Number(entry.setNumber || entry.set || 1)),
    target_reps: entry.targetReps ? String(entry.targetReps) : null,
    target_load: entry.targetLoad ? String(entry.targetLoad) : null,
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
  privacy = 'private',
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

  const feedPost = await createCommunityPost({
    title,
    status: 'Sensor-authored workout log',
    note: `${completedSets} sets captured automatically. Avg set ${avgSetSeconds}s. Avg rest ${avgRestSeconds}s.`,
    privacy,
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
        // The ACTUAL lifted load/reps captured in the live session — these drive
        // the detail page's per-set breakdown.
        actualReps: entry.actualReps != null ? entry.actualReps : null,
        actualLoad: entry.actualLoad != null ? entry.actualLoad : null,
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
      tags: ['SENSOR', 'PRIVATE', 'SESSION'],
    },
    sourceProvider: 'shape_session',
    sourceActivityId: `shape-session-${Date.now()}`,
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
  return {
    ...feedPost,
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
  if (clean === 'public' || clean === 'private' || clean === 'profile') return clean;
  return 'community';
}

async function listCommunityPosts() {
  if (!supabase) return { stored: 'local', data: [] };

  const { data, error } = await supabase
    .from('community_posts')
    .select(COMMUNITY_POST_SELECT)
    // 'profile' (profile-only) and 'private' posts never appear in the feed.
    .in('privacy', ['public', 'community'])
    .order('created_at', { ascending: false })
    .limit(50);

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
  if (data?.id) {
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
// rule-based reply); signed-in users get the AI assistant.
async function askSupportBot(messages, tone) {
  if (!apiBaseUrl) throw new Error('API backend URL is not configured. Set VITE_API_BASE_URL.');
  const headers = { 'Content-Type': 'application/json' };
  if (state.session?.access_token) headers.Authorization = `Bearer ${state.session.access_token}`;
  const res = await fetch(`${apiBaseUrl}/api/support/chat`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ messages: Array.isArray(messages) ? messages : [], tone: tone || (window.ShapeVoice && window.ShapeVoice.tone()) || 'supportive' }),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'Support is unavailable right now.');
  return payload;
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
async function getSessions() {
  return getJsonOrDefault(sessionsApiUrl(), [], (data) => (Array.isArray(data.sessions) ? data.sessions : []));
}
async function manageSession({ sessionId, action } = {}) {
  const res = await fetch(sessionsApiUrl(), {
    method: 'POST',
    credentials: 'same-origin',
    headers: sessionsAuthHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ sessionId, action }),
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
window.ShapeStore = { get: getStore, redeem: redeemStoreItem, redeemLeadBoost };

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
  // Merge the incoming detail sections (training / nutrition) over what's stored.
  if (detail && typeof detail === 'object') {
    let existing = {};
    try {
      const { data: cur } = await supabase.from('client_programs').select('detail').eq('user_id', uid).maybeSingle();
      if (cur?.detail && typeof cur.detail === 'object') existing = cur.detail;
    } catch (e) { /* first write — no existing row */ }
    // A SELF write must never set `detail.directive`: that field is the coach's
    // override (written only by the server /api/ai/directive/override route) and
    // the engine honors it as an authoritative coach directive. Strip it from
    // client-supplied input so a client can't forge a coach directive for
    // themselves; the stored coach value (existing.directive) is preserved here.
    const { directive: _coachOnly, ...selfDetail } = detail;
    payload.detail = { ...existing, ...selfDetail };
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
window.ShapeClientStats = { get: getClientStats, getLifts: getClientLifts };

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
    return res.json();
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
};

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
window.ShapeProgress = { progress: getClientProgress, analytics: getClientAnalytics, train: getClientTrain, nutrition: getClientNutrition };
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
window.ShapeCoachLookup = { ownerOf: coachOwnerOf };

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
  confirm: confirmNoraProposal,
  undo: undoNoraProposal,
};

// ─── Nora's voice (server-side TTS) + tone toggle ────────────────────────────
// Off by default; fully usable without audio. `tone` (supportive | direct) also
// rides along with Nora's text replies so the framing matches what's spoken.
// speak() prefers the server route (consistent voice + tone→voice mapping) and
// falls back to on-device speech (Web Speech API) when the route is unavailable.
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
function stopVoice() {
  try { if (_voiceAudio) { _voiceAudio.pause(); _voiceAudio = null; } } catch (e) {}
  try { if (window.speechSynthesis) window.speechSynthesis.cancel(); } catch (e) {}
}
function speakOnDevice(text, tone) {
  try {
    if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return false;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(String(text || ''));
    u.rate = tone === 'direct' ? 1.05 : 0.98; // direct = a touch crisper
    window.speechSynthesis.speak(u);
    return true;
  } catch (e) { return false; }
}
async function speakVoice(text, toneOverride, opts = {}) {
  const clean = String(text || '').trim();
  if (!clean) return { ok: false };
  const prefs = readVoicePrefs();
  // Honor the voice opt-out: when auto-speak is OFF, a stray speak() call must NOT
  // read coaching content aloud. An explicit "Listen" tap passes { force:true } —
  // that's a deliberate one-off the toggle shouldn't block.
  if (!opts.force && !prefs.enabled) return { ok: false, disabled: true };
  const tone = toneOverride || prefs.tone;
  stopVoice();
  // Prefer the server route (better voice + the tone→voice mapping).
  if (apiBaseUrl && state.session?.access_token) {
    try {
      const res = await fetch(`${apiBaseUrl}/api/ai/speak`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${state.session.access_token}` },
        body: JSON.stringify({ text: clean.slice(0, 2000), tone, voice: prefs.voice !== 'auto' ? prefs.voice : undefined }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        _voiceAudio = audio;
        audio.onended = audio.onerror = () => { try { URL.revokeObjectURL(url); } catch (e) {} };
        await audio.play();
        return { ok: true, source: 'server' };
      }
      // 503/unavailable → fall through to on-device speech.
    } catch (e) { /* network → fall back */ }
  }
  return { ok: speakOnDevice(clean, tone), source: 'device' };
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
