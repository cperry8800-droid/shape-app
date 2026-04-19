// Shape Radio — music built for training
const STATIONS = [
  { name: "Heavy Day", bpm: 132, listeners: 1284, tag: "Lifts · power · grit", color: TEAL, live: true },
  { name: "Tempo Run", bpm: 172, listeners: 842, tag: "Steady state · zone 3", color: "#e89b4a" },
  { name: "Intervals", bpm: 168, listeners: 624, tag: "HIIT · 30/30 · 40/20", color: "#c978d8" },
  { name: "Long Ride", bpm: 120, listeners: 418, tag: "Endurance · 90–180 min", color: "#7aaae8" },
  { name: "Cooldown", bpm: 90, listeners: 302, tag: "Zone 2 · mobility · stretch", color: "#a3c98c" },
  { name: "Lift Heavy, Again", bpm: 140, listeners: 1102, tag: "Powerlifting · meets", color: "#d86a6a" },
];

const SHOWS = [
  { name: "Lift Series vol. 04", dj: "DJ Kaya Mars", len: "1h 12m", style: "Heavy bass · 130–140 bpm", featured: true },
  { name: "Long Run Radio", dj: "Nilo Ceza", len: "2h 00m", style: "Afro-house · 168–172 bpm" },
  { name: "Cut the Weight", dj: "Merit & Sable", len: "48m", style: "Grime-adjacent · 160 bpm" },
  { name: "Mobility Hour", dj: "Linnea Aho", len: "60m", style: "Ambient · 80–90 bpm" },
  { name: "Interval Room", dj: "Tariq Osei", len: "35m", style: "House cuts · 128 bpm" },
  { name: "Deload Sunday", dj: "Shape Residents", len: "1h 30m", style: "Indie + breaks · 100 bpm" },
];

