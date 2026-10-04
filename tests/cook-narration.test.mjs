import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';

const { useBSCookVoice, BSPrepCook, bsCkReading, bsCkTop, bsCkReadsProp } = await loadBroadsheet(['useBSCookVoice', 'BSPrepCook', 'bsCkReading', 'bsCkTop', 'bsCkReadsProp'], React);
const dom = new JSDOM('<div id="root"></div>', { url: 'https://shape.test' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.localStorage = dom.window.localStorage;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
let voice;
function Probe({ text, allowed = true }) { voice = useBSCookVoice(text, allowed); return null; }

test('narration reads prep on opt-in, moves with steps, retries failure and cancels stale results', async () => {
  const calls = [];
  let pending;
  let failure = false;
  window.ShapeVoice = {
    speak: (text, tone, options) => { calls.push({ text, options }); return pending || Promise.resolve(failure ? { ok: false, reason: 'playback_blocked' } : { ok: true }); },
    stop() {}, retry: () => Promise.resolve({ ok: true }),
  };
  const root = createRoot(document.getElementById('root'));
  const render = text => React.act(async () => root.render(React.createElement(Probe, { text })));
  await render('Get it on the board. Two carrots.');
  assert.equal(calls.length, 0);
  await React.act(async () => voice.toggleReads());
  assert.equal(calls[0].text, 'Get it on the board. Two carrots.');
  assert.deepEqual(calls[0].options, { force: true });
  await render('Chop the carrots.');
  assert.equal(calls.at(-1).text, 'Chop the carrots.');
  const count = calls.length;
  await render('Chop the carrots.');
  assert.equal(calls.length, count, 'a timer heartbeat must not reread the step');
  failure = true;
  await render('Roast the carrots.');
  assert.equal(voice.voiceStatus, 'playback_blocked');
  await React.act(async () => voice.retryVoice());
  assert.equal(voice.voiceStatus, 'idle');
  assert.equal(calls.length, count + 1, 'retry must play the already downloaded clip');
  let finish;
  pending = new Promise(resolve => { finish = resolve; });
  await render('Plate the carrots.');
  await React.act(async () => voice.toggleReads());
  await React.act(async () => finish({ ok: false, reason: 'unavailable' }));
  assert.equal(voice.voiceStatus, 'idle', 'old failures must not surface after turning narration off');
  await React.act(async () => root.unmount());
});

test('persisted narration is silent when membership is unavailable', async () => {
  localStorage.setItem('shape.cookReads', '1');
  let calls = 0;
  window.ShapeVoice = { speak() { calls++; }, stop() {} };
  const root = createRoot(document.getElementById('root'));
  await React.act(async () => root.render(React.createElement(Probe, { text: 'Cook', allowed: false })));
  assert.equal(calls, 0);
  await React.act(async () => root.unmount());
  localStorage.clear();
});

test('the board waits to narrate until the scheduled step is due, and cancels while waiting for the next', async () => {
  const realNow = Date.now;
  const anchor = 1_000_000;
  let now = anchor;
  Date.now = () => now;
  localStorage.setItem('shape.cookReads', '1');
  const calls = [];
  let stops = 0;
  window.ShapeVoice = { speak: async text => { calls.push(text); return { ok: true }; }, stop() { stops++; } };
  const root = createRoot(document.getElementById('root'));
  const props = { items: [], anchor, serve: true, onClose() {}, onDone() {}, onRecipePrepped() {}, timeline: [
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 0, text: 'Chop.', at: 10, min: 2, station: 'board', maxPause: 3 },
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 1, text: 'Finish.', at: 15, min: 1, station: 'board' },
  ] };
  const render = () => React.act(async () => root.render(React.createElement(BSPrepCook, props)));
  try {
    await render();
    assert.equal(calls.length, 0, 'persisted reads-on must stay silent before the scheduled start');
    now = anchor + 10 * 60000;
    await render();
    assert.deepEqual(calls, ['A. Chop.']);
    now += 1000;
    await render();
    assert.equal(calls.length, 1, 'the heartbeat must not repeat narration');
    now = anchor + 12 * 60000;
    const next = [...document.querySelectorAll('button')].find(b => b.textContent.startsWith('Done · next'));
    const before = stops;
    await React.act(async () => next.click());
    assert.equal(calls.length, 1, 'the later continuation must not narrate immediately');
    assert.ok(stops > before, 'moving into a wait cancels the previous clip');
    now = anchor + 15 * 60000;
    await render();
    assert.deepEqual(calls, ['A. Chop.', 'A. Finish.']);
  } finally {
    await React.act(async () => root.unmount());
    Date.now = realNow;
    localStorage.clear();
  }
});

