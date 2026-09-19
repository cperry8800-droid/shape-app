function KitchenCookPage() {
  const params = new URLSearchParams(location.search);
  const query = new URLSearchParams({ cooking: '1' });
  if (params.get('r')) query.set('r', params.get('r'));
  if (params.get('mode') === 'together') query.set('mode', 'together');
  const src = '/m/?' + query.toString();
  return <div style={{ background: '#f4eee2', color: '#1e2a26', minHeight: '100vh' }}>
    <Header active="Kitchen" />
    <main style={{ maxWidth: 1040, margin: '0 auto', padding: '20px clamp(12px, 3vw, 32px)' }}>
      <a href="/recipes" style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>← All recipes</a>
      <h1 style={{ fontFamily: "'Anybody', sans-serif", fontWeight: 500 }}>Let's cook.</h1>
      <p style={{ fontFamily: "'Schibsted Grotesk', sans-serif", lineHeight: 1.6 }}>Follow each step, use the timers, or choose several dishes and a serving time. The plan accounts for your burners, oven and preparation space.</p>
      <iframe title="Shape cooking tutorial and meal planner" src={src} allow="microphone; screen-wake-lock" style={{ width: '100%', height: '85dvh', minHeight: 540, border: '1px solid rgba(30,42,38,.2)', display: 'block' }} />
      <a href={src} style={{ display: 'inline-flex', minHeight: 44, alignItems: 'center' }}>Open cooking full screen ↗</a>
    </main>
  </div>;
}
ReactDOM.createRoot(document.getElementById('root')).render(<KitchenCookPage />);
