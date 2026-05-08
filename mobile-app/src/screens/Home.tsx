import { Card, Eyebrow, PrimaryAction, SecondaryAction, Sub, Title } from '../components/ui';

export default function Home() {
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

      <Card>
        <Eyebrow>HABITS &middot; 4 / 6 TODAY</Eyebrow>
        <Title>+12 pts earned</Title>
        <Sub>Sleep &#10003; &middot; Steps &#10003; &middot; No alcohol &#10003; &middot; Protein &#10003;</Sub>
      </Card>
    </div>
  );
}
