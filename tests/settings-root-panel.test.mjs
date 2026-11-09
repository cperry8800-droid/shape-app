// tests/settings-root-panel.test.mjs
//
// THE SETTINGS ROOT AS A LIT PANEL (owner, 2026-11-04: "option C for settings page"), mounted from its own
// module (BSSettingsRoot.jsx) with what BSSettings composes for it: who you are, the two quick switches,
// Preview as / Profile mode, the six doors, Also and Sign out. That BSSettings composes them from the right
// state and writers (setPref, setTweak('role'), setDetail) is tests/settings-passport-root.test.mjs's;
// this file proves the panel draws what it is handed and hands every tap back.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { drive, textOf, SHIM, ROOT, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { IntlMessageFormat } from 'intl-messageformat';

// The app's translator with no catalog: each string is its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };
// The client's and the chrome's globals the panel reads at call time, named so the tree shows them.
globalThis.BSMastRow = function BSMastRow() { return null; };
globalThis.BSMeCorner = function BSMeCorner() { return null; };
globalThis.BSFacetAvatar = function BSFacetAvatar() { return null; };

const REG = { registry: new Map([['react', SHIM], ['react-dom', { createPortal: (n) => n }]]) };
const R = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSSettingsRoot.jsx'), REG);

// A lit slot's words take the deeper teal, the one small text needs (4.6:1 on the Cream paper).
const TEAL = THEME.isLight ? '#0a7a72' : '#34d6c5';
const DOORS = [
  ['account', 'Account', 'Email · password · 2FA'],
  ['notifications', 'Notifications', '3 of 4 active'],
  ['privacy', 'Privacy & data', 'Profile · Public'],
  ['customize', 'Customize', 'Cream · Teal · Medium'],
  ['trainnutri', 'Training & nutrition', 'Training · Nutrition'],
  ['health', 'Health integrations', 'Apple Health · WHOOP · Strava · Cycle'],
].map(([detail, title, summary]) => ({ detail, title, summary }));
const ALSO = [
  { detail: 'more', title: 'More', summary: 'Goals · Habits · Library · Score · Store' },
  { detail: 'about', title: 'About', summary: 'Help · contact · legal', value: '1.0.0' },
  { detail: 'accountactions', title: 'Account actions', summary: 'Export · pause · delete' },
];

// A member's settings, composed as BSSettings composes them: each switch writes through one writer and
// reads back what it wrote; the picker writes the role.
function member({ signedIn = false, roles = ['client'] } = {}) {
  const calls = [];
  const prefs = { onlineVisible: 'On', dailyCheckin: 'On' };
  const tweaks = { role: 'client' };
  const setPref = (k, v) => { calls.push(['setPref', k, v]); prefs[k] = v; };
  const props = () => ({
    onBack: () => calls.push(['back']),
    identity: { name: 'Quinn Harper', sub: '@quinn · Brooklyn, NY', initial: 'QH', photo: null, ring: '#d8a23a', tierColor: '#d8a23a', tierLine: 'Tempo tier', statusLine: signedIn ? 'Renews Dec 1' : 'Not a member' },
    onEdit: () => calls.push(['edit']),
    onPublicProfile: () => calls.push(['public']),
    switches: [
      { k: 'online', label: 'Online', on: prefs.onlineVisible !== 'Off', value: prefs.onlineVisible !== 'Off' ? 'Visible' : 'Hidden', onToggle: () => setPref('onlineVisible', prefs.onlineVisible !== 'Off' ? 'Off' : 'On') },
      { k: 'checkins', label: 'Check-ins', on: prefs.dailyCheckin !== 'Off', value: prefs.dailyCheckin !== 'Off' ? 'On' : 'Off', onToggle: () => setPref('dailyCheckin', prefs.dailyCheckin !== 'Off' ? 'Off' : 'On') },
    ],
    modes: [
      ...(!signedIn ? [{ key: 'preview', title: 'Preview as', meta: 'Demo data', label: 'Profile type', opts: [['client', 'Client'], ['trainer', 'Trainer'], ['nutritionist', 'Nutrition']], value: tweaks.role, hint: "Browse each account type's demo data — no sign-up needed." }] : []),
      ...(roles.length > 1 ? [{ key: 'mode', title: 'Profile mode', meta: 'Client view', label: 'Active profile', opts: roles.map((r) => [r, r]), value: tweaks.role, hint: '' }] : []),
    ],
    onPickRole: (key) => { calls.push(['role', key]); tweaks.role = key; },
    tiles: DOORS,
    also: ALSO,
    onOpen: (d) => calls.push(['open', d]),
    onLogout: () => calls.push(['logout']),
  });
  return { calls, prefs, tweaks, props, mount: () => drive(R.BSSettingsRoot, props()) };
}
const byAttr = (d, k, v) => d.nodes().filter((n) => n.props && n.props[k] != null && (v === undefined || n.props[k] === v));
const one = (d, k, v) => byAttr(d, k, v)[0];
const tap = (n) => n.props.onClick({ preventDefault() {}, stopPropagation() {} });

