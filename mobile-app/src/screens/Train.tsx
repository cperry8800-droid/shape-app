import { useState } from 'react';
import { Card, Eyebrow, PrimaryAction, ScreenTitle, SecondaryAction, Sub, screenTopStyle } from '../components/ui';

const sets = [
  {
    set: '01',
    target: '6-8',
    reps: '8',
    load: '80',
    rest: '1:15',
    lastTime: '4 x 8 @ 75 lb',
    progression: '+5 lb today',
    status: 'ready',
  },
  {
    set: '02',
    target: '6-8',
    reps: '7',
    load: '80',
    rest: '1:30',
    lastTime: '4 x 7 @ 75 lb',
    progression: '+5 lb today',
    status: 'ready',
  },
  {
    set: '03',
    target: '6-8',
    reps: '',
    load: '80',
    rest: '--',
    lastTime: '4 x 6 @ 75 lb',
    progression: 'repeat load if RPE > 8',
    status: 'next',
  },
  {
    set: '04',
    target: '6-8',
    reps: '',
    load: '80',
    rest: '--',
    lastTime: '3 x 8 @ 70 lb',
    progression: '+10 lb if clean',
    status: 'locked',
  },
];

const demos = [
  {
    title: 'Farmer carry',
    cue: 'Tall posture, quiet steps',
    source: 'Coach demo preferred - Shape library fallback',
    duration: '0:42',
  },
  {
    title: 'Barbell row',
    cue: 'Brace first, pause at top',
    source: 'Coach demo preferred - Shape library fallback',
    duration: '0:36',
  },
  {
    title: 'Tempo run',
    cue: 'Even splits, relaxed shoulders',
    source: 'Shape endurance library',
    duration: '1:10',
  },
];

const alternates = [
  { missing: 'No cable machine', swap: 'Band face pull', note: 'Same rep target, slow eccentric' },
  { missing: 'No farmer handles', swap: 'Suitcase carry', note: 'Split distance per side' },
  { missing: 'No treadmill', swap: 'Outdoor tempo route', note: 'Keep HR zone, ignore exact pace' },
];

const programTags = [
  'SIGNATURE',
  'FOUNDATIONS',
  'PERFORMANCE',
  'REHAB',
  'ENDURANCE',
  'HYPERTROPHY',
  'POWERLIFTING',
  'BODYBUILDING',
  'RUNNING',
  'MARATHON',
  'ULTRA',
  'MOBILITY',
  'FUNCTIONAL',
  'HYROX',
  'FAT LOSS',
  'AT HOME',
];

const reactions = [
  { key: 'strong', label: 'Felt strong', icon: '💪' },
  { key: 'form_broke', label: 'Form broke', icon: '⚠️' },
  { key: 'skipped', label: 'Skipped', icon: '✕' },
];

