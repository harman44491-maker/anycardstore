import test from 'node:test';
import assert from 'node:assert/strict';
import { getPassportSheetLayout, splitCopiesIntoSheets } from '../src/utils/passportSheetLayout.js';

test('A4 and 4x6 paper fit the expected passport photo grids', () => {
  assert.deepEqual(getPassportSheetLayout(210, 297), {
    columns: 5,
    rows: 6,
    capacity: 30,
  });
  assert.deepEqual(getPassportSheetLayout(101.6, 152.4), {
    columns: 2,
    rows: 3,
    capacity: 6,
  });
});

test('custom copy counts paginate to the selected sheet capacity', () => {
  assert.deepEqual(splitCopiesIntoSheets(8, 6), [6, 2]);
  assert.deepEqual(splitCopiesIntoSheets(24, 30), [24]);
});

test('rejects invalid counts and paper that cannot fit a photo', () => {
  assert.equal(getPassportSheetLayout(40, 50).capacity, 0);
  assert.throws(() => splitCopiesIntoSheets(0, 6), RangeError);
  assert.throws(() => splitCopiesIntoSheets(4, 0), RangeError);
});
