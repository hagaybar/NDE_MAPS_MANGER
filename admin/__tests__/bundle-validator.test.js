// Pure-JS rule; jsdom default is fine (admin setup.js requires jsdom)
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateBundle } from '../services/bundle-validator.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../../lambda/__tests__/fixtures/bundles');

function listFixtures() {
  return readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
}

describe('validateBundle (client) — parity with server', () => {
  for (const file of listFixtures()) {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));
    test(`fixture: ${fixture.name}`, () => {
      const byFloor = {};
      for (const [k, v] of Object.entries(fixture.svgShelfIdsByFloor)) {
        byFloor[Number(k)] = new Set(v);
      }
      const result = validateBundle(fixture.csvRows, byFloor);
      expect(result.ok).toBe(fixture.expected.ok);
      expect(result.errors).toEqual(fixture.expected.errors);
    });
  }
});
