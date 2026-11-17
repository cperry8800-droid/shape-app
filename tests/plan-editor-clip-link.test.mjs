// A clip on a plan editor's block: a file, or a link (owner, 2026-11-17: "have youtube links be
// able to be added").
//
// The app's outline editor (iosAppBroadsheetPros.jsx BSCoachDraftEditor) attached a clip to a block
// with ＋ CLIP by file upload only. ＋ CLIP now opens a panel under the block with both ways in, and
// the link goes through the shared ShapeVideoLink (public/newdesign/shapeVideo.js).
// ⚠ WHO SEES THIS EDITOR: the nutritionist's Plans page is its one mount (meal plans, diets and
// programs; tests/broadsheet-render.test.mjs holds that count). A trainer's workouts open in the
// workout builder (BSWorkoutDocumentEditor), where every exercise already has this same link field,
// as it has on the website (dashBuilder.jsx); tests/shape-video.test.mjs covers the field itself.
//
// What it pins, on the shipping editor mounted in jsdom as the page mounts it for a meal plan (the
// harness is tests/coach-programs-page.test.mjs's), with the real ShapeVideoLink and English catalog:
//   · ＋ CLIP opens Upload video and a link field under that block, and closes again.
//   · A pasted YouTube, Vimeo or Loom link, or a video file's URL, lands in the block's `video`
//     and crosses onPublish: the same field an upload writes.
//   · A LINK ShapeVideo CANNOT RESOLVE IS REFUSED ON THE PAGE (role="alert" in the panel: toasts
//     are a no-op in this app) and nothing is attached; an http link is refused too.
//   · ▶ CLIP and × work for a linked clip as for an uploaded one.
//   · The upload is still there: the picked file goes through ShapeCoachMedia and its URL lands in
//     the same field; a failed or signed-out upload is said in the panel.
//   · On a day's own menu the clip lands on that day's block, not the default menu's.
//   · THE EDITOR HAS NO URL PARSER OF ITS OWN, and the panel's words are in all 13 catalogs.
// Run: node --test tests/plan-editor-clip-link.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadRealModule } from './helpers/load-real-module.mjs';

const require_ = createRequire(import.meta.url);
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PROS_SRC = join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const CATALOGS = join(ROOT, 'mobile-app/src/i18n/catalogs');
const { JSDOM } = require_('jsdom');
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
const W = dom.window;
globalThis.window = W;
globalThis.document = W.document;
Object.defineProperty(globalThis, 'navigator', { value: W.navigator, configurable: true, writable: true });
globalThis.localStorage = W.localStorage;
globalThis.__VITE_ENV__ = { BASE_URL: '/m/', MODE: 'test' };
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');

// The words as the app prints them: the real English catalog through the real message format.
const { IntlMessageFormat } = require_('intl-messageformat');
const EN = JSON.parse(readFileSync(join(CATALOGS, 'en/coach.json'), 'utf8'));
W.ShapeI18n = {
  t: (key, opts = {}) => {
    const msg = key.startsWith('coach:') ? EN[key.slice(6)] : null;
    return msg == null ? undefined : new IntlMessageFormat(msg, 'en').format(opts);
  },
  intlLocale: () => 'en',
};
const theme = { MONO: 'mono', DISPLAY: 'display', BODY: 'body', PAPER: '#fff', PAPER2: '#eee', PAPER3: '#ddd', INK: '#111', INK30: '#999', INK50: '#777', INK70: '#555', HAIR: '#ddd', RULE: '#ccc', AMBER: '#d8b25a', RUST: '#c0533b', GREEN: '#5fa96e', BLUE: '#4a7bd0', padX: 18, isLight: true, W: { display: 700 } };
W.useBS = () => theme;
for (const chrome of ['BSPage', 'BSFooter', 'BSBackButton', 'BSMasthead', 'BSPageHeader', 'BSAvatar', 'BSFacetAvatar', 'BSEyebrow', 'BSSection', 'BSPlate', 'BSSlab', 'BSCell', 'BSTag', 'BSRow', 'BSHeadlineNumber', 'BSHalftone', 'BSTabBar', 'BSSheetProvider', 'BSCalendarScreen', 'BSRadioPrompt', 'BSRadioScreen', 'BSNowPlaying', 'BSClientChat', 'BSSettings', 'BSShapeScorePage', 'BSShapeStorePage', 'BSContactPage', 'BSTermsPage', 'BSPublicProfile']) {
  W[chrome] = ({ children }) => React.createElement('div', { 'data-chrome': chrome }, children);
}
W.BSBackRow = ({ onBack, trailing }) => React.createElement('div', null, React.createElement('button', { type: 'button', 'data-back': '', onClick: onBack }, 'Back'), trailing);

