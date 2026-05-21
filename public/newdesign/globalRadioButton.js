/* Persistent Shape Radio mini-player. Mirrors globalChatButton.js:
   a fixed pill at the bottom-right (just above the chat button) that
   stays on every page. Play state + position persist in sessionStorage
   so playback resumes across navigations (best-effort — browsers may
   require a tap to resume autoplay on a new page).

   Audio source: set window.SHAPE_RADIO_SRC (an mp3 or stream URL) or a
   data-src attribute on this script tag. With no source the pill is a
   persistent launcher that opens the Radio page. */
(function () {
  if (window.__shapeGlobalRadioLoaded) return;
  window.__shapeGlobalRadioLoaded = true;

  var BTN_ID = "shape-global-radio";
  var STATE_KEY = "shape.globalRadio.state";
  var TRACK = "Shape Radio Station";
  var thisScript = document.currentScript;
  var SRC = (thisScript && thisScript.getAttribute("data-src")) || window.SHAPE_RADIO_SRC || "";

  function readState() {
    try { return JSON.parse(sessionStorage.getItem(STATE_KEY) || "{}"); } catch (e) { return {}; }
  }
  function writeState(s) {
    try { sessionStorage.setItem(STATE_KEY, JSON.stringify(s)); } catch (e) {}
  }

  function injectStyles() {
    if (document.getElementById("shape-global-radio-style")) return;
    var st = document.createElement("style");
    st.id = "shape-global-radio-style";
    st.textContent = [
      "#" + BTN_ID + "{position:fixed;right:24px;bottom:92px;z-index:2147482900;display:inline-flex;align-items:center;gap:11px;padding:12px 18px 12px 14px;border:0;border-radius:999px;background:#1a1612;color:#f2ede4;font-family:'Space Grotesk',Inter,Arial,sans-serif;text-decoration:none;box-shadow:0 16px 40px rgba(0,0,0,.42);cursor:pointer;-webkit-tap-highlight-color:transparent;transition:transform .16s ease,box-shadow .16s ease}",
      "#" + BTN_ID + ":hover{transform:translateY(-2px);box-shadow:0 20px 48px rgba(0,0,0,.5)}",
      "#" + BTN_ID + ":focus-visible{outline:3px solid rgba(30,192,168,.7);outline-offset:4px}",
      "#" + BTN_ID + " .gr-ic{width:30px;height:30px;border-radius:999px;background:#1ec0a8;color:#1a1612;display:inline-flex;align-items:center;justify-content:center;flex:none;font-size:11px;line-height:1}",
      "#" + BTN_ID + " .gr-tx{display:flex;flex-direction:column;line-height:1.2;min-width:0;text-align:left}",
      "#" + BTN_ID + " .gr-k{font-family:'JetBrains Mono',Consolas,monospace;font-size:9px;letter-spacing:.16em;text-transform:uppercase;color:#1ec0a8}",
      "#" + BTN_ID + " .gr-n{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:150px}",
      "@media (max-width:640px){#" + BTN_ID + "{display:none}}"
    ].join("");
    document.head.appendChild(st);
  }

  var audio = null;
  function ensureAudio() {
    if (audio) return audio;
    audio = document.createElement("audio");
    if (SRC) audio.src = SRC;
    audio.loop = true;
    audio.preload = "none";
    audio.addEventListener("timeupdate", function () {
      var s = readState();
      s.t = audio.currentTime;
      writeState(s);
    });
    document.body.appendChild(audio);
    return audio;
  }

  var PLAY_SVG = '<svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M3 1.5v9l7-4.5z"/></svg>';
  var PAUSE_SVG = '<svg width="11" height="11" viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><rect x="2.5" y="2" width="2.6" height="8"/><rect x="6.9" y="2" width="2.6" height="8"/></svg>';

  function setIcon(btn, playing) {
    var ic = btn.querySelector(".gr-ic");
    if (ic) ic.innerHTML = playing ? PAUSE_SVG : PLAY_SVG;
    btn.setAttribute("aria-label", (playing ? "Pause" : "Play") + " Shape Radio");
  }

  function mount() {
    if (document.getElementById(BTN_ID)) return;
    injectStyles();

    var btn = document.createElement("button");
    btn.id = BTN_ID;
    btn.type = "button";
    btn.innerHTML =
      '<span class="gr-ic">' + PLAY_SVG + '</span>' +
      '<span class="gr-tx"><span class="gr-k">Shape Radio</span>' +
      '<span class="gr-n">' + TRACK + '</span></span>';
    document.body.appendChild(btn);

    audio = ensureAudio();
    var sync = function () { setIcon(btn, !audio.paused); };
    audio.addEventListener("play", sync);
    audio.addEventListener("pause", sync);

    btn.addEventListener("click", function () {
      ensureAudio();
      if (audio.paused) {
        var s = readState();
        if (s.t) { try { audio.currentTime = s.t; } catch (e) {} }
        audio.play().then(function () {
          writeState({ playing: true, t: audio.currentTime });
          sync();
        }).catch(function () {});
      } else {
        audio.pause();
        writeState({ playing: false, t: audio.currentTime });
        sync();
      }
    });

    // Best-effort resume after a page navigation.
    var prev = readState();
    if (prev.playing) {
      if (prev.t) { try { audio.currentTime = prev.t; } catch (e) {} }
      audio.play().then(sync).catch(function () { setIcon(btn, false); });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
})();