export default function Train() {
  const [activeDemo, setActiveDemo] = useState(demos[0]);
  const [selectedAlternate, setSelectedAlternate] = useState(alternates[0].swap);
  const [setReactions, setSetReactions] = useState<Record<string, string>>({});
  const [selectedTag, setSelectedTag] = useState('PERFORMANCE');
  const [customTag, setCustomTag] = useState('');

  function applyCustomTag() {
    const nextTag = customTag.trim();
    if (!nextTag) return;
    setSelectedTag(nextTag.toUpperCase());
    setCustomTag('');
  }

  return (
    <div style={screenTopStyle}>
      <ScreenTitle>Train</ScreenTitle>
      <Card>
        <Eyebrow>Coach-built program</Eyebrow>
        <h2 style={{ margin: '8px 0 8px', fontSize: 30, lineHeight: 1 }}>Upper Pull - Peak.</h2>
        <Sub>Auto-adjusts from RPE, completed reps, set duration, rest timing, and watch samples.</Sub>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 16 }}>
          <PrimaryAction>Start session</PrimaryAction>
          <SecondaryAction onClick={() => setActiveDemo(demos[0])}>Preview demos</SecondaryAction>
        </div>
      </Card>

      <Card>
        <Eyebrow>Program builder</Eyebrow>
        <h2 style={{ margin: '8px 0 8px', fontSize: 24, lineHeight: 1.05 }}>Editable coach draft.</h2>
        <Sub>
          Use this mobile draft view to tag programs, review AI-generated structure, and prep templates before assigning clients.
        </Sub>
        <div style={tagWrapStyle}>
          {[...programTags, ...(programTags.includes(selectedTag) ? [] : [selectedTag])].map((tag) => {
            const active = selectedTag === tag;
            return (
              <button
                key={tag}
                type="button"
                onClick={() => setSelectedTag(tag)}
                style={{
                  ...tagButtonStyle,
                  background: active ? 'var(--teal)' : 'transparent',
                  color: active ? 'var(--paper)' : 'var(--ink)',
                  borderColor: active ? 'var(--teal)' : 'var(--border)',
                }}
              >
                {tag}
              </button>
            );
          })}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 8, marginTop: 12 }}>
          <input
            value={customTag}
            onChange={(event) => setCustomTag(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') applyCustomTag();
            }}
            placeholder="Custom category"
            style={inputStyle}
          />
          <button type="button" onClick={applyCustomTag} style={smallActionStyle}>
            Use
          </button>
        </div>
      </Card>

      <Card>
        <Eyebrow>Exercise demo</Eyebrow>
        <button type="button" onClick={() => setActiveDemo(demos[0])} style={demoPlayerStyle}>
          <span style={playIconStyle}>▶</span>
          <span>
            <strong style={{ display: 'block', fontSize: 16 }}>{activeDemo.title}</strong>
            <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 4 }}>
              {activeDemo.source} - {activeDemo.duration}
            </span>
          </span>
        </button>
        <Sub>Tap a demo below to play the coach-recorded version, with the Shape library ready as fallback.</Sub>
      </Card>

      <Card>
        <Eyebrow>Equipment swaps</Eyebrow>
        <div style={{ display: 'grid', gap: 9, marginTop: 12 }}>
          {alternates.map((item) => {
            const active = selectedAlternate === item.swap;
            return (
              <button
                key={item.swap}
                type="button"
                onClick={() => setSelectedAlternate(item.swap)}
                style={{
                  ...swapButtonStyle,
                  borderColor: active ? 'var(--teal)' : 'var(--border)',
                  background: active ? 'rgba(52,211,197,0.14)' : 'rgba(242,237,228,0.03)',
                }}
              >
                <span>
                  <span style={{ display: 'block', color: 'var(--muted)', fontSize: 11 }}>{item.missing}?</span>
                  <strong style={{ display: 'block', fontSize: 14, marginTop: 2 }}>{item.swap}</strong>
                </span>
                <span style={{ color: 'var(--muted)', fontSize: 11, textAlign: 'right' }}>{item.note}</span>
              </button>
            );
          })}
        </div>
      </Card>

      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
          <Eyebrow>In-workout log</Eyebrow>
          <span style={{ fontSize: 11, color: 'var(--muted)' }}>Sensor ready</span>
        </div>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {sets.map((row) => (
            <div
              key={row.set}
              style={{
                padding: '10px 0',
                borderBottom: '1px solid var(--border)',
              }}
            >
              <div style={{ margin: '0 0 8px 36px', color: 'var(--teal-bright)', fontSize: 12 }}>
                Last time: {row.lastTime} - {row.progression}
              </div>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px minmax(0,1fr) 62px 72px',
                  gap: 8,
                  alignItems: 'center',
                }}
              >
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{row.set}</span>
                <div>
                  <div style={{ fontSize: 14 }}>Farmer carry</div>
                  <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)' }}>
                    target {row.target} reps - {selectedAlternate ? `swap: ${selectedAlternate}` : 'primary'}
                  </div>
                </div>
                <input
                  aria-label={`Set ${row.set} reps`}
                  defaultValue={row.reps}
                  placeholder="reps"
                  style={inputStyle}
                />
                <input
                  aria-label={`Set ${row.set} load`}
                  defaultValue={row.load}
                  placeholder="lb"
                  style={inputStyle}
                />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6, margin: '9px 0 0 36px' }}>
                {reactions.map((reaction) => {
                  const active = setReactions[row.set] === reaction.key;
                  return (
                    <button
                      key={reaction.key}
                      type="button"
                      onClick={() => setSetReactions((current) => ({ ...current, [row.set]: reaction.key }))}
                      style={{
                        ...reactionButtonStyle,
                        borderColor: active ? 'var(--teal)' : 'var(--border)',
                        background: active ? 'var(--teal)' : 'transparent',
                        color: active ? 'var(--paper)' : 'var(--ink)',
                      }}
                    >
                      <span aria-hidden="true">{reaction.icon}</span> {reaction.label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Form / pacing feedback</Eyebrow>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10, marginTop: 12 }}>
          <Metric label="Tempo" value="3.1s" />
          <Metric label="ROM" value="92%" />
          <Metric label="Rest" value="1:22" />
        </div>
        <p style={{ margin: '14px 0 0', color: 'var(--muted)', fontSize: 13, lineHeight: 1.45 }}>
          Watch-assisted tracking can estimate reps, tempo, and range of motion. Client entries remain editable.
        </p>
      </Card>

      <Card>
        <Eyebrow>Exercise library</Eyebrow>
        <div style={{ display: 'grid', gap: 10, marginTop: 12 }}>
          {demos.map((demo) => (
            <button
              key={demo.title}
              type="button"
              onClick={() => setActiveDemo(demo)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 12,
                textAlign: 'left',
                padding: '12px',
                border: '1px solid var(--border)',
                borderRadius: 12,
                background: 'transparent',
                color: 'var(--ink)',
              }}
            >
              <span>
                <strong style={{ display: 'block', fontSize: 14 }}>{demo.title}</strong>
                <span style={{ display: 'block', color: 'var(--muted)', fontSize: 12, marginTop: 3 }}>{demo.cue}</span>
              </span>
              <span style={{ fontFamily: 'var(--mono)', fontSize: 11, color: 'var(--accent)' }}>PLAY</span>
            </button>
          ))}
        </div>
      </Card>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid var(--border)', borderRadius: 12, padding: 12 }}>
      <div style={{ fontSize: 20 }}>{value}</div>
      <div style={{ fontFamily: 'var(--mono)', fontSize: 10, color: 'var(--muted)', marginTop: 4 }}>{label}</div>
    </div>
  );
}

