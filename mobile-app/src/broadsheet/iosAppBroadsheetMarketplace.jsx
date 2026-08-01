import React from 'react';
import { createPortal } from 'react-dom';
// iosAppBroadsheetMarketplace.jsx — Coach marketplace in the Broadsheet visual language.
// "The Personals" / classifieds-meets-features. Browse trainers + nutritionists.
//
// Provides:
//   • BSMarketplaceScreen — full screen with hero, tab toggle, featured coach,
//     filter strip, coach grid, "rate card" listings, and a "writers wanted" CTA.
//   • BSCoachDetail        — opened when a coach card is tapped (sheet-style).

const { useState: useStateBSM2, useMemo: useMemoBSM2, useEffect: useEffectBSM2 } = React;
const { BSPage, BSPageHeader, BSAvatar, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow, BSFooter, BSHalftone, useBS } = window;
// The masthead's top inset — the chrome owns it (window-exported). The local
// fallback mirrors the chrome's expression exactly so a load-order slip degrades
// to the same geometry instead of silently reverting to a notch-blind flat 44.
const BS_MAST_TOP_CSS = (typeof window !== 'undefined' && window.BS_MAST_TOP_CSS) || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';

import { bsProjectAvailability, bsSlotsByDay } from '../services/coachAvailability.mjs';
import { bsPlanPreview } from '../services/planPreview.mjs';
import { bsNormalizeListingMedia } from '../services/listingMedia.mjs';

// The i18n translator for this module. Mirrors client.jsx's useShapeTr —
// self-contained on the window globals (ShapeI18n/ShapeLocale), so this module
// doesn't depend on another file's copy or its load order.
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => window.ShapeLocale?.subscribe?.(() => force((n) => n + 1)), []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}
// Active app locale for Intl date/number formatting (mirrors client.jsx's
// bsDateLocale — falls back to the browser default when i18n isn't ready).
function bsmLocale() {
  return (typeof window !== 'undefined' && (window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.())) || undefined;
}
// Localized role word (Trainer / Nutritionist) — the fixed UI vocabulary the
// code emits from a boolean, matching the feed's roleTag.* pattern. The
// underlying provider_role value stays English; only the displayed word maps.
function bsmRoleWord(tr, isNutri) {
  return isNutri
    ? tr('marketplace:role.nutritionist', { defaultValue: 'Nutritionist' })
    : tr('marketplace:role.trainer', { defaultValue: 'Trainer' });
}

// ═══════════════════════════════════════════════════════════
// Data
// ═══════════════════════════════════════════════════════════
const BSM_MARKETPLACE_CATEGORIES = {
  Trainer: ['All Categories', 'Strength & Resistance', 'Cardio & Endurance', 'Pure Running', 'Hyrox', 'Mobility, Recovery & Rehab', 'Functional & Hybrid', 'Bodybuilding', 'HIIT', 'Fat Burn', 'At Home', 'Just for Women'],
  Nutritionist: ['All Categories', 'Sports Performance & Hydration', 'Performance Nutrition', 'Medical & Condition-Specific', 'Muscle Gain / Bulking', 'Gut Health & Functional Nutrition', 'Longevity & Healthspan', 'Weight Mgmt', 'Plant-Based', 'Prenatal', 'Meal Prep'],
};

const BSM_MARKETPLACE_LOCATIONS = {
  Trainer: ['Anywhere', 'Remote-friendly', 'Brooklyn, NY', 'Los Angeles', 'Austin, TX', 'Miami', 'Chicago', 'Denver', 'San Francisco', 'Las Vegas', 'Atlanta', 'Portland, OR', 'Boulder, CO', 'Eugene, OR', 'Toronto', 'London', 'Berlin', 'Lisbon', 'Madrid', 'Stockholm', 'Tokyo', 'Mumbai', 'Dubai', 'Girona', 'Chamonix'],
  Nutritionist: ['Anywhere', 'Remote only', 'London', 'Toronto', 'Stockholm', 'Copenhagen', 'Madrid', 'Milan', 'Sydney', 'Osaka', 'Lagos'],
};

const BSM_MARKETPLACE_FORMATS = ['All formats', 'In-person', 'Remote', 'Hybrid'];
const BSM_MARKETPLACE_SORTS = ['Most Popular', 'Highest Rated', 'Lowest Price', 'Most Experience'];
const BSM_MARKETPLACE_CERTIFICATIONS = {
  Trainer: ['NASM-CPT', 'CSCS', 'ACSM-CPT', 'NSCA-CPT', 'ACE-CPT', 'USATF', 'UESCA', 'HYROX-C'],
  Nutritionist: ['RD', 'RDN', 'CSSD', 'CNS', 'CDCES', 'MSc Nutrition'],
};
const BSM_ALL_CERTIFICATIONS = [...BSM_MARKETPLACE_CERTIFICATIONS.Trainer, ...BSM_MARKETPLACE_CERTIFICATIONS.Nutritionist];

function escapeBSMCert(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function getCoachCertifications(coach) {
  if (coach.certifications && coach.certifications.length) return coach.certifications;
  const cred = coach.cred || '';
  return BSM_ALL_CERTIFICATIONS.filter(cert => {
    const re = new RegExp(`(^|[^A-Za-z0-9])${escapeBSMCert(cert)}(?=$|[^A-Za-z0-9])`, 'i');
    return re.test(cred);
  });
}

function getCoachRating10(coachOrRating) {
  const raw = typeof coachOrRating === 'number' ? coachOrRating : Number(coachOrRating && coachOrRating.rating);
  if (!Number.isFinite(raw)) return 0;
  const tenPoint = raw <= 5 ? raw * 2 : raw;
  return Math.max(1, Math.min(10, tenPoint));
}

function formatCoachRating10(coachOrRating) {
  return `${getCoachRating10(coachOrRating).toFixed(1)}/10`;
}

function parseProviderYears(value) {
  const parsed = Number(String(value || '').match(/\d+/)?.[0] || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}

function providerInitials(name) {
  const clean = String(name || 'S').replace(/^Dr\.\s*/i, '').trim();
  return clean ? clean[0].toUpperCase() : 'S';
}

function formatProviderCategory(value) {
  const text = String(value || '').replace(/[_-]+/g, ' ').trim();
  if (!text) return '';
  return text.replace(/\w\S*/g, word => word[0].toUpperCase() + word.slice(1).toLowerCase());
}

// Map a live provider's free-text specialty/tags → the closest marketplace
// FILTER category, so every real coach is filterable (not just demo coaches).
// Ordered most-specific → general; falls back to the role's base category.
const BSM_CAT_KEYWORDS = {
  Trainer: [
    ['Hyrox', ['hyrox']],
    ['Just for Women', ['women', 'woman', 'female', 'postpartum', 'prenatal', 'pelvic', 'hormonal', 'cycle']],
    ['Pure Running', ['running', 'runner', 'marathon', 'ultra', 'trail', 'track', '5k', '10k', 'pace', 'usatf', 'rrca']],
    ['Bodybuilding', ['bodybuilding', 'physique', 'posing', 'contest', 'ifbb', 'prep']],
    ['HIIT', ['hiit', 'metcon', 'metabolic', 'plyo', 'interval']],
    ['At Home', ['at-home', 'at home', 'home workout', 'minimal equipment', 'bodyweight', 'kettlebell', 'bands']],
    ['Mobility, Recovery & Rehab', ['mobility', 'recovery', 'rehab', 'yoga', 'prehab', 'physio', 'post-op', 'return-to-sport']],
    ['Functional & Hybrid', ['functional', 'hybrid', 'crossfit', 'olympic', 'athletic']],
    ['Cardio & Endurance', ['cardio', 'endurance', 'conditioning', 'vo2', 'cycling', 'triathlon', 'swim', 'aerobic']],
    ['Fat Burn', ['fat loss', 'fat-loss', 'fat burn', 'cutting', 'lean', 'weight loss']],
    ['Strength & Resistance', ['strength', 'resistance', 'powerlifting', 'hypertrophy', 'lifting', 'barbell']],
  ],
  Nutritionist: [
    ['Prenatal', ['prenatal', 'postnatal', 'pregnan', 'postpartum']],
    ['Plant-Based', ['plant', 'vegan', 'vegetarian']],
    ['Gut Health & Functional Nutrition', ['gut', 'fodmap', 'functional', 'digest', 'ibs']],
    ['Medical & Condition-Specific', ['medical', 'clinical', 'diabet', 'condition', 'auto-immune', 'cardiac', 'insulin', 'therapy']],
    ['Longevity & Healthspan', ['longevity', 'healthspan', 'bloodwork', 'anti-aging', 'aging']],
    ['Muscle Gain / Bulking', ['bulk', 'muscle', 'lean mass', 'recomp', 'gain']],
    ['Meal Prep', ['meal prep', 'batch', 'budget', 'prep']],
    ['Sports Performance & Hydration', ['sport', 'hydration', 'athlete', 'fueling', 'fuel']],
    ['Weight Mgmt', ['weight', 'fat loss', 'slim', 'habit']],
    ['Performance Nutrition', ['performance', 'macros', 'timing']],
  ],
};
function bsmFilterCategory(role, rawText, fallback) {
  const text = String(rawText || '').toLowerCase();
  for (const [cat, kws] of (BSM_CAT_KEYWORDS[role] || [])) {
    if (kws.some((k) => text.includes(k))) return cat;
  }
  return fallback;
}
function bsmNormalizeFormat(raw, location) {
  const f = String(raw || '').toLowerCase();
  if (/in.?person|studio|gym/.test(f)) return 'In-person';
  if (/remote|online|virtual/.test(f)) return 'Remote';
  if (/hybrid/.test(f)) return 'Hybrid';
  if (!location || /remote|online|anywhere/i.test(String(location))) return 'Remote';
  return 'Hybrid';
}

function mapSupabaseProvider(row, role) {
  const isNutritionist = role === 'Nutritionist';
  const specialty = row.specialty || row.specialty_type || formatProviderCategory(row.category);
  const tags = Array.isArray(row.tags) ? row.tags : [];
  const services = Array.isArray(row.services) ? row.services : [];
  const specs = (isNutritionist ? [...tags, ...services] : tags).filter(Boolean);
  const years = parseProviderYears(row.experience);
  const basePrice = isNutritionist
    ? (row.meal_plan_price || row.price)
    : (row.session_price || row.price);
  const rate = Math.max(1, Math.round(Number(basePrice || 0)));
  const subscribers = Number(row.subscribers || 0);
  const dbId = Number(row.id);
  const rating = Number(row.rating || 4.8);

  return {
    id: `${isNutritionist ? 'n' : 't'}${dbId}`,
    db_id: dbId,
    provider_id: dbId,
    provider_user_id: row.owner_id || null,
    provider_role: isNutritionist ? 'nutritionist' : 'trainer',
    name: row.name || (isNutritionist ? 'Shape Nutritionist' : 'Shape Trainer'),
    loc: row.location || 'Remote',
    category: bsmFilterCategory(role, [specialty, formatProviderCategory(row.category), ...specs].filter(Boolean).join(' '), isNutritionist ? 'Performance Nutrition' : 'Strength & Resistance'),
    format: bsmNormalizeFormat(row.format, row.location),
    cred: `${row.credential || 'Certified'} - ${row.experience || `${years} yrs`}`,
    certifications: row.credential ? [row.credential] : [],
    spec: specs.length ? specs.slice(0, 5) : [specialty || (isNutritionist ? 'Nutrition' : 'Training')],
    rate,
    sessions: isNutritionist ? '30-min - 1:1' : '45-min - 1:1',
    years,
    sessionCount: subscribers || Math.max(120, years * 55),
    match: Math.max(72, Math.min(98, Math.round(78 + rating * 3 + (row.featured ? 5 : 0)))),
    rating,
    clients: Math.max(8, Math.round((subscribers || 320) / 45)),
    init: providerInitials(row.name),
    bio: row.bio || `${specialty || role} support on Shape.`,
    tag: row.featured || row.trainer_of_month || row.nutritionist_of_month ? 'FEATURED' : undefined,
    stripe_product_id: row.stripe_product_id,
    stripe_price_id: row.stripe_price_id,
    stripe_account_id: row.stripe_account_id,
    stripe_account_status: row.stripe_account_status,
    at_capacity: Boolean(row.at_capacity),
    capacity_resume_at: row.capacity_resume_at || null,
    verified: Boolean(row.verified),
    monthly_offer: row.monthly_offer || null,
    // Normalized at the ingestion boundary (ownerUid = row.owner_id): every
    // render then trusts this object. A malicious/foreign URL is already dropped.
    listing_media: bsNormalizeListingMedia(row.listing_media, row.owner_id),
  };
}

async function fetchSupabaseMarketplaceProviders() {
  const client = window.ShapeAuth?.client;
  if (!client) return null;

  const [trainerResult, nutritionistResult] = await Promise.all([
    client.from('trainers').select('*').order('id', { ascending: true }),
    client.from('nutritionists').select('*').order('id', { ascending: true }),
  ]);

  if (trainerResult.error) throw trainerResult.error;
  if (nutritionistResult.error) throw nutritionistResult.error;

  return {
    Trainer: (trainerResult.data || []).map(row => mapSupabaseProvider(row, 'Trainer')),
    Nutritionist: (nutritionistResult.data || []).map(row => mapSupabaseProvider(row, 'Nutritionist')),
  };
}

function readShapeCoachThreads() {
  try {
    const raw = window.localStorage && window.localStorage.getItem('shape.clientCoachThreads');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeShapeCoachThread(coach, text, sync = {}) {
  const role = `${getPublicProfileKind(coach) === 'nutritionist' ? 'Nutritionist' : 'Trainer'} - ${coach.category || getPrimaryCredential(coach)}`;
  const now = new Date().toISOString();
  const thread = {
    id: sync.conversationId ? `conversation-${sync.conversationId}` : `coach-${coach.id}`,
    conversation_id: sync.conversationId || null,
    provider_id: coach.provider_id || coach.db_id || null,
    provider_role: coach.provider_role || getPublicProfileKind(coach),
    who: coach.name,
    role,
    last: text,
    time: sync.stored === 'supabase' ? 'synced' : 'now',
    unread: 0,
    bucket: 'COACH',
    messages: [
      { who: coach.name.split(' ')[0].replace('Dr.', '').trim() || coach.name, t: 'Thanks for reaching out. I will reply here.', time: 'auto', me: false, coach: true },
      { who: 'You', t: text, time: 'now', me: true },
    ],
    updatedAt: now,
  };
  const existing = readShapeCoachThreads();
  const idx = existing.findIndex(th => th.id === thread.id || th.conversation_id === thread.conversation_id || th.who === coach.name);
  const next = idx >= 0
    ? [
        {
          ...existing[idx],
          ...thread,
          messages: [...(existing[idx].messages || []), { who: 'You', t: text, time: sync.stored === 'supabase' ? 'synced' : 'now', me: true }],
        },
        ...existing.filter((_, i) => i !== idx),
      ]
    : [thread, ...existing];
  try {
    window.localStorage && window.localStorage.setItem('shape.clientCoachThreads', JSON.stringify(next.slice(0, 20)));
    window.dispatchEvent && window.dispatchEvent(new CustomEvent('shape:clientCoachThreadsUpdated'));
  } catch {}
  return thread;
}

const BSM_MARKETPLACE_COACHES = {
  Trainer: [
    { id: 't1', name: 'Jordan Chen', loc: 'Brooklyn, NY', category: 'Strength & Resistance', format: 'Hybrid', cred: 'NASM-CPT - 9 yrs', spec: ['Strength', 'Hypertrophy', 'Block periodization'], rate: 180, sessions: '50-min - 1:1', years: 9, sessionCount: 740, match: 96, rating: 4.9, clients: 28, init: 'J', bio: 'Block-style strength coach. Tempo-driven progressions, weekly RPE check-ins, no fluff.', tag: 'YOUR COACH',
      // Demo-only combo media (signed-out preview) — the mkBg Unsplash precedent.
      // Real coaches carry only what they upload; this proves the mixed grid.
      listing_media: { portrait: 'https://images.unsplash.com/photo-1594381898411-846e7d193883?w=400', cover: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=1000', gallery: [{ url: 'https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=600', caption: 'The floor' }, { url: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=600', caption: 'Free weights' }, { url: 'https://images.unsplash.com/photo-1549060279-7e168fcee0c2?w=600', caption: 'Conditioning corner' }], updatedAt: null } },
    { id: 't2', name: 'Maya Okafor', loc: 'Brooklyn, NY', category: 'Just for Women', format: 'In-person', cred: 'NASM-CPT - 9 yrs', spec: ['Hypertrophy', 'Women 30+', 'Posture'], rate: 165, sessions: '45-min - 1:1', years: 9, sessionCount: 690, match: 92, rating: 4.9, clients: 32, init: 'M', bio: 'Hypertrophy-first coach focused on women 30+. Big on posture and joint care.' },
    { id: 't3', name: 'Diego Morales', loc: 'Austin, TX', category: 'Bodybuilding', format: 'Hybrid', cred: 'CSCS - 7 yrs', spec: ['Powerlifting', 'Conjugate', 'Masters'], rate: 195, sessions: '60-min - 1:1', years: 7, sessionCount: 510, match: 88, rating: 4.8, clients: 21, init: 'D', bio: 'Conjugate-style powerlifting coach. Comfortable with masters lifters and rehab return.' },
    { id: 't4', name: 'Sana Bhatt', loc: 'Remote', category: 'At Home', format: 'Remote', cred: 'NSCA-CPT - 5 yrs', spec: ['Postpartum', 'At-home', 'Kettlebell'], rate: 130, sessions: '30-min - 1:1', years: 5, sessionCount: 460, match: 85, rating: 4.9, clients: 28, init: 'S', bio: 'Remote-only. Postpartum return-to-strength. Equipment-light, kettlebell-leaning.' },
    { id: 't5', name: 'Lena Park', loc: 'Los Angeles', category: 'Cardio & Endurance', format: 'Hybrid', cred: 'ACSM-CPT - 6 yrs', spec: ['Endurance', 'Z2 base', 'Marathon'], rate: 150, sessions: '45-min - 1:1', years: 6, sessionCount: 430, match: 78, rating: 4.7, clients: 19, init: 'L', bio: 'Endurance + general strength. Polarized training. Z2 evangelist.' },
    { id: 't6', name: 'Tariq Osei', loc: 'Chicago', category: 'Mobility, Recovery & Rehab', format: 'In-person', cred: 'CSCS - 11 yrs', spec: ['Olympic lift', 'Mobility', 'Rehab'], rate: 210, sessions: '60-min - 1:1', years: 11, sessionCount: 390, match: 73, rating: 4.9, clients: 14, init: 'T', bio: 'Olympic-lift coach. Mobility-first. Works with PTs on shared rehab cases.' },
    { id: 't7', name: 'Nico Alvarez', loc: 'Miami', category: 'HIIT', format: 'In-person', cred: 'ACE-CPT - 8 yrs', spec: ['HIIT', 'Conditioning', 'Fat loss'], rate: 145, sessions: '40-min - 1:1', years: 8, sessionCount: 620, match: 87, rating: 4.8, clients: 36, init: 'N', bio: 'High-density conditioning blocks built around measurable output, recovery, and repeatable effort.' },
    { id: 't8', name: 'Ari Morgan', loc: 'Denver', category: 'Hyrox', format: 'Hybrid', cred: 'HYROX-C - 4 yrs', spec: ['Hyrox', 'Comp prep', 'Engine work'], rate: 175, sessions: '50-min - 1:1', years: 4, sessionCount: 350, match: 84, rating: 4.8, clients: 17, init: 'A', bio: 'Hybrid race prep with station-specific strength, run economy, and event pacing.' },
    { id: 't9', name: 'Keisha Grant', loc: 'Atlanta', category: 'Fat Burn', format: 'Remote', cred: 'NASM-CPT - 10 yrs', spec: ['Fat Burn', 'Metabolic', 'Lifestyle'], rate: 125, sessions: '30-min - 1:1', years: 10, sessionCount: 780, match: 89, rating: 4.9, clients: 44, init: 'K', bio: 'Sustainable fat-loss programming with strength anchors and practical habit systems.' },
    { id: 't10', name: 'Owen Blake', loc: 'Boulder, CO', category: 'Pure Running', format: 'Remote', cred: 'USATF - 12 yrs', spec: ['Running', '10K', 'Marathon'], rate: 155, sessions: '45-min - 1:1', years: 12, sessionCount: 830, match: 82, rating: 4.9, clients: 31, init: 'O', bio: 'Run-specific blocks, pace testing, race plans, and strength work that supports the miles.' },
    { id: 't11', name: 'Iris Vaughn', loc: 'San Francisco', category: 'Functional & Hybrid', format: 'Hybrid', cred: 'CSCS - 8 yrs', spec: ['Functional', 'Hybrid', 'Athletic'], rate: 190, sessions: '50-min - 1:1', years: 8, sessionCount: 560, match: 86, rating: 4.8, clients: 25, init: 'I', bio: 'Athletic movement, loaded carries, mixed-modal conditioning, and durable strength.' },
    { id: 't12', name: 'Clara Hayes', loc: 'Portland, OR', category: 'Marathon', format: 'Remote', cred: 'USATF - 9 yrs', spec: ['Marathon', 'Pacing', 'Race day'], rate: 145, sessions: '45-min - 1:1', years: 9, sessionCount: 720, match: 85, rating: 4.9, clients: 34, init: 'C', bio: 'Marathon blocks built around threshold work, long-run fueling, strength maintenance, and race execution.' },
    { id: 't13', name: 'Mateo Ruiz', loc: 'Chamonix', category: 'Ultra', format: 'Hybrid', cred: 'UESCA - 10 yrs', spec: ['Ultra', 'Trail', 'Vert'], rate: 170, sessions: '50-min - 1:1', years: 10, sessionCount: 640, match: 83, rating: 4.8, clients: 27, init: 'M', bio: 'Ultra-distance coaching for trail, vert, fueling tolerance, durable legs, and back-to-back long days.' },
  ],
  Nutritionist: [
    { id: 'n1', name: 'Dr. Maya Patel', loc: 'Remote', category: 'Sports Performance & Hydration', cred: 'RD, CSSD - 12 yrs', spec: ['Sports', 'Body comp', 'Cuts/builds'], rate: 140, sessions: '30-min - 1:1', years: 12, sessionCount: 760, match: 94, rating: 5.0, clients: 41, init: 'M', bio: 'Sports-focused RD. Body-composition phases, refeeds, fueling around training.', tag: 'YOUR NUTRITIONIST',
      listing_media: { portrait: 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=400', cover: 'https://images.unsplash.com/photo-1490645935967-10de6ba17061?w=1000', gallery: [{ url: 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=600', caption: 'Prep station' }, { url: 'https://images.unsplash.com/photo-1540189549336-e6e99c3679fe?w=600', caption: 'Market haul' }, { url: 'https://images.unsplash.com/photo-1466637574441-749b8f19452f?w=600', caption: 'The pantry' }], updatedAt: null } },
    { id: 'n2', name: 'Owen Halverson', loc: 'Toronto', category: 'Plant-Based', cred: 'RDN - 8 yrs', spec: ['Endurance', 'Plant-based'], rate: 110, sessions: '30-min - 1:1', years: 8, sessionCount: 430, match: 86, rating: 4.8, clients: 24, init: 'O', bio: 'Plant-based endurance fueling. Long-form training. Race-day plans.' },
    { id: 'n3', name: 'Priya Iyer', loc: 'Remote', category: 'Gut Health & Functional Nutrition', cred: 'CNS - 6 yrs', spec: ['GI / IBS', 'Anti-inflam.', 'Cuts'], rate: 125, sessions: '45-min - 1:1', years: 6, sessionCount: 390, match: 81, rating: 4.9, clients: 18, init: 'P', bio: 'GI-sensitive eaters. Anti-inflammatory protocols, low-FODMAP cuts.' },
    { id: 'n4', name: 'Jules Bonner', loc: 'London', category: 'Medical & Condition-Specific', cred: 'RDN, CDCES - 7 yrs', spec: ['Diabetes', 'Insulin sens.', 'Family meals'], rate: 130, sessions: '45-min - 1:1', years: 7, sessionCount: 410, match: 76, rating: 4.7, clients: 22, init: 'J', bio: 'Type-2 diabetes and insulin-sensitivity work. Family-meal planning that scales.' },
    { id: 'n5', name: 'Elena Rossi', loc: 'Milan', category: 'Performance Nutrition', cred: 'RDN - 10 yrs', spec: ['Performance', 'Macros', 'Fuel timing'], rate: 150, sessions: '30-min - 1:1', years: 10, sessionCount: 610, match: 90, rating: 4.9, clients: 37, init: 'E', bio: 'Performance nutrition plans for heavy training blocks, travel weeks, and competition prep.' },
    { id: 'n6', name: 'Samira Cole', loc: 'Sydney', category: 'Muscle Gain / Bulking', cred: 'CSSD - 9 yrs', spec: ['Bulking', 'Lean mass', 'Meal cadence'], rate: 135, sessions: '30-min - 1:1', years: 9, sessionCount: 500, match: 88, rating: 4.8, clients: 29, init: 'S', bio: 'Lean-gain phases with realistic food volume, digestion support, and weekly adjustments.' },
    { id: 'n7', name: 'Ingrid Dahl', loc: 'Stockholm', category: 'Longevity & Healthspan', cred: 'MSc Nutrition - 11 yrs', spec: ['Longevity', 'Bloodwork', 'Habits'], rate: 160, sessions: '45-min - 1:1', years: 11, sessionCount: 470, match: 83, rating: 4.9, clients: 26, init: 'I', bio: 'Healthspan-focused nutrition with bloodwork review, habit architecture, and recovery support.' },
    { id: 'n8', name: 'Nadia Brooks', loc: 'Remote', category: 'Weight Mgmt', cred: 'RDN - 6 yrs', spec: ['Weight Mgmt', 'Behavior', 'Meal planning'], rate: 115, sessions: '30-min - 1:1', years: 6, sessionCount: 690, match: 87, rating: 4.8, clients: 46, init: 'N', bio: 'Weight-management support that prioritizes compliance, protein targets, and repeatable meals.' },
    { id: 'n9', name: 'Camila Torres', loc: 'Madrid', category: 'Prenatal', cred: 'RDN - 8 yrs', spec: ['Prenatal', 'Postpartum', 'Family meals'], rate: 125, sessions: '30-min - 1:1', years: 8, sessionCount: 360, match: 79, rating: 4.8, clients: 21, init: 'C', bio: 'Prenatal and postpartum nutrition plans built around training, appetite, and family routines.' },
    { id: 'n10', name: 'Theo Martin', loc: 'Copenhagen', category: 'Meal Prep', cred: 'CNS - 5 yrs', spec: ['Meal Prep', 'Budget', 'Batch cooking'], rate: 95, sessions: '30-min - 1:1', years: 5, sessionCount: 540, match: 84, rating: 4.7, clients: 33, init: 'T', bio: 'Simple prep systems for busy clients who need structure without complicated recipes.' },
  ],
};

// ═══════════════════════════════════════════════════════════
// Marketplace screen
// ═══════════════════════════════════════════════════════════
// ── Marketplace visual helpers (editorial "discovery" look, matches the app) ──
function mktRoleColor(c) {
  return getPublicProfileKind(c) === 'nutritionist' ? '#a07a2e' : '#c0533b';
}
function mktShortLoc(loc) {
  const s = String(loc || '').trim();
  return s ? s.split(',')[0] : '';
}

// THE MASTHEAD TRAILING CLUSTER (owner ruling 2026-08-01 — "same format, same
// size, no deviation"). The search circle + the member's own facet avatar, both
// sized by BS_HEADER_AVATAR and spaced by BS_CORNER_GAP, in ONE place so the
// three marketplace pages — the directory, THE LISTING, and the availability
// calendar — cannot drift. Both constants are READ, never re-typed: the chrome
// owns the values and the `|| 34` / `|| 9` fallbacks only cover load order.
// Every window global is guarded the way the rest of this file guards them.
function bsMktCorner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: (window.BS_CORNER_GAP || 9) }}>
      {window.BSSearchCorner ? React.createElement(window.BSSearchCorner, { size: (window.BS_HEADER_AVATAR || 34) }) : null}
      {window.BSFacetAvatar ? (
        <window.BSFacetAvatar
          size={(window.BS_HEADER_AVATAR || 34)}
          c={(window.bsMyTierColor && window.bsMyTierColor()) || '#8a8f98'}
          initial={(window.bsMyInitials && window.bsMyInitials()) || 'A'}
          name={(window.bsMyName && window.bsMyName()) || undefined}
          photo={(window.bsMyPhoto && window.bsMyPhoto()) || undefined}
          live={!!(window.bsAmLive && window.bsAmLive())}
          activity={window.bsMyActivity && window.bsMyActivity()}
          showRank={false}
          onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} }}
        />
      ) : null}
    </div>
  );
}


