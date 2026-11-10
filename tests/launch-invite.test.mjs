// The cold open's invite edition (BSSplash style "classified", the telegram a digest that found no
// session falls back to). Owner, 2026-11-09, over a screenshot of it: "also make sure this is wired
// properly. and remove that one line" — the "To: You · Invitation" address line.
//
// ⚠ IT IS NO LONGER A DOOR (owner, 2026-11-10: an account is required; the signed-out Preview that
// reached it from the paywall is gone). Only a signed-in account reaches the telegram now, so the
// shell hands the splash no signed-out answer; the invite edition stays as the fallback for a
// session that never restores, and Step inside, a tap anywhere and the keyboard each still leave it
// for the app.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const MAIN = read('mobile-app/src/broadsheet/iosAppBroadsheetMain.jsx');
const LOCALES = ['en', 'es', 'pt-BR', 'fr', 'de', 'it', 'ru', 'uk', 'tr', 'vi', 'id', 'ha', 'pcm'];
const fnBody = (src, name) => {
  const at = src.indexOf(`function ${name}(`);
  assert.ok(at >= 0, `${name} is gone`);
  return src.slice(at, src.indexOf('\n}\n', at));
};
const SPLASH = fnBody(MAIN, 'BSSplash');
const SHELL = fnBody(MAIN, 'BSAppShell');
// The invite edition: the signed-out return at the end of the classified branch.
const INVITE = SPLASH.slice(SPLASH.indexOf('// Invite edition (signed-out preview)'), SPLASH.lastIndexOf('return null;'));

test('the invite edition opens on the pitch, with no address line over it', () => {
  assert.ok(INVITE.length > 500, 'the invite edition was not found');
  assert.doesNotMatch(INVITE, /launch\.toYou/, 'the "To: You · Invitation" line is back');
  // Positive control: the same slice still reads the pitch and the button.
  for (const k of ['launch.pitch1', 'launch.pitch2', 'launch.pitch3', 'launch.stepInside']) {
    assert.match(INVITE, new RegExp(`tr\\('${k.replace('.', '\\.')}'\\)`), `the invite edition lost ${k}`);
  }
  assert.doesNotMatch(MAIN, /launch\.toYou/, 'something else reads the retired key');
  for (const l of LOCALES) {
    const cat = JSON.parse(read(`mobile-app/src/i18n/catalogs/${l}/onboarding.json`));
    assert.equal(cat['launch.toYou'], undefined, `${l} still carries the address line's words`);
    for (const k of ['launch.pitch1', 'launch.pitch2', 'launch.pitch3', 'launch.stepInside']) {
      assert.ok(String(cat[k] || '').trim(), `${l} has no ${k}`);
    }
  }
});

test('no Preview reaches it any more, and every way out enters the app', () => {
  assert.doesNotMatch(SHELL, /onPreview|setPreviewMode|previewMode/, 'the signed-out Preview is back');
  const daily = SHELL.slice(SHELL.indexOf("{stage === 'daily' && <BSSplash"), SHELL.indexOf("{stage === 'login'"));
  assert.match(daily, /if \(authUserId\) \{ try \{ localStorage\.setItem\('shape\.dailySeen'/, 'only an account stamps the seen-marker');
  assert.match(daily, /setStage\('app'\);/, 'leaving the invite no longer enters the app');
  // Step inside, the whole screen, and a real keyboard control.
  assert.match(INVITE, /<div onClick=\{onDone\}/, 'a tap anywhere no longer enters');
  assert.match(INVITE, /<button onClick=\{onDone\}[^>]*>\s*<span>\{tr\('launch\.stepInside'\)\}<\/span>/, 'Step inside no longer enters');
});

test('only an account reaches the telegram: the splash takes no signed-out answer, and a restoring account keeps the retries', () => {
  assert.match(SHELL, /<BSSplash style="classified" onDone=/, 'the shell hands the telegram a signed-out answer again');
  assert.match(SPLASH, /^function BSSplash\(\{ onDone, style = 'wire-beat' \}\)/);
  assert.match(SPLASH, /const \[bsDigest, setBsDigest\] = useStateBSM\(null\);/, 'the telegram opens on its loading line, not the invite');
  const effect = SPLASH.slice(SPLASH.indexOf("if (style !== 'classified') return undefined;"));
  // The retries stay: three, backing off, before the invite edition.
  assert.match(effect, /if \(tries >= 3\) \{ setBsDigest\(dd \|\| \{ signedIn: false, name: null \}\); return; \}/);
  assert.match(effect, /\}, \[style\]\);/);
  // The door waits for the restore before it decides: the welcome only for a session with no account.
  const gate = SHELL.slice(SHELL.indexOf("{stage === 'gate' && ("), SHELL.indexOf("{stage === 'daily'"));
  assert.ok(gate.indexOf('gateLoading ?') >= 0 && gate.indexOf('gateLoading ?') < gate.indexOf('<BSWelcome'),
    'the welcome no longer waits for the gate (and so for the restore)');
});
