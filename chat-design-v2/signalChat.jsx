// ════════════════════════════════════════════════════════════════════
// Shape · Community redux — shared kit
// Editorial "digital broadsheet". Newsreader (serif display), JetBrains
// Mono (labels/numbers), Space Grotesk (UI/body). Dark-first; adapts light.
// Tier color is social texture; teal is the system accent.
// ════════════════════════════════════════════════════════════════════
const { useState: useK, useEffect: useEffectK, useRef: useRefK, useMemo: useMemoK } = React;

// ── Type ──────────────────────────────────────────────────────────
const SERIF = "'Newsreader', Georgia, 'Times New Roman', serif";
const MONO  = "'JetBrains Mono', ui-monospace, monospace";
const SANS  = "'Space Grotesk', -apple-system, system-ui, sans-serif";

(function injectFonts() {
  if (document.getElementById('shape-redux-fonts')) return;
  const l = document.createElement('link');
  l.id = 'shape-redux-fonts'; l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;0,6..72,600;0,6..72,700;1,6..72,400;1,6..72,500;1,6..72,600&family=JetBrains+Mono:wght@400;500;600;700&family=Space+Grotesk:wght@300;400;500;600;700&display=swap';
  document.head.appendChild(l);
  // global resets + keyframes used by both directions
  if (!document.getElementById('shape-redux-css')) {
    const s = document.createElement('style');
    s.id = 'shape-redux-css';
    s.textContent = `
      .sk-scroll::-webkit-scrollbar{ display:none; }
      .sk-scroll{ scrollbar-width:none; -ms-overflow-style:none; }
      @keyframes skPulse { 0%{ transform:scale(1); opacity:.85 } 70%{ transform:scale(2.4); opacity:0 } 100%{ opacity:0 } }
      @keyframes skLive  { 0%,100%{ opacity:1 } 50%{ opacity:.35 } }
      @keyframes skRise  { from{ opacity:0; transform:translateY(8px) } to{ opacity:1; transform:translateY(0) } }
      @keyframes skMarq  { from{ transform:translateX(0) } to{ transform:translateX(-50%) } }
      @keyframes skBar   { from{ transform:scaleY(0.15) } to{ transform:scaleY(1) } }
      @media (prefers-reduced-motion: reduce){
        .sk-anim, .sk-live, .sk-pulse { animation: none !important; }
      }
    `;
    document.head.appendChild(s);
  }
})();

// ── Theme ─────────────────────────────────────────────────────────
function makeTheme(dark = true) {
  return dark ? {
    dark: true,
    PAPER:  '#0f0e0c', PAPER2: '#181612', PAPER3: '#221d18',
    INK:    '#f5f0e6',
    INK70:  'rgba(245,240,230,0.70)', INK50: 'rgba(245,240,230,0.50)',
    INK30:  'rgba(245,240,230,0.30)', RULE:  'rgba(245,240,230,0.22)',
    HAIR:   'rgba(245,240,230,0.10)', HAIR2: 'rgba(245,240,230,0.05)',
    TEAL:   '#34d6c5', inkRGB: '245,240,230',
  } : {
    dark: false,
    PAPER:  '#f5f0e6', PAPER2: '#ece4d3', PAPER3: '#e0d6c0',
    INK:    '#13110d',
    INK70:  'rgba(19,17,13,0.66)', INK50: 'rgba(19,17,13,0.48)',
    INK30:  'rgba(19,17,13,0.28)', RULE:  'rgba(19,17,13,0.22)',
    HAIR:   'rgba(19,17,13,0.12)', HAIR2: 'rgba(19,17,13,0.06)',
    TEAL:   '#0a8f87', inkRGB: '19,17,13',
  };
}

// ── Tiers (Shape Score) — the social texture ──────────────────────
const TIERS = {
  raw:    { name: 'Raw',    color: '#8a93a0', rank: 'I',   pts: '0+'      },
  tempo:  { name: 'Tempo',  color: '#d8a23a', rank: 'II',  pts: '750+'    },
  form:   { name: 'Form',   color: '#34d6c5', rank: 'III', pts: '2,000+'  },
  peak:   { name: 'Peak',   color: '#8a5cf6', rank: 'IV',  pts: '5,000+'  },
  legend: { name: 'Legend', color: '#e0518a', rank: 'V',   pts: '15,000+' },
};
// In light mode the teal Form tier needs a darker stop for contrast on cream.
function tierColor(key, dark = true) {
  const c = (TIERS[key] || TIERS.raw).color;
  if (!dark && key === 'form') return '#0a8f87';
  if (!dark && key === 'raw') return '#5b636e';
  return c;
}
function tierName(key) { return (TIERS[key] || TIERS.raw).name; }

