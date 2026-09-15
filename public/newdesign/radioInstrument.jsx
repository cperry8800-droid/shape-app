// radioInstrument.jsx — Shape Radio, the instrument.
//
// The website's Radio page draws the same station the app draws, from the same
// modules: `radioSignalField.mjs` for the bands and the rest state, `radioTempo.mjs`
// for the measured tempo, `radioField.mjs` for the wall, the cloud and the rule that
// decides which of the two the music is lighting. This file is the RENDERER and the
// chrome around it — a canvas, a rail, a deck. It holds no rule of its own.
//
// ─────────────────────────────────────────────────────────────────────────────
// ⚠ NOTHING ON THIS PAGE MOVES WITHOUT A MEASUREMENT.
//
// The page it replaces broke that in four places at once: forty-eight bar heights
// rolled from Math.random() at render, a scrubber reading 28:14 / 48:30 over a
// stream with no position, "◉ Live" over a station that is not broadcasting, and a
// typed `bpm: 132`. The app deleted its own equivalents (demoHr, BSBeatRing) on
// 09-14 for exactly that reason. So here:
//
//   • every bar is an analyser bin, and an analyser that returns nothing draws the
//     rest state rather than an idle animation;
//   • the tempo is `createTempoDetector`'s answer or the em-dash, never a constant;
//   • the four-beat counter steps on that measured tempo or does not step;
//   • there is no scrubber, because a non-interactive stream has no position (and
//     the licence the stream runs under forbids seeking anyway);
//   • there is no listener count, because no provider reports one.
//
// ⚠ AND THE ONE SYNTHESISED THING SAYS SO IN THE RAIL. A visitor previewing the
// page with no account sees a LABELLED example station — `previewSimOn` /
// `previewBins`, the app's own rule since #2095 — and the rail reads
// "Preview · Example signal" IN PLACE OF the On air claim rather than under it.
// A member sees their own station or an honest rest state, never the simulation.

const RD_TEAL = "#34d6c5";        // the app's pair, not the page's old #0ac5a8
const RD_TEAL_D = "#0a8f87";
const RD_HOT = "#e0a24a";
const RD_BG = "#06090f";
const RD_DISP = "'Anybody', 'Anybody Fallback', system-ui, sans-serif";
const RD_NUM = "'Doto', 'Doto Fallback', ui-monospace, monospace";
const RD_SANS = "'Schibsted Grotesk', 'Schibsted Fallback', system-ui, sans-serif";
const RD_CREAM = "#eef3f0";
const RD_CREAM50 = "rgba(238,243,240,0.55)";
const RD_CREAM30 = "rgba(238,243,240,0.34)";

const RD_REDUCED = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
const RD_REDUCED_FPS = 4;   // the app's own reduced-motion cadence

// ⚠ THE MODULES ARE LOADED AS REAL ES MODULES BY THE PAGE and handed over on
// `window`, the ShapeSetsLib precedent. They are guarded at every use rather than
// assumed: a browser holding a stale cached copy would have some exports and not
// others, and calling through would throw inside a render instead of degrading.
const rdLib = () => {
  const F = typeof window !== "undefined" ? window.ShapeRadioField : null;
  const S = typeof window !== "undefined" ? window.ShapeSignalField : null;
  const T = typeof window !== "undefined" ? window.ShapeRadioTempo : null;
  if (!F || !S || !T) return null;
  if (!F.cloudForm || !F.leadTarget || !S.bandsFromBins || !T.createTempoDetector) return null;
  return { F, S, T };
};

function rdRgba(hex, a) {
  const h = String(hex).replace("#", "");
  const n = parseInt(h.length === 3 ? h.split("").map((c) => c + c).join("") : h, 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}

function rdClock(s) {
  if (!Number.isFinite(s) || s < 0) return "0:00";
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s - m * 60)).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// The station — one audio element, one analyser, the real routes
// ---------------------------------------------------------------------------
// ⚠ THE DECK'S FOUR ANSWERS ARE THE APP'S, not a second opinion:
// signed out → the key is disabled under "Sign in to listen"; playing → Pause;
// paused or never started → Tune in. `/api/radio/station` answers 401 to an
// anonymous caller BY DESIGN, so a visitor learns nothing about the stream — the
// page must therefore decide "signed out" from the session, not from that refusal.

// ⚠ THREE STATES, NOT TWO, AND THE MIDDLE ONE MUST NOT ACCUSE. `signedIn` is false
// only for a visitor `/api/me` MEASURED as having no account; it is null when that
// read did not complete. Collapsing null into "signed out" tells a member with a
// blip to sign in — the defect this repo post-mortems on #2005, where a coach who
// was already signed in was shown a sign-in prompt. So an unresolved session gets
// the ordinary key and TRIES.
//
// ⚠ AND WHAT COMES BACK IS NOT A SECOND MEASUREMENT OF THE SESSION, WHICH A FIRST
// DRAFT OF THIS CLAIMED FOUR LINES BELOW THE PARAGRAPH THAT HAD IT RIGHT (Codex,
// #2101). It read "the ATTEMPT settles it … and that answer is a measurement",
// directly under the line above saying the page must decide signed-out from the
// session and NOT from that refusal. The paragraph was correct and its own
// because-clause overruled it. `/api/radio/station`'s 401 carries exactly the
// ambiguity `/api/me`'s does — see `play()` — so nothing it answers may move
// `signedIn`. A refusal is a fact about THIS ATTEMPT and is kept retryable.
function rdTransportKey({ signedIn, playing, paused }) {
  if (signedIn === false) return "signin";
  if (playing && !paused) return "pause";
  return "tune";
}

