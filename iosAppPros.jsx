// Trainer + Nutritionist iOS apps — editorial rebuild
// Shared language with Client: Fraunces titles, mono micro-labels, numbered tracklist rows,
// slash-delimited stats, teal accent on next action, attribution chips.

const { useState: useStateT } = React;

// ═══════════════════════════════════════════════════════════
// TRAINER APP
// ═══════════════════════════════════════════════════════════
function TrainerApp({ dark, onLogout, radioOn, setRadioOn }) {
  const [tab, setTab] = useStateT('today');
  const [radio, setRadio] = useStateT(false);
  const [market, setMarket] = useStateT(false);
  if (radio) return <RadioScreen onBack={() => setRadio(false)} />;
  if (market) return <ProMarketplace role="trainer" onBack={() => setMarket(false)} />;
  const openRadio = () => setRadio(true);
  const openMarket = () => setMarket(true);
  const screens = {
    today:    <ProHome role="trainer" onRadio={openRadio} radioOn={radioOn} setRadioOn={setRadioOn} TodayComp={TrainerToday} />,
    clients:  <TrainerClients />,
    programs: <TrainerPrograms />,
    messages: <CommunityChat role="trainer" embedded />,
    me:       <ProfessionalMe onLogout={onLogout} role="trainer" onMarketplace={openMarket} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <TabBar
        active={tab} onChange={setTab}
        tabs={[
          { key: 'today',    icon: 'calendar', label: 'Today' },
          { key: 'clients',  icon: 'people',   label: 'Clients',  fillActive: false },
          { key: 'programs', icon: 'dumbbell', label: 'Programs', fillActive: false },
          { key: 'messages', icon: 'bubble',   label: 'Messages', fillActive: false },
          { key: 'me',       icon: 'person',   label: 'Me' },
        ]}
      />
    </div>
  );
}

function TrainerToday({ onRadio, radioOn = true, setRadioOn = () => {}, proView, setProView, proAccent = CORAL }) {
  return (
    <Screen>
      <NavBar
        eyebrow="Tue · Apr 21 · 4 sessions"
        title={<>Today's<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>schedule.</em></>}
        trailing={<AvatarChip init="J" color={CORAL} size={36} />}
      />

      {proView && setProView && <ProViewSeg view={proView} setView={setProView} accent={proAccent} />}

      {/* Header stats */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <StatChip label="Sessions" v="4" sub="today" />
        <StatChip label="Check-ins" v="7" sub="pending" color={CORAL} />
        <StatChip label="MTD" v="$6.2k" sub="earnings" color={GOLD} />
      </div>

      {/* NEXT SESSION hero */}
      <SectionHeader eyebrow="Next · 9:00 am" title="Sofia · Check-in" />
      <div style={{ padding: '0 24px' }}>
        <EdCard active pad={18}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MLabel color={TEAL}>In 24 min</MLabel>
            <MLabel>W6 · Hypertrophy</MLabel>
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.025em', color: INK }}>
            Squat form <em style={{ fontStyle: 'italic', color: TEAL }}>check.</em>
          </div>
          <div style={{ marginTop: 8 }}>
            <MStats items={['45 min', 'Video · Zoom', 'Notes: depth, brace']} />
          </div>
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution init="S" color={TEAL} name="Sofia Martinez" role="Client · Week 6" />
            <Pill solid>Join →</Pill>
          </div>
        </EdCard>
      </div>

      {/* Day tracklist */}
      <SectionHeader eyebrow="Tracklist" title="Day" action="Calendar" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} state="next" title="Sofia Martinez" sub="09:00 · 45m · CHECK-IN" detail="Zoom" />
        <TrackRow n={2} title="Alex Rivera" sub="11:30 · 60m · Push Day" detail="Gym" />
        <TrackRow n={3} title="Priya Singh" sub="14:00 · 30m · Program review" detail="Call" />
        <TrackRow n={4} title="Marcus Lee" sub="17:00 · 45m · Intro call" detail="Zoom" last />
      </div>

      {/* Needs your eyes */}
      <SectionHeader eyebrow="Inbox" title="Needs your eyes" action="All" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} state="next" title="Sofia · Squat form video" sub="Uploaded 2h ago · 1:42" detail="Review" />
        <TrackRow n={2} title="Priya · Missed Mon session" sub="Waiting 18h · no message" detail="Reach" />
        <TrackRow n={3} title="Marcus · Week 3 review due" sub="Due today · first review" detail="Write" />
        <TrackRow n={4} title="Jamal · OHP +5kg PR" sub="Sunday · celebrate" detail="React" last />
      </div>

      {/* Community */}
      <SectionHeader eyebrow="Community" title="Your feed" action="Open" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16} tint="linear-gradient(135deg, rgba(140,111,168,0.14), rgba(140,111,168,0.02))" style={{ border: `1px solid rgba(140,111,168,0.25)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MLabel color={PLUM}>Shape Pros · 318 online</MLabel>
            <MLabel>3 new</MLabel>
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, lineHeight: 1.3, color: INK, letterSpacing: '-0.01em' }}>
            "How are you all pricing 12-week blocks vs monthly? Seeing churn on the monthly plans…"
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution init="R" color={PLUM} name="Reese Wu" role="Coach · LA" />
            <Pill color={PLUM}>Reply · 24</Pill>
          </div>
        </EdCard>
      </div>

      {/* Week at a glance */}
      <SectionHeader eyebrow="This week" title="17 sessions booked" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16}>
          <MStats items={['$1,820 booked', '92% retention', '3 new intros']} color={TEAL} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 14, height: 60 }}>
            {[3, 5, 4, 4, 3, 2, 0].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${(v / 5) * 100}%`, background: i === 1 ? TEAL : HAIR, borderRadius: 2 }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: INK_45, letterSpacing: '0.1em' }}>{'MTWTFSS'[i]}</div>
              </div>
            ))}
          </div>
        </EdCard>
      </div>

      {/* SHAPE RADIO — coaches listen too */}
      <HomeRadioCard onRadio={onRadio} radioOn={radioOn} setRadioOn={setRadioOn} accent={CORAL} track="Coach Jordan · Power Hour" meta="PLAYLIST · 38 MIN · HEAVY" />

      <div style={{ height: 16 }} />
    </Screen>
  );
}

