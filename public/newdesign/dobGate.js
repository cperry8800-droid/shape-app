/* Shape — date-of-birth completion gate for the web portal.
 *
 * The owner ruled (2026-08-21) that EVERY account supplies a birthdate, which
 * ends the grandfather clause in mustRefuseForAge(): an account created before
 * ADULT_PROOF_REQUIRED_FROM is currently admitted on no proof at all. Removing
 * that clause before members can comply would 403 them across all seven gated
 * API prefixes INCLUDING the screens they would need in order to fix it. So:
 * collect first, enforce second. This is the web half; the mobile half is
 * mobile-app/src/broadsheet/BSDobGate.jsx.
 *
 * ⚠ BLOCKS ONLY ON AN EXPLICIT `needed: true`. A failed request, a 401 during a
 * token refresh, an HTML error page from a proxy, a shape we do not recognise —
 * every one of those falls through and shows nothing. That is deliberate, and it
 * is the OPPOSITE of how the gate itself behaves: the gate is the authority on
 * access and fails closed, while this overlay only decides whether to ASK.
 * Blocking on our own uncertainty would shut members out of a product they are
 * entitled to, over a question we could not even establish needed asking.
 *
 * ⚠ NO CLIENT-SIDE AGE ARITHMETIC. Two implementations of the 18+ rule already
 * exist (src/lib/age-derive.mjs and its classic-script mirror
 * public/age-derive.js), held in step by tests/age-derive-mirror.test.mjs. A
 * third copy here would be a third thing to keep aligned, and the bug it would
 * introduce — a client that disagrees with the server about one person's
 * birthday — is precisely what that mirror test exists to prevent. The server
 * decides; this file renders what it says.
 *
 * ⚠ NO SUPABASE DEPENDENCY, ON PURPOSE. Only 21 of the 73 portal pages load
 * /supabase.js, so anything keyed on window.shapeDb would be absent on most of
 * the surface this has to cover. The endpoint is cookie-authenticated, so a
 * same-origin fetch is all that is needed and the gate works on every page.
 *
 * Sign-out DELEGATES to window.shapePortalSignOut (exposed by pageShell.jsx)
 * rather than reimplementing it. That path clears the cookie, the persisted
 * Supabase session AND runs the shared-device content scrub, with a broadcast
 * ordering that took a whole wave to get right — a second copy here would be a
 * copied guard that has lost its rationale.
 */
