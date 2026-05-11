import { Capacitor } from '@capacitor/core';
import { createClient } from '@supabase/supabase-js';
import {
  DEFAULT_BACKGROUND_CHECK_PROVIDER,
  PROVIDER_APPLICATION_MAX_FILE_BYTES,
  REQUIRED_PROVIDER_EXPERIENCE_YEARS,
} from '../config/providerApplications.js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
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
  return ['client', 'trainer', 'nutritionist'].includes(role) ? role : 'client';
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
    email: overrides.email || 'alex@rivera.co',
    full_name: overrides.fullName || 'Alex Rivera',
    role,
    roles: normalizeRoles(overrides.roles, role),
    shape_radio_enabled: true,
    profile_visibility: 'community',
  };
}

function setCached(next = {}) {
  Object.assign(state, next);
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

async function signIn({ email, password, role }) {
  if (!authConfigured) {
    const profile = demoProfile({ email, role });
    return setCached({
      user: { id: profile.id, email: profile.email, user_metadata: { role: profile.role } },
      session: { demo: true },
      profile,
    });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  let profile = await fetchProfile(data.user);
  if (!profile) profile = await upsertProfile(data.user, { role });

  const cached = setCached({ user: data.user, session: data.session, profile });
  await bridgeSessionToApi(data.session).catch((error) => {
    console.warn('[shape] Session bridge failed.', error);
  });
  return cached;
}

async function signUp({ email, password, fullName, role }) {
  const normalizedRole = normalizeRole(role);
  if (!authConfigured) {
    const profile = demoProfile({ email, fullName, role: normalizedRole });
    return setCached({
      user: { id: profile.id, email: profile.email, user_metadata: { role: profile.role, full_name: profile.full_name } },
      session: { demo: true },
      profile,
    });
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        full_name: fullName,
        role: normalizedRole,
        roles: [normalizedRole],
      },
    },
  });
  if (error) throw error;

  const profile = data.user ? await upsertProfile(data.user, { fullName, role }) : null;
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

async function getCurrentSession() {
  if (!authConfigured) return setCached({});

  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;

  const user = data.session?.user || null;
  const profile = user ? await fetchProfile(user) : null;
  const cached = setCached({ user, session: data.session, profile });
  if (data.session) {
    await bridgeSessionToApi(data.session).catch((error) => {
      console.warn('[shape] Session bridge failed.', error);
    });
  }
  return cached;
}

async function signOut() {
  if (supabase) await supabase.auth.signOut();
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

  if (payload.url) {
    if (Capacitor.isNativePlatform()) {
      window.location.href = payload.url;
    } else {
      window.location.assign(payload.url);
    }
  }

  return payload;
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

function saveApplicationFallback(payload, error) {
  const item = {
    id: `local-${Date.now()}`,
    created_at: new Date().toISOString(),
    payload,
    error: error?.message || '',
  };
  try {
    const key = 'shape.providerApplications';
    const current = JSON.parse(window.localStorage?.getItem(key) || '[]');
    const next = Array.isArray(current) ? [item, ...current] : [item];
    window.localStorage?.setItem(key, JSON.stringify(next.slice(0, 25)));
  } catch {}
  return item;
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
    return { stored: 'local', data: saveApplicationFallback(payload) };
  }

  const { data, error } = await supabase
    .from('provider_applications')
    .insert(payload)
    .select()
    .single();

  if (error) {
    return { stored: 'local', data: saveApplicationFallback(payload, error), error };
  }

  return { stored: 'supabase', data };
}

function toBookingDate(date, month = 'Apr') {
  const day = Number(date);
  if (!Number.isFinite(day)) return null;
  const monthIndex = {
    Jan: '01',
    Feb: '02',
    Mar: '03',
    Apr: '04',
    May: '05',
    Jun: '06',
    Jul: '07',
    Aug: '08',
    Sep: '09',
    Oct: '10',
    Nov: '11',
    Dec: '12',
  }[month] || '04';
  return `2026-${monthIndex}-${String(day).padStart(2, '0')}`;
}

