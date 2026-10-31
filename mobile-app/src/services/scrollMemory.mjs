// mobile-app/src/services/scrollMemory.mjs
// ── Back lands where you were ──
// Owner, 2026-10-31: "make sure it goes back to [the] page of where that person was on the page".
//
// Most pages open a detail by rendering it in their place, so the page unmounts and its scroll is
// lost: Back brought it back at the top. This remembers it. A page that LEAVES going forward is
// remembered (its identity and how far down it was); a page that ARRIVES because of a Back takes
// the place it left. Pages leave and arrive in stacks — a list opens a detail, the detail opens a
// profile — so the memory is a stack, and a Back pops the newest step.
//
// One step can unmount or mount more than one page (a takeover over a tab), so a step is a GROUP:
// every page that leaves in the same tick joins one group, and the pages a Back mounts each take
// the entry with their own identity from the group it pops. An entry whose identity matches no
// arriving page is dropped, never applied to a different page.
//
// A Back is marked by whatever asks for it (the ← button, the pinned bar's ←, a swipe, the phone's
// back) just before it runs; the next tap that is not a Back clears the mark, so a Back that opened
// nothing (a takeover closing over a page that stayed mounted) can't make the next forward step
// look like one.

export const BS_SCROLL_BACK_MS = 1500;
export const BS_SCROLL_CAP = 40;

// Two identities are one page when they draw the same first element(s) with the same title.
export function bsScrollSameSig(a, b) {
  if (!a || !b) return a === b;
  if (a.title !== b.title) return false;
  if (!Array.isArray(a.types) || !Array.isArray(b.types) || a.types.length !== b.types.length) return false;
  return a.types.every((t, i) => t === b.types[i]);
}

export function bsScrollMemory({ now = () => Date.now(), windowMs = BS_SCROLL_BACK_MS, cap = BS_SCROLL_CAP, defer = (f) => setTimeout(f, 0) } = {}) {
  const stack = [];   // groups, newest last: [{ sig, y, used }]
  let open = null;    // the group this tick's leaving pages join
  let backAt = 0;     // when a Back was last asked for (0: none pending)
  let restoring = null; // the group the pending Back is handing out
  const backPending = () => backAt > 0 && now() - backAt < windowMs;
  return {
    // Every asker marks (the ← and the shell's navBack it calls both do), so a repeat mark before
    // the Back's pages arrive must not drop the group it is restoring.
    markBack() { backAt = now(); },
    clearBack() { backAt = 0; restoring = null; },
    backPending,
    // A page leaves: going forward it is remembered; going back it is done with.
    leave(sig, y) {
      if (backPending()) return;
      if (!open) {
        const g = [];
        open = g;
        stack.push(g);
        if (stack.length > cap) stack.shift();
        defer(() => { if (open === g) open = null; });
      }
      open.push({ sig, y: Number.isFinite(y) && y > 0 ? y : 0, used: false });
    },
    // A page arrives: after a Back, the place it left (or null); otherwise null.
    arrive(sig) {
      if (!backPending()) return null;
      if (!restoring) {
        const g = stack.pop() || [];
        restoring = g;
        defer(() => { if (restoring === g) { restoring = null; backAt = 0; } });
      }
      const e = restoring.find((x) => !x.used && bsScrollSameSig(x.sig, sig));
      if (!e) return null;
      e.used = true;
      return e.y;
    },
    size: () => stack.length,
  };
}
