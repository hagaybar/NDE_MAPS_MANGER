/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import { loadFloorSvg } from '../components/map-editor/svg-loader.js';

const FAKE_SVG = '<svg xmlns="http://www.w3.org/2000/svg"><rect id="x"/></svg>';

describe('loadFloorSvg cache-buster', () => {
  let fetchSpy, canvas;
  beforeEach(() => {
    document.body.innerHTML = '<div id="c"></div>';
    canvas = document.getElementById('c');
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true, text: async () => FAKE_SVG });
  });
  afterEach(() => fetchSpy.mockRestore());

  test('appends ?v=<token> when a cacheBust is given', async () => {
    await loadFloorSvg(1, canvas, 'abc123');
    expect(fetchSpy.mock.calls[0][0]).toBe('https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_1.svg?v=abc123');
    expect(fetchSpy.mock.calls[0][1]).toEqual({ cache: 'no-cache' });
  });

  test('omits the query when no cacheBust is given (initial load unchanged)', async () => {
    await loadFloorSvg(2, canvas);
    expect(fetchSpy.mock.calls[0][0]).toBe('https://d3h8i7y9p8lyw7.cloudfront.net/maps/floor_2.svg');
  });
});
