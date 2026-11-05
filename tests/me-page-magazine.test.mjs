// tests/me-page-magazine.test.mjs
//
// The Me page and the coach profile, after the asks on 2026-10-24:
//   "This needs to get cleaned up" (the Me tab: the score bars, the tabs, THE WALL, THE SHELF),
//   "also why isnt this going away when i scroll down, the message and work with maya" (the dock), and
//   "Design", on the offer to bring the rest of the coach profile into the same look.
// (The live Boost sheet was redrawn on 2026-11-04 and moved to its own module; tests/live-boost-sheet.test.mjs
// holds it now.)
//
// The Me page prints as the Wall does (#2436, #2438, #2439): heads in the headline face over ink
// rules, the active tab underlined in the magazine's teal, square bars and boxes, and a member's own words
// pulled out under a teal quote mark. The dock slides away while the page scrolls down and comes back as
// it scrolls up. That part is driven with real React in jsdom, since it runs on a scroll listener.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { loadBroadsheet, drive, flatten, textOf, THEME, SRC } from './helpers/broadsheet-mount.mjs';
import { stripComments } from './helpers/strip-comments.mjs';
import { IntlMessageFormat } from 'intl-messageformat';

const mod = await loadBroadsheet(['BSTerrainProfile', 'BSTerrainTabs', 'BSTStationHead', 'BSTPullQuote', 'BSProfileExtras', 'bsDemoMemberCustom', 'BSSignalCoachProfile', 'BSProfileCustomizer', 'BSCoachCoachingBlock']);
const named = (name) => (n) => n && typeof n.type === 'function' && n.type.name === name;
const TEAL = '#0a7a72';   // bsWsAccent on a light paper (the harness THEME is light)
const INK = '#111';

test('the Me page wears the coach profile\'s head: the cover, the round photo, the name, one meta line, its own buttons', () => {
  // Owner, 2026-10-31: "member profile needs to match similar design to coaches, interms of overall look,
  // but keep same basic features while you look for improvements"; of the choices, "Cover photo; climb in
  // its tab". The mountain, the name block and the score's bars at the top went; the climb is its own tab.
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const person = { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' };
  const d = drive(mod.BSTerrainProfile, { person, onBack() {}, onMessage() {}, isSelf: true, meMode: true, onOpenScore() {} });
  const nodes = d.nodes();
  const withAttr = (attr) => nodes.filter((n) => n && n.props && n.props[attr] !== undefined);
  const [head] = withAttr('data-member-head');
  assert.ok(head, 'the coach look\'s head is gone');
  assert.equal(head.props['data-tour'], 'hero-me', 'the tour\'s first stop lost the head');
  for (const a of ['data-member-cover', 'data-member-avatar', 'data-member-name', 'data-member-meta', 'data-member-log']) {
    assert.equal(withAttr(a).length, 1, `${a} on the Me page`);
  }
  // Edit profile went (owner, 2026-11-04: "that is already an icon in masthead on that page").
  assert.equal(withAttr('data-member-edit').length, 0, 'Edit profile is back');
  assert.equal(withAttr('data-member-meta')[0].type, 'button', 'your own tier line opens the Shape Score page');
  assert.equal(withAttr('data-member-meta')[0].props['data-tour'], 'hero-score');
  for (const gone of ['BSProfileIdentityHead', 'BSSdBars', 'BSTPullQuote', 'BSProfileDock']) {
    assert.equal(nodes.filter(named(gone)).length, 0, `${gone} is back at the top`);
  }
  // No quote at the top (owner, 2026-10-24); the Training for line under the name stays.
  assert.match(d.text, /Training for/);
  const tabsOf = () => d.nodes().find(named('BSTerrainTabs'));
  assert.equal(tabsOf().props.look, 'coach', 'the tab row is the coach page\'s');
  assert.deepEqual(tabsOf().props.tabs.map((tb) => tb.key), ['activity', 'signals', 'climb', 'playlists']);
  const heads = {}, texts = {};
  for (const tb of tabsOf().props.tabs) {
    tabsOf().props.onPick(tb.key);
    d.render();
    heads[tb.key] = d.nodes().filter(named('BSTStationHead')).map((h) => h.props.label);
    texts[tb.key] = d.text;
  }
  // The sections carry the coach page's mono eyebrows, not the station heads over heavy rules; a tab's
  // first section still takes no head of its own (owner, 2026-10-26: "dont need it showing twice").
  assert.deepEqual(heads.signals, []);
  assert.match(texts.signals, /Day streak[\s\S]*Weekly momentum[\s\S]*Trajectory[\s\S]*Disciplines[\s\S]*Key lifts/);
  assert.deepEqual(heads.climb, []);
  // The join date, the one place most profiles show it, stays on the Climb (Codex P2 on #2468).
  assert.match(texts.climb, /Member since/);
  assert.ok(!heads.activity.includes('The wall'), 'the wall has its head back under the Activity tab');
});

test('the section strip: the names in the headline face between a heavy rule and a hairline, the active one underlined in teal', () => {
  const tabs = [{ key: 'activity', label: 'Activity' }, { key: 'signals', label: 'Signals' }, { key: 'climb', label: 'Climb' }];
  const picked = [];
  const d = drive(mod.BSTerrainTabs, { tabs, active: 'signals', onPick: (k) => picked.push(k), heat: '#c0533b', INK, BG: '#fff', pad: 20, top: 57 });
  const [outer] = d.nodes();
  // Still sticky below the pinned masthead (tests/profile-pinned-mast.test.mjs holds the offset).
  assert.equal(outer.props.style.position, 'sticky');
  assert.equal(outer.props.style.top, 57);
  assert.equal(outer.props.style.background, '#fff', 'the strip scrolls over the page on solid paper');
  assert.equal(outer.props.style.borderTop, `3px solid ${INK}`);
  assert.match(outer.props.style.borderBottom, /^1px solid /);
  // A long name (ru "Восхождение") scrolls the row sideways instead of squeezing it.
  const row = d.nodes().find((n) => n.props && n.props.className === 'bs-hide-scroll');
  assert.equal(row.props.style.overflowX, 'auto');
  const buttons = d.nodes().filter((n) => n.type === 'button');
  assert.deepEqual(buttons.map((b) => b.props['aria-pressed']), [false, true, false]);
  for (const b of buttons) {
    assert.ok(b.props.style.minHeight >= 44, 'a tab is a real 44px target');
    const label = b.props.children;
    assert.match(label.props.style.fontFamily, /^'Saira'/, 'the names are set in the headline face');
    assert.equal(label.props.style.textTransform, 'uppercase');
  }
  assert.equal(buttons[1].props.children.props.style.boxShadow, `inset 0 -2px 0 ${TEAL}`, 'the active name is underlined in the magazine\'s teal');
  assert.equal(buttons[1].props.children.props.style.color, INK);
  assert.equal(buttons[0].props.children.props.style.boxShadow, 'none');
  assert.notEqual(buttons[0].props.children.props.style.color, INK, 'an inactive name is dimmed');
  d.click('Climb');
  assert.deepEqual(picked, ['climb']);
});

test('a station head in the Wall\'s look: the name over a 2px ink rule, its count at the right; the session pages keep theirs', () => {
  const mag = drive(mod.BSTStationHead, { mag: true, heat: '#c0533b', INK, label: 'The wall', meta: '3 shots' });
  const [head] = mag.nodes();
  assert.equal(head.props['data-bst-head'], 'mag');
  assert.equal(head.props.style.borderBottom, `2px solid ${INK}`);
  assert.equal(mag.text, 'The wall3 shots');
  const [label, meta] = head.props.children;
  assert.match(label.props.style.fontFamily, /^'Saira'/);
  assert.equal(meta.props.style.marginLeft, 'auto');
  const plain = drive(mod.BSTStationHead, { heat: '#c0533b', INK, label: 'Splits' });
  assert.equal(plain.nodes()[0].props['data-bst-head'], undefined, 'the session pages\' head changed too');
});

test('a pulled-out line: the teal quote mark, the words, and who said it; nothing when there are no words', () => {
  const d = drive(mod.BSTPullQuote, { INK, text: 'Earn the easy days.', cite: 'Quinn line' });
  const [fig] = d.nodes();
  assert.equal(fig.type, 'figure');
  const [mark, words, cite] = fig.props.children;
  assert.equal(mark.props.children, '“');
  assert.equal(mark.props.style.color, TEAL);
  assert.equal(words.type, 'blockquote');
  assert.equal(words.props.children, 'Earn the easy days.');
  assert.notEqual(words.props.style.fontStyle, 'italic');
  assert.equal(cite.type, 'figcaption');
  assert.equal(cite.props.children, 'Quinn line');
  assert.equal(drive(mod.BSTPullQuote, { INK, cite: 'x' }).nodes().length, 0);
  assert.equal(drive(mod.BSTPullQuote, { INK, text: 'Just the words' }).nodes()[0].props.children[2], null, 'no caption without a cite');
});

test('the wall, the shelf and the prompts in the Wall\'s look: square shots to the screen\'s edge, answers pulled out', () => {
  const d = drive(mod.BSProfileExtras, { custom: mod.bsDemoMemberCustom(), c: '#c0533b', INK, BG: '#fff', isSelf: false, ledger: true, demo: true, bleed: 20 });
  const nodes = d.nodes();
  const heads = nodes.filter(named('BSTStationHead'));
  // The wall takes no head (the Activity tab above names it) and keeps its name for a screen reader.
  assert.deepEqual(heads.map((h) => h.props.label), ['The shelf · Proudest']);
  assert.ok(heads.every((h) => h.props.mag), 'the shelf head is the old one');
  assert.ok(nodes.some((n) => n.props && n.props.role === 'group' && n.props['aria-label'] === 'The wall'), 'the wall lost its accessible name');
  const figs = nodes.filter((n) => n.type === 'figure');
  assert.ok(figs.length >= 2, 'the demo wall has its shots');
  for (const f of figs) {
    const [pic, caption] = f.props.children;
    assert.ok(!pic.props.style.borderRadius, 'a shot is square');
    assert.ok(!pic.props.style.border, 'a shot is unframed');
    if (caption) assert.match(caption.props.style.fontFamily, /^'Saira'/, 'captions are in the headline face');
  }
  // The strip runs to the screen's edge, so the last shot is cut by the screen, not the gutter.
  const strip = nodes.find((n) => n.props && n.props.className === 'bs-hide-scroll' && Array.isArray(n.props.children));
  assert.equal(strip.props.style.marginRight, -20);
  assert.equal(strip.props.style.paddingRight, 20);
  const custom = mod.bsDemoMemberCustom();
  const answers = custom.prompts.filter((p) => p && p.q && p.a).map((p) => p.a);
  assert.ok(answers.length, 'the demo has prompts');
  assert.deepEqual(nodes.filter(named('BSTPullQuote')).map((q) => q.props.text), answers, 'each answer is pulled out');
});

// Owner, 2026-11-04, of the profile editor (Customize): "new design for these pages", "keep designs simple
// … modern, appealing, easy to navigate, not overwhelming, not analog", "reduce the coloring and simplify
// UI more", and then: "organize the page listing different sections or areas on the profile you can choose
// to customize which then brings you to individual page for those customizations instead of listing
// everyone on one, requires less scrolling". So Customize opens on a hub (a compact live preview, then one
// row per area saying what is set there), and each row opens the area's own page: the shared Back, its
// fields in one plain card, its own Save. Colour only as a signal: Save, a focused field, the facet avatar.
const TEAL_SAVE = THEME.isLight ? '#0a7a72' : '#34d6c5';   // bsWsAccent: the page's one colour
const isoIn = (days) => { const d = new Date(Date.now() + days * 864e5); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
// The hub's tiles in order: the half tiles in pairs, then the two wide ones (Colors, Profile song).
const ROWS = { member: ['about', 'photos', 'highlights', 'links', 'colors', 'song'], coach: ['signal', 'about', 'practice', 'photos', 'highlights', 'links', 'colors', 'song'] };
// A raised plate (bsRaised): lit from the top over the paper's own colour, with an inset top highlight.
const isRaised = (style) => /linear-gradient/.test(String(style.background)) && String(style.background).endsWith(THEME.PAPER) && /inset 0 1px 0/.test(String(style.boxShadow));
const openEditor = (props = {}) => withSurface(() => drive(mod.BSProfileCustomizer, { initial: {}, c: '#c9a227', INK, BG: '#fff', onClose() {}, onSave() {}, ...props }));
const rowNode = (d, key) => d.nodes().find((n) => n.props['data-cust-row'] === key);
const openRow = (d, key) => { const row = rowNode(d, key); assert.ok(row, `no ${key} row`); row.props.onClick(); withSurface(() => d.render()); };
const areaOf = (d) => { const a = d.nodes().find((n) => n.props['data-cust-area'] != null); return a ? a.props['data-cust-area'] : null; };
const headerOf = (d) => d.nodes().find(named('BSDetailHeader'));
const goBack = async (d) => { await headerOf(d).props.onBack(); withSurface(() => d.render()); };
const fieldOf = (d, k) => d.nodes().find((n) => n.props['data-cust-field'] === k);
const typeIn = (d, k, v) => { fieldOf(d, k).props.onChange({ target: { value: v } }); withSurface(() => d.render()); };
const summaryOf = (d, key) => textOf(flatten(rowNode(d, key).props.children).find((n) => n.props && n.props['data-cust-summary'] != null));
const saveOf = (d) => d.nodes().find((n) => n.props['data-cust-save'] != null);
const pressSave = async (d) => { await withSurface(() => saveOf(d).props.onClick()); withSurface(() => d.render()); };
function editorWorld({ base, read = 'ok', confirm = null }) {
  const world = { reads: [], writes: [], toasts: [], asks: [], saved: null, closed: 0 };
  const had = { auth: globalThis.window.ShapeAuth, db: globalThis.window.shapeDb, toast: globalThis.window.__bsToast, ask: globalThis.window.bsAskConfirm };
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: { id: 'u-me' } }) };
  globalThis.window.shapeDb = {
    getUserGoals: async (k, opts) => { world.reads.push([k, opts]); if (read === 'fail') throw new Error('offline'); return read === 'null' ? null : JSON.parse(JSON.stringify(base)); },
    saveUserGoals: async (k, doc, opts) => { world.writes.push([k, doc, opts]); return { ok: true }; },
  };
  globalThis.window.__bsToast = (msg, kind) => world.toasts.push(kind);
  if (confirm === 'none') delete globalThis.window.bsAskConfirm;
  else globalThis.window.bsAskConfirm = async (opts) => { world.asks.push(opts); return typeof confirm === 'function' ? confirm(opts) : !!confirm; };
  world.props = { onSave(doc) { world.saved = doc; }, onClose() { world.closed += 1; } };
  world.restore = () => { globalThis.window.ShapeAuth = had.auth; globalThis.window.shapeDb = had.db; globalThis.window.__bsToast = had.toast; globalThis.window.bsAskConfirm = had.ask; };
  return world;
}

