// ════════════════════════════════════════════════════════════════════
// SHAPE · Chat — the in-app Chat section, simplified.
// One page inside the app's CHAT tab. Top tabs (Feed / Friends / Team)
// switch sections; a sub-filter row narrows each; tap a row to open a
// thread. Clean, scannable, one-thumb. Built on the broadsheet kit.
// ════════════════════════════════════════════════════════════════════
const { useState: useC, useRef: useCRef } = React;

// ── Minimal line icons (UI chrome only) ───────────────────────────
function Icon({ name, size = 22, color = 'currentColor', fill = false }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: color, strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  switch (name) {
    case 'home':  return <svg {...p}><path d="M4 11l8-6 8 6"/><path d="M6 10v9h12v-9"/></svg>;
    case 'train': return <svg {...p}><path d="M6 9v6M18 9v6M3 11v2M21 11v2M6 12h12"/></svg>;
    case 'eat':   return <svg {...p}><path d="M7 3v7a2 2 0 002 2v9M7 3v4M5 3v4M16 3c-1.5 0-2 2-2 4s.5 4 2 4v7"/></svg>;
    case 'chat':  return <svg {...p} fill={fill ? color : 'none'}><path d="M4 5h16v11H9l-4 4z"/></svg>;
    case 'me':    return <svg {...p}><circle cx="12" cy="8" r="3.4"/><path d="M5.5 20a6.5 6.5 0 0113 0"/></svg>;
    case 'back':  return <svg {...p}><path d="M15 5l-7 7 7 7"/></svg>;
    case 'plus':  return <svg {...p}><path d="M12 5v14M5 12h14"/></svg>;
    case 'search':return <svg {...p}><circle cx="11" cy="11" r="6"/><path d="M20 20l-4-4"/></svg>;
    case 'mic':   return <svg {...p}><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0014 0M12 18v3"/></svg>;
    case 'camera':return <svg {...p}><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.2"/></svg>;
    case 'send':  return <svg {...p}><path d="M5 12h13M12 5l7 7-7 7"/></svg>;
    default: return null;
  }
}

