// Today screen — port over the relevant blocks from
// public/mobile/Mobile.html / iosAppMain.jsx as you go. This is a thin
// placeholder so the wrapper can build and run on day one.

export default function Home() {
  return (
    <div>
      <header style={{ paddingTop: 20, paddingBottom: 24 }}>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: '0.14em', color: 'var(--muted-2)' }}>
          WEDNESDAY · APR 18
        </div>
        <h1 style={{ fontFamily: 'Fraunces, serif', fontSize: 36, fontWeight: 400, letterSpacing: '-0.02em', margin: '6px 0 0' }}>
          Welcome back, Priya.
        </h1>
      </header>

      <Card>
        <Eyebrow>TODAY · 9:00 AM</Eyebrow>
        <Title>Upper Body Pull</Title>
        <Sub>45 min · 6 exercises · programmed by Marcus</Sub>
        <PrimaryAction>Start session →</PrimaryAction>
      </Card>

      <Card>
        <Eyebrow>RECIPE OF THE DAY</Eyebrow>
        <Title>Sheet-pan salmon, sweet potato &amp; broccoli</Title>
        <Sub>35 min · 620 kcal · 44p 58c 22f</Sub>
        <SecondaryAction>View recipe</SecondaryAction>
      </Card>

      <Card>
        <Eyebrow>HABITS · 4 / 6 TODAY</Eyebrow>
        <Title>+12 pts earned</Title>
        <Sub>Sleep ✓ · Steps ✓ · No alcohol ✓ · Protein ✓</Sub>
      </Card>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(242,237,228,0.04)',
      border: '1px solid var(--border)',
      borderRadius: 12,
      padding: 18,
      marginBottom: 14,
    }}>{children}</div>
  );
}
function Eyebrow({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: '0.14em', color: 'var(--teal-bright)', marginBottom: 8 }}>{children}</div>;
}
function Title({ children }: { children: React.ReactNode }) {
  return <div style={{ fontFamily: 'Fraunces, serif', fontSize: 22, letterSpacing: '-0.015em', marginBottom: 6 }}>{children}</div>;
}
function Sub({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 13, color: 'var(--muted)', lineHeight: 1.5 }}>{children}</div>;
}
function PrimaryAction({ children }: { children: React.ReactNode }) {
  return (
    <button style={{
      marginTop: 14, width: '100%', padding: '12px 18px', borderRadius: 999,
      background: 'var(--teal)', color: 'var(--paper)', border: 0,
      fontFamily: 'inherit', fontSize: 14, fontWeight: 500,
    }}>{children}</button>
  );
}
function SecondaryAction({ children }: { children: React.ReactNode }) {
  return (
    <button style={{
      marginTop: 14, padding: '10px 18px', borderRadius: 999,
      background: 'transparent', color: 'var(--ink)',
      border: '1px solid var(--border)',
      fontFamily: 'inherit', fontSize: 13,
    }}>{children}</button>
  );
}