function useRadioStation() {
  const [signedIn, setSignedIn] = React.useState(null);   // null = not resolved yet
  const [playing, setPlaying] = React.useState(false);
  const [configured, setConfigured] = React.useState(null); // null = unread
  const [refusal, setRefusal] = React.useState(null);        // null | "signin" | "age" | "unavailable"
  const [nowPlaying, setNowPlaying] = React.useState(null);
  const audioRef = React.useRef(null);
  const analyserRef = React.useRef(null);
  const binsRef = React.useRef(null);
  const startedAtRef = React.useRef(null);
  const attemptRef = React.useRef(0);
  const tokenRef = React.useRef(null);

  // The session, and it lives in TWO stores rather than one (Codex, round 10).
  // `/api/me` reads the Next.js cookie and NOTHING else — it calls `createClient()`
  // with no request, so it has no way to see a session held in `shape.auth`, which is
  // this site's own localStorage store. A member signed in through a legacy or static
  // page has exactly that: `supabase.js` copies it into the cookie from
  // `applyNavAuthState()`, and that POST is FIRE-AND-FORGET, so nothing orders it
  // against this read. Asking the cookie alone therefore answered `{user:null}` for a
  // real member — and because this effect runs once with empty deps, that verdict was
  // PERMANENT: the key read "Sign in to listen" and they were handed the visitor
  // preview for the life of the page. The retired player did not have this defect; it
  // asked `shapeDb.getSession()` and sent the bearer, and the rewrite dropped both.
  //
  // `getSession()` is the UNION of the two stores — it returns the SDK session, and
  // bootstraps one FROM the cookie bridge when localStorage is empty — so a session it
  // returns is authoritative. A NULL from it is not: it answers null for a real visitor
  // and for a bridge that failed alike, which is the same two-answers-one-value trap
  // this file has now paid for at `/api/me`, at the station route and at the schedule.
  // So `/api/me` still arbitrates the null case and the three-state rule is untouched:
  // 200 {user:null} is measured signed-out, 503 is a read that did not complete, and
  // this page keeps `null` for "could not tell" rather than presenting a member with
  // the preview.
  React.useEffect(() => {
    let on = true;
    (async () => {
      try {
        const session = window.shapeDb ? await window.shapeDb.getSession() : null;
        if (!on) return;
        if (session && session.access_token) {
          // ⚠ HELD FOR THE STATION FETCH, which the retired player authorized the same
          // way. `/api/radio/station` resolves through `currentUser()`, which accepts a
          // Bearer token OR the cookie — so without the token a cookie-less member is
          // answered by the route's own 401 and the key refuses somebody who is signed
          // in. Knowing they are a member is only half of it; the request has to say so.
          tokenRef.current = session.access_token;
          setSignedIn(true);
          return;
        }
      } catch (e) { /* fall through — the SDK is never the arbiter of "no" */ }
      if (!on) return;
      try {
        const r = await fetch("/api/me", { cache: "no-store", credentials: "include" });
        if (!r.ok) { if (on) setSignedIn(null); return; }   // could not tell: not "signed out"
        const d = await r.json();
        if (on) setSignedIn(!!(d && d.user));
      } catch (e) { if (on) setSignedIn(null); }
    })();
    return () => { on = false; };
  }, []);

  // Now playing — the same route and the same 15 s interval as the app.
  React.useEffect(() => {
    let on = true;
    // ⚠ THE SAME SUPERSEDE RULE AS `play()`, WHICH I APPLIED THERE AND NOT HERE
    // (Codex, round 8). A poll still pending when the 15 s interval fires again leaves
    // two in flight; if the newer returns first, the older lands afterwards, sees
    // `on === true` and overwrites the current track — driving radioProgram with
    // metadata that is already known to be stale, until some later poll happens to
    // correct it.
    let seq = 0;
    const tick = () => { const mine = (seq += 1); return fetch("/api/radio/now-playing", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      // ⚠ A SIMULATED PAYLOAD IS NOT A TRACK. The route marks the mock provider's fixed
      // 'Tempo Lift / Shape Radio' — and any lookup it could not complete — as simulated,
      // and this page publishes neither: the title would be an invented reading under
      // "Now playing" and it would drive the field's own programme (Codex, round 5).
      .then((d) => { if (on && mine === seq) setNowPlaying(d && !d.simulated && (d.title || d.artist) ? d : null); })
      // ⚠ AND A POLL THAT NEVER LANDED CLEARS IT TOO (Codex, round 6). This was an empty
      // catch, so a successful poll followed by a dropped connection left the LAST title
      // on screen under "Now playing" indefinitely — and feeding trackRef, so the field's
      // programme went on following a song we could no longer confirm was playing. The
      // non-ok arm one line up already clears for exactly this reason, which is what made
      // the catch the odd one out rather than a judgement call: a reading we cannot take
      // is not a reading, whichever way the attempt failed.
      .catch(() => { if (on && mine === seq) setNowPlaying(null); }); };
    tick();
    const id = setInterval(tick, 15000);
    return () => { on = false; clearInterval(id); };
  }, []);

  // ⚠ THE LOCK SCREEN IS A SECOND SURFACE FOR THE SAME CLAIM, AND THE REWRITE DROPPED IT
  // (Codex, round 10). The retired player assigned `navigator.mediaSession.metadata` from
  // every now-playing response, so a member with the phone locked read the track and the
  // artist on their system controls. This page updated React state and nothing else, so
  // retiring /radio.html retired that with it — shipped behaviour lost in a rewrite rather
  // than a decision anybody took.
  //
  // ⚠ AND IT CLEARS ON THE HONEST EMPTY, which is why this is an effect on `nowPlaying`
  // rather than a line inside the poll's success arm. `nowPlaying` is null for a SIMULATED
  // payload and for a poll that never landed, and a stale title on a lock screen is the same
  // false claim as a stale title on the page — worse, because the page's own correction is
  // not on screen beside it. Both surfaces are driven by the one value, so they cannot come
  // to disagree about what is playing.
  //
  // ⚠ NO INVENTED FALLBACK. The retired player defaulted the title to "Shape Radio" and the
  // artist to "Live"; the first is the PRODUCT'S OWN NAME and also the mock provider's
  // artist string, which is the ambiguity round 5's control had to work around — a leak
  // would have read exactly like an honest empty. Only what was measured is published.
  //
  // ⚠ METADATA ONLY, NO ACTION HANDLERS, DELIBERATELY. The retired page installed play/pause
  // handlers unconditionally, and its `play` handler is recorded in docs/WORKLOG.md as the
  // one of that file's six `play()` call sites carrying neither a station guard nor a
  // `.catch`. With no handler the browser drives the element itself, which is correct here;
  // restoring them is a behaviour change this PR is not about.
  React.useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return undefined;
    const ms = navigator.mediaSession;
    const clear = () => { try { ms.metadata = null; } catch (e) {} };
    if (!nowPlaying) { clear(); return undefined; }
    if (typeof window.MediaMetadata !== "function") return undefined;
    try {
      ms.metadata = new window.MediaMetadata({
        title: nowPlaying.title || "",
        artist: nowPlaying.artist || "",
        album: "Shape Radio",
      });
    } catch (e) { /* the API is present and refused the payload — say nothing rather than guess */ }
    return clear;
  }, [nowPlaying]);

  const ensureGraph = React.useCallback(() => {
    if (analyserRef.current || !audioRef.current) return;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const src = ctx.createMediaElementSource(audioRef.current);
      const an = ctx.createAnalyser();
      an.fftSize = 512;                 // 256 bins — the app's own analyser size
      an.smoothingTimeConstant = 0.78;
      src.connect(an);
      an.connect(ctx.destination);
      analyserRef.current = an;
      binsRef.current = new Uint8Array(an.frequencyBinCount);
      // ⚠ PARKED FOR NORA'S BOOTH, WHICH IS AN ES MODULE AND CANNOT SEE THIS SCOPE.
      // The old player did the same thing for the same reason: a second
      // createMediaElementSource on one <audio> element throws, so the booth must be
      // handed the graph rather than building its own.
      window.__shapeRadioGraph = { analyser: an, context: ctx };
      // ⚠ AND IT ANNOUNCES ITSELF, because the booth may already be open and holding a
      // null (Codex, round 8). The global alone is a handoff only for whoever looks
      // AFTER it is set; Nora's booth looks when it opens, which is very often first.
      try { window.dispatchEvent(new CustomEvent("shape:radiograph", { detail: window.__shapeRadioGraph })); } catch (e) {}
    } catch (e) {
      // ⚠ A STREAM WITHOUT CORS HEADERS TAINTS THE GRAPH and every bin reads zero.
      // That is a real state with its own honest line on the page ("No signal data
      // from the channel"), not a failure to hide.
      analyserRef.current = null;
    }
  }, []);

  const play = React.useCallback(async () => {
    // ⚠ NOT `if (!signedIn)`. That is false for BOTH a measured signed-out visitor and
    // an unresolved read, and on the second it made the key a control that silently
    // did nothing. A measured signed-out visitor never gets here (the key is disabled);
    // an unresolved one tries, and the station's own answer names what to do next
    // WITHOUT deciding who they are.
    if (signedIn === false) return false;

    // ⚠ EVERY PRESS SUPERSEDES THE ONE BEFORE IT, AND THE KEY BEING RETRYABLE IS
    // WHAT MADE THAT NECESSARY (Codex, #2101). `!audio.src` gates the fetch, so two
    // presses during one slow round trip BOTH reach it — and with nothing sequencing
    // them, the newer request could succeed and start playback while the older one
    // came back 401 a moment later and painted a refusal over a station that was
    // already on air. The same race let a stale response assign `audio.src` a second
    // time, which reloads an element mid-play. A superseded attempt now writes
    // nothing at all: not the refusal, not `configured`, not the source.
    const attempt = (attemptRef.current += 1);
    const isCurrent = () => attemptRef.current === attempt;
    // ⚠ AND IT CLEARS BOTH OF THE LAST ONE'S VERDICTS, NOT JUST THE REFUSAL (Codex,
    // round 3). `configured` outlived the attempt that produced it, so a listener who
    // got {configured:false} and pressed again could be shown the new attempt's
    // refusal AND "No station on the air yet" at the same time — two answers to one
    // press. A previous draft of this comment called those mutually exclusive by
    // construction; they were not, because only one of the two was being reset.
    setRefusal(null);
    setConfigured(null);

    let audio = audioRef.current;
    if (!audio) {
      audio = new Audio();
      audio.crossOrigin = "anonymous";  // required, or the analyser reads zeros
      audio.preload = "none";
      // ⚠ A STREAM CAN STOP WITHOUT PAUSING, AND ONLY `pause` WAS LISTENED FOR
      // (Codex, #2101 round 4). `ended` and a fatal media `error` both end playback
      // and neither necessarily emits `pause` — so the rail went on reading "On air",
      // the session clock went on counting, and the key went on offering Pause for a
      // member hearing nothing. That is #2076's P1 exactly, reached from the far end:
      // the clock is stamped where playback STARTED and nothing was stopping it where
      // playback ENDED.
      const stopped = (bad) => {
        setPlaying(false);
        startedAtRef.current = null;
        if (!bad) return;
        setRefusal("unavailable");
        // ⚠ AND THE CACHED SOURCE IS DROPPED, or the recovery is unreachable: the
        // fetch is gated on `!audio.src`, so a stale or dead URL would make every
        // later press skip the station entirely and fail the same way forever.
        // removeAttribute alone, with no load() — assigning a new src later runs
        // the resource selection itself, and calling load() here risks re-entering
        // this very handler.
        if (audio.src) audio.removeAttribute("src");
      };
      audio.addEventListener("play", () => setPlaying(true));
      audio.addEventListener("playing", () => setPlaying(true));
      audio.addEventListener("pause", () => stopped(false));
      audio.addEventListener("ended", () => stopped(true));
      audio.addEventListener("error", () => stopped(true));
      audioRef.current = audio;
    }
    if (!audio.src) {
      try {
        // ⚠ THE BEARER, WHEN WE HAVE ONE (Codex, round 10). `credentials: "include"`
        // carries the COOKIE, and a member whose session lives only in `shape.auth`
        // has no current cookie to carry — so this route's `currentUser()` found
        // nobody and answered its own 401 to somebody who is signed in. The retired
        // player sent this header for exactly that reason. It is omitted rather than
        // sent empty when there is no SDK session, so a cookie-only member is
        // unchanged and an anonymous visitor still gets the honest 401.
        const headers = {};
        if (tokenRef.current) headers.Authorization = "Bearer " + tokenRef.current;
        const r = await fetch("/api/radio/station", { cache: "no-store", credentials: "include", headers });
        // ⚠ A STATION REFUSAL IS NOT A SESSION MEASUREMENT, AND THIS LINE USED TO
        // TREAT IT AS ONE — `setSignedIn(false)` on either status (Codex, #2101).
        // BOTH legs of that were wrong, and each strands somebody:
        //
        //   • 401 is NOT "anonymous". `currentUser()` destructures `{ data }` and
        //     DROPS the error, and the Supabase client resolves rather than throws
        //     on an auth-server fault — so this route answers 401 for a transient
        //     lookup failure exactly as it does for a real visitor. That is the
        //     same ambiguity `/api/me` has, i.e. the thing the three-state rule at
        //     the top of this file exists for, arriving through a second door.
        //   • 403 is `refuseKnownMinor`: a CONFIRMED MINOR, who is signed IN. It is
        //     a measurement of AGE and says nothing at all about the session.
        //
        // Setting `signedIn = false` on either disabled the key with no way back
        // but a reload AND started the visitor preview — so a real member lost
        // playback to a blip, and an under-18 account was shown a SIMULATED
        // broadcast. Only `/api/me` decides the session. This decides the attempt,
        // it says which one it was, and because `audio.src` is still unset the very
        // next press re-runs the whole fetch: retryable by construction.
        if (!isCurrent()) return false;
        if (r.status === 401) { setRefusal("signin"); return false; }
        if (r.status === 403) { setRefusal("age"); return false; }
        // ⚠ AND EVERY OTHER NON-OK ANSWER IS AN ATTEMPT WE COULD NOT COMPLETE, NOT A
        // FACT ABOUT THE BROADCAST (Codex, round 3). `fetch` RESOLVES on an HTTP
        // error, so the catch below never runs for one — which meant the previous
        // round removed the false "No station on the air yet" from the rejected-fetch
        // door and left it standing in this one. The route's own 503 (its membership
        // check faulting, documented in its header as failing CLOSED) and its 402
        // both came through here and were published as "no station".
        //
        // ⚠ THE 402 IS DELIBERATELY NOT GIVEN ITS OWN SENTENCE HERE. A signed-in
        // non-member needs a join prompt, and what that says is an OWNER copy call
        // already open in the war room. What this fixes is the lie: "we could not
        // complete that" is true of a 402, where "there is no station" is not.
        if (!r.ok) { setRefusal("unavailable"); return false; }
        const cfg = await r.json();
        if (!isCurrent()) return false;               // .json() is a second await
        setConfigured(!!(cfg && cfg.configured));
        if (!cfg || !cfg.configured || !cfg.streamUrl) return false;
        audio.src = cfg.streamUrl;
      } catch (e) {
        // ⚠ A FETCH THAT NEVER LANDED IS NOT EVIDENCE THERE IS NO STATION, and this
        // used to answer `setConfigured(false)` — which renders "No station on the
        // air yet", a claim about the broadcast made from a failure of our own
        // network. `configured` stays unread and the deck says what actually
        // happened.
        if (!isCurrent()) return false;
        setRefusal("unavailable");
        return false;
      }
    }
    ensureGraph();
    try {
      if (analyserRef.current && analyserRef.current.context && analyserRef.current.context.state === "suspended") {
        await analyserRef.current.context.resume();
      }
      await audio.play();
      if (!isCurrent()) return false;   // a newer press owns the clock
      // ⚠ STAMPED WHERE PLAYBACK STARTED, NOT WHERE IT WAS ASKED FOR. The app shipped
      // the other version and the rail counted a session clock upward for a member
      // hearing nothing (#2076's P1).
      startedAtRef.current = performance.now() / 1000;
      return true;
    } catch (e) {
      // ⚠ A REJECTED play() USED TO RETURN IN SILENCE, AND THE SOURCE SURVIVED IT
      // (Codex, #2101 round 4). WebKit refusing the first play after a fetch, an
      // unsupported stream, a provider fault — all land here, and because the
      // station fetch is gated on `!audio.src` every later press skipped it and
      // failed identically. A live-looking key that can never work again, with
      // nothing on screen saying why, until the page is reloaded.
      if (!isCurrent()) return false;            // a newer press owns the verdict
      setRefusal("unavailable");
      if (audio.src) audio.removeAttribute("src");
      return false;
    }
  }, [signedIn, ensureGraph]);

  const pause = React.useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    startedAtRef.current = null;
  }, []);

  React.useEffect(() => () => { if (audioRef.current) audioRef.current.pause(); }, []);

  return { signedIn, playing, configured, nowPlaying, refusal, play, pause, analyserRef, binsRef, startedAtRef };
}

