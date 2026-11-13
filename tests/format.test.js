import { test, assertEqual, assert } from './harness.js';
import { parseNumber, fmtInt, fmtDecimal } from '../js/lib/format.js';

test('parseNumber: plain integers and decimals', () => {
  assertEqual(parseNumber('2400'), 2400);
  assertEqual(parseNumber('12.5'), 12.5);
  assertEqual(parseNumber(' 160 '), 160);
  assertEqual(parseNumber(80), 80);
});

test('parseNumber: EU decimal comma', () => {
  assertEqual(parseNumber('12,5'), 12.5);
  assertEqual(parseNumber('0,8'), 0.8);
});

test('parseNumber: thousands separators', () => {
  assertEqual(parseNumber('2,400'), 2400);
  assertEqual(parseNumber('2 400'), 2400);
  assertEqual(parseNumber('2,400.5'), 2400.5);
});

test('parseNumber: rejects junk', () => {
  for (const bad of ['', 'abc', '12g', '1.2.3', null, undefined, NaN]) {
    assert(Number.isNaN(parseNumber(bad)), `expected NaN for ${JSON.stringify(bad)}`);
  }
});

test('fmtInt: rounds and groups thousands, never "-0"', () => {
  assertEqual(fmtInt(2400.4), '2,400');
  assertEqual(fmtInt(-0.2), '0');
  assertEqual(fmtInt(undefined), '0');
});

test('fmtDecimal: max one decimal place', () => {
  assertEqual(fmtDecimal(12.345), '12.3');
  assertEqual(fmtDecimal(12), '12');
});
