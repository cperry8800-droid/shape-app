// The website's login box, option A, "Spotlight glass" (owner, 2026-11-03: "lets also come up
// with new designs for this login box on website", then "do a"). A calmer glass card (in the middle of
// the screen since 2026-11-04, "center this box on screen"), sentence-case labels, Email/Phone and the role as sliding
// segmented controls, and the teal button as the only solid shape. Only the markup that draws the
// box changed; the sign-in logic above it didn't. These pin what the redesign had to keep: where
// the links go (#2573), the fields a password manager reads, the role switch, the error box, and
// the bot check fitting a 320px phone.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const src = readFileSync(new URL('../public/newdesign/login.jsx', import.meta.url), 'utf8');

test('Back to home and the logo go to the homepage, not the path chooser (#2573)', () => {
  assert.match(src, /<a href="index\.html" className="lgA-back">← Back to home<\/a>/);
  assert.match(src, /<a href="index\.html" aria-label="Shape home"/);
  assert.doesNotMatch(src, /href="Landing\.html"[^>]*>← Back to home/);
  // signing up still starts at the path chooser
  assert.match(src, /<a href="Landing\.html">Create an account →<\/a>/);
});

test('the card says Shape (owner, 2026-11-08: the name back to Shape; Club Shape is the virtual club)', () => {
  assert.match(src, /<h1 className="lgA-title">Log in to <em>Shape<\/em>\.<\/h1>/);
  assert.match(src, /<span>New to Shape\?<\/span>/);
  assert.match(readFileSync(new URL('../public/newdesign/Login.html', import.meta.url), 'utf8'), /<title>Log in — Shape<\/title>/);
  assert.doesNotMatch(src, /Club(&nbsp;| )Shape/, 'the login page still names Club Shape');
});

test('the card stands in the middle of the screen, and Club Shape is in the website\'s face (owner, 2026-11-04)', () => {
  // "center this box on screen": no offset to the right of centre, on any width
  assert.match(src, /\.lgA-mainrow\{[^}]*justify-content:center/);
  assert.match(src, /\.lgA-main\{[^}]*align-items:center/);
  assert.doesNotMatch(src, /\.lgA-card\{[^}]*margin-left/, 'the card is not pushed right of centre');
  // "change club shape font in login box to match website font": the homepage's headings are Anybody at
  // 500 and width 90, their teal words upright (index.html), and so is Club Shape here.
  const home = readFileSync(new URL('../public/newdesign/index.html', import.meta.url), 'utf8');
  assert.match(home, /--disp:'Anybody'/);
  assert.match(home, /h2 em,h1 em,h3 em\{font-style:normal;color:var\(--teal\)\}/);
  assert.match(src, /\.lgA-title em\{font-family:'Anybody','Anybody Fallback',system-ui,sans-serif;font-style:normal;font-weight:500;font-variation-settings:'wdth' 90;[^}]*color:#34d6c5\}/);
  // The login page mounts no site header, so it requests Anybody itself, with its width axis, at pageShell's URL.
  const shell = readFileSync(new URL('../public/newdesign/pageShell.jsx', import.meta.url), 'utf8');
  const url = "https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@50..150,100..900&family=Schibsted+Grotesk:wght@400..700&display=swap";
  assert.ok(shell.includes(`@import url('${url}')`), 'pageShell\'s request moved: keep the two the same');
  assert.ok(src.includes(`@import url('${url}')`));
  assert.ok(src.indexOf('@import') < src.indexOf('.lgA-page{'), '@import comes before every rule in its sheet');
});

test('the fields a password manager and a phone keyboard read are kept', () => {
  for (const [id, ac] of [['email', 'username'], ['password', 'current-password'], ['phone', 'tel'], ['otp', 'one-time-code']]) {
    assert.match(src, new RegExp(`id="${id}"[^>]*autoComplete="${ac}"|autoComplete="${ac}"[^>]*id="${id}"`), `#${id} with autocomplete ${ac}`);
  }
});

test('the switches say which choice is on, the role under its label; errors are announced', () => {
  assert.match(src, /<div role="group" aria-labelledby=\{labelledBy\} aria-label=\{ariaLabel\} className="lg-seg"/);
  assert.match(src, /aria-pressed=\{value === v\} className="lg-seg-btn"/);
  assert.match(src, /id="login-role-label"/);
  assert.match(src, /<div role="alert" className="lgA-err">\{errMsg\}<\/div>/);
});

test('the bot check: dark, the card\'s width, and 300px of room on a 320px phone', () => {
  // an explicit widget takes its look as render parameters, not data-* attributes (Codex on #2577)
  assert.match(src, /window\.ShapeTurnstile\.render\(captchaRef\.current, setCaptchaToken, \{ theme: "dark", size: "flexible" \}\)/);
  assert.doesNotMatch(src, /data-theme=|data-size=/);
  const shared = readFileSync(new URL('../public/supabase.js', import.meta.url), 'utf8');
  assert.match(shared, /render: function \(el, onToken, look\) \{/);
  assert.match(shared, /if \(look && look\.theme\) params\.theme = look\.theme;/);
  assert.match(shared, /if \(look && look\.size\) params\.size = look\.size;/);
  assert.match(shared, /return ts\.render\(el, params\);/);
  // Turnstile is 300px at its narrowest, and the phone card leaves it the screen less 74px, short
  // below 374px (Codex on #2577: 286px at 360). There the card widens and the widget's row takes
  // the card's side padding: the screen less 18px (302px at 320, measured in Chromium)
  assert.match(src, /@media \(max-width:373px\)\{\.lgA-main\{padding-left:8px;padding-right:8px\}\.lgA-captcha\{margin-left:-20px;margin-right:-20px\}\}/);
  // it still falls open: a check that can't load never blocks a sign-in
  assert.match(src, /Couldn't load the human-check — you can still sign in\./);
});
