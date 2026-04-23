// Client iOS app — editorial rebuild
// Tabs: Home · Discover · Train · Eat · Me
// North star: Shape "Today's plan" + "Pull day" references — Fraunces titles,
// JetBrains Mono labels, slash-delimited macros, numbered tracklist rows,
// teal accent on the NEXT action, attribution chips for coach-authored content.

const { useState: useStateC } = React;

// ───────────────────────────────────────────────────────────
// Inject type family imports once.
// ───────────────────────────────────────────────────────────
(function injectFonts() {
  if (document.getElementById('shape-fonts')) return;
  const link = document.createElement('link');
  link.id = 'shape-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,400;0,9..144,500;0,9..144,600;1,9..144,400;1,9..144,500;1,9..144,600&family=Space+Grotesk:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap';
  document.head.appendChild(link);
})();

// ───────────────────────────────────────────────────────────
// Root
// ───────────────────────────────────────────────────────────
function ClientApp({ dark, onLogout, radioOn, setRadioOn }) {
  const [tab, setTab] = useStateC('home');
  const [grocery, setGrocery] = useStateC(false);
  const [discover, setDiscover] = useStateC(false);
  const [radio, setRadio] = useStateC(false);
  const [profile, setProfile] = useStateC(false);
  const [workout, setWorkout] = useStateC(false);
  const [previewWk, setPreviewWk] = useStateC(null); // { title, meta, moves, when }
  const [logMeal, setLogMeal] = useStateC(null); // { title, time, label, kcal, p, c, f }
  const [fxMode, setFxMode] = useStateC('subtle'); // 'off' | 'subtle' | 'immersive' | 'hologram'
  if (workout) return <ActiveWorkout onBack={() => setWorkout(false)} />;
  if (logMeal) return <LogMealSheet meal={logMeal} onBack={() => setLogMeal(null)} />;
  if (previewWk) return <PreviewSheet item={previewWk} onBack={() => setPreviewWk(null)} onStart={previewWk.today ? () => { setPreviewWk(null); setWorkout(true); } : null} />;
  if (grocery) return <GroceryList onBack={() => setGrocery(false)} />;
  if (radio) return <RadioScreen onBack={() => setRadio(false)} />;
  if (profile) return <ProfileSheet
    onBack={() => setProfile(false)}
    onLogout={onLogout}
    radioOn={radioOn}
    setRadioOn={setRadioOn}
    fxMode={fxMode}
    setFxMode={setFxMode}
  />;
  if (discover) return <div style={{ position: 'absolute', inset: 0 }}>
    <ClientDiscover onBack={() => setDiscover(false)} />
  </div>;
  const openGrocery = () => setGrocery(true);
  const openDiscover = () => setDiscover(true);
  const openRadio = () => setRadio(true);
  const openProfile = () => setProfile(true);
  const openWorkout = () => setWorkout(true);
  const openPreview = (wk) => setPreviewWk(wk);
  const openLogMeal = (m) => setLogMeal(m);
  const goCommunity = () => setTab('community');
  const screens = {
    home:      <ClientHome onCommunity={goCommunity} onGrocery={openGrocery} onDiscover={openDiscover} onRadio={openRadio} onProfile={openProfile} onWorkout={openWorkout} onPreview={openPreview} onLogMeal={openLogMeal} radioOn={radioOn} setRadioOn={setRadioOn} />,
    discover:  <ClientDiscover />,
    train:     <ClientTrain onRadio={openRadio} onWorkout={openWorkout} onPreview={openPreview} />,
    eat:       <ClientEat onGrocery={openGrocery} onRadio={openRadio} />,
    community: <CommunityChat role="client" embedded />,
    me:        <ClientMe onLogout={onLogout} onCommunity={goCommunity} onDiscover={openDiscover} />,
  };

  // Effects render ONLY when Radio is on
  const showFx = radioOn && fxMode !== 'off';

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {showFx && <RadioEffects mode={fxMode} label="HEAVY DAY · 132 BPM" />}
      {screens[tab]}
      <TabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'home',      icon: 'house',     label: 'Home' },
          { key: 'train',     icon: 'dumbbell',  label: 'Train',     fillActive: false },
          { key: 'eat',       icon: 'apple',     label: 'Eat',       fillActive: false },
          { key: 'community', icon: 'bubble',    label: 'Chat',      fillActive: false },
          { key: 'me',        icon: 'person',    label: 'Me' },
        ]}
      />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME — "Today's plan"
