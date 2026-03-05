/**
 * Unit tests for SVG Parser Service
 * Tests SVG parsing, ID extraction, and code validation
 */

import {
  extractIdsFromSvg,
  isValidSvgCode,
  getAvailableCodes,
  clearCache
} from '../services/svg-parser.js';

describe('SVG Parser Service', () => {
  beforeEach(() => {
    clearCache();
  });

  describe('extractIdsFromSvg', () => {
    test('extracts valid element IDs', () => {
      const svgContent = `
        <svg>
          <rect id="CB_0" />
          <rect id="shelf_a" />
          <rect id="floor_1_section" />
        </svg>
      `;

      const ids = extractIdsFromSvg(svgContent);

      expect(ids.has('CB_0')).toBe(true);
      expect(ids.has('shelf_a')).toBe(true);
      expect(ids.has('floor_1_section')).toBe(true);
    });

    test('excludes internal SVG IDs', () => {
      const svgContent = `
        <svg id="svg261">
          <defs id="defs20">
            <pattern id="pattern1" />
          </defs>
          <filter id="fx0" />
          <clipPath id="clip13" />
          <rect id="CB_0" />
        </svg>
      `;

      const ids = extractIdsFromSvg(svgContent);

      expect(ids.has('svg261')).toBe(false);
      expect(ids.has('defs20')).toBe(false);
      expect(ids.has('pattern1')).toBe(false);
      expect(ids.has('fx0')).toBe(false);
      expect(ids.has('clip13')).toBe(false);
      expect(ids.has('CB_0')).toBe(true);
    });

    test('excludes filter component IDs', () => {
      const svgContent = `
        <svg>
          <feComponentTransfer id="feComponentTransfer1" />
          <feGaussianBlur id="feGaussianBlur1" />
          <feFuncR id="feFuncR1" />
          <rect id="shelf_1" />
        </svg>
      `;

      const ids = extractIdsFromSvg(svgContent);

      expect(ids.has('feComponentTransfer1')).toBe(false);
      expect(ids.has('feGaussianBlur1')).toBe(false);
      expect(ids.has('feFuncR1')).toBe(false);
      expect(ids.has('shelf_1')).toBe(true);
    });

    test('handles empty SVG content', () => {
      const ids = extractIdsFromSvg('');
      expect(ids.size).toBe(0);
    });

    test('handles SVG with no IDs', () => {
      const svgContent = '<svg><rect /><circle /></svg>';
      const ids = extractIdsFromSvg(svgContent);
      expect(ids.size).toBe(0);
    });

    test('handles multiple IDs on same line', () => {
      // Note: rect1 is excluded by the pattern /^rect\d+$/
      const svgContent = '<svg><g id="group1"><rect id="shelf_1" /></g></svg>';
      const ids = extractIdsFromSvg(svgContent);
      expect(ids.has('group1')).toBe(true);
      expect(ids.has('shelf_1')).toBe(true);
    });
  });

  describe('isValidSvgCode', () => {
    test('returns false for empty code', () => {
      expect(isValidSvgCode('', '1')).toBe(false);
    });

    test('returns false for empty floor', () => {
      expect(isValidSvgCode('CB_0', '')).toBe(false);
    });

    test('returns false for invalid floor', () => {
      expect(isValidSvgCode('CB_0', '5')).toBe(false);
    });

    test('returns true when cache not loaded (async loading)', () => {
      // When cache is not loaded, function returns true to not block
      // and triggers async loading
      const result = isValidSvgCode('CB_0', '0');
      expect(result).toBe(true);
    });
  });

  describe('getAvailableCodes', () => {
    test('returns empty array for empty floor', () => {
      expect(getAvailableCodes('')).toEqual([]);
    });

    test('returns empty array for invalid floor', () => {
      expect(getAvailableCodes('5')).toEqual([]);
    });

    test('returns empty array when cache not loaded', () => {
      clearCache();
      expect(getAvailableCodes('0')).toEqual([]);
    });
  });

  describe('clearCache', () => {
    test('clears the cache without errors', () => {
      expect(() => clearCache()).not.toThrow();
    });
  });
});
