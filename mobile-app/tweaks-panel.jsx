// ════════════════════════════════════════════════════════════════════
// OPTION B — "SIGNAL"
// Same one-page chat, presence-forward. A live "training now" rail up
// top, a soft segmented tab control, and rounded cards that wear their
// owner's tier color boldly. Warmer, more alive. Reuses Thread/Peek/
// AppNav/Locked from shapeChat.jsx.
// ════════════════════════════════════════════════════════════════════
const { useState: useSig } = React;

const SIG_TABS = [['feed', 'Feed', 3], ['friends', 'Friends', 2], ['team', 'Team', 2]];
const SIG_SUB = {
  feed:    [['community', 'Community'], ['clients', 'Clients'], ['shape', 'Shape']],
  friends: [['all', 'All'], ['groups', 'Groups'], ['unread', 'Unread']],
  team:    [['coaches', 'Coaches'], ['channels', 'Channels'], ['support', 'Support']],
};
const SIG_PROOF = {
  pr:        (it) => ({ tag: 'PR', big: `${it.load}`, unit: it.unit, sub: `${it.lift} · ${it.sets}×${it.reps}` }),
  run:       (it) => ({ tag: 'Run', big: `${it.dist}`, unit: it.unit, sub: `${it.pace}/mi · ${it.elev}ft` }),
  streak:    (it) => ({ tag: 'Streak', big: `${it.streak}`, unit: 'days', sub: 'No missed sessions' }),
  meal:      (it) => ({ tag: 'Meal', big: `${it.kcal}`, unit: 'kcal', sub: `${it.p}P · ${it.c}C · ${it.f}F` }),
  coachclip: (it) => ({ tag: 'Coach', big: null, sub: it.clip }),
};
const SIG_CHEER = { pr: 'Spot this', run: 'Match pace', streak: 'Respect', meal: 'Steal it', coachclip: 'Noted' };

function SigHeader({ t, tab, setTab, sub, setSub, onProfile }) {
  return (
    <div style={{ background: t.PAPER, position: 'sticky', top: 0, zIndex: 20, borderBottom: `1px solid ${t.HAIR}` }}>
      <div style={{ padding: '48px 18px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <div>
            <Eyebrow t={t} size={9} color={t.TEAL}>Chat</Eyebrow>
            <h1 style={{ fontFamily: SERIF, fontSize: 28, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, margin: '4px 0 0' }}>Community</h1>
          </div>
          <Avatar init="A" tier="form" size={34} t={t} onClick={onProfile} />
        </div>

        {/* live presence rail */}
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

      {/* segmented tab control */}
      <div style={{ padding: '0 18px 12px' }}>
        <div style={{ display: 'flex', gap: 4, background: t.PAPER2, border: `1px solid ${t.HAIR}`, borderRadius: 14, padding: 4 }}>
          {SIG_TABS.map(([id, label, unread]) => {
            const on = id === tab;
            return (
              <button key={id} onClick={() => { setTab(id); setSub(SIG_SUB[id][0][0]); }} style={{
                flex: 1, cursor: 'pointer', border: 0, borderRadius: 10, padding: '9px 0',
                background: on ? t.TEAL : 'transparent', color: on ? t.PAPER : t.INK70,
                fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              }}>
                {label}
                {unread > 0 && <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, color: on ? t.TEAL : t.PAPER, background: on ? t.PAPER : t.INK30, borderRadius: 999, minWidth: 15, padding: '1px 4px' }}>{unread}</span>}
              </button>
            );
          })}
        </div>
        {/* sub-filter */}
        <div className="sk-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 10 }}>
          {SIG_SUB[tab].map(([id, label]) => {
            const on = id === sub;
            return (
              <button key={id} onClick={() => setSub(id)} style={{
                flex: '0 0 auto', cursor: 'pointer', borderRadius: 999, padding: '6px 13px',
                background: on ? hexA(t.TEAL, t.dark ? 0.16 : 0.14) : 'transparent', color: on ? t.TEAL : t.INK50,
                border: `1px solid ${on ? hexA(t.TEAL, 0.5) : t.HAIR}`,
                fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>{label}</button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function SigCard({ t, item, onProfile, onOpen }) {
  const isCoach = item.kind === 'coachclip';
  const tc = tierColor(item.m.tier, t.dark);
  const accent = isCoach ? roleColor('trainer', t.dark) : tc;
  const p = SIG_PROOF[item.kind](item);
  const [on, setOn] = useSig(item.cheered);
  const [n, setN] = useSig(item.cheers);
  return (
    <div style={{ margin: '12px 16px', borderRadius: 18, border: `1px solid ${t.HAIR}`, background: t.PAPER2, overflow: 'hidden' }}>
      {/* tier color top hairline */}
      <div style={{ height: 3, background: accent }} />
      <div style={{ padding: '13px 15px 15px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
          <Avatar init={item.m.init} tier={item.m.tier} role={item.m.role} size={38} t={t} onClick={() => onProfile(item.m)} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <Byline name={item.m.name} tier={item.m.tier} role={item.m.role} t={t} size={14} />
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.INK50, marginTop: 4, letterSpacing: '0.08em' }}>{isCoach ? `re ${item.subject.first}` : item.channel ? `#${item.channel}` : ''} · {item.time}</div>
          </div>
        </div>

        {/* proof block */}
        <div onClick={onOpen} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 13, background: hexA(accent, t.dark ? 0.1 : 0.08) }}>
          {p.big != null ? (
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 4 }}>
              <span style={{ fontFamily: SERIF, fontSize: 34, fontWeight: 700, color: t.INK, letterSpacing: '-0.04em', lineHeight: 0.85 }}>{p.big}</span>
              <span style={{ fontFamily: MONO, fontSize: 10, color: t.INK70, fontWeight: 600 }}>{p.unit}</span>
            </div>
          ) : (
            <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.PAPER, background: accent, padding: '4px 7px', borderRadius: 5 }}>{p.tag}</span>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: SERIF, fontSize: 14.5, fontWeight: 600, color: t.INK, lineHeight: 1.2 }}>{p.sub}</div>
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 4, fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: accent, fontWeight: 700 }}>
              <span style={{ display: 'inline-flex', width: 11, height: 11, borderRadius: 6, border: `1px solid ${accent}`, alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>✓</span>{p.tag !== 'Coach' ? p.tag : 'Form note'} · Verified
            </div>
          </div>
        </div>

        {(item.note || isCoach) && (
          <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.45, color: t.INK70, margin: '11px 0 0' }}>
            {isCoach && <span style={{ color: accent, fontWeight: 600 }}>{item.m.first}: </span>}{isCoach ? item.cue : item.note}
          </p>
        )}

        <div style={{ display: 'flex', gap: 9, marginTop: 13 }}>
          <button onClick={() => { setOn(v => !v); setN(v => on ? v - 1 : v + 1); }} style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '7px 13px',
            background: on ? accent : 'transparent', color: on ? t.PAPER : t.INK70, border: `1px solid ${on ? accent : t.RULE}`,
            fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
          }}>↑ {SIG_CHEER[item.kind]} · {n}</button>
          <button onClick={onOpen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '7px 13px', background: 'transparent', color: t.INK70, border: `1px solid ${t.RULE}`, fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>↳ {item.replies}</button>
        </div>
      </div>
    </div>
  );
}

