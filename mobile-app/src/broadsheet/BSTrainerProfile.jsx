import React from 'react';
import { createPortal } from 'react-dom';
import { bsProfileLook, bsProfileStudio, bsProfileCover, bsProfileKitchen, bsProfileAbout, bsProfilePrompts, bsProfileLinkable, bsProfileLinkHref, bsProfileLinkText, bsPromptLabel, BS_PROFILE_LINK_KEYS } from '../services/profileCustom.mjs';
import { STUDIO_WORDS, STUDIO_KIT, bsStudioSvg, bsStudioRoom, bsStudioSpot, bsStudioDrawOrder, bsStudioFrame, BS_STUDIO_W, BS_STUDIO_H } from '../services/studioKit.mjs';
import { bsCoachPrograms, bsWorkoutVideos, bsStudioWork, bsKitchenWork } from '../services/coachWork.mjs';
import { createMobileVideoComponents } from '../services/videoComponents.mjs';
import { bsProjectAvailability, bsIsZone } from '../services/coachAvailability.mjs';
import { bsCoachPronoun, bsCoachFirstName } from '../services/coachPronoun.mjs';
import { bsShortAge } from '../services/shortAge.mjs';
import { bsTrainerDemo, bsTrainerSampleOf } from '../services/trainerDemo.mjs';
import { bsNutritionistDemo, bsNutritionistSampleOf } from '../services/nutritionistDemo.mjs';
import { bsKitchenRecipe, bsKitchenGroceryList, bsOwnRecipeGroceryList, bsOwnRecipeCookable, bsShortHash } from './kitchenRecipes.js';
import { BSCoachHoursPage } from './BSCoachHours.jsx';
import { BSCoachBusinessPage, BSCoachBusinessCard } from './BSCoachBusiness.jsx';
import { BSMakeItYours } from './BSMakeItYours.jsx';
import { bsReceivedGroceryList } from '../services/groceryShare.mjs';
import { bsSaveReceivedGroceryList } from './BSGroceryShare.jsx';

const { ShapeVideoPlayer } = createMobileVideoComponents(React);

// ─── THE COACH PROFILE: TRAINERS AND NUTRITIONISTS ───────────────────────────────────────────
// Owner, 2026-10-27, after seven rounds on the canvas ("Show, don't sell · Quiet and premium ·
// Feels like the Shape app"): one profile, three tabs, and Activity a fourth since 2026-10-31.
// A nutritionist's page is the same page with a kitchen in place of the studio and plate notes in
// place of replays (see the end of this note).
// What clients say closes the page, under the tabs (owner, 2026-10-30: "move reviews to bottom of
// page").
//
//   Header      the coach's wall photo with their round avatar over its edge, name, what they
//               do and where, their bio, the verified line, Message · Work with · Follow.
//   Her day     the coach's week of open times and a day as it really is: open times you can
//               take (a free intro call, booked at that time), and busy time that says only
//               that it is busy. From the same public read the listing books from.
//   The studio  their space as they drew it (Make it yours → Your space); tap a number for
//               what they do there, in their words. Their listing photos under it.
//   Replays     their work, in three parts (owner, 2026-10-29: "There needs to be videos in replays of
//               specific workouts or programs"): the programs they sell, each with the one video its
//               public preview gives free, its weeks, its first week and Buy; the workouts they posted
//               on video; and the sessions they logged, stepped set by set with their note.
//               (coachWork.mjs.) The studio shows which of their programs' moves happen on each
//               piece, from the moves' equipment and names, and the programs they pinned to a station
//               (the same owner note: "The layout of the gym floor needs to include coaches workouts
//               based on those machines").
//   Activity    what they posted that the other tabs don't show (notes, photos, links, their own
//               runs), as the member profile's activity cards; last, after Replays or Plate notes
//               (owner, 2026-10-31: "the coaches activity feed shouldn't be under replays, they should
//               have a separate tab for activity"). A visitor sees it when there is something in it.
//
// The coach paints it: their paper and accent from Shape's own set (profile_custom.look), set in
// Make it yours. The page renders inside a BSProvider of those colours, so every piece of chrome
// on it (the pinned masthead too) is theirs. Prices live in one place, the Work-with sheet, which
// is the shared storefront (BSCoachCoachingBlock with useBSCoachCommerce, the client module's).
//
// Words for the coach follow the pronouns they wrote, or their first name (coachPronoun.mjs).
//
// A nutritionist (person.kind 'NUTRI') reads and books as a nutritionist (their listing, hours and
// intro calls), is painted amber until they pick their colours (Shape's nutritionist gold), and has
// two tabs of their own (owner, 2026-10-27: "lets do something different for nutritionists"):
//   Her kitchen  the kitchen as they drew it (owner, 2026-10-30: "lets show a kitchen layout, like we
//                did for trainers"; the 2026-10-27 plan had none): spots with their words, lit where
//                their recipes' methods use them (bsKitchenWork). It rides in profile_custom.studio
//                with kind 'kitchen', as a trainer's floor does. Then three parts shown one at a
//                time: their own recipes (cooked in Shape's cook mode, or sent to the member's
//                grocery list), the plate they teach and their portion rules, and the staples always
//                in their kitchen (a member taps the ones they want onto their own grocery list).
//                profile_custom.kitchen, set in Make it yours → Your kitchen. Listing photos under it.
//   Plate notes  the meals they logged and shared, a day to a note, stepped through meal by meal with
//                the protein so far and their note on each.
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
  boxing: ['kindBoxing', 'Boxing gym'], outdoor: ['kindOutdoor', 'Outdoors'], kitchen: ['kindKitchen', 'Kitchen'], blank: ['kindBlank', 'Their space'],
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
      <div role="dialog" aria-label={label} style={{ position: 'absolute', left: 0, right: 0, bottom: 0, maxHeight: '88%', overflowY: 'auto', overflowX: 'hidden', borderRadius: '22px 22px 0 0', background: dark ? '#0c0d0f' : t.PAPER, color: dark ? '#e8ebef' : t.INK, fontFamily: t.BODY, WebkitFontSmoothing: 'antialiased', padding: '10px 18px calc(22px + env(safe-area-inset-bottom))', boxShadow: '0 -16px 40px rgba(0,0,0,0.28)' }}>
        <div aria-hidden style={{ width: 40, height: 4, borderRadius: 99, background: dark ? 'rgba(232,235,239,0.25)' : t.RULE, margin: '0 auto 8px' }} />
        {children}
      </div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}
// The × sits inside its row's padding: a negative right margin pushed it past the sheet's edge, so
// every full-screen sheet scrolled sideways by a few points (owner, 2026-10-30: no scroll bars).
function CloseX({ onClose, color, label }) {
  return <button type="button" onClick={onClose} aria-label={label} style={{ width: 44, height: 44, margin: '-6px 0 -6px 0', border: 0, background: 'transparent', color, fontSize: 24, cursor: 'pointer' }}>×</button>;
}

// ── The page, in the coach's colours ─────────────────────────────────────────────────────────
export function BSTrainerProfile(props) {
  const { useBS, BSProvider } = window;
  const outer = useBS();
  const { person, isSelf = false } = props;
  const tr = useShapeTr();
  const role = person.kind === 'NUTRI' ? 'nutritionist' : 'trainer';
  const nutri = role === 'nutritionist';
  // The demo is the coach app's own page with nobody signed in, and only that: a page opened for
  // an account, or with one signed in, is always the real one. A sample is another coach's page
  // with no account behind it.
  const demoOn = isSelf && !person.userId && !signedInUid();
  const sampleOn = !isSelf && !person.userId;
  const lb = !!(outer && outer.uMeasure && outer.uMeasure(1, 'kg').unit === 'lb');
  // Built again when the language changes (useShapeTr re-renders this on it), for the stations' names
  // and the sample's words.
  const lang = (() => { try { return window.ShapeLocale?.get?.() || ''; } catch (e) { return ''; } })();
  const sampleKey = sampleOn ? String(person.providerId || person.who || '') : '';
  const sampleCity = sampleOn && person.city && !/^(remote|online|anywhere)$/i.test(String(person.city).trim()) ? String(person.city) : '';
  const demo = React.useMemo(() => {
    if (!demoOn && !sampleOn) return null;
    // The sample's own words in the reader's language too (owner, 2026-10-30: "Translate all sample
    // text", then "Yes, translate the nutritionist sample too"), with the English as each one's default.
    const say = (k, english, values) => tr(k, { defaultValue: english, ...(values || {}) });
    const word = (k) => tr('profile:studio.word.' + k, { defaultValue: STUDIO_WORDS[k] || k });
    if (nutri) {
      if (demoOn) return { ...bsNutritionistDemo({ say, word }), mode: 'self' };
      return { ...bsNutritionistDemo({ ...bsNutritionistSampleOf({ key: sampleKey, specialty: person.specialty }), where: sampleCity, business: null, say, word }), mode: 'sample' };
    }
    const base = { media: `${import.meta.env.BASE_URL}demo/`, word, lb, say };
    if (demoOn) return { ...bsTrainerDemo(base), mode: 'self' };
    return { ...bsTrainerDemo({ ...base, ...bsTrainerSampleOf({ key: sampleKey, specialty: person.specialty }), where: sampleCity, business: null }), mode: 'sample' };
  }, [nutri, demoOn, sampleOn, sampleKey, sampleCity, person.specialty, lb, lang]);
  // What Make it yours changed on the demo, and only that (a key it changed, or null for a removed
  // wall photo), laid over the sample: the rest stays the sample's, so its station names keep
  // following the language (Codex P2 on #2486).
  const [demoOwn, setDemoOwn] = React.useState(null);
  const saveDemo = (doc, changed) => setDemoOwn((prev) => {
    const next = { ...(prev || {}) };
    for (const k of ['look', 'cover', 'studio', 'kitchen', 'about', 'prompts', 'links']) if (changed && changed[k]) next[k] = doc && doc[k] ? doc[k] : null;
    return next;
  });
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
  const custom = demo
    ? (() => { const c = { ...demo.custom }; if (demo.mode === 'self') for (const [k, v] of Object.entries(demoOwn || {})) { if (v === null) delete c[k]; else c[k] = v; } return c; })()
    : isSelf ? own : (live && live.custom) || null;
  // The coach's own page is in the colours members see (owner, 2026-10-31: "have the profile page
  // reflect whatever the coaches picked that shows public to members"). Until their own doc is read,
  // or when that read fails, those are the public read's, never the default dark.
  const lookDoc = !demo && isSelf && !own ? ((live && live.custom) || null) : custom;
  const look = bsProfileLook(lookDoc && lookDoc.look) || {};
  const page = demo
    ? <TrainerPage {...props} role={role} demo={demo} live={demo.mode === 'self' ? demo.live : null} custom={custom} setOwn={saveDemo} ownState="ready" ownFor={null} />
    : <TrainerPage {...props} role={role} live={live} custom={custom} setOwn={setOwn} ownState={isSelf ? ownState : 'ready'} ownFor={ownFor} onRetryOwn={() => setOwnEpoch((n) => n + 1)} />;
  if (!BSProvider) return page;
  return (
    <BSProvider paperMode={look.paper || 'dark'} accentKey={look.accent || (nutri ? 'amber' : 'teal')} densityKey={outer.densityKey} borderKey={outer.borderKey}
      weightKey={outer.weightKey} textScaleKey={outer.textScaleKey} textureKey={outer.textureKey} textureColor={outer.textureColor}>
      {page}
    </BSProvider>
  );
}

