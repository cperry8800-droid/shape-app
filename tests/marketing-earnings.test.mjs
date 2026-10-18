// The coach and nutritionist marketing pages' earnings calculators (coach.jsx, nutritionist.jsx),
// after the Business review of 2026-10-17. They multiplied a session price by a guessed number of
// sessions, said card processing was separate, and promised weekly payouts. Clients pay a monthly
// rate; Shape takes 15% on clients who find the coach on Shape and 0% on clients the coach brings,
// and pays the card processing (destination charges, src/app/subscribe/actions.ts); payouts follow
// the coach's own Stripe schedule. These render the shipped components and read what a visitor reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';

const require_ = createRequire(import.meta.url);
const React = require_('react');
const { renderToStaticMarkup } = require_('react-dom/server');
const babel = require_('next/dist/compiled/babel/core');
const presetReact = require_('next/dist/compiled/babel/preset-react');

function load(file, name) {
  const src = readFileSync(new URL('../public/newdesign/' + file, import.meta.url), 'utf8');
  const at = src.indexOf('function ' + name + '() {');
  assert.ok(at > 0, name + ' moved');
  const end = src.indexOf('\n// ---------- ', at);
  const code = babel.transformSync(src.slice(at, end), { presets: [presetReact], babelrc: false, configFile: false }).code;
  const Pass = ({ children }) => React.createElement(React.Fragment, null, children);
  return new Function('React', 'CoReveal', 'NuReveal', 'mono', 'serif', 'sans', 'TEAL', 'RUST', 'INK', code + '\nreturn ' + name + ';')(React, Pass, Pass, 'mono', 'serif', 'sans', '#2ee0c4', '#c0533b', '#f2ede4');
}
const text = (el) => renderToStaticMarkup(el).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');

for (const [file, name, clients, rate] of [['coach.jsx', 'TrainerEarnings', 20, 150], ['nutritionist.jsx', 'NutEarnings', 18, 140]]) {
  test(file + ': clients × a monthly rate, 15% off, card processing on Shape, payouts on the coach\'s schedule', () => {
    const t = text(React.createElement(load(file, name)));
    const gross = clients * rate;
    const net = gross - Math.round(gross * 0.15);
    assert.ok(t.includes('$' + gross.toLocaleString()), 'gross is clients × rate: ' + t.slice(0, 400));
    assert.ok(t.includes('$' + net.toLocaleString()), 'take-home after 15%');
    assert.ok(t.includes('$' + (net * 12).toLocaleString() + '/yr'));
    assert.match(t, /Monthly rate per client/);
    assert.match(t, /Clients you bring 0%/);
    assert.match(t, /No Shape fee on clients you bring\./);
    const src = readFileSync(new URL('../public/newdesign/' + file, import.meta.url), 'utf8');
    const body = src.slice(src.indexOf('function ' + name + '() {'), src.indexOf('\n// ---------- ', src.indexOf('function ' + name + '() {')));
    assert.match(body, /Card processing is on Shape, too\./);
    assert.match(body, /Set your own monthly rate and keep what you earn\./);
    assert.match(body, /Payouts straight to your bank, on the schedule you set in Stripe/);
    assert.doesNotMatch(body, /card processing is separate|Weekly payouts|sessions per client|touchpoints/i);
    // The page's FAQ says the same as its calculator (Codex, #2394).
    assert.doesNotMatch(src, /card processing is separate/i);
    assert.match(src, /takes a small platform fee when you get paid, and pays the card processing\./);
    assert.match(body, /const grossMonthly = clients \* price;\n  const feeMonthly = Math\.round\(grossMonthly \* \(1 - byo \/ 100\) \* PLATFORM_FEE_RATE\);/);
  });
}

