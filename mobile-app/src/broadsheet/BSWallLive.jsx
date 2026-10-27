import React from 'react';
import { bsValidLivePayload } from '../services/liveProgress.mjs';
import { bsWsAccent } from './bsMagazine.mjs';
// ─── THE WALL · LIVE NOW ─────────────────────────────────────────────────────────────────────────
// Owner, 2026-10-22, off the Wall mockup: "do photos and training now first". The presence rail above
// the tabs shows faces; the Wall itself opens on who is training right now, with what they are on
// (their live set, when its row is readable) and a way to cheer them on mid-set (the live boost sheet).
// Drawn as the magazine's live story since 2026-10-23 (owner, off the six-faces board: "use oswald"):
// one headline ("Devon is on set 4 of 5"), a bar segment per set, Send a boost, and the others
// training on one line under it.
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

// The signed-out preview's one sample, so the story shows what a live set looks like. Never signed in.
const BS_WALL_LIVE_SAMPLE = { work: { v: 1, exercises: [{ n: 'Bench press', done: 3, total: 5 }, { n: 'Incline press', done: 0, total: 4 }], curIdx: 0, resting: true, setsDone: 3, setsTotal: 9 }, mins: 31 };

// A set bar for one exercise: a segment per set, done, the one under way, and the rest. Past twelve
// sets the segments would be slivers, so the bar draws twelve and fills them in proportion.
export function bsWallSetSegments(done, total) {
  const n = Math.max(0, Math.min(12, Math.round(Number(total) || 0)));
  if (!n) return [];
  let d = Math.max(0, Math.min(n, Math.round(((Number(done) || 0) / Math.max(1, Number(total))) * n)));
  // A set still under way always keeps its segment: 24 of 25 rounds to all twelve, so it caps at
  // eleven until the last set is done (review: Codex).
  if ((Number(done) || 0) < (Number(total) || 0)) d = Math.min(d, n - 1);
  return Array.from({ length: n }, (_, i) => (i < d ? 'done' : i === d ? 'now' : 'left'));
}


function BSWallLiveStory({ person, sample, avatar, onBoost, onOpenProfile }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const accent = bsWsAccent(t);
  const HEAD = t.DISPLAY;
  const row = useBSLiveRow(person.userId || null);
  const realMins = useBSLiveMinutes(person.userId || null);
  const work = sample ? sample.work : bsWallLiveWork(row && row.payload);
  const mins = sample ? sample.mins : realMins;
  const cur = work && work.curIdx >= 0 && work.exercises[work.curIdx] ? work.exercises[work.curIdx] : null;
  const name = String(person.name || 'Member');
  const first = name.split(' ')[0];
  const setNow = cur ? Math.min(cur.done + 1, cur.total) : null;
  const segs = cur ? bsWallSetSegments(cur.done, cur.total) : [];
  const mono = { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' };
  return (
    <article data-bs-wall-live-card="" style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
      <span style={{ ...mono, display: 'inline-flex', alignItems: 'center', gap: 7, color: accent, letterSpacing: '0.16em' }}>
        <span aria-hidden style={{ width: 6, height: 6, borderRadius: 3, background: accent }} />
        {tr('feed:wallLive.liveNow', { defaultValue: 'Live now' })}
        {mins != null ? <span>· {tr('feed:wallLive.minIn', { defaultValue: '{n, number} min in', n: mins })}</span> : null}
      </span>
      <h3 style={{ margin: 0, fontFamily: HEAD, fontWeight: 600, fontSize: 23, lineHeight: 1.04, letterSpacing: '0.012em', textTransform: 'uppercase', color: t.INK, textWrap: 'balance' }}>
        {cur
          ? tr('feed:wallLive.onSet', { defaultValue: '{name} is on set {n, number} of {total, number}', name: first, n: setNow, total: cur.total })
          : tr('feed:wallLive.isTraining', { defaultValue: '{name} is training', name: first })}
      </h3>
      <button type="button" onClick={onOpenProfile} style={{ alignSelf: 'flex-start', display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, margin: '-8px 0', padding: 0, border: 0, background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'inherit', font: 'inherit', maxWidth: '100%' }}>
        {avatar}
        <span style={{ minWidth: 0, fontFamily: t.BODY, fontSize: 13, color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          <b style={{ color: t.INK, fontWeight: 600 }}>{name}</b>{cur ? ` · ${cur.n}` : ''}
        </span>
      </button>
      {work ? (
        <div data-bs-wall-live-set="">
          {segs.length ? (
            <div aria-hidden style={{ display: 'flex', gap: 3 }}>
              {segs.map((k, i) => (
                <span key={i} data-seg={k} style={{ flex: 1, height: 7, background: k === 'done' ? accent : k === 'now' ? `${accent}5c` : t.HAIR }} />
              ))}
            </div>
          ) : null}
          <div style={{ ...mono, marginTop: 7, display: 'flex', justifyContent: 'space-between', gap: 10, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>
            <span>{tr('feed:boost.liveSets', { done: work.setsDone, total: work.setsTotal, defaultValue: '{done, number}/{total, number} sets' })}</span>
            {work.resting ? <span>{tr('feed:wallLive.resting', { defaultValue: 'Resting' })}</span> : null}
          </div>
        </div>
      ) : null}
      <button type="button" data-bs-wall-live-boost="" onClick={onBoost} style={{ marginTop: 3, width: '100%', minHeight: 46, border: 0, borderRadius: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: HEAD, fontSize: 17, fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
        {tr('feed:wallLive.sendBoost', { defaultValue: 'Send a boost →' })}
      </button>
    </article>
  );
}

// `people` are the presence rail's people ({ name, userId?, activity, ... }); only those in a workout
// show, and nothing at all when none is. The first leads as the story; up to three more are named on
// the line under it, each a door to their own boost. `demo` is the signed-out preview: its lead carries
// the one sample set. `avatar(person)` draws the face; `onBoost` and `onOpenProfile` open the live
// boost sheet and the profile.
export function BSWallTrainingNow({ people = [], demo = false, avatar, onBoost, onOpenProfile }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const training = people.filter((p) => p && p.activity === 'workout');
  if (!training.length) return null;
  const lead = training[0];
  const also = training.slice(1, 4);
  return (
    // On the cards' 12px gutter, so the masthead, this story and the posts share one column edge.
    <section data-bs-wall-live="" style={{ margin: '0 12px', padding: '16px 0 14px', borderBottom: `1px solid ${t.INK}` }}>
      <BSWallLiveStory key={lead.userId || lead.name} person={lead} sample={demo ? BS_WALL_LIVE_SAMPLE : null}
        avatar={typeof avatar === 'function' ? avatar(lead) : null}
        onBoost={() => onBoost && onBoost(lead)} onOpenProfile={() => onOpenProfile && onOpenProfile(lead)} />
      {also.length ? (
        <div data-bs-wall-live-also="" style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 4, fontFamily: t.BODY, fontSize: 13, color: t.INK50 }}>
          <span>{tr('feed:wallLive.alsoTraining', { defaultValue: 'Also training:' })}</span>
          {also.map((p, i) => (
            <button key={p.userId || p.name || i} type="button" onClick={() => onBoost && onBoost(p)}
              style={{ minHeight: 44, padding: '0 2px', border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.BODY, fontSize: 13, fontWeight: 600, color: t.INK, textDecoration: 'underline', textDecorationColor: t.HAIR, textUnderlineOffset: 3 }}>
              {String(p.name || 'Member').split(' ')[0]}{i < also.length - 1 ? ',' : ''}
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
