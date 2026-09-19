// Shared coach monitor for the website and mobile app. Database RLS remains the
// authority; snapshots are re-read even when empty so reconnects and revoked
// coach links cannot leave a monitor frozen on an old result.
import { bsValidLivePayload, bsValidLiveCoachPayload } from './liveProgress.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
let sequence = 0;

export function watchLiveWorkout({ db, clientId, onChange }) {
  let stopped = false;
  let connected = false;
  let hydrated = false;
  let reconnecting = false;
  let lastSyncedAt = null;
  let owner;
  const rows = { publicRow: null, coachRow: null };
  const revisions = { publicRow: 0, coachRow: 0 };
  const pending = { publicRow: null, coachRow: null };
  const again = { publicRow: false, coachRow: false };
  const tables = { publicRow: 'user_activity_live', coachRow: 'user_activity_live_coach' };
  const uid = typeof clientId === 'string' ? clientId.toLowerCase() : '';
  const clean = (row, key) => {
    if (!row || !(Date.parse(row.expires_at) > Date.now())) return null;
    const valid = key === 'coachRow' ? bsValidLiveCoachPayload(row.payload) : bsValidLivePayload(row.payload);
    return valid && valid.kind !== 'cooking' ? { ...row, payload: valid } : null;
  };
  const emit = () => {
    if (stopped) return;
    for (const key of Object.keys(rows)) rows[key] = clean(rows[key], key);
    const row = rows.coachRow || rows.publicRow;
    const fresh = row && Number.isFinite(Date.parse(row.updated_at)) && Date.now() - Date.parse(row.updated_at) < 45000;
    const status = reconnecting ? 'reconnecting' : !hydrated && !connected ? 'connecting' : !row ? 'idle' : fresh ? 'live' : 'stale';
    try { onChange({ ...rows, status, lastSyncedAt }); } catch {}
  };
  emit();
  if (!db || !UUID.test(uid)) { hydrated = true; emit(); return () => { stopped = true; }; }

  const read = async (key) => {
    if (stopped) return;
    if (pending[key]) { again[key] = true; return; }
    const revision = revisions[key];
    const controller = new AbortController();
    pending[key] = controller;
    const deadline = setTimeout(() => controller.abort(), 20000);
    try {
      const result = await db.from(tables[key]).select('payload, started_at, updated_at, expires_at')
        .eq('user_id', uid).gt('expires_at', new Date().toISOString()).abortSignal(controller.signal).maybeSingle();
      if (stopped || revision !== revisions[key]) return;
      // Failed authorization/network reads must retire previously held data.
      rows[key] = result.error ? null : clean(result.data, key);
      if (!result.error) lastSyncedAt = Date.now();
      else reconnecting = true;
      hydrated = true;
      emit();
    } catch {
      if (stopped || revision !== revisions[key]) return;
      rows[key] = null; hydrated = true; reconnecting = true; emit();
    } finally {
      clearTimeout(deadline);
      pending[key] = null;
      if (again[key] && !stopped) { again[key] = false; void read(key); }
    }
  };
  const refresh = () => {
    if (stopped) return;
    if (connected) reconnecting = false;
    void read('publicRow'); void read('coachRow');
  };
  const event = (key, payload) => {
    if (stopped) return;
    const record = payload.eventType === 'DELETE' ? payload.old : payload.new;
    // Supabase does not apply postgres_changes filters to DELETE events.
    if (typeof record?.user_id !== 'string' || record.user_id.toLowerCase() !== uid) return;
    revisions[key]++;
    rows[key] = payload.eventType === 'DELETE' ? null : clean(record, key);
    hydrated = true; lastSyncedAt = Date.now(); emit();
  };
  const channel = db.channel(`coach-watch-${uid}-${++sequence}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: tables.publicRow, filter: `user_id=eq.${uid}` }, p => event('publicRow', p))
    .on('postgres_changes', { event: '*', schema: 'public', table: tables.coachRow, filter: `user_id=eq.${uid}` }, p => event('coachRow', p))
    .subscribe(status => {
      if (stopped) return;
      connected = status === 'SUBSCRIBED';
      reconnecting = !connected;
      if (connected) refresh();
      emit();
    });
  refresh();
  const timer = setInterval(() => { emit(); refresh(); }, 15000);
  const wake = () => refresh();
  globalThis.addEventListener?.('online', wake);
  globalThis.addEventListener?.('focus', wake);
  let authSubscription;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    pending.publicRow?.abort(); pending.coachRow?.abort();
    clearInterval(timer);
    globalThis.removeEventListener?.('online', wake);
    globalThis.removeEventListener?.('focus', wake);
    try { db.removeChannel(channel); } catch {}
    try { authSubscription?.unsubscribe(); } catch {}
  };
  // Supabase emits INITIAL_SESSION when registering. Token refresh for the
  // same user is harmless; a logout/account switch invalidates every read.
  authSubscription = db.auth?.onAuthStateChange?.((eventName, session) => {
    const nextOwner = session?.user?.id || null;
    if (owner === undefined && eventName !== 'SIGNED_OUT') { owner = nextOwner; return; }
    if (eventName === 'SIGNED_OUT' || owner !== nextOwner) {
      rows.publicRow = null; rows.coachRow = null;
      hydrated = true; reconnecting = false; lastSyncedAt = null;
      emit(); stop();
    }
  })?.data?.subscription;
  return stop;
}
