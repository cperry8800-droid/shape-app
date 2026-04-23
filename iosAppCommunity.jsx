// Community chat screen — shared across Client, Trainer, Nutritionist
// Editorial forum feel: Fraunces quote posts, mono timestamps, slash stats.

const { useState: useStateCom } = React;

function CommunityChat({ role = 'client', onBack, embedded }) {
  const accent = role === 'trainer' ? CORAL : role === 'nutri' ? GOLD : TEAL;
  const groupName = role === 'trainer' ? 'Shape Pros · Coaches' : role === 'nutri' ? 'Shape Pros · RDs' : 'Riverside Runners';
  const online = role === 'trainer' ? 318 : role === 'nutri' ? 142 : 47;
  const [view, setView] = useStateCom('feed');
  const [openThread, setOpenThread] = useStateCom(null);

  // Every post is attributed to one of 4 personas: Trainer, Client, Nutri, Shape (brand)
  // Rendered as chat bubbles — same format as DMs.
  const threads = role === 'trainer' ? [
    { init: '✦', color: INK,   name: 'Shape',          role: 'Shape',   persona: 'shape',   when: '30m', pinned: true,
      msg: "New: Program Retention Benchmarks for Q2 are live. Median 3-month retention is 64%. See how yours stacks up in your dashboard.",
      replies: 18, likes: 42 },
    { init: 'R', color: PLUM,  name: 'Reese Wu',       role: 'Trainer', persona: 'trainer', when: '4m',
      msg: "How are you all pricing 12-week blocks vs monthly? Seeing churn on the monthly plans — clients quit right after their first plateau.",
      replies: 24, likes: 18 },
    { init: 'A', color: CORAL, name: 'Alex Rivera',    role: 'Client',  persona: 'client',  when: '1h',
      msg: "Coaches — what's the move when your client (me 🙋) asks to skip deload week? Jordan said no. I am respecting it. But convince me?",
      replies: 9, likes: 12 },
    { init: 'D', color: GOLD,  name: 'Dr. Maya Patel', role: 'Nutri',   persona: 'nutri',   when: '2h',
      msg: "Cross-post for trainers: peri-workout carb timing deck I give clients. 2 pages. DM me if you want it white-labeled for your programs.",
      replies: 14, likes: 31 },
    { init: '✦', color: INK,   name: 'Shape',          role: 'Shape',   persona: 'shape',   when: '5h',
      msg: "Quarterly pro call tomorrow, 10am PT. Coaches with 50+ clients — save your spot in Events.",
      replies: 31, likes: 54 },
  ] : role === 'nutri' ? [
    { init: '✦', color: INK,   name: 'Shape',          role: 'Shape',   persona: 'shape',   when: '15m', pinned: true,
      msg: "Heads up: updated meal-plan templates (low-FODMAP, PCOS, post-bariatric) are now in your Library. Pulled from our clinical advisory board.",
      replies: 22, likes: 38 },
    { init: 'L', color: PLUM,  name: 'Dr. Lena Osei',  role: 'Nutri',   persona: 'nutri',   when: '8m',
      msg: "Share your go-to handout for clients starting a cut. Mine's a one-pager: protein timing, 3 'free' meals a week, a crying emoji for week 3.",
      replies: 18, likes: 26 },
    { init: 'A', color: CORAL, name: 'Alex Rivera',    role: 'Client',  persona: 'client',  when: '45m',
      msg: "For the RDs in the room: how do you handle scale weight fluctuation conversations? Mine spikes 2lb on high-carb days and it messes w/ my head.",
      replies: 11, likes: 19 },
    { init: 'J', color: TEAL,  name: 'Jordan Chen',    role: 'Trainer', persona: 'trainer', when: '3h',
      msg: "Asking as a trainer working w/ your clients: what's your default recommendation for a lifter on 1,800 kcal / 170g protein hitting a plateau?",
      replies: 22, likes: 15 },
  ] : [
    { init: '✦', color: INK,   name: 'Shape',          role: 'Shape',   persona: 'shape',   when: '1h', pinned: true,
      msg: "Riverside Runners: Saturday's 6am long run is official. 47 of you RSVP'd. Coffee at Blackbird after — first round on Shape.",
      replies: 14, likes: 52 },
    { init: 'J', color: CORAL, name: 'Jordan Chen',    role: 'Trainer', persona: 'trainer', when: '2h',
      msg: "Week 6 check, team: drop a ⚡ if you hit all lifts this week. Coffee for the top 3 adherence scores.",
      replies: 12, likes: 34 },
    { init: 'S', color: TEAL,  name: 'Sofia Martinez', role: 'Client',  persona: 'client',  when: '4h',
      msg: "First sub-9 min mile today! Started this program at 11:30. Telling everyone the Wednesday intervals are cursed but they work.",
      replies: 8, likes: 27 },
    { init: 'M', color: GOLD,  name: 'Dr. Maya Patel', role: 'Nutri',   persona: 'nutri',   when: 'Mon',
      msg: "Pre-workout snack question keeps coming up — here's my short list: rice cake + honey, banana + almond butter, dates + salt. Oats optional.",
      replies: 15, likes: 38 },
  ];

  return (
    <Screen>
      <div style={{ padding: embedded ? '58px 24px 8px' : '58px 24px 8px' }}>
        {!embedded && (
          <button onClick={onBack} style={{
            background: 'transparent', border: 0, color: accent, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
            padding: 0, marginBottom: 14,
          }}>← Back</button>
        )}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <MLabel color={accent}>{groupName} · {online} online</MLabel>
          {embedded && (
            <div style={{ display: 'flex', gap: 8 }}>
              <IconBtn><Icon name="magnifier" size={16} color={INK} /></IconBtn>
              <IconBtn><Icon name="bell" size={16} color={INK} /></IconBtn>
            </div>
          )}
        </div>
        <h1 style={{
          fontFamily: SERIF, fontSize: 40, lineHeight: 0.98, letterSpacing: '-0.035em',
          fontWeight: 400, margin: '12px 0 0', color: INK,
        }}>The<br/><em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>feed.</em></h1>
      </div>

      {/* If a thread is open, show the full conversation view */}
      {openThread != null ? (
        <ThreadView thread={threads[openThread]} accent={accent} onClose={() => setOpenThread(null)} />
      ) : <>
      {/* Segmented switcher */}
      <div style={{ padding: '6px 24px 6px' }}>
        <div style={{ display: 'flex', gap: 6, border: `1px solid ${HAIR}`, borderRadius: 12, padding: 4, background: 'rgba(242,237,228,0.02)' }}>
          {[
            { k: 'feed', l: 'Feed' },
            { k: 'dms', l: 'Messages' },
            { k: 'teams', l: 'Teams' },
          ].map(s => {
            const on = view === s.k;
            return (
              <button key={s.k} onClick={() => setView(s.k)} style={{
                flex: 1, padding: '9px 0', border: 0, borderRadius: 9,
                background: on ? accent : 'transparent',
                color: on ? PAPER : INK_60, cursor: 'pointer',
                fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
                fontWeight: on ? 600 : 400,
              }}>{s.l}</button>
            );
          })}
        </div>
      </div>

      {view === 'feed' && <FeedBubbles threads={threads} accent={accent} role={role} onOpen={setOpenThread} />}

      {view === 'dms' && <DMList role={role} accent={accent} />}
      {view === 'teams' && <TeamsList role={role} accent={accent} />}
      </>}

      <div style={{ height: 16 }} />
    </Screen>
  );
}

