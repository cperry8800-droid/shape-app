// Mutation spec for the Store in the nav (owner, 2026-10-09: "theres no shape store tab on
// website on nav bar, it should be a sub tab under rewards and then make it its own tab on nav
// bar when logged into an account"). Each mutation breaks one half of the swap, on the shared
// header or on the homepage's static bar; the two suites must fail on every one.
// Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/nav-rewards-store-2026-10-09.mutations.mjs --fail-on-skipped
const SHELL = 'public/newdesign/pageShell.jsx';
const PAGE = 'public/newdesign/index.html';

export default {
  test: 'node --test tests/nav-rewards-store.test.mjs tests/site-nav.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── The shared tables ───────────────────────────────────────────────────────────────
    { name: 'the Rewards menu loses its Shape Store item', file: SHELL,
      find: '  ["Shape Store", STORE_TAB.href],\n',
      replace: '' },
    { name: 'signed in, Rewards stays a menu (no replacement)', file: SHELL,
      find: '    signedIn: [{ kind: "link", label: "Rewards", href: REWARDS_HREF }, STORE_TAB] },',
      replace: '  },' },
    { name: 'signed in, the Store tab is dropped from the replacement', file: SHELL,
      find: 'signedIn: [{ kind: "link", label: "Rewards", href: REWARDS_HREF }, STORE_TAB] },',
      replace: 'signedIn: [{ kind: "link", label: "Rewards", href: REWARDS_HREF }] },' },
    { name: 'signed in, the menu is kept beside its own Store tab', file: SHELL,
      find: 'signedIn: [{ kind: "link", label: "Rewards", href: REWARDS_HREF }, STORE_TAB] },',
      replace: 'signedIn: [{ kind: "drop", label: "Rewards", href: REWARDS_HREF, match: ["Rewards"], items: REWARDS_ITEMS }, STORE_TAB] },' },
    { name: 'PORTAL_NAV ignores the replacement', file: SHELL,
      find: '  .flatMap((g) => g.signedIn || [g]);',
      replace: '  .flatMap((g) => [g]);' },
    { name: 'the Rewards menu stops lighting on the Store page', file: SHELL,
      find: 'match: ["Rewards", STORE_TAB.label]',
      replace: 'match: ["Rewards"]' },
    { name: 'the Store tab is labelled "Shape Store" on the bar', file: SHELL,
      find: 'const STORE_TAB = { kind: "link", label: "Store", href: "Store.html" };',
      replace: 'const STORE_TAB = { kind: "link", label: "Shape Store", href: "Store.html" };' },
    // ── The phone drawer ────────────────────────────────────────────────────────────────
    { name: 'the drawer\'s menu label goes back to plain text', file: SHELL,
      find: '<a href={g.href} onClick={onClose} style={{ ...linkBase, color: g.match.includes(active) ? TEAL : INK, fontWeight: 500, borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", paddingBottom: 10 }}>{g.label}</a>',
      replace: '<div style={{ ...linkBase, color: g.match.includes(active) ? TEAL : INK, fontWeight: 500, borderBottom: "1px solid rgba(var(--sh-ink-rgb, 242,237,228),0.12)", paddingBottom: 10 }}>{g.label}</div>' },
    // ── The homepage's static bar and drawer ────────────────────────────────────────────
    { name: 'the homepage Rewards menu keeps its panel signed in', file: PAGE,
      find: '<div class="nmenu" data-signed-out-only><a href="/newdesign/Store.html">Shape Store</a></div>',
      replace: '<div class="nmenu"><a href="/newdesign/Store.html">Shape Store</a></div>' },
    { name: 'the homepage Store tab is shown to visitors', file: PAGE,
      find: '      <a href="/newdesign/Store.html" data-signed-in-only>Store</a>\n',
      replace: '      <a href="/newdesign/Store.html">Store</a>\n' },
    { name: 'the homepage drawer keeps Shape Store signed in', file: PAGE,
      find: '  <a href="/newdesign/Store.html" data-signed-out-only>&nbsp;&nbsp;Shape Store</a>\n',
      replace: '  <a href="/newdesign/Store.html">&nbsp;&nbsp;Shape Store</a>\n' },
    { name: 'the homepage drawer loses its Store tab', file: PAGE,
      find: '  <a href="/newdesign/Store.html" data-signed-in-only>Store</a>\n  <a href="/newdesign/Pricing.html"',
      replace: '  <a href="/newdesign/Pricing.html"' },
    { name: 'nothing hides a signed-in-only link', file: PAGE,
      find: '  [data-signed-in-only]{display:none!important}\n',
      replace: '' },
    { name: 'the homepage bar never reveals the Store tab', file: PAGE,
      find: "        Array.prototype.slice.call(links.querySelectorAll('[data-signed-in-only]')).forEach(function(el){el.removeAttribute('data-signed-in-only');});\n",
      replace: '' },
    { name: 'the homepage drawer never reveals the Store tab', file: PAGE,
      find: "      Array.prototype.slice.call(drawer.querySelectorAll('[data-signed-in-only]')).forEach(function(el){el.removeAttribute('data-signed-in-only');});\n",
      replace: '' },
  ],
};
