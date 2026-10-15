// Client-onboarding review, fix 2b: the health screening before hiring a coach, and the
// screening in every language the app speaks (M2).
//   - Hiring a coach (a coaching subscription, or a session with a trainer) needs a completed
//     screening (src/lib/health-screening.ts). /api/stripe/checkout-session answers 409
//     screening_required (its route test is in membership-first.test.mjs); /subscribe and
//     /purchase send the member to the website's screening and back.
//   - The website's Subscribe sends the member there; the website's form says why and returns them.
//   - The app opens its screening over the checkout and carries on once it is saved.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRealModule } from './helpers/load-real-module.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const require_ = createRequire(import.meta.url);
const { parse } = require_('@babel/parser');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const lib = await loadRealModule(join(ROOT, 'src/lib/health-screening.ts'), { typescript: true });
const CLIENT = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');

function declSource(src, name) {
  const ast = parse(src, { sourceType: 'module', plugins: ['jsx'] });
  for (const node of ast.program.body) {
    if (node.type === 'FunctionDeclaration' && node.id.name === name) return src.slice(node.start, node.end);
    if (node.type === 'VariableDeclaration' && node.declarations.some((d) => d.id.name === name)) return src.slice(node.start, node.end);
  }
  throw new Error(`${name} not found`);
}

test('what hires a coach: a subscription, or a session with a trainer; never a product', () => {
  assert.equal(lib.hiresCoach({ subscription: true, providerRole: 'trainer', product: false }), true);
  assert.equal(lib.hiresCoach({ subscription: true, providerRole: 'nutritionist', product: false }), true, 'a nutrition coach is a coach');
  assert.equal(lib.hiresCoach({ subscription: false, providerRole: 'trainer', product: false }), true, 'a session');
  assert.equal(lib.hiresCoach({ subscription: false, providerRole: 'trainer', product: true }), false, 'a program or a workout');
  assert.equal(lib.hiresCoach({ subscription: false, providerRole: 'nutritionist', product: false }), false, 'a meal plan');
  assert.equal(lib.SCREENING_REQUIRED.code, 'screening_required');
  assert.equal(lib.screeningHref('/newdesign/MemberProfile.html?u=ab&error=x'),
    '/newdesign/ClientApp.html?screening=required&next=%2Fnewdesign%2FMemberProfile.html%3Fu%3Dab%26error%3Dx#settings');
});

test('a completed screening is the member\'s own document carrying consentAt; a failed read throws', async () => {
  const client = (result) => {
    const seen = [];
    const q = { select: () => q, eq: (c, v) => { seen.push([c, v]); return q; }, maybeSingle: async () => result };
    return { client: { from: (t) => { seen.push(['from', t]); return q; } }, seen };
  };
  const done = client({ data: { data: { consentAt: '2026-10-01', parq: [] } }, error: null });
  assert.equal(await lib.hasCompletedScreening(done.client, 'u1'), true);
  assert.deepEqual(done.seen, [['from', 'user_goals'], ['user_id', 'u1'], ['kind', 'health_profile']], 'their own row, by RLS');
  assert.equal(await lib.hasCompletedScreening(client({ data: { data: { parq: [] } }, error: null }).client, 'u1'), false, 'answers without the confirmation');
  assert.equal(await lib.hasCompletedScreening(client({ data: null, error: null }).client, 'u1'), false);
  await assert.rejects(lib.hasCompletedScreening(client({ data: null, error: { message: 'down' } }).client, 'u1'));
});

