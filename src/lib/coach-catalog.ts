// Coach catalog + ranking — the data Nora (the support assistant) uses to make
// concrete coach recommendations.
//
// This MIRRORS the hardcoded `COACHES_FULL` list rendered by the live website
// Marketplace (`public/newdesign/marketplace.jsx`) so that every coach Nora
// names links to a real detail page (`TrainerPublic.html?coach=<slug>` /
// `NutritionistPublic.html?coach=<slug>`). `coachSlug()` reproduces the exact
// slug the marketplace uses. Keep the two lists in sync when coaches change.
//
// `rankCoaches()` does a lightweight keyword/score match against the caller's
// free-text focus (a goal, specialty, city, or format), so Nora can answer
// "find me a strength coach in Brooklyn" with specific people, not platitudes.

export type CoachRole = 'trainer' | 'nutritionist';

export type Coach = {
  name: string;
  tag: 'Trainer' | 'Nutritionist';
  role: string; // headline / specialty line
  city: string; // '' when the listing states none
  rate: number | null; // $/session (nutritionists: per plan); null when the listing states none
  rating: number | null; // null = no rating on record — never a default
  sessions: number | null;
  specialties: string[];
  cert: string; // '' when the listing states none
  years: number | null;
  format: 'In-person' | 'Hybrid' | 'Remote' | '';
  category: string;
  // A LIVE marketplace row (the trainers / nutritionists table) carries the
  // provider id the app opens its Listing by, plus the two flags a member
  // would want to hear. A catalog entry below is an EXAMPLE listing — the
  // demo directory the website's marketplace shows after the real coaches.
  providerId?: number;
  verified?: boolean;
  atCapacity?: boolean;
  example?: boolean;
};

// The columns of a trainers / nutritionists row this module reads (public-read
// tables; a row is untrusted data and every field is normalized).
export type LiveCoachRow = {
  id?: unknown; name?: unknown; specialty?: unknown; specialty_type?: unknown; category?: unknown;
  credential?: unknown; experience?: unknown; price?: unknown; session_price?: unknown; meal_plan_price?: unknown;
  rating?: unknown; subscribers?: unknown; tags?: unknown; services?: unknown; verified?: unknown; at_capacity?: unknown;
  location?: unknown; format?: unknown; owner_id?: unknown;
};

const text = (v: unknown, max = 80): string => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');
const numOrNull = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const strList = (v: unknown, max = 6): string[] => (Array.isArray(v) ? v.map((x) => text(x, 40)).filter(Boolean).slice(0, max) : []);

/**
 * A live marketplace row as a Coach — the same reading the website's
 * marketplace makes of the row (mapLiveCoach), minus its cosmetic defaults: a
 * missing rating is null, not 4.8; a missing rate is null, not $100; unknown
 * years are null, not 5. Nora quotes only what the listing states. Returns
 * null for a row with no usable id or name.
 */
export function liveCoachFromRow(row: LiveCoachRow, role: CoachRole): Coach | null {
  if (!row || typeof row !== 'object') return null;
  const id = Number(row.id);
  const name = text(row.name, 80);
  if (!Number.isInteger(id) || id <= 0 || !name) return null;
  const nutri = role === 'nutritionist';
  const rate = numOrNull(nutri ? (row.meal_plan_price ?? row.price) : (row.session_price ?? row.price));
  const yearsMatch = text(row.experience, 20).match(/\d+/);
  const subs = numOrNull(row.subscribers);
  const fmtRaw = text(row.format, 40).toLowerCase();
  const format: Coach['format'] = /hybrid/.test(fmtRaw) ? 'Hybrid' : /remote|online|virtual/.test(fmtRaw) ? 'Remote' : /person|studio|gym/.test(fmtRaw) ? 'In-person' : '';
  const specialties = [...strList(row.tags), ...(nutri ? strList(row.services) : [])].slice(0, 4);
  return {
    name,
    tag: nutri ? 'Nutritionist' : 'Trainer',
    role: text(row.specialty, 80) || text(row.specialty_type, 80) || (nutri ? 'Nutrition coaching' : 'Personal training'),
    city: text(row.location, 60),
    rate: rate != null && rate > 0 ? Math.round(rate) : null,
    rating: (() => { const r = numOrNull(row.rating); return r != null && r > 0 ? r : null; })(),
    sessions: subs != null && subs > 0 ? Math.round(subs) : null,
    specialties,
    cert: text(row.credential, 60),
    years: yearsMatch ? Number(yearsMatch[0]) : null,
    format,
    category: text(row.category, 60),
    providerId: id,
    verified: row.verified === true,
    atCapacity: row.at_capacity === true,
  };
}

