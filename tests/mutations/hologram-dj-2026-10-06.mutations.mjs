// Mutation spec for the redrawn hologram DJ (Settings → Light effects → Hologram, 2026-10-06).
// Each mutation breaks one promise the two suites make: the glitch never strobes, the palette
// reads on both papers and stays lighter than text on light paper, the rig stands on its floor,
// the Settings preview's glass never reaches a live screen, the loop stops on unmount, ids are
// per mount, and the call sites hand over the paper and the floor. Run from the repo root:
//   node scripts/mutate.mjs --spec tests/mutations/hologram-dj-2026-10-06.mutations.mjs --fail-on-skipped
const CORE = 'mobile-app/src/services/hologramDj.mjs';
const DJ = 'mobile-app/src/broadsheet/iosAppHologramDJ.jsx';
const REACTIVE = 'mobile-app/src/broadsheet/iosAppReactive.jsx';
const CLIENT = 'mobile-app/src/broadsheet/iosAppBroadsheetClient.jsx';

export default {
  test: 'node --test tests/hologram-dj-core.test.mjs tests/hologram-dj-mount.test.mjs',
  timeoutMs: 180_000,
  mutations: [
    // ── the glitch schedule ──
    { name: 'a burst may start on any 8th: two bursts can land under 3.5 beats apart', file: CORE,
      find: 'Math.floor(3 + holoHash(n * 11 + 5) * 10)',
      replace: 'Math.floor(holoHash(n * 11 + 5) * 16)' },
    { name: 'the first two bars may glitch: the preview can open on a burst', file: CORE,
      find: 'if (n < 1 || holoHash(n * 7 + 3) < 0.4) return null;',
      replace: 'if (n < 0 || holoHash(n * 7 + 3) < 0.4) return null;' },
    { name: 'the glitch band grows to 40 px', file: CORE,
      find: 'const h = 8 + Math.floor(holoHash(n * 17 + 2) * 17);',
      replace: 'const h = 8 + Math.floor(holoHash(n * 17 + 2) * 33);' },
    { name: 'the band slips up to 12 px', file: CORE,
      find: '(3 + Math.floor(holoHash(n * 23 + 4) * 4))',
      replace: '(3 + Math.floor(holoHash(n * 23 + 4) * 10))' },
    // ── the palette ──
    { name: 'light paper goes back to the old cap: rims as dark as the meta text', file: CORE,
      find: 'light: { rim: 4.5, line: 2.6, rimMax: 5.2, lineMax: 3.2 },',
      replace: 'light: { rim: 4.5, line: 2.6, rimMax: 7, lineMax: 3.2 },' },
    { name: 'the rim cap is never applied: dark tints print as ink, cream glares on dark paper', file: CORE,
      find: 'rim = holoReach(rim, back, grounds, T.rimMax, true);',
      replace: '' },
    { name: 'any string reaches the colour maths', file: CORE,
      find: "typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c) ? c.toLowerCase() : HOLO_TEAL",
      replace: "typeof c === 'string' ? c.toLowerCase() : HOLO_TEAL" },
    { name: 'cream loses its cool cast and prints as pencil', file: CORE,
      find: 'const lineBase = holoMix(c, HOLO_COOL, 0.7 * neutral);',
      replace: 'const lineBase = c;' },
    { name: 'the geometry is rebuilt on every mount', file: CORE,
      find: 'if (holoGeo) return holoGeo;',
      replace: '' },
    // ── the component ──
    { name: 'floor 0 alone switches on the preview glass (the round-two defect)', file: DJ,
      find: 'bare = !!preview;',
      replace: 'bare = fl === 0;' },
    { name: 'with no tab bar the base runs into the rounded corner', file: DJ,
      find: 'right: fl > 0 ? HOLO_RIG.right : HOLO_RIG.right + HOLO_RIG.corner',
      replace: 'right: HOLO_RIG.right' },
    { name: 'the booth stands under the tab bar', file: DJ,
      find: 'bottom: fl }), [fl]);',
      replace: 'bottom: 0 }), [fl]);' },
    { name: 'unmounting leaves the animation loop running', file: DJ,
      find: 'cancelAnimationFrame(raf);',
      replace: '' },
    { name: 'the overlay takes taps', file: DJ,
      find: "position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 2",
      replace: "position: 'absolute', inset: 0, pointerEvents: 'auto', zIndex: 2" },
    { name: 'svg ids are shared across mounts', file: DJ,
      find: "const uid = React.useId().replace(/[^A-Za-z0-9_-]/g, '');",
      replace: "const uid = 'holo';" },
    { name: 'the paper is ignored: light paper gets the dark palette', file: DJ,
      find: 'const p = holoPalette(holoNormTint(tint.current), light);',
      replace: 'const p = holoPalette(holoNormTint(tint.current), false);' },
    // ── the call sites ──
    { name: 'RadioEffects drops the paper', file: REACTIVE,
      find: 'isLight={isLight} floor={floor} preview={preview}',
      replace: 'floor={floor} preview={preview}' },
    { name: 'the tabbed screens stop passing the tab bar height', file: CLIENT,
      find: '<BSRadioFx floor={window.BS_TABBAR_H || 64} />',
      replace: '<BSRadioFx />' },
    { name: 'the Settings preview loses its glass', file: CLIENT,
      find: 'floor={0} preview />',
      replace: 'floor={0} />' },
    { name: 'the live overlay forgets the paper', file: CLIENT,
      find: 'isLight={!!t.isLight} floor={floor} />',
      replace: 'floor={floor} />' },
    { name: 'a non-hex accent reaches the overlay again', file: CLIENT,
      find: "if (fxColor === 'accent') return /^#[0-9a-fA-F]{6}$/.test(t.ACCENT || '') ? t.ACCENT : null;",
      replace: "if (fxColor === 'accent') return t.ACCENT;" },
  ],
};
