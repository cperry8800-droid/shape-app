// Profile sheet — opens when tapping avatar in Home's top-right.
// iOS settings-style quick panel: identity, plan, radio prefs, effects,
// account actions. Not the full Me tab — more of a compact utility.

const { useState: useStateP } = React;

function ProfileSheet({ onBack, onLogout, radioOn, setRadioOn, fxMode, setFxMode }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, background: PAPER, color: INK,
      overflow: 'auto', paddingBottom: 40,
    }}>
      {/* HERO */}
      <div style={{
        padding: '58px 24px 24px',
        background: `linear-gradient(160deg, rgba(227,122,90,0.14), rgba(30,192,168,0.04) 50%, transparent)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <button onClick={onBack} style={{
            background: 'transparent', border: 0, color: INK, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: 0,
          }}>← Back</button>
          <button style={{
            background: 'transparent', border: 0, color: INK_60, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>Edit</button>
        </div>

        {/* Avatar + name */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16 }}>
          <div style={{
            width: 84, height: 84, borderRadius: 42, flexShrink: 0,
            background: `linear-gradient(135deg, ${CORAL}, #b8523c)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontFamily: SERIF, fontSize: 38, fontStyle: 'italic', color: PAPER,
            letterSpacing: '-0.04em',
            boxShadow: `0 8px 24px ${CORAL}44`,
          }}>A</div>
          <div style={{ flex: 1, paddingBottom: 6 }}>
            <MLabel color={CORAL}>Member · 14 week streak</MLabel>
            <div style={{
              fontFamily: SERIF, fontSize: 32, letterSpacing: '-0.03em', fontWeight: 400,
              lineHeight: 1, marginTop: 6, color: INK,
            }}>Alex Rivera<em style={{ color: TEAL, fontStyle: 'italic', fontWeight: 500 }}>.</em></div>
          </div>
        </div>

        {/* Quick stats */}
        <div style={{ marginTop: 20, display: 'flex', gap: 12 }}>
          <StatChip label="Shape Score" value="78" tone={GOLD} />
          <StatChip label="Streak" value="14w" tone={TEAL} />
          <StatChip label="Points" value="340" tone={CORAL} />
        </div>
      </div>

      {/* PLAN */}
      <div style={{ padding: '18px 24px 0' }}>
        <EdCard pad={16} tint="linear-gradient(135deg, rgba(217,178,106,0.1), rgba(217,178,106,0.02))" style={{ border: `1px solid ${GOLD}33` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MLabel color={GOLD}>Your plan</MLabel>
            <MLabel>Renews Apr 30</MLabel>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK, marginTop: 8 }}>
            Shape <em style={{ fontStyle: 'italic', color: GOLD }}>Member.</em>
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, letterSpacing: '0.08em', marginTop: 5 }}>
            $5/MO · RADIO INCLUDED · COMMUNITY ACCESS · MARKETPLACE ACCESS
          </div>
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <Pill color={GOLD}>Manage →</Pill>
          </div>
        </EdCard>
      </div>

      {/* SHAPE RADIO controls */}
      <SectionHeader eyebrow="Shape Radio" title="Audio" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={0} style={{ overflow: 'hidden' }}>
          {/* Toggle */}
          <Row last>
            <RowInner
              icon={<div style={{ width: 32, height: 32, borderRadius: 8, background: `linear-gradient(135deg, ${TEAL}, #14806f)`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 1.5, height: 12 }}>
                  {[7, 11, 5, 10, 4].map((h, i) => <div key={i} style={{ width: 2, height: h, background: PAPER, borderRadius: 1 }} />)}
                </div>
              </div>}
              title="Play Radio in app"
              sub={radioOn ? 'Playing now · ad-free' : 'Muted'}
              trailing={<iOSSwitch on={radioOn} onChange={setRadioOn} />}
            />
          </Row>
        </EdCard>

        {/* Effects mode */}
        <div style={{ marginTop: 14 }}>
          <MLabel color={radioOn ? TEAL : INK_45}>Reactive effects {!radioOn && '· needs Radio on'}</MLabel>
          <div style={{
            marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8,
            opacity: radioOn ? 1 : 0.45, pointerEvents: radioOn ? 'auto' : 'none',
          }}>
            <FxModeCard mode="off"       title="Off"       sub="Clean · no animation"       icon="○"  active={fxMode === 'off'}       onClick={() => setFxMode('off')} />
            <FxModeCard mode="subtle"    title="Subtle"    sub="Edge glow · breathing type" icon="◐"  active={fxMode === 'subtle'}    onClick={() => setFxMode('subtle')} />
            <FxModeCard mode="immersive" title="Immersive" sub="Button halos · bg bloom"    icon="◉"  active={fxMode === 'immersive'} onClick={() => setFxMode('immersive')} />
            <FxModeCard mode="hologram"  title="Hologram"  sub="DJ overlay · scanlines"     icon="⟠"  active={fxMode === 'hologram'}  onClick={() => setFxMode('hologram')} />
          </div>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10, color: INK_45, letterSpacing: '0.08em' }}>
            EFFECTS ACROSS THE APP · BATTERY AWARE
          </div>
        </div>
      </div>

      {/* TEAM */}
      <SectionHeader eyebrow="Your team" title="Coaches" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={0} style={{ overflow: 'hidden' }}>
          <Row>
            <RowInner
              icon={<AvatarChip init="J" color={CORAL} size={32} />}
              title="Jordan Chen"
              sub="Coach · Hypertrophy · SF"
              trailing={<Chevron />}
            />
          </Row>
          <Row last>
            <RowInner
              icon={<AvatarChip init="M" color={GOLD} size={32} />}
              title="Dr. Maya Patel"
              sub="Nutritionist · consult Thu"
              trailing={<Chevron />}
            />
          </Row>
        </EdCard>
      </div>

      {/* ACCOUNT */}
      <SectionHeader eyebrow="Account" title="Settings" />
      <div style={{ padding: '0 24px' }}>
        {/* Billing row reflects member plan */}
        <EdCard pad={0} style={{ overflow: 'hidden' }}>
          <SettingsRow emoji="◈" title="Notifications" sub="Workout reminders · 3 rules" />
          <SettingsRow emoji="⚲" title="Privacy" sub="Profile · public to team only" />
          <SettingsRow emoji="⟐" title="Connected apps" sub="Apple Health · Strava · WHOOP" />
          <SettingsRow emoji="◉" title="Devices" sub="iPhone 15 Pro · Apple Watch S9" />
          <SettingsRow emoji="◮" title="Billing & invoices" sub="Next: Apr 30 · $5" />
          <SettingsRow emoji="⌘" title="Help & support" sub="Contact Shape" last />
        </EdCard>
      </div>

      {/* FOOTER */}
      <div style={{ padding: '22px 24px 0', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={onLogout} style={{
          width: '100%', height: 50, borderRadius: 14, border: `1px solid ${HAIR}`,
          background: 'transparent', color: CORAL,
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
          cursor: 'pointer',
        }}>Sign out ⎋</button>
        <div style={{ textAlign: 'center', marginTop: 8 }}>
          <MLabel>Shape v2.4.0 · build 2026.04</MLabel>
        </div>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function StatChip({ label, value, tone }) {
  return (
    <div style={{
      flex: 1, padding: '10px 12px', borderRadius: 14,
      border: `1px solid ${HAIR}`,
      background: `linear-gradient(135deg, ${tone}0f, transparent)`,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ fontFamily: SERIF, fontSize: 24, letterSpacing: '-0.03em', color: INK, marginTop: 3, lineHeight: 1 }}>
        {value}
      </div>
    </div>
  );
}

function RowInner({ icon, title, sub, trailing }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
      {icon && <div style={{ flexShrink: 0 }}>{icon}</div>}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>{title}</div>
        {sub && <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 3, letterSpacing: '0.06em' }}>{sub}</div>}
      </div>
      {trailing}
    </div>
  );
}

