import { jest } from '@jest/globals';
import { SMOKE_ROWS, SMOKE_SVG_IDS } from './fixtures/svgcode-smoke-fixtures.js';

describe('data-model E006 smoke test against fixture data', () => {
  let dataModel;

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../services/svg-parser.js', () => ({
      isValidSvgCode: (code, floor) => {
        const ids = SMOKE_SVG_IDS[String(floor)];
        return ids ? ids.has(code) : false;
      },
    }));
    dataModel = await import('../services/data-model.js');
  });

  test('produces exactly 3 E006 findings across the fixture rows', () => {
    let e006Count = 0;
    const e006Codes = [];
    for (const row of SMOKE_ROWS) {
      const { errors } = dataModel.validateRow(row, SMOKE_ROWS, row);
      for (const e of errors) {
        if (e.code === 'E006') {
          e006Count += 1;
          e006Codes.push(e.details.svgCode);
        }
      }
    }
    expect(e006Count).toBe(3);
    expect(e006Codes).toEqual(expect.arrayContaining([
      'ka1_61_z',   // typo
      'ka1_53_a',   // wrong floor
      'cl_106_a',   // pre-#17 mismatch
    ]));
    // The legitimate cl1_106_a row must NOT be among them.
    expect(e006Codes).not.toContain('cl1_106_a');
  });
});