// Owner, 2026-11-04, of the hub: "popping out, almost 3d look", "and a better layout". The preview is the
// hero, a raised plate with the lit edge; the areas are raised tiles in two columns (Colors and Profile song
// wide), each with a lit icon well and a lit "Set" or a dim "Add"; the details door a quiet glass row.
test('Customize opens on a hub: the profile as the hero plate, then a raised tile per area saying what is set there', () => {
  for (const coach of [false, true]) {
    const who = coach ? 'coach' : 'member';
    const d = openEditor({ coach, who: { name: 'Quinn Harper', handle: '@quinn' } });
    const nodes = d.nodes();
    const styled = nodes.filter((n) => n.props && n.props.style);
    assert.match(d.text, /Customize/);
    assert.equal(areaOf(d), null, `${who}: an area is open on arrival`);
    // The live preview: the person, the facet avatar for a member, the round one for a coach.
    const [preview] = nodes.filter((n) => n.props['data-cust-preview'] != null);
    assert.ok(preview, `${who}: the live preview is gone`);
    assert.equal(preview.props['aria-label'], 'Live preview');
    assert.match(textOf(preview), /Quinn Harper/);
    const inPreview = flatten(preview.props.children);
    // Its door to the whole page (owner, 2026-11-04: "add an option to view live preview"): a lit pill at
    // the card's foot, not a tag in the name's row (which pushed the name onto two lines).
    const door = inPreview.find((n) => n.props['data-cust-live-open'] === 'hub');
    assert.ok(door && door.type === 'button', `${who}: the hero has no View live preview`);
    assert.match(textOf(door), /^View live preview$/);
    // A compact pill (owner, 2026-11-04: "make the box smaller"): 32px drawn inside the 44px target.
    const doorPill = [].concat(door.props.children).find((c) => c && c.props && c.props.style && c.props.style.borderRadius === 999);
    assert.ok(door.props.style.minHeight >= 44 && doorPill && doorPill.props.style.minHeight === 32 && doorPill.props.style.fontSize === 13, `${who}: the door is not a 32px pill on a 44px target`);
    assert.match(String(doorPill.props.style.border), new RegExp(TEAL_SAVE), `${who}: the door is not lit`);
    assert.equal(inPreview.filter((n) => n.props['data-cust-tag'] != null).length, 0, `${who}: a tag is back in the name's row`);
    assert.equal(inPreview.filter(named('BSFacetAvatar')).length, coach ? 0 : 1, `${who}: the wrong avatar`);
    assert.equal(inPreview.filter((n) => n.props['data-cust-round-avatar'] != null).length, coach ? 1 : 0, `${who}: the wrong avatar`);
    // The rows: one per area, in order, each a 44px+ button with its icon, its name, its summary and a
    // chevron; the door to name, @handle and photo is the list's last row.
    const rows = nodes.filter((n) => n.props['data-cust-row'] != null);
    assert.deepEqual(rows.map((n) => n.props['data-cust-row']), ROWS[who], `${who}: the rows`);
    for (const r of rows) {
      assert.equal(r.type, 'button');
      assert.ok(r.props.style.minHeight >= 44, `${who}: the ${r.props['data-cust-row']} row is under 44px`);
      const inside = flatten(r.props.children);
      assert.ok(inside.some((n) => n.type === 'svg' || (typeof n.type === 'function' && n.type.name === 'BSMpIcon')), `${who}: the ${r.props['data-cust-row']} row has no icon`);
      assert.ok(summaryOf(d, r.props['data-cust-row']).length > 0, `${who}: the ${r.props['data-cust-row']} row says nothing`);
    }
    const section = nodes.find((n) => n.props['data-cust-rows'] != null);
    const kids = flatten(section.props.children).filter((n) => n.type === 'button');
    assert.equal(kids[kids.length - 1].props['data-cust-identity'], '', `${who}: the Settings row is not last`);
    assert.match(textOf(kids[kids.length - 1]), /Name, @handle, photo & details/);
    // The hero and every tile are raised plates; the hero carries the lit edge; the details row is glass.
    assert.ok(isRaised(preview.props.style), `${who}: the hero is not a raised plate`);
    assert.equal(inPreview.filter(named('BSGlassEdge')).length, 1, `${who}: the hero has no lit edge`);
    for (const r of rows) assert.ok(isRaised(r.props.style), `${who}: the ${r.props['data-cust-row']} tile is not raised`);
    assert.deepEqual(rows.filter((r) => r.props.style.gridColumn === '1 / -1').map((r) => r.props['data-cust-row']), ['colors', 'song'], `${who}: the wide tiles`);
    assert.equal(rows.filter((r) => r.props.style.gridColumn !== '1 / -1').length % 2, 0, `${who}: the half tiles leave a gap in the grid`);
    // Each area's status: a lit "Set" or a dim "Add" (nothing is set on an empty profile); Your Signal
    // only explains, so it has none.
    for (const r of rows) {
      const st = flatten(r.props.children).find((n) => n.props && n.props['data-cust-status'] != null);
      if (r.props['data-cust-row'] === 'signal') { assert.equal(st, undefined); continue; }
      assert.equal(st.props['data-cust-status'], 'add', `${who}: ${r.props['data-cust-row']} reads as set`);
      assert.equal(textOf(st), 'Add');
      assert.doesNotMatch(String(st.props.style.border), new RegExp(TEAL_SAVE), `${who}: a dim status is lit`);
    }
    // No ink rule, and no capitals but the small lit tags.
    assert.equal(styled.filter((n) => /solid/.test(String(n.props.style.borderBottom || ''))).length, 0, `${who}: an ink rule is back`);
    assert.equal(styled.filter((n) => n.props.style.textTransform === 'uppercase' && n.props['data-cust-tag'] == null).length, 0, `${who}: caps labels are back`);
    // No field on the hub: every field lives on its area's page.
    assert.equal(nodes.filter((n) => n.type === 'input' || n.type === 'textarea').length, 0, `${who}: a field on the hub`);
    const close = nodes.find((n) => n.props['data-cust-close'] != null);
    assert.equal(close.props.style.width, 44);
    assert.equal(close.props.style.height, 44);
  }
});

