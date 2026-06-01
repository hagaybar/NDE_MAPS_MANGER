/**
 * #91 — the Map Editor's mapping.csv fetch must use cache:'no-cache' so a reload
 * after a CSV re-upload (or reconcile promote) sees fresh data. Regression guard,
 * mirroring csv-editor-cache.test.js / svg-loader.test.js.
 */
import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { fetchMappingCsvText } from '../components/map-editor/csv-loader.js';

describe('map-editor csv-loader (#91 stale-cache guard)', () => {
  let fetchSpy, orig;
  beforeEach(() => {
    orig = global.fetch;
    fetchSpy = jest.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve('a,b\n1,2') });
    global.fetch = fetchSpy;
  });
  afterEach(() => { global.fetch = orig; });

  test('fetches /data/mapping.csv with cache: "no-cache"', async () => {
    await fetchMappingCsvText('https://cf.example');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchSpy.mock.calls[0];
    expect(url).toBe('https://cf.example/data/mapping.csv');
    expect(opts).toEqual({ cache: 'no-cache' });
  });

  test('throws on a non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce({ ok: false, status: 503 });
    await expect(fetchMappingCsvText('https://cf.example')).rejects.toThrow('503');
  });
});