// ── Roles ─────────────────────────────────────────────────────────
const ROLE = {
  client:       { label: 'Member',       color: null },
  trainer:      { label: 'Trainer',      color: '#c0533b' },
  nutritionist: { label: 'Nutritionist', color: '#a07a2e' },
};
function roleColor(role, dark = true) {
  if (role === 'trainer') return dark ? '#d4654a' : '#c0533b';
  if (role === 'nutritionist') return dark ? '#cda44e' : '#a07a2e';
  return null;
}

function hexA(hex, a) {
  let s = hex.replace('#', '');
  if (s.length === 3) s = s.split('').map(c => c + c).join('');
  const r = parseInt(s.slice(0, 2), 16), g = parseInt(s.slice(2, 4), 16), b = parseInt(s.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

// ── Reduced motion hook ───────────────────────────────────────────
function useReducedMotion() {
  const [r, setR] = useK(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffectK(() => {
    if (typeof matchMedia === 'undefined') return;
    const m = matchMedia('(prefers-reduced-motion: reduce)');
    const fn = () => setR(m.matches); m.addEventListener?.('change', fn); return () => m.removeEventListener?.('change', fn);
  }, []);
  return r;
}

// ── Kinetic number — counts up on mount; static under reduced-motion ──
function Kinetic({ value, dur = 900, format = (n) => Math.round(n), style, suffix = '' }) {
  const reduce = useReducedMotion();
  const [n, setN] = useK(reduce ? value : 0);
  const ref = useRefK(null);
  useEffectK(() => {
    if (reduce) { setN(value); return; }
    let raf, start;
    const seen = { v: false };
    // Safety net: rAF is throttled when the tab is backgrounded (e.g. during
    // capture), so guarantee the final value lands regardless of animation.
    const safety = setTimeout(() => setN(value), dur + 500);
    const run = () => {
      if (seen.v) return; seen.v = true;
      const step = (ts) => {
        if (!start) start = ts;
        const p = Math.min(1, (ts - start) / dur);
        const e = 1 - Math.pow(1 - p, 3);
        setN(value * e);
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    };
    const io = new IntersectionObserver((es) => { if (es[0].isIntersecting) run(); }, { threshold: 0.3 });
    if (ref.current) io.observe(ref.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); clearTimeout(safety); };
  }, [value, reduce]);
  return <span ref={ref} style={{ fontVariantNumeric: 'tabular-nums', ...style }}>{format(n)}{suffix}</span>;
}

// ── Phone frame ───────────────────────────────────────────────────
function Phone({ children, t, label }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
      <div style={{
        width: 390, height: 844, borderRadius: 52, padding: 11,
        background: t.dark ? '#000' : '#1a1612',
        boxShadow: '0 40px 90px rgba(0,0,0,0.55), inset 0 0 0 1.5px rgba(255,255,255,0.06)',
        position: 'relative', flex: '0 0 auto',
      }}>
        <div className="sk-scroll" style={{
          width: '100%', height: '100%', borderRadius: 42, overflow: 'hidden',
          position: 'relative', background: t.PAPER, color: t.INK,
        }}>
          {/* notch */}
          <div style={{
            position: 'absolute', top: 9, left: '50%', transform: 'translateX(-50%)',
            width: 108, height: 30, borderRadius: 16, background: '#000', zIndex: 200,
          }} />
          {children}
        </div>
      </div>
      {label}
    </div>
  );
}

// ── Status bar (time + signal) sits under the notch ───────────────
function StatusBar({ t, light }) {
  const c = t.INK;
  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, right: 0, height: 46, zIndex: 60,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
      padding: '0 26px 4px', pointerEvents: 'none',
      fontFamily: MONO, fontSize: 12, fontWeight: 600, color: c, letterSpacing: '0.02em',
    }}>
      <span style={{ fontVariantNumeric: 'tabular-nums' }}>9:41</span>
      <span style={{ display: 'flex', gap: 6, alignItems: 'center', opacity: 0.9 }}>
        <span style={{ letterSpacing: '-0.1em' }}>●●●</span>
        <span style={{ width: 22, height: 11, border: `1.5px solid ${c}`, borderRadius: 3, position: 'relative', display: 'inline-block' }}>
          <span style={{ position: 'absolute', inset: 1.5, right: 5, background: c, borderRadius: 1 }} />
        </span>
      </span>
    </div>
  );
}

