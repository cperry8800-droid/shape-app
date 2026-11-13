// THE MEMBER'S FIRST RUN, ITS FIRST TWO STEPS: the goal ("What brings you here today?") and whether they
// want personal coaching. Moved out of iosAppBroadsheetClient.jsx when they were redrawn in the
// first-run look (owner, 2026-11-13: every screen from the welcome to Home matches it), as
// BSIntegrationsPage and BSLeaderboard were. The client imports both and draws them at its first-run
// stages ('intent', 'coaching'); the health screening after them is BSHealthIntake.jsx.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME, NEVER AT MODULE TOP. The client imports this file statically,
// so it evaluates before the client's body has published its goal helpers (BS_PRIMARY_GOALS,
// bsPrimaryGoalLabel, …) and the chrome's scroll and Nora doors on window; a top-level read would
// capture undefined (React error #130). Each component names the globals it needs on its first line.
// The parts (FRScreen, FRHead, FRPanel …) are BSFirstRunKit.jsx's, React only.
import React from 'react';
import { FR, FR_HEAD, FRScreen, FRHead, FRPanel, frButton, frTitle, frAccent, frSub, frLink } from './BSFirstRunKit.jsx';

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

// Nora's face on the "Set up with Nora" door (the client's BS_NORA_AVATAR, the same file). Read at call
// time, inside a try, as BSProCatalog reads the base: a module-top import.meta.env would throw where no
// bundler injected it (the tests' sibling loader).
function bsNoraAvatar() {
  let base = '/';
  try { base = (import.meta.env && import.meta.env.BASE_URL) || '/'; } catch (e) { base = '/'; }
  return `${base}nora-avatar.png`;
}