test('each row opens its area\'s own page: the shared Back and title, its fields in one card, its own Save', async () => {
  for (const coach of [false, true]) {
    const who = coach ? 'coach' : 'member';
    for (const key of ROWS[who]) {
      const world = editorWorld({ base: {}, confirm: true });
      try {
        const d = openEditor({ coach, ...world.props });
        const name = textOf(flatten(rowNode(d, key).props.children).find((n) => n.props && n.props.style && n.props.style.fontSize === 16));
        openRow(d, key);
        assert.equal(areaOf(d), key, `${who}: the ${key} row opened another page`);
        assert.equal(d.nodes().filter((n) => n.props['data-cust-row'] != null).length, 0, `${who}: the hub stays under ${key}`);
        // A BSPage, with the Back the chrome draws (BSDetailHeader: the masthead row, then BSBackRow),
        // whose title is the row's name; no corner in the masthead row inside the editor.
        assert.ok(d.nodes().some((n) => n.type === globalThis.BSPage), `${who}: ${key} is not a BSPage`);
        const header = headerOf(d);
        assert.ok(header, `${who}: ${key} has no shared Back`);
        assert.equal(header.props.title, name, `${who}: ${key}'s title is not its row's name`);
        assert.equal(header.props.noCorner, true);
        const cards = d.nodes().filter((n) => n.props['data-cust-card'] != null);
        assert.deepEqual(cards.map((n) => n.props['data-cust-card']), [key], `${who}: ${key} is not one page body`);
        // Its groups on raised plates, the first with the lit edge (Colors brings the look panel's own plates).
        const plates = d.nodes().filter((n) => n.props['data-cust-plate'] != null);
        if (key === 'colors') {
          assert.equal(plates.length, 0, `${who}: the look panel is plated twice`);
          assert.equal(d.nodes().filter(named('BSLookPicker')).length, 1);
        } else {
          assert.ok(plates.length >= 1, `${who}: ${key} has no raised plate`);
          for (const p of plates) assert.ok(isRaised(p.props.style), `${who}: a group on ${key} is not raised`);
          assert.equal(flatten(plates[0].props.children).filter(named('BSGlassEdge')).length, 1, `${who}: ${key}'s first plate has no lit edge`);
        }
        // Fields: inset wells (the inset shadow), rounded, 44px and up, 16px words (iOS zooms a smaller field).
        for (const f of d.nodes().filter((n) => (n.type === 'input' || n.type === 'textarea' || n.type === 'select') && n.props.type !== 'file' && n.props.className === 'bs-cust-field')) {
          assert.match(String(f.props.style.boxShadow), /^inset /, `${who}: a field on ${key} is not an inset well`);
          assert.ok(f.props.style.borderRadius >= 12, `${who}: a square field on ${key}`);
          assert.ok(f.props.style.minHeight >= 44, `${who}: a field under 44 px on ${key}`);
          assert.ok(f.props.style.fontSize >= 16, `${who}: a field under 16px on ${key}`);
        }
        for (const b of d.nodes().filter((n) => n.type === 'button' && n.props.style && n.props.style.width != null && n.props.style.width !== '100%')) {
          assert.ok(b.props.style.width >= 44 && (b.props.style.height == null || b.props.style.height >= 44), `${who}: a key under 44px on ${key}`);
        }
        // Its own Save (none on Your Signal, which only explains): the one glowing primary, off (and
        // unlit) until something on the page changes.
        const save = saveOf(d);
        if (key === 'signal') assert.equal(save, undefined, 'Your Signal has nothing to save');
        else {
          assert.equal(save.props.style.background, TEAL_SAVE, `${who}: ${key}'s Save is not the page's one colour`);
          assert.equal(save.props.style.borderRadius, 16);
          assert.ok(save.props.style.minHeight >= 44);
          assert.equal(save.props.disabled, true, `${who}: ${key}'s Save is on with nothing changed`);
          assert.equal(save.props.style.boxShadow, 'none', `${who}: ${key}'s Save glows with nothing to save`);
        }
        // Back from an unchanged page goes straight to the hub, asking nothing.
        await goBack(d);
        assert.equal(areaOf(d), null, `${who}: Back from ${key} stayed`);
        assert.equal(d.nodes().filter((n) => n.props['data-cust-discard'] != null).length, 0, `${who}: Back from an unchanged ${key} asked`);
      } finally { world.restore(); }
    }
  }
  // The member's About asks no line any more (owner, 2026-11-04: "Remove the field"); a coach's keeps it,
  // with the prompts.
  const member = openEditor({});
  openRow(member, 'about');
  assert.equal(fieldOf(member, 'line'), undefined, 'the member editor has a line field');
  assert.ok(fieldOf(member, 'startTitle') && fieldOf(member, 'bio'));
  const coach = openEditor({ coach: true });
  openRow(coach, 'about');
  assert.ok(fieldOf(coach, 'line'), 'a coach lost the line');
  assert.match(coach.text, /Add prompt/);
});

test('an area\'s Save reads the doc again and writes only that area\'s fields over it, then shows on the hub', async () => {
  // The editor opened on a stale copy; since then a look, a line, links and an About were written elsewhere.
  const base = { bio: 'Old', look: { paper: 'bone', accent: 'rust', focus: 'top' }, line: 'Written by Nora', links: { instagram: 'fresh' }, about: { story: 'Twelve years.' }, accent: '#e0644b' };
  const world = editorWorld({ base });
  try {
    const d = openEditor({ initial: { bio: 'Old', links: { instagram: 'stale' } }, who: { name: 'Quinn Harper' }, ...world.props });
    assert.match(summaryOf(d, 'about'), /Bio set/);
    openRow(d, 'about');
    typeIn(d, 'bio', 'New bio');
    assert.equal(saveOf(d).props.disabled, false, 'Save stays off after a change');
    assert.match(String(saveOf(d).props.style.boxShadow), /0 12px 28px -12px/, 'the primary does not glow once there is something to save');
    await pressSave(d);
    assert.deepEqual(world.reads, [['profile_custom', { expectedUserId: 'u-me' }]], 'the doc was not read again, bound to the account');
    assert.equal(world.writes.length, 1);
    const [kind, doc, opts] = world.writes[0];
    assert.equal(kind, 'profile_custom');
    assert.deepEqual(opts, { expectedUserId: 'u-me' }, 'the write is not bound to the account');
    assert.equal(doc.bio, 'New bio', 'the edit was not written');
    assert.deepEqual(doc.links, { instagram: 'fresh' }, 'another area\'s stale copy was written over the stored links');
    assert.deepEqual(doc.look, base.look, 'a look written elsewhere was overwritten');
    assert.equal(doc.line, 'Written by Nora', 'a member\'s line written elsewhere was overwritten');
    assert.ok(doc.about && doc.about.story === 'Twelve years.', 'a key no area writes was dropped');
    assert.equal(doc.accent, '#e0644b', 'the old accent hex was dropped');
    // Back on the hub, which reads the doc as saved: the preview and the row.
    assert.equal(areaOf(d), null, 'a save did not go back to the hub');
    assert.match(textOf(d.nodes().find((n) => n.props['data-cust-preview'] != null)), /New bio/);
    assert.match(summaryOf(d, 'links'), /link/, 'the hub did not take the stored links');
    // Closing hands the profile the doc as saved.
    assert.equal(world.saved, null, 'the editor closed on the save');
    d.nodes().find((n) => n.props['data-cust-close'] != null).props.onClick();
    assert.equal(world.saved, doc, 'closing did not hand on the saved doc');
    // An area with nothing changed writes nothing.
    openRow(d, 'highlights');
    await pressSave(d);
    assert.equal(world.writes.length, 1, 'an unchanged area wrote');
  } finally { world.restore(); }
  // A read that fails, or answers nothing, writes nothing and stays on the page.
  for (const read of ['fail', 'null']) {
    const w = editorWorld({ base, read });
    try {
      const d = openEditor({ initial: { bio: 'Old' }, ...w.props });
      openRow(d, 'about');
      typeIn(d, 'bio', 'New bio');
      await pressSave(d);
      assert.equal(w.writes.length, 0, `a ${read} read still wrote`);
      assert.equal(areaOf(d), 'about', `a ${read} read left the page`);
      assert.deepEqual(w.toasts, ['err'], `a ${read} read said nothing`);
    } finally { w.restore(); }
  }
});

