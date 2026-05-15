// Pure-JS parser; jsdom default is fine (setup.js relies on document)
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { parseSvg } from '../services/svg-shelves.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../lambda/__tests__/fixtures/svg-shelves');

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

describe('parseSvg (client) — parity with server', () => {
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
