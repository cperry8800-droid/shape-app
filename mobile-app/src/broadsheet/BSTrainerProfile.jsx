import React from 'react';
import { createPortal } from 'react-dom';
import { bsProfileLook, bsProfileStudio, bsProfileCover } from '../services/profileCustom.mjs';
import { STUDIO_WORDS, bsStudioSvg, bsStudioRoom, bsStudioSpot, bsStudioDrawOrder, BS_STUDIO_W, BS_STUDIO_H } from '../services/studioKit.mjs';
import { bsProjectAvailability, bsIsZone } from '../services/coachAvailability.mjs';
import { bsCoachPronoun } from '../services/coachPronoun.mjs';
import { bsTrainerDemo, bsTrainerSampleOf } from '../services/trainerDemo.mjs';
import { BSCoachHoursPage } from './BSCoachHours.jsx';
import { BSCoachBusinessPage, BSCoachBusinessCard } from './BSCoachBusiness.jsx';
import { BSMakeItYours } from './BSMakeItYours.jsx';

// ─── THE TRAINER PROFILE ─────────────────────────────────────────────────────────────────────
// Owner, 2026-10-27, after seven rounds on the canvas ("Show, don't sell · Quiet and premium ·
// Feels like the Shape app"): one profile, three tabs.
//
//   Header      the coach's wall photo with their round avatar over its edge, name, what they
//               do and where, their bio, the verified line, Message · Work with · Follow.
//   Her day     the coach's week of open times and a day as it really is: open times you can
//               take (a free intro call, booked at that time), and busy time that says only
//               that it is busy. From the same public read the listing books from.
//   The studio  their space as they drew it (Make it yours → Your space); tap a number for
//               what they do there, in their words. Their listing photos under it.
//   Replays     the sessions they logged and shared, named by the workout, stepped set by set
//               with their note. (Shape records no lift video, so a replay is the logged session.)
//
// The coach paints it: their paper and accent from Shape's own set (profile_custom.look), set in
// Make it yours. The page renders inside a BSProvider of those colours, so every piece of chrome
// on it (the pinned masthead too) is theirs. Prices live in one place, the Work-with sheet, which
// is the shared storefront (BSCoachCoachingBlock with useBSCoachCommerce, the client module's).
//
// Words for the coach follow the pronouns they wrote, or their first name (coachPronoun.mjs).
//
// A trainer page with no Shape account behind it has sample content (trainerDemo.mjs, owner,
// 2026-10-28: "demo environment should show new profile designs"):
//   · The trainer app's own page signed out (the demo coach) reads nothing from Shape, and Make it
//     yours changes it on this screen only.
//   · A coach a member opens with no account (a marketplace listing Shape seeded, a demo person)
//     shows its listing's own facts, read fresh by the listing's id (name, bio, price, credential,
//     its open times when it has hours), with a sample wall photo, studio, replays and reviews.
//     Sample open times are shown but never taken: nothing is booked on a sample.
//
// ⚠ WINDOW GLOBALS ARE READ AT CALL TIME: this module is a static import of the client module
// and evaluates before that module's body has put them on window.

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
function intlLocale() {
  try { return window.ShapeI18n?.intlLocale?.() || window.ShapeI18n?.current?.() || undefined; } catch (e) { return undefined; }
}
const hexA = (hex, a) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};
const lum = (hex) => {
  const m = /^#([0-9a-f]{6})$/i.exec(String(hex || ''));
  if (!m) return 0;
  const [r, g, b] = [0, 2, 4].map((i) => { let v = parseInt(m[1].slice(i, i + 2), 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const onColor = (hex) => (lum(hex) > 0.36 ? '#0b0d0c' : '#ffffff');
const signedInUid = () => { try { return window.ShapeAuth?.getCachedState?.()?.user?.id || null; } catch (e) { return null; } };
const isoDay = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const FOCUS_POS = { top: 'center 22%', center: 'center 50%', bottom: 'center 80%' };
const STUDIO_KIND_KEYS = {
  private: ['kindPrivate', 'Private studio'], garage: ['kindGarage', 'Garage gym'], gym: ['kindGym', 'Full gym'], pilates: ['kindPilates', 'Pilates studio'],
  boxing: ['kindBoxing', 'Boxing gym'], outdoor: ['kindOutdoor', 'Outdoors'], blank: ['kindBlank', 'Their space'],
};

function sheetHost() {
  return typeof document !== 'undefined' ? (document.getElementById('bs-phone-surface') || document.body) : null;
}
// A bottom sheet on the phone surface: scrim, then the sheet. Closes on the scrim.
function Sheet({ t, onClose, label, children, dark = false }) {
  const host = sheetHost();
  const el = (
    <div style={{ position: 'absolute', inset: 0, zIndex: 220 }}>
      <div onClick={onClose} aria-hidden style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div role="dialog" aria-label={label} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', overflowY: 'auto', borderRadius: '22px 22px 0 0', background: dark ? '#0c0d0f' : t.PAPER, color: dark ? '#e8ebef' : t.INK, fontFamily: t.BODY, WebkitFontSmoothing: 'antialiased', padding: '10px 18px calc(22px + env(safe-area-inset-bottom))', boxShadow: '0 -16px 40px rgba(0,0,0,0.28)' }}>
        <div aria-hidden style={{ width: 40, height: 4, borderRadius: 99, background: dark ? 'rgba(232,235,239,0.25)' : t.RULE, margin: '0 auto 8px' }} />
        {children}
      </div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}
function CloseX({ onClose, color, label }) {
  return <button type="button" onClick={onClose} aria-label={label} style={{ width: 44, height: 44, margin: '-6px -10px -6px 0', border: 0, background: 'transparent', color, fontSize: 24, cursor: 'pointer' }}>×</button>;
}

// ── The page, in the coach's colours ─────────────────────────────────────────────────────────
export function BSTrainerProfile(props) {
  const { useBS, BSProvider } = window;
  const outer = useBS();
  const { person, isSelf = false } = props;
  const tr = useShapeTr();
  // The demo is the trainer app's own page with nobody signed in, and only that: a page opened for
  // an account, or with one signed in, is always the real one. A sample is another trainer's page
  // with no account behind it.
  const demoOn = isSelf && !person.userId && !signedInUid();
  const sampleOn = !isSelf && !person.userId;
  const lb = !!(outer && outer.uMeasure && outer.uMeasure(1, 'kg').unit === 'lb');
  // Built again when the language changes (useShapeTr re-renders this on it), for the stations' names.
  const lang = (() => { try { return window.ShapeLocale?.get?.() || ''; } catch (e) { return ''; } })();
  const sampleKey = sampleOn ? String(person.providerId || person.who || '') : '';
  const sampleCity = sampleOn && person.city && !/^(remote|online|anywhere)$/i.test(String(person.city).trim()) ? String(person.city) : '';
  const demo = React.useMemo(() => {
    if (!demoOn && !sampleOn) return null;
    const base = { media: `${import.meta.env.BASE_URL}demo/`, word: (k) => tr('profile:studio.word.' + k, { defaultValue: STUDIO_WORDS[k] || k }), lb };
    if (demoOn) return { ...bsTrainerDemo(base), mode: 'self' };
    return { ...bsTrainerDemo({ ...base, ...bsTrainerSampleOf({ key: sampleKey, specialty: person.specialty }), where: sampleCity, business: null }), mode: 'sample' };
  }, [demoOn, sampleOn, sampleKey, sampleCity, person.specialty, lb, lang]);
  const [demoOwn, setDemoOwn] = React.useState(null);
  const [live, setLive] = React.useState(null);
  const [own, setOwn] = React.useState(null);
  React.useEffect(() => {
    setLive(null);
    if (demoOn || !person.userId || !window.ShapeProfiles?.getPublicProfile) return undefined;
    let on = true;
    window.ShapeProfiles.getPublicProfile(person.userId).then((d) => { if (on && d) setLive(d); }).catch(() => {});
    return () => { on = false; };
  }, [person.userId, demoOn]);
  // Whether the coach's own doc has been read. Make it yours opens only on that doc, never on the
  // defaults, which a save would write over their look, studio and wall photo (Codex P1 on #2484).
  const [ownState, setOwnState] = React.useState('loading');
  const [ownFor, setOwnFor] = React.useState(null); // the account `own` was read for
  const [ownEpoch, setOwnEpoch] = React.useState(0);
  React.useEffect(() => {
    if (!isSelf || demoOn) return undefined;
    const uid = signedInUid();
    if (!uid) { setOwnState('error'); return undefined; }
    let on = true;
    setOwnState('loading');
    // Bound to the account this page opened for, so a switch mid-read never shows another's doc.
    (async () => {
      let d = null;
      try { d = await window.shapeDb?.getUserGoals?.('profile_custom', { expectedUserId: uid }); } catch (e) { d = null; }
      if (!on) return;
      if (d && typeof d === 'object' && !Array.isArray(d)) { setOwn(d); setOwnFor(uid); setOwnState('ready'); } else setOwnState('error');
    })();
    return () => { on = false; };
  }, [isSelf, ownEpoch, demoOn]);
  const custom = demo ? ((demo.mode === 'self' && demoOwn) || demo.custom) : isSelf ? own : (live && live.custom) || null;
  const look = bsProfileLook(custom && custom.look) || {};
  const page = demo
    ? <TrainerPage {...props} demo={demo} live={demo.mode === 'self' ? demo.live : null} custom={custom} setOwn={setDemoOwn} ownState="ready" ownFor={null} />
    : <TrainerPage {...props} live={live} custom={custom} setOwn={setOwn} ownState={isSelf ? ownState : 'ready'} ownFor={ownFor} onRetryOwn={() => setOwnEpoch((n) => n + 1)} />;
  if (!BSProvider) return page;
  return (
    <BSProvider paperMode={look.paper || 'dark'} accentKey={look.accent || 'teal'} densityKey={outer.densityKey} borderKey={outer.borderKey}
      weightKey={outer.weightKey} textScaleKey={outer.textScaleKey} textureKey={outer.textureKey} textureColor={outer.textureColor}>
      {page}
    </BSProvider>
  );
}

function TrainerPage({ person, onBack, onMessage, isSelf = false, meMode = false, onOpenSettings = () => {}, onOpenScore = () => {}, live, custom, setOwn, ownState = 'ready', ownFor = null, onRetryOwn = () => {}, demo = null, onListing = null }) {
  const W = window;
  const t = W.useBS();
  const tr = useShapeTr();
  const locale = intlLocale();
  const ACC = t.ACCENT || (t.isLight ? '#0a8f87' : '#34d6c5');
  const ON_ACC = onColor(ACC);
  const INK = t.INK;
  const ink = (a) => hexA(INK, a);
  const MONO = t.MONO || "'JetBrains Mono', monospace";
  const DISPLAY = t.DISPLAY || "'Saira', system-ui, sans-serif";
  const BODY = t.BODY || '-apple-system, system-ui, sans-serif';
  const gutter = W.bsGutter ? W.bsGutter(t) : 22;
  const pinnedTop = W.useBSPinnedMastTop ? W.useBSPinnedMastTop() : 0;
  if (W.useBSPresence) W.useBSPresence();
  const hasMessage = typeof onMessage === 'function' && !isSelf;
  // The demo coach's own page, or a sample of another coach (see the header).
  const selfDemo = demo && demo.mode === 'self' ? demo : null;
  const sample = demo && demo.mode === 'sample' ? demo : null;

  // ── Who ──
  const isPrivate = !!(live && (live.can_view === false || (live.can_view == null && live.is_public === false)));
  const name = (isSelf && W.bsMyName && W.bsMyName()) || person.who || (live && live.name) || tr('profile:trainer.coach', { defaultValue: 'Coach' });
  const first = String(name).split(' ')[0];
  const pron = bsCoachPronoun(!isPrivate && live ? live.pronouns : '');
  const words = {
    day: pron === 'her' ? tr('profile:trainer.dayHer', { defaultValue: 'Her day' }) : pron === 'him' ? tr('profile:trainer.dayHim', { defaultValue: 'His day' }) : pron === 'them' ? tr('profile:trainer.dayThem', { defaultValue: 'Their day' }) : tr('profile:trainer.dayName', { defaultValue: "{name}'s day", name: first }),
    work: pron === 'her' ? tr('profile:trainer.workHer', { defaultValue: 'Work with her' }) : pron === 'him' ? tr('profile:trainer.workHim', { defaultValue: 'Work with him' }) : pron === 'them' ? tr('profile:trainer.workThem', { defaultValue: 'Work with them' }) : tr('profile:trainer.workName', { defaultValue: 'Work with {name}', name: first }),
  };
  const points = live && Number.isFinite(live.points) ? live.points : null;
  const tierKey = points != null && W.bsTierForPoints ? W.bsTierForPoints(points) : (person.tier || 'base');
  const tierName = W.bsCoachTier ? W.bsCoachTier(tierKey) : '';
  // The demo shows the signed-out persona's photo and reads or saves no account's (Codex P2 on
  // #2486): the hook is asked as for a visitor, which reads nothing and offers no picker.
  const photoHook = W.useBSProfilePhoto ? W.useBSProfilePhoto(person, isSelf && !demo) : { photo: person.photo || null, fileRef: null, onPick: null };
  const avatar = selfDemo ? ((W.bsMyPhoto && W.bsMyPhoto()) || null)
    : (isSelf && W.ShapeIdentity?.avatarMode === 'initials') ? null : (photoHook.photo || (live && live.avatar) || person.photo || null);
  const canPickPhoto = isSelf && !demo;
  // A photo that fails to load shows the initials, not an empty circle.
  const [brokenAvatar, setBrokenAvatar] = React.useState(null);
  const avatarShown = avatar && avatar !== brokenAvatar ? avatar : null;
  const initials = W.bsInitials ? W.bsInitials(name) : String(name).slice(0, 2).toUpperCase();
  const online = isSelf ? (W.bsAmLive ? W.bsAmLive() : false) : (W.bsIsUserOnline ? W.bsIsUserOnline(person.userId) : false);
  // As members read it (get_public_profile: the line in Settings → Edit profile), as the Signal
  // profile does.
  const bio = (!isPrivate && ((live && live.goal) || (live && live.bio) || person.bio)) || '';

  // ── Their listing (provider row): open times, prices, verified, photos ──
  const [provider, setProvider] = React.useState(() => (selfDemo ? selfDemo.provider : null));
  const [providerState, setProviderState] = React.useState(selfDemo ? 'ready' : 'loading');
  const [providerEpoch, setProviderEpoch] = React.useState(0);
  React.useEffect(() => {
    if (selfDemo) { setProvider(selfDemo.provider); setProviderState('ready'); return undefined; }
    setProvider(null);
    // A coach's listing by their account; a sample's by the listing's own id (no account to ask by).
    const ownerId = person.userId || (isSelf ? signedInUid() : null);
    const read = sample
      ? (person.providerId && W.ShapeCoachListing?.publicById ? () => W.ShapeCoachListing.publicById('trainer', person.providerId) : null)
      : (ownerId && W.ShapeCoachListing?.publicByOwner ? () => W.ShapeCoachListing.publicByOwner('trainer', ownerId) : null);
    if (!read) { setProviderState('none'); return undefined; }
    let on = true;
    setProviderState('loading');
    read()
      .then((row) => { if (!on) return; setProvider(row); setProviderState(row ? 'ready' : 'none'); })
      .catch(() => { if (on) setProviderState('error'); });
    return () => { on = false; };
  }, [person.userId, person.providerId, isSelf, providerEpoch, demo]);
  // The listing is what that lookup found, and only that: a marketplace snapshot the profile was
  // opened with never stands in for it, so a listing taken off the marketplace since offers no
  // times, photos or checkout here (Codex P1 on #2484).
  const listed = providerState === 'ready' && !!provider;
  const providerId = listed ? provider.id : null;
  const listedMedia = (listed && provider.listing_media) || { cover: null, gallery: [] };
  // A sample shows its listing's own photos when it has any, and the sample's where it has none.
  const media = sample
    ? { cover: listedMedia.cover || null, gallery: listedMedia.gallery && listedMedia.gallery.length ? listedMedia.gallery : sample.provider.listing_media.gallery }
    : listedMedia;
  // The demo's wall photo is one of its own sample photos, and only that.
  const cover = demo
    ? (custom && custom.cover && demo.photos.includes(custom.cover.image) ? { image: custom.cover.image } : null)
    : bsProfileCover(custom && custom.cover, person.userId || (isSelf ? signedInUid() : null));
  // A private profile shows name, photo and tier only: nothing from the listing either (Codex P1
  // on #2484).
  const wall = isPrivate ? null : (sample ? (media.cover || (cover && cover.image)) : ((cover && cover.image) || media.cover)) || null;
  const look = bsProfileLook(custom && custom.look) || {};
  const studio = bsProfileStudio(custom && custom.studio);
  const where = isPrivate ? '' : ((custom && custom.bizCard && custom.bizCard.where) || (studio && studio.where) || person.city || '');
  const specialty = (!isPrivate && ((listed && (provider.specialty || provider.specialty_type)) || (sample && person.category))) || '';
  const business = !isPrivate && custom && custom.bizCard && custom.bizCard.name;
  const roleLine = [specialty || tr('profile:trainer.role', { defaultValue: 'Coach' }), business].filter(Boolean).join(' · ');

  // ── Their week: the public read the listing books from ──
  const [avail, setAvail] = React.useState({ kind: 'loading' });
  const [availEpoch, setAvailEpoch] = React.useState(0);
  React.useEffect(() => {
    const real = !selfDemo && providerId && W.ShapeCoachAvailability?.get;
    // A sample waits for its listing's read, then shows the listing's own hours or the sample week.
    if (!selfDemo && !real && !(sample && providerState !== 'loading')) { setAvail({ kind: providerState === 'loading' ? 'loading' : 'none' }); return undefined; }
    let on = true;
    setAvail({ kind: 'loading' });
    const week = (d) => {
      if (!d || !Array.isArray(d.slots)) return null;
      const len = Number(d.rules && d.rules.consultMin);
      const introMin = Number.isInteger(len) && len >= 5 && len <= 240 ? len : 15;
      const zoneOk = !d.slots.length || bsIsZone(d.timezone);
      const open = zoneOk ? bsProjectAvailability({ slots: d.slots, booked: d.booked || [], weeks: 2, zone: d.timezone, busy: d.busy || [], rules: d.rules || null, sessionMin: introMin }) : [];
      return { kind: 'ready', open, busy: Array.isArray(d.busy) ? d.busy : [], introMin, hasHours: d.slots.length > 0, zoneOk, atCapacity: typeof d.atCapacity === 'boolean' ? d.atCapacity : null, introsAtCap: !!(d.rules && d.rules.introsAtCapacity === true) };
    };
    // Sample times are shown, never taken (`sample: true`): nothing is booked on a sample.
    const sampleWeek = () => ({ ...week(sample.availability), sample: true });
    (selfDemo ? Promise.resolve(selfDemo.availability) : real ? W.ShapeCoachAvailability.get('trainer', providerId, availEpoch > 0 ? { fresh: true } : undefined) : Promise.resolve(null))
      .then((d) => {
        if (!on) return;
        const a = week(d);
        if (sample && !(a && a.hasHours && a.zoneOk)) { setAvail(sampleWeek()); return; }
        setAvail(a || { kind: 'error' });
      })
      .catch(() => { if (on) setAvail(sample ? sampleWeek() : { kind: 'error' }); });
    return () => { on = false; };
  }, [providerId, providerState, availEpoch, demo]);

  // ── The storefront: the client module's shared hook, fed this coach's real listing ──
  const [tab, setTab] = React.useState('day');
  const monthly = listed && Number(provider.price) > 0 ? Number(provider.price) : null;
  const offer = listed && provider.monthly_offer && typeof provider.monthly_offer === 'object' ? provider.monthly_offer : null;
  const commerce = !listed ? null : (person.commerce || {
    coach: { name, provider_role: 'trainer', provider_id: provider.id, db_id: provider.id, provider_user_id: provider.owner_id, rate: Number(provider.session_price || provider.price || 0), at_capacity: !!provider.at_capacity, capacity_resume_at: provider.capacity_resume_at || null, id: person.userId },
    packages: monthly ? [{ type: 'Subscription', name: tr('profile:trainer.monthly', { defaultValue: 'Monthly coaching' }), price: `$${monthly}`, unit: '/ month', perks: (offer && Array.isArray(offer.includes) ? offer.includes : []).slice(0, 3) }] : [],
    atCapacity: avail.kind === 'ready' && avail.atCapacity != null ? avail.atCapacity : undefined,
    introsAtCapacity: avail.kind === 'ready' ? avail.introsAtCap : false,
    // On sample times there is no time to take here, so the intro is booked on the full listing.
    bookIntro: () => { setSheet(null); if (avail.sample && onListing) onListing(); else setTab('day'); },
  });
  const cm = W.useBSCoachCommerce ? W.useBSCoachCommerce({ person: { ...person, commerce, providerId }, isSelf, isNutri: false, name, first, city: where }) : null;
  // The storefront shows only what this coach really sells: with no monthly price on their listing
  // the shared block would print its demo package, so the sheet shows the intro and Message instead.
  const sells = !!(commerce && Array.isArray(commerce.packages) && commerce.packages.some((p) => p && p.type === 'Subscription'));
  const introClosed = !!(cm && cm.atCapacity && !(avail.kind === 'ready' && avail.introsAtCap) && !(cm.wl && cm.wl.status === 'invited'));
  const [salePlans, setSalePlans] = React.useState(null);
  React.useEffect(() => {
    if (!person.userId || !W.ShapeCoachPlans?.salePlansByUser) { setSalePlans([]); return undefined; }
    let on = true;
    W.ShapeCoachPlans.salePlansByUser(person.userId).then((r) => { if (on) setSalePlans(r || []); }).catch(() => { if (on) setSalePlans([]); });
    return () => { on = false; };
  }, [person.userId]);

  // ── Reviews: the verified line, and the sheet it opens ──
  const [liveReviews, setReviews] = React.useState(null);
  React.useEffect(() => {
    if (!person.userId || !W.ShapeCoachReviews?.forOwner) return undefined;
    let on = true;
    W.ShapeCoachReviews.forOwner(person.userId).then((d) => { if (on && d) setReviews({ list: Array.isArray(d.reviews) ? d.reviews : [], avg: Number(d.avg) || 0, count: Number.isFinite(Number(d.count)) ? Number(d.count) : (d.reviews || []).length }); }).catch(() => {});
    return () => { on = false; };
  }, [person.userId]);
  // A sample's rating is its listing's, over the sample reviews it shows.
  const reviews = selfDemo ? selfDemo.reviews
    : sample ? { list: sample.reviews.list, avg: Number(person.rating10) > 0 ? Number(person.rating10) : sample.reviews.avg, count: sample.reviews.list.length }
    : liveReviews;

  // ── Their logged sessions (Replays) ──
  const [posts, setPosts] = React.useState([]);
  const [postsNonce, setPostsNonce] = React.useState(0);
  const feedAuthor = person.userId || (isSelf ? signedInUid() : null);
  React.useEffect(() => {
    if (!feedAuthor || !W.ShapeCommunity?.listByAuthor) return undefined;
    let on = true;
    W.ShapeCommunity.listByAuthor(feedAuthor, { withPhotoOnly: false }).then((r) => { if (on) setPosts(Array.isArray(r && r.data) ? r.data : []); }).catch(() => {});
    return () => { on = false; };
  }, [feedAuthor, postsNonce]);
  const replays = demo ? demo.replays : posts.map((p) => (W.bsProfileCardFromPost ? W.bsProfileCardFromPost(p, 'Trainer') : null))
    .filter((c) => c && c.breakdown && Array.isArray(c.breakdown.rows) && c.breakdown.rows.length);

  // ── Follow ──
  const [follow, setFollow] = React.useState(() => (person.userId && W.ShapeFollows?.getCached?.(person.userId)) || null);
  React.useEffect(() => {
    if (!person.userId || isSelf || !W.ShapeFollows?.stats) return undefined;
    let on = true;
    W.ShapeFollows.stats(person.userId).then((s) => { if (on) setFollow(s); }).catch(() => {});
    return () => { on = false; };
  }, [person.userId, isSelf]);
  const [followBusy, setFollowBusy] = React.useState(false);
  const toggleFollow = async () => {
    if (followBusy || !person.userId) return;
    if (W.bsRequireAccount && !W.bsRequireAccount('follow')) return;
    setFollowBusy(true);
    try { setFollow(await W.ShapeFollows.toggle(person.userId)); } catch (e) { W.__bsToast?.(e?.message || tr('profile:trainer.followError', { defaultValue: 'Could not update follow.' }), 'err'); }
    finally { setFollowBusy(false); }
  };

  // ── Overlays ──
  const [sheet, setSheet] = React.useState(null); // { kind: 'work'|'book'|'station'|'replay'|'reviews', ... }
  const [page, setPage] = React.useState(null);   // 'edit' | 'hours' | 'business'
  const [editTab, setEditTab] = React.useState('colors');
  const [showLog, setShowLog] = React.useState(false);
  // Every way into Make it yours goes through here, and waits for the coach's doc (ownState).
  const editReady = ownState === 'ready';
  // The doc was read for one account. With another signed in now, it is read again for that one
  // rather than opened under it (Codex P1 on #2484).
  const openEdit = (tabKey) => {
    if (!editReady) return;
    if (isSelf && signedInUid() !== ownFor) { onRetryOwn(); return; }
    setEditTab(tabKey); setPage('edit');
  };

  // Tabs a visitor sees only when there is something in them; the coach always sees all three.
  const hasStudio = !!(studio || (media.gallery && media.gallery.length));
  const tabs = [
    ['day', words.day],
    ...(isSelf || hasStudio ? [['studio', tr('profile:trainer.tabStudio', { defaultValue: 'The studio' })]] : []),
    ...(isSelf || replays.length ? [['replays', tr('profile:trainer.tabReplays', { defaultValue: 'Replays' })]] : []),
  ];
  const tabNow = tabs.some(([k]) => k === tab) ? tab : 'day';

  if (page === 'edit' && editReady) {
    const photos = demo ? demo.photos : [media.cover, ...((media.gallery || []).map((g) => g && g.url))].filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
    return <BSMakeItYours role="trainer" demo={!!demo} ownerUid={ownFor} initial={custom} startTab={editTab} who={{ name, first, photo: avatarShown, roleLine }} words={words} photos={photos}
      onClose={() => setPage(null)} onSaved={(doc) => { setOwn && setOwn(doc); setPage(null); }} />;
  }
  if (page === 'hours') return <BSCoachHoursPage role="trainer" onBack={() => { setPage(null); setAvailEpoch((n) => n + 1); }} />;
  if (page === 'business') return <BSCoachBusinessPage role="trainer" tab="money" onBack={() => setPage(null)} />;

  const BSPage = W.BSPage;
  const corner = W.BS_HEADER_AVATAR || 34;
  const wallH = 214;
  const topPad = W.BS_MAST_TOP_CSS || '12px';
  const verified = listed && provider.verified;
  const ratingBit = reviews && reviews.count > 0
    ? tr('profile:trainer.rated', { defaultValue: '{rating}/10 from {count, plural, one {# review} other {# reviews}}', rating: (Math.round(reviews.avg * 10) / 10).toFixed(1), count: reviews.count })
    : tr('profile:trainer.newCoach', { defaultValue: 'New on Shape' });

  return (
    <BSPage>
      <div data-trainer-profile="" style={{ color: INK, fontFamily: BODY, WebkitFontSmoothing: 'antialiased', minHeight: '100%', background: t.PAPER_BG }}>
        {canPickPhoto && photoHook.fileRef ? <input ref={photoHook.fileRef} type="file" accept="image/*" onChange={photoHook.onPick} style={{ display: 'none' }} /> : null}
        {/* The wall: their photo, or their colour until they add one */}
        <div style={{ position: 'relative', height: `calc(${topPad} + ${wallH}px)`, overflow: 'hidden', background: wall ? '#111' : `linear-gradient(135deg, ${hexA(ACC, 0.42)}, ${t.PAPER2} 70%)` }}>
          {wall ? <img src={wall} alt={tr('profile:trainer.wallAlt', { defaultValue: "{name}'s wall photo", name: first })} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: FOCUS_POS[look.focus] || FOCUS_POS.center }} /> : null}
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.22) 100%)' }} />
          <div style={{ position: 'relative', padding: `${topPad} ${Math.max(4, gutter - 10)}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            {meMode ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 10, color: '#fff' }}>
                {W.BSLogo ? <W.BSLogo size={16} color="#ffffff" /> : null}
                <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>Vol. 1 · No. 1</span>
              </span>
            ) : (
              <button type="button" onClick={onBack} aria-label={tr('profile:trainer.back', { defaultValue: 'Back' })} style={{ minHeight: 44, padding: '0 10px', border: 0, background: 'transparent', color: '#fff', fontFamily: MONO, fontSize: 11, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer', textShadow: '0 1px 6px rgba(0,0,0,0.5)' }}>← {tr('profile:trainer.back', { defaultValue: 'Back' })}</button>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: W.BS_CORNER_GAP || 8 }}>
              {W.BSSearchCorner ? <W.BSSearchCorner size={corner} ink="#ffffff" /> : null}
              {isSelf ? (
                <button type="button" onClick={() => openEdit('colors')} disabled={!editReady} aria-label={tr('profile:trainer.makeItYours', { defaultValue: 'Make it yours' })}
                  style={{ width: corner, height: corner, borderRadius: 99, border: '1px solid rgba(255,255,255,0.5)', background: 'rgba(0,0,0,0.25)', color: '#fff', display: 'grid', placeItems: 'center', cursor: editReady ? 'pointer' : 'default', opacity: editReady ? 1 : 0.5 }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                </button>
              ) : null}
              {/* A visitor's ⚙ opens their own profile, as BSMeCorner's does; that corner itself draws a
                  second ✦ ⌕ and in the page's ink, not white over the photo. */}
              {W.BSSettingsCorner ? <W.BSSettingsCorner size={corner} ink="#ffffff" onClick={isSelf ? onOpenSettings : () => { try { window.dispatchEvent(new window.CustomEvent('shape:openProfile')); } catch (e) {} }} /> : null}
            </div>
          </div>
          {isSelf && !wall ? (
            <button type="button" onClick={() => openEdit('wall')} disabled={!editReady}
              style={{ position: 'absolute', right: gutter, bottom: 14, minHeight: 36, padding: '0 12px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.6)', background: 'rgba(0,0,0,0.3)', color: '#fff', fontFamily: DISPLAY, fontSize: 13, fontWeight: 600, cursor: editReady ? 'pointer' : 'default', opacity: editReady ? 1 : 0.5 }}>
              ＋ {tr('profile:trainer.addWall', { defaultValue: 'Add a wall photo' })}
            </button>
          ) : null}
        </div>

        {/* The avatar over the wall's edge, and who they are */}
        <div style={{ position: 'relative', padding: `0 ${gutter}px` }}>
          <div style={{ position: 'absolute', left: gutter, top: -58, width: 108, height: 108 }}>
            <button type="button" disabled={!canPickPhoto} onClick={() => { if (canPickPhoto && photoHook.fileRef?.current) photoHook.fileRef.current.click(); }} aria-label={canPickPhoto ? tr('profile:trainer.changePhoto', { defaultValue: 'Change your photo' }) : name}
              style={{ width: 108, height: 108, padding: 0, borderRadius: 99, border: `4px solid ${t.PAPER}`, background: t.PAPER2, overflow: 'hidden', cursor: canPickPhoto ? 'pointer' : 'default', display: 'grid', placeItems: 'center', boxSizing: 'border-box' }}>
              {avatarShown ? <img src={avatarShown} alt="" onError={() => setBrokenAvatar(avatarShown)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} /> : <span style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 600, color: INK }}>{initials}</span>}
            </button>
            {online ? <span aria-label={tr('profile:trainer.online', { defaultValue: 'Online now' })} style={{ position: 'absolute', right: 6, bottom: 6, width: 18, height: 18, borderRadius: 99, background: '#34d6c5', border: `3px solid ${t.PAPER}`, boxSizing: 'border-box' }} /> : null}
          </div>
          <div style={{ marginLeft: 120, paddingTop: 8, minHeight: 58, display: 'flex', flexDirection: 'column', gap: 2 }}>
            <h1 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 600, fontSize: 26, lineHeight: 1.05, color: INK }}>{name}<span style={{ color: ACC }}>.</span></h1>
            <span style={{ fontSize: 13, color: ink(0.74) }}>{roleLine}</span>
            {where ? <span style={{ fontSize: 12, color: ink(0.64) }}>{where}</span> : null}
          </div>
          {isPrivate ? (
            <p style={{ margin: '14px 0 0', fontSize: 14, color: ink(0.74) }}>{live && live.visibility === 'friends'
              ? tr('profile:coach.privateFriends', { name: first, defaultValue: '{name} shares their profile with friends — connect to see more.' })
              : tr('profile:coach.privateOnly', { name: first, defaultValue: '{name} keeps their profile private — only name and tier are shown.' })}</p>
          ) : (
            <>
              {bio ? <p style={{ margin: '14px 0 0', fontSize: 15.5, lineHeight: 1.5, color: INK }}>{bio}</p> : (isSelf ? <button type="button" onClick={onOpenSettings} style={{ display: 'block', margin: '14px 0 0', padding: 0, minHeight: 36, border: 0, background: 'transparent', textAlign: 'left', fontSize: 14, color: ink(0.6), cursor: 'pointer' }}>{tr('profile:trainer.noBio', { defaultValue: 'Add a line about how you coach in Settings → Edit profile.' })}</button> : null)}
              <button type="button" onClick={() => setSheet({ kind: 'reviews' })} style={{ display: 'block', margin: '8px 0 0', padding: 0, border: 0, background: 'transparent', textAlign: 'left', fontSize: 12.5, color: ink(0.64), cursor: 'pointer' }}>
                {verified ? <span style={{ color: ACC }}>✓ </span> : null}
                {[verified ? tr('profile:trainer.verifiedTier', { defaultValue: 'Verified {tier} coach', tier: tierName }) : tierName, ratingBit].filter(Boolean).join(' · ')}
              </button>
              {sample ? <p data-sample-note="" style={{ margin: '10px 0 0', padding: '8px 10px', borderLeft: `2px solid ${ACC}`, background: t.PAPER2, fontSize: 12.5, lineHeight: 1.45, color: ink(0.74) }}>{tr('profile:trainer.sampleNote', { defaultValue: '{name} hasn\'t set up a Shape account yet, so the studio, replays, reviews and times here are samples.', name: first })}</p> : null}
              {isSelf && points != null ? <button type="button" onClick={onOpenScore} style={{ display: 'block', margin: '2px 0 0', minHeight: 32, padding: 0, border: 0, background: 'transparent', textAlign: 'left', fontFamily: MONO, fontSize: 11, letterSpacing: '0.06em', color: ink(0.7), cursor: 'pointer' }}>{tr('profile:trainer.score', { defaultValue: 'Shape Score {points} ›', points: points.toLocaleString(locale) })}</button> : null}
            </>
          )}
          <div style={{ marginTop: 14, display: 'flex', gap: 8 }}>
            {isSelf ? (
              <>
                <button type="button" onClick={() => openEdit('colors')} disabled={!editReady} style={{ flex: 1.2, minHeight: 46, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: editReady ? 'pointer' : 'default', opacity: editReady ? 1 : 0.55 }}>{tr('profile:trainer.makeItYours', { defaultValue: 'Make it yours' })}</button>
                <button type="button" onClick={() => setPage('hours')} style={{ flex: 1, minHeight: 46, border: `1px solid ${ink(0.22)}`, background: 'transparent', color: INK, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.yourHours', { defaultValue: 'Your hours' })}</button>
              </>
            ) : (
              <>
                {hasMessage ? <button type="button" onClick={() => onMessage(person)} style={{ flex: 1.2, minHeight: 46, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.message', { defaultValue: 'Message {name}', name: first })}</button> : null}
                {!isPrivate ? <button type="button" onClick={() => setSheet({ kind: 'work' })} style={{ flex: 1, minHeight: 46, border: hasMessage ? `1px solid ${ink(0.22)}` : 0, background: hasMessage ? 'transparent' : ACC, color: hasMessage ? INK : ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{words.work}</button> : null}
                {person.userId ? (
                  <button type="button" onClick={toggleFollow} disabled={followBusy} aria-pressed={!!(follow && (follow.isFollowing || follow.isPending))}
                    aria-label={follow && follow.isFollowing ? tr('profile:trainer.following', { defaultValue: 'Following' }) : follow && follow.isPending ? tr('profile:trainer.requested', { defaultValue: 'Requested' }) : tr('profile:trainer.follow', { defaultValue: 'Follow' })}
                    style={{ width: 46, minHeight: 46, border: `1px solid ${follow && (follow.isFollowing || follow.isPending) ? ACC : ink(0.22)}`, background: follow && follow.isFollowing ? hexA(ACC, 0.16) : 'transparent', color: follow && (follow.isFollowing || follow.isPending) ? ACC : INK, fontSize: 18, cursor: 'pointer' }}>{follow && follow.isFollowing ? '✓' : follow && follow.isPending ? '…' : '＋'}</button>
                ) : null}
              </>
            )}
          </div>
          {isSelf && ownState === 'error' ? (
            <div role="status" data-own-error="" style={{ marginTop: 10 }}>
              <Hint ink={ink}>{tr('profile:trainer.ownError', { defaultValue: "Couldn't read your page just now." })}</Hint>
              <button type="button" onClick={onRetryOwn} style={linkBtn(ACC, DISPLAY)}>{tr('profile:trainer.retry', { defaultValue: 'Try again' })}</button>
            </div>
          ) : null}
          {meMode && isSelf ? <div style={{ marginTop: 16 }}><BSCoachBusinessCard role="trainer" accent={ACC} onOpen={() => setPage('business')} /></div> : null}
        </div>

        {/* Tabs */}
        {!isPrivate ? (
          <>
            <nav aria-label={tr('profile:trainer.sections', { defaultValue: 'Profile sections' })} style={{ position: 'sticky', top: pinnedTop, zIndex: 4, marginTop: 18, background: t.PAPER, borderBottom: `1px solid ${ink(0.18)}`, display: 'flex', padding: '0 8px' }}>
              {tabs.map(([k, label]) => {
                const on = k === tabNow;
                return (
                  <button key={k} type="button" aria-pressed={on} onClick={() => setTab(k)}
                    style={{ flex: 1, minHeight: 48, border: 0, borderBottom: `2px solid ${on ? ACC : 'transparent'}`, marginBottom: -1, background: 'transparent', color: on ? INK : ink(0.55), fontFamily: DISPLAY, fontWeight: on ? 600 : 400, fontSize: 15, cursor: 'pointer' }}>{label}</button>
                );
              })}
            </nav>
            <div style={{ padding: `0 ${gutter}px 30px` }}>
              {tabNow === 'day' ? (
                <DayTab t={t} tr={tr} locale={locale} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} avail={avail} providerState={avail.sample ? 'ready' : providerState} isSelf={isSelf} first={first} words={words}
                  introClosed={introClosed} onRetry={() => (providerState === 'error' ? setProviderEpoch : setAvailEpoch)((n) => n + 1)} onTake={isSelf || avail.sample ? null : (slot) => setSheet({ kind: 'book', slot })} onWork={() => setSheet({ kind: 'work' })} onHours={() => setPage('hours')} />
              ) : tabNow === 'studio' ? (
                <StudioTab t={t} tr={tr} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} studio={studio} gallery={media.gallery || []} isSelf={isSelf} first={first}
                  onStation={(n, p) => setSheet({ kind: 'station', n, p })} onDraw={() => openEdit('space')} />
              ) : (
                <ReplaysTab t={t} tr={tr} ACC={ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} replays={replays} isSelf={isSelf} first={first}
                  onOpen={(r) => setSheet({ kind: 'replay', r, i: 0 })} onLog={() => { if (W.bsRequireAccount && !W.bsRequireAccount('log activity')) return; setShowLog(true); }} />
              )}
            </div>
          </>
        ) : null}
        <footer style={{ padding: `8px ${gutter}px 34px`, fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink(0.5) }}>
          {[listed && provider.credential, verified ? tr('profile:trainer.checked', { defaultValue: 'Checked by Shape' }) : null].filter(Boolean).join(' · ')}
        </footer>
      </div>

      {sheet && sheet.kind === 'work' ? (
        <Sheet t={t} label={words.work} onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 500, fontSize: 22 }}>{tr('profile:trainer.workTitle', { defaultValue: 'Work with {name}', name: first })}<span style={{ color: ACC }}>.</span></h2>
            <CloseX onClose={() => setSheet(null)} color={INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
          </div>
          <p style={{ margin: '2px 0 0', fontSize: 13.5, color: ink(0.64) }}>{(offer && offer.blurb) || tr('profile:trainer.workSub', { defaultValue: 'Start with a free intro call. Everything runs in the Shape app.' })}</p>
          {cm && sells && W.BSCoachCoachingBlock ? <W.BSCoachCoachingBlock cm={cm} isSelf={isSelf} isNutri={false} first={first} ownZero salePlans={salePlans} c={ACC} /> : (
            <div style={{ marginTop: 14 }}>
              <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: ink(0.74) }}>{isSelf
                ? tr('profile:trainer.noPricesSelf', { defaultValue: 'Members see your prices here once your listing has a monthly price.' })
                : tr('profile:trainer.noPrices', { defaultValue: '{name} hasn\'t listed prices on Shape yet. Book a free intro or send a message to ask.', name: first })}</p>
              {!isSelf && providerId && !avail.sample ? <button type="button" onClick={() => { setSheet(null); setTab('day'); }} style={{ marginTop: 12, width: '100%', minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.pickIntro', { defaultValue: 'Pick an intro time' })}</button> : null}
              {!isSelf && hasMessage ? <button type="button" onClick={() => { setSheet(null); onMessage(person); }} style={{ marginTop: 8, width: '100%', minHeight: 50, border: `1px solid ${ink(0.22)}`, background: 'transparent', color: INK, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.message', { defaultValue: 'Message {name}', name: first })}</button> : null}
            </div>
          )}
          {onListing ? <button type="button" data-full-listing="" onClick={() => { setSheet(null); onListing(); }} style={{ ...linkBtn(ACC, DISPLAY), marginTop: 12 }}>{tr('profile:trainer.fullListing', { defaultValue: 'Plans, prices and codes on the full listing' })} →</button> : null}
        </Sheet>
      ) : null}
      {sheet && sheet.kind === 'book' ? (
        <BookSheet t={t} tr={tr} locale={locale} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} slot={sheet.slot} introMin={avail.introMin || 15} first={first} name={name}
          coach={cm && cm.commerceCoach} onClose={() => setSheet(null)} onRefresh={() => setAvailEpoch((n) => n + 1)} />
      ) : null}
      {sheet && sheet.kind === 'station' ? (
        <Sheet t={t} label={sheet.p.st.title || words.work} onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACC }}>{sheet.n} · {sheet.p.st.title || tr('profile:trainer.station', { defaultValue: 'Station' })}</span>
            <CloseX onClose={() => setSheet(null)} color={INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
          </div>
          <div style={{ marginTop: 8, display: 'grid', placeItems: 'center', height: 120, background: t.PAPER2 }}>
            <img src={bsStudioSvg(sheet.p.t, sheet.p.w, sheet.p.h, { ink: t.inkRGB, light: t.isLight, accent: ACC })} alt="" style={{ maxWidth: '70%', maxHeight: 96, width: sheet.p.w * 1.4, height: sheet.p.h * 1.4, objectFit: 'contain' }} />
          </div>
          <h2 style={{ margin: '12px 0 0', fontFamily: DISPLAY, fontWeight: 500, fontSize: 21, lineHeight: 1.15 }}>{sheet.p.st.title}</h2>
          {sheet.p.st.note ? <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.5, color: ink(0.86), whiteSpace: 'pre-wrap' }}>{sheet.p.st.note}</p> : (isSelf ? <p style={{ margin: '6px 0 0', fontSize: 14, color: ink(0.6) }}>{tr('profile:trainer.stationNoNote', { defaultValue: 'Say what you do here in Make it yours → Your space.' })}</p> : null)}
          {!isSelf ? <button type="button" onClick={() => setSheet({ kind: 'work' })} style={{ marginTop: 14, width: '100%', minHeight: 50, padding: '0 14px', border: `1px solid ${ink(0.22)}`, background: 'transparent', color: INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{words.work}<span style={{ color: ACC }}>→</span></button> : null}
        </Sheet>
      ) : null}
      {sheet && sheet.kind === 'replay' ? (
        <ReplaySheet tr={tr} r={sheet.r} i={sheet.i} setI={(i) => setSheet({ ...sheet, i })} ACC={ACC} DISPLAY={DISPLAY} MONO={MONO} first={first} avatar={avatarShown} isSelf={isSelf}
          onClose={() => setSheet(null)} onWork={() => setSheet({ kind: 'work' })} t={t} />
      ) : null}
      {sheet && sheet.kind === 'reviews' ? (
        <Sheet t={t} label={tr('profile:trainer.reviews', { defaultValue: 'Reviews' })} onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 500, fontSize: 22 }}>{tr('profile:trainer.reviews', { defaultValue: 'Reviews' })}<span style={{ color: ACC }}>.</span></h2>
            <CloseX onClose={() => setSheet(null)} color={INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
          </div>
          {reviews && reviews.count > 0 ? <p style={{ margin: '2px 0 8px', fontSize: 13.5, color: ink(0.64) }}>{ratingBit}</p> : null}
          {reviews && reviews.list.length ? reviews.list.slice(0, 40).map((r) => (
            <div key={r.id || r.text} style={{ padding: '12px 0', borderTop: `1px solid ${ink(0.12)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}><span style={{ fontWeight: 600 }}>{r.author || tr('profile:role.member', { defaultValue: 'Member' })}</span><span style={{ fontFamily: MONO, fontSize: 11, color: ink(0.7) }}>★ {Math.round(r.rating || 0)}/10</span></div>
              {r.text ? <p style={{ margin: '4px 0 0', fontSize: 14.5, lineHeight: 1.5 }}>{r.text}</p> : null}
            </div>
          )) : <p style={{ margin: '10px 0 0', fontSize: 14, color: ink(0.64) }}>{tr('marketplace:listing.noReviews', { defaultValue: 'No reviews yet' })}</p>}
        </Sheet>
      ) : null}
      {showLog && W.BSLogActivitySheet ? <W.BSLogActivitySheet c={ACC} INK={INK} BG={t.PAPER_BG} onClose={() => setShowLog(false)} onPosted={() => { setShowLog(false); setPostsNonce((n) => n + 1); }} /> : null}
    </BSPage>
  );
}

