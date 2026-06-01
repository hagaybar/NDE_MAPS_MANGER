import { readFileSync } from 'fs';

const en = JSON.parse(readFileSync(new URL('../i18n/en.json', import.meta.url), 'utf8'));
const he = JSON.parse(readFileSync(new URL('../i18n/he.json', import.meta.url), 'utf8'));

const get = (obj, path) => path.split('.').reduce((o, k) => (o == null ? o : o[k]), obj);

// Keys the side-panel redesign (Phase 5) renders. Each must resolve to a
// non-empty string in BOTH locales so neither falls back to a raw key path.
const REQUIRED = [
  'mapEditor.idle.hint',
  'mapEditor.idle.nudge',
  'mapEditor.idle.expand',
  'mapEditor.field.from',
  'mapEditor.field.to',
  'mapEditor.field.collection',
  'mapEditor.shelf.header',
  'mapEditor.shelf.count',
  'mapEditor.triage.title',
  'mapEditor.triage.empty',
  'mapEditor.triage.card.wrongSvgCode',
  'mapEditor.triage.card.missingSvgCode',
  'mapEditor.triage.card.setShelf',
  'mapEditor.triage.card.editElsewhere',
  'mapEditor.removeConfirm.title',
  'mapEditor.removeConfirm.body',
  'mapEditor.removeConfirm.confirm',
  'mapEditor.removeConfirm.cancel',
  'mapEditor.warning.startGtEnd',
  'mapEditor.warning.banner',
  'mapEditor.warning.with',
  'mapEditor.warning.overlap',
  'mapEditor.warning.overlapSameShelf',
  'mapEditor.addRange',
  'mapEditor.move',
  'mapEditor.delete',
  'mapEditor.discard',
  'mapEditor.save',
  'mapEditor.reassign.banner.move',
  'mapEditor.reassign.banner.repair',
  'mapEditor.reassign.cancel',
  'mapEditor.reassign.chooseFromList',
  'mapEditor.reassign.moved',
];

describe('Map Editor side-panel i18n keys (#97 Task 5.5)', () => {
  test.each(REQUIRED)('%s is a non-empty string in EN and HE', (path) => {
    const e = get(en, path);
    const h = get(he, path);
    expect(typeof e).toBe('string');
    expect(e.length).toBeGreaterThan(0);
    expect(typeof h).toBe('string');
    expect(h.length).toBeGreaterThan(0);
  });

  test('W1 idle hint matches the owner-approved copy', () => {
    expect(get(en, 'mapEditor.idle.hint')).toBe(
      "To see the range and collection, pick a shelf on the map. At the top of the page you can choose a floor and display style."
    );
  });

  test('shelf header dropped the "{n} ranges" count (W: headline is just the shelf)', () => {
    expect(get(en, 'mapEditor.shelf.header')).toBe('Shelf {label}');
    expect(get(en, 'mapEditor.shelf.header')).not.toContain('{n}');
  });
});
