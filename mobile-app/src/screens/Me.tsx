import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Card, Eyebrow, Row, ScreenTitle, SecondaryAction, Sub, Title, screenTopStyle } from '../components/ui';
import { supabase } from '../lib/supabase';
import {
  buildClientRoster,
  type ClientIntakeInput,
  type ClientRosterRecord,
} from '../lib/clientRoster';
import {
  createRadioRoom,
  fetchRadioRooms,
  formatRadioRoomWhen,
  radioAudienceLabel,
  type RadioRoom,
} from '../lib/radioRooms';

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
  intakesById: Record<string, ClientIntakeInput | undefined>;
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
        return { provider, subscriptions: [], intakesById: {} };
      }

      const subscriptions = (data ?? []) as SubscriptionRow[];
      const clientIds = subscriptions.map((subscription) => subscription.client_id);
      const intakesById: Record<string, ClientIntakeInput | undefined> = {};

      if (clientIds.length > 0) {
        const { data: intakes, error: intakeError } = await supabase
          .from('client_intakes')
          .select('user_id, first_name, last_name, primary_goal, experience_level, workout_frequency, dietary')
          .in('user_id', clientIds);

        if (intakeError) {
          console.warn(`[shape-mobile] client intake lookup failed for ${provider.role}`, intakeError.message);
        } else {
          ((intakes ?? []) as ClientIntakeInput[]).forEach((intake) => {
            intakesById[intake.user_id] = intake;
          });
        }
      }

      return {
        provider,
        subscriptions,
        intakesById,
      };
    })
  );

  return dashboards;
}

