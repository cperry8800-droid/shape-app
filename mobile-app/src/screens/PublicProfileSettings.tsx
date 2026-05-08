import { Link } from 'react-router-dom';
import { Card, Eyebrow, Field, PrimaryAction, ScreenTitle, Sub, inputStyle, screenTopStyle } from '../components/ui';

export default function PublicProfileSettings() {
  return (
    <div style={screenTopStyle}>
      <Link to="/me/settings" style={backLinkStyle}>
        ← Back to settings
      </Link>
      <ScreenTitle>Public profile</ScreenTitle>

      <Card>
        <Eyebrow>VISIBILITY</Eyebrow>
        <Sub>Control what members can see when they view your public profile.</Sub>

        <div style={{ marginTop: 12 }}>
          <Field label="Display name">
            <input defaultValue="Chris Perry" style={inputStyle} />
          </Field>
          <Field label="Headline">
            <input defaultValue="Shape member · Goals in progress" style={inputStyle} />
          </Field>
          <Field label="Location">
            <input defaultValue="New York" style={inputStyle} />
          </Field>
        </div>

        <PrimaryAction>Save profile settings</PrimaryAction>
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

