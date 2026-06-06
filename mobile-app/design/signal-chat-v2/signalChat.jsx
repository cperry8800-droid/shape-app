// ════════════════════════════════════════════════════════════════════
// OPTION B — "SIGNAL"  (Strava-style activity + dedicated Channels tab)
// Tabs: Feed (community activity — every workout shown, Strava-style) ·
// Channels (group/club feeds) · Friends (DMs) · Team (coaches + Nora).
// Presence-forward, rounded, tier-colored. Reuses Thread/Peek/AppNav/
// Locked from shapeChat.jsx.
// ════════════════════════════════════════════════════════════════════
const { useState: useSig } = React;

const SIG_TABS = [['feed', 'Feed', 3], ['channels', 'Channels', 1], ['friends', 'Friends', 2], ['team', 'Team', 1]];

// Strava-style activity meta per proof kind
const SIG_ACT = {
  pr:     (it) => ({ type: 'Strength', city: 'Gold St. Barbell · NYC', title: `${it.lift} — new PR`, stats: [['Top set', `${it.sets}×${it.reps}`], ['Load', `${it.load} ${it.unit}`], ['Est. 1RM', `${it.e1rm} ${it.unit}`]], route: false }),
  run:    (it) => ({ type: 'Run', city: 'East River Loop · NYC', title: `${it.dist} ${it.unit} long run`, stats: [['Distance', `${it.dist} ${it.unit}`], ['Pace', `${it.pace}/mi`], ['Elev', `${it.elev} ft`]], route: true }),
  streak: (it) => ({ type: 'Streak', city: 'Shape', title: `${it.streak}-day streak`, stats: [['Days', `${it.streak}`], ['This week', '6/6'], ['Tier', 'Form ▲']], route: false }),
  meal:   (it) => ({ type: 'Nutrition', city: 'Logged', title: it.meal, stats: [['Energy', `${it.kcal}`], ['Protein', `${it.p} g`], ['Carbs', `${it.c} g`]], route: false }),
};
const SIG_CHEER = { pr: 'Spot this', run: 'Match pace', streak: 'Respect', meal: 'Steal it', coachclip: 'Noted' };