// "The Classifieds" (wave 7 — see the 2026-07-04 progress/marketplace spec):
// heat = each coach's ROLE (trainer rust / nutritionist gold), line-only —
// 3px spines on feature + listing rows and portrait frame edges. Page chrome
// keeps the teal brand accent (hero italic, section ticks, tab underline);
// role-colored TEXT demotes to ink. The old MktPill role pills died with the
// typographic index in the screen render.

function MktSectionHead({ kicker, title, action, onAction, teal }) {
  const t = useBS();
  return (
    <div style={{ padding: `0 ${t.padX}px`, marginBottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden style={{ flex: 'none', width: 6, height: 1.5, background: teal }} />
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{kicker}</span>
        </div>
        <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{title}</div>
      </div>
      {action ? (
        <button onClick={onAction} style={{ flexShrink: 0, background: 'transparent', border: 0, cursor: 'pointer', minHeight: 44, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, textDecoration: 'underline', textUnderlineOffset: 3 }}>{action} →</button>
      ) : null}
    </div>
  );
}

function MktTrackRow({ n, title, meta, right, onClick, first }) {
  const t = useBS();
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'flex', alignItems: 'baseline', gap: 10, minHeight: 44, boxSizing: 'border-box', padding: '12px 0', borderTop: first ? 0 : `1px solid ${t.HAIR}` }}>
      <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, color: t.INK50, fontWeight: 700 }}>{String(n).padStart(2, '0')}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{title}</span>
        <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{meta}</span>
      </span>
      <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)', minWidth: 14 }} />
      <span style={{ flexShrink: 0, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 800, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{right}</span>
    </button>
  );
}

// Coach's tier on the COACH ladder (Certified·Pro·Elite·Master·Icon) + its color,
// matching the living Signal profile, so marketplace cards preview the real profile.
// Two-letter initials (first letter of the first two words) for avatar fallbacks.
function mktInitials(name) {
  const p = String(name || '').trim().split(/\s+/).filter(Boolean);
  return (((p[0] || '')[0] || '') + ((p[1] || '')[0] || '')).toUpperCase() || '?';
}
// THE STANDING — a coach's rung on the coach ladder.
//
// A REAL coach's rung is their CANONICAL COACH SCORE — the very number
// /api/coach/score renders on their own Coach Score page (active clients +
// session completion + programs published), batch-resolved through
// get_coach_scores (one RPC per role for the whole directory, cached below).
// When we can't resolve it the tier is ABSENT and nothing renders — inventing a
// rung for a live coach is a fabricated credential (the honest-data rule).
//
// ⚠ NOT the member activity ledger (get_user_points). That sums a DIFFERENT
// quantity — personal workouts/habits/meals — so a successful coach with no
// personal logging showed no standing while a coach who logs their own training
// showed a rung contradicting their own Coach Score page (Codex P1). One number,
// one ladder, both surfaces.
//
// A DEMO coach (signed-out preview — no provider row) reads an AUTHORED standing
// so the preview shows a real ladder instead of one rung for everyone.
//
// The original derivation was `match×18 + sessions/5 + clients×4` → rung. It
// could not separate anyone: `match` only varies 73–96, so every demo coach
// landed in a 1,448–2,008 band and 22 of 23 read "Pro" (Master and Icon were
// unreachable), while every real coach hit the same fallback and read one
// identical fabricated tier.
const BSM_DEMO_POINTS = {
  // Signed-out preview only — never consulted for a real coach. Loosely tracks
  // each demo coach's authored tenure/roster so the ladder reads plausibly.
  t1: 5400, t2: 4600, t3: 2450, t4: 1850, t5: 1420, t6: 2900, t7: 3700,
  t8: 640, t9: 6800, t10: 16200, t11: 2300, t12: 5100, t13: 3300,
  n1: 15400, n2: 2100, n3: 1150, n4: 1680, n5: 5600, n6: 2750, n7: 3100,
  n8: 4400, n9: 900, n10: 1950,
};
const _MKT_POINTS = new Map();   // "role:providerId" -> points | null (looked up, none)
// key -> the OWNER token of the request that claimed it. A Set was not enough:
// React runs an effect's cleanup BEFORE the next effect, so a superseded request
// could release keys the NEW request had just claimed, and its late completion
// could then cache a stale answer or delete a live claim. Ownership makes both
// impossible — a request only ever writes or releases the keys it still owns.
const _MKT_POINTS_INFLIGHT = new Map();
const _MKT_CHUNK = 200;   // must stay <= the id cap inside get_coach_scores
// A coach's score key is their PROVIDER row (id + role) — the identity
// /api/coach/score is computed against. Only a mapped Supabase row has one, so
// this doubles as the real-vs-demo discriminator.
function bsmCoachScoreKey(c) {
  const pid = c && (c.provider_id || c.db_id);
  if (!pid) return null;
  const role = (c.provider_role === 'nutritionist' || getPublicProfileKind(c) === 'nutritionist') ? 'nutritionist' : 'trainer';
  return role + ':' + pid;
}
// Resolve every visible REAL coach's standing in one batch per role. Cached per
// session, so scrolling the directory or reopening a Listing never re-fetches.
function useMktCoachPoints(coaches) {
  const [, bump] = React.useState(0);
  const keys = Array.from(new Set((coaches || []).map(bsmCoachScoreKey).filter(Boolean)));
  const key = keys.join(',');
  React.useEffect(() => {
    // Skip keys already resolved OR already being fetched — the directory and an
    // open Listing both call this, and without the in-flight guard a coach opened
    // while the grid is still loading would fire a second RPC for the same id.
    const want = keys.filter((k) => !_MKT_POINTS.has(k) && !_MKT_POINTS_INFLIGHT.has(k));
    if (!want.length) return undefined;
    const owner = {};   // identity token for THIS effect run
    want.forEach((k) => _MKT_POINTS_INFLIGHT.set(k, owner));
    let on = true;
    const timers = [];
    // Settle ONE batch. `ok` separates "the server answered" from "we never
    // heard back", and it decides whether anything is cached at all:
    //   ok   → cache every key in the batch (a key the answer omits is
    //          genuinely absent — that coach has no standing yet)
    //   !ok  → cache NOTHING, release only the in-flight hold.
    // That asymmetry IS the retry: `want` filters on _MKT_POINTS.has(k), so
    // caching a failure as "absent" would make the key look resolved and
    // suppress that coach's standing for the rest of the session. A failed
    // lookup has to leave the key uncached for a later mount to ask again.
    //
    // A MISSING value must never coerce to a real reading: `Number(null)` is 0,
    // which is finite, so it would otherwise record a genuine-looking "0 points"
    // and render the bottom rung. Only a real positive number counts.
    // Takes the ROLE and the BARE ids, never a pre-joined key: the batch answer is
    // keyed by plain provider_id ({ 1: 600 }) while the cache is keyed by
    // "role:id". Reading the answer with the composite key silently missed every
    // time, so every real coach cached null and the whole feature returned no
    // tier. Keeping both forms explicit here makes that mismatch unrepresentable.
    const settle = (r, ids, map, ok) => {
      ids.forEach((id) => {
        const k = r + ':' + id;
        // Someone newer owns this key — a superseded request must not write its
        // answer over theirs, nor release their claim.
        if (_MKT_POINTS_INFLIGHT.get(k) !== owner) return;
        if (ok) {
          const raw = (map && typeof map === 'object') ? map[id] : undefined;
          const p = (raw === null || raw === undefined || raw === '') ? NaN : Number(raw);
          _MKT_POINTS.set(k, (Number.isFinite(p) && p > 0) ? p : null);
        }
        _MKT_POINTS_INFLIGHT.delete(k);
      });
      if (on) bump((n) => n + 1);
    };
    const byRole = {};
    want.forEach((k) => {
      const i = k.indexOf(':');
      const r = k.slice(0, i);
      (byRole[r] = byRole[r] || []).push(Number(k.slice(i + 1)));
    });
    // One RPC per role, CHUNKED to the function's own id cap. Without the chunk
    // a directory holding more than the cap for one role would have the extra
    // ids silently dropped by the RPC and then cached as "absent" — those
    // coaches would lose their standing for the session.
    Object.keys(byRole).forEach((r) => {
      for (let i = 0; i < byRole[r].length; i += _MKT_CHUNK) {
        const ids = byRole[r].slice(i, i + _MKT_CHUNK);
        // Race a timeout: supabase.rpc has no deadline of its own, so a stalled
        // request would otherwise never settle and would pin these keys.
        let timer = null;
        const timeout = new Promise((res) => { timer = setTimeout(() => res(undefined), 8000); });
        timers.push(() => { if (timer) clearTimeout(timer); });
        Promise.race([
          Promise.resolve().then(() => ((window.ShapeCoachScores && window.ShapeCoachScores.batch) ? window.ShapeCoachScores.batch(r, ids) : null)),
          timeout,
        ])
          // batch() answers with an object, returns null on a read fault, and
          // the timeout resolves undefined — only a real object counts as `ok`.
          .then((m) => settle(r, ids, m, !!m && typeof m === 'object'))
          .catch(() => settle(r, ids, null, false))
          .finally(() => { if (timer) clearTimeout(timer); });
      }
    });
    return () => {
      on = false;
      timers.forEach((f) => f());
      // Those cleared timers mean a still-stalled batch may now never settle, so
      // release every key this effect is still holding — otherwise it stays
      // pinned in-flight for the life of the page and no later mount can ask
      // for it again. Resolved keys are left alone (they are cached already).
      want.forEach((k) => {
        if (_MKT_POINTS_INFLIGHT.get(k) !== owner) return;   // reclaimed since — leave it
        if (!_MKT_POINTS.has(k)) _MKT_POINTS_INFLIGHT.delete(k);
      });
    };
  }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
}
// A row is DEMO only when it carries no provider identity at all. Keying the demo
// branch on "no owner id" would be wrong and dangerous: a mapped Supabase row's
// `id` is `t{serial}` / `n{serial}`, which COLLIDES with the demo ids, and
// `owner_id` is nullable (an unclaimed provider row) — so a real trainer with
// trainers.id = 1 and no owner would print the authored demo standing as their own.
function bsmIsDemoCoach(c) { return !!c && !c.provider_id && !c.db_id && !c.provider_user_id; }
function mktCoachTier(c) {
  const skey = bsmCoachScoreKey(c);
  const pts = skey ? _MKT_POINTS.get(skey) : (bsmIsDemoCoach(c) ? BSM_DEMO_POINTS[c.id] : undefined);
  // Not yet loaded, looked-up-and-absent, or a real zero all render NOTHING —
  // "hidden when none" (a coach who hasn't earned a standing has no rung to show).
  if (!Number.isFinite(pts) || pts <= 0) return { name: null, color: mktRoleColor(c), points: null };
  const clientTier = window.bsTierForPoints ? window.bsTierForPoints(pts) : null;
  const name = (clientTier && window.bsCoachTier) ? window.bsCoachTier(clientTier) : null;
  if (!name) return { name: null, color: mktRoleColor(c), points: null };
  const color = (window.bsTierColor && window.bsTierColor(String(name).toLowerCase())) || mktRoleColor(c);
  return { name, color, points: pts };
}
// Only turn a value into an <img> src when it's a real http(s)/data/blob URL
// (mirrors bsValidPhoto, which isn't exposed cross-module) — junk/blank values
// fall straight through to the initials.
function mktValidPhoto(p) {
  const s = (p == null ? '' : String(p)).trim();
  if (!s || s === 'null' || s === 'undefined') return null;
  return /^(https?:|blob:|data:image\/|\/)/i.test(s) ? s : null;
}
// Duotone-framed portrait: initials ALWAYS render as the base layer, so an
// invalid src (bad scheme) never renders an <img> and a broken load hides
// itself (onError) to reveal the initials underneath — the BSFacetAvatar
// fallback contract, here without the cross-module dependency. `spine` draws
// the role edge on the frame (the feature draws its own outer spine → omit).
function MktPortrait({ photo, name, w, h, fontSize, spine }) {
  const t = useBS();
  const src = mktValidPhoto(photo);
  return (
    <span style={{ display: 'block', position: 'relative', width: w, height: h, flexShrink: 0, border: `1px solid ${t.INK}24`, background: t.PAPER2, overflow: 'hidden' }}>
      <span aria-hidden style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontSize, fontWeight: 700, color: t.INK50 }}>{mktInitials(name)}</span>
      {src ? <img src={src} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.82)' }} /> : null}
      <span aria-hidden style={{ position: 'absolute', inset: 5, border: `1px solid ${t.PAPER}55`, pointerEvents: 'none' }} />
      {spine ? <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: spine }} /> : null}
    </span>
  );
}

