// The dialog in front closes on a Back: the phone's back and the swipe close an open sheet or dialog
// before the page's ← and the shell's history, and do nothing at all on one that must be answered (the
// War Room's "App Back" section, left by #2689: with Chat's places open on a root tab, the phone's back
// left the app). services/dialogBack.mjs holds the rule; the chrome (iosAppBroadsheet.jsx) finds the
// dialog in front; bsNavShell keeps the guard entry while one is open. The member, trainer and
// nutritionist apps share the chrome and the shell.
//
// Also here, the other two items #2689 left: Home's dead meal preview is gone (tests/nav-places.test.mjs),
// and a prep reminder for a recipe no longer in the kitchen tells the member so.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { bsDialogRef, bsIsDialog, bsDialogStays, bsDialogCloseOf, bsPickTopDialog, BS_DIALOG_EVENT, BS_DIALOG_STAY } from '../mobile-app/src/services/dialogBack.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(ROOT, 'mobile-app/src');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a); assert.ok(i >= 0, `missing: ${a}`); const j = src.indexOf(b, i + a.length); assert.ok(j > i, `no end for: ${a}`); return src.slice(i, j); };
const { parse } = createRequire(import.meta.url)('@babel/parser');

// A stand-in element: what the module reads of one.
const el = (attrs = {}) => ({ attrs, isConnected: true, getAttribute(k) { return k in this.attrs ? this.attrs[k] : null; } });

// ── The rule (pure) ───────────────────────────────────────────────────────────────────────────────

test('a dialog\'s ref keeps its newest close, and a Back runs it', () => {
  const d = el({ role: 'dialog' });
  let shut = 0;
  bsDialogRef(() => { shut += 1; })(d);
  assert.equal(bsIsDialog(d), true);
  assert.equal(bsDialogStays(d), false);
  bsDialogCloseOf(d)();
  assert.equal(shut, 1);
  // A re-render hands the old ref null and the new one the element: the newest close wins.
  let second = 0;
  bsDialogRef(() => { second += 1; })(d);
  bsDialogCloseOf(d)();
  assert.equal(shut, 1, 'the old close ran again');
  assert.equal(second, 1);
});

test('the element\'s own ref is kept beside the close, an object or a function', () => {
  const d = el({ role: 'dialog' });
  const obj = { current: null };
  let fnGot;
  const r = bsDialogRef(() => {}, obj, (x) => { fnGot = x; });
  r(d);
  assert.equal(obj.current, d);
  assert.equal(fnGot, d);
  r(null);
  assert.equal(obj.current, null);
  assert.equal(fnGot, null);
});

test('a dialog that must be answered, or cannot close right now, holds a Back', () => {
  const stay = el({ role: 'alertdialog', 'data-bs-dialog': BS_DIALOG_STAY });
  assert.equal(bsDialogStays(stay), true);
  const busy = el({ role: 'dialog' });
  bsDialogRef(null)(busy);
  assert.equal(bsDialogStays(busy), true, 'a close of null is a dialog that cannot close now');
  const unnamed = el({ role: 'dialog' });
  assert.equal(bsDialogStays(unnamed), true, 'a dialog with no close is held, not skipped');
  // Held means a Back does nothing: never the page behind it, never out of the app.
  for (const d of [stay, busy, unnamed]) assert.doesNotThrow(() => bsDialogCloseOf(d)());
  // Even with a close registered, "stay" wins.
  let ran = 0;
  bsDialogRef(() => { ran += 1; })(stay);
  bsDialogCloseOf(stay)();
  assert.equal(ran, 0);
  assert.equal(bsIsDialog(el({ role: 'region' })), false);
  assert.equal(bsIsDialog(null), false);
});

