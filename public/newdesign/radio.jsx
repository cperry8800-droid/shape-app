// Shape Radio â€” music built for training
const RADIO_BG = "Firefly_gpt-image_can%20you%20add%20the%20shape%20triangle%20logos%20where%20the%20current%20triangle%20design%20is%209958.png?v=1";

const STATIONS = [
  { name: "Shape Radio Station", bpm: 132, listeners: 1284, tag: "Lifts Â· power Â· grit", color: TEAL, live: true },
  { name: "Tempo Run", bpm: 172, listeners: 842, tag: "Steady state Â· zone 3", color: "#e89b4a" },
  { name: "Intervals", bpm: 168, listeners: 624, tag: "HIIT Â· 30/30 Â· 40/20", color: "#c978d8" },
  { name: "Long Ride", bpm: 120, listeners: 418, tag: "Endurance Â· 90â€“180 min", color: "#7aaae8" },
  { name: "Cooldown", bpm: 90, listeners: 302, tag: "Zone 2 Â· mobility Â· stretch", color: "#a3c98c" },
  { name: "Lift Heavy, Again", bpm: 140, listeners: 1102, tag: "Powerlifting Â· meets", color: "#d86a6a" },
];

const SHOWS = [
  { name: "Lift Series vol. 04", dj: "Shape Radio", len: "1h 12m", style: "Heavy bass Â· 130â€“140 bpm", featured: true },
  { name: "Long Run Radio", dj: "Nilo Ceza", len: "2h 00m", style: "Afro-house Â· 168â€“172 bpm" },
  { name: "Cut the Weight", dj: "Merit & Sable", len: "48m", style: "Grime-adjacent Â· 160 bpm" },
  { name: "Mobility Hour", dj: "Linnea Aho", len: "60m", style: "Ambient Â· 80â€“90 bpm" },
  { name: "Interval Room", dj: "Tariq Osei", len: "35m", style: "House cuts Â· 128 bpm" },
  { name: "Deload Sunday", dj: "Shape Residents", len: "1h 30m", style: "Indie + breaks Â· 100 bpm" },
];

