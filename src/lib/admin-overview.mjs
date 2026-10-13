// src/lib/admin-overview.mjs
//
// The admin console's Overview, as data: the JSON admin_overview_stats() returns
// (supabase-migrations/2026-10-13-staff-access-and-admin-stats.sql) turned into the sections,
// tiles and 30-day columns the page draws. Pure, so tests/admin-console.test.mjs drives it with
// the replica's output and the page only renders what this hands it.
//
// Every tile says what it counts, because "members" means three different things on Shape
// (an account, an account with the member role, a paying member) and the page must not let one
// pass for another.

const n = (v) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

export function formatCount(v) {
  return Math.round(n(v)).toLocaleString('en-US');
}

/** Cents as dollars: whole dollars when there are no cents, two places when there are. */
export function formatMoney(cents) {
  const c = Math.round(n(cents));
  const dollars = c / 100;
  return dollars.toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: c % 100 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** Shape's own monthly recurring revenue: memberships plus Shape's cut of coach subscriptions. */
export function shapeMrrCents(stats) {
  return n(stats?.memberships?.mrr_cents) + n(stats?.coach_subs?.shape_mrr_cents);
}

const tile = (label, value, sub = '', href = '') => ({ label, value, sub, href });

/** "1 review", "2 reviews", "1,204 reviews". */
export function countOf(v, one, many = `${one}s`) {
  return `${formatCount(v)} ${Math.round(n(v)) === 1 ? one : many}`;
}

// ── Shape Score tiers ──
// The ladder award_tier_bonuses() unlocks on (supabase-migrations/2026-10-12-shape-score-fixes.sql),
// on the rank basis (shape_rank_points). Members and coaches climb the same rungs under their own
// names (src/lib/ai/shapeKnowledge.mjs: "Coaches climb the same rungs as Certified, Pro, Elite,
// Master and Icon").
export const TIER_THRESHOLDS = [0, 750, 2000, 5000, 15000];
export const MEMBER_TIERS = ['Raw', 'Tempo', 'Form', 'Peak', 'Legend'];
export const COACH_TIERS = ['Certified', 'Pro', 'Elite', 'Master', 'Icon'];

export function tierIndex(points) {
  const p = n(points);
  let i = 0;
  for (let k = 0; k < TIER_THRESHOLDS.length; k++) if (p >= TIER_THRESHOLDS[k]) i = k;
  return i;
}

export function tierName(points, coach = false) {
  return (coach ? COACH_TIERS : MEMBER_TIERS)[tierIndex(points)];
}

/** The tier counts as rows: { name, from, count } per rung, for members and for coaches. */
export function tierBreakdown(stats) {
  const rows = (counts, names) =>
    names.map((name, i) => ({ name, from: TIER_THRESHOLDS[i], count: n(Array.isArray(counts) ? counts[i] : 0) }));
  return {
    members: rows(stats?.score?.member_tiers, MEMBER_TIERS),
    coaches: rows(stats?.score?.coach_tiers, COACH_TIERS),
  };
}

/** Whole days from `iso` to `now` (0 for a missing or future date). */
export function daysSince(iso, now) {
  const t = Date.parse(iso ?? '');
  const at = Date.parse(now ?? '');
  if (!Number.isFinite(t) || !Number.isFinite(at)) return 0;
  return Math.max(0, Math.floor((at - t) / 86400000));
}

export function overviewSections(stats) {
  const s = stats || {};
  const a = s.accounts || {};
  const r = s.roles || {};
  const l = s.listings || {};
  const ap = s.applications || {};
  const cr = s.credentials || {};
  const m = s.memberships || {};
  const cs = s.coach_subs || {};
  const p = s.purchases || {};
  const cn = s.consultations || {};
  const sc = s.score || {};
  const ls = s.lists || {};
  const act = s.activity || {};
  const q = s.queues || {};
  const oldestDays = daysSince(ap.oldest_open_at, s.generated_at);
  const kinds = Object.entries(sc.by_category_30d || {}).sort((x, y) => n(y[1]) - n(x[1]));
  const categories = kinds.map(([k, v]) => `${k} ${formatCount(v)}`).join(' · ');

  return [
    {
      key: 'people',
      title: 'People',
      note: 'Accounts are sign-ins. Active means they did something: earned points, logged a workout or a day, opened the app, sent a message or posted.',
      tiles: [
        tile('Accounts', formatCount(a.total), `${formatCount(a.confirmed)} confirmed their email`),
        tile('New accounts, 7 days', formatCount(a.new_7d), `${formatCount(a.new_30d)} in 30 days`),
        tile('Active, 7 days', formatCount(act.active_7d), `${formatCount(act.active_30d)} in 30 days`),
        tile('Signed in, 7 days', formatCount(a.signed_in_7d), `${formatCount(a.signed_in_30d)} in 30 days`),
        tile('Member role', formatCount(r.client), 'accounts that can use the member app', '/admin/members'),
        tile('Trainer role', formatCount(r.trainer), '', '/admin/coaches'),
        tile('Nutritionist role', formatCount(r.nutritionist), '', '/admin/coaches'),
      ],
    },
    {
      key: 'money',
      title: 'Money',
      note: 'From Shape’s own records, which Stripe keeps current. Payouts, disputes, refunds and tax are in the Stripe dashboard.',
      tiles: [
        tile('Shape’s monthly recurring revenue', formatMoney(shapeMrrCents(s)), 'memberships plus Shape’s cut of coach subscriptions'),
        tile('Paying members', formatCount(m.active), `${formatMoney(m.mrr_cents)} a month`),
        tile('On a free trial', formatCount(m.trialing)),
        tile('Payment failing', formatCount(m.past_due), 'past due or unpaid'),
        tile('Canceled memberships', formatCount(m.canceled), `${countOf(m.new_30d, 'membership')} started in 30 days`),
        tile('Coach subscriptions', formatCount(cs.active), `${formatMoney(cs.gross_mrr_cents)} a month to coaches; Shape keeps ${formatMoney(cs.shape_mrr_cents)}`),
        tile('One-time purchases, 30 days', formatCount(p.paid_30d), `${formatMoney(p.gross_30d_cents)}; Shape kept ${formatMoney(p.shape_30d_cents)}`),
        tile('One-time purchases, all time', formatCount(p.paid_all), `${formatMoney(p.gross_all_cents)}; Shape kept ${formatMoney(p.shape_all_cents)}`),
      ],
    },
    {
      key: 'applications',
      title: 'Coach applications',
      note: 'Every application to coach on Shape, by where it stands.',
      tiles: [
        tile('Waiting for review', formatCount(ap.open), `${countOf(ap.open_trainer, 'trainer')} · ${countOf(ap.open_nutritionist, 'nutritionist')}`, '/dashboard/applications'),
        tile('Oldest waiting', ap.oldest_open_at ? countOf(oldestDays, 'day') : 'None', ap.oldest_open_at ? 'since it was sent' : 'nothing waiting'),
        tile('New, 7 days', formatCount(ap.new_7d), `${formatCount(ap.new_30d)} in 30 days · ${formatCount(ap.total)} ever`),
        tile('Approved', formatCount(ap.approved), `${formatCount(ap.approved_30d)} in 30 days`),
        tile('Rejected', formatCount(ap.rejected), `${formatCount(ap.rejected_30d)} in 30 days`),
        tile('Withdrawn', formatCount(ap.withdrawn)),
        tile('Credentials to review', formatCount(cr.pending), `${formatCount(cr.approved)} approved · ${formatCount(cr.changes_requested)} asked for changes`, '/dashboard/credentials'),
      ],
    },
    {
      key: 'coaches',
      title: 'Coach listings',
      note: 'Listings on coaches’ own accounts. A listing goes live once it has a price, a photo and active payouts.',
      tiles: [
        tile('Live listings', formatCount(n(l.trainers_live) + n(l.nutritionists_live)), `${countOf(l.trainers_live, 'trainer')} · ${countOf(l.nutritionists_live, 'nutritionist')}`, '/admin/coaches'),
        tile('Not live yet', formatCount(n(l.trainers_hidden) + n(l.nutritionists_hidden)), 'approved, still missing a price, photo or payouts', '/admin/coaches'),
        tile('Verified', formatCount(l.verified)),
        tile('Shape’s own listings', formatCount(l.shape_own), 'the example coaches, not real accounts'),
      ],
    },
    {
      key: 'consultations',
      title: 'Consultations and sessions',
      note: 'Free consultations and session requests members send coaches, by where they stand.',
      tiles: [
        tile('Waiting on a coach', formatCount(cn.open), 'requested, not yet answered'),
        tile('Requested, 7 days', formatCount(cn.requested_7d), `${formatCount(cn.requested_30d)} in 30 days`),
        tile('Coming up', formatCount(cn.upcoming), 'confirmed'),
        tile('Done, 30 days', formatCount(cn.completed_30d)),
        tile('Declined, 30 days', formatCount(cn.declined_30d), `${formatCount(cn.cancelled_30d)} cancelled`),
        tile('Never answered', formatCount(cn.expired_open), 'requested, and the time has passed'),
      ],
    },
    {
      key: 'score',
      title: 'Shape Score',
      note: 'Points members and coaches earn for what they do. Tiers are below.',
      tiles: [
        tile('Points earned, 7 days', formatCount(sc.earned_7d), `${formatCount(sc.earned_30d)} in 30 days`),
        tile('Points earned, all time', formatCount(sc.earned_all), 'tier bonuses included'),
        tile('Earning, 30 days', formatCount(sc.earners_30d), 'accounts that earned points'),
        tile('Spent in the Store', formatCount(sc.spent_store_all), 'points, all time'),
        tile('Taken back, 30 days', formatCount(sc.penalties_30d), 'penalties'),
        tile('Most points from, 30 days', kinds.length ? kinds[0][0] : 'None yet', categories),
      ],
    },
    {
      key: 'activity',
      title: 'Activity',
      note: 'Across the website and the app.',
      tiles: [
        tile('Workouts logged, 7 days', formatCount(act.workouts_7d), `${formatCount(act.workouts_30d)} in 30 days · ${formatCount(act.workouts_all)} all time`),
        tile('Days with meals logged, 7 days', formatCount(act.meal_days_7d), `${formatCount(act.meal_days_30d)} in 30 days`),
        tile('Check-ins, 30 days', formatCount(act.checkins_30d)),
        tile('Community posts, 30 days', formatCount(act.posts_30d)),
        tile('Messages, 30 days', formatCount(act.messages_30d)),
      ],
    },
    {
      key: 'lists',
      title: 'Sign-up lists and messages',
      note: 'The other ways people reach Shape.',
      tiles: [
        tile('App launch sign-ups', formatCount(ls.app_launch_all), `${formatCount(ls.app_launch_30d)} in 30 days`),
        tile('Contact form, 30 days', formatCount(ls.contact_30d), `${formatCount(ls.contact_all)} ever`),
        tile('On a coach’s waitlist', formatCount(ls.waitlist_waiting), `${formatCount(ls.waitlist_30d)} joined in 30 days`),
        tile('Consultation form, 30 days', formatCount(ls.consultations_30d), 'the older booking form'),
        tile('Help requests, 30 days', formatCount(ls.help_30d), 'sent from Nora’s chat'),
      ],
    },
    {
      key: 'queues',
      title: 'Waiting on the team',
      note: '',
      tiles: [
        tile('Help requests open', formatCount(q.help_open), '', '/dashboard/support'),
        tile('Refunds pending', formatCount(q.refunds_pending), '', '/dashboard/refunds'),
        tile('Credentials to review', formatCount(q.credentials_pending), '', '/dashboard/credentials'),
        tile('Applications to review', formatCount(ap.open), '', '/dashboard/applications'),
      ],
    },
  ];
}

export const DAILY_CHARTS = [
  { key: 'signups', title: 'New accounts a day' },
  { key: 'active', title: 'Active accounts a day' },
  { key: 'workouts', title: 'Workouts logged a day' },
  { key: 'applications', title: 'Coach applications a day' },
];

/** A clean top for the y axis: the smallest of 1, 2, 5 x 10^k at or above the max (at least 1). */
export function niceMax(max) {
  const m = Math.max(1, n(max));
  const pow = 10 ** Math.floor(Math.log10(m));
  for (const step of [1, 2, 5, 10]) if (step * pow >= m) return step * pow;
  return 10 * pow;
}

/**
 * The columns of one 30-day chart, in a `width` x `height` box: each day's x, width and the
 * column's top (y) and height, plus the axis top. Columns are at most 24 wide with a 2px gap,
 * grow from the baseline, and a zero day has no column (height 0).
 */
export function dailyColumns(daily, key, { width = 600, height = 120 } = {}) {
  const rows = Array.isArray(daily) ? daily : [];
  const values = rows.map((d) => Math.max(0, n(d?.[key])));
  const top = niceMax(Math.max(0, ...values));
  const slot = rows.length ? width / rows.length : width;
  const w = Math.max(1, Math.min(24, slot - 2));
  const cols = rows.map((d, i) => {
    const v = values[i];
    const h = (v / top) * height;
    return { day: String(d?.day ?? ''), value: v, x: i * slot + (slot - w) / 2, w, y: height - h, h };
  });
  return { top, total: values.reduce((t, v) => t + v, 0), cols };
}
