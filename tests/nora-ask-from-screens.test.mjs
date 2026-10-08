// Empty screens and errors offer Nora (the Ask Nora plan, step 5). An empty list asks her
// to draft or suggest; an error asks what happened, and its kind and words go with the
// question as context (cleaned and placed in the data tier by src/lib/ai/noraContext.mjs,
// driven in tests/nora-context.test.mjs). The question always lands in her composer for the
// person to send; nothing is sent for them.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadBroadsheet, drive, THEME } from './helpers/broadsheet-mount.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');
const between = (src, a, b) => {
  const i = src.indexOf(a);
  assert.ok(i >= 0, `missing: ${a}`);
  return src.slice(i, src.indexOf(b, i + a.length));
};

// ── The app ──────────────────────────────────────────────────────────────────────
const APP = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
const PROS = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
const MKT = read('mobile-app/src/broadsheet/iosAppBroadsheetMarketplace.jsx');
const { BSAskNoraLink, bsNoraContext } = await loadBroadsheet(['BSAskNoraLink', 'bsNoraContext']);

test('app: the link opens Nora\'s sheet; an error\'s kind and words go with the question', () => {
  const fired = [];
  const prev = globalThis.dispatchEvent;
  globalThis.dispatchEvent = (e) => { fired.push(e.type); return true; };
  try {
    const d = drive(BSAskNoraLink, { t: THEME, label: 'Ask Nora what happened', draft: "My booking didn't go through. What happened?", problem: { kind: 'booking', message: 'That time was just taken.' } });
    assert.match(d.text, /✦Ask Nora what happened/);
    d.click('✦Ask Nora what happened');
    assert.deepEqual(fired, ['shape:openNora']);
    assert.deepEqual(bsNoraContext().problem, { kind: 'booking', message: 'That time was just taken.' });
    drive(BSAskNoraLink, { t: THEME, label: 'Ask Nora to draft one', draft: 'Draft a workout for me: ' }).click('✦Ask Nora to draft one');
    assert.ok(!('problem' in bsNoraContext()), 'an empty list sends no error, and replaces an earlier one');
  } finally {
    globalThis.dispatchEvent = prev;
  }
  // The pros and marketplace modules read it off window.
  assert.match(APP, /Object\.assign\(window, \{ bsNoraOpen, bsNoraPage, bsAskNora, BSAskNoraLink, /);
});

test('app: an empty menu on Eat asks what to eat, today or on the day shown', () => {
  const eat = between(APP, '{effMeals.length === 0 && (eatPlanRead || !bsEatSignedIn) && (', '{/* Tonight\'s prep for tomorrow');
  // ⚠ Not before the plan read answers: a signed-in member's menu is empty until it does.
  assert.match(between(APP, 'const [eatPlanRead, setEatPlanRead] = useStateBSC(false);', '}, []);'), /\} finally \{\n[^\n]*\n\s+if \(!cancelled\) setEatPlanRead\(true\);/);
  assert.match(eat, /day === bsWeekdayIdx\(\)/);
  assert.match(eat, /label=\{tr\('feed:support\.ask\.eatTodayLink'/);
  assert.match(eat, /draft=\{tr\('feed:support\.ask\.eatToday', \{ defaultValue: 'What should I eat today\?' \}\)\}/);
  assert.match(eat, /draft=\{tr\('feed:support\.ask\.eatOnDay', \{ defaultValue: 'What should I eat on \{day\}\?', day: bsWeekdayName\(day\) \}\)\}/);
  assert.doesNotMatch(eat, /problem=/, 'an empty screen is not an error');
});

test('app: an empty Plans or Workouts list asks Nora to draft one; a trainer a workout, a nutritionist a meal plan', () => {
  const trainer = between(PROS, 'function BSTrainerPrograms(', 'function BSNutritionistApp(');
  const paid = between(trainer, "{programs.length === 0 ? (serverPlans === null ? null :", ') : (');
  assert.match(paid, /<BSProAskNora t=\{t\} label=\{tr\('feed:support\.ask\.draftWorkoutLink'.*draft=\{tr\('feed:support\.ask\.draftWorkout', \{ defaultValue: 'Draft a workout for me: ' \}\)\} \/>/);
  const sessions = between(trainer, '{workouts.length === 0 ? (', ') : (');
  assert.match(sessions, /serverPlans !== null && Redact \? <>/, 'only once the list has loaded, as the redaction');
  assert.match(sessions, /<BSProAskNora t=\{t\} label=\{tr\('feed:support\.ask\.draftWorkoutLink'/);
  const nutri = between(PROS, 'function BSNutriPlans(', '\nfunction ');
  const plans = between(nutri, '{plans.length === 0 ? (', ') : (');
  assert.match(plans, /draft=\{tr\('feed:support\.ask\.draftMealPlan', \{ defaultValue: 'Draft a meal plan for me: ' \}\)\}/);
});

// ⚠ Codex, #2261: a coach session can evaluate the pros bundle before the client module, or
// without it, so the link would never render there. The wrapper imports it on demand.
test('app: the coach screens\' link imports the client module when it is not loaded yet', async () => {
  const src = between(PROS, 'function BSProAskNora(props) {', '\nfunction BSProTextAction(');
  assert.match(src, /const Link = typeof window !== 'undefined' \? window\.BSAskNoraLink : null;/, 'read at render, never captured at load');
  assert.match(src, /if \(Link\) return undefined;\n\s+let alive = true;\n\s+import\('\.\/iosAppBroadsheetClient\.jsx'\)\.then\(\(\) => \{ if \(alive\) setLoaded\(true\); \}\)/);
  assert.match(src, /return Link \? React\.createElement\(Link, props\) : null;/);
  assert.doesNotMatch(PROS, /window\.BSAskNoraLink \? <window\.BSAskNoraLink|const AskNora = /, 'every coach site goes through the wrapper');
  // The shells read Nora's sheet off window at render, so the import is enough to open it.
  assert.equal((PROS.match(/const noraSheet = showNoraSheet && typeof window !== 'undefined' && window\.BSNoraSheet/g) || []).length, 2);
});

test('app: a coach\'s refused booking and a listing\'s failed booking or checkout ask what happened, with the words', () => {
  const sched = between(PROS, 'function BSProScheduleSession(', '\nfunction ');
  assert.match(sched, /\{status === 'error' \? <BSProAskNora t=\{t\} label=\{tr\('feed:support\.ask\.whatHappenedLink'.*problem=\{\{ kind: 'booking', message: errMsg \|\| tr\('coach:schedule\.addError'/);

  const confirm = between(MKT, 'const confirmAction = async (current) => {', "if (current.type === 'Checkout')");
  assert.match(confirm, /current = \{ \.\.\.current, problem: null \};/, '⚠ a retry that succeeds must not keep the last failure\'s link');
  assert.match(MKT, /title: tr\('marketplace:listing\.checkoutError'[^\n]*\n[^\n]*\n[^\n]*\n\s+problem: \{ kind: 'payment', message: error\?\.message \|\| tr\('marketplace:listing\.checkoutErrorBody'/);
  assert.match(MKT, /title: tr\('marketplace:listing\.bookingError'[^\n]*\n[^\n]*\n[^\n]*\n\s+problem: \{ kind: 'booking', message: error\?\.message \|\| tr\('marketplace:listing\.bookingErrorBody'/);
  const panel = between(MKT, 'function BSPublicActionPanel(', '\nfunction ');
  assert.match(panel, /\{action\.problem && !action\.done && window\.BSAskNoraLink \? \(/);
  assert.match(panel, /action\.problem\.kind === 'payment'\s*\? tr\('feed:support\.ask\.checkoutFailed'/);
  assert.match(panel, /problem=\{action\.problem\} \/>/);
});

// ── The website ──────────────────────────────────────────────────────────────────
const GCB = read('public/newdesign/globalChatButton.js');

test('website: ShapeAskNoraLink opens Nora with the draft and the error', () => {
  const win = { React: { createElement: (type, props, ...children) => ({ type, props: { ...props, children } }) } };
  const src = between(GCB, '  var noraOpen = {};', '  window.__shapeNoraSolve = function () {');
  new Function('window', 'location', 'document', src)(win, { pathname: '/newdesign/consultation.html', hash: '' }, { title: 'Shape · Book' });
  const opened = [];
  win.__openChatTo = (o) => opened.push(o);
  const el = win.ShapeAskNoraLink({ label: 'Ask Nora what happened', draft: "My checkout didn't go through. What happened?", problem: { kind: 'payment', message: 'Could not start checkout.' } });
  assert.equal(el.type, 'button');
  assert.deepEqual(el.props.children, [{ type: 'span', props: { 'aria-hidden': 'true', children: ['✦'] } }, 'Ask Nora what happened']);
  el.props.onClick();
  assert.deepEqual(opened, [{ who: 'Nora', tab: 'support', draft: "My checkout didn't go through. What happened?" }]);
  assert.deepEqual(win.__shapeNoraContext().problem, { kind: 'payment', message: 'Could not start checkout.' });
  win.ShapeAskNoraLink({ label: 'x', draft: 'What should I eat today?' }).props.onClick();
  assert.ok(!('problem' in win.__shapeNoraContext()));
  assert.equal(new Function('window', `${between(GCB, '  window.ShapeAskNoraLink = function (props) {', '\n  };\n')}\n  }; return window.ShapeAskNoraLink;`)({})({ label: 'x' }), null, 'no React on the page, no link');
});

test('website: the empty lists and the checkout error carry the link', () => {
  assert.match(read('public/newdesign/dashBuilder.jsx'), /No workouts yet\. Create a single day or program to start your library\.<\/p>\{window\.ShapeAskNoraLink&&<window\.ShapeAskNoraLink label="Ask Nora to draft one" draft="Draft a workout for me: "\/>\}/);
  assert.match(read('public/newdesign/dashMealBuilder.jsx'), /No meal plans on the website yet\. Build one to start your library\.<\/p>\s*\{window\.ShapeAskNoraLink && <window\.ShapeAskNoraLink label="Ask Nora to draft one" draft="Draft a meal plan for me: " \/>\}/);
  const noPlan = between(read('public/newdesign/dashNutri.jsx'), 'key: "noplan"', ') },');
  assert.match(noPlan, /<window\.ShapeAskNoraLink style=\{\{ marginTop: 10 \}\} label="Ask Nora what to eat today" draft="What should I eat today\?" \/>/);
  const living = read('public/newdesign/livingShared.jsx');
  assert.equal((living.match(/\{buyErr && window\.ShapeAskNoraLink \? <window\.ShapeAskNoraLink label="Ask Nora what happened" draft="My checkout didn't go through\. What happened\?" problem=\{\{ kind: "payment", message: buyErr \}\} \/> : null\}/g) || []).length, 2, 'both places the checkout error shows');
});

test('website: a refused consultation booking stays on the page and asks Nora with its words', () => {
  const html = read('public/newdesign/consultation.html');
  assert.match(html, /<div id="bookErr" role="alert" hidden /);
  assert.match(html, /<button type="button" id="bookErrAsk" hidden onclick="askNoraAboutBooking\(\)" style="(?![^"]*display:)/, '⚠ an inline display would defeat hidden');
  assert.match(html, /else showBookErr\(data\.error \|\| 'Could not book\. Please try again\.'\);/);
  assert.match(html, /catch \(_\) \{ showBookErr\('Network error\. Please try again\.'\);/);
  assert.match(between(html, 'async function confirmBooking() {', "showToast('Please select a date and time.')"), /hideBookErr\(\);/, 'a new attempt clears the last refusal');

  // The three functions, against a small DOM.
  const els = { bookErr: { hidden: true }, bookErrText: { textContent: '' }, bookErrAsk: { hidden: true } };
  const asked = [];
  const win = {};
  const fns = new Function('document', 'window', 'showToast', `${between(html, '    function showBookErr(msg) {', '    // Params + role accent.')}; return { showBookErr, hideBookErr, askNoraAboutBooking };`)({ getElementById: (id) => els[id] || null }, win, () => {});
  fns.showBookErr("That time is inside the coach's 12-hour notice.");
  assert.equal(els.bookErr.hidden, false);
  assert.equal(els.bookErrAsk.hidden, true, 'no Nora on the page, no button');
  win.shapeAskNora = (o) => asked.push(o);
  fns.showBookErr("That time is inside the coach's 12-hour notice.");
  assert.equal(els.bookErrAsk.hidden, false);
  fns.askNoraAboutBooking();
  assert.deepEqual(asked, [{ draft: "My booking didn't go through. What happened?", problem: { kind: 'booking', message: "That time is inside the coach's 12-hour notice." } }]);
  fns.hideBookErr();
  assert.equal(els.bookErr.hidden, true);
});
