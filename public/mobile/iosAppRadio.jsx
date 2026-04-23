// Shape Radio — iOS app
// ONE live station streaming by default ("Shape Radio — live now").
// The only "channels" are personalized playlists sent by the user's coach/nutritionist.
// Ad-free, BPM-tagged, free with Shape membership.

const { useState: useStateR } = React;

// The one live stream.
const LIVE_STATION = {
  name: 'Shape Radio',
  show: 'Heavy Day with DJ Kaya Mars',
  bpm: 132,
  listeners: 3472,
  nextUp: 'Tempo Run at 6 PM · Nilo Ceza',
  color: '#1ec0a8',
  // mock track ticker
  tracks: [
    { t: '— now —', a: 'Roots of the Machine', b: 'MERIT · 132 BPM' },
    { t: '3m ago', a: 'Floor Program II', b: 'Tariq Osei · 130 BPM' },
    { t: '7m ago', a: 'Ironwood', b: 'Sable · 134 BPM' },
    { t: '11m ago', a: 'Peak Set', b: 'DJ Kaya Mars · 132 BPM' },
    { t: '15m ago', a: 'Cue the Lift', b: 'Linnea Aho · 128 BPM' },
  ],
};

// Playlists your team has sent — these are the ONLY alternative channels.
const COACH_PLAYLISTS = [
  {
    name: 'Pull day tempo',
    by: 'Jordan Chen',
    role: 'Your coach',
    init: 'J',
    color: '#e37a5a',
    len: '52m',
    bpm: '95–138 BPM',
    tracks: 14,
    attached: 'Upper Pull · W6 D4',
    sent: 'Sent Mon',
    unplayed: true,
  },
  {
    name: 'Meal prep, low-pressure',
    by: 'Dr. Maya Patel',
    role: 'Your nutritionist',
    init: 'M',
    color: '#d9b26a',
    len: '45m',
    bpm: '85–100 BPM',
    tracks: 12,
    attached: 'Sunday prep · 8 meals',
    sent: 'Sent Sun',
  },
  {
    name: 'Riverside long run',
    by: 'Jordan Chen',
    role: 'Your coach',
    init: 'J',
    color: '#e37a5a',
    len: '1h 50m',
    bpm: '160–172 BPM',
    tracks: 24,
    attached: 'Sat Z2 run · 18k',
    sent: 'Sent last week',
  },
];

