// A coach's spotlight (owner, 2026-11-04: "Show them on coach pages"): the intro film, the headline
// stats, the pinned highlight, the profile song, the wins wall and the practice card's hours and
// handle, which the old editors wrote and no coach page showed. MOUNTED: Make it yours
// (mobile-app/src/broadsheet/BSMakeItYours.jsx) and the coach page (BSTrainerProfile.jsx) in the real
// broadsheet chrome, against scripted profile, listing, review and upload backends, reading the real
// English catalogs (a key missing from them fails here rather than falling back to English).
//
// What it pins: each part is offered in its own role's editor (a trainer's stats are a trainer's
// figures, a nutritionist's a nutritionist's) and saved cleaned, onto the doc as it is at save time,
// with every key the coach did not change kept as stored; what the page could not keep is said at
// save rather than dropped; and the page shows each part when it is set and nothing when it is not,
// a film only as the coach's own upload, a pinned review only as one of their members'.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { BS_SUPABASE_HOST } from '../public/newdesign/listingMedia.mjs';
import { bsSpotifyEmbed, bsProfileSong, bsProfilePinned, bsProfileHeroStats, bsNormalizeProfileCustom } from '../mobile-app/src/services/profileCustom.mjs';
import { BS_COACH_STATS, bsCoachStatFigures, bsCoachHeadline, bsCoachHeadlineKeys } from '../mobile-app/src/services/coachWork.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { JSDOM } = require_('jsdom');
const { IntlMessageFormat } = require_('intl-messageformat');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
globalThis.localStorage = dom.window.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const React = require_('react');
const { act } = React;
const ReactDOMClient = require_('react-dom/client');

const CATS = {};
const EN = join(ROOT, 'mobile-app/src/i18n/catalogs/en');
for (const f of readdirSync(EN)) if (f.endsWith('.json')) CATS[f.replace(/\.json$/, '')] = JSON.parse(readFileSync(join(EN, f), 'utf8'));
window.ShapeI18n = {
  t: (key, opts = {}) => {
    const [ns, k] = key.includes(':') ? key.split(/:(.*)/s) : ['common', key];
    assert.ok(CATS[ns] && k in CATS[ns], `${key} is not in the English catalogs`);
    return new IntlMessageFormat(CATS[ns][k], 'en-US').format(opts);
  },
  intlLocale: () => 'en-US',
};

const flush = () => act(async () => { for (let i = 0; i < 8; i++) await new Promise((r) => setTimeout(r, 0)); });
async function mount(el) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await act(async () => { root.render(el); });
  await flush();
  return { text: () => document.body.textContent.replace(/\s+/g, ' '), unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const click = async (el) => { assert.ok(el, 'no such element'); await act(async () => { el.dispatchEvent(new window.MouseEvent('click', { bubbles: true })); }); await flush(); };
const type = async (el, text) => {
  assert.ok(el, 'no such field');
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, text);
    el.dispatchEvent(new window.Event('input', { bubbles: true }));
  });
  await flush();
};
// A file picked in a hidden <input type="file">.
const pick = async (input, file) => {
  assert.ok(input, 'no file input');
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await act(async () => { input.dispatchEvent(new window.Event('change', { bubbles: true })); });
  await flush();
};
const fileOf = (name, type, size = 1024) => ({ name, type, size });
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];
const button = (re) => $$('button').find((b) => re.test(b.textContent) || re.test(b.getAttribute('aria-label') || ''));
// The Climb (BSCoachClimb.jsx): the page's sections are camps on one page.
const camp = (k) => document.querySelector(`[data-climb-camp="${k}"]`);
const editorTab = (name) => click([...$$('[data-make-it-yours] [role="group"]')[0].querySelectorAll('button')].find((b) => b.textContent === name));

await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), { registry: new Map([['react', React]]) });
const reg = () => new Map([['react', React], ['react-dom', require_('react-dom')]]);
const { BSMakeItYours } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSMakeItYours.jsx'), { registry: reg() });
const { BSTrainerProfile } = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSTrainerProfile.jsx'), { registry: reg() });

// ── The doc's parts ──────────────────────────────────────────────────────────────────────────
const media = (bucket, uid, rest) => `https://${BS_SUPABASE_HOST}/storage/v1/object/public/${bucket}/${uid}/${rest}`;
const FILM = media('coach-media', 'u-maya', '1730-intro.mp4');
const SONG = 'https://open.spotify.com/track/2KH16WveTQWT6KOG9Rg6e2?si=abc';
const EMBED = 'https://open.spotify.com/embed/track/2KH16WveTQWT6KOG9Rg6e2';
const R1 = '11111111-1111-4111-8111-111111111111', R2 = '22222222-2222-4222-8222-222222222222';
const R3 = '33333333-3333-4333-8333-333333333333', R4 = '44444444-4444-4444-8444-444444444444', R5 = '55555555-5555-4555-8555-555555555555';
const review = (id, over = {}) => ({ id, author: 'Priya S.', rating: 10, text: `Review ${id.slice(0, 2)}`, ownerId: 'u-maya', authorId: `m-${id.slice(0, 2)}`, ...over });
// The coach's latest reviews: two members', one the coach wrote themself, one with no words.
const LATEST = [review(R1, { text: '+60 lb on my deadlift in 14 weeks.' }), review(R2, { author: 'Marcus L.', rating: 9, text: 'Books up fast. Worth it.' }),
  review(R3, { authorId: 'u-maya', text: 'My own words about me.' }), review(R4, { text: '   ' })];
