// iosAppBroadsheetClient.jsx — Client role: Home, Train, Eat, Chat, Me
// Uses primitives from iosAppBroadsheet.jsx via window globals.

const { useState: useStateBSC } = React;
const {
  useBS, BSPage, BSMasthead, BSPageHeader, BSAvatar, BSEyebrow, BSSection,
  BSSlab, BSCell, BSTag, BSRow, BSHeadlineNumber, BSTicker, BSHalftone,
  BSTabBar, BSFooter,
  BSSheetProvider, useBSSheet, BSCalendarScreen, BSEventSheet,
  BSRadioProvider, useBSRadio, BSRadioPrompt, BSRadioScreen, BSNowPlaying,
  BSMarketplaceScreen,
  RadioEffects,
} = window;

// Renders the music-reactive overlay (edge glow / bloom / hologram DJ)
// only while radio is on, not paused, and fxMode != 'off'.
function BSRadioFx() {
  const r = useBSRadio();
  if (!r.radioOn || r.paused) return null;
  if (!r.fxMode || r.fxMode === 'off') return null;
  if (typeof RadioEffects !== 'function') return null;
  const label = `${r.LIVE.show.toUpperCase()} · ${r.LIVE.bpm} BPM`;
  return <RadioEffects mode={r.fxMode} label={label} />;
}

// Inner wrapper so BSClientApp can access useBSSheet
function BSClientAppInner({ onLogout, tweaks, setTweak }) {
  const sheet = useBSSheet();
  const [tab, setTab] = useStateBSC('home');
  const [showSettings, setShowSettings] = useStateBSC(false);
  const goSettings = () => setShowSettings(true);
  const goRadio    = () => setTab('radio');
  const goTrain    = () => setTab('train');
  const goMarket   = () => setTab('market');
  if (showSettings) return <BSSettings onBack={() => setShowSettings(false)} onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />;
  const screens = {
    home:    <BSClientHome     onProfile={goSettings} sheet={sheet} goCalendar={() => setTab('cal')} goRadio={goRadio} goTrain={goTrain} goMarket={goMarket} tweaks={tweaks} setTweak={setTweak} />,
    cal:     <BSCalendarScreen role="client"        onProfile={goSettings} onBack={() => setTab('home')} />,
    train:   <BSClientTrain    onProfile={goSettings} sheet={sheet} />,
    eat:     <BSClientEat      onProfile={goSettings} sheet={sheet} />,
    chat:    <BSClientChat     onProfile={goSettings} sheet={sheet} />,
    radio:   <BSRadioScreen    onBack={() => setTab('home')} />,
    market:  <BSMarketplaceScreen onBack={() => setTab('home')} onProfile={goSettings} />,
    me:      <BSClientMe       onProfile={goSettings} onLogout={onLogout} sheet={sheet} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSRadioFx />
      <BSTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'home',  label: 'Home' },
          { key: 'cal',   label: 'Cal' },
          { key: 'train', label: 'Train' },
          { key: 'eat',   label: 'Eat' },
          { key: 'chat',  label: 'Chat' },
          { key: 'me',    label: 'Me' },
        ]}
      />
      <BSRadioPrompt />
    </div>
  );
}

function BSClientApp({ onLogout, tweaks, setTweak }) {
  // BSRadioProvider is provided by the entry-point shell (iosAppHub.jsx →
  // BroadsheetSlot, or iosAppBroadsheetMain.jsx → BroadsheetApp), HOISTED
  // ABOVE the stage switch so radio state survives logout → re-login.
  // Without that hoisting, BSRadioProvider would remount on login and fire
  // its 600ms auto-prompt — making Home flash before the overlay.
  return (
    <BSSheetProvider>
      <BSClientAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} />
    </BSSheetProvider>
  );
}

// Stub kept for diff context — old shell, never rendered:
function BSClientApp_old({ onLogout }) {
  const [tab, setTab] = useStateBSC('home');
  const screens = {
    home:  <BSClientHome  onProfile={onLogout} />,
    train: <BSClientTrain onProfile={onLogout} />,
    eat:   <BSClientEat   onProfile={onLogout} />,
    chat:  <BSClientChat  onProfile={onLogout} />,
    me:    <BSClientMe    onProfile={onLogout} onLogout={onLogout} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <BSTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'home',  label: 'Home' },
          { key: 'train', label: 'Train' },
          { key: 'eat',   label: 'Eat' },
          { key: 'chat',  label: 'Chat' },
          { key: 'me',    label: 'Me' },
        ]}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME — "The Shape Daily" front page
// ═══════════════════════════════════════════════════════════
function BSClientHome({ onProfile, sheet, goCalendar, goRadio, goTrain, goMarket, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const [selDay, setSelDay] = useStateBSC(21);
  const [nextMealLogged, setNextMealLogged] = useStateBSC(false);
  const [previewMeal, setPreviewMeal] = useStateBSC(null);
  const [habitsPage, setHabitsPage] = useStateBSC(false);

  // Home-page lunch record (fed to BSMealPreview when user taps the slab).
  // Mirrors the shape of meals in BSClientEat — same preview component.
  const HOME_LUNCH = {
    id: 'home-lunch',
    time: '12:40', tag: 'LUNCH', tagColor: t.AMBER,
    title: 'Chicken bowl with rice',
    sub: '620 kcal · 48P · 72C · 14F',
    kcal: 620, p: 48, c: 72, f: 14, prep: '15 min', portion: '1 bowl', score: 'A',
    hero: 'Grilled chicken thigh, jasmine rice, roasted vegetables, tahini-lemon sauce.',
    brief: 'The anchor meal of the day — biggest carb hit, biggest protein. Eat slow, finish the plate.',
    ingredients: [
      { n: '180 g', m: 'Chicken thigh',      k: '320 kcal' },
      { n: '150 g', m: 'Jasmine rice',       k: '195 kcal' },
      { n: '120 g', m: 'Roast veg medley',   k: '60 kcal' },
      { n: '15 g',  m: 'Tahini',             k: '95 kcal' },
      { n: '½',     m: 'Lemon',              k: '5 kcal' },
    ],
    steps: [
      'Season chicken with salt + paprika, sear 4 min/side over medium-high.',
      'Cook rice 1:1.5 in salted water, cover 12 min, fluff.',
      'Roast veg at 220°C / 425°F for 15 min, flipping halfway.',
      'Whisk tahini + lemon + 30 ml warm water until pourable.',
      'Plate rice, top with chicken + veg, drizzle sauce.',
    ],
    coachNote: 'This is your peak fueling moment. If energy crashed yesterday, add 30 g rice today.',
  };

  // Per-day logs. State 'done' for past, 'next' for the upcoming highlighted item, otherwise neutral.
  const DAY_LOGS = {
    20: [
      { time: '06:50', tag: 'MEAL', tagColor: t.BLUE,  title: 'Eggs, toast, fruit',     sub: '438 kcal · 28P', state: 'done' },
      { time: '08:30', tag: 'TRN',  tagColor: t.AMBER, title: 'Lower Pull — Vol.',      sub: '58 min · Jordan', state: 'done' },
      { time: '12:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Turkey wrap',            sub: '540 kcal · 38P', state: 'done' },
      { time: '15:15', tag: 'CHK',  tagColor: t.GREEN, title: 'Mid-day check-in',       sub: 'Energy 7/10',   state: 'done' },
      { time: '18:30', tag: 'CHK',  tagColor: t.GREEN, title: 'Evening check-in',       sub: 'RPE recap · Jordan', state: 'done' },
      { time: '19:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Steak, sweet potato',    sub: '610 kcal · 46P', state: 'done', last: true },
    ],
    21: [
      { time: '07:20', tag: 'MEAL', tagColor: t.BLUE,  title: 'Oats, berries, whey',     sub: '412 kcal · 32P', state: 'done' },
      { time: '09:05', tag: 'TRN',  tagColor: t.AMBER, title: 'Upper Push — Peak',       sub: '52 min · Jordan',state: 'done' },
      { time: '09:45', tag: 'CHK',  tagColor: t.GREEN, title: 'Morning check-in',        sub: 'Sleep 7h · 8/10', state: 'done' },
      { time: '12:40', tag: 'MEAL', tagColor: t.BLUE,  title: 'Chicken bowl + rice',     sub: '620 kcal · 48P', state: 'next' },
      { time: '15:00', tag: 'CON',  tagColor: t.RUST,  title: 'Nutrition consult',       sub: 'Dr. Maya · Zoom' },
      { time: '16:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Greek yogurt + almonds', sub: '280 kcal · 22P' },
      { time: '18:30', tag: 'CHK',  tagColor: t.GREEN, title: 'Evening check-in',        sub: 'RPE recap · Jordan' },
      { time: '19:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Salmon, quinoa, greens', sub: '580 kcal · 44P', last: true },
    ],
    22: [
      { time: '07:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Oats + whey + banana',    sub: '460 kcal · 34P' },
      { time: '08:00', tag: 'TRN',  tagColor: t.AMBER, title: 'Upper Pull — Peak',       sub: '52 min · Jordan' },
      { time: '12:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Chicken caesar',          sub: '560 kcal · 42P' },
      { time: '15:30', tag: 'CHK',  tagColor: t.GREEN, title: 'Daily check-in',          sub: 'Sleep 7h12 · 8/10' },
      { time: '19:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Cod, rice, broccoli',     sub: '550 kcal · 42P', last: true },
    ],
    23: [
      { time: '07:15', tag: 'MEAL', tagColor: t.BLUE,  title: 'Yogurt parfait',          sub: '380 kcal · 30P' },
      { time: '12:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Buddha bowl',             sub: '590 kcal · 34P' },
      { time: '17:45', tag: 'TRN',  tagColor: t.AMBER, title: 'Z2 run · 45 min',         sub: '5.6k · 8:00/km', last: true },
    ],
    24: [
      { time: '07:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Egg whites, toast',       sub: '320 kcal · 28P' },
      { time: '09:00', tag: 'TRN',  tagColor: t.AMBER, title: 'Lower Push — Peak',       sub: '54 min · Jordan' },
      { time: '12:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Sushi, edamame',          sub: '640 kcal · 38P' },
      { time: '15:00', tag: 'CON',  tagColor: t.RUST,  title: 'Nutrition consult',       sub: 'Dr. Maya · Zoom' },
      { time: '18:30', tag: 'CHK',  tagColor: t.GREEN, title: 'Evening check-in',        sub: 'RPE recap · Jordan' },
      { time: '20:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Pizza night (Fri)',       sub: 'Refeed · 38P', last: true },
    ],
    25: [
      { time: '08:30', tag: 'TRN',  tagColor: t.AMBER, title: 'Long run · 75 min',       sub: '11k · easy' },
      { time: '10:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Brunch · pancakes',       sub: '720 kcal · 28P' },
      { time: '14:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Smoothie + nuts',         sub: '420 kcal · 28P' },
      { time: '19:30', tag: 'MEAL', tagColor: t.BLUE,  title: 'Bolognese, salad',        sub: '580 kcal · 38P', last: true },
    ],
    26: [
      { time: '09:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Brunch (light)',          sub: '480 kcal · 28P' },
      { time: '13:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Sunday meal prep',        sub: '8 meals · 220P' },
      { time: '18:00', tag: 'MEAL', tagColor: t.BLUE,  title: 'Light dinner',            sub: '420 kcal · 32P', last: true },
    ],
  };

  const WEEK_DOTS = {
    20: [t.AMBER, t.BLUE, t.GREEN], 21: [t.AMBER, t.RUST, t.BLUE], 22: [t.AMBER, t.GREEN],
    23: [t.AMBER], 24: [t.AMBER, t.RUST, t.GREEN], 25: [t.AMBER, t.BLUE], 26: [],
  };
  const dayLog = DAY_LOGS[selDay] || [];

  // Per-day calorie balance for the LEAD block (target = 2100 burned).
  // Sums kcal from MEAL items in DAY_LOGS, computes deficit/surplus.
  const DAY_MACROS = {
    20: { kcalIn: 1588, kcalBurn: 2100, status: 'logged', note: 'Five logs in. Lower pull + 4 meals.' },
    21: { kcalIn: 1568, kcalBurn: 2100, status: 'on track', note: 'On track. 1568 in, 2100 burned.\nOne workout and lunch left to log.' },
    22: { kcalIn: 1570, kcalBurn: 2050, status: 'on track', note: 'Day done. Pull day + 3 meals.' },
    23: { kcalIn: 1550, kcalBurn: 1900, status: 'easy day', note: 'Light day. Z2 run + 2 meals.' },
    24: { kcalIn: 2200, kcalBurn: 2100, status: 'refeed',   note: 'Refeed Friday. +100 over target.\nPlanned ahead of consult.' },
    25: { kcalIn: 1720, kcalBurn: 1850, status: 'long run', note: 'Long run done. Brunch + 3 meals.' },
    26: { kcalIn: 1320, kcalBurn: 1700, status: 'rest day', note: 'Rest day. Three lighter meals.' },
  };
  const macros = DAY_MACROS[selDay] || DAY_MACROS[21];
  const balance = macros.kcalIn - macros.kcalBurn; // negative = deficit
  const balanceSign = balance < 0 ? '−' : '+';
  const balanceValue = Math.abs(balance).toString();
  const leadKicker = balance < 0 ? 'Lead · Calorie deficit'
                  : balance > 0 ? 'Lead · Calorie surplus'
                  : 'Lead · Maintenance';

  if (previewMeal) {
    return <BSMealPreview meal={previewMeal} onBack={() => setPreviewMeal(null)} />;
  }
  if (habitsPage) {
    return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => setHabitsPage(false)} />;
  }

  return (
    <BSPage>
      <BSMasthead
        title={<span style={{ display: 'block', textAlign: 'center', lineHeight: 1, whiteSpace: 'nowrap' }}>
          <span style={{ fontFamily: `'DM Serif Display', 'Old Standard TT', serif`, fontWeight: 400, fontSize: 32, letterSpacing: '-0.01em' }}>The </span>
          <span style={{ fontFamily: `'DM Serif Display', 'Old Standard TT', serif`, fontWeight: 400, fontStyle: 'italic', fontSize: 46, letterSpacing: '-0.015em' }}>Shape</span>
          <span style={{ fontFamily: `'DM Serif Display', 'Old Standard TT', serif`, fontWeight: 400, fontSize: 32, letterSpacing: '-0.01em' }}> Daily.</span>
        </span>}
        leftKicker="Tue · Apr 21 · 2026"
        rightKicker="Cut · W6 · D38"
        trailing={<BSAvatar init="A" size={32} onClick={onProfile} />}
      />

      {/* Edition strip — sub-hero under the masthead */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.GREEN }}>
          Clients Edition · No. 21
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. VI
        </span>
      </div>

      <BSTicker items={[
        { label: 'CAL',  value: '1568/2100', note: '-25% TGT' },
        { label: 'PRO',  value: '118G',      note: 'ON PACE' },
        { label: 'SLP',  value: '7H24M',     note: '+28M VS AVG', color: '#a3e09a' },
        { label: 'HRV',  value: '62MS',      note: 'GOOD',         color: '#a3e09a' },
        { label: 'RHR',  value: '54BPM',     note: 'ELEV +2',      color: '#ffc56a' },
        { label: 'WGT',  value: '178.2LB',   note: '-0.4 7D' },
      ]} />

      {/* THIS WEEK — calendar preview (moved above NowPlaying) */}
      <BSSection title="This week" kicker={`Wk 17 · Apr 20–26 · Apr ${selDay}`} meta={<span onClick={goCalendar} style={{ cursor: 'pointer', fontWeight: 800, color: t.INK, marginLeft: 'auto' }}>Month view →</span>} />
      <div style={{ padding: `0 ${t.padX}px 14px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderTop: `2px solid ${t.INK}`, paddingTop: 10 }}>
          {[
            { d: 20, l: 'M' }, { d: 21, l: 'T', isToday: true }, { d: 22, l: 'W' },
            { d: 23, l: 'T' }, { d: 24, l: 'F' }, { d: 25, l: 'S' }, { d: 26, l: 'S' },
          ].map((day) => {
            const on    = day.d === selDay;
            const today = day.isToday;
            const dots  = WEEK_DOTS[day.d] || [];
            return (
              <button key={day.d} onClick={() => setSelDay(day.d)} style={{ borderRadius: t.RADIUS_SM,
                border: `1px solid ${on ? t.INK : t.HAIR}`,
                background: on ? t.INK : (today ? t.PAPER2 : 'transparent'),
                color: on ? t.PAPER : t.INK,
                padding: '8px 0 6px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', fontWeight: 600, opacity: today && !on ? 1 : 0.7 }}>{day.l}</span>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{day.d}</span>
                <span style={{ display: 'flex', gap: 3, height: 4, marginTop: 2 }}>
                  {dots.slice(0, 3).map((c, k) => <span key={k} style={{ width: 4, height: 4, borderRadius: '50%', background: c }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* NOW PLAYING — Shape Radio */}
      <BSNowPlaying onOpen={goRadio} />

      {/* THIS WEEK — (moved above) */}

      {/* LEAD — calorie headline */}
      <div style={{ padding: `24px ${t.padX}px 22px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 8 }}>
          <BSEyebrow color={t.ACCENT}>{leadKicker}</BSEyebrow>
          <BSEyebrow>{selDay === 21 ? '09:42' : `Apr ${selDay}`}</BSEyebrow>
        </div>
        <BSHeadlineNumber sign={balanceSign} value={balanceValue} unit="KCAL" size={Math.round(t.headlineHero * 0.78)} />
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: t.body + 1, fontWeight: 500, color: t.INK70, letterSpacing: '-0.01em', lineHeight: 1.3, whiteSpace: 'pre-line' }}>
          {macros.note}
        </div>

        {/* Spark — interactive: tap a day to scope the Day log below */}
        <div style={{ marginTop: 10, display: 'flex', gap: 3, height: 26, alignItems: 'flex-end' }}>
          {[0.62, 0.78, 0.55, 0.81, 0.69, 0.74, 0.96].map((v, i) => {
            const dayNum = 20 + i;
            const today = i === 1;
            const on = dayNum === selDay;
            return (
              <button
                key={i}
                onClick={() => setSelDay(dayNum)}
                style={{ borderRadius: t.RADIUS_SM,
                  flex: 1, padding: 0, border: 0, background: 'transparent', cursor: 'pointer',
                  display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
                  height: '100%', justifyContent: 'flex-end',
                }}
              >
                <div style={{
                  width: '100%', height: `${v * 100}%`,
                  background: on ? t.INK : (today ? t.ACCENT : t.INK),
                  opacity: on ? 1 : (today ? 1 : 0.5),
                }} />
                <span style={{
                  fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em',
                  color: on ? t.INK : (today ? t.ACCENT : t.INK50),
                  fontWeight: on || today ? 700 : 400,
                }}>
                  {['M','T','W','T','F','S','S'][i]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* DAY LOG */}
      <BSSection title="Day log" kicker={selDay === 21 ? 'Today · Apr 21' : `Apr ${selDay}`} meta={`${dayLog.length} item${dayLog.length === 1 ? '' : 's'}`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }} />
        {dayLog.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
            — Rest day · nothing logged —
          </div>
        ) : (
          dayLog.map((row, i) => <BSRow key={i} {...row} />)
        )}
      </div>

      {/* ── HABIT TRACKER (summary on home; full page via tap) ───── */}
      <BSHabitTracker tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} mode="summary" onOpen={() => setHabitsPage(true)} />

      <BSSection title="Up next" kicker="3 of 8 done" />

      {/* NEXT WORKOUT — slab (today's training) */}
      <BSSlab>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
          <BSTag color={t.AMBER}>TRAIN</BSTag>
          <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK, letterSpacing: '0.12em' }}>10:30 AM</span>
          <span style={{ flex: 1 }} />
          <BSEyebrow>Tap to start →</BSEyebrow>
        </div>
        <div onClick={goTrain} style={{ cursor: 'pointer', fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: t.headlineLead, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK, marginTop: 8 }}>
          Upper Pull —<br/>Peak.
        </div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, fontWeight: 600 }}>
          6 moves · 52 min · RPE 8 · w/ Jordan
        </div>
        <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.RULE}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[['MOVES', '6'], ['VOL', '1900LB'], ['BLOCK', 'W6/D4'], ['LAST', '+2.5%']].map(([l, v], i) => (
            <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 18, color: t.INK, marginTop: 3, letterSpacing: '-0.02em' }}>{v}</div>
            </div>
          ))}
        </div>
        <button onClick={goTrain} style={{ borderRadius: t.RADIUS_SM,
          marginTop: 12, width: '100%', padding: '12px',
          background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
        }}>Start session →</button>
      </BSSlab>

      {/* NEXT MEAL — slab. Tap card opens preview; the right-side affordance
          logs/un-logs without leaving the home page. */}
      <BSSlab tinted>
        <div onClick={() => setPreviewMeal(HOME_LUNCH)} style={{ cursor: 'pointer' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 4 }}>
            <BSTag color={nextMealLogged ? t.GREEN : t.ACCENT}>LUNCH</BSTag>
            <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK, letterSpacing: '0.12em' }}>12:40 PM</span>
            <span style={{ flex: 1 }} />
            {nextMealLogged ? (
              <span
                onClick={(e) => { e.stopPropagation(); setNextMealLogged(false); }}
                style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.GREEN, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}
              >
                ✓ Logged · undo
              </span>
            ) : (
              <span
                onClick={(e) => { e.stopPropagation(); setNextMealLogged(true); }}
                style={{ cursor: 'pointer' }}
              >
                <BSEyebrow>Tap to log →</BSEyebrow>
              </span>
            )}
          </div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: t.headlineLead, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK, marginTop: 8 }}>
            Chicken bowl<br/>with rice.
          </div>
          <div style={{ marginTop: 12, paddingTop: 10, borderTop: `1px solid ${t.RULE}`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
            {[['KCAL', '620'], ['PRO', '48g'], ['CARB', '72g'], ['FAT', '14g']].map(([l, v], i) => (
              <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
                <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 18, color: t.INK, marginTop: 3, letterSpacing: '-0.02em' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
      </BSSlab>

      {/* THIS WEEK — (moved to top) */}

      {/* OP-ED */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Op-ed · Your coach
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 22, lineHeight: 1.2, letterSpacing: '-0.02em' }}>
          "You're three weeks in. The tempo is the point — slow eccentric on every press."
        </div>
        <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid rgba(245,240,230,0.18)`, display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
          <span>By Jordan Chen · Coach</span>
          <span style={{ opacity: 0.55 }}>Mon · 8:15</span>
        </div>
      </div>

      {/* MARKETPLACE — full-width feature card */}
      <BSSection title="Marketplace" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSCell onClick={goMarket} accent={t.RUST} style={{ padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.INK, fontWeight: 800 }}>★ Wanted</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70 }}>3,100 coaches · 412 nutri</div>
          </div>

          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 30, color: t.INK, marginTop: 10, letterSpacing: '-0.025em', lineHeight: 0.95 }}>
            Find your<br/>next coach.
          </div>

          <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK85, marginTop: 8, lineHeight: 1.3, letterSpacing: '-0.005em' }}>
            Browse vetted trainers &amp; nutritionists. Filter by goal, location, schedule.
          </div>

          {/* meta row */}
          <div style={{ display: 'flex', gap: 14, marginTop: 14, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>
            <span>Hypertrophy · 412</span>
            <span>Endurance · 280</span>
            <span>Postpartum · 96</span>
          </div>

          {/* CTA chip */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: `1px solid ${t.INK}`, paddingTop: 10 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK }}>Browse Marketplace</div>
            <div style={{ fontFamily: t.MONO, fontSize: 14, color: t.INK }}>→</div>
          </div>
        </BSCell>
      </div>

      {/* ── HOME WIDGETS — user-added stats & blocks ─────────────── */}
      {(() => {
        const added = _bsHomeWidgets(tweaks);
        const setList = (next) => setTweak('homeWidgets', _bsEncodeWidgets(next));
        const remove = (k) => setList(added.filter(w => w.key !== k));
        const add    = (k) => { if (!added.find(w => w.key === k)) setList([...added, { key: k, span: 2 }]); };
        const setSpan = (k, span) => setList(added.map(w => w.key === k ? { ...w, span } : w));
        const addedKeys = added.map(w => w.key);
        return (
          <>
            {added.length > 0 && (
              <>
                <BSSection title="Your widgets" meta={`${added.length} active`} />
                <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px`, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10, borderTop: `2px solid ${t.INK}` }}>
                  {added.map(w => (
                    <div key={w.key} style={{ minWidth: 0, gridColumn: w.span === 1 ? 'span 2' : 'span 1' }}>
                      <BSWidgetSlot widgetKey={w.key} onRemove={remove} />
                    </div>
                  ))}
                </div>
              </>
            )}

            <BSSection title="Add widgets" meta={`${Object.keys(BS_WIDGETS).length - added.length} available`} />
            <BSAddWidgets added={addedKeys} onAdd={add} />
          </>
        );
      })()}

      <BSFooter right="Pg 1 of 1" />
    </BSPage>
  );
}