test('Back with changes not saved asks once on a raised sheet: Keep editing stays, Discard puts the saved doc back', async () => {
  const sheetOf = (d) => d.nodes().find((n) => n.props['data-cust-discard'] != null);
  const press = (d, attr) => { d.nodes().find((n) => n.props[attr] != null).props.onClick({ stopPropagation() {} }); withSurface(() => d.render()); };
  const world = editorWorld({ base: { bio: 'Old' } });
  try {
    const d = openEditor({ initial: { bio: 'Old' }, ...world.props });
    openRow(d, 'about');
    typeIn(d, 'bio', 'Draft');
    await goBack(d);
    // The sheet: raised, with the lit edge, the question, Keep editing and Discard; the page stays under it.
    const sheet = sheetOf(d);
    assert.ok(sheet, 'Back with changes did not ask');
    const dialog = flatten(sheet.props.children).find((n) => n.props && n.props.role === 'alertdialog');
    assert.ok(isRaised(dialog.props.style), 'the sheet is not raised');
    assert.equal(flatten(dialog.props.children).filter(named('BSGlassEdge')).length, 1);
    assert.match(textOf(dialog), /Discard your changes\?/);
    assert.match(textOf(dialog), /Keep editing/);
    assert.equal(areaOf(d), 'about', 'the page went before the answer');
    // Keep editing: the sheet goes, the draft stays.
    press(d, 'data-cust-keep');
    assert.equal(sheetOf(d), undefined, 'Keep editing left the sheet up');
    assert.equal(areaOf(d), 'about', 'Keep editing left the page');
    assert.equal(fieldOf(d, 'bio').props.value, 'Draft', 'Keep editing lost the draft');
    // A tap outside the sheet keeps editing too.
    await goBack(d);
    sheetOf(d).props.onClick();
    withSurface(() => d.render());
    assert.equal(sheetOf(d), undefined);
    assert.equal(fieldOf(d, 'bio').props.value, 'Draft');
    // Discard: back to the hub, and the saved doc is what the page shows again; nothing is written.
    await goBack(d);
    press(d, 'data-cust-discard-confirm');
    assert.equal(sheetOf(d), undefined);
    assert.equal(areaOf(d), null, 'Discard stayed on the page');
    openRow(d, 'about');
    assert.equal(fieldOf(d, 'bio').props.value, 'Old', 'Discard kept the draft');
    assert.equal(world.writes.length, 0, 'Discard wrote');
  } finally { world.restore(); }
});

test('the hub\'s rows say what is set in each area, from the doc as saved', () => {
  // The English catalog's words, formatted (the harness has no catalog of its own).
  const hadI18n = globalThis.window.ShapeI18n;
  globalThis.window.ShapeI18n = { t: (key, opts) => (opts && opts.defaultValue != null ? new IntlMessageFormat(opts.defaultValue, 'en').format(opts) : key) };
  try {
  const full = {
    bio: 'Two years in.', startLine: { title: 'First half-marathon', date: isoIn(74) },
    wall: [{ url: '/demo/wall-01.webp' }, { url: '/demo/wall-02.webp' }], cover: { image: '/demo/box-cover.webp' }, filmMember: { url: '/x.mp4' },
    shelf: [{ title: 'Deadlift 140kg', when: 'March' }], pinned: { kind: 'pr', title: 'Pulled 2× bodyweight' }, heroStats: ['score', 'streak'],
    look: { paper: 'bone', accent: 'rust' }, song: { url: 'https://open.spotify.com/track/abc', label: 'Lift anthem' }, links: { instagram: 'quinn', website: 'quinn.run' },
  };
  const d = openEditor({ initial: full });
  assert.equal(summaryOf(d, 'about'), 'Bio set · Countdown set');
  assert.equal(summaryOf(d, 'photos'), '2 photos · Cover set · Intro film set');
  assert.equal(summaryOf(d, 'highlights'), '1 on the shelf · Highlight pinned · 2 headline stats');
  assert.equal(summaryOf(d, 'colors'), 'Bone · Rust');
  assert.equal(summaryOf(d, 'song'), 'Lift anthem');
  assert.equal(summaryOf(d, 'links'), '2 links');
  // Nothing set reads so, on every area (a coach's Signal says what it explains).
  for (const coach of [false, true]) {
    const empty = openEditor({ coach });
    for (const key of ROWS[coach ? 'coach' : 'member']) {
      if (key === 'signal') assert.equal(summaryOf(empty, key), 'what the rings mean');
      else assert.equal(summaryOf(empty, key), 'Not set yet', `${key} with nothing set`);
    }
  }
  // A coach's own areas: the line and prompts, the business card and pinned reviews.
  const coach = openEditor({ coach: true, initial: { bio: 'x', line: 'Strong is a skill.', prompts: [{ q: 'why', a: 'yes' }], bizCard: { name: 'Iron Path' }, pinnedReviews: ['r1'] } });
  assert.equal(summaryOf(coach, 'about'), 'Bio set · Line set · 1 prompt');
  assert.equal(summaryOf(coach, 'practice'), 'Business card set · 1 review pinned');
  } finally { globalThis.window.ShapeI18n = hadI18n; }
});

test('Colors: the look panel starts from the app\'s paper and accent, and that start is never written', async () => {
  for (const coach of [false, true]) {
    const who = coach ? 'coach' : 'member';
    const world = editorWorld({ base: { bio: 'Saved', accent: '#e0644b' } });
    try {
      const d = openEditor({ initial: { bio: 'Saved' }, coach, ...world.props });
      assert.equal(summaryOf(d, 'colors'), 'Not set yet', `${who}: an unpicked look reads as set`);
      openRow(d, 'colors');
      const picker = d.nodes().find(named('BSLookPicker'));
      // No look saved and no app paper in the theme: the panel still gets a whole look (dark · teal).
      assert.deepEqual(picker.props.look, { paper: 'dark', accent: 'teal' }, `${who}: the panel's start`);
      // ⚠ The panel throws on a look with no paper or accent; drawn with the start, it does not.
      assert.doesNotThrow(() => picker.type(picker.props), `${who}: the look panel throws on its start`);
      // Untouched, there is nothing to save.
      assert.equal(saveOf(d).props.disabled, true, `${who}: Save is on for an untouched look`);
      await pressSave(d);
      assert.equal(world.writes.length, 0, `${who}: the start was written to a profile that never picked a look`);
      // A pick (a tap) is written: the paper and accent, over the stored doc; the old accent hex stays.
      picker.props.setLook({ paper: 'forest', accent: 'teal' });
      withSurface(() => d.render());
      assert.equal(d.nodes().find(named('BSLookPicker')).props.look.paper, 'forest', `${who}: the panel did not show the pick`);
      await pressSave(d);
      assert.equal(world.writes.length, 1, `${who}: the pick was not saved`);
      assert.deepEqual(world.writes[0][1].look, { paper: 'forest', accent: 'teal' });
      assert.equal(world.writes[0][1].accent, '#e0644b', `${who}: the old accent hex was dropped`);
      assert.equal(summaryOf(d, 'colors'), 'Forest · Teal', `${who}: the hub did not take the pick`);
      // Picking the saved look again is no change (the pick is compared with the saved look, #2611).
      openRow(d, 'colors');
      d.nodes().find(named('BSLookPicker')).props.setLook({ paper: 'forest', accent: 'teal' });
      withSurface(() => d.render());
      assert.equal(saveOf(d).props.disabled, true, `${who}: the saved look picked again reads as a change`);
    } finally { world.restore(); }
  }
  // As the website editor counts it (#2611), a tap is a pick: tapping the start on a profile that never
  // saved a look writes it, because the member chose it.
  const tapped = editorWorld({ base: {} });
  try {
    const d = openEditor({ ...tapped.props });
    openRow(d, 'colors');
    d.nodes().find(named('BSLookPicker')).props.setLook({ paper: 'dark', accent: 'teal' });
    withSurface(() => d.render());
    await pressSave(d);
    assert.deepEqual(tapped.writes.map((w) => w[1].look), [{ paper: 'dark', accent: 'teal' }], 'a tap on the start was not saved as a pick');
  } finally { tapped.restore(); }
  // A pick goes over the stored look and keeps what else it holds (a coach's focus).
  const focused = editorWorld({ base: { look: { paper: 'bone', accent: 'rust', focus: 'top' } } });
  try {
    const d = openEditor({ initial: { look: { paper: 'bone', accent: 'rust', focus: 'top' } }, ...focused.props });
    openRow(d, 'colors');
    d.nodes().find(named('BSLookPicker')).props.setLook({ paper: 'forest', accent: 'green', focus: 'top' });
    withSurface(() => d.render());
    await pressSave(d);
    assert.deepEqual(focused.writes[0][1].look, { paper: 'forest', accent: 'green', focus: 'top' });
  } finally { focused.restore(); }
  // The app's own paper and accent are the start when the theme has them; a saved look wins over them.
  const lookTheme = (over) => new Proxy(over, { get: (t, k) => (k in t ? t[k] : THEME[k]), has: () => true });
  const had = globalThis.useBS;
  globalThis.useBS = () => lookTheme({ paperMode: 'bone', accentKey: 'rust' });
  try {
    const d = openEditor({});
    openRow(d, 'colors');
    assert.deepEqual(d.nodes().find(named('BSLookPicker')).props.look, { paper: 'bone', accent: 'rust' });
    const saved = openEditor({ initial: { look: { paper: 'plum', accent: 'violet' } } });
    openRow(saved, 'colors');
    assert.deepEqual(saved.nodes().find(named('BSLookPicker')).props.look, { paper: 'plum', accent: 'violet' });
  } finally { globalThis.useBS = had; }
});

