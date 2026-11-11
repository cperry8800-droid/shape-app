import React from 'react';
import { createPortal } from 'react-dom';
import {
  deviceZone, normalizeZone, getAccountZone, setAccountZone, onZoneChange, zoneOptions, zoneName, zoneNamesApart, zoneCity,
  travelAsk, declinedZone,
} from '../services/shapeZone.mjs';
import { bsZoneOnOpen, bsZoneSwitch, bsZoneKeep } from '../services/accountZone.mjs';
import { signOutGen, signOutInProgress } from '../services/signOutGen.mjs';
import { bsDialogRef } from '../services/dialogBack.mjs';
// ─── TIME ZONE · ONE CLOCK PER ACCOUNT (P9, owner 2026-11-05) ─────────────────────────────────────
// "all time zones should be set by user", and times from another person "should automatically
// update to their own timezone". The account holds one zone (GET/PUT /api/me/timezone through
// window.ShapeProfile; services/accountZone.mjs); every time prints on it (services/shapeZone.mjs).
//
//   BSTimezoneCheck    the open-time flow, mounted once by the app shell (iosAppBroadsheetMain.jsx)
//                      over every role: the first sign-in sets this device's zone as the default,
//                      a set zone is remembered, and a device on another clock later is asked
//                      about. Again when the app comes back to the foreground.
//   BSTimezonePrompt   that question: switch to this device's zone, or keep the account's.
//   BSTimezoneSetting  Settings → Time zone, under Language (BSSettings, shared by the coach apps).
//
// ⚠ THE DEVICE IS A DEFAULT, NEVER A SWITCH. Nothing here moves a set zone without the person
// choosing it: the prompt asks, and "Keep" is remembered for that device zone (declineDeviceZone).
// ⚠ BEFORE THE MIGRATION (`ready: false`) NOTHING SHOWS: no row, no prompt, no write.
// ⚠ NEVER A PICKER OVER AN UNREAD VALUE. A failed read says so and offers a retry; it is not "no
// zone set", which would invite a save over the zone it couldn't read.
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (useBS, ShapeProfile, ShapeAuth, ShapeI18n), never at
// module top: the shell imports this file before the client module has run. It never imports back
// into iosAppBroadsheetClient.jsx (the BSIntegrationsPage / BSLeaderboard pattern).

const { useState, useEffect, useMemo, useRef } = React;

// The i18n translator for this module (the self-contained copy every feature module carries).
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

const tealOf = (t) => (t.isLight ? '#0a8f87' : '#34d6c5');
// A zone as a sentence names it ("Eastern Standard Time"; owner, 2026-11-10: "just have it show
// normally"), in the app's language (read at call time). The picker's options keep zoneLabel's
// "New York · GMT-5": there, only the city tells Detroit from New York.
const bsZoneOpts = () => ({ locale: window.ShapeLocale?.get?.() || undefined });
const bsZoneName = (z) => zoneName(z, bsZoneOpts()) || z;
function hexA(hex, a) {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  if (!Number.isFinite(n)) return `rgba(136, 136, 136, ${a})`;
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}

const signedInUid = () => window.ShapeAuth?.getCachedState?.()?.user?.id || null;

// Whether the account that started a read or a write is still the one signed in: false after a
// sign-out started (the shared counter signOut() bumps first) or another account signed in. An
// answer for a gone account is dropped, never remembered for the next one.
export function bsZoneSession(uid) {
  const gen = signOutGen();
  return () => !!uid && gen === signOutGen() && !signOutInProgress() && signedInUid() === uid;
}

// How long a foreground return trusts the last good read before asking the server again. The
// device's own clock is checked every time; this only spares a read per app switch.
export const BS_ZONE_REREAD_MS = 5 * 60 * 1000;

