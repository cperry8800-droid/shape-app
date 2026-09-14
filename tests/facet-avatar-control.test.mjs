// The corner avatar is the ONLY way into Settings, and it shipped as a bare
// `<div onClick>`: no role, no tab stop, no keyboard handler, no accessible name.
// A screen reader never learned it went anywhere and a keyboard could not reach it.
//
// This drives the shipping component rather than pinning its spelling: the question
// is what the returned element IS, which a rewrite may not change.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadBroadsheet, drive, ROOT } from './helpers/broadsheet-mount.mjs';

const { BSFacetAvatar } = await loadBroadsheet(['BSFacetAvatar']);
const root = (props) => drive(BSFacetAvatar, props).nodes()[0];

test('an avatar with an onClick is a real button', () => {
  const n = root({ onClick: () => {}, initial: 'QH' });
  assert.equal(n.type, 'button', 'the interactive avatar must be a <button>, not a div');
  assert.equal(n.props.type, 'button', 'a <button> in a form defaults to submit — say button');
  assert.ok(String(n.props['aria-label'] || '').trim(), 'an interactive avatar needs an accessible name');
  assert.match(String(n.props.className || ''), /\bbs-av-btn\b/, 'the focus ring + 44px target ride this class');
});

test('an avatar with no onClick stays an inert div, and claims nothing', () => {
  const n = root({ initial: 'QH' });
  assert.equal(n.type, 'div');
  assert.equal(n.props.role, undefined, 'a non-interactive avatar must not claim button semantics');
  assert.equal(n.props.tabIndex, undefined, 'and must not take a tab stop');
  assert.equal(n.props['aria-label'], undefined, 'and must not carry a name for an action it has not got');
  assert.equal(n.props.onKeyDown, undefined);
  assert.equal(n.props.className, undefined, 'no focus ring and no 44px target on something you cannot press');
});

test('the accessible name says what the tap does, not merely that there is an avatar', () => {
  // An explicit label wins, because what the tap DOES is a fact about the CALLER:
  // the masthead corner opens Settings, a feed avatar opens the person it shows.
  assert.equal(root({ onClick: () => {}, label: 'Your profile and settings', name: 'Quinn Harper' }).props['aria-label'],
    'Your profile and settings');
  // With no label we still say the honest thing — named when the name is known.
  // ⚠ These are the DEFAULTS, not the rendered copy: useShapeTr falls back to
  // `defaultValue` verbatim when no catalog is loaded, and that fallback does not
  // interpolate, so `{name}` stays literal here. Which key is chosen is the
  // assertion this can make; the test below stubs the catalog to prove the name
  // actually reaches it.
  assert.equal(root({ onClick: () => {}, name: 'Quinn Harper' }).props['aria-label'], '{name} — open profile');
  assert.equal(root({ onClick: () => {} }).props['aria-label'], 'Open profile');
});

test('the named form passes the name to the catalog as an argument', () => {
  // A default that reads '{name} — open profile' proves the KEY was chosen and says
  // nothing about whether `name` was handed over — so the catalog is stubbed and
  // asked what it was called with. Without this, dropping the interpolation argument
  // ships '{name} — open profile' to every screen reader in thirteen locales.
  const prev = window.ShapeI18n;
  window.ShapeI18n = { t: (key, opts) => `${key}|${(opts && opts.name) || ''}` };
  try {
    assert.equal(root({ onClick: () => {}, name: 'Quinn Harper' }).props['aria-label'],
      'profile:avatar.openNamed|Quinn Harper');
    assert.equal(root({ onClick: () => {} }).props['aria-label'], 'profile:avatar.open|');
    assert.equal(root({ onClick: () => {}, name: 'Quinn Harper', label: 'Your profile and settings' }).props['aria-label'],
      'Your profile and settings', 'an explicit label never goes through a key at all');
  } finally {
    if (prev === undefined) delete window.ShapeI18n; else window.ShapeI18n = prev;
  }
});

test('the keyboard path fires on Enter and Space and on nothing else', () => {
  // `editable` renders its own ✎ <button>; a button inside a button is invalid, so
  // that variant takes button semantics by hand. This is the branch that needs a
  // keyboard handler written out, so it is the branch that gets driven.
  let fired = 0;
  const n = root({ onClick: () => { fired += 1; }, editable: true, onEdit: () => {} });
  assert.notEqual(n.type, 'button', 'the editable variant must NOT nest a button inside a button');
  assert.equal(n.props.role, 'button');
  assert.equal(n.props.tabIndex, 0);
  const press = (key) => n.props.onKeyDown({ key, preventDefault() {} });
  press('Enter'); assert.equal(fired, 1, 'Enter must activate it');
  press(' '); assert.equal(fired, 2, 'Space must activate it');
  press('Spacebar'); assert.equal(fired, 3, 'and the legacy Space key name');
  press('a'); press('Tab'); press('Escape');
  assert.equal(fired, 3, 'no other key may activate it');
});

test('every string the avatar renders goes through the catalog', () => {
  // ⚠ ASSERTED THROUGH A STUBBED CATALOG, because the rendered text is IDENTICAL
  // whether the label is keyed or hardcoded — the key's default value is the same
  // English words. Asserting on those words passes on the defect (mutation-proven:
  // reverting this to a literal `aria-label="Change photo"` survived the first
  // round). Asking the catalog what it was called with is what separates them.
  const prev = window.ShapeI18n;
  window.ShapeI18n = { t: (key) => `KEY:${key}` };
  try {
    const edit = drive(BSFacetAvatar, { editable: true, onEdit: () => {} })
      .nodes().find((x) => x.type === 'button' && x.props['aria-label']);
    assert.ok(edit, 'the editable variant renders its ✎ button');
    assert.equal(edit.props['aria-label'], 'KEY:profile:avatar.changePhoto');
    assert.equal(edit.props.type, 'button');
  } finally {
    if (prev === undefined) delete window.ShapeI18n; else window.ShapeI18n = prev;
  }
  assert.equal(root({ editable: true, onEdit: () => {} }).type, 'div',
    'editable alone is not interactive — only an onClick makes the wrapper a control');
});

test('the focus ring is keyboard-only, and the tap target is not inflated past its neighbours', () => {
  const css = readFileSync(join(ROOT, 'mobile-app', 'index.html'), 'utf8');
  assert.ok(/\.bs-av-btn:focus-visible\s*\{[^}]*outline:\s*2px/.test(css),
    'a keyboard focus ring — the gap this change exists to close');
  assert.ok(!/\.bs-av-btn\s*:?focus\s*\{/.test(css),
    ':focus would flash a ring on every tap; :focus-visible is the whole point');
  // ⚠ NO ::after HIT AREA, ON PURPOSE. This repo's documented floor is WCAG 2.5.8 AA
  // at 24px — measured in docs/WORKLOG.md, not Apple's 44pt suggestion — and the
  // avatar clears it at every size it renders (34px in a masthead, 32px on a chat
  // row). A 44px target on a 32px gem reaches 6px past it on each side, over the
  // message bubble beside it. Asserted as an ABSENCE because re-adding it is the
  // regression, and the reason lives beside the rule in index.html.
  assert.ok(!/\.bs-av-btn::after/.test(css),
    'an enlarged hit area would overlap the chat bubble beside a 32px avatar');
});