const PROS = await loadRealModule(PROS_SRC, {
  registry: new Map([['react', React], ['react-dom', { createPortal: (n) => n }]]),
  appendExports: 'export { BSCoachDraftEditor };',
});

const BLOCK = 'Breakfast — Overnight oats · 480 kcal';
const SECOND = 'Dinner — Salmon tray bake · 640 kcal';
const YOUTUBE = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const tick = () => React.act(async () => { await new Promise((r) => setTimeout(r, 0)); });

async function mount(over = {}) {
  const published = [];
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = ReactDOMClient.createRoot(host);
  await React.act(async () => {
    root.render(React.createElement(PROS.BSCoachDraftEditor, {
      t: theme, accent: '#a07a2e', accentInk: '#241c08', typeName: 'meal plan', blockLabel: 'Daily meals',
      initialName: 'Lean week', initialNote: '', initialMedia: [],
      initialBlocks: [{ id: 'b1', text: BLOCK }, { id: 'b2', text: SECOND }],
      stepAuthoring: true, perDayAuthoring: true,
      onPublish: async (payload) => { published.push(payload); }, onCancel: () => {},
      ...over,
    }));
  });
  await tick();
  const q = (sel) => host.querySelector(sel);
  const all = (sel) => [...host.querySelectorAll(sel)];
  const click = async (el) => { assert.ok(el, 'no such element'); await React.act(async () => { el.dispatchEvent(new W.MouseEvent('click', { bubbles: true })); }); await tick(); };
  const type = async (el, value) => {
    assert.ok(el, 'no such field');
    await React.act(async () => { Object.getOwnPropertyDescriptor(W.HTMLInputElement.prototype, 'value').set.call(el, value); el.dispatchEvent(new W.Event('input', { bubbles: true })); });
  };
  const button = (text, scope = host) => [...scope.querySelectorAll('button')].find((b) => b.textContent.trim() === text);
  const aria = (label) => all('button').find((b) => b.getAttribute('aria-label') === label);
  const api = {
    host, q, all, click, type, button, aria, published,
    panel: () => q('[data-clip-attach]'),
    openPanel: (name = BLOCK) => click(aria(`Attach a video clip to ${name}`)),
    // Paste a link into the open panel and press its Attach button, the way a coach does.
    async paste(url) {
      const panel = api.panel();
      assert.ok(panel, 'the attach panel is open');
      await type(panel.querySelector('input[type="url"]'), url);
      await click(button('Attach link', panel));
    },
    // Hand the hidden file input a picked file (a browser's picker cannot be driven from a test).
    async pick(file) {
      const input = q('input[type="file"][accept="video/*"]');
      assert.ok(input, 'the clip file input');
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await React.act(async () => { input.dispatchEvent(new W.Event('change', { bubbles: true })); });
      await tick();
    },
    async publish() { await click(all('button').find((b) => /^Publish /.test(b.textContent))); return published[published.length - 1]; },
    close: async () => { await React.act(async () => root.unmount()); host.remove(); },
  };
  return api;
}

