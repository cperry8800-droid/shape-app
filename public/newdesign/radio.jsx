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
  // ⚠ THREE STATES, NOT TWO — `null` is "not resolved yet" and renders nothing,
  // `false` is "we could not read the schedule", and an array is a MEASURED answer.
  // All three of this component's failure doors used to publish `[]`, which renders
  // "Schedule lands with the first broadcast." — a claim about the STATION made out
  // of a failure of OUR OWN: a Supabase client that never loaded, a query that
  // faulted, a request that never landed. That is the same class as the "No station
  // on the air yet" this page took four rounds to close at its three doors, sitting
  // one component below it the whole time, and this PR's own description asserts that
  // "the schedule under it is real". A schedule we could not read is not a schedule
  // that is empty.
  const [rows, setRows] = React.useState(null);
  React.useEffect(() => {
    let on = true;
    const db = window.shapeDb && window.shapeDb.client;
    const lib = window.ShapeSetsLib;
    // Guard BOTH exports: a browser holding an older cached copy of the module
    // would have bsSetsNow but not bsSetsWindow, and calling through would
    // throw rather than degrade (the module-cache lesson from #1772).
    if (!db || !lib || !lib.bsSetsNow || !lib.bsSetsWindow) { setRows(false); return undefined; }
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
        // A query fault resolves rather than throws, so this arm is where most
        // unreadable answers land — and it is the one that used to coerce them to [].
        if (!res || res.error || !Array.isArray(res.data)) { setRows(false); return; }
        // UPCOMING ONLY — deliberately no live/"Now" row, and the REASON has changed
        // even though the behaviour has not. It used to read "the website has no
        // player and no stream gate", and this PR put both at the top of this page.
        // What still holds is narrower and better: `nora_sets` is a SCHEDULE, and a
        // start time that has passed is not a measurement that anything is being
        // transmitted. The instrument above can tell whether audio is arriving; this
        // table cannot, so a "Now" row here would be a broadcast claim derived from a
        // calendar. A set already under way simply isn't "coming up".
        setRows(lib.bsSetsNow(res.data, Date.now()).upcoming);
      })
      .catch(() => { if (on) setRows(false); });
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
      {rows === false ? (
        <div style={{ fontFamily: RD_NUM, fontSize: 12, letterSpacing: "0.06em", color: "rgba(242,237,228,0.55)" }}>Couldn&rsquo;t read the schedule just now.</div>
      ) : rows.length === 0 ? (
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

// ⚠ THE CARD STANDS IN CLUB SHAPE, THE SAME PICTURE AS THE APP'S SHAPE SETS SCREEN —
// owner, 2026-10-09: "need the background here on this box on website to be club
// shape, same picture that is background of shape sets on app". `/club-shape-bg.webp`
// is the app's `mobile-app/public/club-shape-bg.jpg` re-encoded (232 KB against
// 403 KB), portrait like the original: on a laptop the box shows the band with the
// venue in it, and on a phone, where the box runs tall, more of the skyline and the
// water. The scrim is darker than the app's (0.22–0.55), with a soft text shadow,
// because the copy sits on the picture here; in the app it sits on glass cards.
const RD_CLUB_BG = "/club-shape-bg.webp";

function RadioShapeSets() {
  return (
    <section style={{ padding: "80px 72px" }}>
      <RdReveal>
        <div style={{ position: "relative", overflow: "hidden", maxWidth: 860, margin: "0 auto", padding: 48, background: `linear-gradient(180deg, rgba(8,10,9,0.72) 0%, rgba(8,10,9,0.5) 46%, rgba(8,10,9,0.88) 100%), #0a0d0c url('${RD_CLUB_BG}') center 47% / cover no-repeat`, textShadow: "0 1px 2px rgba(0,0,0,0.6), 0 0 16px rgba(0,0,0,0.5)", border: "1px solid rgba(242,237,228,0.18)", borderRadius: 4, textAlign: "center" }}>
          <div aria-hidden style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: `linear-gradient(90deg, ${RD_TEAL}, ${RD_HOT})`, opacity: 0.75 }} />
          <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: RD_NUM, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: RD_TEAL, marginBottom: 16 }}>
            From Club Shape
          </div>
          <h2 style={{ fontFamily: RD_DISP, fontSize: "clamp(44px, 6vw, 72px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>
            Shape <em style={{ fontStyle: "italic", fontWeight: 600, color: RD_TEAL }}>Sets.</em>
          </h2>
          <p style={{ fontFamily: RD_SANS, fontSize: 16, fontWeight: 500, color: "rgba(242,237,228,0.95)", margin: "22px auto 0", maxWidth: 620, lineHeight: 1.55 }}>
            A virtual concert series broadcast straight from <strong style={{ color: RD_CREAM, fontWeight: 500 }}>Club Shape</strong>, our flagship venue. DJs and live acts, captured on the floor and streamed through Shape Radio.
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

// ⚠ NORA'S BOOTH CAME OFF THE PLAYER THIS PAGE RETIRES, and since Phase 1 it is the whole booth:
// Club Shape, the gear and Nora at the decks (public/newdesign/booth/noraBooth.mjs), the same module
// the app's Radio screen mounts. three.js loads only when somebody opens it, because it is megabytes
// and most visitors never do. The label, the example-set rule and the keeper are
// window.ShapeBoothState and window.ShapeBoothKeeper (noraBoothState.mjs and noraBoothKeeper.mjs,
// loaded by a module tag in Radio.html), so both surfaces say the same thing.
//
// ⚠ ONE BOOTH, KEPT. Hide stops it drawing and keeps it, so showing it again is instant; the keeper
// (noraBoothKeeper.mjs) disposes it after a few minutes hidden. A load abandoned by Hide is disposed
// on arrival, and a failed one has already released its WebGL context (createNoraBooth's contract),
// because browsers cap live contexts and silently evict the oldest.
let rdBoothKeeper = null;
async function rdKeeper() {
  if (rdBoothKeeper) return rdBoothKeeper;
  const B = await import("/newdesign/booth/noraBooth.mjs");
  if (rdBoothKeeper) return rdBoothKeeper;
  rdBoothKeeper = window.ShapeBoothKeeper.createBoothKeeper({
    create: (progress) => {
      const S = window.ShapeBoothState;
      const tier = S.boothTier({ screenW: window.screen && window.screen.width, screenH: window.screen && window.screen.height });
      const canvas = document.createElement("canvas");
      canvas.style.cssText = "display:block;width:100%;height:100%";
      canvas.setAttribute("aria-hidden", "true");
      return B.createNoraBooth({
        canvas, modelUrl: S.noraAssetUrl(S.NORA_MODEL.path, "/"), crowdUrl: S.noraAssetUrl(S.NORA_MODEL.crowd, "/"), portrait: S.NORA_MODEL.portrait,
        venueUrl: S.clubShapeModelUrl(S.CLUB_SHAPE_MODEL, "/", tier.quality),
        quality: tier.quality, cinematic: tier.cinematic, fps: tier.fps,
        reducedMotion: RD_REDUCED, onProgress: progress,
      });
    },
  });
  return rdBoothKeeper;
}

function RadioNora() {
  const hostRef = React.useRef(null);
  const boothRef = React.useRef(null);
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState("closed");   // closed | opening | open | unsupported | failed
  const [progress, setProgress] = React.useState(null);
  const [snap, setSnap] = React.useState(null);
  const [attempt, setAttempt] = React.useState(0);
  // The station's readings, from the instrument above (radioInstrument.jsx parks and announces them).
  const [radio, setRadio] = React.useState(() => window.__shapeRadioState || { signedIn: null, configured: null, playing: false });
  React.useEffect(() => {
    const on = (e) => setRadio((e && e.detail) || window.__shapeRadioState || { signedIn: null, configured: null, playing: false });
    window.addEventListener("shape:radiostate", on);
    return () => window.removeEventListener("shape:radiostate", on);
  }, []);
  // A live Shape Set on the air, re-derived every minute from one read of the schedule, the way the
  // app does: during one Nora steps off the decks and the label names the DJ.
  const [liveSet, setLiveSet] = React.useState(null);
  React.useEffect(() => {
    // ⚠ A REOPENED BOOTH STARTS WITH NO LIVE SET (Codex, #2287). The last open's set may have
    // ended since, and a read that fails now would otherwise leave it standing: the old DJ named
    // on the label and Nora kept off the decks for a set that is over. Not knowing is "no guest".
    setLiveSet(null);
    if (!open) return undefined;
    const db = window.shapeDb && window.shapeDb.client;
    const lib = window.ShapeSetsLib;
    if (!db || !lib || !lib.bsSetsNow || !lib.bsSetsWindow) return undefined;
    let on = true, rows = [];
    const derive = () => { if (on) setLiveSet(lib.bsSetsNow(rows, Date.now()).live || null); };
    const { from, to } = lib.bsSetsWindow(Date.now());
    db.from("nora_sets").select("*").eq("published", true).gte("starts_at", from).lte("starts_at", to)
      .then((res) => { if (on && res && !res.error && Array.isArray(res.data)) { rows = res.data; derive(); } })
      .catch(() => {});
    const id = setInterval(derive, 60000);
    return () => { on = false; clearInterval(id); };
  }, [open]);

  // Open: build (or take back) the booth and put its canvas in the box.
  React.useEffect(() => {
    if (!open) { setState("closed"); return undefined; }
    const S = window.ShapeBoothState;
    // A browser holding an older cached page without the booth's module tag has neither global.
    if (!S || !S.webgl2Available || !window.ShapeBoothKeeper) { setState("failed"); return undefined; }
    if (!S.webgl2Available()) { setState("unsupported"); return undefined; }
    let alive = true, booth = null, unsub = null, offProgress = null, keeper = null;
    setState("opening");
    setProgress(null);
    rdKeeper().then((k) => {
      if (!alive) return null;
      keeper = k;
      offProgress = k.onProgress((f) => { if (alive) setProgress(f); });
      return k.acquire();
    }).then((b) => {
      if (!b || !alive) return;
      booth = b;
      boothRef.current = b;
      if (hostRef.current) hostRef.current.appendChild(b.canvas);
      b.resize();
      b.start();
      unsub = b.subscribe((s) => { if (alive) setSnap(s); });
      window.__shapeBooth = b;   // diagnostics: frames, draw calls and the measured refresh (stats())
      setState("open");
    }).catch((e) => {
      if (!alive) return;
      // Say what happened in the console; the visitor gets the honest short line below.
      try { console.warn("[nora] booth failed to start", e); } catch (e2) {}
      setState(e && e.name === "BoothUnsupportedError" ? "unsupported" : "failed");
    });
    return () => {
      alive = false;
      if (offProgress) offProgress();
      if (unsub) unsub();
      if (booth && booth.canvas.parentNode) booth.canvas.parentNode.removeChild(booth.canvas);
      if (booth && window.__shapeBooth === booth) window.__shapeBooth = null;
      boothRef.current = null;
      setSnap(null);
      // Released even if it is still loading: the keeper disposes a load nobody waits for. With no
      // keeper yet, this attempt never acquired, so there is nothing of ours to release.
      if (keeper) keeper.release();
    };
  }, [open, attempt]);

  const S = window.ShapeBoothState;
  const prospect = radio.signedIn === false;
  const stationPlaying = !!radio.playing;
  const stationConfigured = radio.configured === true;
  const guestDj = stationConfigured && liveSet && liveSet.dj ? String(liveSet.dj) : null;
  const allowed = S ? S.exampleAllowed({ prospect, stationConfigured, stationPlaying }) : false;

  // The example set stops the moment it is no longer this visitor's to hear.
  React.useEffect(() => {
    if (!allowed && boothRef.current) boothRef.current.stopExample();
  }, [allowed, state]);

  // ⚠ THE GRAPH CAN ARRIVE AFTER THE BOOTH DOES (Codex, #2101 round 8): a visitor very reasonably
  // opens Nora BEFORE pressing Tune in. The instrument announces the graph on `shape:radiograph`
  // the moment it builds one; the booth also re-reads it whenever it (re)opens or the station's
  // state moves, so a graph that arrived mid-download is not lost either.
  const bindStation = React.useCallback((g) => {
    const b = boothRef.current;
    if (!b) return;
    const graph = g || window.__shapeRadioGraph || null;
    b.setStation({ analyser: graph && stationPlaying ? graph.analyser : null, playing: stationPlaying, guest: !!guestDj });
  }, [stationPlaying, guestDj]);
  React.useEffect(() => {
    const bind = (e) => bindStation(e && e.detail);
    window.addEventListener("shape:radiograph", bind);
    return () => window.removeEventListener("shape:radiograph", bind);
  }, [bindStation]);
  React.useEffect(() => { if (state === "open") bindStation(null); }, [state, bindStation]);

  const label = S ? S.boothLabel({ example: !!(snap && snap.example), station: { playing: stationPlaying, bpm: snap ? snap.bpm : null, guest: guestDj } }) : { key: "offAir" };
  const labelText = S ? S.boothLabelText(label) : "Off air";
  const lit = label.key !== "offAir";
  const playing = !!(snap && snap.example);
  const free = !!(snap && snap.camera === "free");
  const showing = state === "open" || state === "opening";
  const chip = (active) => ({
    height: 38, padding: "0 14px", background: active ? "rgba(52,214,197,0.1)" : "transparent",
    border: `1px solid ${active ? RD_TEAL : "rgba(238,243,240,0.24)"}`, color: active ? RD_TEAL : RD_CREAM,
    fontFamily: RD_SANS, fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
  });
  const tag = { fontFamily: RD_NUM, fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontVariationSettings: "'ROND' 100" };

  return (
    <section id="nora" style={{ padding: "0 24px 96px" }}>
      <div style={{ maxWidth: 960, margin: "0 auto", textAlign: "center" }}>
        <RdReveal>
          <div style={{ ...tag, color: RD_TEAL }}>The booth</div>
          <h2 style={{ fontFamily: RD_DISP, fontWeight: 500, fontVariationSettings: "'wdth' 105", fontSize: "clamp(26px,3vw,38px)", letterSpacing: "-0.02em", margin: "14px 0 0", color: RD_CREAM }}>Nora</h2>
          <p style={{ fontFamily: RD_SANS, fontSize: 15, color: "rgba(238,243,240,0.7)", margin: "14px auto 0", maxWidth: 520, lineHeight: 1.6 }}>
            Shape&rsquo;s resident at the decks in Club Shape. While the station is not on the air
            she plays a labelled example set; while it is, she moves on what it is playing.
          </p>
          <div className="rd-booth" style={{ position: "relative", width: "100%", margin: "26px auto 0", display: showing || state === "failed" || state === "unsupported" ? "block" : "none", border: "1px solid rgba(238,243,240,0.12)", background: "#07080a", overflow: "hidden", textAlign: "left" }}>
            <div ref={hostRef} role="img" aria-label="Nora at the decks in Club Shape: two media players and a mixer on a stage, with lights and a crowd" style={{ position: "absolute", inset: 0 }} />
            <div aria-live="polite" style={{ ...tag, position: "absolute", top: 12, left: 14, right: 110, display: "flex", alignItems: "center", gap: 8, color: lit ? RD_TEAL : RD_CREAM50 }}>
              <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, flex: "0 0 auto", background: lit ? RD_TEAL : "transparent", border: `1px solid ${lit ? RD_TEAL : RD_CREAM50}` }} />
              <span>{labelText}</span>
            </div>
            {state === "open" && (
              <div style={{ position: "absolute", top: 10, right: 14, textAlign: "right" }}>
                <div style={{ ...tag, fontSize: 22, letterSpacing: "0.02em", color: snap && snap.bpm ? RD_TEAL : RD_CREAM50, fontVariantNumeric: "tabular-nums" }}>{snap && snap.bpm ? snap.bpm.toFixed(1) : "—"}</div>
                <div style={{ ...tag, fontSize: 9, color: RD_CREAM50 }}>BPM · measured</div>
              </div>
            )}
            {state === "open" && snap && snap.track && (
              <div style={{ position: "absolute", left: 14, right: 14, bottom: 12, fontFamily: RD_SANS, fontSize: 13, color: RD_CREAM }}>
                <strong style={{ fontWeight: 600 }}>{snap.track.name}</strong>
                {snap.track.synthesized && <span style={{ color: RD_CREAM50 }}> · Synthesized example</span>}
              </div>
            )}
            {state === "opening" && (
              <div style={{ ...tag, position: "absolute", inset: 0, display: "grid", placeItems: "center", color: RD_CREAM50 }}>
                {progress != null ? `Loading Nora… ${Math.round(progress * 100)}%` : "Loading Nora…"}
              </div>
            )}
            {(state === "unsupported" || state === "failed") && (
              <div style={{ ...tag, position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, textAlign: "center", color: RD_CREAM50 }}>
                {state === "unsupported" ? "This browser can’t run the booth: it needs WebGL 2" : "The booth could not start on this device"}
              </div>
            )}
          </div>
          {state === "open" && (
            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 8, marginTop: 14 }}>
              {allowed && (playing
                ? <button type="button" onClick={() => boothRef.current && boothRef.current.stopExample()} style={chip(true)}>■ Stop the example set</button>
                : <button type="button" onClick={() => boothRef.current && boothRef.current.playExample()} style={chip(false)}>▶ Play the example set</button>)}
              {playing && <button type="button" onClick={() => boothRef.current && boothRef.current.nextTrack()} style={chip(false)}>Next track ⇄</button>}
              <button type="button" aria-pressed={!free} onClick={() => boothRef.current && boothRef.current.setCamera("auto")} style={chip(!free)}>Auto camera</button>
              <button type="button" aria-pressed={free} onClick={() => boothRef.current && boothRef.current.setCamera("free")} style={chip(free)}>Look around</button>
            </div>
          )}
          {state === "open" && allowed && (
            <p style={{ fontFamily: RD_SANS, fontSize: 13, color: RD_CREAM50, margin: "12px auto 0", maxWidth: 560, lineHeight: 1.55 }}>
              The example set&rsquo;s tracks are synthesized in your browser and Nora&rsquo;s mix is
              choreographed on their beat. It is not the Shape Radio stream.
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18 }}>
            <button type="button" onClick={() => setOpen((v) => !v)}
              style={{ height: 44, padding: "0 20px", background: "transparent", border: `1px solid ${RD_TEAL}`, color: RD_TEAL, fontFamily: RD_SANS, fontWeight: 600, fontSize: 13.5, cursor: "pointer", clipPath: "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)" }}>
              {showing ? "Hide Nora" : "Watch Nora"}
            </button>
            {state === "failed" && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} style={chip(false)}>Try again</button>
            )}
          </div>
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
      <RadioNora />
      <RadioJoin />
      <Footer />
      <style>{`
        html, body { background: #06090f !important; }
        .radio-page ::selection { background: #34d6c5; color: #04110f; }
        .rd-booth { aspect-ratio: 16 / 9; }
        @media (max-width: 640px) { .rd-booth { aspect-ratio: 4 / 5; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RadioPage />);
