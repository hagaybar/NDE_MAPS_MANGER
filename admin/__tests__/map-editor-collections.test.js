import { collectionsForFloor } from '../components/map-editor/collections.js';

const rows = [
  { floor: '1', collectionName: 'GEN' },
  { floor: '1', collectionName: 'REF' },
  { floor: '1', collectionName: 'GEN' },     // duplicate on the floor
  { floor: '2', collectionName: 'MUSIC' },
  { floor: '2', collectionName: '' },         // blank — ignored
  { floor: '0', collectionName: 'ARCHIVE' },
];

describe('collectionsForFloor (#115 — collections are floor-specific)', () => {
  test('returns only the floor\'s collections, deduped + sorted', () => {
    expect(collectionsForFloor(rows, '1')).toEqual(['GEN', 'REF']);
    expect(collectionsForFloor(rows, '2')).toEqual(['MUSIC']);
  });

  test('does NOT leak collections from other floors', () => {
    expect(collectionsForFloor(rows, '1')).not.toContain('MUSIC');
    expect(collectionsForFloor(rows, '1')).not.toContain('ARCHIVE');
  });

  test('matches floor loosely (number vs string)', () => {
    expect(collectionsForFloor(rows, 1)).toEqual(['GEN', 'REF']);
  });

  test('falls back to ALL collections when the floor has none yet (bootstrap an empty floor)', () => {
    expect(collectionsForFloor(rows, '9')).toEqual(['ARCHIVE', 'GEN', 'MUSIC', 'REF']);
  });

  test('handles empty input', () => {
    expect(collectionsForFloor([], '1')).toEqual([]);
  });
});