function RadioScreen({ onBack }) {
  // channel: 'live' or the index of a coach playlist
  const [channel, setChannel] = useStateR('live');
  const [paused, setPaused] = useStateR(false);

  const isLive = channel === 'live';
  const current = isLive ? LIVE_STATION : COACH_PLAYLISTS[channel];
  const accent = isLive ? LIVE_STATION.color : current.color;

  return (
    <div style={{
      position: 'absolute', inset: 0, background: PAPER, color: INK,
      overflow: 'auto', paddingBottom: 40,
    }}>
      {/* HERO — player */}
      <div style={{
        position: 'relative',
        background: `radial-gradient(140% 100% at 70% 0%, ${accent}22 0%, ${PAPER} 70%)`,
        padding: '58px 24px 28px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
          <button onClick={onBack} style={{
            background: 'transparent', border: 0, color: INK, cursor: 'pointer',
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase',
            padding: 0,
          }}>← Back</button>
          <div style={{ display: 'flex', gap: 8 }}>
            <IconBtn><Icon name="heart" size={16} color={INK} /></IconBtn>
            <IconBtn><Icon name="more" size={16} color={INK} /></IconBtn>
          </div>
        </div>

        {/* Channel label */}
        {isLive ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em',
            color: accent, textTransform: 'uppercase',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: 4, background: accent,
              animation: 'radio-pulse 1.4s ease-in-out infinite',
            }} />
            Live now · {LIVE_STATION.listeners.toLocaleString()} listening
          </div>
        ) : (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
            fontFamily: MONO, fontSize: 11, letterSpacing: '0.18em',
            color: accent, textTransform: 'uppercase',
          }}>
            From {current.by.split(' ')[0]} · {current.role}
          </div>
        )}

        {/* Big title */}
        <h1 style={{
          fontFamily: SERIF, fontSize: 44, lineHeight: 0.95, letterSpacing: '-0.04em',
          fontWeight: 400, margin: 0, color: INK,
        }}>
          {isLive ? (
            <>{LIVE_STATION.show.split(' with ')[0]}<br/>
              <em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>
                with {LIVE_STATION.show.split(' with ')[1].split(' ').slice(0, 2).join(' ')}
              </em><em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>
                {' '}{LIVE_STATION.show.split(' with ')[1].split(' ').slice(2).join(' ')}
              </em>
            </>
          ) : (
            <>{current.name}<em style={{ fontStyle: 'italic', color: accent, fontWeight: 500 }}>.</em></>
          )}
        </h1>

        {/* Meta stats */}
        <div style={{ marginTop: 14 }}>
          <MStats
            items={isLive
              ? [`${LIVE_STATION.bpm} BPM`, 'Ad-free', 'Offline-ready']
              : [current.bpm, `${current.tracks} tracks`, current.len]}
            color={accent}
          />
        </div>

        {/* Waveform */}
        <div style={{ marginTop: 26, display: 'flex', alignItems: 'flex-end', gap: 3, height: 44 }}>
          {Array.from({ length: 48 }).map((_, i) => {
            const h = 15 + Math.abs(Math.sin(i * 0.6 + (isLive ? 0 : 1.4))) * 85;
            const active = i < (paused ? 0 : 20);
            return (
              <div key={i} style={{
                flex: 1, height: `${h}%`,
                background: active ? accent : HAIR,
                borderRadius: 1,
                animation: active && !paused ? `radio-bar-${i % 4} 1.${(i % 5) + 2}s ease-in-out infinite` : 'none',
              }} />
            );
          })}
        </div>

        <style>{`
          @keyframes radio-pulse {0%, 100% { opacity: 1; } 50% { opacity: 0.3; }}
          @keyframes radio-bar-0 {0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.4); }}
          @keyframes radio-bar-1 {0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.7); }}
          @keyframes radio-bar-2 {0%, 100% { transform: scaleY(0.6); } 50% { transform: scaleY(1); }}
          @keyframes radio-bar-3 {0%, 100% { transform: scaleY(0.8); } 50% { transform: scaleY(0.5); }}
        `}</style>

        {/* Play controls */}
        <div style={{
          marginTop: 26, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>
              {isLive ? 'Now playing' : 'Track 1 of ' + current.tracks}
            </div>
            <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, marginTop: 3, lineHeight: 1.1 }}>
              {isLive ? LIVE_STATION.tracks[0].a : 'Roots of the Machine'}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 3, letterSpacing: '0.06em' }}>
              {isLive ? LIVE_STATION.tracks[0].b : 'MERIT · 132 BPM'}
            </div>
          </div>
          <button onClick={() => setPaused(p => !p)} style={{
            width: 64, height: 64, borderRadius: 32, border: 0, cursor: 'pointer',
            background: accent, color: PAPER,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20, flexShrink: 0, boxShadow: `0 10px 30px ${accent}55`,
          }}>{paused ? '▶' : '❚❚'}</button>
        </div>
      </div>

      {/* LIVE STREAM details */}
      {isLive ? (
        <>
          <SectionHeader eyebrow="What's been on" title="Last 15 min" />
          <div style={{ padding: '0 24px' }}>
            {LIVE_STATION.tracks.map((t, i) => {
              const now = i === 0;
              const isLast = i === LIVE_STATION.tracks.length - 1;
              return (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 14, padding: '13px 0',
                  borderBottom: isLast ? 0 : `1px solid ${HAIR_S}`,
                  opacity: now ? 1 : 0.85,
                }}>
                  <div style={{
                    width: 38, flexShrink: 0,
                    fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.1em',
                    color: now ? accent : INK_45,
                    textTransform: 'uppercase',
                  }}>
                    {now ? '● LIVE' : t.t}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: SANS, fontSize: 15, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>
                      {t.a}
                    </div>
                    <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.06em', color: INK_60, marginTop: 3 }}>
                      {t.b}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Up next */}
          <div style={{ padding: '22px 24px 0' }}>
            <EdCard pad={16} tint="linear-gradient(135deg, rgba(30,192,168,0.08), rgba(30,192,168,0.02))" style={{ border: `1px solid rgba(30,192,168,0.2)` }}>
              <MLabel color={accent}>Up next</MLabel>
              <div style={{ marginTop: 8, fontFamily: SERIF, fontSize: 20, letterSpacing: '-0.02em', color: INK, lineHeight: 1.15 }}>
                {LIVE_STATION.nextUp}
              </div>
              <div style={{ marginTop: 6, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: INK_45, textTransform: 'uppercase' }}>
                Tonight · 6:00 PM
              </div>
            </EdCard>
          </div>
        </>
      ) : (
        // COACH PLAYLIST details
        <>
          <div style={{ padding: '22px 24px 0' }}>
            <EdCard pad={16} style={{ border: `1px solid ${accent}44`, background: `linear-gradient(135deg, ${accent}12, transparent)` }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <AvatarChip init={current.init} color={current.color} size={42} />
                <div style={{ flex: 1 }}>
                  <MLabel color={accent}>{current.sent} · for you</MLabel>
                  <div style={{ marginTop: 6, fontFamily: SERIF, fontSize: 16, fontStyle: 'italic', letterSpacing: '-0.01em', color: INK, lineHeight: 1.35 }}>
                    "Built this for your {current.attached.toLowerCase()}. BPM stays tight where you need it."
                  </div>
                  <div style={{ marginTop: 10, fontFamily: MONO, fontSize: 10, letterSpacing: '0.1em', color: INK_60, textTransform: 'uppercase' }}>
                    — {current.by}
                  </div>
                </div>
              </div>
            </EdCard>
          </div>

          {/* Attached to */}
          <div style={{ padding: '14px 24px 0' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '12px 14px', borderRadius: 12,
              border: `1px solid ${HAIR}`,
            }}>
              <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', color: INK_45, textTransform: 'uppercase' }}>
                Attached to
              </div>
              <div style={{ flex: 1, fontFamily: SANS, fontSize: 14, fontWeight: 500, color: INK, letterSpacing: -0.1 }}>
                {current.attached}
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', color: accent }}>→</div>
            </div>
          </div>
        </>
      )}

      {/* CHANNELS — Live + coach playlists */}
      <SectionHeader eyebrow="Channels" title="From your team" />
      <div style={{ padding: '0 24px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {/* Live channel */}
        <ChannelRow
          active={channel === 'live'}
          accent={LIVE_STATION.color}
          onClick={() => setChannel('live')}
          left={(
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: `linear-gradient(135deg, ${LIVE_STATION.color}, #14806f)`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
                {[10, 16, 8, 14, 6].map((h, i) => <div key={i} style={{ width: 2.5, height: h, background: PAPER, borderRadius: 1 }} />)}
              </div>
            </div>
          )}
          eyebrow={<><span style={{ width: 6, height: 6, borderRadius: 3, background: LIVE_STATION.color, display: 'inline-block', marginRight: 6 }} />LIVE · {LIVE_STATION.listeners.toLocaleString()} ON</>}
          eyebrowColor={LIVE_STATION.color}
          title="Shape Radio"
          meta="One stream · 24/7 · ad-free"
        />

        {/* Coach playlists */}
        {COACH_PLAYLISTS.map((p, i) => (
          <ChannelRow
            key={i}
            active={channel === i}
            accent={p.color}
            onClick={() => setChannel(i)}
            left={<AvatarChip init={p.init} color={p.color} size={44} />}
            eyebrow={`${p.by.toUpperCase()} · ${p.role.toUpperCase()}`}
            eyebrowColor={p.color}
            title={p.name}
            meta={`${p.len} · ${p.bpm} · ${p.tracks} tracks`}
            badge={p.unplayed ? 'NEW' : null}
            sent={p.sent}
          />
        ))}
      </div>

      {/* Info */}
      <div style={{ padding: '22px 24px 0' }}>
        <EdCard pad={14} tint="linear-gradient(145deg, rgba(30,192,168,0.06), rgba(30,192,168,0.01))" style={{ border: `1px solid rgba(30,192,168,0.15)` }}>
          <MLabel color={LIVE_STATION.color}>How Radio works</MLabel>
          <div style={{ marginTop: 8, fontFamily: SANS, fontSize: 13, color: INK_60, letterSpacing: -0.1, lineHeight: 1.5 }}>
            One live stream, curated by Shape residents. Your coach and nutritionist can send you playlists tied to specific workouts or meal preps — those show up here. No ads, ever. Free with your membership.
          </div>
        </EdCard>
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
function ChannelRow({ active, accent, onClick, left, eyebrow, eyebrowColor, title, meta, badge, sent }) {
  return (
    <div onClick={onClick} style={{
      display: 'flex', alignItems: 'center', gap: 14,
      padding: '12px 14px', borderRadius: 14, cursor: 'pointer',
      border: `1px solid ${active ? accent + '66' : HAIR}`,
      background: active ? `linear-gradient(135deg, ${accent}14, transparent)` : 'transparent',
      transition: 'all 0.15s',
    }}>
      {left}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.14em',
          color: eyebrowColor || INK_45, textTransform: 'uppercase',
          display: 'flex', alignItems: 'center',
        }}>
          {eyebrow}
        </div>
        <div style={{
          fontFamily: SERIF, fontSize: 17, letterSpacing: '-0.02em',
          color: INK, marginTop: 4, lineHeight: 1.15,
        }}>{title}</div>
        <div style={{
          fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 4, letterSpacing: '0.06em',
        }}>{meta}</div>
      </div>
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        {badge && (
          <div style={{
            fontFamily: MONO, fontSize: 9, letterSpacing: '0.14em', color: PAPER,
            background: accent, padding: '2px 7px', borderRadius: 8, marginBottom: 4,
          }}>{badge}</div>
        )}
        {sent && (
          <div style={{ fontFamily: MONO, fontSize: 9.5, color: INK_45, letterSpacing: '0.08em' }}>{sent.toUpperCase()}</div>
        )}
        <div style={{ fontFamily: MONO, fontSize: 14, color: active ? accent : INK_45, marginTop: sent ? 6 : 0 }}>
          {active ? '●' : '▶'}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// HomeRadioCard — shared mini-player tile for any Home screen
// Shows current track, live listener count, play/pause toggle.
// accent: TEAL (client), CORAL (trainer), GOLD (nutri)
// ─────────────────────────────────────────────────────────────
function HomeRadioCard({ onRadio, radioOn, setRadioOn, accent = TEAL, track = 'Roots of the Machine', meta = 'MERIT · 132 BPM · 3,472 ON' }) {
  const accentTint = accent === TEAL  ? 'rgba(30,192,168,0.12)' :
                     accent === CORAL ? 'rgba(227,122,90,0.12)'  :
                     accent === GOLD  ? 'rgba(217,178,106,0.14)' :
                                        'rgba(30,192,168,0.12)';
  const accentDark = accent === TEAL  ? '#14806f' :
                     accent === CORAL ? '#a8553c' :
                     accent === GOLD  ? '#a8874a' : '#14806f';
  return (
    <div style={{ padding: '22px 24px 0' }}>
      <div onClick={onRadio} style={{
        borderRadius: 18, padding: '16px 16px 14px', cursor: 'pointer',
        border: `1px solid ${radioOn ? accent + '44' : HAIR}`,
        background: radioOn
          ? `linear-gradient(135deg, ${accentTint}, rgba(0,0,0,0))`
          : 'transparent',
        display: 'flex', alignItems: 'center', gap: 14,
      }}>
        <div style={{
          width: 56, height: 56, borderRadius: 12, flexShrink: 0,
          background: radioOn
            ? `linear-gradient(135deg, ${accent}, ${accentDark})`
            : `linear-gradient(135deg, rgba(242,237,228,0.08), rgba(242,237,228,0.02))`,
          border: radioOn ? 0 : `1px solid ${HAIR}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 20 }}>
            {[0,1,2,3,4].map(i => (
              <div key={i} style={{
                width: 3,
                height: radioOn ? 10 : (i === 2 ? 14 : 8),
                background: radioOn ? PAPER : INK_45,
                borderRadius: 1,
                animation: radioOn ? `hrc-bar-${i} 1.${i+2}s ease-in-out infinite` : 'none',
                opacity: radioOn ? 1 : 0.5,
              }} />
            ))}
          </div>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em',
            color: radioOn ? accent : INK_45,
            textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6,
          }}>
            {radioOn && (
              <span style={{
                width: 6, height: 6, borderRadius: 3, background: accent,
                animation: 'hrc-pulse 1.4s ease-in-out infinite',
              }} />
            )}
            {radioOn ? 'Shape Radio · Live' : 'Shape Radio · Muted'}
          </div>
          <div style={{ fontFamily: SERIF, fontSize: 17, letterSpacing: '-0.02em', color: INK, marginTop: 5, lineHeight: 1.1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {radioOn ? track : 'Tap to start listening'}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 3, letterSpacing: '0.06em' }}>
            {radioOn ? meta : 'AD-FREE · FREE WITH SHAPE'}
          </div>
        </div>

        <button onClick={(e) => { e.stopPropagation(); setRadioOn(!radioOn); }} style={{
          width: 44, height: 44, borderRadius: 22, border: radioOn ? 0 : `1px solid ${HAIR}`, cursor: 'pointer',
          background: radioOn ? accent : 'transparent',
          color: radioOn ? PAPER : INK, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 14, boxShadow: radioOn ? `0 6px 18px ${accent}44` : 'none',
        }}>{radioOn ? '❚❚' : '▶'}</button>
      </div>
      <style>{`
        @keyframes hrc-pulse {0%,100% { opacity: 1; } 50% { opacity: 0.3; }}
        @keyframes hrc-bar-0 {0%,100% { height: 10px; } 50% { height: 20px; }}
        @keyframes hrc-bar-1 {0%,100% { height: 16px; } 50% { height: 6px; }}
        @keyframes hrc-bar-2 {0%,100% { height: 8px; } 50% { height: 18px; }}
        @keyframes hrc-bar-3 {0%,100% { height: 14px; } 50% { height: 5px; }}
        @keyframes hrc-bar-4 {0%,100% { height: 6px; } 50% { height: 16px; }}
      `}</style>
    </div>
  );
}

Object.assign(window, { RadioScreen, RadioPrompt, HomeRadioCard });

// ─────────────────────────────────────────────────────────────
// Post-login: "Want Shape Radio while you're in the app?"
// ─────────────────────────────────────────────────────────────
function RadioPrompt({ onChoose }) {
  const [choice, setChoice] = useStateR(null);

  return (
    <div style={{
      position: 'absolute', inset: 0, zIndex: 80,
      background: PAPER, color: INK,
      display: 'flex', flexDirection: 'column',
      padding: '70px 28px 28px', overflow: 'hidden',
    }}>
      <CurveDecor color={TEAL} opacity={0.16} position="tr" />

      {/* Visual: big animated bars as hero */}
      <div style={{ marginTop: 20, display: 'flex', alignItems: 'flex-end', gap: 4, height: 80, maxWidth: 280 }}>
        {Array.from({ length: 22 }).map((_, i) => {
          const h = 30 + Math.abs(Math.sin(i * 0.5)) * 70;
          return (
            <div key={i} style={{
              flex: 1, height: `${h}%`, background: TEAL, borderRadius: 2,
              animation: `prompt-bar-${i % 4} 1.${(i % 5) + 2}s ease-in-out infinite`,
            }} />
          );
        })}
      </div>
      <style>{`
        @keyframes prompt-bar-0 {0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.4); }}
        @keyframes prompt-bar-1 {0%, 100% { transform: scaleY(0.7); } 50% { transform: scaleY(1); }}
        @keyframes prompt-bar-2 {0%, 100% { transform: scaleY(0.5); } 50% { transform: scaleY(0.9); }}
        @keyframes prompt-bar-3 {0%, 100% { transform: scaleY(1); } 50% { transform: scaleY(0.6); }}
      `}</style>

      <div style={{ marginTop: 32, position: 'relative' }}>
        <MLabel color={TEAL}>
          <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 3, background: TEAL, marginRight: 6, verticalAlign: 'middle' }} />
          Shape Radio · live now
        </MLabel>
        <h1 style={{
          fontFamily: SERIF, fontSize: 46, letterSpacing: '-0.035em', fontWeight: 400,
          lineHeight: 0.95, margin: '14px 0 0', color: INK,
        }}>
          Want music<br/>
          <em style={{ fontStyle: 'italic', fontWeight: 500, color: TEAL }}>while you move?</em>
        </h1>
        <div style={{
          marginTop: 16, fontFamily: SANS, fontSize: 15, color: INK_60,
          letterSpacing: -0.1, lineHeight: 1.5, maxWidth: 330,
        }}>
          Radio will stream in the background — on your workouts, meal preps, or whenever the app is open. Always ad-free. You can pause anytime.
        </div>
      </div>

      {/* Choice cards */}
      <div style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <button onClick={() => setChoice('on')} style={{
          padding: '18px 18px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${choice === 'on' ? TEAL : HAIR}`,
          background: choice === 'on' ? `linear-gradient(135deg, ${TEAL}22, transparent)` : 'transparent',
          color: INK, transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            background: `linear-gradient(135deg, ${TEAL}, #14806f)`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 16 }}>
              {[10, 16, 8, 14, 6].map((h, i) => <div key={i} style={{ width: 2.5, height: h, background: PAPER, borderRadius: 1 }} />)}
            </div>
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1.1 }}>
              Yes, play Radio.
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 4, letterSpacing: '0.06em' }}>
              PLAYS IN APP · AD-FREE · PAUSE ANYTIME
            </div>
          </div>
          <div style={{
            width: 20, height: 20, borderRadius: 10, flexShrink: 0,
            border: `1px solid ${choice === 'on' ? TEAL : HAIR}`,
            background: choice === 'on' ? TEAL : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: PAPER, fontSize: 11,
          }}>{choice === 'on' ? '✓' : ''}</div>
        </button>

        <button onClick={() => setChoice('off')} style={{
          padding: '18px 18px', borderRadius: 16, cursor: 'pointer', textAlign: 'left',
          border: `1px solid ${choice === 'off' ? INK : HAIR}`,
          background: choice === 'off' ? `rgba(242,237,228,0.04)` : 'transparent',
          color: INK, transition: 'all 0.15s',
          display: 'flex', alignItems: 'center', gap: 14,
        }}>
          <div style={{
            width: 42, height: 42, borderRadius: 10, flexShrink: 0,
            border: `1px solid ${HAIR}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 18, color: INK_45,
          }}>⏸</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: INK, lineHeight: 1.1 }}>
              Keep it muted.
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: INK_60, marginTop: 4, letterSpacing: '0.06em' }}>
              START SILENT · TURN ON ANYTIME FROM HOME
            </div>
          </div>
          <div style={{
            width: 20, height: 20, borderRadius: 10, flexShrink: 0,
            border: `1px solid ${choice === 'off' ? INK : HAIR}`,
            background: choice === 'off' ? INK : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: PAPER, fontSize: 11,
          }}>{choice === 'off' ? '✓' : ''}</div>
        </button>

        <button
          disabled={!choice}
          onClick={() => onChoose(choice === 'on')}
          style={{
            marginTop: 10, width: '100%', height: 52, borderRadius: 14, border: 0,
            background: choice ? INK : 'rgba(242,237,228,0.08)',
            color: choice ? PAPER : INK_30,
            fontFamily: SANS, fontSize: 15, fontWeight: 600, letterSpacing: -0.2,
            cursor: choice ? 'pointer' : 'default',
          }}
        >Continue →</button>

        <div style={{ textAlign: 'center', marginTop: 4 }}>
          <MLabel>Change this anytime in settings</MLabel>
        </div>
      </div>
    </div>
  );
}
