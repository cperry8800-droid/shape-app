export type ProviderRole = 'trainer' | 'nutritionist';

export type SubscriptionInput = {
  client_id: string;
  status: string;
  price_cents: number | null;
  created_at: string;
};

export type ClientIntakeInput = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  workout_frequency: string | null;
  dietary: string | null;
};

export type ClientRosterRecord = {
  id: string;
  slug: string;
  name: string;
  initials: string;
  color: string;
  plan: string;
  tier: string;
  streak: string;
  adherence: string;
  mrrCents: number;
  revenueCents: number;
  location: string;
  trend: number[];
  status: 'ok' | 'flag' | 'new' | 'pr';
  lastSeen: string;
  riskReason: string;
  nextAction: string;
  timeline: Array<{ label: string; detail: string }>;
};

const trainerTemplates = [
  {
    name: 'Elena Rivera',
    plan: 'Hybrid cut',
    tier: 'Peak - 2,108',
    streak: '30d',
    adherence: '98%',
    location: 'Brooklyn',
    trend: [0.5, 0.6, 0.7, 0.6, 0.8, 0.85, 0.9],
    status: 'ok' as const,
    lastSeen: 'Just now',
    riskReason: 'Strong compliance. Keep the current progression steady.',
    nextAction: 'Send weekly check-in and confirm next load bump.',
  },
  {
    name: 'Marcus Johnson',
    plan: 'Strength',
    tier: 'Tempo - 1,412',
    streak: '18d',
    adherence: '94%',
    location: 'Remote',
    trend: [0.4, 0.5, 0.6, 0.5, 0.7, 0.8, 0.75],
    status: 'pr' as const,
    lastSeen: '2h ago',
    riskReason: 'Hit a press PR this week. Recovery still green.',
    nextAction: 'Send a PR note and keep the top set unchanged.',
  },
  {
    name: 'Priya Shah',
    plan: 'Fat loss 101',
    tier: 'Tempo - 1,284',
    streak: '14d',
    adherence: '89%',
    location: 'Remote',
    trend: [0.4, 0.3, 0.5, 0.4, 0.6, 0.5, 0.7],
    status: 'ok' as const,
    lastSeen: '4h ago',
    riskReason: 'Training is consistent. Monday nutrition was light.',
    nextAction: 'Ask for one food log note before next session.',
  },
  {
    name: 'Jonah Weiss',
    plan: 'Marathon base',
    tier: 'Tempo - 980',
    streak: '7d',
    adherence: '78%',
    location: 'Remote',
    trend: [0.4, 0.5, 0.45, 0.6, 0.5, 0.7, 0.6],
    status: 'flag' as const,
    lastSeen: '1d ago',
    riskReason: 'Missed last lift and sleep was below target twice.',
    nextAction: 'Message before the next run and reduce accessory volume.',
  },
  {
    name: 'Ana Park',
    plan: 'Intro strength',
    tier: 'Raw - 412',
    streak: '1d',
    adherence: '-',
    location: 'Remote',
    trend: [0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.2],
    status: 'new' as const,
    lastSeen: 'New',
    riskReason: 'New intake. Needs first week expectations confirmed.',
    nextAction: 'Open the intake and send the first-session brief.',
  },
  {
    name: 'Deandre Kim',
    plan: 'Mass phase',
    tier: 'Peak - 1,820',
    streak: '22d',
    adherence: '94%',
    location: 'Brooklyn',
    trend: [0.5, 0.6, 0.55, 0.7, 0.65, 0.8, 0.75],
    status: 'ok' as const,
    lastSeen: '2d ago',
    riskReason: 'High adherence and stable body weight trend.',
    nextAction: 'Advance lower-body loads next week if RPE holds.',
  },
];