function ProviderDashboardCard({ dashboard }: { dashboard: ProviderDashboard }) {
  const [selectedClient, setSelectedClient] = useState<ClientRosterRecord | null>(null);
  const [radioRooms, setRadioRooms] = useState<RadioRoom[]>([]);
  const [radioFormOpen, setRadioFormOpen] = useState(false);
  const [radioSaving, setRadioSaving] = useState(false);
  const [radioError, setRadioError] = useState<string | null>(null);
  const [radioDraft, setRadioDraft] = useState(() => nextRadioRoomDraft(dashboard.provider.role));
  const activeSubscriptions = dashboard.subscriptions.filter(
    (subscription) => subscription.status === 'active' || subscription.status === 'trialing'
  );
  const mrrCents = activeSubscriptions.reduce(
    (sum, subscription) => sum + (subscription.price_cents ?? 0),
    0
  );
  const clientRows = buildClientRoster(dashboard.provider.role, activeSubscriptions, dashboard.intakesById);
  const payoutRows = buildRecentPayoutRows(activeSubscriptions);
  const analytics = buildAnalyticsSignals(clientRows);

  useEffect(() => {
    let cancelled = false;
    fetchRadioRooms(dashboard.provider.role)
      .then((rooms) => {
        if (!cancelled) setRadioRooms(rooms);
      })
      .catch((err) => {
        if (!cancelled) setRadioError(err.message || 'Could not load radio rooms.');
      });
    return () => {
      cancelled = true;
    };
  }, [dashboard.provider.role]);

  async function saveRadioRoom() {
    setRadioSaving(true);
    setRadioError(null);
    try {
      const room = await createRadioRoom({
        role: dashboard.provider.role,
        ...radioDraft,
      });
      setRadioRooms((current) => [room, ...current.filter((item) => item.id !== room.id)]);
      setRadioFormOpen(false);
      setRadioDraft(nextRadioRoomDraft(dashboard.provider.role));
    } catch (err) {
      setRadioError(err instanceof Error ? err.message : 'Could not save radio room.');
    } finally {
      setRadioSaving(false);
    }
  }

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
        <Eyebrow>CLIENT ROSTER</Eyebrow>
        {clientRows.length === 0 ? (
          <Sub>Client previews appear here once subscriptions are active.</Sub>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {clientRows.map((client) => (
              <button
                key={client.id}
                type="button"
                style={clientRosterButtonStyle}
                onClick={() => setSelectedClient(client)}
              >
                <span style={{ ...clientAvatarStyle, background: client.color }}>{client.initials}</span>
                <span style={{ minWidth: 0 }}>
                  <strong style={clientNameStyle}>{client.name}</strong>
                  <span style={clientMetaStyle}>{client.plan} - {client.tier}</span>
                </span>
                <span style={clientMoneyStyle}>
                  <strong>{moneyFormatter.format(client.mrrCents / 100)}/mo</strong>
                  <span>{moneyFormatter.format(client.revenueCents / 100)} total</span>
                </span>
                <Sparkline points={client.trend} />
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Eyebrow>ANALYTICS PRO</Eyebrow>
        <Sub>Revenue/client, adherence correlations, and at-risk priority queue.</Sub>
        <div style={analyticsGridStyle}>
          <Metric label="Revenue/client" value={moneyFormatter.format(analytics.revenuePerClient)} />
          <Metric label="Avg adherence" value={`${analytics.avgAdherence}%`} />
          <Metric label="At-risk" value={analytics.atRisk.length.toString()} />
        </div>
        <div style={analyticsPanelStyle}>
          <strong style={{ fontSize: 12, letterSpacing: '0.06em' }}>Correlation readout</strong>
          <p style={{ margin: '6px 0 0', color: 'var(--muted)', fontSize: 12.5, lineHeight: 1.45 }}>
            {analytics.correlation}
          </p>
        </div>
        {analytics.atRisk.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginTop: 10 }}>
            {analytics.atRisk.slice(0, 3).map((client) => (
              <button
                key={`risk-${client.id}`}
                type="button"
                style={atRiskRowStyle}
                onClick={() => setSelectedClient(client)}
              >
                <span>
                  <strong style={{ display: 'block', fontSize: 13.5 }}>{client.name}</strong>
                  <span style={{ color: 'var(--muted)', fontSize: 12 }}>
                    {client.adherence} adherence · {client.streak} streak
                  </span>
                </span>
                <span style={{ color: '#fca5a5', fontSize: 11, letterSpacing: '0.08em' }}>REVIEW</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginTop: 16 }}>
        <Eyebrow>SHAPE RADIO ROOMS</Eyebrow>
        <Sub>Schedule client and coach audio rooms. Rooms sync with the website.</Sub>

        {radioRooms.slice(0, 2).map((room) => (
          <div key={room.id} style={radioRoomStyle}>
            <strong>{room.topic}</strong>
            <span>{formatRadioRoomWhen(room)}</span>
            <span>{radioAudienceLabel(room.audience)}</span>
          </div>
        ))}

        {radioError && <p style={{ color: '#ef4444', fontSize: 12 }}>{radioError}</p>}

        {radioFormOpen && (
          <div style={radioFormStyle}>
            <input
              value={radioDraft.topic}
              onChange={(event) => setRadioDraft((current) => ({ ...current, topic: event.target.value }))}
              placeholder="Room topic"
              style={radioInputStyle}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <input
                type="date"
                value={radioDraft.date}
                onChange={(event) => setRadioDraft((current) => ({ ...current, date: event.target.value }))}
                style={radioInputStyle}
              />
              <input
                type="time"
                value={radioDraft.time}
                onChange={(event) => setRadioDraft((current) => ({ ...current, time: event.target.value }))}
                style={radioInputStyle}
              />
            </div>
            <select
              value={radioDraft.audience}
              onChange={(event) => setRadioDraft((current) => ({ ...current, audience: event.target.value }))}
              style={radioInputStyle}
            >
              <option value="Clients + coaches">Clients + coaches</option>
              <option value="Clients only">Clients only</option>
              <option value="Coaches only">Coaches only</option>
              <option value="Public Shape members">Public Shape members</option>
            </select>
            <textarea
              value={radioDraft.description}
              onChange={(event) => setRadioDraft((current) => ({ ...current, description: event.target.value }))}
              placeholder="Description"
              rows={3}
              style={{ ...radioInputStyle, resize: 'vertical' }}
            />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <SecondaryAction
                onClick={() => setRadioFormOpen(false)}
                disabled={radioSaving}
                style={{ marginTop: 0, width: '100%' }}
              >
                Cancel
              </SecondaryAction>
              <SecondaryAction
                onClick={saveRadioRoom}
                disabled={radioSaving || !radioDraft.topic.trim()}
                style={{
                  marginTop: 0,
                  width: '100%',
                  background: 'var(--teal)',
                  color: 'var(--paper)',
                  borderColor: 'var(--teal)',
                }}
              >
                {radioSaving ? 'Saving...' : 'Save room'}
              </SecondaryAction>
            </div>
          </div>
        )}

        {!radioFormOpen && (
          <SecondaryAction onClick={() => setRadioFormOpen(true)}>Schedule room</SecondaryAction>
        )}
      </div>
      {selectedClient && (
        <ClientPreviewModal
          client={selectedClient}
          role={dashboard.provider.role}
          onClose={() => setSelectedClient(null)}
        />
      )}
    </Card>
  );
}

function ClientPreviewModal({
  client,
  role,
  onClose,
}: {
  client: ClientRosterRecord;
  role: ProviderRole;
  onClose: () => void;
}) {
  return (
    <div style={modalOverlayStyle} role="dialog" aria-modal="true" aria-label={`${client.name} preview`}>
      <div style={clientModalStyle}>
        <button type="button" style={modalCloseStyle} onClick={onClose} aria-label="Close client preview">
          X
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ ...clientAvatarStyle, width: 46, height: 46, background: client.color }}>{client.initials}</span>
          <div>
            <Eyebrow>{role === 'nutritionist' ? 'NUTRITION CLIENT' : 'TRAINING CLIENT'}</Eyebrow>
            <Title>{client.name}</Title>
            <Sub>{client.plan} - {client.location}</Sub>
          </div>
        </div>

        <div style={previewMetricGridStyle}>
          <Metric label="Tier" value={client.tier.split(' - ')[0]} />
          <Metric label="Streak" value={client.streak} />
          <Metric label="Adherence" value={client.adherence} />
        </div>

        <div style={previewPanelStyle}>
          <Eyebrow>WHAT MATTERS NOW</Eyebrow>
          <p style={previewTextStyle}>{client.riskReason}</p>
          <p style={previewActionStyle}>{client.nextAction}</p>
        </div>

        <div style={previewPanelStyle}>
          <Eyebrow>RECENT ACTIVITY</Eyebrow>
          {client.timeline.map((item) => (
            <div key={item.label} style={timelineRowStyle}>
              <span>{item.label}</span>
              <strong>{item.detail}</strong>
            </div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <button type="button" style={secondaryPreviewButtonStyle} onClick={onClose}>
            Close
          </button>
          <Link to={`/clients/${client.slug}`} state={{ client }} style={primaryPreviewLinkStyle}>
            Full profile
          </Link>
        </div>
      </div>
    </div>
  );
}

function Sparkline({ points }: { points: number[] }) {
  return (
    <span style={sparklineStyle} aria-hidden>
      {points.map((point, index) => (
        <span
          key={`${point}-${index}`}
          style={{
            ...sparklineBarStyle,
            height: `${Math.max(4, Math.round(point * 24))}px`,
          }}
        />
      ))}
    </span>
  );
}

function nextRadioRoomDraft(role: ProviderRole) {
  const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return {
    topic: role === 'nutritionist' ? 'Fueling Q&A' : 'Training Q&A',
    date: tomorrow.toISOString().slice(0, 10),
    time: '19:00',
    audience: 'Clients + coaches',
    description:
      role === 'nutritionist'
        ? 'Live nutrition room for client questions, templates, and weekly planning.'
        : 'Live training room for client questions, programming, and weekly planning.',
  };
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

function parsePercent(value: string) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildAnalyticsSignals(rows: ClientRosterRecord[]) {
  if (!rows.length) {
    return {
      revenuePerClient: 0,
      avgAdherence: 0,
      atRisk: [] as ClientRosterRecord[],
      correlation: 'No subscribers yet. Correlations appear once client logs and adherence sync.',
    };
  }
  const revenuePerClient = Math.round(
    rows.reduce((sum, row) => sum + row.mrrCents / 100, 0) / rows.length
  );
  const avgAdherence = Math.round(
    rows.reduce((sum, row) => sum + parsePercent(row.adherence), 0) / rows.length
  );
  const atRisk = rows.filter(
    (row) =>
      parsePercent(row.adherence) < 85 ||
      row.status.toLowerCase().includes('flag') ||
      row.riskReason.toLowerCase().includes('missed') ||
      row.riskReason.toLowerCase().includes('under target')
  );
  const correlation =
    avgAdherence < 85
      ? 'Adherence is below target. Lower compliance is tracking with slower revenue growth per client.'
      : atRisk.length > 0
        ? 'Revenue is healthy, but at-risk clients are concentrated in low-adherence segments. Prioritize check-ins.'
        : 'Adherence and revenue/client are aligned. Keep current cadence and monitor weekly drift.';
  return { revenuePerClient, avgAdherence, atRisk, correlation };
}

const metricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  marginTop: 16,
};

const analyticsGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  marginTop: 10,
};

const analyticsPanelStyle = {
  marginTop: 10,
  border: '1px solid var(--border)',
  borderRadius: 12,
  padding: 12,
  background: 'linear-gradient(135deg, rgba(30,192,168,0.08), rgba(242,237,228,0.03))',
};

const atRiskRowStyle = {
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 10,
  alignItems: 'center',
  border: '1px solid rgba(248,113,113,0.35)',
  borderRadius: 12,
  padding: 10,
  background: 'rgba(127,29,29,0.08)',
  color: 'var(--ink)',
  textAlign: 'left' as const,
  fontFamily: 'inherit',
  cursor: 'pointer',
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

const clientRosterButtonStyle = {
  display: 'grid',
  gridTemplateColumns: '42px minmax(0, 1fr) auto',
  gap: 10,
  alignItems: 'center',
  width: '100%',
  padding: 12,
  border: '1px solid var(--border)',
  borderRadius: 16,
  background: 'linear-gradient(135deg, rgba(242,237,228,0.055), rgba(30,192,168,0.05))',
  color: 'var(--ink)',
  textAlign: 'left' as const,
  fontFamily: 'inherit',
  cursor: 'pointer',
};

const clientAvatarStyle = {
  width: 38,
  height: 38,
  borderRadius: 12,
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  color: '#0a0907',
  fontWeight: 800,
  fontSize: 13,
};

const clientNameStyle = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  fontSize: 14,
};

const clientMetaStyle = {
  display: 'block',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
  color: 'var(--muted)',
  fontSize: 12,
};

const clientMoneyStyle = {
  display: 'grid',
  justifyItems: 'end',
  gap: 2,
  fontSize: 12,
  color: 'var(--muted)',
};

const sparklineStyle = {
  gridColumn: '2 / 4',
  display: 'flex',
  alignItems: 'end',
  gap: 3,
  height: 28,
  paddingTop: 4,
};

const sparklineBarStyle = {
  width: 14,
  borderRadius: 999,
  background: 'var(--teal)',
  opacity: 0.9,
};

const modalOverlayStyle = {
  position: 'fixed' as const,
  inset: 0,
  zIndex: 60,
  display: 'grid',
  placeItems: 'center',
  padding: 18,
  background: 'rgba(0,0,0,0.62)',
};

const clientModalStyle = {
  position: 'relative' as const,
  width: 'min(100%, 390px)',
  maxHeight: 'calc(100vh - 72px)',
  overflowY: 'auto' as const,
  display: 'grid',
  gap: 14,
  padding: 18,
  borderRadius: 24,
  border: '1px solid rgba(242,237,228,0.18)',
  background: 'linear-gradient(180deg, #15130f, #090807)',
  boxShadow: '0 24px 70px rgba(0,0,0,0.55)',
};

const modalCloseStyle = {
  position: 'absolute' as const,
  top: 12,
  right: 12,
  width: 34,
  height: 34,
  borderRadius: 12,
  border: '1px solid var(--border)',
  background: 'rgba(242,237,228,0.05)',
  color: 'var(--ink)',
  fontFamily: 'var(--mono)',
};

const previewMetricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
};

const previewPanelStyle = {
  display: 'grid',
  gap: 8,
  padding: 12,
  borderRadius: 16,
  border: '1px solid var(--border)',
  background: 'rgba(242,237,228,0.035)',
};

const previewTextStyle = {
  margin: 0,
  color: 'var(--ink)',
  fontSize: 13,
  lineHeight: 1.45,
};

const previewActionStyle = {
  margin: 0,
  color: 'var(--teal)',
  fontSize: 12,
  lineHeight: 1.4,
};

const timelineRowStyle = {
  display: 'grid',
  gap: 3,
  padding: '8px 0',
  borderTop: '1px solid var(--border)',
  fontSize: 12,
  color: 'var(--muted)',
};

const secondaryPreviewButtonStyle = {
  minHeight: 44,
  borderRadius: 14,
  border: '1px solid var(--border)',
  background: 'rgba(242,237,228,0.05)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontWeight: 800,
};

const primaryPreviewLinkStyle = {
  minHeight: 44,
  borderRadius: 14,
  display: 'grid',
  placeItems: 'center',
  border: '1px solid var(--teal)',
  background: 'var(--teal)',
  color: '#060504',
  fontWeight: 900,
  textDecoration: 'none',
};

const radioRoomStyle = {
  display: 'grid',
  gap: 4,
  padding: 12,
  border: '1px solid rgba(30,192,168,0.26)',
  borderRadius: 12,
  background: 'rgba(30,192,168,0.08)',
  marginTop: 10,
  fontSize: 12,
};

const radioFormStyle = {
  display: 'grid',
  gap: 8,
  marginTop: 12,
  padding: 12,
  border: '1px solid var(--border)',
  borderRadius: 12,
};

const radioInputStyle = {
  width: '100%',
  boxSizing: 'border-box' as const,
  padding: '11px 12px',
  borderRadius: 10,
  border: '1px solid var(--border)',
  background: 'rgba(242,237,228,0.04)',
  color: 'var(--ink)',
  fontFamily: 'inherit',
  fontSize: 13,
};
