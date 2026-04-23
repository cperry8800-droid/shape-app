// Shared editorial primitives for the Shape iOS app.
// System from the Shape "Today's plan" + "Pull day" references:
//   serif = Fraunces (large titles, editorial headlines)
//   sans  = Space Grotesk (body, buttons)
//   mono  = JetBrains Mono (micro-labels, times, slash-macros)
//   PAPER = #1a1612   INK = #f2ede4   TEAL = #1ec0a8

const { useState: useStateS, useEffect: useEffectS } = React;

const SERIF = "'Fraunces', 'Instrument Serif', Georgia, serif";
const SANS  = "'Space Grotesk', -apple-system, system-ui, sans-serif";
const MONO  = "'JetBrains Mono', ui-monospace, monospace";

window.FONT = SANS;

// Palette shortcuts (dark-first editorial)
const PAPER  = '#1a1612';
const PAPER2 = '#221a14';   // one notch lifted
const INK    = '#f2ede4';
const INK_60 = 'rgba(242,237,228,0.60)';
const INK_45 = 'rgba(242,237,228,0.45)';
const INK_30 = 'rgba(242,237,228,0.30)';
const HAIR   = 'rgba(242,237,228,0.09)';
const HAIR_S = 'rgba(242,237,228,0.05)';
const TEAL   = '#1ec0a8';
const GOLD   = '#d9b26a';
const CORAL  = '#e37a5a';
const PLUM   = '#8c6fa8';

// ─────────────────────────────────────────────────────────────
// Logo
// ─────────────────────────────────────────────────────────────
function ShapeMark({ size = 32, variant = 'white' }) {
  const src = variant === 'dark' ? 'assets/shape-logo-new-black.png?v=3' : 'assets/shape-logo-new-white.png?v=3';
  return <img src={src} alt="Shape" style={{ width: size * 1.87, height: size, display: 'block' }} />;
}

// ─────────────────────────────────────────────────────────────
// Editorial nav bar — mono eyebrow + serif headline
// Back-compat: subtitle/title still accepted.
// ─────────────────────────────────────────────────────────────
function NavBar({ eyebrow, title, subtitle, trailing, accent = TEAL }) {
  return (
    <div style={{ padding: '58px 24px 18px' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {(eyebrow || subtitle) && (
            <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', color: accent, textTransform: 'uppercase', marginBottom: 12 }}>
              {eyebrow || subtitle}
            </div>
          )}
          {title && (
            <h1 style={{
              fontFamily: SERIF, fontSize: 40, lineHeight: 0.98, letterSpacing: '-0.035em',
              fontWeight: 400, margin: 0, color: INK,
            }}>{title}</h1>
          )}
        </div>
        {trailing && <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingTop: 2 }}>{trailing}</div>}
      </div>
    </div>
  );
}