function StatChip({ label, v, sub, color = TEAL }) {
  return (
    <div style={{ border: `1px solid ${HAIR}`, borderRadius: 14, padding: '12px 12px 10px', background: 'rgba(242,237,228,0.025)' }}>
      <MLabel color={color}>{label}</MLabel>
      <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: INK, marginTop: 4, lineHeight: 1 }}>{v}</div>
      <div style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.14em', textTransform: 'uppercase', marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function TrainerClients() {
  const clients = [
    { name: 'Sofia Martinez', program: 'Hypertrophy · W6', streak: '14d', state: 'On track', stateColor: TEAL, color: TEAL },
    { name: 'Alex Rivera', program: 'Push/Pull/Legs · W4', streak: '8d', state: 'On track', stateColor: TEAL, color: CORAL },
    { name: 'Priya Singh', program: 'Fat Loss 101 · W3', streak: '0d', state: 'Missed', stateColor: '#e37a5a', color: PLUM },
    { name: 'Marcus Lee', program: 'Intro · W1', streak: '3d', state: 'New', stateColor: GOLD, color: GOLD },
    { name: 'Jamal Green', program: 'Strength · W9', streak: '21d', state: 'PR', stateColor: TEAL, color: '#5ac8fa' },
  ];
  return (
    <Screen>
      <NavBar eyebrow="17 active · +3 this month" title={<>Your<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>clients.</em></>} trailing={<IconBtn><Icon name="plus" size={16} color={INK}/></IconBtn>} />

      <div style={{ padding: '0 24px 12px' }}>
        <div style={{
          border: `1px solid ${HAIR}`, borderRadius: 14, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(242,237,228,0.025)',
        }}>
          <Icon name="magnifier" size={16} color={INK_60} />
          <span style={{ fontFamily: SANS, fontSize: 14, color: INK_60, letterSpacing: -0.1 }}>Search 17 clients</span>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '0 24px 14px' }}>
        {['All', 'On track', 'Needs eyes', 'New', 'Cut', 'Strength'].map((p, i) => (
          <div key={p} style={{
            flexShrink: 0, padding: '8px 14px', borderRadius: 16,
            border: i === 0 ? `1px solid ${TEAL}` : `1px solid ${HAIR}`,
            background: i === 0 ? 'rgba(30,192,168,0.08)' : 'transparent',
            color: i === 0 ? TEAL : INK, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
          }}>{p}</div>
        ))}
      </div>

      {/* Client rows — editorial */}
      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {clients.map((c, i) => (
          <EdCard key={c.name} pad={14}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <AvatarChip init={c.name[0]} color={c.color} size={44} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1 }}>{c.name}</div>
                <div style={{ marginTop: 5 }}><MStats items={[c.program, c.streak + ' streak']} /></div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{
                  display: 'inline-block', padding: '4px 9px', borderRadius: 10,
                  border: `1px solid ${c.stateColor}55`, background: c.stateColor + '14',
                  fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.16em',
                  color: c.stateColor, textTransform: 'uppercase',
                }}>{c.state}</div>
              </div>
            </div>
          </EdCard>
        ))}
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

