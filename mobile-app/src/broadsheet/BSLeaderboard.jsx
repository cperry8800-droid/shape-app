import React from 'react';
// ─── LEADERBOARDS (Settings → More → Leaderboard) ────────────────────────────
// Owner, 2026-10-15: "we should have a members and coaches leaderboard", then "looks good,
// build it" on the preview, whose app view is this screen: short labels, one strip for your
// place, the top three side by side, tight rows.
//
//   mode 'member'  Everyone · Following · My team, over 7 days · this month · all time, with
//                  the two privacy switches. Reads /api/leaderboard.
//   mode 'coach'   Trainers · Nutritionists, by Standing or Climbers (30 days). Reads
//                  /api/coach/leaderboard. Coaches only; the route refuses anyone else.
//
// The website draws the same boards from the same routes (public/newdesign/leaderboards.jsx).
// Moved out of iosAppBroadsheetClient.jsx when it was rebuilt, as BSIntegrationsPage was.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. This file is a static import of
// the client module, so it evaluates before that module's body has put BSDetailHeader on window;
// a top-level read would capture undefined (React error #130). The component names the globals
// it needs on its first line.
//
// ⚠ EVERY STATE SAYS WHAT IT IS. Signed out, not a coach, not switched on yet and could not read
// are four sentences, and none of them is drawn as an empty board.

const { useState } = React;

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

const fmt = (n) => (Number(n) || 0).toLocaleString();
const initials = (name) => String(name || '?').split(/\s+/).filter(Boolean).map((p) => p[0]).join('').replace(/\./g, '').slice(0, 2).toUpperCase() || '?';

// The nearest row with more points than yours: the one you are chasing (a tie is not).
export function bsBoardAbove(entries, me, value) {
  if (!me || me.rank === null || me.rank === undefined) return null;
  let best = null;
  for (const e of entries) {
    if (e.isMe || !(value(e) > value(me))) continue;
    if (!best || value(e) < value(best) || (value(e) === value(best) && e.rank > best.rank)) best = e;
  }
  return best;
}
// Rows after the podium, with null where someone ranked above a row is not in the list. Rank,
// not position: rank() skips numbers after a tie, and that is not a hole.
export function bsBoardRows(all, skip) {
  const out = [];
  all.forEach((r, i) => {
    if (r.rank === null || r.rank === undefined) return;
    const prev = all[i - 1];
    const missing = r.rank - 1 > i;
    const prevMissing = prev && prev.rank !== null && prev.rank !== undefined && prev.rank - 1 > i - 1;
    if (missing && !prevMissing && i > 0) out.push(null);
    if (skip.indexOf(r) < 0) out.push(r);
  });
  return out;
}