test('the panel opens on the masthead, ← Back and Settings, then who you are with the tier in its lit slot', () => {
  const m = member();
  const d = m.mount();
  const fnNode = (tree, name) => tree.nodes().find((n) => typeof n.type === 'function' && n.type.name === name);
  // The head is the one every Settings page draws (BSSettingsHead, owner 2026-11-09: "need to improve
  // every other page in app settings with updated look"): the masthead row, ← Back, the title.
  const head = fnNode(d, 'BSSettingsHead');
  assert.ok(head, 'the panel does not open on the shared Settings head');
  assert.equal(head.props.title, 'Settings');
  const h = drive(R.BSSettingsHead, head.props);
  assert.ok(fnNode(h, 'BSMastRow'), 'no masthead row');
  const back = fnNode(h, 'BSBackRow');
  assert.equal(back.props.label, 'Back');
  back.props.onBack();
  assert.deepEqual(m.calls.pop(), ['back'], 'the shell’s Back does not close Settings');
  assert.match(h.text, /^Settings$/, 'the head carries more than its title: a kicker over it is back');
  const rule = h.nodes().find((n) => n.props && n.props['aria-hidden'] === 'true' && /linear-gradient\(90deg, #/.test(String(n.props.style && n.props.style.background)));
  assert.ok(rule, 'the title lost its teal hairline');
  const tier = one(d, 'data-settings-tier');
  assert.equal(textOf(tier), 'Tempo tier');
  assert.match(tier.props.style.border, /216, 162, 58/, 'the tier slot is not framed in the tier’s colour');
  assert.match(d.text, /Quinn Harper@quinn · Brooklyn, NYTempo tierNot a member/);
  assert.equal(fnNode(d, 'BSFacetAvatar').props.initial, 'QH');
  d.click('Edit profile');
  d.click('Public profile');
  assert.deepEqual(m.calls.splice(0), [['edit'], ['public']]);
});

test('each quick switch is its half of the plate, its state a lit slot, and a tap flips it through its writer', () => {
  const m = member();
  let d = m.mount();
  const sw = (k) => one(d, 'data-settings-switch', k);
  const slot = (k) => byAttr(d, 'data-settings-switch-slot').find((n) => sw(k).props.children.includes(n));
  for (const k of ['online', 'checkins']) {
    assert.equal(sw(k).props['aria-pressed'], true);
    assert.equal(slot(k).props['data-settings-switch-slot'], 'on');
    assert.equal(slot(k).props.style.color, TEAL, 'a switch that is on is not lit');
  }
  assert.equal(textOf(slot('online')), 'Visible');
  tap(sw('online'));
  d = m.mount();
  assert.deepEqual(m.calls.pop(), ['setPref', 'onlineVisible', 'Off']);
  assert.equal(sw('online').props['aria-pressed'], false);
  assert.equal(slot('online').props['data-settings-switch-slot'], 'off');
  assert.equal(textOf(slot('online')), 'Hidden');
  assert.equal(slot('online').props.style.color, THEME.INK50, 'a switch that is off is still lit');
  assert.equal(slot('checkins').props['data-settings-switch-slot'], 'on', 'one tap flipped both');
  tap(sw('checkins'));
  d = m.mount();
  assert.deepEqual(m.calls.pop(), ['setPref', 'dailyCheckin', 'Off']);
  assert.equal(textOf(slot('checkins')), 'Off');
  tap(sw('online'));
  d = m.mount();
  assert.equal(slot('online').props['data-settings-switch-slot'], 'on', 'it does not come back on');
});

test('Preview as: the profile types are lit buttons, the chosen one lit, and a tap switches the preview role', () => {
  const m = member();
  let d = m.mount();
  assert.ok(one(d, 'data-settings-mode', 'preview'));
  assert.match(d.text, /Preview asDemo dataProfile type/);
  const role = (k) => one(d, 'data-settings-role', k);
  assert.deepEqual(['client', 'trainer', 'nutritionist'].map((k) => role(k).props['aria-checked']), [true, false, false]);
  tap(role('trainer'));
  assert.deepEqual(m.calls.pop(), ['role', 'trainer']);
  d = m.mount();
  assert.deepEqual(['client', 'trainer', 'nutritionist'].map((k) => role(k).props['aria-checked']), [false, true, false]);
  assert.equal(role('trainer').props.style.color, TEAL);
  assert.equal(role('client').props.style.color, THEME.INK50);
  // Signed in with one account: no picker at all. With two: Profile mode, its own roles only.
  assert.equal(byAttr(member({ signedIn: true }).mount(), 'data-settings-mode').length, 0);
  const multi = member({ signedIn: true, roles: ['client', 'trainer'] }).mount();
  assert.deepEqual(byAttr(multi, 'data-settings-mode').map((n) => n.props['data-settings-mode']), ['mode']);
  assert.deepEqual(byAttr(multi, 'data-settings-role').map((n) => n.props['data-settings-role']), ['client', 'trainer']);
});

test('the six doors are a grid of numbered tiles, each opening its own page; Also opens its rows; Sign out signs out', () => {
  const m = member();
  const d = m.mount();
  assert.match(d.text, /6 sections/);
  const doors = byAttr(d, 'data-settings-door');
  assert.deepEqual(doors.map((n) => n.props['data-settings-door']), [...DOORS, ...ALSO].map((c) => c.detail));
  DOORS.forEach((c, i) => {
    const tile = one(d, 'data-settings-door', c.detail);
    const words = textOf(tile);
    assert.ok(words.startsWith(String(i + 1).padStart(2, '0')), `${c.detail} is not numbered ${i + 1}`);
    assert.ok(words.includes(c.title) && words.includes(c.summary), `${c.detail} lost its name or what is behind it`);
    tap(tile);
    assert.deepEqual(m.calls.pop(), ['open', c.detail]);
  });
  for (const c of ALSO) {
    tap(one(d, 'data-settings-door', c.detail));
    assert.deepEqual(m.calls.pop(), ['open', c.detail]);
  }
  assert.match(textOf(one(d, 'data-settings-door', 'about')), /1\.0\.0/, 'About lost the build');
  tap(one(d, 'data-settings-signout'));
  assert.deepEqual(m.calls.pop(), ['logout']);
  assert.equal(textOf(one(d, 'data-settings-signout')), 'Sign out');
  assert.equal(m.calls.length, 0);
});
