// iosAppBroadsheetPros.jsx — Trainer & Nutritionist roles in Broadsheet style.
// Lighter pass: 4 tabs each — Today, Clients, Plans/Pubs, Me.

const { useState: useStateBSP } = React;
const {
  useBS, BSPage, BSMasthead, BSPageHeader, BSAvatar, BSEyebrow, BSSection,
  BSSlab, BSCell, BSTag, BSRow, BSHeadlineNumber, BSHalftone,
  BSTabBar, BSFooter,
  BSSheetProvider, useBSSheet, BSCalendarScreen,
  BSRadioPrompt, BSRadioScreen, BSNowPlaying,
  BSClientChat, BSSettings,
} = window;

// ─── Reusable week strip for trainer / nutritionist home ─────
// Compact 7-day calendar matching the one on Client home, with role-tinted
// dots showing what's on each day. Selecting a day is local-only — pros
// click "Open calendar →" to drill in.
function BSProWeekStrip({ goCalendar, dots, label = 'This week', selDay: selDayProp, onSelectDay }) {
  const t = useBS();
  const [internalSel, setInternalSel] = useStateBSP(21);
  const selDay = selDayProp != null ? selDayProp : internalSel;
  const setSelDay = onSelectDay || setInternalSel;
  const days = [
    { d: 20, l: 'M' }, { d: 21, l: 'T', isToday: true }, { d: 22, l: 'W' },
    { d: 23, l: 'T' }, { d: 24, l: 'F' }, { d: 25, l: 'S' }, { d: 26, l: 'S' },
  ];
  return (
    <>
      <BSSection
        title={label}
        kicker={`Wk 17 · Apr 20–26 · Apr ${selDay}`}
        meta={<span onClick={goCalendar} style={{ cursor: 'pointer', fontWeight: 800, color: t.INK, marginLeft: 'auto' }}>Month view →</span>}
      />
      <div style={{ padding: `0 ${t.padX}px 14px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderTop: `2px solid ${t.INK}`, paddingTop: 10 }}>
          {days.map((day) => {
            const on    = day.d === selDay;
            const today = day.isToday;
            const dd    = (dots && dots[day.d]) || [];
            return (
              <button key={day.d} onClick={() => setSelDay(day.d)} style={{
                borderRadius: t.RADIUS_SM,
                border: `1px solid ${on ? t.INK : t.HAIR}`,
                background: on ? t.INK : (today ? t.PAPER2 : 'transparent'),
                color: on ? t.PAPER : t.INK,
                padding: '8px 0 6px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', fontWeight: 600, opacity: today && !on ? 1 : 0.7 }}>{day.l}</span>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{day.d}</span>
                <span style={{ display: 'flex', gap: 2, height: 4, marginTop: 2 }}>
                  {dd.slice(0, 3).map((c, k) => <span key={k} style={{ width: 3, height: 3, background: on ? t.PAPER : c }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// TRAINER
// ═══════════════════════════════════════════════════════════
function BSTrainerApp({ onLogout, tweaks, setTweak }) {
  return <BSSheetProvider><BSTrainerAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} /></BSSheetProvider>;
}
function BSTrainerAppInner({ onLogout, tweaks, setTweak }) {
  const sheet = useBSSheet();
  const [tab, setTab] = useStateBSP('today');
  const [showSettings, setShowSettings] = useStateBSP(false);
  const goRadio = () => setTab('radio');
  const goSettings = () => setShowSettings(true);
  if (showSettings) return <BSSettings onBack={() => setShowSettings(false)} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  const screens = {
    today:    <BSTrainerToday onProfile={goSettings} sheet={sheet} goCalendar={() => setTab('cal')} goRadio={goRadio} tweaks={tweaks} setTweak={setTweak} />,
    cal:      <BSCalendarScreen role="trainer" onProfile={goSettings} />,
    clients:  <BSTrainerClients sheet={sheet} />,
    programs: <BSTrainerPrograms sheet={sheet} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="trainer" />,
    radio:    <BSRadioScreen onBack={() => setTab('today')} />,
    me:       <BSProMe role="trainer" name="Jordan Chen" onLogout={onLogout} onSettings={goSettings} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'cal',      label: 'Cal' },
        { key: 'clients',  label: 'Clients' },
        { key: 'programs', label: 'Plans' },
        { key: 'chat',     label: 'Chat' },
        { key: 'me',       label: 'Me' },
      ]} />
      <BSRadioPrompt />
    </div>
  );
}

function _BSTrainerApp_old({ onLogout }) {
  const [tab, setTab] = useStateBSP('today');
  const screens = {
    today:    <BSTrainerToday onProfile={onLogout} />,
    clients:  <BSTrainerClients />,
    programs: <BSTrainerPrograms />,
    me:       <BSProMe role="trainer" name="Jordan Chen" onLogout={onLogout} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'clients',  label: 'Clients' },
        { key: 'programs', label: 'Plans' },
        { key: 'me',       label: 'Me' },
      ]} />
    </div>
  );
}

function BSTrainerToday({ onProfile, sheet, goCalendar, goRadio, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const [selDay, setSelDay] = useStateBSP(21);

  // Per-day bookings dataset. Apr 21 (today) is the full roster; other days lighter.
  const TRAINER_BOOKINGS = {
    20: [
      { time: '08:00', tag: 'LIVE', tagColor: t.RUST, title: 'Alex Rivera',    sub: 'Lower Pull · 60m', state: 'done' },
      { time: '11:30', tag: 'LIVE', tagColor: t.RUST, title: 'Riley Kim',      sub: 'Conditioning · 45m', state: 'done' },
      { time: '15:00', tag: 'ASYN', tagColor: t.BLUE, title: 'Drew Park · review', sub: 'Form check · 6 clips', state: 'done', last: true },
    ],
    21: [
      { time: '07:00', tag: 'LIVE', tagColor: t.RUST,  title: 'Alex Rivera',     sub: 'Upper Push — Peak · 60m', state: 'done' },
      { time: '08:30', tag: 'LIVE', tagColor: t.RUST,  title: 'Sam Patel',       sub: 'Conditioning · 45m',      state: 'done' },
      { time: '10:00', tag: 'ASYN', tagColor: t.BLUE,  title: 'Riley Kim · review', sub: 'Form check · 4 clips', state: 'next' },
      { time: '13:00', tag: 'LIVE', tagColor: t.RUST,  title: 'Casey Lee',       sub: 'Lower Pull — Peak · 60m' },
      { time: '14:30', tag: 'LIVE', tagColor: t.RUST,  title: 'Drew Park',       sub: 'Upper Push — Peak · 45m' },
      { time: '16:00', tag: 'INTK', tagColor: t.GREEN, title: 'New: Morgan Liu', sub: 'Intake call · 30m' },
      { time: '17:30', tag: 'LIVE', tagColor: t.RUST,  title: 'Quinn Choi',      sub: 'Hypertrophy block 2 · 60m' },
      { time: '19:00', tag: 'PRGM', tagColor: t.AMBER, title: 'Block 3 release', sub: 'Push to all · auto-send', last: true },
    ],
    22: [
      { time: '10:00', tag: 'PRGM', tagColor: t.AMBER, title: 'Maya program',  sub: 'Final review · 1h block' },
      { time: '14:00', tag: 'INTK', tagColor: t.GREEN, title: 'Tasha Yeo',      sub: 'Intake call · 30m', last: true },
    ],
    23: [
      { time: '07:00', tag: 'LIVE', tagColor: t.RUST, title: 'Alex Rivera',  sub: 'Upper Push · 60m' },
      { time: '11:00', tag: 'ASYN', tagColor: t.BLUE, title: 'Sam Patel · review', sub: 'Bench form · 3 clips', last: true },
    ],
    24: [
      { time: '08:30', tag: 'LIVE', tagColor: t.RUST, title: 'Casey Lee',  sub: 'Lower Pull · 60m' },
      { time: '13:00', tag: 'LIVE', tagColor: t.RUST, title: 'Quinn Choi', sub: 'Conditioning · 45m', last: true },
    ],
    25: [],
    26: [
      { time: '09:00', tag: 'INTK', tagColor: t.GREEN, title: 'Open hours', sub: 'Drop-in consults', last: true },
    ],
  };
  const bookings = TRAINER_BOOKINGS[selDay] || [];

  // Per-day lead. selDay 21 = today's narrative.
  const TRAINER_LEAD = {
    20: { count: '3', kicker: 'Mon · Apr 20',  copy: 'Light Monday — catch-up day for async reviews.' },
    21: { count: '8', kicker: "Lead · Today's roster", copy: "First at 7am. Two free hours at noon to write Maya's program." },
    22: { count: '2', kicker: 'Wed · Apr 22',  copy: 'Quiet day. Block out the morning for Maya.' },
    23: { count: '2', kicker: 'Thu · Apr 23',  copy: 'One live, one async. Easy build-up to Friday.' },
    24: { count: '2', kicker: 'Fri · Apr 24',  copy: 'Two heavy sessions — Casey & Quinn back-to-back area.' },
    25: { count: '0', kicker: 'Sat · Apr 25',  copy: 'Off day. Programming refresh on the docket.' },
    26: { count: '1', kicker: 'Sun · Apr 26',  copy: 'Open hours — drop-in consults only.' },
  };
  const lead = TRAINER_LEAD[selDay] || TRAINER_LEAD[21];
  return (
    <BSPage>
      <BSMasthead
        title={<span style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: "'DM Serif Display', 'Old Standard TT', serif", fontWeight: 400, fontSize: 32, letterSpacing: '-0.01em' }}>The </span>
          <span style={{ fontFamily: "'DM Serif Display', 'Old Standard TT', serif", fontWeight: 400, fontStyle: 'italic', fontSize: 46, letterSpacing: '-0.015em' }}>Shape</span>
          <span style={{ fontFamily: "'DM Serif Display', 'Old Standard TT', serif", fontWeight: 400, fontSize: 32, letterSpacing: '-0.01em' }}> Daily.</span>
        </span>}
        leftKicker="Tue · Apr 21 · 2026"
        rightKicker="14 active clients"
        trailing={<BSAvatar init="J" size={32} fill={t.AMBER} ink={t.PAPER} onClick={onProfile} />}
      />

      {/* Edition strip — sub-hero under the masthead */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.AMBER }}>
          Coaches Edition · No. 21
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. VI
        </span>
      </div>

      <BSTicker items={[
        { label: 'BOOKED',  value: '8 SESN',  note: '6 LIVE · 2 ASYNC' },
        { label: 'REVENUE', value: '$1.2K',   note: 'TODAY' },
        { label: 'AVG RPE', value: '7.4',     color: '#a3e09a' },
        { label: 'PRGRM',   value: '12',      note: '4 EDITED THIS WEEK' },
        { label: 'CLIENTS', value: '14',      note: '+2 NEW' },
      ]} />

      {/* NOW PLAYING — Shape Radio */}
      <BSNowPlaying onOpen={goRadio} />

      {/* THIS WEEK — trainer view, dots = booking density */}
      <BSProWeekStrip
        goCalendar={goCalendar}
        selDay={selDay}
        onSelectDay={setSelDay}
        dots={{
          20: [t.RUST, t.RUST, t.BLUE],
          21: [t.RUST, t.RUST, t.RUST],
          22: [t.AMBER, t.GREEN],
          23: [t.RUST, t.BLUE],
          24: [t.RUST, t.RUST],
          25: [],
          26: [t.GREEN],
        }}
      />

      <div style={{ padding: `24px ${t.padX}px 22px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <BSEyebrow color={t.AMBER}>{lead.kicker}</BSEyebrow>
          <BSEyebrow>{selDay === 21 ? '09:42' : `Apr ${selDay}`}</BSEyebrow>
        </div>
        <BSHeadlineNumber value={lead.count} unit="SESSIONS" />
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: t.body + 1, color: t.INK70, lineHeight: 1.3, fontWeight: 500 }}>
          {lead.copy}
        </div>
      </div>

      <BSSection
        title={selDay === 21 ? "Today's bookings" : `Bookings · Apr ${selDay}`}
        meta={<span onClick={goCalendar} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Open calendar →</span>}
      />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {bookings.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
            — Off day · nothing booked —
          </div>
        ) : (
          bookings.map((r, i) => <BSRow key={i} {...r} />)
        )}
      </div>

      {/* ── HABIT TRACKER ─────────────────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <BSHabitTracker tweaks={tweaks} setTweak={setTweak} accent={t.AMBER} />
      </div>

      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Editorial · Cohort 6 review
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          11 of 14 hit RPE targets last week. Casey and Drew need a deload — pull them off Block 3 if RPE creeps.
        </div>
      </div>

      <BSFooter left="The Coach Edition" right="Pg 1 of 4" />
    </BSPage>
  );
}

function BSTrainerClients() {
  const t = useBS();
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Roster" title={<>14<br/>clients.</>} />
      <BSSection title="By status" meta="Sorted by last seen" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { i: 'A', c: t.RUST,  n: 'Alex Rivera',    r: 'CUT · W6 · D38',   d: 'JUST NOW',   s: 'on track' },
          { i: 'S', c: t.BLUE,  n: 'Sam Patel',      r: 'BUILD · W3',       d: '2H AGO',     s: 'on track' },
          { i: 'R', c: t.AMBER, n: 'Riley Kim',      r: 'CUT · W8',         d: '1D AGO',     s: 'review form' },
          { i: 'C', c: t.AMBER, n: 'Casey Lee',      r: 'PEAK · W11',       d: '1D AGO',     s: 'deload soon' },
          { i: 'D', c: t.GREEN, n: 'Drew Park',      r: 'PEAK · W11',       d: '2D AGO',     s: 'deload soon' },
          { i: 'M', c: t.RUST,  n: 'Morgan Liu',     r: 'INTAKE',           d: 'NEW',        s: 'onboard' },
          { i: 'Q', c: t.BLUE,  n: 'Quinn Choi',     r: 'BUILD · W2',       d: '3D AGO',     s: 'on track' },
        ].map((c, i, arr) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 90px',
            gap: 12, padding: `${t.rowY + 4}px 0`, alignItems: 'center',
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <BSAvatar init={c.i} fill={c.c} size={36} />
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{c.n}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.16em' }}>{c.r}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <BSEyebrow color={c.s === 'deload soon' ? t.RUST : t.INK50}>{c.d}</BSEyebrow>
            </div>
          </div>
        ))}
      </div>
      <BSFooter left="The Coach Edition" right="Pg 2 of 4" />
    </BSPage>
  );
}

function BSTrainerPrograms() {
  const t = useBS();
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Plans" title={<>Programs<br/>& blocks.</>} />
      <BSSection title="Active programs" meta="12 published · 4 drafts" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {[
          { n: 'Cut Block 6',     v: '12 wk · 14 clients',  c: t.AMBER },
          { n: 'Build · Hyper.',  v: '8 wk · 9 clients',    c: t.BLUE },
          { n: 'Peak · Push/Pull',v: '4 wk · 6 clients',    c: t.RUST },
          { n: 'Strength foundation', v: '6 wk · 4 clients', c: t.GREEN },
        ].map((p, i, arr) => (
          <div key={i} style={{
            padding: `${t.rowY + 6}px 0`,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            borderTop: i === 0 ? `2px solid ${t.INK}` : 0,
            display: 'grid', gridTemplateColumns: '12px 1fr 80px', gap: 12, alignItems: 'center',
          }}>
            <div style={{ width: 8, height: 8, background: p.c }} />
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, letterSpacing: '-0.02em' }}>{p.n}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em' }}>{p.v}</div>
            </div>
            <BSEyebrow color={t.ACCENT}>EDIT →</BSEyebrow>
          </div>
        ))}
      </div>
      <BSFooter left="The Coach Edition" right="Pg 3 of 4" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// NUTRITIONIST
// ═══════════════════════════════════════════════════════════
function BSNutritionistApp({ onLogout, tweaks, setTweak }) {
  return <BSSheetProvider><BSNutritionistAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} /></BSSheetProvider>;
}
function BSNutritionistAppInner({ onLogout, tweaks, setTweak }) {
  const sheet = useBSSheet();
  const [tab, setTab] = useStateBSP('today');
  const [showSettings, setShowSettings] = useStateBSP(false);
  const goRadio = () => setTab('radio');
  const goSettings = () => setShowSettings(true);
  if (showSettings) return <BSSettings onBack={() => setShowSettings(false)} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  const screens = {
    today:    <BSNutriToday onProfile={goSettings} sheet={sheet} goCalendar={() => setTab('cal')} goRadio={goRadio} tweaks={tweaks} setTweak={setTweak} />,
    cal:      <BSCalendarScreen role="nutritionist" onProfile={goSettings} />,
    clients:  <BSNutriClients sheet={sheet} />,
    plans:    <BSNutriPlans sheet={sheet} />,
    chat:     <BSClientChat onProfile={goSettings} sheet={sheet} role="nutritionist" />,
    radio:    <BSRadioScreen onBack={() => setTab('today')} />,
    me:       <BSProMe role="nutritionist" name="Dr. Maya Patel" onLogout={onLogout} onSettings={goSettings} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'cal',      label: 'Cal' },
        { key: 'clients',  label: 'Clients' },
        { key: 'plans',    label: 'Plans' },
        { key: 'chat',     label: 'Chat' },
        { key: 'me',       label: 'Me' },
      ]} />
      <BSRadioPrompt />
    </div>
  );
}

function _BSNutritionistApp_old({ onLogout }) {
  const [tab, setTab] = useStateBSP('today');
  const screens = {
    today:    <BSNutriToday onProfile={onLogout} />,
    clients:  <BSNutriClients />,
    plans:    <BSNutriPlans />,
    me:       <BSProMe role="nutritionist" name="Dr. Maya Patel" onLogout={onLogout} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSTabBar active={tab} onChange={setTab} tabs={[
        { key: 'today',    label: 'Today' },
        { key: 'clients',  label: 'Clients' },
        { key: 'plans',    label: 'Plans' },
        { key: 'me',       label: 'Me' },
      ]} />
    </div>
  );
}

function BSNutriToday({ onProfile, sheet, goCalendar, goRadio, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  return (
    <BSPage>
      <BSMasthead
        title={<span style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: "'DM Serif Display', 'Old Standard TT', serif", fontWeight: 400, fontSize: 32, letterSpacing: '-0.01em' }}>The </span>
          <span style={{ fontFamily: "'DM Serif Display', 'Old Standard TT', serif", fontWeight: 400, fontStyle: 'italic', fontSize: 46, letterSpacing: '-0.015em' }}>Shape</span>
          <span style={{ fontFamily: "'DM Serif Display', 'Old Standard TT', serif", fontWeight: 400, fontSize: 32, letterSpacing: '-0.01em' }}> Daily.</span>
        </span>}
        leftKicker="Tue · Apr 21 · 2026"
        rightKicker="22 plans · 5 consults"
        trailing={<BSAvatar init="M" size={32} fill={t.RUST} ink={t.PAPER} onClick={onProfile} />}
      />

      {/* Edition strip — sub-hero under the masthead */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.RUST }}>
          Coaches Edition · No. 21
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. VI
        </span>
      </div>

      <BSTicker items={[
        { label: 'CONSLT', value: '5 BOOKED', note: '2 INTAKE' },
        { label: 'PLANS',  value: '22 ACTV',  note: '6 EDITED 7D' },
        { label: 'AVG ADHR', value: '78%',    color: '#a3e09a' },
        { label: 'NEW',    value: '+3 7D',    color: '#7ed4ff' },
      ]} />

      {/* NOW PLAYING — Shape Radio */}
      <BSNowPlaying onOpen={goRadio} />

      {/* THIS WEEK — nutritionist view, dots = consult density */}
      <BSProWeekStrip
        goCalendar={goCalendar}
        dots={{
          20: [t.BLUE, t.BLUE],
          21: [t.GREEN, t.BLUE, t.BLUE],
          22: [t.BLUE],
          23: [t.GREEN, t.BLUE],
          24: [t.BLUE, t.BLUE],
          25: [],
          26: [t.AMBER],
        }}
      />

      <div style={{ padding: `24px ${t.padX}px 22px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <BSEyebrow color={t.RUST}>Lead · Consults today</BSEyebrow>
          <BSEyebrow>09:42</BSEyebrow>
        </div>
        <BSHeadlineNumber value="5" unit="CONSULTS" />
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: t.body + 1, color: t.INK70, lineHeight: 1.3, fontWeight: 500 }}>
          Two intakes, three follow-ups. First at 11am.
        </div>
      </div>

      <BSSection title="Today's consults" meta={<span onClick={goCalendar} style={{ cursor: 'pointer', textDecoration: 'underline' }}>Open calendar →</span>} />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { time: '11:00', tag: 'INTK', tagColor: t.GREEN, title: 'Sara Mendez',  sub: 'Initial · 60m' },
          { time: '13:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Jamie Wong',    sub: 'Cut adjustment · 30m' },
          { time: '15:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Alex Rivera',  sub: 'Macro check · 30m', state: 'next' },
          { time: '16:00', tag: 'F/U',  tagColor: t.BLUE,  title: 'Riley Kim',     sub: 'Refeed plan · 30m' },
          { time: '17:30', tag: 'INTK', tagColor: t.GREEN, title: 'Pat Doan',      sub: 'Initial · 60m', last: true },
        ].map((r, i) => <BSRow key={i} {...r} />)}
      </div>

      {/* ── HABIT TRACKER ─────────────────────────────────────────── */}
      <div style={{ marginTop: 8 }}>
        <BSHabitTracker tweaks={tweaks} setTweak={setTweak} accent={t.RUST} />
      </div>

      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Field notes
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          Adherence is up 11% on the simplified macro template. Push it to the next 4 intakes.
        </div>
      </div>

      <BSFooter left="The Nutri Edition" right="Pg 1 of 4" />
    </BSPage>
  );
}

function BSNutriClients() {
  const t = useBS();
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Roster" title={<>22<br/>plans.</>} />
      <BSSection title="By adherence" meta="Past 7d" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { i: 'A', c: t.RUST,  n: 'Alex Rivera',  r: 'CUT · 1900 KCAL',  d: '94%', good: true },
          { i: 'J', c: t.BLUE,  n: 'Jamie Wong',   r: 'CUT · 1700 KCAL',  d: '88%', good: true },
          { i: 'R', c: t.AMBER, n: 'Riley Kim',    r: 'CUT · 1850 KCAL',  d: '72%' },
          { i: 'S', c: t.GREEN, n: 'Sara Mendez',  r: 'INTAKE',           d: 'NEW' },
          { i: 'P', c: t.BLUE,  n: 'Pat Doan',     r: 'INTAKE',           d: 'NEW' },
          { i: 'C', c: t.AMBER, n: 'Casey Lee',    r: 'BUILD · 2400',     d: '64%', warn: true },
          { i: 'D', c: t.RUST,  n: 'Drew Park',    r: 'BUILD · 2200',     d: '58%', warn: true },
        ].map((c, i, arr) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 80px',
            gap: 12, padding: `${t.rowY + 4}px 0`, alignItems: 'center',
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <BSAvatar init={c.i} fill={c.c} size={36} />
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{c.n}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.16em' }}>{c.r}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <BSEyebrow color={c.warn ? t.RUST : (c.good ? t.GREEN : t.INK50)}>{c.d}</BSEyebrow>
            </div>
          </div>
        ))}
      </div>
      <BSFooter left="The Nutri Edition" right="Pg 2 of 4" />
    </BSPage>
  );
}

function BSNutriPlans() {
  const t = useBS();
  return (
    <BSPage>
      <BSPageHeader kicker="Section · Plans" title={<>Plan<br/>library.</>} />
      <BSSection title="Templates" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {[
          { n: 'Cut · 1700–1900 kcal',   v: '8 active', c: t.RUST },
          { n: 'Build · 2200–2600 kcal', v: '6 active', c: t.AMBER },
          { n: 'Maintenance',            v: '5 active', c: t.GREEN },
          { n: 'Recomp · macro-flex',    v: '3 active', c: t.BLUE },
        ].map((p, i, arr) => (
          <div key={i} style={{
            padding: `${t.rowY + 6}px 0`,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            borderTop: i === 0 ? `2px solid ${t.INK}` : 0,
            display: 'grid', gridTemplateColumns: '12px 1fr 80px', gap: 12, alignItems: 'center',
          }}>
            <div style={{ width: 8, height: 8, background: p.c }} />
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, letterSpacing: '-0.02em' }}>{p.n}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em' }}>{p.v}</div>
            </div>
            <BSEyebrow color={t.ACCENT}>EDIT →</BSEyebrow>
          </div>
        ))}
      </div>
      <BSFooter left="The Nutri Edition" right="Pg 3 of 4" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// SHARED PRO ME
// ═══════════════════════════════════════════════════════════
function BSProMe({ role, name, onLogout }) {
  const t = useBS();
  const isCoach = role === 'trainer';
  const accent = isCoach ? t.AMBER : t.RUST;
  const init = name[0];
  return (
    <BSPage>
      <BSPageHeader kicker={isCoach ? 'Coach · 4.9 ★' : 'Nutritionist · 4.9 ★'} title={<>{name.split(' ')[0]}<br/>{name.split(' ').slice(1).join(' ')}.</>} trailing={<BSAvatar init={init} size={32} fill={accent} ink={t.PAPER} />} />

      <div style={{ padding: `22px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
        <BSEyebrow color={t.ACCENT}>This month</BSEyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 12, gap: 0 }}>
          {[
            { l: 'CLIENTS', v: isCoach ? '14' : '22' },
            { l: 'REV',     v: isCoach ? '$8.4K' : '$11.2K' },
            { l: 'RATING',  v: '4.9' },
          ].map((m, i) => (
            <div key={m.l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 12 : 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50 }}>{m.l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 30, color: t.INK, marginTop: 4, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.v}</div>
            </div>
          ))}
        </div>
      </div>

      <BSSection title="Settings" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { l: 'Public profile',          r: 'Live' },
          { l: 'Booking calendar',        r: 'Synced' },
          { l: 'Payouts',                 r: 'Stripe' },
          { l: 'Notifications',           r: 'On' },
          { l: 'Sign out', alert: true },
        ].map((s, i, arr) => (
          <div key={i} onClick={s.alert ? onLogout : undefined} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: `${t.rowY + 4}px 0`,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            cursor: s.alert ? 'pointer' : 'default',
          }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: s.alert ? t.RUST : t.INK, letterSpacing: '-0.01em' }}>{s.l}</span>
            {s.r && <BSEyebrow>{s.r}</BSEyebrow>}
          </div>
        ))}
      </div>

      <BSCoachGoalPlan role={role} />

      <BSFooter left={isCoach ? 'The Coach Edition' : 'The Nutri Edition'} right="Pg 4 of 4" />
    </BSPage>
  );
}