function Pills({ t, items, value, onChange, label }) {
  return (
    <div role="tablist" aria-label={label} style={{ display: 'grid', gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))`, gap: 3, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: 3 }}>
      {items.map(([k, l]) => {
        const on = value === k;
        return (
          <button key={k} type="button" role="tab" aria-selected={on} onClick={() => onChange(k)} style={{
            minHeight: 30, padding: '0 4px', borderRadius: 999, border: 0, cursor: 'pointer',
            background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70,
            fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase',
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>{l}</button>
        );
      })}
    </div>
  );
}

function Avatar({ t, e, size }) {
  const [broken, setBroken] = useState(false);
  const me = e.isMe;
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, flex: 'none', borderRadius: 999, overflow: 'hidden', display: 'grid', placeItems: 'center',
      background: me ? `${t.ACCENT}22` : t.PAPER2, border: `1px solid ${me ? t.ACCENT : t.RULE}`, color: me ? t.ACCENT : t.INK,
      fontFamily: t.MONO, fontSize: Math.round(size * 0.34), fontWeight: 800,
    }}>
      {e.avatarUrl && !broken
        ? <img src={e.avatarUrl} alt="" loading="lazy" onError={() => setBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
        : initials(e.name)}
    </span>
  );
}

function Switch({ t, on, label, onChange, busy }) {
  return (
    <button type="button" role="switch" aria-checked={on ? 'true' : 'false'} disabled={busy} onClick={() => onChange(!on)} style={{
      display: 'inline-flex', alignItems: 'center', gap: 8, minHeight: 32, padding: 0, border: 0, background: 'transparent',
      cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, color: t.INK70, fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 500, textAlign: 'left',
    }}>
      <span aria-hidden="true" style={{ width: 28, height: 16, flex: 'none', borderRadius: 999, background: on ? t.ACCENT : t.RULE, position: 'relative' }}>
        <span style={{ position: 'absolute', top: 2, left: on ? 14 : 2, width: 12, height: 12, borderRadius: 999, background: t.PAPER }} />
      </span>
      {label}
    </button>
  );
}

export function BSLeaderboard({ onBack, mode = 'member', role: initialRole = 'trainer' }) {
  const { useBS, BSPage, BSDetailHeader, BSFooter } = window;
  const t = useBS();
  const tr = useShapeTr();
  const coach = mode === 'coach';

  const [scope, setScope] = useState('everyone');
  const [period, setPeriod] = useState('week');
  const [role, setRole] = useState(initialRole === 'nutritionist' ? 'nutritionist' : 'trainer');
  const [view, setView] = useState('standing');
  const [state, setState] = useState({ kind: 'loading' });
  const [privacy, setPrivacy] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  const [reload, setReload] = useState(0);

  React.useEffect(() => {
    let on = true;
    setState({ kind: 'loading' });
    const svc = window.ShapeLeaderboard;
    const read = coach
      ? (svc?.coach ? svc.coach(role, view) : Promise.resolve({ kind: 'error' }))
      : (svc?.member ? svc.member(scope, period) : Promise.resolve({ kind: 'error' }));
    Promise.resolve(read).then((r) => {
      if (!on) return;
      setState(r || { kind: 'error' });
      if (r && r.kind === 'ready' && r.data.privacy) setPrivacy(r.data.privacy);
    }, () => { if (on) setState({ kind: 'error' }); });
    return () => { on = false; };
  }, [coach, scope, period, role, view, reload]);

  const save = (change) => {
    const svc = window.ShapeLeaderboard;
    if (!svc?.setPrivacy) return;
    setSaving(true);
    setSaveFailed(false);
    Promise.resolve(svc.setPrivacy(change)).then((d) => {
      setSaving(false);
      if (d) { setPrivacy(d); setReload((n) => n + 1); } else setSaveFailed(true);
    }, () => { setSaving(false); setSaveFailed(true); });
  };

  const pad = { padding: `0 ${t.padX}px` };
  const mono = (size, color) => ({ fontFamily: t.MONO, fontSize: size, letterSpacing: '0.08em', textTransform: 'uppercase', color });
  const note = (text, key) => <div key={key} style={{ ...pad, margin: '0 0 12px', fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.45, color: t.INK70 }}>{text}</div>;
  const titleText = tr('score:board.title', { defaultValue: 'Leader\nboard.' });
  const title = titleText.split('\n').map((line, i, arr) => <React.Fragment key={i}>{line}{i < arr.length - 1 ? <br /> : null}</React.Fragment>);

  const controls = coach ? (
    <div style={{ ...pad, display: 'grid', gap: 6, margin: '4px 0 12px' }}>
      <Pills t={t} label={tr('score:board.roleLabel', { defaultValue: 'Role' })} value={role} onChange={setRole}
        items={[['trainer', tr('score:board.trainers', { defaultValue: 'Trainers' })], ['nutritionist', tr('score:board.nutritionists', { defaultValue: 'Nutritionists' })]]} />
      <Pills t={t} label={tr('score:board.rankingLabel', { defaultValue: 'Ranking' })} value={view} onChange={setView}
        items={[['standing', tr('score:board.standing', { defaultValue: 'Standing' })], ['climb', tr('score:board.climbers', { defaultValue: 'Climbers' })]]} />
    </div>
  ) : (
    <div style={{ ...pad, display: 'grid', gap: 6, margin: '4px 0 12px' }}>
      <Pills t={t} label={tr('score:board.scopeLabel', { defaultValue: 'Who you are ranked against' })} value={scope} onChange={setScope}
        items={[['everyone', tr('score:board.everyone', { defaultValue: 'Everyone' })], ['following', tr('score:board.following', { defaultValue: 'Following' })], ['team', tr('score:board.team', { defaultValue: 'My team' })]]} />
      <Pills t={t} label={tr('score:board.windowLabel', { defaultValue: 'Window' })} value={period} onChange={setPeriod}
        items={[['week', tr('score:board.week', { defaultValue: '7 days' })], ['month', tr('score:board.month', { defaultValue: 'Month' })], ['all', tr('score:board.all', { defaultValue: 'All time' })]]} />
    </div>
  );

  const switches = !coach && privacy ? (
    <div style={{ ...pad, display: 'flex', flexWrap: 'wrap', gap: '2px 16px', margin: '12px 0 0' }}>
      <Switch t={t} on={privacy.leaderboard} busy={saving} label={tr('settings:privacy.leaderboard', { defaultValue: 'Show me on leaderboards' })} onChange={(v) => save({ leaderboard: v })} />
      <Switch t={t} on={privacy.teamBoard === true} busy={saving} label={tr('settings:privacy.teamBoard', { defaultValue: 'Show me to my coach’s team' })} onChange={(v) => save({ teamBoard: v })} />
      {saveFailed ? <div role="alert" style={{ width: '100%', ...mono(9, t.RUST) }}>{tr('score:board.saveFailed', { defaultValue: 'That didn’t save. Your setting is unchanged.' })}</div> : null}
    </div>
  ) : null;

  const foot = (
    <div style={{ ...pad, margin: '14px 0 6px', display: 'grid', gap: 4, ...mono(8.5, t.INK50), letterSpacing: '0.06em', lineHeight: 1.5 }}>
      {coach
        ? <span>{role === 'trainer'
            ? tr('score:board.coachFootTrainer', { defaultValue: 'Coach Score: active clients, sessions kept over 90 days and programs published. Updated nightly.' })
            : tr('score:board.coachFootNutritionist', { defaultValue: 'Coach Score: active clients and sessions kept over 90 days. Updated nightly.' })}</span>
        : <React.Fragment>
            <span>{tr('score:board.footNames', { defaultValue: 'First name and last initial only. Private profiles never appear.' })}</span>
            <span>{tr('score:board.footPoints', { defaultValue: 'Store spending and tier bonuses don’t count.' })}</span>
          </React.Fragment>}
    </div>
  );

  const shell = (children) => (
    <BSPage>
      <BSDetailHeader onBack={onBack}
        eyebrow={coach ? tr('score:board.eyebrowCoach', { defaultValue: 'Section · Practice' }) : tr('score:board.eyebrow', { defaultValue: 'Section · Community' })}
        kicker="Shape Score" title={<>{title}</>} />
      {controls}
      {children}
      {switches}
      {foot}
      <BSFooter right={coach ? tr('score:board.footerCoach', { defaultValue: 'Practice' }) : tr('score:board.footer', { defaultValue: 'Community' })} />
    </BSPage>
  );

  if (state.kind !== 'ready') {
    const text = state.kind === 'loading' ? tr('score:board.loading', { defaultValue: 'Reading the board…' })
      : state.kind === 'anon' ? tr('score:board.anon', { defaultValue: 'Sign in to see the leaderboard.' })
      : state.kind === 'forbidden' ? tr('score:board.forbidden', { defaultValue: 'The coach leaderboard is for coaches with a Shape listing.' })
      : state.kind === 'not_ready' ? tr('score:board.notReady', { defaultValue: 'This leaderboard isn’t switched on yet. Check back soon.' })
      : tr('score:board.error', { defaultValue: 'We couldn’t read the leaderboard just now. Nothing has changed.' });
    return shell(
      <div style={{ ...pad, margin: '6px 0 0' }}>
        <div role={state.kind === 'loading' ? 'status' : undefined} style={{ ...mono(10, t.INK50), letterSpacing: '0.14em', lineHeight: 1.6 }}>{text}</div>
        {state.kind === 'error'
          ? <button type="button" onClick={() => setReload((n) => n + 1)} style={{ marginTop: 10, minHeight: 34, padding: '0 14px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', ...mono(9.5, t.INK) }}>{tr('score:board.retry', { defaultValue: 'Try again' })}</button>
          : null}
      </div>
    );
  }

  const d = state.data;
  const entries = d.entries || [];
  const me = d.me;
  const climb = coach && view === 'climb';
  const value = (e) => (climb ? Number(e.gained) || 0 : Number(e.points) || 0);
  const shown = (e) => (climb ? ((e.gained || 0) < 0 ? '−' : '+') + fmt(Math.abs(e.gained || 0)) : fmt(e.points));
  const nameOf = (e) => (e.isMe ? tr('score:board.you', { defaultValue: 'You' }) : e.name);
  const subOf = (e) => coach
    ? tr('score:board.coachSub', { defaultValue: '{clients, plural, one {# client} other {# clients}} · {kept}% kept', clients: e.activeClients, kept: e.completionPct })
    : [e.tier, e.streak ? tr('score:board.streak', { defaultValue: '{n}-day streak', n: e.streak }) : null].filter(Boolean).join(' · ');
  const sinceDate = coach && d.since ? (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d.since);
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
  })() : '';

  const blocks = [];

  // The team board asks once, in place: being on it tells teammates you share a coach.
  if (!coach && scope === 'team' && d.hasCoach !== false && d.hidden === 'team_unasked') {
    blocks.push(
      <div key="ask" style={{ ...pad, marginBottom: 12 }}>
        <div style={{ border: `1px solid ${t.ACCENT}66`, borderRadius: t.RADIUS_SM, padding: '12px 13px', background: `${t.ACCENT}10` }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', marginBottom: 6 }}>{tr('score:board.askTitle', { defaultValue: 'Show yourself to your coach’s team?' })}</div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.45, color: t.INK70, marginBottom: 10 }}>{tr('score:board.askBody', { defaultValue: 'Members who share your coach would see your first name, last initial, points and streak, so they’d know you train with the same coach. It never names your coach. You can change this any time.' })}</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" disabled={saving} onClick={() => save({ teamBoard: true })} style={{ minHeight: 34, padding: '0 16px', borderRadius: 999, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', ...mono(9.5, t.PAPER), fontWeight: 800 }}>{tr('score:board.askYes', { defaultValue: 'Show me' })}</button>
            <button type="button" disabled={saving} onClick={() => save({ teamBoard: false })} style={{ minHeight: 34, padding: '0 16px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', ...mono(9.5, t.INK), fontWeight: 800 }}>{tr('score:board.askNo', { defaultValue: 'Not now' })}</button>
          </div>
        </div>
      </div>
    );
  }

  const emptyText = !coach && scope === 'team' && d.hasCoach === false
    ? tr('score:board.noCoach', { defaultValue: 'The team board is for members with a coach. Once you hire one, you’ll see their other members here, if they’ve chosen to show themselves.' })
    : !coach && scope === 'following' && d.following === 0
      ? tr('score:board.noFollows', { defaultValue: 'You don’t follow anyone yet. Follow members from the community and race them here.' })
      : climb && !d.since
        ? tr('score:board.climbEmpty', { defaultValue: 'Climbers needs a reading to compare against. Shape records every coach’s score each night; the first comparison appears the day after the first reading.' })
        : null;

  // Your place.
  if (!emptyText) {
    if (coach && !me) {
      blocks.push(note(role === 'trainer'
        ? tr('score:board.noListingTrainer', { defaultValue: 'You don’t have a trainer listing, so you aren’t on this board.' })
        : tr('score:board.noListingNutritionist', { defaultValue: 'You don’t have a nutritionist listing, so you aren’t on this board.' }), 'nolisting'));
    } else if (me && me.rank !== null && me.rank !== undefined) {
      const above = bsBoardAbove(entries, me, value);
      const gap = above ? value(above) - value(me) : 0;
      const pct = above && value(above) > 0 ? Math.max(6, Math.min(96, Math.round((value(me) / value(above)) * 100))) : 100;
      const of = tr('score:board.of', { defaultValue: 'of {total, number}', total: d.total });
      const moved = !climb && me.moved ? (me.moved > 0 ? ' · ▲' + me.moved : ' · ▼' + -me.moved) : '';
      blocks.push(
        <div key="you" style={{ ...pad, marginBottom: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(0, 1fr) auto', gap: '2px 12px', alignItems: 'center', padding: '10px 12px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.ACCENT}66`, background: `${t.ACCENT}12` }}>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 28, lineHeight: 1, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>#{fmt(me.rank)}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 12.5, lineHeight: 1.3, color: t.INK }}>
                {above
                  ? tr('score:board.toPass', { defaultValue: '{gap, number} pts to pass {name}', gap, name: above.name })
                  : tr('score:board.lead', { defaultValue: 'You lead this board.' })}
              </div>
              {above ? <div style={{ height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden', marginTop: 6 }}><i style={{ display: 'block', height: '100%', width: pct + '%', background: t.ACCENT, borderRadius: 999 }} /></div> : null}
              <div style={{ ...mono(9, t.INK70), marginTop: 5 }}>{of}{moved}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 18, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{shown(me)}</div>
              <div style={mono(8.5, t.INK50)}>{climb ? tr('score:board.gained', { defaultValue: 'gained' }) : coach ? tr('score:board.score', { defaultValue: 'score' }) : tr('score:board.pts', { defaultValue: 'pts' })}</div>
            </div>
          </div>
        </div>
      );
      if (coach && !me.listed) blocks.push(note(tr('score:board.notListed', { defaultValue: 'Your listing isn’t live yet, so other coaches don’t see you. This is where you’d stand.' }), 'notlisted'));
    } else if (coach) {
      blocks.push(note(tr('score:board.climbUnranked', { defaultValue: 'You’ll be ranked here once there’s a reading of your score from the start of the window. Shape takes one every night.' }), 'unranked'));
    } else {
      blocks.push(note(tr('score:board.unranked', { defaultValue: 'You’re not ranked in this window yet. Log a workout, a meal or a habit and you’ll place.' }), 'unranked'));
    }
    if (!coach && d.hidden === 'off') blocks.push(note(tr('score:board.hiddenOff', { defaultValue: 'Only you see your place: “Show me on leaderboards” is off.' }), 'hidden'));
    if (!coach && d.hidden === 'private') blocks.push(note(tr('score:board.hiddenPrivate', { defaultValue: 'Only you see your place: your profile is private.' }), 'hidden'));
    if (!coach && d.hidden === 'team_off') blocks.push(note(tr('score:board.hiddenTeam', { defaultValue: 'Only you see your place: “Show me to my coach’s team” is off.' }), 'hidden'));
  }

  const ranked = entries.filter((e) => e.rank !== null && e.rank !== undefined);
  if (emptyText) {
    blocks.push(note(emptyText, 'empty'));
  } else if (!ranked.length) {
    blocks.push(note(coach
      ? tr('score:board.noCoaches', { defaultValue: 'No coaches are on this board yet.' })
      : tr('score:board.nobody', { defaultValue: 'Nobody has earned points in this window yet.' }), 'nobody'));
  } else {
    const podium = ranked.filter((e) => e.rank <= 3).slice(0, 3);
    const places = [tr('score:board.first', { defaultValue: '1st' }), tr('score:board.second', { defaultValue: '2nd' }), tr('score:board.third', { defaultValue: '3rd' })];
    blocks.push(
      <div key="podium" style={{ ...pad, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 8, marginBottom: 10 }}>
        {podium.map((e, i) => (
          <div key={coach ? e.providerId : e.userId} style={{ minWidth: 0, padding: '10px 10px 9px', borderRadius: t.RADIUS_SM, border: `1px solid ${i === 0 ? t.AMBER : e.isMe ? t.ACCENT : t.RULE}`, background: e.isMe ? `${t.ACCENT}12` : 'transparent' }}>
            <div style={{ ...mono(10, i === 0 ? t.AMBER : t.INK50), fontWeight: 800 }}>{places[i]}</div>
            <div style={{ marginTop: 6 }}><Avatar t={t} e={e} size={28} /></div>
            <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 600, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(e)}</div>
            <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{shown(e)}</div>
          </div>
        ))}
      </div>
    );
    const rows = bsBoardRows(ranked, podium);
    if (rows.length) {
      blocks.push(
        <div key="rows" style={pad} role="table" aria-label={tr('score:board.tableLabel', { defaultValue: 'Leaderboard' })}>
          {rows.map((e, i) => e === null
            ? <div key={'gap' + i} aria-hidden="true" style={{ textAlign: 'center', padding: 4, ...mono(10, t.INK50), letterSpacing: '0.3em' }}>· · ·</div>
            : (
              <div key={coach ? e.providerId : e.userId} role="row" style={{
                display: 'grid', gridTemplateColumns: '32px minmax(0, 1fr) auto', gap: 8, alignItems: 'center', padding: '8px 4px',
                borderTop: `1px solid ${t.HAIR}`, borderRadius: e.isMe ? 8 : 0,
                background: e.isMe ? `${t.ACCENT}12` : 'transparent', boxShadow: e.isMe ? `inset 2px 0 0 ${t.ACCENT}` : 'none',
              }}>
                <span style={{ ...mono(11.5, t.INK70), letterSpacing: 0, fontVariantNumeric: 'tabular-nums', textAlign: 'center' }}>#{fmt(e.rank)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                  <Avatar t={t} e={e} size={26} />
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 13, fontWeight: e.isMe ? 700 : 500, color: e.isMe ? t.ACCENT : t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nameOf(e)}</span>
                    <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 11, color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{subOf(e)}</span>
                  </span>
                </span>
                <span style={{ fontFamily: t.MONO, fontSize: 12.5, fontWeight: 800, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{shown(e)}</span>
              </div>
            ))}
        </div>
      );
    }
    if (climb && sinceDate) blocks.push(note(tr('score:board.since', { defaultValue: 'Points gained since {date}.', date: sinceDate }), 'since'));
  }

  return shell(blocks);
}
