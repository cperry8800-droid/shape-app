/* Depth: the pointer tilt (owner, 2026-11-04: "I want the look of everything to pop more,
   almost look 3D").

   An element marked `data-tilt` leans toward the pointer while it is over it: up to
   --tilt-max degrees on each axis (6 unless the element sets its own), lifted a few pixels,
   with --tilt-mx / --tilt-my (0–100%) saying where the pointer is, for a page that draws a
   moving highlight from them. It settles back flat when the pointer leaves.

   ⚠ ONE LISTENER FOR THE WHOLE DOCUMENT, NOT ONE PER CARD. The website's pages render their
   cards with React after Babel compiles them, so there is nothing to bind to when this
   script runs; delegation finds the card under the pointer whenever it exists.
   ⚠ THE TRANSFORM IS ONLY ON WHILE THE CARD IS TILTING (.tilt-on). A transform makes an
   element the containing block of its position:fixed children, so a card that carried one
   at rest would trap any fixed overlay drawn inside it.
   ⚠ NOTHING MOVES for a visitor who asked for reduced motion or who has no hovering pointer
   (a phone: the tilt would fire on the tap and stick). */
(function () {
  if (typeof window === "undefined" || window.__shapeDepth3d) return;
  window.__shapeDepth3d = true;
  var mq = function (q) { try { return window.matchMedia(q).matches; } catch (e) { return false; } };
  if (mq("(prefers-reduced-motion: reduce)") || !mq("(hover: hover) and (pointer: fine)")) return;

  var css = "[data-tilt].tilt-on{transform:perspective(900px) rotateX(var(--tilt-rx,0deg)) rotateY(var(--tilt-ry,0deg)) translateY(var(--tilt-lift,0px));"
    + "transition:transform .5s cubic-bezier(.2,.7,.2,1);will-change:transform}"
    + "[data-tilt].tilt-on.tilt-move{transition:transform .12s ease-out}";
  var style = document.createElement("style");
  style.setAttribute("data-depth3d", "");
  style.textContent = css;
  (document.head || document.documentElement).appendChild(style);

  // ⚠ ONE SETTLE TIMER PER CARD. A single shared timer let a sweep across three cards cancel
  // the first card's cleanup, which then kept its transform (and its layer) for good.
  var active = null, timers = new WeakMap();
  function settle(el) {
    el.classList.remove("tilt-move");
    el.style.setProperty("--tilt-rx", "0deg");
    el.style.setProperty("--tilt-ry", "0deg");
    el.style.setProperty("--tilt-lift", "0px");
    clearTimeout(timers.get(el));
    timers.set(el, setTimeout(function () { timers.delete(el); if (el !== active) el.classList.remove("tilt-on"); }, 520));
  }
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType && e.pointerType !== "mouse") return;
    var el = e.target && e.target.closest ? e.target.closest("[data-tilt]") : null;
    if (active && active !== el) { var was = active; active = null; settle(was); }
    if (!el) return;
    if (active !== el) { clearTimeout(timers.get(el)); timers.delete(el); }
    active = el;
    var r = el.getBoundingClientRect();
    if (!r.width || !r.height) return;
    var x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    var max = parseFloat(el.getAttribute("data-tilt")) || 6;
    el.classList.add("tilt-on", "tilt-move");
    el.style.setProperty("--tilt-rx", ((0.5 - y) * 2 * max).toFixed(2) + "deg");
    el.style.setProperty("--tilt-ry", ((x - 0.5) * 2 * max).toFixed(2) + "deg");
    el.style.setProperty("--tilt-lift", "-4px");
    el.style.setProperty("--tilt-mx", (x * 100).toFixed(1) + "%");
    el.style.setProperty("--tilt-my", (y * 100).toFixed(1) + "%");
  }, { passive: true });
  // Leaving the window (pointerleave does not bubble, so this is the root's own leave alone;
  // moving from one card to another is handled above).
  document.documentElement.addEventListener("pointerleave", function () { if (active) { var was = active; active = null; settle(was); } });
  window.addEventListener("blur", function () { if (active) { var was = active; active = null; settle(was); } });
})();
