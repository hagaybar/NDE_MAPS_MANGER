/** @jest-environment jsdom */
import { jest } from '@jest/globals';
import {
  nextCacheBust, floorChangedInPromote, getFloorCacheBust, installPromoteRefreshListener,
} from '../components/map-editor/promote-refresh.js';

function promote(promotedVersions) {
  document.dispatchEvent(new CustomEvent('svg-promoted', { detail: { promotedVersions, ts: Date.now() } }));
}

describe('promote-refresh', () => {
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

  test('listener reloads the current floor with a fresh buster when that floor changed', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
    promote({ 'maps/floor_1.svg': 'updated' });
    expect(reloadFloor).toHaveBeenCalledWith(1);
    expect(getFloorCacheBust(1)).toBeTruthy();
    dispose();
  });

  test('listener does NOT reload when the promote did not touch the current floor', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
    promote({ 'maps/floor_2.svg': 'updated' });
    expect(reloadFloor).not.toHaveBeenCalled();
    dispose();
  });

  test('listener no-ops when Map Editor was never opened (currentFloor null)', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => null, reloadFloor });
    promote({ 'maps/floor_1.svg': 'updated' });
    expect(reloadFloor).not.toHaveBeenCalled();
    dispose();
  });

  test('dispose removes the listener', () => {
    const reloadFloor = jest.fn();
    const dispose = installPromoteRefreshListener({ getCurrentFloor: () => 1, reloadFloor });
    dispose();
    promote({ 'maps/floor_1.svg': 'updated' });
    expect(reloadFloor).not.toHaveBeenCalled();
  });
});