function SigRow({ t, m, channel, sub, last, time, unread, online, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      display: 'grid', gridTemplateColumns: '46px 1fr auto', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left',
      cursor: 'pointer', background: 'transparent', border: 0, padding: '11px 18px',
    }}>
      {channel
        ? <span style={{ width: 46, height: 46, borderRadius: 14, background: t.PAPER2, border: `1px solid ${t.HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 18, color: t.INK }}>#</span>
        : <Avatar init={m.init} tier={m.tier} role={m.role} size={46} t={t} live={online} />}
      <div style={{ minWidth: 0 }}>
        {channel ? <span style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 600, color: t.INK }}>#{m.name}</span> : <Byline name={m.name} tier={m.tier} role={m.role} t={t} />}
        <div style={{ fontFamily: SERIF, fontSize: 13.5, color: t.INK70, marginTop: 5, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last}</div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <Eyebrow t={t} size={8}>{time}</Eyebrow>
        {unread > 0 ? <span style={{ width: 9, height: 9, borderRadius: 5, background: t.TEAL }} /> : <span style={{ width: 9, height: 9 }} />}
      </div>
    </button>
  );
}

function ChatSignal({ t, viewer = 'member' }) {
  const guest = viewer === 'guest';
  const [tab, setTab] = useSig('feed');
  const [sub, setSub] = useSig('community');
  const [open, setOpen] = useSig(null);
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

  const feedItems = sub === 'clients' ? FEED.filter(f => f.kind !== 'coachclip') : sub === 'shape' ? FEED.filter(f => f.kind === 'streak' || f.kind === 'meal') : FEED;

  return (
    <React.Fragment>
      <StatusBar t={t} />
      <div className="sk-scroll" style={{ position: 'absolute', inset: 0, overflowY: guest ? 'hidden' : 'auto', background: t.PAPER, color: t.INK, paddingBottom: 92 }}>
        <SigHeader t={t} tab={tab} setTab={setTab} sub={sub} setSub={setSub} onProfile={(m) => setPeek(m && m.init ? m : M.alex)} />

        {tab === 'feed' && <div style={{ paddingTop: 4 }}>{feedItems.map((it) => <SigCard key={it.id} t={t} item={it} onProfile={(m) => setPeek(m)} onOpen={() => openThread(it.kind === 'coachclip' ? 'maya' : 'channel')} />)}</div>}

        {tab === 'friends' && (
          <div style={{ paddingTop: 6 }}>
            <SigRow t={t} m={M.priya} sub="" last="Spotting your PR tomorrow — wish me luck." time="9m" unread={1} online onOpen={() => openThread('channel')} />
            <SigRow t={t} m={M.drew} sub="" last="Taper week. Still on for Sunday's long run?" time="1h" unread={1} onOpen={() => openThread('channel')} />
            <SigRow t={t} m={M.devon} sub="" last="Who's in for the 6am Saturday session?" time="3h" unread={0} onOpen={() => openThread('channel')} />
            <SigRow t={t} m={M.sofia} sub="" last="Stole your post-run shake recipe 🙏" time="5h" unread={0} onOpen={() => openThread('channel')} />
          </div>
        )}

        {tab === 'team' && (
          <div style={{ paddingTop: 6 }}>
            {sub === 'coaches' && TEAM.map((c, i) => <SigRow key={i} t={t} m={c.m} sub="" last={c.m.role === 'trainer' ? 'Bumping your top set to 250×3.' : 'Consult Thursday 4pm — bring your logs.'} time={c.next} unread={c.unread} onOpen={() => openThread('maya')} />)}
            {sub === 'channels' && CHANNELS.map((c, i) => <SigRow key={i} t={t} m={{ name: c.name }} channel sub="" last={c.blurb} time={c.live ? 'LIVE' : '2h'} unread={0} onOpen={() => openThread('channel')} />)}
            {sub === 'support' && <SigRow t={t} m={THREADS.nora.who} sub="" last="Today's 245×3 = est. 1RM 268 lb. Share it?" time="now" unread={0} onOpen={() => openThread('nora')} />}
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
