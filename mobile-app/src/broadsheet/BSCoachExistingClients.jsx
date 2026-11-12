import React from 'react';
import { addExistingClients, looksLikeEmail, readExistingClients, removeExistingClient, splitEmails } from '../services/coachExistingClients.mjs';

// A coach's existing clients (owner, 2026-11-12: "Shape takes 15% cut on clients that sign up through
// Shape. Existing clients, Shape takes no cut from."; services/coachExistingClients.mjs). The coach lists
// the clients they had before Shape by the email those clients use on Shape; a member whose confirmed
// Shape email is on the list pays no Shape fee to this coach. Open for 60 days from the later of the
// coach joining and 2026-11-12, then fixed: the list still counts, nothing is added or removed.
//   BSCoachExistingClients   the Add-a-client sheet's section (iosAppBroadsheetPros.jsx), for the
//                            sheet's own provider row (`role`, `providerId`), drawn in the sheet's look
//                            (`kit`: its head, callout, tile, pill and colours).
// ⚠ NEVER AN EMPTY LIST OVER AN UNREAD ONE: a failed read says so and offers a retry, and the section is
// hidden before the migration runs (the function not there yet).
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME (ShapeAuth, ShapeI18n, ShapeLocale), never at module top, and
// this file never imports back into a role module (the BSClientPause pattern).

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
// "Jan 10, 7:00 PM" in the reader's language and zone: the instant the list closes.
export function closesLabel(iso, locale) {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return '';
  try { return new Intl.DateTimeFormat(locale || undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(ms)); }
  catch { return new Date(ms).toISOString().slice(0, 16).replace('T', ' '); }
}

// The read, bound to the account and provider row it started under: a switch mid-flight drops the
// answer rather than drawing one row's list under another.
function useExistingClients(role, providerId) {
  const [read, setRead] = useState({ kind: 'loading', list: null });
  const [attempt, setAttempt] = useState(0);
  const gen = useRef(0);
  useEffect(() => {
    const uid = currentUid();
    if (!uid || !role || providerId == null) { setRead({ kind: 'hidden', list: null }); return undefined; }
    const mine = ++gen.current;
    let on = true;
    setRead((r) => ({ kind: r.kind === 'ready' ? 'ready' : 'loading', list: r.kind === 'ready' ? r.list : null }));
    readExistingClients(dbClient(), role, providerId).then((r) => {
      if (!on || gen.current !== mine || currentUid() !== uid) return;
      if (!r.ok) setRead({ kind: 'failed', list: null });
      else if (!r.ready) setRead({ kind: 'hidden', list: null });
      else setRead({ kind: 'ready', list: r.list });
    });
    return () => { on = false; };
  }, [role, providerId, attempt]);
  return { read, reload: () => setAttempt((n) => n + 1) };
}

