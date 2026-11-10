// What sits in a channel's circle, on both surfaces (owner, 2026-11-10: "rethink these icons for the
// channels", "have creators of channels upload custom pictures", "you can leave them circle", "make
// them a little smaller", "make shape hq one be the triangles", "make the # smaller"), and the two
// sample channels the owner removed ("Just remove those 2 channels i selected").
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { channelMark, CHANNEL_MARK_HUES, CHANNEL_MARK_TRIANGLES, CHANNEL_MARK_TROPHY } from '../public/newdesign/channelMark.mjs';
import * as viaApp from '../mobile-app/src/services/channelMark.mjs';

const read = (p) => readFileSync(p, 'utf8');
const WIDGET = read('public/newdesign/chatWidget.jsx');
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const MARK = read('mobile-app/src/broadsheet/BSChannelMark.jsx');

// The website's copy, lifted and run.
function liftWebsite() {
  const from = WIDGET.indexOf("const CW_CHANNEL_MARK_HUES");
  const to = WIDGET.indexOf('// The circle (owner, 2026-11-10');
  assert.ok(from > 0 && to > from, 'the website\'s copy of the rule moved');
  const S = {};
  new Function('S', `${WIDGET.slice(from, to)}\nS.f = cwChannelMark; S.hues = CW_CHANNEL_MARK_HUES; S.tri = CW_CHANNEL_MARK_TRIANGLES; S.trophy = CW_CHANNEL_MARK_TROPHY;`)(S);
  return S;
}

const CASES = [
  { name: 'Sunday Run Club' }, { name: 'strength-block-3' }, { name: '# wins' }, { name: 'macro-mondays' },
  { name: 'Shape HQ', official: true }, { name: 'shape hq', official: true }, { name: 'Shape HQ' },
  { name: 'PR Wall', official: true }, { name: 'PR Wall' }, { name: '' }, { name: 'Ñandú runners' },
  { name: 'run', picture: 'https://x.supabase.co/storage/v1/object/public/channel-pictures/a/b.jpg' },
  { name: 'Shape HQ', official: true, picture: 'https://x/p.png' }, { name: 'trail', picture: '   ' },
];

test('the app and the website put the same thing in a channel\'s circle', () => {
  const web = liftWebsite();
  for (const c of CASES) assert.deepEqual(web.f(c), channelMark(c), JSON.stringify(c));
  assert.deepEqual(web.hues, CHANNEL_MARK_HUES);
  assert.deepEqual(web.tri, CHANNEL_MARK_TRIANGLES);
  assert.equal(web.trophy, CHANNEL_MARK_TROPHY);
  assert.equal(viaApp.channelMark, channelMark, 'the app imports a copy, not the canonical module');
});

test('the host\'s picture first; Shape\'s marks only on Shape\'s own channels; else initials', () => {
  assert.deepEqual(channelMark({ name: 'run', picture: 'https://x/p.jpg' }), { kind: 'picture', src: 'https://x/p.jpg' });
  assert.equal(channelMark({ name: 'Shape HQ', official: true }).kind, 'shape');
  assert.equal(channelMark({ name: 'PR Wall', official: true }).kind, 'trophy');
  // A member's channel named after Shape's does not wear Shape's mark.
  assert.equal(channelMark({ name: 'Shape HQ' }).kind, 'initials');
  assert.equal(channelMark({ name: 'PR Wall' }).kind, 'initials');
  assert.equal(channelMark({ name: 'Sunday Run Club' }).text, 'SR');
  assert.equal(channelMark({ name: 'strength-block-3' }).text, 'SB');
  assert.equal(channelMark({ name: '# wins' }).text, 'WI', 'the "#" is not an initial');
  // A channel keeps its colour wherever it is drawn.
  assert.equal(channelMark({ name: 'Sunday Run Club' }).hue, channelMark({ name: 'sunday run club' }).hue);
  assert.ok(CHANNEL_MARK_HUES.includes(channelMark({ name: 'x' }).hue));
});

test('Shape HQ\'s triangles are the logo\'s', () => {
  const logo = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');
  assert.ok(logo.includes(`points="${CHANNEL_MARK_TRIANGLES.top}"`), 'the top triangle is not BSLogo\'s');
  assert.ok(logo.includes(`points="${CHANNEL_MARK_TRIANGLES.bottom}"`), 'the bottom triangle is not BSLogo\'s');
});

