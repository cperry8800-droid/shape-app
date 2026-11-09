// The signed-out cold open's invite edition (BSSplash style "classified", reached from the
// paywall's "Preview the app first"). Owner, 2026-11-09, over a screenshot of it: "also make sure
// this is wired properly. and remove that one line" — the "To: You · Invitation" address line.
//
// Wired: the paywall's Preview reaches it, and Step inside, a tap anywhere and the keyboard each
// leave it for the app without stamping a member's seen-marker. A visitor with no session got the
// pitch only after three retries meant for a member whose session was still restoring: 3.3s of
// "Putting today together…" on a local build, every time. The shell knows the answer by then (the
// paywall waits for the restore), so it hands it to the splash.
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

test('Preview reaches it, and every way out enters the app without a member stamp', () => {
  assert.match(SHELL, /onPreview=\{\(\) => \{ setPreviewMode\(true\); setStage\('daily'\); \}\}/, 'the paywall Preview no longer opens the invite');
  const daily = SHELL.slice(SHELL.indexOf("{stage === 'daily' && <BSSplash"), SHELL.indexOf("{stage === 'login'"));
  assert.match(daily, /if \(authUserId && !previewMode\) \{ try \{ localStorage\.setItem\('shape\.dailySeen'/, 'a preview would stamp the seen-marker');
  assert.match(daily, /setStage\('app'\);/, 'leaving the invite no longer enters the app');
  // Step inside, the whole screen, and a real keyboard control.
  assert.match(INVITE, /<div onClick=\{onDone\}/, 'a tap anywhere no longer enters');
  assert.match(INVITE, /<button onClick=\{onDone\}[^>]*>\s*<span>\{tr\('launch\.stepInside'\)\}<\/span>/, 'Step inside no longer enters');
});

test('a visitor with no session gets the pitch at once; a restoring member keeps the retries', () => {
  // The shell's answer: only the paywall's Preview, only once the restore has finished, only with no account.
  assert.match(SHELL, /<BSSplash style="classified" signedOut=\{previewMode && authReady && !authUserId\}/,
    'the shell no longer tells the splash the visitor has no session');
  assert.match(SPLASH, /^function BSSplash\(\{ onDone, style = 'wire-beat', signedOut = false \}\)/, 'signedOut must default to false');
  // Seeded at once (no loading frame), and the effect stops before any digest build.
  assert.match(SPLASH, /useStateBSM\(\(\) => \(style === 'classified' && signedOut \? \{ signedIn: false, name: null \} : null\)\)/);
  const effect = SPLASH.slice(SPLASH.indexOf("if (style !== 'classified') return undefined;"));
  const early = effect.indexOf('if (signedOut) { setBsDigest({ signedIn: false, name: null }); return undefined; }');
  const build = effect.indexOf('bsBuildDailyDigest()');
  assert.ok(early > 0 && build > early, 'the signed-out answer must short-circuit before the digest build');
  // The retries stay for everyone else: three, backing off, before the preview.
  assert.match(effect, /if \(tries >= 3\) \{ setBsDigest\(dd \|\| \{ signedIn: false, name: null \}\); return; \}/);
  assert.match(effect, /\}, \[style, signedOut\]\);/);
  // The paywall that offers Preview waits for the restore, so `authReady` is settled when it is pressed.
  const gate = SHELL.slice(SHELL.indexOf("{stage === 'gate' && ("), SHELL.indexOf("{stage === 'daily'"));
  assert.ok(gate.indexOf('memberGateLoading || memberAllowed ?') >= 0 && gate.indexOf('memberGateLoading || memberAllowed ?') < gate.indexOf('<BSPaywall'),
    'the paywall no longer waits for the gate (and so for the restore)');
});
