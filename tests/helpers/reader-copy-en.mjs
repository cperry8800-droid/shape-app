// A stand-in for src/lib/reader-copy.ts in tests that load a route through loadRealModule: every
// reader reads English, so a notice is pushed and emailed as written. tests/server-notices.test.mjs
// drives the real one.
const tr = (key, opts) => (opts && typeof opts.defaultValue === 'string' ? opts.defaultValue : key);
export const READER_COPY_EN = {
  copyFor: () => ({ code: 'en', locale: 'en', metric: false, tr }),
  readerCopy: async () => ({ code: 'en', locale: 'en', metric: false, tr }),
};