// Owner, 2026-11-04, of Customize: "looks good", then "add an option to view live preview". The hub's hero
// and each area's header open the profile page itself, full screen, as a visitor sees it, with the drafts in
// (saved or not), under a floating bar that says so and goes back to editing. Back and a swipe come back to
// where you were, with the drafts kept, and nothing on the way writes.
test('View live preview opens the real profile page as visitors see it, with the drafts in, and writes nothing', async () => {
  const hadProvider = globalThis.BSProvider;
  globalThis.BSProvider = function BSProvider({ children }) { return children; };
  const liveOf = (d) => d.nodes().find((n) => n.props && n.props['data-cust-live'] != null);
  const pageOf = (d) => d.nodes().find((n) => n.type === globalThis.BSTerrainProfile || n.type === globalThis.BSSignalCoachProfile);
  const rootOf = (d) => d.nodes().find((n) => n.props && n.props['data-cust-root'] != null);
  const barState = (d) => d.nodes().find((n) => n.props && n.props['data-cust-live-state'] != null);
  const openLive = (d, where) => {
    const door = d.nodes().find((n) => n.props && n.props['data-cust-live-open'] === where);
    assert.ok(door, `no View live preview on the ${where}`);
    door.props.onClick({ currentTarget: null });
    withSurface(() => d.render());
  };
  try {
    assert.equal(typeof globalThis.BSTerrainProfile, 'function', 'the member profile is not on window');
    assert.equal(typeof globalThis.BSSignalCoachProfile, 'function', 'the coach profile is not on window');
    for (const coach of [false, true]) {
      const who = coach ? 'coach' : 'member';
      const world = editorWorld({ base: { bio: 'Saved bio' } });
      try {
        const d = openEditor({ coach, initial: { bio: 'Saved bio' }, who: { name: 'Quinn Harper', handle: '@quinn' }, ...world.props });
        // From the hub, nothing changed: "Preview", the saved doc, no look painted (none saved).
        openLive(d, 'hub');
        let page = pageOf(d);
        assert.ok(liveOf(d), `${who}: the hub's door opened nothing`);
        assert.equal(page.type, coach ? globalThis.BSSignalCoachProfile : globalThis.BSTerrainProfile, `${who}: the wrong profile page`);
        assert.equal(page.props.previewCustom.bio, 'Saved bio');
        assert.equal(barState(d).props['data-cust-live-state'], 'saved');
        assert.doesNotMatch(textOf(liveOf(d)), /Not saved yet/);
        assert.equal(d.nodes().filter(named('BSProvider')).length, 0, `${who}: a look painted that nobody picked`);
        // Back to editing: the hub again.
        d.nodes().find((n) => n.props && n.props['data-cust-live-back'] != null).props.onClick();
        withSurface(() => d.render());
        assert.equal(liveOf(d), undefined, `${who}: Back to editing left the preview open`);
        assert.ok(rowNode(d, 'about'), `${who}: Back to editing did not come back to the hub`);

        // From About, with a bio typed and not saved: the header's quiet raised pill.
        openRow(d, 'about');
        typeIn(d, 'bio', 'Draft bio');
        const pill = flatten(headerOf(d).props.trailing).find((n) => n.props && n.props['data-cust-live-open'] === 'area');
        assert.ok(pill && pill.type === 'button', `${who}: the area's header has no preview pill`);
        assert.ok(isRaised(pill.props.style) && pill.props.style.borderRadius === 999 && pill.props.style.minHeight >= 44, `${who}: the pill is not a raised 44px pill`);
        assert.equal(pill.props['aria-label'], 'View live preview');
        openLive(d, 'area');
        page = pageOf(d);
        assert.ok(page, `${who}: the area's pill opened no profile page`);
        // The page as a visitor sees it: not the owner's, no Message, the owner's account, the draft in.
        assert.ok(!page.props.isSelf && !page.props.meMode, `${who}: the preview is the owner's own view`);
        // Message drawn as a visitor sees it, and reaching nothing (the guard below stops the tap too).
        assert.equal(typeof page.props.onMessage, 'function', `${who}: the preview has no Message`);
        assert.equal(page.props.onMessage(), undefined);
        assert.equal(page.props.person.userId, 'u-me');
        assert.equal(page.props.person.who, 'Quinn Harper');
        assert.equal(page.props.previewCustom.bio, 'Draft bio', `${who}: the draft is not in the preview`);
        // The bar: floating over the page, raised and lit, "Preview · Not saved yet", Back to editing.
        const bar = d.nodes().find((n) => n.props && n.props['data-cust-live-bar'] != null);
        assert.equal(bar.props.style.position, 'absolute');
        assert.ok(isRaised(flatten(bar.props.children).find((n) => n.props && n.props.style && n.props.style.borderRadius === 18).props.style), `${who}: the bar is not raised`);
        assert.equal(barState(d).props['data-cust-live-state'], 'unsaved');
        assert.match(textOf(bar), /Preview.*Not saved yet.*Back to editing/);
        const backBtn = d.nodes().find((n) => n.props && n.props['data-cust-live-back'] != null);
        assert.ok(backBtn.props.style.minHeight >= 44 && backBtn.props.style.background === TEAL_SAVE, `${who}: Back to editing is not the primary`);
        // The editor under it is kept (its scroll and drafts), hidden and out of reach.
        assert.equal(rootOf(d).props.style.visibility, 'hidden');
        assert.equal(rootOf(d).props['aria-hidden'], true);
        assert.equal(rootOf(d).props.inert, true);
        // The page draws the draft: the member's page, drawn, shows the bio and none of the owner's controls.
        if (!coach) {
          const drawn = withSurface(() => drive(page.type, page.props));
          assert.match(drawn.text, /Draft bio/, 'the member page did not draw the draft bio');
          assert.equal(drawn.nodes().filter((n) => n.props && n.props['data-member-edit'] != null).length, 0, 'the preview shows Edit profile');
        }
        // A tap on the page is stopped, but for the bar, the page's Back and its tabs.
        const guard = liveOf(d).props.onClickCapture;
        const tap = (match) => { const e = { stopped: 0, target: { closest: (sel) => (match && sel.includes(match) ? {} : null) }, preventDefault() { this.stopped += 1; }, stopPropagation() { this.stopped += 1; } }; guard(e); return e.stopped; };
        assert.equal(tap(null), 2, `${who}: a tap on the page went through`);
        for (const pass of ['[data-bs-back]', '[data-bs-pin-back]', '[data-terrain-tabs]', '[data-profile-tabs]', '[data-cust-live-bar]']) assert.equal(tap(pass), 0, `${who}: ${pass} was stopped`);
        // The page's own Back (and so a swipe right, which takes it) comes back to About with the draft kept.
        page.props.onBack();
        withSurface(() => d.render());
        assert.equal(liveOf(d), undefined, `${who}: the page's Back left the preview open`);
        assert.equal(areaOf(d), 'about', `${who}: Back did not come back to About`);
        assert.equal(fieldOf(d, 'bio').props.value, 'Draft bio', `${who}: Back lost the draft`);
        assert.equal(saveOf(d).props.disabled, false, `${who}: the draft no longer reads as unsaved`);
        assert.equal(d.nodes().filter((n) => n.props['data-cust-discard'] != null).length, 0, `${who}: previewing asked to discard`);
        // Nothing was read for the preview, and nothing written.
        assert.equal(world.writes.length, 0, `${who}: previewing wrote`);
        assert.equal(world.reads.length, 0, `${who}: previewing read the doc`);
      } finally { world.restore(); }
    }

    // A look picked and not saved: the member page paints itself in it (#2611: the page hands its look's theme
    // on through BSContext, as a visitor sees it), so the preview adds no wrap of its own; the pick is still
    // there after Back.
    const world = editorWorld({ base: {} });
    const hadCtx = globalThis.BSContext, hadLookTheme = globalThis.bsLookTheme;
    function ThemeProvider({ children }) { return children; }
    globalThis.BSContext = { Provider: ThemeProvider };
    globalThis.bsLookTheme = (outer, look) => ({ ...outer, paperMode: look.paper, accentKey: look.accent });
    try {
      const d = openEditor({ ...world.props });
      openRow(d, 'colors');
      d.nodes().find(named('BSLookPicker')).props.setLook({ paper: 'bone', accent: 'rust' });
      withSurface(() => d.render());
      openLive(d, 'area');
      assert.equal(d.nodes().filter(named('BSProvider')).length, 0, 'the preview paints over the page\'s own look');
      assert.deepEqual(pageOf(d).props.previewCustom.look, { paper: 'bone', accent: 'rust' });
      const drawn = withSurface(() => drive(pageOf(d).type, pageOf(d).props));
      const root = drawn.nodes()[0];
      assert.equal(root.type, ThemeProvider, 'the member page is not in its look');
      assert.equal(root.props.value.paperMode, 'bone', 'the page is not painted in the picked paper');
      assert.equal(barState(d).props['data-cust-live-state'], 'unsaved');
      pageOf(d).props.onBack();
      withSurface(() => d.render());
      assert.equal(areaOf(d), 'colors');
      assert.deepEqual(d.nodes().find(named('BSLookPicker')).props.look, { paper: 'bone', accent: 'rust' }, 'Back lost the pick');
      assert.equal(world.writes.length, 0, 'previewing a look wrote it');
    } finally {
      world.restore();
      if (hadCtx === undefined) delete globalThis.BSContext; else globalThis.BSContext = hadCtx;
      if (hadLookTheme === undefined) delete globalThis.bsLookTheme; else globalThis.bsLookTheme = hadLookTheme;
    }
  } finally { if (hadProvider === undefined) delete globalThis.BSProvider; else globalThis.BSProvider = hadProvider; }
});