(function () {
  'use strict';

  if (window.__shapeDobGateLoaded) return;
  window.__shapeDobGateLoaded = true;

  var ID = 'shape-dob-gate';
  var PAPER = '#1a1612';
  var INK = '#f2ede4';
  var INK70 = 'rgba(242,237,228,0.72)';
  var INK50 = 'rgba(242,237,228,0.55)';
  var TEAL = '#0ac5a8';
  var DANGER = '#ff6b5e';
  var serif = "'Fraunces', 'Fraunces Fallback', 'Instrument Serif', serif";
  var sans = "'Space Grotesk', 'Space Grotesk Fallback', sans-serif";
  var mono = "'JetBrains Mono', 'JetBrains Mono Fallback', monospace";

  function el(tag, style, text) {
    var n = document.createElement(tag);
    if (style) { for (var k in style) { if (Object.prototype.hasOwnProperty.call(style, k)) n.style[k] = style[k]; } }
    // textContent, never innerHTML: the error strings rendered here come back
    // from the API, and building markup out of a response is how an endpoint
    // becomes an injection point the day someone widens what it can return.
    if (text !== undefined && text !== null) n.textContent = text;
    return n;
  }

  function signOut() {
    if (typeof window.shapePortalSignOut === 'function') { window.shapePortalSignOut(); return; }
    // ⚠ THIS BRANCH USED TO SAY /login "carries the canonical sign-out path".
    // IT DOES NOT. login.jsx clears nothing on arrival, so the redirect left the
    // member SIGNED IN behind a gate whose only escape hatch was that button —
    // and Login.html is itself gate-eligible, so there the redirect pointed at
    // the page they were already on: a loop with a live session. The comment
    // asserting the fallback was safe was the thing that was wrong.
    //
    // pageShell now defines the canonical path at module scope, so this branch is
    // reached only by the five portal pages that never load it at all. That is
    // also why the local scrub cannot run here — those pages load neither
    // supabase.js nor the scrub — which is a reason to kill the SERVER session,
    // not a reason to skip it. One endpoint, the same one the canonical path
    // calls first; navigation happens either way so a failed call can never
    // strand the member on the gate.
    var go = function () { window.location.href = '/login'; };
    try {
      var out = fetch('/api/auth/signout', { method: 'POST', credentials: 'same-origin' });
      if (out && typeof out.then === 'function') { out.then(go, go); } else { go(); }
    } catch (e) { go(); }
  }

  function render(blocked) {
    if (document.getElementById(ID)) return;

    var wrap = el('div', {
      position: 'fixed', inset: '0', zIndex: '2147483000',
      background: PAPER, color: INK, overflowY: 'auto',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
    });
    wrap.id = ID;
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-modal', 'true');
    wrap.tabIndex = -1;

    // ⚠ aria-modal="true" TELLS ASSISTIVE TECH THE PAGE BEHIND DOES NOT EXIST,
    // so Tab must not be able to reach it. Without a trap a keyboard user walks
    // straight out of this overlay into controls their screen reader has been
    // told are unavailable — the two disagree, and the one that is wrong is the
    // one they can still operate. Focusables are read at event time because the
    // submit button disables itself mid-save, and a disabled control silently
    // refuses focus, which would drop the cycle on the floor.
    //
    // The MOBILE twin needs none of this and that is structural, not an
    // oversight: BSDobGate renders INSTEAD of <App/>, so nothing is behind it.
    // There is deliberately no Escape-to-close either — this is a gate, and an
    // escape hatch that dismissed it would defeat the thing it exists to do.
    // The way out is Sign out, which every state offers.
    wrap.addEventListener('keydown', function (ev) {
      if (ev.key !== 'Tab') return;
      var f = wrap.querySelectorAll(
        'input:not([disabled]), button:not([disabled]), select:not([disabled]),'
          + ' textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])'
      );
      if (!f.length) return;
      var first = f[0];
      var last = f[f.length - 1];
      // Only the boundaries need intercepting; every step between them is the
      // browser's own Tab order, which is already correct inside the dialog.
      //
      // ⚠ NO 'focus escaped the dialog' BRANCH, because this listener could
      // never run in that state: it is scoped to `wrap`, and a keydown fired
      // while focus sits outside bubbles from there to document without ever
      // passing through it. A document-level listener would reach that case,
      // and was rejected — it outlives the node this gate removes on save, so
      // getting its teardown wrong hijacks Tab across the whole portal, which
      // is a worse failure than the one being prevented.
      var active = document.activeElement;
      // ⚠ THE CONTAINER IS A BOUNDARY TOO. `wrap` carries tabIndex -1 so it is
      // deliberately not tab-REACHABLE — which also keeps it out of `f`, so focus
      // resting ON it matched neither end and fell straight through this check.
      // Shift+Tab then ran backward out of an aria-modal dialog into the page it
      // tells assistive tech is unavailable. Forward needs no case: document order
      // from the container runs into its own children.
      //
      // Keyed on the container rather than on blocked mode, because focus lands
      // here two ways — the blocked panel focuses it deliberately, and tabIndex -1
      // is also CLICK-focusable, so a backdrop click puts focus here in the
      // ordinary form state as well.
      var atBackEdge = active === first || active === wrap;
      if (ev.shiftKey ? atBackEdge : active === last) {
        ev.preventDefault();
        try { (ev.shiftKey ? last : first).focus(); } catch (e) {}
      }
    });
    wrap.setAttribute('aria-labelledby', ID + '-title');

    var card = el('div', { width: '100%', maxWidth: '460px' });

    var bar = el('div', {
      fontFamily: mono, fontSize: '10px', fontWeight: '700', letterSpacing: '0.22em',
      textTransform: 'uppercase', color: INK70, display: 'flex',
      justifyContent: 'space-between', alignItems: 'center',
      borderBottom: '2px solid ' + INK, paddingBottom: '8px', marginBottom: '22px',
    });
    bar.appendChild(el('span', null, 'Shape'));
    bar.appendChild(el('span', { color: INK }, blocked ? 'Account' : 'Required'));
    card.appendChild(bar);

    var h = el('h1', {
      fontFamily: serif, fontSize: '30px', fontWeight: '600', letterSpacing: '-0.02em',
      lineHeight: '1.12', margin: '0',
    }, blocked ? 'We can’t finish this here.' : 'Confirm your date of birth.');
    h.id = ID + '-title';
    card.appendChild(h);

    if (blocked) {
      card.appendChild(el('p', {
        fontFamily: sans, fontSize: '15px', lineHeight: '1.6', color: INK70, marginTop: '14px',
      }, 'Your account setup didn’t complete, so there’s nothing to save this to yet. Contact support and we’ll put it right.'));
      var outOnly = el('button', {
        marginTop: '22px', padding: '10px 0', border: '0', background: 'transparent',
        color: INK50, fontFamily: mono, fontSize: '10px', fontWeight: '700',
        letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
      }, 'Sign out');
      outOnly.type = 'button';
      outOnly.addEventListener('click', signOut);
      card.appendChild(outOnly);
      wrap.appendChild(card);
      document.body.appendChild(wrap);
      // No form here, so nothing pulls focus in on its own — focus the dialog so
      // it is announced and Tab starts inside the trap rather than behind it.
      try { wrap.focus(); } catch (e) {}
      return;
    }

    card.appendChild(el('div', {
      fontFamily: mono, fontSize: '9.5px', letterSpacing: '0.16em', textTransform: 'uppercase',
      color: INK50, marginTop: '10px',
    }, 'Adults 18 and over'));
    card.appendChild(el('p', {
      fontFamily: sans, fontSize: '15px', lineHeight: '1.6', color: INK70, marginTop: '14px',
    }, 'Shape is for adults 18 and over, and every account needs a date of birth on file. You’ll only be asked once — it can’t be changed afterwards, so check it before you save.'));

    var form = el('form', { marginTop: '22px', display: 'block' });

    var label = el('label', {
      fontFamily: mono, fontSize: '9.5px', fontWeight: '700', letterSpacing: '0.18em',
      textTransform: 'uppercase', color: INK50, display: 'block',
    }, 'Date of birth');
    label.htmlFor = ID + '-input';
    form.appendChild(label);

    var input = el('input', {
      marginTop: '8px', width: '100%', padding: '14px 12px', borderRadius: '4px',
      background: 'rgba(242,237,228,0.06)', color: INK, boxSizing: 'border-box',
      border: '1px solid rgba(242,237,228,0.18)', borderLeft: '3px solid rgba(242,237,228,0.18)',
      fontFamily: mono, fontSize: '15px', letterSpacing: '0.04em',
    });
    input.type = 'date';
    input.id = ID + '-input';
    input.required = true;
    form.appendChild(input);

    // role="alert" so a refusal is announced rather than only recoloured — this
    // is the sole feedback a member gets when the server rejects a date.
    var err = el('div', {
      display: 'none', marginTop: '14px', padding: '10px 12px',
      borderLeft: '3px solid ' + DANGER, background: 'rgba(255,107,94,0.09)',
      fontFamily: sans, fontSize: '14px', lineHeight: '1.5', color: INK,
    });
    err.setAttribute('role', 'alert');
    form.appendChild(err);

    var submit = el('button', {
      marginTop: '20px', width: '100%', padding: '15px', border: '0', borderRadius: '4px',
      background: TEAL, color: '#05080c', fontFamily: mono, fontSize: '11px',
      fontWeight: '800', letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer',
    }, 'Save and continue');
    submit.type = 'submit';
    form.appendChild(submit);

    // An escape hatch is mandatory, not a courtesy: this overlay is the only
    // thing between the member and the portal, so without it anyone who cannot
    // answer (a shared computer, the wrong account) is stranded with no way out.
    var out = el('button', {
      marginTop: '10px', width: '100%', padding: '10px', border: '0', background: 'transparent',
      color: INK50, fontFamily: mono, fontSize: '10px', fontWeight: '700',
      letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
    }, 'Sign out');
    out.type = 'button';
    out.addEventListener('click', signOut);
    form.appendChild(out);

    function setErr(msg) {
      err.textContent = msg || '';
      err.style.display = msg ? 'block' : 'none';
    }

    input.addEventListener('input', function () {
      input.style.borderLeftColor = input.value ? TEAL : 'rgba(242,237,228,0.18)';
      if (err.style.display === 'block') setErr('');
    });

    var busy = false;
    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (busy || !input.value) return;
      busy = true;
      submit.disabled = true;
      submit.textContent = 'Saving…';
      setErr('');
      fetch('/api/me/date-of-birth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        cache: 'no-store',
        body: JSON.stringify({ date_of_birth: input.value }),
      })
        .then(function (res) {
          return res.json().catch(function () { return null; }).then(function (d) {
            return { ok: res.ok, data: d };
          });
        })
        .then(function (r) {
          // ⚠ BOTH CONDITIONS. A 200 carrying `ok` is the only success. The route
          // answers 503 `not_persisted` when it could not confirm the row really
          // holds the date, and treating that as saved would drop the member back
          // in front of the same gate with no idea why.
          if (r.ok && r.data && r.data.ok === true) {
            var node = document.getElementById(ID);
            if (node && node.parentNode) node.parentNode.removeChild(node);
            unlockScroll();
            return;
          }
          setErr((r.data && r.data.error) || 'Could not save your date of birth. Try again.');
        })
        .catch(function () {
          setErr('Could not save your date of birth. Try again.');
        })
        .then(function () {
          busy = false;
          submit.disabled = false;
          submit.textContent = 'Save and continue';
        });
    });

    card.appendChild(form);
    wrap.appendChild(card);
    document.body.appendChild(wrap);
    try { input.focus(); } catch (e) {}
  }

  // ⚠ THE SCROLL LOCK MUST BE CAPTURED ONCE. A second capture reads back the
  // 'hidden' this file itself wrote, and then releasing it restores 'hidden'
  // — the overlay closes and the portal underneath can never be scrolled
  // again. `locked` makes the capture idempotent instead of trusting that
  // start() only ever runs once.
  //
  // ⚠ THIS GUARD IS SECOND-LINE AND NO TEST CAN REACH IT. lockScroll() has
  // exactly one caller, inside a start() that is itself idempotent — so with
  // `started` in place a second capture is unreachable, and mutation-testing
  // reports removing `locked` alone as a survivor. Removing BOTH is caught.
  // It is kept because the invariant belongs at the capture, where a second
  // caller added later inherits it; do not read the survivor as dead code,
  // and do not try to pin it with a test that cannot exist.
  var prevOverflow = '';
  var locked = false;

  function lockScroll() {
    if (locked) return;
    locked = true;
    prevOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
  }

  function unlockScroll() {
    if (!locked) return;
    locked = false;
    document.documentElement.style.overflow = prevOverflow;
  }

  // ⚠ AND start() RUNS ONCE. DOMContentLoaded can arrive more than once in a
  // document's life (a re-injected tag, a restored page), and a second run
  // would issue a second probe and a second lock capture.
  var started = false;

  function start() {
    if (started) return;
    started = true;
    // no-store: per-account answer, and a portal machine can be shared.
    fetch('/api/me/date-of-birth', { credentials: 'same-origin', cache: 'no-store' })
      .then(function (res) {
        // A non-OK response is not evidence that this member owes us a date.
        if (!res.ok) return null;
        return res.json().catch(function () { return null; });
      })
      .then(function (d) {
        if (!d || d.needed !== true) return;
        lockScroll();
        render(d.blocked === 'no_profile');
      })
      .catch(function () { /* never block on a failed check */ });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
