import React from 'react';
import { coachNoteText, readCoachNotes, readCoachNoteDraft, writeCoachNoteDraft, saveCoachNote } from '../services/coachNotes.mjs';

const currentUid = () => window.ShapeAuth?.getCachedState?.().user?.id || null;
// One instance above Profile / Manage, so changing tabs never drops unsaved text.
export default function BSCoachNote({ clientId, t, tr, sample = '' }) {
  const [open, setOpen] = React.useState(false);
  const [state, setState] = React.useState({ kind: 'loading', text: '' });
  const [draft, setDraft] = React.useState('');
  const [deviceReady, setDeviceReady] = React.useState(true);
  const [reload, setReload] = React.useState(0);
  const generation = React.useRef(0);
  const owner = React.useRef(null);
  const saving = React.useRef(false);
  const label = (key, defaultValue) => tr(`coach:notes.${key}`, { defaultValue });
  React.useEffect(() => {
    let active = true;
    const load = async () => {
      const gen = ++generation.current;
      const uid = currentUid(); owner.current = uid; saving.current = false;
      const valid = () => active && generation.current === gen && currentUid() === uid;
      setState({ kind: 'loading', text: '' }); setDraft('');
      if (!uid || !clientId) { setState({ kind: 'preview', text: '' }); return; }
      const local = readCoachNoteDraft(window.localStorage, uid, clientId);
      try {
        const doc = await readCoachNotes(window.ShapeAuth?.client, uid);
        if (!valid()) return;
        const text = coachNoteText(doc, clientId);
        if (local?.text === text) writeCoachNoteDraft(window.localStorage, uid, clientId, null);
        const conflict = local && local.baseText !== text && local.text !== text;
        setState({ kind: conflict ? 'conflict' : 'ready', text, latestText: conflict ? text : undefined });
        setDraft(local ? local.text : text);
      } catch {
        if (valid()) {
          setState({ kind: local ? 'error' : 'unavailable', text: local?.baseText || '' });
          setDraft(local?.text || '');
        }
      }
    };
    load();
    const sub = window.ShapeAuth?.client?.auth?.onAuthStateChange?.((_event, session) => {
      if ((session?.user?.id || null) !== owner.current) setReload(n => n + 1);
    });
    return () => { active = false; generation.current++; sub?.data?.subscription?.unsubscribe(); };
  }, [clientId, reload]);
  const dirty = draft !== state.text;
  React.useEffect(() => {
    if (!dirty) return undefined;
    const warn = e => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);
  const change = text => {
    setDraft(text);
    setDeviceReady(writeCoachNoteDraft(window.localStorage, owner.current, clientId,
      text === state.text ? null : { text, baseText: state.text }));
  };
  const save = async (replace = false) => {
    if (saving.current || !dirty) return;
    saving.current = true;
    const uid = owner.current, gen = generation.current, text = draft;
    const valid = () => generation.current === gen && currentUid() === uid;
    const baseText = replace ? state.latestText : state.text;
    setState(s => ({ ...s, kind: 'saving' }));
    try {
      const r = await saveCoachNote({ client: window.ShapeAuth?.client, uid, clientId, text, baseText, currentUid });
      if (!valid()) { setReload(n => n + 1); return; }
      if (r.conflict) { setState(s => ({ ...s, kind: 'conflict', latestText: r.latestText })); return; }
      if (!r.ok) throw new Error('Account changed');
      writeCoachNoteDraft(window.localStorage, uid, clientId, null);
      setState({ kind: 'saved', text });
    } catch { if (valid()) setState(s => ({ ...s, kind: 'error' })); }
    finally { if (generation.current === gen) saving.current = false; }
  };
  const button = { minHeight: 44, padding: '10px 12px', border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 10, cursor: 'pointer', borderRadius: 5 };
  const status = state.kind === 'saving' ? label('saving', 'Saving…')
    : state.kind === 'conflict' ? label('conflict', 'This note changed elsewhere. Review the saved version before replacing it.')
    : state.kind === 'error' ? label('error', 'Could not save or load your note. Your edits are still here. Retry when connected.')
    : dirty ? deviceReady ? label('draft', 'Draft kept on this device · save to sync with the website') : label('unsaved', 'Unsaved · device recovery unavailable. Keep this screen open.')
    : state.kind === 'saved' ? label('saved', 'Saved to your account') : '';
  return <section style={{ margin: '14px 0', borderBottom: `1px solid ${t.RULE}`, paddingBottom: 10 }}>
    <button type="button" aria-expanded={open} onClick={() => setOpen(v => !v)} style={{ ...button, width: '100%', textAlign: 'left', background: 'transparent', border: 0, paddingLeft: 0 }}>
      {tr('coach:case.coachNoteHead', { defaultValue: 'COACH NOTE · ONLY YOU SEE THIS' })} {open ? '−' : '+'}{dirty ? ' •' : ''}
    </button>
    {open && <div>
      {state.kind === 'preview' ? <p style={{ color: t.INK70, fontFamily: t.DISPLAY }}>{sample}<br/>{label('preview', 'Sign in and open a linked client to save private notes.')}</p>
        : state.kind === 'loading' ? <p role="status">{tr('coach:common.loading', { defaultValue: 'Loading…' })}</p>
        : state.kind === 'unavailable' ? <><p role="alert">{label('unavailable', 'Could not load your saved note.')}</p><button style={button} onClick={() => setReload(n => n + 1)}>{label('retry', 'Retry note')}</button></>
        : <>
          <textarea aria-label={label('label', 'Private coach note')} value={draft} onChange={e => change(e.target.value)} disabled={state.kind === 'saving'} rows={4}
            placeholder={label('placeholder', 'What to watch, what you discussed, and what to check next time.')}
            style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', padding: 12, border: `1px solid ${t.RULE}`, borderRadius: 5, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.5 }} />
          <p role="status" style={{ color: ['error', 'conflict'].includes(state.kind) ? t.RUST : t.INK70, fontFamily: t.DISPLAY, fontSize: 13 }}>{status}</p>
          {state.kind === 'conflict' && <><p style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{label('latest', 'Saved version')}: {state.latestText || '—'}</p><button style={button} onClick={() => save(true)}>{label('replace', 'Replace with my draft')}</button></>}
          <button style={button} onClick={() => save()} disabled={!dirty || ['saving', 'conflict'].includes(state.kind)}>{state.kind === 'saving' ? label('saving', 'Saving…') : label('save', 'Save note')}</button>
        </>}
    </div>}
  </section>;
}
