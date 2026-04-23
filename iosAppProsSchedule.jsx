// Trainer + Nutritionist schedule: Today / Week / Month segmented views
// Mirrors ClientHome structure. Today screen is delegated to existing TrainerToday / NutriToday.

const { useState: useStatePS } = React;

// Stat chip with progress bar vs target
function MacroChip({ label, v, t, unit = '', color = TEAL, pct = 0 }) {
  return (
    <div style={{ border: `1px solid ${HAIR}`, borderRadius: 14, padding: '12px 12px 10px', background: 'rgba(242,237,228,0.025)' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <MLabel color={color}>{label}</MLabel>
        <span style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.12em' }}>/ {t}{unit}</span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK, marginTop: 4, lineHeight: 1 }}>
        {v}{unit && <span style={{ fontSize: 14, color: INK_60 }}>{unit}</span>}
      </div>
      <div style={{ marginTop: 8, height: 3, borderRadius: 2, background: HAIR, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${Math.min(100, pct * 100)}%`, background: color }} />
      </div>
    </div>
  );
}

// Role-specific config so Week/Month are visually distinct
const PS_CONFIG = {
  trainer: {
    accent: CORAL,
    eyebrowTag: 'Week 17 · Active block',
    heroWord: 'schedule',
    week: { label: '17 sessions', totalsTitle: 'This week' },
    month: { label: 'April · 62 sessions', totalsTitle: 'This month' },
    kinds: {
      session: { color: CORAL, label: 'Session' },
      checkin: { color: '#5ac8fa', label: 'Check-in' },
      group:   { color: TEAL,   label: 'Group' },
      admin:   { color: GOLD,   label: 'Admin' },
    },
  },
  nutri: {
    accent: GOLD,
    eyebrowTag: '11 active clients · 5 plans due',
    heroWord: 'clinic',
    week: { label: '14 consults', totalsTitle: 'This week' },
    month: { label: 'April · 48 consults', totalsTitle: 'This month' },
    kinds: {
      consult: { color: GOLD,   label: 'Consult' },
      plan:    { color: CORAL,  label: 'Plan' },
      review:  { color: '#5ac8fa', label: 'Review' },
      admin:   { color: PLUM,   label: 'Admin' },
    },
  },
};

function proKindColor(role, k) {
  return PS_CONFIG[role].kinds[k]?.color || INK_45;
}

// ───────────────────────────────────────────────────────────────────
// TrainerHome / NutriHome — segmented Today / Week / Month shell
// ───────────────────────────────────────────────────────────────────
// Segmented control, floats at top right of the screen on Today,
// or inline on Week/Month. Used by TrainerToday/NutriToday.
function ProViewSeg({ view, setView, accent }) {
  return (
    <div style={{ padding: '0 24px 14px' }}>
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4,
        padding: 3, borderRadius: 14, border: `1px solid ${HAIR}`,
        background: 'rgba(242,237,228,0.025)',
      }}>
        {[{ k: 'today', l: 'Today' }, { k: 'week', l: 'Week' }, { k: 'month', l: 'Month' }].map(s => {
          const on = view === s.k;
          return (
            <button key={s.k} onClick={() => setView(s.k)} style={{
              border: 0, cursor: 'pointer',
              padding: '9px 10px', borderRadius: 11,
              background: on ? accent : 'transparent',
              color: on ? PAPER : INK,
              fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase',
            }}>{s.l}</button>
          );
        })}
      </div>
    </div>
  );
}

// Home orchestrator: renders Today (existing component) or Week/Month (new).
function ProHome({ role, onRadio, radioOn, setRadioOn, TodayComp }) {
  const [view, setView] = useStatePS('today');
  const cfg = PS_CONFIG[role];

  if (view === 'today') {
    return <TodayComp onRadio={onRadio} radioOn={radioOn} setRadioOn={setRadioOn}
                      proView={view} setProView={setView} proAccent={cfg.accent} />;
  }

  const titleWord = cfg.heroWord;
  const h = view === 'week'
    ? { eyebrow: cfg.eyebrowTag, title: <>Week's<br/><em style={{ fontStyle: 'italic', color: cfg.accent, fontWeight: 500 }}>{titleWord}.</em></>, date: 'Apr 17 – Apr 23 · W6 of block' }
    : { eyebrow: cfg.eyebrowTag, title: <>Month's<br/><em style={{ fontStyle: 'italic', color: cfg.accent, fontWeight: 500 }}>{titleWord}.</em></>, date: 'April 2026 · Q2 block' };

  return (
    <Screen>
      <NavBar
        eyebrow={h.eyebrow}
        title={h.title}
        trailing={<AvatarChip init={role === 'trainer' ? 'J' : 'M'} color={role === 'trainer' ? CORAL : GOLD} size={36} />}
      />
      <div style={{ padding: '0 24px 14px' }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_45, textTransform: 'uppercase' }}>
          {h.date}
        </div>
      </div>
      <ProViewSeg view={view} setView={setView} accent={cfg.accent} />
      {view === 'week'  && <ProWeekView role={role} />}
      {view === 'month' && <ProMonthView role={role} />}
      <div style={{ height: 16 }} />
    </Screen>
  );
}

// ───────────────────────────────────────────────────────────────────
// Week view — 7-day strip + selected day detail
// ───────────────────────────────────────────────────────────────────
function ProWeekView({ role }) {
  const cfg = PS_CONFIG[role];
  const accent = cfg.accent;

  // 7 days with event kind chips — Friday Apr 21 is today
  const days = role === 'trainer' ? [
    { n: 'M', d: 17, k: [] },
    { n: 'T', d: 18, k: ['session', 'session', 'checkin'] },
    { n: 'W', d: 19, k: ['session', 'session', 'group'] },
    { n: 'T', d: 20, k: ['session', 'admin'] },
    { n: 'F', d: 21, k: ['session', 'session', 'session', 'session'], today: true },
    { n: 'S', d: 22, k: ['session', 'session', 'group'] },
    { n: 'S', d: 23, k: ['admin'] },
  ] : [
    { n: 'M', d: 17, k: ['admin'] },
    { n: 'T', d: 18, k: ['consult', 'consult', 'review'] },
    { n: 'W', d: 19, k: ['consult', 'plan'] },
    { n: 'T', d: 20, k: ['plan', 'plan', 'review'] },
    { n: 'F', d: 21, k: ['consult', 'consult', 'consult'], today: true },
    { n: 'S', d: 22, k: [] },
    { n: 'S', d: 23, k: ['admin'] },
  ];
  const [sel, setSel] = useStatePS(4);
  const d = days[sel];

  const trainerAgendas = [
    [],
    [ { k: 'session', t: 'Sofia Martinez', s: '30m · Check-in · Zoom', d: '09:00' },
      { k: 'session', t: 'Alex Rivera',    s: '60m · Push Day · Gym',  d: '11:30' },
      { k: 'checkin', t: 'Weekly reviews', s: '5 clients · adherence', d: '16:00' } ],
    [ { k: 'session', t: 'Priya Singh',    s: '45m · Lower · Gym',     d: '08:00' },
      { k: 'session', t: 'Marcus Lee',     s: '60m · Intro call',      d: '14:00' },
      { k: 'group',   t: 'Riverside Runners', s: 'Track session · 45m', d: '18:00' } ],
    [ { k: 'session', t: 'Jamal Green',    s: '45m · Strength · Zoom', d: '10:00' },
      { k: 'admin',   t: 'Plan writing',   s: 'Marcus · Week 2 build', d: '14:00' } ],
    [ { k: 'session', t: 'Sofia Martinez', s: '45m · Squat form check', d: '09:00' },
      { k: 'session', t: 'Alex Rivera',    s: '60m · Push Day',         d: '11:30' },
      { k: 'session', t: 'Priya Singh',    s: '30m · Program review',   d: '14:00' },
      { k: 'session', t: 'Marcus Lee',     s: '45m · Intro call',       d: '17:00' } ],
    [ { k: 'session', t: 'Jamal Green',    s: '60m · OHP PR attempt',   d: '08:00' },
      { k: 'session', t: 'Ellie Park',     s: '45m · Form video review', d: '10:00' },
      { k: 'group',   t: 'Pull-up clinic', s: 'Open session · 60m',     d: '12:00' } ],
    [ { k: 'admin', t: 'Week review', s: 'Notes · check-ins · plans', d: 'All day' } ],
  ];

  const nutriAgendas = [
    [ { k: 'admin', t: 'Plan writing block', s: 'Taylor · PCOS plan draft', d: 'Morning' } ],
    [ { k: 'consult', t: 'Sofia Martinez', s: '45m · Kickoff · Zoom', d: '10:00' },
      { k: 'consult', t: 'Jamal Green',    s: '30m · Cut check-in',   d: '14:00' },
      { k: 'review',  t: 'Food logs',      s: '3 clients · feedback', d: '16:00' } ],
    [ { k: 'consult', t: 'Liam O\'Connor', s: '30m · Race week fuel', d: '11:00' },
      { k: 'plan',    t: 'Priya · macro reset', s: 'Deliver draft',   d: '15:00' } ],
    [ { k: 'plan', t: 'Alex · mid-cut adjust', s: 'Draft + review',   d: 'Morning' },
      { k: 'plan', t: 'Marcus · kickoff plan', s: 'Template → custom', d: 'Afternoon' },
      { k: 'review', t: 'Weekly food logs',   s: '7 clients',          d: '17:00' } ],
    [ { k: 'consult', t: 'Alex Rivera',    s: '30m · Mid-cut review', d: '10:00' },
      { k: 'consult', t: 'Taylor Brooks',  s: '45m · Plan delivery',  d: '13:30' },
      { k: 'consult', t: 'Jamal Green',    s: '30m · Cut → maintain', d: '16:00' } ],
    [],
    [ { k: 'admin', t: 'Week review', s: 'Notes · payouts · feed', d: 'Morning' } ],
  ];

  const dayAgenda = (role === 'trainer' ? trainerAgendas : nutriAgendas)[sel] || [];

  // Hero "next up" for selected day
  const heroByDay = {
    trainer: {
      4: { eyebrow: '4 sessions today', title: 'Sofia Martinez', meta: '09:00 · Squat form check · 45m', tag: 'ZOOM', persona: { init: 'S', color: TEAL, name: 'Sofia Martinez', role: 'Client · Week 6' } },
      1: { eyebrow: '3 events', title: 'Sofia Martinez', meta: '09:00 · Check-in · 30m', tag: 'ZOOM', persona: { init: 'S', color: TEAL, name: 'Sofia Martinez', role: 'Client · Week 6' } },
      2: { eyebrow: '3 events', title: 'Riverside Runners', meta: '18:00 · Track session · 45m', tag: 'GROUP', persona: { init: 'R', color: PLUM, name: 'Riverside Runners', role: '12 members' } },
      3: { eyebrow: '2 events', title: 'Jamal Green', meta: '10:00 · Strength · 45m', tag: 'ZOOM', persona: { init: 'J', color: '#5ac8fa', name: 'Jamal Green', role: 'Client · Week 9' } },
      5: { eyebrow: '3 events', title: 'Jamal Green', meta: '08:00 · OHP PR attempt · 60m', tag: 'GYM', persona: { init: 'J', color: '#5ac8fa', name: 'Jamal Green', role: 'PR day' } },
    },
    nutri: {
      4: { eyebrow: '3 consults today', title: 'Alex Rivera', meta: '10:00 · Mid-cut review · 30m', tag: 'ZOOM', persona: { init: 'A', color: CORAL, name: 'Alex Rivera', role: 'Client · Cut week 6' } },
      1: { eyebrow: '3 events', title: 'Sofia Martinez', meta: '10:00 · Kickoff · 45m', tag: 'ZOOM', persona: { init: 'S', color: TEAL, name: 'Sofia Martinez', role: 'New client' } },
      2: { eyebrow: '2 events', title: 'Liam O\'Connor', meta: '11:00 · Race week fuel · 30m', tag: 'ZOOM', persona: { init: 'L', color: PLUM, name: 'Liam O\'Connor', role: 'Client · Race prep' } },
      3: { eyebrow: '3 events', title: 'Plan writing', meta: 'Alex mid-cut + Marcus kickoff', tag: 'FOCUS', persona: { init: '✦', color: INK, name: 'Deep work block', role: '2 plans due' } },
    },
  };
  const hero = heroByDay[role][sel];

  return (
    <>
      {/* Week header */}
      <div style={{ padding: '0 24px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK }}>
          Apr <em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>17–23</em>
        </div>
        <MLabel>{cfg.week.label}</MLabel>
      </div>

      {/* 7-day strip */}
      <div style={{ padding: '0 16px 6px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {days.map((day, i) => {
          const on = sel === i;
          return (
            <button key={i} onClick={() => setSel(i)} style={{
              border: `1px solid ${on ? accent : (day.today ? accent + '55' : HAIR)}`,
              background: on ? accent + '18' : 'rgba(242,237,228,0.025)',
              borderRadius: 12, padding: '10px 4px 8px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: on ? accent : INK_45, textTransform: 'uppercase' }}>{day.n}</span>
              <span style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: on ? accent : INK }}>{day.d}</span>
              <div style={{ display: 'flex', gap: 2, height: 5 }}>
                {day.k.slice(0, 4).map((k, j) => (
                  <span key={j} style={{ width: 4, height: 4, borderRadius: 2, background: proKindColor(role, k) }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day header */}
      <div style={{ padding: '14px 24px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color: INK }}>
          {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][sel]} · <em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>Apr {d.d}</em>
          {d.today && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: accent, textTransform: 'uppercase', marginLeft: 8 }}>Today</span>}
        </div>
        <Pill>+ Add</Pill>
      </div>

      {/* Hero next-event card */}
      {hero && (
        <div style={{ padding: '0 24px 6px' }}>
          <EdCard pad={18} tint={`linear-gradient(155deg, ${accent}22, ${accent}05)`} style={{ border: `1px solid ${accent}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <MLabel color={accent}>{hero.eyebrow}</MLabel>
              <MLabel>{hero.tag}</MLabel>
            </div>
            <div style={{ marginTop: 10, fontFamily: SERIF, fontSize: 24, lineHeight: 1.05, letterSpacing: '-0.025em', color: INK }}>
              {hero.title}
            </div>
            <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', color: INK_60, textTransform: 'uppercase' }}>
              {hero.meta}
            </div>
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Attribution init={hero.persona.init} color={hero.persona.color} name={hero.persona.name} role={hero.persona.role} />
              <Pill solid color={accent}>{d.today ? 'Open →' : 'Preview →'}</Pill>
            </div>
          </EdCard>
        </div>
      )}

      {/* Day agenda */}
      <div style={{ padding: '12px 24px 0' }}>
        <MLabel>Schedule</MLabel>
      </div>
      <div style={{ padding: '0 24px' }}>
        {dayAgenda.length === 0 && (
          <div style={{ padding: '26px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>
            Open day · nothing scheduled
          </div>
        )}
        {dayAgenda.map((ev, i) => (
          <TrackRow
            key={i}
            n={i + 1}
            state={i === 0 && d.today ? 'next' : undefined}
            title={ev.t}
            sub={`${ev.d} · ${ev.s}`}
            detail={cfg.kinds[ev.k]?.label || ''}
            accent={accent}
            last={i === dayAgenda.length - 1}
          />
        ))}
      </div>

      {/* Week totals */}
      <SectionHeader eyebrow={cfg.week.totalsTitle} title="So far" />
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {role === 'trainer' ? <>
          <MacroChip label="Sessions" v="11" t="17" color={CORAL} pct={0.65} />
          <MacroChip label="Check-ins" v="7"  t="10" color="#5ac8fa" pct={0.7} />
          <MacroChip label="Retention" v="92" t="100" unit="%" color={TEAL} pct={0.92} />
          <MacroChip label="Booked" v="$1820" t="2400" color={GOLD} pct={0.76} />
        </> : <>
          <MacroChip label="Consults" v="8"  t="14" color={GOLD} pct={0.57} />
          <MacroChip label="Plans"    v="3"  t="5"  color={CORAL} pct={0.6} />
          <MacroChip label="Adherence" v="84" t="100" unit="%" color={TEAL} pct={0.84} />
          <MacroChip label="MRR"     v="$4.1k" t="5.0k" color="#5ac8fa" pct={0.82} />
        </>}
      </div>

      {/* Legend */}
      <div style={{ padding: '14px 24px 8px', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {Object.entries(cfg.kinds).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: v.color }} />
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: INK_60, textTransform: 'uppercase' }}>{v.label}</span>
          </div>
        ))}
      </div>
    </>
  );
}