// A pin older than the latest page, read by id; and another coach's review, which never resolves here.
const OLD = review(R5, { author: 'Dana K.', text: 'An old favourite.' });
const FULL = {
  film: { url: FILM, caption: 'How I coach a squat, start to finish.' },
  heroStats: ['rating', 'years', 'replays'],
  pinned: { kind: 'win', title: 'Client deadlift: twice her bodyweight', note: 'Fourteen weeks, no missed sessions.', metric: '2×BW' },
  song: { url: SONG, label: 'Warm-up anthem' },
  pinnedReviews: [R5, R2],
  bizCard: { name: 'Iron Path Strength', where: 'Austin, TX', hours: 'Mon–Sat · by appointment', handle: '@ironpath' },
  about: { years: 7 },
};

// ── The world the editor and the page read ───────────────────────────────────────────────────
let world;
function reset(over = {}) {
  world = {
    me: 'u-maya', custom: null, stored: {}, saved: null, onSaved: null, canView: true, uploaded: null, uploadFails: false,
    latest: LATEST, byIds: [OLD, review(R2, { author: 'Marcus L.', rating: 9, text: 'Books up fast. Worth it.' }), review('66666666-6666-4666-8666-666666666666', { ownerId: 'u-other' })],
    reviewsFor: [], byIdsFor: [], posts: [{ key: 's1', title: 'Squat day', breakdown: { label: 'Sets', rows: [['Set 1', '100 kg × 5', 'RPE 8']] } }],
    provider: { id: 7, owner_id: 'u-maya', price: 180, specialty: 'Strength coach', verified: true, credential: 'NSCA-CSCS', listing_media: { cover: null, gallery: [] }, monthly_offer: { includes: [] } },
    ...over,
  };
}
reset();
window.ShapeAuth = { getCachedState: () => ({ user: world.me ? { id: world.me } : null }) };
window.ShapeProfiles = { getPublicProfile: async () => ({ name: 'Maya Okafor', pronouns: 'she/her', bio: 'I teach people to lift well.', points: 6200, custom: world.custom, can_view: world.canView }) };
window.ShapeCoachListing = { publicByOwner: async () => world.provider, publicById: async () => null };
window.ShapeCoachAvailability = { get: async () => ({ slots: [], booked: [], busy: [], rules: {}, timezone: 'America/New_York', atCapacity: false }) };
window.ShapeCoachReviews = {
  forOwner: async (id) => { world.reviewsFor.push(id); return { reviews: world.latest, avg: 9.47, count: 12 }; },
  byIds: async (ids) => { world.byIdsFor.push(ids); return { reviews: world.byIds.filter((r) => ids.split(',').includes(r.id) || r.ownerId === 'u-other') }; },
};
window.ShapeCoachPlans = { salePlansByUser: async () => [] };
window.ShapeFollows = { stats: async () => ({ isFollowing: false, isPending: false }), toggle: async () => ({ isFollowing: true }), getCached: () => null };
window.ShapeCommunity = { listByAuthor: async () => ({ data: world.posts }) };
window.ShapeCoachMedia = { upload: async (file, opts) => { if (world.uploadFails) throw new Error('offline'); world.uploaded = { file, opts }; return { url: media('coach-media', 'u-maya', `9-${file.name}`), type: 'video' }; } };
window.shapeDb = {
  getUserGoals: async (k, opts) => (opts && opts.expectedUserId != null && opts.expectedUserId !== world.me ? null : world.stored),
  saveUserGoals: async (k, d, opts) => { world.saved = { k, d, opts }; return { ok: true }; },
};
window.bsProfileCardFromPost = (p) => p;
window.useBSCoachCommerce = () => ({ commerce: null, commerceCoach: null, atCapacity: false, wl: null });

const editor = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSMakeItYours, { role: 'trainer', ownerUid: 'u-maya', initial: world.stored, who: { name: 'Maya Okafor', first: 'Maya' },
    figures: { rating: 9.5, reviews: 12, programs: 2, replays: 3 }, onClose: () => {}, onSaved: (doc, changed) => { world.onSaved = { doc, changed }; }, ...props }));
const maya = { userId: 'u-maya', who: 'Maya Okafor', kind: 'TRAINER' };
const page = (props = {}) => React.createElement(window.BSProvider, { paperMode: 'dark', accentKey: 'teal' },
  React.createElement(BSTrainerProfile, { person: maya, onBack: () => {}, onMessage: () => {}, ...props }));
const SPOT = ['[data-coach-stats]', '[data-coach-highlight]', '[data-coach-film]', '[data-coach-spotlight]', '[data-review-pinned]'];

