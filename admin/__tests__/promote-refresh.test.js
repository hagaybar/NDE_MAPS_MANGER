/** @jest-environment jsdom */
import { jest } from '@jest/globals';

function promote(promotedVersions) {
  document.dispatchEvent(new CustomEvent('svg-promoted', { detail: { promotedVersions, ts: Date.now() } }));
}

describe('promote-refresh', () => {
  let nextCacheBust, floorChangedInPromote, getFloorCacheBust, installPromoteRefreshListener, pollUntilFresh, changedMapFiles;

  beforeEach(async () => {
    jest.resetModules();
    ({
      nextCacheBust, floorChangedInPromote, getFloorCacheBust, installPromoteRefreshListener, pollUntilFresh, changedMapFiles,
    } = await import('../components/map-editor/promote-refresh.js'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  test('nextCacheBust returns a unique token each call', () => {
    expect(nextCacheBust()).not.toBe(nextCacheBust());
  });

  test('floorChangedInPromote matches floor_<n>.svg case-insensitively', () => {
    expect(floorChangedInPromote({ 'maps/floor_1.svg': 'updated' }, 1)).toBe(true);
    expect(floorChangedInPromote({ 'maps/Floor_1.SVG': 'updated' }, 1)).toBe(true);
    expect(floorChangedInPromote({ 'maps/floor_2.svg': 'updated' }, 1)).toBe(false);
    expect(floorChangedInPromote({ 'data/mapping.csv': 'updated' }, 1)).toBe(false);
    expect(floorChangedInPromote({}, null)).toBe(false);
  });

  describe('changedMapFiles', () => {
    // Regression for the /maps/mapping.csv 403 spam: a reconcile promote stages
    // the CSV, so promotedVersions includes data/mapping.csv. The thumbnail
    // refresh must poll ONLY map files (under maps/), never the CSV — the CSV
    // has no thumbnail and lives at /data/, so /maps/mapping.csv 403s forever.
    test('returns base names of maps/ files only, excluding the CSV', () => {
      expect(changedMapFiles({ 'maps/floor_1.svg': 'x', 'data/mapping.csv': 'x' })).toEqual(['floor_1.svg']);
    });
    test('keeps multiple maps, drops any non-maps/ key', () => {
      expect(changedMapFiles({ 'maps/floor_0.svg': 'x', 'data/mapping.csv': 'x', 'maps/floor_2.svg': 'x' }))
        .toEqual(['floor_0.svg', 'floor_2.svg']);
    });
    test('a CSV-only promote yields no map polls', () => {
      expect(changedMapFiles({ 'data/mapping.csv': 'x' })).toEqual([]);
    });
    test('empty / nullish input → []', () => {
      expect(changedMapFiles({})).toEqual([]);
      expect(changedMapFiles(null)).toEqual([]);
      expect(changedMapFiles(undefined)).toEqual([]);
    });
  });

  describe('pollUntilFresh', () => {
    test('fires onFresh once when the served ETag changes', async () => {
      jest.useFakeTimers();
      let calls = 0;
      jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => (++calls >= 3 ? '"new"' : '"old"') },
      }));
      const onFresh = jest.fn();
      pollUntilFresh({
        url: 'https://x/maps/floor_1.svg', baselineEtag: '"old"', onFresh, intervalMs: 1000, timeoutMs: 10000,
      });
      await jest.advanceTimersByTimeAsync(5000);
      expect(onFresh).toHaveBeenCalledTimes(1);
      jest.useRealTimers();
    });

    test('does NOT fire onFresh if the ETag never changes before the timeout', async () => {
      jest.useFakeTimers();
      jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => '"old"' },
      }));
      const onFresh = jest.fn();
      pollUntilFresh({
        url: 'https://x/maps/floor_1.svg', baselineEtag: '"old"', onFresh, intervalMs: 1000, timeoutMs: 5000,
      });
      await jest.advanceTimersByTimeAsync(20000);
      expect(onFresh).not.toHaveBeenCalled();
      jest.useRealTimers();
    });

    test('busts the browser cache (cache:reload + _= param) on each poll', async () => {
      jest.useFakeTimers();
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => '"new"' },
      }));
      const onFresh = jest.fn();
      pollUntilFresh({
        url: 'https://x/maps/floor_1.svg', baselineEtag: '"old"', onFresh, intervalMs: 1000, timeoutMs: 10000,
      });
      await jest.advanceTimersByTimeAsync(1000);
      expect(fetchSpy).toHaveBeenCalled();
      const [calledUrl, opts] = fetchSpy.mock.calls[0];
      expect(calledUrl).toMatch(/[?&]_=\d/);
      expect(opts).toEqual(expect.objectContaining({ cache: 'reload' }));
      jest.useRealTimers();
    });

    test('the returned cancel fn stops further polling', async () => {
      jest.useFakeTimers();
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => '"old"' },
      }));
      const onFresh = jest.fn();
      const cancel = pollUntilFresh({
        url: 'https://x/maps/floor_1.svg', baselineEtag: '"old"', onFresh, intervalMs: 1000, timeoutMs: 10000,
      });
      cancel();
      await jest.advanceTimersByTimeAsync(10000);
      expect(fetchSpy).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });

  describe('installPromoteRefreshListener', () => {
    test('reloads the current floor with a fresh buster once the served ETag changes', async () => {
      jest.useFakeTimers();
      let calls = 0;
      jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => (++calls >= 2 ? '"new"' : '"old"') },
      }));
      const reloadFloor = jest.fn();
      const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
      promote({ 'maps/floor_1.svg': 'updated' });
      // Reload should not have happened synchronously — it waits for the poll.
      expect(reloadFloor).not.toHaveBeenCalled();
      await jest.advanceTimersByTimeAsync(10000);
      expect(reloadFloor).toHaveBeenCalledWith(1);
      expect(getFloorCacheBust(1)).toBeTruthy();
      dispose();
      jest.useRealTimers();
    });

    test('does NOT reload when the promote did not touch the current floor', async () => {
      jest.useFakeTimers();
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => '"new"' },
      }));
      const reloadFloor = jest.fn();
      const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
      promote({ 'maps/floor_2.svg': 'updated' });
      await jest.advanceTimersByTimeAsync(10000);
      expect(reloadFloor).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      dispose();
      jest.useRealTimers();
    });

    test('no-ops when Map Editor was never opened (currentFloor null)', async () => {
      jest.useFakeTimers();
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => '"new"' },
      }));
      const reloadFloor = jest.fn();
      const dispose = installPromoteRefreshListener({ getCurrentFloor: () => null, reloadFloor });
      promote({ 'maps/floor_1.svg': 'updated' });
      await jest.advanceTimersByTimeAsync(10000);
      expect(reloadFloor).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      dispose();
      jest.useRealTimers();
    });

    test('dispose removes the listener', async () => {
      jest.useFakeTimers();
      const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async () => ({
        ok: true, headers: { get: () => '"new"' },
      }));
      const reloadFloor = jest.fn();
      const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
      dispose();
      promote({ 'maps/floor_1.svg': 'updated' });
      await jest.advanceTimersByTimeAsync(10000);
      expect(reloadFloor).not.toHaveBeenCalled();
      expect(fetchSpy).not.toHaveBeenCalled();
      jest.useRealTimers();
    });
  });
});