// ── The open-time flow ────────────────────────────────────────────────────────────────────────────
// `uid` and `ready` are the shell's signed-in account and its restored session (the shell's own
// authReady: a cold boot's cached token can be the expired one). `canAsk` holds the prompt back
// until the app itself is on screen (not over the splash, the paywall or the age check); the zone
// is learned and remembered either way.
export function BSTimezoneCheck({ uid = null, ready = true, coach = false, canAsk = true }) {
  const [ask, setAsk] = useState(null); // { account, device } while the question stands
  useEffect(() => {
    setAsk(null);
    if (!uid || !ready) return undefined;
    let alive = true;
    let running = false;
    let readAt = 0;
    let lastState = null;
    let known = null; // the account's zone as this flow last learned it
    const session = bsZoneSession(uid);
    const isCurrent = () => alive && session();
    const decide = () => {
      if (!isCurrent()) return;
      const device = deviceZone();
      if (known && travelAsk({ account: known, device, declined: declinedZone() })) {
        setAsk((a) => (a && a.account === known && a.device === device ? a : { account: known, device }));
      } else {
        setAsk(null);
      }
    };
    const run = async () => {
      if (running) return;
      running = true;
      readAt = Date.now();
      try {
        const out = await bsZoneOnOpen({ api: window.ShapeProfile || {}, device: deviceZone(), isCurrent });
        if (!isCurrent()) return;
        lastState = out.state;
        if (out.state === 'set') { known = out.account; decide(); }
      } finally { running = false; }
    };
    run();
    // Back in the foreground: the phone may have landed somewhere else. A failed read is retried at
    // once; a good one (or "not ready") is trusted for BS_ZONE_REREAD_MS.
    const onVisible = () => {
      if (typeof document === 'undefined' || document.visibilityState !== 'visible') return;
      const trusted = (lastState === 'set' || lastState === 'not_ready' || lastState === 'unset') && Date.now() - readAt < BS_ZONE_REREAD_MS;
      if (trusted) decide(); else run();
    };
    // The zone changed here (Settings, or this prompt's own switch): ask again against it.
    const offZone = onZoneChange(() => {
      if (!isCurrent()) return;
      const z = getAccountZone();
      if (z) { known = z; lastState = 'set'; }
      decide();
    });
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      alive = false;
      offZone();
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid, ready]);
  if (!ask || !canAsk) return null;
  return <BSTimezonePrompt account={ask.account} device={ask.device} coach={coach} onClose={() => setAsk(null)} />;
}

