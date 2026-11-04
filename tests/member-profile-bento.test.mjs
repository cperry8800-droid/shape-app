// tests/member-profile-bento.test.mjs
//
// The member profile as tiles (option C, "Bento"). Owner, 2026-11-04: "hate the look of this on client
// profile, need this to look less analog and boring", then of three designs, "go with c but dont change
// the look or design of followers, following part. leave that as is. and dont forget to keep the currect
// activity feed look the same as well" (the feed: "The feed that shows activities logged").
//
// So: the counts line and the activity cards are as they were; Log activity and Follow are the lit tile,
// Edit profile and Message quiet ones, the coach a wide tile, the tabs an icon bar, the photos a mosaic
// and the shelf award cards. The coach profile, which shares BSProfileExtras and BSTerrainTabs, keeps
// its numbered shelf, its photo strip and its tab row.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, loadCarved, drive, textOf, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

const mod = await loadBroadsheet(['BSTerrainProfile', 'BSFollowBlock', 'BSProfileExtras', 'BSTerrainTabs', 'bsDemoMemberCustom']);
const bento = await loadCarved('BSMemberBento.jsx');
const CLIENT = stripComments(readFileSync(SRC, 'utf8'));
const BENTO_SRC = readFileSync(new URL('../mobile-app/src/broadsheet/BSMemberBento.jsx', import.meta.url), 'utf8');
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const withAttr = (nodes, attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);
const fnBody = (marker) => { const at = CLIENT.indexOf(marker); assert.ok(at > 0, `${marker} is gone`); return CLIENT.slice(at, CLIENT.indexOf('\nfunction ', at + marker.length)); };
const INK = '#f2ede4';
const QUINN = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
const signedOut = () => { globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) }; };
const signedInAs = (id) => { globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id } }) }; };

test('the counts line is as it was: three words on one line, no tiles', () => {
  signedInAs('u-me');
  for (const isSelf of [true, false]) {
    const d = drive(mod.BSFollowBlock, { userId: isSelf ? 'u-me' : 'u-priya', isSelf, c: '#34d6c5', INK, BG: '#100d0a', name: 'Priya Shah', variant: 'coach', onMessage() {} });
    const counts = withAttr(d.nodes(), 'data-follow-count');
    assert.equal(counts.length, 3);
    for (const n of counts) {
      const st = n.props.style;
      assert.equal(st.background, 'transparent', 'a count became a tile');
      assert.equal(st.border, 0);
      assert.equal(st.borderRadius, undefined, 'a count is rounded');
      assert.equal(st.fontSize, 14, 'a count changed size');
      assert.match(st.fontFamily, /^'Saira'/, 'a count left the page\'s face');
      assert.equal(st.gridArea, undefined, 'a count was laid into a grid');
    }
    // One row, wrapping, as before.
    const row = d.nodes().find((n) => n.type === 'div' && n.props.style && n.props.style.columnGap === 16);
    assert.ok(row, 'the counts lost their row');
    assert.equal(row.props.style.display, 'flex');
  }
});