// M2 "Masthead" portrait cell — a duotone-framed portrait with a role spine on
// the frame edge, serif byline, mono dateline, one stat line. The gradient card
// + tier-colored text died with the Classifieds pass; tier reads as ink text.
function MktCoachCard({ c, onOpen, photo }) {
  const t = useBS();
  const tr = useShapeTr();
  const isNutri = getPublicProfileKind(c) === 'nutritionist';
  const role = mktRoleColor(c);
  const { name: tierName } = mktCoachTier(c);
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, background: 'transparent', padding: 0 }}>
      <MktPortrait photo={photo} name={c.name} w="100%" h={122} fontSize={30} spine={role} />
      <span style={{ display: 'block', marginTop: 8, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
      <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[bsmRoleWord(tr, isNutri), tierName].filter(Boolean).join(' · ')}</span>
      <span style={{ display: 'block', marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>★ {formatCoachRating10(c)} · ${c.rate}/mo</span>
    </button>
  );
}

// One guard for a coach/provider's listing media, shared by the combo card and
// THE LISTING so the two sites can't drift: guard the object, validate the
// cover, default the gallery to an array. (Portrait rides the coachPhoto ladder.)
function mktListingMedia(entity) {
  const lm = (entity && entity.listing_media && typeof entity.listing_media === 'object') ? entity.listing_media : {};
  return { cover: mktValidPhoto(lm.cover), gallery: Array.isArray(lm.gallery) ? lm.gallery : [] };
}

// THE STUDIO — the coach's studio gallery as a captioned, swipeable strip.
// Shared by the featured combo card and THE LISTING. Photos are already
// normalized (own-bucket, image-only) by the time they reach here. Absent → null.
function MktStudioStrip({ gallery, role }) {
  const t = useBS();
  const tr = useShapeTr();
  if (!Array.isArray(gallery) || !gallery.length) return null;
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
        <span aria-hidden style={{ flex: 'none', width: 6, height: 6, background: role }} />
        <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:studio.head', { defaultValue: 'The studio' })}</span>
        <span aria-hidden style={{ flex: 1, height: 1.5, background: `linear-gradient(90deg, ${t.INK}, ${role} 70%, transparent)` }} />
        <span style={{ flex: 'none', fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:studio.photos', { defaultValue: '{count, plural, one {# photo} other {# photos}}', count: gallery.length })}</span>
      </div>
      <div className="bs-hide-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 2 }}>
        {gallery.map((g, i) => (
          <div key={i} style={{ flex: 'none', width: 116 }}>
            <div style={{ width: 116, height: 78, borderRadius: 8, border: `1px solid ${t.INK}24`, background: `center/cover no-repeat url("${g.url}")`, backgroundColor: t.PAPER2 }} aria-hidden="true" />
            {g.caption ? <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.04em', color: t.INK50, lineHeight: 1.3 }}>{g.caption}</div> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

// Featured "combo" box (E) — full-width: the coach's cover band with their
// portrait overlapping it, name + role/tier/loc/vetted line, the card price line,
// and THE STUDIO strip. Degrades by content: no gallery → no strip; no cover →
// today's portrait-cell at full width; no portrait → initials. The whole box is
// ONE role=button (the COTW precedent) so the inner strip scrolls without a
// nested <button> and a tap anywhere (incl. a photo) opens the Listing.
function MktComboCard({ c, onOpen, photo }) {
  const t = useBS();
  const tr = useShapeTr();
  const isNutri = getPublicProfileKind(c) === 'nutritionist';
  const role = mktRoleColor(c);
  const { name: tierName } = mktCoachTier(c);
  const { cover, gallery } = mktListingMedia(c);
  const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } };
  const metaLine = [bsmRoleWord(tr, isNutri), tierName, mktShortLoc(c.loc)].filter(Boolean).join(' · ')
    + (c.verified ? ` · ${tr('marketplace:listing.vetted', { defaultValue: '✓ Vetted' })}` : '');
  const nameEl = <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>;
  const metaEl = <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{metaLine}</div>;
  return (
    <div role="button" tabIndex={0} onClick={onOpen} onKeyDown={onKey} aria-label={c.name} style={{ cursor: 'pointer', border: `1px solid ${t.INK}1f`, background: t.PAPER, overflow: 'hidden' }}>
      {cover ? (
        <div>
          <div style={{ position: 'relative', height: 72, background: `center/cover no-repeat url("${cover}")`, backgroundColor: t.PAPER2 }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${t.PAPER}00, ${t.PAPER}cc)` }} />
            <span aria-hidden style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: role }} />
          </div>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', padding: '0 13px', marginTop: -26 }}>
            <div style={{ position: 'relative', zIndex: 1 }}><MktPortrait photo={photo} name={c.name} w={56} h={56} fontSize={20} spine={role} /></div>
            <div style={{ minWidth: 0, paddingBottom: 8 }}>{nameEl}{metaEl}</div>
          </div>
        </div>
      ) : (
        <div style={{ padding: 13 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <MktPortrait photo={photo} name={c.name} w={72} h={72} fontSize={26} spine={role} />
            <div style={{ minWidth: 0 }}>{nameEl}{metaEl}</div>
          </div>
        </div>
      )}
      <div style={{ padding: '8px 13px 0' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>★ {formatCoachRating10(c)} · ${c.rate}/mo</span>
      </div>
      {gallery.length ? <div style={{ padding: '12px 13px 13px' }}><MktStudioStrip gallery={gallery} role={role} /></div> : <div style={{ height: 13 }} />}
    </div>
  );
}

// Classifieds listing row — role spine, mono index, serif name, a dot leader
// running to the rate figure. A small portrait thumb (D) sits between the index
// and the name; a photo-less coach shows a same-size initials block so the thumb
// column never gaps. Role is named in the meta line (never color-only).
function MktRow({ c, onOpen, n, photo }) {
  const t = useBS();
  const tr = useShapeTr();
  const role = mktRoleColor(c);
  const isNutri = getPublicProfileKind(c) === 'nutritionist';
  const { name: tierName } = mktCoachTier(c);
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, position: 'relative', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '12px 0 12px 12px', borderTop: `1px solid ${t.HAIR}` }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, background: role }} />
      <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, fontWeight: 700 }}>{String(n).padStart(2, '0')}</span>
      {(() => {
        // D — the want-ad thumb: portrait through the coachPhoto ladder, else a
        // same-size initials block so the column stays uniform (never a gap).
        const src = mktValidPhoto(photo);
        return (
          <span aria-hidden style={{ position: 'relative', flexShrink: 0, alignSelf: 'center', width: 30, height: 36, border: `1px solid ${t.INK}24`, background: t.PAPER2, overflow: 'hidden', display: 'grid', placeItems: 'center' }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: t.INK50 }}>{mktInitials(c.name)}</span>
            {src ? <img src={src} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', filter: 'saturate(0.82)' }} /> : null}
            <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 2, background: role }} />
          </span>
        );
      })()}
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
        <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[bsmRoleWord(tr, isNutri), getPrimaryCredential(c), mktShortLoc(c.loc), tierName].filter(Boolean).join(' · ')}</span>
      </span>
      <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK50 }}>★ {formatCoachRating10(c)}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)', minWidth: 12 }} />
      <span style={{ flexShrink: 0, fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 800, color: t.INK, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>${c.rate}<span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, color: t.INK50 }}>/mo</span></span>
    </button>
  );
}

// Sample plans for preview / before any coach has published priced plans, so the
// "What's hot" rail always demonstrates the feature (tagged demo → not buyable).
const BSM_DEMO_PLANS = [
  { id: 'demo-p1', tab: 'program', name: '8-Week Hypertrophy Block', coachName: 'Diego Morales', coachId: 't3', providerRole: 'trainer', price: '$160', demo: true },
  { id: 'demo-p2', tab: 'program', name: 'Powerbuilding Foundations', coachName: 'Jordan Chen', coachId: 't1', providerRole: 'trainer', price: '$180', demo: true },
  { id: 'demo-p3', tab: 'program', name: 'Marathon Base Builder', coachName: 'Clara Hayes', coachId: 't12', providerRole: 'trainer', price: '$140', demo: true },
  { id: 'demo-w1', tab: 'workout', name: 'Heavy Pull Day', coachName: 'Diego Morales', coachId: 't3', providerRole: 'trainer', price: '$32', demo: true },
  { id: 'demo-w2', tab: 'workout', name: 'Full-Body HIIT', coachName: 'Nico Alvarez', coachId: 't7', providerRole: 'trainer', price: '$28', demo: true },
  { id: 'demo-w3', tab: 'workout', name: 'Mobility Reset', coachName: 'Tariq Osei', coachId: 't6', providerRole: 'trainer', price: '$24', demo: true },
  { id: 'demo-m1', tab: 'meal', name: 'High-Protein Cut · 2 Weeks', coachName: 'Nadia Brooks', coachId: 'n8', providerRole: 'nutritionist', price: '$120', demo: true },
  { id: 'demo-m2', tab: 'meal', name: 'Plant-Based Performance', coachName: 'Owen Halverson', coachId: 'n2', providerRole: 'nutritionist', price: '$95', demo: true },
  { id: 'demo-m3', tab: 'meal', name: 'Gut-Health Reset Plan', coachName: 'Priya Iyer', coachId: 'n3', providerRole: 'nutritionist', price: '$130', demo: true },
];
function BSMarketplaceScreen({ onBack, onProfile, initialRole, goChat, initialCoach = null, onCoachConsumed = null }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [pill, setPill] = useStateBSM2(initialRole === 'nutritionist' ? 'Nutritionists' : 'All');
  const [cat, setCat] = useStateBSM2('All Categories');
  const [format, setFormat] = useStateBSM2('All formats');
  const [loc, setLoc] = useStateBSM2('Anywhere');
  const [sort, setSort] = useStateBSM2('Most Popular');
  const [query, setQuery] = useStateBSM2('');
  const [forceList, setForceList] = useStateBSM2(false);
  const [open, setOpen] = useStateBSM2(null);
  // The tapped coach's 1-based position in the numbered listings (LISTING Nº) —
  // null from the feature/featured/plan-rail doors, which aren't numbered rows.
  const [openNo, setOpenNo] = useStateBSM2(null);
  const [applyRole, setApplyRole] = useStateBSM2(null);
  const [remoteCoaches, setRemoteCoaches] = useStateBSM2(null);
  const [providersLoading, setProvidersLoading] = useStateBSM2(false);
  const [providersError, setProvidersError] = useStateBSM2('');
  // Live marketplace plans (published, priced coach_plans across all coaches).
  const [marketPlans, setMarketPlans] = useStateBSM2(null);
  const [planTab, setPlanTab] = useStateBSM2('program');
  const [buyingId, setBuyingId] = useStateBSM2(null);
  useEffectBSM2(() => {
    let on = true;
    if (window.ShapeMarketPlans?.list) window.ShapeMarketPlans.list().then((r) => { if (on) setMarketPlans(Array.isArray(r) ? r : []); }).catch(() => { if (on) setMarketPlans([]); });
    return () => { on = false; };
  }, []);
  const buyPlan = async (pl) => {
    if (buyingId) return;
    setBuyingId(pl.id);
    try {
      const url = await window.ShapeMarketPlans.buy({ plan: { id: pl.id, name: pl.name, price: pl.price }, providerRole: pl.providerRole, providerId: pl.providerId });
      if (url) { try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { window.location.href = url; } }
    } catch (e) { window.__bsToast?.(e?.message || 'Sign in to buy this plan.', 'err'); }
    finally { setBuyingId(null); }
  };

  useEffectBSM2(() => {
    let active = true;
    setProvidersLoading(true);
    setProvidersError('');
    fetchSupabaseMarketplaceProviders()
      .then((next) => {
        if (!active) return;
        if (next && (next.Trainer?.length || next.Nutritionist?.length)) setRemoteCoaches(next);
      })
      .catch((error) => { if (active) setProvidersError(error?.message || 'Live provider sync unavailable.'); })
      .finally(() => { if (active) setProvidersLoading(false); });
    return () => { active = false; };
  }, []);

  // Deep-open a specific coach's Listing (a chat coach_invite card / any
  // openMarket dispatch carrying coachId): once the live providers land, find
  // the coach by role + provider id and open them directly. An unknown id
  // (unpublished/removed listing) honestly stays on the directory. ONE-SHOT:
  // handling it (hit or miss) tells the shell to clear the target, so a later
  // ordinary marketplace open can never replay a stale deep link.
  useEffectBSM2(() => {
    if (!initialCoach || !remoteCoaches) return;
    const pool = initialCoach.role === 'nutritionist' ? (remoteCoaches.Nutritionist || []) : (remoteCoaches.Trainer || []);
    const hit = pool.find((c) => Number(c.provider_id) === Number(initialCoach.providerId));
    if (hit) { setOpen(hit); setOpenNo(null); }
    if (onCoachConsumed) onCoachConsumed();
  }, [initialCoach, remoteCoaches]);

  // Demo fallback: the "YOUR COACH"/"YOUR NUTRITIONIST" relationship badges are
  // honest only in the signed-out preview — strip them for a signed-in account
  // (they have no such coach) so the fallback can't imply a relationship.
  const _bsmSignedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
  const _bsmStripTag = (c) => ((c.tag === 'YOUR COACH' || c.tag === 'YOUR NUTRITIONIST') ? { ...c, tag: undefined } : c);
  const marketplaceCoaches = remoteCoaches || (_bsmSignedIn
    ? { Trainer: (BSM_MARKETPLACE_COACHES.Trainer || []).map(_bsmStripTag), Nutritionist: (BSM_MARKETPLACE_COACHES.Nutritionist || []).map(_bsmStripTag) }
    : BSM_MARKETPLACE_COACHES);
  const trainers = marketplaceCoaches.Trainer || [];
  const nutritionists = marketplaceCoaches.Nutritionist || [];
  const everyone = useMemoBSM2(() => [...trainers, ...nutritionists], [trainers, nutritionists]);
  // Resolve every REAL coach's Shape Score points in one batch so their rung is
  // their own standing, not a derived guess (demo coaches read BSM_DEMO_POINTS).
  useMktCoachPoints(everyone);

  // Real profile photos for live coaches (those with an account) — shown in the
  // facet avatar; demo coaches fall back to initials.
  const [avatarByUser, setAvatarByUser] = useStateBSM2({});
  useEffectBSM2(() => {
    const ids = [...new Set((everyone || []).map((c) => c.provider_user_id).filter(Boolean))];
    if (!ids.length || !(window.ShapeProfiles && window.ShapeProfiles.getUserAvatars)) return;
    let on = true;
    window.ShapeProfiles.getUserAvatars(ids).then((m) => { if (on && m) setAvatarByUser(m); }).catch(() => {});
    return () => { on = false; };
  }, [everyone]);
  // Portrait ladder: the coach's listing portrait (normalized — an invalid one
  // is already null and falls through) → their profile photo/avatar → the
  // fetched account avatar → initials (MktPortrait's own fallback).
  const coachPhoto = (c) => (c && ((c.listing_media && c.listing_media.portrait) || c.photo || c.avatar || (c.provider_user_id ? avatarByUser[c.provider_user_id] : null))) || undefined;

  // Filter tab STATE values stay English (the logic branches on them); only the
  // displayed label localizes.
  const pills = ['All', 'Trainers', 'Nutritionists'];
  const pillLabel = (p) => p === 'Trainers'
    ? tr('marketplace:dir.tabTrainers', { defaultValue: 'Trainers' })
    : p === 'Nutritionists'
      ? tr('marketplace:dir.tabNutritionists', { defaultValue: 'Nutritionists' })
      : tr('marketplace:dir.tabAll', { defaultValue: 'All' });
  // Fixed filter-enum labels (value stays English for the filter comparison).
  const fmtLabel = (f) => ({
    'All formats': tr('marketplace:format.all', { defaultValue: 'All formats' }),
    'In-person': tr('marketplace:format.inPerson', { defaultValue: 'In-person' }),
    'Remote': tr('marketplace:format.remote', { defaultValue: 'Remote' }),
    'Hybrid': tr('marketplace:format.hybrid', { defaultValue: 'Hybrid' }),
  }[f] || f);
  const sortLabel = (s) => ({
    'Most Popular': tr('marketplace:sort.popular', { defaultValue: 'Most Popular' }),
    'Highest Rated': tr('marketplace:sort.rated', { defaultValue: 'Highest Rated' }),
    'Lowest Price': tr('marketplace:sort.price', { defaultValue: 'Lowest Price' }),
    'Most Experience': tr('marketplace:sort.experience', { defaultValue: 'Most Experience' }),
  }[s] || s);

  const list = useMemoBSM2(() => {
    let out = everyone;
    if (pill === 'Trainers') out = trainers;
    else if (pill === 'Nutritionists') out = nutritionists;
    if (cat && cat !== 'All Categories') {
      out = out.filter((c) => {
        const hay = [c.category, ...(c.spec || []), c.role].filter(Boolean).map((v) => String(v).toLowerCase());
        const needle = String(cat).toLowerCase();
        return hay.some((v) => v === needle || v.includes(needle) || needle.includes(v));
      });
    }
    if (format && format !== 'All formats') {
      out = out.filter((c) => String(c.format || '').toLowerCase() === format.toLowerCase());
    }
    if (loc && loc !== 'Anywhere') {
      if (/remote/i.test(loc)) out = out.filter((c) => /remote|hybrid/i.test(String(c.format || '')) || /remote/i.test(String(c.loc || '')));
      else out = out.filter((c) => String(c.loc || '').toLowerCase().includes(loc.toLowerCase()));
    }
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((c) =>
        [c.name, c.loc, c.cred, c.category, c.format, ...(c.spec || []), ...getCoachCertifications(c)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    const num = (v) => Number(String(v).replace(/[^0-9.]/g, '')) || 0;
    const sorted = [...out];
    if (sort === 'Highest Rated') sorted.sort((a, b) => (b.rating || 0) - (a.rating || 0));
    else if (sort === 'Lowest Price') sorted.sort((a, b) => num(a.rate) - num(b.rate));
    else if (sort === 'Most Experience') sorted.sort((a, b) => (b.years || 0) - (a.years || 0));
    else sorted.sort((a, b) => ((b.match || 0) + (b.rating || 0) * 5) - ((a.match || 0) + (a.rating || 0) * 5)); // Most Popular
    return sorted;
  }, [pill, cat, format, loc, sort, query, everyone, trainers, nutritionists]);

  const browsing = forceList || pill !== 'All' || query.trim().length > 0;

  const ranked = useMemoBSM2(
    () => [...everyone].sort((a, b) => ((b.match || 0) + (b.rating || 0) * 5) - ((a.match || 0) + (a.rating || 0) * 5)),
    [everyone],
  );
  const cotw = ranked.find((c) => c.tag) || ranked[0];
  const cotwProfile = cotw ? buildPublicProfile(cotw) : null;
  const featuredWeek = ranked.filter((c) => !cotw || c.id !== cotw.id).slice(0, 4);
  const pickPill = (p) => { setPill(p); setForceList(false); setCat('All Categories'); setFormat('All formats'); setLoc('Anywhere'); };
  const roleKey = pill === 'Trainers' ? 'Trainer' : pill === 'Nutritionists' ? 'Nutritionist' : null;
  const catList = roleKey ? BSM_MARKETPLACE_CATEGORIES[roleKey] : null;
  const locList = roleKey ? BSM_MARKETPLACE_LOCATIONS[roleKey] : null;

  if (applyRole && window.BSProviderApplicationScreen) {
    return <window.BSProviderApplicationScreen initialRole={applyRole} onBack={() => setApplyRole(null)} />;
  }
  if (open) {
    // Tapping a coach opens THE LISTING (the marketplace conversion page,
    // spec 2026-07-09). The Signal living profile stays reachable from the
    // Listing's THE FULL PROFILE → leader — never replaced.
    return <BSCoachDetailPublic coach={open} no={openNo} photo={coachPhoto(open)} goChat={goChat} onBack={() => { setOpen(null); setOpenNo(null); }} />;
  }

  return (
    <BSPage>
      {/* Hero — standard masthead band (logo + Vol·No row at the 64px page
          buffer, tools on the right), matching BSPageHeader on every other page. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {window.BSLogo ? <window.BSLogo size={16} color={t.INK} /> : null}
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>{tr('marketplace:masthead.volNo', { defaultValue: 'Vol. 1 · No. 1' })}</div>
          </div>
          {bsMktCorner()}
        </div>
        {/* Universal back row — own row, flush left, under the mast (2026-07-14). */}
        <div style={{ marginTop: 12 }}>
          <button onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, padding: '8px 2px', lineHeight: 1 }}><span aria-hidden style={{ fontSize: 11, lineHeight: 1 }}>←</span>{tr('common:action.back', { defaultValue: 'Back' })}</button>
        </div>
        {/* The Classifieds eyebrow — the marketplace is the paper's listings section */}
        <div style={{ margin: '8px 0 0', display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden style={{ flex: 'none', width: 10, height: 2, background: teal }} />
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:dir.eyebrow', { defaultValue: 'The classifieds' })}</span>
        </div>
        <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.04em', color: t.INK }}>
          {tr('marketplace:dir.title1', { defaultValue: 'Find your' })}<br /><span style={{ fontStyle: 'italic', color: teal }}>{tr('marketplace:dir.title2', { defaultValue: 'coach.' })}</span>
        </h1>
      </div>

      {/* Search — an underline, not a pill (Classifieds pass) */}
      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 2px', borderBottom: `1.5px solid ${t.INK}4d` }}>
          <span aria-hidden style={{ fontSize: 14, color: t.INK50 }}>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={tr('marketplace:dir.searchPlaceholder', { defaultValue: 'Coaches, plans, playlists…' })} style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, letterSpacing: '-0.005em', padding: 0, minWidth: 0 }} />
          {query ? <button onClick={() => setQuery('')} aria-label={tr('marketplace:dir.clearSearch', { defaultValue: 'Clear search' })} style={{ border: 0, background: 'transparent', color: t.INK50, cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '0 4px' }}>×</button> : null}
        </div>
      </div>

      {/* Role index — typographic tabs on a hairline, teal (page-chrome) underline */}
      <div role="tablist" aria-label={tr('marketplace:dir.filterAria', { defaultValue: 'Filter coaches by role' })} style={{ margin: `12px ${t.padX}px ${catList ? 10 : 14}px`, display: 'flex', borderBottom: `1px solid ${t.INK}17` }}>
        {pills.map((p) => { const on = pill === p && !(p === 'All' && forceList); return (
          <button key={p} role="tab" aria-selected={on} onClick={() => pickPill(p)} style={{ flex: 1, minWidth: 0, minHeight: 44, position: 'relative', background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 0 11px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>
            {pillLabel(p)}
            {on && <span aria-hidden style={{ position: 'absolute', left: '20%', right: '20%', bottom: -1, height: 2, background: teal }} />}
          </button>
        ); })}
      </div>

      {/* Category sub-filters — role-specific dropdowns (compact) */}
      {catList && (() => {
        const sel = { flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 10, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 12.5, outline: 'none' };
        return (
        <div style={{ padding: `0 ${t.padX}px 16px`, display: 'flex', flexDirection: 'column', gap: 8, minWidth: 0 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={cat} onChange={(e) => setCat(e.target.value)} style={sel}>
              {catList.map((ct) => <option key={ct} value={ct}>{ct === 'All Categories' ? tr('marketplace:filter.allCategories', { defaultValue: 'All categories' }) : ct}</option>)}
            </select>
            {pill === 'Trainers' && (
              <select value={format} onChange={(e) => setFormat(e.target.value)} style={sel}>
                {BSM_MARKETPLACE_FORMATS.map((f) => <option key={f} value={f}>{fmtLabel(f)}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={loc} onChange={(e) => setLoc(e.target.value)} style={sel}>
              {(locList || ['Anywhere']).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={sel}>
              {BSM_MARKETPLACE_SORTS.map((s) => <option key={s} value={s}>{sortLabel(s)}</option>)}
            </select>
          </div>
        </div>
        );
      })()}

      {(providersLoading || providersError) ? (
        <div style={{ padding: `0 ${t.padX}px 10px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: providersError ? t.RUST : t.INK50, fontWeight: 700 }}>
          {providersLoading ? tr('marketplace:dir.syncingProviders', { defaultValue: 'Syncing live providers…' }) : tr('marketplace:dir.demoData', { defaultValue: 'Demo data · {error}', error: providersError })}
        </div>
      ) : null}

      {browsing ? (
        <>
          <MktSectionHead kicker={cat && cat !== 'All Categories' ? cat : (pill === 'All' ? tr('marketplace:dir.kickerEveryone', { defaultValue: 'Everyone' }) : pillLabel(pill))} title={tr('marketplace:dir.onTheBooks', { defaultValue: '{count} on the books', count: list.length })} teal={teal} />
          <div style={{ padding: `0 ${t.padX}px`, display: 'flex', flexDirection: 'column' }}>
            {list.map((c, i) => <MktRow key={c.id} c={c} n={i + 1} photo={coachPhoto(c)} onOpen={() => { setOpenNo(i + 1); setOpen(c); }} />)}
            {list.length === 0 ? <div style={{ padding: '20px 0', fontFamily: t.DISPLAY, fontSize: 15, color: t.INK50 }}>{tr('marketplace:dir.noMatch', { defaultValue: 'No coaches match that — try a different filter.' })}</div> : null}
          </div>
        </>
      ) : (
        <>
          {/* Coach of the week — the front-page FEATURE: a role-spined notice with
              a framed portrait (M2 graft), serif byline + role-heat period, italic
              pull quote, inline ledger stats, the tracklist, an underlined action. */}
          {cotw && cotwProfile ? (() => {
            const ct = mktCoachTier(cotw);
            const role = mktRoleColor(cotw);
            const isN = getPublicProfileKind(cotw) === 'nutritionist';
            const photo = coachPhoto(cotw);
            return (
            <div style={{ padding: `0 ${t.padX}px` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span aria-hidden style={{ flex: 'none', width: 6, height: 1.5, background: teal }} />
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:dir.featureEyebrow', { defaultValue: 'Feature · Coach of the week' })}</span>
              </div>
              <div onClick={() => setOpen(cotw)} role="button" tabIndex={0} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpen(cotw); } }} style={{ cursor: 'pointer', marginTop: 10, position: 'relative', paddingLeft: 13 }}>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 2, bottom: 2, width: 3, background: role }} />
                <div style={{ display: 'flex', gap: 13 }}>
                  <MktPortrait photo={photo} name={cotw.name} w={96} h={118} fontSize={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.05 }}>{cotw.name}<span style={{ color: role }}>.</span></div>
                    <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[bsmRoleWord(tr, isN), ct.name, mktShortLoc(cotw.loc)].filter(Boolean).join(' · ')}</div>
                    <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13, lineHeight: 1.35, letterSpacing: '-0.01em', color: t.INK70, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>“{cotw.bio}”</div>
                    <div style={{ display: 'flex', gap: 22, marginTop: 10 }}>
                      {[[tr('marketplace:stat.rating', { defaultValue: 'Rating' }), '★ ' + formatCoachRating10(cotw)], [tr('marketplace:stat.clients', { defaultValue: 'Clients' }), (cotw.clients || 0) + '+'], [tr('marketplace:stat.years', { defaultValue: 'Years' }), String(cotw.years || 1)]].map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
                          <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 800, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* tracklist */}
                <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:dir.tracklist', { defaultValue: 'Tracklist' })}</div>
                <div style={{ marginTop: 1 }}>
                  {cotwProfile.packages.slice(0, 3).map((p, i) => (
                    <MktTrackRow key={p.name} n={i + 1} title={p.name} meta={`${p.unit === '/ month' ? tr('marketplace:pkg.monthly', { defaultValue: 'Monthly' }) : tr('marketplace:pkg.oneTime', { defaultValue: 'One-time' })} · ${tr('marketplace:pkg.included', { defaultValue: '{count} included', count: p.perks.length })}`} right={p.price} first={i === 0} onClick={() => setOpen(cotw)} />
                  ))}
                </div>
                <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, textDecoration: 'underline', textUnderlineOffset: 3 }}>{tr('marketplace:dir.seeProfile', { defaultValue: 'See the profile →' })}</div>
              </div>
            </div>
            );
          })() : null}

          {/* Featured this week — stacked full-width combo boxes (E). Every cell
              renders full-width in the new section, media or not; a media-less
              coach's box degrades to today's cell content at the new width. */}
          <div style={{ marginTop: 26 }}>
            <MktSectionHead kicker={tr('marketplace:dir.rosterKicker', { defaultValue: 'On the roster' })} title={tr('marketplace:dir.thisWeek', { defaultValue: 'This week' })} action={tr('marketplace:dir.seeAll', { defaultValue: 'See all' })} onAction={() => setForceList(true)} teal={teal} />
            <div style={{ padding: `0 ${t.padX}px`, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {featuredWeek.map((c) => <MktComboCard key={c.id} c={c} photo={coachPhoto(c)} onOpen={() => setOpen(c)} />)}
            </div>
          </div>

          {/* What's hot — real published plans across coaches, tabbed by kind */}
          {(() => {
            const PLAN_TABS = [
              ['program', tr('marketplace:plan.programs', { defaultValue: 'Programs' }), tr('marketplace:plan.programsLower', { defaultValue: 'programs' })],
              ['workout', tr('marketplace:plan.workouts', { defaultValue: 'Workouts' }), tr('marketplace:plan.workoutsLower', { defaultValue: 'workouts' })],
              ['meal', tr('marketplace:plan.mealPlans', { defaultValue: 'Meal plans' }), tr('marketplace:plan.mealPlansLower', { defaultValue: 'meal plans' })],
            ];
            // Live published plans when present; else sample plans so the rail is
            // populated in preview / before any coach has published.
            const live = Array.isArray(marketPlans) ? marketPlans : [];
            // Sample plans are the SIGNED-OUT preview only. A signed-in member
            // seeing them would be shown fabricated coach offerings — priced,
            // with working taps — for plans nobody published (the demo-leak
            // rule). With no live plans they get the honest empty state below.
            const all = live.length ? live : (_bsmSignedIn ? [] : BSM_DEMO_PLANS);
            const tabPlans = all.filter((p) => p.tab === planTab).slice(0, 8);
            // Mono underline toggles (the rounded pills died with the Classifieds pass).
            const tabPill = (on) => ({ flex: 'none', minHeight: 40, background: 'transparent', border: 0, cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${on ? teal : 'transparent'}`, padding: '6px 2px 8px',
              color: on ? t.INK : t.INK50, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' });
            return (
            <div style={{ marginTop: 28 }}>
              <MktSectionHead kicker={tr('marketplace:dir.fromCoaches', { defaultValue: 'From coaches' })} title={tr('marketplace:dir.whatsHot', { defaultValue: "What's hot" })} teal={teal} />
              <div style={{ display: 'flex', gap: 7, padding: `0 ${t.padX}px 12px` }}>
                {PLAN_TABS.map(([k, label]) => <button key={k} onClick={() => setPlanTab(k)} style={tabPill(planTab === k)}>{label}</button>)}
              </div>
              <div style={{ padding: `0 ${t.padX}px` }}>
                {tabPlans.length === 0 ? (
                  <div style={{ padding: '14px 0', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>{tr('marketplace:dir.noPlansYet', { defaultValue: 'No {label} listed yet — check back soon.', label: (PLAN_TABS.find(([k]) => k === planTab) || [])[2] || '' })}</div>
                ) : tabPlans.map((pl, i) => (
                  <MktTrackRow key={pl.id} n={i + 1} title={pl.name} meta={`${bsmRoleWord(tr, pl.providerRole === 'nutritionist')} · ${pl.coachName}`} right={pl.price || tr('marketplace:dir.view', { defaultValue: 'View' })} first={i === 0} onClick={() => {
                    // Tap a hot plan → open that coach's page (their storefront, where
                    // the plan + Buy live). Real coaches resolve to their live account;
                    // sample plans open the demo coach's derived detail page — every
                    // row is a working link, never a dead toast.
                    // Both ids, in their OWN fields. This previously put the
                    // provider ROW id (a bigint) into `provider_user_id`, which
                    // everywhere else holds the owner's user UUID (see the
                    // canonical mapping above, the avatar batch, and the
                    // `userId` passthrough). So a coach opened from this rail
                    // had no provider_id — no tier, no points — AND a bigint
                    // where a uuid was expected, so the avatar lookup missed and
                    // the downstream userId was wrong. Two distinct id spaces.
                    // A DEMO row carries its roster coach id (and no provider
                    // identity), so the opened page resolves that coach's demo
                    // standing + avatar instead of `BSM_DEMO_POINTS[undefined]`.
                    // The sample plans name real directory coaches for exactly
                    // this reason — a rail advertising coaches who don't exist
                    // in the directory opened a page with no identity at all.
                    setOpen({ name: pl.coachName, id: (pl.demo && pl.coachId) || undefined, provider_id: (!pl.demo && pl.providerId) || undefined, provider_user_id: (!pl.demo && pl.ownerId) || undefined, provider_role: pl.providerRole, init: String(pl.coachName || '?').trim()[0] || '?', loc: 'Remote' });
                  }} />
                ))}
              </div>
            </div>
            );
          })()}

          {/* Coach apply CTAs — zero-box notices on an AMBER recruiting spine
              (semantic accent, line-only; text demoted to ink). Discovery view only. */}
          <div style={{ margin: `28px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {[{ role: 'trainer', label: tr('marketplace:role.trainerLower', { defaultValue: 'trainer' }) }, { role: 'nutritionist', label: tr('marketplace:role.nutritionistLower', { defaultValue: 'nutritionist' }) }].map((b) => (
              <button key={b.role} onClick={() => setApplyRole(b.role)} style={{ position: 'relative', textAlign: 'left', cursor: 'pointer', border: 0, background: 'transparent', padding: '2px 0 2px 11px', minHeight: 44 }}>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 2, bottom: 2, width: 3, background: t.AMBER }} />
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:apply.eyebrow', { defaultValue: 'Coaches' })}</div>
                <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.15 }}>{tr('marketplace:apply.applyToBe', { defaultValue: 'Apply to be a' })} <span style={{ fontStyle: 'italic' }}>{b.label}.</span></div>
                <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, textDecoration: 'underline', textUnderlineOffset: 3 }}>{tr('marketplace:apply.apply', { defaultValue: 'Apply →' })}</div>
              </button>
            ))}
          </div>
        </>
      )}

      <BSFooter right={tr('marketplace:footer.marketplace', { defaultValue: 'Marketplace' })} />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// Headshot — newspaper halftone-style portrait stand-in
// ═══════════════════════════════════════════════════════════
function BSHeadshot({ init, size = 72 }) {
  const t = useBS();
  return (
    <div style={{
      position: 'relative', width: size, height: size, flexShrink: 0,
      background: t.PAPER2,
      border: `1px solid ${t.INK}`,
      borderRadius: '50%',
      overflow: 'hidden',
    }}>
      {/* Halftone dot field */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        backgroundImage: `radial-gradient(${t.INK} 0.9px, transparent 1.4px)`,
        backgroundSize: '4px 4px',
        opacity: 0.45,
        maskImage: 'radial-gradient(circle at 50% 38%, black 0%, black 35%, transparent 78%)',
        WebkitMaskImage: 'radial-gradient(circle at 50% 38%, black 0%, black 35%, transparent 78%)',
      }} />
      {/* Subtle vertical stripe to mimic newsprint */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0,
        background: `linear-gradient(180deg, transparent 65%, ${t.INK} 200%)`,
        opacity: 0.18,
      }} />
      {/* Initial */}
      <div style={{
        position: 'absolute', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: t.DISPLAY, fontWeight: 700, fontSize: size * 0.5,
        color: t.INK, letterSpacing: '-0.04em',
      }}>{init}</div>
    </div>
  );
}

