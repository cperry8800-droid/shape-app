import { Link } from 'react-router-dom';
import { Card, Eyebrow, ScreenTitle, Sub, Title, screenTopStyle } from '../components/ui';

export default function Privacy() {
  return (
    <div style={screenTopStyle}>
      <Link to="/me/settings" style={backLinkStyle}>
        ← Back to settings
      </Link>
      <ScreenTitle>Privacy</ScreenTitle>

      <Card>
        <Eyebrow>PRIVACY POLICY</Eyebrow>
        <Title>How Shape handles your data</Title>
        <Sub>
          Shape stores account, workout, nutrition, and chat data to run your dashboard experience.
          Payment details are processed by Stripe and are not stored as raw card numbers in Shape.
        </Sub>
      </Card>

      <Card>
        <Eyebrow>CONTROLS</Eyebrow>
        <Sub>
          You can request data export or account deletion from support. Profile visibility controls are
          managed in Public profile settings.
        </Sub>
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

