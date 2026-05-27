// ═══════════════════════════════════════════════════════════
// HOME WIDGETS v2 — sculpted, distinct silhouettes per metric
//
// Each widget is a custom composition rather than a uniform card.
// We use clip-paths, asymmetric layouts, layered numerals, ticker-tape
// strips, and editorial flourishes so they read as distinct objects.
// ═══════════════════════════════════════════════════════════

const { useState: useStateBSW } = React;
const { useBS: useBSW, BSHalftone: BSHalftoneW } = window;

// ─── Frame: replaces BSCell with subtler, rule-based chrome ──
// Default = no full border. Just a tonal corner mark + bottom rule.
// Variants: 'plain' | 'inset' | 'stamp' | 'plate'
// All widgets share a fixed-height frame so the home grid is uniform.
const WIDGET_H = 168;
function WFrame({ children, accent, variant = 'plain', style }) {
  const t = useBSW();
  const bg = variant === 'plate' ? t.INK : variant === 'inset' ? t.PAPER2 : t.PAPER;
  const fg = variant === 'plate' ? t.PAPER : t.INK;
  return (
    <div style={{
      position: 'relative',
      background: bg,
      color: fg,
      padding: 12,
      height: WIDGET_H,
      minWidth: 0,
      border: variant === 'plate' ? 0 : `1px solid ${t.RULE}`,
      borderRadius: t.RADIUS,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
      ...style,
    }}>
      {accent && variant !== 'plate' && (
        <div style={{ position: 'absolute', top: 0, left: 0, height: 2, width: 32, background: accent, borderTopLeftRadius: t.RADIUS }} />
      )}
      {children}
    </div>
  );
}

// ─── Tiny eyebrow used inside widgets ────────────────────────
function WEyebrow({ children, color, accent }) {
  const t = useBSW();
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      {accent && <span style={{ width: 6, height: 6, background: accent, borderRadius: 999 }} />}
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: color || t.INK70, fontWeight: 800 }}>{children}</div>
    </div>
  );
}