function getPublicProfileKind(coach) {
  if (coach?.provider_role === 'nutritionist' || coach?.kind === 'nutritionist') return 'nutritionist';
  if (coach?.provider_role === 'trainer' || coach?.kind === 'trainer') return 'trainer';
  return coach.id && coach.id.startsWith('n') ? 'nutritionist' : 'trainer';
}

function getPrimaryCredential(coach) {
  const cred = coach.cred || '';
  return cred.split(' - ')[0].split(' · ')[0].split(' Â· ')[0] || cred;
}

function buildPublicProfile(coach) {
  const kind = getPublicProfileKind(coach);
  const isNutritionist = kind === 'nutritionist';
  const first = coach.name.split(' ')[0].replace('Dr.', '').trim() || coach.name.split(' ')[0];
  // A rate can be absent (e.g. the plans-rail door builds a minimal coach) —
  // fall back so package math never renders $NaN.
  const rate = Number(coach.rate) || (isNutritionist ? 120 : 140);
  const monthly = isNutritionist ? Math.max(240, rate * 2 + 60) : Math.max(240, rate * 2 - 40);
  const program = isNutritionist ? Math.max(180, rate + 100) : Math.max(160, rate + 15);
  const single = isNutritionist ? Math.max(28, Math.round(rate * 0.25)) : Math.max(32, Math.round(rate * 0.2));
  const sampleBlocks = isNutritionist
    ? [
        ['07:00', 'Pre-training', 'Oats, berries, whey', '55g carbs - 30g protein'],
        ['09:30', 'Post-training', 'Shake + banana', '50g protein - 30g carbs'],
        ['12:30', 'Lunch', 'Chicken, rice, greens', '55g protein - 80g carbs'],
        ['16:00', 'Snack', 'Greek yogurt + almonds', '20g protein'],
        ['19:30', 'Dinner', 'Salmon, potato, veg', '45g protein - 60g carbs'],
      ]
    : [
        ['A', coach.category && coach.category.includes('Running') ? 'Threshold run' : 'Primary lift', '4 sets at working pace', 'Main focus for the day'],
        ['B1', 'Accessory one', '3 x 8-10', 'Progressive load'],
        ['B2', 'Accessory two', '3 x 10-12', 'Controlled tempo'],
        ['C', 'Conditioning', '8-12 min', 'Repeatable effort'],
        ['D', 'Recovery notes', 'Mobility + log', 'Next-session adjustment'],
      ];

  return {
    kind,
    role: isNutritionist ? 'Nutritionist' : 'Trainer',
    eyebrow: `${isNutritionist ? 'Nutritionist' : 'Trainer'} - ${coach.loc} - ${getPrimaryCredential(coach)}`,
    first,
    headline: isNutritionist
      ? `${coach.category || 'Performance nutrition'} for training, recovery, and real life.`
      : `${coach.category || 'Strength coaching'} built around clear blocks and measurable progress.`,
    tagline: coach.bio,
    philosophy: isNutritionist
      ? 'Food is fuel, not a moral test. The plan should be specific enough to help and simple enough to repeat when life gets busy.'
      : 'Get strong, move well, and recover enough to repeat it. The work is measured, written down, and adjusted every week.',
    // No `score`/`tier` here — a coach's standing is their REAL Shape Score points
    // (mktCoachTier), never a figure derived from match% + session counts.
    sessionsLabel: isNutritionist ? 'Plans delivered' : 'Sessions delivered',
    packages: [
      {
        type: 'One-time',
        name: isNutritionist ? 'Single meal plan' : 'Single workout',
        price: `$${single}`,
        unit: 'one-time',
        sub: isNutritionist ? 'One day-of plan with macros, swaps, and prep notes.' : 'One written workout with video cues and substitutions.',
        perks: isNutritionist
          ? ['Pre-built meal plan', 'Shopping list', 'Macro targets', 'Swap-in alternates']
          : ['Full sets and reps', 'Movement cues', 'Equipment substitutions', 'Log inside Shape'],
      },
      {
        type: 'One-time',
        name: isNutritionist ? 'Fueling program' : 'Program',
        price: `$${program}`,
        unit: 'one-time',
        sub: isNutritionist ? 'Six-week pre-built nutrition block.' : 'Six-week pre-built training block.',
        perks: isNutritionist
          ? ['Training-day targets', 'Rest-day targets', 'Grocery templates', 'Supplement notes']
          : ['Six weeks of workouts', 'Progressive loading', 'Weekly walkthroughs', 'Keeps access forever'],
      },
      {
        type: 'Subscription',
        name: 'Monthly - custom',
        price: `$${monthly}`,
        unit: '/ month',
        featured: true,
        sub: isNutritionist ? 'A custom plan updated around your training and check-ins.' : 'Custom programming updated from your logs each week.',
        perks: isNutritionist
          ? ['Custom monthly plan', 'Unlimited async check-ins', 'Monthly video call', 'Cancel anytime']
          : ['Custom workouts', 'Weekly updates', 'Async form checks', 'Monthly check-in call'],
      },
    ],
    sampleTitle: isNutritionist ? 'Performance day - lifting' : `${coach.spec[0] || 'Strength'} block - week 4`,
    sampleMeta: isNutritionist ? '~2,650 kcal - 180g protein' : 'RPE 7-8 - 45 to 60 min',
    sampleBlocks,
    // Real calendar days (today + 6) over the demo time pattern — every slot
    // carries its actual date (the hardcoded May dates died with the Listing).
    // Row shape: [dayName, dayOfMonth, times[], isoDate, monthShort].
    availability: (() => {
      const pat = [['12:00', '17:30'], ['14:00'], ['09:00'], ['--'], ['07:00', '17:30'], ['06:30', '18:00'], ['--']];
      const names = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(); d.setDate(d.getDate() + i);
        const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        return [names[d.getDay()], String(d.getDate()), pat[i], iso, months[d.getMonth()]];
      });
    })(),
    // Demo single-item shelf (browse/preview coaches only — live coaches list
    // theirs via coach_plans): individually buyable one-off files.
    singles: isNutritionist
      ? [
          { name: 'Race-week fueling plan', meta: 'One day, timed to your event', price: `$${Math.max(18, single - 6)}` },
          { name: 'High-protein reset day', meta: 'Meals + grocery list', price: `$${single}` },
          { name: 'Restaurant survival guide', meta: 'Eat out, stay on plan', price: `$${Math.max(12, Math.round(single * 0.6))}` },
        ]
      : [
          { name: 'Heavy pull day', meta: 'Full session file · log it in Shape', price: `$${single}` },
          { name: 'Garage full-body', meta: 'Dumbbells only · 45 min', price: `$${Math.max(14, Math.round(single * 0.75))}` },
          { name: 'Technique: squat audit', meta: 'Video review + fixes', price: `$${Math.max(12, Math.round(single * 0.6))}` },
          { name: 'Engine builder', meta: '30-min conditioning piece', price: `$${Math.max(10, Math.round(single * 0.5))}` },
        ],
    reviews: isNutritionist
      ? [
          ['Sofia M.', 'They found where my fueling was falling apart. Six weeks later my energy is back and training volume is up.'],
          ['Diego R.', 'I was eating too little without realizing it. The plan made my lifts go up and my sleep stabilized.'],
          ['Amira K.', 'Practical, kind, and never preachy. The plan works even when I am traveling.'],
        ]
      : [
          ['Priya S.', 'The programming finally clicked. I added load without chasing pain or random workouts.'],
          ['Jonah W.', 'Clear coaching and direct feedback. I know exactly what each block is for.'],
          ['Ana P.', 'Boring worked. My numbers are at lifetime highs and my joints feel better.'],
        ],
    faq: isNutritionist
      ? [
          ['How do sessions work?', 'First intake is longer, follow-ups are focused, and every session gets written action items.'],
          ['Do you review labs?', 'Yes, recent bloodwork can be reviewed and converted into practical nutrition actions.'],
          ['Do I have to track calories?', 'Only if it fits your goal. Structured meal patterns are also supported.'],
        ]
      : [
          ['How are sessions run?', 'In-person, virtual, or hybrid depending on the coach format and your equipment.'],
          ['Do you write remote programs?', 'Yes. Program-only and monthly custom options are built for remote clients.'],
          ['Can I try before committing?', 'Yes. Start with a free intro call and decide after that.'],
        ],
  };
}

