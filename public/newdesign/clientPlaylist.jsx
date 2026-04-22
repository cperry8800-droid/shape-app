// Client-side playlist components — for the mobile app.
// Shape-branded mini player, coach-note hero, send-to-friend sheet, connect-music fallback.
// All match the dark warm Fraunces + Grotesk system.

const CP_PAPER = "#1a1612";
const CP_INK = "#f2ede4";
const CP_TEAL = "#1ec0a8";
const CP_TEAL_BRIGHT = "#2ee0c4";
const cpSerif = "'Fraunces', serif";
const cpSans = "'Space Grotesk', sans-serif";
const cpMono = "'JetBrains Mono', monospace";

// ─── Icons ──────────────────────────────────────────────
const PlayIcon = ({ size = 14, color = CP_PAPER }) => (
  <svg width={size} height={size} viewBox="0 0 12 12"><path d="M3 2l7 4-7 4V2z" fill={color} /></svg>
);
const PauseIcon = ({ size = 14, color = CP_PAPER }) => (
  <svg width={size} height={size} viewBox="0 0 12 12"><rect x="3" y="2" width="2" height="8" fill={color}/><rect x="7" y="2" width="2" height="8" fill={color}/></svg>
);
const HeartIcon = ({ size = 18, filled = false }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? CP_TEAL_BRIGHT : "none"} stroke={filled ? CP_TEAL_BRIGHT : "rgba(242,237,228,0.7)"} strokeWidth="2">
    <path d="M12 21s-7-4.5-7-11a4 4 0 017-2.6A4 4 0 0119 10c0 6.5-7 11-7 11z" strokeLinejoin="round"/>
  </svg>
);
const SendIcon = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="rgba(242,237,228,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>
  </svg>
);
const SpotifyMark = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#1DB954"><circle cx="12" cy="12" r="12"/><path d="M17.5 16.5c-.2.3-.6.4-.9.2-2.5-1.5-5.6-1.8-9.3-1-.4.1-.7-.2-.8-.5-.1-.4.2-.7.5-.8 4-.9 7.5-.5 10.2 1.1.4.3.5.7.3 1zm1.5-3c-.3.4-.8.5-1.2.3-2.8-1.7-7.1-2.2-10.4-1.2-.4.1-.9-.1-1-.6-.1-.4.1-.9.6-1 3.8-1.1 8.6-.6 11.8 1.4.4.2.5.7.2 1.1zm.1-3.1c-3.4-2-9-2.2-12.2-1.2-.5.2-1.1-.1-1.3-.7-.2-.5.1-1.1.7-1.3 3.7-1.1 9.8-.9 13.7 1.4.5.3.7 1 .4 1.5-.3.4-.9.6-1.3.3z" fill="#000"/></svg>
);
const AppleMark = ({ size = 12 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24"><defs><linearGradient id="am" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fa233b"/><stop offset="1" stopColor="#fb5c74"/></linearGradient></defs><rect width="24" height="24" rx="5.4" fill="url(#am)"/><path d="M16.5 6.4c.4-.1.5-.1.5.2v9.1c0 1-.4 1.6-1.3 1.9-.9.3-1.8-.2-1.8-1 0-.6.4-1.1 1.1-1.2l.6-.1c.4-.1.5-.2.5-.5V9.4L10 10.7v5.4c0 1-.4 1.6-1.3 1.9-.9.3-1.8-.2-1.8-1 0-.6.4-1.1 1.1-1.2l.7-.2c.3-.1.4-.2.4-.5V8.2c0-.4.1-.6.6-.7l6.8-1.1z" fill="#fff"/></svg>
);

// ─── 1. Inline play button on workout card (compact) ──────
function InlinePlayButton({ playing = false, onClick }) {
  return (
    <button onClick={onClick} style={{
      background: playing ? CP_TEAL : CP_INK, color: CP_PAPER, border: 0,
      width: 36, height: 36, borderRadius: 999, cursor: "pointer",
      display: "flex", alignItems: "center", justifyContent: "center",
      boxShadow: playing ? `0 0 0 4px rgba(46,224,196,0.15)` : "none",
      transition: "all 0.2s"
    }}>
      {playing ? <PauseIcon color={CP_PAPER}/> : <PlayIcon color={CP_PAPER}/>}
    </button>
  );
}

// ─── 2. Workout card with inline playlist strip ───────────
function WorkoutCardWithPlaylist({ workout, playlist, playing, onPlay }) {
  return (
    <div style={{
      background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)",
      borderRadius: 14, overflow: "hidden",
    }}>
      {/* workout top */}
      <div style={{ padding: "16px 16px 12px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div style={{ fontFamily: cpMono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)", marginBottom: 4 }}>{workout.time}</div>
            <div style={{ fontFamily: cpSerif, fontSize: 22, letterSpacing: "-0.015em", color: CP_INK, marginBottom: 2 }}>{workout.title}</div>
            <div style={{ fontSize: 12, color: "rgba(242,237,228,0.6)" }}>{workout.sub}</div>
          </div>
          <div style={{ background: CP_INK, color: CP_PAPER, padding: "7px 14px", borderRadius: 999, fontSize: 11, fontFamily: cpSans, fontWeight: 500, letterSpacing: "0.1em" }}>START</div>
        </div>
      </div>
      {/* playlist strip */}
      <div style={{
        padding: "12px 14px", display: "flex", alignItems: "center", gap: 12,
        borderTop: "1px solid rgba(242,237,228,0.06)",
        background: `linear-gradient(90deg, ${playlist.accent}18 0%, rgba(242,237,228,0.02) 60%)`,
      }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: playlist.cover, flexShrink: 0, position: "relative", overflow: "hidden" }}>
          <div style={{ position: "absolute", bottom: 4, right: 4 }}>
            {playlist.provider === "apple" ? <AppleMark size={10}/> : <SpotifyMark size={10}/>}
          </div>
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: CP_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playlist.name}</div>
          <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)", fontFamily: cpMono, letterSpacing: "0.04em" }}>{playlist.bpm} BPM · {playlist.tracks} tracks · from {playlist.author}</div>
        </div>
        <InlinePlayButton playing={playing} onClick={onPlay} />
      </div>
    </div>
  );
}