// The trainer new-program page's fee note (newProgram.jsx NpFeeNote). It said "Shape keeps 8%",
// paid out 92% of every sale and promised weekly payouts; the platform takes 15% from a client who
// found the coach on Shape and nothing from a client they bring, and payouts follow Stripe.
test('newProgram.jsx: a sale nets the price after Shape\'s 15% from a client found on Shape, and all of it from one the coach brings', async () => {
  const { PLATFORM_FEE_RATE } = await import('../src/lib/platform-fee.mjs');
  const src = readFileSync(new URL('../public/newdesign/newProgram.jsx', import.meta.url), 'utf8');
  const rate = /const NP_FEE_RATE = ([0-9.]+);/.exec(src);
  assert.ok(rate, 'NP_FEE_RATE moved');
  assert.equal(Number(rate[1]), PLATFORM_FEE_RATE, 'the page uses the platform fee');
  const fn = /function NpFeeNote\(\{ price \}\) \{[\s\S]*?\n\}/.exec(src)[0];
  const code = babel.transformSync(rate[0] + '\n' + fn, { presets: [presetReact], babelrc: false, configFile: false }).code;
  const NpFeeNote = new Function('React', 'INK', code + '\nreturn NpFeeNote;')(React, '#f2ede4');
  const t = text(React.createElement(NpFeeNote, { price: '220' })).replace(/&#x27;/g, "'");
  assert.match(t, new RegExp('You receive \\$' + (220 * (1 - PLATFORM_FEE_RATE)).toFixed(2).replace('.', '\\.') + ' per sale to a client who found you on Shape, after Shape\'s 15%, and the full price from clients you bring\\.'));
  assert.match(t, /Card processing is on Shape\. Payouts go straight to your bank, on the schedule you set in Stripe\./);
  assert.match(text(React.createElement(NpFeeNote, { price: '' })), /You receive — per sale/);
  const code_ = src.replace(/^\s*\/\/.*$/gm, '');
  assert.doesNotMatch(code_, /8%|0\.92|Weekly payouts/i, 'no trace of the old fee or schedule outside the comment that records it');
  assert.match(src, /<NpFeeNote price=\{price\} \/>/, 'the pricing card shows it');
});

// ── Payout timing, on the whole page (Codex, #2394) ──
// A coach is paid into their own Stripe (Standard) account and Stripe pays it out to their bank on
// the schedule they set there (src/lib/stripe.ts reads it for the Business page). The calculator
// said so, but the value strip, the tools and the FAQ still promised weekly deposits, "usually
// Monday", or instant payouts any day, which Shape doesn't set either. A cadence claim is "weekly"
// (or every week, or instant) within a clause of "payout", "deposit" or "to your bank", either way
// round. The copy is every string and JSX text on the page, comments left out, in source order and
// joined with " · ", so a stat strip's "Weekly" sits next to its "Payouts direct to your bank" the
// way a visitor reads the two.
const CADENCE = '(?:weekly|every week|each week|per week|once a week|instant(?:ly)?)';
const PAYS = '(?:payouts?|paid out|deposits?|to your bank)';
const PAYOUT_CADENCE = new RegExp('\\b' + CADENCE + '\\b[^.?!]{0,40}?\\b' + PAYS + '\\b|\\b' + PAYS + '\\b[^.?!]{0,40}?\\b' + CADENCE + '\\b', 'i');

function copyOf(src) {
  const ast = babel.parseSync(src, { presets: [presetReact], babelrc: false, configFile: false, sourceType: 'unambiguous' });
  const out = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    if (n.type === 'StringLiteral' || n.type === 'JSXText') out.push([n.start, n.value]);
    else if (n.type === 'TemplateElement') out.push([n.start, n.value.cooked || '']);
    for (const k of Object.keys(n)) if (k !== 'loc' && !/Comments$/.test(k)) walk(n[k]);
  })(ast.program);
  return out.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' · ').replace(/\s+/g, ' ');
}
const pageCopy = (file) => {
  const src = readFileSync(new URL('../public/newdesign/' + file, import.meta.url), 'utf8');
  return file.endsWith('.html') ? src.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') : copyOf(src);
};
const cadenceClaim = (copy) => { const m = copy.match(PAYOUT_CADENCE); return m && copy.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40); };