test('＋ CLIP opens the two ways in under its block, a file or a link, and closes again', async () => {
  const m = await mount();
  try {
    assert.ok(!m.panel(), 'nothing is open until the coach asks');
    const add = m.aria(`Attach a video clip to ${BLOCK}`);
    assert.equal(add.textContent, '＋ CLIP');
    assert.equal(add.getAttribute('aria-expanded'), 'false');
    await m.openPanel();
    const panel = m.panel();
    assert.ok(panel, 'the panel is on the page, not in a sheet');
    assert.equal(m.all('[data-clip-attach]').length, 1, 'one block, one panel');
    assert.equal(m.aria(`Attach a video clip to ${BLOCK}`).getAttribute('aria-expanded'), 'true');
    // Under the block it is for: the same block wrapper holds the block's text and the panel.
    assert.equal(panel.parentElement.querySelector('input').value, BLOCK);
    const upload = m.button('Upload video', panel);
    assert.ok(upload, 'the upload stays');
    assert.equal(upload.style.minHeight, '44px');
    const field = panel.querySelector('input[type="url"]');
    assert.ok(field, 'a link field');
    assert.equal(field.style.minHeight, '44px');
    assert.equal(field.closest('label').textContent, `Video link for ${BLOCK}`);
    assert.match(panel.textContent, /YouTube, Vimeo, Loom, or a direct MP4, MOV, M4V or WebM link\./);
    const attach = m.button('Attach link', panel);
    assert.equal(attach.style.minHeight, '44px');
    assert.equal(attach.disabled, true, 'nothing to attach until a link is typed');
    await m.openPanel();
    assert.ok(!m.panel(), 'the same button closes it');
  } finally { await m.close(); }
});

test('a pasted YouTube link lands in the block\'s `video` and is published with the plan', async () => {
  const m = await mount();
  try {
    await m.openPanel();
    await m.paste(YOUTUBE);
    assert.ok(!m.panel(), 'attached: the panel is gone');
    assert.ok(m.aria(`Play clip for ${BLOCK}`), 'the block shows its clip');
    assert.ok(!m.aria(`Attach a video clip to ${BLOCK}`), '＋ CLIP gives way to ▶ CLIP and ×');
    const sent = await m.publish();
    assert.equal(sent.blocks[0].video, YOUTUBE, 'the field an upload writes, and the plan carries');
    assert.equal(sent.blocks[0].text, BLOCK);
    assert.equal(sent.blocks[1].video, undefined, 'only the block it was attached to');
  } finally { await m.close(); }
});

test('every kind ShapeVideo plays is taken: youtu.be, Shorts, Vimeo, Loom and a video file', async () => {
  for (const url of [
    'https://youtu.be/dQw4w9WgXcQ',
    'https://www.youtube.com/shorts/dQw4w9WgXcQ',
    'https://vimeo.com/123456789',
    'https://www.loom.com/share/0123456789abcdef0123456789abcdef',
    'https://cdn.example.com/overnight-oats.mp4',
  ]) {
    const m = await mount();
    try {
      await m.openPanel();
      await m.paste(url);
      assert.equal((await m.publish()).blocks[0].video, url, url);
    } finally { await m.close(); }
  }
});

test('a link ShapeVideo cannot resolve is refused on the page, and nothing is attached', async () => {
  const m = await mount();
  try {
    await m.openPanel();
    for (const [url, why] of [
      ['https://example.com/my-recipe-page', /Use a supported video link\. YouTube, Vimeo, Loom, or a direct MP4, MOV, M4V or WebM link\./],
      ['https://youtube.com.evil.test/watch?v=dQw4w9WgXcQ', /Use a supported video link/],
      ['https://www.youtube.com/watch?v=short', /Use a supported video link/],
      ['not a link', /Use a supported video link/],
      ['http://youtu.be/dQw4w9WgXcQ', /Use a secure video link starting with https:\/\/\./],
    ]) {
      await m.paste(url);
      const panel = m.panel();
      assert.ok(panel, `the panel stays open for another try: ${url}`);
      const alert = panel.querySelector('[role="alert"]');
      assert.ok(alert, `said in the panel: ${url}`);
      assert.match(alert.textContent, why);
      assert.equal(panel.querySelector('input[type="url"]').value, url, 'what was typed is kept, to be corrected');
      assert.ok(!m.aria(`Play clip for ${BLOCK}`), `no clip on the block: ${url}`);
    }
    const sent = await m.publish();
    assert.ok(sent.blocks.every((b) => b.video === undefined), 'nothing refused reaches the plan');
  } finally { await m.close(); }
});

