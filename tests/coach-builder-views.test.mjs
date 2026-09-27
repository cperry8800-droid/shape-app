// The trainer builder's two canvases, its dates, and the weekday defaults behind them.
//
// ⚠ EVERY DATE THIS BUILDER DRAWS MUST BE THE DATE THE ASSIGNMENT WOULD WRITE. The sheet
// and the grid label bands from `dbuDateMap`, which calls `DashBuilder.buildAssignmentRows`
// — the same function `DbuAssignModal` calls to publish. A second copy of the arithmetic
// would let the preview and the assignment disagree, which is worse than showing no date at
// all, so the first test here drives BOTH and requires them equal rather than pinning any
// spelling of the rule.
import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {loadRealModule} from './helpers/load-real-module.mjs';
import {stripComments} from './helpers/strip-comments.mjs';
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://shape.test/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=window.localStorage;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react');globalThis.React=React;
Object.assign(globalThis, await loadRealModule(fileURLToPath(new URL('../public/newdesign/coachBuilderLayouts.jsx', import.meta.url)), {appendExports:'export {COACH_BUILDER_LAYOUTS, CoachBuilderNav, CoachBuilderFooter, coachTemplateCopy};'}));
const {createRoot}=require('react-dom/client');globalThis.ReactDOM=require('react-dom');
globalThis.DashBuilder=require('../public/newdesign/dashBuilderCore.js');
globalThis.ShapeWorkoutDocument=require('../public/newdesign/workoutDocument.js');
globalThis.DashPill=({children})=>React.createElement('span',null,children);
globalThis.DashWorkoutCard=()=>React.createElement('div',{'data-testid':'client-card'});

// `dashData.jsx` is not loaded here, so its two remembered-choice globals are stubbed. The
// hook itself has a suite of its own (tests/dashboard-remembered-choices.test.mjs — account
// binding, the write lane, the three read states); what THIS file has to prove is that the
// builder asks it the right question, with the right allow-list.
const REMEMBER={opens:[],asks:[]};
globalThis.useRememberedChoices=(live)=>{REMEMBER.opens.push(live);return {live,doc:{},accountId:live?'coach-a':null};};
globalThis.useRememberedChoice=(store,key,allowed,fallback)=>{
  const [v,setV]=React.useState(fallback);
  REMEMBER.asks.push({key,allowed,fallback,live:!!(store&&store.live)});
  return [v,setV];
};

// The builder's tag picker places its panel through `useDfbPopShift`, published by the
// library's filter bar (dashFilterBar.jsx) — loaded here as the hosts load it, before the
// builder, and as the real module rather than a stand-in.
Object.assign(globalThis,await loadRealModule(fileURLToPath(new URL('../public/newdesign/dashFilterBar.jsx',import.meta.url)),{appendExports:'export { DashFilterBar, DashFacetMenu, DashTagChips, DFB_EMPTY, dfbRun, dfbToggle, dfbClearFacet, dfbSelected, dfbCountLabel, dfbPopShift, useDfbPopShift };'}));

const SRC=fileURLToPath(new URL('../public/newdesign/dashBuilder.jsx',import.meta.url));
const mod=await loadRealModule(SRC,{appendExports:'export { DbuBuilder, DbuRow, dbuWithWeekdays, dbuDefaultWeekdays, dbuDateMap, dbuNextFreeWeekday, dbuSummary, dbuMondayOf, dbuAssignWeekday, dbuTakenByWeekday, dbuWeekSound };'});
const {DbuBuilder,DbuRow,dbuWithWeekdays,dbuDefaultWeekdays,dbuDateMap,dbuNextFreeWeekday,dbuSummary,dbuMondayOf,dbuAssignWeekday,dbuTakenByWeekday,dbuWeekSound}=mod;

const buttons=()=>[...document.querySelectorAll('button')];
const byText=t=>buttons().find(b=>b.textContent===t);
const text=()=>document.body.textContent;

// A two-session week, the shape F3 is about, with NO weekday on either day.
function legacyDoc(){
  const d=DashBuilder.newProgram('Lower');
  d.weeks[0].days=[DashBuilder.newDay('Squat day'),DashBuilder.newDay('Pull day')];
  d.weeks[0].days.forEach(day=>{day.blocks[0].rows=[DashBuilder.newRow({name:'Back squat',muscle:'legs',equipment:'barbell'})];});
  d.weeks.push(JSON.parse(JSON.stringify(d.weeks[0])));
  return d;
}
const template=doc=>({id:'11111111-2222-3333-4444-555555555555',name:'Lower',published:false,detail:{revision:1,builder:doc||legacyDoc()}});
// ⚠ EVERY ROOT IS TORN DOWN EVEN WHEN A TEST THROWS. Without this a failing assertion leaves
// its root mounted, the next test mounts another into the same #root, and every one of them
// keeps the builder's own 900ms draft timer for `React.act` to drain. Measured under the
// mutation that stops the Sheet switch clearing its selection: 154s without this teardown
// against 102s with it.
// ⚠ IT IS A MITIGATION AND NOT THE CURE, AND AN EARLIER VERSION OF THIS COMMENT CLAIMED
// OTHERWISE. The minute belonged to an assertion handed a live DOM node — see the rule above
// the `.drawer.float` check below. With that fixed the same mutation fails in 1ms, and what
// this teardown is worth is a few hundred milliseconds of DOM the next test would inherit.
const OPEN=[];
afterEach(async()=>{while(OPEN.length){const r=OPEN.pop();await React.act(async()=>r.unmount());}});
async function mount(t,extra={}){
  const root=createRoot(document.getElementById('root'));
  OPEN.push(root);
  await React.act(async()=>root.render(React.createElement(DbuBuilder,{template:t,clients:[],queue:[],live:false,ownerId:'coach-a',playlists:[],clips:[],dayTemplates:[{name:'Saved push day',day:DashBuilder.newDay('Push')}],onBack(){},onSaved(){},...extra})));
  // The drag/canvas regressions exercise the optional popped-out Planner editor.
  await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Planner').click());
  await React.act(async()=>document.querySelector('.wg button.c:not(.rest)').click());
  await React.act(async()=>[...document.querySelectorAll('button')].find(b=>b.textContent==='Pop out editor')?.click());
  return root;
}