/**
 * The pool Nora ranks over: the live coaches first, then the example
 * directory minus any name a real listing already covers — the website
 * marketplace's own merge (Grid's `merged`). Each example is marked, so a
 * reply can say what it is recommending.
 */
export function mergeCoachPools(live: Coach[], examples: readonly Coach[] = COACH_CATALOG): Coach[] {
  const liveNames = new Set(live.map((c) => c.name.toLowerCase()));
  return [...live, ...examples.filter((c) => !liveNames.has(c.name.toLowerCase())).map((c) => ({ ...c, example: true }))];
}

export const COACH_CATALOG: Coach[] = [
  // Trainers
  { name: 'Maya Okafor', role: 'Strength & Hypertrophy', city: 'Brooklyn, NY', rate: 120, rating: 4.97, sessions: 1284, tag: 'Trainer', specialties: ['Strength', 'Hypertrophy'], cert: 'NASM-CPT', years: 9, format: 'In-person', category: 'Strength & Resistance' },
  { name: 'Leo Martins', role: 'Powerlifting', city: 'Lisbon', rate: 105, rating: 4.86, sessions: 1120, tag: 'Trainer', specialties: ['Powerlifting', 'Strength'], cert: 'NSCA-CSCS', years: 8, format: 'In-person', category: 'Strength & Resistance' },
  { name: 'Anya Volkov', role: 'Barbell Foundations', city: 'Berlin', rate: 98, rating: 4.91, sessions: 680, tag: 'Trainer', specialties: ['Strength', 'Technique'], cert: 'NSCA-CSCS', years: 6, format: 'Hybrid', category: 'Strength & Resistance' },
  { name: 'Diego Alvarez', role: 'Endurance · Marathon', city: 'Austin, TX', rate: 95, rating: 4.92, sessions: 912, tag: 'Trainer', specialties: ['Running', 'VO2'], cert: 'ACE-CPT', years: 7, format: 'Hybrid', category: 'Cardio & Endurance' },
  { name: 'Kenji Watanabe', role: 'Triathlon Coaching', city: 'San Francisco', rate: 150, rating: 4.91, sessions: 590, tag: 'Trainer', specialties: ['Triathlon', 'Swimming'], cert: 'USAT-L2', years: 14, format: 'Hybrid', category: 'Cardio & Endurance' },
  { name: 'Hana Reyes', role: 'Cycling & VO2', city: 'Girona', rate: 110, rating: 4.88, sessions: 720, tag: 'Trainer', specialties: ['Cycling', 'Endurance'], cert: 'USA-C-L2', years: 9, format: 'Remote', category: 'Cardio & Endurance' },
  { name: 'Jordan Park', role: 'Mobility · PT Recovery', city: 'Los Angeles', rate: 110, rating: 4.89, sessions: 1510, tag: 'Trainer', specialties: ['Mobility', 'Post-op'], cert: 'NSCA-CSCS', years: 8, format: 'In-person', category: 'Mobility, Recovery & Rehab' },
  { name: 'Priya Natarajan', role: 'Yoga & Mobility', city: 'Brooklyn, NY', rate: 90, rating: 4.93, sessions: 1680, tag: 'Trainer', specialties: ['Yoga', 'Breath'], cert: 'RYT-500', years: 9, format: 'In-person', category: 'Mobility, Recovery & Rehab' },
  { name: 'Sam Oduya', role: 'Rehab & Return-to-Sport', city: 'Atlanta', rate: 125, rating: 4.94, sessions: 540, tag: 'Trainer', specialties: ['Rehab', 'PT'], cert: 'DPT · CSCS', years: 11, format: 'In-person', category: 'Mobility, Recovery & Rehab' },
  { name: 'Tomás Reyes', role: 'CrossFit · Olympic Lifts', city: 'Miami', rate: 130, rating: 4.88, sessions: 2010, tag: 'Trainer', specialties: ['CrossFit', 'Olympic'], cert: 'CF-L3', years: 12, format: 'In-person', category: 'Functional & Hybrid' },
  { name: 'Isla Park', role: 'Hybrid Athlete', city: 'Austin, TX', rate: 115, rating: 4.90, sessions: 640, tag: 'Trainer', specialties: ['Hybrid', 'Hyrox'], cert: 'NSCA-CSCS', years: 7, format: 'Hybrid', category: 'Functional & Hybrid' },
  { name: 'Marcus Hale', role: 'Classic Bodybuilding', city: 'Las Vegas', rate: 140, rating: 4.87, sessions: 980, tag: 'Trainer', specialties: ['Hypertrophy', 'Prep'], cert: 'NASM · PN-1', years: 13, format: 'In-person', category: 'Bodybuilding' },
  { name: 'Yuki Tanaka', role: 'Physique & Posing', city: 'Tokyo', rate: 125, rating: 4.92, sessions: 460, tag: 'Trainer', specialties: ['Physique', 'Cutting'], cert: 'IFBB-PT', years: 10, format: 'Remote', category: 'Bodybuilding' },
  { name: 'Malik Freeman', role: 'HIIT Athletic Performance', city: 'Chicago', rate: 135, rating: 4.90, sessions: 770, tag: 'Trainer', specialties: ['HIIT', 'Plyo'], cert: 'NSCA-CSCS', years: 11, format: 'In-person', category: 'HIIT' },
  { name: 'Zoë Carter', role: 'Metabolic Conditioning', city: 'Denver', rate: 95, rating: 4.89, sessions: 820, tag: 'Trainer', specialties: ['HIIT', 'MetCon'], cert: 'NASM-CPT', years: 6, format: 'Hybrid', category: 'HIIT' },
  { name: 'Priscilla Adams', role: 'Fat-loss & Nutrition-tied', city: 'Miami', rate: 100, rating: 4.85, sessions: 1240, tag: 'Trainer', specialties: ['Fat loss', 'Conditioning'], cert: 'NASM · PN-1', years: 8, format: 'Remote', category: 'Fat Burn' },
  { name: 'Omar Haddad', role: 'Lean & Cut Programs', city: 'Dubai', rate: 120, rating: 4.91, sessions: 560, tag: 'Trainer', specialties: ['Fat loss', 'Cutting'], cert: 'NASM-CPT', years: 9, format: 'Hybrid', category: 'Fat Burn' },
  { name: 'Amara Johnson', role: 'At-home Full Body', city: 'Denver', rate: 85, rating: 4.94, sessions: 840, tag: 'Trainer', specialties: ['At-home', 'Prenatal'], cert: 'NASM · PPES', years: 10, format: 'Remote', category: 'At Home' },
  { name: 'Rhea Kapoor', role: 'Minimal-Equipment Strength', city: 'Mumbai', rate: 70, rating: 4.88, sessions: 910, tag: 'Trainer', specialties: ['At-home', 'Bands'], cert: 'NASM-CPT', years: 5, format: 'Remote', category: 'At Home' },
  { name: 'Nora Kessler', role: "Women's Strength & Cycle-Synced", city: 'Berlin', rate: 115, rating: 4.94, sessions: 720, tag: 'Trainer', specialties: ['Women-only', 'Hormonal'], cert: 'NSCA-CSCS · PN-2', years: 10, format: 'Hybrid', category: 'Just for Women' },
  { name: 'Amelia Finch', role: 'Postpartum & Core Rebuild', city: 'Portland, OR', rate: 105, rating: 4.96, sessions: 540, tag: 'Trainer', specialties: ['Postpartum', 'Pelvic floor'], cert: 'NASM · PCES', years: 8, format: 'In-person', category: 'Just for Women' },
  { name: 'Sana Khoury', role: 'Women-only Strength Studio', city: 'Toronto', rate: 95, rating: 4.90, sessions: 880, tag: 'Trainer', specialties: ['Strength', 'Beginner-friendly'], cert: 'NASM-CPT', years: 6, format: 'In-person', category: 'Just for Women' },
  { name: 'Cal Redmond', role: '5K to Marathon Coaching', city: 'Boulder, CO', rate: 90, rating: 4.96, sessions: 1040, tag: 'Trainer', specialties: ['Marathon', 'Tempo'], cert: 'RRCA · UESCA', years: 11, format: 'Remote', category: 'Pure Running' },
  { name: 'Fiona Walsh', role: 'Trail & Ultra Running', city: 'Chamonix', rate: 120, rating: 4.93, sessions: 410, tag: 'Trainer', specialties: ['Trail', 'Ultra'], cert: 'UESCA-UEC', years: 9, format: 'Hybrid', category: 'Pure Running' },
  { name: 'Jamal Brooks', role: 'Track & Speed Work', city: 'Eugene, OR', rate: 105, rating: 4.91, sessions: 620, tag: 'Trainer', specialties: ['Track', 'Speed'], cert: 'USATF-L2', years: 12, format: 'In-person', category: 'Pure Running' },
  { name: 'Dax Whitaker', role: 'Hyrox Elite & Mixed Ergs', city: 'London', rate: 125, rating: 4.94, sessions: 680, tag: 'Trainer', specialties: ['Hyrox', 'SkiErg'], cert: 'NSCA-CSCS · Hyrox-CT', years: 9, format: 'Hybrid', category: 'Hyrox' },
  { name: 'Greta Lindqvist', role: 'Hyrox Pro Doubles', city: 'Stockholm', rate: 115, rating: 4.92, sessions: 520, tag: 'Trainer', specialties: ['Hyrox', 'Doubles'], cert: 'Hyrox-CT · NASM', years: 7, format: 'In-person', category: 'Hyrox' },
  { name: 'Rafa Moreno', role: 'Hyrox Strength & Run Carry-over', city: 'Madrid', rate: 105, rating: 4.89, sessions: 440, tag: 'Trainer', specialties: ['Hyrox', 'Conditioning'], cert: 'Hyrox-CT', years: 6, format: 'In-person', category: 'Hyrox' },
  // Nutritionists
  { name: 'Rae Lindqvist', role: 'Sports Performance & Hydration', city: 'Stockholm', rate: 140, rating: 5.0, sessions: 640, tag: 'Nutritionist', specialties: ['Hydration', 'Metabolic'], cert: 'RD · RDN', years: 11, format: 'Remote', category: 'Sports Performance & Hydration' },
  { name: 'Claire Donovan', role: 'Performance Nutrition', city: 'London', rate: 130, rating: 4.93, sessions: 520, tag: 'Nutritionist', specialties: ['Athlete fueling'], cert: 'AfN-RNutr', years: 9, format: 'Remote', category: 'Performance Nutrition' },
  { name: 'Sofia Marchetti', role: 'Clinical Nutrition', city: 'London', rate: 160, rating: 4.98, sessions: 420, tag: 'Nutritionist', specialties: ['Auto-immune', 'Gut'], cert: 'AfN-RNutr', years: 13, format: 'Remote', category: 'Medical & Condition-Specific' },
  { name: 'David Mehta', role: 'Medical Nutrition Therapy', city: 'Toronto', rate: 150, rating: 4.95, sessions: 380, tag: 'Nutritionist', specialties: ['Diabetes', 'Cardiac'], cert: 'RD', years: 14, format: 'Remote', category: 'Medical & Condition-Specific' },
  { name: 'Ben Caldwell', role: 'Muscle Gain & Bulking', city: 'Sydney', rate: 110, rating: 4.87, sessions: 690, tag: 'Nutritionist', specialties: ['Bulking', 'Recomp'], cert: 'APD', years: 7, format: 'Remote', category: 'Muscle Gain / Bulking' },
  { name: 'Nadia Chen', role: 'Gut Health & Functional', city: 'Toronto', rate: 125, rating: 4.95, sessions: 730, tag: 'Nutritionist', specialties: ['GI health', 'Functional'], cert: 'RDN', years: 6, format: 'Remote', category: 'Gut Health & Functional Nutrition' },
  { name: 'Ingrid Olsen', role: 'Longevity & Healthspan', city: 'Copenhagen', rate: 145, rating: 4.96, sessions: 310, tag: 'Nutritionist', specialties: ['Longevity', 'Metabolic'], cert: 'RD', years: 12, format: 'Remote', category: 'Longevity & Healthspan' },
  { name: 'Ayo Adeyemi', role: 'Weight Management', city: 'Lagos', rate: 95, rating: 4.89, sessions: 820, tag: 'Nutritionist', specialties: ['Weight', 'Habits'], cert: 'RD', years: 8, format: 'Remote', category: 'Weight Mgmt' },
  { name: 'Liana Torres', role: 'Plant-based Nutrition', city: 'Madrid', rate: 105, rating: 4.92, sessions: 490, tag: 'Nutritionist', specialties: ['Plant-based', 'Athlete'], cert: 'RD', years: 7, format: 'Remote', category: 'Plant-Based' },
  { name: 'Hana Matsuda', role: 'Prenatal Nutrition', city: 'Osaka', rate: 120, rating: 4.94, sessions: 340, tag: 'Nutritionist', specialties: ['Prenatal', 'Postnatal'], cert: 'RD · CLC', years: 9, format: 'Remote', category: 'Prenatal' },
  { name: 'Marco Bellini', role: 'Meal Prep & Habits', city: 'Milan', rate: 90, rating: 4.88, sessions: 760, tag: 'Nutritionist', specialties: ['Meal prep', 'Habits'], cert: 'RD', years: 6, format: 'Remote', category: 'Meal Prep' },
];