test('▶ CLIP and × work for a linked clip as for an uploaded one', async () => {
  const m = await mount();
  const opened = [];
  const realOpen = W.open;
  W.open = (...args) => { opened.push(args); return null; };
  try {
    await m.openPanel();
    await m.paste(YOUTUBE);
    await m.click(m.aria(`Play clip for ${BLOCK}`));
    assert.deepEqual(opened, [[YOUTUBE, '_blank', 'noopener,noreferrer']]);
    await m.click(m.aria(`Remove clip from ${BLOCK}`));
    assert.ok(!m.aria(`Play clip for ${BLOCK}`), 'the clip is off the block');
    assert.ok(m.aria(`Attach a video clip to ${BLOCK}`), '＋ CLIP is back');
    assert.ok(!m.panel(), 'and the panel does not reopen by itself');
    assert.equal((await m.publish()).blocks[0].video, undefined);
  } finally { W.open = realOpen; await m.close(); }
});

test('the upload is still there: the picked file\'s URL lands in the same field', async () => {
  const sent = [];
  W.ShapeCoachMedia = { upload: async (file) => { sent.push(file.name); return { url: 'https://media.example.com/coach-1/salmon.mp4', type: 'video' }; } };
  const m = await mount();
  try {
    await m.openPanel(SECOND);
    await m.click(m.button('Upload video', m.panel()));
    await m.pick(new W.File(['x'], 'salmon.mp4', { type: 'video/mp4' }));
    assert.deepEqual(sent, ['salmon.mp4']);
    assert.ok(!m.panel(), 'uploaded: the panel is gone');
    assert.ok(m.aria(`Play clip for ${SECOND}`));
    const out = await m.publish();
    assert.equal(out.blocks[1].video, 'https://media.example.com/coach-1/salmon.mp4');
    assert.equal(out.blocks[0].video, undefined);
  } finally { W.ShapeCoachMedia = undefined; await m.close(); }
});

test('an upload that fails, or has no account behind it, is said in the panel', async () => {
  W.ShapeCoachMedia = { upload: async () => { throw new Error('Keep the video under 200 MB.'); } };
  const m = await mount();
  try {
    await m.openPanel();
    await m.click(m.button('Upload video', m.panel()));
    await m.pick(new W.File(['x'], 'big.mp4', { type: 'video/mp4' }));
    assert.equal(m.panel().querySelector('[data-clip-error][role="alert"]').textContent, 'Keep the video under 200 MB.');
    assert.ok(!m.aria(`Play clip for ${BLOCK}`), 'a failed upload attaches nothing');
    // An upload that answers with no URL is a failure too, not a silent nothing.
    W.ShapeCoachMedia = { upload: async () => ({}) };
    await m.click(m.button('Upload video', m.panel()));
    await m.pick(new W.File(['x'], 'lost.mp4', { type: 'video/mp4' }));
    assert.equal(m.panel().querySelector('[data-clip-error]').textContent, 'Upload failed');
    // Signed out: no uploader on the window.
    W.ShapeCoachMedia = undefined;
    await m.click(m.button('Upload video', m.panel()));
    await m.pick(new W.File(['x'], 'oats.mp4', { type: 'video/mp4' }));
    assert.equal(m.panel().querySelector('[data-clip-error]').textContent, 'Sign in to upload media.');
    // The link still works from the same panel, and clears what the upload said.
    await m.paste(YOUTUBE);
    assert.equal((await m.publish()).blocks[0].video, YOUTUBE);
  } finally { W.ShapeCoachMedia = undefined; await m.close(); }
});

