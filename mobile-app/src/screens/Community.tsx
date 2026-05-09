import { useMemo, useState, type CSSProperties } from 'react';
import { Card, Eyebrow, ScreenTitle, Sub, inputStyle, screenTopStyle } from '../components/ui';

type Mode = 'feed' | 'messages' | 'channels';

type CommunityPost = {
  id: string;
  group: 'shape' | 'clients' | 'trainers' | 'nutritionists' | 'friends' | 'channels';
  author: string;
  role: string;
  body: string;
  age: string;
};

const posts: CommunityPost[] = [
  { id: '1', group: 'shape', author: 'Nina Q.', role: 'Shape member', body: 'Welcome everyone - clients, trainers, nutritionists. Drop your goal for the month.', age: '4m' },
  { id: '2', group: 'clients', author: 'Jade Liu', role: 'Client', body: 'Ran 5k and hit PR pace. Anyone else doing tempo blocks this week?', age: '9m' },
  { id: '3', group: 'trainers', author: 'Marcus J.', role: 'Trainer', body: 'If warmups felt heavy, keep top set steady and pull one accessory set.', age: '13m' },
  { id: '4', group: 'nutritionists', author: 'Maya Okafor', role: 'Nutritionist', body: 'Post-run fueling: whey + carbs inside 45 min keeps adherence high.', age: '18m' },
  { id: '5', group: 'friends', author: 'Kenji Mori', role: 'Friend', body: 'Squat cue from coach worked. Bar path finally clean today.', age: '22m' },
  { id: '6', group: 'channels', author: '#shape-nutritionists', role: 'Channel', body: 'Looking for vegetarian cut template with 150g protein target.', age: '35m' },
];

export default function Community() {
  const [mode, setMode] = useState<Mode>('feed');
  const [segment, setSegment] = useState<'shape' | 'clients' | 'trainers' | 'nutritionists' | 'friends' | 'channels'>('shape');
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');

  const filteredPosts = useMemo(() => {
    const targetGroups =
      mode === 'feed'
        ? ['shape', 'clients', 'trainers', 'nutritionists', 'friends']
        : mode === 'messages'
          ? [segment === 'channels' ? 'shape' : segment]
          : ['channels'];

    return posts.filter((post) => {
      if (!targetGroups.includes(post.group)) return false;
      if (mode === 'messages' && segment !== 'shape' && segment !== 'channels' && post.group !== segment) return false;
      if (mode === 'channels' && post.group !== 'channels') return false;
      const needle = query.trim().toLowerCase();
      if (!needle) return true;
      return `${post.author} ${post.role} ${post.body}`.toLowerCase().includes(needle);
    });
  }, [mode, query, segment]);

  return (
    <div style={screenTopStyle}>
      <ScreenTitle>Community</ScreenTitle>

      <Card>
        <Eyebrow>LIVE FEED</Eyebrow>
        <ModeTabs mode={mode} onChange={setMode} />
        <Sub>
          {mode === 'feed'
            ? 'Shape feed is one continuous conversation.'
            : mode === 'messages'
              ? 'Messages view stays as open feed (not thread-by-thread).'
              : 'Channels are topic-based group conversations.'}
        </Sub>

        {mode === 'messages' && (
          <div style={segmentRowStyle}>
            {(['shape', 'clients', 'trainers', 'nutritionists', 'friends'] as const).map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setSegment(item)}
                style={{
                  ...segmentButtonStyle,
                  ...(segment === item ? segmentButtonActiveStyle : null),
                }}
              >
                {item}
              </button>
            ))}
          </div>
        )}

        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={mode === 'channels' ? 'Search channels...' : 'Search people...'}
          style={{ ...inputStyle, marginTop: 10 }}
        />

        <div style={postsWrapStyle}>
          {filteredPosts.length === 0 ? (
            <div style={emptyStyle}>No posts match this filter.</div>
          ) : (
            filteredPosts.map((post) => (
              <article key={post.id} style={postCardStyle}>
                <div style={postHeadStyle}>
                  <div>
                    <strong>{post.author}</strong>
                    <div style={{ color: 'var(--muted)', fontSize: 11 }}>{post.role}</div>
                  </div>
                  <span style={{ color: 'var(--muted)', fontSize: 11 }}>{post.age}</span>
                </div>
                <p style={postBodyStyle}>{post.body}</p>
                <div style={postActionsStyle}>
                  <button type="button" style={miniActionStyle}>Kudos</button>
                  <button type="button" style={miniActionStyle}>Reply</button>
                </div>
              </article>
            ))
          )}
        </div>
      </Card>

      <div style={composerDockStyle}>
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={
            mode === 'channels'
              ? 'Message channel...'
              : mode === 'messages'
                ? 'Message people...'
                : 'Post to Shape feed...'
          }
          style={{ ...inputStyle, background: 'rgba(13,12,11,0.96)' }}
        />
        <button
          type="button"
          style={sendStyle}
          onClick={() => setDraft('')}
          disabled={!draft.trim()}
        >
          Send
        </button>
      </div>
    </div>
  );
}