test('the payout-cadence check catches what the pages said, and not a week that is not about pay', () => {
  for (const said of [
    'no per-booking cuts. · Weekly · Payouts direct to your bank, or instant any day. · Verified',
    'Payouts · Weekly direct deposit, or instant. Clean monthly statements.',
    'How fast do payouts land? · Weekly, direct to your bank — usually Monday.',
    'Need it faster? Instant payouts are available any day.',
    'Payouts? · Weekly, direct to your bank. Instant payouts available any day.',
    'Programs + sessions + subs · Weekly payouts · nutritionist',
    'Verified · Weekly · Payouts to coaches — or instant · No lock-in',
    'Publish programs and sessions · Weekly payouts, instant if you want · Shape handles billing',
    'per sale. Weekly payouts via Stripe Connect.',
    'How do payouts work? · Direct to your bank on a weekly schedule, or instantly on any day.',
  ]) assert.ok(cadenceClaim(said), 'missed: ' + said);
  for (const fine of [
    'Weekly volume · lbs lifted',
    'Streaks, check-ins, flagged clients, weekly adherence. Sort by whatever you care about today.',
    'saved replies for the questions you answer weekly. · Payouts & docs · Straight to your bank, on the schedule you set in Stripe.',
    'RX · Week 4',
    'I used to spend 10 hours a week on admin. Now I coach. The scheduling and billing alone paid for itself in the first month.',
  ]) assert.equal(cadenceClaim(fine), null, 'flagged: ' + fine);
});

for (const [file, strip, tools, faq] of [
  ['coach.jsx',
    'Direct · Payouts straight to your bank, on the schedule you set in Stripe.',
    'Payouts · Straight to your bank, on the schedule you set in Stripe. Clean monthly statements.',
    'How fast do payouts land? · On the schedule you set in your own Stripe account, straight to your bank. Change it there any time.'],
  ['nutritionist.jsx',
    'Direct · Payouts straight to your bank, on the schedule you set in Stripe.',
    'Payouts & docs · Straight to your bank, on the schedule you set in Stripe. Clean monthly statements.',
    'Payouts? · Straight to your bank, on the schedule you set in your own Stripe account.'],
]) {
  test(file + ': nowhere on the page promises weekly or instant payouts; the strip, the tools and the FAQ say the coach\'s Stripe schedule', () => {
    const copy = pageCopy(file);
    assert.ok(copy.length > 4000, 'read the whole page');
    assert.equal(cadenceClaim(copy), null);
    assert.ok(copy.includes(strip), 'value strip');
    assert.ok(copy.includes(tools), 'tools');
    assert.ok(copy.includes(faq), 'FAQ');
    assert.ok(copy.includes('Payouts straight to your bank, on the schedule you set in Stripe · '), 'calculator');
  });
}

// The other website pages a coach reads before applying say the same. coaches.jsx is left as it is
// (its fee and payout copy is the owner's open call, #2394); dashBusiness.jsx prints the signed-in
// coach's own Stripe interval ("Paid out weekly · Fridays"), which is their setting, not a promise.
test('no other website page promises weekly or instant payouts', () => {
  const dir = new URL('../public/newdesign/', import.meta.url);
  const SKIP = new Set(['coaches.jsx', 'dashBusiness.jsx']);
  const files = readdirSync(dir).filter((f) => /\.(jsx|html)$/.test(f));
  for (const f of SKIP) assert.ok(files.includes(f), f + ' moved');
  for (const f of ['landing.jsx', 'signup.jsx', 'newProgram.jsx', 'Landing.html', 'SignupTrainer.html']) assert.ok(files.includes(f), f + ' moved');
  const claims = files.filter((f) => !SKIP.has(f)).map((f) => [f, cadenceClaim(pageCopy(f))]).filter(([, c]) => c);
  assert.deepEqual(claims, []);
  assert.ok(pageCopy('landing.jsx').includes('Direct · Payouts to each coach\'s bank, on their Stripe schedule'));
  assert.equal(pageCopy('landing.jsx').split('Payouts on your Stripe schedule').length - 1, 2, 'trainer and nutritionist cards');
  assert.equal(pageCopy('signup.jsx').split('Payouts straight to your bank, on your Stripe schedule').length - 1, 2, 'trainer and nutritionist applications');
  assert.match(pageCopy('newProgram.jsx'), /Payouts go straight to your bank, on the schedule you set in Stripe\./);
});
