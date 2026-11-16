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

// ⚠ SHAPE SETS IS WHAT'S ON AT THE CLUB, NOT A CARD OF ITS OWN. It was a second box under Nora's,
// standing in a picture of the venue (owner, 2026-10-09). The venue has a section of its own now
// (RadioClub, below), and the series is the block under its rooms. Its copy and its schedule are
// unchanged: "Coming soon" until a set is published, and the schedule is read out of nora_sets.
// It keeps the #sets anchor the instrument's strip links to.
function RdWhatsOn() {
  return (
    <div id="sets" style={{ marginTop: 44, paddingTop: 40, borderTop: "1px solid rgba(242,237,228,0.14)", textAlign: "center" }}>
      <div style={{ display: "inline-flex", alignItems: "center", gap: 8, fontFamily: RD_NUM, fontSize: 11, letterSpacing: "0.2em", textTransform: "uppercase", color: RD_TEAL, marginBottom: 16 }}>
        From Club Shape
      </div>
      <h3 style={{ fontFamily: RD_DISP, fontSize: "clamp(36px, 4.6vw, 56px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.95 }}>
        Shape <em style={{ fontStyle: "italic", fontWeight: 600, color: RD_TEAL }}>Sets.</em>
      </h3>
      <p style={{ fontFamily: RD_SANS, fontSize: 16, fontWeight: 500, color: "rgba(242,237,228,0.9)", margin: "20px auto 0", maxWidth: 620, lineHeight: 1.55 }}>
        A virtual concert series broadcast straight from <strong style={{ color: RD_CREAM, fontWeight: 500 }}>Club Shape</strong>, our flagship venue. DJs and live acts, captured on the floor and streamed through Shape Radio.
      </p>
      <div style={{ marginTop: 30, fontFamily: RD_NUM, fontSize: 22, letterSpacing: "0.28em", textTransform: "uppercase", color: RD_TEAL, fontWeight: 500 }}>
        Coming soon
      </div>
      <RdSetsComingUp />
    </div>
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
        canvas, modelUrl: S.noraAssetUrl(S.NORA_MODEL.path, "/"), crowdUrl: S.noraAssetUrl(S.crowdPackPath(S.NORA_MODEL, tier.quality), "/"), portrait: S.NORA_MODEL.portrait,
        skylineUrl: S.noraAssetUrl(S.skylinePath(S.NORA_MODEL, tier.quality), "/"),
        venueUrl: S.clubShapeModelUrl(S.CLUB_SHAPE_MODEL, "/", tier.quality),
        wallLoops: S.wallLoopUrls(tier.quality, { reducedMotion: RD_REDUCED }),
        quality: tier.quality, cinematic: tier.cinematic, fps: tier.fps,
        reducedMotion: RD_REDUCED, onProgress: progress,
      });
    },
  });
  return rdBoothKeeper;
}

