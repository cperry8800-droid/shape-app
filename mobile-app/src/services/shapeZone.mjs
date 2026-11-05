// One clock per person (P9): the mobile entry point for the canonical module. CANONICAL in
// public/newdesign/shapeZone.mjs, so the website prints time the same way; mobile imports
// `../services/shapeZone.mjs` and Node tests import through here.
export * from '../../../public/newdesign/shapeZone.mjs';