function RadioHero() {
  const bars = Array.from({ length: 48 }, () => Math.random());
  const [hearted, setHearted] = React.useState(false);
  return (
    <section style={{ padding: "100px 72px 80px", position: "relative", overflow: "hidden", minHeight: "calc(100vh - 109px)", boxSizing: "border-box", display: "flex", alignItems: "center", background: "transparent" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <h1 style={{ fontFamily: serif, fontSize: 140, letterSpacing: "-0.04em", fontWeight: 400, margin: 0, lineHeight: 0.88 }}>
            Music<br/>built for<br/><em style={{ fontStyle: "italic", color: TEAL }}>training.</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(242,237,228,0.7)", margin: "28px 0 0", maxWidth: 520, lineHeight: 1.5 }}>Ad-free workout mixes, curated stations by BPM, live DJ sets from residents who lift. Plus: your coach can attach a Spotify or Apple Music playlist to any workout or meal â€” it plays on the card, in your kitchen, or on the treadmill. Send good ones to friends. Included with every Shape membership.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 36 }}>
            <a href="/radio.html" style={{ background: TEAL, color: PAPER, border: 0, padding: "16px 28px", borderRadius: 6, fontWeight: 500, fontSize: 14.5, fontFamily: sans, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>â–¶ Play Shape Radio Station</a>
            <a href="#stations" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "16px 28px", borderRadius: 6, fontWeight: 500, fontSize: 14.5, fontFamily: sans, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>Browse stations</a>
          </div>
        </div>

        {/* Now playing card */}
        <div style={{ padding: 32, background: "rgba(26,22,18,0.68)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(242,237,228,0.16)", borderRadius: 4 }}>
          <img src="/shape-radio-wordmark.svg?v=2" alt="Shape Radio" style={{ height: 44, width: "auto", display: "block", marginBottom: 20 }} />
          <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", color: TEAL_BRIGHT, textTransform: "uppercase" }}>â—‰ Live Â· 1,284 listening</div>
          <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.02em", marginTop: 14, lineHeight: 1 }}>I Remember Â· 128 BPM</div>
          <div style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.7)", marginTop: 8 }}>deadmau5 â€” For Lack of a Better Name</div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, height: 56, marginTop: 28 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${20 + h*80}%`, background: i < 32 ? TEAL_BRIGHT : "rgba(242,237,228,0.2)", borderRadius: 1, transition: "height .2s" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
            <span>28:14</span><span>48:30</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <a href="/radio.html" style={{ flex: 1, background: TEAL, color: PAPER, border: 0, padding: "12px 0", borderRadius: 6, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer", textAlign: "center", textDecoration: "none" }}>â–¶ Play</a>
            <button onClick={() => setHearted(h => !h)} aria-label={hearted ? "Unfavorite" : "Favorite"} style={{ background: hearted ? "rgba(46,224,196,0.18)" : "transparent", color: hearted ? TEAL_BRIGHT : INK, border: `1px solid ${hearted ? TEAL : "rgba(242,237,228,0.25)"}`, padding: "12px 18px", borderRadius: 6, fontFamily: sans, fontSize: 13, cursor: "pointer", transition: "all 0.2s" }}>{hearted ? "â™¥" : "â™¡"}</button>
            <a href="#stations" aria-label="Browse stations" style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "12px 18px", borderRadius: 6, fontFamily: sans, fontSize: 13, cursor: "pointer", textDecoration: "none", display: "inline-flex", alignItems: "center" }}>â‡…</a>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </section>
  );
}

function RadioStations() {
  return (
    <section id="stations" style={{ padding: "60px 72px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Stations Â· by BPM</div>
        <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 48px", lineHeight: 0.95 }}>Pick the <em style={{ fontStyle: "italic", color: TEAL }}>pace</em>. We'll pick the <em style={{ fontStyle: "italic", color: TEAL }}>music</em>.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {STATIONS.map((s, i) => (
            <div key={i} style={{ position: "relative", padding: 28, background: "rgba(26,22,18,0.48)", border: "1px solid rgba(242,237,228,0.14)", borderRadius: 10, overflow: "hidden", backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: s.color }}>{s.live ? "â—‰ LIVE" : "ON DEMAND"}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)" }}>{s.listeners.toLocaleString()} listening</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.025em", fontWeight: 400, lineHeight: 1 }}>{s.name}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, color: s.color, marginTop: 10, letterSpacing: "-0.01em" }}>{s.bpm}<span style={{ fontSize: 13, opacity: 0.7 }}> BPM</span></div>
              <div style={{ fontSize: 13, color: "rgba(242,237,228,0.65)", marginTop: 14, lineHeight: 1.5 }}>{s.tag}</div>
              <button style={{ marginTop: 20, padding: "10px 18px", borderRadius: 6, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>â–¶ Tune in</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RadioShows() {
  return (
    <section style={{ padding: "100px 72px", background: "transparent", color: INK }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Shows & residents</div>
        <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 48px", lineHeight: 0.95 }}>Residents <em style={{ fontStyle: "italic", color: TEAL }}>who train</em>. Sets <em style={{ fontStyle: "italic", color: TEAL }}>that land</em>.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 20 }}>
          {SHOWS.slice(0, 3).map((s, i) => (
            <div key={i} style={{ gridColumn: i === 0 ? "span 1" : "auto", display: "grid", gridTemplateRows: "auto 1fr", gap: 16 }}>
              <Ph label={`${s.dj} Â· cover`} ratio={i === 0 ? "16/10" : "4/3"} tone="light" />
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(26,22,18,0.5)" }}>{s.featured ? "FEATURED Â· " : ""}{s.len}</div>
                <div style={{ fontFamily: serif, fontSize: i === 0 ? 38 : 28, letterSpacing: "-0.02em", marginTop: 8, lineHeight: 1 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: "rgba(26,22,18,0.6)", marginTop: 6 }}>{s.dj} Â· {s.style}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginTop: 32 }}>
          {SHOWS.slice(3).map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 14, alignItems: "center", padding: "16px 0", borderTop: "1px solid rgba(26,22,18,0.1)" }}>
              <Ph label="cover" ratio="1/1" tone="light" style={{ width: 72, flex: "0 0 72px" }} />
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(26,22,18,0.5)" }}>{s.len}</div>
                <div style={{ fontFamily: serif, fontSize: 20, letterSpacing: "-0.015em", marginTop: 4 }}>{s.name}</div>
                <div style={{ fontSize: 12, color: "rgba(26,22,18,0.6)", marginTop: 2 }}>{s.dj}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RadioPitch() {
  return (
    <section style={{ padding: "120px 72px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80 }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Why it's different</div>
          <h2 style={{ fontFamily: serif, fontSize: 64, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>No ads.<br/>No filler.<br/><em style={{ fontStyle: "italic", color: TEAL }}>No chatter.</em></h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {[
            ["Mixed for movement", "Every track is vetted for tempo consistency. No slow-down bridges that break a set. No key jumps during intervals."],
            ["Synced to your program", "Radio reads your workout and keeps the Shape Radio Station ready when you're squatting, running, or on the treadmill. You just press play."],
            ["Offline-ready", "Download any station or show for outdoor runs, lifts in garage gyms, flights, or anywhere reception dies. Up to 20 hours at a time."],
            ["Ad-free, always", "Your membership covers it. No skips between tracks, no host shouting about mattresses, no pre-rolls. Just the music you came for."],
          ].map(([t, b], i) => (
            <div key={i} style={{ borderTop: "1px solid rgba(242,237,228,0.12)", paddingTop: 20 }}>
              <div style={{ fontFamily: serif, fontSize: 24, letterSpacing: "-0.015em", marginBottom: 8 }}>{t}</div>
              <div style={{ fontFamily: sans, fontSize: 14, color: "rgba(242,237,228,0.7)", lineHeight: 1.55 }}>{b}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RadioCoachPlaylists() {
  const examples = [
    { from: "Maya Okafor", role: "Trainer", ctx: "UPPER PULL Â· TODAY", title: "Upper Pull â€” Peak", meta: "95â€“130 BPM Â· 31 tracks Â· 1h 48m", note: "Builds across the session. Peaks at your top sets â€” don't pussyfoot that row.", accent: "#6a8cff", cover: "linear-gradient(135deg, #2a3a6a 0%, #1a1612 70%)", provider: "Spotify" },
    { from: "Rae Lindqvist", role: "Nutritionist", ctx: "SUNDAY PREP Â· 2 PM", title: "Sunday Meal Prep", meta: "95â€“120 BPM Â· 32 tracks Â· 2h 18m", note: "2 hours. Enough to batch-cook without burning out â€” ends right as you're plating.", accent: "#f2a94e", cover: "linear-gradient(135deg, #6a4a1c 0%, #1a1612 70%)", provider: "Spotify" },
    { from: "Diego Alvarez", role: "Run coach", ctx: "LONG RUN Â· SATURDAY", title: "90-Minute Zone 2", meta: "168â€“172 BPM Â· 22 tracks Â· 1h 32m", note: "Locked cadence. Don't let the tempo drop after the 45-min mark â€” this'll carry you.", accent: "#78d8a4", cover: "linear-gradient(135deg, #1f4a34 0%, #1a1612 70%)", provider: "Apple Music" },
  ];
  return (
    <section style={{ padding: "120px 72px", background: "transparent" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 56 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>New Â· Coach playlists</div>
            <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>Your coach<br/>picks the <em style={{ fontStyle: "italic", color: TEAL }}>soundtrack</em>.</h2>
          </div>
          <div>
            <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", lineHeight: 1.6, margin: 0 }}>Trainers and nutritionists can attach a Spotify or Apple Music playlist to any workout, meal, or prep session â€” with a note on why they picked it. Plays right on the card. Heart the good ones. Pass them to friends. One tap, no app switching.</p>
            <div style={{ display: "flex", gap: 24, marginTop: 24, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.08em", color: "rgba(242,237,228,0.55)" }}>
              <div><span style={{ color: "#1DB954" }}>â—</span> SPOTIFY</div>
              <div><span style={{ color: "#fa233b" }}>â—</span> APPLE MUSIC</div>
              <div><span style={{ color: TEAL_BRIGHT }}>â—</span> SHAPE RADIO FALLBACK</div>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 20 }}>
          {examples.map((e, i) => (
            <div key={i} style={{ position: "relative", borderRadius: 12, overflow: "hidden", background: e.cover, minHeight: 440, display: "flex", flexDirection: "column" }}>
              <div style={{ padding: "20px 20px 0", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.4)", backdropFilter: "blur(8px)", padding: "5px 11px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)" }}>
                  <span style={{ width: 6, height: 6, borderRadius: 999, background: e.provider === "Apple Music" ? "#fa233b" : "#1DB954" }}/> {e.provider.toUpperCase()}
                </div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(255,255,255,0.7)" }}>{e.ctx}</div>
              </div>

              <div style={{ padding: "40px 24px 24px", flex: 1, display: "flex", flexDirection: "column", justifyContent: "space-between" }}>
                <div style={{ fontFamily: serif, fontSize: 22, lineHeight: 1.3, letterSpacing: "-0.01em", color: "#fff", textWrap: "pretty" }}>
                  <span style={{ fontFamily: serif, fontSize: 34, color: e.accent, lineHeight: 0, verticalAlign: "-0.12em", marginRight: 2 }}>â€œ</span>
                  {e.note}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 20 }}>
                  <div style={{ width: 26, height: 26, borderRadius: 999, background: e.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: serif, fontSize: 13, color: PAPER, fontWeight: 500 }}>{e.from[0]}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.06em", color: "rgba(255,255,255,0.85)" }}>{e.from.toUpperCase()} Â· {e.role.toUpperCase()}</div>
                </div>
              </div>

              <div style={{ background: "rgba(0,0,0,0.15)", backdropFilter: "blur(10px)", padding: "16px 20px", borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", alignItems: "center", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: serif, fontSize: 18, color: "#fff", letterSpacing: "-0.01em", marginBottom: 2 }}>{e.title}</div>
                  <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(255,255,255,0.65)", letterSpacing: "0.06em" }}>{e.meta}</div>
                </div>
                <button style={{ background: "#fff", color: PAPER, border: 0, width: 44, height: 44, borderRadius: 999, cursor: "pointer", fontSize: 14, fontWeight: 600, boxShadow: "0 4px 16px rgba(0,0,0,0.35)" }}>â–¶</button>
              </div>
            </div>
          ))}
        </div>

        {/* sub-row â€” send to a friend */}
        <div style={{ marginTop: 32, padding: "28px 32px", background: "rgba(30,192,168,0.06)", border: "1px solid rgba(30,192,168,0.2)", borderRadius: 12, display: "grid", gridTemplateColumns: "1fr auto", gap: 40, alignItems: "center" }}>
          <div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_BRIGHT, marginBottom: 8 }}>AND Â· SOCIAL LOOP</div>
            <div style={{ fontFamily: serif, fontSize: 28, letterSpacing: "-0.018em", lineHeight: 1.15 }}>Good playlists travel. Pass them to lifting partners, running buddies, or community groups â€” Shape tracks the chain back to the coach.</div>
          </div>
          <button style={{ background: TEAL, color: PAPER, border: 0, padding: "14px 26px", borderRadius: 999, fontFamily: sans, fontSize: 13.5, fontWeight: 500, cursor: "pointer", whiteSpace: "nowrap" }}>See the client view</button>
        </div>
      </div>
    </section>
  );
}

function RadioInClientApp() {
  // Cream iOS app palette â€” matches the new Shape Radio / TRAIN / EAT
  // reference screens. Kept local so it doesn't collide with the dark
  // PAPER/INK constants used elsewhere in this file.
  const PAPER_LIGHT = "#efe5cd";
  const INK_DARK = "#0a0d0c";
  const TEAL_ACCENT = "#0aa090";
  const HAIRLINE = "rgba(10,13,12,0.08)";
  const HAIRLINE_2 = "rgba(10,13,12,0.06)";

  // Bottom tab bar â€” same pattern as the reference Radio screens
  // (01 HOME / 02 TRAIN / 03 EAT / 04 CHAT / 05 STORE / 06 ME).
  const TabBar = ({ active }) => (
    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 56, padding: "8px 6px 12px", background: "rgba(239,229,205,0.95)", backdropFilter: "blur(10px)", WebkitBackdropFilter: "blur(10px)", borderTop: `1px solid ${HAIRLINE_2}`, display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 2 }}>
      {[["01","HOME"],["02","TRAIN"],["03","EAT"],["04","CHAT"],["05","STORE"],["06","ME"]].map(([n, l]) => (
        <div key={l} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 2, borderRadius: 6, background: active === l ? INK_DARK : "transparent", color: active === l ? PAPER_LIGHT : INK_DARK, padding: "4px 0" }}>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 9, opacity: active === l ? 1 : 0.55 }}>{n}</span>
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 8, letterSpacing: "0.08em" }}>{l}</span>
        </div>
      ))}
    </div>
  );

  // Inline workout card with playlist strip â€” light theme.
  const WorkoutCard = ({ time, title, sub, playlist }) => (
    <div style={{ background: "rgba(10,13,12,0.04)", border: `1px solid ${HAIRLINE}`, borderRadius: 14, overflow: "hidden", color: INK_DARK }}>
      <div style={{ padding: "16px 16px 12px", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: "rgba(10,13,12,0.5)", marginBottom: 4 }}>{time}</div>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, letterSpacing: "-0.015em", marginBottom: 2, fontWeight: 500 }}>{title}</div>
          <div style={{ fontSize: 12, color: "rgba(10,13,12,0.6)" }}>{sub}</div>
        </div>
        <div style={{ background: INK_DARK, color: PAPER_LIGHT, padding: "7px 14px", borderRadius: 999, fontSize: 11, fontFamily: "'Space Grotesk', sans-serif", fontWeight: 500, letterSpacing: "0.1em" }}>START</div>
      </div>
      <div style={{ padding: "12px 14px", display: "flex", alignItems: "center", gap: 12, borderTop: `1px solid ${HAIRLINE_2}`, background: `linear-gradient(90deg, ${playlist.accent}1a 0%, rgba(10,13,12,0.02) 60%)` }}>
        <div style={{ width: 44, height: 44, borderRadius: 8, background: playlist.cover, flexShrink: 0 }}/>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{playlist.name}</div>
          <div style={{ fontSize: 11, color: "rgba(10,13,12,0.55)", fontFamily: "'JetBrains Mono', monospace", letterSpacing: "0.04em" }}>{playlist.bpm} BPM Â· {playlist.tracks} tracks Â· from {playlist.author}</div>
        </div>
        <button style={{ background: INK_DARK, color: PAPER_LIGHT, border: 0, width: 36, height: 36, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12 }}>â–¶</button>
      </div>
    </div>
  );

  // Hero playlist card â€” quote on a colored gradient cover sits in a
  // cream-paper container so it matches the rest of the iOS design.
  const HeroCard = ({ playlist }) => (
    <div style={{ borderRadius: 18, overflow: "hidden", border: `1px solid ${HAIRLINE_2}` }}>
      <div style={{ background: playlist.cover, padding: "18px 18px 0", display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(0,0,0,0.45)", padding: "5px 10px", borderRadius: 999, fontFamily: "'JetBrains Mono', monospace", fontSize: 9.5, letterSpacing: "0.1em", color: "rgba(255,255,255,0.9)" }}>
          <span style={{ width: 8, height: 8, borderRadius: 999, background: "#1DB954", display: "inline-block" }}/>
          SPOTIFY
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ background: "rgba(0,0,0,0.45)", border: 0, width: 32, height: 32, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12 }}>â†—</div>
          <div style={{ background: playlist.hearted ? "rgba(46,224,196,0.25)" : "rgba(0,0,0,0.45)", border: 0, width: 32, height: 32, borderRadius: 999, display: "flex", alignItems: "center", justifyContent: "center", color: playlist.hearted ? "#2ee0c4" : "#fff", fontSize: 14 }}>â™¥</div>
        </div>
      </div>
      <div style={{ background: playlist.cover, padding: "32px 22px 20px" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 22, lineHeight: 1.25, letterSpacing: "-0.012em", color: "#fff", textWrap: "pretty" }}>
          <span style={{ fontFamily: "'Fraunces', serif", fontSize: 36, color: playlist.accent, lineHeight: 0, verticalAlign: "-0.1em", marginRight: 2 }}>"</span>
          {playlist.note}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 14 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: playlist.accent, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Fraunces', serif", fontSize: 11, color: INK_DARK, fontWeight: 500 }}>{playlist.author[0]}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, letterSpacing: "0.06em", color: "rgba(255,255,255,0.85)" }}>
            {playlist.author.toUpperCase()} Â· {playlist.authorRole.toUpperCase()}
          </div>
        </div>
      </div>
      <div style={{ background: "rgba(10,13,12,0.04)", padding: "14px 18px", display: "flex", alignItems: "center", gap: 14, borderTop: `1px solid ${HAIRLINE_2}` }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: "'Fraunces', serif", fontSize: 18, color: INK_DARK, letterSpacing: "-0.01em", fontWeight: 500 }}>{playlist.name}</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(10,13,12,0.55)", letterSpacing: "0.06em" }}>{playlist.bpm} BPM Â· {playlist.tracks} TRACKS Â· {playlist.duration}</div>
        </div>
        <button style={{ background: INK_DARK, color: PAPER_LIGHT, border: 0, width: 44, height: 44, borderRadius: 999, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14 }}>â–¶</button>
      </div>
    </div>
  );

  const TrackRow = ({ tracks, accent }) => (
    <div>
      {tracks.map(([artist, title, len], i) => (
        <div key={i} style={{ display: "grid", gridTemplateColumns: "20px 1fr auto", gap: 10, alignItems: "center", padding: "10px 0", borderTop: i === 0 ? "none" : `1px solid ${HAIRLINE_2}` }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, color: "rgba(10,13,12,0.4)" }}>{String(i + 1).padStart(2, "0")}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: INK_DARK, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
            <div style={{ fontSize: 11, color: "rgba(10,13,12,0.55)" }}>{artist}</div>
          </div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10.5, color: "rgba(10,13,12,0.5)" }}>{len}</div>
        </div>
      ))}
    </div>
  );

  const Eyebrow = ({ children }) => (
    <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: TEAL_ACCENT, marginTop: 14, marginBottom: 10 }}>{children}</div>
  );

  const phones = [
    { label: "A Â· INLINE", subtitle: "Play button on the workout card. Lowest friction â€” no new surface.", render: () => (
      <div style={{ background: PAPER_LIGHT, minHeight: "100%", padding: "8px 14px 70px", color: INK_DARK, fontFamily: "'Space Grotesk', sans-serif", position: "relative" }}>
        <Eyebrow>TODAY</Eyebrow>
        <div style={{ fontFamily: "'Fraunces', serif", fontSize: 32, letterSpacing: "-0.02em", lineHeight: 1.05, marginBottom: 18, fontWeight: 500 }}>Pull day.</div>
        <WorkoutCard
          time="9:00 AM Â· TODAY"
          title="Upper Body Pull"
          sub="45 min Â· 6 exercises Â· from Maya"
          playlist={{ name: "Upper Pull â€” Peak", bpm: "95â€“130", tracks: 31, accent: "#6a8cff", cover: "linear-gradient(135deg, #2a3a6a 0%, #1a1612 70%)", author: "Maya" }}
        />
        <div style={{ marginTop: 14 }}>
          <WorkoutCard
            time="TOMORROW Â· 9 AM"
            title="Lower strength"
            sub="52 min Â· from Maya"
            playlist={{ name: "Squat Day Bangers", bpm: "110â€“140", tracks: 22, accent: "#e86bd8", cover: "linear-gradient(135deg, #5a2a4a 0%, #1a1612 70%)", author: "Maya" }}
          />
        </div>
        <TabBar active="HOME" />
      </div>
    )},
    { label: "B Â· COACH-NOTE HERO", subtitle: "Tap the card â†’ dedicated view. The coach's note is the hero.", render: () => (
      <div style={{ background: PAPER_LIGHT, minHeight: "100%", padding: "8px 14px 70px", color: INK_DARK, fontFamily: "'Space Grotesk', sans-serif", position: "relative" }}>
        <Eyebrow>FOR TODAY'S WORKOUT</Eyebrow>
        <HeroCard
          playlist={{ name: "Upper Pull â€” Peak", bpm: "95â€“130", tracks: 31, duration: "1h 48m", accent: "#6a8cff", cover: "linear-gradient(135deg, #2a3a6a 0%, #1a1612 70%)", note: "Builds across the session. Peaks at your top sets â€” don't pussyfoot that row.", author: "Maya", authorRole: "Trainer", hearted: true }}
        />
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(10,13,12,0.5)", margin: "20px 0 10px" }}>TRACKLIST</div>
        <TrackRow tracks={[["Floating Points","Last Bloom","4:26"],["Bonobo","Bambro Koyo Ganda","4:50"],["Fred again..","Delilah (pull me out of this)","4:12"]]} accent="#6a8cff"/>
        <TabBar active="TRAIN" />
      </div>
    )},
    { label: "C Â· MEAL PREP", subtitle: "Same pattern on the Nutri side. Rae attaches a cook-along mix.", render: () => (
      <div style={{ background: PAPER_LIGHT, minHeight: "100%", padding: "8px 14px 70px", color: INK_DARK, fontFamily: "'Space Grotesk', sans-serif", position: "relative" }}>
        <Eyebrow>FOR SUNDAY PREP</Eyebrow>
        <HeroCard
          playlist={{ name: "Sunday Meal Prep", bpm: "95â€“120", tracks: 32, duration: "2h 18m", accent: "#f2a94e", cover: "linear-gradient(135deg, #6a4a1c 0%, #1a1612 70%)", note: "2 hours. Enough to batch-cook without burning out â€” ends right as you're plating.", author: "Rae", authorRole: "Nutritionist", hearted: false }}
        />
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.14em", color: "rgba(10,13,12,0.5)", margin: "20px 0 10px" }}>TRACKLIST</div>
        <TrackRow tracks={[["Khruangbin","Maria TambiÃ©n","4:58"],["Mild High Club","Homage","3:40"],["Unknown Mortal Orchestra","Multi-Love","4:26"]]} accent="#f2a94e"/>
        <TabBar active="EAT" />
      </div>
    )},
  ];
  return (
    <section style={{ padding: "120px 72px 80px", background: "transparent" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "end", marginBottom: 64 }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>In the client app</div>
            <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>Where <em style={{ fontStyle: "italic", color: TEAL }}>the music</em><br/>meets the work.</h2>
          </div>
          <p style={{ fontFamily: sans, fontSize: 16, color: "rgba(242,237,228,0.7)", lineHeight: 1.6, margin: 0 }}>Coaches drop playlists straight onto workout and meal cards. Clients play them in-context, heart the good ones, and pass them to friends. No app switching. No ads.</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 40, justifyItems: "center" }}>
          {phones.map((p, i) => (
            <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 16, maxWidth: 360 }}>
              <div style={{ textAlign: "center" }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.16em", color: TEAL_BRIGHT, marginBottom: 6 }}>{p.label}</div>
                <div style={{ fontSize: 13, color: "rgba(242,237,228,0.65)", lineHeight: 1.5, textWrap: "pretty" }}>{p.subtitle}</div>
              </div>
              <IOSDevice dark={false} width={340} height={700}>{p.render()}</IOSDevice>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RadioPage() {
  return (
    <div className="radio-page" style={{ background: "#050707", color: INK, minHeight: "100vh", position: "relative", isolation: "isolate" }}>
      <img aria-hidden src={RADIO_BG} style={{ position: "fixed", inset: 0, width: "100vw", height: "100vh", objectFit: "cover", objectPosition: "center center", pointerEvents: "none", zIndex: 0 }} />
      <div style={{ position: "relative", zIndex: 1 }}>
        <Header active="Radio" />
        <RadioHero />
        <RadioCoachPlaylists />
        <RadioInClientApp />
        <RadioPitch />
        <Footer />
      </div>
      <style>{`
        .radio-page footer,
        .radio-page footer * {
          background: transparent !important;
          color: rgba(242,237,228,0.82) !important;
          border-color: rgba(242,237,228,0.16) !important;
        }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RadioPage />);