// ── Mono eyebrow / label ──────────────────────────────────────────
function Eyebrow({ children, color, t, size = 9.5, weight = 600, style }) {
  return <span style={{
    fontFamily: MONO, fontSize: size, letterSpacing: '0.22em', textTransform: 'uppercase',
    color: color || t.INK50, fontWeight: weight, ...style,
  }}>{children}</span>;
}

// ── Tier avatar — softly-rounded square, tier ring, optional role pip ──
function Avatar({ init, tier = 'raw', role = 'client', size = 38, t, onClick, live }) {
  const tc = tierColor(tier, t.dark);
  const rc = roleColor(role, t.dark);
  return (
    <span role={onClick ? 'button' : undefined} onClick={onClick ? (e) => { e.stopPropagation(); onClick(e); } : undefined} style={{
      position: 'relative', display: 'inline-flex', width: size, height: size, flex: '0 0 auto',
      cursor: onClick ? 'pointer' : 'default', verticalAlign: 'top',
    }}>
      <span style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', height: '100%', borderRadius: size * 0.28,
        background: hexA(tc, t.dark ? 0.18 : 0.16), color: tc,
        border: `1.5px solid ${tc}`,
        fontFamily: MONO, fontSize: size * 0.4, fontWeight: 700, letterSpacing: '-0.02em',
      }}>{init}</span>
      {rc && (
        <span style={{
          position: 'absolute', right: -3, bottom: -3, width: size * 0.34, height: size * 0.34,
          borderRadius: 2, background: rc, border: `1.5px solid ${t.PAPER}`,
        }} />
      )}
      {live && (
        <span className="sk-live" style={{
          position: 'absolute', right: -2, top: -2, width: 8, height: 8, borderRadius: 4,
          background: t.TEAL, border: `1.5px solid ${t.PAPER}`, animation: 'skLive 1.6s ease-in-out infinite',
        }} />
      )}
    </span>
  );
}

