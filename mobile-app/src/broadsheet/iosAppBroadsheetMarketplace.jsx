import React from 'react';
import { createMobileVideoComponents } from '../services/videoComponents.mjs';
const { ShapeVideoPlayer } = createMobileVideoComponents(React);
import { createPortal } from 'react-dom';
// iosAppBroadsheetMarketplace.jsx — Coach marketplace in the Broadsheet visual language.
// "The Personals" / classifieds-meets-features. Browse trainers + nutritionists.
//
// Provides:
//   • BSMarketplaceScreen — the member's Coaches tab (owner, 2026-11-09: a sixth tab between Eat and
//     Chat, "place-1", in the "Browse list" look, "look-B"): Your team first, then the directory's
//     state and rules (search, role, filters, sort, the live or example coaches, the deep link, the
//     plans rail), drawn by BSMarketDirectory.jsx, and the coach it opens.
//   • BSCoachDetail        — opened when a coach card is tapped (sheet-style).

const { useState: useStateBSM2, useMemo: useMemoBSM2, useEffect: useEffectBSM2 } = React;
const { BSPage, BSPageHeader, BSAvatar, BSEyebrow, BSSection, BSSlab, BSCell, BSTag, BSRow, BSFooter, BSHalftone, useBS } = window;
// The masthead's top inset — the chrome owns it (window-exported). The local
// fallback mirrors the chrome's expression exactly so a load-order slip degrades
// to the same geometry instead of silently reverting to a notch-blind flat 44.
const BS_MAST_TOP_CSS = (typeof window !== 'undefined' && window.BS_MAST_TOP_CSS) || 'max(44px, calc(env(safe-area-inset-top, 0px) + 12px), var(--bs-notch-floor, 0px))';

import { bsProjectAvailability, bsSlotsByDay, bsIsZone } from '../services/coachAvailability.mjs';
import { viewerZone, partsInZone, dayKey, formatTime, formatDate } from '../services/shapeZone.mjs';
// The member's coaches, off the plan read, as Home's Team reads them (the Coaches tab's Your team).
import { bsHomeCoachesOf } from '../services/homeWeek.mjs';
import { bsPlanPreview } from '../services/planPreview.mjs';
import { bsNormalizeListingMedia } from '../services/listingMedia.mjs';
// The directory ("Find your coach.") draws in its own module; this one keeps every rule it reads.
import { BSMarketDirectory } from './BSMarketDirectory.jsx';
import { bsDialogRef } from '../services/dialogBack.mjs';
import { bsUserGoalsRevHook } from '../services/userGoalsRefresh.mjs';
// A coach's look is in their profile_custom: read the cards again when that kind is announced (a return to
// the app after an edit on the website, or a save here; Codex on #2708).
const useBSUserGoalsRev = bsUserGoalsRevHook(React);
const BSM2_LOOK_KINDS = ['profile_custom'];
import { bsCoachCardLook } from '../services/coachCardLook.mjs';
import { bsCompareToggle, bsCompareMeets, BS_COMPARE_MAX } from '../services/coachCompare.mjs';

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
// ── THE COACHES TAB'S FILTERS AND SORTS (owner, 2026-11-09; the website's, public/newdesign/marketplace.jsx) ──
// The goals a member trains for, each found in a coach's own words (their category, specialties and
// tags) by the website's patterns (MK_GOALS / MK_GOAL_RX there), so the two surfaces file a coach under
// the same goals. Every goal is here (owner, of the website's matcher: "make sure all goals are here
// and this actually works"): the six `card` goals always show in the sheet, the rest once a coach of
// the role is filed under one. `nu` goals are a nutritionist's only, `tr` goals a trainer's only; a
// coach none of them matches is General fitness.
const BSM_GOALS = [
  { id: 'strength', card: true }, { id: 'fatloss', card: true }, { id: 'endurance', card: true },
  { id: 'mobility', card: true }, { id: 'nutrition', card: true, nu: true }, { id: 'general', card: true },
  { id: 'running', tr: true }, { id: 'hyrox', tr: true }, { id: 'hiit', tr: true }, { id: 'bodybuilding', tr: true },
  { id: 'functional', tr: true }, { id: 'home', tr: true }, { id: 'women', tr: true },
  { id: 'weight', nu: true }, { id: 'muscle', nu: true }, { id: 'gut', nu: true }, { id: 'plant', nu: true },
  { id: 'prenatal', nu: true }, { id: 'mealprep', nu: true }, { id: 'medical', nu: true }, { id: 'longevity', nu: true },
];
const BSM_GOAL_RX = {
  strength: /strength|hypertroph|powerlift|bodybuild|barbell|olympic|weightlift|kettlebell|calisthen|physique|muscle|bulk|recomp|crossfit/i,
  fatloss: /fat|weight ?(loss|mgmt|management)|weightloss|lean|\bcut|hiit|metcon|keto|fasting|low-carb|conditioning/i,
  endurance: /endur|cardio|\brun|running|marathon|triathlon|cycling|vo2|hyrox|trail|ultra|track|obstacle|swim|5k|tempo|erg/i,
  mobility: /mobil|rehab|recover|yoga|pilates|post-op|physio|physical therap|senior|balance|posture|pelvic|postpartum|breath|flexib|return/i,
  nutrition: /sport|performance|athlete|hydration|fuel|supplement|contest/i,
  general: /home|functional|family|general|habit|meal prep|dance|boxing|combat|beginner|women|prenatal|wellness|longevity|healthspan|plant|gut|clinical|medical|cultural|budget|vegan|full body|fullbody|kids/i,
  running: /\brun\b|running|runner|marathon|\b5k\b|\b10k\b|trail|ultra|track/i,
  hyrox: /hyrox/i,
  hiit: /hiit|metcon|interval|tabata/i,
  bodybuilding: /bodybuild|physique|hypertroph/i,
  functional: /functional|hybrid|crossfit|calisthen/i,
  home: /at home|\bhome\b|no equipment/i,
  women: /women|female|postpartum|pelvic/i,
  weight: /weight|fat loss|\blean/i,
  muscle: /muscle|bulk|mass gain/i,
  gut: /\bgut\b|\bibs\b|digest|microbiome|functional nutrition/i,
  plant: /plant|vegan|vegetarian/i,
  prenatal: /prenatal|postnatal|pregnan|fertility/i,
  mealprep: /meal prep|batch cook/i,
  medical: /medical|clinical|condition|diabet|pcos|renal|cardiac|kidney/i,
  longevity: /longevity|healthspan|\bag(e|)ing\b/i,
};
// Whether a role's coaches can be filed under a goal ('Both' holds every goal).
const bsmGoalFits = (g, role) => !((g.nu && role === 'Trainers') || (g.tr && role === 'Nutritionists'));
// The sorts, in the picker's order. Best match is the goal's fit, then an open intro, then the rating;
// nothing paid ranks a coach higher.
const BSM_SORTS = ['best', 'rated', 'price', 'years'];
// What the filters start as: Both roles, no goal, anywhere, any budget, either way of meeting.
const BSM_FILTERS0 = { goals: [], city: 'Anywhere', maxSession: null, maxMonth: null, meet: 'either', openWeek: false };
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

// ⚠ A LIVE COACH'S RATING IS ITS REVIEWS, OR NOTHING. Owner, 2026-10-12: "the demo
// ratings are fine, but make sure the review system and star rating system is in
// place for live accounts. 1-10 stars". A row with a coach account behind it
// (`ratingLive`) carries the average of its real 1–10 reviews, already on the
// ten-point scale, so it is NEVER doubled — a 4.5/10 would have read 9.0 — and a
// coach nobody has reviewed is null, which renders "New", never the old
// `row.rating || 4.8` column fallback (9.6/10 on every new coach). Demo and seeded
// rows keep their authored five-point numbers, doubled as before.
function getCoachRating10(coachOrRating) {
  if (coachOrRating && typeof coachOrRating === 'object' && coachOrRating.ratingLive) {
    const live = coachOrRating.rating;
    return live == null || !Number.isFinite(Number(live)) ? null : Math.max(1, Math.min(10, Number(live)));
  }
  const raw = typeof coachOrRating === 'number' ? coachOrRating : Number(coachOrRating && coachOrRating.rating);
  if (!Number.isFinite(raw)) return 0;
  const tenPoint = raw <= 5 ? raw * 2 : raw;
  return Math.max(1, Math.min(10, tenPoint));
}

// "★ 9.2/10", or "New" for a live coach with no reviews yet.
function formatCoachRating10(coachOrRating, tr) {
  const r = getCoachRating10(coachOrRating);
  if (r == null) return tr ? tr('marketplace:rating.new', { defaultValue: 'New' }) : 'New';
  return `★ ${r.toFixed(1)}/10`;
}
// The person the coach profile opens on, from a marketplace coach (owner, 2026-10-28: trainers;
// nutritionists since they got the profile too). The profile reads the coach's listing fresh, by
// the account (userId) or, with no account, by the listing's own id (providerId), and draws a
// sample from `specialty` and `rating10`.
function bsmCoachPerson(c, photo = null, nutri = false) {
  return {
    // No place is claimed for a listing that states none (it used to read Remote).
    who: c.name, kind: nutri ? 'NUTRI' : 'TRAINER', userId: c.provider_user_id || null, providerId: c.provider_id || null,
    city: c.loc || c.city || '', bio: c.bio || '', init: c.init || (c.name ? c.name[0] : '?'),
    // The standing the cards print (from the coach's Shape Score), and the category they file under.
    photo: photo || null, tier: c.tier || mktCoachTier(c).name || null, category: c.category || '',
    specialty: [c.category, ...(Array.isArray(c.spec) ? c.spec : [])].filter(Boolean).join(' '),
    rating10: getCoachRating10(c),
  };
}

// The number the sorts rank by: a coach with no reviews ranks below every rated one.
function bsmRankRating(c) {
  const r = getCoachRating10(c);
  return r == null ? 0 : r / 2;
}

