// tests/home-score-quote.test.mjs
//
// THE SCORE LINE under Home's masthead, member Home and coach Today (owner, 2026-11-09: "thinking of
// removing this ticker, what else can we have"; of the ideas drawn, the Shape Score as a quote, then a box
// beside its tier ring, then "actually i dont love the box", "it doesnt go well with shape radio", and of
// three ways to sit with Shape Radio, "B1"): one slim line with no box, a small ring in the tier's colour
// filled to the score's place in its tier, the score, the week's gain, the tier and how far to the next
// rung. It opens the Score page.
//
// Driven through the shipping module (BSHomeScoreQuote.jsx) and its figures (services/scoreStanding.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drive, SHIM, ROOT, THEME } from './helpers/broadsheet-mount.mjs';
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

test('the figures: the week\'s gain and the standing in the tier', () => {
  const q = bsScoreQuote(MEMBER, TIERS);
  assert.equal(q.total, 1284);
  assert.equal(q.weekN, 36);
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

test('the line: ring, score, the week, the tier and the next rung, and one tap to the Score page', () => {
  let opened = 0;
  const d = quote({ score: MEMBER, onOpen: () => { opened += 1; } });
  const text = d.text.replace(/\s+/g, ' ');
  assert.match(text, /^Score1,284▲ 36Tempo · 716 to Form →$/);
  // The ring is three quarters of a circle, filled to the score's 43% of Tempo, in Tempo's colour.
  const arc = node(d, 'data-bs-score-arc');
  const [lit] = arc.props.strokeDasharray.split(' ').map(Number);
  const full = 2 * Math.PI * 8.7 * 0.75;
  assert.ok(Math.abs(lit / full - 0.4272) < 0.001, `the arc is ${lit / full} of the ring`);
  assert.equal(arc.props.stroke, Q.bsQuoteInk('#d8a23a', THEME.isLight, THEME.PAPER), 'the ring is not in the tier\'s colour');
  // NO BOX (owner: "i dont love the box", "B1"): a transparent line on the page's paper, a 20px ring and a
  // 16px figure, in the page's gutter; still a 44px tap.
  const btn = d.nodes().filter((n) => n.type === 'button');
  assert.equal(btn.length, 1);
  const st = btn[0].props.style;
  assert.equal(st.background, 'transparent');
  assert.equal(st.border, 0);
  assert.equal(st.boxShadow, undefined, 'the line grew a shadow');
  assert.equal(st.minHeight, 44);
  assert.equal(node(d, 'data-bs-score-ring').props.width, '20');
  assert.equal(node(d, 'data-bs-score-total').props.style.fontSize, 16);
  // Named for a screen reader, and it opens the Score page.
  assert.equal(btn[0].props['aria-label'], 'Shape Score 1,284, Tempo. Open your score.');
  btn[0].props.onClick();
  assert.equal(opened, 1);
});

test('a loss, no gain, the top tier and the coach ladder', () => {
  const loss = quote({ score: { ...MEMBER, week: '-20' } }).text.replace(/\s+/g, ' ');
  assert.match(loss, /1,284▼ 20Tempo/);
  assert.doesNotMatch(quote({ score: { ...MEMBER, week: '+0' } }).text, /[▲▼]/, 'a week of nothing drew a change');
  const top = quote({ score: { live: true, total: 20000, tier: 'Legend' } }).text.replace(/\s+/g, ' ');
  assert.match(top, /Legend · Top tier$/);
  assert.doesNotMatch(top, /→| to /, 'the top tier points at a rung that is not there');
  // A coach: the coach ladder's names, no week.
  const coach = quote({ score: { live: true, total: 2340, tier: 'Elite', scoreSource: 'coach' }, tiers: COACH }).text.replace(/\s+/g, ' ');
  assert.match(coach, /^Score2,340Elite · 2,660 to Master →$/);
});

// Codex P2 on #2649: the tier's colour is 8.5px text, so it holds 4.5:1 against the paper, on either paper.
test('every tier colour holds 4.5:1 against the paper, mixed only as far as it takes', () => {
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const TIER_COLOURS = ['#5fa96e', '#d8a23a', '#e0463c', '#8fe3e6', '#34d6c5'];
  for (const [isLight, paper] of [[true, '#f5f0e6'], [false, '#0f0e0c']]) {
    for (const c of TIER_COLOURS) {
      const out = Q.bsQuoteInk(c, isLight, paper);
      assert.ok(Q.bsQuoteContrast(hex(out), hex(paper)) >= 4.5, `${c} on ${paper} reads at ${Q.bsQuoteContrast(hex(out), hex(paper)).toFixed(2)}:1`);
      // A colour that already holds is left as it is.
      if (Q.bsQuoteContrast(hex(c), hex(paper)) >= 4.5) assert.equal(out, c);
    }
  }
  // The early tiers the light paper used to print faint: Raw's green and Tempo's gold now change.
  assert.notEqual(Q.bsQuoteInk('#5fa96e', true, '#f5f0e6'), '#5fa96e');
  assert.notEqual(Q.bsQuoteInk('#d8a23a', true, '#f5f0e6'), '#d8a23a');
  // The dark paper keeps every tier's own colour.
  for (const c of TIER_COLOURS) assert.equal(Q.bsQuoteInk(c, false, '#0f0e0c'), c);
  // The rest of the line is small text too: the week's green and rust go through the same mix, and the quiet
  // words sit at 0.62 of the ink, which holds 4.5:1 on the light paper (0.56 read 4.4:1).
  const SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSHomeScoreQuote.jsx'), 'utf8');
  assert.match(SRC, /const green = bsQuoteInk\(t\.isLight \? '#2f8a3a' : '#a3e09a', t\.isLight, t\.PAPER\);/);
  assert.match(SRC, /const rust = bsQuoteInk\(t\.isLight \? '#b4452f' : '#e98a73', t\.isLight, t\.PAPER\);/);
  assert.match(SRC, /const ink50 = `rgba\(\$\{rgb\},0\.62\)`;/);
  const quiet = hex('#f5f0e6').map((p, i) => Math.round(p * 0.38 + hex('#0f0e0c')[i] * 0.62));
  assert.ok(Q.bsQuoteContrast(quiet, hex('#f5f0e6')) >= 4.5, 'the quiet words are faint on the light paper');
  for (const c of ['#2f8a3a', '#b4452f']) assert.ok(Q.bsQuoteContrast(hex(Q.bsQuoteInk(c, true, '#f5f0e6')), hex('#f5f0e6')) >= 4.5, `${c} is faint`);
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
    for (const k of ['quote.label', 'quote.toNext', 'quote.topTier', 'quote.aria']) assert.ok(typeof cat[k] === 'string' && cat[k].length > 0, `${loc}: ${k}`);
    assert.equal(cat['quote.week'], undefined, `${loc}: the box's week word is left behind`);
    assert.match(cat['quote.toNext'], /\{toNext\}/, `${loc}: the figure`);
    assert.match(cat['quote.toNext'], /\{next\}/, `${loc}: the next rung`);
    assert.match(cat['quote.aria'], /\{total\}[\s\S]*\{tier\}|\{tier\}[\s\S]*\{total\}/, `${loc}: the screen reader's figure and tier`);
    const settings = JSON.parse(readFileSync(join(ROOT, 'mobile-app/src/i18n/catalogs', loc, 'settings.json'), 'utf8'));
    assert.ok(!Object.keys(settings).some((k) => k.startsWith('ticker.')), `${loc}: the ticker editor's words are left behind`);
  }
});
