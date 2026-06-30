// src/lib/funnel.mjs
// Pure funnel shaping + the analytics event whitelist. No I/O. The SQL
// get_funnel() returns raw per-step counts; this turns them into display rows
// with drop-off % and flags the single biggest drop. Mirror of the SQL event
// whitelist in 2026-06-23-analytics-events.sql — keep the two in sync.

export const FUNNEL_STEPS = [
  { key: 'signup', label: 'Signed up' },
  { key: 'onboarding', label: 'Completed onboarding' },
  { key: 'first_workout', label: 'Logged 1st workout' },
  { key: 'first_nutrition', label: 'Logged 1st nutrition' },
  { key: 'paid', label: 'Paid subscriber' },
  { key: 'day30', label: 'Day-30 retained' },
  { key: 'day90', label: 'Day-90 retained' },
];

export const ANALYTICS_EVENTS = [
  'onboarding_started', 'app_opened', 'workout_started', 'paywall_viewed', 'checkout_started',
];

export function isAnalyticsEvent(name) {
  return typeof name === 'string' && ANALYTICS_EVENTS.includes(name);
}

function pct(n, d) {
  if (!d || d <= 0) return 0;
  return Math.round((n / d) * 100);
}

export function buildFunnel(counts) {
  const c = counts || {};
  const signup = Number(c.signup) || 0;
  const rows = FUNNEL_STEPS.map((step, i) => {
    const count = Number(c[step.key]) || 0;
    const prev = i === 0 ? count : (Number(c[FUNNEL_STEPS[i - 1].key]) || 0);
    const dropped = i === 0 ? 0 : Math.max(prev - count, 0);
    return {
      key: step.key,
      label: step.label,
      count,
      pctOfSignup: pct(count, signup),
      pctDrop: i === 0 ? 0 : pct(dropped, prev),
      isBiggestDrop: false,
    };
  });
  let maxIdx = -1, maxDrop = 0;
  rows.forEach((r, i) => { if (i > 0 && r.pctDrop > maxDrop) { maxDrop = r.pctDrop; maxIdx = i; } });
  if (maxIdx >= 0) rows[maxIdx].isBiggestDrop = true;
  return rows;
}