function scheduledAtFromSlot(slot = {}) {
  const scheduledDate = slot.scheduled_date || toBookingDate(slot.date, slot.month || 'Apr');
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

async function getOwnedProviderId(role = 'trainer') {
  if (!supabase || !state.user?.id) return null;
  const normalizedRole = normalizeRole(role);
  const table = normalizedRole === 'nutritionist' ? 'nutritionists' : 'trainers';
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
    })),
    updatedAt: conversation.updated_at || conversation.last_message_at || conversation.created_at,
  };
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
    created_at: row.created_at || null,
    name: authorName,
    role: row.author_role === 'trainer' ? 'Trainer' : row.author_role === 'nutritionist' ? 'Nutritionist' : 'Client',
    avatar: authorName.trim()[0]?.toUpperCase() || 'S',
    time: row.created_at ? new Date(row.created_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'now',
    privacy: privacy === 'public' ? 'Public' : privacy === 'private' ? 'Private' : 'Community',
    workout: row.activity_type || 'Workout',
    status: row.status || row.title,
    statA: stats.statA,
    statB: stats.statB,
    statC: stats.statC,
    labels: stats.labels,
    note: row.note || '',
    route: displayRoute,
    rawMetrics: metrics,
    rawRoute: route,
    tags: displayTags,
    likes: likes.length,
    liked: likes.some(like => like.user_id === state.user?.id),
    comments: comments.map(comment => ({
      who: comment.author_name || 'Shape member',
      text: comment.body,
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
    .select('*, likes:community_likes(user_id), comments:community_comments(id, user_id, author_name, body, created_at)')
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
      setLogs: setLogs.map((entry) => ({
        key: entry.key,
        moveIndex: entry.moveIndex,
        moveName: entry.moveName,
        setNumber: entry.setNumber,
        targetReps: entry.targetReps,
        targetLoad: entry.targetLoad,
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

  return {
    ...feedPost,
    workoutSession: structured,
  };
}

function privacyToDb(value) {
  const clean = String(value || '').toLowerCase();
  if (clean === 'public' || clean === 'private') return clean;
  return 'community';
}

async function listCommunityPosts() {
  if (!supabase) return { stored: 'local', data: [] };

  const { data, error } = await supabase
    .from('community_posts')
    .select('*, likes:community_likes(user_id), comments:community_comments(id, user_id, author_name, body, created_at)')
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return { stored: 'local', data: [], error };
  }

  return { stored: 'supabase', data: (data || []).map(communityPostFromRow) };
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
} = {}) {
  if (!state.user?.id) throw new Error('Sign in before posting to the community feed.');
  const cleanTitle = String(title || '').trim();
  if (!cleanTitle) throw new Error('Post title is required.');

  const profile = state.profile || {};
  const authorName = profile.full_name || state.user.email?.split('@')[0] || 'Shape member';
  const payload = {
    author_id: state.user.id,
    author_name: authorName,
    author_role: normalizeRole(profile.role || 'client'),
    privacy: privacyToDb(privacy),
    activity_type: activityType,
    title: cleanTitle,
    status: String(status || '').trim() || null,
    note: String(note || '').trim() || null,
    metrics: metrics || {},
    route: route || {},
    source_provider: sourceProvider || null,
    source_activity_id: sourceActivityId || null,
  };

  if (!supabase) {
    return { stored: 'local', data: saveLocalRecord('shape.communityPosts', payload) };
  }

  const { data, error } = await supabase
    .from('community_posts')
    .insert(payload)
    .select('*, likes:community_likes(user_id), comments:community_comments(id, user_id, author_name, body, created_at)')
    .single();

  if (error) {
    return { stored: 'local', data: saveLocalRecord('shape.communityPosts', payload, error), error };
  }

  return { stored: 'supabase', data: communityPostFromRow(data) };
}

async function toggleCommunityLike({ postId } = {}) {
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

window.ShapeAuth = {
  configured: authConfigured,
  client: supabase,
  signIn,
  signUp,
  signOut,
  getCurrentSession,
  updateProfileRoles,
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

window.ShapeBookings = {
  submitConsultationBooking,
};

window.ShapeSessions = {
  createSessionRequest,
  listSessions,
  updateSessionStatus,
};

window.ShapeAvailability = {
  listProviderAvailability,
  saveProviderAvailability,
};

window.ShapePlaylists = {
  listTrainerPlaylists,
  createTrainerPlaylist,
};

window.ShapeWorkouts = {
  listClientWorkouts,
  assignClientWorkout,
  updateClientWorkout,
};

window.ShapeAI = {
  generatePlanDraft,
};

window.ShapeMessages = {
  getOrCreateDirectConversation,
  sendMessage,
  sendProviderMessage,
  listDirectCoachThreads,
};

window.ShapeCommunity = {
  listPosts: listCommunityPosts,
  createPost: createCommunityPost,
  toggleLike: toggleCommunityLike,
  addComment: addCommunityComment,
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
  syncWhoop,
  syncStrava,
  getStatus: getIntegrationStatus,
  disconnect: disconnectIntegration,
};