function TrainerPage({ person, role = 'trainer', onBack, onMessage, isSelf = false, meMode = false, onOpenSettings = () => {}, onOpenScore = () => {}, live, custom, setOwn, ownState = 'ready', ownFor = null, onRetryOwn = () => {}, demo = null, onListing = null }) {
  const W = window;
  const t = W.useBS();
  const tr = useShapeTr();
  const nutri = role === 'nutritionist';
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
  const first = bsCoachFirstName(name);
  const pron = bsCoachPronoun(!isPrivate && live ? live.pronouns : '');
  const words = {
    day: pron === 'her' ? tr('profile:trainer.dayHer', { defaultValue: 'Her day' }) : pron === 'him' ? tr('profile:trainer.dayHim', { defaultValue: 'His day' }) : pron === 'them' ? tr('profile:trainer.dayThem', { defaultValue: 'Their day' }) : tr('profile:trainer.dayName', { defaultValue: "{name}'s day", name: first }),
    work: pron === 'her' ? tr('profile:trainer.workHer', { defaultValue: 'Work with her' }) : pron === 'him' ? tr('profile:trainer.workHim', { defaultValue: 'Work with him' }) : pron === 'them' ? tr('profile:trainer.workThem', { defaultValue: 'Work with them' }) : tr('profile:trainer.workName', { defaultValue: 'Work with {name}', name: first }),
    kitchen: pron === 'her' ? tr('profile:nutri.kitchenHer', { defaultValue: 'Her kitchen' }) : pron === 'him' ? tr('profile:nutri.kitchenHim', { defaultValue: 'His kitchen' }) : pron === 'them' ? tr('profile:nutri.kitchenThem', { defaultValue: 'Their kitchen' }) : tr('profile:nutri.kitchenName', { defaultValue: "{name}'s kitchen", name: first }),
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
  const initials = W.bsInitials ? W.bsInitials(name) : String(name).split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();
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
      ? (person.providerId && W.ShapeCoachListing?.publicById ? () => W.ShapeCoachListing.publicById(role, person.providerId) : null)
      : (ownerId && W.ShapeCoachListing?.publicByOwner ? () => W.ShapeCoachListing.publicByOwner(role, ownerId) : null);
    if (!read) { setProviderState('none'); return undefined; }
    let on = true;
    setProviderState('loading');
    read()
      .then((row) => { if (!on) return; setProvider(row); setProviderState(row ? 'ready' : 'none'); })
      .catch(() => { if (on) setProviderState('error'); });
    return () => { on = false; };
  }, [person.userId, person.providerId, isSelf, providerEpoch, demo, role]);
  // The listing is what that lookup found, and only that: a marketplace snapshot the profile was
  // opened with never stands in for it, so a listing taken off the marketplace since offers no
  // times, photos or checkout here (Codex P1 on #2484).
  const listed = providerState === 'ready' && !!provider;
  const providerId = listed ? provider.id : null;
  // The times members asked of this listing before its coach was on Shape: read on the coach's own
  // page, which the table's policy allows once the listing is theirs. Read once the listing read has
  // settled, with its id or, for a listing not on the marketplace yet, none (the backend then reads
  // the asks of the listings the coach owns; Codex on 19b138c).
  const [asks, setAsks] = React.useState(null);
  React.useEffect(() => {
    setAsks(null);
    if (!isSelf || sample || demo || providerState === 'loading' || !W.ShapeListingAsks?.forListing) return undefined;
    let on = true;
    W.ShapeListingAsks.forListing(role, providerId).then((r) => { if (on) setAsks(r && Array.isArray(r.rows) ? r : null); }).catch(() => { if (on) setAsks(null); });
    return () => { on = false; };
  }, [isSelf, providerId, providerState, role, demo]);
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
  // A trainer's studio; a nutritionist's kitchen (a recipe photo only from the coach's own uploads,
  // as the wall photo) and its layout, which rides in the doc's `studio` as a trainer's floor does.
  const studio = nutri ? null : bsProfileStudio(custom && custom.studio);
  const kitchen = nutri ? bsProfileKitchen(custom && custom.kitchen, person.userId || (isSelf ? signedInUid() : null)) : null;
  // A nutritionist's plan is always her kitchen: one stored as `blank` (the editor's old "Start
  // blank") reads with the kitchen's heading and room, not "Their space" (Codex on #2516).
  const kitchenPlan = (() => { const p = nutri ? bsProfileStudio(custom && custom.studio) : null; return p && p.kind === 'blank' ? { ...p, kind: 'kitchen' } : p; })();
  const where = isPrivate ? '' : ((custom && custom.bizCard && custom.bizCard.where) || (studio && studio.where) || (kitchenPlan && kitchenPlan.where) || person.city || '');
  const specialty = (!isPrivate && ((listed && (provider.specialty || provider.specialty_type)) || (sample && person.category))) || '';
  const business = !isPrivate && custom && custom.bizCard && custom.bizCard.name;
  const roleLine = [specialty || (nutri ? tr('profile:nutri.role', { defaultValue: 'Nutritionist' }) : tr('profile:trainer.role', { defaultValue: 'Coach' })), business].filter(Boolean).join(' · ');

  // ── Their week: the public read the listing books from ──
  const [avail, setAvail] = React.useState({ kind: 'loading' });
  const [availEpoch, setAvailEpoch] = React.useState(0);
  React.useEffect(() => {
    const real = !selfDemo && providerId && W.ShapeCoachAvailability?.get;
    // A sample waits for its listing's read, then shows the listing's own hours or the sample week:
    // the sample week only when there are no hours to read (no listing, none found, or a listing
    // that answered with none). A read that failed says so, with Try again, since the listing may
    // well have hours (Codex P2 on #2491).
    const sampleOnly = sample && !real && (providerState === 'none' || providerState === 'ready');
    if (!selfDemo && !real && !sampleOnly) { setAvail({ kind: providerState === 'loading' ? 'loading' : 'none' }); return undefined; }
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
    // Sample times are shown, never taken (`sample: true`): nothing is booked on a sample. Only the
    // times are the sample's: whether the coach is full and takes intros when full stay what their
    // listing answered, or, with no answer, the listing row's (Codex P2 on #2491).
    const sampleWeek = (answered) => ({ ...week(sample.availability), sample: true, atCapacity: answered ? answered.atCapacity : null, introsAtCap: answered ? answered.introsAtCap : false });
    (selfDemo ? Promise.resolve(selfDemo.availability) : real ? W.ShapeCoachAvailability.get(role, providerId, availEpoch > 0 ? { fresh: true } : undefined) : Promise.resolve(null))
      .then((d) => {
        if (!on) return;
        const a = week(d);
        if (sampleOnly) { setAvail(sampleWeek(null)); return; }
        if (sample && a && !a.hasHours) { setAvail(sampleWeek(a)); return; }
        setAvail(a || { kind: 'error' });
      })
      .catch(() => { if (on) setAvail(sampleOnly ? sampleWeek(null) : { kind: 'error' }); });
    return () => { on = false; };
  }, [providerId, providerState, availEpoch, demo, role]);

  // ── The storefront: the client module's shared hook, fed this coach's real listing ──
  const [tab, setTab] = React.useState('day');
  const monthly = listed && Number(provider.price) > 0 ? Number(provider.price) : null;
  const offer = listed && provider.monthly_offer && typeof provider.monthly_offer === 'object' ? provider.monthly_offer : null;
  const commerce = !listed ? null : (person.commerce || {
    coach: { name, provider_role: role, provider_id: provider.id, db_id: provider.id, provider_user_id: provider.owner_id, rate: Number(provider.session_price || provider.price || 0), at_capacity: !!provider.at_capacity, capacity_resume_at: provider.capacity_resume_at || null, id: person.userId },
    packages: monthly ? [{ type: 'Subscription', name: nutri ? tr('profile:nutri.monthly', { defaultValue: 'Monthly nutrition coaching' }) : tr('profile:trainer.monthly', { defaultValue: 'Monthly coaching' }), price: `$${monthly}`, unit: '/ month', perks: (offer && Array.isArray(offer.includes) ? offer.includes : []).slice(0, 3) }] : [],
    atCapacity: avail.kind === 'ready' && avail.atCapacity != null ? avail.atCapacity : undefined,
    introsAtCapacity: avail.kind === 'ready' ? avail.introsAtCap : false,
    // On sample times there is no time to take here, so the intro is booked on the full listing.
    bookIntro: () => { setSheet(null); if (avail.sample && onListing) onListing(); else setTab('day'); },
  });
  const cm = W.useBSCoachCommerce ? W.useBSCoachCommerce({ person: { ...person, commerce, providerId }, isSelf, isNutri: nutri, name, first, city: where }) : null;
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
  // A reader who becomes a member here (Join → checkout → back) reads the reviews again.
  const [revEpoch, setRevEpoch] = React.useState(0);
  React.useEffect(() => {
    const onMember = () => setRevEpoch((n) => n + 1);
    window.addEventListener('shape:membership-active', onMember);
    return () => window.removeEventListener('shape:membership-active', onMember);
  }, []);
  React.useEffect(() => {
    if (!person.userId || !W.ShapeCoachReviews?.forOwner) return undefined;
    let on = true;
    W.ShapeCoachReviews.forOwner(person.userId).then((d) => { if (on && d) setReviews({ list: Array.isArray(d.reviews) ? d.reviews : [], avg: Number(d.avg) || 0, count: Number.isFinite(Number(d.count)) ? Number(d.count) : (d.reviews || []).length, locked: d.locked === true }); }).catch(() => {});
    return () => { on = false; };
  }, [person.userId, revEpoch]);
  // A sample's rating is its listing's, over the sample reviews it shows.
  const reviewsAll = selfDemo ? selfDemo.reviews
    : sample ? { list: sample.reviews.list, avg: Number(person.rating10) > 0 ? Number(person.rating10) : sample.reviews.avg, count: sample.reviews.list.length }
    : liveReviews;
  const reviews = reviewsAll;
  const quotes = reviews && Array.isArray(reviews.list) ? reviews.list.filter((r) => r && String(r.text || '').trim()).slice(0, 6) : [];
  // Members read the reviews; anyone else gets the rating, and the way in (owner, 2026-10-28:
  // "anyone with a shape membership can read them", "Rating only"). The server sends a non-member
  // no review, only `locked` with the average and count. A sample's reviews are the sample's own.
  const revLocked = !!(reviews && reviews.locked && reviews.count > 0 && !reviews.list.length);
  const joinToRead = () => {
    if (W.bsRequireAccount && !W.bsRequireAccount(tr('marketplace:listing.reviewsJoin', { defaultValue: 'read the reviews' }))) return;
    W.bsStartPlatformCheckout?.();
  };

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
  // Their programs (the public preview of each), the workouts they posted on video, and the sessions
  // they logged without one (a session with a video is a workout, and keeps its sets).
  const postCards = nutri || demo ? [] : posts.map((p) => (W.bsProfileCardFromPost ? W.bsProfileCardFromPost(p, 'Trainer') : null)).filter(Boolean);
  const programs = nutri ? [] : demo ? (demo.programs || []) : bsCoachPrograms(salePlans);
  // What the Work-with sheet lists: a coach's published plans, or the sample's own programs, which
  // its page shows everywhere else (the sheet said "Publish your first plan" under every tab).
  const sheetPlans = demo ? programs.filter((p) => p && p.plan).map((p) => ({ ...p.plan, category: 'program',
    meta: p.weeks ? tr('profile:trainer.programWeeks', { defaultValue: '{count, plural, one {# week} other {# weeks}}', count: p.weeks }) : (p.plan.meta || '') })) : salePlans;
  // A real coach's published plans, for a listing with no monthly price; a sample with no price shows none.
  const plansListed = !demo && Array.isArray(salePlans) && salePlans.length > 0;
  const workouts = nutri ? [] : demo ? (demo.workouts || []) : bsWorkoutVideos(postCards);
  const replays = nutri ? [] : demo ? demo.replays : postCards
    .filter((c) => c.breakdown && Array.isArray(c.breakdown.rows) && c.breakdown.rows.length && !c.video);
  const buyProgram = async (pr) => {
    const pl = pr && pr.plan;
    if (!pl || !W.ShapeCoachPlans?.buy) return;
    if (W.bsRequireAccount && !W.bsRequireAccount(tr('profile:trainer.buyAsk', { defaultValue: 'buy a program' }))) return;
    try {
      const url = await W.ShapeCoachPlans.buy({ plan: { id: pl.id, name: pl.name, price: pl.price }, providerRole: pl.providerRole || role, providerId: pl.providerId || providerId });
      if (url) (W.bsOpenCheckout || ((u) => { window.location.href = u; }))(url);
    } catch (e) { W.__bsToast?.(tr('profile:coach.checkoutError', { defaultValue: 'Could not start checkout.' }), 'err'); }
  };
  // Each studio piece's share of those programs, by index (bsStudioWork), and each spot of a
  // nutritionist's kitchen its share of their recipes (bsKitchenWork).
  const studioWork = studio ? bsStudioWork(studio, programs) : [];
  const kitchenWork = kitchenPlan ? bsKitchenWork(kitchenPlan, kitchen ? kitchen.recipes : []) : [];
  // A nutritionist's shared meals (the cards that carry a plate), a day to a plate note.
  const plates = !nutri ? [] : demo ? demo.plates : posts.map((p) => (W.bsProfileCardFromPost ? W.bsProfileCardFromPost(p, 'Nutritionist') : null))
    .filter((c) => c && c.meal && typeof c.meal === 'object');
  const plateDays = bsPlateNoteDays(plates);
  // Their activity (owner, 2026-10-30: "there is also no activity feed on coaches profile"): what
  // they published that the tabs don't already show (notes, photos, links, their own runs and rides)
  // as the member profile's activity cards, newest first. Sessions and workout videos stay in
  // Replays and shared meals in Plate notes, so nothing is listed twice. Their real posts only; a
  // sample's are its own (trainerDemo.mjs, nutritionistDemo.mjs).
  const ownerRole = nutri ? 'Nutritionist' : 'Trainer';
  const shownKeys = new Set([...replays, ...workouts, ...plates].map((c) => c && c.key).filter(Boolean));
  const activity = demo
    ? (demo.activity || []).map((a) => ({ ...a, who: name, role: ownerRole, tier: tierKey, userId: null }))
    : posts.map((p) => (W.bsProfileCardFromPost ? W.bsProfileCardFromPost(p, ownerRole) : null)).filter((c) => c && !shownKeys.has(c.key));
  // The activity card's own reactions and sheets, as the member profile hosts them.
  const cardSheets = W.useBSCardSheets ? W.useBSCardSheets() : null;
  const [actLikes, setActLikes] = React.useState({});
  const [actExpr, setActExpr] = React.useState({});
  const [exprOpen, setExprOpen] = React.useState(null);
  const lpTimerRef = React.useRef(null);
  const lpFiredRef = React.useRef(false);
  const [editingPost, setEditingPost] = React.useState(null);
  const applyReaction = (a, key, _coach, expr) => {
    const was = actLikes[key] != null ? actLikes[key] : a.liked;
    const will = expr != null ? true : !was;
    setActLikes((prev) => ({ ...prev, [key]: will }));
    setActExpr((prev) => { const next = { ...prev }; if (will && expr != null) next[key] = expr; else if (!will) delete next[key]; return next; });
    if (a.postId && will !== was) { const lk = W.ShapeCommunity?.toggleLike?.({ postId: a.postId }); if (lk && lk.catch) lk.catch(() => {}); }
  };

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
  const [page, setPage] = React.useState(null);   // 'edit' | 'hours' | 'business' | 'person'
  const [recipe, setRecipe] = React.useState(null); // a Shape Kitchen recipe a plate note opened
  const [ownRecipe, setOwnRecipe] = React.useState(null); // one of a nutritionist's own recipes
  const [cooking, setCooking] = React.useState(null); // the cookable cook mode runs
  const [editTab, setEditTab] = React.useState('colors');
  const [editSection, setEditSection] = React.useState(null); // the kitchen part Make it yours opens on
  // The kitchen part on screen, kept here rather than in the tab, and the page's scroll when Make it
  // yours opened: the editor replaces the page, so coming back (Back or Save) puts the coach on the
  // same tab, part and spot they left (owner, 2026-10-30: back from Edit your kitchen should return
  // to where they were, not the top of the profile). The trainer's Draw your space is the same path.
  const [kitchenSec, setKitchenSec] = React.useState(null);
  const leftAt = React.useRef(null);
  const pageRef = React.useRef(null);
  const scrollerOf = () => (pageRef.current && pageRef.current.closest ? pageRef.current.closest('.bs-scroll') : null);
  const [showLog, setShowLog] = React.useState(false);
  // A person tapped in an activity card's likers sheet opens their profile over this page, and Back
  // returns to the same spot here, as the member profile does with its followers (the coach page
  // passed a no-op, so the row did nothing).
  const [personFor, setPersonFor] = React.useState(null);
  // Every way into Make it yours goes through here, and waits for the coach's doc (ownState).
  const editReady = ownState === 'ready';
  // The doc was read for one account. With another signed in now, it is read again for that one
  // rather than opened under it (Codex P1 on #2484).
  const openEdit = (tabKey, section = null) => {
    if (!editReady) return;
    if (isSelf && signedInUid() !== ownFor) { onRetryOwn(); return; }
    const sc = scrollerOf();
    leftAt.current = sc ? sc.scrollTop : null;
    setEditTab(tabKey); setEditSection(section); setPage('edit');
  };
  const openPerson = (p) => {
    if (!p || !W.BSPublicProfile) return;
    const sc = scrollerOf();
    leftAt.current = sc ? sc.scrollTop : null;
    setPersonFor(p); setPage('person');
  };
  React.useLayoutEffect(() => {
    if (page !== null || leftAt.current == null) return undefined;
    const top = leftAt.current;
    leftAt.current = null;
    const put = () => { const sc = scrollerOf(); if (sc) sc.scrollTop = top; };
    put();
    // Once more after the page's own mount effects, which may set the scroller's position.
    const id = typeof requestAnimationFrame === 'function' ? requestAnimationFrame(put) : null;
    return () => { if (id != null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(id); };
  }, [page]);

  // About me (owner, 2026-10-31: "an about page for each coach where they can write a bio about
  // themselves and include more information", "a section on coaches profiles for socials to list",
  // and "have the tab say about me"): the coach's story and details, their questions and answers, and their socials. A sample
  // coach has no socials: they would link to someone's real accounts.
  const aboutDoc = isPrivate ? null : bsProfileAbout(custom && custom.about);
  const aboutPrompts = isPrivate ? [] : bsProfilePrompts(custom && custom.prompts);
  const aboutLinks = isPrivate || sample ? null : bsProfileLinkable(custom && custom.links);
  const hasAbout = !!(aboutDoc || aboutPrompts.length || aboutLinks);
  // Tabs a visitor sees only when there is something in them; the coach always sees them all.
  // Activity is a tab of its own, last (owner, 2026-10-31: "the coaches activity feed shouldn't be
  // under replays, they should have a separate tab for activity"); it sat under the tabs.
  const gallery = media.gallery || [];
  const hasStudio = !!(studio || gallery.length);
  const hasKitchen = !!(kitchen || kitchenPlan || gallery.length);
  // About me comes second, after the day, so a member meets the coach before their kitchen or studio.
  const aboutTab = isSelf || hasAbout ? [['about', tr('profile:trainer.tabAbout', { defaultValue: 'About me' })]] : [];
  const tabs = nutri ? [
    ['day', words.day],
    ...aboutTab,
    ...(isSelf || hasKitchen ? [['kitchen', words.kitchen]] : []),
    ...(isSelf || plateDays.length ? [['plates', tr('profile:nutri.tabPlateNotes', { defaultValue: 'Plate notes' })]] : []),
    ...(isSelf || activity.length ? [['activity', tr('profile:tab.activity', { defaultValue: 'Activity' })]] : []),
  ] : [
    ['day', words.day],
    ...aboutTab,
    ...(isSelf || hasStudio ? [['studio', tr('profile:trainer.tabStudio', { defaultValue: 'The studio' })]] : []),
    ...(isSelf || replays.length || workouts.length || programs.length ? [['replays', tr('profile:trainer.tabReplays', { defaultValue: 'Replays' })]] : []),
    ...(isSelf || activity.length ? [['activity', tr('profile:tab.activity', { defaultValue: 'Activity' })]] : []),
  ];
  const tabNow = tabs.some(([k]) => k === tab) ? tab : 'day';

  if (page === 'edit' && editReady) {
    const photos = demo ? demo.photos : [media.cover, ...(gallery.map((g) => g && g.url))].filter((u) => typeof u === 'string' && /^https:\/\//.test(u));
    return <BSMakeItYours role={role} demo={!!demo} ownerUid={ownFor} initial={custom} startTab={editTab} startSection={editSection} who={{ name, first, photo: avatarShown, roleLine }} words={words} photos={photos}
      programs={programs.map((pr) => ({ id: pr.id, name: pr.name }))}
      onClose={() => setPage(null)} onSaved={(doc, changed) => { setOwn && setOwn(doc, changed); setPage(null); }} />;
  }
  if (page === 'hours') return <BSCoachHoursPage role={role} onBack={() => { setPage(null); setAvailEpoch((n) => n + 1); }} />;
  if (page === 'business') return <BSCoachBusinessPage role={role} tab="money" onBack={() => setPage(null)} />;
  if (page === 'person' && personFor && W.BSPublicProfile) return <W.BSPublicProfile person={personFor} onBack={() => { setPersonFor(null); setPage(null); }} onMessage={onMessage} />;

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
      <div ref={pageRef} data-trainer-profile="" style={{ color: INK, fontFamily: BODY, WebkitFontSmoothing: 'antialiased', minHeight: '100%', background: t.PAPER_BG }}>
        {canPickPhoto && photoHook.fileRef ? <input ref={photoHook.fileRef} type="file" accept="image/*" onChange={photoHook.onPick} style={{ display: 'none' }} /> : null}
        {/* The wall: their photo, or their colour until they add one */}
        <div style={{ position: 'relative', height: `calc(${topPad} + ${wallH}px)`, overflow: 'hidden', background: wall ? '#111' : `linear-gradient(135deg, ${hexA(ACC, 0.42)}, ${t.PAPER2} 70%)` }}>
          {wall ? <img src={wall} alt={tr('profile:trainer.wallAlt', { defaultValue: "{name}'s wall photo", name: first })} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: FOCUS_POS[look.focus] || FOCUS_POS.center }} /> : null}
          <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 38%, rgba(0,0,0,0) 72%, rgba(0,0,0,0.22) 100%)' }} />
          {/* The masthead row (logo + Vol·No + the corners), then ← Back on its own row under it, where
              every page keeps it (owner, 2026-10-31); it sat in the logo's place before. */}
          <div style={{ position: 'relative', padding: `${topPad} ${Math.max(4, gutter - 10)}px 0`, display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: W.BS_MAST_ROW_H || 34 }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, paddingLeft: 10, color: '#fff' }}>
              {W.BSLogo ? <W.BSLogo size={16} color="#ffffff" /> : null}
              <span style={{ fontFamily: MONO, fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', opacity: 0.85 }}>Vol. 1 · No. 1</span>
            </span>
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
          {!meMode && W.BSBackRow ? (
            <div style={{ position: 'relative', padding: `0 ${gutter}px` }}>
              <W.BSBackRow onBack={onBack} ink="#ffffff" label={tr('profile:trainer.back', { defaultValue: 'Back' })} buttonStyle={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }} />
            </div>
          ) : null}
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
              {avatarShown ? <img src={avatarShown} alt="" onError={() => setBrokenAvatar(avatarShown)} style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }} /> : <span data-initials="" style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 600, color: INK }}>{initials}</span>}
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
              {sample ? <p data-sample-note="" style={{ margin: '10px 0 0', padding: '8px 10px', borderLeft: `2px solid ${ACC}`, background: t.PAPER2, fontSize: 12.5, lineHeight: 1.45, color: ink(0.74) }}>{nutri
                ? tr('profile:nutri.sampleNote', { defaultValue: '{name} hasn\'t set up a Shape account yet, so the kitchen, plate notes, reviews and times here are samples.', name: first })
                : tr('profile:trainer.sampleNote', { defaultValue: '{name} hasn\'t set up a Shape account yet, so the studio, replays, reviews and times here are samples.', name: first })}</p> : null}
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
          {meMode && isSelf ? <div style={{ marginTop: 16 }}><BSCoachBusinessCard role={role} accent={ACC} onOpen={() => setPage('business')} /></div> : null}
        </div>

        {/* Tabs */}
        {!isPrivate ? (
          <>
            <nav aria-label={tr('profile:trainer.sections', { defaultValue: 'Profile sections' })} className="bs-hide-scroll" style={{ position: 'sticky', top: pinnedTop, zIndex: 4, marginTop: 18, background: t.PAPER, borderBottom: `1px solid ${ink(0.18)}`, display: 'flex', padding: '0 8px', overflowX: 'auto', overscrollBehaviorX: 'contain' }}>
              {tabs.map(([k, label]) => {
                const on = k === tabNow;
                return (
                  // One line each (owner, 2026-10-31: "make this fit on one line" of "Quinn's kitchen"):
                  // a tab takes the width its words need and shares what is left, and a name too long for
                  // the row ends in … rather than wrapping. Four tabs (with About me) read at 13px with
                  // 4px sides, so a nutritionist's "Quinn's day / About me / Quinn's kitchen / Plate notes"
                  // fits a phone's row whole (at 15px with 6px sides it needs 358px of 334). Five (About me
                  // and Activity, owner, 2026-10-31) can't fit at any size worth reading, so a tab never
                  // shrinks below its words: the row scrolls sideways, with no bar, and the picked tab
                  // comes into view.
                  <button key={k} type="button" aria-pressed={on} onClick={(e) => { setTab(k); try { e.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) {} }} title={label} data-profile-tab={k}
                    style={{ flex: '1 0 auto', minHeight: 48, padding: tabs.length > 3 ? '0 4px' : '0 6px', border: 0, borderBottom: `2px solid ${on ? ACC : 'transparent'}`, marginBottom: -1, background: 'transparent', color: on ? INK : ink(0.55), fontFamily: DISPLAY, fontWeight: on ? 600 : 400, fontSize: tabs.length > 3 ? 13 : 15, whiteSpace: 'nowrap', cursor: 'pointer' }}>{label}</button>
                );
              })}
            </nav>
            {/* Activity draws its cards edge to edge, as the member profile's do, so it stands in
                for the padded body rather than inside it. */}
            {tabNow === 'activity' ? (
              <ActivityFeed t={t} tr={tr} ACC={ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} gutter={gutter} cards={activity} isSelf={isSelf} first={first}
                onLog={() => { if (W.bsRequireAccount && !W.bsRequireAccount('log activity')) return; setShowLog(true); }}
                ctx={cardSheets && W.BSActivityCard ? {
                  t, cardInk: INK, muted: ink(0.55), hair: ink(0.1), card: t.isLight ? t.PAPER2 : ink(0.05),
                  actLikes, actDetailsOpen: {}, actCoSign: {}, actExpr, exprOpenKey: exprOpen, setExprOpenKey: setExprOpen, lpTimerRef, lpFiredRef,
                  tierByUser: person.userId ? { [person.userId]: tierKey } : {}, avatarByUser: {}, feedAvatars: {},
                  myRole: (W.ShapeAuth?.getCachedState?.()?.profile?.role) || 'client', coachClientIds: new Set(), myFollowingSet: null,
                  setOpenProfile: openPerson, feedApplyReaction: applyReaction,
                  // The coach edits a post of their own from its card, in the same composer.
                  onEdit: isSelf && !demo ? (a) => { if (a.postId && BS_UUID.test(String(a.postId))) setEditingPost({ postId: a.postId, title: a.title || '', body: a.body || '', photo: a.photo || null, video: a.video || null, link: a.link || null, kind: a.editKind || null, privacy: a.privacy || 'public' }); } : undefined,
                  ...cardSheets.ctx,
                } : null} />
            ) : (
            <div style={{ padding: `0 ${gutter}px 30px` }}>
              {tabNow === 'day' ? (
                <DayTab t={t} tr={tr} locale={locale} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} avail={avail} providerState={avail.sample ? 'ready' : providerState} isSelf={isSelf} first={first} words={words} nutri={nutri}
                  introClosed={introClosed} onRetry={() => (providerState === 'error' ? setProviderEpoch : setAvailEpoch)((n) => n + 1)}
                  // A sample time is asked for, kept against the listing for its coach (the owner,
                  // 2026-10-29: "Request, saved for her"); a listing with no id has nothing to keep it on.
                  onTake={isSelf ? null : avail.sample ? (providerId ? (slot) => setSheet({ kind: 'ask', slot }) : null) : (slot) => setSheet({ kind: 'book', slot })}
                  asks={asks} asksLive={!!providerId} onWork={() => setSheet({ kind: 'work' })} onHours={() => setPage('hours')} />
              ) : tabNow === 'studio' ? (
                <StudioTab t={t} tr={tr} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} studio={studio} gallery={gallery} isSelf={isSelf} first={first}
                  work={studioWork} onPiece={(i) => setSheet({ kind: 'piece', i })} onDraw={() => openEdit('space')} />
              ) : tabNow === 'kitchen' ? (
                <KitchenTab t={t} tr={tr} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} kitchen={kitchen} plan={kitchenPlan} work={kitchenWork} gallery={gallery} isSelf={isSelf} first={first}
                  ownerKey={person.userId || person.providerId || null} stapleKeys={(demo && demo.stapleKeys) || null} onRecipe={(r) => setOwnRecipe(r)} onFill={(section) => openEdit('kitchen', section)}
                  onSpot={(i) => setSheet({ kind: 'spot', i })} sec={kitchenSec} setSec={setKitchenSec} />
              ) : tabNow === 'about' ? (
                <AboutTab t={t} tr={tr} ACC={ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} about={aboutDoc} prompts={aboutPrompts} links={aboutLinks} isSelf={isSelf} first={first}
                  onEdit={() => openEdit('about')} />
              ) : tabNow === 'plates' ? (
                <PlateNotesTab t={t} tr={tr} locale={locale} ACC={ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} days={plateDays} isSelf={isSelf} first={first} onOpen={(day) => setSheet({ kind: 'plateDay', day, i: 0 })} />
              ) : (
                <ReplaysTab t={t} tr={tr} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} programs={programs} workouts={workouts} replays={replays} isSelf={isSelf} first={first}
                  onProgram={(pr) => setSheet({ kind: 'program', pr })} onOpen={(r) => setSheet({ kind: 'replay', r, i: 0 })}
                  onLog={(kind) => { if (W.bsRequireAccount && !W.bsRequireAccount('log activity')) return; setShowLog(kind || true); }} />
              )}
            </div>
            )}
          </>
        ) : null}

        {/* What clients say: the reviews on the page itself, shown on a private profile too: they are
            the readers', not the coach's to hide. The newest few, each a card; All reviews opens the
            full list. A reader who isn't a member gets the rating and Join to read them instead.
            At the foot of the page, after the tabs (owner, 2026-10-30: "move reviews to bottom of
            page"): the coach's day, space and work come first, and what clients say closes it. */}
        {revLocked ? (
          <section data-reviews-strip="" data-reviews-locked="" aria-label={tr('profile:trainer.reviews', { defaultValue: 'Reviews' })} style={{ margin: `${isPrivate ? 22 : 6}px ${gutter}px 18px` }}>
            <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: ink(0.64) }}>{tr('profile:trainer.clientsSay', { defaultValue: 'What clients say' })}</span>
            <div style={{ marginTop: 8, padding: '12px 14px', background: t.PAPER2, borderTop: `2px solid ${ACC}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontFamily: MONO, fontSize: 11, color: ACC }}>★ {ratingBit}</span>
              <span style={{ fontSize: 15, lineHeight: 1.45, color: INK }}>{tr('marketplace:listing.reviewsMembers', { defaultValue: 'Members read the reviews.' })}</span>
              <button type="button" data-reviews-join="" onClick={joinToRead} style={{ alignSelf: 'flex-start', minHeight: 40, padding: 0, border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{tr('marketplace:listing.reviewsJoinCta', { defaultValue: 'Join to read them' })} →</button>
            </div>
          </section>
        ) : quotes.length ? (
          <section data-reviews-strip="" aria-label={tr('profile:trainer.reviews', { defaultValue: 'Reviews' })} style={{ margin: `${isPrivate ? 22 : 6}px 0 18px` }}>
            <div style={{ padding: `0 ${gutter}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: ink(0.64) }}>{tr('profile:trainer.clientsSay', { defaultValue: 'What clients say' })}</span>
              <button type="button" data-all-reviews="" onClick={() => setSheet({ kind: 'reviews' })} style={{ minHeight: 36, padding: 0, border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.allReviews', { defaultValue: 'All reviews' })} →</button>
            </div>
            <div className="bs-scroll" style={{ marginTop: 8, display: 'flex', gap: 10, overflowX: 'auto', scrollSnapType: 'x mandatory', scrollPaddingLeft: gutter, padding: `0 ${gutter}px 4px` }}>
              {quotes.map((r) => (
                <figure key={r.id || r.text} data-review-card="" style={{ margin: 0, flex: quotes.length > 1 ? '0 0 80%' : '1 1 auto', scrollSnapAlign: 'start', boxSizing: 'border-box', padding: '12px 14px', background: t.PAPER2, borderTop: `2px solid ${ACC}`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontFamily: MONO, fontSize: 11, color: ACC }}>★ {Math.round(Number(r.rating) || 0)}/10</span>
                  <blockquote style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: INK, display: '-webkit-box', WebkitLineClamp: 4, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{r.text}</blockquote>
                  <figcaption style={{ fontSize: 12.5, color: ink(0.64) }}>{r.author || tr('profile:role.member', { defaultValue: 'Member' })}</figcaption>
                </figure>
              ))}
            </div>
          </section>
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
          {cm && sells && W.BSCoachCoachingBlock ? <W.BSCoachCoachingBlock cm={cm} isSelf={isSelf} isNutri={nutri} first={first} ownZero salePlans={sheetPlans} c={ACC} /> : (
            <div style={{ marginTop: 14 }}>
              {plansListed ? null : <p style={{ margin: 0, fontSize: 14, lineHeight: 1.5, color: ink(0.74) }}>{isSelf
                ? tr('profile:trainer.noPricesSelf', { defaultValue: 'Members see your prices here once your listing has a monthly price.' })
                : tr('profile:trainer.noPrices', { defaultValue: '{name} hasn\'t listed prices on Shape yet. Book a free intro or send a message to ask.', name: first })}</p>}
              {!isSelf && providerId && !avail.sample ? <button type="button" onClick={() => { setSheet(null); setTab('day'); }} style={{ marginTop: 12, width: '100%', minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.pickIntro', { defaultValue: 'Pick an intro time' })}</button> : null}
              {!isSelf && hasMessage ? <button type="button" onClick={() => { setSheet(null); onMessage(person); }} style={{ marginTop: 8, width: '100%', minHeight: 50, border: `1px solid ${ink(0.22)}`, background: 'transparent', color: INK, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.message', { defaultValue: 'Message {name}', name: first })}</button> : null}
              {/* No monthly price, but plans to sell: the plans and the capacity states, without the monthly offer (Codex P2 on #2545). */}
              {plansListed && cm && W.BSCoachCoachingBlock ? <W.BSCoachCoachingBlock cm={cm} isSelf={isSelf} isNutri={nutri} first={first} ownZero salePlans={salePlans} c={ACC} noMonthly /> : null}
            </div>
          )}
          {onListing ? <button type="button" data-full-listing="" onClick={() => { setSheet(null); onListing(); }} style={{ ...linkBtn(ACC, DISPLAY), marginTop: 12 }}>{tr('profile:trainer.fullListing', { defaultValue: 'Plans, prices and codes on the full listing' })} →</button> : null}
        </Sheet>
      ) : null}
      {sheet && sheet.kind === 'book' ? (
        <BookSheet t={t} tr={tr} locale={locale} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} slot={sheet.slot} introMin={avail.introMin || 15} first={first} name={name} role={role}
          coach={cm && cm.commerceCoach} onClose={() => setSheet(null)} onRefresh={() => setAvailEpoch((n) => n + 1)} />
      ) : null}
      {sheet && sheet.kind === 'ask' ? (
        <AskSheet t={t} tr={tr} locale={locale} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} slot={sheet.slot} introMin={avail.introMin || 15} first={first} role={role} providerId={providerId}
          onClose={() => setSheet(null)} />
      ) : null}
      {sheet && sheet.kind === 'piece' && studio && studio.items[sheet.i] ? (
        <PieceSheet t={t} tr={tr} ACC={ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} INK={INK} studio={studio} i={sheet.i} work={studioWork[sheet.i]} programs={programs}
          isSelf={isSelf} first={first} words={words} onClose={() => setSheet(null)} onWork={() => setSheet({ kind: 'work' })} onProgram={(pr) => setSheet({ kind: 'program', pr })} />
      ) : null}
      {sheet && sheet.kind === 'spot' && kitchenPlan && kitchenPlan.items[sheet.i] ? (
        <SpotSheet t={t} tr={tr} ACC={ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} INK={INK} plan={kitchenPlan} i={sheet.i} work={kitchenWork[sheet.i]} recipes={kitchen ? kitchen.recipes : []}
          isSelf={isSelf} first={first} words={words} onClose={() => setSheet(null)} onWork={() => setSheet({ kind: 'work' })}
          onRecipe={(r) => { setSheet(null); setOwnRecipe(r); }} />
      ) : null}
      {sheet && sheet.kind === 'program' ? (
        <ProgramSheet t={t} tr={tr} pr={sheet.pr} ACC={ACC} DISPLAY={DISPLAY} MONO={MONO} first={first} isSelf={isSelf} studio={studio} work={studioWork}
          onClose={() => setSheet(null)} onBuy={() => buyProgram(sheet.pr)} onWork={() => setSheet({ kind: 'work' })} />
      ) : null}
      {sheet && sheet.kind === 'replay' ? (
        <ReplaySheet tr={tr} r={sheet.r} i={sheet.i} setI={(i) => setSheet({ ...sheet, i })} ACC={ACC} DISPLAY={DISPLAY} MONO={MONO} first={first} avatar={avatarShown} isSelf={isSelf}
          onClose={() => setSheet(null)} onWork={() => setSheet({ kind: 'work' })} t={t} />
      ) : null}
      {sheet && sheet.kind === 'plateDay' ? (
        <PlateNotesSheet t={t} tr={tr} locale={locale} day={sheet.day} i={sheet.i} setI={(i) => setSheet({ ...sheet, i })} ACC={ACC} DISPLAY={DISPLAY} MONO={MONO} first={first} avatar={avatarShown} isSelf={isSelf}
          onClose={() => setSheet(null)} onWork={() => setSheet({ kind: 'work' })} onRecipe={(r) => { setSheet(null); setRecipe(r); }} />
      ) : null}
      {sheet && sheet.kind === 'reviews' ? (
        <Sheet t={t} label={tr('profile:trainer.reviews', { defaultValue: 'Reviews' })} onClose={() => setSheet(null)}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 500, fontSize: 22 }}>{tr('profile:trainer.reviews', { defaultValue: 'Reviews' })}<span style={{ color: ACC }}>.</span></h2>
            <CloseX onClose={() => setSheet(null)} color={INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
          </div>
          {reviews && reviews.count > 0 ? <p style={{ margin: '2px 0 8px', fontSize: 13.5, color: ink(0.64) }}>{ratingBit}</p> : null}
          {revLocked ? (
            <div data-reviews-locked="" style={{ padding: '12px 0', borderTop: `1px solid ${ink(0.12)}` }}>
              <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.5 }}>{tr('marketplace:listing.reviewsMembers', { defaultValue: 'Members read the reviews.' })}</p>
              <button type="button" data-reviews-join="" onClick={joinToRead} style={{ marginTop: 4, minHeight: 40, padding: 0, border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>{tr('marketplace:listing.reviewsJoinCta', { defaultValue: 'Join to read them' })} →</button>
            </div>
          ) : reviews && reviews.list.length ? reviews.list.slice(0, 40).map((r) => (
            <div key={r.id || r.text} style={{ padding: '12px 0', borderTop: `1px solid ${ink(0.12)}` }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 13.5 }}><span style={{ fontWeight: 600 }}>{r.author || tr('profile:role.member', { defaultValue: 'Member' })}</span><span style={{ fontFamily: MONO, fontSize: 11, color: ink(0.7) }}>★ {Math.round(r.rating || 0)}/10</span></div>
              {r.text ? <p style={{ margin: '4px 0 0', fontSize: 14.5, lineHeight: 1.5 }}>{r.text}</p> : null}
            </div>
          )) : <p style={{ margin: '10px 0 0', fontSize: 14, color: ink(0.64) }}>{tr('marketplace:listing.noReviews', { defaultValue: 'No reviews yet' })}</p>}
        </Sheet>
      ) : null}
      {editingPost && W.BSLogActivitySheet ? <W.BSLogActivitySheet c={ACC} INK={INK} BG={t.PAPER_BG} editPost={editingPost} onClose={() => setEditingPost(null)} onPosted={() => { setEditingPost(null); setPostsNonce((n) => n + 1); }} /> : null}
      {cardSheets ? cardSheets.renderSheets({ applyReaction, setOpenProfile: openPerson, actLikes, actExpr }) : null}
      {showLog && W.BSLogActivitySheet ? <W.BSLogActivitySheet c={ACC} INK={INK} BG={t.PAPER_BG} startKind={typeof showLog === 'string' ? showLog : undefined} onClose={() => setShowLog(false)} onPosted={() => { setShowLog(false); setPostsNonce((n) => n + 1); }} /> : null}
      {recipe ? <RecipeOverlay t={t} tr={tr} recipe={recipe} onClose={() => setRecipe(null)} /> : null}
      {ownRecipe ? <OwnRecipePage t={t} tr={tr} ACC={ACC} ON_ACC={ON_ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} recipe={ownRecipe} first={first} avatar={avatarShown} isSelf={isSelf}
        ownerKey={person.userId || person.providerId || null} onClose={() => setOwnRecipe(null)} onCook={(r) => setCooking(bsOwnRecipeCookable(r, person.userId || person.providerId || null))} /> : null}
      {cooking ? <CookOverlay t={t} cookable={cooking} onClose={() => setCooking(null)} /> : null}
    </BSPage>
  );
}

