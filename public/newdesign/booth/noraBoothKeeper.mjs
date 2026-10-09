// noraBoothKeeper.mjs — one booth that outlives the screen that shows it.
//
// ⚠ THE APP RE-DOWNLOADED NORA ON EVERY VISIT. Leaving the Radio tab unmounts the screen, and the
// stage was disposed with it, so each return fetched the 10.8 MB model again and re-baked the
// room. The keeper holds the booth (and its own canvas) between mounts: a screen acquires it,
// attaches the canvas, and releases it on unmount. A released booth stops drawing at once and is
// disposed only after `idleMs` with nobody holding it, so a quick round trip costs nothing and a
// member who has moved on gets the memory and the GPU context back.
//
// No three, no DOM: `create` does the building, and the clock is injectable for the tests.

export const IDLE_DISPOSE_MS = 3 * 60 * 1000;

/**
 * @param {object} o
 * @param {(progress: (f: number) => void) => Promise<object>} o.create
 *        builds a booth (with `.stop()` and `.dispose()`); it must release everything it
 *        allocated before rejecting
 * @param {number} [o.idleMs]
 * @param {{set: Function, clear: Function}} [o.timers]
 */
export function createBoothKeeper({ create, idleMs = IDLE_DISPOSE_MS, timers = null } = {}) {
  if (typeof create !== 'function') throw new Error('createBoothKeeper: create is required');
  const T = timers || { set: (fn, ms) => setTimeout(fn, ms), clear: (id) => clearTimeout(id) };
  let entry = null;            // { promise, booth, timer, holders, dead }
  const progressFns = new Set();
  let lastProgress = null;

  function finish(e) {
    e.dead = true;
    if (e.timer != null) { T.clear(e.timer); e.timer = null; }
    if (entry === e) entry = null;
    // A booth still loading is disposed when it arrives (below).
    if (e.booth) { try { e.booth.dispose(); } catch (err) { /* already gone */ } e.booth = null; }
  }

  return {
    /** The booth, building it if nobody holds one. Every acquire is matched by one release. */
    acquire() {
      if (entry && !entry.dead) {
        if (entry.timer != null) { T.clear(entry.timer); entry.timer = null; }
        entry.holders += 1;
        return entry.promise;
      }
      const e = { promise: null, booth: null, timer: null, holders: 1, dead: false };
      entry = e;
      lastProgress = null;
      const report = (f) => { lastProgress = f; for (const fn of progressFns) { try { fn(f); } catch (err) { /* the page's */ } } };
      e.promise = Promise.resolve().then(() => create(report)).then((b) => {
        if (e.dead) {
          // Released and timed out while it loaded: nobody will ever attach it.
          try { b.dispose(); } catch (err) { /* already gone */ }
          const ab = new Error('The booth was released while it loaded');
          ab.name = 'AbortError';
          throw ab;
        }
        e.booth = b;
        // Built while nobody held it (the screen left mid-load): it waits stopped, on the timer.
        if (e.holders === 0) { try { b.stop(); } catch (err) { /* fine */ } }
        return b;
      }, (err) => {
        // A failed build leaves nothing behind (create's contract), so the next acquire retries.
        if (entry === e) entry = null;
        e.dead = true;
        if (e.timer != null) { T.clear(e.timer); e.timer = null; }
        throw err;
      });
      return e.promise;
    },

    /** Done with it for now: it stops drawing, and goes after `idleMs` unless acquired again. */
    release() {
      const e = entry;
      if (!e || e.dead || e.holders === 0) return;
      e.holders -= 1;
      if (e.holders > 0) return;
      if (e.booth) { try { e.booth.stop(); } catch (err) { /* fine */ } }
      e.timer = T.set(() => { e.timer = null; if (e.holders === 0) finish(e); }, idleMs);
    },

    /** Dispose now, held or not (the page is going away). */
    disposeNow() { if (entry) finish(entry); },

    /** The model download while the booth builds, 0..1; the latest value arrives at once. */
    onProgress(fn) {
      progressFns.add(fn);
      if (lastProgress != null && entry && !entry.booth) { try { fn(lastProgress); } catch (err) { /* the page's */ } }
      return () => progressFns.delete(fn);
    },

    get held() { return entry ? entry.holders : 0; },
    get booth() { return entry ? entry.booth : null; },
  };
}
