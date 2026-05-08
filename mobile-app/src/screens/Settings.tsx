import { Link } from 'react-router-dom';
import { Card, Eyebrow, Row, ScreenTitle, Sub, Title, screenTopStyle } from '../components/ui';

type Item = {
  label: string;
  value: string;
  href?: string;
};

const items: Item[] = [
  { label: 'Public profile', value: 'LIVE', href: '/me/settings/public-profile' },
  { label: 'Booking calendar', value: 'SYNCED' },
  { label: 'Goal plan', value: '02 TARGETS' },
  { label: 'Shape Store', value: '1,280 PTS' },
  { label: 'Payouts', value: 'STRIPE' },
  { label: 'Contact support', value: '24H REPLY' },
  { label: 'Terms of service', value: 'LEGAL' },
  { label: 'Notifications', value: 'ON' },
  { label: 'Privacy', value: 'POLICY', href: '/me/settings/privacy' },
];

export default function Settings() {
  return (
    <div style={screenTopStyle}>
      <Link to="/me" style={backLinkStyle}>
        ← Back
      </Link>
      <ScreenTitle>Settings</ScreenTitle>
      <Card>
        <Eyebrow>ACCOUNT</Eyebrow>
        <Title>Profile settings</Title>
        <Sub>Manage account links, privacy, and dashboard preferences.</Sub>
      </Card>

      <Card>
        <Eyebrow>SETTINGS</Eyebrow>
        <div>
          {items.map((item) => {
            const row = <Row label={item.label} value={item.value} />;
            if (!item.href) {
              return (
                <div key={item.label} style={rowWrapStyle}>
                  {row}
                </div>
              );
            }
            return (
              <Link key={item.label} to={item.href} style={rowLinkStyle}>
                {row}
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

const backLinkStyle = {
  display: 'inline-block',
  marginBottom: 10,
  color: 'var(--muted)',
  fontSize: 13,
  textDecoration: 'none',
};

const rowWrapStyle = {
  borderTop: '1px solid var(--border)',
  paddingTop: 2,
  marginTop: 2,
};

const rowLinkStyle = {
  display: 'block',
  borderTop: '1px solid var(--border)',
  paddingTop: 2,
  marginTop: 2,
  textDecoration: 'none',
};

