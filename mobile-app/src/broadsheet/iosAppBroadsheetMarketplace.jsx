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
  Trainer: ['All Categories', 'Strength & Resistance', 'Cardio & Endurance', 'Marathon', 'Ultra', 'Pure Running', 'Hyrox', 'Mobility, Recovery & Rehab', 'Functional & Hybrid', 'Bodybuilding', 'HIIT', 'Fat Burn', 'At Home', 'Just for Women'],
  Nutritionist: ['All Categories', 'Sports Performance & Hydration', 'Performance Nutrition', 'Medical & Condition-Specific', 'Muscle Gain / Bulking', 'Gut Health & Functional Nutrition', 'Longevity & Healthspan', 'Weight Mgmt', 'Plant-Based', 'Prenatal', 'Meal Prep'],
};

const BSM_MARKETPLACE_LOCATIONS = {
  Trainer: ['Anywhere', 'Remote-friendly', 'Brooklyn, NY', 'Los Angeles', 'Austin, TX', 'Miami', 'Chicago', 'Denver', 'San Francisco', 'Atlanta', 'Boulder, CO'],
  Nutritionist: ['Anywhere', 'Remote only', 'London', 'Toronto', 'Stockholm', 'Copenhagen', 'Madrid', 'Milan', 'Sydney'],
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
    loc: row.location || (isNutritionist ? 'Remote' : 'Remote'),
    category: specialty || (isNutritionist ? 'Performance Nutrition' : 'Strength & Resistance'),
    format: row.format || (row.location ? 'Hybrid' : 'Remote'),
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

function MktCoachCard({ c, onOpen }) {
  const t = useBS();
  const hue = mktHue(c.category || c.name);
  const isNutri = getPublicProfileKind(c) === 'nutritionist';
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, padding: 0 }}>
      <div style={{ position: 'relative', height: 122, borderRadius: 16, overflow: 'hidden', border: `1px solid ${t.RULE}`, background: `linear-gradient(150deg, ${hue}5e, ${hue}1f 58%, ${t.PAPER2})` }}>
        <div style={{ position: 'absolute', top: 11, left: 12, right: 12, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: hue, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.category || (isNutri ? 'Nutrition' : 'Training')}</div>
        <div style={{ position: 'absolute', right: 11, bottom: 11 }}><MktAvatar c={c} size={42} /></div>
      </div>
      <div style={{ marginTop: 8 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK50, fontWeight: 600 }}>★ {c.rating} · ${c.rate}/mo</div>
      </div>
    </button>
  );
}

function MktRow({ c, onOpen }) {
  const t = useBS();
  return (
    <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '48px 1fr auto', gap: 13, alignItems: 'center', padding: 14, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
      <MktAvatar c={c} size={48} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</div>
        <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getPrimaryCredential(c)} · {mktShortLoc(c.loc)}</div>
        <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.3, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{c.bio}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 19, color: t.INK, letterSpacing: '-0.02em', lineHeight: 1 }}>${c.rate}</div>
        <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>/mo</div>
        <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70 }}>★ {c.rating}</div>
      </div>
    </button>
  );
}

