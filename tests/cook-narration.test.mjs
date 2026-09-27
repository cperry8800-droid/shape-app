import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { loadBroadsheet } from './helpers/broadsheet-mount.mjs';

const { useBSCookVoice } = await loadBroadsheet('useBSCookVoice', React);
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
  const code = `let _voiceGen=0, _voiceAudio=null, _voiceUrl=null, _voiceAbort=null;
    const apiBaseUrl='https://api.test', state={session:{access_token:'test'}};
    const readVoicePrefs=()=>({enabled:false,tone:'supportive',voice:'auto'});
    ${lift('stopVoice')} ${lift('speakVoice')} ${lift('retryVoice')}
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
