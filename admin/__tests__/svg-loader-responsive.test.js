/**
 * @jest-environment jsdom
 *
 * Issue #70 — the floor map must fit the viewport without scrolling at default
 * zoom. The production floor SVGs are Inkscape exports with a fixed root size
 * (`width="1040" height="720"`) and NO `viewBox`, so the browser renders them
 * at native size and #map-canvas scrolls. loadFloorSvg makes the injected root
 * <svg> responsive: it ensures a viewBox exists (derived from width/height when
 * missing) and strips the hardcoded width/height so CSS can scale the map to
 * fit its container while preserving aspect ratio.
 */
import { jest } from '@jest/globals';

describe('svg-loader — responsive sizing (issue #70)', () => {
  let loadFloorSvg;
  let fetchSpy;

  beforeEach(async () => {
    jest.resetModules();
    document.body.innerHTML = '<div id="map-canvas"></div>';
    ({ loadFloorSvg } = await import('../components/map-editor/svg-loader.js'));
  });

  afterEach(() => {
    if (fetchSpy) fetchSpy.mockRestore();
  });

  function mockSvg(svgText) {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      headers: { get: () => null },
      text: () => Promise.resolve(svgText),
    });
  }

  test('derives viewBox from width/height and strips them so CSS can size the map', async () => {
    mockSvg('<svg xmlns="http://www.w3.org/2000/svg" width="1040" height="720"><rect id="s1"/></svg>');
    const canvas = document.getElementById('map-canvas');

    const svg = await loadFloorSvg(1, canvas);

    expect(svg.getAttribute('viewBox')).toBe('0 0 1040 720');
    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
  });

  test('keeps an existing viewBox and still strips width/height', async () => {
    mockSvg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600" width="1040" height="720"></svg>');
    const canvas = document.getElementById('map-canvas');

    const svg = await loadFloorSvg(1, canvas);

    expect(svg.getAttribute('viewBox')).toBe('0 0 800 600');
    expect(svg.hasAttribute('width')).toBe(false);
    expect(svg.hasAttribute('height')).toBe(false);
  });

  test('with neither viewBox nor sizing attributes it does not fabricate a viewBox', async () => {
    mockSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect id="s1"/></svg>');
    const canvas = document.getElementById('map-canvas');

    const svg = await loadFloorSvg(1, canvas);

    expect(svg.hasAttribute('viewBox')).toBe(false);
  });
});
