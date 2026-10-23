import React from 'react';
import { bsValidLivePayload } from '../services/liveProgress.mjs';
// ─── THE WALL · TRAINING NOW ─────────────────────────────────────────────────────────────────────
// Owner, 2026-10-22, off the Wall mockup: "do photos and training now first". The presence rail above
// the tabs shows faces; the Wall itself now opens on who is training right now, with what they are on
// (their live set, when its row is readable) and a way to cheer them on mid-set (the live boost sheet).
// Window globals are read at call time and the module never imports back into the client module (the
// BSIntegrationsPage / BSLeaderboard pattern); the client passes its avatar in.

const { useState, useEffect } = React;

function useShapeTr() {
  const [, force] = useState(0);
  useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

// A member's live row (spec 2026-07-18), read as the live boost sheet reads it: RLS decides who sees
// it, a realtime event wins over the first read that lands after it (TOCTOU), and a row past its
// expiry is absence, on arrival and once its time passes (CWE-359). Demo people (no id) read nothing.
export function useBSLiveRow(userId) {
  const [live, setLive] = useState(null);
  useEffect(() => {
    if (!userId || !window.ShapeLiveProgress) return undefined;
    let on = true; let expTimer = null; let evented = false;
    const take = (row, fromEvent) => {
      if (!on) return;
      if (fromEvent) evented = true; else if (evented) return;
      const expMs = row && row.expires_at ? new Date(row.expires_at).getTime() - Date.now() : 0;
      if (row && !(expMs > 0)) row = null;   // expired OR invalid/NaN expiry = absence (NaN fails > 0)
      setLive(row);
      if (expTimer) { clearTimeout(expTimer); expTimer = null; }
      if (row && expMs > 0) expTimer = setTimeout(() => { if (on) setLive(null); }, expMs);
    };
    window.ShapeLiveProgress.get(userId).then((r) => take(r, false)).catch(() => {});
    const off = window.ShapeLiveProgress.subscribe(userId, (r) => take(r, true));
    return () => { on = false; if (expTimer) clearTimeout(expTimer); off(); };
  }, [userId]);
  return live;
}

// Minutes since they started, only when started_at is readable (and under six hours). The start is read
// once and the clock keeps moving: a Wall card stays mounted through the rail's refreshes, so "12 min
// in" has to become 13 on its own (review: Codex).
export function useBSLiveMinutes(userId) {
  const [startMs, setStartMs] = useState(null);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setStartMs(null);
    if (!userId || !window.ShapePresence?.activityDetail) return undefined;
    let on = true;
    window.ShapePresence.activityDetail(userId).then((d) => {
      if (!on || !d || !d.startedAt) return;
      const s = new Date(d.startedAt).getTime();
      if (Number.isFinite(s)) { setNow(Date.now()); setStartMs(s); }
    }).catch(() => {});
    return () => { on = false; };
  }, [userId]);
  useEffect(() => {
    if (startMs == null) return undefined;
    const tick = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(tick);
  }, [startMs]);
  if (startMs == null) return null;
  const m = Math.round((now - startMs) / 60000);
  return m >= 0 && m < 6 * 60 ? Math.max(1, m) : null;
}

// The workout half of a live payload, or null: a cooking row or a malformed one says nothing here.
export function bsWallLiveWork(payload) {
  const lp = payload ? bsValidLivePayload(payload) : null;
  return lp && (!lp.kind || lp.kind === 'workout') ? lp : null;
}

// The signed-out preview's one sample, so the card shows what a live set looks like. Never signed in.
const BS_WALL_LIVE_SAMPLE = { work: { v: 1, exercises: [{ n: 'Bench press', done: 3, total: 5 }, { n: 'Incline press', done: 0, total: 4 }], curIdx: 0, resting: true, setsDone: 3, setsTotal: 9 }, mins: 31 };