// A Shape Kitchen recipe over the page: the Kitchen's own recipe page (the client module's). Back
// closes it; its grocery button puts the recipe's own list on the member's lists, the list Eat makes
// from the same recipe.
function RecipeOverlay({ t, tr, recipe, onClose }) {
  const [added, setAdded] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const Page = window.BSShapeKitchenRecipe;
  if (!Page) return null;
  const addGrocery = async () => {
    if (added || busy) return;
    if (window.bsRequireAccount && !window.bsRequireAccount(tr('profile:nutri.staplesAsk', { defaultValue: 'add to your grocery list' }))) return;
    const list = bsKitchenGroceryList(recipe);
    if (!list) return;
    setBusy(true);
    try {
      await bsSaveReceivedGroceryList(list);
      setAdded(true);
      window.__bsToast?.(tr('nutrition:eat.toastItemAdded', { defaultValue: 'Added to grocery list' }), 'ok');
    } catch (e) {
      window.__bsToast?.(tr('nutrition:grocery.share.saveFail', { defaultValue: 'Could not save the list. Try again.' }), 'err');
    } finally { setBusy(false); }
  };
  const host = sheetHost();
  const el = (
    <div data-recipe-overlay="" style={{ position: 'absolute', inset: 0, zIndex: 230, background: t.PAPER, overflowY: 'auto', overflowX: 'hidden' }}>
      <Page recipe={recipe} onBack={onClose} onAddGrocery={addGrocery} groceryAdded={added} />
    </div>
  );
  return host ? createPortal(el, host) : el;
}