// ═══════════════════════════════════════════════════════════
function ClientHome({ onCommunity, onGrocery, onDiscover, onRadio, onProfile, onWorkout, onPreview, onLogMeal, radioOn = true, setRadioOn = () => {} }) {
  const [view, setView] = useStateC('today'); // 'today' | 'week' | 'month'
  const heroes = {
    today: { eyebrow: 'Week 6 · Cut',       title: <>Today's<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>plan.</em></>,  date: 'Tue · Apr 21 · Day 38 of 84' },
    week:  { eyebrow: 'Week 6 · Cut',       title: <>Week's<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>plan.</em></>,   date: 'Apr 17 – Apr 23 · Days 34–40' },
    month: { eyebrow: 'Block 2 · 12-wk cut', title: <>Month's<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>plan.</em></>,  date: 'April 2026 · Days 1–30 of 84' },
  };
  const h = heroes[view];
  return (
    <Screen>
      <NavBar
        eyebrow={h.eyebrow}
        title={h.title}
        trailing={<button onClick={onProfile} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer' }}><AvatarChip init="A" color={CORAL} size={36} /></button>}
      />

      {/* Date */}
      <div style={{ padding: '0 24px 14px' }}>
        <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_45, textTransform: 'uppercase' }}>
          {h.date}
        </div>
      </div>

      {/* Segmented — Today / Week */}
      <div style={{ padding: '0 24px 14px' }}>
        <div style={{
          display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4,
          padding: 3, borderRadius: 14, border: `1px solid ${HAIR}`,
          background: 'rgba(242,237,228,0.025)',
        }}>
          {[
            { k: 'today', l: 'Today' },
            { k: 'week',  l: 'Week' },
            { k: 'month', l: 'Month' },
          ].map(s => {
            const on = view === s.k;
            return (
              <button key={s.k} onClick={() => setView(s.k)} style={{
                border: 0, cursor: 'pointer',
                padding: '9px 10px', borderRadius: 11,
                background: on ? TEAL : 'transparent',
                color: on ? PAPER : INK,
                fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase',
              }}>{s.l}</button>
            );
          })}
        </div>
      </div>

      {view === 'today' && <TodayView radioOn={radioOn} setRadioOn={setRadioOn} onRadio={onRadio} onWorkout={onWorkout} onPreview={onPreview} onLogMeal={onLogMeal} />}
      {view === 'week'  && <WeekView onWorkout={onWorkout} onPreview={onPreview} />}
      {view === 'month' && <MonthView onWorkout={onWorkout} onPreview={onPreview} />}

      <div style={{ height: 16 }} />
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════
// TODAY — expanded: workouts + meals + check-ins + consultations
// ═══════════════════════════════════════════════════════════
function TodayView({ radioOn, setRadioOn, onRadio, onWorkout, onPreview, onLogMeal }) {
  return (
    <>
      {/* Macros */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <MacroChip label="Cal" v="1568" t="2100" color={TEAL} pct={0.74} />
        <MacroChip label="Pro" v="118" t="165" color={CORAL} pct={0.72} />
        <MacroChip label="Water" v="1.6" t="3.0" unit="L" color="#5ac8fa" pct={0.53} />
      </div>

      {/* HERO Next up */}
      <div style={{ padding: '22px 24px 0' }}>
        <EdCard active pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <MLabel color={TEAL}>Next up · 12:40 pm</MLabel>
            <MLabel>Lunch</MLabel>
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.025em', color: INK }}>
            Chicken bowl <em style={{ fontStyle: 'italic', color: TEAL }}>+ rice.</em>
          </div>
          <div style={{ marginTop: 8 }}>
            <MStats items={['620 kcal', '48P', '72C', '14F']} />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}>
            <Attribution init="M" color={GOLD} name="Dr. Maya Patel" role="Nutritionist" />
            <Pill solid onClick={() => onLogMeal && onLogMeal({
              title: 'Chicken bowl + rice',
              label: 'Lunch',
              time: '12:40 PM',
              kcal: 620, p: 48, c: 72, f: 14,
              ingredients: [
                { n: 'Grilled chicken breast', q: '6 oz',    kcal: 280, p: 52, c: 0,  f: 6  },
                { n: 'Jasmine rice',           q: '1 cup',   kcal: 205, p: 4,  c: 45, f: 0.5 },
                { n: 'Charred broccoli',       q: '1 cup',   kcal: 55,  p: 4,  c: 11, f: 1  },
                { n: 'Avocado',                q: '½',       kcal: 120, p: 2,  c: 6,  f: 11 },
                { n: 'Tahini sauce',           q: '2 tbsp',  kcal: 90,  p: 3,  c: 3,  f: 8  },
              ],
            })}>Log now →</Pill>
          </div>
        </EdCard>
      </div>

      {/* Tomorrow's workout preview */}
      <SectionHeader eyebrow="Tomorrow · 9 am" title="Upper Pull — Peak" action="Plan" />
      <div style={{ padding: '0 24px' }}>
        <WorkoutPreview
          title="Upper Pull — Peak"
          meta="52 min · 6 moves · RPE 8 · ~420 kcal"
          coachInit="J" coachColor={CORAL} coachName="Jordan Chen" coachRole="Coach"
          moves={[
            { t: 'Pull-up',        s: '4 × 6-8 · 3 min',  d: '42 lb +' },
            { t: 'Barbell row',    s: '4 × 8 · 2 min',    d: '155 lb'  },
            { t: 'Chest-sup. row', s: '3 × 10 · 90s',     d: '60 lb'   },
            { t: '+ 3 more',       s: 'Face pull · curl · carry', d: '' },
          ]}
          onPreview={onPreview ? () => onPreview({
            kind: 'workout',
            title: 'Upper Pull — Peak',
            when: 'Tomorrow · Wed Apr 22 · 9:00 AM',
            meta: '52 min · 6 moves · RPE 8 · ~420 kcal',
            coach: { init: 'J', color: CORAL, name: 'Jordan Chen', role: 'Coach' },
            note: "Peak week — tempo matters more than load. 3s eccentric on every pull. If bar speed drops, drop a rep, not the tempo.",
            moves: [
              { t: 'Pull-up',        s: '4 × 6-8 · 3 min rest',  d: '42 lb +',  cue: 'Dead hang. Chest to bar.' },
              { t: 'Barbell row',    s: '4 × 8 · 2 min rest',    d: '155 lb',   cue: 'Hinge 45°, pull to sternum.' },
              { t: 'Chest-sup. row', s: '3 × 10 · 90s rest',     d: '60 lb',    cue: 'Pause 1s at peak contraction.' },
              { t: 'Face pull',      s: '3 × 15 · 60s rest',     d: '35 lb',    cue: 'External rotation at the top.' },
              { t: 'Incline curl',   s: '3 × 12 · 60s rest',     d: '27.5 lb',  cue: 'Full stretch. 3s eccentric.' },
              { t: 'Farmer carry',   s: '3 × 40m · 60s rest',    d: '80 lb',    cue: 'Crush grip. Ribs down.' },
            ],
          }) : undefined}
        />
      </div>

      {/* Agenda — mixed event tracklist */}
      <SectionHeader eyebrow="Tracklist" title="Today" action="Edit" />
      <div style={{ padding: '0 24px' }}>
        <EventRow n={1} state="done" kind="meal"    title="Oats, berries, whey"  sub="412 kcal · 32P / 58C / 8F" detail="7:20 AM" />
        <EventRow n={2} state="done" kind="workout" title="Upper Push — Peak"    sub="52 min · w/ Jordan · RPE 8"  detail="9:05 AM" />
        <EventRow n={3} state="done" kind="checkin" title="Morning check-in"     sub="Sleep 7h · energy 8/10 · logged" detail="9:45 AM" />
        <EventRow n={4} state="next" kind="meal"    title="Chicken bowl + rice"  sub="620 kcal · 48P / 72C / 14F" detail="12:40 PM" />
        <EventRow n={5} kind="consult"               title="Nutrition consult"    sub="30 min · Dr. Maya Patel · Zoom" detail="3:00 PM" />
        <EventRow n={6} kind="meal"                  title="Greek yogurt + almonds" sub="280 kcal · 22P / 18C / 12F" detail="4:00 PM" />
        <EventRow n={7} kind="checkin"               title="Evening check-in w/ Jordan" sub="RPE recap · soreness · mood" detail="6:30 PM" />
        <EventRow n={8} kind="meal"                  title="Salmon, quinoa, greens" sub="580 kcal · 44P / 48C / 22F" detail="7:30 PM" last />
      </div>

      {/* COACH CORNER */}
      <SectionHeader eyebrow="From your team" title="This week's note" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={18}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 19, lineHeight: 1.3, letterSpacing: '-0.01em', color: INK }}>
            "You're 3 weeks in. The tempo is the point — slow eccentric on every press.
            Log your sleep, it's the lever."
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution init="J" color={CORAL} name="Jordan Chen" role="Coach" />
            <MLabel>Mon</MLabel>
          </div>
        </EdCard>
      </div>

      {/* SHAPE RADIO — live mini player */}
      <div style={{ padding: '22px 24px 0' }}>
        <div onClick={onRadio} style={{
          borderRadius: 18, padding: '16px 16px 14px', cursor: 'pointer',
          border: `1px solid ${radioOn ? TEAL + '44' : HAIR}`,
          background: radioOn
            ? `linear-gradient(135deg, rgba(30,192,168,0.12), rgba(30,192,168,0.02))`
            : 'transparent',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 56, height: 56, borderRadius: 12, flexShrink: 0,
            background: radioOn
              ? `linear-gradient(135deg, ${TEAL}, #14806f)`
              : `linear-gradient(135deg, rgba(242,237,228,0.08), rgba(242,237,228,0.02))`,
            border: radioOn ? 0 : `1px solid ${HAIR}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 20 }}>
              {[0, 1, 2, 3, 4].map(i => (
                <div key={i} style={{
                  width: 3,
                  height: radioOn ? 10 : (i === 2 ? 14 : 8),
                  background: radioOn ? PAPER : INK_45,
                  borderRadius: 1,
                  animation: radioOn ? `home-bar-${i} 1.${i + 2}s ease-in-out infinite` : 'none',
                  opacity: radioOn ? 1 : 0.5,
                }} />
              ))}
            </div>
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: radioOn ? TEAL : INK_45,
              textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
            }}>
              {radioOn && (
                <span style={{
                  width: 6, height: 6, borderRadius: 3, background: TEAL,
                  animation: 'home-radio-pulse 1.4s ease-in-out infinite',
                }} />
              )}
              {radioOn ? 'Shape Radio · Live' : 'Shape Radio · Muted'}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: '-0.02em', color: INK, marginTop: 5, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {radioOn ? 'Roots of the Machine' : 'Tap to start listening'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 3, letterSpacing: '0.06em' }}>
              {radioOn ? 'MERIT · 132 BPM · 3,472 ON' : 'AD-FREE · FREE WITH SHAPE'}
            </div>
          </div>

          <button onClick={(e) => { e.stopPropagation(); setRadioOn(!radioOn); }} style={{
            width: 44, height: 44, borderRadius: 22, border: radioOn ? 0 : `1px solid ${HAIR}`, cursor: 'pointer',
            background: radioOn ? TEAL : 'transparent',
            color: radioOn ? PAPER : INK, flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, boxShadow: radioOn ? `0 6px 18px ${TEAL}44` : 'none',
          }}>{radioOn ? '❚❚' : '▶'}</button>
        </div>
        <style>{`
          @keyframes home-radio-pulse {0%, 100% { opacity: 1; } 50% { opacity: 0.3; }}
          @keyframes home-bar-0 {0%, 100% { height: 10px; } 50% { height: 20px; }}
          @keyframes home-bar-1 {0%, 100% { height: 16px; } 50% { height: 6px; }}
          @keyframes home-bar-2 {0%, 100% { height: 8px; } 50% { height: 18px; }}
          @keyframes home-bar-3 {0%, 100% { height: 14px; } 50% { height: 5px; }}
          @keyframes home-bar-4 {0%, 100% { height: 6px; } 50% { height: 16px; }}
        `}</style>
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// WEEK — 7-day strip with event dots + day agenda
// ═══════════════════════════════════════════════════════════
function WeekView({ onWorkout, onPreview }) {
  const days = [
    { n: 'M', d: 17, k: [] },
    { n: 'T', d: 18, k: ['workout', 'meal'] },
    { n: 'W', d: 19, k: ['workout', 'meal', 'checkin'] },
    { n: 'T', d: 20, k: ['meal', 'consult'] },
    { n: 'F', d: 21, k: ['workout', 'meal', 'checkin', 'consult'], today: true },
    { n: 'S', d: 22, k: ['workout', 'meal'] },
    { n: 'S', d: 23, k: ['meal'] },
  ];
  const [sel, setSel] = useStateC(4); // Friday = today
  const d = days[sel];

  // Agendas per day (illustrative)
  const agendas = [
    [ { k: 'meal', t: 'Rest day · open meals', s: 'Flex day · no sessions', d: 'All day' } ],
    [ { k: 'workout', t: 'Lower Pull', s: '48 min · Jordan', d: '8:30 AM' },
      { k: 'meal', t: '3 meals logged', s: '1980 kcal · 152P', d: 'All day' } ],
    [ { k: 'workout', t: 'Upper Push', s: '52 min · Jordan · RPE 8', d: '9:00 AM' },
      { k: 'checkin', t: 'Weekly weigh-in', s: 'Photos + tape', d: '7:30 AM' },
      { k: 'meal', t: '4 meals logged', s: '2040 kcal · 162P', d: 'All day' } ],
    [ { k: 'consult', t: 'Nutrition consult', s: '30 min · Dr. Maya', d: '11:00 AM' },
      { k: 'meal', t: '4 meals logged', s: '1910 kcal · 148P', d: 'All day' } ],
    [ { k: 'workout', t: 'Upper Push — Peak', s: '52 min · Jordan · RPE 8', d: '9:05 AM' },
      { k: 'checkin', t: 'Morning check-in', s: 'Sleep · energy · mood', d: '9:45 AM' },
      { k: 'consult', t: 'Nutrition consult', s: '30 min · Dr. Maya · Zoom', d: '3:00 PM' },
      { k: 'checkin', t: 'Evening check-in', s: 'RPE recap w/ Jordan', d: '6:30 PM' },
      { k: 'meal', t: '5 meals planned', s: '2100 kcal · 165P', d: 'All day' } ],
    [ { k: 'workout', t: 'Long run', s: '65 min · Z2', d: '8:00 AM' },
      { k: 'meal', t: '4 meals planned', s: '2200 kcal · 155P', d: 'All day' } ],
    [ { k: 'meal', t: 'Rest · 3 meals', s: 'Refeed day · +300 kcal', d: 'All day' } ],
  ];
  const dayAgenda = agendas[sel] || [];

  // Workout + food previews per day (optional)
  const weekWorkouts = [
    null,
    { title: 'Lower Pull',       meta: '48 min · 6 moves · RPE 7', moves: [
        { t: 'Deadlift',  s: '4 × 5 · 3 min', d: '275 lb' },
        { t: 'RDL',       s: '3 × 8 · 2 min', d: '185 lb' },
        { t: 'Hip thrust',s: '3 × 10 · 90s',  d: '205 lb' },
        { t: '+ 3 more',  s: 'Ham curl · calf · core', d: '' },
    ] },
    { title: 'Upper Push',       meta: '52 min · 6 moves · RPE 8', moves: [
        { t: 'Bench press', s: '5 × 5 · 3 min', d: '185 lb' },
        { t: 'OHP',         s: '4 × 6 · 2 min', d: '115 lb' },
        { t: 'Dip',         s: '3 × 8 · 90s',   d: 'BW +25' },
        { t: '+ 3 more',    s: 'Fly · lateral · push-up', d: '' },
    ] },
    null,
    { title: 'Upper Pull — Peak', meta: '52 min · 6 moves · RPE 8', moves: [
        { t: 'Pull-up',        s: '4 × 6-8 · 3 min', d: '42 lb +' },
        { t: 'Barbell row',    s: '4 × 8 · 2 min',   d: '155 lb'  },
        { t: 'Chest-sup. row', s: '3 × 10 · 90s',    d: '60 lb'   },
        { t: '+ 3 more',       s: 'Face pull · curl · carry', d: '' },
    ] },
    { title: 'Long run',         meta: '65 min · Zone 2 · Prospect loop', moves: [
        { t: 'Warm-up',   s: '10 min · Z1', d: '' },
        { t: 'Main',      s: '45 min · Z2 · <152 bpm', d: '' },
        { t: 'Cool-down', s: '10 min · Z1 + mobility', d: '' },
    ] },
    null,
  ];
  const weekFood = [
    { kcal: '1800', pro: '140', hero: 'Refeed · pizza night', note: 'Flex day · no macros', count: 3 },
    { kcal: '1980', pro: '152', hero: 'Tempeh stir-fry + jasmine rice', note: '3 meals logged', count: 3 },
    { kcal: '2040', pro: '162', hero: 'Steak + sweet potato', note: '4 meals logged', count: 4 },
    { kcal: '1910', pro: '148', hero: 'Salmon poke bowl', note: '4 meals logged', count: 4 },
    { kcal: '2100', pro: '165', hero: 'Chicken bowl + rice', note: '5 meals planned', count: 5 },
    { kcal: '2200', pro: '155', hero: 'Pasta puttanesca', note: '4 meals planned', count: 4 },
    { kcal: '1900', pro: '130', hero: 'Rest day roast', note: 'Refeed · +300 kcal', count: 3 },
  ];
  const wk = weekWorkouts[sel];
  const fd = weekFood[sel];

  return (
    <>
      {/* Week header */}
      <div style={{ padding: '0 24px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK }}>
          Apr <em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>17–23</em>
        </div>
        <MLabel>W6 · Cut</MLabel>
      </div>

      {/* 7-day strip */}
      <div style={{ padding: '0 16px 6px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 6 }}>
        {days.map((day, i) => {
          const on = sel === i;
          return (
            <button key={i} onClick={() => setSel(i)} style={{
              border: `1px solid ${on ? TEAL : (day.today ? TEAL + '55' : HAIR)}`,
              background: on ? 'rgba(30,192,168,0.10)' : 'rgba(242,237,228,0.025)',
              borderRadius: 12, padding: '10px 4px 8px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: on ? TEAL : INK_45, textTransform: 'uppercase' }}>{day.n}</span>
              <span style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: on ? TEAL : INK }}>{day.d}</span>
              <div style={{ display: 'flex', gap: 2, height: 5 }}>
                {day.k.slice(0, 4).map((k, j) => (
                  <span key={j} style={{ width: 4, height: 4, borderRadius: 2, background: kindColor(k) }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Day summary strip */}
      <div style={{ padding: '14px 24px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color: INK }}>
          {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][sel]} · <em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>Apr {d.d}</em>
          {d.today && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: TEAL, textTransform: 'uppercase', marginLeft: 8 }}>Today</span>}
        </div>
        <Pill>+ Add</Pill>
      </div>

      {/* Preview cards: workout + food */}
      <div style={{ padding: '0 24px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {wk && (
          <WorkoutPreview
            compact
            title={wk.title}
            meta={wk.meta}
            coachInit="J" coachColor={CORAL} coachName="Jordan Chen" coachRole="Coach"
            moves={wk.moves}
            onStart={d.today ? onWorkout : undefined}
            onPreview={!d.today && onPreview ? () => onPreview({
              kind: 'workout',
              title: wk.title,
              when: `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][sel]} · Apr ${d.d}`,
              meta: wk.meta,
              coach: { init: 'J', color: CORAL, name: 'Jordan Chen', role: 'Coach' },
              note: "Locked 2 days out. Load may adjust based on Friday's RPE.",
              moves: wk.moves.map(m => ({ ...m, cue: m.cue || '' })),
            }) : undefined}
            cta={d.today ? 'Start →' : 'Preview →'}
          />
        )}
        {fd && <FoodPreview
          kcal={fd.kcal} pro={fd.pro} count={fd.count} hero={fd.hero} note={fd.note}
          onPreview={!d.today && onPreview ? () => onPreview({
            kind: 'food',
            title: fd.hero,
            when: `${['Mon','Tue','Wed','Thu','Fri','Sat','Sun'][sel]} · Apr ${d.d}`,
            kcal: fd.kcal, pro: fd.pro, count: fd.count, note: fd.note,
            nutritionist: { init: 'M', color: GOLD, name: 'Dr. Maya Patel', role: 'Nutritionist' },
          }) : undefined}
        />}
      </div>

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
          <EventRow key={i} n={i + 1} kind={ev.k} title={ev.t} sub={ev.s} detail={ev.d} last={i === dayAgenda.length - 1} />
        ))}
      </div>

      {/* Week totals */}
      <SectionHeader eyebrow="Week totals" title="So far" />
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
        <MacroChip label="Sessions" v="4" t="5" color={CORAL} pct={0.8} />
        <MacroChip label="Check-ins" v="6" t="7" color={TEAL} pct={0.85} />
        <MacroChip label="Consults" v="1" t="2" color={GOLD} pct={0.5} />
        <MacroChip label="Avg kcal" v="1890" t="2100" color="#5ac8fa" pct={0.9} />
      </div>
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// MONTH — grid calendar with event dots
// ═══════════════════════════════════════════════════════════
function MonthView({ onWorkout, onPreview }) {
  // April 2026: Apr 1 is a Wed → grid starts with 2 blank cells (Mon, Tue)
  const firstBlank = 2;
  const daysInMonth = 30;
  const today = 21;
  // Per-day event kinds (illustrative; some empty)
  const events = {
    1: ['workout','meal'], 2: ['meal'], 3: ['workout','meal','checkin'], 4: ['meal'],
    5: [], 6: ['workout','meal','checkin'], 7: ['meal','consult'], 8: ['workout','meal'],
    9: ['meal','checkin'], 10: ['workout','meal'], 11: ['meal','consult'], 12: [],
    13: ['workout','meal','checkin'], 14: ['meal'], 15: ['workout','meal'], 16: ['meal','checkin'],
    17: [], 18: ['workout','meal'], 19: ['workout','meal','checkin'], 20: ['meal','consult'],
    21: ['workout','meal','checkin','consult'], 22: ['workout','meal'], 23: ['meal'],
    24: [], 25: ['workout','meal','consult'], 26: ['meal','checkin'], 27: ['workout','meal'],
    28: ['meal','checkin'], 29: ['workout','meal'], 30: ['meal','consult'],
  };
  const [sel, setSel] = useStateC(today);

  const cells = [];
  for (let i = 0; i < firstBlank; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const agendas = {
    21: [
      { k: 'workout', t: 'Upper Push — Peak', s: '52 min · Jordan', d: '9:05 AM' },
      { k: 'checkin', t: 'Morning check-in', s: 'Sleep · energy · mood', d: '9:45 AM' },
      { k: 'consult', t: 'Nutrition consult', s: '30 min · Dr. Maya', d: '3:00 PM' },
      { k: 'checkin', t: 'Evening check-in', s: 'RPE recap w/ Jordan', d: '6:30 PM' },
    ],
    19: [
      { k: 'workout', t: 'Upper Push', s: '52 min · Jordan · RPE 8', d: '9:00 AM' },
      { k: 'checkin', t: 'Weekly weigh-in', s: 'Photos + tape', d: '7:30 AM' },
    ],
    25: [
      { k: 'workout', t: 'Long run', s: '65 min · Z2', d: '8:00 AM' },
      { k: 'consult', t: 'Program review', s: '45 min · Jordan', d: '2:00 PM' },
    ],
  };
  const dayAgenda = agendas[sel] || (events[sel] || []).map((k, i) => ({
    k, t: ({ workout: 'Training session', meal: 'Meals planned', checkin: 'Check-in', consult: 'Consultation' })[k],
    s: ({ workout: '45–60 min', meal: '3–5 meals', checkin: 'Coach review', consult: '30 min · Zoom' })[k],
    d: '—',
  }));

  // Optional workout + food preview per day
  const workouts = {
    21: { title: 'Upper Pull — Peak', meta: '52 min · 6 moves · RPE 8', moves: [
      { t: 'Pull-up',        s: '4 × 6-8 · 3 min', d: '42 lb +' },
      { t: 'Barbell row',    s: '4 × 8 · 2 min',   d: '155 lb'  },
      { t: 'Chest-sup. row', s: '3 × 10 · 90s',    d: '60 lb'   },
      { t: '+ 3 more',       s: 'Face pull · curl · carry', d: '' },
    ] },
    19: { title: 'Upper Push', meta: '52 min · 6 moves · RPE 8', moves: [
      { t: 'Bench press', s: '5 × 5 · 3 min', d: '185 lb' },
      { t: 'OHP',         s: '4 × 6 · 2 min', d: '115 lb' },
      { t: 'Dip',         s: '3 × 8 · 90s',   d: 'BW +25' },
      { t: '+ 3 more',    s: 'Fly · lateral · push-up', d: '' },
    ] },
    25: { title: 'Long run', meta: '65 min · Zone 2 · Prospect loop', moves: [
      { t: 'Warm-up',   s: '10 min · Z1', d: '' },
      { t: 'Main',      s: '45 min · Z2 · <152 bpm', d: '' },
      { t: 'Cool-down', s: '10 min · Z1 + mobility', d: '' },
    ] },
    6: { title: 'Lower Pull', meta: '48 min · 6 moves · RPE 7', moves: [
      { t: 'Deadlift',    s: '4 × 5 · 3 min', d: '275 lb' },
      { t: 'RDL',         s: '3 × 8 · 2 min', d: '185 lb' },
      { t: 'Hip thrust',  s: '3 × 10 · 90s',  d: '205 lb' },
      { t: '+ 3 more',    s: 'Ham curl · calf · core', d: '' },
    ] },
    13: { title: 'Upper Pull', meta: '50 min · 6 moves · RPE 7', moves: [
      { t: 'Pull-up',       s: '4 × 6 · 3 min',  d: '32 lb +' },
      { t: 'Barbell row',   s: '4 × 8 · 2 min',  d: '145 lb'  },
      { t: '+ 4 more',      s: 'Row · pull · curl · carry', d: '' },
    ] },
  };
  const foods = {
    21: { kcal: '2100', pro: '165', count: 5, hero: 'Chicken bowl + rice', note: '5 meals planned' },
    19: { kcal: '2040', pro: '162', count: 4, hero: 'Steak + sweet potato', note: '4 meals logged' },
    25: { kcal: '2200', pro: '155', count: 4, hero: 'Pasta puttanesca',  note: '4 meals planned' },
    17: { kcal: '1800', pro: '140', count: 3, hero: 'Rest day roast',    note: 'Refeed · +300 kcal' },
    24: { kcal: '1850', pro: '140', count: 3, hero: 'Open · flex day',   note: 'Rest day · no macros' },
  };
  // Fallback: synthesize preview from events map
  const hasWorkout = (events[sel] || []).includes('workout');
  const wk = workouts[sel] || (hasWorkout ? {
    title: 'Training session', meta: '45–60 min · 6 moves',
    moves: [ { t: 'Program TBD', s: 'Full plan unlocks 2 days before', d: '' } ],
  } : null);
  const hasMeals = (events[sel] || []).includes('meal');
  const fd = foods[sel] || (hasMeals ? { kcal: '2000', pro: '150', count: 4, hero: 'Meals planned', note: '—' } : null);

  return (
    <>
      {/* Month header */}
      <div style={{ padding: '0 24px 10px', display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK }}>
          <em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>April</em> 2026
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase', cursor: 'pointer' }}>‹ Mar</span>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase', cursor: 'pointer' }}>May ›</span>
        </div>
      </div>

      {/* Weekday row */}
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
        {['M','T','W','T','F','S','S'].map((d, i) => (
          <div key={i} style={{ textAlign: 'center', fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: INK_45, textTransform: 'uppercase' }}>{d}</div>
        ))}
      </div>

      {/* Month grid */}
      <div style={{ padding: '0 20px', display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
        {cells.map((d, i) => {
          if (d === null) return <div key={i} />;
          const ev = events[d] || [];
          const isToday = d === today;
          const on = sel === d;
          return (
            <button key={i} onClick={() => setSel(d)} style={{
              border: `1px solid ${on ? TEAL : (isToday ? TEAL + '55' : HAIR)}`,
              background: on ? 'rgba(30,192,168,0.10)' : 'rgba(242,237,228,0.025)',
              borderRadius: 9, padding: '7px 2px 5px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
              aspectRatio: '1 / 1.05', minHeight: 0,
            }}>
              <span style={{
                fontFamily: SERIF, fontSize: 15, letterSpacing: '-0.02em',
                color: on ? TEAL : (isToday ? TEAL : INK),
                fontWeight: isToday ? 500 : 400,
              }}>{d}</span>
              <div style={{ display: 'flex', gap: 2, height: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
                {ev.slice(0, 4).map((k, j) => (
                  <span key={j} style={{ width: 3.5, height: 3.5, borderRadius: 2, background: kindColor(k) }} />
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div style={{ padding: '14px 24px 8px', display: 'flex', flexWrap: 'wrap', gap: 14 }}>
        {[
          { k: 'workout', l: 'Workout' },
          { k: 'meal',    l: 'Meals' },
          { k: 'checkin', l: 'Check-in' },
          { k: 'consult', l: 'Consult' },
        ].map(x => (
          <div key={x.k} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: kindColor(x.k) }} />
            <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: INK_60, textTransform: 'uppercase' }}>{x.l}</span>
          </div>
        ))}
      </div>

      {/* Selected day agenda */}
      <div style={{ padding: '12px 24px 6px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color: INK }}>
          <em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>Apr {sel}</em>
          {sel === today && <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: TEAL, textTransform: 'uppercase', marginLeft: 8 }}>Today</span>}
        </div>
        <Pill>+ Add</Pill>
      </div>
      {/* Preview cards: workout + food */}
      <div style={{ padding: '0 24px 6px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {wk && (
          <WorkoutPreview
            compact
            title={wk.title}
            meta={wk.meta}
            coachInit="J" coachColor={CORAL} coachName="Jordan Chen" coachRole="Coach"
            moves={wk.moves}
            onStart={sel === today ? onWorkout : undefined}
            onPreview={sel !== today && onPreview ? () => onPreview({
              kind: 'workout',
              title: wk.title,
              when: `Apr ${sel}`,
              meta: wk.meta,
              coach: { init: 'J', color: CORAL, name: 'Jordan Chen', role: 'Coach' },
              note: "Plan unlocks 2 days before. Jordan may adjust load based on this week's check-ins.",
              moves: wk.moves.map(m => ({ ...m, cue: m.cue || '' })),
            }) : undefined}
            cta={sel === today ? 'Start →' : 'Preview →'}
          />
        )}
        {fd && <FoodPreview
          kcal={fd.kcal} pro={fd.pro} count={fd.count} hero={fd.hero} note={fd.note}
          onPreview={sel !== today && onPreview ? () => onPreview({
            kind: 'food',
            title: fd.hero,
            when: `Apr ${sel}`,
            kcal: fd.kcal, pro: fd.pro, count: fd.count, note: fd.note,
            nutritionist: { init: 'M', color: GOLD, name: 'Dr. Maya Patel', role: 'Nutritionist' },
          }) : undefined}
        />}
      </div>

      <div style={{ padding: '10px 24px 0' }}>
        <MLabel>Schedule</MLabel>
      </div>
      <div style={{ padding: '0 24px' }}>
        {dayAgenda.length === 0 && (
          <div style={{ padding: '26px 0', textAlign: 'center', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>
            Open day · nothing scheduled
          </div>
        )}
        {dayAgenda.map((ev, i) => (
          <EventRow key={i} n={i + 1} kind={ev.k} title={ev.t} sub={ev.s} detail={ev.d} last={i === dayAgenda.length - 1} />
        ))}
      </div>
    </>
  );
}

// ─────────────────────────────────────────────────────────────
// EventRow — tracklist row with kind pill (workout/meal/checkin/consult)
// ─────────────────────────────────────────────────────────────
function kindColor(k) {
  return ({
    workout: CORAL,
    meal:    TEAL,
    checkin: '#5ac8fa',
    consult: GOLD,
  })[k] || INK_45;
}
function kindLabel(k) {
  return ({ workout: 'Train', meal: 'Meal', checkin: 'Check-in', consult: 'Consult' })[k] || '';
}
function EventRow({ n, title, sub, detail, state, kind, onClick, last }) {
  const done = state === 'done';
  const next = state === 'next';
  const color = kindColor(kind);
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14, padding: '14px 0',
      borderBottom: last ? 0 : `1px solid ${HAIR_S}`,
      cursor: onClick ? 'pointer' : 'default',
      opacity: done ? 0.55 : 1,
    }}>
      <div style={{ width: 22, textAlign: 'right' }}>
        <span style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', color: next ? color : INK_45 }}>
          {done ? '✓' : String(n).padStart(2, '0')}
        </span>
      </div>
      {/* Kind tick */}
      <div style={{ width: 3, alignSelf: 'stretch', background: color, borderRadius: 2, opacity: done ? 0.5 : 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{
            fontFamily: SANS, fontSize: 15, fontWeight: 500, color: INK, letterSpacing: -0.1,
            textDecoration: done ? 'line-through' : 'none', textDecorationColor: INK_45,
          }}>{title}</span>
          <span style={{
            fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase',
            padding: '2px 6px', borderRadius: 4, background: color + '1f', color,
          }}>{kindLabel(kind)}</span>
        </div>
        {sub && <div style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.06em', color: next ? color : INK_60, marginTop: 3 }}>{sub}</div>}
      </div>
      {detail && <div style={{ fontFamily: MONO, fontSize: 10.5, color: INK_45, letterSpacing: '0.1em' }}>{detail}</div>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// WorkoutPreview — planned session card for calendar/home
// ─────────────────────────────────────────────────────────────
function WorkoutPreview({ title, meta, coachInit, coachColor = CORAL, coachName, coachRole, moves = [], onStart, onPreview, cta = 'Start →', compact }) {
  const clickable = !!onPreview && !onStart;
  return (
    <EdCard pad={16} tint="linear-gradient(155deg, rgba(227,122,90,0.10), rgba(227,122,90,0.015))" style={{ border: `1px solid rgba(227,122,90,0.22)`, cursor: clickable ? 'pointer' : 'default' }} onClick={clickable ? onPreview : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <MLabel color={CORAL}>Workout</MLabel>
        <MLabel>{meta}</MLabel>
      </div>
      <div style={{ marginTop: 6, fontFamily: SERIF, fontSize: compact ? 21 : 24, letterSpacing: '-0.025em', color: INK, lineHeight: 1.05 }}>
        {title}
      </div>
      {moves.length > 0 && (
        <div style={{ marginTop: 10 }}>
          {moves.map((m, i) => (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0',
              borderTop: i === 0 ? 0 : `1px solid ${HAIR_S}`,
            }}>
              <span style={{ width: 18, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: INK_45 }}>{String(i + 1).padStart(2, '0')}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SANS, fontSize: 13.5, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>{m.t}</div>
                {m.s && <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, letterSpacing: '0.04em', marginTop: 2 }}>{m.s}</div>}
              </div>
              {m.d && <div style={{ fontFamily: MONO, fontSize: 10, color: INK_45, letterSpacing: '0.08em' }}>{m.d}</div>}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${HAIR_S}` }}>
        <Attribution init={coachInit} color={coachColor} name={coachName} role={coachRole} />
        {onStart
          ? <Pill solid color={CORAL} onClick={onStart}>{cta}</Pill>
          : onPreview
            ? <Pill onClick={(e) => { e.stopPropagation(); onPreview(); }}>Preview →</Pill>
            : <MLabel color={CORAL}>{cta}</MLabel>}
      </div>
    </EdCard>
  );
}