function SettingsRow({ emoji, title, sub, last, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '13px 14px',
      borderBottom: last ? 0 : `1px solid ${HAIR_S}`, cursor: onClick ? 'pointer' : 'default',
    }}>
      <div style={{
        width: 32, height: 32, borderRadius: 8, flexShrink: 0,
        background: 'rgba(242,237,228,0.05)', border: `1px solid ${HAIR}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: SERIF, fontSize: 14, color: INK_60,
      }}>{emoji}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>{title}</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 2, letterSpacing: '0.05em' }}>{sub}</div>
      </div>
      <Chevron />
    </div>
  );
}

function Chevron() {
  return <div style={{ fontFamily: MONO, fontSize: 14, color: INK_45 }}>›</div>;
}

function iOSSwitch({ on, onChange }) {
  return (
    <div onClick={() => onChange(!on)} style={{
      width: 48, height: 28, borderRadius: 14, flexShrink: 0, cursor: 'pointer',
      background: on ? TEAL : 'rgba(242,237,228,0.12)',
      position: 'relative', transition: 'background 0.2s',
      border: on ? 0 : `1px solid ${HAIR}`,
    }}>
      <div style={{
        width: 24, height: 24, borderRadius: 12, background: PAPER === '#f5f0e6' ? '#fff' : '#f2ede4',
        position: 'absolute', top: 2, left: on ? 22 : 2,
        transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
      }} />
    </div>
  );
}

function FxModeCard({ title, sub, icon, active, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding: '12px 12px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
      border: `1px solid ${active ? TEAL : HAIR}`,
      background: active ? `linear-gradient(135deg, ${TEAL}14, transparent)` : 'transparent',
      color: INK, transition: 'all 0.15s',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, color: active ? TEAL : INK_60, lineHeight: 1 }}>{icon}</div>
        {active && <div style={{
          width: 16, height: 16, borderRadius: 8, background: TEAL,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: PAPER, fontSize: 10,
        }}>✓</div>}
      </div>
      <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 600, color: INK, letterSpacing: -0.1, marginTop: 10 }}>{title}</div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: INK_60, marginTop: 3, letterSpacing: '0.06em' }}>{sub}</div>
    </button>
  );
}

Object.assign(window, { ProfileSheet });