// ─────────────────────────────────────────────────────────────
// Feed rendered as chat bubbles — color-coded by persona.
// Trainer = CORAL · Client = TEAL · Nutri = GOLD · Shape = INK
// ─────────────────────────────────────────────────────────────
const PERSONA_COLORS = {
  trainer: CORAL,
  client:  TEAL,
  nutri:   GOLD,
  shape:   null, // handled specially — ink/paper flip
};

function FeedBubbles({ threads, accent, role, onOpen }) {
  const [filter, setFilter] = useStateCom(null); // null = show all
  const filters = [
    { k: 'shape',   l: 'Shape' },
    { k: 'trainer', l: 'Trainer' },
    { k: 'client',  l: 'Client' },
    { k: 'nutri',   l: 'Nutri' },
  ];
  const filtered = filter == null ? threads : threads.filter(t => t.persona === filter);

  // For bubble self-alignment: the current user's persona is on the right.
  const myPersona = role === 'trainer' ? 'trainer' : role === 'nutri' ? 'nutri' : 'client';

  return (
    <>
      {/* Persona filter bar */}
      <div style={{ padding: '14px 24px 8px', display: 'flex', gap: 6, overflowX: 'auto' }}>
        {filters.map(f => {
          const on = filter === f.k;
          const dot = f.k === 'shape' ? INK : PERSONA_COLORS[f.k];
          return (
            <button key={f.k} onClick={() => setFilter(on ? null : f.k)} style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, flexShrink: 0,
              padding: '7px 12px', borderRadius: 999,
              border: `1px solid ${on ? 'transparent' : HAIR}`,
              background: on ? INK : 'transparent',
              color: on ? PAPER : INK_60, cursor: 'pointer',
              fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase',
              fontWeight: on ? 600 : 400,
            }}>
              {dot && <span style={{
                width: 7, height: 7, borderRadius: 4, background: dot,
                display: 'inline-block',
              }} />}
              {f.l}
            </button>
          );
        })}
      </div>
      <div style={{ padding: '8px 24px 14px' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          border: `1px solid ${HAIR}`, borderRadius: 999,
          padding: '8px 8px 8px 14px', background: 'rgba(242,237,228,0.03)',
        }}>
          <AvatarChip init={role === 'trainer' ? 'J' : role === 'nutri' ? 'M' : 'A'} color={accent} size={26} />
          <div style={{ flex: 1, fontFamily: SANS, fontSize: 13.5, color: INK_60, letterSpacing: -0.1 }}>
            Share with the group…
          </div>
          <Pill solid color={accent}>Post</Pill>
        </div>
      </div>

      {/* Bubble stream */}
      <div style={{ padding: '0 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {filtered.map((t, i) => (
          <FeedBubble key={i} t={t} accent={accent} myPersona={myPersona} onOpen={() => onOpen(threads.indexOf(t))} />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: '40px 20px', textAlign: 'center', fontFamily: MONO, fontSize: 11, color: INK_45, letterSpacing: '0.14em' }}>
            NO POSTS IN THIS CHANNEL YET
          </div>
        )}
      </div>
    </>
  );
}

