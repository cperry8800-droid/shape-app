// radio.jsx — Shape Radio: one page, one station.
//
// ⚠ THIS PAGE USED TO BE THE MARKETING PAGE FOR A PLAYER THAT LIVED SOMEWHERE ELSE.
// The app has ONE Radio screen; the web had two — a page that could not play and a
// player that could not sell — and a member was sent from one to the other. The
// instrument is at the top of this page now: it plays for a member and rests
// honestly for a visitor. What went with the old hero is everything it had no
// evidence for — forty-eight bar heights rolled from Math.random() at render, a
// scrubber reading 28:14 / 48:30 over a stream with no position, "◉ Live" over a
// station that is not broadcasting, and five sections (RadioStations, RadioShows,
// RadioPitch, RadioCoachPlaylists, RadioInClientApp) that were defined and mounted
// by nothing, carrying typed BPMs, "1,284 listening" and downloads that do not
// exist one render call from the page.
//
// ⚠ AND THE SETS CARD STOPPED CLAIMING A BROADCAST. It pulsed a teal dot beside
// "Live from Club Shape" unconditionally — directly above its own COMING SOON.
// It reads "From Club Shape" now; the schedule under it is real, out of nora_sets.

function RdReveal({ children, delay = 0, style = {} }) {
  const ref = React.useRef(null);
  const [on, setOn] = React.useState(RD_REDUCED);
  React.useEffect(() => {
    if (RD_REDUCED || !ref.current) return;
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }), { threshold: 0.12 });
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return <div ref={ref} style={{ opacity: on ? 1 : 0, transform: on ? "none" : "translateY(30px)", transition: `opacity .7s ease ${delay}ms, transform .7s ease ${delay}ms`, ...style }}>{children}</div>;
}

