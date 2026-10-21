import React from 'react';
import { noticeText } from '../services/noticeCopy.mjs';
// ─── NOTIFICATIONS (the bell's list) ─────────────────────────────────────────
// The in-app feed behind /api/notifications. Tapping a notification marks it read and, when it
// carries a route, opens it (onRoute). Moved out of iosAppBroadsheetClient.jsx when Clear all was
// added (owner, 2026-10-16: "add clear all to the app too"), as BSLeaderboard was.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. This file is a static import of
// the client module, so it evaluates before that module's body has put BSDetailHeader on window;
// a top-level read would capture undefined (React error #130).
//
// ⚠ CLEAR ALL HIDES, IT NEVER DELETES. The server stamps notifications.cleared_at and its list
// leaves those rows out (#2386): the prep-reminder cron, the waiting-list notice and the email
// cooldown read earlier rows as their record of what was sent. The app shows every type, so its
// clear covers every type, the phone-only reminders included; the website's leaves those alone.

// The i18n translator for this module (the self-contained copy every feature module carries).
function useShapeTr() {
  const [, force] = React.useState(0);
  React.useEffect(() => {
    const unsub = window.ShapeLocale?.subscribe?.(() => force((n) => n + 1));
    return typeof unsub === 'function' ? unsub : undefined;
  }, []);
  return (key, opts) => {
    const v = window.ShapeI18n?.t?.(key, opts);
    return (v == null || v === key) ? (opts?.defaultValue ?? key) : v;
  };
}