test('the shell hears a dialog appear and go, but not a re-render', async () => {
  const prevWindow = globalThis.window;
  const target = new EventTarget();
  globalThis.window = target;
  let heard = 0;
  target.addEventListener(BS_DIALOG_EVENT, () => { heard += 1; });
  try {
    const d = el({ role: 'dialog' });
    bsDialogRef(() => {})(d);
    assert.equal(heard, 1, 'a new dialog');
    // A re-render: old ref null, new ref the same element.
    const first = bsDialogRef(() => {});
    first(d);
    first(null);
    bsDialogRef(() => {})(d);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(heard, 1, 'a re-render is not news');
    // It leaves the page.
    const gone = bsDialogRef(() => {});
    gone(d);
    d.isConnected = false;
    gone(null);
    await new Promise((r) => setTimeout(r, 5));
    assert.equal(heard, 2, 'a dialog that went');
    // A dialog that must be answered registers with no close, and the shell still hears it open (Codex P2 on
    // #2696: the required update and the clock question appear without a tap).
    const gate = el({ role: 'alertdialog', 'data-bs-dialog': BS_DIALOG_STAY });
    bsDialogRef(null)(gate);
    assert.equal(heard, 3, 'a stay dialog that opened');
    assert.equal(bsDialogStays(gate), true);
  } finally {
    globalThis.window = prevWindow;
  }
});

test('the dialog in front is the last of those on top', () => {
  const a = el(), b = el(), c = el();
  assert.equal(bsPickTopDialog([]), null);
  assert.equal(bsPickTopDialog([{ el: a, onTop: false }]), null, 'covered: not in front');
  assert.equal(bsPickTopDialog([{ el: a, onTop: true }, { el: b, onTop: false }]), a);
  assert.equal(bsPickTopDialog([{ el: a, onTop: true }, { el: b, onTop: true }, { el: c, onTop: false }]), b, 'a dialog inside a dialog, or opened after it');
});

// ── Every dialog in the app says what a Back does to it ───────────────────────────────────────────