test('Start now allows narration early, but cannot bypass an occupied station', async () => {
  const realNow = Date.now;
  const anchor = 1_000_000;
  let now = anchor;
  Date.now = () => now;
  localStorage.setItem('shape.cookReads', '1');
  const calls = [];
  window.ShapeVoice = { speak: async text => { calls.push(text); return { ok: true }; }, stop() {} };
  const root = createRoot(document.getElementById('root'));
  const props = { items: [], anchor, serve: true, onClose() {}, onDone() {}, onRecipePrepped() {}, timeline: [
    { iid: 0, recipe: 'a', title: 'A', stepIndex: 0, text: 'Chop.', at: 10, min: 2, station: 'board' },
  ] };
  try {
    await React.act(async () => root.render(React.createElement(BSPrepCook, props)));
    const start = [...document.querySelectorAll('button')].find(b => b.textContent === 'Start now');
    await React.act(async () => start.click());
    assert.deepEqual(calls, ['A. Chop.']);
    calls.length = 0;
    const initial = { jumpedAt: 0, timers: [{ id: 1, iid: 1, title: 'B', station: 'board', endsAt: anchor + 12 * 60000 }] };
    await React.act(async () => root.render(React.createElement(BSPrepCook, { ...props, initial, key: 'blocked' })));
    assert.equal(calls.length, 0, 'an early-start override must still respect live holds');
    now = anchor + 12 * 60000;
    await React.act(async () => root.render(React.createElement(BSPrepCook, { ...props, initial, key: 'blocked' })));
    assert.deepEqual(calls, ['A. Chop.']);
  } finally {
    await React.act(async () => root.unmount());
    Date.now = realNow;
    localStorage.clear();
  }
});

test('a future pause warning becomes overdue on the board clock without another Next tap', async () => {
  const realNow = Date.now;
  let now = 60000;
  Date.now = () => now;
  const root = createRoot(document.getElementById('root'));
  const timeline = [{ iid: 0, recipe: 'a', title: 'A', stepIndex: 1, text: 'Finish.', at: 5, min: 1, station: 'board' }];
  const props = { items: [], anchor: 0, serve: true, timeline, onClose() {}, onDone() {}, onRecipePrepped() {},
    initial: { livePlan: { timeline, serveAt: 6 * 60000, spread: 0, pauseOverdue: [], pauseDeadlines: [{ title: 'A', at: 4 * 60000 }] } } };
  try {
    await React.act(async () => root.render(React.createElement(BSPrepCook, props)));
    assert.match(document.body.textContent, /needs attention by/);
    assert.doesNotMatch(document.body.textContent, /pause has been exceeded/);
    now = 5 * 60000;
    await React.act(async () => root.render(React.createElement(BSPrepCook, props)));
    assert.doesNotMatch(document.body.textContent, /needs attention by/);
    assert.match(document.body.textContent, /pause has been exceeded/);
  } finally {
    await React.act(async () => root.unmount());
    Date.now = realNow;
  }
});

const source = readFileSync(new URL('../mobile-app/src/services/shapeBackend.js', import.meta.url), 'utf8');
function lift(name) {
  const at = source.indexOf(`function ${name}(`);
  const begin = source.slice(at - 6, at) === 'async ' ? at - 6 : at;
  const open = source.indexOf('{', source.indexOf(')', at));
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(begin, i + 1);
  }
  throw Error(name);
}

