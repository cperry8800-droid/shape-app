// Ask Nora about the words you selected (the Ask Nora plan, step 4): the real
// globalChatButton.js in a jsdom page. Selecting text shows the pill; the pill opens Nora
// with the words quoted as a draft; a field, the chat panel or a stray character never do.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { JSDOM } from 'jsdom';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = readFileSync(join(ROOT, 'public/newdesign/globalChatButton.js'), 'utf8');

// `fine` is the device's PRIMARY pointer; `pointerEvents: false` is a browser without them.
function page({ fine = true, pointerEvents = true } = {}) {
  const dom = new JSDOM('<!doctype html><body><p id="p">Protein targets are set by your nutritionist each week.</p><textarea id="t">typed words here</textarea></body>', { runScripts: 'outside-only', url: 'https://x/newdesign/Pricing.html' });
  const w = dom.window;
  w.matchMedia = (q) => ({ matches: fine && /pointer: fine/.test(q), addEventListener() {}, removeEventListener() {} });
  w.fetch = async () => ({ ok: false, json: async () => ({}) });
  w.Range.prototype.getBoundingClientRect = () => ({ top: 200, bottom: 220, left: 100, width: 120, height: 20 });
  if (!pointerEvents) delete w.PointerEvent;
  w.eval(SRC);
  const opened = [];
  w.__openChatTo = (req) => opened.push(req);
  // A selection ends the way a browser ends one: a pointerup naming the pointer that made it,
  // then the compatibility mouseup a touch also fires.
  const select = (node, start, end, by = 'mouse') => {
    const r = w.document.createRange();
    r.setStart(node, start); r.setEnd(node, end);
    const s = w.getSelection(); s.removeAllRanges(); s.addRange(r);
    if (pointerEvents) w.document.dispatchEvent(new w.PointerEvent('pointerup', { bubbles: true, pointerType: by }));
    w.document.dispatchEvent(new w.MouseEvent('mouseup', { bubbles: true }));
  };
  const tick = () => new Promise((r) => setTimeout(r, 5));
  const pill = () => w.document.querySelector('[data-nora-ask-pill]');
  return { w, opened, select, tick, pill };
}

test('selecting words shows the pill; it opens Nora with them quoted in her composer', async () => {
  const p = page();
  const text = p.w.document.getElementById('p').firstChild;
  p.select(text, 0, 15); // "Protein targets"
  await p.tick();
  assert.ok(p.pill(), 'the pill was drawn');
  assert.equal(p.pill().style.display, 'block');
  assert.equal(p.pill().textContent, '✦ Ask Nora about this');
  p.pill().click();
  // The page's objects are another realm's, so compare their JSON.
  assert.equal(JSON.stringify(p.opened), JSON.stringify([{ who: 'Nora', tab: 'support', draft: 'About \u201cProtein targets\u201d: ' }]));
  assert.equal(p.pill().style.display, 'none');
});

test('never for a stray character, inside a field, or on a touch screen', async () => {
  const p = page();
  const text = p.w.document.getElementById('p').firstChild;
  p.select(text, 0, 2);
  await p.tick();
  assert.ok(!p.pill() || p.pill().style.display !== 'block', 'two characters are not a question');
  const field = p.w.document.getElementById('t').firstChild;
  p.select(field, 0, 10);
  await p.tick();
  assert.ok(!p.pill() || p.pill().style.display !== 'block', 'a field keeps its own selection');
  const touch = page({ fine: false });
  touch.select(touch.w.document.getElementById('p').firstChild, 0, 15, 'touch');
  await touch.tick();
  assert.equal(touch.pill(), null, 'a touch keeps its own selection menu');
});

test('the pointer that made the selection decides, not the device\'s primary one', async () => {
  // A touchscreen laptop whose primary pointer is touch, selecting with its trackpad.
  const coarse = page({ fine: false });
  coarse.select(coarse.w.document.getElementById('p').firstChild, 0, 15, 'mouse');
  await coarse.tick();
  assert.equal(coarse.pill()?.style.display, 'block', 'a mouse selection on a touch-primary device');
  // A mouse-primary laptop selecting by touch: its compatibility mouseup must not show the pill,
  // and the touch hides one already shown.
  const p = page({ fine: true });
  const text = p.w.document.getElementById('p').firstChild;
  p.select(text, 0, 15, 'mouse');
  await p.tick();
  assert.equal(p.pill().style.display, 'block');
  p.select(text, 16, 23, 'touch');
  await p.tick();
  assert.equal(p.pill().style.display, 'none', 'a touch selection keeps the native menu');
  p.select(text, 16, 23, 'pen');
  await p.tick();
  assert.equal(p.pill().style.display, 'none', 'nor a pen');
});

test('without pointer events the primary pointer decides, as before', async () => {
  const fine = page({ pointerEvents: false });
  fine.select(fine.w.document.getElementById('p').firstChild, 0, 15);
  await fine.tick();
  assert.equal(fine.pill()?.style.display, 'block');
  const coarse = page({ fine: false, pointerEvents: false });
  coarse.select(coarse.w.document.getElementById('p').firstChild, 0, 15);
  await coarse.tick();
  assert.equal(coarse.pill(), null);
});

test('a long selection is shortened to fit the composer', async () => {
  const p = page();
  const long = 'word '.repeat(100);
  p.w.document.getElementById('p').textContent = long;
  p.select(p.w.document.getElementById('p').firstChild, 0, long.length - 1);
  await p.tick();
  p.pill().click();
  const draft = p.opened[0].draft;
  assert.ok(draft.length <= 320, `fits the 500-character composer with room: ${draft.length}`);
  assert.match(draft, /…”: $/);
});