function RadioHero() {
  const bars = Array.from({ length: 48 }, () => Math.random());
  return (
    <section style={{ padding: "100px 40px 80px", position: "relative", overflow: "hidden", minHeight: 700 }}>
      <div aria-hidden style={{ position: "absolute", inset: 0, backgroundImage: "url('/Make_the_lines_202604170430%20(1).png')", backgroundSize: "cover", backgroundPosition: "center", pointerEvents: "none" }} />
      <div aria-hidden style={{ position: "absolute", inset: 0, background: "linear-gradient(180deg, rgba(26,22,18,0.55) 0%, rgba(26,22,18,0.72) 55%, #1a1612 100%)", pointerEvents: "none" }} />
      <div style={{ maxWidth: 1320, margin: "0 auto", position: "relative", display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 80, alignItems: "center" }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL_BRIGHT, marginBottom: 20, display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ width: 8, height: 8, borderRadius: 999, background: TEAL_BRIGHT, animation: "pulse 1.4s ease-in-out infinite" }} />
            Shape Radio · 3,472 listening
          </div>
          <h1 style={{ fontFamily: serif, fontSize: 140, letterSpacing: "-0.04em", fontWeight: 400, margin: 0, lineHeight: 0.88 }}>
            Music<br/>built for<br/><em style={{ fontStyle: "italic", color: TEAL }}>training.</em>
          </h1>
          <p style={{ fontFamily: sans, fontSize: 18, color: "rgba(242,237,228,0.7)", margin: "28px 0 0", maxWidth: 520, lineHeight: 1.5 }}>Ad-free workout mixes, curated stations by BPM, live DJ sets from residents who lift. Included with every Shape membership.</p>
          <div style={{ display: "flex", gap: 10, marginTop: 36 }}>
            <button style={{ background: TEAL, color: PAPER, border: 0, padding: "16px 28px", borderRadius: 6, fontWeight: 500, fontSize: 14.5, fontFamily: sans, cursor: "pointer" }}>▶ Play Heavy Day</button>
            <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "16px 28px", borderRadius: 6, fontWeight: 500, fontSize: 14.5, fontFamily: sans, cursor: "pointer" }}>Browse stations</button>
          </div>
        </div>

        {/* Now playing card */}
        <div style={{ padding: 32, background: "rgba(26,22,18,0.55)", backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", border: "1px solid rgba(242,237,228,0.12)", borderRadius: 4 }}>
          <div style={{ fontFamily: sans, fontSize: 11, letterSpacing: "0.12em", color: TEAL_BRIGHT, textTransform: "uppercase" }}>◉ Live · 1,284 listening</div>
          <div style={{ fontFamily: serif, fontSize: 44, letterSpacing: "-0.02em", marginTop: 14, lineHeight: 1 }}>Heavy Day · 132 BPM</div>
          <div style={{ fontFamily: sans, fontSize: 13.5, color: "rgba(242,237,228,0.7)", marginTop: 8 }}>DJ Kaya Mars — Lift Series vol. 04</div>
          <div style={{ display: "flex", alignItems: "center", gap: 3, height: 56, marginTop: 28 }}>
            {bars.map((h, i) => (
              <div key={i} style={{ flex: 1, height: `${20 + h*80}%`, background: i < 32 ? TEAL_BRIGHT : "rgba(242,237,228,0.2)", borderRadius: 1, transition: "height .2s" }} />
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 14, fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: "rgba(242,237,228,0.55)" }}>
            <span>28:14</span><span>48:30</span>
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
            <button style={{ flex: 1, background: TEAL, color: PAPER, border: 0, padding: "12px 0", borderRadius: 6, fontFamily: sans, fontSize: 13, fontWeight: 500, cursor: "pointer" }}>▶ Play</button>
            <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "12px 18px", borderRadius: 6, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>♡</button>
            <button style={{ background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.25)", padding: "12px 18px", borderRadius: 6, fontFamily: sans, fontSize: 13, cursor: "pointer" }}>⇅</button>
          </div>
        </div>
      </div>
      <style>{`@keyframes pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }`}</style>
    </section>
  );
}

function RadioStations() {
  return (
    <section style={{ padding: "60px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Stations · by BPM</div>
        <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 48px", lineHeight: 0.95 }}>Pick the <em style={{ fontStyle: "italic", color: TEAL }}>pace</em>. We'll pick the <em style={{ fontStyle: "italic", color: TEAL }}>music</em>.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {STATIONS.map((s, i) => (
            <div key={i} style={{ position: "relative", padding: 28, background: "rgba(242,237,228,0.04)", border: "1px solid rgba(242,237,228,0.08)", borderRadius: 10, overflow: "hidden" }}>
              <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 3, background: s.color }} />
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", marginBottom: 20 }}>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.12em", color: s.color }}>{s.live ? "◉ LIVE" : "ON DEMAND"}</div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(242,237,228,0.5)" }}>{s.listeners.toLocaleString()} listening</div>
              </div>
              <div style={{ fontFamily: serif, fontSize: 48, letterSpacing: "-0.025em", fontWeight: 400, lineHeight: 1 }}>{s.name}</div>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 24, color: s.color, marginTop: 10, letterSpacing: "-0.01em" }}>{s.bpm}<span style={{ fontSize: 13, opacity: 0.7 }}> BPM</span></div>
              <div style={{ fontSize: 13, color: "rgba(242,237,228,0.65)", marginTop: 14, lineHeight: 1.5 }}>{s.tag}</div>
              <button style={{ marginTop: 20, padding: "10px 18px", borderRadius: 6, background: "transparent", color: INK, border: "1px solid rgba(242,237,228,0.2)", fontFamily: sans, fontSize: 12.5, cursor: "pointer" }}>▶ Tune in</button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function RadioShows() {
  return (
    <section style={{ padding: "100px 40px", background: INK, color: PAPER }}>
      <div style={{ maxWidth: 1320, margin: "0 auto" }}>
        <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Shows & residents</div>
        <h2 style={{ fontFamily: serif, fontSize: 72, letterSpacing: "-0.03em", fontWeight: 400, margin: "0 0 48px", lineHeight: 0.95 }}>Residents <em style={{ fontStyle: "italic", color: TEAL }}>who train</em>. Sets <em style={{ fontStyle: "italic", color: TEAL }}>that land</em>.</h2>
        <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr 1fr", gap: 20 }}>
          {SHOWS.slice(0, 3).map((s, i) => (
            <div key={i} style={{ gridColumn: i === 0 ? "span 1" : "auto", display: "grid", gridTemplateRows: "auto 1fr", gap: 16 }}>
              <Ph label={`${s.dj} · cover`} ratio={i === 0 ? "16/10" : "4/3"} tone="light" />
              <div>
                <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 10, letterSpacing: "0.1em", color: "rgba(26,22,18,0.5)" }}>{s.featured ? "FEATURED · " : ""}{s.len}</div>
                <div style={{ fontFamily: serif, fontSize: i === 0 ? 38 : 28, letterSpacing: "-0.02em", marginTop: 8, lineHeight: 1 }}>{s.name}</div>
                <div style={{ fontSize: 13, color: "rgba(26,22,18,0.6)", marginTop: 6 }}>{s.dj} · {s.style}</div>
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
    <section style={{ padding: "120px 40px" }}>
      <div style={{ maxWidth: 1320, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80 }}>
        <div>
          <div style={{ fontFamily: sans, fontSize: 12, letterSpacing: "0.18em", textTransform: "uppercase", color: TEAL, marginBottom: 16 }}>Why it's different</div>
          <h2 style={{ fontFamily: serif, fontSize: 64, letterSpacing: "-0.03em", fontWeight: 400, margin: 0, lineHeight: 0.95 }}>No ads.<br/>No filler.<br/><em style={{ fontStyle: "italic", color: TEAL }}>No chatter.</em></h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          {[
            ["Mixed for movement", "Every track is vetted for tempo consistency. No slow-down bridges that break a set. No key jumps during intervals."],
            ["Synced to your program", "Radio reads your workout — pulls a Heavy Day station when you're squatting, Tempo when you're on the treadmill. You just press play."],
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

function RadioPage() {
  return (
    <div style={{ background: PAPER, color: INK, minHeight: "100vh" }}>
      <Header active="Radio" />
      <RadioHero />
      <RadioStations />
      <RadioShows />
      <RadioPitch />
      <Footer />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RadioPage />);
