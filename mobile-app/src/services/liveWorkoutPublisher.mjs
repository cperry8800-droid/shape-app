// Latest-state publisher: completed-set corrections and unchanged heartbeats
// use the same retry path. A failed write never becomes the accepted snapshot.
export function createLiveWorkoutPublisher({ push, clear, startedAt }) {
  let active = false, disposed = false, inFlight = false, fresh = true;
  let desired = null, accepted = null, lastAttempt = 0, timer = null, epoch = 0;
  const cancel = () => { if (timer != null) clearTimeout(timer); timer = null; };
  const schedule = (delay) => {
    cancel();
    if (active && !disposed) timer = setTimeout(send, delay);
  };
  const send = async () => {
    timer = null;
    if (!active || disposed || !desired || inFlight) return;
    inFlight = true;
    const job = desired, gen = epoch;
    lastAttempt = Date.now();
    let ok = false;
    try { ok = await push(job.payload, fresh, { coachPayload: job.coachPayload, startedAt }); } catch {}
    inFlight = false;
    if (disposed || !active || gen !== epoch) {
      if (!disposed && active) schedule(0);
      return;
    }
    if (ok !== false) { accepted = job.signature; fresh = false; }
    schedule(accepted !== desired.signature || ok === false ? Math.max(0, 4000 - (Date.now() - lastAttempt)) : 15000);
  };
  const wake = () => { if (active && !inFlight) schedule(0); };
  globalThis.addEventListener?.('online', wake);
  globalThis.addEventListener?.('focus', wake);
  return {
    update(payload, coachPayload, isActive = true) {
      if (disposed) return;
      if (!isActive || !payload) {
        if (active) { active = false; epoch++; cancel(); accepted = null; fresh = true; clear(); }
        return;
      }
      const signature = JSON.stringify([payload, coachPayload]);
      const changed = signature !== desired?.signature;
      const starting = !active;
      active = true; desired = { payload, coachPayload, signature };
      if (!inFlight && (starting || changed)) schedule(starting ? 0 : Math.max(0, 4000 - (Date.now() - lastAttempt)));
    },
    stop() {
      if (disposed) return;
      disposed = true; active = false; epoch++; cancel(); clear();
      globalThis.removeEventListener?.('online', wake);
      globalThis.removeEventListener?.('focus', wake);
    },
  };
}
