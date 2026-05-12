/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('indexShelfLocations', () => {
  let indexShelfLocations;

  beforeEach(async () => {
    jest.resetModules();
    ({ indexShelfLocations } = await import('../components/map-editor/location-model.js'));
  });

  function makeSvg(innerHtml) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.innerHTML = innerHtml;
    return svg;
  }

  test('empty SVG returns empty map', () => {
    const svg = makeSvg('');
    const result = indexShelfLocations(svg);
    expect(result).toBeInstanceOf(Map);
    expect(result.size).toBe(0);
  });

  test('null / undefined svgRoot returns empty map', () => {
    expect(indexShelfLocations(null).size).toBe(0);
    expect(indexShelfLocations(undefined).size).toBe(0);
  });

  test('one marked shelf returns one entry', () => {
    const svg = makeSvg('<rect id="shelf_1" data-map-object="shelf" />');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('shelf_1')).toBe(true);
  });

  test('mixed map-object values returns only shelves', () => {
    const svg = makeSvg(`
      <rect id="shelf_a" data-map-object="shelf" />
      <rect id="printer_1" data-map-object="printer" />
      <rect id="shelf_b" data-map-object="shelf" />
      <rect id="lift_1" data-map-object="lift" />
    `);
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(2);
    expect(result.has('shelf_a')).toBe(true);
    expect(result.has('shelf_b')).toBe(true);
    expect(result.has('printer_1')).toBe(false);
    expect(result.has('lift_1')).toBe(false);
  });

  test('marked element without id is skipped', () => {
    const svg = makeSvg('<rect data-map-object="shelf" /><rect id="real" data-map-object="shelf" />');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('real')).toBe(true);
  });

  test('element with id but no marker is skipped', () => {
    const svg = makeSvg('<rect id="unmarked" /><rect id="marked" data-map-object="shelf" />');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('marked')).toBe(true);
    expect(result.has('unmarked')).toBe(false);
  });

  test('marked element nested inside <g> is found', () => {
    const svg = makeSvg('<g><rect id="nested" data-map-object="shelf" /></g>');
    const result = indexShelfLocations(svg);
    expect(result.size).toBe(1);
    expect(result.has('nested')).toBe(true);
  });
});
