// A coach's work on their profile (programs, workout videos, the studio's lit pieces, plate notes):
// the mobile entry point for the canonical module. CANONICAL in public/newdesign/coachWork.mjs, so
// the website's coach profile reads the same code (the listingMedia / profileCustom precedent);
// mobile imports `../services/coachWork.mjs` and Node tests import through here.
export * from '../../../public/newdesign/coachWork.mjs';