// ── The cleaners ─────────────────────────────────────────────────────────────────────────────
test('the cleaners: a song Spotify can play, a highlight with a headline, and a coach\'s own stats', () => {
  assert.equal(bsSpotifyEmbed(SONG), EMBED, 'the embed is rebuilt from the kind and the id alone');
  assert.equal(bsSpotifyEmbed('https://open.spotify.com/intl-de/playlist/37i9dQZF1DX76Wlfdnj7AP'), 'https://open.spotify.com/embed/playlist/37i9dQZF1DX76Wlfdnj7AP');
  for (const junk of ['https://music.apple.com/us/album/1', 'javascript:alert(1)', 'open.spotify.com/user/x', '', null, 42, `https://open.spotify.com/track/${'a'.repeat(3000)}`]) assert.equal(bsSpotifyEmbed(junk), null, String(junk).slice(0, 40));
  assert.deepEqual(bsProfileSong({ url: ` ${SONG} `, label: 'Warm-up anthem', extra: 1 }), { url: SONG, label: 'Warm-up anthem' });
  assert.equal(bsProfileSong({ url: 'https://example.com/song', label: 'x' }), null);
  assert.equal(bsProfileSong('x'), null);
  assert.equal(bsProfilePinned({ title: '  ', note: 'A note' }), null, 'no headline, no card');
  const pinned = bsProfilePinned({ kind: 'Win', title: 'T'.repeat(120), note: 'n', metric: 'M'.repeat(40), x: 1 });
  assert.deepEqual(Object.keys(pinned), ['kind', 'title', 'note', 'metric']);
  assert.equal(pinned.kind, 'win', 'a legacy English kind is its token');
  assert.equal(pinned.title.length, 80);
  assert.equal(pinned.metric.length, 24);
  assert.deepEqual(bsProfileHeroStats(['a', 'a', 7, 'b', 'c', 'd']), ['a', 'b', 'c']);
  assert.deepEqual(bsProfileHeroStats(['score', 'rating'], ['rating']), ['rating']);
  // Sessions coached and active clients (2026-11-09): figures Shape records, shown only when public.
  assert.deepEqual(BS_COACH_STATS.trainer, ['rating', 'reviews', 'years', 'sessions', 'clients', 'programs', 'workouts', 'replays', 'certs']);
  assert.deepEqual(BS_COACH_STATS.nutritionist, ['rating', 'reviews', 'years', 'sessions', 'clients', 'recipes', 'plates', 'certs']);
  const figs = bsCoachStatFigures({ reviews: { avg: 9.47, count: 12 }, years: 7, programs: 2, workouts: 0, replays: 3, recipes: 4, certs: null });
  assert.deepEqual(figs, { rating: 9.5, reviews: 12, years: 7, programs: 2, replays: 3, recipes: 4 }, 'a figure of none is absent, never 0');
  assert.deepEqual(bsCoachStatFigures({ reviews: { avg: 0, count: 0 } }), {}, 'no reviews: no rating and no count');
  // The old editors saved Score, tier and streak when nothing was picked: none is a coach's figure.
  assert.deepEqual(bsCoachHeadline(['score', 'tier', 'streak'], 'trainer', { ...figs, score: 1 }), []);
  assert.deepEqual(bsCoachHeadline(['recipes', 'rating', 'certs'], 'trainer', figs), [{ key: 'rating', value: 9.5 }], 'a nutritionist\'s stat is not a trainer\'s, and one with no figure stays off');
  assert.deepEqual(bsCoachHeadline(['recipes', 'rating'], 'nutritionist', figs).map((s) => s.key), ['recipes', 'rating'], 'in the coach\'s order');
  assert.deepEqual(bsCoachHeadlineKeys(['rating', 'rating', 'reviews', 'years', 'programs'], 'trainer'), ['rating', 'reviews', 'years'], 'three at most, each once');
  // The doc's normalizer still passes these keys through as stored: the member editors write them too.
  const doc = { song: { url: 'x' }, pinned: { title: '' }, heroStats: ['streak'] };
  assert.deepEqual(bsNormalizeProfileCustom(doc, 'u1'), doc);
});

