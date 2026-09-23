// Website and app share the private message store, not a second comment inbox.
// Supabase's existing conversation/member and message RLS remain the authority.
export function workoutCommentContext({ clientId, startedAt, title, exercise }) {
  const stamp = Date.parse(startedAt);
  if (!clientId || !Number.isFinite(stamp)) return null;
  return { clientId, startedAt: new Date(stamp).toISOString(), title: String(title || 'Workout').slice(0, 80), exercise: String(exercise || '').slice(0, 120) };
}

export async function workoutConversation(db, clientId, role, ownerId) {
  if (!db || !clientId) throw Error('Messaging is unavailable. Reopen your client and try again.');
  // Reuse the professional thread when the client already has one. A coach
  // without one uses the existing private two-person DM, never a social room.
  if (ownerId && (role === 'trainer' || role === 'nutritionist')) {
    // One owner may hold several listings. Resolve a thread for this client
    // across those listings; never assume owner_id is unique.
    const providers = await db.from(role === 'trainer' ? 'trainers' : 'nutritionists').select('id').eq('owner_id', ownerId);
    if (providers.error) throw Error('Could not verify your coach account. Try again.');
    const providerIds = (providers.data || []).map(provider => provider.id);
    if (!providerIds.length) throw Error('Your coach account is unavailable. Reopen your dashboard.');
    const thread = await db.from('conversations').select('id').eq('kind', 'direct').eq('client_id', clientId)
      .eq('provider_role', role).in('provider_id', providerIds).order('id').limit(1).maybeSingle();
    if (thread.error) throw Error('Could not load your client conversation. Try again.');
    if (thread.data?.id) return thread.data.id;
  }
  const { data, error } = await db.rpc('get_or_create_member_conversation', { p_other_user_id: clientId });
  if (error || !data) throw Error(error?.message || 'Could not open the client conversation.');
  return data;
}

export async function readWorkoutComments(db, conversationId, context) {
  // Filter BEFORE the cap so older comments on this workout cannot be displaced
  // by unrelated chat. Newest first, then reverse for conversational order.
  const { data, error } = await db.from('messages').select('id,sender_id,body,metadata,created_at')
    .eq('conversation_id', conversationId).eq('metadata->>kind', 'workout_comment')
    .eq('metadata->>workout_started_at', context.startedAt)
    .order('created_at', { ascending: false }).limit(100);
  if (error) throw Error(error.message || 'Could not load workout comments.');
  return (data || []).slice().reverse();
}

export async function sendWorkoutComment(db, { conversationId, context, text, ownerId, isCurrent = () => true }) {
  const comment = String(text || '').trim();
  if (!context || !comment || comment.length > 2000) throw Error('Write a comment of up to 2,000 characters.');
  const { data, error } = await db.auth.getUser();
  if (error || !ownerId || data?.user?.id !== ownerId || !isCurrent()) throw Error('Your account changed. Reopen the client before commenting.');
  const body = `${context.title}${context.exercise ? ' · ' + context.exercise : ''}\n${new Date(context.startedAt).toLocaleString()}\n\n${comment}`;
  const result = await db.from('messages').insert({ conversation_id: conversationId, sender_id: ownerId, body,
    metadata: { kind: 'workout_comment', workout_started_at: context.startedAt, workout_title: context.title, exercise: context.exercise, comment } })
    .select('id,sender_id,body,metadata,created_at').single();
  if (result.error || !result.data?.id) throw Error(result.error?.message || 'Could not save your comment. Try again.');
  return result.data;
}