test('/subscribe and /purchase send an unscreened member to the screening, after the membership and before Stripe', () => {
  const sub = read('src/app/subscribe/actions.ts');
  const detour = sub.indexOf('if (detour) redirect(detour);');
  const check = sub.indexOf('screened = await hasCompletedScreening(supabase, user.id);');
  assert.ok(detour > 0 && check > detour, 'after the membership detour');
  assert.ok(check < sub.indexOf('stripeCustomerFor('), 'before any Stripe customer or checkout');
  assert.match(sub, /redirect\(`\$\{backHref\}&error=screening_check_failed`\);\n\s+\}\n\s+if \(!screened\) redirect\(screeningHref\(backHref\)\);/);

  const buy = read('src/app/purchase/actions.ts');
  const lookup = buy.indexOf("if (providerRole === 'nutritionist' && planId && Number.isFinite(planId)) {");
  const gate = buy.indexOf("if (hiresCoach({ subscription: false, providerRole, product: kind !== 'booking' || itemName != null })) {");
  assert.ok(lookup > 0 && gate > lookup, 'after the item lookup, which tells a workout from a session');
  assert.ok(gate < buy.indexOf('stripe.checkout.sessions.create('), 'before the checkout');
  assert.match(buy.slice(gate), /if \(!screened\) redirect\(screeningHref\(backHref\)\);/);

  const route = read('src/app/api/stripe/checkout-session/route.ts');
  const at = route.indexOf('if (hiresCoach({ subscription: isSubscription, providerRole, product: buysProduct })) {');
  assert.ok(at > route.indexOf("code: 'membership_required'"), 'the route asks after the membership');
  assert.ok(at < route.indexOf('customerId = await stripeCustomerFor('), 'and before the Stripe customer');
});

