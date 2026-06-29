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
const MKT_PALETTE = ['#34d6c5', '#c0533b', '#a07a2e', '#5a86c0', '#5fae7e'];
function mktHue(seed) {
  const s = String(seed || 'shape');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return MKT_PALETTE[h % MKT_PALETTE.length];
}
function mktRoleColor(c) {
  return getPublicProfileKind(c) === 'nutritionist' ? '#a07a2e' : '#c0533b';
}
function mktShortLoc(loc) {
  const s = String(loc || '').trim();
  return s ? s.split(',')[0] : '';
}

function MktAvatar({ c, size = 44 }) {
  const t = useBS();
  const col = mktRoleColor(c);
  return (
    <div style={{ width: size, height: size, flexShrink: 0, borderRadius: 999, background: col, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: Math.round(size * 0.42), letterSpacing: '-0.02em' }}>{c.init || String(c.name || '?').charAt(0)}</div>
  );
}

function MktPill({ label, on, onClick, teal }) {
  const t = useBS();
  return (
    <button onClick={onClick} style={{ flexShrink: 0, padding: '8px 15px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
      border: `1.5px solid ${on ? teal : t.RULE}`,
      background: on ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent',
      color: on ? teal : t.INK70,
      fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase',
    }}>{label}</button>
  );
}

function MktSectionHead({ kicker, title, action, onAction, teal }) {
  const t = useBS();
  return (
    <div style={{ padding: `0 ${t.padX}px`, marginBottom: 12, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>{kicker}</div>
        <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{title}</div>
      </div>
      {action ? (
        <button onClick={onAction} style={{ flexShrink: 0, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal }}>{action} →</button>
      ) : null}
    </div>
  );
}

function MktTrackRow({ n, title, meta, right, onClick, first }) {
  const t = useBS();
  return (
    <button onClick={onClick} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 12, alignItems: 'baseline', padding: '13px 0', borderTop: first ? 0 : `1px solid ${t.HAIR}` }}>
      <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 700 }}>{String(n).padStart(2, '0')}</span>
      <span style={{ minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{title}</span>
        <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{meta}</span>
      </span>
      <span style={{ fontFamily: t.MONO, fontSize: 10.5, color: t.INK70, fontWeight: 700, whiteSpace: 'nowrap' }}>{right}</span>
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
function MktCoachCard({ c, onOpen, photo }) {
  const t = useBS();
  const isNutri = getPublicProfileKind(c) === 'nutritionist';
  const { name: tierName, color: tierColor, prof } = mktCoachTier(c);
  const Facet = window.BSFacetAvatar;
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', border: `1px solid ${t.RULE}`, borderRadius: 15, overflow: 'hidden', background: `linear-gradient(165deg, ${tierColor}24, ${t.PAPER2} 58%)`, padding: 13, display: 'flex', flexDirection: 'column', gap: 9 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        {Facet ? <Facet size={38} c={tierColor} initial={mktInitials(c.name)} photo={photo} showRank={false} BG={t.PAPER} INK={'#fff'} /> : <MktAvatar c={c} size={38} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
          <div style={{ marginTop: 1, fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: tierColor, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tierName} · {isNutri ? 'Nutritionist' : 'Trainer'}</div>
        </div>
      </div>
      <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 12, lineHeight: 1.35, color: t.INK70, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', minHeight: 32 }}>{c.bio || prof.headline}</div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em' }}>
        <span style={{ color: tierColor }}>★ {formatCoachRating10(c)}</span>
        <span style={{ color: t.INK50 }}>${c.rate}/mo</span>
      </div>
    </button>
  );
}