// Small round avatar chip
function AvatarChip({ init, color = TEAL, size = 36 }) {
  return (
    <div style={{
      width: size, height: size, borderRadius: size / 2,
      background: `linear-gradient(135deg, ${color}, ${color}aa)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: MONO, fontSize: size * 0.38, fontWeight: 500, color: '#fff',
      letterSpacing: 0.5,
    }}>{init}</div>
  );
}

function IconBtn({ children, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: 36, height: 36, borderRadius: 18, border: `1px solid ${HAIR}`,
      background: 'transparent', color: INK, cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
    }}>{children}</button>
  );
}

// ─────────────────────────────────────────────────────────────
// Editorial card
// ─────────────────────────────────────────────────────────────
function EdCard({ children, active, style, onClick, tint, pad = 16 }) {
  const border = active ? `1px solid ${TEAL}` : `1px solid ${HAIR}`;
  const bg = tint ? tint : (active ? 'rgba(30,192,168,0.06)' : 'rgba(242,237,228,0.025)');
  return (
    <div onClick={onClick} style={{
      borderRadius: 18, border, background: bg, padding: pad,
      cursor: onClick ? 'pointer' : 'default', ...style,
    }}>{children}</div>
  );
}

// Mono micro-label
function MLabel({ children, color, style }) {
  return <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: color || INK_45, ...style }}>{children}</span>;
}

// Slash-delimited mono stats: "520 kcal · 42P / 68C / 9F"
function MStats({ items, color, size = 11 }) {
  return <span style={{ fontFamily: MONO, fontSize: size, letterSpacing: '0.04em', color: color || INK_60 }}>{items.join('  ·  ')}</span>;
}

// In-scroll section header (smaller than NavBar)
function SectionHeader({ eyebrow, title, action, onAction, pad = true }) {
  return (
    <div style={{
      padding: pad ? '30px 24px 14px' : '12px 0 10px',
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12,
    }}>
      <div>
        {eyebrow && <div style={{ marginBottom: 8 }}><MLabel color={TEAL}>{eyebrow}</MLabel></div>}
        {title && <div style={{ fontFamily: SERIF, fontSize: 24, letterSpacing: '-0.02em', color: INK, lineHeight: 1 }}>{title}</div>}
      </div>
      {action && (
        <button onClick={onAction} style={{
          background: 'transparent', border: 0, color: TEAL, cursor: 'pointer',
          fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>{action} →</button>
      )}
    </div>
  );
}

// Simple list container (for back-compat with older screens)
function List({ children, style }) {
  return <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 10, ...(style || {}) }}>{children}</div>;
}

// Simple row — editorial spin on iOS table row
function Row({ icon, iconBg, title, subtitle, detail, onClick, last }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
      borderBottom: last ? 0 : `1px solid ${HAIR_S}`, cursor: onClick ? 'pointer' : 'default',
    }}>
      {icon && (
        <div style={{
          width: 36, height: 36, borderRadius: 10,
          background: iconBg || HAIR, color: INK,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{icon}</div>
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: INK_60, marginTop: 3, textTransform: 'uppercase' }}>{subtitle}</div>}
      </div>
      {detail && <div style={{ fontFamily: MONO, fontSize: 11, color: TEAL, letterSpacing: '0.1em' }}>{detail}</div>}
    </div>
  );
}

// Tab bar
function TabBar({ tabs, active, onChange }) {
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 55,
      height: 88, paddingBottom: 34,
      background: 'rgba(16,12,10,0.82)',
      backdropFilter: 'blur(30px) saturate(180%)',
      WebkitBackdropFilter: 'blur(30px) saturate(180%)',
      borderTop: `1px solid ${HAIR}`,
      display: 'flex', justifyContent: 'space-around',
    }}>
      {tabs.map(t => {
        const on = t.key === active;
        const c = on ? TEAL : INK_45;
        return (
          <button key={t.key} onClick={() => onChange(t.key)} style={{
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: 4, padding: '6px 0', border: 0, background: 'transparent', cursor: 'pointer', color: c,
          }}>
            <Icon name={t.icon} size={22} color={c} filled={on && t.fillActive !== false} />
            <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

// Scrollable screen wrapper; accept `dark`/`tint` for back-compat
function Screen({ children, tint }) {
  return (
    <div style={{
      position: 'absolute', inset: 0, overflow: 'auto',
      background: tint || PAPER, color: INK, paddingBottom: 108,
    }}>{children}</div>
  );
}
// Alias back-compat
const TabScreen = Screen;

// Round play/primary FAB (big circle, like the reference)
function PlayFab({ children = '▶', size = 56, color = TEAL, onClick }) {
  return (
    <button onClick={onClick} style={{
      width: size, height: size, borderRadius: size / 2, border: 0,
      background: color, color: PAPER, cursor: 'pointer',
      fontSize: size * 0.36, fontWeight: 700,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      boxShadow: `0 8px 24px ${color}55`,
    }}>{children}</button>
  );
}

// Attribution chip: avatar + name + role (for coach-authored content)
function Attribution({ init, color = TEAL, name, role }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
      <AvatarChip init={init} color={color} size={28} />
      <div style={{ lineHeight: 1.15 }}>
        <div style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>{name}</div>
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{role}</div>
      </div>
    </div>
  );
}

// Pill button (secondary)
function Pill({ children, onClick, color = TEAL, solid }) {
  return (
    <button onClick={onClick} style={{
      height: 34, padding: '0 14px', borderRadius: 17,
      border: solid ? 0 : `1px solid ${color}55`,
      background: solid ? color : 'transparent',
      color: solid ? PAPER : color,
      fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase',
      cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    }}>{children}</button>
  );
}

// Numbered tracklist row (meals, exercises, sessions)
function TrackRow({ n, title, sub, detail, state, accent = TEAL, onClick, last }) {
  const done = state === 'done';
  const next = state === 'next';
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
      borderBottom: last ? 0 : `1px solid ${HAIR_S}`,
      cursor: onClick ? 'pointer' : 'default',
      opacity: done ? 0.55 : 1,
    }}>
      <div style={{ width: 22, textAlign: 'right' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', color: next ? accent : INK_45 }}>
          {done ? '✓' : String(n).padStart(2, '0')}
        </span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: SANS, fontSize: 15, fontWeight: 500, color: INK, letterSpacing: -0.1,
          textDecoration: done ? 'line-through' : 'none', textDecorationColor: INK_45,
        }}>{title}</div>
        {sub && <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', color: next ? accent : INK_60, marginTop: 3 }}>{sub}</div>}
      </div>
      {detail && <div style={{ fontFamily: MONO, fontSize: 10.5, color: INK_45, letterSpacing: '0.1em' }}>{detail}</div>}
    </div>
  );
}

// Decorative curve SVG (as seen in references)
function CurveDecor({ color = TEAL, opacity = 0.18, position = 'tr' }) {
  const pos = position === 'tr'
    ? { right: -40, top: 40 }
    : position === 'tl'
      ? { left: -40, top: 40 }
      : { right: -40, bottom: 40 };
  return (
    <svg style={{ position: 'absolute', ...pos, opacity, pointerEvents: 'none' }} width="280" height="220" viewBox="0 0 280 220">
      <path d="M0 140 Q70 30 140 110 T280 60" stroke={color} strokeWidth="2" fill="none"/>
      <path d="M0 170 Q70 60 140 140 T280 90" stroke={color} strokeWidth="1.5" fill="none" opacity="0.7"/>
      <path d="M0 110 Q70 0 140 80 T280 30" stroke={color} strokeWidth="1" fill="none" opacity="0.5"/>
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────
// Splash
// ─────────────────────────────────────────────────────────────
function Splash({ onDone }) {
  useEffectS(() => { const t = setTimeout(onDone, 1100); return () => clearTimeout(t); }, []);
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 90,
      background: `radial-gradient(120% 100% at 50% 40%, #2a211a 0%, ${PAPER} 60%, #100c0a 100%)`,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <style>{`@keyframes spIn { from { transform: scale(0.9); opacity: 0; } to { transform: scale(1); opacity: 1; } }`}</style>
      <div style={{ animation: 'spIn 700ms cubic-bezier(.2,.8,.2,1) both' }}>
        <ShapeMark size={160} variant="white" />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Login — editorial
// ─────────────────────────────────────────────────────────────
function Login({ onLogin, role: roleProp, setRole: setRoleProp }) {
  const [email, setEmail] = useStateS('alex@shape.app');
  const [pw, setPw] = useStateS('••••••••');
  const [roleLocal, setRoleLocal] = useStateS('client');
  const role = roleProp || roleLocal;
  const setRole = setRoleProp || setRoleLocal;
  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 80,
      background: PAPER, color: INK,
      display: 'flex', flexDirection: 'column',
      padding: '70px 28px 28px', overflow: 'hidden',
    }}>
      <CurveDecor color={TEAL} opacity={0.16} position="tr" />

      <ShapeMark size={72} variant="white" />

      <div style={{ marginTop: 36, position: 'relative' }}>
        <MLabel color={TEAL}>Sign in</MLabel>
        <h1 style={{
          fontFamily: SERIF, fontSize: 48, letterSpacing: '-0.035em', fontWeight: 400,
          lineHeight: 0.95, margin: '12px 0 0', color: INK,
        }}>
          Welcome<br/>
          <em style={{ fontStyle: 'italic', fontWeight: 500, color: TEAL }}>back.</em>
        </h1>
      </div>

      {/* Role toggle */}
      <div style={{ marginTop: 22 }}>
        <div style={{ fontFamily: MONO, fontSize: 10, color: INK_45, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 8 }}>I'm a</div>
        <div style={{ display: 'flex', gap: 4, background: 'rgba(15,13,12,0.05)', border: `1px solid ${HAIR}`, borderRadius: 999, padding: 3 }}>
          {[['client','Client'],['trainer','Trainer'],['nutritionist','Nutritionist']].map(([v,l]) => (
            <button key={v} onClick={() => setRole(v)} style={{
              flex: 1, padding: '9px 8px', borderRadius: 999, border: 0,
              background: role === v ? TEAL : 'transparent',
              color: role === v ? '#0F0D0C' : INK_60,
              fontFamily: SANS, fontSize: 12.5, fontWeight: role === v ? 600 : 500,
              cursor: 'pointer', letterSpacing: -0.1,
              transition: 'background 0.18s ease, color 0.18s ease',
            }}>{l}</button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 22, position: 'relative' }}>
        <Field label="Email" value={email} onChange={setEmail} />
        <div style={{ height: 10 }}/>
        <Field label="Password" value={pw} onChange={setPw} type="password" />

        <div style={{ textAlign: 'right', marginTop: 10 }}>
          <MLabel color={TEAL}>Forgot password →</MLabel>
        </div>

        <button onClick={() => onLogin && onLogin(role)} style={{
          marginTop: 16, width: '100%', height: 50, borderRadius: 14, border: 0,
          background: INK, color: PAPER, fontFamily: SANS, fontSize: 15, fontWeight: 600, letterSpacing: -0.2,
          cursor: 'pointer',
        }}>Sign in as {role[0].toUpperCase() + role.slice(1)} →</button>

        <div style={{
          display: 'flex', alignItems: 'center', gap: 12, margin: '16px 0',
          fontFamily: MONO, fontSize: 10, color: INK_30, letterSpacing: '0.14em',
        }}>
          <div style={{ flex: 1, height: 1, background: HAIR }}/>
          OR
          <div style={{ flex: 1, height: 1, background: HAIR }}/>
        </div>

        <button style={{
          width: '100%', height: 48, borderRadius: 14, border: `1px solid ${HAIR}`,
          background: 'transparent', color: INK, fontFamily: SANS, fontSize: 14.5, fontWeight: 500,
          cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        }}>
          Continue with Apple
        </button>
      </div>

      <div style={{ marginTop: 'auto', textAlign: 'center', paddingTop: 16 }}>
        <MLabel>No account? <span style={{ color: TEAL }}>Sign up at shape.app →</span></MLabel>
      </div>
    </div>
  );
}

function Field({ label, value, onChange, type = 'text' }) {
  return (
    <div style={{
      borderRadius: 12, padding: '11px 14px',
      background: 'rgba(242,237,228,0.035)', border: `1px solid ${HAIR}`,
    }}>
      <div style={{ fontFamily: MONO, fontSize: 10, color: INK_45, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{label}</div>
      <input value={value} onChange={(e) => onChange(e.target.value)} type={type} style={{
        border: 0, outline: 0, width: '100%', fontSize: 17, marginTop: 4,
        fontFamily: SANS, background: 'transparent', color: INK,
      }}/>
    </div>
  );
}

Object.assign(window, {
  SERIF, SANS, MONO, PAPER, PAPER2, INK, INK_60, INK_45, INK_30, HAIR, HAIR_S, TEAL, GOLD, CORAL, PLUM,
  NavBar, TabBar, Screen, TabScreen, SectionHeader, EdCard, MLabel, MStats, AvatarChip, IconBtn,
  Splash, Login, ShapeMark, Field, Pill, PlayFab, Attribution, TrackRow, CurveDecor, List, Row,
});
