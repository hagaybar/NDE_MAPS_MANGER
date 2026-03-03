// Jest test setup for jsdom environment
// This file is loaded after Jest environment is set up

// Mock localStorage
const localStorageMock = {
  store: {},
  getItem(key) {
    return this.store[key] || null;
  },
  setItem(key, value) {
    this.store[key] = value;
  },
  removeItem(key) {
    delete this.store[key];
  },
  clear() {
    this.store = {};
  }
};

Object.defineProperty(global, 'localStorage', { value: localStorageMock });

// Reset DOM before each test
beforeEach(() => {
  document.body.innerHTML = '';
  document.documentElement.dir = 'ltr';
  document.documentElement.lang = 'en';
  localStorageMock.clear();
});
