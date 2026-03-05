/**
 * SVG Parser Service for Primo Maps
 * Parses SVG files to extract element IDs for validation
 * @module services/svg-parser
 */

import { FLOOR_VALUES } from './data-model.js';

/**
 * CloudFront URL for fetching SVG files
 * @constant {string}
 */
const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

/**
 * Cache for parsed SVG element IDs per floor
 * @type {Map<string, Set<string>>}
 */
const svgCodeCache = new Map();

/**
 * Loading state for each floor
 * @type {Map<string, Promise<Set<string>>>}
 */
const loadingPromises = new Map();

/**
 * IDs to exclude from valid codes (SVG internal IDs)
 * @constant {Set<string>}
 */
const EXCLUDED_ID_PATTERNS = [
  /^svg\d+$/,
  /^namedview\d*$/,
  /^defs\d*$/,
  /^pattern\d+$/,
  /^fx\d+$/,
  /^clip\d+$/,
  /^clipPath\d+$/,
  /^fe[A-Z]/,  // feComponentTransfer, feGaussianBlur, etc.
  /^img\d+$/,
  /^use\d+$/,
  /^rect\d+$/,
  /^path\d+$/,
  /^g\d+$/,
  /^text\d+$/,
  /^tspan\d+$/,
  /^false$/
];

/**
 * Checks if an ID should be excluded from valid codes
 * @param {string} id - The element ID to check
 * @returns {boolean} True if the ID should be excluded
 */
function isExcludedId(id) {
  return EXCLUDED_ID_PATTERNS.some(pattern => pattern.test(id));
}

/**
 * Extracts element IDs from SVG content
 * @param {string} svgContent - The SVG file content
 * @returns {Set<string>} Set of element IDs
 */
export function extractIdsFromSvg(svgContent) {
  const ids = new Set();

  // Use regex to extract all id attributes
  const idRegex = /\bid="([^"]+)"/g;
  let match;

  while ((match = idRegex.exec(svgContent)) !== null) {
    const id = match[1];
    if (!isExcludedId(id)) {
      ids.add(id);
    }
  }

  return ids;
}

/**
 * Fetches and parses an SVG file for a specific floor
 * @param {string} floor - The floor number (0, 1, or 2)
 * @returns {Promise<Set<string>>} Set of element IDs in the SVG
 */
export async function fetchAndParseSvg(floor) {
  // Check cache first
  if (svgCodeCache.has(floor)) {
    return svgCodeCache.get(floor);
  }

  // Check if already loading
  if (loadingPromises.has(floor)) {
    return loadingPromises.get(floor);
  }

  // Start loading
  const loadPromise = (async () => {
    try {
      const response = await fetch(`${CLOUDFRONT_URL}/maps/floor_${floor}.svg`);
      if (!response.ok) {
        throw new Error(`Failed to fetch SVG for floor ${floor}: ${response.status}`);
      }

      const svgContent = await response.text();
      const ids = extractIdsFromSvg(svgContent);

      // Cache the result
      svgCodeCache.set(floor, ids);
      loadingPromises.delete(floor);

      return ids;
    } catch (error) {
      console.error(`Error loading SVG for floor ${floor}:`, error);
      loadingPromises.delete(floor);
      // Return empty set on error
      return new Set();
    }
  })();

  loadingPromises.set(floor, loadPromise);
  return loadPromise;
}

/**
 * Preloads SVG files for all floors
 * @returns {Promise<void>}
 */
export async function preloadAllFloors() {
  const promises = FLOOR_VALUES.map(floor => fetchAndParseSvg(floor));
  await Promise.all(promises);
}

/**
 * Checks if an SVG code exists in the specified floor's SVG file
 * @param {string} code - The SVG element ID to check
 * @param {string} floor - The floor number
 * @returns {boolean} True if the code exists (or cache not loaded)
 */
export function isValidSvgCode(code, floor) {
  if (!code || !floor) {
    return false;
  }

  const normalizedFloor = String(floor).trim();
  if (!FLOOR_VALUES.includes(normalizedFloor)) {
    return false;
  }

  // If cache not loaded, return true (don't block)
  if (!svgCodeCache.has(normalizedFloor)) {
    // Trigger async load for future checks
    fetchAndParseSvg(normalizedFloor);
    return true;
  }

  const ids = svgCodeCache.get(normalizedFloor);
  return ids.has(code.trim());
}

/**
 * Gets all available SVG codes for a floor
 * @param {string} floor - The floor number
 * @returns {string[]} Array of available SVG codes (sorted)
 */
export function getAvailableCodes(floor) {
  if (!floor) {
    return [];
  }

  const normalizedFloor = String(floor).trim();
  if (!FLOOR_VALUES.includes(normalizedFloor)) {
    return [];
  }

  if (!svgCodeCache.has(normalizedFloor)) {
    return [];
  }

  const ids = svgCodeCache.get(normalizedFloor);
  return Array.from(ids).sort();
}

/**
 * Gets available codes for a floor asynchronously
 * Ensures SVG is loaded before returning
 * @param {string} floor - The floor number
 * @returns {Promise<string[]>} Array of available SVG codes (sorted)
 */
export async function getAvailableCodesAsync(floor) {
  if (!floor) {
    return [];
  }

  const normalizedFloor = String(floor).trim();
  if (!FLOOR_VALUES.includes(normalizedFloor)) {
    return [];
  }

  const ids = await fetchAndParseSvg(normalizedFloor);
  return Array.from(ids).sort();
}

/**
 * Clears the SVG code cache
 * Useful when SVG files are updated
 */
export function clearCache() {
  svgCodeCache.clear();
  loadingPromises.clear();
}

/**
 * Gets cache status for all floors
 * @returns {Object} Cache status by floor
 */
export function getCacheStatus() {
  const status = {};
  for (const floor of FLOOR_VALUES) {
    status[floor] = {
      loaded: svgCodeCache.has(floor),
      loading: loadingPromises.has(floor),
      codeCount: svgCodeCache.has(floor) ? svgCodeCache.get(floor).size : 0
    };
  }
  return status;
}

/**
 * SVG Parser service singleton
 * @type {Object}
 */
const svgParser = {
  extractIdsFromSvg,
  fetchAndParseSvg,
  preloadAllFloors,
  isValidSvgCode,
  getAvailableCodes,
  getAvailableCodesAsync,
  clearCache,
  getCacheStatus
};

export default svgParser;