// ── Make it yours ────────────────────────────────────────────────────────────────────────────
test('Make it yours → Spotlight offers each part, and saves them onto the doc as it is at save time', async () => {
  // What the coach's doc held when the editor opened: their colours, About, kitchen-free trainer keys,
  // a card with a name and a place, and the stats an older editor saved by default.
  const opened = { look: { paper: 'bone', accent: 'rust', focus: 'center' }, about: { story: 'Ten years on the floor.' }, bio: 'Kept', heroStats: ['score', 'tier', 'streak'],
    bizCard: { name: 'Iron Path Strength', where: 'Austin, TX' }, prompts: [{ q: 'philosophy', a: 'Lift often.' }] };
  reset({ stored: opened });
  const m = await mount(editor());
  const tabs = [...$$('[data-make-it-yours] [role="group"]')[0].querySelectorAll('button')].map((b) => b.textContent);
  assert.deepEqual(tabs, ['Colors', 'Wall photo', 'Programs', 'Spotlight', 'About me']);
  await editorTab('Spotlight');
  assert.match(m.text(), /Your spotlight\.\s?An intro film, your headline numbers, a highlight, your song and the reviews you pin\. All optional\./);
  for (const sel of ['[data-spot-film]', '[data-spot-stats]', '[data-spot-pin]', '[data-spot-song]', '[data-spot-wins]']) assert.ok($(sel), sel);
  assert.ok(!$('[data-save-mine]'), 'opening Spotlight changes nothing');

  // Headline stats: a trainer's own figures, each with its number now; the older default opens unticked.
  assert.deepEqual($$('[data-stat]').map((b) => b.getAttribute('data-stat')), BS_COACH_STATS.trainer);
  assert.deepEqual($$('[data-stat][aria-pressed="true"]'), [], 'Score, tier and streak are no coach figure');
  const fig = (k) => $(`[data-stat="${k}"] [data-stat-figure]`).textContent;
  assert.equal(fig('rating'), '9.5/10');
  assert.equal(fig('reviews'), '12');
  assert.equal(fig('years'), 'None yet');
  for (const k of ['rating', 'replays', 'programs']) await click($(`[data-stat="${k}"]`));
  await click($('[data-stat="reviews"]'));
  assert.equal($('[data-stat="reviews"]').getAttribute('aria-pressed'), 'false', 'a fourth is refused');
  assert.match($('[data-spot-stats] [role="alert"]').textContent, /Up to 3 headline stats\. Untick one to pick another\./);
  assert.match($('[data-spot-stats]').firstChild.textContent, /3 of 3/);

  // The film: only the types the page keeps, under the bucket's 200 MB, the coach's own upload.
  const film = $('[data-spot-film] input[type="file"]');
  await pick(film, fileOf('cover.png', 'image/png'));
  assert.match($('[data-spot-film-err]').textContent, /Pick an MP4, MOV or WebM video\./);
  await pick(film, fileOf('long.mp4', 'video/mp4', 201 * 1024 * 1024));
  assert.match($('[data-spot-film-err]').textContent, /keep it under 200 MB/);
  assert.equal(world.uploaded, null, 'nothing uploads to be dropped');
  world.uploadFails = true;
  await pick(film, fileOf('intro.mp4', 'video/mp4'));
  assert.match($('[data-spot-film-err]').textContent, /Could not upload film\./);
  world.uploadFails = false;
  await pick(film, fileOf('intro.mov', ''));
  assert.deepEqual(world.uploaded.opts, { videoOnly: true }, 'a blank type is read by its extension, and uploaded as a video');
  assert.ok(!$('[data-spot-film-err]'));
  assert.equal($('[data-spot-film-video]').getAttribute('src'), media('coach-media', 'u-maya', '9-intro.mov'));
  await type($('[data-spot-film-caption]'), 'How I coach a squat.');

  // The highlight: a kind, a headline, a line and a metric.
  await click($('[data-pin-kind="workout"]'));
  await type($('[data-pin-title]'), 'Three plates on the squat');
  await type($('[data-pin-note]'), 'Filmed in the studio.');
  await type($('[data-pin-metric]'), '140 kg');

  // The song: checked as it is typed, with its player under it.
  await type($('[data-song-url]'), 'https://music.apple.com/us/album/1');
  assert.match($('[data-song-err]').textContent, /Paste a Spotify track or playlist link/);
  assert.ok(!$('[data-song-preview]'));
  await type($('[data-song-url]'), SONG);
  assert.ok(!$('[data-song-err]'));
  assert.equal($('[data-song-preview] iframe').getAttribute('src'), EMBED);
  await type($('[data-song-label]'), 'Warm-up anthem');

  // The wins wall: the coach's members' reviews with words, never their own.
  assert.deepEqual(world.reviewsFor, ['u-maya']);
  assert.deepEqual($$('[data-spot-review]').map((b) => b.getAttribute('data-spot-review')), [R1, R2], 'not their own review, nor one with no words');
  await click($(`[data-spot-review="${R2}"]`));
  await click($(`[data-spot-review="${R1}"]`));
  assert.match($('[data-spot-wins]').firstChild.textContent, /2 of 3/);
  assert.match($(`[data-spot-review="${R2}"]`).textContent, /✓ Pinned · ★ 9\/10 · Marcus L\./);

  // About me: the practice's card, with the name and place it had.
  await editorTab('About me');
  assert.equal($('[data-about-biz="name"]').value, 'Iron Path Strength');
  assert.equal($('[data-about-biz="where"]').value, 'Austin, TX');
  await type($('[data-about-biz="hours"]'), 'Mon–Sat · by appointment');
  await type($('[data-about-biz="handle"]'), '@ironpath');
  assert.match($('[data-about-practice-hint]').textContent, /Its name and place show under your name/);

  // Saved since the editor opened, elsewhere: kept.
  world.stored = { ...opened, bio: 'Changed elsewhere', links: { instagram: '@maya' } };
  await click($('[data-save-mine]'));
  const doc = world.saved.d;
  assert.deepEqual(world.saved.opts, { expectedUserId: 'u-maya' });
  assert.deepEqual(doc.film, { url: media('coach-media', 'u-maya', '9-intro.mov'), caption: 'How I coach a squat.' });
  assert.deepEqual(doc.heroStats, ['rating', 'replays', 'programs'], 'in the order picked');
  assert.deepEqual(doc.pinned, { kind: 'workout', title: 'Three plates on the squat', note: 'Filmed in the studio.', metric: '140 kg' });
  assert.deepEqual(doc.song, { url: SONG, label: 'Warm-up anthem' });
  assert.deepEqual(doc.pinnedReviews, [R2, R1]);
  assert.deepEqual(doc.bizCard, { name: 'Iron Path Strength', where: 'Austin, TX', hours: 'Mon–Sat · by appointment', handle: '@ironpath' });
  for (const k of ['look', 'about', 'prompts']) assert.deepEqual(doc[k], opened[k], `${k}: as stored`);
  assert.equal(doc.bio, 'Changed elsewhere');
  assert.deepEqual(doc.links, { instagram: '@maya' });
  await m.unmount();
});