test('the website: Subscribe sends the member to the screening, and the form brings them back', () => {
  const shared = read('public/newdesign/livingShared.jsx');
  assert.match(shared, /if \(res\.status === 409 && j && j\.code === "screening_required"\) \{ setNeedsScreening\(true\); return; \}/);
  assert.match(shared, /<a href=\{lvScreeningHref\(\)\}/);
  assert.match(shared, /return "\/newdesign\/ClientApp\.html\?screening=required&next=" \+ encodeURIComponent\(back\) \+ "#settings";/,
    'the same address the server sends /subscribe and /purchase to');

  const settings = read('public/newdesign/clientMeSettings.jsx');
  const lifted = (search) => new Function('window', `${declSource(settings, 'hpScreeningReturn')}; return hpScreeningReturn();`)({ location: { search } });
  assert.equal(lifted(''), null);
  assert.deepEqual(lifted('?screening=required&next=%2Fnewdesign%2FMemberProfile.html%3Fu%3Dab'), { next: '/newdesign/MemberProfile.html?u=ab' });
  for (const evil of ['//evil.example', '/\\evil.example', 'https://evil.example', '/x\ny']) {
    assert.deepEqual(lifted('?screening=required&next=' + encodeURIComponent(evil)), { next: null }, `${evil} is not a same-site path`);
  }
  const card = declSource(settings, 'HealthProfileCard');
  assert.match(card, /if \(wanted && wanted\.next\) \{ setNote\("Saved\. Taking you back to your coach…"\); window\.location\.assign\(wanted\.next\); return; \}/);
  assert.ok(card.indexOf('window.location.assign(wanted.next)') > card.indexOf('if (!res.ok) throw'), 'only after the save succeeded');
  // M3 on the website: a failed read used to show an empty form that saved blanks over the answers.
  assert.match(card, /\.then\(r => \{ if \(!r\.ok\) throw new Error\("read failed"\); return r\.json\(\); \}\)/);
  assert.match(card, /if \(loadError\) \{\r?\n\s+return \([\s\S]*?Your health profile could not be loaded\. Reload the page to try again\./);
  assert.ok(card.indexOf('if (loadError)') < card.indexOf('<button onClick={save}'), 'no form to save from');
});

test('the app: a coach checkout refused for the screening opens it, and carries on once it is saved', () => {
  const host = CLIENT.slice(CLIENT.indexOf('const [screening, setScreening] = useStateBSC(null);'), CLIENT.indexOf('// ⚠ The remaining early returns still have to render BOTH overlays themselves'));
  assert.match(host, /window\.bsOpenScreening = open;/);
  assert.match(host, /<BSHealthIntake\n\s+purpose="hire"/);
  assert.match(host, /onBack=\{\(\) => setScreening\(null\)\}/, 'Back cancels the checkout');
  assert.match(host, /const next = screening\.onDone;\n\s+setScreening\(null\);\n\s+setFirstRun\(\(f\) => \(\{ \.\.\.f, health: doc \}\)\);\n\s+if \(next\) \{ try \{ next\(doc\); \} catch \(e\) \{\} \}/);
  assert.match(host, /document\.getElementById\('bs-phone-surface'\)/, 'portaled above the marketplace\'s own sheets');
  assert.equal((CLIENT.match(/\{screeningOverlay\}/g) || []).length, 3, 'drawn by every return that draws the overlays');

  const market = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
  const scr = market.indexOf("if (error?.code === 'screening_required' && window.bsOpenScreening) {");
  assert.ok(scr > 0);
  assert.match(market.slice(scr), /^[^\n]*\n\s+const retry = current;\n\s+window\.bsOpenScreening\(\{ onDone: \(\) => \{ confirmAction\(retry\); \} \}\);\n\s+return;/);
  for (const [name, fn] of [['doSubscribe', 'doSubscribe'], ['doBookOneTime', 'doBookOneTime']]) {
    assert.match(CLIENT, new RegExp(`if \\(e\\?\\.code === 'screening_required' && window\\.bsOpenScreening\\) \\{ window\\.bsOpenScreening\\(\\{ onDone: \\(\\) => \\{ ${fn}\\(\\); \\} \\}\\); return; \\}`), `${name} on a coach's profile`);
  }
});

test('the app\'s screening: three variants, and the condition chips store English and show the member\'s language', () => {
  const form = declSource(CLIENT, 'BSHealthIntake');
  assert.match(form, /const mode = purpose \|\| \(onBack \? 'settings' : 'gate'\);/);
  assert.match(form, /trailing=\{mode === 'settings' \? <BSMeCorner \/> : null\}/, 'corners only in Settings: the gate and the checkout\'s screening offer no dead exit');
  assert.match(form, /onClick=\{\(\) => toggleTag\(tag\.en\)\}/, 'the stored value is the English coaches and the website read');
  assert.match(form, /const on = conditionTags\.includes\(tag\.en\);/);
  assert.match(form, /\{tr\(`onboarding:health\.tag\.\$\{tag\.id\}`, \{ defaultValue: tag\.en \}\)\}/);
  assert.match(form, /tr\(`onboarding:health\.parq\.\$\{q\.id\}`, \{ defaultValue: q\.en \}\)/);
  assert.doesNotMatch(form, />[A-Z][a-z]+[^<{]*</, 'no English text node left in the form');
});

test('the screening speaks every language the app does (M2)', () => {
  // The keys and their English, read off the component and the two tables.
  const want = {};
  const ast = parse(CLIENT, { sourceType: 'module', plugins: ['jsx'] });
  const walk = (n) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    if (n.type === 'CallExpression' && n.callee?.name === 'tr' && n.arguments[0]?.type === 'StringLiteral' && n.arguments[0].value.startsWith('onboarding:health.')) {
      want[n.arguments[0].value.slice('onboarding:'.length)] = n.arguments[1].properties.find((p) => p.key?.name === 'defaultValue').value.value;
    }
    for (const k in n) if (k !== 'loc') walk(n[k]);
  };
  for (const node of ast.program.body) {
    if (node.type === 'FunctionDeclaration' && node.id.name === 'BSHealthIntake') walk(node);
    const d = node.type === 'VariableDeclaration' ? node.declarations[0] : null;
    if (d && (d.id.name === 'BS_PARQ' || d.id.name === 'BS_CONDITION_TAGS')) {
      for (const el of d.init.elements) {
        const get = (k) => el.properties.find((p) => p.key.name === k).value.value;
        want[`health.${d.id.name === 'BS_PARQ' ? 'parq' : 'tag'}.${get('id')}`] = get('en');
      }
    }
  }
  assert.equal(Object.keys(want).length, 54);
  assert.equal(Object.keys(want).filter((k) => k.startsWith('health.parq.')).length, 7, 'all seven PAR-Q questions');
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/onboarding.json`));
    for (const [k, en] of Object.entries(want)) {
      assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
      if (loc === 'en') assert.equal(cat[k], en, `en: ${k} is the component's own English`);
      if (en.includes('{count}')) assert.ok(cat[k].includes('{count}'), `${loc}: ${k} keeps {count}`);
    }
    if (loc !== 'en' && loc !== 'pcm') {
      for (const k of Object.keys(want).filter((k) => k.startsWith('health.parq.'))) assert.notEqual(cat[k], want[k], `${loc}: ${k} is translated`);
    }
  }
});
