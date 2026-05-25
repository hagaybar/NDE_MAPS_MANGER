/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { loadFloorSvg, getRenderedEtag } from '../components/map-editor/svg-loader.js';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x"/></svg>';
describe('loadFloorSvg records rendered ETag', () => {
  let canvas;
  beforeEach(() => { document.body.innerHTML = '<div id="c"></div>'; canvas = document.getElementById('c'); });
  test('captures the response ETag for the floor', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true, headers: { get: (h) => (h.toLowerCase() === 'etag' ? '"abc"' : null) }, text: async () => SVG,
    });
    await loadFloorSvg(1, canvas);
    expect(getRenderedEtag(1)).toBe('"abc"');
  });
});