// Reproduces the slug the marketplace uses for coach detail links.
export function coachSlug(name: string): string {
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

// Deep-link to the coach's public detail page on the website.
export function coachUrl(c: Coach): string {
  const page = c.tag === 'Nutritionist' ? 'NutritionistPublic.html' : 'TrainerPublic.html';
  return `/newdesign/${page}?coach=${coachSlug(c.name)}`;
}

// Where a coach's page is on the website. A LIVE listing renders the
// marketplace's own derived profile by name — the page every marketplace card
// links to (marketplace.jsx `coachUrl`); an EXAMPLE listing has a full static
// page resolved by slug over coachDirectory.js, which knows nothing of a live
// row, so pointing a live coach there lands on nobody.
export function coachProfileUrl(c: Coach): string {
  if (c.providerId != null) return `/newdesign/MemberProfile.html?name=${encodeURIComponent(c.name)}&role=${c.tag === 'Nutritionist' ? 'nutritionist' : 'trainer'}`;
  return coachUrl(c);
}

// The live-listing read Nora makes. ⚠ Every column named here exists on BOTH
// tables (checked against the live catalog, 2026-09-21 — neither table has a
// location or a format column, so liveCoachFromRow reads those as absent); a
// named column that does not exist errors the WHOLE query, which is why the
// role's own price column is added by livePriceColumn rather than listed.
export const LIVE_COACH_COLUMNS = 'id, name, specialty, specialty_type, category, credential, experience, price, rating, subscribers, tags, services, verified, at_capacity, owner_id';
export function livePriceColumn(role: CoachRole): 'session_price' | 'meal_plan_price' {
  return role === 'nutritionist' ? 'meal_plan_price' : 'session_price';
}
// Listings read per table — above today's whole directory (21 + 22 rows), so
// the cap bounds the prompt rather than the marketplace.
export const LIVE_COACH_CAP = 80;

// Light keyword scorer: matches the free-text focus against the coach's
// specialties, headline, category, city, and format. Returns the top `limit`
// ranked, optionally filtered to a single role. With no focus — or a focus with
// no searchable word left in it — it falls back to the highest-standing coaches
// in that role; a focus that names something nobody lists returns [].
export function rankCoaches(opts: {
  focus?: string;
  role?: CoachRole | 'any';
  limit?: number;
  // The listings to rank — the live marketplace rows merged with the examples
  // (mergeCoachPools) — defaulting to the example directory alone.
  pool?: readonly Coach[];
}): Coach[] {
  const limit = Math.max(1, Math.min(6, opts.limit || 3));
  const role = opts.role && opts.role !== 'any' ? opts.role : null;
  const pool = (opts.pool || COACH_CATALOG).filter((c) =>
    !role ? true : role === 'trainer' ? c.tag === 'Trainer' : c.tag === 'Nutritionist'
  );
  // Standing, independent of the question: a real listing before an example
  // one, a verified coach a touch ahead, a coach at capacity behind — still
  // listed (they may reopen) but never first. A rating counts only where the
  // listing HAS one; an unknown rating is neither a bonus nor a penalty.
  const standing = (c: Coach) => (c.example ? 0 : 1.5) + (c.verified ? 0.5 : 0) - (c.atCapacity ? 3 : 0) + (c.rating != null ? (c.rating - 4.8) * 2 : 0);

  const focus = String(opts.focus || '').toLowerCase().trim();
  if (!focus) {
    return [...pool].sort((a, b) => standing(b) - standing(a)).slice(0, limit);
  }

  // Tokenize the focus into words, dropping the words a member uses to ASK for
  // a coach rather than to describe one — "find me a good trainer near me"
  // names no specialty, so it is a NON-specific focus, ranked by standing.
  const stop = new Set([
    'a', 'an', 'the', 'for', 'and', 'with', 'in', 'to', 'my', 'me', 'i', 'want', 'need', 'looking', 'help', 'coach', 'trainer', 'nutritionist', 'find', 'someone', 'who', 'can',
    // the kind of coach, not a specialty
    'coaches', 'trainers', 'nutritionists', 'dietitian', 'dietician', 'nutrition', 'diet', 'fitness', 'gym', 'personal', 'general', 'training', 'train', 'workout', 'workouts', 'exercise', 'exercises', 'program', 'programs', 'plan', 'plans',
    // the asking
    'near', 'nearby', 'around', 'local', 'best', 'good', 'great', 'top', 'some', 'any', 'new', 'get', 'got', 'please', 'recommend', 'recommended', 'recommendation', 'recommendations', 'suggest', 'suggestion', 'suggestions',
    'match', 'matched', 'matching', 'switch', 'change', 'compare', 'like', 'would', 'could', 'should', 'you', 'your', 'have', 'has', 'are', 'that', 'this', 'there', 'here', 'what', 'which', 'about', 'from', 'one',
    'really', 'just', 'also', 'maybe', 'somebody', 'people', 'pro', 'pros', 'expert', 'experts', 'specialist', 'specialists',
  ]);
  const tokens = focus.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !stop.has(w));

  const scored = pool.map((c) => {
    const hay = [
      c.name,
      c.role,
      c.category,
      c.city,
      c.format,
      c.cert,
      ...c.specialties,
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    let score = 0;
    // Whole-phrase hit is worth a lot.
    if (focus.length > 3 && hay.includes(focus)) score += 6;
    for (const tok of tokens) {
      if (hay.includes(tok)) score += 2;
      // specialty-exact gives an extra bump
      if (c.specialties.some((s) => s.toLowerCase().includes(tok))) score += 2;
      if (c.category.toLowerCase().includes(tok)) score += 1;
      if (c.city.toLowerCase().includes(tok)) score += 1;
    }
    // The standing tie-breaker: real before example, verified ahead, at capacity behind.
    score += standing(c);
    return { c, score };
  });

  // A hit is a keyword match over and above the standing — the standing alone
  // must not turn an unrelated live coach into an answer to "marathon coach".
  const hits = scored.filter((s) => s.score - standing(s.c) > 0).sort((a, b) => b.score - a.score);
  // A focus that named something and matched nobody is an EMPTY answer, never
  // the top of the directory: "sprint coach" with no sprint coach listed must
  // not hand back the highest-standing strangers as if they fit (CodeRabbit,
  // the review of #2130). Only a focus with no searchable word left in it —
  // "find me a good trainer near me" — ranks by standing alone.
  const chosen = tokens.length ? hits.slice(0, limit) : scored.sort((a, b) => b.score - a.score).slice(0, limit);
  return chosen.map((s) => s.c);
}