function SigHeader({ t, tab, setTab, onProfile }) {
  return (
    <div style={{ background: t.PAPER, position: 'sticky', top: 0, zIndex: 20, borderBottom: `1px solid ${t.HAIR}` }}>
      <div style={{ padding: '48px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <Eyebrow t={t} size={9} color={t.TEAL}>Chat</Eyebrow>
            <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, margin: '4px 0 0' }}>
              {tab === 'feed' ? 'Community' : tab === 'channels' ? 'Channels' : tab === 'friends' ? 'Friends' : 'Your team'}
            </h1>
          </div>
          <Avatar init="A" tier="form" size={34} t={t} onClick={onProfile} />
        </div>

        {/* live presence rail — feed only */}
        {tab === 'feed' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
              <LiveDot color={t.TEAL} size={6} />
              <Eyebrow t={t} size={8.5}>2,104 lifting now · near you</Eyebrow>
            </div>
            <div className="sk-scroll" style={{ display: 'flex', gap: 14, overflowX: 'auto', paddingBottom: 2 }}>
              {TRAINING_NOW.map((p, i) => (
                <button key={i} onClick={() => onProfile(p.m)} style={{ flex: '0 0 auto', width: 52, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, textAlign: 'center' }}>
                  <Avatar init={p.m.init} tier={p.m.tier} role={p.m.role} size={46} t={t} live />
                  <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.INK70, marginTop: 6, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.m.first}</div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* segmented tab control — 4 tabs */}
      <div style={{ padding: '0 14px 12px' }}>
        <div style={{ display: 'flex', gap: 3, background: t.PAPER2, border: `1px solid ${t.HAIR}`, borderRadius: 13, padding: 3 }}>
          {SIG_TABS.map(([id, label, unread]) => {
            const on = id === tab;
            return (
              <button key={id} onClick={() => setTab(id)} style={{
                flex: 1, cursor: 'pointer', border: 0, borderRadius: 10, padding: '9px 2px',
                background: on ? t.TEAL : 'transparent', color: on ? t.PAPER : t.INK70,
                fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4,
              }}>
                {label}
                {unread > 0 && <span style={{ fontFamily: MONO, fontSize: 7.5, fontWeight: 700, color: on ? t.TEAL : t.PAPER, background: on ? t.PAPER : t.INK30, borderRadius: 999, minWidth: 13, padding: '1px 3px' }}>{unread}</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Strava-style activity card ────────────────────────────────────
function SigActivity({ t, item, onProfile, onOpen }) {
  const tc = tierColor(item.m.tier, t.dark);
  const a = SIG_ACT[item.kind](item);
  const [on, setOn] = useSig(item.cheered);
  const [n, setN] = useSig(item.cheers);
  return (
    <div style={{ margin: '12px 16px', borderRadius: 18, border: `1px solid ${t.HAIR}`, background: t.PAPER2, overflow: 'hidden' }}>
      <div style={{ height: 3, background: tc }} />
      <div style={{ padding: '13px 15px 15px' }}>
        {/* author + activity type */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
          <Avatar init={item.m.init} tier={item.m.tier} role={item.m.role} size={40} t={t} onClick={() => onProfile(item.m)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Byline name={item.m.name} tier={item.m.tier} role={item.m.role} t={t} size={14} />
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.INK50, marginTop: 4, letterSpacing: '0.06em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.time} ago · {a.city}</div>
          </div>
          <span style={{ flex: '0 0 auto', fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.PAPER, background: tc, padding: '3px 7px', borderRadius: 5 }}>{a.type}</span>
        </div>

        {/* activity title */}
        <div onClick={onOpen} style={{ cursor: 'pointer' }}>
          <div style={{ fontFamily: SERIF, fontSize: 19, fontWeight: 600, color: t.INK, letterSpacing: '-0.015em', lineHeight: 1.1 }}>{a.title}</div>
          {item.note && <p style={{ fontFamily: SERIF, fontSize: 14, lineHeight: 1.4, color: t.INK70, margin: '7px 0 0' }}>{item.note}</p>}

          {/* route map for runs */}
          {a.route && <div style={{ marginTop: 12 }}><Halftone t={t} h={104} accent={tc} label="GPS route" dense /></div>}

          {/* stat row */}
          <div style={{ display: 'flex', marginTop: 13, paddingTop: 12, borderTop: `1px solid ${t.HAIR}` }}>
            {a.stats.map(([k, v], i) => (
              <div key={i} style={{ flex: 1, borderLeft: i ? `1px solid ${t.HAIR}` : 0, paddingLeft: i ? 12 : 0 }}>
                <div style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{k}</div>
                <div style={{ fontFamily: SERIF, fontSize: 18, fontWeight: 600, color: t.INK, marginTop: 3, letterSpacing: '-0.02em' }}>{v}</div>
              </div>
            ))}
          </div>
        </div>

        {/* verified + engagement */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 13 }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.TEAL, fontWeight: 700, marginRight: 'auto' }}>
            <span style={{ display: 'inline-flex', width: 12, height: 12, borderRadius: 6, border: `1px solid ${t.TEAL}`, alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>✓</span>Verified
          </span>
          <button onClick={() => { setOn(v => !v); setN(v => on ? v - 1 : v + 1); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '7px 13px',
            background: on ? tc : 'transparent', color: on ? t.PAPER : t.INK70, border: `1px solid ${on ? tc : t.RULE}`,
            fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
          }}>↑ {SIG_CHEER[item.kind]} · {n}</button>
          <button onClick={onOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '7px 12px', background: 'transparent', color: t.INK70, border: `1px solid ${t.RULE}`, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>↳ {item.replies}</button>
        </div>
      </div>
    </div>
  );
}

// ── Coach note card (clipped into the activity feed) ──────────────
function SigCoachNote({ t, item, onProfile, onOpen }) {
  const rc = roleColor('trainer', t.dark);
  const [on, setOn] = useSig(item.cheered);
  const [n, setN] = useSig(item.cheers);
  return (
    <div style={{ margin: '12px 16px', borderRadius: 18, border: `1px solid ${hexA(rc, 0.5)}`, background: hexA(rc, t.dark ? 0.07 : 0.05), overflow: 'hidden' }}>
      <div style={{ height: 3, background: rc }} />
      <div style={{ padding: '13px 15px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 11 }}>
          <Avatar init={item.m.init} tier={item.m.tier} role={item.m.role} size={40} t={t} onClick={() => onProfile(item.m)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Byline name={item.m.name} tier={item.m.tier} role={item.m.role} t={t} size={14} />
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.INK50, marginTop: 4, letterSpacing: '0.06em' }}>{item.time} ago · on {item.subject.first}'s log</div>
          </div>
          <span style={{ flex: '0 0 auto', fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.PAPER, background: rc, padding: '3px 7px', borderRadius: 5 }}>Coach</span>
        </div>
        <div onClick={onOpen} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', background: t.PAPER, border: `1px solid ${t.HAIR}`, borderRadius: 11, marginBottom: 11 }}>
          <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: t.PAPER, background: t.INK, padding: '3px 6px', borderRadius: 4, letterSpacing: '0.1em' }}>CLIP</span>
          <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: t.INK }}>{item.clip}</span>
          <span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 8.5, color: t.INK50 }}>▶ 0:14</span>
        </div>
        <p style={{ fontFamily: SERIF, fontSize: 15, lineHeight: 1.45, color: t.INK, margin: 0 }}><span style={{ color: rc, fontWeight: 600 }}>{item.m.first}: </span>{item.cue}</p>
        <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
          <button onClick={() => { setOn(v => !v); setN(v => on ? v - 1 : v + 1); }} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '7px 13px', background: on ? rc : 'transparent', color: on ? t.PAPER : t.INK70, border: `1px solid ${on ? rc : t.RULE}`, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>↑ Noted · {n}</button>
        </div>
      </div>
    </div>
  );
}

// ── Channel card (Channels tab) ───────────────────────────────────
function SigChannel({ t, ch, onOpen }) {
  return (
    <button onClick={onOpen} style={{ display: 'block', textAlign: 'left', cursor: 'pointer', margin: '10px 16px', width: 'calc(100% - 32px)', borderRadius: 16, border: `1px solid ${t.HAIR}`, background: t.PAPER2, padding: '14px 15px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: hexA(t.TEAL, t.dark ? 0.12 : 0.1), border: `1px solid ${hexA(t.TEAL, 0.4)}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 18, color: t.TEAL }}>#</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontFamily: SERIF, fontSize: 16, fontWeight: 600, color: t.INK }}>#{ch.name}</span>
            {ch.live && <span style={{ fontFamily: MONO, fontSize: 7, fontWeight: 700, letterSpacing: '0.12em', color: '#e0518a', border: '1px solid #e0518a', padding: '1px 4px', borderRadius: 3 }}>LIVE</span>}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.INK50, marginTop: 4, letterSpacing: '0.06em' }}>{ch.members.toLocaleString()} members · {ch.online} online</div>
        </div>
        <span style={{ flex: '0 0 auto', fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.PAPER, background: t.INK, padding: '6px 11px', borderRadius: 999 }}>Open</span>
      </div>
      <div style={{ fontFamily: SERIF, fontSize: 14, color: t.INK70, lineHeight: 1.35 }}>{ch.blurb}</div>
    </button>
  );
}

function SigRow({ t, m, channel, last, time, unread, online, onOpen }) {
  return (
    <button onClick={onOpen} style={{ display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, padding: '11px 18px' }}>
      <Avatar init={m.init} tier={m.tier} role={m.role} size={46} t={t} live={online} />
      <div style={{ minWidth: 0 }}>
        <Byline name={m.name} tier={m.tier} role={m.role} t={t} />
        <div style={{ fontFamily: SERIF, fontSize: 13.5, color: t.INK70, marginTop: 5, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last}</div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <Eyebrow t={t} size={8}>{time}</Eyebrow>
        {unread > 0 ? <span style={{ width: 9, height: 9, borderRadius: 5, background: t.TEAL }} /> : <span style={{ width: 9, height: 9 }} />}
      </div>
    </button>
  );
}

function SigSectionLabel({ t, children }) {
  return <div style={{ padding: '16px 18px 4px' }}><Eyebrow t={t} size={8.5} color={t.INK}>{children}</Eyebrow></div>;
}

function ChatSignal({ t, viewer = 'member', initialTab = 'feed', initialThread = null }) {
  const guest = viewer === 'guest';
  const [tab, setTab] = useSig(initialTab);
  const [open, setOpen] = useSig(initialThread);
  const [peek, setPeek] = useSig(null);
  const openThread = (k) => { if (!guest) setOpen(k); };

  if (open && THREADS[open]) {
    return (
      <React.Fragment>
        <StatusBar t={t} />
        <Thread t={t} thread={THREADS[open]} onBack={() => setOpen(null)} onProfile={(m) => m && setPeek(m)} />
        {peek && <Peek t={t} m={peek} onClose={() => setPeek(null)} onMessage={() => setPeek(null)} />}
      </React.Fragment>
    );
  }

  return (
    <React.Fragment>
      <StatusBar t={t} />
      <div className="sk-scroll" style={{ position: 'absolute', inset: 0, overflowY: guest ? 'hidden' : 'auto', background: t.PAPER, color: t.INK, paddingBottom: 92 }}>
        <SigHeader t={t} tab={tab} setTab={setTab} onProfile={(m) => setPeek(m && m.init ? m : M.alex)} />

        {/* FEED — Strava-style activity stream (every workout) */}
        {tab === 'feed' && (
          <div style={{ paddingTop: 4 }}>
            {FEED.map((it) => it.kind === 'coachclip'
              ? <SigCoachNote key={it.id} t={t} item={it} onProfile={(m) => setPeek(m)} onOpen={() => openThread('maya')} />
              : <SigActivity key={it.id} t={t} item={it} onProfile={(m) => setPeek(m)} onOpen={() => openThread('channel')} />
            )}
            <div style={{ textAlign: 'center', padding: '14px 0 6px' }}><Eyebrow t={t} size={8.5}>You're all caught up · refreshed 9:41a</Eyebrow></div>
          </div>
        )}

        {/* CHANNELS — group/club feeds, their own tab */}
        {tab === 'channels' && (
          <div style={{ paddingTop: 4 }}>
            <SigSectionLabel t={t}>Your channels</SigSectionLabel>
            {CHANNELS.filter(c => c.name !== 'ask-a-coach').map((c, i) => <SigChannel key={i} t={t} ch={c} onOpen={() => openThread('channel')} />)}
            <SigSectionLabel t={t}>Discover</SigSectionLabel>
            <SigChannel t={t} ch={CHANNELS.find(c => c.name === 'ask-a-coach')} onOpen={() => openThread('channel')} />
          </div>
        )}

        {/* FRIENDS — DMs */}
        {tab === 'friends' && (
          <div style={{ paddingTop: 6 }}>
            <SigRow t={t} m={M.priya} last="Spotting your PR tomorrow — wish me luck." time="9m" unread={1} online onOpen={() => openThread('channel')} />
            <SigRow t={t} m={M.drew} last="Taper week. Still on for Sunday's long run?" time="1h" unread={1} onOpen={() => openThread('channel')} />
            <SigRow t={t} m={M.devon} last="Group · who's in for the 6am Saturday session?" time="3h" unread={0} onOpen={() => openThread('channel')} />
            <SigRow t={t} m={M.sofia} last="Stole your post-run shake recipe 🙏" time="5h" unread={0} onOpen={() => openThread('channel')} />
          </div>
        )}

        {/* TEAM — coaches + Nora */}
        {tab === 'team' && (
          <div style={{ paddingTop: 6 }}>
            <SigSectionLabel t={t}>Coaches</SigSectionLabel>
            {TEAM.map((c, i) => <SigRow key={i} t={t} m={c.m} last={c.m.role === 'trainer' ? 'Bumping your top set to 250×3.' : 'Consult Thursday 4pm — bring your logs.'} time={c.next} unread={c.unread} onOpen={() => openThread('maya')} />)}
            <SigSectionLabel t={t}>Support</SigSectionLabel>
            <SigRow t={t} m={THREADS.nora.who} last="Today's 245×3 = est. 1RM 268 lb. Share it?" time="now" unread={0} onOpen={() => openThread('nora')} />
          </div>
        )}

        {guest && <Locked t={t} />}
      </div>

      <AppNav t={t} active="chat" />
      {peek && <Peek t={t} m={peek} onClose={() => setPeek(null)} onMessage={() => { setPeek(null); openThread('channel'); }} />}
    </React.Fragment>
  );
}

Object.assign(window, { ChatSignal });