// ── App bottom nav — HOME / TRAIN / EAT / CHAT / ME ────────────────
function AppNav({ t, active = 'chat' }) {
  const items = [['home', 'Home'], ['train', 'Train'], ['eat', 'Eat'], ['chat', 'Chat'], ['me', 'Me']];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 90, height: 76, paddingBottom: 16,
      background: t.PAPER, borderTop: `1px solid ${t.HAIR}`,
      display: 'grid', gridTemplateColumns: 'repeat(5,1fr)',
    }}>
      {items.map(([k, label]) => {
        const on = k === active;
        const c = on ? t.TEAL : t.INK50;
        return (
          <div key={k} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5, cursor: 'pointer' }}>
            <Icon name={k} size={21} color={c} fill={on} />
            <span style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: c, fontWeight: on ? 700 : 500 }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Chat header — compact masthead + section tabs ─────────────────
const TABS = [
  { id: 'feed',    label: 'Feed',    unread: 3 },
  { id: 'friends', label: 'Friends', unread: 2 },
  { id: 'team',    label: 'Team',    unread: 2 },
];
const SUBFILTERS = {
  feed:    [['community', 'Community'], ['clients', 'Clients'], ['shape', 'Shape']],
  friends: [['all', 'All'], ['groups', 'Groups'], ['unread', 'Unread']],
  team:    [['coaches', 'Coaches'], ['channels', 'Channels'], ['support', 'Support']],
};

function ChatHeader({ t, tab, setTab, sub, setSub, onProfile, online = 2104 }) {
  return (
    <div style={{ background: t.PAPER, position: 'sticky', top: 0, zIndex: 20 }}>
      {/* masthead */}
      <div style={{ padding: '50px 20px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <svg width="14" height="16" viewBox="10 0 60 100" aria-hidden="true"><polygon points="70,12 70,58 36,35" fill={t.INK}/><polygon points="10,42 10,88 44,65" fill={t.TEAL}/></svg>
            <Eyebrow t={t} size={9}>Chat</Eyebrow>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <LiveDot color={t.TEAL} size={6} />
            <Eyebrow t={t} size={8.5}>{online.toLocaleString()} online</Eyebrow>
            <span style={{ width: 1, height: 14, background: t.HAIR, margin: '0 2px' }} />
            <Avatar init="A" tier="form" size={28} t={t} onClick={onProfile} />
          </div>
        </div>
        <h1 style={{ fontFamily: SERIF, fontSize: 34, lineHeight: 1, letterSpacing: '-0.03em', fontWeight: 600, margin: '12px 0 0', color: t.INK }}>
          The <span style={{ fontStyle: 'italic', color: t.TEAL }}>feed.</span>
        </h1>
      </div>

      {/* section tabs */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}` }}>
        {TABS.map((tb, i) => {
          const on = tb.id === tab;
          return (
            <button key={tb.id} onClick={() => { setTab(tb.id); setSub(SUBFILTERS[tb.id][0][0]); }} style={{
              position: 'relative', border: 0, borderLeft: i ? `1px solid ${t.HAIR}` : 0, cursor: 'pointer',
              background: 'transparent', padding: '13px 0 11px',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
            }}>
              <span style={{ fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>{tb.label}</span>
              {tb.unread > 0 && <span style={{ fontFamily: MONO, fontSize: 8.5, fontWeight: 700, color: t.PAPER, background: on ? t.TEAL : t.INK30, borderRadius: 999, minWidth: 16, textAlign: 'center', padding: '1px 5px' }}>{tb.unread}</span>}
              {on && <span style={{ position: 'absolute', left: 16, right: 16, bottom: -1, height: 2, background: t.TEAL }} />}
            </button>
          );
        })}
      </div>

      {/* sub-filters */}
      <div className="sk-scroll" style={{ display: 'flex', gap: 8, overflowX: 'auto', padding: '11px 20px', background: t.PAPER2 }}>
        {SUBFILTERS[tab].map(([id, label]) => {
          const on = id === sub;
          return (
            <button key={id} onClick={() => setSub(id)} style={{
              flex: '0 0 auto', cursor: 'pointer', borderRadius: 999, padding: '6px 13px',
              background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70,
              border: `1px solid ${on ? t.INK : t.RULE}`,
              fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
            }}>{label}</button>
          );
        })}
      </div>
    </div>
  );
}

// ── Clean proof card — scannable, low density ─────────────────────
const PROOF = {
  pr:        (it) => ({ tag: 'New PR',  line: `${it.lift} · ${it.sets}×${it.reps} @ ${it.load}${it.unit}`, big: `+${it.load - it.prevPr}`, bigUnit: it.unit }),
  run:       (it) => ({ tag: 'Run',     line: `${it.dist}${it.unit} long run`, big: it.pace, bigUnit: '/mi' }),
  streak:    (it) => ({ tag: 'Streak',  line: 'No missed sessions', big: it.streak, bigUnit: 'days' }),
  meal:      (it) => ({ tag: 'Meal',    line: it.meal, big: it.kcal, bigUnit: 'kcal' }),
  coachclip: (it) => ({ tag: 'Coach note', line: it.clip, big: null }),
};
const CHEER = { pr: 'Spot this', run: 'Match pace', streak: 'Respect', meal: 'Steal it', coachclip: 'Noted' };

function FeedCard({ t, item, onProfile, onOpen }) {
  const isCoach = item.kind === 'coachclip';
  const p = PROOF[item.kind](item);
  const accent = isCoach ? roleColor('trainer', t.dark) : t.TEAL;
  return (
    <div style={{ padding: '16px 20px', borderBottom: `1px solid ${t.HAIR}` }}>
      {/* head */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 11 }}>
        <Avatar init={item.m.init} tier={item.m.tier} role={item.m.role} size={34} t={t} onClick={() => onProfile(item.m)} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <Byline name={item.m.name} tier={item.m.tier} role={item.m.role} t={t} size={13.5} />
          <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.INK50, marginTop: 4, letterSpacing: '0.08em' }}>
            {isCoach ? `re ${item.subject.first}'s log` : item.channel ? `#${item.channel}` : ''} · {item.time}
          </div>
        </div>
        <span style={{ fontFamily: MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.PAPER, background: accent, padding: '3px 6px', borderRadius: 3 }}>{p.tag}</span>
      </div>

      {/* proof ribbon */}
      <div onClick={onOpen} style={{
        display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer',
        border: `1px solid ${isCoach ? hexA(accent, 0.5) : t.HAIR}`, background: isCoach ? hexA(accent, t.dark ? 0.07 : 0.05) : t.PAPER2,
        borderRadius: 10, padding: '11px 13px',
      }}>
        {p.big != null && (
          <div style={{ textAlign: 'center', minWidth: 56, paddingRight: 12, borderRight: `1px solid ${t.HAIR}` }}>
            <div style={{ fontFamily: SERIF, fontSize: 26, fontWeight: 700, color: t.INK, lineHeight: 0.9, letterSpacing: '-0.03em' }}>{p.big}</div>
            <div style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginTop: 3 }}>{p.bigUnit}</div>
          </div>
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: SERIF, fontSize: 15.5, fontWeight: 600, color: t.INK, lineHeight: 1.2 }}>{p.line}</div>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 5, fontFamily: MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>
            <span style={{ display: 'inline-flex', width: 11, height: 11, borderRadius: 6, border: `1px solid ${t.TEAL}`, color: t.TEAL, alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>✓</span>
            Verified
          </div>
        </div>
      </div>

      {/* note */}
      {item.note && !isCoach && <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.45, color: t.INK70, margin: '11px 0 0' }}>{item.note}</p>}
      {isCoach && <p style={{ fontFamily: SERIF, fontSize: 14.5, lineHeight: 1.45, color: t.INK70, margin: '11px 0 0' }}><span style={{ color: accent, fontWeight: 600 }}>{item.m.first}: </span>{item.cue}</p>}

      {/* reactions */}
      <div style={{ display: 'flex', gap: 16, marginTop: 12 }}>
        <CheerBtn t={t} label={CHEER[item.kind]} n={item.cheers} on={item.cheered} />
        <button onClick={onOpen} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>↳ Reply · {item.replies}</button>
      </div>
    </div>
  );
}

function CheerBtn({ t, label, n, on: on0 }) {
  const [on, setOn] = useC(on0);
  const [c, setC] = useC(n);
  return (
    <button onClick={() => { setOn(v => !v); setC(v => on ? v - 1 : v + 1); }} style={{
      background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
      display: 'inline-flex', alignItems: 'center', gap: 6,
      fontFamily: MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
      color: on ? t.TEAL : t.INK50,
    }}>
      <span style={{ fontSize: 12 }}>↑</span>{label} · {c}
    </button>
  );
}

// ── List row (Friends / Team) ─────────────────────────────────────
function Row({ t, m, channel, sub, last, time, unread, online, onOpen }) {
  return (
    <button onClick={onOpen} style={{
      display: 'grid', gridTemplateColumns: '40px 1fr auto', gap: 12, alignItems: 'center', width: '100%', textAlign: 'left',
      cursor: 'pointer', background: 'transparent', border: 0, padding: '13px 20px', borderBottom: `1px solid ${t.HAIR}`,
    }}>
      {channel
        ? <span style={{ width: 40, height: 40, borderRadius: 11, border: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 17, color: t.INK }}>#</span>
        : <Avatar init={m.init} tier={m.tier} role={m.role} size={40} t={t} live={online} />}
      <div style={{ minWidth: 0 }}>
        {channel ? <span style={{ fontFamily: SERIF, fontSize: 15, fontWeight: 600, color: t.INK }}>#{m.name}</span> : <Byline name={m.name} tier={m.tier} role={m.role} t={t} />}
        <div style={{ fontFamily: MONO, fontSize: 8, color: t.INK50, marginTop: 3, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{sub}</div>
        <div style={{ fontFamily: SERIF, fontSize: 13.5, color: t.INK70, marginTop: 5, lineHeight: 1.3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last}</div>
      </div>
      <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
        <Eyebrow t={t} size={8}>{time}</Eyebrow>
        {unread > 0 ? <span style={{ fontFamily: MONO, fontSize: 9, fontWeight: 700, color: t.PAPER, background: t.TEAL, borderRadius: 999, minWidth: 17, textAlign: 'center', padding: '1px 5px' }}>{unread}</span> : <span style={{ width: 6, height: 6 }} />}
      </div>
    </button>
  );
}

// ── Thread view + composer ────────────────────────────────────────
function Thread({ t, thread, onBack, onProfile }) {
  const [extras, setExtras] = useC([]);
  const [text, setText] = useC('');
  const ta = useCRef(null);
  const who = thread.who;
  const msgs = [...thread.msgs, ...extras];
  const grow = () => { const el = ta.current; if (!el) return; el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 110) + 'px'; };
  const send = () => { if (!text.trim()) return; setExtras(e => [...e, { from: 'me', t: text.trim(), time: 'now' }]); setText(''); setTimeout(() => { if (ta.current) ta.current.style.height = 'auto'; }, 0); };

  return (
    <div className="sk-scroll" style={{ position: 'absolute', inset: 0, background: t.PAPER, color: t.INK, display: 'flex', flexDirection: 'column' }}>
      <div style={{ flex: '0 0 auto', padding: '50px 14px 12px', borderBottom: `1px solid ${t.HAIR}`, background: t.PAPER }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 4, display: 'inline-flex' }}><Icon name="back" size={20} color={t.INK} /></button>
          <Avatar init={who.init} tier={who.tier} role={who.role} size={34} t={t} onClick={onProfile} live={thread.kind === 'channel'} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontFamily: SERIF, fontSize: 17, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>{thread.kind === 'channel' ? '#' + who.name : who.name}</span>
              {who.ai && <span style={{ flex: '0 0 auto', fontFamily: MONO, fontSize: 8, fontWeight: 700, color: t.PAPER, background: t.TEAL, padding: '2px 5px', borderRadius: 3, letterSpacing: '0.1em' }}>AI</span>}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 8.5, color: t.INK50, marginTop: 3, letterSpacing: '0.08em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{thread.sub}</div>
          </div>
        </div>
      </div>

      <div className="sk-scroll" style={{ flex: 1, overflowY: 'auto', padding: '16px 16px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {msgs.map((m, i) => <Bubble key={i} t={t} m={m} channel={thread.kind === 'channel'} onProfile={onProfile} />)}
      </div>

      <div style={{ flex: '0 0 auto', padding: '10px 14px 14px', borderTop: `1px solid ${t.HAIR}`, background: t.PAPER }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 9 }}>
          <button style={iconBtn(t)} aria-label="Photo"><Icon name="camera" size={19} color={t.INK70} /></button>
          <div style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 6, background: t.PAPER2, border: `1px solid ${t.RULE}`, borderRadius: 20, padding: '7px 8px 7px 14px' }}>
            <textarea ref={ta} rows={1} value={text} onChange={(e) => { setText(e.target.value); grow(); }}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={who.ai ? 'Ask Nora…' : 'Message…'}
              style={{ flex: 1, resize: 'none', border: 0, outline: 'none', background: 'transparent', color: t.INK, fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.35, maxHeight: 110, padding: '3px 0' }} />
            <button style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 2, display: 'inline-flex' }} aria-label="Voice note"><Icon name="mic" size={18} color={t.INK50} /></button>
          </div>
          <button onClick={send} disabled={!text.trim()} style={{ width: 40, height: 40, borderRadius: 20, border: 0, flex: '0 0 auto', background: text.trim() ? t.TEAL : t.PAPER3, color: text.trim() ? t.PAPER : t.INK50, cursor: text.trim() ? 'pointer' : 'default', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }} aria-label="Send"><Icon name="send" size={18} color={text.trim() ? t.PAPER : t.INK50} /></button>
        </div>
      </div>
    </div>
  );
}
function iconBtn(t) { return { width: 40, height: 40, borderRadius: 20, border: `1px solid ${t.RULE}`, background: 'transparent', cursor: 'pointer', flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }; }