// ⚠ THE LIVE ROOM IS A WAY OF LOOKING AT THE CLUB, NOT A BOX OF ITS OWN. It had one (owner,
// 2026-10-15), with a still of the booth's LED wall as its header. Beside Nora's portrait and the
// venue picture the 3D room read as a video game (owner, 2026-11-16: "make it look like the
// pictures, more real"), so the club is shown through its pictures (RadioClub) and this is what
// "Look around" opens in their place: the same booth, kept and released exactly as before.
function RadioNora({ onExit }) {
  const hostRef = React.useRef(null);
  const boothRef = React.useRef(null);
  // Open from the first render: the visitor asked for the live room by choosing Look around.
  const [open, setOpen] = React.useState(true);
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
  // ⚠ NORA'S OWN SET IS NOT A GUEST SET. Its row names her as the DJ, and read as a guest it took
  // her off the decks during her own set. And it is hers on the label only while the server says
  // her engine is on the air (now-playing's `nora`), not merely because the schedule says so: a
  // set whose engine stopped is the station's AutoDJ.
  const noraSet = !!(liveSet && liveSet.host_kind === "nora");
  const guestDj = stationConfigured && liveSet && liveSet.dj && !noraSet ? String(liveSet.dj) : null;
  const noraNow = radio.nowPlaying && radio.nowPlaying.isNora === true && radio.nowPlaying.nora ? radio.nowPlaying.nora : null;
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

  const label = S ? S.boothLabel({ example: !!(snap && snap.example), station: { playing: stationPlaying, bpm: snap && snap.bpm != null ? snap.bpm : (noraNow ? noraNow.bpm : null), guest: guestDj, cueSheet: !!noraNow } }) : { key: "offAir" };
  const labelText = S ? S.boothLabelText(label) : "Off air";
  const lit = label.key !== "offAir";
  const playing = !!(snap && snap.example);
  const free = !!(snap && snap.camera === "free");
  // the side rooms' views (the venue's lounge and bar), each a camera of its own
  const room = snap && (snap.camera === "lounge" || snap.camera === "bar") ? snap.camera : null;
  const showing = state === "open" || state === "opening";
  const chip = (active) => ({
    height: 38, padding: "0 14px", background: active ? "rgba(52,214,197,0.1)" : "transparent",
    border: `1px solid ${active ? RD_TEAL : "rgba(238,243,240,0.24)"}`, color: active ? RD_TEAL : RD_CREAM,
    fontFamily: RD_SANS, fontWeight: 600, fontSize: 13, cursor: "pointer", whiteSpace: "nowrap",
  });
  const tag = { fontFamily: RD_NUM, fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontVariationSettings: "'ROND' 100" };

  return (
    <div data-club-live>
          <div className="rd-booth" style={{ position: "relative", width: "100%", margin: "0 auto", display: showing || state === "failed" || state === "unsupported" ? "block" : "none", border: "1px solid rgba(238,243,240,0.12)", background: "#07080a", overflow: "hidden", textAlign: "left" }}>
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
              <button type="button" aria-pressed={!free && !room} onClick={() => boothRef.current && boothRef.current.setCamera("auto")} style={chip(!free && !room)}>Auto camera</button>
              <button type="button" aria-pressed={free} onClick={() => boothRef.current && boothRef.current.setCamera("free")} style={chip(free)}>Look around</button>
              <button type="button" aria-pressed={room === "lounge"} onClick={() => boothRef.current && boothRef.current.setCamera("lounge")} style={chip(room === "lounge")}>Lounge</button>
              <button type="button" aria-pressed={room === "bar"} onClick={() => boothRef.current && boothRef.current.setCamera("bar")} style={chip(room === "bar")}>Bar</button>
            </div>
          )}
          {state === "open" && allowed && (
            <p style={{ fontFamily: RD_SANS, fontSize: 13, color: RD_CREAM50, margin: "12px auto 0", maxWidth: 560, lineHeight: 1.55 }}>
              The example set&rsquo;s tracks are synthesized in your browser and Nora&rsquo;s mix is
              choreographed on their beat. It is not the Shape Radio stream.
            </p>
          )}
          <div style={{ display: "flex", justifyContent: "center", gap: 10, marginTop: 18 }}>
            <button type="button" onClick={() => { setOpen(false); if (onExit) onExit(); }}
              style={{ height: 44, padding: "0 20px", background: "transparent", border: `1px solid ${RD_TEAL}`, color: RD_TEAL, fontFamily: RD_SANS, fontWeight: 600, fontSize: 13.5, cursor: "pointer", clipPath: "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)" }}>
              ← Back to the pictures
            </button>
            {state === "failed" && (
              <button type="button" onClick={() => setAttempt((n) => n + 1)} style={chip(false)}>Try again</button>
            )}
          </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Club Shape
// ---------------------------------------------------------------------------
//
// ⚠ THE CLUB HAS ONE DOOR. It had none: it lived in a box called Nora, behind "Watch Nora" and a
// "Loading Nora… 37%" line, with its rooms as loose camera chips, and Shape Sets (the club's own
// series) sat in a second box below. This is the one section for all of it: the door (the club
// from the street), the rooms and the grounds as pictures of the club (window.ShapeClubViews,
// clubViews.mjs), the live 3D room under Look around, and what is on.
//
// ⚠ THE PICTURES ARE NOT A FEED, AND THE PAGE SAYS SO. They are stills made from the 3D club's own
// frames and Nora's portrait (marketing/club-shape/views-sources.md). Nothing here says LIVE; the
// station's own state is the one line about what is playing, read off the instrument above.
//
// ⚠ THE ROOMS AND THE GROUNDS ARE SCENERY: no booking, price or availability (clubViews.mjs).
const RD_SR_ONLY = { position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0 };

