// tests/home-score-quote.test.mjs
//
// THE SCORE QUOTE under Home's masthead, member Home and coach Today (owner, 2026-11-09: "thinking of
// removing this ticker, what else can we have"; of the ideas drawn, the Shape Score as a quote, "make the
// box maybe look more unique or just cooler", "less boring", and of three takes "go with A2 just make the
// box a little smaller"): a ring in the tier's colour filled to the score's place in its tier, the score,
// the week's gain and how far to the next rung. It opens the Score page.
//
// Driven through the shipping module (BSHomeScoreQuote.jsx) and its figures (services/scoreStanding.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drive, SHIM, ROOT } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { IntlMessageFormat } from 'intl-messageformat';
import { bsScoreQuote, bsScoreQuoteShown } from '../mobile-app/src/services/scoreStanding.mjs';
import { stripComments } from './helpers/strip-comments.mjs';

// The app's translator with no catalog: each string is its English default, formatted as ICU.
globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };
globalThis.bsTierColor = (name) => ({ tempo: '#d8a23a', form: '#e0463c', legend: '#34d6c5', pro: '#d8a23a', elite: '#e0463c' })[String(name).toLowerCase()] || '#5fa96e';

const REG = { registry: new Map([['react', { ...SHIM, useContext: (c) => c._currentValue }], ['react-dom', { createPortal: (n) => n }]]) };
const Q = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSHomeScoreQuote.jsx'), REG);

const TIERS = [
  { name: 'Raw', range: '0+' }, { name: 'Tempo', range: '750+' }, { name: 'Form', range: '2,000+' },
  { name: 'Peak', range: '5,000+' }, { name: 'Legend', range: '15,000+' },
];
const COACH = [
  { name: 'Certified', range: '0+' }, { name: 'Pro', range: '750+' }, { name: 'Elite', range: '2,000+' },
  { name: 'Master', range: '5,000+' }, { name: 'Icon', range: '15,000+' },
];
const MEMBER = { live: true, total: 1284, week: '+36', tier: 'Tempo' };
const quote = (props) => drive(Q.BSHomeScoreQuote, { tiers: TIERS, signedIn: true, locale: 'en-US', onOpen() {}, ...props });
const node = (d, attr) => d.nodes().find((n) => n.props && Object.prototype.hasOwnProperty.call(n.props, attr));

test('only a real figure: signed out the sample, signed in only the score once read', () => {
  // Signed out: the preview's sample (the app's preview banner labels it).
  assert.equal(bsScoreQuoteShown({ live: false, total: 1284 }, { signedIn: false }), true);
  // Signed in: the member's or coach's own score once read.
  assert.equal(bsScoreQuoteShown(MEMBER, { signedIn: true }), true);
  // Signed in and unread (a member's zero standing while it reads, a coach score loading or failed): nothing.
  assert.equal(bsScoreQuoteShown({ live: false, total: 0, tier: 'Raw' }, { signedIn: true }), false);
  assert.equal(bsScoreQuoteShown({ live: false, total: null, scoreState: 'loading' }, { signedIn: true }), false);
  assert.equal(bsScoreQuoteShown(null, { signedIn: false }), false);
  assert.equal(quote({ score: { live: false, total: 0, tier: 'Raw' } }).nodes().length, 0, 'an unread score drew a box');
});

test('the figures: the week\'s gain as a share of where the week began, and the standing in the tier', () => {
  const q = bsScoreQuote(MEMBER, TIERS);
  assert.equal(q.total, 1284);
  assert.equal(q.weekN, 36);
  assert.equal(Math.round(q.weekPct * 1000) / 10, 2.9, '36 on the 1,248 the week began with');
  assert.equal(q.st.pct, 43, '534 of Tempo\'s 1,250');
  assert.equal(q.st.toNext, 716);
  assert.equal(q.st.nextName, 'Form');
  // No gain, or a coach score (no week): no pill. A week of penalties is a loss.
  assert.equal(bsScoreQuote({ ...MEMBER, week: '+0' }, TIERS).weekN, null);
  assert.equal(bsScoreQuote({ live: true, total: 2340, tier: 'Elite' }, COACH).weekN, null);
  assert.equal(bsScoreQuote({ ...MEMBER, week: '-20' }, TIERS).weekN, -20);
  // The top tier: full, nothing ahead.
  const top = bsScoreQuote({ live: true, total: 20000, tier: 'Legend' }, TIERS);
  assert.equal(top.st.topTier, true);
  assert.equal(top.st.frac, 1);
});

