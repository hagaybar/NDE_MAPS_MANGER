import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseSvg, parseSvgShelfDetails } from '../../shared/svg-shelves.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/svg-shelves');
const DETAILS_DIR = join(FIXTURES_DIR, 'details');

function loadFixture(name) {
  const svg = readFileSync(join(FIXTURES_DIR, `${name}.svg`), 'utf-8');
  const expected = JSON.parse(readFileSync(join(FIXTURES_DIR, `${name}.expected.json`), 'utf-8'));
  return { svg, expected };
}

function listFixtures() {
  return readdirSync(FIXTURES_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace(/\.svg$/, ''));
}

describe('parseSvg (server)', () => {
  for (const name of listFixtures()) {
    test(`fixture: ${name}`, () => {
      const { svg, expected } = loadFixture(name);
      if (expected.throws) {
        expect(() => parseSvg(svg)).toThrow();
      } else {
        const result = parseSvg(svg);
        expect(result.shelves).toEqual(expected.shelves);
        expect(result.duplicates).toEqual(expected.duplicates);
      }
    });
  }
});

function loadDetailsFixture(name) {
  const svg = readFileSync(join(DETAILS_DIR, `${name}.svg`), 'utf-8');
  const expected = JSON.parse(readFileSync(join(DETAILS_DIR, `${name}.expected.json`), 'utf-8'));
  return { svg, expected };
}

function listDetailsFixtures() {
  return readdirSync(DETAILS_DIR)
    .filter(f => f.endsWith('.svg'))
    .map(f => f.replace(/\.svg$/, ''));
}

describe('parseSvgShelfDetails (server)', () => {
  for (const name of listDetailsFixtures()) {
    test(`fixture: ${name}`, () => {
      const { svg, expected } = loadDetailsFixture(name);
      expect(parseSvgShelfDetails(svg)).toEqual(expected);
    });
  }
});
