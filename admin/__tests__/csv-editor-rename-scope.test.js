/**
 * @jest-environment jsdom
 *
 * #135: the broken-refs "Rename to" dropdown must compute available shelves from
 * the FULL dataset, not the filtered view — otherwise a filtered editor offers a
 * shelf already claimed by an out-of-scope (hidden) row, creating a duplicate
 * svgCode on save. `unclaimedShelvesForFloor` is the extracted, full-dataset
 * computation the dropdown now uses (with allCsvData).
 */

import { describe, test, expect } from '@jest/globals';
import { unclaimedShelvesForFloor } from '../components/csv-editor.js';

describe('unclaimedShelvesForFloor (#135)', () => {
  test('excludes shelves claimed by ANY row in the full dataset (incl. out-of-scope rows)', () => {
    const full = [
      { floor: '0', svgCode: 'MISSING' }, // the broken row being renamed
      { floor: '0', svgCode: 'S1' },      // a HIDDEN row that claims S1 on floor 0
      { floor: '1', svgCode: 'S9' },      // different floor — irrelevant
    ];
    // floor 0 has shelves S1, S2, S3 in its SVG
    expect(unclaimedShelvesForFloor(0, full, ['S1', 'S2', 'S3'])).toEqual(['S2', 'S3']);
  });

  test('skips null entries (rows marked for deletion)', () => {
    const full = [null, { floor: '0', svgCode: 'S1' }];
    expect(unclaimedShelvesForFloor(0, full, ['S1', 'S2'])).toEqual(['S2']);
  });

  test('only considers rows on the requested floor', () => {
    const full = [{ floor: '2', svgCode: 'S1' }]; // claims S1 but on floor 2
    expect(unclaimedShelvesForFloor(0, full, ['S1', 'S2'])).toEqual(['S1', 'S2']);
  });

  test('tolerates empty/undefined inputs', () => {
    expect(unclaimedShelvesForFloor(0, null, ['S1'])).toEqual(['S1']);
    expect(unclaimedShelvesForFloor(0, [], null)).toEqual([]);
  });
});