// A React factory keeps this literal UI shared by classic website scripts and
// the app's module bundle without shipping a second React runtime.
export function createWorkoutDiscussion(React) {
  const h = React.createElement;
  return function WorkoutDiscussion({ db, clientId, clientName, role = 'trainer', startedAt, title, exercise, canComment, onOpenChat, theme = {} }) {
    const context = workoutCommentContext({ clientId, startedAt, title, exercise });
    const identity = `${role}:${clientId}:${context?.startedAt || ''}`;
    const [expanded, setExpanded] = React.useState(false);
    const [draft, setDraft] = React.useState('');
    const [draftContext, setDraftContext] = React.useState(null);
    const [rows, setRows] = React.useState([]);
    const [state, setState] = React.useState('idle');
    const [error, setError] = React.useState('');
    const [ownerId, setOwnerId] = React.useState(null);
    const [valid, setValid] = React.useState(true);
    const connection = React.useRef(null), generation = React.useRef(0), lock = React.useRef(false);
    const current = React.useRef({ identity, canComment }); current.current = { identity, canComment };
    React.useEffect(() => {
      generation.current++; connection.current = null; lock.current = false;
      setExpanded(false); setDraft(''); setDraftContext(null); setRows([]); setState('idle'); setError(''); setOwnerId(null); setValid(true);
      let initialOwner;
      const sub = db?.auth?.onAuthStateChange?.((event, session) => {
        const next = session?.user?.id || null;
        if (initialOwner === undefined && event !== 'SIGNED_OUT') { initialOwner = next; return; }
        if (event !== 'SIGNED_OUT' && initialOwner === next) return;
        generation.current++; connection.current = null; lock.current = false;
        setDraft(''); setRows([]); setExpanded(false); setValid(false); setState('idle');
      })?.data?.subscription;
      return () => { generation.current++; sub?.unsubscribe(); };
    }, [identity, db]);
    const alive = token => generation.current === token && current.current.identity === identity;
    async function connect() {
      const token = generation.current;
      const auth = await db?.auth?.getUser();
      const owner = auth?.data?.user?.id;
      if (auth?.error || !owner || !valid || !alive(token)) throw Error('Sign in again to open this conversation.');
      if (connection.current && connection.current.owner !== owner) {
        generation.current++; connection.current = null; lock.current = false;
        setDraft(''); setDraftContext(null); setRows([]); setExpanded(false); setValid(false); setState('idle');
        throw Error('Your account changed. Reopen the client before commenting.');
      }
      const id = connection.current?.id || await workoutConversation(db, clientId, role, owner);
      if (!alive(token)) throw Error('The selected client changed. Reopen the conversation.');
      connection.current = { id, owner }; setOwnerId(owner);
      return { id, owner, token };
    }
    async function load() {
      if (lock.current || !canComment || !context || !valid) return;
      const token = generation.current; lock.current = true; setExpanded(true); setState('loading'); setError('');
      try {
        const { id } = await connect();
        const comments = await readWorkoutComments(db, id, context);
        if (alive(token)) { setRows(comments); setState('ready'); }
      } catch (e) { if (alive(token)) { setError(e.message); setState('error'); } }
      finally { if (alive(token)) lock.current = false; }
    }
    async function send(event) {
      event.preventDefault();
      if (lock.current || !draft.trim() || !canComment || !valid) return;
      const token = generation.current, text = draft; lock.current = true; setState('sending'); setError('');
      try {
        const { id, owner } = await connect();
        const row = await sendWorkoutComment(db, { conversationId: id, context: draftContext || context, text, ownerId: owner,
          isCurrent: () => alive(token) && current.current.canComment });
        if (alive(token)) { setRows(prev => [...prev.filter(r => r.id !== row.id), row]); setDraft(''); setDraftContext(null); setState('sent'); }
      } catch (e) { if (alive(token)) { setError(e.message); setState('error'); } }
      finally { if (alive(token)) lock.current = false; }
    }
    async function message() {
      if (lock.current || !valid) return;
      const token = generation.current; lock.current = true; setState('opening'); setError('');
      try { const { id } = await connect(); if (alive(token)) { onOpenChat(id); setState('ready'); } }
      catch (e) { if (alive(token)) { setError(e.message); setState('error'); } }
      finally { if (alive(token)) lock.current = false; }
    }
    const busy = ['loading', 'sending', 'opening'].includes(state);
    const ink = theme.ink || 'var(--sh-ink, #f2ede4)', muted = theme.muted || 'var(--sh-ink2, #a09b94)';
    const line = theme.line || 'var(--sh-line2, #413d38)', paper = theme.paper || 'var(--sh-card, #25211d)';
    const button = { minHeight: 44, padding: '10px 14px', border: `1px solid ${line}`, borderRadius: 8, color: ink, background: paper, cursor: 'pointer', font: 'inherit' };
    return h('section', { 'aria-label': 'Workout comments and messages', style: { borderTop: `1px solid ${line}`, marginTop: 20, paddingTop: 18, color: ink, fontSize: 14, lineHeight: 1.5 } },
      h('h2', { style: { fontSize: 18, margin: '0 0 8px' } }, 'Coach feedback'),
      h('p', { style: { color: muted, margin: '0 0 12px' } }, 'Workout comments go to your private chat with this client. They can read and reply on the website or app.'),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('button', { type: 'button', style: button, disabled: busy || !canComment || !context || !valid, 'aria-expanded': expanded, onClick: load }, expanded ? 'Refresh comments' : 'Open workout comments'),
        h('button', { type: 'button', style: button, disabled: busy || !valid || !db, onClick: message }, state === 'opening' ? 'Opening chat…' : 'Message client')),
      !valid && h('p', { role: 'status' }, 'Your account changed. Reopen this client to continue.'),
      error && h('p', { role: 'alert' }, error),
      expanded && h(React.Fragment, null,
        h('p', { role: 'status', style: { color: muted } }, state === 'loading' ? 'Loading comments…' : state === 'sent' ? 'Comment saved in your client chat.' : rows.length ? `${rows.length === 100 ? 'Latest ' : ''}${rows.length} ${rows.length === 1 ? 'comment' : 'comments'} on this workout` : state === 'ready' ? 'No comments on this workout yet.' : ''),
        h('ol', { style: { listStyle: 'none', padding: 0, maxHeight: 300, overflowY: 'auto' } }, rows.map(row => h('li', { key: row.id, style: { padding: '10px 0', borderBottom: `1px solid ${line}`, overflowWrap: 'anywhere' } },
          h('strong', null, row.sender_id === ownerId ? 'You' : clientName || 'Client'),
          h('span', { style: { color: muted, marginLeft: 8, fontSize: 12 } }, row.metadata?.exercise || ''),
          h('p', { style: { margin: '5px 0', whiteSpace: 'pre-wrap' } }, row.metadata?.comment || row.body)))),
        h('form', { onSubmit: send, style: { marginTop: 12 } },
          h('label', { style: { display: 'block' } }, `Comment on ${draftContext?.exercise || draftContext?.title || exercise || title || 'this workout'}`,
            h('textarea', { 'aria-label': 'Workout comment', rows: 3, maxLength: 2000, value: draft, disabled: busy || !canComment || !valid, onChange: e => {setDraft(e.target.value);if(!draftContext)setDraftContext(context);}, style: { display: 'block', width: '100%', boxSizing: 'border-box', marginTop: 8, padding: 12, border: `1px solid ${line}`, borderRadius: 8, background: paper, color: ink, font: 'inherit', fontSize: 16 } })),
          h('button', { type: 'submit', style: { ...button, marginTop: 10 }, disabled: busy || !draft.trim() || !canComment || !valid }, state === 'sending' ? 'Saving comment…' : 'Send workout comment'))));
  };
}