// ─── 3. Hero coach-note playlist card ─────────────────────
function HeroPlaylistCard({ playlist, playing, onPlay, onHeart, hearted, onSend }) {
  return (
    <div style={{
      borderRadius: 18, overflow: "hidden",
      background: playlist.cover,
      position: "relative",
    }}>
      <div style={{ padding: "18px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", padding: "5px 10px", borderRadius: 999, fontFamily: cpMono, fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)" }}>
          {playlist.provider === "apple" ? <AppleMark size={10}/> : <SpotifyMark size={10}/>}
          {playlist.provider === "apple" ? "APPLE MUSIC" : "SPOTIFY"}
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={onSend} style={{ background: "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", border: 0, width: 32, height: 32, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <SendIcon size={15}/>
          </button>
          <button onClick={onHeart} style={{ background: hearted ? "rgba(46,224,196,0.2)" : "rgba(0,0,0,0.45)", backdropFilter: "blur(8px)", border: 0, width: 32, height: 32, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <HeartIcon size={15} filled={hearted}/>
          </button>
        </div>
      </div>

      {/* Coach note — HERO */}
      <div style={{ padding: "32px 22px 20px", position: "relative" }}>
        <div style={{ fontFamily: cpSerif, fontSize: 24, lineHeight: 1.25, letterSpacing: "-0.012em", color: "#fff", textWrap: "pretty" }}>
          <span style={{ fontFamily: cpSerif, fontSize: 36, color: playlist.accent, lineHeight: 0, verticalAlign: "-0.1em", marginRight: 2 }}>“</span>
          {playlist.note}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: playlist.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: cpSerif, fontSize: 11, color: CP_PAPER, fontWeight: 500 }}>{playlist.author[0]}</div>
          <div style={{ fontFamily: cpMono, fontSize: 11, letterSpacing: "0.06em", color: "rgba(255,255,255,0.8)" }}>
            {playlist.author.toUpperCase()} · {playlist.authorRole.toUpperCase()}
          </div>
        </div>
      </div>

      {/* bottom sheet — title + play */}
      <div style={{ background: "rgba(0,0,0,0.55)", backdropFilter: "blur(12px)", padding: "16px 18px", display: "flex", alignItems: "center", gap: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: cpSerif, fontSize: 20, color: "#fff", letterSpacing: "-0.01em", marginBottom: 2 }}>{playlist.name}</div>
          <div style={{ fontFamily: cpMono, fontSize: 10.5, color: "rgba(255,255,255,0.65)", letterSpacing: "0.06em" }}>{playlist.bpm} BPM · {playlist.tracks} TRACKS · {playlist.duration}</div>
        </div>
        <button onClick={onPlay} style={{ background: playing ? playlist.accent : "#fff", color: CP_PAPER, border: 0, width: 52, height: 52, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 6px 20px rgba(0,0,0,0.35)" }}>
          {playing ? <PauseIcon size={22}/> : <PlayIcon size={22}/>}
        </button>
      </div>
    </div>
  );
}

// ─── 4. Now-playing mini player (bottom dock) ─────────────
function NowPlayingDock({ playlist, progress = 0.34, onToggle, playing }) {
  return (
    <div style={{
      position: "absolute", left: 12, right: 12, bottom: 12,
      background: "rgba(26,22,18,0.92)", backdropFilter: "blur(18px)",
      border: "1px solid rgba(242,237,228,0.1)", borderRadius: 16,
      padding: "10px 12px", display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 12px 72px rgba(0,0,0,0.4)"
    }}>
      <div style={{ width: 40, height: 40, borderRadius: 8, background: playlist.cover, flexShrink: 0 }}/>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, fontWeight: 500, color: CP_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playlist.currentTrack[1]}</div>
        <div style={{ fontSize: 10.5, color: "rgba(242,237,228,0.6)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playlist.currentTrack[0]} · {playlist.name}</div>
        <div style={{ height: 2, background: "rgba(242,237,228,0.12)", borderRadius: 2, marginTop: 5, overflow: "hidden" }}>
          <div style={{ width: `${progress*100}%`, height: "100%", background: playlist.accent }}/>
        </div>
      </div>
      <button onClick={onToggle} style={{ background: CP_INK, color: CP_PAPER, border: 0, width: 34, height: 34, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>
        {playing ? <PauseIcon/> : <PlayIcon/>}
      </button>
    </div>
  );
}

// ─── 5. Send-to-friend sheet ──────────────────────────────
function SendToSheet({ open, playlist, onClose }) {
  const [sent, setSent] = React.useState({});
  const friends = [
    { id: "f1", name: "Jordan K.",  sub: "Trains w/ Maya",       tag: "friend" },
    { id: "f2", name: "Sam R.",     sub: "Lifting buddy · 2w streak", tag: "friend" },
    { id: "f3", name: "Mel T.",     sub: "Ran 10k together Sat", tag: "friend" },
    { id: "f4", name: "Maya Okafor", sub: "Your trainer",        tag: "coach" },
    { id: "f5", name: "Rae Lindqvist", sub: "Your nutritionist", tag: "coach" },
    { id: "f6", name: "Lower Body Crew", sub: "Community · 42 members", tag: "group" },
  ];
  return (
    <div style={{
      position: "absolute", inset: 0, zIndex: 200,
      pointerEvents: open ? "auto" : "none",
    }}>
      <div onClick={onClose} style={{
        position: "absolute", inset: 0,
        background: "rgba(0,0,0,0.5)",
        opacity: open ? 1 : 0, transition: "opacity 0.25s",
      }}/>
      <div style={{
        position: "absolute", left: 0, right: 0, bottom: 0,
        background: "#241d17", borderRadius: "22px 22px 0 0",
        transform: open ? "translateY(0)" : "translateY(100%)",
        transition: "transform 0.3s cubic-bezier(0.32,0.72,0.3,1)",
        paddingBottom: 40,
      }}>
        <div style={{ width: 36, height: 4, background: "rgba(242,237,228,0.2)", borderRadius: 4, margin: "10px auto 8px" }}/>
        <div style={{ padding: "8px 20px 18px", borderBottom: "1px solid rgba(242,237,228,0.06)" }}>
          <div style={{ fontFamily: cpMono, fontSize: 10, letterSpacing: "0.14em", color: CP_TEAL_BRIGHT, marginBottom: 6 }}>SEND PLAYLIST</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <div style={{ width: 42, height: 42, borderRadius: 8, background: playlist.cover, flexShrink: 0 }}/>
            <div>
              <div style={{ fontFamily: cpSerif, fontSize: 18, color: CP_INK, letterSpacing: "-0.01em" }}>{playlist.name}</div>
              <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", fontFamily: cpMono }}>{playlist.bpm} BPM · {playlist.tracks} tracks</div>
            </div>
          </div>
        </div>

        <div style={{ padding: "10px 16px 4px", fontFamily: cpMono, fontSize: 10, letterSpacing: "0.12em", color: "rgba(242,237,228,0.5)" }}>RECENT</div>
        <div style={{ maxHeight: 280, overflowY: "auto" }}>
          {friends.map(f => {
            const isSent = sent[f.id];
            return (
              <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 20px", borderBottom: "1px solid rgba(242,237,228,0.04)" }}>
                <div style={{ width: 38, height: 38, borderRadius: 999, background: f.tag === "coach" ? "rgba(46,224,196,0.2)" : f.tag === "group" ? "rgba(242,237,228,0.1)" : `hsl(${f.id.charCodeAt(1)*40},40%,35%)`, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: cpSerif, fontSize: 15, color: CP_INK }}>
                  {f.tag === "group" ? "◇" : f.name[0]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, color: CP_INK, fontWeight: 500 }}>{f.name}</div>
                  <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)" }}>{f.sub}</div>
                </div>
                <button onClick={() => setSent(s => ({ ...s, [f.id]: !s[f.id] }))} style={{
                  background: isSent ? CP_TEAL : "transparent",
                  color: isSent ? CP_PAPER : CP_INK,
                  border: `1px solid ${isSent ? CP_TEAL : "rgba(242,237,228,0.2)"}`,
                  padding: "6px 14px", borderRadius: 999, fontSize: 11.5, fontFamily: cpSans, fontWeight: 500, cursor: "pointer", minWidth: 64,
                }}>{isSent ? "Sent ✓" : "Send"}</button>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "12px 16px 0" }}>
          <textarea placeholder="Add a note… e.g. 'this got me through hill week'" style={{
            width: "100%", background: "rgba(242,237,228,0.05)", border: "1px solid rgba(242,237,228,0.1)",
            borderRadius: 10, padding: "10px 12px", color: CP_INK, fontFamily: cpSans, fontSize: 13, resize: "none", outline: "none",
            minHeight: 52,
          }}/>
        </div>
      </div>
    </div>
  );
}

// ─── 6. Connect-music fallback ────────────────────────────
function ConnectMusicCard({ playlist }) {
  return (
    <div style={{ background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 14, padding: 18 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 14 }}>
        <div style={{ width: 48, height: 48, borderRadius: 8, background: playlist.cover, flexShrink: 0, position: "relative" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.45)", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontFamily: cpSerif, fontSize: 18, color: CP_INK, letterSpacing: "-0.01em" }}>{playlist.name}</div>
          <div style={{ fontSize: 11.5, color: "rgba(242,237,228,0.55)", fontFamily: cpMono }}>Maya · {playlist.tracks} tracks</div>
        </div>
      </div>
      <div style={{ fontSize: 13, color: "rgba(242,237,228,0.75)", lineHeight: 1.5, marginBottom: 14 }}>
        Connect Spotify to play along, or scroll the tracklist below.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button style={{ flex: 1, background: "#1DB954", color: "#fff", border: 0, padding: "11px 14px", borderRadius: 999, fontFamily: cpSans, fontSize: 13, fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <SpotifyMark size={14}/> Connect Spotify
        </button>
        <button style={{ background: "transparent", color: CP_INK, border: "1px solid rgba(242,237,228,0.2)", padding: "11px 14px", borderRadius: 999, fontFamily: cpSans, fontSize: 13, cursor: "pointer" }}>Skip</button>
      </div>
    </div>
  );
}

// ─── Track list ───────────────────────────────────────────
function TrackList({ tracks, accent = CP_TEAL_BRIGHT, currentIndex = -1 }) {
  return (
    <div>
      {tracks.map(([artist, title, dur], i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 2px", borderBottom: i === tracks.length - 1 ? "none" : "1px solid rgba(242,237,228,0.05)" }}>
          <div style={{ fontFamily: cpMono, fontSize: 11, color: i === currentIndex ? accent : "rgba(242,237,228,0.4)", width: 18 }}>{i === currentIndex ? "▶" : (i+1).toString().padStart(2,"0")}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: i === currentIndex ? 500 : 400, color: i === currentIndex ? accent : CP_INK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
            <div style={{ fontSize: 11, color: "rgba(242,237,228,0.55)" }}>{artist}</div>
          </div>
          <div style={{ fontFamily: cpMono, fontSize: 10.5, color: "rgba(242,237,228,0.5)" }}>{dur}</div>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, {
  CP_PAPER, CP_INK, CP_TEAL, CP_TEAL_BRIGHT, cpSerif, cpSans, cpMono,
  PlayIcon, PauseIcon, HeartIcon, SendIcon, SpotifyMark, AppleMark,
  InlinePlayButton, WorkoutCardWithPlaylist, HeroPlaylistCard, NowPlayingDock, SendToSheet, ConnectMusicCard, TrackList,
});