// ───────────────────────────────────────────────────────────────────
// Month view — grid calendar with dots
// ───────────────────────────────────────────────────────────────────
function ProMonthView({ role }) {
  const cfg = PS_CONFIG[role];
  const accent = cfg.accent;

  const firstBlank = 2; // Apr 1 = Wed
  const daysInMonth = 30;
  const today = 21;

  const trainerEvents = {
    1: ['session','session'], 2: ['session'], 3: ['session','group'], 4: ['admin'],
    5: [], 6: ['session','session','session'], 7: ['session','admin'], 8: ['session','session','group'],
    9: ['session','checkin'], 10: ['session','session'], 11: ['session','admin'], 12: [],
    13: ['session','session','session'], 14: ['session','session','checkin'], 15: ['session','group'], 16: ['session','session'],
    17: [], 18: ['session','session','checkin'], 19: ['session','session','group'], 20: ['session','admin'],
    21: ['session','session','session','session'], 22: ['session','session','group'], 23: ['admin'],
    24: [], 25: ['session','session','session'], 26: ['session','checkin'], 27: ['session','session'],
    28: ['session','session','group'], 29: ['session','admin'], 30: ['session','session','checkin'],
  };

  const nutriEvents = {
    1: ['consult','plan'], 2: ['consult','review'], 3: ['plan'], 4: ['admin'],
    5: [], 6: ['consult','consult'], 7: ['plan','review'], 8: ['consult','plan'],
    9: ['review','plan'], 10: ['consult','consult'], 11: ['plan'], 12: [],
    13: ['consult','consult','review'], 14: ['plan','plan'], 15: ['consult'], 16: ['consult','review'],
    17: ['admin'], 18: ['consult','consult','review'], 19: ['consult','plan'], 20: ['plan','plan','review'],
    21: ['consult','consult','consult'], 22: [], 23: ['admin'],
    24: [], 25: ['consult','plan'], 26: ['consult','review'], 27: ['consult','consult'],
    28: ['plan','review'], 29: ['consult','consult'], 30: ['admin','plan'],
  };

  const events = role === 'trainer' ? trainerEvents : nutriEvents;
  const [sel, setSel] = useStatePS(today);

  const cells = [];
  for (let i = 0; i < firstBlank; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const trainerAgendas = {
    21: [
      { k: 'session', t: 'Sofia Martinez', s: '45m · Squat form check',   d: '09:00' },
      { k: 'session', t: 'Alex Rivera',    s: '60m · Push Day',           d: '11:30' },
      { k: 'session', t: 'Priya Singh',    s: '30m · Program review',     d: '14:00' },
      { k: 'session', t: 'Marcus Lee',     s: '45m · Intro call',         d: '17:00' },
    ],
    19: [
      { k: 'session', t: 'Priya Singh',   s: '45m · Lower · Gym',      d: '08:00' },
      { k: 'session', t: 'Marcus Lee',    s: '60m · Intro call',       d: '14:00' },
      { k: 'group',   t: 'Riverside Runners', s: 'Track session · 45m', d: '18:00' },
    ],
    25: [
      { k: 'session', t: 'Sofia Martinez', s: '60m · Long run coach',  d: '08:00' },
      { k: 'session', t: 'Alex Rivera',    s: '45m · Deload',          d: '11:00' },
      { k: 'session', t: 'Jamal Green',    s: '45m · Strength · Zoom', d: '14:00' },
    ],
    28: [
      { k: 'session', t: 'Taylor Brooks',  s: '45m · Onboarding',      d: '10:00' },
      { k: 'session', t: 'Ellie Park',     s: '60m · Hypertrophy',     d: '12:30' },
      { k: 'group',   t: 'Pull-up clinic', s: 'Open session · 60m',    d: '18:00' },
    ],
  };

  const nutriAgendas = {
    21: [
      { k: 'consult', t: 'Alex Rivera',    s: '30m · Mid-cut review',  d: '10:00' },
      { k: 'consult', t: 'Taylor Brooks',  s: '45m · Plan delivery',   d: '13:30' },
      { k: 'consult', t: 'Jamal Green',    s: '30m · Cut → maintain',  d: '16:00' },
    ],
    18: [
      { k: 'consult', t: 'Sofia Martinez', s: '45m · Kickoff',         d: '10:00' },
      { k: 'consult', t: 'Jamal Green',    s: '30m · Cut check-in',    d: '14:00' },
      { k: 'review',  t: 'Food logs',      s: '3 clients · feedback',  d: '16:00' },
    ],
    20: [
      { k: 'plan',   t: 'Alex · mid-cut adjust', s: 'Draft + review',   d: 'Morning' },
      { k: 'plan',   t: 'Marcus · kickoff plan', s: 'Template → custom', d: 'Afternoon' },
      { k: 'review', t: 'Weekly food logs',      s: '7 clients',         d: '17:00' },
    ],
    28: [
      { k: 'plan',   t: 'Taylor · PCOS',   s: 'Plan delivery',         d: 'Morning' },
      { k: 'review', t: 'Food logs',       s: '9 clients',             d: '14:00' },
    ],
  };

  const fallback = (events[sel] || []).map(k => ({
    k,
    t: cfg.kinds[k]?.label || '',
    s: role === 'trainer'
      ? ({ session: '30–60 min', checkin: 'Adherence review', group: 'Open session', admin: 'Plan writing' })[k]
      : ({ consult: '30–45 min · Zoom', plan: 'Draft + deliver', review: 'Food log feedback', admin: 'Plan writing' })[k],
    d: '—',
  }));
  const agendas = role === 'trainer' ? trainerAgendas : nutriAgendas;
  const dayAgenda = agendas[sel] || fallback;

  return (
    <>
      {/* Month header */}
      <div style={{ padding: '0 24px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK }}>
          <em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>April</em> 2026
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase', cursor: 'pointer' }}>‹ Mar</span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase', cursor: 'pointer' }}>May ›</span>
        </div>
      </div>

      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['M','T','W','T','F','S','S'].map((dy, i) => (
          <div key={i} style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: INK_45, textTransform: 'uppercase' }}>{dy}</div>
        ))}
      </div>

      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ev = events[d] || [];
          const isToday = d === today;
          const on = sel === d;
          return (
            <button key={i} onClick={() => setSel(d)} style={{
              border: `1px solid ${on ? accent : (isToday ? accent + '55' : HAIR)}`,
              background: on ? accent + '18' : 'rgba(242,237,228,0.025)',
              borderRadius: 9, padding: '7px 2px 5px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              aspectRatio: '1 / 1.05', minHeight: 0,
            }}>
              <span style={{
                fontFamily: SERIF, fontSize: 15, letterSpacing: '-0.02em',
                color: on ? accent : (isToday ? accent : INK),
                fontWeight: isToday ? 500 : 400,
              }}>{d}</span>
              <div style={{ display: 'flex', gap: 2, height: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {ev.slice(0, 4).map((k, j) => (
                  <span key={j} style={{ width: 3.5, height: 3.5, borderRadius: 2, background: proKindColor(role, k) }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ padding: '14px 24px 8px', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {Object.entries(cfg.kinds).map(([k, v]) => (
          <div key={k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: v.color }} />
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: INK_60, textTransform: 'uppercase' }}>{v.label}</span>
          </div>
        ))}
      </div>

      {/* Selected day */}
      <div style={{ padding: '12px 24px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color: INK }}>
          <em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>Apr {sel}</em>
          {sel === today && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: accent, textTransform: 'uppercase', marginLeft: 8 }}>Today</span>}
        </div>
        <Pill>+ Add</Pill>
      </div>

      <div style={{ padding: '0 24px' }}>
        {dayAgenda.length === 0 && (
          <div style={{ padding: '26px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>
            Open day · nothing scheduled
          </div>
        )}
        {dayAgenda.map((ev, i) => (
          <TrackRow
            key={i}
            n={i + 1}
            state={i === 0 && sel === today ? 'next' : undefined}
            title={ev.t}
            sub={`${ev.d} · ${ev.s}`}
            detail={cfg.kinds[ev.k]?.label || ''}
            accent={accent}
            last={i === dayAgenda.length - 1}
          />
        ))}
      </div>

      {/* Month totals */}
      <SectionHeader eyebrow={cfg.month.totalsTitle} title="So far" />
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        {role === 'trainer' ? <>
          <MacroChip label="Sessions" v="48" t="62" color={CORAL} pct={0.77} />
          <MacroChip label="New clients" v="3" t="4" color={GOLD} pct={0.75} />
          <MacroChip label="Retention" v="92" t="100" unit="%" color={TEAL} pct={0.92} />
          <MacroChip label="Earnings" v="$6.2k" t="7.5k" color="#5ac8fa" pct={0.82} />
        </> : <>
          <MacroChip label="Consults" v="34" t="48" color={GOLD} pct={0.71} />
          <MacroChip label="Plans delivered" v="12" t="18" color={CORAL} pct={0.67} />
          <MacroChip label="Adherence" v="84" t="100" unit="%" color={TEAL} pct={0.84} />
          <MacroChip label="MRR" v="$4.1k" t="5.0k" color="#5ac8fa" pct={0.82} />
        </>}
      </div>
    </>
  );
}

Object.assign(window, { ProHome, ProWeekView, ProMonthView, ProViewSeg, PS_CONFIG });