// ─────────────────────────────────────────────────────────────
// FoodPreview — planned meals summary card for calendar
// ─────────────────────────────────────────────────────────────
function FoodPreview({ kcal, pro, count, hero, note, onPreview }) {
  const clickable = !!onPreview;
  return (
    <EdCard pad={16} tint="linear-gradient(155deg, rgba(30,192,168,0.08), rgba(30,192,168,0.01))" style={{ border: `1px solid rgba(30,192,168,0.20)`, cursor: clickable ? 'pointer' : 'default' }} onClick={clickable ? onPreview : undefined}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <MLabel color={TEAL}>Meals</MLabel>
        <MLabel>{count} planned</MLabel>
      </div>
      <div style={{ marginTop: 6, fontFamily: SERIF, fontSize: 21, letterSpacing: '-0.025em', color: INK, lineHeight: 1.1 }}>
        {hero}
      </div>
      <div style={{ marginTop: 4 }}>
        <MStats items={[`${kcal} kcal`, `${pro}P target`, note]} />
      </div>
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 5 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} style={{
            height: 4, borderRadius: 2,
            background: i < count ? TEAL : HAIR,
          }} />
        ))}
      </div>
      {onPreview && (
        <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 10, borderTop: `1px solid ${HAIR_S}` }}>
          <Attribution init="M" color={GOLD} name="Dr. Maya Patel" role="Nutritionist" />
          <Pill onClick={(e) => { e.stopPropagation(); onPreview(); }}>Preview →</Pill>
        </div>
      )}
    </EdCard>
  );
}