// ── Her day ─────────────────────────────────────────────────────────────────────────────────
function DayTab({ t, tr, locale, ACC, ON_ACC, ink, DISPLAY, MONO, avail, providerState, isSelf, first, words, nutri = false, introClosed, onRetry, onTake, asks = null, asksLive = false, onWork, onHours }) {
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
              {onTake ? <span style={{ fontSize: 13, fontWeight: 600, color: ACC, whiteSpace: 'nowrap' }}>{avail.sample ? tr('profile:trainer.ask', { defaultValue: 'Ask for it →' }) : tr('profile:trainer.take', { defaultValue: 'Take it →' })}</span> : null}
            </button>
          ) : (
            <div key={'b' + i} data-busy-time="" style={{ minHeight: 48, padding: '8px 12px', background: t.PAPER2, display: 'flex', alignItems: 'center', gap: 12, borderLeft: r.at <= now && (r.end || 0) > now ? `3px solid ${ACC}` : '3px solid transparent' }}>
              <span style={{ width: 62, flex: 'none', fontFamily: MONO, fontSize: 12, color: ink(0.6) }}>{fmtTime(r.at)}</span>
              <span style={{ flex: 1, fontSize: 14.5, color: ink(0.78) }}>{r.kind === 'away' ? tr('profile:trainer.away', { defaultValue: 'Away' }) : nutri ? tr('profile:nutri.busy', { defaultValue: 'With a client' }) : tr('profile:trainer.busy', { defaultValue: 'In a session' })}</span>
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
      {isSelf && asks && asks.rows.length ? <AsksList t={t} tr={tr} locale={locale} ACC={ACC} ink={ink} DISPLAY={DISPLAY} MONO={MONO} asks={asks.rows} total={asks.total} live={asksLive} onHours={avail.kind === 'ready' && !avail.hasHours ? onHours : null} /> : null}
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

// ── Times asked before the coach was on Shape ───────────────────────────────────────────────
// On the coach's own page: what members asked of their listing while it was a sample, by time. They
// were told the coach is on Shape when the listing became theirs (listing-requests.ts tellAskers).
function AsksList({ t, tr, locale, ACC, ink, DISPLAY, MONO, asks, total, live, onHours }) {
  const now = Date.now();
  const count = Math.max(total || 0, asks.length);
  const when = (ms) => { try { return new Date(ms).toLocaleString(locale, { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  return (
    <div data-asks="" style={{ marginBottom: 18, padding: '12px 14px', border: `1px solid ${ink(0.18)}`, borderLeft: `3px solid ${ACC}` }}>
      <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: ink(0.64) }}>{tr('profile:trainer.asksTitle', { defaultValue: 'Asked for before you joined' })}</span>
      {/* The members who asked are told when the listing goes live on the marketplace (the trigger
          on listing_ready), so until then the line says they will be (Codex on af3756e). */}
      <p data-asks-live={live ? 'yes' : 'no'} style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ink(0.74) }}>{live
        ? tr('profile:trainer.asksSub', { defaultValue: '{count, plural, one {# time was} other {# times were}} asked of your listing while you weren\'t on Shape. Each member who asked has been told you\'re here now.', count })
        : tr('profile:trainer.asksSubPending', { defaultValue: '{count, plural, one {# time was} other {# times were}} asked of your listing while you weren\'t on Shape. Each member who asked is told you\'re here once your listing is live.', count })}</p>
      <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column' }}>
        {asks.map((a) => (
          <div key={a.id} data-ask="" style={{ padding: '8px 0', borderTop: `1px solid ${ink(0.1)}`, opacity: a.at < now ? 0.55 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
              <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, color: t.INK }}>{a.name || tr('profile:trainer.askMember', { defaultValue: 'A member' })}</span>
              <span style={{ fontFamily: MONO, fontSize: 11.5, color: ink(0.7), whiteSpace: 'nowrap' }}>{when(a.at)}{a.at < now ? ` · ${tr('profile:trainer.askPassed', { defaultValue: 'passed' })}` : ''}</span>
            </div>
            {a.note ? <p style={{ margin: '3px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ink(0.78), whiteSpace: 'pre-wrap' }}>{a.note}</p> : null}
          </div>
        ))}
      </div>
      {onHours ? <button type="button" onClick={onHours} style={linkBtn(ACC, DISPLAY)}>{tr('profile:trainer.asksSetHours', { defaultValue: 'Set your hours so they can book' })} →</button> : null}
    </div>
  );
}

// ── Ask for a sample time ───────────────────────────────────────────────────────────────────
// The coach isn't on Shape yet: the time is asked for, kept against their listing, and Shape is told.
// Nothing is booked. The member hears when the coach is on Shape.
const ASK_ERRORS = {
  claimed: ['profile:trainer.askClaimed', '{name} is on Shape now. Book a time on their listing.'],
  too_many: ['profile:trainer.askTooMany', "You've asked {name} for 3 times already. You'll hear when they join."],
  daily_cap: ['profile:trainer.askDailyCap', "You've asked for a lot of times today. Try again tomorrow."],
  time_past: ['profile:trainer.askPast', 'That time has passed. Pick a later one.'],
};
function AskSheet({ t, tr, locale, ACC, ON_ACC, ink, DISPLAY, slot, introMin, first, role, providerId, onClose }) {
  const [state, setState] = React.useState({ kind: 'ask' });
  const [note, setNote] = React.useState('');
  const when = (() => { try { return new Date(slot.at).toLocaleString(locale, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
  const ask = async () => {
    if (state.kind === 'busy') return;
    if (window.bsRequireAccount && !window.bsRequireAccount('ask for a time')) return;
    setState({ kind: 'busy' });
    try {
      await window.ShapeListingAsks.ask({ role, providerId, at: slot.at, durationMin: introMin, note: note.trim() });
      setState({ kind: 'done' });
    } catch (error) {
      const known = ASK_ERRORS[error && error.code];
      setState({ kind: 'err', message: known ? tr(known[0], { defaultValue: known[1], name: first }) : tr('profile:trainer.askFailed', { defaultValue: "Couldn't send your ask. Try again." }) });
    }
  };
  return (
    <Sheet t={t} label={tr('profile:trainer.askTitle', { defaultValue: 'Ask for this time' })} onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h2 style={{ margin: 0, fontFamily: DISPLAY, fontWeight: 500, fontSize: 22 }}>{state.kind === 'done' ? tr('profile:trainer.asked', { defaultValue: 'Asked' }) : tr('profile:trainer.askTitle', { defaultValue: 'Ask for this time' })}<span style={{ color: ACC }}>.</span></h2>
        <CloseX onClose={onClose} color={t.INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 15 }}>{when}</p>
      {state.kind === 'done' ? (
        <>
          <p data-ask-done="" style={{ margin: '6px 0 0', fontSize: 14, lineHeight: 1.5, color: ink(0.74) }}>{tr('profile:trainer.askedBody', { defaultValue: "{name} isn't on Shape yet. Shape has kept your ask, and you'll hear when {name} joins.", name: first })}</p>
          <button type="button" onClick={onClose} style={{ marginTop: 16, width: '100%', minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.done', { defaultValue: 'Done' })}</button>
        </>
      ) : (
        <>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, lineHeight: 1.5, color: ink(0.64) }}>{tr('profile:trainer.askSub', { defaultValue: "{name} isn't on Shape yet, so this time isn't booked. Ask for it and Shape keeps it for {name}: you'll hear when they join. A free {minutes}-minute intro.", name: first, minutes: introMin })}</p>
          <textarea data-ask-note="" value={note} maxLength={500} rows={3} onChange={(e) => setNote(e.target.value)} aria-label={tr('profile:trainer.askNotePh', { defaultValue: 'Anything {name} should know (optional)', name: first })}
            placeholder={tr('profile:trainer.askNotePh', { defaultValue: 'Anything {name} should know (optional)', name: first })}
            style={{ marginTop: 12, width: '100%', boxSizing: 'border-box', padding: 10, border: `1px solid ${ink(0.22)}`, background: 'transparent', color: t.INK, fontFamily: 'inherit', fontSize: 14.5, lineHeight: 1.4, resize: 'vertical' }} />
          {state.kind === 'err' ? <p role="alert" style={{ margin: '10px 0 0', fontSize: 13.5, color: t.RUST || '#c0533b' }}>{state.message}</p> : null}
          <button type="button" data-ask-time="" onClick={ask} disabled={state.kind === 'busy'} style={{ marginTop: 14, width: '100%', minHeight: 52, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: state.kind === 'busy' ? 'default' : 'pointer', opacity: state.kind === 'busy' ? 0.6 : 1 }}>
            {state.kind === 'busy' ? tr('profile:trainer.asking', { defaultValue: 'Asking…' }) : tr('profile:trainer.askCta', { defaultValue: 'Ask for this time' })}
          </button>
        </>
      )}
    </Sheet>
  );
}

// ── Book an open time ───────────────────────────────────────────────────────────────────────
function BookSheet({ t, tr, locale, ACC, ON_ACC, ink, DISPLAY, slot, introMin, first, name, role = 'trainer', coach, onClose, onRefresh }) {
  const [state, setState] = React.useState({ kind: 'ask' });
  const when = (() => { try { return new Date(slot.at).toLocaleString(locale, { weekday: 'long', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } })();
  const book = async () => {
    if (state.kind === 'busy') return;
    if (window.bsRequireAccount && !window.bsRequireAccount('book a session')) return;
    setState({ kind: 'busy' });
    try {
      await window.ShapeBookings.submitConsultationBooking({ coach, role, slot, topic: 'Free intro call', durationMin: introMin });
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
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: ink(0.64) }}>{role === 'nutritionist'
            ? tr('profile:nutri.bookSub', { defaultValue: '{minutes} minutes on video, free. Tell {name} what you want from your food.', minutes: introMin, name: first })
            : tr('profile:trainer.bookSub', { defaultValue: '{minutes} minutes on video, free. Tell {name} what you are training for.', minutes: introMin, name: first })}</p>
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
// A piece's name: the station's title, the coach's label, or the kit's name in the reader's language.
const kitName = (type, tr) => tr('profile:studio.kit.' + type, { defaultValue: (STUDIO_KIT[type] || [type])[0] });
const pieceName = (p, tr) => (p.st && p.st.title) || p.label || p.tag || kitName(p.t, tr);

// The plan. A station shows its number; any other piece that holds the coach's moves (bsStudioWork)
// is lit in the accent and can be tapped over its whole shape. Either opens the piece (onPiece, by
// its index). The counts are in the lists under the plan, not on it: a count on the plan reads as a
// station's number.
// `frame` is the part of the plan drawn ([x, y, w, h], the whole plan by default; a kitchen draws
// only its room, bsStudioFrame). `pieceLabel(p, count)` names a lit piece for a screen reader.
export function BSStudioPlan({ t, studio, ACC, ON_ACC, ink, MONO, onPiece, work = [], door = (k) => k, tr = (k, o) => (o && o.defaultValue) || k, frame = null, pieceLabel = null }) {
  const [fx, fy, fw, fh] = frame || [0, 0, BS_STUDIO_W, BS_STUDIO_H];
  const room = bsStudioRoom(studio.kind);
  const [rx, ry, rw, rh, style, radius] = room.room;
  const order = bsStudioDrawOrder(studio.items);
  const svgInk = t.inkRGB || '245,240,230';
  let station = 0;
  const marks = studio.items.map((p, i) => {
    if (p.st) { station += 1; return { i, p, n: station }; }
    return work[i] && work[i].count && p.t !== 'zone' ? { i, p, n: null, count: work[i].count } : null;
  }).filter(Boolean);
  return (
    <div style={{ position: 'relative', width: '100%', aspectRatio: `${fw} / ${fh}`, background: t.PAPER2 }}>
      <svg viewBox={`${fx} ${fy} ${fw} ${fh}`} width="100%" height="100%" style={{ position: 'absolute', inset: 0 }} aria-hidden>
        <rect x={rx} y={ry} width={rw} height={rh} rx={radius} fill="none" stroke={ink(0.26)} strokeWidth="1.5" strokeDasharray={style === 'dashed' ? '5 5' : undefined} />
        {room.doors.map(([x, y, w, h, key, lx, ly], i) => (
          <g key={i}><rect x={x} y={y} width={w} height={h} fill={t.PAPER2} /><text x={lx} y={ly + 9} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)}>{door(key)}</text></g>
        ))}
        {order.map((i) => {
          const p = studio.items[i];
          const lit = !!p.st || !!(work[i] && work[i].count);
          return (
            <g key={i}>
              <image href={bsStudioSvg(p.t, p.w, p.h, { ink: svgInk, light: t.isLight, accent: lit ? ACC : null })} x={p.x} y={p.y} width={p.w} height={p.h} />
              {p.tag ? <text x={p.x + 9} y={p.y + 17} fontFamily="Inter, system-ui, sans-serif" fontSize="11" fontWeight="600" fill={ink(0.72)}>{p.tag}</text> : null}
              {p.label ? <text x={p.x} y={p.y + p.h + 12} fontFamily="Inter, system-ui, sans-serif" fontSize="10.5" fill={ink(0.62)}>{p.label}</text> : null}
            </g>
          );
        })}
      </svg>
      {marks.filter((x) => !x.n).map(({ i, p, count }) => {
        // The piece's own rectangle, at least 32 points each way so a narrow rack can be tapped.
        const w = Math.max(p.w, 32 * fw / 344), h = Math.max(p.h, 32 * fw / 344);
        const x = p.x + p.w / 2 - w / 2, y = p.y + p.h / 2 - h / 2;
        return (
          <button key={i} type="button" data-piece="" onClick={onPiece ? () => onPiece(i) : undefined}
            aria-label={pieceLabel ? pieceLabel(p, count) : tr('profile:trainer.pieceMoves', { defaultValue: '{name}: {count, plural, one {# move} other {# moves}} from the programs', name: pieceName(p, tr), count })}
            style={{ position: 'absolute', left: `${((x - fx) / fw) * 100}%`, top: `${((y - fy) / fh) * 100}%`, width: `${(w / fw) * 100}%`, height: `${(h / fh) * 100}%`, padding: 0, border: 0, background: 'transparent', cursor: onPiece ? 'pointer' : 'default' }} />
        );
      })}
      {marks.filter((x) => x.n).map(({ i, p, n }) => {
        const [sx, sy] = bsStudioSpot(p);
        return (
          <button key={i} type="button" data-station="" onClick={onPiece ? () => onPiece(i) : undefined} aria-label={`${n}. ${pieceName(p, tr)}`}
            style={{ position: 'absolute', left: `${((sx - fx) / fw) * 100}%`, top: `${((sy - fy) / fh) * 100}%`, width: 44, height: 44, margin: '-22px 0 0 -22px', padding: 0, border: 0, background: 'transparent', display: 'grid', placeItems: 'center', cursor: onPiece ? 'pointer' : 'default' }}>
            <span style={{ width: 26, height: 26, borderRadius: 99, background: ACC, color: ON_ACC, display: 'grid', placeItems: 'center', fontFamily: MONO, fontSize: 12, fontWeight: 700, boxShadow: `0 0 0 4px ${hexA(ACC, 0.22)}` }}>{n}</span>
          </button>
        );
      })}
    </div>
  );
}

function StudioTab({ t, tr, ACC, ON_ACC, ink, DISPLAY, MONO, studio, gallery, isSelf, first, work = [], onPiece, onDraw }) {
  const kind = studio ? (STUDIO_KIND_KEYS[studio.kind] || STUDIO_KIND_KEYS.blank) : null;
  const door = (k) => (k === 'entrance' ? tr('profile:trainer.doorEntrance', { defaultValue: 'Entrance' }) : k === 'garage' ? tr('profile:trainer.doorGarage', { defaultValue: 'Garage door' }) : tr('profile:trainer.doorDoor', { defaultValue: 'Door' }));
  const stations = studio ? studio.items.map((p, i) => ({ p, i })).filter((x) => x.p.st) : [];
  // The rest of the floor that holds their moves, a row per kind of piece (four treadmills are one).
  const floor = [];
  if (studio) {
    const seen = new Map();
    studio.items.forEach((p, i) => {
      const w = work[i];
      if (p.st || p.t === 'zone' || !w || !w.count) return;
      const key = `${p.t}|${p.label || ''}`;
      if (seen.has(key)) { seen.get(key).n += 1; return; }
      const row = { i, p, n: 1, w };
      seen.set(key, row);
      floor.push(row);
    });
    floor.sort((a, b) => b.w.count - a.w.count);
  }
  const movesOf = (w) => tr('profile:trainer.movesCount', { defaultValue: '{count, plural, one {# move} other {# moves}}', count: w ? w.count : 0 });
  return (
    <section style={{ paddingTop: 16 }}>
      {studio ? (
        <>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACC }}>{tr('profile:trainer.' + kind[0], { defaultValue: kind[1] })}</span>
          {studio.where ? <span style={{ display: 'block', marginTop: 2, fontFamily: DISPLAY, fontWeight: 500, fontSize: 18 }}>{studio.where}<span style={{ color: ACC }}>.</span></span> : null}
          {stations.length || floor.length ? <p style={{ margin: '2px 0 0', fontSize: 13.5, color: ink(0.7) }}>{floor.length
            ? tr('profile:trainer.tapFloor', { defaultValue: 'Tap a number, or a lit piece, to see what {name} does there.', name: first })
            : tr('profile:trainer.tapNumber', { defaultValue: 'Tap a number to see how {name} coaches there.', name: first })}</p> : null}
          <div style={{ marginTop: 12 }}><BSStudioPlan t={t} studio={studio} ACC={ACC} ON_ACC={ON_ACC} ink={ink} MONO={MONO} onPiece={onPiece} work={work} door={door} tr={tr} /></div>
          {stations.length ? (
            <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
              {stations.map(({ p, i }, n) => (
                <li key={i}><button type="button" onClick={() => onPiece(i)} style={{ width: '100%', minHeight: 40, padding: 0, border: 0, borderBottom: `1px solid ${ink(0.11)}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, textAlign: 'left', cursor: 'pointer' }}>
                  <span style={{ fontFamily: MONO, color: ACC }}>{n + 1}</span><span style={{ flex: 1, minWidth: 0 }}>{p.st.title}</span>
                  {work[i] && work[i].count ? <span style={{ flexShrink: 0, fontSize: 11.5, color: ink(0.55) }}>{movesOf(work[i])}</span> : null}
                </button></li>
              ))}
            </ol>
          ) : null}
          {floor.length ? (
            <div data-floor="" style={{ marginTop: 18 }}>
              <span style={eyebrow(ink, MONO)}>{tr('profile:trainer.onTheFloor', { defaultValue: '{name}\'s workouts on the floor', name: first })}</span>
              {floor.map(({ i, p, n, w }) => (
                <button key={i} type="button" data-floor-row="" onClick={() => onPiece(i)} style={{ width: '100%', minHeight: 48, marginTop: 4, padding: '6px 0', border: 0, borderBottom: `1px solid ${ink(0.11)}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer' }}>
                  <img src={bsStudioSvg(p.t, p.w, p.h, { ink: t.inkRGB, light: t.isLight, accent: ACC })} alt="" style={{ width: 34, height: 34, objectFit: 'contain' }} />
                  <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.3 }}>
                    <span style={{ fontSize: 14.5 }}>{pieceName(p, tr)}{n > 1 ? <span style={{ color: ink(0.55) }}> ×{n}</span> : null}</span>
                    <span style={{ fontSize: 12.5, color: ink(0.6) }}>{movesOf(w)} · {w.programs.map((x) => x.name).join(', ')}</span>
                  </span>
                  <span aria-hidden style={{ color: ACC }}>→</span>
                </button>
              ))}
            </div>
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

// A piece opened from the plan: the station's words, the programs the coach pinned there, and the
// moves of their programs done on it, a row per program (each opens the program). A program is
// listed once: a pinned one under the pins, with its moves done here under its name, and not again
// under "done here" (owner, 2026-10-31: "this strong in 12 is appearing on multiple machines"; asked,
// they kept a program on every piece its moves use and had only the repeat on one sheet fixed).
function PieceSheet({ t, tr, ACC, ink, DISPLAY, MONO, INK, studio, i, work, programs, isSelf, first, words, onClose, onWork, onProgram }) {
  const p = studio.items[i];
  const n = p.st ? studio.items.slice(0, i + 1).filter((q) => q.st).length : null;
  const name = pieceName(p, tr);
  const byId = new Map(programs.map((pr) => [pr.id, pr]));
  const pinned = work ? [...new Set(work.pinned)].map((id) => byId.get(id)).filter(Boolean) : [];
  const pinnedIds = new Set(pinned.map((pr) => pr.id));
  const movesOf = new Map(work ? work.programs.map((x) => [x.id, x.moves]) : []);
  const held = work ? work.programs.filter((x) => byId.has(x.id) && !pinnedIds.has(x.id)) : [];
  const progRow = (pr, moves, k) => (
    <button key={k} type="button" data-piece-program="" onClick={() => onProgram(pr)} style={{ width: '100%', minHeight: 48, padding: '9px 0', border: 0, borderTop: `1px solid ${ink(0.12)}`, background: 'transparent', color: INK, display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left', cursor: 'pointer' }}>
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
        <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15 }}>{pr.name}{pr.video ? <span style={{ marginLeft: 6, fontFamily: MONO, fontSize: 10, color: ACC }}>▷</span> : null}</span>
        {moves && moves.length ? <span style={{ fontSize: 13, color: ink(0.68) }}>{moves.slice(0, 8).join(' · ')}{moves.length > 8 ? ` ＋${moves.length - 8}` : ''}</span> : null}
      </span>
      <span aria-hidden style={{ color: ACC }}>→</span>
    </button>
  );
  return (
    <Sheet t={t} label={name} onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACC }}>{n ? `${n} · ` : ''}{kitName(p.t, tr)}</span>
        <CloseX onClose={onClose} color={INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      <div style={{ marginTop: 8, display: 'grid', placeItems: 'center', height: 120, background: t.PAPER2 }}>
        <img src={bsStudioSvg(p.t, p.w, p.h, { ink: t.inkRGB, light: t.isLight, accent: ACC })} alt="" style={{ maxWidth: '70%', maxHeight: 96, width: p.w * 1.4, height: p.h * 1.4, objectFit: 'contain' }} />
      </div>
      <h2 style={{ margin: '12px 0 0', fontFamily: DISPLAY, fontWeight: 500, fontSize: 21, lineHeight: 1.15 }}>{name}</h2>
      {p.st && p.st.note ? <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.5, color: ink(0.86), whiteSpace: 'pre-wrap' }}>{p.st.note}</p>
        : (p.st && isSelf ? <p style={{ margin: '6px 0 0', fontSize: 14, color: ink(0.6) }}>{tr('profile:trainer.stationNoNote', { defaultValue: 'Say what you do here in Make it yours → Your space.' })}</p> : null)}
      {pinned.length ? (
        <div data-pinned="" style={{ marginTop: 16 }}>
          <span style={eyebrow(ink, MONO, ACC)}>{tr('profile:trainer.pinnedHere', { defaultValue: 'Programs {name} runs here', name: first })}</span>
          {pinned.map((pr) => progRow(pr, movesOf.get(pr.id) || null, 'pin-' + pr.id))}
        </div>
      ) : null}
      {held.length ? (
        <div data-piece-moves="" style={{ marginTop: 16 }}>
          <span style={eyebrow(ink, MONO)}>{tr('profile:trainer.movesHere', { defaultValue: 'In {name}\'s programs, done here', name: first })}</span>
          {held.map((x) => progRow(byId.get(x.id), x.moves, 'held-' + x.id))}
        </div>
      ) : (isSelf && !pinned.length ? <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ink(0.6) }}>{tr('profile:trainer.movesHereSelf', { defaultValue: 'Moves from your published programs show here when they use this piece. You can also pin a program to a station in Make it yours.' })}</p> : null)}
      {!isSelf ? <button type="button" onClick={onWork} style={{ marginTop: 16, width: '100%', minHeight: 50, padding: '0 14px', border: `1px solid ${ink(0.22)}`, background: 'transparent', color: INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{words.work}<span style={{ color: ACC }}>→</span></button> : null}
    </Sheet>
  );
}

// ── Her kitchen (a nutritionist's) ──────────────────────────────────────────────────────────
// Owner, 2026-10-27 ("lets do something different for nutritionists"); 2026-10-29: "It will be their
// own recipes", and the plate, the staples and the recipes all kept and organized; 2026-10-30: "lets
// show a kitchen layout, like we did for trainers", so the tab opens on the kitchen as they drew it
// (Make it yours → Your kitchen → Layout), each spot telling what they make there. Then three
// parts, one on screen at a time: their recipes (their own, written in Make it yours: opened,
// a member cooks one in Shape's cook mode or sends its ingredients to their grocery list), the plate
// they teach (a picture of how a plate splits, with their portion rules), and the staples always in
// their kitchen (tap what you want and add it to your own grocery list). Listing photos under it.
const eyebrow = (ink, MONO, color) => ({ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: color || ink(0.64) });
const VEG = '#5fb16e', CARB = '#e3a544';
// The plate's three colours: vegetables green, protein the coach's accent, carbs amber; a part whose
// colour the accent already is takes the page's ink instead, so the three always read apart.
function plateColors(ACC, ink) {
  const same = (x) => String(ACC).toLowerCase() === x;
  return { veg: same(VEG) ? ink(0.4) : VEG, protein: ACC, carbs: same(CARB) || same('#c8881a') ? ink(0.4) : CARB };
}
function PlatePicture({ plate, colors, size = 132, t }) {
  const a = plate.veg, b = plate.veg + plate.protein;
  return (
    <span aria-hidden style={{ flex: 'none', width: size, height: size, borderRadius: 99, background: `conic-gradient(${colors.veg} 0 ${a}%, ${colors.protein} ${a}% ${b}%, ${colors.carbs} ${b}% 100%)`, display: 'grid', placeItems: 'center', boxShadow: `0 0 0 6px ${t.PAPER2}` }}>
      <span style={{ width: size * 0.36, height: size * 0.36, borderRadius: 99, background: t.PAPER }} />
    </span>
  );
}
// A recipe's time, energy and protein: the parts it has.
function recipeMeta(tr, r) {
  return [
    Number.isFinite(r.min) ? tr('cook:ck.mins', { defaultValue: '{n} min', n: r.min }) : null,
    Number.isFinite(r.kcal) ? tr('cook:ck.kcal', { defaultValue: '{n} kcal', n: r.kcal }) : null,
    Number.isFinite(r.p) ? tr('cook:ck.gProtein', { defaultValue: '{n} g protein', n: r.p }) : null,
  ].filter(Boolean).join(' · ');
}
// A recipe with no photo: the coach's colour, with the recipe's first letter.
function RecipeSwatch({ r, ACC, t, size = 76, font = 30 }) {
  if (r.photo) return <img src={r.photo} alt="" style={{ flex: 'none', width: size, height: size, objectFit: 'cover' }} />;
  return (
    <span aria-hidden style={{ flex: 'none', width: size, height: size, display: 'grid', placeItems: 'center', background: `linear-gradient(135deg, ${hexA(ACC, 0.55)}, ${t.PAPER2})`, color: t.INK, fontSize: font, fontWeight: 600 }}>
      {String(r.t || '?').trim().charAt(0).toUpperCase()}
    </span>
  );
}
const STAPLE_GROUP_KEYS = { fridge: ['groupFridge', 'Fridge'], pantry: ['groupPantry', 'Pantry'], freezer: ['groupFreezer', 'Freezer'] };
// Each staple group's small line drawing: a fridge, a jar, a snowflake. In currentColor.
function StapleIcon({ g }) {
  const d = {
    fridge: <><rect x="6" y="2.5" width="12" height="19" rx="2" /><path d="M6 10h12M9 5.5v2M9 13v3" /></>,
    pantry: <><path d="M8 3.5h8v3H8z" /><path d="M7.5 6.5h9a1.5 1.5 0 0 1 1.5 1.5v11.5a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V8a1.5 1.5 0 0 1 1.5-1.5Z" /><path d="M6 12h12" /></>,
    freezer: <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9M9.5 4.5 12 7l2.5-2.5M9.5 19.5 12 17l2.5 2.5" />,
  }[g];
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{d}</svg>;
}
// The kitchen's three parts, in the order a member uses them: what to cook, how to plate it, what to
// keep in. A visitor sees the parts that have something in them; the coach sees all three. The
// layout is not a part: it heads the tab, as the studio's plan heads a trainer's.
export const KITCHEN_SECTIONS = [['recipes', 'secRecipes', 'Recipes'], ['plate', 'secPlate', 'Plate'], ['staples', 'secStaples', 'Staples']];
function KitchenTab({ t, tr, ACC, ON_ACC, ink, DISPLAY, MONO, kitchen, plan = null, work = [], gallery, isSelf, first, ownerKey, stapleKeys = null, onRecipe, onFill, onSpot, sec = null, setSec = () => {} }) {
  const plate = kitchen ? kitchen.plate : null;
  const rules = kitchen ? kitchen.rules : [];
  const staples = kitchen ? kitchen.staples : [];
  const recipes = kitchen ? kitchen.recipes : [];
  const count = { recipes: recipes.length, plate: plate || rules.length ? 1 : 0, staples: staples.length };
  const shown = KITCHEN_SECTIONS.filter(([k]) => isSelf || count[k] > 0);
  const now = shown.some(([k]) => k === sec) ? sec : (shown[0] ? shown[0][0] : null);
  const colors = plateColors(ACC, ink);
  const part = (k) => tr('profile:nutri.part' + k, { defaultValue: { Veg: 'Vegetables', Protein: 'Protein', Carbs: 'Carbs' }[k] });
  // Staples a visitor picked, added to their own grocery lists as one list. A sample's staples are
  // said in the reader's language, so a pick is kept by its English name (stapleKeys) and read back
  // against the staples as they are now: a language switch keeps the picks, and the list is the
  // same list in every language (Codex on #2512). A real coach's staples are their own names.
  const stable = (n) => (stapleKeys && Object.prototype.hasOwnProperty.call(stapleKeys, n) ? stapleKeys[n] : n);
  const [picked, setPicked] = React.useState(() => new Set());
  const chosen = staples.filter((s) => picked.has(stable(s.n)));
  const [saving, setSaving] = React.useState(null); // null | 'busy' | 'done' | 'err'
  const toggle = (n) => { setSaving(null); setPicked((prev) => { const next = new Set(prev); if (next.has(n)) next.delete(n); else next.add(n); return next; }); };
  // A group's Pick all picks every staple in it, or, with all of them picked, clears them.
  const pickGroup = (names, all) => { setSaving(null); setPicked((prev) => { const next = new Set(prev); for (const n of names) { if (all) next.delete(n); else next.add(n); } return next; }); };
  const addPicked = async () => {
    if (!chosen.length || saving === 'busy') return;
    if (window.bsRequireAccount && !window.bsRequireAccount(tr('profile:nutri.staplesAsk', { defaultValue: 'add to your grocery list' }))) return;
    const items = chosen.map((s) => ({ n: s.n, q: '1' }));
    // One list per coach and set of staples, so adding the same ones again keeps one copy. Hashed:
    // the list's id keeps 64 characters, so names cut short there could make a bigger pick the same.
    const id = `kitchen-${bsShortHash(ownerKey || 'sample')}-${bsShortHash(items.map((i) => stable(i.n).toLowerCase()).sort().join('\n'))}`;
    const list = bsReceivedGroceryList({ name: tr('profile:nutri.staplesList', { defaultValue: "{name}'s staples", name: first }), items }, { messageId: id, from: first });
    if (!list) return;
    setSaving('busy');
    try { await bsSaveReceivedGroceryList(list); setSaving('done'); setPicked(new Set()); } catch (e) { setSaving('err'); }
  };
  const fill = (key, en, section) => (
    <button type="button" data-kitchen-fill={section} onClick={() => onFill(section)} style={{ marginTop: 12, minHeight: 46, padding: '0 16px', border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:nutri.' + key, { defaultValue: en })}</button>
  );
  const recipesOf = (w) => tr('profile:nutri.recipesHere', { defaultValue: '{count, plural, one {# recipe} other {# recipes}}', count: w ? w.count : 0 });

  // The layout: the coach's kitchen as they drew it, with a number on each spot they named and the
  // spots their recipes use lit; tap one for what they make there (SpotSheet).
  const kind = plan ? (STUDIO_KIND_KEYS[plan.kind] || STUDIO_KIND_KEYS.kitchen) : null;
  const spots = plan ? plan.items.map((p, i) => ({ p, i })).filter((x) => x.p.st) : [];
  const lit = plan ? plan.items.some((p, i) => !p.st && p.t !== 'zone' && work[i] && work[i].count) : false;
  const door = (k) => (k === 'entrance' ? tr('profile:trainer.doorEntrance', { defaultValue: 'Entrance' }) : k === 'garage' ? tr('profile:trainer.doorGarage', { defaultValue: 'Garage door' }) : tr('profile:trainer.doorDoor', { defaultValue: 'Door' }));
  const layout = plan ? (
    <div data-kitchen-plan="" style={{ marginBottom: 22 }}>
      <span style={eyebrow(ink, MONO, ACC)}>{tr('profile:trainer.' + kind[0], { defaultValue: kind[1] })}</span>
      {plan.where ? <span style={{ display: 'block', marginTop: 2, fontFamily: DISPLAY, fontWeight: 500, fontSize: 18 }}>{plan.where}<span style={{ color: ACC }}>.</span></span> : null}
      {spots.length || lit ? <p style={{ margin: '2px 0 0', fontSize: 13.5, color: ink(0.7) }}>{tr('profile:nutri.tapSpot', { defaultValue: 'Tap a number, or a lit spot, to see what {name} makes there.', name: first })}</p> : null}
      <div style={{ marginTop: 12 }}>
        <BSStudioPlan t={t} studio={plan} ACC={ACC} ON_ACC={ON_ACC} ink={ink} MONO={MONO} onPiece={onSpot} work={work} door={door} tr={tr} frame={bsStudioFrame(plan)}
          pieceLabel={(p, n) => tr('profile:nutri.spotRecipes', { defaultValue: '{name}: {count, plural, one {# recipe} other {# recipes}} made here', name: pieceName(p, tr), count: n })} />
      </div>
      {spots.length ? (
        <ol style={{ margin: '12px 0 0', padding: 0, listStyle: 'none', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0 16px' }}>
          {spots.map(({ p, i }, n) => (
            <li key={i}><button type="button" data-spot-row="" onClick={() => onSpot(i)} style={{ width: '100%', minHeight: 44, padding: 0, border: 0, borderBottom: `1px solid ${ink(0.11)}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, textAlign: 'left', cursor: 'pointer' }}>
              <span style={{ fontFamily: MONO, color: ACC }}>{n + 1}</span><span style={{ flex: 1, minWidth: 0 }}>{p.st.title || pieceName(p, tr)}</span>
              {work[i] && work[i].count ? <span style={{ flexShrink: 0, fontSize: 11.5, color: ink(0.55) }}>{recipesOf(work[i])}</span> : null}
            </button></li>
          ))}
        </ol>
      ) : null}
    </div>
  ) : isSelf ? (
    <div data-kitchen-plan-empty="" style={{ marginBottom: 22 }}>
      <Hint ink={ink}>{tr('profile:nutri.layoutEmptySelf', { defaultValue: 'Draw your kitchen: the fridge, the stove, where you prep. Members tap a spot to see what you make there.' })}</Hint>
      {fill('drawKitchen', 'Draw your kitchen', 'layout')}
    </div>
  ) : null;

  const recipesPart = recipes.length ? (
    <div data-kitchen-recipes="" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {recipes.map((r) => (
        <button key={r.id} type="button" data-recipe={r.id} onClick={() => onRecipe(r)}
          style={{ width: '100%', padding: '10px 0 0', border: 0, borderTop: `1px solid ${ink(0.12)}`, background: 'transparent', color: t.INK, display: 'flex', gap: 12, alignItems: 'stretch', textAlign: 'left', cursor: 'pointer' }}>
          <RecipeSwatch r={r} ACC={ACC} t={t} />
          <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3, lineHeight: 1.35 }}>
            <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 16 }}>{r.t}</span>
            {recipeMeta(tr, r) ? <span style={{ fontFamily: MONO, fontSize: 11, color: ink(0.62) }}>{recipeMeta(tr, r)}</span> : null}
            {r.note ? <span style={{ fontSize: 14, color: ink(0.86) }}>{r.note}</span> : null}
            <span style={{ marginTop: 2, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, color: ACC }}>{tr('profile:nutri.tryIt', { defaultValue: 'Try it in Shape' })} →</span>
          </span>
        </button>
      ))}
    </div>
  ) : isSelf ? (
    <div>
      <Hint ink={ink}>{tr('profile:nutri.recipesEmptySelf', { defaultValue: 'Write the recipes you give clients. Members can cook them in Shape and send the ingredients to their grocery list.' })}</Hint>
      {fill('writeRecipe', 'Write a recipe', 'recipes')}
    </div>
  ) : null;

  const platePart = plate || rules.length ? (
    <div data-kitchen-plate="">
      <span style={eyebrow(ink, MONO, ACC)}>{tr('profile:nutri.plateTitle', { defaultValue: 'The plate {name} teaches', name: first })}</span>
      <div style={{ marginTop: 12, display: 'flex', gap: 18, alignItems: 'center' }}>
        {plate ? <PlatePicture plate={plate} colors={colors} t={t} /> : null}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {plate ? [['Veg', plate.veg, colors.veg], ['Protein', plate.protein, colors.protein], ['Carbs', plate.carbs, colors.carbs]].filter(([, n]) => n > 0).map(([k, n, c]) => (
            <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <span aria-hidden style={{ width: 10, height: 10, borderRadius: 99, background: c }} />
              <span style={{ flex: 1 }}>{part(k)}</span>
              <span style={{ fontFamily: MONO, fontSize: 12, color: ink(0.7) }}>{tr('profile:nutri.pct', { defaultValue: '{n}%', n })}</span>
            </span>
          )) : null}
        </div>
      </div>
      {rules.length ? (
        <ul style={{ margin: '14px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {rules.map((r, i) => <li key={i} style={{ display: 'flex', gap: 10, fontSize: 14.5, lineHeight: 1.4 }}><span aria-hidden style={{ color: ACC, fontFamily: MONO }}>—</span>{r}</li>)}
        </ul>
      ) : null}
    </div>
  ) : isSelf ? (
    <div>
      <Hint ink={ink}>{tr('profile:nutri.plateEmptySelf', { defaultValue: 'Show members how you build a plate, and the portion rules you teach.' })}</Hint>
      {fill('setPlate', 'Set your plate', 'plate')}
    </div>
  ) : null;

  // The staples, a soft card per place they live (owner, 2026-10-30: "make these look better"): its
  // drawing, its name and how many, and each staple a rounded chip. A member taps a chip to pick it
  // (＋, then ✓ on the accent), or Pick all for the whole group, then adds what they picked.
  const staplesPart = staples.length ? (
    <div data-kitchen-staples="">
      <span style={eyebrow(ink, MONO)}>{tr('profile:nutri.staples', { defaultValue: 'Always in the kitchen' })}</span>
      {!isSelf ? <p style={{ margin: '2px 0 0', fontSize: 13.5, color: ink(0.7) }}>{tr('profile:nutri.staplesSub', { defaultValue: 'Tap what you want, then add it to your grocery list.' })}</p> : null}
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {['fridge', 'pantry', 'freezer'].map((g) => {
          const inG = staples.filter((x) => x.g === g);
          if (!inG.length) return null;
          const names = inG.map((x) => stable(x.n));
          const all = names.every((n) => picked.has(n));
          return (
            <div key={g} data-staple-group={g} style={{ padding: '10px 12px 14px', borderRadius: 14, background: t.PAPER2 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, minHeight: 44 }}>
                <span aria-hidden style={{ flex: 'none', width: 32, height: 32, borderRadius: 10, display: 'grid', placeItems: 'center', background: hexA(ACC, 0.14), color: ACC }}><StapleIcon g={g} /></span>
                <span style={{ flex: 1, minWidth: 0, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600 }}>
                  {tr('profile:nutri.' + STAPLE_GROUP_KEYS[g][0], { defaultValue: STAPLE_GROUP_KEYS[g][1] })}
                  <span style={{ marginLeft: 6, fontFamily: MONO, fontSize: 11, fontWeight: 400, color: ink(0.55) }}>{inG.length}</span>
                </span>
                {!isSelf && inG.length > 1 ? (
                  <button type="button" data-staple-group-pick={g} aria-pressed={all} onClick={() => pickGroup(names, all)}
                    style={{ flex: 'none', minHeight: 44, padding: '0 4px', border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>
                    {all ? tr('profile:nutri.clearPicks', { defaultValue: 'Clear' }) : tr('profile:nutri.pickAll', { defaultValue: 'Pick all' })}
                  </button>
                ) : null}
              </div>
              <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {inG.map((x) => {
                  const on = picked.has(stable(x.n));
                  return isSelf ? (
                    <span key={x.n} data-staple="" style={{ minHeight: 36, padding: '0 14px', borderRadius: 999, display: 'inline-flex', alignItems: 'center', background: hexA(ACC, 0.1), color: t.INK, fontSize: 14 }}>{x.n}</span>
                  ) : (
                    <button key={x.n} type="button" data-staple="" aria-pressed={on} onClick={() => toggle(stable(x.n))}
                      style={{ minHeight: 44, padding: '0 14px 0 10px', borderRadius: 999, border: 0, background: on ? ACC : hexA(ACC, 0.1), color: on ? ON_ACC : t.INK, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 14, fontWeight: on ? 600 : 400, cursor: 'pointer' }}>
                      <span aria-hidden style={{ width: 18, textAlign: 'center', fontSize: 15, lineHeight: 1, color: on ? ON_ACC : ACC }}>{on ? '✓' : '＋'}</span>{x.n}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      {!isSelf ? (
        <div style={{ marginTop: 12 }}>
          <button type="button" data-add-staples="" onClick={addPicked} disabled={!chosen.length || saving === 'busy'}
            style={{ width: '100%', minHeight: 48, border: 0, background: chosen.length ? ACC : t.PAPER2, color: chosen.length ? ON_ACC : ink(0.5), fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: chosen.length ? 'pointer' : 'default' }}>
            {saving === 'busy' ? tr('profile:nutri.staplesAdding', { defaultValue: 'Adding…' }) : tr('profile:nutri.addStaples', { defaultValue: '{count, plural, =0 {Pick what to add} one {Add # to my grocery list} other {Add # to my grocery list}}', count: chosen.length })}
          </button>
          {saving === 'done' ? <p role="status" style={{ margin: '8px 0 0', fontSize: 13.5, color: ACC }}>{tr('profile:nutri.staplesSaved', { defaultValue: 'Added to your grocery lists, under Eat.' })}</p> : null}
          {saving === 'err' ? <p role="alert" style={{ margin: '8px 0 0', fontSize: 13.5, color: t.RUST || '#c0533b' }}>{tr('profile:nutri.staplesFailed', { defaultValue: "Couldn't add them just now. Try again." })}</p> : null}
        </div>
      ) : null}
    </div>
  ) : isSelf ? (
    <div>
      <Hint ink={ink}>{tr('profile:nutri.staplesEmptySelf', { defaultValue: 'List what is always in your fridge, pantry and freezer. Members add what they want to their grocery list.' })}</Hint>
      {fill('addYourStaples', 'Add your staples', 'staples')}
    </div>
  ) : null;

  const nothing = !count.recipes && !count.plate && !count.staples;
  return (
    <section style={{ paddingTop: 16 }}>
      {layout}
      {isSelf && nothing ? (
        <div>
          <Hint ink={ink}>{tr('profile:nutri.kitchenEmptySelf', { defaultValue: 'Show members your recipes, the plate you teach and what is always in your kitchen.' })}</Hint>
          {fill('fillKitchen', 'Fill your kitchen', 'recipes')}
        </div>
      ) : now ? (
        <>
          {shown.length > 1 ? (
            <div role="group" aria-label={tr('profile:nutri.sections', { defaultValue: 'In the kitchen' })} style={{ display: 'flex', gap: 6 }}>
              {shown.map(([k, key, en]) => {
                const on = k === now;
                return (
                  <button key={k} type="button" data-kitchen-section={k} aria-pressed={on} onClick={() => setSec(k)}
                    style={{ flex: 1, minHeight: 44, padding: '0 8px', border: `1px solid ${on ? ACC : ink(0.22)}`, background: on ? hexA(ACC, 0.14) : 'transparent', color: t.INK, fontFamily: DISPLAY, fontSize: 14, fontWeight: on ? 600 : 500, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                    {tr('profile:nutri.' + key, { defaultValue: en })}
                    {k !== 'plate' && count[k] ? <span style={{ fontFamily: MONO, fontSize: 11, color: ink(0.6) }}>{count[k]}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : now === 'recipes' ? <span style={eyebrow(ink, MONO, ACC)}>{tr('profile:nutri.secRecipes', { defaultValue: 'Recipes' })}</span> : null}
          <div style={{ marginTop: shown.length > 1 || now === 'recipes' ? 14 : 0 }}>
            {now === 'recipes' ? recipesPart : now === 'plate' ? platePart : staplesPart}
          </div>
          {/* The coach's way into this part's editor: a full-width secondary button, so it reads as
              the action it is rather than a link under the last chip. */}
          {isSelf && count[now] ? (
            <button type="button" data-edit-kitchen={now} onClick={() => onFill(now)}
              style={{ marginTop: 16, width: '100%', minHeight: 46, padding: '0 14px', border: `1px solid ${ink(0.22)}`, background: 'transparent', color: t.INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
              {tr('profile:nutri.editKitchen', { defaultValue: 'Edit your kitchen' })}<span aria-hidden style={{ color: ACC }}>→</span>
            </button>
          ) : null}
        </>
      ) : null}
      {gallery.length ? (
        <div style={{ marginTop: 18, display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 6 }}>
          {gallery.slice(0, 6).map((g, i) => <img key={i} src={g.url} alt={g.caption || ''} style={{ width: '100%', height: 96, objectFit: 'cover' }} />)}
        </div>
      ) : null}
    </section>
  );
}

// A spot opened from the kitchen layout: the coach's words for it and the recipes of theirs made
// there (bsKitchenWork), each opening the recipe.
function SpotSheet({ t, tr, ACC, ink, DISPLAY, MONO, INK, plan, i, work, recipes, isSelf, first, words, onClose, onWork, onRecipe }) {
  const p = plan.items[i];
  const n = p.st ? plan.items.slice(0, i + 1).filter((q) => q.st).length : null;
  const name = pieceName(p, tr);
  const byId = new Map((recipes || []).map((r) => [r.id, r]));
  const made = work ? work.recipes.map((x) => byId.get(x.id)).filter(Boolean) : [];
  return (
    <Sheet t={t} label={name} onClose={onClose}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.16em', textTransform: 'uppercase', color: ACC }}>{n ? `${n} · ` : ''}{kitName(p.t, tr)}</span>
        <CloseX onClose={onClose} color={INK} label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      <div style={{ marginTop: 8, display: 'grid', placeItems: 'center', height: 120, background: t.PAPER2 }}>
        <img src={bsStudioSvg(p.t, p.w, p.h, { ink: t.inkRGB, light: t.isLight, accent: ACC })} alt="" style={{ maxWidth: '70%', maxHeight: 96, width: p.w * 1.4, height: p.h * 1.4, objectFit: 'contain' }} />
      </div>
      <h2 style={{ margin: '12px 0 0', fontFamily: DISPLAY, fontWeight: 500, fontSize: 21, lineHeight: 1.15 }}>{name}</h2>
      {p.st && p.st.note ? <p style={{ margin: '6px 0 0', fontSize: 14.5, lineHeight: 1.5, color: ink(0.86), whiteSpace: 'pre-wrap' }}>{p.st.note}</p>
        : (p.st && isSelf ? <p style={{ margin: '6px 0 0', fontSize: 14, color: ink(0.6) }}>{tr('profile:nutri.spotNoNote', { defaultValue: 'Say what you do here in Make it yours → Your kitchen → Layout.' })}</p> : null)}
      {made.length ? (
        <div data-spot-recipes="" style={{ marginTop: 16 }}>
          <span style={eyebrow(ink, MONO, ACC)}>{tr('profile:nutri.madeHere', { defaultValue: '{name}\'s recipes made here', name: first })}</span>
          {made.map((r) => (
            <button key={r.id} type="button" data-spot-recipe={r.id} onClick={() => onRecipe(r)} style={{ width: '100%', minHeight: 56, marginTop: 4, padding: '8px 0', border: 0, borderTop: `1px solid ${ink(0.12)}`, background: 'transparent', color: INK, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer' }}>
              <RecipeSwatch r={r} ACC={ACC} t={t} size={44} font={18} />
              <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 15 }}>{r.t}</span>
                {recipeMeta(tr, r) ? <span style={{ fontFamily: MONO, fontSize: 11, color: ink(0.62) }}>{recipeMeta(tr, r)}</span> : null}
              </span>
              <span aria-hidden style={{ color: ACC }}>→</span>
            </button>
          ))}
        </div>
      ) : (isSelf ? <p style={{ margin: '12px 0 0', fontSize: 13.5, lineHeight: 1.45, color: ink(0.6) }}>{tr('profile:nutri.madeHereSelf', { defaultValue: 'Your recipes show here when their method uses this spot: roasting lights the oven, searing the stove.' })}</p> : null)}
      {!isSelf ? <button type="button" onClick={onWork} style={{ marginTop: 16, width: '100%', minHeight: 50, padding: '0 14px', border: `1px solid ${ink(0.22)}`, background: 'transparent', color: INK, display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{words.work}<span style={{ color: ACC }}>→</span></button> : null}
    </Sheet>
  );
}

// ── Their activity (a tab) ──────────────────────────────────────────────────────────────────
// What the coach posted, newest first, drawn by the member profile's activity card
// (BSActivityCard, a window global of the client module) so a coach's feed reads like a member's.
// Without that card (the module not loaded) a plain row stands in. Its own tab since 2026-10-31,
// so it lists them all (to ACTIVITY_MAX) where under the tabs it showed three and See all.
// On their own page: Log activity, and with nothing yet, what it is for.
const BS_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACTIVITY_MAX = 30;
function ActivityFeed({ t, tr, ACC, ink, DISPLAY, MONO, gutter, cards, isSelf, first, onLog, ctx }) {
  const Card = ctx ? window.BSActivityCard : null;
  const list = cards.slice(0, ACTIVITY_MAX);
  return (
    <section data-activity="" aria-label={tr('profile:tab.activity', { defaultValue: 'Activity' })} style={{ margin: `14px 0 22px` }}>
      <div style={{ padding: `0 ${gutter}px`, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
        <span style={eyebrow(ink, MONO)}>{tr('profile:trainer.activityTitle', { defaultValue: '{name}\'s activity', name: first })}</span>
        {isSelf ? <button type="button" data-log-activity="" onClick={onLog} style={{ minHeight: 44, padding: 0, border: 0, background: 'transparent', color: ACC, fontFamily: DISPLAY, fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>＋ {tr('profile:trainer.logActivity', { defaultValue: 'Log activity' })}</button> : null}
      </div>
      {cards.length ? (
        <div style={{ marginTop: 6 }}>
          {list.map((a, i) => (Card ? (
            <div key={a.key || i} data-activity-card="">
              <Card a={a} ctx={ctx} hideAuthor isLast={i === list.length - 1} pagePad={0} variant="magazine" />
            </div>
          ) : (
            <div key={a.key || i} data-activity-card="" style={{ margin: `0 ${gutter}px`, padding: '12px 0', borderTop: `1px solid ${ink(0.12)}` }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ACC }}>{[a.typeLabel, a.ago].filter(Boolean).join(' · ')}</span>
              {a.title ? <span style={{ display: 'block', marginTop: 3, fontFamily: DISPLAY, fontWeight: 600, fontSize: 16 }}>{a.title}</span> : null}
              {a.body ? <span style={{ display: 'block', marginTop: 2, fontSize: 14, lineHeight: 1.45, color: ink(0.78) }}>{a.body}</span> : null}
            </div>
          )))}
        </div>
      ) : (
        <div style={{ padding: `4px ${gutter}px 0` }}>
          <Hint ink={ink}>{tr('profile:trainer.activityEmptySelf', { defaultValue: 'Nothing posted yet. Log a run, a note or a photo, and members see it here.' })}</Hint>
        </div>
      )}
    </section>
  );
}

// One of their recipes, over the page: the photo, the numbers a serving carries, their note, the
// ingredients and the method. A member cooks it in Shape's cook mode, or sends its ingredients to
// their grocery lists as one list (the same list each time).
function OwnRecipePage({ t, tr, ACC, ON_ACC, ink, DISPLAY, MONO, recipe: r, first, avatar, isSelf, ownerKey, onClose, onCook }) {
  const [list, setList] = React.useState(null); // null | 'busy' | 'done' | 'err'
  const addList = async () => {
    if (list === 'busy' || list === 'done') return;
    if (window.bsRequireAccount && !window.bsRequireAccount(tr('profile:nutri.staplesAsk', { defaultValue: 'add to your grocery list' }))) return;
    const l = bsOwnRecipeGroceryList(r, { ownerKey, name: r.t, from: tr('profile:nutri.kitchenName', { defaultValue: "{name}'s kitchen", name: first }) });
    if (!l) return;
    setList('busy');
    try { await bsSaveReceivedGroceryList(l); setList('done'); } catch (e) { setList('err'); }
  };
  const ings = r.ing || [];
  const steps = r.steps || [];
  const macros = [
    Number.isFinite(r.kcal) ? [tr('cook:ck.kcal', { defaultValue: '{n} kcal', n: r.kcal }), null] : null,
    Number.isFinite(r.p) ? [tr('profile:nutri.grams', { defaultValue: '{n} g', n: r.p }), tr('profile:nutri.partProtein', { defaultValue: 'Protein' })] : null,
    Number.isFinite(r.c) ? [tr('profile:nutri.grams', { defaultValue: '{n} g', n: r.c }), tr('profile:nutri.partCarbs', { defaultValue: 'Carbs' })] : null,
    Number.isFinite(r.f) ? [tr('profile:nutri.grams', { defaultValue: '{n} g', n: r.f }), tr('profile:nutri.partFat', { defaultValue: 'Fat' })] : null,
  ].filter(Boolean);
  const canCook = !!window.BSCookMode && (steps.length > 0 || ings.length > 0);
  const host = sheetHost();
  const el = (
    <div role="dialog" aria-label={r.t} data-own-recipe={r.id} style={{ position: 'absolute', inset: 0, zIndex: 230, background: t.PAPER, color: t.INK, overflowY: 'auto', overflowX: 'hidden', fontFamily: t.BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ position: 'relative' }}>
        {r.photo ? <img src={r.photo} alt="" style={{ display: 'block', width: '100%', height: 240, objectFit: 'cover' }} />
          : <div aria-hidden style={{ height: `calc(${window.BS_MAST_TOP_CSS || '44px'} + 110px)`, background: `linear-gradient(135deg, ${hexA(ACC, 0.6)}, ${t.PAPER2})` }} />}
        {r.photo ? <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: 160, background: 'linear-gradient(180deg, rgba(0,0,0,0.42), rgba(0,0,0,0))' }} /> : null}
        {/* The masthead row and ← Back under it, where every page keeps them (owner, 2026-10-31), over
            the photo. No corner: this is a dialog over the profile. */}
        <div data-recipe-back="" style={{ position: 'absolute', left: 0, right: 0, top: 0, padding: `${window.BS_MAST_TOP_CSS || '44px'} ${t.padX || 22}px 0` }}>
          {window.BSMastRow ? <window.BSMastRow trailing={null} ink="#ffffff" /> : null}
          {window.BSBackRow ? <window.BSBackRow onBack={onClose} ink="#ffffff" label={tr('profile:trainer.back', { defaultValue: 'Back' })} buttonStyle={{ textShadow: '0 1px 6px rgba(0,0,0,0.5)' }} /> : null}
        </div>
      </div>
      <div style={{ padding: `16px ${t.padX || 22}px calc(32px + env(safe-area-inset-bottom))` }}>
        <span style={eyebrow(ink, MONO, ACC)}>{tr('profile:nutri.kitchenName', { defaultValue: "{name}'s kitchen", name: first })}</span>
        <h2 style={{ margin: '6px 0 0', fontFamily: DISPLAY, fontWeight: 600, fontSize: 26, lineHeight: 1.12 }}>{r.t}</h2>
        {[Number.isFinite(r.min) ? tr('cook:ck.mins', { defaultValue: '{n} min', n: r.min }) : null, Number.isFinite(r.serves) ? tr('profile:nutri.serves', { defaultValue: '{count, plural, one {Serves #} other {Serves #}}', count: r.serves }) : null].filter(Boolean).length ? (
          <p style={{ margin: '6px 0 0', fontFamily: MONO, fontSize: 12, color: ink(0.64) }}>{[Number.isFinite(r.min) ? tr('cook:ck.mins', { defaultValue: '{n} min', n: r.min }) : null, Number.isFinite(r.serves) ? tr('profile:nutri.serves', { defaultValue: '{count, plural, one {Serves #} other {Serves #}}', count: r.serves }) : null].filter(Boolean).join(' · ')}</p>
        ) : null}
        {macros.length ? (
          <div data-recipe-macros="" style={{ marginTop: 14, display: 'grid', gridTemplateColumns: `repeat(${macros.length}, minmax(0, 1fr))`, gap: 6 }}>
            {macros.map(([v, label], i) => (
              <div key={i} style={{ padding: '10px 8px', background: t.PAPER2, textAlign: 'center' }}>
                <span style={{ display: 'block', fontFamily: DISPLAY, fontWeight: 600, fontSize: 16 }}>{v}</span>
                {label ? <span style={{ display: 'block', marginTop: 2, fontSize: 11.5, color: ink(0.6) }}>{label}</span> : null}
              </div>
            ))}
          </div>
        ) : null}
        {r.note ? (
          <div style={{ marginTop: 14, display: 'flex', gap: 10, alignItems: 'flex-start' }}>
            {avatar ? <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: 99, objectFit: 'cover' }} /> : null}
            <div style={{ flex: 1, padding: '10px 12px', background: t.PAPER2, borderRadius: '4px 14px 14px 14px', fontSize: 14.5, lineHeight: 1.45 }}>
              <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ACC }}>{tr('profile:trainer.theirNote', { defaultValue: "{name}'s note", name: first })}</span>{r.note}
            </div>
          </div>
        ) : null}
        <div style={{ marginTop: 16, display: 'flex', flexDirection: 'column', gap: 8 }}>
          {canCook ? <button type="button" data-cook-recipe="" onClick={() => onCook(r)} style={{ width: '100%', minHeight: 50, border: 0, background: ACC, color: ON_ACC, fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>{tr('profile:nutri.cookIt', { defaultValue: 'Cook it in Shape' })}</button> : null}
          {!isSelf && ings.length ? (
            <button type="button" data-recipe-list="" onClick={addList} disabled={list === 'busy'} style={{ width: '100%', minHeight: 48, border: `1px solid ${ink(0.3)}`, background: 'transparent', color: t.INK, fontFamily: DISPLAY, fontSize: 14.5, fontWeight: 600, cursor: 'pointer' }}>
              {list === 'busy' ? tr('profile:nutri.staplesAdding', { defaultValue: 'Adding…' }) : list === 'done' ? `✓ ${tr('profile:nutri.ingredientsAdded', { defaultValue: 'On your grocery list, under Eat' })}` : tr('profile:nutri.addIngredients', { defaultValue: 'Add the ingredients to my grocery list' })}
            </button>
          ) : null}
          {list === 'err' ? <p role="alert" style={{ margin: 0, fontSize: 13.5, color: t.RUST || '#c0533b' }}>{tr('profile:nutri.staplesFailed', { defaultValue: "Couldn't add them just now. Try again." })}</p> : null}
        </div>
        {ings.length ? (
          <div data-recipe-ingredients="" style={{ marginTop: 22 }}>
            <span style={eyebrow(ink, MONO)}>{tr('nutrition:myRecipe.ingredients', { defaultValue: 'Ingredients' })}</span>
            <ul style={{ margin: '8px 0 0', padding: 0, listStyle: 'none' }}>
              {ings.map((g, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, padding: '8px 0', borderBottom: `1px solid ${ink(0.1)}`, fontSize: 14.5 }}>
                  <span style={{ width: 76, flex: 'none', fontFamily: MONO, fontSize: 12.5, color: ink(0.7) }}>{g.n || ''}</span><span style={{ flex: 1 }}>{g.m}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {steps.length ? (
          <div data-recipe-method="" style={{ marginTop: 22 }}>
            <span style={eyebrow(ink, MONO)}>{tr('nutrition:myRecipe.method', { defaultValue: 'Method' })}</span>
            <ol style={{ margin: '8px 0 0', padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {steps.map((x, i) => (
                <li key={i} style={{ display: 'flex', gap: 12, fontSize: 14.5, lineHeight: 1.5 }}>
                  <span style={{ width: 24, flex: 'none', fontFamily: MONO, fontSize: 12, color: ACC, paddingTop: 2 }}>{i + 1}</span><span style={{ flex: 1 }}>{x}</span>
                </li>
              ))}
            </ol>
          </div>
        ) : null}
      </div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}

// Shape's cook mode (the client module's BSCookMode) over everything, for one of their recipes.
function CookOverlay({ t, cookable, onClose }) {
  const Cook = window.BSCookMode;
  if (!Cook || !cookable) return null;
  const host = sheetHost();
  const el = (
    <div data-cook-overlay="" style={{ position: 'absolute', inset: 0, zIndex: 240, background: t.PAPER_BG || t.PAPER, overflowY: 'auto', overflowX: 'hidden' }}>
      <Cook cookable={cookable} onClose={onClose} />
    </div>
  );
  return host ? createPortal(el, host) : el;
}

// ── Plate notes (a nutritionist's) ──────────────────────────────────────────────────────────
// The meals they logged and shared, a day to a note: step through the day meal by meal, with the
// protein so far, where the meal's energy came from (protein, carbs, fat) and their note on it. A
// macro the meal did not carry is left out, never shown as 0; a meal cooked from a Shape Kitchen
// recipe opens it.
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Math.round(Number(v)));
// Plate cards grouped by the local day they were shared on, newest day first, each day in the order
// it was eaten.
export function bsPlateNoteDays(plates) {
  const days = new Map();
  for (const pl of plates) {
    const at = Date.parse(pl && pl.created_at);
    const d = Number.isFinite(at) ? new Date(at) : null;
    const key = d ? isoDay(d) : 'undated';
    if (!days.has(key)) days.set(key, { key, at: d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() : -Infinity, meals: [] });
    days.get(key).meals.push({ ...pl, at: d ? d.getTime() : null });
  }
  return [...days.values()].sort((a, b) => b.at - a.at).map((day) => {
    const meals = day.meals.slice().sort((a, b) => (a.at || 0) - (b.at || 0));
    // A day's protein and energy, each only when every meal of the day carried it.
    let so = 0, all = true, kcal = 0, kcalAll = true;
    for (const m of meals) {
      const p = num(m.meal && m.meal.p); if (p == null) all = false; else so += p;
      const k = num(m.meal && m.meal.kcal); if (k == null) kcalAll = false; else kcal += k;
    }
    return { ...day, meals, protein: so, proteinAll: all, kcal: kcalAll ? kcal : null };
  });
}
// Where a meal's energy came from: protein and carbs at 4 kcal a gram, fat at 9. Null unless all three
// were logged.
export function energySplit(m) {
  const p = num(m.p), c = num(m.c), f = num(m.f);
  if (p == null || c == null || f == null) return null;
  const e = [p * 4, c * 4, f * 9], tot = e[0] + e[1] + e[2];
  if (!tot) return null;
  // Whole percentages that add up to 100: each share rounded down, then the points left over go to
  // the largest remainders, so none is ever below 0 or above its share by more than one.
  const exact = e.map((x) => (x / tot) * 100);
  const out = exact.map(Math.floor);
  const order = [0, 1, 2].sort((a, b) => (exact[b] - out[b]) - (exact[a] - out[a]));
  for (let i = 0, left = 100 - out[0] - out[1] - out[2]; i < left; i += 1) out[order[i]] += 1;
  return { p: out[0], c: out[1], f: out[2] };
}
function plateMacros(tr, m) {
  return [
    num(m.p) != null ? tr('cook:ck.gProtein', { defaultValue: '{n} g protein', n: num(m.p) }) : null,
    num(m.c) != null ? tr('profile:nutri.carbs', { defaultValue: '{n} g carbs', n: num(m.c) }) : null,
    num(m.f) != null ? tr('profile:nutri.fat', { defaultValue: '{n} g fat', n: num(m.f) }) : null,
  ].filter(Boolean).join(' · ');
}
// ── About: the coach's story and details, their questions and answers, and their socials ─────
const LINK_NAMES = { instagram: 'Instagram', x: 'X', tiktok: 'TikTok', youtube: 'YouTube', substack: 'Substack' };
function AboutTab({ t, tr, ACC, ink, DISPLAY, MONO, about, prompts, links, isSelf, first, onEdit }) {
  const how = !about || !about.how ? null
    : about.how === 'online' ? tr('profile:about.howOnline', { defaultValue: 'Coaches online' })
    : about.how === 'in_person' ? tr('profile:about.howInPerson', { defaultValue: 'Coaches in person' })
    : tr('profile:about.howBoth', { defaultValue: 'Coaches online and in person' });
  const facts = about ? [
    about.years ? tr('profile:about.years', { defaultValue: '{count, plural, one {Coaching for # year} other {Coaching for # years}}', count: about.years }) : null,
    [how, about.where].filter(Boolean).join(' · ') || null,
    about.languages ? tr('profile:about.languages', { defaultValue: 'Coaches in {languages}', languages: about.languages }) : null,
  ].filter(Boolean) : [];
  const socials = links ? BS_PROFILE_LINK_KEYS.map((k) => [k, links[k] ? bsProfileLinkHref(k, links[k]) : null]).filter(([, href]) => href) : [];
  const head = (text) => <h3 style={{ margin: 0, fontFamily: MONO, fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', color: ink(0.64) }}>{text}</h3>;
  // The sections there is something for, each 26px under the last (the facts 14px under the story).
  const sections = [];
  if (about && about.story) sections.push(['story', 26, <>
    {head(tr('profile:about.title', { defaultValue: 'About {name}', name: first }))}
    {about.story.split(/\n{2,}/).map((para, i) => <p key={i} style={{ margin: '10px 0 0', fontSize: 15.5, lineHeight: 1.55, color: t.INK, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{para}</p>)}
  </>]);
  if (facts.length) sections.push(['facts', sections.length ? 14 : 26, (
    <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {facts.map((f, i) => <li key={i} style={{ padding: '11px 0', borderTop: `1px solid ${ink(0.14)}`, fontSize: 14.5, lineHeight: 1.4, color: t.INK }}>{f}</li>)}
    </ul>
  )]);
  if (prompts.length) sections.push(['qa', 26, <>
    {head(tr('profile:about.qa', { defaultValue: 'In {name}\'s words', name: first }))}
    {prompts.map((p, i) => (
      <div key={i} data-about-answer="" style={{ marginTop: i ? 10 : 12, padding: '12px 14px', background: t.PAPER2, borderLeft: `3px solid ${ACC}` }}>
        <div style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ink(0.66) }}>{bsPromptLabel(p.q, tr)}</div>
        <p style={{ margin: '6px 0 0', fontFamily: DISPLAY, fontSize: 16, lineHeight: 1.4, color: t.INK, whiteSpace: 'pre-line', overflowWrap: 'anywhere' }}>{p.a}</p>
      </div>
    ))}
  </>]);
  if (socials.length) sections.push(['socials', 26, <>
    {head(tr('profile:about.socials', { defaultValue: 'Find {name} online', name: first }))}
    <div style={{ marginTop: 8 }}>
      {socials.map(([k, href]) => (
        <a key={k} data-about-link={k} href={href} target="_blank" rel="noopener noreferrer"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, minHeight: 48, borderTop: `1px solid ${ink(0.14)}`, color: t.INK, textDecoration: 'none' }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 15, fontWeight: 600, flexShrink: 0 }}>{k === 'website' ? tr('profile:editor.link.website', { defaultValue: 'Website' }) : LINK_NAMES[k]}</span>
          <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 14, color: ink(0.72) }}>{bsProfileLinkText(k, links[k])} <span aria-hidden style={{ color: ACC }}>↗</span></span>
        </a>
      ))}
    </div>
  </>]);
  const empty = !sections.length;
  return (
    <section data-about-tab="" style={{ paddingTop: 16 }}>
      {sections.map(([k, gap, node], i) => <div key={k} data-about={k} style={{ marginTop: i ? gap : 0 }}>{node}</div>)}
      {isSelf ? (
        <>
          {empty ? <Hint ink={ink}>{tr('profile:about.emptySelf', { defaultValue: 'Tell members who you are: your story, how you coach, and where to find you.' })}</Hint> : null}
          <button type="button" data-about-edit="" onClick={onEdit} style={{ ...linkBtn(ACC, DISPLAY), marginTop: empty ? 6 : 18 }}>{empty ? tr('profile:about.write', { defaultValue: 'Write About me' }) : tr('profile:about.edit', { defaultValue: 'Edit About me' })} →</button>
        </>
      ) : null}
    </section>
  );
}
function PlateNotesTab({ t, tr, locale, ACC, ink, DISPLAY, MONO, days, isSelf, first, onOpen }) {
  const fmtN = (n) => { try { return n.toLocaleString(locale); } catch (e) { return String(n); } };
  const dayName = (day) => {
    if (!Number.isFinite(day.at)) return tr('profile:nutri.someDay', { defaultValue: 'A day of meals' });
    try { return new Date(day.at).toLocaleDateString(locale, { weekday: 'long', month: 'short', day: 'numeric' }); } catch (e) { return day.key; }
  };
  return (
    <section style={{ paddingTop: 16 }}>
      <p style={{ margin: 0, fontSize: 14, color: ink(0.74) }}>{tr('profile:nutri.plateNotesSub', { defaultValue: 'Days of meals {name} logged and shared. Step through each one.', name: first })}</p>
      <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {days.length ? days.map((day) => {
          return (
            <button key={day.key} type="button" data-plate-day="" onClick={() => onOpen(day)}
              style={{ padding: '12px 14px', border: 0, borderTop: `2px solid ${ACC}`, background: t.PAPER2, color: t.INK, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: ink(0.64) }}>{tr('profile:nutri.dayMeals', { defaultValue: '{count, plural, one {# meal} other {# meals}}', count: day.meals.length })}</span>
              <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 18 }}>{dayName(day)}</span>
              <span style={{ fontSize: 13.5, color: ink(0.74) }}>{day.meals.map((m) => m.title).join(' · ')}</span>
              <span style={{ fontFamily: MONO, fontSize: 11, color: ink(0.62) }}>{[day.proteinAll ? tr('cook:ck.gProtein', { defaultValue: '{n} g protein', n: fmtN(day.protein) }) : null, day.kcal != null ? tr('cook:ck.kcal', { defaultValue: '{n} kcal', n: fmtN(day.kcal) }) : null].filter(Boolean).join(' · ')}</span>
            </button>
          );
        }) : (isSelf ? <Hint ink={ink}>{tr('profile:nutri.plateNotesEmptySelf', { defaultValue: 'Share the meals you log, and each day you share becomes a plate note here.' })}</Hint> : null)}
      </div>
    </section>
  );
}
function PlateNotesSheet({ t, tr, locale, day, i, setI, ACC, DISPLAY, MONO, first, avatar, isSelf, onClose, onWork, onRecipe }) {
  const meals = day.meals;
  const at = Math.max(0, Math.min(meals.length - 1, i));
  const cur = meals[at] || {};
  const m = cur.meal || {};
  const muted = 'rgba(232,235,239,0.6)';
  const fmt = (ms) => { try { return new Date(ms).toLocaleTimeString(locale, { hour: 'numeric', minute: '2-digit' }); } catch (e) { return ''; } };
  // Protein so far: only while every meal up to this one carried its protein.
  let so = 0, known = true;
  for (const x of meals.slice(0, at + 1)) { const p = num(x.meal && x.meal.p); if (p == null) known = false; else so += p; }
  const split = energySplit(m);
  // Protein in the coach's accent, carbs amber (or light ink when the accent is amber), fat dim ink.
  const amberAcc = ['#e3a544', '#c8881a'].includes(String(ACC).toLowerCase());
  const splitColors = { p: ACC, c: amberAcc ? 'rgba(232,235,239,0.85)' : CARB, f: 'rgba(232,235,239,0.4)' };
  const recipe = bsKitchenRecipe(m.recipeId);
  const host = sheetHost();
  const el = (
    <div role="dialog" aria-label={tr('profile:nutri.tabPlateNotes', { defaultValue: 'Plate notes' })} style={{ position: 'absolute', inset: 0, zIndex: 230, background: '#0c0d0f', color: '#e8ebef', overflowY: 'auto', overflowX: 'hidden', fontFamily: t.BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ padding: 'calc(10px + env(safe-area-inset-top)) 8px 0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>{tr('profile:nutri.tabPlateNotes', { defaultValue: 'Plate notes' })} · {(() => { try { return Number.isFinite(day.at) ? new Date(day.at).toLocaleDateString(locale, { weekday: 'long' }) : ''; } catch (e) { return ''; } })()}</span>
        <CloseX onClose={onClose} color="#e8ebef" label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      {/* 22 in from each edge, so the last meal's 44-point target stays on the sheet (as Replays). */}
      <div style={{ margin: '16px 22px 0' }}>
        <div style={{ position: 'relative', height: 22 }}>
          <span aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 10, height: 2, background: 'rgba(232,235,239,0.2)' }} />
          <span aria-hidden style={{ position: 'absolute', left: 0, width: meals.length > 1 ? `${(at / (meals.length - 1)) * 100}%` : '100%', top: 10, height: 2, background: ACC }} />
          {meals.map((x, k) => (
            <button key={k} type="button" onClick={() => setI(k)} aria-label={[x.at ? fmt(x.at) : '', x.title].filter(Boolean).join(', ')}
              style={{ position: 'absolute', left: meals.length > 1 ? `${(k / (meals.length - 1)) * 100}%` : '50%', top: -11, width: 44, height: 44, marginLeft: -22, padding: 0, border: 0, background: 'transparent', cursor: 'pointer' }}>
              <span style={{ position: 'absolute', left: '50%', top: '50%', width: k === at ? 14 : 8, height: k === at ? 14 : 8, transform: 'translate(-50%, -50%)', borderRadius: 99, background: k <= at ? ACC : 'rgba(232,235,239,0.35)' }} />
            </button>
          ))}
        </div>
      </div>
      <div data-plate-step="" style={{ margin: '14px 18px 0', padding: 14, background: '#181a1e', display: 'flex', gap: 14, alignItems: 'center' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{[cur.at ? fmt(cur.at) : '', cur.title].filter(Boolean).join(' · ')}</span>
          <span style={{ display: 'block', marginTop: 6, fontFamily: DISPLAY, fontWeight: 600, fontSize: 28 }}>{num(m.p) != null ? tr('cook:ck.gProtein', { defaultValue: '{n} g protein', n: num(m.p) }) : (num(m.kcal) != null ? tr('cook:ck.kcal', { defaultValue: '{n} kcal', n: num(m.kcal) }) : cur.title)}</span>
          <span style={{ display: 'block', marginTop: 4, fontFamily: MONO, fontSize: 11, color: muted }}>{[num(m.kcal) != null ? tr('cook:ck.kcal', { defaultValue: '{n} kcal', n: num(m.kcal) }) : null, plateMacros(tr, m)].filter(Boolean).join(' · ')}</span>
          {known ? <span data-protein-so-far="" style={{ display: 'block', marginTop: 8, fontSize: 13, color: '#e8ebef' }}>{tr('profile:nutri.proteinSoFar', { defaultValue: 'Protein so far: {n} g', n: so })}</span> : null}
          {split ? (
            <span aria-hidden data-energy-legend="" style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: '4px 10px', fontSize: 11.5, color: muted }}>
              {[['p', 'partProtein', 'Protein'], ['c', 'partCarbs', 'Carbs'], ['f', 'partFat', 'Fat']].map(([k, key, en]) => (
                <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 99, background: splitColors[k] }} />{tr('profile:nutri.' + key, { defaultValue: en })} {tr('profile:nutri.pct', { defaultValue: '{n}%', n: split[k] })}</span>
              ))}
            </span>
          ) : null}
        </div>
        {split ? (
          <span role="img" aria-label={tr('profile:nutri.energySplit', { defaultValue: 'Energy: {p}% protein, {c}% carbs, {f}% fat', p: split.p, c: split.c, f: split.f })}
            style={{ flex: 'none', width: 74, height: 74, borderRadius: 99, background: `conic-gradient(${splitColors.p} 0 ${split.p}%, ${splitColors.c} ${split.p}% ${split.p + split.c}%, ${splitColors.f} ${split.p + split.c}% 100%)`, display: 'grid', placeItems: 'center' }}>
            <span style={{ width: 30, height: 30, borderRadius: 99, background: '#181a1e' }} />
          </span>
        ) : null}
      </div>
      {cur.body ? (
        <div style={{ margin: '12px 18px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {avatar ? <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: 99, objectFit: 'cover' }} /> : null}
          <div style={{ flex: 1, padding: '10px 12px', background: '#181a1e', borderRadius: '4px 14px 14px 14px', fontSize: 14.5, lineHeight: 1.45 }}><span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ACC }}>{tr('profile:trainer.theirNote', { defaultValue: "{name}'s note", name: first })}</span>{cur.body}</div>
        </div>
      ) : null}
      {recipe ? <button type="button" data-plate-recipe="" onClick={() => onRecipe(recipe)} style={{ ...linkBtn(ACC, DISPLAY), margin: '10px 18px 0', display: 'block' }}>{tr('profile:nutri.theRecipe', { defaultValue: 'The recipe' })} →</button> : null}
      <div style={{ margin: '12px 18px 0', display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setI(Math.max(0, at - 1))} disabled={at === 0} style={{ flex: 1, minHeight: 46, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer', opacity: at === 0 ? 0.4 : 1 }}>← {tr('profile:trainer.prev', { defaultValue: 'Previous' })}</button>
        <button type="button" onClick={() => setI(Math.min(meals.length - 1, at + 1))} disabled={at === meals.length - 1} style={{ flex: 1, minHeight: 46, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer', opacity: at === meals.length - 1 ? 0.4 : 1 }}>{tr('profile:trainer.next', { defaultValue: 'Next' })} →</button>
      </div>
      <div style={{ margin: '22px 18px calc(28px + env(safe-area-inset-bottom))', paddingTop: 14, borderTop: '1px solid rgba(232,235,239,0.15)' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{tr('profile:nutri.dayMeals', { defaultValue: '{count, plural, one {# meal} other {# meals}}', count: meals.length })}</span>
        {meals.map((x, k) => (
          <button key={k} type="button" onClick={() => setI(k)} style={{ width: '100%', display: 'flex', gap: 12, padding: '10px 0', border: 0, borderBottom: '1px solid rgba(232,235,239,0.1)', background: 'transparent', color: k === at ? '#e8ebef' : 'rgba(232,235,239,0.75)', fontSize: 14, textAlign: 'left', cursor: 'pointer' }}>
            <span style={{ width: 62, flex: 'none', fontFamily: MONO, fontSize: 12 }}>{x.at ? fmt(x.at) : ''}</span><span style={{ flex: 1 }}>{x.title}</span><span style={{ fontFamily: MONO, fontSize: 12 }}>{num(x.meal && x.meal.p) != null ? tr('profile:nutri.grams', { defaultValue: '{n} g', n: num(x.meal.p) }) : ''}</span>
          </button>
        ))}
        {!isSelf ? <button type="button" onClick={onWork} style={{ marginTop: 16, width: '100%', minHeight: 50, border: 0, background: ACC, color: onColor(ACC), fontWeight: 600, cursor: 'pointer' }}>{tr('profile:nutri.getNotes', { defaultValue: 'Get notes like these on your meals' })}</button> : null}
      </div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}

// ── Replays ─────────────────────────────────────────────────────────────────────────────────
const isVideoFile = (u) => { try { return /\.(mp4|m4v|mov|webm)$/i.test(new URL(u).pathname); } catch (e) { return false; } };
const playBadge = (ACC) => (
  <span aria-hidden style={{ position: 'absolute', left: '50%', top: '50%', width: 48, height: 48, margin: '-24px 0 0 -24px', borderRadius: 99, background: 'rgba(0,0,0,0.55)', border: `2px solid ${ACC}`, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 18, paddingLeft: 3, boxSizing: 'border-box' }}>▶</span>
);
// A video's still: the file's first frame where the link is a file, else a dark panel.
function VideoStill({ url, ACC }) {
  return (
    <span style={{ position: 'absolute', inset: 0, background: `linear-gradient(135deg, #15171b, ${hexA(ACC, 0.35)})` }}>
      {isVideoFile(url) ? <video src={`${url}#t=0.1`} muted playsInline preload="metadata" aria-hidden tabIndex={-1} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', pointerEvents: 'none' }} /> : null}
    </span>
  );
}
const programMeta = (tr, pr) => [
  pr.weeks ? tr('profile:trainer.programWeeks', { defaultValue: '{count, plural, one {# week} other {# weeks}}', count: pr.weeks }) : null,
  pr.perWeek ? tr('profile:trainer.programDays', { defaultValue: '{count, plural, one {# day a week} other {# days a week}}', count: pr.perWeek }) : null,
].filter(Boolean).join(' · ');
const programDays = (pr) => {
  const p = pr.preview;
  if (!p || !Array.isArray(p.units) || !(p.kind === 'program' || p.kind === 'split')) return '';
  return p.units.filter((u) => !u.rest).slice(0, 7).map((u) => [u.label, u.title].filter(Boolean).join(' ')).join(' · ');
};

function ReplaysTab({ t, tr, ACC, ON_ACC, ink, DISPLAY, MONO, programs = [], workouts = [], replays, isSelf, first, onProgram, onOpen, onLog }) {
  const head = (label) => <span style={{ ...eyebrow(ink, MONO), marginTop: 22 }}>{label}</span>;
  return (
    <section style={{ paddingTop: 16 }}>
      <p style={{ margin: 0, fontSize: 14, color: ink(0.74) }}>{tr('profile:trainer.replaysSubAll', { defaultValue: 'The programs {name} sells, workouts on video, and sessions stepped set by set.', name: first })}</p>
      {isSelf ? (
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap' }}>
          <button type="button" data-post-video="" onClick={() => onLog('video')} style={linkBtn(ACC, DISPLAY)}>＋ {tr('profile:trainer.postVideo', { defaultValue: 'Post a workout video' })}</button>
          <button type="button" onClick={() => onLog('workout')} style={linkBtn(ACC, DISPLAY)}>＋ {tr('profile:trainer.logSession', { defaultValue: 'Log a session' })}</button>
        </div>
      ) : null}
      {programs.length ? (
        <div data-programs="">
          {head(tr('profile:trainer.programs', { defaultValue: 'Programs' }))}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 18 }}>
            {programs.map((pr) => {
              const days = programDays(pr);
              const meta = programMeta(tr, pr);
              return (
                <button key={pr.id} type="button" data-program="" onClick={() => onProgram(pr)} style={{ padding: 0, border: 0, background: 'transparent', color: t.INK, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: `linear-gradient(135deg, ${t.PAPER2}, ${hexA(ACC, 0.22)})` }}>
                    {pr.poster ? <img src={pr.poster} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                      : pr.video ? <VideoStill url={pr.video.url} ACC={ACC} />
                        : (
                          <span style={{ position: 'absolute', left: 14, right: 14, bottom: 12, fontFamily: DISPLAY, fontSize: 30, fontWeight: 600, lineHeight: 1.1 }}>
                            {pr.weeks ? tr('profile:trainer.programWeeks', { defaultValue: '{count, plural, one {# week} other {# weeks}}', count: pr.weeks }) : tr('profile:trainer.movesCount', { defaultValue: '{count, plural, one {# move} other {# moves}}', count: pr.moves.length })}
                          </span>
                        )}
                    {pr.video ? playBadge(ACC) : null}
                    {pr.price ? <span style={{ position: 'absolute', right: 10, top: 10, padding: '3px 9px', background: ACC, color: ON_ACC, fontFamily: MONO, fontSize: 11, fontWeight: 700 }}>{pr.price}</span> : null}
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17 }}>{pr.name}</span>
                    {meta || pr.video ? <span style={{ fontSize: 13, color: ink(0.62) }}>{[meta, pr.video ? tr('profile:trainer.previewVideo', { defaultValue: 'Preview video' }) : null].filter(Boolean).join(' · ')}</span> : null}
                    {days ? <span style={{ marginTop: 2, fontFamily: MONO, fontSize: 11, letterSpacing: '0.04em', color: ink(0.72) }}>{days}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : isSelf ? <Hint ink={ink}>{tr('profile:trainer.programsEmptySelf', { defaultValue: 'Publish a program and it shows here with its preview video, for members to buy.' })}</Hint> : null}
      {workouts.length ? (
        <div data-workouts="">
          {head(tr('profile:trainer.workouts', { defaultValue: 'Workouts' }))}
          <div style={{ marginTop: 10, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {workouts.map((w) => (
              <button key={w.key} type="button" data-workout="" onClick={() => onOpen(w)} style={{ padding: 0, border: 0, background: 'transparent', color: t.INK, textAlign: 'left', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <span style={{ position: 'relative', display: 'block', width: '100%', aspectRatio: '16 / 9', overflow: 'hidden', background: '#000' }}>
                  <VideoStill url={w.video.url} ACC={ACC} />
                  {playBadge(ACC)}
                  {w.ago ? <span style={{ position: 'absolute', right: 10, top: 10, padding: '2px 8px', background: hexA('#000000', 0.55), color: '#fff', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em' }}>{bsShortAge(w.ago, tr)}</span> : null}
                </span>
                <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                  <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17 }}>{w.title || tr('profile:trainer.workoutVideo', { defaultValue: 'Workout video' })}</span>
                  {w.body ? <span style={{ fontSize: 13, color: ink(0.62), display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{w.body}</span> : null}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {replays.length ? (
        <div data-sessions="">
          {programs.length || workouts.length ? head(tr('profile:trainer.sessions', { defaultValue: 'Sessions' })) : null}
          <div style={{ marginTop: 12, display: 'flex', flexDirection: 'column', gap: 16 }}>
            {replays.map((r) => {
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
                    <span style={{ position: 'absolute', right: 10, top: 10, padding: '2px 8px', background: hexA('#000000', 0.55), color: '#fff', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em' }}>{bsShortAge(r.ago, tr)}</span>
                  </span>
                  <span style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.35 }}>
                    <span style={{ fontFamily: DISPLAY, fontWeight: 600, fontSize: 17 }}>{r.title}</span>
                    {stats.length ? <span style={{ fontSize: 13, color: ink(0.6) }}>{stats.join(' · ')}</span> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      {isSelf && !workouts.length && !replays.length ? <Hint ink={ink}>{tr('profile:trainer.replaysEmptySelf', { defaultValue: 'Log a session and share it, and it shows here with every set.' })}</Hint> : null}
    </section>
  );
}

// A program opened from Replays or the studio: its free preview video, weeks and days, the first
// week's days with their moves' names (all a public preview gives), the pieces of the coach's floor
// its moves use, and Buy. A sample program has no Buy.
function ProgramSheet({ t, tr, pr, ACC, DISPLAY, MONO, first, isSelf, studio, work = [], onClose, onBuy, onWork }) {
  const muted = 'rgba(232,235,239,0.6)';
  const p = pr.preview || { units: [], kind: null };
  const units = Array.isArray(p.units) ? p.units.filter((u) => u && !u.locked && !u.rest) : [];
  const where = studio ? [...new Set(studio.items.map((q, k) => (q.t !== 'zone' && work[k] && work[k].programs.some((x) => x.id === pr.id) ? pieceName(q, tr) : null)).filter(Boolean))].slice(0, 8) : [];
  const meta = programMeta(tr, pr);
  const host = sheetHost();
  const el = (
    <div role="dialog" aria-label={pr.name} data-program-sheet="" style={{ position: 'absolute', inset: 0, zIndex: 230, background: '#0c0d0f', color: '#e8ebef', overflowY: 'auto', overflowX: 'hidden', fontFamily: t.BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ padding: 'calc(10px + env(safe-area-inset-top)) 8px 0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>{tr('profile:trainer.program', { defaultValue: 'Program' })}{pr.price ? ` · ${pr.price}` : ''}</span>
        <CloseX onClose={onClose} color="#e8ebef" label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      <h2 style={{ margin: '0 18px', fontFamily: DISPLAY, fontWeight: 300, fontSize: 25, lineHeight: 1.1 }}>{pr.name}<span style={{ color: ACC }}>.</span></h2>
      {meta ? <p style={{ margin: '4px 18px 0', fontSize: 13.5, color: muted }}>{meta}</p> : null}
      {pr.video ? <div data-program-video="" style={{ margin: '4px 18px 0' }}><ShapeVideoPlayer value={pr.video} title={pr.name} expanded /></div>
        : pr.poster ? <div style={{ margin: '12px 18px 0', aspectRatio: '16 / 9', overflow: 'hidden', background: '#000' }}><img src={pr.poster} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div> : null}
      {units.length ? (
        <div style={{ margin: '14px 18px 0' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{p.kind === 'program' || p.kind === 'split' ? tr('profile:trainer.firstWeek', { defaultValue: 'The first week' }) : tr('profile:trainer.theMoves', { defaultValue: 'The moves' })}</span>
          {units.slice(0, 14).map((u, k) => (
            <div key={k} data-program-day="" style={{ padding: '9px 0', borderBottom: '1px solid rgba(232,235,239,0.1)' }}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                {u.label ? <span style={{ flexShrink: 0, minWidth: 40, fontFamily: MONO, fontSize: 10.5, letterSpacing: '0.08em', color: ACC }}>{u.label}</span> : null}
                <span style={{ fontSize: 15 }}>{u.title}</span>
              </div>
              {Array.isArray(u.moves) && u.moves.length ? <div style={{ marginTop: 3, paddingLeft: u.label ? 50 : 0, fontSize: 13, lineHeight: 1.45, color: 'rgba(232,235,239,0.72)' }}>{u.moves.concat(u.more > 0 ? [`＋${u.more}`] : []).join(' · ')}</div> : null}
            </div>
          ))}
        </div>
      ) : null}
      {p.namesOnly ? <p style={{ margin: '10px 18px 0', fontFamily: MONO, fontSize: 10, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted }}>{tr('marketplace:preview.namesOnly', { defaultValue: 'Sets, loads, cues and exercise videos unlock when you buy' })}</p> : null}
      {p.note ? <p style={{ margin: '12px 18px 0', paddingLeft: 10, borderLeft: `3px solid ${ACC}`, fontSize: 14.5, lineHeight: 1.5 }}>{p.note}</p> : null}
      {where.length ? (
        <div data-program-where="" style={{ margin: '14px 18px 0' }}>
          <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{tr('profile:trainer.programWhere', { defaultValue: 'On {name}\'s floor', name: first })}</span>
          <p style={{ margin: '4px 0 0', fontSize: 14, lineHeight: 1.5 }}>{where.join(' · ')}</p>
        </div>
      ) : null}
      <div style={{ margin: '20px 18px calc(28px + env(safe-area-inset-bottom))' }}>
        {isSelf ? <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45, color: muted }}>{tr('profile:trainer.programSelf', { defaultValue: 'This is what members see before they buy.' })}</p>
          : pr.sample ? <button type="button" onClick={onWork} style={{ width: '100%', minHeight: 50, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.workTitle', { defaultValue: 'Work with {name}', name: first })}</button>
            : pr.paid ? <button type="button" data-program-buy="" onClick={onBuy} style={{ width: '100%', minHeight: 50, border: 0, background: ACC, color: onColor(ACC), fontWeight: 700, cursor: 'pointer' }}>{tr('marketplace:preview.buy', { defaultValue: 'Buy · {price} →', price: pr.price })}</button>
              : <button type="button" onClick={onWork} style={{ width: '100%', minHeight: 50, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer' }}>{tr('profile:trainer.workTitle', { defaultValue: 'Work with {name}', name: first })}</button>}
      </div>
    </div>
  );
  return host ? createPortal(el, host) : el;
}

function ReplaySheet({ t, tr, r, i, setI, ACC, DISPLAY, MONO, first, avatar, isSelf, onClose, onWork }) {
  // A session steps through its sets; a workout video may have none (then it is the video and the note).
  const rows = r.breakdown && Array.isArray(r.breakdown.rows) ? r.breakdown.rows : [];
  const video = r.video && typeof r.video === 'object' ? r.video : typeof r.video === 'string' && r.video ? { url: r.video, type: 'video' } : null;
  const at = Math.max(0, Math.min(rows.length - 1, i));
  const cur = rows[at] || [];
  const muted = 'rgba(232,235,239,0.6)';
  const host = sheetHost();
  const el = (
    <div role="dialog" aria-label={r.title} style={{ position: 'absolute', inset: 0, zIndex: 230, background: '#0c0d0f', color: '#e8ebef', overflowY: 'auto', overflowX: 'hidden', fontFamily: t.BODY, WebkitFontSmoothing: 'antialiased' }}>
      <div style={{ padding: 'calc(10px + env(safe-area-inset-top)) 8px 0 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: muted }}>{rows.length ? tr('profile:trainer.replay', { defaultValue: 'Replay' }) : tr('profile:trainer.workout', { defaultValue: 'Workout' })}{r.typeLabel ? ` · ${r.typeLabel}` : ''}{r.ago ? ` · ${bsShortAge(r.ago, tr)}` : ''}</span>
        <CloseX onClose={onClose} color="#e8ebef" label={tr('profile:trainer.close', { defaultValue: 'Close' })} />
      </div>
      <h2 style={{ margin: '0 18px', fontFamily: DISPLAY, fontWeight: 300, fontSize: 25, lineHeight: 1.1 }}>{r.title}<span style={{ color: ACC }}>.</span></h2>
      {video ? <div data-replay-video="" style={{ margin: '4px 18px 0' }}><ShapeVideoPlayer value={video} title={r.title} expanded /></div>
        : r.photo ? <div style={{ margin: '12px 18px 0', height: 220, overflow: 'hidden', background: '#000' }}><img src={r.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /></div> : null}
      {/* The step track sits 22 in from each edge, half a dot's 44-point target, so the last
          target stays on the sheet and it never scrolls sideways. */}
      {rows.length ? <div style={{ margin: '16px 22px 0' }}>
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
      </div> : null}
      {rows.length ? <div style={{ margin: '14px 18px 0', padding: 14, background: '#181a1e' }}>
        <span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: at === rows.length - 1 ? ACC : muted }}>{cur[0]}</span>
        <span style={{ display: 'block', marginTop: 6, fontFamily: DISPLAY, fontWeight: 600, fontSize: 32 }}>{cur[1]}</span>
        {cur[2] ? <span style={{ display: 'block', marginTop: 4, fontFamily: MONO, fontSize: 11, color: muted }}>{cur[2]}</span> : null}
      </div> : null}
      {r.body ? (
        <div style={{ margin: '12px 18px 0', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          {avatar ? <img src={avatar} alt="" style={{ width: 30, height: 30, borderRadius: 99, objectFit: 'cover' }} /> : null}
          <div style={{ flex: 1, padding: '10px 12px', background: '#181a1e', borderRadius: '4px 14px 14px 14px', fontSize: 14.5, lineHeight: 1.45 }}><span style={{ display: 'block', fontFamily: MONO, fontSize: 10, letterSpacing: '0.12em', textTransform: 'uppercase', color: ACC }}>{tr('profile:trainer.theirNote', { defaultValue: "{name}'s note", name: first })}</span>{r.body}</div>
        </div>
      ) : null}
      {rows.length ? <div style={{ margin: '12px 18px 0', display: 'flex', gap: 8 }}>
        <button type="button" onClick={() => setI(Math.max(0, at - 1))} disabled={at === 0} style={{ flex: 1, minHeight: 46, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer', opacity: at === 0 ? 0.4 : 1 }}>← {tr('profile:trainer.prev', { defaultValue: 'Previous' })}</button>
        <button type="button" onClick={() => setI(Math.min(rows.length - 1, at + 1))} disabled={at === rows.length - 1} style={{ flex: 1, minHeight: 46, border: '1px solid rgba(232,235,239,0.25)', background: 'transparent', color: '#e8ebef', fontWeight: 600, cursor: 'pointer', opacity: at === rows.length - 1 ? 0.4 : 1 }}>{tr('profile:trainer.next', { defaultValue: 'Next' })} →</button>
      </div> : null}
      <div style={{ margin: '22px 18px calc(28px + env(safe-area-inset-bottom))', paddingTop: rows.length ? 14 : 0, borderTop: rows.length ? '1px solid rgba(232,235,239,0.15)' : 0 }}>
        {rows.length ? <span style={{ fontFamily: MONO, fontSize: 10, letterSpacing: '0.14em', textTransform: 'uppercase', color: muted }}>{r.breakdown.label}</span> : null}
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