function TrainerPrograms() {
  return (
    <Screen>
      <NavBar eyebrow="4 published · 1 draft" title={<>Your<br/><em style={{ fontStyle: 'italic', color: TEAL, fontWeight: 500 }}>programs.</em></>} trailing={<IconBtn><Icon name="plus" size={16} color={INK}/></IconBtn>} />

      {/* Top seller hero */}
      <div style={{ padding: '0 24px' }}>
        <EdCard active pad={20} tint="linear-gradient(155deg, rgba(30,192,168,0.14), rgba(30,192,168,0.02))">
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <MLabel color={TEAL}>Top seller</MLabel>
            <MLabel>$120/mo</MLabel>
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontSize: 28, lineHeight: 1, letterSpacing: '-0.03em', color: INK }}>
            Push / Pull / <em style={{ fontStyle: 'italic', color: TEAL }}>Legs.</em>
          </div>
          <div style={{ marginTop: 8 }}>
            <MStats items={['12 weeks', '48 on it', '$5,760 MRR', '4.9 ★']} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <Pill solid>Edit</Pill>
            <Pill>Duplicate</Pill>
            <Pill>Share →</Pill>
          </div>
        </EdCard>
      </div>

      {/* Program tracklist */}
      <SectionHeader eyebrow="Tracklist" title="Catalogue" action="Sort" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="Push / Pull / Legs" sub="12 wk · 48 on it · 4.9 ★" detail="$120/mo" />
        <TrackRow n={2} title="Starting Strength" sub="8 wk · 31 on it · 4.8 ★" detail="$95" />
        <TrackRow n={3} title="Fat Loss 101" sub="12 wk · 22 on it · 4.7 ★" detail="$160" />
        <TrackRow n={4} title="First Pullup" sub="6 wk · 14 on it · 5.0 ★" detail="$95" />
        <TrackRow n={5} title="Marathon Taper (draft)" sub="4 wk · unpublished" detail="Draft" last />
      </div>

      {/* Playlists */}
      <SectionHeader eyebrow="Playlists" title="Cues & mobility" action="New" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16} tint="linear-gradient(135deg, rgba(140,111,168,0.14), rgba(140,111,168,0.02))" style={{ border: `1px solid rgba(140,111,168,0.25)` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ width: 56, height: 56, borderRadius: 10, background: `linear-gradient(135deg, ${PLUM}, #5a3f75)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize: 22, color: '#fff' }}>♪</div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1 }}>Mobility essentials</div>
              <div style={{ marginTop: 5 }}><MStats items={['12 videos', '18 min', 'Used by 23']} color={PLUM} /></div>
            </div>
            <PlayFab size={40} color={PLUM}>▶</PlayFab>
          </div>
        </EdCard>

        <div style={{ height: 10 }} />
        <TrackRow n={1} title="Push Day cues" sub="6 videos · 9 min · used by 14" detail="→" />
        <TrackRow n={2} title="Warmup routines" sub="8 videos · 11 min · used by 31" detail="→" />
        <TrackRow n={3} title="Cooldown & stretch" sub="5 videos · 7 min · used by 17" detail="→" last />
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════
// NUTRITIONIST APP
// ═══════════════════════════════════════════════════════════
function NutritionistApp({ dark, onLogout, radioOn, setRadioOn }) {
  const [tab, setTab] = useStateT('today');
  const [radio, setRadio] = useStateT(false);
  const [market, setMarket] = useStateT(false);
  if (radio) return <RadioScreen onBack={() => setRadio(false)} />;
  if (market) return <ProMarketplace role="nutri" onBack={() => setMarket(false)} />;
  const openRadio = () => setRadio(true);
  const openMarket = () => setMarket(true);
  const screens = {
    today:    <ProHome role="nutri" onRadio={openRadio} radioOn={radioOn} setRadioOn={setRadioOn} TodayComp={NutriToday} />,
    clients:  <NutriClients />,
    plans:    <NutriPlans />,
    messages: <CommunityChat role="nutri" embedded />,
    me:       <ProfessionalMe onLogout={onLogout} role="nutri" onMarketplace={openMarket} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {screens[tab]}
      <TabBar
        active={tab} onChange={setTab}
        tabs={[
          { key: 'today',    icon: 'calendar', label: 'Today' },
          { key: 'clients',  icon: 'people',   label: 'Clients',  fillActive: false },
          { key: 'plans',    icon: 'doc',      label: 'Plans',    fillActive: false },
          { key: 'messages', icon: 'bubble',   label: 'Messages', fillActive: false },
          { key: 'me',       icon: 'person',   label: 'Me' },
        ]}
      />
    </div>
  );
}

function NutriToday({ onRadio, radioOn = true, setRadioOn = () => {}, proView, setProView, proAccent = GOLD }) {
  return (
    <Screen>
      <NavBar
        eyebrow="Tue · Apr 21 · 3 consults"
        title={<>Today's<br/><em style={{ fontStyle: 'italic', color: GOLD, fontWeight: 500 }}>clinic.</em></>}
        trailing={<AvatarChip init="M" color={GOLD} size={36} />}
        accent={GOLD}
      />

      {proView && setProView && <ProViewSeg view={proView} setView={setProView} accent={proAccent} />}

      {/* Stats — gold-tinted */}
      <div style={{ padding: '0 24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        <StatChip label="Consults" v="3" sub="today" color={GOLD} />
        <StatChip label="Plans due" v="5" sub="this week" color={CORAL} />
        <StatChip label="MRR" v="$4.1k" sub="active" color={TEAL} />
      </div>

      <SectionHeader eyebrow="Next · 10:00 am" title="Alex · Goal check-in" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={18} tint="linear-gradient(155deg, rgba(217,178,106,0.16), rgba(217,178,106,0.02))" style={{ border: `1px solid ${GOLD}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <MLabel color={GOLD}>In 94 min</MLabel>
            <MLabel>Cut · Week 6</MLabel>
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontSize: 26, lineHeight: 1.05, letterSpacing: '-0.025em', color: INK }}>
            Mid-cut <em style={{ fontStyle: 'italic', color: GOLD }}>review.</em>
          </div>
          <div style={{ marginTop: 8 }}>
            <MStats items={['30 min', '-1.2 kg so far', 'Adherence 92%']} />
          </div>
          <div style={{ marginTop: 18, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution init="A" color={TEAL} name="Alex Rivera" role="Client · 11 weeks" />
            <Pill solid color={GOLD}>Open notes →</Pill>
          </div>
        </EdCard>
      </div>

      {/* Day tracklist */}
      <SectionHeader eyebrow="Tracklist" title="Day" action="Calendar" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} state="next" title="Alex Rivera" sub="10:00 · 30m · GOAL CHECK-IN" detail="Zoom" accent={GOLD} />
        <TrackRow n={2} title="Taylor Brooks" sub="13:30 · 45m · Plan delivery" detail="Zoom" />
        <TrackRow n={3} title="Jamal Green" sub="16:00 · 30m · Cut → maintain" detail="Call" last />
      </div>

      {/* Follow-ups */}
      <SectionHeader eyebrow="Inbox" title="Follow-ups" action="All" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} state="next" title="Priya · Food log week 3" sub="Submitted 4h ago · 18 entries" detail="Review" accent={GOLD} />
        <TrackRow n={2} title="Sofia · Weight check-in" sub="-0.8 kg · on track" detail="React" />
        <TrackRow n={3} title="Marcus · Plan approval" sub="Waiting on you · 2 days" detail="Send" />
        <TrackRow n={4} title="Ellie · Allergy update" sub="Added egg intolerance" detail="Note" last />
      </div>

      {/* Community */}
      <SectionHeader eyebrow="Community" title="Your feed" action="Open" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16} tint="linear-gradient(135deg, rgba(140,111,168,0.14), rgba(140,111,168,0.02))" style={{ border: `1px solid rgba(140,111,168,0.25)` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MLabel color={PLUM}>Shape RDs · 142 online</MLabel>
            <MLabel>2 new</MLabel>
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontStyle: 'italic', fontSize: 17, lineHeight: 1.3, color: INK, letterSpacing: '-0.01em' }}>
            "Share your go-to handout for clients starting a cut. Mine's a one-pager on protein timing."
          </div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <Attribution init="L" color={PLUM} name="Dr. Lena Osei" role="RD · Chicago" />
            <Pill color={PLUM}>Reply · 18</Pill>
          </div>
        </EdCard>
      </div>

      {/* Adherence week */}
      <SectionHeader eyebrow="This week" title="Your 11 clients" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={16}>
          <MStats items={['avg adherence 84%', '+2.1% vs last wk', '2 need nudging']} color={GOLD} />
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, marginTop: 14, height: 60 }}>
            {[0.78, 0.82, 0.80, 0.85, 0.83, 0.88, 0.84].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${v * 100}%`, background: i === 6 ? GOLD : HAIR, borderRadius: 2 }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: INK_45, letterSpacing: '0.1em' }}>{'MTWTFSS'[i]}</div>
              </div>
            ))}
          </div>
        </EdCard>
      </div>

      {/* SHAPE RADIO — for focus during chart work */}
      <HomeRadioCard onRadio={onRadio} radioOn={radioOn} setRadioOn={setRadioOn} accent={GOLD} track="Deep Focus · Strings & Synth" meta="PLAYLIST · 62 MIN · LOW BPM" />

      <div style={{ height: 16 }} />
    </Screen>
  );
}

function NutriClients() {
  const clients = [
    { name: 'Alex Rivera', plan: 'Cutting · 2,100 kcal · W6', adh: 92, color: TEAL },
    { name: 'Taylor Brooks', plan: 'Performance · 3,200 kcal', adh: 78, color: GOLD },
    { name: 'Jamal Green', plan: 'Maintenance · 2,700 kcal', adh: 84, color: CORAL },
    { name: 'Priya Singh', plan: 'Cutting · 1,800 kcal · W3', adh: 64, color: PLUM },
    { name: 'Ellie Park', plan: 'Performance · veg · 2,400', adh: 88, color: '#5ac8fa' },
  ];
  return (
    <Screen>
      <NavBar eyebrow="11 active · 92% retention" title={<>Your<br/><em style={{ fontStyle: 'italic', color: GOLD, fontWeight: 500 }}>clients.</em></>} trailing={<IconBtn><Icon name="plus" size={16} color={INK}/></IconBtn>} accent={GOLD} />

      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {clients.map(c => {
          const tier = c.adh >= 85 ? { label: 'Strong', color: TEAL } : c.adh >= 75 ? { label: 'Steady', color: GOLD } : { label: 'Nudge', color: CORAL };
          return (
            <EdCard key={c.name} pad={14}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <AvatarChip init={c.name[0]} color={c.color} size={44} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1 }}>{c.name}</div>
                  <div style={{ marginTop: 5 }}><MStats items={[c.plan]} /></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: tier.color }}>{c.adh}<span style={{ fontSize: 11, fontFamily: MONO, color: INK_45, marginLeft: 2 }}>%</span></div>
                  <div style={{ marginTop: 2 }}><MLabel color={tier.color}>{tier.label}</MLabel></div>
                </div>
              </div>
            </EdCard>
          );
        })}
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

function NutriPlans() {
  return (
    <Screen>
      <NavBar eyebrow="4 published · 40 on it" title={<>Your<br/><em style={{ fontStyle: 'italic', color: GOLD, fontWeight: 500 }}>plans.</em></>} trailing={<IconBtn><Icon name="plus" size={16} color={INK}/></IconBtn>} accent={GOLD} />

      <div style={{ padding: '0 24px' }}>
        <EdCard pad={20} tint="linear-gradient(155deg, rgba(217,178,106,0.16), rgba(217,178,106,0.02))" style={{ border: `1px solid ${GOLD}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <MLabel color={GOLD}>Top plan</MLabel>
            <MLabel>$140/mo</MLabel>
          </div>
          <div style={{ marginTop: 10, fontFamily: SERIF, fontSize: 28, lineHeight: 1, letterSpacing: '-0.03em', color: INK }}>
            Lean <em style={{ fontStyle: 'italic', color: GOLD }}>Cut.</em>
          </div>
          <div style={{ marginTop: 8 }}>
            <MStats items={['2,100 kcal', '12 on it', '165g protein', '4.9 ★']} />
          </div>
          <div style={{ marginTop: 16, display: 'flex', gap: 10 }}>
            <Pill solid color={GOLD}>Edit</Pill>
            <Pill color={GOLD}>Duplicate</Pill>
            <Pill color={GOLD}>Share →</Pill>
          </div>
        </EdCard>
      </div>

      <SectionHeader eyebrow="Tracklist" title="Catalogue" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="Lean Cut" sub="2,100 kcal · 12 on it · 4.9 ★" detail="$140" />
        <TrackRow n={2} title="Performance" sub="3,200 kcal · 8 on it · 4.8 ★" detail="$140" />
        <TrackRow n={3} title="Vegetarian Base" sub="2,400 kcal · 6 on it · 4.7 ★" detail="$120" />
        <TrackRow n={4} title="Maintenance" sub="2,700 kcal · 14 on it · 4.9 ★" detail="$120" last />
      </div>

      <SectionHeader eyebrow="Recipes" title="Library" action="Browse" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="High-protein breakfasts" sub="22 recipes · 380 kcal avg" detail="→" />
        <TrackRow n={2} title="Sub-500 kcal bowls" sub="18 recipes · under 30 min" detail="→" />
        <TrackRow n={3} title="Batch-cookable dinners" sub="14 recipes · 4 servings" detail="→" />
        <TrackRow n={4} title="Pre-workout snacks" sub="12 recipes · quick carbs" detail="→" last />
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

// ═══════════════════════════════════════════════════════════
// Shared: Messages + Professional Me
// ═══════════════════════════════════════════════════════════
function Messages({ role }) {
  const accent = role === 'nutri' ? GOLD : TEAL;
  const threads = [
    { name: 'Sofia Martinez', msg: 'Thanks for the form check! Going to try it today.', when: '2h', unread: 2, color: TEAL },
    { name: 'Alex Rivera', msg: 'Can we move tomorrow to 6pm?', when: '4h', unread: 1, color: CORAL },
    { name: 'Priya Singh', msg: 'Missed Monday — rough week at work.', when: 'Mon', color: PLUM },
    { name: 'Marcus Lee', msg: "I'm in for the intro program — let's go!", when: 'Mon', color: GOLD },
    { name: 'Jamal Green', msg: 'Feeling stronger on the OHP. Up 5kg.', when: 'Sun', color: '#5ac8fa' },
    { name: 'Ellie Park', msg: 'Logged yesterday — smashed protein.', when: 'Sun', color: TEAL },
  ];
  return (
    <Screen>
      <NavBar eyebrow={`${threads.reduce((a,t)=>a+(t.unread||0),0)} unread`} title={<>Your<br/><em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>inbox.</em></>} trailing={<IconBtn><Icon name="plus" size={16} color={INK}/></IconBtn>} accent={accent} />

      <div style={{ padding: '0 24px 12px' }}>
        <div style={{
          border: `1px solid ${HAIR}`, borderRadius: 14, padding: '12px 14px',
          display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(242,237,228,0.025)',
        }}>
          <Icon name="magnifier" size={16} color={INK_60} />
          <span style={{ fontFamily: SANS, fontSize: 14, color: INK_60, letterSpacing: -0.1 }}>Search messages</span>
        </div>
      </div>

      <div style={{ padding: '0 24px' }}>
        {threads.map((t, i) => (
          <div key={t.name} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
            borderBottom: i < threads.length - 1 ? `1px solid ${HAIR_S}` : 0,
          }}>
            <AvatarChip init={t.name[0]} color={t.color} size={40} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 600, color: INK, letterSpacing: -0.1 }}>{t.name}</div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: INK_45, letterSpacing: '0.12em' }}>{t.when.toUpperCase()}</div>
              </div>
              <div style={{
                fontFamily: SANS, fontSize: 13, color: t.unread ? INK : INK_60, letterSpacing: -0.1,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: 4,
              }}>{t.msg}</div>
            </div>
            {t.unread && (
              <div style={{
                minWidth: 20, height: 20, borderRadius: 10, background: accent,
                color: PAPER, fontFamily: MONO, fontSize: 10, fontWeight: 600, display: 'flex',
                alignItems: 'center', justifyContent: 'center', padding: '0 6px',
              }}>{t.unread}</div>
            )}
          </div>
        ))}
      </div>

      <div style={{ height: 16 }} />
    </Screen>
  );
}

