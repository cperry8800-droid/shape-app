import { useEffect, useState } from 'react';
import { Card, Eyebrow, Row, ScreenTitle, SecondaryAction, Sub, Title, screenTopStyle } from '../components/ui';
import { supabase } from '../lib/supabase';

type Intake = {
  first_name: string | null;
  last_name: string | null;
  primary_goal: string | null;
  experience_level: string | null;
  workout_frequency: string | null;
  dietary: string | null;
};

type ProviderRole = 'trainer' | 'nutritionist';

type ProviderRow = {
  role: ProviderRole;
  id: number;
  name: string;
  subscribers: number | null;
};

type SubscriptionRow = {
  id: string;
  client_id: string;
  status: string;
  price_cents: number | null;
  created_at: string;
};

type ProviderDashboard = {
  provider: ProviderRow;
  subscriptions: SubscriptionRow[];
};

const moneyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  maximumFractionDigits: 0,
});

const payoutDateFormatter = new Intl.DateTimeFormat('en-US', {
  month: 'short',
  day: 'numeric',
});

export default function Me() {
  const [email, setEmail] = useState<string | null>(null);
  const [intake, setIntake] = useState<Intake | null>(null);
  const [providerDashboards, setProviderDashboards] = useState<ProviderDashboard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { data: userResp } = await supabase.auth.getUser();
        const user = userResp.user;
        if (!user) return;

        if (!cancelled) setEmail(user.email ?? null);
        const [intakeResult, providers] = await Promise.all([
          supabase
            .from('client_intakes')
            .select('first_name, last_name, primary_goal, experience_level, workout_frequency, dietary')
            .eq('user_id', user.id)
            .maybeSingle(),
          loadProviderDashboards(user.id),
        ]);

        if (cancelled) return;
        if (intakeResult.error) {
          setError(intakeResult.error.message);
        } else {
          setIntake(intakeResult.data);
        }
        setProviderDashboards(providers);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <div style={screenTopStyle}>
      <ScreenTitle>Me</ScreenTitle>

      {loading && <p style={{ color: 'var(--muted)', fontSize: 14 }}>Loading...</p>}
      {error && <p style={{ color: '#ef4444', fontSize: 13 }}>{error}</p>}

      {!loading && (
        <>
          <Card>
            <Eyebrow>ACCOUNT</Eyebrow>
            <Title>{email ?? 'Signed out'}</Title>
          </Card>

          {intake ? (
            <Card>
              <Eyebrow>INTAKE</Eyebrow>
              <Title>{[intake.first_name, intake.last_name].filter(Boolean).join(' ') || 'Profile'}</Title>
              <Row label="Goal" value={intake.primary_goal} />
              <Row label="Experience" value={intake.experience_level} />
              <Row label="Frequency" value={intake.workout_frequency} />
              <Row label="Dietary" value={intake.dietary} />
            </Card>
          ) : (
            <Card>
              <Eyebrow>INTAKE</Eyebrow>
              <Title>No intake yet</Title>
              <p style={{ color: 'var(--muted)', fontSize: 13, marginTop: 8 }}>
                Finish onboarding on the web to populate this screen.
              </p>
            </Card>
          )}

          {providerDashboards.map((dashboard) => (
            <ProviderDashboardCard key={`${dashboard.provider.role}-${dashboard.provider.id}`} dashboard={dashboard} />
          ))}

          <SecondaryAction onClick={signOut}>Sign out</SecondaryAction>
        </>
      )}
    </div>
  );
}

async function loadProviderDashboards(userId: string): Promise<ProviderDashboard[]> {
  const [trainerResult, nutritionistResult] = await Promise.all([
    supabase
      .from('trainers')
      .select('id, name, subscribers')
      .eq('owner_id', userId)
      .maybeSingle(),
    supabase
      .from('nutritionists')
      .select('id, name, subscribers')
      .eq('owner_id', userId)
      .maybeSingle(),
  ]);

  const providers: ProviderRow[] = [];
  if (trainerResult.data) {
    const trainer = trainerResult.data as { id: number; name: string; subscribers: number | null };
    providers.push({ ...trainer, role: 'trainer' });
  }
  if (nutritionistResult.data) {
    const nutritionist = nutritionistResult.data as { id: number; name: string; subscribers: number | null };
    providers.push({ ...nutritionist, role: 'nutritionist' });
  }

  const dashboards = await Promise.all(
    providers.map(async (provider) => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('id, client_id, status, price_cents, created_at')
        .eq('provider_role', provider.role)
        .eq('provider_id', provider.id)
        .in('status', ['active', 'trialing', 'past_due'])
        .order('created_at', { ascending: false });

      if (error) {
        console.warn(`[shape-mobile] subscriptions failed for ${provider.role}`, error.message);
        return { provider, subscriptions: [] };
      }

      return {
        provider,
        subscriptions: (data ?? []) as SubscriptionRow[],
      };
    })
  );

  return dashboards;
}

