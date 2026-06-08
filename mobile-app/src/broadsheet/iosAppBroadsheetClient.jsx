import React from 'react';
import { createPortal } from 'react-dom';
import { SHAPE_KITCHEN_RECIPES, RECIPE_DIETS, RECIPE_PROTEINS, RECIPE_FREE_FROM, RECIPE_GOALS, recipeNeeds, recipeMatchesDiet } from './shapeKitchenData.js';
import { BS_CLIENT_WEEK_DEMO, BS_CLIENT_WEEK_DOT_ORDER, bsClientWorkoutForDay, bsBuildDemoTrainProgram } from './bsClientWeekDemo.js';
// iosAppBroadsheetClient.jsx — Client role: Home, Train, Eat, Chat, Me
// Uses primitives from iosAppBroadsheet.jsx via window globals.

const { useState: useStateBSC } = React;
const {
  useBS, BSPage, BSMasthead, BSPageHeader, BSAvatar, BSEyebrow, BSSection,
  BSSlab, BSCell, BSTag, BSRow, BSHeadlineNumber, BSTicker, BSHalftone,
  BSTabBar, BSFooter,
  BSSheetProvider, useBSSheet, BSCalendarScreen, BSEventSheet,
  BSRadioProvider, useBSRadio, BSRadioPrompt, BSRadioScreen, BSNowPlaying,
  BSMarketplaceScreen,
  RadioEffects,
} = window;

// The signed-in member's display name + initials, from the same source as the
// Me page (profiles.full_name, which the edit-profile flow writes + mirrors to
// the auth cache). Falls back to the demo identity when signed out, so the
// header avatars always read sensibly. Keeps every "your own" avatar in sync
// with the account's real name instead of a hardcoded "A".
function bsMyName() {
  const p = (typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().profile) || {};
  return (p.full_name && String(p.full_name).trim()) || 'Alex Rivera';
}
// Up-to-two-letter initials from a display name (drops a leading "# " for channels).
function bsInitials(name) {
  return String(name || '').replace(/^#\s*/, '').split(/\s+/).filter(Boolean).map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function bsMyInitials() {
  // A custom override (set in edit-profile, cached on window.ShapeIdentity) wins;
  // otherwise derive from the display name.
  const custom = (typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.initials) || '';
  const c = String(custom).trim().toUpperCase().slice(0, 2);
  return c || bsInitials(bsMyName()) || 'A';
}
// My current Shape Score tier (cached on window.ShapeScore from /api/client/score)
// and its color. Avatars across the app fill with my tier color — Base/steel until
// I earn points — so the avatar reflects standing, not a chosen accent.
function bsMyTier() {
  const s = (typeof window !== 'undefined' && window.ShapeScore) || null;
  return (s && s.tier) || 'Base';
}
function bsMyTierColor() {
  return bsTierColor(bsMyTier());
}

// Am I live on Shape right now? Signed in + the app open = online, unless I've
// turned off "show when I'm online" (window.ShapeOnlineVisible, default true).
// Drives the pulsing outer ring on my own avatar everywhere.
function bsAmLive() {
  try {
    const signedIn = !!(window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id);
    return signedIn && window.ShapeOnlineVisible !== false;
  } catch (e) { return false; }
}
// Is a specific member online right now? Reads the live Supabase presence set
// (ShapePresence), which only contains people currently broadcasting (so it
// already respects each person's "show when I'm online" toggle).
function bsIsUserOnline(uid) {
  try { return !!(uid && window.ShapePresence && window.ShapePresence.isOnline && window.ShapePresence.isOnline(uid)); } catch (e) { return false; }
}
// Re-render hook: bumps whenever the online presence set changes.
function useBSPresence() {
  const [v, setV] = useStateBSC(0);
  React.useEffect(() => {
    const bump = () => setV(x => x + 1);
    let off = null;
    try { off = window.ShapePresence && window.ShapePresence.onChange && window.ShapePresence.onChange(bump); } catch (e) {}
    try { window.addEventListener('shape:presence', bump); } catch (e) {}
    return () => { try { off && off(); } catch (e) {} try { window.removeEventListener('shape:presence', bump); } catch (e) {} };
  }, []);
  return v;
}

// Top-right profile avatar for sub-pages — taps through to Settings/profile via
// a window event (handled in BSClientAppInner), so a page needn't thread an
// onProfile prop. Drop it into a page's back-button row, right-aligned.
function BSMeCorner({ size = 30 }) {
  return <BSFacetAvatar size={size} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} }} />;
}

// Renders the music-reactive overlay (edge glow / bloom / hologram DJ)
// only while radio is on, not paused, and fxMode != 'off'.
function BSRadioFx() {
  const r = useBSRadio();
  if (!r.radioOn || r.paused) return null;
  if (!r.fxMode || r.fxMode === 'off') return null;
  if (typeof RadioEffects !== 'function') return null;
  const label = `${r.LIVE.show.toUpperCase()} · ${r.LIVE.bpm} BPM`;
  return <RadioEffects mode={r.fxMode} label={label} />;
}

// Inner wrapper so BSClientApp can access useBSSheet
// ── First-run app tour ──────────────────────────────────────────────────────
// A skippable ~60-second walkthrough that appears once when you first land in
// the app (persisted to localStorage + user_goals 'client_onboarding'), and can
// be replayed anytime from Me → App tour. Each step switches the underlying tab
// (via onNavigate) so the real screen shows behind the card.
const BS_TOUR_STEPS = [
  { key: 'welcome', tab: 'home', emoji: '👋', eyebrow: 'WELCOME', title: 'Welcome to Shape.', body: 'Here’s a quick tour of how to get around. You can skip it and dive straight in — and replay it anytime from the Me tab.' },
  { key: 'home', tab: 'home', emoji: '🏠', eyebrow: 'HOME TAB', title: 'Your day, at a glance.', body: 'Your week strip, today’s workout and meals, plus quick chips to log, check habits, and see your Shape Score.' },
  { key: 'train', tab: 'train', emoji: '🏋️', eyebrow: 'TRAIN TAB', title: 'Train.', body: 'Your program for each day. Preview a session, start a guided workout, or swap an exercise for a coach-approved alternative.' },
  { key: 'eat', tab: 'eat', emoji: '🍎', eyebrow: 'EAT TAB', title: 'Eat.', body: 'Your meals and macros for the day. Log what you ate, swap meals, browse recipes, and build a grocery list.' },
  { key: 'chat', tab: 'chat', emoji: '💬', eyebrow: 'CHAT TAB', title: 'Coaches & community.', body: 'Message your coaches, join the community feed and channels, and DM friends — all in one place.' },
  { key: 'me', tab: 'me', emoji: '👤', eyebrow: 'ME TAB', title: 'You.', body: 'Your profile and Shape Score, goals, saved library, and settings. Tip: tap your avatar on any screen to come back here.' },
  { key: 'done', tab: 'home', emoji: '🎉', eyebrow: 'YOU’RE SET', title: 'That’s the tour.', body: 'Replay it whenever from Me → App tour. Now — let’s get to work.' },
];

function bsMarkTourSeen() {
  try { localStorage.setItem('shape.tourSeen', '1'); } catch (e) {}
  try { window.shapeDb?.saveUserGoals?.('client_onboarding', { tourSeen: true, at: new Date().toISOString() }); } catch (e) {}
}

function BSOnboardingTour({ onClose, onNavigate }) {
  const t = useBS();
  const accent = t.ACCENT;
  const [i, setI] = useStateBSC(0);
  const step = BS_TOUR_STEPS[i];
  const last = i === BS_TOUR_STEPS.length - 1;
  const isWelcome = step.key === 'welcome';

  React.useEffect(() => { if (step.tab) onNavigate?.(step.tab); }, [i]);

  const finish = () => { bsMarkTourSeen(); onClose?.(); };
  const next = () => { if (last) finish(); else setI(v => v + 1); };
  const back = () => setI(v => Math.max(0, v - 1));

  const ctaStyle = { width: '100%', borderRadius: 13, border: 0, background: accent, color: '#06231f', padding: '13px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' };
  const ghostStyle = { width: '100%', borderRadius: 13, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, padding: '13px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' };

  const overlay = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 220, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', background: 'rgba(0,0,0,0.58)' }}>
      <div style={{ margin: '0 14px 92px', borderRadius: 20, border: `1px solid ${t.RULE}`, background: t.PAPER, boxShadow: '0 18px 50px rgba(0,0,0,0.5)', padding: '20px 18px 18px', position: 'relative' }}>
        <button onClick={finish} aria-label="Skip tour" style={{ position: 'absolute', top: 12, right: 14, border: 0, background: 'transparent', color: t.INK50, cursor: 'pointer', fontFamily: t.MONO, fontSize: 13, fontWeight: 800 }}>✕</button>
        <div style={{ fontSize: 30, lineHeight: 1 }}>{step.emoji}</div>
        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: accent }}>{step.eyebrow}</div>
        <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{step.title}</div>
        <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.5 }}>{step.body}</div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'center', gap: 6 }}>
          {BS_TOUR_STEPS.map((s, k) => (
            <span key={s.key} style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 999, background: k === i ? accent : t.HAIR }} />
          ))}
          <span style={{ marginLeft: 'auto', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', color: t.INK50 }}>{i + 1} / {BS_TOUR_STEPS.length}</span>
        </div>
        {isWelcome ? (
          <div style={{ marginTop: 18, display: 'flex', flexDirection: 'column', gap: 9 }}>
            <button onClick={next} style={ctaStyle}>Take a quick tour →</button>
            <button onClick={finish} style={ghostStyle}>Skip for now</button>
          </div>
        ) : (
          <div style={{ marginTop: 18, display: 'flex', gap: 9 }}>
            <button onClick={back} style={{ ...ghostStyle, width: 92, flex: '0 0 auto' }}>Back</button>
            <button onClick={next} style={{ ...ctaStyle, flex: 1 }}>{last ? 'Start exploring →' : 'Next →'}</button>
          </div>
        )}
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(overlay, target) : overlay;
}

function BSClientAppInner({ onLogout, tweaks, setTweak, initialTab = 'home' }) {
  const sheet = useBSSheet();
  const [tab, setTab] = useStateBSC(initialTab);
  const [showSettings, setShowSettings] = useStateBSC(false);
  const [settingsStart, setSettingsStart] = useStateBSC('');
  const [showCalendar, setShowCalendar] = useStateBSC(false);
  const [pendingTrainStart, setPendingTrainStart] = useStateBSC(false); // one-shot: auto-launch the live session, then cleared so it doesn't re-fire on remount
  const [storeView, setStoreView] = useStateBSC('store');
  const [marketRole, setMarketRole] = useStateBSC(null); // 'trainer' | 'nutritionist' | null
  const [identityVersion, setIdentityVersion] = useStateBSC(0); // bumped on profile save → re-render avatars now
  const [showTour, setShowTour] = useStateBSC(false); // first-run app tour overlay
  const scoreProfile = SHAPE_SCORE_PROFILES.client;
  const goSettings = () => { setSettingsStart(''); setShowSettings(true); };
  const goIntegrations = () => { setSettingsStart('integrations'); setShowSettings(true); };
  const goRadio    = () => setTab('radio');
  const goTrain    = () => setTab('train');
  const goMarket   = (role) => { setMarketRole(typeof role === 'string' ? role : null); setTab('market'); };
  const goScore    = () => { setStoreView('score'); setTab('store'); };
  // Open the chat tab on a specific coach's DM (Team → Coaches).
  const [chatRequest, setChatRequest] = useStateBSC(null);
  const goChat = (coach, role) => { setChatRequest({ coach: coach || null, role: role || null, nonce: Date.now() }); setTab('chat'); };

  React.useEffect(() => {
    window.__shapeActiveTab = tab;
    window.dispatchEvent?.(new CustomEvent('shape:activeTabChanged', { detail: { tab } }));
  }, [tab]);

  // Let any deep component (e.g. a playlist card's "Connect Spotify" prompt)
  // jump to Settings → Connected apps without prop-threading.
  React.useEffect(() => {
    const open = () => goIntegrations();
    window.addEventListener('shape:openIntegrations', open);
    return () => window.removeEventListener('shape:openIntegrations', open);
  }, []);

  // Tapping the top-right profile avatar on any screen opens Settings/profile
  // — fired as an event so sub-pages don't need an onProfile prop threaded in.
  React.useEffect(() => {
    const open = () => goSettings();
    window.addEventListener('shape:openProfile', open);
    return () => window.removeEventListener('shape:openProfile', open);
  }, []);

  // Jump to the marketplace from anywhere (e.g. the Pricing page's "Browse all
  // coaches"). Settings is a full-screen takeover, so close it first.
  React.useEffect(() => {
    const open = () => { setShowSettings(false); setSettingsStart(''); goMarket(); };
    window.addEventListener('shape:openMarket', open);
    return () => window.removeEventListener('shape:openMarket', open);
  }, []);

  // Hydrate the global identity cache (custom avatar initials / accent / name) and
  // the Shape Score tier at startup, so every avatar — header + feed — reflects the
  // right initials + tier color before the Me page is ever opened.
  React.useEffect(() => {
    if (window.shapeDb?.getUserGoals) {
      window.shapeDb.getUserGoals('client_identity').then(d => {
        if (d && typeof d === 'object') {
          try { window.ShapeIdentity = { ...(window.ShapeIdentity || {}), ...d }; } catch (e) {}
          // Re-render so avatars pick up the loaded photo/initials (the cache is
          // set async after the first paint — without this they stay blank).
          setIdentityVersion(v => v + 1);
          try { window.dispatchEvent(new Event('shape:identity')); } catch (e) {}
        }
      }).catch(() => {});
    }
    fetch('/api/client/score', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (d && typeof d.points_total === 'number') { try { window.ShapeScore = { points: d.points_total || 0, tier: d.current_tier ? d.current_tier.name : 'Base' }; } catch (e) {} setIdentityVersion(v => v + 1); } })
      .catch(() => {});
  }, []);

  // A profile save (or score load) fires `shape:identity` → re-render so the avatars
  // on the CURRENT screen pick up new initials / tier color without navigating.
  React.useEffect(() => {
    const bump = () => setIdentityVersion(v => v + 1);
    window.addEventListener('shape:identity', bump);
    return () => window.removeEventListener('shape:identity', bump);
  }, []);

  // "Start session" from the calendar event sheet → close calendar, jump to the
  // Train tab, and auto-launch the live session there.
  React.useEffect(() => {
    const onStart = () => { setShowCalendar(false); setTab('train'); setPendingTrainStart(true); };
    window.addEventListener('shape:startWorkout', onStart);
    return () => window.removeEventListener('shape:startWorkout', onStart);
  }, []);

  // First-run app tour: auto-show ONLY for newly-created accounts (created in the
  // last 24h) that haven't seen it — localStorage fast-path + cloud user_goals so
  // it doesn't re-appear across devices. Replayable anytime via `shape:startTour`.
  React.useEffect(() => {
    let alive = true;
    let done = false;
    try { done = localStorage.getItem('shape.tourSeen') === '1'; } catch (e) {}
    if (done) return undefined;
    const NEW_MS = 24 * 60 * 60 * 1000; // "new account" window
    const decide = () => {
      if (!alive || done) return;
      const u = window.ShapeAuth?.getCachedState?.().user;
      if (!u) return; // signed out / not resolved yet — the tour is for new accounts
      const created = u.created_at ? Date.parse(u.created_at) : NaN;
      if (!(Number.isFinite(created) && Date.now() - created < NEW_MS)) return; // existing account
      done = true; // guard the retry below from double-firing
      if (window.shapeDb?.getUserGoals) {
        window.shapeDb.getUserGoals('client_onboarding')
          .then(d => { if (!alive) return; if (d && d.tourSeen) { try { localStorage.setItem('shape.tourSeen', '1'); } catch (e) {} } else setShowTour(true); })
          .catch(() => { if (alive) setShowTour(true); });
      } else { setShowTour(true); }
    };
    decide();
    const tid = setTimeout(decide, 1200); // auth may resolve just after first paint
    return () => { alive = false; clearTimeout(tid); };
  }, []);
  React.useEffect(() => {
    const start = () => { setShowSettings(false); setShowCalendar(false); setShowTour(true); };
    window.addEventListener('shape:startTour', start);
    return () => window.removeEventListener('shape:startTour', start);
  }, []);

  if (showSettings) {
    return (
      <BSSettings
        initialPage={settingsStart}
        onBack={() => { setShowSettings(false); setSettingsStart(''); }}
        onLogout={onLogout}
        tweaks={tweaks}
        setTweak={setTweak}
      />
    );
  }
  if (showCalendar) {
    return (
      <div style={{ position: 'absolute', inset: 0 }}>
        <BSCalendarScreen role="client" onProfile={goSettings} onBack={() => setShowCalendar(false)} />
        <BSRadioFx />
      </div>
    );
  }
  const screens = {
    home:    <BSClientHome     onProfile={goSettings} sheet={sheet} goCalendar={() => setShowCalendar(true)} goRadio={goRadio} goTrain={goTrain} goMarket={goMarket} goScore={goScore} goChat={goChat} goIntegrations={goIntegrations} tweaks={tweaks} setTweak={setTweak} />,
    train:   <BSClientTrain    onProfile={goSettings} sheet={sheet} goCalendar={() => setShowCalendar(true)} goRadio={goRadio} goMarket={goMarket} autoStart={pendingTrainStart} onAutoStartConsumed={() => setPendingTrainStart(false)} />,
    eat:     <BSClientEat      onProfile={goSettings} sheet={sheet} goRadio={goRadio} goMarket={goMarket} />,
    chat:    <BSClientFeed     onProfile={goSettings} role={tweaks.role || 'client'} openRequest={chatRequest} />,
    radio:   <BSRadioScreen    onBack={() => setTab('home')} />,
    market:  <BSMarketplaceScreen initialRole={marketRole} onBack={() => setTab('home')} onProfile={goSettings} />,
    store:   storeView === 'score'
      ? <BSShapeScorePage profile={scoreProfile} onBack={() => setStoreView('store')} onOpenStore={() => setStoreView('store')} />
      : <BSShapeStorePage profile={scoreProfile} onBack={() => setTab('home')} onOpenScore={() => setStoreView('score')} />,
    me:      <BSClientMe       onProfile={goSettings} onLogout={onLogout} onIntegrations={goIntegrations} goMarket={goMarket} goRadio={goRadio} sheet={sheet} tweaks={tweaks} setTweak={setTweak} />,
  };
  return (
    <div style={{ position: 'absolute', inset: 0 }} data-identity-version={identityVersion}>
      {screens[tab]}
      <BSRadioFx />
      {/* Pinned message composers (chat feed + DM threads) portal into this
          slot so they're positioned against the phone-frame container — not
          the browser viewport. A viewport-fixed composer overhangs the frame
          in the desktop preview where the frame is narrower than the window. */}
      <div id="bs-composer-slot" style={{
        position: 'absolute', left: 0, right: 0,
        bottom: 72,
        zIndex: 60, pointerEvents: 'none',
      }} />
      <BSTabBar
        active={tab}
        onChange={setTab}
        tabs={[
          { key: 'home',  label: 'Home',  emoji: '🏠' },
          { key: 'train', label: 'Train', emoji: '🏋️' },
          { key: 'eat',   label: 'Eat',   emoji: '🍎' },
          { key: 'chat',  label: 'Chat',  emoji: '💬' },
          { key: 'me',    label: 'Me',    emoji: '👤' },
        ]}
      />
      <BSRadioPrompt />
      {showTour && <BSOnboardingTour onClose={() => setShowTour(false)} onNavigate={setTab} />}
    </div>
  );
}

function BSClientApp({ onLogout, tweaks, setTweak, initialTab = 'home' }) {
  // BSRadioProvider is provided by the entry-point shell (iosAppHub.jsx →
  // BroadsheetSlot, or iosAppBroadsheetMain.jsx → BroadsheetApp), HOISTED
  // ABOVE the stage switch so radio state survives logout → re-login.
  // Without that hoisting, BSRadioProvider would remount on login and fire
  // its 600ms auto-prompt — making Home flash before the overlay.
  return (
    <BSSheetProvider>
      <BSClientAppInner onLogout={onLogout} tweaks={tweaks} setTweak={setTweak} initialTab={initialTab} />
    </BSSheetProvider>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME CARDS — customizable stack (pin / customize / remove / add)
// ═══════════════════════════════════════════════════════════
// One component, many card types, each speaking the same one-statement
// language: KICKER · HERO · meta · caption. Pin (⌃) locks a card to the top
// with its accent outline; unpinned cards auto-order by "most alive today"
// (a per-card aliveness score from live signals). Customize (⋯) swaps a slot's
// focus; Remove (×) drops it; + Add a card appends one. Layout persists to
// client_ui_prefs so it syncs across devices.

const BS_CARD_TYPES = ['training', 'recovery', 'energy', 'consistency', 'protein', 'mood'];
const BS_CARD_LABEL = { training: 'Training', recovery: 'Recovery', energy: 'Energy', consistency: 'Consistency', protein: 'Protein', mood: 'Mood' };
const BS_CARD_DEFAULTS = ['training', 'recovery', 'energy'];

// Build a card's display model from live signals (ticker + analytics + energy).
// Returns { kicker, hero, sub, caption, accent, alive } — `alive` (0..100) is
// the "most alive today" score used to auto-order unpinned cards.
function _bsBuildCard(type, ctx) {
  const { t, ticker, analytics, energy, energyAccent } = ctx;
  const tk = ticker || {};
  const k = analytics && analytics.kpis ? analytics.kpis : {};
  const dash = '—';
  switch (type) {
    case 'training': {
      const wk = analytics && typeof analytics.workouts_this_week === 'number' ? analytics.workouts_this_week : null;
      const adher = typeof k.workout_adherence_pct === 'number' ? k.workout_adherence_pct : null;
      const dist = typeof tk.today_distance_km === 'number' ? tk.today_distance_km : null;
      const mins = typeof tk.today_activity_min === 'number' ? tk.today_activity_min : null;
      const actType = tk.today_activity_type || null;
      const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
      // Today's real activity leads (miles or minutes); else workouts this week.
      if (dist != null && dist > 0) {
        const mi = Math.round((dist / 1.609) * 10) / 10;
        return {
          accent: t.AMBER, kicker: 'Training', hero: String(mi), heroUnit: `mi · ${cap(actType) || 'logged'}`,
          sub: [cap(actType) || 'Activity', mins ? `${mins} min` : 'today', wk != null ? `${wk} this wk` : 'logged'],
          caption: 'Distance in the bank today. Nice work.',
          alive: 85,
        };
      }
      if (mins != null && mins > 0) {
        return {
          accent: t.AMBER, kicker: 'Training', hero: String(mins), heroUnit: `min · ${cap(actType) || 'trained'}`,
          sub: [cap(actType) || 'Trained', 'today', wk != null ? `${wk} this wk` : 'logged'],
          caption: 'Session logged today. Stay on the program.',
          alive: 82,
        };
      }
      const has = wk != null;
      return {
        accent: t.AMBER,
        kicker: 'Training',
        hero: has ? String(wk) : dash,
        heroUnit: has ? (wk === 1 ? 'workout this wk' : 'workouts this wk') : 'this week',
        sub: ['This week', adher != null ? `${adher}% adherence` : 'log a workout', 'keep moving'],
        caption: has && wk > 0 ? 'Sessions in the bank. Get today in too.' : 'Nothing logged yet — get one in today.',
        alive: has && wk > 0 ? 60 : 38,
      };
    }
    case 'recovery': {
      const sleep = typeof tk.sleep_hours === 'number' ? tk.sleep_hours : null;
      const hrv = typeof tk.hrv_ms === 'number' ? tk.hrv_ms : null;
      const rec = typeof tk.recovery_score === 'number' ? tk.recovery_score : null;
      // Prefer a real recovery score; fall back to a sleep heuristic.
      const ready = rec != null ? rec >= 66 : (sleep == null ? null : sleep >= 7);
      const mid = rec != null && rec >= 40 && rec < 66;
      const sleepLabel = sleep != null ? `${Math.floor(sleep)}h ${Math.round((sleep % 1) * 60)}m` : dash;
      const heroWord = (rec == null && sleep == null) ? dash : (ready ? 'Ready' : mid ? 'Steady' : 'Low');
      return {
        accent: t.BLUE,
        kicker: 'Recovery',
        hero: heroWord,
        heroUnit: rec != null ? `${Math.round(rec)}%` : '',
        sub: ['Sleep', sleepLabel, hrv != null ? `HRV ${Math.round(hrv)}` : 'HRV —'],
        caption: (rec == null && sleep == null) ? 'Connect a wearable or log sleep to see readiness.'
          : ready ? "Recovered. Body's good to push tomorrow." : mid ? 'Middling — train, but listen to the body.' : 'Under-recovered — keep today easy.',
        // Poor recovery is highly "alive" — it should bubble up.
        alive: (rec == null && sleep == null) ? 30 : (ready ? 52 : mid ? 72 : 92),
      };
    }
    case 'energy': {
      return {
        accent: energyAccent || t.BLUE,
        kicker: energy ? energy.kicker.replace('Energy · ', 'Energy · ') : 'Energy',
        hero: energy ? energy.hero : dash,
        heroUnit: '',
        sub: energy ? energy.meta : ['Goal', dash, ''],
        caption: ctx.energyCaption || '',
        // Off-target energy is alive; on-target / empty is calmer.
        alive: ctx.noLiveToday ? 40 : 60,
      };
    }
    case 'consistency': {
      const pts = typeof k.weekly_points === 'number' ? k.weekly_points : null;
      const has = pts != null;
      return {
        accent: t.GREEN,
        kicker: 'Consistency',
        hero: has ? `+${pts}` : dash,
        heroUnit: has ? 'pts this wk' : 'this week',
        sub: ['Shape Score', has ? 'this week' : 'log to earn', 'streaks compound'],
        caption: has && pts > 0 ? 'Showing up. Every log adds to the score.' : 'Log a habit or workout to start the week.',
        alive: has && pts > 0 ? 50 : 25,
      };
    }
    case 'protein': {
      const p = typeof tk.protein_g === 'number' ? tk.protein_g : null;
      const target = typeof tk.protein_target === 'number' ? tk.protein_target : 150;
      const has = p != null;
      const pct = has ? Math.round((p / target) * 100) : null;
      const hit = has && p >= target * 0.9;
      return {
        accent: t.RUST,
        kicker: 'Protein',
        hero: has ? String(p) : dash,
        heroUnit: has ? `/ ${target} g` : 'g today',
        sub: ['Today', has ? `${pct}% of target` : 'not logged', 'muscle fuel'],
        caption: !has ? 'Log meals to track protein.' : hit ? 'On target — protein locked in.' : `Behind on protein — ${target - p}g to go.`,
        alive: !has ? 35 : (hit ? 45 : 75),
      };
    }
    case 'mood': {
      const m = typeof tk.mood === 'number' ? tk.mood : null;
      const word = m == null ? dash : m >= 8 ? 'Great' : m >= 6 ? 'Good' : m >= 4 ? 'Okay' : 'Low';
      return {
        accent: t.ACCENT,
        kicker: 'Mood',
        hero: word,
        heroUnit: m != null ? `${m}/10` : 'check in',
        sub: ['Today', m != null ? 'logged' : 'tap to log', '1–10'],
        caption: m == null ? 'How are you feeling? A quick check-in keeps your coach in the loop.'
          : m >= 6 ? 'Feeling good today — keep the momentum.' : 'Off day — be kind to yourself, log a note.',
        // Unlogged or low mood is more "alive" (worth surfacing).
        alive: m == null ? 30 : (m < 4 ? 80 : 22),
      };
    }
    default:
      return { accent: t.INK, kicker: BS_CARD_LABEL[type] || type, hero: dash, heroUnit: '', sub: [], caption: '', alive: 0 };
  }
}

function BSHomeCardItem({ slot, model, t, pinned, onPin, onRemove, onOpen, draggable, dragHandlers, dragging, dragOver }) {
  return (
    <div
      draggable={draggable}
      {...(dragHandlers || {})}
      style={{
        margin: `0 ${t.padX}px 6px`, borderRadius: 11, overflow: 'hidden',
        border: dragOver ? `1.5px dashed ${model.accent}` : (pinned ? `1.5px solid ${model.accent}` : `1px solid ${t.RULE}`),
        background: t.PAPER2,
        opacity: dragging ? 0.5 : 1,
        transition: 'opacity 0.15s ease',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 12px 0' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: model.accent, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {draggable && <span title="Drag to reorder" style={{ cursor: 'grab', color: t.INK50, fontSize: 12, letterSpacing: 0 }}>⠿</span>}
          {model.kicker}{pinned ? ' · pinned' : ''}
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          <button onClick={onPin} title={pinned ? 'Unpin' : 'Pin to top'} style={_bsCardBtn(t, pinned ? model.accent : t.INK50)}>⌃</button>
          <button onClick={onRemove} title="Hide" style={_bsCardBtn(t, t.INK50)}>×</button>
        </div>
      </div>
      <button onClick={onOpen} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: onOpen ? 'pointer' : 'default', padding: '1px 12px 9px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, lineHeight: 0.92, letterSpacing: '-0.04em', color: t.INK }}>{model.hero}</span>
          {model.heroUnit ? <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{model.heroUnit}</span> : null}
        </div>
        {model.sub && model.sub.length > 0 && (
          <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
            {model.sub.filter(Boolean).map((s, i) => (
              <React.Fragment key={i}>
                {i > 0 && <span style={{ opacity: 0.5 }}>·</span>}
                <span>{s}</span>
              </React.Fragment>
            ))}
          </div>
        )}
        {model.caption ? <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 12.5, fontWeight: 500, color: t.INK70, letterSpacing: '-0.01em', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{model.caption}</div> : null}
      </button>
    </div>
  );
}
function _bsCardBtn(t, color) {
  return { width: 26, height: 26, borderRadius: 7, border: 0, background: 'transparent', color, fontFamily: t.MONO, fontSize: 13, fontWeight: 800, lineHeight: 1, cursor: 'pointer', padding: 0 };
}

// The stack: header, ordered cards, + Add, footer note. Layout {order[], pinned[]}
// persists to client_ui_prefs. onOpenEnergy etc. let cards deep-link.
function BSHomeCards({ t, todayLabel, ctx, openers = {} }) {
  // manual: once the user drags, we respect their explicit order (and stop
  // auto-sorting by aliveness) so a deliberate arrangement sticks.
  const defaultLayout = { order: BS_CARD_DEFAULTS.slice(), pinned: [], manual: false, hidden: false };
  // Synchronous localStorage mirror so a removed/reordered card sticks across
  // remounts (tab switches) even when signed-out / the backend no-ops.
  const LS_CARDS = 'bs_home_cards';
  const readCardsLS = () => {
    try {
      const v = JSON.parse(window.localStorage.getItem(LS_CARDS) || 'null');
      if (v && Array.isArray(v.order)) {
        const order = v.order.filter(x => BS_CARD_TYPES.includes(x));
        return { order, pinned: Array.isArray(v.pinned) ? v.pinned.filter(x => order.includes(x)) : [], manual: !!v.manual, hidden: !!v.hidden };
      }
    } catch (e) {}
    return null;
  };
  const [layout, setLayout] = useStateBSC(() => readCardsLS() || defaultLayout);
  const [menuOpen, setMenuOpen] = useStateBSC(false);
  const [menuPos, setMenuPos] = useStateBSC(null);
  const [dragType, setDragType] = useStateBSC(null);
  const [overType, setOverType] = useStateBSC(null);
  const cardsBtnRef = React.useRef(null);
  const openCardsMenu = () => {
    const el = cardsBtnRef.current;
    if (el && el.getBoundingClientRect) {
      const r = el.getBoundingClientRect();
      // Position relative to the phone surface so the menu stays inside the
      // frame in desktop preview (a fixed/viewport menu overhangs the chrome).
      const surf = document.getElementById('bs-phone-surface');
      const sr = surf ? surf.getBoundingClientRect() : { top: 0, right: window.innerWidth, bottom: window.innerHeight };
      const top = r.bottom - sr.top + 6;
      const right = Math.max(8, sr.right - r.right);
      const maxH = Math.max(140, sr.bottom - r.bottom - 84); // clear the footer nav
      setMenuPos({ top, right, maxH });
    }
    setMenuOpen(true);
  };
  // While the menu is open, any scroll closes it — a fixed-position menu would
  // otherwise detach from the button, and the page would feel "stuck".
  React.useEffect(() => {
    if (!menuOpen) return undefined;
    const close = () => setMenuOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('touchmove', close, { passive: true });
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('wheel', close);
      window.removeEventListener('touchmove', close);
    };
  }, [menuOpen]);

  // Load saved layout (best-effort); persist on change.
  React.useEffect(() => {
    let cancelled = false;
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    window.shapeDb.getUserGoals('client_home_cards').then((saved) => {
      if (cancelled || !saved || !Array.isArray(saved.order)) return;
      const order = saved.order.filter(x => BS_CARD_TYPES.includes(x));
      const pinned = Array.isArray(saved.pinned) ? saved.pinned.filter(x => order.includes(x)) : [];
      setLayout({ order, pinned, manual: !!saved.manual, hidden: !!saved.hidden });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const persist = (next) => {
    setLayout(next);
    try { window.localStorage.setItem(LS_CARDS, JSON.stringify(next)); } catch (e) {}
    try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_home_cards', next); } catch (e) {}
  };
  // Whole-section visibility — toggled from this section (Cards ▾ menu → Hide;
  // a slim restore chip brings it back). Persisted in the same doc.
  const setSectionHidden = (v) => { persist({ ...layout, hidden: !!v }); setMenuOpen(false); };

  // Build models, then order: pinned first (in pin order), then unpinned —
  // either the user's manual order, or auto by aliveness desc (stable on ties).
  const models = {};
  layout.order.forEach(type => { models[type] = _bsBuildCard(type, ctx); });
  const pinnedOrder = layout.pinned.filter(x => layout.order.includes(x));
  const unpinned = layout.order.filter(x => !layout.pinned.includes(x));
  if (!layout.manual) {
    unpinned.sort((a, b) => (models[b].alive - models[a].alive) || (layout.order.indexOf(a) - layout.order.indexOf(b)));
  }
  const ordered = [...pinnedOrder, ...unpinned];

  // Drag-to-reorder: dropping b before/after a rewrites `order` and locks it
  // to manual so the deliberate arrangement sticks.
  const onDrop = (target) => {
    if (!dragType || dragType === target) { setDragType(null); setOverType(null); return; }
    const next = layout.order.filter(x => x !== dragType);
    const idx = next.indexOf(target);
    next.splice(idx < 0 ? next.length : idx, 0, dragType);
    persist({ ...layout, order: next, manual: true });
    setDragType(null); setOverType(null);
  };
  const dragHandlersFor = (type) => ({
    onDragStart: () => setDragType(type),
    onDragEnd: () => { setDragType(null); setOverType(null); },
    onDragOver: (e) => { e.preventDefault(); if (overType !== type) setOverType(type); },
    onDrop: (e) => { e.preventDefault(); onDrop(type); },
  });

  const togglePin = (type) => {
    const pinned = layout.pinned.includes(type) ? layout.pinned.filter(x => x !== type) : [...layout.pinned, type];
    persist({ ...layout, pinned });
  };
  const hideCard = (type) => {
    persist({ ...layout, order: layout.order.filter(x => x !== type), pinned: layout.pinned.filter(x => x !== type) });
  };
  // Dropdown toggles which cards are visible on the home. Keeps BS_CARD_TYPES
  // order when re-adding so the stack stays stable.
  const toggleVisible = (type) => {
    if (layout.order.includes(type)) { hideCard(type); return; }
    const order = BS_CARD_TYPES.filter(x => layout.order.includes(x) || x === type);
    persist({ ...layout, order });
  };

  // Collapsed — the section is hidden from home; show a slim restore chip so
  // it can be brought back without leaving the home page.
  if (layout.hidden) {
    return (
      <div style={{ padding: `2px ${t.padX}px 6px` }}>
        <button onClick={() => setSectionHidden(false)} style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '7px 13px', borderRadius: 999, border: `1px dashed ${t.RULE}`, background: 'transparent',
          color: t.INK50, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
        }}>▸ Show home cards</button>
      </div>
    );
  }

  return (
    <>
      <div style={{ padding: `2px ${t.padX}px 8px`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 24, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{todayLabel}.</div>
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>Your stack · pin or choose cards</div>
        </div>
        {/* Compact dropdown to choose which cards are visible */}
        <div>
          <button ref={cardsBtnRef} onClick={() => (menuOpen ? setMenuOpen(false) : openCardsMenu())} style={{
            padding: '8px 12px', borderRadius: 999, border: `1px solid ${t.INK}`, background: menuOpen ? t.INK : 'transparent',
            color: menuOpen ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Cards ▾</button>
          {menuOpen && menuPos && createPortal(
            <>
              <div onClick={() => setMenuOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 9998 }} />
              <div style={{
                position: 'absolute', top: menuPos.top, right: menuPos.right, zIndex: 9999, width: 210,
                maxHeight: menuPos.maxH, overflowY: 'auto',
                background: t.PAPER, border: `1px solid ${t.INK}`, borderRadius: 12,
                boxShadow: '0 16px 40px rgba(0,0,0,0.3)',
              }}>
                <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Show on home</div>
                {BS_CARD_TYPES.map((type) => {
                  const on = layout.order.includes(type);
                  const m = models[type] || _bsBuildCard(type, ctx);
                  return (
                    <button key={type} onClick={() => toggleVisible(type)} style={{
                      width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '11px 12px', border: 0, borderTop: `1px solid ${t.HAIR}`, background: 'transparent', cursor: 'pointer', textAlign: 'left',
                    }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: m.accent }} />
                        <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK }}>{BS_CARD_LABEL[type]}</span>
                      </span>
                      <span style={{
                        width: 34, height: 20, borderRadius: 999, padding: 2, flexShrink: 0,
                        border: `1px solid ${on ? m.accent : t.RULE}`, background: on ? m.accent : 'transparent',
                        display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
                      }}>
                        <span style={{ width: 14, height: 14, borderRadius: 999, background: on ? t.PAPER : t.INK50, display: 'block' }} />
                      </span>
                    </button>
                  );
                })}
                <button onClick={() => setSectionHidden(true)} style={{
                  width: '100%', padding: '11px 12px', border: 0, borderTop: `1px solid ${t.RULE}`, background: 'transparent', cursor: 'pointer', textAlign: 'left',
                  fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50,
                }}>✕ Hide section from home</button>
              </div>
            </>,
            document.getElementById('bs-phone-surface') || document.body
          )}
        </div>
      </div>

      {ordered.length === 0 && (
        <div style={{ margin: `0 ${t.padX}px 12px`, padding: '18px 16px', borderRadius: 14, border: `1px dashed ${t.RULE}`, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50, lineHeight: 1.4 }}>
          No cards on your home. Tap <span style={{ fontWeight: 700, color: t.INK70 }}>Cards ▾</span> to choose what to show.
        </div>
      )}

      {ordered.map((type) => {
        const isPinned = layout.pinned.includes(type);
        return (
          <BSHomeCardItem
            key={type}
            slot={type}
            model={models[type]}
            t={t}
            pinned={isPinned}
            onPin={() => togglePin(type)}
            onRemove={() => hideCard(type)}
            onOpen={openers[type]}
            draggable={!isPinned}
            dragHandlers={!isPinned ? dragHandlersFor(type) : null}
            dragging={dragType === type}
            dragOver={overType === type && dragType && dragType !== type}
          />
        );
      })}
    </>
  );
}

// ═══════════════════════════════════════════════════════════
// HOME — "The Shape Daily" front page
// ═══════════════════════════════════════════════════════════
// Home ticker metrics — keys match the labels built in BSClientHome; the
// Settings editor toggles/reorders these (saved to user_goals 'client_ticker').
const BS_TICKER_METRICS = [
  { key: 'CAL', name: 'Calories' },
  { key: 'PRO', name: 'Protein' },
  { key: 'SLP', name: 'Sleep' },
  { key: 'HRV', name: 'HRV' },
  { key: 'RHR', name: 'Resting HR' },
  { key: 'WGT', name: 'Weight' },
];

// Full read-only preview of an upcoming workout — opened from the home
// "Up next" workout card's Preview button.
// Program week — weeks since a fixed program start, so page eyebrows ("Week 6")
// advance over real time. Shared by the Eat / Train / home headers.
function bsProgramWeek() {
  const start = new Date(2026, 3, 6); // Apr 6 2026 — program start (mock anchor)
  const w = Math.floor((Date.now() - start.getTime()) / 6048e5) + 1;
  return Math.min(52, Math.max(1, w));
}
// Program phase per client — training block + nutrition phase, shown in the
// Eat / Train / home eyebrows. Cached on window so headers read it synchronously;
// persisted in client_settings (Settings → Preferences), so a coach-set value
// from the same store flows through here too.
if (typeof window !== 'undefined' && !window.ShapeProgram) {
  let _prog = { trainingPhase: 'Build', nutritionPhase: 'Cut', detail: {} };
  window.ShapeProgram = {
    get: () => _prog,
    set: (p) => { if (p && typeof p === 'object') { _prog = { ..._prog, ...p, detail: { ...(_prog.detail || {}), ...(p.detail || {}) } }; try { window.dispatchEvent(new Event('bs-program')); } catch (e) {} } },
  };
}
function useBSProgram() {
  const [p, setP] = useStateBSC(() => (window.ShapeProgram?.get?.() || { trainingPhase: 'Build', nutritionPhase: 'Cut', detail: {} }));
  React.useEffect(() => {
    let alive = true;
    // Prefer the real per-client store (coach-writable); fall back to the
    // self-only client_settings mirror for older data / offline.
    const hydrate = (next) => { if (alive && next && (next.trainingPhase || next.nutritionPhase || next.detail)) { window.ShapeProgram?.set?.(next); setP({ ...(window.ShapeProgram?.get?.() || {}) }); } };
    if (window.ShapeProgramApi?.get) {
      window.ShapeProgramApi.get().then(hydrate).catch(() => {});
    }
    if (window.shapeDb?.getUserGoals) {
      window.shapeDb.getUserGoals('client_settings').then(s => {
        if (!s || typeof s !== 'object') return;
        hydrate({ trainingPhase: s.trainingPhase, nutritionPhase: s.nutritionPhase });
      }).catch(() => {});
    }
    const onEvt = () => setP({ ...(window.ShapeProgram?.get?.() || {}) });
    window.addEventListener('bs-program', onEvt);
    return () => { alive = false; window.removeEventListener('bs-program', onEvt); };
  }, []);
  return p;
}

// Coach-set program/plan adjustment, surfaced to the client on Train (training)
// and Eat (nutrition). Driven by client_programs.detail (coach-writable), so it
// only appears once a coach has pressed Apply on their Adjust page.
function BSCoachAdjustBanner({ detail, kind }) {
  const t = useBS();
  const accent = t.ACCENT;
  const d = kind === 'nutrition' ? detail?.nutrition : detail?.training;
  if (!d || !d.updatedAt) return null;
  let when = '';
  try { when = new Date(d.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }); } catch (e) {}
  const cap = (s) => (typeof s === 'string' && s ? s[0].toUpperCase() + s.slice(1) : s);
  const chips = (kind === 'nutrition'
    ? [d.calories != null ? `${d.calories} kcal` : null, d.protein != null ? `${d.protein}P` : null, d.carbs != null ? `${d.carbs}C` : null, d.fat != null ? `${d.fat}F` : null, d.meals != null ? `${d.meals} meals` : null]
    : [d.intensity ? ({ deload: 'Deload', maintain: 'Maintain', progress: 'Progress' }[d.intensity] || cap(d.intensity)) : null, d.sessions != null ? `${d.sessions}×/week` : null, ...(Array.isArray(d.focus) ? d.focus.slice(0, 2).map(cap) : [])]
  ).filter(Boolean);
  return (
    <div style={{ margin: `12px ${t.padX}px 0`, borderRadius: 14, border: `1px solid ${accent}55`, background: `linear-gradient(160deg, ${accent}1c, ${t.PAPER2} 70%)`, padding: '12px 14px' }}>
      <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', color: accent, textTransform: 'uppercase' }}>From your coach{when ? ` · ${when}` : ''}</span>
      <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {chips.map((c, i) => <span key={i} style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.04em', color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: '4px 9px' }}>{c}</span>)}
      </div>
      {d.note ? <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontSize: 13.5, fontStyle: 'italic', color: t.INK70, lineHeight: 1.45 }}>“{d.note}”</div> : null}
    </div>
  );
}

// Live "online now" count via Supabase Realtime presence (hook below).
function useBSOnline() {
  const [n, setN] = useStateBSC(() => (window.ShapePresence?.count?.() || 0));
  React.useEffect(() => {
    if (!window.ShapePresence) return undefined;
    window.ShapePresence.start?.();
    setN(window.ShapePresence.count?.() || 0);
    return window.ShapePresence.onChange?.((c) => setN(c)) || undefined;
  }, []);
  return n;
}

// Shape membership status (drives the member-gated Shape Store + its Me-row
// hint). `allowed` = an active subscription OR a coach account (providers).
// Result cached on window.ShapeMembership so repeat reads don't re-fetch/flash.
function useBSMembership() {
  const initial = () => {
    const auth = window.ShapeAuth?.getCachedState?.() || {};
    const role = auth.profile?.role;
    const isCoach = role === 'trainer' || role === 'nutritionist';
    const signedIn = !!auth.user?.id;
    if (!signedIn) return { loading: false, allowed: false, signedIn: false };
    if (isCoach) return { loading: false, allowed: true, signedIn: true };
    if (window.ShapeMembership && typeof window.ShapeMembership.active === 'boolean') return { loading: false, allowed: window.ShapeMembership.active, signedIn: true };
    return { loading: true, allowed: false, signedIn: true };
  };
  const [m, setM] = useStateBSC(initial);
  React.useEffect(() => {
    if (!m.loading) return undefined;
    let cancelled = false;
    fetch('/api/stripe/subscription', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { const active = !!(d && d.active === true); try { window.ShapeMembership = { active }; } catch (e) {} if (!cancelled) setM({ loading: false, allowed: active, signedIn: true }); })
      .catch(() => { if (!cancelled) setM({ loading: false, allowed: false, signedIn: true }); });
    return () => { cancelled = true; };
  }, []);
  return m;
}

// ── Client Library — saved coach content (workouts, programs, meals) ─────────
// Persists to localStorage immediately, mirrored to window.shapeDb (user_goals)
// for cross-device sync. Screens subscribe via the `bs-library` window event.
const BS_LIB_KEY = 'shape.library';
function bsLibRead() {
  try { const raw = window.localStorage && window.localStorage.getItem(BS_LIB_KEY); const a = raw ? JSON.parse(raw) : []; return Array.isArray(a) ? a : []; } catch (e) { return []; }
}
function bsLibWrite(items) {
  try { window.localStorage && window.localStorage.setItem(BS_LIB_KEY, JSON.stringify(items)); } catch (e) {}
  try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_library', items); } catch (e) {}
  try { window.dispatchEvent(new Event('bs-library')); } catch (e) {}
}
function bsLibToggle(item) {
  const items = bsLibRead();
  const exists = items.some(x => x.id === item.id);
  const next = exists ? items.filter(x => x.id !== item.id) : [{ ...item, savedAt: Date.now() }, ...items];
  bsLibWrite(next);
  window.__bsToast && window.__bsToast(exists ? 'Removed from library' : 'Saved to your library', exists ? 'info' : 'ok');
  return !exists;
}
function useBSLibrary() {
  const [items, setItems] = useStateBSC(() => bsLibRead());
  React.useEffect(() => {
    const sync = () => setItems(bsLibRead());
    window.addEventListener('bs-library', sync);
    // One-time merge with any cloud-saved library (union by id; never drop a save).
    try {
      window.shapeDb && window.shapeDb.getUserGoals && window.shapeDb.getUserGoals('client_library').then((saved) => {
        if (!Array.isArray(saved) || !saved.length) return;
        const byId = new Map();
        for (const it of [...saved, ...bsLibRead()]) if (it && it.id && !byId.has(it.id)) byId.set(it.id, it);
        const merged = [...byId.values()].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
        try { window.localStorage && window.localStorage.setItem(BS_LIB_KEY, JSON.stringify(merged)); } catch (e) {}
        setItems(merged);
      }).catch(() => {});
    } catch (e) {}
    return () => window.removeEventListener('bs-library', sync);
  }, []);
  return items;
}

// Reusable "Save to library" toggle — reflects saved state live.
function BSSaveButton({ item, full = false }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const lib = useBSLibrary();
  const saved = lib.some(x => x.id === item.id);
  return (
    <button onClick={() => bsLibToggle(item)} style={{
      ...(full ? { flex: 1 } : {}), padding: '14px', borderRadius: t.RADIUS_SM, cursor: 'pointer',
      border: `1px solid ${saved ? teal : t.RULE}`,
      background: saved ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent',
      color: saved ? teal : t.INK,
      fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', whiteSpace: 'nowrap',
    }}>{saved ? '✓ Saved' : '♡ Save'}</button>
  );
}

// Client Library screen — saved workouts / programs / meals.
const BS_LIB_KINDS = {
  workout: { label: 'Workout', color: '#c0533b' },
  plan:    { label: 'Program', color: '#a07a2e' },
  meal:    { label: 'Meal',    color: '#5fae7e' },
  recipe:  { label: 'Recipe',  color: '#0a8f87' },
  grocery: { label: 'Groceries', color: '#8a5cf6' },
};

function BSLibraryDetail({ item, onBack }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const km = BS_LIB_KINDS[item.kind] || { label: item.kind || 'Saved', color: t.INK50 };
  const lib = useBSLibrary();
  const saved = lib.some(x => x.id === item.id);
  return (
    <BSPage>
      <div style={{ padding: `14px ${t.padX}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0 }}>← Library</button>
        <BSMeCorner size={28} />
      </div>
      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 999, background: km.color }} />
          <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: km.color }}>{km.label}{item.price ? ` · ${item.price}` : ''}</span>
        </span>
        <h1 style={{ margin: '10px 0 0', fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-0.03em', color: t.INK }}>{item.title}</h1>
        {(item.meta || item.coach) ? <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{[item.meta, item.coach].filter(Boolean).join(' · ')}</div> : null}
      </div>
      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 18, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 18 }}>
          {item.preview ? (
            <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK70, lineHeight: 1.5 }}>{item.preview}</div>
          ) : (
            <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK70, lineHeight: 1.5 }}>Saved {km.label.toLowerCase()} from your coach. Open it on its source page to start, swap, or log.</div>
          )}
          {item.savedAt ? <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${t.HAIR}`, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Saved {new Date(item.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div> : null}
        </div>
      </div>
      <div style={{ padding: `16px ${t.padX}px 0` }}>
        <button onClick={() => { bsLibToggle(item); onBack(); }} style={{ width: '100%', padding: '14px', borderRadius: t.RADIUS_SM, cursor: 'pointer', border: `1px solid ${saved ? teal : t.RULE}`, background: saved ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent', color: saved ? teal : t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{saved ? 'Remove from library' : '♡ Save to library'}</button>
      </div>
      <BSFooter right="Library" />
    </BSPage>
  );
}

function BSClientLibrary({ onBack, goMarket = () => {} }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const items = useBSLibrary();
  const [filter, setFilter] = useStateBSC('all');
  const [query, setQuery] = useStateBSC('');
  const [open, setOpen] = useStateBSC(null);
  const kindMeta = BS_LIB_KINDS;
  if (open) {
    const live = items.find(x => x.id === open.id) || open;
    return <BSLibraryDetail item={live} onBack={() => setOpen(null)} />;
  }
  const q = query.trim().toLowerCase();
  const list = items
    .filter(i => filter === 'all' || i.kind === filter)
    .filter(i => !q || [i.title, i.meta, i.coach].filter(Boolean).join(' ').toLowerCase().includes(q));
  return (
    <BSPage>
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, padding: 0 }}>← Back</button>
          <BSMeCorner size={28} />
        </div>
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal, fontWeight: 700 }}>Your library</div>
        <h1 style={{ margin: '6px 0 0', fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 700, lineHeight: 0.95, letterSpacing: '-0.04em', color: t.INK }}>Saved<br/><span style={{ fontStyle: 'italic', color: teal }}>everything.</span></h1>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, lineHeight: 1.4, color: t.INK70 }}>Every workout, meal, recipe and grocery list you keep — in one place.</div>
      </div>

      <div style={{ padding: `16px ${t.padX}px 12px`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[['workout', 'Workouts', t.RUST], ['meal', 'Meals', t.GREEN || '#5fae7e'], ['recipe', 'Recipes', teal], ['grocery', 'Groceries', '#8a5cf6']].map(([k, label, c]) => {
          const on = filter === k;
          const count = items.filter(i => i.kind === k).length;
          return (
            <button key={k} onClick={() => setFilter(on ? 'all' : k)} style={{ borderRadius: 14, cursor: 'pointer', border: `1px solid ${on ? c : t.RULE}`, background: on ? `${c}1c` : t.PAPER2, padding: '12px 6px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{count}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: c }}>{label}</span>
            </button>
          );
        })}
      </div>

      <div style={{ padding: `0 ${t.padX}px 16px` }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search your library…"
          style={{ width: '100%', boxSizing: 'border-box', padding: '10px 2px', border: 0, borderBottom: `1px solid ${t.RULE}`, borderRadius: 0, background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, outline: 'none' }}
        />
      </div>

      {list.length === 0 ? (
        <div style={{ padding: `8px ${t.padX}px` }}>
          <div style={{ borderRadius: 18, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 24, textAlign: 'center' }}>
            <div style={{ fontSize: 30 }}>❒</div>
            <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, color: t.INK }}>{q ? 'No matches' : (filter === 'all' ? 'Nothing saved yet' : 'None in here yet')}</div>
            <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.4 }}>{q ? 'Try a different search.' : <>Save your coaches&rsquo; workouts, meals, recipes, and grocery lists here — tap <b>Save</b> on any of them.</>}</div>
            {!q ? <button onClick={() => goMarket()} style={{ marginTop: 16, padding: '11px 18px', borderRadius: 999, border: 0, background: teal, color: '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Browse marketplace →</button> : null}
          </div>
        </div>
      ) : (
        <div style={{ padding: `0 ${t.padX}px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
          {list.map((it) => {
            const km = kindMeta[it.kind] || { label: it.kind, color: t.INK50 };
            return (
              <button key={it.id} onClick={() => setOpen(it)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '1fr auto', gap: 10, alignItems: 'center', padding: 14, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
                <div style={{ minWidth: 0 }}>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: km.color }} />
                    <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: km.color }}>{km.label}{it.price ? ` · ${it.price}` : ''}</span>
                  </span>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.title}</div>
                  {(it.meta || it.coach) ? <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{[it.meta, it.coach].filter(Boolean).join(' · ')}</div> : null}
                </div>
                <span style={{ flexShrink: 0, fontFamily: t.DISPLAY, fontSize: 22, color: t.INK50, lineHeight: 1 }}>›</span>
              </button>
            );
          })}
        </div>
      )}
      <BSFooter right="Library" />
    </BSPage>
  );
}

function BSHomeWorkoutPreview({ workout = null, onBack, onMove = () => {}, onStart = () => {}, onMessage = () => {} }) {
  const t = useBS();
  const rust = t.RUST;
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const detail = workout && workout.detail;
  const wkTitle = (workout && workout.title) || 'Upper Pull — Peak';
  const wkMeta = (detail && detail.meta) || '52 min · 6 moves · RPE 8 · ~420 kcal';
  const wkNote = (detail && detail.note) || 'Peak week — tempo matters more than load. 3s eccentric on every pull. If bar speed drops, drop a rep, not the tempo.';
  const moves = (detail && detail.moves) || [
    { name: 'Pull-up',        scheme: '4 × 6-8 · 3 min rest', cue: 'Dead hang. Chest to bar.',      load: '42 lb', up: true },
    { name: 'Barbell row',    scheme: '4 × 8 · 2 min rest',   cue: 'Hinge 45°, pull to sternum.',   load: '155 lb' },
    { name: 'Chest-sup. row', scheme: '3 × 10 · 90s rest',    cue: 'Pause 1s at peak contraction.', load: '60 lb' },
    { name: 'Face pull',      scheme: '3 × 15 · 60s rest',    cue: 'External rotation at the top.', load: '35 lb' },
    { name: 'Incline curl',   scheme: '3 × 12 · 60s rest',    cue: 'Full stretch. 3s eccentric.',   load: '27.5 lb' },
    { name: 'Farmer carry',   scheme: '3 × 40m · 60s rest',   cue: 'Crush grip. Ribs down.',        load: '80 lb' },
  ];
  // "Today · Thu Jun 4 · 5:45 PM" — the workout is today's session.
  const _wd = new Date();
  const _dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][_wd.getDay()];
  const _mon = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][_wd.getMonth()];
  const wkTimeLabel = (() => {
    const [h, m] = String((workout && workout.time) || '09:00').split(':').map(Number);
    if (Number.isNaN(h)) return '9:00 AM';
    const ap = h >= 12 ? 'PM' : 'AM';
    return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
  })();
  const [reminded, setReminded] = useStateBSC(false);
  const headBtn = { background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK };
  const footBtn = { flex: 1, padding: '14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' };
  return (
    <BSPage>
      <div style={{ padding: `62px ${t.padX}px 2px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={onBack} style={headBtn}>← Back</button>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: rust }}>Preview</span>
        <button onClick={onMessage} style={{ ...headBtn, color: t.INK50 }}>Message</button>
      </div>

      <div style={{ padding: `18px ${t.padX}px 4px` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>Today · {_dow} {_mon} {_wd.getDate()} · {wkTimeLabel}</div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 700, color: t.INK, letterSpacing: '-0.035em', lineHeight: 0.98 }}>{wkTitle}<span style={{ color: rust }}>.</span></div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{wkMeta}</div>
      </div>

      {/* Coach note card */}
      <div style={{ padding: `14px ${t.padX}px 4px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${rust}55`, background: `linear-gradient(155deg, ${rust}24, ${rust}08 45%, ${t.PAPER2} 90%), ${t.PAPER2}`, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <BSAvatar init="J" size={34} fill={rust} ink={t.PAPER} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>Jordan Chen</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>Coach</div>
              </div>
            </div>
            <button onClick={onMessage} style={{ flexShrink: 0, padding: '8px 14px', borderRadius: 999, border: `1px solid ${teal}`, background: 'transparent', color: teal, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Message</button>
          </div>
          <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.5, letterSpacing: '-0.01em' }}>
            “{wkNote}”
          </div>
        </div>
      </div>

      {/* Moves */}
      <div style={{ padding: `22px ${t.padX}px 4px` }}>
        <BSEyebrow color={teal}>Plan</BSEyebrow>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginTop: 2 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Moves</div>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: teal }}>{moves.length} →</span>
        </div>
      </div>
      <div style={{ padding: `4px ${t.padX}px` }}>
        {moves.map((m, i, arr) => (
          <div key={m.name} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 12, alignItems: 'start', padding: '14px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK50, paddingTop: 4 }}>{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{m.name}</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{m.scheme}</div>
              <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 12.5, fontWeight: 500, color: t.INK50, letterSpacing: '-0.01em' }}>“{m.cue}”</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: rust, fontVariantNumeric: 'tabular-nums', paddingTop: 4, whiteSpace: 'nowrap' }}>{m.load || ''}{m.load && m.up ? ' +' : ''}</span>
          </div>
        ))}
      </div>

      {/* Quick actions — above the soundtrack */}
      <div style={{ padding: `14px ${t.padX}px 4px`, display: 'flex', gap: 10 }}>
        <BSSaveButton full item={{ id: 'workout:upper-pull-peak', kind: 'workout', title: 'Upper Pull — Peak', meta: '52 min · 6 moves · RPE 8', coach: 'Jordan Chen' }} />
        <button onClick={onMove} style={footBtn}>Move session</button>
        <button onClick={() => setReminded(true)} style={{ ...footBtn, ...(reminded ? { borderColor: teal, color: teal } : {}) }}>{reminded ? '✓ Reminder set' : 'Remind me'}</button>
      </div>

      {/* Pre-workout playlist — tap the play button to open it in Spotify before training */}
      <div style={{ padding: `18px ${t.padX}px 4px` }}>
        <BSEyebrow color={teal}>Soundtrack</BSEyebrow>
        <div style={{ marginTop: 2, marginBottom: 12, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Pre-workout</div>
        <BSPlaylistCard kicker="Jordan Chen · Your coach" title="Pull heavy." meta="52m · 95-138 BPM · 14 tracks" color="#1db954" spotifyUrl="https://open.spotify.com/playlist/37i9dQZF1DX76Wlfdnj7AP" tracks={[
          { a: 'Iron Count', b: 'Tariq Osei', len: '3:38' },
          { a: 'Chalk & Steel', b: 'Sable', len: '4:02' },
          { a: 'Top Set', b: 'Linnea Aho', len: '3:21' },
          { a: 'Overhand', b: 'Samyuel', len: '3:54' },
          { a: 'Lat Spread', b: 'Mara Vance', len: '4:16' },
          { a: 'Last Rep', b: 'Shape Radio', len: '3:45' },
        ]} />
      </div>

      <div style={{ padding: `16px ${t.padX}px 14px` }}>
        <button onClick={onStart} style={{ width: '100%', padding: '15px', borderRadius: 999, border: 0, background: teal, color: t.isLight ? '#ffffff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Begin session →</button>
      </div>
      <BSFooter right="Preview" />
    </BSPage>
  );
}

// Full meal-logging flow — opened from the home "Up next" meal card's
// "Log now" button. One-tap "ate as planned", or adjust portion / ingredients,
// photo, or voice; writes to the day total and shows a logged confirmation.
function BSLogMealFlow({ onClose, onLogged = () => {} }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [mode, setMode] = useStateBSC('adjust');
  const [portion, setPortion] = useStateBSC(1);
  const [note, setNote] = useStateBSC('');
  const [foodQuery, setFoodQuery] = useStateBSC('');
  const [logged, setLogged] = useStateBSC(false);
  const [ings, setIngs] = useStateBSC([
    { name: 'Grilled chicken breast', qty: '6 oz',  kcal: 280, p: 52, c: 0,  f: 8,  on: true },
    { name: 'Jasmine rice',           qty: '1 cup', kcal: 205, p: 4,  c: 45, f: 0,  on: true },
    { name: 'Charred broccoli',       qty: '1 cup', kcal: 55,  p: 4,  c: 11, f: 0,  on: true },
    { name: 'Avocado',                qty: '½',     kcal: 120, p: 2,  c: 6,  f: 11, on: true },
    { name: 'Tahini sauce',           qty: '2 tbsp',kcal: 90,  p: 3,  c: 3,  f: 8,  on: true },
  ]);
  const toggle = (i) => setIngs(arr => arr.map((x, j) => (j === i ? { ...x, on: !x.on } : x)));

  // Voice note for the coach — either dictate (speech → text appended to the
  // note) or record an audio memo that rides along with the log. Web
  // MediaRecorder; transcription via /api/nutrition/voice. (Native mic plugin
  // is a follow-up.)
  const [voiceCapture, setVoiceCapture] = useStateBSC('text'); // 'text' (dictate) | 'audio' (memo)
  const [voiceState, setVoiceState] = useStateBSC('idle');     // 'idle' | 'recording' | 'processing'
  const [voiceError, setVoiceError] = useStateBSC('');
  const [voiceSecs, setVoiceSecs] = useStateBSC(0);
  const [voiceMemo, setVoiceMemo] = useStateBSC(null);         // { url, secs } recorded audio memo
  const voiceRef = React.useRef({ rec: null, chunks: [], stream: null, timer: null, secs: 0 });
  const fmtSecs = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  const cleanupVoice = () => {
    const v = voiceRef.current;
    if (v.timer) { clearInterval(v.timer); v.timer = null; }
    try { v.stream && v.stream.getTracks().forEach(tr => tr.stop()); } catch (e) {}
    v.stream = null; v.rec = null; v.chunks = [];
  };
  React.useEffect(() => () => cleanupVoice(), []);
  const removeMemo = () => { setVoiceMemo(m => { try { if (m && m.url) URL.revokeObjectURL(m.url); } catch (e) {} return null; }); };
  const dictate = async (blob) => {
    setVoiceState('processing');
    try {
      const fd = new FormData();
      fd.append('audio', blob, 'note.webm');
      const res = await fetch('/api/nutrition/voice', { method: 'POST', body: fd, credentials: 'same-origin' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) { setVoiceError(data && data.error ? data.error : 'Could not transcribe'); return; }
      const text = String(data.transcript || '').trim();
      if (text) { setNote(n => (n && n.trim() ? `${n.trim()} ${text}` : text)); window.__bsToast?.('Added to your note', 'ok'); }
      else setVoiceError('Didn’t catch that — try again');
    } catch (e) {
      setVoiceError('Voice notes unavailable');
    } finally {
      setVoiceState('idle');
    }
  };
  const startVoice = async () => {
    setVoiceError('');
    if (!(typeof navigator !== 'undefined' && navigator.mediaDevices && navigator.mediaDevices.getUserMedia && typeof MediaRecorder !== 'undefined')) {
      setVoiceError('Voice input isn’t supported here yet'); return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const v = voiceRef.current;
      v.stream = stream; v.rec = rec; v.chunks = []; v.secs = 0;
      const captureAtStart = voiceCapture;
      rec.ondataavailable = (e) => { if (e.data && e.data.size) v.chunks.push(e.data); };
      rec.onstop = () => {
        const secs = v.secs;
        const blob = new Blob(v.chunks, { type: rec.mimeType || 'audio/webm' });
        cleanupVoice();
        if (!(blob.size > 0)) { setVoiceState('idle'); return; }
        if (captureAtStart === 'audio') {
          setVoiceMemo(m => { try { if (m && m.url) URL.revokeObjectURL(m.url); } catch (e) {} return { url: URL.createObjectURL(blob), secs, blob }; });
          window.__bsToast?.('Voice memo attached', 'ok');
          setVoiceState('idle');
        } else {
          dictate(blob);
        }
      };
      rec.start();
      setVoiceSecs(0);
      setVoiceState('recording');
      v.timer = setInterval(() => { v.secs += 1; setVoiceSecs(v.secs); }, 1000);
    } catch (e) {
      setVoiceError('Microphone access denied'); cleanupVoice(); setVoiceState('idle');
    }
  };
  const stopVoice = () => {
    const v = voiceRef.current;
    if (v.timer) { clearInterval(v.timer); v.timer = null; }
    try { if (v.rec && v.rec.state !== 'inactive') v.rec.stop(); else { cleanupVoice(); setVoiceState('idle'); } }
    catch (e) { cleanupVoice(); setVoiceState('idle'); }
  };
  const toggleVoice = () => { if (voiceState === 'recording') stopVoice(); else if (voiceState === 'idle') startVoice(); };

  // Meal photo for the coach — capture (camera) or pick from the library. The
  // image rides along with the log to the coach via /api/nutrition/meal-note.
  // No on-device macro reading yet — Maya reviews the plate.
  const [photo, setPhoto] = useStateBSC(null); // { url, blob }
  const photoCamRef = React.useRef(null);
  const photoLibRef = React.useRef(null);
  const onPhotoPick = (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = ''; // let the user re-pick the same file later
    if (!file) return;
    if (!/^image\//.test(file.type || '')) { window.__bsToast?.('Pick an image', 'err'); return; }
    setPhoto(p => { try { if (p && p.url) URL.revokeObjectURL(p.url); } catch (err) {} return { url: URL.createObjectURL(file), blob: file }; });
    window.__bsToast?.('Photo attached', 'ok');
  };
  const removePhoto = () => setPhoto(p => { try { if (p && p.url) URL.revokeObjectURL(p.url); } catch (err) {} return null; });

  // Edit / add an ingredient via a bottom sheet. editIng.index === null = new.
  const [editIng, setEditIng] = useStateBSC(null);
  const openEditIng = (i) => { const x = ings[i]; setEditIng({ index: i, name: x.name, qty: x.qty || '', kcal: x.kcal, p: x.p, c: x.c, f: x.f }); };
  const openAddIng = () => setEditIng({ index: null, name: '', qty: '', kcal: '', p: '', c: '', f: '' });
  const setEditIngField = (k, v) => setEditIng(e => (e ? { ...e, [k]: v } : e));
  const saveEditIng = () => {
    if (!editIng) return;
    const name = String(editIng.name || '').trim();
    if (!name) { window.__bsToast?.('Add a name', 'err'); return; }
    const item = {
      name, qty: String(editIng.qty || '').trim() || '1 serving',
      kcal: Math.max(0, Math.round(Number(editIng.kcal) || 0)), p: Math.max(0, Math.round(Number(editIng.p) || 0)),
      c: Math.max(0, Math.round(Number(editIng.c) || 0)), f: Math.max(0, Math.round(Number(editIng.f) || 0)),
    };
    if (editIng.index == null) { setIngs(arr => [...arr, { ...item, on: true }]); window.__bsToast?.(`Added ${name}`, 'ok'); }
    else { const idx = editIng.index; setIngs(arr => arr.map((x, j) => (j === idx ? { ...x, ...item } : x))); window.__bsToast?.('Ingredient updated', 'ok'); }
    setEditIng(null);
  };
  const deleteEditIng = () => {
    if (editIng && editIng.index != null) { const idx = editIng.index; setIngs(arr => arr.filter((_, j) => j !== idx)); window.__bsToast?.('Removed', 'ok'); }
    setEditIng(null);
  };

  const sum = (k) => ings.reduce((a, x) => a + (x.on ? x[k] : 0), 0);
  const kcal = Math.round(sum('kcal') * portion);
  const P = Math.round(sum('p') * portion);
  const C = Math.round(sum('c') * portion);
  const F = Math.round(sum('f') * portion);
  const CAL_GOAL = 2100, P_GOAL = 165, DAY_BASE_CAL = 1568, DAY_BASE_P = 118;
  const dayCal = DAY_BASE_CAL + kcal;
  const dayP = DAY_BASE_P + P;
  // On log, deliver the written note + any voice memo to the client's
  // nutritionist (best-effort; the endpoint resolves the coach and no-ops when
  // there's nothing to send or no coach linked).
  const sendMealNote = () => {
    const hasNote = !!(note && note.trim());
    const hasMemo = !!(voiceMemo && voiceMemo.blob);
    const hasPhoto = !!(photo && photo.blob);
    if (!hasNote && !hasMemo && !hasPhoto) return;
    try {
      const fd = new FormData();
      if (hasNote) fd.append('note', note.trim());
      fd.append('mealTitle', 'Chicken bowl + rice');
      fd.append('mealSummary', `${kcal} kcal · ${P}P · ${C}C · ${F}F`);
      if (hasMemo) fd.append('audio', voiceMemo.blob, 'memo.webm');
      if (hasPhoto) fd.append('photo', photo.blob, photo.blob.name || 'meal.jpg');
      fetch('/api/nutrition/meal-note', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(r => r.json().catch(() => ({})))
        .then(d => { if (d && d.delivered) window.__bsToast?.('Sent to your coach', 'ok'); })
        .catch(() => {});
    } catch (e) {}
  };
  const doLog = () => { sendMealNote(); onLogged(); setLogged(true); };
  const primaryBtn = { width: '100%', padding: '15px', borderRadius: t.RADIUS_SM, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' };

  const DayTotals = ({ compact }) => (
    <div style={{ marginTop: compact ? 0 : 14, paddingTop: compact ? 0 : 12, borderTop: compact ? 0 : `1px solid ${t.HAIR}` }}>
      <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{compact ? 'Day so far' : 'After logging · day total'}</div>
      <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {[['Calories', dayCal, CAL_GOAL, teal], ['Protein', dayP, P_GOAL, t.RUST]].map(([l, v, goal, c]) => (
          <div key={l}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}><span>{l}</span><span>/ {goal}</span></div>
            <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: c }}>{v}</div>
            <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, (v / goal) * 100)}%`, height: '100%', background: c }} /></div>
          </div>
        ))}
      </div>
    </div>
  );

  if (logged) {
    return (
      <BSPage>
        <div style={{ padding: `84px ${t.padX}px 0`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
          <div style={{ width: 84, height: 84, borderRadius: 999, background: teal, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 44px ${teal}55` }}>
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#04201d" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.2 4.2L19 7" /></svg>
          </div>
          <div style={{ marginTop: 22, fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em' }}>Logged<span style={{ color: teal }}>.</span></div>
          <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 500, color: t.INK50, letterSpacing: '-0.005em' }}>{kcal} kcal · {P}P · 12:40 PM</div>
        </div>
        <div style={{ padding: `26px ${t.padX}px 0` }}>
          <div style={{ borderRadius: 16, border: `1px solid ${teal}40`, background: `linear-gradient(155deg, ${teal}14, ${t.PAPER2} 72%), ${t.PAPER2}`, padding: 16 }}>
            <DayTotals compact />
          </div>
        </div>
        <div style={{ padding: `22px ${t.padX}px 8px` }}>
          <button onClick={onClose} style={{ ...primaryBtn, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, letterSpacing: '0', textTransform: 'none' }}>Done →</button>
        </div>
        <div style={{ textAlign: 'center', paddingBottom: 28 }}>
          <button onClick={() => setLogged(false)} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK50, letterSpacing: '0' }}>Undo</button>
        </div>
      </BSPage>
    );
  }

  return (
    <BSPage>
      <div style={{ padding: `62px ${t.padX}px 2px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={onClose} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK }}>× Cancel</button>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Log meal</span>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.12em', color: t.INK50 }}>12:40 PM</span>
      </div>

      <div style={{ padding: `18px ${t.padX}px 4px` }}>
        <BSEyebrow color={t.INK50}>Lunch · Planned</BSEyebrow>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 32, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1 }}>Chicken bowl + rice<span style={{ color: teal }}>.</span></div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>620 planned · 48P · 72C · 14F</div>
      </div>

      {/* ONE TAP */}
      <div style={{ padding: `14px ${t.padX}px 4px` }}>
        <button onClick={doLog} style={{ width: '100%', textAlign: 'left', border: 0, borderRadius: 14, background: teal, color: '#04201d', padding: '15px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', opacity: 0.65 }}>One tap</span>
            <span style={{ display: 'block', marginTop: 4, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, letterSpacing: '-0.02em' }}>Ate it as planned</span>
          </span>
          <span style={{ fontSize: 20, fontWeight: 700 }}>✓</span>
        </button>
      </div>

      {/* OR ADJUST divider */}
      <div style={{ padding: `16px ${t.padX}px 10px`, display: 'flex', alignItems: 'center', gap: 12 }}>
        <span style={{ flex: 1, height: 1, background: t.HAIR }} />
        <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>Or adjust</span>
        <span style={{ flex: 1, height: 1, background: t.HAIR }} />
      </div>

      {/* MODE TABS */}
      <div style={{ padding: `0 ${t.padX}px`, display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8 }}>
        {[['adjust', 'Adjust', '✎'], ['photo', 'Photo', '⊡'], ['search', 'Search', '⌕'], ['voice', 'Voice', '●']].map(([k, label, glyph]) => {
          const on = mode === k;
          return (
            <button key={k} onClick={() => setMode(k)} style={{ padding: '12px 6px', borderRadius: 12, border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}14` : 'transparent', cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 14, color: on ? teal : t.INK50 }}>{glyph}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* MODE CONTENT */}
      {mode === 'adjust' && (
        <div style={{ padding: `18px ${t.padX}px 4px` }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50 }}>Portion</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: teal }}>{portion.toFixed(2)} <span style={{ fontSize: 13, color: t.INK50 }}>×</span></span>
          </div>
          <input type="range" min={0.25} max={2} step={0.25} value={portion} onChange={(e) => setPortion(parseFloat(e.target.value))} style={{ width: '100%', marginTop: 10, accentColor: teal, cursor: 'pointer' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', color: t.INK50, marginTop: 2 }}>
            <span>¼</span><span>½</span><span>1×</span><span>1½</span><span>2×</span>
          </div>

          <div style={{ marginTop: 18, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>Ingredients · tap to toggle</div>
          <div style={{ marginTop: 4 }}>
            {ings.map((x, i) => (
              <div key={x.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i === ings.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                <button onClick={() => toggle(i)} style={{ width: 22, height: 22, flexShrink: 0, borderRadius: 6, border: `1px solid ${x.on ? teal : t.RULE}`, background: x.on ? teal : 'transparent', color: '#04201d', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800 }}>{x.on ? '✓' : ''}</button>
                <div style={{ flex: 1, minWidth: 0, opacity: x.on ? 1 : 0.4 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{x.name}</div>
                  <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{x.qty} · {Math.round(x.kcal * portion)} kcal · {Math.round(x.p * portion)}P</div>
                </div>
                <button onClick={() => openEditIng(i)} style={{ flexShrink: 0, background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.RUST }}>Edit</button>
              </div>
            ))}
          </div>
          <button onClick={openAddIng} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: t.RADIUS_SM, border: `1px dashed ${t.RULE}`, background: 'transparent', color: t.INK70, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>+ Add ingredient</button>
        </div>
      )}

      {mode === 'photo' && (
        <div style={{ padding: `18px ${t.padX}px 4px` }}>
          <input ref={photoCamRef} type="file" accept="image/*" capture="environment" onChange={onPhotoPick} style={{ display: 'none' }} />
          <input ref={photoLibRef} type="file" accept="image/*" onChange={onPhotoPick} style={{ display: 'none' }} />
          {photo ? (
            <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, overflow: 'hidden', position: 'relative' }}>
              <img src={photo.url} alt="Your meal" style={{ display: 'block', width: '100%', maxHeight: 280, objectFit: 'cover' }} />
              <button onClick={removePhoto} aria-label="Remove photo" style={{ position: 'absolute', top: 10, right: 10, width: 30, height: 30, borderRadius: 999, border: 0, background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', fontSize: 16, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
              <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '14px 12px 8px', background: 'linear-gradient(transparent, rgba(0,0,0,0.62))', color: '#fff', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700 }}>Sends to Maya when you log</div>
            </div>
          ) : (
            <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '34px 16px', textAlign: 'center' }}>
              <div style={{ fontSize: 30 }}>⊡</div>
              <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>Snap or upload</div>
              <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>Maya reviews your plate</div>
            </div>
          )}
          <div style={{ marginTop: 12, display: 'flex', gap: 10 }}>
            <button onClick={() => photoCamRef.current && photoCamRef.current.click()} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: 0, background: teal, color: '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{photo ? 'Retake' : 'Take photo'}</button>
            <button onClick={() => photoLibRef.current && photoLibRef.current.click()} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Upload</button>
          </div>
        </div>
      )}

      {mode === 'search' && (() => {
        const FOODS = [
          { name: 'Chipotle · chicken bowl', qty: '1 bowl',  kcal: 560, p: 42, c: 52, f: 18 },
          { name: 'Whey isolate',            qty: '1 scoop', kcal: 120, p: 25, c: 3,  f: 1  },
          { name: 'Jasmine rice',            qty: '1 cup',   kcal: 205, p: 4,  c: 45, f: 0  },
          { name: 'Grilled chicken breast',  qty: '6 oz',    kcal: 280, p: 52, c: 0,  f: 8  },
          { name: 'Greek yogurt · plain',    qty: '1 cup',   kcal: 150, p: 25, c: 9,  f: 4  },
          { name: 'Banana',                  qty: '1 medium',kcal: 105, p: 1,  c: 27, f: 0  },
          { name: 'Almonds',                 qty: '1 oz',    kcal: 165, p: 6,  c: 6,  f: 14 },
          { name: 'Olive oil',               qty: '1 tbsp',  kcal: 120, p: 0,  c: 0,  f: 14 },
        ];
        const q = foodQuery.trim().toLowerCase();
        const rows = q ? FOODS.filter(f => f.name.toLowerCase().includes(q)) : FOODS.slice(0, 3);
        const addFood = (f) => {
          setIngs(arr => [...arr, { name: f.name, qty: f.qty, kcal: f.kcal, p: f.p, c: f.c, f: f.f, on: true }]);
          window.__bsToast?.(`Added ${f.name}`, 'ok');
        };
        return (
          <div style={{ padding: `18px ${t.padX}px 4px` }}>
            <input value={foodQuery} onChange={(e) => setFoodQuery(e.target.value)} placeholder="Search foods, brands, barcodes…" style={{ width: '100%', padding: '13px 14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, outline: 'none' }} />
            <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{q ? `${rows.length} result${rows.length === 1 ? '' : 's'}` : 'Recents'}</div>
            <div style={{ marginTop: 2 }}>
              {rows.map((r, i) => (
                <div key={r.name} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 0', borderBottom: i === rows.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.name}</div>
                    <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{r.qty} · {r.kcal} kcal · {r.p}P</div>
                  </div>
                  <button onClick={() => addFood(r)} style={{ flexShrink: 0, background: 'transparent', border: 0, color: teal, cursor: 'pointer', fontSize: 20, fontWeight: 700, lineHeight: 1, padding: '4px 6px' }}>+</button>
                </div>
              ))}
              {rows.length === 0 && <div style={{ padding: '16px 0', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK50 }}>No matches for “{foodQuery.trim()}”.</div>}
            </div>
          </div>
        );
      })()}

      {mode === 'voice' && (
        <div style={{ padding: `18px ${t.padX}px 4px` }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>Voice note to your coach</div>
          <div style={{ display: 'flex', gap: 6, marginBottom: 14 }}>
            {[['text', 'Voice to text'], ['audio', 'Voice record']].map(([k, l]) => {
              const on = voiceCapture === k;
              return (
                <button key={k} onClick={() => { if (voiceState !== 'idle') return; setVoiceCapture(k); setVoiceError(''); }} style={{
                  flex: 1, padding: '9px 8px', borderRadius: t.RADIUS_SM, cursor: 'pointer',
                  border: `1px solid ${on ? teal : t.RULE}`, background: on ? `${teal}14` : 'transparent',
                  color: on ? t.INK : t.INK50, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
                }}>{l}</button>
              );
            })}
          </div>

          <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '24px 16px', textAlign: 'center' }}>
            {voiceCapture === 'audio' && voiceMemo && voiceState !== 'recording' ? (
              <div>
                <audio src={voiceMemo.url} controls style={{ width: '100%' }} />
                <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Memo · {fmtSecs(voiceMemo.secs)}</span>
                  <button onClick={removeMemo} style={{ background: 'transparent', border: 0, color: t.RUST, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Remove</button>
                </div>
                <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>Sent to your coach with this log</div>
              </div>
            ) : (
              <>
                <button onClick={toggleVoice} disabled={voiceState === 'processing'} aria-label={voiceState === 'recording' ? 'Stop recording' : 'Start speaking'} style={{
                  width: 96, height: 96, margin: '0 auto', borderRadius: 999, border: 0, padding: 0,
                  cursor: voiceState === 'processing' ? 'default' : 'pointer',
                  opacity: voiceState === 'processing' ? 0.6 : 1,
                  background: `radial-gradient(circle, ${teal} 0%, ${teal} 32%, ${teal}22 33%, transparent 70%)`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  animation: voiceState === 'recording' ? 'bs-blink 1.1s ease-in-out infinite' : 'none',
                }}>
                  {voiceState === 'recording'
                    ? <span style={{ width: 24, height: 24, borderRadius: 6, background: '#04201d', display: 'block' }} />
                    : <span style={{ width: 14, height: 14, borderRadius: 999, background: '#04201d', display: 'block' }} />}
                </button>
                <div style={{ marginTop: 16, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, fontWeight: 600, color: t.INK70, minHeight: 21, padding: `0 ${t.padX}px` }}>
                  {voiceState === 'recording' ? 'Listening…' : voiceState === 'processing' ? 'Transcribing…' : (voiceCapture === 'text' ? 'Speak — it’s added to your note' : 'Record a memo for your coach')}
                </div>
                <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: voiceError ? t.RUST : t.INK50, fontWeight: 600 }}>
                  {voiceError ? voiceError : voiceState === 'recording' ? `Tap to stop · ${fmtSecs(voiceSecs)}` : voiceState === 'processing' ? 'Working…' : 'Tap to speak'}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* NOTE */}
      <div style={{ padding: `16px ${t.padX}px 4px` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>Note to Dr. Maya · optional</div>
        <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Felt a bit hungry still · swapped rice for sweet potato…" style={{ width: '100%', padding: '12px 13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, outline: 'none', resize: 'vertical' }} />
      </div>

      {/* THIS MEAL summary */}
      <div style={{ padding: `18px ${t.padX}px 4px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
            <BSEyebrow color={teal}>This meal</BSEyebrow>
            <span><span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: t.INK }}>{kcal}</span> <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, textTransform: 'uppercase', letterSpacing: '0.1em' }}>kcal</span></span>
          </div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {[['Pro', P, t.RUST], ['Carb', C, teal], ['Fat', F, t.AMBER]].map(([l, v, c]) => (
              <div key={l}>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{l}</div>
                <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 21, fontWeight: 700, color: c }}>{v}<span style={{ fontSize: 11, color: t.INK50 }}>g</span></div>
              </div>
            ))}
          </div>
          <DayTotals />
        </div>
      </div>

      <div style={{ height: 12 }} />

      {/* Ingredient editor / add sheet */}
      {editIng && (() => {
        const inputStyle = { width: '100%', boxSizing: 'border-box', padding: '12px 13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, outline: 'none' };
        return createPortal((
          <div onClick={() => setEditIng(null)} style={{ position: 'absolute', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -16px 40px rgba(0,0,0,0.35)' }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, marginBottom: 12 }}>{editIng.index == null ? 'Add ingredient' : 'Edit ingredient'}</div>
              <input autoFocus value={editIng.name} placeholder="Ingredient" onChange={(e) => setEditIngField('name', e.target.value)} style={inputStyle} />
              <input value={editIng.qty} placeholder="Portion · e.g. 1 cup" onChange={(e) => setEditIngField('qty', e.target.value)} style={{ ...inputStyle, marginTop: 8 }} />
              <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 8 }}>
                {[['kcal', 'Kcal'], ['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']].map(([k, l]) => (
                  <label key={k} style={{ display: 'block' }}>
                    <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 4 }}>{l}</span>
                    <input value={editIng[k]} inputMode="numeric" placeholder="0" onChange={(e) => setEditIngField(k, e.target.value.replace(/[^0-9]/g, ''))} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 6px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.MONO, fontSize: 13, fontWeight: 700, outline: 'none', textAlign: 'center' }} />
                  </label>
                ))}
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
                {editIng.index != null && <button onClick={deleteEditIng} style={{ padding: '13px 14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RUST}`, background: 'transparent', color: t.RUST, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Remove</button>}
                <button onClick={() => setEditIng(null)} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Cancel</button>
                <button onClick={saveEditIng} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Save</button>
              </div>
            </div>
          </div>
        ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body);
      })()}
    </BSPage>
  );
}

function BSClientHome({ onProfile, sheet, goCalendar, goRadio, goTrain, goMarket, goScore, goChat = () => {}, goIntegrations, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const bsHomeProgram = useBSProgram();
  // Real current week, computed live so the home reflects today (not demo dates).
  // Monday-first index 0..6; weekDates = the seven dates of this calendar week.
  const _BS_MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const _BS_DOWL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const _now = new Date();
  const todayIdx = (_now.getDay() + 6) % 7;
  // Today's workout from the shared week — drives the "Up next" card + its preview
  // so the featured session matches the calendar/week strip (null on a rest day).
  const todayWorkout = bsClientWorkoutForDay(todayIdx);
  const weekDates = (() => {
    const mon = new Date(_now); mon.setHours(0, 0, 0, 0); mon.setDate(_now.getDate() - todayIdx);
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d; });
  })();
  const isoWeek = (() => {
    const d = new Date(Date.UTC(_now.getFullYear(), _now.getMonth(), _now.getDate()));
    const day = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - day + 3);
    const firstThu = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - firstThu) / 86400000 - 3 + ((firstThu.getUTCDay() + 6) % 7)) / 7);
  })();
  const nowTime = `${String(_now.getHours()).padStart(2, '0')}:${String(_now.getMinutes()).padStart(2, '0')}`;
  const fmtDate = (idx) => `${_BS_MON[weekDates[idx].getMonth()]} ${weekDates[idx].getDate()}`;

  const [selIdx, setSelIdx] = useStateBSC(todayIdx); // selected weekday 0..6 (today by default)
  const [nextMealLogged, setNextMealLogged] = useStateBSC(false);
  const [previewMeal, setPreviewMeal] = useStateBSC(null);
  const [weekStat, setWeekStat] = useStateBSC(null); // tapped Week-totals card → detail sheet
  const [showWorkoutPreview, setShowWorkoutPreview] = useStateBSC(false);
  const [showLogMeal, setShowLogMeal] = useStateBSC(false);
  const [habitsPage, setHabitsPage] = useStateBSC(false);
  const [showLogActivity, setShowLogActivity] = useStateBSC(false);
  const [showMood, setShowMood] = useStateBSC(false);
  const [activeDayLogKey, setActiveDayLogKey] = useStateBSC(null);
  const [quickLoggedItems, setQuickLoggedItems] = useStateBSC({});
  const [coachFeed, setCoachFeed] = useStateBSC({ banners: [], items: [] });
  const [ticker, setTicker] = useStateBSC(null);
  // Which ticker metrics to show + their order — edited in Settings, saved to profile.
  const [tickerPrefs, setTickerPrefs] = useStateBSC({ hidden: [], order: null });
  React.useEffect(() => {
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    let alive = true;
    window.shapeDb.getUserGoals('client_ticker').then(s => {
      if (alive && s && typeof s === 'object') setTickerPrefs({ hidden: Array.isArray(s.hidden) ? s.hidden : [], order: Array.isArray(s.order) ? s.order : null });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const [analytics, setAnalytics] = useStateBSC(null);
  // The Energy card reads the user's active goal (nutrition + training prefs)
  // and reframes the same balance into one of three states. Default 'maintain'.
  const [energyGoal, setEnergyGoal] = useStateBSC('maintain');
  React.useEffect(() => {
    let cancelled = false;
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    Promise.all([
      window.shapeDb.getUserGoals('client_nutrition_prefs').catch(() => ({})),
      window.shapeDb.getUserGoals('client_training_prefs').catch(() => ({})),
    ]).then(([np, tp]) => {
      if (cancelled) return;
      const raw = `${(np && np.primary_goal) || ''} ${(tp && tp.primary_goal) || (tp && tp.goal) || ''}`.toLowerCase();
      const goal = /fat ?loss|cut|lean|weight ?loss|shred/.test(raw) ? 'cut'
        : /hypertroph|build|bulk|mass|muscle|strength|gain/.test(raw) ? 'build'
        : 'maintain';
      setEnergyGoal(goal);
    });
    return () => { cancelled = true; };
  }, []);

  // Live focus banner + pushed items the coach sent. Initial pull, then a
  // Supabase Realtime subscription on coach_focus_banners / coach_pushed_items
  // (filtered to this user's rows via RLS) re-fetches the moment the coach
  // hits Send / Add — banner / today's list update without a pull-to-refresh.
  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        if (!window.ShapeCoachFeed || typeof window.ShapeCoachFeed.fetch !== 'function') return;
        const feed = await window.ShapeCoachFeed.fetch();
        if (!cancelled && feed) setCoachFeed(feed);
      } catch {}
    };
    load();
    const unsubscribe = (window.ShapeCoachFeed && typeof window.ShapeCoachFeed.subscribe === 'function')
      ? window.ShapeCoachFeed.subscribe(() => { if (!cancelled) load(); })
      : () => {};
    return () => {
      cancelled = true;
      try { unsubscribe(); } catch {}
    };
  }, []);

  // Hydrate the masthead ticker from /api/client/analytics — latest snapshot
  // (calories, protein, sleep, HRV, RHR, weight). Falls back to the demo
  // values when the API returns nothing (signed-out / brand-new account).
  const refreshAnalytics = React.useCallback(() => {
    // Try the authenticated helper first (sends Bearer in native). If it yields
    // nothing — e.g. the helper's own guards, or demo mode — fall back to a
    // plain same-origin fetch, which authenticates via the bridged cookie on
    // /m/. This covers both the native shell and the in-browser /m/ preview.
    const viaHelper = window.ShapeAnalytics?.get ? window.ShapeAnalytics.get() : Promise.resolve(null);
    Promise.resolve(viaHelper)
      .then(d => {
        if (d) return d;
        return fetch('/api/client/analytics', { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
      })
      .then(d => { if (d) { if (d.ticker) setTicker(d.ticker); setAnalytics(d); } })
      .catch(() => {});
  }, []);
  React.useEffect(() => { refreshAnalytics(); }, [refreshAnalytics]);

  // Today's Shape Score additions for the home "Score" chip. Sums the score
  // ledger entries earned *today* (local day) so the chip reflects what's been
  // added so far this day and grows as the day goes on. null = not loaded /
  // demo, in which case the chip keeps its sample value.
  const [todayScore, setTodayScore] = useStateBSC(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/client/score', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        if (cancelled || !d || !Array.isArray(d.recent)) return;
        const todayKey = new Date().toDateString();
        const sum = d.recent
          .filter(e => e && e.earned_at && new Date(e.earned_at).toDateString() === todayKey)
          .reduce((acc, e) => acc + (Number(e.delta) || 0), 0);
        setTodayScore(sum);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Home-page lunch record (fed to BSMealPreview when user taps the slab).
  // Mirrors the shape of meals in BSClientEat — same preview component.
  const HOME_LUNCH = {
    id: 'home-lunch',
    time: (typeof window !== 'undefined' && window.ShapeMealTimes && window.ShapeMealTimes.get().LUNCH) || '12:40', tag: 'LUNCH', tagColor: t.AMBER,
    title: 'Chicken bowl with rice',
    sub: '620 kcal · 48P · 72C · 14F',
    kcal: 620, p: 48, c: 72, f: 14, prep: '15 min', portion: '1 bowl', score: 'A',
    hero: 'Grilled chicken thigh, jasmine rice, roasted vegetables, tahini-lemon sauce.',
    brief: 'The anchor meal of the day — biggest carb hit, biggest protein. Eat slow, finish the plate.',
    ingredients: [
      { n: '180 g', m: 'Chicken thigh',      k: '320 kcal' },
      { n: '150 g', m: 'Jasmine rice',       k: '195 kcal' },
      { n: '120 g', m: 'Roast veg medley',   k: '60 kcal' },
      { n: '15 g',  m: 'Tahini',             k: '95 kcal' },
      { n: '½',     m: 'Lemon',              k: '5 kcal' },
    ],
    steps: [
      'Season chicken with salt + paprika, sear 4 min/side over medium-high.',
      'Cook rice 1:1.5 in salted water, cover 12 min, fluff.',
      'Roast veg at 220°C / 425°F for 15 min, flipping halfway.',
      'Whisk tahini + lemon + 30 ml warm water until pourable.',
      'Plate rice, top with chicken + veg, drizzle sauce.',
    ],
    coachNote: 'This is your peak fueling moment. If energy crashed yesterday, add 30 g rice today.',
  };

  // Per-day logs + week-strip dots are both derived from the SHARED client demo
  // week (bsClientWeekDemo.js) — the same source the month calendar uses — so the
  // home week strip and the calendar always show the same workouts/consults/meals
  // for a given weekday. Keyed Mon..Sun → 20..26 to ride the live week.
  const BS_KIND_COLOR = { TRN: t.AMBER, MEAL: t.BLUE, CHK: t.GREEN, CON: t.RUST, REST: t.INK50 };
  const DAY_LOGS = {};
  BS_CLIENT_WEEK_DEMO.forEach((day, idx) => {
    DAY_LOGS[20 + idx] = day.map((it, i) => ({
      time: it.time, tag: it.kind, tagColor: BS_KIND_COLOR[it.kind] || t.INK50,
      title: it.title, sub: it.sub, state: it.state, last: i === day.length - 1,
    }));
  });
  const WEEK_DOTS_BY_IDX = BS_CLIENT_WEEK_DEMO.map((day) => {
    const kinds = new Set(day.map((it) => it.kind));
    return BS_CLIENT_WEEK_DOT_ORDER.filter((k) => kinds.has(k)).map((k) => BS_KIND_COLOR[k]);
  });
  const selDay = weekDates[selIdx].getDate(); // day-of-month for display strings
  const dataDay = 20 + selIdx;
  const dayLog = DAY_LOGS[dataDay] || [];
  const dayLogKey = (row, i) => `${selIdx}-${row.time}-${row.tag || 'item'}-${i}`;
  const dayLogDetails = (row) => {
    if (row.tag === 'MEAL') return {
      label: 'Nutrition log',
      description: `Confirm ${row.title.toLowerCase()} to update calories, protein, carbs, fat, and meal timing for today's ledger.`,
      metrics: [['MACROS', row.sub || 'Pending'], ['SOURCE', 'Coach plan'], ['ACTION', 'Confirm meal']],
      note: 'After logging, this meal counts toward the daily calorie balance and Shape Score nutrition streak.',
    };
    if (row.tag === 'TRN') return {
      label: 'Workout log',
      description: `Start or confirm ${row.title.toLowerCase()}. Sets, rest time, RPE, and sensor-assisted timing can be captured from the workout screen.`,
      metrics: [['SESSION', row.sub || 'Assigned'], ['LOGGING', 'Sets + rest'], ['COACH', 'Jordan']],
      note: 'Use this when you want the coach to see what happened during the workout, not just that it was completed.',
    };
    if (row.tag === 'CHK') return {
      label: 'Check-in',
      description: `Open a short check-in for ${row.title.toLowerCase()}. Add sleep, energy, soreness, mood, RPE, and a note for your coach.`,
      metrics: [['FOCUS', row.sub || 'Daily'], ['TIME', '2 min'], ['VISIBLE TO', 'Coach']],
      note: 'Quick check-ins help adjust tomorrow before the plan gets stale.',
    };
    if (row.tag === 'CON') return {
      label: 'Consult',
      description: `Preview the scheduled consult details and confirm attendance. Notes can be attached after the call.`,
      metrics: [['PROVIDER', row.sub || 'Scheduled'], ['TYPE', 'Video'], ['STATUS', 'Upcoming']],
      note: 'This will connect to booking and video session records once the live backend flow is enabled.',
    };
    return {
      label: 'Daily item',
      description: row.sub || 'Quick log item.',
      metrics: [['TIME', row.time], ['TYPE', row.tag || 'Item'], ['STATUS', 'Ready']],
      note: 'Tap Log now when this item is complete.',
    };
  };
  const logDayItem = (key, row) => {
    setQuickLoggedItems(prev => ({ ...prev, [key]: true }));
    // A workout/training item logs a real activity so it lands on the live
    // Training card + Shape Score, then refresh analytics so the card updates.
    if (row && row.tag === 'TRN' && window.ShapeActivities?.log) {
      const minMatch = String(row.sub || '').match(/(\d+)\s*min/i);
      const durationMin = minMatch ? Number(minMatch[1]) : 45;
      window.ShapeActivities.log({ activityType: 'strength', durationMin, title: row.title })
        .then(() => { refreshAnalytics(); window.__bsToast?.('Workout logged · Training updated', 'ok'); })
        .catch(() => window.__bsToast?.('Logged locally — sign in to save', 'warn'));
    } else if (row && row.tag === 'MEAL') {
      window.__bsToast?.('Meal logged', 'ok');
    }
  };
  const activeDayLogEntry = dayLog
    .map((row, i) => ({ row, key: dayLogKey(row, i), index: i }))
    .find(entry => entry.key === activeDayLogKey);
  const activeDayLog = activeDayLogEntry?.row;
  const activeDayLogLogged = activeDayLogEntry
    ? activeDayLog.state === 'done' || !!quickLoggedItems[activeDayLogEntry.key]
    : false;
  const activeDayLogDetails = activeDayLog ? dayLogDetails(activeDayLog) : null;

  // Per-day calorie balance for the LEAD block (target = 2100 burned).
  // Sums kcal from MEAL items in DAY_LOGS, computes deficit/surplus.
  const DAY_MACROS = {
    20: { kcalIn: 1588, kcalBurn: 2100, status: 'logged', note: 'Five logs in. Lower pull + 4 meals.' },
    21: { kcalIn: 1568, kcalBurn: 2100, status: 'on track', note: 'On track. 1568 in, 2100 burned.\nOne workout and lunch left to log.' },
    22: { kcalIn: 1570, kcalBurn: 2050, status: 'on track', note: 'Day done. Pull day + 3 meals.' },
    23: { kcalIn: 1550, kcalBurn: 1900, status: 'easy day', note: 'Light day. Z2 run + 2 meals.' },
    24: { kcalIn: 2200, kcalBurn: 2100, status: 'refeed',   note: 'Refeed Friday. +100 over target.\nPlanned ahead of consult.' },
    25: { kcalIn: 1720, kcalBurn: 1850, status: 'long run', note: 'Long run done. Brunch + 3 meals.' },
    26: { kcalIn: 1320, kcalBurn: 1700, status: 'rest day', note: 'Rest day. Three lighter meals.' },
  };
  const macros = DAY_MACROS[dataDay] || DAY_MACROS[20 + todayIdx] || DAY_MACROS[21];
  // Live balance for TODAY when we have a real logged-calories snapshot
  // (ticker.cal from /api/client/analytics: consumed vs target). Other days, or
  // when nothing's logged, fall back to the editorial sample.
  const liveCal = ticker && typeof ticker.cal === 'number' ? ticker.cal : null;
  const liveTarget = ticker && typeof ticker.cal_target === 'number' ? ticker.cal_target : null;
  const hasLiveBalance = selIdx === todayIdx && liveCal != null && liveTarget != null;
  const balance = hasLiveBalance ? (liveCal - liveTarget) : (macros.kcalIn - macros.kcalBurn); // negative = deficit
  const balanceSign = balance < 0 ? '−' : '+';
  const balanceValue = Math.abs(balance).toString();
  // Demoted secondary line with a tilde (admits it's approximate). '— kcal' when
  // today has no logged nutrition yet.
  const noLiveToday = selIdx === todayIdx && liveCal == null;
  const energyEstimate = noLiveToday ? '— kcal' : `~${balanceSign}${balanceValue} kcal`;

  // ── ENERGY card — one component, three goal-driven states. Same balance,
  // reframed: a deficit reads as on-target for a cut, balanced for maintenance,
  // and "fuel up" for a build. Hero is a word, not a fake-precise number.
  const energyAccents = { cut: t.GREEN, maintain: t.BLUE, build: t.AMBER };
  const energyAccent = energyAccents[energyGoal] || t.BLUE;
  const ENERGY_STATES = {
    cut: {
      kicker: 'Energy · On target', hero: 'Under',
      meta: ['Fat loss', energyEstimate, 'within range'],
      tail: balance < 0 ? "You're tracking where you want to be." : 'A little over today — ease back tomorrow.',
    },
    maintain: {
      kicker: 'Energy · Balanced', hero: 'Even',
      meta: ['Maintain', energyEstimate, 'steady'],
      tail: 'Right in the pocket for holding steady.',
    },
    build: {
      kicker: 'Energy · Fuel up', hero: balance < 0 ? 'Short' : 'Built',
      meta: ['Build', energyEstimate, balance < 0 ? 'under surplus' : 'on surplus'],
      tail: balance < 0 ? 'A build day wants more — add a meal.' : "Surplus in. That's the fuel for growth.",
    },
  };
  let energy = ENERGY_STATES[energyGoal] || ENERGY_STATES.maintain;
  // Today with nothing logged yet → invite logging instead of asserting a state.
  if (noLiveToday) {
    const goalLabel = { cut: 'Fat loss', maintain: 'Maintain', build: 'Build' }[energyGoal] || 'Maintain';
    energy = { kicker: 'Energy · Log to see', hero: 'Open', meta: [goalLabel, '— kcal', 'nothing logged'], tail: '' };
  }
  const energyCaption = noLiveToday
    ? 'Log a meal to see where today lands against your goal.'
    : (hasLiveBalance ? energy.tail : `${macros.note} ${energy.tail}`);

  // Context handed to the customizable card stack so each card builds from live
  // signals. `energy` here is the goal-aware model computed above.
  const homeCardsCtx = { t, ticker, analytics, energy, energyAccent, energyCaption, noLiveToday };
  const homeCardOpeners = {
    training: goTrain,
    consistency: goScore,
    energy: undefined,
    recovery: goIntegrations,
    protein: undefined,
    mood: () => setShowMood(true),
  };

  if (previewMeal) {
    return <BSMealPreview meal={previewMeal} onBack={() => setPreviewMeal(null)} onLog={() => { setPreviewMeal(null); setShowLogMeal(true); }} />;
  }
  if (showWorkoutPreview) {
    return <BSHomeWorkoutPreview workout={todayWorkout} onBack={() => setShowWorkoutPreview(false)} onMove={() => { setShowWorkoutPreview(false); goCalendar?.(); }} onStart={() => { setShowWorkoutPreview(false); goTrain?.(); }} onMessage={() => { setShowWorkoutPreview(false); goChat('Jordan Chen', 'Coach · Hypertrophy'); }} />;
  }
  if (showLogMeal) {
    return <BSLogMealFlow onClose={() => setShowLogMeal(false)} onLogged={() => setNextMealLogged(true)} />;
  }
  if (habitsPage) {
    return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => setHabitsPage(false)} onOpenScore={() => { setHabitsPage(false); goScore?.(); }} />;
  }

  return (
    <BSPage>
      <BSMasthead
        compact
        title={<img src={`${import.meta.env.BASE_URL}shape-wordmark.png`} alt="Shape" style={{ display: 'block', margin: '6px auto -2px', height: 56, width: 'auto', filter: 'brightness(0) invert(1)' }} />}
        leftKicker={`${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][_now.getDay()]} · ${_BS_MON[_now.getMonth()]} ${_now.getDate()} · ${_now.getFullYear()}`}
        rightKicker={`${bsHomeProgram.nutritionPhase || 'Cut'} · W${isoWeek}`}
        trailing={<BSFacetAvatar size={34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={onProfile} />}
        showDoubleRule={false}
        showDotTexture={false}
      />

      <BSTicker items={(() => {
        const tk = ticker || {};
        const fmtSleep = (h) => {
          if (h == null) return null;
          const whole = Math.floor(h);
          const min = Math.round((h - whole) * 60);
          return `${whole}H${String(min).padStart(2, '0')}M`;
        };
        const fmtDelta = (n, suffix) => {
          if (n == null) return '';
          const sign = n > 0 ? '+' : n < 0 ? '-' : '';
          return `${sign}${Math.abs(n)}${suffix}`;
        };
        const pct = tk.cal != null && tk.cal_target ? Math.round((tk.cal / tk.cal_target - 1) * 100) : null;
        const proColor = tk.protein_g != null && tk.protein_g >= 120 ? '#a3e09a' : undefined;
        const all = [
          { label: 'CAL',  value: tk.cal != null ? `${tk.cal}/${tk.cal_target}` : '1568/2100', note: pct != null ? `${pct >= 0 ? '+' : ''}${pct}% TGT` : '-25% TGT' },
          { label: 'PRO',  value: tk.protein_g != null ? `${tk.protein_g}G` : '118G', note: tk.protein_g != null && tk.protein_g >= 120 ? 'ON PACE' : 'BUILD UP', color: proColor },
          { label: 'SLP',  value: fmtSleep(tk.sleep_hours) || '7H24M', note: fmtDelta(tk.sleep_delta_min, 'M VS YEST') || '+28M VS AVG', color: '#a3e09a' },
          { label: 'HRV',  value: tk.hrv_ms != null ? `${Math.round(tk.hrv_ms)}MS` : '62MS', note: tk.hrv_ms != null && tk.hrv_ms >= 50 ? 'GOOD' : 'LOW', color: tk.hrv_ms != null && tk.hrv_ms >= 50 ? '#a3e09a' : '#ffc56a' },
          { label: 'RHR',  value: tk.resting_hr != null ? `${Math.round(tk.resting_hr)}BPM` : '54BPM', note: tk.resting_hr != null && tk.resting_hr > 60 ? 'ELEV' : 'STEADY', color: tk.resting_hr != null && tk.resting_hr > 60 ? '#ffc56a' : undefined },
          { label: 'WGT',  value: tk.weight_lb != null ? `${t.convWeight(tk.weight_lb).toFixed(1)}${t.weightUnit.toUpperCase()}` : (t.isMetric ? '80.8KG' : '178.2LB'), note: tk.weight_delta_7d != null ? fmtDelta(Math.round(t.convWeight(tk.weight_delta_7d) * 10) / 10, ' 7D') : (t.isMetric ? '-0.2 7D' : '-0.4 7D') },
        ];
        const order = (tickerPrefs.order && tickerPrefs.order.length) ? tickerPrefs.order : all.map(i => i.label);
        const out = order.map(k => all.find(i => i.label === k)).filter(Boolean).filter(it => !(tickerPrefs.hidden || []).includes(it.label));
        return out.length ? out : all;
      })()} />

      {/* Edition strip — moved below the ticker (which sits under the date masthead) */}
      <div style={{
        padding: `8px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        display: 'flex', justifyContent: 'space-between', alignItems: 'baseline',
        background: t.PAPER2,
      }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.GREEN }}>
          Clients Edition · No. 14
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 600, color: t.INK50 }}>
          Vol. I
        </span>
      </div>

      {/* From your coach — pushed items (meals/workouts) from coach_pushed_items */}
      {/* (RLS-scoped to me). The coach's focus-banner note renders in the Op-ed below. */}
      {coachFeed.items.length > 0 && (
        <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700, color: t.ACCENT, marginBottom: 10 }}>
            From your coach
          </div>
          {coachFeed.items.length > 0 && (
            <div style={{ marginTop: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 }}>
                For today
              </div>
              {coachFeed.items.map(it => {
                const p = it.payload || {};
                const isMeal = it.kind === 'meal';
                const meta = isMeal
                  ? [p.time, p.kcal != null ? p.kcal + ' kcal' : null, p.protein != null ? p.protein + 'g P' : null].filter(Boolean).join(' · ')
                  : [p.sets, p.reps, p.tempo && ('Tempo ' + p.tempo)].filter(Boolean).join(' · ');
                return (
                  <div key={it.id} style={{
                    padding: '10px 12px',
                    background: t.PAPER,
                    border: `1px solid ${t.RULE}`,
                    borderRadius: t.RADIUS_SM,
                    marginBottom: 6,
                  }}>
                    <div style={{ fontSize: 13.5, fontWeight: 500, color: t.INK }}>{p.name}</div>
                    {meta && <div style={{ fontFamily: t.MONO, fontSize: 10.5, letterSpacing: '0.06em', color: t.INK50, marginTop: 2 }}>{meta}</div>}
                    {(p.cue || p.note) && <div style={{ fontSize: 12, color: t.INK50, marginTop: 4, fontStyle: 'italic' }}>"{p.cue || p.note}"</div>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* NOW PLAYING — Shape Radio (moved above This week) */}
      <BSNowPlaying onOpen={goRadio} />

      {/* THIS WEEK — calendar preview (moved above the Today/Log/Habits/Score row) */}
      <div style={{ padding: `${t.sectGap}px ${t.padX}px 8px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 9, minWidth: 0, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK, whiteSpace: 'nowrap' }}>▍ This week</span>
          <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 600, whiteSpace: 'nowrap' }}>Wk {isoWeek} · {fmtDate(0)}–{weekDates[0].getMonth() === weekDates[6].getMonth() ? weekDates[6].getDate() : fmtDate(6)}</span>
        </span>
        <button onClick={goCalendar} style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 999, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>Month view →</button>
      </div>
      <div style={{ padding: `0 ${t.padX}px 14px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, borderTop: `2px solid ${t.INK}`, paddingTop: 8 }}>
          {weekDates.map((date, idx) => {
            const on    = idx === selIdx;
            const today = idx === todayIdx;
            const dots  = WEEK_DOTS_BY_IDX[idx] || [];
            return (
              <button key={idx} onClick={() => { setSelIdx(idx); setActiveDayLogKey(null); }} style={{ borderRadius: t.RADIUS_SM,
                border: `1px solid ${on ? t.INK : t.HAIR}`,
                background: on ? t.INK : (today ? t.PAPER2 : 'transparent'),
                color: on ? t.PAPER : t.INK,
                padding: '5px 0 4px', cursor: 'pointer',
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', fontWeight: 600, opacity: today && !on ? 1 : 0.7 }}>{_BS_DOWL[idx]}</span>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 17, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{date.getDate()}</span>
                <span style={{ display: 'flex', gap: 2.5, height: 3, marginTop: 1 }}>
                  {dots.slice(0, 3).map((c, k) => <span key={k} style={{ width: 3.5, height: 3.5, borderRadius: '50%', background: c }} />)}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{
        padding: `10px ${t.padX}px 12px`,
        borderBottom: `1px solid ${t.RULE}`,
        background: t.PAPER,
      }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
          {[
            { label: 'Today', meta: `${dayLog.length} logs`, active: true, onClick: () => setActiveDayLogKey(null) },
            { label: 'Log', meta: 'Activity', accent: t.AMBER, onClick: () => setShowLogActivity(true) },
            { label: 'Habits', meta: '1/3 done', accent: t.GREEN, onClick: () => setHabitsPage(true) },
            { label: 'Score', meta: todayScore == null ? '+4 pts' : `+${todayScore} pts`, accent: t.ACCENT, onClick: () => goScore?.() },
          ].map((item) => (
            <button
              key={item.label}
              type="button"
              onClick={item.onClick}
              style={{
                minWidth: 0,
                padding: '11px 9px 10px',
                borderRadius: 15,
                border: `1.5px solid ${item.active ? t.INK : `${item.accent || t.INK}66`}`,
                background: item.active ? 'transparent' : (t.isLight ? `${item.accent || t.INK}14` : `${item.accent || t.INK}24`),
                color: t.INK,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <span style={{
                display: 'block',
                fontFamily: t.MONO,
                fontSize: 8.5,
                fontWeight: 800,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                color: item.active ? t.INK : (item.accent || t.INK),
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}>
                {item.label}
              </span>
              <span style={{
                display: 'block',
                marginTop: 5,
                fontFamily: t.DISPLAY,
                fontSize: 13.5,
                fontWeight: 800,
                letterSpacing: '-0.03em',
                color: t.INK,
                whiteSpace: 'nowrap',
                overflow: 'visible',
              }}>
                {item.meta}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* CUSTOMIZABLE CARD STACK — Training / Recovery / Energy / … */}
      <div style={{ paddingTop: 16, borderTop: `1px solid ${t.RULE}` }}>
        <BSHomeCards
          t={t}
          todayLabel={['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][_now.getDay()]}
          ctx={homeCardsCtx}
          openers={homeCardOpeners}
        />
      </div>

      <BSSection title="Up next" kicker="3 of 8 done" />

      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const rust = t.RUST;
        const cardBase = (c) => ({
          margin: `0 ${t.padX}px 12px`, padding: '15px 16px 14px', borderRadius: 18,
          border: `1px solid ${c}66`,
          background: `linear-gradient(155deg, ${c}24, ${c}08 44%, ${t.PAPER2} 90%), ${t.PAPER2}`,
        });
        const pillFilled = { flexShrink: 0, padding: '9px 16px', borderRadius: 999, border: `1px solid ${teal}`, background: teal, color: t.isLight ? '#ffffff' : '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
        const pillOutline = { flexShrink: 0, padding: '9px 16px', borderRadius: 999, border: `1px solid ${teal}`, background: 'transparent', color: teal, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' };
        const eyebrow = (c) => ({ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: c });
        const metaRight = { fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 };
        const Person = ({ init, name, role, fill }) => (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
            <BSAvatar init={init} size={30} fill={fill} ink={t.PAPER} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{name}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>{role}</div>
            </div>
          </div>
        );
        // Coach-scheduled times for each item (24h minutes) — drive both the
        // displayed time and the order (earliest first). The workout is today's
        // actual session (shared week); the meal follows the client's lunch-time
        // preference so it stays in sync with the day-log.
        const _wkAt = (todayWorkout && todayWorkout.time && todayWorkout.time !== '—') ? todayWorkout.time : '09:00';
        const [_wkH, _wkM] = String(_wkAt).split(':').map(Number);
        const WORKOUT_AT = (Number.isNaN(_wkH) ? 9 : _wkH) * 60 + (Number.isNaN(_wkM) ? 0 : _wkM);
        const _wkMoves = (todayWorkout && todayWorkout.detail && todayWorkout.detail.moves) || [];
        const _wkShortMeta = (todayWorkout && todayWorkout.detail && todayWorkout.detail.meta)
          ? todayWorkout.detail.meta.split(' · ').slice(0, 3).join(' · ')
          : (todayWorkout && todayWorkout.sub) || '';
        const _wkCompact = _wkMoves.slice(0, 3).map((m, i) => [String(i + 1).padStart(2, '0'), m.name, String(m.scheme || '').replace(' rest', ''), m.load || '']);
        if (_wkMoves.length > 3) _wkCompact.push(['+', `+ ${_wkMoves.length - 3} more`, _wkMoves.slice(3).map(m => m.name).slice(0, 3).join(' · '), '']);
        const _lunchPref = (typeof window !== 'undefined' && window.ShapeMealTimes && window.ShapeMealTimes.get().LUNCH) || '12:40';
        const [_lh, _lm] = String(_lunchPref).split(':').map(Number);
        const MEAL_AT = (Number.isNaN(_lh) ? 12 : _lh) * 60 + (Number.isNaN(_lm) ? 40 : _lm);
        const fmtAt = (mins) => {
          const h = Math.floor(mins / 60), m = mins % 60;
          const ap = h >= 12 ? 'PM' : 'AM';
          const h12 = h % 12 === 0 ? 12 : h % 12;
          return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
        };
        const workoutCard = todayWorkout ? (
          <div style={cardBase(rust)}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={eyebrow(rust)}>Workout · {fmtAt(WORKOUT_AT)}</span>
              <span style={metaRight}>{_wkShortMeta}</span>
            </div>
            <div onClick={() => setShowWorkoutPreview(true)} style={{ cursor: 'pointer', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 25, lineHeight: 1.0, letterSpacing: '-0.03em', color: t.INK, marginTop: 7 }}>
              {todayWorkout.title}
            </div>
            {_wkCompact.length > 0 && (
              <div style={{ marginTop: 12 }}>
                {_wkCompact.map(([n, name, sub, wt], i, arr) => (
                  <div key={`${n}-${i}`} onClick={() => setShowWorkoutPreview(true)} style={{ display: 'grid', gridTemplateColumns: '22px 1fr auto', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`, cursor: 'pointer' }}>
                    <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, color: t.INK50 }}>{n}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{name}</div>
                      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>{sub}</div>
                    </div>
                    {wt ? <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK70, fontVariantNumeric: 'tabular-nums' }}>{wt}</span> : <span />}
                  </div>
                ))}
              </div>
            )}
            <div style={{ marginTop: 10, paddingTop: 12, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Person init="J" name="Jordan Chen" role="Coach" fill={rust} />
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <button onClick={() => setShowWorkoutPreview(true)} style={pillOutline}>Preview →</button>
                <button onClick={() => goTrain?.()} style={pillFilled}>Start →</button>
              </div>
            </div>
          </div>
        ) : (
          <div style={cardBase(t.GREEN)}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={eyebrow(t.GREEN)}>Recovery · today</span>
              <span style={metaRight}>Rest day</span>
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 25, lineHeight: 1.0, letterSpacing: '-0.03em', color: t.INK, marginTop: 7 }}>
              Active <span style={{ fontStyle: 'italic', color: t.GREEN }}>recovery.</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.45 }}>
              No session today — an easy walk and 10 minutes of mobility keeps the streak alive.
            </div>
            <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Person init="J" name="Jordan Chen" role="Coach" fill={rust} />
              <button onClick={() => goChat('Jordan Chen', 'Coach · Hypertrophy')} style={pillOutline}>Message →</button>
            </div>
          </div>
        );
        const mealCard = (
          <div style={cardBase(teal)}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={eyebrow(teal)}>Lunch · {fmtAt(MEAL_AT)}</span>
              <span style={{ ...metaRight, letterSpacing: '0.16em' }}>Coach plan</span>
            </div>
            <div onClick={() => setPreviewMeal(HOME_LUNCH)} style={{ cursor: 'pointer', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 26, lineHeight: 1.0, letterSpacing: '-0.03em', color: t.INK, marginTop: 7 }}>
              Chicken bowl <span style={{ fontStyle: 'italic', color: teal }}>+ rice.</span>
            </div>
            <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
              620 kcal · 48P · 72C · 14F
            </div>
            <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <Person init="M" name="Dr. Maya Patel" role="Nutritionist" fill={t.AMBER} />
              {nextMealLogged
                ? <button onClick={() => setNextMealLogged(false)} style={pillOutline}>✓ Logged</button>
                : <button onClick={() => setShowLogMeal(true)} style={pillFilled}>Log now →</button>}
            </div>
          </div>
        );
        const agenda = [
          { at: WORKOUT_AT, node: workoutCard },
          { at: MEAL_AT, node: mealCard },
        ].sort((a, b) => a.at - b.at);
        return <>{agenda.map((x, i) => <React.Fragment key={i}>{x.node}</React.Fragment>)}</>;
      })()}

      {/* DAY LOG */}
      <BSSection title="Day log" kicker={selIdx === todayIdx ? `Today · ${fmtDate(selIdx)}` : fmtDate(selIdx)} meta={`${dayLog.length} item${dayLog.length === 1 ? '' : 's'}`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }} />
        {dayLog.length === 0 ? (
          <div style={{ padding: '24px 0', textAlign: 'center', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>
            — Rest day · nothing logged —
          </div>
        ) : (
          dayLog.map((row, i) => {
            const key = dayLogKey(row, i);
            const logged = row.state === 'done' || !!quickLoggedItems[key];
            const next = row.state === 'next' && !logged;
            return (
              <div key={key} style={{ borderBottom: row.last ? 0 : `1px solid ${t.HAIR}` }}>
                <button
                  onClick={() => {
                    // Meals open the full meal preview page; other items (workouts,
                    // check-ins, consults) use the quick confirm sheet.
                    if (row.tag === 'MEAL') {
                      const kc = /(\d[\d,]*)\s*kcal/i.exec(row.sub || '');
                      const pr = /(\d+)\s*P\b/i.exec(row.sub || '');
                      const kcal = kc ? parseInt(kc[1].replace(/,/g, ''), 10) : 0;
                      const p = pr ? parseInt(pr[1], 10) : 0;
                      // Estimate carbs/fat from the remaining calories so the macro
                      // split reads real instead of "P 100%".
                      const remK = Math.max(0, kcal - p * 4);
                      const c = Math.round((remK * 0.55) / 4);
                      const f = Math.round((remK * 0.45) / 9);
                      // Derive a believable ingredient list from the meal title.
                      const parts = String(row.title || '').split(/\s*(?:,|\+|&|\/| with | and )\s*/i).map(s => s.trim()).filter(Boolean);
                      const per = parts.length ? Math.round(kcal / parts.length) : kcal;
                      const ingredients = parts.map((m, i) => ({
                        n: 'portion',
                        m: m.charAt(0).toUpperCase() + m.slice(1),
                        k: `${i === parts.length - 1 ? Math.max(0, kcal - per * (parts.length - 1)) : per} kcal`,
                      }));
                      setPreviewMeal({
                        id: `daylog:${dataDay}:${row.time}`,
                        title: row.title, time: row.time, tag: row.tag, tagColor: row.tagColor,
                        kcal, p, c, f, sub: row.sub,
                        prep: '10 min', portion: '1 plate', score: 'A',
                        hero: `${row.title}.`,
                        brief: 'Logged from today’s plan. Confirm to update your calories, protein, carbs, and fat for the day.',
                        ingredients,
                      });
                    } else {
                      setActiveDayLogKey(key);
                    }
                  }}
                  style={{
                    width: '100%',
                    display: 'grid',
                    gridTemplateColumns: '28px 40px 1fr auto',
                    alignItems: 'center',
                    gap: 10,
                    padding: `${t.rowY}px 0`,
                    border: 0,
                    borderRadius: next ? t.RADIUS_SM : 0,
                    background: next ? `${t.ACCENT}10` : 'transparent',
                    color: t.INK,
                    textAlign: 'left',
                    cursor: 'pointer',
                    opacity: logged && row.state === 'done' ? 0.45 : 1,
                    marginLeft: next ? -8 : 0,
                    marginRight: next ? -8 : 0,
                    paddingLeft: next ? 8 : 0,
                    paddingRight: next ? 8 : 0,
                  }}
                >
                  <span style={{
                    fontFamily: t.MONO,
                    fontSize: 12,
                    color: next ? t.ACCENT : t.INK,
                    letterSpacing: '-0.01em',
                    fontWeight: next ? 700 : 500,
                    fontVariantNumeric: 'tabular-nums',
                  }}>{i + 1}</span>
                  {row.tag ? (
                    <span style={{
                      fontFamily: t.MONO,
                      fontSize: 9,
                      letterSpacing: '0.16em',
                      color: t.PAPER,
                      background: row.tagColor || t.INK,
                      padding: '2px 4px',
                      textTransform: 'uppercase',
                      fontWeight: 700,
                      textAlign: 'center',
                      justifySelf: 'start',
                      borderRadius: t.RADIUS_SM,
                    }}>{row.tag}</span>
                  ) : <span />}
                  <div style={{ minWidth: 0 }}>
                    <div style={{
                      fontFamily: t.DISPLAY,
                      fontSize: 14,
                      fontWeight: next ? 700 : 500,
                      color: t.INK,
                      letterSpacing: '-0.01em',
                      lineHeight: 1.15,
                      textDecoration: logged && row.state === 'done' ? 'line-through' : 'none',
                      textDecorationThickness: '1.5px',
                    }}>{row.title}</div>
                    {row.sub && (
                      <div style={{
                        fontFamily: t.MONO,
                        fontSize: 9.5,
                        color: t.INK50,
                        marginTop: 2,
                        letterSpacing: '0.06em',
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}>{row.sub}</div>
                    )}
                  </div>
                  <span style={{
                    fontFamily: t.MONO,
                    fontSize: 10,
                    fontWeight: 700,
                    color: next ? t.ACCENT : t.INK50,
                    letterSpacing: '0.06em',
                    whiteSpace: 'nowrap',
                    fontVariantNumeric: 'tabular-nums',
                  }}>
                    {(() => {
                      const [h, m] = String(row.time || '').split(':').map(Number);
                      if (Number.isNaN(h)) return '';
                      const ap = h >= 12 ? 'PM' : 'AM';
                      const h12 = h % 12 === 0 ? 12 : h % 12;
                      return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
                    })()}
                  </span>
                </button>
              </div>
            );
          })
        )}
      </div>

      {/* WEEK TOTALS — running tally; tap a card for history / a chart */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const weekTotals = [
          { l: 'Sessions', v: 4, max: 5, c: t.RUST, unit: 'sessions',
            history: [['Mon', 'Upper Push — Peak', 'Done'], ['Tue', 'Lower Pull — Vol.', 'Done'], ['Thu', 'Upper Pull — Peak', 'Done'], ['Sat', 'Z2 run · 45m', 'Done'], ['Sun', 'Lower Push — Peak', 'Scheduled']] },
          { l: 'Check-ins', v: 6, max: 7, c: teal, unit: 'check-ins',
            history: [['Mon', 'Sleep 7h · 8/10', '✓'], ['Tue', 'Energy 7/10', '✓'], ['Wed', 'RPE recap', '✓'], ['Thu', 'Sleep 7h12 · 8/10', '✓'], ['Fri', 'Soreness 3/10', '✓'], ['Sat', 'Weekly photos', '✓']] },
          { l: 'Consults', v: 1, max: 2, c: t.AMBER, unit: 'consults',
            history: [['Tue', 'Dr. Maya · nutrition', '30m'], ['Fri', 'Coach 1:1 · Jordan', 'Scheduled']] },
          { l: 'Avg kcal', v: 1890, max: 2100, c: t.BLUE, unit: 'avg kcal', chart: true,
            series: [['M', 1820], ['T', 2010], ['W', 1760], ['T', 1980], ['F', 1890], ['S', 2140], ['S', 1830]] },
        ];
        return (
          <>
            <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px` }}>
              <BSEyebrow color={teal}>Week totals</BSEyebrow>
              <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>So far</div>
            </div>
            <div style={{ padding: `10px ${t.padX}px 4px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
              {weekTotals.map(s => {
                const pct = Math.max(0, Math.min(1, s.v / s.max));
                return (
                  <button key={s.l} onClick={() => setWeekStat(s)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '11px 11px 9px' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8 }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.c, fontWeight: 700 }}>{s.l}</span>
                      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', color: t.INK50, fontWeight: 600 }}>/ {s.max.toLocaleString()}</span>
                    </div>
                    <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1 }}>{s.v.toLocaleString()}</div>
                    <div style={{ marginTop: 8, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
                      <div style={{ width: `${pct * 100}%`, height: '100%', background: s.c, borderRadius: 999 }} />
                    </div>
                    <div style={{ marginTop: 7, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>View {s.chart ? 'chart' : 'history'} →</div>
                  </button>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Week-stat detail sheet */}
      {weekStat && createPortal(
        <div onClick={() => setWeekStat(null)} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={e => e.stopPropagation()} className="bs-scroll" style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, maxHeight: '82%', overflowY: 'auto', borderTop: `1px solid ${t.RULE}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: weekStat.c, fontWeight: 700 }}>{weekStat.l} · this week</div>
                <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1 }}>{weekStat.v.toLocaleString()}<span style={{ fontFamily: t.DISPLAY, fontSize: 16, color: t.INK50, marginLeft: 6 }}>/ {weekStat.max.toLocaleString()}</span></div>
              </div>
            </div>

            {weekStat.chart ? (
              <div style={{ marginTop: 18 }}>
                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 6, height: 130 }}>
                  {weekStat.series.map(([d, val], i) => {
                    const peak = Math.max(...weekStat.series.map(x => x[1]), weekStat.max);
                    const h = Math.max(4, Math.round((val / peak) * 110));
                    return (
                      <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                        <span style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK50, fontVariantNumeric: 'tabular-nums' }}>{val.toLocaleString()}</span>
                        <div style={{ width: '100%', maxWidth: 26, height: h, borderRadius: 6, background: weekStat.c }} />
                        <span style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.04em' }}>{d}</span>
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>7-day average · target {weekStat.max.toLocaleString()} kcal</div>
              </div>
            ) : (
              <div style={{ marginTop: 14 }}>
                {(weekStat.history || []).map(([day, label, tag], i, arr) => (
                  <div key={i} style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                    <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>{day}</span>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{label}</span>
                    <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: tag === 'Scheduled' ? t.INK50 : weekStat.c, fontWeight: 700 }}>{tag}</span>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setWeekStat(null)} style={{ width: '100%', marginTop: 18, padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Close</button>
          </div>
        </div>,
        (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
      )}

      {/* ── HABIT TRACKER (summary on home; full page via tap) ───── */}
      {activeDayLog && activeDayLogDetails && createPortal(
        <div
          onClick={() => setActiveDayLogKey(null)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 90,
            background: 'rgba(0,0,0,0.42)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '18px 14px 96px',
            boxSizing: 'border-box',
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 460,
              border: `1px solid ${t.RULE}`,
              borderRadius: 18,
              background: t.PAPER,
              color: t.INK,
              boxShadow: '0 18px 60px rgba(0,0,0,0.35)',
              overflow: 'auto',
              maxHeight: '80%',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <div style={{
              padding: '14px 16px',
              borderBottom: `1px solid ${t.RULE}`,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 14,
              background: t.PAPER2,
            }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                  <BSTag color={activeDayLog.tagColor || t.INK}>{activeDayLog.tag || 'ITEM'}</BSTag>
                  <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', color: t.INK50, fontWeight: 800 }}>
                    {activeDayLog.time}
                  </span>
                </div>
                <div style={{
                  fontFamily: t.DISPLAY,
                  fontSize: 25,
                  fontWeight: t.W.display,
                  lineHeight: 0.96,
                  letterSpacing: '-0.045em',
                }}>
                  {activeDayLog.title}
                </div>
              </div>
              <button
                onClick={() => setActiveDayLogKey(null)}
                aria-label="Close preview"
                style={{
                  width: 30,
                  height: 30,
                  borderRadius: 999,
                  border: `1px solid ${t.RULE}`,
                  background: 'transparent',
                  color: t.INK,
                  fontFamily: t.MONO,
                  fontSize: 14,
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                ✕
              </button>
            </div>

            <div style={{ padding: 16 }}>
              <BSEyebrow color={activeDayLog.tagColor || t.ACCENT}>{activeDayLogDetails.label}</BSEyebrow>
              <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.42, color: t.INK70 }}>
                {activeDayLogDetails.description}
              </div>
              <div style={{ marginTop: 14, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '12px 6px', display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
                {activeDayLogDetails.metrics.map(([label, value], i) => (
                  <div key={label} style={{ padding: '0 8px', borderLeft: i > 0 ? `1px solid ${t.HAIR}` : 0 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase', fontWeight: 800 }}>
                      {label}
                    </div>
                    <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.15, color: t.INK }}>
                      {value}
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop: 14, padding: '12px 13px', border: `1px solid ${t.RULE}`, borderRadius: 14, background: t.PAPER2, fontFamily: t.DISPLAY, fontSize: 13, lineHeight: 1.35, color: t.INK70 }}>
                {activeDayLogDetails.note}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1.35fr', gap: 8, marginTop: 14 }}>
                <button
                  onClick={() => setActiveDayLogKey(null)}
                  style={{ padding: '13px 10px', border: `1px solid ${t.INK}`, borderRadius: 12, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  Close
                </button>
                <button
                  onClick={() => {
                    logDayItem(activeDayLogEntry.key, activeDayLog);
                    setActiveDayLogKey(null);
                  }}
                  style={{ padding: '13px 10px', border: `1px solid ${activeDayLogLogged ? t.GREEN : t.INK}`, borderRadius: 12, background: activeDayLogLogged ? t.GREEN : t.INK, color: t.PAPER, fontFamily: t.MONO, fontSize: 10, fontWeight: 900, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}
                >
                  {activeDayLogLogged ? 'Logged' : 'Log now'}
                </button>
              </div>
            </div>
          </div>
        </div>,
        (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
      )}

      {/* THIS WEEK — (moved to top) */}

      {/* ── HOME WIDGETS — user-added stats & blocks ─────────────── */}
      {(() => {
        const added = _bsHomeWidgets(tweaks);
        const setList = (next) => setTweak('homeWidgets', _bsEncodeWidgets(next));
        const remove = (k) => setList(added.filter(w => w.key !== k));
        const add    = (k) => { if (!added.find(w => w.key === k)) setList([...added, { key: k, span: 2 }]); };
        const setSpan = (k, span) => setList(added.map(w => w.key === k ? { ...w, span } : w));
        const addedKeys = added.map(w => w.key);
        return (
          <>
            {added.length > 0 && (
              <>
                <BSSection title="Your widgets" meta={`${added.length} active`} />
                <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px`, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 10 }}>
                  {added.map(w => (
                    <div key={w.key} style={{ minWidth: 0, gridColumn: w.span === 1 ? 'span 2' : 'span 1' }}>
                      <BSWidgetSlot widgetKey={w.key} onRemove={remove} />
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        );
      })()}

      {/* THIS WEEK'S NOTE — coach's weekly note (trainer or nutritionist),
          editable from their console and sent to specific clients
          (coach_focus_banners, RLS-scoped). Falls back to an editorial line. */}
      {(() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const banners = coachFeed.banners || [];
        const dayOf = (b) => {
          if (!b || !b.sent_at) return 'Mon';
          const d = new Date(b.sent_at);
          return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] || 'Mon';
        };
        // Most-recent note from each role (banners arrive newest-first).
        const trainerBanner = banners.find(b => b.provider_role !== 'nutritionist');
        const nutriBanner = banners.find(b => b.provider_role === 'nutritionist');
        const notes = [];
        if (trainerBanner) notes.push({ role: 'trainer', text: trainerBanner.text, who: trainerBanner.provider_name || 'Jordan Chen', when: dayOf(trainerBanner) });
        if (nutriBanner) notes.push({ role: 'nutritionist', text: nutriBanner.text, who: nutriBanner.provider_name || 'Dr. Maya Patel', when: dayOf(nutriBanner) });
        // No real notes yet → show a sample from each coach (the demo client has both).
        if (!notes.length) {
          notes.push({ role: 'trainer', text: "You're 3 weeks in. The tempo is the point — slow eccentric on every press. Log your sleep, it's the lever.", who: 'Jordan Chen', when: 'Mon' });
          notes.push({ role: 'nutritionist', text: "Three weeks of steady protein — it's working. Keep breakfast above 35g and we'll carry the momentum into the next block.", who: 'Dr. Maya Patel', when: 'Mon' });
        }
        return (
          <>
            <div style={{ padding: `${t.sectGap}px ${t.padX}px 4px` }}>
              <BSEyebrow color={teal}>From your team</BSEyebrow>
              <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>{notes.length > 1 ? 'This week’s notes' : 'This week’s note'}</div>
            </div>
            <div style={{ padding: `12px ${t.padX}px 4px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
              {notes.map((n, i) => {
                const isNutri = n.role === 'nutritionist';
                return (
                  <div key={i} style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, fontWeight: 500, color: t.INK70, lineHeight: 1.5, letterSpacing: '-0.01em' }}>
                      &ldquo;{n.text}&rdquo;
                    </div>
                    <div style={{ marginTop: 14, paddingTop: 12, borderTop: `1px solid ${t.HAIR}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                        <BSAvatar init={(n.who || 'C').charAt(0)} size={28} fill={isNutri ? t.AMBER : t.RUST} ink={t.PAPER} />
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{n.who}</div>
                          <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>{isNutri ? 'Nutritionist' : 'Trainer'}</div>
                        </div>
                      </div>
                      <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{n.when}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      <BSFooter right="Pg 1 of 1" />
      {showLogActivity && <BSLogActivity onClose={() => setShowLogActivity(false)} onSaved={() => { refreshAnalytics(); setTimeout(refreshAnalytics, 700); }} />}
      {showMood && <BSMoodSheet onClose={() => setShowMood(false)} onSaved={() => { refreshAnalytics(); setTimeout(refreshAnalytics, 700); }} />}
    </BSPage>
  );
}

// ─── helper: tweaks-backed widget list ─────────────────────
// Encoded as comma-separated "key:span" pairs; legacy "key" decodes as span 2.
function _bsHomeWidgets(tweaks) {
  const v = tweaks.homeWidgets;
  const arr = typeof v === 'string'
    ? v.split(',').filter(Boolean)
    : Array.isArray(v) ? v : [];
  return arr.map(item => {
    if (typeof item !== 'string') return null;
    const [key, span] = item.split(':');
    if (!key) return null;
    return { key, span: span === '1' ? 1 : 2 };
  }).filter(Boolean);
}
function _bsEncodeWidgets(list) {
  return list.map(w => `${w.key}:${w.span}`).join(',');
}

// Index of today within a Mon–Sun week (0 = Mon … 6 = Sun).
function bsWeekdayIdx(d = new Date()) { return (d.getDay() + 6) % 7; }

// Build the 7-day Train PROGRAM from live assigned workouts. Workouts with a
// scheduled_date land on that weekday; any unscheduled ones are laid onto the
// open weekdays in order so a client with a plan but no dates still sees real
// data. Days with no workout render as rest. Presentation (titles, accents,
// tags) is derived here — the API returns only raw plan data.
function bsBuildTrainProgram(workouts, t) {
  const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const ACCENTS = [t.RUST, t.AMBER, t.BLUE];
  const monday = new Date(); monday.setHours(0, 0, 0, 0);
  monday.setDate(monday.getDate() - bsWeekdayIdx(monday));
  const dateFor = (i) => { const d = new Date(monday); d.setDate(d.getDate() + i); return d; };

  // Slot workouts onto the week.
  const slots = [null, null, null, null, null, null, null];
  const unscheduled = [];
  for (const w of (workouts || [])) {
    if (w.scheduledDate) {
      const dt = new Date(w.scheduledDate + 'T00:00:00');
      const idx = Math.round((dt - monday) / 86400000);
      if (idx >= 0 && idx <= 6 && !slots[idx]) { slots[idx] = w; continue; }
    }
    unscheduled.push(w);
  }
  for (let i = 0; i < 7 && unscheduled.length; i++) {
    if (!slots[i]) slots[i] = unscheduled.shift();
  }

  return slots.map((w, i) => {
    const d = dateFor(i);
    const label = `${DOW[i]} ${d.getDate()}`;
    if (!w) {
      return {
        d: label, kicker: 'The Recovery', title: 'Rest\nday.', tag: 'REST',
        tagColor: t.GREEN, accent: t.GREEN, headline: 'Full rest.',
        meta: 'No session · 0 min', copy: 'No workout scheduled today. Recover, eat well, sleep.',
        moves: [], total: '0 sessions', coachLine: 'Recovery is training. Take the day.',
      };
    }
    const moves = (w.exercises || []).map((e, j) => {
      const sr = [e.sets, e.reps].filter(Boolean).join(' × ');
      const s = [sr, e.rest].filter(Boolean).join(' · ');
      return { n: String(j + 1).padStart(2, '0'), m: e.name, s: s || '—', l: e.load || '—' };
    });
    const isCustom = w.kind === 'custom';
    return {
      d: label,
      kicker: 'The Training',
      title: w.title || 'Workout',
      tag: isCustom ? 'CUSTOM' : 'FEATURE',
      tagColor: isCustom ? t.BLUE : t.AMBER,
      accent: ACCENTS[i % ACCENTS.length],
      headline: w.title || 'Workout',
      meta: [w.durationMin ? `${w.durationMin} min` : null, `${moves.length} move${moves.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '),
      copy: w.description || 'Programmed by your coach.',
      moves,
      total: `${moves.length} move${moves.length === 1 ? '' : 's'}`,
      coachLine: w.description || 'Move with intent. Quality over load.',
    };
  });
}

// ═══════════════════════════════════════════════════════════
// ── Shared "tracklist" UI for the Train + Eat day views ────────────────────
// Rounded weekly calendar: day letter, date number, status dot; active tile
// gets a teal outline + faint wash.
function BSWeekStrip({ activeIdx, onSelect, restFlags = [] }) {
  const t = useBS();
  const DOWL = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
  const _now = new Date();
  const todayIdx = (_now.getDay() + 6) % 7;
  const mon = new Date(_now); mon.setHours(0, 0, 0, 0); mon.setDate(_now.getDate() - todayIdx);
  const dates = Array.from({ length: 7 }, (_, i) => { const d = new Date(mon); d.setDate(mon.getDate() + i); return d.getDate(); });
  return (
    <div style={{ padding: `10px ${t.padX}px 4px`, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 5 }}>
      {DOWL.map((L, i) => {
        const on = i === activeIdx;
        return (
          <button key={i} onClick={() => onSelect(i)} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 0 4px', borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? t.ACCENT : t.HAIR}`, background: on ? 'rgba(10,197,168,0.08)' : 'transparent' }}>
            <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', color: on ? t.ACCENT : t.INK50 }}>{L}</span>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 15, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{dates[i]}</span>
            <span style={{ width: 3.5, height: 3.5, borderRadius: 2, background: restFlags[i] ? t.GREEN : (on ? t.ACCENT : 'transparent') }} />
          </button>
        );
      })}
    </div>
  );
}

// Section header: teal kicker, big serif title, optional right-aligned action.
function BSTrackHeader({ kicker, title, actionLabel, onAction }) {
  const t = useBS();
  return (
    <div style={{ padding: `18px ${t.padX}px 0` }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 5 }}>{kicker}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 21, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{title}</div>
        {actionLabel && <button onClick={onAction} style={{ background: 'transparent', border: 0, color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>{actionLabel} →</button>}
      </div>
    </div>
  );
}

// Coach/nutritionist playlist card. When the playlist has a Spotify URL, the
// client can save it straight into their own Spotify library (follow).
// Spotify wordmark glyph, reused at a few sizes/fills.
const bsSpotifyGlyph = (size = 22, fill = '#fff') => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} aria-hidden="true"><path fillRule="evenodd" clipRule="evenodd" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.42 1.56-.299.421-1.02.599-1.559.3z"/></svg>
);

function BSPlaylistCard({ kicker, title, meta, color, spotifyUrl, tracks }) {
  const t = useBS();
  const [open, setOpen] = useStateBSC(false);
  const [saveState, setSaveState] = useStateBSC('idle'); // idle | saving | saved | error
  const [saveMsg, setSaveMsg] = useStateBSC('');
  const list = Array.isArray(tracks) ? tracks : [];
  const isSpotifyUrl = typeof spotifyUrl === 'string' && /(^|\.)spotify\.com\//i.test(spotifyUrl);
  // Only genuine Spotify playlist links can be followed into a user's library.
  const canSaveToSpotify = isSpotifyUrl && /playlist[/:]/i.test(spotifyUrl);
  const openSpotify = () => {
    const url = isSpotifyUrl ? spotifyUrl : `https://open.spotify.com/search/${encodeURIComponent(String(title || 'playlist'))}`;
    try { window.open(url, '_blank', 'noopener,noreferrer'); } catch (e) { try { window.location.href = url; } catch (e2) {} }
  };
  // Follow (save) the coach's playlist into the signed-in member's own Spotify
  // library via /api/integrations/spotify/save-playlist. Native goes through the
  // bridge (Bearer token); the /m/ web build falls back to a same-origin cookie
  // call. A missing/expired Spotify connection surfaces as a "connect" message.
  const saveToSpotify = async () => {
    if (saveState === 'saving' || saveState === 'saved') return;
    setSaveState('saving'); setSaveMsg('');
    try {
      let done = false;
      const fn = window.ShapeIntegrations && window.ShapeIntegrations.saveSpotifyPlaylist;
      if (typeof fn === 'function') {
        try { await fn(spotifyUrl); done = true; }
        catch (e) { if (!/not configured|VITE_API_BASE_URL/i.test(e && e.message || '')) throw e; }
      }
      if (!done) {
        const res = await fetch('/api/integrations/spotify/save-playlist', {
          method: 'POST', credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ url: spotifyUrl }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || 'Could not save to Spotify.');
      }
      setSaveState('saved');
      try { window.__bsToast && window.__bsToast('Saved to your Spotify', 'ok'); } catch (e) {}
    } catch (e) {
      const msg = (e && e.message) || 'Could not save to Spotify.';
      setSaveState('error'); setSaveMsg(msg);
      // For "not linked / not signed in" errors the popup already shows an
      // inline "Connect Spotify to save" CTA — skip the toast so it isn't
      // doubled up. Only surface a toast for other (e.g. network) failures.
      const needsConnect = /sign ?in|connect spotify|authentic|log ?in|unauthor|reconnect|before saving|not connected/i.test(msg);
      if (!needsConnect) { try { window.__bsToast && window.__bsToast(msg, 'error'); } catch (e2) {} }
    }
  };
  // Total track count parsed from the meta line ("… · 14 tracks") so the popup
  // can say "first 6 of 14" when we only carry a preview.
  const totalTracks = (() => { const m = /(\d+)\s*tracks/i.exec(String(meta || '')); return m ? Number(m[1]) : null; })();

  const sheet = open ? createPortal(
    <div onClick={() => setOpen(false)} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="bs-scroll" style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, maxHeight: '82%', overflowY: 'auto', borderTop: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <div style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 11, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bsSpotifyGlyph(24, '#fff')}</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color, fontWeight: 700, marginBottom: 2 }}>{kicker}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 19, color: t.INK, letterSpacing: '-0.02em' }}>{title}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.04em' }}>{meta}</div>
          </div>
        </div>
        <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
          {totalTracks && totalTracks > list.length ? `Preview · first ${list.length} of ${totalTracks}` : 'Tracklist'}
        </div>
        <div style={{ marginTop: 6 }}>
          {list.length === 0 ? (
            <div style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, padding: '10px 2px', letterSpacing: '0.03em' }}>Open in Spotify to see the full tracklist.</div>
          ) : list.map((tr, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 2px', borderBottom: i < list.length - 1 ? `1px solid ${t.HAIR}` : 'none' }}>
              <div style={{ width: 16, textAlign: 'right', flexShrink: 0, fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>{i + 1}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tr.a}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 1, letterSpacing: '0.03em' }}>{tr.b}</div>
              </div>
              {tr.len && <div style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.03em' }}>{tr.len}</div>}
            </div>
          ))}
        </div>
        {canSaveToSpotify && (
          <button onClick={saveToSpotify} disabled={saveState === 'saving'} style={{ width: '100%', marginTop: 16, padding: '13px', borderRadius: 999, border: `1px solid ${color}`, background: saveState === 'saved' ? color : 'transparent', color: saveState === 'saved' ? '#04201d' : color, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: saveState === 'saving' ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            {saveState === 'saved' ? '✓ Saved to Spotify' : saveState === 'saving' ? 'Saving…' : saveState === 'error' ? 'Try again' : '♡ Save to my Spotify'}
          </button>
        )}
        {canSaveToSpotify && saveState === 'error' && (
          // Most failures here mean the member hasn't linked Spotify (or isn't
          // signed in) — point them to where they connect it instead of showing
          // the raw error. Other errors (e.g. network) still show their message.
          /sign ?in|connect spotify|authentic|log ?in|unauthor|reconnect|before saving|not connected/i.test(saveMsg) ? (
            <button
              onClick={() => { setOpen(false); try { window.dispatchEvent(new CustomEvent('shape:openIntegrations')); } catch (e) {} }}
              style={{ width: '100%', marginTop: 8, padding: '11px 12px', borderRadius: t.RADIUS_SM, border: `1px dashed ${color}`, background: 'transparent', cursor: 'pointer', display: 'block', textAlign: 'center' }}
            >
              <div style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', color }}>Connect Spotify to save →</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50 }}>Settings · Connected apps</div>
            </button>
          ) : (
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, color: t.RUST, letterSpacing: '0.02em', lineHeight: 1.4, textAlign: 'center' }}>{saveMsg}</div>
          )
        )}
        <button onClick={openSpotify} style={{ width: '100%', marginTop: canSaveToSpotify ? 8 : 16, padding: '13px', borderRadius: 999, border: 0, background: color, color: '#04201d', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          {bsSpotifyGlyph(15, '#04201d')} Open in Spotify
        </button>
        <button onClick={() => setOpen(false)} style={{ width: '100%', marginTop: 8, padding: '12px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Close</button>
      </div>
    </div>,
    (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
  ) : null;

  return (
    <>
      <div role="button" tabIndex={0} aria-label={`Preview ${title}`}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 12px', borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, cursor: 'pointer', width: '100%', textAlign: 'left' }}>
        <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 10, background: color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{bsSpotifyGlyph(22, '#fff')}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color, fontWeight: 700, marginBottom: 2 }}>{kicker}</div>
          <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 15, color: t.INK, letterSpacing: '-0.01em' }}>{title}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.04em', lineHeight: 1.35 }}>{meta}</div>
        </div>
        <button onClick={(e) => { e.stopPropagation(); openSpotify(); }} aria-label="Open in Spotify" style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 999, border: `1px solid ${color}`, background: 'transparent', color, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11 }}>▶</button>
      </div>
      {sheet}
    </>
  );
}

// Coach-approved exercise substitutions, keyed by lowercased move name.
// Each alternate keeps the same training intent (pattern / muscle) so a swap
// is a like-for-like replacement, not a free-for-all.
const BS_MOVE_SWAPS = {
  'pull-up': [{ m: 'Lat pulldown', s: '4 × 8-10 · 3:00' }, { m: 'Assisted pull-up', s: '4 × 8 · 3:00' }, { m: 'Neutral-grip pulldown', s: '4 × 10 · 2:30' }],
  'barbell row': [{ m: 'Dumbbell row', s: '4 × 8 ea · 2:00' }, { m: 'Chest-sup. row', s: '4 × 10 · 2:00' }, { m: 'Cable row', s: '4 × 12 · 1:30' }],
  'chest-sup. row': [{ m: 'Cable row', s: '3 × 12 · 1:30' }, { m: 'Dumbbell row', s: '3 × 10 ea · 1:30' }, { m: 'Inverted row', s: '3 × 12 · 1:30' }],
  'face pull': [{ m: 'Rear-delt fly', s: '3 × 15 · 1:00' }, { m: 'Band pull-apart', s: '3 × 20 · 0:45' }],
  'incline curl': [{ m: 'Dumbbell curl', s: '3 × 12 · 1:00' }, { m: 'Cable curl', s: '3 × 12 · 1:00' }, { m: 'Hammer curl', s: '3 × 12 · 1:00' }],
  'farmer carry': [{ m: 'Suitcase carry', s: '3 × 40 m · 1:00' }, { m: 'Trap-bar hold', s: '3 × 30 s · 1:00' }],
  'back squat': [{ m: 'Front squat', s: '5 × 5 · 3:00' }, { m: 'Hack squat', s: '4 × 8 · 2:30' }, { m: 'Goblet squat', s: '4 × 10 · 2:00' }],
  'rdl': [{ m: 'Dumbbell RDL', s: '4 × 8 · 2:00' }, { m: 'Good morning', s: '4 × 8 · 2:00' }, { m: 'Back extension', s: '3 × 12 · 1:30' }],
  'lunge': [{ m: 'Split squat', s: '3 × 12 ea · 1:30' }, { m: 'Step-up', s: '3 × 12 ea · 1:30' }],
  'leg curl': [{ m: 'Nordic curl', s: '3 × 8 · 1:30' }, { m: 'Glute-ham raise', s: '3 × 10 · 1:30' }],
  'bench press': [{ m: 'Dumbbell press', s: '4 × 8 · 2:30' }, { m: 'Machine press', s: '4 × 10 · 2:00' }, { m: 'Incline press', s: '4 × 8 · 2:30' }],
  'deadlift': [{ m: 'Trap-bar deadlift', s: '3 × 3 · 3:00' }, { m: 'Rack pull', s: '3 × 5 · 2:30' }, { m: 'RDL', s: '4 × 6 · 2:30' }],
};
const BS_MOVE_SWAPS_FALLBACK = [{ m: 'Dumbbell variant' }, { m: 'Machine variant' }, { m: 'Cable variant' }];

// Coach-approved meal substitutions — same macro neighbourhood as a planned meal.
const BS_MEAL_SWAPS = [
  { title: 'Turkey & rice bowl', kcal: 610, p: 48, c: 66, f: 14 },
  { title: 'Cod, potato, greens', kcal: 560, p: 46, c: 52, f: 16 },
  { title: 'Tofu stir-fry + rice', kcal: 580, p: 34, c: 72, f: 16 },
  { title: 'Chicken wrap + side salad', kcal: 600, p: 44, c: 58, f: 18 },
  { title: 'Lean steak + sweet potato', kcal: 640, p: 50, c: 54, f: 20 },
];

// Reusable bottom-sheet picker (used for exercise + meal swaps).
function BSSwapSheet({ title, subtitle, options, onPick, onClose }) {
  const t = useBS();
  return createPortal(
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={e => e.stopPropagation()} className="bs-scroll" style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: `18px ${t.padX}px calc(20px + env(safe-area-inset-bottom, 0px))`, maxHeight: '78%', overflowY: 'auto', borderTop: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700 }}>{title}</div>
        {subtitle && <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, color: t.INK, marginTop: 4, letterSpacing: '-0.02em' }}>{subtitle}</div>}
        <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {options.map((o, i) => (
            <button key={i} onClick={() => onPick(o)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', padding: '13px 14px', borderRadius: 14, border: `1px solid ${o.current ? t.ACCENT : t.RULE}`, background: o.current ? 'rgba(10,197,168,0.07)' : t.PAPER2 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{o.label}{o.current ? '  ·  current' : ''}</div>
              {o.sub && <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{o.sub}</div>}
            </button>
          ))}
        </div>
        <button onClick={onClose} style={{ width: '100%', marginTop: 12, padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK70, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
      </div>
    </div>,
    // Portal into the phone surface (not document.body) so the sheet is sized
    // to the phone frame and clipped by it — otherwise it overhangs the frame
    // in the desktop preview where the window is wider than the phone.
    (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
  );
}

// TRAIN — workout-focused page
// ═══════════════════════════════════════════════════════════
function BSClientTrain({ onProfile, goCalendar = () => {}, goRadio = () => {}, goMarket = () => {}, autoStart = false, onAutoStartConsumed = () => {} }) {
  const t = useBS();
  const bsTrainProgram = useBSProgram();
  const [day, setDay] = useStateBSC(bsWeekdayIdx()); // default to today (0=Mon..6=Sun)
  const [session, setSession] = useStateBSC(false);
  const [previewing, setPreviewing] = useStateBSC(false);
  // Auto-launch the live session ONLY when arriving from the calendar's "Start
  // session" (a one-shot pending flag), then clear it so returning to Train from
  // the calendar overlay — which remounts this screen — never re-launches.
  React.useEffect(() => { if (autoStart) { setDay(bsWeekdayIdx()); setSession(true); onAutoStartConsumed(); } }, [autoStart]);
  const [swapIdx, setSwapIdx] = useStateBSC(null);          // move to swap: number | 'pick' | null
  const [moveOverrides, setMoveOverrides] = useStateBSC({}); // `${day}:${i}` → { m, s }
  React.useEffect(() => {
    let cancelled = false;
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    window.shapeDb.getUserGoals('client_train_swaps').then((saved) => {
      if (!cancelled && saved && typeof saved === 'object') setMoveOverrides(saved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const [liveProgram, setLiveProgram] = useStateBSC(null);

  // Pull the client's assigned plan; fall back to the demo program below when
  // nothing is assigned (keeps the screen rich for unassigned/demo accounts).
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await window.ShapePlan?.get?.();
        if (cancelled || !p?.training?.hasPlan) return;
        setLiveProgram(bsBuildTrainProgram(p.training.workouts, t));
        setDay(bsWeekdayIdx());
      } catch (e) { /* keep demo program */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Per-day program (demo fallback, May 8–14, 2026) ──
  // Demo fallback program (Mon..Sun) — built from the SHARED client week so the
  // Train deck / live session / preview show the same workout as the home hero
  // and the calendar for each day. Real assigned plans still win (liveProgram).
  const MOCK_PROGRAM = React.useMemo(() => bsBuildDemoTrainProgram(t), [t]);

  const PROGRAM = liveProgram || MOCK_PROGRAM;
  const cur = PROGRAM[day] || PROGRAM[0];
  const days = PROGRAM.map(p => p.d);
  // Apply any coach-approved exercise swaps the user picked for this day.
  const effMoves = (cur.moves || []).map((r, i) => ({ ...r, ...(moveOverrides[`${day}:${i}`] || {}) }));

  // Parse "4 × 8 · …" → { sets: 4, reps: '8' } so the live player reflects the
  // actual session; segment-style cardio (no "× reps") falls back to one set.
  if (session) return <BSSession title={cur.title} moves={effMoves.map(m => { const mm = String(m.s || '').match(/(\d+)\s*×\s*([\d–-]+)/); return { ...m, sets: mm ? Number(mm[1]) : 1, reps: mm ? mm[2] : '' }; })} onBack={() => setSession(false)} />;
  if (previewing) return <BSWorkoutPreview program={{ ...cur, moves: effMoves }} onBack={() => setPreviewing(false)} onStart={() => { setPreviewing(false); setSession(true); }} />;

  return (
    <BSPage>
      <BSPageHeader
        kicker={`${bsTrainProgram.trainingPhase || 'Build'} · Week ${bsProgramWeek()}`}
        title={cur.title}
        trailing={<BSFacetAvatar size={34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={onProfile} />}
      />

      <BSWeekStrip activeIdx={day} onSelect={setDay} restFlags={PROGRAM.map(p => p.tag === 'REST')} />

      <BSCoachAdjustBanner detail={bsTrainProgram.detail} kind="training" />

      {/* Today hero — the session at a glance, with the coach + play. */}
      <div style={{ margin: `14px ${t.padX}px 0`, borderRadius: 16, border: `1px solid ${t.RULE}`, background: `linear-gradient(160deg, rgba(10,197,168,0.10), ${t.PAPER2} 62%)`, padding: 15 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', fontWeight: 700 }}>
          <span style={{ color: t.ACCENT }}>{day === bsWeekdayIdx() ? 'Today' : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][day]}{cur.timeLabel ? ` · ${cur.timeLabel}` : ''}</span>
          <span style={{ color: t.INK50 }}>Week {bsProgramWeek()} · D{day + 1}</span>
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 26, lineHeight: 0.96, letterSpacing: '-0.04em', color: t.INK }}>{cur.headline}</div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, color: t.INK70, letterSpacing: '0.06em' }}>
          {effMoves.length > 0 ? cur.meta : cur.copy}
        </div>
        <div style={{ marginTop: 13, display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 30, height: 30, flexShrink: 0, borderRadius: 999, background: '#c0533b', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 13 }}>J</div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: t.INK }}>Jordan Chen</div>
            <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase' }}>Coach</div>
          </div>
          {effMoves.length > 0 ? (
            <button onClick={() => setSession(true)} aria-label="Start session" style={{ width: 42, height: 42, flexShrink: 0, borderRadius: 999, border: 0, background: t.ACCENT, color: '#031f1c', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15 }}>▶</button>
          ) : (
            <span style={{ flexShrink: 0, padding: '10px 14px', borderRadius: 999, border: `1px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>Rest</span>
          )}
        </div>
      </div>

      {/* Workout — the moves. Tap a move (or Swap) to pick a coach-approved sub. */}
      {effMoves.length > 0 && (
        <>
          <BSTrackHeader kicker="Workout" title={`${effMoves.length} moves`} actionLabel="Swap" onAction={() => setSwapIdx('pick')} />
          <div style={{ padding: `10px ${t.padX}px 0` }}>
            {effMoves.map((r, i) => {
              const swapped = !!moveOverrides[`${day}:${i}`];
              return (
                <button key={i} onClick={() => setSwapIdx(i)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600, marginTop: 3 }}>{r.n}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{r.m}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>SWAPPED</span>}</div>
                    <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{r.s}</div>
                  </div>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK, fontWeight: 600, marginTop: 3 }}>{r.l}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* Exercise swap sheet — pick which move, then a coach-approved alternate. */}
      {swapIdx != null && (() => {
        if (swapIdx === 'pick') {
          return <BSSwapSheet title="Swap" subtitle="Swap an exercise" options={effMoves.map((r, i) => ({ label: r.m, sub: r.s, _i: i }))} onPick={(o) => setSwapIdx(o._i)} onClose={() => setSwapIdx(null)} />;
        }
        const orig = effMoves[swapIdx];
        if (!orig) return null;
        const alts = BS_MOVE_SWAPS[String(orig.m || '').toLowerCase().trim()] || BS_MOVE_SWAPS_FALLBACK;
        const baseName = (cur.moves[swapIdx] || {}).m;
        const options = [
          { label: baseName, sub: (cur.moves[swapIdx] || {}).s, current: true, _keep: true },
          ...alts.filter(a => a.m !== orig.m).map(a => ({ label: a.m, sub: a.s || orig.s, _alt: a })),
        ];
        return <BSSwapSheet title="Swap exercise" subtitle={orig.m} options={options} onClose={() => setSwapIdx(null)}
          onPick={(o) => {
            const key = `${day}:${swapIdx}`;
            const next = { ...moveOverrides };
            if (o._keep) delete next[key];
            else next[key] = { m: o._alt.m, s: o._alt.s || orig.s };
            setMoveOverrides(next);
            try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_train_swaps', next); } catch (e) {}
            if (!o._keep) {
              window.__bsToast && window.__bsToast('Swapped to ' + o._alt.m, 'ok');
              try { window.ShapeMessages && window.ShapeMessages.sendProviderMessage && window.ShapeMessages.sendProviderMessage({ coach: { name: 'Jordan Chen', provider_role: 'trainer' }, text: `Swapped ${baseName} → ${o._alt.m} · ${cur.d}` }).catch(() => {}); } catch (e) {}
            }
            setSwapIdx(null);
          }} />;
      })()}

      {/* This week — on deck. Derived from the shared week (PROGRAM): the next few
          days after today, so it matches the calendar + home. Tap to jump there. */}
      <BSTrackHeader kicker="This week" title="On deck" actionLabel="Plan" onAction={goCalendar} />
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        {[1, 2, 3].map((off) => {
          const idx = (bsWeekdayIdx() + off) % 7;
          const p = PROGRAM[idx] || {};
          const rest = p.tag === 'REST';
          const dow = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][idx];
          return { idx, m: rest ? 'Active rest' : (p.headline || p.title || '—'), s: `${dow} · ${rest ? 'walk + mobility' : (p.meta || '')}`, r: '' };
        }).map((x, i) => (
          <button key={i} onClick={() => setDay(x.idx)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600, marginTop: 3 }}>{String(i + 1).padStart(2, '0')}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{x.m}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{x.s}</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3 }}>{x.r || ''}</span>
          </button>
        ))}
      </div>

      {/* From Jordan — coach playlists (sourced from the Radio coach-playlist feed) */}
      {(() => {
        const all = Array.isArray(window.BS_COACH_PLAYLISTS) ? window.BS_COACH_PLAYLISTS : [];
        const lists = all.filter(p => p.role === 'Coach');
        const items = lists.length ? lists.map(p => ({ k: `${p.by} · Your coach`, title: p.name, meta: `${p.len} · ${p.bpm} BPM · ${p.tracks} tracks${p.attached ? ` · ${p.attached}` : ''}`, url: p.url, tracks: p.songs }))
          : [{ k: 'Jordan Chen · Your coach', title: 'Pull heavy.', meta: '52m · 95-138 BPM · 14 tracks' }];
        return (
          <>
            <BSTrackHeader kicker="From Jordan" title="Playlists" />
            <div style={{ padding: `12px ${t.padX}px 0`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((p, i) => (
                <BSPlaylistCard key={i} kicker={p.k} title={p.title} meta={p.meta} color="#1db954" spotifyUrl={p.url} tracks={p.tracks} />
              ))}
            </div>
          </>
        );
      })()}

      {/* Find a trainer — marketplace deep link (Trainer tab), pinned to the bottom */}
      <BSTrackHeader kicker="Marketplace" title="Coaching" />
      <div style={{ padding: `12px ${t.padX}px 28px` }}>
        <button onClick={() => goMarket('trainer')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', minHeight: 60, borderRadius: 14, border: `2px solid ${t.isLight ? '#9c7b43' : '#e7dcc3'}`, background: t.isLight ? '#9c7b4314' : '#e7dcc31f' }}>
          <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: t.isLight ? '#9c7b43' : '#e7dcc3', color: t.isLight ? '#fff' : '#2a1f12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.isLight ? '#fff' : '#2a1f12'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 6.5v11M3 9.5v5M17.5 6.5v11M21 9.5v5M6.5 12h11"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 16, color: t.INK }}>Find a trainer</div>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.05em', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>Vetted coaches · filter by goal & schedule</div>
          </div>
          <span style={{ color: t.isLight ? '#9c7b43' : '#e7dcc3', fontSize: 16, flexShrink: 0, fontWeight: 700 }}>→</span>
        </button>
      </div>

      <BSFooter right="Pg 2 of 5" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// MEAL PREVIEW — recipe-style breakdown of a single meal
// ═══════════════════════════════════════════════════════════
// Reset BSPage scroll to 0 whenever a preview mounts. Sticky headers behave
// fine when the scroller starts at top; the bug is that BSPage retains
// scrollTop from the previous render tree branch in some browsers, leaving
// the preview opening "halfway down" with no way to drag back up.
function _bsScrollTopOnMount() {
  React.useLayoutEffect(() => {
    const el = document.querySelector('.bs-scroll');
    if (el) el.scrollTop = 0;
  }, []);
}

// Shared "Logged." confirmation screen — used after one-tap logging a meal
// from the preview (and mirrors the log-meal flow's confirmation).
function BSMealLogged({ kcal = 0, p = 0, time = '12:40 PM', onDone = () => {}, onUndo = () => {} }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const CAL_GOAL = 2100, P_GOAL = 165, DAY_BASE_CAL = 1568, DAY_BASE_P = 118;
  const dayCal = DAY_BASE_CAL + (kcal || 0);
  const dayP = DAY_BASE_P + (p || 0);
  return (
    <BSPage>
      <div style={{ padding: `84px ${t.padX}px 0`, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
        <div style={{ width: 84, height: 84, borderRadius: 999, background: teal, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 44px ${teal}55`, color: '#04201d', fontSize: 34, fontWeight: 700 }}>✓</div>
        <div style={{ marginTop: 22, fontFamily: t.DISPLAY, fontSize: 38, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em' }}>Logged<span style={{ color: teal }}>.</span></div>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 500, color: t.INK50, letterSpacing: '-0.005em' }}>{kcal} kcal · {p}P · {time}</div>
      </div>
      <div style={{ padding: `26px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${teal}40`, background: `linear-gradient(155deg, ${teal}14, ${t.PAPER2} 72%), ${t.PAPER2}`, padding: 16 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Day so far</div>
          <div style={{ marginTop: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[['Calories', dayCal, CAL_GOAL, teal], ['Protein', dayP, P_GOAL, t.RUST]].map(([l, v, goal, c]) => (
              <div key={l}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}><span>{l}</span><span>/ {goal}</span></div>
                <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: c }}>{v}</div>
                <div style={{ marginTop: 6, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ width: `${Math.min(100, (v / goal) * 100)}%`, height: '100%', background: c }} /></div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div style={{ padding: `22px ${t.padX}px 8px` }}>
        <button onClick={onDone} style={{ width: '100%', padding: '15px', borderRadius: t.RADIUS_SM, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700 }}>Done →</button>
      </div>
      <div style={{ textAlign: 'center', paddingBottom: 28 }}>
        <button onClick={onUndo} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK50 }}>Undo</button>
      </div>
    </BSPage>
  );
}

// Household-measure conversion for meal ingredients — most people don't weigh
// grams, so render gram/ml quantities as cups / tbsp / oz / slices (display only;
// stored data stays metric). Keyed by ingredient name; falls back to oz (solids)
// or cups/tbsp (liquids).
const _BS_FRAC = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
const _BS_HOUSEHOLD = [
  { re: /skyr|yogurt|yoghurt|kefir|cottage/i,                              per: 245, u: 'cup' },
  { re: /\bmilk\b|cream(?!\s*cheese)|buttermilk|oat milk|almond milk|soy milk/i, per: 240, u: 'cup' },
  { re: /rolled oat|oatmeal|\boats?\b|granola/i,                           per: 90,  u: 'cup' },
  { re: /jasmine rice|basmati|cooked rice|\brice\b/i,                      per: 195, u: 'cup' },
  { re: /quinoa|couscous|bulgur|farro/i,                                   per: 185, u: 'cup' },
  { re: /\bpasta\b|noodle|macaroni|spaghetti|penne/i,                      per: 140, u: 'cup' },
  { re: /spinach|arugula|kale|lettuce|greens|rocket|salad/i,               per: 30,  u: 'cup' },
  { re: /berr|blueberr|strawberr|raspberr|blackberr/i,                     per: 150, u: 'cup' },
  { re: /broccoli|cauliflower|green bean|brussels|asparagus/i,             per: 90,  u: 'cup' },
  { re: /mushroom/i,                                                       per: 70,  u: 'cup' },
  { re: /onion|shallot|scallion/i,                                         per: 160, u: 'cup' },
  { re: /pepper|capsicum/i,                                                per: 150, u: 'cup' },
  { re: /tomato/i,                                                         per: 180, u: 'cup' },
  { re: /peanut butter|almond butter|nut butter|cashew butter|tahini/i,    per: 16,  u: 'tbsp' },
  { re: /chia|flax|hemp seed|sesame/i,                                     per: 10,  u: 'tbsp' },
  { re: /olive oil|\boil\b|butter|ghee/i,                                  per: 14,  u: 'tbsp' },
  { re: /honey|maple|syrup|agave|\bjam\b|preserve/i,                       per: 21,  u: 'tbsp' },
  { re: /\bbread\b|sourdough|toast|bagel|tortilla|wrap|pita|\bbun\b/i,     per: 40,  u: 'slice' },
  { re: /almond|walnut|cashew|pecan|pistachio|\bnuts?\b|peanut/i,          per: 140, u: 'cup' },
  { re: /protein powder|whey protein|\bwhey\b/i,                           per: 30,  u: 'scoop' },
  { re: /feta|cheddar|parmesan|mozzarella|gouda|cheese|halloumi|paneer/i,  per: 28,  u: 'oz' },
  { re: /chicken|beef|turkey|pork|salmon|tuna|fish|shrimp|steak|cod|tofu|tempeh|sausage|bacon|\bham\b|mince/i, per: 28, u: 'oz' },
];
function _bsFmtAmt(x) {
  const whole = Math.floor(x + 1e-9);
  const frac = Math.round((x - whole) * 100) / 100;
  const fs = frac ? (_BS_FRAC[frac] || '') : '';
  if (whole === 0) return fs || '0';
  return `${whole}${fs}`;
}
function _bsPlural(u, amt) {
  if (amt === 1) return u;
  if (u === 'cup') return 'cups';
  if (u === 'slice') return 'slices';
  if (u === 'scoop') return 'scoops';
  return u;
}
function _bsFmtUnit(amt, u) {
  if (u === 'oz') { const n = Math.max(1, Math.round(amt)); return `${n} oz`; }
  if (u === 'slice') { const r = Math.max(0.5, Math.round(amt * 2) / 2); return `${_bsFmtAmt(r)} ${_bsPlural('slice', r)}`; }
  const r = Math.max(0.25, Math.round(amt * 4) / 4);
  return `${_bsFmtAmt(r)} ${_bsPlural(u, r)}`;
}
function bsHouseholdQty(qty, name) {
  const s = String(qty == null ? '' : qty).trim();
  const m = s.match(/^(\d+(?:\.\d+)?)\s*(g|gram|grams|ml)\b/i);
  if (!m) return s; // already a household unit / count / fraction — leave as-is
  const grams = parseFloat(m[1]);
  if (!isFinite(grams) || grams <= 0) return s;
  const hit = _BS_HOUSEHOLD.find(h => h.re.test(String(name || '')));
  if (hit) return _bsFmtUnit(grams / hit.per, hit.u);
  if (m[2].toLowerCase() === 'ml') return grams >= 120 ? _bsFmtUnit(grams / 240, 'cup') : _bsFmtUnit(grams / 15, 'tbsp');
  return _bsFmtUnit(grams / 28.35, 'oz');
}
// Same, for a full ingredient string like "170 g skyr" → "¾ cup skyr".
function bsHouseholdStr(str) {
  const s = String(str == null ? '' : str).trim();
  const m = s.match(/^(\d+(?:\.\d+)?\s*(?:g|gram|grams|ml))\b\s*(.*)$/i);
  if (!m) return s;
  const conv = bsHouseholdQty(m[1], m[2]);
  return m[2] ? `${conv} ${m[2]}` : conv;
}

// Client meal-time schedule preference — feeds the meal eyebrow's slot fallback
// so the timestamp matches when the client actually eats. Cached on window so the
// (sync) meal preview can read it; Settings loads/writes it via client_settings.
const BS_DEFAULT_MEAL_TIMES = { BFAST: '08:00', LUNCH: '12:30', SNACK: '16:00', DINNER: '19:00' };
const BS_MEAL_TIME_OPTS = (() => {
  const out = [];
  for (let mins = 5 * 60; mins <= 23 * 60 + 30; mins += 30) {
    const h = Math.floor(mins / 60), m = mins % 60;
    const ap = h >= 12 ? 'PM' : 'AM', h12 = h % 12 === 0 ? 12 : h % 12;
    out.push(`${h12}:${String(m).padStart(2, '0')} ${ap}`);
  }
  return out;
})();
function _bs12to24(s) {
  const m = String(s || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]) % 12;
  if (/PM/i.test(m[3])) h += 12;
  return `${String(h).padStart(2, '0')}:${m[2]}`;
}
if (typeof window !== 'undefined' && !window.ShapeMealTimes) {
  let _mt = { ...BS_DEFAULT_MEAL_TIMES };
  window.ShapeMealTimes = {
    get: () => _mt,
    // Accept the Settings 12h-string prefs (mealBreakfast / mealLunch / …).
    setFromPrefs: (p) => {
      if (!p) return;
      const next = { ..._mt };
      if (p.mealBreakfast) next.BFAST = _bs12to24(p.mealBreakfast) || next.BFAST;
      if (p.mealLunch)     next.LUNCH = _bs12to24(p.mealLunch) || next.LUNCH;
      if (p.mealSnack)     next.SNACK = _bs12to24(p.mealSnack) || next.SNACK;
      if (p.mealDinner)    next.DINNER = _bs12to24(p.mealDinner) || next.DINNER;
      _mt = next;
    },
  };
}

// Shared meal-time formatting so the schedule reads the same everywhere (the
// preview eyebrow, the day-log rows, the swap sheet): meal's own time, else the
// client's meal-time preference for that slot, rendered 12-hour.
function bsFmt12(hhmm) {
  const [h, m] = String(hhmm || '').split(':').map(Number);
  if (Number.isNaN(h)) return '';
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`;
}
function bsMealSchedTime(meal) {
  const mt = (typeof window !== 'undefined' && window.ShapeMealTimes && window.ShapeMealTimes.get()) || BS_DEFAULT_MEAL_TIMES;
  const slot = { BFAST: mt.BFAST, BREAKFAST: mt.BFAST, LUNCH: mt.LUNCH, SNACK: mt.SNACK, DINR: mt.DINNER, DINNER: mt.DINNER };
  return (meal && meal.time) || slot[String((meal && meal.tag) || '').toUpperCase()] || '';
}
function bsMealSchedLabel(meal) { return bsFmt12(bsMealSchedTime(meal)); }

function BSMealPreview({ meal, onBack, onLog }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [justLogged, setJustLogged] = useStateBSC(false);
  const mealLibItem = { id: 'meal:' + String(meal.id || String(meal.title || 'meal').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')), kind: 'meal', title: meal.title, meta: `${meal.kcal} kcal · ${meal.p}P · ${meal.c}C · ${meal.f}F` };
  const mealSaved = useBSLibrary().some(x => x.id === mealLibItem.id);
  const fmt12 = (hhmm) => { const [h, m] = String(hhmm || '').split(':').map(Number); if (Number.isNaN(h)) return ''; const ap = h >= 12 ? 'PM' : 'AM'; return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, '0')} ${ap}`; };
  // The eyebrow timestamp follows the client's actual schedule: use the meal's
  // own scheduled time, and only when it's missing fall back to the client's
  // meal-time preference for that slot (Settings → Preferences → meal times).
  const _mt = (typeof window !== 'undefined' && window.ShapeMealTimes && window.ShapeMealTimes.get()) || BS_DEFAULT_MEAL_TIMES;
  const SLOT_TIMES = { BFAST: _mt.BFAST, BREAKFAST: _mt.BFAST, LUNCH: _mt.LUNCH, SNACK: _mt.SNACK, DINR: _mt.DINNER, DINNER: _mt.DINNER };
  const schedTime = meal.time || SLOT_TIMES[String(meal.tag || '').toUpperCase()] || '';
  if (justLogged) {
    return <BSMealLogged kcal={meal.kcal} p={meal.p} time={fmt12(schedTime)} onDone={onBack} onUndo={() => setJustLogged(false)} />;
  }

  // Macro % of total kcal — visual bar split
  const totalCal = (meal.p || 0) * 4 + (meal.c || 0) * 4 + (meal.f || 0) * 9 || 1;
  const pPct = Math.round(((meal.p || 0) * 4 / totalCal) * 100);
  const cPct = Math.round(((meal.c || 0) * 4 / totalCal) * 100);
  const fPct = 100 - pPct - cPct;
  // Meals opened from the day log carry only macros — guard the rich fields.
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  const steps = Array.isArray(meal.steps) ? meal.steps : [];

  return (
    <BSPage>
      <div style={{ padding: `62px ${t.padX}px 10px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back</button>
        <BSMeCorner size={28} />
      </div>

      {/* Hero halftone — rounded */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: 16, overflow: 'hidden', border: `1px solid ${t.RULE}` }}>
          <BSHalftone height={150} accent={meal.tagColor} pattern="dots" />
        </div>
      </div>

      {/* Title below the image — with the meal-slot timestamp as an eyebrow */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        {(meal.tag || schedTime) && (
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
            {[meal.tag, schedTime ? fmt12(schedTime) : null].filter(Boolean).join(' · ')}
          </div>
        )}
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.035em', lineHeight: 1 }}>{meal.title}</div>
      </div>

      {/* Stats row — rounded card */}
      <div style={{ padding: `16px ${t.padX}px 6px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '14px 6px', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
          {[
            { l: 'KCAL',    v: String(meal.kcal) },
            { l: 'PROTEIN', v: meal.p + 'g' },
            { l: 'CARBS',   v: meal.c + 'g' },
            { l: 'FAT',     v: meal.f + 'g' },
          ].map((s, i) => (
            <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${t.HAIR}` : 0, paddingLeft: 10, paddingRight: 6 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{s.l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 21, color: t.INK, marginTop: 4, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Macro split bar — rounded */}
      <div style={{ padding: `10px ${t.padX}px 6px` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Macro split · % of kcal</div>
        <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: t.HAIR }}>
          <div style={{ width: `${pPct}%`, background: t.GREEN }} />
          <div style={{ width: `${cPct}%`, background: t.AMBER }} />
          <div style={{ width: `${fPct}%`, background: t.RUST }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 9, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.INK70, fontWeight: 600 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: t.GREEN, marginRight: 5 }} />P {pPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: t.AMBER, marginRight: 5 }} />C {cPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: t.RUST,  marginRight: 5 }} />F {fPct}%</span>
        </div>
      </div>

      {/* Quick facts */}
      {(meal.prep || meal.portion || meal.score) && (
        <div style={{ padding: `8px ${t.padX}px 10px`, display: 'flex', gap: 16, flexWrap: 'wrap', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.1em', color: t.INK70, fontWeight: 600 }}>
          {meal.prep && <span>⏱ {meal.prep}</span>}
          {meal.portion && <span>· {meal.portion}</span>}
          {meal.score && <span>· Score <span style={{ color: t.AMBER, fontWeight: 700 }}>{meal.score}</span></span>}
        </div>
      )}

      {/* The brief */}
      {(meal.hero || meal.brief) && (
        <div style={{ padding: `12px ${t.padX}px 4px` }}>
          <BSEyebrow color={teal}>The dish</BSEyebrow>
          {meal.hero && (
            <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.4, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>
              {meal.hero}
            </div>
          )}
          {meal.brief && (
            <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>
              {meal.brief}
            </div>
          )}
        </div>
      )}

      {/* Ingredients — rounded card */}
      {ingredients.length > 0 && (
        <>
          <BSSection title="Ingredients" meta={`${ingredients.length} items`} />
          <div style={{ padding: `0 ${t.padX}px` }}>
            <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
              {ingredients.map((ing, i) => (
                <div key={i} style={{
                  padding: '12px 0', borderBottom: i === ingredients.length - 1 ? 0 : `1px solid ${t.HAIR}`,
                  display: 'flex', alignItems: 'baseline', gap: 12,
                }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, fontWeight: 700, width: 78, flexShrink: 0, letterSpacing: '0.04em' }}>{t.isMetric ? ing.n : bsHouseholdQty(ing.n, ing.m)}</span>
                  <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>{ing.m}</div>
                  <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>{ing.k}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Method — rounded card */}
      {steps.length > 0 && (
        <>
          <BSSection title="Method" meta={`${steps.length} steps`} />
          <div style={{ padding: `0 ${t.padX}px` }}>
            <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '4px 14px' }}>
              {steps.map((s, i) => (
                <div key={i} style={{
                  padding: '14px 0', borderBottom: i === steps.length - 1 ? 0 : `1px solid ${t.HAIR}`,
                  display: 'flex', gap: 12, alignItems: 'flex-start',
                }}>
                  <span style={{
                    width: 22, height: 22, borderRadius: '50%', background: meal.tagColor, color: t.PAPER,
                    fontFamily: t.MONO, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>{i + 1}</span>
                  <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.4, color: t.INK85 }}>{s}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* CTA row — compact, single-line */}
      <div style={{ padding: `16px ${t.padX}px 16px`, display: 'flex', gap: 8, alignItems: 'stretch' }}>
        <button onClick={onBack} style={{ borderRadius: 11,
          padding: '0 14px', border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Close</button>
        <button onClick={() => bsLibToggle(mealLibItem)} style={{ borderRadius: 11,
          padding: '0 14px', border: `1px solid ${mealSaved ? teal : t.RULE}`, background: mealSaved ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent', color: mealSaved ? teal : t.INK, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', whiteSpace: 'nowrap',
        }}>{mealSaved ? '✓ Saved' : '♡ Save'}</button>
        <button onClick={onLog ? onLog : () => setJustLogged(true)} style={{
          flex: 1, border: 0, borderRadius: 11, background: teal, color: '#04201d', cursor: 'pointer',
          padding: '9px 14px', display: 'flex', alignItems: 'center', justifyContent: onLog ? 'center' : 'space-between', gap: 8,
        }}>
          {onLog ? <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>Log Now</span> : (
            <>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', opacity: 0.6 }}>One tap</span>
                <span style={{ display: 'block', marginTop: 1, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, letterSpacing: '-0.02em', whiteSpace: 'nowrap' }}>Ate as planned</span>
              </span>
              <span style={{ fontSize: 14, fontWeight: 700 }}>✓</span>
            </>
          )}
        </button>
      </div>

      <BSFooter right="Recipe" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// RECIPE PREVIEW — for "Recipe of the day" card (full recipe view)
// ═══════════════════════════════════════════════════════════
function BSRecipePreview({ recipe, dayLabel, onBack, onAddGrocery, groceryAdded = false }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const [saved, setSaved] = useStateBSC(false);
  const r = recipe;

  const totalCal = (r.p || 0) * 4 + (r.c || 0) * 4 + (r.f || 0) * 9 || 1;
  const pPct = Math.round(((r.p || 0) * 4 / totalCal) * 100);
  const cPct = Math.round(((r.c || 0) * 4 / totalCal) * 100);
  const fPct = 100 - pPct - cPct;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`Recipe of the day · ${dayLabel}`}
        title={r.title}
      />

      {/* Hero halftone */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSHalftone height={170} accent={r.accent} pattern="dots" />
      </div>

      {/* Meta strip */}
      <div style={{ padding: `12px ${t.padX}px 0`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.1em', color: t.INK70, fontWeight: 600 }}>
        {r.meta}
      </div>

      {/* Stats row */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)',
        padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`,
        borderTop: `2px solid ${t.INK}`, marginTop: 18,
      }}>
        {[
          { l: 'KCAL',    v: String(r.kcal) },
          { l: 'PROTEIN', v: r.p + 'g' },
          { l: 'CARBS',   v: r.c + 'g' },
          { l: 'FAT',     v: r.f + 'g' },
        ].map((s, i) => (
          <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, color: t.INK, marginTop: 4, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Macro split bar */}
      <div style={{ padding: `14px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Macro split · % of kcal</div>
        <div style={{ display: 'flex', height: 14, border: `1px solid ${t.INK}` }}>
          <div style={{ width: `${pPct}%`, background: t.GREEN }} />
          <div style={{ width: `${cPct}%`, background: t.AMBER }} />
          <div style={{ width: `${fPct}%`, background: t.RUST }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.INK70, fontWeight: 600 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.GREEN, marginRight: 5 }} />P {pPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.AMBER, marginRight: 5 }} />C {cPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, background: t.RUST,  marginRight: 5 }} />F {fPct}%</span>
        </div>
      </div>

      {/* Quick facts */}
      <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, display: 'flex', gap: 18, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.1em', color: t.INK70, fontWeight: 600 }}>
        <span>⏱ {r.prep}</span>
        <span>· {r.portion}</span>
        <span>· Score <span style={{ color: t.AMBER, fontWeight: 700 }}>{r.score}</span></span>
      </div>

      {/* Brief */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>The dish</BSEyebrow>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.4, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>
          {r.hero}
        </div>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 14, lineHeight: 1.45, color: t.INK70 }}>
          {r.brief}
        </div>
      </div>

      {/* Ingredients */}
      <BSSection title="Ingredients" meta={`${r.ingredients.length} items`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {r.ingredients.map((ing, i) => (
            <div key={i} style={{
              padding: '12px 0', borderBottom: i === r.ingredients.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', alignItems: 'baseline', gap: 12,
            }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK70, fontWeight: 700, width: 56, letterSpacing: '0.04em' }}>{ing.n}</span>
              <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 600, letterSpacing: '-0.005em' }}>{ing.m}</div>
              <span style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.06em', fontVariantNumeric: 'tabular-nums' }}>{ing.k}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Method */}
      <BSSection title="Method" meta={`${r.steps.length} steps`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {r.steps.map((s, i) => (
            <div key={i} style={{
              padding: '14px 0', borderBottom: i === r.steps.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <span style={{
                width: 22, height: 22, borderRadius: '50%', background: r.accent, color: t.PAPER,
                fontFamily: t.MONO, fontSize: 10, fontWeight: 700, flexShrink: 0, marginTop: 1,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>{i + 1}</span>
              <div style={{ flex: 1, fontFamily: t.DISPLAY, fontSize: 15, lineHeight: 1.4, color: t.INK85 }}>{s}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Coach note */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 18, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 10, fontWeight: 700 }}>
          ▍ Note from Rae · Nutrition
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 16, lineHeight: 1.4, letterSpacing: '-0.01em' }}>
          {r.coachNote}
        </div>
      </div>

      {/* CTA row */}
      <div style={{ padding: `22px ${t.padX}px 18px`, display: 'flex', gap: 8 }}>
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          padding: '14px 18px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>Close</button>
        <button onClick={onAddGrocery} style={{ borderRadius: t.RADIUS_SM,
          flex: 1, padding: '14px', border: `1px solid ${groceryAdded ? t.GREEN : t.INK}`,
          background: groceryAdded ? t.GREEN : 'transparent', color: groceryAdded ? t.PAPER : t.INK,
          fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer',
        }}>{groceryAdded ? 'Added to grocery' : 'Add grocery list'}</button>
        <button onClick={() => setSaved(s => !s)} style={{ borderRadius: t.RADIUS_SM,
          flex: 1, padding: '14px', border: 0,
          background: saved ? t.GREEN : t.INK, color: t.PAPER,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>{saved ? '✓ Saved to library' : 'Save recipe →'}</button>
      </div>

      <BSFooter right="Recipe" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// DAY BRIEF PREVIEW — tap the headline block to read the full day plan
// ═══════════════════════════════════════════════════════════
function BSDayBriefPreview({ day, onBack, onMealClick, onRecipeClick }) {
  const t = useBS();
  _bsScrollTopOnMount();

  const targetCal = Number(day.totals.target.cal);
  const actualCal = Number(day.totals.cal);
  const calPct = Math.min(100, Math.round((actualCal / targetCal) * 100));
  const loggedCount = day.meals.filter(m => m.state === 'done').length;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`Day brief · ${day.d}`}
        title={day.headline}
      />

      {/* Hero */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSHalftone height={170} accent={day.accent} pattern="dots" />
      </div>

      {/* Tag + meta strip */}
      <div style={{ padding: `16px ${t.padX}px 0`, display: 'flex', alignItems: 'baseline', gap: 8 }}>
        <BSTag color={day.tagColor}>{day.tag}</BSTag>
        <BSEyebrow color={t.ACCENT}>{day.meta}</BSEyebrow>
      </div>

      {/* The brief */}
      <div style={{ padding: `12px ${t.padX}px 18px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.45, color: t.INK, fontWeight: 500, letterSpacing: '-0.005em' }}>
          {day.copy}
        </div>
      </div>

      {/* Calorie progress */}
      <div style={{ padding: `18px ${t.padX}px`, borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 12 }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', fontWeight: 700 }}>Calories logged</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 36, color: t.INK, marginTop: 4, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>
              {actualCal.toLocaleString()}<span style={{ fontFamily: t.MONO, fontSize: 14, color: t.INK50, fontWeight: 600, marginLeft: 6, letterSpacing: '0.04em' }}>/ {targetCal.toLocaleString()}</span>
            </div>
          </div>
          <div style={{ fontFamily: t.MONO, fontSize: 11, color: day.accent, fontWeight: 700, letterSpacing: '0.1em' }}>{calPct}%</div>
        </div>
        <div style={{ height: 8, background: t.HAIR, position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, width: `${calPct}%`, background: day.accent }} />
        </div>
      </div>

      {/* Macro grid */}
      <div style={{
        padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`,
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
      }}>
        {[
          { l: 'PROTEIN',  v: day.totals.p, s: `/ ${day.totals.target.p}g`, c: t.GREEN },
          { l: 'CARBS',    v: day.totals.c, s: `/ ${day.totals.target.c}g`, c: t.AMBER },
          { l: 'FAT',      v: day.totals.f, s: `/ ${day.totals.target.f}g`, c: t.RUST  },
        ].map((m, i) => (
          <div key={m.l} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: m.c }} />
              <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', fontWeight: 700 }}>{m.l}</span>
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 24, color: t.INK, marginTop: 6, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{m.v}<span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600, marginLeft: 2 }}>g</span></div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 3, letterSpacing: '0.06em' }}>{m.s}</div>
          </div>
        ))}
      </div>

      {/* Schedule of meals */}
      <BSSection title="The day's plan" meta={`${day.meals.length} services · ${loggedCount} logged`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderTop: `2px solid ${t.INK}` }}>
          {day.meals.map((m, i) => (
            <div key={m.id} onClick={() => onMealClick && onMealClick(m.id)} style={{
              padding: '14px 0', borderBottom: i === day.meals.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'flex', alignItems: 'baseline', gap: 12, cursor: 'pointer',
            }}>
              <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, fontWeight: 700, letterSpacing: '0.04em', width: 60, flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>{bsMealSchedLabel(m)}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 4 }}>
                  <BSTag color={m.tagColor}>{m.tag}</BSTag>
                  {m.state === 'done' && <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.GREEN, fontWeight: 700, letterSpacing: '0.16em' }}>✓ LOGGED</span>}
                  {m.state === 'next' && <span style={{ fontFamily: t.MONO, fontSize: 9, color: day.accent, fontWeight: 700, letterSpacing: '0.16em' }}>NEXT UP</span>}
                </div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 700, letterSpacing: '-0.01em', lineHeight: 1.15 }}>{m.title}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 4, letterSpacing: '0.06em' }}>{m.kcal} kcal · {m.p}P · {m.c}C · {m.f}F</div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 14, color: t.INK50 }}>›</span>
            </div>
          ))}
        </div>
      </div>

      {/* Coach note */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 20, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 12, fontWeight: 700 }}>
          ▍ Notes from Maya
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 18, lineHeight: 1.3, letterSpacing: '-0.01em' }}>
          {day.coachLine}
        </div>
      </div>

      {/* Recipe of the day inline */}
      {day.recipe && (
        <div onClick={onRecipeClick} style={{ margin: `22px ${t.padX}px 0`, border: `1px solid ${t.INK}`, cursor: 'pointer' }}>
          <BSHalftone height={120} accent={day.accent} pattern="dots" />
          <div style={{ padding: 16, borderTop: `1px solid ${t.INK}`, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <BSEyebrow color={t.ACCENT}>Recipe of the day</BSEyebrow>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, lineHeight: 1, letterSpacing: '-0.025em', color: t.INK, marginTop: 8 }}>
                {day.recipeName}
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK70, marginTop: 6, letterSpacing: '0.08em' }}>
                {day.recipeMeta}
              </div>
            </div>
            <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.ACCENT, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Read →</div>
          </div>
        </div>
      )}

      {/* Back CTA */}
      <div style={{ padding: `22px ${t.padX}px 18px` }}>
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          width: '100%', padding: '14px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
        }}>← Back to menu</button>
      </div>

      <BSFooter right="Day brief" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
function bsNodeText(node) {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(bsNodeText).join(' ');
  if (node.props && node.props.children) return bsNodeText(node.props.children);
  return '';
}

function bsRecipeListId(recipe, dayLabel) {
  const title = bsNodeText(recipe?.title || 'recipe').replace(/\s+/g, ' ').trim().toLowerCase();
  return `recipe-${dayLabel}-${title}`.replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '');
}

function BSNutritionTopTabs({ active, onChange }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const tabs = [
    ['eat', 'Day'],
    ['grocery', 'Grocery'],
    ['recipes', 'Recipes'],
  ];
  return (
    <div style={{ padding: `9px ${t.padX}px`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, borderBottom: `1px solid ${t.RULE}` }}>
      {tabs.map(([key, label]) => {
        const on = active === key;
        return (
          <button key={key} onClick={() => onChange(key)} style={{ borderRadius: t.RADIUS_SM,
            padding: '12px 8px', border: `1px solid ${on ? teal : t.RULE}`,
            background: on ? teal : 'transparent', color: on ? '#04201d' : t.INK,
            fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase',
            cursor: 'pointer',
          }}>{label}</button>
        );
      })}
    </div>
  );
}

// ── Shape Kitchen — recipe library (mirrors the website /recipes) ──────
const BS_SK_DIET_COLOR = { Vegan: '#4fae5a', Vegetarian: '#7bc043', 'Plant-based': '#2ee0c4', Seafood: '#3b9ed6', Poultry: '#e0a84e', Meat: '#c0533b' };
const BS_SK_CREATORS = [['Nutritionist', 'Nutritionists'], ['Dietician', 'Dieticians']];
function bsSkSlug(title) {
  return String(title || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
}
function bsSkParseIngredient(s) {
  s = String(s || '').trim();
  const m = s.match(/^([0-9¼½¾⅓⅔.\/]+(?:\s*[-–]\s*[0-9.\/]+)?\s*(?:oz|ounces?|cups?|tbsp|tablespoons?|tsp|teaspoons?|lb|lbs|pounds?|kg|g|grams?|ml|l|liters?|cans?|cloves?|slices?|pints?|sprigs?|scoops?|handfuls?|bags?)?\.?)\s+(.+)$/i);
  if (m && m[2]) return { q: m[1].trim(), n: m[2].trim() };
  return { q: '', n: s };
}

// Recipe box — your personal recipes: All / Saved (liked) / meal-type filters,
// each card sends to ITS OWN grocery list, with a ♥ Save toggle. Shape Kitchen
// (the full catalog) stays reachable via the "Browse" card.
function BSRecipeBox({ recipes, onOpenRecipe, onSendToGrocery, onChangeView, onProfile = () => {} }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const lib = useBSLibrary();
  const [filter, setFilter] = useStateBSC('all');
  const [q, setQ] = useStateBSC('');
  // Advanced filters (folded in from the old Shape Kitchen page).
  const [diet, setDiet] = useStateBSC('All');
  const [needs, setNeeds] = useStateBSC([]);
  const [filtersOpen, setFiltersOpen] = useStateBSC(false);
  const toggleNeed = (n) => setNeeds(prev => prev.includes(n) ? prev.filter(x => x !== n) : [...prev, n]);
  const recId = (r) => `recipe:${bsSkSlug(r.title)}`;
  const savedIds = new Set(lib.filter(x => x.kind === 'recipe').map(x => x.id));
  const tagHas = (r, word) => (r.tags || []).some(tg => String(tg).toLowerCase().includes(word));
  const isPlant = (r) => ['vegan', 'vegetarian', 'plant-based'].includes(String(r.diet || '').toLowerCase()) || tagHas(r, 'plant');
  const matchFilter = (r) => {
    if (filter === 'all') return true;
    if (filter === 'saved') return savedIds.has(recId(r));
    if (filter === 'plant') return isPlant(r);
    return tagHas(r, filter);
  };
  const query = q.trim().toLowerCase();
  const list = recipes
    .filter(matchFilter)
    .filter(r => recipeMatchesDiet(r, diet))
    .filter(r => needs.length === 0 || needs.every(n => recipeNeeds(r).includes(n)))
    .filter(r => !query || [r.title, r.by, ...(r.tags || [])].join(' ').toLowerCase().includes(query));
  const savedCount = recipes.filter(r => savedIds.has(recId(r))).length;
  const pills = [['all', 'All', recipes.length], ['saved', 'Saved', savedCount], ['breakfast', 'Breakfast'], ['lunch', 'Lunch'], ['dinner', 'Dinner'], ['snack', 'Snack'], ['plant', 'Plant-based']];
  const dietCount = (d) => recipes.filter(r => recipeMatchesDiet(r, d)).length;
  const advCount = (diet !== 'All' ? 1 : 0) + needs.length;
  const resetAdv = () => { setDiet('All'); setNeeds([]); };
  const Chip = ({ label, on, color, onClick, count }) => (
    <button onClick={onClick} style={{
      flex: '0 0 auto', padding: '8px 12px', borderRadius: 999, cursor: 'pointer',
      border: `1px solid ${on ? (color || t.INK) : t.RULE}`, background: on ? (color || t.INK) : 'transparent',
      color: on ? (color ? '#0a0f0d' : t.PAPER) : t.INK70,
      fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
    }}>{label}{typeof count === 'number' ? ` ${count}` : ''}</button>
  );
  const Group = ({ label, children }) => (
    <div>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{children}</div>
    </div>
  );
  return (
    <BSPage>
      <BSPageHeader trailing={<BSFacetAvatar size={34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={onProfile} />} />
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal, fontWeight: 700 }}>Eat · Shape Kitchen</div>
        <h1 style={{ margin: '8px 0 0', fontFamily: t.DISPLAY, fontSize: 34, fontWeight: t.W.display, lineHeight: 0.92, letterSpacing: '-0.035em', color: t.INK }}>Shape<br/><span style={{ fontStyle: 'italic', color: teal }}>Kitchen.</span></h1>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, lineHeight: 1.4, color: t.INK70 }}>Save the meals you cook — send any recipe straight to its own grocery list.</div>
      </div>
      <BSNutritionTopTabs active="recipes" onChange={onChangeView} />
      <div style={{ padding: `12px ${t.padX}px 8px` }}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search recipes…" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 2px', border: 0, borderBottom: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, outline: 'none' }} />
      </div>
      {/* One filter section: quick type pills + a Filters toggle that expands
          the advanced Diet / Protein / Free-from / Goals groups in place. */}
      <div style={{ padding: `2px ${t.padX}px 10px` }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          {pills.map(([k, label, count]) => {
            const on = filter === k;
            return <button key={k} onClick={() => setFilter(k)} style={{ flex: '0 0 auto', padding: '8px 13px', borderRadius: 999, border: `1px solid ${on ? t.INK : t.RULE}`, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{label}{typeof count === 'number' ? ` · ${count}` : ''}</button>;
          })}
          <button onClick={() => setFiltersOpen(o => !o)} style={{ flex: '0 0 auto', display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 13px', borderRadius: 999, border: `1px solid ${(filtersOpen || advCount) ? t.INK : t.RULE}`, background: 'transparent', color: (filtersOpen || advCount) ? t.INK : t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>
            Filters{advCount > 0 ? ` · ${advCount}` : ''}
            <span style={{ display: 'inline-block', transform: filtersOpen ? 'rotate(180deg)' : 'none', transition: 'transform .18s ease' }}>▾</span>
          </button>
          {advCount > 0 && (
            <button onClick={resetAdv} style={{ flex: '0 0 auto', padding: '8px 11px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Clear</button>
          )}
        </div>
        {filtersOpen && (
          <div style={{ marginTop: 13, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <Group label="DIET">
              <Chip label="All" on={diet === 'All'} onClick={() => setDiet('All')} count={recipes.length} />
              {RECIPE_DIETS.map(d => <Chip key={d} label={d} on={diet === d} color={BS_SK_DIET_COLOR[d]} onClick={() => setDiet(diet === d ? 'All' : d)} count={dietCount(d)} />)}
            </Group>
            <Group label="PROTEIN">
              {RECIPE_PROTEINS.map(d => <Chip key={d} label={d} on={diet === d} color={BS_SK_DIET_COLOR[d]} onClick={() => setDiet(diet === d ? 'All' : d)} count={dietCount(d)} />)}
            </Group>
            <Group label="FREE FROM">
              {RECIPE_FREE_FROM.map(n => <Chip key={n} label={n} on={needs.includes(n)} onClick={() => toggleNeed(n)} count={recipes.filter(r => recipeNeeds(r).includes(n)).length} />)}
            </Group>
            <Group label="GOALS">
              {RECIPE_GOALS.map(n => <Chip key={n} label={n} on={needs.includes(n)} onClick={() => toggleNeed(n)} count={recipes.filter(r => recipeNeeds(r).includes(n)).length} />)}
            </Group>
          </div>
        )}
      </div>
      <div style={{ padding: `8px ${t.padX}px 8px`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {list.length === 0 ? (
          <div style={{ borderRadius: 18, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 24, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 15, color: t.INK70 }}>{filter === 'saved' ? 'No saved recipes yet — tap ♡ Save on any recipe.' : 'No recipes match.'}</div>
        ) : list.map((r, i) => {
          const dc = BS_SK_DIET_COLOR[r.diet] || teal;
          const id = recId(r);
          const saved = savedIds.has(id);
          const cat = (r.tags && r.tags[0]) || r.diet || 'Recipe';
          const coach = String(r.by || '').split(' ')[0];
          return (
            <div key={`${r.title}-${i}`} style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
              <button onClick={() => onOpenRecipe(r)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, padding: 0, display: 'grid', gridTemplateColumns: '62px 1fr', gap: 12, alignItems: 'center' }}>
                <span style={{ width: 62, height: 62, borderRadius: 14, background: r.hero, flexShrink: 0, border: `1px solid ${t.HAIR}` }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: dc, marginBottom: 4 }}>{cat} · {coach}</span>
                  <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em', lineHeight: 1.05 }}>{r.title}</span>
                  <span style={{ display: 'block', marginTop: 5, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.kcal} kcal · {r.macros.p}P / {r.macros.c}C / {r.macros.f}F · {r.time}</span>
                </span>
              </button>
              <div style={{ display: 'flex', gap: 7, marginTop: 10 }}>
                <button onClick={() => onSendToGrocery(r)} style={{ flex: 1, padding: '7px 10px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Send to grocery list →</button>
                <button onClick={() => bsLibToggle({ id, kind: 'recipe', title: r.title, meta: `${r.kcal} kcal · serves ${r.servings}`, coach: r.by })} style={{ flex: '0 0 auto', padding: '7px 11px', borderRadius: 999, border: `1px solid ${saved ? teal : t.RULE}`, background: saved ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent', color: saved ? teal : t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{saved ? '✓ Saved' : '♡ Save'}</button>
              </div>
            </div>
          );
        })}
      </div>
      <BSFooter right="Shape Kitchen" />
    </BSPage>
  );
}

function BSShapeKitchenRecipe({ recipe, onBack, onAddGrocery, groceryAdded }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const r = recipe;
  const slug = bsSkSlug(r.title);
  // Shared "recipe anatomy" with BSMealPreview: macro split (% of kcal).
  const _mp = r.macros || {};
  const _totCal = (_mp.p || 0) * 4 + (_mp.c || 0) * 4 + (_mp.f || 0) * 9 || 1;
  const pPct = Math.round(((_mp.p || 0) * 4 / _totCal) * 100);
  const cPct = Math.round(((_mp.c || 0) * 4 / _totCal) * 100);
  const fPct = 100 - pPct - cPct;
  const [reviews, setReviews] = useStateBSC([]);
  const [formRating, setFormRating] = useStateBSC(0);
  const [reviewText, setReviewText] = useStateBSC('');
  React.useEffect(() => {
    let cancelled = false;
    fetch(`/api/recipes/reviews?slug=${encodeURIComponent(slug)}`, { credentials: 'same-origin' })
      .then(res => (res.ok ? res.json() : null))
      .then(d => { if (!cancelled && d && Array.isArray(d.reviews)) setReviews(d.reviews); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [slug]);
  const avg = reviews.length ? Math.round((reviews.reduce((s, x) => s + (x.rating || 0), 0) / reviews.length) * 10) / 10 : 0;
  const submitReview = () => {
    if (!formRating) return;
    fetch('/api/recipes/reviews', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ slug, rating: formRating, text: reviewText }) })
      .then(res => (res.ok ? res.json() : res.json().then(e => Promise.reject(e))))
      .then(d => { if (d && d.review) { setReviews(prev => [d.review, ...prev]); setFormRating(0); setReviewText(''); window.__bsToast?.('Review posted', 'ok'); } })
      .catch(err => { window.__bsToast?.(err && err.error ? err.error : 'Could not post review', 'err'); });
  };
  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow={`${r.byRole} · ${r.by}`} kicker="Shape Kitchen" title={r.title} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ height: 150, borderRadius: t.RADIUS_SM, background: r.hero, display: 'flex', alignItems: 'flex-end', padding: 12 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', color: '#fff', background: 'rgba(0,0,0,0.4)', padding: '4px 9px', borderRadius: 999 }}>{r.time.toUpperCase()} · SERVES {r.servings} · {r.kcal} KCAL · {(r.diet || '').toUpperCase()}</span>
        </div>
      </div>
      <div style={{ padding: `16px ${t.padX}px 6px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '14px 6px' }}>
          {[['KCAL', String(r.kcal)], ['PROTEIN', _mp.p + 'g'], ['CARBS', _mp.c + 'g'], ['FAT', _mp.f + 'g']].map(([l, v], i) => (
            <div key={l} style={{ borderLeft: i > 0 ? `1px solid ${t.HAIR}` : 0, paddingLeft: 10, paddingRight: 6 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', color: t.INK50, textTransform: 'uppercase' }}>{l}</div>
              <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 21, color: t.INK, marginTop: 4, letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{v}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Macro split bar — % of kcal (shared with the meal page) */}
      <div style={{ padding: `10px ${t.padX}px 6px` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase', marginBottom: 8, fontWeight: 700 }}>Macro split · % of kcal</div>
        <div style={{ display: 'flex', height: 12, borderRadius: 999, overflow: 'hidden', background: t.HAIR }}>
          <div style={{ width: `${pPct}%`, background: t.GREEN }} />
          <div style={{ width: `${cPct}%`, background: t.AMBER }} />
          <div style={{ width: `${fPct}%`, background: t.RUST }} />
        </div>
        <div style={{ display: 'flex', gap: 14, marginTop: 9, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.INK70, fontWeight: 600 }}>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: t.GREEN, marginRight: 5 }} />P {pPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: t.AMBER, marginRight: 5 }} />C {cPct}%</span>
          <span><span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: 999, background: t.RUST,  marginRight: 5 }} />F {fPct}%</span>
        </div>
      </div>
      {r.blurb && (
        <div style={{ padding: `14px ${t.padX}px 0` }}>
          <BSEyebrow color={t.ACCENT}>The dish</BSEyebrow>
          <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 14, fontStyle: 'italic', color: t.INK70, lineHeight: 1.5 }}>"{r.blurb}" — {r.by}, {r.byRole}</div>
        </div>
      )}
      <BSSection title="Ingredients" meta={`${r.ingredients.length} items`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
          {r.ingredients.map((ing, i, arr) => (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start', padding: '11px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
              <span style={{ width: 6, height: 6, borderRadius: 999, background: t.ACCENT, marginTop: 7, flex: 'none' }} />
              <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK }}>{t.isMetric ? ing : bsHouseholdStr(ing)}</span>
            </div>
          ))}
        </div>
      </div>
      <BSSection title="Method" meta={`${r.steps.length} steps`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
          {r.steps.map((s, i, arr) => (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '28px 1fr', gap: 12, padding: '13px 0', borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.ACCENT, fontWeight: 700 }}>{String(i + 1).padStart(2, '0')}</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK, lineHeight: 1.55 }}>{s}</span>
            </div>
          ))}
        </div>
      </div>
      {r.tip && (
        <div style={{ padding: `16px ${t.padX}px 0` }}>
          <div style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.ACCENT}`, background: t.PAPER2, padding: 14 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 6 }}>Pro tip</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, lineHeight: 1.5 }}>{r.tip}</div>
          </div>
        </div>
      )}
      <div style={{ padding: `16px ${t.padX}px 0`, display: 'flex', gap: 8 }}>
        <BSSaveButton full item={{ id: `recipe:${slug}`, kind: 'recipe', title: r.title, meta: `${r.kcal} kcal · serves ${r.servings}`, coach: r.by }} />
        <button onClick={onAddGrocery} style={{ flex: 1, borderRadius: t.RADIUS_SM, padding: '14px', border: `1px solid ${groceryAdded ? t.GREEN : t.INK}`, background: groceryAdded ? t.GREEN : t.INK, color: t.PAPER, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>
          {groceryAdded ? '✓ Grocery list' : 'Add to grocery'}
        </button>
      </div>

      <BSSection title="Reviews" meta={reviews.length ? `${avg} ★ · ${reviews.length} ${reviews.length === 1 ? 'review' : 'reviews'}` : 'Be the first'} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase' }}>Your rating</span>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} onClick={() => setFormRating(n)} aria-label={`${n} stars`} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontSize: 22, lineHeight: 1, color: formRating >= n ? '#f4b860' : t.INK50 }}>★</button>
          ))}
        </div>
        <textarea value={reviewText} onChange={(e) => setReviewText(e.target.value)} placeholder="Share how it turned out, any tweaks you made…" rows={3}
          style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: t.RADIUS_SM, padding: '10px 12px', fontFamily: t.DISPLAY, fontSize: 14, resize: 'vertical', outline: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
          <button onClick={submitReview} style={{ borderRadius: t.RADIUS_SM, padding: '10px 18px', background: formRating ? t.INK : t.SURFACE, color: formRating ? t.PAPER : t.INK50, border: 0, cursor: formRating ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Post review</button>
        </div>
        <div style={{ marginTop: 14, display: 'grid', gap: 10 }}>
          {reviews.map(rv => (
            <div key={rv.id} style={{ borderRadius: t.RADIUS_SM, border: `1px solid ${t.HAIR}`, background: t.PAPER2, padding: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
                <span style={{ color: '#f4b860', fontSize: 13 }}>{'★★★★★'.slice(0, Math.round(rv.rating))}<span style={{ color: t.INK50 }}>{'★★★★★'.slice(0, 5 - Math.round(rv.rating))}</span></span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', color: t.INK50 }}>{(rv.author || 'You').toUpperCase()} · {new Date(rv.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
              </div>
              {rv.text && <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, lineHeight: 1.5 }}>{rv.text}</div>}
            </div>
          ))}
        </div>
      </div>

      <BSFooter right="Shape Kitchen" />
    </BSPage>
  );
}

// Aisle classification for plan-derived grocery lists — keyword → aisle, so the
// auto-built shop list is grouped the same way a nutritionist's hand-made list is.
const BS_GROCERY_AISLES = [
  { aisle: 'Produce', re: /spinach|kale|lettuce|green|tomato|pepper(?!corn)|broccoli|carrot|onion|garlic|cucumber|avocado|banana|berr|apple|orange|lemon|lime|pineapple|mango|melon|grape|potato|squash|zucchini|courgette|mushroom|celery|asparagus|cauliflower|cabbage|basil|cilantro|coriander|parsley|mint|scallion|ginger|herb|veg|fruit|salad|sprout|pea\b/i },
  { aisle: 'Protein', re: /chicken|beef|steak|mince|turkey|pork|bacon|ham|lamb|salmon|tuna|cod|fish|shrimp|prawn|tofu|tempeh|egg|whey|protein|sausage|venison/i },
  { aisle: 'Dairy & cold', re: /milk|yog(h?)urt|cheese|feta|parmesan|cottage|cream|butter|kefir|skyr|halloumi/i },
  { aisle: 'Pantry', re: /oat|rice|quinoa|couscous|barley|farro|bulgur|pasta|noodle|bread|tortilla|wrap|flour|sugar|honey|maple|syrup|oil|vinegar|cumin|paprika|cinnamon|spice|bean|lentil|chickpea|hummus|nut|peanut|almond|cashew|walnut|seed|chia|flax|granola|muesli|cereal|stock|broth|sauce|salsa|pesto|paste|coconut|chocolate|cocoa|raisin|date/i },
];
const BS_GROCERY_STAPLE = /\b(salt|pepper|cinnamon|cumin|paprika|spice|olive oil|oil|water|vinegar|stock|broth|seasoning)\b/i;
function bsGroceryAisleFor(name) {
  const n = String(name || '').toLowerCase();
  // Nut/seed butters are pantry, not dairy (the dairy "butter" match is greedy).
  if (/\b(peanut|almond|cashew|nut|sunflower|seed)\s*butter\b/.test(n)) return 'Pantry';
  for (const r of BS_GROCERY_AISLES) if (r.re.test(n)) return r.aisle;
  return 'Other';
}

// Roll the whole week's meal ingredients into one aisle-grouped grocery list,
// deduped by ingredient name. This makes the shop list literally the meals'
// ingredients, so the two always match up (no separate hardcoded list to drift).
function bsBuildPlanGrocery(program, author) {
  const byName = new Map();
  (program || []).forEach(dy => (dy.meals || []).forEach(meal => (meal.ingredients || []).forEach(ing => {
    const name = String(ing.m || '').trim();
    if (!name) return;
    const key = name.toLowerCase();
    const e = byName.get(key) || { n: name, qtys: [], meals: new Set() };
    if (ing.n) e.qtys.push(String(ing.n).trim());
    if (meal.title) e.meals.add(meal.title);
    byName.set(key, e);
  })));
  const order = ['Produce', 'Protein', 'Dairy & cold', 'Pantry', 'Other'];
  const buckets = new Map();
  [...byName.values()].forEach(e => {
    // Collapse repeated quantities ("180 g" ×3) rather than print them all.
    const counts = {};
    e.qtys.forEach(q => { counts[q] = (counts[q] || 0) + 1; });
    const distinct = Object.keys(counts);
    let q;
    if (distinct.length === 0) q = '—';
    else if (distinct.length === 1) q = counts[distinct[0]] > 1 ? `${distinct[0]} ×${counts[distinct[0]]}` : distinct[0];
    else q = distinct.slice(0, 3).join(' + ');
    const ms = [...e.meals];
    const meals = ms.length <= 2 ? ms.join(' · ') : `${ms.slice(0, 2).join(' · ')} +${ms.length - 2}`;
    const aisle = bsGroceryAisleFor(e.n);
    const list = buckets.get(aisle) || [];
    list.push({ n: e.n, q, meals: meals || '—', have: BS_GROCERY_STAPLE.test(e.n) });
    buckets.set(aisle, list);
  });
  const aisles = order
    .filter(a => buckets.has(a))
    .map(a => ({ aisle: a, items: buckets.get(a).sort((x, y) => x.n.localeCompare(y.n)) }));
  return {
    id: 'plan-week',
    name: "This week's plan",
    eyebrow: 'Auto-built from your meals',
    author: author || 'Dr. Maya Patel',
    note: '"Every item here comes straight from this week\'s meals — nothing extra, nothing missing."',
    aisles,
  };
}

function BSClientEat({ onProfile, goRadio = () => {}, goMarket = () => {} }) {
  const t = useBS();
  const bsEatProgram = useBSProgram();
  const [view, setView] = useStateBSC('eat'); // 'eat' | 'grocery' | 'library'
  const [skRecipe, setSkRecipe] = useStateBSC(null); // selected Shape Kitchen recipe
  const [previewMealId, setPreviewMealId] = useStateBSC(null);
  const [previewRecipe, setPreviewRecipe] = useStateBSC(false);
  const [previewRecipeReturnView, setPreviewRecipeReturnView] = useStateBSC('eat');
  const [previewDayBrief, setPreviewDayBrief] = useStateBSC(false);
  const [recipeLists, setRecipeLists] = useStateBSC(() => {
    try {
      const raw = window.localStorage && window.localStorage.getItem('shape.recipeGroceryLists');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [deletedGroceryIds, setDeletedGroceryIds] = useStateBSC(() => {
    try {
      const raw = window.localStorage && window.localStorage.getItem('shape.deletedGroceryIds');
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });
  const [selectedGroceryList, setSelectedGroceryList] = useStateBSC(null);
  const [newListName, setNewListName] = useStateBSC(null); // null = sheet closed
  const [saveTarget, setSaveTarget] = useStateBSC(null); // grocery list pending "save to library"
  const [saveName, setSaveName] = useStateBSC('');
  const [day, setDay] = useStateBSC(bsWeekdayIdx()); // default to today (0=Mon..6=Sun)
  const [liveProgram, setLiveProgram] = useStateBSC(null);
  // Goal label for the "Your plan" header, read from the client's nutrition prefs.
  const [planGoal, setPlanGoal] = useStateBSC('maintain');
  React.useEffect(() => {
    let cancelled = false;
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    window.shapeDb.getUserGoals('client_nutrition_prefs').then((np) => {
      if (cancelled) return;
      const raw = String((np && np.primary_goal) || '').toLowerCase();
      setPlanGoal(/fat ?loss|cut|lean|weight ?loss|shred|deficit/.test(raw) ? 'cut' : /gain|build|bulk|mass|muscle|surplus/.test(raw) ? 'build' : 'maintain');
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const planGoalLabel = planGoal === 'cut' ? 'Cutting' : planGoal === 'build' ? 'Building' : 'Maintaining';
  const [swapMealId, setSwapMealId] = useStateBSC(null);     // meal id being swapped, or null
  const [mealOverrides, setMealOverrides] = useStateBSC({}); // meal id → { title, kcal, p, c, f }
  React.useEffect(() => {
    let cancelled = false;
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    window.shapeDb.getUserGoals('client_meal_swaps').then((saved) => {
      if (!cancelled && saved && typeof saved === 'object') setMealOverrides(saved);
    }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // ── Compact builder for non-anchor days. Generates a full BSMealPreview-shaped record.
  const mk = ({ id, time, tag, tagColor, title, kcal, p, c, f, state, last, hero, brief, ingredients, steps, coachNote, prep = '10 min', portion = '1 plate', score = 'A' }) => ({
    id, time, tag, tagColor, title,
    sub: `${kcal} kcal · ${p}P · ${c}C · ${f}F`,
    state, last,
    kcal, p, c, f, prep, portion, score,
    hero, brief, ingredients, steps, coachNote,
  });

  // Build the 7-day menu from a live meal plan (days[] from /api/client/plan),
  // padding to 7 so the day strip stays stable. Presentation is derived here;
  // the API returns raw plan data. Falls back to the demo PROGRAM below.
  const buildMealProgram = (days) => {
    const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];
    const ACCENTS = [t.RUST, t.AMBER, t.BLUE];
    const SLOT_COLOR = { BFAST: t.GREEN, BREAKFAST: t.GREEN, LUNCH: t.AMBER, SNACK: t.BLUE, DINNER: t.RUST, DINR: t.RUST };
    const monday = new Date(); monday.setHours(0, 0, 0, 0);
    monday.setDate(monday.getDate() - bsWeekdayIdx(monday));
    const byDow = [null, null, null, null, null, null, null];
    const seq = [];
    for (const d of (days || [])) {
      if (Number.isInteger(d.dow) && d.dow >= 0 && d.dow <= 6 && !byDow[d.dow]) byDow[d.dow] = d;
      else seq.push(d);
    }
    for (let i = 0; i < 7 && seq.length; i++) if (!byDow[i]) byDow[i] = seq.shift();

    return byDow.map((dy, i) => {
      const date = new Date(monday); date.setDate(date.getDate() + i);
      const label = `${DOW[i]} ${date.getDate()}`;
      if (!dy) {
        return {
          d: label, kicker: 'Section · Nutrition', title: 'Open day', tag: 'OPEN',
          tagColor: t.GREEN, accent: t.GREEN, headline: 'No menu',
          meta: 'No meals planned', copy: 'No meals planned for today.', coachLine: '',
          totals: { cal: '', p: '', c: '', f: '', target: { cal: '', p: '', c: '', f: '' } },
          meals: [],
        };
      }
      const dm = Array.isArray(dy.meals) ? dy.meals : [];
      const meals = dm.map((meal, j) => {
        const slot = String(meal.slot || 'MEAL').toUpperCase();
        return mk({
          id: meal.id || `live-${i}-${j}`,
          time: meal.time || '',
          tag: slot.slice(0, 5),
          tagColor: SLOT_COLOR[slot] || t.AMBER,
          title: meal.title || 'Meal',
          kcal: meal.kcal || 0, p: meal.p || 0, c: meal.c || 0, f: meal.f || 0,
          state: meal.state, last: j === dm.length - 1,
          hero: meal.hero || '', brief: meal.brief || '',
          ingredients: (meal.ingredients || []).map((ing) => ({ n: ing.qty || '', m: ing.name || '', k: ing.kcal != null ? `${ing.kcal} kcal` : '' })),
          steps: meal.steps || [],
          coachNote: meal.coachNote || '',
          prep: meal.prep || '—', portion: meal.portion || '1 plate', score: meal.score || '—',
        });
      });
      const tot = dy.totals || {}; const tgt = dy.targets || {};
      const str = (v) => (v != null ? String(v) : '');
      return {
        d: label,
        kicker: 'Section · Nutrition',
        title: dy.title || 'Today',
        tag: String(dy.tag || 'PLAN').toUpperCase(),
        tagColor: t.AMBER,
        accent: ACCENTS[i % ACCENTS.length],
        headline: dy.title || 'Today',
        meta: `${meals.length} meal${meals.length === 1 ? '' : 's'}${tot.cal != null ? ` · ${tot.cal} kcal` : ''}`,
        copy: dy.copy || '',
        coachLine: dy.coachLine || '',
        totals: {
          cal: str(tot.cal), p: str(tot.p), c: str(tot.c), f: str(tot.f),
          target: { cal: str(tgt.cal), p: str(tgt.p), c: str(tgt.c), f: str(tgt.f) },
        },
        meals,
      };
    });
  };

  // Pull the client's assigned meal plan; fall back to the demo menu when none.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const p = await window.ShapePlan?.get?.();
        if (cancelled || !p?.meals?.hasPlan) return;
        setLiveProgram(buildMealProgram(p.meals.days));
        setDay(bsWeekdayIdx());
      } catch (e) { /* keep demo menu */ }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── 7-day menu program (demo fallback, May 8–14, 2026 — same week as Train)
  const MOCK_PROGRAM = React.useMemo(() => [
    {
      d: 'M 17',
      kicker: 'Section · Nutrition',
      title: <>Loading<br/>day.</>,
      tag: 'PEAK',
      tagColor: t.RUST,
      accent: t.RUST,
      headline: <>Big plate.<br/>Big day.</>,
      meta: '4 services · 2150 kcal',
      copy: 'Lower-push day. Carbs do the heavy lifting — fuel the squat, refill before bed. The bowl is non-negotiable.',
      totals: { cal: '2148', p: '162', c: '252', f: '64', target: { cal: '2200', p: '165', c: '260', f: '70' } },
      recipeName: <>Sweet potato<br/>chili.</>,
      recipeMeta: '6 ingredients · 35 min · Batch x4',
      recipe: {
        title: <>Sweet potato<br/>chili.</>,
        meta: '6 ingredients · 35 min · Batch x4',
        accent: t.RUST,
        kcal: 480, p: 32, c: 58, f: 14, prep: '35 min', portion: '1 bowl', score: 'A',
        hero: 'Lean ground beef, black beans, sweet potato, fire-roasted tomatoes, smoked paprika.',
        brief: 'A batch-cook chili built for heavy training weeks. Sweet potato replaces the usual cornbread carbs — sweeter, denser, kinder to the gut. Make a quadruple batch on Sunday and you eat for three days.',
        ingredients: [
          { n: '500 g', m: 'Lean ground beef 90/10', k: '900 kcal' },
          { n: '400 g', m: 'Sweet potato (cubed)',   k: '345 kcal' },
          { n: '400 g', m: 'Black beans (canned)',   k: '420 kcal' },
          { n: '400 g', m: 'Fire-roasted tomatoes',  k: '120 kcal' },
          { n: '1 tbsp',m: 'Smoked paprika',         k: '0 kcal' },
          { n: '1',     m: 'Yellow onion (diced)',   k: '40 kcal' },
        ],
        steps: [
          'Sauté onion in heavy pot with 1 tbsp oil, 4 min until translucent.',
          'Add beef, break apart, brown 6–8 min until no pink.',
          'Stir in paprika + cumin + 1 tsp salt, toast 30 sec.',
          'Add sweet potato, beans, tomatoes + 200 ml water. Simmer covered 25 min.',
          'Uncover last 5 min to thicken. Taste, season, finish with lime.',
        ],
        coachNote: 'Cook the full batch and divide into 4 containers. The flavor is better on day two — that\'s when you\'ll need it most.',
      },
      coachLine: 'Heavy day means heavy plate. If the squat felt slow, the lunch was small.',
      meals: [
        mk({ id: 'm17-bf', time: '07:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Banana oats + peanut butter', kcal: 520, p: 28, c: 78, f: 14, state: 'done',
          hero: 'Rolled oats, banana, peanut butter, milk, cinnamon.',
          brief: 'Carb-forward opener. Dense fuel for the heaviest lift of the week.',
          ingredients: [
            { n: '70 g',  m: 'Rolled oats',     k: '260 kcal' },
            { n: '1',     m: 'Banana',          k: '105 kcal' },
            { n: '20 g',  m: 'Peanut butter',   k: '120 kcal' },
            { n: '200ml', m: 'Whole milk',      k: '125 kcal' },
            { n: 'pinch', m: 'Cinnamon',        k: '0 kcal' },
          ],
          steps: ['Cook oats in milk + 100 ml water, simmer 5 min.', 'Slice banana on top.', 'Stir peanut butter through, dust cinnamon.'],
          coachNote: '70g of oats sounds like a lot. It is. Eat it all.',
        }),
        mk({ id: 'm17-ln', time: '12:30', tag: 'LUNCH', tagColor: t.AMBER, title: 'Beef + sweet potato bowl', kcal: 720, p: 52, c: 88, f: 18, state: 'done',
          hero: 'Lean ground beef, roast sweet potato, black beans, salsa, avocado.',
          brief: 'The squat-day plate. Iron + carbs + cheap-thrill flavor.',
          ingredients: [
            { n: '180 g', m: 'Lean beef 90/10', k: '320 kcal' },
            { n: '250 g', m: 'Sweet potato',    k: '215 kcal' },
            { n: '120 g', m: 'Black beans',     k: '130 kcal' },
            { n: '40 g',  m: 'Salsa',           k: '15 kcal' },
            { n: '40 g',  m: 'Avocado',         k: '60 kcal' },
          ],
          steps: ['Roast sweet potato cubes 25 min @ 220°C.', 'Brown beef with cumin + paprika, 6 min.', 'Warm beans on stovetop.', 'Plate it all, salsa + avocado last.'],
          coachNote: 'Don\'t skip the avocado — fat softens the iron absorption hit on heavy days.',
        }),
        mk({ id: 'm17-sn', time: '16:00', tag: 'SNACK', tagColor: t.BLUE, title: 'Cottage cheese + pineapple', kcal: 240, p: 26, c: 26, f: 4,
          hero: 'Low-fat cottage cheese, fresh pineapple chunks, mint.',
          brief: 'Bridge protein with fast carbs to top off glycogen pre-session.',
          ingredients: [
            { n: '200 g', m: 'Cottage cheese',  k: '160 kcal' },
            { n: '100 g', m: 'Pineapple',       k: '50 kcal' },
            { n: '4',     m: 'Mint leaves',     k: '0 kcal' },
          ],
          steps: ['Spoon cottage cheese in bowl.', 'Top with pineapple.', 'Garnish mint.'],
          coachNote: 'Pineapple bromelain helps protein breakdown. Bonus, not magic.',
        }),
        mk({ id: 'm17-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Chili + rice', kcal: 680, p: 44, c: 84, f: 16, last: true,
          hero: 'Beef-and-bean chili over jasmine rice, sour cream, scallion.',
          brief: 'Refill day. Eat slow, sleep early — Tuesday\'s push is built tonight.',
          ingredients: [
            { n: '300 g', m: 'Chili (batch)',   k: '420 kcal' },
            { n: '180 g', m: 'Cooked rice',     k: '230 kcal' },
            { n: '20 g',  m: 'Sour cream',      k: '40 kcal' },
            { n: '10 g',  m: 'Scallion',        k: '5 kcal' },
          ],
          steps: ['Reheat chili 8 min on stovetop.', 'Plate rice, ladle chili, dollop sour cream, scatter scallion.'],
          coachNote: 'Bowls of chili are designed to be batched. Make x4 on Sunday.',
        }),
      ],
    },
    {
      d: 'T 18',
      kicker: 'Section · Nutrition',
      title: <>Push<br/>fuel.</>,
      tag: 'TRAIN',
      tagColor: t.AMBER,
      accent: t.AMBER,
      headline: <>Lighter<br/>plate.</>,
      meta: '5 services · 1950 kcal',
      copy: 'Upper-push day. Slightly leaner — the press doesn\'t need 80g of oats. Hit protein, drop volume.',
      totals: { cal: '1948', p: '168', c: '198', f: '60', target: { cal: '2000', p: '165', c: '210', f: '64' } },
      recipeName: <>Smashed<br/>chickpea wrap.</>,
      recipeMeta: '5 ingredients · 8 min · Lunch hack',
      recipe: {
        title: <>Smashed<br/>chickpea wrap.</>,
        meta: '5 ingredients · 8 min · Lunch hack',
        accent: t.AMBER,
        kcal: 420, p: 22, c: 48, f: 16, prep: '8 min', portion: '1 wrap', score: 'A-',
        hero: 'Smashed chickpeas, lemon-tahini, baby spinach, red onion, whole-wheat wrap.',
        brief: 'A vegetarian lunch that lands closer to a deli sandwich than a salad. Dense, savory, no cooking required — it lives in your fridge for two days and travels well in a backpack.',
        ingredients: [
          { n: '200 g', m: 'Chickpeas (canned)',     k: '280 kcal' },
          { n: '20 g',  m: 'Tahini',                 k: '120 kcal' },
          { n: '½',     m: 'Lemon (juiced)',         k: '5 kcal' },
          { n: '40 g',  m: 'Baby spinach',           k: '10 kcal' },
          { n: '1',     m: 'Whole-wheat wrap',       k: '170 kcal' },
        ],
        steps: [
          'Drain chickpeas, smash roughly with a fork — leave half whole for texture.',
          'Stir in tahini, lemon juice, salt + pepper + a pinch of cumin.',
          'Lay wrap flat. Spinach down the center, smashed chickpea on top.',
          'Add thinly sliced red onion. Roll tight, slice on the bias.',
        ],
        coachNote: 'Press days don\'t need 700-kcal lunches. This one keeps you light without leaving you hungry by 3pm.',
      },
      coachLine: 'Press days reward leanness. Save the carb load for Friday\'s peak.',
      meals: [
        mk({ id: 't18-bf', time: '07:20', tag: 'BFAST', tagColor: t.GREEN, title: 'Egg-white scramble + toast', kcal: 380, p: 38, c: 36, f: 8, state: 'done',
          hero: 'Egg whites + 1 whole egg, sourdough toast, avocado smear.',
          brief: 'Lean opener. Lots of protein, modest carbs.',
          ingredients: [
            { n: '200 g', m: 'Egg whites',      k: '100 kcal' },
            { n: '1',     m: 'Whole egg',       k: '70 kcal' },
            { n: '60 g',  m: 'Sourdough',       k: '160 kcal' },
            { n: '20 g',  m: 'Avocado',         k: '30 kcal' },
            { n: 'pinch', m: 'Chili flake',     k: '0 kcal' },
          ],
          steps: ['Whisk eggs with salt. Cook low + slow, 4 min.', 'Toast bread, smear avocado.', 'Top toast with eggs, dust chili.'],
          coachNote: 'Cook eggs slow — high heat ruins the texture and the protein bind.',
        }),
        mk({ id: 't18-sn1', time: '10:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Apple + almond butter', kcal: 220, p: 6, c: 28, f: 11,
          hero: 'Crisp apple, 15g almond butter.',
          brief: 'Fiber + fat snack. Steady through to lunch.',
          ingredients: [
            { n: '1',    m: 'Apple',            k: '95 kcal' },
            { n: '15 g', m: 'Almond butter',    k: '90 kcal' },
          ],
          steps: ['Slice apple.', 'Dip.'],
          coachNote: 'Granny Smith holds up best to almond butter. Sweet apples get cloying.',
        }),
        mk({ id: 't18-ln', time: '12:40', tag: 'LUNCH', tagColor: t.AMBER, title: 'Chicken bowl + rice', kcal: 620, p: 48, c: 72, f: 14, state: 'next',
          hero: 'Grilled chicken thigh, jasmine rice, roasted vegetables, tahini-lemon sauce.',
          brief: 'The anchor meal of the day — biggest carb hit, biggest protein. Eat slow, finish the plate.',
          ingredients: [
            { n: '180 g', m: 'Chicken thigh',     k: '320 kcal' },
            { n: '150 g', m: 'Jasmine rice',      k: '195 kcal' },
            { n: '120 g', m: 'Roast veg medley',  k: '60 kcal' },
            { n: '15 g',  m: 'Tahini',            k: '95 kcal' },
            { n: '½',     m: 'Lemon',             k: '5 kcal' },
          ],
          steps: ['Season chicken with salt + paprika, sear 4 min/side over medium-high.', 'Cook rice 1:1.5 in salted water, cover 12 min, fluff.', 'Roast veg at 220°C / 425°F for 15 min, flipping halfway.', 'Whisk tahini + lemon + 30 ml warm water until pourable.', 'Plate rice, top with chicken + veg, drizzle sauce.'],
          coachNote: 'This is your peak fueling moment. If energy crashed yesterday, add 30 g rice today.',
        }),
        mk({ id: 't18-sn2', time: '15:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Whey + berries', kcal: 200, p: 32, c: 14, f: 2,
          hero: '30g whey, 100g frozen berries, 200ml water.',
          brief: 'Pre-session protein bridge.',
          ingredients: [
            { n: '30 g',  m: 'Whey',            k: '120 kcal' },
            { n: '100 g', m: 'Frozen berries',  k: '50 kcal' },
            { n: '200ml', m: 'Cold water',      k: '0 kcal' },
          ],
          steps: ['Blend everything 30 sec.', 'Drink immediately.'],
          coachNote: 'Frozen berries thicken the shake without bloat. Better than ice.',
        }),
        mk({ id: 't18-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Cod, rice, broccoli', kcal: 540, p: 48, c: 56, f: 14, last: true,
          hero: 'Pan-seared cod, jasmine rice, steamed broccoli, lemon.',
          brief: 'Clean-tasting recovery plate. Protein-forward, low fat.',
          ingredients: [
            { n: '180 g', m: 'Cod fillet',      k: '160 kcal' },
            { n: '160 g', m: 'Cooked rice',     k: '210 kcal' },
            { n: '150 g', m: 'Broccoli',        k: '50 kcal' },
            { n: '½',     m: 'Lemon',           k: '5 kcal' },
            { n: '5 g',   m: 'Butter',          k: '40 kcal' },
          ],
          steps: ['Pat cod dry, salt + pepper. Sear 3 min/side.', 'Steam broccoli 4 min.', 'Plate rice, fish, broccoli. Lemon last.'],
          coachNote: 'Cod is forgiving. Fillet thickness matters more than timing — go by feel.',
        }),
      ],
    },
    {
      d: 'W 19',
      kicker: 'Section · Nutrition',
      title: <>Reset<br/>plate.</>,
      tag: 'RECOV',
      tagColor: t.GREEN,
      accent: t.GREEN,
      headline: <>Slow food.<br/>Slow day.</>,
      meta: '4 services · 1750 kcal',
      copy: 'Recovery day. Cooked vegetables, simple proteins, fewer macros to chase. Eat slow, hydrate, sleep more.',
      totals: { cal: '1748', p: '142', c: '178', f: '58', target: { cal: '1800', p: '140', c: '180', f: '60' } },
      recipeName: <>Roast veg<br/>+ feta plate.</>,
      recipeMeta: '4 ingredients · 30 min · Sheet pan',
      recipe: {
        title: <>Roast veg<br/>+ feta plate.</>,
        meta: '4 ingredients · 30 min · Sheet pan',
        accent: t.GREEN,
        kcal: 380, p: 18, c: 32, f: 22, prep: '30 min', portion: '1 plate', score: 'A',
        hero: 'Cauliflower, zucchini, red pepper, feta, olive oil, oregano.',
        brief: 'A recovery-day plate that takes one tray, one bowl, and twenty minutes of inattention. The vegetables caramelize while you stretch — feta crumbles on at the end so it warms but doesn\'t melt.',
        ingredients: [
          { n: '300 g', m: 'Cauliflower florets',    k: '75 kcal' },
          { n: '200 g', m: 'Zucchini (chunks)',      k: '35 kcal' },
          { n: '1',     m: 'Red bell pepper',        k: '40 kcal' },
          { n: '80 g',  m: 'Feta',                   k: '230 kcal' },
        ],
        steps: [
          'Heat oven to 220°C / 425°F. Line a sheet pan.',
          'Toss veg with 2 tbsp olive oil, 1 tsp salt, 1 tsp dried oregano.',
          'Spread in a single layer. Roast 25 min, no flipping.',
          'Plate hot. Crumble feta over while still steaming. Crack pepper.',
        ],
        coachNote: 'Sleep day. Don\'t over-engineer dinner. This plate gives you everything you need and nothing extra.',
      },
      coachLine: 'A boring plate is a feature, not a bug. The body does the loud work overnight.',
      meals: [
        mk({ id: 'w19-bf', time: '08:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Yogurt + granola + honey', kcal: 380, p: 24, c: 48, f: 10, state: 'done',
          hero: 'Greek yogurt, oat granola, honey, walnuts.',
          brief: 'Easy opener on a no-train day. No rush.',
          ingredients: [
            { n: '200 g', m: 'Greek yogurt',    k: '180 kcal' },
            { n: '40 g',  m: 'Oat granola',     k: '160 kcal' },
            { n: '1 tsp', m: 'Honey',           k: '20 kcal' },
            { n: '5 g',   m: 'Walnuts',         k: '32 kcal' },
          ],
          steps: ['Spoon yogurt into bowl.', 'Top with granola + walnuts.', 'Drizzle honey.'],
          coachNote: 'Pick a granola without added sugar. Read the label.',
        }),
        mk({ id: 'w19-ln', time: '12:30', tag: 'LUNCH', tagColor: t.AMBER, title: 'Tuna, white bean, lemon', kcal: 480, p: 44, c: 38, f: 16, state: 'done',
          hero: 'Tuna, white beans, parsley, lemon, olive oil, red onion.',
          brief: 'No-cook lunch. Pantry-pull.',
          ingredients: [
            { n: '120 g', m: 'Tuna in water',   k: '130 kcal' },
            { n: '180 g', m: 'White beans',     k: '180 kcal' },
            { n: '15 g',  m: 'Olive oil',       k: '120 kcal' },
            { n: '½',     m: 'Lemon',           k: '5 kcal' },
            { n: '20 g',  m: 'Red onion',       k: '8 kcal' },
          ],
          steps: ['Drain tuna + beans.', 'Toss with olive oil, lemon, parsley, red onion.', 'Salt + pepper to taste.'],
          coachNote: 'Use the good oil here — half the meal is dressing.',
        }),
        mk({ id: 'w19-sn', time: '16:00', tag: 'SNACK', tagColor: t.BLUE, title: 'Skyr + chia', kcal: 180, p: 26, c: 14, f: 4,
          hero: '170 g skyr, 10 g chia, drop of vanilla.',
          brief: 'Slow-protein snack. Sets up dinner.',
          ingredients: [
            { n: '170 g', m: 'Skyr',            k: '120 kcal' },
            { n: '10 g',  m: 'Chia seeds',      k: '50 kcal' },
            { n: 'drop',  m: 'Vanilla',         k: '0 kcal' },
          ],
          steps: ['Stir chia into skyr.', 'Let bloom 10 min.'],
          coachNote: 'Skyr is denser than Greek yogurt. Same protein, fewer calories.',
        }),
        mk({ id: 'w19-dn', time: '19:00', tag: 'DINR', tagColor: t.RUST, title: 'Roast veg + feta plate', kcal: 580, p: 32, c: 52, f: 28, last: true,
          hero: 'Sheet-roast vegetables (zucchini, peppers, fennel), feta, olives, sourdough.',
          brief: 'The recovery plate. Mediterranean default.',
          ingredients: [
            { n: '400 g', m: 'Mixed veg',       k: '180 kcal' },
            { n: '60 g',  m: 'Feta',            k: '160 kcal' },
            { n: '30 g',  m: 'Olives',          k: '90 kcal' },
            { n: '60 g',  m: 'Sourdough',       k: '160 kcal' },
          ],
          steps: ['Toss veg with olive oil, salt. Roast 220°C/425°F for 22 min.', 'Plate. Crumble feta, scatter olives.', 'Toast bread, serve alongside.'],
          coachNote: 'Sheet pan is the laziest hero. Use it twice a week.',
        }),
      ],
    },
    {
      d: 'T 20',
      kicker: 'Section · Nutrition',
      title: <>Pull<br/>fuel.</>,
      tag: 'TRAIN',
      tagColor: t.AMBER,
      accent: t.RUST,
      headline: <>Bigger<br/>protein.</>,
      meta: '5 services · 2050 kcal',
      copy: 'Lower-pull day. Deadlift demands the most from the posterior chain — protein high, fats moderate, carbs to refill.',
      totals: { cal: '2048', p: '178', c: '218', f: '62', target: { cal: '2100', p: '180', c: '220', f: '65' } },
      recipeName: <>Steak +<br/>jasmine rice.</>,
      recipeMeta: '4 ingredients · 12 min · Pan-sear',
      recipe: {
        title: <>Steak +<br/>jasmine rice.</>,
        meta: '4 ingredients · 12 min · Pan-sear',
        accent: t.RUST,
        kcal: 640, p: 52, c: 64, f: 22, prep: '12 min', portion: '1 plate', score: 'A',
        hero: 'Sirloin steak, jasmine rice, charred scallion, soy-butter pan sauce.',
        brief: 'Deadlift days are protein days. Sear hot, rest properly, slice against the grain. The pan sauce is non-negotiable — you earned it.',
        ingredients: [
          { n: '200 g', m: 'Sirloin steak',          k: '440 kcal' },
          { n: '160 g', m: 'Jasmine rice (cooked)',  k: '210 kcal' },
          { n: '4',     m: 'Scallions',              k: '15 kcal' },
          { n: '15 g',  m: 'Butter + soy',           k: '110 kcal' },
        ],
        steps: [
          'Salt steak heavily 40 min before cooking. Pat dry just before pan.',
          'Cast iron, screaming hot, neutral oil. Sear 2:30 each side for medium-rare.',
          'Pull steak. Rest 6 min on a board. Don\'t skip this.',
          'Same pan: scallions 30 sec, off heat add butter + 1 tbsp soy.',
          'Slice steak against grain, plate over rice, spoon pan sauce.',
        ],
        coachNote: 'Hinge work is the most demanding lift you do. Earn the steak, then eat the steak.',
      },
      coachLine: 'Hinges chew protein. Don\'t leave any on the plate.',
      meals: [
        mk({ id: 'r20-bf', time: '07:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Three-egg + oat scramble', kcal: 520, p: 38, c: 48, f: 18, state: 'done',
          hero: 'Three eggs, oat porridge side, hot sauce.',
          brief: 'Big breakfast for the heaviest pull of the cycle.',
          ingredients: [
            { n: '3',     m: 'Whole eggs',      k: '210 kcal' },
            { n: '60 g',  m: 'Rolled oats',     k: '220 kcal' },
            { n: '5 g',   m: 'Butter',          k: '40 kcal' },
            { n: 'dash',  m: 'Hot sauce',       k: '0 kcal' },
            { n: '50 g',  m: 'Spinach',         k: '12 kcal' },
          ],
          steps: ['Cook oats in 250 ml water, simmer 5 min.', 'Whisk eggs, soft-scramble in butter.', 'Wilt spinach in pan, fold in.', 'Serve oats alongside.'],
          coachNote: 'Eat both. The oats fuel the lift, the eggs fuel the recovery.',
        }),
        mk({ id: 'r20-sn1', time: '10:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Whey + banana', kcal: 240, p: 28, c: 32, f: 2,
          hero: '30g whey, 1 banana, 240 ml water.',
          brief: 'Topping off pre-deadlift.',
          ingredients: [
            { n: '30 g',  m: 'Whey',            k: '120 kcal' },
            { n: '1',     m: 'Banana',          k: '105 kcal' },
            { n: '240ml', m: 'Cold water',      k: '0 kcal' },
          ],
          steps: ['Blend or shake.', 'Drink 90 min before pulling.'],
          coachNote: 'Banana sugars hit fast. Time it within 90 min of the lift.',
        }),
        mk({ id: 'r20-ln', time: '13:00', tag: 'LUNCH', tagColor: t.AMBER, title: 'Steak + rice + slaw', kcal: 700, p: 56, c: 68, f: 20, state: 'next',
          hero: 'Pan-seared sirloin, jasmine rice, cabbage slaw.',
          brief: 'The post-pull plate. Iron + carbs + crunch.',
          ingredients: [
            { n: '180 g', m: 'Sirloin',         k: '380 kcal' },
            { n: '140 g', m: 'Cooked rice',     k: '180 kcal' },
            { n: '100 g', m: 'Cabbage slaw',    k: '60 kcal' },
            { n: '10 g',  m: 'Sesame oil',      k: '90 kcal' },
          ],
          steps: ['Season steak with salt. Sear 3 min/side, rest 5 min.', 'Cook rice 1:1.5 in salted water, 12 min.', 'Slice steak against grain, plate over rice with slaw.'],
          coachNote: 'Rest the steak. Cutting hot meat costs you 20% of the moisture.',
        }),
        mk({ id: 'r20-sn2', time: '16:30', tag: 'SNACK', tagColor: t.BLUE, title: 'Cottage cheese + peach', kcal: 210, p: 24, c: 22, f: 4,
          hero: '200 g cottage cheese, ½ peach, mint.',
          brief: 'Slow protein into the evening.',
          ingredients: [
            { n: '200 g', m: 'Cottage cheese',  k: '160 kcal' },
            { n: '½',     m: 'Peach',           k: '30 kcal' },
            { n: '4',     m: 'Mint leaves',     k: '0 kcal' },
          ],
          steps: ['Spoon cottage cheese.', 'Slice peach over.', 'Mint last.'],
          coachNote: 'Peach pairs with the cottage cheese tang. Don\'t skip the mint.',
        }),
        mk({ id: 'r20-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Pasta + meat sauce', kcal: 620, p: 42, c: 78, f: 14, last: true,
          hero: 'Whole-wheat pasta, lean ground beef sauce, parmesan.',
          brief: 'Carb-refill dinner. Sleep on it.',
          ingredients: [
            { n: '120 g', m: 'WW pasta (dry)',  k: '420 kcal' },
            { n: '150 g', m: 'Beef sauce',      k: '240 kcal' },
            { n: '15 g',  m: 'Parmesan',        k: '60 kcal' },
            { n: '5 g',   m: 'Basil',           k: '0 kcal' },
          ],
          steps: ['Cook pasta to al dente.', 'Reheat sauce.', 'Toss together, top with parmesan + basil.'],
          coachNote: 'Whole-wheat pasta wins on fiber. Cook it 1 min longer than the box says.',
        }),
      ],
    },
    {
      // ── F 21 — Friday peak day. Full detail. ──
      d: 'F 21',
      kicker: 'Section · Nutrition',
      title: <>The<br/>menu.</>,
      tag: 'PEAK',
      tagColor: t.AMBER,
      accent: t.AMBER,
      headline: <>Pull day.<br/>Full plates.</>,
      meta: '5 services · 3 logged',
      copy: 'Peak pull day. Anchor lunch, slow protein into the evening, no surprises before the lift.',
      totals: { cal: '1568', p: '118', c: '186', f: '52', target: { cal: '2100', p: '165', c: '240', f: '68' } },
      recipeName: <>Tahini chicken<br/>bowl.</>,
      recipeMeta: '5 ingredients · 18 min · By Maya P.',
      recipe: {
        title: <>Tahini chicken<br/>bowl.</>,
        meta: '5 ingredients · 18 min · By Maya P.',
        accent: t.AMBER,
        kcal: 620, p: 48, c: 72, f: 14, prep: '18 min', portion: '1 bowl', score: 'A',
        hero: 'Grilled chicken thigh, jasmine rice, roasted veg, tahini-lemon, sumac.',
        brief: 'Maya\'s template lunch — high-protein, mid-fat, carb-anchored. Build it once, then swap the protein and the veg without losing the macros.',
        ingredients: [
          { n: '180 g', m: 'Chicken thigh',          k: '320 kcal' },
          { n: '150 g', m: 'Jasmine rice',           k: '195 kcal' },
          { n: '120 g', m: 'Roast veg medley',       k: '60 kcal' },
          { n: '15 g',  m: 'Tahini',                 k: '95 kcal' },
          { n: '½',     m: 'Lemon',                  k: '5 kcal' },
        ],
        steps: [
          'Salt + paprika the chicken. Sear 4 min/side over medium-high.',
          'Cook rice 1:1.5 in salted water, cover 12 min, fluff.',
          'Roast veg at 220°C / 425°F for 15 min, flipping halfway.',
          'Whisk tahini + lemon + 30 ml warm water until pourable.',
          'Plate rice, top with chicken + veg, drizzle, dust sumac.',
        ],
        coachNote: 'This is the day-of-pulls anchor meal. If you\'re lifting heavy at 18:00, eat this at 12:30 — not later.',
      },
      coachLine: 'Five plates. Three logged before noon. Don\'t coast through the afternoon — refill at 16:00.',
      meals: [
    { id: 'bfast',  time: '07:20', tag: 'BFAST', tagColor: t.GREEN, title: 'Oats, berries, whey',     sub: '412 kcal · 32P · 58C · 8F',  state: 'done',
      kcal: 412, p: 32, c: 58, f: 8,  prep: '6 min', portion: '1 bowl', score: 'A',
      hero: 'Steel-cut oats, frozen mixed berries, vanilla whey, chia, walnuts.',
      brief: 'A solid Tuesday opener — slow carbs to fuel the morning pull session, 30+ g protein to start MPS early.',
      ingredients: [
        { n: '50 g',  m: 'Steel-cut oats',     k: '180 kcal' },
        { n: '120 g', m: 'Mixed berries',      k: '60 kcal' },
        { n: '30 g',  m: 'Vanilla whey',       k: '120 kcal' },
        { n: '10 g',  m: 'Chia seeds',         k: '50 kcal' },
        { n: '8 g',   m: 'Walnuts',            k: '52 kcal' },
      ],
      steps: [
        'Cook oats in 250 ml water — simmer 4 min, stir occasionally.',
        'Off heat: stir in chia, let bloom 1 min.',
        'Whisk whey with 60 ml cold water, fold into oats once cooled slightly.',
        'Top with berries + chopped walnuts.',
      ],
      coachNote: 'Eat within 30 min of waking on training days. Cap whey at 30g — more goes to oxidation.',
    },
    { id: 'snack1', time: '10:30', tag: 'SNACK', tagColor: t.BLUE,  title: 'Whey shake',              sub: '156 kcal · 28P',              state: 'done',
      kcal: 156, p: 28, c: 4, f: 2, prep: '2 min', portion: '1 shake', score: 'A',
      hero: '30 g whey, 240 ml water, ice, pinch of salt.',
      brief: 'Bridge protein — keeps MPS elevated between breakfast and lunch.',
      ingredients: [
        { n: '30 g',  m: 'Vanilla whey',       k: '120 kcal' },
        { n: '240ml', m: 'Cold water',         k: '0 kcal' },
        { n: '1 cup', m: 'Ice',                k: '0 kcal' },
        { n: 'pinch', m: 'Sea salt',           k: '0 kcal' },
      ],
      steps: [
        'Shaker bottle. Water first, then powder.',
        'Shake 15 seconds, drink immediately.',
      ],
      coachNote: 'Salt helps electrolyte balance — especially on training days. No need for extras.',
    },
    { id: 'lunch',  time: '12:40', tag: 'LUNCH', tagColor: t.AMBER, title: 'Chicken bowl + rice',     sub: '620 kcal · 48P · 72C · 14F',  state: 'next',
      kcal: 620, p: 48, c: 72, f: 14, prep: '15 min', portion: '1 bowl', score: 'A',
      hero: 'Grilled chicken thigh, jasmine rice, roasted vegetables, tahini-lemon sauce.',
      brief: 'The anchor meal of the day — biggest carb hit, biggest protein. Eat slow, finish the plate.',
      ingredients: [
        { n: '180 g', m: 'Chicken thigh',      k: '320 kcal' },
        { n: '150 g', m: 'Jasmine rice',       k: '195 kcal' },
        { n: '120 g', m: 'Roast veg medley',   k: '60 kcal' },
        { n: '15 g',  m: 'Tahini',             k: '95 kcal' },
        { n: '½',     m: 'Lemon',              k: '5 kcal' },
      ],
      steps: [
        'Season chicken with salt + paprika, sear 4 min/side over medium-high.',
        'Cook rice 1:1.5 in salted water, cover 12 min, fluff.',
        'Roast veg at 220°C / 425°F for 15 min, flipping halfway.',
        'Whisk tahini + lemon + 30 ml warm water until pourable.',
        'Plate rice, top with chicken + veg, drizzle sauce.',
      ],
      coachNote: 'This is your peak fueling moment. If energy crashed yesterday, add 30 g rice today.',
    },
    { id: 'snack2', time: '16:00', tag: 'SNACK', tagColor: t.BLUE,  title: 'Greek yogurt + almonds',  sub: '280 kcal · 22P · 18C · 12F',
      kcal: 280, p: 22, c: 18, f: 12, prep: '1 min', portion: '1 cup', score: 'B+',
      hero: '200 g full-fat Greek yogurt, 15 g raw almonds, drizzle of honey.',
      brief: 'Pre-evening snack — slows the protein drip into the night meal.',
      ingredients: [
        { n: '200 g', m: 'Greek yogurt 5%',    k: '180 kcal' },
        { n: '15 g',  m: 'Raw almonds',        k: '90 kcal' },
        { n: '1 tsp', m: 'Honey',              k: '20 kcal' },
      ],
      steps: [
        'Spoon yogurt into bowl.',
        'Crush almonds lightly, scatter.',
        'Drizzle honey, eat slowly.',
      ],
      coachNote: 'Use full-fat yogurt — it keeps you fuller longer and fits the day fat target perfectly.',
    },
    { id: 'dinner', time: '19:30', tag: 'DINR',  tagColor: t.RUST,  title: 'Salmon, quinoa, greens',  sub: '580 kcal · 44P · 48C · 22F',  last: true,
      kcal: 580, p: 44, c: 48, f: 22, prep: '20 min', portion: '1 plate', score: 'A',
      hero: 'Pan-seared salmon, lemon quinoa, sautéed kale + garlic.',
      brief: 'Closes the day — omega-3s for recovery, slow carbs to set up tomorrow.',
      ingredients: [
        { n: '180 g', m: 'Salmon fillet',      k: '320 kcal' },
        { n: '120 g', m: 'Cooked quinoa',      k: '140 kcal' },
        { n: '200 g', m: 'Kale',               k: '70 kcal' },
        { n: '2 cl',  m: 'Garlic',             k: '10 kcal' },
        { n: '1 tbsp',m: 'Olive oil',          k: '120 kcal' },
      ],
      steps: [
        'Pat salmon dry. Salt + pepper. Skin-side down 4 min, flip 2 min.',
        'Quinoa: 1:2 water, simmer covered 12 min. Squeeze lemon to finish.',
        'Sauté garlic in oil 30 sec. Toss in kale, cook until just wilted.',
        'Plate quinoa + greens, top with salmon.',
      ],
      coachNote: 'Try to finish dinner ≥ 2.5 hr before bed for sleep quality. Lemon on the quinoa is non-negotiable.',
    },
      ],
    },
    {
      d: 'S 22',
      kicker: 'Section · Nutrition',
      title: <>Carb<br/>load.</>,
      tag: 'COND',
      tagColor: t.RUST,
      accent: t.RUST,
      headline: <>Threshold<br/>fuel.</>,
      meta: '4 services · 1900 kcal',
      copy: 'Conditioning day. Carbs front-loaded — fuel the intervals, recover with protein. Skip the heavy fats early.',
      totals: { cal: '1898', p: '128', c: '232', f: '50', target: { cal: '1950', p: '130', c: '240', f: '52' } },
      recipeName: <>Honey-soy<br/>salmon rice bowl.</>,
      recipeMeta: '5 ingredients · 16 min · Bowl',
      recipe: {
        title: <>Honey-soy<br/>salmon rice bowl.</>,
        meta: '5 ingredients · 16 min · Bowl',
        accent: t.RUST,
        kcal: 560, p: 38, c: 64, f: 18, prep: '16 min', portion: '1 bowl', score: 'A',
        hero: 'Salmon, jasmine rice, cucumber ribbons, honey-soy glaze, sesame.',
        brief: 'A conditioning-day bowl built for fast turnaround. Glaze caramelizes on the salmon in three minutes; rice carries it. Cool cucumber resets your palate between bites.',
        ingredients: [
          { n: '180 g', m: 'Salmon fillet',          k: '320 kcal' },
          { n: '150 g', m: 'Jasmine rice',           k: '195 kcal' },
          { n: '½',     m: 'Cucumber',               k: '8 kcal' },
          { n: '20 g',  m: 'Honey + soy (1:2)',      k: '30 kcal' },
          { n: '5 g',   m: 'Toasted sesame',         k: '30 kcal' },
        ],
        steps: [
          'Whisk honey + soy + 1 tsp rice vinegar + grated ginger.',
          'Pat salmon dry. Sear skin-side 3 min, flip, brush glaze, 2 min.',
          'Off heat: brush again, let glaze tighten on the fish.',
          'Bowl rice, ribbon the cucumber over, lay salmon on top.',
          'Pour residual glaze, scatter sesame.',
        ],
        coachNote: 'Eat within 60 minutes of finishing the intervals. Carbs + protein, in that order, in that ratio.',
      },
      coachLine: 'Threshold work eats glycogen. Carb in, carb out — protein is the bookend.',
      meals: [
        mk({ id: 's22-bf', time: '07:30', tag: 'BFAST', tagColor: t.GREEN, title: 'Banana-honey toast + eggs', kcal: 480, p: 28, c: 62, f: 12, state: 'done',
          hero: 'Sourdough toast, banana, honey, two soft-boiled eggs.',
          brief: 'Carbs first. Threshold reps don\'t wait.',
          ingredients: [
            { n: '60 g', m: 'Sourdough',    k: '160 kcal' },
            { n: '1',    m: 'Banana',       k: '105 kcal' },
            { n: '1 tsp',m: 'Honey',        k: '20 kcal' },
            { n: '2',    m: 'Eggs',         k: '140 kcal' },
            { n: 'pinch',m: 'Sea salt',     k: '0 kcal' },
          ],
          steps: ['Boil eggs 6 min, cold-shock.', 'Toast bread, slice banana over, drizzle honey.', 'Halve eggs alongside, salt.'],
          coachNote: 'Eat 90 min before warm-up. The carbs need time to hit.',
        }),
        mk({ id: 's22-sn', time: '11:00', tag: 'SNACK', tagColor: t.BLUE, title: 'Dates + espresso', kcal: 180, p: 4, c: 38, f: 1,
          hero: '3 medjool dates, double espresso.',
          brief: 'Pre-session caffeine + glucose. The cyclist\'s breakfast.',
          ingredients: [
            { n: '3',     m: 'Medjool dates', k: '180 kcal' },
            { n: '60ml',  m: 'Espresso',     k: '0 kcal' },
          ],
          steps: ['Eat dates 30 min before warm-up.', 'Sip espresso 15 min before.'],
          coachNote: 'Caffeine 30-45 min pre-effort. Earlier is wasted.',
        }),
        mk({ id: 's22-ln', time: '13:30', tag: 'LUNCH', tagColor: t.AMBER, title: 'Honey-soy salmon rice bowl', kcal: 660, p: 48, c: 78, f: 16, state: 'next',
          hero: 'Glazed salmon, jasmine rice, edamame, cucumber, sesame.',
          brief: 'Post-threshold refill. Glycogen window owed, sodium owed.',
          ingredients: [
            { n: '180 g', m: 'Salmon',         k: '320 kcal' },
            { n: '180 g', m: 'Cooked rice',    k: '230 kcal' },
            { n: '80 g',  m: 'Edamame',        k: '90 kcal' },
            { n: '60 g',  m: 'Cucumber',       k: '10 kcal' },
            { n: '15 g',  m: 'Soy + honey',    k: '40 kcal' },
          ],
          steps: ['Whisk soy + honey + grated ginger.', 'Sear salmon 4 min/side, glaze in pan last 30 sec.', 'Plate rice, salmon, edamame, cucumber. Sesame on top.'],
          coachNote: 'Glaze at the end, not the start. Sugar burns fast.',
        }),
        mk({ id: 's22-dn', time: '19:30', tag: 'DINR', tagColor: t.RUST, title: 'Pho — beef + rice noodles', kcal: 580, p: 38, c: 72, f: 12, last: true,
          hero: 'Beef pho with rice noodles, basil, lime, sriracha.',
          brief: 'Sodium + carbs + collagen. The Saturday-night dinner.',
          ingredients: [
            { n: '500ml', m: 'Beef broth',     k: '60 kcal' },
            { n: '120 g', m: 'Beef sirloin',   k: '240 kcal' },
            { n: '120 g', m: 'Rice noodles',   k: '180 kcal' },
            { n: '20 g',  m: 'Basil + lime',   k: '5 kcal' },
            { n: 'dash',  m: 'Fish sauce',     k: '5 kcal' },
          ],
          steps: ['Heat broth to simmer, season with fish sauce.', 'Cook noodles 3 min.', 'Slice raw beef thin, ladle hot broth over to cook.', 'Top with herbs, lime, sriracha to taste.'],
          coachNote: 'Pho replaces a lot of what threshold work loses. It\'s a recovery tool, not a treat.',
        }),
      ],
    },
    {
      d: 'S 23',
      kicker: 'Section · Nutrition',
      title: <>Easy<br/>plate.</>,
      tag: 'REST',
      tagColor: t.GREEN,
      accent: t.GREEN,
      headline: <>Sunday<br/>simple.</>,
      meta: '3 services · 1650 kcal',
      copy: 'Full rest day. Three meals, no snacks needed. Cook one thing well, eat slowly, sleep early.',
      totals: { cal: '1648', p: '128', c: '162', f: '60', target: { cal: '1700', p: '130', c: '170', f: '62' } },
      recipeName: <>Slow-roast<br/>chicken thighs.</>,
      recipeMeta: '4 ingredients · 50 min · Sunday batch',
      recipe: {
        title: <>Slow-roast<br/>chicken thighs.</>,
        meta: '4 ingredients · 50 min · Sunday batch',
        accent: t.GREEN,
        kcal: 380, p: 42, c: 4, f: 22, prep: '50 min', portion: '2 thighs', score: 'A',
        hero: 'Bone-in, skin-on chicken thighs. Lemon. Garlic. Salt. Time.',
        brief: 'The Sunday batch. Set the oven, get on with your day. The thighs render fat onto themselves and the skin shatters when it cools. Eat one tonight, four through the week.',
        ingredients: [
          { n: '6',     m: 'Bone-in skin-on thighs', k: '1620 kcal' },
          { n: '1',     m: 'Lemon (sliced)',         k: '15 kcal' },
          { n: '1 head',m: 'Garlic',                 k: '50 kcal' },
          { n: '1 tbsp',m: 'Coarse salt',            k: '0 kcal' },
        ],
        steps: [
          'Heat oven to 180°C / 350°F. Pat thighs very dry.',
          'Salt heavily, especially the skin. Don\'t skimp.',
          'Lay thighs skin-up over halved garlic head + lemon slices.',
          'Roast 50 min until skin is deep amber and shatters when tapped.',
          'Rest 10 min. Save the rendered fat — that\'s flavor for the week.',
        ],
        coachNote: 'Sunday cooking is a training tool. The protein you make today is the recovery you eat through Wednesday.',
      },
      coachLine: 'Rest day is a cooking day. Make the protein for Monday now.',
      meals: [
        mk({ id: 's23-bf', time: '09:00', tag: 'BFAST', tagColor: t.GREEN, title: 'Veggie omelette + sourdough', kcal: 480, p: 32, c: 36, f: 22, state: 'done',
          hero: 'Three-egg omelette with peppers, onion, feta, sourdough side.',
          brief: 'Slow Sunday breakfast. No clock.',
          ingredients: [
            { n: '3',     m: 'Eggs',          k: '210 kcal' },
            { n: '50 g',  m: 'Bell pepper',   k: '15 kcal' },
            { n: '30 g',  m: 'Red onion',     k: '12 kcal' },
            { n: '30 g',  m: 'Feta',          k: '80 kcal' },
            { n: '60 g',  m: 'Sourdough',     k: '160 kcal' },
          ],
          steps: ['Sauté veg in pan 4 min.', 'Whisk eggs, pour over, low heat 5 min.', 'Crumble feta, fold, plate with toast.'],
          coachNote: 'Cook the omelette low. Eggs over high heat ruin the texture and the whole vibe.',
        }),
        mk({ id: 's23-ln', time: '13:00', tag: 'LUNCH', tagColor: t.AMBER, title: 'Slow-roast chicken + greens', kcal: 580, p: 52, c: 38, f: 22, state: 'done',
          hero: 'Roast chicken thighs, herby greens, crusty bread.',
          brief: 'The recovery anchor. Batch the chicken for the week.',
          ingredients: [
            { n: '300 g', m: 'Chicken thighs', k: '480 kcal' },
            { n: '120 g', m: 'Mixed greens',   k: '30 kcal' },
            { n: '15 g',  m: 'Olive oil',      k: '120 kcal' },
            { n: '40 g',  m: 'Sourdough',      k: '110 kcal' },
            { n: '½',     m: 'Lemon',          k: '5 kcal' },
          ],
          steps: ['Salt thighs, roast 200°C/400°F skin-up for 35 min.', 'Toss greens with olive oil + lemon.', 'Plate, tear bread, spoon pan drippings over greens.'],
          coachNote: 'Roast x4 of the chicken — Monday, Tuesday lunches sorted.',
        }),
        mk({ id: 's23-dn', time: '19:00', tag: 'DINR', tagColor: t.RUST, title: 'Tomato soup + grilled cheese', kcal: 590, p: 26, c: 64, f: 24, last: true,
          hero: 'Roasted tomato soup, sharp cheddar grilled cheese on sourdough.',
          brief: 'The comfort plate. Don\'t apologize for it.',
          ingredients: [
            { n: '400 g', m: 'Roasted tomato', k: '120 kcal' },
            { n: '50 g',  m: 'Sharp cheddar',  k: '200 kcal' },
            { n: '60 g',  m: 'Sourdough',      k: '160 kcal' },
            { n: '15 g',  m: 'Butter',         k: '110 kcal' },
          ],
          steps: ['Blend roasted tomato with garlic + basil + warm stock.', 'Butter bread, sandwich cheese, grill 3 min/side.', 'Serve hot, soup deep, sandwich cut diagonal.'],
          coachNote: 'Sunday dinner is the antidote. Eat it without phones.',
        }),
      ],
    },
  ], [t]);

  const PROGRAM = liveProgram || MOCK_PROGRAM;
  const recipeArchive = PROGRAM
    .filter(p => p.recipe)
    .map((p, idx) => ({
      idx,
      date: p.d,
      title: bsNodeText(p.recipe.title).replace(/\s+/g, ' ').trim(),
      meta: p.recipe.meta,
      recipe: p.recipe,
    }));

  const makeRecipeList = (recipe, dayLabel) => {
    const title = bsNodeText(recipe.title).replace(/\s+/g, ' ').trim();
    return {
      id: bsRecipeListId(recipe, dayLabel),
      name: `${title} grocery list`,
      kind: 'recipe',
      date: dayLabel,
      eyebrow: `Recipe of the day - ${dayLabel}`,
      usedCount: 1,
      preview: recipe.ingredients.slice(0, 3).map(i => i.m).join(' - '),
      count: recipe.ingredients.length,
      items: recipe.ingredients.map((ing, idx) => ({
        id: `${bsRecipeListId(recipe, dayLabel)}-${idx}`,
        n: ing.m,
        q: ing.n,
        meals: title,
        k: ing.k,
      })),
    };
  };

  const addRecipeToGrocery = (recipe, dayLabel) => {
    if (!recipe) return;
    const list = makeRecipeList(recipe, dayLabel);
    setRecipeLists(prev => {
      const without = prev.filter(l => l.id !== list.id);
      return [list, ...without];
    });
    window.__bsToast?.('Recipe grocery list added', 'ok');
  };

  // Itemize a Shape Kitchen recipe (string ingredients) into a saved grocery list.
  const addSKRecipeToGrocery = (recipe) => {
    if (!recipe) return;
    const id = 'sk-' + bsSkSlug(recipe.title);
    const items = (recipe.ingredients || []).map((ing, idx) => {
      const p = bsSkParseIngredient(ing);
      return { id: `${id}-${idx}`, n: p.n, q: p.q, meals: recipe.title };
    });
    const list = { id, name: `${recipe.title} grocery list`, kind: 'recipe', eyebrow: `Shape Kitchen · ${recipe.byRole}`, usedCount: 1, preview: items.slice(0, 3).map(i => i.n).join(' · '), count: items.length, items };
    setRecipeLists(prev => [list, ...prev.filter(l => l.id !== id)]);
    window.__bsToast?.('Added to grocery list', 'ok');
    return list;
  };
  // From the Recipe box: build this recipe's OWN list and open it.
  const sendRecipeToGrocery = (recipe) => {
    const list = addSKRecipeToGrocery(recipe);
    if (list) loadGroceryList(list);
  };

  // Cross-device sync: saved grocery lists ride in user_goals('client_grocery_lists').
  // Load once on mount + merge any server-only lists; only push to the server after
  // that initial merge so we don't clobber it with the local-only copy.
  const grocSyncedRef = React.useRef(false);
  React.useEffect(() => {
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) { grocSyncedRef.current = true; return undefined; }
    let cancelled = false;
    window.shapeDb.getUserGoals('client_grocery_lists').then(saved => {
      if (cancelled || !Array.isArray(saved)) return;
      setRecipeLists(prev => {
        const have = new Set(prev.map(l => l.id));
        const extra = saved.filter(l => l && l.id && !have.has(l.id) && !deletedGroceryIds.includes(l.id));
        return extra.length ? [...extra, ...prev] : prev;
      });
    }).catch(() => {}).finally(() => { grocSyncedRef.current = true; });
    return () => { cancelled = true; };
  }, []);

  React.useEffect(() => {
    try {
      window.localStorage && window.localStorage.setItem('shape.recipeGroceryLists', JSON.stringify(recipeLists));
    } catch {}
    if (grocSyncedRef.current && window.shapeDb?.saveUserGoals) { try { window.shapeDb.saveUserGoals('client_grocery_lists', recipeLists); } catch (e) {} }
  }, [recipeLists]);

  React.useEffect(() => {
    try {
      window.localStorage && window.localStorage.setItem('shape.deletedGroceryIds', JSON.stringify(deletedGroceryIds));
    } catch {}
  }, [deletedGroceryIds]);

  const cur = PROGRAM[day] || PROGRAM[0];
  const days = PROGRAM.map(p => p.d);
  const meals = cur.meals;
  // The default shop list is built straight from the week's meal ingredients, so
  // it always matches what the meals show. A user-selected list takes precedence.
  const planGrocery = React.useMemo(() => bsBuildPlanGrocery(PROGRAM), [PROGRAM]);
  const activeGroceryList = selectedGroceryList || planGrocery;
  const activeGroceryCount = activeGroceryList.aisles
    ? activeGroceryList.aisles.reduce((sum, aisle) => sum + aisle.items.length, 0)
    : activeGroceryList.count || 0;
  const loadGroceryList = (list) => {
    setSelectedGroceryList(bsNormalizeGroceryList(list));
    setView('grocery');
  };

  // Open a library list as an editable grocery view. For built-in lists this
  // also seeds an editable copy into recipeLists so edits persist.
  const editGroceryList = (list) => {
    const normalized = { ...bsNormalizeGroceryList(list), editable: true };
    setSelectedGroceryList(normalized);
    if (!recipeLists.some(l => l.id === list.id)) {
      const items = list.items || bsLibraryPreviewItems(list);
      setRecipeLists(prev => [{ ...list, editable: true, items }, ...prev]);
    } else {
      setRecipeLists(prev => prev.map(l => l.id === list.id ? { ...l, editable: true } : l));
    }
    setView('grocery');
    window.__bsToast?.(`Editing "${list.name}"`, 'ok');
  };

  // Duplicate a list into recipeLists with a fresh id (used for meal plans).
  const duplicateGroceryList = (list) => {
    const id = 'custom-' + Math.random().toString(36).slice(2, 9);
    const items = (list.items || bsLibraryPreviewItems(list)).map((it, idx) => ({ ...it, id: `${id}-${idx}` }));
    const copy = {
      ...list, id, editable: true,
      name: `${list.name} (copy)`,
      eyebrow: 'Custom · Duplicated',
      kind: 'custom',
      usedCount: 0,
      count: items.length,
      preview: items.slice(0, 3).map(it => it.n).join(' · ') || 'Empty list',
      items,
    };
    setRecipeLists(prev => [copy, ...prev]);
    window.__bsToast?.(`Duplicated "${list.name}"`, 'ok');
  };

  // Remove a custom list. recipeLists-backed lists are dropped outright;
  // built-ins are hidden via the deleted-ids set.
  const deleteGroceryList = (list) => {
    if (recipeLists.some(l => l.id === list.id)) {
      setRecipeLists(prev => prev.filter(l => l.id !== list.id));
    } else {
      setDeletedGroceryIds(prev => prev.includes(list.id) ? prev : [...prev, list.id]);
    }
    window.__bsToast?.(`Deleted "${list.name}"`, 'ok');
  };

  // Persist an edited/created custom list. Keeps the in-view (aisle-shaped)
  // copy in selectedGroceryList and a flat library-shaped copy in recipeLists
  // (which is what BSGroceryLibrary renders + what gets saved to localStorage).
  const persistGroceryList = (normalized) => {
    setSelectedGroceryList(normalized);
    const items = (normalized.aisles || []).flatMap(a => a.items || []);
    const flat = {
      id: normalized.id,
      name: normalized.name,
      kind: normalized.kind || 'custom',
      editable: true,
      eyebrow: normalized.eyebrow || 'Custom · Created today',
      author: normalized.author || 'You',
      note: normalized.note,
      usedCount: normalized.usedCount || 0,
      preview: items.slice(0, 3).map(it => it.n).join(' · ') || 'Empty list',
      count: items.length,
      items: items.map((it, idx) => ({ id: it.id || `${normalized.id}-${idx}`, n: it.n, q: it.q, meals: it.meals || normalized.name })),
    };
    setRecipeLists(prev => prev.some(l => l.id === flat.id)
      ? prev.map(l => l.id === flat.id ? flat : l)
      : [flat, ...prev]);
  };

  // Open the full "Build a list." page (name + add items by aisle).
  const createGroceryList = () => setView('build');
  // Persist a list created from the builder, then open it.
  const createListFromBuilder = ({ name, items, aisles }) => {
    const id = 'custom-' + Math.random().toString(36).slice(2, 9);
    const note = `"${name}" — your custom grocery list.`;
    setSelectedGroceryList({ id, name, kind: 'custom', editable: true, eyebrow: 'Custom · Created today', author: 'You', note, usedCount: 0, aisles });
    setRecipeLists(prev => [
      { id, name, kind: 'custom', editable: true, eyebrow: 'Custom · Created today', author: 'You', note, usedCount: 0, preview: items.slice(0, 3).map(i => i.n).join(' · ') || 'Empty list', count: items.length, items },
      ...prev,
    ]);
    setView('grocery');
    window.__bsToast?.(`Created "${name}"`, 'ok');
  };

  // Save-to-library naming flow — names the current cart and stores its items.
  const openSaveToLibrary = (list) => {
    setSaveTarget(list);
    setSaveName((list.name && list.name !== 'Grocery') ? list.name : `Week of ${new Date().toLocaleDateString([], { month: 'short', day: 'numeric' })}`);
  };
  const confirmSaveToLibrary = () => {
    const nm = (saveName || '').trim() || 'Saved list';
    const list = saveTarget; if (!list) return;
    const flatItems = (list.aisles || []).flatMap(a => (a.items || []).map(it => ({ id: it.id, n: it.n, q: it.q, meals: it.meals })));
    const id = 'saved-' + Math.random().toString(36).slice(2, 9);
    setRecipeLists(prev => [
      { id, name: nm, kind: 'custom', editable: false, eyebrow: 'Custom · Saved today', author: 'You', usedCount: 0, preview: flatItems.slice(0, 3).map(i => i.n).join(' · ') || 'Empty', count: flatItems.length, items: flatItems },
      ...prev,
    ]);
    setSaveTarget(null);
    window.__bsToast?.(`Saved "${nm}" to library`, 'ok');
  };
  const confirmCreateGroceryList = () => {
    const clean = (newListName || '').trim().slice(0, 60);
    if (!clean) return;
    const id = 'custom-' + Math.random().toString(36).slice(2, 9);
    const note = `"${clean}" — your custom grocery list.`;
    // In-view copy carries aisles; library/localStorage copy stays flat.
    setSelectedGroceryList({
      id, name: clean, kind: 'custom', editable: true,
      eyebrow: 'Custom · Created today', author: 'You', note,
      usedCount: 0, aisles: [{ aisle: 'Items', items: [] }],
    });
    setRecipeLists(prev => [
      { id, name: clean, kind: 'custom', editable: true, eyebrow: 'Custom · Created today', author: 'You', note, usedCount: 0, preview: 'Empty list', count: 0, items: [] },
      ...prev,
    ]);
    setNewListName(null);
    setView('grocery');
    window.__bsToast?.(`Created "${clean}"`, 'ok');
  };

  // Reset scroll-to-top whenever the eat-tab view changes (day swap,
  // entering/exiting preview, switching grocery view). Without this,
  // .bs-scroll keeps the scrollTop from the previous render branch — which
  // is why "scroll back to top" felt impossible after returning from a
  // meal preview. MUST run before any early returns to satisfy Hooks rules.
  React.useLayoutEffect(() => {
    const el = document.querySelector('.bs-scroll');
    if (el) el.scrollTop = 0;
  }, [day, previewMealId, previewRecipe, previewDayBrief, view, skRecipe]);

  // In-app "name your list" sheet — portaled so it overlays the grocery /
  // library full-screen views from which it's triggered.
  const newListSheet = newListName !== null ? createPortal((
    <div onClick={() => setNewListName(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '10px 18px calc(20px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -24px 70px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 99, background: t.RULE }} />
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: t.W.display, letterSpacing: '-0.025em', marginBottom: 4 }}>New grocery list</div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginBottom: 14 }}>Name it to get started</div>
        <input autoFocus value={newListName} onChange={(e) => setNewListName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') confirmCreateGroceryList(); }}
          placeholder="e.g. Sunday shop"
          style={{ width: '100%', height: 48, background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: '0 14px', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, outline: 'none', boxSizing: 'border-box', marginBottom: 14 }} />
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => setNewListName(null)} style={{ flex: '0 0 auto', padding: '14px 18px', borderRadius: 999, background: 'transparent', color: t.INK50, border: `1px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
          <button onClick={confirmCreateGroceryList} disabled={!(newListName || '').trim()} style={{ flex: 1, padding: '14px 0', borderRadius: 999, background: t.ACCENT, color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: (newListName || '').trim() ? 'pointer' : 'default', opacity: (newListName || '').trim() ? 1 : 0.5 }}>Create →</button>
        </div>
      </div>
    </div>
  ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body) : null;

  // "Save to library" naming sheet (with quick-name chips).
  const saveSheet = saveTarget !== null ? createPortal((
    <div onClick={() => setSaveTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '10px 18px calc(20px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -24px 70px rgba(0,0,0,0.55)' }}>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 14px' }}><div style={{ width: 38, height: 4, borderRadius: 99, background: t.RULE }} /></div>
        <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: t.RUST }}>SAVE TO LIBRARY</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, letterSpacing: '-0.02em' }}>Name this <span style={{ fontStyle: 'italic', color: t.RUST }}>list.</span></div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 13, fontStyle: 'italic', color: t.INK70, lineHeight: 1.45 }}>Saves the current items (without checkboxes) so you can reload them anytime.</div>
        <input autoFocus value={saveName} onChange={(e) => setSaveName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirmSaveToLibrary(); }} placeholder="e.g. Week of Jun 4"
          style={{ width: '100%', border: 0, borderBottom: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, padding: '10px 2px', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, outline: 'none', boxSizing: 'border-box', marginTop: 16 }} />
        <div style={{ marginTop: 18, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: t.INK50, marginBottom: 9 }}>QUICK NAMES</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {['Sunday staples', 'Travel week', 'Meal prep', 'Lean week', 'Backup cart'].map(q => (
            <button key={q} onClick={() => setSaveName(q)} style={{ borderRadius: 999, padding: '8px 13px', cursor: 'pointer', border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{q}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button onClick={() => setSaveTarget(null)} style={{ flex: '0 0 auto', padding: '14px 18px', borderRadius: 999, background: 'transparent', color: t.INK50, border: `1px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Cancel</button>
          <button onClick={confirmSaveToLibrary} disabled={!(saveName || '').trim()} style={{ flex: 1, padding: '14px 0', borderRadius: 999, background: t.RUST, color: '#fff', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: (saveName || '').trim() ? 'pointer' : 'default', opacity: (saveName || '').trim() ? 1 : 0.5 }}>Save →</button>
        </div>
      </div>
    </div>
  ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body) : null;

  if (view === 'grocery') return <>{newListSheet}{saveSheet}<BSGrocery list={activeGroceryList} onBack={() => setView('eat')} onLibrary={() => setView('library')} recipeLists={recipeLists} onChangeView={setView} editable={!!activeGroceryList.editable} onUpdate={persistGroceryList} onCreate={createGroceryList} onSaveToLibrary={openSaveToLibrary} onProfile={onProfile} /></>;
  if (view === 'library') return <>{newListSheet}<BSGroceryLibrary onBack={() => setView('grocery')} onLoad={loadGroceryList} recipeLists={recipeLists} onCreate={createGroceryList} onEdit={editGroceryList} onDuplicate={duplicateGroceryList} onDelete={deleteGroceryList} deletedIds={deletedGroceryIds} /></>;
  if (view === 'build') return <BSGroceryBuilder onCancel={() => setView('grocery')} onCreate={createListFromBuilder} />;
  if (view === 'recipes') {
    if (skRecipe) {
      const gid = 'sk-' + bsSkSlug(skRecipe.title);
      return (
        <BSShapeKitchenRecipe
          recipe={skRecipe}
          onBack={() => setSkRecipe(null)}
          onAddGrocery={() => addSKRecipeToGrocery(skRecipe)}
          groceryAdded={recipeLists.some(l => l.id === gid)}
        />
      );
    }
    return (
      <BSRecipeBox
        recipes={SHAPE_KITCHEN_RECIPES}
        onChangeView={(v) => { setSkRecipe(null); setView(v); }}
        onOpenRecipe={(r) => setSkRecipe(r)}
        onSendToGrocery={sendRecipeToGrocery}
        onProfile={onProfile}
      />
    );
  }
  if (previewMealId) {
    const meal = meals.find(m => m.id === previewMealId);
    if (meal) return <BSMealPreview meal={meal} onBack={() => setPreviewMealId(null)} />;
  }
  if (previewRecipe && cur.recipe) {
    return (
      <BSRecipePreview
        recipe={cur.recipe}
        dayLabel={cur.d}
        onBack={() => { setPreviewRecipe(false); setView(previewRecipeReturnView); setPreviewRecipeReturnView('eat'); }}
        onAddGrocery={() => addRecipeToGrocery(cur.recipe, cur.d)}
        groceryAdded={recipeLists.some(l => l.id === bsRecipeListId(cur.recipe, cur.d))}
      />
    );
  }
  if (previewDayBrief) {
    return <BSDayBriefPreview
      day={cur}
      onBack={() => setPreviewDayBrief(false)}
      onMealClick={(id) => { setPreviewDayBrief(false); setPreviewMealId(id); }}
      onRecipeClick={() => { setPreviewDayBrief(false); setPreviewRecipe(true); }}
    />;
  }

  // Mon=0..Sun=6 — count meals already logged today (state === 'done')
  const loggedCount = cur.meals.filter(m => m.state === 'done').length;
  // Apply any coach-approved meal swaps the user picked.
  // Overrides are keyed by the meal's ORIGINAL name so a swap saved here lines
  // up with the same meal on the website (shared user_goals store).
  const effMeals = cur.meals.map(m => { const ov = mealOverrides[m.title]; return ov ? { ...m, ...ov, _baseTitle: m.title } : { ...m, _baseTitle: m.title }; });

  return (
    <BSPage>
      <BSPageHeader
        kicker={`${bsEatProgram.nutritionPhase || 'Cut'} · Week ${bsProgramWeek()}`}
        title={cur.title}
        trailing={<BSFacetAvatar size={34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={onProfile} />}
      />

      <BSNutritionTopTabs active="eat" onChange={setView} />

      <BSWeekStrip activeIdx={day} onSelect={setDay} restFlags={PROGRAM.map(p => p.tag === 'REST')} />

      <BSCoachAdjustBanner detail={bsEatProgram.detail} kind="nutrition" />

      {(() => {
        const num = (x) => parseInt(String(x).replace(/[^0-9]/g, ''), 10) || 0;
        // Coach-set targets (from the nutritionist's Adjust plan → Apply) win over
        // the demo/plan targets when present, so the hero reflects what they set.
        const coachN = bsEatProgram.detail?.nutrition;
        const calNow = num(cur.totals.cal);
        const calTgt = (coachN && coachN.calories != null) ? num(coachN.calories) : num(cur.totals.target.cal);
        const calLeft = Math.max(0, calTgt - calNow);
        const calPct = calTgt ? Math.min(100, Math.round((calNow / calTgt) * 100)) : 0;
        const macros = [
          { l: 'PROTEIN', v: cur.totals.p, g: (coachN && coachN.protein != null) ? coachN.protein : cur.totals.target.p, c: t.RUST || '#d2693f' },
          { l: 'CARBS', v: cur.totals.c, g: (coachN && coachN.carbs != null) ? coachN.carbs : cur.totals.target.c, c: t.AMBER || '#e8b14a' },
          { l: 'FAT', v: cur.totals.f, g: (coachN && coachN.fat != null) ? coachN.fat : cur.totals.target.f, c: '#8a5cf6' },
        ];
        return (
          <>
            {/* Calorie hero */}
            <div style={{ padding: `14px ${t.padX}px 0` }}>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 9 }}>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 44, lineHeight: 0.9, letterSpacing: '-0.05em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{calNow.toLocaleString()}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.06em', color: t.INK50 }}>/ {calTgt.toLocaleString()} KCAL</span>
              </div>
              <div style={{ marginTop: 10, height: 3, borderRadius: 2, background: t.HAIR, overflow: 'hidden' }}>
                <div style={{ width: `${calPct}%`, height: '100%', background: t.ACCENT }} />
              </div>
              <div style={{ marginTop: 7, display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em' }}>
                <span style={{ color: t.ACCENT }}>{calLeft.toLocaleString()} kcal left · on pace</span>
                <span style={{ color: t.INK50 }}>{calPct}%</span>
              </div>
            </div>

            {/* Macro cards */}
            <div style={{ padding: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              {macros.map((m) => {
                const mv = num(m.v), mg = num(m.g);
                const mp = mg ? Math.min(100, (mv / mg) * 100) : 0;
                return (
                  <div key={m.l} style={{ padding: '9px 10px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', color: m.c, fontWeight: 700 }}>{m.l}</span>
                      <span style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK50 }}>/ {mg}</span>
                    </div>
                    <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 21, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1, marginTop: 5, fontVariantNumeric: 'tabular-nums' }}>{mv}</div>
                    <div style={{ marginTop: 6, height: 3, borderRadius: 2, background: t.HAIR, overflow: 'hidden' }}>
                      <div style={{ width: `${mp}%`, height: '100%', background: m.c }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        );
      })()}

      {/* Tracklist — today's meals. LOG opens the next unlogged meal to record it. */}
      <BSTrackHeader kicker="Tracklist" title={day === 4 ? "Today's meals" : `${cur.d} meals`} actionLabel="Swap meal" onAction={() => setSwapMealId('pick')} />
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        {effMeals.map((m, i) => {
          const logged = m.state === 'done';
          const next = m.state === 'next';
          const swapped = !!mealOverrides[m._baseTitle];
          return (
            <button key={m.id} onClick={() => setPreviewMealId(m.id)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'grid', gridTemplateColumns: '22px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}`, background: 'transparent', border: 0 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 10, color: logged ? t.ACCENT : t.INK50, fontWeight: 600, marginTop: 3 }}>{logged ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: logged ? t.INK50 : t.INK, letterSpacing: '-0.01em', textDecoration: logged ? 'line-through' : 'none' }}>{m.title}{swapped && <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', color: t.ACCENT, marginLeft: 7 }}>SWAPPED</span>}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: next ? t.ACCENT : t.INK50, marginTop: 3, letterSpacing: '0.04em' }}>{m.kcal} kcal · {m.p}P · {m.c}C · {m.f}F{next ? ' · LOG NOW' : ''}</div>
              </div>
              <span style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 3, whiteSpace: 'nowrap' }}>{bsMealSchedLabel(m)}</span>
            </button>
          );
        })}
      </div>

      {/* Meal swap sheet — pick which meal, then a coach-approved alternate. */}
      {swapMealId != null && (() => {
        if (swapMealId === 'pick') {
          return <BSSwapSheet title="Swap" subtitle="Which meal?"
            options={effMeals.map(m => ({ label: m.title, sub: `${bsMealSchedLabel(m)} · ${m.kcal} kcal${mealOverrides[m._baseTitle] ? ' · swapped' : ''}`, _id: m.id }))}
            onPick={(o) => setSwapMealId(o._id)} onClose={() => setSwapMealId(null)} />;
        }
        const orig = effMeals.find(m => m.id === swapMealId);
        if (!orig) return null;
        const base = cur.meals.find(m => m.id === swapMealId) || orig;
        const options = [
          { label: base.title, sub: `${base.kcal} kcal · ${base.p}P · ${base.c}C · ${base.f}F`, current: true, _keep: true },
          ...BS_MEAL_SWAPS.filter(a => a.title !== orig.title).map(a => ({ label: a.title, sub: `${a.kcal} kcal · ${a.p}P · ${a.c}C · ${a.f}F`, _alt: a })),
        ];
        return <BSSwapSheet title="Swap meal" subtitle={orig.title} options={options} onClose={() => setSwapMealId(null)}
          onPick={(o) => {
            const key = base.title;
            const next = { ...mealOverrides };
            if (o._keep) delete next[key];
            else next[key] = { title: o._alt.title, kcal: o._alt.kcal, p: o._alt.p, c: o._alt.c, f: o._alt.f, sub: `${o._alt.kcal} kcal · ${o._alt.p}P · ${o._alt.c}C · ${o._alt.f}F` };
            setMealOverrides(next);
            try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_meal_swaps', next); } catch (e) {}
            if (!o._keep) {
              window.__bsToast && window.__bsToast('Swapped to ' + o._alt.title, 'ok');
              try { window.ShapeMessages && window.ShapeMessages.sendProviderMessage && window.ShapeMessages.sendProviderMessage({ coach: { name: 'Dr. Maya Patel', provider_role: 'nutritionist' }, text: `Swapped ${base.title} → ${o._alt.title} · ${day === 4 ? 'today' : cur.d}` }).catch(() => {}); } catch (e) {}
            }
            setSwapMealId(null);
          }} />;
      })()}

      {/* Your plan — nutritionist card */}
      <BSTrackHeader kicker="Your plan" title={`${planGoalLabel} · ${(parseInt(String(cur.totals.target.cal).replace(/[^0-9]/g, ''), 10) || 0).toLocaleString()}`} />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
            <div style={{ width: 34, height: 34, borderRadius: 999, background: '#a07a2e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 14 }}>M</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK }}>Dr. Maya Patel</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase' }}>Nutritionist</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', color: t.INK50, textTransform: 'uppercase' }}>Apr plan</span>
          </div>
          <div style={{ fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontStyle: 'italic', fontSize: 17, lineHeight: 1.4, color: t.INK }}>&ldquo;{cur.coachLine}&rdquo;</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <button onClick={() => setView('grocery')} style={{ flex: 1, padding: '11px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Shop list →</button>
          </div>
        </div>
      </div>

      {/* For the week — shop list (live from the nutritionist's grocery list) */}
      {(() => {
        const aisles = activeGroceryList.aisles || [];
        const total = activeGroceryCount;
        const have = aisles.reduce((s, a) => s + a.items.filter(it => it.have).length, 0);
        const left = Math.max(0, total - have);
        const cats = aisles.filter(a => a.items.some(it => !it.have)).map(a => a.aisle).slice(0, 3).join(', ').toLowerCase();
        const who = String(activeGroceryList.author || 'Your nutritionist').replace(/^Dr\.?\s+/i, '').split(' ')[0];
        const title = left > 0 ? `${left} item${left === 1 ? '' : 's'} to get.` : 'All set for the week.';
        return (
          <>
            <BSTrackHeader kicker="For the week" title="Grocery list" actionLabel="Open" onAction={() => setView('grocery')} />
            <div style={{ padding: `12px ${t.padX}px 0` }}>
              <button onClick={() => setView('grocery')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', minHeight: 60, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2 }}>
                <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: '#a07a2e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16 }}>◎</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#a07a2e', fontWeight: 700, marginBottom: 2 }}>From {who} · this week</div>
                  <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 15, color: t.INK }}>{title}</div>
                  <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.05em', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{have} got · {left} left{cats ? ` · ${cats}` : ''}</div>
                </div>
                <span style={{ color: t.INK50, fontSize: 16 }}>→</span>
              </button>
            </div>
          </>
        );
      })()}

      {/* From Maya — nutritionist playlists (sourced from the Radio coach-playlist feed) */}
      {(() => {
        const all = Array.isArray(window.BS_COACH_PLAYLISTS) ? window.BS_COACH_PLAYLISTS : [];
        const lists = all.filter(p => p.role === 'Nutritionist');
        const items = lists.length ? lists.map(p => ({ k: `${p.by} · Your nutritionist`, title: p.name, meta: `${p.len} · ${p.bpm} BPM · ${p.tracks} tracks${p.attached ? ` · ${p.attached}` : ''}`, url: p.url, tracks: p.songs }))
          : [{ k: 'Dr. Maya Patel · Your nutritionist', title: 'Meal prep, low-key', meta: '45m · 85-100 BPM · 12 tracks · Sun prep' }];
        return (
          <>
            <BSTrackHeader kicker="From Maya" title="Playlists" />
            <div style={{ padding: `12px ${t.padX}px 0`, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map((p, i) => (
                <BSPlaylistCard key={i} kicker={p.k} title={p.title} meta={p.meta} color="#1db954" spotifyUrl={p.url} tracks={p.tracks} />
              ))}
            </div>
          </>
        );
      })()}

      {/* Find a nutritionist — marketplace deep link (Nutritionist tab), pinned to the bottom */}
      <BSTrackHeader kicker="Marketplace" title="Coaching" />
      <div style={{ padding: `12px ${t.padX}px 28px` }}>
        <button onClick={() => goMarket('nutritionist')} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', minHeight: 60, borderRadius: 14, border: `2px solid ${t.isLight ? '#9c7b43' : '#e7dcc3'}`, background: t.isLight ? '#9c7b4314' : '#e7dcc31f' }}>
          <div style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, background: t.isLight ? '#9c7b43' : '#e7dcc3', color: t.isLight ? '#fff' : '#2a1f12', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={t.isLight ? '#fff' : '#2a1f12'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 20A7 7 0 0 1 4 13C4 7 9 3 20 3C20 12 16 20 11 20Z"/><path d="M4 21C5.5 15 9 11.5 14 10"/></svg>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 16, color: t.INK }}>Find a nutritionist</div>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.05em', lineHeight: 1.3, display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>Vetted RDs · filter by goal & specialty</div>
          </div>
          <span style={{ color: t.isLight ? '#9c7b43' : '#e7dcc3', fontSize: 16, flexShrink: 0, fontWeight: 700 }}>→</span>
        </button>
      </div>

      <BSFooter right="Pg 3 of 5" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// CHAT — Circle / Clients / Trainers / Nutri / Community
// ═══════════════════════════════════════════════════════════

const SHAPE_FEED_SEED = [
  {
    id: 'feed-owen',
    name: 'Owen Vale',
    role: 'Client',
    avatar: 'O',
    time: 'Live now',
    privacy: 'Public',
    workout: 'Tempo run',
    status: 'Mile 4 of 6',
    statA: '6.2 mi',
    statB: '7:18 pace',
    statC: '148 bpm',
    labels: ['Distance', 'Pace', 'Heart'],
    note: 'Holding threshold steady. Last mile is the test.',
    route: {
      kind: 'Run route',
      area: 'Prospect Park, Brooklyn',
      privacy: 'Start/end hidden',
      elevation: '184 ft gain',
      provider: 'Strava',
      imported: true,
      points: [[8, 72], [18, 56], [30, 62], [42, 34], [56, 42], [69, 24], [82, 35], [92, 18]],
    },
    tags: ['STRAVA', 'GPS', 'RUN', 'TEMPO', 'PUBLIC'],
    source_provider: 'strava',
    sourceProviderLabel: 'Strava',
    likes: 38,
    comments: [
      { who: 'Maya O.', text: 'Stay relaxed through the shoulders.' },
      { who: 'Ari C.', text: 'That pace is moving.' },
    ],
    live: true,
  },
  {
    id: 'feed-ari',
    name: 'Ari Morgan',
    role: 'Client',
    avatar: 'A',
    time: '22m',
    privacy: 'Public',
    workout: 'Bike ride',
    status: 'River loop complete',
    statA: '18.4 mi',
    statB: '17.2 mph',
    statC: '642 ft',
    labels: ['Distance', 'Speed', 'Elev.'],
    note: 'Kept it aerobic. Wind picked up on the return but cadence stayed smooth.',
    route: {
      kind: 'Ride route',
      area: 'Hudson River Greenway',
      privacy: 'Home zone masked',
      elevation: '642 ft gain',
      provider: 'Garmin',
      imported: true,
      points: [[6, 70], [16, 64], [22, 38], [35, 30], [48, 36], [59, 20], [70, 25], [82, 45], [94, 36]],
    },
    tags: ['GARMIN', 'GPS', 'RIDE', 'Z2', 'PUBLIC'],
    source_provider: 'garmin',
    sourceProviderLabel: 'Garmin',
    likes: 51,
    comments: [
      { who: 'Owen V.', text: 'That north wind was rude today.' },
    ],
  },
  {
    id: 'feed-nina',
    name: 'Nina Chen',
    role: 'Client',
    avatar: 'N',
    time: '8m',
    privacy: 'Public',
    workout: 'Lower strength',
    status: 'Session complete',
    statA: '54 min',
    statB: '14 sets',
    statC: '+5 lb',
    labels: ['Time', 'Sets', 'Load'],
    note: 'First pain-free squat session in weeks. Kept RPE at 7.',
    tags: ['LIFT', 'PR', 'SHAPE'],
    likes: 64,
    comments: [
      { who: 'Jordan R.', text: 'Clean work. Keep the same load next week.' },
    ],
  },
  {
    id: 'feed-marcus',
    name: 'Marcus Johnson',
    role: 'Client',
    avatar: 'M',
    time: '41m',
    privacy: 'Public',
    workout: 'Upper push',
    status: 'Top set logged',
    statA: '225 lb',
    statB: '8 reps',
    statC: 'RPE 8',
    labels: ['Bench', 'Reps', 'Effort'],
    note: 'Bench moved better than last week. Added one rep and kept the pause clean.',
    tags: ['LIFT', 'PROGRESS', 'SHAPE'],
    likes: 27,
    comments: [
      { who: 'Jordan R.', text: 'Good rep. Keep the same load next push day.' },
      { who: 'Kenji M.', text: 'Pause work paying off.' },
    ],
  },
  {
    id: 'feed-sofia',
    name: 'Sofia Reyes',
    role: 'Client',
    avatar: 'S',
    time: '1h',
    privacy: 'Public',
    workout: 'Meal prep',
    status: 'Protein target hit',
    statA: '154g',
    statB: '5 meals',
    statC: 'On plan',
    labels: ['Protein', 'Prepped', 'Status'],
    note: 'Packed the next two days: chicken bowl, Greek yogurt, salmon dinner. No guessing tomorrow.',
    tags: ['NUTRITION', 'MEAL PREP', 'PUBLIC'],
    likes: 44,
    comments: [
      { who: 'Maya O.', text: 'That is the exact kind of setup that wins the week.' },
    ],
  },
];

function BSActivityRoutePreview({ route }) {
  const t = useBS();
  if (!route) return null;
  const points = route.points || [];
  if (points.length < 2) return null;
  const polyline = points.map(([x, y]) => `${x},${y}`).join(' ');
  const start = points[0] || [8, 72];
  const end = points[points.length - 1] || [92, 18];
  const provider = route.provider || '';

  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      marginTop: 12,
      border: `1px solid ${t.INK}`,
      background: t.PAPER,
      minHeight: 142,
    }}>
      <div aria-hidden style={{
        position: 'absolute',
        inset: 0,
        backgroundImage: `
          linear-gradient(rgba(${t.inkRGB},0.08) 1px, transparent 1px),
          linear-gradient(90deg, rgba(${t.inkRGB},0.08) 1px, transparent 1px),
          radial-gradient(circle, rgba(${t.inkRGB},0.16) 1px, transparent 1.35px)
        `,
        backgroundSize: '26px 26px, 26px 26px, 8px 8px',
        opacity: 0.9,
        pointerEvents: 'none',
      }} />
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
      }}>
        <polyline
          points={polyline}
          fill="none"
          stroke={t.ACCENT}
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={start[0]} cy={start[1]} r="9" fill={`rgba(${t.inkRGB},0.12)`} stroke={t.INK} strokeWidth="1.4" vectorEffect="non-scaling-stroke" />
        <circle cx={end[0]} cy={end[1]} r="5" fill={t.ACCENT} stroke={t.PAPER} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      </svg>
      <div style={{
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 10,
        padding: 10,
      }}>
        <div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 900 }}>{provider ? `${provider} - ${route.kind}` : route.kind}</div>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 18, color: t.INK, lineHeight: 1.05, letterSpacing: '-0.03em', marginTop: 4 }}>{route.area}</div>
        </div>
        <div style={{
          alignSelf: 'flex-start',
          border: `1px solid ${t.INK}`,
          background: t.PAPER2,
          padding: '5px 6px',
          fontFamily: t.MONO,
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: t.INK,
          fontWeight: 900,
          whiteSpace: 'nowrap',
        }}>{route.privacy}</div>
      </div>
      <div style={{
        position: 'absolute',
        left: 10,
        right: 10,
        bottom: 10,
        zIndex: 1,
        display: 'flex',
        justifyContent: 'space-between',
        gap: 8,
        fontFamily: t.MONO,
        fontSize: 9,
        letterSpacing: '0.16em',
        textTransform: 'uppercase',
        color: t.INK70,
        fontWeight: 800,
      }}>
        <span>{provider ? `${provider} GPS` : 'GPS preview'}</span>
        <span>{route.elevation}</span>
      </div>
    </div>
  );
}

function BSFeedActivityCard({
  post,
  isLiked,
  likeCount,
  comments,
  privacyColor,
  onLike,
  commentValue,
  onCommentChange,
  onCommentPost,
}) {
  const t = useBS();
  const labels = post.labels || ['Metric', 'Metric', 'Metric'];
  const providerLabel = post.sourceProviderLabel || post.route?.provider || '';

  return (
    <article style={{
      border: `1px solid ${t.SURFACE_BORDER}`,
      background: t.SURFACE,
      borderRadius: t.RADIUS_LG,
      boxShadow: t.ELEVATION_SOFT,
      overflow: 'hidden',
      backdropFilter: 'blur(14px)',
      WebkitBackdropFilter: 'blur(14px)',
    }}>
      <div style={{ padding: 14, display: 'grid', gridTemplateColumns: '42px 1fr auto', gap: 11, alignItems: 'center' }}>
        <BSAvatar init={post.avatar} size={40} fill={privacyColor} />
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
            <span style={{ fontFamily: t.BODY, fontSize: 15, fontWeight: 750, color: t.INK, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{post.name}</span>
            {post.live && <span style={{ width: 7, height: 7, borderRadius: 7, background: '#df3f33', flex: '0 0 auto' }} />}
          </div>
          <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>
            {post.role} - {post.time}
          </div>
        </div>
        <span style={{
          border: `1px solid ${privacyColor}`,
          color: privacyColor,
          borderRadius: 999,
          padding: '5px 8px',
          fontFamily: t.MONO,
          fontSize: 9,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          fontWeight: 900,
          whiteSpace: 'nowrap',
        }}>{post.privacy}</span>
      </div>

      <div style={{ padding: '0 14px 14px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.ACCENT, letterSpacing: '0.18em', textTransform: 'uppercase', fontWeight: 900 }}>
            {post.workout}
          </div>
          {providerLabel && (
            <span style={{
              border: `1px solid ${t.ACCENT}`,
              color: t.ACCENT,
              borderRadius: 999,
              padding: '4px 7px',
              fontFamily: t.MONO,
              fontSize: 9,
              letterSpacing: '0.13em',
              textTransform: 'uppercase',
              fontWeight: 900,
              whiteSpace: 'nowrap',
            }}>{providerLabel} GPS</span>
          )}
        </div>
        <div style={{ marginTop: 5, fontFamily: t.BODY, fontSize: 25, fontWeight: 760, color: t.INK, lineHeight: 1.05, letterSpacing: '-0.03em' }}>
          {post.status}
        </div>
        <p style={{ margin: '8px 0 0', fontFamily: t.BODY, fontSize: 14.5, lineHeight: 1.45, color: t.INK70 }}>
          {post.note}
        </p>

        <div style={{ borderRadius: 18, overflow: 'hidden', marginTop: 12 }}>
          <BSActivityRoutePreview route={post.route} />
        </div>
        {post.route?.imported && providerLabel && (
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 800 }}>
            Imported route - start and finish can be masked
          </div>
        )}

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 8,
          marginTop: 12,
          padding: 12,
          border: `1px solid ${t.SURFACE_BORDER}`,
          background: t.PAPER2,
          borderRadius: 18,
        }}>
          {[post.statA, post.statB, post.statC].map((stat, i) => (
            <div key={i} style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.BODY, fontSize: 18, fontWeight: 720, color: t.INK, lineHeight: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{stat}</div>
              <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{labels[i]}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 10 }}>
          {(post.tags || []).map(tag => (
            <span key={tag} style={{
              border: `1px solid ${t.SURFACE_BORDER}`,
              background: t.PAPER2,
              color: tag === 'PRIVATE' ? t.RUST : t.INK70,
              borderRadius: 999,
              padding: '5px 8px',
              fontFamily: t.MONO,
              fontSize: 9,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              fontWeight: 800,
            }}>{tag}</span>
          ))}
        </div>
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr 1fr',
        borderTop: `1px solid ${t.SURFACE_BORDER}`,
        borderBottom: `1px solid ${t.SURFACE_BORDER}`,
        background: t.PAPER2,
      }}>
        <button onClick={onLike} style={{
          border: 0,
          borderRight: `1px solid ${t.SURFACE_BORDER}`,
          background: isLiked ? t.ACCENT : 'transparent',
          color: isLiked ? t.PAPER : t.INK,
          padding: '11px 4px',
          fontFamily: t.BODY,
          fontSize: 13,
          fontWeight: 760,
        }}>{isLiked ? 'Kudoed' : 'Kudos'} {likeCount}</button>
        <div style={{
          borderRight: `1px solid ${t.SURFACE_BORDER}`,
          padding: '11px 4px',
          fontFamily: t.BODY,
          fontSize: 13,
          fontWeight: 700,
          color: t.INK70,
          textAlign: 'center',
        }}>{comments.length} comments</div>
        <button type="button" style={{
          border: 0,
          background: 'transparent',
          color: t.INK70,
          padding: '11px 4px',
          fontFamily: t.BODY,
          fontSize: 13,
          fontWeight: 700,
        }}>Share</button>
      </div>

      <div style={{ padding: 14 }}>
        {comments.length > 0 && (
          <div style={{ display: 'grid', gap: 8, marginBottom: 10 }}>
            {comments.slice(-2).map((comment, i) => (
              <div key={i} style={{ borderRadius: 14, background: t.PAPER2, padding: '8px 10px' }}>
                <span style={{ fontFamily: t.BODY, fontSize: 12.5, fontWeight: 760, color: t.INK }}>{comment.who}</span>
                <span style={{ fontFamily: t.BODY, fontSize: 12.5, color: t.INK70 }}> {comment.text}</span>
              </div>
            ))}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', gap: 8 }}>
          <input
            value={commentValue}
            onChange={(e) => onCommentChange(e.target.value)}
            placeholder="Add a comment..."
            style={{
              minWidth: 0,
              border: `1px solid ${t.SURFACE_BORDER}`,
              background: t.PAPER2,
              color: t.INK,
              borderRadius: 999,
              padding: '10px 12px',
              fontFamily: t.BODY,
              fontSize: 14,
              outline: 'none',
            }}
          />
          <button onClick={onCommentPost} style={{
            border: 0,
            background: t.INK,
            color: t.PAPER,
            borderRadius: 999,
            fontFamily: t.BODY,
            fontSize: 13,
            fontWeight: 760,
          }}>Post</button>
        </div>
      </div>
    </article>
  );
}

// "The feed." — community feed screen (Feed / Messages / Teams).
// Sample conversations + channels shown in demo (when there's no live data).
const BS_SAMPLE_DMS = {
  'Sofia Martinez': [
    { who: 'Sofia Martinez', t: 'You in for the Saturday long run?', time: '9:02', me: false },
    { who: 'You', t: 'Yeah — what pace are we thinking?', time: '9:05', me: true },
    { who: 'Sofia Martinez', t: 'Easy 8:00ish. Coffee at Blackbird after ☕', time: '9:06', me: false },
    { who: 'You', t: 'Perfect, see you at 6 🏃', time: '9:07', me: true },
  ],
  'Jordan Chen': [
    { who: 'Jordan Chen', t: 'Great session today — how are the legs?', time: '2h', me: false },
    { who: 'You', t: 'Sore but good 😅 those tempo squats…', time: '2h', me: true },
    { who: 'Jordan Chen', t: "Haha that's the deload working. Rest up.", time: '2h', me: false },
  ],
  'Maya Okafor': [
    { who: 'Maya Okafor', t: 'Sent your week-7 block over — check the press cue.', time: '1h', me: false },
    { who: 'You', t: 'Got it. Ribs down, right?', time: '1h', me: true },
    { who: 'Maya Okafor', t: 'Exactly 💪', time: '1h', me: false },
  ],
  'Dev Patel': [
    { who: 'Dev Patel', t: 'Did you try that protein recipe?', time: 'Yesterday', me: false },
    { who: 'You', t: 'The overnight oats? Yeah — 40g and actually good', time: 'Yesterday', me: true },
    { who: 'Dev Patel', t: 'Right?? Game changer.', time: 'Yesterday', me: false },
  ],
  'Aria Kim': [
    { who: 'Aria Kim', t: 'Hit a 5k PR this morning 🎉', time: '3h', me: false },
    { who: 'You', t: "Let's gooo — what time?", time: '3h', me: true },
    { who: 'Aria Kim', t: '24:10! Two weeks ahead of plan.', time: '3h', me: false },
  ],
};
const BS_SAMPLE_COACH_DMS = {
  'Maya Okafor': [
    { who: 'Maya Okafor', t: 'Nice work hitting all your lifts this week 💪', time: 'Mon', me: false },
    { who: 'You', t: 'Thanks! Tempo squats were brutal', time: 'Mon', me: true },
    { who: 'Maya Okafor', t: "That's the point 😅 keep bar speed up next block.", time: 'Mon', me: false },
  ],
  'Rae Lindqvist': [
    { who: 'Rae Lindqvist', t: "Your protein average is up to 0.9g/lb — great consistency.", time: 'Tue', me: false },
    { who: 'You', t: 'Meal prep is finally a habit', time: 'Tue', me: true },
    { who: 'Rae Lindqvist', t: "It shows. Let's nudge carbs up around training days.", time: 'Tue', me: false },
  ],
  'Dr. Sam Huang': [
    { who: 'Dr. Sam Huang', t: 'Zone 2 looked clean on the watch this week.', time: 'Wed', me: false },
    { who: 'You', t: 'Felt easy — kept it conversational', time: 'Wed', me: true },
    { who: 'Dr. Sam Huang', t: 'Perfect. Adding one tempo session next week.', time: 'Wed', me: false },
  ],
};
const BS_SAMPLE_CHANNELS = [
  { id: 'sample-block3', name: 'strength-block-3', description: 'Week 9 · peaking. Top-set check-ins.', memberCount: 412, online: 38, joined: true, isHost: false, private: false, pinned: false, live: true, last: 'Top set check-in: 245×3 @ RPE 8', messages: [
    { who: 'Priya Shah', tier: 'peak', t: 'Top set check-in: 245×3 @ RPE 8. Leaving Block 3 happy.', time: '9:04a', me: false },
    { who: 'Maya Okafor', tier: 'legend', coach: true, role: 'trainer', t: "That's the strongest the group has looked all block. Whoever's on day 4 — keep the back-offs honest.", time: '9:12a', me: false },
    { who: 'Casey Morgan', tier: 'form', t: 'On it. 5×5 @ 185 then mobility.', time: '9:20a', me: false },
    { who: 'You', t: "Spotting Priya's PR — same scheme tomorrow, wish me luck.", time: '9:24a', me: true },
  ] },
  { id: 'sample-shapehq', name: 'Shape HQ', description: '', memberCount: 2841, joined: true, isHost: false, private: false, pinned: false, last: 'Shape HQ updates', messages: [
    { who: 'Shape', t: '👋 Welcome to Shape HQ — product news, drops, and events live here.', time: 'Mon', me: false },
    { who: 'Shape', t: 'New this week: save a coach playlist straight to your own Spotify.', time: 'Tue', me: false },
    { who: 'Shape', t: 'Shape Radio is live Thursdays at 7pm 🎧', time: 'Wed', me: false },
  ] },
  { id: 'sample-runclub', name: 'Sunday Run Club', description: '', memberCount: 184, joined: true, isHost: false, private: false, pinned: false, last: "6am long run — 47 RSVP'd", messages: [
    { who: 'Marcus J.', t: 'Saturday 6am long run is on! Coffee at Blackbird after.', time: '1d', me: false },
    { who: 'Diego A.', t: 'In. Holding ~8:00 if anyone wants company.', time: '1d', me: false },
    { who: 'You', t: "I'm in 🏃", time: '1d', me: true },
  ] },
  { id: 'sample-macros', name: 'Macro Mondays', description: '', memberCount: 312, joined: true, isHost: false, private: false, pinned: false, last: 'Protein-first, every day.', messages: [
    { who: 'Dr. Maya Patel', t: 'Protein first, fill the rest with volume — 0.8–1g/lb, daily.', time: '2d', me: false },
    { who: 'Owen H.', t: 'Adding: fiber is the most under-eaten macro I see.', time: '2d', me: false },
  ] },
  { id: 'sample-prwall', name: 'PR Wall', description: '', memberCount: 526, joined: true, isHost: false, private: false, pinned: false, last: '405 deadlift, no belt 🔥', messages: [
    { who: 'Tomás R.', t: '405 deadlift, conventional, no belt. Felt like nothing 🔥', time: '5h', me: false },
    { who: 'You', t: 'Huge 👏', time: '5h', me: true },
  ] },
];

// Public profile opened from a chat avatar — works for any member or coach.
// ── Client "Terrain" public profile (Living Identity direction) ──────────────
// Members get an immersive, dark, topographic identity page: a generative
// contour hero with the name overlaid, a ridgeline "climb" (start → now → goal),
// living signals (streak / weekly bars / trajectory), discipline strata,
// signature numbers, and a field-notes trail. Tier is the atmosphere color (the
// app's real tier). Name/tier/city/bio/points are live; the richer terrain
// sub-data is illustrative for now (wire to real logs later). Coaches keep the
// card profile below (their own design lands separately).
const bsTHexA = (hex, a) => {
  const h = String(hex || '#888888').replace('#', '');
  const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
  const n = parseInt(s, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
function bsTRng(seed) { let s = (seed || 1) % 2147483647; if (s <= 0) s += 2147483646; return () => (s = (s * 16807) % 2147483647) / 2147483647; }

// Facet avatar — the avatar IS a shape: a soft rounded-diamond gem, tier-
// coloured from the edge, portrait upright inside, a rank wedge at the foot
// (or an edit ✎ badge on your own). Used across the living-identity profiles.
function bsTierRank(tier) { const m = { raw: 'I', base: 'I', tempo: 'II', form: 'III', peak: 'IV', legend: 'V', certified: 'I', pro: 'II', elite: 'III', master: 'IV', icon: 'V' }; return m[String(tier || '').toLowerCase()] || 'I'; }
function bsShade(hex, f) { const h = String(hex || '#888888').replace('#', ''); const s = h.length === 3 ? h.split('').map((x) => x + x).join('') : h; const n = parseInt(s, 16); return `rgb(${Math.round(((n >> 16) & 255) * f)},${Math.round(((n >> 8) & 255) * f)},${Math.round((n & 255) * f)})`; }
// Channel tile — a simple MONOCHROME line icon picked from the channel name
// (inherits the tile's color via currentColor), plus a stable per-channel accent
// so channels read as themselves without busy multicolor emoji.
function bsChannelKey(name) {
  const n = String(name || '').toLowerCase();
  if (/(strength|lift|barbell|squat|deadlift|bench|powerlift|\bpr\b|press|hypertroph)/.test(n)) return 'strength';
  if (/(marathon|\brun|\b5k|\b10k|tempo|\bmile|jog|sprint|cardio)/.test(n)) return 'pulse';
  if (/(nutrition|protein|\bmeal|recipe|\bdiet|macro|\beat|\bfood|kitchen|fuel)/.test(n)) return 'leaf';
  if (/(cycle|cycling|\bbike|spin|\bride)/.test(n)) return 'bike';
  if (/(hiit|conditioning|metcon|hyrox|crossfit|\bwod)/.test(n)) return 'bolt';
  if (/(challenge|streak|goal|\bclub|leaderboard|compet|champ)/.test(n)) return 'trophy';
  if (/(shape ?hq|announc|update|official|\bnews|notice)/.test(n)) return 'bell';
  if (/(music|playlist|radio|soundtrack)/.test(n)) return 'note';
  if (/(yoga|mobility|stretch|recovery|rehab|sleep|\brest|calm|breath|mind)/.test(n)) return 'pulse';
  return 'hash';
}
function BSChannelIcon({ name, size = 20 }) {
  const key = bsChannelKey(name);
  const p = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  if (key === 'hash') return <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: size * 0.92, fontWeight: 700 }}>#</span>;
  const D = {
    strength: <path d="M3 9v6M6 7v10M18 7v10M21 9v6M6 12h12" {...p} />,
    pulse: <path d="M3 12h4l2-5 3 10 2-5h7" {...p} />,
    leaf: <><path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" {...p} /><path d="M5 19c3-4 6-6 10-8" {...p} /></>,
    bike: <><circle cx="6" cy="16" r="3" {...p} /><circle cx="18" cy="16" r="3" {...p} /><path d="M6 16l4-7h5M9 9h5l3 7" {...p} /></>,
    bolt: <path d="M13 3L5 14h5l-1 7 8-11h-5z" {...p} />,
    trophy: <path d="M8 4h8v4a4 4 0 0 1-8 0zM8 6H5a2 2 0 0 0 2 3M16 6h3a2 2 0 0 1-2 3M9 18h6M11 13h2v3h-2z" {...p} />,
    bell: <><path d="M6 9a6 6 0 0 1 12 0c0 5 2 6 2 6H4s2-1 2-6z" {...p} /><path d="M10 19a2 2 0 0 0 4 0" {...p} /></>,
    note: <><path d="M9 17V5l9-2v12" {...p} /><circle cx="7" cy="17" r="2" {...p} /><circle cx="16" cy="15" r="2" {...p} /></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>{D[key]}</svg>;
}
// Demo/preview faces — so the seed community (people with no real account) shows
// real photos in preview mode, demonstrating that avatars appear on bubbles +
// profiles. Real members (with a userId) never use these; they show their own
// photo or initials. Reuses the same Unsplash faces as the presence rail.
const BS_DEMO_FACES = ['1544005313-94ddf0286df2', '1499996860823-5214fcc65f8f', '1507003211169-0a1dd7228f2d', '1500648767791-00dcc994a43e', '1438761681033-6461ffad8d80', '1487412720507-e7ab37603c6f', '1517841905240-472988babdf9', '1534528741775-53994a69daeb', '1531123897727-8f129e1688ce', '1463453091185-61582044d556', '1492562080023-ab3db95bfbce', '1573497019940-1c28c88b4f3e'];
const BS_DEMO_FACE_BY_NAME = { 'Priya Shah': '1544005313-94ddf0286df2', 'Drew Oyelaran': '1499996860823-5214fcc65f8f', 'Casey Morgan': '1507003211169-0a1dd7228f2d', 'Devon Wells': '1500648767791-00dcc994a43e', 'Maya Okafor': '1438761681033-6461ffad8d80', 'Sofia Park': '1487412720507-e7ab37603c6f' };
function bsDemoFace(name) {
  const n = String(name || '').trim();
  if (!n || n === 'You' || n.charAt(0) === '#') return null;
  let id = BS_DEMO_FACE_BY_NAME[n];
  if (!id) { let h = 0; for (let i = 0; i < n.length; i++) h = (h * 31 + n.charCodeAt(i)) >>> 0; id = BS_DEMO_FACES[h % BS_DEMO_FACES.length]; }
  return `https://images.unsplash.com/photo-${id}?w=160&h=160&fit=crop&crop=faces&q=72&auto=format`;
}
// Stable per-channel accent so channels are visually distinct.
const BS_CHANNEL_PALETTE = ['#34d6c5', '#d8a23a', '#8a5cf6', '#e0518a', '#5fae7e', '#c0533b', '#4a9fe0', '#a07a2e'];
function bsChannelColor(name) {
  const s = String(name || '');
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return BS_CHANNEL_PALETTE[h % BS_CHANNEL_PALETTE.length];
}
function BSFacetAvatar({ size = 72, c = '#34d6c5', initial = 'S', photo, rank = 'I', editable = false, onEdit, showRank = true, live = false, onClick, BG = '#100d0a', INK = '#f2ede4' }) {
  const SERIF = "'Newsreader', Georgia, serif", MONO = "'JetBrains Mono', monospace", FTEAL = '#34d6c5';
  const inset = Math.max(2, Math.round(size * 0.055));
  return (
    <div onClick={onClick} style={{ width: size, height: size, flexShrink: 0, position: 'relative', display: 'grid', placeItems: 'center', cursor: onClick ? 'pointer' : 'default' }}>
      {live && <div className="bs-av-pulse" style={{ position: 'absolute', inset: -Math.round(size * 0.1), transform: 'rotate(45deg)', borderRadius: '30%', border: `2px solid ${FTEAL}`, boxShadow: `0 0 12px ${bsTHexA(FTEAL, 0.55)}`, pointerEvents: 'none', animation: 'bsAvPulse 2.4s ease-in-out infinite' }} />}
      {/* gem frame */}
      <div style={{ position: 'absolute', inset: 0, transform: 'rotate(45deg)', borderRadius: '27%', background: `linear-gradient(135deg, ${c}, ${bsShade(c, 0.5)})`, boxShadow: `0 5px 16px ${bsTHexA(c, 0.4)}, inset 1px 1px 2px rgba(255,255,255,0.35)` }}>
        <div style={{ position: 'absolute', inset: 0, borderRadius: '27%', background: 'linear-gradient(135deg, rgba(255,255,255,0.28), transparent 42%)', pointerEvents: 'none' }} />
        {/* portrait window (rotated square clip → rounded diamond) */}
        <div style={{ position: 'absolute', inset, borderRadius: '23%', overflow: 'hidden', background: '#0f0c0a', display: 'grid', placeItems: 'center' }}>
          {photo
            ? <img src={photo} alt="" style={{ position: 'absolute', width: '152%', height: '152%', left: '50%', top: '50%', transform: 'translate(-50%,-50%) rotate(-45deg)', objectFit: 'cover' }} />
            : <span style={{ transform: 'rotate(-45deg)', fontFamily: SERIF, fontWeight: 500, fontSize: size * 0.42, color: INK, lineHeight: 1 }}>{(initial && String(initial).trim()) || '?'}</span>}
        </div>
      </div>
      {editable ? (
        <button onClick={onEdit} aria-label="Change photo" style={{ position: 'absolute', bottom: -2, right: -2, zIndex: 2, width: Math.max(22, Math.round(size * 0.3)), height: Math.max(22, Math.round(size * 0.3)), borderRadius: 999, background: '#34d6c5', color: '#06110e', border: `2px solid ${BG}`, cursor: 'pointer', display: 'grid', placeItems: 'center', fontSize: Math.max(11, Math.round(size * 0.16)), padding: 0 }}>✎</button>
      ) : live ? (
        <span style={{ position: 'absolute', bottom: 0, right: 0, transform: 'translate(20%,20%)', background: BG, borderRadius: 999, padding: 3, boxShadow: `0 0 0 2px ${BG}` }}><span style={{ display: 'block', width: Math.max(6, Math.round(size * 0.13)), height: Math.max(6, Math.round(size * 0.13)), borderRadius: 999, background: FTEAL }} /></span>
      ) : showRank ? (
        <div style={{ position: 'absolute', bottom: -Math.round(size * 0.02), left: '50%', width: Math.max(16, Math.round(size * 0.3)), height: Math.max(16, Math.round(size * 0.3)), transform: 'translate(-50%,40%) rotate(45deg)', borderRadius: '30%', background: BG, display: 'grid', placeItems: 'center', boxShadow: `0 0 0 2px ${BG}` }}>
          <span style={{ transform: 'rotate(-45deg)', fontFamily: MONO, fontSize: Math.max(7, Math.round(size * 0.13)), fontWeight: 600, color: c }}>{rank}</span>
        </div>
      ) : null}
    </div>
  );
}

// Programmatic photo picker (for buttons like Settings → Change photo): opens a
// file dialog, resizes to a small square JPEG, persists to client_identity.photo
// + window.ShapeIdentity, broadcasts shape:identity, and calls back with the URL.
function bsPickProfilePhoto(cb) {
  try {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = 'image/*';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let url = reader.result;
          try { const S = 256, cv = document.createElement('canvas'); cv.width = S; cv.height = S; const ctx = cv.getContext('2d'); const scale = Math.max(S / img.width, S / img.height), w = img.width * scale, h = img.height * scale; ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h); url = cv.toDataURL('image/jpeg', 0.82); } catch (e) {}
          try { window.ShapeIdentity = { ...(window.ShapeIdentity || {}), photo: url }; } catch (e) {}
          const save = async (d) => {
            try {
              const res = await window.shapeDb?.saveUserGoals?.('client_identity', { ...(d || {}), photo: url });
              if (res && res.error) { window.__bsToast?.(/log/i.test(res.error.message || '') ? 'Sign in to save your photo' : "Couldn't save photo — try again", 'err'); }
              else { window.__bsToast?.('Photo updated', 'ok'); }
            } catch (e) { window.__bsToast?.("Couldn't save photo — try again", 'err'); }
          };
          try { const p = window.shapeDb?.getUserGoals?.('client_identity'); if (p && p.then) p.then(save).catch(() => save(null)); else save(null); } catch (e) {}
          try { window.dispatchEvent(new Event('shape:identity')); } catch (e) {}
          if (cb) cb(url);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(f);
    };
    input.click();
  } catch (e) {}
}

// Profile avatar photo — load your saved photo, pick a new one (resized to a
// small square JPEG so it stays light), persist to client_identity.photo +
// window.ShapeIdentity, and broadcast shape:identity so every avatar updates.
function useBSProfilePhoto(person, isSelf) {
  const [photo, setPhoto] = useStateBSC(() => { try { return (isSelf && window.ShapeIdentity && window.ShapeIdentity.photo) || person.photo || null; } catch (e) { return person.photo || null; } });
  const fileRef = React.useRef(null);
  React.useEffect(() => {
    if (isSelf) { try { window.shapeDb?.getUserGoals?.('client_identity').then((d) => { if (d && d.photo) setPhoto(d.photo); }).catch(() => {}); } catch (e) {} }
    else if (person.photo) setPhoto(person.photo);
  }, [isSelf, person.userId]);
  const onPick = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let url = reader.result;
        try {
          const S = 256, cv = document.createElement('canvas'); cv.width = S; cv.height = S;
          const ctx = cv.getContext('2d');
          const scale = Math.max(S / img.width, S / img.height), w = img.width * scale, h = img.height * scale;
          ctx.drawImage(img, (S - w) / 2, (S - h) / 2, w, h);
          url = cv.toDataURL('image/jpeg', 0.82);
        } catch (e2) {}
        setPhoto(url);
        try { window.ShapeIdentity = { ...(window.ShapeIdentity || {}), photo: url }; } catch (e2) {}
        try {
          const save = async (d) => {
            try {
              const res = await window.shapeDb?.saveUserGoals?.('client_identity', { ...(d || {}), photo: url });
              if (res && res.error) { window.__bsToast?.(/log/i.test(res.error.message || '') ? 'Sign in to save your photo' : "Couldn't save photo — try again", 'err'); }
              else { window.__bsToast?.('Photo updated', 'ok'); }
            } catch (e3) { window.__bsToast?.("Couldn't save photo — try again", 'err'); }
          };
          const p = window.shapeDb?.getUserGoals?.('client_identity');
          if (p && p.then) p.then(save).catch(() => save(null)); else save(null);
        } catch (e2) {}
        try { window.dispatchEvent(new Event('shape:identity')); } catch (e2) {}
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(f);
  };
  return { photo, fileRef, onPick };
}

// Profile privacy selector (shown on your OWN profile) — Public / Friends /
// Private. Persists to user_goals('client_settings').profileVisibility, the same
// field Settings → Profile visibility uses and that get_public_profile enforces:
// public = anyone, friends = your circle (shared member DM), private = name+tier.
function BSProfilePrivacy({ teal = '#34d6c5', ink = '#f2ede4' }) {
  const MONO = "'JetBrains Mono', monospace";
  const OPTS = [['public', 'Public'], ['friends', 'Friends'], ['private', 'Private']];
  const LABEL = { public: 'Public', friends: 'Just friends', private: 'Private' };
  const norm = (raw) => { const s = String(raw || '').toLowerCase(); if (s.indexOf('pub') === 0) return 'public'; if (s.indexOf('friend') >= 0 || s.indexOf('circle') >= 0) return 'friends'; return s ? 'private' : 'public'; };
  const [vis, setVis] = useStateBSC('public');
  React.useEffect(() => {
    try { window.shapeDb?.getUserGoals?.('client_settings').then((d) => { if (d && d.profileVisibility) setVis(norm(d.profileVisibility)); }).catch(() => {}); } catch (e) {}
  }, []);
  const pick = (v) => {
    setVis(v);
    try {
      const save = (d) => { try { window.shapeDb?.saveUserGoals?.('client_settings', { ...(d || {}), profileVisibility: LABEL[v] }); } catch (e) {} };
      const p = window.shapeDb?.getUserGoals?.('client_settings');
      if (p && p.then) p.then(save).catch(() => save(null)); else save(null);
    } catch (e) {}
    try { window.dispatchEvent(new CustomEvent('shape:visibility', { detail: v })); } catch (e) {}
  };
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: bsTHexA(ink, 0.5), marginBottom: 7, textAlign: 'center' }}>Who can see your profile</div>
      <div style={{ display: 'flex', gap: 4, background: bsTHexA(ink, 0.05), border: `1px solid ${bsTHexA(ink, 0.1)}`, borderRadius: 12, padding: 3 }}>
        {OPTS.map(([v, l]) => { const on = vis === v; return (
          <button key={v} onClick={() => pick(v)} style={{ flex: 1, cursor: 'pointer', border: 0, borderRadius: 9, padding: '8px 0', background: on ? teal : 'transparent', color: on ? '#04201d' : bsTHexA(ink, 0.7), fontFamily: MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</button>
        ); })}
      </div>
    </div>
  );
}

// Generative contour field — nested closed curves seeded by the member.
function BSTerrainContours({ seed, c, teal, w = 360, h = 290 }) {
  const rng = bsTRng(seed);
  const layers = 9;
  const cxs = 0.5 + (rng() - 0.5) * 0.3;
  const paths = [];
  for (let L = 0; L < layers; L++) {
    const tt = L / (layers - 1);
    const baseR = 0.16 + tt * 0.82;
    const pts = [];
    const N = 26;
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2;
      const wobble = 1 + Math.sin(a * 3 + (seed % 7) + L * 0.6) * 0.09 + Math.cos(a * 5 + L) * 0.05;
      const rr = baseR * wobble;
      pts.push([w * cxs + Math.cos(a) * rr * w * 0.52, h * 0.52 + Math.sin(a) * rr * h * 0.46]);
    }
    paths.push({ d: pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' Z', t: tt });
  }
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="xMidYMid slice" aria-hidden style={{ display: 'block' }}>
      <defs><radialGradient id={`tdc${seed}`} cx={`${cxs * 100}%`} cy="52%" r="60%"><stop offset="0%" stopColor={bsTHexA(c, 0.5)} /><stop offset="40%" stopColor={bsTHexA(c, 0.16)} /><stop offset="100%" stopColor={bsTHexA(c, 0)} /></radialGradient></defs>
      <rect width={w} height={h} fill={`url(#tdc${seed})`} />
      {paths.map((p, i) => <path key={i} d={p.d} fill="none" stroke={i === layers - 3 ? teal : bsTHexA(c, 0.32 + p.t * 0.4)} strokeWidth={i === layers - 3 ? 1.8 : 1} opacity={0.4 + p.t * 0.55} />)}
      <circle cx={w * cxs} cy={h * 0.52} r={4} fill={teal} />
      <circle cx={w * cxs} cy={h * 0.52} r={9} fill="none" stroke={teal} strokeWidth={1} opacity={0.6} />
    </svg>
  );
}

// Ridgeline ascent: start → now → target as a climbed path.
function BSTerrainRidge({ c, teal, ink, arc }) {
  const W = 320, H = 132;
  const ys = [H - 18, H * 0.52, 22];
  const xs = [24, W / 2, W - 24];
  const ridge = `M ${xs[0]} ${ys[0]} Q ${(xs[0] + xs[1]) / 2} ${ys[0] - 26}, ${xs[1]} ${ys[1]} T ${xs[2]} ${ys[2]}`;
  const fill = `${ridge} L ${xs[2]} ${H} L ${xs[0]} ${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
      <defs><linearGradient id="tdr" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={bsTHexA(c, 0.3)} /><stop offset="100%" stopColor={bsTHexA(c, 0)} /></linearGradient></defs>
      <path d={fill} fill="url(#tdr)" />
      <path d={ridge} fill="none" stroke={bsTHexA(ink, 0.25)} strokeWidth={1.5} strokeDasharray="3 4" />
      {arc.map((a, i) => {
        const live = a[2] === 'now', target = a[2] === 'target';
        return (<g key={i}><circle cx={xs[i]} cy={ys[i]} r={live ? 6 : 4.5} fill={live ? teal : target ? 'none' : c} stroke={target ? c : 'none'} strokeWidth={target ? 2 : 0} />{live && <circle cx={xs[i]} cy={ys[i]} r={11} fill="none" stroke={teal} strokeWidth={1} opacity={0.5} />}</g>);
      })}
    </svg>
  );
}

function BSTerrainProfile({ person, onBack, onMessage = () => {}, isSelf = false, onEdit = () => {} }) {
  const BG = '#100d0a', INK = '#f2ede4', TEAL = '#34d6c5';
  const SERIF = "'Newsreader', Georgia, serif", MONO = "'JetBrains Mono', monospace", SANS = "'Space Grotesk', -apple-system, system-ui, sans-serif";
  const [live, setLive] = useStateBSC(null);
  useBSPresence();
  React.useEffect(() => { if (person.userId && window.ShapeProfiles?.getPublicProfile) { window.ShapeProfiles.getPublicProfile(person.userId).then((d) => { if (d) setLive(d); }).catch(() => {}); } }, [person.userId]);
  const isPrivate = !!(live && (live.can_view === false || (live.can_view == null && live.is_public === false)));
  const points = live && Number.isFinite(live.points) ? live.points : null;
  const tierKey = points != null ? bsTierForPoints(points) : (person.tier || bsPostTier(person));
  const c = bsTierColor(tierKey);
  const name = person.who || 'Member';
  const first = name.split(' ')[0];
  const city = person.city || 'Shape community';
  const handle = (live && live.handle) || ('@' + first.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const pronouns = (!isPrivate && live && live.pronouns) || '';
  const score = points != null ? points : 1284;
  const goal = (!isPrivate && ((live && live.goal) || person.goal)) || null;
  const bio = (!isPrivate && ((live && live.bio) || person.bio)) || null;
  const tierName = String(tierKey).charAt(0).toUpperCase() + String(tierKey).slice(1);
  const seed = (() => { let n = 0; const s = String(name); for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i) * (i + 1)) % 99991; return n + 7; })();
  // Illustrative living-identity data (wire to real logs later).
  const streak = 14;
  const disciplines = [['Strength', 0.82], ['Endurance', 0.64], ['Consistency', 0.91], ['Recovery', 0.73]];
  const lifts = [['Squat', '245'], ['Deadlift', '285'], ['Bench', '135']];
  const traj = [176, 175, 174, 173, 172, 171, 171];
  const week = [40, 72, 55, 88, 33, 90, 18];
  const feed = [
    { k: 'PR', t: 'New PR — Back squat', b: 'Six weeks ago this was a hard triple at 225.', metric: ['▲', '+22 lb'], time: '2d', hot: true },
    { k: 'Workout', t: 'Lower push · this week', b: 'Bar speed stayed crisp through the last rep — first time at this weight.', metric: ['Squat', '245×5'], time: '2h' },
    { k: 'Note', t: 'Leaving 2 in the tank', b: 'Stopped maxing every week. Everything started moving. Boring works.', time: '1d' },
    { k: 'Run', t: 'Sunrise shakeout', b: '5.2 km easy. Legs felt springy after yesterday’s pulls.', metric: ['5K', '24:51'], time: '3d' },
  ];
  // Ridgeline hero fields (illustrative — wire to real program/coach/goal later).
  const progressPct = 84, statusLabel = 'In training', summit = goal || '1.5× bodyweight';
  const block = 'Week 6 of 12', program = 'Hypertrophy Block II', startLabel = "Feb ’25 — start";
  const coachName = 'Maya Okafor', coachInit = 'MO';
  const Kick = ({ children, col }) => <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: col || bsTHexA(INK, 0.5), fontWeight: 600 }}>{children}</span>;
  const maxTraj = Math.max(...traj), minTraj = Math.min(...traj);
  const sparkPath = traj.map((v, i) => [(i / (traj.length - 1)) * 150, 34 - ((v - minTraj) / (maxTraj - minTraj || 1)) * 28 - 3]).map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const maxWk = Math.max(...week);
  const card = { background: bsTHexA(INK, 0.04), border: `1px solid ${bsTHexA(INK, 0.08)}`, borderRadius: 14 };
  const { photo, fileRef, onPick } = useBSProfilePhoto(person, isSelf);
  // On your OWN profile the climb is wired to real data, and you can choose what
  // it tracks: body weight (goal + weigh-ins), Shape Score (→ next tier), or day
  // streak. Others always see the body-weight climb (derived/demo).
  const CLIMB_SOURCES = [{ key: 'weight', label: 'Body weight' }, { key: 'score', label: 'Shape Score' }, { key: 'streak', label: 'Day streak' }];
  const [realGoal, setRealGoal] = useStateBSC(null);
  const [climbSource, setClimbSource] = useStateBSC('weight');
  const prog = useBSProgram();
  const [coachReal, setCoachReal] = useStateBSC(null);
  React.useEffect(() => {
    if (!isSelf) return;
    let alive = true;
    (async () => {
      let doc = null, weigh = null, climb = null;
      try { doc = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_goals') : null; } catch (e) {}
      try { weigh = window.ShapeWeighIns?.list ? await window.ShapeWeighIns.list() : null; } catch (e) {}
      try { climb = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_climb') : null; } catch (e) {}
      if (!alive) return;
      const o = (doc && doc.overall && typeof doc.overall === 'object') ? { ...doc.overall } : null;
      let merged = o;
      if (Array.isArray(weigh) && weigh.length) merged = { ...(o || {}), weighIns: weigh, now: Number(weigh[weigh.length - 1].kg) };
      if (merged && (merged.start != null || merged.target != null || merged.now != null)) setRealGoal(merged);
      if (climb && climb.source) setClimbSource(climb.source);
    })();
    return () => { alive = false; };
  }, [isSelf]);
  React.useEffect(() => {
    if (!isSelf || !window.ShapeMessages?.listDirectCoachThreads) return;
    let alive = true;
    window.ShapeMessages.listDirectCoachThreads().then(list => { if (alive && Array.isArray(list) && list.length) { const co = list[0]; const nm = co.who || co.name || co.full_name; if (nm) setCoachReal({ name: nm, init: bsInitials(nm) || 'C' }); } }).catch(() => {});
    return () => { alive = false; };
  }, [isSelf]);
  const pickClimb = (k) => { setClimbSource(k); try { window.shapeDb?.saveUserGoals?.('client_climb', { source: k }); } catch (e) {} };
  // Field notes / log — wired to your real logged activities on your own profile.
  const [realFeed, setRealFeed] = useStateBSC(null);
  React.useEffect(() => {
    if (!isSelf || !window.ShapeActivities?.list) return;
    let alive = true;
    const ago = (iso) => {
      if (!iso) return '';
      const d = new Date(iso); if (isNaN(d)) return '';
      const m = Math.max(0, Math.round((Date.now() - d.getTime()) / 60000));
      if (m < 60) return `${m || 1}m`;
      const h = Math.round(m / 60); if (h < 24) return `${h}h`;
      const days = Math.round(h / 24); if (days < 7) return `${days}d`;
      const w = Math.round(days / 7); return w < 5 ? `${w}w` : d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    };
    const cap = (s) => String(s || 'Workout').replace(/[_-]+/g, ' ').replace(/\b\w/g, (x) => x.toUpperCase());
    (async () => {
      let d = null;
      try { d = await window.ShapeActivities.list(); } catch (e) {}
      if (!alive) return;
      const acts = (d && Array.isArray(d.activities)) ? d.activities : [];
      const mapped = acts.slice(0, 6).map((a) => {
        const type = cap(a.activity_type);
        const km = Number(a.distance_km), min = Number(a.duration_min), kcal = Number(a.calories);
        const bits = [];
        if (Number.isFinite(km) && km > 0) bits.push(`${Math.round(km * 10) / 10} km`);
        if (Number.isFinite(min) && min > 0) bits.push(`${min} min`);
        if (Number.isFinite(kcal) && kcal > 0) bits.push(`${Math.round(kcal)} kcal`);
        let metric = null;
        if (Number.isFinite(km) && km > 0 && Number.isFinite(min) && min > 0) metric = [`${Math.round(km * 10) / 10}K`, `${min} min`];
        else if (Number.isFinite(min) && min > 0) metric = ['Time', `${min} min`];
        else if (Number.isFinite(kcal) && kcal > 0) metric = ['Burn', `${Math.round(kcal)} kcal`];
        return { k: type, t: a.title || `${type} session`, b: bits.length ? bits.join(' · ') : 'Logged.', metric, time: ago(a.started_at), hot: false };
      });
      if (mapped.length) setRealFeed(mapped);
    })();
    return () => { alive = false; };
  }, [isSelf]);
  const feedEff = (isSelf && realFeed && realFeed.length) ? realFeed : feed;
  const realArc = (realGoal && realGoal.start != null && realGoal.target != null) ? (() => {
    const unit = realGoal.unit || 'kg';
    const s = Number(realGoal.start), n = Number(realGoal.now != null ? realGoal.now : s), tg = Number(realGoal.target);
    const fmt = (v) => `${Math.round(v * 10) / 10} ${unit}`;
    const span = Math.abs(tg - s);
    return { arc: [[realGoal.startMonth || 'Start', fmt(s), 'start'], ['Now', fmt(n), 'now'], ['Target', fmt(tg), 'target']], pct: span < 0.01 ? 0.5 : Math.max(0.04, Math.min(0.98, Math.abs(n - s) / span)), summit: realGoal.title || fmt(tg) };
  })() : null;
  const climbCfg = (() => {
    if (isSelf && climbSource === 'score') {
      const pts = (typeof window !== 'undefined' && window.ShapeScore && Number(window.ShapeScore.points)) || (points || 0);
      const TH = [0, 750, 2000, 5000, 15000], NM = ['Base', 'Tempo', 'Form', 'Peak', 'Legend'];
      let i = 0; for (let j = 0; j < TH.length; j++) if (pts >= TH[j]) i = j;
      const last = i >= TH.length - 1, floor = TH[i], next = last ? TH[i] : TH[i + 1], nextName = last ? NM[i] : NM[i + 1];
      return { arc: [[NM[i], `${floor.toLocaleString()} pts`, 'start'], ['Now', `${pts.toLocaleString()} pts`, 'now'], [nextName, `${next.toLocaleString()} pts`, 'target']], pct: last ? 1 : Math.max(0.04, Math.min(0.98, (pts - floor) / Math.max(1, next - floor))), summit: last ? 'Legend tier' : `${nextName} tier` };
    }
    if (isSelf && climbSource === 'streak') {
      const s = Number(streak) || 0, target = Math.max(7, Math.ceil((s + 1) / 7) * 7);
      return { arc: [['Start', 'Day 0', 'start'], ['Now', `${s} days`, 'now'], ['Goal', `${target} days`, 'target']], pct: Math.max(0.04, Math.min(0.98, target ? s / target : 0)), summit: `${target}-day streak` };
    }
    return realArc || { arc: (person.arc || [['Feb ’25', 'Started', 'start'], ['Now', `${progressPct}% there`, 'now'], ['Target', summit, 'target']]), pct: Math.max(0.05, Math.min(0.96, (progressPct || 0) / 100)), summit };
  })();
  const arc = climbCfg.arc;
  const pct = climbCfg.pct;
  const pctLabel = Math.round(pct * 100);
  const summitEff = climbCfg.summit;
  // Coached-by band — real program phase + linked coach on your own profile.
  const blockEff = (isSelf && prog && prog.trainingPhase) ? 'Current phase' : block;
  const programEff = (isSelf && prog && (prog.trainingPhase || prog.nutritionPhase)) ? [prog.trainingPhase, prog.nutritionPhase].filter(Boolean).join(' · ') : program;
  const coachNameEff = coachReal ? coachReal.name : coachName;
  const coachInitEff = coachReal ? coachReal.init : coachInit;
  const memberSinceLabel = (isSelf && (() => { try { const cs = window.ShapeAuth?.getCachedState?.(); const ca = cs && cs.user && cs.user.created_at; if (ca) { const dt = new Date(ca); if (!isNaN(dt)) return dt.toLocaleDateString([], { month: 'short', year: 'numeric' }); } } catch (e) {} return null; })()) || person.since || 'Feb 2024';
  const since = memberSinceLabel;
  const stravaUrl = person.strava
    ? (/^https?:/i.test(person.strava) ? person.strava : 'https://www.strava.com/athletes/' + String(person.strava).replace(/^@/, ''))
    : 'https://www.strava.com';
  const avPhoto = photo || (live && live.avatar);
  return (
    <div className="bs-scroll" style={{ position: 'absolute', inset: 0, background: BG, color: INK, overflowY: 'auto', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', display: 'flex', flexDirection: 'column' }}>
      {isSelf && <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />}
      {/* back + your-avatar/settings corner (top-right, matches the rest of the app) */}
      <div style={{ padding: '48px 18px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <button onClick={onBack} style={{ background: bsTHexA(INK, 0.06), border: `1px solid ${bsTHexA(INK, 0.18)}`, color: INK, borderRadius: 999, padding: '7px 13px', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>← Back</button>
        <BSMeCorner size={30} />
      </div>
      {/* TERRAIN hero — ascent-profile card: you-are-here on the climb (facet avatar) */}
      <div style={{ padding: '14px 18px 0' }}>
        {(() => {
          const W = 330, H = 220;
          const base = [10, H - 26], peak = [W - 26, 34];
          const ridge = `M ${base[0]} ${base[1]} Q ${W * 0.4} ${H - 40}, ${W * 0.62} ${H * 0.5} T ${peak[0]} ${peak[1]}`;
          // Clamp the you-are-here marker so it tracks progress but never climbs
          // into the summit-flag corner (where it overlapped + clipped the card).
          const hp = Math.max(0.05, Math.min(pct, 0.66));
          const here = { x: base[0] + (peak[0] - base[0]) * hp, y: base[1] + (peak[1] - base[1]) * hp };
          return (
          <div style={{ borderRadius: 20, overflow: 'hidden', border: `1px solid ${bsTHexA(INK, 0.12)}`, background: `linear-gradient(180deg, ${bsTHexA(c, 0.16)}, ${bsTHexA(INK, 0.02)})`, position: 'relative' }}>
            <svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden style={{ display: 'block' }}>
              <defs><linearGradient id={`asc${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={bsTHexA(c, 0.32)} /><stop offset="100%" stopColor={bsTHexA(c, 0)} /></linearGradient></defs>
              {[0, 1, 2, 3].map((i) => <line key={i} x1="0" y1={(i + 1) * H / 5} x2={W} y2={(i + 1) * H / 5} stroke={bsTHexA(INK, 0.06)} strokeWidth="1" />)}
              <path d={`${ridge} L ${peak[0]} ${H} L ${base[0]} ${H} Z`} fill={`url(#asc${seed})`} />
              <path d={ridge} fill="none" stroke={bsTHexA(INK, 0.4)} strokeWidth="1.5" />
              <path d={ridge} fill="none" stroke={TEAL} strokeWidth="2.5" strokeDasharray={`${pct * 360} 999`} strokeLinecap="round" />
              <line x1={peak[0]} y1={peak[1]} x2={peak[0]} y2={peak[1] - 22} stroke={bsTHexA(INK, 0.6)} strokeWidth="1.5" />
              <path d={`M ${peak[0]} ${peak[1] - 22} l 16 5 l -16 5 z`} fill={'#e0644b'} />
              <circle cx={peak[0]} cy={peak[1]} r="3.5" fill={'#e0644b'} />
              <circle cx={base[0]} cy={base[1]} r="3.5" fill={bsTHexA(INK, 0.5)} />
            </svg>
            {/* you-are-here FACET badge */}
            <div style={{ position: 'absolute', left: `calc(${(here.x / W) * 100}% - 28px)`, top: `calc(${(here.y / H) * 100}% - 64px)` }}>
              <BSFacetAvatar size={56} c={c} initial={bsInitials(name) || '?'} photo={avPhoto} rank={bsTierRank(tierKey)} editable={isSelf} live={isSelf ? bsAmLive() : bsIsUserOnline(person.userId)} onEdit={() => fileRef.current && fileRef.current.click()} BG={BG} INK={INK} />
              <div style={{ position: 'absolute', top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: 5, whiteSpace: 'nowrap', fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEAL, background: bsTHexA('#0c1110', 0.85), padding: '2px 6px', borderRadius: 4 }}>You · {pctLabel}%</div>
            </div>
            {/* base + summit labels (chip-backed so they read cleanly over the terrain) */}
            <div style={{ position: 'absolute', left: 12, bottom: 12, fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(INK, 0.55), background: bsTHexA('#0c1110', 0.7), padding: '2px 6px', borderRadius: 4 }}>{arc[0][0]} · start</div>
            <div style={{ position: 'absolute', left: 12, top: 12, fontFamily: MONO, fontSize: 8, lineHeight: 1.35, letterSpacing: '0.1em', textTransform: 'uppercase', color: '#e0644b', textAlign: 'left', background: bsTHexA('#0c1110', 0.7), padding: '3px 7px', borderRadius: 5 }}>Summit<br />{summitEff}</div>
            {/* identity strip */}
            <div style={{ padding: 16, borderTop: `1px solid ${bsTHexA(INK, 0.08)}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ minWidth: 0 }}>
                <h1 style={{ fontFamily: SERIF, fontSize: 30, fontWeight: 400, letterSpacing: '-0.03em', margin: 0, lineHeight: 0.95 }}>{name}</h1>
                <div style={{ fontFamily: MONO, fontSize: 10.5, color: bsTHexA(INK, 0.55), marginTop: 7 }}>{handle}{pronouns ? ` · ${pronouns}` : ''}{city ? ` · ${city}` : ''}</div>
              </div>
              <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEAL, background: bsTHexA(TEAL, 0.12), border: `1px solid ${bsTHexA(TEAL, 0.4)}`, borderRadius: 999, padding: '5px 11px', whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 999, background: TEAL, flex: 'none' }} />{statusLabel}</span>
            </div>
            {/* coached-by band */}
            <div style={{ padding: '0 16px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 13, background: bsTHexA(TEAL, 0.07), border: `1px solid ${bsTHexA(TEAL, 0.22)}` }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: TEAL }}>{blockEff}</div>
                  <div style={{ fontFamily: SANS, fontSize: 13.5, color: bsTHexA(INK, 0.85), marginTop: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{programEff}</div>
                </div>
                <div style={{ width: 1, alignSelf: 'stretch', background: bsTHexA(INK, 0.12) }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                  <div style={{ width: 30, height: 30, borderRadius: 999, flex: 'none', background: bsTHexA(TEAL, 0.18), border: `1px solid ${bsTHexA(TEAL, 0.5)}`, color: TEAL, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{coachInitEff}</div>
                  <div><div style={{ fontFamily: MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(INK, 0.45) }}>Coached by</div><div style={{ fontFamily: SANS, fontSize: 12.5, color: bsTHexA(INK, 0.85), marginTop: 2 }}>{coachNameEff}</div></div>
                </div>
              </div>
            </div>
          </div>
          );
        })()}
      </div>

      <div style={{ flex: 1, padding: '24px 22px 28px' }}>
        {isPrivate ? (
          <div style={{ ...card, padding: '18px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
            <span aria-hidden style={{ fontSize: 16 }}>🔒</span>
            <div style={{ fontFamily: SANS, fontSize: 14, color: bsTHexA(INK, 0.7), lineHeight: 1.5 }}>{live && live.visibility === 'friends' ? `${first} shares their terrain with friends — connect to see the full climb.` : `${first} keeps their terrain private — only their name and tier are shown.`}</div>
          </div>
        ) : (
          <>
            {/* THE CLIMB — start → now → summit ridgeline (the goal at the top) */}
            <div style={{ marginBottom: 28 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14, gap: 10 }}>
                <Kick>The climb</Kick>
                <span style={{ fontFamily: MONO, fontSize: 10, color: bsTHexA(INK, 0.5), whiteSpace: 'nowrap' }}>Member since {since} · <a href={stravaUrl} target="_blank" rel="noopener noreferrer" style={{ color: c, textDecoration: 'none' }}>Strava ↗</a></span>
              </div>
              {isSelf && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 14, flexWrap: 'wrap' }}>
                  {CLIMB_SOURCES.map((s) => { const on = climbSource === s.key; return (
                    <button key={s.key} onClick={() => pickClimb(s.key)} style={{ padding: '5px 11px', borderRadius: 999, border: `1px solid ${on ? TEAL : bsTHexA(INK, 0.18)}`, background: on ? bsTHexA(TEAL, 0.14) : 'transparent', color: on ? TEAL : bsTHexA(INK, 0.6), fontFamily: MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{s.label}</button>
                  ); })}
                </div>
              )}
              {(() => {
                const W = 320, H = 132; const ys = [H - 18, H * 0.52, 22]; const xs = [24, W / 2, W - 24];
                const rg = `M ${xs[0]} ${ys[0]} Q ${(xs[0] + xs[1]) / 2} ${ys[0] - 26}, ${xs[1]} ${ys[1]} T ${xs[2]} ${ys[2]}`;
                return (
                <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} aria-hidden style={{ display: 'block', overflow: 'visible' }}>
                  <defs><linearGradient id={`tdr${seed}`} x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={bsTHexA(c, 0.3)} /><stop offset="100%" stopColor={bsTHexA(c, 0)} /></linearGradient></defs>
                  <path d={`${rg} L ${xs[2]} ${H} L ${xs[0]} ${H} Z`} fill={`url(#tdr${seed})`} />
                  <path d={rg} fill="none" stroke={bsTHexA(INK, 0.25)} strokeWidth="1.5" strokeDasharray="3 4" />
                  {arc.map((a, i) => { const liveDot = a[2] === 'now', target = a[2] === 'target'; return (
                    <g key={i}>
                      <circle cx={xs[i]} cy={ys[i]} r={liveDot ? 6 : 4.5} fill={liveDot ? TEAL : target ? 'none' : c} stroke={target ? c : 'none'} strokeWidth={target ? 2 : 0} />
                      {liveDot && <circle cx={xs[i]} cy={ys[i]} r={11} fill="none" stroke={TEAL} strokeWidth="1" opacity="0.5" />}
                    </g>
                  ); })}
                </svg>
                );
              })()}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
                {arc.map((a, i) => (
                  <div key={i} style={{ flex: 1, textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center' }}>
                    <div style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', color: a[2] === 'now' ? TEAL : bsTHexA(INK, 0.5) }}>{a[0]}</div>
                    <div style={{ fontFamily: SANS, fontSize: 12, color: bsTHexA(INK, 0.85), marginTop: 4 }}>{a[1]}</div>
                  </div>
                ))}
              </div>
            </div>

            {(goal || bio) && <div style={{ background: bsTHexA(c, 0.08), border: `1px solid ${bsTHexA(c, 0.22)}`, borderRadius: 16, padding: '16px 18px', marginBottom: 26 }}><Kick col={c}>⛰ Why</Kick><div style={{ fontFamily: SERIF, fontSize: 21, fontStyle: 'italic', letterSpacing: '-0.01em', lineHeight: 1.15, marginTop: 8 }}>{goal || bio}</div></div>}

            <div style={{ marginBottom: 28 }}>
              <Kick>Living signals</Kick>
              <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
                <div style={{ flex: 'none', width: 96, background: bsTHexA(c, 0.08), border: `1px solid ${bsTHexA(c, 0.2)}`, borderRadius: 14, padding: '13px 14px' }}>
                  <div style={{ fontFamily: SERIF, fontSize: 28, letterSpacing: '-0.02em', lineHeight: 1 }}>{streak}</div>
                  <div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5), marginTop: 6 }}>Day streak</div>
                </div>
                <div style={{ flex: 1, ...card, padding: '13px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 9 }}><span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5) }}>Weekly momentum</span><span style={{ fontFamily: MONO, fontSize: 10, color: TEAL }}>today ↑</span></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 30 }}>{week.map((v, i) => <div key={i} style={{ flex: 1, height: `${Math.max(8, (v / maxWk) * 100)}%`, background: i === week.length - 2 ? TEAL : bsTHexA(c, 0.5), borderRadius: 2 }} />)}</div>
                </div>
              </div>
              <div style={{ marginTop: 9, ...card, padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ flex: 'none' }}><div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', color: TEAL }}>−5 lb</div><div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5), marginTop: 5 }}>Trajectory</div></div>
                <svg viewBox="0 0 150 34" width="150" height="34" style={{ flex: 1 }}><path d={sparkPath} fill="none" stroke={c} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <div style={{ fontFamily: SANS, fontSize: 11, color: bsTHexA(INK, 0.5), flex: 'none' }}>16-wk recomp</div>
              </div>
            </div>

            <div style={{ marginBottom: 28 }}>
              <Kick>Disciplines · strata</Kick>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginTop: 12 }}>
                {disciplines.map(([label, val], i) => { const col = i === disciplines.length - 1 ? TEAL : c; return (
                  <div key={label}><div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 5 }}><span style={{ fontFamily: SANS, fontSize: 13, color: bsTHexA(INK, 0.85) }}>{label}</span><span style={{ fontFamily: MONO, fontSize: 11, color: bsTHexA(INK, 0.5) }}>{Math.round(val * 100)}</span></div><div style={{ height: 7, borderRadius: 4, background: bsTHexA(INK, 0.08), overflow: 'hidden' }}><div style={{ height: '100%', width: `${val * 100}%`, background: `linear-gradient(90deg, ${bsTHexA(col, 0.5)}, ${col})`, borderRadius: 4 }} /></div></div>
                ); })}
              </div>
            </div>

            <div style={{ display: 'flex', gap: 9, marginBottom: 28 }}>
              {lifts.map(([label, val]) => <div key={label} style={{ flex: 1, ...card, borderRadius: 13, padding: '14px 8px', textAlign: 'center' }}><div style={{ fontFamily: SERIF, fontSize: 24, letterSpacing: '-0.02em' }}>{val}</div><div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5), marginTop: 5 }}>{label}</div></div>)}
            </div>

            <div>
              <Kick>Field notes · log</Kick>
              <div style={{ position: 'relative', paddingLeft: 26, marginTop: 16 }}>
                <div style={{ position: 'absolute', left: 6, top: 6, bottom: 10, width: 0, borderLeft: `1.5px dashed ${bsTHexA(c, 0.4)}` }} />
                {feedEff.map((it, i) => (
                  <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
                    <div style={{ position: 'absolute', left: -26, top: 15, width: 14, height: 14, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><div style={{ width: 9, height: 9, transform: 'rotate(45deg)', background: BG, border: `2px solid ${it.hot ? TEAL : c}` }} /></div>
                    <div style={{ ...card, padding: '13px 15px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: it.hot ? TEAL : c }}>▲ {it.k}</span><span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: bsTHexA(INK, 0.4) }}>{it.time}</span></div>
                      <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.01em', lineHeight: 1.15, marginTop: 9 }}>{it.t}</div>
                      <p style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: bsTHexA(INK, 0.72), margin: '6px 0 0' }}>{it.b}</p>
                      {it.metric && <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 11 }}><div style={{ flex: 1, height: 1, background: bsTHexA(INK, 0.12) }} /><span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: bsTHexA(INK, 0.55) }}>{it.metric[0]}</span><span style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: it.hot ? TEAL : INK }}>{it.metric[1]}</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>

      {/* dock — always-available Message / Edit (+ privacy on your own) */}
      <div style={{ position: 'sticky', bottom: 0, flex: '0 0 auto', padding: '14px 18px calc(16px + env(safe-area-inset-bottom, 0px))', background: `linear-gradient(180deg, transparent, ${BG} 32%)` }}>
        {isSelf && <BSProfilePrivacy teal={TEAL} ink={INK} />}
        {isSelf ? (
          <button onClick={onEdit} style={{ width: '100%', minHeight: 48, borderRadius: 999, background: TEAL, color: '#04201d', border: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Edit profile →</button>
        ) : (
          <button onClick={() => onMessage(person)} style={{ width: '100%', minHeight: 48, borderRadius: 999, background: TEAL, color: '#04201d', border: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Message {first} →</button>
        )}
      </div>
    </div>
  );
}

// ── Coach "Signal" public profile (Living Identity direction) ────────────────
// Coaches get a circular "instrument": concentric discipline rings + a cardiac
// week trace + a portrait core, then living signals, discipline legend, track
// record, recent win, field notes, and the marketplace blocks (certifications,
// services & prices, reviews). Tier (coach ladder) is the atmosphere color.
// Name/tier/city/bio/points/privacy are live; the rest is illustrative for now.
function BSSignalSigil({ week, disciplines, c, teal, ink, size = 240 }) {
  const cx = size / 2, R = size / 2;
  const reduced = typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const n = week.length;
  const pts = week.map((v, i) => {
    const a = (-90 + (i / n) * 360) * Math.PI / 180;
    const rr = R * (0.83 - 0.08 + (v / 100) * 0.14);
    return [cx + rr * Math.cos(a), cx + rr * Math.sin(a)];
  });
  const tracePath = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ') + ' Z';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden style={{ display: 'block' }}>
      <defs>
        <radialGradient id="sgcore" cx="50%" cy="50%" r="50%"><stop offset="0%" stopColor={teal} /><stop offset="55%" stopColor={c} /><stop offset="100%" stopColor={bsTHexA(c, 0)} /></radialGradient>
        <filter id="sgglow"><feGaussianBlur stdDeviation="3.2" /></filter>
      </defs>
      {Array.from({ length: 60 }).map((_, i) => {
        const a = (i / 60) * Math.PI * 2, r0 = R * 0.97, r1 = R * (i % 5 === 0 ? 0.9 : 0.94);
        return <line key={i} x1={cx + r0 * Math.cos(a)} y1={cx + r0 * Math.sin(a)} x2={cx + r1 * Math.cos(a)} y2={cx + r1 * Math.sin(a)} stroke={bsTHexA(ink, i % 5 === 0 ? 0.32 : 0.14)} strokeWidth={i % 5 === 0 ? 1.4 : 0.8} />;
      })}
      {disciplines.map(([label, val], i) => {
        const rr = R * (0.74 - i * 0.135), sweep = val * 320, a0 = -90 * Math.PI / 180, a1 = (-90 + sweep) * Math.PI / 180, large = sweep > 180 ? 1 : 0;
        const col = i === 0 ? c : i === disciplines.length - 1 ? teal : bsTHexA(c, 0.7);
        return (<g key={label}><circle cx={cx} cy={cx} r={rr} fill="none" stroke={bsTHexA(ink, 0.07)} strokeWidth={5} /><path d={`M ${cx + rr * Math.cos(a0)} ${cx + rr * Math.sin(a0)} A ${rr} ${rr} 0 ${large} 1 ${cx + rr * Math.cos(a1)} ${cx + rr * Math.sin(a1)}`} fill="none" stroke={col} strokeWidth={5} strokeLinecap="round" /></g>);
      })}
      <path d={tracePath} fill="none" stroke={teal} strokeWidth={1.6} opacity={0.85} filter="url(#sgglow)" />
      <path d={tracePath} fill="none" stroke={teal} strokeWidth={1} opacity={0.9} />
      <circle cx={cx} cy={cx} r={R * 0.2} fill="url(#sgcore)" />
      {/* orbiting live blip — circles the portrait core continuously */}
      <g>
        <circle cx={cx} cy={cx - R * 0.83} r={7.5} fill={teal} opacity={0.3} />
        <circle cx={cx} cy={cx - R * 0.83} r={3.4} fill={teal} />
        {!reduced && <animateTransform attributeName="transform" attributeType="XML" type="rotate" from={`0 ${cx} ${cx}`} to={`360 ${cx} ${cx}`} dur="7s" repeatCount="indefinite" />}
      </g>
    </svg>
  );
}

function BSSignalCoachProfile({ person, onBack, onMessage = () => {}, isSelf = false, onEdit = () => {} }) {
  const BG = '#100d0a', INK = '#f2ede4', TEAL = '#34d6c5';
  const SERIF = "'Newsreader', Georgia, serif", MONO = "'JetBrains Mono', monospace", SANS = "'Space Grotesk', -apple-system, system-ui, sans-serif";
  const [live, setLive] = useStateBSC(null);
  useBSPresence();
  React.useEffect(() => { if (person.userId && window.ShapeProfiles?.getPublicProfile) { window.ShapeProfiles.getPublicProfile(person.userId).then((d) => { if (d) setLive(d); }).catch(() => {}); } }, [person.userId]);
  const isPrivate = !!(live && (live.can_view === false || (live.can_view == null && live.is_public === false)));
  const isNutri = person.kind === 'NUTRI';
  const points = live && Number.isFinite(live.points) ? live.points : null;
  const baseTier = points != null ? bsTierForPoints(points) : (person.tier || bsPostTier(person));
  const tierName = bsCoachTier(baseTier);
  const c = bsTierColor(String(tierName).toLowerCase());
  const name = person.who || (isNutri ? 'Nutritionist' : 'Coach');
  const first = name.split(' ')[0];
  const city = person.city || 'Shape community';
  const handle = (live && live.handle) || ('@' + first.toLowerCase().replace(/[^a-z0-9]/g, ''));
  const pronouns = (!isPrivate && live && live.pronouns) || '';
  const score = points != null ? points : 4970;
  const roleLabel = isNutri ? 'Nutritionist · RD' : 'Trainer · CPT';
  const philosophy = (!isPrivate && ((live && live.goal) || (live && live.bio) || person.bio)) || (isNutri ? 'Fuel the work you’re doing.' : 'Get strong, stay strong.');
  const disLabel = isNutri ? 'Practice focus' : 'Coaching focus';
  const disciplines = isNutri ? [['Performance', 0.9], ['Gut health', 0.82], ['Iron & ferritin', 0.86], ['Recovery', 0.8]] : [['Strength', 0.95], ['Hypertrophy', 0.88], ['Powerlifting', 0.8], ['Form audit', 0.92]];
  const lifts = isNutri ? [['Clients', '200+'], ['Rating', '4.95'], ['Years', '7']] : [['Clients', '90+'], ['Rating', '4.97'], ['Years', '9']];
  const week = [88, 60, 92, 70, 95, 50, 80];
  const certs = isNutri
    ? [['RD', 'Registered Dietitian', '2018'], ['CSSD', 'Sports Dietetics Specialist', '2020'], ['FODMAP', 'Monash FODMAP-trained', '2022']]
    : [['NASM-CPT', 'Certified Personal Trainer', '2016'], ['USAW-L1', 'USA Weightlifting', '2020'], ['FMS-L2', 'Functional Movement Screen', '2021']];
  const offerings = isNutri
    ? [['Meal plan', 'Custom meal plan', '2 weeks, built to your macros', '$60'], ['Program', '6-week nutrition program', 'Plan + weekly adjustments', '$220'], ['Coaching', 'Monthly coaching', 'Plans, labs review, accountability', '$160/mo'], ['Consult', 'Intro call', '15 min — see if we’re a fit', 'Free']]
    : [['Workout', 'Single 1:1 session', '60 min, in-person or remote', '$32'], ['Program', '6-week strength block', 'Custom programming + check-ins', '$240'], ['Coaching', 'Monthly coaching', 'Full programming + daily chat', '$180/mo'], ['Consult', 'Intro call', '15 min — see if we’re a fit', 'Free']];
  const rating = isNutri ? '4.95' : '4.97', reviewCount = isNutri ? 198 : 284;
  const reviews = isNutri
    ? [['Sofia M.', 'SM', 300, 'She found my low ferritin before any doctor did. I train 50% more volume now.'], ['Diego R.', 'DR', 200, 'Learned what fueling a lifting block actually looks like. Clearest plans I’ve seen.']]
    : [['Priya S.', 'PS', 168, '+60 lb on my deadlift in 14 weeks without a single bad-back day.'], ['Marcus L.', 'ML', 220, 'World-class programming. She books up fast — plan ahead, it’s worth it.']];
  const relation = isNutri ? ['Recent win', 'Sofia M.', 'SM', 300, 'Found her low ferritin before any doctor did — training volume up 50%.'] : ['Recent win', 'Jonah W.', 'JW', 200, 'Pulled 2× bodyweight after 8 months — never touched a barbell before me.'];
  const feed = isNutri
    ? [['Tip', 'Always tired? Check ferritin before macros', 'Half the “low energy” DMs I get are iron, not calories.', '3d'], ['Win', 'Sofia’s training volume up 50%', 'Fix the input, the output follows.', '5d']]
    : [['Tip', 'The 3 cues that fix most squats', 'Brace, spread the floor, own the bottom. Save this for leg day.', '2d'], ['Win', 'Jonah pulled 2× bodyweight today', 'Showed up every week. That’s the whole secret.', '4d']];
  const Kick = ({ children, col }) => <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: col || bsTHexA(INK, 0.5), fontWeight: 600 }}>{children}</span>;
  const card = { background: bsTHexA(INK, 0.04), border: `1px solid ${bsTHexA(INK, 0.08)}`, borderRadius: 14 };
  const initials = bsInitials(name) || (person.init || '?');
  const { photo, fileRef, onPick } = useBSProfilePhoto(person, isSelf);
  return (
    <div className="bs-scroll" style={{ position: 'absolute', inset: 0, background: BG, color: INK, overflowY: 'auto', fontFamily: SANS, WebkitFontSmoothing: 'antialiased', display: 'flex', flexDirection: 'column' }}>
      {isSelf && <input ref={fileRef} type="file" accept="image/*" onChange={onPick} style={{ display: 'none' }} />}
      <div style={{ flex: 1, padding: '46px 22px 28px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onBack} style={{ background: 'transparent', border: `1px solid ${bsTHexA(INK, 0.18)}`, color: INK, borderRadius: 999, padding: '7px 13px', cursor: 'pointer', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase' }}>← Back</button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <Kick col={c}>{tierName} · coach</Kick>
            <BSMeCorner size={30} />
          </div>
        </div>

        {/* the instrument — discipline rings around a portrait core */}
        <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', marginTop: 18 }}>
          <BSSignalSigil week={week} disciplines={disciplines} c={c} teal={TEAL} ink={INK} size={240} />
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}>
            <BSFacetAvatar size={86} c={c} initial={initials} photo={photo || (live && live.avatar)} rank={bsTierRank(baseTier)} editable={isSelf} live={isSelf ? bsAmLive() : bsIsUserOnline(person.userId)} onEdit={() => fileRef.current && fileRef.current.click()} BG={BG} INK={INK} />
          </div>
        </div>

        {/* name block */}
        <div style={{ textAlign: 'center', marginTop: 14 }}>
          <h1 style={{ fontFamily: SERIF, fontSize: 38, fontWeight: 400, letterSpacing: '-0.03em', margin: 0, lineHeight: 0.98 }}>{name}</h1>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 8, fontFamily: MONO, fontSize: 11, color: bsTHexA(INK, 0.55), flexWrap: 'wrap' }}>
            <span>{handle}</span>{pronouns ? <><span style={{ opacity: 0.4 }}>·</span><span>{pronouns}</span></> : null}<span style={{ opacity: 0.4 }}>·</span><span>{city}</span>
          </div>
          <div style={{ marginTop: 9 }}><span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: c }}>{roleLabel}</span></div>
        </div>

        {/* hero stat */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 20, ...card, borderRadius: 16, padding: '14px 16px' }}>
          <div style={{ flex: 'none' }}><div style={{ fontFamily: SERIF, fontSize: 34, letterSpacing: '-0.03em', lineHeight: 0.9 }}>{score.toLocaleString()}</div><div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5), marginTop: 4 }}>Shape Score</div></div>
          <div style={{ width: 1, height: 34, background: bsTHexA(INK, 0.12) }} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: MONO, fontSize: 11, color: TEAL }}>★ {rating} · {reviewCount} reviews</div><div style={{ fontFamily: SANS, fontSize: 11.5, color: bsTHexA(INK, 0.55), marginTop: 4 }}>Responds within hours</div></div>
        </div>

        {isPrivate ? (
          <div style={{ ...card, padding: '18px', marginTop: 18, display: 'flex', gap: 12, alignItems: 'flex-start' }}><span aria-hidden style={{ fontSize: 16 }}>🔒</span><div style={{ fontFamily: SANS, fontSize: 14, color: bsTHexA(INK, 0.7), lineHeight: 1.5 }}>{live && live.visibility === 'friends' ? `${first} shares their profile with friends — connect to see more.` : `${first} keeps their profile private — only name and tier are shown.`}</div></div>
        ) : (
        <>
          {/* philosophy */}
          <div style={{ textAlign: 'center', marginTop: 24, padding: '0 6px' }}>
            <Kick>{isNutri ? 'Practice philosophy' : 'Coaching philosophy'}</Kick>
            <div style={{ fontFamily: SERIF, fontSize: 23, fontStyle: 'italic', letterSpacing: '-0.01em', lineHeight: 1.18, color: bsTHexA(INK, 0.92), marginTop: 8 }}>“{philosophy}”</div>
          </div>

          {/* discipline legend */}
          <div style={{ marginTop: 28 }}>
            <Kick>{disLabel}</Kick>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9, marginTop: 12 }}>
              {disciplines.map(([label, val], i) => { const col = i === 0 ? c : i === disciplines.length - 1 ? TEAL : bsTHexA(c, 0.8); return (
                <div key={label} style={{ ...card, padding: '12px 13px' }}><div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 8, height: 8, borderRadius: 999, background: col }} /><span style={{ fontFamily: SANS, fontSize: 12.5, color: bsTHexA(INK, 0.82) }}>{label}</span></div><div style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em', marginTop: 6 }}>{Math.round(val * 100)}<span style={{ fontSize: 12, color: bsTHexA(INK, 0.4) }}>/100</span></div><div style={{ height: 3, borderRadius: 2, background: bsTHexA(INK, 0.1), marginTop: 8, overflow: 'hidden' }}><div style={{ height: '100%', width: `${val * 100}%`, background: col, borderRadius: 2 }} /></div></div>
              ); })}
            </div>
          </div>

          {/* track record */}
          <div style={{ marginTop: 24 }}>
            <Kick>Track record</Kick>
            <div style={{ display: 'flex', gap: 9, marginTop: 12 }}>
              {lifts.map(([label, val]) => <div key={label} style={{ flex: 1, textAlign: 'center', background: bsTHexA(c, 0.08), border: `1px solid ${bsTHexA(c, 0.2)}`, borderRadius: 13, padding: '14px 6px' }}><div style={{ fontFamily: SERIF, fontSize: 25, letterSpacing: '-0.02em' }}>{val}</div><div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: bsTHexA(INK, 0.5), marginTop: 5 }}>{label}</div></div>)}
            </div>
          </div>

          {/* certifications */}
          <div style={{ marginTop: 28 }}>
            <Kick>Certifications</Kick>
            <div style={{ ...card, padding: 4, marginTop: 12 }}>
              {certs.map(([abbr, body, year], i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 13px', borderTop: i ? `1px solid ${bsTHexA(INK, 0.07)}` : 'none' }}>
                  <span style={{ fontFamily: MONO, fontSize: 12, color: c, minWidth: 78 }}>{abbr}</span>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: SANS, fontSize: 13, color: bsTHexA(INK, 0.85) }}>{body}</div><div style={{ fontFamily: MONO, fontSize: 9.5, color: bsTHexA(INK, 0.45), marginTop: 2 }}>{year}</div></div>
                  <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.06em', textTransform: 'uppercase', color: TEAL }}>✓ Verified</span>
                </div>
              ))}
            </div>
          </div>

          {/* services & prices */}
          <div style={{ marginTop: 28 }}>
            <Kick>{isNutri ? 'Work with ' + first : 'Train with ' + first}</Kick>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {offerings.map(([kind, nm, sub, price], i) => (
                <div key={i} style={{ ...card, padding: '13px 15px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: c, marginBottom: 4 }}>{kind}</div><div style={{ fontFamily: SERIF, fontSize: 16, letterSpacing: '-0.01em' }}>{nm}</div><div style={{ fontFamily: SANS, fontSize: 12, color: bsTHexA(INK, 0.55), marginTop: 3 }}>{sub}</div></div>
                  <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.02em', color: price === 'Free' ? TEAL : INK, flex: 'none' }}>{price}</div>
                </div>
              ))}
            </div>
          </div>

          {/* reviews */}
          <div style={{ marginTop: 28 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}><Kick>Reviews</Kick><div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}><span style={{ fontFamily: SERIF, fontSize: 22, letterSpacing: '-0.02em' }}>{rating}</span><span style={{ fontFamily: MONO, fontSize: 10, color: bsTHexA(INK, 0.5) }}>★ {reviewCount}</span></div></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
              {reviews.map(([nm, ini, hue, body], i) => (
                <div key={i} style={{ ...card, padding: '13px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><div style={{ width: 30, height: 30, borderRadius: 999, flex: 'none', background: `linear-gradient(150deg, hsl(${hue} 40% 34%), hsl(${hue} 36% 20%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize: 12 }}>{ini}</div><span style={{ fontFamily: SANS, fontSize: 13, fontWeight: 500 }}>{nm}</span><span style={{ fontFamily: MONO, fontSize: 11, color: c }}>★★★★★</span></div>
                  <p style={{ fontFamily: SERIF, fontSize: 14, fontStyle: 'italic', lineHeight: 1.45, color: bsTHexA(INK, 0.82), margin: '10px 0 0' }}>“{body}”</p>
                </div>
              ))}
            </div>
          </div>

          {/* recent win */}
          <div style={{ marginTop: 24, ...card, borderRadius: 16, padding: 16 }}>
            <Kick>{relation[0]}</Kick>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 12 }}><div style={{ width: 42, height: 42, borderRadius: 999, flex: 'none', background: `linear-gradient(150deg, hsl(${relation[3]} 40% 34%), hsl(${relation[3]} 36% 20%))`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: SERIF, fontSize: 16 }}>{relation[2]}</div><div style={{ minWidth: 0 }}><div style={{ fontFamily: SANS, fontSize: 14, fontWeight: 500 }}>{relation[1]}</div><div style={{ fontFamily: SANS, fontSize: 12.5, color: bsTHexA(INK, 0.6), lineHeight: 1.4, marginTop: 3 }}>{relation[4]}</div></div></div>
          </div>

          {/* field notes */}
          <div style={{ marginTop: 28 }}>
            <Kick>Field notes</Kick>
            <div style={{ position: 'relative', paddingLeft: 22, marginTop: 16 }}>
              <div style={{ position: 'absolute', left: 4, top: 4, bottom: 8, width: 1.5, background: `linear-gradient(180deg, ${bsTHexA(c, 0.5)}, ${bsTHexA(c, 0.05)})` }} />
              {feed.map(([k, t2, b, time], i) => (
                <div key={i} style={{ position: 'relative', marginBottom: 12 }}>
                  <div style={{ position: 'absolute', left: -22, top: 16, width: 9, height: 9, borderRadius: 999, background: c, boxShadow: `0 0 0 3px ${BG}, 0 0 10px ${bsTHexA(c, 0.6)}` }} />
                  <div style={{ ...card, padding: '13px 15px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span style={{ fontFamily: MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: c, background: bsTHexA(c, 0.12), padding: '3px 7px', borderRadius: 5 }}>{k}</span><span style={{ marginLeft: 'auto', fontFamily: MONO, fontSize: 10, color: bsTHexA(INK, 0.4) }}>{time}</span></div>
                    <div style={{ fontFamily: SERIF, fontSize: 18, letterSpacing: '-0.01em', lineHeight: 1.15, marginTop: 9 }}>{t2}</div>
                    <p style={{ fontFamily: SANS, fontSize: 13, lineHeight: 1.5, color: bsTHexA(INK, 0.72), margin: '6px 0 0' }}>{b}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
        )}
      </div>

      {/* dock (+ privacy on your own) */}
      <div style={{ position: 'sticky', bottom: 0, flex: '0 0 auto', padding: '14px 18px calc(16px + env(safe-area-inset-bottom, 0px))', background: `linear-gradient(180deg, transparent, ${BG} 32%)` }}>
        {isSelf && <BSProfilePrivacy teal={TEAL} ink={INK} />}
        <div style={{ display: 'flex', gap: 10 }}>
          {isSelf ? (
            <button onClick={onEdit} style={{ flex: 1, minHeight: 48, borderRadius: 999, background: TEAL, color: '#04201d', border: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Edit profile →</button>
          ) : (
            <>
              <button onClick={() => onMessage(person)} style={{ flex: 1, minHeight: 48, borderRadius: 999, background: TEAL, color: '#04201d', border: 0, cursor: 'pointer', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Message →</button>
              <button onClick={() => { try { window.dispatchEvent(new Event('shape:openMarket')); } catch (e) {} }} style={{ flex: 1, minHeight: 48, borderRadius: 999, background: 'transparent', color: INK, border: `1px solid ${bsTHexA(INK, 0.4)}`, cursor: 'pointer', fontFamily: MONO, fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 800 }}>Coaching →</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// Tier-colored ring + avatar; shows role, tier, and a Message CTA. (Read-only;
// respects privacy — only reachable when the post isn't marked private.)
// Member (client) profiles use the Terrain design; coaches use the Signal
// design; both are immersive living-identity pages (above).
function BSPublicProfile({ person, onBack, onMessage = () => {}, isSelf = false, onEdit = () => {} }) {
  if (person.kind === 'TRAINER' || person.kind === 'NUTRI') {
    return <BSSignalCoachProfile person={person} onBack={onBack} onMessage={onMessage} isSelf={isSelf} onEdit={onEdit} />;
  }
  return <BSTerrainProfile person={person} onBack={onBack} onMessage={onMessage} isSelf={isSelf} onEdit={onEdit} />;
}

function BSClientFeed({ onProfile, role: roleProp, openRequest }) {
  const t = useBS();
  useBSPresence(); // re-render avatars as people come online / go offline
  const TEAL = '#0ac5a8', TEALB = '#2ee0c4';
  const [tab, setTab] = useStateBSC('feed');
  const [filter, setFilter] = useStateBSC('COMMUNITY');
  const [teamsSel, setTeamsSel] = useStateBSC('coaches');
  const [draft, setDraft] = useStateBSC('');
  // Support assistant — one continuous AI-backed thread that lives for the
  // session. It stays put while you move between tabs, but a fresh app load /
  // reload starts a clean thread with the current greeting (no persistence).
  const SUPPORT_GREETING = { who: 'Nora', t: "Hi, I'm Nora — Shape's assistant. Ask me anything: connecting integrations, your plan, billing, or your account. I'll bring in the Shape team if I can't sort it out.", time: 'now', me: false, bot: true };
  const [supportMsgs, setSupportMsgs] = useStateBSC([SUPPORT_GREETING]);
  const [supportDraft, setSupportDraft] = useStateBSC('');
  const [supportBusy, setSupportBusy] = useStateBSC(false);
  // Clear any thread persisted by older builds so stale history doesn't reappear.
  React.useEffect(() => { try { Object.keys(window.localStorage || {}).forEach(k => { if (k.indexOf('shape.support.') === 0) window.localStorage.removeItem(k); }); } catch (e) {} }, []);
  const sendSupport = async () => {
    const body = supportDraft.trim();
    if (!body || supportBusy) return;
    setSupportDraft('');
    const next = [...supportMsgs, { who: 'You', t: body, time: 'now', me: true }];
    setSupportMsgs(next);
    setSupportBusy(true);
    try {
      const hist = next.map(m => ({ role: m.me ? 'user' : 'assistant', content: m.t }));
      const res = await window.ShapeSupport?.ask?.(hist);
      const reply = (res && res.reply) || "Thanks — I've flagged this for the Shape team and they'll follow up here.";
      const acts = (res && Array.isArray(res.actions) && res.actions.length) ? res.actions : undefined;
      setSupportMsgs(m => [...m, { who: 'Nora', t: reply, time: 'now', me: false, bot: true, actions: acts }]);
    } catch (e) {
      setSupportMsgs(m => [...m, { who: 'Nora', t: "I'm having trouble reaching support right now — I've flagged this for the Shape team to follow up.", time: 'now', me: false, bot: true }]);
    } finally { setSupportBusy(false); }
  };
  // Nora's structured follow-ups → in-app destinations (the app is a webview, so
  // route coach/marketplace links to the in-app Marketplace rather than a URL).
  const runSupportAction = (a) => {
    if (!a) return;
    try {
      if (a.type === 'coach' || a.type === 'marketplace') {
        window.dispatchEvent(new CustomEvent('shape:openMarket', { detail: { role: a.role || null, coach: a.slug || null } }));
      } else if (a.type === 'screen' && a.screen === 'integrations') {
        window.dispatchEvent(new CustomEvent('shape:openIntegrations'));
      } else if (a.url) {
        window.open(a.url, '_blank');
      }
    } catch (e) {}
  };
  // Live direct-message threads (real coaches/conversations). Falls back to the
  // sample people lists below when there are none (demo / not signed in).
  const [coachThreads, setCoachThreads] = useStateBSC(null);
  const [openChat, setOpenChat] = useStateBSC(null); // selected DM/channel row → thread view
  const [openProfile, setOpenProfile] = useStateBSC(null); // tapped a chat avatar → public profile
  const loadCoachThreads = React.useCallback(() => {
    if (!window.ShapeMessages?.listDirectCoachThreads) return;
    window.ShapeMessages.listDirectCoachThreads()
      .then(res => { const list = (res && Array.isArray(res.data)) ? res.data : (Array.isArray(res) ? res : []); if (list.length) setCoachThreads(list); })
      .catch(() => {});
  }, []);
  React.useEffect(() => { loadCoachThreads(); }, [loadCoachThreads]);
  const _threadPalette = ['#147b68', '#c0533b', '#a07a2e', '#2e6fa0', '#8a5cf6'];
  const threadRows = (coachThreads || []).map((th, i) => ({
    n: th.who || 'Coach',
    s: th.provider_role === 'nutritionist' ? 'Your nutritionist' : th.provider_role === 'trainer' ? 'Your coach' : 'Direct message',
    c: _threadPalette[i % _threadPalette.length],
    i: (th.who || 'C').toString().trim().charAt(0).toUpperCase(),
    last: th.last,
    conversation_id: th.conversation_id,
    messages: (th.messages || []).map(m => ({ who: m.who || th.who, t: m.t || m.body || '', time: m.time || '', me: m.me || m.who === 'You', coach: m.coach, audio: m.audio || null, photo: m.photo || null })),
  }));

  // External "Message <coach>" requests (e.g. from a workout preview) land
  // here: jump to Team → Coaches and open that coach's thread (real thread by
  // name → first real coach → sample → a fresh thread shell).
  React.useEffect(() => {
    if (!openRequest || !openRequest.nonce) return;
    const name = openRequest.coach;
    // Deep-link to an exact conversation (e.g. a coach tapping MESSAGE on a
    // client profile): open that thread directly by id.
    if (openRequest.conversationId) {
      setOpenChat({ n: name || 'Client', s: openRequest.role || 'Direct message', c: '#0a8f87', i: (name || 'C').charAt(0), conversation_id: openRequest.conversationId, dm: true, messages: [] });
      return;
    }
    setTab('teams');
    setTeamsSel('coaches');
    if (!name) { setOpenChat(null); return; }
    const byName = (threadRows || []).find(r => r.n === name);
    const sample = BS_SAMPLE_COACH_DMS[name]
      ? { n: name, s: openRequest.role || 'Coach', c: '#c0533b', i: name.charAt(0), conversation_id: null, messages: BS_SAMPLE_COACH_DMS[name] }
      : null;
    setOpenChat(byName || (threadRows && threadRows[0]) || sample || { n: name, s: openRequest.role || 'Coach', c: '#c0533b', i: (name || 'C').charAt(0), conversation_id: null, messages: [] });
  }, [openRequest && openRequest.nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  // Member-created community channels ("run club" style).
  const [channels, setChannels] = useStateBSC(null);
  const [newChannel, setNewChannel] = useStateBSC(null);      // null = closed; string = create-form open
  const [newChannelPrivate, setNewChannelPrivate] = useStateBSC(false);
  const [channelQuery, setChannelQuery] = useStateBSC('');
  const [pinOverride, setPinOverride] = useStateBSC({}); // id -> bool, so pin reorders demo + live alike
  const [addMemberFor, setAddMemberFor] = useStateBSC(null);  // channel being added-to
  const [memberQuery, setMemberQuery] = useStateBSC('');
  const [memberResults, setMemberResults] = useStateBSC([]);
  // "New message" people picker (the + New action on the thread lists).
  const [newDmOpen, setNewDmOpen] = useStateBSC(false);
  const [dmQuery, setDmQuery] = useStateBSC('');
  const [dmResults, setDmResults] = useStateBSC([]);
  React.useEffect(() => {
    if (!newDmOpen || !window.ShapeChannels?.searchMembers) return undefined;
    let active = true;
    window.ShapeChannels.searchMembers(dmQuery).then(r => { if (active) setDmResults(r?.data || []); }).catch(() => {});
    return () => { active = false; };
  }, [newDmOpen, dmQuery]);
  // Member directory of my existing 1:1 DM threads (real, persisted).
  const [memberThreads, setMemberThreads] = useStateBSC(null);
  const loadMemberThreads = React.useCallback(() => {
    if (!window.ShapeMessages?.listMemberThreads) return;
    window.ShapeMessages.listMemberThreads()
      .then(res => { const list = (res && Array.isArray(res.data)) ? res.data : []; setMemberThreads(list); })
      .catch(() => {});
  }, []);
  React.useEffect(() => { loadMemberThreads(); }, [loadMemberThreads]);
  // Realtime: when a DM message arrives (member or coach), refresh both thread
  // lists so new threads + latest-message previews appear live. The per-row /
  // tab unread badges are already handled app-wide by ShapeUnread.
  React.useEffect(() => {
    if (!window.ShapeMessages?.subscribeMessages) return undefined;
    let timer = null;
    const off = window.ShapeMessages.subscribeMessages(() => {
      clearTimeout(timer);
      timer = setTimeout(() => { loadMemberThreads(); loadCoachThreads(); }, 350);
    });
    return () => { clearTimeout(timer); try { off && off(); } catch (e) {} };
  }, [loadMemberThreads, loadCoachThreads]);
  const friendRows = (memberThreads || []).map((th, i) => ({
    n: th.who || 'Member',
    s: 'Direct message',
    c: _threadPalette[i % _threadPalette.length],
    i: (th.who || 'M').toString().trim().charAt(0).toUpperCase(),
    last: th.last,
    conversation_id: th.conversation_id,
    messages: th.messages || [],
  }));
  const startDm = async (m) => {
    const pal = ['#147b68', '#c0533b', '#a07a2e', '#2e6fa0', '#8a5cf6'];
    const nm = m.name || m.full_name || 'Member';
    setNewDmOpen(false); setDmQuery(''); setDmResults([]);
    let convId = m.conversation_id || null;
    try {
      const res = await window.ShapeMessages?.getOrCreateMemberConversation?.({ otherUserId: m.id });
      if (res && res.data) convId = res.data;
    } catch (e) { window.__bsToast?.(e?.message || 'Could not start conversation.', 'err'); }
    setOpenChat({ n: nm, s: 'Direct message', c: pal[nm.length % pal.length], i: nm.trim().charAt(0).toUpperCase(), messages: [], dm: true, conversation_id: convId });
    loadMemberThreads();
  };
  const refreshChannels = React.useCallback(() => {
    if (!window.ShapeChannels?.list) return;
    window.ShapeChannels.list().then(r => {
      const data = Array.isArray(r?.data) ? r.data : [];
      setChannels(data);
      data.forEach(c => { if (c.joined) window.ShapeUnread?.noteChannel?.(c.id); });
    }).catch(() => {});
  }, []);
  React.useEffect(() => { refreshChannels(); }, [refreshChannels]);
  const createChannelNow = () => {
    const name = (newChannel || '').trim();
    if (!name) return;
    const isPrivate = newChannelPrivate;
    setNewChannel(null); setNewChannelPrivate(false);
    // Optimistic: show it immediately (also lets the demo/preview work without a
    // signed-in session). The backend call persists it when authenticated.
    setChannels(prev => [{ id: 'tmp-ch-' + Date.now(), name, description: '', memberCount: 1, joined: true, isHost: true, private: isPrivate, pinned: false, last: '' }, ...(prev || [])]);
    window.__bsToast?.(`Created “${name}”`, 'ok');
    const p = window.ShapeChannels?.create?.({ name, visibility: isPrivate ? 'private' : 'public' });
    if (p && p.then) p.then(() => refreshChannels()).catch((e) => window.__bsToast?.(e?.message || 'Saved locally — sign in to sync.', 'info'));
  };
  const pinChannelNow = (ch) => {
    const next = !ch.pinned;
    setPinOverride(o => ({ ...o, [ch.id]: next }));
    window.__bsToast?.(next ? 'Pinned to top' : 'Unpinned', 'ok');
    // Only persist for real backend channels — sample/support rows are local-only.
    const local = String(ch.id || '').startsWith('sample') || ch.id === 'support';
    if (local) return;
    const p = window.ShapeChannels?.pin?.(ch.id, next);
    if (p && p.then) p.then(() => refreshChannels()).catch(() => {});
  };
  const joinChannelNow = (ch) => {
    window.ShapeUnread?.noteChannel?.(ch.id);
    setChannels(prev => (prev || []).map(c => c.id === ch.id ? { ...c, joined: true, memberCount: (c.memberCount || 0) + 1 } : c));
    window.__bsToast?.(`Joined ${ch.name}`, 'ok');
    const p = window.ShapeChannels?.join?.(ch.id);
    if (p && p.then) p.then(() => refreshChannels()).catch(() => {});
  };
  const openChannelNow = (ch) => {
    window.ShapeUnread?.markChannelRead?.(ch.id);
    const finish = (msgs) => setOpenChat({ n: ch.name, s: `${ch.memberCount} member${ch.memberCount === 1 ? '' : 's'}`, channelId: ch.id, messages: msgs, isHost: ch.isHost });
    if (ch.messages && ch.messages.length) { finish(ch.messages); return; }   // demo/sample channel
    if (window.ShapeChannels?.listMessages) window.ShapeChannels.listMessages(ch.id).then(r => finish(r?.data || [])).catch(() => finish([]));
    else finish([]);
  };
  React.useEffect(() => {
    if (addMemberFor == null || !window.ShapeChannels?.searchMembers) return undefined;
    let active = true;
    window.ShapeChannels.searchMembers(memberQuery).then(r => { if (active) setMemberResults(r?.data || []); }).catch(() => {});
    return () => { active = false; };
  }, [addMemberFor, memberQuery]);
  const addMemberNow = (m) => {
    window.__bsToast?.(`Added ${m.name}`, 'ok');
    const p = window.ShapeChannels?.addMember?.({ channelId: addMemberFor.id, userId: m.id });
    if (p && p.then) p.then(() => refreshChannels()).catch(() => {});
  };

  // Unread badges, read from the app-wide ShapeUnread manager (persisted +
  // realtime). Keys are `ch:<id>` / `dm:<id>`.
  const [unread, setUnread] = useStateBSC(() => (window.ShapeUnread?.all?.() || {}));
  React.useEffect(() => {
    if (window.ShapeUnread?.start) window.ShapeUnread.start();
    const off = window.ShapeUnread?.onChange?.((map) => setUnread({ ...map }));
    setUnread({ ...(window.ShapeUnread?.all?.() || {}) });
    return () => { try { off && off(); } catch (e) {} };
  }, []);
  // Per-section unread totals so the Friends / Teams sub-tabs can show where the
  // unread messages are: DMs → Friends, channels → Teams.
  const sumUnread = (prefix) => Object.keys(unread || {}).reduce((a, k) => a + (k.indexOf(prefix) === 0 ? (unread[k] || 0) : 0), 0);
  const dmUnread = sumUnread('dm:');
  const chUnread = sumUnread('ch:');
  // Split DM unread by destination tab: member DMs → Friends, coach DMs → Team.
  const friendUnread = (friendRows || []).reduce((a, f) => a + ((unread && unread['dm:' + (f.conversation_id || '')]) || 0), 0);
  const coachUnread = (threadRows || []).reduce((a, f) => a + ((unread && unread['dm:' + (f.conversation_id || '')]) || 0), 0);
  const online = useBSOnline(); // live "N online" presence count for the masthead
  const unreadBadge = (key) => {
    const n = (unread && unread[key]) || 0;
    if (!n) return null;
    return <span style={{ flexShrink: 0, padding: '3px 8px', borderRadius: 999, background: '#ff5a5f', color: '#fff', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{n === 1 ? '1 new' : `${n} new`}</span>;
  };
  // Pushpin icon. PINNED → solid teal head (a clear status). NOT pinned → a
  // hollow outline (a subtle "tap to pin" affordance), so an unpinned channel
  // never looks pinned.
  const PinIcon = ({ filled, size = 18 }) => (
    <svg viewBox="0 0 24 24" width={size} height={size} style={{ display: 'block' }} aria-hidden="true">
      <path d="M10.7 13 L13.3 13 L12 22.5 Z" fill={filled ? '#9aa0a6' : 'none'} stroke={filled ? 'none' : muted} strokeWidth="1.3" strokeLinejoin="round" />
      <circle cx="12" cy="8" r="6.4" fill={filled ? TEALB : 'none'} stroke={filled ? 'none' : muted} strokeWidth="1.5" />
      {filled && <circle cx="9.9" cy="5.9" r="1.7" fill="#ffffff" opacity="0.45" />}
    </svg>
  );
  const [composerSlot, setComposerSlot] = useStateBSC(null);
  React.useEffect(() => { setComposerSlot(document.getElementById('bs-composer-slot')); }, []);
  // Theme-aware feed colors — text/hairlines follow the active paper theme so
  // the tab/chip labels and cards stay legible on light (cream) paper, not just
  // the dark default. Cards use a light panel on light themes, dark otherwise.
  const card = t.isLight ? t.PAPER2 : '#1a1713';
  const cardInk = t.INK;
  const muted = t.INK50;
  const hair = t.RULE;
  const ROLE = {
    SHAPE: { color: TEALB, label: 'Client' },
    TRAINER: { color: '#ff7a59', label: 'Trainer' },
    CLIENT: { color: '#2ee0c4', label: 'Client' },
    NUTRI: { color: '#e0b15a', label: 'Nutritionist' },
    COMMUNITY: { color: '#8a5cf6', label: 'Community' },
  };
  // Feed chips depend on the signed-in role: everyone sees Shape + Community,
  // plus only their own role's chip (Client / Trainer / Nutri).
  const myRole = roleProp || (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().profile && window.ShapeAuth.getCachedState().profile.role) || 'client';
  // Demo samples (posts, activities, friends, coaches, channels) show only when
  // logged out; once signed in the whole chat page is live (real data or empty).
  const loggedIn = !!(window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id);
  const myRoleChip = myRole === 'trainer' ? 'TRAINER' : myRole === 'nutritionist' ? 'NUTRI' : 'CLIENT';
  const CHIP_KEYS = ['COMMUNITY', myRoleChip, 'SHAPE'];
  // Display labels: per request the Community and Shape chips are swapped in chat
  // (the activity feed reads "Shape", the members feed reads "Community").
  const chipLabel = (k) => (k === 'COMMUNITY' ? 'SHAPE' : k === 'SHAPE' ? 'COMMUNITY' : k);
  const SAMPLE = [
    // SHAPE = individual members (the general community)
    { id: 's1', who: 'Emma Rivera', kind: 'SHAPE', init: 'E', hue: '#2e6fa0', time: '1h', body: 'New to Shape this week, coming off a long layoff. Any tips for not going too hard the first couple weeks?', hearts: 22, replies: 15 },
    { id: 's2', who: 'Tom Becker', kind: 'SHAPE', init: 'T', hue: '#147b68', time: '3h', body: 'Anyone in the Riverside Runners group doing the 6am long run Saturday? Looking for someone to hold ~8:00 pace.', hearts: 18, replies: 9 },
    { id: 's3', who: 'Aisha Khan', kind: 'SHAPE', init: 'A', hue: '#8a5cf6', time: '6h', body: 'Three weeks in and the daily check-in is the habit that actually stuck. Small, but it adds up.', hearts: 34, replies: 6 },
    { id: 's4', who: 'Carlos Mendez', kind: 'SHAPE', init: 'C', hue: '#c0533b', time: '1d', body: 'PSA: the cork mobility ball from the Shape Store is worth it. My calves have never been this happy.', hearts: 27, replies: 8 },
    { id: 's5', who: 'Nina Patel', kind: 'SHAPE', init: 'N', hue: '#a07a2e', time: '2d', body: 'Hit my 100th logged workout today 🎉 Started barely able to do a push-up. Keep showing up — it works.', hearts: 63, replies: 19 },
    // Coaches also drop into the community thread — tagged by their real role.
    { id: 's6', who: 'Jordan Chen', kind: 'SHAPE', authorKind: 'TRAINER', init: 'J', hue: '#c0533b', time: '2h', body: 'Trainer here 👋 Happy to eyeball form for anyone in the community — post a side-on clip of your squat or deadlift and tag me.', hearts: 38, replies: 14 },
    { id: 's7', who: 'Dr. Maya Patel', kind: 'SHAPE', authorKind: 'NUTRI', init: 'M', hue: '#a07a2e', time: '4h', body: 'Nutritionist tip for the group: front-load protein at breakfast (30–40g). It blunts the afternoon snack spiral better than any willpower hack.', hearts: 52, replies: 11 },
    { id: 's8', who: 'Diego Morales', kind: 'SHAPE', authorKind: 'TRAINER', init: 'D', hue: '#c0533b', time: '1d', body: 'Reminder from a coach: soreness isn\'t the scoreboard. Consistency + sleep beat crushing yourself once a week. Play the long game.', hearts: 44, replies: 7 },
    { id: 's9', who: 'Priya Iyer', kind: 'SHAPE', authorKind: 'NUTRI', init: 'P', hue: '#a07a2e', time: '1d', body: 'Traveling this week? A banana + a palm of nuts is a perfectly good "I couldn\'t meal prep" lunch. Don\'t let perfect wreck good.', hearts: 31, replies: 5 },
    // TRAINER = between Shape trainers only (peer chat)
    { id: 't1', who: 'Jordan Chen', kind: 'TRAINER', init: 'J', hue: '#c0533b', time: '2h', body: 'Fellow coaches — anyone seeing better adherence moving check-ins from Monday to Sunday night? Early data on two clients looks promising.', hearts: 14, replies: 11 },
    { id: 't2', who: 'Maya Okafor', kind: 'TRAINER', init: 'M', hue: '#c0533b', time: '5h', body: 'What are you all using for async form review? I\'m on video + timestamps but it\'s eating my evenings.', hearts: 9, replies: 13 },
    { id: 't3', who: 'Diego Morales', kind: 'TRAINER', init: 'D', hue: '#c0533b', time: '1d', body: 'Heads up: the Shape payout split updated this month — check your Connect dashboard, the net breakdown is clearer now.', hearts: 18, replies: 7 },
    { id: 't4', who: 'Tariq Osei', kind: 'TRAINER', init: 'T', hue: '#c0533b', time: '1d', body: 'Got a masters lifter (58M) returning from a disc issue. Anyone have a conservative deadlift re-entry progression they like?', hearts: 11, replies: 9 },
    { id: 't5', who: 'Sana Bhatt', kind: 'TRAINER', init: 'S', hue: '#c0533b', time: '2d', body: 'Referral: I\'m at capacity on postpartum clients. If anyone has room for at-home / kettlebell-leaning programming, DM me.', hearts: 8, replies: 6 },
    { id: 't6', who: 'Lena Park', kind: 'TRAINER', init: 'L', hue: '#c0533b', time: '2d', body: 'How do you all keep clients on Zone 2? I keep losing them to "it feels too easy." Cues that have landed for you?', hearts: 15, replies: 14 },
    { id: 't7', who: 'Jordan Chen', kind: 'TRAINER', init: 'J', hue: '#c0533b', time: '3d', body: 'Shape Radio coach slot opened up for Thursday 7pm — who wants it? Good way to pull in new clients.', hearts: 12, replies: 5 },
    { id: 't8', who: 'Diego Morales', kind: 'TRAINER', init: 'D', hue: '#c0533b', time: '4d', body: 'Programming debate: RPE vs percentage-based for intermediate lifters. I\'ve been running hybrid lately — where do you land?', hearts: 20, replies: 22 },
    // NUTRI = between Shape nutritionists only (peer chat)
    { id: 'n1', who: 'Dr. Maya Patel', kind: 'NUTRI', init: 'M', hue: '#a07a2e', time: '3h', body: 'Colleagues — how aggressive are you going with refeeds for clients deep in a cut? I\'ve settled on one structured high-carb day weekly.', hearts: 16, replies: 12 },
    { id: 'n2', who: 'Owen Halverson', kind: 'NUTRI', init: 'O', hue: '#a07a2e', time: '7h', body: 'Anyone have a clean race-week fueling handout they\'re willing to share? Rebuilding mine and don\'t want to reinvent it.', hearts: 11, replies: 8 },
    { id: 'n3', who: 'Priya Iyer', kind: 'NUTRI', init: 'P', hue: '#a07a2e', time: '1d', body: 'Low-FODMAP clients: what\'s your go-to when they travel? Reintroductions always slip on the road.', hearts: 9, replies: 7 },
    { id: 'n4', who: 'Jules Bonner', kind: 'NUTRI', init: 'J', hue: '#a07a2e', time: '2d', body: 'CDCES question — coordinating macros with a client\'s endo on a GLP-1. How are you holding the protein floor on low appetite?', hearts: 13, replies: 10 },
    { id: 'n5', who: 'Owen Halverson', kind: 'NUTRI', init: 'O', hue: '#a07a2e', time: '3d', body: 'Shape added carbs/fat to the meal-plan builder 🙌 swaps finally carry full macros now. Big quality-of-life win.', hearts: 22, replies: 6 },
    { id: 'n6', who: 'Dr. Maya Patel', kind: 'NUTRI', init: 'M', hue: '#a07a2e', time: '3d', body: 'Full on sports-nutrition clients this quarter. If anyone has capacity for endurance / plant-based, I\'ve got two referrals.', hearts: 10, replies: 5 },
    { id: 'n7', who: 'Priya Iyer', kind: 'NUTRI', init: 'P', hue: '#a07a2e', time: '4d', body: 'What adherence tracking are you using beyond photo logs? Looking for something clients actually keep up with.', hearts: 14, replies: 11 },
    // Client channel
    { id: 'c1', who: 'Sofia Martinez', kind: 'CLIENT', init: 'S', hue: '#147b68', time: '4h', body: 'First sub-9 min mile today!', hearts: 18, replies: 3 },
    { id: 'c2', who: 'Andre Willis', kind: 'CLIENT', init: 'A', hue: '#147b68', time: '6h', body: 'Hit a 200 lb deadlift for the first time. Started at 95 back in January 😤', hearts: 47, replies: 11 },
    { id: 'c3', who: 'Lena Park', kind: 'CLIENT', init: 'L', hue: '#147b68', time: '1d', body: 'Meal-prepped all five lunches on Sunday. Future me is grateful.', hearts: 15, replies: 2 },
    { id: 'c4', who: 'Priya R.', kind: 'CLIENT', init: 'P', hue: '#147b68', time: '1d', body: '30-day protein streak ✅ Hardest habit to build, easiest to feel.', hearts: 29, replies: 6 },
    { id: 'c5', who: 'Marcus J.', kind: 'CLIENT', init: 'M', hue: '#147b68', time: '2d', body: 'Made all four sessions this week even with travel. Momentum > motivation.', hearts: 33, replies: 4 },
    { id: 'c6', who: 'Dani Cole', kind: 'CLIENT', init: 'D', hue: '#147b68', time: '2d', body: 'Three months ago a flight of stairs wrecked me. Did a 5k this morning without stopping. 🥹', hearts: 58, replies: 13 },
    { id: 'c7', who: 'Sam Okafor', kind: 'CLIENT', init: 'S', hue: '#147b68', time: '3d', body: 'Down 14 lb and my resting HR went 72 → 61. The wearable doesn\'t lie. 📉', hearts: 49, replies: 9 },
    { id: 'c8', who: 'Renée Dubois', kind: 'CLIENT', init: 'R', hue: '#147b68', time: '4d', body: 'Slept 7.5h five nights straight for the first time in years. Recovery scores are night and day.', hearts: 31, replies: 5 },
  ];
  // Map a live community post into the feed-card shape.
  const KIND_OF = (r) => { const s = String(r || '').toLowerCase(); if (s.includes('shape') || s.includes('mod') || s.includes('official')) return 'SHAPE'; if (s.includes('train') || s.includes('coach')) return 'TRAINER'; if (s.includes('nutri') || s.includes('diet')) return 'NUTRI'; return 'CLIENT'; };
  const HUE = { SHAPE: TEAL, TRAINER: '#c0533b', CLIENT: '#147b68', NUTRI: '#a07a2e' };
  const myUserId = window.ShapeAuth?.getCachedState?.()?.user?.id || null;
  const mapPost = (p) => {
    // Prefer the channel the post was made on (stored on the post); fall back to
    // inferring from the author's role for older posts without a channel.
    const ch = String(p.channel || '').toUpperCase();
    const kind = (ch && ROLE[ch]) ? ch : KIND_OF(p.role);
    // `kind` = which section/channel the post lives in (drives filtering);
    // `authorKind` = the author's REAL role (drives the role tag + alignment).
    // My own posts always reflect MY current role, not the stale role stored on
    // the post (e.g. WHOOP auto-posts created earlier as a client).
    const mine = !!(p.author_id && myUserId && p.author_id === myUserId);
    const authorKind = mine ? myRoleChip : KIND_OF(p.role);
    return {
      id: p.id, userId: p.author_id || null, mine, who: mine ? 'You' : (p.name || 'Member'), kind, authorKind, init: (mine ? bsMyName() : (p.avatar || p.name || '?')).toString().trim().charAt(0).toUpperCase(),
      hue: HUE[kind], time: p.time || 'now', pinned: !!p.pinned, official: kind === 'SHAPE',
      body: p.note || p.status || p.body || p.workout || '',
      hearts: typeof p.likes === 'number' ? p.likes : (p.likeCount || 0),
      replies: Array.isArray(p.comments) ? p.comments.length : (p.commentCount || 0),
      comments: Array.isArray(p.comments) ? p.comments.map(c => ({ who: c.author_name || c.who || 'Member', body: c.body || c.text || '' })) : [],
    };
  };
  const [posts, setPosts] = useStateBSC(SAMPLE);
  const [postsLive, setPostsLive] = useStateBSC(false);
  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await window.ShapeCommunity?.listPosts?.();
        if (active && Array.isArray(res?.data) && res.data.length) {
          const mapped = res.data.map(mapPost).filter(p => p.body);
          setPosts(mapped); setPostsLive(true);
          // Batch the authors' all-time points → real tier per user for the bubbles.
          const ids = [...new Set([myUserId, ...mapped.map(p => p.userId)].filter(Boolean))];
          if (ids.length && window.ShapeProfiles?.getUserPoints) {
            window.ShapeProfiles.getUserPoints(ids).then(pointsMap => {
              if (!active || !pointsMap) return;
              const tiers = {};
              Object.keys(pointsMap).forEach(uid => { tiers[uid] = bsTierForPoints(pointsMap[uid]); });
              setTierByUser(tiers);
            }).catch(() => {});
          }
          // Members' profile photos → carry into the feed avatars (visibility-gated).
          if (ids.length && window.ShapeProfiles?.getUserAvatars) {
            window.ShapeProfiles.getUserAvatars(ids).then(avs => {
              if (active && avs) setAvatarByUser(avs);
            }).catch(() => {});
          }
        }
      } catch { /* keep sample */ }
    })();
    return () => { active = false; };
  }, []);
  const [tierByUser, setTierByUser] = useStateBSC({}); // userId → real tier (from Shape Score)
  const [avatarByUser, setAvatarByUser] = useStateBSC({}); // userId → profile photo (data URL)
  // Each chip is its own channel: SHAPE = individual members, TRAINER/NUTRI/
  // CLIENT = that role's peers only. (COMMUNITY swaps to the activity feed in
  // the render below, so `shown` isn't used for it.)
  const shown = ((loggedIn && !postsLive) ? [] : posts).filter(p => p.kind === filter);

  const post = async () => {
    const body = draft.trim();
    if (!body) return;
    setDraft('');
    // Tag the post with the chip you're posting from (Shape / Community / your
    // role channel) so it lands on that feed — not always the Client feed.
    const kind = (filter && ROLE[filter]) ? filter : myRoleChip;
    const where = ROLE[kind] ? ROLE[kind].label : 'the group';
    setPosts(prev => [{ id: 'tmp-' + Date.now(), who: 'You', mine: true, userId: myUserId, kind, authorKind: myRoleChip, init: bsMyName().trim().charAt(0).toUpperCase(), hue: HUE[kind] || ROLE[kind].color, time: 'now', body, hearts: 0, replies: 0 }, ...prev]);
    try { await window.ShapeCommunity?.createPost?.({ title: body, note: body, channel: kind, privacy: 'community' }); window.__bsToast?.(`Posted to ${where}`, 'ok'); }
    catch (e) { window.__bsToast?.(e?.message || 'Could not post.', 'err'); }
  };
  const like = (p) => {
    setPosts(prev => prev.map(x => x.id === p.id ? { ...x, hearts: (x.hearts || 0) + 1 } : x));
    if (p.id && !String(p.id).startsWith('tmp') && !String(p.id).startsWith('s')) { const lk = window.ShapeCommunity?.toggleLike?.({ postId: p.id }); if (lk && lk.catch) lk.catch(() => {}); }
  };

  // Like + comment on community activity cards (local, demo-side: these Strava-
  // style cards aren't backed by post ids). Keyed by author + timestamp.
  const [actLikes, setActLikes] = useStateBSC({});
  const [actComments, setActComments] = useStateBSC({});
  const [actCmtOpen, setActCmtOpen] = useStateBSC(null);
  const [actCmtDraft, setActCmtDraft] = useStateBSC('');
  const toggleActLike = (key) => {
    setActLikes(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const openActComments = (key, isOpen) => { setActCmtOpen(isOpen ? null : key); setActCmtDraft(''); };
  const sendActComment = (key) => {
    const body = (actCmtDraft || '').trim();
    if (!body) return;
    setActComments(prev => ({ ...prev, [key]: [...(prev[key] || []), { who: 'You', body }] }));
    setActCmtDraft('');
    // Persist to the backend when `key` is a real community post id (activity
    // keys contain '|'; sample posts start with 's'/'tmp').
    if (key && !String(key).includes('|') && !/^(s|tmp)/.test(String(key))) {
      const c = window.ShapeCommunity?.addComment?.({ postId: key, body });
      if (c && c.catch) c.catch(() => {});
    }
  };

  // One feed message — chat-bubble style. Coaches (trainer/nutri) sit on the
  // left; members + your own posts (client/shape/You) sit on the right. Role tag
  // + bubble tint follow the role color. Used by the role channels (Client /
  // Trainer / Nutritionist / Shape) and the live COMMUNITY feed.
  const renderPost = (p, i) => {
    // The role tag + alignment follow the author's REAL role (authorKind), not
    // the channel the post lives in — so a trainer posting in the general feed
    // still reads "Trainer".
    const akind = p.authorKind || p.kind;
    const rc = (ROLE[akind] && ROLE[akind].color) || (ROLE[p.kind] && ROLE[p.kind].color) || muted;
    const roleMeta = ROLE[akind] || ROLE[p.kind] || { label: 'Client', color: rc };
    // In the mixed COMMUNITY feed, coaches sit left and members/clients (+ you)
    // sit right for a conversation feel; in a single-role section only your own
    // posts go right (everyone else is an incoming/left feed message).
    const right = p.who === 'You' || p.mine || (filter === 'COMMUNITY' && (akind === 'CLIENT' || akind === 'SHAPE'));
    const replyCount = (p.replies || 0) + (actComments[p.id] || []).length;
    // Avatar + bubble tint follow the author's TIER (not the role). For my OWN
    // posts the bubble matches MY real Shape Score tier (Base/steel until I earn
    // points) — resolved consistently for the optimistic "You" post and the
    // persisted copy, so it never flips color.
    const isMe = p.mine || p.who === 'You';
    const tier = p.tier || (isMe
      ? ((myUserId && tierByUser[myUserId]) || bsTierForPoints(0))
      : ((p.userId && tierByUser[p.userId]) || bsPostTier(p)));
    const tc = bsTierColor(tier);
    const bubbleBg = p.official ? '#f3eee4' : (t.isLight ? `${tc}16` : `${tc}22`);
    const linkable = !p.mine && p.who !== 'You' && p.public !== false; // open the author's public profile
    const avInit = isMe ? bsMyInitials() : (bsInitials(p.who) || p.init || '?'); // full (2-letter) initials
    const AV_OFFSET = 49; // avatar (38) + gap (11), to align meta/reactions under the bubble
    return (
      <div key={p.id || i} style={{ display: 'flex', flexDirection: 'column', alignItems: right ? 'flex-end' : 'flex-start' }}>
        {p.pinned && <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.2em', color: TEALB, marginBottom: 6 }}><PinIcon filled size={13} /> Pinned</div>}
        <div style={{ display: 'flex', flexDirection: right ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: 11, maxWidth: '90%' }}>
          <BSFacetAvatar size={38} c={tc} initial={avInit} photo={isMe ? ((typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined) : (p.userId ? (avatarByUser[p.userId] || undefined) : (p.photo || bsDemoFace(p.who)))} live={isMe ? bsAmLive() : bsIsUserOnline(p.userId)} showRank={false} onClick={linkable ? () => setOpenProfile({ ...p, kind: akind, tier, photo: (p.userId ? avatarByUser[p.userId] : (p.photo || bsDemoFace(p.who))) }) : undefined} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', flexDirection: right ? 'row-reverse' : 'row', alignItems: 'baseline', gap: 8, marginBottom: 5 }}>
              <button onClick={() => linkable && setOpenProfile({ ...p, kind: akind, tier, photo: avatarByUser[p.userId] || p.photo })} style={{ background: 'transparent', border: 0, padding: 0, cursor: linkable ? 'pointer' : 'default', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 13.5, color: cardInk }}>{p.who}</button>
              <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: rc, border: `1px solid ${rc}66`, borderRadius: 4, padding: '1px 5px' }}>{roleMeta.label}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 9, color: muted }}>{p.time}</span>
            </div>
            <div style={{ borderRadius: 16, [right ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 5, padding: '11px 14px', background: bubbleBg, color: p.official ? '#1a1713' : cardInk, border: p.official ? 'none' : `1px solid ${tc}40`, fontFamily: p.official ? `'Newsreader', Georgia, serif` : t.DISPLAY, fontStyle: p.official ? 'italic' : 'normal', fontSize: p.official ? 15 : 14, lineHeight: 1.4 }}>{p.body}</div>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: right ? 'row-reverse' : 'row', alignItems: 'center', gap: 16, marginTop: 6, padding: right ? `0 ${AV_OFFSET}px 0 0` : `0 0 0 ${AV_OFFSET}px`, fontFamily: t.MONO, fontSize: 11, color: muted }}>
          <button onClick={() => like(p)} style={{ background: 'transparent', border: 0, color: muted, fontFamily: 'inherit', fontSize: 'inherit', cursor: 'pointer', padding: 0 }}>♥ {p.hearts}</button>
          <button onClick={() => openActComments(p.id, actCmtOpen === p.id)} style={{ background: 'transparent', border: 0, color: actCmtOpen === p.id ? TEALB : muted, fontFamily: 'inherit', fontSize: 'inherit', fontWeight: actCmtOpen === p.id ? 800 : 400, cursor: 'pointer', padding: 0 }}>↳ {replyCount}</button>
        </div>
        {actCmtOpen === p.id && (
          <div style={{ alignSelf: 'stretch', marginTop: 10, borderTop: `1px solid ${hair}`, paddingTop: 10 }}>
            {[...(p.comments || []), ...(actComments[p.id] || [])].map((c, ci) => (
              <div key={ci} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.who === 'You' ? TEALB : muted, flexShrink: 0, marginTop: 2 }}>{c.who}</span>
                <span style={{ fontFamily: t.BODY, fontSize: 13, color: cardInk, lineHeight: 1.35 }}>{c.body}</span>
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px', gap: 8, alignItems: 'center', marginTop: (actComments[p.id] || []).length ? 4 : 0 }}>
              <input value={actCmtDraft} onChange={(e) => setActCmtDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendActComment(p.id); }} placeholder="Message…" style={{ minWidth: 0, height: 38, background: t.SURFACE, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 999, padding: '0 14px', fontFamily: t.BODY, fontSize: 14, color: t.INK, outline: 'none', letterSpacing: '-0.005em' }} />
              <button onClick={() => sendActComment(p.id)} disabled={!actCmtDraft.trim()} style={{ height: 38, border: 0, borderRadius: 999, background: actCmtDraft.trim() ? t.ACCENT : t.SURFACE, color: actCmtDraft.trim() ? '#031f1c' : t.INK50, fontFamily: t.BODY, fontSize: 12.5, fontWeight: 760, cursor: actCmtDraft.trim() ? 'pointer' : 'default', opacity: actCmtDraft.trim() ? 1 : 0.86 }}>Send</button>
            </div>
          </div>
        )}
      </div>
    );
  };

  // Community = the live, Strava-style activity feed (mirrors the website's
  // "Today on Shape" community page): real workouts logged by members, with
  // the actual stats — PRs, runs with splits, logged sessions.
  const COMMUNITY_ACTIVITIES = [
    { kind: 'pr', who: 'Priya Shah', city: 'Gold St. Barbell · NYC', tier: 'PEAK', ago: '6m', body: 'Block 3 paying off. Felt like there was a 4th in the tank.', lift: 'Deadlift', topset: '1×3', load: '245 lb', e1rm: '268 lb', kudos: 41, replies: 6 },
    { kind: 'run', who: 'Drew Oyelaran', city: 'East River Loop · NYC', tier: 'LEGEND', ago: '34m', body: 'Last long run before taper. Negative split the back 6.', distance: '18.2 mi', pace: '8:42/mi', duration: '2:38', elev: '540 ft', route: true, kudos: 28, replies: 4 },
    { kind: 'workout', who: 'Casey Morgan', city: 'Shape · Brooklyn', tier: 'FORM', ago: '1h', body: 'Squats felt locked in. RPE 8 across the board, no missed reps.', title: 'Lower strength · Block 3', duration: '52 min', exercises: 6, rpe: 8.5, kudos: 38, replies: 4 },
    { kind: 'pr', who: 'Devon Wells', city: 'Iron House · Chicago', tier: 'TEMPO', ago: '2h', body: 'Eight months in. First time the bar moved this clean.', lift: 'Bench Press', topset: '1×5', load: '225 lb', e1rm: '253 lb', kudos: 142, replies: 18 },
    { kind: 'run', who: 'Sofia Park', city: 'Prospect Park · NYC', tier: 'BASE', ago: '3h', body: 'Easy Zone 2. Kept it conversational the whole way.', distance: '5.1 mi', pace: '9:30/mi', duration: '48:27', elev: '180 ft', route: true, kudos: 17, replies: 3 },
    { kind: 'workout', who: 'Maya Okafor', city: 'Shape · coaching floor', tier: 'LEGEND', ago: '4h', body: 'Demo day with the strength group. Everyone left with a PR attempt logged.', title: 'Coaching floor · group lift', duration: '60 min', exercises: 5, rpe: 7, kudos: 64, replies: 9 },
  ];
  const ActivityCard = ({ a }) => {
    const tc = bsTierColor(a.tier);
    const key = `${a.who}|${a.ago}`;
    const liked = !!actLikes[key];
    const comments = actComments[key] || [];
    const cmtOpen = actCmtOpen === key;
    const typeLabel = a.kind === 'pr' ? 'Strength' : a.kind === 'run' ? 'Run' : 'Workout';
    const title = a.kind === 'pr' ? `${a.lift} — new PR` : a.kind === 'run' ? `${a.distance} long run` : a.title;
    const cheer = a.kind === 'pr' ? 'Spot' : a.kind === 'run' ? 'Match' : 'Respect';
    const stats = a.kind === 'pr' ? [['Top set', a.topset], ['Load', a.load], ['Est. 1RM', a.e1rm]]
      : a.kind === 'run' ? [['Distance', a.distance], ['Pace', a.pace], ['Time', a.duration]]
      : [['Time', a.duration], ['Moves', `${a.exercises}`], ['RPE', `${a.rpe}`]];
    const showRoute = a.kind === 'run';
    const openCardProfile = () => setOpenProfile({ who: a.who, kind: 'CLIENT', tier: a.tier, init: bsInitials(a.who), city: a.city, public: true, photo: bsDemoFace(a.who) });
    return (
      <div style={{ borderRadius: 18, border: `1px solid ${hair}`, background: card, overflow: 'hidden' }}>
        <div style={{ height: 3, background: tc }} />
        <div style={{ padding: '13px 15px 15px' }}>
          {/* author + activity type */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 12 }}>
            <BSFacetAvatar size={42} c={tc} initial={bsInitials(a.who) || '?'} photo={bsDemoFace(a.who)} showRank={false} onClick={openCardProfile} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <button onClick={openCardProfile} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 14.5, color: cardInk, whiteSpace: 'nowrap' }}>{a.who}</button>
                <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: tc, border: `1px solid ${tc}80`, padding: '2px 5px', borderRadius: 3, lineHeight: 1 }}>{String(a.tier)}</span>
              </div>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: muted, marginTop: 4, letterSpacing: '0.04em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.ago} ago · {a.city}</div>
            </div>
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fff', background: tc, padding: '3px 7px', borderRadius: 5 }}>{typeLabel}</span>
          </div>
          {/* title + note */}
          <div style={{ fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 800, color: cardInk, letterSpacing: '-0.015em', lineHeight: 1.12 }}>{title}</div>
          {a.body && <p style={{ fontFamily: t.BODY, fontSize: 13.5, lineHeight: 1.4, color: muted, margin: '7px 0 0' }}>{a.body}</p>}
          {/* GPS route map (runs) — halftone dot grid in the member's tier color */}
          {showRoute && (
            <div style={{ position: 'relative', marginTop: 12, height: 104, borderRadius: 12, overflow: 'hidden', border: `1px solid ${tc}33`, background: `radial-gradient(circle at 30% 30%, ${tc}cc 0 1.3px, transparent 1.7px) 0 0/9px 9px, linear-gradient(135deg, ${tc}3a, ${tc}12)` }}>
              <span style={{ position: 'absolute', left: 10, bottom: 8, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#fff', background: 'rgba(0,0,0,0.45)', padding: '3px 6px', borderRadius: 3 }}>GPS route</span>
            </div>
          )}
          {/* stat row */}
          <div style={{ display: 'flex', marginTop: 13, paddingTop: 12, borderTop: `1px solid ${hair}` }}>
            {stats.map(([k, v], i) => (
              <div key={i} style={{ flex: 1, minWidth: 0, borderLeft: i ? `1px solid ${hair}` : 0, paddingLeft: i ? 12 : 0 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{k}</div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: cardInk, marginTop: 3, letterSpacing: '-0.02em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{v}</div>
              </div>
            ))}
          </div>
          {/* verified + engagement */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginTop: 13 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, marginRight: 'auto', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: TEALB, fontWeight: 800 }}>
              <span style={{ display: 'inline-flex', width: 12, height: 12, borderRadius: 6, border: `1px solid ${TEALB}`, alignItems: 'center', justifyContent: 'center', fontSize: 7 }}>✓</span>Verified
            </span>
            <button onClick={() => toggleActLike(key)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '7px 13px', background: liked ? tc : 'transparent', color: liked ? '#fff' : muted, border: `1px solid ${liked ? tc : hair}`, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>↑ {cheer} · {(a.kudos || 0) + (liked ? 1 : 0)}</button>
            <button onClick={() => openActComments(key, cmtOpen)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer', borderRadius: 999, padding: '7px 12px', background: cmtOpen ? `${TEALB}1f` : 'transparent', color: cmtOpen ? TEALB : muted, border: `1px solid ${cmtOpen ? TEALB : hair}`, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase' }}>↳ {(a.replies || 0) + comments.length}</button>
          </div>
          {/* comments */}
          {cmtOpen && (
            <div style={{ marginTop: 12, borderTop: `1px solid ${hair}`, paddingTop: 12 }}>
              {comments.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: c.who === 'You' ? TEALB : muted, flexShrink: 0, marginTop: 2 }}>{c.who}</span>
                  <span style={{ fontFamily: t.BODY, fontSize: 13, color: cardInk, lineHeight: 1.35 }}>{c.body}</span>
                </div>
              ))}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 58px', gap: 8, alignItems: 'center', marginTop: comments.length ? 4 : 0 }}>
                <input value={actCmtDraft} onChange={(e) => setActCmtDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') sendActComment(key); }} placeholder="Message…" style={{ minWidth: 0, height: 38, background: t.SURFACE, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 999, padding: '0 14px', fontFamily: t.BODY, fontSize: 14, color: t.INK, outline: 'none', letterSpacing: '-0.005em' }} />
                <button onClick={() => sendActComment(key)} disabled={!actCmtDraft.trim()} style={{ height: 38, border: 0, borderRadius: 999, background: actCmtDraft.trim() ? t.ACCENT : t.SURFACE, color: actCmtDraft.trim() ? '#031f1c' : t.INK50, fontFamily: t.BODY, fontSize: 12.5, fontWeight: 760, cursor: actCmtDraft.trim() ? 'pointer' : 'default', opacity: actCmtDraft.trim() ? 1 : 0.86 }}>Send</button>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  };

  const Pill = ({ on, onClick, children, badge = 0 }) => (
    <button onClick={onClick} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 4px', borderRadius: 9, border: 0, background: on ? TEAL : 'transparent', color: on ? '#031f1c' : cardInk, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.05em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>
      {children}
      {badge > 0 && <span style={{ minWidth: 13, height: 13, borderRadius: 999, background: '#ff5a5f', color: '#fff', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>{badge > 9 ? '9+' : badge}</span>}
    </button>
  );

  if (openProfile) {
    return <BSPublicProfile person={openProfile} onBack={() => setOpenProfile(null)} onMessage={async (person) => {
      setOpenProfile(null);
      let convId = null;
      if (person.userId) {
        try { const res = await window.ShapeMessages?.getOrCreateMemberConversation?.({ otherUserId: person.userId }); if (res && res.data) convId = res.data; }
        catch (e) { window.__bsToast?.(e?.message || 'Could not start conversation.', 'err'); }
      }
      setOpenChat({ n: person.who, s: ROLE[person.kind]?.label || 'Member', c: bsTierColor(person.tier), i: person.init, messages: [], dm: true, conversation_id: convId });
      loadMemberThreads();
    }} />;
  }
  if (openChat) {
    const isCh = !!openChat.channelId || String(openChat.n || '').startsWith('#');
    return (
      <BSChatThread
        thread={{ who: isCh && !String(openChat.n || '').startsWith('#') ? `# ${openChat.n}` : openChat.n, role: openChat.s || (isCh ? 'Channel' : 'Direct message'), last: openChat.last, time: '', messages: openChat.messages || [], group: isCh, conversationId: openChat.conversation_id, channelId: openChat.channelId }}
        eyebrow={openChat.channelId ? 'Channel' : openChat.dm ? 'Private thread' : 'Direct message'}
        onBack={() => setOpenChat(null)}
        onOpenProfile={(person) => setOpenProfile(person)}
      />
    );
  }

  // "Training now" presence rail (Signal redesign). Illustrative for now — the
  // app has a live online *count* but not per-person current-activity, so this
  // is demo data wired through the real tier-color helpers; swap `TRAINING_NOW`
  // for a live presence feed when the backend exposes who's-doing-what.
  const TRAINING_NOW = [
    { name: 'Priya Shah',   tier: 'peak',   live: true,  photo: '1544005313-94ddf0286df2' },
    { name: 'Drew Oyelaran', tier: 'legend',             photo: '1499996860823-5214fcc65f8f' },
    { name: 'Casey Morgan', tier: 'form',                photo: '1507003211169-0a1dd7228f2d' },
    { name: 'Devon Wells',  tier: 'tempo',               photo: '1500648767791-00dcc994a43e' },
    { name: 'Maya Okafor',  tier: 'legend', role: 'trainer', photo: '1438761681033-6461ffad8d80' },
    { name: 'Sofia Park',   tier: 'base',                photo: '1487412720507-e7ab37603c6f' },
  ];
  const bsUnsplash = (id) => id ? `https://images.unsplash.com/photo-${id}?w=120&h=120&fit=crop&crop=faces&q=72&auto=format` : null;
  const liftingNow = online > 0 ? online : 2104;

  return (
    <BSPage>
      {/* Tab-aware masthead — "CHAT" eyebrow + serif title that follows the
          active tab (Community / Channels / Friends / Your team). */}
      <div style={{ padding: `50px ${t.padX}px 2px` }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: TEALB, fontWeight: 700 }}>Chat</div>
            <h1 style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 31, letterSpacing: '-0.03em', color: t.INK, margin: '5px 0 0', lineHeight: 1 }}>
              {tab === 'feed' ? 'Community' : tab === 'channels' ? 'Channels' : tab === 'messages' ? 'Friends' : 'Your team'}
            </h1>
          </div>
          <BSFacetAvatar size={34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={onProfile} />
        </div>
      </div>

      {/* Live "training now" presence rail — kept visible on every chat tab. */}
      <div style={{ padding: `8px ${t.padX}px 6px` }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
            <span style={{ width: 6, height: 6, borderRadius: 3, background: TEAL, boxShadow: `0 0 0 3px ${TEAL}33` }} />
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, fontWeight: 700 }}>{liftingNow.toLocaleString()} lifting now · near you</span>
          </div>
          <div className="bs-scroll" style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'visible', padding: '13px 12px 8px' }}>
            {TRAINING_NOW.map((p, i) => {
              // Coaches wear their own ladder color (Icon=teal, …); members the client ramp.
              const tc = p.role ? bsTierColor(String(bsCoachTier(p.tier)).toLowerCase()) : bsTierColor(p.tier);
              return (
                <button key={i} onClick={() => setOpenProfile({ who: p.name, kind: p.role === 'trainer' ? 'TRAINER' : p.role === 'nutritionist' ? 'NUTRI' : 'CLIENT', tier: p.tier, public: true, photo: bsUnsplash(p.photo) || bsDemoFace(p.name) })} style={{ flex: '0 0 auto', width: 58, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <BSFacetAvatar size={44} c={tc} initial={bsInitials(p.name)} photo={bsUnsplash(p.photo)} rank={bsTierRank(p.tier)} live={!!p.live} BG={t.PAPER} INK={'#fff'} />
                  </div>
                  <span style={{ display: 'block', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 11, marginTop: 10, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', color: cardInk }}>{p.name.split(' ')[0]}</span>
                </button>
              );
            })}
          </div>
      </div>

      {/* Feed / Channels / Friends / Team */}
      <div style={{ padding: `10px ${t.padX}px 0` }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 3, border: `1px solid ${hair}`, borderRadius: 12, padding: 3 }}>
          {[['feed', 'Feed', 0], ['channels', 'Channels', chUnread], ['messages', 'Friends', friendUnread], ['teams', 'Team', coachUnread]].map(([k, l, b]) => <Pill key={k} on={tab === k} onClick={() => setTab(k)} badge={b}>{l}</Pill>)}
        </div>
      </div>

      {tab !== 'feed' ? (
        (() => {
          const role = roleProp || (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().profile && window.ShapeAuth.getCachedState().profile.role) || 'client';
          const isCoach = role === 'trainer' || role === 'nutritionist';
          const coaches = threadRows.length ? threadRows : (loggedIn ? [] : [
            { n: 'Maya Okafor', s: 'Trainer · Strength', c: '#c0533b', i: 'M', messages: BS_SAMPLE_COACH_DMS['Maya Okafor'] },
            { n: 'Rae Lindqvist', s: 'Nutritionist · Sports nutrition', c: '#a07a2e', i: 'R', messages: BS_SAMPLE_COACH_DMS['Rae Lindqvist'] },
            { n: 'Dr. Sam Huang', s: 'Coach · Endurance', c: '#147b68', i: 'S', messages: BS_SAMPLE_COACH_DMS['Dr. Sam Huang'] },
          ]);
          // A chat list row — no card box; divider-separated (matches the
          // attached design): avatar + online dot, name, role eyebrow, message
          // preview, time, and a teal unread badge.
          const Row = (f, i, arr) => {
            const count = (unread && unread['dm:' + (f.conversation_id || '')]) || 0;
            const last = f.last || (f.messages && f.messages.length ? (f.messages[f.messages.length - 1].t || '') : '');
            const time = f.time || (f.messages && f.messages.length ? (f.messages[f.messages.length - 1].time || '') : '');
            const online = !!f.online || count > 0;
            const isLast = Array.isArray(arr) && i === arr.length - 1;
            return (
              <button key={i} onClick={() => { window.ShapeUnread?.markConversationRead?.(f.conversation_id); setOpenChat(f); }} style={{ display: 'grid', gridTemplateColumns: 'auto 1fr auto', gap: 11, alignItems: 'center', padding: '10px 2px', borderBottom: isLast ? 0 : `1px solid ${t.isLight ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.045)'}`, background: 'transparent', border: 0, color: cardInk, textAlign: 'left', cursor: 'pointer', width: '100%' }}>
                <span style={{ position: 'relative', flexShrink: 0, display: 'inline-flex' }}>
                  <BSFacetAvatar size={46} c={bsTierColor(bsPostTier({ who: f.n }))} initial={bsInitials(f.n) || f.i} photo={f.conversation_id ? undefined : bsDemoFace(f.n)} showRank={false} />
                  {online && <span style={{ position: 'absolute', right: -2, bottom: -2, width: 12, height: 12, borderRadius: 999, background: '#3ddc97', border: `2px solid ${t.PAPER}` }} />}
                </span>
                <span style={{ minWidth: 0, display: 'block' }}>
                  <span style={{ display: 'block', fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 15, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.n}</span>
                  {f.s && <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted, fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.s}</span>}
                  {last && <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 12.5, color: count > 0 ? cardInk : muted, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{last}</span>}
                </span>
                <span style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 7, alignSelf: 'flex-start', marginTop: 2 }}>
                  {time && <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: count > 0 ? TEALB : muted, fontWeight: 700 }}>{time}</span>}
                  {count > 0 && <span style={{ minWidth: 18, height: 18, borderRadius: 999, background: TEAL, color: '#031f1c', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{count > 9 ? '9+' : count}</span>}
                </span>
              </button>
            );
          };
          // List header — "X unread · Y threads" + New.
          const ThreadHead = (rows) => {
            const tot = (rows || []).reduce((a, f) => a + ((unread && unread['dm:' + (f.conversation_id || '')]) || 0), 0);
            const n = (rows || []).length;
            return (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '2px 2px 8px' }}>
                <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, fontWeight: 700 }}>{tot > 0 ? `${tot} unread · ` : ''}{n} thread{n === 1 ? '' : 's'}</span>
                <button onClick={() => { setNewDmOpen(true); setDmQuery(''); setDmResults([]); }} title="Start a conversation" style={{ background: 'transparent', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: TEALB, padding: 0 }}>+ New</button>
              </div>
            );
          };

          if (tab === 'messages') {
            // Friends: a simple list of people — tap one to open the chat.
            const friends = friendRows.length ? friendRows : (loggedIn ? [] : (isCoach
              ? [{ n: 'Sofia Martinez', s: 'Active now', c: '#147b68', i: 'S', conversation_id: 'demo-sofia', messages: BS_SAMPLE_DMS['Sofia Martinez'] }, { n: 'Dev Patel', s: '2h ago', c: '#2e6fa0', i: 'D', messages: BS_SAMPLE_DMS['Dev Patel'] }, { n: 'Aria Kim', s: 'Yesterday', c: '#8a5cf6', i: 'A', messages: BS_SAMPLE_DMS['Aria Kim'] }]
              : [{ n: 'Sofia Martinez', s: 'Active now', c: '#147b68', i: 'S', conversation_id: 'demo-sofia', messages: BS_SAMPLE_DMS['Sofia Martinez'] }, { n: 'Jordan Chen', s: '2h ago', c: '#c0533b', i: 'J', messages: BS_SAMPLE_DMS['Jordan Chen'] }, { n: 'Maya Okafor', s: 'Active now', c: '#a07a2e', i: 'M', messages: BS_SAMPLE_DMS['Maya Okafor'] }, { n: 'Dev Patel', s: 'Yesterday', c: '#2e6fa0', i: 'D', messages: BS_SAMPLE_DMS['Dev Patel'] }, { n: 'Aria Kim', s: '3h ago', c: '#8a5cf6', i: 'A', messages: BS_SAMPLE_DMS['Aria Kim'] }]));
            return (
              <div style={{ padding: `16px ${t.padX}px 90px`, display: 'flex', flexDirection: 'column' }}>
                {ThreadHead(friends)}
                {friends.map(Row)}
              </div>
            );
          }

          // Teams: Channels / Coaches / Support selector. Support is its own
          // continuous AI-backed thread (rendered inline below), not a channel.
          const chList = (channels && channels.length) ? channels : (loggedIn ? [] : BS_SAMPLE_CHANNELS);
          const _chQ = channelQuery.trim().toLowerCase();
          const chDisplay = chList
            .map(c => ({ ...c, pinned: (c.id in pinOverride) ? pinOverride[c.id] : !!c.pinned }))
            .filter(c => !_chQ || (c.name || '').toLowerCase().includes(_chQ))
            .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));
          const _coachUnread = (coaches || []).reduce((a, c) => a + (unread['dm:' + (c.conversation_id || '')] || 0), 0);
          // Channels moved to its own top-level tab — Team keeps Coaches + Support.
          const selectors = [
            { key: 'coaches', label: 'Coaches', color: '#c0533b', badge: _coachUnread },
            { key: 'support', label: 'Support', color: '#2e6fa0', badge: 0 },
          ];
          const active = selectors.find(s => s.key === teamsSel) || selectors[0];
          const _chPalette = ['#147b68', '#c0533b', '#a07a2e', '#2e6fa0', '#8a5cf6'];
          const chRow = (ch, i) => {
            const isSample = String(ch.id || '').startsWith('sample');
            return (
              <div key={ch.id} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 2px', borderTop: i ? `1px solid ${hair}66` : 0 }}>
                {(() => { const cc = bsChannelColor(ch.name); return (
                <div style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 9, background: `${cc}1f`, border: `1px solid ${cc}55`, color: cc, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BSChannelIcon name={ch.name} size={16} /></div>
                ); })()}
                <button onClick={() => ch.joined ? openChannelNow(ch) : joinChannelNow(ch)} style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, textAlign: 'left', cursor: 'pointer', color: cardInk, padding: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 14, letterSpacing: '-0.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>#{ch.name}</span>
                    {ch.live && <span style={{ fontFamily: t.MONO, fontSize: 6.5, fontWeight: 800, letterSpacing: '0.12em', color: '#e0518a', border: '1px solid #e0518a', padding: '1px 3px', borderRadius: 3 }}>LIVE</span>}
                    {ch.private && <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.1em', color: muted }}>🔒</span>}
                    {ch.isHost && <span style={{ fontFamily: t.MONO, fontSize: 7, fontWeight: 800, letterSpacing: '0.1em', color: TEALB }}>HOST</span>}
                  </div>
                  <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.05em', color: muted, marginTop: 2 }}>{ch.memberCount} member{ch.memberCount === 1 ? '' : 's'}{ch.online ? ` · ${ch.online} online` : ''}</div>
                </button>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                  {unreadBadge('ch:' + ch.id)}
                  <button onClick={() => pinChannelNow(ch)} aria-label={ch.pinned ? 'Unpin' : 'Pin'} title={ch.pinned ? 'Unpin' : 'Pin to top'} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, border: 0, background: 'transparent', cursor: 'pointer', padding: 0, opacity: ch.pinned ? 1 : 0.35 }}><PinIcon filled={ch.pinned} size={16} /></button>
                  {ch.isHost && !isSample && <button onClick={() => { setAddMemberFor(ch); setMemberQuery(''); setMemberResults([]); }} aria-label="Add member" title="Add member" style={{ width: 24, height: 24, borderRadius: 999, background: 'transparent', color: muted, border: `1px solid ${hair}`, fontFamily: t.MONO, fontSize: 13, fontWeight: 700, lineHeight: 1, cursor: 'pointer', padding: 0 }}>+</button>}
                  <button onClick={() => ch.joined ? openChannelNow(ch) : joinChannelNow(ch)} style={{ padding: '5px 12px', borderRadius: 999, background: ch.joined ? 'transparent' : TEAL, color: ch.joined ? cardInk : '#031f1c', border: ch.joined ? `1px solid ${hair}` : 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{ch.joined ? 'Open' : 'Join'}</button>
                </div>
              </div>
            );
          };
          // Channels — its own top-level tab (Signal v2). Same wired channel
          // list/create/search as before, lifted out of the Team selector.
          if (tab === 'channels') {
            return (
              <div style={{ padding: `16px ${t.padX}px 90px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 2px 2px' }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, fontWeight: 700 }}>Your channels</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted, fontWeight: 700 }}>{chUnread > 0 ? `${chUnread} unread · ` : ''}{chDisplay.length} channel{chDisplay.length === 1 ? '' : 's'}</span>
                </div>
                {/* Search + a compact "+" box that opens the create form */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ position: 'relative', display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <span style={{ position: 'absolute', left: 13, fontSize: 13, color: muted, pointerEvents: 'none' }}>⌕</span>
                    <input value={channelQuery} onChange={(e) => setChannelQuery(e.target.value)} placeholder="Search channels…" style={{ width: '100%', height: 36, background: t.SURFACE, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 999, padding: '0 34px', fontFamily: t.BODY, fontSize: 13.5, color: t.INK, outline: 'none' }} />
                    {channelQuery && <button onClick={() => setChannelQuery('')} aria-label="Clear search" style={{ position: 'absolute', right: 10, width: 22, height: 22, borderRadius: 999, border: 0, background: 'transparent', color: muted, cursor: 'pointer', fontSize: 14, padding: 0 }}>×</button>}
                  </div>
                  <button onClick={() => setNewChannel(newChannel === null ? '' : null)} aria-label={newChannel === null ? 'Create channel' : 'Cancel'} title={newChannel === null ? 'Create new channel' : 'Cancel'} style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 11, background: newChannel === null ? `${TEALB}1f` : 'transparent', color: newChannel === null ? TEALB : muted, border: `1px solid ${newChannel === null ? `${TEALB}66` : hair}`, fontSize: 20, fontWeight: 400, lineHeight: 1, cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'transform .15s', transform: newChannel === null ? 'none' : 'rotate(45deg)' }}>+</button>
                </div>
                {newChannel !== null && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 11, borderRadius: 14, border: `1px solid ${hair}`, background: card, padding: 13 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: TEALB }}>New channel</div>
                    <input autoFocus value={newChannel} onChange={(e) => setNewChannel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createChannelNow(); if (e.key === 'Escape') { setNewChannel(null); setNewChannelPrivate(false); } }} placeholder="Channel name — e.g. Sunday Run Club" style={{ width: '100%', boxSizing: 'border-box', height: 40, background: t.SURFACE, border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 12, padding: '0 14px', fontFamily: t.BODY, fontSize: 14.5, color: t.INK, outline: 'none' }} />
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                      {[['public', 'Public', 'Anyone can join', '🌐'], ['private', 'Private', 'Invite only', '🔒']].map(([k, title, sub, icon]) => {
                        const on = (k === 'private') === newChannelPrivate;
                        return (
                          <button key={k} onClick={() => setNewChannelPrivate(k === 'private')} style={{ display: 'flex', flexDirection: 'column', gap: 3, textAlign: 'left', padding: '10px 12px', borderRadius: 12, border: `1.5px solid ${on ? TEALB : hair}`, background: on ? `${TEALB}1a` : 'transparent', cursor: 'pointer' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, color: on ? cardInk : muted, letterSpacing: '-0.01em' }}><span style={{ fontSize: 12 }}>{icon}</span>{title}</span>
                            <span style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted }}>{sub}</span>
                          </button>
                        );
                      })}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 1 }}>
                      <button onClick={() => { setNewChannel(null); setNewChannelPrivate(false); }} style={{ flex: '0 0 auto', height: 40, padding: '0 18px', borderRadius: 12, background: 'transparent', color: muted, border: `1px solid ${hair}`, fontFamily: t.BODY, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                      <button onClick={createChannelNow} disabled={!newChannel.trim()} style={{ flex: 1, height: 40, borderRadius: 12, background: newChannel.trim() ? TEAL : `${TEAL}55`, color: '#031f1c', border: 0, fontFamily: t.BODY, fontSize: 13.5, fontWeight: 760, cursor: newChannel.trim() ? 'pointer' : 'default' }}>Create channel</button>
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 2 }}>{chDisplay.map(chRow)}</div>
                {_chQ && chDisplay.length === 0 && (
                  <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, padding: '4px 2px' }}>No channels match “{channelQuery.trim()}”.</div>
                )}
                {channels && chList.length === 0 && newChannel === null && (
                  <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted, padding: '4px 2px' }}>No channels yet — start one.</div>
                )}
              </div>
            );
          }
          return (
            <div style={{ padding: `16px ${t.padX}px 90px`, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center', gap: 10 }}>
                {selectors.map(sec => {
                  const on = active.key === sec.key;
                  return (
                    <button key={sec.key} onClick={() => setTeamsSel(sec.key)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 7px', minWidth: 90, boxSizing: 'border-box', borderRadius: 999, border: `1px solid ${on ? sec.color : hair}`, background: on ? `${sec.color}1f` : 'transparent', color: cardInk, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      <span style={{ width: 5, height: 5, borderRadius: 3, background: sec.color }} />{sec.label}
                      {sec.badge > 0 && <span style={{ minWidth: 13, height: 13, borderRadius: 999, background: '#ff5a5f', color: '#fff', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1 }}>{sec.badge > 9 ? '9+' : sec.badge}</span>}
                    </button>
                  );
                })}
              </div>
              {active.key === 'coaches' ? (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {ThreadHead(coaches)}
                  {coaches.map(Row)}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingBottom: 96 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>Support · you & the Shape team</div>
                  {supportMsgs.map((m, i) => (
                    m.me ? (
                      <div key={i} style={{ alignSelf: 'flex-end', maxWidth: '86%' }}>
                        <div style={{ padding: '9px 12px', borderRadius: 14, background: TEAL, color: '#031f1c', border: 0, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{m.t}</div>
                      </div>
                    ) : (
                      <div key={i} style={{ alignSelf: 'flex-start', maxWidth: '90%', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                        <div style={{ flexShrink: 0 }}>
                          <BSFacetAvatar size={32} c={'#2e6fa0'} initial={(m.who || 'N').trim().charAt(0).toUpperCase()} showRank={false} BG={t.PAPER} INK={'#fff'} />
                        </div>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#2e6fa0', fontWeight: 700, marginBottom: 3 }}>{m.who}{m.bot ? " · Shape's Assistant" : ''}</div>
                          <div style={{ padding: '9px 12px', borderRadius: 14, background: card, color: cardInk, border: `1px solid ${hair}`, fontFamily: t.BODY, fontSize: 14, lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>{m.t}</div>
                          {Array.isArray(m.actions) && m.actions.length > 0 && (
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, marginTop: 8 }}>
                              {m.actions.map((a, ai) => (
                                <button key={ai} onClick={() => runSupportAction(a)} style={{ border: `1px solid ${TEALB}`, background: `${TEALB}1a`, color: cardInk, borderRadius: 12, padding: '7px 11px', fontFamily: t.BODY, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', lineHeight: 1.3, display: 'inline-flex', flexDirection: 'column' }}>
                                  <span>{a.label}</span>
                                  {a.meta && <span style={{ fontSize: 9.5, opacity: 0.7, fontFamily: t.MONO }}>{a.meta}</span>}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )
                  ))}
                  {supportBusy && <div style={{ alignSelf: 'flex-start', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted }}>Nora is typing…</div>}
                </div>
              )}
            </div>
          );
        })()
      ) : (
        <>
          {/* Role filter chips */}
          <div style={{ display: 'flex', flexWrap: 'nowrap', justifyContent: 'center', gap: 10, padding: `10px ${t.padX}px` }}>
            {CHIP_KEYS.map(k => {
              const on = filter === k;
              return (
                <button key={k} onClick={() => setFilter(k)} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 4, padding: '8px 7px', minWidth: 90, boxSizing: 'border-box', borderRadius: 999, border: `1px solid ${on ? ROLE[k].color : hair}`, background: on ? `${ROLE[k].color}1f` : 'transparent', color: cardInk, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                  <span style={{ width: 5, height: 5, borderRadius: 3, background: ROLE[k].color }} />{chipLabel(k)}
                </button>
              );
            })}
          </div>

          {filter === 'COMMUNITY' ? (
            <div style={{ padding: `14px ${t.padX}px 84px`, display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Community feed is a Strava-style activity stream — just workouts.
                  Illustrative for now; wire to real workout/run/PR logs later. */}
              {/* Call ActivityCard as a function (not <ActivityCard/>) so it
                  inlines into this render — rendering it as an element remounts
                  the card every keystroke (new fn identity), dropping the
                  comment input's focus/keyboard. */}
              {COMMUNITY_ACTIVITIES.map((a, i) => <React.Fragment key={`act-${i}`}>{ActivityCard({ a })}</React.Fragment>)}
            </div>
          ) : (
          <div style={{ padding: `10px ${t.padX}px 84px`, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {shown.map(renderPost)}
          </div>
          )}
        </>
      )}
      {tab === 'feed' && (
        <BSMessageComposer value={draft} onChange={setDraft} onSend={post} pinned placeholder="Message…" />
      )}
      {tab === 'teams' && teamsSel === 'support' && (
        <BSMessageComposer value={supportDraft} onChange={setSupportDraft} onSend={sendSupport} pinned placeholder="Message the Shape team…" />
      )}
      {newDmOpen && createPortal(
        <div onClick={() => setNewDmOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '14px 18px calc(20px + env(safe-area-inset-bottom, 0px))', maxHeight: '72%', overflowY: 'auto', boxShadow: '0 -24px 70px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 12px' }}><div style={{ width: 38, height: 4, borderRadius: 99, background: t.RULE }} /></div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>New message</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, margin: '4px 0 14px' }}>Start a conversation</div>
            <input autoFocus value={dmQuery} onChange={(e) => setDmQuery(e.target.value)} placeholder="Search people…" style={{ width: '100%', height: 44, background: t.PAPER2, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: '0 14px', fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            {dmResults.map((m) => {
              const nm = m.name || m.full_name || 'Member';
              const pal = ['#147b68', '#c0533b', '#a07a2e', '#2e6fa0', '#8a5cf6'];
              return (
                <button key={m.id || nm} onClick={() => startDm(m)} style={{ display: 'flex', alignItems: 'center', gap: 11, width: '100%', padding: '10px 12px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, marginBottom: 8, cursor: 'pointer', textAlign: 'left' }}>
                  <BSFacetAvatar size={36} c={pal[nm.length % pal.length]} initial={nm.trim().charAt(0).toUpperCase()} showRank={false} />
                  <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 15 }}>{nm}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: TEALB }}>MESSAGE →</span>
                </button>
              );
            })}
            {dmResults.length === 0 && <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.INK50, padding: '8px 2px' }}>{dmQuery.trim() ? 'No matches.' : 'Type a name to find someone.'}</div>}
          </div>
        </div>,
        (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
      )}
      {addMemberFor && createPortal(
        <div onClick={() => setAddMemberFor(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '14px 18px calc(20px + env(safe-area-inset-bottom, 0px))', maxHeight: '72%', overflowY: 'auto', boxShadow: '0 -24px 70px rgba(0,0,0,0.55)' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '2px 0 12px' }}><div style={{ width: 38, height: 4, borderRadius: 99, background: t.RULE }} /></div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, letterSpacing: '-0.02em' }}>Add to # {addMemberFor.name}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, margin: '4px 0 14px' }}>Add Shape members</div>
            <input autoFocus value={memberQuery} onChange={(e) => setMemberQuery(e.target.value)} placeholder="Search members…" style={{ width: '100%', height: 44, background: t.PAPER2, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: '0 14px', fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, outline: 'none', boxSizing: 'border-box', marginBottom: 12 }} />
            {memberResults.map((m) => (
              <button key={m.id} onClick={() => addMemberNow(m)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '11px 12px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, marginBottom: 8, cursor: 'pointer' }}>
                <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 15 }}>{m.name}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: TEALB }}>+ ADD</span>
              </button>
            ))}
            {memberResults.length === 0 && <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', color: t.INK50, padding: '8px 2px' }}>No matches yet — type a name.</div>}
          </div>
        </div>,
        (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body
      )}
    </BSPage>
  );
}

// Chat tab for ALL roles now renders the role-aware "The feed." screen.
// Clients route straight to BSClientFeed; trainers/nutritionists reach it
// through this wrapper (their bundle destructures BSClientChat from window),
// so passing `role` through gives them the Trainer/Nutri chip + coach sections.
function BSClientChat({ onProfile, role = 'client', openRequest }) {
  return <BSClientFeed onProfile={onProfile} role={role} openRequest={openRequest} />;
}

// Whether the signed-in account can actually send messages (member access incl.
// coaches). Set by the app shell (window.ShapeCanChat); defaults to allow when
// unknown so members are never wrongly blocked — only an explicit `false`
// (a non-member previewing) locks the composer.
function useBSCanChat() {
  const [v, setV] = useStateBSC(() => (typeof window !== 'undefined' ? window.ShapeCanChat !== false : true));
  React.useEffect(() => {
    const on = () => setV(window.ShapeCanChat !== false);
    window.addEventListener('shape:canchat', on);
    on();
    return () => window.removeEventListener('shape:canchat', on);
  }, []);
  return v;
}

function BSMessageComposer({ value, onChange, onSend, placeholder = 'Message...', pinned = false }) {
  const t = useBS();
  const canSend = value.trim().length > 0;
  const canChat = useBSCanChat();

  // When pinned, render through a portal into #bs-composer-slot — a node that
  // lives inside the phone-frame container (next to the tab bar). The slot is
  // committed by an ancestor, so it won't exist on this component's first
  // render; resolve it in an effect and re-render once available.
  const [slot, setSlot] = useStateBSC(null);
  React.useEffect(() => {
    if (!pinned) return;
    setSlot(document.getElementById('bs-composer-slot'));
  }, [pinned]);

  // Auto-grow the field like iMessage: one line at rest, expands upward as you
  // type up to a few lines, then scrolls internally. Re-measured on every value
  // change so it also collapses back after a send clears the draft.
  const taRef = React.useRef(null);
  const COMPOSER_MAX_H = 132; // ~6 lines, then the textarea scrolls internally
  React.useLayoutEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, COMPOSER_MAX_H) + 'px';
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_H ? 'auto' : 'hidden';
  }, [value]);

  // The message bubble with the send arrow tucked inside it (iMessage-style):
  // a teal circular ↑ button pinned to the bottom-right of the textarea.
  const field = (
    <div style={{ position: 'relative', width: '100%' }}>
      <textarea
        ref={taRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          // Enter sends; Shift/⌘/Ctrl+Enter drops a newline so longer notes wrap.
          if (e.key === 'Enter' && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
            e.preventDefault();
            onSend();
          }
        }}
        placeholder={placeholder}
        rows={1}
        style={{
          minWidth: 0,
          width: '100%',
          boxSizing: 'border-box',
          minHeight: 40,
          maxHeight: COMPOSER_MAX_H,
          resize: 'none',
          display: 'block',
          background: pinned ? t.SURFACE : t.PAPER,
          border: `1px solid ${t.SURFACE_BORDER}`,
          borderRadius: 20,
          padding: '10px 46px 10px 15px', // right pad clears the embedded send button
          fontFamily: t.BODY,
          fontSize: 14,
          lineHeight: 1.3,
          color: t.INK,
          outline: 'none',
          letterSpacing: '-0.005em',
          overflowY: 'hidden',
        }}
      />
      <button
        onClick={onSend}
        disabled={!canSend}
        aria-label="Send"
        style={{
          position: 'absolute', right: 5, bottom: 5,
          width: 30, height: 30, flexShrink: 0,
          border: 0, borderRadius: 999,
          background: canSend ? t.ACCENT : t.SURFACE_BORDER,
          color: canSend ? '#031f1c' : t.INK50,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: canSend ? 'pointer' : 'default',
          opacity: canSend ? 1 : 0.7,
          transition: 'background .15s ease, opacity .15s ease',
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
      </button>
    </div>
  );

  // Non-members previewing the app can read the thread but not send — tapping
  // the locked bar takes them back to the paywall to join (same idea as the
  // website community preview, where the chat bubble is where you actually send).
  const lockedField = (
    <button
      onClick={() => { try { window.dispatchEvent(new Event('shape:exitPreview')); } catch (e) {} }}
      style={{
        width: '100%', boxSizing: 'border-box', minHeight: 40,
        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        background: pinned ? t.SURFACE : t.PAPER, border: `1px solid ${t.SURFACE_BORDER}`,
        borderRadius: 20, padding: '11px 15px', cursor: 'pointer',
        fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em',
        textTransform: 'uppercase', color: t.INK50,
      }}
    >
      <span aria-hidden>🔒</span> Join Shape to send messages
    </button>
  );
  const body = canChat ? field : lockedField;

  if (pinned) {
    // Docked input bar: spans the full phone-frame width and sits flush on top
    // of the tab bar — reads as part of the screen, not a floating bubble.
    const bar = (
      <div style={{
        pointerEvents: 'auto',
        background: t.PAPER,
        borderTop: `1px solid ${t.SURFACE_BORDER}`,
        padding: `10px ${t.padX}px`,
        boxShadow: `0 -10px 26px ${t.isLight ? 'rgba(15,14,12,0.10)' : 'rgba(0,0,0,0.34)'}`,
      }}>
        {body}
      </div>
    );
    return slot ? createPortal(bar, slot) : null;
  }

  // Non-pinned: floating bubble with a soft drop shadow on the rounded field.
  return (
    <div style={{
      margin: `0 ${t.padX}px 16px`,
      filter: `drop-shadow(0 18px 38px ${t.isLight ? 'rgba(15,14,12,0.16)' : 'rgba(0,0,0,0.42)'})`,
    }}>
      {body}
    </div>
  );
}

// ─── Thread detail ───────────────────────────────────────────
const BS_REACTIONS = ['❤️', '👍', '👎', '😂', '‼️', '❓'];

function useBSReactions() {
  const [reactions, setReactions] = useStateBSC({});
  const [pickerKey, setPickerKey] = useStateBSC(null);
  const toggle = (key, emoji) => {
    setReactions(prev => {
      const next = { ...prev };
      if (next[key] === emoji) delete next[key]; else next[key] = emoji;
      return next;
    });
    setPickerKey(null);
  };
  return { reactions, pickerKey, setPickerKey, toggle };
}

function BSReactionPicker({ t, anchorRight, onPick, current }) {
  return (
    <div style={{
      position: 'absolute',
      bottom: 'calc(100% + 6px)',
      [anchorRight ? 'right' : 'left']: 0,
      display: 'flex', gap: 2, padding: '5px 6px',
      background: t.PAPER2, border: `1px solid ${t.SURFACE_BORDER}`,
      borderRadius: 999, boxShadow: t.ELEVATION,
      zIndex: 6,
    }}>
      {BS_REACTIONS.map(em => (
        <button key={em} onClick={() => onPick(em)} style={{
          width: 32, height: 32, borderRadius: 999, border: 0,
          background: current === em ? 'rgba(10,197,168,0.22)' : 'transparent',
          fontSize: 17, lineHeight: 1, cursor: 'pointer',
        }}>{em}</button>
      ))}
    </div>
  );
}

function BSReactionPill({ t, emoji, anchorRight, onClick }) {
  return (
    <div onClick={onClick} title="Remove reaction" style={{
      position: 'absolute', bottom: -10,
      [anchorRight ? 'left' : 'right']: -6,
      background: t.PAPER2, border: `1px solid ${t.SURFACE_BORDER}`,
      borderRadius: 999, padding: '2px 6px', fontSize: 13, lineHeight: 1,
      boxShadow: t.ELEVATION_SOFT, cursor: 'pointer', zIndex: 2,
    }}>{emoji}</div>
  );
}

function bsLongPress(onTrigger) {
  let id = null;
  return {
    onContextMenu: (e) => { e.preventDefault(); onTrigger(); },
    onMouseDown: () => { id = setTimeout(onTrigger, 380); },
    onMouseUp: () => { if (id) clearTimeout(id); },
    onMouseLeave: () => { if (id) clearTimeout(id); },
    onTouchStart: () => { id = setTimeout(onTrigger, 380); },
    onTouchEnd: () => { if (id) clearTimeout(id); },
    onDoubleClick: (e) => { e.preventDefault(); onTrigger('❤️'); },
  };
}

function BSChatThread({ thread, eyebrow, onBack, onOpenProfile = () => {} }) {
  const t = useBS();
  const [text, setText] = useStateBSC('');
  const [extras, setExtras] = useStateBSC([]);
  const [threadAvatars, setThreadAvatars] = useStateBSC({}); // userId → profile photo
  // Tap a person's avatar/name → open their public profile (people only — not
  // the channel itself). Role inferred from the thread label.
  const threadKind = /nutrition/i.test(thread.role || '') ? 'NUTRI' : /coach|trainer/i.test(thread.role || '') ? 'TRAINER' : 'CLIENT';
  const openP = (name, userId) => {
    const raw = String(name || '').trim();
    if (!raw || raw === 'You' || raw.charAt(0) === '#') return;
    const uid = userId || (!thread.group ? (thread.userId || thread.counterpartId) : null) || null;
    onOpenProfile({ who: raw, kind: threadKind, tier: bsPostTier({ who: raw }), init: bsInitials(raw), userId: uid, photo: (uid && threadAvatars[uid]) || (!uid ? bsDemoFace(raw) : null) });
  };
  // Seed from the thread's last-message preview when it has no message history,
  // so a channel you open isn't blank before you post.
  const seed = (thread.messages && thread.messages.length)
    ? thread.messages
    : (thread.last ? [{ who: thread.who, t: thread.last, time: thread.time || 'now', me: false }] : []);
  const allMessages = [...seed, ...extras];
  // Members' profile photos for the message avatars (visibility-ungated).
  React.useEffect(() => {
    if (!window.ShapeProfiles?.getUserAvatars) return;
    const ids = [...new Set([thread.userId, thread.counterpartId, ...allMessages.map(m => m && m.userId)].filter(Boolean))];
    if (!ids.length) return;
    let on = true;
    window.ShapeProfiles.getUserAvatars(ids).then(av => { if (on && av) setThreadAvatars(prev => ({ ...prev, ...av })); }).catch(() => {});
    return () => { on = false; };
  }, [thread.conversationId, thread.channelId, thread.userId, allMessages.length]);
  const rx = useBSReactions();
  // Per-thread accent (matches the feed bubbles): channels read teal, people read
  // their tier color so the chat stays color-coordinated with the feed.
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  // Coaches read their own tier ladder (Certified/Pro/Elite/Master/Icon) on the
  // coach color ramp; members read the client ladder. `coachTint` maps a client-
  // tier key → the coach ramp color for the same rung.
  const threadIsCoach = threadKind === 'TRAINER' || threadKind === 'NUTRI';
  const coachTint = (clientTier) => bsTierColor(String(bsCoachTier(clientTier)).toLowerCase());
  const threadColor = thread.group ? teal : (threadIsCoach ? coachTint(bsPostTier({ who: thread.who })) : bsTierColor(bsPostTier({ who: thread.who })));

  const send = () => {
    if (!text.trim()) return;
    const body = text.trim();
    setExtras(e => [...e, { who: 'You', t: body, time: 'now', me: true }]);
    setText('');
    // Persist to the backend: direct conversation or community channel.
    const sent = thread.conversationId ? window.ShapeMessages?.sendMessage?.({ conversationId: thread.conversationId, body })
      : thread.channelId ? window.ShapeChannels?.sendMessage?.({ channelId: thread.channelId, body }) : null;
    if (sent && sent.catch) sent.catch(() => {});
  };

  // Realtime: new messages from others drop into the open thread live.
  React.useEffect(() => {
    const myId = window.ShapeAuth?.getCachedState?.()?.user?.id;
    let unsub = null;
    if (thread.channelId && window.ShapeChannels?.subscribeMessages) {
      unsub = window.ShapeChannels.subscribeMessages((row) => {
        if (!row || row.channel_id !== thread.channelId || row.sender_id === myId) return;
        setExtras(e => [...e, { who: row.author_name || 'Member', t: row.body, time: 'now', me: false, userId: row.sender_id || null }]);
        window.ShapeUnread?.markChannelRead?.(thread.channelId);  // it's open → keep it read
      });
    } else if (thread.conversationId && window.ShapeMessages?.subscribeMessages) {
      unsub = window.ShapeMessages.subscribeMessages((row) => {
        if (!row || row.conversation_id !== thread.conversationId || row.sender_id === myId) return;
        setExtras(e => [...e, { who: thread.who || 'Member', t: row.body, time: 'now', me: false, userId: row.sender_id || null }]);
        window.ShapeUnread?.markConversationRead?.(thread.conversationId);
      });
    }
    return () => { try { unsub && unsub(); } catch (e) {} };
  }, [thread.channelId, thread.conversationId]);

  return (
    <BSPage tabBarHeight={0}>
      {/* Custom header with back chevron — no tab bar on the thread screen */}
      <div style={{ padding: '64px 18px 14px', borderBottom: `1px solid ${t.SURFACE_BORDER}`, background: t.PAPER, position: 'sticky', top: 0, zIndex: 2 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
            fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK, fontWeight: 700,
            display: 'inline-flex', alignItems: 'center', gap: 6,
          }}>
            ← Back
          </button>
          <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>{eyebrow}</span>
        </div>
        <button onClick={() => !thread.group && openP(thread.who)} style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'transparent', border: 0, padding: 0, textAlign: 'left', cursor: thread.group ? 'default' : 'pointer', color: 'inherit' }}>
          {thread.group
            ? (() => { const cc = bsChannelColor(thread.who); return <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 12, background: `${cc}1f`, border: `1px solid ${cc}66`, color: cc, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><BSChannelIcon name={thread.who} size={19} /></span>; })()
            : <BSFacetAvatar size={38} c={threadColor} initial={bsInitials(thread.who) || (thread.who.match(/[A-Z]/) || ['?'])[0]} photo={((thread.userId || thread.counterpartId) && threadAvatars[thread.userId || thread.counterpartId]) || (!thread.conversationId && !thread.channelId ? bsDemoFace(thread.who) : undefined)} showRank={false} />}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: t.BODY, fontSize: 18, fontWeight: 760, color: t.INK, letterSpacing: '-0.02em' }}>{thread.who}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{thread.role}</div>
          </div>
        </button>
      </div>

      {/* Messages — bottom padding clears the pinned composer, which now
          sits above the 88px tab bar (composer box ~54px + 12px lift +
          88px tab bar + 24px breathing = 178px). */}
      <div style={{ padding: `16px ${t.padX}px calc(170px + env(safe-area-inset-bottom, 0px))`, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {allMessages.map((m, i) => {
          const me = m.me;
          const rKey = `dt:${i}`;
          const myR = rx.reactions[rKey];
          const pickerOpen = rx.pickerKey === rKey;
          const lp = bsLongPress((quick) => {
            if (quick === '❤️') rx.toggle(rKey, '❤️');
            else rx.setPickerKey(pickerOpen ? null : rKey);
          });
          // Byline (channels only): sender name + tier chip + role chip. Coaches
          // read their OWN ladder (Certified/Pro/Elite/Master/Icon + coach colors);
          // members read the client ladder. Tier color is the social texture.
          const senderName = m.who || thread.who;
          const senderClientTier = m.tier ? m.tier : bsPostTier({ who: senderName });
          const isCoachSender = !!m.coach || bsIsCoachRole(m.role) || (threadIsCoach && senderName === thread.who);
          const senderTierLabel = isCoachSender ? bsCoachTier(senderClientTier) : senderClientTier;
          const senderTC = isCoachSender ? coachTint(senderClientTier) : bsTierColor(senderClientTier);
          const senderRole = String(m.role || (threadKind === 'NUTRI' ? 'nutritionist' : 'trainer')).toLowerCase();
          const roleC = isCoachSender ? (senderRole === 'nutritionist' ? '#a07a2e' : '#c0533b') : null;
          const roleLabel = isCoachSender ? (senderRole === 'nutritionist' ? 'Nutritionist' : 'Trainer') : null;
          const incomingBg = t.isLight ? t.PAPER2 : '#1a1713';
          return (
            <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start', alignSelf: me ? 'flex-end' : 'flex-start', maxWidth: '90%' }}>
              <div style={{ display: 'flex', flexDirection: me ? 'row-reverse' : 'row', alignItems: 'flex-start', gap: 11 }}>
                {!me ? (
                  <BSFacetAvatar size={32} c={senderTC} initial={bsInitials(senderName) || '?'} photo={(m.userId && threadAvatars[m.userId]) || (!thread.group && (thread.userId || thread.counterpartId) ? threadAvatars[thread.userId || thread.counterpartId] : undefined) || (m.photo) || (!thread.conversationId && !thread.channelId ? bsDemoFace(senderName) : undefined)} live={bsIsUserOnline(m.userId)} showRank={false} onClick={() => openP(senderName, m.userId)} />
                ) : (
                  <BSFacetAvatar size={32} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: me ? 'flex-end' : 'flex-start', minWidth: 0 }}>
              {!me && thread.group && (
                <button onClick={() => openP(senderName)} style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', marginBottom: 5 }}>
                  <span style={{ fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 13, color: t.INK, letterSpacing: '-0.01em' }}>{senderName}</span>
                  <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: senderTC, border: `1px solid ${senderTC}80`, padding: '2px 5px', borderRadius: 3, lineHeight: 1 }}>{String(senderTierLabel).toUpperCase()}</span>
                  {roleLabel && <span style={{ fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#fff', background: roleC, padding: '2px 5px', borderRadius: 3, lineHeight: 1 }}>{roleLabel}</span>}
                </button>
              )}
              <div style={{ minWidth: 0, position: 'relative' }}>
                <div {...lp} style={{
                  borderRadius: 16, [me ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 5,
                  fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.4, letterSpacing: '-0.005em',
                  color: me ? t.PAPER : t.INK,
                  background: me ? t.INK : incomingBg,
                  border: me ? 'none' : `1px solid ${t.SURFACE_BORDER}`,
                  padding: '11px 14px',
                  cursor: 'pointer', userSelect: 'none',
                }}>
                  {m.t}
                  {m.clip && (
                    <div style={{ marginTop: 9, padding: '9px 11px', background: me ? 'rgba(0,0,0,0.06)' : t.PAPER, border: `1px solid ${teal}66`, borderRadius: 9 }}>
                      <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, marginBottom: 5, fontWeight: 800 }}>Program tweak · applied</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: t.DISPLAY, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: me ? t.PAPER : t.INK }}>{m.clip.lift}</span>
                        {m.clip.was && <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, textDecoration: 'line-through' }}>{m.clip.was}</span>}
                        {m.clip.next && <span style={{ fontFamily: t.MONO, fontSize: 11, color: teal }}>→ {m.clip.next}</span>}
                      </div>
                    </div>
                  )}
                  {m.photo && (
                    <img src={m.photo} alt="Meal photo" onClick={(e) => { e.stopPropagation(); window.open(m.photo, '_blank'); }} style={{ display: 'block', width: '100%', minWidth: 180, maxHeight: 240, objectFit: 'cover', borderRadius: 10, marginTop: 8 }} />
                  )}
                  {m.audio && (
                    <audio src={m.audio} controls preload="none" onClick={(e) => e.stopPropagation()} style={{ display: 'block', width: '100%', minWidth: 180, marginTop: 8 }} />
                  )}
                </div>
                {pickerOpen && <BSReactionPicker t={t} anchorRight={me} current={myR} onPick={(em) => rx.toggle(rKey, em)} />}
                {myR && <BSReactionPill t={t} emoji={myR} anchorRight={me} onClick={() => rx.toggle(rKey, myR)} />}
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginTop: myR ? 10 : 4, textAlign: me ? 'right' : 'left' }}>{m.time}</div>
              </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Composer — pinned to the bottom of the screen, iMessage-style */}
      <BSMessageComposer value={text} onChange={setText} onSend={send} pinned />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// ME — masthead profile
// ═══════════════════════════════════════════════════════════
const SHAPE_SCORE_TIERS = [
  { name: 'Raw', range: '0+', perk: 'Starting level' },
  { name: 'Tempo', range: '750+', perk: '2x redemption value' },
  { name: 'Form', range: '2,000+', perk: 'Early access drops + streak boosts' },
  { name: 'Peak', range: '5,000+', perk: 'Priority booking + 1 free intro / mo' },
  { name: 'Legend', range: '15,000+', perk: 'Annual Shape merch + service credit' },
];
// Coaches climb the same 5 rungs under their own names (scheme J).
const SHAPE_SCORE_TIERS_COACH = [
  { name: 'Certified', range: '0+', perk: 'Starting level' },
  { name: 'Pro', range: '750+', perk: '2x redemption value' },
  { name: 'Elite', range: '2,000+', perk: 'Early access drops + streak boosts' },
  { name: 'Master', range: '5,000+', perk: 'Priority booking + 1 free intro / mo' },
  { name: 'Icon', range: '15,000+', perk: 'Annual Shape merch + service credit' },
];

// Per-tier accent colors — a cool→warm→premium progression. Used wherever a
// tier is shown (score card, etc.) so tiers are color-coordinated app-wide.
const BS_TIER_COLORS = {
  raw: '#8a93a0', base: '#8a93a0',
  tempo: '#d8a23a',
  form: '#34d6c5',
  peak: '#8a5cf6',
  legend: '#e0518a',
  // Coach tiers (scheme J) — same 5-rung ladder, renamed, with teal (the logo
  // color) crowning the top. Diverges from the client ramp at Elite (crimson)
  // and the Ice → Teal apex.
  certified: '#8a93a0',
  pro: '#d8a23a',
  elite: '#e0463c',
  master: '#8fe3e6',
  icon: '#34d6c5',
};
function bsTierColor(tier) {
  return BS_TIER_COLORS[String(tier || '').toLowerCase().trim()] || '#d8a23a';
}
// A stable tier for a feed author — uses an explicit `tier` when present, else
// derives one deterministically from the name so a person's tier color/badge is
// consistent everywhere they appear.
const _BS_FEED_TIERS = ['Tempo', 'Form', 'Peak', 'Legend', 'Base'];
function bsPostTier(p) {
  if (p && p.tier) return p.tier;
  const s = String((p && (p.who || p.id)) || '');
  let n = 0;
  for (let i = 0; i < s.length; i++) n = (n + s.charCodeAt(i) * (i + 1)) % 997;
  return _BS_FEED_TIERS[n % _BS_FEED_TIERS.length];
}
// Tier from a member's all-time Shape Score points (matches SHAPE_SCORE_TIERS).
function bsTierForPoints(pts) {
  const p = Number(pts) || 0;
  if (p >= 15000) return 'Legend';
  if (p >= 5000) return 'Peak';
  if (p >= 2000) return 'Form';
  if (p >= 750) return 'Tempo';
  return 'Base';
}
// Coaches see a separate Shape Score ladder (scheme J): Certified · Pro · Elite ·
// Master · Icon — same thresholds/rungs as clients, just renamed (teal crowns it).
// Maps a client-tier name to the coach equivalent (unknown/already-coach passes through).
const BS_COACH_TIER_NAMES = { raw: 'Certified', base: 'Certified', tempo: 'Pro', form: 'Elite', peak: 'Master', legend: 'Icon' };
function bsIsCoachRole(role) {
  const r = String(role || '').toLowerCase().trim();
  return r === 'trainer' || r === 'nutritionist' || r === 'coach';
}
function bsCoachTier(clientTier) {
  return BS_COACH_TIER_NAMES[String(clientTier || '').toLowerCase().trim()] || clientTier;
}

const SHAPE_SCORE_PROFILES = {
  client: {
    roleLabel: 'Client',
    total: 1284, goal: 5000, streak: 14, tier: 'Tempo', tierShort: 'TMP', nextTier: 'Form',
    pointsToNext: 716, available: 940, lifetime: 3420, redeemedCount: 7, week: '+36',
    weekRatio: 0.72, streakRatio: 0.64, tierRatio: 0.26, spendRatio: 0.94,
    activities: [
      { name: 'Session kept', pts: '+12-18', cap: 'Variable', note: 'With a coach' },
      { name: 'Workout logged', pts: '+6-10', cap: 'Per log', note: 'Solo or programmed' },
      { name: 'Protein target hit', pts: '+5', cap: 'Daily', note: 'Daily nutrition goal' },
      { name: 'Sleep target met', pts: '+3', cap: 'Daily', note: '7+ hours, wearable verified' },
      { name: 'Habit streak', pts: '+2-4', cap: 'Per streak', note: 'Any logged habit' },
      { name: 'Weekly review', pts: '+15', cap: 'Weekly', note: 'Submitted on time' },
      { name: 'New PR logged', pts: '+12', cap: 'Per PR', note: 'Any lift or run' },
    ],
    ledger: [
      ['APR 18', '+14', 'Session kept - Maya Okafor'],
      ['APR 18', '+3', 'Morning mobility logged'],
      ['APR 17', '+5', 'Protein target hit - 3rd day'],
      ['APR 17', '+13', 'Session kept - Rae Lindqvist'],
      ['APR 16', '+3', 'Sleep >= 7h'],
      ['APR 16', '+9', 'Upper pull logged'],
      ['APR 15', '+15', 'Weekly review submitted'],
      ['APR 15', '+2', 'Steps >= 8,000'],
    ],
  },
  trainer: {
    roleLabel: 'Trainer',
    total: 3240, goal: 5000, streak: 9, tier: 'Elite', tierShort: 'ELT', nextTier: 'Master',
    pointsToNext: 1760, available: 1280, lifetime: 6840, redeemedCount: 11, week: '+88',
    weekRatio: 0.82, streakRatio: 0.58, tierRatio: 0.54, spendRatio: 0.72,
    activities: [
      { name: 'Live session completed', pts: '+18-28', cap: 'Per booking', note: 'Client attended' },
      { name: 'Program block delivered', pts: '+24', cap: 'Per client', note: 'New or refreshed training block' },
      { name: 'Form review returned', pts: '+8-12', cap: 'Per review', note: 'Video feedback within 24h' },
      { name: 'Client check-in answered', pts: '+5', cap: 'Daily', note: 'Meaningful coaching reply' },
      { name: 'PR verified', pts: '+10', cap: 'Per PR', note: 'Client lift or performance milestone' },
      { name: 'Retention streak', pts: '+20', cap: 'Weekly', note: 'Active roster held for 7 days' },
      { name: 'New client onboarded', pts: '+40', cap: 'Per intake', note: 'Completed intake and first plan' },
    ],
    ledger: [
      ['APR 18', '+24', 'Program block delivered - Riley Kim'],
      ['APR 18', '+10', 'Form review returned - Drew Park'],
      ['APR 17', '+22', 'Live session completed - Alex Rivera'],
      ['APR 17', '+5', 'Client check-in answered - Casey Lee'],
      ['APR 16', '+40', 'New client onboarded - Morgan Liu'],
      ['APR 16', '+10', 'PR verified - Sam Patel'],
      ['APR 15', '+20', 'Retention streak held'],
      ['APR 15', '+8', 'Async review returned - Quinn Choi'],
    ],
  },
  nutritionist: {
    roleLabel: 'Nutritionist',
    total: 2140, goal: 5000, streak: 11, tier: 'Elite', tierShort: 'ELT', nextTier: 'Master',
    pointsToNext: 2860, available: 870, lifetime: 5310, redeemedCount: 8, week: '+64',
    weekRatio: 0.76, streakRatio: 0.61, tierRatio: 0.42, spendRatio: 0.68,
    activities: [
      { name: 'Consult completed', pts: '+16-24', cap: 'Per booking', note: 'Initial or follow-up consult' },
      { name: 'Meal plan delivered', pts: '+22', cap: 'Per client', note: 'New or adjusted nutrition plan' },
      { name: 'Macro review returned', pts: '+7-10', cap: 'Per review', note: 'Food log analysis within 24h' },
      { name: 'Adherence check-in', pts: '+5', cap: 'Daily', note: 'Useful client follow-up' },
      { name: 'Biomarker note logged', pts: '+12', cap: 'Per update', note: 'Labs, weight trend, or recovery signal' },
      { name: 'Plan adherence streak', pts: '+18', cap: 'Weekly', note: 'Client hit targets for the week' },
      { name: 'New nutrition client onboarded', pts: '+36', cap: 'Per intake', note: 'Completed intake and first plan' },
    ],
    ledger: [
      ['APR 18', '+22', 'Meal plan delivered - Jamie Wong'],
      ['APR 18', '+8', 'Macro review returned - Alex Rivera'],
      ['APR 17', '+18', 'Plan adherence streak - Sara Mendez'],
      ['APR 17', '+20', 'Consult completed - Riley Kim'],
      ['APR 16', '+12', 'Biomarker note logged - Pat Doan'],
      ['APR 16', '+5', 'Adherence check-in - Casey Lee'],
      ['APR 15', '+36', 'New nutrition client onboarded'],
      ['APR 15', '+7', 'Food log analysis returned'],
    ],
  },
};

// Generic edit-sheet for the Me page. Renders as a bottom sheet with a single
// labeled input (text / number / select / toggle / textarea). Save fires
// onSave(newValue) and closes; Cancel just closes.
function BSEditSheet({ field, onSave, onClose }) {
  const t = useBS();
  const [val, setVal] = React.useState(field?.value ?? '');
  React.useEffect(() => { setVal(field?.value ?? ''); }, [field]);
  if (!field) return null;
  const kind = field.type || 'text';
  return (
    <div onClick={onClose} style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 9000,
      display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
    }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        width: '100%', maxWidth: 430, background: t.PAPER, color: t.INK,
        borderTopLeftRadius: 18, borderTopRightRadius: 18,
        padding: '20px 20px calc(28px + env(safe-area-inset-bottom, 0px))',
        boxShadow: '0 -20px 60px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 18 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, letterSpacing: '-0.01em' }}>{field.label}</div>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, color: t.INK50, fontSize: 14, cursor: 'pointer' }}>Cancel</button>
        </div>
        {field.hint && (
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8 }}>{field.hint}</div>
        )}
        {kind === 'select' ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {(field.options || []).map((opt) => {
              const v = typeof opt === 'string' ? opt : opt.value;
              const l = typeof opt === 'string' ? opt : opt.label;
              const on = String(v) === String(val);
              return (
                <button key={String(v)} onClick={() => setVal(v)} style={{
                  borderRadius: 10, padding: '12px 14px', textAlign: 'left', cursor: 'pointer',
                  border: `1px solid ${on ? t.ACCENT : t.SURFACE_BORDER}`,
                  background: on ? `rgba(${t.inkRGB},0.06)` : 'transparent',
                  color: t.INK, fontFamily: t.BODY, fontSize: 14, fontWeight: on ? 700 : 500,
                }}>{l}</button>
              );
            })}
          </div>
        ) : kind === 'toggle' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[['on', field.onLabel || 'On'], ['off', field.offLabel || 'Off']].map(([v, l]) => {
              const on = String(val) === v;
              return (
                <button key={v} onClick={() => setVal(v)} style={{
                  borderRadius: 10, padding: '14px 0', cursor: 'pointer',
                  border: `1px solid ${on ? t.ACCENT : t.SURFACE_BORDER}`,
                  background: on ? `rgba(${t.inkRGB},0.06)` : 'transparent',
                  color: t.INK, fontFamily: t.BODY, fontSize: 14, fontWeight: on ? 700 : 500,
                }}>{l}</button>
              );
            })}
          </div>
        ) : kind === 'textarea' ? (
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder={field.placeholder || ''}
            rows={4}
            style={{
              width: '100%', resize: 'vertical', minHeight: 96,
              background: t.PAPER2, color: t.INK,
              border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 10,
              padding: '12px 14px', fontFamily: t.BODY, fontSize: 15, outline: 'none',
            }}
          />
        ) : (
          <input
            value={val}
            type={kind === 'number' ? 'number' : 'text'}
            inputMode={kind === 'number' ? 'decimal' : undefined}
            onChange={(e) => setVal(e.target.value)}
            placeholder={field.placeholder || ''}
            style={{
              width: '100%', height: 46, background: t.PAPER2, color: t.INK,
              border: `1px solid ${t.SURFACE_BORDER}`, borderRadius: 10,
              padding: '0 14px', fontFamily: t.BODY, fontSize: 15, outline: 'none',
            }}
          />
        )}
        <button onClick={() => onSave(val)} style={{
          marginTop: 16, width: '100%', padding: '14px 0', borderRadius: 999,
          background: t.ACCENT, color: '#031f1c', border: 0,
          fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
          cursor: 'pointer',
        }}>Save</button>
      </div>
    </div>
  );
}

// ─── NOTIFICATIONS ───────────────────────────────────────────
// In-app feed backed by /api/notifications. Tapping a notification marks it
// read and (if it carries a `route`) deep-links via onRoute.
function _bsNotifAgo(iso) {
  const d = new Date(iso).getTime();
  if (isNaN(d)) return '';
  const s = Math.max(0, Math.floor((Date.now() - d) / 1000));
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

// Icon + accent per notification type (falls back to a bell).
function _bsNotifStyle(type, t) {
  const map = {
    booking_request: ['🗓', t.AMBER], session_confirmed: ['✅', t.GREEN], session_declined: ['✕', t.RUST],
    payment: ['💸', t.GREEN], message: ['💬', t.BLUE], workout: ['🏋', t.AMBER],
    meal_plan: ['🍽', t.RUST], program: ['🗺', t.ACCENT], grocery: ['🛒', t.RUST], general: ['🔔', t.ACCENT],
  };
  return map[type] || map.general;
}

function BSNotifications({ onBack, onRoute = () => {} }) {
  const t = useBS();
  const { BSPage, BSDetailHeader } = window;
  const [items, setItems] = useStateBSC(null);

  const load = () => window.ShapeNotifications?.list?.()
    .then(d => setItems(Array.isArray(d.notifications) ? d.notifications : []))
    .catch(() => setItems([]));
  React.useEffect(() => {
    load();
    const unsub = window.ShapeNotifications?.subscribe?.(() => load()) || (() => {});
    return () => { try { unsub(); } catch (e) {} };
  }, []);

  const open = async (n) => {
    if (!n.read) {
      setItems(list => (list || []).map(x => x.id === n.id ? { ...x, read: true } : x));
      window.ShapeNotifications?.markRead?.({ id: n.id }).catch(() => {});
    }
    if (n.route) onRoute(n.route, n.data || {});
  };
  const markAll = async () => {
    setItems(list => (list || []).map(x => ({ ...x, read: true })));
    window.ShapeNotifications?.markRead?.({ all: true }).catch(() => {});
  };

  const list = items || [];
  const unread = list.filter(n => !n.read).length;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Section · Activity"
        kicker="Notifications"
        title={<>Your<br/>updates.</>}
        trailing={unread ? (
          <button onClick={markAll} style={{ padding: '8px 12px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Mark all read</button>
        ) : null}
      />
      {items === null && (
        <div style={{ padding: `20px ${t.padX}px`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>Loading…</div>
      )}
      {items !== null && list.length === 0 && (
        <div style={{ padding: `0 ${t.padX}px 18px` }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 8 }}>You’re all caught up.</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>Booking requests, confirmations and other updates will show up here.</div>
          </div>
        </div>
      )}
      {list.length > 0 && (
        <div style={{ padding: `12px ${t.padX}px 4px` }}>
          {list.map((n) => {
            const [icon, accent] = _bsNotifStyle(n.type, t);
            return (
              <button key={n.id} onClick={() => open(n)} style={{
                width: '100%', textAlign: 'left', display: 'grid', gridTemplateColumns: '40px 1fr auto', alignItems: 'start', gap: 11,
                padding: '12px 13px', marginBottom: 9, borderRadius: 13, cursor: n.route ? 'pointer' : 'default',
                border: `1px solid ${n.read ? t.RULE : accent}`,
                background: n.read ? 'transparent' : `${accent}14`,
              }}>
                <span style={{ width: 36, height: 36, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 17, background: `${accent}22`, border: `1px solid ${accent}55` }}>{icon}</span>
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    {!n.read && <span style={{ width: 6, height: 6, borderRadius: 99, background: accent, flexShrink: 0 }} />}
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: n.read ? 600 : 700, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.title}</span>
                  </span>
                  {n.body ? <span style={{ display: 'block', marginTop: 3, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, fontWeight: 500, lineHeight: 1.35 }}>{n.body}</span> : null}
                  {n.route ? <span style={{ display: 'block', marginTop: 5, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: accent, fontWeight: 700 }}>Open →</span> : null}
                </span>
                <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', marginTop: 2 }}>{_bsNotifAgo(n.createdAt)}</span>
              </button>
            );
          })}
        </div>
      )}
      <BSFooter right="Activity" />
    </BSPage>
  );
}

// ─── SESSIONS & IN-APP VIDEO CALLS ───────────────────────────
// Live coach↔client bookings from /api/sessions/manage. Coaches confirm /
// decline requests; confirming a video session mints a Jitsi room into
// meeting_url. Either party joins the call inside Shape via BSVideoCall.
function _bsFormatSessionWhen(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  return `${MON[d.getMonth()]} ${d.getDate()} · ${h}:${m} ${ap}`;
}

// Full-screen embedded call. The Jitsi room loads in an iframe with camera /
// mic permissions, so the call happens inside Shape.
function BSVideoCall({ url, onClose, title = 'Live call' }) {
  const t = useBS();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#000', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 'calc(env(safe-area-inset-top, 0px) + 10px) 14px 10px', background: '#000', borderBottom: '1px solid rgba(255,255,255,0.12)' }}>
        <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.2em', textTransform: 'uppercase', color: '#fff', fontWeight: 700 }}>Shape · {title}</span>
        <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 999, border: 0, background: t.RUST, color: '#fff', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Leave</button>
      </div>
      <iframe
        src={url}
        allow="camera; microphone; fullscreen; display-capture; autoplay; speaker; clipboard-write"
        title="Shape video call"
        style={{ flex: 1, width: '100%', border: 0, background: '#000' }}
      />
    </div>
  );
}

function BSSessionsScreen({ onBack }) {
  const t = useBS();
  const { BSPage, BSDetailHeader } = window;
  const [sessions, setSessions] = useStateBSC(null);
  const [busyId, setBusyId] = useStateBSC(null);
  const [call, setCall] = useStateBSC(null); // { url, title } when in a call

  const load = () => window.ShapeSessions?.getSessions?.()
    .then(list => setSessions(Array.isArray(list) ? list : []))
    .catch(() => setSessions([]));
  React.useEffect(() => { load(); }, []);

  const act = async (id, action) => {
    setBusyId(id);
    try {
      await window.ShapeSessions.manageSession({ sessionId: id, action });
      await load();
      window.__bsToast?.(
        action === 'confirm' ? 'Confirmed' : action === 'decline' ? 'Declined' : action === 'cancel' ? 'Cancelled' : 'Updated',
        'ok',
      );
    } catch (e) {
      window.__bsToast?.(e?.message || 'Could not update', 'err');
    } finally {
      setBusyId(null);
    }
  };

  if (call) return <BSVideoCall url={call.url} title={call.title} onClose={() => setCall(null)} />;

  const all = sessions || [];
  const now = Date.now();
  const requests = all.filter(s => s.status === 'requested');
  const upcoming = all.filter(s => s.status === 'confirmed' && new Date(s.scheduledAt).getTime() > now - 60 * 60 * 1000);
  const other = all.filter(s => !requests.includes(s) && !upcoming.includes(s));

  const SESSION_ICON = { video: '🎥', phone: '📞', inperson: '📍', message: '💬' };
  const statusColor = (st) => st === 'confirmed' ? t.GREEN : st === 'requested' ? t.AMBER : st === 'completed' ? t.BLUE : t.INK50;

  const Btn = ({ onClick, label, kind = 'ghost', disabled }) => (
    <button onClick={onClick} disabled={disabled} style={{
      flex: kind === 'solid' ? 1 : 'none', padding: '11px 16px', borderRadius: 999, cursor: disabled ? 'wait' : 'pointer',
      border: kind === 'solid' ? 0 : `1px solid ${kind === 'danger' ? t.RUST : t.RULE}`,
      background: kind === 'solid' ? t.GREEN : 'transparent',
      color: kind === 'solid' ? '#031f1c' : kind === 'danger' ? t.RUST : t.INK70,
      fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
      opacity: disabled ? 0.55 : 1,
    }}>{label}</button>
  );

  const Card = ({ s }) => {
    const isCoach = s.role === 'coach';
    const who = isCoach ? s.clientName : s.providerName;
    const joinable = s.type === 'video' && s.meetingUrl && (s.status === 'confirmed');
    const sc = statusColor(s.status);
    return (
      <div style={{ marginBottom: 10, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, overflow: 'hidden' }}>
        {/* status accent strip */}
        <div style={{ height: 3, background: sc }} />
        <div style={{ padding: '13px 15px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={{ display: 'flex', gap: 11, minWidth: 0 }}>
              <span style={{ fontSize: 22, lineHeight: 1.1, flexShrink: 0 }}>{SESSION_ICON[s.type] || '🗓'}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{who}</div>
                <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>
                  {_bsFormatSessionWhen(s.scheduledAt)} · {s.durationMin}m
                </div>
                {s.topic ? <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, fontWeight: 500, lineHeight: 1.3 }}>{s.topic}</div> : null}
              </div>
            </div>
            <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: sc, border: `1px solid ${sc}`, borderRadius: 999, padding: '3px 8px', whiteSpace: 'nowrap' }}>{s.status}</span>
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {joinable && <Btn kind="solid" label="Join video call →" onClick={() => setCall({ url: s.meetingUrl, title: who })} />}
            {isCoach && s.status === 'requested' && <Btn kind="solid" label="Confirm" disabled={busyId === s.id} onClick={() => act(s.id, 'confirm')} />}
            {isCoach && s.status === 'requested' && <Btn kind="danger" label="Decline" disabled={busyId === s.id} onClick={() => act(s.id, 'decline')} />}
            {isCoach && s.status === 'confirmed' && <Btn label="Mark done" disabled={busyId === s.id} onClick={() => act(s.id, 'complete')} />}
            {(s.status === 'requested' || s.status === 'confirmed') && <Btn kind="danger" label="Cancel" disabled={busyId === s.id} onClick={() => act(s.id, 'cancel')} />}
          </div>
        </div>
      </div>
    );
  };

  const Group = ({ title, kicker, items }) => items.length ? (
    <>
      <BSSection title={title} kicker={kicker} meta={`${items.length}`} />
      <div style={{ padding: `12px ${t.padX}px 4px` }}>
        {items.map(s => <Card key={s.id} s={s} />)}
      </div>
    </>
  ) : null;

  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow="Section · Bookings" kicker="Coaching" title={<>Your<br/>sessions.</>} />
      {sessions === null && (
        <div style={{ padding: `20px ${t.padX}px`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>Loading…</div>
      )}
      {sessions !== null && all.length === 0 && (
        <div style={{ padding: `0 ${t.padX}px 18px` }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 8 }}>No sessions yet.</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>When a client books a consultation or session, it shows up here to confirm — and video calls happen right inside Shape.</div>
          </div>
        </div>
      )}
      <Group title="Requests" kicker="Awaiting your confirm" items={requests} />
      <Group title="Upcoming" kicker="Confirmed" items={upcoming} />
      <Group title="History" kicker="Past & cancelled" items={other} />
      <BSFooter right="Bookings" />
    </BSPage>
  );
}

// ─── PROGRESS ────────────────────────────────────────────────
// Live body + strength progress for the signed-in member, read from
// /api/client/progress (daily_health_snapshot + workout_set_logs, RLS-scoped).
// 100% real data — a brand-new account renders the empty state, which is the
// correct "real" picture, not demo numbers.
function _bsSignedNum(n, digits = 1, unit = '') {
  if (n == null || !Number.isFinite(Number(n))) return '—';
  const v = Number(n);
  const s = v > 0 ? '+' : v < 0 ? '−' : '';
  return `${s}${Math.abs(v).toFixed(digits)}${unit}`;
}

function BSProgressSpark({ values, color, h = 40 }) {
  const t = useBS();
  if (!values || values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  const W = 100;
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * W;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return [Number(x.toFixed(2)), Number(y.toFixed(2))];
  });
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `M 0,${h} L ${pts.map(([x, y]) => `${x},${y}`).join(' L ')} L ${W},${h} Z`;
  const last = pts[pts.length - 1];
  return (
    <svg width="100%" height={h} viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" style={{ display: 'block' }}>
      <path d={area} fill={color} opacity="0.14" />
      <polyline points={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={last[0]} cy={last[1]} r="1.6" fill={t.PAPER} stroke={color} strokeWidth="0.9" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const _BS_ACTIVITY_TYPES = ['Run', 'Ride', 'Swim', 'Walk', 'Hike', 'Tennis', 'Pilates', 'Rowing', 'Golf', 'Stairmaster', 'Elliptical', 'Yoga', 'HIIT', 'Strength', 'Other'];
// Activities that care about distance (km) — others hide that field.
const _BS_ACTIVITY_DISTANCE = new Set(['Run', 'Ride', 'Swim', 'Walk', 'Hike', 'Rowing']);

// Mood check-in sheet — writes today's mood (1–10) via /api/client/checkin.
const _BS_MOOD_FACE = (m) => m >= 9 ? '😄' : m >= 7 ? '🙂' : m >= 5 ? '😐' : m >= 3 ? '😕' : '😞';
const _BS_MOOD_WORD = (m) => m >= 8 ? 'Great' : m >= 6 ? 'Good' : m >= 4 ? 'Okay' : 'Low';
// Quick-pick presets across the range.
const _BS_MOOD_QUICK = [[2, '😞', 'Low'], [4, '😕', 'Meh'], [6, '😐', 'Okay'], [8, '🙂', 'Good'], [10, '😄', 'Great']];
function BSMoodSheet({ onClose, onSaved }) {
  const t = useBS();
  const [val, setVal] = useStateBSC(7);
  const [busy, setBusy] = useStateBSC(false);
  const save = async () => {
    setBusy(true);
    try {
      await window.ShapeCheckin.log({ mood: val });
      window.__bsToast?.(`Logged · ${_BS_MOOD_WORD(val)}`, 'ok');
      onSaved?.();
      onClose?.();
    } catch (e) {
      window.__bsToast?.(e?.message || 'Could not save', 'err');
    } finally {
      setBusy(false);
    }
  };
  return createPortal((
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, maxHeight: '92vh', overflowY: 'auto', background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '10px 18px calc(20px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -24px 70px rgba(0,0,0,0.55)' }}>
        {/* Grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 99, background: t.RULE }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: t.W.display, letterSpacing: '-0.025em' }}>How are you feeling?</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>Today's check-in · shared with your coach</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK50, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Big face + label */}
        <div style={{ textAlign: 'center', padding: '6px 0 16px' }}>
          <div style={{ fontSize: 64, lineHeight: 1 }}>{_BS_MOOD_FACE(val)}</div>
          <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 26, letterSpacing: '-0.03em', color: t.INK }}>{_BS_MOOD_WORD(val)}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.14em', color: t.INK50, fontWeight: 700, marginTop: 2 }}>{val}/10</div>
        </div>

        {/* Quick emoji picks */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 8, marginBottom: 16 }}>
          {_BS_MOOD_QUICK.map(([n, face, word]) => {
            const on = val === n;
            return (
              <button key={n} onClick={() => setVal(n)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, padding: '10px 2px 7px',
                borderRadius: 12, cursor: 'pointer', border: `1px solid ${on ? t.ACCENT : t.RULE}`, background: on ? `${t.ACCENT}22` : 'transparent',
              }}>
                <span style={{ fontSize: 22, lineHeight: 1, filter: on ? 'none' : 'grayscale(0.5)' }}>{face}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: on ? t.INK : t.INK50 }}>{word}</span>
              </button>
            );
          })}
        </div>

        {/* Fine 1–10 scale */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 18 }}>
          {[1,2,3,4,5,6,7,8,9,10].map((n) => (
            <button key={n} onClick={() => setVal(n)} aria-label={`${n} of 10`} style={{
              flex: 1, height: 34, borderRadius: 8, cursor: 'pointer',
              border: `1px solid ${n === val ? t.ACCENT : t.RULE}`,
              background: n <= val ? t.ACCENT : 'transparent',
              color: n === val ? '#031f1c' : (n <= val ? '#031f1c' : t.INK50), fontFamily: t.MONO, fontSize: 10, fontWeight: 800,
            }}>{n}</button>
          ))}
        </div>

        <button onClick={save} disabled={busy} style={{ width: '100%', padding: '16px 0', borderRadius: 999, background: t.ACCENT, color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.65 : 1 }}>{busy ? 'Saving…' : 'Log check-in →'}</button>
      </div>
    </div>
  ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body);
}

function BSLogActivity({ onClose, onSaved }) {
  const t = useBS();
  const [type, setType] = useStateBSC('Run');
  const [duration, setDuration] = useStateBSC(45);
  const [distance, setDistance] = useStateBSC('');
  const [calories, setCalories] = useStateBSC('');
  const [busy, setBusy] = useStateBSC(false);

  const mins = Math.max(0, Math.round(Number(duration) || 0));
  const showDistance = _BS_ACTIVITY_DISTANCE.has(type);
  // Live Shape Score preview — mirrors the server formula (1pt/5min, 2–20).
  const ptsPreview = mins ? Math.max(2, Math.min(20, Math.round(mins / 5))) : 0;

  const save = async () => {
    if (window.bsRequireAccount && !window.bsRequireAccount('log activity')) return;
    if (!mins) { window.__bsToast?.('Set a duration', 'err'); return; }
    setBusy(true);
    try {
      const res = await window.ShapeActivities.log({
        activityType: type.toLowerCase(), durationMin: mins,
        distanceKm: showDistance && distance ? Number(distance) : undefined,
        calories: calories ? Number(calories) : undefined,
      });
      window.__bsToast?.(`Logged ${type}${res?.pointsAwarded ? ` · +${res.pointsAwarded} pts` : ''}`, 'ok');
      onSaved?.();
      onClose?.();
    } catch (e) {
      window.__bsToast?.(e?.message || 'Could not log activity', 'err');
    } finally {
      setBusy(false);
    }
  };

  // Big stepper input: − [value unit] + with quick chips.
  const stepper = (val, setVal, step, unit, chips) => {
    const n = Number(val) || 0;
    const setN = (x) => setVal(String(Math.max(0, Math.round(x))));
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button onClick={() => setN(n - step)} style={_bsStepBtn(t)}>−</button>
          <div style={{ flex: 1, textAlign: 'center', background: t.PAPER2, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: '12px 0' }}>
            <span style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 30, letterSpacing: '-0.03em', color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{n || '—'}</span>
            <span style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, marginLeft: 6 }}>{unit}</span>
          </div>
          <button onClick={() => setN(n + step)} style={_bsStepBtn(t)}>+</button>
        </div>
        {chips && (
          <div style={{ display: 'flex', gap: 6, marginTop: 8, justifyContent: 'center' }}>
            {chips.map(c => (
              <button key={c} onClick={() => setVal(String(c))} style={{ padding: '5px 11px', borderRadius: 999, border: `1px solid ${n === c ? t.ACCENT : t.RULE}`, background: n === c ? t.ACCENT : 'transparent', color: n === c ? '#031f1c' : t.INK70, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', cursor: 'pointer' }}>{c}m</button>
            ))}
          </div>
        )}
      </div>
    );
  };

  const sectionLabel = (s) => <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 9 }}>{s}</div>;

  return createPortal((
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(3px)', WebkitBackdropFilter: 'blur(3px)', zIndex: 100000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 430, maxHeight: '92vh', overflowY: 'auto', background: t.PAPER, color: t.INK, borderTopLeftRadius: 22, borderTopRightRadius: 22, padding: '10px 18px calc(20px + env(safe-area-inset-bottom, 0px))', boxShadow: '0 -24px 70px rgba(0,0,0,0.55)' }}>
        {/* Grab handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '4px 0 12px' }}>
          <div style={{ width: 38, height: 4, borderRadius: 99, background: t.RULE }} />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: t.W.display, letterSpacing: '-0.025em' }}>Log activity</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>Counts toward your Shape Score</div>
          </div>
          <button onClick={onClose} aria-label="Close" style={{ width: 32, height: 32, borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK50, fontSize: 16, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        {/* Activity type — icon grid */}
        {sectionLabel('Activity')}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 7, marginBottom: 20 }}>
          {_BS_ACTIVITY_TYPES.map(a => {
            const on = a === type;
            return (
              <button key={a} onClick={() => setType(a)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 3,
                minHeight: 46, padding: '9px 2px 7px', borderRadius: 12, cursor: 'pointer',
                border: `1px solid ${on ? t.ACCENT : t.RULE}`,
                background: on ? `${t.ACCENT}22` : 'transparent',
              }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: on ? t.INK : t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%' }}>{a}</span>
              </button>
            );
          })}
        </div>

        {/* Duration stepper */}
        {sectionLabel('Duration')}
        <div style={{ marginBottom: 18 }}>{stepper(duration, setDuration, 5, 'min', [15, 30, 45, 60])}</div>

        {/* Optional: distance (only for distance sports) + calories */}
        <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
          {showDistance && (
            <div style={{ flex: 1 }}>
              {sectionLabel('Distance · km')}
              <input value={distance} onChange={(e) => setDistance(e.target.value)} placeholder="—" type="number" inputMode="decimal"
                style={{ width: '100%', height: 48, background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: '0 14px', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }} />
            </div>
          )}
          <div style={{ flex: 1 }}>
            {sectionLabel('Calories')}
            <input value={calories} onChange={(e) => setCalories(e.target.value)} placeholder="optional" type="number" inputMode="decimal"
              style={{ width: '100%', height: 48, background: t.PAPER2, color: t.INK, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: '0 14px', fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 600, outline: 'none', boxSizing: 'border-box' }} />
          </div>
        </div>

        {/* Points preview + CTA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flexShrink: 0, textAlign: 'center', padding: '8px 14px', borderRadius: 12, border: `1px solid ${t.GREEN}`, background: `${t.GREEN}18` }}>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 20, color: t.GREEN, lineHeight: 1 }}>+{ptsPreview}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>pts</div>
          </div>
          <button onClick={save} disabled={busy || !mins} style={{ flex: 1, padding: '16px 0', borderRadius: 999, background: t.ACCENT, color: '#031f1c', border: 0, fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: (busy || !mins) ? 'default' : 'pointer', opacity: (busy || !mins) ? 0.5 : 1 }}>{busy ? 'Saving…' : `Log ${type} →`}</button>
        </div>
      </div>
    </div>
  ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body);
}
function _bsStepBtn(t) {
  return { width: 46, height: 46, borderRadius: 12, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, fontFamily: t.DISPLAY, fontSize: 24, fontWeight: 700, lineHeight: 1, cursor: 'pointer', flexShrink: 0 };
}

function BSClientProgress({ onBack }) {
  const t = useBS();
  const { BSPage, BSDetailHeader } = window;
  const [data, setData] = useStateBSC(null);
  const [loading, setLoading] = useStateBSC(true);

  const [acts, setActs] = useStateBSC(null); // { activities, breakdown, totalMinutes }
  const [showLog, setShowLog] = useStateBSC(false);

  React.useEffect(() => {
    let cancelled = false;
    const viaHelper = window.ShapeAnalytics?.getProgress ? window.ShapeAnalytics.getProgress() : Promise.resolve(null);
    Promise.resolve(viaHelper)
      .then(d => d || fetch('/api/client/progress', { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : null)))
      .then(d => { if (!cancelled) { setData(d && d.ok ? d : null); setLoading(false); } })
      .catch(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const loadActivities = () => {
    const viaHelper = window.ShapeActivities?.list ? window.ShapeActivities.list() : Promise.resolve(null);
    Promise.resolve(viaHelper)
      .then(d => (d && d.activities) ? d : fetch('/api/client/activities', { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : { activities: [], breakdown: [], totalMinutes: 0 })))
      .then(d => setActs(d)).catch(() => {});
  };
  React.useEffect(() => { loadActivities(); }, []);

  const kpis = (data && data.kpis) || {};
  const series = (data && data.series) || {};
  const prs = (data && data.prs) || [];
  const valuesOf = (key) => ((series[key] || []).map(p => Number(p.value)).filter(Number.isFinite));

  const cards = [
    kpis.weightLatest != null && { label: 'Weight', value: `${Math.round(t.convWeight(kpis.weightLatest))}`, unit: t.weightUnit, sub: kpis.weightChange != null ? `${_bsSignedNum(t.convWeight(kpis.weightChange), 1, ` ${t.weightUnit}`)} since start` : 'Latest', c: t.AMBER },
    kpis.bodyFatLatest != null && { label: 'Body fat', value: `${kpis.bodyFatLatest.toFixed(1)}`, unit: '%', sub: (kpis.bodyFatFirst != null) ? `${_bsSignedNum(kpis.bodyFatLatest - kpis.bodyFatFirst, 1, '%')} since start` : 'Latest', c: t.RUST },
    kpis.restingHr != null && { label: 'Resting HR', value: `${kpis.restingHr}`, unit: 'bpm', sub: kpis.restingHrDelta != null ? `${_bsSignedNum(kpis.restingHrDelta, 0, '')} vs prior wk` : '7-day avg', c: t.GREEN },
    kpis.sleepAvg != null && { label: 'Sleep', value: `${kpis.sleepAvg}`, unit: 'h', sub: '30-day avg', c: t.BLUE },
  ].filter(Boolean);

  const trendRows = [
    { key: 'weight', label: 'Weight', c: t.AMBER },
    { key: 'strength', label: 'Top set', c: t.ACCENT },
    { key: 'restingHr', label: 'Resting HR', c: t.GREEN },
    { key: 'sleep', label: 'Sleep', c: t.BLUE },
  ].map(r => ({ ...r, values: valuesOf(r.key) })).filter(r => r.values.length >= 2);

  const isEmpty = !loading && cards.length === 0 && prs.length === 0 && trendRows.length === 0;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Section · Progress"
        kicker="Body & strength"
        title={<>Your<br/>progress.</>}
      />

      {loading && (
        <div style={{ padding: `20px ${t.padX}px`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>Loading…</div>
      )}

      {isEmpty && (
        <div style={{ padding: `0 ${t.padX}px 18px` }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 8 }}>
              No progress data yet.
            </div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>
              Connect a health source (Apple Health, WHOOP) or log workouts and check-ins. Your weight, recovery, sleep and strength PRs will trend here automatically.
            </div>
          </div>
        </div>
      )}

      {!loading && cards.length > 0 && (
        <>
          <BSSection title="Key metrics" kicker="Latest" meta={`${cards.length} tracked`} />
          <div style={{ padding: `12px ${t.padX}px 4px` }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {cards.map((card) => (
                <div key={card.label} style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, overflow: 'hidden' }}>
                  <div style={{ height: 3, background: card.c }} />
                  <div style={{ padding: '13px 14px 12px' }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: card.c }}>{card.label}</div>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 4, marginTop: 7 }}>
                      <span style={{ fontFamily: t.DISPLAY, fontSize: 34, fontWeight: t.W.display, color: t.INK, letterSpacing: '-0.04em', lineHeight: 0.95, fontVariantNumeric: 'tabular-nums' }}>{card.value}</span>
                      <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50, letterSpacing: '0.08em' }}>{card.unit}</span>
                    </div>
                    <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{card.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {!loading && trendRows.length > 0 && (
        <>
          <BSSection title="Trends" kicker="Recent history" />
          <div style={{ padding: `0 ${t.padX}px` }}>
            {trendRows.map((r, i) => (
              <div key={r.key} style={{ display: 'grid', gridTemplateColumns: '78px 1fr 44px', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i === trendRows.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70, fontWeight: 700 }}>{r.label}</div>
                <BSProgressSpark values={r.values} color={r.c} />
                <div style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 12, fontWeight: 800, color: t.INK, fontVariantNumeric: 'tabular-nums' }}>{Math.round((r.key === 'weight' || r.key === 'strength') ? t.convWeight(r.values[r.values.length - 1]) : r.values[r.values.length - 1])}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {!loading && prs.length > 0 && (
        <>
          <BSSection title="Strength PRs" kicker="Best logged set" meta={`${prs.length}`} />
          <div style={{ padding: `0 ${t.padX}px` }}>
            {prs.map((pr, i) => (
              <div key={`${pr.move}-${i}`} style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', gap: 12, padding: '12px 0', borderBottom: i === prs.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                <div>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{pr.move}</div>
                  <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>
                    {pr.bestReps != null ? `${pr.bestReps} reps · ` : ''}{_bsFormatScoreDate(pr.bestAt)}
                  </div>
                </div>
                {(() => {
                  const lbUnit = !pr.unit || /^lbs?$/i.test(pr.unit); // convert only pound PRs
                  return (
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 3 }}>
                      <span style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', fontVariantNumeric: 'tabular-nums' }}>{Math.round(lbUnit ? t.convWeight(pr.best) : pr.best)}</span>
                      <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, color: t.INK50, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{lbUnit ? t.weightUnit : pr.unit}</span>
                    </div>
                  );
                })()}
              </div>
            ))}
          </div>
        </>
      )}

      <BSFooter right="Progress" />
      {showLog && <BSLogActivity onClose={() => setShowLog(false)} onSaved={loadActivities} />}
    </BSPage>
  );
}

// ─── LEADERBOARD ─────────────────────────────────────────────
// Shape Score ranking via /api/leaderboard (SECURITY DEFINER RPC, opt-out
// aware). Week / Month / All-time toggle; the caller's own rank is pinned even
// when outside the visible top.
function BSLeaderboard({ onBack }) {
  const t = useBS();
  const { BSPage, BSDetailHeader } = window;
  const [period, setPeriod] = useStateBSC('month');
  const [data, setData] = useStateBSC(null);
  const [loading, setLoading] = useStateBSC(true);

  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const p = window.ShapeLeaderboard?.get ? window.ShapeLeaderboard.get(period)
      : fetch(`/api/leaderboard?period=${period}`, { credentials: 'same-origin', cache: 'no-store' }).then(r => (r.ok ? r.json() : null));
    Promise.resolve(p)
      .then(d => { if (!cancelled) { setData(d || { entries: [], me: null }); setLoading(false); } })
      .catch(() => { if (!cancelled) { setData({ entries: [], me: null }); setLoading(false); } });
    return () => { cancelled = true; };
  }, [period]);

  const entries = (data && data.entries) || [];
  const me = data && data.me;
  const medal = (rank) => rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : null;

  const initials = (name) => (name || '?').split(' ').map(s => s[0]).slice(0, 2).join('').toUpperCase();

  return (
    <BSPage>
      <BSDetailHeader onBack={onBack} eyebrow="Section · Community" kicker="Shape Score" title={<>Leader<br/>board.</>} />

      {/* Period toggle */}
      <div style={{ padding: `4px ${t.padX}px 14px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, border: `1px solid ${t.RULE}`, borderRadius: 999, padding: 4 }}>
          {[['week', 'This week'], ['month', 'This month'], ['all', 'All time']].map(([k, l]) => {
            const on = period === k;
            return <button key={k} onClick={() => setPeriod(k)} style={{ padding: '9px 4px', borderRadius: 999, border: 0, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>{l}</button>;
          })}
        </div>
      </div>

      {loading && <div style={{ padding: `20px ${t.padX}px`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>Loading…</div>}

      {!loading && entries.length === 0 && (
        <div style={{ padding: `0 ${t.padX}px 18px` }}>
          <div style={{ borderTop: `2px solid ${t.INK}`, paddingTop: 14 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, lineHeight: 1.15, letterSpacing: '-0.02em', marginBottom: 8 }}>No rankings yet.</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>Earn Shape Score — log workouts, hit habits, keep streaks — and you'll show up here.</div>
          </div>
        </div>
      )}

      {!loading && entries.length > 0 && (
        <div style={{ padding: `0 ${t.padX}px 4px` }}>
          {entries.map((e) => {
            const top3 = e.rank <= 3;
            return (
              <div key={e.userId} style={{
                display: 'grid', gridTemplateColumns: '34px 38px 1fr auto', alignItems: 'center', gap: 11,
                padding: '11px 13px', marginBottom: 8, borderRadius: 13,
                border: `1px solid ${e.isMe ? t.ACCENT : t.RULE}`,
                background: e.isMe ? `${t.ACCENT}16` : (top3 ? t.PAPER2 : 'transparent'),
              }}>
                <span style={{ textAlign: 'center', fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: top3 ? 20 : 16, color: top3 ? t.INK : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{medal(e.rank) || e.rank}</span>
                <span style={{ width: 38, height: 38, borderRadius: 999, overflow: 'hidden', background: t.INK, color: t.PAPER, display: 'grid', placeItems: 'center', fontFamily: t.MONO, fontSize: 12, fontWeight: 800 }}>
                  {e.avatarUrl ? <img src={e.avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initials(e.name)}
                </span>
                <span style={{ minWidth: 0, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: e.isMe ? 800 : 600, color: t.INK, letterSpacing: '-0.015em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.isMe ? 'You' : e.name}</span>
                <span style={{ fontFamily: t.MONO, fontSize: 13, fontWeight: 800, color: t.GREEN, fontVariantNumeric: 'tabular-nums' }}>{e.points.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Your rank pinned (when outside the visible top) */}
      {!loading && me && !entries.some(e => e.isMe) && (
        <div style={{ padding: `8px ${t.padX}px 0` }}>
          <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr auto', alignItems: 'center', gap: 11, padding: '12px 13px', borderRadius: 13, border: `1px solid ${t.ACCENT}`, background: `${t.ACCENT}16` }}>
            <span style={{ textAlign: 'center', fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 16, color: t.INK }}>{me.rank}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 800, color: t.INK }}>You · top {Math.round((me.rank / Math.max(1, me.total)) * 100)}%</span>
            <span style={{ fontFamily: t.MONO, fontSize: 13, fontWeight: 800, color: t.GREEN }}>{me.points.toLocaleString()}</span>
          </div>
        </div>
      )}

      <BSFooter right="Community" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// CLIENT GOALS — Training / Nutrition tabs + coach-visibility toggle.
// Mirrors the website goal page (public/newdesign/ClientGoal.html): goal cards
// (progress + target date) and a categorized template picker on add. Persisted
// to user_goals('client_goals') as { share, training:[], nutrition:[] }.
// ═══════════════════════════════════════════════════════════
const BS_GOAL_CATS = [
  { id: 'cardio',      label: 'Endurance',  group: 'training' },
  { id: 'strength',    label: 'Strength',   group: 'training' },
  { id: 'habits',      label: 'Habits',     group: 'training' },
  { id: 'wellbeing',   label: 'Wellbeing',  group: 'training' },
  { id: 'composition', label: 'Body comp',  group: 'nutrition' },
  { id: 'nutrition',   label: 'Nutrition',  group: 'nutrition' },
];
const BS_GOAL_TEMPLATES = [
  { cat: 'cardio', t: 'Run a marathon',          cur: 0,   tgt: 26.2, sub: 'miles · 26.2',                 pct: false, weeksOut: 26 },
  { cat: 'cardio', t: 'Complete a triathlon',    cur: 0,   tgt: 100,  sub: 'Olympic distance · swim/bike/run', pct: true,  weeksOut: 24 },
  { cat: 'cardio', t: 'Sub-25:00 5K',            cur: 0,   tgt: 25,   sub: 'minutes · 3.1 miles',          pct: false, weeksOut: 12 },
  { cat: 'cardio', t: 'Half marathon under 1:45', cur: 0,  tgt: 105,  sub: 'minutes · 13.1 miles',         pct: false, weeksOut: 16 },
  { cat: 'cardio', t: 'Bike 100 miles',          cur: 0,   tgt: 100,  sub: 'miles · century ride',         pct: false, weeksOut: 20 },
  { cat: 'strength', t: 'Bench press 225 lbs',   cur: 135, tgt: 225,  sub: 'lbs · one rep max',            pct: false, weeksOut: 16 },
  { cat: 'strength', t: 'Squat 2× bodyweight',   cur: 0,   tgt: 100,  sub: '% of bodyweight',              pct: true,  weeksOut: 20 },
  { cat: 'strength', t: 'Deadlift 405 lbs',      cur: 0,   tgt: 405,  sub: 'lbs · one rep max',            pct: false, weeksOut: 24 },
  { cat: 'strength', t: '10 strict pull-ups',    cur: 0,   tgt: 10,   sub: 'consecutive · dead-hang',      pct: false, weeksOut: 12 },
  { cat: 'habits', t: 'Sleep 8 hours nightly',   cur: 0,   tgt: 7,    sub: 'nights · per week',            pct: false, weeksOut: 8 },
  { cat: 'habits', t: 'Train 4× per week',       cur: 0,   tgt: 4,    sub: 'sessions · per week',          pct: false, weeksOut: 12 },
  { cat: 'habits', t: '30-day streak',           cur: 0,   tgt: 30,   sub: 'consecutive days',             pct: false, weeksOut: 5 },
  { cat: 'habits', t: 'Drink 1 gallon water daily', cur: 0, tgt: 7,   sub: 'days hit · per week',          pct: false, weeksOut: 6 },
  { cat: 'wellbeing', t: 'Feel like myself again', cur: 0, tgt: 100,  sub: '% · weekly self-check-in',     pct: true,  weeksOut: 12 },
  { cat: 'wellbeing', t: 'More calm, less stress', cur: 0, tgt: 100,  sub: '% · stress-down weeks',        pct: true,  weeksOut: 10 },
  { cat: 'wellbeing', t: 'Build confidence',     cur: 0,   tgt: 100,  sub: '% · confidence score',         pct: true,  weeksOut: 12 },
  { cat: 'wellbeing', t: 'Better sleep quality', cur: 0,   tgt: 8,    sub: 'avg hours · 7-day avg',        pct: false, weeksOut: 8 },
  { cat: 'wellbeing', t: 'Mood-up days',         cur: 0,   tgt: 5,    sub: 'good days · per week',         pct: false, weeksOut: 8 },
  { cat: 'wellbeing', t: 'Daily meditation',     cur: 0,   tgt: 10,   sub: 'minutes · per day',            pct: false, weeksOut: 8 },
  { cat: 'wellbeing', t: 'Time outside daily',   cur: 0,   tgt: 30,   sub: 'minutes · per day',            pct: false, weeksOut: 6 },
  { cat: 'wellbeing', t: 'Cut back on alcohol',  cur: 0,   tgt: 100,  sub: '% · reduction from baseline',  pct: true,  weeksOut: 12 },
  { cat: 'wellbeing', t: 'Practice gratitude',   cur: 0,   tgt: 7,    sub: 'entries · per week',           pct: false, weeksOut: 4 },
  { cat: 'composition', t: 'Lose 10 lbs',        cur: 0,   tgt: 10,   sub: 'lbs · sustainably',            pct: false, weeksOut: 12 },
  { cat: 'composition', t: 'Body fat under 15%', cur: 20,  tgt: 15,   sub: '%',                            pct: true,  weeksOut: 20 },
  { cat: 'composition', t: 'Gain 5 lbs muscle',  cur: 0,   tgt: 5,    sub: 'lbs · lean mass',              pct: false, weeksOut: 16 },
  { cat: 'nutrition', t: 'Hit 150g protein daily', cur: 0, tgt: 150,  sub: 'g protein · per day',          pct: false, weeksOut: 8 },
  { cat: 'nutrition', t: 'Cook at home 5×/week', cur: 0,   tgt: 5,    sub: 'meals · per week',             pct: false, weeksOut: 8 },
  { cat: 'nutrition', t: 'Cut added sugar',      cur: 0,   tgt: 100,  sub: '% reduction from baseline',    pct: true,  weeksOut: 8 },
  { cat: 'nutrition', t: '85% protein adherence', cur: 0,  tgt: 85,   sub: '% · days on target',           pct: true,  weeksOut: 8 },
];
const BS_GOALS_DEFAULT = {
  share: true,
  primaryGoal: 'Lose fat', // synced with the edit-profile "Primary goal" chip

  // The headline body-comp goal that drives the Overall tab. Editable fields
  // persist; the trend/milestones/week-targets/consistency are illustrative.
  overall: {
    title: 'Lean by August', by: '2026-07-01', unit: 'kg',
    start: 80.4, startMonth: 'Feb', now: 79.2, target: 76,
    // Logged weigh-ins drive the live numbers (now/down/%/to-go) + the trend chart.
    weighIns: [
      { d: '2026-02-15', kg: 80.4 }, { d: '2026-02-28', kg: 80.2 }, { d: '2026-03-14', kg: 80.3 },
      { d: '2026-03-28', kg: 79.9 }, { d: '2026-04-11', kg: 79.7 }, { d: '2026-04-25', kg: 79.8 },
      { d: '2026-05-09', kg: 79.5 }, { d: '2026-05-23', kg: 79.4 }, { d: '2026-06-06', kg: 79.3 }, { d: '2026-06-13', kg: 79.2 },
    ],
    why: "Lean enough to feel quick on the bike again, strong enough that nothing slips. Wedding's in July — but really it's about staying this person after.",
  },
  // Editable headline (title + subtitle) for the Training / Nutrition dashboards.
  trainingMeta: { title: 'Hold the line', subtitle: 'Keep every lift while the weight comes off.', coach: 'Jordan Chen' },
  nutritionMeta: { title: 'Fuel the cut', subtitle: 'Eat for the lift, not against it.', coach: 'Dr. Maya Patel' },
  training: [
    { t: 'Reach Peak tier', cur: 1284, tgt: 5000, sub: '3,716 points to go · +100/wk lands Peak in ~37 weeks', cat: 'strength' },
    { t: 'Squat 1.5× bodyweight', cur: 135, tgt: 175, sub: '40 lb to go · +5 lb every 3 weeks gets there by Aug 15', cat: 'strength' },
    { t: '4 workouts / week average', cur: 3.2, tgt: 4, sub: '30d rolling · +0.8 sessions/wk closes the gap', cat: 'habits' },
  ],
  nutrition: [
    { t: '85% protein adherence', cur: 82, tgt: 85, sub: '30d rolling · hit target 6 of 7 days', pct: true, cat: 'nutrition' },
    { t: 'Hit 150g protein daily', cur: 120, tgt: 150, sub: 'g protein · per day', cat: 'nutrition' },
  ],
};
function bsGoalIsoFromWeeks(w) { const d = new Date(); d.setDate(d.getDate() + (Number(w) || 0) * 7); return d.toISOString().slice(0, 10); }
function bsGoalDaysUntil(iso) { if (!iso) return null; const ms = new Date(iso).getTime() - Date.now(); return Math.max(0, Math.round(ms / 86400000)); }
// Live body-comp helpers — derive "now" + the trend series from logged weigh-ins.
function bsGoalWeighIns(overall) { return (overall && Array.isArray(overall.weighIns)) ? overall.weighIns.slice().filter(x => x && Number.isFinite(Number(x.kg))) : []; }
function bsGoalNow(overall) { const wi = bsGoalWeighIns(overall); return wi.length ? Number(wi[wi.length - 1].kg) : (Number(overall && overall.now) || 0); }
function bsGoalSeries(overall) {
  const wi = bsGoalWeighIns(overall);
  if (wi.length >= 2) return wi.map(x => ['', Number(x.kg)]);
  const n = bsGoalNow(overall);
  return [['', Number(overall && overall.start) || n], ['', n]];
}

// Bottom-sheet add/edit flow with a categorized template picker (filtered to the
// active tab's group) + the same fields as the website's GoalEditModal.
function BSGoalEditSheet({ tab, goal, onClose, onSave, onDelete }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const isNew = !goal;
  const [g, setG] = useStateBSC(goal || { t: '', cur: 0, tgt: 100, sub: '', pct: false, cat: '', date: '' });
  const cats = BS_GOAL_CATS.filter(c => c.group === tab);
  const [showTpl, setShowTpl] = useStateBSC(isNew);
  const [activeCat, setActiveCat] = useStateBSC((cats[0] && cats[0].id) || 'cardio');
  const pick = (tpl) => { setG({ ...g, t: tpl.t, cur: tpl.cur, tgt: tpl.tgt, sub: tpl.sub, pct: tpl.pct, cat: tpl.cat, date: bsGoalIsoFromWeeks(tpl.weeksOut) }); setShowTpl(false); };
  const days = bsGoalDaysUntil(g.date);
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 };
  const field = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: `1px solid ${t.RULE}`, background: t.PAPER2, borderRadius: 12, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, outline: 'none' };
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '88%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>{isNew ? 'New · Goal' : 'Edit · Goal'}</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>{isNew ? <>New <span style={{ fontStyle: 'italic', color: teal }}>goal.</span></> : <>Edit <span style={{ fontStyle: 'italic', color: teal }}>goal.</span></>}</div>
        {isNew && (
          <div style={{ marginTop: 14 }}>
            <button onClick={() => setShowTpl(s => !s)} style={{ background: 'transparent', border: 0, padding: 0, color: teal, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>{showTpl ? '▾ Hide templates' : '▸ Browse goal templates'}</button>
            {showTpl && (
              <div style={{ marginTop: 10, borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 12 }}>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
                  {cats.map(c => { const on = activeCat === c.id; return <button key={c.id} onClick={() => setActiveCat(c.id)} style={{ padding: '7px 12px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? teal : t.RULE}`, background: on ? (t.isLight ? `${teal}14` : `${teal}22`) : 'transparent', color: on ? teal : t.INK70, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{c.label}</button>; })}
                </div>
                <div style={{ display: 'grid', gap: 8 }}>
                  {BS_GOAL_TEMPLATES.filter(x => x.cat === activeCat).map((tpl, i) => (
                    <button key={i} onClick={() => pick(tpl)} style={{ textAlign: 'left', cursor: 'pointer', borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', padding: '10px 12px', color: t.INK }}>
                      <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, letterSpacing: '-0.01em' }}>{tpl.t}</div>
                      <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.04em' }}>{tpl.sub} · ~{tpl.weeksOut} wks</div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
        <div style={{ marginTop: 16 }}>
          <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>Title</span><input value={g.t} onChange={(e) => setG({ ...g, t: e.target.value })} placeholder="What are you shaping toward?" style={field} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>Current</span><input type="number" value={g.cur} onChange={(e) => setG({ ...g, cur: e.target.value === '' ? '' : Number(e.target.value) })} style={field} /></label>
            <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>Target</span><input type="number" value={g.tgt} onChange={(e) => setG({ ...g, tgt: e.target.value === '' ? '' : Number(e.target.value) })} style={field} /></label>
          </div>
          <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>Subtext</span><input value={g.sub} onChange={(e) => setG({ ...g, sub: e.target.value })} placeholder="e.g. 40 lb to go · +5 lb / 3 weeks" style={field} /></label>
          <label style={{ display: 'block', marginBottom: 12 }}><span style={lbl}>Target date</span><input type="date" value={g.date || ''} onChange={(e) => setG({ ...g, date: e.target.value })} style={field} /></label>
          {g.date && days != null && (
            <div style={{ marginBottom: 12, borderRadius: 10, border: `1px solid ${teal}40`, background: t.isLight ? `${teal}10` : `${teal}1c`, padding: '10px 13px', display: 'flex', justifyContent: 'space-between', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK70 }}>
              <span>Timeline</span><span style={{ color: teal }}>{days} days · ~{Math.max(1, Math.round(days / 7))} wks</span>
            </div>
          )}
          <button onClick={() => setG({ ...g, pct: !g.pct })} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'transparent', border: 0, cursor: 'pointer', padding: 0, marginBottom: 6 }}>
            <span style={{ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${g.pct ? teal : t.RULE}`, background: g.pct ? teal : 'transparent', color: '#04201d', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 900 }}>{g.pct ? '✓' : ''}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK }}>Show values as percent (%)</span>
          </button>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18, alignItems: 'center' }}>
          {onDelete && <button onClick={onDelete} style={{ marginRight: 'auto', padding: '13px 18px', borderRadius: 999, border: `1px solid ${t.RUST}66`, background: 'transparent', color: t.RUST, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Delete</button>}
          <button onClick={onClose} style={{ padding: '13px 20px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Cancel</button>
          <button onClick={() => g.t && onSave(g)} disabled={!g.t} style={{ padding: '13px 22px', borderRadius: 999, border: 0, background: g.t ? teal : t.RULE, color: g.t ? '#04201d' : t.INK50, cursor: g.t ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Save goal</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// Weight-trend line+area chart for the Overall tab.
function BSGoalsTrend({ teal, series, h = 92 }) {
  const w = 340;
  const vals = series.map(p => p[1]);
  const min = Math.min(...vals), max = Math.max(...vals), span = (max - min) || 1, n = series.length;
  const X = (i) => (i / (n - 1)) * w;
  const Y = (v) => h - 6 - ((v - min) / span) * (h - 14);
  const pts = series.map((p, i) => [X(i), Y(p[1])]);
  const line = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
  const area = `${line} L${w},${h} L0,${h} Z`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" height={h} preserveAspectRatio="none" style={{ display: 'block' }}>
      <defs><linearGradient id="bsGoalTrend" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={teal} stopOpacity="0.22" /><stop offset="100%" stopColor={teal} stopOpacity="0" /></linearGradient></defs>
      <path d={area} fill="url(#bsGoalTrend)" />
      <path d={line} fill="none" stroke={teal} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={pts[n - 1][0]} cy={pts[n - 1][1]} r="3.6" fill={teal} />
    </svg>
  );
}

// The Overall tab — a body-comp dashboard for the headline goal. Editable fields
// (start/now/target/title/why) come from `overall`; the trend, milestones,
// week-targets and consistency are illustrative demo content for now.
function BSGoalsOverall({ overall, onLog }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const purple = '#8a5cf6';
  const start = Number(overall.start) || 0, now = bsGoalNow(overall), target = Number(overall.target) || 0;
  const unit = overall.unit || 'kg';
  const down = +(now - start).toFixed(1);
  const range = +(start - target).toFixed(1);
  const toGo = +(now - target).toFixed(1);
  const pct = range > 0 ? Math.max(0, Math.min(1, (start - now) / range)) : 0;
  const byD = overall.by ? new Date(overall.by) : null;
  const byLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : '';
  const series = bsGoalSeries(overall);
  const stats = [
    { l: 'Current', c: teal,    v: now.toLocaleString(), u: unit, sub: 'Latest weigh-in' },
    { l: 'To go',   c: t.RUST,  v: toGo.toLocaleString(), u: unit, sub: `of ${range} ${unit}` },
    { l: 'Weekly pace', c: t.AMBER, v: '-0.4', u: unit, sub: '4-wk average' },
    { l: 'On track', c: t.GREEN, v: 'Yes', u: '', sub: '9 wks to spare' },
  ];
  const milestones = [
    { done: true, t: 'Baseline set', sub: '80.4 kg · plans live', when: 'Feb' },
    { done: true, t: 'First kilo down', sub: '79.4 kg · habits sticking', when: 'Mar' },
    { n: '03', t: 'Halfway · 78.2 kg', sub: 'on pace · ~3 weeks out', when: 'Next', next: true },
    { n: '04', t: 'Hold bench at 90 kg', sub: 'strength through the cut', when: 'Ongoing' },
    { n: '05', t: `Goal · ${target.toLocaleString()} ${unit}`, sub: 'lean & strong', when: byLabel || 'Goal' },
  ];
  const plans = [
    { role: 'Training', c: t.AMBER, t: '12-wk lean strength', sub: 'Jordan · 4×/wk' },
    { role: 'Nutrition', c: t.RUST, t: 'Protein-led cut', sub: 'Dr. Maya · 1,890 kcal' },
  ];
  const weekTargets = [
    { l: 'Sessions', v: '3/4', sub: 'one to go', c: t.RUST },
    { l: 'Protein days', v: '6/7', sub: '≥170g hit', c: teal },
    { l: 'Steps', v: '7.2k', sub: 'avg · goal 8k', c: t.AMBER },
    { l: 'Sleep', v: '6.8h', sub: 'avg · goal 7h', c: purple },
  ];
  const SecHead = ({ kicker, title, action }) => (
    <div style={{ padding: `22px ${t.padX}px 0` }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>{kicker}</div>
      <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 25, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em' }}>{title}</div>
        {action && <button onClick={action.onClick} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: teal, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', padding: 0 }}>{action.label} →</button>}
      </div>
    </div>
  );
  const miniCard = (s, i) => (
    <div key={i} style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 13 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.c }}>{s.l}</div>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}{s.u ? <span style={{ fontSize: 12, color: t.INK50, marginLeft: 2 }}>{s.u}</span> : null}</div>
      <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{s.sub}</div>
    </div>
  );
  return (
    <>
      {/* Featured — down so far */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 18, border: `1px solid ${teal}44`, background: `linear-gradient(160deg, ${teal}22, ${teal}08 55%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>Down so far</div>
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontSize: 44, fontWeight: 600, color: t.INK, letterSpacing: '-0.03em', lineHeight: 0.95 }}>{down > 0 ? '+' : '−'}{Math.abs(down)}<span style={{ fontSize: 18, color: t.INK50, marginLeft: 3 }}>{unit}</span></div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontSize: 34, fontWeight: 600, color: teal, letterSpacing: '-0.02em', lineHeight: 1 }}>{Math.round(pct * 100)}%</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>There</div>
            </div>
          </div>
          <div style={{ position: 'relative', margin: '16px 0 14px', height: 6 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: t.HAIR }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, borderRadius: 999, background: teal }} />
            <div style={{ position: 'absolute', left: `calc(${pct * 100}% - 7px)`, top: -4, width: 14, height: 14, borderRadius: 999, background: '#fff', border: `3px solid ${teal}` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {[[start, 'Start · ' + (overall.startMonth || ''), t.INK50], [now, 'Now', teal], [target, 'Target · ' + (byLabel || ''), t.AMBER]].map(([v, lab, c], i) => (
              <div key={i} style={{ textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center', minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{Number(v).toLocaleString()}</div>
                <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c }}>{lab}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ padding: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        {stats.map(miniCard)}
      </div>

      {/* Trend */}
      <SecHead kicker="Trend" title="Weight" action={{ label: 'Log weigh-in', onClick: onLog }} />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em' }}>{now.toLocaleString()}<span style={{ fontSize: 12, color: t.INK50, marginLeft: 2 }}>{unit}</span></span>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: teal }}>{down} {unit} · {bsGoalWeighIns(overall).length} logs · target {target}</span>
          </div>
          <BSGoalsTrend teal={teal} series={series} />
        </div>
      </div>

      {/* Milestones */}
      <SecHead kicker="The path" title="Milestones" />
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {milestones.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: m.done ? t.INK50 : (m.next ? teal : t.INK50), marginTop: 2 }}>{m.done ? '✓' : m.n}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: m.done ? t.INK50 : t.INK, letterSpacing: '-0.015em' }}>{m.t}</div>
              <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', color: m.next ? teal : t.INK50, fontWeight: 600 }}>{m.sub}</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: m.next ? teal : t.INK50, marginTop: 2 }}>{m.when}</span>
          </div>
        ))}
      </div>

      {/* Your plans */}
      <SecHead kicker="Driving it" title="Your plans" />
      <div style={{ padding: `12px ${t.padX}px 0`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {plans.map((p, i) => (
          <div key={i} style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 6, height: 34, borderRadius: 3, background: p.c, flexShrink: 0 }} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: p.c }}>{p.role}</div>
              <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{p.t}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, letterSpacing: '0.06em', marginTop: 1 }}>{p.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* This week targets */}
      <SecHead kicker="This week" title="Targets that move it" />
      <div style={{ padding: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        {weekTargets.map(miniCard)}
      </div>

      {/* Consistency */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: teal }}>Consistency · last 7 weeks</span>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: t.INK50 }}>84% avg</span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7 }}>
            {[0.9, 0.95, 0.8, 1, 0.7, 0.92, 0.88].map((v, i) => (
              <div key={i} style={{ aspectRatio: '1 / 1', borderRadius: 8, background: teal, opacity: 0.35 + v * 0.6 }} />
            ))}
          </div>
        </div>
      </div>

      {/* Your why */}
      <SecHead kicker="Your why" title="Stay with it" />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${purple}44`, background: `linear-gradient(155deg, ${purple}22, ${purple}08 60%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 16 }}>
          <div style={{ fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontStyle: 'italic', fontSize: 16, lineHeight: 1.5, color: t.INK }}>“{overall.why}”</div>
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 28, height: 28, borderRadius: 999, background: teal, color: '#04201d', display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 12, flexShrink: 0 }}>{bsMyInitials()[0]}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 13, fontWeight: 700, color: t.INK }}>Set by you</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>Feb 2026 · Edit anytime</div>
            </div>
          </div>
        </div>
      </div>

      {/* Log weigh-in CTA */}
      <div style={{ padding: `18px ${t.padX}px 8px` }}>
        <button onClick={onLog} style={{ width: '100%', padding: '15px', borderRadius: 999, border: 0, background: teal, color: '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Log weigh-in →</button>
      </div>
    </>
  );
}

// Edit sheet for the Overall headline goal (title / target date / start-now-target / why).
function BSOverallEditSheet({ overall, onClose, onSave }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [g, setG] = useStateBSC({ ...overall });
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 };
  const field = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: `1px solid ${t.RULE}`, background: t.PAPER2, borderRadius: 12, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, outline: 'none' };
  const num = (k) => <label style={{ display: 'block' }}><span style={lbl}>{k === 'start' ? 'Start' : k === 'now' ? 'Now' : 'Target'}</span><input type="number" value={g[k]} onChange={(e) => setG({ ...g, [k]: e.target.value === '' ? '' : Number(e.target.value) })} style={field} /></label>;
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', maxHeight: '88%', overflowY: 'auto', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Edit · Goal</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>Your <span style={{ fontStyle: 'italic', color: teal }}>goal.</span></div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'block' }}><span style={lbl}>Title</span><input value={g.title} onChange={(e) => setG({ ...g, title: e.target.value })} placeholder="e.g. Lean by August" style={field} /></label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <label style={{ display: 'block' }}><span style={lbl}>Target date</span><input type="date" value={g.by || ''} onChange={(e) => setG({ ...g, by: e.target.value })} style={field} /></label>
            <label style={{ display: 'block' }}><span style={lbl}>Unit</span><input value={g.unit || ''} onChange={(e) => setG({ ...g, unit: e.target.value.slice(0, 6) })} placeholder="kg" style={field} /></label>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>{num('start')}{num('now')}{num('target')}</div>
          <label style={{ display: 'block' }}><span style={lbl}>Your why</span><textarea value={g.why || ''} onChange={(e) => setG({ ...g, why: e.target.value })} rows={3} style={{ ...field, resize: 'vertical', fontSize: 14, lineHeight: 1.4 }} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '13px 20px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Cancel</button>
          <button onClick={() => onSave(g)} style={{ flex: 1, padding: '13px', borderRadius: 999, border: 0, background: teal, color: '#04201d', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Save goal</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// The Training tab — a strength-held dashboard (rust). Lift targets, milestones,
// program. Illustrative demo content; the headline title/subtitle are editable.
function BSGoalsTraining({ onOpenProgram }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const rust = t.RUST, purple = '#8a5cf6';
  const stats = [
    { l: 'Sessions', c: rust, v: '14', u: '/16', sub: 'This block' },
    { l: 'Streak', c: teal, v: '8d', u: '', sub: 'Consistency' },
    { l: 'Avg RPE', c: t.AMBER, v: '7.5', u: '', sub: 'Effort logged' },
    { l: 'PRs', c: purple, v: '1', u: '', sub: 'During cut' },
  ];
  const lifts = [
    { t: 'Bench Press', w: '90 kg', d: '+5.0', pct: 0.84 },
    { t: 'Back Squat', w: '120 kg', d: '+5.0', pct: 0.72 },
    { t: 'Barbell Row', w: '75 kg', d: '+2.5', pct: 0.6 },
    { t: 'Deadlift', w: '150 kg', d: 'held', pct: 1 },
  ];
  const milestones = [
    { done: true, t: 'Baseline lifts logged', sub: 'bench 85 · squat 115', when: 'Feb' },
    { done: true, t: 'Bench +5 kg → 90 kg', sub: 'held form, no grind', when: 'Apr' },
    { n: '03', t: 'Squat 125 kg', sub: 'next · one plate away', when: 'Next', next: true },
    { n: '04', t: 'Deadlift 160 kg', sub: 'end-of-block test', when: 'Jun' },
    { n: '05', t: 'Finish cut, lifts ≥ start', sub: 'the whole point', when: 'Jul 1' },
  ];
  const SecHead = ({ kicker, title }) => (
    <div style={{ padding: `22px ${t.padX}px 0` }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>{kicker}</div>
      <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 25, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em' }}>{title}</div>
    </div>
  );
  return (
    <>
      {/* Featured — strength held */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 18, border: `1px solid ${rust}44`, background: `linear-gradient(160deg, ${rust}22, ${rust}08 55%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 18 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: rust }}>Strength held</div>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontSize: 44, fontWeight: 600, color: t.INK, letterSpacing: '-0.03em', lineHeight: 0.95 }}>4<span style={{ fontSize: 20, color: t.INK50, marginLeft: 3 }}>/4 lifts</span></div>
          <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.06em', color: rust }}>none dropped · bench +5 kg</div>
          <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>Sessions / week</span>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>Last 7 weeks</span>
          </div>
          <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 7 }}>
            {[0.6, 0.7, 0.65, 0.55, 0.7, 0.6, 1].map((v, i) => (
              <div key={i} style={{ aspectRatio: '1 / 1', borderRadius: 8, background: rust, opacity: 0.3 + v * 0.6 }} />
            ))}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ padding: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>
        {stats.map((s, i) => (
          <div key={i} style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 13 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.c }}>{s.l}</div>
            <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}{s.u ? <span style={{ fontSize: 12, color: t.INK50, marginLeft: 1 }}>{s.u}</span> : null}</div>
            <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      {/* The target — lift rows */}
      <SecHead kicker="The target" title="Hold every lift" />
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {lifts.map((l, i) => (
          <div key={i} style={{ padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{l.t}</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK }}>{l.w} <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: rust }}>▲ {l.d}</span></span>
            </div>
            <div style={{ marginTop: 7, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${l.pct * 100}%`, background: rust, borderRadius: 999 }} /></div>
          </div>
        ))}
      </div>

      {/* Milestones */}
      <SecHead kicker="The path" title="Milestones" />
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {milestones.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: m.done ? t.INK50 : (m.next ? rust : t.INK50), marginTop: 2 }}>{m.done ? '✓' : m.n}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: m.done ? t.INK50 : t.INK, letterSpacing: '-0.015em' }}>{m.t}</div>
              <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', color: m.next ? rust : t.INK50, fontWeight: 600 }}>{m.sub}</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: m.next ? rust : t.INK50, marginTop: 2 }}>{m.when}</span>
          </div>
        ))}
      </div>

      {/* Your program */}
      <SecHead kicker="Driving it" title="Your program" />
      <div style={{ padding: `12px ${t.padX}px 8px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${rust}44`, background: `linear-gradient(155deg, ${rust}1c, ${rust}06 60%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: rust }}>Training</span>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>4× / week · W4</span>
          </div>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>Push / Pull / Legs</div>
          <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 30, height: 30, borderRadius: 999, background: rust, color: '#fff', display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>J</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, color: t.INK }}>Jordan Chen</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>Coach · Hypertrophy</div>
              </div>
            </div>
            <button onClick={onOpenProgram} style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 999, border: `1px solid ${rust}`, background: 'transparent', color: rust, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Open →</button>
          </div>
        </div>
      </div>
    </>
  );
}

// The Nutrition tab — body-comp + macros dashboard (gold). Shares the weight
// goal (overall) with the Overall tab; adds macros, nutrition milestones, plan,
// and weekly nutrition targets. Illustrative demo content.
function BSGoalsNutrition({ overall, onLog }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const gold = '#d8b25a', purple = '#8a5cf6';
  const start = Number(overall.start) || 0, now = bsGoalNow(overall), target = Number(overall.target) || 0;
  const unit = overall.unit || 'kg';
  const down = +(now - start).toFixed(1), range = +(start - target).toFixed(1), toGo = +(now - target).toFixed(1);
  const pct = range > 0 ? Math.max(0, Math.min(1, (start - now) / range)) : 0;
  const byD = overall.by ? new Date(overall.by) : null;
  const byLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : '';
  const series = bsGoalSeries(overall);
  const stats = [
    { l: 'Current', c: gold, v: now.toLocaleString(), u: unit, sub: 'Latest weigh-in' },
    { l: 'To go', c: t.RUST, v: toGo.toLocaleString(), u: unit, sub: `of ${range} ${unit}` },
    { l: 'Adherence', c: teal, v: '92', u: '%', sub: 'This week' },
    { l: 'Weekly pace', c: purple, v: '-0.4', u: unit, sub: '4-wk average' },
  ];
  const macros = [
    { t: 'Protein', v: '165 g', tgt: '170 g', c: t.GREEN, pct: 0.97 },
    { t: 'Carbs', v: '190 g', tgt: '200 g', c: gold, pct: 0.95 },
    { t: 'Fat', v: '60 g', tgt: '62 g', c: t.RUST, pct: 0.97 },
  ];
  const milestones = [
    { done: true, t: 'Baseline · 80.4 kg', sub: 'plan + macros set', when: 'Feb' },
    { done: true, t: 'First kilo down', sub: '79.4 kg · clean week', when: 'Mar' },
    { n: '03', t: 'Halfway · 78.2 kg', sub: 'add a refeed Saturdays', when: 'Next', next: true },
    { n: '04', t: 'Under 78 kg', sub: 'hold protein, drop carbs', when: 'Jun' },
    { n: '05', t: 'Goal · 76.0 kg', sub: 'then reverse, carefully', when: 'Jul 1' },
  ];
  const targets = [
    { l: 'Protein days', v: '6/7', sub: '≥170g hit', c: t.GREEN },
    { l: 'On target', v: '5/7', sub: 'kcal in range', c: gold },
    { l: 'Logged', v: '6/7', sub: 'days tracked', c: t.RUST },
    { l: 'Water', v: '2.4L', sub: 'avg · goal 3L', c: purple },
  ];
  const SecHead = ({ kicker, title, action }) => (
    <div style={{ padding: `22px ${t.padX}px 0` }}>
      <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>{kicker}</div>
      <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 25, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em' }}>{title}</div>
        {action && <button onClick={action.onClick} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: teal, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', padding: 0 }}>{action.label} →</button>}
      </div>
    </div>
  );
  const miniCard = (s, i) => (
    <div key={i} style={{ borderRadius: 14, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 13 }}>
      <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: s.c }}>{s.l}</div>
      <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}{s.u ? <span style={{ fontSize: 12, color: t.INK50, marginLeft: 2 }}>{s.u}</span> : null}</div>
      <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>{s.sub}</div>
    </div>
  );
  return (
    <>
      {/* Down so far (gold) */}
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 18, border: `1px solid ${gold}44`, background: `linear-gradient(160deg, ${gold}22, ${gold}08 55%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 18 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: gold }}>Down so far</div>
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontSize: 44, fontWeight: 600, color: t.INK, letterSpacing: '-0.03em', lineHeight: 0.95 }}>{down > 0 ? '+' : '−'}{Math.abs(down)}<span style={{ fontSize: 18, color: t.INK50, marginLeft: 3 }}>{unit}</span></div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontSize: 34, fontWeight: 600, color: gold, letterSpacing: '-0.02em', lineHeight: 1 }}>{Math.round(pct * 100)}%</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 2 }}>There</div>
            </div>
          </div>
          <div style={{ position: 'relative', margin: '16px 0 14px', height: 6 }}>
            <div style={{ position: 'absolute', inset: 0, borderRadius: 999, background: t.HAIR }} />
            <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct * 100}%`, borderRadius: 999, background: gold }} />
            <div style={{ position: 'absolute', left: `calc(${pct * 100}% - 7px)`, top: -4, width: 14, height: 14, borderRadius: 999, background: '#fff', border: `3px solid ${gold}` }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
            {[[start, 'Start · ' + (overall.startMonth || ''), t.INK50], [now, 'Now', gold], [target, 'Target · ' + (byLabel || ''), t.INK50]].map(([v, lab, c], i) => (
              <div key={i} style={{ textAlign: i === 0 ? 'left' : i === 2 ? 'right' : 'center', minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{Number(v).toLocaleString()}</div>
                <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: c }}>{lab}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stat grid */}
      <div style={{ padding: `12px ${t.padX}px 0`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>{stats.map(miniCard)}</div>

      {/* Trend */}
      <SecHead kicker="Trend" title="Weight" action={{ label: 'Log weigh-in', onClick: onLog }} />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em' }}>{now.toLocaleString()}<span style={{ fontSize: 12, color: t.INK50, marginLeft: 2 }}>{unit}</span></span>
            <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: gold }}>{down} {unit} · {bsGoalWeighIns(overall).length} logs · target {target}</span>
          </div>
          <BSGoalsTrend teal={gold} series={series} />
        </div>
      </div>

      {/* Macros vs target */}
      <SecHead kicker="Daily average" title="Macros vs target" />
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {macros.map((m, i) => (
          <div key={i} style={{ padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{m.t}</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK }}>{m.v} <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.06em', color: m.c }}>▲ {m.tgt}</span></span>
            </div>
            <div style={{ marginTop: 7, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${m.pct * 100}%`, background: m.c, borderRadius: 999 }} /></div>
          </div>
        ))}
      </div>

      {/* Milestones */}
      <SecHead kicker="The path" title="Milestones" />
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {milestones.map((m, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'start', padding: '13px 0', borderTop: i === 0 ? 0 : `1px solid ${t.HAIR}` }}>
            <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: m.done ? t.INK50 : (m.next ? gold : t.INK50), marginTop: 2 }}>{m.done ? '✓' : m.n}</span>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: m.done ? t.INK50 : t.INK, letterSpacing: '-0.015em' }}>{m.t}</div>
              <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', color: m.next ? gold : t.INK50, fontWeight: 600 }}>{m.sub}</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: m.next ? gold : t.INK50, marginTop: 2 }}>{m.when}</span>
          </div>
        ))}
      </div>

      {/* Your plan */}
      <SecHead kicker="Driving it" title="Your plan" />
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${gold}44`, background: `linear-gradient(155deg, ${gold}1c, ${gold}06 60%, ${t.PAPER2} 92%), ${t.PAPER2}`, padding: 16 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: gold }}>Nutrition</span>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>2,100 kcal</span>
          </div>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>Lean Cut · 170g protein</div>
          <div style={{ marginTop: 13, paddingTop: 12, borderTop: `1px solid ${t.RULE}`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <span style={{ width: 30, height: 30, borderRadius: 999, background: gold, color: '#2a1f08', display: 'grid', placeItems: 'center', fontFamily: t.DISPLAY, fontWeight: 800, fontSize: 13, flexShrink: 0 }}>M</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, color: t.INK }}>Dr. Maya Patel</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>Nutritionist · Cut</div>
              </div>
            </div>
            <button onClick={onLog} style={{ flexShrink: 0, padding: '9px 16px', borderRadius: 999, border: `1px solid ${gold}`, background: 'transparent', color: gold, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Open →</button>
          </div>
        </div>
      </div>

      {/* This week targets */}
      <SecHead kicker="This week" title="Nutrition targets" />
      <div style={{ padding: `12px ${t.padX}px 8px`, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 9 }}>{targets.map(miniCard)}</div>
    </>
  );
}

// Small headline editor (title + subtitle) for the Training / Nutrition tabs.
function BSHeadlineEditSheet({ meta, accent, onClose, onSave }) {
  const t = useBS();
  const [m, setM] = useStateBSC({ ...meta });
  const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 6 };
  const field = { width: '100%', boxSizing: 'border-box', padding: '11px 12px', border: `1px solid ${t.RULE}`, background: t.PAPER2, borderRadius: 12, fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, outline: 'none' };
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent }}>Edit · Goal</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>Your <span style={{ fontStyle: 'italic', color: accent }}>headline.</span></div>
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <label style={{ display: 'block' }}><span style={lbl}>Title</span><input value={m.title || ''} onChange={(e) => setM({ ...m, title: e.target.value })} style={field} /></label>
          <label style={{ display: 'block' }}><span style={lbl}>Subtitle</span><input value={m.subtitle || ''} onChange={(e) => setM({ ...m, subtitle: e.target.value })} style={field} /></label>
        </div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '13px 20px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Cancel</button>
          <button onClick={() => onSave(m)} style={{ flex: 1, padding: '13px', borderRadius: 999, border: 0, background: accent, color: '#fff', cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Save</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

// Log a weigh-in — records today's weight, which updates now/down/%/to-go and the
// trend chart across the Overall + Nutrition tabs.
function BSWeighInSheet({ overall, onClose, onSave }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const unit = overall.unit || 'kg';
  const [kg, setKg] = useStateBSC(String(bsGoalNow(overall) || ''));
  const inputRef = React.useRef(null);
  React.useEffect(() => { const id = setTimeout(() => inputRef.current && inputRef.current.focus(), 60); return () => clearTimeout(id); }, []);
  const val = parseFloat(kg);
  const ok = Number.isFinite(val) && val > 0;
  const sheet = (
    <div onClick={onClose} style={{ position: 'absolute', inset: 0, zIndex: 60, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'flex-end' }}>
      <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', boxSizing: 'border-box', background: t.PAPER, borderTopLeftRadius: 22, borderTopRightRadius: 22, borderTop: `1px solid ${t.RULE}`, padding: `18px ${t.padX}px 18px`, boxShadow: '0 -20px 50px rgba(0,0,0,0.4)' }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: teal }}>Log · Weigh-in</div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 28, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK }}>Today's <span style={{ fontStyle: 'italic', color: teal }}>weight.</span></div>
        <div style={{ marginTop: 16, display: 'flex', alignItems: 'baseline', gap: 10, border: `1px solid ${t.RULE}`, borderRadius: 14, background: t.PAPER2, padding: '14px 16px' }}>
          <input ref={inputRef} value={kg} onChange={(e) => setKg(e.target.value.replace(/[^0-9.]/g, ''))} onKeyDown={(e) => { if (e.key === 'Enter' && ok) onSave(val); }} inputMode="decimal" placeholder="0.0" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 34, fontWeight: 700, letterSpacing: '-0.03em' }} />
          <span style={{ fontFamily: t.DISPLAY, fontSize: 18, color: t.INK50 }}>{unit}</span>
        </div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>Updates your trend + progress · start {Number(overall.start).toLocaleString()} · target {Number(overall.target).toLocaleString()}</div>
        <div style={{ display: 'flex', gap: 10, marginTop: 18 }}>
          <button onClick={onClose} style={{ padding: '13px 20px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Cancel</button>
          <button onClick={() => ok && onSave(val)} disabled={!ok} style={{ flex: 1, padding: '13px', borderRadius: 999, border: 0, background: ok ? teal : t.RULE, color: ok ? '#04201d' : t.INK50, cursor: ok ? 'pointer' : 'default', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Save weigh-in</button>
        </div>
      </div>
    </div>
  );
  const target = (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || (typeof document !== 'undefined' ? document.body : null);
  return target ? createPortal(sheet, target) : sheet;
}

function BSClientGoals({ onBack }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  _bsScrollTopOnMount();
  const [data, setData] = useStateBSC(BS_GOALS_DEFAULT);
  const [tab, setTab] = useStateBSC('overall'); // overall | training | nutrition
  const [editing, setEditing] = useStateBSC(null); // goal-list edit: 'new' | index | null
  const [editOverall, setEditOverall] = useStateBSC(false);
  const [logWeigh, setLogWeigh] = useStateBSC(false);
  const loggedIn = !!(typeof window !== 'undefined' && window.ShapeAuth?.getCachedState?.().user);
  const logWeighIn = (kg) => {
    const today = new Date().toISOString().slice(0, 10);
    const prev = bsGoalWeighIns(overall);
    const wi = (prev.length && prev[prev.length - 1].d === today) ? [...prev.slice(0, -1), { d: today, kg }] : [...prev, { d: today, kg }];
    const nextOverall = { ...overall, weighIns: wi, now: kg };
    if (loggedIn && window.ShapeWeighIns?.log) {
      setData(d => ({ ...d, overall: nextOverall }));          // optimistic; table is the source of truth
      window.ShapeWeighIns.log({ weight: kg, unit: overall.unit || 'kg' }).catch(() => {});
    } else {
      persist({ ...data, overall: nextOverall });              // signed out / demo → user_goals JSONB
    }
    setLogWeigh(false);
  };
  // Load the editable goal fields (user_goals) + the live weigh-in series. When
  // signed in, the dedicated client_weigh_ins table wins for weighIns/now.
  React.useEffect(() => {
    let alive = true;
    (async () => {
      let doc = null, weigh = null, ident = null;
      try { doc = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_goals') : null; } catch (e) {}
      try { ident = window.shapeDb?.getUserGoals ? await window.shapeDb.getUserGoals('client_identity') : null; } catch (e) {}
      if (loggedIn) { try { weigh = window.ShapeWeighIns?.list ? await window.ShapeWeighIns.list() : null; } catch (e) {} }
      if (!alive) return;
      setData(prev => {
        const m = { ...prev };
        // Primary goal — synced with the edit-profile chip (client_goals.primaryGoal
        // is canonical; fall back to the profile's client_identity.goal).
        m.primaryGoal = (doc && doc.primaryGoal) || (ident && ident.goal) || prev.primaryGoal || '';
        if (doc && typeof doc === 'object') {
          m.share = doc.share !== false;
          m.overall = (doc.overall && typeof doc.overall === 'object') ? { ...prev.overall, ...doc.overall } : prev.overall;
          m.trainingMeta = (doc.trainingMeta && typeof doc.trainingMeta === 'object') ? { ...prev.trainingMeta, ...doc.trainingMeta } : prev.trainingMeta;
          m.nutritionMeta = (doc.nutritionMeta && typeof doc.nutritionMeta === 'object') ? { ...prev.nutritionMeta, ...doc.nutritionMeta } : prev.nutritionMeta;
          m.training = Array.isArray(doc.training) ? doc.training : prev.training;
          m.nutrition = Array.isArray(doc.nutrition) ? doc.nutrition : prev.nutrition;
        }
        if (Array.isArray(weigh) && weigh.length) {
          m.overall = { ...m.overall, weighIns: weigh, now: Number(weigh[weigh.length - 1].kg) };
        }
        return m;
      });
    })();
    return () => { alive = false; };
  }, [loggedIn]);
  const persist = (next) => { setData(next); try { window.shapeDb?.saveUserGoals?.('client_goals', next); } catch (e) {} };
  const overall = data.overall || BS_GOALS_DEFAULT.overall;
  const trainingMeta = data.trainingMeta || BS_GOALS_DEFAULT.trainingMeta;
  const nutritionMeta = data.nutritionMeta || BS_GOALS_DEFAULT.nutritionMeta;
  const goals = Array.isArray(data[tab]) ? data[tab] : [];
  const saveGoal = (g) => { const arr = goals.slice(); if (editing === 'new') arr.push(g); else arr[editing] = g; persist({ ...data, [tab]: arr }); setEditing(null); };
  const deleteGoal = () => { const arr = goals.filter((_, i) => i !== editing); persist({ ...data, [tab]: arr }); setEditing(null); };
  const byD = overall.by ? new Date(overall.by) : null;
  const byLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : '';
  // Per-tab theme + headline.
  const ACCENT = { overall: teal, training: t.RUST, nutrition: '#a07a2e' };
  const INKON = { overall: '#04201d', training: '#2b0d07', nutrition: '#241a08' };
  const accent = ACCENT[tab];
  const headInfo = tab === 'overall'
    ? { eyebrow: `Your goal${byLabel ? ` · By ${byLabel}` : ''}`, title: overall.title, subtitle: '' }
    : tab === 'training'
    ? { eyebrow: `Training goal${trainingMeta.coach ? ` · ${trainingMeta.coach}` : ''}`, title: trainingMeta.title, subtitle: trainingMeta.subtitle }
    : { eyebrow: `Nutrition goal${nutritionMeta.coach ? ` · ${nutritionMeta.coach}` : ''}`, title: nutritionMeta.title, subtitle: nutritionMeta.subtitle };
  const hWords = String(headInfo.title || 'Goal').trim().split(/\s+/);
  const hLast = hWords.length ? hWords.pop() : '';
  const hHead = hWords.join(' ');
  return (
    <BSPage>
      {/* Header — eyebrow + serif goal title (+ subtitle) + Edit / Back */}
      <div style={{ padding: `62px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', color: accent, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{headInfo.eyebrow}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
            <button onClick={() => setEditOverall(true)} style={{ padding: '7px 13px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>Edit</button>
            <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', color: t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', padding: 0 }}>← Back</button>
            <BSMeCorner size={26} />
          </div>
        </div>
        <h1 style={{ margin: '10px 0 0', fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: t.INK }}>{hHead ? hHead + ' ' : ''}<span style={{ fontStyle: 'italic', color: accent }}>{hLast}.</span></h1>
        {headInfo.subtitle ? <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, color: t.INK50, lineHeight: 1.4 }}>{headInfo.subtitle}</div> : null}
      </div>
      {/* Overall / Training / Nutrition tabs */}
      <div style={{ padding: `16px ${t.padX}px 0` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 4, border: `1px solid ${t.RULE}`, borderRadius: 12, padding: 3 }}>
          {[['overall', 'Overall'], ['training', 'Training'], ['nutrition', 'Nutrition']].map(([k, l]) => { const on = tab === k; return <button key={k} onClick={() => setTab(k)} style={{ padding: '10px 4px', borderRadius: 9, border: 0, cursor: 'pointer', background: on ? ACCENT[k] : 'transparent', color: on ? INKON[k] : t.INK70, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{l}</button>; })}
        </div>
      </div>

      {/* Primary goal — synced with the edit-profile "Primary goal" chip */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${teal}33`, background: `linear-gradient(150deg, ${teal}12, ${t.PAPER2} 70%)`, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', color: teal }}>Primary goal</div>
              <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em', color: t.INK }}>{data.primaryGoal || 'Set a goal'}</div>
            </div>
            <button onClick={() => { try { window.dispatchEvent(new CustomEvent('shape:openProfile')); } catch (e) {} }} style={{ flexShrink: 0, padding: '7px 13px', borderRadius: 999, border: `1px solid ${teal}`, background: `${teal}14`, color: teal, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>Edit</button>
          </div>
          <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Set in profile · syncs everywhere</div>
        </div>
      </div>

      {tab === 'overall' ? (
        <BSGoalsOverall overall={overall} onLog={() => setLogWeigh(true)} />
      ) : tab === 'training' ? (
        <BSGoalsTraining onOpenProgram={() => {}} />
      ) : (
        <BSGoalsNutrition overall={overall} onLog={() => setLogWeigh(true)} />
      )}

      {/* Share with coaches — applies to all goal tabs */}
      <div style={{ padding: `20px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>Share with your coaches</div>
            <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.4 }}>{data.share ? 'Your coaches can see your goals' : 'Private — coaches can’t see your goals'}</div>
          </div>
          <button onClick={() => persist({ ...data, share: !data.share })} aria-label="Toggle coach visibility" style={{ flexShrink: 0, width: 46, height: 28, borderRadius: 999, border: 0, cursor: 'pointer', padding: 3, background: data.share ? accent : t.RULE, display: 'flex', justifyContent: data.share ? 'flex-end' : 'flex-start', alignItems: 'center' }}>
            <span style={{ width: 22, height: 22, borderRadius: 999, background: '#fff', display: 'block' }} />
          </button>
        </div>
      </div>
      <div style={{ height: 28 }} />
      {logWeigh && <BSWeighInSheet overall={overall} onClose={() => setLogWeigh(false)} onSave={logWeighIn} />}
      {editOverall && (tab === 'overall'
        ? <BSOverallEditSheet overall={overall} onClose={() => setEditOverall(false)} onSave={(g) => { persist({ ...data, overall: g }); setEditOverall(false); }} />
        : <BSHeadlineEditSheet meta={tab === 'training' ? trainingMeta : nutritionMeta} accent={accent} onClose={() => setEditOverall(false)} onSave={(m) => { persist({ ...data, [tab + 'Meta']: m }); setEditOverall(false); }} />
      )}
      <BSFooter right="Goals" />
    </BSPage>
  );
}

function BSClientMe({ onProfile, onLogout, onIntegrations = () => {}, goMarket = () => {}, goRadio = () => {}, tweaks = {}, setTweak = () => {} }) {
  const t = useBS();
  const [showHabits, setShowHabits] = useStateBSC(false);
  const [showScore, setShowScore] = useStateBSC(false);
  const [showStore, setShowStore] = useStateBSC(false);
  const [showContact, setShowContact] = useStateBSC(false);
  const [showTerms, setShowTerms] = useStateBSC(false);
  const [showPrivacy, setShowPrivacy] = useStateBSC(false);
  const [showProgress, setShowProgress] = useStateBSC(false);
  const [showSessions, setShowSessions] = useStateBSC(false);
  const [showNotifications, setShowNotifications] = useStateBSC(false);
  const [showLeaderboard, setShowLeaderboard] = useStateBSC(false);
  const [showLibrary, setShowLibrary] = useStateBSC(false);
  const [showGoals, setShowGoals] = useStateBSC(false);
  const [showPublicProfile, setShowPublicProfile] = useStateBSC(false);
  // Featured goal for the Me-page goal box — the headline (Overall) body-comp goal.
  const [meGoal, setMeGoal] = useStateBSC(BS_GOALS_DEFAULT.overall);
  React.useEffect(() => {
    if (!window.shapeDb?.getUserGoals) return;
    window.shapeDb.getUserGoals('client_goals').then(d => {
      if (d && d.overall && typeof d.overall === 'object') setMeGoal({ ...BS_GOALS_DEFAULT.overall, ...d.overall });
    }).catch(() => {});
  }, []);
  const scoreProfile = _bsUseLiveScore(SHAPE_SCORE_PROFILES.client); // live points/tier when signed in
  const membership = useBSMembership(); // gate the Shape Store row for non-members
  const storeLocked = !membership.loading && !membership.allowed;
  const authProfile = window.ShapeAuth?.getCachedState?.().profile || {};
  const displayName = authProfile.full_name || 'Alex Rivera';
  const [firstName, ...lastParts] = displayName.split(' ');
  const lastName = lastParts.join(' ') || 'Rivera';

  // Editable state — backed by client_profiles JSONB (profile + nutrition +
  // training) and user_goals rows (privacy, social, notifications). Loaded
  // from shapeDb on mount; saved on each Save tap.
  const [profileData, setProfileData] = useStateBSC({});
  const [nutritionPrefs, setNutritionPrefs] = useStateBSC({});
  const [trainingPrefs, setTrainingPrefs] = useStateBSC({});
  const [privacyPrefs, setPrivacyPrefs] = useStateBSC({});
  const [socialLinks, setSocialLinks] = useStateBSC({});
  const [editField, setEditField] = useStateBSC(null);
  const [busy, setBusy] = useStateBSC(false);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [p, np, tp, pp, sl] = await Promise.all([
          window.shapeDb?.getClientProfile?.() ?? {},
          window.shapeDb?.getUserGoals?.('client_nutrition_prefs') ?? {},
          window.shapeDb?.getUserGoals?.('client_training_prefs') ?? {},
          window.shapeDb?.getUserGoals?.('client_privacy_prefs') ?? {},
          window.shapeDb?.getUserGoals?.('client_social_links') ?? {},
        ]);
        if (cancelled) return;
        setProfileData(p || {});
        setNutritionPrefs(np || {});
        setTrainingPrefs(tp || {});
        setPrivacyPrefs(pp || {});
        setSocialLinks(sl || {});
      } catch (e) {
        // shapeDb may be unavailable (signed out); leave demo defaults.
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Persist a section to the backend and update local state.
  const persistSection = async (section, next) => {
    setBusy(true);
    try {
      if (section === 'profile') {
        await window.shapeDb?.saveClientProfile?.(next);
        setProfileData(next);
      } else {
        const kindMap = {
          nutrition: 'client_nutrition_prefs',
          training: 'client_training_prefs',
          privacy: 'client_privacy_prefs',
          social: 'client_social_links',
        };
        await window.shapeDb?.saveUserGoals?.(kindMap[section], next);
        if (section === 'nutrition') setNutritionPrefs(next);
        if (section === 'training') setTrainingPrefs(next);
        if (section === 'privacy') setPrivacyPrefs(next);
        if (section === 'social') setSocialLinks(next);
      }
      window.__bsToast?.('Saved', 'ok');
    } catch (err) {
      window.__bsToast?.(err?.message || 'Save failed', 'err');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (section, key, label, opts = {}) => {
    const blob = section === 'profile' ? profileData
      : section === 'nutrition' ? nutritionPrefs
      : section === 'training' ? trainingPrefs
      : section === 'privacy' ? privacyPrefs
      : section === 'social' ? socialLinks
      : {};
    setEditField({
      section, key, label,
      value: blob[key] ?? opts.defaultValue ?? '',
      type: opts.type || 'text',
      options: opts.options,
      placeholder: opts.placeholder,
      hint: opts.hint,
      onLabel: opts.onLabel,
      offLabel: opts.offLabel,
    });
  };
  const saveEdit = async (val) => {
    if (!editField) return;
    const { section, key } = editField;
    const blob = section === 'profile' ? profileData
      : section === 'nutrition' ? nutritionPrefs
      : section === 'training' ? trainingPrefs
      : section === 'privacy' ? privacyPrefs
      : section === 'social' ? socialLinks
      : {};
    await persistSection(section, { ...blob, [key]: val });
    setEditField(null);
  };

  // Stripe Customer Portal — opens billing UI for card / cancel / invoices.
  const openBillingPortal = async () => {
    try {
      const res = await fetch('/api/stripe/billing-portal', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPath: '/m/' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) {
        window.location.href = data.url;
      } else {
        window.__bsToast?.(data?.error || 'Billing portal unavailable', 'err');
      }
    } catch (err) {
      window.__bsToast?.('Billing portal failed', 'err');
    }
  };

  // Danger-zone actions — Export queues an email; Pause / Delete prompt
  // for confirmation, then call a stub admin endpoint. We don't ship the
  // actual delete server-side without product approval, so we surface a
  // clear "submitted" state instead of silently doing nothing.
  const requestAccountAction = async (action) => {
    const confirms = {
      Export: 'Email a copy of all your data to the address on file?',
      Pause: 'Pause your membership? You keep your data and can resume anytime.',
      Delete: 'Permanently delete your account and all data? This cannot be undone.',
    };
    if (!window.confirm(confirms[action] || `Confirm ${action}?`)) return;
    try {
      await fetch('/api/me/account-action', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).catch(() => null);
      window.__bsToast?.(`${action} request submitted — we’ll email a confirmation.`, 'ok');
      if (action === 'Delete') setTimeout(onLogout, 1500);
    } catch (err) {
      window.__bsToast?.(`${action} failed`, 'err');
    }
  };

  if (showScore) {
    return <BSShapeScorePage profile={scoreProfile} onBack={() => setShowScore(false)} onOpenStore={() => { setShowScore(false); setShowStore(true); }} />;
  }
  if (showStore) {
    return <BSShapeStorePage profile={scoreProfile} onBack={() => setShowStore(false)} onOpenScore={() => { setShowStore(false); setShowScore(true); }} />;
  }
  if (showProgress) {
    return <BSClientProgress onBack={() => setShowProgress(false)} />;
  }
  if (showLeaderboard) {
    return <BSLeaderboard onBack={() => setShowLeaderboard(false)} />;
  }
  if (showLibrary) {
    return <BSClientLibrary onBack={() => setShowLibrary(false)} goMarket={() => { setShowLibrary(false); goMarket(); }} />;
  }
  if (showPublicProfile) {
    const uid = window.ShapeAuth?.getCachedState?.().user?.id || null;
    return <BSPublicProfile
      person={{ who: displayName, init: bsMyInitials(), kind: 'CLIENT', userId: uid }}
      isSelf
      onBack={() => setShowPublicProfile(false)}
      onEdit={() => { setShowPublicProfile(false); try { window.dispatchEvent(new Event('shape:openProfile')); } catch (e) {} }}
    />;
  }
  if (showGoals) {
    return <BSClientGoals onBack={() => setShowGoals(false)} />;
  }
  if (showHabits) {
    return <BSHabitsPage tweaks={tweaks} setTweak={setTweak} accent={t.GREEN} onBack={() => setShowHabits(false)} onOpenScore={() => { setShowHabits(false); setShowScore(true); }} />;
  }
  if (showSessions) {
    return <BSSessionsScreen onBack={() => setShowSessions(false)} />;
  }
  if (showNotifications) {
    return <BSNotifications onBack={() => setShowNotifications(false)} onRoute={(route) => { if (route === 'sessions') { setShowNotifications(false); setShowSessions(true); } }} />;
  }
  if (showContact) {
    return <BSContactPage onBack={() => setShowContact(false)} />;
  }
  if (showTerms) {
    return <BSTermsPage onBack={() => setShowTerms(false)} onContact={() => { setShowTerms(false); setShowContact(true); }} />;
  }
  if (showPrivacy) {
    return <BSPrivacyPage onBack={() => setShowPrivacy(false)} onContact={() => { setShowPrivacy(false); setShowContact(true); }} />;
  }

  const renderRows = (rows) => (
    <div style={{ padding: `0 ${t.padX}px` }}>
      {rows.map((row, i, arr) => (
        <button key={`${row.l}-${i}`} onClick={typeof row.onClick === 'function' ? row.onClick : undefined} disabled={busy} style={{
          borderRadius: 0,
          width: '100%',
          border: 0,
          borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          background: 'transparent',
          color: t.INK,
          cursor: row.onClick ? 'pointer' : 'default',
          padding: `${t.rowY + 4}px 0`,
          display: 'grid',
          gridTemplateColumns: '1fr auto auto',
          alignItems: 'center',
          gap: 10,
          textAlign: 'left',
          opacity: busy ? 0.6 : 1,
        }}>
          <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK, letterSpacing: '-0.01em' }}>{row.l}</span>
          <span style={{
            minWidth: 0,
            maxWidth: 150,
            textAlign: 'right',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            fontFamily: t.DISPLAY,
            fontSize: 13,
            fontWeight: 500,
            color: t.INK70,
          }}>{row.r}</span>
          {row.action && <BSEyebrow color={t.ACCENT}>{row.action}</BSEyebrow>}
        </button>
      ))}
    </div>
  );
  const todayItems = [
    ['17:30', 'Upper push - 5 exercises', 'Jordan Chen'],
    ['19:30', 'Log dinner - protein target 168g', 'Nutrition'],
    ['21:00', 'Mobility - 10 min', 'Recovery'],
  ];
  // Row builders — each row's `r` is the live value (with a fallback) and
  // `onClick` opens the edit sheet for that field. `action` is the right-side
  // verb chip ("Edit" / "Change" / etc).
  const profileRows = [
    { k: 'email', l: 'Email',
      r: profileData.email || authProfile.email || 'Not set',
      type: 'text', placeholder: 'you@example.com' },
    { k: 'phone', l: 'Phone',
      r: profileData.phone || authProfile.phone || 'Not set',
      type: 'text', placeholder: '+1 (555) 555-0100' },
    { k: 'location', l: 'Location',
      r: profileData.location || authProfile.location || 'Not set',
      type: 'text', placeholder: 'City, State' },
    { k: 'birthday', l: 'Birthday',
      r: profileData.birthday || 'Not set',
      type: 'text', placeholder: 'Oct 4, 1993' },
    { k: 'height_weight', l: 'Height / weight',
      r: profileData.height_weight || 'Not set',
      type: 'text', placeholder: t.isMetric ? '168 cm · 78 kg' : '5 ft 6 in · 171 lb',
      action: 'Update' },
  ].map((r) => ({
    l: r.l, r: r.r, action: r.action || 'Edit',
    onClick: () => openEdit('profile', r.k, r.l, { type: r.type, placeholder: r.placeholder }),
  }));

  const billingRows = [
    { l: 'Manage subscriptions', r: 'Stripe portal', action: 'Open', onClick: openBillingPortal },
    { l: 'Update payment method', r: 'Stripe portal', action: 'Open', onClick: openBillingPortal },
    { l: 'View invoices & receipts', r: 'Stripe portal', action: 'Open', onClick: openBillingPortal },
  ];

  const connectedRows = [
    // All connect/disconnect flows live on BSIntegrationsPage (OAuth).
    { l: 'Manage health integrations', r: 'Apple · WHOOP · Strava…', action: 'Open', onClick: onIntegrations },
  ];

  const nutritionRows = [
    { k: 'dietary_style', l: 'Dietary style', type: 'select',
      options: ['Omnivore', 'Vegetarian', 'Vegan', 'Pescatarian', 'Keto', 'Paleo', 'Mediterranean'] },
    { k: 'allergies', l: 'Allergies', type: 'text', placeholder: 'Shellfish, tree nuts…' },
    { k: 'dislikes', l: 'Dislikes', type: 'text', placeholder: 'Cilantro, blue cheese…' },
    { k: 'protein_target_g', l: 'Protein target (g/day)', type: 'number', placeholder: '168' },
    { k: 'calorie_range', l: 'Calorie range', type: 'select',
      options: ['By feel', 'Strict', 'Loose tracking', '1600–1800', '1800–2000', '2000–2200', '2200–2400', '2400+'] },
    { k: 'meal_cadence', l: 'Meal cadence', type: 'text', placeholder: '3 meals + 1 snack' },
    { k: 'kitchen', l: 'Kitchen', type: 'text', placeholder: 'Full kitchen · 30 min' },
    { k: 'supplements', l: 'Supplements', type: 'text', placeholder: 'Creatine, D, omega-3' },
    { k: 'alcohol', l: 'Alcohol', type: 'select', options: ['None', 'Rare', 'Social', 'Weekly', 'Daily'] },
    { k: 'hydration_target_l', l: 'Hydration target (L/day)', type: 'number', placeholder: '3.0' },
  ].map((r) => ({
    l: r.l, r: nutritionPrefs[r.k] || 'Not set', action: 'Edit',
    onClick: () => openEdit('nutrition', r.k, r.l, { type: r.type, placeholder: r.placeholder, options: r.options }),
  }));

  const trainingRows = [
    { k: 'primary_goal', l: 'Primary goal', type: 'select',
      options: ['Strength', 'Hypertrophy', 'Strength + hypertrophy', 'Endurance', 'Fat loss', 'General health'] },
    { k: 'experience', l: 'Experience', type: 'select',
      options: ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'] },
    { k: 'sessions_per_week', l: 'Sessions / week', type: 'select',
      options: ['2', '3', '4', '5', '6'] },
    { k: 'equipment', l: 'Equipment access', type: 'select',
      options: ['Full gym', 'Home gym', 'Bodyweight only', 'Limited (bands + DBs)', 'Full gym + home DBs'] },
    { k: 'injuries', l: 'Injuries & notes', type: 'textarea', placeholder: 'Left shoulder, knee tracking…' },
    { k: 'preferred_times', l: 'Preferred times', type: 'select',
      options: ['Early morning', 'Mornings', 'Midday', 'Evenings', 'Late evenings', 'Variable'] },
  ].map((r) => ({
    l: r.l, r: trainingPrefs[r.k] || 'Not set', action: 'Edit',
    onClick: () => openEdit('training', r.k, r.l, { type: r.type, placeholder: r.placeholder, options: r.options }),
  }));

  const privacyRows = [
    { k: 'profile_visibility', l: 'Profile visibility', type: 'select',
      options: ['Public', 'Community only', 'Coaches only', 'Private'] },
    { k: 'share_data_with_coaches', l: 'Share data with coaches', type: 'select',
      options: ['All metrics', 'Workouts + nutrition', 'Workouts only', 'Nothing'] },
    { k: 'community_posts', l: 'Community posts', type: 'toggle' },
    { k: 'coach_messages', l: 'Coach messages', type: 'select',
      options: ['Push + email', 'Push only', 'Email only', 'Muted'] },
    { k: 'weekly_digest', l: 'Weekly digest', type: 'select',
      options: ['Sunday 8am', 'Sunday 6pm', 'Monday 8am', 'Off'] },
    { k: 'marketing_emails', l: 'Marketing emails', type: 'toggle' },
  ].map((r) => ({
    l: r.l, r: privacyPrefs[r.k] || 'Not set', action: r.type === 'toggle' ? 'Toggle' : 'Change',
    onClick: () => openEdit('privacy', r.k, r.l, { type: r.type, options: r.options }),
  }));

  const socialRows = [
    { k: 'instagram', l: 'Instagram', placeholder: '@handle' },
    { k: 'tiktok', l: 'TikTok', placeholder: '@handle' },
    { k: 'strava', l: 'Strava', placeholder: 'profile url or handle' },
    { k: 'website', l: 'Website', placeholder: 'https://…' },
    { k: 'youtube', l: 'YouTube', placeholder: '@channel' },
    { k: 'twitter', l: 'Twitter / X', placeholder: '@handle' },
  ].map((r) => ({
    l: r.l, r: socialLinks[r.k] || 'Not added',
    action: socialLinks[r.k] ? 'Edit' : 'Add',
    onClick: () => openEdit('social', r.k, r.l, { type: 'text', placeholder: r.placeholder }),
  }));

  return (
    <BSPage>
      <BSPageHeader
        title={<>{firstName}<br/><span style={{ color: t.ACCENT }}>{lastName}.</span></>}
        trailing={<BSFacetAvatar size={34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={onProfile} />}
      />

      {/* SHAPE SCORE — tappable card: ring + category bars */}
      {(() => {
        const cats = [
          { k: 'Train', v: 88 },
          { k: 'Nutrition', v: 74 },
          { k: 'Recovery', v: 62 },
          { k: 'Consistency', v: 92 },
        ];
        const total = scoreProfile.total || 0;
        const goal = scoreProfile.goal || 5000;
        const pct = goal ? Math.min(1, total / goal) : 0;
        const RAD = 34, CIRC = 2 * Math.PI * RAD;
        const tierC = bsTierColor(scoreProfile.tier);
        return (
          <div style={{ padding: `14px ${t.padX}px 4px` }}>
            <button onClick={() => setShowScore(true)} style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', color: t.INK,
              border: `1px solid ${t.RULE}`, borderRadius: 16,
              background: t.PAPER2,
              padding: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Shape Score</div>
                  <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, letterSpacing: '-0.03em', color: tierC, lineHeight: 1 }}>{scoreProfile.tier}<span style={{ marginLeft: 7, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', verticalAlign: '2px' }}>tier</span></div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, marginTop: 6 }}>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 37, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.04em' }}>{total.toLocaleString()}</span>
                    <span style={{ fontFamily: t.DISPLAY, fontSize: 13, color: t.INK50, marginBottom: 4 }}>of {goal.toLocaleString()}</span>
                  </div>
                  <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: tierC, fontWeight: 700 }}>{scoreProfile.week} this week · {(scoreProfile.pointsToNext || 0).toLocaleString()} to {scoreProfile.nextTier}</div>
                </div>
                <svg width="68" height="68" viewBox="0 0 84 84" style={{ flexShrink: 0 }}>
                  <circle cx="42" cy="42" r={RAD} fill="none" stroke={t.HAIR} strokeWidth="6" />
                  <circle cx="42" cy="42" r={RAD} fill="none" stroke={tierC} strokeWidth="6" strokeLinecap="round" strokeDasharray={CIRC} strokeDashoffset={CIRC * (1 - pct)} transform="rotate(-90 42 42)" />
                  <text x="42" y="43" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: t.DISPLAY, fontSize: '17px', fontWeight: 700, fill: t.INK }}>{Math.round(pct * 100)}%</text>
                </svg>
              </div>
              <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {cats.map(c => (
                  <div key={c.k} style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
                    <div style={{ width: 86, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK70, fontWeight: 600 }}>{c.k}</div>
                    <div style={{ flex: 1, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
                      <div style={{ width: `${c.v}%`, height: '100%', background: t.ACCENT, borderRadius: 999 }} />
                    </div>
                    <div style={{ width: 24, textAlign: 'right', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.v}</div>
                  </div>
                ))}
              </div>
            </button>
          </div>
        );
      })()}

      {/* FEATURED GOAL — top goal, tap to open the Goal page */}
      {meGoal && (() => {
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const start = Number(meGoal.start) || 0, now = bsGoalNow(meGoal), target = Number(meGoal.target) || 0;
        const unit = meGoal.unit || 'kg';
        const range = start - target;
        const gp = range > 0 ? Math.max(0, Math.min(1, (start - now) / range)) : Math.min(now / (target || 1), 1);
        const down = +(now - start).toFixed(1), toGo = +(now - target).toFixed(1);
        const byD = meGoal.by ? new Date(meGoal.by) : null;
        const dateLabel = byD && !isNaN(byD) ? byD.toLocaleDateString([], { month: 'short', day: 'numeric' }).toUpperCase() : null;
        const words = String(meGoal.title || 'Your goal').trim().split(/\s+/);
        const last = words.length ? words.pop() : '';
        const head = words.join(' ');
        const meSub = `${down > 0 ? '+' : '−'}${Math.abs(down)} ${unit} so far · ${Math.abs(toGo)} ${unit} to go · on track`;
        return (
          <div style={{ padding: `12px ${t.padX}px 4px` }}>
            <button onClick={() => setShowGoals(true)} style={{
              width: '100%', textAlign: 'left', cursor: 'pointer', color: t.INK,
              border: `1px solid ${teal}44`, borderRadius: 16,
              background: `linear-gradient(150deg, ${teal}1f, ${teal}07 55%, ${t.PAPER2} 92%), ${t.PAPER2}`,
              padding: 14,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>Your goal{dateLabel ? ` · By ${dateLabel}` : ''} ›</span>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{Math.round(gp * 100)}% there</span>
              </div>
              <div style={{ marginTop: 6, fontFamily: t.DISPLAY || `'Newsreader', Georgia, serif`, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.05 }}>{head ? head + ' ' : ''}<span style={{ fontStyle: 'italic', color: teal }}>{last}</span></div>
              <div style={{ marginTop: 11, height: 7, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${gp * 100}%`, background: teal, borderRadius: 999 }} /></div>
              <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.06em', color: t.INK70, fontWeight: 600 }}>{meSub}</div>
            </button>
          </div>
        );
      })()}

      {/* YOUR TEAM / Coaches */}
      <div style={{ padding: `22px ${t.padX}px 4px` }}>
        <BSEyebrow color={t.ACCENT}>Your team</BSEyebrow>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em', marginTop: 2 }}>Coaches</div>
      </div>
      <div style={{ padding: `0 ${t.padX}px` }}>
        {[
          { name: 'Jordan Chen', role: 'Coach · Hypertrophy · SF', d: 'Msg 3' },
          { name: 'Dr. Maya Patel', role: 'Nutritionist · Consult Thu', d: '—' },
        ].map((p, i, arr) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr auto', alignItems: 'center', gap: 12, padding: `${t.rowY + 5}px 0`, borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
            <div style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: t.INK50 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 750, color: t.INK, letterSpacing: '-0.015em' }}>{p.name}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.14em', textTransform: 'uppercase' }}>{p.role}</div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: p.d === '—' ? t.INK50 : t.ACCENT, fontWeight: 700 }}>{p.d}</span>
          </div>
        ))}
      </div>

      {/* SHORTCUTS / Your stuff */}
      <div style={{ padding: `22px ${t.padX}px 4px` }}>
        <BSEyebrow color={t.ACCENT}>Shortcuts</BSEyebrow>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em', marginTop: 2 }}>Your stuff</div>
      </div>
      <div style={{ padding: `0 ${t.padX}px` }}>
        {[
          { l: 'Public profile', s: 'View & edit how others see you', onClick: () => setShowPublicProfile(true) },
          { l: 'Goals', s: 'Training & nutrition targets', onClick: () => setShowGoals(true) },
          { l: 'Library', s: 'Saved workouts, programs & meals', onClick: () => setShowLibrary(true) },
          { l: 'Habits', s: 'To-dos, to-don’ts & streaks', onClick: () => setShowHabits(true) },
          { l: 'Marketplace', s: 'Find coaches, plans, programs', onClick: () => goMarket() },
          { l: 'Shape Store', s: storeLocked ? 'Members only · tap to join' : `${scoreProfile.available.toLocaleString()} pts · tap to redeem`, onClick: () => setShowStore(true), locked: storeLocked },
          { l: 'Progress & PRs', s: 'Weight, recovery, strength trends', onClick: () => setShowProgress(true) },
          { l: 'Notifications', s: 'Requests, confirmations & updates', onClick: () => setShowNotifications(true) },
          { l: 'Connected apps', s: 'Apple Health · Strava · WHOOP', onClick: onIntegrations },
          { l: 'Shape Radio', s: 'Live stations · coach mixes', onClick: () => goRadio() },
          { l: 'App tour', s: 'Replay the quick walkthrough', onClick: () => { try { window.dispatchEvent(new Event('shape:startTour')); } catch (e) {} } },
        ].map((r, i, arr) => (
          <button key={i} onClick={r.onClick} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: 'transparent', border: 0, display: 'grid', gridTemplateColumns: '26px 1fr auto', alignItems: 'center', gap: 12, padding: `${t.rowY + 5}px 0`, borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`, color: t.INK }}>
            <div style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: t.INK50 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 750, color: t.INK, letterSpacing: '-0.015em' }}>{r.l}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 9, color: t.INK50, marginTop: 2, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{r.s}</div>
            </div>
            <span style={{ color: t.INK50, fontSize: 15 }}>{r.locked ? '🔒' : '→'}</span>
          </button>
        ))}
      </div>

      {/* Account, billing, integrations, privacy, legal, and danger-zone
          controls live only in the dedicated Settings screen (open it via the
          profile avatar in the header). */}

      <BSFooter right="Pg 5 of 5" />
      <BSEditSheet field={editField} onSave={saveEdit} onClose={() => setEditField(null)} />
    </BSPage>
  );
}

function BSIntegrationsPage({ onBack }) {
  const t = useBS();
  const [providers, setProviders] = useStateBSC([]);
  const [loading, setLoading] = useStateBSC(true);
  const [busy, setBusy] = useStateBSC('');
  const [summary, setSummary] = useStateBSC(null);
  const [error, setError] = useStateBSC('');

  const loadStatus = async () => {
    setLoading(true);
    setError('');
    try {
      const result = await window.ShapeIntegrations?.getStatus?.();
      setProviders(Array.isArray(result?.providers) ? result.providers : []);
    } catch (err) {
      setError(err?.message || 'Unable to load integrations.');
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    loadStatus();
  }, []);

  const providerMap = providers.reduce((acc, provider) => {
    acc[provider.id] = provider;
    return acc;
  }, {});
  const whoop = providerMap.whoop || { id: 'whoop', label: 'WHOOP', connected: false };
  const strava = providerMap.strava || { id: 'strava', label: 'Strava', connected: false };
  const spotify = providerMap.spotify || { id: 'spotify', label: 'Spotify', connected: false };
  const appleMusic = providerMap.apple_music || { id: 'apple_music', label: 'Apple Music', connected: false };
  const garmin = providerMap.garmin || { id: 'garmin', label: 'Garmin', connected: false };
  const oura = providerMap.oura || { id: 'oura', label: 'Oura', connected: false };
  const appleHealth = providerMap.apple_health || { id: 'apple_health', label: 'Apple Health', connected: false };
  const healthKitNative = !!(window.ShapeIntegrations?.appleHealthAvailable?.());

  const runAction = async (key, label, action) => {
    setBusy(key);
    setError('');
    setSummary(null);
    try {
      const result = await action();
      setSummary({ label, result });
      window.__bsToast?.(label, 'ok');
      await loadStatus();
    } catch (err) {
      const message = err?.message || `${label} failed.`;
      setError(message);
      window.__bsToast?.(message, 'error');
    } finally {
      setBusy('');
    }
  };

  const Button = ({ children, onClick, active = false, disabled = false }) => (
    <button
      onClick={onClick}
      disabled={disabled || Boolean(busy)}
      style={{
        borderRadius: t.RADIUS_SM,
        padding: '12px 10px',
        border: `1px solid ${active ? t.INK : t.RULE}`,
        background: active ? t.INK : 'transparent',
        color: active ? t.PAPER : t.INK,
        fontFamily: t.MONO,
        fontSize: 9.5,
        fontWeight: 800,
        letterSpacing: '0.18em',
        textTransform: 'uppercase',
        cursor: disabled || busy ? 'wait' : 'pointer',
        opacity: disabled ? 0.45 : 1,
      }}
    >
      {children}
    </button>
  );

  const IntegrationCard = ({ id, name, note, status, children, muted = false }) => (
    <div style={{
      padding: `16px ${t.padX}px 18px`,
      borderTop: `2px solid ${t.INK}`,
      borderBottom: `1px solid ${t.RULE}`,
      background: muted ? 'transparent' : t.PAPER2,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14 }}>
        <div>
          <BSEyebrow color={status === 'Connected' ? t.ACCENT : t.INK50}>{id}</BSEyebrow>
          <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, color: t.INK, letterSpacing: '-0.035em', lineHeight: 1 }}>
            {name}
          </div>
          <div style={{ marginTop: 7, maxWidth: 310, fontFamily: t.DISPLAY, fontSize: 13.5, lineHeight: 1.35, fontWeight: 500, color: t.INK70 }}>
            {note}
          </div>
        </div>
        <div style={{
          borderRadius: t.RADIUS_SM,
          padding: '7px 9px',
          border: `1px solid ${status === 'Connected' ? t.ACCENT : t.RULE}`,
          color: status === 'Connected' ? t.ACCENT : t.INK50,
          fontFamily: t.MONO,
          fontSize: 9,
          fontWeight: 800,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          whiteSpace: 'nowrap',
        }}>
          {status}
        </div>
      </div>
      {children}
    </div>
  );

  const statCards = summary?.result?.whoop ? [
    ['Recovery', `${summary.result.whoop.recoveries?.records?.[0]?.score?.recovery_score ?? '-'}%`],
    ['RHR', `${summary.result.whoop.recoveries?.records?.[0]?.score?.resting_heart_rate ?? '-'} bpm`],
    ['Workouts', `${summary.result.whoop.workouts?.records?.length ?? 0}`],
  ] : null;

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Data"
        kicker="Settings · Integrations"
        title={<>Connected<br/>apps.</>}
        trailing={<div style={{ textAlign: 'right' }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 36, lineHeight: 0.9, fontWeight: 700, color: t.INK, letterSpacing: '-0.05em' }}>
            {providers.filter(p => p.connected).length}
          </div>
          <BSEyebrow>Live</BSEyebrow>
        </div>}
      />

      <div style={{ padding: `14px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, lineHeight: 1.4, fontWeight: 500, color: t.INK70 }}>
          Connect health, activity, and music platforms. WHOOP imports default to private, then you choose what gets shared with coaches or the community feed.
        </div>
      </div>

      {error && (
        <div style={{ padding: `12px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, color: t.RUST, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 600 }}>
          {error}
        </div>
      )}

      <BSSection title="WHOOP" meta={loading ? 'Checking' : whoop.connected ? 'Connected' : 'Not connected'} />
      <IntegrationCard
        id="Recovery · Sleep · Strain"
        name="WHOOP"
        status={whoop.connected ? 'Connected' : 'Connect'}
        note="Sync recovery, sleep, body measurements, cycles, and workouts. Imported workouts are private until you share them."
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!whoop.connected} onClick={() => window.ShapeIntegrations?.connectWhoop?.()}>
            {whoop.connected ? 'Reconnect' : 'Connect'}
          </Button>
          <Button disabled={!whoop.connected} onClick={() => runAction('whoop-sync', 'WHOOP synced', () => window.ShapeIntegrations.syncWhoop())}>
            {busy === 'whoop-sync' ? 'Syncing' : 'Sync'}
          </Button>
          <Button disabled={!whoop.connected} onClick={() => runAction('whoop-import', 'WHOOP workouts imported', () => window.ShapeIntegrations.syncWhoop({ importWorkouts: true }))}>
            {busy === 'whoop-import' ? 'Importing' : 'Import workouts'}
          </Button>
          <Button disabled={!whoop.connected} onClick={() => runAction('whoop-disconnect', 'WHOOP disconnected', () => window.ShapeIntegrations.disconnect('whoop'))}>
            Disconnect
          </Button>
        </div>
        {statCards && (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', borderTop: `2px solid ${t.INK}`, borderBottom: `1px solid ${t.RULE}` }}>
            {statCards.map(([label, value], i) => (
              <div key={label} style={{ padding: '10px 8px', borderLeft: i ? `1px solid ${t.RULE}` : 0 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{label}</div>
                <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, letterSpacing: '-0.04em', color: t.INK }}>{value}</div>
              </div>
            ))}
          </div>
        )}
        {summary?.result?.import && (
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.45 }}>
            Imported {summary.result.import.imported} private workouts · {summary.result.import.errors?.length || 0} errors
          </div>
        )}
      </IntegrationCard>

      <BSSection title="Strava" meta={strava.connected ? 'Connected' : 'Ready'} />
      <IntegrationCard
        id="Runs - rides - routes"
        name="Strava"
        status={strava.connected ? 'Connected' : 'Connect'}
        note="Connect Strava activities and map data. Route imports will use the same private-first sharing model as WHOOP."
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!strava.connected} onClick={() => window.ShapeIntegrations?.connectStrava?.()}>
            {strava.connected ? 'Reconnect' : 'Connect'}
          </Button>
          <Button disabled={!strava.connected} onClick={() => runAction('strava-sync', 'Strava synced', () => window.ShapeIntegrations.syncStrava())}>
            {busy === 'strava-sync' ? 'Syncing' : 'Sync'}
          </Button>
          <Button disabled={!strava.connected} onClick={() => runAction('strava-import', 'Strava routes imported', () => window.ShapeIntegrations.syncStrava({ importActivities: true }))}>
            {busy === 'strava-import' ? 'Importing' : 'Import routes'}
          </Button>
          <Button disabled={!strava.connected} onClick={() => runAction('strava-disconnect', 'Strava disconnected', () => window.ShapeIntegrations.disconnect('strava'))}>
            Disconnect
          </Button>
        </div>
        {summary?.result?.import && (
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.45 }}>
            Imported {summary.result.import.imported} private activities - {summary.result.import.errors?.length || 0} errors
          </div>
        )}
      </IntegrationCard>

      <BSSection title="Spotify" meta={spotify.connected ? 'Connected' : 'Ready'} />
      <IntegrationCard
        id="Music · Playlists"
        name="Spotify"
        status={spotify.connected ? 'Connected' : 'Connect'}
        note="Pick workout playlists from your Spotify library and attach them to programs. Streams in Shape Radio and the workout player."
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!spotify.connected} onClick={() => window.ShapeIntegrations?.connectSpotify?.()}>
            {spotify.connected ? 'Reconnect' : 'Connect'}
          </Button>
          <Button disabled={!spotify.connected} onClick={() => runAction('spotify-disconnect', 'Spotify disconnected', () => window.ShapeIntegrations.disconnect('spotify'))}>
            Disconnect
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Apple Music" meta={appleMusic.connected ? 'Connected' : 'Ready'} />
      <IntegrationCard
        id="MusicKit library"
        name="Apple Music"
        status={appleMusic.connected ? 'Connected' : 'Connect'}
        note="Authorize Apple Music with MusicKit to use your library for workout playlists. You grant access right here — no redirect."
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!appleMusic.connected} onClick={() => runAction('apple-connect', appleMusic.connected ? 'Apple Music reconnected' : 'Apple Music connected', () => window.ShapeIntegrations.connectAppleMusic())}>
            {busy === 'apple-connect' ? 'Authorizing' : (appleMusic.connected ? 'Reconnect' : 'Connect')}
          </Button>
          <Button disabled={!appleMusic.connected} onClick={() => runAction('apple-disconnect', 'Apple Music disconnected', () => window.ShapeIntegrations.disconnectAppleMusic())}>
            Disconnect
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Instacart" meta="Grocery hand-off" />
      <IntegrationCard
        id="Groceries"
        name="Instacart"
        status="Ready"
        note="Send your coach-built grocery list to Instacart and open a pre-filled cart. While Instacart access is pending, the list is copied to your clipboard instead."
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr', gap: 8 }}>
          <Button onClick={async () => { setBusy('instacart-send'); setError(''); try { await window.ShapeIntegrations.sendGroceryToInstacart(); } catch (e) { const m = e?.message || 'Could not build grocery list.'; setError(m); window.__bsToast?.(m, 'error'); } finally { setBusy(''); } }}>
            {busy === 'instacart-send' ? 'Building list' : 'Send grocery list to Instacart →'}
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Garmin" meta={garmin.connected ? 'Connected' : 'Ready'} />
      <IntegrationCard
        id="Activities · HR · Sleep"
        name="Garmin"
        status={garmin.connected ? 'Connected' : 'Connect'}
        note="Pull Garmin Connect activities, heart rate, and sleep into your profile. Requires Garmin Health API approval on the developer account."
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!garmin.connected} onClick={() => window.ShapeIntegrations?.connectProvider?.('garmin')}>
            {garmin.connected ? 'Reconnect' : 'Connect'}
          </Button>
          <Button disabled={!garmin.connected} onClick={() => runAction('garmin-disconnect', 'Garmin disconnected', () => window.ShapeIntegrations.disconnect('garmin'))}>
            Disconnect
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Oura" meta={oura.connected ? 'Connected' : 'Ready'} />
      <IntegrationCard
        id="Sleep · Readiness · HR"
        name="Oura"
        status={oura.connected ? 'Connected' : 'Connect'}
        note="Sync Oura Ring sleep, readiness, and heart-rate data into your daily health snapshot. Workouts import privately, like WHOOP."
      >
        <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <Button active={!oura.connected} onClick={() => window.ShapeIntegrations?.connectProvider?.('oura')}>
            {oura.connected ? 'Reconnect' : 'Connect'}
          </Button>
          <Button disabled={!oura.connected} onClick={() => runAction('oura-sync', 'Oura synced', () => window.ShapeIntegrations.syncOura())}>
            {busy === 'oura-sync' ? 'Syncing' : 'Sync'}
          </Button>
          <Button disabled={!oura.connected} onClick={() => runAction('oura-import', 'Oura workouts imported', () => window.ShapeIntegrations.syncOura({ importWorkouts: true }))}>
            {busy === 'oura-import' ? 'Importing' : 'Import workouts'}
          </Button>
          <Button disabled={!oura.connected} onClick={() => runAction('oura-disconnect', 'Oura disconnected', () => window.ShapeIntegrations.disconnect('oura'))}>
            Disconnect
          </Button>
        </div>
      </IntegrationCard>

      <BSSection title="Apple Health" meta={appleHealth.connected ? 'Connected' : (healthKitNative ? 'Ready' : 'iOS app')} />
      <IntegrationCard
        id="Apple Watch · Health"
        name="Apple Health"
        status={appleHealth.connected ? 'Connected' : (healthKitNative ? 'Connect' : 'iOS app')}
        note={healthKitNative
          ? 'Read steps, heart rate, HRV, resting HR, sleep, active energy, and workouts from Apple Health (including your Apple Watch) into your daily snapshot.'
          : 'Apple Health (and Apple Watch) data is only available in the Shape iOS app. Open Shape on your iPhone to connect.'}
      >
        {healthKitNative ? (
          <div style={{ marginTop: 14, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <Button active={!appleHealth.connected} onClick={() => runAction('apple-health-connect', appleHealth.connected ? 'Apple Health synced' : 'Apple Health connected', () => window.ShapeIntegrations.syncAppleHealth())}>
              {busy === 'apple-health-connect' ? 'Authorizing' : (appleHealth.connected ? 'Sync now' : 'Connect')}
            </Button>
            <Button disabled={!appleHealth.connected} onClick={() => runAction('apple-health-disconnect', 'Apple Health disconnected', () => window.ShapeIntegrations.disconnect('apple_health'))}>
              Disconnect
            </Button>
          </div>
        ) : null}
      </IntegrationCard>

      <BSFooter right="Integrations" />
    </BSPage>
  );
}

const _BS_SCORE_CATEGORY_LABELS = {
  workouts: 'Workout logged',
  adherence: 'Plan adherence',
  habits: 'Habit completed',
  prs: 'PR hit',
  community: 'Community',
  endorsements: 'Coach endorsement',
  radio: 'Radio participation',
  referrals: 'Referral',
  other: 'Points',
};
const _BS_SCORE_MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
function _bsFormatScoreDate(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return `${_BS_SCORE_MON[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

// Merge the signed-in member's live Shape Score (from /api/client/score, which
// now reflects habit completions and every other logged point) onto the static
// role profile. The point-value catalog + reward tiers stay static — they're
// program rules, not user data — while the headline total, tier, weekly gain,
// and recent ledger go live. Signed out, the static profile passes through.
function _bsUseLiveScore(profile) {
  // Coaches show the same live points under the coach tier ladder (scheme J).
  const _coach = bsIsCoachRole(profile && profile.roleLabel);
  const _tierName = (n) => (_coach ? bsCoachTier(n) : n);
  const loggedIn = !!(typeof window !== 'undefined' && window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user);
  const [data, setData] = useStateBSC(null);
  React.useEffect(() => {
    if (!loggedIn) return undefined;
    let cancelled = false;
    fetch('/api/client/score', { credentials: 'same-origin' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d && typeof d.points_total === 'number') { setData(d); try { window.ShapeScore = { points: d.points_total || 0, tier: _tierName(d.current_tier ? d.current_tier.name : 'Base') }; } catch (e) {} } })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [loggedIn]);

  if (!loggedIn || !data) return { ...profile, live: false };

  const total = data.points_total || 0;
  const nextTier = data.next_tier || null;
  const ledger = (data.recent || []).slice(0, 12).map(r => [
    _bsFormatScoreDate(r.earned_at),
    `${r.delta > 0 ? '+' : ''}${r.delta}`,
    r.note || _BS_SCORE_CATEGORY_LABELS[r.category] || 'Points',
  ]);
  return {
    ...profile,
    live: true,
    total,
    goal: nextTier ? nextTier.threshold : Math.max(total, profile.goal || total),
    tier: _tierName(data.current_tier ? data.current_tier.name : profile.tier),
    nextTier: nextTier ? _tierName(nextTier.name) : 'Top tier',
    pointsToNext: data.points_to_next || 0,
    week: `${(data.week_gain || 0) >= 0 ? '+' : ''}${data.week_gain || 0}`,
    month: data.points_month || 0,
    available: total,
    ledger: ledger.length ? ledger : [['—', '+0', 'Start earning — log a workout or check off a habit']],
  };
}

function BSShapeScorePage({ onBack, onOpenStore, profile = SHAPE_SCORE_PROFILES.client }) {
  const t = useBS();
  profile = _bsUseLiveScore(profile);
  const scoreTotal = profile.total;
  const scoreGoal = profile.goal;
  const streak = profile.streak;
  const tier = profile.tier;
  const nextTier = profile.nextTier;
  const pointsToNext = profile.pointsToNext;
  const available = profile.available;
  const activities = profile.activities || SHAPE_SCORE_PROFILES.client.activities;
  const tiers = bsIsCoachRole(profile.roleLabel) ? SHAPE_SCORE_TIERS_COACH : SHAPE_SCORE_TIERS;
  const ledger = profile.ledger || SHAPE_SCORE_PROFILES.client.ledger;
  const rewards = [
    ['$25 session credit', 'Use with any coach', '500 pts'],
    ['Coach intro - 2nd opinion', 'Free 30-min with any trainer', '900 pts'],
    ['Nutrition plan refresh', 'Full plan rebuild with your RD', '1,200 pts'],
    ['Shape merch - 20% off', 'In-house apparel and essentials', '400 pts'],
    ['Annual membership credit', '$200 toward next year', '3,500 pts'],
  ];

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Your standing"
        title={<>Shape<br/><span style={{ fontStyle: 'italic', color: bsTierColor(tier) }}>Score.</span></>}
      />

      {/* Composite hero — ring (progress to goal) + tier + this-week, above the tiers */}
      {(() => {
        const tc = bsTierColor(tier);
        const pct = scoreGoal ? Math.min(100, Math.round((scoreTotal / scoreGoal) * 100)) : Math.min(100, scoreTotal);
        const weekTxt = profile.week != null && String(profile.week) !== '' ? String(profile.week) : '+0';
        const topTier = profile.nextTier === 'Top tier';
        const teal = t.isLight ? '#0a8f87' : '#34d6c5';
        const stats = [
          ['This week', weekTxt],
          ['Streak', `${streak}d`],
          topTier ? ['Tier', 'Top'] : [`To ${nextTier}`, pointsToNext.toLocaleString()],
        ];
        return (
          <div style={{ padding: `8px ${t.padX}px 0` }}>
            <div style={{ borderRadius: 16, border: `1px solid ${tc}55`, background: `radial-gradient(130% 120% at 72% 18%, ${tc}24, transparent 55%), ${t.PAPER2}`, padding: 13 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 13 }}>
                <div style={{ width: 86, height: 86, borderRadius: 999, flexShrink: 0, background: `conic-gradient(${tc} ${pct * 3.6}deg, ${t.HAIR} 0deg)`, display: 'grid', placeItems: 'center' }}>
                  <div style={{ width: 68, height: 68, borderRadius: 999, background: t.isLight ? t.PAPER : '#16140f', display: 'grid', placeItems: 'center' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'center', gap: 1 }}>
                        <span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: t.INK, letterSpacing: '-0.04em', lineHeight: 1 }}>{pct}</span>
                        <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, color: t.INK50 }}>%</span>
                      </div>
                      <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 6.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>to goal</div>
                    </div>
                  </div>
                </div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, fontStyle: 'italic', color: tc, letterSpacing: '-0.02em', lineHeight: 1 }}>{tier}.</div>
                  <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', color: teal }}>{scoreTotal.toLocaleString()} pts · {weekTxt} this week</div>
                  <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 12.5, color: t.INK70, lineHeight: 1.35 }}>Your composite of training, nutrition, recovery, and consistency.</div>
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', marginTop: 11, paddingTop: 10, borderTop: `1px solid ${t.HAIR}` }}>
                {stats.map(([label, value], i) => (
                  <div key={label} style={{ textAlign: 'center', borderLeft: i ? `1px solid ${t.HAIR}` : 0 }}>
                    <div style={{ fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{label}</div>
                    <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1 }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      <BSSection title="Reward tiers" meta="5 tiers" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
        {tiers.map((tier, i) => {
          const tc = bsTierColor(tier.name);
          const current = String(profile.tier || '').toLowerCase() === tier.name.toLowerCase();
          return (
            <div key={tier.name} style={{
              display: 'grid', gridTemplateColumns: '88px 1fr', gap: 12,
              padding: '13px 0', borderBottom: i === tiers.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            }}>
              <div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>PTS</div>
                <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.08em', color: t.INK, fontWeight: 700 }}>{tier.range}</div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ width: 8, height: 8, borderRadius: 999, background: tc, flexShrink: 0 }} />
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: tc, letterSpacing: '-0.015em' }}>{tier.name}</span>
                  {current ? <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: tc }}>· you</span> : null}
                </div>
                <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{tier.perk}</div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      {/* Rewards header — "Spend your points" centered, teal, and tappable
          straight to the Shape Store where points are redeemed. */}
      <div style={{ padding: `${t.sectGap}px ${t.padX}px 10px`, display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'baseline', gap: 8 }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: t.DISPLAY, fontWeight: 700, fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK }}>▍ Rewards</span>
        <button onClick={onOpenStore} style={{ justifySelf: 'center', background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.isLight ? '#0a8f87' : '#34d6c5' }}>Spend your points →</button>
        <span style={{ justifySelf: 'end', fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{available.toLocaleString()} available</span>
      </div>
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
        {rewards.map(([title, sub, cost], i) => (
          <div key={title} onClick={title.includes('Store') ? onOpenStore : undefined} style={{
            display: 'grid', gridTemplateColumns: '1fr 74px', gap: 12,
            padding: '13px 0', borderBottom: i === rewards.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            cursor: title.includes('Store') ? 'pointer' : 'default',
          }}>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em' }}>{title}</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{sub}</div>
            </div>
            <div style={{ alignSelf: 'center', textAlign: 'right', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.08em', color: t.ACCENT }}>{cost}</div>
          </div>
        ))}
        </div>
      </div>

      <BSSection title="Point values" kicker={`${profile.roleLabel || 'Member'} activity`} meta={`${activities.length} ways`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
        {activities.map((a, i) => (
          <div key={a.name} style={{
            display: 'grid', gridTemplateColumns: '1fr 52px', gap: 12,
            padding: '13px 0', borderBottom: i === activities.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 14.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{a.name}</div>
              <div style={{ marginTop: 3, display: 'flex', gap: 8, flexWrap: 'wrap', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>
                <span>{a.cap}</span>
                <span>-</span>
                <span>{a.note}</span>
              </div>
            </div>
            <div style={{ alignSelf: 'center', textAlign: 'right', fontFamily: t.MONO, fontSize: 12, fontWeight: 800, letterSpacing: '0.08em', color: t.ACCENT }}>{a.pts}</div>
          </div>
        ))}
        </div>
      </div>

      <BSSection title="Recent points" kicker="Ledger" />
      <div style={{ padding: `0 ${t.padX}px 8px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
        {ledger.map(([day, pts, label], i) => (
          <div key={`${day}-${label}`} style={{
            display: 'grid', gridTemplateColumns: '62px 1fr 52px', alignItems: 'center', gap: 10,
            padding: '13px 0', borderBottom: i === ledger.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <BSEyebrow>{day}</BSEyebrow>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, fontWeight: 600, letterSpacing: '-0.01em' }}>{label}</div>
            <div style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 800, textAlign: 'right', color: t.GREEN }}>{pts}</div>
          </div>
        ))}
        </div>
      </div>

      <BSFooter right="Rewards" />
    </BSPage>
  );
}

function BSShapeStorePage({ onBack, onOpenScore, profile = SHAPE_SCORE_PROFILES.client }) {
  const t = useBS();
  const balance = profile.available;
  const lifetime = profile.lifetime;
  const redeemedCount = profile.redeemedCount;
  const categories = ['All', 'Shape Merch', 'Training', 'Nutrition', 'Shape Perks'];
  const [cat, setCat] = useStateBSC('All');
  const [affordable, setAffordable] = useStateBSC(false);
  // Membership gate — the Shape Store (redeeming points for gear/rewards) is a
  // Shape member perk. Coaches (providers) and active members get in; free or
  // signed-out users see an upgrade prompt instead of the catalogue.
  const memberGate = useBSMembership();
  const products = [
    { cat: 'Shape Merch', name: 'Shape Training Tee', brand: 'Shape Merch', cost: 450, retail: 48, tag: 'New', stock: 'In stock' },
    { cat: 'Shape Merch', name: 'Shape Crewneck', brand: 'Shape Merch', cost: 720, retail: 72, tag: 'Members', stock: 'In stock' },
    { cat: 'Shape Merch', name: 'Shape Training Bottle', brand: 'Shape Merch', cost: 280, retail: 28, stock: 'In stock' },
    { cat: 'Shape Merch', name: 'Shape Gym Towel', brand: 'Shape Merch', cost: 220, retail: 22, stock: 'In stock' },
    { cat: 'Shape Merch', name: 'Shape Training Duffel', brand: 'Shape Merch', cost: 1640, retail: 165, tag: 'Peak tier', stock: 'In stock', locked: true },
    { cat: 'Training', name: '$25 session credit', brand: 'Any Shape coach', cost: 500, retail: 25, stock: 'Unlimited' },
    { cat: 'Training', name: '$50 session credit', brand: 'Any Shape coach', cost: 950, retail: 50, stock: 'Unlimited' },
    { cat: 'Training', name: 'Coach 2nd-opinion', brand: 'Free 30-min trainer intro', cost: 900, retail: 95, stock: 'Monthly' },
    { cat: 'Training', name: 'Program review credit', brand: 'Shape trainer review', cost: 780, retail: 85, stock: 'Unlimited' },
    { cat: 'Nutrition', name: 'Meal-plan Refresh', brand: 'With your Shape RD', cost: 1200, retail: 140, tag: 'Popular', stock: 'Unlimited' },
    { cat: 'Nutrition', name: '$25 nutrition credit', brand: 'Any Shape nutritionist', cost: 500, retail: 25, stock: 'Unlimited' },
    { cat: 'Nutrition', name: 'Grocery list buildout', brand: 'Shape nutrition service', cost: 420, retail: 45, stock: 'Unlimited' },
    { cat: 'Nutrition', name: 'Recipe archive pack', brand: 'Shape nutrition templates', cost: 340, retail: 35, stock: 'Unlimited' },
    { cat: 'Shape Perks', name: 'Annual membership credit', brand: '$200 toward next year', cost: 3500, retail: 200, tag: 'Peak tier', stock: 'Unlimited', locked: true },
  ];
  const unlocked = [
    ['SHAPE-TEE-48F2', 'Shape Training Tee', 'Jun 30', 450],
    ['NUTRI-PLAN-04F1', 'Grocery list buildout', 'May 21', 420],
  ];
  const visible = products.filter(p => {
    if (cat !== 'All' && p.cat !== cat) return false;
    if (affordable && (p.locked || p.cost > balance)) return false;
    return true;
  });
  const storeHeroMuted = t.isLight ? 'rgba(242,237,228,0.74)' : 'rgba(15,14,12,0.72)';
  const storeHeroFaint = t.isLight ? 'rgba(242,237,228,0.55)' : 'rgba(15,14,12,0.58)';
  const storeHeroRule = t.isLight ? 'rgba(242,237,228,0.16)' : 'rgba(15,14,12,0.16)';
  const storeHeroHair = t.isLight ? 'rgba(242,237,228,0.12)' : 'rgba(15,14,12,0.12)';

  // While we resolve membership, hold the catalogue (so non-members never see it).
  if (memberGate.loading) {
    return (
      <BSPage>
        <BSDetailHeader onBack={onBack} eyebrow="Store" kicker="Shape Store" title={<>Spend<br/>points.</>} />
        <div style={{ padding: `34px ${t.padX}px`, textAlign: 'center', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50 }}>Loading…</div>
      </BSPage>
    );
  }
  // Locked — not a Shape member: show the upgrade prompt instead of the store.
  if (!memberGate.allowed) {
    return (
      <BSPage>
        <BSDetailHeader onBack={onBack} eyebrow="Store" kicker="Shape Store" title={<>Members<br/>only.</>} />
        <div style={{ padding: `8px ${t.padX}px 0` }}>
          <div style={{ borderRadius: 18, border: `1px solid ${t.AMBER}55`, background: `linear-gradient(150deg, ${t.AMBER}22, ${t.PAPER2} 80%), ${t.PAPER2}`, padding: 20, textAlign: 'center' }}>
            <div style={{ fontSize: 34, lineHeight: 1 }}>🔒</div>
            <div style={{ marginTop: 12, fontFamily: t.DISPLAY, fontSize: 23, fontWeight: 700, letterSpacing: '-0.02em', color: t.INK, lineHeight: 1.05 }}>The Shape Store is a <span style={{ fontStyle: 'italic', color: t.AMBER }}>member perk.</span></div>
            <div style={{ marginTop: 9, fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK70, lineHeight: 1.5 }}>Become a Shape member to redeem your points for gear, credits and rewards — plus Shape Radio, the community, and the marketplace.</div>
            <button onClick={bsStartPlatformCheckout} style={{ marginTop: 18, width: '100%', padding: '14px', borderRadius: 999, border: 0, background: t.INK, color: t.PAPER, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>{memberGate.signedIn ? 'Activate membership · $5/mo →' : 'Join Shape · $5/mo →'}</button>
            <button onClick={onBack} style={{ marginTop: 10, width: '100%', padding: '12px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: 'pointer' }}>Not now</button>
          </div>
          <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>You still earn points — redeem them once you’re a member.</div>
        </div>
      </BSPage>
    );
  }

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Store"
        kicker="Shape Store"
        title={<>Spend<br/>points.</>}
        trailing={<button onClick={onOpenScore} style={{ borderRadius: t.RADIUS_SM,
          border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
          padding: '8px 10px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 700,
        }}>Score</button>}
      />

      <div style={{ margin: `10px ${t.padX}px`, padding: '11px 14px', borderRadius: 14, background: t.INK, color: t.PAPER }}>
        <BSEyebrow color={t.ACCENT}>Available balance</BSEyebrow>
        <div style={{ marginTop: 3, display: 'flex', alignItems: 'baseline', gap: 6 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 31, fontWeight: 700, lineHeight: 0.9, letterSpacing: '-0.05em' }}>{balance.toLocaleString()}</div>
          <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: storeHeroFaint }}>pts</div>
        </div>
        <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 11.5, lineHeight: 1.28, color: storeHeroMuted, letterSpacing: '-0.01em' }}>
          Trade Shape Score for Shape merch, training credits, nutrition services, and membership perks. No expiry on points.
        </div>
        <div style={{ marginTop: 9, paddingTop: 8, display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', borderTop: `1px solid ${storeHeroRule}` }}>
          {[[lifetime.toLocaleString(), 'Lifetime earned'], [redeemedCount, 'Items redeemed'], [profile.tier, 'Current tier']].map(([value, label], i) => (
            <div key={label} style={{ padding: '0 8px', borderLeft: i ? `1px solid ${storeHeroHair}` : 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.PAPER, letterSpacing: '-0.035em' }}>{value}</div>
              <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 7.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: storeHeroFaint }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{
        padding: `10px ${t.padX}px 4px`,
        display: 'grid',
        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
        gap: 6,
      }}>
        {categories.map(c => (
          <button key={c} onClick={() => setCat(c)} style={{ borderRadius: t.RADIUS_SM,
            minWidth: 0,
            padding: '8px 6px',
            border: `1px solid ${cat === c ? t.INK : t.RULE}`,
            background: cat === c ? t.INK : 'transparent',
            color: cat === c ? t.PAPER : t.INK,
            fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
            whiteSpace: 'normal',
            lineHeight: 1.15,
          }}>{c}</button>
        ))}
        <button onClick={() => setAffordable(!affordable)} style={{ borderRadius: t.RADIUS_SM,
          minWidth: 0,
          padding: '8px 6px',
          border: `1px solid ${affordable ? t.ACCENT : t.RULE}`,
          background: affordable ? t.ACCENT : 'transparent',
          color: affordable ? t.PAPER : t.INK,
          fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 700,
          whiteSpace: 'normal',
          lineHeight: 1.15,
        }}>Within balance</button>
      </div>

      <BSSection title="Catalog" kicker={cat} meta={`${visible.length} items`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
        {visible.map((p, i) => {
          const canAfford = !p.locked && p.cost <= balance;
          return (
            <div key={`${p.cat}-${p.name}`} style={{
              padding: '13px 0', borderBottom: i === visible.length - 1 ? 0 : `1px solid ${t.HAIR}`,
              display: 'grid', gridTemplateColumns: '1fr 76px', gap: 12,
              opacity: p.locked ? 0.62 : 1,
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{p.name}</div>
                  {p.tag && <BSTag color={p.locked ? t.RUST : t.ACCENT}>{p.tag}</BSTag>}
                </div>
                <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>
                  {p.brand} - {p.stock} - ~${p.retail} retail
                </div>
              </div>
              <div style={{ textAlign: 'right', alignSelf: 'center' }}>
                <div style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 800, color: canAfford ? t.ACCENT : t.INK50 }}>{p.cost.toLocaleString()} pts</div>
                <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: canAfford ? t.GREEN : t.INK50 }}>
                  {p.locked ? 'Tier locked' : canAfford ? 'Redeem' : `+${(p.cost - balance).toLocaleString()}`}
                </div>
              </div>
            </div>
          );
        })}
        </div>
      </div>

      <BSSection title="Unlocked" kicker="Codes" />
      <div style={{ padding: `0 ${t.padX}px 8px` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: '2px 14px' }}>
        {unlocked.map(([code, name, expires, cost], i) => (
          <div key={code} style={{
            padding: '13px 0', borderBottom: i === unlocked.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            display: 'grid', gridTemplateColumns: '1fr 72px', gap: 10,
          }}>
            <div>
              <div style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', color: t.ACCENT }}>{code}</div>
              <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK }}>{name}</div>
            </div>
            <div style={{ textAlign: 'right', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50 }}>
              {cost} pts<br/>Exp {expires}
            </div>
          </div>
        ))}
        </div>
      </div>

      <BSFooter right="Store" />
    </BSPage>
  );
}

Object.assign(window, {
  BSClientApp,
  BSShapeScorePage,
  BSShapeStorePage,
  BSPublicProfile,
  BSFacetAvatar,
  bsAmLive,
  SHAPE_SCORE_PROFILES,
  _bsUseLiveScore,
  bsTierColor,
  bsCoachTier,
  bsIsCoachRole,
  bsMyName,
  bsMyInitials,
  bsMyTierColor,
});

// ═══════════════════════════════════════════════════════════
// SHARED: detail page back-header
// ═══════════════════════════════════════════════════════════
function BSDetailHeader({ onBack, eyebrow, kicker, title, trailing, noCorner = false }) {
  const t = useBS();
  return (
    <div style={{ padding: '64px 18px 14px', background: t.PAPER, position: 'sticky', top: 0, zIndex: 2 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
        <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
          background: 'transparent', border: 0, cursor: 'pointer', padding: 0,
          fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 700,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}>← Back</button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          {eyebrow && <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{eyebrow}</span>}
          {!noCorner && <BSMeCorner size={28} />}
        </div>
      </div>
      {kicker && <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.ACCENT, fontWeight: 700, marginBottom: 8 }}>{kicker}</div>}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 30, lineHeight: 0.96, fontWeight: 700, letterSpacing: '-0.035em', color: t.INK }}>{title}</div>
        {trailing}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PREVIEW — read-only session breakdown (before commit)
// ═══════════════════════════════════════════════════════════
const _bsCueLibrary = {
  'Pull-up':         'Dead hang at the bottom · chest to bar · 3-sec eccentric.',
  'Barbell row':     'Hip-hinge 45° · pull to lower ribs · pause 1 count.',
  'Chest-sup. row':  'Squeeze the bench, drive the elbows back · no momentum.',
  'Face pull':       'High elbows, external rotation at the end · light load.',
  'Incline curl':    'Stretch the biceps · don\'t swing · forearms vertical at top.',
  'Farmer carry':    'Tall posture · ribs stacked · breathe through the nose.',
  'Back squat':      'Brace before unrack · knees track toes · drive hips up.',
  'Walking lunge':   'Long step · back knee ½ inch off floor · push off front heel.',
  'Hack squat':      'Feet low, knees forward · 3-sec down · full range.',
  'Leg ext.':        'Pause at the top · slow 2-sec eccentric · don\'t lock out hard.',
  'Standing calf':   'Full plantarflexion · 1 count at top · stretch at bottom.',
  'Bench press':     'Set the back, set the feet · bar to lower chest · drive feet.',
  'Overhead press':  'Glutes tight · ribs down · bar overhead, biceps to ears.',
  'Incline DB press':'45° bench · DBs over chest · neutral grip if shoulder is cranky.',
  'Cable fly':       'Slight bend in elbows · stretch at the bottom · squeeze at top.',
  'Triceps push':    'Elbows pinned · forearms vertical at top · full lockout.',
  'Easy walk':       'Conversational pace · zone 2 · nasal breathing if you can.',
  '90/90 hip rotation': 'Slow & controlled · external + internal rotation each side.',
  'Cat-cow':         'Move from the spine, not the hips · 3-sec each direction.',
  'Couch stretch':   'Square the hips · ribs down · breathe into the front of the leg.',
  'Ankle dorsiflexion': 'Knee over toes, heel down · use a wall for balance.',
  'Deadlift':        'Bar mid-foot · take slack out · drive floor away with heels.',
  'Romanian DL':     'Hinge, don\'t squat · slight knee bend · feel the hamstrings.',
  'Hip thrust':      'Chin tucked · ribs down · pause 1 count at top.',
  'Leg curl':        'Slow eccentric · point toes if you want more hamstring.',
  'Reverse hyper':   'Squeeze glutes, don\'t hyperextend · slow 2-sec down.',
  'Warm-up':         'Easy zone 2 · raise heart rate, mobilize joints, no fatigue.',
  'Threshold rep':   'Hard but not max · should hate every 4th minute.',
  'Recovery jog':    'Conversational pace · let the breath settle.',
  'Cool-down':       '5 minutes easy · don\'t skip — finish what you started.',
};

function BSWorkoutPreview({ program, onBack, onStart }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const isRest = program.tag === 'REST';

  // Synthesize a quick "block" view: warmup → main → cooldown buckets.
  const blocks = isRest
    ? [{ name: 'Recovery', moves: program.moves }]
    : [
        { name: 'Warm-up',  moves: [], note: '5–8 min: light mobility, raise core temp, prime CNS.' },
        { name: 'Main set', moves: program.moves },
        { name: 'Cool-down', moves: [], note: '3–5 min: easy walk, breathe through the nose, stretch the worked muscles.' },
      ];

  // Aggregate stats
  const totalReps = program.moves.reduce((s, m) => {
    const repMatch = String(m.s).match(/(\d+)\s*×\s*(\d+)/);
    if (!repMatch) return s;
    return s + (Number(repMatch[1]) * Number(repMatch[2]));
  }, 0);

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Preview · Read-only"
        title={program.headline}
      />

      {/* Hero strip */}
      <div style={{ padding: `0 ${t.padX}px` }}>
        <BSHalftone height={140} accent={program.accent} pattern="dots" />
      </div>

      {/* Stats bar */}
      <div style={{
        display: 'grid', gridTemplateColumns: `repeat(${isRest ? 2 : 4}, 1fr)`,
        padding: `18px ${t.padX}px 14px`, borderBottom: `1px solid ${t.RULE}`,
        borderTop: `2px solid ${t.INK}`, marginTop: 18,
      }}>
        {[
          { l: 'Tag',  v: program.tag },
          { l: 'Time', v: program.meta.split('·')[0].trim() },
          ...(isRest ? [] : [
            { l: 'RPE',  v: (program.meta.split('·')[1] || '').trim() },
            { l: 'Reps', v: totalReps > 0 ? totalReps.toString() : '—' },
          ]),
        ].map((s, i) => (
          <div key={i} style={{ borderLeft: i > 0 ? `1px solid ${t.RULE}` : 0, paddingLeft: i > 0 ? 10 : 0 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', color: t.INK50, textTransform: 'uppercase' }}>{s.l}</div>
            <div style={{ fontFamily: t.DISPLAY, fontWeight: t.W.display, fontSize: 22, color: t.INK, marginTop: 4, letterSpacing: '-0.03em', lineHeight: 1 }}>{s.v}</div>
          </div>
        ))}
      </div>

      {/* Brief */}
      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>The brief</BSEyebrow>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontSize: 16, lineHeight: 1.4, color: t.INK, fontWeight: 500, letterSpacing: '-0.005em' }}>
          {program.copy}
        </div>
      </div>

      {/* Blocks */}
      {blocks.map((bk, bi) => (
        <React.Fragment key={bi}>
          <BSSection title={bk.name} meta={bk.moves.length > 0 ? `${bk.moves.length} move${bk.moves.length === 1 ? '' : 's'}` : 'Auxiliary'} />
          {bk.note && (
            <div style={{ padding: `0 ${t.padX}px 12px` }}>
              <div style={{
                fontFamily: t.DISPLAY, fontSize: 13, color: t.INK70, lineHeight: 1.4,
                borderLeft: `2px solid ${t.INK}`, paddingLeft: 10,
              }}>{bk.note}</div>
            </div>
          )}
          {bk.moves.length > 0 && (
            <div style={{ padding: `0 ${t.padX}px` }}>
              <div style={{ borderTop: `2px solid ${t.INK}` }}>
                {bk.moves.map((m, i) => {
                  const cue = m.cue || _bsCueLibrary[m.m];
                  return (
                    <div key={i} style={{ padding: '14px 0', borderBottom: i === bk.moves.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
                        <span style={{ fontFamily: t.MONO, fontSize: 11, color: t.INK50, fontWeight: 600, width: 24 }}>{m.n}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, color: t.INK, fontWeight: 700, letterSpacing: '-0.015em' }}>{m.m}</div>
                          <div style={{ fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, marginTop: 3, letterSpacing: '0.06em' }}>{m.s} · {m.l}</div>
                          {cue && (
                            <div style={{ marginTop: 8, padding: '8px 10px', background: t.PAPER2, borderLeft: `2px solid ${program.accent}`,
                              fontFamily: t.DISPLAY, fontSize: 13, color: t.INK85, lineHeight: 1.35, fontStyle: 'italic',
                            }}>“{cue}”</div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </React.Fragment>
      ))}

      {/* Coach note */}
      <div style={{ margin: `22px ${t.padX}px 0`, padding: 18, background: t.INK, color: t.PAPER }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.AMBER, marginBottom: 10, fontWeight: 700 }}>
          ▍ Notes from Jordan
        </div>
        <div style={{ fontFamily: t.DISPLAY, fontWeight: 500, fontSize: 16, lineHeight: 1.35, letterSpacing: '-0.01em' }}>
          {program.coachLine}
        </div>
      </div>

      {/* Sticky-ish CTA */}
      {!isRest && (
        <div style={{ padding: `22px ${t.padX}px 18px`, display: 'flex', gap: 8 }}>
          <button onClick={onBack} style={{ borderRadius: t.RADIUS_SM,
            padding: '14px 18px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK,
            fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Close</button>
          <button onClick={onStart} style={{ borderRadius: t.RADIUS_SM,
            flex: 1, padding: '14px', border: 0, background: t.INK, color: t.PAPER,
            fontFamily: t.MONO, fontSize: 11, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', cursor: 'pointer',
          }}>Start session →</button>
        </div>
      )}

      <BSFooter right="Preview" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// SESSION — live workout, set logging, rest timer
// ═══════════════════════════════════════════════════════════
// Barbell plate math — plates per side for a total load (45 lb bar).
function bsPlates(total) {
  let per = (Number(total) - 45) / 2;
  if (!Number.isFinite(per) || per <= 0) return [];
  const sizes = [45, 35, 25, 10, 5, 2.5];
  const out = [];
  for (const s of sizes) { while (per >= s - 0.01 && out.length < 8) { out.push(s); per = Math.round((per - s) * 100) / 100; } }
  return out;
}

function BSSession({ moves, onBack, title = 'Live session' }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const buildSetInputs = () => moves.reduce((acc, m, mIdx) => {
    Array.from({ length: m.sets }).forEach((_, setIdx) => {
      acc[`${mIdx}-${setIdx}`] = {
        reps: String(m.reps || ''),
        load: String(m.l || ''),
        rpe: String(m.rpe || '8'),
      };
    });
    return acc;
  }, {});
  const [moveIdx, setMoveIdx] = useStateBSC(0);
  const [completed, setCompleted] = useStateBSC({}); // key `${moveIdx}-${setIdx}` → true
  const [restEnd, setRestEnd] = useStateBSC(null);   // timestamp ms
  const [restTotal, setRestTotal] = useStateBSC(120); // seconds of the current rest
  const [restAfterSet, setRestAfterSet] = useStateBSC(0); // which set number just finished
  const [reviewFeel, setReviewFeel] = useStateBSC(null);   // post-workout rating
  const [reviewEffort, setReviewEffort] = useStateBSC(null); // post-workout effort
  const [now, setNow] = useStateBSC(Date.now());
  const [elapsedStart] = useStateBSC(Date.now());
  const [activeSetKey, setActiveSetKey] = useStateBSC(null);
  const [setStartedAt, setSetStartedAt] = useStateBSC(null);
  const [lastSetEndedAt, setLastSetEndedAt] = useStateBSC(null);
  const [setLogs, setSetLogs] = useStateBSC([]);
  const [setInputs, setSetInputs] = useStateBSC(buildSetInputs);
  const [logStatus, setLogStatus] = useStateBSC('');

  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const move = moves[moveIdx];
  const totalSets = moves.reduce((s, m) => s + m.sets, 0);
  const doneSets = Object.values(completed).filter(Boolean).length;
  const elapsedSec = Math.floor((now - elapsedStart) / 1000);
  const fmt = (s) => `${Math.floor(s/60)}:${String(s%60).padStart(2,'0')}`;
  const restLeft = restEnd ? Math.max(0, Math.ceil((restEnd - now) / 1000)) : 0;

  const activeSetSeconds = activeSetKey && setStartedAt ? Math.max(0, Math.floor((now - setStartedAt) / 1000)) : 0;
  const avg = (values) => values.length ? Math.round(values.reduce((sum, value) => sum + value, 0) / values.length) : 0;
  const completedLogRows = setLogs.filter((entry) => entry.completed);
  const avgSetSeconds = avg(completedLogRows.map((entry) => entry.setDurationSeconds || 0));
  const avgRestSeconds = avg(completedLogRows.map((entry) => entry.restBeforeSeconds).filter((value) => Number.isFinite(value)));
  const logByKey = setLogs.reduce((acc, entry) => {
    acc[entry.key] = entry;
    return acc;
  }, {});

  const updateSetInput = (setIdx, field, value) => {
    const k = `${moveIdx}-${setIdx}`;
    const current = setInputs[k] || { reps: String(move.reps || ''), load: String(move.l || '') };
    const next = { ...current, [field]: value };
    setSetInputs({ ...setInputs, [k]: next });
    setSetLogs(setLogs.map((entry) => (
      entry.key === k
        ? {
            ...entry,
            actualReps: field === 'reps' ? value : (entry.actualReps ?? next.reps),
            actualLoad: field === 'load' ? value : (entry.actualLoad ?? next.load),
          }
        : entry
    )));
  };

  const startSet = (setIdx) => {
    const k = `${moveIdx}-${setIdx}`;
    if (completed[k]) return;
    setActiveSetKey(k);
    setSetStartedAt(Date.now());
    setRestEnd(null);
    setLogStatus(`Capturing set ${setIdx + 1} - tap Finish when the set ends.`);
  };

  const finishSet = (setIdx) => {
    const k = `${moveIdx}-${setIdx}`;
    if (activeSetKey !== k || !setStartedAt) {
      startSet(setIdx);
      return;
    }
    const endedAt = Date.now();
    const duration = Math.max(1, Math.round((endedAt - setStartedAt) / 1000));
    const restBefore = lastSetEndedAt ? Math.max(0, Math.round((setStartedAt - lastSetEndedAt) / 1000)) : null;
    const actual = setInputs[k] || { reps: String(move.reps || ''), load: String(move.l || '') };
    const nextLog = {
      key: k,
      moveIndex: moveIdx,
      moveName: move.m,
      setNumber: setIdx + 1,
      targetReps: move.reps,
      targetLoad: move.l,
      actualReps: actual.reps,
      actualLoad: actual.load,
      startedAt: new Date(setStartedAt).toISOString(),
      finishedAt: new Date(endedAt).toISOString(),
      setDurationSeconds: duration,
      restBeforeSeconds: restBefore,
      completed: true,
      capturedAt: new Date(endedAt).toISOString(),
    };
    setSetLogs([...setLogs.filter((entry) => entry.key !== k), nextLog].sort((a, b) => {
      if (a.moveIndex !== b.moveIndex) return a.moveIndex - b.moveIndex;
      return a.setNumber - b.setNumber;
    }));
    setCompleted({ ...completed, [k]: true });
    setActiveSetKey(null);
    setSetStartedAt(null);
    setLastSetEndedAt(endedAt);
    setRestTotal(120);
    setRestAfterSet(setIdx + 1);
    setRestEnd(endedAt + 120 * 1000);
    setLogStatus(`Captured ${move.m} set ${setIdx + 1}: ${actual.reps || '--'} reps at ${actual.load || '--'}, ${duration}s set${restBefore !== null ? `, ${restBefore}s rest before` : ''}.`);
  };

  const logSet = (setIdx) => {
    const k = `${moveIdx}-${setIdx}`;
    if (activeSetKey === k) finishSet(setIdx);
    else startSet(setIdx);
  };

  const finishSession = async () => {
    try {
      await window.ShapeWorkoutLogs?.saveSessionLog?.({
        title: `${moves[0]?.m || 'Workout'} session`,
        workout: moves[0]?.m || 'workout',
        durationSeconds: elapsedSec,
        setLogs,
        review: { feel: reviewFeel, effort: reviewEffort },
        privacy: 'private',
      });
      window.__bsToast?.('Private sensor workout log saved for coach review', 'ok');
    } catch (error) {
      window.__bsToast?.(error?.message || 'Workout log saved locally only', 'warn');
    }
    onBack();
  };

  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const pct = totalSets ? doneSets / totalSets : 0;
  const minLeft = Math.max(0, Math.round((totalSets - doneSets) * 1.6));
  const CUES = ['Dead hang every rep. Chest to bar or it doesn’t count.', 'Drive elbows behind ribs. Pause at sternum, two count.', 'Squeeze the cuffs. Feel the mid-trap, not the bicep.', 'Pull to forehead, not chest. Thumbs back.', 'Supinate hard at the top. Don’t cheat the negative.', 'Tall posture. Carry like you mean it.'];
  const cue = CUES[moveIdx] || 'Move with intent.';
  const activeIdx = (() => { for (let i = 0; i < move.sets; i++) if (!completed[`${moveIdx}-${i}`]) return i; return null; })();
  const activeKey = activeIdx != null ? `${moveIdx}-${activeIdx}` : null;
  const activeRunning = !!(activeKey && activeSetKey === activeKey);
  const activeLoad = (activeKey && setInputs[activeKey] && setInputs[activeKey].load) || move.l;
  const plates = bsPlates(activeLoad);
  const perSide = (() => { const v = (Number(activeLoad) - 45) / 2; return Number.isFinite(v) && v > 0 ? v : null; })();
  const plateColor = { 45: t.RUST, 35: t.AMBER, 25: t.BLUE, 10: teal, 5: t.GREEN, 2.5: t.INK50 };
  return (
    <BSPage>
      {/* Header — End / Live timer / set count */}
      <div style={{ padding: `46px ${t.padX}px 6px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, padding: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK }}>✕ End</button>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase', color: teal }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: teal, display: 'inline-block' }} /> Live · {fmt(elapsedSec)}
        </span>
        <span style={{ fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50 }}>{doneSets}/{totalSets}</span>
      </div>

      {/* Rest timer — pinned at the very top while resting between sets */}
      {restEnd && restLeft > 0 && (
        <div style={{ margin: `12px ${t.padX}px 0`, padding: 16, borderRadius: 16, background: t.INK, color: t.PAPER }}>
          <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.24em', textTransform: 'uppercase', color: teal, fontWeight: 800 }}>Rest</span>
            <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>Set {restAfterSet} of {move.sets} · done</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 48, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{fmt(restLeft)}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, color: 'rgba(255,255,255,0.55)' }}>of {fmt(restTotal)}</span>
          </div>
          <div style={{ marginTop: 12, height: 4, borderRadius: 999, background: 'rgba(255,255,255,0.18)', overflow: 'hidden' }}>
            <div style={{ width: `${Math.round(Math.max(0, Math.min(1, (restTotal - restLeft) / restTotal)) * 100)}%`, height: '100%', background: teal, borderRadius: 999 }} />
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8 }}>
            <button onClick={() => { setRestEnd((e) => (e || Date.now()) + 30 * 1000); setRestTotal((r) => r + 30); }} style={{ flex: 1, padding: '11px', borderRadius: 999, background: 'transparent', color: t.PAPER, border: `1px solid rgba(255,255,255,0.4)`, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800 }}>+30 sec</button>
            <button onClick={() => setRestEnd(null)} style={{ flex: 1.4, padding: '11px', borderRadius: 999, background: teal, color: '#04201d', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800 }}>Skip rest →</button>
          </div>
        </div>
      )}

      {/* Title + progress */}
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 29, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1.0, color: t.INK }}>{title || 'Live session'}</div>
        <div style={{ marginTop: 8, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>w/ Jordan · {Math.round(pct * 100)}% complete · ~{minLeft} min left</div>
        <div style={{ marginTop: 12, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}>
          <div style={{ width: `${Math.round(pct * 100)}%`, height: '100%', background: teal, borderRadius: 999 }} />
        </div>
      </div>


      {/* Current exercise */}
      <div style={{ padding: `20px ${t.padX}px 0`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
        <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.RUST, fontWeight: 800 }}>Exercise {moveIdx + 1} of {moves.length}</span>
        <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 700 }}>{move.sets} × {move.reps}</span>
      </div>
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, letterSpacing: '-0.03em', color: t.INK, lineHeight: 1 }}>{move.m}<span style={{ color: t.RUST }}>.</span></div>
        <div style={{ marginTop: 6, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 13.5, fontWeight: 500, color: t.INK50, letterSpacing: '-0.005em' }}>“{cue}”</div>
        {move.l && <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, fontWeight: 600 }}>Last · {move.l}</div>}
      </div>

      {/* Plate math */}
      {perSide && (
        <div style={{ padding: `14px ${t.padX}px 0` }}>
          <div style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Per side ({activeLoad} lb)</div>
            <div style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, fontWeight: 700 }}>Bar +</span>
              {plates.length ? plates.map((p, i) => (
                <span key={i} style={{ padding: '4px 9px', borderRadius: 8, background: plateColor[p] || t.INK50, color: '#1a1410', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800 }}>{p}</span>
              )) : <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50 }}>bar only</span>}
            </div>
          </div>
        </div>
      )}

      {/* Set table */}
      <div style={{ padding: `18px ${t.padX}px 0` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 30px', gap: 8, padding: '0 0 8px', fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>
          <span>Set</span><span>Weight</span><span>Reps</span><span>RPE</span><span style={{ textAlign: 'right' }}>Done</span>
        </div>
        {Array.from({ length: move.sets }).map((_, i) => {
          const k = `${moveIdx}-${i}`;
          const done = completed[k];
          const isActive = i === activeIdx;
          const ri = setInputs[k] || { reps: '', load: String(move.l || ''), rpe: '' };
          const bc = isActive ? teal : t.HAIR;
          const cell = (field, ph) => (
            <input value={ri[field] ?? ''} onChange={(e) => updateSetInput(i, field, e.target.value)} placeholder={ph} inputMode="decimal" disabled={done} aria-label={`Set ${i + 1} ${field}`}
              style={{ width: '100%', minWidth: 0, boxSizing: 'border-box', borderRadius: 10, border: `1px solid ${done ? t.HAIR : bc}`, background: done ? 'transparent' : (isActive ? `${teal}12` : t.PAPER2), color: t.INK, padding: '10px 8px', fontFamily: t.MONO, fontSize: 12, textAlign: 'center', fontVariantNumeric: 'tabular-nums', opacity: done ? 0.6 : 1 }} />
          );
          return (
            <div key={i} style={{ display: 'grid', gridTemplateColumns: '26px 1fr 1fr 1fr 30px', gap: 8, alignItems: 'center', padding: '5px 0' }}>
              <span style={{ fontFamily: t.MONO, fontSize: 12, fontWeight: 700, color: (done || isActive) ? teal : t.INK50, fontVariantNumeric: 'tabular-nums' }}>{done ? '✓' : String(i + 1).padStart(2, '0')}</span>
              {cell('load', 'lb')}
              {cell('reps', '—')}
              {cell('rpe', '—')}
              <button onClick={() => { if (!done) logSet(i); }} aria-label={done ? `Set ${i + 1} done` : `Mark set ${i + 1} done`} style={{ justifySelf: 'end', width: 26, height: 26, padding: 0, borderRadius: 999, border: `1.5px solid ${(done || isActive) ? teal : t.RULE}`, background: done ? teal : 'transparent', color: done ? '#04201d' : (isActive ? teal : 'transparent'), display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 800, cursor: done ? 'default' : 'pointer' }}>✓</button>
            </div>
          );
        })}
      </div>

      {/* Primary log CTA */}
      <div style={{ padding: `16px ${t.padX}px 0` }}>
        {activeIdx != null ? (
          <button onClick={() => logSet(activeIdx)} style={{ width: '100%', borderRadius: 999, border: 0, background: teal, color: '#04201d', cursor: 'pointer', padding: '16px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {activeRunning ? `Log set ${activeIdx + 1}${move.reps ? ` · ${move.reps} reps` : ''}` : `Start set ${activeIdx + 1}`}
          </button>
        ) : (
          <button onClick={() => { if (moveIdx < moves.length - 1) { setMoveIdx(moveIdx + 1); setRestEnd(null); } else finishSession(); }} style={{ width: '100%', borderRadius: 999, border: 0, background: t.GREEN, color: '#04201d', cursor: 'pointer', padding: '16px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>
            {moveIdx < moves.length - 1 ? 'Next exercise →' : 'Finish workout ✓'}
          </button>
        )}
      </div>

      {/* Prev / next */}
      <div style={{ padding: `10px ${t.padX}px 0`, display: 'flex', gap: 8 }}>
        <button onClick={() => setMoveIdx(Math.max(0, moveIdx - 1))} disabled={moveIdx === 0} style={{ padding: '13px 16px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: moveIdx === 0 ? 'default' : 'pointer', opacity: moveIdx === 0 ? 0.4 : 1, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>← Previous</button>
        <button onClick={() => { if (moveIdx < moves.length - 1) { setMoveIdx(moveIdx + 1); setRestEnd(null); } }} disabled={moveIdx >= moves.length - 1} style={{ flex: 1, minWidth: 0, padding: '13px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: moveIdx >= moves.length - 1 ? t.INK50 : t.INK, cursor: moveIdx >= moves.length - 1 ? 'default' : 'pointer', opacity: moveIdx >= moves.length - 1 ? 0.5 : 1, fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{moveIdx < moves.length - 1 ? `Next: ${moves[moveIdx + 1].m}` : 'Last exercise'}</button>
      </div>

      {/* Queue */}
      <div style={{ padding: `26px ${t.padX}px 4px` }}>
        <BSEyebrow color={teal}>Up next</BSEyebrow>
        <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Queue</div>
      </div>
      <div style={{ padding: `8px ${t.padX}px 0` }}>
        {moves.map((mv, i) => {
          const mDone = Array.from({ length: mv.sets }).every((_, si) => completed[`${i}-${si}`]);
          const isCurrent = i === moveIdx;
          return (
            <button key={i} onClick={() => setMoveIdx(i)} style={{ width: '100%', textAlign: 'left', cursor: 'pointer', background: isCurrent ? t.PAPER2 : 'transparent', border: 0, borderRadius: 12, display: 'grid', gridTemplateColumns: '26px 1fr auto', gap: 10, alignItems: 'center', padding: '12px 10px', borderBottom: `1px solid ${t.HAIR}`, opacity: mDone ? 0.5 : 1 }}>
              <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: mDone ? teal : t.INK50 }}>{mDone ? '✓' : String(i + 1).padStart(2, '0')}</span>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', textDecoration: mDone ? 'line-through' : 'none' }}>{mv.m}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50, marginTop: 2 }}>{mv.sets} × {mv.reps} · 90s rest</div>
              </div>
              {mv.l && <span style={{ fontFamily: t.MONO, fontSize: 11, fontWeight: 700, color: t.INK70 }}>{mv.l}</span>}
            </button>
          );
        })}
      </div>

      {/* Live coach message */}
      <div style={{ padding: `16px ${t.padX}px 0` }}>
        <div style={{ borderRadius: 16, border: `1px solid ${t.RUST}55`, background: `linear-gradient(155deg, ${t.RUST}22, ${t.RUST}08 50%, ${t.PAPER2} 90%), ${t.PAPER2}`, padding: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              <BSAvatar init="J" size={30} fill={t.RUST} ink={t.PAPER} />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 700, color: t.INK }}>Jordan</div>
                <div style={{ fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, marginTop: 1 }}>Live · coaching</div>
              </div>
            </div>
            <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>2 min ago</span>
          </div>
          <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.45 }}>{'“' + cue + '”'}</div>
        </div>
      </div>

      {/* Post-workout review */}
      <div style={{ padding: `26px ${t.padX}px 4px` }}>
        <BSEyebrow color={teal}>How was it?</BSEyebrow>
        <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 27, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Rate this workout</div>
      </div>
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 8 }}>The vibe</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['loved', 'Loved it', t.GREEN], ['ok', 'It was OK', t.AMBER], ['nope', 'Not for me', t.RUST]].map(([key, label, c]) => {
            const on = reviewFeel === key;
            return (
              <button key={key} onClick={() => setReviewFeel(on ? null : key)} style={{ borderRadius: 14, border: `1px solid ${on ? c : t.RULE}`, background: on ? `${c}1c` : t.PAPER2, cursor: 'pointer', padding: '14px 6px', textAlign: 'center', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', color: on ? c : t.INK70 }}>{label}</button>
            );
          })}
        </div>
      </div>
      <div style={{ padding: `14px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, marginBottom: 8 }}>The effort</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
          {[['easy', 'Easy'], ['moderate', 'Moderate'], ['hard', 'Hard']].map(([key, label], i) => {
            const on = reviewEffort === key;
            const c = i === 0 ? t.GREEN : i === 1 ? t.AMBER : t.RUST;
            return (
              <button key={key} onClick={() => setReviewEffort(on ? null : key)} style={{ borderRadius: 999, border: `1px solid ${on ? c : t.RULE}`, background: on ? `${c}1c` : 'transparent', color: on ? c : t.INK70, cursor: 'pointer', padding: '11px 6px', fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase' }}>{label}</button>
            );
          })}
        </div>
        {(reviewFeel || reviewEffort) && (
          <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: teal, fontWeight: 700 }}>✓ Saved with your log — Jordan will see it</div>
        )}
      </div>

      {/* End workout early */}
      <div style={{ padding: `18px ${t.padX}px 90px` }}>
        <button onClick={finishSession} style={{ width: '100%', padding: '14px', borderRadius: 12, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase' }}>End workout early</button>
      </div>
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// GROCERY — current week's list
// ═══════════════════════════════════════════════════════════
const BS_GROCERY_DEFAULT = {
  id: 'weekly-plan',
  name: "This week's plan",
  eyebrow: 'Week 17 · Auto-built from plan',
  author: 'Dr. Maya Patel',
  note: '"Swap salmon for cod if the price jumps — keep portions the same."',
  aisles: [
    { aisle: 'Produce', items: [
      { n: 'Baby spinach',  q: '2 bags',   meals: 'Salmon bowl · snacks' },
      { n: 'Blueberries',   q: '2 pints',  meals: 'Breakfast oats' },
      { n: 'Bell peppers',  q: '4',        meals: 'Lunch bowls' },
      { n: 'Broccoli',      q: '2 heads',  meals: 'Salmon plate' },
    ]},
    { aisle: 'Protein', items: [
      { n: 'Chicken breast', q: '2.5 lb', meals: 'Lunch bowls x4' },
      { n: 'Wild salmon',    q: '1.2 lb', meals: 'Tue / Fri dinner' },
      { n: 'Eggs',           q: '12 ct',  meals: 'Breakfast' },
      { n: 'Whey isolate',   q: '— have', meals: '—', have: true },
    ]},
    { aisle: 'Pantry', items: [
      { n: 'Jasmine rice',  q: '2 lb',   meals: 'Lunch bowls' },
      { n: 'Quinoa',        q: '1 lb',   meals: 'Salmon plate' },
      { n: 'Olive oil',     q: '— have', meals: '—', have: true },
    ]},
    { aisle: 'Dairy & cold', items: [
      { n: 'Almond milk', q: '1/2 gal', meals: 'Oats · coffee' },
      { n: 'Feta',        q: '6 oz',    meals: 'Salmon plate' },
      { n: 'Greek yogurt',q: '32 oz',   meals: 'Snacks' },
    ]},
  ],
};

// "Build a list." — name a custom grocery list, add items by aisle, then create.
function BSGroceryBuilder({ onCancel, onCreate }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const rust = t.RUST;
  const AISLES = ['Produce', 'Protein', 'Pantry', 'Dairy & cold', 'Frozen', 'Bakery', 'Household'];
  const [name, setName] = useStateBSC('');
  const [items, setItems] = useStateBSC([]); // { n, q, aisle }
  const [iName, setIName] = useStateBSC('');
  const [iQty, setIQty] = useStateBSC('');
  const [iAisle, setIAisle] = useStateBSC('Produce');
  const addItem = () => { const n = iName.trim(); if (!n) return; setItems(a => [...a, { n, q: iQty.trim() || '1', aisle: iAisle }]); setIName(''); setIQty(''); };
  const removeItem = (idx) => setItems(a => a.filter((_, j) => j !== idx));
  const create = () => {
    const nm = name.trim() || 'New list';
    const grouped = AISLES
      .map(al => ({ aisle: al, items: items.map((it, k) => ({ it, k })).filter(x => x.it.aisle === al).map(x => ({ id: `b-${x.k}`, n: x.it.n, q: x.it.q, meals: nm })) }))
      .filter(a => a.items.length);
    const aisles = grouped.length ? grouped : [{ aisle: 'Items', items: [] }];
    onCreate({ name: nm, items: items.map((it, k) => ({ id: `b-${k}`, n: it.n, q: it.q, meals: nm })), aisles });
  };
  const line = { width: '100%', border: 0, borderBottom: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, padding: '8px 2px', fontFamily: t.DISPLAY, fontSize: 16, outline: 'none' };
  return (
    <BSPage>
      <div style={{ padding: `60px ${t.padX}px 28px` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button onClick={onCancel} style={{ border: 0, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>← CANCEL</button>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.14em', color: rust }}>{items.length} ITEMS</span>
        </div>
        <div style={{ marginTop: 14, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: rust }}>NEW LIST</div>
        <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 40, fontWeight: 700, color: t.INK, lineHeight: 0.98, letterSpacing: '-0.02em' }}>Build a<br /><span style={{ fontStyle: 'italic', color: rust }}>list.</span></div>

        <div style={{ marginTop: 22, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: rust, marginBottom: 4 }}>LIST NAME</div>
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sunday staples" style={line} />

        {/* Add an item */}
        <div style={{ marginTop: 22, borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 16 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: rust }}>ADD AN ITEM</div>
          <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: '1fr 72px', gap: 12, alignItems: 'end' }}>
            <input value={iName} onChange={(e) => setIName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder="Item" style={line} />
            <input value={iQty} onChange={(e) => setIQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder="Qty" style={{ ...line, fontFamily: t.MONO, fontSize: 13, textAlign: 'right' }} />
          </div>
          <div style={{ marginTop: 16, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: t.INK50, marginBottom: 9 }}>AISLE</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {AISLES.map(al => { const on = iAisle === al; return <button key={al} onClick={() => setIAisle(al)} style={{ borderRadius: 999, padding: '8px 13px', cursor: 'pointer', border: `1px solid ${on ? t.INK : t.RULE}`, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{al}</button>; })}
          </div>
          <button onClick={addItem} disabled={!iName.trim()} style={{ width: '100%', marginTop: 16, borderRadius: 12, border: `1px solid ${rust}`, background: iName.trim() ? `${rust}1c` : 'transparent', color: rust, padding: '12px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: iName.trim() ? 'pointer' : 'default', opacity: iName.trim() ? 1 : 0.55 }}>+ Add to list</button>
        </div>

        {/* Items */}
        {items.length === 0 ? (
          <div style={{ marginTop: 22, textAlign: 'center', fontFamily: t.DISPLAY, fontSize: 14, fontStyle: 'italic', color: t.INK50 }}>No items yet. Add your first above.</div>
        ) : (
          <div style={{ marginTop: 18 }}>
            {items.map((it, idx) => (
              <div key={idx} style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: 10, alignItems: 'center', padding: '12px 0', borderTop: idx ? `1px solid ${t.HAIR}` : 0 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 700, color: t.INK }}>{it.n}</div>
                  <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{it.aisle}</div>
                </div>
                <span style={{ fontFamily: t.MONO, fontSize: 11, color: rust, fontWeight: 700 }}>{it.q}</span>
                <button onClick={() => removeItem(idx)} aria-label="Remove" style={{ border: 0, background: 'transparent', color: t.INK50, fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>
              </div>
            ))}
          </div>
        )}

        <button onClick={create} disabled={items.length === 0} style={{ width: '100%', marginTop: 24, borderRadius: 14, border: 0, background: rust, color: '#fff', padding: '15px', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: items.length ? 'pointer' : 'default', opacity: items.length ? 1 : 0.5 }}>Create list →</button>
      </div>
      <BSFooter right={`${items.length} items`} />
    </BSPage>
  );
}

// Item-swap suggestions for a coach-sent grocery item — a keyword map + a
// category fallback so the member can sub anything for a sensible alternative.
const BS_GRO_SWAPS = {
  'white rice': ['Brown rice', 'Quinoa', 'Cauliflower rice'],
  'rice': ['Brown rice', 'Quinoa', 'Jasmine rice'],
  'chicken breast': ['Chicken thigh', 'Turkey breast', 'Extra-firm tofu'],
  'chicken': ['Turkey', 'Tofu', 'Tempeh'],
  'beef': ['Lean ground beef', 'Bison', 'Turkey'],
  'salmon': ['Trout', 'Cod', 'Canned tuna'],
  'milk': ['Almond milk', 'Oat milk', 'Lactose-free milk'],
  'greek yogurt': ['Skyr', 'Cottage cheese', 'Plant-based yogurt'],
  'yogurt': ['Greek yogurt', 'Skyr', 'Plant-based yogurt'],
  'bread': ['Whole-grain bread', 'Sourdough', 'Wraps'],
  'pasta': ['Whole-wheat pasta', 'Chickpea pasta', 'Rice noodles'],
  'potato': ['Sweet potato', 'Butternut squash', 'Parsnip'],
  'spinach': ['Kale', 'Arugula', 'Swiss chard'],
  'peanut butter': ['Almond butter', 'Sunflower butter', 'Cashew butter'],
};
function bsGrocerySwap(name) {
  const n = String(name || '').toLowerCase().trim();
  for (const k in BS_GRO_SWAPS) if (n.includes(k)) return BS_GRO_SWAPS[k].filter(x => x.toLowerCase() !== n);
  const cat = bsGroceryAisleFor(name);
  const FB = {
    Produce: ['Seasonal greens', 'Frozen mixed veg', 'A different vegetable'],
    Protein: ['Tofu', 'Turkey', 'Eggs'],
    Dairy: ['Plant-based alt', 'Low-fat version', 'Lactose-free version'],
    Grains: ['Brown rice', 'Quinoa', 'Oats'],
  };
  return FB[cat] || ['A similar item', 'Store-brand version', 'Skip this item'];
}
// "From your nutritionist" review card — the coach-pushed grocery list, where the
// member reviews each item and can SWAP it for an alternative before adding it to
// their own grocery list. Reads coach_pushed_items via /api/client/grocery.
function BSCoachGroceryReview({ t, teal, onAdd }) {
  const [groups, setGroups] = useStateBSC(null);
  const [swapKey, setSwapKey] = useStateBSC(null); // `${gi}-${ii}`
  const [added, setAdded] = useStateBSC({});
  React.useEffect(() => {
    let on = true;
    if (!window.ShapeClientGrocery?.list) { setGroups([]); return () => { on = false; }; }
    window.ShapeClientGrocery.list().then(items => {
      if (!on) return;
      if (!Array.isArray(items) || !items.length) { setGroups([]); return; }
      const by = {};
      items.forEach(it => { const g = (it.mealName || 'Coach list').trim() || 'Coach list'; (by[g] = by[g] || []).push({ item: it.item, qty: it.qty || '', id: it.id }); });
      setGroups(Object.keys(by).map(name => ({ name, items: by[name] })));
    }).catch(() => { if (on) setGroups([]); });
    return () => { on = false; };
  }, []);
  if (!groups || !groups.length) return null;
  const muted = t.INK50;
  const card = t.SURFACE || t.PAPER2;
  const setItem = (gi, ii, val) => setGroups(gs => gs.map((g, x) => x !== gi ? g : { ...g, items: g.items.map((it, y) => y !== ii ? it : { ...it, item: val }) }));
  return (
    <div style={{ padding: `0 ${t.padX}px 6px` }}>
      {groups.map((g, gi) => (
        <div key={gi} style={{ border: `1px solid ${teal}55`, borderRadius: 18, background: card, overflow: 'hidden', marginBottom: 12 }}>
          <div style={{ height: 3, background: teal }} />
          <div style={{ padding: '13px 15px 15px' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, fontWeight: 900 }}>From your nutritionist</div>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', color: t.INK }}>{g.name}</div>
            <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.06em', textTransform: 'uppercase', color: muted }}>{g.items.length} items · review &amp; swap before adding</div>
            <div style={{ marginTop: 11, display: 'flex', flexDirection: 'column', gap: 2 }}>
              {g.items.map((it, ii) => {
                const k = `${gi}-${ii}`;
                const open = swapKey === k;
                const alts = open ? bsGrocerySwap(it.item) : [];
                return (
                  <div key={ii}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0', borderTop: ii ? `1px solid ${t.RULE}` : 'none' }}>
                      <span style={{ flex: 1, minWidth: 0, fontFamily: t.DISPLAY, fontSize: 14.5, color: t.INK }}>{it.item}{it.qty ? <span style={{ color: muted, fontSize: 12 }}> · {it.qty}</span> : null}</span>
                      <button onClick={() => setSwapKey(open ? null : k)} style={{ flex: 'none', border: `1px solid ${open ? teal : t.RULE}`, background: open ? `${teal}1f` : 'transparent', color: open ? teal : t.INK70, borderRadius: 999, padding: '5px 11px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>⇄ Swap</button>
                    </div>
                    {open && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 0 10px 2px' }}>
                        {alts.map(a => (
                          <button key={a} onClick={() => { setItem(gi, ii, a); setSwapKey(null); window.__bsToast?.(`Swapped to ${a}`, 'ok'); }} style={{ border: `1px solid ${t.RULE}`, background: t.PAPER, color: t.INK, borderRadius: 999, padding: '6px 11px', fontFamily: t.DISPLAY, fontSize: 12.5, cursor: 'pointer' }}>{a}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            <button
              disabled={!!added[gi]}
              onClick={() => { onAdd(g); setAdded(a => ({ ...a, [gi]: true })); window.__bsToast?.('Added to your grocery list', 'ok'); }}
              style={{ width: '100%', marginTop: 13, padding: '12px', borderRadius: 999, border: 0, background: added[gi] ? t.RULE : teal, color: added[gi] ? t.INK50 : '#04201d', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase', cursor: added[gi] ? 'default' : 'pointer' }}>
              {added[gi] ? '✓ Added to your list' : 'Add to my grocery list →'}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

function BSGrocery({ list: activeList, onBack, onLibrary, recipeLists = [], onChangeView = () => {}, editable = false, onUpdate = () => {}, onCreate = () => {}, onSaveToLibrary = null, onProfile = () => {} }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const list = bsNormalizeGroceryList(activeList || BS_GROCERY_DEFAULT);
  const [newName, setNewName] = useStateBSC('');
  const [newQty, setNewQty] = useStateBSC('');
  const addItem = () => {
    const n = newName.trim();
    if (!n) return;
    const item = { id: `${list.id || 'list'}-i-${Date.now()}`, n, q: newQty.trim() || '1', meals: list.name };
    const aisles = (list.aisles && list.aisles.length)
      ? list.aisles.map(a => ({ ...a, items: [...a.items] }))
      : [{ aisle: 'Items', items: [] }];
    aisles[0] = { ...aisles[0], items: [...aisles[0].items, item] };
    onUpdate({ ...list, aisles });
    setNewName(''); setNewQty('');
  };
  const removeItem = (ai, ii) => {
    const aisles = list.aisles.map((a, idx) => idx === ai ? { ...a, items: a.items.filter((_, j) => j !== ii) } : a);
    onUpdate({ ...list, aisles });
  };
  const allKeys = [];
  list.aisles.forEach((a, ai) => a.items.forEach((it, ii) => allKeys.push({ k: `${ai}-${ii}`, have: !!it.have })));
  const initialChecked = new Set(allKeys.filter(x => x.have).map(x => x.k));
  const [checked, setChecked] = useStateBSC(initialChecked);
  const [activeAisle, setActiveAisle] = useStateBSC(0);
  React.useEffect(() => {
    setChecked(new Set(allKeys.filter(x => x.have).map(x => x.k)));
    setActiveAisle(0);
  }, [list.id || list.name]);

  const toggle = (k) => {
    const next = new Set(checked);
    if (next.has(k)) next.delete(k); else next.add(k);
    setChecked(next);
  };
  // Clear the checked items for a single aisle (keys are `${aisleIdx}-${itemIdx}`).
  const resetAisle = (ai) => setChecked(prev => new Set([...prev].filter(k => !k.startsWith(`${ai}-`))));
  const total = allKeys.length;
  const done = checked.size;
  const pct = Math.round((done / total) * 100);
  const estCost = 48;
  const estLeft = Math.round(estCost * (1 - done / total));
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const savedLib = useBSLibrary();
  const groceryItem = { id: `grocery:${list.id || String(list.name || 'list').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')}`, kind: 'grocery', title: list.name, meta: `${total} items · ${list.aisles.length} aisles` };
  const grocerySaved = savedLib.some(x => x.id === groceryItem.id);
  const rust = teal; // grocery (food list) page uses the nutrition teal accent
  const aisleDoneCount = (ai) => list.aisles[ai].items.filter((_, ii) => checked.has(`${ai}-${ii}`)).length;
  const saveToLib = () => { if (onSaveToLibrary) onSaveToLibrary(list); else bsLibToggle(groceryItem); };
  const shareList = () => { try { const txt = list.aisles.flatMap(a => a.items.map(it => `${it.q} ${it.n}`)).join('\n'); navigator.clipboard?.writeText(`${list.name} — Shop list\n\n${txt}`); } catch (e) {} window.__bsToast?.('Shop list copied', 'ok'); };
  const sendInstacart = async () => {
    try {
      const items = (list.aisles || []).flatMap(a => a.items || []).map(it => ({ name: it.n, display_text: [it.q, it.n].filter(Boolean).join(' ') })).filter(it => it.name);
      if (!items.length) { window.__bsToast?.('Your grocery list is empty.', 'error'); return; }
      await window.ShapeIntegrations?.sendGroceryToInstacart?.({ items, title: list.name });
    } catch (e) { window.__bsToast?.(e?.message || 'Could not send list.', 'error'); }
  };
  const RR = 22, RC = 2 * Math.PI * RR;

  return (
    <BSPage>
      <BSPageHeader trailing={<BSFacetAvatar size={34} c={bsMyTierColor()} initial={bsMyInitials()} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || undefined} live={bsAmLive()} showRank={false} onClick={onProfile} />} />
      {/* Header */}
      <div style={{ padding: `4px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.18em', color: rust }}>{(list.eyebrow || 'Auto-built from plan').toUpperCase()}</div>
            <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 34, fontWeight: t.W.display, color: t.INK, lineHeight: 0.92, letterSpacing: '-0.035em' }}>Food<br /><span style={{ fontStyle: 'italic', color: rust }}>list.</span></div>
          </div>
          <button onClick={onLibrary} style={{ flexShrink: 0, border: 0, background: 'transparent', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', color: rust, paddingTop: 6 }}>+ NEW LIBRARY</button>
        </div>
      </div>

      <BSNutritionTopTabs active="grocery" onChange={onChangeView} />

      {/* Coach-sent grocery list — review + swap items, then add to your list */}
      <BSCoachGroceryReview t={t} teal={teal} onAdd={(g) => {
        const aisles = (list.aisles && list.aisles.length) ? list.aisles.map(a => ({ ...a, items: [...a.items] })) : [];
        const findAisle = (name) => { const al = bsGroceryAisleFor(name); let idx = aisles.findIndex(a => a.aisle === al); if (idx < 0) { aisles.push({ aisle: al, items: [] }); idx = aisles.length - 1; } return idx; };
        (g.items || []).forEach((it, n) => { const ai = findAisle(it.item); aisles[ai].items.push({ id: `coach-${Date.now()}-${n}`, n: it.item, q: it.qty || '1', meals: g.name, have: false }); });
        onUpdate({ ...list, aisles });
      }} />

      <div style={{ padding: `8px ${t.padX}px 24px` }}>
        {/* Progress card */}
        <div style={{ marginTop: 14, borderRadius: 16, border: `1px solid ${rust}33`, background: `linear-gradient(155deg, ${rust}14, ${t.PAPER2} 72%), ${t.PAPER2}`, padding: 13 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.16em', color: rust }}>PROGRESS</div>
              <div style={{ marginTop: 3, fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, lineHeight: 1 }}>{done}<span style={{ fontSize: 15, color: t.INK50, fontFamily: t.MONO }}>/{total}</span></div>
              <div style={{ marginTop: 5, fontFamily: t.MONO, fontSize: 9, color: rust, letterSpacing: '0.03em' }}>~${estLeft} to go · {list.aisles.length} aisles · est. 22 min</div>
            </div>
            <svg width="46" height="46" viewBox="0 0 56 56" style={{ flexShrink: 0 }}>
              <circle cx="28" cy="28" r={RR} fill="none" stroke={t.HAIR} strokeWidth="5" />
              <circle cx="28" cy="28" r={RR} fill="none" stroke={rust} strokeWidth="5" strokeLinecap="round" strokeDasharray={RC} strokeDashoffset={RC * (1 - (total ? done / total : 0))} transform="rotate(-90 28 28)" />
              <text x="28" y="29" textAnchor="middle" dominantBaseline="central" style={{ fontFamily: t.MONO, fontSize: '12px', fontWeight: 800, fill: rust }}>{total ? pct : 0}%</text>
            </svg>
          </div>
          <div style={{ marginTop: 10, height: 4, borderRadius: 999, background: t.HAIR, overflow: 'hidden' }}><div style={{ height: '100%', width: `${total ? pct : 0}%`, background: rust, borderRadius: 999 }} /></div>
          <button onClick={sendInstacart} style={{ width: '100%', marginTop: 12, borderRadius: 11, border: 0, background: rust, color: '#fff', padding: '10px', fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', cursor: 'pointer' }}>Send to Instacart →</button>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button onClick={saveToLib} style={{ flex: 1, borderRadius: 999, border: `1px solid ${rust}`, background: 'transparent', color: rust, padding: '8px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>+ Save to library</button>
            <button onClick={shareList} style={{ borderRadius: 999, border: `1px solid ${rust}`, background: 'transparent', color: rust, padding: '8px 16px', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Share</button>
          </div>
        </div>

        {/* Aisle tabs — filter so the list doesn't fill the screen */}
        {list.aisles.length > 0 && (() => {
          const ai = Math.min(activeAisle, list.aisles.length - 1);
          const aisle = list.aisles[ai];
          return (
            <div style={{ marginTop: 22 }}>
              <div className="bs-hide-scroll" style={{ display: 'flex', gap: 7, overflowX: 'auto', paddingBottom: 2 }}>
                {list.aisles.map((a, i) => {
                  const on = i === ai; const dn = aisleDoneCount(i); const full = a.items.length > 0 && dn >= a.items.length;
                  return (
                    <button key={a.aisle} onClick={() => setActiveAisle(i)} style={{ flexShrink: 0, borderRadius: 999, border: `1px solid ${on ? rust : t.RULE}`, background: on ? rust : 'transparent', color: on ? '#fff' : (full ? t.INK50 : t.INK), padding: '7px 14px', cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap', textDecoration: full ? 'line-through' : 'none' }}>{a.aisle}</button>
                  );
                })}
              </div>
              <div style={{ marginTop: 16 }}>
                <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', color: teal }}>AISLE · {aisleDoneCount(ai)}/{aisle.items.length} ITEMS</div>
                <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{aisle.aisle}</div>
                <div style={{ marginTop: 8 }}>
                  {aisle.items.map((it, ii) => {
                    const k = `${ai}-${ii}`; const on = checked.has(k);
                    return (
                      <div key={k} onClick={() => toggle(k)} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', alignItems: 'center', gap: 12, padding: '14px 0', cursor: 'pointer', borderTop: ii ? `1px solid ${t.HAIR}` : 0, opacity: on ? 0.5 : 1 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, border: `1.5px solid ${on ? rust : t.RULE}`, background: on ? rust : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>{on ? '✓' : ''}</span>
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.01em', textDecoration: on ? 'line-through' : 'none' }}>{it.n}</div>
                          {it.meals && <div style={{ marginTop: 2, fontFamily: t.MONO, fontSize: 9.5, color: t.INK50, letterSpacing: '0.02em' }}>{it.meals}</div>}
                        </div>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontFamily: t.MONO, fontSize: 11, color: rust, fontWeight: 700 }}>{it.q}</span>
                          {editable && <button onClick={(e) => { e.stopPropagation(); removeItem(ai, ii); }} aria-label="Remove" style={{ border: 0, background: 'transparent', color: t.INK50, fontSize: 16, lineHeight: 1, cursor: 'pointer', padding: 0 }}>×</button>}
                        </span>
                      </div>
                    );
                  })}
                  {aisle.items.length === 0 && <div style={{ padding: '14px 0', fontFamily: t.MONO, fontSize: 10, color: t.INK50, letterSpacing: '0.08em', textTransform: 'uppercase' }}>{editable ? 'No items yet.' : 'Nothing here.'}</div>}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Add item (editable lists) */}
        {editable && (
          <div style={{ marginTop: 22 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: rust, marginBottom: 8 }}>Add item</div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder="Item" style={{ flex: 1, minWidth: 0, height: 42, borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '0 13px', fontFamily: t.DISPLAY, fontSize: 14, outline: 'none' }} />
              <input value={newQty} onChange={(e) => setNewQty(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addItem(); }} placeholder="Qty" style={{ width: 72, height: 42, borderRadius: 12, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, padding: '0 11px', fontFamily: t.MONO, fontSize: 12, outline: 'none' }} />
              <button onClick={addItem} style={{ height: 42, borderRadius: 12, padding: '0 18px', background: rust, color: '#fff', border: 0, cursor: 'pointer', fontFamily: t.MONO, fontSize: 11, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase' }}>Add</button>
            </div>
          </div>
        )}
      </div>
      <BSFooter right={`${done}/${total} items`} />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// GROCERY LIBRARY — saved templates
// ═══════════════════════════════════════════════════════════
const BS_GROCERY_LIBRARY = [
  { id: 'sun', name: 'Sunday staples',     kind: 'custom',   eyebrow: 'Custom · Updated last Sun', usedCount: 14,  preview: 'Bananas · Eggs · Oats', items: [
    { n: 'Bananas', q: '1 bunch' }, { n: 'Eggs', q: '18 ct' }, { n: 'Rolled oats', q: '1 tub' }, { n: 'Greek yogurt', q: '32 oz' }, { n: 'Baby spinach', q: '2 bags' }, { n: 'Chicken breast', q: '2 lb' }, { n: 'Jasmine rice', q: '2 lb' }, { n: 'Almond butter', q: '1 jar' }, { n: 'Blueberries', q: '2 pints' }, { n: 'Whole milk', q: '1 gal' }, { n: 'Coffee', q: '1 bag' },
  ] },
  { id: 'trv', name: 'Travel week',        kind: 'custom',   eyebrow: 'Custom · Airport-friendly', usedCount: 4, preview: 'Protein bars · Jerky · Apples', items: [
    { n: 'Protein bars', q: '1 box' }, { n: 'Beef jerky', q: '2 bags' }, { n: 'Apples', q: '6' }, { n: 'Mixed nuts', q: '1 bag' }, { n: 'Tuna packets', q: '4' }, { n: 'Rice cakes', q: '1 pack' }, { n: 'Electrolyte mix', q: '1 box' },
  ] },
  { id: 'prep',name: 'Meal prep — Sunday', kind: 'custom',   eyebrow: 'Custom · Weekly', usedCount: 22, preview: 'Chicken thighs · Rice · Broccoli', items: [
    { n: 'Chicken thighs', q: '3 lb' }, { n: 'Jasmine rice', q: '2 lb' }, { n: 'Broccoli', q: '2 heads' }, { n: 'Sweet potato', q: '4' }, { n: 'Olive oil', q: '1 btl' }, { n: 'Eggs', q: '12 ct' }, { n: 'Bell peppers', q: '4' }, { n: 'Black beans', q: '2 cans' }, { n: 'Salsa', q: '1 jar' }, { n: 'Greek yogurt', q: '32 oz' },
  ] },
  { id: 'mp7', name: '7-day Mediterranean',kind: 'mealplan', eyebrow: 'Meal plan · Whole-food', usedCount: 64, preview: 'Olive oil · Fish · Whole grains', items: [
    { n: 'Extra-virgin olive oil', q: '1 btl' }, { n: 'Wild salmon', q: '2 lb' }, { n: 'Whole-grain bread', q: '1 loaf' }, { n: 'Chickpeas', q: '3 cans' }, { n: 'Tomatoes', q: '6' }, { n: 'Cucumber', q: '3' }, { n: 'Feta', q: '8 oz' }, { n: 'Kalamata olives', q: '1 jar' }, { n: 'Lemons', q: '4' }, { n: 'Baby spinach', q: '2 bags' }, { n: 'Quinoa', q: '1 lb' }, { n: 'Hummus', q: '1 tub' },
  ] },
  { id: 'mph', name: 'High-protein cut · 5d',kind: 'mealplan', eyebrow: 'Meal plan · Cutting', usedCount: 42, preview: 'Chicken · Greek yogurt · Eggs', items: [
    { n: 'Chicken breast', q: '3 lb' }, { n: 'Greek yogurt (0%)', q: '32 oz' }, { n: 'Eggs', q: '18 ct' }, { n: 'Egg whites', q: '32 oz' }, { n: 'Cottage cheese', q: '16 oz' }, { n: 'Lean ground beef (93%)', q: '2 lb' }, { n: 'Broccoli', q: '2 heads' }, { n: 'Asparagus', q: '2 bunches' }, { n: 'Jasmine rice', q: '2 lb' }, { n: 'Berries', q: '2 pints' },
  ] },
  { id: 'mpp', name: 'Plant-forward build', kind: 'mealplan', eyebrow: 'Meal plan · Vegan-friendly', usedCount: 18, preview: 'Tempeh · Lentils · Quinoa', items: [
    { n: 'Tempeh', q: '3 blocks' }, { n: 'Lentils', q: '2 lb' }, { n: 'Quinoa', q: '2 lb' }, { n: 'Firm tofu', q: '2 blocks' }, { n: 'Black beans', q: '3 cans' }, { n: 'Chickpeas', q: '3 cans' }, { n: 'Baby spinach', q: '2 bags' }, { n: 'Sweet potato', q: '5' }, { n: 'Peanut butter', q: '1 jar' }, { n: 'Rolled oats', q: '1 tub' }, { n: 'Soy milk', q: '2 cartons' },
  ] },
];

function bsLibraryPreviewItems(list) {
  const base = String(list.preview || '')
    .split(/[·-]/)
    .map(s => s.trim())
    .filter(Boolean);
  const items = base.length ? base : [list.name];
  const daysMatch = String(list.name || '').match(/(\d+)[-\s]*(?:day|d)/i);
  const days = daysMatch ? Number(daysMatch[1]) : list.kind === 'mealplan' ? 7 : 1;
  return items.map((name, idx) => {
    return {
      id: `${list.id}-item-${idx}`,
      n: name,
      q: list.kind === 'mealplan' ? `${days} day qty` : '1',
      meals: list.name,
    };
  });
}

function bsNormalizeGroceryList(list) {
  if (!list) return BS_GROCERY_DEFAULT;
  if (list.aisles) return list;
  const items = list.items || bsLibraryPreviewItems(list);
  return {
    ...list,
    author: list.author || 'Shape nutrition',
    note: list.note || `"${list.name}" loaded from your grocery library.`,
    aisles: [{
      aisle: list.kind === 'recipe' ? 'Recipe ingredients' : 'Library items',
      items,
    }],
  };
}

function BSGroceryLibrary({ onBack, onLoad = () => {}, recipeLists = [], onCreate = () => {}, onEdit = () => {}, onDuplicate = () => {}, onDelete = () => {}, deletedIds = [] }) {
  const t = useBS();
  _bsScrollTopOnMount();
  const [filter, setFilter] = useStateBSC('all'); // all | custom | template | mealplan | recipe
  const [query, setQuery] = useStateBSC('');
  const [openList, setOpenList] = useStateBSC(null);
  const allLists = [...recipeLists, ...BS_GROCERY_LIBRARY].filter(l => !deletedIds.includes(l.id));
  const matchesQuery = (l) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    if ((l.name || '').toLowerCase().includes(q) || (l.preview || '').toLowerCase().includes(q) || (l.eyebrow || '').toLowerCase().includes(q)) return true;
    const items = l.items || bsLibraryPreviewItems(l) || [];
    return items.some(it => (it.n || '').toLowerCase().includes(q));
  };
  const filtered = allLists.filter(l => filter === 'all' || l.kind === filter).filter(matchesQuery);

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow={`${allLists.length} lists`}
        kicker="Section · Library"
        title={<>Saved<br/>carts.</>}
      />

      {/* New list */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <button onClick={onCreate} style={{ width: '100%', borderRadius: 14,
          padding: '14px 14px', background: t.INK, color: t.PAPER, border: 0, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 10, fontWeight: 800, letterSpacing: '0.18em', textTransform: 'uppercase',
        }}>+ New grocery list</button>
      </div>

      {/* Search saved lists */}
      <div style={{ padding: `12px ${t.padX}px 0` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, borderBottom: `1px solid ${t.RULE}`, padding: '8px 2px' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={t.INK50} strokeWidth="2" style={{ flexShrink: 0 }}><circle cx="11" cy="11" r="7" /><line x1="16.5" y1="16.5" x2="21" y2="21" strokeLinecap="round" /></svg>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search saved lists…" style={{ flex: 1, minWidth: 0, border: 0, background: 'transparent', outline: 'none', color: t.INK, fontFamily: t.DISPLAY, fontSize: 14 }} />
          {query && <button onClick={() => setQuery('')} style={{ border: 0, background: 'transparent', color: t.INK50, fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.1em', cursor: 'pointer' }}>CLEAR</button>}
        </div>
      </div>

      {/* Filter chips — rounded pills */}
      <div style={{ padding: `12px ${t.padX}px 6px`, display: 'flex', gap: 7, flexWrap: 'wrap', rowGap: 8 }}>
        {[['all','All'],['recipe','Recipes'],['custom','Custom'],['mealplan','Meal Plans']].map(([k, l]) => {
          const on = filter === k;
          return (
            <button key={k} onClick={() => setFilter(k)} style={{
              flex: '0 0 auto', padding: '8px 14px', borderRadius: 999,
              border: `1px solid ${on ? t.INK : t.RULE}`,
              background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, cursor: 'pointer',
              fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase',
            }}>{l}</button>
          );
        })}
      </div>

      <div style={{ padding: `4px ${t.padX}px`, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {filtered.length === 0 && (
          <div style={{ padding: '22px 16px', borderRadius: 16, border: `1px dashed ${t.RULE}`, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, textAlign: 'center' }}>
            {query.trim() ? 'No lists match your search.' : 'No saved lists yet.'}
          </div>
        )}
        {filtered.map((l) => {
          const color = l.kind === 'template' ? t.AMBER : l.kind === 'mealplan' ? t.GREEN : l.kind === 'recipe' ? t.RUST : t.ACCENT;
          const open = openList === l.id;
          const previewItems = l.items || bsLibraryPreviewItems(l);
          const btn = {
            borderRadius: 999, padding: '9px 14px', cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase',
          };
          return (
            <div key={l.id} style={{ borderRadius: 16, border: `1px solid ${t.RULE}`, background: t.PAPER2, padding: 14 }}>
              <div onClick={() => setOpenList(open ? null : l.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6, gap: 10 }}>
                  <BSEyebrow color={color}>{l.eyebrow}</BSEyebrow>
                  <BSEyebrow>{l.usedCount} uses</BSEyebrow>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                  <div style={{ fontFamily: t.DISPLAY, fontSize: 19, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{l.name}</div>
                  <span style={{ flexShrink: 0, fontFamily: t.MONO, fontSize: 13, color: t.INK50, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }}>▾</span>
                </div>
                <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 9.5, color: t.INK70, letterSpacing: '0.06em' }}>{l.count} items · {l.preview}</div>
              </div>
              {open && previewItems && previewItems.length > 0 && (
                <div style={{ borderRadius: 12, border: `1px solid ${t.HAIR}`, background: t.PAPER, margin: '12px 0 2px', overflow: 'hidden' }}>
                  {previewItems.map((it, idx) => (
                    <div key={it.id || idx} style={{
                      display: 'grid', gridTemplateColumns: '64px 1fr', gap: 10, padding: '10px 12px',
                      borderBottom: idx === previewItems.length - 1 ? 0 : `1px solid ${t.HAIR}`,
                    }}>
                      <span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK70, fontWeight: 700, letterSpacing: '0.06em' }}>{it.q}</span>
                      <span>
                        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, fontWeight: 700, letterSpacing: '-0.01em' }}>{it.n}</span>
                        {it.meals && <span style={{ display: 'block', fontFamily: t.MONO, fontSize: 9, color: t.INK50, letterSpacing: '0.08em', marginTop: 2, textTransform: 'uppercase' }}>{it.meals}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 12 }}>
                <button onClick={() => onLoad(l)} style={{ ...btn, background: t.INK, color: t.PAPER, border: 0 }}>Load →</button>
                <button onClick={() => onEdit(l)} style={{ ...btn, background: 'transparent', color: t.INK, border: `1px solid ${t.RULE}` }}>Edit</button>
                {l.kind === 'mealplan' && (
                  <button onClick={() => onDuplicate(l)} style={{ ...btn, background: 'transparent', color: t.INK, border: `1px solid ${t.RULE}` }}>Duplicate</button>
                )}
                {l.kind === 'custom' && (
                  <button onClick={() => onDelete(l)} style={{ ...btn, background: 'transparent', color: t.RUST, border: `1px solid ${t.RUST}66` }}>Delete</button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <BSFooter right="Library" />
    </BSPage>
  );
}

// ═══════════════════════════════════════════════════════════
// SETTINGS — full settings page from avatar tap
// ═══════════════════════════════════════════════════════════
// Full IANA time-zone list for the Settings dropdown (falls back to a curated
// set on engines without Intl.supportedValuesOf).
const BS_TIMEZONES = (() => {
  try { if (typeof Intl.supportedValuesOf === 'function') return Intl.supportedValuesOf('timeZone'); } catch (e) {}
  return ['America/Los_Angeles', 'America/Denver', 'America/Chicago', 'America/New_York', 'America/Anchorage', 'Pacific/Honolulu', 'America/Sao_Paulo', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Europe/Madrid', 'Europe/Athens', 'Africa/Johannesburg', 'Asia/Dubai', 'Asia/Kolkata', 'Asia/Singapore', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney', 'Pacific/Auckland', 'UTC'];
})();

function BSSettings({ onBack, onLogout, tweaks = {}, setTweak = () => {}, initialPage = '' }) {
  const t = useBS();
  const r = useBSRadio();
  const [showContact, setShowContact] = useStateBSC(false);
  const [showTerms, setShowTerms] = useStateBSC(false);
  const [showHelp, setShowHelp] = useStateBSC(false);
  const [showPrivacy, setShowPrivacy] = useStateBSC(false);
  const [showAbout, setShowAbout] = useStateBSC(initialPage === 'about-shape');
  const [showPricing, setShowPricing] = useStateBSC(initialPage === 'pricing');
  const [showSessions, setShowSessions] = useStateBSC(false);
  const [showNotifications, setShowNotifications] = useStateBSC(false);
  const [showIntegrations, setShowIntegrations] = useStateBSC(initialPage === 'integrations');
  const [showAppearance, setShowAppearance] = useStateBSC(false);
  const [appearTab, setAppearTab] = useStateBSC('paper');
  const [showLightFx, setShowLightFx] = useStateBSC(false);
  const [detail, setDetail] = useStateBSC(''); // '' = settings page; else a drill-in card pane
  const [showScore, setShowScore] = useStateBSC(false);
  const [showStore, setShowStore] = useStateBSC(false);
  const [showProgress, setShowProgress] = useStateBSC(false);
  const [showPublicProfile, setShowPublicProfile] = useStateBSC(false);
  const scoreProfile = SHAPE_SCORE_PROFILES.client;

  // Live subscription for the "Your plan" card. null until loaded; { active:false }
  // when there's no active subscription (free) — then we show the upgrade copy.
  const [plan, setPlan] = useStateBSC(null);
  React.useEffect(() => {
    let cancelled = false;
    fetch('/api/stripe/subscription', { credentials: 'same-origin', cache: 'no-store' })
      .then(r => (r.ok ? r.json() : null))
      .then(d => { if (!cancelled && d) setPlan(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Persisted user preferences for the Notifications / Preferences / Privacy
  // rows. Tapping a row cycles to the next option and saves to user_goals so
  // the choice sticks across sessions (same store the home ticker uses).
  const PREF_OPTIONS = {
    workoutReminders:  ['On · 30m before', 'On · 1h before', 'On · 2h before', 'Off'],
    coachReplies:      ['Push + email', 'Push only', 'Email only', 'Off'],
    weeklyDigest:      ['Sun 7am', 'Mon 7am', 'Fri 5pm', 'Off'],
    community:         ['Off', 'Mentions only', 'All activity'],
    units:             ['Imperial · lb / mi', 'Metric · kg / km'],
    weekStarts:        ['Monday', 'Sunday'],
    timeZone:          ['America/Los_Angeles', 'America/New_York', 'America/Chicago', 'America/Denver', 'Europe/London', 'UTC'],
    language:          ['English (US)', 'English (UK)', 'Español', 'Français', 'Deutsch'],
    profileVisibility: ['Public', 'Just friends', 'Private'],
    onlineVisible:     ['On', 'Off'],
    shareWorkoutData:  ['On', 'Off'],
    mealBreakfast:     BS_MEAL_TIME_OPTS,
    mealLunch:         BS_MEAL_TIME_OPTS,
    mealSnack:         BS_MEAL_TIME_OPTS,
    mealDinner:        BS_MEAL_TIME_OPTS,
    trainingPhase:     ['Build', 'Cut', 'Peak', 'Maintain', 'Deload', 'Base'],
    nutritionPhase:    ['Cut', 'Bulk', 'Maintain', 'Recomp', 'Refeed'],
  };
  const PREF_DEFAULTS = { ...Object.fromEntries(Object.entries(PREF_OPTIONS).map(([k, v]) => [k, v[0]])),
    mealBreakfast: '8:00 AM', mealLunch: '12:30 PM', mealSnack: '4:00 PM', mealDinner: '7:00 PM' };
  const [prefs, setPrefs] = useStateBSC(PREF_DEFAULTS);
  React.useEffect(() => {
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    let alive = true;
    window.shapeDb.getUserGoals('client_settings').then(s => {
      if (alive && s && typeof s === 'object') {
        setPrefs(p => ({ ...p, ...s }));
        if (s.units) window.ShapeUnits?.set(s.units);
        try { window.ShapeOnlineVisible = (s.onlineVisible !== 'Off'); window.dispatchEvent(new Event('shape:identity')); } catch (e) {}
        window.ShapeMealTimes?.setFromPrefs({ ...PREF_DEFAULTS, ...s });
        if (s.trainingPhase || s.nutritionPhase) window.ShapeProgram?.set?.({ trainingPhase: s.trainingPhase, nutritionPhase: s.nutritionPhase });
      }
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  // Seed the meal-time cache from defaults immediately (before the async load).
  React.useEffect(() => { window.ShapeMealTimes?.setFromPrefs(PREF_DEFAULTS); }, []);
  const cyclePref = (key, label) => {
    const opts = PREF_OPTIONS[key];
    if (!opts) return;
    setPrefs(p => {
      const idx = Math.max(0, opts.indexOf(p[key]));
      const next = { ...p, [key]: opts[(idx + 1) % opts.length] };
      try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_settings', next); } catch (e) {}
      if (key === 'units') window.ShapeUnits?.set(next[key]); // propagate app-wide
      if (key.startsWith('meal')) window.ShapeMealTimes?.setFromPrefs(next);
      if (key === 'onlineVisible') { try { window.ShapeOnlineVisible = (next[key] !== 'Off'); window.ShapePresence?.setVisible?.(next[key] !== 'Off'); window.dispatchEvent(new Event('shape:identity')); } catch (e) {} }
      if (key === 'trainingPhase' || key === 'nutritionPhase') { window.ShapeProgram?.set?.({ [key]: next[key] }); try { window.ShapeProgramApi?.set?.({ [key]: next[key] }); } catch (e) {} }
      return next;
    });
  };
  const setPref = (key, value) => {
    setPrefs(p => {
      if (p[key] === value) return p;
      const next = { ...p, [key]: value };
      try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_settings', next); } catch (e) {}
      if (key === 'units') window.ShapeUnits?.set(value);
      if (key.startsWith('meal')) window.ShapeMealTimes?.setFromPrefs(next);
      if (key === 'onlineVisible') { try { window.ShapeOnlineVisible = (next[key] !== 'Off'); window.ShapePresence?.setVisible?.(next[key] !== 'Off'); window.dispatchEvent(new Event('shape:identity')); } catch (e) {} }
      if (key === 'trainingPhase' || key === 'nutritionPhase') { window.ShapeProgram?.set?.({ [key]: next[key] }); try { window.ShapeProgramApi?.set?.({ [key]: next[key] }); } catch (e) {} }
      return next;
    });
  };

  // Stripe Customer Portal — billing UI for card / cancel / invoices.
  const openBillingPortal = async () => {
    // Needs a signed-in session to resolve the Stripe customer; surface a
    // clear prompt instead of the raw "Authentication required" error when
    // browsing logged-out (e.g. the demo /m/ preview).
    const loggedIn = !!(window.ShapeAuth?.getCachedState?.()?.user?.id);
    if (!loggedIn) { window.__bsToast?.('Sign in to manage your membership', 'info'); return; }
    try {
      const res = await fetch('/api/stripe/billing-portal', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ returnPath: '/m/' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) window.location.href = data.url;
      else if (res.status === 401) window.__bsToast?.('Sign in to manage your membership', 'info');
      else window.__bsToast?.(data?.error || 'Billing portal unavailable', 'err');
    } catch (e) {
      window.__bsToast?.('Billing portal unavailable', 'err');
    }
  };

  // Upgrade (free → Shape membership). No account yet → route to create-account
  // (the shared gate). Signed in → Stripe Checkout (the billing portal only
  // manages an existing subscription, so a free user can't use it).
  const openUpgradeCheckout = async () => {
    if (window.bsRequireAccount && !window.bsRequireAccount('become a Shape member')) return;
    try {
      const res = await fetch('/api/stripe/platform-checkout', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ successPath: '/m/', cancelPath: '/m/' }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.url) window.location.href = data.url;
      else if (res.status === 401) { if (window.__bsGoAuth) window.__bsGoAuth('create'); else window.__bsToast?.('Create an account to become a Shape member', 'info'); }
      else window.__bsToast?.(data?.error || 'Upgrade unavailable right now', 'err');
    } catch (e) {
      window.__bsToast?.('Upgrade unavailable right now', 'err');
    }
  };

  const requestAccountAction = async (action) => {
    const confirms = {
      Export: 'Email a copy of all your data to the address on file?',
      Pause: 'Pause your membership? You keep your data and can resume anytime.',
      Delete: 'Permanently delete your account and all data? This cannot be undone.',
    };
    if (!window.confirm(confirms[action] || `Confirm ${action}?`)) return;
    try {
      await fetch('/api/me/account-action', {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      }).catch(() => null);
      window.__bsToast?.(`${action} request submitted — we’ll email a confirmation.`, 'ok');
      if (action === 'Delete') setTimeout(onLogout, 1500);
    } catch (err) {
      window.__bsToast?.(`${action} failed`, 'err');
    }
  };

  // Home ticker editor — which metrics show + order (saved to user_goals).
  const [tickerPrefs, setTickerPrefs] = useStateBSC({ hidden: [], order: BS_TICKER_METRICS.map(m => m.key) });
  React.useEffect(() => {
    if (!(window.shapeDb && window.shapeDb.getUserGoals)) return undefined;
    let alive = true;
    window.shapeDb.getUserGoals('client_ticker').then(s => {
      if (!alive || !s || typeof s !== 'object') return;
      const order = Array.isArray(s.order) && s.order.length ? s.order : BS_TICKER_METRICS.map(m => m.key);
      setTickerPrefs({ hidden: Array.isArray(s.hidden) ? s.hidden : [], order });
    }).catch(() => {});
    return () => { alive = false; };
  }, []);
  const saveTicker = (next) => {
    setTickerPrefs(next);
    try { window.shapeDb && window.shapeDb.saveUserGoals && window.shapeDb.saveUserGoals('client_ticker', next); } catch (e) {}
  };
  const tickerToggle = (key) => {
    const hidden = tickerPrefs.hidden.includes(key) ? tickerPrefs.hidden.filter(k => k !== key) : [...tickerPrefs.hidden, key];
    saveTicker({ ...tickerPrefs, hidden });
  };
  const tickerMove = (key, dir) => {
    const order = [...(tickerPrefs.order || BS_TICKER_METRICS.map(m => m.key))];
    const i = order.indexOf(key);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= order.length) return;
    [order[i], order[j]] = [order[j], order[i]];
    saveTicker({ ...tickerPrefs, order });
  };

  // Coach-only "pause new bookings" (at_capacity). null until loaded / for
  // non-coach accounts (no provider row), in which case the block is hidden.
  const [capacity, setCapacityState] = useStateBSC(null);
  const [capacityBusy, setCapacityBusy] = useStateBSC(false);
  const isCoachRole = tweaks.role === 'trainer' || tweaks.role === 'nutritionist';
  // Accounts/roles this person actually created — the Profile-mode switcher only
  // shows for people with more than one, and only lists the ones they made.
  const accountRoles = (() => {
    const p = window.ShapeAuth?.getCachedState?.()?.profile;
    const raw = p && Array.isArray(p.roles) ? p.roles : [];
    const norm = raw
      .map(x => String(x || '').toLowerCase())
      .map(x => (x === 'nutrition' ? 'nutritionist' : x))
      .filter(x => x === 'client' || x === 'trainer' || x === 'nutritionist');
    return Array.from(new Set(norm));
  })();
  const hasMultipleAccounts = accountRoles.length > 1;
  // Refresh the cached profile when Settings opens so a role granted since sign-in
  // (e.g. an approved trainer/nutritionist application) shows up in the Profile-mode
  // switcher without needing a re-login. The tick just forces a re-render so the
  // accountRoles read above recomputes from the freshened cache.
  const [, setProfileRefreshTick] = useStateBSC(0);
  React.useEffect(() => {
    let cancelled = false;
    if (window.ShapeAuth?.getCurrentSession) {
      Promise.resolve(window.ShapeAuth.getCurrentSession())
        .then(() => { if (!cancelled) setProfileRefreshTick(n => n + 1); })
        .catch(() => {});
    }
    return () => { cancelled = true; };
  }, []);
  React.useEffect(() => {
    // Booking capacity is a coach-only control — never load it for clients.
    if (!isCoachRole) { setCapacityState(null); return undefined; }
    let cancelled = false;
    window.ShapeBookings?.getCapacity?.()
      .then(c => { if (!cancelled && c) setCapacityState(c); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isCoachRole]);
  const toggleCapacity = async () => {
    if (!capacity || capacityBusy) return;
    const next = !capacity.atCapacity;
    setCapacityBusy(true);
    setCapacityState({ ...capacity, atCapacity: next }); // optimistic
    try {
      const res = await window.ShapeBookings.setCapacity({ atCapacity: next });
      setCapacityState(c => ({ ...c, atCapacity: res.atCapacity, resumeAt: res.resumeAt }));
      window.__bsToast?.(next ? 'Paused — new bookings are off' : 'Open for bookings again', 'ok');
    } catch (e) {
      setCapacityState(c => ({ ...c, atCapacity: !next })); // revert
      window.__bsToast?.(e?.message || 'Could not update bookings', 'err');
    } finally {
      setCapacityBusy(false);
    }
  };

  // Live Shape Score tier for the profile header (user-scoped — reflects the
  // signed-in client / trainer / nutritionist's current tier).
  const settingsScore = _bsUseLiveScore(SHAPE_SCORE_PROFILES.client);
  const settingsTierC = bsTierColor(settingsScore.tier);

  // Identity editing — seed name/handle from the signed-in account so the profile
  // matches before any edit; a saved client_identity (below) then overrides.
  const _myName = bsMyName();
  const [identity, setIdentity] = useStateBSC({
    name: _myName,
    handle: _myName === 'Alex Rivera' ? '@alex.rivera' : '@' + _myName.toLowerCase().replace(/[^a-z0-9]+/g, '.').replace(/(^\.+|\.+$)/g, ''),
    initials: '', // optional custom avatar initials (max 2); blank = derive from name
    location: 'Brooklyn, NY',
    bio: 'Cutting for summer. 14-week streak. Logging the wins and the pizza.',
    accent: '#c0533b',
    pronouns: '',
    link: '',
    goal: 'Lose fat',
  });
  const [editing, setEditing] = useStateBSC(false);
  const [draft, setDraft] = useStateBSC(identity);
  // Persist the profile identity across sessions/devices via user_goals.
  React.useEffect(() => {
    if (!window.shapeDb?.getUserGoals) return;
    window.shapeDb.getUserGoals('client_identity').then(d => {
      if (d && typeof d === 'object' && Object.keys(d).length) {
        setIdentity(prev => ({ ...prev, ...d }));
        try { window.ShapeIdentity = { ...(window.ShapeIdentity || {}), ...d }; } catch (e) {}
      }
    }).catch(() => {});
  }, []);
  const startEdit = () => { setDraft(identity); setEditing(true); };
  const saveEdit  = () => {
    setIdentity(draft); setEditing(false);
    // Merge over the stored identity so the avatar photo (and any other fields
    // saved separately, e.g. by the photo picker) are preserved, not clobbered.
    try {
      const photo = (typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || null;
      const save = (existing) => { try { window.shapeDb?.saveUserGoals?.('client_identity', { ...(existing || {}), ...draft, ...(photo ? { photo } : {}) }); } catch (e) {} };
      const p = window.shapeDb?.getUserGoals?.('client_identity');
      if (p && p.then) p.then(save).catch(() => save(null)); else save(null);
    } catch (e) {}
    // Sync the primary goal to the Goal page's store so the two always match.
    try {
      const g = window.shapeDb?.getUserGoals?.('client_goals');
      const applyG = (cur) => { try { window.shapeDb?.saveUserGoals?.('client_goals', { ...(cur || {}), primaryGoal: draft.goal || '' }); } catch (e) {} };
      if (g && g.then) g.then(applyG).catch(() => applyG(null)); else applyG(null);
      window.dispatchEvent(new Event('shape:goals'));
    } catch (e) {}
    // Mirror the display name to the auth-cached profile so other surfaces pick it up.
    try { window.ShapeAuth?.updateProfileName?.(draft.name); } catch (e) {}
    // Cache the custom initials globally so every avatar (header + feed) updates,
    // then signal a re-render so the current screen reflects it without navigating.
    try { window.ShapeIdentity = { ...(window.ShapeIdentity || {}), initials: draft.initials || '', name: draft.name }; } catch (e) {}
    try { window.dispatchEvent(new Event('shape:identity')); } catch (e) {}
  };
  const cancelEdit = () => setEditing(false);

  // Editable account fields (Account pane) — edited via an in-app sheet.
  const [account, setAccount] = useStateBSC({ email: 'alex@rivera.co', phone: '+1 (415) 555-0144', twoFactor: true });
  const [editField, setEditField] = useStateBSC(null); // { key, label, value, type, placeholder }
  // Custom Shape-styled dropdown (replaces the native <select> picker).
  const [dropdown, setDropdown] = useStateBSC(null); // { key, label, options, top, right }
  const openDropdown = (e, s) => {
    const r = e.currentTarget.getBoundingClientRect();
    setDropdown({ key: s.key, label: s.l, options: s.dropdown, top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) });
  };
  React.useEffect(() => {
    if (!dropdown) return undefined;
    const close = () => setDropdown(null);
    window.addEventListener('scroll', close, true);
    window.addEventListener('wheel', close, { passive: true });
    window.addEventListener('touchmove', close, { passive: true });
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('wheel', close);
      window.removeEventListener('touchmove', close);
    };
  }, [dropdown]);
  const openAccountEdit = (key, label, opts = {}) => setEditField({ key, label, value: opts.value != null ? opts.value : (account[key] || ''), type: opts.type || 'text', placeholder: opts.placeholder || '' });
  const saveEditField = () => {
    if (!editField) return;
    const v = String(editField.value || '').trim();
    if (!v) { setEditField(null); return; }
    if (editField.key === 'password') {
      window.__bsToast?.('Password updated', 'ok');
    } else {
      setAccount(a => ({ ...a, [editField.key]: v }));
      window.__bsToast?.(`${editField.label} updated`, 'ok');
    }
    setEditField(null);
  };
  const toggleTwoFactor = () => setAccount(a => {
    const twoFactor = !a.twoFactor;
    window.__bsToast?.(`Two-factor ${twoFactor ? 'enabled' : 'disabled'}`, 'ok');
    return { ...a, twoFactor };
  });

  // Appearance / Effects controls — render natively
  const Pill = ({ on, onClick, children, color }) => (
    <button onClick={onClick} style={{ borderRadius: t.RADIUS_SM,
      flex: 1, padding: '10px 11px', cursor: 'pointer',
      border: `1px solid ${on ? t.INK : t.RULE}`,
      background: on ? t.INK : 'transparent',
      color: on ? t.PAPER : t.INK,
      fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
    }}>{children}</button>
  );

  const Toggle = ({ on, onClick }) => (
    <button onClick={onClick} style={{
      width: 46, height: 26, borderRadius: 999, padding: 3, cursor: 'pointer',
      border: 0, background: on ? t.ACCENT : t.RULE,
      display: 'flex', alignItems: 'center', justifyContent: on ? 'flex-end' : 'flex-start',
      transition: 'background 140ms ease',
    }}>
      <span style={{ width: 20, height: 20, borderRadius: 999, background: '#fff', display: 'block', boxShadow: '0 1px 3px rgba(0,0,0,0.35)' }} />
    </button>
  );

  const Swatch = ({ k, color, label }) => (
    <button onClick={() => setTweak('accentKey', k)} style={{ borderRadius: t.RADIUS_SM,
      flex: 1, padding: 5, cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
      border: `1px solid ${tweaks.accentKey === k ? t.INK : t.RULE}`,
      background: tweaks.accentKey === k ? t.PAPER2 : 'transparent',
    }}>
      <span style={{ width: 20, height: 20, background: color, border: `1px solid ${t.INK}` }} />
      <span style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK, letterSpacing: '0.12em', textTransform: 'uppercase', fontWeight: 700 }}>{label}</span>
    </button>
  );

  // Lighter, floating section header (no teal bar / no 2px box border) —
  // matches the Me-page style: big serif title + small right-side meta.
  const SectionHead = ({ title, meta }) => (
    <div style={{ padding: `20px ${t.padX}px 4px`, display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10 }}>
      <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>{title}</div>
      {meta ? <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, flexShrink: 0 }}>{meta}</span> : null}
    </div>
  );

  // Line icons for the section cards.
  const Icon = ({ name, color }) => {
    const c = color || t.INK;
    const paths = {
      user: <><circle cx="12" cy="8" r="3.4" /><path d="M5.5 19c.8-3.3 3.4-5 6.5-5s5.7 1.7 6.5 5" /></>,
      bell: <><path d="M6 9a6 6 0 1 1 12 0c0 4 1.2 5.5 2 6.5H4c.8-1 2-2.5 2-6.5Z" /><path d="M10 19a2 2 0 0 0 4 0" /></>,
      lock: <><rect x="5" y="10.5" width="14" height="9" rx="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /></>,
      sliders: <><path d="M4 7h16M4 12h16M4 17h16" /><circle cx="9" cy="7" r="2" fill={c} stroke="none" /><circle cx="15" cy="12" r="2" fill={c} stroke="none" /><circle cx="8" cy="17" r="2" fill={c} stroke="none" /></>,
      link: <><path d="M9 15l6-6" /><path d="M11 6.5l1-1a3.5 3.5 0 0 1 5 5l-1 1" /><path d="M13 17.5l-1 1a3.5 3.5 0 0 1-5-5l1-1" /></>,
      life: <><circle cx="12" cy="12" r="8" /><circle cx="12" cy="12" r="3.2" /><path d="M14.3 9.7 17 7M9.7 9.7 7 7M14.3 14.3 17 17M9.7 14.3 7 17" /></>,
      shield: <><path d="M12 3.5 19 6v5c0 4.5-3 8-7 9.5C8 19 5 15.5 5 11V6Z" /><path d="m9 12 2 2 4-4" /></>,
    };
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        {paths[name] || paths.user}
      </svg>
    );
  };

  const HubCard = ({ icon, title, summary, onClick, accent }) => (
    <button onClick={onClick} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 12,
      padding: '11px 12px', borderRadius: 14, cursor: 'pointer', textAlign: 'left',
      border: `1px solid ${t.RULE}`, background: t.PAPER2,
    }}>
      <span style={{ width: 38, height: 38, flexShrink: 0, borderRadius: 11, border: `1px solid ${t.RULE}`, background: t.PAPER, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon name={icon} color={accent || t.INK} />
      </span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{title}</span>
        {summary ? <span style={{ display: 'block', marginTop: 2, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{summary}</span> : null}
      </span>
      <span style={{ flexShrink: 0, color: t.INK50, fontSize: 20, fontFamily: t.DISPLAY, lineHeight: 1 }}>›</span>
    </button>
  );

  const DetailBack = ({ title }) => (
    <>
      <div style={{ padding: `62px ${t.padX}px 2px` }}>
        <button onClick={() => setDetail('')} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK, display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Settings</button>
      </div>
      <div style={{ padding: `12px ${t.padX}px 6px` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 30, fontWeight: 700, color: t.INK, letterSpacing: '-0.03em', lineHeight: 1 }}>{title}</div>
      </div>
    </>
  );

  // Shared row renderer (dropdown / segmented / link rows) for the detail panes.
  const renderRows = (rows) => (
    <div style={{ padding: `4px ${t.padX}px` }}>
      {rows.map((s, i, arr) => {
        const rowBorder = i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`;
        if (s.dropdown) {
          return (
            <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: `${t.rowY + 12}px 0`, borderBottom: rowBorder }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: t.INK, letterSpacing: '-0.01em', flexShrink: 0 }}>{s.l}</span>
              <button onClick={(e) => openDropdown(e, s)} style={{
                maxWidth: '64%', background: 'transparent', border: 0, outline: 'none', padding: 0, cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, color: t.ACCENT, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.1em', textTransform: 'uppercase',
              }}>
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{prefs[s.key]}</span>
                <span style={{ fontSize: 8, opacity: 0.7, flexShrink: 0 }}>▾</span>
              </button>
            </div>
          );
        }
        if (s.segmented) {
          return (
            <div key={i} style={{ padding: `${t.rowY + 12}px 0`, borderBottom: rowBorder }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: t.INK, letterSpacing: '-0.01em' }}>{s.l}</span>
              <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                {s.segmented.map((opt, j) => {
                  const on = prefs[s.key] === opt;
                  return (
                    <button key={opt} onClick={() => setPref(s.key, opt)} style={{ borderRadius: t.RADIUS_SM,
                      flex: 1, padding: '9px 8px', cursor: 'pointer',
                      border: `1px solid ${on ? t.INK : t.RULE}`,
                      background: on ? t.INK : 'transparent',
                      color: on ? t.PAPER : t.INK,
                      fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap',
                    }}>{(s.segLabels && s.segLabels[j]) || opt}</button>
                  );
                })}
              </div>
            </div>
          );
        }
        const value = s.key ? prefs[s.key] : s.r;
        const onTap = s.key ? () => cyclePref(s.key, s.l) : (s.action || undefined);
        return (
          <div key={i} onClick={onTap} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
            padding: `${t.rowY + 12}px 0`, borderBottom: rowBorder,
            cursor: (s.action || (s.key && !s.segmented && !s.dropdown)) ? 'pointer' : 'default',
          }}>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: s.alert ? t.RUST : t.INK, letterSpacing: '-0.01em', flexShrink: 0 }}>{s.l}</span>
            {value && <BSEyebrow color={s.key ? t.ACCENT : undefined}>{value}</BSEyebrow>}
          </div>
        );
      })}
    </div>
  );

  if (showContact) {
    return <BSContactPage onBack={() => setShowContact(false)} />;
  }
  if (showTerms) {
    return <BSTermsPage onBack={() => setShowTerms(false)} onContact={() => { setShowTerms(false); setShowContact(true); }} />;
  }
  if (showHelp) {
    return <BSHelpPage onBack={() => setShowHelp(false)} onContact={() => { setShowHelp(false); setShowContact(true); }} />;
  }
  if (showPrivacy) {
    return <BSPrivacyPage onBack={() => setShowPrivacy(false)} onContact={() => { setShowPrivacy(false); setShowContact(true); }} />;
  }
  if (showAbout) {
    return <BSAboutPage onBack={() => setShowAbout(false)} />;
  }
  if (showPricing) {
    return <BSPricingPage onBack={() => setShowPricing(false)} />;
  }
  if (showSessions) {
    return <BSSessionsScreen onBack={() => setShowSessions(false)} />;
  }
  if (showNotifications) {
    return <BSNotifications onBack={() => setShowNotifications(false)} onRoute={(route) => { if (route === 'sessions') { setShowNotifications(false); setShowSessions(true); } }} />;
  }
  if (showIntegrations) {
    return <BSIntegrationsPage onBack={() => setShowIntegrations(false)} />;
  }
  if (showScore) {
    return <BSShapeScorePage profile={scoreProfile} onBack={() => setShowScore(false)} onOpenStore={() => { setShowScore(false); setShowStore(true); }} />;
  }
  if (showStore) {
    return <BSShapeStorePage profile={scoreProfile} onBack={() => setShowStore(false)} onOpenScore={() => { setShowStore(false); setShowScore(true); }} />;
  }
  if (showProgress) {
    return <BSClientProgress onBack={() => setShowProgress(false)} />;
  }
  if (showPublicProfile) {
    const role = (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().profile && window.ShapeAuth.getCachedState().profile.role) || 'client';
    const uid = (window.ShapeAuth && window.ShapeAuth.getCachedState && window.ShapeAuth.getCachedState().user && window.ShapeAuth.getCachedState().user.id) || null;
    const kind = role === 'trainer' ? 'TRAINER' : role === 'nutritionist' ? 'NUTRI' : 'CLIENT';
    return <BSPublicProfile person={{ who: identity.name, init: (identity.initials || '').trim().toUpperCase().slice(0, 2) || bsInitials(identity.name), kind, userId: uid, photo: (typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || null }} isSelf onBack={() => setShowPublicProfile(false)} onEdit={() => { setShowPublicProfile(false); setEditing(true); }} />;
  }

  const sections = [
    {
      title: 'Account',
      meta: 'Pro · annual',
      rows: [
        { l: 'Email',           r: account.email, action: () => openAccountEdit('email', 'Email', { type: 'email' }) },
        { l: 'Phone',           r: account.phone, action: () => openAccountEdit('phone', 'Phone', { type: 'tel' }) },
        { l: 'Password',        r: 'Change', action: () => openAccountEdit('password', 'Password', { type: 'password', value: '', placeholder: 'New password' }) },
        { l: 'Two-factor auth', r: account.twoFactor ? 'On' : 'Off', action: toggleTwoFactor },
      ],
    },
    {
      title: 'Health integrations',
      meta: '2 connected',
      rows: [
        { l: 'Manage integrations', r: 'Open', action: () => setShowIntegrations(true) },
        { l: 'Apple Health',    r: 'iOS app' },
        { l: 'WHOOP',           r: 'Connected' },
        { l: 'Garmin',          r: 'Connect' },
        { l: 'Strava',          r: 'Connect' },
        { l: 'Spotify',         r: 'Connect' },
      ],
    },
    {
      title: 'Notifications',
      meta: (prefs.workoutReminders !== 'Off' || prefs.coachReplies !== 'Off' || prefs.weeklyDigest !== 'Off') ? 'On' : 'Off',
      rows: [
        { l: 'Workout reminders', key: 'workoutReminders' },
        { l: 'Coach replies',     key: 'coachReplies' },
        { l: 'Weekly digest',     key: 'weeklyDigest' },
        { l: 'Community',         key: 'community' },
      ],
    },
    {
      title: 'Preferences',
      meta: '',
      rows: [
        { l: 'Units',           key: 'units', segmented: PREF_OPTIONS.units, segLabels: ['Imperial', 'Metric'] },
        { l: 'Week starts',     key: 'weekStarts', dropdown: PREF_OPTIONS.weekStarts },
        { l: 'Time zone',       key: 'timeZone', dropdown: BS_TIMEZONES },
        { l: 'Language',        key: 'language', dropdown: PREF_OPTIONS.language },
        { l: 'Breakfast time',  key: 'mealBreakfast', dropdown: PREF_OPTIONS.mealBreakfast },
        { l: 'Lunch time',      key: 'mealLunch',     dropdown: PREF_OPTIONS.mealLunch },
        { l: 'Snack time',      key: 'mealSnack',     dropdown: PREF_OPTIONS.mealSnack },
        { l: 'Dinner time',     key: 'mealDinner',    dropdown: PREF_OPTIONS.mealDinner },
        { l: 'Training phase',  key: 'trainingPhase', dropdown: PREF_OPTIONS.trainingPhase },
        { l: 'Nutrition phase', key: 'nutritionPhase', dropdown: PREF_OPTIONS.nutritionPhase },
      ],
    },
    {
      title: 'Privacy & data',
      meta: '',
      rows: [
        { l: 'Profile visibility', key: 'profileVisibility', segmented: PREF_OPTIONS.profileVisibility },
        { l: 'Show when I’m online', key: 'onlineVisible', segmented: PREF_OPTIONS.onlineVisible },
        { l: 'Share workout data', key: 'shareWorkoutData' },
      ],
    },
    {
      title: 'About',
      meta: 'v6.38.2',
      rows: [
        { l: 'About Shape',     r: 'Our story', action: () => setShowAbout(true) },
        { l: 'Pricing',         r: '$5 / mo', action: () => setShowPricing(true) },
        { l: 'Help center',     r: 'Visit', action: () => setShowHelp(true) },
        { l: 'Contact support', r: '24h reply', action: () => setShowContact(true) },
        { l: 'Terms of service',r: 'Legal', action: () => setShowTerms(true) },
        { l: 'Privacy policy',  r: 'Legal', action: () => setShowPrivacy(true) },
      ],
    },
  ];

  const findSec = (title) => sections.find(s => s.title === title) || { rows: [] };
  const notifOn = ['workoutReminders', 'coachReplies', 'weeklyDigest', 'community'].filter(k => prefs[k] !== 'Off').length;
  const accountActionRows = [
    { l: 'Export all my data', r: 'Request file', act: 'Export' },
    { l: 'Pause membership', r: 'Keep account', act: 'Pause' },
    { l: 'Delete account', r: 'Permanent', act: 'Delete', alert: true },
  ];
  const settingCards = [
    { icon: 'user',    title: 'Account',            summary: 'Email · password · 2FA',                                            detail: 'account' },
    { icon: 'link',    title: 'Health integrations', summary: 'Apple Health · WHOOP · Strava',                                     detail: 'health' },
    { icon: 'bell',    title: 'Notifications',       summary: `${notifOn} of 4 active`,                                            detail: 'notifications' },
    { icon: 'sliders', title: 'Preferences',         summary: `${prefs.units.split(' ')[0]} · ${prefs.language.split(' ')[0]} · ${prefs.weekStarts}`, detail: 'preferences' },
    { icon: 'lock',    title: 'Privacy & data',      summary: `Profile · ${prefs.profileVisibility}`,                             detail: 'privacy' },
    { icon: 'life',    title: 'About',               summary: 'Help · contact · legal',                                           detail: 'about' },
    { icon: 'shield',  title: 'Account actions',     summary: 'Export · pause · delete',                                          detail: 'accountactions', accent: t.RUST },
  ];

  return (
    <BSPage tabBarHeight={0}>
      <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

      {/* ── DRILL-IN CARD PANES ── */}
      {detail === 'account' && (<><DetailBack title="Account" />{renderRows(findSec('Account').rows)}</>)}
      {detail === 'health' && (<><DetailBack title="Health integrations" />{renderRows(findSec('Health integrations').rows)}</>)}
      {detail === 'notifications' && (<><DetailBack title="Notifications" />{renderRows(findSec('Notifications').rows)}</>)}
      {detail === 'preferences' && (<><DetailBack title="Preferences" />{renderRows(findSec('Preferences').rows)}</>)}
      {detail === 'privacy' && (<><DetailBack title="Privacy & data" />{renderRows(findSec('Privacy & data').rows)}</>)}
      {detail === 'about' && (<><DetailBack title="About" />{renderRows(findSec('About').rows)}</>)}
      {detail === 'accountactions' && (<>
        <DetailBack title="Account actions" />
        <div style={{ padding: `4px ${t.padX}px` }}>
          {accountActionRows.map((s, i, arr) => (
            <div key={i} onClick={() => requestAccountAction(s.act)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: `${t.rowY + 12}px 0`, borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`, cursor: 'pointer' }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 500, color: s.alert ? t.RUST : t.INK, letterSpacing: '-0.01em' }}>{s.l}</span>
              {s.r && <BSEyebrow>{s.r}</BSEyebrow>}
            </div>
          ))}
        </div>
      </>)}

      {/* ── SETTINGS PAGE ── */}
      {!detail && (<>
      <div style={{ padding: `62px ${t.padX}px 2px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK, display: 'inline-flex', alignItems: 'center', gap: 6 }}>← Back</button>
        <button onClick={startEdit} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.ACCENT }}>Edit</button>
      </div>

      {/* Coach-only — pause new bookings (at capacity) */}
      {capacity && isCoachRole && (
        <div style={{ padding: `16px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}`, background: capacity.atCapacity ? t.PAPER2 : 'transparent' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ minWidth: 0 }}>
              <BSEyebrow color={capacity.atCapacity ? t.RUST : t.GREEN}>{capacity.atCapacity ? 'At capacity' : 'Open for bookings'}</BSEyebrow>
              <div style={{ marginTop: 4, fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK, letterSpacing: '-0.015em' }}>Pause new bookings</div>
              <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.4 }}>
                {capacity.atCapacity ? 'New clients see an “at capacity” notice — subscribe, book & buy are blocked.' : 'Turn on to stop new subscriptions, bookings and purchases.'}
              </div>
            </div>
            <Toggle on={capacity.atCapacity} onClick={toggleCapacity} />
          </div>
        </div>
      )}

      {/* Identity card */}
      <div style={{ padding: `14px ${t.padX}px 16px` }}>
        {!editing ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <BSFacetAvatar size={72} c={bsMyTierColor()} initial={(identity.initials || '').trim().toUpperCase().slice(0, 2) || bsInitials(identity.name) || 'A'} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || null} rank={bsTierRank(settingsScore.tier)} live={bsAmLive()} BG={t.PAPER} />
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700 }}>
                  <span style={{ color: settingsTierC, fontWeight: 800 }}>{settingsScore.tier} tier</span>
                  <span style={{ color: t.INK50 }}>·</span>
                  <span style={{ color: t.RUST }}>14 week streak</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginTop: 4 }}>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 26, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em', lineHeight: 1 }}>{identity.name}<span style={{ color: t.ACCENT }}>.</span></span>
                  {identity.pronouns ? <span style={{ fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>{identity.pronouns}</span> : null}
                </div>
                {identity.handle ? <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.06em', color: t.INK50 }}>{identity.handle}{identity.goal ? ` · ${identity.goal}` : ''}</div> : null}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 6, marginTop: 16, flexWrap: 'nowrap' }}>
              {[['Shape Score', () => setShowScore(true)], ['Streak', () => setShowProgress(true)], ['Store', () => setShowStore(true)], ['About', () => setShowAbout(true)]].map(([l, on]) => (
                <button key={l} onClick={on} style={{ padding: '9px 10px', borderRadius: 11, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.ACCENT, cursor: 'pointer', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 800, letterSpacing: '0.08em', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{l}</button>
              ))}
            </div>
            <button onClick={() => setShowPublicProfile(true)} style={{ width: '100%', marginTop: 8, padding: '11px', borderRadius: 12, border: `1px solid ${t.ACCENT}`, background: `${t.ACCENT}14`, color: t.ACCENT, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.14em', textTransform: 'uppercase' }}>View public profile →</button>
          </div>
        ) : (
          (() => {
            const teal = t.isLight ? '#0a8f87' : '#34d6c5';
            const acc = bsMyTierColor(); // avatar + form accent follow my Shape Score tier (not a chosen color)
            const lbl = { display: 'block', fontFamily: t.MONO, fontSize: 8.5, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50, marginBottom: 7 };
            const field = { width: '100%', boxSizing: 'border-box', padding: '13px 14px', border: `1px solid ${t.RULE}`, background: t.PAPER2, borderRadius: 14, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 500, color: t.INK, letterSpacing: '-0.01em', outline: 'none' };
            const goals = ['Lose fat', 'Build muscle', 'Recomp', 'Maintain', 'Get stronger', 'Endurance', 'Mobility', 'Athletic performance', 'General health', 'Tone up', 'Run a race', 'Postpartum'];
            const pronounOpts = ['She/Her', 'He/Him', 'They/Them'];
            return (
            <div>
              {/* Avatar + photo + accent swatches */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
                <BSFacetAvatar size={60} c={acc} initial={(draft.initials || '').trim().toUpperCase().slice(0, 2) || bsInitials(draft.name) || 'A'} photo={(typeof window !== 'undefined' && window.ShapeIdentity && window.ShapeIdentity.photo) || null} editable onEdit={() => bsPickProfilePhoto(() => setTweak && setTweak('identityVersion', Date.now()))} BG={t.PAPER} />
                <div style={{ minWidth: 0 }}>
                  <button onClick={() => bsPickProfilePhoto(() => setTweak && setTweak('identityVersion', Date.now()))} style={{ borderRadius: 999,
                    padding: '9px 14px', border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, cursor: 'pointer',
                    fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', fontWeight: 700,
                  }}>Change photo</button>
                  <div style={{ marginTop: 9, fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: t.INK50, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ width: 9, height: 9, borderRadius: 999, background: acc, display: 'inline-block' }} />
                    {bsMyTier()} tier color
                  </div>
                </div>
              </div>

              {/* Custom avatar initials — optional override, max 2 characters */}
              <label style={{ display: 'block', marginBottom: 13 }}>
                <span style={lbl}>Avatar initials <span style={{ textTransform: 'none', letterSpacing: 0, color: t.INK50, fontWeight: 600 }}>· max 2</span></span>
                <input value={draft.initials || ''} placeholder={bsInitials(draft.name) || 'AB'} maxLength={2}
                  onChange={(e) => setDraft({ ...draft, initials: e.target.value.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 2) })}
                  onFocus={(e) => { e.target.style.borderColor = acc; }} onBlur={(e) => { e.target.style.borderColor = t.RULE; }}
                  style={{ ...field, width: 110, textTransform: 'uppercase', letterSpacing: '0.12em', fontWeight: 700 }} />
              </label>

              {[
                { k: 'name',     label: 'Display name', ph: 'Your name' },
                { k: 'handle',   label: 'Handle',       ph: '@handle' },
                { k: 'location', label: 'Location',     ph: 'City, State' },
                { k: 'link',     label: 'Website / link', ph: 'instagram.com/you' },
              ].map(f => (
                <label key={f.k} style={{ display: 'block', marginBottom: 13 }}>
                  <span style={lbl}>{f.label}</span>
                  <input value={draft[f.k] || ''} placeholder={f.ph} onChange={(e) => setDraft({ ...draft, [f.k]: e.target.value })}
                    onFocus={(e) => { e.target.style.borderColor = acc; }} onBlur={(e) => { e.target.style.borderColor = t.RULE; }}
                    style={field} />
                </label>
              ))}

              {/* Pronouns — quick chips + free text */}
              <div style={{ marginBottom: 13 }}>
                <span style={lbl}>Pronouns</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {pronounOpts.map(p => {
                    const on = draft.pronouns === p;
                    return <button key={p} onClick={() => setDraft({ ...draft, pronouns: on ? '' : p })} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? acc : t.RULE}`, background: on ? `${acc}1c` : 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>{p}</button>;
                  })}
                </div>
              </div>

              {/* Primary goal — chips + a write-your-own field (syncs to the Goal page) */}
              <div style={{ marginBottom: 13 }}>
                <span style={lbl}>Primary goal</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {goals.map(g => {
                    const on = (draft.goal || '') === g;
                    return <button key={g} onClick={() => setDraft({ ...draft, goal: g })} style={{ padding: '8px 13px', borderRadius: 999, cursor: 'pointer', border: `1px solid ${on ? acc : t.RULE}`, background: on ? `${acc}1c` : 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 700, letterSpacing: '0.04em' }}>{g}</button>;
                  })}
                </div>
                <input
                  value={goals.includes(draft.goal) ? '' : (draft.goal || '')}
                  placeholder="Or write your own goal…"
                  onChange={(e) => setDraft({ ...draft, goal: e.target.value })}
                  onFocus={(e) => { e.target.style.borderColor = acc; }} onBlur={(e) => { e.target.style.borderColor = t.RULE; }}
                  style={{ ...field, marginTop: 8, fontSize: 14.5 }} />
                <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 8, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50 }}>Syncs with your Goal page</div>
              </div>

              {/* Bio + counter */}
              <label style={{ display: 'block', marginBottom: 16 }}>
                <span style={{ ...lbl, display: 'flex', justifyContent: 'space-between' }}><span>Bio</span><span style={{ color: (draft.bio || '').length > 160 ? t.RUST : t.INK50 }}>{(draft.bio || '').length}/160</span></span>
                <textarea value={draft.bio} maxLength={180} onChange={(e) => setDraft({ ...draft, bio: e.target.value })} rows={3}
                  onFocus={(e) => { e.target.style.borderColor = acc; }} onBlur={(e) => { e.target.style.borderColor = t.RULE; }}
                  style={{ ...field, fontSize: 15, resize: 'vertical', lineHeight: 1.45 }} />
              </label>

              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={cancelEdit} style={{ borderRadius: 999,
                  flex: '0 0 auto', padding: '13px 22px', border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800,
                }}>Cancel</button>
                <button onClick={saveEdit} style={{ borderRadius: 999,
                  flex: 1, padding: '13px', border: 0, background: teal, color: '#04201d', cursor: 'pointer',
                  fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', fontWeight: 800,
                }}>Save changes</button>
              </div>
            </div>
            );
          })()
        )}
      </div>

      {/* YOUR PLAN — subscription card (live from /api/stripe/subscription) */}
      {!editing && (() => {
        // Two states drive the card: signedIn (any logged-in member, no free
        // tier) and hasSub (a real active Stripe subscription). Real subscribers
        // → Manage (billing portal). Signed-in without a sub → Activate
        // membership (checkout, never the dead portal). Browsing → Join now.
        const signedIn = !!(window.ShapeAuth?.getCachedState?.()?.user?.id);
        const hasSub = !!(plan && plan.active === true);
        const cents = plan && typeof plan.priceCents === 'number' ? plan.priceCents : 500;
        const priceLabel = `$${cents % 100 === 0 ? cents / 100 : (cents / 100).toFixed(2)}/mo`;
        const renews = plan && plan.renewsAt ? new Date(plan.renewsAt) : null;
        const renewsLabel = renews && !isNaN(renews.getTime())
          ? `Renews ${renews.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
          : 'Renews monthly';
        const cornerLabel = hasSub ? renewsLabel : (signedIn ? 'Membership inactive' : 'Not a member');
        const btnLabel = hasSub ? 'Manage →' : (signedIn ? 'Activate membership →' : 'Join now →');
        return (
          <div style={{ padding: `4px ${t.padX}px 18px` }}>
            <div style={{ border: `1px solid ${t.AMBER}55`, borderRadius: 16, background: `linear-gradient(150deg, ${t.AMBER}26, ${t.AMBER}08 45%, ${t.PAPER2} 85%), ${t.PAPER2}`, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
                <BSEyebrow color={t.AMBER}>Your plan</BSEyebrow>
                <span style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{cornerLabel}</span>
              </div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em', marginTop: 5 }}>Shape <span style={{ fontStyle: 'italic', color: t.AMBER }}>{hasSub ? 'Member.' : 'Membership.'}</span></div>
              <div style={{ marginTop: 6, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', color: t.INK50, lineHeight: 1.45 }}>{hasSub ? `${priceLabel} · Radio included · Community access · Marketplace access` : 'Become a Shape member to join the community'}</div>
              <button onClick={hasSub ? openBillingPortal : openUpgradeCheckout} style={{ marginTop: 11, padding: '8px 15px', borderRadius: 999, border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 9, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{btnLabel}</button>
            </div>
          </div>
        );
      })()}

      {/* PROFILE MODE — only for people with more than one account; lists just
          the roles they actually created so they can switch between them. */}
      {hasMultipleAccounts && (() => {
        const ROLE_LABELS = { client: 'Client', trainer: 'Trainer', nutritionist: 'Nutrition' };
        const activeRole = accountRoles.includes(tweaks.role) ? tweaks.role : accountRoles[0];
        return (
          <>
            <SectionHead
              title="Profile mode"
              meta={`${ROLE_LABELS[activeRole] || 'Client'} view`}
            />
            <div style={{ padding: `14px ${t.padX}px 18px` }}>
              <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 8, fontWeight: 700 }}>
                Active profile
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                {accountRoles.map(key => {
                  const on = activeRole === key;
                  return (
                    <button key={key} onClick={() => setTweak('role', key)} style={{ borderRadius: t.RADIUS_SM,
                      flex: 1, padding: '9px 9px', cursor: 'pointer',
                      border: `1px solid ${on ? t.INK : t.RULE}`,
                      background: on ? t.INK : 'transparent',
                      color: on ? t.PAPER : t.INK,
                      fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase',
                    }}>{ROLE_LABELS[key] || key}</button>
                  );
                })}
              </div>
            </div>
          </>
        );
      })()}

      {/* APPEARANCE */}
      <button onClick={() => setShowAppearance(v => !v)} aria-expanded={showAppearance} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: `12px ${t.padX}px 11px`, borderBottom: `1px solid ${t.RULE}`,
        background: 'transparent', border: 0, cursor: 'pointer', color: t.INK, textAlign: 'left',
      }}>
        <div>
          <BSEyebrow color={t.ACCENT}>Appearance</BSEyebrow>
          <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Theme &amp; texture</div>
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{`${({light:'Cream',white:'White',dark:'Black',teal:'Teal',manila:'Manila',blueprint:'Blueprint',carbon:'Carbon',steel:'Steel',bone:'Bone',oxblood:'Oxblood'})[tweaks.paperMode] || 'Cream'} · ${tweaks.accentKey || 'blue'}`}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ padding: '9px 16px', borderRadius: 999, border: `1px solid ${t.ACCENT}`, background: `${t.ACCENT}1f`, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{showAppearance ? 'Close ▾' : 'Customize ▸'}</span>
        </span>
      </button>
      {showAppearance && (
      <div style={{ padding: `14px ${t.padX}px` }}>
        {/* Paper / Texture / Accent / Ink — an underline tab bar, deliberately
            distinct from the bordered option chips/swatches below so it reads
            as section navigation (not another row of choices). */}
        <div style={{ display: 'flex', gap: 22, marginBottom: 16, borderBottom: `1px solid ${t.RULE}` }}>
          {[['paper','Paper'],['texture','Texture'],['accent','Accent'],['ink','Ink']].map(([k, l]) => {
            const on = appearTab === k;
            return (
              <button key={k} onClick={() => setAppearTab(k)} style={{
                position: 'relative', padding: '0 1px 11px', cursor: 'pointer',
                border: 0, background: 'transparent', WebkitTapHighlightColor: 'transparent',
                color: on ? t.INK : t.INK50,
                fontFamily: t.DISPLAY, fontSize: 16, fontWeight: on ? 700 : 500, letterSpacing: '-0.01em',
              }}>{l}
                <span style={{ position: 'absolute', left: 0, right: 0, bottom: -1, height: 2.5, borderRadius: 2, background: on ? t.ACCENT : 'transparent' }} />
              </button>
            );
          })}
        </div>

        {appearTab === 'paper' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[['light','Cream'],['white','White'],['dark','Black'],['teal','Teal'],['manila','Manila'],['blueprint','Blueprint'],['carbon','Carbon'],['steel','Steel'],['bone','Bone'],['oxblood','Oxblood']].map(([k,l]) => (
            <Pill key={k} on={tweaks.paperMode === k} onClick={() => setTweak('paperMode', k)}>{l}</Pill>
          ))}
        </div>
        )}

        {appearTab === 'texture' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {[
            ['none','None'],['newsprint','Newsprint'],['ledger','Ledger'],
            ['grid','Grid'],['dotgrid','Dot grid'],['foxed','Foxed'],
            ['vignette','Vignette'],['watermark','Watermark'],
            ['linen','Linen'],['crosshatch','Crosshatch'],['pinstripe','Pinstripe'],
            ['halftone','Halftone'],['kraft','Kraft'],['blueprint','Blueprint'],
            ['graph','Graph'],['stains','Stains'],['cardboard','Cardboard'],
            ['concrete','Concrete'],['risograph','Risograph'],['parchment','Parchment'],
            ['dotmap','Dot map'],
          ].map(([k,l]) => (
            <Pill key={k} on={(tweaks.textureKey || 'none') === k} onClick={() => setTweak('textureKey', k)}>{l}</Pill>
          ))}
        </div>
        )}

        {appearTab === 'accent' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <Swatch k="blue"  color="#1e7ad6" label="Blue" />
          <Swatch k="amber" color="#d99033" label="Amber" />
          <Swatch k="rust"  color="#b83d2c" label="Rust" />
          <Swatch k="green" color="#2f7d4f" label="Green" />
          <Swatch k="teal"  color="#0a8f87" label="Teal" />
          <Swatch k="white" color="#ffffff" label="White" />
          <Swatch k="black" color="#000000" label="Black" />
        </div>
        )}

        {appearTab === 'ink' && (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            ['default', null,        'Default'],
            ['#0f0e0c', '#0f0e0c',   'Charcoal'],
            ['#f5f0e6', '#f5f0e6',   'Cream'],
            ['#1c4ed8', '#1c4ed8',   'Blue'],
            ['#a8331b', '#a8331b',   'Rust'],
            ['#2f6b3a', '#2f6b3a',   'Green'],
            ['#c8881a', '#c8881a',   'Amber'],
            ['#5a2b8a', '#5a2b8a',   'Plum'],
          ].map(([k, sw, lbl]) => {
            const on = (tweaks.inkOverride || 'default') === k;
            return (
              <button
                key={k}
                onClick={() => setTweak('inkOverride', k)}
                title={lbl}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '6px 10px', borderRadius: t.RADIUS_SM,
                  border: `1px solid ${on ? t.INK : t.RULE}`,
                  background: on ? t.INK : 'transparent',
                  color: on ? t.PAPER : t.INK,
                  fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em',
                  cursor: 'pointer', textTransform: 'uppercase',
                }}
              >
                {sw ? <span style={{ width: 10, height: 10, borderRadius: '50%', background: sw, border: `1px solid ${on ? t.PAPER : t.RULE}` }} /> : null}
                {lbl}
              </button>
            );
          })}
          {/* Custom hex picker */}
          <label style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 8px 4px 4px', borderRadius: t.RADIUS_SM,
            border: `1px solid ${t.RULE}`, cursor: 'pointer',
            fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: t.INK,
          }}>
            <input
              type="color"
              value={(tweaks.inkOverride && tweaks.inkOverride !== 'default') ? tweaks.inkOverride : (t.isLight ? '#0f0e0c' : '#f5f0e6')}
              onChange={(e) => setTweak('inkOverride', e.target.value)}
              style={{ width: 22, height: 22, border: 0, padding: 0, background: 'transparent', cursor: 'pointer' }}
            />
            Custom
          </label>
        </div>
        )}

        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginTop: 12, marginBottom: 6, fontWeight: 700 }}>Display weight</div>
        <div style={{ display: 'flex', gap: 6 }}>
          {['regular','bold'].map(k => (
            <Pill key={k} on={tweaks.weightKey === k} onClick={() => setTweak('weightKey', k)}>{k}</Pill>
          ))}
        </div>

      </div>
      )}

      {/* SHAPE RADIO */}
      <div style={{ padding: `14px ${t.padX}px 4px`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Shape Radio</div>
          <div style={{ marginTop: 3, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{r.radioOn ? (r.paused ? 'Paused' : 'Playing while browsing') : 'Listen while using the app'}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: r.radioOn ? t.ACCENT : t.INK50 }}>{r.radioOn ? 'On' : 'Off'}</span>
          <Toggle on={r.radioOn} onClick={() => r.setRadioPreference(!r.radioOn)} />
        </div>
      </div>

      {/* LIGHT EFFECTS — music-reactive overlays while Shape Radio is on */}
      <button onClick={() => setShowLightFx(v => !v)} aria-expanded={showLightFx} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
        padding: `12px ${t.padX}px 11px`, borderBottom: `1px solid ${t.RULE}`,
        background: 'transparent', border: 0, cursor: 'pointer', color: t.INK, textAlign: 'left',
      }}>
        <div>
          <BSEyebrow color={t.ACCENT}>Light effects</BSEyebrow>
          <div style={{ marginTop: 2, fontFamily: t.DISPLAY, fontSize: 20, fontWeight: 700, color: t.INK, letterSpacing: '-0.025em' }}>Reactive overlay</div>
          <div style={{ marginTop: 4, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.INK50 }}>{r.radioOn ? `Active · ${r.fxMode}` : 'Radio off — preview only'}</div>
        </div>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <span style={{ padding: '9px 16px', borderRadius: 999, border: `1px solid ${t.ACCENT}`, background: `${t.ACCENT}1f`, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK }}>{showLightFx ? 'Close ▾' : 'Customize ▸'}</span>
        </span>
      </button>
      {showLightFx && (
      <div style={{ padding: `14px ${t.padX}px 18px` }}>
        <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50, marginBottom: 10, fontWeight: 700 }}>
          Syncs to BPM
        </div>

        {/* 2×2 grid of mode cards */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          {[
            { k: 'off',       glyph: '○',  title: 'Off',       sub: 'Clean · no animation' },
            { k: 'subtle',    glyph: '◐',  title: 'Subtle',    sub: 'Edge glow · island EQ' },
            { k: 'immersive', glyph: '◉',  title: 'Immersive', sub: 'Bg bloom · button halos' },
            { k: 'hologram',  glyph: '⟠',  title: 'Hologram',  sub: 'DJ overlay · scanlines' },
          ].map(m => {
            const active = r.fxMode === m.k;
            return (
              <button
                key={m.k}
                onClick={() => r.setFxMode(m.k)}
                style={{ borderRadius: t.RADIUS_SM,
                  textAlign: 'left', cursor: 'pointer', padding: '8px 10px 9px',
                  border: `1px solid ${active ? t.INK : t.RULE}`,
                  background: active ? t.PAPER2 : 'transparent',
                  display: 'flex', flexDirection: 'column', gap: 2,
                  borderLeft: active ? `4px solid ${t.ACCENT}` : `1px solid ${t.RULE}`,
                  paddingLeft: active ? 7 : 10,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontFamily: t.MONO, fontSize: 13, color: t.INK }}>{m.glyph}</span>
                  {active && (
                    <span style={{ fontFamily: t.MONO, fontSize: 8, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.ACCENT }}>● ON</span>
                  )}
                </div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', marginTop: 1 }}>
                  {m.title}
                </div>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 10, color: t.INK70, fontWeight: 500, lineHeight: 1.25 }}>
                  {m.sub}
                </div>
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 12, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700, lineHeight: 1.5 }}>
          {r.radioOn
            ? '— effects render on top of every screen while radio plays'
            : '— turn on Shape Radio from Home to see the effect'}
        </div>
      </div>
      )}

      {/* Home ticker — choose which stats show on the home strip + reorder. */}
      <SectionHead title="Home ticker" meta={`${BS_TICKER_METRICS.length - tickerPrefs.hidden.length} of ${BS_TICKER_METRICS.length} shown`} />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {(tickerPrefs.order || BS_TICKER_METRICS.map(m => m.key)).map((key, idx, arr) => {
          const m = BS_TICKER_METRICS.find(x => x.key === key);
          if (!m) return null;
          const shown = !tickerPrefs.hidden.includes(key);
          return (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: `${t.rowY}px 0`, borderBottom: idx === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: shown ? t.INK : t.INK50 }}>{m.name}</div>
                <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', color: t.INK50, textTransform: 'uppercase', marginTop: 2 }}>{m.key}</div>
              </div>
              <button onClick={() => tickerMove(key, -1)} disabled={idx === 0} title="Move up" style={{ background: 'transparent', border: 0, color: idx === 0 ? t.HAIR : t.INK50, fontSize: 15, cursor: idx === 0 ? 'default' : 'pointer', padding: '2px 6px', lineHeight: 1 }}>↑</button>
              <button onClick={() => tickerMove(key, 1)} disabled={idx === arr.length - 1} title="Move down" style={{ background: 'transparent', border: 0, color: idx === arr.length - 1 ? t.HAIR : t.INK50, fontSize: 15, cursor: idx === arr.length - 1 ? 'default' : 'pointer', padding: '2px 6px', lineHeight: 1 }}>↓</button>
              <button onClick={() => tickerToggle(key)} title={shown ? 'Hide' : 'Show'} style={{ width: 34, height: 20, borderRadius: 999, padding: 2, flexShrink: 0, border: 0, background: shown ? t.ACCENT : t.RULE, cursor: 'pointer', display: 'flex', justifyContent: shown ? 'flex-end' : 'flex-start' }}>
                <span style={{ width: 14, height: 14, borderRadius: 999, background: shown ? t.PAPER : t.INK50, display: 'block' }} />
              </button>
            </div>
          );
        })}
      </div>

      {/* SECTION CARDS — drill into a focused pane */}
      <SectionHead title="More" meta={`${settingCards.length} sections`} />
      <div style={{ padding: `8px ${t.padX}px 10px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {settingCards.map(c => (
          <HubCard key={c.title} icon={c.icon} title={c.title} summary={c.summary} accent={c.accent} onClick={() => setDetail(c.detail)} />
        ))}
      </div>

      {/* Sign out — pushed down with breathing room before the footer */}
      <div style={{ padding: `28px ${t.padX}px 32px` }}>
        <button onClick={onLogout} style={{ borderRadius: t.RADIUS_SM,
          width: '100%', padding: '14px', background: 'transparent', color: t.RUST, border: `1px solid ${t.RUST}`, cursor: 'pointer',
          fontFamily: t.MONO, fontSize: 11, letterSpacing: '0.22em', textTransform: 'uppercase', fontWeight: 700,
        }}>Sign out</button>
      </div>
      </>)}

      <BSRadioPrompt />
      <div style={{ marginTop: 'auto' }}>
        <BSFooter left="Shape v2.4.0" right="Build 2026.04" />
      </div>
      </div>

      {/* Shape-styled dropdown menu (replaces the native select picker) */}
      {dropdown && (
        <div onClick={() => setDropdown(null)} style={{ position: 'fixed', inset: 0, zIndex: 6000 }}>
          <div onClick={(e) => e.stopPropagation()} className="bs-hide-scroll" style={{ position: 'fixed', top: dropdown.top, right: dropdown.right, zIndex: 6001, width: 220, maxHeight: '56vh', overflowY: 'auto', overflowX: 'hidden', scrollbarWidth: 'none', msOverflowStyle: 'none', background: t.PAPER, border: `1px solid ${t.INK}`, borderRadius: 12, boxShadow: '0 16px 40px rgba(0,0,0,0.3)' }}>
            <div style={{ padding: '10px 12px', borderBottom: `1px solid ${t.RULE}`, fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{dropdown.label}</div>
            {dropdown.options.map((opt) => {
              const on = prefs[dropdown.key] === opt;
              return (
                <button key={opt} onClick={() => { setPref(dropdown.key, opt); setDropdown(null); }} style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                  padding: '12px 12px', border: 0, borderTop: `1px solid ${t.HAIR}`, background: on ? `${t.ACCENT}14` : 'transparent', cursor: 'pointer', textAlign: 'left',
                }}>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 600, color: t.INK }}>{opt}</span>
                  {on && <span style={{ color: t.ACCENT, fontSize: 13, fontWeight: 800, flexShrink: 0 }}>✓</span>}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Account field editor — in-app sheet */}
      {editField && createPortal((
        <div onClick={() => setEditField(null)} style={{ position: 'absolute', inset: 0, zIndex: 6000, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', background: t.PAPER, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderTop: `1px solid ${t.RULE}`, padding: `20px ${t.padX}px calc(22px + env(safe-area-inset-bottom, 0px))`, boxShadow: '0 -16px 40px rgba(0,0,0,0.35)' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, fontWeight: 700, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, marginBottom: 10 }}>Edit {editField.label}</div>
            <input
              autoFocus
              type={editField.type}
              value={editField.value}
              placeholder={editField.placeholder}
              onChange={(e) => setEditField(f => ({ ...f, value: e.target.value }))}
              onKeyDown={(e) => { if (e.key === 'Enter') saveEditField(); }}
              style={{ width: '100%', padding: '13px 14px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: t.PAPER2, color: t.INK, fontFamily: t.DISPLAY, fontSize: 16, fontWeight: 500, outline: 'none' }}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button onClick={() => setEditField(null)} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Cancel</button>
              <button onClick={saveEditField} style={{ flex: 1, padding: '13px', borderRadius: t.RADIUS_SM, border: 0, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.18em', textTransform: 'uppercase' }}>Save</button>
            </div>
          </div>
        </div>
      ), (typeof document !== 'undefined' && document.getElementById('bs-phone-surface')) || document.body)}
    </BSPage>
  );
}

function BSContactPage({ onBack }) {
  const t = useBS();
  const [form, setForm] = useStateBSC({
    first: '',
    last: '',
    email: '',
    phone: '',
    subject: 'General inquiry',
    message: '',
  });
  const [sent, setSent] = useStateBSC(false);
  const update = (k, v) => setForm(prev => ({ ...prev, [k]: v }));
  const inputStyle = {
    borderRadius: t.RADIUS_SM,
    width: '100%',
    padding: '12px 12px',
    border: `1px solid ${t.RULE}`,
    background: t.PAPER,
    color: t.INK,
    fontFamily: t.DISPLAY,
    fontSize: 14,
    fontWeight: 500,
    outline: 'none',
  };
  const labelStyle = {
    display: 'block',
    fontFamily: t.MONO,
    fontSize: 9,
    fontWeight: 800,
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    color: t.INK50,
    marginBottom: 6,
  };
  const contactActions = [
    { label: 'Call', value: '(203) 526-3314', action: () => { window.location.href = 'tel:+12035263314'; } },
    { label: 'Email', value: 'christopher.perry@theshapecommunity.com', action: () => { window.location.href = 'mailto:christopher.perry@theshapecommunity.com'; } },
    { label: 'Instagram', value: '@theshapecommunity', action: () => { window.location.href = 'https://instagram.com/theshapecommunity'; } },
  ];
  const submit = () => {
    setSent(true);
    window.__bsToast?.('Message queued - Shape will reply within 1 business day', 'ok');
  };

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Support"
        kicker="Contact"
        title={<>Get in<br/>touch.</>}
        trailing={<BSAvatar init="S" size={36} fill={t.ACCENT} ink={t.PAPER} />}
      />

      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 500, lineHeight: 1.35, color: t.INK }}>
          Questions, partnerships, billing, coach support, or technical issues. Shape replies within one business day.
        </div>
      </div>

      <BSSection title="Reach us directly" meta="Support desk" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {contactActions.map((item, i, arr) => (
          <button key={item.label} onClick={item.action} style={{
            borderRadius: 0,
            width: '100%',
            border: 0,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
            background: 'transparent',
            color: t.INK,
            cursor: 'pointer',
            padding: `${t.rowY + 6}px 0`,
            textAlign: 'left',
            display: 'grid',
            gridTemplateColumns: '1fr auto',
            gap: 12,
            alignItems: 'center',
          }}>
            <span>
              <span style={{ display: 'block', fontFamily: t.DISPLAY, fontSize: 15, fontWeight: 650, letterSpacing: '-0.01em' }}>{item.label}</span>
              <span style={{ display: 'block', marginTop: 3, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.08em', color: t.INK50 }}>{item.value}</span>
            </span>
            <BSEyebrow color={t.ACCENT}>Open</BSEyebrow>
          </button>
        ))}
      </div>

      <BSSection title="Hours of operation" meta="Eastern time" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {[
          ['Mon - Fri', '6am - 10pm'],
          ['Saturday', '7am - 8pm'],
          ['Sunday', '8am - 6pm'],
        ].map((row, i, arr) => (
          <div key={row[0]} style={{
            display: 'flex',
            justifyContent: 'space-between',
            padding: `${t.rowY + 4}px 0`,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>{row[0]}</span>
            <span style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK, fontWeight: 600 }}>{row[1]}</span>
          </div>
        ))}
      </div>

      <BSSection title="Send us a message" meta={sent ? 'Queued' : '24h reply'} />
      <div style={{ padding: `14px ${t.padX}px 18px` }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <label>
            <span style={labelStyle}>First name</span>
            <input value={form.first} onChange={(e) => update('first', e.target.value)} style={inputStyle} />
          </label>
          <label>
            <span style={labelStyle}>Last name</span>
            <input value={form.last} onChange={(e) => update('last', e.target.value)} style={inputStyle} />
          </label>
        </div>

        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={labelStyle}>Email</span>
          <input type="email" value={form.email} onChange={(e) => update('email', e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={labelStyle}>Phone</span>
          <input value={form.phone} onChange={(e) => update('phone', e.target.value)} style={inputStyle} />
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={labelStyle}>Subject</span>
          <select value={form.subject} onChange={(e) => update('subject', e.target.value)} style={inputStyle}>
            {[
              'General inquiry',
              'Membership questions',
              'Trainer partnership',
              'Nutritionist partnership',
              'Gym / studio partnership',
              'Technical support',
              'Billing',
            ].map(option => <option key={option}>{option}</option>)}
          </select>
        </label>

        <label style={{ display: 'block', marginTop: 10 }}>
          <span style={labelStyle}>Message</span>
          <textarea
            rows={5}
            value={form.message}
            onChange={(e) => update('message', e.target.value)}
            style={{ ...inputStyle, resize: 'vertical', lineHeight: 1.4 }}
          />
        </label>

        <button onClick={submit} style={{ borderRadius: t.RADIUS_SM,
          width: '100%',
          marginTop: 12,
          padding: '14px',
          border: `1px solid ${t.INK}`,
          background: sent ? t.GREEN : t.INK,
          color: t.PAPER,
          cursor: 'pointer',
          fontFamily: t.MONO,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}>{sent ? 'Message queued' : 'Send message'}</button>
      </div>

      <BSFooter right="Contact" />
    </BSPage>
  );
}

// Start the $5/mo Shape Platform checkout (shared by the Pricing page + the
// settings upgrade button). Signed out → account gate / Stripe 401 hint.
async function bsStartPlatformCheckout() {
  if (window.bsRequireAccount && !window.bsRequireAccount('become a Shape member')) return;
  try {
    const res = await fetch('/api/stripe/platform-checkout', {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ successPath: '/m/', cancelPath: '/m/' }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.url) window.location.href = data.url;
    else if (res.status === 401) { if (window.__bsGoAuth) window.__bsGoAuth('create'); else window.__bsToast?.('Create an account to become a Shape member', 'info'); }
    else window.__bsToast?.(data?.error || 'Checkout unavailable right now', 'err');
  } catch (e) { window.__bsToast?.('Checkout unavailable right now', 'err'); }
}

// About — the marketing "About" page, adapted to the broadsheet (mirrors the
// website /newdesign/About).
function BSAboutPage({ onBack }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const tealB = t.isLight ? '#0a8f87' : '#5fe6d6';
  const px = t.padX;
  // Same letter the website runs — drop-cap intro + two pull-quotes.
  const para = { fontFamily: t.DISPLAY, fontSize: 15.5, lineHeight: 1.72, color: t.INK70, margin: '0 0 22px' };
  const pull = { fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 22, lineHeight: 1.18, letterSpacing: '-0.02em', fontWeight: 500, color: t.INK, margin: '30px 0' };
  const pillars = [
    ["Personal coaching, lower cost", "Browse, message, and hire vetted trainers and nutritionists before you pay anything. $5/mo flat to the platform. Your coach sets their own rate and gets paid directly."],
    ["A real community", "Share your week if you want to — or don't. Either way, you can find tips, recipes, recommended coaches, and people who get what you're trying to do."],
    ["Shape Radio + the soundtrack", "Ad-free mixes built for movement, included with every membership. Your coach can drop a playlist onto a workout and it plays right on the card."],
    ["Lifestyle, structured", "Habit tracking, grocery lists that build themselves, meal plans you actually follow, Shape Score that reads the truth at the end of the week. Build the good ones. Break the bad ones."],
    ["Goals that are yours", "Tell us what you're shaping toward — strength, weight, sleep, calm, a marathon, just feeling like yourself again. We help you plan around it and your coach holds the line."],
    ["Public if you want, private always", "Your data is yours. Share your progress with the community when you feel like it. Keep it locked when you don't. There's no algorithm pushing you to overshare."],
  ];
  return (
    <BSPage>
      {/* minimal back row (the hero is the title, mirroring the website) */}
      <div style={{ padding: `54px ${px}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <button onClick={onBack} style={{ background: 'transparent', border: 0, cursor: 'pointer', padding: 0, fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK, fontWeight: 700 }}>← Back</button>
        <span style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.22em', textTransform: 'uppercase', color: t.INK50 }}>About · Shape</span>
      </div>

      {/* HERO — A place / for helping shape a lifestyle (teal-stroke "shape") */}
      <div style={{ padding: `34px ${px}px 26px`, textAlign: 'center' }}>
        <h1 style={{ fontFamily: t.DISPLAY, fontSize: 46, fontWeight: 300, letterSpacing: '-0.045em', margin: 0, lineHeight: 0.94, color: t.INK }}>
          A&nbsp;place<br />for helping <em style={{ fontStyle: 'italic', fontWeight: 400, color: 'transparent', WebkitTextStroke: `1.1px ${teal}` }}>shape</em> a&nbsp;lifestyle
        </h1>
        <p style={{ fontFamily: t.DISPLAY, fontSize: 16, fontStyle: 'italic', fontWeight: 400, letterSpacing: '-0.005em', color: t.INK70, margin: '28px auto 0', maxWidth: 560, lineHeight: 1.55 }}>
          Your trainer already mapped out the next few weeks. Your nutritionist's plan became a grocery list before you thought to ask. When you open the workout card, the music starts — your coach picked it for that session. Shape Score watches all of it. Miss a day, it knows. Build a streak, it shows. The community isn't moderated positivity — it's people who are also mid-loop, figuring it out in real time. Nobody here is finished. That's the point.
        </p>
        <div style={{ marginTop: 40, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9 }} aria-hidden>
          <span style={{ fontFamily: t.MONO, fontSize: 9.5, letterSpacing: '0.24em', textTransform: 'uppercase', color: t.INK50 }}>A letter</span>
          <span style={{ width: 1, height: 48, background: `linear-gradient(to bottom, transparent, ${teal})`, display: 'block' }} />
        </div>
      </div>

      {/* LETTER */}
      <div style={{ padding: `40px ${px}px 24px` }}>
        <h2 style={{ fontFamily: t.DISPLAY, fontSize: 24, letterSpacing: '-0.02em', fontWeight: 400, margin: '0 0 8px', lineHeight: 1.18, color: t.INK, textAlign: 'center', fontStyle: 'italic' }}>
          <em style={{ fontStyle: 'italic', fontWeight: 500, color: teal }}>Fitness</em> is the entry point. Your <em style={{ fontStyle: 'italic', fontWeight: 500, color: teal }}>lifestyle</em> is the goal.
        </h2>
        <div style={{ display: 'flex', justifyContent: 'center', margin: '16px 0 34px' }}><span style={{ width: 24, height: 1, background: t.RULE }} /></div>

        <p style={para}>
          <span style={{ float: 'left', fontFamily: t.DISPLAY, fontSize: 74, lineHeight: 0.82, fontWeight: 400, color: teal, padding: '8px 12px 0 0', marginTop: 4 }}>S</span>hape is about exactly what its name suggests — shaping your life into what you want it to be. Your routines, your sleep, what you cook, the music that moves you, how you talk to yourself on hard days, the people you spend Saturday with. We built Shape to be the place where you can work on all of it, on your own terms.
        </p>
        <p style={para}>It starts with a coach. Having great ones shouldn't be a luxury. Most apps replace them with chatbots; most gyms gate the good ones behind packages. We thought there was a better way: open the door for trainers, nutritionists, and registered dietitians who actually care, and make that level of guidance affordable for the rest of us.</p>
        <p style={para}>Shape builds the loop around all of it. Your trainer programs your week before you arrive — every set, every tempo, every cue loaded the night before so you're never standing at the rack wondering what's next. Your nutritionist builds a meal plan around your specific goals — whether that's hitting a macro target, managing a dietary restriction, building around a health condition, or just eating better — and that plan turns into a grocery list you can actually shop from.</p>
        <p style={para}>As you show up — day after day, workout after workout, habit after habit — your Shape Score rises with you. It tracks your consistency, rewards your effort, and reflects the status you've actually earned.</p>

        <div style={{ ...pull, textAlign: 'right', paddingRight: 16, borderRight: `3px solid ${teal}` }}>Not a vanity metric. <em style={{ color: tealB }}>A mirror.</em></div>

        <p style={para}>There's also a place to write down what you're shaping toward — strength, sleep, calm, confidence, a marathon, a specific body composition goal, just feeling like yourself again. Structure when you need it. Discipline you build, not something handed down.</p>
        <p style={para}>And then there's the part no app gets right: <em style={{ fontStyle: 'italic', color: tealB, fontWeight: 500 }}>the community</em>. You can keep your journey private — or share it. What you cooked, what your nutritionist recommended this week, what you lifted, what your coach said. Tips, recipes, nutrition advice, coaches and dietitians worth trying. A whole feed of people figuring out the same things you are.</p>

        <div style={{ ...pull, paddingLeft: 16, borderLeft: `3px solid ${teal}` }}>The community isn't a forum. It's the people in your loop.</div>

        <p style={{ ...para, marginBottom: 36 }}>Shape is the place where you find the coach, build the habits, earn your score, hear the music, and meet the people. The rest is just showing up.</p>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 12 }}><span style={{ width: 24, height: 2, background: t.RULE }} /></div>
        <div style={{ textAlign: 'center', fontFamily: t.DISPLAY, fontStyle: 'italic', fontSize: 15, color: t.INK50 }}>— The Shape team</div>
      </div>

      {/* PILLARS */}
      <div style={{ padding: `48px ${px}px 8px` }}>
        <div style={{ textAlign: 'center', marginBottom: 36 }}>
          <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.22em', textTransform: 'uppercase', color: teal, marginBottom: 12 }}>What you get</div>
          <h3 style={{ fontFamily: t.DISPLAY, fontSize: 30, letterSpacing: '-0.03em', fontWeight: 300, fontStyle: 'italic', margin: 0, lineHeight: 1.05, color: t.INK }}>One place for the <em style={{ fontStyle: 'italic', fontWeight: 500, color: teal }}>whole loop</em>.</h3>
        </div>
        {pillars.map(([h, p], i) => (
          <div key={i} style={{ borderTop: `1px solid ${t.RULE}`, paddingTop: 18, marginBottom: 26 }}>
            <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.18em', color: tealB, marginBottom: 11 }}>{String(i + 1).padStart(2, '0')}</div>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 22, letterSpacing: '-0.015em', fontWeight: 400, fontStyle: 'italic', color: t.INK, lineHeight: 1.18, marginBottom: 11 }}>{h}</div>
            <p style={{ fontFamily: t.DISPLAY, fontSize: 15, fontStyle: 'italic', fontWeight: 400, color: t.INK70, lineHeight: 1.55, margin: 0 }}>{p}</p>
          </div>
        ))}
      </div>

      {/* CTA */}
      <div style={{ padding: `26px ${px}px 36px`, textAlign: 'center' }}>
        <h3 style={{ fontFamily: t.DISPLAY, fontSize: 38, letterSpacing: '-0.035em', fontWeight: 300, fontStyle: 'italic', margin: 0, lineHeight: 1.0, color: t.INK }}>Join the <em style={{ fontStyle: 'italic', fontWeight: 600, color: teal }}>community.</em></h3>
      </div>
      <BSFooter right="About" />
    </BSPage>
  );
}

// Pricing — the $5/mo membership page, adapted to the broadsheet (mirrors the
// website /newdesign/Pricing). "Browse all coaches" hops to the marketplace via
// a global event (settings is a full-screen takeover, so we close it first).
function BSPricingPage({ onBack }) {
  const t = useBS();
  const teal = t.isLight ? '#0a8f87' : '#34d6c5';
  const [open, setOpen] = useStateBSC(0);
  const features = [
    'Browse all trainers & nutritionists',
    'Subscribe to any trainer or nutritionist',
    'Buy individual workout & meal plans',
    'Direct messaging with your pros',
    'Full progress tracking & analytics',
    'Nutrition schedule & macro tracking',
    'Community forum access',
    'Shape Radio — ad-free workout music',
  ];
  const coaches = [
    { role: 'Trainer', name: 'Maya Okafor', meta: 'Brooklyn · Strength · hypertrophy', price: '$120', cadence: '/mo', avg: '$60–150 / session avg' },
    { role: 'Nutritionist', name: 'Rae Lindqvist', meta: 'Lisbon · Endurance · plant-based', price: '$180', cadence: '/mo', avg: '$120–250 / consult avg' },
    { role: 'Trainer', name: 'Diego Alvarez', meta: 'Mexico City · Run coaching · mobility', price: '$95', cadence: '/mo', avg: '$60–150 / session avg' },
  ];
  const faq = [
    { q: 'What do I get for $5/month?', a: "Full platform access — browse trainers and nutritionists, message your pros, track progress, log meals, listen to Shape Radio ad-free, and join the community. The $5 is the Shape Platform fee. Anything you buy from an individual coach is separate and goes directly to them." },
    { q: 'Do I have to subscribe to a coach?', a: "No. For $5/mo you can browse, message, buy one-off plans, and use the community. Many members only buy workouts or meal plans à la carte; others subscribe to one or more coaches for ongoing programming." },
    { q: 'How much do coaches cost?', a: "Each pro sets their own price. Trainers typically run $60–150 per session or $80–250/mo for full programming. Nutritionists run $120–250 per consult or $120–300/mo for plans + reviews. You see each rate on their profile before you subscribe." },
    { q: 'Can I cancel any time?', a: "Yes — the $5/mo cancels instantly from your settings, and coach subscriptions cancel on the same screen. No penalties, no lock-in. Your data and training history stay with you." },
    { q: 'Do coaches pay to be on Shape?', a: "No monthly dues, no setup fees. Shape takes a 15% platform fee on what clients pay you — you only pay when you earn. Standard card processing is separate." },
    { q: 'Is Shape Radio really included?', a: "Yes — ad-free workout mixes, BPM-curated stations, live resident DJ sets. Part of the $5/mo, offline downloads included. No upsell." },
  ];
  const browseCoaches = () => { try { window.dispatchEvent(new CustomEvent('shape:openMarket')); } catch (e) {} };
  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Pricing"
        kicker="Membership"
        title={<>Five dollars<br/>a month.</>}
        trailing={<BSAvatar init="$" size={36} fill={t.INK} ink={t.PAPER} />}
      />
      <div style={{ padding: `16px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 500, lineHeight: 1.42, color: t.INK }}>
          One flat platform fee. Browse every trainer and nutritionist before paying anything, message your pros, track progress, log meals, listen to Shape Radio. Coaches set their own rates — you pay them directly, cancel any time.
        </div>
      </div>

      {/* $5/mo card */}
      <div style={{ padding: `16px ${t.padX}px 4px` }}>
        <div style={{ border: `1px solid ${t.RULE}`, borderRadius: 16, overflow: 'hidden', background: t.PAPER2 }}>
          <div style={{ position: 'relative', padding: '20px 18px 18px', borderBottom: `1px solid ${t.RULE}` }}>
            <div style={{ position: 'absolute', top: 18, right: 16, background: teal, color: '#04201d', fontFamily: t.MONO, fontSize: 7.5, fontWeight: 800, letterSpacing: '0.1em', padding: '5px 8px', borderRadius: 999 }}>INCL. SHAPE RADIO</div>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.2em', textTransform: 'uppercase', color: t.INK50, fontWeight: 700 }}>Shape Platform</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginTop: 6 }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 60, fontWeight: 700, lineHeight: 0.85, letterSpacing: '-0.05em', color: t.INK }}>$5</span>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 15, color: t.INK50 }}>/month</span>
            </div>
            <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 14, fontWeight: 500, color: t.INK70, lineHeight: 1.4 }}>What every Shape client pays to use the platform. Your coach's rate is separate and paid directly to them.</div>
            <button onClick={bsStartPlatformCheckout} style={{ marginTop: 16, width: '100%', padding: '13px', borderRadius: 999, border: 0, background: teal, color: '#04201d', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Get started →</button>
            <div style={{ marginTop: 9, textAlign: 'center', fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.08em', color: t.INK50 }}>Cancel any time · no commitments</div>
          </div>
          <div style={{ padding: '16px 18px 18px' }}>
            <div style={{ fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.16em', textTransform: 'uppercase', color: teal, fontWeight: 700, marginBottom: 12 }}>What's included</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {features.map((f, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '16px 1fr', gap: 10, alignItems: 'start' }}>
                  <span style={{ color: teal, fontSize: 12, fontWeight: 800 }}>✓</span>
                  <span style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK, lineHeight: 1.35 }}>{f}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Coaches price themselves */}
      <BSSection title="Coaches price themselves" meta="Pay them directly" />
      <div style={{ padding: `2px ${t.padX}px 0` }}>
        <div style={{ fontFamily: t.DISPLAY, fontSize: 14, color: t.INK70, lineHeight: 1.45, marginBottom: 8 }}>Subscribe monthly for ongoing programming, or buy one-off plans and sessions à la carte. Every rate is visible on the coach's profile before you commit.</div>
        {coaches.map((c, i, arr) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: `${t.rowY + 6}px 0`, borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, letterSpacing: '0.14em', textTransform: 'uppercase', color: c.role === 'Nutritionist' ? '#a07a2e' : '#c0533b', fontWeight: 800 }}>{c.role}</div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em', marginTop: 1 }}>{c.name}</div>
              <div style={{ fontFamily: t.MONO, fontSize: 8.5, color: t.INK50, marginTop: 2, letterSpacing: '0.04em' }}>{c.meta}</div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 22, fontWeight: 700, color: t.INK, letterSpacing: '-0.02em' }}>{c.price}<span style={{ fontFamily: t.MONO, fontSize: 10, color: t.INK50, fontWeight: 600 }}>{c.cadence}</span></div>
              <div style={{ fontFamily: t.MONO, fontSize: 8, color: t.INK50, marginTop: 2 }}>{c.avg}</div>
            </div>
          </div>
        ))}
        <button onClick={browseCoaches} style={{ marginTop: 12, width: '100%', padding: '12px', borderRadius: 999, border: `1px solid ${t.RULE}`, background: 'transparent', color: t.INK, fontFamily: t.MONO, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.16em', textTransform: 'uppercase', cursor: 'pointer' }}>Browse all coaches →</button>
      </div>

      {/* FAQ */}
      <BSSection title="Things people actually ask" meta="FAQ" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {faq.map((f, i, arr) => (
          <div key={i} style={{ borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`, padding: `${t.rowY + 4}px 0` }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} style={{ width: '100%', textAlign: 'left', background: 'transparent', border: 0, cursor: 'pointer', padding: 0, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 14 }}>
              <span style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 600, color: t.INK, letterSpacing: '-0.01em' }}>{f.q}</span>
              <span style={{ fontFamily: t.MONO, fontSize: 16, color: teal, transition: 'transform .2s', transform: open === i ? 'rotate(45deg)' : 'none', lineHeight: 1 }}>+</span>
            </button>
            {open === i && <div style={{ marginTop: 8, fontFamily: t.DISPLAY, fontSize: 13.5, color: t.INK70, lineHeight: 1.5 }}>{f.a}</div>}
          </div>
        ))}
      </div>

      <div style={{ padding: `22px ${t.padX}px 30px` }}>
        <button onClick={bsStartPlatformCheckout} style={{ width: '100%', padding: '14px', borderRadius: 999, border: 0, background: t.INK, color: t.PAPER, fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.2em', textTransform: 'uppercase', cursor: 'pointer' }}>$5 / mo — Get started →</button>
      </div>
      <BSFooter right="Pricing" />
    </BSPage>
  );
}

function BSTermsPage({ onBack, onContact }) {
  const t = useBS();
  const terms = [
    ['01', 'Acceptance & eligibility', 'Shape is for users who are at least 18 and legally able to use the platform. Business users must be authorized to accept terms for that business.'],
    ['02', 'Accounts', 'Each person should keep one accurate account, protect login credentials, and notify Shape if account access appears compromised.'],
    ['03', 'Memberships & payments', 'Client membership is billed monthly. Coach subscriptions, sessions, programs, and meal plans are priced by each provider. Payments are processed through Stripe.'],
    ['04', 'Coaches', 'Trainers and nutritionists operate as independent providers. They are responsible for credentials, scope of practice, taxes, service quality, and client delivery.'],
    ['05', 'Content & conduct', 'Users keep ownership of uploaded content, but must avoid false claims, harassment, infringement, scraping, malware, impersonation, and unlawful activity.'],
    ['06', 'Shape Score & rewards', 'Points can be earned through qualifying activity and redeemed in Shape Store. Points are not cash, are not transferable, and may be adjusted for abuse.'],
    ['07', 'IP', 'The Shape name, logo, design, and platform experience belong to Shape. Copyright concerns can be sent to christopher.perry@theshapecommunity.com.'],
    ['08', 'Health disclaimer', 'Shape is not medical care. Training, nutrition, and coach guidance are informational and should not replace licensed medical advice.'],
    ['09', 'Liability', 'Shape limits liability to the extent allowed by law. Some jurisdictions may provide rights that cannot be waived.'],
    ['10', 'Disputes', 'The terms include informal dispute resolution, arbitration, class-action waiver language, and Delaware governing law.'],
    ['11', 'Termination', 'Accounts may be closed by the user or removed by Shape for serious violations, fraud, safety issues, or breach of platform rules.'],
    ['12', 'Changes & contact', 'Material changes are announced in advance. Questions go to christopher.perry@theshapecommunity.com or the contact page.'],
  ];

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Legal"
        kicker="Terms of service"
        title={<>Terms of<br/>service.</>}
        trailing={<BSAvatar init="T" size={36} fill={t.INK} ink={t.PAPER} />}
      />

      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>Last updated - May 21, 2026</BSEyebrow>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 500, lineHeight: 1.35, color: t.INK }}>
          These terms govern use of Shape, including memberships, coach services, marketplace activity, rewards, content, and account conduct.
        </div>
        <div style={{ marginTop: 10, fontFamily: t.MONO, fontSize: 9, letterSpacing: '0.14em', textTransform: 'uppercase', color: t.RUST, lineHeight: 1.45, fontWeight: 800 }}>
          Includes arbitration and class-action waiver terms.
        </div>
      </div>

      <BSSection title="Contents" meta="Summary" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {terms.map(([num, title, body], i, arr) => (
          <div key={num} style={{
            display: 'grid',
            gridTemplateColumns: '34px 1fr',
            gap: 12,
            padding: `${t.rowY + 7}px 0`,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.12em', color: t.ACCENT, fontWeight: 900 }}>{num}</div>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{title}</div>
              <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK70, lineHeight: 1.4 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: `18px ${t.padX}px 22px`, display: 'grid', gap: 8 }}>
        <button onClick={() => { window.location.href = 'https://www.theshapecommunity.com/terms.html'; }} style={{ borderRadius: t.RADIUS_SM,
          width: '100%',
          padding: '14px',
          border: `1px solid ${t.INK}`,
          background: t.INK,
          color: t.PAPER,
          cursor: 'pointer',
          fontFamily: t.MONO,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}>Open full terms</button>
        <button onClick={onContact} style={{ borderRadius: t.RADIUS_SM,
          width: '100%',
          padding: '14px',
          border: `1px solid ${t.INK}`,
          background: 'transparent',
          color: t.INK,
          cursor: 'pointer',
          fontFamily: t.MONO,
          fontSize: 10.5,
          fontWeight: 800,
          letterSpacing: '0.22em',
          textTransform: 'uppercase',
        }}>Contact support</button>
      </div>

      <BSFooter right="Terms" />
    </BSPage>
  );
}

function BSPrivacyPage({ onBack, onContact }) {
  const t = useBS();
  const sections = [
    ['01', 'What we collect', 'Account details (name, email), your profile and goals, the workouts, meals, and habits you log, messages with your coach, payment info processed by Stripe, and basic device/usage data.'],
    ['02', 'How we use it', 'To run your account, deliver coaching, personalize your plans and Shape Score, process payments, keep the platform safe, and improve the product.'],
    ['03', 'Wearables & integrations', 'If you connect Strava, Whoop, Oura, Garmin, Apple Health, or Spotify, we access only what those scopes allow — to show your activity, recovery, and music. Disconnect any time in Settings.'],
    ['04', 'Sharing', 'Your coach sees the data needed to coach you. We rely on processors like Supabase and Stripe to run the service. We do not sell your personal data.'],
    ['05', 'Your choices', 'You can view, edit, export, or delete your data from Settings, and control notifications and profile visibility.'],
    ['06', 'Security', 'Data is encrypted in transit, access is row-level restricted per user, and integration tokens are stored server-side — never in the app bundle.'],
    ['07', 'Retention', 'We keep your data while your account is active and for a reasonable period afterward, unless you ask us to delete it sooner.'],
    ['08', 'Children', 'Shape is for users 18 and older. We do not knowingly collect data from children.'],
    ['09', 'Changes & contact', 'Material changes are announced in advance. Questions: christopher.perry@theshapecommunity.com.'],
  ];

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Legal"
        kicker="Privacy policy"
        title={<>Privacy<br/>policy.</>}
        trailing={<BSAvatar init="P" size={36} fill={t.INK} ink={t.PAPER} />}
      />

      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>Last updated - May 21, 2026</BSEyebrow>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 500, lineHeight: 1.35, color: t.INK }}>
          How Shape collects, uses, and protects your data — across training, nutrition, recovery, payments, and the coaches you work with.
        </div>
      </div>

      <BSSection title="Summary" meta="At a glance" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {sections.map(([num, title, body], i, arr) => (
          <div key={num} style={{
            display: 'grid',
            gridTemplateColumns: '34px 1fr',
            gap: 12,
            padding: `${t.rowY + 7}px 0`,
            borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}`,
          }}>
            <div style={{ fontFamily: t.MONO, fontSize: 10, letterSpacing: '0.12em', color: t.ACCENT, fontWeight: 900 }}>{num}</div>
            <div>
              <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{title}</div>
              <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK70, lineHeight: 1.4 }}>{body}</div>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: `18px ${t.padX}px 22px`, display: 'grid', gap: 8 }}>
        <button onClick={() => { window.location.href = 'https://www.theshapecommunity.com/privacy.html'; }} style={{ borderRadius: t.RADIUS_SM, width: '100%', padding: '14px', border: `1px solid ${t.INK}`, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase' }}>Open full policy</button>
        {onContact && <button onClick={onContact} style={{ borderRadius: t.RADIUS_SM, width: '100%', padding: '14px', border: `1px solid ${t.INK}`, background: 'transparent', color: t.INK, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase' }}>Contact support</button>}
      </div>

      <BSFooter right="Privacy" />
    </BSPage>
  );
}

function BSHelpPage({ onBack, onContact }) {
  const t = useBS();
  const faqs = [
    ['Getting started', 'Set your goals in Settings, then explore Train, Eat, and Habits. Your coach builds your plan and it appears on each tab.'],
    ['Connect a wearable', 'Settings → Manage integrations. Connect Strava, Whoop, Oura, Garmin, or Apple Health (iOS) — your recovery, sleep, and workouts flow into your daily snapshot.'],
    ['Music & playlists', 'Connect Spotify in Manage integrations, then save a coach\'s workout playlist straight to your own Spotify profile.'],
    ['Billing & membership', 'Manage your membership and payment method under Account & billing (handled securely by Stripe). Coaches set their own pricing.'],
    ['Shape Score', 'Earn points for logging workouts, meals, habits, and PRs — then redeem them in the Shape Store.'],
    ['Your data & privacy', 'View, export, or delete your data any time under Settings → Privacy & data.'],
  ];

  return (
    <BSPage>
      <BSDetailHeader
        onBack={onBack}
        eyebrow="Support"
        kicker="Help center"
        title={<>Help<br/>center.</>}
        trailing={<BSAvatar init="?" size={36} fill={t.ACCENT} ink={t.INK} />}
      />

      <div style={{ padding: `18px ${t.padX}px`, borderBottom: `1px solid ${t.RULE}` }}>
        <BSEyebrow color={t.ACCENT}>Quick answers</BSEyebrow>
        <div style={{ marginTop: 10, fontFamily: t.DISPLAY, fontSize: 17, fontWeight: 500, lineHeight: 1.35, color: t.INK }}>
          The fastest way to get help: ask <b>Nora</b> in Chat → Team → Support — she answers most questions instantly. The basics are below.
        </div>
      </div>

      <BSSection title="Common questions" meta="FAQ" />
      <div style={{ padding: `0 ${t.padX}px` }}>
        {faqs.map(([q, a], i, arr) => (
          <div key={q} style={{ padding: `${t.rowY + 7}px 0`, borderBottom: i === arr.length - 1 ? 0 : `1px solid ${t.HAIR}` }}>
            <div style={{ fontFamily: t.DISPLAY, fontSize: 15.5, fontWeight: 700, color: t.INK, letterSpacing: '-0.015em' }}>{q}</div>
            <div style={{ marginTop: 5, fontFamily: t.DISPLAY, fontSize: 13.5, fontWeight: 500, color: t.INK70, lineHeight: 1.4 }}>{a}</div>
          </div>
        ))}
      </div>

      <div style={{ padding: `18px ${t.padX}px 22px`, display: 'grid', gap: 8 }}>
        {onContact && <button onClick={onContact} style={{ borderRadius: t.RADIUS_SM, width: '100%', padding: '14px', border: `1px solid ${t.INK}`, background: t.INK, color: t.PAPER, cursor: 'pointer', fontFamily: t.MONO, fontSize: 10.5, fontWeight: 800, letterSpacing: '0.22em', textTransform: 'uppercase' }}>Contact support</button>}
      </div>

      <BSFooter right="Help" />
    </BSPage>
  );
}

Object.assign(window, { BSClientApp, BSClientChat, BSSettings, BSDetailHeader, BSContactPage, BSTermsPage });
