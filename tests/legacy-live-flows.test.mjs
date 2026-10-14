// The live flows that still handed people to the old root pages, and the sitemap that
// pointed search engines at them.
//
// Owner, 2026-10-14, from the legacy-pages review: "1. Fix live flows + sitemap". Four
// flows in the Next app sent a real visitor to a page from the old site: finishing Stripe
// payouts and claiming a coach role landed on the old dashboards (`trainer-dashboard.html`,
// `nutrition-schedule.html`), the checkout's back link opened the old profiles, and `/login`
// went to the old `login.html` with its `next` dropped. Sign-up's "code of conduct" link
// opened the old community page. And `sitemap.xml` listed 31 URLs, 28 of them old pages, on
// the bare domain, which redirects to www.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => readFileSync(path.join(ROOT, f), 'utf8');
const OLD_DASHBOARDS = /trainer-dashboard\.html|nutrition-schedule\.html/;
const OLD_PROFILES = /trainer-profile\.html|nutritionist-profile\.html/;

test('finishing Stripe payouts and claiming a role open the new dashboards', () => {
  for (const f of ['src/app/stripe-onboarding/success/page.tsx', 'src/app/dashboard/claim/actions.ts']) {
    const src = read(f);
    assert.doesNotMatch(src, OLD_DASHBOARDS, f + ' still sends a coach to an old dashboard');
    assert.match(src, /\/newdesign\/TrainerDashboard\.html/, f + ' names no trainer dashboard');
    assert.match(src, /\/newdesign\/NutritionistDashboard\.html/, f + ' names no nutritionist dashboard');
  }
});

test('the checkout and subscribe back links open the coach\'s living profile, by owner', async () => {
  // Codex on #2350: the first version linked `TrainerPublic.html?id=`, but those pages are
  // redirect stubs that forward only `?u=` or `?coach=` and drop `?id=`, so the visitor
  // landed on their own profile. The back link is built from the listing's owner instead.
  for (const f of ['src/app/purchase/actions.ts', 'src/app/subscribe/actions.ts']) {
    const src = read(f);
    assert.doesNotMatch(src, OLD_PROFILES, f + ' still links an old profile page');
    assert.doesNotMatch(src, /(Trainer|Nutritionist)Public\.html\?id=/, f + ' links a stub by listing id, which drops the id');
    assert.match(src, /const backHref = await coachProfileHref\(providerRole, providerId\);/, f);
  }
  const helper = read('src/lib/coach-profile-href.ts');
  assert.match(helper, /\.select\('owner_id, name'\)/, 'the helper reads the listing owner and name');

  const { coachProfilePath } = await import('../src/lib/coach-profile-path.mjs');
  // The same link the marketplace builds for a coach with an account.
  assert.equal(coachProfilePath('trainer', { owner_id: 'u-123', name: 'Sam O' }), '/newdesign/MemberProfile.html?u=u-123&role=trainer');
  assert.equal(coachProfilePath('nutritionist', { owner_id: 'u 9' }), '/newdesign/MemberProfile.html?u=u%209&role=nutritionist');
  // Shape's own listings have no owner: by name, as the marketplace does.
  assert.equal(coachProfilePath('trainer', { owner_id: null, name: 'Maya Chen' }), '/newdesign/MemberProfile.html?name=Maya%20Chen&role=trainer');
  // No listing read: the marketplace, never a broken profile link.
  assert.equal(coachProfilePath('trainer', null), '/newdesign/Marketplace.html?role=trainer');
  assert.equal(coachProfilePath('bogus', {}), '/newdesign/Marketplace.html?role=trainer');
  // Every result can take the actions' `&error=…` suffix.
  for (const r of [coachProfilePath('trainer', { owner_id: 'x' }), coachProfilePath('trainer', { name: 'y' }), coachProfilePath('trainer', null)]) {
    assert.ok(r.includes('?'), r + ' has no query for &error= to join');
  }
  // The living profile reads exactly these parameters (livingProfilePage.jsx), and the
  // marketplace links it the same way.
  const living = read('public/newdesign/livingProfilePage.jsx');
  assert.match(living, /params\.get\("u"\)/);
  assert.match(living, /params\.get\("name"\)/);
  assert.match(read('public/newdesign/marketplace.jsx'), /"MemberProfile\.html\?u=" \+ encodeURIComponent\(c\.ownerId\) \+ "&role="/);
});

test('/login forwards to the website login and keeps a safe next', () => {
  const src = read('src/app/login/page.tsx');
  assert.doesNotMatch(src, /['"]\/login\.html/, '/login still redirects to the old login page');
  assert.match(src, /\/newdesign\/Login\.html\?next=\$\{encodeURIComponent\(back\)\}/, 'next is not forwarded');
  assert.match(src, /safeReturnPath\(/, 'next is forwarded without the safe-path check');
  // The website login reads `next` and checks it again before using it.
  assert.match(read('public/newdesign/login.jsx'), /get\('next'\)/);
});

test("sign-up's code of conduct link opens the code of conduct", () => {
  const src = read('public/newdesign/signup.jsx');
  assert.match(src, /<a href="\/code-of-conduct\.html"[^>]*>code of conduct<\/a>/);
  assert.doesNotMatch(src, /href="\/community"[^>]*>code of conduct/);
});

test('the sitemap lists live pages only, on the www host, and each one exists', () => {
  const xml = read('public/sitemap.xml');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.length >= 20, `only ${locs.length} URLs in the sitemap`);
  // The bare domain redirects to www (Vercel's project domains), and a sitemap should
  // list the URLs a page is actually served at.
  for (const u of locs) assert.match(u, /^https:\/\/www\.theshapecommunity\.com\//, u + ' is not on the www host');
  const paths = locs.map((u) => new URL(u).pathname);
  for (const p of paths) assert.ok(existsSync(path.join(ROOT, 'public', p)), p + ' is in the sitemap but not in public/');
  // Root pages stay listed only if they are the legal and support pages the site's footer links.
  const KEPT_ROOT = new Set(['/help.html', '/contact.html', '/code-of-conduct.html', '/privacy.html', '/terms.html',
    '/health-data-privacy.html', '/data-compliance.html', '/subprocessors.html']);
  for (const p of paths) {
    if (!p.startsWith('/newdesign/')) assert.ok(KEPT_ROOT.has(p), p + ' is an old root page in the sitemap');
  }
  // The pages the header and footer link are all there.
  for (const p of ['index', 'Coaches', 'Marketplace', 'Pricing', 'GetApp', 'Radio', 'Recipes', 'Client']) {
    assert.ok(paths.includes(`/newdesign/${p}.html`), `/newdesign/${p}.html is missing from the sitemap`);
  }
  assert.match(read('public/robots.txt'), /^Sitemap: https:\/\/www\.theshapecommunity\.com\/sitemap\.xml$/m);
});

test('the kept legal and support pages name the www host as canonical', () => {
  for (const f of ['privacy', 'terms', 'help', 'contact', 'code-of-conduct', 'data-compliance', 'health-data-privacy', 'subprocessors']) {
    const html = read(`public/${f}.html`);
    assert.match(html, new RegExp(`<link rel="canonical" href="https://www\\.theshapecommunity\\.com/${f}\\.html"`), f + '.html');
  }
});