// ── Tier byline — name + tier chip + role ─────────────────────────
function Byline({ name, tier = 'raw', role = 'client', handle, t, size = 14 }) {
  const tc = tierColor(tier, t.dark);
  const rc = roleColor(role, t.dark);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'nowrap', minWidth: 0 }}>
      {name && <span style={{ fontFamily: SERIF, fontSize: size, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', lineHeight: 1, whiteSpace: 'nowrap', flex: '0 0 auto' }}>{name}</span>}
      <span style={{
        fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', flex: '0 0 auto',
        color: tc, border: `1px solid ${hexA(tc, 0.5)}`, padding: '2px 5px', borderRadius: 3, lineHeight: 1,
      }}>{tierName(tier)}</span>
      {rc && (
        <span style={{
          fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', flex: '0 0 auto',
          color: t.PAPER, background: rc, padding: '2px 5px', borderRadius: 3, lineHeight: 1,
        }}>{ROLE[role].label}</span>
      )}
      {handle && <span style={{ fontFamily: MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.04em', flex: '0 0 auto' }}>{handle}</span>}
    </div>
  );
}

// ── Presence dot ──────────────────────────────────────────────────
function LiveDot({ color, size = 7 }) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', width: size, height: size }}>
      <span className="sk-pulse" style={{ position: 'absolute', inset: 0, borderRadius: size, background: color, animation: 'skPulse 2.2s ease-out infinite' }} />
      <span style={{ position: 'relative', width: size, height: size, borderRadius: size, background: color }} />
    </span>
  );
}

// ── Halftone / duotone image placeholder ──────────────────────────
function Halftone({ h = 150, accent, t, label, dense }) {
  const c1 = t.INK, c2 = accent || t.TEAL;
  const sz = dense ? 9 : 13;
  return (
    <div style={{
      height: h, position: 'relative', overflow: 'hidden',
      background: `radial-gradient(circle at 30% 30%, ${hexA(c1, 0.85)} 0 1.3px, transparent 1.6px) 0 0/${sz}px ${sz}px, linear-gradient(135deg, ${hexA(c2, 0.55)}, ${hexA(c2, 0.18)})`,
      border: `1px solid ${t.HAIR}`,
    }}>
      {label && (
        <span style={{
          position: 'absolute', left: 10, bottom: 8, fontFamily: MONO, fontSize: 8.5,
          letterSpacing: '0.18em', textTransform: 'uppercase', color: t.PAPER,
          background: hexA(t.INK, 0.7), padding: '3px 6px', borderRadius: 3,
        }}>{label}</span>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// SAMPLE DATA — members, channels, threads, feed
// ════════════════════════════════════════════════════════════════════
const M = {
  alex:   { init: 'A', name: 'Alex Rivera',   first: 'Alex',  handle: '@alex.r',     tier: 'form',   role: 'client' },
  priya:  { init: 'P', name: 'Priya Shah',    first: 'Priya', handle: '@priya.lifts',tier: 'peak',   role: 'client' },
  devon:  { init: 'D', name: 'Devon Wells',   first: 'Devon', handle: '@dwells',     tier: 'tempo',  role: 'client' },
  sofia:  { init: 'S', name: 'Sofia Park',    first: 'Sofia', handle: '@sofiap',     tier: 'raw',    role: 'client' },
  drew:   { init: 'D', name: 'Drew Oyelaran', first: 'Drew',  handle: '@drew.runs',  tier: 'legend', role: 'client' },
  casey:  { init: 'C', name: 'Casey Morgan',  first: 'Casey', handle: '@caseym',     tier: 'form',   role: 'client' },
  maya:   { init: 'M', name: 'Maya Okafor',   first: 'Maya',  handle: '@mayalifts',  tier: 'legend', role: 'trainer' },
  rae:    { init: 'R', name: 'Rae Lindqvist', first: 'Rae',   handle: '@raeats.rd',  tier: 'peak',   role: 'nutritionist' },
  jordan: { init: 'J', name: 'Jordan Chen',   first: 'Jordan',handle: '@jchen',      tier: 'peak',   role: 'trainer' },
};

// Live presence — who's training now (for "The Floor")
const TRAINING_NOW = [
  { m: M.priya, doing: 'Pull day · set 14', for: '22m' },
  { m: M.drew,  doing: 'Tempo run · 4.2mi', for: '31m' },
  { m: M.casey, doing: 'Back squat · 5×5',  for: '8m'  },
  { m: M.devon, doing: 'Zone 2 · treadmill',for: '40m' },
  { m: M.maya,  doing: 'Coaching floor',    for: '1h'  },
  { m: M.sofia, doing: 'Mobility flow',     for: '12m' },
];

const CHANNELS = [
  { name: 'strength-block-3', members: 412,  online: 38,  live: true,  blurb: 'Week 9 · peaking. Top-set check-ins.' },
  { name: 'running-club',     members: 1880, online: 211, live: true,  blurb: 'Sunday long run thread is open.' },
  { name: 'wins',             members: 5214, online: 96,  live: false, blurb: 'PRs, streaks, scale victories.' },
  { name: 'ask-a-coach',      members: 5214, online: 198, live: false, blurb: 'Free Q&A · coaches answer daily.' },
];

// Proof-of-work feed posts (verified training data, not vanity)
const FEED = [
  {
    id: 'pr1', kind: 'pr', m: M.priya, time: '6m', channel: 'strength-block-3',
    lift: 'Deadlift', sets: 1, reps: 3, load: 245, unit: 'lb', e1rm: 268, prevPr: 235,
    note: 'Block 3 paying off. Felt like there was a 4th in the tank.',
    cheers: 41, replies: 6, cheered: false, verified: 'Logged · Apr 21 · 9:04a',
  },
  {
    id: 'run1', kind: 'run', m: M.drew, time: '34m', channel: 'running-club',
    dist: 18.2, unit: 'mi', pace: '8:42', elev: 540, hr: 152,
    note: 'Last long run before taper. Negative split the back 6.',
    cheers: 28, replies: 4, cheered: false, verified: 'Logged · Apr 21 · 7:10a',
  },
  {
    id: 'coach1', kind: 'coachclip', m: M.maya, time: '52m', subject: M.casey,
    clip: 'Back squat · 225 × 5', cue: 'Knees caved on rep 4. Cue: spread the floor, drive the outside edge of the foot. Re-film tomorrow.',
    cheers: 12, replies: 2, cheered: true, verified: 'Form note on Casey\u2019s log',
  },
  {
    id: 'streak1', kind: 'streak', m: M.casey, time: '1h', channel: 'wins',
    streak: 100, note: '100 days. Didn\u2019t miss a single planned session. Tempo → Form this week.',
    cheers: 96, replies: 18, cheered: false, verified: 'Streak verified',
  },
  {
    id: 'meal1', kind: 'meal', m: M.sofia, time: '2h', channel: 'wins',
    meal: 'Post-run rebuild', kcal: 640, p: 48, c: 72, f: 14,
    note: 'Finally hitting protein without force-feeding. Recipe in #wins.',
    cheers: 17, replies: 3, cheered: false, verified: 'Logged · Apr 21',
  },
];

// 1:1 + group threads
const THREADS = {
  maya: {
    who: M.maya, kind: 'dm', sub: 'Head coach · replies in ~6 min',
    msgs: [
      { from: 'maya', t: 'Saw your deadlift PR hit the feed — 245×3 is huge. How did the speed feel off the floor?', time: '9:06a' },
      { from: 'me',   t: 'Fast honestly. Bar moved like 225.', time: '9:08a' },
      { from: 'maya', t: 'Then we bump the top set. I\u2019m editing Block 3 now.', time: '9:09a', clip: { lift: 'Deadlift', next: '250 × 3', was: '245 × 3' } },
      { from: 'me',   t: 'Let\u2019s do it 🔥', time: '9:10a' },
    ],
  },
  channel: {
    who: { init: '#', name: 'strength-block-3', tier: 'form', role: 'client' }, kind: 'channel',
    sub: '412 members · 38 online · Week 9 peak',
    msgs: [
      { from: 'priya', who: M.priya, t: 'Top set check-in: 245×3 @ RPE 8. Leaving Block 3 happy.', time: '9:04a', cheers: 41 },
      { from: 'maya',  who: M.maya,  t: 'That\u2019s the strongest the group has looked all block. Whoever\u2019s on day 4 — keep the back-offs honest.', time: '9:12a', coach: true },
      { from: 'casey', who: M.casey, t: 'On it. 5×5 @ 185 then mobility.', time: '9:20a' },
      { from: 'me',    t: 'Spotting Priya\u2019s PR — same scheme tomorrow, wish me luck.', time: '9:24a' },
    ],
  },
  nora: {
    who: { init: 'N', name: 'Nora', tier: 'form', role: 'client', ai: true }, kind: 'support',
    sub: 'Shape assistant · always on',
    msgs: [
      { from: 'nora', t: 'Hey Alex — I\u2019m Nora. I can pull up your data, answer billing, or flag a coach. What\u2019s up?', time: '8:50a' },
      { from: 'me',   t: 'What was my deadlift estimated 1RM after today?', time: '8:51a' },
      { from: 'nora', t: 'Today\u2019s 245×3 gives an estimated 1RM of 268 lb — up 14 from last block. Want me to share it to #strength-block-3?', time: '8:51a', data: true },
    ],
  },
};

const TEAM = [
  { m: M.maya,  spec: 'Strength · Block 3 build', next: 'Reply · 6m', unread: 2 },
  { m: M.rae,   spec: 'Nutrition · cut phase',    next: 'Consult Thu 4p', unread: 0 },
];

Object.assign(window, {
  SERIF, MONO, SANS, makeTheme, TIERS, tierColor, tierName, ROLE, roleColor, hexA,
  useReducedMotion, Kinetic, Phone, StatusBar, Eyebrow, Avatar, Byline, LiveDot, Halftone,
  M, TRAINING_NOW, CHANNELS, FEED, THREADS, TEAM,
});