const walkFiles = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walkFiles(join(dir, e.name)) : /\.jsx?$/.test(e.name) ? [join(dir, e.name)] : []));
const FILES = walkFiles(SRC).map((f) => ({ rel: relative(ROOT, f), src: readFileSync(f, 'utf8') }));
const visit = (node, fn, parent = null) => {
  if (!node || typeof node.type !== 'string') return;
  fn(node, parent);
  for (const k of Object.keys(node)) {
    if (k === 'loc' || k === 'start' || k === 'end') continue;
    const v = node[k];
    if (Array.isArray(v)) v.forEach((c) => c && typeof c.type === 'string' && visit(c, fn, node));
    else if (v && typeof v.type === 'string') visit(v, fn, node);
  }
};
const attrOf = (open, name) => open.attributes.find((a) => a.type === 'JSXAttribute' && a.name && a.name.name === name);
const strAttr = (open, name) => { const a = attrOf(open, name); return a && a.value && a.value.type === 'StringLiteral' ? a.value.value : null; };
const isDialogEl = (n) => n.type === 'JSXElement' && ['dialog', 'alertdialog'].includes(strAttr(n.openingElement, 'role'));
const AST = new Map();
const astOf = (f) => {
  if (!AST.has(f.rel)) AST.set(f.rel, parse(f.src, { sourceType: 'module', plugins: ['jsx'], errorRecovery: true }));
  return AST.get(f.rel);
};
const DIALOGS = [];
for (const f of FILES) {
  if (!/role=["'{]*(alert)?dialog/.test(f.src)) continue;
  visit(astOf(f), (n) => {
    if (!isDialogEl(n)) return;
    const open = n.openingElement;
    const ref = attrOf(open, 'ref');
    const viaRef = !!(ref && ref.value && ref.value.type === 'JSXExpressionContainer' && ref.value.expression.type === 'CallExpression' && ref.value.expression.callee.name === 'bsDialogRef');
    DIALOGS.push({ at: `${f.rel}:${open.loc.start.line}`, file: f.rel, viaRef, stay: strAttr(open, 'data-bs-dialog') === BS_DIALOG_STAY, closeArgs: viaRef ? ref.value.expression.arguments.length : 0, firstArg: viaRef && ref.value.expression.arguments[0] ? ref.value.expression.arguments[0].type : null });
  });
}

test('every role="dialog" and role="alertdialog" takes bsDialogRef(close), or bsDialogRef(null) with data-bs-dialog="stay"', () => {
  assert.ok(DIALOGS.length >= 70, `only ${DIALOGS.length} dialogs found: the scan broke`);
  const bare = DIALOGS.filter((d) => !d.viaRef).map((d) => d.at);
  assert.deepEqual(bare, [], 'a dialog a Back cannot close, or one the shell is never told of: the phone\'s back would step the page behind it, or leave the app');
  // A stay dialog registers too, with no close: its ref is what tells the shell it opened, so a gate that appears
  // without a tap (a required update, the clock question) still arms the guard (Codex P2 on #2696).
  const stayNoNull = DIALOGS.filter((d) => d.stay && d.firstArg !== 'NullLiteral').map((d) => d.at);
  assert.deepEqual(stayNoNull, [], 'a dialog that must be answered names a close');
  for (const d of DIALOGS.filter((x) => x.viaRef)) assert.ok(d.closeArgs >= 1, `${d.at}: bsDialogRef() names no close`);
  // The 23 files the War Room named are all in.
  const files = new Set(DIALOGS.map((d) => d.file.replace('mobile-app/src/broadsheet/', '')));
  for (const f of ['BSChatPlaces', 'BSCheckinCard', 'BSCoachClimb', 'BSEatPlan', 'BSLiveBoost', 'BSProfileMagazine', 'BSTrainPlan', 'BSWaterLine', 'iosAppBroadsheetClient', 'iosAppBroadsheetPros',
    'BSMarketDirectory', 'BSNoraTalk', 'BSPaidLock', 'BSPlanDay', 'BSProfileCustomizer', 'BSSessionFinish', 'BSTimezone', 'BSTrainerProfile', 'iosAppBroadsheet', 'iosAppBroadsheetHabits',
    'iosAppBroadsheetMain', 'iosAppBroadsheetMarketplace', 'iosAppBroadsheetRadio']) assert.ok(files.has(`${f}.jsx`), `${f}.jsx has no dialog any more`);
});

test('the dialogs a Back may not close are the three that must be answered', () => {
  // A required update; the clock question, which has only its two answers; a live call, ended by its own
  // button. Any other is a choice to make on purpose: add it here with its reason.
  assert.deepEqual(DIALOGS.filter((d) => d.stay).map((d) => d.file).sort(), [
    'mobile-app/src/broadsheet/BSTimezone.jsx',
    'mobile-app/src/broadsheet/BSUpdateGate.jsx',
    'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx',
  ]);
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  assert.match(between(client, 'function BSVideoCall(', '\n}\n'), /<div ref=\{bsDialogRef\(null\)\} role="dialog" aria-modal="true" aria-label=\{title\} data-bs-dialog="stay"/);
  assert.match(read('mobile-app/src/broadsheet/BSUpdateGate.jsx'), /ref=\{bsDialogRef\(null, gateRef\)\} role="alertdialog"[^>]*data-bs-update="required" data-bs-dialog="stay"/);
});

test('a sheet\'s scrim always holds a dialog, so a Back finds the sheet a tap outside would close', () => {
  // A scrim: an element a tap closes (onClick), drawn over the whole phone (inset: 0) in a tint (rgba).
  // Its sheet is the dialog inside it, or beside it (a scrim drawn as its sheet's sibling).
  const hasDialog = (n) => { let found = false; visit(n, (m) => { if (isDialogEl(m)) found = true; }); return found; };
  const scrimStyle = (open) => {
    const s = attrOf(open, 'style');
    const o = s && s.value && s.value.type === 'JSXExpressionContainer' ? s.value.expression : null;
    if (!o || o.type !== 'ObjectExpression') return false;
    const prop = (k) => o.properties.find((p) => p.type === 'ObjectProperty' && (p.key.name === k || p.key.value === k));
    const inset = prop('inset');
    const bg = prop('background');
    return !!(inset && inset.value.type === 'NumericLiteral' && inset.value.value === 0
      && bg && bg.value.type === 'StringLiteral' && /^rgba\(/.test(bg.value.value));
  };
  const missing = [];
  let scrims = 0;
  for (const f of FILES) {
    if (!/inset: 0/.test(f.src)) continue;
    visit(astOf(f), (n, parent) => {
      if (n.type !== 'JSXElement' || !attrOf(n.openingElement, 'onClick') || !scrimStyle(n.openingElement)) return;
      scrims += 1;
      if (hasDialog(n) || (parent && parent.type === 'JSXElement' && hasDialog(parent))) return;
      missing.push(`${f.rel}:${n.openingElement.loc.start.line}`);
    });
  }
  assert.ok(scrims >= 50, `only ${scrims} scrims found: the scan broke`);
  assert.deepEqual(missing, [], 'a sheet with no dialog: the phone\'s back steps the page under it, or leaves the app');
});

// ── The chrome finds the dialog in front, for the phone's back and the swipe ──────────────────────

const CHROME = read('mobile-app/src/broadsheet/iosAppBroadsheet.jsx');
const SHELL = read('mobile-app/src/broadsheet/bsNavShell.js');

test('the phone\'s back closes the dialog in front before the page\'s Back', () => {
  const top = between(CHROME, 'function bsTopPageBack() {', '\n}\n');
  const dlg = top.indexOf('const top = bsTopDialog(surf);');
  assert.ok(dlg > 0, 'bsTopPageBack does not look for a dialog');
  assert.ok(dlg < top.indexOf('document.elementFromPoint(r.left + r.width / 2'), 'the page in the middle answers before the dialog');
  assert.match(top, /if \(top\) return bsPageBackFor\(top\.hit, surf\)\.back \|\| bsDialogBack\(top\.el\);/);
  // In front: what is drawn at the dialog's own centre is its own (a bottom sheet need not cover the
  // middle of the phone); of those, the one opened last.
  const pick = between(CHROME, 'function bsTopDialog(surf) {', '\n}\n');
  assert.match(pick, /document\.querySelectorAll\('\[role="dialog"\], \[role="alertdialog"\]'\)/);
  assert.match(pick, /const hit = document\.elementFromPoint\(x, y\);\n\s+list\.push\(\{ el, onTop: !!hit && el\.contains\(hit\), hit \}\);/);
  assert.match(pick, /const top = bsPickTopDialog\(list\);/);
});

test('the walk from a touch stops at a dialog, or at the sheet under a scrim, with its Back', () => {
  const walk = between(CHROME, 'function bsPageBackFor(target, surf) {', '\n}\n');
  const page = walk.indexOf("if (back) return { page: layer || bsPageOuter(el), back };");
  const dialog = walk.indexOf('if (bsIsDialog(el)) return { page: layer || el, back: bsDialogBack(el), dialog: true };');
  const layer = walk.indexOf('const isLayer = !layer && bsIsLayer(el, getComputedStyle(el), surfH);');
  const marked = walk.indexOf('const b = bsMarkedBackIn(el);');
  assert.ok(page > 0 && dialog > page && layer > dialog && marked > layer, 'a page inside a dialog answers first, then the dialog, before anything behind it');
  assert.match(walk, /if \(isLayer\) \{\n\s+layer = el;\n[^\n]*\n\s+const d = bsDialogIn\(el\);\n\s+if \(d\) return \{ page: el, back: bsDialogBack\(d\), dialog: true \};/);
  // A dialog's own step first (Back to editing), else its close; nothing on one that must be answered.
  assert.match(between(CHROME, 'function bsDialogBack(d) {', '\n}\n'), /if \(bsDialogStays\(d\)\) return bsDialogCloseOf\(d\);\n\s+const b = bsMarkedBackIn\(d\);\n\s+return b \? \(\) => b\.click\(\) : bsDialogCloseOf\(d\);/);
});

test('a swipe on a dialog is its Back, never the next tab, and is held on one that must be answered', () => {
  const blocked = between(CHROME, 'function bsSwipeBlocked(target, surf) {', '\n}\n');
  assert.match(blocked, /if \(bsIsDialog\(el\)\) return bsDialogStays\(el\);\n\s+if \(bsIsLayer\(el, s, surfH\)\) \{\n\s+const d = bsDialogIn\(el\);\n\s+return d \? bsDialogStays\(d\) : !bsMarkedBackIn\(el\);/);
  assert.ok(blocked.indexOf('if (bsIsDialog(el))') > blocked.indexOf("if (el.hasAttribute('data-bs-noswipe')) return true;"), 'an opt-out (the cook screen) still holds');
  const end = between(CHROME, 'const onEnd = (e) => {', '\n    };\n');
  assert.match(end, /const \{ back, dialog \} = bsPageBackFor\(st\.target, surf\);/);
  assert.ok(end.indexOf('if (dialog) return;') > end.indexOf("=== 'page') {") && end.indexOf('if (dialog) return;') < end.lastIndexOf('dispatch(intent);'), 'a left swipe on a sheet steps the tab under it');
});

test('the guard entry stands while a dialog is open, and the shell looks again when one opens or goes', () => {
  assert.match(SHELL, /^import \{ BS_DIALOG_EVENT \} from '\.\.\/services\/dialogBack\.mjs';$/m);
  assert.match(SHELL, /const onDialog = \(\) => scheduleSync\(\);\n\s+window\.addEventListener\('popstate', onPop\);\n\s+window\.addEventListener\(BS_DIALOG_EVENT, onDialog\);/);
  assert.match(SHELL, /window\.removeEventListener\(BS_DIALOG_EVENT, onDialog\);/);
  // The guard's "a Back has somewhere to go" reads bsTopPageBack, which a dialog now answers.
  assert.match(SHELL, /bsGuardWanted\(bsNavSize\(\), !!bsPageBackNow\(\)\)/);
  assert.match(SHELL, /window\.bsTopPageBack\(\)/);
  assert.match(CHROME, /\/\/ The phone's back does what the page in front's ← does \(bsNavShell's popstate\)\.\n\s+bsTopPageBack,/);
  // The coach apps run the same shell.
  for (const f of ['iosAppBroadsheetClient.jsx', 'iosAppBroadsheetPros.jsx']) assert.match(read(`mobile-app/src/broadsheet/${f}`), /useBSNavHistory\(/, f);
});

test('the cook screen\'s Back is its top bar\'s left key, and a cook sheet closes first', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const shell = between(client, 'function bsCkShell({', '\n}\n');
  assert.match(shell, /root\.querySelector\('\.top \[data-bsck-left\]'\)/);
  assert.match(shell, /<div ref=\{bsDialogRef\(leftKey, rootRef\)\} className=\{`bsck \$\{layout\.cls\}`\} data-bs-noswipe="" data-bs-layer="cook" role="dialog"/);
  assert.match(between(client, 'function bsCkTop({', '\n}\n'), /<button type="button" className="ibtn" data-bsck-left="" onClick=\{left\.onClick\}/);
  assert.match(between(client, 'function bsCkSheet({', '\n}\n'), /<div ref=\{bsDialogRef\(onClose\)\} className="sheet" data-bsck-sheet="" role="dialog"/);
});

// ── A prep reminder for a recipe no longer in the kitchen ─────────────────────────────────────────

const LOCALES = ['de', 'en', 'es', 'fr', 'ha', 'id', 'it', 'pcm', 'pt-BR', 'ru', 'tr', 'uk', 'vi'];

test('a reminder for a recipe no longer in the kitchen says so, on tonight\'s Eat', () => {
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  const cook = between(client, 'function BSPrepTonightCook({', '\n}\n');
  assert.match(cook, /function BSPrepTonightCook\(\{ slug, group = null, onClose, onGone = null \}\) \{/);
  assert.match(cook, /if \(!cookable\) \{ \(onGone \|\| onClose\)\(\); return undefined; \}/);
  const eat = between(client, 'function BSClientEat({', '\n}\n');
  assert.match(eat, /<BSPrepTonightCook slug=\{prepCook\.slug\} group=\{prepCook\.group\} onClose=\{\(\) => \{ const v = cookViaNav; setPrepCook\(null\); setCookViaNav\(false\); leaveViaNav\(v\); \}\} onGone=\{prepGone\} \/>/);
  const gone = between(eat, 'const prepGone = () => {', '\n  };\n');
  // It stays on Eat (no step back), on tonight's page, and tells the member why.
  assert.doesNotMatch(gone, /leaveViaNav|ShapeNav/, 'it steps back as before');
  for (const s of ['setPrepCook(null);', 'setCookViaNav(false);', 'setPreviewMealId(null);', "setView('eat');", 'setDay(bsWeekdayIdx());']) assert.ok(gone.includes(s), s);
  assert.match(gone, /ask\(\{\n\s+notice: true,\n\s+danger: false,/);
  const keys = [...gone.matchAll(/tr\('cook:(prep\.gone\w+)'/g)].map((m) => m[1]);
  assert.deepEqual(keys, ['prep.goneEyebrow', 'prep.goneTitle', 'prep.goneMessage', 'prep.goneOk']);
  for (const loc of LOCALES) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${loc}/cook.json`));
    for (const k of keys) assert.ok(typeof cat[k] === 'string' && cat[k].trim(), `${loc}: ${k}`);
    if (loc !== 'en') assert.notEqual(cat['prep.goneTitle'], JSON.parse(read('mobile-app/src/i18n/catalogs/en/cook.json'))['prep.goneTitle'], `${loc} is English`);
  }
});

test('a sheet that is saving holds a Back until it is done, as its scrim does', () => {
  // The workout's finish sheet: Edit workout is its way back, never while it saves or a submission is
  // pending (then Edit ends the workout).
  assert.match(read('mobile-app/src/broadsheet/BSSessionFinish.jsx'), /ref=\{bsDialogRef\(F\.saveState === 'saving' \|\| F\.pending \? null : F\.onEdit\)\} role="dialog"/);
  assert.match(read('mobile-app/src/broadsheet/BSWaterLine.jsx'), /ref=\{bsDialogRef\(saving \? null : closePick, sheetRef\)\} role="dialog"/);
  const pros = read('mobile-app/src/broadsheet/iosAppBroadsheetPros.jsx');
  for (const held of ['bsDialogRef(busyId ? null : onClose)', 'bsDialogRef(clipUploading ? null : closeClipSheet)', 'bsDialogRef(busy ? null : onClose)', 'bsDialogRef(busy || uploading ? null : onClose)']) assert.ok(pros.includes(held), held);
  // A sheet whose scrim is guarded (`!busy && onClose()`) is held while busy, not handed a close that does
  // nothing: a committed swipe would slide it away and snap it back (Codex P2 on #2696).
  const client = read('mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx');
  for (const held of ['bsDialogRef(busy ? null : onClose)', 'bsDialogRef(starting ? null : () => setStartSheet(false))', 'bsDialogRef(drafting ? null : () => setDraft(null))']) assert.ok(client.includes(held), held);
  for (const f of FILES) assert.doesNotMatch(f.src, /bsDialogRef\(\(\) => !\w+ &&/, `${f.rel}: a guarded close is a closable sheet`);
  // A sheet told it is busy holds a Back too: the Store's redemption, whose caller makes Cancel a no-op while
  // it redeems (Codex P2 on #2696). Any dialog component taking a busy prop must hold its close on it.
  assert.match(between(client, 'function BSRedeemConfirmSheet({', '\n}\n'), /<div ref=\{bsDialogRef\(busy \? null : onCancel\)\} role="dialog"/);
  for (const f of FILES) {
    for (const m of f.src.matchAll(/\nfunction (\w+)\(\{[^}]*\bbusy\b[^}]*\}\) \{[\s\S]*?\n\}\n/g)) {
      for (const r of m[0].matchAll(/bsDialogRef\(([^)]*)\)/g)) assert.match(r[1], /^busy\b|\bbusy \? null/, `${f.rel} ${m[1]}: bsDialogRef(${r[1]}) ignores busy`);
    }
  }
  // The push ask's Back is its Not now, which snoozes it.
  assert.match(read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx'), /<div ref=\{bsDialogRef\(later\)\} role="dialog" aria-modal="true"/);
});