test('Spotlight says what the page could not keep, and writes no key the coach did not change', async () => {
  const opened = { song: { url: SONG, label: 'Old label' }, pinned: { kind: 'pr', title: 'Old pin', note: '', metric: '', extra: 'legacy' }, film: { url: FILM, caption: 'Old' },
    pinnedReviews: [R1], bizCard: { name: 'Iron Path', where: '', hours: '', handle: '' }, heroStats: ['rating'] };
  reset({ stored: opened });
  let m = await mount(editor({ startTab: 'spotlight' }));
  assert.equal($('[data-spot-film-video]').getAttribute('src'), FILM, 'it opens on their film');
  assert.equal($('[data-song-url]').value, SONG);
  assert.equal($('[data-pin-title]').value, 'Old pin');
  assert.equal($('[data-pin-kind="pr"]').getAttribute('aria-pressed'), 'true');
  assert.equal($('[data-stat="rating"]').getAttribute('aria-pressed'), 'true');
  assert.equal($(`[data-spot-review="${R1}"]`).getAttribute('aria-pressed'), 'true');
  // A song the page could not play is said at save, on Spotlight.
  await type($('[data-song-url]'), 'https://example.com/a-song');
  await click($('[data-save-mine]'));
  assert.equal(world.saved, null);
  assert.match($('[data-save-bar] [role="alert"]').textContent, /Paste a Spotify track or playlist link/);
  await type($('[data-song-url]'), SONG);
  // So is a highlight with words but no headline.
  await type($('[data-pin-title]'), '');
  await type($('[data-pin-note]'), 'Just a note');
  await click($('[data-save-mine]'));
  assert.equal(world.saved, null);
  assert.match($('[data-save-bar] [role="alert"]').textContent, /Give your highlight a headline, or clear it\./);
  await click($('[data-pin-clear]'));
  // And a card with hours but no name, on About me.
  await editorTab('About me');
  await type($('[data-about-biz="name"]'), '');
  await type($('[data-about-biz="hours"]'), 'Mornings');
  await click($('[data-save-mine]'));
  assert.equal(world.saved, null);
  assert.match($('[data-save-bar] [role="alert"]').textContent, /Give your practice a name, or clear its card\./);
  await type($('[data-about-biz="hours"]'), '');
  // Emptied, each key goes; one the coach left alone is kept byte for byte.
  await editorTab('Spotlight');
  await click($('[data-stat="rating"]'));
  await click($('[data-save-mine]'));
  let doc = world.saved.d;
  for (const k of ['heroStats', 'pinned', 'bizCard']) assert.ok(!(k in doc), `${k}: emptied, dropped`);
  for (const k of ['song', 'film', 'pinnedReviews']) assert.deepEqual(doc[k], opened[k], `${k}: as stored`);
  await m.unmount();

  // Changed and put back: nothing to save.
  reset({ stored: opened });
  m = await mount(editor({ startTab: 'spotlight' }));
  await type($('[data-song-label]'), 'New label');
  await type($('[data-song-label]'), 'Old label');
  await click($(`[data-spot-review="${R1}"]`));
  await click($(`[data-spot-review="${R1}"]`));
  await click($('[data-spot-film-remove]'));
  assert.ok($('[data-save-mine]'), 'a film removed is a change');
  await m.unmount();
  reset({ stored: opened });
  m = await mount(editor({ startTab: 'spotlight' }));
  await click($('[data-stat="years"]'));
  await click($('[data-stat="years"]'));
  assert.ok(!$('[data-save-mine]'), 'put back, nothing is changed');
  // Only the stats changed: the rest of the Spotlight rides through as stored (the legacy field too).
  await click($('[data-stat="reviews"]'));
  await click($('[data-save-mine]'));
  doc = world.saved.d;
  assert.deepEqual(doc.heroStats, ['rating', 'reviews']);
  assert.deepEqual(doc.pinned, opened.pinned, 'not rewritten');
  await m.unmount();

  // A pin of a review that is gone (no longer among the coach's members') takes no place, and goes
  // with the next change.
  reset({ stored: { pinnedReviews: ['77777777-7777-4777-8777-777777777777', R1] } });
  m = await mount(editor({ startTab: 'spotlight' }));
  assert.match($('[data-spot-wins]').firstChild.textContent, /1 of 3/);
  assert.ok(!$('[data-save-mine]'));
  await click($(`[data-spot-review="${R2}"]`));
  await click($('[data-save-mine]'));
  assert.deepEqual(world.saved.d.pinnedReviews, [R1, R2]);
  await m.unmount();

  // A nutritionist picks from a nutritionist's figures.
  reset();
  m = await mount(editor({ role: 'nutritionist', startTab: 'spotlight', figures: { recipes: 4 } }));
  assert.deepEqual($$('[data-stat]').map((b) => b.getAttribute('data-stat')), BS_COACH_STATS.nutritionist);
  assert.equal($('[data-stat="recipes"] [data-stat-figure]').textContent, '4');
  await m.unmount();
});