function ProfessionalMe({ onLogout, role, onMarketplace }) {
  const isTrainer = role === 'trainer';
  const accent = isTrainer ? CORAL : GOLD;
  const data = isTrainer
    ? { name: 'Jordan', last: 'Chen.', role: 'Trainer · Hypertrophy · SF', init: 'J', active: 17, mrr: '$6,240', retention: '94%', barAccent: CORAL }
    : { name: 'Dr. Maya', last: 'Patel.', role: 'Registered Dietitian · Remote', init: 'M', active: 11, mrr: '$4,120', retention: '92%', barAccent: GOLD };

  return (
    <Screen>
      <NavBar eyebrow={data.role} title={<>{data.name}<br/><em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>{data.last}</em></>} trailing={<IconBtn><Icon name="gear" size={16} color={INK}/></IconBtn>} accent={accent} />

      {/* Earnings hero */}
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={22} tint={`linear-gradient(145deg, ${accent}26, ${accent}05)`} style={{ border: `1px solid ${accent}44` }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <MLabel color={accent}>This month</MLabel>
              <div style={{ fontFamily: SERIF, fontSize: 62, lineHeight: 0.88, letterSpacing: '-0.04em', color: INK, marginTop: 8 }}>{data.mrr}</div>
              <div style={{ marginTop: 10 }}><MStats items={[`${data.active} active`, `${data.retention} retention`, '+3 mo']} color={accent} /></div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, marginTop: 18, height: 54 }}>
            {[0.4, 0.55, 0.42, 0.7, 0.62, 0.82, 0.88].map((v, i) => (
              <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
                <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                  <div style={{ width: '100%', height: `${v * 100}%`, background: i === 6 ? data.barAccent : HAIR, borderRadius: 2 }} />
                </div>
                <div style={{ fontFamily: MONO, fontSize: 9, color: INK_45, letterSpacing: '0.1em' }}>{['Nov','Dec','Jan','Feb','Mar','Apr','May'][i].toUpperCase()}</div>
              </div>
            ))}
          </div>
        </EdCard>
      </div>

      <SectionHeader eyebrow="Your practice" title="Shortcuts" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} state="next" title="Marketplace listing" sub={`Ranked #${isTrainer ? '12' : '4'} in ${isTrainer ? 'Hypertrophy · SF' : 'Sports Nutrition · Remote'}`} detail="View" accent={accent} onClick={onMarketplace} />
        <TrackRow n={2} title="Public profile" sub={`shape.app/@${isTrainer ? 'jordan' : 'maya'}`} detail="Edit" />
        <TrackRow n={3} title="Payouts" sub="Weekly · Stripe · Fri" detail="$4,820" />
        <TrackRow n={4} title="Availability" sub="Mon-Fri · 9 am - 6 pm" detail="Edit" />
        <TrackRow n={5} title="Rates" sub={isTrainer ? '$95/session · $120/mo' : '$140/plan · $80/consult'} detail="Edit" last />
      </div>

      <SectionHeader eyebrow="Account" title="Settings" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="Notifications" sub="Sessions · messages · plans" detail="→" />
        <TrackRow n={2} title="Certifications" sub={isTrainer ? 'NASM · FMS · CSCS' : 'RDN · CSSD'} detail="→" />
        <TrackRow n={3} title="Help & support" sub="Docs · email · community" detail="→" last />
      </div>

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