// ── The travel question ──────────────────────────────────────────────────────────────────────────
// `account` and `device` are zone names. "Switch" writes the device's zone and remembers it; a
// failed switch says so and keeps the account's. "Keep" is remembered for this device zone.
// `onClose(answer)` is called with 'switched' or 'kept'. The backdrop does not dismiss it: "Keep"
// is the no-change answer, and a tap past the sheet would otherwise ask again on the next open.
export function BSTimezonePrompt({ account, device, coach = false, onClose }) {
  const t = window.useBS();
  const tr = useShapeTr();
  const teal = tealOf(t);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const mounted = useRef(true);
  const panel = useRef(null);
  useEffect(() => {
    mounted.current = true;
    try { panel.current?.focus?.(); } catch (e) {}
    return () => { mounted.current = false; };
  }, []);
  const deviceCity = zoneCity(device);
  const accountCity = zoneCity(account);
  const doSwitch = async () => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const out = await bsZoneSwitch({ api: window.ShapeProfile || {}, to: device, isCurrent: bsZoneSession(signedInUid()) });
    if (!mounted.current) return;
    setBusy(false);
    if (out.ok) { if (onClose) onClose('switched'); }
    else if (!out.stale) setFailed(true);
  };
  const keep = () => {
    if (busy) return;
    bsZoneKeep(device);
    if (onClose) onClose('kept');
  };
  const [accountName, deviceName] = zoneNamesApart(account, device, bsZoneOpts());
  const line = (label, zone, name) => (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 12, padding: '9px 0', borderTop: `1px solid ${t.HAIR}` }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{label}</span>
      <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 650, color: t.INK, textAlign: 'right' }}>{name || zone}</span>
    </div>
  );
  const title = tr('settings:timezone.askTitle', { defaultValue: 'This device is on another clock' });
  const sheet = (
    <div data-bs-timezone="ask" style={{ position: 'absolute', inset: 0, zIndex: 240, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div ref={bsDialogRef(null, panel)} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} data-bs-dialog="stay"
        style={{ width: '100%', boxSizing: 'border-box', outline: 'none', background: t.PAPER, color: t.INK, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, padding: `20px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase', color: teal }}>{tr('settings:timezone.row', { defaultValue: 'Time zone' })}</div>
        <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1.2, color: t.INK }}>{title}</div>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>{tr('settings:timezone.askBody', { defaultValue: 'Times on Shape show on your account’s clock. Switch it to this device’s, or keep it?' })}</div>
        <div style={{ marginTop: 12, borderBottom: `1px solid ${t.HAIR}` }}>
          {line(tr('settings:timezone.askAccount', { defaultValue: 'Your account' }), account, accountName)}
          {line(tr('settings:timezone.askDevice', { defaultValue: 'This device' }), device, deviceName)}
        </div>
        {coach && <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.45, color: t.INK70 }}>{tr('settings:timezone.coachHours', { defaultValue: 'Your hours stay at the same times on the new clock. Sessions already booked don’t move.' })}</div>}
        {failed && <div role="alert" style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.4, color: t.RUST }}>{tr('settings:timezone.switchFailed', { defaultValue: 'Couldn’t switch. Your time zone is still {city}.', city: accountCity })}</div>}
        <button type="button" disabled={busy} onClick={doSwitch}
          style={{ marginTop: 16, width: '100%', minHeight: 48, border: 0, borderRadius: 12, background: teal, color: t.isLight ? '#fff' : '#04201d', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {busy ? tr('settings:timezone.switching', { defaultValue: 'Switching…' }) : tr('settings:timezone.switch', { defaultValue: 'Switch to {city}', city: deviceCity })}
        </button>
        <button type="button" disabled={busy} onClick={keep}
          style={{ marginTop: 8, width: '100%', minHeight: 44, borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: busy ? 'default' : 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>
          {tr('settings:timezone.keep', { defaultValue: 'Keep {city}', city: accountCity })}
        </button>
        <div style={{ marginTop: 10, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', color: t.INK50 }}>{tr('settings:timezone.askLater', { defaultValue: 'You can change it any time in Settings.' })}</div>
      </div>
    </div>
  );
  const host = (typeof document !== 'undefined' && (document.getElementById('bs-phone-surface') || document.body)) || null;
  return host ? createPortal(sheet, host) : sheet;
}

// ── Settings → Time zone ─────────────────────────────────────────────────────────────────────────
// The BSLanguageSetting row (label + a native dropdown), over every zone this runtime knows plus the
// account's and the device's. It reads the account's zone itself each time Settings opens, and
// saves on change: Saving…, Saved, or "Couldn't save. Still <zone>." with the old zone selected.
export function BSTimezoneSetting({ t, coach = false }) {
  const tr = useShapeTr();
  const teal = tealOf(t);
  const uid = signedInUid();
  // read.kind: 'loading' (first read out: nothing drawn), 'retrying', 'failed', 'hidden' (before
  // the migration) or 'ready'. read.zone is the account's zone (null: none set) once ready.
  const [read, setRead] = useState({ kind: 'loading', zone: null });
  const [save, setSave] = useState({ kind: 'idle', to: null }); // 'idle' | 'saving' | 'saved' | 'failed'
  const [attempt, setAttempt] = useState(0);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const device = deviceZone();

  useEffect(() => {
    if (!uid) return undefined;
    let on = true;
    const isCurrent = bsZoneSession(uid);
    Promise.resolve()
      .then(() => window.ShapeProfile?.getAccountTimezone?.())
      .catch(() => null)
      .then((r) => {
        if (!on || !isCurrent()) return;
        if (!r || r.ok !== true) { setRead({ kind: 'failed', zone: null }); return; }
        if (r.ready !== true) { setRead({ kind: 'hidden', zone: null }); return; }
        // A fresh read is the account's word: every screen prints on it from here.
        setRead({ kind: 'ready', zone: setAccountZone(r.timezone) });
      });
    return () => { on = false; };
  }, [uid, attempt]);

  // Another screen changed the zone (the travel prompt): show it.
  useEffect(() => onZoneChange(() => {
    if (!mounted.current) return;
    setRead((r) => (r.kind === 'ready' ? { ...r, zone: getAccountZone() } : r));
  }), []);

  const options = useMemo(
    () => (read.kind === 'ready' ? zoneOptions({ include: [read.zone, device, save.to].filter(Boolean) }) : []),
    [read.kind, read.zone, device, save.to],
  );

  if (!uid || read.kind === 'loading' || read.kind === 'hidden') return null;

  const label = tr('settings:timezone.row', { defaultValue: 'Time zone' });
  // A row on Customize's Language & time plate, under Language: the hairline between the two, the
  // name, and the select in the lit slot's well.
  const rowStyle = { padding: '12px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 };
  const wrapStyle = { borderTop: `1px solid ${hexA(t.INK, 0.1)}` };
  const labelEl = (
    <div style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: t.INK, letterSpacing: '-0.01em' }}>{label}</div>
  );
  const small = { fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.45, color: t.INK70 };
  const status = { fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' };

  if (read.kind === 'failed' || read.kind === 'retrying') {
    const retrying = read.kind === 'retrying';
    return (
      <div data-bs-timezone="setting" style={wrapStyle}>
        <div style={rowStyle}>
          {labelEl}
          <button type="button" disabled={retrying} onClick={() => { setRead({ kind: 'retrying', zone: null }); setAttempt((n) => n + 1); }}
            style={{ flexShrink: 0, minHeight: 40, padding: '0 14px', borderRadius: 10, border: `1px solid ${teal}`, background: 'transparent', color: t.INK, cursor: retrying ? 'default' : 'pointer', opacity: retrying ? 0.6 : 1, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            {tr('settings:timezone.retry', { defaultValue: 'Try again' })}
          </button>
        </div>
        <div role={retrying ? 'status' : 'alert'} style={{ ...small, padding: '0 14px 12px' }}>
          {retrying
            ? tr('settings:timezone.reading', { defaultValue: 'Reading your time zone…' })
            : tr('settings:timezone.readFailed', { defaultValue: 'Couldn’t read your time zone.' })}
        </div>
      </div>
    );
  }

  const saving = save.kind === 'saving';
  const choose = async (raw) => {
    const to = normalizeZone(raw);
    if (!to || saving || to === read.zone) return;
    setSave({ kind: 'saving', to });
    // `device`: a zone picked here away from this device's is "keep mine" for this device's clock,
    // so the travel question doesn't follow the pick (accountZone.mjs bsZoneSwitch).
    const out = await bsZoneSwitch({ api: window.ShapeProfile || {}, to, isCurrent: bsZoneSession(uid), device });
    if (!mounted.current || out.stale) return;
    if (out.ok) { setRead({ kind: 'ready', zone: out.account }); setSave({ kind: 'saved', to: null }); }
    else if (out.notReady) { setRead({ kind: 'hidden', zone: null }); setSave({ kind: 'idle', to: null }); }
    else setSave({ kind: 'failed', to: null });
  };
  const value = saving ? save.to : (read.zone || '');
  const offerDevice = !!device && device !== read.zone && !saving;
  return (
    <div data-bs-timezone="setting" style={wrapStyle}>
      <div style={rowStyle}>
        {labelEl}
        <select value={value} disabled={saving} onChange={(e) => choose(e.target.value)} aria-label={label}
          style={{ flexShrink: 0, maxWidth: 190, minHeight: 40, padding: '8px 12px', borderRadius: 10, border: `1px solid ${hexA(teal, t.isLight ? 0.5 : 0.55)}`, background: t.isLight ? hexA(t.INK, 0.05) : 'rgba(0,0,0,0.45)', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, cursor: saving ? 'default' : 'pointer', opacity: saving ? 0.7 : 1 }}>
          {!read.zone && !saving && <option value="" disabled>{tr('settings:common.notSet', { defaultValue: 'Not set' })}</option>}
          {options.map((o) => <option key={o.zone} value={o.zone}>{o.label}</option>)}
        </select>
      </div>
      <div style={{ padding: '0 14px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {save.kind !== 'idle' && (
          <div role={save.kind === 'failed' ? 'alert' : 'status'} style={{ ...status, color: save.kind === 'failed' ? t.RUST : save.kind === 'saved' ? teal : t.INK50 }}>
            {save.kind === 'saving' ? tr('settings:timezone.saving', { defaultValue: 'Saving…' })
              : save.kind === 'saved' ? tr('settings:toast.saved', { defaultValue: 'Saved' })
              : read.zone ? tr('settings:timezone.saveFailed', { defaultValue: 'Couldn’t save. Still {zone}.', zone: bsZoneName(read.zone) })
              : tr('settings:timezone.saveFailedNone', { defaultValue: 'Couldn’t save. Try again.' })}
          </div>
        )}
        {offerDevice && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <span style={small}>{tr('settings:timezone.deviceIs', { defaultValue: 'This device: {zone}', zone: bsZoneName(device) })}</span>
            <button type="button" onClick={() => choose(device)}
              style={{ flexShrink: 0, minHeight: 36, padding: '0 12px', borderRadius: 999, border: `1px solid ${teal}`, background: hexA(teal, 0.12), color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
              {tr('settings:timezone.useDevice', { defaultValue: 'Use this device’s time zone' })}
            </button>
          </div>
        )}
        <div style={small}>{tr('settings:timezone.hint', { defaultValue: 'Every time on Shape shows on this clock.' })}</div>
        {coach && <div style={small}>{tr('settings:timezone.coachHours', { defaultValue: 'Your hours stay at the same times on the new clock. Sessions already booked don’t move.' })}</div>}
      </div>
    </div>
  );
}
