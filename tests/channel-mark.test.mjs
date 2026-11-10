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
  assert.match(CLIENT, /<BSChannelMark ch=\{\{ name: thread\.channelName[^\n]*size=\{BS_CHAT_SIZES\.headMark\}/, 'the channel header\'s circle is not the table\'s headMark');
  assert.match(CLIENT, /headFace: 48, headName: 25,\n[^}]*headMark: 40,/, 'the channel header\'s circle is not 40px under a 48px face');
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
  // Each way of writing the bucket, on its own: upload, replace and remove are the host's alone.
  const host = "bucket_id = 'channel-pictures' and public\\.can_edit_channel_picture\\(\\(storage\\.foldername\\(name\\)\\)\\[1\\]\\)";
  assert.match(sql, new RegExp(`for insert to authenticated\\n  with check \\(${host}\\);`), 'anyone uploads into any channel\'s folder');
  assert.match(sql, new RegExp(`for update to authenticated\\n  using \\(${host}\\);`), 'anyone replaces a channel\'s picture');
  assert.match(sql, new RegExp(`for delete to authenticated\\n  using \\(${host}\\);`), 'anyone removes a channel\'s picture');
  assert.match(sql, /revoke execute on function public\.can_edit_channel_picture\(text\) from public, anon;/);
  assert.match(sql, /and not exists \(select 1 from public\.channels c where c\.id = channel_id and c\.read_only\)/, 'members can post in a read-only channel');
  assert.match(sql, /where not exists \(\n  select 1 from public\.channels where official and lower\(name\) = 'shape hq'\n\)/, 'Shape HQ is not created once');
  assert.match(sql, /select 'Shape HQ', [^\n]*, null, 'public', true, true\n/, 'Shape HQ is not created read-only and Shape\'s');
});