test('the demo: its film is one of its clips, its wins its own sample reviews, and Save says which keys it changed', async () => {
  const CLIP = 'https://cdn.test/clip.mp4';
  const sample = [{ id: 'demo-r1', author: 'Priya S.', rating: 10, text: 'Great coach.' }, { id: 'demo-r2', author: 'Marcus L.', rating: 10, text: 'Worth it.' }];
  reset({ me: null, stored: { film: { url: CLIP, caption: '' }, pinnedReviews: ['demo-r2', 'nope'] } });
  const m = await mount(editor({ demo: true, ownerUid: null, clips: [CLIP], reviews: sample, startTab: 'spotlight' }));
  assert.equal($('[data-spot-film-video]').getAttribute('src'), CLIP);
  assert.deepEqual($$('[data-spot-review]').map((b) => b.getAttribute('data-spot-review')), ['demo-r1', 'demo-r2']);
  assert.equal($('[data-spot-review="demo-r2"]').getAttribute('aria-pressed'), 'true');
  await click($('[data-spot-film-remove]'));
  await pick($('[data-spot-film] input[type="file"]'), fileOf('intro.mp4', 'video/mp4'));
  assert.match($('[data-spot-film-err]').textContent, /Sign in to upload your own film\./);
  assert.equal(world.uploaded, null);
  await click($('[data-spot-review="demo-r1"]'));
  await type($('[data-pin-title]'), 'A sample win');
  await click($('[data-save-mine]'));
  assert.equal(world.saved, null, 'the demo writes nothing');
  const { doc, changed } = world.onSaved;
  assert.deepEqual([changed.film, changed.pinnedReviews, changed.pinned, changed.song, changed.heroStats, changed.bizCard], [true, true, true, false, false, false]);
  assert.ok(!('film' in doc));
  assert.deepEqual(doc.pinnedReviews, ['demo-r2', 'demo-r1'], 'the sample\'s own ids');
  assert.equal(doc.pinned.title, 'A sample win');
  await m.unmount();
});

// ── The coach page ───────────────────────────────────────────────────────────────────────────
test('the trainer page shows each part when set: stats, highlight, film, the practice, the song, the wins wall', async () => {
  reset({ me: 'u-me', custom: FULL });
  const m = await mount(page());
  const stats = $$('[data-coach-stat]');
  assert.deepEqual(stats.map((s) => s.getAttribute('data-coach-stat')), ['rating', 'years', 'replays']);
  assert.deepEqual(stats.map((s) => s.textContent), ['9.5/10Rating', '7Years coaching', '1Replays'], 'the page\'s own figures');
  const hl = $('[data-coach-highlight]');
  assert.match(hl.textContent, /Pinned · Win/);
  assert.match(hl.textContent, /Client deadlift: twice her bodyweight/);
  assert.equal(hl.querySelector('[data-coach-highlight-metric]').textContent, '2×BW');
  assert.match(hl.textContent, /Fourteen weeks, no missed sessions\./);
  assert.equal($('[data-coach-film] video').getAttribute('src'), `${FILM}#t=0.1`);
  assert.match($('[data-coach-film]').textContent, /Intro film.*How I coach a squat, start to finish\./);
  // The Climb's base camp, Start here: the first camp on the route.
  assert.ok(camp('base').contains($('[data-coach-spotlight]')));
  assert.equal($$('[data-climb-camp]')[0], camp('base'));
  // The wins wall is Proof: the pins in their order, each only as one of this coach's members' reviews
  // (the other coach's never); What clients say (Words) has the rest, newest first, a pin never twice.
  assert.ok(world.byIdsFor.includes([R5, R2].join(',')));
  const wins = $$('[data-climb-win]');
  assert.ok(wins.every((w) => camp('proof').contains(w) && w.hasAttribute('data-review-pinned')));
  assert.match(wins[0].textContent, /10\s*\/10.*An old favourite\.Dana K\./);
  assert.match(wins[1].textContent, /Books up fast/);
  const cards = $$('[data-review-card]');
  assert.match(cards[0].textContent, /\+60 lb/);
  assert.ok(cards.every((c) => !c.hasAttribute('data-review-pinned')), 'Words has no pin');
  assert.equal([...wins, ...cards].filter((c) => /Books up fast/.test(c.textContent)).length, 1, 'a pin is not shown twice');
  // About: the practice's card after the facts, and the song after the answers.
  assert.ok(camp('about'));
  const practice = $('[data-about="practice"]');
  assert.match(practice.textContent, /The practice.*Iron Path Strength/);
  assert.deepEqual($$('[data-about-practice-row]').map((r) => [r.getAttribute('data-about-practice-row'), r.textContent]),
    [['where', 'WhereAustin, TX'], ['hours', 'HoursMon–Sat · by appointment'], ['find', 'Find@ironpath']]);
  assert.ok(!practice.querySelector('a'), 'the handle is text, never a link');
  assert.equal($('[data-about-song] iframe').getAttribute('src'), EMBED);
  assert.match($('[data-about="song"]').textContent, /Warm-up anthem/);
  // Its name and place still show under the coach's name.
  assert.match(m.text(), /Strength coach · Iron Path Strength/);
  assert.match(m.text(), /Austin, TX/);
  await m.unmount();
});