test('on someone else\'s page Follow and Message are small pills in the counts\' row: Follow lit, Message quiet', () => {
  // Owner, 2026-11-04: "also move the [Follow] up to where followers, following are", "and make smaller to
  // hit the look of that section of page", then of Message, "same thing for the message box".
  signedInAs('u-me');
  const d = drive(mod.BSFollowBlock, { userId: 'u-priya', isSelf: false, c: '#34d6c5', INK, BG: '#100d0a', name: 'Priya Shah', variant: 'coach', onMessage() {} });
  const nodes = d.nodes();
  const [toggle] = withAttr(nodes, 'data-follow-toggle');
  const [message] = withAttr(nodes, 'data-follow-message');
  const pillOf = (btn) => [btn.props.children].flat(3).find((n) => n && n.props && n.props['data-follow-pill'] !== undefined);
  const fp = pillOf(toggle);
  const mp = pillOf(message);
  // In the counts' row: the actions sit in the row that holds the three counts.
  const [actions] = withAttr(nodes, 'data-follow-actions');
  const row = nodes.find((n) => n && n.props && [n.props.children].flat(3).includes(actions));
  assert.ok(row, 'Follow and Message left the counts\' row');
  assert.equal([row.props.children].flat(3).filter((n) => n && n.props && n.props['data-follow-count'] !== undefined).length, 3, 'the row lost its counts');
  // Small: 32px pills in the counts' face, each a 44px target.
  const [cnt] = withAttr(nodes, 'data-follow-count');
  for (const p of [fp, mp]) {
    assert.equal(p.props.style.height, 32);
    assert.equal(p.props.style.borderRadius, 99);
    assert.equal(p.props.style.fontFamily, cnt.props.style.fontFamily, 'a pill is not in the counts\' face');
    assert.ok(p.props.style.fontSize <= cnt.props.style.fontSize, 'a pill\'s words are bigger than the counts\'');
  }
  for (const btn of [toggle, message]) assert.equal(btn.props.style.minHeight, 44, 'a pill is under 44 to tap');
  assert.equal(toggle.props.style.minWidth, 44);
  assert.equal(toggle.props.style.background, 'transparent', 'the target is drawn, not the pill');
  // Follow lit in the profile's colour, Message quiet.
  assert.equal(fp.props.style.background, '#34d6c5');
  assert.notEqual(mp.props.style.background, '#34d6c5', 'Message is lit');
  assert.match(mp.props.style.border, /^1px solid rgba\(/, 'Message is not the quiet pill');
  assert.ok(!nodes.some(named('BSMpIconBox')), 'a tile\'s icon square is back');
  // Following is a quiet pill with a check, and says so once (no ✓ in the words beside the icon).
  const src = fnBody('function BSFollowBlock(');
  assert.match(src, /style=\{pill\(!\(following \|\| requested\)\)\}/);
  assert.match(src, /name=\{following \? 'check' : requested \? 'clock' : 'plus'\}/);
  assert.doesNotMatch(src.slice(src.indexOf("if (variant === 'coach')"), src.indexOf('// ── Ledger variant')), /`✓ \$\{tr\('profile:follow\.following'/);
  // With no Message, Follow alone.
  const alone = drive(mod.BSFollowBlock, { userId: 'u-priya', isSelf: false, c: '#34d6c5', name: 'Priya Shah', variant: 'coach' });
  assert.equal(withAttr(alone.nodes(), 'data-follow-toggle').length, 1);
  assert.equal(withAttr(alone.nodes(), 'data-follow-message').length, 0);
});

test('the counts sit right under the photo, above the bio; a visitor\'s Follow and Message ride in the counts\' row', () => {
  // Owner, 2026-11-04: "move the followers, following row above the bio just below picture on profile".
  signedOut();
  const d = drive(mod.BSTerrainProfile, { person: QUINN, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  const nodes = d.nodes();
  const at = (n) => nodes.indexOf(n);
  const follow = nodes.find(named('BSFollowBlock'));
  const [nameEl] = withAttr(nodes, 'data-member-name');
  const [meta] = withAttr(nodes, 'data-member-meta');
  const [actions] = withAttr(nodes, 'data-member-actions');
  assert.ok(at(nameEl) < at(follow), 'the counts went above the name');
  assert.ok(at(follow) < at(meta) && at(meta) < at(actions), 'the counts are not between the photo and the tier line');
  // The bio and the tier line ride inside the follow block, so one block holds the counts and the Follow
  // that changes them.
  const body = fnBody('function BSTerrainProfile(');
  const block = body.slice(body.indexOf('<BSFollowBlock '), body.indexOf('</BSFollowBlock>'));
  for (const attr of ['data-member-bio', 'data-member-meta']) assert.ok(block.includes(attr), `${attr} left the follow block`);
  // The countdown is under the name, as their status (owner, 2026-11-04: "also move this somewhere else on
  // client profile"; it sat between the Shape Score row and Log activity).
  assert.ok(!block.includes('data-member-start'), 'the countdown is back between the Score row and the tiles');
  const nameAt = body.indexOf('data-member-name');
  const startAt = body.indexOf('data-member-start');
  assert.ok(nameAt > -1 && startAt > nameAt && startAt < body.indexOf('<BSFollowBlock '), 'the countdown sits in the name\'s block, before the counts');
  assert.ok(body.indexOf('data-member-bio') > body.indexOf('<BSFollowBlock '), 'the bio is above the counts again');
  // In the block: the counts with a visitor's Follow and Message in their row, then what the host put inside.
  signedInAs('u-me');
  const v = drive(mod.BSFollowBlock, { userId: 'u-priya', isSelf: false, c: '#34d6c5', INK, name: 'Priya Shah', variant: 'coach', onMessage() {}, children: { type: 'p', props: { 'data-host-bio': '', children: 'bio' } } });
  const vn = v.nodes();
  const [count] = withAttr(vn, 'data-follow-count');
  const [bio] = withAttr(vn, 'data-host-bio');
  const [buttons] = withAttr(vn, 'data-follow-actions');
  assert.ok(vn.indexOf(count) < vn.indexOf(buttons) && vn.indexOf(buttons) < vn.indexOf(bio), 'the order is not counts with Follow, then the bio');
  // With no one to count, the bio still shows.
  signedOut();
  const none = drive(mod.BSFollowBlock, { userId: null, isSelf: false, name: '', variant: 'coach', children: 'the bio' });
  assert.equal(none.text, 'the bio');
});

test('on your own page Log activity is the lit tile over two columns, Edit profile the quiet one', () => {
  signedOut();
  const d = drive(mod.BSTerrainProfile, { person: QUINN, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  const nodes = d.nodes();
  const [grid] = withAttr(nodes, 'data-member-actions');
  // Owner, 2026-11-04: "dont have to be such think bubbles, with slightly more spacing between them":
  // Log three fifths, Edit two (its words on one line at 390px), 44px thin, 10px apart.
  assert.equal(grid.props.style.gridTemplateColumns, 'minmax(0, 3fr) minmax(0, 2fr)');
  assert.equal(grid.props.style.gap, 10);
  const [log] = withAttr(nodes, 'data-member-log');
  const [edit] = withAttr(nodes, 'data-member-edit');
  assert.equal(log.props.style.gridColumn, undefined);
  assert.equal(log.props.style.borderRadius, 14);
  assert.equal(log.props.style.backgroundImage, bento.BS_MP_SHEEN);
  assert.equal(log.props.style.boxShadow.startsWith('0 6px 14px -6px rgba('), true);
  assert.equal(grid.props.style.gridAutoRows, 'minmax(44px, auto)', 'the tiles are not condensed');
  assert.equal(edit.props.style.backgroundImage, undefined, 'Edit profile is lit');
  assert.equal(edit.props.style.alignItems, 'center', 'Edit profile is not the narrow tile');
  assert.equal(edit.props.style.overflowWrap, 'anywhere', 'a long word ("Редактировать") runs out of the narrow tile');
  // The coach is a wide tile with the phase as chips, and still opens the coach.
  const [coach] = withAttr(nodes, 'data-member-coach');
  assert.equal(coach.props.style.marginTop, 10, 'the coach tile sits tight under the tiles again');
  // Condensed: "Coached by" and the name on one line.
  assert.match(textOf(coach), /^MOCoached by Maya Okafor/);
  assert.equal(withAttr(nodes, 'data-member-phase').length, 1, 'the phase lost its chips');
  // The tiles keep the weights they are written with (inside BSCleanType); the counts sit outside it.
  const contains = (parent, child) => {
    const walk = (n) => n === child || (n && typeof n === 'object' && (Array.isArray(n) ? n.some(walk) : !!(n.props && walk(n.props.children))));
    return walk(parent && parent.props && parent.props.children);
  };
  const boxes = nodes.filter(named('BSCleanType'));
  assert.ok(boxes.some((b) => contains(b, grid) && contains(b, coach)), 'the tiles left the clean box');
  const follow = nodes.find(named('BSFollowBlock'));
  assert.ok(follow && !boxes.some((b) => contains(b, follow)), 'the counts went into the clean box');
});

test('the activity feed is as it was: the Wall\'s cards, under the photos and the shelf', () => {
  // "The feed that shows activities logged": each post as BSActivityCard draws it on the Wall in Chat,
  // breaking out of the tab body's 8px gutter, as before this redesign.
  const body = fnBody('function BSTerrainProfile(');
  const at = body.indexOf("{tab === 'activity' && (");
  assert.ok(at > 0);
  const activity = body.slice(at, body.indexOf('{showCustomizer &&', at));
  assert.match(activity, /<BSProfileExtras [^>]*\bclean\b/);
  // Every other post in glass, as the Wall's (owner, 2026-11-04: "every other post gets the glassy look …
  // apply these changes to profile activity feeds as well").
  assert.match(activity, /<div key=\{a\.key \|\| i\} style=\{\{ margin: '0 -8px' \}\}>\s*<BSActivityCard a=\{a\} ctx=\{profileCtx\} onAuthorPage isLast=\{i === feedEff\.length - 1\} pagePad=\{0\} variant="magazine" glass=\{i % 2 === 1\} \/>/);
  assert.doesNotMatch(activity, /bsMp|BSMp|BSMember/, 'the feed took a tile');
});

test('the tab row is an icon bar on the member profile; the coach profile keeps its row', () => {
  const src = fnBody('function BSTerrainTabs(');
  assert.match(src, /const ICON = \{ activity: 'pulse', signals: 'wave', climb: 'peak', playlists: 'note' \};/);
  assert.match(src, /backdropFilter: 'blur\(20px\) saturate\(1\.4\)'/);
  // The member profile asks for it; the coach profile does not.
  assert.match(fnBody('function BSTerrainProfile('), /<BSTerrainTabs look="coach" /);
  assert.doesNotMatch(fnBody('function BSSignalCoachProfile('), /<BSTerrainTabs look="coach"/);
});

test('the photos are a mosaic and the shelf award cards on the member profile, the strip and rows elsewhere', () => {
  const custom = mod.bsDemoMemberCustom();
  const clean = drive(mod.BSProfileExtras, { custom, c: '#c0533b', INK, BG: '#fff', isSelf: false, ledger: true, clean: true, demo: true, bleed: 8, showPrompts: false });
  const mosaic = clean.nodes().find(named('BSMemberWallMosaic'));
  const cards = clean.nodes().find(named('BSMemberShelfCards'));
  assert.ok(mosaic, 'the member profile lost its mosaic');
  assert.ok(cards, 'the member profile lost its award cards');
  assert.equal(mosaic.props.label, 'The wall');
  assert.equal(typeof mosaic.props.onOpen, 'function', 'a photo opens nothing');
  assert.match(mosaic.props.shotLabel(0), /^Open photo /);
  assert.equal(cards.props.head, 'The shelf · Proudest');
  assert.equal(clean.nodes().filter(named('BSTStationHead')).length, 0, 'the old shelf head is back on the member profile');
  // Elsewhere (the coach profile passes no `clean`) the strip and the numbered rows stay.
  const coach = drive(mod.BSProfileExtras, { custom, c: '#c0533b', INK, BG: '#fff', isSelf: false, ledger: true, demo: true, bleed: 20 });
  assert.equal(coach.nodes().filter(named('BSMemberWallMosaic')).length + coach.nodes().filter(named('BSMemberShelfCards')).length, 0);
  assert.equal(coach.nodes().filter(named('BSTStationHead')).length, 1);
});

test('the mosaic: the newest big, two beside it, then rows of three that close', () => {
  const shots = (n) => Array.from({ length: n }, (_, i) => ({ url: `https://x/${i}.jpg`, caption: i % 2 ? `shot ${i}` : '' }));
  const layout = (n) => {
    const d = drive(bento.BSMemberWallMosaic, { wall: shots(n), onOpen() {}, shotLabel: (i) => `Open photo ${i + 1}`, label: 'The wall', INK, t: { isLight: false } });
    const grid = d.nodes()[0];
    const figs = d.nodes().filter((x) => x.type === 'figure');
    return { cols: grid.props.style.gridTemplateColumns, spans: figs.map((f) => [f.props.style.gridColumn, f.props.style.gridRow]) };
  };
  assert.deepEqual(layout(1), { cols: 'repeat(1, minmax(0, 1fr))', spans: [['auto', 'auto']] });
  assert.deepEqual(layout(2).spans, [['auto', 'auto'], ['auto', 'auto']]);
  assert.deepEqual(layout(3).spans, [['span 2', 'span 2'], ['auto', 'auto'], ['auto', 'auto']]);
  assert.deepEqual(layout(4).spans.slice(3), [['span 3', 'auto']], 'one more runs wide');
  assert.deepEqual(layout(5).spans.slice(3), [['auto', 'auto'], ['span 2', 'auto']], 'two more close their row');
  assert.deepEqual(layout(6).spans.slice(3), [['auto', 'auto'], ['auto', 'auto'], ['auto', 'auto']]);
  // Every photo is a door to the viewer, named for a screen reader; a caption sits on the photo.
  const d = drive(bento.BSMemberWallMosaic, { wall: shots(3), onOpen() {}, shotLabel: (i) => `Open photo ${i + 1}`, label: 'The wall', INK, t: { isLight: true } });
  const btns = d.nodes().filter((x) => x.type === 'button');
  assert.deepEqual(btns.map((b) => b.props['aria-label']), ['Open photo 1', 'Open photo 2', 'Open photo 3']);
  assert.equal(d.nodes().filter((x) => x.type === 'figcaption').length, 1);
});

test('the shelf\'s cards: the head split at " · ", the proudest lit, each date on a chip', () => {
  const shelf = [{ title: 'First 5K under 25:00', when: 'Mar 2026' }, { title: 'Bodyweight deadlift ×2', when: 'Jan 2026' }, { title: 'No date' }];
  const d = drive(bento.BSMemberShelfCards, { shelf, head: 'The shelf · Proudest', INK, c: '#c0533b', onC: '#ffffff', t: { isLight: false, PAPER: '#0f0e0c', PAPER2: '#1a1916' }, bleed: 8, gut: 22 });
  const [head] = withAttr(d.nodes(), 'data-shelf-head');
  assert.equal(textOf(head), 'The shelfProudest');
  assert.match(d.text, /First 5K under 25:00[\s\S]*Mar 2026/);
  const icons = d.nodes().filter(named('BSMpIcon')).map((n) => n.props.name);
  assert.deepEqual(icons, ['trophy', 'award', 'award'], 'the proudest is not the trophy');
  assert.doesNotMatch(d.text, /undefined/, 'a moment with no date drew one');
  // It fits the page (owner, 2026-11-04: "make items on the shelf fit on page, no side scrolling"):
  // a grid, three across for three, flat cards two to a row for one, two or four; nothing scrolls.
  const grid = (k) => withAttr(drive(bento.BSMemberShelfCards, { shelf: Array.from({ length: k }, (_, i) => ({ title: `m${i}`, when: 'Mar 2026' })), head: 'The shelf · Proudest', INK, c: '#c0533b', onC: '#fff', t: { isLight: false } }).nodes(), 'data-member-shelf')[0].props.style;
  assert.equal(grid(3).gridTemplateColumns, 'repeat(3, minmax(0, 1fr))');
  assert.equal(grid(4).gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.equal(grid(2).gridTemplateColumns, 'repeat(2, minmax(0, 1fr))');
  assert.equal(grid(1).gridTemplateColumns, 'repeat(1, minmax(0, 1fr))');
  for (const k of [1, 2, 3, 4]) {
    assert.equal(grid(k).display, 'grid');
    assert.equal(grid(k).overflowX, undefined, `${k} moments scroll sideways`);
  }
  // A long date (the member's own words, up to 20 characters) stays inside its card, three across on a
  // narrow phone: no wider than the card, and it wraps (Codex P2 on #2585).
  const long = drive(bento.BSMemberShelfCards, { shelf: [0, 1, 2].map((i) => ({ title: `m${i}`, when: 'September 2026 · Q3' })), head: 'The shelf', INK, c: '#c0533b', onC: '#fff', t: { isLight: false } });
  for (const chip of withAttr(long.nodes(), 'data-shelf-when')) {
    assert.equal(chip.props.style.maxWidth, '100%', 'a date chip can run wider than its card');
    assert.notEqual(chip.props.style.whiteSpace, 'nowrap', 'a date chip cannot wrap');
    assert.equal(chip.props.style.overflowWrap, 'anywhere');
  }
  // A head with no " · " is the head alone.
  const plain = drive(bento.BSMemberShelfCards, { shelf, head: 'Étagère', INK, c: '#c0533b', onC: '#fff', t: { isLight: true } });
  assert.equal(textOf(withAttr(plain.nodes(), 'data-shelf-head')[0]), 'Étagère');
});

test('the tiles module stands alone: no import back into the client, no window global, no coloured emoji', () => {
  assert.doesNotMatch(BENTO_SRC, /from '\.\/iosAppBroadsheetClient/);
  assert.doesNotMatch(BENTO_SRC.replace(/^\s*\/\/.*$/gm, ''), /window\./);
  assert.doesNotMatch(BENTO_SRC, /\p{Extended_Pictographic}/u);
  assert.match(CLIENT, /import \{ BSMpIcon, BSMpIconBox, bsMpTile, bsMpAction, bsMpCoachRing, BSMemberWallMosaic, BSMemberShelfCards \} from '\.\/BSMemberBento\.jsx';/);
});

// Owner, 2026-11-04, of the Shape Score row, the Log activity / Edit profile tiles and the Coached by card:
// "make these sit better together. they each look out of place", then "idk if its the colors or what".
// The Score row was a bordered strip with a gold spine, a mono caps label and its own →, beside a lit tile
// and a quiet coach tile. Now it is drawn as the coach card is, and Log activity is the one lit tile.
test('the Shape Score row and the Coached by card are one kind of tile; Log activity is the one lit thing', () => {
  signedOut();
  const nodes = drive(mod.BSTerrainProfile, { person: QUINN, onBack() {}, onMessage() {}, isSelf: true, meMode: true }).nodes();
  const [score] = withAttr(nodes, 'data-member-score');
  const [coachWrap] = withAttr(nodes, 'data-member-coach');
  const coach = [coachWrap.props.children].flat(3).find((n) => n && n.type === 'button');
  assert.ok(coach, 'the coach card opens the coach');
  const s = score.props.style;
  const k = coach.props.style;
  for (const prop of ['borderRadius', 'background', 'border', 'boxShadow', 'minHeight', 'padding', 'gap', 'alignItems']) {
    assert.deepEqual(s[prop], k[prop], `the Score row's ${prop} is not the coach card's`);
  }
  assert.equal(s.borderRadius, 14, 'the tiles\' radius');
  assert.equal(s.minHeight, 48);
  assert.equal(s.boxShadow === undefined || !/inset 3px 0 0/.test(String(s.boxShadow)), true, 'the gold spine is back');
  // Its words: a label then the bold tier, the points and the streak under them; a chevron, no →.
  assert.match(textOf(score), /^Shape Score .+ tier1,284 pts · .+-day streak$/);
  assert.doesNotMatch(textOf(score), /→/);
  const kids = [score.props.children].flat(4).filter(Boolean);
  const icons = (n) => (n && typeof n === 'object' ? (named('BSMpIcon')(n) ? [n] : [n.props && n.props.children].flat(5).flatMap(icons)) : []);
  assert.deepEqual(kids.flatMap(icons).map((n) => n.props.name), ['award', 'chevron'], 'the ring\'s mark and the chevron');
  assert.equal(score.props['aria-label'], `Shape Score: ${textOf(score).replace(/^Shape Score /, '').replace(/tier(?=1,284)/, 'tier · ')}`, 'a screen reader hears it whole');
  // The phase chips are quiet ink; the tier's colour stays on the rings and Log activity.
  const [phase] = withAttr(nodes, 'data-member-phase');
  const chips = [phase.props.children].flat(3).filter((n) => n && n.props && n.props.style && n.props.style.borderRadius === 99);
  assert.ok(chips.length >= 1, 'the phase lost its chips');
  const [log] = withAttr(nodes, 'data-member-log');
  const rgb = (hex) => { const h = String(hex).replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)).join(', '); };
  const tier = rgb(log.props.style.background);
  assert.match(tier, /^\d+, \d+, \d+$/, 'the tier colour reads as a hex colour');
  for (const chip of chips) assert.ok(!chip.props.style.background.includes(tier), `a chip is in the tier's colour again (${chip.props.style.background})`);
  assert.equal(log.props.style.backgroundImage, bento.BS_MP_SHEEN, 'Log activity is still the lit tile');
});
