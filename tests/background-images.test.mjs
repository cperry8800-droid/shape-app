// The live page backgrounds, as WebP.
//
// Owner, 2026-10-14: "shrink the live background images too, as long as this doesnt effect
// the look of these images and fuctionality". Eight full-bleed backgrounds were PNG photos of
// 5–8 MB each (46.9 MB together), downloaded by every visitor to the login page, the
// find-a-coach and find-a-nutritionist directories, pricing, the coach, nutritionist and client
// pages and every page with the shared hero. They are WebP at quality 95 now, at their own
// pixel size (4.86 MB together). Measured before shipping: every page that shows one was
// screenshotted from the PNG tree and the WebP tree, and no pixel differed by more than 8 of
// 255 (mean ≈ 1).
//
// This holds the two things a later edit could quietly undo: a page pointing back at a PNG
// that no longer exists (a black background, no error anywhere), and a re-export that puts a
// multi-megabyte file back on those pages.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STEMS = ['login page 1', 'get started', 'Training 2', 'Nutrition 3', 'Pricing', 'Training 3', 'Nutrition 2', 'Home page 2'];
// The largest is Nutrition 3 at ~1.03 MB; the cap leaves room for a re-export, not for a PNG.
const MAX_BYTES = 1.5 * 1024 * 1024;

test('each live background is a WebP under the cap, and its PNG is gone', () => {
  for (const stem of STEMS) {
    const webp = path.join(ROOT, 'public', stem + '.webp');
    assert.ok(existsSync(webp), `public/${stem}.webp is missing`);
    const head = readFileSync(webp).subarray(0, 12);
    assert.equal(head.toString('latin1', 0, 4) + head.toString('latin1', 8, 12), 'RIFFWEBP', `public/${stem}.webp is not a WebP file`);
    const size = statSync(webp).size;
    assert.ok(size <= MAX_BYTES, `public/${stem}.webp is ${size} bytes, over the ${MAX_BYTES}-byte cap`);
    assert.ok(!existsSync(path.join(ROOT, 'public', stem + '.png')), `public/${stem}.png is back`);
  }
});

test('every page that names a live background names the WebP', () => {
  const files = execFileSync('git', ['ls-files', '-z', 'public', 'src'], { cwd: ROOT }).toString().split('\0')
    .filter((f) => /\.(html|jsx?|tsx?|css)$/.test(f));
  let refs = 0;
  for (const f of files) {
    const text = readFileSync(path.join(ROOT, f), 'utf8');
    for (const stem of STEMS) {
      for (const form of [stem, stem.replace(/ /g, '%20')]) {
        // Image extensions only: `/newdesign/Pricing.html` is a page, not the background.
        for (const m of text.matchAll(new RegExp(`/${form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.(png|jpe?g|webp|avif|gif)\\b`, 'gi'))) {
          refs++;
          assert.equal(m[1], 'webp', `${f} names /${form}.${m[1]}; the file is /${stem}.webp`);
        }
      }
    }
  }
  // 24 when this was written (21 files); 12 once the old root pages that also showed them were
  // retired (2026-10-14). A count near zero means the scan stopped seeing the pages, which would
  // let the assertion above pass on nothing.
  assert.ok(refs >= 10, `only ${refs} references to the live backgrounds were found`);
});
