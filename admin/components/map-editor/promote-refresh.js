// Issue #50 redo. Decides whether a staging promote should refresh the Map
// Editor's current floor, and supplies a unique per-promote cache-buster so the
// refetch bypasses the stale CloudFront edge. Kept as its own module so the
// logic is unit-testable and the refresh is STRUCTURALLY forced through the
// caller's full reload (loadFloor) — not the low-level loadFloorSvg that the
// first #50 attempt used (which dropped shelf interactivity).

import { getRenderedEtag } from './svg-loader.js';

const CLOUDFRONT_URL = 'https://d3h8i7y9p8lyw7.cloudfront.net';

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

/**
 * Base filenames of the MAP files in a promote, for the SVG Manager thumbnail
 * refresh. `promotedVersions` keys look like `maps/floor_1.svg` and
 * `data/mapping.csv`; only the former have a thumbnail to refetch. Excluding
 * non-`maps/` keys avoids polling `/maps/mapping.csv` (a reconcile promote
 * stages the CSV), which 403s — the CSV lives at `/data/`, not `/maps/`.
 * @param {Object} promotedVersions
 * @returns {string[]} e.g. ['floor_1.svg']
 */
export function changedMapFiles(promotedVersions) {
  if (!promotedVersions) return [];
  return Object.keys(promotedVersions)
    .filter(key => key.startsWith('maps/'))
    .map(key => key.split('/').pop());
}

/** Did this promote change the given floor's SVG? Keys look like `maps/floor_1.svg`. */
export function floorChangedInPromote(promotedVersions, floor) {
  if (!promotedVersions || floor == null) return false;
  const suffix = `floor_${floor}.svg`.toLowerCase();
  return Object.keys(promotedVersions).some(k => k.toLowerCase().endsWith(suffix));
}

/**
 * Poll a URL until its ETag differs from baseline (CloudFront invalidation has
 * propagated), then fire onFresh once. Free-plan path for #50 (no ?v= edge key).
 * @returns {() => void} cancel — stops further polling.
 */
export function pollUntilFresh({ url, baselineEtag, onFresh, intervalMs = 3000, timeoutMs = 60000 }) {
  const started = Date.now();
  let stopped = false;
  const tick = async () => {
    if (stopped) return;
    try {
      const bust = `${url}${url.includes('?') ? '&' : '?'}_=${Date.now()}`; // browser-cache bust only
      const resp = await fetch(bust, { cache: 'reload' });
      const etag = resp && resp.headers && resp.headers.get ? resp.headers.get('etag') : null;
      if (etag && etag !== baselineEtag) { stopped = true; onFresh(); return; }
    } catch (_) { /* transient; keep polling */ }
    if (Date.now() - started >= timeoutMs) { stopped = true; return; }
    setTimeout(tick, intervalMs);
  };
  setTimeout(tick, intervalMs);
  return () => { stopped = true; };
}

/**
 * Install the 'svg-promoted' listener.
 *
 * When the current floor's SVG was part of the promote, poll the bare
 * CloudFront URL until the served ETag differs from the one last rendered
 * (i.e. the promote's invalidation has propagated), then reload the floor with
 * a fresh per-promote cache-buster. The reload happens AFTER the poll detects
 * fresh bytes — not synchronously on the event — so we never re-render the
 * stale edge object.
 * @param {{ getCurrentFloor: () => (number|string|null), reloadFloor: (floor) => any }} deps
 * @returns {() => void} dispose
 */
export function installPromoteRefreshListener({ getCurrentFloor, reloadFloor }) {
  const handler = (e) => {
    const floor = getCurrentFloor();
    if (floor == null) return; // Map Editor never opened — nothing to refresh.
    const promotedVersions = (e.detail && e.detail.promotedVersions) || {};
    if (!floorChangedInPromote(promotedVersions, floor)) return;
    const url = `${CLOUDFRONT_URL}/maps/floor_${floor}.svg`;
    pollUntilFresh({
      url,
      baselineEtag: getRenderedEtag(floor),
      onFresh: () => {
        _floorCacheBust[floor] = nextCacheBust();
        reloadFloor(floor);
      },
    });
  };
  document.addEventListener('svg-promoted', handler);
  return () => document.removeEventListener('svg-promoted', handler);
}