test('on a day\'s own menu the clip lands on that day\'s block, not the default menu\'s', async () => {
  const m = await mount();
  try {
    await m.click(m.button('TUE'));
    await m.click(m.button('GIVE THIS DAY ITS OWN MENU'));
    await m.openPanel();
    await m.paste(YOUTUBE);
    // The default menu's same block has no clip, and no panel left open from the day's.
    await m.click(m.button('DEFAULT'));
    assert.ok(!m.aria(`Play clip for ${BLOCK}`), 'the default menu\'s block has no clip');
    assert.ok(!m.panel(), 'no panel left open from the day\'s');
    const sent = await m.publish();
    assert.equal(sent.blocks[0].video, undefined);
    assert.equal(sent.days.length, 1);
    assert.equal(sent.days[0].dow, 1);
    assert.equal(sent.days[0].blocks[0].video, YOUTUBE);
  } finally { await m.close(); }
});

test('a panel left open belongs to its block: removing the block above does not move it', async () => {
  const m = await mount();
  try {
    await m.openPanel(SECOND);
    await m.click(m.all('button').filter((b) => b.getAttribute('aria-label') === 'Remove')[0]);
    const panel = m.panel();
    assert.ok(panel, 'still open');
    assert.equal(panel.parentElement.querySelector('input').value, SECOND);
    await m.paste(YOUTUBE);
    const sent = await m.publish();
    assert.deepEqual(sent.blocks.map((b) => [b.text, b.video]), [[SECOND, YOUTUBE]]);
  } finally { await m.close(); }
});

// ── The source ──────────────────────────────────────────────────────────────────────────────────
const SOURCE = readFileSync(PROS_SRC, 'utf8');
const EDITOR = SOURCE.slice(SOURCE.indexOf('function BSCoachDraftEditor('), SOURCE.indexOf('function BSTrainerPrograms('));

test('the editor has no URL parser of its own: the link field is the shared ShapeVideoLink', () => {
  assert.ok(EDITOR.length > 1000, 'the editor span was found');
  const panel = EDITOR.slice(EDITOR.indexOf('data-clip-attach'));
  assert.match(panel.slice(0, 2400), /<ShapeVideoLink label=\{tr\('coach:video\.exerciseLink'/, 'the block\'s link field, with the workout builder\'s label');
  assert.match(panel.slice(0, 2400), /onChange=\{\(url\) => attachClipLink\(i, url\)\}/);
  // No provider names, no URL() and no ShapeVideo calls of its own in the clip code: what is and
  // is not a clip is ShapeVideo.validateLink's to say, inside ShapeVideoLink.
  const clip = EDITOR.slice(EDITOR.indexOf('const clipInputRef'), EDITOR.indexOf('const clearClip'));
  assert.ok(clip.length > 400, 'the clip handlers were found');
  const code = clip.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /youtu|vimeo|loom|new URL\(|ShapeVideo\.|https?:/i);
  // One field: a link is written where an upload is.
  assert.match(code, /const setClip = \(i, url\) => editBlocks\(list => list\.map\(\(b, j\) => \(j === i \? \{ \.\.\.b, video: url \} : b\)\)\);/);
  assert.match(code, /setClip\(i, m\.url\)/);
  assert.match(code, /const attachClipLink = \(i, url\) => \{ setClip\(i, url\);/);
});

test('the panel\'s words are in all 13 catalogs', () => {
  const locales = readdirSync(CATALOGS).filter((d) => !d.startsWith('.'));
  assert.equal(locales.length, 13);
  const keys = ['editor.addClip', 'editor.attachClipAria', 'editor.signInUpload', 'editor.uploadFailed',
    'video.upload', 'video.uploading', 'video.exerciseLink', 'video.help', 'video.attachLink', 'video.invalidLink', 'video.secureLink'];
  for (const locale of locales) {
    const catalog = JSON.parse(readFileSync(join(CATALOGS, locale, 'coach.json'), 'utf8'));
    for (const key of keys) assert.ok(typeof catalog[key] === 'string' && catalog[key].trim(), `${locale} coach.json has ${key}`);
  }
});