export function bsNotifAgo(iso, tr) {
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '';
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return tr('common:notifications.now', { defaultValue: 'now' });
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Accent per notification type (falls back to the theme accent).
export function bsNotifStyle(type, t) {
  const map = {
    booking_request: t.AMBER, session_confirmed: t.GREEN, session_declined: t.RUST,
    payment: t.GREEN, message: t.BLUE, workout: t.AMBER,
    meal_plan: t.RUST, program: t.ACCENT, grocery: t.RUST, general: t.ACCENT,
  };
  return map[type] || map.general;
}

// The newest row's time exactly as the server sent it: the bound of a clear, so a notice that
// arrives after the list was read stays. The server keeps microseconds a JS Date would drop.
export function bsNotifNewest(rows) {
  let best = null, bestMs = -Infinity;
  for (const r of rows || []) {
    const ms = r && typeof r.createdAt === 'string' ? Date.parse(r.createdAt) : NaN;
    if (Number.isFinite(ms) && ms > bestMs) { best = r.createdAt; bestMs = ms; }
  }
  return best;
}

// ⚠ A ROW IS SAID IN THE APP'S LANGUAGE (owner, 2026-10-21: "fix the other server notices wording
// too"). The server keeps the English it wrote; in another language the row is said again from the
// notice catalog (noticeCopy.mjs: the writer's data.copy, or a trigger row's known shape), so the list
// follows a language change. A row the catalog cannot say, and English, read as written. Window
// globals are read at call time, as everywhere in this module.
export function bsNoticeRow(n, tr) {
  let code = 'en';
  try { code = window.ShapeLocale?.get?.() || 'en'; } catch (e) { code = 'en'; }
  const locale = window.ShapeI18n?.intlLocale?.() || undefined;
  return noticeText(n, tr, { english: !code || code === 'en', locale });
}

export function BSNotifications({ onBack, onRoute = () => {} }) {
  const { useBS, BSPage, BSDetailHeader, BSFooter } = window;
  const t = useBS();
  const tr = useShapeTr();
  const [items, setItems] = React.useState(null);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  // ⚠ A READ STARTED BEFORE A CLEAR MUST NOT PAINT THE CLEARED ROWS BACK. Every read carries the
  // generation it started in; a clear moves the generation on, and a new notice arriving while a
  // clear is in flight is read again once the clear has landed.
  const gen = React.useRef(0);
  const clearing = React.useRef(false);
  const reloadAfter = React.useRef(false);

  const load = () => {
    if (clearing.current) { reloadAfter.current = true; return Promise.resolve(); }
    const g = gen.current;
    return Promise.resolve(window.ShapeNotifications?.list?.())
      .then((d) => { if (g === gen.current) setItems(Array.isArray(d?.notifications) ? d.notifications : []); })
      .catch(() => { if (g === gen.current) setItems([]); });
  };
  React.useEffect(() => {
    load();
    const unsub = window.ShapeNotifications?.subscribe?.(() => load()) || (() => {});
    return () => { try { unsub(); } catch (e) {} };
  }, []);

  const open = async (n) => {
    if (!n.read) {
      setItems((list) => (list || []).map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      window.ShapeNotifications?.markRead?.({ id: n.id }).catch(() => {});
    }
    if (n.route) onRoute(n.route, n.data || {});
  };
  const markAll = async () => {
    setItems((list) => (list || []).map((x) => ({ ...x, read: true })));
    window.ShapeNotifications?.markRead?.({ all: true }).catch(() => {});
  };
  // Optimistic, with a rollback that says so: rows that silently come back read as a button that
  // does nothing.
  const clearAll = async () => {
    const newest = bsNotifNewest(items);
    if (!newest || busy) return;
    const before = items;
    gen.current += 1;
    clearing.current = true;
    setConfirming(false);
    setFailed(false);
    setBusy(true);
    setItems([]);
    let ok = false;
    try { ok = (await window.ShapeNotifications?.clear?.({ before: newest })) === true; } catch (e) { ok = false; }
    clearing.current = false;
    setBusy(false);
    if (!ok) { setItems(before); setFailed(true); }
    // A notice that arrived while the clear was in flight is read now, whichever way it went: after
    // a failed clear too, or it stays invisible behind the restored list (Codex on #2389).
    if (reloadAfter.current) { reloadAfter.current = false; load(); }
  };

  const list = items || [];
  const unread = list.filter((n) => !n.read).length;
  const action = (on) => ({ padding: '8px 12px', borderRadius: t.RADIUS_SM, border: `1px solid ${on ? t.INK : t.RULE}`, background: 'transparent', color: on ? t.INK : t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.5 : 1 });

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={tr('common:notifications.eyebrow', { defaultValue: 'Section · Activity' })}
        kicker={tr('common:notifications.kicker', { defaultValue: 'Notifications' })}
        title={<>{tr('common:notifications.titleTop', { defaultValue: 'Your' })}<br/>{tr('common:notifications.titleBottom', { defaultValue: 'updates.' })}</>}
      />
      {list.length > 0 && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', flexWrap: 'wrap', gap: 8, padding: `0 ${t.padX}px 4px` }}>
          {confirming ? (
            <>
              <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70 }}>{tr('common:notifications.clearConfirm', { defaultValue: 'Clear all?' })}</span>
              <button onClick={clearAll} disabled={busy} style={action(true)}>{tr('common:notifications.clearYes', { defaultValue: 'Yes' })}</button>
              <button onClick={() => setConfirming(false)} style={action(false)}>{tr('common:notifications.clearCancel', { defaultValue: 'Cancel' })}</button>
            </>
          ) : (
            <>
              {unread > 0 && <button onClick={markAll} disabled={busy} style={action(true)}>{tr('common:notifications.markAll', { defaultValue: 'Mark all read' })}</button>}
              <button onClick={() => setConfirming(true)} disabled={busy} style={action(false)}>{tr('common:notifications.clearAll', { defaultValue: 'Clear all' })}</button>
            </>
          )}
        </div>
      )}
      {failed && (
        <div role="status" style={{ padding: `6px ${t.padX}px 4px`, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 500, color: t.INK70 }}>{tr('common:notifications.clearFailed', { defaultValue: 'Couldn’t clear your notifications. Try again.' })}</div>
      )}
      {items === null && (
        <div style={{ padding: `20px ${t.padX}px`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{tr('common:notifications.loading', { defaultValue: 'Loading…' })}</div>
      )}
      {items !== null && list.length === 0 && (
        <div style={{ padding: `0 ${t.padX}px 18px` }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 8 }}>{tr('common:notifications.emptyTitle', { defaultValue: 'You’re all caught up.' })}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>{tr('common:notifications.emptyBody', { defaultValue: 'Booking requests, confirmations and other updates will show up here.' })}</div>
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div style={{ padding: `12px ${t.padX}px 4px` }}>
          {list.map((n) => {
            const accent = bsNotifStyle(n.type, t);
            const said = bsNoticeRow(n, tr);
            return (
              <button key={n.id} onClick={() => open(n)} style={{
                width: '100%', textAlign: 'left', display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'start', gap: 11,
                padding: '12px 13px', marginBottom: 9, borderRadius: 13, cursor: n.route ? 'pointer' : 'default',
                border: `1px solid ${n.read ? t.RULE : accent}`, borderLeft: `3px solid ${accent}`,
                background: n.read ? 'transparent' : `${accent}14`,
              }}>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {!n.read && <span style={{ width: 6, height: 6, borderRadius: 99, background: accent, flexShrink: 0 }} />}
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: n.read ? 600 : 700, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{said.title}</span>
                  </span>
                  {said.body ? <span style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, fontWeight: 500, lineHeight: 1.35 }}>{said.body}</span> : null}
                  {n.route ? <span style={{ display: 'block', marginTop: 5, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, fontWeight: 700 }}>{tr('common:notifications.open', { defaultValue: 'Open →' })}</span> : null}
                </span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', marginTop: 2 }}>{bsNotifAgo(n.createdAt, tr)}</span>
              </button>
            );
          })}
        </div>
      )}
      <BSFooter right={tr('common:notifications.footer', { defaultValue: 'Activity' })} />
    </BSPage>
  );
}
