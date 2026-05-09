import { useState, type CSSProperties } from 'react';
import { HabitsPanel } from '../components/HabitsPanel';
import { ClientAnalyticsPanel } from '../components/ClientAnalyticsPanel';
import { Card, Eyebrow, PrimaryAction, SecondaryAction, Sub, Title } from '../components/ui';

export default function Home() {
  const [activeTab, setActiveTab] = useState<'today' | 'analytics' | 'habits'>('today');

  return (
    <div>
      <header style={{ paddingTop: 20, paddingBottom: 24 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.14em', color: 'var(--muted-2)' }}>
          WEDNESDAY &middot; APR 18
        </div>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: '6px 0 0' }}>
          Welcome back, Priya.
        </h1>
      </header>

      <div style={homeTabsStyle} role="tablist" aria-label="Home sections">
        {(['today', 'analytics', 'habits'] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            role="tab"
            aria-selected={activeTab === tab}
            onClick={() => setActiveTab(tab)}
            style={{
              ...homeTabButtonStyle,
              ...(activeTab === tab ? homeTabButtonActiveStyle : null),
            }}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'today' ? (
        <>
          <Card>
            <Eyebrow>TODAY &middot; 9:00 AM</Eyebrow>
            <Title>Upper Body Pull</Title>
            <Sub>45 min &middot; 6 exercises &middot; programmed by Marcus</Sub>
            <PrimaryAction>Start session &rarr;</PrimaryAction>
          </Card>

          <Card>
            <Eyebrow>RECIPE OF THE DAY</Eyebrow>
            <Title>Sheet-pan salmon, sweet potato &amp; broccoli</Title>
            <Sub>35 min &middot; 620 kcal &middot; 44p 58c 22f</Sub>
            <SecondaryAction>View recipe</SecondaryAction>
          </Card>
        </>
      ) : activeTab === 'analytics' ? (
        <ClientAnalyticsPanel />
      ) : (
        <HabitsPanel />
      )}
    </div>
  );
}

const mono = "'JetBrains Mono', monospace";

const homeTabsStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
  gap: 8,
  marginBottom: 16,
  padding: 4,
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'rgba(242,237,228,0.035)',
};

const homeTabButtonStyle: CSSProperties = {
  border: 0,
  borderRadius: 999,
  padding: '11px 12px',
  background: 'transparent',
  color: 'var(--muted)',
  fontFamily: mono,
  fontSize: 10,
  letterSpacing: '0.14em',
  textTransform: 'uppercase',
};

const homeTabButtonActiveStyle: CSSProperties = {
  background: 'var(--ink)',
  color: 'var(--paper)',
};