function ProviderDashboardCard({ dashboard }: { dashboard: ProviderDashboard }) {
  const activeSubscriptions = dashboard.subscriptions.filter(
    (subscription) => subscription.status === 'active' || subscription.status === 'trialing'
  );
  const mrrCents = activeSubscriptions.reduce(
    (sum, subscription) => sum + (subscription.price_cents ?? 0),
    0
  );
  const clientRows = activeSubscriptions.slice(0, 4).map((subscription) => {
    const months = Math.max(1, monthsSince(subscription.created_at));
    const monthlyCents = subscription.price_cents ?? 0;
    return {
      id: subscription.client_id.slice(0, 8),
      mrrCents: monthlyCents,
      revenueCents: monthlyCents * months,
    };
  });
  const payoutRows = buildRecentPayoutRows(activeSubscriptions);

  return (
    <Card>
      <Eyebrow>{dashboard.provider.role.toUpperCase()} DASHBOARD</Eyebrow>
      <Title>{dashboard.provider.name}</Title>
      <Sub>Mobile snapshot for subscribers, revenue, and recent Stripe payout cycles.</Sub>

      <div style={metricGridStyle}>
        <Metric label="Active" value={activeSubscriptions.length.toString()} />
        <Metric label="MRR" value={moneyFormatter.format(mrrCents / 100)} />
        <Metric label="Lifetime" value={(dashboard.provider.subscribers ?? 0).toString()} />
      </div>

      <div style={{ marginTop: 16 }}>
        <Eyebrow>RECENT PAYOUTS</Eyebrow>
        {payoutRows.length === 0 ? (
          <Sub>No paid subscription payouts yet.</Sub>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {payoutRows.map((row) => (
              <div key={row.date} style={payoutRowStyle}>
                <span>{row.date}</span>
                <span style={{ color: 'var(--muted)' }}>
                  {row.subscriberCount} {row.subscriberCount === 1 ? 'subscriber' : 'subscribers'}
                </span>
                <strong>{moneyFormatter.format(row.amountCents / 100)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Eyebrow>CLIENT REVENUE</Eyebrow>
        {clientRows.length === 0 ? (
          <Sub>Client MRR and revenue appear here once subscriptions are active.</Sub>
        ) : (
          <div style={{ display: 'grid', gap: 8 }}>
            {clientRows.map((client) => (
              <div key={client.id} style={clientRevenueStyle}>
                <span style={{ fontFamily: 'var(--mono)' }}>{client.id}</span>
                <span>MRR {moneyFormatter.format(client.mrrCents / 100)}</span>
                <strong>{moneyFormatter.format(client.revenueCents / 100)}</strong>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 20, lineHeight: 1 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 6 }}>{label}</div>
    </div>
  );
}

function buildRecentPayoutRows(subscriptions: SubscriptionRow[]) {
  return getRecentTuesdayPayoutDates()
    .map((date) => {
      const cutoff = endOfDay(date).getTime();
      const eligible = subscriptions.filter(
        (subscription) =>
          subscription.status === 'active' &&
          (subscription.price_cents ?? 0) > 0 &&
          new Date(subscription.created_at).getTime() <= cutoff
      );
      return {
        date: payoutDateFormatter.format(date),
        subscriberCount: eligible.length,
        amountCents: eligible.reduce((sum, subscription) => sum + (subscription.price_cents ?? 0), 0),
      };
    })
    .filter((row) => row.subscriberCount > 0);
}

function getRecentTuesdayPayoutDates() {
  const dates: Date[] = [];
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  const daysSinceTuesday = (date.getDay() - 2 + 7) % 7;
  date.setDate(date.getDate() - daysSinceTuesday);

  for (let index = 0; index < 4; index += 1) {
    const payoutDate = new Date(date);
    payoutDate.setDate(date.getDate() - index * 7);
    dates.push(payoutDate);
  }

  return dates;
}

function endOfDay(date: Date) {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

function monthsSince(dateText: string) {
  const created = new Date(dateText).getTime();
  if (Number.isNaN(created)) return 1;
  const monthMs = 1000 * 60 * 60 * 24 * 30;
  return Math.ceil((Date.now() - created) / monthMs);
}

const metricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  marginTop: 16,
};

const payoutRowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  gap: 8,
  alignItems: 'center',
  padding: '10px 0',
  borderBottom: '1px solid var(--border)',
  fontSize: 13,
};

const clientRevenueStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr auto auto',
  gap: 8,
  alignItems: 'center',
  padding: 10,
  border: '1px solid var(--border)',
  borderRadius: 12,
  fontSize: 12,
};
