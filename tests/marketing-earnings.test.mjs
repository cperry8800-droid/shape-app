// The coach and nutritionist marketing pages' earnings calculators (coach.jsx, nutritionist.jsx),
// after the Business review of 2026-10-17. They multiplied a session price by a guessed number of
// sessions, said card processing was separate, and promised weekly payouts. Clients pay a monthly
// rate; Shape takes 15% on clients who find the coach on Shape and 0% on clients the coach brings,
// and pays the card processing (destination charges, src/app/subscribe/actions.ts); payouts follow
// the coach's own Stripe schedule. These render the shipped components and read what a visitor reads.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
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
