import React from 'react';
import { readClientPause, writeClientPause, pauseBounds, pauseHolds, validPauseDay } from '../services/clientPause.mjs';

// A client's break, "away until <date>" (owner, 2026-11-11; services/clientPause.mjs): set by the
// member or any of their coaches. While it holds, the alerts that read their absence and their own
// reminders stay quiet, and every coach sees "Away until …"; when it ends, "Back from a break".
//   BSPauseSetting      the member's Settings → Away (their own break).
//   BSClientPauseCard   a coach's case file, under the coach note (a client's break).
// ⚠ NOT "PAUSE MEMBERSHIP". Settings already has that request, which is about the membership; this is
// a break from the reminders and alerts, and its words say "away" and "break", never "pause".
// ⚠ NEVER A DATE PICKER OVER AN UNREAD BREAK: a failed read says so and offers a retry, and the card
// stays hidden before the migration runs (the function not there yet).
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (ShapeAuth, ShapeI18n, ShapeLocale), never at module top, and
// this file never imports back into a client module (the BSCoachNote / BSTimezone pattern).

const { useState, useEffect, useRef } = React;

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
const currentUid = () => window.ShapeAuth?.getCachedState?.().user?.id || null;
const dbClient = () => window.ShapeAuth?.client || null;
// "Thu, Nov 20" in the reader's language, from a YYYY-MM-DD day (read as that calendar day).
function dayLabel(day, locale) {
  const [y, m, d] = String(day).split('-').map(Number);
  try { return new Intl.DateTimeFormat(locale || undefined, { weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(y, m - 1, d, 12)); }
  catch { return day; }
}

// The read and write, bound to the account they started under: a switch of account mid-flight drops
// the answer rather than drawing one account's break under another.
function usePause(clientId) {
  const [read, setRead] = useState({ kind: 'loading', pause: null });
  const [save, setSave] = useState({ kind: 'idle' });
  const [attempt, setAttempt] = useState(0);
  const gen = useRef(0);
  useEffect(() => {
    const uid = currentUid();
    if (!uid || !clientId) { setRead({ kind: 'preview', pause: null }); return undefined; }
    const mine = ++gen.current;
    let on = true;
    setRead((r) => ({ kind: r.kind === 'ready' ? 'ready' : 'loading', pause: r.pause }));
    readClientPause(dbClient(), clientId).then((r) => {
      if (!on || gen.current !== mine || currentUid() !== uid) return;
      if (!r.ok) setRead({ kind: 'failed', pause: null });
      else if (!r.ready) setRead({ kind: 'hidden', pause: null });
      else setRead({ kind: 'ready', pause: r.pause });
    });
    return () => { on = false; };
  }, [clientId, attempt]);
  const write = async (until) => {
    const uid = currentUid();
    setSave({ kind: 'saving' });
    const r = await writeClientPause(dbClient(), clientId, until);
    if (currentUid() !== uid) return;
    // Saved: the roster behind this case file re-reads too, so Clients says Away (or not) on the way back.
    if (r.ok) { setSave({ kind: 'idle' }); setAttempt((n) => n + 1); try { window.ShapeSignals?.changed?.(); } catch (e) {} }
    else setSave({ kind: 'failed', error: r.error });
  };
  return { read, save, write, retry: () => setAttempt((n) => n + 1) };
}

// The editor both screens share. `viewer`: 'member' or 'coach', for whose words.
function PauseEditor({ clientId, viewer, t }) {
  const tr = useShapeTr();
  const ns = viewer === 'coach' ? 'coach:pause' : 'settings:pause';
  const { read, save, write, retry } = usePause(clientId);
  const [day, setDay] = useState('');
  const [editing, setEditing] = useState(false);
  const locale = window.ShapeI18n?.locale || undefined;
  const bounds = pauseBounds();
  const holds = read.kind === 'ready' && pauseHolds(read.pause);
  const button = { minHeight: 44, padding: '0 16px', border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, cursor: 'pointer', borderRadius: 999 };
  const note = { color: t.INK70, fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.45, margin: '8px 0' };
  if (read.kind === 'hidden') return null;
  if (read.kind === 'preview') return <p style={note}>{tr(`${ns}.preview`, { defaultValue: viewer === 'coach' ? 'Sign in and open a linked client to set a break.' : 'Sign in to set a break.' })}</p>;
  if (read.kind === 'loading') return <p role="status" style={note}>{tr('coach:common.loading', { defaultValue: 'Loading…' })}</p>;
  if (read.kind === 'failed') return <div><p role="alert" style={{ ...note, color: t.RUST }}>{tr(`${ns}.unavailable`, { defaultValue: viewer === 'coach' ? 'Couldn’t load their break.' : 'Couldn’t load your break.' })}</p><button type="button" style={button} onClick={retry}>{tr(`${ns}.retry`, { defaultValue: 'Try again' })}</button></div>;
  const who = !read.pause ? ''
    : viewer === 'member' ? (read.pause.mine || read.pause.by === 'member' ? tr(`${ns}.byYou`, { defaultValue: 'You set this.' }) : tr(`${ns}.byCoach`, { defaultValue: 'Your coach set this.' }))
    : read.pause.mine ? tr(`${ns}.byYou`, { defaultValue: 'You set this.' })
    : read.pause.by === 'member' ? tr(`${ns}.byMember`, { defaultValue: 'They set this.' }) : tr(`${ns}.byCoach`, { defaultValue: 'Their other coach set this.' });
  const saving = save.kind === 'saving';
  const failed = save.kind === 'failed'
    ? <p role="alert" style={{ ...note, color: t.RUST }}>{save.error === 'range' ? tr(`${ns}.range`, { defaultValue: 'Pick a day from today to 90 days from now.' }) : tr(`${ns}.failed`, { defaultValue: 'Couldn’t save. Try again.' })}</p> : null;
  if (holds && !editing) {
    return <div data-pause-state="away">
      <p style={{ ...note, color: t.INK, fontWeight: 600 }}>{tr(`${ns}.until`, { defaultValue: 'Away until {date}', date: dayLabel(read.pause.until, locale) })}</p>
      <p style={note}>{who}</p>
      {failed}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <button type="button" style={button} disabled={saving} onClick={() => { setDay(read.pause.until); setEditing(true); }}>{tr(`${ns}.change`, { defaultValue: 'Change the date' })}</button>
        <button type="button" style={button} disabled={saving} onClick={() => write(null)}>{saving ? tr('coach:common.saving', { defaultValue: 'Saving…' }) : tr(`${ns}.end`, { defaultValue: 'End the break' })}</button>
      </div>
    </div>;
  }
  const ok = validPauseDay(day);
  return <div data-pause-state="set">
    <p style={note}>{tr(`${ns}.desc`, { defaultValue: viewer === 'coach'
      ? 'Going away, injured, or taking time off? Pick their last day away: their missed-day alerts and reminders stay quiet until then, and you see them back when it ends.'
      : 'Going away? Pick your last day away: reminders and check-in nudges stay quiet until then, and your coaches see you’re away. Your membership carries on as usual.' })}</p>
    <label style={{ ...note, display: 'block' }}>
      {tr(`${ns}.dateLabel`, { defaultValue: 'Away until' })}
      <input type="date" value={day} min={bounds.min} max={bounds.max} onChange={(e) => setDay(e.target.value)}
        style={{ display: 'block', marginTop: 6, minHeight: 44, padding: '0 12px', border: `1px solid ${t.RULE}`, borderRadius: 12, background: t.PAPER, color: t.INK, fontFamily: t.DISPLAY, fontSize: 16 }} />
    </label>
    {failed}
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      <button type="button" style={{ ...button, opacity: ok && !saving ? 1 : 0.5 }} disabled={!ok || saving} onClick={async () => { await write(day); setEditing(false); }}>{saving ? tr('coach:common.saving', { defaultValue: 'Saving…' }) : tr(`${ns}.save`, { defaultValue: 'Save the break' })}</button>
      {editing && <button type="button" style={button} disabled={saving} onClick={() => setEditing(false)}>{tr(`${ns}.cancel`, { defaultValue: 'Keep the date' })}</button>}
    </div>
  </div>;
}

// Settings → Away, the member's own break. Signed out, or a coach account, draws nothing.
export function BSPauseSetting({ t, coach = false }) {
  const tr = useShapeTr();
  const uid = currentUid();
  if (!uid || coach) return null;
  return <div data-settings-pause="" style={{ padding: '14px 16px' }}>
    <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{tr('settings:pause.row', { defaultValue: 'Away' })}</div>
    <PauseEditor clientId={uid} viewer="member" t={t} />
  </div>;
}

// A coach's case file: their client's break, under the coach note.
export function BSClientPauseCard({ clientId, t }) {
  const tr = useShapeTr();
  const [open, setOpen] = useState(false);
  return <section data-client-pause="" style={{ margin: '16px 0', borderRadius: 12, background: t.PAPER2, padding: open ? '2px 14px 14px' : '2px 14px' }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} style={{ minHeight: 44, width: '100%', textAlign: 'left', background: 'transparent', border: 0, padding: 0, fontFamily: t.DISPLAY, fontSize: 12, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: t.INK70, cursor: 'pointer' }}>
      {tr('coach:pause.head', { defaultValue: 'AWAY · A BREAK FROM ALERTS' })} {open ? '−' : '+'}
    </button>
    {open && <PauseEditor clientId={clientId} viewer="coach" t={t} />}
  </section>;
}