export function BSCoachExistingClients({ role, providerId, t, kit }) {
  const tr = useShapeTr();
  const { read, reload } = useExistingClients(role, providerId);
  const [text, setText] = useState('');
  // { kind: 'idle' | 'saving' | 'done' | 'failed', added?, invalid?, error? }
  const [save, setSave] = useState({ kind: 'idle' });
  const [removing, setRemoving] = useState(null);
  const locale = window.ShapeI18n?.locale || undefined;
  // A new provider row starts clean: no draft or result from the other role's list.
  useEffect(() => { setText(''); setSave({ kind: 'idle' }); setRemoving(null); }, [role, providerId]);
  if (read.kind === 'hidden') return null;
  const { head, callout, tile, pill, heatFill, amber, tealText, inkA, sans } = kit;
  const note = { margin: '8px 0 0', fontFamily: sans, fontSize: 13.5, fontWeight: 500, lineHeight: 1.45, color: t.INK70 };
  const ghost = { minHeight: 44, padding: '0 16px', borderRadius: 99, border: `1px solid ${inkA(0.16)}`, background: 'transparent', color: t.INK, fontFamily: sans, fontSize: 13.5, fontWeight: 650, cursor: 'pointer' };
  const section = (body) => <section data-existing-clients={read.kind} style={{ marginTop: 22 }}>{head(tr('coach:existing.title', { defaultValue: 'Your existing clients' }))}{body}</section>;
  if (read.kind === 'loading') return section(<p role="status" style={note}>{tr('coach:existing.loading', { defaultValue: 'Reading your list…' })}</p>);
  if (read.kind === 'failed') {
    return section(<>
      <div role="alert" style={{ marginTop: 10 }}>{callout(amber, '!', tr('coach:existing.readFailed', { defaultValue: 'Couldn’t read your list just now.' }), 'existingRead')}</div>
      <button type="button" style={{ ...ghost, marginTop: 10 }} onClick={reload}>{tr('coach:existing.retry', { defaultValue: 'Try again' })}</button>
    </>);
  }
  const { list } = read;
  const when = closesLabel(list.closesAt, locale);
  const open = list.open && Date.parse(list.closesAt) > Date.now();
  const draft = splitEmails(text);
  const skipNow = draft.filter((e) => !looksLikeEmail(e));
  const saving = save.kind === 'saving';
  const submit = async () => {
    if (!draft.length || saving) return;
    const uid = currentUid();
    setSave({ kind: 'saving' });
    const r = await addExistingClients(dbClient(), role, providerId, draft);
    if (currentUid() !== uid) return;
    if (r.ok) { setText(''); setSave({ kind: 'done', added: r.added, invalid: r.invalid }); }
    else setSave({ kind: 'failed', error: r.error, added: r.added, invalid: r.invalid });
    reload();
  };
  const drop = async (email) => {
    if (removing) return;
    const uid = currentUid();
    setRemoving(email);
    const r = await removeExistingClient(dbClient(), role, providerId, email);
    if (currentUid() !== uid) return;
    setRemoving(null);
    setSave(r.ok ? { kind: 'idle' } : { kind: 'failed', error: r.error });
    reload();
  };
  const failedWords = (error) => error === 'closed'
    ? tr('coach:existing.closedNow', { defaultValue: 'Your list has closed, so nothing more can be added or removed.' })
    : tr('coach:existing.saveFailed', { defaultValue: 'Couldn’t save that. Check your connection and try again.' });
  return section(<>
    <p style={note}>{open
      ? tr('coach:existing.blurbOpen', { defaultValue: 'Clients you coached before Shape pay no Shape fee. List them by the email they use on Shape. You can add or remove people until {date}; after that the list is fixed.', date: when })
      : tr('coach:existing.blurbClosed', { defaultValue: 'Clients you coached before Shape pay no Shape fee. Your list closed on {date}, and the people on it still pay no Shape fee.', date: when })}</p>
    {open && (
      <div style={{ marginTop: 10 }}>
        <label style={{ display: 'block' }}>
          <span style={{ display: 'block', fontFamily: sans, fontSize: 12.5, fontWeight: 650, color: t.INK70 }}>{tr('coach:existing.inputLabel', { defaultValue: 'Their emails' })}</span>
          <textarea value={text} onChange={(e) => { setText(e.target.value); if (save.kind !== 'saving') setSave({ kind: 'idle' }); }} rows={3} autoComplete="off" autoCapitalize="none" spellCheck={false} inputMode="email"
            placeholder={tr('coach:existing.placeholder', { defaultValue: 'One or more emails, separated by commas or new lines' })}
            style={{ ...tile, display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 6, padding: '12px 14px', resize: 'vertical', color: t.INK, fontFamily: sans, fontSize: 16, lineHeight: 1.4, outline: 'none' }} />
        </label>
        {skipNow.length > 0 && <p style={{ ...note, color: t.INK }}>{tr('coach:existing.notEmails', { defaultValue: 'These aren’t emails and will be skipped: {list}', list: skipNow.join(', ') })}</p>}
        <button type="button" data-existing-add="" disabled={!draft.length || saving} onClick={submit}
          style={{ minHeight: 44, minWidth: 44, padding: 0, border: 0, background: 'transparent', marginTop: 10, cursor: draft.length && !saving ? 'pointer' : 'default', opacity: draft.length && !saving ? 1 : 0.5 }}>
          <span style={pill(heatFill)}>{saving ? tr('coach:existing.adding', { defaultValue: 'Adding…' }) : tr('coach:existing.add', { defaultValue: 'Add to my list' })}</span>
        </button>
      </div>
    )}
    {save.kind === 'done' && (
      <p role="status" style={{ ...note, color: tealText }}>{save.added > 0
        ? tr('coach:existing.added', { defaultValue: 'Added ✓ ({n})', n: save.added })
        : tr('coach:existing.addedNone', { defaultValue: 'Already on your list.' })}</p>
    )}
    {(save.kind === 'done' || save.kind === 'failed') && Array.isArray(save.invalid) && save.invalid.length > 0 && (
      <p style={note}>{tr('coach:existing.skipped', { defaultValue: 'Skipped, not an email or your own: {list}', list: save.invalid.join(', ') })}</p>
    )}
    {save.kind === 'failed' && <div role="alert" style={{ marginTop: 10 }}>{callout(amber, '!', failedWords(save.error), 'existingSave')}</div>}
    {list.emails.length === 0
      ? <p style={note}>{tr('coach:existing.empty', { defaultValue: 'No one on your list yet.' })}</p>
      : (
        <ul data-existing-list="" style={{ ...tile, listStyle: 'none', margin: '12px 0 0', padding: '2px 12px' }}>
          {list.emails.map((e, i) => (
            <li key={e.email} style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 48, borderTop: i ? `1px solid ${inkA(0.08)}` : 0 }}>
              <span style={{ flex: 1, minWidth: 0, fontFamily: sans, fontSize: 14.5, fontWeight: 550, color: t.INK, overflowWrap: 'anywhere' }}>{e.email}</span>
              {open && (
                <button type="button" onClick={() => drop(e.email)} disabled={!!removing}
                  aria-label={tr('coach:existing.remove', { defaultValue: 'Remove {email}', email: e.email })}
                  style={{ minHeight: 44, minWidth: 44, padding: 0, border: 0, background: 'transparent', color: t.INK50, cursor: removing ? 'default' : 'pointer', opacity: removing && removing !== e.email ? 0.5 : 1 }}>
                  {removing === e.email ? '…' : '×'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
  </>);
}
