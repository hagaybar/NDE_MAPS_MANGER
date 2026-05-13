/**
 * @jest-environment jsdom
 */
import { jest } from '@jest/globals';

describe('svg-loader', () => {
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

  test('passes cache: "no-cache" so the browser revalidates with the origin', async () => {
    fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: () => Promise.resolve('<svg xmlns="http://www.w3.org/2000/svg"><rect id="x" /></svg>'),
    });
    const canvas = document.getElementById('map-canvas');
    await loadFloorSvg(2, canvas);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toMatch(/\/maps\/floor_2\.svg$/);
    expect(opts).toEqual({ cache: 'no-cache' });
  });
});