function FeedBubble({ t, accent, myPersona, onOpen }) {
  const isMe = t.persona === myPersona;
  const isShape = t.persona === 'shape';
  const personaColor = PERSONA_COLORS[t.persona] || INK;

  // Bubble styling
  const bg = isShape
    ? INK
    : isMe
      ? `${personaColor}18`
      : PAPER2;
  const textColor = isShape ? PAPER : INK;
  const borderCol = isShape ? 'transparent' : isMe ? `${personaColor}40` : HAIR;

  const align = isMe ? 'flex-end' : 'flex-start';
  const avatarSide = isMe ? 'right' : 'left';
  const bubbleMaxW = '82%';

  const roleLabel = {
    trainer: 'TRAINER',
    client:  'CLIENT',
    nutri:   'NUTRITIONIST',
    shape:   'SHAPE · OFFICIAL',
  }[t.persona] || t.role.toUpperCase();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, gap: 4 }}>
      {t.pinned && (
        <div style={{ marginBottom: 2, padding: '0 4px' }}>
          <MLabel color={accent}>📌 Pinned</MLabel>
        </div>
      )}

      <div style={{
        display: 'flex', gap: 10, alignItems: 'flex-end',
        flexDirection: avatarSide === 'right' ? 'row-reverse' : 'row',
        maxWidth: bubbleMaxW,
      }}>
        {/* Avatar */}
        <div style={{ flexShrink: 0, marginBottom: 2 }}>
          {isShape ? (
            <div style={{
              width: 34, height: 34, borderRadius: 17, background: INK, color: PAPER,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontFamily: SERIF, fontSize: 18, fontStyle: 'italic',
            }}>✦</div>
          ) : (
            <AvatarChip init={t.init} color={t.color} size={34} />
          )}
        </div>

        {/* Bubble column */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: align, minWidth: 0, flex: 1 }}>
          {/* Name + role chip + time */}
          <div style={{
            display: 'flex', gap: 8, alignItems: 'baseline', marginBottom: 4,
            flexDirection: avatarSide === 'right' ? 'row-reverse' : 'row',
            padding: '0 6px',
          }}>
            <span style={{ fontFamily: SANS, fontSize: 12.5, fontWeight: 600, color: INK, letterSpacing: -0.05 }}>
              {t.name}
            </span>
            <PersonaChip persona={t.persona} label={roleLabel} />
            <span style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.1em' }}>
              {t.when}
            </span>
          </div>

          {/* Bubble */}
          <button onClick={onOpen} style={{
            display: 'block', width: '100%', textAlign: 'left', cursor: 'pointer',
            background: bg, color: textColor, border: `1px solid ${borderCol}`,
            borderRadius: 20,
            borderBottomRightRadius: isMe ? 6 : 20,
            borderBottomLeftRadius: !isMe ? 6 : 20,
            padding: '12px 16px 10px',
            fontFamily: SANS, fontSize: 14.5, lineHeight: 1.45, letterSpacing: -0.05,
          }}>
            <div style={{
              fontFamily: isShape ? SERIF : SANS,
              fontSize: isShape ? 16 : 14.5,
              lineHeight: 1.45,
              fontStyle: isShape ? 'italic' : 'normal',
              fontWeight: isShape ? 400 : 400,
            }}>{t.msg}</div>
          </button>

          {/* Reactions rail */}
          <div style={{
            display: 'flex', gap: 14, marginTop: 6, padding: '0 6px',
            flexDirection: avatarSide === 'right' ? 'row-reverse' : 'row',
          }}>
            <button style={rxBtn(INK_60)} onClick={(e) => e.stopPropagation()}>♡ {t.likes}</button>
            <button style={rxBtn(INK_60)} onClick={onOpen}>↳ {t.replies}</button>
            {isShape && <button style={rxBtn(accent)} onClick={(e) => e.stopPropagation()}>Save</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

function PersonaChip({ persona, label }) {
  const color = persona === 'shape' ? INK : PERSONA_COLORS[persona] || INK_60;
  const bg = persona === 'shape' ? INK : `${color}18`;
  const fg = persona === 'shape' ? PAPER : color;
  return (
    <span style={{
      display: 'inline-block',
      background: bg, color: fg,
      fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em',
      padding: '2px 7px', borderRadius: 4, fontWeight: 600,
    }}>{label}</span>
  );
}

function rxBtn(color) {
  return {
    background: 'transparent', border: 0, color, cursor: 'pointer',
    fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase', padding: 0,
  };
}

// ─────────────────────────────────────────────────────────────
// DM list (1:1 threads with coaches/clients/peers)
// ─────────────────────────────────────────────────────────────
function DMList({ role, accent }) {
  const dms = role === 'trainer' ? [
    { init: 'A', color: CORAL, name: 'Alex Rivera', role: 'Client · Week 6 cut', when: '2m', preview: 'That last set felt insane — recorded form video', unread: 2, online: true },
    { init: 'S', color: TEAL,  name: 'Sofia Martinez', role: 'Client · Half prep', when: '1h', preview: 'Sunday long run moved to Saturday — ok?', unread: 1, online: true },
    { init: 'M', color: PLUM,  name: 'Marcus Lee', role: 'Client · Strength', when: 'Mon', preview: 'Missed my Friday session, rescheduling?', unread: 0 },
    { init: 'R', color: CORAL, name: 'Riya Kapoor', role: 'Client · Onboarding', when: 'Sun', preview: 'Filled out the intake form, let me know', unread: 0 },
  ] : role === 'nutri' ? [
    { init: 'A', color: CORAL, name: 'Alex Rivera', role: 'Client · Cut week 6', when: '12m', preview: 'Stuck at 1,890 for 3 days — normal?', unread: 1, online: true },
    { init: 'L', color: PLUM,  name: 'Liam O\'Connor', role: 'Client · Race prep', when: '4h', preview: 'Shipped the race-week plan PDF', unread: 0 },
    { init: 'T', color: GOLD,  name: 'Taylor Brooks', role: 'Client · PCOS', when: 'Tue', preview: 'Two-week check-in?', unread: 0 },
  ] : [
    { init: 'J', color: CORAL, name: 'Jordan Chen', role: 'Your coach', when: '2h', preview: 'Nice tempo today — logged your set in the app', unread: 2, online: true },
    { init: 'M', color: GOLD,  name: 'Dr. Maya Patel', role: 'Your nutritionist', when: '1d', preview: 'Shop list regenerates Sunday — any swaps?', unread: 1 },
    { init: 'S', color: TEAL,  name: 'Sofia Martinez', role: 'Riverside Runners', when: 'Mon', preview: 'Coffee Saturday after the long run?', unread: 0 },
    { init: 'R', color: PLUM,  name: 'Riverside Team', role: 'Group · 12', when: 'Sun', preview: 'Race-day bib pickup info', unread: 0 },
  ];
  return (
    <div style={{ padding: '12px 24px 0' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <MLabel color={accent}>{dms.reduce((n, d) => n + d.unread, 0)} unread · {dms.length} threads</MLabel>
        <button style={rxBtn(accent)}>+ New</button>
      </div>
      {dms.map((d, i) => (
        <div key={i} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0',
          borderBottom: i === dms.length - 1 ? 0 : `1px solid ${HAIR_S}`,
          cursor: 'pointer',
        }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <AvatarChip init={d.init} color={d.color} size={40} />
            {d.online && <div style={{
              position: 'absolute', right: -1, bottom: -1, width: 11, height: 11,
              borderRadius: 6, background: '#4ade80', border: `2px solid ${PAPER}`,
            }} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
              <div style={{ fontFamily: SANS, fontSize: 14.5, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>
                {d.name}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 10, color: d.unread ? accent : INK_45, letterSpacing: '0.08em', flexShrink: 0 }}>
                {d.when}
              </div>
            </div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.12em', textTransform: 'uppercase', marginTop: 1 }}>
              {d.role}
            </div>
            <div style={{
              fontFamily: SANS, fontSize: 13, color: d.unread ? INK : INK_60, letterSpacing: -0.05,
              marginTop: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontWeight: d.unread ? 500 : 400,
            }}>{d.preview}</div>
          </div>
          {d.unread > 0 && <div style={{
            width: 20, height: 20, borderRadius: 10, background: accent, color: PAPER,
            fontFamily: MONO, fontSize: 10, fontWeight: 600,
            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>{d.unread}</div>}
        </div>
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Teams / group chats
// ─────────────────────────────────────────────────────────────
function TeamsList({ role, accent }) {
  const [q, setQ] = useStateCom('');
  const joined = role === 'trainer' ? [
    { name: 'Shape Pros · Coaches', sub: '318 online · main', posts: '24 today', color: CORAL, init: 'SP', joined: true, tags: 'pros coaching main' },
    { name: 'LA Strength Collective', sub: '42 coaches · local', posts: '6 today', color: TEAL, init: 'LA', joined: true, tags: 'los angeles local strength' },
    { name: 'Business of Coaching', sub: '186 coaches · pricing + ops', posts: '12 today', color: GOLD, init: 'BC', joined: true, tags: 'business ops pricing sales' },
    { name: 'Hypertrophy Nerds', sub: '94 coaches · science deep-dive', posts: '3 today', color: PLUM, init: 'HN', joined: true, tags: 'hypertrophy science research' },
  ] : role === 'nutri' ? [
    { name: 'Shape Pros · RDs', sub: '142 online · main', posts: '18 today', color: GOLD, init: 'SP', joined: true, tags: 'rds nutrition main' },
    { name: 'Sports Nutrition Circle', sub: '64 RDs · endurance', posts: '9 today', color: TEAL, init: 'SN', joined: true, tags: 'sports endurance marathon' },
    { name: 'Clinical + Coaching', sub: '88 RDs · EDs, PCOS, GI', posts: '4 today', color: PLUM, init: 'CC', joined: true, tags: 'clinical eating disorders pcos gi' },
  ] : [
    { name: 'Riverside Runners', sub: '47 online · your team', posts: '12 today', color: TEAL, init: 'RR', joined: true, tags: 'running team riverside cardio' },
    { name: 'Week 6 Cut Crew', sub: '18 members · cohort', posts: '6 today', color: CORAL, init: 'WC', joined: true, tags: 'cutting cohort weight loss' },
    { name: 'Shape Community', sub: '2,480 online · global', posts: '120 today', color: GOLD, init: 'SC', joined: true, tags: 'community global general' },
    { name: 'Morning Lifters', sub: '34 members · interest', posts: '8 today', color: PLUM, init: 'ML', joined: true, tags: 'morning lifting routine' },
  ];

  // Discover pool — groups you could join
  const discover = role === 'trainer' ? [
    { name: 'Online Coaching Tactics', sub: '512 coaches · growth', posts: '+ Join', color: TEAL, init: 'OC', tags: 'online growth marketing clients' },
    { name: 'Women in Strength Coaching', sub: '268 coaches · community', posts: '+ Join', color: PLUM, init: 'WS', tags: 'women strength community' },
    { name: 'Injury Rehab & Return', sub: '74 coaches · cert', posts: '+ Join', color: CORAL, init: 'IR', tags: 'injury rehab physio return' },
    { name: 'NYC Coach Co-op', sub: '29 coaches · local', posts: '+ Join', color: GOLD, init: 'NY', tags: 'new york nyc local' },
  ] : role === 'nutri' ? [
    { name: 'Plant-Based Practice', sub: '126 RDs · specialty', posts: '+ Join', color: TEAL, init: 'PB', tags: 'plant vegan vegetarian' },
    { name: 'Pediatric + Family Nutrition', sub: '48 RDs · specialty', posts: '+ Join', color: CORAL, init: 'PF', tags: 'kids pediatric family' },
    { name: 'Private Practice Playbook', sub: '220 RDs · business', posts: '+ Join', color: GOLD, init: 'PP', tags: 'business private practice pricing' },
  ] : [
    { name: 'Postpartum Strength', sub: '62 members · cohort', posts: '+ Join', color: CORAL, init: 'PS', tags: 'postpartum new mom strength' },
    { name: 'Sub-3 Marathon Crew', sub: '38 members · interest', posts: '+ Join', color: TEAL, init: 'SM', tags: 'marathon sub-3 running elite' },
    { name: 'Kettlebell Collective', sub: '104 members · interest', posts: '+ Join', color: GOLD, init: 'KB', tags: 'kettlebell conditioning' },
    { name: 'Plant Forward Athletes', sub: '71 members · diet', posts: '+ Join', color: PLUM, init: 'PF', tags: 'plant vegan diet' },
    { name: 'Over 40 & Strong', sub: '148 members · age group', posts: '+ Join', color: CORAL, init: 'O4', tags: 'over 40 masters age' },
  ];

  const match = (t) => {
    if (!q.trim()) return true;
    const s = q.trim().toLowerCase();
    return t.name.toLowerCase().includes(s) || t.sub.toLowerCase().includes(s) || (t.tags || '').toLowerCase().includes(s);
  };

  const joinedFiltered = joined.filter(match);
  const discoverFiltered = discover.filter(match);
  const total = joinedFiltered.length + discoverFiltered.length;

  return (
    <div style={{ padding: '12px 24px 0' }}>
      {/* Search bar */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        border: `1px solid ${HAIR}`, borderRadius: 14,
        padding: '10px 12px', marginBottom: 16,
        background: 'rgba(242,237,228,0.02)',
      }}>
        <span style={{ fontFamily: MONO, fontSize: 14, color: INK_45, lineHeight: 1 }}>⌕</span>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search groups · hypertrophy, running, business…"
          style={{
            flex: 1, border: 0, outline: 'none', background: 'transparent',
            color: INK, fontFamily: SANS, fontSize: 14, letterSpacing: -0.1,
            minWidth: 0,
          }}
        />
        {q && (
          <button onClick={() => setQ('')} style={{
            border: 0, background: 'transparent', color: INK_45, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase',
            padding: '2px 6px',
          }}>Clear</button>
        )}
      </div>

      {q.trim() && (
        <div style={{ marginBottom: 14 }}>
          <MLabel color={accent}>{total} result{total === 1 ? '' : 's'}</MLabel>
        </div>
      )}

      {/* Joined section */}
      {joinedFiltered.length > 0 && (
        <>
          {!q.trim() && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <MLabel color={accent}>{joined.length} joined</MLabel>
              <button style={rxBtn(accent)}>+ Join</button>
            </div>
          )}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {joinedFiltered.map((t, i) => <TeamRow key={'j'+i} t={t} accent={accent} />)}
          </div>
        </>
      )}

      {/* Discover section */}
      {discoverFiltered.length > 0 && (
        <>
          <div style={{ marginTop: 22, marginBottom: 12 }}>
            <MLabel>{q.trim() ? 'Matching discover' : 'Discover'}</MLabel>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {discoverFiltered.map((t, i) => <TeamRow key={'d'+i} t={t} accent={accent} />)}
          </div>
        </>
      )}

      {total === 0 && (
        <div style={{
          textAlign: 'center', padding: '32px 20px',
          border: `1px dashed ${HAIR}`, borderRadius: 14,
        }}>
          <div style={{ fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color: INK }}>
            No groups match "{q}"
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: INK_45, marginTop: 8, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Try running, science, business, or cohort
          </div>
        </div>
      )}
    </div>
  );
}

function TeamRow({ t, accent }) {
  return (
    <EdCard pad={16}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 48, height: 48, borderRadius: 12,
          background: `linear-gradient(135deg, ${t.color}, ${t.color}aa)`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontFamily: MONO, fontSize: 14, fontWeight: 600, color: '#fff', letterSpacing: 0.5,
          flexShrink: 0,
        }}>{t.init}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1.1 }}>
            {t.name}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 5 }}>
            {t.sub}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontFamily: MONO, fontSize: 10, color: accent, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {t.posts}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 14, color: INK_45, marginTop: 4 }}>→</div>
        </div>
      </div>
    </EdCard>
  );
}