function BSWallLiveCard({ person, sample, avatar, onBoost, onOpenProfile }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const fill = t.isLight ? '#08776f' : teal;
  const row = useBSLiveRow(person.userId || null);
  const realMins = useBSLiveMinutes(person.userId || null);
  const work = sample ? sample.work : bsWallLiveWork(row && row.payload);
  const mins = sample ? sample.mins : realMins;
  const cur = work && work.curIdx >= 0 && work.exercises[work.curIdx] ? work.exercises[work.curIdx] : null;
  const first = String(person.name || 'Member').split(' ')[0];
  const pct = work && work.setsTotal ? Math.round((work.setsDone / work.setsTotal) * 100) : 0;
  return (
    <article data-bs-wall-live-card="" style={{ marginTop: 10, borderRadius: 16, background: t.PAPER2 || t.PAPER, border: t.isLight ? 0 : `1px solid ${t.HAIR}`, padding: 12, boxShadow: t.isLight ? '0 10px 24px -20px rgba(15,14,12,0.5)' : 'none' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={onOpenProfile} style={{ flex: 1, minWidth: 0, minHeight: 44, display: 'flex', alignItems: 'center', gap: 10, padding: 0, border: 0, background: 'transparent', textAlign: 'left', cursor: 'pointer', color: 'inherit', font: 'inherit' }}>
          {avatar}
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 600, letterSpacing: '-0.01em', color: t.INK }}>{tr('feed:wallLive.isTraining', { defaultValue: '{name} is training', name: first })}</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.RUST }}>
                <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: t.RUST }} />
                {tr('feed:wallLive.live', { defaultValue: 'Live' })}
              </span>
            </span>
            {mins != null ? <span style={{ display: 'block', fontFamily: t.BODY, fontSize: 12, color: t.INK50 }}>{tr('feed:wallLive.minIn', { defaultValue: '{n, number} min in', n: mins })}</span> : null}
          </span>
        </button>
        <button type="button" data-bs-wall-live-boost="" onClick={onBoost} style={{ flex: 'none', minHeight: 44, padding: '0 15px', border: 0, borderRadius: 999, background: fill, color: t.isLight ? '#fff' : t.PAPER, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600, whiteSpace: 'nowrap' }}>
          {tr('feed:wallLive.boost', { defaultValue: 'Boost →' })}
        </button>
      </div>
      {work ? (
        <div data-bs-wall-live-set="" style={{ marginTop: 10, padding: '10px 12px', borderRadius: 12, background: t.PAPER }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cur ? cur.n : tr('feed:wallLive.inSession', { defaultValue: 'In a session' })}</span>
            {cur ? <span style={{ flex: 'none', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{tr('feed:boost.liveSet', { done: Math.min(cur.done + 1, cur.total), total: cur.total, defaultValue: 'set {done, number} of {total, number}' })}</span> : null}
          </div>
          <div aria-hidden style={{ marginTop: 8, height: 6, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
            <div style={{ width: `${pct}%`, height: '100%', borderRadius: 999, background: t.RUST }} />
          </div>
          <div style={{ marginTop: 6, fontFamily: t.BODY, fontSize: 12, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>
            {tr('feed:boost.liveSets', { done: work.setsDone, total: work.setsTotal, defaultValue: '{done, number}/{total, number} sets' })}
            {work.resting ? ` · ${tr('feed:wallLive.resting', { defaultValue: 'Resting' })}` : ''}
          </div>
        </div>
      ) : null}
    </article>
  );
}

// `people` are the presence rail's people ({ name, userId?, activity, ... }); only those in a workout
// show, three at most, and nothing at all when none is. `demo` is the signed-out preview: its first
// person carries the one sample set. `avatar(person)` draws the face; `onBoost` and `onOpenProfile`
// open the live boost sheet and the profile.
export function BSWallTrainingNow({ people = [], demo = false, avatar, onBoost, onOpenProfile }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const training = people.filter((p) => p && p.activity === 'workout').slice(0, 3);
  if (!training.length) return null;
  return (
    <section data-bs-wall-live="" style={{ padding: `8px ${t.padX}px 6px` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: teal, boxShadow: `0 0 0 3px ${teal}33` }} />
        <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal }}>{tr('feed:wallLive.title', { defaultValue: 'Training now' })}</span>
      </div>
      {training.map((p, i) => (
        <BSWallLiveCard key={p.userId || p.name || i} person={p} sample={demo && i === 0 ? BS_WALL_LIVE_SAMPLE : null}
          avatar={typeof avatar === 'function' ? avatar(p) : null}
          onBoost={() => onBoost && onBoost(p)} onOpenProfile={() => onOpenProfile && onOpenProfile(p)} />
      ))}
    </section>
  );
}