function RadioClub() {
  const V = window.ShapeClubViews;
  const hostRef = React.useRef(null);
  const stageRef = React.useRef(null);
  const filmRef = React.useRef(null);
  const roomRef = React.useRef(null);     // the room to come back to from the live room
  const tourRef = React.useRef(true);
  const [mode, setMode] = React.useState("door");   // door | film | live
  const [tour, setTour] = React.useState(true);
  const [snap, setSnap] = React.useState({ id: null, status: "loading", auto: false });
  const [seen, setSeen] = React.useState(false);     // a still has been shown at least once
  const [full, setFull] = React.useState(false);
  const [radio, setRadio] = React.useState(() => window.__shapeRadioState || { signedIn: null, configured: null, playing: false });
  React.useEffect(() => {
    const on = (e) => setRadio((e && e.detail) || window.__shapeRadioState || { signedIn: null, configured: null, playing: false });
    window.addEventListener("shape:radiostate", on);
    return () => window.removeEventListener("shape:radiostate", on);
  }, []);

  const live = mode === "live";
  // The film lives as long as its box does: through the door and the rooms, gone while the live
  // room has the stage, and back on the room the visitor left.
  React.useEffect(() => {
    if (live || !V || !V.createClubFilm || !hostRef.current) return undefined;
    const film = V.createClubFilm({
      host: hostRef.current, base: "/", reducedMotion: RD_REDUCED,
      // The room on screen is the one to come back to, whether it was picked or the tour reached it.
      onChange: (s) => { setSnap(s); if (s.status === "shown") { setSeen(true); roomRef.current = s.id; } },
    });
    filmRef.current = film;
    film.setAuto(tourRef.current);
    film.show(roomRef.current || V.CLUB_DOOR);
    const fit = () => film.resize();
    const onFull = () => { setFull(document.fullscreenElement === stageRef.current); film.resize(); };
    window.addEventListener("resize", fit);
    document.addEventListener("fullscreenchange", onFull);
    return () => {
      window.removeEventListener("resize", fit);
      document.removeEventListener("fullscreenchange", onFull);
      film.destroy();
      filmRef.current = null;
    };
  }, [live]);

  // The light keeps the station's tempo only while the station plays and the server sent one.
  const stationPlaying = !!radio.playing;
  const noraNow = radio.nowPlaying && radio.nowPlaying.isNora === true && radio.nowPlaying.nora ? radio.nowPlaying.nora : null;
  const bpm = stationPlaying && noraNow && noraNow.bpm ? noraNow.bpm : null;
  React.useEffect(() => { if (filmRef.current) filmRef.current.setTempo(bpm); }, [bpm, live]);

  const go = (id) => { roomRef.current = id; if (filmRef.current) filmRef.current.show(id); };
  const enter = () => { setMode("film"); go(V.CLUB_FIRST); };
  // Choosing a room is choosing to stay in it: the tour stops until it is asked for again.
  const stay = () => { tourRef.current = false; setTour(false); if (filmRef.current) filmRef.current.setAuto(false); };
  const pick = (id) => { stay(); go(id); };
  const step = (n) => { stay(); go(V.nextClubView(snap.id, n)); };
  const toggleTour = () => { const on = !tourRef.current; tourRef.current = on; setTour(on); if (filmRef.current) filmRef.current.setAuto(on); };
  const toggleFull = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement === el) { if (document.exitFullscreen) document.exitFullscreen(); }
    else if (el.requestFullscreen) el.requestFullscreen().catch(() => {});
  };
  const onKey = (e) => {
    if (mode !== "film") return;
    if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); }
  };

  // The tour moves on by itself, so the rail follows it: the lit room is kept in view by moving
  // the rail alone (scrollIntoView would also move the page under a reader further down it).
  const railRef = React.useRef(null);
  React.useEffect(() => {
    const rail = railRef.current;
    const on = rail && snap.id ? rail.querySelector(`[data-club-room="${snap.id}"]`) : null;
    if (!on) return;
    const left = on.offsetLeft - rail.offsetLeft, right = left + on.offsetWidth;
    if (left < rail.scrollLeft) rail.scrollLeft = Math.max(0, left - 12);
    else if (right > rail.scrollLeft + rail.clientWidth) rail.scrollLeft = right - rail.clientWidth + 12;
  }, [snap.id, mode]);

  const view = V && snap.id ? V.clubView(snap.id) : null;
  const rooms = V ? V.clubRooms() : [];
  const canFull = typeof document !== "undefined" && !!document.fullscreenEnabled;
  const tag = { fontFamily: RD_NUM, fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontVariationSettings: "'ROND' 100" };
  const chip = (active) => ({
    flex: "0 0 auto", height: 40, padding: "0 15px", background: active ? "rgba(52,214,197,0.12)" : "transparent",
    border: `1px solid ${active ? RD_TEAL : "rgba(238,243,240,0.24)"}`, color: active ? RD_TEAL : RD_CREAM,
    fontFamily: RD_SANS, fontWeight: 600, fontSize: 13.5, cursor: "pointer", whiteSpace: "nowrap",
  });
  const round = { width: 44, height: 44, display: "grid", placeItems: "center", background: "rgba(6,9,15,0.55)", border: "1px solid rgba(238,243,240,0.28)", color: RD_CREAM, fontFamily: RD_SANS, fontSize: 20, lineHeight: 1, cursor: "pointer", borderRadius: 22 };
  const shade = "0 1px 2px rgba(0,0,0,0.7), 0 0 18px rgba(0,0,0,0.55)";

  return (
    <section id="club" style={{ padding: "80px 24px 0" }}>
      <RdReveal>
        <div style={{ maxWidth: 1180, margin: "0 auto" }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "14px 40px", marginBottom: 22 }}>
            <div>
              <div style={{ ...tag, color: RD_TEAL, marginBottom: 12 }}>Shape’s virtual venue</div>
              <h2 style={{ fontFamily: RD_DISP, fontSize: "clamp(44px, 6vw, 76px)", letterSpacing: "-0.04em", fontWeight: 300, margin: 0, lineHeight: 0.92 }}>
                Club <em style={{ fontStyle: "italic", fontWeight: 600, color: RD_TEAL }}>Shape.</em>
              </h2>
            </div>
            <p style={{ fontFamily: RD_SANS, fontSize: 15.5, fontWeight: 500, color: "rgba(242,237,228,0.82)", margin: 0, maxWidth: 430, lineHeight: 1.55 }}>
              Nora plays the main room. Walk the floor, take a table, go up to a booth or a private room, step out to the lounge and the bar, or head outside to the pools and the courts.
            </p>
          </div>

          {live ? (
            <RadioNora onExit={() => setMode("film")} />
          ) : (
            <div ref={stageRef} className="rd-club-stage" role="group" aria-roledescription="carousel" aria-label="Club Shape" tabIndex={mode === "film" ? 0 : -1} onKeyDown={onKey}
              style={{ position: "relative", width: "100%", overflow: "hidden", background: "#05070a", border: "1px solid rgba(238,243,240,0.14)", outlineOffset: 3 }}>
              <div ref={hostRef} role="img" aria-label={view ? view.alt : "Club Shape"} style={{ position: "absolute", inset: 0 }} />
              <div aria-live="polite" style={RD_SR_ONLY}>{mode === "film" && view ? view.label : ""}</div>

              {!V && (
                <div style={{ ...tag, position: "absolute", inset: 0, display: "grid", placeItems: "center", padding: 20, textAlign: "center", color: RD_CREAM50 }}>The club couldn’t open on this page. Reload to try again.</div>
              )}
              {V && !seen && snap.status === "loading" && (
                <div style={{ ...tag, position: "absolute", inset: 0, display: "grid", placeItems: "center", color: RD_CREAM50 }}>Opening Club Shape…</div>
              )}

              {mode === "door" && (
                // The picture carries the club's own mark and sign over its entrance, so the door adds
                // one thing to it: the way in, low on the plaza and clear of the sign.
                <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", padding: "24px 24px clamp(22px, 5%, 44px)", textAlign: "center", background: "linear-gradient(180deg, rgba(5,7,10,0) 55%, rgba(5,7,10,0.72))" }}>
                  <button type="button" data-club-enter onClick={enter} disabled={!V}
                    style={{ height: 52, padding: "0 30px", border: 0, background: RD_TEAL, color: "#04110f", fontFamily: RD_SANS, fontWeight: 700, fontSize: 15.5, cursor: "pointer", clipPath: "polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 0 100%)" }}>
                    Step inside →
                  </button>
                </div>
              )}

              {mode === "film" && (
                <React.Fragment>
                  <div aria-hidden style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "42%", background: "linear-gradient(180deg, rgba(5,7,10,0), rgba(5,7,10,0.82))", pointerEvents: "none" }} />
                  <div aria-hidden style={{ position: "absolute", left: 0, right: 0, top: 0, height: "22%", background: "linear-gradient(180deg, rgba(5,7,10,0.6), rgba(5,7,10,0))", pointerEvents: "none" }} />
                  <div style={{ ...tag, position: "absolute", top: 16, left: 18, display: "flex", alignItems: "center", gap: 8, color: stationPlaying ? RD_TEAL : RD_CREAM50, textShadow: shade }}>
                    <span aria-hidden style={{ width: 7, height: 7, borderRadius: 4, flex: "0 0 auto", background: stationPlaying ? RD_TEAL : "transparent", border: `1px solid ${stationPlaying ? RD_TEAL : RD_CREAM50}` }} />
                    <span>{stationPlaying ? "Shape Radio is playing" : "Off air"}</span>
                  </div>
                  {canFull && (
                    <button type="button" onClick={toggleFull} aria-label={full ? "Leave full screen" : "Full screen"} title={full ? "Leave full screen" : "Full screen"} style={{ ...round, position: "absolute", top: 12, right: 14, fontSize: 17 }}>
                      {full ? "×" : "⤢"}
                    </button>
                  )}
                  <div style={{ position: "absolute", left: 18, right: 18, bottom: 16, display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 14 }}>
                    <div style={{ minWidth: 0, textShadow: shade }}>
                      <div style={{ fontFamily: RD_DISP, fontWeight: 500, fontVariationSettings: "'wdth' 105", fontSize: "clamp(24px, 3.2vw, 40px)", letterSpacing: "-0.02em", lineHeight: 1, color: RD_CREAM }}>{view ? view.label : ""}</div>
                      {snap.status === "failed" && (
                        <div role="status" style={{ fontFamily: RD_SANS, fontSize: 13.5, color: RD_HOT, marginTop: 8 }}>That room’s picture didn’t load. Pick another, or try it again.</div>
                      )}
                    </div>
                    <div style={{ display: "flex", gap: 8, flex: "0 0 auto" }}>
                      <button type="button" onClick={() => step(-1)} aria-label="Previous room" style={round}>‹</button>
                      <button type="button" onClick={() => step(1)} aria-label="Next room" style={round}>›</button>
                    </div>
                  </div>
                </React.Fragment>
              )}
            </div>
          )}

          {mode === "film" && (
            <React.Fragment>
              <div ref={railRef} className="rd-club-rail" role="group" aria-label="Rooms" style={{ display: "flex", gap: 8, marginTop: 14, overflowX: "auto", paddingBottom: 4 }}>
                {rooms.map((r) => (
                  <button key={r.id} type="button" data-club-room={r.id} aria-pressed={snap.id === r.id} onClick={() => pick(r.id)} style={chip(snap.id === r.id)}>{r.label}</button>
                ))}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, marginTop: 10 }}>
                <button type="button" aria-pressed={tour} onClick={toggleTour} style={chip(tour)}>{tour ? "■ Stop the tour" : "▶ Take the tour"}</button>
                <button type="button" data-club-live-open onClick={() => setMode("live")} style={chip(false)}>Look around in 3D</button>
              </div>
            </React.Fragment>
          )}

          <p style={{ fontFamily: RD_SANS, fontSize: 13, color: RD_CREAM50, margin: "14px 0 0", maxWidth: 720, lineHeight: 1.55 }}>
            {live
              ? "This is the live 3D room. While the station is not on the air Nora plays a labelled example set; while it is, she moves on what it is playing."
              : "The rooms and grounds are pictures of Club Shape, made with AI from its 3D room, Nora’s portrait and the club’s own pictures. They are not a live feed, and nothing in them is for sale."}
          </p>

          <RdWhatsOn />
        </div>
      </RdReveal>
    </section>
  );
}