// ---------------------------------------------------------------------------
// The field — the wall and the cloud, composed
// ---------------------------------------------------------------------------
// The wall is the room and the cloud is the light in it: both are always on screen
// and the lead crossfades between them. Everything decided here comes out of
// radioField.mjs; what this function owns is fills and arcs.

function rdMakeField(canvas, lib) {
  const { F, S } = lib;
  const N = F.CLOUD_N;
  const pos = new Float32Array(N * 3);
  const from = new Float32Array(N * 3);
  const to = new Float32Array(N * 3);
  let curForm = -1;
  let morphAt = -1e9;
  let mask = null;
  let mw = 0;
  let mh = 0;
  let meters = new Float32Array(0);
  let mx = 0;
  let my = 0;

  canvas.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    if (!r.width || !r.height) return;
    mx = (e.clientX - r.left) / r.width - 0.5;
    my = (e.clientY - r.top) / r.height - 0.5;
  });

  // The wordmark burnt through the tiles, rendered once per grid size into an
  // offscreen mask rather than measured per frame.
  function buildMask(cols, rows) {
    mw = cols; mh = rows;
    if (!(mw > 0 && mh > 0)) { mask = null; return; }
    const m = document.createElement("canvas");
    m.width = mw; m.height = mh;
    const c = m.getContext("2d");
    if (!c) { mask = null; return; }
    c.fillStyle = "#000"; c.fillRect(0, 0, mw, mh);
    c.fillStyle = "#fff";
    const word = F.wallMaskText(mw);
    let fs = Math.floor(mh * 0.42);
    c.font = `600 ${fs}px ${RD_DISP}`;
    while (fs > 4 && c.measureText(word).width > mw * 0.88) {
      fs -= 1;
      c.font = `600 ${fs}px ${RD_DISP}`;
    }
    c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText(word, mw / 2, mh * 0.46);
    mask = c.getImageData(0, 0, mw, mh).data;
  }

  return function draw(ctx, W, H, sig, st, t) {
    const p = sig.program;
    const cols = F.wallCols(W);
    const rows = F.wallRows(H);
    if (!cols || !rows) return;                 // a hidden fold has a 0x0 canvas
    if (!mask || mw !== cols || mh !== rows) buildMask(cols, rows);
    if (!mask) return;
    if (meters.length !== cols) meters = new Float32Array(cols);

    const wl = st.wl;
    const wmix = F.wallMix(wl);
    const cmix = F.cloudMix(wl);
    const kick = (RD_REDUCED ? 0 : sig.kick) * (sig.kickPresent ? 1 : 0);

    ctx.fillStyle = RD_BG;
    ctx.fillRect(0, 0, W, H);

    // ── the wall ──
    for (let c = 0; c < cols; c += 1) {
      const band = F.wallBand(c, cols, S.BANDS);
      const v = sig.hasSig ? sig.sm[band] : 0;
      meters[c] = F.meterNext(meters[c], v);
    }
    const litFull = sig.hasSig ? 0.25 + 0.55 * Math.min(1, (sig.rms || 0) * 2) : 0.14;
    for (let r = 0; r < rows; r += 1) {
      for (let c = 0; c < cols; c += 1) {
        const lit = mask[(r * mw + c) * 4] > 128;
        const level = meters[c] * F.WALL_METER_SPAN;
        const fromBottom = (rows - 1 - r) / rows;
        const on = fromBottom < level;
        const flood = F.wallFloods(r, rows, p.flood, kick);
        let a = F.WALL_GROUND_ALPHA;
        let col = RD_TEAL;
        if (on) {
          a = (0.35 + 0.55 * (1 - fromBottom / Math.max(level, 0.01))) * wmix.meter;
          col = fromBottom > level * 0.8 ? RD_HOT : RD_TEAL;
        }
        if (flood) { a = Math.max(a, kick * 0.8 * wmix.flood); col = RD_HOT; }
        if (lit) {
          a = Math.max(a, 0.14 + (litFull - 0.14) * wmix.mask);
          if (on) col = RD_HOT;
        }
        ctx.fillStyle = rdRgba(col, Math.min(1, a));
        ctx.fillRect(c * F.TILE_PX + 2, r * F.TILE_PX + 2, F.TILE_PX - F.TILE_GAP_PX, F.TILE_PX - F.TILE_GAP_PX);
      }
    }

    // ── the cloud, in front of the wall ──
    const want = F.cloudForm(p, sig.phrase, st.cloudTurns);
    if (want !== curForm) {
      if (curForm < 0) F.placeForm(want, pos);
      else { from.set(pos); F.placeForm(want, to); morphAt = t; }
      curForm = want;
      if (canvas.parentElement) canvas.parentElement.dataset.form = String(curForm);
    }
    const m = Math.min(1, (t - morphAt) / F.MORPH_S);
    if (m < 1) {
      const e = F.morphEase(m);
      for (let i = 0; i < N * 3; i += 1) pos[i] = from[i] + (to[i] - from[i]) * e;
    } else if (morphAt > -1e8) { pos.set(to); morphAt = -1e9; }

    const k = S.fieldK(sig.kx, RD_REDUCED ? 0 : sig.kick);
    // ⚠ A SWING, NOT A TURN. Four of the eight figures are flat, and a flat figure
    // seen edge-on is a line — a full rotation makes the cloud disappear twice a
    // cycle for exactly half of the formations.
    const ang = (RD_REDUCED ? 0 : Math.sin(t * 0.21) * 0.7) + mx * 0.9;
    const tilt = 0.48 + my * 0.5;
    const R = Math.min(W, H) * 0.36;
    const cx = W * 0.62;
    const cy = H * 0.48;
    const pts = [];
    const ca = Math.cos(ang); const sa = Math.sin(ang);
    const ct = Math.cos(tilt); const stt = Math.sin(tilt);
    for (let i = 0; i < N; i += 1) {
      const x = pos[i * 3]; const y = pos[i * 3 + 1]; const z = pos[i * 3 + 2];
      const xr = x * ca - z * sa;
      let zr = x * sa + z * ca;
      const yr = y * ct - zr * stt;
      zr = y * stt + zr * ct;
      const persp = 1 / (1.9 - zr * 0.7);
      pts.push([cx + xr * R * persp, cy + yr * R * persp, persp, i % S.BANDS]);
    }
    pts.sort((a, b) => a[2] - b[2]);
    for (let i = 0; i < pts.length; i += 1) {
      const px = pts[i][0]; const py = pts[i][1]; const persp = pts[i][2]; const b = pts[i][3];
      const v = sig.hasSig ? sig.sm[b] : 0;
      const a = (sig.hasSig ? 0.12 + S.fieldAlpha(v, k) : S.fieldAlpha(v, k)) * (0.55 + 0.45 * persp) * cmix.light;
      const rad = (S.fieldRadius(v, k) + 0.9) * persp * 1.25 * cmix.size;
      ctx.fillStyle = rdRgba(v > 0.7 ? RD_HOT : RD_TEAL, Math.min(1, a));
      ctx.beginPath();
      ctx.arc(px, py, Math.max(0.2, rad), 0, Math.PI * 2);
      ctx.fill();
    }

    // A change of track is an event rather than a swap: one hot line crosses the
    // whole fold in the second after it.
    const dt = t - sig.changeAt;
    if (dt >= 0 && dt < 1.2) {
      ctx.fillStyle = rdRgba(RD_HOT, 1 - dt / 1.2);
      ctx.fillRect(W * (dt / 1.2) - 1, 0, 2, H);
    }

    // ⚠ THE SCRIMS ARE LOAD-BEARING, NOT DECORATION. The chrome is 8px mono over a
    // grid of tiles; without a fade above and below the figure the type is a
    // legibility problem rather than a texture.
    // ⚠ THE LOWER SCRIM REACHES FURTHER THAN THE UPPER ONE, because the meters rise
    // FROM the bottom: the rows the deck and the Now block sit on are the brightest
    // on the wall, and at the symmetric ramp the type was legible only where the
    // spectrum happened to be quiet. Driven at 1440x900 and 390 before it moved.
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "rgba(6,9,15,0.86)");
    g.addColorStop(0.2, "rgba(6,9,15,0)");
    g.addColorStop(0.46, "rgba(6,9,15,0)");
    g.addColorStop(0.78, "rgba(6,9,15,0.72)");
    g.addColorStop(1, "rgba(6,9,15,0.95)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
  };
}