// ─────────────────────────────────────────────────────────────
// Single thread view — post + replies + composer
// ─────────────────────────────────────────────────────────────
function ThreadView({ thread, accent, onClose }) {
  const [reply, setReply] = useStateCom('');
  const replies = [
    { init: 'K', color: TEAL,  name: 'Kai N.',       role: 'Coach',  when: '38m', msg: "Agree with front-loading the review. I add a second touchpoint at week 7." },
    { init: 'A', color: CORAL, name: 'Amara D.',     role: 'Coach',  when: '1h',  msg: "Pricing question is real. I moved to 3-month minimum and retention is night and day." },
    { init: 'S', color: GOLD,  name: 'Sasha R.',     role: 'Coach',  when: '2h',  msg: "Curious about the crying-emoji handout, Lena — does it actually land?" },
  ];
  return (
    <div style={{ padding: '12px 24px 0' }}>
      <button onClick={onClose} style={{
        background: 'transparent', border: 0, color: accent, cursor: 'pointer',
        fontFamily: MONO, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase',
        padding: 0, marginBottom: 14,
      }}>← Feed</button>

      {/* Original post */}
      <EdCard pad={18} active>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <Attribution init={thread.init} color={thread.color} name={thread.name} role={thread.role} />
          <MLabel>{thread.when}</MLabel>
        </div>
        <div style={{ marginTop: 14, fontFamily: SERIF, fontSize: 19, lineHeight: 1.4, letterSpacing: '-0.01em', color: INK }}>
          {thread.msg}
        </div>
        <div style={{ marginTop: 16, paddingTop: 12, borderTop: `1px solid ${HAIR_S}`, display: 'flex', alignItems: 'center', gap: 18 }}>
          <button style={rxBtn(INK_60)}>♡  {thread.likes}</button>
          <button style={rxBtn(INK_60)}>↳  {thread.replies}</button>
          <button style={{ ...rxBtn(accent), marginLeft: 'auto' }}>Share</button>
        </div>
      </EdCard>

      {/* Replies header */}
      <div style={{ margin: '22px 0 8px' }}>
        <MLabel color={accent}>{replies.length} of {thread.replies} replies</MLabel>
      </div>

      {/* Reply list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {replies.map((r, i) => (
          <div key={i} style={{ display: 'flex', gap: 12, paddingLeft: 4 }}>
            <div style={{ flexShrink: 0 }}>
              <AvatarChip init={r.init} color={r.color} size={32} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500, color: INK, letterSpacing: -0.05 }}>{r.name}</span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{r.role}</span>
                <span style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.08em', marginLeft: 'auto' }}>{r.when}</span>
              </div>
              <div style={{ fontFamily: SANS, fontSize: 14, color: INK, lineHeight: 1.5, marginTop: 6, letterSpacing: -0.05 }}>
                {r.msg}
              </div>
              <div style={{ marginTop: 8, display: 'flex', gap: 14 }}>
                <button style={rxBtn(INK_45)}>♡</button>
                <button style={rxBtn(INK_45)}>Reply</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Reply composer */}
      <div style={{ marginTop: 22 }}>
        <div style={{
          border: `1px solid ${HAIR}`, borderRadius: 14, padding: '10px 12px',
          display: 'flex', alignItems: 'center', gap: 10, background: 'rgba(242,237,228,0.03)',
        }}>
          <input
            type="text"
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Reply to thread…"
            style={{
              flex: 1, background: 'transparent', border: 0, outline: 'none',
              fontFamily: SANS, fontSize: 14, color: INK, letterSpacing: -0.1,
            }}
          />
          <Pill solid color={accent}>Send</Pill>
        </div>
      </div>

      <div style={{ height: 20 }} />
    </div>
  );
}

Object.assign(window, { CommunityChat });
