// A return path a client hands a Stripe redirect (a checkout's success and cancel pages, the
// billing portal's return) is appended to this site's origin, so it has to stay a path ON this
// origin. One leading slash and then neither another slash nor a backslash: `//evil.example`
// is protocol-relative, and browsers read `/\evil.example` the same way. No whitespace, no
// scheme. Anything else is the caller's own default. (L10 of the 2026-10-08 review.)
const SAME_ORIGIN_PATH = /^\/(?![\/\\])\S*$/;
const PATH_MAX = 2048;

export function sameOriginPath(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length <= PATH_MAX && SAME_ORIGIN_PATH.test(value) ? value : fallback;
}