// ─── Sparkline — area variant + dot ──────────────────────────
function WSpark({ values, w = '100%', h = 36, stroke, fill }) {
  const t = useBSW();
  const c = stroke || t.INK;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 100; // viewBox width — scaled by SVG to fit container
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return [x, y];
  });
  const line = pts.map(([x,y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const area = `M 0,${h} L ${line.split(' ').join(' L ')} L ${W},${h} Z`;
  const last = pts[pts.length-1];
  return (
    <svg width={w} height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      {fill && <path d={area} fill={fill} opacity="0.18" vectorEffect="non-scaling-stroke" />}
      <polyline points={line} fill="none" stroke={c} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="1.5" fill={t.PAPER} stroke={c} strokeWidth="0.8" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

// ═══════════════════════════════════════════════════════════
// 1. STREAK — layered numeral + flame-tab silhouette
// ═══════════════════════════════════════════════════════════
function WStreak() {
  const t = useBSW();
  const days = 47, target = 60;
  const week = [1,1,1,0,1,1,1];
  return (
    <WFrame accent={t.GREEN}>
      <WEyebrow accent={t.GREEN}>Streak</WEyebrow>
      <div style={{ marginTop: 4, position: 'relative', lineHeight: 0.82 }}>
        <div style={{
          position: 'absolute', top: 4, left: 3,
          fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 64,
          letterSpacing: '-0.05em', color: t.GREEN, opacity: 0.22,
        }}>{days}</div>
        <div style={{
          position: 'relative',
          fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 64,
          letterSpacing: '-0.05em', color: t.INK,
        }}>{days}<span style={{ fontSize: 14, color: t.INK70, marginLeft: 4, letterSpacing: 0 }}>days</span></div>
      </div>
      <div style={{ flex: 1 }} />
      <div>
        <div style={{ display: 'flex', gap: 3 }}>
          {week.map((d, i) => (
            <div key={i} style={{
              flex: 1, height: 12,
              background: d ? t.GREEN : 'transparent',
              border: `1px solid ${t.INK}`,
              outline: i === 6 ? `1px solid ${t.INK}` : 'none',
              outlineOffset: i === 6 ? 2 : 0,
            }} />
          ))}
        </div>
        <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700 }}>
          Goal {target} · {target-days} to go
        </div>
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 2. MACROS — three vertical "test tubes" with overlap
// ═══════════════════════════════════════════════════════════
function WMacros() {
  const t = useBSW();
  const macros = [
    { k: 'P', v: 142, goal: 180, color: t.RUST },
    { k: 'C', v: 220, goal: 280, color: t.AMBER },
    { k: 'F', v: 64,  goal: 80,  color: t.BLUE  },
  ];
  return (
    <WFrame accent={t.AMBER}>
      <WEyebrow accent={t.AMBER}>Macros · today</WEyebrow>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, alignItems: 'end', marginTop: 6 }}>
        {macros.map(m => {
          const pct = m.v / m.goal;
          return (
            <div key={m.k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 3 }}>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 18, lineHeight: 0.9, letterSpacing: '-0.02em' }}>{m.v}<span style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em', marginLeft: 2 }}>/{m.goal}</span></div>
              <svg viewBox="0 0 30 50" width="100%" style={{ display: 'block', maxHeight: 60 }}>
                <defs>
                  <clipPath id={`bk${m.k}`}><path d="M 4 2 L 26 2 L 26 14 L 30 48 L 0 48 L 4 14 Z" /></clipPath>
                </defs>
                <path d="M 4 2 L 26 2 L 26 14 L 30 48 L 0 48 L 4 14 Z" fill={t.PAPER2} stroke={t.INK} strokeWidth="1" />
                <rect x="0" y={50 - pct*46} width="30" height={pct*46} fill={m.color} clipPath={`url(#bk${m.k})`} />
                {[0.25, 0.5, 0.75].map((p, i) => (
                  <line key={i} x1="0" x2="6" y1={50-p*46} y2={50-p*46} stroke={t.INK} strokeWidth="0.8" opacity="0.5" />
                ))}
              </svg>
              <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', color: t.INK70, fontWeight: 800 }}>{m.k}</div>
            </div>
          );
        })}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 3. WEIGHT — newspaper "stock chart" with delta marquee
// ═══════════════════════════════════════════════════════════
function WWeight() {
  const t = useBSW();
  const series = [184.2, 184.0, 183.6, 183.8, 183.2, 182.9, 182.4];
  const cur = series[series.length-1];
  const start = series[0];
  const delta = (cur - start);
  const isDown = delta < 0;
  return (
    <WFrame accent={t.BLUE}>
      <WEyebrow accent={t.BLUE}>Weight · 7d</WEyebrow>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 36, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
        {cur}
        <span style={{ fontSize: 13, fontWeight: 600, color: t.INK70, marginLeft: 3 }}>lb</span>
      </div>
      <div style={{
        display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 4, marginTop: 4,
        padding: '2px 6px', background: isDown ? t.GREEN : t.RUST, color: t.PAPER,
        fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', fontWeight: 800,
      }}>
        {isDown ? '▼' : '▲'} {Math.abs(delta).toFixed(1)} LB · 7D
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', marginTop: 6 }}>
        <WSpark values={series} h={42} stroke={t.BLUE} fill={t.BLUE} />
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 4. VO₂ MAX — split half-circle dial with percentile ladder
// ═══════════════════════════════════════════════════════════
function WVO2() {
  const t = useBSW();
  const v = 48, max = 60;
  const pct = v / max;
  const r = 38, cx = 50, cy = 50;
  const angle = 180 + 180 * pct;
  const a1 = 180 * Math.PI / 180;
  const a2 = angle * Math.PI / 180;
  const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
  const x2 = cx + r * Math.cos(a2), y2 = cy + r * Math.sin(a2);
  const arc = `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  return (
    <WFrame accent={t.RUST}>
      <WEyebrow accent={t.RUST}>VO₂ Max</WEyebrow>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 38, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
        {v}<span style={{ fontSize: 13, color: t.INK70, marginLeft: 4 }}>ml/kg</span>
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', justifyContent: 'center', position: 'relative' }}>
        <svg width="100%" height="50" viewBox="0 0 100 56" preserveAspectRatio="xMidYMax meet">
          <path d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`} fill="none" stroke={t.HAIR} strokeWidth="8" />
          <path d={arc} fill="none" stroke={t.RUST} strokeWidth="8" strokeLinecap="butt" />
          {[0.25, 0.5, 0.75].map((p, i) => {
            const a = (180 + 180 * p) * Math.PI / 180;
            const tx1 = cx + (r - 6) * Math.cos(a), ty1 = cy + (r - 6) * Math.sin(a);
            const tx2 = cx + (r + 6) * Math.cos(a), ty2 = cy + (r + 6) * Math.sin(a);
            return <line key={i} x1={tx1} y1={ty1} x2={tx2} y2={ty2} stroke={t.INK} strokeWidth="1" />;
          })}
        </svg>
      </div>
      <div style={{ borderRadius: t.RADIUS_SM,
        alignSelf: 'flex-start', marginTop: 4, padding: '2px 6px',
        border: `1px solid ${t.INK}`, background: t.PAPER,
        fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', fontWeight: 800, textTransform: 'uppercase',
      }}>★ Top 12% · age 32</div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 5. WATER — wave-fill bottle + cup grid
// ═══════════════════════════════════════════════════════════
function WWater() {
  const t = useBSW();
  const [filled, setFilled] = useStateBSW(5);
  const total = 8;
  const pct = filled / total;
  return (
    <WFrame accent={t.BLUE}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <svg width="34" height="66" viewBox="0 0 48 92" style={{ flexShrink: 0 }}>
          <defs>
            <clipPath id="bottle">
              <path d="M 18 2 L 30 2 L 30 12 L 36 22 L 38 88 L 10 88 L 12 22 L 18 12 Z" />
            </clipPath>
          </defs>
          <path d="M 18 2 L 30 2 L 30 12 L 36 22 L 38 88 L 10 88 L 12 22 L 18 12 Z" fill={t.PAPER2} stroke={t.INK} strokeWidth="1.2" />
          <rect x="0" y={92 - pct * 78} width="48" height={pct * 78} fill={t.BLUE} clipPath="url(#bottle)" />
          <path d={`M 0 ${92 - pct * 78} Q 12 ${92 - pct * 78 - 4} 24 ${92 - pct * 78} T 48 ${92 - pct * 78} L 48 92 L 0 92 Z`} fill={t.BLUE} clipPath="url(#bottle)" opacity="0.7" />
        </svg>
        <div style={{ flex: 1, minWidth: 0 }}>
          <WEyebrow accent={t.BLUE}>Water</WEyebrow>
          <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 30, lineHeight: 0.9, letterSpacing: '-0.03em' }}>
            {filled}<span style={{ fontSize: 14, color: t.INK70 }}>/{total}</span>
          </div>
        </div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(8, 1fr)', gap: 2 }}>
        {Array.from({length: total}).map((_, i) => (
          <button key={i} onClick={(e) => { e.stopPropagation(); setFilled(f => f === i+1 ? i : i+1); }} style={{ borderRadius: t.RADIUS_SM,
            height: 14, border: `1px solid ${t.INK}`,
            background: i < filled ? t.BLUE : 'transparent', cursor: 'pointer', padding: 0,
          }} />
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 6. SLEEP — moon-arc + 7 phase bars
// ═══════════════════════════════════════════════════════════
function WSleep() {
  const t = useBSW();
  const series = [78, 82, 71, 88, 79, 84, 91];
  const score = series[series.length-1];
  return (
    <WFrame accent={t.BLUE} variant="inset">
      <WEyebrow accent={t.BLUE}>Sleep · last night</WEyebrow>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 38, lineHeight: 0.9, letterSpacing: '-0.04em' }}>
        {score}<span style={{ fontSize: 13, color: t.INK70, marginLeft: 3 }}>/100</span>
      </div>
      <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK, fontWeight: 700 }}>7h 24m · efficient</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 30 }}>
        {series.map((s, i) => (
          <div key={i} style={{
            flex: 1, height: `${s}%`,
            background: i === series.length-1 ? t.INK : t.BLUE,
            opacity: i === series.length-1 ? 1 : 0.4,
          }} />
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 7. HRV — recovery ribbon
// ═══════════════════════════════════════════════════════════
function WHRV() {
  const t = useBSW();
  const series = [42, 45, 48, 41, 50, 53, 49, 52, 55, 51, 54, 58, 56, 60];
  const cur = series[series.length-1];
  const baseline = 50;
  return (
    <WFrame accent={t.GREEN}>
      <WEyebrow accent={t.GREEN}>HRV · 14d</WEyebrow>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 36, lineHeight: 0.88, letterSpacing: '-0.04em' }}>
        {cur}<span style={{ fontSize: 13, color: t.INK70, marginLeft: 3 }}>ms</span>
      </div>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 4, marginTop: 4, fontFamily: t.MONO, fontSize: 9, color: t.GREEN, fontWeight: 800, letterSpacing: '0.12em' }}>
        ↑ +18 MS · TRENDING UP
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', marginTop: 6 }}>
        <svg width="100%" height="44" viewBox="0 0 144 44" preserveAspectRatio="none" style={{ display: 'block' }}>
          {(() => {
            const w = 144, h = 44;
            const min = Math.min(...series, baseline-5);
            const max = Math.max(...series, baseline+5);
            const range = max - min;
            const yOf = v => h - ((v - min)/range) * (h - 6) - 3;
            const pts = series.map((v,i) => `${(i/(series.length-1))*w},${yOf(v).toFixed(1)}`).join(' ');
            return <>
              <line x1="0" x2={w} y1={yOf(baseline)} y2={yOf(baseline)} stroke={t.INK} strokeWidth="0.8" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
              <polyline points={pts} fill="none" stroke={t.GREEN} strokeWidth="1.8" vectorEffect="non-scaling-stroke" />
            </>;
          })()}
        </svg>
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 8. STEPS — chunky progress bar with milestone tick
// ═══════════════════════════════════════════════════════════
function WSteps() {
  const t = useBSW();
  const steps = 8420, goal = 10000;
  const pct = Math.min(steps/goal, 1);
  return (
    <WFrame accent={t.AMBER}>
      <WEyebrow accent={t.AMBER}>Steps · today</WEyebrow>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 36, lineHeight: 0.9, letterSpacing: '-0.045em' }}>
        {steps.toLocaleString()}
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.12em', marginTop: 2 }}>OF {goal.toLocaleString()} · {Math.round(pct*100)}%</div>
      <div style={{ flex: 1 }} />
      <div style={{ position: 'relative', height: 14, background: t.PAPER2, border: `1px solid ${t.INK}`, marginTop: 12 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${pct*100}%`, background: t.AMBER }} />
        <div style={{ position: 'absolute', top: -3, bottom: -3, left: '50%', width: 1, background: t.INK }} />
        <div style={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontFamily: t.MONO, fontSize: 7, letterSpacing: '0.18em', color: t.INK70, fontWeight: 800 }}>5K</div>
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 9. PRs — newspaper masthead-style stack
// ═══════════════════════════════════════════════════════════
function WPR() {
  const t = useBSW();
  const prs = [
    { lift: 'Deadlift', val: '405', unit: '× 3', date: 'TUE' },
    { lift: 'Squat',    val: '315', unit: '× 5', date: 'SAT' },
    { lift: 'Bench',    val: '245', unit: '× 4', date: 'MON' },
  ];
  return (
    <WFrame accent={t.RUST}>
      <WEyebrow accent={t.RUST}>★ Personal records</WEyebrow>
      <div style={{ flex: 1, marginTop: 6, display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {prs.map((p, i) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '28px 1fr auto', alignItems: 'baseline', gap: 6,
            padding: '4px 0',
            borderTop: i === 0 ? `1px solid ${t.INK}` : `1px solid ${t.HAIR}`,
            borderBottom: i === prs.length-1 ? `1px solid ${t.INK}` : 'none',
          }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', color: t.INK70, fontWeight: 800 }}>{p.date}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 14, letterSpacing: '-0.01em', color: t.INK }}>{p.lift}</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 18, color: t.RUST, letterSpacing: '-0.02em', lineHeight: 1 }}>{p.val}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK70, fontWeight: 700, letterSpacing: '0.1em' }}>{p.unit}</div>
            </div>
          </div>
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 10. MOOD — 5-segment radial picker
// ═══════════════════════════════════════════════════════════
function WMood() {
  const t = useBSW();
  const [pick, setPick] = useStateBSW(3);
  const labels = ['Rough','Meh','OK','Good','Great'];
  const colors = [t.RUST, t.AMBER, t.INK70, t.BLUE, t.GREEN];
  return (
    <WFrame accent={colors[pick]}>
      <WEyebrow accent={colors[pick]}>How you feel</WEyebrow>
      <div style={{
        marginTop: 6, fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 30, letterSpacing: '-0.02em',
        color: colors[pick], lineHeight: 0.9,
      }}>{labels[pick]}<span style={{ color: t.INK70, fontSize: 13, marginLeft: 4 }}>{pick+1}/5</span></div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 3 }}>
        {labels.map((m, i) => (
          <button key={i} onClick={(e) => { e.stopPropagation(); setPick(i); }} style={{ borderRadius: t.RADIUS_SM,
            flex: 1, height: 32, padding: 0, cursor: 'pointer',
            border: `1px solid ${t.INK}`,
            background: i === pick ? colors[i] : 'transparent',
            color: i === pick ? t.PAPER : t.INK,
            fontFamily: t.DISPLAY, fontSize: 14, fontWeight: t.W.displayHeavy,
            transform: i === pick ? 'translateY(-2px)' : 'none',
            transition: 'transform 0.15s',
          }}>{i+1}</button>
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 11. FOCUS — clock face with arc
// ═══════════════════════════════════════════════════════════
function WFocus() {
  const t = useBSW();
  const min = 22, goal = 30;
  const pct = min/goal;
  const r = 26, cx = 32, cy = 32;
  const c = 2*Math.PI*r;
  return (
    <WFrame accent={t.BLUE}>
      <WEyebrow accent={t.BLUE}>Focus</WEyebrow>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 4 }}>
        <svg width="90" height="90" viewBox="0 0 64 64">
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={t.HAIR} strokeWidth="3" />
          <circle cx={cx} cy={cy} r={r} fill="none" stroke={t.BLUE} strokeWidth="3" strokeDasharray={c} strokeDashoffset={c*(1-pct)} transform={`rotate(-90 ${cx} ${cy})`} />
          {Array.from({length:12}).map((_, i) => {
            const a = (i*30 - 90) * Math.PI/180;
            const x1 = cx + (r-3)*Math.cos(a), y1 = cy + (r-3)*Math.sin(a);
            const x2 = cx + (r+3)*Math.cos(a), y2 = cy + (r+3)*Math.sin(a);
            return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={t.INK} strokeWidth={i%3===0 ? 1.4 : 0.6} />;
          })}
          <text x={cx} y={cy+5} textAnchor="middle" fontFamily={t.DISPLAY} fontSize="16" fontWeight="800" fill={t.INK} letterSpacing="-0.02em">{min}</text>
        </svg>
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700, textAlign: 'center' }}>
        {min} / {goal} MIN · 4 SESSIONS
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 12. BODY COMP — three-column ledger with delta arrows
// ═══════════════════════════════════════════════════════════
function WBody() {
  const t = useBSW();
  const cells = [
    { k: 'BF',     v: '14.2', unit: '%',  d: '−0.3', dir: 'down' },
    { k: 'Muscle', v: '154',  unit: 'lb', d: '+1.1', dir: 'up'   },
    { k: 'Weight', v: '182',  unit: 'lb', d: '−1.8', dir: 'down' },
  ];
  return (
    <WFrame accent={t.RUST}>
      <WEyebrow accent={t.RUST}>Body comp · 30d</WEyebrow>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', marginTop: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `1.5px solid ${t.INK}`, borderBottom: `1.5px solid ${t.INK}`, width: '100%' }}>
          {cells.map((c, i) => (
            <div key={i} style={{
              padding: '8px 4px',
              borderRight: i < cells.length-1 ? `1px solid ${t.HAIR}` : 'none',
            }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.2em', color: t.INK70, fontWeight: 800 }}>{c.k.toUpperCase()}</div>
              <div style={{ marginTop: 2, display: 'flex', alignItems: 'baseline', gap: 2 }}>
                <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 22, color: t.INK, letterSpacing: '-0.025em', lineHeight: 0.9 }}>{c.v}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK70, fontWeight: 700 }}>{c.unit}</div>
              </div>
              <div style={{
                marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 3,
                fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em',
                color: (c.k === 'Muscle' ? c.dir === 'up' : c.dir === 'down') ? t.GREEN : t.RUST,
              }}>
                {c.dir === 'down' ? '▼' : '▲'} {c.d.replace('−','-')}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', color: t.INK70, fontWeight: 700, textAlign: 'right' }}>DEXA · APR 18</div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 13. CALORIES — energy in vs out (kcal balance)
// ═══════════════════════════════════════════════════════════
function WCalories() {
  const t = useBSW();
  const inK = 2180, outK = 2640, target = 2400;
  const balance = inK - outK;
  const isDeficit = balance < 0;
  const inPct = Math.min(inK / target, 1.2);
  const outPct = Math.min(outK / target, 1.2);
  return (
    <WFrame accent={t.AMBER}>
      <WEyebrow accent={t.AMBER}>Calories · today</WEyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 30, lineHeight: 0.9, letterSpacing: '-0.04em', color: isDeficit ? t.GREEN : t.RUST }}>
          {isDeficit ? '−' : '+'}{Math.abs(balance)}
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>KCAL</div>
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700, marginTop: 2 }}>
        {isDeficit ? 'Deficit' : 'Surplus'} · target {target}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK70, fontWeight: 800, letterSpacing: '0.14em', width: 22 }}>IN</div>
          <div style={{ flex: 1, height: 8, background: t.PAPER2, border: `1px solid ${t.INK}`, position: 'relative', borderRadius: t.RADIUS_SM, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${(inPct/1.2)*100}%`, background: t.AMBER }} />
          </div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 12, letterSpacing: '-0.01em', minWidth: 32, textAlign: 'right' }}>{inK}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK70, fontWeight: 800, letterSpacing: '0.14em', width: 22 }}>OUT</div>
          <div style={{ flex: 1, height: 8, background: t.PAPER2, border: `1px solid ${t.INK}`, position: 'relative', borderRadius: t.RADIUS_SM, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', inset: 0, width: `${(outPct/1.2)*100}%`, background: t.RUST }} />
          </div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 12, letterSpacing: '-0.01em', minWidth: 32, textAlign: 'right' }}>{outK}</div>
        </div>
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 14. RESTING HR — line + zones legend
// ═══════════════════════════════════════════════════════════
function WRestingHR() {
  const t = useBSW();
  const series = [62, 60, 58, 61, 57, 56, 58, 55, 54, 56, 53, 52, 54, 51];
  const cur = series[series.length - 1];
  const baseline = 58;
  const delta = cur - baseline;
  return (
    <WFrame accent={t.RUST}>
      <WEyebrow accent={t.RUST}>Resting HR · 14d</WEyebrow>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 36, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{cur}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>BPM</div>
      </div>
      <div style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: 4, marginTop: 4, padding: '2px 6px', borderRadius: t.RADIUS_SM, background: delta < 0 ? t.GREEN : t.RUST, color: t.PAPER, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em' }}>
        {delta < 0 ? '▼' : '▲'} {Math.abs(delta)} VS BASELINE
      </div>
      <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', marginTop: 6 }}>
        <WSpark values={series} h={32} stroke={t.RUST} fill={t.RUST} />
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 15. TRAINING LOAD — acute:chronic ratio + weekly tonnage
// ═══════════════════════════════════════════════════════════
function WLoad() {
  const t = useBSW();
  const acute = 412, chronic = 380;
  const ratio = (acute / chronic).toFixed(2);
  // Optimal zone: 0.8–1.3
  const inZone = ratio >= 0.8 && ratio <= 1.3;
  const dayBars = [42, 0, 68, 51, 0, 88, 73]; // tonnage by day
  const max = Math.max(...dayBars);
  return (
    <WFrame accent={t.GREEN}>
      <WEyebrow accent={inZone ? t.GREEN : t.RUST}>Training load</WEyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 30, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{ratio}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>A:C</div>
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: inZone ? t.GREEN : t.RUST, fontWeight: 800, marginTop: 2 }}>
        {inZone ? 'Sweet spot' : ratio > 1.3 ? 'Spike — careful' : 'Detraining'}
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 36 }}>
        {dayBars.map((v, i) => (
          <div key={i} style={{ flex: 1, height: `${(v/max)*100 || 4}%`, background: v ? t.GREEN : t.HAIR, border: v ? `1px solid ${t.INK}` : 'none', borderRadius: 2 }} />
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 3 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', color: t.INK70, fontWeight: 700, flex: 1, textAlign: 'center' }}>{d}</div>
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 16. READINESS — composite recovery score
// ═══════════════════════════════════════════════════════════
function WReadiness() {
  const t = useBSW();
  const score = 82;
  const inputs = [
    { k: 'Sleep',   v: 88, color: t.BLUE  },
    { k: 'HRV',     v: 76, color: t.GREEN },
    { k: 'RHR',     v: 84, color: t.RUST  },
    { k: 'Strain',  v: 79, color: t.AMBER },
  ];
  return (
    <WFrame accent={t.GREEN} variant="inset">
      <WEyebrow accent={t.GREEN}>Readiness</WEyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 38, lineHeight: 0.9, letterSpacing: '-0.045em', color: score >= 75 ? t.GREEN : score >= 50 ? t.AMBER : t.RUST }}>{score}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>/100</div>
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK, fontWeight: 700, marginTop: 2 }}>Push hard today</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
        {inputs.map(i => (
          <div key={i.k}>
            <div style={{ height: 4, background: t.HAIR, position: 'relative', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ position: 'absolute', inset: 0, width: `${i.v}%`, background: i.color }} />
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', color: t.INK70, fontWeight: 800, marginTop: 3 }}>{i.k.toUpperCase()}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 12, fontWeight: t.W.displayHeavy, letterSpacing: '-0.01em', color: t.INK, lineHeight: 1 }}>{i.v}</div>
          </div>
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 17. ADHERENCE — workouts completed this week
// ═══════════════════════════════════════════════════════════
function WAdherence() {
  const t = useBSW();
  // 7-day plan: 'done' | 'miss' | 'rest' | 'todo'
  const week = [
    { d: 'M', s: 'done' },
    { d: 'T', s: 'done' },
    { d: 'W', s: 'rest' },
    { d: 'T', s: 'done' },
    { d: 'F', s: 'miss' },
    { d: 'S', s: 'todo' },
    { d: 'S', s: 'todo' },
  ];
  const completed = week.filter(w => w.s === 'done').length;
  const planned = week.filter(w => w.s !== 'rest').length;
  const pct = Math.round((completed / planned) * 100);
  return (
    <WFrame accent={t.BLUE}>
      <WEyebrow accent={t.BLUE}>Adherence · this week</WEyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 32, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{completed}/{planned}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>· {pct}%</div>
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700, marginTop: 2 }}>Sessions completed</div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', gap: 3 }}>
        {week.map((w, i) => {
          const bg = w.s === 'done' ? t.GREEN : w.s === 'miss' ? t.RUST : w.s === 'rest' ? t.HAIR : 'transparent';
          const fg = w.s === 'todo' ? t.INK : t.PAPER;
          const border = w.s === 'rest' ? t.INK70 : t.INK;
          return (
            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <div style={{ width: '100%', height: 26, background: bg, color: fg, border: `1px solid ${border}`, borderRadius: t.RADIUS_SM, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.MONO, fontSize: 11, fontWeight: 800 }}>
                {w.s === 'done' ? '✓' : w.s === 'miss' ? '✕' : w.s === 'rest' ? '·' : ''}
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', color: t.INK70, fontWeight: 800 }}>{w.d}</div>
            </div>
          );
        })}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 18. MEASUREMENTS — circumference deltas (waist/chest/hip/arm)
// ═══════════════════════════════════════════════════════════
function WMeasurements() {
  const t = useBSW();
  const m = [
    { k: 'Waist',  v: '32.0', d: '−0.8', dir: 'down', good: 'down' },
    { k: 'Chest',  v: '42.5', d: '+0.4', dir: 'up',   good: 'up'   },
    { k: 'Hip',    v: '38.2', d: '−0.3', dir: 'down', good: 'down' },
    { k: 'Arm',    v: '15.1', d: '+0.2', dir: 'up',   good: 'up'   },
  ];
  return (
    <WFrame accent={t.RUST}>
      <WEyebrow accent={t.RUST}>Measurements · 30d</WEyebrow>
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 4, marginTop: 4 }}>
        {m.map((c, i) => {
          const isGood = c.dir === c.good;
          return (
            <div key={i} style={{ padding: '4px 0', borderTop: `1px solid ${t.HAIR}`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 }}>
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.18em', color: t.INK70, fontWeight: 800, textTransform: 'uppercase' }}>{c.k}</div>
                <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 16, letterSpacing: '-0.02em', lineHeight: 1, color: t.INK }}>
                  {c.v}<span style={{ fontFamily: t.MONO, fontSize: 7.5, color: t.INK70, fontWeight: 700, marginLeft: 2 }}>in</span>
                </div>
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', color: isGood ? t.GREEN : t.RUST }}>
                {c.dir === 'down' ? '▼' : '▲'} {c.d.replace('−','-')}
              </div>
            </div>
          );
        })}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 19. FIBER & MICROS — nutrient quality dashboard
// ═══════════════════════════════════════════════════════════
function WMicros() {
  const t = useBSW();
  const items = [
    { k: 'Fiber',   v: 28, goal: 35, unit: 'g',  color: t.GREEN },
    { k: 'Sugar',   v: 42, goal: 50, unit: 'g',  color: t.AMBER, max: true }, // lower is better
    { k: 'Sodium',  v: 1880, goal: 2300, unit: 'mg', color: t.RUST, max: true },
    { k: 'Iron',    v: 14, goal: 18, unit: 'mg', color: t.BLUE },
  ];
  return (
    <WFrame accent={t.GREEN}>
      <WEyebrow accent={t.GREEN}>Nutrient quality</WEyebrow>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5, marginTop: 6 }}>
        {items.map(i => {
          const pct = Math.min(i.v / i.goal, 1);
          return (
            <div key={i.k} style={{ display: 'grid', gridTemplateColumns: '38px 1fr auto', alignItems: 'center', gap: 6 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', color: t.INK70, fontWeight: 800 }}>{i.k.toUpperCase()}</div>
              <div style={{ height: 7, background: t.PAPER2, border: `1px solid ${t.INK}`, borderRadius: t.RADIUS_SM, position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', inset: 0, width: `${pct*100}%`, background: i.color }} />
              </div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 11, fontWeight: t.W.displayHeavy, letterSpacing: '-0.01em', color: t.INK, lineHeight: 1, textAlign: 'right', minWidth: 38 }}>
                {i.v}<span style={{ fontFamily: t.MONO, fontSize: 7.5, color: t.INK70, fontWeight: 700 }}>/{i.goal}</span>
              </div>
            </div>
          );
        })}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 20. ZONE 2 — weekly cardio minutes by intensity zone
// ═══════════════════════════════════════════════════════════
function WZones() {
  const t = useBSW();
  // Minutes per zone this week
  const z = [
    { z: 'Z1', min: 145, color: t.HAIR },
    { z: 'Z2', min: 88,  color: t.GREEN },
    { z: 'Z3', min: 32,  color: t.AMBER },
    { z: 'Z4', min: 18,  color: t.RUST },
    { z: 'Z5', min: 6,   color: t.INK   },
  ];
  const total = z.reduce((s, x) => s + x.min, 0);
  const z2 = z[1].min;
  const goal = 150;
  return (
    <WFrame accent={t.GREEN}>
      <WEyebrow accent={t.GREEN}>HR zones · 7d</WEyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 28, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{z2}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>MIN Z2 · /{goal}</div>
      </div>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700, marginTop: 2 }}>{total} min total</div>
      <div style={{ flex: 1 }} />
      {/* Stacked bar */}
      <div style={{ display: 'flex', height: 14, border: `1px solid ${t.INK}`, borderRadius: t.RADIUS_SM, overflow: 'hidden' }}>
        {z.map(zo => (
          <div key={zo.z} style={{ flex: zo.min, background: zo.color }} />
        ))}
      </div>
      <div style={{ display: 'flex', marginTop: 4 }}>
        {z.map(zo => (
          <div key={zo.z} style={{ flex: zo.min, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', color: t.INK70, fontWeight: 800, textAlign: 'center' }}>{zo.z}</div>
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 21. PROTEIN TIMING — distribution across meals
// ═══════════════════════════════════════════════════════════
function WProteinTiming() {
  const t = useBSW();
  const meals = [
    { k: 'B', label: 'Breakfast', g: 32, target: 40 },
    { k: 'L', label: 'Lunch',     g: 48, target: 40 },
    { k: 'S', label: 'Snack',     g: 18, target: 20 },
    { k: 'D', label: 'Dinner',    g: 44, target: 40 },
  ];
  const total = meals.reduce((s, m) => s + m.g, 0);
  const targetTotal = meals.reduce((s, m) => s + m.target, 0);
  const max = Math.max(...meals.map(m => Math.max(m.g, m.target)));
  return (
    <WFrame accent={t.RUST}>
      <WEyebrow accent={t.RUST}>Protein timing</WEyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 28, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{total}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>G · /{targetTotal}</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 4, height: 44 }}>
        {meals.map(m => {
          const h = (m.g / max) * 100;
          const tH = (m.target / max) * 100;
          const hit = m.g >= m.target;
          return (
            <div key={m.k} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', position: 'relative', height: '100%' }}>
              <div style={{ position: 'absolute', bottom: `${tH}%`, left: 0, right: 0, height: 1, background: t.INK, opacity: 0.5 }} />
              <div style={{ width: '90%', height: `${h}%`, background: hit ? t.RUST : t.PAPER2, border: `1px solid ${t.INK}`, borderRadius: 2 }} />
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 4, marginTop: 3 }}>
        {meals.map(m => (
          <div key={m.k} style={{ flex: 1, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', color: t.INK70, fontWeight: 800, textAlign: 'center' }}>{m.k}·{m.g}</div>
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// 22. SORENESS / RPE — body map heat indicator
// ═══════════════════════════════════════════════════════════
function WSoreness() {
  const t = useBSW();
  // 1=fresh, 5=very sore
  const parts = [
    { k: 'Quads',     v: 4 },
    { k: 'Hamstrings',v: 3 },
    { k: 'Glutes',    v: 4 },
    { k: 'Back',      v: 2 },
    { k: 'Chest',     v: 1 },
    { k: 'Shoulders', v: 2 },
  ];
  const avg = (parts.reduce((s, p) => s + p.v, 0) / parts.length).toFixed(1);
  const heat = (v) => v >= 4 ? t.RUST : v >= 3 ? t.AMBER : v >= 2 ? t.BLUE : t.GREEN;
  return (
    <WFrame accent={t.RUST}>
      <WEyebrow accent={t.RUST}>Soreness · today</WEyebrow>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 4 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 28, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{avg}</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK70, fontWeight: 700, letterSpacing: '0.14em' }}>/5 AVG</div>
      </div>
      <div style={{ flex: 1 }} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3 }}>
        {parts.map(p => (
          <div key={p.k} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <div style={{ width: 14, height: 14, background: heat(p.v), border: `1px solid ${t.INK}`, borderRadius: t.RADIUS_SM, flexShrink: 0 }} />
            <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', color: t.INK70, fontWeight: 800, textTransform: 'uppercase', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.k}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 10, fontWeight: t.W.displayHeavy, color: t.INK }}>{p.v}</div>
          </div>
        ))}
      </div>
    </WFrame>
  );
}

// ═══════════════════════════════════════════════════════════
// REGISTRY
// ═══════════════════════════════════════════════════════════
const BS_WIDGETS = {
  // ─── Daily fundamentals
  streak:    { label: 'Streak',         hint: 'Layered numeral · week dots',     Render: WStreak  },
  steps:     { label: 'Steps',          hint: 'Bar with 5k milestone tick',      Render: WSteps   },
  water:     { label: 'Water',          hint: 'Wave-fill bottle · 8 cups',       Render: WWater   },
  mood:      { label: 'Mood',           hint: 'Color-shifting 5-segment',        Render: WMood    },
  focus:     { label: 'Focus',          hint: 'Clock face + arc',                Render: WFocus   },

  // ─── Nutrition
  macros:    { label: 'Macros',         hint: 'Three beakers · P / C / F',       Render: WMacros  },
  calories:  { label: 'Calories',       hint: 'Energy in vs out · balance',      Render: WCalories },
  micros:    { label: 'Nutrient quality', hint: 'Fiber · sugar · sodium · iron', Render: WMicros },
  protein:   { label: 'Protein timing', hint: 'Distribution across meals',       Render: WProteinTiming },

  // ─── Cardio / cardiovascular
  vo2:       { label: 'VO₂ Max',        hint: 'Half-arc dial + percentile',      Render: WVO2     },
  resting:   { label: 'Resting HR',     hint: '14d trend vs baseline',           Render: WRestingHR },
  zones:     { label: 'HR zones',       hint: 'Z1–Z5 stacked · weekly',          Render: WZones   },

  // ─── Recovery
  sleep:     { label: 'Sleep',          hint: 'Score + 7-night phases',          Render: WSleep   },
  hrv:       { label: 'HRV',            hint: 'Baseline ribbon · 14 days',       Render: WHRV     },
  readiness: { label: 'Readiness',      hint: 'Composite recovery score',        Render: WReadiness },
  soreness:  { label: 'Soreness',       hint: 'Body-part RPE heat map',          Render: WSoreness },

  // ─── Strength / training
  prs:       { label: 'PRs',            hint: 'Three-record ledger',             Render: WPR      },
  load:      { label: 'Training load',  hint: 'Acute:chronic ratio + tonnage',   Render: WLoad    },
  adherence: { label: 'Adherence',      hint: 'Sessions completed · this week',  Render: WAdherence },

  // ─── Body composition
  weight:    { label: 'Weight',         hint: 'Stock-chart trend + delta tag',   Render: WWeight  },
  body:      { label: 'Body comp',      hint: 'BF · muscle · weight · 30d',      Render: WBody    },
  measure:   { label: 'Measurements',   hint: 'Waist · chest · hip · arm',       Render: WMeasurements },
};

// ─── Renderer used by Home ───────────────────────────────────
function BSWidgetSlot({ widgetKey, onRemove }) {
  const t = useBSW();
  const W = BS_WIDGETS[widgetKey];
  if (!W) return null;
  return (
    <div style={{ position: 'relative' }}>
      <W.Render compact />
      {onRemove && (
        <button onClick={(e) => { e.stopPropagation(); onRemove(widgetKey); }} style={{ borderRadius: t.RADIUS_SM,
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, border: `1px solid ${t.INK}`, background: t.PAPER, color: t.INK,
          fontFamily: t.MONO, fontSize: 12, lineHeight: 1, cursor: 'pointer', padding: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700,
        }} aria-label="Remove widget">×</button>
      )}
    </div>
  );
}

// ─── Picker grid (the "Add widgets" section at bottom of Home) ──
function BSWidgetPicker({ added = [], onAdd }) {
  const t = useBSW();
  const groups = [
    { title: 'Daily',         keys: ['streak','steps','water','mood','focus'] },
    { title: 'Nutrition',     keys: ['macros','calories','micros','protein'] },
    { title: 'Cardio',        keys: ['vo2','resting','zones'] },
    { title: 'Recovery',      keys: ['sleep','hrv','readiness','soreness'] },
    { title: 'Training',      keys: ['prs','load','adherence'] },
    { title: 'Body',          keys: ['weight','body','measure'] },
  ];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {groups.map(g => (
        <div key={g.title}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK70, fontWeight: 800, marginBottom: 6 }}>
            {g.title}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            {g.keys.map(k => {
              const W = BS_WIDGETS[k];
              if (!W) return null;
              const isAdded = added.includes(k);
              return (
                <button key={k} onClick={() => onAdd(k)} disabled={isAdded} style={{ borderRadius: t.RADIUS_SM,
                  textAlign: 'left', padding: 12, cursor: isAdded ? 'default' : 'pointer',
                  border: `1px solid ${t.INK}`, background: isAdded ? t.PAPER2 : t.PAPER,
                  opacity: isAdded ? 0.55 : 1, position: 'relative',
                }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 6 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 16, color: t.INK, letterSpacing: '-0.01em' }}>{W.label}</div>
                    <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', color: isAdded ? t.GREEN : t.INK70, fontWeight: 800 }}>
                      {isAdded ? '✓ ADDED' : '+ ADD'}
                    </div>
                  </div>
                  <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70, marginTop: 6, lineHeight: 1.4 }}>{W.hint}</div>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { BS_WIDGETS, BSWidgetSlot, BSWidgetPicker });
