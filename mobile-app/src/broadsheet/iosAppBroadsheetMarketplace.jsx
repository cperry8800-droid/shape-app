import React from 'react';
// iosAppBroadsheetMarketplace.jsx — Coach marketplace in the Broadsheet visual language.
// "The Personals" / classifieds-meets-features. Browse trainers + nutritionists.
//
// Provides:
//   • BSMarketplaceScreen — full screen with hero, tab toggle, featured coach,
//     filter strip, coach grid, "rate card" listings, and a "writers wanted" CTA.
//   • BSCoachDetail        — opened when a coach card is tapped (sheet-style).

const { useState: useStateBSM2, useMemo: useMemoBSM2, useEffect: useEffectBSM2 } = React;
const { BSPage, BSPageHeader, BSAvatar, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow, BSFooter, BSHalftone, useBS } = window;
import { bsProjectAvailability, bsSlotsByDay } from '../services/coachAvailability.mjs';

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
    { id: 't1', name: 'Jordan Chen', loc: 'Brooklyn, NY', category: 'Strength & Resistance', format: 'Hybrid', cred: 'NASM-CPT - 9 yrs', spec: ['Strength', 'Hypertrophy', 'Block periodization'], rate: 180, sessions: '50-min - 1:1', years: 9, sessionCount: 740, match: 96, rating: 4.9, clients: 28, init: 'J', bio: 'Block-style strength coach. Tempo-driven progressions, weekly RPE check-ins, no fluff.', tag: 'YOUR COACH' },
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
    { id: 'n1', name: 'Dr. Maya Patel', loc: 'Remote', category: 'Sports Performance & Hydration', cred: 'RD, CSSD - 12 yrs', spec: ['Sports', 'Body comp', 'Cuts/builds'], rate: 140, sessions: '30-min - 1:1', years: 12, sessionCount: 760, match: 94, rating: 5.0, clients: 41, init: 'M', bio: 'Sports-focused RD. Body-composition phases, refeeds, fueling around training.', tag: 'YOUR NUTRITIONIST' },
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
function mktCoachTier(c) {
  const prof = buildPublicProfile(c);
  const clientTier = String(prof.tier || 'base').toLowerCase();
  const name = (window.bsCoachTier ? window.bsCoachTier(clientTier) : prof.tier) || 'Certified';
  const color = (window.bsTierColor ? window.bsTierColor(String(name).toLowerCase()) : mktRoleColor(c)) || mktRoleColor(c);
  return { name, color, prof };
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
  const isNutri = getPublicProfileKind(c) === 'nutritionist';
  const role = mktRoleColor(c);
  const { name: tierName } = mktCoachTier(c);
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: 0, background: 'transparent', padding: 0 }}>
      <MktPortrait photo={photo} name={c.name} w="100%" h={122} fontSize={30} spine={role} />
      <span style={{ display: 'block', marginTop: 8, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
      <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isNutri ? 'Nutritionist' : 'Trainer'} · {tierName}</span>
      <span style={{ display: 'block', marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>★ {formatCoachRating10(c)} · ${c.rate}/mo</span>
    </button>
  );
}

// Classifieds listing row — role spine, mono index, serif name, a dot leader
// running to the rate figure. Dense on purpose: portraits live on the feature
// + featured cells; the listings are the paper's want-ads. Role is named in
// the meta line (never color-only).
function MktRow({ c, onOpen, n }) {
  const t = useBS();
  const role = mktRoleColor(c);
  const isNutri = getPublicProfileKind(c) === 'nutritionist';
  const { name: tierName } = mktCoachTier(c);
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, position: 'relative', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '12px 0 12px 12px', borderTop: `1px solid ${t.HAIR}` }}>
      <span aria-hidden style={{ position: 'absolute', left: 0, top: 9, bottom: 9, width: 3, background: role }} />
      <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, fontWeight: 700 }}>{String(n).padStart(2, '0')}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
        <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isNutri ? 'Nutritionist' : 'Trainer'} · {getPrimaryCredential(c)} · {mktShortLoc(c.loc)} · {tierName}</span>
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
  { id: 'demo-p1', tab: 'program', name: '8-Week Hypertrophy Block', coachName: 'Maya Okafor', providerRole: 'trainer', price: '$160', demo: true },
  { id: 'demo-p2', tab: 'program', name: 'Powerbuilding Foundations', coachName: 'Marcus Johnson', providerRole: 'trainer', price: '$180', demo: true },
  { id: 'demo-p3', tab: 'program', name: 'Marathon Base Builder', coachName: 'Cal Redmond', providerRole: 'trainer', price: '$140', demo: true },
  { id: 'demo-w1', tab: 'workout', name: 'Heavy Pull Day', coachName: 'Leah Kim', providerRole: 'trainer', price: '$32', demo: true },
  { id: 'demo-w2', tab: 'workout', name: 'Full-Body HIIT', coachName: 'Zoë Carter', providerRole: 'trainer', price: '$28', demo: true },
  { id: 'demo-w3', tab: 'workout', name: 'Mobility Reset', coachName: 'Priya Natarajan', providerRole: 'trainer', price: '$24', demo: true },
  { id: 'demo-m1', tab: 'meal', name: 'High-Protein Cut · 2 Weeks', coachName: 'Tanya Brooks', providerRole: 'nutritionist', price: '$120', demo: true },
  { id: 'demo-m2', tab: 'meal', name: 'Plant-Based Performance', coachName: 'Omar Hassan', providerRole: 'nutritionist', price: '$95', demo: true },
  { id: 'demo-m3', tab: 'meal', name: 'Gut-Health Reset Plan', coachName: 'Dr. Sarah Mitchell', providerRole: 'nutritionist', price: '$130', demo: true },
];
function BSMarketplaceScreen({ onBack, onProfile, initialRole, goChat }) {
  const t = useBS();
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
  const coachPhoto = (c) => (c && (c.photo || c.avatar || (c.provider_user_id ? avatarByUser[c.provider_user_id] : null))) || undefined;

  const pills = ['All', 'Trainers', 'Nutritionists'];

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
      <div style={{ padding: `64px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {window.BSLogo ? <window.BSLogo size={16} color={t.INK} /> : null}
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70 }}>Vol. 1 · No. 1</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0 }}>← Back</button>
          {window.BSFacetAvatar ? (
            <window.BSFacetAvatar
              size={34}
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
        </div>
        {/* The Classifieds eyebrow — the marketplace is the paper's listings section */}
        <div style={{ margin: '16px 0 0', display: 'flex', alignItems: 'center', gap: 7 }}>
          <span aria-hidden style={{ flex: 'none', width: 10, height: 2, background: teal }} />
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>The classifieds</span>
        </div>
        <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.04em', color: t.INK }}>
          Find your<br /><span style={{ fontStyle: 'italic', color: teal }}>coach.</span>
        </h1>
      </div>

      {/* Search — an underline, not a pill (Classifieds pass) */}
      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 2px', borderBottom: `1.5px solid ${t.INK}4d` }}>
          <span aria-hidden style={{ fontSize: 14, color: t.INK50 }}>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Coaches, plans, playlists…" style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, letterSpacing: '-0.005em', padding: 0, minWidth: 0 }} />
          {query ? <button onClick={() => setQuery('')} aria-label="Clear search" style={{ border: 0, background: 'transparent', color: t.INK50, cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: '0 4px' }}>×</button> : null}
        </div>
      </div>

      {/* Role index — typographic tabs on a hairline, teal (page-chrome) underline */}
      <div role="tablist" aria-label="Filter coaches by role" style={{ margin: `12px ${t.padX}px ${catList ? 10 : 14}px`, display: 'flex', borderBottom: `1px solid ${t.INK}17` }}>
        {pills.map((p) => { const on = pill === p && !(p === 'All' && forceList); return (
          <button key={p} role="tab" aria-selected={on} onClick={() => pickPill(p)} style={{ flex: 1, minWidth: 0, minHeight: 44, position: 'relative', background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 0 11px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>
            {p}
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
              {catList.map((ct) => <option key={ct} value={ct}>{ct === 'All Categories' ? 'All categories' : ct}</option>)}
            </select>
            {pill === 'Trainers' && (
              <select value={format} onChange={(e) => setFormat(e.target.value)} style={sel}>
                {BSM_MARKETPLACE_FORMATS.map((f) => <option key={f} value={f}>{f === 'All formats' ? 'All formats' : f}</option>)}
              </select>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select value={loc} onChange={(e) => setLoc(e.target.value)} style={sel}>
              {(locList || ['Anywhere']).map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={sort} onChange={(e) => setSort(e.target.value)} style={sel}>
              {BSM_MARKETPLACE_SORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
        </div>
        );
      })()}

      {(providersLoading || providersError) ? (
        <div style={{ padding: `0 ${t.padX}px 10px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: providersError ? t.RUST : t.INK50, fontWeight: 700 }}>
          {providersLoading ? 'Syncing live providers…' : `Demo data · ${providersError}`}
        </div>
      ) : null}

      {browsing ? (
        <>
          <MktSectionHead kicker={cat && cat !== 'All Categories' ? cat : (pill === 'All' ? 'Everyone' : pill)} title={`${list.length} on the books`} teal={teal} />
          <div style={{ padding: `0 ${t.padX}px`, display: 'flex', flexDirection: 'column' }}>
            {list.map((c, i) => <MktRow key={c.id} c={c} n={i + 1} onOpen={() => { setOpenNo(i + 1); setOpen(c); }} />)}
            {list.length === 0 ? <div style={{ padding: '20px 0', fontFamily: t.DISPLAY, fontSize: 15, color: t.INK50 }}>No coaches match that — try a different filter.</div> : null}
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
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>Feature · Coach of the week</span>
              </div>
              <div onClick={() => setOpen(cotw)} role="button" tabIndex={0} onKeyDown={(e) => { if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) { e.preventDefault(); setOpen(cotw); } }} style={{ cursor: 'pointer', marginTop: 10, position: 'relative', paddingLeft: 13 }}>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 2, bottom: 2, width: 3, background: role }} />
                <div style={{ display: 'flex', gap: 13 }}>
                  <MktPortrait photo={photo} name={cotw.name} w={96} h={118} fontSize={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.05 }}>{cotw.name}<span style={{ color: role }}>.</span></div>
                    <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{isN ? 'Nutritionist' : 'Trainer'} · {ct.name} · {mktShortLoc(cotw.loc)}</div>
                    <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13, lineHeight: 1.35, letterSpacing: '-0.01em', color: t.INK70, display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>“{cotw.bio}”</div>
                    <div style={{ display: 'flex', gap: 22, marginTop: 10 }}>
                      {[['Rating', '★ ' + formatCoachRating10(cotw)], ['Clients', (cotw.clients || 0) + '+'], ['Years', String(cotw.years || 1)]].map(([l, v]) => (
                        <div key={l}>
                          <div style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
                          <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 800, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
                {/* tracklist */}
                <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>Tracklist</div>
                <div style={{ marginTop: 1 }}>
                  {cotwProfile.packages.slice(0, 3).map((p, i) => (
                    <MktTrackRow key={p.name} n={i + 1} title={p.name} meta={`${p.unit === '/ month' ? 'Monthly' : 'One-time'} · ${p.perks.length} included`} right={p.price} first={i === 0} onClick={() => setOpen(cotw)} />
                  ))}
                </div>
                <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, textDecoration: 'underline', textUnderlineOffset: 3 }}>See the profile →</div>
              </div>
            </div>
            );
          })() : null}

          {/* Featured this week — 2-up grid */}
          <div style={{ marginTop: 26 }}>
            <MktSectionHead kicker="On the roster" title="This week" action="See all" onAction={() => setForceList(true)} teal={teal} />
            <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px 14px' }}>
              {featuredWeek.map((c) => <MktCoachCard key={c.id} c={c} photo={coachPhoto(c)} onOpen={() => setOpen(c)} />)}
            </div>
          </div>

          {/* What's hot — real published plans across coaches, tabbed by kind */}
          {(() => {
            const PLAN_TABS = [['program', 'Programs'], ['workout', 'Workouts'], ['meal', 'Meal plans']];
            // Live published plans when present; else sample plans so the rail is
            // populated in preview / before any coach has published.
            const live = Array.isArray(marketPlans) ? marketPlans : [];
            const all = live.length ? live : BSM_DEMO_PLANS;
            const tabPlans = all.filter((p) => p.tab === planTab).slice(0, 8);
            // Mono underline toggles (the rounded pills died with the Classifieds pass).
            const tabPill = (on) => ({ flex: 'none', minHeight: 40, background: 'transparent', border: 0, cursor: 'pointer', whiteSpace: 'nowrap',
              borderBottom: `2px solid ${on ? teal : 'transparent'}`, padding: '6px 2px 8px',
              color: on ? t.INK : t.INK50, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' });
            return (
            <div style={{ marginTop: 28 }}>
              <MktSectionHead kicker="From coaches" title="What's hot" teal={teal} />
              <div style={{ display: 'flex', gap: 7, padding: `0 ${t.padX}px 12px` }}>
                {PLAN_TABS.map(([k, label]) => <button key={k} onClick={() => setPlanTab(k)} style={tabPill(planTab === k)}>{label}</button>)}
              </div>
              <div style={{ padding: `0 ${t.padX}px` }}>
                {tabPlans.length === 0 ? (
                  <div style={{ padding: '14px 0', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>No {PLAN_TABS.find(([k]) => k === planTab)[1].toLowerCase()} listed yet — check back soon.</div>
                ) : tabPlans.map((pl, i) => (
                  <MktTrackRow key={pl.id} n={i + 1} title={pl.name} meta={`${pl.providerRole === 'nutritionist' ? 'Nutritionist' : 'Trainer'} · ${pl.coachName}`} right={pl.price || 'View'} first={i === 0} onClick={() => {
                    // Tap a hot plan → open that coach's page (their storefront, where
                    // the plan + Buy live). Real coaches resolve to their live account;
                    // sample plans open the demo coach's derived detail page — every
                    // row is a working link, never a dead toast.
                    setOpen({ name: pl.coachName, provider_user_id: (!pl.demo && pl.providerId) || undefined, provider_role: pl.providerRole, init: String(pl.coachName || '?').trim()[0] || '?', loc: 'Remote' });
                  }} />
                ))}
              </div>
            </div>
            );
          })()}

          {/* Coach apply CTAs — zero-box notices on an AMBER recruiting spine
              (semantic accent, line-only; text demoted to ink). Discovery view only. */}
          <div style={{ margin: `28px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18 }}>
            {[{ role: 'trainer', label: 'trainer' }, { role: 'nutritionist', label: 'nutritionist' }].map((b) => (
              <button key={b.role} onClick={() => setApplyRole(b.role)} style={{ position: 'relative', textAlign: 'left', cursor: 'pointer', border: 0, background: 'transparent', padding: '2px 0 2px 11px', minHeight: 44 }}>
                <span aria-hidden style={{ position: 'absolute', left: 0, top: 2, bottom: 2, width: 3, background: t.AMBER }} />
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>Coaches</div>
                <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.15 }}>Apply to be a <span style={{ fontStyle: 'italic' }}>{b.label}.</span></div>
                <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, textDecoration: 'underline', textUnderlineOffset: 3 }}>Apply →</div>
              </button>
            ))}
          </div>
        </>
      )}

      <BSFooter right="Marketplace" />
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
  const score = Math.round((coach.match || 80) * 18 + (coach.sessionCount || 300) / 5 + (coach.clients || 20) * 4);
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
    score,
    tier: score >= 2000 ? 'FORM' : score >= 750 ? 'TEMPO' : 'BASE',
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
  const [message, setMessage] = useStateBSM2(`Hi ${coach.name.split(' ')[0].replace('Dr.', '').trim()}, I found your profile on Shape and would like to learn more.`);
  if (!action) return null;
  const isMessage = action.type === 'Message';
  const canSendMessage = message.trim().length > 0;

  return (
    <div style={{
      position: 'fixed',
      left: 0,
      right: 0,
      bottom: 0,
      zIndex: 80,
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
            <BSEyebrow color={action.done ? t.ACCENT : t.INK50}>{action.type}</BSEyebrow>
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
          <button type="button" onClick={onClose} aria-label="Close" style={{
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
              Your note
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
            >Send message</button>
            <div style={{
              fontFamily: t.DISPLAY,
              fontSize: 12.5,
              lineHeight: 1.35,
              color: t.INK50,
              textAlign: 'center',
            }}>
              This starts a private thread in Chat.
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
          }}>{action.cta || 'Confirm'}</button>
        )}
      </BSProfileCard>
    </div>
  );
}

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
  const monthLabel = new Date(y, mo, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const nav = (dir) => { setSelIso(null); setYm(([yy, mm]) => (mm + dir < 0 ? [yy - 1, 11] : mm + dir > 11 ? [yy + 1, 0] : [yy, mm + dir])); };
  const daySlots = selIso ? (byDay.get(selIso) || []) : [];
  const first = (coach.name || '').split(' ')[0];
  return (
    <BSPage>
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0, minHeight: 24 }}>← The listing</button>
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: roleColor }}>The calendar · {first}{demo ? ' · Preview' : ''}</div>
        <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK }}>Open to <span style={{ fontStyle: 'italic', color: teal }}>book.</span></h1>
        {demo ? <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Preview · typical availability — confirm at booking</div> : null}
        <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <button onClick={() => nav(-1)} aria-label="Previous month" style={{ background: 'transparent', border: `1px solid ${t.RULE}`, borderRadius: 4, width: 34, height: 30, cursor: 'pointer', color: t.INK, fontSize: 13, lineHeight: 1 }}>‹</button>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{monthLabel}</span>
          <button onClick={() => nav(1)} aria-label="Next month" style={{ background: 'transparent', border: `1px solid ${t.RULE}`, borderRadius: 4, width: 34, height: 30, cursor: 'pointer', color: t.INK, fontSize: 13, lineHeight: 1 }}>›</button>
        </div>
        <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
          {BSM_DAYS3.map((d) => <div key={d} style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>{d}</div>)}
          {Array.from({ length: startPad }, (_, i) => <div key={`pad-${i}`} />)}
          {Array.from({ length: daysInMonth }, (_, i) => {
            const d = i + 1;
            const iso = isoOf(d);
            const slots = byDay.get(iso) || [];
            const past = iso < todayIso;
            const on = selIso === iso;
            const bookable = !past && slots.length > 0;
            return (
              <button key={iso} disabled={!bookable} onClick={() => setSelIso(on ? null : iso)} aria-label={bookable ? `${iso} — ${slots.length} open` : iso} style={{
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
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>{new Date(`${selIso}T00:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })} · intro is free</span>
            </div>
            {daySlots.map((s, i) => (
              <button key={`${s.iso}-${s.time}`} onClick={() => onPick(s)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{bsFmtSlot12(s.time)}</span>
                <span aria-hidden style={{ flex: 1, borderBottom: `1px dotted ${t.INK}47`, transform: 'translateY(-3px)', minWidth: 12 }} />
                <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>Hold it →</span>
              </button>
            ))}
          </div>
        ) : (
          <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Tap a marked day to see its open times.</div>
        )}
      </div>
      <BSFooter right="Availability" />
    </BSPage>
  );
}

