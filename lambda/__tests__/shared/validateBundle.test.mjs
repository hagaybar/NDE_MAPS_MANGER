import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { validateBundle } from '../../shared/validateBundle.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FIXTURES_DIR = join(__dirname, '../fixtures/bundles');

function listFixtures() {
  return readdirSync(FIXTURES_DIR).filter(f => f.endsWith('.json'));
}

describe('validateBundle (server)', () => {
  for (const file of listFixtures()) {
    const fixture = JSON.parse(readFileSync(join(FIXTURES_DIR, file), 'utf-8'));
    test(`fixture: ${fixture.name}`, () => {
      // Convert string keys to numbers since CSV floor is numeric
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