// ─── Coach Goal Plan ────────────────────────────────────────
// Broadsheet-style goal-plan section — paper, ink, serif headings,
// rule-lines and mono kickers. Lives at the bottom of the Me page.
function BSCoachGoalPlan({ role = 'trainer' }) {
  const t = useBS();
  const isNutri = role === 'nutritionist';
  const ACC   = isNutri ? t.RUST : t.AMBER;
  const MONO  = t.MONO;
  const DISP  = t.DISPLAY;

  const goals = isNutri ? [
    { kicker: 'GOAL · 73%',  pct: 0.73, title: '30 active clients by July',     a: '22',     b: '30',     note: '8 to go · +2/wk intake gets there Jun 22' },
    { kicker: 'GOAL · 56%',  pct: 0.56, title: '$15k MRR by Q3',                a: '$8,420',  b: '$15,000', note: '$6.6k to go · 90% retention holds = Aug 30' },
    { kicker: 'GOAL · 50%',  pct: 0.50, title: 'Publish 2 meal-plan templates', a: '1',      b: '2',      note: 'Low-FODMAP cut shipping next week' },
    { kicker: 'GOAL · 89%',  pct: 0.89, title: '85% avg plan adherence',        a: '78%',    b: '85%',    note: '30d rolling · +7 pts needed' },
  ] : [
    { kicker: 'GOAL · 68%',  pct: 0.68, title: '50 active clients by July',     a: '34',     b: '50',     note: '16 to go · +3/wk pace gets there Jun 29' },
    { kicker: 'GOAL · 74%',  pct: 0.74, title: '$20k MRR by Q3',                a: '$14,829', b: '$20,000', note: '$5.2k to go · 92% retention holds = Aug 16' },
    { kicker: 'GOAL · 50%',  pct: 0.50, title: 'Publish 2 new programs',        a: '1',      b: '2',      note: 'Return-to-lifting shipping next week' },
    { kicker: 'GOAL · 97%',  pct: 0.97, title: '95% avg client adherence',      a: '92%',    b: '95%',    note: '30d rolling · +3 pts needed' },
  ];

  // Revenue calculator — live sliders. Different defaults for nutritionist vs trainer.
  const [rate,  setRate]  = useStateBSP(isNutri ? 120 : 85);   // $/consult or $/session
  const [sess,  setSess]  = useStateBSP(isNutri ? 14 : 22);    // consults or sessions / wk
  const [subs,  setSubs]  = useStateBSP(isNutri ? 540 : 486);  // $/wk meal-plan or program subs
  const [sales, setSales] = useStateBSP(isNutri ? 220 : 330);  // $/wk handouts or workout sales

  const grossWeek    = rate * sess + subs + sales;
  const takeWeek     = Math.round(grossWeek * 0.85);
  const grossMonth   = Math.round(grossWeek * 4.33);
  const takeMonth    = Math.round(takeWeek * 4.33);
  const grossQuarter = Math.round(grossWeek * 13);
  const takeQuarter  = Math.round(takeWeek * 13);
  const grossYear    = Math.round(grossWeek * 52);
  const takeYear     = Math.round(takeWeek * 52);
  const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
  const currentPaceWeek = 3897;
  const delta = takeWeek - currentPaceWeek;

  const eyebrow = (txt, color) => (
    <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: color || t.INK50, fontWeight: 700 }}>{txt}</span>
  );

  const Slider = ({ label, value, set, min, max, step, fmtVal }) => (
    <div>
      <div style={{ display: 'flex', justifyContent: 'baseline', alignItems: 'baseline', marginBottom: 6, gap: 8 }}>
        <span style={{ fontFamily: DISP, fontSize: 13, color: t.INK, letterSpacing: '-0.005em', flex: 1 }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 11, color: t.INK, fontWeight: 700, letterSpacing: '0.04em', fontVariantNumeric: 'tabular-nums' }}>{fmtVal(value)}</span>
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value}
        onChange={(e) => set(Number(e.target.value))}
        className="bs-coach-range"
        style={{ width: '100%', height: 4, accentColor: ACC, cursor: 'pointer', background: 'transparent' }}
      />
    </div>
  );

  const GoalRow = (g) => (
    <div style={{
      padding: `${t.rowY + 6}px 0`,
      borderBottom: `1px solid ${t.HAIR}`,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
        {eyebrow(g.kicker, ACC)}
        {eyebrow('EDIT →', t.ACCENT)}
      </div>
      <div style={{ fontFamily: DISP, fontWeight: t.W.display, fontSize: 22, color: t.INK, letterSpacing: '-0.025em', lineHeight: 1.1, marginBottom: 12 }}>{g.title}</div>
      <div style={{ height: 4, background: t.HAIR, position: 'relative', marginBottom: 6 }}>
        <div style={{ position: 'absolute', inset: 0, width: `${g.pct * 100}%`, background: t.INK }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.06em', marginBottom: 6, fontVariantNumeric: 'tabular-nums' }}>
        <span>{g.a}</span>
        <span>{g.b}</span>
      </div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: t.INK70, letterSpacing: '0.04em' }}>{g.note}</div>
    </div>
  );

  const StatCell = ({ l, v, sub, accent, borderLeft, borderTop }) => (
    <div style={{
      padding: 14,
      borderLeft: borderLeft ? `1px solid ${t.RULE}` : 0,
      borderTop:  borderTop  ? `1px solid ${t.RULE}` : 0,
    }}>
      <div style={{ marginBottom: 6 }}>{eyebrow(l)}</div>
      <div style={{ fontFamily: DISP, fontWeight: t.W.display, fontSize: 28, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
      {sub && <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 9, color: accent || t.INK50, letterSpacing: '0.04em', lineHeight: 1.5 }}>{sub}</div>}
    </div>
  );

  return (
    <>
      {/* Range track styling — paper-and-ink */}
      <style>{`
        .bs-coach-range { -webkit-appearance: none; appearance: none; }
        .bs-coach-range::-webkit-slider-runnable-track { height: 2px; background: ${t.RULE}; border-radius: 0; }
        .bs-coach-range::-moz-range-track { height: 2px; background: ${t.RULE}; border-radius: 0; }
        .bs-coach-range::-webkit-slider-thumb { -webkit-appearance: none; appearance: none; width: 14px; height: 14px; background: ${t.INK}; margin-top: -6px; cursor: pointer; border-radius: 0; }
        .bs-coach-range::-moz-range-thumb { width: 14px; height: 14px; background: ${t.INK}; border: 0; cursor: pointer; border-radius: 0; }
      `}</style>

      <BSSection title="Goal plan" meta="Q2 · 2026" />

      {/* Goals — stacked rows, broadsheet rule-line list */}
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {goals.map((g, i) => <GoalRow key={i} {...g} />)}
      </div>

      {/* Revenue calculator — paper card with hairline frame */}
      <BSSection title="Revenue calculator" kicker="Set your target" />
      <div style={{
        margin: `0 ${t.padX}px`,
        padding: `${t.rowY + 4}px 14px`,
        borderTop: `2px solid ${t.INK}`,
        borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER2,
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Slider label={isNutri ? 'Consult rate' : 'Session rate'}                              value={rate}  set={setRate}  min={40} max={250}  step={5}  fmtVal={v => '$' + v} />
          <Slider label={isNutri ? 'Consults / week' : 'Sessions / week'}                        value={sess}  set={setSess}  min={0}  max={40}   step={1}  fmtVal={v => v} />
          <Slider label={isNutri ? 'Meal-plan subscriptions / week' : 'Program subscriptions / week'}     value={subs}  set={setSubs}  min={0}  max={2000} step={10} fmtVal={v => '$' + v} />
          <Slider label={isNutri ? 'One-time handouts & guides / week' : 'One-time workout sales / week'} value={sales} set={setSales} min={0}  max={1500} step={10} fmtVal={v => '$' + v} />
        </div>
      </div>

      {/* Take-home — 2×2, hairline-divided like the page-header stat block */}
      <div style={{ margin: `0 ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          <StatCell l="Weekly take-home"    v={fmt(takeWeek)}    sub={`${delta >= 0 ? '+' : '−'}${fmt(Math.abs(delta)).slice(1)} vs $${currentPaceWeek.toLocaleString()} pace · ${fmt(grossWeek)} gross`} accent={delta >= 0 ? ACC : t.RUST} />
          <StatCell l="Monthly take-home"   v={fmt(takeMonth)}   sub={`${fmt(grossMonth)} gross · 4.33 wks`} borderLeft />
          <StatCell l="Quarterly take-home" v={fmt(takeQuarter)} sub={`${fmt(grossQuarter)} gross · 3 months`} borderTop />
          <StatCell l="Annual take-home"    v={fmt(takeYear)}    sub={`${fmt(grossYear)} gross · 12 months`} borderTop borderLeft />
        </div>
      </div>

      <div style={{ padding: `12px ${t.padX}px 18px`, fontFamily: t.SERIF || DISP, fontSize: 12, color: t.INK70, lineHeight: 1.5, fontStyle: 'italic' }}>
        {isNutri
          ? <>Based on consult earnings, meal-plan subscriptions, and one-time guides. Figures shown are <strong style={{ color: t.INK }}>take-home</strong> after Shape's 15% platform fee. Gross this week: {fmt(grossWeek)}.</>
          : <>Based on session earnings, program subscriptions, and one-time workout sales. Figures shown are <strong style={{ color: t.INK }}>take-home</strong> after Shape's 15% platform fee. Gross this week: {fmt(grossWeek)}.</>}
      </div>

      {/* Momentum */}
      <BSSection title="Momentum" meta="This quarter" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', padding: `${t.rowY + 4}px 0` }}>
          {(isNutri ? [
            { v: '+8',     l: 'Net new clients',     sub: 'vs +4 last Q' },
            { v: '+$2.1k', l: 'MRR growth',          sub: 'vs +$0.9k last Q' },
            { v: '3',      l: 'Plans published',     sub: 'vs 1 last Q' },
            { v: '+5 pts', l: 'Adherence',           sub: 'vs +2 pts last Q' },
          ] : [
            { v: '+11',    l: 'Net new clients',     sub: 'vs +6 last Q' },
            { v: '+$3.4k', l: 'MRR growth',          sub: 'vs +$1.5k last Q' },
            { v: '2',      l: 'Programs shipped',    sub: 'vs 1 last Q' },
            { v: '+4 pts', l: 'Adherence',           sub: 'vs +1 pts last Q' },
          ]).map((m, i) => (
            <div key={i} style={{
              padding: `12px ${i % 2 === 1 ? 0 : 14}px 12px ${i % 2 === 0 ? 0 : 14}px`,
              borderLeft: i % 2 === 1 ? `1px solid ${t.RULE}` : 0,
              borderTop:  i >= 2      ? `1px solid ${t.RULE}` : 0,
            }}>
              <div style={{ fontFamily: DISP, fontWeight: t.W.display, fontSize: 28, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.v}</div>
              <div style={{ marginTop: 6, fontFamily: DISP, fontSize: 13, color: t.INK, letterSpacing: '-0.005em', fontWeight: 600 }}>{m.l}</div>
              <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.06em' }}>{m.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

window.BSTrainerApp = BSTrainerApp;
window.BSNutritionistApp = BSNutritionistApp;


Object.assign(window, { BSTrainerApp, BSNutritionistApp });