// ─────────────────────────────────────────────────────────────
// PreviewSheet — full-screen read-only preview for future workouts / meals
// ─────────────────────────────────────────────────────────────
function PreviewSheet({ item, onBack, onStart }) {
  if (!item) return null;
  const isWorkout = item.kind === 'workout';
  const accent = isWorkout ? CORAL : TEAL;
  const mealPlan = !isWorkout ? [
    { t: 'Breakfast',    when: '7:30 AM', dish: 'Greek yogurt parfait', kcal: 420, macros: '32P / 48C / 10F' },
    { t: 'Snack',        when: '10:30 AM', dish: 'Apple + almond butter', kcal: 240, macros: '8P / 28C / 12F' },
    { t: 'Lunch',        when: '12:45 PM', dish: item.title, kcal: Math.round(Number(item.kcal) * 0.30), macros: '48P / 72C / 14F' },
    { t: 'Snack',        when: '4:00 PM', dish: 'Whey + banana', kcal: 280, macros: '30P / 32C / 4F' },
    { t: 'Dinner',       when: '7:30 PM', dish: 'Salmon, quinoa, greens', kcal: 560, macros: '44P / 42C / 22F' },
  ].slice(0, item.count || 5) : [];

  return (
    <Screen>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: `linear-gradient(180deg, ${PAPER} 82%, rgba(26,22,18,0) 100%)`,
        padding: '54px 24px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase' }}>← Back</button>
          <MLabel color={accent}>Preview</MLabel>
          <button style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase' }}>··· More</button>
        </div>
      </div>

      {/* Title block */}
      <div style={{ padding: '8px 24px 0' }}>
        <MLabel>{item.when}</MLabel>
        <div style={{ marginTop: 6, fontFamily: SERIF, fontSize: 34, letterSpacing: '-0.03em', color: INK, lineHeight: 1.02 }}>
          {item.title}<em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>.</em>
        </div>
        {isWorkout && <div style={{ marginTop: 6 }}><MStats items={item.meta.split(' · ')} /></div>}
        {!isWorkout && <div style={{ marginTop: 6 }}><MStats items={[`${item.kcal} kcal`, `${item.pro}P target`, `${item.count} meals`]} /></div>}
      </div>

      {/* Author card */}
      <div style={{ padding: '18px 24px 0' }}>
        <EdCard pad={14} tint={`linear-gradient(155deg, ${accent}14, ${accent}03)`} style={{ border: `1px solid ${accent}33` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution
              init={isWorkout ? item.coach.init : item.nutritionist.init}
              color={isWorkout ? item.coach.color : item.nutritionist.color}
              name={isWorkout ? item.coach.name : item.nutritionist.name}
              role={isWorkout ? item.coach.role : item.nutritionist.role}
            />
            <Pill>Message</Pill>
          </div>
          {item.note && (
            <div style={{ marginTop: 12, fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.4, color: INK_60, letterSpacing: '-0.005em' }}>
              "{item.note}"
            </div>
          )}
        </EdCard>
      </div>

      {/* Workout moves */}
      {isWorkout && (
        <>
          <SectionHeader eyebrow="Plan" title="Moves" action={`${item.moves.length}`} />
          <div style={{ padding: '0 24px' }}>
            {item.moves.map((m, i) => (
              <div key={i} style={{
                padding: '14px 0',
                borderBottom: i === item.moves.length - 1 ? 0 : `1px solid ${HAIR_S}`,
              }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                  <span style={{ width: 22, fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', color: INK_45 }}>{String(i + 1).padStart(2, '0')}</span>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK }}>{m.t}</div>
                    {m.s && <div style={{ fontFamily: MONO, fontSize: 10.5, color: INK_60, letterSpacing: '0.06em', marginTop: 3 }}>{m.s}</div>}
                  </div>
                  {m.d && <div style={{ fontFamily: MONO, fontSize: 11, color: accent, letterSpacing: '0.08em' }}>{m.d}</div>}
                </div>
                {m.cue && (
                  <div style={{ marginLeft: 32, marginTop: 6, fontFamily: SERIF, fontStyle: 'italic', fontSize: 13, color: INK_60, letterSpacing: '-0.005em' }}>
                    "{m.cue}"
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      {/* Meal schedule */}
      {!isWorkout && (
        <>
          <SectionHeader eyebrow="Plan" title="Meals" action={`${item.count}`} />
          <div style={{ padding: '0 24px' }}>
            {mealPlan.map((m, i) => (
              <div key={i} style={{
                padding: '14px 0',
                borderBottom: i === mealPlan.length - 1 ? 0 : `1px solid ${HAIR_S}`,
                display: 'flex', alignItems: 'baseline', gap: 12,
              }}>
                <span style={{ width: 60, fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: INK_45, textTransform: 'uppercase' }}>{m.when}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: TEAL, textTransform: 'uppercase' }}>{m.t}</div>
                  <div style={{ marginTop: 3, fontFamily: SERIF, fontSize: 17, letterSpacing: '-0.02em', color: INK }}>{m.dish}</div>
                  <div style={{ marginTop: 3, fontFamily: MONO, fontSize: 10, color: INK_60, letterSpacing: '0.06em' }}>{m.macros}</div>
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: TEAL, letterSpacing: '0.08em' }}>{m.kcal}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {/* Actions */}
      <div style={{ padding: '22px 24px 28px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {onStart && (
          <button onClick={onStart} style={{
            border: 0, background: accent, color: PAPER,
            padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase',
            boxShadow: `0 10px 28px ${accent}44`,
          }}>Start {isWorkout ? 'workout' : 'day'} →</button>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <button style={{
            border: `1px solid ${HAIR}`, background: 'transparent', color: INK,
            padding: '14px', borderRadius: 12, cursor: 'pointer',
            fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>{isWorkout ? 'Move session' : 'Swap meals'}</button>
          <button style={{
            border: `1px solid ${HAIR}`, background: 'transparent', color: INK,
            padding: '14px', borderRadius: 12, cursor: 'pointer',
            fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>Remind me</button>
        </div>
      </div>
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────
// LogMealSheet — full-screen meal logging
// ─────────────────────────────────────────────────────────────
function LogMealSheet({ meal, onBack }) {
  const [portion, setPortion] = useStateC(1);
  const [ings, setIngs] = useStateC(meal.ingredients.map(i => ({ ...i, on: true })));
  const [mode, setMode] = useStateC('planned'); // 'planned' | 'photo' | 'search' | 'voice'
  const [note, setNote] = useStateC('');
  const [done, setDone] = useStateC(false);

  // Compute live macros
  const mult = portion;
  const totals = ings.filter(i => i.on).reduce((s, i) => ({
    kcal: s.kcal + i.kcal * mult,
    p: s.p + i.p * mult,
    c: s.c + i.c * mult,
    f: s.f + i.f * mult,
  }), { kcal: 0, p: 0, c: 0, f: 0 });

  // Day running totals (before this meal): from macro chip values 1568 kcal, 118P
  const dayBefore = { kcal: 1568, p: 118, c: 150, f: 48 };
  const dayTarget = { kcal: 2100, p: 165, c: 240, f: 68 };
  const dayAfter = {
    kcal: dayBefore.kcal + totals.kcal,
    p: dayBefore.p + totals.p,
    c: dayBefore.c + totals.c,
    f: dayBefore.f + totals.f,
  };

  if (done) {
    return (
      <Screen>
        <div style={{ padding: '120px 24px 0', textAlign: 'center' }}>
          <div style={{
            width: 88, height: 88, borderRadius: 44, margin: '0 auto',
            background: `linear-gradient(135deg, ${TEAL}, #14806f)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 42, color: PAPER, boxShadow: `0 16px 40px ${TEAL}55`,
          }}>✓</div>
          <div style={{ marginTop: 22, fontFamily: SERIF, fontSize: 30, letterSpacing: '-0.03em', color: INK, lineHeight: 1.1 }}>
            Logged<em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>.</em>
          </div>
          <div style={{ marginTop: 8, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', color: INK_60, textTransform: 'uppercase' }}>
            {Math.round(totals.kcal)} kcal · {Math.round(totals.p)}P · {meal.time}
          </div>
          <div style={{ marginTop: 24, padding: 16, borderRadius: 14, background: 'rgba(30,192,168,0.08)', border: `1px solid ${TEAL}33`, textAlign: 'left' }}>
            <MLabel color={TEAL}>Day so far</MLabel>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <DayStat label="Calories" v={Math.round(dayAfter.kcal)} t={dayTarget.kcal} color={TEAL} />
              <DayStat label="Protein"  v={Math.round(dayAfter.p)}    t={dayTarget.p}    color={CORAL} />
            </div>
          </div>
          {note && (
            <div style={{ marginTop: 16, padding: 14, borderRadius: 12, background: `${GOLD}14`, border: `1px solid ${GOLD}33`, textAlign: 'left' }}>
              <MLabel color={GOLD}>Note to Dr. Maya · sent</MLabel>
              <div style={{ marginTop: 6, fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: INK_60, lineHeight: 1.4 }}>"{note}"</div>
            </div>
          )}
          <button onClick={onBack} style={{
            marginTop: 28, width: '100%', border: 0, background: INK, color: PAPER,
            padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase',
          }}>Done →</button>
          <button onClick={() => { setDone(false); }} style={{
            marginTop: 10, width: '100%', border: 0, background: 'transparent', color: INK_60,
            padding: '10px', cursor: 'pointer',
            fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>Undo</button>
        </div>
      </Screen>
    );
  }

  const toggleIng = (idx) => setIngs(ings.map((i, j) => j === idx ? { ...i, on: !i.on } : i));

  return (
    <Screen>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: `linear-gradient(180deg, ${PAPER} 82%, rgba(26,22,18,0) 100%)`,
        padding: '54px 24px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase' }}>✕ Cancel</button>
          <MLabel color={TEAL}>Log meal</MLabel>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase' }}>{meal.time}</span>
        </div>
      </div>

      {/* Meal hero */}
      <div style={{ padding: '4px 24px 0' }}>
        <MLabel>{meal.label} · planned</MLabel>
        <div style={{ marginTop: 6, fontFamily: SERIF, fontSize: 30, letterSpacing: '-0.03em', color: INK, lineHeight: 1.02 }}>
          {meal.title}<em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>.</em>
        </div>
        <div style={{ marginTop: 6 }}>
          <MStats items={[`${meal.kcal} planned`, `${meal.p}P`, `${meal.c}C`, `${meal.f}F`]} />
        </div>
      </div>

      {/* Quick log — "Ate it as planned" */}
      <div style={{ padding: '18px 24px 0' }}>
        <button onClick={() => setDone(true)} style={{
          width: '100%', border: 0, background: TEAL, color: PAPER,
          padding: '18px 20px', borderRadius: 16, cursor: 'pointer',
          boxShadow: `0 10px 28px ${TEAL}55`,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: `${PAPER}cc`, textTransform: 'uppercase' }}>One tap</div>
            <div style={{ marginTop: 3, fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em' }}>Ate it as planned</div>
          </div>
          <span style={{ fontFamily: MONO, fontSize: 18 }}>✓</span>
        </button>
      </div>

      {/* Or adjust header */}
      <div style={{ padding: '24px 24px 10px', display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ flex: 1, height: 1, background: HAIR }} />
        <MLabel>Or adjust</MLabel>
        <div style={{ flex: 1, height: 1, background: HAIR }} />
      </div>

      {/* Input mode chips */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6 }}>
        {[
          { k: 'planned', l: 'Adjust',  i: '✎' },
          { k: 'photo',   l: 'Photo',   i: '📷' },
          { k: 'search',  l: 'Search',  i: '⌕' },
          { k: 'voice',   l: 'Voice',   i: '●' },
        ].map(m => {
          const on = mode === m.k;
          return (
            <button key={m.k} onClick={() => setMode(m.k)} style={{
              border: `1px solid ${on ? TEAL : HAIR}`,
              background: on ? `${TEAL}14` : 'rgba(242,237,228,0.025)',
              borderRadius: 11, padding: '10px 6px', cursor: 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
            }}>
              <span style={{ fontSize: 14, color: on ? TEAL : INK_60 }}>{m.i}</span>
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: on ? TEAL : INK_60, textTransform: 'uppercase' }}>{m.l}</span>
            </button>
          );
        })}
      </div>

      {mode === 'planned' && (
        <>
          {/* Portion slider */}
          <div style={{ padding: '22px 24px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <MLabel>Portion</MLabel>
              <span style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: '-0.02em', color: TEAL }}>{portion.toFixed(2)}<span style={{ fontSize: 16, color: INK_60, marginLeft: 2 }}>×</span></span>
            </div>
            <input type="range" min={0.25} max={2} step={0.05} value={portion}
              onChange={(e) => setPortion(parseFloat(e.target.value))}
              style={{
                width: '100%', accentColor: TEAL, height: 4,
              }} />
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
              {['¼', '½', '1×', '1½', '2×'].map((l, i) => (
                <span key={i} style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', color: INK_45 }}>{l}</span>
              ))}
            </div>
          </div>

          {/* Ingredients list with toggles */}
          <div style={{ padding: '18px 24px 0' }}>
            <MLabel>Ingredients · tap to toggle</MLabel>
            <div style={{ marginTop: 8 }}>
              {ings.map((ing, i) => (
                <div key={i} onClick={() => toggleIng(i)} style={{
                  display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0',
                  borderBottom: i === ings.length - 1 ? 0 : `1px solid ${HAIR_S}`,
                  cursor: 'pointer', opacity: ing.on ? 1 : 0.4,
                }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: 6, flexShrink: 0,
                    border: `1.5px solid ${ing.on ? TEAL : HAIR}`,
                    background: ing.on ? TEAL : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    color: PAPER, fontSize: 11,
                  }}>{ing.on ? '✓' : ''}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 500, color: INK, letterSpacing: -0.1, textDecoration: ing.on ? 'none' : 'line-through', textDecorationColor: INK_45 }}>{ing.n}</div>
                    <div style={{ marginTop: 2, fontFamily: MONO, fontSize: 10, color: INK_60, letterSpacing: '0.06em' }}>{ing.q} · {Math.round(ing.kcal * mult)} kcal · {Math.round(ing.p * mult)}P</div>
                  </div>
                  <span style={{ fontFamily: MONO, fontSize: 10, color: INK_45, letterSpacing: '0.08em' }}>EDIT</span>
                </div>
              ))}
            </div>
            <button style={{
              marginTop: 10, width: '100%', border: `1px dashed ${HAIR}`, background: 'transparent', color: INK_60,
              padding: '12px', borderRadius: 11, cursor: 'pointer',
              fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>+ Add ingredient</button>
          </div>
        </>
      )}

      {mode === 'photo' && (
        <div style={{ padding: '22px 24px 0' }}>
          <div style={{
            height: 200, borderRadius: 16, border: `1px dashed ${HAIR}`,
            background: 'rgba(242,237,228,0.025)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10,
          }}>
            <div style={{ fontSize: 32, color: INK_60 }}>📷</div>
            <div style={{ fontFamily: SERIF, fontSize: 17, color: INK }}>Snap or upload</div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', color: INK_60, textTransform: 'uppercase' }}>Shape reads macros · Maya reviews</div>
          </div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <button style={{ border: 0, background: TEAL, color: PAPER, padding: '14px', borderRadius: 12, cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Take photo</button>
            <button style={{ border: `1px solid ${HAIR}`, background: 'transparent', color: INK, padding: '14px', borderRadius: 12, cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Upload</button>
          </div>
        </div>
      )}

      {mode === 'search' && (
        <div style={{ padding: '22px 24px 0' }}>
          <input placeholder="Search foods, brands, barcodes…" style={{
            width: '100%', padding: '14px 16px', borderRadius: 12,
            border: `1px solid ${HAIR}`, background: 'rgba(242,237,228,0.025)',
            fontFamily: SANS, fontSize: 14, color: INK, outline: 'none',
          }} />
          <div style={{ marginTop: 12 }}>
            <MLabel>Recents</MLabel>
            {[
              { n: 'Chipotle · chicken bowl', m: '560 kcal · 42P' },
              { n: 'Whey isolate', m: '120 kcal · 25P' },
              { n: 'Jasmine rice · 1c', m: '205 kcal · 4P' },
            ].map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: i === 2 ? 0 : `1px solid ${HAIR_S}`, cursor: 'pointer' }}>
                <div>
                  <div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500, color: INK }}>{r.n}</div>
                  <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, letterSpacing: '0.06em', marginTop: 2 }}>{r.m}</div>
                </div>
                <span style={{ fontFamily: MONO, fontSize: 14, color: TEAL }}>+</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === 'voice' && (
        <div style={{ padding: '22px 24px 0' }}>
          <div style={{
            height: 200, borderRadius: 16, border: `1px solid ${TEAL}44`,
            background: `linear-gradient(135deg, ${TEAL}14, ${TEAL}03)`,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
          }}>
            <div style={{
              width: 72, height: 72, borderRadius: 36, background: TEAL,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              boxShadow: `0 0 0 8px ${TEAL}22, 0 0 0 18px ${TEAL}11`,
            }}>
              <span style={{ color: PAPER, fontSize: 24 }}>●</span>
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 18, color: INK, fontStyle: 'italic' }}>"I had two scoops of rice…"</div>
            <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: INK_60, textTransform: 'uppercase' }}>Tap to speak · 0:00</div>
          </div>
        </div>
      )}

      {/* Live totals — sticky-ish bar */}
      <div style={{ padding: '24px 24px 0' }}>
        <div style={{
          borderRadius: 16, padding: '14px 16px',
          border: `1px solid ${HAIR}`, background: 'rgba(242,237,228,0.025)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MLabel color={TEAL}>This meal</MLabel>
            <span style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: '-0.02em', color: INK }}>
              {Math.round(totals.kcal)}<span style={{ fontSize: 13, color: INK_60, marginLeft: 4 }}>kcal</span>
            </span>
          </div>
          <div style={{ marginTop: 6, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <MacroMini label="Pro" v={Math.round(totals.p)} color={CORAL} />
            <MacroMini label="Carb" v={Math.round(totals.c)} color={TEAL} />
            <MacroMini label="Fat" v={Math.round(totals.f)} color={GOLD} />
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${HAIR_S}` }}>
            <MLabel>After logging · day total</MLabel>
            <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <DayStat label="Calories" v={Math.round(dayAfter.kcal)} t={dayTarget.kcal} color={TEAL} />
              <DayStat label="Protein"  v={Math.round(dayAfter.p)}    t={dayTarget.p}    color={CORAL} />
            </div>
          </div>
        </div>
      </div>

      {/* Note to nutritionist */}
      <div style={{ padding: '16px 24px 0' }}>
        <MLabel>Note to Dr. Maya · optional</MLabel>
        <textarea placeholder="Felt a bit hungry still · swapped rice for sweet potato…" value={note} onChange={(e) => setNote(e.target.value)}
          style={{
            marginTop: 8, width: '100%', minHeight: 56, padding: '12px 14px', borderRadius: 12,
            border: `1px solid ${HAIR}`, background: 'rgba(242,237,228,0.025)',
            fontFamily: SANS, fontSize: 13.5, color: INK, resize: 'vertical', outline: 'none',
          }} />
      </div>

      {/* Primary action */}
      <div style={{ padding: '22px 24px 28px' }}>
        <button onClick={() => setDone(true)} style={{
          width: '100%', border: 0, background: INK, color: PAPER,
          padding: '16px 18px', borderRadius: 14, cursor: 'pointer',
          fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>Log meal · {Math.round(totals.kcal)} kcal →</button>
      </div>
    </Screen>
  );
}

function MacroMini({ label, v, color }) {
  return (
    <div>
      <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: INK_45, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 3, fontFamily: SERIF, fontSize: 19, letterSpacing: '-0.02em', color }}>{v}<span style={{ fontSize: 11, color: INK_60, marginLeft: 2 }}>g</span></div>
    </div>
  );
}

function DayStat({ label, v, t, color }) {
  const pct = Math.min(1, v / t);
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase' }}>{label}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: INK_45, letterSpacing: '0.08em' }}>/ {t}</span>
      </div>
      <div style={{ marginTop: 4, fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color }}>{v}</div>
      <div style={{ marginTop: 4, height: 3, background: HAIR, borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACTIVE WORKOUT — full-screen logging view
// ═══════════════════════════════════════════════════════════
function ActiveWorkout({ onBack }) {
  // Exercise plan
  const plan = [
    { name: 'Pull-up',         target: '4 × 6-8',  rest: 180, cue: 'Full dead hang. No kip.', prev: 'Last: BW+35 × 7/7/6/6' },
    { name: 'Barbell row',     target: '4 × 8',    rest: 120, cue: 'Hinge 45°, pull to sternum.', prev: 'Last: 150 × 8/8/8/7' },
    { name: 'Chest-sup. row',  target: '3 × 10',   rest: 90,  cue: 'Pause 1s at peak.', prev: 'Last: 55 × 10/10/10' },
    { name: 'Face pull',       target: '3 × 15',   rest: 60,  cue: 'External rotation at top.', prev: 'Last: 35 × 15/15/14' },
    { name: 'Incline curl',    target: '3 × 12',   rest: 60,  cue: 'Full stretch. 3s eccentric.', prev: 'Last: 27.5 × 12/11/10' },
    { name: 'Farmer carry',    target: '3 × 40m',  rest: 60,  cue: 'Crush grip. Ribs down.', prev: 'Last: 80 × 40m' },
  ];
  const [exIdx, setExIdx] = useStateC(1); // on exercise 2 mid-session for demo
  const [sets, setSets] = useStateC([
    // per-exercise per-set: {reps, weight, rpe, done}
    [ { reps: 7, weight: 42, rpe: 7.5, done: true }, { reps: 7, weight: 42, rpe: 8, done: true }, { reps: 6, weight: 42, rpe: 8.5, done: true }, { reps: 6, weight: 42, rpe: 9, done: true } ],
    [ { reps: 8, weight: 155, rpe: 8, done: true }, { reps: 8, weight: 155, rpe: 8, done: true }, { reps: 0, weight: 155, rpe: 0, done: false }, { reps: 0, weight: 155, rpe: 0, done: false } ],
    [ { reps: 0, weight: 60, rpe: 0, done: false }, { reps: 0, weight: 60, rpe: 0, done: false }, { reps: 0, weight: 60, rpe: 0, done: false } ],
    [ { reps: 0, weight: 40, rpe: 0, done: false }, { reps: 0, weight: 40, rpe: 0, done: false }, { reps: 0, weight: 40, rpe: 0, done: false } ],
    [ { reps: 0, weight: 30, rpe: 0, done: false }, { reps: 0, weight: 30, rpe: 0, done: false }, { reps: 0, weight: 30, rpe: 0, done: false } ],
    [ { reps: 0, weight: 88, rpe: 0, done: false }, { reps: 0, weight: 88, rpe: 0, done: false }, { reps: 0, weight: 88, rpe: 0, done: false } ],
  ]);
  const [resting, setResting] = useStateC(true);
  const [restLeft, setRestLeft] = useStateC(82); // seconds remaining
  const [elapsed, setElapsed] = useStateC(28 * 60 + 14); // session elapsed, 28:14

  React.useEffect(() => {
    const t = setInterval(() => {
      setElapsed(e => e + 1);
      if (resting) setRestLeft(r => Math.max(0, r - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [resting]);

  const cur = plan[exIdx];
  const curSets = sets[exIdx];
  const doneCount = curSets.filter(s => s.done).length;
  const nextSet = curSets.findIndex(s => !s.done);
  const exProgress = plan.reduce((acc, _, i) => acc + (sets[i].filter(s => s.done).length / sets[i].length), 0) / plan.length;

  const fmt = (sec) => {
    const m = Math.floor(sec / 60); const s = sec % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  };

  const logSet = () => {
    if (nextSet === -1) return;
    const newSets = sets.map((arr, i) => i === exIdx ? arr.map((s, j) => j === nextSet ? { ...s, reps: cur.target.includes('×') ? parseInt(cur.target.split('×')[1]) || 8 : 8, done: true, rpe: 8 } : s) : arr);
    setSets(newSets);
    setResting(true);
    setRestLeft(cur.rest);
  };

  const skipRest = () => { setResting(false); setRestLeft(0); };
  const addTime = () => setRestLeft(r => r + 30);
  const plate = (w) => {
    // Crude plate breakdown from 45 lb bar
    if (w <= 45) return [];
    const per = (w - 45) / 2;
    const plates = [45, 35, 25, 10, 5, 2.5];
    const out = [];
    let rem = per;
    for (const p of plates) { while (rem >= p) { out.push(p); rem -= p; } }
    return out;
  };

  return (
    <Screen>
      {/* Sticky header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 5,
        background: `linear-gradient(180deg, ${PAPER} 82%, rgba(26,22,18,0) 100%)`,
        padding: '54px 24px 12px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase' }}>✕ End</button>
          <MLabel color={TEAL}>● Live · {fmt(elapsed)}</MLabel>
          <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', color: INK_60, textTransform: 'uppercase' }}>Log ▾</span>
        </div>
        <div style={{ marginTop: 10 }}>
          <div style={{ fontFamily: SERIF, fontSize: 26, letterSpacing: '-0.025em', color: INK, lineHeight: 1 }}>
            Upper Pull — <em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>Peak.</em>
          </div>
          <div style={{ marginTop: 5 }}>
            <MStats items={[`w/ Jordan`, `${Math.round(exProgress * 100)}% complete`, `~24 min left`]} />
          </div>
          {/* Progress bar */}
          <div style={{ height: 3, background: HAIR, borderRadius: 2, marginTop: 10, overflow: 'hidden' }}>
            <div style={{ width: `${exProgress * 100}%`, height: '100%', background: TEAL }} />
          </div>
        </div>
      </div>

      {/* Rest timer — active when resting */}
      {resting && restLeft > 0 && (
        <div style={{ padding: '6px 24px 18px' }}>
          <div style={{
            borderRadius: 18, padding: '18px 18px 14px',
            border: `1px solid ${TEAL}55`,
            background: `linear-gradient(135deg, rgba(30,192,168,0.14), rgba(30,192,168,0.02))`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <MLabel color={TEAL}>Rest</MLabel>
              <MLabel>Set {doneCount} of {curSets.length} · done</MLabel>
            </div>
            <div style={{ marginTop: 6, display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: SERIF, fontSize: 54, letterSpacing: '-0.04em', color: INK, lineHeight: 1 }}>{fmt(restLeft)}</span>
              <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>of {fmt(cur.rest)}</span>
            </div>
            {/* Pulse line */}
            <div style={{ height: 2, background: `${TEAL}33`, borderRadius: 1, marginTop: 12, overflow: 'hidden' }}>
              <div style={{ width: `${(restLeft / cur.rest) * 100}%`, height: '100%', background: TEAL, transition: 'width 1s linear' }} />
            </div>
            <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
              <button onClick={addTime} style={{
                flex: 1, border: `1px solid ${HAIR}`, background: 'transparent', color: INK,
                padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>+30 sec</button>
              <button onClick={skipRest} style={{
                flex: 1, border: 0, background: TEAL, color: PAPER,
                padding: '10px 12px', borderRadius: 12, cursor: 'pointer',
                fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>Skip rest →</button>
            </div>
          </div>
        </div>
      )}

      {/* Current exercise */}
      <div style={{ padding: '0 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <MLabel color={CORAL}>Exercise {exIdx + 1} of {plan.length}</MLabel>
          <MLabel>{cur.target}</MLabel>
        </div>
        <div style={{ marginTop: 4, fontFamily: SERIF, fontSize: 34, letterSpacing: '-0.03em', color: INK, lineHeight: 1 }}>
          {cur.name}.
        </div>
        <div style={{ marginTop: 6, fontFamily: SERIF, fontStyle: 'italic', fontSize: 14, color: INK_60, letterSpacing: '-0.01em' }}>
          "{cur.cue}"
        </div>
        <div style={{ marginTop: 4, fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>
          {cur.prev}
        </div>

        {/* Plate breakdown for weighted moves */}
        {cur.name.toLowerCase().includes('row') && (
          <div style={{ marginTop: 14, padding: '10px 14px', borderRadius: 12, border: `1px solid ${HAIR}`, background: 'rgba(242,237,228,0.025)' }}>
            <MLabel>Per side ({curSets[0].weight} lb)</MLabel>
            <div style={{ marginTop: 8, display: 'flex', gap: 5, alignItems: 'center' }}>
              <span style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginRight: 4 }}>BAR +</span>
              {plate(curSets[0].weight).map((p, i) => (
                <span key={i} style={{
                  padding: '3px 8px', borderRadius: 4, fontFamily: MONO, fontSize: 10,
                  background: p >= 45 ? CORAL : (p >= 25 ? GOLD : TEAL),
                  color: PAPER, letterSpacing: '0.04em',
                }}>{p}</span>
              ))}
            </div>
          </div>
        )}

        {/* Set logger */}
        <div style={{ marginTop: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr 28px', gap: 8, padding: '0 2px 8px', alignItems: 'end' }}>
            <MLabel>Set</MLabel>
            <MLabel>Weight</MLabel>
            <MLabel>Reps</MLabel>
            <MLabel>RPE</MLabel>
            <div />
          </div>
          {curSets.map((s, i) => {
            const active = i === nextSet;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '28px 1fr 1fr 1fr 28px', gap: 8,
                alignItems: 'center', padding: '10px 2px',
                borderTop: `1px solid ${HAIR_S}`,
                background: active ? 'rgba(30,192,168,0.06)' : 'transparent',
                borderRadius: active ? 10 : 0,
              }}>
                <span style={{ fontFamily: MONO, fontSize: 11, color: s.done ? INK_45 : (active ? TEAL : INK_60), letterSpacing: '0.08em' }}>
                  {s.done ? '✓' : String(i + 1).padStart(2, '0')}
                </span>
                <SetCell v={s.weight} unit="lb" active={active} done={s.done} />
                <SetCell v={s.done ? s.reps : (active ? '—' : '—')} active={active} done={s.done} />
                <SetCell v={s.done ? s.rpe.toFixed(1) : '—'} active={active} done={s.done} accent={s.rpe >= 9 ? CORAL : (s.rpe >= 8 ? GOLD : TEAL)} />
                <span style={{
                  width: 22, height: 22, borderRadius: 11,
                  background: s.done ? TEAL : 'transparent',
                  border: s.done ? 0 : `1px solid ${active ? TEAL : HAIR}`,
                  color: PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, justifySelf: 'end',
                }}>{s.done ? '✓' : ''}</span>
              </div>
            );
          })}
        </div>

        {/* Big log button */}
        <div style={{ marginTop: 16, display: 'flex', gap: 8 }}>
          <button style={{
            width: 48, border: `1px solid ${HAIR}`, background: 'transparent',
            borderRadius: 14, cursor: 'pointer', color: INK,
            fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em',
          }}>···</button>
          <button onClick={logSet} disabled={nextSet === -1} style={{
            flex: 1, border: 0, background: nextSet === -1 ? HAIR : TEAL, color: PAPER,
            padding: '14px 18px', borderRadius: 14, cursor: nextSet === -1 ? 'default' : 'pointer',
            fontFamily: SANS, fontSize: 15, fontWeight: 600, letterSpacing: -0.1,
            boxShadow: nextSet === -1 ? 'none' : `0 8px 20px ${TEAL}44`,
          }}>
            {nextSet === -1 ? 'Exercise complete' : `Log set ${nextSet + 1} · ${cur.target.split('×')[1]?.trim() || ''} reps`}
          </button>
        </div>

        {/* Exercise nav — prev/next */}
        <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
          <button onClick={() => setExIdx(Math.max(0, exIdx - 1))} disabled={exIdx === 0} style={{
            flex: 1, border: `1px solid ${HAIR}`, background: 'transparent', color: exIdx === 0 ? INK_45 : INK,
            padding: '11px 12px', borderRadius: 12, cursor: exIdx === 0 ? 'default' : 'pointer',
            fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>← Previous</button>
          <button onClick={() => setExIdx(Math.min(plan.length - 1, exIdx + 1))} disabled={exIdx === plan.length - 1 || nextSet !== -1} style={{
            flex: 2, border: 0, background: nextSet === -1 ? CORAL : HAIR,
            color: PAPER,
            padding: '11px 12px', borderRadius: 12, cursor: nextSet === -1 ? 'pointer' : 'default',
            fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>{nextSet === -1 ? 'Next exercise →' : `Next: ${plan[exIdx + 1]?.name || '—'}`}</button>
        </div>
      </div>

      {/* Up next */}
      <SectionHeader eyebrow="Up next" title="Queue" />
      <div style={{ padding: '0 24px' }}>
        {plan.map((p, i) => {
          if (i === exIdx) return null;
          const pSets = sets[i];
          const pDone = pSets.filter(s => s.done).length === pSets.length;
          return (
            <TrackRow
              key={i}
              n={i + 1}
              state={pDone ? 'done' : undefined}
              title={p.name}
              sub={`${p.target} · ${p.rest}s rest`}
              detail={pDone ? '✓' : pSets[0].weight + ' lb'}
              last={i === plan.length - 1}
            />
          );
        })}
      </div>

      {/* Coach cue */}
      <div style={{ padding: '16px 24px 0' }}>
        <EdCard pad={14} tint="linear-gradient(155deg, rgba(227,122,90,0.10), rgba(227,122,90,0.02))" style={{ border: `1px solid rgba(227,122,90,0.22)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <Attribution init="J" color={CORAL} name="Jordan" role="Live · typing…" />
            <MLabel color={CORAL}>2 min ago</MLabel>
          </div>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 15, lineHeight: 1.35, color: INK, letterSpacing: '-0.01em' }}>
            "Nice first two sets. Hold 155 for the last two — no jump today."
          </div>
        </EdCard>
      </div>

      {/* Finish */}
      <div style={{ padding: '18px 24px 24px' }}>
        <button onClick={onBack} style={{
          width: '100%', border: `1px solid ${HAIR}`, background: 'transparent', color: INK,
          padding: '14px 18px', borderRadius: 14, cursor: 'pointer',
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
        }}>End workout early</button>
      </div>
    </Screen>
  );
}

function SetCell({ v, unit, active, done, accent }) {
  return (
    <div style={{
      padding: '9px 10px', borderRadius: 10,
      border: `1px solid ${active ? TEAL : HAIR_S}`,
      background: active ? 'rgba(30,192,168,0.04)' : 'transparent',
      display: 'flex', alignItems: 'baseline', gap: 3,
      opacity: done ? 0.85 : 1,
    }}>
      <span style={{
        fontFamily: SERIF, fontSize: 17, letterSpacing: '-0.02em',
        color: accent || (done ? INK : (active ? TEAL : INK_45)),
      }}>{v}</span>
      {unit && <span style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.08em' }}>{unit}</span>}
    </div>
  );
}

function MacroChip({ label, v, t, unit, color, pct }) {
  return (
    <div style={{
      border: `1px solid ${HAIR}`, borderRadius: 14, padding: '12px 12px 10px',
      background: 'rgba(242,237,228,0.025)',
    }}>
      <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', color: INK_45, textTransform: 'uppercase' }}>{label}</div>
      <div style={{ marginTop: 4, display: 'flex', alignItems: 'baseline', gap: 3 }}>
        <span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK }}>{v}</span>
        <span style={{ fontFamily: MONO, fontSize: 10, color: INK_45 }}>/{t}{unit || ''}</span>
      </div>
      <div style={{ height: 2, borderRadius: 1, background: HAIR, marginTop: 8, overflow: 'hidden' }}>
        <div style={{ width: `${pct * 100}%`, height: '100%', background: color }} />
      </div>
    </div>
  );
}

function ShortcutCard({ eyebrow, title, sub, tint, accent, onClick }) {
  return (
    <div onClick={onClick} style={{
      borderRadius: 16, padding: 14, border: `1px solid ${HAIR}`, background: tint,
      minHeight: 116, display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
      cursor: onClick ? 'pointer' : 'default',
    }}>
      <MLabel color={accent}>{eyebrow}</MLabel>
      <div>
        <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color: INK, lineHeight: 1 }}>{title}</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 6, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{sub}</div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// DISCOVER
// ═══════════════════════════════════════════════════════════
function ClientDiscover({ onBack }) {
  return (
    <Screen>
      <NavBar
        eyebrow="The Marketplace"
        title={<>Find your<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>people.</em></>}
        trailing={onBack ? <button onClick={onBack} style={{ background: 'transparent', border: 0, color: INK, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>← Back</button> : undefined}
      />

      {/* Search */}
      <div style={{ padding: '0 24px 12px' }}>
        <div style={{
          border: `1px solid ${HAIR}`, borderRadius: 14, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(242,237,228,0.025)',
        }}>
          <Icon name="magnifier" size={16} color={INK_60} />
          <span style={{ fontFamily: SANS, fontSize: 14, color: INK_60, letterSpacing: -0.1 }}>Coaches, plans, playlists…</span>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 24px 4px' }}>
        {['All', 'Trainers', 'Nutritionists', 'Strength', 'Running', 'Cut'].map((p, i) => (
          <div key={p} style={{
            flexShrink: 0, padding: '8px 14px', borderRadius: 16,
            border: i === 0 ? `1px solid ${TEAL}` : `1px solid ${HAIR}`,
            background: i === 0 ? 'rgba(30,192,168,0.08)' : 'transparent',
            color: i === 0 ? TEAL : INK, fontFamily: MONO, fontSize: 10.5,
            letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>{p}</div>
        ))}
      </div>

      {/* Featured — quote card like Spotify playlist reference */}
      <SectionHeader eyebrow="Coach of the week" title="Jordan Chen" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={20} tint="linear-gradient(160deg, rgba(227,122,90,0.16), rgba(227,122,90,0.02))" style={{ border: `1px solid rgba(227,122,90,0.25)` }}>
          <div style={{
            fontFamily: SERIF, fontStyle: 'italic', fontSize: 21, lineHeight: 1.25,
            color: INK, letterSpacing: '-0.01em',
          }}>
            "I don't write you a program. I write you the next 12 weeks of your life — then we adjust."
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
            <Attribution init="J" color={CORAL} name="Jordan Chen" role="Hypertrophy · SF" />
            <PlayFab color={CORAL}>→</PlayFab>
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HAIR_S}` }}>
            <MLabel color={CORAL}>Tracklist</MLabel>
            <div style={{ marginTop: 6 }}>
              <TrackRow n={1} title="Push / Pull / Legs" sub="12 weeks · 48 on it" detail="$120/mo" />
              <TrackRow n={2} title="First Pullup" sub="6 weeks · 14 on it" detail="$95" />
              <TrackRow n={3} title="Intro call" sub="30 min · free" detail="Book" last />
            </div>
          </div>
        </EdCard>
      </div>

      {/* FEATURED COACHES */}
      <SectionHeader eyebrow="Featured" title="This week" action="See all" />
      <div style={{ display: 'flex', gap: 12, overflowX: 'auto', padding: '0 24px 4px' }}>
        {[
          { init: 'S', name: 'Sam Ortega', tag: 'Running & HIIT', rating: '4.8', price: '$95/mo', color: TEAL },
          { init: 'M', name: 'Dr. Maya Patel', tag: 'Sports nutrition', rating: '5.0', price: '$160/mo', color: GOLD },
          { init: 'R', name: 'Rhea Kapoor', tag: 'Yoga & mobility', rating: '4.9', price: '$110/mo', color: PLUM },
        ].map(c => (
          <div key={c.name} style={{
            flexShrink: 0, width: 220, border: `1px solid ${HAIR}`, borderRadius: 18, overflow: 'hidden',
            background: 'rgba(242,237,228,0.025)',
          }}>
            <div style={{
              height: 130, position: 'relative',
              background: `linear-gradient(160deg, ${c.color}40, ${c.color}10)`,
            }}>
              <div style={{ position: 'absolute', left: 14, top: 14 }}><MLabel color={c.color}>{c.tag}</MLabel></div>
              <div style={{ position: 'absolute', right: 14, bottom: 14 }}>
                <AvatarChip init={c.init} color={c.color} size={48} />
              </div>
            </div>
            <div style={{ padding: 14 }}>
              <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1 }}>{c.name}</div>
              <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <MStats items={['★ ' + c.rating, c.price]} />
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* PROGRAMS */}
      <SectionHeader eyebrow="Programs" title="Start a thing" action="All" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="Couch → 5K" sub="Running · 8 weeks" detail="$45" />
        <TrackRow n={2} title="First Pullup" sub="Calisthenics · 6 weeks" detail="$95" />
        <TrackRow n={3} title="Fat Loss 101" sub="Cut + strength · 12 weeks" detail="$160" />
        <TrackRow n={4} title="Deload Week" sub="Recovery · 1 week" detail="Free" last />
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════
// Reusable: day strip (M T W T F S S + date + dot)
// ═══════════════════════════════════════════════════════════
function DayStrip({ days, active, onPick }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: '0 24px 20px' }}>
      {days.map((x, i) => {
        const isActive = x.n === active;
        const dotColor = x.done ? TEAL : (isActive ? TEAL : (x.planned ? INK_30 : 'transparent'));
        return (
          <button
            key={i}
            onClick={() => onPick && onPick(x.n)}
            style={{
              flex: 1, aspectRatio: '0.66 / 1', borderRadius: 12, padding: 0,
              border: isActive ? `1px solid ${TEAL}` : `1px solid ${HAIR}`,
              background: isActive ? 'rgba(30,192,168,0.08)' : 'transparent',
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4,
              cursor: 'pointer', fontFamily: 'inherit',
              transition: 'background 0.15s ease, border-color 0.15s ease',
            }}
          >
            <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.18em', color: isActive ? TEAL : INK_45 }}>{x.d}</div>
            <div style={{ fontFamily: SERIF, fontSize: 20, color: INK }}>{x.n}</div>
            <div style={{ width: 4, height: 4, borderRadius: 2, background: dotColor }} />
          </button>
        );
      })}
    </div>
  );
}

function ClientTrain({ onRadio, onWorkout }) {
  const [day, setDay] = useStateC(21);
  const DAYS = [
    {
      d: 'M', n: 20, done: true,
      eyebrow: 'Yesterday · Mon · 9 am',
      titlePre: 'Push', titleEm: 'day.',
      card: { eyebrow: 'Completed · Mon 9:12 am', wd: 'W6 · D3',
        name: 'Upper Push —', emph: 'Done.',
        stats: ['48 min', '5 moves', 'RPE 8', '~380 kcal'],
        cta: '✓', tint: 'linear-gradient(155deg, rgba(30,192,168,0.10), rgba(30,192,168,0.02))',
        border: 'rgba(30,192,168,0.20)' },
      movesTitle: '5 moves', movesAction: 'Recap',
      moves: [
        { t: 'Bench press', s: '4 × 6 · 3 min rest', v: '185 lb', state: 'done' },
        { t: 'OHP', s: '4 × 8 · 2 min rest', v: '115 lb', state: 'done' },
        { t: 'Incline DB press', s: '3 × 10 · 90s rest', v: '55 lb', state: 'done' },
        { t: 'Lateral raise', s: '3 × 15 · 60s rest', v: '20 lb', state: 'done' },
        { t: 'Tricep rope', s: '3 × 12 · 60s rest', v: '45 lb', state: 'done' },
      ],
      plName: 'Push heavy.', plMeta: ['100-140 BPM', '28 tracks', '1h 32m'], plTag: 'Attached · Push day',
    },
    {
      d: 'T', n: 21, today: true,
      eyebrow: 'Today · Tue · 9 am',
      titlePre: 'Pull', titleEm: 'day.',
      card: { eyebrow: 'Today · 9 am', wd: 'W6 · D4',
        name: 'Upper Pull —', emph: 'Peak.',
        stats: ['52 min', '6 moves', 'RPE 8', '~420 kcal'],
        cta: '▶', tint: 'linear-gradient(155deg, rgba(30,192,168,0.16), rgba(30,192,168,0.03))',
        border: 'rgba(30,192,168,0.25)' },
      movesTitle: '6 moves', movesAction: 'Swap',
      moves: [
        { t: 'Pull-up', s: '4 × 6-8 · 3 min rest', v: '42 lb +' },
        { t: 'Barbell row', s: '4 × 8 · 2 min rest', v: '155 lb' },
        { t: 'Chest-sup. row', s: '3 × 10-12 · 90s rest', v: '60 lb' },
        { t: 'Face pull', s: '3 × 15 · 60s rest', v: '40 lb' },
        { t: 'Incline curl', s: '3 × 12 · 60s rest', v: '30 lb' },
        { t: 'Farmer carry', s: '3 × 40m · 60s rest', v: '88 lb ea' },
      ],
      plName: 'Pull heavy.', plMeta: ['95-138 BPM', '31 tracks', '1h 48m'], plTag: 'Attached · Pull day',
    },
    {
      d: 'W', n: 22,
      eyebrow: 'Wed · 7 am',
      titlePre: 'Condition', titleEm: 'day.',
      card: { eyebrow: 'Wed · 7 am', wd: 'W6 · D5',
        name: 'Conditioning —', emph: 'Z2.',
        stats: ['25 min', '1 move', 'HR 140', '~260 kcal'],
        cta: '▶', tint: 'linear-gradient(155deg, rgba(30,192,168,0.12), rgba(30,192,168,0.02))',
        border: 'rgba(30,192,168,0.22)' },
      movesTitle: '1 block', movesAction: 'Swap',
      moves: [
        { t: 'Rower — steady', s: '25 min · Z2 · nasal breathing', v: 'HR 135-145' },
      ],
      plName: 'Easy miles.', plMeta: ['120-135 BPM', '18 tracks', '45m'], plTag: 'Attached · Z2',
    },
    {
      d: 'T', n: 23, planned: 'Pull',
      eyebrow: 'Thu · 9 am',
      titlePre: 'Pull', titleEm: 'day.',
      card: { eyebrow: 'Thu · 9 am', wd: 'W6 · D6',
        name: 'Pull — ', emph: 'Deload.',
        stats: ['42 min', '5 moves', 'RPE 6', '~300 kcal'],
        cta: '▶', tint: 'linear-gradient(155deg, rgba(30,192,168,0.14), rgba(30,192,168,0.02))',
        border: 'rgba(30,192,168,0.22)' },
      movesTitle: '5 moves', movesAction: 'Swap',
      moves: [
        { t: 'Pull-up', s: '3 × 5 · 2 min rest', v: 'BW' },
        { t: 'Barbell row', s: '3 × 8 · 2 min rest', v: '125 lb' },
        { t: 'Lat pulldown', s: '3 × 10 · 90s rest', v: '120 lb' },
        { t: 'Face pull', s: '3 × 15 · 60s rest', v: '35 lb' },
        { t: 'Hammer curl', s: '3 × 12 · 60s rest', v: '25 lb' },
      ],
      plName: 'Pull medium.', plMeta: ['95-125 BPM', '22 tracks', '1h 10m'], plTag: 'Attached · Deload',
    },
    {
      d: 'F', n: 24, planned: 'Legs',
      eyebrow: 'Fri · 9 am',
      titlePre: 'Leg', titleEm: 'day.',
      card: { eyebrow: 'Fri · 9 am', wd: 'W6 · D7',
        name: 'Lower —', emph: 'Peak.',
        stats: ['58 min', '5 moves', 'RPE 9', '~480 kcal'],
        cta: '▶', tint: 'linear-gradient(155deg, rgba(30,192,168,0.16), rgba(30,192,168,0.03))',
        border: 'rgba(30,192,168,0.25)' },
      movesTitle: '5 moves', movesAction: 'Swap',
      moves: [
        { t: 'Back squat', s: '4 × 5 · 3 min rest', v: '225 lb' },
        { t: 'Romanian DL', s: '4 × 8 · 2 min rest', v: '185 lb' },
        { t: 'Walking lunge', s: '3 × 20 steps · 90s rest', v: '35 lb ea' },
        { t: 'Leg curl', s: '3 × 12 · 60s rest', v: '70 lb' },
        { t: 'Calf raise', s: '4 × 15 · 45s rest', v: '90 lb' },
      ],
      plName: 'Squat grind.', plMeta: ['90-125 BPM', '26 tracks', '1h 22m'], plTag: 'Attached · Legs',
    },
    {
      d: 'S', n: 25,
      eyebrow: 'Sat · active rest',
      titlePre: 'Rest', titleEm: 'day.',
      card: { eyebrow: 'Sat · open window', wd: 'W6 · Rest',
        name: 'Active rest —', emph: 'Walk.',
        stats: ['40 min', 'mobility', 'HR 110', '~180 kcal'],
        cta: '▶', tint: 'linear-gradient(155deg, rgba(30,192,168,0.08), rgba(30,192,168,0.02))',
        border: 'rgba(30,192,168,0.18)' },
      movesTitle: '2 blocks', movesAction: 'Open',
      moves: [
        { t: 'Easy walk', s: '30 min · outdoors · conversational', v: 'HR 105-115' },
        { t: 'Hip mobility flow', s: '10 min · 8 positions', v: 'video' },
      ],
      plName: 'Slow walk.', plMeta: ['75-95 BPM', '14 tracks', '50m'], plTag: 'Attached · Recovery',
    },
    {
      d: 'S', n: 26,
      eyebrow: 'Sun · 8 am',
      titlePre: 'Long', titleEm: 'run.',
      card: { eyebrow: 'Sun · 8 am', wd: 'W6 · Bonus',
        name: 'Long Z2 —', emph: 'Riverside.',
        stats: ['1h 50m', '10 km', 'HR 145', '~680 kcal'],
        cta: '▶', tint: 'linear-gradient(155deg, rgba(30,192,168,0.14), rgba(30,192,168,0.03))',
        border: 'rgba(30,192,168,0.22)' },
      movesTitle: '1 block', movesAction: 'Route',
      moves: [
        { t: 'Riverside run', s: '1h 50m · Z2 · nasal if possible', v: 'HR 140-150' },
      ],
      plName: 'Riverside long run', plMeta: ['160-172 BPM', '24 tracks', '1h 50m'], plTag: 'Attached · Long Z2',
    },
  ];
  const cur = DAYS.find(x => x.n === day) || DAYS[1];
  return (
    <Screen>
      <NavBar eyebrow={cur.eyebrow} title={<>{cur.titlePre}<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>{cur.titleEm}</em></>} />

      <DayStrip days={DAYS} active={day} onPick={setDay} />

      {/* HERO: day card with START */}
      <div style={{ padding: '0 24px' }}>
        <EdCard tint={cur.card.tint} style={{ border: `1px solid ${cur.card.border}` }} pad={20}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MLabel color={TEAL}>{cur.card.eyebrow}</MLabel>
            <MLabel>{cur.card.wd}</MLabel>
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontSize: 30, lineHeight: 1, letterSpacing: '-0.03em', color: INK }}>
            {cur.card.name} <em style={{ fontStyle: 'italic', color: TEAL }}>{cur.card.emph}</em>
          </div>
          <div style={{ marginTop: 8 }}>
            <MStats items={cur.card.stats} />
          </div>
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution init="J" color={CORAL} name="Jordan Chen" role="Coach" />
            <PlayFab color={TEAL} onClick={onWorkout}>{cur.card.cta}</PlayFab>
          </div>
        </EdCard>
      </div>

      {/* Exercise tracklist */}
      <SectionHeader eyebrow="Tracklist" title={cur.movesTitle} action={cur.movesAction} />
      <div style={{ padding: '0 24px' }}>
        {cur.moves.map((m, i) => (
          <TrackRow
            key={`${cur.n}-${i}`}
            n={i + 1}
            title={m.t}
            sub={m.s}
            detail={m.v}
            state={m.state}
            last={i === cur.moves.length - 1}
          />
        ))}
      </div>

      {/* This week */}
      <SectionHeader eyebrow="This week" title="On deck" action="Plan" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="Conditioning" sub="Thu · 25 min · Z2" state="done" />
        <TrackRow n={2} title="Lower Body — Peak" sub="Fri · 55 min" detail="W6 · D5" />
        <TrackRow n={3} title="Active rest" sub="Sat · walk + mobility" detail="40 min" last />
      </div>

      {/* Playlists from your coach */}
      <SectionHeader eyebrow="From Jordan" title="Playlists" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16} tint="linear-gradient(135deg, rgba(227,122,90,0.12), rgba(227,122,90,0.02))" style={{ border: `1px solid rgba(227,122,90,0.28)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }} onClick={onRadio}>
            <div style={{
              width: 56, height: 56, borderRadius: 10,
              background: `linear-gradient(135deg, ${CORAL}, #b8523c)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SERIF, fontSize: 22, color: '#fff',
            }}>♪</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: CORAL, textTransform: 'uppercase' }}>{cur.plTag}</div>
              <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1.1, marginTop: 3 }}>{cur.plName}</div>
              <div style={{ marginTop: 5 }}><MStats items={cur.plMeta} color={CORAL} /></div>
            </div>
            <PlayFab size={40} color={CORAL}>▶</PlayFab>
          </div>
        </EdCard>

        {/* Other playlists from coach */}
        <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <CoachPlaylistRow
            init="J" color={CORAL} by="Jordan Chen" role="Your coach"
            title="Riverside long run" meta="1h 50m · 160–172 BPM · 24 tracks"
            attached="Sat Z2 run"
          />
          <CoachPlaylistRow
            init="J" color={CORAL} by="Jordan Chen" role="Your coach"
            title="Deload mobility" meta="35m · 80–95 BPM · 11 tracks"
            attached="Wed recovery"
          />
        </div>
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

function CoachPlaylistRow({ init, color, by, role, title, meta, attached, onClick }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
      border: `1px solid ${HAIR}`,
    }}>
      <AvatarChip init={init} color={color} size={40} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: color, textTransform: 'uppercase' }}>
          {by} · {role}
        </div>
        <div style={{ fontFamily: SERIF, fontSize: 16, letterSpacing: '-0.02em', color: INK, marginTop: 3, lineHeight: 1.15 }}>
          {title}
        </div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 3, letterSpacing: '0.06em' }}>
          {meta}{attached ? ` · ${attached}` : ''}
        </div>
      </div>
      <div style={{
        width: 32, height: 32, borderRadius: 16, background: `${color}18`,
        color: color, display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, flexShrink: 0,
      }}>▶</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// EAT
// ═══════════════════════════════════════════════════════════
function ClientEat({ onGrocery, onRadio }) {
  const [day, setDay] = useStateC(21);
  const DAYS = [
    {
      d: 'M', n: 20, done: true,
      eyebrow: 'Mon · Cut · Week 6',
      titlePre: 'Mon you', titleEm: 'ate.',
      kcal: '2,084', target: '2,100', pct: 0.99, left: '16 kcal left',
      pace: 'on pace', rightLabel: '—',
      macros: { p: { v: '168', t: '165', pct: 1.0 }, c: { v: '232', t: '240', pct: 0.97 }, f: { v: '60', t: '62', pct: 0.97 } },
      meals: [
        { n: 1, t: 'Oats, berries, whey', s: '412 kcal · 32P / 58C / 8F', dt: '7:20 AM', state: 'done' },
        { n: 2, t: 'Chicken rice bowl', s: '612 kcal · 48P / 68C / 9F', dt: '12:40 PM', state: 'done' },
        { n: 3, t: 'Greek yogurt + almonds', s: '280 kcal · 22P / 18C / 12F', dt: '4:10 PM', state: 'done' },
        { n: 4, t: 'Salmon, quinoa, greens', s: '780 kcal · 66P / 88C / 31F', dt: '8:05 PM', state: 'done' },
      ],
    },
    {
      d: 'T', n: 21, today: true,
      eyebrow: 'Today · Cut · Week 6',
      titlePre: 'Today you', titleEm: 'ate.',
      kcal: '1,568', target: '2,100', pct: 0.74, left: '532 kcal left',
      pace: 'on pace', rightLabel: '—',
      macros: { p: { v: '118', t: '165', pct: 0.72 }, c: { v: '156', t: '240', pct: 0.65 }, f: { v: '42', t: '62', pct: 0.68 } },
      meals: [
        { n: 1, t: 'Oats, berries, whey', s: '412 kcal · 32P / 58C / 8F', dt: '7:20 AM', state: 'done' },
        { n: 2, t: 'Chicken rice bowl', s: '612 kcal · 48P / 68C / 9F', dt: '12:40 PM', state: 'done' },
        { n: 3, t: 'Greek yogurt + almonds', s: '280 kcal · 22P / 18C / 12F · LOG NOW', dt: '4:00 PM', state: 'next' },
        { n: 4, t: 'Salmon, quinoa, greens', s: '580 kcal · 44P / 48C / 22F', dt: '7:30 PM' },
      ],
    },
    {
      d: 'W', n: 22, planned: true,
      eyebrow: 'Wed · Cut · Week 6',
      titlePre: 'Wed plans', titleEm: '2,050.',
      kcal: '0', target: '2,050', pct: 0.0, left: 'full day ahead',
      pace: 'planned', rightLabel: '—',
      macros: { p: { v: '0', t: '160', pct: 0 }, c: { v: '0', t: '230', pct: 0 }, f: { v: '0', t: '60', pct: 0 } },
      meals: [
        { n: 1, t: 'Eggs, avocado toast', s: '485 kcal · 28P / 42C / 22F', dt: '7:15 AM' },
        { n: 2, t: 'Turkey wrap + soup', s: '560 kcal · 42P / 58C / 16F', dt: '12:30 PM' },
        { n: 3, t: 'Apple + peanut butter', s: '260 kcal · 8P / 28C / 14F', dt: '3:45 PM' },
        { n: 4, t: 'Beef stir-fry, rice', s: '745 kcal · 52P / 82C / 18F', dt: '7:15 PM' },
      ],
    },
    {
      d: 'T', n: 23, planned: true,
      eyebrow: 'Thu · Cut · Week 6',
      titlePre: 'Thu plans', titleEm: '2,050.',
      kcal: '0', target: '2,050', pct: 0.0, left: 'full day ahead',
      pace: 'planned', rightLabel: '—',
      macros: { p: { v: '0', t: '160', pct: 0 }, c: { v: '0', t: '230', pct: 0 }, f: { v: '0', t: '60', pct: 0 } },
      meals: [
        { n: 1, t: 'Protein smoothie', s: '420 kcal · 38P / 48C / 10F', dt: '7:30 AM' },
        { n: 2, t: 'Tuna salad + pita', s: '520 kcal · 44P / 44C / 16F', dt: '12:30 PM' },
        { n: 3, t: 'Cottage cheese + fruit', s: '240 kcal · 24P / 22C / 6F', dt: '4:00 PM' },
        { n: 4, t: 'Chicken tacos, beans', s: '870 kcal · 54P / 88C / 28F', dt: '7:30 PM' },
      ],
    },
    {
      d: 'F', n: 24, planned: true,
      eyebrow: 'Fri · Cut · Week 6',
      titlePre: 'Fri plans', titleEm: '2,200.',
      kcal: '0', target: '2,200', pct: 0.0, left: 'refeed +150',
      pace: 'refeed', rightLabel: '—',
      macros: { p: { v: '0', t: '165', pct: 0 }, c: { v: '0', t: '280', pct: 0 }, f: { v: '0', t: '58', pct: 0 } },
      meals: [
        { n: 1, t: 'Oats, banana, whey', s: '480 kcal · 34P / 72C / 8F', dt: '7:00 AM' },
        { n: 2, t: 'Chicken + rice + veg', s: '680 kcal · 54P / 92C / 12F', dt: '12:30 PM' },
        { n: 3, t: 'Rice cakes + honey', s: '220 kcal · 6P / 48C / 2F', dt: '4:00 PM' },
        { n: 4, t: 'Pasta + meatballs', s: '820 kcal · 58P / 98C / 24F', dt: '7:30 PM' },
      ],
    },
    {
      d: 'S', n: 25,
      eyebrow: 'Sat · Cut · flex day',
      titlePre: 'Sat flex', titleEm: 'open.',
      kcal: '—', target: '2,100', pct: 0.0, left: 'flex day',
      pace: 'eat intuitive', rightLabel: '—',
      macros: { p: { v: '—', t: '160', pct: 0 }, c: { v: '—', t: '230', pct: 0 }, f: { v: '—', t: '60', pct: 0 } },
      meals: [
        { n: 1, t: 'Brunch out', s: 'estimate · log after', dt: '10:30 AM' },
        { n: 2, t: 'Snack', s: '—', dt: '3:00 PM' },
        { n: 3, t: 'Dinner out', s: 'estimate · protein + veg', dt: '7:30 PM' },
      ],
    },
    {
      d: 'S', n: 26,
      eyebrow: 'Sun · prep + run fuel',
      titlePre: 'Sun prep', titleEm: '2,300.',
      kcal: '0', target: '2,300', pct: 0.0, left: 'long run day',
      pace: 'higher carbs', rightLabel: '—',
      macros: { p: { v: '0', t: '160', pct: 0 }, c: { v: '0', t: '320', pct: 0 }, f: { v: '0', t: '58', pct: 0 } },
      meals: [
        { n: 1, t: 'Pre-run toast + banana', s: '320 kcal · 8P / 62C / 4F', dt: '7:15 AM' },
        { n: 2, t: 'Post-run smoothie', s: '480 kcal · 36P / 68C / 6F', dt: '10:30 AM' },
        { n: 3, t: 'Rice bowl + salmon', s: '720 kcal · 48P / 88C / 18F', dt: '1:30 PM' },
        { n: 4, t: 'Prep tastings + dinner', s: '780 kcal · 56P / 82C / 22F', dt: '7:00 PM' },
      ],
    },
  ];
  const cur = DAYS.find(x => x.n === day) || DAYS[1];
  return (
    <Screen>
      <NavBar eyebrow={cur.eyebrow} title={<>{cur.titlePre}<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>{cur.titleEm}</em></>} trailing={<IconBtn><Icon name="camera" size={16} color={INK} /></IconBtn>} />

      <DayStrip days={DAYS} active={day} onPick={setDay} />

      {/* Big kcal figure */}
      <div style={{ padding: '0 24px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <div style={{ fontFamily: SERIF, fontSize: 72, lineHeight: 0.9, letterSpacing: '-0.04em', color: INK }}>{cur.kcal}</div>
          <div style={{ fontFamily: MONO, fontSize: 12, color: INK_45, letterSpacing: '0.1em' }}>/ {cur.target} KCAL</div>
        </div>
        <div style={{ height: 3, background: HAIR, marginTop: 12, borderRadius: 2, overflow: 'hidden' }}>
          <div style={{ width: `${Math.min(100, cur.pct * 100)}%`, height: '100%', background: TEAL, transition: 'width 0.25s ease' }} />
        </div>
        <div style={{ marginTop: 10, display: 'flex', justifyContent: 'space-between' }}>
          <MStats items={[cur.left, cur.pace]} color={TEAL} />
          <MLabel>{cur.rightLabel}</MLabel>
        </div>
      </div>

      {/* Macro chips */}
      <div style={{ padding: '20px 24px 0', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <MacroChip label="Protein" v={cur.macros.p.v} t={cur.macros.p.t} color={CORAL} pct={cur.macros.p.pct} />
        <MacroChip label="Carbs" v={cur.macros.c.v} t={cur.macros.c.t} color={GOLD} pct={cur.macros.c.pct} />
        <MacroChip label="Fat" v={cur.macros.f.v} t={cur.macros.f.t} color={PLUM} pct={cur.macros.f.pct} />
      </div>

      {/* Meals tracklist */}
      <SectionHeader eyebrow="Tracklist" title={cur.n === 21 ? "Today's meals" : `${cur.d === 'M' ? 'Mon' : cur.d === 'W' ? 'Wed' : cur.d === 'F' ? 'Fri' : cur.n === 23 ? 'Thu' : cur.n === 25 ? 'Sat' : 'Sun'} meals`} action="Log" />
      <div style={{ padding: '0 24px' }}>
        {cur.meals.map((m, i) => (
          <TrackRow
            key={`${cur.n}-${i}`}
            n={m.n}
            state={m.state}
            title={m.t}
            sub={m.s}
            detail={m.dt}
            last={i === cur.meals.length - 1}
          />
        ))}
      </div>

      {/* Plan attribution */}
      <SectionHeader eyebrow="Your plan" title="Cutting · 2,100" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={18} tint="linear-gradient(155deg, rgba(217,178,106,0.14), rgba(217,178,106,0.02))" style={{ border: `1px solid rgba(217,178,106,0.25)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution init="M" color={GOLD} name="Dr. Maya Patel" role="Nutritionist" />
            <MLabel>Apr plan</MLabel>
          </div>
          <div style={{
            marginTop: 14, fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, lineHeight: 1.3,
            letterSpacing: '-0.01em', color: INK,
          }}>
            "Hit protein first, then carbs around training. The 4pm snack isn't optional — it's what keeps dinner simple."
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HAIR_S}`, display: 'flex', gap: 10 }}>
            <Pill color={GOLD} onClick={onGrocery}>Shop list →</Pill>
            <Pill color={GOLD}>Swap meal</Pill>
          </div>
        </EdCard>
      </div>

      {/* Shop list — prominent entry */}
      <SectionHeader eyebrow="For the week" title="Shop list" action="Open →" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16} onClick={onGrocery} tint="linear-gradient(135deg, rgba(227,122,90,0.12), rgba(227,122,90,0.02))" style={{ border: `1px solid rgba(227,122,90,0.25)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${CORAL}, #b8523c)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SERIF, fontSize: 20, color: PAPER,
            }}>◎</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: CORAL, textTransform: 'uppercase' }}>
                Refreshed Sun · Maya
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1.1, marginTop: 4 }}>
                12 items for the week.
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, letterSpacing: '0.06em', marginTop: 4 }}>
                5 DONE · 7 LEFT · PRODUCE, PROTEIN, PANTRY
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 11, color: CORAL, letterSpacing: '0.14em' }}>→</div>
          </div>
        </EdCard>
      </div>

      <SectionHeader eyebrow="This week" title="You trended" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16}>
          <MStats items={['avg 1,892 kcal', '-0.4 kg', '92% adherent']} color={TEAL} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 14, height: 64 }}>
            {[0.62, 0.78, 0.70, 0.85, 0.74, 0.66, 0.74].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${v * 100}%`, background: i === 6 ? TEAL : HAIR, borderRadius: 2 }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: INK_45, letterSpacing: '0.1em' }}>{'MTWTFSS'[i]}</div>
              </div>
            ))}
          </div>
        </EdCard>
      </div>

      {/* From your nutritionist */}
      <SectionHeader eyebrow="From Maya" title="Playlists" />
      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <CoachPlaylistRow
          init="M" color={GOLD} by="Maya Patel" role="Your nutritionist"
          title="Sunday prep, low-pressure" meta="45m · 85–100 BPM · 12 tracks"
          attached="8 meals prep"
          onClick={onRadio}
        />
        <CoachPlaylistRow
          init="M" color={GOLD} by="Maya Patel" role="Your nutritionist"
          title="Weeknight cook" meta="30m · 95–110 BPM · 9 tracks"
          attached="Tue/Thu dinners"
          onClick={onRadio}
        />
        <CoachPlaylistRow
          init="M" color={GOLD} by="Maya Patel" role="Your nutritionist"
          title="Slow breakfast" meta="20m · 80 BPM · 6 tracks"
          attached="Weekend mornings"
          onClick={onRadio}
        />
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════
// ME
// ═══════════════════════════════════════════════════════════
function ClientMe({ onLogout, onCommunity, onDiscover }) {
  return (
    <Screen>
      <NavBar eyebrow="Member · 14 week streak" title={<>Alex<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>Rivera.</em></>} trailing={<IconBtn><Icon name="gear" size={16} color={INK} /></IconBtn>} />

      {/* Shape score — big serif number */}
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={22} tint="linear-gradient(145deg, rgba(217,178,106,0.14), rgba(30,192,168,0.04))" style={{ border: `1px solid rgba(217,178,106,0.22)` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <MLabel color={GOLD}>Shape Score</MLabel>
              <div style={{ fontFamily: SERIF, fontSize: 92, lineHeight: 0.85, letterSpacing: '-0.05em', color: INK, marginTop: 8 }}>
                78<span style={{ fontSize: 26, color: INK_45 }}>/100</span>
              </div>
              <div style={{ marginTop: 10 }}><MStats items={['+4 this week', 'top 18%']} color={TEAL} /></div>
            </div>
            <div style={{
              width: 82, height: 82, borderRadius: 41,
              background: `conic-gradient(${GOLD} 0deg 281deg, ${HAIR} 281deg)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{
                width: 68, height: 68, borderRadius: 34, background: PAPER,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: SERIF, fontSize: 22, color: GOLD,
              }}>78</div>
            </div>
          </div>

          {/* Score breakdown bars */}
          <div style={{ marginTop: 20, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { k: 'Train', v: 0.88, n: '88' },
              { k: 'Nutrition', v: 0.74, n: '74' },
              { k: 'Recovery', v: 0.62, n: '62' },
              { k: 'Consistency', v: 0.92, n: '92' },
            ].map(r => (
              <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 88 }}><MLabel>{r.k}</MLabel></div>
                <div style={{ flex: 1, height: 3, background: HAIR, borderRadius: 2, overflow: 'hidden' }}>
                  <div style={{ width: `${r.v * 100}%`, height: '100%', background: TEAL }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 11, color: INK_60, letterSpacing: '0.08em' }}>{r.n}</div>
              </div>
            ))}
          </div>
        </EdCard>
      </div>

      {/* Team */}
      <SectionHeader eyebrow="Your team" title="Coaches" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="Jordan Chen" sub="Coach · Hypertrophy · SF" detail="Msg 3" onClick={() => {}} />
        <TrackRow n={2} title="Dr. Maya Patel" sub="Nutritionist · Consult Thu" detail="—" last />
      </div>

      {/* Quick stacks */}
      <SectionHeader eyebrow="Shortcuts" title="Your stuff" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} state="next" title="Marketplace" sub="Find coaches, plans, programs" detail="→" accent={TEAL} onClick={onDiscover} />
        <TrackRow n={2} title="Rewards" sub="340 pts · 3 to redeem" detail="→" />
        <TrackRow n={3} title="Team" sub="Riverside Runners · 12 members" detail="→" onClick={onCommunity} />
        <TrackRow n={4} title="Connected apps" sub="Apple Health · Strava · WHOOP" detail="→" />
        <TrackRow n={5} title="Subscription" sub="Shape Member · next Apr 30" detail="→" last />
      </div>

      {/* Sign out */}
      <div style={{ padding: '26px 24px 12px' }}>
        <button onClick={onLogout} style={{
          width: '100%', height: 50, borderRadius: 14, border: `1px solid ${HAIR}`,
          background: 'transparent', color: '#e37a5a',
          fontFamily: MONO, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase',
          cursor: 'pointer',
        }}>Sign out ⎋</button>
      </div>

      <div style={{ height: 12 }} />
    </Screen>
  );
}

Object.assign(window, { ClientApp });