// #2611's member crop map (BS_MEMBER_FOCUS): Keep in view under the cover, on Photos & film, by the pick's
// rule. A tap that changes the crop is saved as look.focus over the stored look; the crop it already has is
// no change; a coach's page reads no crop, so a coach is not asked.
test('Keep in view sets the cover\'s crop on Photos & film, written over the stored look only when changed', async () => {
  const base = { cover: { image: 'https://x.supabase.co/storage/v1/object/public/community-photos/u-me/c.jpg' }, look: { paper: 'bone', accent: 'rust' } };
  const world = editorWorld({ base });
  try {
    const d = openEditor({ initial: base, ...world.props });
    openRow(d, 'photos');
    const chips = () => d.nodes().filter((n) => n.props && n.props['data-cust-focus-pick'] != null);
    assert.deepEqual(chips().map((n) => n.props['data-cust-focus-pick']), ['top', 'center', 'bottom']);
    assert.deepEqual(chips().filter((n) => n.props['aria-pressed']).map((n) => n.props['data-cust-focus-pick']), ['center'], 'the page\'s own crop is not shown');
    for (const n of chips()) assert.ok(n.props.style.minHeight >= 44, 'a crop chip under 44px');
    chips().find((n) => n.props['data-cust-focus-pick'] === 'center').props.onClick();
    withSurface(() => d.render());
    assert.equal(saveOf(d).props.disabled, true, 'the crop it already has reads as a change');
    chips().find((n) => n.props['data-cust-focus-pick'] === 'top').props.onClick();
    withSurface(() => d.render());
    assert.equal(saveOf(d).props.disabled, false, 'a new crop is not a change');
    await pressSave(d);
    assert.equal(world.writes.length, 1);
    assert.deepEqual(world.writes[0][1].look, { paper: 'bone', accent: 'rust', focus: 'top' }, 'the crop did not go over the stored look');
  } finally { world.restore(); }
  const coach = openEditor({ coach: true, initial: base });
  openRow(coach, 'photos');
  assert.equal(coach.nodes().filter((n) => n.props && n.props['data-cust-focus'] != null).length, 0, 'a coach is asked for a crop their page does not read');
});

test('the editor\'s motion is gentle, and none of it runs under reduced motion', () => {
  const cardsOf = (d) => d.nodes().filter((n) => n.props['data-cust-rows'] != null || n.props['data-cust-preview'] != null || n.props['data-cust-card'] != null);
  const moving = openEditor({});
  assert.ok(cardsOf(moving).length === 2 && cardsOf(moving).every((n) => n.props.className === 'bs-cust-in'), 'the hub\'s cards rise in');
  openRow(moving, 'about');
  assert.ok(cardsOf(moving).every((n) => n.props.className === 'bs-cust-in'), 'the area\'s card rises in');
  const had = globalThis.matchMedia;
  globalThis.matchMedia = (q) => ({ matches: /prefers-reduced-motion: reduce/.test(q) });
  try {
    const still = openEditor({});
    assert.ok(cardsOf(still).every((n) => !n.props.className && !(n.props.style && n.props.style.animationDelay)), 'a hub card still animates under reduced motion');
    openRow(still, 'photos');
    assert.ok(cardsOf(still).every((n) => !n.props.className && !(n.props.style && n.props.style.animationDelay)), 'an area card still animates under reduced motion');
  } finally { if (had === undefined) delete globalThis.matchMedia; else globalThis.matchMedia = had; }
  // The stylesheet undoes every motion rule under the media query too (a reader who turns it on later).
  const css = stripComments(readFileSync(SRC.replace('iosAppBroadsheetClient.jsx', 'BSProfileCustomizer.jsx'), 'utf8'));
  const reduced = css.slice(css.indexOf("'@media (prefers-reduced-motion: reduce) {'"));
  assert.ok(reduced.length > 40, 'no reduced-motion block');
  for (const rule of ['.bs-cust-in, .bs-cust-photo { animation: none !important; }', '.bs-cust-press, .bs-cust-field { transition: none !important; }', '.bs-cust-press:active:not(:disabled) { transform: none !important; }', '.bs-cust-row, .bs-cust-primary { transition: none !important; }', '.bs-cust-row:active, .bs-cust-primary:active:not(:disabled) { transform: none !important; }']) {
    assert.ok(reduced.includes(rule), `reduced motion leaves ${rule.split(' {')[0]} moving`);
  }
});

// Owner, 2026-10-24: "should be able to click on these pictures and make bigger". Each shot is a door to
// the viewer, at its own place on the wall; the viewer steps round the wall and closes back to the strip.
test('a Wall shot opens full size, at its place, and steps round the wall', () => {
  const d = drive(mod.BSProfileExtras, { custom: mod.bsDemoMemberCustom(), c: '#c0533b', INK, BG: '#fff', isSelf: false, ledger: true, demo: true, bleed: 20 });
  const viewer = () => d.nodes().find(named('BSPhotoViewer'));
  const shots = d.nodes().filter((n) => n.type === 'button' && n.props['data-bs-wall-shot'] != null);
  assert.ok(shots.length >= 2, 'the demo wall has its shots');
  assert.equal(viewer(), undefined, 'the viewer is open before a tap');
  // Each shot names itself for a screen reader by its place (the harness's tr leaves {n} as it is).
  assert.ok(shots.every((b) => /^Open photo /.test(b.props['aria-label'])));
  assert.match(stripComments(readFileSync(SRC, 'utf8')), /tr\('profile:wall\.openShot', \{ defaultValue: 'Open photo \{n\} of \{count\}', n: i \+ 1, count: wall\.length \}\)/);
  shots[1].props.onClick();
  d.render();
  const v = viewer();
  assert.ok(v, 'a tap on a shot opens nothing');
  assert.equal(v.props.at, 1, 'the viewer opens on the shot tapped');
  assert.equal(v.props.shots.length, shots.length);
  assert.ok(v.props.shots.every((w) => typeof w.url === 'string' && w.url), 'the viewer gets the wall\'s own photos');
  assert.equal(v.props.labels.close, 'Close');
  v.props.onStep(1); d.render();
  assert.equal(viewer().props.at, 2 % shots.length);
  viewer().props.onStep(-1); d.render(); viewer().props.onStep(-1); d.render();
  assert.equal(viewer().props.at, 0);
  viewer().props.onStep(-1); d.render();
  assert.equal(viewer().props.at, shots.length - 1, 'back from the first shot is the last');
  viewer().props.onClose(); d.render();
  assert.equal(viewer(), undefined, 'the viewer would not close');
});

// A sheet portals into the phone surface; with no document it renders nothing, so every render of one
// runs with one.
const withSurface = (fn) => {
  const saved = globalThis.document;
  globalThis.document = { getElementById: () => ({}), body: {} };
  try { return fn(); } finally { globalThis.document = saved; }
};

// ── The coach profile (Signal) in the same look ───────────────────────────────
const MAYA = { who: 'Maya Okafor', kind: 'TRAINER', tier: 'ELITE', init: 'MO' };
// The old page drew every action as a pill (borderRadius 999) and its quotes in italics.
const oldLook = (nodes) => nodes.filter((n) => n.props && n.props.style && (n.props.style.borderRadius === 999 || n.props.style.fontStyle === 'italic'));
const roundButtons = (nodes) => nodes.filter((n) => n.type === 'button' && n.props.style && n.props.style.borderRadius);

test('the coach profile: no quote at the top, the Me page\'s counts and tab strip, and no pill or italics on any tab', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  const nodes = d.nodes();
  // No quote at the top, as on the member's profile (owner, 2026-10-24).
  assert.equal(nodes.filter(named('BSTPullQuote')).length, 0, 'the coach\'s line is pulled out at the top again');
  assert.equal(nodes.find(named('BSFollowBlock')).props.variant, 'ledger', 'the counts are the old centred pills');
  const tabsOf = () => d.nodes().find(named('BSTerrainTabs'));
  assert.deepEqual(tabsOf().props.tabs.map((tb) => tb.key), ['activity', 'about', 'coaching', 'playlists', 'reviews']);
  const heads = {};
  for (const tb of tabsOf().props.tabs) {
    tabsOf().props.onPick(tb.key);
    d.render();
    // The Coaching tab is the shared storefront block (BSCoachCoachingBlock, 2026-10-27): the
    // harness draws a child as a node, so the block is driven with the props the profile gave it.
    const block = d.nodes().find(named('BSCoachCoachingBlock'));
    const all = block ? drive(mod.BSCoachCoachingBlock, block.props).nodes() : d.nodes();
    assert.deepEqual(oldLook(all).map((n) => n.type), [], `${tb.key} still has a pill or italics`);
    assert.deepEqual(roundButtons(all).map((n) => textOf(n)), [], `${tb.key} has a rounded button`);
    const h = all.filter(named('BSTStationHead'));
    for (const x of h) assert.equal(x.props.mag, true, `"${x.props.label}" is the old kicker`);
    heads[tb.key] = h.map((x) => x.props.label);
  }
  assert.deepEqual(heads.about, ['Coaching philosophy', 'The practice', 'Coaching focus', 'Track record', 'Certifications']);
  assert.equal(heads.coaching.length, 1);
  assert.match(heads.coaching[0], /^Train with /, 'the harness\'s tr leaves {name} unfilled');
  assert.deepEqual(heads.reviews, ['Reviews']);
  // The activity tab's extras are the Me page's ledger: answers pulled out, not boxed in italics.
  tabsOf().props.onPick('activity');
  d.render();
  assert.equal(d.nodes().find(named('BSProfileExtras')).props.ledger, true);
});