function MktRow({ c, onOpen, photo }) {
  const t = useBS();
  const { name: tierName, color: tierColor } = mktCoachTier(c);
  const Facet = window.BSFacetAvatar;
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 13, alignItems: 'center', padding: 14, borderRadius: 16, border: `1px solid ${t.RULE}`, background: `linear-gradient(150deg, ${tierColor}14, ${t.PAPER2} 58%)` }}>
      {Facet ? <Facet size={46} c={tierColor} initial={mktInitials(c.name)} photo={photo} showRank={false} BG={t.PAPER} INK={'#fff'} /> : <MktAvatar c={c} size={46} />}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 16.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: tierColor, border: `1px solid ${tierColor}66`, borderRadius: 3, padding: '1px 5px', lineHeight: 1 }}>{tierName}</span>
        </div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getPrimaryCredential(c)} · {mktShortLoc(c.loc)}</div>
        <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13, color: t.INK70, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.bio}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 19, color: t.INK, letterSpacing: '-0.02em', lineHeight: 1 }}>${c.rate}</div>
        <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>/mo</div>
        <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: tierColor }}>★ {formatCoachRating10(c)}</div>
      </div>
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
    // Tapping a coach opens their full living profile (Signal — sigil, tier,
    // stats, offerings + Buy), the same page members see. Falls back to the
    // marketplace detail card if the living profile isn't loaded.
    const Living = window.BSPublicProfile;
    if (Living) {
      const kind = getPublicProfileKind(open);
      const prof = buildPublicProfile(open);
      const person = {
        who: open.name, kind: kind === 'nutritionist' ? 'NUTRI' : 'TRAINER',
        userId: open.provider_user_id || null, city: open.loc || open.city || 'Remote',
        bio: open.bio || '', init: open.init || (open.name ? open.name[0] : '?'),
        tier: open.tier || null, public: true,
        // Commerce payload so the living profile's Coaching tab is a real storefront
        // (Subscribe / Book / packages), driven by the same global services.
        commerce: { coach: open, role: kind, packages: prof.packages },
      };
      return <Living person={person} onBack={() => setOpen(null)} onMessage={(p) => { setOpen(null); if (goChat) goChat((p && p.who) || open.name, kind === 'nutritionist' ? 'Nutritionist' : 'Trainer'); }} />;
    }
    return <BSCoachDetailPublic coach={open} onBack={() => setOpen(null)} />;
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
              photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined}
              live={!!(window.bsAmLive && window.bsAmLive())}
              showRank={false}
              onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} }}
            />
          ) : null}
          </div>
        </div>
        <h1 style={{ margin: '14px 0 0', fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.04em', color: t.INK }}>
          Find your<br /><span style={{ fontStyle: 'italic', color: teal }}>coach.</span>
        </h1>
      </div>

      {/* Search */}
      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 16px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
          <span style={{ fontSize: 14, color: t.INK50 }}>⌕</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Coaches, plans, playlists…" style={{ flex: 1, border: 0, outline: 'none', background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, letterSpacing: '-0.005em', padding: 0, minWidth: 0 }} />
          {query ? <button onClick={() => setQuery('')} style={{ border: 0, background: 'transparent', color: t.INK50, cursor: 'pointer', fontSize: 17, lineHeight: 1, padding: 0 }}>×</button> : null}
        </div>
      </div>

      {/* Role pills — wrap so all are visible (no horizontal scroll) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, padding: `16px ${t.padX}px ${catList ? 10 : 18}px` }}>
        {pills.map((p) => (
          <MktPill key={p} label={p} on={pill === p && !(p === 'All' && forceList)} onClick={() => pickPill(p)} teal={teal} />
        ))}
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
          <MktSectionHead kicker={cat && cat !== 'All Categories' ? cat : (pill === 'All' ? 'Everyone' : pill)} title={`${list.length} ${list.length === 1 ? 'coach' : 'coaches'}`} teal={teal} />
          <div style={{ padding: `0 ${t.padX}px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((c) => <MktRow key={c.id} c={c} photo={coachPhoto(c)} onOpen={() => setOpen(c)} />)}
            {list.length === 0 ? <div style={{ padding: '20px 0', fontFamily: t.DISPLAY, fontSize: 15, color: t.INK50 }}>No coaches match that — try a different filter.</div> : null}
          </div>
        </>
      ) : (
        <>
          {/* Coach of the week — a mini living-profile preview */}
          {cotw && cotwProfile ? (() => {
            const ct = mktCoachTier(cotw); const tierColor = ct.color;
            const isN = getPublicProfileKind(cotw) === 'nutritionist';
            const Facet = window.BSFacetAvatar;
            return (
            <div style={{ padding: `0 ${t.padX}px` }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Coach of the week</div>
              <div onClick={() => setOpen(cotw)} style={{ cursor: 'pointer', marginTop: 8, borderRadius: 16, border: `1px solid ${tierColor}40`, overflow: 'hidden', background: `linear-gradient(160deg, ${tierColor}2e, ${t.PAPER2} 60%)`, padding: 14 }}>
                {/* hero row — facet avatar (real photo when available) + name + tier */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {Facet ? <Facet size={50} c={tierColor} initial={mktInitials(cotw.name)} photo={coachPhoto(cotw)} showRank={false} BG={t.PAPER} INK={'#fff'} /> : <MktAvatar c={cotw} size={50} />}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cotw.name}</div>
                    <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: tierColor, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ct.name} · {isN ? 'Nutritionist' : 'Trainer'} · {mktShortLoc(cotw.loc)}</div>
                  </div>
                  <span style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, background: tierColor, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 700 }}>→</span>
                </div>
                {/* quote */}
                <div style={{ marginTop: 11, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, lineHeight: 1.35, letterSpacing: '-0.01em', color: t.INK70 }}>“{cotw.bio}”</div>
                {/* stat row */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, marginTop: 12 }}>
                  {[['★ ' + formatCoachRating10(cotw), 'Rating'], [(cotw.clients || 0) + '+', 'Clients'], [(cotw.years || 1) + 'y', 'Experience']].map(([v, l]) => (
                    <div key={l} style={{ borderRadius: 11, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '9px 6px', textAlign: 'center' }}>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{v}</div>
                      <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 7, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
                    </div>
                  ))}
                </div>
                {/* tracklist */}
                <div style={{ marginTop: 13, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>Tracklist</div>
                <div style={{ marginTop: 1 }}>
                  {cotwProfile.packages.slice(0, 3).map((p, i) => (
                    <MktTrackRow key={p.name} n={i + 1} title={p.name} meta={`${p.unit === '/ month' ? 'Monthly' : 'One-time'} · ${p.perks.length} included`} right={p.price} first={i === 0} onClick={() => setOpen(cotw)} />
                  ))}
                </div>
              </div>
            </div>
            );
          })() : null}

          {/* Featured this week — 2-up grid */}
          <div style={{ marginTop: 26 }}>
            <MktSectionHead kicker="Featured" title="This week" action="See all" onAction={() => setForceList(true)} teal={teal} />
            <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
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
            const tabPill = (on) => ({ flex: 'none', padding: '6px 13px', borderRadius: 999, cursor: 'pointer', whiteSpace: 'nowrap',
              border: `1px solid ${on ? teal : t.RULE}`, background: on ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent',
              color: on ? teal : t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' });
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

          {/* Coach apply CTAs — both roles, side by side (discovery view only) */}
          <div style={{ margin: `26px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
            {[{ role: 'trainer', label: 'trainer' }, { role: 'nutritionist', label: 'nutritionist' }].map((b) => (
              <button key={b.role} onClick={() => setApplyRole(b.role)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 13, border: `1.5px solid ${t.AMBER}`, background: t.PAPER2, padding: '11px 12px' }}>
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.AMBER }}>Coaches</div>
                <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.12 }}>Apply to be a <span style={{ fontStyle: 'italic', color: t.AMBER }}>{b.label}.</span></div>
                <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.AMBER }}>Apply →</div>
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
  const monthly = isNutritionist ? Math.max(240, coach.rate * 2 + 60) : Math.max(240, coach.rate * 2 - 40);
  const program = isNutritionist ? Math.max(180, coach.rate + 100) : Math.max(160, coach.rate + 15);
  const single = isNutritionist ? Math.max(28, Math.round(coach.rate * 0.25)) : Math.max(32, Math.round(coach.rate * 0.2));
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
    availability: [
      ['Thu', '14', ['12:00', '17:30']],
      ['Fri', '15', ['14:00']],
      ['Sat', '16', ['09:00']],
      ['Sun', '17', ['--']],
      ['Mon', '18', ['07:00', '17:30']],
      ['Tue', '19', ['06:30', '18:00']],
      ['Wed', '20', ['--']],
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

function BSProfileMiniStat({ value, label }) {
  const t = useBS();
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 27, lineHeight: 1, color: t.INK, letterSpacing: '-0.04em' }}>{value}</div>
      <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.13em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{label}</div>
    </div>
  );
}

function BSPublicPackageCard({ item, onSelect }) {
  const t = useBS();
  return (
    <BSProfileCard style={{
      borderColor: item.featured ? t.ACCENT : t.RULE,
      background: item.featured ? t.PAPER3 : t.PAPER2,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
        <BSEyebrow color={item.featured ? t.ACCENT : t.INK50}>{item.type}</BSEyebrow>
        {item.featured && <BSTag color={t.ACCENT} dark={!t.isLight}>Popular</BSTag>}
      </div>
      <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 18, color: t.INK, letterSpacing: '-0.03em' }}>{item.name}</div>
      <div style={{ marginTop: 8, display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: t.DISPLAY, fontSize: 40, lineHeight: 1, color: t.INK, letterSpacing: '-0.05em' }}>{item.price}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{item.unit}</span>
      </div>
      <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.35, color: t.INK70 }}>{item.sub}</div>
      <div style={{ marginTop: 12, borderTop: `1px solid ${t.HAIR}`, paddingTop: 10, display: 'grid', gap: 8 }}>
        {item.perks.map(perk => (
          <div key={perk} style={{ display: 'grid', gridTemplateColumns: '14px 1fr', gap: 7, alignItems: 'baseline' }}>
            <span style={{ color: t.ACCENT, fontFamily: t.MONO, fontSize: 10, fontWeight: 800 }}>+</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, lineHeight: 1.35 }}>{perk}</span>
          </div>
        ))}
      </div>
      <button onClick={() => onSelect && onSelect(item)} style={{
        marginTop: 14, width: '100%', borderRadius: t.RADIUS_SM,
        minHeight: 42, padding: '11px 8px', background: item.featured ? t.INK : 'transparent', color: item.featured ? t.PAPER : t.INK,
        border: item.featured ? 0 : `1px solid ${t.INK}`, cursor: 'pointer',
        fontFamily: t.MONO, fontSize: 9.5, lineHeight: 1.15, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800,
        whiteSpace: 'normal', overflowWrap: 'anywhere',
      }}>{item.type === 'Subscription' ? 'Subscribe' : 'Buy now'}</button>
    </BSProfileCard>
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

function BSCoachDetailPublic({ coach, onBack }) {
  const t = useBS();
  const p = buildPublicProfile(coach);
  const roleColor = mktRoleColor(coach);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [tab, setTab] = useStateBSM2('profile');
  const [action, setAction] = useStateBSM2(null);
  const [checkoutBusy, setCheckoutBusy] = useStateBSM2(false);
  const tabs = ['profile', 'packages', 'sample', 'reviews'];

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
  // Role-aware catalogue tabs: trainers → Programs / Workouts / Plans;
  // nutritionists → Meals / Diets / Plans. The last tab is the catch-all.
  const PLAN_TABS = saleProviderRole === 'nutritionist'
    ? [['meal', 'Meals', (c) => /meal/.test(c)], ['diet', 'Diets', (c) => /diet/.test(c)], ['plans', 'Plans', null]]
    : [['program', 'Programs', (c) => /program/.test(c)], ['workout', 'Workouts', (c) => /workout|single/.test(c)], ['plans', 'Plans', null]];
  const [planTab, setPlanTab] = useStateBSM2(PLAN_TABS[0][0]);
  const planMatched = (pl) => PLAN_TABS.slice(0, -1).some(([, , m]) => m && m(pl.category || ''));
  const plansForTab = (key) => {
    const tab = PLAN_TABS.find((x) => x[0] === key) || PLAN_TABS[0];
    if (tab[2]) return (salePlans || []).filter((pl) => tab[2](pl.category || ''));
    return (salePlans || []).filter((pl) => /plan/.test(pl.category || '') || !planMatched(pl));
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
      .flatMap(([day, date, times]) => times.map(time => ({ day, date, time, month: 'May' })))
      .find(slot => slot.time && slot.time !== '--');
    setTab('packages');
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

  const selectSlot = (day, date, time) => {
    if (time === '--') return;
    setAction({
      type: 'Booking',
      title: `${day}, May ${date} at ${time}`,
      body: `Free intro call with ${coach.name}. You can reschedule later from messages.`,
      cta: 'Confirm booking',
      slot: { day, date, time, month: 'May' },
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

  return (
    <BSPage>
      {/* Back */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0 }}>← Back</button>
        <h1 style={{ margin: '10px 0 0', fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK }}>{coach.name.split(' ')[0]}<br/><span style={{ fontStyle: 'italic' }}>{last}</span></h1>
      </div>

      <div style={{ padding: `14px ${t.padX}px 16px` }}>
        {/* Hero card */}
        <div style={{ borderRadius: 20, border: `1px solid ${t.RULE}`, overflow: 'hidden', background: `linear-gradient(160deg, ${roleColor}24, ${t.PAPER2} 58%)` }}>
          <div style={{ padding: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
              <MktAvatar c={coach} size={56} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 999, border: `1px solid ${roleColor}66`, background: `${roleColor}1f` }}>
                  <span style={{ width: 5, height: 5, borderRadius: 999, background: roleColor }} />
                  <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: roleColor }}>{p.tier} tier</span>
                </span>
                <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{getPrimaryCredential(coach)} · {mktShortLoc(coach.loc)}</div>
              </div>
            </div>
            <div style={{ marginTop: 13, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, lineHeight: 1.25, letterSpacing: '-0.02em', color: t.INK }}>{p.headline}</div>
            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {[`${coach.match}% match`, `★ ${formatCoachRating10(coach)}`, `${coach.clients} clients`].map((s, i) => (
                <span key={i} style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: i === 0 ? teal : t.INK70, padding: '5px 10px', borderRadius: 999, border: `1px solid ${i === 0 ? teal : t.RULE}`, background: i === 0 ? `${teal}14` : 'transparent' }}>{s}</span>
              ))}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
            {[[p.score, 'Shape score'], [(coach.sessionCount || 0).toLocaleString(), p.sessionsLabel], [`${coach.years || 1}y`, 'Experience']].map(([v, l], i) => (
              <div key={l} style={{ padding: '12px', borderLeft: i ? `1px solid ${t.RULE}` : 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1 }}>{v}</div>
                <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{l}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ marginTop: 13, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 16, lineHeight: 1.4, color: t.INK70, letterSpacing: '-0.01em' }}>“{p.tagline}”</div>

        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button onClick={openIntro} style={{ minHeight: 46, padding: '12px', borderRadius: 999, background: teal, color: '#04201d', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Book intro · $0</button>
          <button onClick={openMessage} style={{ minHeight: 46, padding: '12px', borderRadius: 999, background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Message</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 7, padding: `2px ${t.padX}px 14px`, flexWrap: 'wrap' }}>
        {tabs.map(k => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{
              flex: '1 1 0', minWidth: 66, padding: '9px 6px', borderRadius: 999, cursor: 'pointer',
              border: `1.5px solid ${on ? teal : t.RULE}`,
              background: on ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent',
              color: on ? teal : t.INK70,
              fontFamily: t.MONO, fontSize: 9, lineHeight: 1.1, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 800,
            }}>{k}</button>
          );
        })}
      </div>

      {tab === 'profile' && (
        <>
          <BSSection title="About" meta="Approach" />
          <div style={{ padding: `0 ${t.padX}px 16px`, display: 'grid', gap: 12 }}>
            <BSProfileCard>
              <BSEyebrow color={t.ACCENT}>Philosophy</BSEyebrow>
              <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontSize: 15.5, lineHeight: 1.45, color: t.INK }}>{p.philosophy}</div>
            </BSProfileCard>
            <BSProfileCard>
              <BSEyebrow color={t.ACCENT}>Specialties</BSEyebrow>
              <div style={{ marginTop: 10, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {[...coach.spec, coach.category].filter(Boolean).slice(0, 7).map(s => (
                  <span key={s} style={{
                    borderRadius: 999,
                    border: `1px solid ${t.RULE}`,
                    background: t.PAPER2,
                    padding: '6px 11px',
                    fontFamily: t.MONO,
                    fontSize: 8.5,
                    letterSpacing: '0.11em',
                    textTransform: 'uppercase',
                    color: t.INK70,
                    fontWeight: 800,
                  }}>{s}</span>
                ))}
              </div>
            </BSProfileCard>
            <BSProfileCard>
              <BSEyebrow color={t.ACCENT}>Credentials</BSEyebrow>
              <div style={{ marginTop: 8, display: 'grid', gap: 9 }}>
                {(getCoachCertifications(coach).length ? getCoachCertifications(coach) : [getPrimaryCredential(coach)]).map((cert, i) => (
                  <div key={`${cert}-${i}`} style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 10, paddingTop: i ? 9 : 0, borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
                    <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.ACCENT, letterSpacing: '0.1em', fontWeight: 800 }}>{cert}</span>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.35 }}>{cert === getPrimaryCredential(coach) ? coach.cred : `${p.role} certification - verified on Shape`}</span>
                  </div>
                ))}
              </div>
            </BSProfileCard>
          </div>
        </>
      )}

      {tab === 'packages' && (
        <>
          {salePlans && salePlans.length > 0 && (() => {
            const list = plansForTab(planTab);
            return (
              <>
                <BSSection title={saleProviderRole === 'nutritionist' ? 'Meal plans & diets' : 'Workouts & programs'} meta={`${salePlans.length} listed`} />
                <div style={{ padding: `0 ${t.padX}px 10px`, display: 'flex', gap: 6 }}>
                  {PLAN_TABS.map(([key, label]) => {
                    const on = planTab === key;
                    const n = plansForTab(key).length;
                    return (
                      <button key={key} onClick={() => setPlanTab(key)} style={{ flex: 1, padding: '8px 6px', borderRadius: 999, cursor: 'pointer', border: on ? 0 : `1px solid ${t.RULE}`, background: on ? roleColor : 'transparent', color: on ? '#fff' : t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}{n ? ` · ${n}` : ''}</button>
                    );
                  })}
                </div>
                <div style={{ padding: `0 ${t.padX}px 16px`, display: 'grid', gap: 8 }}>
                  {list.length === 0 ? (
                    <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, padding: '10px 2px' }}>Nothing listed here yet.</div>
                  ) : list.map((pl) => {
                    const media = Array.isArray(pl.detail?.media) ? pl.detail.media.filter((m) => m && m.url) : [];
                    return (
                    <div key={pl.id} style={{ borderRadius: 13, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '12px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: roleColor }}>{String(pl.category || (pl.kind === 'meal_plan' ? 'meal' : 'program')).toUpperCase()}</div>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.name}</div>
                          {pl.meta && <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pl.meta}</div>}
                        </div>
                        {pl.price ? (
                          <button onClick={() => openCheckout({ type: 'plan', name: pl.name, price: pl.price, planId: pl.id, unit: 'one-time', perks: [pl.meta || 'Coach-built plan', 'Saved to your Library'] })} style={{ flexShrink: 0, borderRadius: 999, border: 0, background: t.INK, color: t.PAPER, padding: '9px 15px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>Buy · {pl.price}</button>
                        ) : (
                          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Listed</span>
                        )}
                      </div>
                      {media.length > 0 && (
                        <div style={{ marginTop: 10, display: 'flex', gap: 6, overflowX: 'auto' }} className="bs-hide-scroll">
                          {media.slice(0, 8).map((m, i) => (
                            <div key={i} style={{ position: 'relative', flex: 'none', width: 64, height: 64, borderRadius: 9, overflow: 'hidden', background: t.PAPER, border: `1px solid ${t.HAIR}` }}>
                              {m.type === 'video'
                                ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted playsInline preload="metadata" />
                                : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                              {m.type === 'video' && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><div style={{ width: 18, height: 18, borderRadius: '50%', background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><svg width="8" height="8" viewBox="0 0 10 10"><path d="M2 1l6 4-6 4z" fill="#fff" /></svg></div></div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    );
                  })}
                </div>
              </>
            );
          })()}
          <BSSection title="Packages" meta="Pricing" />
          <div style={{ padding: `0 ${t.padX}px 16px`, display: 'grid', gap: 10 }}>
            {p.packages.map(item => <BSPublicPackageCard key={item.name} item={item} onSelect={openCheckout} />)}
          </div>
          <BSSection title="Availability" meta="Next 7 days" />
          <div style={{ padding: `0 ${t.padX}px 16px`, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(54px, 1fr))', gap: 5, overflowX: 'auto' }}>
            {p.availability.map(([day, date, times]) => (
              <div key={day} style={{ minWidth: 54, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '9px 6px', borderRadius: t.RADIUS_SM }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>{day}</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 22, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 4 }}>{date}</div>
                <div style={{ marginTop: 8, display: 'grid', gap: 5 }}>
                  {times.map((time, i) => (
                    <button key={`${time}-${i}`} onClick={() => selectSlot(day, date, time)} disabled={time === '--'} style={{ borderRadius: t.RADIUS_SM,
                      padding: '6px 4px', background: time === '--' ? 'transparent' : t.PAPER3,
                      color: time === '--' ? t.INK30 : t.ACCENT, border: `1px solid ${time === '--' ? t.HAIR : t.RULE}`,
                      fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.04em', fontWeight: 800,
                      cursor: time === '--' ? 'default' : 'pointer',
                      opacity: time === '--' ? 0.7 : 1,
                    }}>{time}</button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'sample' && (
        <>
          <BSSection title={p.kind === 'trainer' ? 'Sample Workout' : 'Sample Plan'} meta={p.sampleMeta} />
          <div style={{ padding: `0 ${t.padX}px 16px` }}>
            <BSProfileCard>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', paddingBottom: 12, borderBottom: `1px solid ${t.HAIR}` }}>
                <div>
                  <div style={{ fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 21, color: t.INK, letterSpacing: '-0.04em' }}>{p.sampleTitle}</div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>{p.sampleMeta}</div>
                </div>
                <BSTag color={t.ACCENT} dark={!t.isLight}>Preview</BSTag>
              </div>
              <div>
                {p.sampleBlocks.map(([label, name, detail, note], i) => (
                  <div key={`${label}-${name}`} style={{ display: 'grid', gridTemplateColumns: '46px 1fr', gap: 10, padding: '12px 0', borderBottom: i === p.sampleBlocks.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                    <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.ACCENT, letterSpacing: '0.1em', fontWeight: 800 }}>{label}</span>
                    <div>
                      <div style={{ fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 15, color: t.INK, letterSpacing: '-0.02em' }}>{name}</div>
                      <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.35 }}>{detail}</div>
                      <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{note}</div>
                    </div>
                  </div>
                ))}
              </div>
            </BSProfileCard>
          </div>
        </>
      )}

      {tab === 'reviews' && (
        <>
          <BSSection title="Reviews" meta={avgRev != null ? `${avgRev}/10 · ${liveReviews.length + p.reviews.length} reviews` : `${formatCoachRating10(coach)} · ${coach.clients} clients`} />
          <div style={{ padding: `0 ${t.padX}px 16px`, display: 'grid', gap: 10 }}>
            {/* Write a review (1–10) */}
            <BSProfileCard>
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
            </BSProfileCard>
            {liveReviews.map(rv => (
              <BSProfileCard key={rv.id}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <BSEyebrow color={t.ACCENT}>{rv.author}</BSEyebrow>
                  <span style={{ fontFamily: t.MONO, color: t.ACCENT, fontSize: 10, letterSpacing: '0.08em', fontWeight: 800 }}>{rv.rating}/10</span>
                </div>
                {rv.text && <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.45, color: t.INK }}>"{rv.text}"</div>}
              </BSProfileCard>
            ))}
            {p.reviews.map(([name, body]) => (
              <BSProfileCard key={name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                  <BSEyebrow color={t.ACCENT}>{name}</BSEyebrow>
                  <span style={{ fontFamily: t.MONO, color: t.ACCENT, fontSize: 10, letterSpacing: '0.08em', fontWeight: 800 }}>10.0/10</span>
                </div>
                <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.45, color: t.INK }}>"{body}"</div>
              </BSProfileCard>
            ))}
          </div>
          <BSSection title="FAQ" meta="Good questions" />
          <div style={{ padding: `0 ${t.padX}px 18px`, display: 'grid', gap: 8 }}>
            {p.faq.map(([q, a]) => (
              <BSProfileCard key={q}>
                <div style={{ fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 15, color: t.INK, letterSpacing: '-0.02em' }}>{q}</div>
                <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.4 }}>{a}</div>
              </BSProfileCard>
            ))}
          </div>
        </>
      )}

      <div style={{ padding: `16px ${t.padX}px 20px` }}>
        <button onClick={openIntro} style={{ borderRadius: 999,
          width: '100%', minHeight: 50, padding: '15px 10px', background: teal, color: '#04201d', border: 0, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 10.5, lineHeight: 1.15, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800,
        }}>Start with {p.first} →</button>
      </div>

      <BSPublicActionPanel
        action={action}
        coach={coach}
        onClose={() => setAction(null)}
        onConfirm={confirmAction}
        onMessageSent={sendMessage}
      />

      <BSFooter right={`${p.role} - ${coach.id.toUpperCase()}`} />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// Coach detail screen (sheet-style)
// ═══════════════════════════════════════════════════════════

// Expose
Object.assign(window, { BSMarketplaceScreen, BSCoachDetail: BSCoachDetailPublic, BSCoachDetailPublic, BSHeadshot });