test('none shows when unset, when it is not the coach\'s own, or on a private profile', async () => {
  reset({ me: 'u-me', custom: { about: { story: 'Ten years.' } } });
  let m = await mount(page());
  for (const sel of SPOT) assert.ok(!$(sel), `${sel}: nothing set, nothing shown`);
  assert.ok(camp('about'));
  assert.ok(!$('[data-about="practice"]') && !$('[data-about="song"]'));
  await m.unmount();

  // Written by hand or by an older editor: a film in a member's bucket or another coach's folder, a
  // song that is not Spotify's, a highlight with no headline, a member's stats, junk pins.
  reset({ me: 'u-me', custom: {
    film: { url: media('member-films', 'u-maya', 'a.mp4') }, song: { url: 'https://evil.test/open.spotify.com.mp3' }, pinned: { title: '', note: 'x' },
    heroStats: ['score', 'tier', 'streak'], pinnedReviews: ['not-a-uuid', '66666666-6666-4666-8666-666666666666'], bizCard: { where: 'No name' },
  } });
  m = await mount(page());
  for (const sel of SPOT) assert.ok(!$(sel), `${sel}: not the coach's own, not shown`);
  assert.ok(!camp('about'), 'a visitor sees no About with nothing in it');
  await m.unmount();
  reset({ me: 'u-me', custom: { film: { url: media('coach-media', 'u-other', 'a.mp4') } } });
  m = await mount(page());
  assert.ok(!$('[data-coach-film]'), 'another coach\'s film');
  await m.unmount();

  // Stats picked with no figure for them yet: the row is not drawn.
  reset({ me: 'u-me', custom: { heroStats: ['certs', 'programs'] } });
  m = await mount(page());
  assert.ok(!$('[data-coach-stats]'));
  await m.unmount();

  reset({ me: 'u-me', custom: FULL, canView: false });
  m = await mount(page());
  for (const sel of SPOT) assert.ok(!$(sel), `${sel}: private`);
  await m.unmount();
});

test('a nutritionist\'s page shows them too, with a nutritionist\'s stats; the coach\'s own editor gets the page\'s figures', async () => {
  const recipes = [1, 2, 3].map((i) => ({ id: `r${i}`, t: `Recipe ${i}`, ing: [{ n: '1', m: 'Oats' }], steps: ['Cook.'] }));
  reset({ me: 'u-me', custom: { ...FULL, heroStats: ['recipes', 'rating', 'replays'], kitchen: { recipes } } });
  let m = await mount(page({ person: { ...maya, kind: 'NUTRI' } }));
  assert.deepEqual($$('[data-coach-stat]').map((s) => s.textContent), ['3Recipes', '9.5/10Rating'], 'replays are a trainer\'s');
  assert.ok($('[data-coach-highlight]') && $('[data-coach-film]'));
  await m.unmount();

  reset({ me: 'u-maya', stored: { about: { years: 7 } } });
  m = await mount(page({ isSelf: true }));
  await click(button(/^Make it yours$/));
  await editorTab('Spotlight');
  assert.equal($('[data-stat="rating"] [data-stat-figure]').textContent, '9.5/10');
  assert.equal($('[data-stat="years"] [data-stat-figure]').textContent, '7');
  assert.equal($('[data-stat="replays"] [data-stat-figure]').textContent, '1');
  await click($('[data-stat="years"]'));
  await click($('[data-save-mine]'));
  assert.deepEqual(world.saved.d.heroStats, ['years']);
  // Saved, the page shows it at once.
  assert.deepEqual($$('[data-coach-stat]').map((s) => s.textContent), ['7Years coaching']);
  await m.unmount();
});

