// The app's fonts ship in the repo (src/app/fonts) and load through next/font/local. next/font/google
// fetched Inter, Fraunces and JetBrains Mono from Google during `next build`, and CI's Web job failed
// whenever that fetch did (#2449, #2453). This keeps the build from reaching out again.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');

function sources(dir) {
  return fs.readdirSync(path.join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) return sources(rel);
    return /\.(tsx?|jsx?|mjs)$/.test(e.name) ? [rel] : [];
  });
}

test('nothing under src/ imports next/font/google', () => {
  const importers = sources('src').filter((rel) => /from\s+['"]next\/font\/google['"]/.test(read(rel)));
  assert.deepEqual(importers, [], 'load a font with next/font/local from src/app/fonts: next/font/google fetches it from Google at build time');
});

// Each layout's localFont call, the file it names and the CSS variable globals.css and the admin
// console read.
const FONTS = [
  { layout: 'src/app/layout.tsx', file: 'inter-latin-wght-normal.woff2', variable: '--font-inter', licence: 'OFL-Inter.txt' },
  { layout: 'src/app/admin/layout.tsx', file: 'fraunces-latin-opsz-normal.woff2', variable: '--font-admin-display', licence: 'OFL-Fraunces.txt' },
  { layout: 'src/app/admin/layout.tsx', file: 'jetbrains-mono-latin-wght-normal.woff2', variable: '--font-admin-mono', licence: 'OFL-JetBrainsMono.txt' },
];

for (const f of FONTS) {
  test(`${f.variable} loads ${f.file} from the repo`, () => {
    const src = read(f.layout);
    assert.match(src, /import localFont from ['"]next\/font\/local['"]/);
    const call = src.split('localFont(').slice(1).find((c) => c.includes(f.file));
    assert.ok(call, `${f.layout} calls localFont with ${f.file}`);
    assert.match(call.slice(0, call.indexOf('})')), new RegExp(`variable:\\s*['"]${f.variable}['"]`));

    const font = fs.readFileSync(path.join(root, 'src/app/fonts', f.file));
    assert.equal(font.subarray(0, 4).toString('latin1'), 'wOF2', `${f.file} is a WOFF2 file`);
    assert.ok(font.length > 10_000, `${f.file} holds the font, not a stub (${font.length} bytes)`);
    assert.match(read(`src/app/fonts/${f.licence}`), /SIL OPEN FONT LICENSE/i, `${f.licence} ships with the font`);
  });
}

test('globals.css still reads the root layout\'s font variable', () => {
  assert.match(read('src/app/globals.css'), /var\(--font-inter\)/);
});
