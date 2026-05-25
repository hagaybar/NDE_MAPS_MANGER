// Issue #50 redo. Decides whether a staging promote should refresh the Map
// Editor's current floor, and supplies a unique per-promote cache-buster so the
// refetch bypasses the stale CloudFront edge. Kept as its own module so the
// logic is unit-testable and the refresh is STRUCTURALLY forced through the
// caller's full reload (loadFloor) — not the low-level loadFloorSvg that the
// first #50 attempt used (which dropped shelf interactivity).

let _seq = 0;
const _floorCacheBust = {};

/** Unique token per call (Date.now ms + a monotonic counter for same-ms calls). */
export function nextCacheBust() {
  return `${Date.now().toString(36)}-${(_seq++).toString(36)}`;
}

/** The cache-buster currently in effect for a floor, or undefined (initial load). */
export function getFloorCacheBust(floor) {
  return _floorCacheBust[floor];
}

/** Did this promote change the given floor's SVG? Keys look like `maps/floor_1.svg`. */
export function floorChangedInPromote(promotedVersions, floor) {
  if (!promotedVersions || floor == null) return false;
  const suffix = `floor_${floor}.svg`.toLowerCase();
  return Object.keys(promotedVersions).some(k => k.toLowerCase().endsWith(suffix));
}

/**
 * Install the 'svg-promoted' listener.
 * @param {{ getCurrentFloor: () => (number|string|null), reloadFloor: (floor) => any }} deps
 * @returns {() => void} dispose
 */
export function installPromoteRefreshListener({ getCurrentFloor, reloadFloor }) {
  const handler = (e) => {
    const floor = getCurrentFloor();
    if (floor == null) return; // Map Editor never opened — nothing to refresh.
    const promotedVersions = (e.detail && e.detail.promotedVersions) || {};
    if (!floorChangedInPromote(promotedVersions, floor)) return;
    _floorCacheBust[floor] = nextCacheBust();
    reloadFloor(floor);
  };
  document.addEventListener('svg-promoted', handler);
  return () => document.removeEventListener('svg-promoted', handler);
}