// THE LISTING (spec 2026-07-09) — the marketplace conversion page: the tapped
// classified expanded. Role heat line-only; teal = the one commerce action;
// tier NAMED in the meta; every commerce handler verbatim. The Signal living
// profile opens from THE FULL PROFILE → leader — never replaced by this page.
function BSCoachDetailPublic({ coach, onBack, no = null, photo = null, goChat = null }) {
  const t = useBS();
  const p = buildPublicProfile(coach);
  const roleColor = mktRoleColor(coach);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
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
  React.useEffect(() => {
    if (!saleProviderId || !window.ShapeCoachPlans?.salePlans) { setSalePlans([]); return; }
    let on = true;
    window.ShapeCoachPlans.salePlans(saleProviderRole, saleProviderId).then((r) => { if (on) setSalePlans(r || []); }).catch(() => { if (on) setSalePlans([]); });
    return () => { on = false; };
  }, [saleProviderId, saleProviderRole]);
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
  const { name: tierName, color: tierColor } = mktCoachTier(coach);
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
      .then(d => { if (d && d.review) { setLiveReviews(prev => [d.review, ...prev]); setRevRating(0); setRevText(''); window.__bsToast?.('Review posted', 'ok'); } })
      .catch(err => { window.__bsToast?.(err && err.error ? err.error : 'Could not post review', 'err'); })
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
      title: `Book a free intro with ${firstName}`,
      body: 'Choose an open time below, or confirm now and Shape will hold the next available intro slot.',
      cta: 'Hold next open slot',
      slot: nextOpen,
    });
  };

  const openMessage = () => {
    setAction({
      type: 'Message',
      title: `Message ${firstName}`,
      body: 'Send a private note before booking. The thread will also appear on your Chat page.',
      cta: 'Send message',
    });
  };

  const openCheckout = (item) => {
    setAction({
      type: 'Checkout',
      title: item.type === 'Subscription' ? `Subscribe to ${item.name}` : `Buy ${item.name}`,
      body: `${item.price} ${item.unit}. Includes: ${item.perks.slice(0, 2).join(', ')}.`,
      cta: item.type === 'Subscription' ? 'Open secure subscription' : 'Open secure checkout',
      item,
    });
  };

  const selectSlot = (day, date, time, iso, month) => {
    if (time === '--') return;
    setAction({
      type: 'Booking',
      title: `${day}, ${month} ${date} at ${time}`,
      body: `Free intro call with ${coach.name}. You can reschedule later from messages.`,
      cta: 'Confirm booking',
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
            title: 'Checkout setup needed',
            body: result.message,
          });
        }
      } catch (error) {
        setAction({
          ...current,
          title: 'Checkout error',
          body: error?.message || 'Unable to open Stripe checkout.',
          cta: 'Try again',
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
        writeShapeCoachThread(coach, `Booked intro consultation: ${current.title}.`);
        setAction({
          ...current,
          done: true,
          title: 'Booked',
          body: result?.stored === 'supabase'
            ? `Your intro with ${coach.name} is saved in Shape bookings. A message thread has been started.`
            : `Your intro with ${coach.name} is held locally. A message thread has been started.`,
        });
      } catch (error) {
        setAction({
          ...current,
          title: 'Booking error',
          body: error?.message || 'Unable to save this consultation booking.',
          cta: 'Try again',
        });
      } finally {
        setCheckoutBusy(false);
      }
      return;
    }
    setAction({
      ...current,
      done: true,
      title: 'Booked',
      body: `Your intro with ${coach.name} is held. A message thread has been started.`,
    });
  };

  const sendMessage = async (text) => {
    const clean = (text || '').trim() || `Hi ${firstName}, I found your profile on Shape and would like to learn more.`;
    try {
      const result = await window.ShapeMessages?.sendProviderMessage?.({ coach, text: clean });
      writeShapeCoachThread(coach, clean, result || {});
      setAction({
        type: 'Message',
        done: true,
        title: result?.stored === 'supabase' ? 'Message synced' : 'Message saved locally',
        body: result?.stored === 'supabase'
          ? `${coach.name} will see your note in their Shape messages. The thread is synced to your Chat page under Team.`
          : `${coach.name}'s thread has been added to your Chat page under Team. Sign in after the message schema is live to sync across devices.`,
      });
    } catch (error) {
      writeShapeCoachThread(coach, clean);
      setAction({
        type: 'Message',
        done: true,
        title: 'Message saved locally',
        body: `${coach.name}'s thread was added to Chat. Supabase sync needs the conversations/messages migration run first. ${error?.message || ''}`,
      });
    }
  };

  if (showCal) {
    return <BSCoachAvailabilityCalendar coach={coach} roleColor={roleColor} open={realAvail != null ? realAvail : p.availability.flatMap(([, , times, iso]) => times.filter((x) => x && x !== '--').map((time) => ({ iso, weekday: new Date(`${iso}T00:00:00`).getDay(), time })))} demo={realAvail == null} onBack={() => setShowCal(false)} onPick={(s) => { setShowCal(false); const d = new Date(`${s.iso}T00:00:00`); selectSlot(BSM_DAYS3[d.getDay()], String(d.getDate()), s.time, s.iso, BSM_MONTHS3[d.getMonth()]); }} />;
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
    : p.availability.flatMap(([day, date, times, iso, month]) => times.filter((x) => x && x !== '--').map((time) => ({ day, date, time, iso, month })));
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
        {pl.price ? (
          <button onClick={() => openCheckout({ type: 'plan', name: pl.name, price: pl.price, planId: pl.id, unit: 'one-time', perks: [pl.meta || 'Coach-built plan', 'Saved to your Library'] })} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0 10px', minHeight: 36, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>Buy · yours to keep →</span></button>
        ) : <div style={{ height: 10 }} />}
      </div>
    );
  };

  return (
    <BSPage>
      {/* Back */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0, minHeight: 24 }}>← The Classifieds</button>
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: roleColor }}>
          {no != null ? `Listing Nº ${String(no).padStart(2, '0')} · ` : ''}{p.role}{coach.verified ? ' · ✓ Vetted' : ''}
        </div>
      </div>

      {/* The portrait — duotone frame, role spine; honest initials fallback. */}
      <div style={{ margin: `12px ${t.padX}px 0` }}>
        <MktPortrait photo={photo || coach.photo || coach.avatar} name={coach.name} w="100%" h={180} fontSize={44} spine={roleColor} />
      </div>

      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <h1 style={{ margin: 0, fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK }}>{firstName}<br/><span style={{ fontStyle: 'italic' }}>{last}<span style={{ color: roleColor }}>.</span></span></h1>
        <div style={{ marginTop: 9, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{getPrimaryCredential(coach)} · {mktShortLoc(coach.loc)} · <span style={{ color: tierColor }}>{tierName} tier</span></div>
        <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 600, lineHeight: 1.35, letterSpacing: '-0.01em', color: t.INK }}>{p.headline}</div>
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
          {[
            ['Score', p.score != null ? String(p.score) : '—'],
            ['Sessions', coach.sessionCount ? Number(coach.sessionCount).toLocaleString() : '—'],
            ['Years', coach.years ? String(coach.years) : '—'],
            ['Rating', avgRev != null ? String(avgRev) : formatCoachRating10(coach)],
          ].map(([l, v]) => (
            <div key={l}>
              <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', fontWeight: 800, textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
              <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
        <div aria-hidden style={{ marginTop: 10, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${roleColor} 72%, transparent)` }} />
        {p.tagline ? <div style={{ marginTop: 13, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.45, color: t.INK70, letterSpacing: '-0.01em' }}>“{p.tagline}”</div> : null}
        <button onClick={openIntro} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 15, padding: 14, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>Book the intro · $0</button>
        <button onClick={openMessage} style={{ marginTop: 12, background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 0', minHeight: 24, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${t.INK}59` }}>✉ Message {firstName}</button>
      </div>

      {/* ── Open this week ─────────────────────────────── */}
      <Station>Open this week · intro is free</Station>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        {openSlots.length === 0 ? (
          <div style={{ padding: '10px 0', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>No open times this week — message {firstName} to find one.</div>
        ) : openSlots.map((s, i) => (
          <button key={`${s.iso}-${s.time}`} onClick={() => selectSlot(s.day, s.date, s.time, s.iso, s.month)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <span style={{ flexShrink: 0, width: 42, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{s.day}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{fmtSlot(s.time)}</span>
            <Leader />
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>Hold it →</span>
          </button>
        ))}
        <button onClick={() => setShowCal(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: `1px solid ${t.HAIR}` }}>
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>See the full calendar</span>
          <Leader />
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>→</span>
        </button>
      </div>

      {/* ── The rate card ─────────────────────────────── */}
      <Station>The rate card</Station>
      {monthlyPkg ? (
        <div style={{ margin: `12px ${t.padX}px 0`, border: `1px solid ${t.RULE}`, padding: '13px 13px 15px', position: 'relative', background: t.PAPER }}>
          <div aria-hidden style={{ position: 'absolute', inset: 6, border: `1px dashed ${t.INK}3d`, pointerEvents: 'none' }} />
          <div style={{ position: 'relative' }}>
            {atCapacity ? (
              wl?.status === 'invited' ? (<>
                <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.GREEN }}>You're invited</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>{firstName} has room for you.</div>
                <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <button onClick={() => openCheckout(monthlyPkg)} style={{ minHeight: 44, border: 0, background: t.GREEN, color: '#0c0a08', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}>Book now</button>
                  <button onClick={wlWithdraw} style={{ minHeight: 44, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Decline</button>
                </div>
              </>) : wl ? (<>
                <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.RUST }}>On the waiting list</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.45 }}>You're #{wl.position} in line. {firstName} will invite you when a spot opens.</div>
                <button onClick={wlWithdraw} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, minHeight: 44, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Leave the list</button>
              </>) : (<>
                <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.RUST }}>At capacity</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.45 }}>{firstName} isn't taking new clients right now. Join the waiting list to be first in line.</div>
                <button onClick={wlJoin} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, minHeight: 44, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}>Join the waiting list</button>
              </>)
            ) : (<>
              <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>✂ · Standing offer</div>
              <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK }}>Coached by {firstName}, monthly<span style={{ color: roleColor }}>.</span></div>
              {Array.isArray(monthlyPkg.perks) && <div style={{ marginTop: 6, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK70 }}>{monthlyPkg.perks.slice(0, 3).join(' · ')}</div>}
              <div style={{ marginTop: 9, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{monthlyPkg.price}<span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>/MO</span></div>
              <button onClick={() => openCheckout(monthlyPkg)} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 11, padding: 12, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}>Subscribe →</button>
              <div style={{ marginTop: 9, textAlign: 'center' }}>
                <button onClick={() => setOfferSheet(true)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 0', minHeight: 24, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${t.INK}59`, paddingBottom: 2 }}>What's included →</span></button>
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
            <button onClick={() => openCheckout(item)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0 10px', minHeight: 36, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>Buy →</span></button>
          </div>
        ))}
      </div>

      {salePlanPrograms.length > 0 && (<>
        <Station>{isNutriDetail ? 'Diets & plans' : 'Programs & plans'}</Station>
        <div style={{ padding: `2px ${t.padX}px 0` }}>{salePlanPrograms.map((pl) => renderSaleRow(pl))}</div>
      </>)}

      {/* Single workouts/meals — individually buyable one-off files. Live coaches
          list theirs via coach_plans; the demo shelf shows on preview rows only. */}
      {(salePlanSingles.length > 0 || (!saleProviderId && Array.isArray(p.singles) && p.singles.length > 0)) && (<>
        <Station>{isNutriDetail ? 'Single meals' : 'Single workouts'}</Station>
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
                  <button onClick={() => openCheckout({ type: 'One-time', name: s.name, price: s.price, unit: 'one-time', perks: [s.meta, 'Saved to your Library'] })} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '8px 0 10px', minHeight: 36, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>Buy · yours to keep →</span></button>
                </div>
              ))}
        </div>
      </>)}

      {/* ── The approach ─────────────────────────────── */}
      <Station>The approach</Station>
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.5, color: t.INK }}>{p.philosophy}</div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK70, lineHeight: 2 }}>{[...(coach.spec || []), coach.category].filter(Boolean).slice(0, 7).join(' · ')}</div>
      </div>
      <Station>Credentials</Station>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        {(getCoachCertifications(coach).length ? getCoachCertifications(coach) : [getPrimaryCredential(coach)]).map((cert, i) => (
          <div key={`${cert}-${i}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 10, padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, color: roleColor, letterSpacing: '0.1em', fontWeight: 800 }}>{cert}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.35 }}>{cert === getPrimaryCredential(coach) ? coach.cred : `${p.role} certification - verified on Shape`}</span>
          </div>
        ))}
      </div>

      {/* ── The sample ─────────────────────────────── */}
      <Station>{p.kind === 'trainer' ? 'Sample workout' : 'Sample plan'} · {p.sampleMeta}</Station>
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        <div style={{ padding: '8px 0 2px', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{p.sampleTitle} <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>· Preview</span></div>
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
      <Station>From their clients{avgRev != null ? ` · ${avgRev}/10` : ''}{coach.clients ? ` · ${coach.clients} coached` : ''}</Station>
      <div style={{ padding: `6px ${t.padX}px 0` }}>
        {/* Write a review — a quiet form by the two-tier rule. */}
        <div style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>Your rating</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 1, marginBottom: 10 }}>
            {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
              <button key={n} onClick={() => setRevRating(n)} aria-label={`${n} of 10`} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '0 1px', fontSize: 20, lineHeight: 1, color: revRating >= n ? t.ACCENT : t.INK50 }}>★</button>
            ))}
            {revRating ? <span style={{ marginLeft: 6, fontFamily: t.MONO, fontSize: 11, color: t.ACCENT }}>{revRating}/10</span> : null}
          </div>
          <textarea value={revText} onChange={(e) => setRevText(e.target.value)} placeholder="Share how it went…" rows={2}
            style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '8px 10px', fontFamily: t.DISPLAY, fontSize: 13.5, resize: 'vertical', outline: 'none' }} />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
            <button onClick={submitReview} disabled={!revRating || revPosting} style={{ borderRadius: t.RADIUS_SM, padding: '8px 16px', background: revRating ? t.INK : t.SURFACE, color: revRating ? t.PAPER : t.INK50, border: 0, cursor: (revRating && !revPosting) ? 'pointer' : 'default', opacity: revPosting ? 0.6 : 1, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{revPosting ? 'Posting…' : 'Post review'}</button>
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
      <Station>Good questions</Station>
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
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>The full profile</span>
            <Leader />
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>→</span>
          </button>
        </div>
      ) : null}

      <div style={{ padding: `16px ${t.padX}px 20px` }}>
        <button onClick={openIntro} style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 50, padding: '15px 10px', border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, lineHeight: 1.15, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>Start with {firstName} · free intro →</button>
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
            <div onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={`What ${firstName}'s monthly coaching includes`} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '78%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }} className="bs-hide-scroll">
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: roleColor }}>Monthly coaching{blurb ? '' : ' · Standard'}</div>
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1.1 }}>Coached by {firstName}, monthly<span style={{ color: roleColor }}>.</span></div>
              <div aria-hidden style={{ margin: '12px 0 2px', height: 2, background: `linear-gradient(90deg, ${t.INK}, ${teal} 72%, transparent)` }} />
              {blurb ? <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.55, color: t.INK }}>{blurb}</div>
                : <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.5, color: t.INK70 }}>{firstName} hasn't written a custom description yet — the standard monthly package includes:</div>}
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
                <button onClick={() => setOfferSheet(false)} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: '13px 10px', minHeight: 44, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK }}><span style={{ borderBottom: `2px solid ${t.INK}59`, paddingBottom: 2 }}>Close</span></button>
                <button onClick={() => { setOfferSheet(false); openCheckout(monthlyPkg); }} style={{ flex: 1, padding: 14, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 11px) 0, 100% 11px, 100% 100%, 0 100%)' }}>Subscribe →</button>
              </div>
            </div>
          </div>
        );
      })()}

      <BSPublicActionPanel
        action={action}
        coach={coach}
        onClose={() => setAction(null)}
        onConfirm={confirmAction}
        onMessageSent={sendMessage}
      />

      <BSFooter right={p.role} />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// Coach detail screen (sheet-style)
// ═══════════════════════════════════════════════════════════

// Expose
Object.assign(window, { BSMarketplaceScreen, BSCoachDetail: BSCoachDetailPublic, BSCoachDetailPublic, BSHeadshot });