test('the coach\'s About: the philosophy pulled out, the focus on square bars to its own /100, the record as the Wall\'s figures', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  d.nodes().find(named('BSTerrainTabs')).props.onPick('about');
  d.render();
  const nodes = d.nodes();
  const quotes = nodes.filter(named('BSTPullQuote'));
  assert.equal(quotes[0].props.text, 'Get strong, stay strong.', 'the philosophy, without the literal quote marks the old italic line carried');
  const focus = nodes.find((n) => n.props && n.props['data-coach-focus'] != null);
  const rows = focus.props.children;
  assert.ok(rows.length >= 2);
  for (const row of rows) {
    const [label, track, fig] = row.props.children;
    const fill = track.props.children;
    const value = Number(fig.props.children[0]);
    assert.equal(fill.props.style.width, `${value}%`, `${label.props.children}: a bar is its own share of 100, not of the best`);
  }
  const figs = nodes.find(named('BSWallStoryFigures'));
  assert.deepEqual(figs.props.items.map((r) => r[0]), ['Clients', 'Rating', 'Years']);
});

test('the coach\'s Coaching tab: square actions, ink for the one to take, and the plan types as the Wall\'s word tabs', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const p = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  p.nodes().find(named('BSTerrainTabs')).props.onPick('coaching');
  p.render();
  // The tab renders the shared storefront block; it is driven with the props the profile passed.
  const d = drive(mod.BSCoachCoachingBlock, p.nodes().find(named('BSCoachCoachingBlock')).props);
  const btn = (re) => d.nodes().find((n) => n.type === 'button' && re.test(textOf(n)));
  const subscribe = btn(/^Subscribe$/);
  assert.equal(subscribe.props.style.background, THEME.INK);
  // The solid paper, never PAPER_BG: on the Steel paper that is a gradient, which is no colour (Codex P1 on #2441).
  assert.equal(subscribe.props.style.color, THEME.PAPER);
  assert.equal(subscribe.props.style.borderRadius, 0);
  const intro = btn(/^Book intro · Free$/);
  assert.equal(intro.props.style.background, 'transparent');
  assert.equal(intro.props.style.border, `1px solid ${THEME.INK}`);
  const cats = d.nodes().filter((n) => n.type === 'button' && n.props['aria-pressed'] !== undefined && /^(All|Workouts|Programs|Coaching)$/i.test(textOf(n)));
  assert.ok(cats.length >= 2, 'the plan types');
  assert.equal(cats.filter((n) => n.props['aria-pressed']).length, 1);
  const on = cats.find((n) => n.props['aria-pressed']).props.children;
  assert.equal(on.props.style.boxShadow, `inset 0 -2px 0 ${TEAL}`);
});

test('the coach\'s Reviews: the average at the head, each review its writer\'s flat face and words pulled out', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, onBack() {}, onMessage() {} });
  d.nodes().find(named('BSTerrainTabs')).props.onPick('reviews');
  d.render();
  const nodes = d.nodes();
  assert.match(nodes.find(named('BSTStationHead')).props.meta, /^[\d.—]+\/10 · ★ \d+$/);
  const reviews = nodes.filter((n) => n.props && n.props['data-coach-review'] != null);
  assert.ok(reviews.length >= 2);
  for (const r of reviews) {
    const inner = flatten(r);
    const face = inner.find(named('BSFacetAvatar'));
    assert.equal(face.props.flat, true);
    assert.equal(face.props.c, THEME.INK);
    assert.ok(inner.find(named('BSTPullQuote')).props.text, 'the words are pulled out');
  }
});

test('the coach\'s own Me tab draws in the same look', () => {
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSSignalCoachProfile, { person: MAYA, isSelf: true, meMode: true, onBack() {}, onMessage() {} });
  assert.ok(d.nodes().find(named('BSTerrainTabs')));
  // The owner's own ＋ Log activity is the Me page's underlined word, not the old pill (Codex P2 on #2441:
  // this driver draws no nested component, so the element's props are what is checked).
  const log = d.nodes().find(named('BSActivityLogCta'));
  assert.equal(log.props.ledger, true);
  assert.equal(log.props.INK, THEME.INK);
  assert.ok(!d.nodes().find(named('BSProfileDock')), 'no Message / Work-with on one\'s own profile');
  assert.deepEqual(oldLook(d.nodes()).map((n) => n.type), []);
});

test('another member\'s profile has Message beside Follow in the head, and no dock or sticky fade over the wall', () => {
  // Owner, 2026-10-24, of "Message Priya" over a member's wall: "fix this message box thats appearing";
  // 2026-10-31, the coach profile's look: Follow and Message are the head's two buttons, as a coach's are,
  // so the dock that also said Message went (two Messages on one page).
  const src = stripComments(readFileSync(SRC, 'utf8'));
  const at = src.indexOf('function BSTerrainProfile(');
  const fn = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.doesNotMatch(fn, /<BSProfileDock\b/, 'the member dock is back');
  assert.doesNotMatch(fn, /position: 'sticky', bottom: 0/, 'the old fade that sat over the wall is back');
  assert.match(fn, /<BSFollowBlock [^>]*variant="coach"[^>]*onMessage=\{hasMessage && !isSelf \? \(\) => onMsg\(person\) : null\}/);
  globalThis.window.ShapeAuth = { getCachedState: () => ({ user: null }) };
  const d = drive(mod.BSTerrainProfile, { person: { who: 'Priya Shah', kind: 'CLIENT', tier: 'PEAK', init: 'PS', userId: 'u-priya' }, onBack() {}, onMessage() {} });
  assert.equal(d.nodes().filter(named('BSProfileDock')).length, 0);
  const follow = d.nodes().find(named('BSFollowBlock'));
  assert.equal(follow.props.variant, 'coach');
  assert.equal(typeof follow.props.onMessage, 'function', 'another member\'s profile has no Message');
  // Your own page has none.
  const me = drive(mod.BSTerrainProfile, { person: { who: 'Quinn Harper', kind: 'CLIENT', tier: 'TEMPO', init: 'QH' }, onBack() {}, onMessage() {}, isSelf: true, meMode: true });
  assert.equal(me.nodes().find(named('BSFollowBlock')).props.onMessage, null);
});

test('the coach profile renders its dock as the component that hides on scroll, and no other sticky footer', () => {
  const src = stripComments(readFileSync(SRC, 'utf8'));
  const at = src.indexOf('function BSSignalCoachProfile(');
  const fn = src.slice(at, src.indexOf('\nfunction ', at + 10));
  assert.match(fn, /<BSProfileDock [^>]*onMessage=\{\(\) => onMsg\(person\)\}[^>]*onWorkWith=\{\(\) => setTab\('coaching'\)\}/);
  assert.doesNotMatch(fn, /position: 'sticky', bottom: 0/, 'the old dock that never moved is back');
});

// ── The dock, mounted with real React in jsdom ───────────────────────────────
const require_ = createRequire(import.meta.url);
const { JSDOM } = require_('jsdom');
const React = require_('react');
const ReactDOMClient = require_('react-dom/client');
const { BSProfileDock, BSPhotoViewer } = await loadBroadsheet(['BSProfileDock', 'BSPhotoViewer'], React);

test('the coach dock slides away while the page scrolls down and comes back up, at the top and at the end', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const sc = dom.window.document.createElement('div');
  sc.className = 'bs-scroll';
  let y = 0;
  Object.defineProperty(sc, 'scrollTop', { get: () => y, configurable: true });
  Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
  Object.defineProperty(sc, 'scrollHeight', { value: 3000, configurable: true });
  const removed = [];
  const realRemove = sc.removeEventListener.bind(sc);
  sc.removeEventListener = (type, fn, o) => { removed.push(type); realRemove(type, fn, o); };
  const host = dom.window.document.createElement('div');
  sc.appendChild(host);
  dom.window.document.body.appendChild(sc);
  const calls = [];
  const root = ReactDOMClient.createRoot(host);
  try {
    await React.act(async () => {
      root.render(React.createElement(BSProfileDock, { INK: '#f1ece1', BG: 'linear-gradient(180deg, #1a1612, #100d0a)', PAPER: '#100d0a', onMessage: () => calls.push('message'), onWorkWith: () => calls.push('work'), messageLabel: 'Message', workLabel: 'Work with Maya' }));
    });
    const dock = host.querySelector('[data-profile-dock]');
    const isHidden = () => {
      const h = dock.style.opacity === '0';
      assert.equal(dock.hasAttribute('inert'), h, 'the dock is inert exactly while it is hidden');
      assert.equal(dock.style.transform, h ? 'translateY(40%)' : 'none');
      return h;
    };
    const scrollTo = async (to) => { y = to; await React.act(async () => { sc.dispatchEvent(new dom.window.Event('scroll')); }); return isHidden(); };
    assert.equal(isHidden(), false, 'the dock starts on screen');
    assert.match(dock.style.background, /linear-gradient/, 'the dock sits on the page\'s own paper, so no text shows through it');
    assert.equal(await scrollTo(300), true, 'scrolling down hides the dock');
    assert.equal(await scrollTo(305), true, 'a resting thumb\'s few pixels don\'t bring it back');
    assert.equal(await scrollTo(280), false, 'scrolling up brings it back');
    assert.equal(await scrollTo(285), false, 'a few pixels down don\'t hide it again');
    assert.equal(await scrollTo(900), true);
    assert.equal(await scrollTo(2200), false, 'at the end of the page the dock comes back, so the last lines can be read over it');
    assert.equal(await scrollTo(1500), false, 'scrolling up from the end keeps it');
    assert.equal(await scrollTo(1700), true);
    assert.equal(await scrollTo(40), false, 'near the top the dock is always shown');
    const [msg, work] = dock.querySelectorAll('button');
    assert.equal(msg.textContent, 'Message');
    assert.equal(work.textContent, 'Work with Maya →');
    assert.equal(parseFloat(msg.style.borderRadius), 0, 'the dock\'s actions are square, as the page\'s');
    assert.equal(parseFloat(work.style.borderRadius), 0);
    assert.equal(work.style.background, 'rgb(241, 236, 225)', 'Work with is the ink action');
    assert.equal(work.style.color, 'rgb(16, 13, 10)', 'its text is the solid paper, not the page\'s gradient background');
    await React.act(async () => { msg.click(); work.click(); });
    assert.deepEqual(calls, ['message', 'work']);
  } finally {
    await React.act(async () => { root.unmount(); });
    sc.remove();
    Object.assign(globalThis, saved);
  }
  assert.deepEqual(removed, ['scroll'], 'the scroll listener outlives the dock');
});