function Bubble({ t, m, channel, onProfile }) {
  const me = m.from === 'me';
  const coach = m.coach;
  const who = m.who;
  const rc = coach ? roleColor('trainer', t.dark) : null;
  return (
    <div style={{ alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '82%' }}>
      {!me && channel && who && (
        <button onClick={() => onProfile(who)} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', display: 'block', marginBottom: 4 }}>
          <Byline name={who.name} tier={who.tier} role={who.role} t={t} size={11.5} />
        </button>
      )}
      {!me && m.from === 'nora' && <div style={{ marginBottom: 4 }}><Eyebrow t={t} color={t.TEAL} size={8}>Nora · Shape AI</Eyebrow></div>}
      <div style={{
        fontFamily: SERIF, fontSize: 15.5, lineHeight: 1.4, color: me ? t.PAPER : t.INK,
        background: me ? t.INK : (m.data ? hexA(t.TEAL, t.dark ? 0.12 : 0.14) : t.PAPER2),
        border: me ? 'none' : `1px solid ${m.data ? hexA(t.TEAL, 0.5) : t.HAIR}`,
        padding: '9px 12px', borderRadius: 15, borderBottomRightRadius: me ? 4 : 15, borderBottomLeftRadius: me ? 15 : 4,
      }}>
        {m.t}
        {m.clip && (
          <div style={{ marginTop: 9, padding: '9px 11px', background: t.PAPER, border: `1px solid ${hexA(rc || t.TEAL, 0.5)}`, borderRadius: 8 }}>
            <div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: rc || t.TEAL, marginBottom: 5 }}>Program tweak · applied</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: SERIF, color: t.INK }}>
              <span style={{ fontSize: 14, fontWeight: 600 }}>{m.clip.lift}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: t.INK50, textDecoration: 'line-through' }}>{m.clip.was}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: t.TEAL }}>→ {m.clip.next}</span>
            </div>
          </div>
        )}
      </div>
      <div style={{ marginTop: 4, textAlign: me ? 'right' : 'left' }}><Eyebrow t={t} size={7.5}>{m.time}{m.cheers ? ` · ↑ ${m.cheers}` : ''}</Eyebrow></div>
    </div>
  );
}

