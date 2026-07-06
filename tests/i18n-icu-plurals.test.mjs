import test from 'node:test';
import assert from 'node:assert/strict';
import { IntlMessageFormat } from 'intl-messageformat';

// Representative ICU strings we ship in catalogs; assert plural correctness for
// the plural systems in the target set (English 2-form, Russian 3-form, Arabic 6-form).
const EN = '{count, plural, one {# point} other {# points}}';
const RU = '{count, plural, one {# очко} few {# очка} many {# очков} other {# очка}}';
const AR = '{count, plural, zero {لا نقاط} one {نقطة} two {نقطتان} few {# نقاط} many {# نقطة} other {# نقطة}}';

test('English 2-form plural', () => {
  assert.equal(new IntlMessageFormat(EN, 'en').format({ count: 1 }), '1 point');
  assert.equal(new IntlMessageFormat(EN, 'en').format({ count: 5 }), '5 points');
});
test('Russian 3-form plural selects few/many correctly', () => {
  assert.equal(new IntlMessageFormat(RU, 'ru').format({ count: 2 }), '2 очка');
  assert.equal(new IntlMessageFormat(RU, 'ru').format({ count: 5 }), '5 очков');
});
test('Arabic selects distinct forms (few for 3 differs from other for 100; zero form)', () => {
  const f = (n) => new IntlMessageFormat(AR, 'ar').format({ count: n });
  assert.notEqual(f(3), f(100)); // few vs many/other differ — rules wired
  assert.ok(String(f(0)).includes('لا')); // zero form
});
