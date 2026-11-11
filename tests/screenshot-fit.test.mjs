// tests/screenshot-fit.test.mjs
//
// The app screenshots on the homepage and the App page fit the screen they are drawn
// on. Owner, 2026-11-11: "the screenshots on index for example get huge, take up the
// whole screen on smaller monitors". Every phone was a flat width (264px on the
// homepage, 272px on GetApp), so it was ~610-630px tall at any window height: at
// 1280x720 the journey's phone ran from the bar to the screen's foot and cut off its
// caption, and stacked under 860px the price phone grew to 420x970.
//
// This reads the shipped CSS and evaluates the width the way a browser would at each
// window height, so a change to the numbers is checked against what it draws.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const INDEX = readFileSync('public/newdesign/index.html', 'utf8');
const GETAPP = readFileSync('public/newdesign/GetApp.html', 'utf8');

const CAPTURE = 1387 / 600; // every capture is 600x1387
const BAR = 72; // the site header's height
const LEGIBLE = 200; // below this the app's own small type cannot be read

/** clamp(MIN, (vh - RESERVE) * 600 / 1387, MAX) at a window height. */
function width({ min, reserve, max }, vh) {
  return Math.min(max, Math.max(min, ((vh - reserve) * 600) / 1387));
}

function homepagePhone() {
  const m = /--phw:clamp\((\d+)px,calc\(\(100vh - (\d+)px\) \* 600 \/ 1387\),(\d+)px\)/.exec(INDEX);
  assert.ok(m, "the homepage's --phw is not clamp(MIN, calc((100vh - RESERVE) * 600 / 1387), MAX)");
  return { min: Number(m[1]), reserve: Number(m[2]), max: Number(m[3]) };
}

function getAppPhone() {
  const m = /\.beat-ph \.ph \{[^}]*width: clamp\((\d+)px, calc\(\(100vh - (\d+)px\) \* 600 \/ 1387\), (\d+)px\)/.exec(GETAPP);
  assert.ok(m, "GetApp's phone width is not clamp(MIN, calc((100vh - RESERVE) * 600 / 1387), MAX)");
  return { min: Number(m[1]), reserve: Number(m[2]), max: Number(m[3]) };
}

test('a phone screenshot leaves room for the bar and its caption on a short screen', () => {
  for (const [label, phone] of [['homepage', homepagePhone()], ['GetApp', getAppPhone()]]) {
    assert.ok(phone.min >= LEGIBLE, `${label}: the floor ${phone.min}px is under the ${LEGIBLE}px the app's type needs`);
    // The bar plus a caption of about four lines and its gaps: a reserve smaller than
    // this puts the phone back under the bar or its caption off the screen.
    assert.ok(phone.reserve >= BAR + 150, `${label}: the reserve ${phone.reserve}px leaves no room for a caption`);
    for (const vh of [600, 650, 720, 768, 800, 900, 1080, 1440]) {
      const w = width(phone, vh);
      const h = w * CAPTURE;
      if (w > phone.min) {
        assert.ok(h + phone.reserve <= vh + 0.5,
          `${label} at ${vh}px tall: a ${Math.round(h)}px phone leaves less than ${phone.reserve}px free`);
      }
    }
    // A laptop-sized window shrinks it; a full-height desktop window draws it full size.
    assert.ok(width(phone, 720) < phone.max, `${label}: at 720px tall the phone is still full size`);
    assert.equal(width(phone, 1080), phone.max, `${label}: at 1080px tall the phone is no longer full size`);
  }
  // The homepage's two phones were 264px and GetApp's 272: the cap keeps each page's own.
  assert.equal(homepagePhone().max, 264);
  assert.equal(getAppPhone().max, 272);
});

test("GetApp's phones shrink on a short phone too, under the 264px cap", () => {
  // Owner, 2026-11-11: "yes shrink the app page screenshots on phones too". Under 900px
  // the rule caps the phone at 264px and must not set a width of its own, or the height
  // clamp above stops applying and a phone is ~610px tall on any screen again.
  const narrow = /@media \(max-width: 900px\) \{[\s\S]*?\.beat-ph \.ph \{([^}]*)\}/.exec(GETAPP);
  assert.ok(narrow, "could not read GetApp's phone-layout rule for .beat-ph .ph");
  assert.match(narrow[1], /max-width: 264px;/, "GetApp's phone layout lost its 264px cap");
  assert.doesNotMatch(narrow[1], /(^|[^-])width:/, "GetApp's phone layout sets its own width, so the height clamp no longer applies");
  const phone = getAppPhone();
  const onPhone = (vh) => Math.min(264, width(phone, vh));
  assert.equal(Math.round(onPhone(844)), 261, 'an iPhone 13-sized screen');
  assert.equal(onPhone(667), phone.min, 'an iPhone SE-sized screen sits at the floor');
  assert.ok(onPhone(667) * CAPTURE < 548, "at the floor a phone is still taller than an iPhone SE shows under Safari's bars");
});

test("the homepage's phones all take --phw, so none can keep a flat width", () => {
  assert.match(INDEX, /\.jpin\{[^}]*grid-template-columns:minmax\(0,1fr\) var\(--phw\)/, "the journey's phone column is not --phw");
  assert.match(INDEX, /\.prc2\{[^}]*grid-template-columns:minmax\(0,520px\) var\(--phw\)/, "the price phone's column is not --phw");
  // Stacked under 860px the price phone used to grow to 420px wide, ~970px tall.
  assert.match(INDEX, /\.prc2 \.appph\{max-width:var\(--phw\)\}/, 'the stacked price phone is not held to --phw');
  assert.doesNotMatch(INDEX, /\.appph\{max-width:4\d\dpx\}/, 'a phone is back to a 400px+ max-width');
});

test("the moments shots are held to the screen's height in the two-column and stacked grids", () => {
  const shot = /\.mo \.shot\{([^}]*)\}/.exec(INDEX);
  assert.ok(shot, 'could not read the moments shot rule');
  assert.match(shot[1], /width:min\(100%,max\(\d+px,\d+vh\)\)/, 'the moments shot lost its height-based width cap');
  assert.match(shot[1], /margin:16px auto 0/, 'a capped moments shot is no longer centred in its card');
});

test('the card grids can shrink below their nowrap content', () => {
  // A bare `1fr` track has a min-content floor; the coach cards' nowrap name and meta
  // rows pushed the grid 34px off the screen at 1280 and 13px at 360.
  for (const sel of ['mo-grid', 'co-grid']) {
    assert.match(INDEX, new RegExp(`\\.${sel}\\{display:grid;grid-template-columns:repeat\\(4,minmax\\(0,1fr\\)\\)`),
      `.${sel} is not four minmax(0,1fr) tracks`);
  }
  assert.match(INDEX, /\.mo-grid,\.co-grid\{grid-template-columns:repeat\(2,minmax\(0,1fr\)\)\}/, 'the two-column grids lost minmax(0,1fr)');
  assert.match(INDEX, /\.mo-grid,\.co-grid\{grid-template-columns:minmax\(0,1fr\)\}/, 'the stacked grids lost minmax(0,1fr)');
  assert.doesNotMatch(INDEX, /\.(mo|co)-grid[^{]*\{[^}]*grid-template-columns:(repeat\(\d,)?1fr/, 'a card grid has a bare 1fr track again');
});