// ─── helper: tweaks-backed widget list ─────────────────────
// Encoded as comma-separated "key:span" pairs; legacy "key" decodes as span 2.
function _bsHomeWidgets(tweaks) {
  const v = tweaks.homeWidgets;
  const arr = typeof v === 'string'
    ? v.split(',').filter(Boolean)
    : Array.isArray(v) ? v : [];
  return arr.map(item => {
    if (typeof item !== 'string') return null;
    const [key, span] = item.split(':');
    if (!key) return null;
    return { key, span: span === '1' ? 1 : 2 };
  }).filter(Boolean);
}
function _bsEncodeWidgets(list) {
  return list.map(w => `${w.key}:${w.span}`).join(',');
}

// ─── Add-widgets disclosure (collapsed by default) ─────────
function BSAddWidgets({ added, onAdd }) {
  const t = useBS();
  const [open, setOpen] = useStateBSC(false);
  const remaining = Object.keys(BS_WIDGETS).length - added.length;
  return (
    <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px`, borderTop: `2px solid ${t.INK}` }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{ borderRadius: t.RADIUS_SM,
          width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px', cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${t.INK}`, background: open ? t.PAPER2 : t.PAPER, color: t.INK,
        }}
      >
        <div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.displayHeavy, fontSize: 18, color: t.INK, letterSpacing: '-0.01em' }}>
            + Add a widget
          </div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK70, marginTop: 4 }}>
            Stats, trackers &amp; cards · {remaining} available
          </div>
        </div>
        <div style={{ fontFamily: t.MONO, fontSize: 18, color: t.INK, fontWeight: 700, transition: 'transform 0.18s ease', transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}>+</div>
      </button>
      {open && (
        <div style={{ marginTop: 12 }}>
          <BSWidgetPicker added={added} onAdd={onAdd} />
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// TRAIN — workout-focused page
// ═══════════════════════════════════════════════════════════
function BSClientTrain({ onProfile }) {
  const t = useBS();
  const [day, setDay] = useStateBSC(4);
  const [session, setSession] = useStateBSC(false);
  const [previewing, setPreviewing] = useStateBSC(false);

  // ── Per-day program (Apr 17–23, 2026) ──
  const PROGRAM = [
    {
      d: 'M 17',
      kicker: 'The Training',
      title: <>Lower<br/>push.</>,
      tag: 'FEATURE',
      tagColor: t.AMBER,
      accent: t.RUST,
      headline: <>Lower Push —<br/>Volume.</>,
      meta: '58 min · RPE 7',
      copy: 'Pre-peak quad work. Hold the down-phase honest, drive vertical out of the bottom. Last set is the only set that hurts.',
      moves: [
        { n: '01', m: 'Back squat',       s: '5 × 6 · 3:00',     l: '205 LB' },
        { n: '02', m: 'Walking lunge',    s: '4 × 16 · 1:30',    l: '40 LB'  },
        { n: '03', m: 'Hack squat',       s: '3 × 10 · 1:30',    l: '160 LB' },
        { n: '04', m: 'Leg ext.',         s: '3 × 12 · 1:00',    l: '110 LB' },
        { n: '05', m: 'Standing calf',    s: '4 × 12 · 1:00',    l: '180 LB' },
      ],
      total: '5 moves · 1820 lb',
      coachLine: 'Pause one beat at the bottom of every squat. No bouncing — drive the floor away.',
    },
    {
      d: 'T 18',
      kicker: 'The Training',
      title: <>Upper<br/>push.</>,
      tag: 'FEATURE',
      tagColor: t.AMBER,
      accent: t.AMBER,
      headline: <>Upper Push —<br/>Volume.</>,
      meta: '52 min · RPE 7',
      copy: 'Press for reps, fly for stretch. Two extra sets on triceps to bias the lockout you keep losing on the bench.',
      moves: [
        { n: '01', m: 'Bench press',      s: '4 × 8 · 2:30',     l: '155 LB' },
        { n: '02', m: 'Overhead press',   s: '4 × 8 · 2:00',     l: '95 LB'  },
        { n: '03', m: 'Incline DB press', s: '3 × 10 · 1:30',    l: '55 LB'  },
        { n: '04', m: 'Cable fly',        s: '3 × 12 · 1:00',    l: '30 LB'  },
        { n: '05', m: 'Triceps push',     s: '3 × 12 · 0:45',    l: '60 LB'  },
      ],
      total: '5 moves · 1640 lb',
      coachLine: 'On the bench, set the back, set the feet, then breathe. Press is the third action, not the first.',
    },
    {
      d: 'W 19',
      kicker: 'The Recovery',
      title: <>Active<br/>recovery.</>,
      tag: 'REST',
      tagColor: t.GREEN,
      accent: t.GREEN,
      headline: <>Mobility &amp;<br/>walk.</>,
      meta: '40 min · RPE 3',
      copy: 'Joints over loads. Walk the easy 30, then 10 minutes on the floor: hips, t-spine, ankles. Tomorrow needs the recovery, today gets the work.',
      moves: [
        { n: '01', m: 'Easy walk',           s: '30:00 · zone 2', l: '—' },
        { n: '02', m: '90/90 hip rotation',  s: '3 × 8/side',     l: '—' },
        { n: '03', m: 'Cat-cow',             s: '3 × 10',         l: '—' },
        { n: '04', m: 'Couch stretch',       s: '2 × 60s/side',   l: '—' },
        { n: '05', m: 'Ankle dorsiflexion',  s: '3 × 10/side',    l: '—' },
      ],
      total: '5 movements · low load',
      coachLine: 'Recovery is training. Don\'t skip the boring part — the boring part is what compounds.',
    },
    {
      d: 'T 20',
      kicker: 'The Training',
      title: <>Lower<br/>pull.</>,
      tag: 'FEATURE',
      tagColor: t.AMBER,
      accent: t.RUST,
      headline: <>Lower Pull —<br/>Peak.</>,
      meta: '54 min · RPE 8',
      copy: 'Hinges over heels, hamstrings under tension the whole way. Bar speed off the floor decides the rep — never the load.',
      moves: [
        { n: '01', m: 'Deadlift',         s: '4 × 5 · 3:00',     l: '275 LB' },
        { n: '02', m: 'Romanian DL',      s: '4 × 8 · 2:00',     l: '185 LB' },
        { n: '03', m: 'Hip thrust',       s: '3 × 10 · 1:30',    l: '225 LB' },
        { n: '04', m: 'Leg curl',         s: '3 × 12 · 1:00',    l: '90 LB'  },
        { n: '05', m: 'Reverse hyper',    s: '3 × 15 · 1:00',    l: '70 LB'  },
      ],
      total: '5 moves · 2150 lb',
      coachLine: 'Hinges, not squats. Push the floor back with your heels. The bar should drag your shins.',
    },
    {
      d: 'F 21',
      kicker: 'The Training',
      title: <>Pull day.<br/>Peak week.</>,
      tag: 'FEATURE',
      tagColor: t.AMBER,
      accent: t.BLUE,
      headline: <>Upper Pull —<br/>Peak.</>,
      meta: '52 min · RPE 8',
      copy: 'Three weeks of intent has bought one chance to test. 6 moves. 3-second eccentrics on every pull. Bar speed, not load, decides the rep.',
      moves: [
        { n: '01', m: 'Pull-up',          s: '4 × 6–8 · 3:00',   l: '+42 LB'  },
        { n: '02', m: 'Barbell row',      s: '4 × 8 · 2:00',     l: '155 LB'  },
        { n: '03', m: 'Chest-sup. row',   s: '3 × 10 · 1:30',    l: '60 LB'   },
        { n: '04', m: 'Face pull',        s: '3 × 15 · 1:00',    l: '35 LB'   },
        { n: '05', m: 'Incline curl',     s: '3 × 12 · 1:00',    l: '27.5 LB' },
        { n: '06', m: 'Farmer carry',     s: '3 × 40 m · 1:00',  l: '80 LB'   },
      ],
      total: '6 moves · 1900 lb',
      coachLine: 'Dead hang every pull-up. Chest to bar or it doesn\'t count. If bar speed drops on row, drop a rep — never the tempo.',
    },
    {
      d: 'S 22',
      kicker: 'The Conditioning',
      title: <>Conditioning.</>,
      tag: 'COND',
      tagColor: t.RUST,
      accent: t.RUST,
      headline: <>Threshold<br/>intervals.</>,
      meta: '45 min · RPE 8',
      copy: '5 × 4-min hard, 2-min easy. Rower, bike, or run — pick one and stay on it. Hard means you can\'t finish a sentence; easy means you can.',
      moves: [
        { n: '01', m: 'Warm-up',          s: '10:00 · zone 2',   l: '—'    },
        { n: '02', m: 'Threshold rep',    s: '5 × 4:00',         l: 'RPE 8' },
        { n: '03', m: 'Recovery jog',     s: '5 × 2:00',         l: 'RPE 4' },
        { n: '04', m: 'Cool-down',        s: '5:00',             l: '—'    },
      ],
      total: '4 segments · 45 min',
      coachLine: 'On the hard pieces, you should hate every fourth minute. If you don\'t, the pace was too easy.',
    },
    {
      d: 'S 23',
      kicker: 'The Recovery',
      title: <>Rest<br/>day.</>,
      tag: 'REST',
      tagColor: t.GREEN,
      accent: t.GREEN,
      headline: <>Full rest.</>,
      meta: 'No session · 0 min',
      copy: 'No training, no logging, no Strava. Walk the dog, eat well, sleep. Monday\'s squat is built today.',
      moves: [],
      total: '0 sessions',
      coachLine: 'A skipped rest day is a skipped peak. Take it.',
    },
  ];

  const cur = PROGRAM[day];
  const days = PROGRAM.map(p => p.d);

  if (session) return <BSSession moves={cur.moves.map(m => ({ ...m, sets: 4, reps: '6-8' }))} onBack={() => setSession(false)} />;
  if (previewing) return <BSWorkoutPreview program={cur} onBack={() => setPreviewing(false)} onStart={() => { setPreviewing(false); setSession(true); }} />;

  return (
    <BSPage>
      <BSPageHeader
        kicker={cur.kicker}
        title={cur.title}
        trailing={<BSAvatar init="A" size={32} onClick={onProfile} />}
      />

      {/* Day strip — like sports schedule */}
      <div style={{ padding: `12px ${t.padX}px 18px`, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderBottom: `1px solid ${t.RULE}` }}>
        {days.map((d, i) => {
          const on = i === day;
          const isRest = PROGRAM[i].tag === 'REST';
          return (
            <button key={i} onClick={() => setDay(i)} style={{ borderRadius: t.RADIUS_SM,
              border: `1px solid ${on ? t.INK : t.HAIR}`,
              background: on ? t.INK : 'transparent',
              color: on ? t.PAPER : t.INK,
              padding: '10px 0', cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              position: 'relative',
            }}>
              {d}
              {isRest && (
                <span style={{
                  position: 'absolute', top: 3, right: 4,
                  width: 4, height: 4, borderRadius: 2,
                  background: on ? t.PAPER : t.GREEN, opacity: on ? 0.7 : 1,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Halftone hero — accent recolors per day */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: t.RADIUS_SM, overflow: 'hidden', border: `1px solid ${t.INK}` }}>
          <BSHalftone height={170} accent={cur.accent} pattern="dots" />
        </div>
      </div>

      {/* Headline workout */}
      <div style={{ borderRadius: t.RADIUS_SM, margin: `18px ${t.padX}px 0`, padding: 18, border: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <BSTag color={cur.tagColor}>{cur.tag}</BSTag>
          <BSEyebrow color={t.ACCENT}>{cur.meta}</BSEyebrow>
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: t.headlineLead + 4, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK, marginTop: 10 }}>
          {cur.headline}
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: t.body, color: t.INK70, lineHeight: 1.4, letterSpacing: '-0.005em' }}>
          {cur.copy}
        </div>
        {cur.moves.length > 0 ? (
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            <button onClick={() => setSession(true)} style={{ borderRadius: t.RADIUS_SM,
              flex: 1, padding: '14px', border: 0, background: t.INK, color: t.PAPER,
              fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
            }}>Start session →</button>
            <button onClick={() => setPreviewing(true)} style={{ borderRadius: t.RADIUS_SM,
              padding: '14px 18px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
              fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
            }}>Preview</button>
          </div>
        ) : (
          <div style={{ marginTop: 14, padding: '14px', border: `1px solid ${t.INK}`, textAlign: 'center',
            fontFamily: t.MONO, fontSize: 11, color: t.INK, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
          }}>✓ Take the day</div>
        )}
      </div>

      {/* MOVES — broadsheet table (only when there are moves) */}
      {cur.moves.length > 0 && (
        <>
          <BSSection title="The card" meta={cur.total} />
          <div style={{ padding: `0 ${t.padX}px` }}>
            <div style={{
              display: 'grid', gridTemplateColumns: '24px 1fr 70px',
              padding: '6px 0', borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}`,
              fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50,
            }}>
              <span>#</span><span>Move · Sets / Reps</span><span style={{ textAlign: 'right' }}>Load</span>
            </div>
            {cur.moves.map((r, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '24px 1fr 70px', alignItems: 'center', padding: `${t.rowY}px 0`,
                borderBottom: i === cur.moves.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600 }}>{r.n}</span>
                <div>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em' }}>{r.m}</div>
                  <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 2, letterSpacing: '0.06em' }}>{r.s}</div>
                </div>
                <div style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 12, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em' }}>{r.l}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Coach notes — pull quote */}
      <div style={{ borderRadius: t.RADIUS_SM, margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Notes from Jordan
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {cur.coachLine}
        </div>
      </div>

      {/* RECENT SESSIONS — index */}
      <BSSection title="Recent" meta="Last 4 sessions" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { d: 'Mon Apr 20', m: 'Lower Pull — Peak',  v: '54 min · 5 moves · RPE 8' },
          { d: 'Sat Apr 18', m: 'Conditioning',       v: '45 min · threshold · RPE 8' },
          { d: 'Thu Apr 16', m: 'Upper Pull — Vol.',  v: '54 min · 6 moves · RPE 7' },
          { d: 'Tue Apr 14', m: 'Lower Push — Vol.',  v: '50 min · 5 moves · RPE 7' },
        ].map((r, i, arr) => (
          <div key={i} style={{ padding: `${t.rowY}px 0`, borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.m}</div>
              <BSEyebrow>{r.d}</BSEyebrow>
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em' }}>{r.v}</div>
          </div>
        ))}
      </div>

      <BSFooter right="Pg 2 of 5" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// MEAL PREVIEW — recipe-style breakdown of a single meal
// ═══════════════════════════════════════════════════════════
// Reset BSPage scroll to 0 whenever a preview mounts. Sticky headers behave
// fine when the scroller starts at top; the bug is that BSPage retains
// scrollTop from the previous render tree branch in some browsers, leaving
// the preview opening "halfway down" with no way to drag back up.
function _bsScrollTopOnMount() {
  React.useLayoutEffect(() => {
    const el = document.querySelector('.bs-scroll');
    if (el) el.scrollTop = 0;
  }, []);
}

function BSMealPreview({ meal, onBack }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const [logged, setLogged] = useStateBSC(meal.state === 'done');

  // Macro % of total kcal — visual bar split
  const totalCal = (meal.p || 0) * 4 + (meal.c || 0) * 4 + (meal.f || 0) * 9 || 1;
  const pPct = Math.round(((meal.p || 0) * 4 / totalCal) * 100);
  const cPct = Math.round(((meal.c || 0) * 4 / totalCal) * 100);
  const fPct = 100 - pPct - cPct;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`${meal.time} · ${meal.tag}`}
        title={meal.title}
      />

      {/* Hero halftone */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSHalftone height={150} accent={meal.tagColor} pattern="dots" />
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`,
        borderTop: `2px solid ${t.INK}`, marginTop: 18,
      }}>
        {[
          { l: 'KCAL',    v: String(meal.kcal) },
          { l: 'PROTEIN', v: meal.p + 'g' },
          { l: 'CARBS',   v: meal.c + 'g' },
          { l: 'FAT',     v: meal.f + 'g' },
        ].map((s, i) => (
          <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, color: t.INK, marginTop: 4, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Macro split bar */}
      <div style={{ padding: `14px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Macro split · % of kcal</div>
        <div style={{ display: 'flex', height: 14, border: `1px solid ${t.INK}` }}>
          <div style={{ width: `${pPct}%`, background: t.GREEN }} />
          <div style={{ width: `${cPct}%`, background: t.AMBER }} />
          <div style={{ width: `${fPct}%`, background: t.RUST }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.INK70, fontWeight: 600 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.GREEN, marginRight: 5 }} />P {pPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.AMBER, marginRight: 5 }} />C {cPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.RUST,  marginRight: 5 }} />F {fPct}%</span>
        </div>
      </div>

      {/* Quick facts */}
      <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, display: 'flex', gap: 18, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.1em', color: t.INK70, fontWeight: 600 }}>
        <span>⏱ {meal.prep}</span>
        <span>· {meal.portion}</span>
        <span>· Score <span style={{ color: t.AMBER, fontWeight: 700 }}>{meal.score}</span></span>
      </div>

      {/* The brief */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>The dish</BSEyebrow>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.4, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>
          {meal.hero}
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>
          {meal.brief}
        </div>
      </div>

      {/* Ingredients */}
      <BSSection title="Ingredients" meta={`${meal.ingredients.length} items`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {meal.ingredients.map((ing, i) => (
            <div key={i} style={{
              padding: '12px 0', borderBottom: i === meal.ingredients.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', alignItems: 'baseline', gap: 12,
            }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, fontWeight: 700, width: 56, letterSpacing: '0.04em' }}>{ing.n}</span>
              <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>{ing.m}</div>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>{ing.k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Method */}
      <BSSection title="Method" meta={`${meal.steps.length} steps`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {meal.steps.map((s, i) => (
            <div key={i} style={{
              padding: '14px 0', borderBottom: i === meal.steps.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: meal.tagColor, color: t.PAPER,
                fontFamily: t.MONO, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.4, color: t.INK85 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Coach note */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 18, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 10, fontWeight: 700 }}>
          ▍ Note from Rae · Nutrition
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 16, lineHeight: 1.4, letterSpacing: '-0.01em' }}>
          {meal.coachNote}
        </div>
      </div>

      {/* CTA row */}
      <div style={{ padding: `22px ${t.padX}px 18px`, display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          padding: '14px 18px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Close</button>
        <button onClick={() => setLogged(l => !l)} style={{ borderRadius: t.RADIUS_SM,
          flex: 1, padding: '14px', border: 0,
          background: logged ? t.GREEN : t.INK, color: t.PAPER,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>{logged ? '✓ Logged' : 'Log this meal →'}</button>
      </div>

      <BSFooter right="Recipe" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// RECIPE PREVIEW — for "Recipe of the day" card (full recipe view)
// ═══════════════════════════════════════════════════════════
function BSRecipePreview({ recipe, dayLabel, onBack }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const [saved, setSaved] = useStateBSC(false);
  const r = recipe;

  const totalCal = (r.p || 0) * 4 + (r.c || 0) * 4 + (r.f || 0) * 9 || 1;
  const pPct = Math.round(((r.p || 0) * 4 / totalCal) * 100);
  const cPct = Math.round(((r.c || 0) * 4 / totalCal) * 100);
  const fPct = 100 - pPct - cPct;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`Recipe of the day · ${dayLabel}`}
        title={r.title}
      />

      {/* Hero halftone */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSHalftone height={170} accent={r.accent} pattern="dots" />
      </div>

      {/* Meta strip */}
      <div style={{ padding: `12px ${t.padX}px 0`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.1em', color: t.INK70, fontWeight: 600 }}>
        {r.meta}
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`,
        borderTop: `2px solid ${t.INK}`, marginTop: 18,
      }}>
        {[
          { l: 'KCAL',    v: String(r.kcal) },
          { l: 'PROTEIN', v: r.p + 'g' },
          { l: 'CARBS',   v: r.c + 'g' },
          { l: 'FAT',     v: r.f + 'g' },
        ].map((s, i) => (
          <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, color: t.INK, marginTop: 4, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Macro split bar */}
      <div style={{ padding: `14px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Macro split · % of kcal</div>
        <div style={{ display: 'flex', height: 14, border: `1px solid ${t.INK}` }}>
          <div style={{ width: `${pPct}%`, background: t.GREEN }} />
          <div style={{ width: `${cPct}%`, background: t.AMBER }} />
          <div style={{ width: `${fPct}%`, background: t.RUST }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.INK70, fontWeight: 600 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.GREEN, marginRight: 5 }} />P {pPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.AMBER, marginRight: 5 }} />C {cPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.RUST,  marginRight: 5 }} />F {fPct}%</span>
        </div>
      </div>

      {/* Quick facts */}
      <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, display: 'flex', gap: 18, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.1em', color: t.INK70, fontWeight: 600 }}>
        <span>⏱ {r.prep}</span>
        <span>· {r.portion}</span>
        <span>· Score <span style={{ color: t.AMBER, fontWeight: 700 }}>{r.score}</span></span>
      </div>

      {/* Brief */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>The dish</BSEyebrow>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.4, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>
          {r.hero}
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>
          {r.brief}
        </div>
      </div>

      {/* Ingredients */}
      <BSSection title="Ingredients" meta={`${r.ingredients.length} items`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {r.ingredients.map((ing, i) => (
            <div key={i} style={{
              padding: '12px 0', borderBottom: i === r.ingredients.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', alignItems: 'baseline', gap: 12,
            }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, fontWeight: 700, width: 56, letterSpacing: '0.04em' }}>{ing.n}</span>
              <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>{ing.m}</div>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>{ing.k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Method */}
      <BSSection title="Method" meta={`${r.steps.length} steps`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {r.steps.map((s, i) => (
            <div key={i} style={{
              padding: '14px 0', borderBottom: i === r.steps.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: r.accent, color: t.PAPER,
                fontFamily: t.MONO, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.4, color: t.INK85 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Coach note */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 18, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 10, fontWeight: 700 }}>
          ▍ Note from Rae · Nutrition
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 16, lineHeight: 1.4, letterSpacing: '-0.01em' }}>
          {r.coachNote}
        </div>
      </div>

      {/* CTA row */}
      <div style={{ padding: `22px ${t.padX}px 18px`, display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          padding: '14px 18px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Close</button>
        <button onClick={() => setSaved(s => !s)} style={{ borderRadius: t.RADIUS_SM,
          flex: 1, padding: '14px', border: 0,
          background: saved ? t.GREEN : t.INK, color: t.PAPER,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>{saved ? '✓ Saved to library' : 'Save recipe →'}</button>
      </div>

      <BSFooter right="Recipe" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// DAY BRIEF PREVIEW — tap the headline block to read the full day plan
// ═══════════════════════════════════════════════════════════
function BSDayBriefPreview({ day, onBack, onMealClick, onRecipeClick }) {
  const t = useBS();
  _bsScrollTopOnMount();

  const targetCal = Number(day.totals.target.cal);
  const actualCal = Number(day.totals.cal);
  const calPct = Math.min(100, Math.round((actualCal / targetCal) * 100));
  const loggedCount = day.meals.filter(m => m.state === 'done').length;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`Day brief · ${day.d}`}
        title={day.headline}
      />

      {/* Hero */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSHalftone height={170} accent={day.accent} pattern="dots" />
      </div>

      {/* Tag + meta strip */}
      <div style={{ padding: `16px ${t.padX}px 0`, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <BSTag color={day.tagColor}>{day.tag}</BSTag>
        <BSEyebrow color={t.ACCENT}>{day.meta}</BSEyebrow>
      </div>

      {/* The brief */}
      <div style={{ padding: `12px ${t.padX}px 18px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.45, color: t.INK, fontWeight: 500, letterSpacing: '-0.005em' }}>
          {day.copy}
        </div>
      </div>

      {/* Calorie progress */}
      <div style={{ padding: `18px ${t.padX}px`, borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', fontWeight: 700 }}>Calories logged</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 36, color: t.INK, marginTop: 4, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {actualCal.toLocaleString()}<span style={{ fontFamily: t.MONO, fontSize: 14, color: t.INK50, fontWeight: 600, marginLeft: 6, letterSpacing: '0.04em' }}>/ {targetCal.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ fontFamily: t.MONO, fontSize: 11, color: day.accent, fontWeight: 700, letterSpacing: '0.1em' }}>{calPct}%</div>
        </div>
        <div style={{ height: 8, background: t.HAIR, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${calPct}%`, background: day.accent }} />
        </div>
      </div>

      {/* Macro grid */}
      <div style={{
        padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      }}>
        {[
          { l: 'PROTEIN',  v: day.totals.p, s: `/ ${day.totals.target.p}g`, c: t.GREEN },
          { l: 'CARBS',    v: day.totals.c, s: `/ ${day.totals.target.c}g`, c: t.AMBER },
          { l: 'FAT',      v: day.totals.f, s: `/ ${day.totals.target.f}g`, c: t.RUST  },
        ].map((m, i) => (
          <div key={m.l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: m.c }} />
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', fontWeight: 700 }}>{m.l}</span>
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 24, color: t.INK, marginTop: 6, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.v}<span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600, marginLeft: 2 }}>g</span></div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 3, letterSpacing: '0.06em' }}>{m.s}</div>
          </div>
        ))}
      </div>

      {/* Schedule of meals */}
      <BSSection title="The day's plan" meta={`${day.meals.length} services · ${loggedCount} logged`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {day.meals.map((m, i) => (
            <div key={m.id} onClick={() => onMealClick && onMealClick(m.id)} style={{
              padding: '14px 0', borderBottom: i === day.meals.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', alignItems: 'baseline', gap: 12, cursor: 'pointer',
            }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, fontWeight: 700, letterSpacing: '0.06em', width: 44, fontVariantNumeric: 'tabular-nums' }}>{m.time}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <BSTag color={m.tagColor}>{m.tag}</BSTag>
                  {m.state === 'done' && <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.GREEN, fontWeight: 700, letterSpacing: '0.16em' }}>✓ LOGGED</span>}
                  {m.state === 'next' && <span style={{ fontFamily: t.MONO, fontSize: 9, color: day.accent, fontWeight: 700, letterSpacing: '0.16em' }}>NEXT UP</span>}
                </div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{m.title}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 4, letterSpacing: '0.06em' }}>{m.kcal} kcal · {m.p}P · {m.c}C · {m.f}F</div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 14, color: t.INK50 }}>›</span>
            </div>
          ))}
        </div>
      </div>

      {/* Coach note */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Notes from Maya
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {day.coachLine}
        </div>
      </div>

      {/* Recipe of the day inline */}
      {day.recipe && (
        <div onClick={onRecipeClick} style={{ margin: `22px ${t.padX}px 0`, border: `1px solid ${t.INK}`, cursor: 'pointer' }}>
          <BSHalftone height={120} accent={day.accent} pattern="dots" />
          <div style={{ padding: 16, borderTop: `1px solid ${t.INK}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <BSEyebrow color={t.ACCENT}>Recipe of the day</BSEyebrow>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, lineHeight: 1, letterSpacing: '-0.025em', color: t.INK, marginTop: 8 }}>
                {day.recipeName}
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK70, marginTop: 6, letterSpacing: '0.08em' }}>
                {day.recipeMeta}
              </div>
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.ACCENT, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Read →</div>
          </div>
        </div>
      )}

      {/* Back CTA */}
      <div style={{ padding: `22px ${t.padX}px 18px` }}>
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          width: '100%', padding: '14px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>← Back to menu</button>
      </div>

      <BSFooter right="Day brief" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
function BSClientEat({ onProfile }) {
  const t = useBS();
  const [view, setView] = useStateBSC('eat'); // 'eat' | 'grocery' | 'library'
  const [previewMealId, setPreviewMealId] = useStateBSC(null);
  const [previewRecipe, setPreviewRecipe] = useStateBSC(false);
  const [previewDayBrief, setPreviewDayBrief] = useStateBSC(false);
  const [day, setDay] = useStateBSC(4); // 0..6 — Fri (idx 4) = today, mirrors Train

  // ── Compact builder for non-anchor days. Generates a full BSMealPreview-shaped record.
  const mk = ({ id, time, tag, tagColor, title, kcal, p, c, f, state, last, hero, brief, ingredients, steps, coachNote, prep = '10 min', portion = '1 plate', score = 'A' }) => ({
    id, time, tag, tagColor, title,
    sub: `${kcal} kcal · ${p}P · ${c}C · ${f}F`,
    state, last,
    kcal, p, c, f, prep, portion, score,
    hero, brief, ingredients, steps, coachNote,
  });

  // ── 7-day menu program (Apr 17–23, 2026 — same week as Train)
  const PROGRAM = [
    {
      d: 'M 17',
      kicker: 'Section · Nutrition',
      title: <>Loading<br/>day.</>,
      tag: 'PEAK',
      tagColor: t.RUST,
      accent: t.RUST,
      headline: <>Big plate.<br/>Big day.</>,
      meta: '4 services · 2150 kcal',
      copy: 'Lower-push day. Carbs do the heavy lifting — fuel the squat, refill before bed. The bowl is non-negotiable.',
      totals: { cal: '2148', p: '162', c: '252', f: '64', target: { cal: '2200', p: '165', c: '260', f: '70' } },
      recipeName: <>Sweet potato<br/>chili.</>,
      recipeMeta: '6 ingredients · 35 min · Batch x4',
      recipe: {
        title: <>Sweet potato<br/>chili.</>,
        meta: '6 ingredients · 35 min · Batch x4',
        accent: t.RUST,
        kcal: 480, p: 32, c: 58, f: 14, prep: '35 min', portion: '1 bowl', score: 'A',
        hero: 'Lean ground beef, black beans, sweet potato, fire-roasted tomatoes, smoked paprika.',
        brief: 'A batch-cook chili built for heavy training weeks. Sweet potato replaces the usual cornbread carbs — sweeter, denser, kinder to the gut. Make a quadruple batch on Sunday and you eat for three days.',
        ingredients: [
          { n: '500 g', m: 'Lean ground beef 90/10', k: '900 kcal' },
          { n: '400 g', m: 'Sweet potato (cubed)',   k: '345 kcal' },
          { n: '400 g', m: 'Black beans (canned)',   k: '420 kcal' },
          { n: '400 g', m: 'Fire-roasted tomatoes',  k: '120 kcal' },
          { n: '1 tbsp',m: 'Smoked paprika',         k: '0 kcal' },
          { n: '1',     m: 'Yellow onion (diced)',   k: '40 kcal' },
        ],
        steps: [
          'Sauté onion in heavy pot with 1 tbsp oil, 4 min until translucent.',
          'Add beef, break apart, brown 6–8 min until no pink.',
          'Stir in paprika + cumin + 1 tsp salt, toast 30 sec.',
          'Add sweet potato, beans, tomatoes + 200 ml water. Simmer covered 25 min.',
          'Uncover last 5 min to thicken. Taste, season, finish with lime.',
        ],
        coachNote: 'Cook the full batch and divide into 4 containers. The flavor is better on day two — that\'s when you\'ll need it most.',
      },
      coachLine: 'Heavy day means heavy plate. If the squat felt slow, the lunch was small.',
      meals: [
        mk({ id: 'm17-bf', time: '07:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Banana oats + peanut butter', kcal: 520, p: 28, c: 78, f: 14, state: 'done',
          hero: 'Rolled oats, banana, peanut butter, milk, cinnamon.',
          brief: 'Carb-forward opener. Dense fuel for the heaviest lift of the week.',
          ingredients: [
            { n: '70 g',  m: 'Rolled oats',     k: '260 kcal' },
            { n: '1',     m: 'Banana',          k: '105 kcal' },
            { n: '20 g',  m: 'Peanut butter',   k: '120 kcal' },
            { n: '200ml', m: 'Whole milk',      k: '125 kcal' },
            { n: 'pinch', m: 'Cinnamon',        k: '0 kcal' },
          ],
          steps: ['Cook oats in milk + 100 ml water, simmer 5 min.', 'Slice banana on top.', 'Stir peanut butter through, dust cinnamon.'],
          coachNote: '70g of oats sounds like a lot. It is. Eat it all.',
        }),
        mk({ id: 'm17-ln', time: '12:30', tag: 'LUNCH', tagColor: t.AMBER, title: 'Beef + sweet potato bowl', kcal: 720, p: 52, c: 88, f: 18, state: 'done',
          hero: 'Lean ground beef, roast sweet potato, black beans, salsa, avocado.',
          brief: 'The squat-day plate. Iron + carbs + cheap-thrill flavor.',
          ingredients: [
            { n: '180 g', m: 'Lean beef 90/10', k: '320 kcal' },
            { n: '250 g', m: 'Sweet potato',    k: '215 kcal' },
            { n: '120 g', m: 'Black beans',     k: '130 kcal' },
            { n: '40 g',  m: 'Salsa',           k: '15 kcal' },
            { n: '40 g',  m: 'Avocado',         k: '60 kcal' },
          ],
          steps: ['Roast sweet potato cubes 25 min @ 220°C.', 'Brown beef with cumin + paprika, 6 min.', 'Warm beans on stovetop.', 'Plate it all, salsa + avocado last.'],
          coachNote: 'Don\'t skip the avocado — fat softens the iron absorption hit on heavy days.',
        }),
        mk({ id: 'm17-sn', time: '16:00', tag: 'SNACK', tagColor: t.BLUE, title: 'Cottage cheese + pineapple', kcal: 240, p: 26, c: 26, f: 4,
          hero: 'Low-fat cottage cheese, fresh pineapple chunks, mint.',
          brief: 'Bridge protein with fast carbs to top off glycogen pre-session.',
          ingredients: [
            { n: '200 g', m: 'Cottage cheese',  k: '160 kcal' },
            { n: '100 g', m: 'Pineapple',       k: '50 kcal' },
            { n: '4',     m: 'Mint leaves',     k: '0 kcal' },
          ],
          steps: ['Spoon cottage cheese in bowl.', 'Top with pineapple.', 'Garnish mint.'],
          coachNote: 'Pineapple bromelain helps protein breakdown. Bonus, not magic.',
        }),
        mk({ id: 'm17-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Chili + rice', kcal: 680, p: 44, c: 84, f: 16, last: true,
          hero: 'Beef-and-bean chili over jasmine rice, sour cream, scallion.',
          brief: 'Refill day. Eat slow, sleep early — Tuesday\'s push is built tonight.',
          ingredients: [
            { n: '300 g', m: 'Chili (batch)',   k: '420 kcal' },
            { n: '180 g', m: 'Cooked rice',     k: '230 kcal' },
            { n: '20 g',  m: 'Sour cream',      k: '40 kcal' },
            { n: '10 g',  m: 'Scallion',        k: '5 kcal' },
          ],
          steps: ['Reheat chili 8 min on stovetop.', 'Plate rice, ladle chili, dollop sour cream, scatter scallion.'],
          coachNote: 'Bowls of chili are designed to be batched. Make x4 on Sunday.',
        }),
      ],
    },
    {
      d: 'T 18',
      kicker: 'Section · Nutrition',
      title: <>Push<br/>fuel.</>,
      tag: 'TRAIN',
      tagColor: t.AMBER,
      accent: t.AMBER,
      headline: <>Lighter<br/>plate.</>,
      meta: '5 services · 1950 kcal',
      copy: 'Upper-push day. Slightly leaner — the press doesn\'t need 80g of oats. Hit protein, drop volume.',
      totals: { cal: '1948', p: '168', c: '198', f: '60', target: { cal: '2000', p: '165', c: '210', f: '64' } },
      recipeName: <>Smashed<br/>chickpea wrap.</>,
      recipeMeta: '5 ingredients · 8 min · Lunch hack',
      recipe: {
        title: <>Smashed<br/>chickpea wrap.</>,
        meta: '5 ingredients · 8 min · Lunch hack',
        accent: t.AMBER,
        kcal: 420, p: 22, c: 48, f: 16, prep: '8 min', portion: '1 wrap', score: 'A-',
        hero: 'Smashed chickpeas, lemon-tahini, baby spinach, red onion, whole-wheat wrap.',
        brief: 'A vegetarian lunch that lands closer to a deli sandwich than a salad. Dense, savory, no cooking required — it lives in your fridge for two days and travels well in a backpack.',
        ingredients: [
          { n: '200 g', m: 'Chickpeas (canned)',     k: '280 kcal' },
          { n: '20 g',  m: 'Tahini',                 k: '120 kcal' },
          { n: '½',     m: 'Lemon (juiced)',         k: '5 kcal' },
          { n: '40 g',  m: 'Baby spinach',           k: '10 kcal' },
          { n: '1',     m: 'Whole-wheat wrap',       k: '170 kcal' },
        ],
        steps: [
          'Drain chickpeas, smash roughly with a fork — leave half whole for texture.',
          'Stir in tahini, lemon juice, salt + pepper + a pinch of cumin.',
          'Lay wrap flat. Spinach down the center, smashed chickpea on top.',
          'Add thinly sliced red onion. Roll tight, slice on the bias.',
        ],
        coachNote: 'Press days don\'t need 700-kcal lunches. This one keeps you light without leaving you hungry by 3pm.',
      },
      coachLine: 'Press days reward leanness. Save the carb load for Friday\'s peak.',
      meals: [
        mk({ id: 't18-bf', time: '07:20', tag: 'BFAST', tagColor: t.GREEN, title: 'Egg-white scramble + toast', kcal: 380, p: 38, c: 36, f: 8, state: 'done',
          hero: 'Egg whites + 1 whole egg, sourdough toast, avocado smear.',
          brief: 'Lean opener. Lots of protein, modest carbs.',
          ingredients: [
            { n: '200 g', m: 'Egg whites',      k: '100 kcal' },
            { n: '1',     m: 'Whole egg',       k: '70 kcal' },
            { n: '60 g',  m: 'Sourdough',       k: '160 kcal' },
            { n: '20 g',  m: 'Avocado',         k: '30 kcal' },
            { n: 'pinch', m: 'Chili flake',     k: '0 kcal' },
          ],
          steps: ['Whisk eggs with salt. Cook low + slow, 4 min.', 'Toast bread, smear avocado.', 'Top toast with eggs, dust chili.'],
          coachNote: 'Cook eggs slow — high heat ruins the texture and the protein bind.',
        }),
        mk({ id: 't18-sn1', time: '10:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Apple + almond butter', kcal: 220, p: 6, c: 28, f: 11,
          hero: 'Crisp apple, 15g almond butter.',
          brief: 'Fiber + fat snack. Steady through to lunch.',
          ingredients: [
            { n: '1',    m: 'Apple',            k: '95 kcal' },
            { n: '15 g', m: 'Almond butter',    k: '90 kcal' },
          ],
          steps: ['Slice apple.', 'Dip.'],
          coachNote: 'Granny Smith holds up best to almond butter. Sweet apples get cloying.',
        }),
        mk({ id: 't18-ln', time: '12:30', tag: 'LUNCH', tagColor: t.AMBER, title: 'Smashed chickpea wrap', kcal: 540, p: 32, c: 64, f: 18, state: 'next',
          hero: 'Smashed chickpeas, tahini, cucumber, tomato, whole-wheat wrap.',
          brief: 'Plant-protein lunch. Easy on digestion before afternoon meetings.',
          ingredients: [
            { n: '180 g', m: 'Chickpeas',       k: '270 kcal' },
            { n: '15 g',  m: 'Tahini',          k: '95 kcal' },
            { n: '60 g',  m: 'Cucumber',        k: '10 kcal' },
            { n: '60 g',  m: 'Tomato',          k: '12 kcal' },
            { n: '1',     m: 'WW tortilla',     k: '150 kcal' },
          ],
          steps: ['Smash chickpeas with fork + tahini + lemon.', 'Slice cucumber, tomato.', 'Layer in wrap, roll tight.'],
          coachNote: 'Chickpea fiber is your friend on lower-volume days. Bonus point: cheaper than chicken.',
        }),
        mk({ id: 't18-sn2', time: '15:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Whey + berries', kcal: 200, p: 32, c: 14, f: 2,
          hero: '30g whey, 100g frozen berries, 200ml water.',
          brief: 'Pre-session protein bridge.',
          ingredients: [
            { n: '30 g',  m: 'Whey',            k: '120 kcal' },
            { n: '100 g', m: 'Frozen berries',  k: '50 kcal' },
            { n: '200ml', m: 'Cold water',      k: '0 kcal' },
          ],
          steps: ['Blend everything 30 sec.', 'Drink immediately.'],
          coachNote: 'Frozen berries thicken the shake without bloat. Better than ice.',
        }),
        mk({ id: 't18-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Cod, rice, broccoli', kcal: 540, p: 48, c: 56, f: 14, last: true,
          hero: 'Pan-seared cod, jasmine rice, steamed broccoli, lemon.',
          brief: 'Clean-tasting recovery plate. Protein-forward, low fat.',
          ingredients: [
            { n: '180 g', m: 'Cod fillet',      k: '160 kcal' },
            { n: '160 g', m: 'Cooked rice',     k: '210 kcal' },
            { n: '150 g', m: 'Broccoli',        k: '50 kcal' },
            { n: '½',     m: 'Lemon',           k: '5 kcal' },
            { n: '5 g',   m: 'Butter',          k: '40 kcal' },
          ],
          steps: ['Pat cod dry, salt + pepper. Sear 3 min/side.', 'Steam broccoli 4 min.', 'Plate rice, fish, broccoli. Lemon last.'],
          coachNote: 'Cod is forgiving. Fillet thickness matters more than timing — go by feel.',
        }),
      ],
    },
    {
      d: 'W 19',
      kicker: 'Section · Nutrition',
      title: <>Reset<br/>plate.</>,
      tag: 'RECOV',
      tagColor: t.GREEN,
      accent: t.GREEN,
      headline: <>Slow food.<br/>Slow day.</>,
      meta: '4 services · 1750 kcal',
      copy: 'Recovery day. Cooked vegetables, simple proteins, fewer macros to chase. Eat slow, hydrate, sleep more.',
      totals: { cal: '1748', p: '142', c: '178', f: '58', target: { cal: '1800', p: '140', c: '180', f: '60' } },
      recipeName: <>Roast veg<br/>+ feta plate.</>,
      recipeMeta: '4 ingredients · 30 min · Sheet pan',
      recipe: {
        title: <>Roast veg<br/>+ feta plate.</>,
        meta: '4 ingredients · 30 min · Sheet pan',
        accent: t.GREEN,
        kcal: 380, p: 18, c: 32, f: 22, prep: '30 min', portion: '1 plate', score: 'A',
        hero: 'Cauliflower, zucchini, red pepper, feta, olive oil, oregano.',
        brief: 'A recovery-day plate that takes one tray, one bowl, and twenty minutes of inattention. The vegetables caramelize while you stretch — feta crumbles on at the end so it warms but doesn\'t melt.',
        ingredients: [
          { n: '300 g', m: 'Cauliflower florets',    k: '75 kcal' },
          { n: '200 g', m: 'Zucchini (chunks)',      k: '35 kcal' },
          { n: '1',     m: 'Red bell pepper',        k: '40 kcal' },
          { n: '80 g',  m: 'Feta',                   k: '230 kcal' },
        ],
        steps: [
          'Heat oven to 220°C / 425°F. Line a sheet pan.',
          'Toss veg with 2 tbsp olive oil, 1 tsp salt, 1 tsp dried oregano.',
          'Spread in a single layer. Roast 25 min, no flipping.',
          'Plate hot. Crumble feta over while still steaming. Crack pepper.',
        ],
        coachNote: 'Sleep day. Don\'t over-engineer dinner. This plate gives you everything you need and nothing extra.',
      },
      coachLine: 'A boring plate is a feature, not a bug. The body does the loud work overnight.',
      meals: [
        mk({ id: 'w19-bf', time: '08:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Yogurt + granola + honey', kcal: 380, p: 24, c: 48, f: 10, state: 'done',
          hero: 'Greek yogurt, oat granola, honey, walnuts.',
          brief: 'Easy opener on a no-train day. No rush.',
          ingredients: [
            { n: '200 g', m: 'Greek yogurt',    k: '180 kcal' },
            { n: '40 g',  m: 'Oat granola',     k: '160 kcal' },
            { n: '1 tsp', m: 'Honey',           k: '20 kcal' },
            { n: '5 g',   m: 'Walnuts',         k: '32 kcal' },
          ],
          steps: ['Spoon yogurt into bowl.', 'Top with granola + walnuts.', 'Drizzle honey.'],
          coachNote: 'Pick a granola without added sugar. Read the label.',
        }),
        mk({ id: 'w19-ln', time: '12:30', tag: 'LUNCH', tagColor: t.AMBER, title: 'Tuna, white bean, lemon', kcal: 480, p: 44, c: 38, f: 16, state: 'done',
          hero: 'Tuna, white beans, parsley, lemon, olive oil, red onion.',
          brief: 'No-cook lunch. Pantry-pull.',
          ingredients: [
            { n: '120 g', m: 'Tuna in water',   k: '130 kcal' },
            { n: '180 g', m: 'White beans',     k: '180 kcal' },
            { n: '15 g',  m: 'Olive oil',       k: '120 kcal' },
            { n: '½',     m: 'Lemon',           k: '5 kcal' },
            { n: '20 g',  m: 'Red onion',       k: '8 kcal' },
          ],
          steps: ['Drain tuna + beans.', 'Toss with olive oil, lemon, parsley, red onion.', 'Salt + pepper to taste.'],
          coachNote: 'Use the good oil here — half the meal is dressing.',
        }),
        mk({ id: 'w19-sn', time: '16:00', tag: 'SNACK', tagColor: t.BLUE, title: 'Skyr + chia', kcal: 180, p: 26, c: 14, f: 4,
          hero: '170 g skyr, 10 g chia, drop of vanilla.',
          brief: 'Slow-protein snack. Sets up dinner.',
          ingredients: [
            { n: '170 g', m: 'Skyr',            k: '120 kcal' },
            { n: '10 g',  m: 'Chia seeds',      k: '50 kcal' },
            { n: 'drop',  m: 'Vanilla',         k: '0 kcal' },
          ],
          steps: ['Stir chia into skyr.', 'Let bloom 10 min.'],
          coachNote: 'Skyr is denser than Greek yogurt. Same protein, fewer calories.',
        }),
        mk({ id: 'w19-dn', time: '19:00', tag: 'DINR', tagColor: t.RUST, title: 'Roast veg + feta plate', kcal: 580, p: 32, c: 52, f: 28, last: true,
          hero: 'Sheet-roast vegetables (zucchini, peppers, fennel), feta, olives, sourdough.',
          brief: 'The recovery plate. Mediterranean default.',
          ingredients: [
            { n: '400 g', m: 'Mixed veg',       k: '180 kcal' },
            { n: '60 g',  m: 'Feta',            k: '160 kcal' },
            { n: '30 g',  m: 'Olives',          k: '90 kcal' },
            { n: '60 g',  m: 'Sourdough',       k: '160 kcal' },
          ],
          steps: ['Toss veg with olive oil, salt. Roast 220°C/425°F for 22 min.', 'Plate. Crumble feta, scatter olives.', 'Toast bread, serve alongside.'],
          coachNote: 'Sheet pan is the laziest hero. Use it twice a week.',
        }),
      ],
    },
    {
      d: 'T 20',
      kicker: 'Section · Nutrition',
      title: <>Pull<br/>fuel.</>,
      tag: 'TRAIN',
      tagColor: t.AMBER,
      accent: t.RUST,
      headline: <>Bigger<br/>protein.</>,
      meta: '5 services · 2050 kcal',
      copy: 'Lower-pull day. Deadlift demands the most from the posterior chain — protein high, fats moderate, carbs to refill.',
      totals: { cal: '2048', p: '178', c: '218', f: '62', target: { cal: '2100', p: '180', c: '220', f: '65' } },
      recipeName: <>Steak +<br/>jasmine rice.</>,
      recipeMeta: '4 ingredients · 12 min · Pan-sear',
      recipe: {
        title: <>Steak +<br/>jasmine rice.</>,
        meta: '4 ingredients · 12 min · Pan-sear',
        accent: t.RUST,
        kcal: 640, p: 52, c: 64, f: 22, prep: '12 min', portion: '1 plate', score: 'A',
        hero: 'Sirloin steak, jasmine rice, charred scallion, soy-butter pan sauce.',
        brief: 'Deadlift days are protein days. Sear hot, rest properly, slice against the grain. The pan sauce is non-negotiable — you earned it.',
        ingredients: [
          { n: '200 g', m: 'Sirloin steak',          k: '440 kcal' },
          { n: '160 g', m: 'Jasmine rice (cooked)',  k: '210 kcal' },
          { n: '4',     m: 'Scallions',              k: '15 kcal' },
          { n: '15 g',  m: 'Butter + soy',           k: '110 kcal' },
        ],
        steps: [
          'Salt steak heavily 40 min before cooking. Pat dry just before pan.',
          'Cast iron, screaming hot, neutral oil. Sear 2:30 each side for medium-rare.',
          'Pull steak. Rest 6 min on a board. Don\'t skip this.',
          'Same pan: scallions 30 sec, off heat add butter + 1 tbsp soy.',
          'Slice steak against grain, plate over rice, spoon pan sauce.',
        ],
        coachNote: 'Hinge work is the most demanding lift you do. Earn the steak, then eat the steak.',
      },
      coachLine: 'Hinges chew protein. Don\'t leave any on the plate.',
      meals: [
        mk({ id: 'r20-bf', time: '07:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Three-egg + oat scramble', kcal: 520, p: 38, c: 48, f: 18, state: 'done',
          hero: 'Three eggs, oat porridge side, hot sauce.',
          brief: 'Big breakfast for the heaviest pull of the cycle.',
          ingredients: [
            { n: '3',     m: 'Whole eggs',      k: '210 kcal' },
            { n: '60 g',  m: 'Rolled oats',     k: '220 kcal' },
            { n: '5 g',   m: 'Butter',          k: '40 kcal' },
            { n: 'dash',  m: 'Hot sauce',       k: '0 kcal' },
            { n: '50 g',  m: 'Spinach',         k: '12 kcal' },
          ],
          steps: ['Cook oats in 250 ml water, simmer 5 min.', 'Whisk eggs, soft-scramble in butter.', 'Wilt spinach in pan, fold in.', 'Serve oats alongside.'],
          coachNote: 'Eat both. The oats fuel the lift, the eggs fuel the recovery.',
        }),
        mk({ id: 'r20-sn1', time: '10:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Whey + banana', kcal: 240, p: 28, c: 32, f: 2,
          hero: '30g whey, 1 banana, 240 ml water.',
          brief: 'Topping off pre-deadlift.',
          ingredients: [
            { n: '30 g',  m: 'Whey',            k: '120 kcal' },
            { n: '1',     m: 'Banana',          k: '105 kcal' },
            { n: '240ml', m: 'Cold water',      k: '0 kcal' },
          ],
          steps: ['Blend or shake.', 'Drink 90 min before pulling.'],
          coachNote: 'Banana sugars hit fast. Time it within 90 min of the lift.',
        }),
        mk({ id: 'r20-ln', time: '13:00', tag: 'LUNCH', tagColor: t.AMBER, title: 'Steak + rice + slaw', kcal: 700, p: 56, c: 68, f: 20, state: 'next',
          hero: 'Pan-seared sirloin, jasmine rice, cabbage slaw.',
          brief: 'The post-pull plate. Iron + carbs + crunch.',
          ingredients: [
            { n: '180 g', m: 'Sirloin',         k: '380 kcal' },
            { n: '140 g', m: 'Cooked rice',     k: '180 kcal' },
            { n: '100 g', m: 'Cabbage slaw',    k: '60 kcal' },
            { n: '10 g',  m: 'Sesame oil',      k: '90 kcal' },
          ],
          steps: ['Season steak with salt. Sear 3 min/side, rest 5 min.', 'Cook rice 1:1.5 in salted water, 12 min.', 'Slice steak against grain, plate over rice with slaw.'],
          coachNote: 'Rest the steak. Cutting hot meat costs you 20% of the moisture.',
        }),
        mk({ id: 'r20-sn2', time: '16:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Cottage cheese + peach', kcal: 210, p: 24, c: 22, f: 4,
          hero: '200 g cottage cheese, ½ peach, mint.',
          brief: 'Slow protein into the evening.',
          ingredients: [
            { n: '200 g', m: 'Cottage cheese',  k: '160 kcal' },
            { n: '½',     m: 'Peach',           k: '30 kcal' },
            { n: '4',     m: 'Mint leaves',     k: '0 kcal' },
          ],
          steps: ['Spoon cottage cheese.', 'Slice peach over.', 'Mint last.'],
          coachNote: 'Peach pairs with the cottage cheese tang. Don\'t skip the mint.',
        }),
        mk({ id: 'r20-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Pasta + meat sauce', kcal: 620, p: 42, c: 78, f: 14, last: true,
          hero: 'Whole-wheat pasta, lean ground beef sauce, parmesan.',
          brief: 'Carb-refill dinner. Sleep on it.',
          ingredients: [
            { n: '120 g', m: 'WW pasta (dry)',  k: '420 kcal' },
            { n: '150 g', m: 'Beef sauce',      k: '240 kcal' },
            { n: '15 g',  m: 'Parmesan',        k: '60 kcal' },
            { n: '5 g',   m: 'Basil',           k: '0 kcal' },
          ],
          steps: ['Cook pasta to al dente.', 'Reheat sauce.', 'Toss together, top with parmesan + basil.'],
          coachNote: 'Whole-wheat pasta wins on fiber. Cook it 1 min longer than the box says.',
        }),
      ],
    },
    {
      // ── F 21 — Friday peak day. Full detail. ──
      d: 'F 21',
      kicker: 'Section · Nutrition',
      title: <>The<br/>menu.</>,
      tag: 'PEAK',
      tagColor: t.AMBER,
      accent: t.AMBER,
      headline: <>Pull day.<br/>Full plates.</>,
      meta: '5 services · 3 logged',
      copy: 'Peak pull day. Anchor lunch, slow protein into the evening, no surprises before the lift.',
      totals: { cal: '1568', p: '118', c: '186', f: '52', target: { cal: '2100', p: '165', c: '240', f: '68' } },
      recipeName: <>Tahini chicken<br/>bowl.</>,
      recipeMeta: '5 ingredients · 18 min · By Maya P.',
      recipe: {
        title: <>Tahini chicken<br/>bowl.</>,
        meta: '5 ingredients · 18 min · By Maya P.',
        accent: t.AMBER,
        kcal: 620, p: 48, c: 72, f: 14, prep: '18 min', portion: '1 bowl', score: 'A',
        hero: 'Grilled chicken thigh, jasmine rice, roasted veg, tahini-lemon, sumac.',
        brief: 'Maya\'s template lunch — high-protein, mid-fat, carb-anchored. Build it once, then swap the protein and the veg without losing the macros.',
        ingredients: [
          { n: '180 g', m: 'Chicken thigh',          k: '320 kcal' },
          { n: '150 g', m: 'Jasmine rice',           k: '195 kcal' },
          { n: '120 g', m: 'Roast veg medley',       k: '60 kcal' },
          { n: '15 g',  m: 'Tahini',                 k: '95 kcal' },
          { n: '½',     m: 'Lemon',                  k: '5 kcal' },
        ],
        steps: [
          'Salt + paprika the chicken. Sear 4 min/side over medium-high.',
          'Cook rice 1:1.5 in salted water, cover 12 min, fluff.',
          'Roast veg at 220°C / 425°F for 15 min, flipping halfway.',
          'Whisk tahini + lemon + 30 ml warm water until pourable.',
          'Plate rice, top with chicken + veg, drizzle, dust sumac.',
        ],
        coachNote: 'This is the day-of-pulls anchor meal. If you\'re lifting heavy at 18:00, eat this at 12:30 — not later.',
      },
      coachLine: 'Five plates. Three logged before noon. Don\'t coast through the afternoon — refill at 16:00.',
      meals: [
    { id: 'bfast',  time: '07:20', tag: 'BFAST', tagColor: t.GREEN, title: 'Oats, berries, whey',     sub: '412 kcal · 32P · 58C · 8F',  state: 'done',
      kcal: 412, p: 32, c: 58, f: 8,  prep: '6 min', portion: '1 bowl', score: 'A',
      hero: 'Steel-cut oats, frozen mixed berries, vanilla whey, chia, walnuts.',
      brief: 'A solid Tuesday opener — slow carbs to fuel the morning pull session, 30+ g protein to start MPS early.',
      ingredients: [
        { n: '50 g',  m: 'Steel-cut oats',     k: '180 kcal' },
        { n: '120 g', m: 'Mixed berries',      k: '60 kcal' },
        { n: '30 g',  m: 'Vanilla whey',       k: '120 kcal' },
        { n: '10 g',  m: 'Chia seeds',         k: '50 kcal' },
        { n: '8 g',   m: 'Walnuts',            k: '52 kcal' },
      ],
      steps: [
        'Cook oats in 250 ml water — simmer 4 min, stir occasionally.',
        'Off heat: stir in chia, let bloom 1 min.',
        'Whisk whey with 60 ml cold water, fold into oats once cooled slightly.',
        'Top with berries + chopped walnuts.',
      ],
      coachNote: 'Eat within 30 min of waking on training days. Cap whey at 30g — more goes to oxidation.',
    },
    { id: 'snack1', time: '10:30', tag: 'SNACK', tagColor: t.BLUE,  title: 'Whey shake',              sub: '156 kcal · 28P',              state: 'done',
      kcal: 156, p: 28, c: 4, f: 2, prep: '2 min', portion: '1 shake', score: 'A',
      hero: '30 g whey, 240 ml water, ice, pinch of salt.',
      brief: 'Bridge protein — keeps MPS elevated between breakfast and lunch.',
      ingredients: [
        { n: '30 g',  m: 'Vanilla whey',       k: '120 kcal' },
        { n: '240ml', m: 'Cold water',         k: '0 kcal' },
        { n: '1 cup', m: 'Ice',                k: '0 kcal' },
        { n: 'pinch', m: 'Sea salt',           k: '0 kcal' },
      ],
      steps: [
        'Shaker bottle. Water first, then powder.',
        'Shake 15 seconds, drink immediately.',
      ],
      coachNote: 'Salt helps electrolyte balance — especially on training days. No need for extras.',
    },
    { id: 'lunch',  time: '12:40', tag: 'LUNCH', tagColor: t.AMBER, title: 'Chicken bowl + rice',     sub: '620 kcal · 48P · 72C · 14F',  state: 'next',
      kcal: 620, p: 48, c: 72, f: 14, prep: '15 min', portion: '1 bowl', score: 'A',
      hero: 'Grilled chicken thigh, jasmine rice, roasted vegetables, tahini-lemon sauce.',
      brief: 'The anchor meal of the day — biggest carb hit, biggest protein. Eat slow, finish the plate.',
      ingredients: [
        { n: '180 g', m: 'Chicken thigh',      k: '320 kcal' },
        { n: '150 g', m: 'Jasmine rice',       k: '195 kcal' },
        { n: '120 g', m: 'Roast veg medley',   k: '60 kcal' },
        { n: '15 g',  m: 'Tahini',             k: '95 kcal' },
        { n: '½',     m: 'Lemon',              k: '5 kcal' },
      ],
      steps: [
        'Season chicken with salt + paprika, sear 4 min/side over medium-high.',
        'Cook rice 1:1.5 in salted water, cover 12 min, fluff.',
        'Roast veg at 220°C / 425°F for 15 min, flipping halfway.',
        'Whisk tahini + lemon + 30 ml warm water until pourable.',
        'Plate rice, top with chicken + veg, drizzle sauce.',
      ],
      coachNote: 'This is your peak fueling moment. If energy crashed yesterday, add 30 g rice today.',
    },
    { id: 'snack2', time: '16:00', tag: 'SNACK', tagColor: t.BLUE,  title: 'Greek yogurt + almonds',  sub: '280 kcal · 22P · 18C · 12F',
      kcal: 280, p: 22, c: 18, f: 12, prep: '1 min', portion: '1 cup', score: 'B+',
      hero: '200 g full-fat Greek yogurt, 15 g raw almonds, drizzle of honey.',
      brief: 'Pre-evening snack — slows the protein drip into the night meal.',
      ingredients: [
        { n: '200 g', m: 'Greek yogurt 5%',    k: '180 kcal' },
        { n: '15 g',  m: 'Raw almonds',        k: '90 kcal' },
        { n: '1 tsp', m: 'Honey',              k: '20 kcal' },
      ],
      steps: [
        'Spoon yogurt into bowl.',
        'Crush almonds lightly, scatter.',
        'Drizzle honey, eat slowly.',
      ],
      coachNote: 'Use full-fat yogurt — it keeps you fuller longer and fits the day fat target perfectly.',
    },
    { id: 'dinner', time: '19:30', tag: 'DINR',  tagColor: t.RUST,  title: 'Salmon, quinoa, greens',  sub: '580 kcal · 44P · 48C · 22F',  last: true,
      kcal: 580, p: 44, c: 48, f: 22, prep: '20 min', portion: '1 plate', score: 'A',
      hero: 'Pan-seared salmon, lemon quinoa, sautéed kale + garlic.',
      brief: 'Closes the day — omega-3s for recovery, slow carbs to set up tomorrow.',
      ingredients: [
        { n: '180 g', m: 'Salmon fillet',      k: '320 kcal' },
        { n: '120 g', m: 'Cooked quinoa',      k: '140 kcal' },
        { n: '200 g', m: 'Kale',               k: '70 kcal' },
        { n: '2 cl',  m: 'Garlic',             k: '10 kcal' },
        { n: '1 tbsp',m: 'Olive oil',          k: '120 kcal' },
      ],
      steps: [
        'Pat salmon dry. Salt + pepper. Skin-side down 4 min, flip 2 min.',
        'Quinoa: 1:2 water, simmer covered 12 min. Squeeze lemon to finish.',
        'Sauté garlic in oil 30 sec. Toss in kale, cook until just wilted.',
        'Plate quinoa + greens, top with salmon.',
      ],
      coachNote: 'Try to finish dinner ≥ 2.5 hr before bed for sleep quality. Lemon on the quinoa is non-negotiable.',
    },
      ],
    },
    {
      d: 'S 22',
      kicker: 'Section · Nutrition',
      title: <>Carb<br/>load.</>,
      tag: 'COND',
      tagColor: t.RUST,
      accent: t.RUST,
      headline: <>Threshold<br/>fuel.</>,
      meta: '4 services · 1900 kcal',
      copy: 'Conditioning day. Carbs front-loaded — fuel the intervals, recover with protein. Skip the heavy fats early.',
      totals: { cal: '1898', p: '128', c: '232', f: '50', target: { cal: '1950', p: '130', c: '240', f: '52' } },
      recipeName: <>Honey-soy<br/>salmon rice bowl.</>,
      recipeMeta: '5 ingredients · 16 min · Bowl',
      recipe: {
        title: <>Honey-soy<br/>salmon rice bowl.</>,
        meta: '5 ingredients · 16 min · Bowl',
        accent: t.RUST,
        kcal: 560, p: 38, c: 64, f: 18, prep: '16 min', portion: '1 bowl', score: 'A',
        hero: 'Salmon, jasmine rice, cucumber ribbons, honey-soy glaze, sesame.',
        brief: 'A conditioning-day bowl built for fast turnaround. Glaze caramelizes on the salmon in three minutes; rice carries it. Cool cucumber resets your palate between bites.',
        ingredients: [
          { n: '180 g', m: 'Salmon fillet',          k: '320 kcal' },
          { n: '150 g', m: 'Jasmine rice',           k: '195 kcal' },
          { n: '½',     m: 'Cucumber',               k: '8 kcal' },
          { n: '20 g',  m: 'Honey + soy (1:2)',      k: '30 kcal' },
          { n: '5 g',   m: 'Toasted sesame',         k: '30 kcal' },
        ],
        steps: [
          'Whisk honey + soy + 1 tsp rice vinegar + grated ginger.',
          'Pat salmon dry. Sear skin-side 3 min, flip, brush glaze, 2 min.',
          'Off heat: brush again, let glaze tighten on the fish.',
          'Bowl rice, ribbon the cucumber over, lay salmon on top.',
          'Pour residual glaze, scatter sesame.',
        ],
        coachNote: 'Eat within 60 minutes of finishing the intervals. Carbs + protein, in that order, in that ratio.',
      },
      coachLine: 'Threshold work eats glycogen. Carb in, carb out — protein is the bookend.',
      meals: [
        mk({ id: 's22-bf', time: '07:30', tag: 'BFAST', tagColor: t.GREEN, title: 'Banana-honey toast + eggs', kcal: 480, p: 28, c: 62, f: 12, state: 'done',
          hero: 'Sourdough toast, banana, honey, two soft-boiled eggs.',
          brief: 'Carbs first. Threshold reps don\'t wait.',
          ingredients: [
            { n: '60 g', m: 'Sourdough',    k: '160 kcal' },
            { n: '1',    m: 'Banana',       k: '105 kcal' },
            { n: '1 tsp',m: 'Honey',        k: '20 kcal' },
            { n: '2',    m: 'Eggs',         k: '140 kcal' },
            { n: 'pinch',m: 'Sea salt',     k: '0 kcal' },
          ],
          steps: ['Boil eggs 6 min, cold-shock.', 'Toast bread, slice banana over, drizzle honey.', 'Halve eggs alongside, salt.'],
          coachNote: 'Eat 90 min before warm-up. The carbs need time to hit.',
        }),
        mk({ id: 's22-sn', time: '11:00', tag: 'SNACK', tagColor: t.BLUE, title: 'Dates + espresso', kcal: 180, p: 4, c: 38, f: 1,
          hero: '3 medjool dates, double espresso.',
          brief: 'Pre-session caffeine + glucose. The cyclist\'s breakfast.',
          ingredients: [
            { n: '3',     m: 'Medjool dates', k: '180 kcal' },
            { n: '60ml',  m: 'Espresso',     k: '0 kcal' },
          ],
          steps: ['Eat dates 30 min before warm-up.', 'Sip espresso 15 min before.'],
          coachNote: 'Caffeine 30-45 min pre-effort. Earlier is wasted.',
        }),
        mk({ id: 's22-ln', time: '13:30', tag: 'LUNCH', tagColor: t.AMBER, title: 'Honey-soy salmon rice bowl', kcal: 660, p: 48, c: 78, f: 16, state: 'next',
          hero: 'Glazed salmon, jasmine rice, edamame, cucumber, sesame.',
          brief: 'Post-threshold refill. Glycogen window owed, sodium owed.',
          ingredients: [
            { n: '180 g', m: 'Salmon',         k: '320 kcal' },
            { n: '180 g', m: 'Cooked rice',    k: '230 kcal' },
            { n: '80 g',  m: 'Edamame',        k: '90 kcal' },
            { n: '60 g',  m: 'Cucumber',       k: '10 kcal' },
            { n: '15 g',  m: 'Soy + honey',    k: '40 kcal' },
          ],
          steps: ['Whisk soy + honey + grated ginger.', 'Sear salmon 4 min/side, glaze in pan last 30 sec.', 'Plate rice, salmon, edamame, cucumber. Sesame on top.'],
          coachNote: 'Glaze at the end, not the start. Sugar burns fast.',
        }),
        mk({ id: 's22-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Pho — beef + rice noodles', kcal: 580, p: 38, c: 72, f: 12, last: true,
          hero: 'Beef pho with rice noodles, basil, lime, sriracha.',
          brief: 'Sodium + carbs + collagen. The Saturday-night dinner.',
          ingredients: [
            { n: '500ml', m: 'Beef broth',     k: '60 kcal' },
            { n: '120 g', m: 'Beef sirloin',   k: '240 kcal' },
            { n: '120 g', m: 'Rice noodles',   k: '180 kcal' },
            { n: '20 g',  m: 'Basil + lime',   k: '5 kcal' },
            { n: 'dash',  m: 'Fish sauce',     k: '5 kcal' },
          ],
          steps: ['Heat broth to simmer, season with fish sauce.', 'Cook noodles 3 min.', 'Slice raw beef thin, ladle hot broth over to cook.', 'Top with herbs, lime, sriracha to taste.'],
          coachNote: 'Pho replaces a lot of what threshold work loses. It\'s a recovery tool, not a treat.',
        }),
      ],
    },
    {
      d: 'S 23',
      kicker: 'Section · Nutrition',
      title: <>Easy<br/>plate.</>,
      tag: 'REST',
      tagColor: t.GREEN,
      accent: t.GREEN,
      headline: <>Sunday<br/>simple.</>,
      meta: '3 services · 1650 kcal',
      copy: 'Full rest day. Three meals, no snacks needed. Cook one thing well, eat slowly, sleep early.',
      totals: { cal: '1648', p: '128', c: '162', f: '60', target: { cal: '1700', p: '130', c: '170', f: '62' } },
      recipeName: <>Slow-roast<br/>chicken thighs.</>,
      recipeMeta: '4 ingredients · 50 min · Sunday batch',
      recipe: {
        title: <>Slow-roast<br/>chicken thighs.</>,
        meta: '4 ingredients · 50 min · Sunday batch',
        accent: t.GREEN,
        kcal: 380, p: 42, c: 4, f: 22, prep: '50 min', portion: '2 thighs', score: 'A',
        hero: 'Bone-in, skin-on chicken thighs. Lemon. Garlic. Salt. Time.',
        brief: 'The Sunday batch. Set the oven, get on with your day. The thighs render fat onto themselves and the skin shatters when it cools. Eat one tonight, four through the week.',
        ingredients: [
          { n: '6',     m: 'Bone-in skin-on thighs', k: '1620 kcal' },
          { n: '1',     m: 'Lemon (sliced)',         k: '15 kcal' },
          { n: '1 head',m: 'Garlic',                 k: '50 kcal' },
          { n: '1 tbsp',m: 'Coarse salt',            k: '0 kcal' },
        ],
        steps: [
          'Heat oven to 180°C / 350°F. Pat thighs very dry.',
          'Salt heavily, especially the skin. Don\'t skimp.',
          'Lay thighs skin-up over halved garlic head + lemon slices.',
          'Roast 50 min until skin is deep amber and shatters when tapped.',
          'Rest 10 min. Save the rendered fat — that\'s flavor for the week.',
        ],
        coachNote: 'Sunday cooking is a training tool. The protein you make today is the recovery you eat through Wednesday.',
      },
      coachLine: 'Rest day is a cooking day. Make the protein for Monday now.',
      meals: [
        mk({ id: 's23-bf', time: '09:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Veggie omelette + sourdough', kcal: 480, p: 32, c: 36, f: 22, state: 'done',
          hero: 'Three-egg omelette with peppers, onion, feta, sourdough side.',
          brief: 'Slow Sunday breakfast. No clock.',
          ingredients: [
            { n: '3',     m: 'Eggs',          k: '210 kcal' },
            { n: '50 g',  m: 'Bell pepper',   k: '15 kcal' },
            { n: '30 g',  m: 'Red onion',     k: '12 kcal' },
            { n: '30 g',  m: 'Feta',          k: '80 kcal' },
            { n: '60 g',  m: 'Sourdough',     k: '160 kcal' },
          ],
          steps: ['Sauté veg in pan 4 min.', 'Whisk eggs, pour over, low heat 5 min.', 'Crumble feta, fold, plate with toast.'],
          coachNote: 'Cook the omelette low. Eggs over high heat ruin the texture and the whole vibe.',
        }),
        mk({ id: 's23-ln', time: '13:00', tag: 'LUNCH', tagColor: t.AMBER, title: 'Slow-roast chicken + greens', kcal: 580, p: 52, c: 38, f: 22, state: 'done',
          hero: 'Roast chicken thighs, herby greens, crusty bread.',
          brief: 'The recovery anchor. Batch the chicken for the week.',
          ingredients: [
            { n: '300 g', m: 'Chicken thighs', k: '480 kcal' },
            { n: '120 g', m: 'Mixed greens',   k: '30 kcal' },
            { n: '15 g',  m: 'Olive oil',      k: '120 kcal' },
            { n: '40 g',  m: 'Sourdough',      k: '110 kcal' },
            { n: '½',     m: 'Lemon',          k: '5 kcal' },
          ],
          steps: ['Salt thighs, roast 200°C/400°F skin-up for 35 min.', 'Toss greens with olive oil + lemon.', 'Plate, tear bread, spoon pan drippings over greens.'],
          coachNote: 'Roast x4 of the chicken — Monday, Tuesday lunches sorted.',
        }),
        mk({ id: 's23-dn', time: '19:00', tag: 'DINR', tagColor: t.RUST, title: 'Tomato soup + grilled cheese', kcal: 590, p: 26, c: 64, f: 24, last: true,
          hero: 'Roasted tomato soup, sharp cheddar grilled cheese on sourdough.',
          brief: 'The comfort plate. Don\'t apologize for it.',
          ingredients: [
            { n: '400 g', m: 'Roasted tomato', k: '120 kcal' },
            { n: '50 g',  m: 'Sharp cheddar',  k: '200 kcal' },
            { n: '60 g',  m: 'Sourdough',      k: '160 kcal' },
            { n: '15 g',  m: 'Butter',         k: '110 kcal' },
          ],
          steps: ['Blend roasted tomato with garlic + basil + warm stock.', 'Butter bread, sandwich cheese, grill 3 min/side.', 'Serve hot, soup deep, sandwich cut diagonal.'],
          coachNote: 'Sunday dinner is the antidote. Eat it without phones.',
        }),
      ],
    },
  ];

  const cur = PROGRAM[day];
  const days = PROGRAM.map(p => p.d);
  const meals = cur.meals;

  // Reset scroll-to-top whenever the eat-tab view changes (day swap,
  // entering/exiting preview, switching grocery view). Without this,
  // .bs-scroll keeps the scrollTop from the previous render branch — which
  // is why "scroll back to top" felt impossible after returning from a
  // meal preview. MUST run before any early returns to satisfy Hooks rules.
  React.useLayoutEffect(() => {
    const el = document.querySelector('.bs-scroll');
    if (el) el.scrollTop = 0;
  }, [day, previewMealId, previewRecipe, previewDayBrief, view]);

  if (view === 'grocery') return <BSGrocery onBack={() => setView('eat')} onLibrary={() => setView('library')} />;
  if (view === 'library') return <BSGroceryLibrary onBack={() => setView('grocery')} />;
  if (previewMealId) {
    const meal = meals.find(m => m.id === previewMealId);
    if (meal) return <BSMealPreview meal={meal} onBack={() => setPreviewMealId(null)} />;
  }
  if (previewRecipe && cur.recipe) {
    return <BSRecipePreview recipe={cur.recipe} dayLabel={cur.d} onBack={() => setPreviewRecipe(false)} />;
  }
  if (previewDayBrief) {
    return <BSDayBriefPreview
      day={cur}
      onBack={() => setPreviewDayBrief(false)}
      onMealClick={(id) => { setPreviewDayBrief(false); setPreviewMealId(id); }}
      onRecipeClick={() => { setPreviewDayBrief(false); setPreviewRecipe(true); }}
    />;
  }

  // Mon=0..Sun=6 — count meals already logged today (state === 'done')
  const loggedCount = cur.meals.filter(m => m.state === 'done').length;

  return (
    <BSPage>
      <BSPageHeader
        kicker={cur.kicker}
        title={cur.title}
        trailing={<BSAvatar init="A" size={32} onClick={onProfile} />}
      />

      {/* Recipe of the day — pinned to top of Eat page */}
      <div onClick={() => cur.recipe && setPreviewRecipe(true)} style={{ borderRadius: t.RADIUS_SM, overflow: 'hidden', margin: `12px ${t.padX}px 0`, border: `1px solid ${t.INK}`, cursor: cur.recipe ? 'pointer' : 'default' }}>
        <BSHalftone height={140} accent={cur.accent} pattern="dots" />
        <div style={{ padding: 16, borderTop: `1px solid ${t.INK}` }}>
          <BSEyebrow color={t.ACCENT}>Recipe of the day</BSEyebrow>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 26, lineHeight: 1, letterSpacing: '-0.03em', color: t.INK, marginTop: 8 }}>
            {cur.recipeName}
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginTop: 8, gap: 12 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, letterSpacing: '0.1em' }}>
              {cur.recipeMeta}
            </div>
            {cur.recipe && (
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.ACCENT, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Read →</div>
            )}
          </div>
        </div>
      </div>

      {/* Grocery cell — week's list is one tap away */}
      <BSSection title="Grocery" meta="14 items · ~$48" />
      <div style={{ padding: `0 ${t.padX}px 6px` }}>
        <BSCell dark onClick={() => setView('grocery')}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.AMBER, fontWeight: 700 }}>This week</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, marginTop: 6, letterSpacing: '-0.02em' }}>Open list →</div>
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 36, letterSpacing: '-0.04em', fontVariantNumeric: 'tabular-nums' }}>14</div>
          </div>
        </BSCell>
      </div>

      {/* Day strip — mirrors Train tab */}
      <div style={{ padding: `12px ${t.padX}px 18px`, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderBottom: `1px solid ${t.RULE}` }}>
        {days.map((d, i) => {
          const on = i === day;
          const isRest = PROGRAM[i].tag === 'REST';
          return (
            <button key={i} onClick={() => setDay(i)} style={{ borderRadius: t.RADIUS_SM,
              border: `1px solid ${on ? t.INK : t.HAIR}`,
              background: on ? t.INK : 'transparent',
              color: on ? t.PAPER : t.INK,
              padding: '10px 0', cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.1em',
              position: 'relative',
            }}>
              {d}
              {isRest && (
                <span style={{
                  position: 'absolute', top: 3, right: 4,
                  width: 4, height: 4, borderRadius: 2,
                  background: on ? t.PAPER : t.GREEN, opacity: on ? 0.7 : 1,
                }} />
              )}
            </button>
          );
        })}
      </div>

      {/* Halftone hero — accent recolors per day. Tap to open the day brief. */}
      <div onClick={() => setPreviewDayBrief(true)} style={{ padding: `0 ${t.padX}px`, cursor: 'pointer' }}>
        <div style={{ borderRadius: t.RADIUS_SM, overflow: 'hidden', border: `1px solid ${t.INK}` }}>
          <BSHalftone height={170} accent={cur.accent} pattern="dots" />
        </div>
      </div>

      {/* Headline meal block — tap-through to day brief */}
      <div onClick={() => setPreviewDayBrief(true)} style={{ borderRadius: t.RADIUS_SM, margin: `18px ${t.padX}px 0`, padding: 18, border: `1px solid ${t.RULE}`, background: t.PAPER2, cursor: 'pointer', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <BSTag color={cur.tagColor}>{cur.tag}</BSTag>
          <BSEyebrow color={t.ACCENT}>{cur.meta}</BSEyebrow>
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: t.headlineLead + 4, lineHeight: 0.95, letterSpacing: '-0.035em', color: t.INK, marginTop: 10 }}>
          {cur.headline}
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: t.body, color: t.INK70, lineHeight: 1.4, letterSpacing: '-0.005em' }}>
          {cur.copy}
        </div>
        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 9.5, color: t.ACCENT, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>
          Read the day brief →
        </div>
      </div>

      {/* Macro headline — driven by cur.totals */}
      <div style={{ borderRadius: t.RADIUS_SM, margin: `18px ${t.padX}px 0`, padding: `16px 14px`, border: `1px solid ${t.RULE}`, background: t.PAPER2, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {[
          { l: 'CAL',   v: cur.totals.cal, s: `/${cur.totals.target.cal}` },
          { l: 'PRO',   v: cur.totals.p,   s: `/${cur.totals.target.p}g` },
          { l: 'CARB',  v: cur.totals.c,   s: `/${cur.totals.target.c}g` },
          { l: 'FAT',   v: cur.totals.f,   s: `/${cur.totals.target.f}g`  },
        ].map((m, i) => (
          <div key={m.l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{m.l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 28, color: t.INK, marginTop: 4, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.v}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.08em' }}>{m.s}</div>
          </div>
        ))}
      </div>

      <BSSection title={day === 4 ? "Today's menu" : `${cur.d} menu`} meta={`${cur.meals.length} services · ${loggedCount} logged`} />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {cur.meals.map((m) => (
          <BSRow key={m.id} {...m} onClick={() => setPreviewMealId(m.id)} />
        ))}
      </div>

      {/* Coach pull quote — mirrors Train tab */}
      <div style={{ borderRadius: t.RADIUS_SM, margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Notes from Maya
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {cur.coachLine}
        </div>
      </div>

      <BSFooter right="Pg 3 of 5" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// CHAT — Circle / Clients / Trainers / Nutri / Community
// ═══════════════════════════════════════════════════════════
function BSClientChat({ onProfile, role = 'client' }) {
  const t = useBS();

  // ── Build role-aware data ────────────────────────────────────
  // Two top-level views: Direct (people) and Channels (group rooms).
  // We attach a `bucket` label to every direct thread so users still
  // see who's a coach vs a client at a glance.
  const { directBuckets, communityBuckets } = React.useMemo(() => {
    const raw = (window.clientChatTabs || []);
    const byId = Object.fromEntries(raw.map(tb => [tb.id, tb]));

    // Shape support — group rooms, used by every role
    const shapeRooms = [
      { who: 'Shape Support', role: 'Avg reply · 4 min · Mon–Sun · 8a–10p', last: "We're here whenever you need us. Billing, bugs, feature requests — anything.", time: '—', unread: 0, bucket: 'SUPPORT', messages: [
        { who: 'Shape', t: "Welcome to Shape. We're here whenever you need us — billing, bugs, feature requests, anything at all.", time: 'Welcome', me: false },
        { who: 'Shape', t: 'Avg reply time is 4 min. Real humans, no bots.', time: 'Welcome', me: false },
      ]},
      { who: '# product-updates', role: "What's new in Shape · Weekly digest", last: 'Apr 21 · Calendar redesign + Shape Radio FX overlays.', time: '2d', unread: 1, group: true, bucket: 'SHAPE', messages: [
        { who: 'Shape Product', t: 'Apr 21 · Calendar redesign is live. Tap any day from Home to drill in.', time: 'Mon 9:00 AM', me: false },
        { who: 'Shape Product', t: 'Shape Radio now has reactive FX overlays — try them in Settings → Light effects.', time: 'Mon 9:00 AM', me: false },
      ]},
      { who: '# release-notes', role: 'Beta channel · Opt-in via Me → Settings', last: 'v6.38 — Tweaks panel persists across sessions.', time: '4d', unread: 0, group: true, bucket: 'SHAPE', messages: [
        { who: 'Shape Eng', t: 'v6.38 ships Friday. Tweaks panel state now persists across sessions.', time: 'Sat 11:14 AM', me: false },
      ]},
    ];

    // Tag every thread with a `bucket` so the merged Direct list still
    // visually groups coaches vs clients/peers via a small label chip.
    const tagAll = (threads, bucket) => threads.map(th => ({ ...th, bucket }));

    if (role === 'trainer') {
      const team = [
        { who: 'Rae Lindqvist', role: 'Nutritionist', last: "Casey's energy on Wed pulls is dragging. Bumped carbs +20g pre-session.", time: '11m', unread: 1, messages: [
          { who: 'Rae', t: "Hey — Casey's energy on Wed pulls is dragging. I bumped carbs +20g pre-session.", time: '11m', me: false },
          { who: 'You', t: 'Smart. RPE was 9 on the top set — let me know if it shifts.', time: '8m', me: true },
        ]},
        { who: 'Dr. Sam Huang', role: 'Nutritionist · Endurance', last: "Splitting Drew's long-run fueling protocol with you.", time: '2h', unread: 0, messages: [
          { who: 'Sam', t: "Splitting Drew's long-run fueling protocol with you — pre/during/post.", time: '2h', me: false },
        ]},
      ];
      const clients = [
        { who: 'Casey M.', role: 'Block 3 · Strength · 14 wk in', last: 'Squat 225 felt heavy today, knee a bit grumpy.', time: '4m', unread: 2, messages: [
          { who: 'Casey', t: 'Squat 225 felt heavy today, knee a bit grumpy.', time: '4m', me: false },
          { who: 'Casey', t: 'Should I drop backoffs?', time: '4m', me: false },
        ]},
        { who: 'Drew O.', role: 'Hybrid · Marathon block', last: 'Long run done — 18mi @ 8:42 avg.', time: '1h', unread: 0, messages: [
          { who: 'Drew', t: 'Long run done — 18mi @ 8:42 avg. Felt great.', time: '1h', me: false },
          { who: 'You', t: 'Huge. Easy day tomorrow, no zone 3.', time: '52m', me: true },
        ]},
        { who: 'Maya R.', role: 'Hypertrophy · Block 2', last: 'Form check video on the RDL?', time: '3h', unread: 1, messages: [
          { who: 'Maya', t: 'Form check video on the RDL?', time: '3h', me: false },
        ]},
      ];
      const peers = (byId.trainers?.threads || []).slice(0, 2);
      return {
        directBuckets: [
          { id: 'clients',  label: 'Clients',  threads: tagAll(clients, 'CLIENT') },
          { id: 'trainers', label: 'Trainers', threads: tagAll(peers, 'TRAINER') },
          { id: 'friends',  label: 'Friends',  threads: tagAll(byId.friends?.threads || [], 'FRIEND') },
        ],
        communityBuckets: [
          { id: 'channels', label: 'Channels',      threads: tagAll(byId.community?.threads || [], 'COMMUNITY') },
          { id: 'shape',    label: 'Shape members', threads: shapeRooms },
        ],
      };
    }

    if (role === 'nutritionist') {
      const team = [
        { who: 'Maya Okafor', role: 'Trainer · Tempo + hybrid', last: 'Casey is on a heavy block — pushing carbs +15%.', time: '9m', unread: 1, messages: [
          { who: 'Maya', t: 'Casey is on a heavy block this week — RPE 9 on top sets.', time: '14m', me: false },
          { who: 'You', t: 'Pushing carbs +15% pre-session. Will ping if adherence dips.', time: '9m', me: true },
        ]},
        { who: 'Jordan Reyes', role: 'Trainer · Olympic lifting', last: "Splitting protocol for Drew's training camp.", time: '3h', unread: 0, messages: [
          { who: 'Jordan', t: "Drew's training camp starts in 4 weeks — let's align fueling.", time: '3h', me: false },
        ]},
      ];
      const clients = [
        { who: 'Casey M.', role: 'Cut · 14 wk · 12lb down', last: 'Macros feel sustainable — appetite finally normal.', time: '6m', unread: 1, messages: [
          { who: 'Casey', t: 'Macros feel sustainable — appetite finally normal this week.', time: '6m', me: false },
        ]},
        { who: 'Drew O.', role: 'Endurance fueling', last: 'Hit 80g carbs pre-long-run, felt amazing.', time: '47m', unread: 0, messages: [
          { who: 'Drew', t: 'Hit 80g carbs pre-long-run, felt amazing.', time: '47m', me: false },
          { who: 'You', t: 'Stick with it. Add 30g during for runs over 90 min.', time: '40m', me: true },
        ]},
        { who: 'Sofia P.', role: 'Vegetarian · Performance', last: 'Iron panel came back — worth a chat.', time: '2h', unread: 1, messages: [
          { who: 'Sofia', t: 'Iron panel came back — worth a chat. Numbers attached.', time: '2h', me: false },
        ]},
      ];
      const peers = (byId.nutritionists?.threads || []).slice(0, 2);
      return {
        directBuckets: [
          { id: 'clients', label: 'Clients',       threads: tagAll(clients, 'CLIENT') },
          { id: 'nutri',   label: 'Nutritionists', threads: tagAll(peers, 'NUTRI') },
          { id: 'friends', label: 'Friends',       threads: tagAll(byId.friends?.threads || [], 'FRIEND') },
        ],
        communityBuckets: [
          { id: 'channels', label: 'Channels',      threads: tagAll(byId.community?.threads || [], 'COMMUNITY') },
          { id: 'shape',    label: 'Shape members', threads: shapeRooms },
        ],
      };
    }

    // Client: Direct = Shape Circle (coaches) + Friends + Shape Clients (peers)
    //         Community = Channels + Shape members
    return {
      directBuckets: [
        { id: 'circle',  label: 'Team',          threads: tagAll(byId.circle?.threads || [], 'COACH') },
        { id: 'friends', label: 'Friends',       threads: tagAll(byId.friends?.threads || [], 'FRIEND') },
        { id: 'peers',   label: 'Shape Clients', threads: tagAll(byId.clients?.threads || [], 'PEER') },
      ],
      communityBuckets: [
        { id: 'channels', label: 'Channels',      threads: tagAll(byId.community?.threads || [], 'COMMUNITY') },
        { id: 'shape',    label: 'Shape members', threads: shapeRooms },
      ],
    };
  }, [role]);

  // Two-tier view state
  const [view, setView] = useStateBSC('direct'); // 'direct' | 'community'
  const [subId, setSubId] = useStateBSC(null);   // active sub-bucket id
  const [openThread, setOpenThread] = useStateBSC(null); // { view, subId, idx }
  const [chatQuery, setChatQuery] = useStateBSC(''); // search filter (community only)

  const buckets = view === 'direct' ? directBuckets : communityBuckets;
  const activeSubId = subId && buckets.some(b => b.id === subId) ? subId : buckets[0]?.id;
  const activeBucket = buckets.find(b => b.id === activeSubId) || buckets[0];
  // Filter threads by query — match on name, role/sub, or last message
  const rawThreads = activeBucket?.threads || [];
  const q = chatQuery.trim().toLowerCase();
  const activeThreads = q
    ? rawThreads.filter(th =>
        (th.who || '').toLowerCase().includes(q) ||
        (th.role || '').toLowerCase().includes(q) ||
        (th.last || '').toLowerCase().includes(q)
      )
    : rawThreads;

  if (openThread) {
    const fromBuckets = openThread.view === 'direct' ? directBuckets : communityBuckets;
    const fromBucket = fromBuckets.find(b => b.id === openThread.subId) || fromBuckets[0];
    const thread = fromBucket?.threads[openThread.idx];
    const eyebrow = (openThread.view === 'direct' ? 'DIRECT' : 'COMMUNITY') + ' · ' + (fromBucket?.label || '').toUpperCase();
    return <BSChatThread thread={thread} eyebrow={eyebrow} onBack={() => setOpenThread(null)} />;
  }

  const directUnread    = directBuckets.reduce((s, b) => s + b.threads.reduce((x, th) => x + (th.unread || 0), 0), 0);
  const communityUnread = communityBuckets.reduce((s, b) => s + b.threads.reduce((x, th) => x + (th.unread || 0), 0), 0);
  const totalUnread = view === 'direct' ? directUnread : communityUnread;

  // Color map for the bucket chips on each thread row
  const bucketColor = {
    COACH:     t.BLUE,
    TEAM:      t.BLUE,
    PEER:      t.RUST,
    FRIEND:    t.RUST,
    CLIENT:    t.AMBER,
    TRAINER:   t.GREEN,
    NUTRI:     t.GREEN,
    COMMUNITY: t.INK,
    SHAPE:     t.ACCENT,
    SUPPORT:   t.ACCENT,
  };

  return (
    <BSPage>
      <BSPageHeader
        kicker="Section · Correspondence"
        title={<>Letters<br/>& replies.</>}
        trailing={<BSAvatar init="A" size={32} onClick={onProfile} />}
      />

      {/* Two-tier toggle — Direct (people) vs Community (group + Shape) */}
      <div style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr',
        borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER, position: 'sticky', top: 0, zIndex: 2,
      }}>
        {[
          { id: 'direct',    label: 'Direct',    sub: 'People',         unread: directUnread,    count: directBuckets.reduce((s, b) => s + b.threads.length, 0) },
          { id: 'community', label: 'Community', sub: 'Channels + rooms', unread: communityUnread, count: communityBuckets.reduce((s, b) => s + b.threads.length, 0) },
        ].map((v, i) => {
          const active = view === v.id;
          return (
            <button key={v.id} onClick={() => { setView(v.id); setSubId(null); }} style={{ borderRadius: t.RADIUS_SM,
              border: 0, background: active ? t.INK : 'transparent', cursor: 'pointer', padding: '14px 14px',
              color: active ? t.PAPER : t.INK,
              borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0,
              display: 'flex', alignItems: 'center', gap: 10,
              textAlign: 'left', minWidth: 0,
            }}>
              <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 20, letterSpacing: '-0.025em', lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.label}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', opacity: 0.6, fontWeight: 700, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v.sub}</span>
              </div>
              <span style={{
                flex: '0 0 auto',
                fontFamily: t.MONO, fontSize: 10, fontWeight: 700,
                letterSpacing: '0.04em',
                color: v.unread > 0 ? (active ? t.INK : t.PAPER) : (active ? t.PAPER : t.INK),
                background: v.unread > 0 ? (active ? t.PAPER : t.ACCENT) : 'transparent',
                border: v.unread > 0 ? 0 : `1px solid ${active ? 'rgba(244,237,224,0.35)' : t.RULE}`,
                padding: '2px 7px', minWidth: 22, textAlign: 'center',
              }}>{v.unread > 0 ? v.unread : String(v.count).padStart(2,'0')}</span>
            </button>
          );
        })}
      </div>

      {/* Sub-tab row — buckets within the active view */}
      <div className="bs-scroll" style={{
        display: 'flex', gap: 8, overflowX: 'auto', borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER2, position: 'sticky', top: 75, zIndex: 2,
        padding: '8px 10px',
        scrollbarWidth: 'none', msOverflowStyle: 'none',
      }}>
        {buckets.map(b => {
          const active = b.id === activeSubId;
          const u = b.threads.reduce((s, th) => s + (th.unread || 0), 0);
          // Single metric: unread badge in accent if any, else dimmed count
          const showUnread = u > 0;
          return (
            <button key={b.id} onClick={() => setSubId(b.id)} style={{ borderRadius: t.RADIUS_SM,
              flex: '1 1 0', padding: '8px 12px', cursor: 'pointer',
              background: active ? t.PAPER : 'transparent',
              border: `1px solid ${active ? t.INK : t.RULE}`,
              boxShadow: active ? `2px 2px 0 0 ${t.INK}` : 'none',
              fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
              color: active ? t.INK : t.INK50,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              whiteSpace: 'nowrap',
            }}>
              <span>{b.label}</span>
              <span style={{
                fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em',
                padding: '1px 5px', minWidth: 18, textAlign: 'center',
                background: showUnread ? t.ACCENT : (active ? t.INK : 'transparent'),
                color: showUnread ? t.PAPER : (active ? t.PAPER : t.INK50),
                border: (showUnread || active) ? 0 : `1px solid ${t.RULE}`,
              }}>{showUnread ? u : String(b.threads.length).padStart(2,'0')}</span>
            </button>
          );
        })}
      </div>

      <BSSection
        title={activeBucket?.label || ''}
        meta={totalUnread > 0 ? `${totalUnread} unread` : `${activeThreads.length} thread${activeThreads.length === 1 ? '' : 's'}`}
      />

      {/* Search — both tabs */}
      <div style={{ padding: `8px ${t.padX}px 12px` }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            border: `1px solid ${t.INK}`, padding: '8px 12px',
            background: t.PAPER, borderRadius: t.RADIUS_SM,
          }}>
            <span style={{ fontFamily: t.MONO, fontSize: 12, color: t.INK70 }}>⌕</span>
            <input
              value={chatQuery}
              onChange={(e) => setChatQuery(e.target.value)}
              placeholder={`Search ${activeBucket?.label?.toLowerCase() || (view === 'direct' ? 'people' : 'channels')}…`}
              style={{
                flex: 1, background: 'transparent', border: 0, outline: 'none',
                fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, letterSpacing: '-0.005em',
              }}
            />
            {chatQuery && (
              <button onClick={() => setChatQuery('')} style={{
                background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
                fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase',
                color: t.INK50, fontWeight: 700,
              }}>Clear</button>
            )}
          </div>
          {q && (
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
              {activeThreads.length} match{activeThreads.length === 1 ? '' : 'es'} · {rawThreads.length} total
            </div>
          )}
        </div>

      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {activeThreads.map((th, i, arr) => {
          const isGroup = th.group;
          const init = isGroup ? '#' : (th.who.match(/[A-Z]/) || ['?'])[0];
          const chipColor = bucketColor[th.bucket] || t.INK;
          return (
            <div key={i} onClick={() => setOpenThread({ view, subId: activeSubId, idx: i })} style={{
              display: 'grid', gridTemplateColumns: '40px 1fr auto',
              gap: 12, padding: `${t.rowY + 4}px 0`, cursor: 'pointer',
              borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              alignItems: 'flex-start',
            }}>
              <BSAvatar init={init} size={36} fill={chipColor} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                  {th.bucket && (
                    <span style={{
                      fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.18em',
                      padding: '2px 5px', background: chipColor, color: t.PAPER,
                    }}>{th.bucket}</span>
                  )}
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{th.who}</span>
                  {th.unread > 0 && <span style={{ width: 6, height: 6, background: t.ACCENT, borderRadius: 3 }} />}
                </div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 3, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{th.role}</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, marginTop: 6, lineHeight: 1.35, letterSpacing: '-0.005em', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{th.last}</div>
              </div>
              <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <BSEyebrow>{th.time}</BSEyebrow>
                {th.unread > 0 && (
                  <span style={{ fontFamily: t.MONO, fontSize: 9, padding: '2px 6px', background: t.ACCENT, color: t.PAPER, fontWeight: 700, letterSpacing: '0.04em' }}>{th.unread}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BSFooter right={`Pg 4 of 5 · ${view === 'direct' ? 'Direct' : 'Community'} · ${activeBucket?.label || ''}`} />
    </BSPage>
  );
}

// ─── Thread detail ───────────────────────────────────────────
function BSChatThread({ thread, eyebrow, onBack }) {
  const t = useBS();
  const [text, setText] = useStateBSC('');
  const [extras, setExtras] = useStateBSC([]);
  const allMessages = [...(thread.messages || []), ...extras];

  const send = () => {
    if (!text.trim()) return;
    setExtras(e => [...e, { who: 'You', t: text.trim(), time: 'now', me: true }]);
    setText('');
  };

  return (
    <BSPage>
      {/* Custom header with back chevron */}
      <div style={{ padding: '54px 18px 12px', borderBottom: `2px solid ${t.INK}`, background: t.PAPER, position: 'sticky', top: 0, zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            ← Back
          </button>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>{eyebrow}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <BSAvatar init={(thread.who.match(/[A-Z#]/) || ['?'])[0]} size={36} fill={thread.group ? t.INK : t.AMBER} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{thread.who}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{thread.role}</div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div style={{ padding: `16px ${t.padX}px 120px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {allMessages.map((m, i) => {
          const me = m.me;
          return (
            <div key={i} style={{
              alignSelf: me ? 'flex-end' : 'flex-start',
              maxWidth: '78%',
            }}>
              {!me && (
                <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: m.coach ? t.AMBER : t.INK50, fontWeight: 700, marginBottom: 4 }}>
                  {m.who}{m.coach ? ' · Coach' : ''}
                </div>
              )}
              <div style={{ borderRadius: t.RADIUS_SM,
                fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.4, letterSpacing: '-0.005em',
                color: me ? t.PAPER : t.INK,
                background: me ? t.INK : t.PAPER2,
                border: me ? 'none' : `1px solid ${t.RULE}`,
                padding: '10px 12px',
              }}>{m.t}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginTop: 4, textAlign: me ? 'right' : 'left' }}>{m.time}</div>
            </div>
          );
        })}
      </div>

      {/* Composer */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 80, padding: `10px ${t.padX}px`,
        background: t.PAPER, borderTop: `2px solid ${t.INK}`,
        display: 'flex', gap: 8, alignItems: 'center',
      }}>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') send(); }}
          placeholder="Compose a reply…"
          style={{ borderRadius: t.RADIUS_SM,
            flex: 1, background: t.PAPER2, border: `1px solid ${t.RULE}`, padding: '10px 12px',
            fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, outline: 'none',
            letterSpacing: '-0.005em',
          }}
        />
        <button onClick={send} style={{ borderRadius: t.RADIUS_SM,
          background: t.INK, color: t.PAPER, border: 0, padding: '10px 14px', cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
        }}>Send</button>
      </div>
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// ME — masthead profile
// ═══════════════════════════════════════════════════════════
function BSClientMe({ onProfile, onLogout }) {
  const t = useBS();
  return (
    <BSPage>
      <BSPageHeader
        kicker="Member · 14 week streak"
        title={<>Alex<br/>Rivera.</>}
        trailing={<BSAvatar init="A" size={32} fill={t.RUST} onClick={onProfile} />}
      />

      {/* SHAPE SCORE — hero number */}
      <div style={{ padding: `16px ${t.padX}px 18px`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <BSEyebrow color={t.ACCENT}>Shape Score</BSEyebrow>
          <BSEyebrow>+4 this wk · top 18%</BSEyebrow>
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 4 }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 72, fontWeight: 700, color: t.INK, letterSpacing: '-0.05em', lineHeight: 0.95 }}>78</span>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 500, color: t.INK50, letterSpacing: '-0.04em', marginBottom: 10 }}>/100</span>
        </div>

        {/* Breakdown bars — tighter */}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 5 }}>
          {[
            { k: 'TRAIN',       v: 0.88, n: 88, c: t.AMBER },
            { k: 'NUTRITION',   v: 0.74, n: 74, c: t.BLUE },
            { k: 'RECOVERY',    v: 0.62, n: 62, c: t.RUST },
            { k: 'CONSISTENCY', v: 0.92, n: 92, c: t.GREEN },
          ].map(r => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ width: 86, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', color: t.INK70, fontWeight: 600 }}>{r.k}</div>
              <div style={{ flex: 1, height: 4, background: t.HAIR, position: 'relative' }}>
                <div style={{ width: `${r.v * 100}%`, height: '100%', background: r.c }} />
              </div>
              <div style={{ width: 24, textAlign: 'right', fontFamily: t.MONO, fontSize: 11, color: t.INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{r.n}</div>
            </div>
          ))}
        </div>
      </div>

      <BSSection title="Your team" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { init: 'J', c: t.AMBER, name: 'Jordan Chen',     role: 'Coach · Hypertrophy · SF',   d: 'MSG 3' },
          { init: 'M', c: t.RUST,  name: 'Dr. Maya Patel',  role: 'Nutritionist · Consult Thu', d: '—' },
        ].map((p, i, arr) => (
          <div key={i} style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 60px', alignItems: 'center', gap: 12,
            padding: `${t.rowY + 4}px 0`, borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <BSAvatar init={p.init} fill={p.c} size={36} />
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{p.name}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{p.role}</div>
            </div>
            <BSEyebrow color={t.ACCENT}>{p.d}</BSEyebrow>
          </div>
        ))}
      </div>

      <BSSection title="Settings" />
      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {[
          { l: 'Account & billing',       r: 'Pro' },
          { l: 'Notifications',           r: 'On' },
          { l: 'Health integrations',     r: 'Apple · WHOOP' },
          { l: 'Privacy & data',          r: '' },
          { l: 'Sign out',                r: '', alert: true },
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

      <BSFooter right="Pg 5 of 5" />
    </BSPage>
  );
}

window.BSClientApp = BSClientApp;

// ═══════════════════════════════════════════════════════════
// SHARED: detail page back-header
// ═══════════════════════════════════════════════════════════
function BSDetailHeader({ onBack, eyebrow, kicker, title, trailing }) {
  const t = useBS();
  return (
    <div style={{ padding: '54px 18px 14px', borderBottom: `2px solid ${t.INK}`, background: t.PAPER, position: 'sticky', top: 0, zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
          fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>← Back</button>
        {eyebrow && <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>{eyebrow}</span>}
      </div>
      {kicker && <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 8 }}>{kicker}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 36, lineHeight: 0.95, fontWeight: 700, letterSpacing: '-0.035em', color: t.INK }}>{title}</div>
        {trailing}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PREVIEW — read-only session breakdown (before commit)
// ═══════════════════════════════════════════════════════════
const _bsCueLibrary = {
  'Pull-up':         'Dead hang at the bottom · chest to bar · 3-sec eccentric.',
  'Barbell row':     'Hip-hinge 45° · pull to lower ribs · pause 1 count.',
  'Chest-sup. row':  'Squeeze the bench, drive the elbows back · no momentum.',
  'Face pull':       'High elbows, external rotation at the end · light load.',
  'Incline curl':    'Stretch the biceps · don\'t swing · forearms vertical at top.',
  'Farmer carry':    'Tall posture · ribs stacked · breathe through the nose.',
  'Back squat':      'Brace before unrack · knees track toes · drive hips up.',
  'Walking lunge':   'Long step · back knee ½ inch off floor · push off front heel.',
  'Hack squat':      'Feet low, knees forward · 3-sec down · full range.',
  'Leg ext.':        'Pause at the top · slow 2-sec eccentric · don\'t lock out hard.',
  'Standing calf':   'Full plantarflexion · 1 count at top · stretch at bottom.',
  'Bench press':     'Set the back, set the feet · bar to lower chest · drive feet.',
  'Overhead press':  'Glutes tight · ribs down · bar overhead, biceps to ears.',
  'Incline DB press':'45° bench · DBs over chest · neutral grip if shoulder is cranky.',
  'Cable fly':       'Slight bend in elbows · stretch at the bottom · squeeze at top.',
  'Triceps push':    'Elbows pinned · forearms vertical at top · full lockout.',
  'Easy walk':       'Conversational pace · zone 2 · nasal breathing if you can.',
  '90/90 hip rotation': 'Slow & controlled · external + internal rotation each side.',
  'Cat-cow':         'Move from the spine, not the hips · 3-sec each direction.',
  'Couch stretch':   'Square the hips · ribs down · breathe into the front of the leg.',
  'Ankle dorsiflexion': 'Knee over toes, heel down · use a wall for balance.',
  'Deadlift':        'Bar mid-foot · take slack out · drive floor away with heels.',
  'Romanian DL':     'Hinge, don\'t squat · slight knee bend · feel the hamstrings.',
  'Hip thrust':      'Chin tucked · ribs down · pause 1 count at top.',
  'Leg curl':        'Slow eccentric · point toes if you want more hamstring.',
  'Reverse hyper':   'Squeeze glutes, don\'t hyperextend · slow 2-sec down.',
  'Warm-up':         'Easy zone 2 · raise heart rate, mobilize joints, no fatigue.',
  'Threshold rep':   'Hard but not max · should hate every 4th minute.',
  'Recovery jog':    'Conversational pace · let the breath settle.',
  'Cool-down':       '5 minutes easy · don\'t skip — finish what you started.',
};

function BSWorkoutPreview({ program, onBack, onStart }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const isRest = program.tag === 'REST';

  // Synthesize a quick "block" view: warmup → main → cooldown buckets.
  const blocks = isRest
    ? [{ name: 'Recovery', moves: program.moves }]
    : [
        { name: 'Warm-up',  moves: [], note: '5–8 min: light mobility, raise core temp, prime CNS.' },
        { name: 'Main set', moves: program.moves },
        { name: 'Cool-down', moves: [], note: '3–5 min: easy walk, breathe through the nose, stretch the worked muscles.' },
      ];

  // Aggregate stats
  const totalReps = program.moves.reduce((s, m) => {
    const repMatch = String(m.s).match(/(\d+)\s*×\s*(\d+)/);
    if (!repMatch) return s;
    return s + (Number(repMatch[1]) * Number(repMatch[2]));
  }, 0);

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Preview · Read-only"
        title={program.headline}
      />

      {/* Hero strip */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSHalftone height={140} accent={program.accent} pattern="dots" />
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${isRest ? 2 : 4}, 1fr)`,
        padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`,
        borderTop: `2px solid ${t.INK}`, marginTop: 18,
      }}>
        {[
          { l: 'Tag',  v: program.tag },
          { l: 'Time', v: program.meta.split('·')[0].trim() },
          ...(isRest ? [] : [
            { l: 'RPE',  v: (program.meta.split('·')[1] || '').trim() },
            { l: 'Reps', v: totalReps > 0 ? totalReps.toString() : '—' },
          ]),
        ].map((s, i) => (
          <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, color: t.INK, marginTop: 4, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Brief */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>The brief</BSEyebrow>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.4, color: t.INK, fontWeight: 500, letterSpacing: '-0.005em' }}>
          {program.copy}
        </div>
      </div>

      {/* Blocks */}
      {blocks.map((bk, bi) => (
        <React.Fragment key={bi}>
          <BSSection title={bk.name} meta={bk.moves.length > 0 ? `${bk.moves.length} move${bk.moves.length === 1 ? '' : 's'}` : 'Auxiliary'} />
          {bk.note && (
            <div style={{ padding: `0 ${t.padX}px 12px` }}>
              <div style={{
                fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.4,
                borderLeft: `2px solid ${t.INK}`, paddingLeft: 10,
              }}>{bk.note}</div>
            </div>
          )}
          {bk.moves.length > 0 && (
            <div style={{ padding: `0 ${t.padX}px` }}>
              <div style={{ borderTop: `2px solid ${t.INK}` }}>
                {bk.moves.map((m, i) => {
                  const cue = _bsCueLibrary[m.m];
                  return (
                    <div key={i} style={{ padding: '14px 0', borderBottom: i === bk.moves.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600, width: 24 }}>{m.n}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, fontWeight: 700, letterSpacing: '-0.015em' }}>{m.m}</div>
                          <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em' }}>{m.s} · {m.l}</div>
                          {cue && (
                            <div style={{ marginTop: 8, padding: '8px 10px', background: t.PAPER2, borderLeft: `2px solid ${program.accent}`,
                              fontFamily: t.DISPLAY, fontSize: 13, color: t.INK85, lineHeight: 1.35, fontStyle: 'italic',
                            }}>“{cue}”</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Coach note */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 18, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 10, fontWeight: 700 }}>
          ▍ Notes from Jordan
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 16, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
          {program.coachLine}
        </div>
      </div>

      {/* Sticky-ish CTA */}
      {!isRest && (
        <div style={{ padding: `22px ${t.padX}px 18px`, display: 'flex', gap: 8 }}>
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '14px 18px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
            fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Close</button>
          <button onClick={onStart} style={{ borderRadius: t.RADIUS_SM,
            flex: 1, padding: '14px', border: 0, background: t.INK, color: t.PAPER,
            fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Start session →</button>
        </div>
      )}

      <BSFooter right="Preview" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// SESSION — live workout, set logging, rest timer
// ═══════════════════════════════════════════════════════════
function BSSession({ moves, onBack }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const [moveIdx, setMoveIdx] = useStateBSC(0);
  const [completed, setCompleted] = useStateBSC({}); // key `${moveIdx}-${setIdx}` → true
  const [restEnd, setRestEnd] = useStateBSC(null);   // timestamp ms
  const [now, setNow] = useStateBSC(Date.now());
  const [elapsedStart] = useStateBSC(Date.now());

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const move = moves[moveIdx];
  const totalSets = moves.reduce((s, m) => s + m.sets, 0);
  const doneSets = Object.values(completed).filter(Boolean).length;
  const elapsedSec = Math.floor((now - elapsedStart) / 1000);
  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0;

  const logSet = (setIdx) => {
    const k = `${moveIdx}-${setIdx}`;
    setCompleted({ ...completed, [k]: true });
    setRestEnd(Date.now() + 90 * 1000);
  };

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`${doneSets}/${totalSets} sets · ${fmt(elapsedSec)}`}
        kicker={`Move ${move.n} of ${String(moves.length).padStart(2,'0')}`}
        title={<>{move.m}</>}
      />

      {/* Progress strip */}
      <div style={{ display: 'flex', gap: 3, padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        {moves.map((_, i) => (
          <div key={i} onClick={() => setMoveIdx(i)} style={{
            flex: 1, height: 4, cursor: 'pointer',
            background: i < moveIdx ? t.INK : i === moveIdx ? t.ACCENT : t.HAIR,
          }} />
        ))}
      </div>

      {/* Rest timer */}
      {restEnd && restLeft > 0 && (
        <div style={{ margin: `14px ${t.padX}px 0`, padding: 18, background: t.INK, color: t.PAPER, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, fontWeight: 700 }}>Rest</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 56, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>{fmt(restLeft)}</div>
          </div>
          <button onClick={() => setRestEnd(null)} style={{ borderRadius: t.RADIUS_SM,
            padding: '10px 14px', background: 'transparent', color: t.PAPER, border: `1px solid ${t.PAPER}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Skip</button>
        </div>
      )}

      {/* Current move */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 }}>
          <BSEyebrow color={t.ACCENT}>{move.sets} sets · {move.reps} reps</BSEyebrow>
          <BSEyebrow>Target: {move.l}</BSEyebrow>
        </div>
        <div style={{
          display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px',
          padding: '6px 0', borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}`,
          fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50,
        }}>
          <span>Set</span><span>Reps × load</span><span style={{ textAlign: 'right' }}>RPE</span><span style={{ textAlign: 'right' }}> </span>
        </div>
        {Array.from({ length: move.sets }).map((_, i) => {
          const k = `${moveIdx}-${i}`;
          const done = completed[k];
          return (
            <div key={i} style={{
              display: 'grid', gridTemplateColumns: '40px 1fr 80px 80px', alignItems: 'center', padding: `${t.rowY + 2}px 0`,
              borderBottom: `1px solid ${t.HAIR}`, opacity: done ? 0.55 : 1,
            }}>
              <span style={{ fontFamily: t.MONO, fontSize: 13, color: t.INK, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{String(i+1).padStart(2,'0')}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 13, color: t.INK, fontVariantNumeric: 'tabular-nums', letterSpacing: '0.04em' }}>
                {move.reps} × {move.l}
              </span>
              <span style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 11, color: t.INK70, fontWeight: 600 }}>
                {done ? `RPE ${Math.min(8, 6 + i)}` : '—'}
              </span>
              <div style={{ textAlign: 'right' }}>
                {done ? (
                  <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.GREEN, fontWeight: 700 }}>✓ Done</span>
                ) : (
                  <button onClick={() => logSet(i)} style={{ borderRadius: t.RADIUS_SM,
                    padding: '7px 10px', border: `1px solid ${t.INK}`, background: t.INK, color: t.PAPER, cursor: 'pointer',
                    fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
                  }}>Log</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Coach cue */}
      <div style={{ borderRadius: t.RADIUS_SM, margin: `18px ${t.padX}px 0`, padding: 16, background: t.PAPER2, border: `1px solid ${t.INK}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, fontWeight: 700, marginBottom: 8 }}>▍ Cue</div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, lineHeight: 1.4, letterSpacing: '-0.005em', fontStyle: 'italic' }}>
          {moveIdx === 0 ? 'Dead hang every rep. Chest to bar or it doesn\u2019t count.' :
           moveIdx === 1 ? 'Drive elbows behind ribs. Pause at sternum, two count.' :
           moveIdx === 2 ? 'Squeeze the cuffs. Feel the mid-trap, not the bicep.' :
           moveIdx === 3 ? 'Pull to forehead, not chest. Thumbs back.' :
           moveIdx === 4 ? 'Supinate hard at the top. Don\u2019t cheat the negative.' :
           'Tall posture. Carry like you mean it.'}
        </div>
      </div>

      {/* Move nav */}
      <div style={{ padding: `18px ${t.padX}px 90px`, display: 'flex', gap: 8 }}>
        <button onClick={() => setMoveIdx(Math.max(0, moveIdx - 1))} disabled={moveIdx === 0} style={{ borderRadius: t.RADIUS_SM,
          padding: '14px 18px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
          cursor: moveIdx === 0 ? 'default' : 'pointer', opacity: moveIdx === 0 ? 0.3 : 1,
        }}>← Prev</button>
        {moveIdx < moves.length - 1 ? (
          <button onClick={() => { setMoveIdx(moveIdx + 1); setRestEnd(null); }} style={{ borderRadius: t.RADIUS_SM,
            flex: 1, padding: '14px', border: 0, background: t.INK, color: t.PAPER,
            fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Next move →</button>
        ) : (
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            flex: 1, padding: '14px', border: 0, background: t.GREEN, color: t.PAPER,
            fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Finish session ✓</button>
        )}
      </div>
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// GROCERY — current week's list
// ═══════════════════════════════════════════════════════════
const BS_GROCERY_DEFAULT = {
  name: "This week's plan",
  eyebrow: 'Week 17 · Auto-built from plan',
  author: 'Dr. Maya Patel',
  note: '"Swap salmon for cod if the price jumps — keep portions the same."',
  aisles: [
    { aisle: 'Produce', items: [
      { n: 'Baby spinach',  q: '2 bags',   meals: 'Salmon bowl · snacks' },
      { n: 'Blueberries',   q: '2 pints',  meals: 'Breakfast oats' },
      { n: 'Bell peppers',  q: '4',        meals: 'Lunch bowls' },
      { n: 'Broccoli',      q: '2 heads',  meals: 'Salmon plate' },
    ]},
    { aisle: 'Protein', items: [
      { n: 'Chicken breast', q: '2.5 lb', meals: 'Lunch bowls x4' },
      { n: 'Wild salmon',    q: '1.2 lb', meals: 'Tue / Fri dinner' },
      { n: 'Eggs',           q: '12 ct',  meals: 'Breakfast' },
      { n: 'Whey isolate',   q: '— have', meals: '—', have: true },
    ]},
    { aisle: 'Pantry', items: [
      { n: 'Jasmine rice',  q: '2 lb',   meals: 'Lunch bowls' },
      { n: 'Quinoa',        q: '1 lb',   meals: 'Salmon plate' },
      { n: 'Olive oil',     q: '— have', meals: '—', have: true },
    ]},
    { aisle: 'Dairy & cold', items: [
      { n: 'Almond milk', q: '1/2 gal', meals: 'Oats · coffee' },
      { n: 'Feta',        q: '6 oz',    meals: 'Salmon plate' },
      { n: 'Greek yogurt',q: '32 oz',   meals: 'Snacks' },
    ]},
  ],
};

function BSGrocery({ onBack, onLibrary }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const list = BS_GROCERY_DEFAULT;
  const allKeys = [];
  list.aisles.forEach((a, ai) => a.items.forEach((it, ii) => allKeys.push({ k: `${ai}-${ii}`, have: !!it.have })));
  const initialChecked = new Set(allKeys.filter(x => x.have).map(x => x.k));
  const [checked, setChecked] = useStateBSC(initialChecked);

  const toggle = (k) => {
    const next = new Set(checked);
    if (next.has(k)) next.delete(k); else next.add(k);
    setChecked(next);
  };
  const total = allKeys.length;
  const done = checked.size;
  const pct = Math.round((done / total) * 100);
  const estCost = 48;
  const estLeft = Math.round(estCost * (1 - done / total));

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`${done}/${total} · $${estLeft} to go`}
        kicker={list.eyebrow}
        title={<>Grocery<br/>list.</>}
      />

      {/* Progress + author note */}
      <div style={{ padding: `16px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ height: 4, background: t.HAIR, position: 'relative', marginBottom: 10 }}>
          <div style={{ width: `${pct}%`, height: '100%', background: t.ACCENT }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>
          <span>{pct}% complete</span>
          <span>{list.aisles.length} aisles · ~22 min</span>
        </div>
        <div style={{ borderRadius: t.RADIUS_SM, marginTop: 14, padding: 14, background: t.PAPER2, border: `1px solid ${t.INK}` }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, fontWeight: 700, marginBottom: 6 }}>▍ From {list.author}</div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, fontStyle: 'italic', lineHeight: 1.4, letterSpacing: '-0.005em' }}>{list.note}</div>
        </div>
        <div style={{ marginTop: 14, display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button style={{ borderRadius: t.RADIUS_SM,
            flex: 1, padding: '12px 14px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Send to Instacart →</button>
          <button onClick={onLibrary} style={{ borderRadius: t.RADIUS_SM,
            padding: '12px 14px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Library</button>
          <button style={{ borderRadius: t.RADIUS_SM,
            padding: '12px 14px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
          }}>Save</button>
        </div>
      </div>

      {/* Aisles */}
      {list.aisles.map((aisle, ai) => {
        const aisleDone = aisle.items.filter((_, ii) => checked.has(`${ai}-${ii}`)).length;
        return (
          <div key={aisle.aisle}>
            <BSSection title={aisle.aisle} meta={`${aisleDone}/${aisle.items.length}`} />
            <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
              {aisle.items.map((it, ii, arr) => {
                const k = `${ai}-${ii}`;
                const on = checked.has(k);
                return (
                  <div key={k} onClick={() => toggle(k)} style={{
                    display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'flex-start',
                    gap: 12, padding: `${t.rowY + 2}px 0`, cursor: 'pointer',
                    borderBottom: ii === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
                    opacity: on ? 0.5 : 1,
                  }}>
                    <div style={{
                      width: 18, height: 18, border: `1.5px solid ${t.INK}`, marginTop: 2,
                      background: on ? t.INK : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: t.PAPER, fontFamily: t.MONO, fontSize: 12, fontWeight: 700,
                    }}>{on ? '✓' : ''}</div>
                    <div>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em', textDecoration: on ? 'line-through' : 'none' }}>{it.n}</div>
                      <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{it.meals}</div>
                    </div>
                    <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{it.q}</span>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <BSFooter right={`${done}/${total} items`} />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// GROCERY LIBRARY — saved templates
// ═══════════════════════════════════════════════════════════
const BS_GROCERY_LIBRARY = [
  { id: 'sun', name: 'Sunday staples',     kind: 'custom',   eyebrow: 'Custom · Updated last Sun', usedCount: 14,  preview: 'Bananas · Eggs · Oats',         count: 11 },
  { id: 'trv', name: 'Travel week',        kind: 'custom',   eyebrow: 'Custom · Airport-friendly', usedCount: 4,   preview: 'Protein bars · Jerky · Apples', count: 7 },
  { id: 'prep',name: 'Meal prep — Sunday', kind: 'custom',   eyebrow: 'Custom · Weekly',            usedCount: 22,  preview: 'Chicken thighs · Rice · Broccoli', count: 10 },
  { id: 'cut', name: 'Cutting — base cart',kind: 'template', eyebrow: 'Template · Community',       usedCount: 188, preview: 'Spinach · Lean protein · Egg whites', count: 8 },
  { id: 'blk', name: 'Bulking — base cart',kind: 'template', eyebrow: 'Template · Community',       usedCount: 412, preview: 'Oats · Rice · Peanut butter',   count: 9 },
  { id: 'mp7', name: '7-day Mediterranean',kind: 'mealplan', eyebrow: 'Meal plan · Whole-food',     usedCount: 64,  preview: 'Olive oil · Fish · Whole grains',     count: 28 },
  { id: 'mph', name: 'High-protein cut · 5d',kind: 'mealplan', eyebrow: 'Meal plan · Cutting',       usedCount: 42,  preview: 'Chicken · Greek yogurt · Eggs',       count: 20 },
  { id: 'mpp', name: 'Plant-forward build', kind: 'mealplan', eyebrow: 'Meal plan · Vegan-friendly', usedCount: 18,  preview: 'Tempeh · Lentils · Quinoa',           count: 35 },
];

function BSGroceryLibrary({ onBack }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const [filter, setFilter] = useStateBSC('all'); // all | custom | template
  const filtered = BS_GROCERY_LIBRARY.filter(l => filter === 'all' || l.kind === filter);

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`${BS_GROCERY_LIBRARY.length} lists`}
        kicker="Section · Library"
        title={<>Saved<br/>carts.</>}
      />

      {/* Filter chips */}
      <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none', msOverflowStyle: 'none' }}>
        {[['all','All'],['custom','Custom'],['template','Templates'],['mealplan','Meal Plans']].map(([k, l]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ borderRadius: t.RADIUS_SM,
            flex: '0 0 auto',
            padding: '8px 12px', border: `1px solid ${t.INK}`,
            background: filter === k ? t.INK : 'transparent',
            color: filter === k ? t.PAPER : t.INK, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
          }}>{l}</button>
        ))}
      </div>

      <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        {filtered.map((l, i, arr) => {
          const color = l.kind === 'template' ? t.AMBER : l.kind === 'mealplan' ? t.GREEN : t.ACCENT;
          return (
            <div key={l.id} style={{
              padding: `${t.rowY + 6}px 0`,
              borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
                <BSEyebrow color={color}>{l.eyebrow}</BSEyebrow>
                <BSEyebrow>{l.usedCount} uses</BSEyebrow>
              </div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', marginBottom: 4 }}>{l.name}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, letterSpacing: '0.06em', marginBottom: 10 }}>{l.count} items · {l.preview}</div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button style={{ borderRadius: t.RADIUS_SM,
                  padding: '8px 12px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                }}>Load →</button>
                <button style={{ borderRadius: t.RADIUS_SM,
                  padding: '8px 12px', background: 'transparent', color: t.INK, border: `1px solid ${t.INK}`, cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                }}>Duplicate</button>
                {l.kind === 'custom' && (
                  <button style={{ borderRadius: t.RADIUS_SM,
                    padding: '8px 12px', background: 'transparent', color: t.RUST, border: `1px solid ${t.RUST}`, cursor: 'pointer',
                    fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
                  }}>Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BSFooter right="Library" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS — full settings page from avatar tap
// ═══════════════════════════════════════════════════════════
function BSSettings({ onBack, onLogout, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const r = useBSRadio();

  // Identity editing
  const [identity, setIdentity] = useStateBSC({
    name: 'Alex Rivera',
    handle: '@alex.rivera',
    location: 'Brooklyn, NY',
    bio: 'Cutting for summer. 14-week streak. Logging the wins and the pizza.',
  });
  const [editing, setEditing] = useStateBSC(false);
  const [draft, setDraft] = useStateBSC(identity);
  const startEdit = () => { setDraft(identity); setEditing(true); };
  const saveEdit  = () => { setIdentity(draft); setEditing(false); };
  const cancelEdit = () => setEditing(false);

  // Appearance / Effects controls — render natively
  const Pill = ({ on, onClick, children, color }) => (
    <button onClick={onClick} style={{ borderRadius: t.RADIUS_SM,
      flex: 1, padding: '10px 8px', cursor: 'pointer',
      border: `1px solid ${on ? t.INK : t.RULE}`,
      background: on ? t.INK : 'transparent',
      color: on ? t.PAPER : t.INK,
      fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase',
    }}>{children}</button>
  );

  const Toggle = ({ on, onClick }) => (
    <button onClick={onClick} style={{
      width: 44, height: 24, borderRadius: 0, padding: 2, cursor: 'pointer',
      border: `1px solid ${t.INK}`, background: on ? t.ACCENT : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
    }}>
      <span style={{ width: 16, height: 16, background: on ? t.PAPER : t.INK, display: 'block' }} />
    </button>
  );

  const Swatch = ({ k, color, label }) => (
    <button onClick={() => setTweak('accentKey', k)} style={{ borderRadius: t.RADIUS_SM,
      flex: 1, padding: 8, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
      border: `1px solid ${tweaks.accentKey === k ? t.INK : t.RULE}`,
      background: tweaks.accentKey === k ? t.PAPER2 : 'transparent',
    }}>
      <span style={{ width: 28, height: 28, background: color, border: `1px solid ${t.INK}` }} />
      <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
    </button>
  );

  const sections = [
    {
      title: 'Account',
      meta: 'Pro · annual',
      rows: [
        { l: 'Email',           r: 'alex@rivera.co' },
        { l: 'Phone',           r: '+1 (415) 555-0144' },
        { l: 'Password',        r: 'Change' },
        { l: 'Two-factor auth', r: 'On' },
      ],
    },
    {
      title: 'Subscription',
      meta: 'Renews Mar 12',
      rows: [
        { l: 'Plan',           r: 'Shape Pro · $24/mo' },
        { l: 'Payment method', r: 'Visa ··· 4421' },
        { l: 'Billing history',r: '12 invoices' },
        { l: 'Cancel plan',    r: '', alert: true },
      ],
    },
    {
      title: 'Coaches',
      meta: '3 active',
      rows: [
        { l: 'Maya Okafor',     r: 'Head trainer' },
        { l: 'Rae Lindqvist',   r: 'Nutritionist' },
        { l: 'Dr. Sam Huang',   r: 'Endurance' },
        { l: 'Find a coach',    r: 'Browse' },
      ],
    },
    {
      title: 'Health integrations',
      meta: '2 connected',
      rows: [
        { l: 'Apple Health',    r: 'Connected' },
        { l: 'WHOOP',           r: 'Connected' },
        { l: 'Garmin',          r: 'Connect' },
        { l: 'Oura',            r: 'Connect' },
        { l: 'Withings',        r: 'Connect' },
      ],
    },
    {
      title: 'Notifications',
      meta: 'On',
      rows: [
        { l: 'Workout reminders', r: 'On · 30m before' },
        { l: 'Coach replies',     r: 'Push + email' },
        { l: 'Weekly digest',     r: 'Sun 7am' },
        { l: 'Community',         r: 'Off' },
      ],
    },
    {
      title: 'Preferences',
      meta: '',
      rows: [
        { l: 'Units',           r: 'Imperial · lb / mi' },
        { l: 'Week starts',     r: 'Monday' },
        { l: 'Time zone',       r: 'America/Los_Angeles' },
        { l: 'Language',        r: 'English (US)' },
      ],
    },
    {
      title: 'Privacy & data',
      meta: '',
      rows: [
        { l: 'Profile visibility', r: 'Coaches only' },
        { l: 'Share workout data', r: 'On' },
        { l: 'Export my data',     r: 'Request' },
        { l: 'Delete account',     r: '', alert: true },
      ],
    },
    {
      title: 'About',
      meta: 'v6.38.2',
      rows: [
        { l: 'Help center',     r: 'Visit' },
        { l: 'Contact support', r: '24h reply' },
        { l: 'Terms of service',r: '' },
        { l: 'Privacy policy',  r: '' },
        { l: 'Open-source',     r: '' },
      ],
    },
  ];

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Member · Pro"
        kicker="Section · Settings"
        title={<>Your<br/>account.</>}
        trailing={<BSAvatar init="A" size={36} fill={t.RUST} />}
      />

      {/* Identity card */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        {!editing ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <BSAvatar init={identity.name.charAt(0)} size={56} fill={t.RUST} />
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{identity.name}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginTop: 4 }}>{identity.handle} · {identity.location}</div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, marginTop: 6, lineHeight: 1.35, fontWeight: 500 }}>{identity.bio}</div>
            </div>
            <button onClick={startEdit} style={{ borderRadius: t.RADIUS_SM,
              padding: '8px 12px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
            }}>Edit</button>
          </div>
        ) : (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
              <BSAvatar init={(draft.name || 'A').charAt(0)} size={56} fill={t.RUST} />
              <button style={{ borderRadius: t.RADIUS_SM,
                padding: '8px 12px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer',
                fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 700,
              }}>Change photo</button>
            </div>
            {[
              { k: 'name',     label: 'Display name' },
              { k: 'handle',   label: 'Handle' },
              { k: 'location', label: 'Location' },
            ].map(f => (
              <label key={f.k} style={{ display: 'block', marginBottom: 12 }}>
                <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>{f.label}</span>
                <input
                  value={draft[f.k]}
                  onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })}
                  style={{ borderRadius: t.RADIUS_SM,
                    width: '100%', padding: '10px 12px', border: `1px solid ${t.INK}`, background: t.PAPER,
                    fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: t.INK, letterSpacing: '-0.01em', outline: 'none',
                  }}
                />
              </label>
            ))}
            <label style={{ display: 'block', marginBottom: 14 }}>
              <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>Bio</span>
              <textarea
                value={draft.bio}
                onChange={(e) => setDraft({ ...draft, bio: e.target.value })}
                rows={3}
                style={{ borderRadius: t.RADIUS_SM,
                  width: '100%', padding: '10px 12px', border: `1px solid ${t.INK}`, background: t.PAPER,
                  fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK, letterSpacing: '-0.01em', outline: 'none', resize: 'vertical',
                }}
              />
            </label>
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={cancelEdit} style={{ borderRadius: t.RADIUS_SM,
                flex: 1, padding: '12px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer',
                fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
              }}>Cancel</button>
              <button onClick={saveEdit} style={{ borderRadius: t.RADIUS_SM,
                flex: 1, padding: '12px', border: `1px solid ${t.INK}`, background: t.INK, color: t.PAPER, cursor: 'pointer',
                fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
              }}>Save changes</button>
            </div>
          </div>
        )}
      </div>

      {/* PROFILE MODE — switch between Client / Trainer / Nutritionist views */}
      <BSSection
        title="Profile mode"
        meta={(tweaks.role || 'client') === 'client' ? 'Client view' : (tweaks.role === 'trainer' ? 'Trainer view' : 'Nutritionist view')}
      />
      <div style={{ padding: `14px ${t.padX}px 18px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8, fontWeight: 700 }}>
          Active profile
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Pill on={(tweaks.role || 'client') === 'client'}       onClick={() => setTweak('role', 'client')}>Client</Pill>
          <Pill on={tweaks.role === 'trainer'}                    onClick={() => setTweak('role', 'trainer')}>Trainer</Pill>
          <Pill on={tweaks.role === 'nutritionist'}               onClick={() => setTweak('role', 'nutritionist')}>Nutrition</Pill>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.45 }}>
          Switching view loads the matching home, calendar &amp; tools.
        </div>
      </div>

      {/* APPEARANCE */}
      <BSSection title="Appearance" meta={`${({light:'Cream',dark:'Black',teal:'Teal',manila:'Manila',blueprint:'Blueprint',carbon:'Carbon',steel:'Steel',bone:'Bone',oxblood:'Oxblood'})[tweaks.paperMode] || 'Cream'} · ${tweaks.accentKey || 'blue'}`} />
      <div style={{ padding: `14px ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8, fontWeight: 700 }}>Paper</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['light','Cream'],['dark','Black'],['teal','Teal'],['manila','Manila'],['blueprint','Blueprint'],['carbon','Carbon'],['steel','Steel'],['bone','Bone'],['oxblood','Oxblood']].map(([k,l]) => (
            <Pill key={k} on={tweaks.paperMode === k} onClick={() => setTweak('paperMode', k)}>{l}</Pill>
          ))}
        </div>

        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginTop: 18, marginBottom: 8, fontWeight: 700 }}>Texture</div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['none','None'],['newsprint','Newsprint'],['ledger','Ledger'],
            ['grid','Grid'],['dotgrid','Dot grid'],['foxed','Foxed'],
            ['vignette','Vignette'],['watermark','Watermark'],
            ['linen','Linen'],['crosshatch','Crosshatch'],['pinstripe','Pinstripe'],
            ['halftone','Halftone'],['kraft','Kraft'],['blueprint','Blueprint'],
            ['graph','Graph'],['stains','Stains'],['cardboard','Cardboard'],
            ['concrete','Concrete'],['risograph','Risograph'],['parchment','Parchment'],
            ['dotmap','Dot map'],
          ].map(([k,l]) => (
            <Pill key={k} on={(tweaks.textureKey || 'none') === k} onClick={() => setTweak('textureKey', k)}>{l}</Pill>
          ))}
        </div>

        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginTop: 18, marginBottom: 8, fontWeight: 700 }}>Accent color</div>
        <div style={{ display: 'flex', gap: 6 }}>
          <Swatch k="blue"  color="#1e7ad6" label="Blue" />
          <Swatch k="amber" color="#d99033" label="Amber" />
          <Swatch k="rust"  color="#b83d2c" label="Rust" />
          <Swatch k="green" color="#2f7d4f" label="Green" />
          <Swatch k="teal"  color="#0a8f87" label="Teal" />
          <Swatch k="white" color="#ffffff" label="White" />
          <Swatch k="black" color="#000000" label="Black" />
        </div>

        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginTop: 18, marginBottom: 8, fontWeight: 700 }}>Ink color <span style={{ color: t.INK30, marginLeft: 6, letterSpacing: '0.16em' }}>· text</span></div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            ['default', null,        'Default'],
            ['#0f0e0c', '#0f0e0c',   'Charcoal'],
            ['#f5f0e6', '#f5f0e6',   'Cream'],
            ['#1c4ed8', '#1c4ed8',   'Blue'],
            ['#a8331b', '#a8331b',   'Rust'],
            ['#2f6b3a', '#2f6b3a',   'Green'],
            ['#c8881a', '#c8881a',   'Amber'],
            ['#5a2b8a', '#5a2b8a',   'Plum'],
          ].map(([k, sw, lbl]) => {
            const on = (tweaks.inkOverride || 'default') === k;
            return (
              <button
                key={k}
                onClick={() => setTweak('inkOverride', k)}
                title={lbl}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: t.RADIUS_SM,
                  border: `1px solid ${on ? t.INK : t.RULE}`,
                  background: on ? t.INK : 'transparent',
                  color: on ? t.PAPER : t.INK,
                  fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                {sw ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: sw, border: `1px solid ${on ? t.PAPER : t.RULE}` }} /> : null}
                {lbl}
              </button>
            );
          })}
          {/* Custom hex picker */}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px 4px 4px', borderRadius: t.RADIUS_SM,
            border: `1px solid ${t.RULE}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK,
          }}>
            <input
              type="color"
              value={(tweaks.inkOverride && tweaks.inkOverride !== 'default') ? tweaks.inkOverride : (t.isLight ? '#0f0e0c' : '#f5f0e6')}
              onChange={(e) => setTweak('inkOverride', e.target.value)}
              style={{ width: 22, height: 22, border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}
            />
            Custom
          </label>
        </div>

        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginTop: 18, marginBottom: 8, fontWeight: 700 }}>Display weight</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['regular','bold'].map(k => (
            <Pill key={k} on={tweaks.weightKey === k} onClick={() => setTweak('weightKey', k)}>{k}</Pill>
          ))}
        </div>

      </div>

      {/* LIGHT EFFECTS — music-reactive overlays while Shape Radio is on */}
      <BSSection
        title="Light effects"
        meta={r.radioOn ? `Active · ${r.fxMode}` : 'Radio off — preview only'}
      />
      <div style={{ padding: `14px ${t.padX}px 18px`, borderTop: `2px solid ${t.INK}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 10, fontWeight: 700 }}>
          Reactive overlay · syncs to BPM
        </div>

        {/* 2×2 grid of mode cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          {[
            { k: 'off',       glyph: '○',  title: 'Off',       sub: 'Clean · no animation' },
            { k: 'subtle',    glyph: '◐',  title: 'Subtle',    sub: 'Edge glow · island EQ' },
            { k: 'immersive', glyph: '◉',  title: 'Immersive', sub: 'Bg bloom · button halos' },
            { k: 'hologram',  glyph: '⟠',  title: 'Hologram',  sub: 'DJ overlay · scanlines' },
          ].map(m => {
            const active = r.fxMode === m.k;
            return (
              <button
                key={m.k}
                onClick={() => r.setFxMode(m.k)}
                style={{ borderRadius: t.RADIUS_SM,
                  textAlign: 'left', cursor: 'pointer', padding: '12px 12px 14px',
                  border: `1px solid ${active ? t.INK : t.RULE}`,
                  background: active ? t.PAPER2 : 'transparent',
                  display: 'flex', flexDirection: 'column', gap: 4,
                  borderLeft: active ? `4px solid ${t.ACCENT}` : `1px solid ${t.RULE}`,
                  paddingLeft: active ? 9 : 12,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 16, color: t.INK }}>{m.glyph}</span>
                  {active && (
                    <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ACCENT }}>● ON</span>
                  )}
                </div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', marginTop: 2 }}>
                  {m.title}
                </div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 11.5, color: t.INK70, fontWeight: 500, lineHeight: 1.3 }}>
                  {m.sub}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, lineHeight: 1.5 }}>
          {r.radioOn
            ? '— effects render on top of every screen while radio plays'
            : '— turn on Shape Radio from Home to see the effect'}
        </div>
      </div>

      {sections.map(sec => (
        <div key={sec.title}>
          <BSSection title={sec.title} meta={sec.meta} />
          <div style={{ padding: `0 ${t.padX}px`, borderTop: `2px solid ${t.INK}` }}>
            {sec.rows.map((s, i, arr) => (
              <div key={i} onClick={s.alert && s.l === 'Sign out' ? onLogout : undefined} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: `${t.rowY + 4}px 0`,
                borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
                cursor: s.alert ? 'pointer' : 'default',
              }}>
                <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: s.alert ? t.RUST : t.INK, letterSpacing: '-0.01em' }}>{s.l}</span>
                {s.r && <BSEyebrow>{s.r}</BSEyebrow>}
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Sign out */}
      <div style={{ padding: `22px ${t.padX}px 0` }}>
        <button onClick={onLogout} style={{ borderRadius: t.RADIUS_SM,
          width: '100%', padding: '14px', background: 'transparent', color: t.RUST, border: `1px solid ${t.RUST}`, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
        }}>Sign out</button>
      </div>

      <BSFooter right="Settings" />
    </BSPage>
  );
}


Object.assign(window, { BSClientApp, BSClientChat, BSSettings, BSDetailHeader });