// ═══════════════════════════════════════════════════════════
// PRO MARKETPLACE — their public listing + placement stats
// ═══════════════════════════════════════════════════════════
function ProMarketplace({ role, onBack }) {
  const isTrainer = role === 'trainer';
  const accent = isTrainer ? CORAL : GOLD;
  const data = isTrainer
    ? {
        name: 'Jordan Chen', handle: 'jordan', init: 'J',
        tag: 'Hypertrophy · SF',
        headline: "I don't write you a program. I write you the next 12 weeks of your life — then we adjust.",
        rank: 12, rankOf: 284, cat: 'Hypertrophy · SF',
        views: '1,842', saves: 218, convos: 14, signups: 4, cr: '29%',
        specs: ['Strength', 'Hypertrophy', 'Men 30+', 'Bodyweight'],
        programs: [
          { t: 'Push / Pull / Legs', s: '12 weeks · 48 on it', d: '$120/mo' },
          { t: 'First Pullup',      s: '6 weeks · 14 on it',  d: '$95' },
          { t: 'Intro call',        s: '30 min · free',       d: 'Book' },
        ],
        rating: '4.9', reviews: 86,
      }
    : {
        name: 'Dr. Maya Patel', handle: 'maya', init: 'M',
        tag: 'Sports Nutrition · Remote',
        headline: "Fuel the sport you actually play. Simple meals, real life, no deprivation.",
        rank: 4, rankOf: 92, cat: 'Sports Nutrition · Remote',
        views: '1,120', saves: 154, convos: 9, signups: 3, cr: '33%',
        specs: ['Performance', 'Endurance', 'Women 30+', 'Clinical'],
        programs: [
          { t: 'Race-week fuel', s: '1 week · plan + calls', d: '$180' },
          { t: 'Cut — done right', s: '12 weeks · coached',   d: '$160/mo' },
          { t: 'Free consult',    s: '20 min · intake',       d: 'Book' },
        ],
        rating: '5.0', reviews: 47,
      };

  return (
    <Screen>
      <NavBar
        eyebrow="Your public listing"
        title={<>The<br/><em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>Marketplace.</em></>}
        trailing={<button onClick={onBack} style={{ background: 'transparent', border: 0, color: INK, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>← Back</button>}
        accent={accent}
      />

      {/* PLACEMENT HERO — rank in category */}
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={22} tint={`linear-gradient(145deg, ${accent}22, ${accent}05)`} style={{ border: `1px solid ${accent}44` }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <MLabel color={accent}>Rank · {data.cat}</MLabel>
            <MLabel>Last 30 days</MLabel>
          </div>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginTop: 10 }}>
            <div style={{ fontFamily: SERIF, fontSize: 86, lineHeight: 0.86, letterSpacing: '-0.05em', color: INK }}>#{data.rank}</div>
            <div style={{ paddingBottom: 10, fontFamily: MONO, fontSize: 11, color: INK_60, letterSpacing: '0.12em' }}>OF {data.rankOf}</div>
          </div>
          <div style={{ marginTop: 10 }}>
            <MStats items={[`${data.views} views`, `${data.saves} saves`, `${data.signups} new clients`]} color={accent} />
          </div>
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${HAIR_S}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <MLabel>Conversion · {data.cr}</MLabel>
            <Pill color={accent}>Boost listing →</Pill>
          </div>
        </EdCard>
      </div>

      {/* LISTING PREVIEW — how clients see it */}
      <SectionHeader eyebrow="Preview" title="How clients see you" action="Edit" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={20} tint={`linear-gradient(160deg, ${accent}26, ${accent}03)`} style={{ border: `1px solid ${accent}3a` }}>
          <div style={{ fontFamily: SERIF, fontStyle: 'italic', fontSize: 21, lineHeight: 1.25, color: INK, letterSpacing: '-0.01em' }}>
            "{data.headline}"
          </div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 18 }}>
            <Attribution init={data.init} color={accent} name={data.name} role={data.tag} />
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: SERIF, fontSize: 18, color: accent, letterSpacing: '-0.02em' }}>★ {data.rating}</div>
              <div style={{ fontFamily: MONO, fontSize: 9.5, color: INK_60, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{data.reviews} reviews</div>
            </div>
          </div>
          {/* Specialties chips */}
          <div style={{ marginTop: 14, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {data.specs.map(s => (
              <div key={s} style={{
                padding: '5px 10px', borderRadius: 10, border: `1px solid ${HAIR}`,
                fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em',
                textTransform: 'uppercase', color: INK_60,
              }}>{s}</div>
            ))}
          </div>
          <div style={{ marginTop: 16, paddingTop: 14, borderTop: `1px solid ${HAIR_S}` }}>
            <MLabel color={accent}>Tracklist</MLabel>
            <div style={{ marginTop: 6 }}>
              {data.programs.map((p, i) => (
                <TrackRow key={i} n={i + 1} title={p.t} sub={p.s} detail={p.d} last={i === data.programs.length - 1} />
              ))}
            </div>
          </div>
        </EdCard>
      </div>

      {/* FUNNEL */}
      <SectionHeader eyebrow="Last 30 days" title="Your funnel" />
      <div style={{ padding: '0 24px' }}>
        <EdCard pad={18}>
          {[
            { k: 'Profile views',    v: data.views, pct: 1.0 },
            { k: 'Saved to favorites', v: String(data.saves), pct: 0.55 },
            { k: 'Started conversation', v: String(data.convos), pct: 0.14 },
            { k: 'New clients',      v: String(data.signups), pct: 0.06 },
          ].map((r, i) => (
            <div key={r.k} style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: i === 0 ? 0 : 12 }}>
              <div style={{ width: 128 }}><MLabel>{r.k}</MLabel></div>
              <div style={{ flex: 1, height: 4, background: HAIR, borderRadius: 2, overflow: 'hidden' }}>
                <div style={{ width: `${r.pct * 100}%`, height: '100%', background: accent }} />
              </div>
              <div style={{ fontFamily: SERIF, fontSize: 18, color: INK, letterSpacing: '-0.02em', minWidth: 52, textAlign: 'right' }}>{r.v}</div>
            </div>
          ))}
        </EdCard>
      </div>

      {/* EDITS SHORTCUTS */}
      <SectionHeader eyebrow="Tune your listing" title="Edits" />
      <div style={{ padding: '0 24px' }}>
        <TrackRow n={1} title="Headline + bio" sub="What clients read first" detail="→" />
        <TrackRow n={2} title="Specialties" sub={`${data.specs.length} tags · affects matching`} detail="→" />
        <TrackRow n={3} title="Programs & pricing" sub={`${data.programs.length} offers listed`} detail="→" />
        <TrackRow n={4} title="Photos + intro video" sub="Adds 3× response rate" detail="→" />
        <TrackRow n={5} title="Reviews" sub={`${data.reviews} published · ${data.rating} avg`} detail="→" last />
      </div>

      <div style={{ height: 28 }} />
    </Screen>
  );
}

Object.assign(window, { TrainerApp, NutritionistApp });
