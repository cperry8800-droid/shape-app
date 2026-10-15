// The consultation page reads a coach's times again from nothing (Codex on #2370): after the
// coach's intro length changed under the member, after a failed read, and on a retry. The page's
// own script runs in jsdom against a stubbed /api/availability and /api/consultation.

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');
const { JSDOM } = createRequire(import.meta.url)('jsdom');

const HTML = read('public/newdesign/consultation.html');
// The page's own inline script: the one after bookingSlots.js.
const SCRIPT = (() => {
  const i = HTML.indexOf('<script>', HTML.indexOf('<script src="bookingSlots.js"></script>'));
  return HTML.slice(i + '<script>'.length, HTML.indexOf('</script>', i));
})();

const flush = async (n = 6) => { for (let k = 0; k < n; k++) await new Promise((r) => setTimeout(r, 0)); };
const deferred = () => { let resolve; const promise = new Promise((r) => { resolve = r; }); return { promise, resolve }; };
const reply = (status, body) => ({ ok: status >= 200 && status < 300, status, json: async () => body });
// Every weekday 9 to 12 in New York, at the coach's intro length.
const avail = (consultMin) => reply(200, {
  timezone: 'America/New_York',
  slots: [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, start_minute: 540, duration_min: 180 })),
  booked: [], busy: [], rules: { consultMin },
});

function page() {
  const body = HTML.slice(HTML.indexOf('<body'), HTML.lastIndexOf('</body>') + 7).replace(/<script[\s\S]*?<\/script>/g, '');
  const dom = new JSDOM(`<!doctype html><html><head></head>${body}</html>`, {
    url: 'https://shape.test/newdesign/consultation.html?type=trainer&id=7&name=Tom%20Trainer',
    // Real classic scripts, as the browser runs them: the page's `let`s live in the global lexical
    // scope, and the inline onclick handlers run.
    runScripts: 'dangerously',
  });
  const w = dom.window;
  const reads = [];   // each /api/availability call, answered by the test
  const posts = [];
  w.fetch = (url, init) => {
    if (String(url).startsWith('/api/availability')) { const d = deferred(); reads.push(d); return d.promise; }
    if (url === '/api/consultation') { posts.push(JSON.parse(init.body)); return Promise.resolve(w.__consult); }
    throw new Error('unexpected fetch ' + url);
  };
  w.shapeDb = { getSession: async () => ({ user: { id: 'm-1', email: 'lee@shape.test' } }) };
  w.scrollTo = () => {};
  for (const code of [read('public/newdesign/bookingSlots.js'), SCRIPT, 'window.__slotsByDate = () => slotsByDate;']) {
    const el = w.document.createElement('script');
    el.textContent = code;
    w.document.body.appendChild(el);
  }
  const slots = () => w.document.getElementById('timeSlots');
  const times = () => [...slots().querySelectorAll('button.ts')];
  const pickFirst = async () => {
    const first = [...w.__slotsByDate().keys()].sort()[0];
    w.selectDate(first);
    times()[0].click();
    await flush();
  };
  return { w, reads, posts, slots, times, pickFirst };
}

test('a changed intro length clears the old times at once, and lays them out again at the new one', async () => {
  const p = page();
  assert.equal(p.reads.length, 1);
  p.reads[0].resolve(avail(15));
  await flush();
  await p.pickFirst();
  assert.ok(p.w.document.getElementById('consultConfirm').classList.contains('active'));
  p.w.document.getElementById('consultName').value = 'Lee Park';
  p.w.document.getElementById('consultEmail').value = 'lee@shape.test';
  p.w.__consult = reply(409, { error: "This coach's intro now runs 30 minutes. Please pick a time again.", code: 'length_changed', durationMin: 30 });
  await p.w.confirmBooking();
  await flush();
  assert.equal(p.posts[0].durationMin, 15);
  // Read again, and while it answers nothing is offered: the old times were laid out for 15.
  assert.equal(p.reads.length, 2);
  assert.equal(p.times().length, 0, 'a time laid out for the old length is still offered');
  assert.match(p.slots().textContent, /Loading times/);
  assert.equal(p.w.document.getElementById('consultConfirm').classList.contains('active'), false);
  p.reads[1].resolve(avail(30));
  await flush();
  assert.equal(p.w.document.getElementById('introLength').textContent, '30-minute');
  await p.pickFirst();
  p.w.__consult = reply(200, { ok: true });
  await p.w.confirmBooking();
  await flush();
  assert.equal(p.posts[1].durationMin, 30);
});

test('a failed read says so with a retry, and a read that then works is believed', async () => {
  const p = page();
  p.reads[0].resolve(reply(503, {}));
  await flush();
  assert.equal(p.times().length, 0);
  assert.match(p.slots().textContent, /couldn.t read this coach.s open times/);
  const retry = p.slots().querySelector('button.retry');
  assert.ok(retry, 'no way to try again');
  retry.click();
  await flush();
  assert.equal(p.reads.length, 2);
  assert.match(p.slots().textContent, /Loading times/);
  p.reads[1].resolve(avail(45));
  await flush();
  await p.pickFirst();
  assert.doesNotMatch(p.slots().textContent, /couldn.t read/, 'one failure stayed "unreadable" after a read that worked');
  assert.ok(p.times().length > 0);
});

test('only the latest read lands: a retry tapped twice is not overwritten by the older answer', async () => {
  const p = page();
  p.reads[0].resolve(reply(503, {}));
  await flush();
  p.w.retryAvailability();
  p.w.retryAvailability();
  assert.equal(p.reads.length, 3);
  p.reads[2].resolve(avail(45));
  await flush();
  p.reads[1].resolve(avail(15));
  await flush();
  assert.equal(p.w.document.getElementById('introLength').textContent, '45-minute');
});