test('a member\'s dock is Message alone, square, in the outline, and hides on scroll as the coach\'s does', async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'https://shape.test/m/' });
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const sc = dom.window.document.createElement('div');
  sc.className = 'bs-scroll';
  let y = 0;
  Object.defineProperty(sc, 'scrollTop', { get: () => y, configurable: true });
  Object.defineProperty(sc, 'clientHeight', { value: 800, configurable: true });
  Object.defineProperty(sc, 'scrollHeight', { value: 3000, configurable: true });
  const host = dom.window.document.createElement('div');
  sc.appendChild(host);
  dom.window.document.body.appendChild(sc);
  const calls = [];
  const root = ReactDOMClient.createRoot(host);
  try {
    await React.act(async () => { root.render(React.createElement(BSProfileDock, { INK: '#111111', BG: '#f4efe6', PAPER: '#f4efe6', onMessage: () => calls.push('message'), messageLabel: 'Message Priya' })); });
    const dock = host.querySelector('[data-profile-dock]');
    const buttons = dock.querySelectorAll('button');
    assert.equal(buttons.length, 1);
    assert.equal(buttons[0].textContent, 'Message Priya →');
    assert.equal(parseFloat(buttons[0].style.borderRadius), 0);
    assert.equal(buttons[0].style.background, 'transparent');
    assert.match(buttons[0].style.border, /1px solid/);
    y = 600; await React.act(async () => { sc.dispatchEvent(new dom.window.Event('scroll')); });
    assert.equal(dock.style.opacity, '0', 'scrolling down hides it');
    assert.ok(dock.hasAttribute('inert'));
    y = 560; await React.act(async () => { sc.dispatchEvent(new dom.window.Event('scroll')); });
    assert.equal(dock.style.opacity, '1', 'scrolling up brings it back');
    await React.act(async () => { buttons[0].click(); });
    assert.deepEqual(calls, ['message']);
  } finally {
    await React.act(async () => { root.unmount(); });
    sc.remove();
    Object.assign(globalThis, saved);
  }
});

test('the photo viewer: the shot whole, its caption, where it sits on the wall, and keys, arrows, × and Escape', async () => {
  const dom = new JSDOM('<!doctype html><html><body><button id="opener">shot</button><div id="bs-phone-surface"></div></body></html>', { url: 'https://shape.test/m/' });
  const saved = { window: globalThis.window, document: globalThis.document };
  globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const shots = [{ url: 'https://x.test/a.jpg', caption: 'Dawn miles before work.' }, { url: 'https://x.test/b.jpg', caption: 'Chalk on, doubts off.' }, { url: 'https://x.test/c.jpg', caption: '' }];
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const opener = dom.window.document.getElementById('opener');
  opener.focus();
  let open = true;
  function Harness({ list }) {
    const [at, setAt] = React.useState(0);
    const [on, setOn] = React.useState(true);
    open = on;
    return on ? React.createElement(BSPhotoViewer, { shots: list, at, onClose: () => setOn(false), onStep: (d) => setAt((i) => (i + d + list.length) % list.length), labels: { close: 'Close', prev: 'Previous photo', next: 'Next photo' } }) : null;
  }
  const root = ReactDOMClient.createRoot(host);
  // The harness hands every module a react-dom whose createPortal renders in place, so the viewer is looked
  // for in the page; that it portals into the phone's surface is read from the source below.
  const q = (sel) => dom.window.document.querySelector(sel);
  const key = async (k) => { await React.act(async () => { dom.window.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: k })); }); };
  try {
    await React.act(async () => { root.render(React.createElement(Harness, { list: shots })); });
    const dlg = q('[data-bs-photo-viewer]');
    assert.ok(dlg, 'the viewer did not open');
    assert.equal(dlg.getAttribute('role'), 'dialog');
    assert.equal(dlg.getAttribute('aria-modal'), 'true');
    assert.equal(dlg.style.zIndex, '300', 'the viewer sits under the tab bar');
    assert.equal(q('img').getAttribute('src'), shots[0].url);
    assert.equal(q('img').style.objectFit, 'contain', 'the shot is cropped, not shown whole');
    assert.equal(q('img').getAttribute('alt'), 'Dawn miles before work.');
    assert.match(dlg.textContent, /1 \/ 3/);
    assert.ok(dom.window.document.activeElement === q('[data-bs-photo-close]'), 'focus did not move into the viewer');
    for (const sel of ['[data-bs-photo-close]', '[data-bs-photo-prev]', '[data-bs-photo-next]']) {
      assert.equal(q(sel).style.minHeight, '44px', `${sel} is under 44 px`);
      assert.equal(parseFloat(q(sel).style.borderRadius), 0, `${sel} is round`);
    }
    await key('ArrowRight');
    assert.match(q('[data-bs-photo-viewer]').textContent, /2 \/ 3/);
    assert.match(q('[data-bs-photo-viewer]').textContent, /Chalk on, doubts off\./);
    await React.act(async () => { q('[data-bs-photo-next]').click(); });
    assert.equal(q('img').getAttribute('src'), shots[2].url);
    await React.act(async () => { q('[data-bs-photo-next]').click(); });
    assert.match(q('[data-bs-photo-viewer]').textContent, /1 \/ 3/, 'next from the last shot is the first');
    await React.act(async () => { q('[data-bs-photo-prev]').click(); });
    assert.match(q('[data-bs-photo-viewer]').textContent, /3 \/ 3/);
    await key('Escape');
    assert.equal(open, false, 'Escape did not close the viewer');
    assert.equal(q('[data-bs-photo-viewer]'), null);
    assert.ok(dom.window.document.activeElement === opener, 'focus did not go back to the shot that opened it');
    // One shot: no arrows. A tap on the dark ground closes it, as × does.
    await React.act(async () => { root.render(null); });
    await React.act(async () => { root.render(React.createElement(Harness, { list: shots.slice(0, 1) })); });
    assert.equal(q('[data-bs-photo-prev]'), null);
    assert.equal(q('[data-bs-photo-next]'), null);
    await React.act(async () => { q('[data-bs-photo-viewer]').dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    assert.equal(q('[data-bs-photo-viewer]'), null, 'a tap on the ground did not close it');
    await React.act(async () => { root.render(null); });
    await React.act(async () => { root.render(React.createElement(Harness, { list: shots })); });
    await React.act(async () => { q('[data-bs-photo-close]').click(); });
    assert.equal(q('[data-bs-photo-viewer]'), null, '× did not close it');
  } finally {
    await React.act(async () => { root.unmount(); });
    Object.assign(globalThis, saved);
  }
});

test('the viewer portals into the phone\'s surface, over the tab bar, as every sheet does', () => {
  const src = stripComments(readFileSync(SRC.replace(/iosAppBroadsheetClient\.jsx$/, 'BSProfileMagazine.jsx'), 'utf8'));
  const body = src.slice(src.indexOf('export function BSPhotoViewer('));
  assert.match(body, /document\.getElementById\('bs-phone-surface'\)/);
  assert.match(body, /return host \? createPortal\(view, host\) : view;/);
});

// Owner, 2026-10-31, of "Why I train" and "The lift I love" on the member profile: "remove this from
// member profile". The profile passes showPrompts={false}; the member's editor no longer asks for them,
// and its save writes back the answers it loaded, so the website's profile (which still reads them)
// keeps what a member already wrote. A coach's editor keeps its prompts.
test('the member profile shows no prompts, and the member\'s editor no longer asks for them', () => {
  const custom = mod.bsDemoMemberCustom();
  assert.ok(custom.prompts.some((p) => p && p.q && p.a), 'the demo still carries prompts to leave out');
  const off = drive(mod.BSProfileExtras, { custom, c: '#c0533b', INK, BG: '#fff', isSelf: false, ledger: true, demo: true, bleed: 20, showPrompts: false });
  assert.deepEqual(off.nodes().filter(named('BSTPullQuote')), [], 'an answer is pulled out');
  assert.doesNotMatch(off.text, /Why I train|The lift I love/i);
  assert.deepEqual(off.nodes().filter(named('BSTStationHead')).map((h) => h.props.label), ['The shelf · Proudest'], 'the rest of the extras stay');
  const src = readFileSync(SRC, "utf8");
  const start = src.indexOf('function BSTerrainProfile(');
  const body = src.slice(start, src.indexOf('\nfunction ', start + 30));
  assert.match(body, /<BSProfileExtras [^>]*showPrompts=\{false\}/, 'the member profile asks for the prompts again');
  for (const coach of [false, true]) {
    const d = openEditor({ initial: { prompts: [{ q: 'why', a: 'x' }] }, coach });
    openRow(d, 'about');
    const asks = /Add prompt/.test(d.text);
    assert.equal(asks, coach, coach ? 'a coach lost their prompts' : 'the member\'s editor still asks for prompts');
  }
  // What a member already wrote rides through a save (the editor's own module since 2026-11-04).
  const editorSrc = readFileSync(SRC.replace('iosAppBroadsheetClient.jsx', 'BSProfileCustomizer.jsx'), 'utf8');
  assert.match(editorSrc, /prompts: Array\.isArray\(init\.prompts\) && init\.prompts\.length \? init\.prompts\.slice\(0, 4\)/);
  assert.match(editorSrc, /prompts: prompts\.filter\(\(p\) => p && p\.q && String\(p\.a\)\.trim\(\)\)/);
});