function ModeTabs({ mode, onChange }: { mode: Mode; onChange: (next: Mode) => void }) {
  return (
    <div style={modeRowStyle}>
      {([
        ['feed', 'Feed'],
        ['messages', 'Messages'],
        ['channels', 'Channels'],
      ] as const).map(([value, label]) => (
        <button
          key={value}
          type="button"
          onClick={() => onChange(value)}
          style={{
            ...modeButtonStyle,
            ...(mode === value ? modeButtonActiveStyle : null),
          }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

const modeRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
  gap: 8,
  marginTop: 10,
};

const modeButtonStyle: CSSProperties = {
  minHeight: 34,
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.1em',
  textTransform: 'uppercase',
};

const modeButtonActiveStyle: CSSProperties = {
  borderColor: 'var(--teal)',
  background: 'var(--teal)',
  color: 'var(--paper)',
};

const segmentRowStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
  gap: 6,
  marginTop: 10,
};

const segmentButtonStyle: CSSProperties = {
  minHeight: 30,
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'transparent',
  color: 'var(--muted)',
  fontFamily: 'var(--mono)',
  fontSize: 9.5,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const segmentButtonActiveStyle: CSSProperties = {
  borderColor: 'var(--ink)',
  color: 'var(--paper)',
  background: 'var(--ink)',
};

const postsWrapStyle: CSSProperties = {
  display: 'grid',
  gap: 10,
  marginTop: 12,
  marginBottom: 86,
};

const postCardStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 14,
  padding: 12,
  background: 'rgba(242,237,228,0.03)',
};

const postHeadStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  gap: 10,
  alignItems: 'flex-start',
};

const postBodyStyle: CSSProperties = {
  margin: '8px 0',
  lineHeight: 1.45,
  fontSize: 14,
};

const postActionsStyle: CSSProperties = {
  display: 'flex',
  gap: 8,
};

const miniActionStyle: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--teal-bright)',
  fontSize: 11,
  padding: '4px 10px',
};

const composerDockStyle: CSSProperties = {
  position: 'sticky',
  bottom: 8,
  display: 'grid',
  gridTemplateColumns: '1fr auto',
  gap: 8,
  padding: 10,
  border: '1px solid var(--border)',
  borderRadius: 18,
  background: 'rgba(10,9,8,0.95)',
  backdropFilter: 'blur(6px)',
};

const sendStyle: CSSProperties = {
  minHeight: 40,
  borderRadius: 999,
  border: '1px solid var(--border)',
  background: 'var(--ink)',
  color: 'var(--paper)',
  padding: '0 14px',
  fontFamily: 'var(--mono)',
  fontSize: 11,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
};

const emptyStyle: CSSProperties = {
  border: '1px dashed var(--border)',
  borderRadius: 12,
  padding: 14,
  color: 'var(--muted)',
  fontSize: 13,
};