function BSMarketplaceScreen({ onBack, onProfile, initialRole }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [pill, setPill] = useStateBSM2(initialRole === 'nutritionist' ? 'Nutritionists' : 'All');
  const [query, setQuery] = useStateBSM2('');
  const [forceList, setForceList] = useStateBSM2(false);
  const [open, setOpen] = useStateBSM2(null);
  const [applyRole, setApplyRole] = useStateBSM2(null);
  const [remoteCoaches, setRemoteCoaches] = useStateBSM2(null);
  const [providersLoading, setProvidersLoading] = useStateBSM2(false);
  const [providersError, setProvidersError] = useStateBSM2('');

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

  const marketplaceCoaches = remoteCoaches || BSM_MARKETPLACE_COACHES;
  const trainers = marketplaceCoaches.Trainer || [];
  const nutritionists = marketplaceCoaches.Nutritionist || [];
  const everyone = useMemoBSM2(() => [...trainers, ...nutritionists], [trainers, nutritionists]);
  const liveTotal = everyone.length;

  const pills = ['All', 'Trainers', 'Nutritionists'];

  const list = useMemoBSM2(() => {
    let out = everyone;
    if (pill === 'Trainers') out = trainers;
    else if (pill === 'Nutritionists') out = nutritionists;
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((c) =>
        [c.name, c.loc, c.cred, c.category, c.format, ...(c.spec || []), ...getCoachCertifications(c)]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(q)),
      );
    }
    return [...out].sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }, [pill, query, everyone, trainers, nutritionists]);

  const browsing = forceList || pill !== 'All' || query.trim().length > 0;

  const ranked = useMemoBSM2(
    () => [...everyone].sort((a, b) => ((b.match || 0) + (b.rating || 0) * 5) - ((a.match || 0) + (a.rating || 0) * 5)),
    [everyone],
  );
  const cotw = ranked.find((c) => c.tag) || ranked[0];
  const cotwProfile = cotw ? buildPublicProfile(cotw) : null;
  const featuredWeek = ranked.filter((c) => !cotw || c.id !== cotw.id).slice(0, 4);
  const programs = useMemoBSM2(() => featuredWeek.map((c) => {
    const prof = buildPublicProfile(c);
    const prog = prof.packages.find((p) => p.type === 'One-time' && /program|fueling/i.test(p.name)) || prof.packages[1];
    return { coach: c, name: `${(c.spec && c.spec[0]) || c.category || prof.role} block`, meta: `${prof.role} · ${c.first || c.name.split(' ')[0]}`, price: prog ? prog.price : `$${c.rate}` };
  }), [featuredWeek]);

  const pickPill = (p) => { setPill(p); setForceList(false); };

  if (applyRole && window.BSProviderApplicationScreen) {
    return <window.BSProviderApplicationScreen initialRole={applyRole} onBack={() => setApplyRole(null)} />;
  }
  if (open) return <BSCoachDetailPublic coach={open} onBack={() => setOpen(null)} />;

  return (
    <BSPage>
      {/* Hero */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0 }}>← Back</button>
        <h1 style={{ margin: '12px 0 0', fontFamily: t.DISPLAY, fontSize: 44, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.04em', color: t.INK }}>
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

      {/* Filter pills — wrap so all are visible (no horizontal scroll) */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 8, padding: `16px ${t.padX}px 18px` }}>
        {pills.map((p) => (
          <MktPill key={p} label={p} on={pill === p && !(p === 'All' && forceList)} onClick={() => pickPill(p)} teal={teal} />
        ))}
      </div>

      {(providersLoading || providersError) ? (
        <div style={{ padding: `0 ${t.padX}px 10px`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: providersError ? t.RUST : t.INK50, fontWeight: 700 }}>
          {providersLoading ? 'Syncing live providers…' : `Demo data · ${providersError}`}
        </div>
      ) : null}

      {browsing ? (
        <>
          <MktSectionHead kicker={pill === 'All' ? 'Everyone' : pill} title={`${list.length} ${list.length === 1 ? 'coach' : 'coaches'}`} teal={teal} />
          <div style={{ padding: `0 ${t.padX}px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
            {list.map((c) => <MktRow key={c.id} c={c} onOpen={() => setOpen(c)} />)}
            {list.length === 0 ? <div style={{ padding: '20px 0', fontFamily: t.DISPLAY, fontSize: 15, color: t.INK50 }}>No coaches match that — try a different filter.</div> : null}
          </div>
        </>
      ) : (
        <>
          {/* Coach of the week */}
          {cotw && cotwProfile ? (
            <div style={{ padding: `0 ${t.padX}px` }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Coach of the week</div>
              <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 25, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>{cotw.name}</div>
              <div onClick={() => setOpen(cotw)} style={{ cursor: 'pointer', marginTop: 12, borderRadius: 20, border: `1px solid ${t.RULE}`, overflow: 'hidden', background: `linear-gradient(160deg, ${mktRoleColor(cotw)}26, ${t.PAPER2} 62%)`, padding: 18 }}>
                <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 19, lineHeight: 1.35, letterSpacing: '-0.01em', color: t.INK }}>“{cotw.bio}”</div>
                <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 12 }}>
                  <MktAvatar c={cotw} size={42} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{cotw.name}</div>
                    <div style={{ marginTop: 1, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{(cotw.spec && cotw.spec[0]) || cotwProfile.role} · {mktShortLoc(cotw.loc)}</div>
                  </div>
                  <span style={{ width: 44, height: 44, flexShrink: 0, borderRadius: 999, background: mktRoleColor(cotw), color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700 }}>→</span>
                </div>
                <div style={{ marginTop: 18, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>Tracklist</div>
                <div style={{ marginTop: 2 }}>
                  {cotwProfile.packages.map((p, i) => (
                    <MktTrackRow key={p.name} n={i + 1} title={p.name} meta={`${p.unit === '/ month' ? 'Monthly' : 'One-time'} · ${p.perks.length} included`} right={p.price} first={i === 0} onClick={() => setOpen(cotw)} />
                  ))}
                </div>
              </div>
            </div>
          ) : null}

          {/* Featured this week — 2-up grid */}
          <div style={{ marginTop: 26 }}>
            <MktSectionHead kicker="Featured" title="This week" action="See all" onAction={() => setForceList(true)} teal={teal} />
            <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {featuredWeek.map((c) => <MktCoachCard key={c.id} c={c} onOpen={() => setOpen(c)} />)}
            </div>
          </div>

          {/* Programs */}
          <div style={{ marginTop: 28 }}>
            <MktSectionHead kicker="Programs" title="Start a thing" action="All" onAction={() => setForceList(true)} teal={teal} />
            <div style={{ padding: `0 ${t.padX}px` }}>
              {programs.map((pr, i) => (
                <MktTrackRow key={pr.coach.id} n={i + 1} title={pr.name} meta={pr.meta} right={pr.price} first={i === 0} onClick={() => setOpen(pr.coach)} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Coach apply CTA */}
      <button onClick={() => setApplyRole(pill === 'Nutritionists' ? 'nutritionist' : 'trainer')} style={{ margin: `30px ${t.padX}px 0`, width: `calc(100% - ${t.padX * 2}px)`, textAlign: 'left', cursor: 'pointer', borderRadius: 18, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 18, display: 'block' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.AMBER }}>Coaches</div>
        <div style={{ marginTop: 7, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.15 }}>Coach on Shape. <span style={{ fontStyle: 'italic', color: t.AMBER }}>Apply.</span></div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
          <span>{liveTotal.toLocaleString()} listings · real demand</span>
          <span style={{ color: t.AMBER }}>Apply →</span>
        </div>
      </button>

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
  const [tab, setTab] = useStateBSM2('profile');
  const [action, setAction] = useStateBSM2(null);
  const [checkoutBusy, setCheckoutBusy] = useStateBSM2(false);
  const tabs = ['profile', 'packages', 'sample', 'reviews'];

  // Live coach reviews (1–10), shared with the website via /api/coaches/reviews.
  const coachSlug = coach.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  const coachKind = coach.tag === 'Nutritionist' ? 'nutritionist' : 'trainer';
  const [liveReviews, setLiveReviews] = useStateBSM2([]);
  const [revRating, setRevRating] = useStateBSM2(0);
  const [revText, setRevText] = useStateBSM2('');
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
    if (!revRating) return;
    fetch('/api/coaches/reviews', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ coach: coachSlug, kind: coachKind, rating: revRating, text: revText }) })
      .then(r => (r.ok ? r.json() : r.json().then(e => Promise.reject(e))))
      .then(d => { if (d && d.review) { setLiveReviews(prev => [d.review, ...prev]); setRevRating(0); setRevText(''); window.__bsToast?.('Review posted', 'ok'); } })
      .catch(err => { window.__bsToast?.(err && err.error ? err.error : 'Could not post review', 'err'); });
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
      <BSPageHeader
        kicker={`Public ${p.role} Profile`}
        title={<>{coach.name.split(' ')[0]}<br/><span style={{ fontStyle: 'italic' }}>{last}</span></>}
        trailing={
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '6px 12px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          }}>Back</button>
        }
      />

      <div style={{ padding: `8px ${t.padX}px 16px`, borderBottom: `2px solid ${t.INK}` }}>
        <div style={{ position: 'relative', minHeight: 112, border: `1px solid ${t.INK}`, background: t.INK, overflow: 'hidden' }}>
          <div aria-hidden style={{
            position: 'absolute', inset: 0,
            backgroundImage: `radial-gradient(${t.PAPER} 1px, transparent 1.8px)`,
            backgroundSize: '7px 7px',
            opacity: 0.22,
          }} />
          <div style={{ position: 'relative', padding: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
              <BSEyebrow color={t.ACCENT}>{p.eyebrow}</BSEyebrow>
              <BSTag color={t.PAPER} dark={false}>{p.tier}</BSTag>
            </div>
            <div style={{ marginTop: 26, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: 'rgba(245,240,230,0.58)', fontWeight: 800 }}>
              Client view - customizable public profile
            </div>
          </div>
        </div>

        <div style={{ border: `1px solid ${t.INK}`, borderTop: 0, background: t.PAPER2, padding: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '76px 1fr', gap: 12, alignItems: 'start' }}>
            <BSHeadshot init={coach.init} size={76} />
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 20, lineHeight: 1.12, color: t.INK, letterSpacing: '-0.035em' }}>{p.headline}</div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 5 }}>
              <BSTag color={t.ACCENT} dark={!t.isLight}>{coach.match}% match</BSTag>
              <BSTag color={t.INK} dark>{formatCoachRating10(coach)} stars</BSTag>
              <BSTag color={t.INK} dark>{coach.clients} clients</BSTag>
              </div>
            </div>
          </div>
        </div>

        <BSProfileCard style={{ marginTop: 14 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.45, color: t.INK, letterSpacing: '-0.01em' }}>{p.tagline}</div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, borderTop: `1px solid ${t.HAIR}`, paddingTop: 12 }}>
            <BSProfileMiniStat value={p.score} label="Shape score" />
            <BSProfileMiniStat value={(coach.sessionCount || 0).toLocaleString()} label={p.sessionsLabel} />
            <BSProfileMiniStat value={`${coach.years || 1}y`} label="Experience" />
          </div>
        </BSProfileCard>

        <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 8 }}>
          <button onClick={openIntro} style={{ borderRadius: t.RADIUS_SM,
            minWidth: 0, minHeight: 48, padding: '12px 8px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, lineHeight: 1.15, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800,
            whiteSpace: 'normal', overflowWrap: 'anywhere',
          }}>Book intro - $0</button>
          <button onClick={openMessage} style={{ borderRadius: t.RADIUS_SM,
            minWidth: 0, minHeight: 48, padding: '12px 8px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, lineHeight: 1.15, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800,
            whiteSpace: 'normal', overflowWrap: 'anywhere',
          }}>Message</button>
        </div>
      </div>

      <div className="bs-scroll" style={{
        padding: `8px ${t.padX}px`,
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER2,
        scrollbarWidth: 'none',
        msOverflowStyle: 'none',
      }}>
        {tabs.map(k => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{ borderRadius: t.RADIUS_SM,
              flex: '1 0 92px',
              minWidth: 92,
              padding: '10px 8px',
              cursor: 'pointer',
              background: on ? t.INK : t.PAPER,
              border: `1px solid ${on ? t.INK : t.RULE}`,
              boxShadow: on ? `2px 2px 0 0 ${t.INK}` : 'none',
              color: on ? t.PAPER : t.INK70,
              fontFamily: t.MONO,
              fontSize: 9,
              lineHeight: 1.1,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 800,
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
                    borderRadius: t.RADIUS_SM,
                    border: `1px solid ${t.RULE}`,
                    padding: '7px 9px',
                    fontFamily: t.MONO,
                    fontSize: 9,
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
                <button onClick={submitReview} style={{ borderRadius: t.RADIUS_SM, padding: '8px 16px', background: revRating ? t.INK : t.SURFACE, color: revRating ? t.PAPER : t.INK50, border: 0, cursor: revRating ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Post review</button>
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

      <div style={{ padding: `4px ${t.padX}px 18px`, borderTop: `1px solid ${t.RULE}` }}>
        <button onClick={openIntro} style={{ borderRadius: t.RADIUS_SM,
          width: '100%', minHeight: 50, padding: '14px 10px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 10, lineHeight: 1.15, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800,
          whiteSpace: 'normal', overflowWrap: 'anywhere',
        }}>Start with {p.first}</button>
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
function BSCoachDetail({ coach, onBack }) {
  const t = useBS();
  const [tab, setTab] = useStateBSM2('about');
  return (
    <BSPage>
      <BSPageHeader
        kicker={`Profile · ${coach.cred.split(' · ')[0]}`}
        title={<>{coach.name.split(' ')[0]}<br/><span style={{ fontStyle: 'italic' }}>{coach.name.split(' ').slice(1).join(' ') || '—'}</span></>}
        trailing={
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '6px 12px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700,
          }}>← Back</button>
        }
      />

      {/* Hero */}
      <div style={{ padding: `8px ${t.padX}px 18px`, borderBottom: `2px solid ${t.INK}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: 14, alignItems: 'flex-start' }}>
          <BSHeadshot init={coach.init} size={110} />
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <BSTag color={t.ACCENT} dark={!t.isLight}>{coach.match}% MATCH</BSTag>
              <BSEyebrow color={t.INK50}>★ {formatCoachRating10(coach)} · {coach.clients} clients</BSEyebrow>
            </div>
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK70, fontWeight: 600 }}>
              {coach.cred} · {coach.loc}
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {getCoachCertifications(coach).map(cert => (
                <span key={cert} style={{ borderRadius: t.RADIUS_SM,
                  fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
                  padding: '3px 6px', background: t.INK, color: t.PAPER, fontWeight: 700,
                }}>{cert}</span>
              ))}
            </div>
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 4 }}>
              {coach.spec.map(s => (
                <span key={s} style={{ borderRadius: t.RADIUS_SM,
                  fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase',
                  padding: '3px 6px', border: `1px solid ${t.RULE}`, color: t.INK70, fontWeight: 600,
                }}>{s}</span>
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderRadius: t.RADIUS_SM,
          marginTop: 14, padding: 14, background: t.PAPER2, border: `1px solid ${t.RULE}`,
          fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.45, color: t.INK, letterSpacing: '-0.005em',
        }}>"{coach.bio}"</div>

        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button style={{ borderRadius: t.RADIUS_SM,
            flex: 1, padding: '14px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Book — ${coach.rate}</button>
          <button style={{ borderRadius: t.RADIUS_SM,
            padding: '14px 16px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Message</button>
        </div>
      </div>

      {/* Tab strip */}
      <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderBottom: `1px solid ${t.RULE}` }}>
        {['about', 'sessions', 'reviews'].map(k => {
          const on = tab === k;
          return (
            <button key={k} onClick={() => setTab(k)} style={{ borderRadius: t.RADIUS_SM,
              padding: '12px 0', cursor: 'pointer', background: 'transparent', border: 0,
              borderBottom: `2px solid ${on ? t.INK : 'transparent'}`,
              color: on ? t.INK : t.INK50,
              fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
            }}>{k}</button>
          );
        })}
      </div>

      {/* Tab content */}
      {tab === 'about' && (
        <>
          <BSSection title="Method" meta="How they work" />
          <div style={{ padding: `0 ${t.padX}px 14px` }}>
            <div style={{ borderTop: `2px solid ${t.INK}` }} />
            {[
              { k: '01', t: 'Intake', d: 'Movement screen + 3-yr training history. Free 15-min call.' },
              { k: '02', t: 'Block design', d: '4-6 wk blocks. RPE-driven. Tempo on every primary lift.' },
              { k: '03', t: 'Weekly check-in', d: 'Async on Sunday. Live 30-min on Wed.' },
              { k: '04', t: 'Re-test', d: 'Movement + load tests every 8 weeks. Adjustable.' },
            ].map((r, i, arr) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '32px 1fr', alignItems: 'flex-start', padding: '14px 0',
                borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', color: t.INK50, fontWeight: 700 }}>{r.k}</span>
                <div>
                  <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 17, color: t.INK, letterSpacing: '-0.02em' }}>{r.t}</div>
                  <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.4 }}>{r.d}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'sessions' && (
        <>
          <BSSection title="Sessions" meta="Pick a format" />
          <div style={{ padding: `0 ${t.padX}px 14px` }}>
            <div style={{ borderTop: `2px solid ${t.INK}` }} />
            {[
              { name: 'Free intro call', dur: '15 min · video', price: 'FREE',  next: 'Today 4 PM' },
              { name: 'Strategy session', dur: '45 min · video', price: '$120', next: 'Wed 9 AM' },
              { name: '1:1 coaching session', dur: `${coach.sessions}`, price: `$${coach.rate}`, next: 'Thu 6 PM' },
              { name: '4-week block', dur: 'Plan + 4 sessions', price: `$${coach.rate * 4 - 80}`, next: 'Starts Mon' },
            ].map((s, i, arr) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center', padding: '14px 0',
                borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              }}>
                <div>
                  <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 16, color: t.INK, letterSpacing: '-0.02em' }}>{s.name}</div>
                  <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{s.dur} · NEXT {s.next}</div>
                </div>
                <button style={{ borderRadius: t.RADIUS_SM,
                  padding: '10px 12px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
                }}>{s.price}</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === 'reviews' && (
        <>
          <BSSection title="Reviews" meta={`${coach.clients} clients · ★ ${formatCoachRating10(coach)}`} />
          <div style={{ padding: `0 ${t.padX}px 14px` }}>
            <div style={{ borderTop: `2px solid ${t.INK}` }} />
            {[
              { who: 'Aria K.',     dur: '14 mo client', q: 'The tempo focus is the difference. I added 22 lb to my front squat in a block I thought I was going to deload through.' },
              { who: 'Devon M.',    dur: '8 mo client',  q: 'No fluff, no gimmicks. Programming is genuinely thoughtful and the weekly check-ins are short but always actionable.' },
              { who: 'Renata S.',   dur: '6 mo client',  q: 'I came in postpartum, scared to lift heavy. Six months later I deadlifted 2× bodyweight. Patient, kind, smart.' },
            ].map((r, i, arr) => (
              <div key={i} style={{ padding: '14px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
                  <span>10/10 stars · {r.who}</span><span>{r.dur}</span>
                </div>
                <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, lineHeight: 1.45, letterSpacing: '-0.005em' }}>"{r.q}"</div>
              </div>
            ))}
          </div>
        </>
      )}

      <BSFooter right={`Profile · ${coach.id.toUpperCase()}`} />
    </BSPage>
  );
}

// Expose
Object.assign(window, { BSMarketplaceScreen, BSCoachDetail: BSCoachDetailPublic, BSCoachDetailPublic, BSHeadshot });