// A listing's years, or null when it states none (it used to read 1, a year nobody claimed).
function parseProviderYears(value) {
  const parsed = Number(String(value || '').match(/\d+/)?.[0] || 0);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
// The categories a listing is filed under, each role's: bsmFilterCategory's table below
// (BSM_CAT_KEYWORDS) names exactly these. The website's goal matcher reads this list to prove every
// category has a goal of its own (tests/marketplace-page.test.mjs), and tests/app-coaches-tab.test.mjs
// holds it equal to the table.
const BSM_MARKETPLACE_CATEGORIES = {
  Trainer: ['Strength & Resistance', 'Cardio & Endurance', 'Pure Running', 'Hyrox', 'Mobility, Recovery & Rehab', 'Functional & Hybrid', 'Bodybuilding', 'HIIT', 'Fat Burn', 'At Home', 'Just for Women'],
  Nutritionist: ['Sports Performance & Hydration', 'Performance Nutrition', 'Medical & Condition-Specific', 'Muscle Gain / Bulking', 'Gut Health & Functional Nutrition', 'Longevity & Healthspan', 'Weight Mgmt', 'Plant-Based', 'Prenatal', 'Meal Prep'],
};
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
// ⚠ A LISTING SAYS ONLY WHAT IT STATES (the website's honesty rules, marketplace.jsx's head, brought to the
// app on 2026-11-09). The row read here used to print three things nobody stated: a 9.6/10 rating from
// the `rating || 4.8` fallback on every seeded listing, a session count and a match percentage made up
// from the years, and "Remote" for every live coach (the read selects no location or format). Now:
//   · every listing is rated by its reviews (`ratingLive`), merged in after the read, or reads New;
//   · no session count, no match; clients only for a listing with an account (a seeded listing's
//     subscriber count is not a count of anyone); years only when the listing states them;
//   · no place and no format, so no city or way of meeting is claimed for it;
//   · the price the directory prints is the one the listing names, with its unit: a trainer's session
//     price per session, else the monthly price per month (every nutritionist). `rate` stays the
//     one-time price THE LISTING's "Book now" charges, as before.
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
  const rate = Number(basePrice) > 0 ? Math.round(Number(basePrice)) : null;
  const session = !isNutritionist ? Number(row.session_price) : NaN;
  const monthly = Number(row.price);
  const pricePer = session > 0 ? 'session' : (monthly > 0 ? 'month' : null);
  const priceAmount = pricePer === 'session' ? Math.round(session) : (pricePer === 'month' ? Math.round(monthly) : null);
  const subscribers = Number(row.subscribers || 0);
  const dbId = Number(row.id);

  return {
    id: `${isNutritionist ? 'n' : 't'}${dbId}`,
    db_id: dbId,
    provider_id: dbId,
    provider_user_id: row.owner_id || null,
    provider_role: isNutritionist ? 'nutritionist' : 'trainer',
    name: row.name || (isNutritionist ? 'Shape Nutritionist' : 'Shape Trainer'),
    loc: null,
    specialty: specialty || '',
    category: bsmFilterCategory(role, [specialty, formatProviderCategory(row.category), ...specs].filter(Boolean).join(' '), isNutritionist ? 'Performance Nutrition' : 'Strength & Resistance'),
    format: null,
    cred: row.credential ? (row.experience ? `${row.credential} - ${row.experience}` : String(row.credential)) : '',
    certifications: row.credential ? [row.credential] : [],
    spec: specs.length ? specs.slice(0, 5) : [specialty || (isNutritionist ? 'Nutrition' : 'Training')],
    rate,
    priceAmount,
    pricePer,
    sessions: isNutritionist ? '30-min - 1:1' : '45-min - 1:1',
    years,
    // Rated by its reviews (bsmMergeReviewSummaries); a listing with no account has none.
    rating: null,
    ratingLive: true,
    reviewCount: 0,
    clients: row.owner_id ? subscribers : 0,
    init: providerInitials(row.name),
    bio: row.bio || '',
    tag: row.featured || row.trainer_of_month || row.nutritionist_of_month ? 'FEATURED' : undefined,
    stripe_product_id: row.stripe_product_id,
    stripe_price_id: row.stripe_price_id,
    // stripe_account_id is not read: a visitor cannot select it since the 2026-10-10 migration
    // (L16), and nothing on the card used it.
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

  // L16 (2026-10-08 review): a visitor's read of the coach tables is column-level since the
  // 2026-10-10 migration (every column but stripe_account_id), and a `*` read fails the whole row
  // once one column is out of reach. The lists are the migration's grant lists, in its order;
  // tests/security-review-lows.test.mjs holds them equal. Discoverable listings only: a real
  // coach is listed once the listing has a price, active payouts and a photo
  // (2026-10-12-coach-listing-ready.sql); Shape's own listings always are.
  const [trainerResult, nutritionistResult] = await Promise.all([
    client.from('trainers').select('id, name, specialty, category, price, rating, subscribers, experience, credential, credential_full, specialty_type, bio, color, tags, trainer_of_month, totm_quote, featured, sort_order, created_at, updated_at, stripe_product_id, stripe_price_id, owner_id, stripe_account_status, session_price, at_capacity, capacity_resume_at, verified, verified_at, monthly_offer, listing_media, timezone').eq('listing_ready', true).order('id', { ascending: true }),
    client.from('nutritionists').select('id, name, specialty, category, price, rating, subscribers, experience, credential, credential_full, specialty_type, bio, color, tags, services, nutritionist_of_month, notm_quote, featured, sort_order, created_at, updated_at, stripe_product_id, stripe_price_id, owner_id, stripe_account_status, meal_plan_price, at_capacity, capacity_resume_at, verified, verified_at, monthly_offer, listing_media, timezone').eq('listing_ready', true).order('id', { ascending: true }),
  ]);

  if (trainerResult.error) throw trainerResult.error;
  if (nutritionistResult.error) throw nutritionistResult.error;

  const out = {
    Trainer: (trainerResult.data || []).map(row => mapSupabaseProvider(row, 'Trainer')),
    Nutritionist: (nutritionistResult.data || []).map(row => mapSupabaseProvider(row, 'Nutritionist')),
  };
  const summaries = await (window.ShapeCoachReviews?.summaries?.() || Promise.resolve(null)).catch(() => null);
  bsmMergeReviewSummaries([...out.Trainer, ...out.Nutritionist], summaries);
  return out;
}

// Each live coach's rating and count from its REAL reviews, by the coach's account
// (a slug is a name, and the listing and profile names can differ). No summary for
// the account = no reviews = rating null, which the cards print as "New".
function bsmMergeReviewSummaries(coaches, summaries) {
  const owners = (summaries && summaries.owners) || {};
  for (const c of coaches) {
    if (!c || !c.ratingLive) continue;
    const s = c.provider_user_id ? owners[c.provider_user_id] : null;
    c.rating = s && Number(s.count) > 0 ? Number(s.avg) : null;
    c.reviewCount = s ? Number(s.count) || 0 : 0;
  }
  return coaches;
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
    // Only what the member sent. This used to open with a reply in the coach's name ("Thanks for
    // reaching out. I will reply here.") that the coach never wrote (client-onboarding review, H6).
    messages: [
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
// size, no deviation"). The search circle + the settings gear, both
// sized by BS_HEADER_AVATAR and spaced by BS_CORNER_GAP, in ONE place so the
// three marketplace pages — the directory, THE LISTING, and the availability
// calendar — cannot drift. Both constants are READ, never re-typed: the chrome
// owns the values and the `|| 34` / `|| 9` fallbacks only cover load order.
// Every window global is guarded the way the rest of this file guards them.
// `ink` is the page's ink, which the gear is drawn in.
function bsMktCorner(ink) {
  const tools = (
    <div style={{ display: 'flex', alignItems: 'center', gap: (window.BS_CORNER_GAP || 9) }}>
      {window.BSSearchCorner ? React.createElement(window.BSSearchCorner, { size: (window.BS_HEADER_AVATAR || 34) }) : null}
      {window.BSSettingsCorner ? React.createElement(window.BSSettingsCorner, { size: (window.BS_HEADER_AVATAR || 34), ink }) : null}
    </div>
  );
  // The masthead's slim tool pill, as on every page (iosAppBroadsheet.jsx, BSMastToolPill).
  return window.BSMastToolPill ? React.createElement(window.BSMastToolPill, null, tools) : tools;
}


// The directory's section heads, rows and cards are BSMarketDirectory.jsx's (the 2026-11-04
// redesign); THE LISTING below keeps the Classifieds look (wave 7, the 2026-07-04 spec): heat =
// each coach's ROLE (trainer rust / nutritionist gold), line-only, on spines and portrait edges.

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
// Whether a coach is at capacity by their own listing (their toggle, and the date they said they'd take
// clients again): at_capacity, and no resume date or one still ahead. The rule src/lib/capacity.ts keeps
// for the server. The listing page and the directory's cards both read it here.
function mktRowAtCapacity(c) {
  return !!(c && c.at_capacity && (!c.capacity_resume_at || new Date(c.capacity_resume_at).getTime() > Date.now()));
}
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
      <span style={{ display: 'block', marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{formatCoachRating10(c)} · ${c.rate}/mo</span>
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

// ── THE COACHES TAB'S READINGS ───────────────────────────────────────────────────────────────────
// One function each, as the website keeps tier, rating and price in one place each (mkPriceOf,
// mkRating10, mkOpenTimes there): the price and its unit, the goals, the city, the open intro times,
// the filters' test and the sorts. The view (BSMarketDirectory.jsx) prints what these answer.

// The price the directory prints, with its unit: { amount, per: 'session' | 'month' }, or null. A live
// listing's is the one it names (mapSupabaseProvider: a trainer's session price per session, else the
// monthly price per month); an example coach's authored rate is a trainer's per session and a
// nutritionist's per month (the website's sample coaches are priced the same way).
function bsmPriceOf(c) {
  if (!c) return null;
  if (!bsmIsDemoCoach(c)) {
    const a = Number(c.priceAmount);
    return (c.pricePer === 'session' || c.pricePer === 'month') && a > 0 ? { amount: Math.round(a), per: c.pricePer } : null;
  }
  const a = Number(c.rate);
  return a > 0 ? { amount: Math.round(a), per: getPublicProfileKind(c) === 'nutritionist' ? 'month' : 'session' } : null;
}

// The goals a coach is filed under, from their own words (the website's mkGoalsOf).
function bsmGoalsOf(c) {
  const text = [c && c.specialty, c && c.category, ...((c && Array.isArray(c.spec)) ? c.spec : [])].filter(Boolean).join(' · ');
  const nutri = getPublicProfileKind(c) === 'nutritionist';
  const out = new Set();
  for (const g of BSM_GOALS) {
    if ((g.nu && !nutri) || (g.tr && nutri)) continue;
    if (BSM_GOAL_RX[g.id].test(text)) out.add(g.id);
  }
  if (!out.size) out.add('general');
  return out;
}

// The city a coach works in, or null: a live listing states none, and "Remote" is a way to meet, not a city.
function bsmCityOf(c) {
  const s = mktShortLoc(c && c.loc);
  return s && !/^(remote|online|anywhere)/i.test(s) ? s : null;
}

// Role · what they do, in their own words: a live listing's specialty and tags, an example's category
// and specialties; two at most, each said once.
function bsmSpecLine(c) {
  const parts = [c.specialty, c.category, ...(Array.isArray(c.spec) ? c.spec : [])].map((x) => String(x || '').trim()).filter(Boolean);
  const seen = new Set();
  const out = [];
  for (const p of parts) {
    const k = p.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
    if (out.length === 2) break;
  }
  return out;
}

// ── Open intro times ──
// An example coach's are example times, laid out from their name (the website's mkOpenTimes for a
// sample); a coach with an account has the times their own Shape calendar offers (GET
// /api/availability, laid out by the projection their profile books from); a listing with no account
// has none here. ⚠ An account's times are read once per ten minutes for the whole directory, six at a
// time, and a read that failed is no times, never invented ones.
const BSM_EX_TIMES = [[7, 0], [9, 0], [11, 30], [12, 0], [17, 30], [18, 0], [19, 0]];
function bsmHash(s) {
  let h = 2166136261;
  const str = String(s || '');
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
function bsmExampleTimes(c, now = Date.now()) {
  const h = bsmHash(c && c.name);
  const d0 = new Date(now);
  const out = [];
  for (let i = 0; i < 4; i++) {
    const d = new Date(d0.getFullYear(), d0.getMonth(), d0.getDate() + ((h >>> (i * 3)) % 3) + i * 2 + 1);
    const [hh, mm] = BSM_EX_TIMES[(h >>> (i * 2 + 5)) % BSM_EX_TIMES.length];
    d.setHours(hh, mm, 0, 0);
    out.push(d.getTime());
  }
  return out.sort((a, b) => a - b);
}
const _MKT_OPEN = new Map();        // "role:providerId" -> { open: [ms], shut, at }
const _MKT_OPEN_WAIT = new Set();   // keys being read
const _MKT_OPEN_SUBS = new Set();   // mounted directories, told when a read lands
const BSM_OPEN_TTL = 10 * 60 * 1000;
function bsmOpenKey(c) {
  const pid = c && (c.provider_id || c.db_id);
  return c && c.provider_user_id && pid ? `${getPublicProfileKind(c)}:${pid}` : null;
}
// One /api/availability answer as the intro times it offers (the profile's rule, BSTrainerProfile's
// week()): a coach who is full with intros at capacity off is shut; a week with no readable zone is none.
function bsmReadOpen(d) {
  if (!d || !Array.isArray(d.slots)) return null;
  const introsAtCap = !!(d.rules && d.rules.introsAtCapacity === true);
  if (d.atCapacity === true && !introsAtCap) return { open: [], shut: true, at: Date.now() };
  const len = Number(d.rules && d.rules.consultMin);
  const introMin = Number.isInteger(len) && len >= 5 && len <= 240 ? len : 15;
  if (d.slots.length && !bsIsZone(d.timezone)) return { open: [], shut: false, at: Date.now() };
  const open = bsProjectAvailability({ slots: d.slots, booked: d.booked || [], weeks: 2, zone: d.timezone, busy: d.busy || [], rules: d.rules || null, sessionMin: introMin });
  return { open: open.map((s) => s.at).filter(Number.isFinite), shut: false, at: Date.now() };
}
function bsmFetchOpen(keys) {
  const get = window.ShapeCoachAvailability && window.ShapeCoachAvailability.get;
  if (typeof get !== 'function') return;
  const fresh = (k) => { const e = _MKT_OPEN.get(k); return e && Date.now() - e.at < BSM_OPEN_TTL; };
  const want = keys.filter((k) => !fresh(k) && !_MKT_OPEN_WAIT.has(k));
  if (!want.length) return;
  want.forEach((k) => _MKT_OPEN_WAIT.add(k));
  let next = 0;
  const worker = async () => {
    while (next < want.length) {
      const k = want[next++];
      const i = k.indexOf(':');
      try {
        const read = bsmReadOpen(await get(k.slice(0, i), k.slice(i + 1)));
        if (read) _MKT_OPEN.set(k, read);
      } catch (e) { /* no times, never invented ones */ }
      _MKT_OPEN_WAIT.delete(k);
      _MKT_OPEN_SUBS.forEach((f) => { try { f(); } catch (e2) { /* unmounted */ } });
    }
  };
  for (let n = 0; n < Math.min(6, want.length); n++) worker();
}
function useMktOpenTimes(coaches) {
  const [, bump] = useStateBSM2(0);
  useEffectBSM2(() => {
    const f = () => bump((n) => n + 1);
    _MKT_OPEN_SUBS.add(f);
    return () => { _MKT_OPEN_SUBS.delete(f); };
  }, []);
  const keys = Array.from(new Set((coaches || []).map(bsmOpenKey).filter(Boolean)));
  const key = keys.join(',');
  useEffectBSM2(() => { bsmFetchOpen(keys); }, [key]);   // eslint-disable-line react-hooks/exhaustive-deps
}
// A coach's open intro times from now: [ms] (empty when none, or shut), or null when unknown.
function bsmOpenTimes(c, now = Date.now()) {
  if (bsmIsDemoCoach(c)) return mktRowAtCapacity(c) ? [] : bsmExampleTimes(c, now);
  const k = bsmOpenKey(c);
  const e = k ? _MKT_OPEN.get(k) : null;
  if (!e) return null;
  return e.shut ? [] : e.open.filter((ms) => ms > now);
}
function bsmWithinWeek(c, now = Date.now()) {
  const t = bsmOpenTimes(c, now);
  return !!(t && t.length && t[0] - now < 7 * 86400000);
}
// "Today 5:30 PM", "Tomorrow 7:00 AM", "Thu 6:00 PM", on the viewer's own clock (P9).
function bsmSlotText(ms, tr) {
  const zone = viewerZone();
  const locale = bsmLocale();
  const time = formatTime(ms, { zone, locale });
  const key = dayKey(ms, zone);
  const p = partsInZone(Date.now(), zone);
  const tomorrow = p ? new Date(Date.UTC(p.y, p.mo - 1, p.d + 1)).toISOString().slice(0, 10) : '';
  if (key && key === dayKey(Date.now(), zone)) return tr('marketplace:dir.todayAt', { defaultValue: 'Today {time}', time });
  if (key && key === tomorrow) return tr('marketplace:dir.tomorrowAt', { defaultValue: 'Tomorrow {time}', time });
  return tr('marketplace:dir.dayAt', { defaultValue: '{day} {time}', day: formatDate(ms, { zone, locale, weekday: 'short' }), time });
}

// ── The filters ──
// Whether a coach passes the role, the filters and the search (a filter's counts pass it a copy of the
// filters with that choice made, so each count is what the choice would leave). The website's mkPass: a city keeps the coaches there and, unless the member asked to meet in person, those who work
// remotely; a coach whose listing does not say how they meet shows under Either only; a coach with no
// price passes any budget, and the budget for a unit leaves the other unit's prices alone.
function bsmPass(c, f, role, q, now) {
  const nutri = getPublicProfileKind(c) === 'nutritionist';
  if ((role === 'Trainers' && nutri) || (role === 'Nutritionists' && !nutri)) return false;
  if (f.goals.length) { const g = bsmGoalsOf(c); if (!f.goals.some((x) => g.has(x))) return false; }
  const p = bsmPriceOf(c);
  if (p) {
    if (p.per === 'session' && f.maxSession != null && p.amount > f.maxSession) return false;
    if (p.per === 'month' && f.maxMonth != null && p.amount > f.maxMonth) return false;
  }
  const inPerson = c.format === 'In-person' || c.format === 'Hybrid';
  const remote = c.format === 'Remote' || c.format === 'Hybrid';
  if ((f.meet === 'inperson' && !inPerson) || (f.meet === 'remote' && !remote)) return false;
  if (f.city !== 'Anywhere' && bsmCityOf(c) !== f.city && !(f.meet !== 'inperson' && remote)) return false;
  if (f.openWeek && !bsmWithinWeek(c, now)) return false;
  if (q) {
    const hay = [c.name, c.specialty, c.category, ...(c.spec || []), c.cred, ...getCoachCertifications(c), bsmCityOf(c)].filter(Boolean).join(' ').toLowerCase();
    if (!q.split(/\s+/).filter(Boolean).every((w) => hay.includes(w))) return false;
  }
  return true;
}
// The filters `f` as the role `role` can hold them: another role's goals off, a city none of the role's
// coaches is in back to Anywhere, a unit's budget the role is not priced in cleared. ⚠ EVERY ROLE CHANGE
// GOES THROUGH THIS (Codex on #2667): the role picker and a jump that lands on the open tab with a role
// (Goals, Train's "Find a trainer"); kept, a filter the role can't hold hid every coach the member asked for.
function bsmFiltersForRole(f, role, everyone, now) {
  const pool = (everyone || []).filter((c) => bsmPass(c, BSM_FILTERS0, role, '', now));
  const cities = new Set(pool.map(bsmCityOf).filter(Boolean));
  // A way of meeting no listing states can't be chosen (the sheet hides it), so it can't stay on.
  const meetKnown = pool.some((c) => c.format === 'In-person' || c.format === 'Remote' || c.format === 'Hybrid');
  return {
    ...f,
    goals: f.goals.filter((id) => bsmGoalFits(BSM_GOALS.find((g) => g.id === id) || {}, role)),
    city: f.city === 'Anywhere' || cities.has(f.city) ? f.city : 'Anywhere',
    meet: meetKnown ? f.meet : 'either',
    maxSession: role === 'Nutritionists' ? null : f.maxSession,
    maxMonth: role === 'Trainers' ? null : f.maxMonth,
  };
}
// The same filters, or `f` itself when nothing changes (so a check that finds nothing re-renders nothing).
function bsmSameFilters(a, b) {
  return a.city === b.city && a.meet === b.meet && a.maxSession === b.maxSession && a.maxMonth === b.maxMonth
    && a.goals.length === b.goals.length && a.goals.every((g, i) => g === b.goals[i]);
}
// The sorts: Best match is the goal's fit, then an open intro, then the rating and how many reviews
// it rests on (the website's mkScore); price compares per session before per month.
function bsmSort(list, sort, f, now) {
  const arr = [...list];
  const r10 = (c) => getCoachRating10(c) || 0;
  const reviews = (c) => Number(c.reviewCount) || 0;
  if (sort === 'price') {
    const by = (c) => { const p = bsmPriceOf(c); return p ? (p.per === 'session' ? p.amount : 10000 + p.amount) : 1e9; };
    arr.sort((a, b) => by(a) - by(b));
  } else if (sort === 'rated') arr.sort((a, b) => r10(b) - r10(a) || reviews(b) - reviews(a));
  else if (sort === 'years') arr.sort((a, b) => (b.years || 0) - (a.years || 0));
  else {
    const score = new Map(arr.map((c) => {
      const g = bsmGoalsOf(c);
      const fit = f.goals.length ? f.goals.filter((x) => g.has(x)).length : 0;
      const t = bsmOpenTimes(c, now);
      return [c, fit * 100 + (t && t.length ? 20 : 0) + r10(c) + Math.min(5, reviews(c) / 60)];
    }));
    arr.sort((a, b) => score.get(b) - score.get(a));
  }
  return arr;
}

// ── Your team ──
// The coaches the member pays, off the plan read Home's Team reads (bsHomeCoachesOf), each with
// Message; the signed-out preview shows the sample's two, the ones its Home names. A member with no
// coach, or a read that failed, has no team block.
const BSM_FACES = `${import.meta.env.BASE_URL}faces/`;
const BSM_SAMPLE_TEAM = [
  { role: 'trainer', name: 'Jordan Chen', conversationId: null, providerId: 'sample-trainer', photo: `${BSM_FACES}coach-jordan.jpg` },
  { role: 'nutritionist', name: 'Dr. Maya Patel', conversationId: null, providerId: 'sample-nutritionist', photo: `${BSM_FACES}coach-maya.jpg` },
];
function useMktTeam() {
  const signedIn = bsmSignedIn();
  const [paid, setPaid] = useStateBSM2(null);
  useEffectBSM2(() => {
    if (!signedIn || !window.ShapePlan?.get) return undefined;
    let on = true;
    window.ShapePlan.get().then((p) => { if (on && p) setPaid(bsHomeCoachesOf(p)); }).catch(() => {});
    return () => { on = false; };
  }, [signedIn]);
  const team = signedIn ? (paid || []) : BSM_SAMPLE_TEAM;
  // Each thread's unread count, from the app's one unread manager (as Home's Team reads it).
  const ids = team.map((c) => c.conversationId).filter(Boolean).join(',');
  const [unread, setUnread] = useStateBSM2(() => ({ ...(window.ShapeUnread?.all?.() || {}) }));
  useEffectBSM2(() => {
    if (!ids) return undefined;
    try { window.ShapeUnread?.start?.(); } catch (e) { /* counts stay as read */ }
    const off = window.ShapeUnread?.onChange?.((m) => setUnread({ ...(m || {}) }));
    setUnread({ ...(window.ShapeUnread?.all?.() || {}) });
    return () => { try { if (typeof off === 'function') off(); } catch (e) { /* gone */ } };
  }, [ids]);
  return team.map((c) => ({ ...c, unread: (c.conversationId && unread && unread[`dm:${c.conversationId}`]) || 0 }));
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
// The member's Coaches tab (owner, 2026-11-09: a sixth tab, between Eat and Chat): Your team, then the
// marketplace in the "Browse list" look. `initialRole` ('trainer' | 'nutritionist' | null) picks the
// role it opens on (Train's "Find a trainer" opens on Trainers, Eat's on Nutritionists, the tab itself
// on Both); `onBack` is a pushed page's ← Back, and the tab, a root, has none.
function BSMarketplaceScreen({ onBack = null, onProfile, initialRole, goChat, initialCoach = null, onCoachConsumed = null }) {
  const t = useBS();
  const tr = useShapeTr();
  const roleOf = (r) => (r === 'nutritionist' ? 'Nutritionists' : r === 'trainer' ? 'Trainers' : 'Both');
  const [pill, setPill] = useStateBSM2(roleOf(initialRole));
  // A deep link that lands while the tab is open (a waitlist notification, Train's bar) picks its role.
  // Its filters go through the same rule as the role picker's (bsmFiltersForRole), over the coaches
  // this render read (everyoneRef, set below).
  const roleSeen = React.useRef(initialRole);
  const everyoneRef = React.useRef([]);
  const [f, setF] = useStateBSM2(BSM_FILTERS0);
  useEffectBSM2(() => {
    if (roleSeen.current === initialRole) return;
    roleSeen.current = initialRole;
    const r = roleOf(initialRole);
    setPill(r);
    setF((prev) => bsmFiltersForRole(prev, r, everyoneRef.current, Date.now()));
  }, [initialRole]);
  const [sort, setSort] = useStateBSM2('best');
  const [query, setQuery] = useStateBSM2('');
  const [filtersOpen, setFiltersOpen] = useStateBSM2(false);
  const [open, setOpen] = useStateBSM2(null);
  // Compare (owner, 2026-11-11: "yes i want compare on app"): up to three coaches picked from the rows, kept
  // while the list is filtered or a coach is opened, and the side-by-side sheet over the page.
  const [cmpKeys, setCmpKeys] = useStateBSM2([]);
  const [cmpOpen, setCmpOpen] = useStateBSM2(false);
  // The tapped coach's 1-based position in the list (LISTING Nº) — null from the
  // picks and the plan rail, which aren't numbered rows.
  const [openNo, setOpenNo] = useStateBSM2(null);
  // A row's "Book intro": the coach's page opens at its open times.
  const [openIntro, setOpenIntro] = useStateBSM2(false);
  // A trainer opens on their profile; this is their full listing, opened from it.
  const [openListing, setOpenListing] = useStateBSM2(false);
  const [applyRole, setApplyRole] = useStateBSM2(null);
  const [remoteCoaches, setRemoteCoaches] = useStateBSM2(null);
  const [providersLoading, setProvidersLoading] = useStateBSM2(false);
  const [providersError, setProvidersError] = useStateBSM2('');
  // Live marketplace plans (published, priced coach_plans across all coaches).
  const [marketPlans, setMarketPlans] = useStateBSM2(null);
  const [planTab, setPlanTab] = useStateBSM2('program');
  useEffectBSM2(() => {
    let on = true;
    if (window.ShapeMarketPlans?.list) window.ShapeMarketPlans.list().then((r) => { if (on) setMarketPlans(Array.isArray(r) ? r : []); }).catch(() => { if (on) setMarketPlans([]); });
    return () => { on = false; };
  }, []);

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
  // stays on the directory, and SAYS SO: a listing that is not in the marketplace
  // (not ready yet, 2026-10-12, or removed) used to leave the member on the
  // directory with no word, as if the tap had done nothing. ONE-SHOT: handling it
  // (hit or miss) tells the shell to clear the target, so a later ordinary
  // marketplace open can never replay a stale deep link.
  const [deepMiss, setDeepMiss] = useStateBSM2(false);
  // A coach a jump opened straight onto (a chat's coach card, a notification: `back: 'nav'`) goes back where
  // the member was, through the nav history, not to the list behind it they never saw (2026-11-10).
  const [openViaNav, setOpenViaNav] = useStateBSM2(false);
  useEffectBSM2(() => {
    if (!initialCoach || !remoteCoaches) return;
    const pool = initialCoach.role === 'nutritionist' ? (remoteCoaches.Nutritionist || []) : (remoteCoaches.Trainer || []);
    const hit = pool.find((c) => Number(c.provider_id) === Number(initialCoach.providerId));
    if (hit) { setOpen(hit); setOpenNo(null); setOpenIntro(false); setOpenListing(!!initialCoach.listing); setOpenViaNav(initialCoach.back === 'nav'); setDeepMiss(false); } else setDeepMiss(true);
    if (onCoachConsumed) onCoachConsumed();
  }, [initialCoach, remoteCoaches]);

  // What Coaches has open rides on the nav history (owner, 2026-11-10: Back goes "to previous page and
  // location user was on"). A live coach's profile, or its listing, is announced, so a jump out of it
  // (Message → the thread) comes back to it through the deep-open above; the role picked rides along, as
  // the shell's own location carries it. A sample coach has no listing id to find it by again, so a Back
  // to one lands on the directory.
  const openCoachLoc = open && open.provider_id != null && (open.provider_role === 'trainer' || open.provider_role === 'nutritionist')
    ? { role: open.provider_role, providerId: open.provider_id, ...(openListing ? { listing: true } : null), ...(openViaNav ? { back: 'nav' } : null) } : null;
  useEffectBSM2(() => {
    window.ShapeNav?.announce?.(openCoachLoc ? { detail: { ...(initialRole ? { role: initialRole } : null), coach: openCoachLoc } } : null, 'coaches');
    return () => window.ShapeNav?.announce?.(null, 'coaches');
  }, [JSON.stringify(openCoachLoc), initialRole]); // eslint-disable-line react-hooks/exhaustive-deps

  // Demo fallback: the "YOUR COACH"/"YOUR NUTRITIONIST" relationship badges are
  // honest only in the signed-out preview — strip them for a signed-in account
  // (they have no such coach) so the fallback can't imply a relationship. Every
  // example coach is labelled Example on the page, signed in or out.
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
  // And every account's open intro times, for the rows' next open time and "Open intro this week".
  useMktOpenTimes(everyone);
  everyoneRef.current = everyone;
  // ⚠ THE COACHES CHANGE UNDER THE FILTERS (Codex on #2667): the example roster shows while the live
  // directory is read, and a city or a way of meeting chosen from it may name nothing the live listings
  // state; when the coaches change, the filters are held to what they carry, as a role change holds them.
  useEffectBSM2(() => {
    setF((prev) => { const next = bsmFiltersForRole(prev, pill, everyone, Date.now()); return bsmSameFilters(prev, next) ? prev : next; });
  }, [everyone]);   // eslint-disable-line react-hooks/exhaustive-deps
  const team = useMktTeam();

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
  // Each live coach's public card (get_public_profile), for the look they set for their page: their paper,
  // accent, climb background and cover paint their card here, as on the website's Coaches page (owner,
  // 2026-11-11: "make the coach cards look the same also on marketplace on app"). Six reads at a time; a
  // card that fails to read keeps the directory's own look. Samples and listings with no account read none.
  const [cardByUser, setCardByUser] = useStateBSM2({});
  const lookRev = useBSUserGoalsRev(BSM2_LOOK_KINDS);
  useEffectBSM2(() => {
    const ids = [...new Set((everyone || []).filter((c) => !bsmIsDemoCoach(c)).map((c) => c.provider_user_id).filter(Boolean))];
    if (!ids.length || !(window.ShapeProfiles && window.ShapeProfiles.getPublicProfile)) return undefined;
    let on = true;
    const got = {};
    let next = 0;
    const one = async () => {
      while (on && next < ids.length) {
        const id = ids[next++];
        try { const r = await window.ShapeProfiles.getPublicProfile(id); if (r) got[id] = { can_view: r.can_view, custom: r.custom || null }; } catch (e) { /* the directory's own look */ }
      }
    };
    // A re-read that fails for a coach keeps the card already read for them.
    Promise.all(Array.from({ length: Math.min(6, ids.length) }, one)).then(() => { if (on) setCardByUser((prev) => ({ ...prev, ...got })); });
    return () => { on = false; };
  }, [everyone, lookRev]);
  // Portrait ladder: the coach's listing portrait (normalized — an invalid one
  // is already null and falls through) → their profile photo/avatar → the
  // fetched account avatar → initials (the face's own fallback, MktPortrait's on the listing).
  const coachPhoto = (c) => (c && ((c.listing_media && c.listing_media.portrait) || c.photo || c.avatar || (c.provider_user_id ? avatarByUser[c.provider_user_id] : null))) || undefined;

  // ── The list: the role, the filters and the search, in the sort picked ──
  // The role and filter values stay English tokens (the rules branch on them); the view
  // (BSMarketDirectory.jsx) maps each to its displayed, localized word.
  const now = Date.now();
  const q = query.trim().toLowerCase();
  const list = bsmSort(everyone.filter((c) => bsmPass(c, f, pill, q, now)), sort, f, now);
  // What the role's coaches carry, for the filter sheet's choices: only cities, ways of meeting and
  // prices some listing states, so no filter offers a match nobody has.
  const rolePool = everyone.filter((c) => bsmPass(c, BSM_FILTERS0, pill, '', now));
  const cities = Array.from(new Set(rolePool.map(bsmCityOf).filter(Boolean))).sort((a, b) => a.localeCompare(b));
  const meetKnown = rolePool.some((c) => c.format === 'In-person' || c.format === 'Remote' || c.format === 'Hybrid');
  const priceRange = (per) => {
    const xs = rolePool.map(bsmPriceOf).filter((p) => p && p.per === per).map((p) => p.amount);
    if (!xs.length) return null;
    const min = Math.max(0, Math.floor(Math.min(...xs) / 10) * 10);
    const max = Math.ceil(Math.max(...xs) / 10) * 10;
    return max > min ? { min, max, step: 5 } : null;
  };
  const count = (ff, r = pill) => everyone.filter((c) => bsmPass(c, ff, r, q, now)).length;
  const goalWord = (g) => ({
    strength: tr('marketplace:goal.strength', { defaultValue: 'Strength' }),
    fatloss: tr('marketplace:goal.fatloss', { defaultValue: 'Fat loss' }),
    endurance: tr('marketplace:goal.endurance', { defaultValue: 'Endurance' }),
    mobility: tr('marketplace:goal.mobility', { defaultValue: 'Mobility & rehab' }),
    nutrition: tr('marketplace:goal.nutrition', { defaultValue: 'Sports nutrition' }),
    general: tr('marketplace:goal.general', { defaultValue: 'General fitness' }),
    running: tr('marketplace:goal.running', { defaultValue: 'Running' }),
    hyrox: tr('marketplace:goal.hyrox', { defaultValue: 'Hyrox' }),
    hiit: tr('marketplace:goal.hiit', { defaultValue: 'HIIT' }),
    bodybuilding: tr('marketplace:goal.bodybuilding', { defaultValue: 'Bodybuilding' }),
    functional: tr('marketplace:goal.functional', { defaultValue: 'Functional & hybrid' }),
    home: tr('marketplace:goal.home', { defaultValue: 'At home' }),
    women: tr('marketplace:goal.women', { defaultValue: 'Just for women' }),
    weight: tr('marketplace:goal.weight', { defaultValue: 'Weight management' }),
    muscle: tr('marketplace:goal.muscle', { defaultValue: 'Muscle gain' }),
    gut: tr('marketplace:goal.gut', { defaultValue: 'Gut health' }),
    plant: tr('marketplace:goal.plant', { defaultValue: 'Plant-based' }),
    prenatal: tr('marketplace:goal.prenatal', { defaultValue: 'Prenatal & postnatal' }),
    mealprep: tr('marketplace:goal.mealprep', { defaultValue: 'Meal prep' }),
    medical: tr('marketplace:goal.medical', { defaultValue: 'Medical & conditions' }),
    longevity: tr('marketplace:goal.longevity', { defaultValue: 'Longevity' }),
  }[g] || g);
  const meetWord = (m) => (m === 'inperson' ? tr('marketplace:meet.inPerson', { defaultValue: 'In person' }) : m === 'remote' ? tr('marketplace:meet.remote', { defaultValue: 'Remote' }) : tr('marketplace:meet.either', { defaultValue: 'Either' }));
  const set = (patch) => setF((prev) => ({ ...prev, ...patch }));
  // The sheet's goals: the role's own (a nutritionist's drop off on Trainers, a trainer's on
  // Nutritionists); the six card goals always, any other once a coach is filed under it or it is on.
  const goalKeys = BSM_GOALS
    .filter((g) => bsmGoalFits(g, pill) && (g.card || f.goals.includes(g.id) || count({ ...f, goals: [g.id] }) > 0))
    .map((g) => g.id);
  const sessionRange = pill !== 'Nutritionists' ? priceRange('session') : null;
  const monthRange = pill !== 'Trainers' ? priceRange('month') : null;
  // Each filter that is on, as a chip that takes it off (the Filters button's count is how many).
  const applied = [
    ...f.goals.map((g) => ({ key: `goal:${g}`, label: goalWord(g), onRemove: () => set({ goals: f.goals.filter((x) => x !== g) }) })),
    f.openWeek ? { key: 'openWeek', label: tr('marketplace:filters.openWeek', { defaultValue: 'Open intro this week' }), onRemove: () => set({ openWeek: false }) } : null,
    f.city !== 'Anywhere' ? { key: 'city', label: f.city, onRemove: () => set({ city: 'Anywhere' }) } : null,
    f.maxSession != null ? { key: 'maxSession', label: tr('marketplace:filters.upToSession', { defaultValue: 'Up to ${amount}/session', amount: f.maxSession }), onRemove: () => set({ maxSession: null }) } : null,
    f.maxMonth != null ? { key: 'maxMonth', label: tr('marketplace:filters.upToMonth', { defaultValue: 'Up to ${amount}/month', amount: f.maxMonth }), onRemove: () => set({ maxMonth: null }) } : null,
    f.meet !== 'either' ? { key: 'meet', label: meetWord(f.meet), onRemove: () => set({ meet: 'either' }) } : null,
  ].filter(Boolean);
  // A role leaves behind the filters it can't hold (bsmFiltersForRole): another role's goals, a city none
  // of its coaches is in, a unit's budget the role is not priced in.
  const pickRole = (r) => {
    setPill(r);
    setF((prev) => bsmFiltersForRole(prev, r, everyone, now));
  };
  const filters = {
    role: pill,
    roles: ['Both', 'Trainers', 'Nutritionists'].map((r) => ({ key: r, count: count(f, r) })),
    onRole: pickRole,
    applied,
    open: filtersOpen,
    onOpen: () => setFiltersOpen(true),
    onClose: () => setFiltersOpen(false),
    onClear: () => setF(BSM_FILTERS0),
    total: list.length,
    goals: goalKeys.map((g) => ({ key: g, label: goalWord(g), count: count({ ...f, goals: [g] }), on: f.goals.includes(g),
      onToggle: () => set({ goals: f.goals.includes(g) ? f.goals.filter((x) => x !== g) : [...f.goals, g] }) })),
    // null: no listing of the role states a city (the sheet says "Not listed yet").
    city: cities.length ? { value: f.city, options: ['Anywhere', ...cities], onChange: (v) => set({ city: v }) } : null,
    budget: {
      session: sessionRange ? { ...sessionRange, value: f.maxSession, onChange: (v) => set({ maxSession: v }) } : null,
      month: monthRange ? { ...monthRange, value: f.maxMonth, onChange: (v) => set({ maxMonth: v }) } : null,
    },
    meet: meetKnown ? { value: f.meet, onChange: (v) => set({ meet: v }) } : null,
    openWeek: { on: f.openWeek, count: count({ ...f, openWeek: true }), onToggle: () => set({ openWeek: !f.openWeek }) },
  };

  if (applyRole && window.BSProviderApplicationScreen) {
    return <window.BSProviderApplicationScreen initialRole={applyRole} onBack={() => setApplyRole(null)} />;
  }
  if (open) {
    const closeOpen = () => {
      const viaNav = openViaNav;
      setOpen(null); setOpenNo(null); setOpenIntro(false); setOpenListing(false); setOpenViaNav(false);
      if (viaNav && window.ShapeNav?.canPop?.()) window.ShapeNav.back();
    };
    // Tapping a coach opens the coach profile (owner, 2026-10-28, for trainers; nutritionists
    // since they got it too), drawn from this listing: read fresh by the coach's account, or by the
    // listing's id when it has none (Shape's seeded listings, which show sample content there). Its
    // Work-with sheet opens THE LISTING below for plans, prices and codes, and the listing's THE
    // FULL PROFILE leader comes back here. A row's Book intro opens it at its open times (openAt).
    const openRole = open.provider_role || getPublicProfileKind(open);
    const isCoach = openRole === 'trainer' || openRole === 'nutritionist';
    if (isCoach && !openListing && window.BSPublicProfile) {
      const Profile = window.BSPublicProfile;
      const nutri = openRole === 'nutritionist';
      return <Profile person={{ ...bsmCoachPerson(open, coachPhoto(open), nutri), ...(openIntro ? { openAt: 'book' } : null) }} onBack={closeOpen} onListing={() => setOpenListing(true)}
        onMessage={(pp) => { if (goChat) goChat((pp && pp.who) || open.name, nutri ? 'Nutritionist' : 'Trainer'); }} />;
    }
    // A coach's full listing: THE LISTING (the marketplace conversion page, spec 2026-07-09).
    return <BSCoachDetailPublic coach={open} no={openNo} photo={coachPhoto(open)} goChat={goChat}
      onProfile={isCoach ? () => setOpenListing(false) : null} onBack={isCoach ? () => setOpenListing(false) : closeOpen} />;
  }

  // ONE COACH AS THE DIRECTORY DRAWS THEM (BSMarketDirectory.jsx): every rule is read here, so the
  // view only draws. The rating is a live coach's reviews or New (getCoachRating10: null), the price
  // its listing's with its unit (bsmPriceOf), the next open time a real one from the coach's own
  // calendar or an example's (labelled Example), the face the portrait ladder checked as a real
  // address. `n` is the place in the list (LISTING Nº on the listing it opens), null from the picks.
  const mktDirCard = (c, n = null) => {
    const times = bsmOpenTimes(c, now);
    const atCapacity = mktRowAtCapacity(c);
    return {
      key: c.id, n, name: c.name, nutri: getPublicProfileKind(c) === 'nutritionist',
      verified: !!c.verified, example: bsmIsDemoCoach(c), spec: bsmSpecLine(c),
      // The rating on the ten-point scale, or null for New (a live coach nobody has reviewed).
      score: getCoachRating10(c) || null,
      price: bsmPriceOf(c),
      // The next open intro, or At capacity when the coach is full and takes no intros.
      next: times && times.length ? { text: bsmSlotText(times[0], tr), full: false } : atCapacity ? { text: tr('marketplace:listing.atCapacity', { defaultValue: 'At capacity' }), full: true } : null,
      atCapacity,
      photo: mktValidPhoto(coachPhoto(c)),
      // The coach's look on their card (services/coachCardLook.mjs), or null for the directory's own.
      look: c.provider_user_id && !bsmIsDemoCoach(c) ? bsCoachCardLook(cardByUser[c.provider_user_id], getPublicProfileKind(c) === 'nutritionist' ? 'nutritionist' : 'trainer', c.provider_user_id) : null,
      onOpen: () => { setOpenNo(n); setOpenIntro(false); setOpen(c); },
      onIntro: () => { setOpenNo(n); setOpenIntro(true); setOpen(c); },
      // What Compare reads: the years, how they meet (every coach remote: coachCompare.mjs), the city,
      // the credentials, and whether a free intro is open (not for a coach full and taking none).
      years: Number.isFinite(Number(c.years)) && Number(c.years) > 0 ? Number(c.years) : null,
      meet: bsCompareMeets(c.format),
      city: bsmCityOf(c),
      creds: getCoachCertifications(c).join(' · ') || null,
      introOpen: !(atCapacity && !(times && times.length)),
      compare: { on: cmpKeys.includes(c.id), can: cmpKeys.includes(c.id) || cmpKeys.length < BS_COMPARE_MAX, onToggle: () => setCmpKeys((k) => bsCompareToggle(k, c.id)) },
    };
  };
  // The coaches picked to compare, in the order picked, from everyone (a filter that hides one keeps it).
  const cmpCoaches = cmpKeys.map((k) => everyone.find((c) => c.id === k)).filter(Boolean);
  // Editors' picks: the listings Shape features (an example roster's best rated, labelled Example),
  // in the role picked. Nothing paid puts a coach here.
  const inRole = (c) => bsmPass(c, BSM_FILTERS0, pill, '', now);
  const picks = (remoteCoaches
    ? everyone.filter((c) => c.tag === 'FEATURED')
    : bsmSort(everyone, 'rated', BSM_FILTERS0, now)).filter(inRole).slice(0, 6);
  // What's hot — real published plans across coaches, tabbed by kind. Live published plans when
  // present; else sample plans so the rail is populated in preview / before any coach has published.
  const livePlans = Array.isArray(marketPlans) ? marketPlans : [];
  // Sample plans are the SIGNED-OUT preview only. A signed-in member
  // seeing them would be shown fabricated coach offerings — priced,
  // with working taps — for plans nobody published (the demo-leak
  // rule). With no live plans they get the honest empty state.
  const allPlans = livePlans.length ? livePlans : (_bsmSignedIn ? [] : BSM_DEMO_PLANS);
  const tabPlans = allPlans.filter((p) => p.tab === planTab).slice(0, 8).map((pl) => ({
    key: pl.id, title: pl.name, nutri: pl.providerRole === 'nutritionist', coach: pl.coachName, price: pl.price || null, example: !!pl.demo,
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
    // No place is claimed for the coach (it used to read Remote).
    onOpen: () => { setOpenIntro(false); setOpen({ name: pl.coachName, id: (pl.demo && pl.coachId) || undefined, provider_id: (!pl.demo && pl.providerId) || undefined, provider_user_id: (!pl.demo && pl.ownerId) || undefined, provider_role: pl.providerRole, init: String(pl.coachName || '?').trim()[0] || '?', loc: null }); },
  }));
  // Your team: Message opens the coach's thread, or the chat tab on them when there is none yet.
  // The signed-out preview's two are the sample's, labelled Example like every example coach.
  const teamExample = !_bsmSignedIn;
  const teamRows = team.map((c) => ({
    key: `${c.role}:${c.providerId ?? c.name}`, name: c.name, nutri: c.role === 'nutritionist', photo: c.photo || null, unread: c.unread || 0, example: teamExample,
    onMessage: () => {
      if (c.conversationId) {
        try { window.dispatchEvent(new window.CustomEvent('shape:openConversation', { detail: { conversationId: c.conversationId, name: c.name || undefined } })); return; } catch (e) { /* the chat tab below */ }
      }
      if (goChat) goChat(c.name || null, c.role === 'nutritionist' ? 'Nutritionist' : 'Trainer');
    },
  }));

  return (
    <BSMarketDirectory
      onBack={onBack} corner={bsMktCorner(t.INK)}
      team={teamRows}
      query={query} onQuery={setQuery}
      filters={filters}
      loading={providersLoading} error={providersError}
      deepMiss={deepMiss} onDeepMissDismiss={() => setDeepMiss(false)}
      picks={picks.map((c) => mktDirCard(c))}
      list={list.map((c, i) => mktDirCard(c, i + 1))}
      // How the head counts them: example coaches can't be booked, nor a listing with no account.
      listKind={list.length && list.every(bsmIsDemoCoach) ? 'example' : list.every((c) => !!c.provider_user_id) ? 'bookable' : 'listed'}
      sort={sort} sorts={BSM_SORTS} onSort={setSort}
      planTab={planTab} onPlanTab={setPlanTab} plans={tabPlans}
      // The application door, on the role picked (a trainer's on Both).
      onApply={() => setApplyRole(pill === 'Nutritionists' ? 'nutritionist' : 'trainer')}
      compare={{
        cards: cmpCoaches.map((c) => { const card = mktDirCard(c); return { ...card, onOpen: () => { setCmpOpen(false); card.onOpen(); }, onIntro: () => { setCmpOpen(false); card.onIntro(); } }; }),
        open: cmpOpen && cmpCoaches.length > 1,
        onOpen: () => setCmpOpen(true), onClose: () => setCmpOpen(false),
        onRemove: (key) => setCmpKeys((k) => k.filter((x) => x !== key)),
        onClear: () => { setCmpKeys([]); setCmpOpen(false); },
      }} />
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
    eyebrow: [isNutritionist ? 'Nutritionist' : 'Trainer', coach.loc, getPrimaryCredential(coach)].filter(Boolean).join(' - '),
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



function BSPublicActionPanel({ action, coach, onClose, onConfirm, onMessageSent, code = '', onCode }) {
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
      // Above any passive notice the shell lays over the app (z 150 and below) — an
      // open action sheet is the active surface and must not be covered by one.
      // Only visible once the panel was correctly framed.
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
        {/* A failed booking or checkout offers Nora, with its words as context (the Ask Nora
            plan, step 5). Her sheet opens over this panel. */}
        {action.problem && !action.done && window.BSAskNoraLink ? (
          <window.BSAskNoraLink t={t} style={{ marginTop: 8 }} label={tr('feed:support.ask.whatHappenedLink', { defaultValue: 'Ask Nora what happened' })}
            draft={action.problem.kind === 'payment'
              ? tr('feed:support.ask.checkoutFailed', { defaultValue: "My checkout didn't go through. What happened?" })
              : tr('feed:support.ask.bookingFailed', { defaultValue: "My booking didn't go through. What happened?" })}
            problem={action.problem} />
        ) : null}

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

        {action.type === 'Checkout' && !action.done && !action.stale && (
          <label style={{ marginTop: 14, display: 'grid', gap: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>
            {tr('marketplace:panel.codeLabel', { defaultValue: 'Shape or coach code (optional)' })}
            <input
              data-checkout-code=""
              value={code}
              onChange={(e) => onCode && onCode(e.target.value)}
              maxLength={64}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              style={{ width: '100%', boxSizing: 'border-box', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, padding: '12px 14px', fontFamily: t.MONO, fontSize: 14, letterSpacing: '0.04em', outline: 'none' }}
            />
          </label>
        )}

        {!isMessage && !action.done && !action.stale && (
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
  const eyebrow = (eyebrowKind === 'split' || eyebrowKind === 'block' || eyebrowKind === 'program')
    ? tr('marketplace:preview.eyebrowProgram', { defaultValue: 'Program' })
    : eyebrowKind === 'menu'
      ? tr('marketplace:preview.eyebrowMenu', { defaultValue: 'Meal plan' })
      : tr('marketplace:preview.eyebrowSession', { defaultValue: 'Single session' });

  const register = [];
  if (p.weeks) register.push([tr('marketplace:preview.weeks', { defaultValue: 'Weeks' }), String(p.weeks)]);
  if (p.sessionsPerWeek) register.push([tr('marketplace:preview.perWeek', { defaultValue: 'Days / wk' }), String(p.sessionsPerWeek)]);
  // A program's units are its days, which Days / wk already counts.
  if (p.units.length && p.kind !== 'program') register.push([
    p.kind === 'menu' ? tr('marketplace:preview.meals', { defaultValue: 'Meals' }) : tr('marketplace:preview.moves', { defaultValue: 'Entries' }),
    String(p.units.length),
  ]);

  // A program's day carries its moves' names (a public preview's whole content): the day,
  // then its moves on a line under it.
  const dayRow = (u, i) => (
    <div key={i} data-preview-day="" style={{ padding: '9px 0', borderBottom: `1px solid ${t.HAIR}` }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <span style={{ flexShrink: 0, minWidth: 46, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', color: t.INK50 }}>{u.label}</span>
        <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>{u.title}</span>
      </div>
      <div style={{ marginTop: 3, paddingLeft: 54, fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.45, color: t.INK70 }}>{u.moves.concat(u.more > 0 ? [`＋${u.more}`] : []).join(' · ')}</div>
    </div>
  );
  const row = (u, i) => (Array.isArray(u.moves) ? dayRow(u, i) :
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
        ref={bsDialogRef(onClose)}
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
          <div style={{ margin: '12px 0 2px', display: 'flex', gap: 7, flexWrap:'wrap' }}>
            {p.media.map((m, i) => (
              <div key={i} style={{ flex: 'none', width:m.type==='video'?'100%':132, height:m.type==='video'?'auto':96, minWidth:0, overflow: 'hidden', background: t.PAPER2, border: `1px solid ${t.HAIR}` }}>
                {m.type === 'video'
                  ? <ShapeVideoPlayer value={m}/>
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
            {/* A program's public preview carries names, weeks and days only
                (bsProgramReduce); say what buying adds. */}
            {p.namesOnly && (
              <div data-preview-names-only="" style={{ marginTop: p.locked > 0 ? 0 : 10, paddingBottom: 4, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                {tr('marketplace:preview.namesOnly', { defaultValue: 'Sets, loads, cues and exercise videos unlock when you buy' })}
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
function BSCoachAvailabilityCalendar({ coach, roleColor, open, demo, note = null, onRetry = null, onPick, onBack }) {
  const t = useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const byDay = bsSlotsByDay(open);
  // Today on the viewer's own clock (P9), the calendar the slots' `iso` is keyed on (bsProjectAvailability).
  const today = (() => { const p = partsInZone(Date.now(), viewerZone()); return p ? new Date(p.y, p.mo - 1, p.d, 12) : new Date(); })();
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
        {/* trailing: null — a DRILL-IN. The selected coach and the calendar live in
                this component's local state, while the nav descriptor stores only
                marketRole and navResolve clears marketCoach; the settings gear
                early-returns the shell into Settings and unmounts this page, so
                back would land on a fresh directory rather than the listing the
                member left. Passed literally, not behind a flag — a flag on this
                row shipped ignored once already (see bsProMastRow). */}
            {window.BSMastRow ? React.createElement(window.BSMastRow, { trailing: null }) : null}
        {window.BSBackRow ? <window.BSBackRow onBack={onBack} /> : null}
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: roleColor }}>{tr('marketplace:cal.eyebrow', { defaultValue: 'The calendar' })} · {first}{demo ? ` · ${tr('marketplace:cal.preview', { defaultValue: 'Preview' })}` : ''}</div>
        <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK }}>{tr('marketplace:cal.title1', { defaultValue: 'Open to' })} <span style={{ fontStyle: 'italic', color: teal }}>{tr('marketplace:cal.title2', { defaultValue: 'book.' })}</span></h1>
        {demo ? <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:cal.previewNote', { defaultValue: 'Preview · typical availability — confirm at booking' })}</div> : null}
        {note ? <div data-times-note="" style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{note}{onRetry ? <button type="button" onClick={onRetry} style={{ marginLeft: 8, background: 'transparent', border: 0, padding: '2px 0', cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${roleColor}` }}>{tr('marketplace:listing.tryAgain', { defaultValue: 'Try again' })}</button> : null}</div> : null}
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
function BSCoachDetailPublic({ coach, onBack, no = null, photo = null, goChat = null, onProfile = null }) {
  const t = useBS();
  const tr = useShapeTr();
  const p = buildPublicProfile(coach);
  const roleColor = mktRoleColor(coach);
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // Listing media (normalized upstream for real coaches; authored for demo).
  const { cover: listingCover, gallery: listingGallery } = mktListingMedia(coach);
  const [action, setAction] = useStateBSM2(null);
  const [checkoutBusy, setCheckoutBusy] = useStateBSM2(false);
  // The code box before the redirect (coach direct charges, part B): a Shape code or the coach's
  // own, typed in the checkout panel. The checkout is made on the coach's own Stripe account, where
  // Stripe's box can never take a Shape code, so it goes in here and the server checks it first.
  const [checkoutCode, setCheckoutCode] = useStateBSM2('');
  const [showProfile, setShowProfile] = useStateBSM2(false);
  const [showCal, setShowCal] = useStateBSM2(false);
  const [offerSheet, setOfferSheet] = useStateBSM2(false);
  // Real availability for live coaches: the weekly pattern minus booked
  // sessions, projected 6 weeks (null = demo/preview row or fetch failed —
  // the labeled preview pattern renders instead; [] = a live coach with no
  // open slots, which reads honestly as none).
  const [realAvail, setRealAvail] = useStateBSM2(null);
  // How long this coach's free intro runs: their own setting, answered by /api/availability in
  // `rules.consultMin` (any length from 5 to 240 minutes). 15 until it loads, the length every
  // intro had.
  const [introMin, setIntroMin] = useStateBSM2(15);
  // Bumped to read the coach's times again (an intro length that changed under the member, or a
  // retry); a read after the first skips the cache.
  const [availEpoch, setAvailEpoch] = useStateBSM2(0);
  // A live coach's times: 'loading', 'ready' (realAvail holds them) or 'failed'.
  const [availState, setAvailState] = useStateBSM2('loading');
  // Whether this coach keeps free intros open while at capacity: their own setting
  // (rules.introsAtCapacity, task #10; owner: "let the coach decide"). Closed until it loads.
  const [introsAtCap, setIntrosAtCap] = useStateBSM2(false);
  // Whether the coach is at capacity NOW, as /api/availability answers it with their times, keyed on
  // the coach it was read for. ⚠ THE CATALOGUE ROW CAN BE STALE (Codex on #2375): a coach who went
  // full after the marketplace loaded still read as open here, so intro times were offered for
  // /api/consultation to refuse. Null until a read answers; the row stands in until then.
  const [availCap, setAvailCap] = useStateBSM2(null);
  // Declared hours we cannot place on a clock — the coach has no stored zone.
  const [noZone, setNoZone] = useStateBSM2(false);

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
    // ⚠ A LIVE COACH'S TIMES ARE THEIRS, LAID OUT FOR THE CURRENT LENGTH, OR NONE (Codex on #2370).
    // A read again left the old times on screen until it answered, and a failed read was swallowed,
    // so the member could keep picking times laid out for a length the coach no longer offers (or
    // the preview pattern, which never books). Every read starts from nothing; a failure says so.
    setRealAvail(null);
    setAvailState('loading');
    window.ShapeCoachAvailability.get(saleProviderRole, saleProviderId, availEpoch > 0 ? { fresh: true } : undefined)
      .then((d) => {
        if (!on) return;
        if (!d || !Array.isArray(d.slots)) { setAvailState('failed'); return; }
        // ⚠ THE COACH'S ZONE IS WHAT MAKES start_minute A TIME. Without it the projection
        // fails closed (see coachAvailability.mjs), so the two empty cases have to be told
        // apart: a coach with NO pattern genuinely has no open times, while a coach whose
        // hours we cannot place has some — and saying "no open times" there is a false
        // claim about them rather than about our data.
        setNoZone(d.slots.length > 0 && !bsIsZone(d.timezone));
        // `busy` + `rules`: the coach's time off, buffer, daily limit and notice (Schedule step 3),
        // and the intro's length, which the times are laid out for.
        const len = Number(d.rules && d.rules.consultMin);
        const minutes = Number.isInteger(len) && len >= 5 && len <= 240 ? len : 15;
        setIntroMin(minutes);
        setIntrosAtCap(!!(d.rules && d.rules.introsAtCapacity === true));
        if (typeof d.atCapacity === 'boolean') setAvailCap({ key: `${saleProviderRole}:${saleProviderId}`, at: d.atCapacity });
        setRealAvail(bsProjectAvailability({ slots: d.slots, booked: d.booked || [], weeks: 6, zone: d.timezone, busy: d.busy || [], rules: d.rules || null, sessionMin: minutes }));
        setAvailState('ready');
      })
      .catch(() => { if (on) setAvailState('failed'); });
    return () => { on = false; };
  }, [saleProviderId, saleProviderRole, availEpoch]);
  // A live coach whose times are not in yet (loading, or the read failed): nothing is offered, and
  // the preview pattern is never shown in their place.
  const liveTimes = !!(saleProviderId && typeof window !== 'undefined' && window.ShapeCoachAvailability?.get);
  const timesPending = liveTimes && realAvail == null;
  const retryTimes = () => setAvailEpoch((n) => n + 1);
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
  const rowAtCapacity = mktRowAtCapacity(coach);
  const freshAtCapacity = availCap && availCap.key === `${saleProviderRole}:${saleProviderId}` ? availCap.at : null;
  const atCapacity = freshAtCapacity == null ? rowAtCapacity : freshAtCapacity;
  const [wl, setWl] = useStateBSM2(null);
  // Whether this member already subscribes to the coach, from the same mine() read (task #10, Codex
  // on #2375): at capacity a current client keeps buying, and is never sent to the waiting list.
  // undefined = not read yet · null = could not read (the waiting list shows; the checkout decides).
  const [clientOf, setClientOf] = useStateBSM2(undefined);
  // ⚠ AT CAPACITY, INTROS ARE THE COACH'S CALL (task #10). Closed unless they keep them open, or this
  // member holds their invite off the waiting list; /api/consultation refuses the rest, so no time
  // or Book button is offered for them.
  const introClosed = atCapacity && !introsAtCap && wl?.status !== 'invited';
  const wlBusy = React.useRef(false);
  React.useEffect(() => {
    // ⚠ CLEARED ON EVERY RUN, NOT ONLY ON THE BAIL — and keyed on the ACCOUNT below.
    // The old deps held no identity, so an A→B switch did not re-run this effect at
    // all: A's in-flight `mine()` resolved into B's mounted listing and showed B A's
    // queue position and entry id. Keying on `bsmAuthUid` makes the switch a
    // dependency change, so the cleanup discards A's answer; clearing here rather
    // than only in the bail branch stops B seeing A's row in the window before the
    // replacement lands. Same class, and the same fix, as the web profile in this PR.
    setWl(null); setClientOf(undefined);
    if (!atCapacity || !capProviderId || !bsmAuthUid || !window.ShapeWaitlist?.mine) { setClientOf(null); return undefined; }
    let on = true;
    (async () => {
      try {
        const r = await window.ShapeWaitlist.mine();
        const mine = ((r && r.entries) || []).find((e) => String(e.providerId) === String(capProviderId) && e.providerRole === saleProviderRole);
        // ⚠ `/api/waitlist/mine` RETURNS THE ROW AS `id`; ONLY `/join` CALLS IT
        // `entryId`. Reading `mine.entryId` here yielded undefined on every hydrate, so
        // `wl.entryId` was null and `wlWithdraw` bailed at its own `if (!wl?.entryId)`
        // guard — "Refreshing your spot" forever. Joining still worked (the /join
        // response DOES carry entryId), so the list could be joined in-session and
        // never left again from the next reload onward. BSSignalCoachProfile reads
        // `mineEntry.id` and was always right, which is how one member could leave the
        // list from the profile and not from the listing.
        if (on) setWl(mine ? { status: mine.status, position: mine.position, entryId: mine.id || null } : null);
        if (on) setClientOf(Array.isArray(r && r.clientOf) ? r.clientOf.some((c) => c && String(c.providerId) === String(capProviderId) && c.providerRole === saleProviderRole) : null);
      } catch (e) { if (on) setClientOf(null); }
    })();
    return () => { on = false; };
  }, [atCapacity, capProviderId, saleProviderRole, bsmAuthUid]);
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
  // ⚠ THROUGH window.ShapeCoachReviews (apiBaseUrl + Bearer): the root-relative
  // fetch these used reached nothing on the native build, so every installed app
  // showed no reviews and could not post one. A coach with an account reads its
  // reviews by ACCOUNT, because the slug is a name and names drift.
  const coachSlug = coach.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
  // The listing's ROLE, never its tag: a live row's tag is 'FEATURED' or nothing, so
  // a nutritionist's review was filed as a trainer's and the relationship check
  // refused an eligible client (Codex P1, #2313).
  const coachKind = getPublicProfileKind(coach);
  const coachOwner = coach.provider_user_id || null;
  const ownListing = !!(coachOwner && bsmAuthUid && coachOwner === bsmAuthUid);
  const [liveReviews, setLiveReviews] = useStateBSM2([]);
  const [revRating, setRevRating] = useStateBSM2(0);
  const [revText, setRevText] = useStateBSM2('');
  const [revPosting, setRevPosting] = useStateBSM2(false);
  // The server's average and count are over EVERY review; the list is the newest 200.
  const [revAgg, setRevAgg] = useStateBSM2(null);
  const [revLoad, setRevLoad] = useStateBSM2(0);
  // Members read the reviews; anyone else is told so, with the rating (owner, 2026-10-28).
  const [revLocked, setRevLocked] = useStateBSM2(false);
  // Whether the list has been read: a failed read (a 503 when a membership or the ratings can't
  // be checked) is no list, never "No reviews yet" (Codex P2 on #2492).
  const [revRead, setRevRead] = useStateBSM2(false);
  // A reader who becomes a member here (Join → checkout → back) reads the reviews again.
  useEffectBSM2(() => {
    const onMember = () => setRevLoad((n) => n + 1);
    window.addEventListener('shape:membership-active', onMember);
    return () => window.removeEventListener('shape:membership-active', onMember);
  }, []);
  const avgRev = revAgg && revAgg.count > 0 ? revAgg.avg
    : (liveReviews.length ? Math.round((liveReviews.reduce((s, r) => s + (r.rating || 0), 0) / liveReviews.length) * 10) / 10 : null);
  useEffectBSM2(() => {
    let c = false;
    const api = window.ShapeCoachReviews;
    if (!api) return undefined;
    (coachOwner ? api.forOwner(coachOwner) : api.forCoach(coachSlug))
      .then(d => {
        if (c || !d || !Array.isArray(d.reviews)) return;
        setLiveReviews(d.reviews);
        setRevRead(true);
        setRevLocked(d.locked === true);
        setRevAgg(Number.isFinite(Number(d.count)) ? { avg: Number(d.avg) || 0, count: Number(d.count) } : null);
      })
      .catch(() => {});
    return () => { c = true; };
  }, [coachSlug, coachOwner, revLoad]);
  const submitReview = () => {
    if (!revRating || revPosting) return;   // in-flight lock: a double-tap can't post twice
    if (window.bsRequireAccount && !window.bsRequireAccount('leave a review')) return;
    const api = window.ShapeCoachReviews;
    if (!api) { window.__bsToast?.(tr('marketplace:listing.reviewError', { defaultValue: 'Could not post review' }), 'err'); return; }
    setRevPosting(true);
    api.post({ coach: coachSlug, kind: coachKind, rating: revRating, text: revText })
      .then((r) => {
        if (r && r.ok && r.review) {
          setLiveReviews(prev => [r.review, ...prev.filter(x => x.id !== r.review.id)]);
          setRevRating(0); setRevText(''); setRevLoad(n => n + 1);   // re-read the average
          window.__bsToast?.(tr('marketplace:listing.reviewPosted', { defaultValue: 'Review posted' }), 'ok');
          return;
        }
        const msg = r && r.code === 'relationship_required'
          ? tr('marketplace:listing.reviewRelationship', { defaultValue: 'You can review a coach once you have subscribed to them or had a session with them.' })
          : r && r.status === 401
            ? tr('marketplace:listing.reviewSignIn', { defaultValue: 'Sign in to leave a review.' })
            : tr('marketplace:listing.reviewError', { defaultValue: 'Could not post review' });
        window.__bsToast?.(msg, 'err');
      })
      .finally(() => setRevPosting(false));
  };
  const last = coach.name.split(' ').slice(1).join(' ') || p.role;
  const firstName = p.first;
  const timesNote = timesPending
    ? (availState === 'failed'
      ? tr('marketplace:listing.timesFailed', { defaultValue: "Couldn't load {name}'s times.", name: firstName })
      : tr('marketplace:listing.timesLoading', { defaultValue: "Loading {name}'s times…", name: firstName }))
    : null;

  const openIntro = () => {
    if (introClosed) return;
    // ⚠ A LIVE COACH'S NEXT OPEN TIME IS A PROJECTED SLOT, carrying its instant and the coach's
    // own clock, which is all the booking may send (Codex, #2233): the preview pattern has
    // neither, so booking it was refused every time. The preview is for a demo listing only, and a
    // real coach with no open time gets their calendar, which says so.
    let nextOpen;
    // Not in yet: the calendar says so (and offers the retry), rather than holding a preview time.
    if (timesPending) { setShowCal(true); return; }
    if (realAvail != null) {
      const s = realAvail[0];
      if (!s) { setShowCal(true); return; }
      nextOpen = { ...projSlotRow(s), coachDate: s.coachDate, coachTime: s.coachTime };
    } else {
      nextOpen = p.availability
        .flatMap(([day, date, times, iso, month]) => times.map(time => ({ day, date, time, month, iso })))
        .find(slot => slot.time && slot.time !== '--');
    }
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

  const selectSlot = (day, date, time, iso, month, at) => {
    if (time === '--') return;
    // The coach's own date and clock for this instant: what /api/consultation reads (it
    // derives the instant itself and checks it against their open hours). Only a projected
    // slot has one; a preview row has neither and is never written.
    const wall = Number.isFinite(at) ? (realAvail || []).find((x) => x.at === at) : null;
    setAction({
      type: 'Booking',
      title: tr('marketplace:listing.slotTitle', { defaultValue: '{day}, {month} {date} at {time}', day, month, date, time }),
      body: tr('marketplace:listing.slotBodyLength', { defaultValue: 'Free {minutes}-minute intro call with {name}. You can reschedule later from messages.', name: coach.name, minutes: introMin }),
      cta: tr('marketplace:listing.confirmBooking', { defaultValue: 'Confirm booking' }),
      slot: { day, date, time, month, iso, at, coachDate: wall ? wall.coachDate : null, coachTime: wall ? wall.coachTime : null },
    });
  };

  const confirmAction = async (current) => {
    // ⚠ HIRING A COACH NEEDS AN ACCOUNT, NOT THE $5 MEMBERSHIP (owner, 2026-11-10): browsing,
    // booking and hiring coaches are free, so the coach's checkout no longer meets a
    // membership-first panel (/api/stripe/checkout-session takes any signed-in adult account).
    // A retry starts clean: only the failure it reaches sets `problem` again.
    current = { ...current, problem: null };
    // Browse / no-account users can view coaches but must create an account to commit.
    const gateLabel = current.type === 'Booking' ? 'book a session' : current.type === 'Checkout' ? 'check out' : 'continue';
    if (window.bsRequireAccount && !window.bsRequireAccount(gateLabel)) return;
    if (current.type === 'Checkout') {
      setCheckoutBusy(true);
      try {
        const result = await window.ShapePayments?.startCheckout?.({
          item: current.item,
          code: checkoutCode.trim() || undefined,
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
        // Hiring a coach needs the health screening first (client-onboarding review, fix 2b): the
        // client app's screening opens over the marketplace, and once it is saved this checkout
        // runs again.
        if (error?.code === 'screening_required' && window.bsOpenScreening) {
          const retry = current;
          window.bsOpenScreening({ onDone: () => { confirmAction(retry); } });
          return;
        }
        setAction({
          ...current,
          title: tr('marketplace:listing.checkoutError', { defaultValue: 'Checkout error' }),
          body: error?.message || tr('marketplace:listing.checkoutErrorBody', { defaultValue: 'Unable to open Stripe checkout.' }),
          cta: tr('marketplace:listing.tryAgain', { defaultValue: 'Try again' }),
          problem: { kind: 'payment', message: error?.message || tr('marketplace:listing.checkoutErrorBody', { defaultValue: 'Unable to open Stripe checkout.' }) },
        });
      } finally {
        setCheckoutBusy(false);
      }
      return;
    }
    if (current.type === 'Booking') {
      setCheckoutBusy(true);
      try {
        await window.ShapeBookings?.submitConsultationBooking?.({
          coach,
          role: getPublicProfileKind(coach),
          slot: current.slot,
          topic: 'Free intro call',
          durationMin: introMin,
        });
        // ⚠ NO THREAD IS STARTED HERE. This wrote a "Booked intro consultation" note from the
        // member into a thread kept only on this phone, which the coach never received, and the
        // panel said "A message thread has been started" (client-onboarding review, H6). The coach
        // is told by the booking itself (a notification and an email); the member hears back by
        // email when the coach confirms, with the call link.
        setAction({
          ...current,
          done: true,
          title: tr('marketplace:listing.requested', { defaultValue: 'Requested' }),
          body: tr('marketplace:listing.bookedRequestBody', { defaultValue: 'You asked {name} for a {minutes}-minute intro. You will get the call link by email once they confirm.', name: coach.name, minutes: introMin }),
        });
      } catch (error) {
        // ⚠ THE COACH CHANGED THEIR INTRO LENGTH SINCE THESE TIMES WERE LAID OUT (Codex on #2370).
        // Trying again would send the same stale length forever: the times are read again at the
        // new length and the member picks one, as the website's consultation page does.
        if (error?.code === 'length_changed') {
          const minutes = Number.isInteger(error.durationMin) ? error.durationMin : introMin;
          if (Number.isInteger(error.durationMin)) setIntroMin(error.durationMin);
          setAvailEpoch((n) => n + 1);
          setAction({
            ...current,
            stale: true,
            title: tr('marketplace:listing.lengthChanged', { defaultValue: 'The intro changed' }),
            body: tr('marketplace:listing.lengthChangedBody', { defaultValue: "{name}'s intro now runs {minutes} minutes. Pick a time again.", name: coach.name, minutes }),
          });
          return;
        }
        setAction({
          ...current,
          title: tr('marketplace:listing.bookingError', { defaultValue: 'Booking error' }),
          body: error?.message || tr('marketplace:listing.bookingErrorBody', { defaultValue: 'Unable to save this consultation booking.' }),
          cta: tr('marketplace:listing.tryAgain', { defaultValue: 'Try again' }),
          problem: { kind: 'booking', message: error?.message || tr('marketplace:listing.bookingErrorBody', { defaultValue: 'Unable to save this consultation booking.' }) },
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
      // ⚠ A FAILED SEND IS SAID, NOT STORED. This kept the note on the phone and called it "saved
      // locally", where nothing ever sent it on (client-onboarding review, H6).
      setAction({
        type: 'Message',
        title: tr('marketplace:listing.messageNotSent', { defaultValue: 'Not sent' }),
        body: tr('marketplace:listing.messageNotSentBody', { defaultValue: 'Your note to {name} did not send. Try again. {error}', name: coach.name, error: error?.message || '' }),
        cta: tr('marketplace:listing.sendMessage', { defaultValue: 'Send message' }),
      });
    }
  };

  // One expansion of the preview pattern feeds BOTH the calendar and the
  // OPEN THIS WEEK rows (superset shape) so the two can't drift.
  const expandPreviewSlots = () => p.availability.flatMap(([day, date, times, iso, month]) =>
    times.filter((x) => x && x !== '--').map((time) => ({ day, date, time, iso, month, weekday: new Date(`${iso}T00:00:00`).getDay() })));

  if (showCal) {
    return <BSCoachAvailabilityCalendar coach={coach} roleColor={roleColor} open={introClosed ? [] : realAvail != null ? realAvail : (liveTimes ? [] : expandPreviewSlots())} demo={!introClosed && !liveTimes && realAvail == null} note={introClosed ? null : timesNote} onRetry={!introClosed && timesPending && availState === 'failed' ? retryTimes : null} onBack={() => setShowCal(false)} onPick={(s) => { setShowCal(false); const d = new Date(`${s.iso}T00:00:00`); selectSlot(BSM_DAYS3[d.getDay()], String(d.getDate()), s.time, s.iso, BSM_MONTHS3[d.getMonth()], s.at); }} />;
  }

  // THE FULL PROFILE → the coach's profile (BSPublicProfile: the coach profile, a trainer's or a
  // nutritionist's), when this listing was opened on its own.
  if (showProfile && window.BSPublicProfile) {
    const Living = window.BSPublicProfile;
    const person = {
      // The marketplace's coach person: with no account, the profile reads this listing by its id.
      ...bsmCoachPerson(coach, photo, isNutriDetail),
      who: coach.name, kind: isNutriDetail ? 'NUTRI' : 'TRAINER',
      userId: coach.provider_user_id || null, city: coach.loc || coach.city || '',
      bio: coach.bio || '', init: coach.init || (coach.name ? coach.name[0] : '?'),
      tier: coach.tier || null, public: true,
      // "Book intro" on the profile opens this listing's own calendar: an intro is booked
      // at a time the coach offers, and the profile has no slot to send (it used to call the
      // booking with none, which failed every time).
      // introsAtCapacity: the coach's own setting, so the profile offers the intro at capacity when
      // this listing does (Codex on #2375).
      commerce: { coach, role: saleProviderRole, packages: p.packages, atCapacity, introsAtCapacity: introsAtCap, bookIntro: () => { setShowProfile(false); setShowCal(true); } },
    };
    return <Living person={person} onBack={() => setShowProfile(false)} onListing={() => setShowProfile(false)} onMessage={(pp) => { setShowProfile(false); if (goChat) goChat((pp && pp.who) || coach.name, isNutriDetail ? 'Nutritionist' : 'Trainer'); }} />;
  }

  const fmtSlot = bsFmtSlot12;
  // One slot list feeds the station AND the calendar: real projected slots for
  // live coaches (realAvail; [] = honestly none), the preview pattern otherwise.
  // ⚠ `at` RIDES ALONG, and with the coach's own date and clock (looked up by it in
  // selectSlot) it is all the booking WRITE may use. The rest are the member's own calendar
  // and clock for display; rebuilding an instant from them discards the coach's zone. Demo
  // rows carry no `at`, and nothing is written for them.
  const projSlotRow = (s) => { const d = new Date(`${s.iso}T00:00:00`); return { day: BSM_DAYS3[s.weekday], date: String(d.getDate()), time: s.time, iso: s.iso, month: BSM_MONTHS3[d.getMonth()], at: s.at }; };
  const allOpenSlots = realAvail != null
    ? realAvail.map(projSlotRow)
    : (liveTimes ? [] : expandPreviewSlots());
  const openSlots = introClosed ? [] : allOpenSlots.slice(0, 3);
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
          <div style={{ margin: '8px 0 2px', display: 'flex', gap: 6, flexWrap:'wrap' }}>
            {media.slice(0, 8).map((m, mi) => (
              <div key={mi} style={{ position: 'relative', flex: 'none', width:m.type==='video'?'100%':64, height:m.type==='video'?'auto':64, minWidth:0, overflow: 'hidden', background: t.PAPER2, border: `1px solid ${t.HAIR}` }}>
                {m.type === 'video'
                  ? <ShapeVideoPlayer value={m}/>
                  : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
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
            {/* trailing: null — a DRILL-IN. The selected coach and the calendar live in
                this component's local state, while the nav descriptor stores only
                marketRole and navResolve clears marketCoach; the settings gear
                early-returns the shell into Settings and unmounts this page, so
                back would land on a fresh directory rather than the listing the
                member left. Passed literally, not behind a flag — a flag on this
                row shipped ignored once already (see bsProMastRow). */}
            {window.BSMastRow ? React.createElement(window.BSMastRow, { trailing: null }) : null}
            {window.BSBackRow ? <window.BSBackRow onBack={onBack} /> : null}
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
                [tr('marketplace:stat.rating', { defaultValue: 'Rating' }), avgRev != null ? `★ ${avgRev.toFixed(1)}/10` : formatCoachRating10(coach, tr)],
              ].map(([l, v]) => (
                <div key={l}>
                  <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', fontWeight: 800, textTransform: 'uppercase', color: t.INK50 }}>{l}</div>
                  <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.05, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
                </div>
              ))}
            </div>
            <div aria-hidden style={{ marginTop: 10, height: 2, background: `linear-gradient(90deg, ${t.INK}, ${roleColor} 72%, transparent)` }} />
            {p.tagline ? <div style={{ marginTop: 13, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15.5, lineHeight: 1.45, color: t.INK70, letterSpacing: '-0.01em' }}>“{p.tagline}”</div> : null}
            {introClosed ? null : <button onClick={openIntro} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 15, padding: 14, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.bookTheIntro', { defaultValue: 'Book the intro · $0' })}</button>}
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
        {introClosed ? (
          <div data-intros-closed="" style={{ padding: '10px 0', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:listing.introsClosed', { defaultValue: "{name} isn't taking new clients right now, so intros are closed. Join the waiting list below.", name: firstName })}</div>
        ) : openSlots.length === 0 ? (
          <div data-times-note={timesPending ? availState : undefined} style={{ padding: '10px 0', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{timesNote || (noZone
            ? tr('marketplace:listing.noTimezone', { defaultValue: "Open hours are set, but their timezone isn't — message {name} to find one.", name: firstName })
            : tr('marketplace:listing.noOpenTimes', { defaultValue: 'No open times this week — message {name} to find one.', name: firstName }))}
            {timesPending && availState === 'failed' ? <button type="button" onClick={retryTimes} style={{ marginLeft: 8, background: 'transparent', border: 0, padding: '2px 0', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${teal}` }}>{tr('marketplace:listing.tryAgain', { defaultValue: 'Try again' })}</button> : null}</div>
        ) : openSlots.map((s, i) => (
          <button key={`${s.iso}-${s.time}`} onClick={() => selectSlot(s.day, s.date, s.time, s.iso, s.month, s.at)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: i ? `1px solid ${t.HAIR}` : 0 }}>
            <span style={{ flexShrink: 0, width: 42, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{s.day}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{fmtSlot(s.time)}</span>
            <Leader />
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK, borderBottom: `2px solid ${teal}`, paddingBottom: 2 }}>{tr('marketplace:slot.holdIt', { defaultValue: 'Hold it →' })}</span>
          </button>
        ))}
        {introClosed ? null : <button onClick={() => setShowCal(true)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: `1px solid ${t.HAIR}` }}>
          <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{tr('marketplace:listing.seeFullCalendar', { defaultValue: 'See the full calendar' })}</span>
          <Leader />
          <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>→</span>
        </button>}
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
              </>) : clientOf === true ? (<>
                {/* A current client at capacity: their sessions and plans below stay open to them. */}
                <div data-client-at-capacity="" style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.GREEN }}>{tr('marketplace:listing.yourClientTitle', { defaultValue: "You're {name}'s client", name: firstName })}</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.45 }}>{tr('marketplace:listing.yourClientBody', { defaultValue: "{name} isn't taking new clients, and you're already one. The sessions and plans below are still yours to buy.", name: firstName })}</div>
              </>) : (<>
                <div style={{ textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.RUST }}>{tr('marketplace:listing.atCapacity', { defaultValue: 'At capacity' })}</div>
                <div style={{ marginTop: 7, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.45 }}>{tr('marketplace:listing.atCapacityBody', { defaultValue: "{name} isn't taking new clients right now. Join the waiting list to be first in line.", name: firstName })}</div>
                {/* Signed in and not read yet: a current client must not be shown Join first. */}
                {bsmAuthUid && clientOf === undefined ? null : <button onClick={wlJoin} style={{ display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 12, minHeight: 44, border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', clipPath: 'polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.joinWaitlist', { defaultValue: 'Join the waiting list' })}</button>}
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
        {/* Write a review — a quiet form by the two-tier rule. Not on your own
            listing: a coach cannot rate themselves, and the server would refuse it. */}
        {!ownListing && <div style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
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
        </div>}
        {coach.ratingLive && revRead && !liveReviews.length && (revLocked && revAgg && revAgg.count > 0 ? (
          <div data-reviews-locked="" style={{ marginTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70 }}>{tr('marketplace:listing.reviewsMembers', { defaultValue: 'Members read the reviews.' })}</div>
            <button onClick={() => { if (window.bsRequireAccount && !window.bsRequireAccount(tr('marketplace:listing.reviewsJoin', { defaultValue: 'read the reviews' }))) return; window.bsStartPlatformCheckout?.(); }} style={{ marginTop: 6, minHeight: 40, padding: 0, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: roleColor }}>{tr('marketplace:listing.reviewsJoinCta', { defaultValue: 'Join to read them' })} →</button>
          </div>
        ) : (
          <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tr('marketplace:listing.noReviews', { defaultValue: 'No reviews yet' })}</div>
        ))}
        {liveReviews.map(rv => (
          <div key={rv.id} style={{ borderLeft: `3px solid ${roleColor}`, padding: '2px 0 2px 12px', marginTop: 14 }}>
            {rv.text ? <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14.5, lineHeight: 1.5, color: t.INK }}>“{rv.text}”</div> : null}
            <div style={{ marginTop: rv.text ? 6 : 0, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{rv.author} · {rv.rating}/10</div>
          </div>
        ))}
        {/* Curated testimonials render UNRATED — only real submitted reviews carry numbers.
            And only on a demo or seeded listing: a coach with an account shows its own
            members' words or nothing, never the house's example quotes. */}
        {!coach.ratingLive && p.reviews.map(([who, body]) => (
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
          <button data-full-profile="" onClick={() => (onProfile ? onProfile() : setShowProfile(true))} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', display: 'flex', alignItems: 'baseline', gap: 9, minHeight: 44, boxSizing: 'border-box', padding: '10px 0', borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{tr('marketplace:listing.fullProfile', { defaultValue: 'The full profile' })}</span>
            <Leader />
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>→</span>
          </button>
        </div>
      ) : null}

      <div style={{ padding: `16px ${t.padX}px 20px` }}>
        {introClosed ? null : <button onClick={openIntro} style={{ display: 'block', width: '100%', boxSizing: 'border-box', minHeight: 50, padding: '15px 10px', border: 0, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, lineHeight: 1.15, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800, clipPath: 'polygon(0 0, calc(100% - 12px) 0, 100% 12px, 100% 100%, 0 100%)' }}>{tr('marketplace:listing.startWith', { defaultValue: 'Start with {name} · free intro →', name: firstName })}</button>}
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
            <div ref={bsDialogRef(() => setOfferSheet(false))} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={tr('marketplace:offer.aria', { defaultValue: "What {name}'s monthly coaching includes", name: firstName })} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '78%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(18px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }} className="bs-hide-scroll">
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
        code={checkoutCode}
        onCode={setCheckoutCode}
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

