/**
 * @jest-environment jsdom
 */
import { fillDerivedFields, SINGLE_LIBRARY } from '../components/edit-location-dialog.js';

describe('fillDerivedFields (#117 — Fix dialog completes derived fields on save)', () => {
  const collections = [
    { value: 'CY Yiddish Collection. 2nd floor', nameHe: "CY אוסף מרגוליס, ספרות יידיש. קומה ב'" },
    { value: 'GEN', nameHe: 'כללי' },
  ];

  test('fills an empty single-library name + Hebrew', () => {
    const out = fillDerivedFields(
      { libraryName: '', libraryNameHe: '', collectionName: 'GEN', collectionNameHe: 'g' },
      collections
    );
    expect(out.libraryName).toBe(SINGLE_LIBRARY.name);
    expect(out.libraryNameHe).toBe(SINGLE_LIBRARY.nameHe);
  });

  test('derives collectionNameHe from the chosen collection when empty', () => {
    const out = fillDerivedFields(
      { collectionName: 'CY Yiddish Collection. 2nd floor', collectionNameHe: '' },
      collections
    );
    expect(out.collectionNameHe).toBe("CY אוסף מרגוליס, ספרות יידיש. קומה ב'");
  });

  test('falls back to the English collection name when there is no Hebrew mapping', () => {
    const out = fillDerivedFields({ collectionName: 'UNKNOWN', collectionNameHe: '' }, collections);
    expect(out.collectionNameHe).toBe('UNKNOWN');
  });

  test('does not overwrite values that are already present', () => {
    const out = fillDerivedFields(
      { libraryName: 'Other', libraryNameHe: 'אחר', collectionName: 'GEN', collectionNameHe: 'custom' },
      collections
    );
    expect(out.libraryName).toBe('Other');
    expect(out.libraryNameHe).toBe('אחר');
    expect(out.collectionNameHe).toBe('custom');
  });

  test('row 421 shape becomes complete (the reported case)', () => {
    const row421 = {
      libraryName: 'Sourasky Central Library', libraryNameHe: '',
      collectionName: 'CY Yiddish Collection. 2nd floor', collectionNameHe: '',
      rangeStart: '000', rangeEnd: '333', svgCode: 'CB_0', floor: '0',
    };
    const out = fillDerivedFields(row421, collections);
    expect(out.libraryNameHe).toBe(SINGLE_LIBRARY.nameHe);
    expect(out.collectionNameHe).toBe("CY אוסף מרגוליס, ספרות יידיש. קומה ב'");
  });

  test('returns a new object, does not mutate the input', () => {
    const input = { libraryName: '', libraryNameHe: '', collectionName: 'GEN', collectionNameHe: '' };
    const out = fillDerivedFields(input, collections);
    expect(input.libraryNameHe).toBe('');
    expect(out).not.toBe(input);
  });
});