// Owner, 2026-11-04: "i just mean make sure coaches have the view live profile preview button". Make it yours
// opens the coach's real page as members see it, with the edits not saved yet on it, under Customize's
// floating bar; Back to editing and the page's ← come back with every edit kept, and nothing is written.
test('Make it yours → View live preview opens the coach\'s page with a draft on it, writes nothing, and comes back with it', async () => {
  window.BSTrainerProfile = BSTrainerProfile;
  const follows = [];
  const hadFollows = window.ShapeFollows;
  window.ShapeFollows = { ...hadFollows, toggle: async (...a) => { follows.push(a); return { isFollowing: true }; } };
  try {
    reset({ me: 'u-maya', stored: { about: { years: 7 } }, custom: { about: { years: 7 } } });
    const m = await mount(page({ isSelf: true }));
    await click(button(/^Make it yours$/));
    await editorTab('Spotlight');
    await type($('[data-pin-title]'), 'Three plates on the squat');
    const open = $('[data-make-it-yours] [data-mine-live-open]');
    assert.ok(open, 'no View live preview in Make it yours');
    assert.equal(open.textContent, 'View live preview');
    await click(open);
    // The page as members see it (not the coach's own: no Make it yours on it), the draft on it.
    const live = $('[data-cust-live]');
    assert.ok(live, 'the preview did not open');
    assert.match(live.querySelector('[data-coach-highlight]').textContent, /Three plates on the squat/, 'the draft is not on the page');
    assert.ok(![...live.querySelectorAll('button')].some((b) => /^Make it yours$/.test(b.textContent)), 'the preview is the coach\'s own page');
    assert.equal($('[data-cust-live-state]').getAttribute('data-cust-live-state'), 'unsaved');
    assert.match($('[data-cust-live-bar]').textContent, /Preview.*Not saved yet.*Back to editing/);
    assert.equal($('[data-mine-scroll]').style.visibility, 'hidden', 'the editor shows through');
    // A tap on Follow is stopped; nothing is saved.
    const follow = [...live.querySelectorAll('button')].find((b) => /^\+?\s*Follow$/.test(b.textContent.trim()));
    if (follow) await click(follow);
    assert.equal(follows.length, 0, 'a tap on the preview followed');
    assert.equal(world.saved, null, 'previewing saved');
    // Back to editing: the editor as it was, the draft kept.
    await click($('[data-cust-live-back]'));
    assert.ok(!$('[data-cust-live]'), 'Back to editing left the preview open');
    assert.equal($('[data-pin-title]').value, 'Three plates on the squat', 'Back to editing lost the draft');
    assert.ok($('[data-save-mine]'), 'the draft no longer reads as unsaved');
    // The page's own ← (a swipe right takes it) comes back the same way. It sits ahead of the logo in
    // the masthead row (owner, 2026-11-09), not on a row of its own.
    await click($('[data-make-it-yours] [data-mine-live-open]'));
    assert.ok(!$('[data-cust-live] [data-bs-back-row]:not([data-bs-back-in-mast]) [data-bs-back]'), 'the preview\'s ← is on a row of its own again');
    await click($('[data-cust-live] [data-bs-mast-back-slot] [data-bs-back]'));
    assert.ok(!$('[data-cust-live]'), 'the page\'s ← left the preview open');
    assert.equal($('[data-pin-title]').value, 'Three plates on the squat');
    assert.equal(world.saved, null);
    await m.unmount();
  } finally { window.ShapeFollows = hadFollows; delete window.BSTrainerProfile; }
});

// A cover spot dragged on the website (look.pos, owner 2026-11-11: "create option to drag this image around
// for background image so i can adjust positioning") rides through an app save while the crop stop stays,
// and goes when the coach picks another stop here, since that stop is the newer word on what shows.
test('Make it yours keeps a cover spot dragged on the website, and drops it when the stop changes', async () => {
  const look = { paper: 'bone', accent: 'rust', focus: 'top', pos: { x: 30, y: 20 } };
  reset({ stored: { look } });
  let m = await mount(editor());
  await click($('[data-paper="dark"]'));
  await click($('[data-save-mine]'));
  assert.deepEqual(world.saved.d.look, { paper: 'dark', accent: 'rust', focus: 'top', pos: { x: 30, y: 20 } }, 'a new paper lost the dragged spot');
  await m.unmount();

  // Dragged again on the website while this was open: the save keeps the newer spot and its stop,
  // read at save time, not the one this opened with (Codex, #2704).
  reset({ stored: { look } });
  m = await mount(editor());
  world.stored = { look: { ...look, focus: 'bottom', pos: { x: 70, y: 88 } } };
  await click($('[data-paper="dark"]'));
  await click($('[data-save-mine]'));
  assert.deepEqual(world.saved.d.look, { paper: 'dark', accent: 'rust', focus: 'bottom', pos: { x: 70, y: 88 } }, 'the save put back the spot this opened with');
  await m.unmount();

  reset({ stored: { look } });
  m = await mount(editor());
  await editorTab('Wall photo');
  await click([...$$('[role="group"][aria-label="Keep in view"] button')].find((b) => b.textContent === 'Bottom'));
  await click($('[data-save-mine]'));
  assert.deepEqual(world.saved.d.look, { paper: 'bone', accent: 'rust', focus: 'bottom' }, 'a new stop kept the old spot over it');
  await m.unmount();
});