// ---------------------------------------------------------------------------
// The instrument
// ---------------------------------------------------------------------------

function RadioInstrument() {
  const st = useRadioStation();
  const wrapRef = React.useRef(null);
  const canvasRef = React.useRef(null);
  // Everything the chrome prints, updated from the frame loop through one throttled
  // setState rather than sixty a second.
  const [read, setRead] = React.useState({
    bpm: null, lit: 0, step: null, clock: 0, hasSig: false, preview: false, lead: "wall", noSig: false,
  });
  const readRef = React.useRef(read);
  const modeRef = React.useRef("drop");
  // ⚠ THE LOOP READS THIS REF, NOT THE CLOSURE. The field effect has empty deps —
  // it builds one canvas and one detector for the life of the page — so everything
  // it captured is frozen at mount, when the session is still unresolved and nothing
  // is playing. Re-pointed on every render, which is what makes the preview, the
  // clock and the deck follow the state rather than the first frame.
  const liveRef = React.useRef(st);
  liveRef.current = st;

  const track = st.nowPlaying;
  const title = track && track.title ? track.title : null;
  const artist = track && track.artist ? track.artist : null;
  // ⚠ THE SAME LIVE-REF RULE AS `liveRef` ABOVE, AND IT WAS MISSED HERE (Codex,
  // #2101). `applyTrack` is declared inside the field effect, whose deps are `[]`,
  // so it closed over the title and artist of the MOUNT render — both null, because
  // now-playing is a fetch. The `[title, artist]` effect then called that same stale
  // function, so its key was "·" forever, `sig.trackKey` matched on every call, and
  // the programme, the figure sweep and the beat reset never once followed the song
  // — while the chrome, which reads these at render, displayed the real track. The
  // page looked right and the field was deaf to it.
  const trackRef = React.useRef({ title, artist });
  trackRef.current = { title, artist };

  React.useEffect(() => {
    const lib = rdLib();
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!lib || !canvas || !wrap) return undefined;
    const { F, S, T } = lib;
    const ctx = canvas.getContext("2d");
    if (!ctx) return undefined;

    const draw = rdMakeField(canvas, lib);
    const det = T.createTempoDetector();
    const sig = {
      bins: new Uint8Array(S.BAND_BINS * 4),
      simBins: null,
      sm: new Array(S.BANDS).fill(0),
      pk: new Array(S.BANDS).fill(0),
      frame: null,
      rms: 0, lit: 0, kick: 0, kx: 0, hasSig: false,
      kickEnv: 0, kickPresent: false,
      beats: { beats: 0, lastStep: null }, phrase: 0,
      program: F.radioProgram(null, null),
      changeAt: -1e9,
      trackKey: null,
    };
    const lead = { wl: 1, cloudTurns: 0, lastTarget: null };

    let raf = 0;
    let last = 0;
    let lastT = null;
    let lastPush = 0;
    const t0 = performance.now() / 1000;

    const box = { w: 0, h: 0 };
    const resize = () => {
      const r = wrap.getBoundingClientRect();
      box.w = r.width; box.h = r.height;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.max(1, Math.round(r.width * dpr));
      canvas.height = Math.max(1, Math.round(r.height * dpr));
      canvas.style.width = `${r.width}px`;
      canvas.style.height = `${r.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const t = now / 1000 - t0;
      const dt = lastT == null ? 1 / 60 : Math.max(0, t - lastT);
      lastT = t;

      // ── the frame's own reading ──
      const live = liveRef.current;
      const an = live.analyserRef.current;
      const buf = live.binsRef.current;
      let bins = sig.bins;
      let real = false;
      if (an && buf) {
        an.getByteFrequencyData(buf);
        bins = buf;
        real = S.hasSignal(buf);
      } else {
        sig.bins.fill(0);
      }
      // ⚠ THE PREVIEW RUNS ONLY FOR A VISITOR WITH NO ACCOUNT AND ONLY OVER A FRAME
      // THAT CARRIED NOTHING — `previewSimOn`, the app's own named rule, so the two
      // clauses cannot be lost to an edit. Its buffer is its own, so a simulated
      // frame can never be written into the one the analyser reads into.
      const preview = live.signedIn === false;
      if (S.previewSimOn(preview, real)) {
        if (!sig.simBins) sig.simBins = new Uint8Array(S.PREVIEW_BINS);
        bins = S.previewBins(sig.simBins, t);
      }
      sig.frame = bins;              // what THIS frame carried, for the wall's meters
      sig.hasSig = S.hasSignal(bins);

      const raw = S.bandsFromBins(bins, S.BANDS);
      for (let i = 0; i < S.BANDS; i += 1) {
        sig.sm[i] = S.smoothBand(sig.sm[i], raw[i]);
        sig.pk[i] = S.peakBand(sig.pk[i], sig.sm[i]);
      }
      sig.rms = S.railRms(bins);
      sig.lit = S.railBarsLit(sig.rms, S.RAIL_BARS);

      // the tempo: pushed at the analyser's own rate, read every frame
      const playing = live.playing || S.previewSimOn(preview, real);
      const e = T.tempoEnergyFromBins(bins);
      if (playing && e != null && t - lastPush > 0.008) { det.push(t, e); lastPush = t; }
      const tempo = playing ? det.read(t) : null;
      sig.kick = tempo ? tempo.kick : 0;
      // ⚠ kx IS 0 AND STAYS 0. In the app it is the crossfade between Listening and
      // Matching — 0 while listening, 1 while the two rows are up — and the website
      // has no matching state, because a heart-rate strap over Web Bluetooth is its
      // own ruling. Feeding it anything else here would make the field brighter than
      // the app's for the same audio.
      sig.kx = 0;

      // the phrase — counted off the detector's own step, so a breakdown holds it
      sig.beats = F.countBeat(sig.beats, tempo ? tempo.step : null);
      sig.phrase = F.phraseOf(sig.beats.beats);

      // the lead
      sig.kickEnv = F.kickEnvNext(sig.kickEnv, F.kickLow(bins), dt);
      sig.kickPresent = F.kickPresentNext(sig.kickPresent, sig.kickEnv);
      const target = F.leadTarget(modeRef.current, sig.hasSig, sig.kickPresent, sig.program.wallLeads);
      if (target === 0 && lead.lastTarget !== null && lead.lastTarget !== 0) lead.cloudTurns += 1;
      lead.lastTarget = target;
      lead.wl = F.easeLead(lead.wl, target, dt);

      // ⚠ IN CSS PIXELS, NOT DEVICE PIXELS. `ctx.setTransform(dpr, …)` above makes the
      // drawing space the element's own box, so the tile grid is the same size on a
      // retina screen as on a plain one — read off the backing store it would be
      // half the tiles at twice the size.
      // the one thing reduced motion actually throttles
      if (RD_REDUCED && now - last < 1000 / RD_REDUCED_FPS) return;
      last = now;
      draw(ctx, box.w, box.h, sig, lead, t);

      // ── what the chrome prints ──
      const clock = live.startedAtRef.current == null ? 0 : performance.now() / 1000 - live.startedAtRef.current;
      const next = {
        bpm: tempo && tempo.bpm ? Math.round(tempo.bpm) : null,
        lit: sig.lit,
        step: tempo ? tempo.step : null,
        clock: Math.floor(clock),
        hasSig: sig.hasSig,
        preview: S.previewSimOn(preview, real),
        lead: target === 0.5 ? "both" : target === 1 ? "wall" : "cloud",
        noSig: !!(live.playing && !real),
      };
      const p = readRef.current;
      if (next.bpm !== p.bpm || next.lit !== p.lit || next.step !== p.step || next.clock !== p.clock
        || next.hasSig !== p.hasSig || next.preview !== p.preview || next.lead !== p.lead || next.noSig !== p.noSig) {
        readRef.current = next;
        setRead(next);
      }
    };
    raf = requestAnimationFrame(frame);

    // The song's own programme, and the change of track as an event.
    const applyTrack = () => {
      const now = trackRef.current;                 // never the closure: see trackRef
      const key = `${now.title || ""}·${now.artist || ""}`;
      if (key === sig.trackKey) return;
      sig.trackKey = key;
      sig.program = F.radioProgram(now.title, now.artist);
      sig.changeAt = performance.now() / 1000 - t0;
      sig.beats = { beats: 0, lastStep: null };
      sig.phrase = 0;
      lead.cloudTurns = 0;
    };
    applyTrack();
    wrap.__rdApplyTrack = applyTrack;

    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A change of track reaches the running loop through the ref the effect parked,
  // rather than by rebuilding the field — a rebuild would restart the tempo
  // detector and drop the reading on every poll.
  React.useEffect(() => {
    const wrap = wrapRef.current;
    if (wrap && wrap.__rdApplyTrack) wrap.__rdApplyTrack();
  }, [title, artist]);

  const key = rdTransportKey({ signedIn: st.signedIn, playing: st.playing, paused: !st.playing });
  const modeLabel = read.lead === "both" ? "Listening · wall and cloud"
    : read.lead === "wall" ? "Listening · the wall leads" : "Listening · the cloud leads";
  const eb = { fontFamily: RD_NUM, fontWeight: 700, fontSize: 11, letterSpacing: "0.14em", textTransform: "uppercase", fontVariationSettings: "'ROND' 100" };

  return (
    <section style={{ padding: "96px 0 0" }}>
      <div ref={wrapRef} className="rd-fold" style={{ position: "relative", height: "min(74vh, 660px)", minHeight: 420, background: RD_BG, overflow: "hidden" }}>
        <canvas ref={canvasRef} aria-hidden style={{ position: "absolute", inset: 0, display: "block" }} />

        {/* ⚠ TWO FLOW BLOCKS, NOT NINE PINNED OFFSETS. Every piece of chrome used to
            carry its own `top`/`bottom`, which is fine at 1440 and collides the moment
            the rail wraps: driven at 390 the rail's three items ran into the
            example-signal line and the mode label ran into the wordmark. Pinning the
            two BLOCKS and letting their contents flow puts the same layout at every
            width and makes a collision unrepresentable rather than tuned away. */}
        <div className="rd-top" style={{ position: "absolute", left: 32, right: 32, top: 26, display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
            <img src="/shape-radio-logo.png?v=3" alt="Shape Radio" className="rd-wm" style={{ height: 20, width: "auto", flex: "0 0 auto" }} />
            <div className="rd-mode" style={{ ...eb, color: RD_CREAM30, marginLeft: "auto" }}>{modeLabel}</div>
          </div>

          {/* the rail — the app's own labels, and its own preview rule */}
          <div className="rd-rail" style={{ ...eb, display: "flex", gap: 26, alignItems: "center", borderTop: "1px solid rgba(238,243,240,0.12)", borderBottom: "1px solid rgba(238,243,240,0.12)", padding: "9px 0", color: RD_CREAM50, flexWrap: "wrap", rowGap: 6 }}>
            {/* ⚠ THE PREVIEW REPLACES THE ON-AIR CLAIM RATHER THAN SITTING BESIDE IT,
                and it carries NO session clock: a clock is a fact about playback that
                started on this device, and the app shipped one counting upward for a
                member hearing nothing (#2076's P1). */}
            <span style={{ color: read.preview ? RD_TEAL : RD_CREAM50 }}>
              {!read.preview && st.playing && (
                <span aria-hidden style={{ display: "inline-block", width: 6, height: 6, borderRadius: 3, background: RD_TEAL, marginRight: 7, verticalAlign: 1 }} />
              )}
              {read.preview ? "Preview" : st.playing ? <>On air · <b style={{ color: RD_CREAM, fontWeight: 700 }}>{rdClock(read.clock)}</b></> : "Off air"}
            </span>
            <span>Signal
              <span aria-hidden style={{ display: "inline-flex", alignItems: "flex-end", gap: 2, height: 14, marginLeft: 8, verticalAlign: -2 }}>
                {Array.from({ length: 5 }, (_, i) => (
                  <i key={i} style={{ width: 4, height: `${40 + i * 15}%`, background: i < read.lit ? RD_TEAL : "rgba(238,243,240,0.22)", display: "block" }} />
                ))}
              </span>
            </span>
            <span>Tempo · <b style={{ color: RD_CREAM, fontWeight: 700 }}>{read.bpm ? `${read.bpm} BPM` : "—"}</b>
              {read.bpm ? <span style={{ color: RD_TEAL }}> · measured</span> : null}
            </span>
          </div>

          {read.preview && (
            <div style={{ ...eb, color: RD_HOT }}>▲ Example signal · a simulated station, not a broadcast</div>
          )}
          {read.noSig && (
            <div style={{ ...eb, color: RD_CREAM50 }}>No signal data from the channel</div>
          )}
        </div>

        <div className="rd-bottom" style={{ position: "absolute", left: 32, right: 32, bottom: 32, display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 20 }}>
            <div className="rd-now" style={{ minWidth: 0 }}>
              <div style={{ ...eb, color: RD_TEAL, marginBottom: 8 }}>Now playing</div>
              <div style={{ fontFamily: RD_DISP, fontWeight: 500, fontVariationSettings: "'wdth' 105", fontSize: "clamp(26px,3.4vw,44px)", letterSpacing: "-0.02em", lineHeight: 1.02, color: RD_CREAM }}>
                {title || "Shape Radio"}
              </div>
              <div style={{ fontFamily: RD_SANS, fontSize: 14, color: RD_CREAM50, marginTop: 8 }}>
                {artist || (st.playing ? "One live channel" : "Tune in to hear what is on")}
              </div>
            </div>
            {/* the four-beat counter — it steps on a measured tempo or it does not step */}
            <div aria-hidden style={{ display: "flex", gap: 6, flex: "0 0 auto", paddingBottom: 6 }}>
              {[0, 1, 2, 3].map((i) => (
                <span key={i} style={{ width: 7, height: 7, borderRadius: 4, background: read.step === i ? RD_TEAL : "rgba(238,243,240,0.18)", display: "block" }} />
              ))}
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap", rowGap: 12 }}>
            <div className="rd-deck" style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <button type="button"
                onClick={() => { if (key === "pause") st.pause(); else st.play(); }}
                disabled={key === "signin"}
                style={{ height: 44, padding: "0 20px", border: 0, background: key === "signin" ? "rgba(238,243,240,0.14)" : RD_TEAL, color: key === "signin" ? RD_CREAM50 : "#04110f", fontFamily: RD_SANS, fontWeight: 700, fontSize: 14, cursor: key === "signin" ? "default" : "pointer", clipPath: "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)" }}>
                {key === "pause" ? "❚❚  Pause" : "▶  Tune in"}
              </button>
              {key === "pause" && (
                <button type="button" onClick={st.pause}
                  style={{ height: 44, padding: "0 18px", background: "transparent", border: "1px solid rgba(238,243,240,0.22)", color: RD_CREAM, fontFamily: RD_SANS, fontWeight: 600, fontSize: 13.5, cursor: "pointer", clipPath: "polygon(0 0, calc(100% - 9px) 0, 100% 9px, 100% 100%, 0 100%)" }}>
                  Stop
                </button>
              )}
              {key === "signin" && (
                <a href="/newdesign/Login.html?next=%2Fnewdesign%2FRadio.html" style={{ ...eb, color: RD_TEAL, textDecoration: "none" }}>Sign in to listen</a>
              )}
              {/* ⚠ A REFUSED ATTEMPT HAS TO SAY SO, OR THE FIX FOR THE ONE ABOVE
                  LEAVES A LIVE KEY THAT DOES NOTHING VISIBLE. The 401 line names
                  the likeliest cause without asserting it — we cannot tell an
                  anonymous caller from an auth fault, and the key stays enabled,
                  so pressing again is the recovery for the half that is not a
                  sign-in. The 403 gets the route's OWN words rather than a
                  sign-in prompt: telling a signed-in member to sign in is #2005,
                  and telling a minor to is #2005 with the wrong remedy. */}
              {st.refusal === "signin" && key !== "signin" && (
                <a href="/newdesign/Login.html?next=%2Fnewdesign%2FRadio.html" style={{ ...eb, color: RD_TEAL, textDecoration: "none" }}>
                  Couldn&rsquo;t start &mdash; sign in, or press again
                </a>
              )}
              {st.refusal === "age" && (
                <span style={{ ...eb, color: RD_CREAM50 }}>Shape is for adults 18 and over</span>
              )}
              {st.refusal === "unavailable" && (
                <span style={{ ...eb, color: RD_CREAM50 }}>Couldn&rsquo;t reach the station &mdash; press again</span>
              )}
              {st.configured === false && st.signedIn === true && (
                <span style={{ ...eb, color: RD_CREAM50 }}>No station on the air yet</span>
              )}
            </div>

            <div className="rd-strip" style={{ display: "flex", gap: 10, flex: "0 0 auto" }}>
              {[["Live", null], ["Shape Sets", "#sets"], ["Nora", "#nora"]].map(([label, href]) => (
                <a key={label} href={href || undefined}
                  style={{ ...eb, padding: "9px 13px", border: `1px solid ${href ? "rgba(238,243,240,0.18)" : RD_TEAL}`, color: href ? RD_CREAM50 : RD_TEAL, textDecoration: "none", clipPath: "polygon(0 0, calc(100% - 7px) 0, 100% 7px, 100% 100%, 0 100%)" }}>
                  {label}
                </a>
              ))}
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @media (max-width: 760px) {
          .rd-fold { height: min(74vh, 560px) !important; }
          .rd-top { left: 18px !important; right: 18px !important; top: 20px !important; }
          .rd-bottom { left: 18px !important; right: 18px !important; bottom: 20px !important; }
          .rd-wm { height: 16px !important; }
          .rd-mode { margin-left: 0 !important; }
          .rd-rail { gap: 14px !important; font-size: 10px !important; }
          .rd-strip { display: none !important; }
        }
      `}</style>
    </section>
  );
}
