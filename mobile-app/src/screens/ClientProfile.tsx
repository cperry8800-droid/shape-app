import { Link, useLocation, useParams } from 'react-router-dom';
import { Card, Eyebrow, Row, ScreenTitle, Sub, Title, screenTopStyle } from '../components/ui';
import { findClientTemplate, type ClientRosterRecord } from '../lib/clientRoster';

export default function ClientProfile() {
  const { slug = '' } = useParams();
  const location = useLocation();
  const stateClient = (location.state as { client?: ClientRosterRecord } | null)?.client;
  const client = stateClient ?? findClientTemplate(slug);

  return (
    <div style={screenTopStyle}>
      <Link to="/me" style={backLinkStyle}>Back to roster</Link>
      <ScreenTitle>{client.name}</ScreenTitle>

      <Card>
        <Eyebrow>CLIENT PROFILE</Eyebrow>
        <Title>{client.plan}</Title>
        <Sub>{client.tier} - {client.location} - last seen {client.lastSeen}</Sub>
        <div style={metricGridStyle}>
          <MiniMetric label="MRR" value={formatMoney(client.mrrCents)} />
          <MiniMetric label="Revenue" value={formatMoney(client.revenueCents)} />
          <MiniMetric label="Adherence" value={client.adherence} />
        </div>
      </Card>

      <Card>
        <Eyebrow>COACH PRIORITY</Eyebrow>
        <Title>{client.status === 'flag' ? 'Needs attention' : 'On track'}</Title>
        <p style={bodyStyle}>{client.riskReason}</p>
        <p style={actionStyle}>{client.nextAction}</p>
      </Card>

      <Card>
        <Eyebrow>30 DAY COMPLIANCE</Eyebrow>
        <div style={heatmapStyle}>
          {Array.from({ length: 30 }).map((_, index) => (
            <span
              key={index}
              style={{
                ...heatCellStyle,
                background:
                  index % 9 === 0
                    ? '#3a3027'
                    : index % 7 === 0
                      ? '#d99b22'
                      : 'var(--teal)',
              }}
            />
          ))}
        </div>
        <Sub>Workout, nutrition, sleep, and recovery signals are combined into this scan view.</Sub>
      </Card>

      <Card>
        <Eyebrow>TIMELINE</Eyebrow>
        {client.timeline.map((item) => (
          <Row key={item.label} label={item.label} value={item.detail} />
        ))}
      </Card>
    </div>
  );
}

function MiniMetric({ label, value }: { label: string; value: string }) {
  return (
    <div style={miniMetricStyle}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function formatMoney(cents: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

const backLinkStyle = {
  display: 'inline-flex',
  width: 'fit-content',
  marginBottom: 10,
  color: 'var(--muted)',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: 2,
  textDecoration: 'none',
  textTransform: 'uppercase' as const,
};

const metricGridStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 8,
  marginTop: 16,
};

const miniMetricStyle = {
  display: 'grid',
  gap: 6,
  padding: 12,
  border: '1px solid var(--border)',
  borderRadius: 14,
  fontSize: 12,
  color: 'var(--muted)',
};

const bodyStyle = {
  margin: '10px 0 0',
  color: 'var(--ink)',
  fontSize: 14,
  lineHeight: 1.5,
};

const actionStyle = {
  margin: '10px 0 0',
  color: 'var(--teal)',
  fontSize: 13,
  lineHeight: 1.45,
};

const heatmapStyle = {
  display: 'grid',
  gridTemplateColumns: 'repeat(10, 1fr)',
  gap: 5,
  margin: '12px 0',
};

const heatCellStyle = {
  aspectRatio: '1',
  borderRadius: 5,
  border: '1px solid rgba(242,237,228,0.08)',
};
