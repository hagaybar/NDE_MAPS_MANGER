// Simple i18n system for bilingual support
const i18n = {
  locale: 'he', // Default to Hebrew
  translations: {},

  async init() {
    const saved = localStorage.getItem('locale');
    this.locale = saved || 'he';
    await this.loadTranslations();
    this.applyDirection();
  },

  async loadTranslations() {
    const [he, en] = await Promise.all([
      fetch('i18n/he.json').then(r => r.json()),
      fetch('i18n/en.json').then(r => r.json())
    ]);
    this.translations = { he, en };
  },

  t(key) {
    const keys = key.split('.');
    let value = this.translations[this.locale];
    for (const k of keys) {
      value = value?.[k];
    }
    return value || key;
  },

  setLocale(locale) {
    this.locale = locale;
    localStorage.setItem('locale', locale);
    this.applyDirection();
    document.dispatchEvent(new CustomEvent('localeChanged'));
  },

  applyDirection() {
    document.documentElement.dir = this.locale === 'he' ? 'rtl' : 'ltr';
    document.documentElement.lang = this.locale;
  },

  isRTL() {
    return this.locale === 'he';
  },

  getLocale() {
    return this.locale;
  }
};

export default i18n;
