/**
 * Regression guard for issue #24.
 *
 * Scans the admin source tree and fails if any file imports
 * `svg-parser.js` or `data-model.js` with a `?v=N` query-string
 * suffix. Different URLs are different ES-module singletons; if
 * these two foundational modules ever get imported under multiple
 * URLs again, validateRow / preloadAllFloors stop sharing cache
 * state and E006 detection becomes unreliable. The first time the
 * orphan panel opens shows the empty state even when orphans
 * exist. See docs/audits/2026-05-12-orphan-panel-audit.md.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'coverage']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('module-import hygiene', () => {
  test('no ?v=N suffix on svg-parser.js or data-model.js imports', () => {
    const files = walk(ADMIN_ROOT);
    const offenders = [];
    const re = /from\s+['"][^'"]*\/(svg-parser|data-model)\.js\?v=\d+['"]/g;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const matches = src.match(re);
      if (matches) {
        offenders.push({
          file: path.relative(ADMIN_ROOT, f),
          matches,
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