test('browser-blocked server audio retries from the same clip and stop releases it', async () => {
  let fetches = 0, plays = 0;
  const revoked = [];
  class Audio {
    play() { plays++; return plays === 1 ? Promise.reject({ name: 'NotAllowedError' }) : Promise.resolve(); }
    pause() {}
  }
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null;
    const apiBaseUrl='https://api.test', state={session:{access_token:'test'}};
    const readVoicePrefs=()=>({enabled:false,tone:'supportive',voice:'auto'});
    ${lift('settleVoiceEnd')} ${lift('stopVoice')} ${lift('speakVoice')} ${lift('retryVoice')}
    return {speak:speakVoice,retry:retryVoice,stop:stopVoice};`;
  const backend = new Function('fetch', 'Audio', 'URL', code)(
    async () => { fetches++; return { ok: true, blob: async () => new Blob(['voice']) }; },
    Audio, { createObjectURL: () => 'blob:test', revokeObjectURL: url => revoked.push(url) });
  assert.deepEqual(await backend.speak('Prep the carrots', undefined, { force: true }), { ok: false, reason: 'playback_blocked' });
  assert.equal(revoked.length, 0);
  assert.equal((await backend.retry()).ok, true);
  assert.equal(fetches, 1);
  backend.stop();
  assert.ok(revoked.includes('blob:test'));
  assert.equal((await backend.retry()).ok, false);
});

// ── 2026-10-04: the owner saw "Nora is reading this step" and heard nothing. ──────────────
const trD = (key, opts = {}) => opts.defaultValue ?? key;
const lineOf = (status, readsOn = true) => {
  const el = bsCkReading({ tr: trD, readsOn, status, retry() {} });
  return el ? JSON.stringify(el.props.children) : null;
};

test('the reading line is drawn only while her audio loads or plays', () => {
  assert.equal(lineOf('idle'), null, 'idle is nothing sounding: no step to read, a clip that ended, or a stop');
  assert.match(lineOf('loading'), /Nora is reading this step/);
  assert.match(lineOf('playing'), /Nora is reading this step/);
  assert.equal(lineOf('playing', false), null);
  // A sign-in refusal says so and offers no retry: playing again cannot sign anyone in.
  const signIn = bsCkReading({ tr: trD, readsOn: true, status: 'signed_out', retry() {} });
  assert.match(JSON.stringify(signIn.props.children), /Sign in with an active membership/);
  assert.doesNotMatch(JSON.stringify(signIn.props.children), /Play voice/);
  assert.match(lineOf('playback_blocked'), /Play voice/);
});

test('the status follows real playback: playing until her clip ends, idle after', async () => {
  localStorage.setItem('shape.cookReads', '1');
  let end;
  const ended = new Promise((resolve) => { end = resolve; });
  window.ShapeVoice = { speak: async () => ({ ok: true, ended }), stop() {} };
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(Probe, { text: 'Chop the carrots.' })));
    assert.equal(voice.voiceStatus, 'playing', 'speak resolves as playback STARTS, so she is still reading');
    await React.act(async () => end());
    assert.equal(voice.voiceStatus, 'idle', 'the line outlived her clip');
  } finally {
    await React.act(async () => root.unmount());
    localStorage.clear();
  }
});

test('a stop or an outside supersession while her audio loads never leaves the line stuck', async () => {
  localStorage.setItem('shape.cookReads', '1');
  let finish;
  window.ShapeVoice = { speak: () => new Promise((resolve) => { finish = resolve; }), stop() {} };
  const root = createRoot(document.getElementById('root'));
  try {
    await React.act(async () => root.render(React.createElement(Probe, { text: 'Chop.' })));
    assert.equal(voice.voiceStatus, 'loading');
    await React.act(async () => voice.stopSpeak());
    assert.equal(voice.voiceStatus, 'idle', 'the mic (stopSpeak) left "reading" up over silence');
    await React.act(async () => root.render(React.createElement(Probe, { text: 'Stir.' })));
    assert.equal(voice.voiceStatus, 'loading');
    // Something outside this hook (another speak, ShapeVoice.stop) superseded the clip.
    await React.act(async () => finish({ ok: false, superseded: true }));
    assert.equal(voice.voiceStatus, 'idle', 'a superseded clip left the line on with nothing sounding');
  } finally {
    await React.act(async () => root.unmount());
    localStorage.clear();
  }
});

test('the voice switch is ONE setting: flipping it on one screen flips every other', async () => {
  const seen = {};
  function Two({ id }) { seen[id] = useBSCookVoice('', true); return null; }
  window.ShapeVoice = { speak: async () => ({ ok: true }), stop() {} };
  const host = document.createElement('div'); document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await React.act(async () => root.render(React.createElement(React.Fragment, null,
      React.createElement(Two, { id: 'a' }), React.createElement(Two, { id: 'b' }))));
    assert.equal(seen.a.readsOn, false);
    let next;
    await React.act(async () => { next = seen.a.toggleReads(); });
    assert.equal(next, true, 'toggleReads reports the new state for the confirmation');
    assert.equal(seen.b.readsOn, true, 'the other screen kept its own stale copy');
    assert.equal(localStorage.getItem('shape.cookReads'), '1');
  } finally {
    await React.act(async () => root.unmount());
    host.remove();
    localStorage.clear();
  }
});

test('the top bar draws Nora\'s voice as a named on/off switch', () => {
  const find = (el, pred) => {
    if (!el || typeof el !== 'object') return null;
    if (Array.isArray(el)) { for (const c of el) { const f = find(c, pred); if (f) return f; } return null; }
    if (el.props && pred(el)) return el;
    return el.props ? find(el.props.children, pred) : null;
  };
  for (const on of [true, false]) {
    const bar = bsCkTop({ tr: trD, c: true, left: null, title: 'Cook together', reads: { on, onClick() {} } });
    const spk = find(bar, (n) => n.type === 'button' && /\bspk\b/.test(n.props.className || ''));
    assert.ok(spk, 'no voice switch in the bar');
    assert.equal(spk.props.role, 'switch');
    assert.equal(spk.props['aria-checked'], on);
    assert.equal(spk.props['aria-label'], 'Nora’s voice');
    assert.match(JSON.stringify(spk.props.children), on ? /"On"/ : /"Off"/);
  }
});

test('flipping the switch says what changed; a visitor is told how to hear her', () => {
  const said = [];
  let state = false;
  const member = bsCkReadsProp({ tr: trD, voiceCanSpeak: true, voiceMember: true, readsOn: state, toggle: () => (state = !state), say: (t) => said.push(t) });
  member.onClick();
  member.onClick();
  assert.match(said[0], /voice is on/);
  assert.match(said[1], /voice is off/);
  const visitor = bsCkReadsProp({ tr: trD, voiceCanSpeak: true, voiceMember: false, readsOn: true, toggle: () => { throw new Error('a visitor flipped the switch'); }, say: (t) => said.push(t) });
  assert.equal(visitor.on, false, 'a visitor sees the switch on');
  visitor.onClick();
  assert.match(said[2], /Sign in with an active membership to hear Nora/);
  assert.equal(bsCkReadsProp({ tr: trD, voiceCanSpeak: false, voiceMember: true, readsOn: true, toggle() {}, say() {} }), null);
});

test('with Nora\'s voice off she does not speak her answers or a repeat either', () => {
  const client = readFileSync(new URL('../mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx', import.meta.url), 'utf8');
  const talks = client.match(/= useBSCookTalk\(\{[^}]*\}\)/g) || [];
  assert.equal(talks.length, 2, 'expected the one-dish screen and the board');
  for (const call of talks) assert.match(call, /speak: readsOn \? speak : null/, `a talk hook speaks with the switch off: ${call}`);
  const repeats = client.match(/cmd === 'repeat'\)[^\n]*/g) || [];
  assert.equal(repeats.length, 2);
  for (const r of repeats) assert.match(r, /if \(readsOn\) speak\([^)]*\); else noraSays\([^)]*, false\)/, r);
});

test('speakVoice hands back when her clip ends, and a stop ends it too', async () => {
  let audio;
  class Audio { constructor() { audio = this; } play() { return Promise.resolve(); } pause() {} }
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null, _voiceEnded=null, _voiceEnd=null;
    const apiBaseUrl='https://api.test', state={session:{access_token:'test'}};
    const readVoicePrefs=()=>({enabled:true,tone:'supportive',voice:'auto'});
    ${lift('settleVoiceEnd')} ${lift('stopVoice')} ${lift('speakVoice')} ${lift('retryVoice')}
    return {speak:speakVoice,retry:retryVoice,stop:stopVoice};`;
  const backend = new Function('fetch', 'Audio', 'URL', code)(
    async () => ({ ok: true, blob: async () => new Blob(['voice']) }),
    Audio, { createObjectURL: () => 'blob:test', revokeObjectURL() {} });
  const settled = (p) => Promise.race([p.then(() => true), new Promise((r) => setTimeout(() => r(false), 20))]);
  const first = await backend.speak('Chop', undefined, { force: true });
  assert.equal(first.ok, true);
  assert.equal(await settled(first.ended), false, 'ended settled while the clip was still playing');
  audio.onended();
  assert.equal(await settled(first.ended), true, 'ended never settled after the clip ended');
  const second = await backend.speak('Stir', undefined, { force: true });
  backend.stop();
  assert.equal(await settled(second.ended), true, 'a stopped clip never fires ended, so stop must settle it');
  const third = await backend.speak('Plate', undefined, { force: true });
  const fourth = await backend.speak('Serve', undefined, { force: true });
  assert.equal(await settled(third.ended), true, 'a newer speak must end the older clip');
  assert.equal(await settled(fourth.ended), false, 'the newer clip ended with the older one');
});
