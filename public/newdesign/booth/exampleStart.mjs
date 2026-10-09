// exampleStart.mjs — the example set's AudioContext: made inside the tap, and only handed over once
// it is actually running. No three, no DOM: the AudioContext constructor is passed in.
//
// ⚠ TWO WAYS THE BOOTH COULD CLAIM A SET NOBODY HEARS (Codex, #2287).
//   1. A stop that landed while the context was still resuming was a no-op: there was no deck to
//      stop yet. The resume then resolved and started the set anyway, so the moment the station
//      began playing (the reason for the stop) it played over it, with nothing left to stop it.
//   2. A refused resume (no permission to play, no audio output) was swallowed, and the deck was
//      scheduled on a suspended context: the label said "Preview · example set" over silence.
// So a start is a promise of a RUNNING context or of nothing, and `cancel()` reaches a start that
// has not finished.

/** Close a context that will never be handed over, quietly: it may already be closed. */
function closeQuietly(ctx) {
  try {
    const p = ctx && ctx.close && ctx.close();
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch (e) { /* already closed */ }
}

/**
 * @param {() => (new () => AudioContext) | null | undefined | false} getAC  the constructor, or
 *        nothing on a browser without Web Audio
 */
export function createExampleStarter(getAC) {
  let gen = 0;
  let pending = null;
  let handed = null;   // { ctx, gen } — the last context handed over, and the generation it belongs to
  return {
    /**
     * ⚠ Call it from the tap itself: the context is constructed synchronously, before any await.
     * @returns {Promise<AudioContext|null>} a running context, or null (no Web Audio, refused, or
     *          cancelled meanwhile; the context is closed in every null case)
     */
    start() {
      const AC = getAC && getAC();
      if (!AC) return Promise.resolve(null);
      if (pending) { closeQuietly(pending); pending = null; }
      const my = ++gen;
      let ctx;
      try { ctx = new AC(); } catch (e) { return Promise.resolve(null); }
      pending = ctx;
      const finish = (ok) => {
        if (pending === ctx) pending = null;
        if (!ok || my !== gen || ctx.state !== 'running') { if (ctx.state !== 'closed') closeQuietly(ctx); return null; }
        handed = { ctx, gen: my };
        return ctx;
      };
      // ⚠ Even an already-running context is settled a microtask later, not here: a stop issued in
      // the same tick as the start must still find it pending. (Measured in Chromium: with the
      // context running at once, a same-tick stop was lost and the set started.)
      if (ctx.state === 'running') return Promise.resolve().then(() => finish(true));
      let resumed;
      try { resumed = Promise.resolve(ctx.resume()); } catch (e) { return Promise.resolve(finish(false)); }
      return resumed.then(() => finish(true), () => finish(false));
    },
    /** A stop that arrives before the start finished: the start resolves null and closes its context. */
    cancel() {
      gen += 1;
      if (pending) { closeQuietly(pending); pending = null; }
    },
    /**
     * Whether `ctx` was handed over and nothing has cancelled since. The caller asks this when it
     * takes the context, because a cancel can still land between the start resolving and the
     * caller's own continuation running.
     */
    isCurrent(ctx) { return !!ctx && !!handed && handed.ctx === ctx && handed.gen === gen; },
    get pending() { return !!pending; },
  };
}