// One-time "What brings you here?" identity step — captures intent up front and
// frames the member's identity, then writes the SAME canonical goal keys the
// Goals page + coach view already read (client_goals.primaryGoal + the profile's
// client_identity.goal). Marks client_onboarding.intentSeen so it shows once.
// `onNora`: "Set up with Nora" (the owner, 2026-09-29: Nora "can fill evreything out for you ... and
// also setup your account for you"), the other way through the first run: she asks, drafts one card
// (set_up_account, src/lib/ai/accountSetup.mjs), and nothing is saved until they confirm it.
export function BSIntentStep({ onDone, onNora = null }) {
  const { BS_PRIMARY_GOALS, BS_PRIMARY_GOAL_MAX, bsPrimaryGoalFromText, bsPrimaryGoalLabel, bsNoraOpen, _bsScrollTopOnMount } = window;
  const tr = useShapeTr();
  _bsScrollTopOnMount();
  React.useEffect(() => { try { window.ShapeAnalytics?.track?.('onboarding_started'); } catch (e) {} }, []);
  // Nora is told she is opened over the first run (the Ask Nora plan, step 4), in English for her and
  // in their language for the sheet's chip.
  React.useEffect(() => bsNoraOpen({ page: 'Welcome to Shape (first-run setup: their goal, then whether they want a coach)', label: tr('onboarding:intent.eyebrowWelcome', { defaultValue: 'Welcome to Shape' }) }), []);
  const [picked, setPicked] = useState(null);
  const [own, setOwn] = useState(null); // the member's own words: null = field closed
  const ownNext = own == null ? '' : bsPrimaryGoalFromText(own);
  // ⚠ THE PICK IS A TOKEN, NOT A LABEL — and this is the SECOND writer of
  // client_goals.primaryGoal (BSGoalsContract's picker is the other), so the two
  // must agree or a goal set at first run matches no chip on the Goals page.
  // The id goes to client_goals.primaryGoal; the LABEL goes to the
  // client_identity.goal MIRROR, which get_public_profile serves (`d->>'goal'`)
  // to other members on the public profile card — mobile AND the website — so a
  // token written there would render `fat_loss` to every viewer on both.
  //
  // ⚠ THE LABEL CALLS NOW TAKE `tr`, WHICH IS ALSO A CONSISTENCY FIX. This is
  // the second writer of the client_identity.goal mirror and it wrote ENGLISH
  // while BSGoalsContract's picker wrote the TRANSLATED label — so the same
  // member's public profile card read a different language depending on which
  // screen they set the goal from. Both write the label in the member's own
  // language now, which is the mirror's stated contract (the author's own
  // words, like the bio).
  //
  // ⚠ IDENTITY IS THE ENGLISH TABLE OF RECORD, KEYED ON THE SAME TOKENS.
  // It stays keyed on ids (a label-keyed map falls through to the generic line
  // for every pick), and each value is its key's defaultValue — so the frame
  // and the phrase can never disagree about which goal they describe.
  const IDENTITY = {
    fat_loss: 'someone who’s getting leaner',
    muscle: 'someone who builds muscle',
    recomp: 'someone reshaping their body',
    maintain: 'someone who keeps it dialed in',
    strength: 'someone who trains for strength',
    endurance: 'an endurance athlete in the making',
    mobility: 'someone who moves well for life',
    athletic: 'an athlete leveling up',
    health: 'someone investing in their health',
    tone: 'someone getting toned and strong',
    race: 'a runner with a race on the calendar',
    postpartum: 'someone rebuilding strength, step by step',
  };
  // ⚠ AN UNKNOWN ID TAKES THE FALLBACK, NEVER A RAW KEY. The key is built from
  // the token, so it is invisible to both key-resolution guards — the derived
  // en-key assertion in tests/intent-step-i18n.test.mjs is what covers it.
  // ⚠ EACH LOCALE AUTHORS ITS FRAME AND ITS TWELVE PHRASES TOGETHER: Turkish
  // fronts the phrase and inflects it, so a translator who moves the frame has
  // to re-read the phrases. They are one sentence, split across 13 keys.
  const identityOf = (id) => (IDENTITY[id]
    ? tr(`onboarding:intent.identity.${id}`, { defaultValue: IDENTITY[id] })
    : tr('onboarding:intent.identityFallback', { defaultValue: 'someone who shows up' }));
  // ⚠ A FAILED READ STOPS THE SAVE, AND A FAILED SAVE IS SAID (client-onboarding review M3).
  // getUserGoals answers null when the read failed, and `{ ...null }` is `{}`: this used to write
  // { primaryGoal } over the member's WHOLE goals document after a read error. saveUserGoals
  // resolves { error } rather than throwing, so every failed save also went unnoticed. Resolves
  // true only when the goal (if one was picked) and intentSeen were both written. The identity
  // mirror is best-effort: a profile card without the label is not worth refusing the goal over.
  const persistIntent = async (id) => {
    const db = window.shapeDb;
    if (!db?.getUserGoals || !db?.saveUserGoals) return false;
    try {
      if (id) {
        const label = bsPrimaryGoalLabel(id, tr);
        const goals = await db.getUserGoals('client_goals');
        if (goals == null) return false;
        const saved = await db.saveUserGoals('client_goals', { ...goals, primaryGoal: id });
        if (!saved || saved.ok !== true) return false;
        const ident = await db.getUserGoals('client_identity');
        if (ident != null) await db.saveUserGoals('client_identity', { ...ident, goal: label });
        window.ShapeIdentity = { ...(window.ShapeIdentity || {}), goal: label };
        try { window.dispatchEvent(new Event('shape:identity')); } catch (e) {}
      }
      const onb = await db.getUserGoals('client_onboarding');
      if (onb == null) return false;
      const done = await db.saveUserGoals('client_onboarding', { ...onb, intentSeen: true });
      return !!(done && done.ok === true);
    } catch (e) { return false; }
  };
  const [saving, setSaving] = useState(false);
  const pick = async (id) => {
    if (saving) return;
    setSaving(true);
    const ok = await persistIntent(id);
    setSaving(false);
    if (ok) setPicked(id);
    else window.__bsToast?.(tr('onboarding:firstRun.saveFailed', { defaultValue: 'Could not save. Check your connection and try again.' }), 'err');
  };
  // Skipping carries on whatever happened: a skip that did not save is asked again next time.
  const skip = async () => { if (saving) return; setSaving(true); await persistIntent(null); setSaving(false); onDone(); };

  // ⚠ DRAWN IN THE FIRST-RUN LOOK (owner, 2026-11-13: every screen from the welcome to Home matches it):
  // the centred mark and headline as FRHead's children (the tests' harness reads children), the
  // choices and buttons in the glass panel. Fixed-dark like the launch, whatever the paper.
  const chip = (on) => ({ minHeight: 44, padding: '10px 15px', borderRadius: 999, cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1, border: `1px ${on === 'dashed' ? 'dashed' : 'solid'} ${on === true ? FR.teal : FR.line2}`, background: on === true ? FR.tealSoft : 'transparent', color: on === true ? FR.teal : FR.ink, fontFamily: FR_HEAD, fontSize: 14.5, fontWeight: 600 });
  if (picked) {
    return (
      <FRScreen dataAttr={{ 'data-fr-intent': 'in' }}>
        <FRHead>
          <h1 style={frTitle(32)}>{tr('onboarding:intent.becomingPre', { defaultValue: "You're becoming" })} <span style={frAccent}>{identityOf(picked)}</span>{tr('onboarding:intent.becomingPost', { defaultValue: '.' })}</h1>
          <p style={frSub}>{tr('onboarding:intent.body', { defaultValue: 'Every workout, meal, and check-in is a vote for that person. We build the plan — you keep showing up.' })}</p>
        </FRHead>
        <FRPanel>
          <button type="button" onClick={onDone} style={frButton('primary')}>{tr('onboarding:intent.cta', { defaultValue: "Let's go →" })}</button>
          <button type="button" onClick={() => setPicked(null)} style={frLink({ textAlign: 'center' })}>{tr('onboarding:intent.change', { defaultValue: 'Change' })}</button>
        </FRPanel>
      </FRScreen>
    );
  }

  return (
    <FRScreen dataAttr={{ 'data-fr-intent': 'pick' }}>
      <FRHead>
        <h1 style={frTitle(32)}>{tr('onboarding:intent.titlePre', { defaultValue: 'What brings you here' })} <span style={frAccent}>{tr('onboarding:intent.titleAccent', { defaultValue: 'today' })}</span>{tr('onboarding:intent.titlePost', { defaultValue: '?' })}</h1>
        <p style={frSub}>{tr('onboarding:intent.pickBody', { defaultValue: 'Pick the one that fits best — it shapes your plan, your coach match, and what each day leads with. You can change it anytime.' })}</p>
      </FRHead>
      <FRPanel>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {BS_PRIMARY_GOALS.map((g) => (
            <button key={g.id} type="button" onClick={() => pick(g.id)} disabled={saving} style={chip(false)}>{bsPrimaryGoalLabel(g.id, tr)}</button>
          ))}
          {/* A goal in their own words (owner, 2026-10-20), saved like any pick. */}
          <button type="button" onClick={() => setOwn(own == null ? '' : null)} aria-expanded={own != null} disabled={saving} style={chip(own != null ? true : 'dashed')}>＋ {tr('goal:primary.custom', { defaultValue: 'Your own goal' })}</button>
        </div>
        {own != null && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span className="bs-lf-well" style={{ display: 'flex', alignItems: 'center', minHeight: 52, borderRadius: 13, border: `1px solid ${FR.line2}`, background: FR.well, padding: '0 14px', boxSizing: 'border-box' }}>
              <input className="bs-lf-input" autoFocus enterKeyHint="done" value={own} maxLength={BS_PRIMARY_GOAL_MAX}
                aria-label={tr('goal:primary.customLabel', { defaultValue: 'Your goal, in your words' })}
                placeholder={tr('goal:primary.customPlaceholder', { defaultValue: 'e.g. Run my first 10k' })}
                onChange={(e) => setOwn(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (ownNext) pick(ownNext); } }}
                style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', padding: '12px 0', fontFamily: FR_HEAD, fontSize: 16.5, fontWeight: 500, color: FR.ink }} />
            </span>
            <button type="button" onClick={() => pick(ownNext)} disabled={!ownNext || saving} style={frButton('primary', { opacity: ownNext ? 1 : 0.45, cursor: ownNext && !saving ? 'pointer' : 'default' })}>{tr('goal:primary.customSave', { defaultValue: 'Set goal' })}</button>
          </div>
        )}
        {/* The other way through: Nora asks, fills it in, and they confirm one card. Her face, so a
            person meeting her for the first time knows who she is; the step stays under her sheet. */}
        {onNora && (
          <button type="button" data-nora-setup onClick={onNora} disabled={saving} style={{ width: '100%', boxSizing: 'border-box', display: 'flex', alignItems: 'center', gap: 13, padding: '12px 14px', borderRadius: 14, border: `1px solid ${FR.line2}`, background: FR.tealSoft, color: FR.ink, textAlign: 'left', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 }}>
            <img src={bsNoraAvatar()} alt="" aria-hidden style={{ flex: 'none', display: 'block', width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', objectPosition: '50% 32%', boxShadow: `0 0 0 2px ${FR.teal}` }} />
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontFamily: FR_HEAD, fontSize: 15.5, fontWeight: 600, color: FR.ink }}>{tr('onboarding:intent.nora', { defaultValue: 'Set up with Nora' })}</span>
              <span style={{ display: 'block', marginTop: 2, fontFamily: FR_HEAD, fontSize: 13.5, color: FR.ink2, lineHeight: 1.4 }}>{tr('onboarding:intent.noraBody', { defaultValue: 'Tell her about you and she fills it all in. You check it before anything is saved.' })}</span>
            </span>
            <span aria-hidden style={{ flex: 'none', color: FR.teal, fontSize: 16 }}>→</span>
          </button>
        )}
        <button type="button" onClick={skip} style={frLink({ textAlign: 'center' })}>{tr('onboarding:intent.skip', { defaultValue: 'Skip for now →' })}</button>
      </FRPanel>
    </FRScreen>
  );
}

