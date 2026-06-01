/**
 * Collections are floor-specific at the Central Library — a collection does not
 * span floors. So the Map Editor's Add/Edit collection dropdown must offer only
 * the collections that live on the shelf's floor, never one from another floor
 * (issue #115).
 *
 * Returns the distinct, sorted collection names present on `floor`. If the floor
 * has none yet (a brand-new/empty floor), falls back to ALL collections so the
 * dropdown can still bootstrap the floor's first range.
 */
export function collectionsForFloor(ranges, floor) {
  const onFloor = ranges
    .filter(r => String(r.floor) === String(floor))
    .map(r => r.collectionName)
    .filter(Boolean);
  const source = onFloor.length
    ? onFloor
    : ranges.map(r => r.collectionName).filter(Boolean);
  return Array.from(new Set(source)).sort();
}