function RdSetsComingUp() {
  const [rows, setRows] = React.useState(null);   // null = still loading → render nothing
  React.useEffect(() => {
    let on = true;
    const db = window.shapeDb && window.shapeDb.client;
    const lib = window.ShapeSetsLib;
    // Guard BOTH exports: a browser holding an older cached copy of the module
    // would have bsSetsNow but not bsSetsWindow, and calling through would
    // throw rather than degrade (the module-cache lesson from #1772).
    if (!db || !lib || !lib.bsSetsNow || !lib.bsSetsWindow) { setRows([]); return undefined; }
    // The SAME window the app queries, from the same canonical definition —
    // recomputing it here is how the two surfaces drift (review: CodeRabbit).
    // No row limit: a limit could truncate away the set that is on air, and the
    // window is already the bound.
    const { from, to } = lib.bsSetsWindow(Date.now());
    db.from("nora_sets").select("*").eq("published", true)
      .gte("starts_at", from).lte("starts_at", to)
      .order("starts_at", { ascending: true })
      .then((res) => {
        if (!on) return;
        const data = res && !res.error && Array.isArray(res.data) ? res.data : [];
        // UPCOMING ONLY — deliberately no live/"Now" row. The website has no
        // player and no stream gate, so marking a set as on air here would
        // claim a broadcast the page cannot support (and would say it even on
        // the mock provider). A set already under way simply isn't "coming up".
        setRows(lib.bsSetsNow(data, Date.now()).upcoming);
      })
      .catch(() => { if (on) setRows([]); });
    return () => { on = false; };
  }, []);
  if (rows === null) return null;
  const fmt = (iso) => {
    const d = new Date(iso);
    if (!isFinite(d.getTime())) return "";
    try { return new Intl.DateTimeFormat(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }).format(d); }
    catch (e) { return ""; }
  };
  return (
    <div style={{ marginTop: 40, textAlign: "left", maxWidth: 560, marginLeft: "auto", marginRight: "auto" }}>
      <div style={{ fontFamily: RD_NUM, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: RD_TEAL, marginBottom: 10 }}>Coming up</div>
      {rows.length === 0 ? (
        <div style={{ fontFamily: RD_NUM, fontSize: 12, letterSpacing: "0.06em", color: "rgba(242,237,228,0.55)" }}>Schedule lands with the first broadcast.</div>
      ) : rows.map((s, i) => (
        <div key={s.id} style={{ display: "flex", alignItems: "baseline", gap: 14, padding: "12px 0", borderTop: i ? "1px solid rgba(242,237,228,0.14)" : "none" }}>
          <span style={{ flex: "0 0 auto", minWidth: 96, fontFamily: RD_NUM, fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(242,237,228,0.7)", fontWeight: 500 }}>
            {fmt(s.starts_at)}
          </span>
          <span style={{ flex: 1, minWidth: 0, fontFamily: RD_DISP, fontSize: 19, fontWeight: 500, letterSpacing: "-0.01em", color: RD_CREAM, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
          <span style={{ flex: "0 0 auto", fontFamily: RD_NUM, fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: "rgba(242,237,228,0.55)" }}>{s.dj}</span>
        </div>
      ))}
    </div>
  );
}

function RadioShapeSets() {
  return (
    <section style={{ padding: "80px 72px" }}>
      <RdReveal>
        <div style={{ position: "relative", overflow: "hidden", maxWidth: 860, margin: "0 auto", padding: 48, background: "rgba(11,14,12,0.68)", backdropFilter: "blur(14px) saturate(1.1)", WebkitBackdropFilter: "blur(14px) saturate(1.1)", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, textAlign: "center" }}>
          <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${RD_TEAL}, ${RD_HOT})`, opacity: 0.75 }} />
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: RD_NUM, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: RD_TEAL, marginBottom: 16 }}>
            From Club Shape
          </div>
          <h2 style={{ fontFamily: RD_DISP, fontSize: "clamp(44px, 6vw, 72px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>
            Shape <em style={{ fontStyle: "italic", fontWeight: 600, color: RD_TEAL }}>Sets.</em>
          </h2>
          <p style={{ fontFamily: RD_SANS, fontSize: 16, fontWeight: 500, color: "rgba(242,237,228,0.95)", margin: "22px auto 0", maxWidth: 620, lineHeight: 1.55 }}>
            A virtual concert series broadcast straight from <strong style={{ color: RD_CREAM, fontWeight: 500 }}>Club Shape</strong>, our flagship venue. DJs and live acts mixed for movement, captured on the floor and streamed through Shape Radio.
          </p>
          <div style={{ marginTop: 36, fontFamily: RD_NUM, fontSize: 24, letterSpacing: "0.28em", textTransform: "uppercase", color: RD_TEAL, fontWeight: 500 }}>
            Coming soon
          </div>
          <RdSetsComingUp />
        </div>
      </RdReveal>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Below the instrument
// ---------------------------------------------------------------------------

function RadioInApp() {
  return (
    <section style={{ padding: "96px 24px" }}>
      <div className="rd-two" style={{ maxWidth: 1040, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "clamp(32px,4vw,72px)", alignItems: "center" }}>
        <RdReveal>
          <div style={{ fontFamily: RD_NUM, fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", color: RD_TEAL, fontVariationSettings: "'ROND' 100" }}>In the app</div>
          <h2 style={{ fontFamily: RD_DISP, fontWeight: 500, fontVariationSettings: "'wdth' 105", fontSize: "clamp(30px,3.4vw,46px)", letterSpacing: "-0.025em", lineHeight: 1.02, margin: "14px 0 0", color: RD_CREAM }}>
            The same instrument, on your phone.
          </h2>
          <p style={{ fontFamily: RD_SANS, fontSize: 15.5, lineHeight: 1.6, color: "rgba(238,243,240,0.72)", maxWidth: 460, margin: "18px 0 0" }}>
            Shape Radio in the app draws the station from the same two modules this page
            does, so the tempo you read here and the tempo you read there are one
            measurement rather than two guesses. The phone adds the half the web does not
            have: a heart-rate strap over Bluetooth, and the station&rsquo;s beat and your own
            pulse drawn on one clock until they lock.
          </p>
          <a href="/newdesign/GetApp.html" style={{ display: "inline-flex", alignItems: "center", height: 44, padding: "0 20px", marginTop: 26, background: RD_TEAL, color: "#04110f", fontFamily: RD_SANS, fontWeight: 700, fontSize: 14, textDecoration: "none", clipPath: "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)" }}>
            Get the app
          </a>
        </RdReveal>
        <RdReveal delay={90}>
          <div style={{ fontFamily: RD_NUM, fontWeight: 700, fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: "rgba(238,243,240,0.4)", fontVariationSettings: "'ROND' 100", marginBottom: 12 }}>The Signal Field</div>
          <p style={{ fontFamily: RD_SANS, fontSize: 14.5, lineHeight: 1.6, color: "rgba(238,243,240,0.62)", maxWidth: 420, margin: 0 }}>
            On the phone the station is a dot field lit by the same bands, with the
            spectrum mirrored around the bass and a four-beat counter stepping on the
            measured tempo. Tap <em style={{ fontStyle: "normal", color: RD_CREAM }}>Match my BPM</em> and it becomes two
            pulse rows on one clock &mdash; the station above, your heart below &mdash; and thin ties
            join every pair that lands together.
          </p>
        </RdReveal>
      </div>
    </section>
  );
}

function RadioJoin() {
  return (
    <section style={{ padding: "0 24px 110px" }}>
      <RdReveal>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "clamp(32px,4vw,56px)", border: "1px solid rgba(238,243,240,0.14)", background: "rgba(6,9,15,0.6)", textAlign: "center", clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)" }}>
          <h2 style={{ fontFamily: RD_DISP, fontWeight: 500, fontVariationSettings: "'wdth' 105", fontSize: "clamp(26px,3vw,38px)", letterSpacing: "-0.02em", margin: 0, color: RD_CREAM }}>
            Included with every membership.
          </h2>
          <p style={{ fontFamily: RD_SANS, fontSize: 15, color: "rgba(238,243,240,0.7)", margin: "16px auto 0", maxWidth: 480, lineHeight: 1.6 }}>
            One live channel, no ads, and the coach playlists that ride on your own
            sessions. $5 a month, cancel any time.
          </p>
          <a href="/newdesign/Landing.html" style={{ display: "inline-flex", alignItems: "center", height: 46, padding: "0 24px", marginTop: 26, background: RD_TEAL, color: "#04110f", fontFamily: RD_SANS, fontWeight: 700, fontSize: 14.5, textDecoration: "none", clipPath: "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)" }}>
            Join Shape
          </a>
        </div>
      </RdReveal>
    </section>
  );
}

function RadioPage() {
  return (
    <div className="radio-page" style={{ color: RD_CREAM, minHeight: "100vh", background: "#06090f" }}>
      <Header active="Radio" />
      <RadioInstrument />
      <div id="sets"><RadioShapeSets /></div>
      <RadioInApp />
      <RadioJoin />
      <Footer />
      <style>{`
        html, body { background: #06090f !important; }
        .radio-page ::selection { background: #34d6c5; color: #04110f; }
        @media (max-width: 860px) { .rd-two { grid-template-columns: 1fr !important; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RadioPage />);
