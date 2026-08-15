// Re-export shim: the canonical sign-out scrub inventory lives in
// public/newdesign/localScrub.mjs (the split-with-shim pattern — /m/ ships
// under the WEBSITE's origin, so the two surfaces share one localStorage and
// must scrub the same union). See the canonical file for the full rationale.
export * from '../../../public/newdesign/localScrub.mjs';
