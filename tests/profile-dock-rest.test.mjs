// The profile's Message dock rests on the tab bar (owner, 2026-10-29, a screenshot of "Message Priya" about 75px
// over the tab bar on an iPhone: "message button still appearing near middle of screen"). A sticky box stops at
// the scroller's bottom padding, which BSPage sets to BS_TABBAR_H + 2 + the home indicator, past the tab bar's
// top on a phone with one; and the dock padded itself by the indicator again. Headless Chromium has no inset, so
// it only showed on the phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, drive, loadCarved } from './helpers/broadsheet-mount.mjs';

const CHROME = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
const { BSProfileDock } = await loadCarved('BSProfileMagazine.jsx');
const TABBAR_CSS = 'calc(56px + max(12px, calc(env(safe-area-inset-bottom, 0px) - 10px)))';

function dockStyle() {
  const d = drive(BSProfileDock, { INK: '#111', BG: '#fff', PAPER: '#fff', onMessage() {}, messageLabel: 'Message Priya' });
  return d.nodes().find((n) => n.props && 'data-profile-dock' in n.props).props.style;
}

test('the dock comes down by the scroller\'s reserve less the tab bar, so it sits on the tab bar on every phone', () => {
  const saved = { css: globalThis.window.BS_TABBAR_CSS, h: globalThis.window.BS_TABBAR_H };
  Object.assign(globalThis.window, { BS_TABBAR_CSS: TABBAR_CSS, BS_TABBAR_H: 68 });
  try {
    const s = dockStyle();
    assert.equal(s.position, 'sticky');
    assert.equal(s.bottom, `calc(${TABBAR_CSS} - 70px - env(safe-area-inset-bottom, 0px))`);
    // Resolved: an iPhone's 34px inset gives 56 + 24 - 70 - 34 = -24px; no inset, 56 + 12 - 70 = -2px.
    const at = (inset) => 56 + Math.max(12, inset - 10) - 70 - inset;
    assert.equal(at(34), -24);
    assert.equal(at(0), -2);
    assert.equal(s.padding, '12px 18px', 'the dock no longer pads itself by the home indicator');
  } finally { Object.assign(globalThis.window, { BS_TABBAR_CSS: saved.css, BS_TABBAR_H: saved.h }); }
});

test('without the chrome\'s tab bar sizes it rests at the bottom, as it did', () => {
  const saved = { css: globalThis.window.BS_TABBAR_CSS, h: globalThis.window.BS_TABBAR_H };
  delete globalThis.window.BS_TABBAR_CSS; delete globalThis.window.BS_TABBAR_H;
  try { assert.equal(dockStyle().bottom, 0); } finally { Object.assign(globalThis.window, { BS_TABBAR_CSS: saved.css, BS_TABBAR_H: saved.h }); }
});

test('the reserve it subtracts is the one BSPage pads by, and the chrome publishes both sizes', () => {
  // If BSPage's reserve or the tab bar's sizes change, the dock's offset has to change with them.
  assert.match(CHROME, /function BSPage\(\{ children, tabBarHeight = BS_TABBAR_H,/);
  assert.match(CHROME, /paddingBottom: `calc\(\$\{tabBarHeight \+ 2\}px \+ env\(safe-area-inset-bottom, 0px\)\)`/);
  const exported = [...CHROME.matchAll(/Object\.assign\(window,\s*\{([\s\S]*?)\}\)/g)].map((m) => m[1]).join(',');
  assert.match(exported, /\bBS_TABBAR_CSS\b/);
  assert.match(exported, /\bBS_TABBAR_H\b/);
});