function BSProfileCard({ children, style }) {
  const t = useBS();
  return (
    <div style={{
      borderRadius: t.RADIUS_SM,
      border: `1px solid ${t.RULE}`,
      background: t.PAPER2,
      padding: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}



function BSPublicActionPanel({ action, coach, onClose, onConfirm, onMessageSent }) {
  const t = useBS();
  const tr = useShapeTr();
  const [message, setMessage] = useStateBSM2(tr('marketplace:panel.defaultMessage', { defaultValue: 'Hi {name}, I found your profile on Shape and would like to learn more.', name: coach.name.split(' ')[0].replace('Dr.', '').trim() }));
  if (!action) return null;
  const isMessage = action.type === 'Message';
  const canSendMessage = message.trim().length > 0;
  // action.type is an English discriminator ('Message'/'Booking'/'Checkout');
  // localize only its displayed eyebrow.
  const typeLabel = action.type === 'Booking'
    ? tr('marketplace:panel.typeBooking', { defaultValue: 'Booking' })
    : action.type === 'Checkout'
      ? tr('marketplace:panel.typeCheckout', { defaultValue: 'Checkout' })
      : tr('marketplace:panel.typeMessage', { defaultValue: 'Message' });

  // Sheets portal into #bs-phone-surface and position ABSOLUTE (the app-wide
  // rule — see the architecture map in docs/WORKLOG.md). `fixed` resolves
  // against the viewport (no ancestor establishes a fixed containing block:
  // the surface is position:relative + zoom, neither of which does), so in the
  // desktop preview the panel escaped the phone frame entirely. Plain
  // `absolute` without the portal is also wrong — BSPage's children live
  // inside a scrolling container, so it would pin to the bottom of the scrolled
  // CONTENT and scroll away. The surface is frame-sized and doesn't scroll.
  const panel = (
    <div style={{
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      // Above the signed-out preview banner (z 150, BSPreviewBannerGated) — an
      // open action sheet is the active surface and must not be covered by a
      // passive notice. Only visible once the panel was correctly framed.
      zIndex: 200,
      padding: `16px ${t.padX}px calc(16px + env(safe-area-inset-bottom))`,
      background: `linear-gradient(180deg, transparent, ${t.PAPER} 26%)`,
      maxWidth: 560,
      margin: '0 auto',
    }}>
      <BSProfileCard style={{
        borderRadius: t.RADIUS_LG || 18,
        borderColor: action.done ? t.ACCENT : t.RULE,
        background: t.SURFACE || t.PAPER2,
        boxShadow: t.ELEVATION || `0 18px 42px rgba(${t.inkRGB || '0,0,0'},0.18)`,
        padding: 16,
        maxHeight: 'calc(82vh - env(safe-area-inset-bottom))',
        overflow: 'auto',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ minWidth: 0 }}>
            <BSEyebrow color={action.done ? t.ACCENT : t.INK50}>{typeLabel}</BSEyebrow>
            <div style={{
              marginTop: 7,
              fontFamily: t.DISPLAY,
              fontWeight: 800,
              fontSize: 20,
              lineHeight: 1.08,
              color: t.INK,
              letterSpacing: '-0.03em',
            }}>{action.title}</div>
          </div>
          <button type="button" onClick={onClose} aria-label={tr('marketplace:sheet.close', { defaultValue: 'Close' })} style={{
            flexShrink: 0,
            borderRadius: 999,
            border: `1px solid ${t.RULE}`,
            background: t.PAPER2,
            color: t.INK70,
            width: 34,
            height: 34,
            cursor: 'pointer',
            fontFamily: t.MONO,
            fontSize: 13,
            fontWeight: 800,
          }}>x</button>
        </div>

        <div style={{
          marginTop: 10,
          fontFamily: t.DISPLAY,
          fontSize: 14,
          color: t.INK70,
          lineHeight: 1.45,
        }}>{action.body}</div>

        {isMessage && !action.done && (
          <div style={{ marginTop: 16, display: 'grid', gap: 10 }}>
            <label style={{
              display: 'grid',
              gap: 8,
              fontFamily: t.MONO,
              fontSize: 9,
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              color: t.INK50,
              fontWeight: 800,
            }}>
              {tr('marketplace:panel.yourNote', { defaultValue: 'Your note' })}
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={4}
                style={{
                  width: '100%',
                  minHeight: 112,
                  resize: 'vertical',
                  borderRadius: t.RADIUS_LG || t.RADIUS_SM,
                  border: `1px solid ${t.RULE}`,
                  background: t.PAPER,
                  color: t.INK,
                  padding: 14,
                  boxSizing: 'border-box',
                  fontFamily: t.DISPLAY,
                  fontSize: 15,
                  lineHeight: 1.4,
                  letterSpacing: '-0.01em',
                  outline: 'none',
                }}
              />
            </label>
            <button
              type="button"
              onClick={() => onMessageSent(message)}
              disabled={!canSendMessage}
              style={{
                width: '100%',
                borderRadius: t.RADIUS_LG || t.RADIUS_SM,
                minHeight: 52,
                padding: '15px 14px',
                background: canSendMessage ? t.INK : t.INK15 || t.RULE,
                color: canSendMessage ? t.PAPER : t.INK50,
                border: 0,
                cursor: canSendMessage ? 'pointer' : 'not-allowed',
                fontFamily: t.MONO,
                fontSize: 10,
                lineHeight: 1.15,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                fontWeight: 800,
              }}
            >{tr('marketplace:panel.sendMessage', { defaultValue: 'Send message' })}</button>
            <div style={{
              fontFamily: t.DISPLAY,
              fontSize: 12.5,
              lineHeight: 1.35,
              color: t.INK50,
              textAlign: 'center',
            }}>
              {tr('marketplace:panel.privateThread', { defaultValue: 'This starts a private thread in Chat.' })}
            </div>
          </div>
        )}

        {!isMessage && !action.done && (
          <button type="button" onClick={() => onConfirm(action)} style={{
            marginTop: 14,
            width: '100%',
            borderRadius: t.RADIUS_LG || t.RADIUS_SM,
            minHeight: 50,
            padding: '14px 12px',
            background: t.INK,
            color: t.PAPER,
            border: 0,
            cursor: 'pointer',
            fontFamily: t.MONO,
            fontSize: 10,
            lineHeight: 1.15,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            fontWeight: 800,
            whiteSpace: 'normal',
            overflowWrap: 'anywhere',
          }}>{action.cta || tr('marketplace:panel.confirm', { defaultValue: 'Confirm' })}</button>
        )}
      </BSProfileCard>
    </div>
  );

  // Resolve ONLY the phone surface — deliberately no document.body fallback.
  // The house idiom elsewhere falls back to body, but body is precisely where
  // this panel used to escape to, so keeping it would re-open the bug in the
  // very case the guard exists for. If the surface is somehow absent we render
  // IN PLACE instead: worst case it pins to the bottom of the scrolled content
  // (contained, slightly mispositioned) rather than outside the frame. Rendering
  // nothing was the other option and is worse — a tapped BUY would open no sheet.
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || null;
  return surface ? createPortal(panel, surface) : panel;
}

// ── The plan preview sheet ("what's inside", spec 2026-07-24) ────────────────
// A buyer could see a name, a price and one line of meta before paying. This
// opens the coach's OWN authored outline. Every row comes from bsPlanPreview,
// which parses coach_plans.detail.blocks through the same planOutline parsers
// the Assign flow uses — so a preview can never describe a plan differently
// from how it is delivered, and a plan with no authored outline shows the
// honest "the coach hasn't published an outline" state rather than a fabricated
// one. Portals into #bs-phone-surface + position:absolute (the sheet rule).
function BSPlanPreviewSheet({ plan, isNutri, roleColor, teal, onBuy, onClose }) {
  const t = useBS();
  const tr = useShapeTr();
  if (!plan) return null;
  const p = bsPlanPreview(plan, { isNutri });
  // `p.kind === null` is the EXPECTED state for a published plan with no
  // authored outline — it is not evidence the product is a single session.
  // Falling through to "Single session" mislabelled every empty nutrition plan
  // and every empty multi-week trainer program. The plan still declares what it
  // is, so the fallback reads the same `category` the shelf above buckets this
  // very row by (`singleMatch`), plus the role.
  const planCat = String((plan && plan.category) || '').toLowerCase();
  const isSinglePlan = isNutri ? /meal/.test(planCat) : /workout|single/.test(planCat);
  const eyebrowKind = p.kind
    || (isNutri ? 'menu' : (isSinglePlan ? 'session' : 'split'));
  // 'block' (a Week 1..N outline) reads as a Program — same as a weekday split.
  // Both are multi-session products; only the unit shape differs.
  const eyebrow = (eyebrowKind === 'split' || eyebrowKind === 'block')
    ? tr('marketplace:preview.eyebrowProgram', { defaultValue: 'Program' })
    : eyebrowKind === 'menu'
      ? tr('marketplace:preview.eyebrowMenu', { defaultValue: 'Meal plan' })
      : tr('marketplace:preview.eyebrowSession', { defaultValue: 'Single session' });

  const register = [];
  if (p.weeks) register.push([tr('marketplace:preview.weeks', { defaultValue: 'Weeks' }), String(p.weeks)]);
  if (p.sessionsPerWeek) register.push([tr('marketplace:preview.perWeek', { defaultValue: 'Days / wk' }), String(p.sessionsPerWeek)]);
  if (p.units.length) register.push([
    p.kind === 'menu' ? tr('marketplace:preview.meals', { defaultValue: 'Meals' }) : tr('marketplace:preview.moves', { defaultValue: 'Entries' }),
    String(p.units.length),
  ]);

  const row = (u, i) => (
    <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '9px 0', borderBottom: `1px solid ${t.HAIR}`, opacity: u.rest ? 0.55 : 1 }}>
      {u.label ? <span style={{ flexShrink: 0, minWidth: 46, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{u.label}</span> : null}
      <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{u.title}</span>
      <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)', minWidth: 10 }} />
      <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>
        {u.rest ? tr('marketplace:preview.rest', { defaultValue: 'Rest' })
          : u.scheme ? u.scheme
            : u.load ? u.load
              : (u.kcal != null ? `${u.kcal} kcal` : '')}
      </span>
    </div>
  );

  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={tr('marketplace:preview.aria', { defaultValue: "What's inside {name}", name: plan.name || '' })}
        className="bs-hide-scroll"
        style={{ width: '100%', boxSizing: 'border-box', maxHeight: '82%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}
      >
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: roleColor }}>
          {eyebrow}{plan.price ? ` · ${plan.price}` : ''}
        </div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1.1 }}>
          {plan.name}<span style={{ color: roleColor }}>.</span>
        </div>
        <div aria-hidden style={{ margin: '12px 0 2px', height: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />

        {p.media.length > 0 && (
          <div style={{ margin: '12px 0 2px', display: 'flex', gap: 7, overflowX: 'auto' }} className="bs-hide-scroll">
            {p.media.map((m, i) => (
              <div key={i} style={{ flex: 'none', width: 132, height: 96, overflow: 'hidden', background: t.PAPER2, border: `1px solid ${t.HAIR}` }}>
                {m.type === 'video'
                  ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline preload="metadata" />
                  : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
            ))}
          </div>
        )}

        {register.length > 0 && (
          <div style={{ display: 'flex', gap: 22, marginTop: 14 }}>
            {register.map(([label, value]) => (
              <div key={label}>
                <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{label}</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{value}</div>
              </div>
            ))}
          </div>
        )}

        {p.kind ? (
          <>
            <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>
              {tr('marketplace:preview.outline', { defaultValue: 'The outline' })}
            </div>
            {/* C1a — a per-day menu's SEVEN DAYS are the table of contents and
                the differentiator being paid for, so they render free. Counts
                only: no locked meal's text is in `p.days`, so nothing here can
                leak paid content. Without this strip the model carried the
                structure and the buyer never saw it — the sheet showed a sample
                day plus a locked count, which is what a single-day menu looks
                like too. */}
            {p.perDay && Array.isArray(p.days) && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6 }}>
                {p.days.map((d) => (
                  <div key={d.label} style={{ flex: 1, textAlign: 'center', padding: '7px 0', border: `1px solid ${d.count ? t.HAIR : 'transparent'}`, background: d.count ? `${teal}14` : 'transparent', opacity: d.count ? 1 : 0.4 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', color: t.INK50 }}>{d.label}</div>
                    <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: d.count ? t.INK : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{d.count || '—'}</div>
                  </div>
                ))}
              </div>
            )}
            {p.perDay && (
              <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                {/* "Menus vary by day", not "a different menu each day" — perDay
                    fires on ONE differing day (Mon/Wed/Fri overrides + four
                    inherited defaults is the normal authored shape), so the
                    stronger claim would overstate what several real plans
                    deliver. Copy on a paid surface states what is true of
                    every plan it renders on. */}
                {tr('marketplace:preview.perDay', { defaultValue: 'Menus vary by day · meals per day' })}
              </div>
            )}
            <div style={{ marginTop: 4 }}>{p.free.map(row)}</div>
            {p.locked > 0 && (
              <div style={{ marginTop: 10, padding: '10px 0', borderTop: `1px dashed ${t.INK}3d`, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>
                {tr('marketplace:preview.locked', { defaultValue: '＋{count} more · unlocked when you buy', count: p.locked })}
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 16, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: t.INK70 }}>
            {tr('marketplace:preview.noOutline', { defaultValue: "This coach hasn't published an outline for this one yet." })}
          </div>
        )}

        {p.note ? (
          <div style={{ marginTop: 14, paddingLeft: 11, borderLeft: `3px solid ${roleColor}` }}>
            <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, lineHeight: 1.5, color: t.INK }}>{p.note}</div>
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 12, marginTop: 16, alignItems: 'center' }}>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}>
            <span style={{ borderBottom: `2px solid ${t.INK}59`, paddingBottom: 2 }}>{tr('marketplace:sheet.close', { defaultValue: 'Close' })}</span>
          </button>
          {plan.price ? (
            <button onClick={onBuy} style={{ flex: 1, padding: 14, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)' }}>
              {tr('marketplace:preview.buy', { defaultValue: 'Buy · {price} →', price: plan.price })}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );

  // Surface-only, no document.body fallback — body is where a sheet escapes the
  // phone frame to (the bug PR #1825 fixes), so the guard must not offer it as a
  // target. Absent surface renders in place: contained, not outside the frame.
  const surface = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || null;
  return surface ? createPortal(sheet, surface) : sheet;
}

// ── Demo catalogue (signed-out preview ONLY) ─────────────────────────────────
// A demo coach has no provider row, so ShapeCoachPlans.salePlans can never
// return anything for them and the Listing's PROGRAMS & PLANS / SINGLE WORKOUTS
// shelves render empty — which is why the preview reads as a half-built page.
// These stand-ins carry the SAME shape a real coach_plans row does (id · name ·
// meta · price · category · detail{blocks,note,media}) so every downstream
// surface — the sale rows, their media strip, and the plan preview — runs the
// real code path against them. Gated on `!saleProviderId` (demo listings only),
// so a REAL coach with no plans still honestly shows nothing.
// Signed-in check for the demo gate. Reads the auth cache the rest of the app
// uses (window.ShapeAuth), so it needs no props threading and matches the
// preview-vs-live boundary every other demo fallback keys off.
const bsmSignedIn = () => !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id);
const BSM_DEMO_MEDIA = `${import.meta.env.BASE_URL}demo/`;
const BSM_DEMO_SALE_PLANS = (isNutri) => (isNutri ? [
  {
    id: 'demo-plan-cut', name: 'The Lean Block', meta: '6 weeks · 1,900 kcal base', price: '$160', category: 'program',
    detail: {
      note: 'Built for a training week, not a diet week. Protein anchors every meal; carbs follow the sessions.',
      media: [{ url: `${BSM_DEMO_MEDIA}plan-01.webp`, type: 'image', name: 'plan-01' }],
      blocks: [
        'Breakfast — Greek yogurt, berries, honey · 420 kcal',
        'Lunch — chicken rice bowl, slaw · 610 kcal',
        'Snack — cottage cheese, apple · 240 kcal',
        'Dinner — salmon, potatoes, greens · 630 kcal',
      ],
    },
  },
  {
    id: 'demo-meal-single', name: 'Race-week fuelling day', meta: 'One day · full macros', price: '$32', category: 'meal',
    detail: {
      note: 'The day before a long effort. Carbs up, fibre down, nothing new on race morning.',
      media: [],
      blocks: [
        'Breakfast — oats, banana, maple · 520 kcal',
        'Lunch — white rice, chicken, soy · 640 kcal',
        'Dinner — pasta, lean beef ragu · 700 kcal',
      ],
    },
  },
] : [
  {
    id: 'demo-plan-strength', name: 'Strength Block 3', meta: '6 weeks · 4 days', price: '$160', category: 'program',
    detail: {
      note: 'Two heavy days, two builders. Add weight only when every rep of the last set looked the same as the first.',
      media: [
        { url: `${BSM_DEMO_MEDIA}studio-02.webp`, type: 'image', name: 'studio-02' },
        { url: `${BSM_DEMO_MEDIA}plan-01.webp`, type: 'image', name: 'plan-01' },
      ],
      blocks: [
        'Mon — Lower (squat)',
        'Tue — Upper (push)',
        'Thu — Lower (hinge)',
        'Fri — Upper (pull)',
      ],
    },
  },
  {
    id: 'demo-workout-single', name: 'Heavy singles — squat day', meta: 'One session · 52 min', price: '$32', category: 'workout',
    detail: {
      note: 'Work up until the bar slows, then stop. The back-offs are where the size comes from.',
      media: [{ url: `${BSM_DEMO_MEDIA}studio-03.webp`, type: 'image', name: 'studio-03' }],
      blocks: [
        'Back squat · 5×3',
        'Front squat · 3×6',
        'Bulgarian split squat · 3×8',
        'Hanging leg raise · 3×12',
      ],
    },
  },
]);

// 24h 'HH:MM' -> 12h label, shared by the Listing's slot rows + the calendar.
function bsFmtSlot12(hhmm) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (Number.isNaN(h)) return hhmm;
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
}
const BSM_MONTHS3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BSM_DAYS3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Full scheduling calendar (spec 2026-07-09 §3): a month grid over the coach's
// projected open slots — real provider_availability minus booked sessions for
// live coaches, the labeled preview week for demo rows. Tapping a slot runs the
// SAME booking confirm as the Listing's OPEN THIS WEEK rows.
function BSCoachAvailabilityCalendar({ coach, roleColor, open, demo, onPick, onBack }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const byDay = bsSlotsByDay(open);
  const today = new Date();
  const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const [ym, setYm] = React.useState([today.getFullYear(), today.getMonth()]);
  const [selIso, setSelIso] = React.useState(null);
  const [y, mo] = ym;
  const startPad = new Date(y, mo, 1).getDay();
  const daysInMonth = new Date(y, mo + 1, 0).getDate();
  const isoOf = (d) => `${y}-${String(mo + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const monthLabel = new Date(y, mo, 1).toLocaleDateString(bsmLocale(), { month: 'long', year: 'numeric' });
  const nav = (dir) => { setSelIso(null); setYm(([yy, mm]) => (mm + dir < 0 ? [yy - 1, 11] : mm + dir > 11 ? [yy + 1, 0] : [yy, mm + dir])); };
  const daySlots = selIso ? (byDay.get(selIso) || []) : [];
  const first = (coach.name || '').split(' ')[0];
  return (
    <BSPage>
      {/* The standing masthead row — same format, same size, no deviation
          (owner ruling 2026-08-01). Back sits on its own row directly under it. */}
      <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
        {window.BSMastRow ? React.createElement(window.BSMastRow, { trailing: bsMktCorner(), style: { marginBottom: 12 } }) : null}
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0, minHeight: 24 }}>← {tr('marketplace:nav.theListing', { defaultValue: 'The listing' })}</button>
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: roleColor }}>{tr('marketplace:cal.eyebrow', { defaultValue: 'The calendar' })} · {first}{demo ? ` · ${tr('marketplace:cal.preview', { defaultValue: 'Preview' })}` : ''}</div>
        <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK }}>{tr('marketplace:cal.title1', { defaultValue: 'Open to' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('marketplace:cal.title2', { defaultValue: 'book.' })}</span></h1>
        {demo ? <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:cal.previewNote', { defaultValue: 'Preview · typical availability — confirm at booking' })}</div> : null}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button onClick={() => nav(-1)} aria-label={tr('marketplace:cal.prevMonth', { defaultValue: 'Previous month' })} style={{ background: 'transparent', border: `1px solid ${t.RULE}`, borderRadius: 4, width: 34, height: 30, cursor: 'pointer', color: t.INK, fontSize: 13, lineHeight: 1 }}>‹</button>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{monthLabel}</span>
          <button onClick={() => nav(1)} aria-label={tr('marketplace:cal.nextMonth', { defaultValue: 'Next month' })} style={{ background: 'transparent', border: `1px solid ${t.RULE}`, borderRadius: 4, width: 34, height: 30, cursor: 'pointer', color: t.INK, fontSize: 13, lineHeight: 1 }}>›</button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {BSM_DAYS3.map((d, di) => <div key={d} style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{tr(`marketplace:dow.${di}`, { defaultValue: d })}</div>)}
          {Array.from({ length: startPad }, (_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const iso = isoOf(d);
            const slots = byDay.get(iso) || [];
            const past = iso < todayIso;
            const on = selIso === iso;
            const bookable = !past && slots.length > 0;
            return (
              <button key={iso} disabled={!bookable} onClick={() => setSelIso(on ? null : iso)} aria-label={bookable ? tr('marketplace:cal.dayAria', { defaultValue: '{iso} — {count} open', iso, count: slots.length }) : iso} style={{
                aspectRatio: '1 / 1', boxSizing: 'border-box', padding: '5px 2px 3px', cursor: bookable ? 'pointer' : 'default',
                border: `1px solid ${on ? teal : t.HAIR}`, borderRadius: 3, background: on ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
              }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, color: past ? t.INK30 : bookable ? t.INK : t.INK50, lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{d}</span>
                {bookable ? <span aria-hidden style={{ width: 12, height: 2.5, background: roleColor }} /> : <span aria-hidden style={{ height: 2.5 }} />}
              </button>
            );
          })}
        </div>
        {selIso ? (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden style={{ flexShrink: 0, width: 10, height: 3, background: roleColor }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{new Date(`${selIso}T00:00:00`).toLocaleDateString(bsmLocale(), { weekday: 'long', month: 'short', day: 'numeric' })} · {tr('marketplace:cal.introFree', { defaultValue: 'intro is free' })}</span>
            </div>
            {daySlots.map((s, i) => (
              <button key={`${s.iso}-${s.time}`} onClick={() => onPick(s)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{bsFmtSlot12(s.time)}</span>
                <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)', minWidth: 12 }} />
                <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>{tr('marketplace:slot.holdIt', { defaultValue: 'Hold it →' })}</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:cal.tapDay', { defaultValue: 'Tap a marked day to see its open times.' })}</div>
        )}
      </div>
      <BSFooter right={tr('marketplace:footer.availability', { defaultValue: 'Availability' })} />
    </BSPage>
  );
}

// THE LISTING (spec 2026-07-09) — the marketplace conversion page: the tapped
// classified expanded. Role heat line-only; teal = the one commerce action;
// tier NAMED in the meta; every commerce handler verbatim. The Signal living
// profile opens from THE FULL PROFILE → leader — never replaced by this page.
function BSCoachDetailPublic({ coach, onBack, no = null, photo = null, goChat = null }) {
  const t = useBS();
  const tr = useShapeTr();
  const p = buildPublicProfile(coach);
  const roleColor = mktRoleColor(coach);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // Listing media (normalized upstream for real coaches; authored for demo).
  const { cover: listingCover, gallery: listingGallery } = mktListingMedia(coach);
  const [action, setAction] = useStateBSM2(null);
  const [checkoutBusy, setCheckoutBusy] = useStateBSM2(false);
  const [showProfile, setShowProfile] = useStateBSM2(false);
  const [showCal, setShowCal] = useStateBSM2(false);
  const [offerSheet, setOfferSheet] = useStateBSM2(false);
  // Real availability for live coaches: the weekly pattern minus booked
  // sessions, projected 6 weeks (null = demo/preview row or fetch failed —
  // the labeled preview pattern renders instead; [] = a live coach with no
  // open slots, which reads honestly as none).
  const [realAvail, setRealAvail] = useStateBSM2(null);

  // The coach's real published plans for sale (coach_plans). Bought through the
  // same Stripe Connect checkout; the plan_id rides along so the buyer owns it.
  const saleProviderRole = getPublicProfileKind(coach);
  const saleProviderId = coach.provider_id || coach.db_id || null;
  const [salePlans, setSalePlans] = useStateBSM2(null);
  const [previewPlan, setPreviewPlan] = useStateBSM2(null);
  // The signed-in identity is a DEPENDENCY of the demo fallback below, not just
  // something it reads. Keyed only on the coach, a sign-in that happened while
  // this Listing stayed mounted left the stand-in catalogue — and its Buy CTAs —
  // on screen for a real member. That is precisely the demo-leak the branch
  // below is written to prevent, so the uid rides in the dep array.
  const bsmAuthUid = (typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.()?.user?.id) || null;
  React.useEffect(() => {
    // The signed-out PREVIEW falls back to the stand-in catalogue so the Listing
    // reads as a finished page instead of skipping straight from the rate card to
    // THE APPROACH. Gated on "no signed-in user", never on the coach row — a
    // signed-in member always sees that coach's REAL plans, and a real coach with
    // none still honestly shows nothing (the demo-leak rule, 2026-06-14).
    // Demo catalogue is the SIGNED-OUT preview of a PROVIDER-LESS demo row only
    // (BSM_MARKETPLACE_COACHES carry no provider_id/db_id → saleProviderId null).
    // The demo call lives ONLY on this no-provider branch, so a real coach's
    // fetch path can never reach it: a real coach (has a provider id) with no
    // plans / a failed fetch stays honestly empty — never fabricated "for sale"
    // plans + buy links on a coach who published nothing (the demo-leak rule).
    if (!saleProviderId) {
      // "No provider id" is NOT the same as "not a real coach". A coach opened
      // from the "What's hot" plans rail arrives carrying only provider_user_id,
      // so a REAL coach lands here — and showing them the stand-in catalogue
      // would put fabricated, buyable products on a real person's listing, which
      // is precisely what the comment above forbids. Any identity at all means
      // honest-empty instead.
      const coachIsReal = !!(coach.provider_id || coach.db_id || coach.provider_user_id);
      setSalePlans((bsmSignedIn() || coachIsReal) ? [] : BSM_DEMO_SALE_PLANS(saleProviderRole === 'nutritionist'));
      return;
    }
    if (!window.ShapeCoachPlans?.salePlans) { setSalePlans([]); return; }
    let on = true;
    window.ShapeCoachPlans.salePlans(saleProviderRole, saleProviderId)
      .then((r) => { if (on) setSalePlans((r && r.length) ? r : []); })
      .catch(() => { if (on) setSalePlans([]); });
    return () => { on = false; };
  }, [saleProviderId, saleProviderRole, bsmAuthUid]);
  React.useEffect(() => {
    if (!saleProviderId || !window.ShapeCoachAvailability?.get) { setRealAvail(null); return undefined; }
    let on = true;
    window.ShapeCoachAvailability.get(saleProviderRole, saleProviderId)
      .then((d) => { if (on && d && Array.isArray(d.slots)) setRealAvail(bsProjectAvailability({ slots: d.slots, booked: d.booked || [], weeks: 6 })); })
      .catch(() => {});
    return () => { on = false; };
  }, [saleProviderId, saleProviderRole]);
  // Rate-card buckets (the plan sub-tabs died with the Listing): the single-item
  // shelf vs multi-week programs/plans, role-aware.
  const isNutriDetail = saleProviderRole === 'nutritionist';
  const singleMatch = isNutriDetail ? ((c) => /meal/.test(c)) : ((c) => /workout|single/.test(c));
  const salePlanSingles = (salePlans || []).filter((pl) => singleMatch(String(pl.category || '').toLowerCase()));
  const salePlanPrograms = (salePlans || []).filter((pl) => !salePlanSingles.includes(pl));
  // The coupon = the subscription package; everything else lists as rows.
  const monthlyPkg = p.packages.find((x) => x.type === 'Subscription') || null;
  const oneTimePkgs = p.packages.filter((x) => x !== monthlyPkg);
  // The hook keys its effect on the resolved owner ids, so a fresh array literal
  // each render is fine — it only refetches when the coach actually changes.
  useMktCoachPoints([coach]);
  const { name: tierName, color: tierColor, points: tierPoints } = mktCoachTier(coach);
  // Waiting room — port of the Signal storefront gate, shown only when the
  // coach is effectively at capacity (mirrors src/lib/capacity.ts).
  const capProviderId = coach.provider_id || coach.db_id || null;
  const atCapacity = !!(coach.at_capacity && (!coach.capacity_resume_at || new Date(coach.capacity_resume_at).getTime() > Date.now()));
  const [wl, setWl] = useStateBSM2(null);
  const wlBusy = React.useRef(false);
  React.useEffect(() => {
    if (!atCapacity || !capProviderId || !window.ShapeWaitlist?.mine) { setWl(null); return undefined; }
    let on = true;
    (async () => {
      try {
        const r = await window.ShapeWaitlist.mine();
        const mine = ((r && r.entries) || []).find((e) => String(e.providerId) === String(capProviderId) && e.providerRole === saleProviderRole);
        if (on) setWl(mine ? { status: mine.status, position: mine.position, entryId: mine.entryId || null } : null);
      } catch (e) {}
    })();
    return () => { on = false; };
  }, [atCapacity, capProviderId, saleProviderRole]);
  const wlJoin = async () => {
    if (wlBusy.current) return;
    if (window.bsRequireAccount && !window.bsRequireAccount('join the waiting list')) return;
    wlBusy.current = true;
    try {
      const r = await window.ShapeWaitlist.join({ providerId: capProviderId, providerRole: saleProviderRole });
      setWl({ status: r.status, position: r.position, entryId: r.entryId || null });
    } catch (e) { window.__bsToast?.(e?.message || 'Could not join the waiting list.', 'err'); }
    finally { wlBusy.current = false; }
  };
  const wlWithdraw = async () => {
    if (wlBusy.current) return;
    if (!wl?.entryId) { window.__bsToast?.('Refreshing your spot — try again in a moment.'); return; }
    wlBusy.current = true;
    try { await window.ShapeWaitlist.withdraw(wl.entryId); setWl(null); }
    catch (e) { window.__bsToast?.(e?.message || 'Could not update the waiting list.', 'err'); }
    finally { wlBusy.current = false; }
  };

  // Live coach reviews (1–10), shared with the website via /api/coaches/reviews.
  const coachSlug = coach.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const coachKind = coach.tag === 'Nutritionist' ? 'nutritionist' : 'trainer';
  const [liveReviews, setLiveReviews] = useStateBSM2([]);
  const [revRating, setRevRating] = useStateBSM2(0);
  const [revText, setRevText] = useStateBSM2('');
  const [revPosting, setRevPosting] = useStateBSM2(false);
  const avgRev = liveReviews.length ? Math.round((liveReviews.reduce((s, r) => s + (r.rating || 0), 0) / liveReviews.length) * 10) / 10 : null;
  useEffectBSM2(() => {
    let c = false;
    fetch(`/api/coaches/reviews?coach=${encodeURIComponent(coachSlug)}`, { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!c && d && Array.isArray(d.reviews)) setLiveReviews(d.reviews); })
      .catch(() => {});
    return () => { c = true; };
  }, [coachSlug]);
  const submitReview = () => {
    if (!revRating || revPosting) return;   // in-flight lock: a double-tap can't post twice
    setRevPosting(true);
    fetch('/api/coaches/reviews', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coach: coachSlug, kind: coachKind, rating: revRating, text: revText }) })
      .then(r => (r.ok ? r.json() : r.json().then(e => Promise.reject(e))))
      .then(d => { if (d && d.review) { setLiveReviews(prev => [d.review, ...prev]); setRevRating(0); setRevText(''); window.__bsToast?.(tr('marketplace:listing.reviewPosted', { defaultValue: 'Review posted' }), 'ok'); } })
      .catch(err => { window.__bsToast?.(err && err.error ? err.error : tr('marketplace:listing.reviewError', { defaultValue: 'Could not post review' }), 'err'); })
      .finally(() => setRevPosting(false));
  };
  const last = coach.name.split(' ').slice(1).join(' ') || p.role;
  const firstName = p.first;

  const openIntro = () => {
    const nextOpen = p.availability
      .flatMap(([day, date, times, iso, month]) => times.map(time => ({ day, date, time, month, iso })))
      .find(slot => slot.time && slot.time !== '--');
    setAction({
      type: 'Booking',
      title: tr('marketplace:listing.bookIntroTitle', { defaultValue: 'Book a free intro with {name}', name: firstName }),
      body: tr('marketplace:listing.bookIntroBody', { defaultValue: 'Choose an open time below, or confirm now and Shape will hold the next available intro slot.' }),
      cta: tr('marketplace:listing.holdSlot', { defaultValue: 'Hold next open slot' }),
      slot: nextOpen,
    });
  };

  const openMessage = () => {
    setAction({
      type: 'Message',
      title: tr('marketplace:listing.messageTitle', { defaultValue: 'Message {name}', name: firstName }),
      body: tr('marketplace:listing.messageBody', { defaultValue: 'Send a private note before booking. The thread will also appear on your Chat page.' }),
      cta: tr('marketplace:listing.sendMessage', { defaultValue: 'Send message' }),
    });
  };

  const openCheckout = (item) => {
    setAction({
      type: 'Checkout',
      title: item.type === 'Subscription'
        ? tr('marketplace:listing.subscribeTo', { defaultValue: 'Subscribe to {name}', name: item.name })
        : tr('marketplace:listing.buyItem', { defaultValue: 'Buy {name}', name: item.name }),
      body: tr('marketplace:listing.checkoutBody', { defaultValue: '{price} {unit}. Includes: {perks}.', price: item.price, unit: item.unit, perks: item.perks.slice(0, 2).join(', ') }),
      cta: item.type === 'Subscription'
        ? tr('marketplace:listing.openSubscription', { defaultValue: 'Open secure subscription' })
        : tr('marketplace:listing.openCheckout', { defaultValue: 'Open secure checkout' }),
      item,
    });
  };

  const selectSlot = (day, date, time, iso, month) => {
    if (time === '--') return;
    setAction({
      type: 'Booking',
      title: tr('marketplace:listing.slotTitle', { defaultValue: '{day}, {month} {date} at {time}', day, month, date, time }),
      body: tr('marketplace:listing.slotBody', { defaultValue: 'Free intro call with {name}. You can reschedule later from messages.', name: coach.name }),
      cta: tr('marketplace:listing.confirmBooking', { defaultValue: 'Confirm booking' }),
      slot: { day, date, time, month, iso },
    });
  };

  const confirmAction = async (current) => {
    // Browse / no-account users can view coaches but must create an account to commit.
    const gateLabel = current.type === 'Booking' ? 'book a session' : current.type === 'Checkout' ? 'check out' : 'continue';
    if (window.bsRequireAccount && !window.bsRequireAccount(gateLabel)) return;
    if (current.type === 'Checkout') {
      setCheckoutBusy(true);
      try {
        const result = await window.ShapePayments?.startCheckout?.({
          item: current.item,
          coach,
          role: p.role,
          user: window.ShapeAuth?.getCachedState?.().user,
        });
        if (result?.demo) {
          setAction({
            ...current,
            done: true,
            title: tr('marketplace:listing.checkoutSetup', { defaultValue: 'Checkout setup needed' }),
            body: result.message,
          });
        }
      } catch (error) {
        setAction({
          ...current,
          title: tr('marketplace:listing.checkoutError', { defaultValue: 'Checkout error' }),
          body: error?.message || tr('marketplace:listing.checkoutErrorBody', { defaultValue: 'Unable to open Stripe checkout.' }),
          cta: tr('marketplace:listing.tryAgain', { defaultValue: 'Try again' }),
        });
      } finally {
        setCheckoutBusy(false);
      }
      return;
    }
    if (current.type === 'Booking') {
      setCheckoutBusy(true);
      try {
        const result = await window.ShapeBookings?.submitConsultationBooking?.({
          coach,
          role: getPublicProfileKind(coach),
          slot: current.slot,
          topic: 'Free intro call',
        });
        writeShapeCoachThread(coach, tr('marketplace:thread.bookedIntro', { defaultValue: 'Booked intro consultation: {title}.', title: current.title }));
        setAction({
          ...current,
          done: true,
          title: tr('marketplace:listing.booked', { defaultValue: 'Booked' }),
          body: result?.stored === 'supabase'
            ? tr('marketplace:listing.bookedSyncedBody', { defaultValue: 'Your intro with {name} is saved in Shape bookings. A message thread has been started.', name: coach.name })
            : tr('marketplace:listing.bookedLocalBody', { defaultValue: 'Your intro with {name} is held locally. A message thread has been started.', name: coach.name }),
        });
      } catch (error) {
        setAction({
          ...current,
          title: tr('marketplace:listing.bookingError', { defaultValue: 'Booking error' }),
          body: error?.message || tr('marketplace:listing.bookingErrorBody', { defaultValue: 'Unable to save this consultation booking.' }),
          cta: tr('marketplace:listing.tryAgain', { defaultValue: 'Try again' }),
        });
      } finally {
        setCheckoutBusy(false);
      }
      return;
    }
    setAction({
      ...current,
      done: true,
      title: tr('marketplace:listing.booked', { defaultValue: 'Booked' }),
      body: tr('marketplace:listing.bookedHeldBody', { defaultValue: 'Your intro with {name} is held. A message thread has been started.', name: coach.name }),
    });
  };

  const sendMessage = async (text) => {
    const clean = (text || '').trim() || tr('marketplace:panel.defaultMessage', { defaultValue: 'Hi {name}, I found your profile on Shape and would like to learn more.', name: firstName });
    try {
      const result = await window.ShapeMessages?.sendProviderMessage?.({ coach, text: clean });
      writeShapeCoachThread(coach, clean, result || {});
      setAction({
        type: 'Message',
        done: true,
        title: result?.stored === 'supabase' ? tr('marketplace:listing.messageSynced', { defaultValue: 'Message synced' }) : tr('marketplace:listing.messageSavedLocal', { defaultValue: 'Message saved locally' }),
        body: result?.stored === 'supabase'
          ? tr('marketplace:listing.messageSyncedBody', { defaultValue: '{name} will see your note in their Shape messages. The thread is synced to your Chat page under Team.', name: coach.name })
          : tr('marketplace:listing.messageSavedLocalBody', { defaultValue: "{name}'s thread has been added to your Chat page under Team. Sign in after the message schema is live to sync across devices.", name: coach.name }),
      });
    } catch (error) {
      writeShapeCoachThread(coach, clean);
      setAction({
        type: 'Message',
        done: true,
        title: tr('marketplace:listing.messageSavedLocal', { defaultValue: 'Message saved locally' }),
        body: tr('marketplace:listing.messageErrorBody', { defaultValue: "{name}'s thread was added to Chat. Supabase sync needs the conversations/messages migration run first. {error}", name: coach.name, error: error?.message || '' }),
      });
    }
  };

  // One expansion of the preview pattern feeds BOTH the calendar and the
  // OPEN THIS WEEK rows (superset shape) so the two can't drift.
  const expandPreviewSlots = () => p.availability.flatMap(([day, date, times, iso, month]) =>
    times.filter((x) => x && x !== '--').map((time) => ({ day, date, time, iso, month, weekday: new Date(`${iso}T00:00:00`).getDay() })));

  if (showCal) {
    return <BSCoachAvailabilityCalendar coach={coach} roleColor={roleColor} open={realAvail != null ? realAvail : expandPreviewSlots()} demo={realAvail == null} onBack={() => setShowCal(false)} onPick={(s) => { setShowCal(false); const d = new Date(`${s.iso}T00:00:00`); selectSlot(BSM_DAYS3[d.getDay()], String(d.getDate()), s.time, s.iso, BSM_MONTHS3[d.getMonth()]); }} />;
  }

  // THE FULL PROFILE → the Signal living page, byte-identical component —
  // the person payload moved here from the marketplace routing branch.
  if (showProfile && window.BSPublicProfile) {
    const Living = window.BSPublicProfile;
    const person = {
      who: coach.name, kind: isNutriDetail ? 'NUTRI' : 'TRAINER',
      userId: coach.provider_user_id || null, city: coach.loc || coach.city || 'Remote',
      bio: coach.bio || '', init: coach.init || (coach.name ? coach.name[0] : '?'),
      tier: coach.tier || null, public: true,
      commerce: { coach, role: saleProviderRole, packages: p.packages },
    };
    return <Living person={person} onBack={() => setShowProfile(false)} onMessage={(pp) => { setShowProfile(false); if (goChat) goChat((pp && pp.who) || coach.name, isNutriDetail ? 'Nutritionist' : 'Trainer'); }} />;
  }

  const fmtSlot = bsFmtSlot12;
  // One slot list feeds the station AND the calendar: real projected slots for
  // live coaches (realAvail; [] = honestly none), the preview pattern otherwise.
  const projSlotRow = (s) => { const d = new Date(`${s.iso}T00:00:00`); return { day: BSM_DAYS3[s.weekday], date: String(d.getDate()), time: s.time, iso: s.iso, month: BSM_MONTHS3[d.getMonth()] }; };
  const allOpenSlots = realAvail != null
    ? realAvail.map(projSlotRow)
    : expandPreviewSlots();
  const openSlots = allOpenSlots.slice(0, 3);
  const Station = ({ children }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: `22px ${t.padX}px 0` }}>
      <span aria-hidden style={{ flexShrink: 0, width: 10, height: 3, background: roleColor }} />
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{children}</span>
    </div>
  );
  const Leader = () => <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)', minWidth: 12 }} />;
  const renderSaleRow = (pl) => {
    const media = Array.isArray(pl.detail?.media) ? pl.detail.media.filter((m) => m && m.url) : [];
    return (
      <div key={pl.id} style={{ borderBottom: `1px solid ${t.HAIR}` }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '11px 0 2px' }}>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{pl.name}</span>
          <Leader />
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{pl.price || 'Listed'}</span>
        </div>
        {pl.meta ? <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.04em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pl.meta}</div> : null}
        {media.length > 0 && (
          <div style={{ margin: '8px 0 2px', display: 'flex', gap: 6, overflowX: 'auto' }} className="bs-hide-scroll">
            {media.slice(0, 8).map((m, mi) => (
              <div key={mi} style={{ position: 'relative', flex: 'none', width: 64, height: 64, overflow: 'hidden', background: t.PAPER2, border: `1px solid ${t.HAIR}` }}>
                {m.type === 'video'
                  ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline preload="metadata" />
                  : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                {m.type === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 1l6 4-6 4z" fill="#fff" /></svg></div></div>}
              </div>
            ))}
          </div>
        )}
        <button onClick={() => setPreviewPlan(pl)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 14px 10px 0', minHeight: 36, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${t.INK}59`, paddingBottom: 2 }}>{tr('marketplace:preview.action', { defaultValue: "What's inside →" })}</span></button>
        {pl.price ? (
          <button onClick={() => openCheckout({ type: 'plan', name: pl.name, price: pl.price, planId: pl.id, unit: 'one-time', perks: [pl.meta || 'Coach-built plan', 'Saved to your Library'] })} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0 10px', minHeight: 36, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>{tr('marketplace:listing.buyKeep', { defaultValue: 'Buy · yours to keep →' })}</span></button>
        ) : <div style={{ height: 10 }} />}
      </div>
    );
  };

  return (
    <BSPage>
      {(() => {
        // The header block — eyebrow, portrait, name, register. When the coach
        // set a cover, it renders scrimmed BEHIND the whole block; absent, the
        // block renders exactly as before (byte-identical — no wrapper).
        const header = (<>
          {/* The standing masthead row opens the page (owner ruling 2026-08-01 —
              same format, same size, no deviation); back keeps its own row
              directly beneath it, flush left. */}
          <div style={{ padding: `${BS_MAST_TOP_CSS} ${t.padX}px 0` }}>
            {window.BSMastRow ? React.createElement(window.BSMastRow, { trailing: bsMktCorner(), style: { marginBottom: 12 } }) : null}
            <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0, minHeight: 24 }}>← {tr('marketplace:nav.theClassifieds', { defaultValue: 'The Classifieds' })}</button>
            <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: roleColor }}>
              {no != null ? `${tr('marketplace:listing.listingNo', { defaultValue: 'Listing Nº {no}', no: String(no).padStart(2, '0') })} · ` : ''}{bsmRoleWord(tr, isNutriDetail)}{coach.verified ? ` · ${tr('marketplace:listing.vetted', { defaultValue: '✓ Vetted' })}` : ''}
            </div>
          </div>

          {/* The portrait — duotone frame, role spine; honest initials fallback. */}
          <div style={{ margin: `12px ${t.padX}px 0` }}>
            <MktPortrait photo={photo || coach.photo || coach.avatar} name={coach.name} w="100%" h={180} fontSize={44} spine={roleColor} />
          </div>

          <div style={{ padding: `14px ${t.padX}px 0` }}>
            <h1 style={{ margin: 0, fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK }}>{firstName}<br/><span style={{ fontStyle: 'italic' }}>{last}<span style={{ color: roleColor }}>.</span></span></h1>
            {/* THE STANDING — the coach's rung owns its own register row (tier
                spine + name, dot-leader, points) instead of competing inside the
                credential line. Renders ONLY when the rung is actually known: a
                real coach with no Shape Score points shows nothing here. */}
            {tierName ? (
              <div style={{ marginTop: 12, display: 'flex', alignItems: 'baseline', gap: 9, borderLeft: `3px solid ${tierColor}`, paddingLeft: 10 }}>
                <span style={{ flexShrink: 0, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', color: tierColor }}>{tierName}</span>
                <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}3d`, transform: 'translateY(-3px)', minWidth: 10 }} />
                {/* The points term reuses the score namespace's own per-locale
                    word (every namespace is bundled on one instance), so this
                    adds no new key and can't drift from the Score page. */}
                {tierPoints != null ? (
                  <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{Number(tierPoints).toLocaleString(bsmLocale())} {tr('score:unit.pts', { defaultValue: 'pts' })}</span>
                ) : null}
              </div>
            ) : null}
            <div style={{ marginTop: 9, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{[getPrimaryCredential(coach), mktShortLoc(coach.loc)].filter(Boolean).join(' · ')}</div>
            <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em', color: t.INK }}>{p.headline}</div>
            {/* Score left this grid when the tier register took it over — the rung
                + its real points ARE the standing, and a second copy (from the
                old derived formula) would both duplicate and contradict it. */}
            <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {[
                [tr('marketplace:stat.sessions', { defaultValue: 'Sessions' }), coach.sessionCount != null ? Number(coach.sessionCount).toLocaleString(bsmLocale()) : '—'],
                [tr('marketplace:stat.years', { defaultValue: 'Years' }), coach.years ? String(coach.years) : '—'],
                [tr('marketplace:stat.rating', { defaultValue: 'Rating' }), avgRev != null ? String(avgRev) : formatCoachRating10(coach)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', fontWeight: 800, textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
                  <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
            <div aria-hidden style={{ marginTop: 10, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${roleColor} 72%, transparent)` }} />
            {p.tagline ? <div style={{ marginTop: 13, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.45, color: t.INK70, letterSpacing: '-0.01em' }}>“{p.tagline}”</div> : null}
            <button onClick={openIntro} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 15, padding: 14, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.bookTheIntro', { defaultValue: 'Book the intro · $0' })}</button>
            <button onClick={openMessage} style={{ marginTop: 12, background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 0', minHeight: 24, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${t.INK}59` }}>{tr('marketplace:listing.messageName', { defaultValue: '✉ Message {name}', name: firstName })}</button>
          </div>
        </>);
        return listingCover ? (
          <div style={{ position: 'relative' }}>
            <div aria-hidden style={{ position: 'absolute', inset: 0, backgroundImage: `linear-gradient(180deg, ${t.PAPER}b3, ${t.PAPER}e6 62%, ${t.PAPER}), url("${listingCover}")`, backgroundSize: 'cover', backgroundPosition: 'center' }} />
            <div style={{ position: 'relative' }}>{header}</div>
          </div>
        ) : header;
      })()}

      {/* THE STUDIO — the coach's studio gallery, between the register block and
          the coupon. Absent → the station does not exist. */}
      {listingGallery.length ? <div style={{ padding: `18px ${t.padX}px 0` }}><MktStudioStrip gallery={listingGallery} role={roleColor} /></div> : null}

      {/* ── Open this week ─────────────────────────────── */}
      <Station>{tr('marketplace:listing.openThisWeek', { defaultValue: 'Open this week · intro is free' })}</Station>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        {openSlots.length === 0 ? (
          <div style={{ padding: '10px 0', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:listing.noOpenTimes', { defaultValue: 'No open times this week — message {name} to find one.', name: firstName })}</div>
        ) : openSlots.map((s, i) => (
          <button key={`${s.iso}-${s.time}`} onClick={() => selectSlot(s.day, s.date, s.time, s.iso, s.month)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <span style={{ flexShrink: 0, width: 42, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{s.day}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{fmtSlot(s.time)}</span>
            <Leader />
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>{tr('marketplace:slot.holdIt', { defaultValue: 'Hold it →' })}</span>
          </button>
        ))}
        <button onClick={() => setShowCal(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: `1px solid ${t.HAIR}` }}>
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{tr('marketplace:listing.seeFullCalendar', { defaultValue: 'See the full calendar' })}</span>
          <Leader />
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>→</span>
        </button>
      </div>

      {/* ── The rate card ─────────────────────────────── */}
      <Station>{tr('marketplace:listing.rateCard', { defaultValue: 'The rate card' })}</Station>
      {monthlyPkg ? (
        <div style={{ margin: `12px ${t.padX}px 0`, border: `1px solid ${t.RULE}`, padding: '13px 13px 15px', position: 'relative', background: t.PAPER }}>
          <div aria-hidden style={{ position: 'absolute', inset: 6, border: `1px dashed ${t.INK}3d`, pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            {atCapacity ? (
              wl?.status === 'invited' ? (<>
                <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.GREEN }}>{tr('marketplace:listing.invited', { defaultValue: "You're invited" })}</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{tr('marketplace:listing.roomForYou', { defaultValue: '{name} has room for you.', name: firstName })}</div>
                {/* Book now = the per-role ONE-TIME purchase (trainer session /
                    nutritionist meal plan) — a non-Subscription item.type puts the
                    checkout route in one-time payment mode; the charge is server-
                    authoritative (session_price / meal_plan_price, the same fields
                    coach.rate maps from). The normal coupon CTA is hidden at
                    capacity, so the subscription path rides alongside — mirrors the
                    website first-dibs trio (#1498). */}
                <button onClick={() => openCheckout({ type: 'One-time', name: isNutriDetail ? 'Meal plan' : 'Booking', price: `$${coach.rate}`, unit: 'one-time', perks: isNutriDetail ? ['Coach-built meal plan', 'No subscription'] : ['One-time session', 'No subscription'] })} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, minHeight: 44, border: 0, background: t.GREEN, color: '#0c0a08', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.bookNow', { defaultValue: 'Book now' })}</button>
                <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => openCheckout(monthlyPkg)} style={{ minHeight: 44, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tr('marketplace:listing.subscribeMo', { defaultValue: 'Subscribe /mo' })}</button>
                  <button onClick={wlWithdraw} style={{ minHeight: 44, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tr('marketplace:listing.decline', { defaultValue: 'Decline' })}</button>
                </div>
              </>) : wl ? (<>
                <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.RUST }}>{tr('marketplace:listing.onWaitlist', { defaultValue: 'On the waiting list' })}</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.45 }}>{tr('marketplace:listing.waitlistPosition', { defaultValue: "You're #{position} in line. {name} will invite you when a spot opens.", position: wl.position, name: firstName })}</div>
                <button onClick={wlWithdraw} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, minHeight: 44, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{tr('marketplace:listing.leaveList', { defaultValue: 'Leave the list' })}</button>
              </>) : (<>
                <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.RUST }}>{tr('marketplace:listing.atCapacity', { defaultValue: 'At capacity' })}</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.45 }}>{tr('marketplace:listing.atCapacityBody', { defaultValue: "{name} isn't taking new clients right now. Join the waiting list to be first in line.", name: firstName })}</div>
                <button onClick={wlJoin} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, minHeight: 44, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.joinWaitlist', { defaultValue: 'Join the waiting list' })}</button>
              </>)
            ) : (<>
              <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:listing.standingOffer', { defaultValue: '✂ · Standing offer' })}</div>
              <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{tr('marketplace:listing.coachedMonthly', { defaultValue: 'Coached by {name}, monthly', name: firstName })}<span style={{ color: roleColor }}>.</span></div>
              {Array.isArray(monthlyPkg.perks) && <div style={{ marginTop: 6, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK70 }}>{monthlyPkg.perks.slice(0, 3).join(' · ')}</div>}
              <div style={{ marginTop: 9, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{monthlyPkg.price}<span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>/MO</span></div>
              <button onClick={() => openCheckout(monthlyPkg)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 11, padding: 12, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.subscribeArrow', { defaultValue: 'Subscribe →' })}</button>
              <div style={{ marginTop: 9, textAlign: 'center' }}>
                <button onClick={() => setOfferSheet(true)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 0', minHeight: 24, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${t.INK}59`, paddingBottom: 2 }}>{tr('marketplace:listing.whatsIncluded', { defaultValue: "What's included →" })}</span></button>
              </div>
            </>)}
          </div>
        </div>
      ) : null}
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        {oneTimePkgs.map((item) => (
          <div key={item.name} style={{ borderBottom: `1px solid ${t.HAIR}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '11px 0 2px' }}>
              <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{item.name}</span>
              <Leader />
              <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{item.price}</span>
            </div>
            {item.sub ? <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.04em' }}>{item.sub}</div> : null}
            <button onClick={() => openCheckout(item)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0 10px', minHeight: 36, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>{tr('marketplace:listing.buyArrow', { defaultValue: 'Buy →' })}</span></button>
          </div>
        ))}
      </div>

      {salePlanPrograms.length > 0 && (<>
        <Station>{isNutriDetail ? tr('marketplace:listing.dietsPlans', { defaultValue: 'Diets & plans' }) : tr('marketplace:listing.programsPlans', { defaultValue: 'Programs & plans' })}</Station>
        <div style={{ padding: `2px ${t.padX}px 0` }}>{salePlanPrograms.map((pl) => renderSaleRow(pl))}</div>
      </>)}

      {/* Single workouts/meals — individually buyable one-off files. Live coaches
          list theirs via coach_plans; the demo shelf shows on preview rows only.
          The legacy p.singles fallback carries a live checkout button, so it is
          gated exactly like the demo catalogue above (signed-OUT preview of a
          provider-less row) — otherwise a signed-in viewer would see the demo
          programs correctly hidden but still get fabricated singles to buy. */}
      {(salePlanSingles.length > 0 || (!saleProviderId && !bsmSignedIn() && Array.isArray(p.singles) && p.singles.length > 0)) && (<>
        <Station>{isNutriDetail ? tr('marketplace:listing.singleMeals', { defaultValue: 'Single meals' }) : tr('marketplace:listing.singleWorkouts', { defaultValue: 'Single workouts' })}</Station>
        <div style={{ padding: `2px ${t.padX}px 0` }}>
          {salePlanSingles.length > 0
            ? salePlanSingles.map((pl) => renderSaleRow(pl))
            : p.singles.map((s) => (
                <div key={s.name} style={{ borderBottom: `1px solid ${t.HAIR}` }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '11px 0 2px' }}>
                    <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{s.name}</span>
                    <Leader />
                    <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{s.price}</span>
                  </div>
                  <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.04em' }}>{s.meta}</div>
                  <button onClick={() => openCheckout({ type: 'One-time', name: s.name, price: s.price, unit: 'one-time', perks: [s.meta, 'Saved to your Library'] })} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0 10px', minHeight: 36, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>{tr('marketplace:listing.buyKeep', { defaultValue: 'Buy · yours to keep →' })}</span></button>
                </div>
              ))}
        </div>
      </>)}

      {/* ── The approach ─────────────────────────────── */}
      <Station>{tr('marketplace:listing.approach', { defaultValue: 'The approach' })}</Station>
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.5, color: t.INK }}>{p.philosophy}</div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70, lineHeight: 2 }}>{[...(coach.spec || []), coach.category].filter(Boolean).slice(0, 7).join(' · ')}</div>
      </div>
      <Station>{tr('marketplace:listing.credentials', { defaultValue: 'Credentials' })}</Station>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        {(getCoachCertifications(coach).length ? getCoachCertifications(coach) : [getPrimaryCredential(coach)]).map((cert, i) => (
          <div key={`${cert}-${i}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, color: roleColor, letterSpacing: '0.1em', fontWeight: 800 }}>{cert}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.35 }}>{cert === getPrimaryCredential(coach) ? coach.cred : tr('marketplace:listing.certVerified', { defaultValue: '{role} certification - verified on Shape', role: bsmRoleWord(tr, isNutriDetail) })}</span>
          </div>
        ))}
      </div>

      {/* ── The sample ─────────────────────────────── */}
      <Station>{p.kind === 'trainer' ? tr('marketplace:listing.sampleWorkout', { defaultValue: 'Sample workout' }) : tr('marketplace:listing.samplePlan', { defaultValue: 'Sample plan' })} · {p.sampleMeta}</Station>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        <div style={{ padding: '8px 0 2px', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{p.sampleTitle} <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>· {tr('marketplace:listing.previewTag', { defaultValue: 'Preview' })}</span></div>
        {p.sampleBlocks.map(([label, mv, detail, note], i) => (
          <div key={`${label}-${mv}`} style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '9px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <span style={{ flexShrink: 0, width: 38, fontFamily: t.MONO, fontSize: 9.5, color: roleColor, letterSpacing: '0.08em', fontWeight: 800 }}>{label}</span>
            <span style={{ minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK }}>{mv}</span>
              <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.04em' }}>{note}</span>
            </span>
            <Leader />
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, color: t.INK70, whiteSpace: 'nowrap' }}>{detail}</span>
          </div>
        ))}
      </div>

      {/* ── From their clients ─────────────────────────────── */}
      <Station>{tr('marketplace:listing.fromClients', { defaultValue: 'From their clients' })}{avgRev != null ? ` · ${avgRev}/10` : ''}{coach.clients ? ` · ${tr('marketplace:listing.coached', { defaultValue: '{count} coached', count: coach.clients })}` : ''}</Station>
      <div style={{ padding: `6px ${t.padX}px 0` }}>
        {/* Write a review — a quiet form by the two-tier rule. */}
        <div style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>{tr('marketplace:listing.yourRating', { defaultValue: 'Your rating' })}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, marginBottom: 10 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setRevRating(n)} aria-label={tr('marketplace:listing.ratingAria', { defaultValue: '{n} of 10', n })} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '0 1px', fontSize: 20, lineHeight: 1, color: revRating >= n ? t.ACCENT : t.INK50 }}>★</button>
            ))}
            {revRating ? <span style={{ marginLeft: 6, fontFamily: t.MONO, fontSize: 11, color: t.ACCENT }}>{revRating}/10</span> : null}
          </div>
          <textarea value={revText} onChange={(e) => setRevText(e.target.value)} placeholder={tr('marketplace:listing.reviewPlaceholder', { defaultValue: 'Share how it went…' })} rows={2}
            style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '8px 10px', fontFamily: t.DISPLAY, fontSize: 13.5, resize: 'vertical', outline: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={submitReview} disabled={!revRating || revPosting} style={{ borderRadius: t.RADIUS_SM, padding: '8px 16px', background: revRating ? t.INK : t.SURFACE, color: revRating ? t.PAPER : t.INK50, border: 0, cursor: (revRating && !revPosting) ? 'pointer' : 'default', opacity: revPosting ? 0.6 : 1, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{revPosting ? tr('marketplace:listing.posting', { defaultValue: 'Posting…' }) : tr('marketplace:listing.postReview', { defaultValue: 'Post review' })}</button>
          </div>
        </div>
        {liveReviews.map(rv => (
          <div key={rv.id} style={{ borderLeft: `3px solid ${roleColor}`, padding: '2px 0 2px 12px', marginTop: 14 }}>
            {rv.text ? <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.5, color: t.INK }}>“{rv.text}”</div> : null}
            <div style={{ marginTop: rv.text ? 6 : 0, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{rv.author} · {rv.rating}/10</div>
          </div>
        ))}
        {/* Curated testimonials render UNRATED — only real submitted reviews carry numbers. */}
        {p.reviews.map(([who, body]) => (
          <div key={who} style={{ borderLeft: `3px solid ${roleColor}`, padding: '2px 0 2px 12px', marginTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.5, color: t.INK }}>“{body}”</div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{who}</div>
          </div>
        ))}
      </div>

      {/* ── Good questions ─────────────────────────────── */}
      <Station>{tr('marketplace:listing.goodQuestions', { defaultValue: 'Good questions' })}</Station>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        {p.faq.map(([q, a], i) => (
          <div key={q} style={{ padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 14.5, color: t.INK, letterSpacing: '-0.01em' }}>{q}</div>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.45 }}>{a}</div>
          </div>
        ))}
      </div>

      {/* The Signal living profile — the social page, untouched by the Listing. */}
      {window.BSPublicProfile ? (
        <div style={{ padding: `18px ${t.padX}px 0` }}>
          <button onClick={() => setShowProfile(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{tr('marketplace:listing.fullProfile', { defaultValue: 'The full profile' })}</span>
            <Leader />
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>→</span>
          </button>
        </div>
      ) : null}

      <div style={{ padding: `16px ${t.padX}px 20px` }}>
        <button onClick={openIntro} style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 50, padding: '15px 10px', border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, lineHeight: 1.15, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.startWith', { defaultValue: 'Start with {name} · free intro →', name: firstName })}</button>
      </div>

      {offerSheet && monthlyPkg && (() => {
        // Coach-authored monthly offer (provider row monthly_offer) — honest
        // generic fallback when the coach hasn't written one.
        const mo = coach.monthly_offer && typeof coach.monthly_offer === 'object' ? coach.monthly_offer : null;
        const blurb = (mo && typeof mo.blurb === 'string' && mo.blurb.trim()) ? mo.blurb.trim().slice(0, 600) : null;
        const includes = (mo && Array.isArray(mo.includes) ? mo.includes : []).filter((x) => typeof x === 'string' && x.trim()).slice(0, 8);
        const rows = includes.length ? includes : (Array.isArray(monthlyPkg.perks) ? monthlyPkg.perks : []);
        return (
          <div onClick={() => setOfferSheet(false)} style={{ position: 'absolute', inset: 0, zIndex: 70, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr('marketplace:offer.aria', { defaultValue: "What {name}'s monthly coaching includes", name: firstName })} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '78%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }} className="bs-hide-scroll">
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: roleColor }}>{tr('marketplace:offer.eyebrow', { defaultValue: 'Monthly coaching' })}{blurb ? '' : ` · ${tr('marketplace:offer.standard', { defaultValue: 'Standard' })}`}</div>
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1.1 }}>{tr('marketplace:listing.coachedMonthly', { defaultValue: 'Coached by {name}, monthly', name: firstName })}<span style={{ color: roleColor }}>.</span></div>
              <div aria-hidden style={{ margin: '12px 0 2px', height: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />
              {blurb ? <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.55, color: t.INK }}>{blurb}</div>
                : <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: t.INK70 }}>{tr('marketplace:offer.noDescription', { defaultValue: "{name} hasn't written a custom description yet — the standard monthly package includes:", name: firstName })}</div>}
              <div style={{ marginTop: 6 }}>
                {rows.map((line, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 9, padding: '9px 0', borderBottom: `1px solid ${t.HAIR}` }}>
                    <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, color: teal, fontWeight: 800 }}>✓</span>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, lineHeight: 1.4 }}>{String(line).slice(0, 80)}</span>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 12, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{monthlyPkg.price}<span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>/MO</span></div>
              <div style={{ display: 'flex', gap: 12, marginTop: 12, alignItems: 'center' }}>
                <button onClick={() => setOfferSheet(false)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${t.INK}59`, paddingBottom: 2 }}>{tr('marketplace:sheet.close', { defaultValue: 'Close' })}</span></button>
                <button onClick={() => { setOfferSheet(false); openCheckout(monthlyPkg); }} style={{ flex: 1, padding: 14, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.subscribeArrow', { defaultValue: 'Subscribe →' })}</button>
              </div>
            </div>
          </div>
        );
      })()}

      {previewPlan && (
        <BSPlanPreviewSheet
          plan={previewPlan}
          isNutri={isNutriDetail}
          roleColor={roleColor}
          teal={teal}
          onClose={() => setPreviewPlan(null)}
          onBuy={() => {
            const pl = previewPlan;
            setPreviewPlan(null);
            openCheckout({ type: 'plan', name: pl.name, price: pl.price, planId: pl.id, unit: 'one-time', perks: [pl.meta || 'Coach-built plan', 'Saved to your Library'] });
          }}
        />
      )}

      <BSPublicActionPanel
        action={action}
        coach={coach}
        onClose={() => setAction(null)}
        onConfirm={confirmAction}
        onMessageSent={sendMessage}
      />

      <BSFooter right={bsmRoleWord(tr, isNutriDetail)} />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// Coach detail screen (sheet-style)
// ═══════════════════════════════════════════════════════════

// Expose
Object.assign(window, { BSMarketplaceScreen, BSCoachDetail: BSCoachDetailPublic, BSCoachDetailPublic, BSHeadshot });