test('the dates drawn are the dates the assignment would write, never a second copy of the rule',()=>{
  const doc=dbuWithWeekdays(legacyDoc());
  const start='2026-10-05'; // a Monday
  const drawn=dbuDateMap(doc,start);
  const assigned={};
  DashBuilder.buildAssignmentRows(doc,{id:null,name:''},start).forEach(r=>{
    const t=r.payload.template; assigned[(t.week-1)+':'+(t.day-1)]=r.scheduledDate;
  });
  assert.ok(Object.keys(assigned).length>=4,'the assignment produced no dated rows — this check would be vacuous');
  assert.deepEqual(drawn,assigned,'the builder must label a band with the date that band will really land on');
});

// ⚠ F3 (P0). `newDay` carried no weekday and `builderToAssignmentRows` falls back to the
// day INDEX, so a two-session week landed Mon + TUE with five empty days after it and
// nothing on screen said so.
test('a two-session week defaults to Mon and Thu, not two consecutive days',()=>{
  assert.deepEqual(dbuDefaultWeekdays(2),[0,3]);
  assert.deepEqual(dbuDefaultWeekdays(3),[0,2,4]);
  const doc=dbuWithWeekdays(legacyDoc());
  assert.deepEqual(doc.weeks[0].days.map(d=>d.weekday),[0,3]);
  const dates=dbuDateMap(doc,'2026-10-05');
  assert.equal(dates['0:0'],'2026-10-05','the first session lands on the reference Monday');
  assert.equal(dates['0:1'],'2026-10-08','the second lands on Thursday, not Tuesday');
  assert.equal(dates['1:0'],'2026-10-12','week 2 is a clean seven days on');
});

test('a weekday the coach already set is never overwritten by the defaults',()=>{
  const d=legacyDoc();
  d.weeks[0].days[0].weekday=5; // Saturday, deliberately
  const out=dbuWithWeekdays(d);
  assert.equal(out.weeks[0].days[0].weekday,5,'a coach-set weekday survives the backfill');
  assert.notEqual(out.weeks[0].days[1].weekday,5,'the day given a default does not collide with it');
});

test('a document whose days all carry weekdays is returned unchanged, by identity',()=>{
  const d=dbuWithWeekdays(legacyDoc());
  assert.equal(dbuWithWeekdays(d),d,'a second pass must not clone a document that needs nothing');
});

test('past seven days a week the extras cycle rather than falling back to the day index',()=>{
  const out=dbuDefaultWeekdays(9);
  assert.equal(out.length,9);
  assert.ok(out.every(x=>x>=0&&x<=6),'every weekday is a real weekday');
  assert.deepEqual(out.slice(0,7),[0,1,2,3,4,5,6]);
});

test('the next free weekday skips the ones the week is already using',()=>{
  assert.equal(dbuNextFreeWeekday({days:[{weekday:0},{weekday:3}]}),2,'Mon and Thu taken, the 3-day table offers Wed');
  assert.equal(dbuNextFreeWeekday({days:[{weekday:0},{weekday:1},{weekday:2},{weekday:3},{weekday:4},{weekday:5},{weekday:6}]}),0,'a full week has nothing free and must still answer');
});

test('the summary is derived from the document, never typed',()=>{
  const doc=dbuWithWeekdays(legacyDoc());
  const s=dbuSummary(doc,dbuDateMap(doc,'2026-10-05'));
  assert.equal(s.weeks,2);
  assert.equal(s.sessions,4);
  assert.deepEqual(s.weekdays,[0,3]);
  assert.equal(s.last,'2026-10-15');
});

test('both views render, the switch flips between them, and each is the same document',async()=>{
  const root=await mount(template());
  const grid=byText('▦Grid'),sheet=byText('▤Sheet');
  assert.ok(grid&&sheet,'the builder offers both canvases');
  assert.equal(grid.getAttribute('aria-pressed'),'true','Grid opens first');
  assert.equal(sheet.getAttribute('aria-pressed'),'false');
  assert.match(text(),/Squat day/,'the grid draws the session');
  assert.match(text(),/Rest/,'an empty weekday reads Rest rather than nothing');
  await React.act(async()=>sheet.click());
  assert.equal(byText('▤Sheet').getAttribute('aria-pressed'),'true','the switch flips');
  assert.match(text(),/Week 1/,'the sheet runs weeks across');
  assert.match(text(),/Week 2/);
  assert.match(text(),/Back squat/,'and exercises down');
  await React.act(async()=>root.unmount());
});