// ── Profile peek ──────────────────────────────────────────────────
function Peek({ t, m, onClose, onMessage }) {
  return (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 130, background: hexA('#000', 0.5), display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} className="sk-anim" style={{ width: '100%', background: t.PAPER, borderTop: `2px solid ${t.INK}`, borderRadius: '20px 20px 0 0', padding: '14px 20px 26px', animation: 'skRise .28s ease-out both' }}>
        <div style={{ width: 36, height: 4, borderRadius: 2, background: t.RULE, margin: '0 auto 16px' }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
          <Avatar init={m.init} tier={m.tier} role={m.role} size={52} t={t} />
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 23, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1 }}>{m.name}</div>
            <div style={{ marginTop: 7 }}><Byline name="" tier={m.tier} role={m.role} t={t} /></div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: 16, borderTop: `1px solid ${t.HAIR}`, borderBottom: `1px solid ${t.HAIR}` }}>
          {[['Shape Score', m.tier === 'legend' ? '4,970' : m.tier === 'peak' ? '6,210' : '2,840'], ['Streak', m.tier === 'legend' ? '100d' : '14d'], ['PRs', m.tier === 'legend' ? '38' : '12']].map(([k, v], i) => (
            <div key={i} style={{ flex: 1, padding: '12px 0', borderLeft: i ? `1px solid ${t.HAIR}` : 0, paddingLeft: i ? 13 : 0 }}>
              <div style={{ fontFamily: SERIF, fontSize: 21, fontWeight: 600, color: t.INK }}>{v}</div>
              <div style={{ fontFamily: MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>{k}</div>
            </div>
          ))}
        </div>
        <button onClick={onMessage} style={{ marginTop: 15, width: '100%', height: 46, borderRadius: 12, border: 0, background: t.TEAL, color: t.PAPER, fontFamily: MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Message {m.first || m.name.split(' ')[0]}</button>
      </div>
    </div>
  );
}

// ── Locked preview (guest) ────────────────────────────────────────
function Locked({ t }) {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 76, top: '48%', zIndex: 80, pointerEvents: 'none' }}>
      <div style={{ position: 'absolute', inset: 0, background: `linear-gradient(180deg, ${hexA(t.PAPER, 0)} 0%, ${hexA(t.PAPER, 0.86)} 32%, ${t.PAPER} 58%)` }} />
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '0 22px 22px', pointerEvents: 'auto', textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 11 }}>
          <LiveDot color={t.TEAL} /><Eyebrow t={t} size={9} color={t.TEAL}>2,104 training right now</Eyebrow>
        </div>
        <h2 style={{ fontFamily: SERIF, fontSize: 27, fontWeight: 600, letterSpacing: '-0.025em', color: t.INK, lineHeight: 1.05, margin: '0 0 8px' }}>
          The floor is busy. <span style={{ fontStyle: 'italic', color: t.TEAL }}>Step on.</span>
        </h2>
        <p style={{ fontFamily: SERIF, fontSize: 14, color: t.INK70, lineHeight: 1.45, margin: '0 auto 15px', maxWidth: 270 }}>Real PRs, real runs, real coaches — verified, not vanity.</p>
        <button style={{ width: '100%', height: 50, borderRadius: 13, border: 0, background: t.TEAL, color: t.PAPER, fontFamily: MONO, fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Join Shape · $5/mo →</button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// CHAT PAGE — the whole section, one tab
// ════════════════════════════════════════════════════════════════════
function ChatPage({ t, viewer = 'member' }) {
  const guest = viewer === 'guest';
  const [tab, setTab] = useC('feed');
  const [sub, setSub] = useC('community');
  const [open, setOpen] = useC(null);
  const [peek, setPeek] = useC(null);
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

  // Feed list filtered by sub-filter (community = all; clients = peers; shape = official)
  const feedItems = sub === 'clients' ? FEED.filter(f => f.kind !== 'coachclip')
    : sub === 'shape' ? FEED.filter(f => f.kind === 'streak' || f.kind === 'meal')
    : FEED;

  return (
    <React.Fragment>
      <StatusBar t={t} />
      <div className="sk-scroll" style={{ position: 'absolute', inset: 0, overflowY: guest ? 'hidden' : 'auto', background: t.PAPER, color: t.INK, paddingBottom: 88 }}>
        <ChatHeader t={t} tab={tab} setTab={setTab} sub={sub} setSub={setSub} onProfile={() => setPeek(M.alex)} />

        {tab === 'feed' && feedItems.map((it) => (
          <FeedCard key={it.id} t={t} item={it} onProfile={(m) => setPeek(m)} onOpen={() => openThread(it.kind === 'coachclip' ? 'maya' : 'channel')} />
        ))}

        {tab === 'friends' && (
          <React.Fragment>
            <Row t={t} m={M.priya} sub="Form tier · Online" last="Spotting your PR tomorrow — wish me luck." time="9m" unread={1} online onOpen={() => openThread('channel')} />
            <Row t={t} m={M.drew} sub="Legend tier" last="Taper week. Still on for Sunday's long run?" time="1h" unread={1} onOpen={() => openThread('channel')} />
            <Row t={t} m={M.devon} sub="Tempo tier · Group · 4" last="Who's in for the 6am Saturday session?" time="3h" unread={0} onOpen={() => openThread('channel')} />
            <Row t={t} m={M.sofia} sub="Raw tier" last="Stole your post-run shake recipe 🙏" time="5h" unread={0} onOpen={() => openThread('channel')} />
          </React.Fragment>
        )}

        {tab === 'team' && (
          <React.Fragment>
            {sub === 'coaches' && TEAM.map((c, i) => (
              <Row key={i} t={t} m={c.m} sub={c.spec} last={c.m.role === 'trainer' ? 'Bumping your top set to 250×3. Editing Block 3.' : 'Consult Thursday 4pm — bring your logs.'} time={c.next} unread={c.unread} onOpen={() => openThread('maya')} />
            ))}
            {sub === 'channels' && CHANNELS.map((c, i) => (
              <Row key={i} t={t} m={{ name: c.name }} channel sub={`${c.members.toLocaleString()} members · ${c.online} online`} last={c.blurb} time={c.live ? 'LIVE' : '2h'} unread={0} onOpen={() => openThread('channel')} />
            ))}
            {sub === 'support' && (
              <Row t={t} m={THREADS.nora.who} sub="Shape assistant · always on" last="Today's 245×3 = est. 1RM 268 lb. Share it?" time="now" unread={0} onOpen={() => openThread('nora')} />
            )}
          </React.Fragment>
        )}

        {guest && <Locked t={t} />}
      </div>

      <AppNav t={t} active="chat" />
      {peek && <Peek t={t} m={peek} onClose={() => setPeek(null)} onMessage={() => { setPeek(null); openThread('channel'); }} />}
    </React.Fragment>
  );
}

Object.assign(window, { ChatPage, Icon, AppNav, Thread, Peek, Locked, PROOF, CHEER });
