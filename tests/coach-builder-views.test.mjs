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
const require=createRequire(import.meta.url);
const {JSDOM}=require('jsdom');
const dom=new JSDOM('<div id="root"></div>',{url:'https://shape.test/'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.localStorage=window.localStorage;
Object.defineProperty(globalThis,'navigator',{value:window.navigator,configurable:true});
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const React=require('react');globalThis.React=React;
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

const SRC=fileURLToPath(new URL('../public/newdesign/dashBuilder.jsx',import.meta.url));
const mod=await loadRealModule(SRC,{appendExports:'export { DbuBuilder, dbuWithWeekdays, dbuDefaultWeekdays, dbuDateMap, dbuNextFreeWeekday, dbuSummary };'});
const {DbuBuilder,dbuWithWeekdays,dbuDefaultWeekdays,dbuDateMap,dbuNextFreeWeekday,dbuSummary}=mod;

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
  assert.match(src, /\.dbu2 \.drawer\.float\{position:absolute/, 'the day editor floats over the canvas');
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
