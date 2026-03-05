/**
 * Mock i18n module for testing
 */

const translations = {
  'validation.required': 'This field is required',
  'validation.invalidFormat': 'Invalid format',
  'validation.invalidRange': 'Range start must be less than or equal to range end',
  'validation.invalidFloor': 'Floor must be 0, 1, or 2',
  'validation.rangePrefixMismatch': 'Range start and end must have the same prefix',
  'validation.duplicateKey': 'Duplicate entry',
  'validation.rangeOverlap': 'Range overlaps with another entry',
  'validation.svgCodeNotFound': 'SVG code not found'
};

const i18n = {
  locale: 'en',
  translations: { en: translations, he: {} },

  t(key) {
    return translations[key] || key;
  },

  getLocale() {
    return this.locale;
  },

  setLocale(locale) {
    this.locale = locale;
  },

  isRTL() {
    return this.locale === 'he';
  }
};

export default i18n;
