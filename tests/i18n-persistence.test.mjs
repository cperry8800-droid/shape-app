import test from 'node:test';
import assert from 'node:assert/strict';
import { reconcileLocale } from '../mobile-app/src/i18n/reconcile.mjs';

test('account locale wins and back-writes localStorage', () => {
  assert.deepEqual(reconcileLocale({ stored: 'en', account: 'ja' }),
    { locale: 'ja', writeAccount: false, writeLocal: true });
});
test('account locale equal to stored → no local write needed', () => {
  assert.deepEqual(reconcileLocale({ stored: 'ja', account: 'ja' }),
    { locale: 'ja', writeAccount: false, writeLocal: false });
});
test('no account locale → adopt pre-account choice into the account', () => {
  assert.deepEqual(reconcileLocale({ stored: 'ar', account: null }),
    { locale: 'ar', writeAccount: true, writeLocal: false });
});
test('neither set → en, nothing to write', () => {
  assert.deepEqual(reconcileLocale({ stored: null, account: null }),
    { locale: 'en', writeAccount: false, writeLocal: false });
});
test('unsupported values are ignored', () => {
  assert.deepEqual(reconcileLocale({ stored: 'zzz', account: 'qqq' }),
    { locale: 'en', writeAccount: false, writeLocal: false });
});