// The pitch, only to an account without the station (owner, 2026-11-10: an account is free, and
// Shape Radio is part of the $5 membership). A member, a coach or an admin already has it and sees
// none; a free account is offered the membership, back to this page; a renewal that failed is told
// its card didn't go through, with the billing portal; a visitor is sent to make an account. Nothing
// while the answer is read, or if it never comes: a member is never pitched what they pay for.
function RadioJoin() {
  const m = window.useShapeMembership ? window.useShapeMembership() : null;
  const plans = window.useShapePlans ? window.useShapePlans() : null;
  const [busy, setBusy] = React.useState(false);
  const [err, setErr] = React.useState("");
  const kind = m && window.ShapeMembership ? window.ShapeMembership.lockKind(m) : null;
  if (!kind) return null;
  const M = window.ShapeMembership;
  const go = async (plan) => {
    if (busy) return;
    setBusy(true); setErr("");
    const r = kind === "pastdue" ? await M.portal("/newdesign/Radio.html") : await M.start("/newdesign/Radio.html", plan ? { plan } : undefined);
    if (r && r.code === "already_member" && !r.includedWithCoach) { window.location.reload(); return; }
    if (r && r.error) setErr(r.error);
    if (r) setBusy(false);
  };
  // Monthly, and yearly where it is set up (/api/membership/plans), at their real prices.
  const money = (c) => (M && M.money ? M.money(c) : "$" + c / 100);
  const annual = plans && plans.annual;
  const saving = annual && M && M.annualSaving ? M.annualSaving(plans) : null;
  const cta = { display: "inline-flex", alignItems: "center", height: 46, padding: "0 24px", marginTop: 26, border: 0, background: RD_TEAL, color: "#04110f", fontFamily: RD_SANS, fontWeight: 700, fontSize: 14.5, textDecoration: "none", cursor: busy ? "default" : "pointer", opacity: busy ? 0.65 : 1, clipPath: "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)" };
  const alt = { ...cta, marginLeft: 10, background: "transparent", color: RD_CREAM, border: "1px solid rgba(238,243,240,0.3)" };
  return (
    <section data-radio-join={kind} style={{ padding: "0 24px 110px" }}>
      <RdReveal>
        <div style={{ maxWidth: 760, margin: "0 auto", padding: "clamp(32px,4vw,56px)", border: "1px solid rgba(238,243,240,0.14)", background: "rgba(6,9,15,0.6)", textAlign: "center", clipPath: "polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%)" }}>
          <h2 style={{ fontFamily: RD_DISP, fontWeight: 500, fontVariationSettings: "'wdth' 105", fontSize: "clamp(26px,3vw,38px)", letterSpacing: "-0.02em", margin: 0, color: RD_CREAM }}>
            {kind === "pastdue" ? "Your payment didn’t go through." : "Part of Shape membership."}
          </h2>
          <p style={{ fontFamily: RD_SANS, fontSize: 15, color: "rgba(238,243,240,0.7)", margin: "16px auto 0", maxWidth: 480, lineHeight: 1.6 }}>
            {kind === "pastdue"
              ? "Update your card to get Shape Radio and Nora back. Your account stays as it is."
              : "One live channel, no ads, and the coach playlists that ride on your own sessions. " + (annual ? money(plans.monthly.priceCents) + " a month or " + money(annual.priceCents) + " a year" : "$5 a month") + ", cancel any time. Your Shape account stays free without it, and membership is included while you’re coached on Shape."}
          </p>
          {kind === "signin"
            ? <a href="/newdesign/Landing.html" style={cta}>Join Shape</a>
            : <button type="button" onClick={() => go(annual && kind !== "pastdue" ? "monthly" : null)} disabled={busy} style={cta}>{busy ? (kind === "pastdue" ? "Opening billing…" : "Opening checkout…") : kind === "pastdue" ? "Update your card" : annual ? "Join · " + money(plans.monthly.priceCents) + "/mo" : "Join · $5/month"}</button>}
          {kind === "join" && annual && !busy ? <button type="button" data-plan="annual" onClick={() => go("annual")} style={alt}>{money(annual.priceCents) + "/yr" + (saving ? " · save " + saving + "%" : "")}</button> : null}
          {err ? <p role="alert" style={{ fontFamily: RD_SANS, fontSize: 13.5, color: RD_HOT, margin: "12px 0 0" }}>{err}</p> : null}
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
      <RadioClub />
      <div style={{ height: 96 }} />
      <RadioJoin />
      <Footer />
      <style>{`
        html, body { background: #06090f !important; }
        .radio-page ::selection { background: #34d6c5; color: #04110f; }
        .rd-booth { aspect-ratio: 16 / 9; }
        .rd-club-stage { aspect-ratio: 16 / 9; }
        .rd-club-stage:fullscreen { width: 100vw; height: 100vh; aspect-ratio: auto; border: 0; }
        .rd-club-stage:focus-visible { outline: 2px solid #34d6c5; }
        .rd-club-rail { scrollbar-width: none; }
        .rd-club-rail::-webkit-scrollbar { display: none; }
        @media (max-width: 640px) { .rd-booth { aspect-ratio: 4 / 5; } .rd-club-stage { aspect-ratio: 3 / 4; } }
      `}</style>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<RadioPage />);