test('circles, a little smaller, on both surfaces; the "#" smaller than the name', () => {
  assert.match(MARK, /borderRadius: '50%'/, 'the app\'s mark is not a circle');
  assert.match(CLIENT, /<BSChannelMark ch=\{\{ name: thread\.channelName[^\n]*size=\{40\}/, 'the channel header\'s circle is not 40px (it was 48)');
  assert.doesNotMatch(CLIENT, /fontSize: 20, fontWeight: 800 \}\}>#<\/span>/, 'the header\'s "#" circle came back');
  assert.match(CLIENT, /<BSChannelHash \/>\{ch\.name\}/, 'the list\'s "#" is full size again');
  assert.match(WIDGET, /<CwChannelMark ch=\{\{ name: t\.name \|\| t\.who[^\n]*size=\{30\}/, 'the website\'s list circle is not 30px');
  assert.match(WIDGET, /borderRadius: 999, display: "grid", placeItems: "center", overflow: "hidden" \};/, 'the website\'s mark is not a circle');
});

test('the host sets the picture: a path, never a stored address', () => {
  const backend = read('mobile-app/src/services/shapeBackend.js');
  assert.match(backend, /from\('channel-pictures'\)\.upload\(path, file/, 'the app does not upload into the channel-pictures bucket');
  assert.match(backend, /const path = `\$\{channelId\}\/\$\{Date\.now\(\)\}/, 'the app does not write into the channel\'s own folder');
  assert.match(backend, /update\(\{ picture_path: path \}\)/, 'the app stores something other than the path');
  assert.match(WIDGET, /from\("channel-pictures"\)\.upload\(path, file/);
  assert.match(WIDGET, /update\(\{ picture_path: path \}\)/);
  const sql = read('supabase-migrations/2026-11-10-channel-pictures-and-shape-hq.sql');
  assert.match(sql, /check \(picture_path is null or picture_path ~ \('\^' \|\| id::text \|\| '\/\[A-Za-z0-9\]/, 'the path is not held to the channel\'s own folder');
  assert.match(sql, /public\.can_edit_channel_picture\(\(storage\.foldername\(name\)\)\[1\]\)/, 'the bucket is not written by the host alone');
  assert.match(sql, /revoke execute on function public\.can_edit_channel_picture\(text\) from public, anon;/);
  assert.match(sql, /and not exists \(select 1 from public\.channels c where c\.id = channel_id and c\.read_only\)/, 'members can post in a read-only channel');
  assert.match(sql, /where not exists \(\n  select 1 from public\.channels where lower\(name\) = 'shape hq' and created_by is null\n\)/, 'Shape HQ is not created once');
});

test('the app\'s new lines are in all 13 languages', () => {
  const dir = 'mobile-app/src/i18n/catalogs';
  const locales = readdirSync(dir);
  assert.equal(locales.length, 13);
  for (const loc of locales) {
    const cat = JSON.parse(read(`${dir}/${loc}/feed.json`));
    for (const k of ['channels.changePicture', 'channels.pictureSaved', 'channels.pictureError', 'channels.readOnly']) {
      assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc} lacks feed:${k}`);
    }
  }
});

test('the two sample channels the owner removed stay removed', () => {
  for (const f of ['mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', 'mobile-app/src/broadsheet/clientChatThreads.jsx', 'public/newdesign/clientChatThreads.jsx', 'public/newdesign/globalChatButton.js']) {
    const s = read(f);
    assert.doesNotMatch(s, /sample-block3|sample-macros|Macro Mondays|# strength-block-3/, `${f} still carries them`);
  }
});

// The app's read (listChannels), lifted and run on a fake client: the picture's address is built
// from the stored path, Shape HQ reads as read-only, and only a system-owned channel is Shape's.
function liftAppRead(rows, uid = 'u1') {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const from = src.indexOf('async function listChannels()');
  const to = src.indexOf('async function setChannelPicture(');
  assert.ok(from > 0 && to > from, 'the app\'s channel read moved');
  const q = (data) => {
    const b = { select: () => b, order: () => b, in: () => b, then: (ok, ko) => Promise.resolve({ data, error: null }).then(ok, ko) };
    return b;
  };
  const supabase = {
    from: (t) => q(t === 'channels' ? rows : []),
    storage: { from: (bucket) => ({ getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${p}` } }) }) },
  };
  const state = { user: { id: uid } };
  return new Function('supabase', 'state', `${src.slice(from, to)}\nreturn listChannels();`)(supabase, state);
}

test('the app reads a channel\'s picture, read-only and owner as the website does', async () => {
  const res = await liftAppRead([
    { id: 'hq', name: 'Shape HQ', created_by: null, visibility: 'public', read_only: true },
    { id: 'mine', name: 'Shape HQ', created_by: 'u1', visibility: 'public', picture_path: 'mine/a.jpg' },
    { id: 'old', name: 'run club', created_by: 'u2', visibility: 'public' },
  ]);
  const by = Object.fromEntries(res.data.map((r) => [r.id, r]));
  assert.equal(by.hq.readOnly, true, 'Shape HQ is open to posts in the app');
  assert.equal(by.hq.official, true, 'the system-owned Shape HQ is not Shape\'s');
  assert.equal(by.mine.official, false, 'a member\'s channel named Shape HQ is taken for Shape\'s');
  assert.equal(by.mine.readOnly, false);
  assert.equal(by.mine.picture, 'https://cdn.test/channel-pictures/mine/a.jpg', 'the address is not built from the stored path');
  assert.equal(by.old.picture, null, 'a channel with no picture (or before the migration) shows one');
  assert.equal(by.old.readOnly, false, 'a channel read before the migration is closed to posts');
});

test('the app: Shape HQ has no composer, and only a member channel\'s host may change its picture', () => {
  assert.match(CLIENT, /\{thread\.readOnly \? \(\n\s*\/\/ A channel only Shape posts in \(Shape HQ\): no composer, and it says why\.\n\s*<div data-channel-readonly=""[^\n]*\n\s*\{tr\('feed:channels\.readOnly'[^\n]*\n\s*<\/div>\n\s*\) : \(\n\s*<BSMessageComposer /, 'the read-only note does not replace the composer');
  assert.match(CLIENT, /const canSetPicture = !!\(thread\.channelId && thread\.isHost && !thread\.official && !String\(thread\.channelId\)\.startsWith\('sample'\)/, 'the picture change is not for the host of a member channel alone');
  assert.match(CLIENT, /\{canSetPicture && \(/, 'the camera button is not gated on canSetPicture');
  assert.match(CLIENT, /if \(!file \|\| !canSetPicture\) return;/, 'the upload is not gated on canSetPicture');
});