test('Shape\'s own is a flag only Shape sets, not "no owner"', () => {
  const sql = read('supabase-migrations/2026-11-10-channel-pictures-and-shape-hq.sql');
  assert.match(sql, /add column if not exists official boolean not null default false;/);
  // The PR Wall the server posts into, marked once, so a later run leaves a deleted member's channel be.
  assert.match(sql, /update public\.channels set official = true\nwhere id = \(select id from public\.channels where name = 'PR Wall' and created_by is null order by created_at limit 1\)\n  and not exists \(select 1 from public\.channels where official and lower\(name\) = 'pr wall'\);/, 'the PR Wall is not marked Shape\'s, once');
  assert.match(sql, /check \(not read_only or official\);/, 'a member\'s channel can be read-only');
  assert.match(sql, /create unique index if not exists channels_official_name_key on public\.channels \(lower\(name\)\) where official;/);
  // A member's request sets neither flag and keeps the owner; Shape's own requests carry no member.
  const fn = sql.slice(sql.indexOf('create or replace function public.channels_guard_shape_fields()'), sql.indexOf('create trigger channels_guard_shape_fields'));
  assert.match(fn, /if auth\.uid\(\) is null then return new; end if;/);
  assert.match(fn, /if tg_op = 'INSERT' then\n    if new\.official or new\.read_only then\n      raise exception/, 'a member can create an official or read-only channel');
  assert.match(fn, /elsif new\.official is distinct from old\.official\n     or new\.read_only is distinct from old\.read_only\n     or new\.created_by is distinct from old\.created_by then\n    raise exception/, 'a host can make their channel Shape\'s, read-only, or ownerless');
  assert.match(sql, /create trigger channels_guard_shape_fields\n  before insert or update on public\.channels\n  for each row execute function public\.channels_guard_shape_fields\(\);/);
  // Both apps take the flag; with no flag (before the migration) the ownerless channel, as before.
  const rule = 'official: c.official === true || (c.official === undefined && !c.created_by),';
  assert.ok(WIDGET.includes(rule), 'the website does not read the flag');
  assert.ok(read('mobile-app/src/services/shapeBackend.js').includes(rule), 'the app does not read the flag');
  // The app's list pins Shape HQ and the PR Wall only when they are Shape's.
  assert.match(CLIENT, /const _shapeOwn = \(c\) => !!c && \(c\.official === true \|\| String\(c\.id \|\| ''\)\.startsWith\('sample-'\)\);\n\s*const _isHQ = \(c\) => _shapeOwn\(c\) && \(c\.name \|\| ''\)\.toLowerCase\(\) === 'shape hq';\n\s*const _isPRWall = \(c\) => _shapeOwn\(c\) && \(c\.name \|\| ''\)\.toLowerCase\(\) === 'pr wall';/, 'the app pins a member\'s channel named Shape HQ as Shape\'s');
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
// `members` answer like the API: sorted, offset by `range`, at most 1,000 rows (PostgREST's max-rows);
// `ignoreRange`, a server that answers every page with the first one. `log` counts the member reads.
// `failPage`: the member page that starts at that index fails; `failOwn`: the member's own rows fail.
function liftAppRead(rows, uid = 'u1', { members = [], ignoreRange = false, log = [], failPage = -1, failOwn = false } = {}) {
  const src = read('mobile-app/src/services/shapeBackend.js');
  const from = src.indexOf('async function listChannels()');
  const to = src.indexOf('async function setChannelPicture(');
  assert.ok(from > 0 && to > from, 'the app\'s channel read moved');
  const q = (table) => {
    const st = { range: null, user: null };
    const answer = () => {
      if (table === 'channels') return rows;
      if (table !== 'channel_members') return [];
      log.push(st.user ? 'own' : 'page');
      const all = members.filter((m) => !st.user || m.user_id === st.user)
        .sort((a, b) => (a.channel_id + '|' + a.user_id).localeCompare(b.channel_id + '|' + b.user_id));
      const at = st.range && !ignoreRange ? st.range[0] : 0;
      const end = st.range && !ignoreRange ? st.range[1] + 1 : at + 1000;
      return all.slice(at, Math.min(end, at + 1000));
    };
    const b = {
      select: () => b, order: () => b, in: () => b,
      eq: (col, v) => { if (col === 'user_id') st.user = v; return b; },
      range: (a, z) => { st.range = [a, z]; return b; },
      then: (ok, ko) => {
        const fails = table === 'channel_members' && (st.user ? failOwn : (st.range && st.range[0] === failPage * 1000));
        if (fails) { log.push(st.user ? 'own-failed' : 'page-failed'); return Promise.resolve({ data: null, error: { message: 'down' } }).then(ok, ko); }
        return Promise.resolve({ data: answer(), error: null }).then(ok, ko);
      },
    };
    return b;
  };
  const supabase = {
    from: (t) => q(t),
    storage: { from: (bucket) => ({ getPublicUrl: (p) => ({ data: { publicUrl: `https://cdn.test/${bucket}/${p}` } }) }) },
  };
  const state = { user: { id: uid } };
  return new Function('supabase', 'state', `${src.slice(from, to)}\nreturn listChannels();`)(supabase, state);
}

test('the app reads a channel\'s picture, read-only and owner as the website does', async () => {
  const res = await liftAppRead([
    { id: 'hq', name: 'Shape HQ', created_by: null, official: true, visibility: 'public', read_only: true },
    { id: 'mine', name: 'Shape HQ', created_by: 'u1', official: false, visibility: 'public', picture_path: 'mine/a.jpg' },
    // A deleted member's channel: no owner (ON DELETE SET NULL), and not Shape's.
    { id: 'orphan', name: 'PR Wall', created_by: null, official: false, visibility: 'public' },
    // Read before the migration has run: no flag, so the ownerless channel is Shape's, as before.
    { id: 'old', name: 'run club', created_by: 'u2', visibility: 'public' },
    { id: 'oldprw', name: 'PR Wall', created_by: null, visibility: 'public' },
  ]);
  const by = Object.fromEntries(res.data.map((r) => [r.id, r]));
  assert.equal(by.hq.readOnly, true, 'Shape HQ is open to posts in the app');
  assert.equal(by.hq.official, true, 'Shape HQ is not Shape\'s');
  assert.equal(by.mine.official, false, 'a member\'s channel named Shape HQ is taken for Shape\'s');
  assert.equal(by.orphan.official, false, 'a deleted member\'s channel is taken for Shape\'s');
  assert.equal(by.oldprw.official, true, 'before the migration, the ownerless PR Wall is not Shape\'s');
  assert.equal(by.old.official, false);
  assert.equal(by.mine.readOnly, false);
  assert.equal(by.mine.picture, 'https://cdn.test/channel-pictures/mine/a.jpg', 'the address is not built from the stored path');
  assert.equal(by.old.picture, null, 'a channel with no picture (or before the migration) shows one');
  assert.equal(by.old.readOnly, false, 'a channel read before the migration is closed to posts');
});

test('the app reads every membership a page at a time; a stuck server stops, and your own rows still count', async () => {
  // 2,500 members of a channel, the member ('u1') sorted last (Codex P2 on #2676).
  const members = [];
  for (let i = 0; i < 2500; i++) members.push({ channel_id: 'run', user_id: 'm' + String(i).padStart(4, '0'), role: 'member', pinned: false });
  members.push({ channel_id: 'run', user_id: 'u1', role: 'host', pinned: true });
  const ch = [{ id: 'run', name: 'run club', created_by: 'u2', official: false, visibility: 'public' }];
  const log = [];
  const full = (await liftAppRead(ch, 'u1', { members, log })).data[0];
  assert.equal(full.memberCount, 2501, 'the count stops at one answer');
  assert.ok(full.joined && full.isHost && full.pinned, 'a member past the first answer reads as not in the channel');
  assert.equal(log.filter((x) => x === 'page').length, 3, 'the rows were not read a page at a time');
  const stuckLog = [];
  const stuck = (await liftAppRead(ch, 'u1', { members, ignoreRange: true, log: stuckLog })).data[0];
  assert.equal(stuckLog.filter((x) => x === 'page').length, 100, 'the read does not stop at its last page');
  assert.equal(stuckLog.filter((x) => x === 'own').length, 1, 'your own rows are not read on their own past the last page');
  assert.ok(stuck.joined && stuck.isHost && stuck.pinned, 'past the last page, the member reads as not in the channel');
  // A later page fails: the paging stops there, and the member's own rows still count (Codex P2 on #2676).
  const cut = (await liftAppRead(ch, 'u1', { members, failPage: 1 })).data[0];
  assert.ok(cut.joined && cut.isHost && cut.pinned, 'a failed later page shows the member as not in their channel');
  // A failed first page, or a failed read of the member's own rows, fails the read: never a partial set.
  await assert.rejects(liftAppRead(ch, 'u1', { members, failPage: 0 }), 'a failed first page is passed off as no members');
  await assert.rejects(liftAppRead(ch, 'u1', { members, failPage: 1, failOwn: true }), 'a partial set is passed off as whole');
});

test('a picture that failed to load is that address, not the circle: a new one gets its own try', () => {
  for (const [name, src] of [['app', MARK], ['website', WIDGET]]) {
    assert.match(src, /const \[brokenSrc, setBrokenSrc\] = React\.useState\(null\);\n\s*const broken = m\.kind === ['"]picture['"] && brokenSrc === m\.src;/, `the ${name}'s circle keeps a failure past a new picture`);
    assert.match(src, /onError=\{\(\) => setBrokenSrc\(m\.src\)\}/, `the ${name}'s circle does not record which address failed`);
    assert.doesNotMatch(src, /setBroken\(true\)/, `the ${name}'s circle has a failure flag again`);
  }
});

// Codex P1 on #2676: a channel opened from search or a shared-channel card carried a few fields, so
// Shape HQ opened with a composer and a host lost their picture controls. Codex P2: Shape HQ has no
// members, and the list's first tap joined it instead of opening it.
test('the app opens a channel as the list has it, and Shape HQ without joining it', () => {
  // Search keeps the channel's own fields.
  assert.match(CLIENT, /setChAll\(list\.map\(c => \(\{ id: c\.id, name: c\.name, blurb: c\.description \|\| '', memberCount: [^\n]*, picture: c\.picture \|\| null, official: !!c\.official, readOnly: !!c\.readOnly, isHost: !!c\.isHost, joined: !!c\.joined \}\)\)\);/, 'search drops the channel\'s flags');
  // A deep link is opened as the list has that channel, by its id.
  const link = CLIENT.slice(CLIENT.indexOf("    if (openRequest.channel && openRequest.channel.id != null) {"), CLIENT.indexOf("    // Deep-link to the Wall (Home's"));
  assert.ok(link.length > 0, 'the channel deep link moved');
  assert.match(link, /window\.ShapeChannels\.list\(\)\.then\(\(r\) => \{\n\s*const full = \(\(r && r\.data\) \|\| \[\]\)\.find\(\(c\) => c\.id === asked\.id\);\n\s*openChannelNow\(full \? \{ \.\.\.asked, \.\.\.full \} : asked\);/, 'a deep link opens on the fields it carries');
  assert.doesNotMatch(link, /setTab\('channels'\);\n\s*openChannelNow\(openRequest\.channel\);/, 'a deep link opens on the fields it carries');
  // A read-only channel opens, for a member or not, and its row offers no Join.
  assert.match(CLIENT, /const openable = ch\.joined \|\| ch\.readOnly;\n\s*const openOrJoin = \(\) => openable \? openChannelNow\(ch\) : joinChannelNow\(ch\);/, 'Shape HQ is joined on the first tap');
  assert.match(CLIENT, /\{openable\n\s*\? <button onClick=\{openOrJoin\} aria-label=\{tr\('feed:channels\.openChannel'/, 'Shape HQ\'s row offers Join');
});

// Codex P2 on #2676: Shape HQ has no members, and a channel's unread count and read mark were the
// member's own row, so an announcement badged nobody. Run on a local Postgres against the live
// definitions (17 cases; the PR's description).
test('Shape HQ\'s unread: counted without a row, the reader\'s row made on first open, and both apps watch it', () => {
  const sql = read('supabase-migrations/2026-11-10-shape-hq-unread.sql');
  const unread = sql.slice(sql.indexOf('create or replace function public.channel_unread()'), sql.indexOf('create or replace function public.mark_channel_read('));
  // As before, through the member's own row…
  assert.match(unread, /join public\.channel_members cm on cm\.channel_id = m\.channel_id and cm\.user_id = auth\.uid\(\)\n  where m\.sender_id is distinct from auth\.uid\(\)\n    and \(cm\.last_read_at is null or m\.created_at > cm\.last_read_at\)/);
  // …and, for a channel only Shape posts in, without one: what came after the account was made.
  assert.match(unread, /union all\n  select m\.channel_id, count\(\*\)::bigint\n  from public\.channel_messages m\n  join public\.channels c on c\.id = m\.channel_id and c\.official and c\.read_only/, 'Shape HQ is not counted without a row');
  assert.match(unread, /and not exists \(\n      select 1 from public\.channel_members cm where cm\.channel_id = m\.channel_id and cm\.user_id = auth\.uid\(\)\n    \)/, 'Shape HQ is counted twice for a reader');
  assert.match(unread, /and m\.created_at > coalesce\(\(select u\.created_at from auth\.users u where u\.id = auth\.uid\(\)\), '-infinity'::timestamptz\)/, 'a new member is owed every announcement ever made');
  const mark = sql.slice(sql.indexOf('create or replace function public.mark_channel_read('));
  assert.match(mark, /if not found and exists \(\n    select 1 from public\.channels c where c\.id = p_channel_id and c\.official and c\.read_only\n  \) then\n    insert into public\.channel_members \(channel_id, user_id, role, last_read_at\)\n    values \(p_channel_id, auth\.uid\(\), 'member', now\(\)\)/, 'opening Shape HQ marks nothing read');
  assert.doesNotMatch(sql, /revoke|grant /i, 'the grants changed');
  // Both apps count its new messages.
  assert.match(read('mobile-app/src/services/shapeBackend.js'), /\(ch\.data \|\| \[\]\)\.forEach\(c => \{ if \(c\.joined \|\| \(c\.official && c\.readOnly\)\) _unread\.myChannels\.add\(c\.id\); \}\);/, 'the app does not watch Shape HQ for new messages');
  assert.match(CLIENT, /data\.forEach\(c => \{ if \(c\.joined \|\| \(c\.official && c\.readOnly\)\) window\.ShapeUnread\?\.noteChannel\?\.\(c\.id\); \}\);/, 'the channel list does not watch Shape HQ');
});

test('the app: Shape HQ has no composer, and only a member channel\'s host may change its picture', () => {
  assert.match(CLIENT, /\{thread\.readOnly \? \(\n\s*\/\/ A channel only Shape posts in \(Shape HQ\): no composer, and it says why\.\n\s*<div data-channel-readonly=""[^\n]*\n\s*\{tr\('feed:channels\.readOnly'[^\n]*\n\s*<\/div>\n\s*\) : \(\n\s*<BSMessageComposer /, 'the read-only note does not replace the composer');
  assert.match(CLIENT, /const canSetPicture = !!\(thread\.channelId && thread\.isHost && !thread\.official && !String\(thread\.channelId\)\.startsWith\('sample'\)/, 'the picture change is not for the host of a member channel alone');
  assert.match(CLIENT, /\{canSetPicture && \(/, 'the camera button is not gated on canSetPicture');
  assert.match(CLIENT, /if \(!file \|\| !canSetPicture\) return;/, 'the upload is not gated on canSetPicture');
});