// ── Her day ─────────────────────────────────────────────────────────────────────────────────
function DayTab({ t, tr, locale, ACC, ON_ACC, ink, DISPLAY, MONO, avail, providerState, isSelf, first, words, introClosed, onRetry, onTake, onWork, onHours }) {
  const today = new Date();
  const days = Array.from({ length: 7 }, (_, i) => new Date(today.getFullYear(), today.getMonth(), today.getDate() + i));
  const [pick, setPick] = React.useState(isoDay(today));
  const open = avail.kind === 'ready' && !introClosed ? avail.open : [];
  const countOn = (iso) => open.filter((s) => s.iso === iso).length;
  const dayName = (d) => { try { return d.toLocaleDateString(locale, { weekday: 'short' }); } catch (e) { return ''; } };
  const picked = days.find((d) => isoDay(d) === pick) || days[0];
  const title = isoDay(picked) === isoDay(today)
    ? tr('profile:trainer.todayIs', { defaultValue: 'Today, {day}', day: (() => { try { return picked.toLocaleDateString(locale, { weekday: 'long' }); } catch (e) { return ''; } })() })
    : (() => { try { return picked.toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' }); } catch (e) { return pick; } })();
  const fmtTime = (ms) => { try { return new Date(ms).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };

  // The day's rows: open times (to take) and busy time (said only as busy), by time.
  // Local midnight to local midnight: a day with a clock change is 23 or 25 hours long.
  const dayStart = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate()).getTime();
  const dayEnd = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate() + 1).getTime();
  const rows = [];
  if (avail.kind === 'ready') {
    for (const s of open.filter((x) => x.iso === pick)) rows.push({ kind: 'open', at: s.at, slot: s });
    for (const b of avail.busy || []) {
      const s = Date.parse(b.start), e = Date.parse(b.end);
      // Today starts now: what already ended is not part of the day a member can still use.
      if (!(e > dayStart && s < dayEnd) || e <= Date.now()) continue;
      rows.push({ kind: b.kind === 'time_off' ? 'away' : 'busy', at: Math.max(s, dayStart), end: Math.min(e, dayEnd) });
    }
    rows.sort((a, b) => a.at - b.at);
  }
  const now = Date.now();

  let body;
  if (providerState === 'none') {
    body = <Hint ink={ink}>{isSelf ? tr('profile:trainer.dayNoListingSelf', { defaultValue: 'Your open times show here once your listing is set up.' }) : tr('profile:trainer.dayNoListing', { defaultValue: '{name} has no open times on Shape yet. Send a message to ask.', name: first })}</Hint>;
  } else if (avail.kind === 'loading') {
    body = <Hint ink={ink}>{tr('profile:trainer.dayLoading', { defaultValue: 'Reading the week…' })}</Hint>;
  } else if (avail.kind === 'error' || providerState === 'error') {
    body = <div><Hint ink={ink}>{tr('profile:trainer.dayError', { defaultValue: "Couldn't read the open times just now." })}</Hint><button type="button" onClick={onRetry} style={linkBtn(ACC, DISPLAY)}>{tr('profile:trainer.retry', { defaultValue: 'Try again' })}</button></div>;
  } else if (!avail.hasHours) {
    body = isSelf
      ? <div><Hint ink={ink}>{tr('profile:trainer.dayNoHoursSelf', { defaultValue: 'Members see no open times until you set your hours.' })}</Hint><button type="button" onClick={onHours} style={linkBtn(ACC, DISPLAY)}>{tr('profile:trainer.setHours', { defaultValue: 'Set your hours' })} →</button></div>
      : <Hint ink={ink}>{tr('profile:trainer.dayNoHours', { defaultValue: '{name} hasn\'t set open hours yet. Send a message to find a time.', name: first })}</Hint>;
  } else if (!avail.zoneOk) {
    body = <Hint ink={ink}>{tr('profile:trainer.dayNoZone', { defaultValue: '{name}\'s hours have no time zone yet, so no times can be booked.', name: first })}</Hint>;
  } else {
    body = (
      <>
        <h2 style={{ margin: '22px 0 0', fontFamily: DISPLAY, fontWeight: 500, fontSize: 20, color: t.INK }}>{title}<span style={{ color: ACC }}>.</span></h2>
        <p data-day-sub="" style={{ margin: '2px 0 0', fontSize: 13, color: ink(0.64) }}>{avail.sample
          ? tr('profile:trainer.daySample', { defaultValue: 'Sample times: {name} hasn\'t set open hours on Shape yet.', name: first })
          : tr('profile:trainer.daySub', { defaultValue: 'From {name}\'s Shape calendar. Busy time shows only as busy.', name: first })}</p>
        {introClosed ? <div style={{ marginTop: 12 }}><Hint ink={ink}>{tr('profile:trainer.dayFull', { defaultValue: '{name} is full right now. Join the waiting list to be first in line.', name: first })}</Hint><button type="button" onClick={onWork} style={linkBtn(ACC, DISPLAY)}>{words.work} →</button></div> : null}
        <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.length ? rows.map((r, i) => r.kind === 'open' ? (
            // The coach's own page shows their open times as members see them, but not to take.
            <button key={'o' + r.at} type="button" data-open-time="" disabled={!onTake} onClick={onTake ? () => onTake(r.slot) : undefined}
              style={{ minHeight: 56, padding: '8px 12px', border: `1.5px dashed ${ACC}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: onTake ? 'pointer' : 'default' }}>
              <span style={{ width: 62, flex: 'none', fontFamily: MONO, fontSize: 12, color: ink(0.7) }}>{fmtTime(r.at)}</span>
              <span style={{ flex: 1, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{tr('profile:trainer.open', { defaultValue: 'Open' })}</span>
                <span style={{ fontSize: 13, color: ink(0.74) }}>{tr('profile:trainer.introLine', { defaultValue: 'A free {minutes}-minute intro call', minutes: avail.introMin })}</span>
              </span>
              {onTake ? <span style={{ fontSize: 13, fontWeight: 600, color: ACC, whiteSpace: 'nowrap' }}>{tr('profile:trainer.take', { defaultValue: 'Take it →' })}</span> : null}
            </button>
          ) : (
            <div key={'b' + i} data-busy-time="" style={{ minHeight: 48, padding: '8px 12px', background: t.PAPER2, display: 'flex', alignItems: 'center', gap: 12, borderLeft: r.at <= now && (r.end || 0) > now ? `3px solid ${ACC}` : '3px solid transparent' }}>
              <span style={{ width: 62, flex: 'none', fontFamily: MONO, fontSize: 12, color: ink(0.6) }}>{fmtTime(r.at)}</span>
              <span style={{ flex: 1, fontSize: 14.5, color: ink(0.78) }}>{r.kind === 'away' ? tr('profile:trainer.away', { defaultValue: 'Away' }) : tr('profile:trainer.busy', { defaultValue: 'In a session' })}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: ink(0.5) }}>{tr('profile:trainer.until', { defaultValue: 'until {time}', time: fmtTime(r.end) })}</span>
            </div>
          )) : <Hint ink={ink}>{isoDay(picked) === isoDay(today) && !introClosed ? tr('profile:trainer.noneToday', { defaultValue: 'No open times left today. Pick another day above.' }) : tr('profile:trainer.noneThisDay', { defaultValue: 'No open times this day.' })}</Hint>}
        </div>
        {isSelf ? <button type="button" onClick={onHours} style={{ ...linkBtn(ACC, DISPLAY), marginTop: 12 }}>{tr('profile:trainer.editHours', { defaultValue: 'Edit your hours' })} →</button> : null}
      </>
    );
  }
  return (
    <section style={{ paddingTop: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: ink(0.64) }}>{tr('profile:trainer.thisWeek', { defaultValue: 'This week · open times' })}</span>
        <span style={{ fontSize: 12, color: ink(0.6) }}>{tr('profile:trainer.tapDay', { defaultValue: 'Tap a day' })}</span>
      </div>
      <div role="group" aria-label={tr('profile:trainer.days', { defaultValue: 'Days' })} style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 }}>
        {days.map((d) => {
          const iso = isoDay(d), on = iso === pick, n = avail.kind === 'ready' ? countOn(iso) : null;
          return (
            <button key={iso} type="button" aria-pressed={on} onClick={() => setPick(iso)}
              aria-label={`${dayName(d)} ${d.getDate()}${n != null ? ', ' + tr('profile:trainer.openCount', { defaultValue: '{count, plural, =0 {none open} one {# open} other {# open}}', count: n }) : ''}`}
              style={{ minHeight: 58, border: `1px solid ${on ? t.INK : ink(0.2)}`, background: on ? t.INK : 'transparent', color: on ? t.PAPER : t.INK, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 1, cursor: 'pointer', padding: 0 }}>
              <span style={{ fontFamily: MONO, fontSize: 9.5, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{dayName(d)}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17, lineHeight: 1 }}>{d.getDate()}</span>
              <span style={{ fontSize: 9.5, color: on ? t.PAPER : (n ? ACC : ink(0.4)) }}>{n == null ? ' ' : n ? tr('profile:trainer.nOpen', { defaultValue: '{n} open', n }) : tr('profile:trainer.off', { defaultValue: 'off' })}</span>
            </button>
          );
        })}
      </div>
      {body}
      <button type="button" onClick={onWork} style={{ marginTop: 22, width: '100%', minHeight: 52, padding: '0 14px', border: `1px solid ${ink(0.22)}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
        {tr('profile:trainer.waysToWork', { defaultValue: 'Ways to work with {name}', name: first })}<span style={{ color: ACC }}>→</span>
      </button>
    </section>
  );
}
const linkBtn = (ACC, DISPLAY) => ({ marginTop: 6, minHeight: 40, padding: 0, border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' });
function Hint({ ink, children }) {
  return <p style={{ margin: '14px 0 0', fontSize: 14, lineHeight: 1.5, color: ink(0.7) }}>{children}</p>;
}

// ── Book an open time ───────────────────────────────────────────────────────────────────────
function BookSheet({ t, tr, locale, ACC, ON_ACC, ink, DISPLAY, slot, introMin, first, name, coach, onClose, onRefresh }) {
  const [state, setState] = React.useState({ kind: 'ask' });
  const when = (() => { try { return new Date(slot.at).toLocaleString(locale, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
  const book = async () => {
    if (state.kind === 'busy') return;
    if (window.bsRequireAccount && !window.bsRequireAccount('book a session')) return;
    setState({ kind: 'busy' });
    try {
      await window.ShapeBookings.submitConsultationBooking({ coach, role: 'trainer', slot, topic: 'Free intro call', durationMin: introMin });
      setState({ kind: 'done' });
      onRefresh();
    } catch (error) {
      // The coach changed their intro length since these times were laid out (the listing's rule,
      // Codex on #2370): the times are read again and the member picks one.
      if (error && error.code === 'length_changed') { onRefresh(); setState({ kind: 'stale', minutes: Number.isInteger(error.durationMin) ? error.durationMin : introMin }); return; }
      setState({ kind: 'err', message: (error && error.message) || tr('marketplace:listing.bookingErrorBody', { defaultValue: 'Unable to save this consultation booking.' }) });
    }
  };
  return (
    <Sheet t={t} label={tr('profile:trainer.bookTitle', { defaultValue: 'Free intro call' })} onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 500, fontSize: 22 }}>{state.kind === 'done' ? tr('profile:trainer.requested', { defaultValue: 'Requested' }) : tr('profile:trainer.bookTitle', { defaultValue: 'Free intro call' })}<span style={{ color: ACC }}>.</span></h2>
        <CloseX onClose={onClose} color={t.INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      {state.kind === 'done' ? (
        <>
          <p style={{ margin: '4px 0 0', fontSize: 15 }}>{when}</p>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: ink(0.7) }}>{tr('marketplace:listing.bookedRequestBody', { defaultValue: 'You asked {name} for a {minutes}-minute intro. You will get the call link by email once they confirm.', name, minutes: introMin })}</p>
          <button type="button" onClick={onClose} style={{ marginTop: 16, width: '100%', minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.done', { defaultValue: 'Done' })}</button>
        </>
      ) : state.kind === 'stale' ? (
        <>
          <p style={{ margin: '6px 0 0', fontSize: 14, color: ink(0.74) }}>{tr('marketplace:listing.lengthChangedBody', { defaultValue: "{name}'s intro now runs {minutes} minutes. Pick a time again.", name, minutes: state.minutes })}</p>
          <button type="button" onClick={onClose} style={{ marginTop: 16, width: '100%', minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.pickAgain', { defaultValue: 'Pick a time' })}</button>
        </>
      ) : (
        <>
          <p style={{ margin: '4px 0 0', fontSize: 15 }}>{when}</p>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: ink(0.64) }}>{tr('profile:trainer.bookSub', { defaultValue: '{minutes} minutes on video, free. Tell {name} what you are training for.', minutes: introMin, name: first })}</p>
          {state.kind === 'err' ? <p role="alert" style={{ margin: '10px 0 0', fontSize: 13.5, color: t.RUST || '#c0533b' }}>{state.message}</p> : null}
          <button type="button" data-book-intro="" onClick={book} disabled={state.kind === 'busy' || !coach} style={{ marginTop: 16, width: '100%', minHeight: 52, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: state.kind === 'busy' ? 'default' : 'pointer', opacity: state.kind === 'busy' ? 0.6 : 1 }}>
            {state.kind === 'busy' ? tr('profile:trainer.booking', { defaultValue: 'Booking…' }) : tr('profile:trainer.bookCta', { defaultValue: 'Request this time' })}
          </button>
        </>
      )}
    </Sheet>
  );
}

// ── The studio ──────────────────────────────────────────────────────────────────────────────
// The plan is one SVG on the fixed 344 × 528 grid, scaled to the page; its numbers are buttons
// placed by percentage, so they scale with it and keep a 44px target.
export function BSStudioPlan({ t, studio, ACC, ON_ACC, ink, MONO, onStation, door = (k) => k }) {
  const room = bsStudioRoom(studio.kind);
  const [rx, ry, rw, rh, style, radius] = room.room;
  const order = bsStudioDrawOrder(studio.items);
  const stations = studio.items.map((p, i) => ({ p, i })).filter((x) => x.p.st);
  const svgInk = t.inkRGB || '245,240,230';
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${BS_STUDIO_W} / ${BS_STUDIO_H}`, background: t.PAPER2 }}>
      <svg viewBox={`0 0 ${BS_STUDIO_W} ${BS_STUDIO_H}`} width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <rect x={rx} y={ry} width={rw} height={rh} rx={radius} fill="none" stroke={ink(0.26)} strokeWidth="1.5" strokeDasharray={style === 'dashed' ? '5 5' : undefined} />
        {room.doors.map(([x, y, w, h, key, lx, ly], i) => (
          <g key={i}><rect x={x} y={y} width={w} height={h} fill={t.PAPER2} /><text x={lx} y={ly + 9} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)}>{door(key)}</text></g>
        ))}
        {order.map((i) => {
          const p = studio.items[i];
          return (
            <g key={i}>
              <image href={bsStudioSvg(p.t, p.w, p.h, { ink: svgInk, light: t.isLight, accent: p.st ? ACC : null })} x={p.x} y={p.y} width={p.w} height={p.h} />
              {p.tag ? <text x={p.x + 9} y={p.y + 17} fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="600" fill={ink(0.72)}>{p.tag}</text> : null}
              {p.label ? <text x={p.x} y={p.y + p.h + 12} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)}>{p.label}</text> : null}
            </g>
          );
        })}
      </svg>
      {stations.map(({ p }, n) => {
        const [sx, sy] = bsStudioSpot(p);
        return (
          <button key={n} type="button" data-station="" onClick={onStation ? () => onStation(n + 1, p) : undefined} aria-label={`${n + 1}. ${p.st.title}`}
            style={{ position: 'absolute', left: `${(sx / BS_STUDIO_W) * 100}%`, top: `${(sy / BS_STUDIO_H) * 100}%`, width: 44, height: 44, margin: '-22px 0 0 -22px', padding: 0, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: onStation ? 'pointer' : 'default' }}>
            <span style={{ width: 26, height: 26, borderRadius: 99, background: ACC, color: ON_ACC, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 12, fontWeight: 700, boxShadow: `0 0 0 4px ${hexA(ACC, 0.22)}` }}>{n + 1}</span>
          </button>
        );
      })}
    </div>
  );
}

function StudioTab({ t, tr, ACC, ON_ACC, ink, DISPLAY, MONO, studio, gallery, isSelf, first, onStation, onDraw }) {
  const kind = studio ? (STUDIO_KIND_KEYS[studio.kind] || STUDIO_KIND_KEYS.blank) : null;
  const door = (k) => (k === 'entrance' ? tr('profile:trainer.doorEntrance', { defaultValue: 'Entrance' }) : k === 'garage' ? tr('profile:trainer.doorGarage', { defaultValue: 'Garage door' }) : tr('profile:trainer.doorDoor', { defaultValue: 'Door' }));
  const stations = studio ? studio.items.filter((p) => p.st) : [];
  return (
    <section style={{ paddingTop: 16 }}>
      {studio ? (
        <>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACC }}>{tr('profile:trainer.' + kind[0], { defaultValue: kind[1] })}</span>
          {studio.where ? <span style={{ display: 'block', marginTop: 2, fontFamily: DISPLAY, fontWeight: 500, fontSize: 18 }}>{studio.where}<span style={{ color: ACC }}>.</span></span> : null}
          {stations.length ? <p style={{ margin: '2px 0 0', fontSize: 13.5, color: ink(0.7) }}>{tr('profile:trainer.tapNumber', { defaultValue: 'Tap a number to see how {name} coaches there.', name: first })}</p> : null}
          <div style={{ marginTop: 12 }}><BSStudioPlan t={t} studio={studio} ACC={ACC} ON_ACC={ON_ACC} ink={ink} MONO={MONO} onStation={onStation} door={door} /></div>
          {stations.length ? (
            <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
              {stations.map((p, n) => (
                <li key={n}><button type="button" onClick={() => onStation(n + 1, p)} style={{ width: '100%', minHeight: 40, padding: 0, border: 0, borderBottom: `1px solid ${ink(0.11)}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, textAlign: 'left', cursor: 'pointer' }}><span style={{ fontFamily: MONO, color: ACC }}>{n + 1}</span>{p.st.title}</button></li>
              ))}
            </ol>
          ) : null}
        </>
      ) : isSelf ? (
        <div>
          <Hint ink={ink}>{tr('profile:trainer.studioEmptySelf', { defaultValue: 'Draw where you coach: a private studio, a garage, a full gym or a park. Members tap your stations to see how you work.' })}</Hint>
          <button type="button" onClick={onDraw} style={{ marginTop: 12, minHeight: 46, padding: '0 16px', border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.drawSpace', { defaultValue: 'Draw your space' })}</button>
        </div>
      ) : null}
      {gallery.length ? (
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {gallery.slice(0, 6).map((g, i) => <img key={i} src={g.url} alt={g.caption || ''} style={{ width: '100%', height: 96, objectFit: 'cover' }} />)}
        </div>
      ) : null}
    </section>
  );
}

// ── Replays ─────────────────────────────────────────────────────────────────────────────────
function ReplaysTab({ t, tr, ACC, ink, DISPLAY, MONO, replays, isSelf, first, onOpen, onLog }) {
  return (
    <section style={{ paddingTop: 16 }}>
      <p style={{ margin: 0, fontSize: 14, color: ink(0.74) }}>{tr('profile:trainer.replaysSub', { defaultValue: 'Sessions {name} logged and shared. Step through the sets and read the notes.', name: first })}</p>
      {isSelf ? <button type="button" onClick={onLog} style={linkBtn(ACC, DISPLAY)}>＋ {tr('profile:trainer.logSession', { defaultValue: 'Log a session' })}</button> : null}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
        {replays.length ? replays.map((r) => {
          const stats = (Array.isArray(r.stats) ? r.stats : Array.isArray(r.statsRow) ? r.statsRow : []).slice(0, 2).map((s) => (Array.isArray(s) ? `${s[1]}` : '')).filter(Boolean);
          return (
            <button key={r.key} type="button" data-replay="" onClick={() => onOpen(r)} style={{ padding: 0, border: 0, background: 'transparent', color: t.INK, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <span style={{ position: 'relative', display: 'block', width: '100%', height: r.photo ? 190 : 110, overflow: 'hidden', background: r.photo ? '#000' : t.PAPER2 }}>
                {r.photo ? <img src={r.photo} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} /> : (
                  <span style={{ position: 'absolute', left: 14, bottom: 12, display: 'flex', gap: 8, alignItems: 'baseline' }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 30, fontWeight: 600, color: t.INK }}>{r.breakdown.rows.length}</span>
                    <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: ink(0.6) }}>{r.breakdown.label}</span>
                  </span>
                )}
                <span style={{ position: 'absolute', right: 10, top: 10, padding: '2px 8px', background: hexA('#000000', 0.55), color: '#fff', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em' }}>{r.ago}</span>
              </span>
              <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17 }}>{r.title}</span>
                {stats.length ? <span style={{ fontSize: 13, color: ink(0.6) }}>{stats.join(' · ')}</span> : null}
              </span>
            </button>
          );
        }) : (isSelf ? <Hint ink={ink}>{tr('profile:trainer.replaysEmptySelf', { defaultValue: 'Log a session and share it, and it shows here with every set.' })}</Hint> : null)}
      </div>
    </section>
  );
}

function ReplaySheet({ t, tr, r, i, setI, ACC, DISPLAY, MONO, first, avatar, isSelf, onClose, onWork }) {
  const rows = r.breakdown.rows;
  const at = Math.max(0, Math.min(rows.length - 1, i));
  const cur = rows[at] || [];
  const muted = 'rgba(232,235,239,0.6)';
  const host = sheetHost();
  const el = (
    <div role="dialog" aria-label={r.title} style={{ position: 'absolute', inset: 0, zIndex: 230, background: '#0c0d0f', color: '#e8ebef', overflowY: 'auto', fontFamily: t.BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ padding: 'calc(10px + env(safe-area-inset-top)) 8px 0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>{tr('profile:trainer.replay', { defaultValue: 'Replay' })} · {r.typeLabel || ''} · {r.ago}</span>
        <CloseX onClose={onClose} color="#e8ebef" label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      <h2 style={{ margin: '0 18px', fontFamily: DISPLAY, fontWeight: 300, fontSize: 25, lineHeight: 1.1 }}>{r.title}<span style={{ color: ACC }}>.</span></h2>
      {r.photo ? <div style={{ margin: '12px 18px 0', height: 220, overflow: 'hidden', background: '#000' }}><img src={r.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div> : null}
      <div style={{ margin: '16px 18px 0' }}>
        <div style={{ position: 'relative', height: 22 }}>
          <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, background: 'rgba(232,235,239,0.2)' }} />
          <span aria-hidden style={{ position: 'absolute', left: 0, width: rows.length > 1 ? `${(at / (rows.length - 1)) * 100}%` : '100%', top: 10, height: 2, background: ACC }} />
          {rows.map((row, k) => (
            <button key={k} type="button" onClick={() => setI(k)} aria-label={`${row[0]}, ${row[1]}`}
              style={{ position: 'absolute', left: rows.length > 1 ? `${(k / (rows.length - 1)) * 100}%` : '50%', top: -11, width: 44, height: 44, marginLeft: -22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', left: '50%', top: '50%', width: k === at ? 14 : 8, height: k === at ? 14 : 8, transform: 'translate(-50%, -50%)', borderRadius: 99, background: k <= at ? ACC : 'rgba(232,235,239,0.35)' }} />
            </button>
          ))}
        </div>
      </div>
      <div style={{ margin: '14px 18px 0', padding: 14, background: '#181a1e' }}>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: at === rows.length - 1 ? ACC : muted }}>{cur[0]}</span>
        <span style={{ display: 'block', marginTop: 6, fontFamily: DISPLAY, fontWeight: 600, fontSize: 32 }}>{cur[1]}</span>
        {cur[2] ? <span style={{ display: 'block', marginTop: 4, fontFamily: MONO, fontSize: 11, color: muted }}>{cur[2]}</span> : null}
      </div>
      {r.body ? (
        <div style={{ margin: '12px 18px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {avatar ? <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: 99, objectFit: 'cover' }} /> : null}
          <div style={{ flex: 1, padding: '10px 12px', background: '#181a1e', borderRadius: '4px 14px 14px 14px', fontSize: 14.5, lineHeight: 1.45 }}><span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ACC }}>{tr('profile:trainer.theirNote', { defaultValue: "{name}'s note", name: first })}</span>{r.body}</div>
        </div>
      ) : null}
      <div style={{ margin: '12px 18px 0', display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setI(Math.max(0, at - 1))} disabled={at === 0} style={{ flex: 1, minHeight: 46, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer', opacity: at === 0 ? 0.4 : 1 }}>← {tr('profile:trainer.prev', { defaultValue: 'Previous' })}</button>
        <button type="button" onClick={() => setI(Math.min(rows.length - 1, at + 1))} disabled={at === rows.length - 1} style={{ flex: 1, minHeight: 46, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer', opacity: at === rows.length - 1 ? 0.4 : 1 }}>{tr('profile:trainer.next', { defaultValue: 'Next' })} →</button>
      </div>
      <div style={{ margin: '22px 18px calc(28px + env(safe-area-inset-bottom))', paddingTop: 14, borderTop: '1px solid rgba(232,235,239,0.15)' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{r.breakdown.label}</span>
        {rows.map((row, k) => (
          <button key={k} type="button" onClick={() => setI(k)} style={{ width: '100%', display: 'flex', gap: 12, padding: '10px 0', border: 0, borderBottom: '1px solid rgba(232,235,239,0.1)', background: 'transparent', color: k === at ? '#e8ebef' : 'rgba(232,235,239,0.75)', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ flex: 1 }}>{row[0]}</span><span style={{ fontFamily: MONO, fontSize: 12 }}>{row[1]}</span>
          </button>
        ))}
        {!isSelf ? <button type="button" onClick={onWork} style={{ marginTop: 16, width: '100%', minHeight: 50, border: 0, background: ACC, color: onColor(ACC), fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.getNotes', { defaultValue: 'Get notes like these on your sessions' })}</button> : null}
      </div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}
