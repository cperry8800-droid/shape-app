// The Weekly check-in, redrawn in Home's look in its own module (owner, 2026-11-11: "update the look of
// that weekly check-in you moved to coaches to new updated design"): its words through the catalogs, a
// rating a row of numbered pills, and a failed send said on the page with the answers kept.
import test from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { drive, textOf, SHIM, ROOT, THEME } from './helpers/broadsheet-mount.mjs';
import { loadRealModule } from './helpers/load-real-module.mjs';
import { IntlMessageFormat } from 'intl-messageformat';

globalThis.ShapeI18n = { t: (key, opts = {}) => new IntlMessageFormat(String(opts.defaultValue ?? key), 'en').format(opts) };
const REG = { registry: new Map([['react', { ...SHIM, useContext: (c) => c._currentValue }], ['react-dom', { createPortal: (n) => n }]]) };
const M = await loadRealModule(join(ROOT, 'mobile-app/src/broadsheet/BSWeeklyCheckin.jsx'), REG);
const SRC = readFileSync(join(ROOT, 'mobile-app/src/broadsheet/BSWeeklyCheckin.jsx'), 'utf8');

const withChrome = (fn) => {
  const prev = { BSPage: globalThis.BSPage, BSDetailHeader: globalThis.BSDetailHeader, BSFooter: globalThis.BSFooter, useBS: globalThis.useBS };
  globalThis.BSPage = function BSPage({ children }) { return children; };
  globalThis.BSDetailHeader = function BSDetailHeader({ kicker, title }) { return `${kicker} ${title}`; };
  globalThis.BSFooter = function BSFooter() { return null; };
  globalThis.useBS = () => THEME;
  try { return fn(); } finally { Object.assign(globalThis, prev); }
};

test('the page: its words, every question asked until the plan read answers, a rating of numbered pills', () => {
  withChrome(() => {
    const d = drive(M.BSWeeklyCheckin, { onBack: () => {} });
    const header = d.nodes().find((n) => typeof n.type === 'function' && n.type.name === 'BSDetailHeader');
    assert.equal(header && header.props.kicker, 'Weekly check-in');
    assert.equal(header && header.props.title, 'How did the week go?');
    assert.match(d.text, /Two minutes\. Your coaches read it/);
    for (const re of [/Rate the week/, /1 rough · 10 great/, /Training adherence/, /Hunger control/, /Body/, /Weight \(lb\)/, /Measurements \(in\)/, /Upper arm/, /Progress photos/, /Private: only you and your coaches see these\./, /The week in words/, /A question for your coach/, /Send check-in →/]) assert.match(d.text, re);
    const energy = d.nodes().find((n) => n.props && n.props['data-weekly-rating'] === 'energy');
    const pills = d.nodes().filter((n) => n.type === 'button' && n.props.role === 'radio' && /^Energy: /.test(n.props['aria-label'] || ''));
    assert.ok(energy);
    assert.equal(pills.length, 10);
    assert.equal(pills[6].props['aria-label'], 'Energy: 7 of 10');
    assert.equal(textOf(pills[9]), '10');
  });
});

test('signed out it asks to sign in; a failed send is said on the page and the page stays', async () => {
  // The send's failure path, from the source: the answers stay, a line says so, nothing goes to the toast.
  assert.match(SRC, /setErr\(tr\('home:weekly\.failed'/);
  assert.match(SRC, /\{err \? <div role="alert" data-weekly-error=""/);
  assert.doesNotMatch(SRC, /__bsToast/, 'toasts are a no-op app-wide');
  assert.match(SRC, /if \(typeof onSent === 'function'\) onSent\(\); else onBack\(\);/, 'only a sent check-in reports itself sent');
  assert.match(SRC, /window\.ShapeCheckins\.submit\(\{ ratings: bsCheckinRatingsToSave\(ratings, plans\), wins,/);
  // Every word through the catalogs: no English literal left between tags.
  const literals = [...SRC.matchAll(/>\s*([A-Z][a-z]+(?: [a-z]+)+)\s*</g)].map((m) => m[1]);
  assert.deepEqual(literals, [], 'English left in the markup');
});
