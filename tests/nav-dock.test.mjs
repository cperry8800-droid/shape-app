// Ask Nora and Chat in the website's header, beside search (owner, 2026-11-13: "Do A for both").
// The two bars (pageShell.jsx's Header, the homepage's own) leave empty slots and
// globalChatButton.js fills them; the floating pill steps aside only while a filled slot is on
// screen, so a page with no header keeps Nora in reach.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';

const read = (p) => readFileSync(new URL('../public/newdesign/' + p, import.meta.url), 'utf8');
const SHELL = read('pageShell.jsx');
const INDEX = read('index.html');
const DOCK = read('globalChatButton.js');

test('both bars put the slot right after search, and the collapsed bar keeps one by its menu', () => {
  assert.match(SHELL, /<SiteSearch signedIn=\{!!authUser\} \/>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<span data-nav-dock-slot="a" \/>/, 'the shared header lost the slot beside search');
  assert.match(SHELL, /className="shape-nav-bell"[^>]*>\s*(\{\/\*[\s\S]*?\*\/\}\s*)?<span data-nav-dock-slot="m" \/>/, 'the collapsed header lost its slot');
  assert.match(INDEX, /<span id="shape-nav-search"[^>]*><\/span>\s*(<!--[\s\S]*?-->\s*)?<span data-nav-dock-slot="a"><\/span>/, 'the homepage lost the slot beside search');
  assert.match(INDEX, /<span data-nav-dock-slot="nm"><\/span>\s*<button class="nburger"/, 'the homepage lost its slot by the menu button');
  // One placement: no slot after Radio, and no switch left to pick another.
  for (const [name, src] of [['pageShell.jsx', SHELL], ['index.html', INDEX], ['globalChatButton.js', DOCK]]) {
    assert.ok(!/data-nav-dock-slot="b|slot~=b|navdock=|shape\.navDock|data-nav-dock=/.test(src), `${name} still carries the B placement or its switch`);
  }
  // Out of reach while a menu is open, as the pill is: the panels are hidden until it closes.
  assert.match(DOCK, /body\.shape-drawer-open \[data-nav-dock-slot\]\{visibility:hidden!important\}/, 'the nav doors stay tappable under an open menu');
  assert.match(INDEX, /body\.shape-drawer-open #shape-rich-chat-root/, 'the homepage no longer hides the panel under its menu');
  // The tours light the header's doors, not the hidden pill.
  const TOUR = read('dashTour.js');
  assert.match(TOUR, /function navDoor\(cls\) \{ return shown\('\[data-nav-dock-slot\] \.' \+ cls\); \}/);
  assert.match(TOUR, /function chatBtn\(\) \{ return navDoor\('nvd-chat'\)\(\) \|\| document\.getElementById\('shape-global-chat-button'\); \}/);
  assert.ok(!/sel\('#shape-global-chat-button \.sgc-(nora|chat)'\)/.test(TOUR), 'a tour step anchors the hidden pill again');
  // An empty slot takes no gap in either row.
  assert.match(SHELL, /\[data-nav-dock-slot\]:empty \{ display: none; \}/);
  assert.match(INDEX, /\.nauth \[data-nav-dock-slot\]:empty\{display:none\}/);
});

// 2026-11-13: signed in, the cluster beside the tabs also carries the bell, the greeting, Dashboard
// and for some a switch pill or Admin, and with the labelled pair the tabs ran into it (by 44px at
// 1344 beside a Nutritionist pill). Each bar marks itself signed in, and the pair is icons there.
test('signed in, both bars keep Ask Nora and Chat to their icons', () => {
  assert.match(SHELL, /<header className="shape-header"[^>]*\bdata-nav-dock-icons=\{authUser \? "" : undefined\}/, 'the shared header no longer marks itself signed in for the pair');
  assert.match(INDEX, /if\(navBar\)navBar\.setAttribute\('data-nav-dock-icons',''\);/, 'the homepage no longer marks its bar signed in for the pair');
  const at = INDEX.indexOf("navBar.setAttribute('data-nav-dock-icons'");
  assert.ok(at > INDEX.indexOf("hi.className='login nhi'") - 600 && at < INDEX.indexOf("hi.className='login nhi'"), 'the homepage marks its bar outside the signed-in branch');
  for (const rule of ['.nvd-pair .nvd-label{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}', '.nvd-pair .nvd-nora{padding:0 6px 0 5px}', '.nvd-pair .nvd-chat{padding:0 10px 0 9px}', '.nvd-pair .nvd-count{position:absolute;']) {
    assert.ok(DOCK.includes('[data-nav-dock-icons] [data-nav-dock-slot~=a] ' + rule), 'the signed-in pair lost ' + rule);
  }
});

function load({ slotOnScreen }) {
  const dom = new JSDOM(`<!doctype html><html><head></head><body>
    <header><span id="search"></span><span data-nav-dock-slot="a"></span></header>
  </body></html>`, { url: 'https://shape.test/newdesign/Pricing.html', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom;
  // jsdom lays nothing out: a slot is "on screen" when the test says so.
  const real = window.Element.prototype.getClientRects;
  window.Element.prototype.getClientRects = function () {
    return this.hasAttribute && this.hasAttribute('data-nav-dock-slot') ? (slotOnScreen ? [{}] : []) : real.call(this);
  };
  window.eval(DOCK);
  return window;
}
const frame = (w) => new Promise((r) => w.requestAnimationFrame(() => setTimeout(r, 0)));

test('the slot is filled with Ask Nora and Chat, and the corner pill steps aside', async () => {
  const w = load({ slotOnScreen: true });
  await frame(w);
  const slot = w.document.querySelector('[data-nav-dock-slot="a"]');
  assert.ok(!!slot.querySelector('.nvd-nora[aria-label="Ask Nora"]'), 'no Ask Nora in the slot');
  assert.ok(!!slot.querySelector('.nvd-chat[aria-label="Open Shape chat"]'), 'no Chat in the slot');
  assert.ok(!!w.document.getElementById('shape-global-chat-button'), 'the pill is still mounted (pages .click() it)');
  assert.equal(w.document.documentElement.classList.contains('shape-nav-dock'), true, 'the pill did not step aside');
  assert.ok(!w.document.getElementById('shape-global-chat-spacer'), 'the corner is still reserved');
  // Ask Nora opens her door, as the pill's Nora half did.
  const asked = [];
  w.__openChatTo = (o) => asked.push(o);
  slot.querySelector('.nvd-nora').click();
  assert.equal(JSON.stringify(asked), JSON.stringify([{ who: 'Nora', tab: 'support' }]), 'Ask Nora did not open her door');
  w.close();
});

test('with no slot on screen the pill stays, so Nora is never out of reach', async () => {
  const w = load({ slotOnScreen: false });
  await frame(w);
  assert.equal(w.document.documentElement.classList.contains('shape-nav-dock'), false, 'the pill hid with no header to stand in');
  w.close();
});