// One-time "Are you looking for personal coaching?" step, after the goal (client-onboarding
// review, fix 2). Only a yes leads on to the health screening; a no goes straight into the app,
// and is screened later only if they hire a coach. Writes client_onboarding.wantsCoaching (and
// which kind) — the same answer the website sign-up records — and says so when the save fails.
export function BSCoachingStep({ onDone }) {
  const tr = useShapeTr();
  window._bsScrollTopOnMount();
  const [saving, setSaving] = useState(false);
  const OPTIONS = [
    { id: 'training', for: ['training'], label: tr('onboarding:coaching.optTraining', { defaultValue: 'Yes, a trainer' }) },
    { id: 'nutrition', for: ['nutrition'], label: tr('onboarding:coaching.optNutrition', { defaultValue: 'Yes, a nutritionist' }) },
    { id: 'both', for: ['training', 'nutrition'], label: tr('onboarding:coaching.optBoth', { defaultValue: 'Yes, both' }) },
  ];
  const answer = async (wants, kinds) => {
    if (saving) return;
    setSaving(true);
    let ok = false;
    const patch = { wantsCoaching: wants, coachingFor: wants ? kinds : [], coachingAt: new Date().toISOString() };
    try {
      const onb = await window.shapeDb?.getUserGoals?.('client_onboarding');
      if (onb != null) {
        const res = await window.shapeDb.saveUserGoals('client_onboarding', { ...onb, ...patch });
        ok = !!(res && res.ok === true);
      }
    } catch (e) { ok = false; }
    setSaving(false);
    if (ok) onDone(patch);
    else window.__bsToast?.(tr('onboarding:firstRun.saveFailed', { defaultValue: 'Could not save. Check your connection and try again.' }), 'err');
  };
  // Drawn in the first-run look (BSFirstRun.jsx), like the goal step before it.
  return (
    <FRScreen dataAttr={{ 'data-fr-coaching': '' }}>
      <FRHead>
        <h1 style={frTitle(30)}>{tr('onboarding:coaching.title', { defaultValue: 'Are you looking for personal coaching?' })}</h1>
        <p style={frSub}>{tr('onboarding:coaching.body', { defaultValue: 'A coach builds your plan and checks in with you. You can add one any time, and the app works without one. If you want a coach, a short health screening comes next, so they can train you safely.' })}</p>
      </FRHead>
      <FRPanel style={{ gap: 10 }}>
        {OPTIONS.map((o) => (
          <button key={o.id} type="button" disabled={saving} onClick={() => answer(true, o.for)} style={frButton('outline', { textAlign: 'left', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.6 : 1 })}>{o.label}</button>
        ))}
        <button type="button" disabled={saving} onClick={() => answer(false, [])} style={frLink({ textAlign: 'center', cursor: saving ? 'wait' : 'pointer' })}>{tr('onboarding:coaching.optNo', { defaultValue: 'Not right now' })}</button>
      </FRPanel>
    </FRScreen>
  );
}
