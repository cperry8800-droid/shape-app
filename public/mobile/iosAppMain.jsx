// App entry — orchestrates Splash → Login → Role-dispatched app
// Role is chosen via Tweak (concept exploration)

const { useState: useStateA, useEffect: useEffectA } = React;

function App() {
  const tweaks = window.__TWEAKS || {};
  const [stage, setStage] = useStateA(tweaks.startLoggedIn ? 'app' : 'splash');
  const [role, setRole] = useStateA(tweaks.role || 'client');
  const [dark, setDark] = useStateA(!!tweaks.dark);
  const [tweaksOn, setTweaksOn] = useStateA(false);
  const [radioOn, setRadioOn] = useStateA(true);

  // Stage progression
  useEffectA(() => {
    if (stage === 'splash' && !tweaks.startLoggedIn) {
      const t = setTimeout(() => setStage('login'), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  // Tweak host integration
  useEffectA(() => {
    function onMsg(e) {
      const d = e.data || {};
      if (d.type === '__activate_edit_mode') setTweaksOn(true);
      if (d.type === '__deactivate_edit_mode') setTweaksOn(false);
    }
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  function setKey(k, v) {
    const edits = { [k]: v };
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits }, '*');
  }

  const appFor = {
    client: <ClientApp dark={dark} onLogout={() => setStage('login')} radioOn={radioOn} setRadioOn={setRadioOn} />,
    trainer: <TrainerApp dark={dark} onLogout={() => setStage('login')} radioOn={radioOn} setRadioOn={setRadioOn} />,
    nutritionist: <NutritionistApp dark={dark} onLogout={() => setStage('login')} radioOn={radioOn} setRadioOn={setRadioOn} />,
  }[role];

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 30, background: '#0d0d0f',
      backgroundImage: 'radial-gradient(80% 60% at 50% 30%, #1a1a1c 0%, #0d0d0f 100%)',
    }}>
      <Phone dark={dark}>
        {stage === 'splash' && <Splash onDone={() => setStage('login')} />}
        {stage === 'login' && <Login role={role} setRole={setRole} onLogin={(r) => { if (r) setRole(r); setStage('radio-prompt'); }} />}
        {stage === 'radio-prompt' && <RadioPrompt onChoose={(on) => { setRadioOn(on); setStage('app'); }} />}
        {stage === 'app' && appFor}
      </Phone>

      {/* Tweaks panel */}
      {tweaksOn && (
        <div style={{
          position: 'fixed', top: 20, right: 20, width: 280,
          background: 'rgba(28,28,30,0.95)', color: '#fff',
          backdropFilter: 'blur(30px)', WebkitBackdropFilter: 'blur(30px)',
          borderRadius: 16, padding: 14, zIndex: 9999,
          fontFamily: FONT, fontSize: 13,
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          border: '1px solid rgba(255,255,255,0.1)',
        }}>
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', opacity: 0.6, marginBottom: 10 }}>Tweaks</div>

          <TweakLabel>Role</TweakLabel>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[['client','Client'],['trainer','Trainer'],['nutritionist','Nutri']].map(([k,label]) => (
              <button key={k} onClick={() => { setRole(k); setKey('role', k); }}
                style={tweakBtn(role === k)}>{label}</button>
            ))}
          </div>

          <TweakLabel>Screen</TweakLabel>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            {[['splash','Splash'],['login','Login'],['radio-prompt','Radio?'],['app','App']].map(([k,label]) => (
              <button key={k} onClick={() => setStage(k)}
                style={tweakBtn(stage === k)}>{label}</button>
            ))}
          </div>

          <TweakLabel>Appearance</TweakLabel>
          <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
            <button onClick={() => { setDark(false); setKey('dark', false); }} style={tweakBtn(!dark)}>Light</button>
            <button onClick={() => { setDark(true); setKey('dark', true); }} style={tweakBtn(dark)}>Dark</button>
          </div>

          <TweakLabel>Auto-login on open</TweakLabel>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => setKey('startLoggedIn', false)} style={tweakBtn(!tweaks.startLoggedIn)}>Off</button>
            <button onClick={() => setKey('startLoggedIn', true)} style={tweakBtn(!!tweaks.startLoggedIn)}>On</button>
          </div>
        </div>
      )}
    </div>
  );
}

function TweakLabel({ children }) {
  return <div style={{ fontSize: 11, opacity: 0.55, letterSpacing: 0.2, marginBottom: 5, fontWeight: 500 }}>{children}</div>;
}
function tweakBtn(active) {
  return {
    flex: 1, padding: '7px 8px', borderRadius: 8, border: 0, cursor: 'pointer',
    background: active ? SHAPE.accent : 'rgba(255,255,255,0.08)',
    color: active ? '#fff' : 'rgba(255,255,255,0.7)',
    fontSize: 12, fontWeight: 600, fontFamily: FONT, letterSpacing: -0.1,
  };
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