// ⚠ F2 (P0). No date appeared anywhere while building; the first one a coach saw was
// inside a collapsed <details> in the Assign modal.
test('a date is on screen in both views, and the header says whose start it is not',async()=>{
  const MON=/^\d{1,2} (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)$/;
  const root=await mount(template());
  // ⚠ Read the date ELEMENTS, not the page text: textContent concatenates adjacent nodes
  // ("Week 1" + "28 Sep" reads as "128 Sep"), so a \b-anchored sweep reports a correctly
  // dated grid as undated — an instrument failure that looks exactly like the defect.
  const gridDates=[...document.querySelectorAll('.wg .c .d')].map(n=>n.textContent);
  assert.ok(gridDates.length>=2,'the grid drew no session cells at all');
  assert.ok(gridDates.every(d=>MON.test(d)),'every session cell carries its date: '+JSON.stringify(gridDates));
  assert.match(text(),/each client's own start is chosen at assign/i,'the reference start is never presented as the client start');
  assert.ok(document.querySelector('input[type="date"]'),'the reference Monday is a control, not a constant');
  await React.act(async()=>byText('▦Grid▤Sheet')?.click?.()||[...document.querySelectorAll('.seg button')].find(b=>/Sheet/.test(b.textContent)).click());
  const heads=[...document.querySelectorAll('.sh thead th small')].map(n=>n.textContent);
  assert.ok(heads.length>=2,'the sheet drew no week columns');
  assert.ok(heads.every(h=>/(Mon|Tue|Wed|Thu|Fri|Sat|Sun) \d{1,2} /.test(h)),'every week column carries its date: '+JSON.stringify(heads));
  await React.act(async()=>root.unmount());
});

// ⚠ F1 (P0). The preview used to wrap into the 210px tree column, 1,413px below the fold,
// where position:sticky could not lift it because the cell it stuck inside WAS that row. A
// coach ticked the box, saw nothing change, and concluded the control did nothing.
// ⚠ THE CANVAS IS NOW FULL WIDTH AND BOTH PANELS FLOAT OVER IT, which is the board's own
// `.drawer` / `.pop` and is measured rather than preferred: as columns they left the grid
// 640px, at which "Rest · ＋ Add session" wraps to three lines and the sheet's week columns
// clip. So nothing can wrap into a row that does not exist.
test('both panels float over a full-width canvas, and neither hides the other view', async () => {
  const src = await import('node:fs').then(fs => fs.readFileSync(SRC, 'utf8'));
  assert.ok(!/\.dbu-c3\{|\.dbu-layout\{/.test(src),
    'the old multi-column layout must not come back — a child of it wrapped below the fold');
  // ⚠ THIS PINNED `position:absolute` AND THE PANEL IS NOW `fixed` — the fix, not a
  // drift. Absolute anchored it to the PAGE while `max-height:calc(100vh - 140px)`
  // sized it against the SCREEN, and those two cannot both be true: measured at
  // 1440x940 in Sheet the box ran y 496 → bottom 1296, so 556px of it (and 2,933px
  // of scrollable content inside it) sat below the fold, and reaching its lower half
  // scrolled its own Done button off the top. What this test is NAMED for is that
  // the panel floats over a full-width canvas instead of taking a column, and both
  // out-of-flow positions satisfy that; the literal was never the invariant.
  assert.match(src, /\.dbu2 \.drawer\.float\{position:fixed/, 'the day editor floats over the canvas');
  // ⚠ AND ITS HEIGHT IS DERIVED FROM WHERE IT ACTUALLY SITS. A fixed box budgeted as
  // `100vh - <constant>` is the same defect in a different position: it fits only
  // while it happens to start at that constant.
  // ⚠ SCOPED TO THE DRAWER'S OWN RULE, because the blanket version FAILS CORRECT
  // CODE. `.dbu2 .pop` still carries `max-height:calc(100vh - 120px)` as its
  // RESTING budget, which is exact while the stylesheet's bottom anchor holds.
  // ⚠ THAT PREMISE USED TO READ "it is pinned to the viewport BOTTOM, so a
  // viewport-relative budget is exact there" AND IT IS NO LONGER TRUE: the
  // preview is draggable, so once moved it is positioned by its own top like the
  // drawer — which is why the drag hook overrides `maxHeight` inline for both
  // panels from the same expression. The CSS budget is the untouched-panel case.
  // Comments are stripped first — this file's own prose quotes the retired rule.
  // ⚠ THE INTERPOLATIONS ARE BLANKED BEFORE THE RULE IS CUT OUT. This block is a
  // template literal, so `width:${DBU_PANEL_W}px` puts a `}` INSIDE the rule — and
  // a `[^}]*` body match stops dead at it, reading only the front of the
  // declaration. Mutation-proven: re-adding `max-height:calc(100vh - 140px)` AFTER
  // that point SURVIVED the first version of this guard.
  const code = stripComments(src).replace(/\$\{[^}]*\}/g, 'X');
  const floatRule = /\.dbu2 \.drawer\.float\{([^}]*)\}/.exec(code);
  assert.ok(floatRule, 'the .dbu2 .drawer.float rule is gone — this guard is reading nothing');
  assert.ok(!/max-height/.test(floatRule[1]),
    'the panel must not carry a CSS height budget; it is computed from its own top in JS');
  // ⚠ RE-ANCHORED ON THE INVARIANT, NOT THE SPELLING. This pinned `panelPos.y` —
  // the name the day panel's own machinery happened to use before both panels
  // moved onto one `useDbuDrag` hook, where the same expression reads `pos.y`. A
  // correct refactor failed a test about height budgets. What the guard is for is
  // that the budget is measured DOWN FROM THE PANEL'S OWN TOP rather than from a
  // constant, and that is what it asks now.
  const budget = /maxHeight: Math\.max\([^\n]*window\.innerHeight - ([A-Za-z.]*\by)\b/.exec(code);
  assert.ok(budget, 'a floating panel must size itself from its own top, so the budget is correct by construction');
  assert.ok(!/maxHeight: Math\.max\([^\n]*window\.innerHeight - \d/.test(code),
    'the budget must not be a constant offset from the viewport — that fits only while the panel starts at that constant');
  assert.match(src, /\.dbu2 \.pop\{position:fixed/, 'the client preview floats too');
  assert.match(src, /@media\(max-width:1100px\)\{\.dbu2 \.drawer\.float\{position:static/,
    'and drops back into the flow on a narrow screen rather than covering the page');

  const root = await mount(template());
  assert.ok(document.querySelector('.drawer.float'), 'a day is open, so the panel floats');
  assert.ok(document.querySelector('.wg'), 'and the grid is still rendered under it');

  // Sheet is read left to right across weeks, so the panel must not sit over those columns.
  await React.act(async () => [...document.querySelectorAll('.seg button')].find(b => /Sheet/.test(b.textContent)).click());
  // ⚠ NEVER HAND A LIVE DOM NODE TO A VALUE-COMPARING ASSERTION. `assert.equal(node, null)`
  // reads perfectly well and, on the failing path, node builds the error's diff with
  // util.inspect over an element whose parent pointers reach the whole document: measured at
  // 81s, after which the runner SIGKILLs the FILE — so the mutation reads as killed while the
  // four tests below this one never ran at all. The boolean form throws the same message in
  // 1ms. tests/assert-dom-value.test.mjs keeps the shape out of both builder suites.
  assert.ok(!document.querySelector('.drawer.float'),
    'switching to Sheet closes the panel, which would otherwise cover the week columns');
  assert.ok(document.querySelector('.sh'), 'the sheet renders');

  await React.act(async () => byText('Preview as client').click());
  const pop = document.querySelector('[role="dialog"][aria-label="Client preview"]');
  assert.ok(pop, 'the preview is reachable and on screen in Sheet');
  assert.ok(document.querySelector('.sh'), 'without displacing the sheet');
  // No day is picked (switching view closed the panel), so the preview says so rather than
  // drawing somebody else's session — the honest empty this file's own rules require.
  assert.match(pop.textContent, /Pick a session/, 'with nothing picked it says so');
  assert.ok(!document.querySelector('[data-testid="client-card"]'),
    'and draws no client card while nothing is picked');
  await React.act(async () => [...document.querySelectorAll('.sh tr.band .bn button')][0].click());
  const pop2 = document.querySelector('[role="dialog"][aria-label="Client preview"]');
  assert.ok(pop2.contains(document.querySelector('[data-testid="client-card"]')),
    'and once a session is picked it carries that client card');
  await React.act(async () => root.unmount());
});

// The engine §1.4 of the review says must survive any redesign. The tree carried these and
// the tree is gone; losing one to a layout change would be a silent regression.
// ⚠ AND IT ASKS WHETHER THE CONTROL IS ON SCREEN, not merely in the document. `byText`
// reads `textContent`, which a `hidden` attribute or `display:none` does not change —
// measured: a mutation that hid the week "Progress" button SURVIVED this test until the
// visibility check was added, which is a control a coach cannot reach passing a guard whose
// whole subject is that the control survived.
const shown=el=>!!el&&!el.hidden&&!el.hasAttribute('hidden')&&(el.style||{}).display!=='none'&&(el.style||{}).visibility!=='hidden';
test('no week or day tool was lost with the retired tree',async()=>{
  const root=await mount(template());
  for (const label of ['Copy','Progress','Deload','Duplicate day','Done']) {
    assert.ok(shown(byText(label)),'the builder still offers "'+label+'", and on screen');
  }
  assert.ok(byText('＋ Week'),'and adding a week');
  assert.ok([...document.querySelectorAll('select')].some(s=>s.getAttribute('aria-label')==='Add a saved day to week 1'),
    'reuse-a-saved-day survives; it is the one tree control with no home in either canvas');
  await React.act(async()=>root.unmount());
});

test('duplicating a day gives the copy its own free weekday rather than a collision',async()=>{
  const root=await mount(template());
  await React.act(async()=>byText('Duplicate day').click());
  assert.match(text(),/Squat day \(copy\)/,'the copy is there');
  await React.act(async()=>byText('▤Sheet').click());
  const bands=text().match(/Squat day/g)||[];
  assert.ok(bands.length>=2,'and it is a band of its own, not merged into the original');
  await React.act(async()=>root.unmount());
});

// The board's G tab asks for this in as many words: "the switch is remembered per coach, so
// whoever thinks in calendars opens to the grid and whoever programs in spreadsheets opens
// to the sheet".
test('the view switch is remembered per coach, against the switch\'s own options',async()=>{
  REMEMBER.opens.length=0;REMEMBER.asks.length=0;
  const root=await mount(template(),{live:true});
  const ask=REMEMBER.asks.find(a=>a.key==='builderView');
  assert.ok(ask,'the builder asks the dashboard store which view this coach last had open');
  assert.equal(ask.fallback,'grid','and opens to the calendar when nobody has chosen yet');
  assert.ok(REMEMBER.opens.includes(true),'the store is opened live for a signed-in coach');
  // ⚠ DERIVED FROM THE RENDERED SWITCH, not from a list typed here. `useRememberedChoice`
  // silently IGNORES a stored value outside its allow-list, so a view the switch offers and
  // the allow-list omits reads on screen as "it forgot what I picked" with nothing failing.
  const offered=[...document.querySelectorAll('.seg button')].map(b=>b.textContent.replace(/[^A-Za-z]/g,'').toLowerCase());
  assert.ok(offered.length>=2,'the switch rendered no options — this check would be vacuous');
  assert.deepEqual(ask.allowed,offered,'every view the switch offers must be a value the store will keep');
  await React.act(async()=>root.unmount());
});

test('the signed-out preview opens no per-account document',async()=>{
  REMEMBER.opens.length=0;
  const root=await mount(template());
  assert.deepEqual([...new Set(REMEMBER.opens)],[false],
    'there is no account to remember against in the preview, so the store stays shut');
  await React.act(async()=>root.unmount());
});

// ── Drag and drop on the grid ────────────────────────────────────────────────
// ⚠ DRIVEN THROUGH THE MOUNTED GRID, never matched in the source. Both defects below are
// about what the document ends up holding after a drop, and a handler can be spelled any
// number of correct ways — what must not change is the result on screen.
const cells = () => [...document.querySelectorAll('button.c')];
const weekCells = (wi) => cells().slice(wi * 7, wi * 7 + 7);
const populated = (wi) => weekCells(wi).filter((c) => !c.className.includes('rest'));
const fire = async (el, type) => {
  await React.act(async () => { el.dispatchEvent(new window.Event(type, { bubbles: true })); });
};
const dragOnto = async (from, to) => { await fire(from, 'dragstart'); await fire(to, 'drop'); };

test('a session dragged onto an empty cell in ANOTHER week does not move within its own', async () => {
  // ⚠ THE REST CELL WAS MISSING THE `f.wi === wi` GUARD ITS POPULATED SIBLING CARRIES, and
  // that was not a harmless no-op: `moveTo` only ever edits the DRAG SOURCE's week, so the
  // drop target the coach aimed at was ignored and the session silently changed WEEKDAY back
  // in week 1. Moving a day between weeks is a feature and is deliberately not what this
  // asserts — the fix is that the two cell types behave the same. (CodeRabbit, #2143.)
  await mount(template(dbuWithWeekdays(legacyDoc())));           // two weeks, Mon + Thu
  const before = weekCells(0).map((c) => c.className.includes('rest'));
  assert.deepEqual(before.filter((r) => !r).length, 2, 'setup: week 1 does not have two sessions');
  const tueOfWeek2 = weekCells(1).find((c) => (c.getAttribute('aria-label') || '').startsWith('Add a session on Tue'));
  assert.ok(tueOfWeek2, 'setup: week 2 has no empty Tuesday to drop onto');

  await dragOnto(populated(0)[0], tueOfWeek2);

  assert.deepEqual(weekCells(0).map((c) => c.className.includes('rest')), before,
    "a cross-week drop reassigned the session's weekday inside its own week");
  assert.equal(populated(1).length, 2, 'the drop target week gained or lost a session');
});

test('a session dropped onto an occupied day SWAPS with it — no session can vanish', async () => {
  // ⚠ THE GRID FINDS A DAY BY WEEKDAY, so two days sharing one means the second cannot be
  // rendered, selected or edited while the document still holds it. Dropping onto a populated
  // cell means that weekday is by definition taken, so before the swap this was the ORDINARY
  // case, not an edge one — and it passes the `f.wi === wi` guard, so that guard never
  // protected it. Found by reading the diff after CodeRabbit's rest-cell finding.
  await mount(template(dbuWithWeekdays(legacyDoc())));
  assert.equal(populated(0).length, 2, 'setup: week 1 does not have two sessions');
  const names = () => populated(0).map((c) => (c.querySelector('b') || {}).textContent);
  assert.deepEqual(names(), ['Squat day', 'Pull day'], 'setup: the two sessions are not where expected');

  await dragOnto(populated(0)[0], populated(0)[1]);              // Mon onto the occupied Thu

  assert.equal(populated(0).length, 2, 'a session disappeared from the grid — two days share a weekday');
  assert.deepEqual(names(), ['Pull day', 'Squat day'], 'the drop did not swap the two days');
});

test('the source is one handler, so the two cell types cannot drift apart again', async () => {
  // The tests above prove the BEHAVIOUR; this proves there is only one behaviour to prove.
  const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'));
  const drops = [...src.matchAll(/onDrop=\{([^\n]*)\}\n/g)].map((m) => m[1].trim());
  assert.equal(drops.length, 2, 'the grid no longer has exactly two drop handlers — re-read this check');
  assert.equal(drops[0], drops[1], 'the rest cell and the populated cell handle a drop differently');
});

test('the reference start snaps to the Monday of whatever week is picked', () => {
  // ⚠ THE GRID DRAWS Mon–Sun COLUMNS while `builderToAssignmentRows` offsets each day from
  // the START's weekday. Measured on a Mon/Wed/Fri program with a Wednesday start, each grid
  // row then spanned TWO calendar weeks and its dates ran BACKWARDS across it — the Monday
  // cell reading five days LATER than the Wednesday cell beside it. (CodeRabbit, #2143.)
  assert.equal(dbuMondayOf('2026-09-23'), '2026-09-21', 'a Wednesday did not snap back to its Monday');
  assert.equal(dbuMondayOf('2026-09-27'), '2026-09-21', 'a Sunday belongs to the week that started six days earlier');
  assert.equal(dbuMondayOf('2026-09-21'), '2026-09-21', 'a Monday must be left exactly where it is');
  for (const bad of ['', null, undefined, 'tomorrow', '2026-13-45']) {
    assert.equal(dbuMondayOf(bad), null, 'an unusable value must yield null so the caller keeps what it had: ' + String(bad));
  }
  // and every snapped start really does put one grid row inside one calendar week
  const doc = dbuWithWeekdays(legacyDoc());
  for (const picked of ['2026-09-21', '2026-09-23', '2026-09-27']) {
    const dates = dbuDateMap(doc, dbuMondayOf(picked));
    const row = doc.weeks[0].days.map((_, di) => dates['0:' + di]);
    assert.ok(row.every(Boolean), 'setup: the row has no dates for ' + picked);
    assert.deepEqual(row, [...row].sort(), 'week 1 runs backwards across the row for ' + picked);
  }
});

test('the date field itself snaps — the rule is not one the page can bypass', async () => {
  // ⚠ A RULE THE PAGE DOES NOT GO THROUGH IS A RULE THAT IS RIGHT AND DEAD. `dbuMondayOf`
  // being correct says nothing about the one control that calls it: measured, a mutation
  // pointing the input back at the raw value left the whole file GREEN. So the field is
  // driven rather than the helper.
  await mount(template(dbuWithWeekdays(legacyDoc())));
  const field = document.querySelector('input[type="date"]');
  assert.ok(field, 'setup: the reference-start field is not on screen');
  // React tracks an input's value itself, so a plain assignment is swallowed as a no-op.
  const setValue = (el, v) => {
    Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v);
  };
  await React.act(async () => {
    setValue(field, '2026-09-23');                               // a Wednesday
    field.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(document.querySelector('input[type="date"]').value, '2026-09-21',
    'the field kept a mid-week start, so the grid rows span two calendar weeks');

  // ⚠ AND CLEARING IT KEEPS WHAT IT HAD, which is what the `|| startISO` is for. Without it
  // an emptied field writes null and the reference silently jumps to NEXT Monday — invisible
  // unless the start already differs from that default, which is why this sets one first.
  await React.act(async () => {
    setValue(document.querySelector('input[type="date"]'), '');
    document.querySelector('input[type="date"]').dispatchEvent(new window.Event('change', { bubbles: true }));
  });
  assert.equal(document.querySelector('input[type="date"]').value, '2026-09-21',
    'clearing the field threw away the reference start the coach had chosen');
});

// ── The weekday invariant, and its SECOND writer ────────────────────────────────────────
// The Grid finds a day BY weekday, so "no two days in a week share one" is what keeps every
// session reachable. `moveTo` was fixed for the drag; the day editor's Training-day select is
// the other writer and wrote through a blind positional replace, so it could still produce
// exactly the state the drag had just been stopped from producing.
const daySelect = () => [...document.querySelectorAll('select')]
  .find((s) => [...s.options].some((o) => o.textContent === 'In sequence from start'));
const setValue = (el, v) => {
  Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value').set.call(el, v);
};
const pick = async (el, v) => {
  await React.act(async () => {
    setValue(el, v);
    el.dispatchEvent(new window.Event('change', { bubbles: true }));
  });
};
const wk = (n, ...wds) => ({ name: 'W' + n, days: wds.map((w, i) => ({ name: 'D' + (i + 1), weekday: w, blocks: [] })) });
const shares = (week) => {
  const seen = new Set();
  for (const d of week.days) {
    if (!Number.isInteger(d.weekday)) continue;
    if (seen.has(d.weekday)) return true;
    seen.add(d.weekday);
  }
  return false;
};

test('assigning a weekday another day holds SWAPS, so no week can ever hold a collision', () => {
  const week = wk(1, 0, 2, 4);                                   // Mon / Wed / Fri
  const out = dbuAssignWeekday(week, 0, 2);                      // Mon takes the occupied Wed
  assert.deepEqual(out.days.map((d) => d.weekday), [2, 0, 4], 'the two days did not exchange weekdays');
  assert.equal(shares(out), false, 'two days ended up on one weekday, so the Grid can render only one');
  assert.equal(week.days.map((d) => d.weekday).join(), '0,2,4', 'the input week was mutated');
});

test('assigning a FREE weekday moves the day and displaces nobody', () => {
  const out = dbuAssignWeekday(wk(1, 0, 2, 4), 0, 1);            // Mon -> the free Tue
  assert.deepEqual(out.days.map((d) => d.weekday), [1, 2, 4], 'a free weekday should be a plain move');
  assert.equal(shares(out), false, 'a plain move created a collision');
});

test('a day with NO weekday is a legitimate source — the displaced day takes its absence', () => {
  // ⚠ NOT REACHABLE FROM THE GRID (a weekday-less day is not drawn, so it cannot be dragged)
  // but it IS reachable from the select, whose day may be "In sequence from start". Refusing
  // would leave the coach's pick doing nothing; swapping keeps the week a permutation.
  const out = dbuAssignWeekday(wk(1, undefined, 2), 0, 2);
  assert.deepEqual(out.days.map((d) => d.weekday), [2, undefined], 'the absence was not exchanged');
  assert.equal(shares(out), false, 'a weekday-less source produced a collision');
});

test('clearing a weekday needs no separate path — nothing can equal undefined', () => {
  const out = dbuAssignWeekday(wk(1, 0, 2, 4), 1, undefined);
  assert.deepEqual(out.days.map((d) => d.weekday), [0, undefined, 4], 'clearing disturbed another day');
  assert.equal(shares(out), false, 'clearing produced a collision');
});

test('a day index that does not exist is refused rather than half-applied', () => {
  const week = wk(1, 0, 2);
  assert.equal(dbuAssignWeekday(week, 9, 3), week, 'a missing day returned a rewritten week');
  assert.equal(dbuAssignWeekday(null, 0, 3), null, 'a missing week was not passed through');
});

test('the Training-day select swaps too — the ordinary control cannot hide a session', async () => {
  // ⚠ THIS IS THE DEFECT THE DRAG FIX DID NOT REACH. `setDay` is a blind positional replace,
  // so picking a weekday another day already held put two days on one weekday — and the Grid
  // renders a day only if some cell resolves to it, so the second became unreachable: it
  // could not be rendered, selected or edited while the document still held it and Sheet
  // still listed it. The select predates the rebuild; the Grid's weekday-keyed lookup does
  // not, which is what turned a harmless duplicate into a hidden session. Found by reading
  // the fix's own blast radius after CodeRabbit's rest-cell finding.
  await mount(template(dbuWithWeekdays(legacyDoc())));           // week 1: Mon + Thu
  assert.equal(populated(0).length, 2, 'setup: week 1 does not have two sessions');
  const names = () => populated(0).map((c) => (c.querySelector('b') || {}).textContent);
  assert.deepEqual(names(), ['Squat day', 'Pull day'], 'setup: the sessions are not where expected');

  await React.act(async () => { populated(0)[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const sel = daySelect();
  assert.ok(sel, 'clicking a session did not open the day editor');
  assert.equal(sel.value, '0', 'setup: the open day is not the Monday one');

  await pick(sel, '3');                                          // Thursday, held by Pull day

  assert.equal(populated(0).length, 2, 'a session vanished from the grid — two days share a weekday');
  assert.deepEqual(names(), ['Pull day', 'Squat day'], 'the select overwrote instead of swapping');
});

test('the select names the day it would swap with, so the outcome is legible first', async () => {
  await mount(template(dbuWithWeekdays(legacyDoc())));
  await React.act(async () => { populated(0)[0].dispatchEvent(new window.MouseEvent('click', { bubbles: true })); });
  const opts = [...daySelect().options].map((o) => o.textContent);
  assert.ok(opts.some((o) => /^Thursday \u00b7 swaps with Pull day$/.test(o)),
    'a weekday another day holds is offered with no hint that picking it exchanges them: ' + JSON.stringify(opts));
  assert.ok(opts.includes('Tuesday'), 'a FREE weekday must stay a plain label, or every option reads as a swap');
  assert.ok(!opts.some((o) => /^Monday \u00b7/.test(o)),
    "the open day's OWN weekday was labelled as a swap with itself");
});

test('both weekday writers go through one implementation, and there is no third', async () => {
  // The tests above prove the BEHAVIOUR of each writer; this proves there are only two to
  // prove, and it is why the rule is a module helper rather than a closure — the drag lives
  // in `DbuGrid` and the select in `DbuBuilder`, so neither could have called the other's.
  const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'));
  const writers = [...src.matchAll(/const (moveTo|setDayWeekday) = [^\n]*/g)].map((m) => m[0]);
  assert.equal(writers.length, 2, 'the grid drag and the day-editor select are no longer the two writers');
  for (const w of writers) {
    assert.ok(/dbuAssignWeekday\(/.test(w), 'a weekday writer stopped going through the shared rule: ' + w);
  }
});

test('every site that sets a day weekday is one of nine, each safe for a stated reason', async () => {
  // ⚠ DERIVED FROM THE AST, NOT GREPPED, because a weekday is written in three spellings and
  // a sweep blind to any one of them reports a clean tree: `weekday: x`, the SHORTHAND
  // `{ ...d, weekday }` (how `addAt` and the move itself are written), and the ASSIGNMENT
  // `next.weekday = …` (how duplicate-day and reuse-a-saved-day are written). A regex over
  // `weekday:\s*` sees only the first and misses half the sites — measured while writing this.
  // ⚠ KEYED BY ENCLOSING FUNCTION AND SOURCE TEXT, never file:line — a line number pins a
  // layout, so an unrelated edit above one of these would fail a test about collisions.
  const src = await import('node:fs').then((fs) => fs.readFileSync(SRC, 'utf8'));
  const ast = require('@babel/parser').parse(src, { sourceType: 'module', plugins: ['jsx'] });
  const sites = [];
  const stack = [];
  (function walk(n) {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) return n.forEach(walk);
    let pushed = false;
    if (n.type === 'FunctionDeclaration' && n.id) { stack.push(n.id.name); pushed = true; }
    if (n.type === 'VariableDeclarator' && n.id && n.id.name && n.init &&
        (n.init.type === 'ArrowFunctionExpression' || n.init.type === 'FunctionExpression')) {
      stack.push(n.id.name); pushed = true;
    }
    const isWeekdayProp = n.type === 'ObjectProperty' && n.key &&
      (n.key.name === 'weekday' || n.key.value === 'weekday');
    const isWeekdayAssign = n.type === 'AssignmentExpression' && n.left &&
      n.left.type === 'MemberExpression' && n.left.property &&
      (n.left.property.name === 'weekday' || n.left.property.value === 'weekday');
    if (isWeekdayProp || isWeekdayAssign) {
      sites.push((stack[stack.length - 1] || '<top>') + ' :: ' + src.slice(n.start, n.end).replace(/\s+/g, ' ').trim());
    }
    for (const k in n) { if (k !== 'loc' && k !== 'leadingComments' && k !== 'trailingComments') walk(n[k]); }
    if (pushed) stack.pop();
  })(ast);

  // Vacuity floor: a walker that stopped matching would report a clean tree, so it must be
  // proven to see BOTH the spellings a regex would miss before its answer is worth anything.
  assert.ok(sites.some((x) => /:: weekday$/.test(x)), 'the walk no longer sees the shorthand form');
  assert.ok(sites.some((x) => /:: next\.weekday =/.test(x)), 'the walk no longer sees the assignment form');

  assert.deepEqual(sites.sort(), [
    // Duplicate a day / reuse a saved day — both take the next FREE weekday in the target week.
    'DbuBuilder :: next.weekday = dbuNextFreeWeekday(doc.weeks[sel.w])',
    'DbuBuilder :: next.weekday = dbuNextFreeWeekday(doc.weeks[target])',
    // ＋ Week: a fresh week whose only day can collide with nothing.
    'DbuBuilder :: weekday: 0',
    // Guided/Editor adds a day using the same next-free-weekday helper.
    'DbuBuilder :: weekday:dbuNextFreeWeekday(w)',
    // addAt is reached from a REST cell, so that weekday is free by construction.
    'addAt :: weekday',
    // The rule itself: the move, and the swap that keeps the week a permutation.
    'dbuAssignWeekday :: weekday',
    'dbuAssignWeekday :: weekday: from.weekday',
    // Load-time fill, and only for days that have no weekday, from the unused set.
    'dbuWithWeekdays :: weekday: wd',
  ], 'a new site sets a day weekday — route it through dbuAssignWeekday, or add it here with why it cannot collide');
});

// ── Already-duplicated data, which the swap cannot repair ───────────────────────────────
// Before the select was routed through `dbuAssignWeekday` it could PERSIST a duplicate, and
// `dbuWithWeekdays` passed such a week straight through because every value in it is
// individually valid. (CodeRabbit, #2143.)

test('a week is sound only when every day has a weekday AND no two share one', () => {
  assert.equal(dbuWeekSound(wk(1, 0, 2, 4)), true, 'a week with three distinct weekdays is sound');
  assert.equal(dbuWeekSound(wk(1, 0, 0, 2)), false, 'a duplicate weekday was accepted as sound');
  assert.equal(dbuWeekSound(wk(1, 0, undefined)), false, 'a day with no weekday was accepted as sound');
  assert.equal(dbuWeekSound({ days: [] }), true, 'an empty week has nothing to collide');
  assert.equal(dbuWeekSound(null), true, 'a missing week must not throw');
});

test('the SWAP cannot repair a week that already holds a duplicate — which is why the loader does', () => {
  // This is the finding's own example, pinned so the repair is not mistaken for belt-and-braces:
  // exchanging two values preserves the multiset, so the duplicate survives and simply moves.
  const out = dbuAssignWeekday(wk(1, 0, 0, 2), 0, 2);
  assert.deepEqual(out.days.map((d) => d.weekday), [2, 0, 0],
    'the swap no longer preserves the multiset, so this case is not the one it was written for');
  assert.equal(dbuWeekSound(out), false, 'setup: the swap was expected to leave the week unsound');
});

test('a stored week holding two days on one weekday is repaired when the builder opens', async () => {
  const broken = { weeks: [{ name: 'W1', days: [
    { name: 'Squat day', weekday: 0, blocks: [] },
    { name: 'Hidden day', weekday: 0, blocks: [] },
    { name: 'Pull day', weekday: 2, blocks: [] },
  ] }] };
  assert.equal(dbuWeekSound(broken.weeks[0]), false, 'setup: the fixture is not actually broken');

  const fixed = dbuWithWeekdays(broken);
  const wds = fixed.weeks[0].days.map((d) => d.weekday);
  assert.equal(new Set(wds).size, 3, 'two days still share a weekday after the repair: ' + JSON.stringify(wds));
  // ⚠ THE FIRST HOLDER KEEPS ITS WEEKDAY. That is the day the Grid is already drawing, so the
  // repair brings the HIDDEN session back rather than moving the visible one out from under
  // the coach — and a day that was never in conflict must not move at all.
  assert.equal(wds[0], 0, 'the visible session was moved instead of the hidden one');
  assert.equal(wds[2], 2, 'a day that was not in conflict was moved');

  await mount(template(fixed));
  assert.equal(populated(0).length, 3, 'a session is still hidden from the grid after the repair');
});

test('a sound document is returned unchanged, so opening a program cannot mark it dirty', () => {
  // The repair runs in the useState initializer and joins the saved baseline; returning a new
  // object for a document that needed nothing would be churn, and the identity is what the
  // caller leans on.
  const sound = { weeks: [wk(1, 0, 2, 4), wk(2, 1, 3)] };
  assert.equal(dbuWithWeekdays(sound), sound, 'a sound document was rebuilt rather than passed through');
});

// ⚠ A TARGET RPE SITS BESIDE AN IMPORTED LOAD; IT DOES NOT REPLACE IT. The row editor
// cleared `loadText` whenever RPE changed, to make room in a label that returned the
// text alone, so "RPE 8" on an imported "bodyweight" row threw the coach's own
// instruction away. Only a new weight or unit replaces the text now — in both editors.
test('setting a target RPE keeps an imported load; a new unit still replaces it',async()=>{
  const seen=[];
  const row={...DashBuilder.newRow({name:'Push-up'}),load:0,loadText:'bodyweight'};
  const root=createRoot(document.getElementById('root'));OPEN.push(root);
  await React.act(async()=>root.render(React.createElement(DbuRow,{row,label:'01',onChange:n=>seen.push(n),onRemove(){},onMove(){},onDuplicate(){},onUploading(){}})));
  const pick=async(aria,value)=>{
    const el=document.querySelector('select[aria-label="'+aria+'"]');
    assert.ok(el,aria+' is not rendered — this test is driving nothing');
    await React.act(async()=>{Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype,'value').set.call(el,value);el.dispatchEvent(new window.Event('change',{bubbles:true}));});
    return seen.at(-1);
  };
  const withRpe=await pick('Push-up target RPE','8');
  assert.equal(withRpe.rpe,8);
  assert.equal(withRpe.loadText,'bodyweight','the imported instruction survives an RPE change');
  assert.equal(DashBuilder.loadLabel(withRpe),'bodyweight · RPE 8','and the prescription states both');
  // ⚠ THE CONTROL: a new unit still replaces the imported text, or the assertion above
  // passes on an editor that never clears it at all.
  const withUnit=await pick('Push-up load unit','lb');
  assert.equal('loadText' in withUnit,false,'a new unit replaces the imported text');
});
