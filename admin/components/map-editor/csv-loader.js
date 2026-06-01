/**
 * Map Editor CSV loader.
 *
 * Fetches the raw mapping.csv text from CloudFront with `cache: 'no-cache'` so a
 * reload after any CSV re-upload sees fresh data. This is the same sticky
 * stale-cache fix documented in CLAUDE.md ("Floor SVG and mapping.csv fetches
 * must use cache: 'no-cache'") — the Map Editor's own CSV fetch was missing it
 * (#91). Extracted from map-editor.js so the cache contract is unit-testable
 * without booting the whole initMapEditor pipeline.
 *
 * @param {string} cloudfrontUrl - CloudFront origin (no trailing slash)
 * @returns {Promise<string>} raw CSV text
 * @throws {Error} on a non-OK HTTP response
 */
export async function fetchMappingCsvText(cloudfrontUrl) {
  const response = await fetch(`${cloudfrontUrl}/data/mapping.csv`, { cache: 'no-cache' });
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }
  return response.text();
}
