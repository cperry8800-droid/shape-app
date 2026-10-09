// three for the booth's node tests. The repo root does not install three; the app does
// (mobile-app/package.json pins it, and CI's Tests job installs mobile-app), and the web
// import map in public/newdesign/Radio.html pins the same version
// (tests/nora-stage-version-parity.test.mjs). Importing the app's copy keeps the tests on the
// three the booth actually ships with. BufferGeometryUtils imports bare `three` itself, which
// resolves inside mobile-app/node_modules to this same file, so both share one instance.
export * from '../../mobile-app/node_modules/three/build/three.module.js';
export { mergeGeometries } from '../../mobile-app/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js';
