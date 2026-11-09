// A coach's public stats: the mobile entry point for the canonical read. CANONICAL in
// public/newdesign/coachPublicStats.mjs, so the website's coach page reads the same code (the
// profileCustom / coachWork precedent); mobile imports `../services/coachPublicStats.mjs` and Node
// tests import through here.
export * from '../../../public/newdesign/coachPublicStats.mjs';