const nutritionTemplates = [
  {
    name: 'Elena Rivera',
    plan: 'Performance fuel',
    tier: 'Peak - 2,108',
    streak: '30d',
    adherence: '96%',
    location: 'Brooklyn',
    trend: [0.5, 0.6, 0.7, 0.6, 0.8, 0.85, 0.9],
    status: 'ok' as const,
    lastSeen: 'Just now',
    riskReason: 'Protein and calories are consistently on target.',
    nextAction: 'Send next week race-day carb note.',
  },
  {
    name: 'Marcus Larson',
    plan: 'Protein-led cut',
    tier: 'Tempo - 1,140',
    streak: '18d',
    adherence: '82%',
    location: 'Remote',
    trend: [0.5, 0.4, 0.6, 0.5, 0.4, 0.5, 0.45],
    status: 'flag' as const,
    lastSeen: '2h ago',
    riskReason: 'Macros were 30% under target for two days.',
    nextAction: 'Simplify dinner options and message the trainer.',
  },
  {
    name: 'Priya Shah',
    plan: 'Performance fuel',
    tier: 'Tempo - 1,284',
    streak: '14d',
    adherence: '89%',
    location: 'Remote',
    trend: [0.4, 0.3, 0.5, 0.4, 0.6, 0.5, 0.7],
    status: 'ok' as const,
    lastSeen: '4h ago',
    riskReason: 'Good food-log rhythm. Carbs are low before training.',
    nextAction: 'Add pre-lift carb reminder.',
  },
  {
    name: 'Jonah Weiss',
    plan: 'Race-day fueling',
    tier: 'Tempo - 980',
    streak: '7d',
    adherence: '78%',
    location: 'Remote',
    trend: [0.4, 0.5, 0.45, 0.6, 0.5, 0.7, 0.6],
    status: 'flag' as const,
    lastSeen: '1d ago',
    riskReason: 'Long-run fueling was skipped twice this week.',
    nextAction: 'Send the race-week template and ask for route timing.',
  },
  {
    name: 'Ana Park',
    plan: 'Intake - new',
    tier: 'Raw - 412',
    streak: '1d',
    adherence: '-',
    location: 'Remote',
    trend: [0.1, 0.1, 0.1, 0.2, 0.1, 0.1, 0.2],
    status: 'new' as const,
    lastSeen: 'New',
    riskReason: 'New intake. Needs first meal-plan preferences reviewed.',
    nextAction: 'Open allergies and budget notes before drafting.',
  },
];

const colors = ['#ef6d4a', '#5b8def', '#d99b22', '#65b96e', '#8c6fa8', '#2ee0c4'];

export function buildClientRoster(
  role: ProviderRole,
  subscriptions: SubscriptionInput[],
  intakesById: Record<string, ClientIntakeInput | undefined> = {}
): ClientRosterRecord[] {
  const templates = role === 'nutritionist' ? nutritionTemplates : trainerTemplates;
  const source = subscriptions.length > 0 ? subscriptions : templates.map((_, index) => ({
    client_id: `demo-${index}`,
    status: 'active',
    price_cents: role === 'nutritionist' ? 16000 + (index % 2) * 2000 : 18000 + (index % 3) * 2000,
    created_at: new Date(Date.now() - (index + 2) * 30 * 24 * 60 * 60 * 1000).toISOString(),
  }));

  return source.map((subscription, index) => {
    const template = templates[index % templates.length];
    const intake = intakesById[subscription.client_id];
    const name = fullName(intake) || template.name;
    const monthlyCents = subscription.price_cents ?? (role === 'nutritionist' ? 16000 : 18000);
    const months = monthsSince(subscription.created_at);

    return {
      id: subscription.client_id,
      slug: slugify(name),
      name,
      initials: initialsFor(name),
      color: colors[index % colors.length],
      plan: intake?.primary_goal || template.plan,
      tier: template.tier,
      streak: template.streak,
      adherence: template.adherence,
      mrrCents: monthlyCents,
      revenueCents: monthlyCents * months,
      location: template.location,
      trend: template.trend,
      status: template.status,
      lastSeen: template.lastSeen,
      riskReason: template.riskReason,
      nextAction: template.nextAction,
      timeline: buildTimeline(role, template),
    };
  });
}

export function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}

export function findClientTemplate(slug: string): ClientRosterRecord {
  const rows = buildClientRoster('trainer', []);
  return rows.find((row) => row.slug === slug) ?? {
    ...rows[0],
    id: slug,
    slug,
    name: titleFromSlug(slug),
    initials: initialsFor(titleFromSlug(slug)),
  };
}

function buildTimeline(role: ProviderRole, template: { status: string; riskReason: string }) {
  return role === 'nutritionist'
    ? [
        { label: 'Today', detail: template.riskReason },
        { label: 'Yesterday', detail: 'Logged 4 meals and hit protein target.' },
        { label: 'This week', detail: 'Macro adherence reviewed for coach handoff.' },
      ]
    : [
        { label: 'Today', detail: template.riskReason },
        { label: 'Last session', detail: 'Completed programmed work with editable set logs.' },
        { label: 'This week', detail: template.status === 'flag' ? 'Needs coach follow-up.' : 'Progression is on schedule.' },
      ];
}

function fullName(intake?: ClientIntakeInput) {
  if (!intake) return '';
  return [intake.first_name, intake.last_name].filter(Boolean).join(' ').trim();
}

function initialsFor(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'C';
}

function titleFromSlug(slug: string) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ') || 'Client';
}

function monthsSince(dateText: string) {
  const created = new Date(dateText).getTime();
  if (Number.isNaN(created)) return 1;
  const monthMs = 1000 * 60 * 60 * 24 * 30;
  return Math.max(1, Math.ceil((Date.now() - created) / monthMs));
}
