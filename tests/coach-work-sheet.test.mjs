// The Work-with sheet's catalogue (BSCoachCoachingBlock), after the owner, 2026-10-31, of the demo
// coach's sheet, its Workouts tab saying "Publish your first plan to list it here" under every tab
// while the page showed the coach's programs: "also dont think this is working properly".
//
// The block lists a coach's published plans under a tab for each kind (trainer: Workouts, Programs,
// Coaching; nutritionist: Meals, Diets, Coaching). Now a tab shows only for a kind the coach lists, and
// no row shows with one kind or none; the empty line is the coach's to fill on their own page and
// says there is nothing yet to a member. The trainer profile hands it the sample's own programs
// (tests/trainer-profile.test.mjs).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBroadsheet, drive, textOf } from './helpers/broadsheet-mount.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const { IntlMessageFormat } = createRequire(import.meta.url)('intl-messageformat');
const mod = await loadBroadsheet(['BSCoachCoachingBlock', 'BSTStationHead']);

const cm = {
  monthlyPkg: { name: 'Monthly coaching', price: '$180', unit: '/ month', perks: [] },
  doSubscribe() {}, doBookIntro() {}, doBookOneTime() {}, wlWithdraw() {}, wlJoin() {},
  atCapacity: false, introsOpenAtCap: false, wl: null, clientOf: null,
};
const plan = (id, category, name, extra = {}) => ({ id, kind: category === 'meal' || category === 'diet' ? 'meal_plan' : 'program', name, meta: '', price: '49', category, ...extra });
const block = (props) => drive(mod.BSCoachCoachingBlock, { cm, isSelf: false, isNutri: false, first: 'Quinn', ownZero: true, salePlans: [], c: '#c0533b', ...props });
const tabs = (d) => d.nodes().filter((n) => n.type === 'button' && n.props['data-offer-tab'] != null).map((n) => n.props['data-offer-tab']);
const rows = (d) => d.nodes().filter((n) => n.props && n.props['data-offer-row'] != null).map((n) => textOf(n));
const empty = (d) => { const n = d.nodes().find((x) => x.props && x.props['data-offer-empty'] != null); return n ? textOf(n) : null; };

test('no plans: no tabs at all; the coach is told how to fill it, a member that there is nothing yet', () => {
  const own = block({ isSelf: true });
  assert.deepEqual(tabs(own), [], 'no tab row with nothing in it');
  assert.equal(empty(own), 'Publish your first plan to list it here');
  const member = block({ isSelf: false });
  assert.deepEqual(tabs(member), []);
  assert.match(empty(member), /hasn't listed a plan yet$/, 'not the coach\'s own line');
  assert.doesNotMatch(member.text, /Publish your first plan/);
});

test('one kind: its plans with no tab row; two kinds: All and those two, never an empty one', () => {
  const one = block({ salePlans: [plan('a', 'program', 'Strong in 12'), plan('b', 'program', 'Barbell basics')] });
  assert.deepEqual(tabs(one), [], 'one kind needs no tabs');
  assert.equal(rows(one).length, 2);
  assert.equal(empty(one), null);
  const two = block({ salePlans: [plan('a', 'program', 'Strong in 12'), plan('w', 'workout', 'Form check')] });
  assert.deepEqual(tabs(two), ['All', 'Workouts', 'Programs'], 'no Coaching tab with nothing in it');
  assert.equal(rows(two).length, 2, 'All lists both');
  two.click('Workouts', (n) => n.props['data-offer-tab'] != null);
  assert.equal(rows(two).length, 1);
  assert.match(rows(two)[0], /Form check/);
  assert.equal(empty(two), null, 'a tab is never empty');
  two.click('Programs', (n) => n.props['data-offer-tab'] != null);
  assert.match(rows(two)[0], /Strong in 12/);
});

test('a nutritionist\'s kinds: Meals and Diets as they are listed', () => {
  const d = block({ isNutri: true, salePlans: [plan('m', 'meal', 'Single-week reset'), plan('d', 'diet', 'Cut protocol')] });
  assert.deepEqual(tabs(d), ['All', 'Meals', 'Diets']);
  d.click('Diets', (n) => n.props['data-offer-tab'] != null);
  assert.deepEqual(rows(d).map((r) => /Cut protocol/.test(r)), [true]);
});

test('the member\'s empty line in all 13 languages, with the coach\'s name', () => {
  const dir = join(ROOT, 'mobile-app/src/i18n/catalogs');
  const locales = readdirSync(dir);
  assert.equal(locales.length, 13);
  for (const l of locales) {
    const cat = JSON.parse(readFileSync(join(dir, l, 'profile.json'), 'utf8'));
    const s = cat['coach.noPlansYet'];
    assert.ok(s, `${l} has no profile:coach.noPlansYet`);
    assert.match(new IntlMessageFormat(s, l === 'pt-BR' ? 'pt' : l).format({ name: 'Quinn' }), /Quinn/, `${l} drops the name`);
  }
});