const inputStyle = {
  width: '100%',
  minWidth: 0,
  border: '1px solid var(--border)',
  background: 'var(--paper)',
  color: 'var(--ink)',
  borderRadius: 10,
  padding: '8px 9px',
  fontSize: 12,
  outline: 'none',
};

const demoPlayerStyle = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  padding: 14,
  margin: '4px 0 12px',
  border: '1px solid var(--border)',
  borderRadius: 14,
  background: 'linear-gradient(135deg, rgba(52,211,197,0.16), rgba(242,237,228,0.04))',
  color: 'var(--ink)',
  textAlign: 'left' as const,
};

const playIconStyle = {
  display: 'grid',
  placeItems: 'center',
  width: 42,
  height: 42,
  borderRadius: 999,
  background: 'var(--teal)',
  color: 'var(--paper)',
  fontSize: 16,
  flexShrink: 0,
};

const swapButtonStyle = {
  width: '100%',
  display: 'flex',
  justifyContent: 'space-between',
  gap: 12,
  textAlign: 'left' as const,
  padding: 12,
  border: '1px solid var(--border)',
  borderRadius: 12,
  color: 'var(--ink)',
};

const reactionButtonStyle = {
  minHeight: 34,
  border: '1px solid var(--border)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--ink)',
  fontSize: 11,
  fontFamily: 'inherit',
  padding: '6px 8px',
};

const tagWrapStyle = {
  display: 'flex',
  flexWrap: 'wrap' as const,
  gap: 8,
  marginTop: 14,
};

const tagButtonStyle = {
  minHeight: 34,
  border: '1px solid var(--border)',
  borderRadius: 999,
  background: 'transparent',
  color: 'var(--ink)',
  fontFamily: 'var(--mono)',
  fontSize: 10,
  letterSpacing: '0.08em',
  padding: '8px 10px',
};

const smallActionStyle = {
  border: 0,
  borderRadius: 10,
  padding: '0 14px',
  background: 'var(--teal)',
  color: 'var(--paper)',
  fontFamily: 'inherit',
  fontSize: 13,
};