test('the box: ring, tier, score, the week, the next rung, and one tap to the Score page', () => {
  let opened = 0;
  const d = quote({ score: MEMBER, onOpen: () => { opened += 1; } });
  const text = d.text.replace(/\s+/g, ' ');
  assert.match(text, /43%/, 'the ring\'s share of the tier');
  assert.match(text, /Shape score · Tempo/);
  assert.match(text, /1,284/);
  assert.match(text, /▲ 36 · 2\.9% wk/);
  assert.match(text, /716 to Form →/);
  // The ring is three quarters of a circle, filled to the same 43%.
  const arc = node(d, 'data-bs-score-arc');
  const [lit] = arc.props.strokeDasharray.split(' ').map(Number);
  const full = 2 * Math.PI * 21.5 * 0.75;
  assert.ok(Math.abs(lit / full - 0.4272) < 0.001, `the arc is ${lit / full} of the ring`);
  assert.equal(arc.props.stroke, '#d8a23a', 'the ring is not in the tier\'s colour');
  // Smaller than the drawn take (owner: "a little smaller"): a 54px ring and a 28px figure.
  assert.equal(node(d, 'data-bs-score-ring').props.style.width, 54);
  assert.equal(node(d, 'data-bs-score-total').props.style.fontSize, 28);
  // The whole box is one button, named for a screen reader, and it opens the Score page.
  const btn = d.nodes().filter((n) => n.type === 'button');
  assert.equal(btn.length, 1);
  assert.equal(btn[0].props['aria-label'], 'Shape Score 1,284, Tempo. Open your score.');
  btn[0].props.onClick();
  assert.equal(opened, 1);
});

test('a loss, no gain, the top tier and the coach ladder', () => {
  const loss = quote({ score: { ...MEMBER, week: '-20' } }).text.replace(/\s+/g, ' ');
  assert.match(loss, /▼ 20 · 1\.5% wk/);
  assert.doesNotMatch(quote({ score: { ...MEMBER, week: '+0' } }).text, /wk/, 'a week of nothing drew a pill');
  const top = quote({ score: { live: true, total: 20000, tier: 'Legend' } }).text.replace(/\s+/g, ' ');
  assert.match(top, /100%/);
  assert.match(top, /Top tier/);
  assert.doesNotMatch(top, /→| to /, 'the top tier points at a rung that is not there');
  // A coach: the coach ladder's names, no week.
  const coach = quote({ score: { live: true, total: 2340, tier: 'Elite', scoreSource: 'coach' }, tiers: COACH }).text.replace(/\s+/g, ' ');
  assert.match(coach, /Shape score · Elite/);
  assert.match(coach, /2,660 to Master →/);
  assert.doesNotMatch(coach, /wk/);
});

test('a pale tier colour holds up on a light paper; dark paper keeps it as it is', () => {
  // Peak's and Master's ice and the top rung's teal mix toward the ink on light paper; the rest stay.
  for (const pale of ['#8fe3e6', '#34d6c5']) {
    const ink = Q.bsQuoteInk(pale, true);
    assert.notEqual(ink, pale);
    assert.equal(Q.bsQuoteInk(pale, false), pale, 'dark paper changed the tier colour');
  }
  for (const deep of ['#5fa96e', '#d8a23a', '#e0463c']) assert.equal(Q.bsQuoteInk(deep, true), deep);
});

test('member Home and coach Today draw it under the masthead, where the ticker was', () => {
  const CLIENT = stripComments(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx'), 'utf8'));
  const PROS = stripComments(readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx'), 'utf8'));
  const CHROME = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/iosAppBroadsheet.jsx'), 'utf8');
  assert.match(CLIENT, /<BSHomeScoreQuote score=\{homeScore\} tiers=\{SHAPE_SCORE_TIERS\} signedIn=\{bsHomeSignedIn\} onOpen=\{\(\) => goScore && goScore\(\)\} locale=\{bsCkLocale\(\)\} \/>/);
  assert.match(PROS, /const coachScore = _bsUseLiveScore\(SHAPE_SCORE_PROFILES && SHAPE_SCORE_PROFILES\[role\]\);/);
  assert.match(PROS, /<BSHomeScoreQuote score=\{coachScore\} tiers=\{SHAPE_SCORE_TIERS_COACH\} signedIn=\{coachSignedIn\} onOpen=\{\(\) => onOpenScore\(\)\} locale=\{loc\} \/>/);
  // The coach ladder reaches the coach module through window, read when the module loads (after the client).
  assert.match(CLIENT, /\n  SHAPE_SCORE_TIERS,\n  SHAPE_SCORE_TIERS_COACH,\n/);
  // The hook runs before coach Today's one early return.
  const today = PROS.slice(PROS.indexOf('function BSProToday('));
  assert.ok(today.indexOf('const coachScore = _bsUseLiveScore(') < today.indexOf('if (schedFor) return'), 'the score hook sits after an early return');
  // No ticker anywhere.
  for (const [f, src] of [['client', CLIENT], ['pros', PROS], ['chrome', CHROME]]) assert.doesNotMatch(src, /<BSTicker\b|function BSTicker\(/, `${f} still draws the ticker`);
});

test('its words are in all 13 languages', () => {
  for (const loc of ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi']) {
    const cat = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs', loc, 'score.json'), 'utf8'));
    for (const k of ['quote.label', 'quote.toNext', 'quote.topTier', 'quote.week', 'quote.aria']) assert.ok(typeof cat[k] === 'string' && cat[k].length > 0, `${loc}: ${k}`);
    assert.match(cat['quote.toNext'], /\{toNext\}/, `${loc}: the figure`);
    assert.match(cat['quote.toNext'], /\{next\}/, `${loc}: the next rung`);
    assert.match(cat['quote.aria'], /\{total\}[\s\S]*\{tier\}|\{tier\}[\s\S]*\{total\}/, `${loc}: the screen reader's figure and tier`);
    const settings = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs', loc, 'settings.json'), 'utf8'));
    assert.ok(!Object.keys(settings).some((k) => k.startsWith('ticker.')), `${loc}: the ticker editor's words are left behind`);
  }
});
